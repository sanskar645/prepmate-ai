"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { role, login } = useAuth();
  const [portal, setPortal] = useState<"student" | "admin">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in? Don't show the form — go home for your role.
  useEffect(() => {
    if (role === "admin") router.replace("/admin/dashboard");
    else if (role) router.replace("/student/dashboard");
  }, [role, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user_id: string; role: string }>(
        "/auth/login",
        {
          method: "POST",
          auth: false,
          body: JSON.stringify({ email, password }),
        }
      );
      // The account must match the chosen portal — otherwise sign nothing in.
      if (res.role !== portal) {
        setError(
          portal === "admin"
            ? "This is not an officer account. Switch to Student sign in."
            : "This is an officer account. Switch to Officer sign in."
        );
        return;
      }
      login(res.token);
      localStorage.setItem("prepmate_user_id", res.user_id);
      localStorage.setItem("prepmate_role", res.role);
      router.push(portal === "admin" ? "/admin/dashboard" : "/student/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            Welcome back to{" "}
            <span className="text-[#2563EB]">PrepMate AI</span>
          </h1>
          <p className="text-[var(--faint)] mt-2 text-sm">
            {portal === "admin"
              ? "Officers enter the TPO portal here"
              : "Sign in to continue your interview prep"}
          </p>
        </div>

        {/* Portal picker — one login page, two doors, no crossover */}
        <div className="grid grid-cols-2 gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-1.5 mb-6">
          {(["student", "admin"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPortal(p);
                setError("");
              }}
              className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                portal === p
                  ? "bg-[#2563EB] text-white"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {p === "student" ? "Student" : "Officer"}
            </button>
          ))}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">
              {portal === "admin" ? "Officer Email" : "Institute Email"}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                portal === "admin" ? "officer@mitsgwl.ac.in" : "you@mitsgwl.ac.in"
              }
              required
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

        {portal === "student" && (
          <p className="text-center text-[var(--faint)] text-sm mt-6">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-[#2563EB] hover:underline font-medium"
            >
              Register here
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
