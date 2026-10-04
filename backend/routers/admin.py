"""
PrepMate AI — Admin Router
GET  /admin/analytics  — Branch/batch analytics + at-risk students
POST /admin/questions  — Bulk add questions (JSON or CSV)
GET  /admin/questions/export — Download the question bank as CSV
"""

import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from typing import List

from db.database import get_db
from deps import require_admin
from models.schemas import QuestionCreate

router = APIRouter()

AT_RISK_THRESHOLD = 40.0  # PRS below this → at-risk


@router.get("/analytics")
async def get_analytics(
    branch: str | None = None,
    batch_year: int | None = None,
    admin: dict = Depends(require_admin),
):
    db = get_db()
    query = db.table("users").select("user_id,name,email,branch,batch_year,current_prs").eq("role", "student")
    if branch:
        query = query.eq("branch", branch)
    if batch_year:
        query = query.eq("batch_year", batch_year)

    res = query.execute()
    students = res.data or []

    def prs_of(student: dict) -> float:
        return student.get("current_prs") or 0.0

    prs_values = [s["current_prs"] for s in students if s.get("current_prs") is not None]
    avg_prs = round(sum(prs_values) / len(prs_values), 2) if prs_values else 0.0

    practised = [s for s in students if prs_of(s) > 0]
    participation_rate = round(len(practised) / max(len(students), 1), 2)
    # At-risk = has practised but still scores low. Students who have never
    # opened an interview are counted separately rather than flagged as failing.
    at_risk = [s for s in practised if prs_of(s) < AT_RISK_THRESHOLD]
    not_started = len(students) - len(practised)

    # Score distribution buckets: 0-20, 21-40, 41-60, 61-80, 81-100
    buckets = [0, 0, 0, 0, 0]
    for prs in prs_values:
        idx = min(int(prs // 20), 4)
        buckets[idx] += 1
    distribution = [
        {"range": "0-20", "count": buckets[0]},
        {"range": "21-40", "count": buckets[1]},
        {"range": "41-60", "count": buckets[2]},
        {"range": "61-80", "count": buckets[3]},
        {"range": "81-100", "count": buckets[4]},
    ]

    return {
        "platform": "PrepMate AI",
        "avg_prs": avg_prs,
        "participation_rate": participation_rate,
        "at_risk_students": at_risk,
        "not_started": not_started,
        "distribution": distribution,
        # Distinct filter values present in the data (drives the dashboard
        # dropdowns — no blind free-text guessing).
        "branches": sorted({s["branch"] for s in students if s.get("branch")}),
        "batch_years": sorted({s["batch_year"] for s in students if s.get("batch_year")}),
    }


VALID_INTERVIEW_TYPES = {"hr", "technical", "company"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}


def _question_row(question: QuestionCreate, admin_id: str) -> dict:
    return {
        "question_text": question.question_text.strip(),
        "interview_type": question.interview_type.value,
        "category": question.category,
        "domain_tag": question.domain_tag,
        "difficulty": question.difficulty.value,
        "company_tag": question.company_tag,
        "added_by": admin_id,
    }


@router.post("/questions", status_code=201)
async def add_questions(
    questions: List[QuestionCreate],
    admin: dict = Depends(require_admin),
):
    """Bulk-add questions from a JSON array (shape posted by the admin UI).

    NOTE: this endpoint used to also declare an UploadFile param, which forces
    FastAPI to parse the body as multipart/form-data — so a JSON array was
    silently dropped and every request failed with 400. CSV now has its own
    endpoint at POST /admin/questions/csv.
    """
    rows = [
        _question_row(q, admin["user_id"])
        for q in questions
        if q.question_text.strip()
    ]
    if not rows:
        raise HTTPException(status_code=400, detail="No questions provided.")

    db = get_db()
    db.table("question_bank").insert(rows).execute()
    return {
        "platform": "PrepMate AI",
        "inserted": len(rows),
        "message": f"{len(rows)} question(s) added.",
    }


@router.post("/questions/csv", status_code=201)
async def add_questions_csv(
    csv_file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    """Bulk-add questions from an uploaded UTF-8 CSV.

    Required column: question_text
    Optional columns: interview_type, category, domain_tag, difficulty, company_tag
    """
    content = await csv_file.read()
    try:
        text = content.decode("utf-8-sig")  # utf-8-sig strips the Excel BOM
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400, detail="CSV file must be UTF-8 encoded."
        )

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "question_text" not in reader.fieldnames:
        raise HTTPException(
            status_code=400,
            detail="CSV must include a 'question_text' header column.",
        )

    rows: list[dict] = []
    skipped = 0
    corrected = 0
    for row in reader:
        question_text = (row.get("question_text") or "").strip()
        if not question_text:
            skipped += 1
            continue

        interview_type = (row.get("interview_type") or "").strip().lower()
        if interview_type not in VALID_INTERVIEW_TYPES:
            if interview_type:
                corrected += 1
            interview_type = "hr"

        difficulty = (row.get("difficulty") or "").strip().lower()
        if difficulty not in VALID_DIFFICULTIES:
            if difficulty:
                corrected += 1
            difficulty = "medium"

        rows.append({
            "question_text": question_text,
            "interview_type": interview_type,
            "category": (row.get("category") or "").strip() or None,
            "domain_tag": (row.get("domain_tag") or "").strip() or None,
            "difficulty": difficulty,
            "company_tag": (row.get("company_tag") or "").strip() or None,
            "added_by": admin["user_id"],
        })

    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV.")

    db = get_db()
    db.table("question_bank").insert(rows).execute()
    return {
        "platform": "PrepMate AI",
        "inserted": len(rows),
        "skipped": skipped,
        "corrected": corrected,
        "message": f"{len(rows)} question(s) added from CSV.",
    }


@router.get("/questions/export")
async def export_questions(
    interview_type: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    company_tag: str | None = Query(default=None),
    admin: dict = Depends(require_admin),
):
    """Download the question bank as a UTF-8 CSV (same columns as the import).

    Optional filters mirror the bank's enums; unknown values are 400 rather
    than silently ignored.
    """
    if interview_type is not None and interview_type not in VALID_INTERVIEW_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"interview_type must be one of {sorted(VALID_INTERVIEW_TYPES)}.",
        )
    if difficulty is not None and difficulty not in VALID_DIFFICULTIES:
        raise HTTPException(
            status_code=400,
            detail=f"difficulty must be one of {sorted(VALID_DIFFICULTIES)}.",
        )

    db = get_db()
    query = (
        db.table("question_bank")
        .select("*")
        .order("created_at")
        .order("question_id")
        .limit(5000)
    )
    if interview_type:
        query = query.eq("interview_type", interview_type)
    if difficulty:
        query = query.eq("difficulty", difficulty)
    if company_tag:
        query = query.eq("company_tag", company_tag)
    rows = query.execute().data or []

    fieldnames = (
        list(rows[0].keys())
        if rows
        else [
            "question_id", "question_text", "interview_type", "category",
            "domain_tag", "difficulty", "company_tag", "is_active",
            "added_by", "created_at",
        ]
    )
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=prepmate_questions.csv"
        },
    )
