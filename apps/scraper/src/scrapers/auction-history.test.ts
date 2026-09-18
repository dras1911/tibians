/**
 * Testy parsera archiwum Char Bazaar (`pastcharactertrades` — W18).
 *
 * Fixture: `__fixtures__/auction-history.html` — 1:1 fragment strony
 * tibia.com (PageNavigation + 2 bloki `.Auction`: finished + cancelled),
 * pobrany 2026-09-18 (R1 insurance — nie formatować, patrz .prettierignore).
 *
 * Pokrycie:
 *   1.  Real fixture: 2 wiersze + metadane paginacji (Results, Last Page)
 *   2.  finished: pełne pola (id, level, vocation, świat, daty ISO, cena)
 *   3.  cancelled: finalPrice=null, bid zachowany
 *   4.  Skille z `.SpecialCharacterFeatures` (Magic Level, Distance Fighting)
 *   5.  parseTibiaDate: CEST (+2), CET (+1), NBSP, zły format → throw
 *   6.  Uszkodzony wiersz → warn + skip (nie rzuca)
 *   7.  Pusta strona → 0 wierszy, brak metadanych
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseHistoryList, parseTibiaDate } from "./auction-history.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "./__fixtures__");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf-8");
}

describe("parseHistoryList — real fixture (finished + cancelled)", () => {
  const result = parseHistoryList(loadFixture("auction-history.html"));

  it("parsuje 2 wiersze", () => {
    expect(result.rows).toHaveLength(2);
  });

  it("metadane paginacji: Results + Last Page", () => {
    expect(result.resultsTotal).toBe(22960);
    expect(result.lastPage).toBe(919);
  });

  it("wiersz finished (Balaoste) — pełne pola", () => {
    const row = result.rows[0];
    expect(row).toBeDefined();
    expect(row?.auctionId).toBe(2230875n);
    expect(row?.characterName).toBe("Balaoste");
    expect(row?.level).toBe(20);
    expect(row?.vocation).toBe("Elder Druid");
    expect(row?.sex).toBe("M");
    expect(row?.world).toBe("Sombra");
    expect(row?.status).toBe("finished");
    expect(row?.finalPrice).toBe(57);
    expect(row?.bid).toBe(57);
    // Daty: Aug 14 2026, 10:06 CEST = 08:06 UTC; Aug 19 2026, 14:00 CEST = 12:00 UTC
    expect(row?.auctionStart).toBe("2026-08-14T08:06:00.000Z");
    expect(row?.auctionEnd).toBe("2026-08-19T12:00:00.000Z");
    expect(row?.outfitUrl).toContain("static.tibia.com");
  });

  it("wiersz finished — skille z SpecialCharacterFeatures", () => {
    const row = result.rows[0];
    expect(row?.skills.magic).toBe(72);
  });

  it("wiersz cancelled (Jon Kent) — finalPrice null, bid zachowany", () => {
    const row = result.rows[1];
    expect(row).toBeDefined();
    expect(row?.characterName).toBe("Jon Kent");
    expect(row?.status).toBe("cancelled");
    expect(row?.finalPrice).toBeNull();
    expect(row?.bid).toBe(1751);
  });

  it("wiersz cancelled — skille (Distance Fighting + Magic Level)", () => {
    const row = result.rows[1];
    expect(row?.skills.distance).toBe(114);
    expect(row?.skills.magic).toBe(28);
  });
});

describe("parseTibiaDate", () => {
  it("CEST (UTC+2): 'Aug 14 2026, 10:06 CEST' → 08:06Z", () => {
    expect(parseTibiaDate("Aug 14 2026, 10:06 CEST")).toBe("2026-08-14T08:06:00.000Z");
  });

  it("CET (UTC+1): 'Jan 05 2026, 10:06 CET' → 09:06Z", () => {
    expect(parseTibiaDate("Jan 05 2026, 10:06 CET")).toBe("2026-01-05T09:06:00.000Z");
  });

  it("NBSP w dacie (tibia.com) — parsuje się tak samo", () => {
    expect(parseTibiaDate("Aug\u00a014\u00a02026, 10:06\u00a0CEST")).toBe(
      "2026-08-14T08:06:00.000Z",
    );
  });

  it("nieznany format → throw", () => {
    expect(() => parseTibiaDate("2026-08-14 10:06")).toThrow();
  });
});

describe("parseHistoryList — edge cases", () => {
  it("uszkodzony wiersz (brak linku) → warn + skip, nie rzuca", () => {
    const warn = vi.fn();
    const html = `<div class="PageNavigation"><small><b>» Results: 1</b></small></div>
      <div class="Auction"><div class="AuctionHeader">Level: 10 | Vocation: Knight | Male | World: Secura</div></div>`;
    const result = parseHistoryList(html, { warn });
    expect(result.rows).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it("pusta strona → 0 wierszy, metadane null", () => {
    const result = parseHistoryList("<html><body></body></html>");
    expect(result.rows).toHaveLength(0);
    expect(result.resultsTotal).toBeNull();
    expect(result.lastPage).toBeNull();
  });
});
