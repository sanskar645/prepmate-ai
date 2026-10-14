"""
PrepMate AI — Interview Router
POST /interview/start   — Start a new session, return first question
POST /interview/answer  — Receive audio blob, run STT+LLM, return evaluation
POST /interview/end     — Finalise session, compute PRS
GET  /interview/history — Paginated session list
GET  /interview/companies — Distinct company tags + counts for setup
GET  /interview/session/{session_id} — Current ask-state (resume/refresh)
POST /interview/parse-resume — Extract text from an uploaded resume/CV
GET  /interview/report/{session_id} — Full report

Question-selection design
-------------------------
`interview_sessions.difficulty` holds the STARTING difficulty and is never
mutated mid-session. The difficulty actually used at step *k* is recomputed by
replaying `next_difficulty()` over the answers already stored, and the question
for that step is resolved by `_resolve_question()` — the single source of
truth shared by `/start`, `/answer` and `/session`:

  step 0            → self-introduction (HR bank, deterministic)
  resume slots 1-2  → per-session resume questions (when a resume was given)
  otherwise         → first row of a stable-ordered bank pool
                      (type/difficulty/company filters, minus asked IDs)

Because every branch is a pure function of what is already persisted,
`/start` and `/answer` always agree on which question was asked — so the
recorded question_id/question_text always matches what the student actually
heard, and no client-supplied state is trusted.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from db.database import get_db
from deps import JWT_SECRET, require_student
from models.schemas import (
    InterviewStartRequest,
    EndSessionRequest,
    FlashcardsRequest,
    EvaluateRequest,
    ModelAnswerRequest,
)
from services.scoring import (
    calc_composite,
    calc_session_score,
    calc_prs,
    next_difficulty,
)
from services.ai_service import (
    transcribe_audio,
    evaluate_answer,
    extract_resume_text,
    generate_resume_questions,
    generate_flashcards,
    generate_model_answer,
)

router = APIRouter()

logger = logging.getLogger("prepmate.interview")


# ── Shared helpers ────────────────────────────────────────────────────────────
def _rows(query) -> list[dict]:
    """Execute a query and always return a list (never None)."""
    return query.execute().data or []


def _one(query) -> dict | None:
    """Fetch at most one row without `.single()`.

    `.single()` makes PostgREST raise PGRST116 when zero rows match, which
    surfaces as a 500 instead of a clean 404/None.
    """
    rows = _rows(query.limit(1))
    return rows[0] if rows else None


def _get_session(db, session_id: str, user_id: str) -> dict:
    """Load a session and enforce ownership (prevents IDOR on report/end)."""
    session = _one(
        db.table("interview_sessions")
        .select("*")
        .eq("session_id", session_id)
        .eq("user_id", user_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


def _answers_for(db, session_id: str) -> list[dict]:
    """Answers for a session in asking order."""
    return _rows(
        db.table("answers")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .order("answer_id")
    )


def _difficulty_sequence(session: dict, answers: list[dict]) -> list[str]:
    """d_0, d_1, ... — the difficulty used at each step (derived, not stored)."""
    sequence = [session["difficulty"]]
    for answer in answers:
        score = answer.get("composite_score")
        sequence.append(
            next_difficulty(0.0 if score is None else score, sequence[-1])
        )
    return sequence


# Steps reserved for resume-based questions when the session has a resume.
# Step 0 is always the self-introduction; resume questions follow it.
RESUME_SLOTS = (1, 2)

INTRO_PATTERNS = (
    "tell me about yourself",
    "introduce yourself",
    "brief introduction",
    "self introduction",
)


def _session_types(session: dict) -> list[str]:
    """Bank interview types this session draws questions from."""
    if session.get("interview_type") == "full":
        # Full interview = personal (HR) + technical mix.
        return ["hr", "technical"]
    return [session["interview_type"]]


def _pool(db, session: dict, difficulty: str, company_tag: str | None,
          exclude_ids: set[str]) -> list[dict]:
    """Active questions of these types/difficulty in a stable, reproducible order."""
    query = (
        db.table("question_bank")
        .select("question_id,question_text,domain_tag")
        .eq("difficulty", difficulty)
        .eq("is_active", True)
        .order("question_id")
        .limit(500)
    )
    types = _session_types(session)
    # Single-type sessions keep the plain equality filter (full interviews
    # use the IN filter for their HR+technical mix).
    if len(types) == 1:
        query = query.eq("interview_type", types[0])
    else:
        query = query.in_("interview_type", types)
    if company_tag:
        query = query.eq("company_tag", company_tag)
    return [row for row in _rows(query) if row["question_id"] not in exclude_ids]


def _pick_question(db, session: dict, difficulty: str, exclude_ids: set[str]) -> dict | None:
    """Next question: preferred difficulty + company tag first, then relax.

    Always returns the FIRST matching row so the choice is deterministic.
    """
    company_tag = session.get("company_tag")
    attempts: list[tuple[str, str | None]] = []
    if company_tag:
        attempts.append((difficulty, company_tag))
    attempts.append((difficulty, None))
    for alternative in ("medium", "easy", "hard"):
        if alternative != difficulty:
            attempts.append((alternative, None))

    for candidate_difficulty, candidate_company in attempts:
        rows = _pool(db, session, candidate_difficulty, candidate_company, exclude_ids)
        if rows:
            return rows[0]
    return None


def _pick_intro(db) -> dict | None:
    """Step-0 question: the self-introduction, deterministic like the rest.

    Prefers an HR question that reads like an introduction; falls back to the
    first active HR question so every session opens the same way.
    """
    rows = _rows(
        db.table("question_bank")
        .select("question_id,question_text,domain_tag")
        .eq("interview_type", "hr")
        .eq("is_active", True)
        .order("question_id")
        .limit(200)
    )
    if not rows:
        return None
    for row in rows:
        text = (row.get("question_text") or "").lower()
        if any(pattern in text for pattern in INTRO_PATTERNS):
            return row
    return rows[0]


def _resume_at(db, session_id: str, step: int) -> dict | None:
    """Resume question stored for this session + step (or None)."""
    rows = _rows(
        db.table("resume_questions")
        .select("question_text")
        .eq("session_id", session_id)
        .eq("position", step)
        .limit(1)
    )
    return rows[0] if rows else None


def _resolve_question(
    db,
    session: dict,
    session_id: str,
    step: int,
    asked_ids: set[str],
    difficulties: list[str],
) -> tuple[str | None, str | None, str | None]:
    """(question_id|None, question_text|None, domain_tag|None) for this step.

    Single source of truth shared by /start, /answer and /session, so the
    asked, recorded and reported question always match. Resume questions
    carry no id and no domain.
    """
    if step == 0:
        intro = _pick_intro(db)
        if intro:
            return intro["question_id"], intro["question_text"], intro.get("domain_tag")
        # No HR intro in the bank — fall through to the normal pool.
    elif session.get("resume_text") and step in RESUME_SLOTS:
        resume_row = _resume_at(db, session_id, step)
        if resume_row:
            # Resume questions live outside the bank: no id, no domain.
            return None, resume_row["question_text"], None
        # Generation failed at /start — fall through to the bank.
    picked = _pick_question(db, session, difficulties[step], asked_ids)
    if not picked:
        return None, None, None
    return picked["question_id"], picked["question_text"], picked.get("domain_tag")


def _average(values: list) -> float:
    """Mean of the non-null values (a real 0 counts, None does not)."""
    present = [v for v in values if v is not None]
    return round(sum(present) / len(present), 2) if present else 0.0


def _parse_presence(
    raw_score: str | None, raw_metrics: str | None
) -> tuple[float | None, str | None]:
    """Presence telemetry is advisory — malformed values are dropped, never 422.

    A scored answer must never be rejected because its body-language sidecar
    was malformed; the LLM evaluation stands on its own.
    """
    score: float | None = None
    if raw_score is not None:
        try:
            score = round(min(10.0, max(0.0, float(raw_score))), 1)
        except (TypeError, ValueError):
            score = None
    metrics: str | None = None
    has_signal = False
    if raw_metrics:
        try:
            parsed = json.loads(raw_metrics)
            if isinstance(parsed, dict):
                try:
                    has_signal = (
                        int(parsed.get("tab_switches") or 0) > 0
                        or int(parsed.get("multi_face_samples") or 0) > 0
                    )
                except (TypeError, ValueError):
                    has_signal = False
                # Only keys the client actually sent (no null-key clutter).
                metrics = json.dumps({
                    key: parsed[key]
                    for key in ("face_ratio", "dominant_expression", "samples",
                                "max_faces", "multi_face_samples", "tab_switches")
                    if key in parsed
                })
        except (TypeError, ValueError):
            metrics = None
    # Metrics survive without a score only when they carry an integrity
    # signal (camera off but tab switched / second person seen). Otherwise
    # an unscored sidecar is meaningless.
    if score is None and not has_signal:
        metrics = None
    return score, metrics


def _parse_response_time(raw: str | None) -> int | None:
    """Seconds spent answering. Advisory like presence — invalid → None."""
    if raw is None:
        return None
    try:
        seconds = int(float(raw))
    except (TypeError, ValueError):
        return None
    return seconds if 0 <= seconds <= 3600 else None


# ── Start Session ─────────────────────────────────────────────────────────────
@router.post("/start")
async def start_interview(
    body: InterviewStartRequest,
    current_user: dict = Depends(require_student),
):
    db = get_db()
    user_id = current_user["user_id"]

    resume_text = (body.resume_text or "").strip()[:15000]
    session = {
        "user_id": user_id,
        "interview_type": body.interview_type.value,
        "company_tag": body.company_tag,
        "difficulty": body.difficulty.value,
        "total_questions": body.total_questions,
        "time_per_question": body.time_per_question,
        "resume_text": resume_text or None,
        "status": "in_progress",
    }

    # Resolve the first question BEFORE creating the session so we never leave
    # an orphan in_progress session with nothing to ask.
    first_id, first_text, _ = _resolve_question(
        db, session, "", 0, set(), [session["difficulty"]]
    )
    if not first_text:
        raise HTTPException(
            status_code=404,
            detail="No questions available for this configuration.",
        )

    s_res = db.table("interview_sessions").insert(session).execute()
    session_id = s_res.data[0]["session_id"]

    # Resume questions are generated once, stored per session + position, and
    # re-derived on every call — never invented live mid-session. Generation
    # is time-boxed: a stalled model must not stall /start, the session
    # simply falls back to bank questions.
    resume_count = 0
    if resume_text and session["total_questions"] > 1:
        slots = [s for s in RESUME_SLOTS if s < session["total_questions"]]
        try:
            questions = await asyncio.wait_for(
                generate_resume_questions(
                    resume_text, session["interview_type"], len(slots)
                ),
                timeout=25.0,
            )
        except (asyncio.TimeoutError, Exception) as e:
            logger.warning("Resume question generation failed (%s) — bank fallback.", e)
            questions = []
        rows = [
            {"session_id": session_id, "position": pos, "question_text": text}
            for pos, text in zip(slots, questions)
        ]
        if rows:
            db.table("resume_questions").insert(rows).execute()
            resume_count = len(rows)

    return {
        "session_id": session_id,
        "platform": "PrepMate AI",
        "first_question": first_id,
        "question_text": first_text,
        "difficulty": session["difficulty"],
        "total_questions": session["total_questions"],
        "time_per_question": session["time_per_question"],
        "resume_questions": resume_count,
    }


# ── Resume parsing ──────────────────────────────────────────────────────────
@router.post("/parse-resume")
async def parse_resume(
    resume: UploadFile = File(...),
    current_user: dict = Depends(require_student),
):
    """Extract text from an uploaded resume/CV (PDF or TXT, max 2 MB).

    Pure extraction — nothing is stored. The setup page sends the returned
    text back inside POST /interview/start.
    """
    try:
        data = await resume.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the uploaded file.")
    try:
        text = extract_resume_text(data, resume.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "platform": "PrepMate AI",
        "filename": resume.filename,
        "char_count": len(text),
        "text": text,
    }


# Eval tokens: HMAC-signed transcripts bridging /transcribe → /evaluate.
# The transcript is visible to the student anyway, but the signature means a
# tampered (perfected) transcript is rejected — the LLM always grades what
# Whisper actually heard, with no server-side state to manage.
EVAL_TOKEN_TTL_SECONDS = 600
SKIPPED_MARKER = "[skipped - time expired]"


def _sign_eval_token(payload: dict) -> str:
    body = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode()
    sig = hmac.new(JWT_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _verify_eval_token(token: str) -> dict | None:
    try:
        body, sig = token.rsplit(".", 1)
    except ValueError:
        return None
    expected = hmac.new(JWT_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body).decode())
    except (TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return payload


def _resolve_current(db, session: dict, session_id: str):
    """Common prelude for answering: answers, step, difficulties, current Q.

    Raises 404/409 exactly like the legacy flow. Returns
    (answers, step, difficulties, asked_ids, current_question dict).
    """
    answers = _answers_for(db, session_id)
    step = len(answers)
    if step >= session["total_questions"]:
        raise HTTPException(
            status_code=409,
            detail="All questions answered — end the session to get your report.",
        )
    difficulties = _difficulty_sequence(session, answers)
    asked_ids = {a["question_id"] for a in answers if a.get("question_id")}
    current_id, current_text, current_domain = _resolve_question(
        db, session, session_id, step, asked_ids, difficulties
    )
    if not current_text:
        raise HTTPException(
            status_code=409,
            detail="No more questions available for this interview configuration.",
        )
    return answers, step, difficulties, asked_ids, {
        "question_id": current_id,
        "question_text": current_text,
        "domain_tag": current_domain,
    }


async def _transcribe_bytes(audio_bytes: bytes | None) -> str:
    """STT for raw audio bytes (with temp-file cleanup). Empty bytes → ""."""
    if not audio_bytes:
        return ""
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        return await transcribe_audio(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


async def _finish_answer(
    db,
    session: dict,
    user_id: str,
    session_id: str,
    step: int,
    difficulties: list[str],
    asked_ids: set[str],
    current_question: dict,
    transcript: str,
    skipped: bool,
    presence: float | None,
    presence_json: str | None,
    response_time: int | None,
) -> dict:
    """Score (or zero-score a skip), persist, and resolve the next question."""
    current_id = current_question["question_id"]

    if skipped:
        # Timer skip: honest zeros, no LLM call, no quota burned.
        evaluation = {
            "technical_score": 0,
            "communication_score": 0,
            "relevance_score": 0,
            "strengths": [],
            "improvements": ["Answer within the time limit"],
        }
        composite = 0.0
    else:
        user_res = _one(
            db.table("users").select("name,branch").eq("user_id", user_id)
        ) or {}
        user_info = user_res or {}
        eval_start = time.monotonic()
        evaluation = await evaluate_answer(
            student_name=user_info.get("name", "Student"),
            branch=user_info.get("branch", ""),
            interview_type=session["interview_type"],
            difficulty=difficulties[step],
            question_text=current_question["question_text"],
            transcript_text=transcript,
            resume_text=session.get("resume_text") or "",
        )
        logger.info("answer evaluation took %.1fs (session %s step %d)",
                    time.monotonic() - eval_start, session_id, step)
        composite = calc_composite(
            evaluation["technical_score"],
            evaluation["communication_score"],
            evaluation["relevance_score"],
        )

    # ── Persist answer ────────────────────────────────────────────────────
    db.table("answers").insert({
        "session_id": session_id,
        "question_id": current_id,
        "question_text": current_question["question_text"],
        "transcript_text": transcript,
        "technical_score": evaluation["technical_score"],
        "communication_score": evaluation["communication_score"],
        "relevance_score": evaluation["relevance_score"],
        "composite_score": composite,
        "strengths": json.dumps(evaluation.get("strengths", [])),
        "improvements": json.dumps(evaluation.get("improvements", [])),
        "presence_score": presence,
        "presence_metrics": presence_json,
        "response_time_sec": response_time,
    }).execute()

    # Skill vector feed (Section 5.5). Resume questions carry no domain.
    domain = current_question.get("domain_tag")
    if domain:
        db.table("skill_scores").insert({
            "user_id": user_id,
            "session_id": session_id,
            "domain": domain,
            "score": composite,
        }).execute()

    # ── Next question ─────────────────────────────────────────────────────
    next_diff = next_difficulty(composite, difficulties[step])
    next_question = None
    if step + 1 < session["total_questions"]:
        _, next_question, _ = _resolve_question(
            db,
            session,
            session_id,
            step + 1,
            asked_ids | ({current_id} if current_id else set()),
            difficulties + [next_diff],
        )

    return {
        "platform": "PrepMate AI",
        "transcript": transcript,
        "technical_score": evaluation["technical_score"],
        "communication_score": evaluation["communication_score"],
        "relevance_score": evaluation["relevance_score"],
        "composite_score": composite,
        "feedback": "",
        "strengths": evaluation.get("strengths", []),
        "improvements": evaluation.get("improvements", []),
        # Echoed advisory signal (null when the camera was off). Kept out of
        # the composite/session scores by design — see lib/presence.ts.
        "presence_score": presence,
        # The next question is resolved, not invented: bank, intro or the
        # stored resume question — so what is spoken, stored and reported
        # always match.
        "next_question": next_question,
        "difficulty": next_diff,
        "questions_answered": step + 1,
        "total_questions": session["total_questions"],
    }


# ── Submit Answer ─────────────────────────────────────────────────────────────
@router.post("/answer")
async def submit_answer(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
    presence_score: str | None = Form(None),
    presence_metrics: str | None = Form(None),
    response_time_sec: str | None = Form(None),
    current_user: dict = Depends(require_student),
):
    db = get_db()
    user_id = current_user["user_id"]

    session = _get_session(db, session_id, user_id)
    if session["status"] != "in_progress":
        raise HTTPException(status_code=409, detail="This session has already ended.")

    answers, step, difficulties, asked_ids, current_question = _resolve_current(
        db, session, session_id
    )

    # ── Transcribe ────────────────────────────────────────────────────────
    stt_start = time.monotonic()
    transcript = await _transcribe_bytes(await audio.read())
    logger.info("answer STT took %.1fs (session %s step %d)",
                time.monotonic() - stt_start, session_id, step)

    if not transcript.strip():
        # Never score silence — that produces confident, meaningless reports.
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not transcribe the audio. "
                "Check the STT keys (GROQ_API_KEY, OPENAI_API_KEY) and "
                "STT_PROVIDER in backend/.env, then try again."
            ),
        )

    presence, presence_json = _parse_presence(presence_score, presence_metrics)
    response_time = _parse_response_time(response_time_sec)

    # Legacy single-call flow (transcribe + evaluate inline). New clients
    # should use /transcribe → /evaluate for staged progress.
    return await _finish_answer(
        db, session, user_id, session_id, step, difficulties, asked_ids,
        current_question, transcript, False,
        presence, presence_json, response_time,
    )


# ── Transcribe (staged step 1) ────────────────────────────────────────────
@router.post("/transcribe")
async def transcribe_step(
    session_id: str = Form(...),
    audio: UploadFile | None = File(None),
    skipped: str = Form("false"),
    presence_score: str | None = Form(None),
    presence_metrics: str | None = Form(None),
    response_time_sec: str | None = Form(None),
    current_user: dict = Depends(require_student),
):
    """Transcribe one answer and return a signed eval token.

    Split from scoring so the room can show the transcript (and a "grading"
    state) instead of one long silence. The token HMAC-signs the transcript,
    so /evaluate grades what Whisper heard — a tampered transcript is
    rejected. Pass skipped=true (no audio) when the answer timer expires:
    the transcript becomes the skip marker and /evaluate zero-scores it
    without spending an LLM call.
    """
    db = get_db()
    user_id = current_user["user_id"]

    session = _get_session(db, session_id, user_id)
    if session["status"] != "in_progress":
        raise HTTPException(status_code=409, detail="This session has already ended.")

    _, step, _, _, current_question = _resolve_current(db, session, session_id)

    is_skipped = skipped.strip().lower() == "true" or audio is None
    if is_skipped:
        transcript = SKIPPED_MARKER
    else:
        stt_start = time.monotonic()
        transcript = await _transcribe_bytes(await audio.read())
        logger.info("transcribe STT took %.1fs (session %s step %d)",
                    time.monotonic() - stt_start, session_id, step)
        if not transcript.strip():
            raise HTTPException(
                status_code=422,
                detail=(
                    "Could not transcribe the audio. "
                    "Check the STT keys (GROQ_API_KEY, OPENAI_API_KEY) and "
                    "STT_PROVIDER in backend/.env, then try again."
                ),
            )

    presence, presence_json = _parse_presence(presence_score, presence_metrics)
    token = _sign_eval_token({
        "session_id": session_id,
        "user_id": user_id,
        "step": step,
        "question_id": current_question["question_id"],
        "question_text": current_question["question_text"],
        "transcript": transcript,
        "response_time": _parse_response_time(response_time_sec),
        "presence": presence,
        "presence_metrics": presence_json,
        "skipped": is_skipped,
        "exp": time.time() + EVAL_TOKEN_TTL_SECONDS,
    })
    return {
        "platform": "PrepMate AI",
        "transcript": transcript,
        "skipped": is_skipped,
        "eval_token": token,
    }


# ── Evaluate (staged step 2) ──────────────────────────────────────────────
@router.post("/evaluate")
async def evaluate_step(
    body: EvaluateRequest,
    current_user: dict = Depends(require_student),
):
    """Score a transcribed answer. Accepts only transcripts signed by /transcribe."""
    db = get_db()
    user_id = current_user["user_id"]

    payload = _verify_eval_token(body.eval_token)
    if (
        not payload
        or payload.get("session_id") != body.session_id
        or payload.get("user_id") != user_id
    ):
        raise HTTPException(
            status_code=422,
            detail="Stale or tampered transcript — record the answer again.",
        )

    session = _get_session(db, body.session_id, user_id)
    if session["status"] != "in_progress":
        raise HTTPException(status_code=409, detail="This session has already ended.")

    # The session must still be on the transcribed step: re-submitting an old
    # token after answering scores nothing twice.
    answers, step, difficulties, asked_ids, current_question = _resolve_current(
        db, session, body.session_id
    )
    if step != payload.get("step"):
        raise HTTPException(
            status_code=409,
            detail="This answer was already scored — continue with the next question.",
        )
    if payload.get("question_id") is not None:
        if current_question["question_id"] != payload["question_id"]:
            raise HTTPException(
                status_code=422,
                detail="Stale or tampered transcript — record the answer again.",
            )
    elif current_question["question_text"] != payload.get("question_text"):
        raise HTTPException(
            status_code=422,
            detail="Stale or tampered transcript — record the answer again.",
        )

    return await _finish_answer(
        db, session, user_id, body.session_id, step, difficulties, asked_ids,
        current_question, payload["transcript"], bool(payload.get("skipped")),
        payload.get("presence"), payload.get("presence_metrics"),
        payload.get("response_time"),
    )


def _session_integrity(answers: list[dict]) -> dict:
    """Proctoring-style signals from stored presence telemetry.

    All advisory, all derived from counts the browser uploaded (no images
    ever leave the device):
    - multi-face samples → possible second person in frame
    - mostly-faceless answers → candidate absent or camera covered
    - tab switches mid-recording → possible lookup on another tab/device
    """
    multi = 0
    empty_answers = 0
    switches = 0
    for a in answers:
        if a.get("transcript_text") == SKIPPED_MARKER:
            continue
        try:
            meta = json.loads(a.get("presence_metrics") or "null")
        except (TypeError, ValueError):
            meta = None
        if not isinstance(meta, dict):
            continue
        try:
            multi += max(0, int(meta.get("multi_face_samples") or 0))
            switches += max(0, int(meta.get("tab_switches") or 0))
        except (TypeError, ValueError):
            pass
        face_ratio = meta.get("face_ratio")
        if isinstance(face_ratio, (int, float)) and face_ratio < 0.5:
            empty_answers += 1
    flags = []
    if multi > 0:
        flags.append(
            f"More than one face visible in {multi} sample(s) — possible second person."
        )
    if empty_answers > 0:
        flags.append(
            f"No face visible for most of {empty_answers} answer(s) — "
            "candidate may have stepped away."
        )
    if switches > 0:
        flags.append(
            f"Left the interview tab {switches} time(s) while answering — "
            "possible lookup elsewhere."
        )
    return {
        "status": "review" if flags else "clean",
        "flags": flags,
        "statement": (
            "Session looks clean: one face throughout, no tab switches."
            if not flags else
            "Something unusual was noticed during this session: " + " ".join(flags)
        ),
    }


# ── End Session ───────────────────────────────────────────────────────────────
@router.post("/end")
async def end_interview(
    body: EndSessionRequest,
    current_user: dict = Depends(require_student),
):
    db = get_db()
    user_id = current_user["user_id"]
    session = _get_session(db, body.session_id, user_id)

    if session["status"] in ("completed", "abandoned"):
        return {
            "session_id": session["session_id"],
            "status": session["status"],
            "session_score": session.get("session_score") or 0.0,
            "report_url": f"/student/interview/report/{session['session_id']}",
            "prs_updated": None,
            "platform": "PrepMate AI",
        }

    answers = _answers_for(db, body.session_id)

    if not answers:
        # Ended before answering anything — abandoned, NOT a zero-score
        # completion. Abandoned sessions are invisible to PRS and averages.
        db.table("interview_sessions").update({
            "status": "abandoned",
            "ended_at": datetime.now(timezone.utc).isoformat(),
        }).eq("session_id", body.session_id).execute()
        return {
            "session_id": body.session_id,
            "status": "abandoned",
            "session_score": 0.0,
            "report_url": f"/student/interview/report/{body.session_id}",
            "prs_updated": None,
            "platform": "PrepMate AI",
        }
    session_score = calc_session_score(answers)

    db.table("interview_sessions").update({
        "status": "completed",
        "session_score": session_score,
        "ended_at": datetime.now(timezone.utc).isoformat(),
    }).eq("session_id", body.session_id).execute()

    # Recalculate PRS across this user's completed sessions (newest last)
    all_sessions = _rows(
        db.table("interview_sessions")
        .select("session_score")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .order("started_at")
        .order("session_id")
    )
    scores = [
        s["session_score"]
        for s in all_sessions
        if s.get("session_score") is not None
    ]
    prs = calc_prs(user_id, scores)
    db.table("users").update({"current_prs": prs}).eq("user_id", user_id).execute()

    return {
        "session_id": body.session_id,
        "status": "completed",
        "session_score": session_score,
        "report_url": f"/student/interview/report/{body.session_id}",
        "prs_updated": prs,
        "integrity": _session_integrity(answers),
        "platform": "PrepMate AI",
    }


# ── Session state (resume / refresh-safe room boot) ──────────────────────────
@router.get("/session/{session_id}")
async def get_session_state(
    session_id: str,
    current_user: dict = Depends(require_student),
):
    """Current ask-state for a session: what to ask at this step.

    Lets the room boot from the server instead of trusting sessionStorage, so
    a refresh or a direct link never strands the student on "Loading...".
    """
    db = get_db()
    session = _get_session(db, session_id, current_user["user_id"])
    answers = _answers_for(db, session_id)
    step = len(answers)

    current_question: str | None = None
    difficulty = session["difficulty"]
    if session["status"] == "in_progress" and step < session["total_questions"]:
        difficulties = _difficulty_sequence(session, answers)
        difficulty = difficulties[step]
        asked_ids = {a["question_id"] for a in answers if a.get("question_id")}
        _, current_question, _ = _resolve_question(
            db, session, session_id, step, asked_ids, difficulties
        )

    return {
        "platform": "PrepMate AI",
        "session": session,
        "questions_answered": step,
        "total_questions": session["total_questions"],
        "current_question": current_question,
        "difficulty": difficulty,
    }


# ── History ───────────────────────────────────────────────────────────────────
@router.get("/history")
async def get_history(
    page: int = 1,
    limit: int = 5,
    current_user: dict = Depends(require_student),
):
    db = get_db()
    page = max(page, 1)
    limit = max(1, min(limit, 50))
    offset = (page - 1) * limit
    res = (
        db.table("interview_sessions")
        .select("*", count="exact")
        .eq("user_id", current_user["user_id"])
        .order("started_at", desc=True)
        .order("session_id", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    total = res.count or 0
    total_pages = -(-total // limit)
    return {"platform": "PrepMate AI", "sessions": res.data or [], "total_pages": total_pages}


# ── Companies ───────────────────────────────────────────────────────────────────
@router.get("/companies")
async def list_companies(
    current_user: dict = Depends(require_student),
):
    """Distinct company_tag values (+ active question counts) for the setup page.

    Lets the student pick a company that actually has bank questions instead of
    typing one blind and silently falling back to generic questions.
    """
    db = get_db()
    rows = _rows(
        db.table("question_bank")
        .select("company_tag")
        .eq("interview_type", "company")
        .eq("is_active", True)
        .limit(1000)
    )
    counts: dict[str, int] = {}
    for row in rows:
        tag = (row.get("company_tag") or "").strip()
        if tag:
            counts[tag] = counts.get(tag, 0) + 1
    companies = [
        {"company_tag": tag, "question_count": count}
        for tag, count in sorted(counts.items(), key=lambda kv: kv[0].lower())
    ]
    return {"platform": "PrepMate AI", "companies": companies}


# ── Report ────────────────────────────────────────────────────────────────────
@router.get("/report/{session_id}")
async def get_report(
    session_id: str,
    current_user: dict = Depends(require_student),
):
    db = get_db()
    session = _get_session(db, session_id, current_user["user_id"])
    answers = _answers_for(db, session_id)

    presence_values = [a.get("presence_score") for a in answers]
    analytics = {
        "total_answers": len(answers),
        "avg_composite": _average([a.get("composite_score") for a in answers]),
        "avg_technical": _average([a.get("technical_score") for a in answers]),
        "avg_communication": _average([a.get("communication_score") for a in answers]),
        "avg_relevance": _average([a.get("relevance_score") for a in answers]),
        # None (not 0.0) when no answer carried a presence signal, so the
        # report can render "—" instead of a misleading zero.
        "avg_presence": (
            _average(presence_values)
            if any(v is not None for v in presence_values)
            else None
        ),
        "integrity": _session_integrity(answers),
    }
    return {
        "platform": "PrepMate AI",
        "session": session,
        "answers": answers,
        "analytics": analytics,
    }


def _weak_areas(db, session_id: str, answers: list[dict]) -> tuple[list[dict], str]:
    """Weakest dimensions + domains for a session.

    Returns (areas, mistakes): areas sorted ascending by average, mistakes as
    newline-joined improvement notes (capped) for the flashcard prompt.
    Pure function of stored rows — deterministic.
    """
    dims = [
        ("Technical", _average([a.get("technical_score") for a in answers])),
        ("Communication", _average([a.get("communication_score") for a in answers])),
        ("Relevance", _average([a.get("relevance_score") for a in answers])),
    ]
    areas = [
        {"area": name, "kind": "dimension", "avg_score": score}
        for name, score in sorted(dims, key=lambda d: d[1])[:2]
    ]

    skill_rows = _rows(
        db.table("skill_scores")
        .select("domain,score")
        .eq("session_id", session_id)
        .limit(500)
    )
    by_domain: dict[str, list[float]] = {}
    for row in skill_rows:
        if row.get("domain") and row.get("score") is not None:
            by_domain.setdefault(row["domain"], []).append(row["score"])
    domain_avgs = sorted(
        ((domain, round(sum(scores) / len(scores), 2))
         for domain, scores in by_domain.items()),
        key=lambda d: d[1],
    )[:2]
    areas += [
        {"area": domain, "kind": "domain", "avg_score": score}
        for domain, score in domain_avgs
    ]

    mistakes: list[str] = []
    for answer in answers:
        try:
            items = json.loads(answer.get("improvements") or "[]")
        except (TypeError, ValueError):
            continue
        for item in items:
            text = str(item).strip()
            if text and text not in mistakes:
                mistakes.append(text)
            if len(mistakes) >= 6:
                break
        if len(mistakes) >= 6:
            break
    return areas, "\n".join(f"- {m}" for m in mistakes)


def _fallback_flashcards(
    areas: list[dict], mistakes: list[str], count: int
) -> list[dict]:
    """Deterministic cards from the session's own notes (LLM failed)."""
    cards: list[dict] = []
    for line in mistakes:
        text = line[2:] if line.startswith("- ") else line
        cards.append({"front": "Fix this in your next answer", "back": text[:200]})
        if len(cards) >= count:
            return cards
    for area in areas:
        cards.append({
            "front": f"How do you improve {area['area']}?",
            "back": (f"Review the report feedback for {area['area']} "
                     f"(averaging {area['avg_score']}/10) and re-answer one "
                     f"question focusing only on it."),
        })
        if len(cards) >= count:
            break
    return cards[:count] if cards else [
        {"front": "What is one thing to improve next session?",
         "back": "Pick your lowest dimension above and answer one question "
                 "focusing only on it."}
    ]


