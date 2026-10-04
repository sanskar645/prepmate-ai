"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

/**
 * TPO Portal shell — deliberately different chrome from the student side
 * (sidebar instead of top nav) so the two portals never feel like one app.
 * Guards every /admin/* route except the login page itself.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { role, logout } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setAllowed(true);
      return;
    }
    if (role === undefined) return; // context still reading — don't bounce yet
    if (role === "admin") {
      setAllowed(true);
    } else {
      setAllowed(false);
      router.replace("/admin/login");
    }
  }, [pathname, role, router]);

  function handleLogout() {
    logout("/admin/login");
  }

  if (allowed === null) return null;
  if (pathname === "/admin/login") return <>{children}</>;
  if (!allowed) return null;

  return (
    <div className="min-h-[calc(100vh-64px)] flex bg-[var(--bg)] text-[var(--text)]">
      <aside className="w-60 shrink-0 border-r border-[var(--border)] p-5 flex flex-col gap-1">
        <div className="flex items-center gap-2 px-2 mb-6">
          <span className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-sm font-bold">
            P
          </span>
          <div>
            <p className="font-bold leading-none">TPO Portal</p>
            <p className="text-[11px] text-[var(--faint)] mt-1">Placement cell only</p>
          </div>
        </div>
        <Link
          href="/admin/dashboard"
          className="px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-[var(--surface-2)] transition-colors"
        >
          Dashboard
        </Link>
        <Link
          href="/admin/questions"
          className="px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-[var(--surface-2)] transition-colors"
        >
          Question Bank
        </Link>
        <div className="mt-auto flex flex-col gap-1">
          <button
            onClick={handleLogout}
            className="text-left px-3 py-2.5 rounded-xl text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
