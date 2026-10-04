"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";

// Per-route tab titles (pages are client components, so root metadata can't
// set them). Landing keeps the root metadata title.
const TITLES: Array<[RegExp, string]> = [
  [/^\/login/, "Sign In"],
  [/^\/register/, "Register"],
  [/^\/student\/dashboard/, "Dashboard"],
  [/^\/student\/history/, "Session History"],
  [/^\/student\/interview\/setup/, "Interview Setup"],
  [/^\/student\/interview\/room/, "Interview Room"],
  [/^\/student\/interview\/report/, "Interview Report"],
  [/^\/student\/profile/, "Profile"],
  [/^\/admin\/login/, "TPO Portal"],
  [/^\/admin\/dashboard/, "TPO Dashboard"],
  [/^\/admin\/questions/, "Question Bank"],
  [/^\/privacy/, "Privacy Policy"],
  [/^\/terms/, "Terms of Use"],
];

/** Privacy-friendly page-view ping (path only, no identity) + tab titles. */
export default function PageView() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    const hit = TITLES.find(([re]) => re.test(pathname));
    if (hit) document.title = `${hit[1]} · PrepMate AI`;
    apiFetch("/analytics/pageview", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {});
  }, [pathname]);
  return null;
}
