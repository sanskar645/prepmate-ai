import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 bg-[var(--bg)] text-[var(--text)]">
      <h1 className="text-4xl font-extrabold tracking-tight mb-3">
        Terms of Use
      </h1>
      <p className="text-sm text-[var(--faint)] mb-10">
        Last updated: September 2026 · PrepMate AI, MITS Gwalior
      </p>

      <div className="space-y-8 leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">
            Eligibility
          </h2>
          <p>
            PrepMate AI is a student project for MITS Gwalior campus placements.
            Registration requires a valid @mitsgwl.ac.in email address. Accounts
            with other addresses are rejected automatically.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">
            Fair practice
          </h2>
          <p>
            Scores are practice signals from an AI grader, not official
            placement evaluations. They typically vary within ±1 point for the
            same answer. Do not present PrepMate AI scores as certified
            credentials to employers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">
            Acceptable use
          </h2>
          <p>
            One account per student. Do not attempt to access other
            students&apos; sessions or reports, upload anything other than your
            own interview audio, or abuse the service in ways that degrade it
            for others. Misuse may lead to account removal.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">
            Availability
          </h2>
          <p>
            This is a semester project running on free-tier APIs. Speech
            transcription and grading may occasionally be slow or unavailable.
            Nothing here is guaranteed.
          </p>
        </section>
      </div>

      <Link
        href="/"
        className="inline-block mt-12 text-[#2563EB] font-semibold hover:underline inline-flex items-center gap-1.5"
      >
        <ArrowLeftIcon size={15} /> Back to home
      </Link>
    </div>
  );
}
