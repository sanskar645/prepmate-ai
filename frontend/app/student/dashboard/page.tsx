"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { formatPRS } from "@/lib/scoring";
import Skeleton from "@/components/Skeleton";
import type { User, SkillVector, InterviewSession } from "@/types";

interface ProfileResponse {
  user: User;
  current_prs: number;
  skill_vector: SkillVector;
}

interface HistoryResponse {
  sessions: InterviewSession[];
  total_pages: number;
}

export default function StudentDashboard() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<ProfileResponse>("/user/profile"),
      apiFetch<HistoryResponse>("/interview/history?page=1&limit=5"),
    ])
      .then(([prof, hist]) => {
        setProfile(prof);
        setSessions(hist.sessions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-12 w-40" />
        </div>
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Skeleton className="h-52" />
          <div className="md:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-3">
          <Skeleton className="h-6 w-44 mb-2" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  const prs = profile?.current_prs ?? 0;
  const prsColor =
    prs >= 75 ? "#22C55E" : prs >= 50 ? "#2563EB" : "#EF4444";

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            Welcome back, {profile?.user.name?.split(" ")[0]}
          </h1>
          <p className="text-[var(--faint)] mt-1 text-sm">
            {profile?.user.branch} · Batch {profile?.user.batch_year}
          </p>
        </div>
        <Link
          href="/student/interview/setup"
          className="bg-[#2563EB] hover:bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Start Interview
        </Link>
      </div>

      {/* PRS Card */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center">
          <p className="text-[var(--faint)] text-sm mb-2">Placement Readiness Score</p>
          <div
            className="text-6xl font-bold mb-2"
            style={{ color: prsColor }}
          >
            {prs.toFixed(1)}
          </div>
          <p className="text-[var(--muted)] text-sm">{formatPRS(prs)}</p>
          <div className="mt-4 bg-[var(--surface-2)] rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-700"
              style={{ width: `${prs}%`, backgroundColor: prsColor }}
            />
          </div>
        </div>

        {/* Skill Vector */}
        <div className="md:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <p className="text-[var(--faint)] text-sm mb-4">Skill Breakdown</p>
          {profile?.skill_vector && Object.keys(profile.skill_vector).length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(profile.skill_vector).map(([domain, score]) => (
                <div key={domain}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[var(--muted)]">{domain}</span>
                    <span className="text-[var(--text)] font-medium">
                      {score !== null ? `${score}/10` : "—"}
                    </span>
                  </div>
                  <div className="bg-[var(--surface-2)] rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-[#2563EB]"
                      style={{ width: score !== null ? `${score * 10}%` : "0%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[var(--faint)] text-sm">
              Complete your first interview to see skill analytics.
            </p>
          )}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Sessions</h2>
          <Link href="/student/history" className="text-[#2563EB] text-sm hover:underline">
            View all
          </Link>
        </div>

        {sessions.length === 0 ? (
          <p className="text-[var(--faint)] text-sm">No interview sessions yet.</p>
        ) : (
          <div className="space-y-3">
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
                    {s.status !== "completed" && (
                      <span
                        className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                          s.status === "in_progress"
                            ? "bg-[#2563EB]/15 text-[#60A5FA]"
                            : "bg-[var(--surface-2)] text-[var(--faint)]"
                        }`}
                      >
                        {s.status === "in_progress" ? "In progress" : "Abandoned"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`text-sm font-semibold ${
                      s.session_score >= 70
                        ? "text-[#22C55E]"
                        : s.session_score >= 50
                        ? "text-[#2563EB]"
                        : "text-[#EF4444]"
                    }`}
                  >
                    {s.session_score.toFixed(1)}
                  </span>
                  <Link
                    href={`/student/interview/report/${s.session_id}`}
                    className="text-[var(--faint)] hover:text-[var(--text)] text-xs underline"
                  >
                    Report
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
