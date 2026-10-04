"""
PrepMate AI — AI Service (Adapter Layer)
Whisper STT (Groq → OpenAI) → Gemini LLM evaluation → Fallback Rubric Scorer

STT provider order is controlled by STT_PROVIDER (default `auto`):
  groq   — whisper-large-v3 on Groq's free tier (preferred)
  openai — whisper-1 on OpenAI (needs credit on the account)
  auto   — try groq first, fall through to openai on failure/emptiness

Uses the unified `google-genai` SDK (google-generativeai reached end of
support on 2025-11-30) and `gemini-2.5-flash` (gemini-1.5-flash is retired
and returns 404 on the live API).
"""

import asyncio
import io
import json
import logging
import os
import re

from google import genai
from google.genai import types
from openai import AsyncOpenAI

logger = logging.getLogger("prepmate.ai")

# google-genai logs an "automatic function calling" recommendation on every
# generate_content call. We never pass tools, so it is pure noise in the logs.
logging.getLogger("google_genai").setLevel(logging.ERROR)

# ── Config ────────────────────────────────────────────────────────────────────
# Clients are resolved from the environment *lazily* on every request instead
# of once at import time: if this module is ever imported before load_dotenv()
# runs, a one-shot import-time read would silently lock in empty keys and the
# pipeline would degrade (STT → "", LLM → rubric scorer) with no obvious cause.
# A missing/empty key still degrades gracefully rather than raising.
openai_client: AsyncOpenAI | None = None
groq_client: AsyncOpenAI | None = None
genai_client: genai.Client | None = None
_resolved_keys: tuple[str, str, str] | None = None

# Probed 2026-09-25 against a free-tier key: gemini-flash-latest / 3.8 / 3.7 /
# 3.6 / 3.5-flash all returned 503 "high demand", gemini-2.5-flash* returned 404
# "not available to new users". The lite alias responds in ~1.4s and tracks the
# current lite model, so it survives future retirements. Override with the
# GEMINI_MODEL env var if your project later gets access to a bigger model.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

# Whisper variants. Groq's large-v3 is the highest-accuracy option they host;
# swap to `whisper-large-v3-turbo` if you want lower latency at some accuracy
# cost. OpenAI's `whisper-1` is the legacy provider and needs paid credit.
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")
OPENAI_STT_MODEL = os.getenv("OPENAI_STT_MODEL", "whisper-1")
STT_PROVIDER = os.getenv("STT_PROVIDER", "auto").strip().lower()
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

SCORE_KEYS = ("technical_score", "communication_score", "relevance_score")

# The Gemini free tier allows 5 generate_content requests per minute per model
# per project, and the API answers 429s with an explicit "retry in Ns" hint.
# Honour that hint (capped) instead of burning the remaining quota on an
# immediate retry.
_RETRY_DELAY_RE = re.compile(r"retry in ([\d.]+)s|retryDelay[\"']:\s*[\"']?(\d+)", re.I)
MAX_RETRY_DELAY_SECONDS = 15.0


