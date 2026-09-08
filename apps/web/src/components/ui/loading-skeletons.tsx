import { cn } from "@/lib/utils";

/**
 * SkeletonButton — pre-shaped button-sized skeleton for the showcase
 * (architecture §6.4: skeleton matches the content's shape so layout
 * doesn't shift when data arrives).
 */
function SkeletonButton({
  className,
  size = "default",
}: {
  className?: string;
  size?: "sm" | "default" | "lg" | "icon";
}) {
  const sizeClass = {
    sm: "h-11 w-20",
    default: "h-10 w-24",
    lg: "h-13 w-32",
    icon: "h-11 w-11",
  }[size];
  return cn("animate-pulse rounded-md bg-muted", sizeClass, className);
}

/**
 * SkeletonCard — block-level card placeholder. Mirrors Card shape so the
 * transition from skeleton → real card is layout-stable.
 */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-6 shadow-sm space-y-3",
        className,
      )}
    >
      <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
    </div>
  );
}

export { SkeletonButton, SkeletonCard };