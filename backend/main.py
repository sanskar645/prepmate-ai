"""
PrepMate AI — FastAPI Backend
Main entry point: mounts all routers, configures CORS, health check.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# NOTE: load_dotenv() MUST run before the router imports below.
# The routers read secrets (JWT_SECRET, API keys, ...) with os.getenv() at
# module level, so importing them first would leave those reads empty.
load_dotenv()

from routers import auth, user, interview, admin, analytics  # noqa: E402  (after load_dotenv)

app = FastAPI(
    title="PrepMate AI API",
    description="AI-Powered Interview Preparation Platform — Backend API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ────────────────────────────────────────────────────────────────────
# Comma-separated list so staging/prod frontends don't need a code change.
# Local dev default: the Next.js dev server.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router,      prefix="/api/v1/auth",      tags=["Auth"])
app.include_router(user.router,      prefix="/api/v1/user",      tags=["User"])
app.include_router(interview.router, prefix="/api/v1/interview", tags=["Interview"])
app.include_router(admin.router,     prefix="/api/v1/admin",     tags=["Admin"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])


# ── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "PrepMate AI", "version": "v1.0"}


# ── Root ─────────────────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    return {"message": "Welcome to PrepMate AI API", "docs": "/docs"}
