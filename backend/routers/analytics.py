"""
PrepMate AI — Analytics Router
POST /analytics/pageview — Record one page view (public, rate-limited)
GET  /analytics/views    — 7-day totals + top paths (admin only)

Privacy-friendly by design: path + timestamp only. No user ids, no IPs,
no user agents stored.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from db.database import get_db
from deps import rate_limit, require_admin
from models.schemas import PageViewRequest


router = APIRouter()


@router.post(
    "/pageview",
    status_code=201,
    dependencies=[Depends(rate_limit(60, 60))],
)
async def record_pageview(body: PageViewRequest):
    path = body.path.strip().split("?")[0].split("#")[0] or "/"
    if not path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path.")
    db = get_db()
    db.table("page_views").insert({"path": path[:255]}).execute()
    return {"platform": "PrepMate AI", "recorded": True}


@router.get("/views")
async def pageview_stats(admin: dict = Depends(require_admin)):
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    rows = (
        db.table("page_views")
        .select("path,created_at")
        .gte("created_at", since)
        .limit(10000)
        .execute()
        .data
        or []
    )
    counts: dict[str, int] = {}
    for row in rows:
        path = row.get("path") or "/"
        counts[path] = counts.get(path, 0) + 1
    top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:8]
    return {
        "platform": "PrepMate AI",
        "total_7d": len(rows),
        "top_paths": [{"path": path, "views": n} for path, n in top],
    }
