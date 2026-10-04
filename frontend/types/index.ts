// PrepMate AI — Global TypeScript types (Section 7)

export type UserRole = "student" | "admin";
export type InterviewType = "hr" | "technical" | "company" | "full";
export type Difficulty = "easy" | "medium" | "hard";
export type SessionStatus = "in_progress" | "completed" | "abandoned";
export type InterviewPhase =
  | "idle"
  | "ai_speaking"
  | "recording"
  | "transcribing"
  | "grading"
  | "completed";

export interface User {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  branch: string;
  batch_year: number;
  current_prs: number;
  created_at: string;
}

export interface InterviewSession {
  session_id: string;
  user_id: string;
  interview_type: InterviewType;
  company_tag: string | null;
  difficulty: Difficulty;
  total_questions: number;
  session_score: number;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
}

export interface Answer {
  answer_id: string;
  session_id: string;
  question_id: string;
  question_text: string;
  transcript_text: string;
  technical_score: number;
  communication_score: number;
  relevance_score: number;
  composite_score: number;
  strengths: string;
  improvements: string;
  response_time_sec?: number | null;
  presence_score?: number | null;
  presence_metrics?: string | null;
  created_at: string;
}

export interface TranscriptEntry {
  speaker: "AI" | "YOU";
  text: string;
  timestamp: Date;
}

export interface InterviewRoomState {
  sessionId: string;
  phase: InterviewPhase;
  transcript: TranscriptEntry[];
  isRecording: boolean;
  currentQuestion: string;
  timerSeconds: number;
}

export interface SkillVector {
  [domain: string]: number | null;
}

export interface AnswerEvaluation {
  platform: string;
  transcript: string;
  technical_score: number;
  communication_score: number;
  relevance_score: number;
  composite_score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  next_question: string | null;
  // Present on /interview/answer responses; drives the room progress label.
  difficulty?: string;
  questions_answered?: number;
  total_questions?: number;
  skipped?: boolean;
}
