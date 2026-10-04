"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";
import type { InterviewSession } from "@/types";
import Skeleton from "@/components/Skeleton";

interface HistoryResponse {
  platform: string;
  sessions: InterviewSession[];
  total_pages: number;
}

const PAGE_SIZE = 10;

function statusBadge(status: InterviewSession["status"]) {
  if (status === "completed") return null;
  return (
    <span
      className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
        status === "in_progress"
          ? "bg-[#2563EB]/15 text-[#60A5FA]"
          : "bg-[var(--surface-2)] text-[var(--faint)]"
      }`}
    >
      {status === "in_progress" ? "In progress" : "Abandoned"}
    </span>
  );
}

export default function StudentHistoryPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch<HistoryResponse>(`/interview/history?page=${page}&limit=${PAGE_SIZE}`)
      .then((res) => {
        setSessions(res.sessions);
        setTotalPages(Math.max(res.total_pages, 1));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load history")
      )
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">
            Session <span className="text-[#2563EB]">History</span>
          </h1>
          <p className="text-[var(--faint)] text-sm">
            Every interview attempt, newest first.
          </p>
        </div>
        <Link
          href="/student/dashboard"
          className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted)] text-sm px-4 py-2 rounded-xl hover:bg-[var(--border)] transition-colors inline-flex items-center gap-1.5"
        >
          <ArrowLeftIcon size={14} /> Dashboard
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-[76px] w-full" />
          <Skeleton className="h-[76px] w-full" />
          <Skeleton className="h-[76px] w-full" />
        </div>
      ) : error ? (
        <p className="text-[#EF4444] text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-[var(--faint)] text-sm">
          No sessions yet.{" "}
          <Link href="/student/interview/setup" className="text-[#2563EB] hover:underline inline-flex items-center gap-1">
            Start your first interview <ArrowRightIcon size={14} />
          </Link>
        </p>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {sessions.map((s) => (
              <div
                key={s.session_id}
                className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3"
              >
                <div>
                  <p className="font-medium capitalize">
                    {s.interview_type} Interview
                    {s.company_tag ? ` · ${s.company_tag}` : ""}
                  </p>
                  <p className="text-[var(--faint)] text-xs mt-0.5">
                    {new Date(s.started_at).toLocaleDateString()} · {s.difficulty}
                    {statusBadge(s.status)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-[var(--text)]">
                    {s.status === "completed" ? s.session_score.toFixed(1) : "—"}
                  </span>
                  {s.status === "in_progress" ? (
                    <Link
                      href={`/student/interview/room/${s.session_id}`}
                      className="text-[#22C55E] text-xs underline"
                    >
                      Resume
                    </Link>
                  ) : (
                    s.status === "completed" && (
                      <Link
                        href={`/student/interview/report/${s.session_id}`}
                        className="text-[var(--faint)] hover:text-[var(--text)] text-xs underline"
                      >
                        Report
                      </Link>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              className="bg-[var(--surface-2)] border border-[var(--border)] text-sm px-4 py-2 rounded-xl disabled:opacity-30 hover:bg-[var(--border)] transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeftIcon size={14} /> Prev
            </button>
            <span className="text-[var(--faint)] text-sm">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              className="bg-[var(--surface-2)] border border-[var(--border)] text-sm px-4 py-2 rounded-xl disabled:opacity-30 hover:bg-[var(--border)] transition-colors inline-flex items-center gap-1.5"
            >
              Next <ArrowRightIcon size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
