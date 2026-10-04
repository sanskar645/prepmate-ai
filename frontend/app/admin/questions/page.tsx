"use client";
import { useState } from "react";
import { apiFetch, apiDownload } from "@/lib/api";
import { DownloadIcon } from "@/components/icons";
import type { InterviewType, Difficulty } from "@/types";

interface QuestionForm {
  question_text: string;
  interview_type: InterviewType;
  category: string;
  domain_tag: string;
  difficulty: Difficulty;
  company_tag: string;
}

export default function AdminQuestionsPage() {
  const [form, setForm] = useState<QuestionForm>({
    question_text: "",
    interview_type: "technical",
    category: "",
    domain_tag: "",
    difficulty: "medium",
    company_tag: "",
  });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleExport() {
    setSuccess("");
    setError("");
    setExporting(true);
    try {
      const blob = await apiDownload("/admin/questions/export");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prepmate_questions.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSuccess("Question bank exported as CSV.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess("");
    setError("");
    setLoading(true);
    try {
      await apiFetch("/admin/questions", {
        method: "POST",
        body: JSON.stringify([
          {
            ...form,
            company_tag: form.company_tag || null,
          },
        ]),
      });
      setSuccess("Question added successfully to PrepMate AI question bank!");
      setForm({
        question_text: "",
        interview_type: "technical",
        category: "",
        domain_tag: "",
        difficulty: "medium",
        company_tag: "",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add question");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">
            Question <span className="text-[#2563EB]">Bank</span>
          </h1>
          <p className="text-[var(--faint)] text-sm">
            Add new questions to the PrepMate AI interview pool.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="shrink-0 bg-[var(--surface-2)] hover:bg-[var(--border)] border border-[var(--border)] disabled:opacity-50 text-[var(--text)] text-sm font-medium px-4 py-2.5 rounded-xl transition-colors inline-flex items-center gap-2"
        >
          {exporting ? "Exporting..." : (<>Export CSV <DownloadIcon size={15} /></>)}
        </button>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">
              Question Text
            </label>
            <textarea
              name="question_text"
              value={form.question_text}
              onChange={handleChange}
              rows={3}
              required
              placeholder="Enter the interview question..."
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1.5">
                Type
              </label>
              <select
                name="interview_type"
                value={form.interview_type}
                onChange={handleChange}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="hr" className="bg-[var(--surface)]">HR</option>
                <option value="technical" className="bg-[var(--surface)]">Technical</option>
                <option value="company" className="bg-[var(--surface)]">Company</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-[var(--muted)] mb-1.5">
                Difficulty
              </label>
              <select
                name="difficulty"
                value={form.difficulty}
                onChange={handleChange}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="easy" className="bg-[var(--surface)]">Easy</option>
                <option value="medium" className="bg-[var(--surface)]">Medium</option>
                <option value="hard" className="bg-[var(--surface)]">Hard</option>
              </select>
            </div>
          </div>

          {[
            { label: "Category", name: "category", placeholder: "e.g. Operating Systems" },
            { label: "Domain Tag", name: "domain_tag", placeholder: "e.g. OS, DSA, OOPS" },
            { label: "Company Tag (optional)", name: "company_tag", placeholder: "e.g. Google" },
          ].map((f) => (
            <div key={f.name}>
              <label className="block text-sm text-[var(--muted)] mb-1.5">{f.label}</label>
              <input
                type="text"
                name={f.name}
                value={form[f.name as keyof QuestionForm]}
                onChange={handleChange}
                placeholder={f.placeholder}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          ))}

          {success && (
            <p className="text-[#22C55E] text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
              {success}
            </p>
          )}
          {error && (
            <p className="text-[#EF4444] text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2563EB] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? "Adding..." : "Add Question"}
          </button>
        </form>
      </div>
    </div>
  );
}
