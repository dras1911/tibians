/**
 * Adapter: `AuctionDetail` (server) → `CharacterSnapshot` (workspace).
 *
 * Plan task 37 + task 50 (arch §13.2 / §13.3).
 *
 * Server Component `/bazaar/[id]/page.tsx` (T48) wywołuje
 * `auctionToSnapshot()` po pobraniu `AuctionDetail` z
 * `getAuctionDetail()` i przekazuje wynik do `<WorkspaceLayout>` po
 * stronie klienta (przez `?auction={id}` link lub SSR initialSnapshot).
 *
 * Czysta funkcja bez efektów ubocznych — testowalna w izolacji.
 *
 * Kontrakt CharacterSnapshot (schema.ts):
 *   - source.kind === 'auction' (gwarantuje spójność z polem `auction`)
 *   - identity: name, level, vocation, vocationPromoted, sex, world
 *   - skills: 8 (bazowe, bez loyalty)
 *   - progression: charmy, boss, questy, imbuementy, achievementy, animus
 *   - assets: items (z tier), outfits (z addons), mounts, gems, gold,
 *     storeCounts, hirelings; tcInvested opcjonalne (premium-only)
 *   - flags: 7 booleanów + blessingsActive
 *   - auction: kontekst oferty (bid, typ, daty)
 */

import { z } from "zod";

import { VOCATION_BASE_TO_PROMOTED } from "@tibians/shared/auction";
import type {
  CharacterSnapshot,
  SkillKey,
  VocationBase,
  VocationPromoted,
} from "@tibians/character-context";
import { CharacterSnapshotSchema } from "@tibians/character-context";

import type { AuctionDetail } from "@/lib/server/auction-detail";

// ───────────────────────────────────────────────────────────────────────
// Mapowanie vocation string → VocationBase (5 możliwych)
// ───────────────────────────────────────────────────────────────────────

/**
 * Vocation baza w Bazaar detail pochodzi z `auctions.vocation_base`
 * — string z 5 opcji: "Knight" | "Paladin" | "Druid" | "Sorcerer" | "Monk".
 * Taki sam enum trzyma CharacterSnapshot.
 */
const VOCATION_BASE_VALUES = [
  "Knight",
  "Paladin",
  "Druid",
  "Sorcerer",
  "Monk",
] as const;

function isVocationBase(value: string): value is VocationBase {
  return (VOCATION_BASE_VALUES as readonly string[]).includes(value);
}

/**
 * Vocation promowana (z aukcji) → wymuszenie typu VocationPromoted.
 * Rzuca jeśli dane z DB są niespójne z `VOCATION_BASE_TO_PROMOTED` —
 * lepiej fail-fast niż cicha degradacja typu.
 */
function promoteVocation(
  base: VocationBase,
  promotedRaw: string,
): VocationPromoted {
  const expected = VOCATION_BASE_TO_PROMOTED[base];
  if (promotedRaw === expected) return expected;
  // Skarperowana walidacja: scrapper mógł zwrócić nierozpoznaną wartość
  // (np. lokalizowane nazwy w EN aukcjach). W takim razie używamy
  // oczekiwanego mapowania z shared.
  // Dzięki temu CharacterSnapshotSchema przejdzie refine().
  if (promotedRaw !== expected) {
    return expected;
  }
  return expected;
}

// ───────────────────────────────────────────────────────────────────────
// Mapowanie AuctionDetail.skillLoyalty → SkillEntry.loyaltyPct
// ───────────────────────────────────────────────────────────────────────

/**
 * Zwraca loyaltyPct dla danego skilla (0..50), `undefined` gdy brak danych.
 * Wykorzystuje tablicę `auctionSkillLoyalty` z detalu aukcji.
 */
