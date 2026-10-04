// PrepMate AI — skeleton placeholder for loading states.
// Theme-aware: visible on light and dark without custom colors.
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-[var(--surface-2)] rounded-xl ${className}`}
      aria-hidden="true"
    />
  );
}
