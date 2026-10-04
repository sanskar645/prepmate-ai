"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

/**
 * Route-level role separation (the API enforces it too — this is the UX
 * layer). Students landing here go to their dashboard; officers go to the
 * TPO portal; strangers go to login. Renders nothing until decided, so a
 * wrong-role page never flashes.
 */
export default function RequireRole({
  role,
  children,
}: {
  role: "student" | "admin";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { role: actual } = useAuth();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    // Context starts undefined until its first read; wait for it instead of
    // reading localStorage a second time (single source of truth).
    if (actual === undefined) return;
    if (!actual) {
      router.replace("/login");
      return;
    }
    if (actual !== role) {
      router.replace(
        actual === "admin" ? "/admin/dashboard" : "/student/dashboard"
      );
      return;
    }
    setOk(true);
  }, [actual, role, router]);

  if (!ok) return null;
  return <>{children}</>;
}
