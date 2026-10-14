"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  PersonIcon,
  RefreshIcon,
  WrenchIcon,
} from "@/components/icons";
import type { InterviewSession, Answer } from "@/types";
import Skeleton from "@/components/Skeleton";

interface ReportResponse {
  platform: string;
  session: InterviewSession;
  answers: Answer[];
  analytics: {
    total_answers: number;
    avg_composite: number;
    avg_technical: number;
    avg_communication: number;
    avg_relevance: number;
    avg_presence: number | null;
    integrity: {
      status: string;
      flags: string[];
      statement: string;
    };
  };
}

interface WeakArea {
  area: string;
  kind: string;
  avg_score: number;
}

interface Flashcard {
  front: string;
  back: string;
}

interface FlashcardsResponse {
  platform: string;
  session_id: string;
  weak_areas: WeakArea[];
  cards: Flashcard[];
}

function parsePresenceMetrics(
  raw: string | null | undefined
): { face_ratio?: number; dominant_expression?: string | null; samples?: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export default function InterviewReportPage({
  params,
}: {
  params: { id: string };
}) {
  const sessionId = params.id;
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fc, setFc] = useState<FlashcardsResponse | null>(null);
  const [fcLoading, setFcLoading] = useState(false);
  const [fcError, setFcError] = useState("");
  const [fcIdx, setFcIdx] = useState(0);
  const [fcFlipped, setFcFlipped] = useState(false);
  // Model answers, fetched on demand per question and cached by answer id.
  const [modelAnswers, setModelAnswers] = useState<
    Record<string, { text?: string; loading?: boolean; error?: string }>
  >({});

  async function loadModelAnswer(
    answerId: string,
    questionText: string,
    interviewType: string,
    difficulty: string
  ) {
    if (modelAnswers[answerId]?.text || modelAnswers[answerId]?.loading) return;
    setModelAnswers((prev) => ({ ...prev, [answerId]: { loading: true } }));
    try {
      const res = await apiFetch<{ model_answer: string }>(
        "/interview/model-answer",
        {
          method: "POST",
          body: JSON.stringify({
            question_text: questionText,
            interview_type: interviewType,
            difficulty,
          }),
        }
      );
      setModelAnswers((prev) => ({
        ...prev,
        [answerId]: { text: res.model_answer },
      }));
    } catch (err: unknown) {
      setModelAnswers((prev) => ({
        ...prev,
        [answerId]: {
          error: err instanceof Error ? err.message : "Could not load the answer",
        },
      }));
    }
  }

  async function loadFlashcards() {
    setFcLoading(true);
    setFcError("");
    try {
      const res = await apiFetch<FlashcardsResponse>("/interview/flashcards", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, count: 8 }),
      });
      setFc(res);
      setFcIdx(0);
      setFcFlipped(false);
    } catch (err: unknown) {
      setFcError(err instanceof Error ? err.message : "Could not build flashcards");
    } finally {
      setFcLoading(false);
    }
  }

  useEffect(() => {
    apiFetch<ReportResponse>(`/interview/report/${sessionId}`)
      .then(setReport)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading)
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Skeleton className="h-9 w-72 mb-2" />
        <Skeleton className="h-4 w-52 mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (!report)
    return (
      <div className="text-center py-20 text-[var(--faint)]">Report not found.</div>
    );

  const { session, answers, analytics } = report;

  const scoreColor = (n: number) =>
    n >= 7 ? "#22C55E" : n >= 5 ? "#2563EB" : "#EF4444";

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">
              Interview <span className="text-[#2563EB]">Report</span>
            </h1>
            <p className="text-[var(--faint)] text-sm capitalize">
              {session.interview_type} · {session.difficulty} ·{" "}
              {new Date(session.started_at).toLocaleDateString()}
            </p>
          </div>
          <Link
            href="/student/dashboard"
            className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted)] text-sm px-4 py-2 rounded-xl hover:bg-[var(--border)] transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowLeftIcon size={14} /> Dashboard
          </Link>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        {[
          { label: "Session Score", value: session.session_score?.toFixed(1) ?? "—", highlight: true },
          { label: "Avg Technical", value: analytics.avg_technical.toFixed(1) },
          { label: "Avg Communication", value: analytics.avg_communication.toFixed(1) },
          { label: "Avg Relevance", value: analytics.avg_relevance.toFixed(1) },
          { label: "Questions", value: analytics.total_answers },
          {
            label: "Avg Presence",
            value:
              analytics.avg_presence != null
                ? analytics.avg_presence.toFixed(1)
                : "—",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`bg-[var(--surface)] border rounded-xl p-4 text-center ${
              stat.highlight
                ? "border-[#2563EB]/40"
                : "border-[var(--border)]"
            }`}
          >
            <p
              className={`text-2xl font-bold mb-1 ${
                stat.highlight ? "text-[#2563EB]" : "text-[var(--text)]"
              }`}
            >
              {stat.value}
            </p>
            <p className="text-[var(--faint)] text-xs">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Weak areas + flashcards */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Weak Areas</h2>
            <p className="text-[var(--faint)] text-sm">
              Your lowest averages this session. Study them, then practice again.
            </p>
          </div>
          {!fc && (
            <button
              onClick={loadFlashcards}
              disabled={fcLoading}
              className="shrink-0 bg-[#2563EB] hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              {fcLoading ? "Building..." : "Study flashcards"}
            </button>
          )}
        </div>

        {fcError && (
          <p className="text-[#EF4444] text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 mb-4">
            {fcError}
          </p>
        )}

        {fc && (
          <>
            <div className="flex flex-wrap gap-2 mb-5">
              {fc.weak_areas.map((w) => (
                <span
                  key={`${w.kind}-${w.area}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]"
                >
                  {w.area}{" "}
                  <span className="font-bold" style={{ color: scoreColor(w.avg_score) }}>
                    {w.avg_score.toFixed(1)}
                  </span>
                </span>
              ))}
            </div>

            {fc.cards.length > 0 && (
              <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[var(--faint)] uppercase tracking-wider">
                    Card {fcIdx + 1} of {fc.cards.length}
                  </p>
                  <button
                    onClick={() => setFc(null)}
                    className="text-xs text-[var(--faint)] hover:text-[var(--text)] underline"
                  >
                    Close
                  </button>
                </div>
                <button
                  onClick={() => setFcFlipped((f) => !f)}
                  className="w-full min-h-28 text-left"
                >
                  <p
                    key={`${fcIdx}-${fcFlipped}`}
                    className={fcFlipped ? "text-[15px] leading-relaxed" : "text-lg font-semibold leading-relaxed"}
                  >
                    {fcFlipped ? fc.cards[fcIdx].back : fc.cards[fcIdx].front}
                  </p>
                  <p className="text-xs text-[var(--faint)] mt-3">
                    {fcFlipped ? "Tap to see the prompt" : "Tap to reveal the answer"}
                  </p>
                </button>
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => {
                      setFcIdx((i) => Math.max(i - 1, 0));
                      setFcFlipped(false);
                    }}
                    disabled={fcIdx <= 0}
                    className="bg-[var(--surface)] border border-[var(--border)] text-sm px-4 py-2 rounded-xl disabled:opacity-30 hover:bg-[var(--border)] transition-colors inline-flex items-center gap-1.5"
                  >
                    <ArrowLeftIcon size={14} /> Prev
                  </button>
                  <button
                    onClick={() => {
                      setFcIdx((i) => Math.min(i + 1, fc.cards.length - 1));
                      setFcFlipped(false);
                    }}
                    disabled={fcIdx >= fc.cards.length - 1}
                    className="bg-[var(--surface)] border border-[var(--border)] text-sm px-4 py-2 rounded-xl disabled:opacity-30 hover:bg-[var(--border)] transition-colors inline-flex items-center gap-1.5"
                  >
                    Next <ArrowRightIcon size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Session integrity statement */}
      {analytics.integrity && (
        <div
          className={`border rounded-2xl p-5 mb-8 ${
            analytics.integrity.status === "clean"
              ? "border-[#22C55E]/25 bg-[#22C55E]/[.05]"
              : "border-[#EF4444]/30 bg-[#EF4444]/[.06]"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ${
              analytics.integrity.status === "clean"
                ? "text-[#22C55E]"
                : "text-[#EF4444]"
            }`}
          >
            {analytics.integrity.status === "clean"
              ? "Session integrity · Clean"
              : "Session integrity · Needs review"}
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            {analytics.integrity.statement}
          </p>
        </div>
      )}

      {/* Per-answer breakdown */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Answer Breakdown</h2>
        {answers.map((ans, i) => {
          const strengths = JSON.parse(ans.strengths || "[]") as string[];
          const improvements = JSON.parse(ans.improvements || "[]") as string[];
          const presenceMeta = parsePresenceMetrics(ans.presence_metrics);
          return (
            <div
              key={ans.answer_id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="text-[var(--faint)] text-xs mb-1">
                    Q{i + 1}
                    {ans.response_time_sec != null &&
                      ` · answered in ${ans.response_time_sec}s`}
                  </p>
                  <p className="font-medium">{ans.question_text}</p>
                </div>
                <div className="text-right ml-4">
                  <p
                    className="text-2xl font-bold"
                    style={{ color: scoreColor(ans.composite_score) }}
                  >
                    {ans.composite_score?.toFixed(1)}
                  </p>
                  <p className="text-[var(--faint)] text-xs">composite</p>
                </div>
              </div>

              {ans.transcript_text && (
                <div className="mb-4 bg-[var(--surface)] rounded-xl p-3">
                  <p className="text-[var(--faint)] text-xs mb-1">Your Answer</p>
                  <p className="text-[var(--muted)] text-sm leading-relaxed">
                    {ans.transcript_text}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Technical", score: ans.technical_score },
                  { label: "Communication", score: ans.communication_score },
                  { label: "Relevance", score: ans.relevance_score },
                ].map((dim) => (
                  <div key={dim.label} className="text-center">
                    <p
                      className="text-xl font-bold"
                      style={{ color: scoreColor(dim.score) }}
                    >
                      {dim.score}
                      <span className="text-[var(--faint)] text-sm">/10</span>
                    </p>
                    <p className="text-[var(--faint)] text-xs">{dim.label}</p>
                  </div>
                ))}
              </div>

              {ans.presence_score != null && (
                <p className="text-[var(--faint)] text-xs mb-4 flex items-center gap-1.5">
                  <PersonIcon size={13} /> Presence{" "}
                  <span
                    className="font-bold"
                    style={{ color: scoreColor(ans.presence_score) }}
                  >
                    {ans.presence_score.toFixed(1)}/10
                  </span>
                  {presenceMeta?.dominant_expression && (
                    <span className="text-[var(--faint)]">
                      {" "}
                      · mostly {presenceMeta.dominant_expression}
                    </span>
                  )}
                  {presenceMeta?.face_ratio != null && (
                    <span className="text-[var(--faint)]">
                      {" "}
                      · visible {Math.round(presenceMeta.face_ratio * 100)}% of
                      the time
                    </span>
                  )}
                </p>
              )}

              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-[#22C55E]/5 border border-[#22C55E]/20 rounded-xl p-3">
                  <p className="text-[#22C55E] text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <CheckIcon size={12} /> Strengths
                  </p>
                  <ul className="space-y-1">
                    {strengths.map((s, j) => (
                      <li key={j} className="text-[var(--muted)] text-sm">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-xl p-3">
                  <p className="text-[#EF4444] text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <WrenchIcon size={12} /> Improvements
                  </p>
                  <ul className="space-y-1">
                    {improvements.map((s, j) => (
                      <li key={j} className="text-[var(--muted)] text-sm">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Model answer (study aid, loaded on demand) */}
              <div className="mt-3">
                {modelAnswers[ans.answer_id]?.text ? (
                  <div className="bg-[#2563EB]/[.06] border border-[#2563EB]/25 rounded-xl p-4">
                    <p className="text-[#2563EB] text-xs font-semibold uppercase tracking-wider mb-2">
                      Model answer
                    </p>
                    <p className="text-[var(--muted)] text-sm leading-relaxed">
                      {modelAnswers[ans.answer_id].text}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      loadModelAnswer(
                        ans.answer_id,
                        ans.question_text,
                        session.interview_type,
                        session.difficulty
                      )
                    }
                    disabled={modelAnswers[ans.answer_id]?.loading}
                    className="text-sm font-medium text-[#2563EB] hover:underline disabled:opacity-50"
                  >
                    {modelAnswers[ans.answer_id]?.loading
                      ? "Writing a model answer..."
                      : modelAnswers[ans.answer_id]?.error
                        ? "Retry the model answer"
                        : "Show a model answer for this question"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/student/interview/setup"
          className="bg-[#2563EB] hover:bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl transition-colors inline-flex items-center gap-2"
        >
          Practice Again <RefreshIcon size={16} />
        </Link>
      </div>
    </div>
  );
}
