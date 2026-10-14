"""
PrepMate AI — Pydantic models / schemas.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from enum import Enum


class InterviewType(str, Enum):
    hr = "hr"
    technical = "technical"
    company = "company"
    # Full = personal (HR) + technical mix in one session.
    full = "full"


class Difficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


# ── Auth ──────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2)
    email: EmailStr
    password: str = Field(..., min_length=6)
    branch: Optional[str] = None
    batch_year: Optional[int] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    token: str
    user_id: str
    role: str


# ── Interview ──────────────────────────────────────────────────────────────────
class InterviewStartRequest(BaseModel):
    interview_type: InterviewType
    difficulty: Difficulty = Difficulty.medium
    company_tag: Optional[str] = None
    total_questions: int = Field(default=5, ge=1, le=20)
    # Extracted resume/CV text (from POST /interview/parse-resume). Stored on
    # the session; drives resume-based question slots + evaluation context.
    resume_text: Optional[str] = Field(default=None, max_length=20000)
    # Per-question answer time limit in seconds (anti-cheat timer).
    time_per_question: int = Field(default=60, ge=15, le=300)


class AnswerEvaluation(BaseModel):
    platform: str = "PrepMate AI"
    transcript: str
    technical_score: int
    communication_score: int
    relevance_score: int
    composite_score: float
    feedback: str
    strengths: List[str]
    improvements: List[str]
    next_question: Optional[str] = None


class EndSessionRequest(BaseModel):
    session_id: str


class FlashcardsRequest(BaseModel):
    session_id: str
    count: int = Field(default=8, ge=3, le=12)


class EvaluateRequest(BaseModel):
    session_id: str
    eval_token: str


class ModelAnswerRequest(BaseModel):
    question_text: str = Field(..., min_length=3, max_length=1000)
    interview_type: str = Field(default="technical", max_length=30)
    difficulty: str = Field(default="medium", max_length=20)


class PageViewRequest(BaseModel):
    # Page path only (no query strings, no identity) — privacy by design.
    path: str = Field(..., min_length=1, max_length=255)


class ProfileUpdateRequest(BaseModel):
    bio: Optional[str] = Field(default=None, max_length=500)
    skills: Optional[List[str]] = Field(default=None, max_length=20)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)


# ── Admin ──────────────────────────────────────────────────────────────────────
class QuestionCreate(BaseModel):
    question_text: str
    interview_type: InterviewType
    category: Optional[str] = None
    domain_tag: Optional[str] = None
    difficulty: Difficulty = Difficulty.medium
    company_tag: Optional[str] = None
