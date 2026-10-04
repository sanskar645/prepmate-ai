"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CheckCircleIcon } from "@/components/icons";

interface Analytics {
  platform: string;
  avg_prs: number;
  participation_rate: number;
  at_risk_students: { user_id: string; name: string; email: string; current_prs: number }[];
  not_started: number;
  distribution: { range: string; count: number }[];
  branches: string[];
  batch_years: number[];
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [views, setViews] = useState<{ total_7d: number; top_paths: { path: string; views: number }[] } | null>(null);
  const [branch, setBranch] = useState("");
  const [batchYear, setBatchYear] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branch) params.append("branch", branch);
      if (batchYear) params.append("batch_year", batchYear);
      const res = await apiFetch<Analytics>(
        `/admin/analytics${params.toString() ? `?${params}` : ""}`
      );
      setAnalytics(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
    apiFetch<{ total_7d: number; top_paths: { path: string; views: number }[] }>(
      "/analytics/views"
    )
      .then(setViews)
      .catch(() => setViews(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxCount = analytics
    ? Math.max(...analytics.distribution.map((d) => d.count), 1)
    : 1;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            TPO <span className="text-[#2563EB]">Dashboard</span>
          </h1>
          <p className="text-[var(--faint)] text-sm mt-1">
            PrepMate AI: Training and Placement Officer view
          </p>
        </div>

        {/* Filters (dropdowns from real data — no blind typing) */}
        <div className="flex gap-3">
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2 text-[var(--text)] text-sm focus:outline-none focus:border-[#2563EB]"
          >
            <option value="">All branches</option>
            {(analytics?.branches ?? []).map((b) => (
              <option key={b} value={b} className="bg-[var(--surface)]">
                {b}
              </option>
            ))}
          </select>
          <select
            value={batchYear}
            onChange={(e) => setBatchYear(e.target.value)}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2 text-[var(--text)] text-sm focus:outline-none focus:border-[#2563EB]"
          >
            <option value="">All years</option>
            {(analytics?.batch_years ?? []).map((y) => (
              <option key={y} value={String(y)} className="bg-[var(--surface)]">
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="bg-[#2563EB] hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            Filter
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          {
            label: "Average PRS",
            value: analytics ? `${analytics.avg_prs.toFixed(1)}` : "—",
            sub: "Placement Readiness Score",
            color: "#2563EB",
          },
          {
            label: "Participation Rate",
            value: analytics
              ? `${(analytics.participation_rate * 100).toFixed(0)}%`
              : "—",
            sub: "Students who practiced",
            color: "#22C55E",
          },
          {
            label: "At-Risk Students",
            value: analytics?.at_risk_students.length ?? "—",
            sub: "PRS below 40",
            color: "#EF4444",
          },
          {
            label: "Not Started",
            value: analytics?.not_started ?? "—",
            sub: "Never attempted",
            color: "#60A5FA",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6"
          >
            <p className="text-[var(--faint)] text-sm mb-2">{kpi.label}</p>
            <p className="text-4xl font-bold mb-1" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="text-[var(--faint)] text-xs">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* PRS Distribution Bar Chart */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-6">PRS Distribution</h2>
          {analytics ? (
            <div className="space-y-3">
              {analytics.distribution.map((d) => (
                <div key={d.range} className="flex items-center gap-3">
                  <span className="text-[var(--faint)] text-xs w-14 text-right">
                    {d.range}
                  </span>
                  <div className="flex-1 bg-[var(--surface-2)] rounded-full h-5 overflow-hidden">
                    <div
                      className="h-5 rounded-full bg-[#2563EB] transition-all duration-700 flex items-center justify-end pr-2"
                      style={{ width: `${(d.count / maxCount) * 100}%` }}
                    >
                      <span className="text-white text-xs font-medium">
                        {d.count > 0 ? d.count : ""}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[var(--faint)] text-sm">No data.</p>
          )}
        </div>

        {/* At-Risk Students */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">
            At-Risk Students{" "}
            <span className="text-[#EF4444] text-sm">
              (PRS &lt; 40)
            </span>
          </h2>
          {analytics?.at_risk_students.length === 0 ? (
            <p className="text-[#22C55E] text-sm flex items-center gap-2">
              <CheckCircleIcon size={16} /> No at-risk students right now!
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {analytics?.at_risk_students.map((s) => (
                <div
                  key={s.user_id}
                  className="flex items-center justify-between bg-[var(--surface)] rounded-xl px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-[var(--faint)] text-xs">{s.email}</p>
                  </div>
                  <span className="text-[#EF4444] font-bold text-sm">
                    {s.current_prs.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Site traffic (privacy-friendly: paths only, last 7 days) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 mt-6">
        <div className="flex items-baseline gap-3 mb-4">
          <h2 className="text-lg font-semibold">Site Traffic</h2>
          <span className="text-[var(--faint)] text-sm">
            {views ? `${views.total_7d} views · 7 days` : "loading..."}
          </span>
        </div>
        {views && views.top_paths.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
            {views.top_paths.map((v) => (
              <div key={v.path} className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--border)]">
                <span className="font-mono text-[var(--muted)] truncate">{v.path}</span>
                <span className="font-bold ml-4">{v.views}</span>
              </div>
            ))}
          </div>
        ) : (
          views && <p className="text-[var(--faint)] text-sm">No traffic yet.</p>
        )}
      </div>
    </div>
  );
}