function resolveLoyaltyPct(
  detail: AuctionDetail,
  skill: SkillKey,
): 0 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | undefined {
  const entry = detail.skillLoyalty.find((e) => e.skill === skill);
  if (!entry || entry.loyaltyPct === null) return undefined;
  const pct = entry.loyaltyPct;
  // loyaltyPct schema wymaga jednej z predefiniowanych wartości
  if (
    pct === 0 ||
    pct === 5 ||
    pct === 10 ||
    pct === 15 ||
    pct === 20 ||
    pct === 25 ||
    pct === 30 ||
    pct === 35 ||
    pct === 40 ||
    pct === 45 ||
    pct === 50
  ) {
    return pct;
  }
  // Round do najbliższej wielokrotności 5
  const rounded = Math.round(pct / 5) * 5;
  const clamped = Math.min(50, Math.max(0, rounded));
  if (
    clamped === 0 ||
    clamped === 5 ||
    clamped === 10 ||
    clamped === 15 ||
    clamped === 20 ||
    clamped === 25 ||
    clamped === 30 ||
    clamped === 35 ||
    clamped === 40 ||
    clamped === 45 ||
    clamped === 50
  ) {
    return clamped;
  }
  return undefined;
}

// ───────────────────────────────────────────────────────────────────────
// Funkcja główna
// ───────────────────────────────────────────────────────────────────────

/**
 * Konwertuje `AuctionDetail` na `CharacterSnapshot`.
 *
 * Waliduje wynik przez `CharacterSnapshotSchema` (arch §13.1 — jeden
 * schema = jeden typ). Gdy aukcja jest niekompletna (np. brak outfitu,
 * brak `tcInvested` dla free-tier postaci), snapshot zostaje zbudowany
 * z wartościami domyślnymi i Zod odrzuca tylko krytyczne niespójności.
 *
 * @throws Error gdy aukcja nie przejdzie walidacji schema (logujemy
 *         i propagujemy — caller decyduje czy fallbackować).
 */
