"""
PrepMate AI — Auth Router
POST /auth/register  — Register new student
POST /auth/login     — Login + return JWT
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
import bcrypt

from db.database import get_db
from deps import rate_limit
from models.schemas import RegisterRequest, LoginRequest, TokenResponse

router = APIRouter()


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    pwd_bytes = password.encode("utf-8")[:72]
    return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))

def _normalize_email(email: str) -> str:
    """Trim + lower-case so `Stdent@MITSGWL.AC.IN` and `student@mitsgwl.ac.in`
    are the same account (avoids duplicate rows and case-sensitive login
    mismatches after the domain allow-list was introduced)."""
    return (email or "").strip().lower()


# Leading "@" tolerated so `@mitsgwl.ac.in` and `mitsgwl.ac.in` both work.
INSTITUTION_DOMAIN = (
    os.getenv("INSTITUTION_EMAIL_DOMAIN", "mitsgwl.ac.in").strip().lower().lstrip("@")
)
JWT_SECRET = os.getenv("JWT_SECRET", "changeme")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 1440))


def create_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "role": role, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit(10, 60))],
)
async def register(body: RegisterRequest):
    email = _normalize_email(body.email)
    # endswith("@domain") — not `in domain` — so look-alikes such as
    # `student@sub.mitsgwl.ac.in`, `student@evilmitsgwl.ac.in` or a trailing
    # `.evil.com` are rejected. EmailStr already ruled out a double "@".
    if not email.endswith(f"@{INSTITUTION_DOMAIN}"):
        raise HTTPException(
            status_code=400,
            detail=f"Only @{INSTITUTION_DOMAIN} email addresses are allowed.",
        )

    db = get_db()
    # Case-insensitive duplicate check (ilike with no wildcard = ignore case)
    existing = db.table("users").select("user_id").ilike("email", email).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already registered.")

    hashed = hash_password(body.password)
    new_user = {
        "name": body.name,
        "email": email,
        "password_hash": hashed,
        "role": "student",
        "branch": body.branch,
        "batch_year": body.batch_year,
    }
    result = db.table("users").insert(new_user).execute()
    user_id = result.data[0]["user_id"]

    return {"user_id": user_id, "message": "Registered with PrepMate AI"}


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit(10, 60))],
)
async def login(body: LoginRequest):
    email = _normalize_email(body.email)
    db = get_db()
    result = db.table("users").select("*").eq("email", email).execute()
    if not result.data:
        # Rows written before normalization may still hold mixed case.
        result = db.table("users").select("*").ilike("email", email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    user = result.data[0]
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    token = create_token(user["user_id"], user["role"])
    return TokenResponse(token=token, user_id=user["user_id"], role=user["role"])