# ── Model answer ────────────────────────────────────────────────────────────
@router.post("/model-answer")
async def model_answer(
    body: ModelAnswerRequest,
    current_user: dict = Depends(require_student),
):
    """One example answer for a report question (study aid, on demand).

    Generated per question so the report stays fast: the frontend fetches
    only the answers the student expands. LLM failure falls back to a
    static study hint instead of a 500.
    """
    text = await generate_model_answer(
        body.question_text, body.interview_type, body.difficulty
    )
    if not text:
        text = (
            "A strong answer names one specific example, explains what you did "
            "and why, and ends with the result. Re-answer this question aloud "
            "in 60 to 90 seconds following that shape."
        )
    return {
        "platform": "PrepMate AI",
        "question_text": body.question_text,
        "model_answer": text,
    }


# ── Flashcards ──────────────────────────────────────────────────────────────@router.post("/flashcards")
async def make_flashcards(
    body: FlashcardsRequest,
    current_user: dict = Depends(require_student),
):
    """Weak areas + revision flashcards for a finished session.

    Weak-area detection is deterministic (lowest dimension/domain averages).
    Card content comes from one Gemini call with a deterministic fallback to
    the session's own improvement notes, so this never 500s on model issues.
    """
    db = get_db()
    session = _get_session(db, body.session_id, current_user["user_id"])
    answers = _answers_for(db, body.session_id)
    if not answers:
        raise HTTPException(
            status_code=400,
            detail="No answers in this session yet — flashcards need at least one.",
        )

    areas, mistakes = _weak_areas(db, body.session_id, answers)
    cards = await generate_flashcards(
        weak_summary=", ".join(
            f"{a['area']} ({a['avg_score']}/10)" for a in areas
        ),
        mistakes=mistakes,
        count=body.count,
    )
    if not cards:
        mistake_lines = mistakes.splitlines() if mistakes else []
        cards = _fallback_flashcards(areas, mistake_lines, body.count)

    return {
        "platform": "PrepMate AI",
        "session_id": body.session_id,
        "interview_type": session.get("interview_type"),
        "weak_areas": areas,
        "cards": cards,
    }
