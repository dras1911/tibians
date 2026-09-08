/**
 * Testy round-trip URL + fuzzer — task 13 (100% coverage).
 *
 * Pokrycie:
 *   1. Fuzzer: 100+ losowych snapshotów przez snapshotToUrl → urlToSnapshot
 *      (seedowany xorshift32 PRNG, deterministyczny)
 *   2. URL < 8 KB dla wszystkich fuzzowanych snapshotów
 *   3. Corruption handling: invalid base64, valid base64 invalid JSON,
 *      valid JSON invalid Zod, uszkodzony gzip, nieznana flaga
 *   4. Unicode (polskie znaki, emoji, RTL) w name
 *   5. Extreme values (level 8/2500, auctionId MAX_SAFE_INTEGER+1)
 *   6. encoding.ts: atob catch (mock), pusty payload (mock atob → "")
 *   7. url-to-snapshot.ts: safeUrlToSnapshot nieoczekiwany błąd
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CharacterSnapshotSchema,
  type CharacterSnapshot,
  type SkillKey,
  SKILL_KEYS,
} from "../index.js";
import {
  CorruptedSnapshotUrlError,
  decodeSnapshot,
  encodeSnapshot,
  extractPayloadFromUrl,
  isValidSnapshotUrl,
  safeUrlToSnapshot,
  snapshotToUrl,
  urlToSnapshot,
} from "../transforms/index.js";

// ──────────────────────────────────────────────────────────────────────────
// Fuzzer — deterministyczny xorshift32 PRNG
// ──────────────────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const item = arr[Math.floor(rng() * arr.length)];
  if (item === undefined) throw new Error("pick from empty array");
  return item;
}

function randomString(rng: () => number, len: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyząćęłńóśźżĄĆĘŁŃÓŚŹŻ0123456789 -._";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += pick(rng, chars.split(""));
  }
  return out;
}

const VOCATION_PROMOTED = {
  Knight: "Elite Knight",
  Paladin: "Royal Paladin",
  Druid: "Elder Druid",
  Sorcerer: "Master Sorcerer",
  Monk: "Exalted Monk",
} as const;

/** Generuje losowy, ale zawsze poprawny snapshot (seedowany). */
function randomSnapshot(rng: () => number): CharacterSnapshot {
  const sources = ["auction", "manual", "imported"] as const;
  const vocations = ["Knight", "Paladin", "Druid", "Sorcerer", "Monk"] as const;
  const sex = ["M", "F"] as const;
  const worlds = ["Antica", "Jadebra", "Kalibra", "Premia", "Vunira"];

  const sourceKind = pick(rng, sources);
  const vocation = pick(rng, vocations);
  const auctionId = BigInt(Math.floor(rng() * 1e15));
  const hasAuction = sourceKind === "auction" && rng() > 0.3;
  const hasItems = rng() > 0.3;
  const hasOutfits = rng() > 0.5;
  const hasMounts = rng() > 0.4;

  return CharacterSnapshotSchema.parse({
    source:
      sourceKind === "auction"
        ? { kind: "auction", auctionId }
        : sourceKind === "imported"
          ? { kind: "imported", from: "tibia-com" }
          : { kind: "manual" },
    identity: {
      name: randomString(rng, 1 + Math.floor(rng() * 24)),
      level: 8 + Math.floor(rng() * 2493),
      vocation,
      vocationPromoted: VOCATION_PROMOTED[vocation],
      sex: pick(rng, sex),
      ...(rng() > 0.5 ? { world: pick(rng, worlds) } : {}),
    },
    skills: Object.fromEntries(
      SKILL_KEYS.map((k) => [
        k,
        {
          base: Math.floor(rng() * 130),
          ...(rng() > 0.7
            ? { loyaltyPct: [0, 5, 10, 15, 20, 25][Math.floor(rng() * 6)] }
            : {}),
          ...(rng() > 0.7 ? { percentToNext: Math.floor(rng() * 100) } : {}),
        },
      ]),
    ),
    progression: {
      charmPoints: Math.floor(rng() * 10000),
      charmPointsUnused: Math.floor(rng() * 1000),
      minorCharmEchoes: Math.floor(rng() * 100),
      bossPoints: Math.floor(rng() * 3000),
      questsTotal: 42,
      questsCompleted: Math.floor(rng() * 43),
      imbuementsTotal: 23,
      imbuementsUnlocked: Math.floor(rng() * 24),
      achievementPoints: Math.floor(rng() * 10000),
      animusMasteries: Math.floor(rng() * 200),
    },
    assets: {
      items: hasItems
        ? Array.from({ length: Math.floor(rng() * 30) }, () => ({
            itemId: 3000 + Math.floor(rng() * 1000),
            quantity: 1 + Math.floor(rng() * 10),
            ...(rng() > 0.7 ? { tier: Math.floor(rng() * 4) } : {}),
          }))
        : [],
      outfits: hasOutfits
        ? Array.from({ length: Math.floor(rng() * 10) }, () => ({
            outfitId: 100 + Math.floor(rng() * 2000),
            addons: Math.floor(rng() * 8),
          }))
        : [],
      mounts: hasMounts
        ? Array.from({ length: Math.floor(rng() * 5) }, () =>
            100 + Math.floor(rng() * 500),
          )
        : [],
      gems: {
        lesser: Math.floor(rng() * 100),
        regular: Math.floor(rng() * 50),
        greater: Math.floor(rng() * 20),
      },
      goldTotal: Math.floor(rng() * 1_000_000),
      ...(rng() > 0.7 ? { tcInvested: Math.floor(rng() * 5000) } : {}),
      storeCounts: {
        outfits: Math.floor(rng() * 20),
        mounts: Math.floor(rng() * 20),
        items: Math.floor(rng() * 50),
      },
      hirelings: Math.floor(rng() * 5),
    },
    flags: {
      soulWar: rng() > 0.5,
      primalOrdeal: rng() > 0.5,
      worldTransfer: rng() > 0.5,
      preySlot: rng() > 0.5,
      charmExpansion: rng() > 0.5,
      weeklyTaskExpansion: rng() > 0.5,
      twistOfFate: rng() > 0.5,
      blessingsActive: Math.floor(rng() * 8),
    },
    ...(hasAuction
      ? {
          auction: {
            bid: Math.floor(rng() * 100000),
            bidType: rng() > 0.5 ? "current" : "minimum",
            auctionStart: "2026-09-01T10:00:00.000Z",
            auctionEnd: "2026-09-15T22:00:00.000Z",
            status: rng() > 0.5 ? "active" : "finished",
          },
        }
      : {}),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Fuzzer — 100+ round-trip
// ──────────────────────────────────────────────────────────────────────────

describe("fuzzer — 100+ snapshotów round-trip", () => {
  it("150 losowych snapshotów: snapshotToUrl → urlToSnapshot (seed=42)", () => {
    const rng = makeRng(42);
    for (let i = 0; i < 150; i++) {
      const snap = randomSnapshot(rng);
      const { url } = snapshotToUrl(snap);
      const decoded = urlToSnapshot(url);
      expect(decoded, `snapshot #${i}`).toEqual(snap);
    }
  });

  it("150 losowych snapshotów: URL < 8 KB (limit przeglądarki)", () => {
    const rng = makeRng(42);
    let maxSize = 0;
    for (let i = 0; i < 150; i++) {
      const snap = randomSnapshot(rng);
      const { urlBytes } = snapshotToUrl(snap);
      expect(urlBytes, `snapshot #${i}`).toBeLessThan(8192);
      if (urlBytes > maxSize) maxSize = urlBytes;
    }
    expect(maxSize).toBeGreaterThan(0);
  });

  it("150 losowych snapshotów: encodeSnapshot/decodeSnapshot round-trip (seed=1337)", () => {
    const rng = makeRng(1337);
    for (let i = 0; i < 150; i++) {
      const snap = randomSnapshot(rng);
      const encoded = encodeSnapshot(snap);
      const decoded = decodeSnapshot(encoded.payload);
      expect(decoded, `snapshot #${i}`).toEqual(snap);
    }
  });

  it("fuzzer jest deterministyczny: seed=42 daje identyczne snapshots", () => {
    const rngA = makeRng(42);
    const rngB = makeRng(42);
    for (let i = 0; i < 50; i++) {
      expect(randomSnapshot(rngA)).toEqual(randomSnapshot(rngB));
    }
  });

  it("fuzzer pokrywa wszystkie 3 source kinds", () => {
    const rng = makeRng(42);
    const kinds = new Set<string>();
    for (let i = 0; i < 150; i++) {
      kinds.add(randomSnapshot(rng).source.kind);
    }
    expect(kinds).toEqual(new Set(["auction", "manual", "imported"]));
  });

  it("fuzzer pokrywa wszystkie 5 vocations", () => {
    const rng = makeRng(42);
    const vocations = new Set<string>();
    for (let i = 0; i < 150; i++) {
      vocations.add(randomSnapshot(rng).identity.vocation);
    }
    expect(vocations).toEqual(
      new Set(["Knight", "Paladin", "Druid", "Sorcerer", "Monk"]),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Unicode — polskie znaki, emoji, RTL
// ──────────────────────────────────────────────────────────────────────────

describe("Unicode w name", () => {
  function baseManual(): CharacterSnapshot {
    return CharacterSnapshotSchema.parse({
      source: { kind: "manual" },
      identity: {
        name: "Test",
        level: 100,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: {
        magic: { base: 0 },
        club: { base: 0 },
        fist: { base: 0 },
        sword: { base: 0 },
        axe: { base: 0 },
        distance: { base: 0 },
        shielding: { base: 0 },
        fishing: { base: 0 },
      },
      progression: {
        charmPoints: 0,
        charmPointsUnused: 0,
        minorCharmEchoes: 0,
        bossPoints: 0,
        questsCompleted: 0,
        questsTotal: 0,
        imbuementsUnlocked: 0,
        imbuementsTotal: 0,
        achievementPoints: 0,
        animusMasteries: 0,
      },
      assets: {
        items: [],
        outfits: [],
        mounts: [],
        gems: { lesser: 0, regular: 0, greater: 0 },
        goldTotal: 0,
        storeCounts: { outfits: 0, mounts: 0, items: 0 },
        hirelings: 0,
      },
      flags: {
        soulWar: false,
        primalOrdeal: false,
        worldTransfer: false,
        preySlot: false,
        charmExpansion: false,
        weeklyTaskExpansion: false,
        twistOfFate: false,
        blessingsActive: 0,
      },
    });
  }

  it("polskie znaki: 'Migień Ąćłń'", () => {
    const snap = baseManual();
    const withPolish = {
      ...snap,
      identity: { ...snap.identity, name: "Migień Ąćłń" },
    };
    const { url } = snapshotToUrl(withPolish);
    const decoded = urlToSnapshot(url);
    expect(decoded?.identity.name).toBe("Migień Ąćłń");
  });

  it("emoji w item names i name", () => {
    const snap = baseManual();
    const withEmoji = {
      ...snap,
      identity: { ...snap.identity, name: "💀🔥 Migzen" },
    };
    const { url } = snapshotToUrl(withEmoji);
    const decoded = urlToSnapshot(url);
    expect(decoded?.identity.name).toBe("💀🔥 Migzen");
  });

  it("RTL characters (arabski)", () => {
    const snap = baseManual();
    const withRtl = {
      ...snap,
      identity: { ...snap.identity, name: "ميجن" },
    };
    const { url } = snapshotToUrl(withRtl);
    const decoded = urlToSnapshot(url);
    expect(decoded?.identity.name).toBe("ميجن");
  });

  it("non-breaking space U+00A0 zachowany", () => {
    const snap = baseManual();
    const withNbsp = {
      ...snap,
      identity: { ...snap.identity, name: "Migzen\u00A0Hardcore" },
    };
    const { url } = snapshotToUrl(withNbsp);
    const decoded = urlToSnapshot(url);
    expect(decoded?.identity.name).toBe("Migzen\u00A0Hardcore");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. Extreme values
// ──────────────────────────────────────────────────────────────────────────

describe("extreme values", () => {
  it("level 8 (minimum) round-trip", () => {
    const snap = randomSnapshot(makeRng(1));
    const extreme = {
      ...snap,
      identity: { ...snap.identity, level: 8 },
    };
    const { url } = snapshotToUrl(extreme);
    expect(urlToSnapshot(url)?.identity.level).toBe(8);
  });

  it("level 2500 (maximum) round-trip", () => {
    const snap = randomSnapshot(makeRng(1));
    const extreme = {
      ...snap,
      identity: { ...snap.identity, level: 2500 },
    };
    const { url } = snapshotToUrl(extreme);
    expect(urlToSnapshot(url)?.identity.level).toBe(2500);
  });

  it("auctionId 9_007_199_254_740_991n (MAX_SAFE_INTEGER+1) round-trip", () => {
    const snap = randomSnapshot(makeRng(1));
    const extreme: CharacterSnapshot = {
      ...snap,
      source: { kind: "auction", auctionId: 9_007_199_254_740_991n },
    };
    const { url } = snapshotToUrl(extreme);
    const decoded = urlToSnapshot(url);
    expect(decoded?.source.kind).toBe("auction");
    if (decoded?.source.kind === "auction") {
      expect(decoded.source.auctionId).toBe(9_007_199_254_740_991n);
    }
  });

  it("puste arrays (items/outfits/mounts) round-trip", () => {
    const snap = randomSnapshot(makeRng(1));
    const empty = {
      ...snap,
      assets: {
        ...snap.assets,
        items: [],
        outfits: [],
        mounts: [],
      },
    };
    const { url } = snapshotToUrl(empty);
    const decoded = urlToSnapshot(url);
    expect(decoded?.assets.items).toEqual([]);
    expect(decoded?.assets.outfits).toEqual([]);
    expect(decoded?.assets.mounts).toEqual([]);
  });

  it("duże liczby (goldTotal 1e9, charmPoints 1e6) round-trip", () => {
    const snap = randomSnapshot(makeRng(1));
    const big = {
      ...snap,
      assets: { ...snap.assets, goldTotal: 1_000_000_000 },
      progression: { ...snap.progression, charmPoints: 1_000_000 },
    };
    const { url } = snapshotToUrl(big);
    const decoded = urlToSnapshot(url);
    expect(decoded?.assets.goldTotal).toBe(1_000_000_000);
    expect(decoded?.progression.charmPoints).toBe(1_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Corruption handling
// ──────────────────────────────────────────────────────────────────────────

describe("corruption handling", () => {
  it("invalid base64 (niedozwolone znaki) → CorruptedSnapshotUrlError", () => {
    expect(() => urlToSnapshot("/workspace?s=!!!invalid!!!")).toThrow(
      CorruptedSnapshotUrlError,
    );
  });

  it("invalid base64 (zła długość) → CorruptedSnapshotUrlError", () => {
    // 1 znak → padding 1 → nieprawidłowa długość.
    expect(() => decodeSnapshot("a")).toThrow(CorruptedSnapshotUrlError);
  });

  it("valid base64 + invalid JSON → CorruptedSnapshotUrlError", () => {
    const garbage = btoa("p" + "not json at all")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    expect(() => decodeSnapshot(garbage)).toThrow(CorruptedSnapshotUrlError);
  });

  it("valid JSON + invalid Zod (level 5) → CorruptedSnapshotUrlError", () => {
    const invalidJson = JSON.stringify({
      source: { kind: "manual" },
      identity: {
        name: "X",
        level: 5,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: {
        magic: { base: 0 },
        club: { base: 0 },
        fist: { base: 0 },
        sword: { base: 0 },
        axe: { base: 0 },
        distance: { base: 0 },
        shielding: { base: 0 },
        fishing: { base: 0 },
      },
      progression: {
        charmPoints: 0,
        charmPointsUnused: 0,
        minorCharmEchoes: 0,
        bossPoints: 0,
        questsCompleted: 0,
        questsTotal: 0,
        imbuementsUnlocked: 0,
        imbuementsTotal: 0,
        achievementPoints: 0,
        animusMasteries: 0,
      },
      assets: {
        items: [],
        outfits: [],
        mounts: [],
        gems: { lesser: 0, regular: 0, greater: 0 },
        goldTotal: 0,
        storeCounts: { outfits: 0, mounts: 0, items: 0 },
        hirelings: 0,
      },
      flags: {
        soulWar: false,
        primalOrdeal: false,
        worldTransfer: false,
        preySlot: false,
        charmExpansion: false,
        weeklyTaskExpansion: false,
        twistOfFate: false,
        blessingsActive: 0,
      },
    });
    const garbage = btoa("p" + invalidJson)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    expect(() => decodeSnapshot(garbage)).toThrow(CorruptedSnapshotUrlError);
  });

  it("valid snapshot URL ale schema fail (obce pole) → CorruptedSnapshotUrlError", () => {
    const snap = randomSnapshot(makeRng(7));
    const withExtra = { ...snap, extraField: 1 };
    const encoded = encodeSnapshot(withExtra as unknown as CharacterSnapshot);
    expect(() => decodeSnapshot(encoded.payload)).toThrow(
      CorruptedSnapshotUrlError,
    );
  });

  it("uszkodzony gzip → CorruptedSnapshotUrlError", () => {
    const garbage = btoa(String.fromCharCode(0x7a, ...Array(20).fill(0x42)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    expect(() => decodeSnapshot(garbage)).toThrow(CorruptedSnapshotUrlError);
  });

  it("nieznana flaga → CorruptedSnapshotUrlError", () => {
    const garbage = "x" + "A".repeat(20);
    expect(() => decodeSnapshot(garbage)).toThrow(CorruptedSnapshotUrlError);
  });

  it("niepoprawny UTF-8 → CorruptedSnapshotUrlError", () => {
    const garbage = btoa(String.fromCharCode(0x70, 0xff, 0xfe, 0xfd, 0xfc))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    expect(() => decodeSnapshot(garbage)).toThrow(CorruptedSnapshotUrlError);
  });

  it("pusty payload → CorruptedSnapshotUrlError", () => {
    expect(() => decodeSnapshot("")).toThrow(CorruptedSnapshotUrlError);
  });

  it("urlToSnapshot: zły prefix → CorruptedSnapshotUrlError", () => {
    // Poprawny base64url ale flaga 'x' — isValidSnapshotUrl odrzuca.
    const garbage = "x" + "A".repeat(20);
    expect(() => urlToSnapshot(`/workspace?s=${garbage}`)).toThrow(
      CorruptedSnapshotUrlError,
    );
  });

  it("urlToSnapshot: brak ?s= → null", () => {
    expect(urlToSnapshot("/workspace")).toBeNull();
    expect(urlToSnapshot("https://x.com/workspace?other=1")).toBeNull();
  });

  it("CorruptedSnapshotUrlError ma name i cause", () => {
    try {
      decodeSnapshot("!!!bad!!!");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CorruptedSnapshotUrlError);
      if (e instanceof CorruptedSnapshotUrlError) {
        expect(e.name).toBe("CorruptedSnapshotUrlError");
        expect(e.message.length).toBeGreaterThan(0);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. encoding.ts — atob catch (mock) i pusty payload
// ──────────────────────────────────────────────────────────────────────────

describe("encoding.ts — atob edge cases (mock)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("atob rzuca → CorruptedSnapshotUrlError z cause", () => {
    const originalAtob = globalThis.atob;
    vi.stubGlobal(
      "atob",
      vi.fn(() => {
        throw new Error("atob exploded");
      }),
    );
    try {
      expect(() => decodeSnapshot("AAAA")).toThrow(CorruptedSnapshotUrlError);
    } finally {
      globalThis.atob = originalAtob;
    }
  });

  it("atob zwraca pusty string → 'Pusty payload' (linia 319-320)", () => {
    const originalAtob = globalThis.atob;
    vi.stubGlobal(
      "atob",
      vi.fn(() => ""),
    );
    try {
      // "AAAA" to poprawny base64url — atob mock zwraca "" → 0 bajtów.
      expect(() => decodeSnapshot("AAAA")).toThrow(/Pusty payload/);
    } finally {
      globalThis.atob = originalAtob;
    }
  });

  it("isValidSnapshotUrl: atob zwraca '' → first.length < 1 → false", () => {
    const originalAtob = globalThis.atob;
    vi.stubGlobal(
      "atob",
      vi.fn(() => ""),
    );
    try {
      // "AAAA" przechodzi regex, ale atob zwraca "" → 0 bajtów → false.
      expect(isValidSnapshotUrl("AAAA")).toBe(false);
    } finally {
      globalThis.atob = originalAtob;
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. safeUrlToSnapshot — nieoczekiwany błąd (nie CorruptedSnapshotUrlError)
// ──────────────────────────────────────────────────────────────────────────

describe("safeUrlToSnapshot — nieoczekiwany błąd", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("zwraca corrupted z genericznym komunikatem gdy safeParse rzuca", () => {
    const snap = randomSnapshot(makeRng(3));
    const { url } = snapshotToUrl(snap);
    // Mockujemy safeParse żeby rzucił nie-CorruptedSnapshotUrlError.
    vi.spyOn(CharacterSnapshotSchema, "safeParse").mockImplementation(() => {
      throw new Error("unexpected");
    });
    const result = safeUrlToSnapshot(url);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "corrupted") {
      expect(result.message).toBe("Nieoczekiwany błąd dekodowania");
    }
  });

  it("zwraca corrupted z message dla CorruptedSnapshotUrlError", () => {
    const result = safeUrlToSnapshot("/workspace?s=!!!bad!!!");
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "corrupted") {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("zwraca missing dla URL bez ?s=", () => {
    expect(safeUrlToSnapshot("/workspace")).toEqual({
      ok: false,
      error: "missing",
    });
  });

  it("zwraca ok:true dla poprawnego URL", () => {
    const snap = randomSnapshot(makeRng(5));
    const { url } = snapshotToUrl(snap);
    const result = safeUrlToSnapshot(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot).toEqual(snap);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. Helpery — isValidSnapshotUrl / extractPayloadFromUrl
// ──────────────────────────────────────────────────────────────────────────

describe("isValidSnapshotUrl / extractPayloadFromUrl", () => {
  it("isValidSnapshotUrl: akceptuje plain i gzip, odrzuca śmieci", () => {
    const snap = randomSnapshot(makeRng(9));
    const plain = encodeSnapshot(snap);
    expect(isValidSnapshotUrl(plain.payload)).toBe(true);
    // Duży snapshot → gzip.
    const big = randomSnapshot(makeRng(11));
    const gzip = encodeSnapshot(big);
    expect(isValidSnapshotUrl(gzip.payload)).toBe(true);
    expect(isValidSnapshotUrl("")).toBe(false);
    expect(isValidSnapshotUrl("abc")).toBe(false);
    expect(isValidSnapshotUrl("!!!bad!!!")).toBe(false);
  });

  it("extractPayloadFromUrl: pełny URL, search, goły payload", () => {
    const snap = randomSnapshot(makeRng(13));
    const { payload, url } = snapshotToUrl(snap);
    expect(extractPayloadFromUrl(url)).toBe(payload);
    expect(extractPayloadFromUrl(`?s=${payload}`)).toBe(payload);
    expect(extractPayloadFromUrl(payload)).toBe(payload);
    expect(extractPayloadFromUrl("")).toBeNull();
    expect(extractPayloadFromUrl("/workspace")).toBeNull();
    expect(extractPayloadFromUrl("/workspace?s=")).toBeNull();
  });

  it("extractPayloadFromUrl: zachowuje inne parametry", () => {
    const snap = randomSnapshot(makeRng(15));
    const { payload } = snapshotToUrl(snap);
    expect(extractPayloadFromUrl(`/workspace?s=${payload}&auction=123`)).toBe(
      payload,
    );
  });

  it("extractPayloadFromUrl: 'foo?s=abc' (z '=' i '?') → 'abc'", () => {
    // Zawiera '=' i nie jest gołym payloadem, ale ma '?' → idx >= 0.
    expect(extractPayloadFromUrl("foo?s=abc")).toBe("abc");
  });

  it("extractPayloadFromUrl: 's=abc&auction=1' (bez '?') → 'abc'", () => {
    // Zawiera '=' i nie jest gołym payloadem, bez '?' → idx < 0 → `?${...}`.
    expect(extractPayloadFromUrl("s=abc&auction=1")).toBe("abc");
  });

  it("extractPayloadFromUrl: pełny URL z scheme → parsowany przez URL", () => {
    const snap = randomSnapshot(makeRng(23));
    const { payload } = snapshotToUrl(snap);
    expect(
      extractPayloadFromUrl(`https://x.com/workspace?s=${payload}&ref=1`),
    ).toBe(payload);
  });

  it("extractPayloadFromUrl: nieprawidłowy URL → null (catch)", () => {
    // "http://[::1" — bez '=' i nie jest gołym payloadem → new URL rzuca → catch.
    expect(extractPayloadFromUrl("http://[::1")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 8. Kompresja — decyzja plain vs gzip
// ──────────────────────────────────────────────────────────────────────────

describe("kompresja plain vs gzip", () => {
  it("mały snapshot → plain, duży → gzip", () => {
    // Wymuszamy mały snapshot: minimalny manual.
    const minimal = CharacterSnapshotSchema.parse({
      source: { kind: "manual" },
      identity: {
        name: "X",
        level: 8,
        vocation: "Knight",
        vocationPromoted: "Elite Knight",
        sex: "M",
      },
      skills: {
        magic: { base: 0 },
        club: { base: 0 },
        fist: { base: 0 },
        sword: { base: 0 },
        axe: { base: 0 },
        distance: { base: 0 },
        shielding: { base: 0 },
        fishing: { base: 0 },
      },
      progression: {
        charmPoints: 0,
        charmPointsUnused: 0,
        minorCharmEchoes: 0,
        bossPoints: 0,
        questsCompleted: 0,
        questsTotal: 0,
        imbuementsUnlocked: 0,
        imbuementsTotal: 0,
        achievementPoints: 0,
        animusMasteries: 0,
      },
      assets: {
        items: [],
        outfits: [],
        mounts: [],
        gems: { lesser: 0, regular: 0, greater: 0 },
        goldTotal: 0,
        storeCounts: { outfits: 0, mounts: 0, items: 0 },
        hirelings: 0,
      },
      flags: {
        soulWar: false,
        primalOrdeal: false,
        worldTransfer: false,
        preySlot: false,
        charmExpansion: false,
        weeklyTaskExpansion: false,
        twistOfFate: false,
        blessingsActive: 0,
      },
    });
    const plain = encodeSnapshot(minimal);
    expect(plain.compressed).toBe(false);

    // Duży snapshot z wieloma itemami → gzip.
    const big = randomSnapshot(makeRng(19));
    const gzip = encodeSnapshot(big);
    expect(gzip.compressed).toBe(true);
    expect(gzip.rawBytes).toBeGreaterThanOrEqual(1024);
  });

  it("encodedBytes ≤ rawBytes × 1.34 + overhead", () => {
    const snap = randomSnapshot(makeRng(21));
    const encoded = encodeSnapshot(snap);
    expect(encoded.encodedBytes).toBeLessThan(
      Math.ceil(encoded.rawBytes * 1.34) + 4,
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 9. Typy pomocnicze — SkillKey
// ──────────────────────────────────────────────────────────────────────────

describe("SkillKey typy", () => {
  it("SKILL_KEYS ma 8 kluczy", () => {
    expect(SKILL_KEYS).toHaveLength(8);
  });

  it("skillsBase Record<SkillKey, number> działa", () => {
    const base: Record<SkillKey, number> = {
      magic: 1,
      club: 2,
      fist: 3,
      sword: 4,
      axe: 5,
      distance: 6,
      shielding: 7,
      fishing: 8,
    };
    expect(base.sword).toBe(4);
  });
});