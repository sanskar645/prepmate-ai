"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUpload } from "@/lib/api";
import ImageCropper, { type CropKind } from "@/components/ImageCropper";
import type { User } from "@/types";

interface ProfileResponse {
  user: User & {
    bio?: string | null;
    avatar_url?: string | null;
    banner_url?: string | null;
    skills?: string[] | string | null;
  };
  current_prs: number;
}

function asSkills(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s) => typeof s === "string") : [];
}

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);
  // Crop-before-upload: picking a file opens the cropper, Apply uploads.
  const [cropSrc, setCropSrc] = useState<{ kind: CropKind; src: string } | null>(null);
  const [okMsg, setOkMsg] = useState("");
  const [error, setError] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  function applyProfile(p: ProfileResponse) {
    setProfile(p);
    setBio(p.user.bio ?? "");
    setSkillsText(asSkills(p.user.skills).join(", "));
  }

  useEffect(() => {
    apiFetch<ProfileResponse>("/user/profile")
      .then(applyProfile)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load profile")
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const res = await apiFetch<{ user: ProfileResponse["user"] }>("/user/profile", {
        method: "PATCH",
        body: JSON.stringify({
          bio,
          skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      setProfile((p) => (p ? { ...p, user: { ...p.user, ...res.user } } : p));
      setBio(res.user.bio ?? "");
      setSkillsText(asSkills(res.user.skills).join(", "));
      setOkMsg("Profile saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /** File picked → validate → open the cropper (upload happens on Apply). */
  function handleFilePick(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext ?? "")) {
      setError("Only JPG, PNG and WEBP images are supported.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2 MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setCropSrc({ kind, src: String(reader.result) });
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  async function handleImage(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext ?? "")) {
      setError("Only JPG, PNG and WEBP images are supported.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2 MB.");
      return;
    }
    setUploading(kind);
    setError("");
    setOkMsg("");
    try {
      const fd = new FormData();
      fd.append(kind, file, file.name);
      const res = await apiUpload<{ avatar_url?: string; banner_url?: string }>(
        `/user/${kind}`,
        fd
      );
      const url = kind === "avatar" ? res.avatar_url : res.banner_url;
      setProfile((p) =>
        p
          ? {
              ...p,
              user: {
                ...p.user,
                ...(kind === "avatar" ? { avatar_url: url } : { banner_url: url }),
              },
            }
          : p
      );
      setOkMsg(`${kind === "avatar" ? "Photo" : "Banner"} updated.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    if (pw.next !== pw.confirm) {
      setError("New passwords don't match.");
      return;
    }
    if (pw.next.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    setPwLoading(true);
    try {
      await apiFetch("/user/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: pw.current,
          new_password: pw.next,
        }),
      });
      setPw({ current: "", next: "", confirm: "" });
      setOkMsg("Password changed.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setPwLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--faint)] animate-pulse">
        Loading profile...
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="text-center py-20 text-[var(--faint)]">
        {error || "Profile not found."}
      </div>
    );
  }

  const { user } = profile;
  const skills = asSkills(user.skills);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-8">
        Your <span className="text-[#2563EB]">Profile</span>
      </h1>

      {/* Banner + avatar (avatar floats on its own top layer above the banner) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden mb-6">
        <button
          onClick={() => bannerInput.current?.click()}
          className="relative block w-full h-44 bg-[var(--surface-2)] hover:opacity-90 transition-opacity overflow-hidden"
        >
          {user.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.banner_url} alt="Profile banner" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[var(--faint)] text-sm">
              {uploading === "banner" ? "Uploading..." : "Click to add a banner"}
            </span>
          )}
          <input
            ref={bannerInput}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              void handleFilePick("banner", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </button>
        <div className="px-6 pb-6">
          <div className="-mt-12 mb-3 relative z-10 w-fit">
            <button
              onClick={() => avatarInput.current?.click()}
              className="block w-24 h-24 rounded-full bg-[var(--surface-2)] ring-4 ring-[var(--surface)] overflow-hidden hover:opacity-90 transition-opacity"
              title="Change photo"
            >
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center h-full text-xl font-bold text-[var(--faint)]">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <input
                ref={avatarInput}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                void handleFilePick("avatar", e.target.files?.[0]);
                e.target.value = "";
              }}
              />
            </button>
          </div>
          <p className="text-xl font-bold">{user.name}</p>
          <p className="text-[var(--faint)] text-sm">
            {user.email} · {user.branch ?? "—"} · Batch {user.batch_year ?? "—"}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-[#EF4444] text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 mb-4">
          {error}
        </p>
      )}
      {okMsg && (
        <p className="text-[#22C55E] text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2 mb-4">
          {okMsg}
        </p>
      )}

      {/* Bio + skills */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">
            Bio <span className="text-[var(--faint)]">({bio.length}/500)</span>
          </label>
          <textarea
            value={bio}
            maxLength={500}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A line or two about you, your interests, target roles..."
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">
            Skills <span className="text-[var(--faint)]">(comma separated, max 20)</span>
          </label>
          <input
            type="text"
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            placeholder="Python, DBMS, Communication"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] transition-colors"
          />
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {skills.map((s) => (
                <span
                  key={s}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#2563EB] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>

      {/* Password */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Change Password</h2>
        <form onSubmit={handlePassword} className="space-y-4">
          {[
            { label: "Current password", key: "current" },
            { label: "New password", key: "next" },
            { label: "Confirm new password", key: "confirm" },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-sm text-[var(--muted)] mb-1.5">
                {f.label}
              </label>
              <input
                type="password"
                value={pw[f.key as keyof typeof pw]}
                onChange={(e) => setPw({ ...pw, [f.key]: e.target.value })}
                required
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[#2563EB] transition-colors"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={pwLoading}
            className="bg-[var(--surface-2)] hover:bg-[var(--border)] border border-[var(--border)] disabled:opacity-50 font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {pwLoading ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>

      {/* Crop-before-upload modal */}
      {cropSrc && (
        <ImageCropper
          src={cropSrc.src}
          kind={cropSrc.kind}
          onCancel={() => setCropSrc(null)}
          onApply={(blob) => {
            const file = new File([blob], `${cropSrc.kind}.jpg`, {
              type: "image/jpeg",
            });
            setCropSrc(null);
            void handleImage(cropSrc.kind, file);
          }}
        />
      )}
    </div>
  );
}
