"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUpload } from "@/lib/api";
import type { InterviewType, Difficulty } from "@/types";
import {
  BuildingIcon,
  CodeIcon,
  LayersIcon,
  MicIcon,
  UploadIcon,
  UsersIcon,
} from "@/components/icons";
import type { ReactNode } from "react";

interface CompanyOption {
  company_tag: string;
  question_count: number;
}

export default function InterviewSetupPage() {
  const router = useRouter();
  const [form, setForm] = useState<{
    interview_type: InterviewType;
    difficulty: Difficulty;
    company_tag: string;
    total_questions: number;
    time_per_question: number;
  }>({
    interview_type: "technical",
    difficulty: "medium",
    company_tag: "",
    total_questions: 5,
    time_per_question: 60,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [resume, setResume] = useState<{
    filename: string;
    text: string;
    char_count: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Companies that actually have bank questions — fetched only when relevant.
  useEffect(() => {
    if (form.interview_type !== "company") return;
    setCompaniesLoading(true);
    apiFetch<{ companies: CompanyOption[] }>("/interview/companies")
      .then((res) => setCompanies(res.companies))
      .catch(() => setCompanies([]))
      .finally(() => setCompaniesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.interview_type]);

  // Case-insensitive match of the typed value against the bank list.
  const matchedCompany = companies.find(
    (c) => c.company_tag.toLowerCase() === form.company_tag.trim().toLowerCase()
  );

  async function handleResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "txt") {
      setError("Only PDF and TXT resumes are supported.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Resume must be under 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("resume", file, file.name);
      const res = await apiUpload<{
        filename: string;
        char_count: number;
        text: string;
      }>("/interview/parse-resume", fd);
      setResume({
        filename: res.filename || file.name,
        text: res.text,
        char_count: res.char_count,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not read that resume.");
    } finally {
      setUploading(false);
    }
  }

  async function startInterview() {
    setLoading(true);
    setError("");
    try {
      // Full mode is time-boxed (30 min, 40s HR / 60s technical clocks): the
      // sliders don't apply, the session carries 25 questions for the slot.
      const isFull = form.interview_type === "full";
      const res = await apiFetch<{
        session_id: string;
        question_text: string;
        question_kind?: string;
      }>(
        "/interview/start",
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            company_tag: form.company_tag || null,
            resume_text: resume?.text || null,
            total_questions: isFull ? 25 : form.total_questions,
            time_per_question: isFull ? 60 : form.time_per_question,
          }),
        }
      );
      // Hand the first question to the interview room (Phase 1 bridge;
      // replaced by a server-side session fetch later).
      if (typeof window !== "undefined" && res.question_text) {
        sessionStorage.setItem(
          `prepmate_question_${res.session_id}`,
          res.question_text
        );
        sessionStorage.setItem(
          `prepmate_kind_${res.session_id}`,
          res.question_kind || "hr"
        );
        sessionStorage.setItem(
          `prepmate_meta_${res.session_id}`,
          JSON.stringify({
            interview_type: form.interview_type,
            company_tag: form.company_tag || null,
            total_questions: form.total_questions,
            time_per_question: form.time_per_question,
          })
        );
      }
      router.push(`/student/interview/room/${res.session_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start interview");
    } finally {
      setLoading(false);
    }
  }

  const typeOptions: { value: InterviewType; label: string; icon: ReactNode }[] = [
    { value: "hr", label: "HR Interview", icon: <UsersIcon size={26} /> },
    { value: "technical", label: "Technical Interview", icon: <CodeIcon size={26} /> },
    { value: "company", label: "Company Specific", icon: <BuildingIcon size={26} /> },
    { value: "full", label: "Full Interview", icon: <LayersIcon size={26} /> },
  ];

  const diffOptions: { value: Difficulty; label: string; color: string }[] = [
    { value: "easy", label: "Easy", color: "#22C55E" },
    { value: "medium", label: "Medium", color: "#2563EB" },
    { value: "hard", label: "Hard", color: "#EF4444" },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">
            Configure Your <span className="text-[#2563EB]">Interview</span>
          </h1>
          <p className="text-[var(--faint)] text-sm">
            PrepMate AI will adapt the difficulty based on your performance.
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 space-y-6">
          {/* Interview Type */}
          <div>
            <label className="block text-sm text-[var(--muted)] mb-3">
              Interview Type
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm({ ...form, interview_type: opt.value })}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    form.interview_type === opt.value
                      ? "border-[#2563EB] bg-[#2563EB]/10"
                      : "border-[var(--border)] hover:border-[var(--muted)]"
                  }`}
                >
                  <div className="mb-1 text-[var(--muted)] flex justify-center">{opt.icon}</div>
                  <div className="text-xs font-medium">{opt.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Company Tag (only for company type) */}
          {form.interview_type === "company" && (
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1.5">
                Company Name
              </label>
              {companiesLoading ? (
                <p className="text-[var(--faint)] text-sm mb-3 animate-pulse">
                  Loading companies...
                </p>
              ) : (
                companies.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {companies.map((c) => (
                      <button
                        key={c.company_tag}
                        onClick={() =>
                          setForm({ ...form, company_tag: c.company_tag })
                        }
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          form.company_tag.trim().toLowerCase() ===
                          c.company_tag.toLowerCase()
                            ? "border-[#2563EB] bg-[#2563EB] text-white"
                            : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]"
                        }`}
                      >
                        {c.company_tag}
                        <span className="ml-1.5 text-[var(--faint)]">
                          {c.question_count}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              )}
              <input
                type="text"
                value={form.company_tag}
                onChange={(e) =>
                  setForm({ ...form, company_tag: e.target.value })
                }
                placeholder="e.g. Google, TCS, Infosys"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] transition-colors"
              />
              <p className="text-xs mt-1.5 text-[var(--faint)]">
                {!form.company_tag.trim()
                  ? "Pick a company above or type your own."
                  : matchedCompany
                    ? `${matchedCompany.question_count} question(s) in the bank for ${matchedCompany.company_tag}.`
                    : `No bank questions for “${form.company_tag.trim()}” yet. Generic questions will be used.`}
              </p>
            </div>
          )}

          {/* Difficulty */}
          <div>
            <label className="block text-sm text-[var(--muted)] mb-3">
              Starting Difficulty
            </label>
            <div className="flex gap-3">
              {diffOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm({ ...form, difficulty: opt.value })}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                    form.difficulty === opt.value
                      ? "border-current bg-current/10"
                      : "border-[var(--border)] hover:border-[var(--muted)]"
                  }`}
                  style={{
                    color: form.difficulty === opt.value ? opt.color : undefined,
                    borderColor:
                      form.difficulty === opt.value ? opt.color : undefined,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Number of Questions (fixed for full mode: 30-minute session) */}
          {form.interview_type === "full" ? (
            <div className="bg-[#2563EB]/[.06] border border-[#2563EB]/25 rounded-xl px-4 py-3 text-sm text-[var(--muted)] leading-relaxed">
              <span className="font-semibold text-[var(--text)]">30-minute session.</span>{" "}
              HR questions get 40s each, technical questions 60s each. The
              session ends automatically at 30:00.
            </div>
          ) : (
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">
              Number of Questions:{" "}
              <span className="text-[var(--text)] font-medium">
                {form.total_questions}
              </span>
            </label>
            <input
              type="range"
              min={3}
              max={10}
              value={form.total_questions}
              onChange={(e) =>
                setForm({ ...form, total_questions: Number(e.target.value) })
              }
              className="w-full accent-[#2563EB]"
            />
            <div className="flex justify-between text-xs text-[var(--faint)] mt-1">
              <span>3</span>
              <span>10</span>
            </div>
          </div>
          )}

          {/* Answer timer (fixed clocks in full mode) */}
          {form.interview_type === "full" ? null : (
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">
              Seconds per answer:{" "}
              <span className="text-[var(--text)] font-medium">
                {form.time_per_question}s
              </span>
            </label>
            <input
              type="range"
              min={30}
              max={180}
              step={15}
              value={form.time_per_question}
              onChange={(e) =>
                setForm({ ...form, time_per_question: Number(e.target.value) })
              }
              className="w-full accent-[#2563EB]"
            />
            <div className="flex justify-between text-xs text-[var(--faint)] mt-1">
              <span>30s</span>
              <span>180s</span>
            </div>
          </div>
          )}

          {/* Resume / CV (optional) */}
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">
              Resume / CV (optional)
            </label>
            {resume ? (
              <div className="flex items-center justify-between gap-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {resume.filename}
                  </p>
                  <p className="text-xs text-[var(--faint)]">
                    {resume.char_count} characters read. Questions about your
                    projects follow the introduction.
                  </p>
                </div>
                <button
                  onClick={() => setResume(null)}
                  className="shrink-0 text-xs text-[var(--faint)] hover:text-[var(--text)] underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full bg-[var(--surface-2)] border border-dashed border-[var(--border)] rounded-xl px-4 py-4 text-sm text-[var(--muted)] hover:border-[#2563EB] hover:text-[var(--text)] transition-colors cursor-pointer">
                <UploadIcon size={16} />
                {uploading ? "Reading resume..." : "Upload PDF or TXT, max 2 MB"}
                <input
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleResumeFile}
                />
              </label>
            )}
          </div>

          {error && (
            <p className="text-[#EF4444] text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <button
            onClick={startInterview}
            disabled={loading}
            className="w-full bg-[#2563EB] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg inline-flex items-center justify-center gap-2"
          >
            {loading ? "Starting..." : (<>Start Interview <MicIcon size={18} /></>)}
          </button>
        </div>
      </div>
    </div>
  );
}
