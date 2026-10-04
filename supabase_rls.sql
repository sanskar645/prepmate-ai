-- ============================================================
-- PrepMate AI — Row Level Security (RLS)
-- Run this ONCE in the Supabase SQL Editor, after database_schema.sql
-- ============================================================
--
-- WHY: the frontend ships NEXT_PUBLIC_SUPABASE_ANON_KEY to every browser.
-- With RLS disabled (the default), that public key can read the `users`
-- table — including password_hash — and write to any table.
--
-- The backend authenticates with SUPABASE_SERVICE_KEY (service role), which
-- BYPASSES RLS, so enabling it does not affect the FastAPI app at all.
--
-- Rollback:  DROP POLICY <name> ON <table>; ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
-- ============================================================

-- USERS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_service_only" ON users;
CREATE POLICY "users_service_only" ON users
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- QUESTION BANK
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "question_bank_service_only" ON question_bank;
CREATE POLICY "question_bank_service_only" ON question_bank
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- INTERVIEW SESSIONS
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "interview_sessions_service_only" ON interview_sessions;
CREATE POLICY "interview_sessions_service_only" ON interview_sessions
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ANSWERS
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "answers_service_only" ON answers;
CREATE POLICY "answers_service_only" ON answers
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- SKILL SCORES
ALTER TABLE skill_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "skill_scores_service_only" ON skill_scores;
CREATE POLICY "skill_scores_service_only" ON skill_scores
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- RESUME QUESTIONS
ALTER TABLE resume_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resume_questions_service_only" ON resume_questions;
CREATE POLICY "resume_questions_service_only" ON resume_questions
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- PAGE VIEWS
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "page_views_service_only" ON page_views;
CREATE POLICY "page_views_service_only" ON page_views
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ── Verification ────────────────────────────────────────────────────────────
-- Run this afterwards; every row should show rls=true:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' ORDER BY tablename;
