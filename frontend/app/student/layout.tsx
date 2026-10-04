import RequireRole from "@/components/RequireRole";

// Every /student/* page is students-only. Officers hitting these URLs bounce
// to the TPO portal; signed-out visitors bounce to login.
export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireRole role="student">{children}</RequireRole>;
}
