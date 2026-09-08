import {
  Calculator,
  CalendarCheck,
  Coins,
  Flame,
  Heart,
  Hourglass,
  type LucideIcon,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

/**
 * Catalog of all 14 calculator + planner pages.
 *
 * One source of truth for:
 *   - the `/calculators` index page (groups cards into 6 categories),
 *   - the `/calculators/[slug]` dynamic route (renders titles, breadcrumbs
 *     and meta tags from this array),
 *   - the mega-menu (header/mobile-sheet — also reads from this when
 *     listing calculators).
 *
 * When a calculator lands (T17-T23), its implementation file imports the
 * matching slug from here so the catalog, route, and form stay in sync.
 *
 * The six categories below mirror the landing-page section order
 * (architecture §13.4 — landing SEO + Workspace are two complementary
 * surfaces):
 *
 *   1. Skills & Training (4) — exercise / training / true-skill / blessings
 *   2. Stamina             (1)
 *   3. Wycena postaci      (1) — character-value
 *   4. Imbuement & Charms  (3) — imbuement / weekly-tasks / charms
 *   5. Experience          (3) — experience / leech / exp-share
 *   6. Wheel               (2) — planners/charms + planners/wheel
 */
export type CalculatorCategory =
  | "skillsTraining"
  | "stamina"
  | "valuation"
  | "imbuementCharms"
  | "experience"
  | "wheel";

export interface CalculatorMeta {
  /** Locale-relative path, e.g. "/calculators/exercise-weapons". */
  slug: string;
  /** Icon shown on the card (Lucide). */
  icon: LucideIcon;
  /** Group used for the index page. */
  category: CalculatorCategory;
  /** Whether this entry is a "planner" (lives under /planners/*) or a calculator. */
  kind: "calculator" | "planner";
  /**
   * `generateMetadata()` per slug MUST return ≤ 60 chars (Google SERP cap).
   * The localized title is read from `messages.<locale>.json` via the
   * `Calculators.index.items.<slug>.title` key, so this is only used as
   * a typed default.
   */
  messageKey: string;
}

export const CALCULATORS: readonly CalculatorMeta[] = [
  // ─── Skills & Training (4) ───────────────────────────────────────────
  {
    slug: "/calculators/exercise-weapons",
    icon: Swords,
    category: "skillsTraining",
    kind: "calculator",
    messageKey: "exercise-weapons",
  },
  {
    slug: "/calculators/skills",
    icon: Target,
    category: "skillsTraining",
    kind: "calculator",
    messageKey: "skills",
  },
  {
    slug: "/calculators/true-skill",
    icon: TrendingUp,
    category: "skillsTraining",
    kind: "calculator",
    messageKey: "true-skill",
  },
  {
    slug: "/calculators/blessings",
    icon: Shield,
    category: "skillsTraining",
    kind: "calculator",
    messageKey: "blessings",
  },

  // ─── Stamina (1) ─────────────────────────────────────────────────────
  {
    slug: "/calculators/stamina",
    icon: Hourglass,
    category: "stamina",
    kind: "calculator",
    messageKey: "stamina",
  },

  // ─── Wycena postaci (1) ──────────────────────────────────────────────
  {
    slug: "/calculators/character-value",
    icon: Coins,
    category: "valuation",
    kind: "calculator",
    messageKey: "character-value",
  },

  // ─── Imbuement & Charms (3) ──────────────────────────────────────────
  {
    slug: "/calculators/imbuement",
    icon: Sparkles,
    category: "imbuementCharms",
    kind: "calculator",
    messageKey: "imbuement",
  },
  {
    slug: "/calculators/weekly-tasks",
    icon: CalendarCheck,
    category: "imbuementCharms",
    kind: "calculator",
    messageKey: "weekly-tasks",
  },
  {
    slug: "/calculators/charms",
    icon: Heart,
    category: "imbuementCharms",
    kind: "calculator",
    messageKey: "charms",
  },

  // ─── Experience (3) ──────────────────────────────────────────────────
  {
    slug: "/calculators/experience",
    icon: Calculator,
    category: "experience",
    kind: "calculator",
    messageKey: "experience",
  },
  {
    slug: "/calculators/leech",
    icon: Zap,
    category: "experience",
    kind: "calculator",
    messageKey: "leech",
  },
  {
    slug: "/calculators/exp-share",
    icon: Users,
    category: "experience",
    kind: "calculator",
    messageKey: "exp-share",
  },

  // ─── Wheel & Planners (2) ────────────────────────────────────────────
  {
    slug: "/planners/charms",
    icon: Star,
    category: "wheel",
    kind: "planner",
    messageKey: "planners-charms",
  },
  {
    slug: "/planners/wheel",
    icon: Flame,
    category: "wheel",
    kind: "planner",
    messageKey: "planners-wheel",
  },
] as const;

/**
 * Display order of categories on the `/calculators` index page. Categories
 * not in this list (none today) are silently dropped from the index.
 */
export const CATEGORY_ORDER: readonly CalculatorCategory[] = [
  "skillsTraining",
  "stamina",
  "valuation",
  "imbuementCharms",
  "experience",
  "wheel",
] as const;

/**
 * Lookup helpers — used by the dynamic `/calculators/[slug]/page.tsx` to
 * resolve `params.slug` (which only contains the tail, e.g.
 * "exercise-weapons" for `/calculators/exercise-weapons`).
 *
 * T17-T23 calculator pages import these to validate their slug + look up
 * the icon/category so each individual calculator page stays a thin shell
 * over `<CalculatorLayout>` + `<CalculatorForm>` + `<ResultDisplay>`.
 */
export function findCalculatorBySlug(
  slug: string,
): CalculatorMeta | undefined {
  return CALCULATORS.find((c) => {
    // Match against the last path segment of either "/calculators/<slug>"
    // or "/planners/<slug>".
    const parts = c.slug.split("/");
    return parts[parts.length - 1] === slug;
  });
}

export function getCalculatorsByCategory(
  category: CalculatorCategory,
): CalculatorMeta[] {
  return CALCULATORS.filter((c) => c.category === category);
}