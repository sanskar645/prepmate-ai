"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";

/**
 * Dedicated TPO Portal entry. Uses the same auth backend as students, but
 * refuses non-admin accounts with a clear message instead of letting them
 * into the portal.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const { role, login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // An officer already signed in (or a student poking at the URL) never sees
  // this form: officers go to the portal, students to their dashboard.
  useEffect(() => {
    if (role === "admin") router.replace("/admin/dashboard");
    else if (role) router.replace("/student/dashboard");
  }, [role, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; role: string }>("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });
      if (res.role !== "admin") {
        setError("This portal is for placement officers. Students sign in on the main site.");
        return;
      }
      login(res.token);
      router.push("/admin/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-8 h-8 rounded-lg bg-[#2563EB] flex items-center justify-center text-white text-sm font-bold">
            P
          </span>
          <div>
            <p className="font-bold leading-none">TPO Portal</p>
            <p className="text-[11px] text-[var(--faint)] mt-1">Placement cell only</p>
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-6">Officer sign in</h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="tpo@mitsgwl.ac.in"
              required
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] transition-colors"
            />
          </div>

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
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-[var(--faint)] text-sm mt-6">
          Not an officer?{" "}
          <Link
            href="/login"
            className="text-[#2563EB] hover:underline font-medium"
          >
            Student sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
