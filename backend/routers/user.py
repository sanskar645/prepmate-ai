"""
PrepMate AI — User Router
GET /user/profile — Return user profile + PRS + skill vector
PATCH /user/profile — Update bio + skills
POST /user/avatar — Upload profile photo (Supabase Storage)
POST /user/banner — Upload profile banner (Supabase Storage)
POST /user/change-password — Change password (verifies current first)
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
import json
import os

from db.database import get_db
from deps import get_current_user, require_student
from models.schemas import ProfileUpdateRequest, ChangePasswordRequest
from routers.auth import hash_password, verify_password
from services.scoring import get_skill_gap

router = APIRouter()


@router.get("/profile")
async def get_profile(current_user: dict = Depends(require_student)):
    db = get_db()
    user_id = current_user["user_id"]

    # Fetch user
    user_res = db.table("users").select(
        "user_id,name,email,role,branch,batch_year,bio,avatar_url,"
        "banner_url,skills,current_prs,created_at"
    ).eq("user_id", user_id).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found.")
    user = user_res.data[0]
    try:
        user["skills"] = json.loads(user.get("skills") or "[]")
    except (TypeError, ValueError):
        user["skills"] = []

    # Fetch skill scores to compute skill vector
    skill_res = db.table("skill_scores").select("domain,score").eq("user_id", user_id).execute()
    domain_scores: dict[str, list[float]] = {}
    for row in skill_res.data:
        domain_scores.setdefault(row["domain"], []).append(row["score"])
    skill_vector = get_skill_gap(domain_scores)

    return {
        "user": user,
        "current_prs": user["current_prs"],
        "skill_vector": skill_vector,
        "platform": "PrepMate AI",
    }


PROFILE_BUCKET = "profile-media"
PROFILE_MAX_BYTES = 2 * 1024 * 1024
PROFILE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _clean_skills(skills: list[str] | None) -> list[str]:
    """Normalize skill tags: trimmed, deduped, capped."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in skills or []:
        skill = str(raw).strip()[:40]
        if skill and skill.lower() not in seen:
            seen.add(skill.lower())
            cleaned.append(skill)
        if len(cleaned) >= 20:
            break
    return cleaned


@router.patch("/profile")
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: dict = Depends(require_student),
):
    """Update bio + skills (name/email are identity and stay immutable)."""
    db = get_db()
    patch: dict = {}
    if body.bio is not None:
        patch["bio"] = body.bio.strip()
    if body.skills is not None:
        patch["skills"] = json.dumps(_clean_skills(body.skills))
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    res = db.table("users").update(patch).eq(
        "user_id", current_user["user_id"]
    ).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found.")
    user = dict(res.data[0])
    user.pop("password_hash", None)
    try:
        user["skills"] = json.loads(user.get("skills") or "[]")
    except (TypeError, ValueError):
        user["skills"] = []
    return {"platform": "PrepMate AI", "user": user}


async def _store_profile_image(
    db, user_id: str, kind: str, upload: UploadFile
) -> str:
    """Validate + upload avatar/banner, return the public URL."""
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in PROFILE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG and WEBP images are supported.",
        )
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > PROFILE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 2 MB.")
    content_type = (upload.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File is not an image.")

    path = f"{kind}s/{user_id}{ext}"
    try:
        db.storage.from_(PROFILE_BUCKET).upload(
            path, data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed ({e}).")
    try:
        public = db.storage.from_(PROFILE_BUCKET).get_public_url(path)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed ({e}).")

    column = "avatar_url" if kind == "avatar" else "banner_url"
    db.table("users").update({column: public}).eq("user_id", user_id).execute()
    return public


@router.post("/avatar")
async def upload_avatar(
    avatar: UploadFile = File(...),
    current_user: dict = Depends(require_student),
):
    """Upload profile photo. Overwrites the previous one."""
    db = get_db()
    url = await _store_profile_image(db, current_user["user_id"], "avatar", avatar)
    return {"platform": "PrepMate AI", "avatar_url": url}


@router.post("/banner")
async def upload_banner(
    banner: UploadFile = File(...),
    current_user: dict = Depends(require_student),
):
    """Upload profile banner. Overwrites the previous one."""
    db = get_db()
    url = await _store_profile_image(db, current_user["user_id"], "banner", banner)
    return {"platform": "PrepMate AI", "banner_url": url}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    # Deliberately NOT require_student: officers have no profile page, and
    # everyone must be able to rotate a leaked password.
    current_user: dict = Depends(get_current_user),
):
    """Change password after verifying the current one."""
    db = get_db()
    res = db.table("users").select("user_id,password_hash").eq(
        "user_id", current_user["user_id"]
    ).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found.")
    if not verify_password(body.current_password, res.data[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is wrong.")
    db.table("users").update(
        {"password_hash": hash_password(body.new_password)}
    ).eq("user_id", current_user["user_id"]).execute()
    return {"platform": "PrepMate AI", "message": "Password changed."}
