# PrepMate AI 🎯

> **Practice like it's real. Improve like it's guaranteed.**
> 
> AI-powered campus placement interview preparation platform.
> Developed by: **Sanskar Patel** · Mathematics & Computing · Sem 5 Cornerstone Project

---

## 🗂️ Project Structure

```
prepmate-ai/
├── frontend/         ← Next.js 14 (App Router + TypeScript + Tailwind)
├── backend/          ← FastAPI + Python 3.11
├── database_schema.sql  ← Run this in Supabase SQL Editor
├── PREPMATE AI.docx  ← Original build specification
```

---

## 🚀 Quick Start

> **Windows, fastest path:** double-click `run-prepmate.bat` in the project
> root — it opens the backend (:8000) and frontend (:3000) and launches
> http://localhost:3000. `stop-prepmate.bat` shuts both down.

### 1. Database Setup (Supabase)
1. Go to your [Supabase](https://supabase.com) project → SQL Editor
2. Copy and paste the contents of `database_schema.sql` and run it

### 2. Backend (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env       # Fill in your keys
uvicorn main:app --reload --port 8000
```
Docs available at: http://localhost:8000/docs

### 3. Frontend (Next.js)
```bash
cd frontend
copy .env.local.example .env.local   # Fill in your Supabase keys
npm install
npm run dev
```
App available at: http://localhost:3000

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Secret key (`sb_secret_...`; keep secret!) |
| `JWT_SECRET` | Any long random string |
| `GROQ_API_KEY` | Whisper STT (free tier) — preferred provider |
| `OPENAI_API_KEY` | Whisper fallback (needs paid credit) |
| `GOOGLE_API_KEY` | Gemini LLM evaluation |
| `GEMINI_MODEL` | e.g. `gemini-flash-lite-latest` |
| `INSTITUTION_EMAIL_DOMAIN` | e.g. `mitsgwl.ac.in` |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |
| `DATABASE_URL` | Direct Postgres (tooling/migrations only) |

After `database_schema.sql`, also run `supabase_rls.sql` once — it locks
the tables down to the service key (the browser anon key then reads nothing).

### Frontend (`frontend/.env.local`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_API_URL` | FastAPI URL (default: `http://localhost:8000/api/v1`) |

---

## 🏗️ Architecture

```
Student → Login → Setup Interview → Interview Room
           ↓
    Camera + Mic ON
           ↓
    AI asks question (TTS - SpeechSynthesis)
           ↓
    Student answers by voice
           ↓
    Audio → Whisper STT → transcript
           ↓
    transcript → Gemini 1.5 Flash (structured JSON eval)
           ↓
    Score saved → Adaptive difficulty → Next question
           ↓
    Session End → Report + PRS Dashboard
```

---

## 📊 Milestones

| Milestone | Status |
|-----------|--------|
| M1 — Requirements & Spec | ✅ Done |
| M2 — Architecture & DB | ✅ Done (this init) |
| M3 — Core Build | 🔜 Next |
| M4 — AI Engine | 🔜 Next |
| M5 — Analytics & Deploy | 🔜 Next |

---

## 🌐 Deploy

### Backend (Render / Railway / any host with Python)
1. Set every variable from `backend/.env.example` in the host's env panel.
   Set `CORS_ORIGINS` to your frontend URL(s), comma-separated.
2. Build: `pip install -r backend/requirements.txt`
3. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT --app-dir backend`
4. Health check path: `/health`. Interactive docs: `/docs`.

### Frontend (Vercel)
1. Root directory: `frontend`. Framework preset: Next.js.
2. Env: `NEXT_PUBLIC_API_URL=https://<your-backend>/api/v1`
3. No server-side secrets — the browser only ever holds the public API URL.

---

*PrepMate AI Build Specification v1.0-PrepMate-Sanskar-MilestonePlan*
