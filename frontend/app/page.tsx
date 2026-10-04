"use client";
import { useState } from "react";
import Link from "next/link";

const ROLES = [
  "CSE",
  "MCE",
  "IT",
  "ECE",
  "EEE",
  "ME",
  "CE",
  "HR Interviews",
  "Technical",
  "Company Specific",
];

const STEPS = [
  {
    n: "01",
    title: "Setup",
    desc: "Pick HR, technical, or company-specific. Choose difficulty, company, and length.",
    points: ["Bank questions with counts", "Adaptive difficulty"],
  },
  {
    n: "02",
    title: "Speak",
    desc: "Answer on mic and camera under real timing, just like the placement hall.",
    points: ["Voice recording with timer", "On-device presence signal"],
  },
  {
    n: "03",
    title: "Improve",
    desc: "Instant scores per answer, a full report, and a PRS that tracks growth.",
    points: ["Technical, clarity, relevance", "Skill breakdown by domain"],
  },
];

const FAQS = [
  {
    q: "Why did you build this?",
    a: "PrepMate AI is a semester cornerstone project for MITS Gwalior placements. Generic prep advice doesn't tell you how you actually sound under pressure, so we built timed voice interviews with honest, repeatable scoring.",
  },
  {
    q: "Which email can register?",
    a: "Only @mitsgwl.ac.in institute addresses. The allow-list is enforced on the server, so there is no way around it.",
  },
  {
    q: "How is scoring done?",
    a: "Your audio is transcribed with Whisper and graded by Gemini on a fixed 0-10 rubric for technical content, communication, and relevance. The same answer scores within ±1 every time. Body-language presence is measured separately on your device and never affects the grade.",
  },
  {
    q: "How is this different from just using ChatGPT?",
    a: "ChatGPT can't time you, hear you, watch your presence, adapt difficulty to your answers, or track a readiness score across sessions. PrepMate AI is a practice loop, not a chatbot.",
  },
  {
    q: "What does it cost?",
    a: "Free for MITS students. The speech and grading APIs run on free tiers.",
  },
  {
    q: "What happens to my data?",
    a: "Transcripts, scores, and session history live in our database under your account. Your video never leaves your browser: only anonymous per-second counts are uploaded for the presence signal.",
  },
];

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="bg-[var(--bg)] text-[var(--text)]">
      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-[#2563EB] mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
            Built for MITS Gwalior placements
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Walk in already
            <br />
            knowing{" "}
            <span className="bg-[#2563EB]/10 px-2 rounded-lg box-decoration-clone">
              what they&apos;ll ask
            </span>
          </h1>
          <p className="text-lg text-[var(--muted)] leading-relaxed max-w-lg mb-8">
            Timed voice mock interviews for HR, technical, and company rounds.
            Get instant AI scores before the real thing.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <Link
              href="/register"
              className="bg-[#101014] dark:bg-[#2563EB] text-white font-semibold px-7 py-3.5 rounded-xl transition-colors"
            >
              Start practicing free
            </Link>
            <Link
              href="/login"
              className="font-semibold px-2 py-3.5 text-[var(--text)] hover:text-[#2563EB] transition-colors"
            >
              Sign In
            </Link>
          </div>
          <p className="text-sm text-[var(--faint)]">
            Institute email only · No install · Works on any laptop
          </p>
        </div>

        {/* Session preview card (real product, not a mock promise) */}
        <div className="bg-[#101014] dark:bg-[var(--surface-2)] dark:border dark:border-[var(--border)] rounded-2xl p-7">
          <p className="text-white/85 dark:text-[var(--text)] text-[15px] leading-relaxed mb-6">
            Turn a question bank into{" "}
            <strong>interview questions</strong> to practice with:
          </p>
          <div className="flex flex-wrap gap-2.5 mb-6">
            {["HR Interview", "Technical", "Company Specific", "TCS", "Infosys"].map(
              (t, i) => (
                <span
                  key={t}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                    i === 1
                      ? "bg-[#2563EB] border-[#2563EB] text-white"
                      : "border-white/15 dark:border-[var(--border)] text-white/80 dark:text-[var(--muted)]"
                  }`}
                >
                  {t}
                </span>
              )
            )}
          </div>
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl p-6">
            <p className="text-[#101014] dark:text-[var(--text)] text-lg font-medium leading-relaxed mb-5">
              What is a deadlock, and how can it be prevented?
            </p>
            <div className="flex items-center justify-between border-t border-black/10 dark:border-[var(--border)] pt-4">
              <span className="text-sm text-black/40 dark:text-[var(--faint)] font-mono">
                0:00 / 3:00
              </span>
              <span className="w-11 h-11 rounded-full bg-[#2563EB] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 19v3" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Dark contrast band ── */}
      <section className="bg-[#101014] text-white">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-14 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-8">
              Your next interview doesn&apos;t have to be a guess.
            </h2>
            <Link
              href="/register"
              className="inline-block bg-[#2563EB] hover:bg-blue-600 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors"
            >
              Try now for free
            </Link>
          </div>
          <div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center text-[13px] font-semibold uppercase tracking-wider pb-4 border-b border-white/10">
              <span className="text-white/40">Without prep</span>
              <span />
              <span className="text-[#2563EB]">With PrepMate AI</span>
            </div>
            {[
              ["Unprepared", "Structured answers"],
              ["Nervous", "Timed practice"],
              ["Generic advice", "Personal PRS tracking"],
            ].map(([a, b]) => (
              <div
                key={a}
                className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center py-5 border-b border-white/10"
              >
                <span className="text-white/35 text-xl line-through decoration-white/25">
                  {a}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
                <span className="text-white text-xl font-semibold">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <p className="text-center text-sm font-semibold text-[#2563EB] mb-3">
          How it works
        </p>
        <h2 className="text-center text-4xl font-extrabold tracking-tight mb-14">
          Three steps to an unfair advantage
        </h2>
        {STEPS.map((s) => (
          <div key={s.n} className="grid grid-cols-[72px_1fr] gap-6 py-9 border-t border-[var(--border)]">
            <span className="text-3xl font-extrabold text-[var(--faint)]">
              {s.n}
            </span>
            <div>
              <h3 className="text-2xl font-bold mb-2">{s.title}</h3>
              <p className="text-[var(--muted)] leading-relaxed mb-4">{s.desc}</p>
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {s.points.map((p) => (
                  <span key={p} className="flex items-center gap-2 text-[15px] font-medium">
                    <Check />
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Roles ── */}
      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <p className="text-sm font-semibold text-[#2563EB] mb-3">Quick start</p>
        <h2 className="text-4xl font-extrabold tracking-tight mb-10">
          Works for every branch and round
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {ROLES.map((r) => (
            <span
              key={r}
              className="px-5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[15px] font-medium"
            >
              {r}
            </span>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <p className="text-center text-sm font-semibold text-[#2563EB] mb-3">
          FAQ
        </p>
        <h2 className="text-center text-4xl font-extrabold tracking-tight mb-12">
          Frequently asked questions
        </h2>
        {FAQS.map((f, i) => {
          const open = openFaq === i;
          return (
            <div key={f.q} className="border-t border-[var(--border)] last:border-b">
              <button
                onClick={() => setOpenFaq(open ? null : i)}
                className="w-full flex items-center justify-between gap-6 py-6 text-left"
              >
                <span className="text-lg font-bold">{f.q}</span>
                <span className="text-[#2563EB] text-2xl font-light leading-none shrink-0">
                  {open ? "–" : "+"}
                </span>
              </button>
              {open && (
                <p className="text-[var(--muted)] leading-relaxed pb-7 pr-10">
                  {f.a}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-xs font-bold">
              P
            </span>
            <span className="font-bold">PrepMate AI</span>
          </div>
          <p className="text-sm text-[var(--faint)] text-center">
            Built by Sanskar Patel · MITS Gwalior · Sem 5 Cornerstone Project
          </p>
          <div className="flex gap-6 text-sm">
            <Link href="/privacy" className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Terms of Use
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