def _resolve_clients() -> None:
    """(Re)build the API clients from the current environment."""
    global openai_client, groq_client, genai_client, _resolved_keys
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    google_key = os.getenv("GOOGLE_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if _resolved_keys == (openai_key, google_key, groq_key):
        return
    _resolved_keys = (openai_key, google_key, groq_key)
    openai_client = AsyncOpenAI(api_key=openai_key) if openai_key else None
    genai_client = genai.Client(api_key=google_key) if google_key else None
    # Groq exposes an OpenAI-compatible API, so the same SDK works for both —
    # no extra dependency needed.
    groq_client = (
        AsyncOpenAI(api_key=groq_key, base_url=GROQ_BASE_URL) if groq_key else None
    )


_resolve_clients()

SYSTEM_PROMPT_TEMPLATE = """You are PrepMate AI, an experienced campus placement interviewer.
Evaluate the candidate's answer on exactly 3 dimensions using integers 0 to 10 only:
- technical_score: correctness and depth of technical content
- communication_score: clarity, structure, confidence, grammar
- relevance_score: how directly the answer addresses the question
Also provide exactly 2 strengths, exactly 2 improvements, and exactly 1 next interview question.
Student details:
Name: {student_name}
Branch: {branch}
Target Role: {interview_type}
Difficulty: {difficulty}
Question asked: {question_text}
Candidate transcript: {transcript_text}{resume_block}
Return ONLY a valid JSON object with these exact keys and no extra text:
{{
  "technical_score": int,
  "communication_score": int,
  "relevance_score": int,
  "strengths": ["string", "string"],
  "improvements": ["string", "string"],
  "next_question": "string"
}}
No markdown. No explanations outside JSON."""


# ── STT via Whisper ───────────────────────────────────────────────────────────
async def _whisper_transcribe(client: AsyncOpenAI, model: str, audio_path: str) -> str:
    """One Whisper round-trip against an OpenAI-compatible endpoint."""
    with open(audio_path, "rb") as f:
        response = await client.audio.transcriptions.create(
            model=model,
            file=f,
            response_format="text",
        )
    text = response if isinstance(response, str) else getattr(response, "text", None)
    return (text or "").strip()


def _stt_chain() -> list[tuple[str, AsyncOpenAI | None, str]]:
    """Providers to try, in order, for the current STT_PROVIDER setting."""
    providers = {
        "groq": [("groq", groq_client, GROQ_STT_MODEL)],
        "openai": [("openai", openai_client, OPENAI_STT_MODEL)],
        "auto": [("groq", groq_client, GROQ_STT_MODEL),
                 ("openai", openai_client, OPENAI_STT_MODEL)],
    }
    return providers.get(STT_PROVIDER, providers["auto"])


async def transcribe_audio(audio_path: str) -> str:
    """Transcribe an audio/webm file using Whisper.

    Tries each configured provider in turn and returns "" only when every one
    failed or was unconfigured — callers treat "" as "no usable transcript" and
    refuse to score it, rather than silently grading silence.
    """
    _resolve_clients()
    chain = _stt_chain()

    configured = [name for name, client, _ in chain if client is not None]
    if not configured:
        logger.warning(
            "Whisper STT skipped: no STT key configured (looked for "
            "GROQ_API_KEY and OPENAI_API_KEY, STT_PROVIDER=%s).",
            STT_PROVIDER,
        )
        return ""

    last_error: Exception | None = None
    for name, client, model in chain:
        if client is None:
            logger.info("STT provider %r not configured — skipping.", name)
            continue
        try:
            text = await _whisper_transcribe(client, model, audio_path)
            if text:
                logger.info("STT ok via %s/%s (%d chars).", name, model, len(text))
                return text
            logger.warning("STT provider %r returned an empty transcript.", name)
        except Exception as e:  # noqa: BLE001 — a provider error must not 500
            last_error = e
            logger.warning("STT provider %r failed: %s", name, e)

    logger.warning(
        "All STT providers failed (last error: %s). Returning empty transcript.",
        last_error,
    )
    return ""


# ── LLM Evaluation via Gemini ─────────────────────────────────────────────────
async def evaluate_answer(
    student_name: str,
    branch: str,
    interview_type: str,
    difficulty: str,
    question_text: str,
    transcript_text: str,
    resume_text: str = "",
) -> dict:
    """Evaluate transcript with Gemini. Falls back to rubric scorer."""
    resume_block = ""
    if resume_text.strip():
        snippet = resume_text.strip()[:2000]
        resume_block = (
            "\nCandidate resume (context only — use it to judge whether "
            "project/skill claims check out; be lenient on relevance for "
            f"self-introduction answers):\n{snippet}\n"
        )
    prompt = SYSTEM_PROMPT_TEMPLATE.format(
        student_name=student_name,
        branch=branch,
        interview_type=interview_type,
        difficulty=difficulty,
        question_text=question_text,
        transcript_text=transcript_text,
        resume_block=resume_block,
    )

    delay = 0.0
    for index, temperature in enumerate((0.3, 0.1)):
        result, delay = await _call_gemini(prompt, temperature=temperature)
        if result:
            return result
        # Retry once at a lower temperature, waiting out any server-provided
        # rate-limit hint before the second attempt.
        if index == 0 and delay:
            logger.info("Gemini rate limited — waiting %.0fs before retry", delay)
            await asyncio.sleep(delay)

    # Fallback: keyword rubric scorer
    return _fallback_rubric_scorer(transcript_text, question_text)


async def _gemini_text(prompt: str, temperature: float) -> tuple[str | None, float]:
    """Raw text completion. Returns (text, retry_delay_seconds)."""
    _resolve_clients()
    if genai_client is None:
        logger.warning("Gemini call skipped: GOOGLE_API_KEY is not configured.")
        return None, 0.0
    try:
        response = await genai_client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=temperature,
                response_mime_type="application/json",
            ),
        )
        return (response.text or "").strip(), 0.0
    except Exception as e:
        logger.warning("Gemini (%s) error: %s", GEMINI_MODEL, e)
        return None, _retry_delay(e)


