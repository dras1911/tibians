/**
 * Seed: imbuements — słownik PL/EN z arch §2.3 (Intibia).
 *
 * Każdy imbuement ma:
 *   - name (EN, oficjalna Tibia)
 *   - name_pl (z Intibia — polska wersja gry)
 *   - tier = 'epic' (max; UNIQUE(name) wymusza jeden wiersz per imbuement)
 *   - category = damage | protection | support | skill
 *   - description = krótki opis po polsku
 *
 * 23 imbuementy z gry Tibia (max slotów na postaci = 23).
 *
 * Idempotentny: używa `onConflictDoUpdate` na `name` — bezpieczne ponowne uruchomienie.
 */
import type { NewImbuement } from '../schema/reference';
export interface ImbuementSeed {
    readonly name: string;
    readonly namePl: string;
    readonly tier: 'basic' | 'powerful' | 'epic';
    readonly category: 'damage' | 'protection' | 'support' | 'skill';
    readonly description: string;
}
/**
 * Słownik 23 imbuementów z Intibia (arch §2.3) + kategorie.
 * Tier domyślnie 'epic' (najwyższy dostępny w grze).
 */
export declare const IMBUEMENTS_SEED: readonly ImbuementSeed[];
export declare const toImbuementRows: () => NewImbuement[];
//# sourceMappingURL=imbuements.d.ts.map