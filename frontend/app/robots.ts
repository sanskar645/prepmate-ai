import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/privacy", "/terms"],
        disallow: ["/student/", "/admin/", "/api/"],
      },
    ],
  };
}