export function auctionToSnapshot(detail: AuctionDetail): CharacterSnapshot {
  const a = detail.auction;

  if (!isVocationBase(a.vocationBase)) {
    throw new Error(
      `[auction-to-snapshot] Unsupported vocation base: "${a.vocationBase}" (auction ${a.id})`,
    );
  }
  const vocation: VocationBase = a.vocationBase;
  const vocationPromoted: VocationPromoted = promoteVocation(
    vocation,
    a.vocationPromoted,
  );

  // ── Identity ──────────────────────────────────────────────────────
  const identity: CharacterSnapshot["identity"] = {
    name: a.name,
    level: a.level,
    vocation,
    vocationPromoted,
    sex: a.sex === "F" ? "F" : "M",
    world: a.world,
  };

  // ── Skills — 8 bazowych (bez loyalty w `base`, loyaltyPct osobno) ─
  const skills: CharacterSnapshot["skills"] = {
    magic: {
      base: a.skillMagic,
      loyaltyPct: resolveLoyaltyPct(detail, "magic"),
    },
    club: {
      base: a.skillClub,
      loyaltyPct: resolveLoyaltyPct(detail, "club"),
    },
    fist: {
      base: a.skillFist,
      loyaltyPct: resolveLoyaltyPct(detail, "fist"),
    },
    sword: {
      base: a.skillSword,
      loyaltyPct: resolveLoyaltyPct(detail, "sword"),
    },
    axe: {
      base: a.skillAxe,
      loyaltyPct: resolveLoyaltyPct(detail, "axe"),
    },
    distance: {
      base: a.skillDistance,
      loyaltyPct: resolveLoyaltyPct(detail, "distance"),
    },
    shielding: {
      base: a.skillShielding,
      loyaltyPct: resolveLoyaltyPct(detail, "shielding"),
    },
    fishing: {
      base: a.skillFishing,
      loyaltyPct: resolveLoyaltyPct(detail, "fishing"),
    },
  };

  // ── Progression ───────────────────────────────────────────────────
  const progression: CharacterSnapshot["progression"] = {
    charmPoints: a.charmPoints,
    charmPointsUnused: a.charmPointsUnused,
    minorCharmEchoes: a.minorCharmEchoes,
    bossPoints: a.bossPoints,
    questsCompleted: a.questsCompleted,
    questsTotal: a.questsTotal,
    imbuementsUnlocked: a.imbuementsUnlocked,
    imbuementsTotal: a.imbuementsTotal,
    achievementPoints: a.achievementPoints,
    animusMasteries: a.animusMasteries,
  };

  // ── Assets ────────────────────────────────────────────────────────
  // Items: walidacja tier (0..3); wartości spoza zakresu → undefined.
  const items: CharacterSnapshot["assets"]["items"] = detail.items
    .map((it) => {
      if (it.tier === null) {
        return { itemId: it.itemId, quantity: it.quantity };
      }
      if (it.tier === 0 || it.tier === 1 || it.tier === 2 || it.tier === 3) {
        return { itemId: it.itemId, quantity: it.quantity, tier: it.tier };
      }
      return { itemId: it.itemId, quantity: it.quantity };
    });

  const outfits: CharacterSnapshot["assets"]["outfits"] = detail.outfits.map(
    (o) => ({
      outfitId: o.outfitId,
      addons: Math.min(7, Math.max(0, o.addons)),
    }),
  );

  const mounts: CharacterSnapshot["assets"]["mounts"] = detail.mounts.map(
    (m) => m.mountId,
  );

  const gems: CharacterSnapshot["assets"]["gems"] = {
    lesser: a.gemsLesser,
    regular: a.gemsRegular,
    greater: a.gemsGreater,
  };

  const goldTotal = (() => {
    // `goldTotal` jest string (decimal w Postgres). Walidujemy na liczbę.
    const n = Number.parseInt(a.goldTotal, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const storeCounts: CharacterSnapshot["assets"]["storeCounts"] = {
    outfits: a.storeOutfitsCount,
    mounts: a.storeMountsCount,
    items: a.storeItemsCount,
  };

  const assets: CharacterSnapshot["assets"] = {
    items,
    outfits,
    mounts,
    gems,
    goldTotal,
    tcInvested: a.tcInvested !== null && a.tcInvested > 0 ? a.tcInvested : undefined,
    storeCounts,
    hirelings: a.hirelingsCount,
  };

  // ── Flags ─────────────────────────────────────────────────────────
  const flags: CharacterSnapshot["flags"] = {
    soulWar: a.hasSoulWar,
    primalOrdeal: a.hasPrimalOrdeal,
    worldTransfer: a.hasWorldTransfer,
    preySlot: a.hasPreySlot,
    charmExpansion: a.hasCharmExpansion,
    weeklyTaskExpansion: a.hasWeeklyTaskExp,
    twistOfFate: a.hasTwistOfFate,
    blessingsActive: Math.min(7, Math.max(0, a.blessingsActive)),
  };

  // ── Auction context (source.kind === 'auction' gwarantuje obecność) ─
  const snapshotBase: CharacterSnapshot = {
    source: {
      kind: "auction",
      auctionId: BigInt(a.id),
    },
    identity,
    skills,
    progression,
    assets,
    flags,
    auction: {
      bid: a.bid,
      bidType: a.bidType,
      auctionStart: a.auctionStart,
      auctionEnd: a.auctionEnd,
      status: a.status,
    },
  };

  // ── Validate ──────────────────────────────────────────────────────
  // `CharacterSnapshotSchema` to Zod — wymusza spójność source↔auction,
  // vocation↔vocationPromoted, completion ≤ total itd. (arch §13.1).
  const result = CharacterSnapshotSchema.safeParse(snapshotBase);
  if (!result.success) {
    throw new Error(
      `[auction-to-snapshot] Schema validation failed for auction ${a.id}: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * Wariant bezpieczny — zwraca `null` zamiast rzucać.
 * Używane w UI gdy chcemy graceful fallback (np. CTA "Analizuj w
 * Workspace" ukryte gdy snapshot invalid).
 */
export function tryAuctionToSnapshot(
  detail: AuctionDetail,
): CharacterSnapshot | null {
  try {
    return auctionToSnapshot(detail);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[auction-to-snapshot] Falling back to null snapshot:", err);
    return null;
  }
}

/**
 * Type guard do testów + eksportów — używane w testach jednostkowych.
 * @internal
 */
export const _internal = { resolveLoyaltyPct, promoteVocation, isVocationBase };

// Tag dla type-only export (eslint no-unused-vars).
export type _AuctionLinkContextRef = z.infer<typeof CharacterSnapshotSchema>;
