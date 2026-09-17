/**
 * Testy parsera detalu aukcji Bazaara Tibii — **v2 (realny layout)**.
 *
 * Filozofia:
 *   - fixture'y to KOPIE 1:1 żywych stron tibia.com (pobrane 2026-09-17
 *     przez FlareSolverr+WARP; patrz `__fixtures__/README.md`),
 *   - asercje na konkretnych wartościach z każdej aukcji (mutation guard),
 *   - pokrycie: identity / bid / daty / skille / progresja / zasoby / flagi /
 *     relacje 1:N / harvest słowników / helpery / guard błędnych stron.
 *
 * Fixture'y:
 *   - `auction-detail-live-2259395.html` — Lancelot royal archer (RP 402, aktywna)
 *   - `auction-detail-live-2252245.html` — Misericuerdia (K 15, zakończona „Winning Bid")
 *   - `auction-detail-live-2258972.html` — Khufuh (EK 865, Primal Ordeal, hash-world)
 *   - `auction-detail-live-2255748.html` — Fuurius (EK 93, aktywna, bogate USP)
 *   - `auction-detail-live-2258274.html` — Crazy Persil (MS 131, brak sekcji USP)
 *
 * UWAGA: stary layout v1 (fikcyjne fixture'y `auction-detail-*.html` bez
 * sufiksu `-live-`) NIE jest już testowany — parser v1 nie potrafił czytać
 * prawdziwego tibia.com (patrz nagłówek `auction-detail.ts`).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isAuctionDetailSuccessful,
  parseAuctionDetail,
  parseLocaleNumber,
  parsePlDate,
  parseTibiaDateTime,
  rawJsonHash,
  resolveWorldId,
} from "./auction-detail.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "./__fixtures__");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

// ══════════════════════════════════════════════════════════════════════════
// 1. Lancelot royal archer (RP 402, aktywna aukcja) — pełny „rich" fixture
// ══════════════════════════════════════════════════════════════════════════

describe("parseAuctionDetail — Lancelot royal archer (live 2259395)", () => {
  const html = loadFixture("auction-detail-live-2259395.html");
  const result = parseAuctionDetail(html, 2259395n);

  it("parsuje się bez błędu (auction != null, parseError == null)", () => {
    expect(result.parseError).toBeNull();
    expect(result.auction).not.toBeNull();
    expect(isAuctionDetailSuccessful(result)).toBe(true);
  });

  it("identity: name/level/vocation/sex/world/outfit", () => {
    const a = result.auction;
    expect(a?.id).toBe(2259395n);
    expect(a?.name).toBe("Lancelot royal archer");
    expect(a?.level).toBe(402);
    expect(a?.vocation).toBe("Paladin");
    expect(a?.vocationPromoted).toBe("Royal Paladin");
    expect(a?.sex).toBe("M");
    expect(a?.worldId).toBe(1); // Antica → 1 (KNOWN_WORLDS)
    expect(a?.outfitId).toBe(972);
  });

  it("bid: minimum 2500, status active", () => {
    expect(result.auction?.bid).toBe(2500);
    expect(result.auction?.bidType).toBe("minimum");
    expect(result.auction?.status).toBe("active");
  });

  it("daty: start z tekstu (CEST→UTC), end z data-timestamp", () => {
    // „Sep 16 2026, 10:06 CEST" → 08:06 UTC
    expect(result.auction?.auctionStart).toBe("2026-09-16T08:06:00.000Z");
    // data-timestamp=1789664400 → 2026-09-17T17:00:00Z (19:00 CEST)
    expect(result.auction?.auctionEnd).toBe("2026-09-17T17:00:00.000Z");
  });

  it("wszystkie 8 skilli (denormalizowane kolumny)", () => {
    const a = result.auction;
    expect(a?.skillMagic).toBe(30);
    expect(a?.skillClub).toBe(12);
    expect(a?.skillFist).toBe(17);
    expect(a?.skillSword).toBe(36);
    expect(a?.skillAxe).toBe(25);
    expect(a?.skillDistance).toBe(119);
    expect(a?.skillShielding).toBe(108);
    expect(a?.skillFishing).toBe(20);
  });

  it("progresja: charm points = available + spent; echoes; boss; imbuements; quests", () => {
    const a = result.auction;
    expect(a?.charmPoints).toBe(3523); // 523 + 3000
    expect(a?.charmPointsUnused).toBe(523);
    expect(a?.minorCharmEchoes).toBe(400); // 50 + 350
    expect(a?.bossPoints).toBe(1415);
    expect(a?.imbuementsUnlocked).toBe(21);
    expect(a?.imbuementsTotal).toBe(23);
    expect(a?.questsCompleted).toBe(20);
    expect(a?.questsTotal).toBe(42);
    expect(a?.achievementPoints).toBe(314);
    expect(a?.animusMasteries).toBe(0);
    expect(a?.blessingsActive).toBe(5);
  });

  it("zasoby: gemy (lesser/regular/greater), store counts, hirelings, gold", () => {
    const a = result.auction;
    expect(a?.gemsLesser).toBe(4);
    expect(a?.gemsRegular).toBe(4);
    expect(a?.gemsGreater).toBe(0);
    expect(a?.storeOutfitsCount).toBe(3);
    expect(a?.storeMountsCount).toBe(2);
    expect(a?.storeItemsCount).toBe(14);
    expect(a?.hirelingsCount).toBe(1);
    expect(a?.goldTotal).toBe(28552n);
    expect(a?.tcInvested).toBeNull();
  });

  it("flagi: World Transfer + Prey Slot + Twist of Fate; brak Soul War/Primal", () => {
    const a = result.auction;
    expect(a?.hasSoulWar).toBe(false);
    expect(a?.hasPrimalOrdeal).toBe(false);
    expect(a?.hasWorldTransfer).toBe(true);
    expect(a?.hasPreySlot).toBe(true);
    expect(a?.hasCharmExpansion).toBe(false);
    expect(a?.hasWeeklyTaskExpansion).toBe(false);
    expect(a?.hasTwistOfFate).toBe(true);
  });

  it("relacje: 90 itemów (76 + 14 store), 31 outfitów, 17 mountów", () => {
    expect(result.items).toHaveLength(90);
    expect(result.outfits).toHaveLength(31);
    expect(result.mounts).toHaveLength(17);
  });

  it("itemy: ilość z ObjectAmount („5x big table” → 5), nazwa bez prefiksu", () => {
    const bait = result.items.find((i) => i.itemId === 939);
    expect(bait?.quantity).toBe(1);
    expect(bait?.tier).toBe(0); // konwencja: 0 = base (kolumna NOT NULL przez PK)
    const bigTable = result.items.find((i) => i.itemId === 2314);
    expect(bigTable?.quantity).toBe(5);
  });

  it("outfity: addon maska z URL (972_0 → 0, 129_3 → 3)", () => {
    const o129 = result.outfits.find((o) => o.outfitId === 129);
    expect(o129?.addons).toBe(3);
    const o132 = result.outfits.find((o) => o.outfitId === 132);
    expect(o132?.addons).toBe(0);
  });

  it("USP: 5 linijek z kategoriami z ikon usp-category-N.png", () => {
    expect(result.usps).toHaveLength(5);
    const dummy = result.usps.find((u) => u.text.includes("ferumbras exercise dummy"));
    expect(dummy?.category).toBe(4); // store items
    expect(dummy?.sortOrder).toBe(0);
    const slots = result.usps.find((u) => u.text.includes("Additional Slots"));
    expect(slots?.category).toBe(5); // cosmetic
  });

  it("harvest słowników: świat + nazwy/obrazki itemów/outfitów/mountów", () => {
    expect(result.reference.world).toEqual({ id: 1, name: "Antica" });
    expect(result.reference.items).toHaveLength(90);
    expect(result.reference.outfits).toHaveLength(31);
    expect(result.reference.mounts).toHaveLength(17);

    const bigTable = result.reference.items.find((i) => i.id === 2314);
    expect(bigTable?.name).toBe("big table");
    expect(bigTable?.imageUrl).toBe(
      "https://static.tibia.com/images/charactertrade/objects/2314.gif",
    );
    expect(bigTable?.isStoreItem).toBe(false);

    const citizen = result.reference.outfits.find((o) => o.id === 128);
    expect(citizen?.name).toBe("Citizen");
    expect(citizen?.isStore).toBe(false);

    const widow = result.reference.mounts.find((m) => m.id === 368);
    expect(widow?.name).toBe("Widow Queen");
  });

  it("skillLoyalties: puste (nowy layout nie publikuje loyalty %)", () => {
    expect(result.skillLoyalties).toHaveLength(0);
  });

  it("Zod transform: pricePerLevel + searchVector", () => {
    const a = result.auction;
    expect(a?.pricePerLevel).toBeCloseTo(2500 / 402, 5);
    expect(a?.searchVector).toBe("lancelot royal archer");
  });

  it("rawJson zawiera pełny HTML źródłowy", () => {
    expect(result.auction?.rawJson.source).toBe("tibia.com");
    expect(typeof result.auction?.rawJson.html).toBe("string");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Misericuerdia (K 15) — aukcja zakończona („Winning Bid", bez timera)
// ══════════════════════════════════════════════════════════════════════════

describe("parseAuctionDetail — Misericuerdia (live 2252245, finished)", () => {
  const html = loadFixture("auction-detail-live-2252245.html");
  const result = parseAuctionDetail(html, 2252245n);

  it("parsuje się i wykrywa status finished („currently processed”)", () => {
    expect(result.auction).not.toBeNull();
    expect(result.auction?.status).toBe("finished");
    // „Winning Bid" traktujemy jako current (była licytacja)
    expect(result.auction?.bidType).toBe("current");
    expect(result.auction?.bid).toBe(1801);
  });

  it("daty z tekstu (brak timera): start i end w UTC", () => {
    expect(result.auction?.auctionStart).toBe("2026-09-08T08:27:00.000Z");
    expect(result.auction?.auctionEnd).toBe("2026-09-17T15:45:00.000Z");
  });

  it("identity + świat Ombra (KNOWN_WORLDS → 122)", () => {
    const a = result.auction;
    expect(a?.name).toBe("Misericuerdia");
    expect(a?.level).toBe(15);
    expect(a?.vocation).toBe("Knight");
    // Niepromowana (lvl 15) — wyświetlana wokacja = bazowa, BEZ awansu.
    expect(a?.vocationPromoted).toBe("Knight");
    expect(a?.worldId).toBe(122);
    expect(a?.outfitId).toBe(131);
  });

  it("minimalna progresja (nowa postać): zero charmów, 1 quest, 0 blessings", () => {
    const a = result.auction;
    expect(a?.charmPoints).toBe(0);
    expect(a?.minorCharmEchoes).toBe(0);
    expect(a?.bossPoints).toBe(0);
    expect(a?.imbuementsUnlocked).toBe(0);
    expect(a?.questsCompleted).toBe(1);
    expect(a?.achievementPoints).toBe(5);
    expect(a?.blessingsActive).toBe(0);
  });

  it("itemy w ekwipunku (backpack/rope/boots of haste)", () => {
    expect(result.items).toHaveLength(22);
    const backpack = result.reference.items.find((i) => i.id === 2867);
    expect(backpack?.name).toBe("red backpack");
    const boots = result.reference.items.find((i) => i.id === 3079);
    expect(boots?.name).toBe("boots of haste");
  });

  it("USP: linijki skilli („Loyalty bonus not included”)", () => {
    expect(result.usps).toHaveLength(2);
    expect(result.usps[0]?.text).toBe("116 Club Fighting (Loyalty bonus not included)");
    expect(result.usps[0]?.category).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Khufuh (EK 865) — Primal Ordeal, Charm Expansion, hash-world (Havera)
// ══════════════════════════════════════════════════════════════════════════

describe("parseAuctionDetail — Khufuh (live 2258972)", () => {
  const html = loadFixture("auction-detail-live-2258972.html");
  const result = parseAuctionDetail(html, 2258972n);

  it("world spoza KNOWN_WORLDS → stabilny hash (Havera → 29766)", () => {
    expect(result.auction?.worldId).toBe(29766);
    expect(result.reference.world).toEqual({ id: 29766, name: "Havera" });
    // deterministyczność: ten sam hash przy powtórnym wywołaniu
    expect(resolveWorldId("Havera")).toBe(29766);
  });

  it("flagi progresji: Primal Ordeal + Charm Expansion + Weekly Task", () => {
    const a = result.auction;
    expect(a?.hasPrimalOrdeal).toBe(true); // quest line „Primal Ordeal"
    expect(a?.hasSoulWar).toBe(false);
    expect(a?.hasCharmExpansion).toBe(true);
    expect(a?.hasWeeklyTaskExpansion).toBe(true);
    expect(a?.hasPreySlot).toBe(true);
  });

  it("duże liczby: charms 7695 (495+7200), echoes 1000, animus 31/31", () => {
    const a = result.auction;
    expect(a?.charmPoints).toBe(7695);
    expect(a?.charmPointsUnused).toBe(495);
    expect(a?.minorCharmEchoes).toBe(1000);
    expect(a?.animusMasteries).toBe(31);
    expect(a?.bossPoints).toBe(1890);
    expect(a?.achievementPoints).toBe(449);
    expect(a?.blessingsActive).toBe(7);
  });

  it("gemy: 3 regular + 2 greater (bez lesser)", () => {
    const a = result.auction;
    expect(a?.gemsLesser).toBe(0);
    expect(a?.gemsRegular).toBe(3);
    expect(a?.gemsGreater).toBe(2);
  });

  it("imbuementsUnlocked=24 → imbuementsTotal nie może być mniejsze (refine)", () => {
    expect(result.auction?.imbuementsUnlocked).toBe(24);
    expect(result.auction?.imbuementsTotal).toBe(24);
  });

  it("USP: „Charm Points: 7695 (Unused: 495)…” z kategorią 7", () => {
    const charmUsp = result.usps.find((u) => u.text.startsWith("Charm Points:"));
    expect(charmUsp?.category).toBe(7);
    expect(charmUsp?.text).toContain("Minor Charm Echoes: 1000");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. Fuurius (EK 93) — aktywna, potiony z ilościami, bogate USP
// ══════════════════════════════════════════════════════════════════════════

describe("parseAuctionDetail — Fuurius (live 2255748)", () => {
  const html = loadFixture("auction-detail-live-2255748.html");
  const result = parseAuctionDetail(html, 2255748n);

  it("identity: Knight 93, Bona → 21", () => {
    const a = result.auction;
    expect(a?.name).toBe("Fuurius");
    expect(a?.level).toBe(93);
    expect(a?.worldId).toBe(21);
    expect(a?.outfitId).toBe(131);
    expect(a?.status).toBe("active");
  });

  it("skille: sword fighter (109 sword / 102 shielding)", () => {
    const a = result.auction;
    expect(a?.skillSword).toBe(109);
    expect(a?.skillShielding).toBe(102);
    expect(a?.skillMagic).toBe(6);
  });

  it("stacki potionów: 164x great health potion (118 bp + 46 store), 8x health potion", () => {
    const greatHealth = result.items.find((i) => i.itemId === 239);
    // Dedupe globalny: quantity = suma z obu sekcji (backpack 118 + store 46).
    expect(greatHealth?.quantity).toBe(164);
    const health = result.items.find((i) => i.itemId === 266);
    expect(health?.quantity).toBe(8);
  });

  it("USP: 5 linijek (store item + skille + level + gold)", () => {
    expect(result.usps).toHaveLength(5);
    expect(result.usps[0]?.text).toBe("140x a supreme health potion (Store Item)");
    expect(result.usps[0]?.category).toBe(4);
    const gold = result.usps.find((u) => u.text.includes("Gold total"));
    expect(gold?.category).toBe(1);
    expect(gold?.text).toBe("250720 Gold total in bank, inventory and depot");
  });

  it("gems + goldTotal z sekcji", () => {
    const a = result.auction;
    expect(a?.goldTotal).toBe(250720n);
    expect(a?.gemsLesser).toBe(4);
    expect(a?.gemsRegular).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. Crazy Persil (MS 131) — brak sekcji USP (edge case)
// ══════════════════════════════════════════════════════════════════════════

describe("parseAuctionDetail — Crazy Persil (live 2258274)", () => {
  const html = loadFixture("auction-detail-live-2258274.html");
  const result = parseAuctionDetail(html, 2258274n);

  it("parsuje się mimo braku sekcji SpecialCharacterFeatures", () => {
    expect(result.auction).not.toBeNull();
    expect(result.usps).toHaveLength(0);
    // „usps: none extracted" jest warningiem, nie błędem
    expect(result.warnings).toContain("usps: none extracted");
  });

  it("identity: Sorcerer 131, Celesta → 31", () => {
    const a = result.auction;
    expect(a?.name).toBe("Crazy Persil");
    expect(a?.vocation).toBe("Sorcerer");
    expect(a?.vocationPromoted).toBe("Master Sorcerer");
    expect(a?.worldId).toBe(31);
    expect(a?.outfitId).toBe(133);
  });

  it("store item z przecinkiem w ilości: „2,921x ultimate mana potion”", () => {
    const ultimate = result.reference.items.find((i) => i.id === 23373);
    expect(ultimate?.name).toBe("ultimate mana potion");
    expect(ultimate?.isStoreItem).toBe(true);
  });

  it("mount Sparkion + 28 itemów (dedupe bp+store) + 12 outfitów", () => {
    expect(result.items).toHaveLength(28);
    expect(result.outfits).toHaveLength(12);
    expect(result.mounts).toHaveLength(1);
    expect(result.reference.mounts[0]?.name).toBe("Sparkion");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. Guard: strony, które NIE są detalem aukcji
// ══════════════════════════════════════════════════════════════════════════

describe("parseAuctionDetail — guard błędnych stron", () => {
  it("pusty HTML → auction=null + parseError (bez śmieciowych fallbacków)", () => {
    const result = parseAuctionDetail("<html><body>hello</body></html>", 123n);
    expect(result.auction).toBeNull();
    expect(result.parseError).toContain("not an auction detail page");
    expect(isAuctionDetailSuccessful(result)).toBe(false);
  });

  it("strona listy (nie detal) → auction=null", () => {
    const listHtml = loadFixture("auction-list-live-2026-09-17.html");
    const result = parseAuctionDetail(listHtml, 999n);
    // Lista MA .AuctionCharacterName (25 bloków) — guard nie zadziała na listę!
    // …ale poziom/listy nie ma w formacie „Level: N | Vocation: …" na poziomie body,
    // więc identity.level pozostaje null → guard łapie.
    expect(result.auction).toBeNull();
    expect(result.parseError).toContain("not an auction detail page");
  });

  it("uszkodzony HTML z poprawnym nagłówkiem → Zod reject albo sukces częściowy", () => {
    const broken = `<html><body><div class="AuctionCharacterName">Tester</div>
      Level: 100 | Vocation: Knight | Male | World: Antica
      <div class="ShortAuctionDataBidRow"><div class="ShortAuctionDataLabel">Minimum Bid:</div>
      <div class="ShortAuctionDataValue">not-a-number</div></div></body></html>`;
    const result = parseAuctionDetail(broken, 42n);
    // Nagłówek jest OK → Zod przechodzi z fallbackami (bid 0, daty syntetyczne)
    // albo zwraca parseError — żadna ścieżka nie może rzucić wyjątku.
    expect(result).toBeDefined();
    if (result.auction !== null) {
      expect(result.auction.bid).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    } else {
      expect(result.parseError).not.toBeNull();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 7. Helpery
// ══════════════════════════════════════════════════════════════════════════

describe("parseLocaleNumber", () => {
  it("akceptuje U+00A0, przecinki i gołe liczby", () => {
    expect(parseLocaleNumber("25\u00A0501")).toBe(25501);
    expect(parseLocaleNumber("25,501")).toBe(25501);
    expect(parseLocaleNumber("25501")).toBe(25501);
    expect(parseLocaleNumber("1,073,009,429")).toBe(1073009429);
  });

  it("zwraca null dla pustych/nie-liczbowych", () => {
    expect(parseLocaleNumber("")).toBeNull();
    expect(parseLocaleNumber(null)).toBeNull();
    expect(parseLocaleNumber("abc")).toBeNull();
    expect(parseLocaleNumber("12x")).toBeNull();
  });
});

describe("parseTibiaDateTime", () => {
  it("CEST (UTC+2): „Sep 17 2026, 19:00 CEST” → 17:00Z", () => {
    expect(parseTibiaDateTime("Sep 17 2026, 19:00 CEST")).toBe("2026-09-17T17:00:00.000Z");
  });

  it("CET (UTC+1): „Nov 13 2019, 19:37:33 CET” → 18:37:33Z", () => {
    expect(parseTibiaDateTime("Nov 13 2019, 19:37:33 CET")).toBe("2019-11-13T18:37:33.000Z");
  });

  it("NBSP w treści (jak w HTML)", () => {
    expect(parseTibiaDateTime("Sep\u00A016\u00A02026, 10:06\u00A0CEST")).toBe(
      "2026-09-16T08:06:00.000Z",
    );
  });

  it("odrzuca nieprawidłowe formaty", () => {
    expect(parseTibiaDateTime("08.09.2026, 22:15:33")).toBeNull();
    expect(parseTibiaDateTime("Foo 17 2026, 19:00 CEST")).toBeNull();
    expect(parseTibiaDateTime(null)).toBeNull();
  });
});

describe("parsePlDate (legacy v1 — dla zgodności)", () => {
  it("parsuje PL datę", () => {
    expect(parsePlDate("08.09.2026, 22:15:33")).toBe("2026-09-08T22:15:33.000Z");
  });

  it("odrzuca nieprawidłowe formaty", () => {
    expect(parsePlDate("Sep 17 2026, 19:00 CEST")).toBeNull();
    expect(parsePlDate("")).toBeNull();
  });
});

describe("resolveWorldId", () => {
  it("znane światy → stałe ID; case-insensitive", () => {
    expect(resolveWorldId("Antica")).toBe(1);
    expect(resolveWorldId("antica")).toBe(1);
    expect(resolveWorldId("Ombra")).toBe(122);
  });

  it("nieznane światy → deterministyczny hash w zakresie 100..32766", () => {
    const a = resolveWorldId("Havera");
    const b = resolveWorldId("Havera");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(100);
    expect(a).toBeLessThanOrEqual(32766);
  });
});

describe("rawJsonHash", () => {
  it("stabilny dla identycznego HTML i różny dla różnych", () => {
    expect(rawJsonHash("<html>a</html>")).toBe(rawJsonHash("<html>a</html>"));
    expect(rawJsonHash("<html>a</html>")).not.toBe(rawJsonHash("<html>b</html>"));
    expect(rawJsonHash("")).toHaveLength(16);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 8. Unikalność relacji (PK safety) — regresja po bugu duplicate key
// ══════════════════════════════════════════════════════════════════════════
//
// Bug produkcyjny (2026-09-17): item obecny i w sekcji regularnej, i w
// „Store Item Summary" dawał DWA wiersze auction_items z tym samym
// (auction_id, item_id, tier) → `duplicate key value violates unique
// constraint auction_items_auction_id_item_id_tier_pk` → cała aukcja nie
// wchodziła do bazy. Fix: dedupe globalny (suma quantity, isStore OR).

describe("relacje — unikalność kluczy (PK safety)", () => {
  const fixtures: Array<[string, bigint]> = [
    ["auction-detail-live-2259395.html", 2259395n],
    ["auction-detail-live-2252245.html", 2252245n],
    ["auction-detail-live-2258972.html", 2258972n],
    ["auction-detail-live-2255748.html", 2255748n],
    ["auction-detail-live-2258274.html", 2258274n],
    ["auction-detail-live-2254825.html", 2254825n],
  ];

  for (const [file, id] of fixtures) {
    it(`${file}: items/outfits/mounts bez duplikatów`, () => {
      const result = parseAuctionDetail(loadFixture(file), id);

      const itemIds = result.items.map((i) => i.itemId);
      expect(new Set(itemIds).size).toBe(itemIds.length);

      const outfitIds = result.outfits.map((o) => o.outfitId);
      expect(new Set(outfitIds).size).toBe(outfitIds.length);

      const mountIds = result.mounts.map((m) => m.mountId);
      expect(new Set(mountIds).size).toBe(mountIds.length);

      // Harvest słowników też musi być unikalny (id = PK w items/outfits/mounts).
      const refItemIds = result.reference.items.map((i) => i.id);
      expect(new Set(refItemIds).size).toBe(refItemIds.length);
      const refOutfitIds = result.reference.outfits.map((o) => o.id);
      expect(new Set(refOutfitIds).size).toBe(refOutfitIds.length);
      const refMountIds = result.reference.mounts.map((m) => m.id);
      expect(new Set(refMountIds).size).toBe(refMountIds.length);
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 7. Walipaxy Eldas (live 2254825) — postać NIEPROMOWANA (Paladin, lvl 8).
//    Regresja 2026-09-17: parser awansował „Paladin" → „Royal Paladin"
//    i niepromowane postacie w bazie miały fałszywą promocję.
// ══════════════════════════════════════════════════════════════════════════

describe("parseAuctionDetail — Walipaxy Eldas (live 2254825, niepromowany)", () => {
  const html = loadFixture("auction-detail-live-2254825.html");
  const result = parseAuctionDetail(html, 2254825n);

  it("parsuje się bez błędu", () => {
    expect(result.parseError).toBeNull();
    expect(result.auction).not.toBeNull();
  });

  it("vocation: bazowa 'Paladin' — BEZ awansu do 'Royal Paladin'", () => {
    const a = result.auction;
    expect(a?.name).toBe("Walipaxy Eldas");
    expect(a?.level).toBe(8);
    expect(a?.vocation).toBe("Paladin");
    expect(a?.vocationPromoted).toBe("Paladin");
  });
});
