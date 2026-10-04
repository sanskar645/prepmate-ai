-- ============================================================
-- PrepMate AI — Database Schema v1.0
-- Run this in your Supabase SQL Editor (once)
-- Developer: Sanskar Patel | Sem 5 Cornerstone Project
-- ============================================================

-- ENUMS
CREATE TYPE user_role AS ENUM ('student', 'admin');
CREATE TYPE interview_type AS ENUM ('hr', 'technical', 'company', 'full');
CREATE TYPE session_status AS ENUM ('in_progress', 'completed', 'abandoned');

-- USERS
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role DEFAULT 'student',
  branch VARCHAR(50),
  batch_year INT,
  bio TEXT DEFAULT NULL,
  avatar_url TEXT DEFAULT NULL,
  banner_url TEXT DEFAULT NULL,
  skills TEXT DEFAULT NULL, -- JSON array of skill strings
  current_prs FLOAT DEFAULT 0 CHECK (current_prs >= 0 AND current_prs <= 100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_user_email ON users(email);

-- QUESTION BANK
CREATE TABLE question_bank (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  interview_type interview_type NOT NULL,
  category VARCHAR(100),
  domain_tag VARCHAR(50),
  difficulty VARCHAR(20) DEFAULT 'medium',
  company_tag VARCHAR(100) DEFAULT NULL,
  added_by UUID REFERENCES users(user_id),
  is_active BOOLEAN DEFAULT TRUE
);

-- INTERVIEW SESSIONS
CREATE TABLE interview_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  interview_type interview_type,
  company_tag VARCHAR(100),
  difficulty VARCHAR(20) DEFAULT 'medium',
  total_questions INT DEFAULT 5,
  time_per_question INT DEFAULT 60, -- answer time limit per question (seconds)
  resume_text TEXT DEFAULT NULL,
  session_score FLOAT DEFAULT 0,
  status session_status DEFAULT 'in_progress',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP
);
CREATE INDEX idx_session_user ON interview_sessions(user_id, started_at DESC);

-- ANSWERS
CREATE TABLE answers (
  answer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES interview_sessions(session_id),
  question_id UUID REFERENCES question_bank(question_id),
  question_text TEXT,
  transcript_text TEXT,
  technical_score INT CHECK (technical_score >= 0 AND technical_score <= 10),
  communication_score INT CHECK (communication_score >= 0 AND communication_score <= 10),
  relevance_score INT CHECK (relevance_score >= 0 AND relevance_score <= 10),
  composite_score FLOAT,
  strengths TEXT,
  improvements TEXT,
  response_time_sec INT,
  -- Presence (body-language) signal, computed on-device in the interview room.
  -- Advisory only: never fused into composite/session scores.
  presence_score FLOAT CHECK (presence_score >= 0 AND presence_score <= 10),
  presence_metrics TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_answer_session ON answers(session_id);

-- SKILL SCORES
CREATE TABLE skill_scores (
  score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  session_id UUID REFERENCES interview_sessions(session_id),
  domain VARCHAR(50),
  score FLOAT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_skill_user_domain ON skill_scores(user_id, domain);

-- RESUME QUESTIONS (per-session generated questions, asked at fixed steps)
CREATE TABLE resume_questions (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES interview_sessions(session_id),
  position INT NOT NULL,
  question_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, position)
);
CREATE INDEX idx_resume_q_session ON resume_questions(session_id, position);

-- PAGE VIEWS (privacy-friendly analytics: path + timestamp only, no identity)
CREATE TABLE page_views (
  view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_page_views_created ON page_views(created_at DESC);

-- ============================================================
-- SEED DATA — Sample Questions (run once)
-- ============================================================
INSERT INTO question_bank (question_text, interview_type, category, domain_tag, difficulty) VALUES
  ('Tell me about yourself.', 'hr', 'Self Introduction', 'communication', 'easy'),
  ('What is the difference between a process and a thread?', 'technical', 'Operating Systems', 'OS', 'medium'),
  ('Explain polymorphism with a real-world example.', 'technical', 'OOPS', 'OOPS', 'medium'),
  ('Why do you want to work at our company?', 'company', 'Motivation', 'communication', 'medium'),
  ('What is a deadlock and how can it be prevented?', 'technical', 'Operating Systems', 'OS', 'medium'),
  ('Explain the difference between stack and queue.', 'technical', 'DSA', 'DSA', 'easy'),
  ('Tell me about a time you worked in a team.', 'hr', 'Behavioural', 'communication', 'easy'),
  ('What is your greatest weakness?', 'hr', 'Self Assessment', 'communication', 'easy'),
  ('Explain normalization in databases.', 'technical', 'DBMS', 'DBMS', 'medium'),
  ('What is Big O notation?', 'technical', 'DSA', 'DSA', 'easy');
