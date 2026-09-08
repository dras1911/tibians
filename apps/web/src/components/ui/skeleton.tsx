import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Skeleton — shimmer placeholder. Architecture §6.4: use this instead of
 * a spinner. Always paired with the exact shape of the content it replaces
 * so layout doesn't shift when data arrives.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };