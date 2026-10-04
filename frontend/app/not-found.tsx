import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-extrabold text-[var(--faint)] mb-3">404</p>
        <h1 className="text-2xl font-bold mb-2">This page went for an interview</h1>
        <p className="text-[var(--muted)] mb-8">
          It didn&apos;t get the job. Let&apos;s get you back on track.
        </p>
        <Link
          href="/"
          className="inline-block bg-[#2563EB] hover:bg-blue-600 text-white font-semibold px-7 py-3 rounded-xl transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
