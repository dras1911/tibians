import type { Metadata } from "next";

/**
 * Metadata for the design-system showcase. Excluded from indexing per task
 * 3 acceptance criteria ("Nie indeksuj /dev/ui w robots.txt"). T65 will
 * also add the explicit robots.txt disallow rule.
 */
export const metadata: Metadata = {
  title: "Design system showcase",
  description: "Internal preview of every shadcn component × theme × density.",
  robots: { index: false, follow: false },
};

export default function DevUILayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}