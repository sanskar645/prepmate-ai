"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { role } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    branch: "",
    batch_year: new Date().getFullYear() + 1,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Keep in sync with backend INSTITUTION_EMAIL_DOMAIN (.env).
  const EMAIL_DOMAIN = "mitsgwl.ac.in";

  // Signed in already? Registration is pointless — go home for your role.
  useEffect(() => {
    if (role === "admin") router.replace("/admin/dashboard");
    else if (role) router.replace("/student/dashboard");
  }, [role, router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // Mirror the backend rule so a typo is caught before the round-trip.
    const email = form.email.trim().toLowerCase();
    if (!email.endsWith(`@${EMAIL_DOMAIN}`)) {
      setError(`Only @${EMAIL_DOMAIN} email addresses are allowed.`);
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ ...form, email, batch_year: Number(form.batch_year) }),
      });
      router.push("/login?registered=true");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const branches = ["CSE", "IT", "ECE", "EEE", "ME", "CE", "Mathematics & Computing"];

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            Join <span className="text-[#2563EB]">PrepMate AI</span>
          </h1>
          <p className="text-[var(--faint)] mt-2 text-sm">
            Only <span className="text-[var(--text)]">@{EMAIL_DOMAIN}</span> emails can register
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {[
            { label: "Full Name", name: "name", type: "text", placeholder: "Sanskar Patel" },
            { label: "Institute Email", name: "email", type: "email", placeholder: `you@${EMAIL_DOMAIN}` },
            { label: "Password", name: "password", type: "password", placeholder: "••••••••" },
          ].map((field) => (
            <div key={field.name}>
              <label className="block text-sm text-[var(--muted)] mb-1.5">{field.label}</label>
              <input
                type={field.type}
                name={field.name}
                value={form[field.name as keyof typeof form] as string}
                onChange={handleChange}
                placeholder={field.placeholder}
                required
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] transition-colors"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Branch</label>
            <select
              name="branch"
              value={form.branch}
              onChange={handleChange}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] focus:outline-none focus:border-[#2563EB] transition-colors"
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b} value={b} className="bg-[var(--surface)]">{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Batch Year</label>
            <input
              type="number"
              name="batch_year"
              value={form.batch_year}
              onChange={handleChange}
              min={2024}
              max={2030}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] focus:outline-none focus:border-[#2563EB] transition-colors"
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
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-[var(--faint)] text-sm mt-6">
          Already registered?{" "}
          <Link href="/login" className="text-[#2563EB] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
