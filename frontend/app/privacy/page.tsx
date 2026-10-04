import Link from "next/link";
import { ArrowLeftIcon } from "@/components/icons";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 bg-[var(--bg)] text-[var(--text)]">
      <h1 className="text-4xl font-extrabold tracking-tight mb-3">
        Privacy Policy
      </h1>
      <p className="text-sm text-[var(--faint)] mb-10">
        Last updated: September 2026 · PrepMate AI, MITS Gwalior
      </p>

      <div className="space-y-8 leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">
            What we collect
          </h2>
          <p>
            Your name, institute email, branch, and batch year from registration.
            From each interview: audio transcripts, scores, feedback, and
            anonymous presence counts (face-visible ratio, dominant expression).
            Your camera video never leaves your browser.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">
            How it is used
          </h2>
          <p>
            Scores and transcripts generate your reports, skill breakdown, and
            Placement Readiness Score. Aggregated, anonymized statistics may be
            shown to placement officers (for example, average readiness by
            branch). Nothing is sold or shared with third parties except the
            AI providers that transcribe and grade answers (Groq, Google).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">
            Your control
          </h2>
          <p>
            Only @mitsgwl.ac.in addresses can register. Contact the project
            maintainer through your institute to correct or delete your data.
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
