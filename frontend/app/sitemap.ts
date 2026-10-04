import type { MetadataRoute } from "next";

// Public, indexable marketing pages only. App screens require auth and stay
// out of the sitemap by design.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const now = new Date();
  return ["/", "/login", "/register", "/privacy", "/terms"].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
  }));
}
