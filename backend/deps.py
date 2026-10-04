"""
PrepMate AI — shared auth dependencies.

Single source of truth for every router. Previously each router carried its
own copy of this logic, so a fix in one place silently missed the others.
"""

import os
import time
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

bearer = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET", "changeme")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    # .get(), not [...] — a signed-but-malformed token must 401, not 500.
    user_id = payload.get("sub")
    role = payload.get("role")
    if not user_id or not role:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return {"user_id": user_id, "role": role}


def require_student(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """Interview + profile flows are students-only. Officers watch; they
    don't play: an admin session would pollute practice data and PRS math."""
    user = get_current_user(credentials)
    if user["role"] != "student":
        raise HTTPException(
            status_code=403, detail="Students only — officers use the TPO portal."
        )
    return user


def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    user = get_current_user(credentials)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


# ── Rate limiting (in-memory sliding window, per process) ────────────────────
# Zero-dependency brute-force protection for auth endpoints. Resets on
# restart and isn't shared across workers — proportionate for this scale,
# and documented as such. Use a distributed limiter before multi-replica prod.
_RATE_BUCKETS: dict[str, list[float]] = {}


def rate_limit(max_calls: int, window_seconds: int):
    """Dependency factory: at most max_calls per window, per client IP."""

    async def _check(request: Request):
        host = request.client.host if request.client else "unknown"
        now = time.monotonic()
        hits = [t for t in _RATE_BUCKETS.get(host, []) if now - t < window_seconds]
        if len(hits) >= max_calls:
            raise HTTPException(
                status_code=429, detail="Too many attempts — try again shortly."
            )
        hits.append(now)
        _RATE_BUCKETS[host] = hits

    return _check
