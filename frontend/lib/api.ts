// PrepMate AI — API fetch wrapper with auth injection (Section 7)

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("prepmate_token");
}

interface FetchOptions extends RequestInit {
  auth?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { auth = true, headers = {}, ...rest } = options;
  const authHeaders: Record<string, string> = {};

  if (auth) {
    const token = getToken();
    if (token) authHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(headers as Record<string, string>),
    },
    ...rest,
  });

  if (!res.ok) {
    if (res.status === 401) throw handleUnauthorized(path);
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || "Request failed");
  }

  return res.json() as Promise<T>;
}

/** Multipart form data upload (for audio). Skips Content-Type so browser sets boundary. */
export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    if (res.status === 401) throw handleUnauthorized(path);
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || "Upload failed");
  }

  return res.json() as Promise<T>;
}

/** Binary download (e.g. CSV export). Throws with the server's message on error. */
export async function apiDownload(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    if (res.status === 401) throw handleUnauthorized(path);
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || "Download failed");
  }

  return res.blob();
}

export function saveToken(token: string) {
  localStorage.setItem("prepmate_token", token);
}

/** Role reader for UI gating (the API re-verifies the signature).
 * Handles base64url (python-jose emits -/_ with no padding, which raw
 * atob() chokes on — that crash made the navbar randomly "forget" logins
 * depending on the token's bytes). */
export function getTokenRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const seg = token.split(".")[1] ?? "";
    const padded = seg.replace(/-/g, "+").replace(/_/g, "/");
    const b64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return typeof payload.role === "string" ? payload.role : "student";
  } catch {
    return null;
  }
}

export function clearToken() {
  // All three session keys — leaving role/user_id behind was a stale-state bug.
  localStorage.removeItem("prepmate_token");
  localStorage.removeItem("prepmate_user_id");
  localStorage.removeItem("prepmate_role");
}

/** Expired/invalid token anywhere (except auth routes, which handle their
 * own 401s): drop the session and bounce to login instead of failing
 * silently per page. */
function handleUnauthorized(path: string): Error {
  if (!path.startsWith("/auth/")) {
    clearToken();
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login") &&
      !window.location.pathname.startsWith("/admin/login")
    ) {
      window.location.href = "/login";
    }
    return new Error("Session expired. Please sign in again.");
  }
  return new Error("Request failed");
}
