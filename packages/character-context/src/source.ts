/**
 * Source helpers — discriminated union z arch. §13.1.
 *
 * Użycie helperów zamiast `source.kind === 'auction'` daje:
 *   - bezpieczeństwo typów (TS zawęża pozostałe pola po wywołaniu)
 *   - jedno miejsce na ewentualną zmianę kontraktu
 */
import type {
  AuctionSource,
  CharacterSnapshot,
  ImportedSource,
  ManualSource,
  Source,
} from "./schema.js";

/** Zwraca `true` gdy snapshot pochodzi z Bazaara (pełny detal). */
export function isAuctionSource(
  source: Source,
): source is AuctionSource {
  return source.kind === "auction";
}

/** Zwraca `true` gdy snapshot wpisano ręcznie (własna postać gracza). */
export function isManualSource(source: Source): source is ManualSource {
  return source.kind === "manual";
}

/** Zraca `true` gdy snapshot zaimportowano z tibia.com (community URL). */
export function isImportedSource(
  source: Source,
): source is ImportedSource {
  return source.kind === "imported";
}

/** Wygodny skrót: czy snapshot ma aukcję (kontekst + bidding). */
export function hasAuctionContext(
  snapshot: CharacterSnapshot,
): snapshot is CharacterSnapshot & {
  source: AuctionSource;
  auction: NonNullable<CharacterSnapshot["auction"]>;
} {
  return snapshot.source.kind === "auction" && snapshot.auction !== undefined;
}

/**
 * Zwraca `auctionId` jako number (z zachowaniem zakresu BigInt).
 * Bezpieczne tylko dla ID < Number.MAX_SAFE_INTEGER; do prezentacji w URL.
 */
export function auctionIdToNumber(source: AuctionSource): number {
  return Number(source.auctionId);
}
