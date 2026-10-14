"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  // Single shared session: login/logout anywhere updates this nav instantly,
  // no reload needed.
  const { role, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("prepmate-theme", next);
    } catch {
      // Private mode: theme just won't persist.
    }
  }

  return (
    // The TPO portal has its own sidebar shell — the student navbar must
    // never render inside /admin (that overlap was the visible loophole).
    // The interview room is a fullscreen proctored exam surface: no navbar,
    // just the interview (it owns the full viewport height instead).
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/student/interview/room") ? null : (
    <header className="border-b border-[var(--border)] backdrop-blur-sm sticky top-0 z-50 bg-[var(--nav-bg)]">
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo routes smart: home for guests, your dashboard when signed in
            (clicking it must never dump you back at login). */}
        <button
          onClick={() =>
            router.push(
              role === "admin"
                ? "/admin/dashboard"
                : role
                  ? "/student/dashboard"
                  : "/"
            )
          }
          className="flex items-center gap-2"
          aria-label="PrepMate AI home"
        >
          <span className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-sm font-bold">
            P
          </span>
          <span className="text-xl font-bold tracking-tight">
            <span className="text-[var(--text)]">PrepMate</span>
            <span className="text-[#2563EB]"> AI</span>
          </span>
        </button>

        {/* Officers get one door (the portal they already stand in);
            students get the practice nav. Nobody gets links that bounce. */}
        {role === "admin" ? (
          <div className="hidden md:flex items-center gap-6 text-sm text-[var(--muted)]">
            <Link
              href="/admin/dashboard"
              className="hover:text-[var(--text)] transition-colors"
            >
              TPO Portal
            </Link>
          </div>
        ) : role ? (
          <div className="hidden md:flex items-center gap-6 text-sm text-[var(--muted)]">
            <Link
              href="/student/dashboard"
              className="hover:text-[var(--text)] transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/student/interview/setup"
              className="hover:text-[var(--text)] transition-colors"
            >
              Interview
            </Link>
            <Link
              href="/student/history"
              className="hover:text-[var(--text)] transition-colors"
            >
              Reports
            </Link>
            <Link
              href="/student/profile"
              className="hover:text-[var(--text)] transition-colors"
            >
              Profile
            </Link>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="w-9 h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] flex items-center justify-center transition-colors"
          >
            {theme === "dark" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>

          {role === undefined ? (
            <div className="w-20" />
          ) : role ? (
            <button
              onClick={() => logout()}
              className="bg-[var(--surface-2)] hover:opacity-80 border border-[var(--border)] text-[var(--text)] text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className="bg-[#2563EB] hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </nav>
    </header>
    )
  );
}
