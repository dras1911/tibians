import { describe, expect, it } from "vitest";

import { parseBazaarSearchParams } from "../bazaar-params";

/**
 * Regresja: filtry i paginacja dzielą JEDNĄ mapę searchParams, a oba schematy
 * są `.strict()` — parsowanie w jednym try/catch zerowało oba przy każdym
 * parametrze (filtry „nie działały" na produkcji).
 */
describe("parseBazaarSearchParams", () => {
  it("filtry przechodzą, gdy w URL jest też page", () => {
    const { filters, pagination } = parseBazaarSearchParams({ levelMin: "2000", page: "2" });
    expect(filters.levelMin).toBe(2000);
    expect(pagination.page).toBe(2);
  });

  it("paginacja działa bez filtrów", () => {
    const { filters, pagination } = parseBazaarSearchParams({ page: "3" });
    expect(pagination.page).toBe(3);
    expect(filters.levelMin).toBeUndefined();
  });

  it("sortBy/sortDir + filtr vocation", () => {
    const { filters } = parseBazaarSearchParams({
      sortBy: "bid",
      sortDir: "desc",
      vocation: "Knight",
    });
    expect(filters.sortBy).toBe("bid");
    expect(filters.sortDir).toBe("desc");
    expect(filters.vocation).toBe("Knight");
  });

  it("nieznane klucze są ignorowane (nie zerują filtrów)", () => {
    const { filters, pagination } = parseBazaarSearchParams({
      levelMin: "500",
      nieznanyParametr: "x",
    });
    expect(filters.levelMin).toBe(500);
    expect(pagination.page).toBe(1);
  });

  it("błędna wartość filtra → fallback TYLKO filtrów, paginacja zostaje", () => {
    const { filters, pagination } = parseBazaarSearchParams({ levelMin: "abc", page: "4" });
    expect(filters.levelMin).toBeUndefined();
    expect(pagination.page).toBe(4);
  });

  it("błędna paginacja → fallback TYLKO paginacji, filtry zostają", () => {
    const { filters, pagination } = parseBazaarSearchParams({ levelMin: "700", pageSize: "999" });
    expect(filters.levelMin).toBe(700);
    expect(pagination.pageSize).toBe(25);
  });

  it("pusty input → defaulty", () => {
    const { filters, pagination } = parseBazaarSearchParams({});
    expect(filters.status).toBe("active");
    expect(filters.sortBy).toBe("auctionEnd");
    expect(pagination.page).toBe(1);
    expect(pagination.pageSize).toBe(25);
  });

  it("storeItems — CSV → lista kuratorowanych kluczy", () => {
    const { filters } = parseBazaarSearchParams({ storeItems: "goldPouch,mailbox" });
    expect(filters.storeItems).toEqual(["goldPouch", "mailbox"]);
  });

  it("storeItems — nieznany klucz → fallback tylko filtrów (paginacja zostaje)", () => {
    const { filters, pagination } = parseBazaarSearchParams({
      storeItems: "goldPouch,bzdura",
      page: "2",
    });
    expect(filters.storeItems).toBeUndefined();
    expect(pagination.page).toBe(2);
  });

  it("questsMin/rareNicknames — nowe pola przechodzą przez parse", () => {
    const { filters } = parseBazaarSearchParams({ questsMin: "25", rareNicknames: "1" });
    expect(filters.questsMin).toBe(25);
    expect(filters.rareNicknames).toBe(true);
  });

  it("gemsMin*/storeMin* — podłączone do schematu (wcześniej tylko w UI)", () => {
    const { filters } = parseBazaarSearchParams({ gemsMinGreater: "10", storeMinItems: "5" });
    expect(filters.gemsMinGreater).toBe(10);
    expect(filters.storeMinItems).toBe(5);
  });
});