async def _call_gemini_json(prompt: str, temperature: float) -> tuple[dict | None, float]:
    """Gemini call returning a parsed JSON object (or None when unusable)."""
    raw, delay = await _gemini_text(prompt, temperature)
    if not raw:
        return None, delay
    raw = re.sub(r"^```json\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return None, delay
    return (data, delay) if isinstance(data, dict) else (None, delay)


async def _call_gemini(prompt: str, temperature: float) -> tuple[dict | None, float]:
    """Call Gemini, parse the JSON response, and validate it.

    Returns (evaluation, retry_delay_seconds). A non-zero delay means the API
    asked us to wait before retrying (rate limit / quota).
    """
    raw, delay = await _gemini_text(prompt, temperature)
    if not raw:
        return None, delay
    raw = re.sub(r"^```json\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return _normalise_evaluation(json.loads(raw)), 0.0
    except (TypeError, ValueError):
        return None, delay


def _retry_delay(error: Exception) -> float:
    """Extract the API's 'retry in Ns' hint from an error, capped at 15s."""
    match = _RETRY_DELAY_RE.search(str(error))
    if not match:
        return 0.0
    value = next((group for group in match.groups() if group), None)
    try:
        return min(float(value), MAX_RETRY_DELAY_SECONDS)
    except (TypeError, ValueError):
        return 0.0


def _normalise_evaluation(data: object) -> dict | None:
    """Validate and clamp model output so a bad value can't trip the DB CHECKs.

    Returns None when the payload is unusable → the caller retries, then falls
    back to the rubric scorer.
    """
    if not isinstance(data, dict):
        return None

    evaluation: dict = {}
    for key in SCORE_KEYS:
        if key not in data:
            return None
        try:
            value = int(round(float(data[key])))
        except (TypeError, ValueError):
            return None
        evaluation[key] = max(0, min(10, value))

    for key in ("strengths", "improvements"):
        items = data.get(key)
        if not isinstance(items, list):
            return None
        evaluation[key] = [str(item).strip() for item in items if str(item).strip()]

    next_question = data.get("next_question")
    evaluation["next_question"] = str(next_question).strip() if next_question else ""

    return evaluation


def _fallback_rubric_scorer(transcript: str, question: str) -> dict:
    """Keyword + length + filler detection fallback rubric scorer."""
    words = transcript.lower().split()
    fillers = {"um", "uh", "like", "you know", "basically", "literally"}
    filler_count = sum(1 for w in words if w in fillers)
    length_score = min(10, len(words) // 10)  # every 10 words → 1 point (max 10)
    filler_penalty = min(3, filler_count)
    communication = max(1, length_score - filler_penalty)

    # Simple keyword overlap relevance
    q_words = set(question.lower().split())
    overlap = len(q_words & set(words))
    relevance = min(10, overlap * 2)

    technical = max(1, (communication + relevance) // 2)

    return {
        "technical_score": technical,
        "communication_score": communication,
        "relevance_score": relevance,
        "strengths": ["Provided a response", "Showed effort"],
        "improvements": ["Add more technical depth", "Reduce filler words"],
        "next_question": "Can you elaborate further on your previous answer?",
    }


# ── Resume / CV ─────────────────────────────────────────────────────────────
RESUME_MAX_BYTES = 2 * 1024 * 1024
RESUME_MAX_CHARS = 15000
RESUME_EXTENSIONS = {".pdf", ".txt"}
RESUME_MIN_CHARS = 50


def extract_resume_text(data: bytes, filename: str) -> str:
    """Extract plain text from an uploaded resume (PDF or TXT).

    Raises ValueError with a user-facing message when the file is unusable.
    Never raises on PDF internals — those map to ValueError too.
    """
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in RESUME_EXTENSIONS:
        raise ValueError("Only PDF and TXT resumes are supported.")
    if not data:
        raise ValueError("Empty file — please upload your resume again.")
    if len(data) > RESUME_MAX_BYTES:
        raise ValueError("Resume must be under 2 MB.")

    if ext == ".txt":
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise ValueError("TXT resume must be UTF-8 encoded.")
    else:
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise ValueError("Encrypted PDFs are not supported.")
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Could not read that PDF ({e}).")

    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < RESUME_MIN_CHARS:
        raise ValueError(
            "No readable text found — a scanned image needs OCR first."
        )
    return text[:RESUME_MAX_CHARS]


RESUME_QUESTIONS_PROMPT = """You are PrepMate AI, an experienced campus placement interviewer.
Read this candidate resume and write exactly {count} interview questions about it.
Candidate resume:
{resume}
Rules:
- Each question must reference something specific on the resume (a project, skill, internship, or achievement).
- No generic questions the resume cannot answer.
- Each question 200 characters or fewer, plain text, no numbering.
Interview type: {interview_type}
Return ONLY a valid JSON object: {{ "questions": ["...", ...] }}"""


async def generate_resume_questions(
    resume_text: str, interview_type: str, count: int
) -> list[str]:
    """Generate resume-specific questions (single attempt, no retry).

    Non-critical path: any failure returns [] and the session falls back to
    bank questions, so this never blocks or breaks /start.
    """
    if not resume_text.strip() or count <= 0:
        return []
    prompt = RESUME_QUESTIONS_PROMPT.format(
        count=count,
        interview_type=interview_type,
        resume=resume_text.strip()[:4000],
    )
    data, _ = await _call_gemini_json(prompt, temperature=0.5)
    if not data:
        return []
    raw = data.get("questions")
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    questions: list[str] = []
    for item in raw:
        text = str(item).strip() if item else ""
        if text and len(text) <= 500 and text.lower() not in seen:
            seen.add(text.lower())
            questions.append(text)
        if len(questions) >= count:
            break
    return questions


FLASHCARDS_PROMPT = """You are PrepMate AI, a campus placement coach.
This student is weak in: {areas}.
Their recurring mistakes this session:
{mistakes}
Write exactly {count} revision flashcards.
Rules:
- "front" is a crisp question or term (100 characters or fewer).
- "back" is the answer or fix (200 characters or fewer).
- Cover the weak areas above; no numbering; plain text only.
Return ONLY a valid JSON object: {{ "cards": [{{ "front": "...", "back": "..." }}] }}"""


async def generate_flashcards(
    weak_summary: str, mistakes: str, count: int
) -> list[dict]:
    """Generate revision flashcards (single attempt, no retry).

    Non-critical path: any failure returns [] and the caller falls back to
    cards built from the session's own improvement notes.
    """
    if count <= 0:
        return []
    prompt = FLASHCARDS_PROMPT.format(
        areas=weak_summary or "general interview skills",
        mistakes=mistakes or "none recorded",
        count=count,
    )
    data, _ = await _call_gemini_json(prompt, temperature=0.5)
    if not data:
        return []
    raw = data.get("cards")
    if not isinstance(raw, list):
        return []
    cards: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        front = str(item.get("front") or "").strip()
        back = str(item.get("back") or "").strip()
        if front and back and len(front) <= 150 and len(back) <= 300:
            cards.append({"front": front, "back": back})
        if len(cards) >= count:
            break
    return cards
