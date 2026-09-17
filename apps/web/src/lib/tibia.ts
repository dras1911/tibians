/**
 * Helpery URL do zasobów tibia.com — jedno źródło prawdy dla linków,
 * które wcześniej były kopiowane po komponentach (i się rozjeżdżały:
 * karta/tabela/statystyki linkowały do niepełnego
 * `charactertrade/?auctionid=...` bez `subtopic` + `page`).
 */

/**
 * URL do oficjalnej strony aukcji postaci na Tibia.com.
 *
 * Pełny format wymagany przez CipSoft:
 * `charactertrade/?subtopic=currentcharactertrades&page=details&auctionid={id}`
 * — skrócona wersja `?auctionid={id}` NIE otwiera detalu aukcji.
 */
export function tibiaAuctionUrl(auctionId: string | number | bigint): string {
  return `https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades&page=details&auctionid=${auctionId}`;
}

/**
 * URL do animowanego GIF-a outfitu postaci (Tibia static CDN).
 *
 * @param outfitId - client id outfitu (np. 128)
 * @param addon    - wariant addonów 0-3 (Bazaar pokazuje bazowy 0)
 */
export function outfitImageUrl(outfitId: number, addon?: 0 | 1 | 2 | 3): string;
export function outfitImageUrl(outfitId: number | null, addon?: 0 | 1 | 2 | 3): string | null;
export function outfitImageUrl(outfitId: number | null, addon: 0 | 1 | 2 | 3 = 0): string | null {
  if (outfitId === null) return null;
  return `https://static.tibia.com/images/charactertrade/outfits/${outfitId}_${addon}.gif`;
}
