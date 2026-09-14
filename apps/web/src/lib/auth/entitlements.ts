import { eq } from "drizzle-orm";

import { db } from "@tibians/db";
import { subscriptions, isPremiumActive } from "@tibians/db/schema";

/**
 * Entitlements (plan T83, arch §15.1) — jedyne źródło prawdy o tym, co
 * użytkownik może zobaczyć.
 *
 * Zasada (arch §15.3): FREE odpowiada na "czy warto?", PREMIUM na
 * "dlaczego tyle i co dalej". Nigdy nie gate'ujemy samej decyzji.
 */
export interface Entitlements {
  discordId: string | null;
  isPremium: boolean;
  /** Powód dla UI (np. tooltip na blur). */
  reason: "anonymous" | "free" | "premium" | "premium-expired" | "no-grant";
}

/** Feature keys — mapa feature → wymagany tier. */
export const PREMIUM_FEATURES = {
  /** Rozwijalny breakdown wyceny (⌘ "dlaczego tyle?"). */
  valuationBreakdown: true,
  /** Wykres historii bidów. */
  bidHistoryChart: true,
  /** Pole "zainwestowane" (tc_invested) — Exevo Pan trzyma za paywallem. */
  tcInvested: true,
  /** SSE bez limitu (free = top 5 aukcji). */
  unlimitedSse: true,
  /** Porównywarka do 4 aukcji + eksport CSV. */
  compareFourPlus: true,
  /** Brak reklam. */
  adFree: true,
  /** Nielimitowane zapisane postacie / presety. */
  unlimitedSaves: true,
} as const;

export type PremiumFeature = keyof typeof PREMIUM_FEATURES;

export async function getEntitlements(
  discordId: string | null,
): Promise<Entitlements> {
  if (!discordId) {
    return { discordId: null, isPremium: false, reason: "anonymous" };
  }

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.discordId, discordId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return { discordId, isPremium: false, reason: "no-grant" };
  }

  const active = isPremiumActive(row);
  if (active) {
    return { discordId, isPremium: true, reason: "premium" };
  }

  return {
    discordId,
    isPremium: false,
    reason: row.tier === "premium" ? "premium-expired" : "free",
  };
}

/** Czy dana funkcja jest odblokowana dla tych uprawnień? */
export function hasFeature(
  entitlements: Entitlements,
  _feature: PremiumFeature,
): boolean {
  // Wszystkie zdefiniowane feature'y są premium-only w MVP (arch §15.1).
  return entitlements.isPremium;
}
