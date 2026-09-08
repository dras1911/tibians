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
export const IMBUEMENTS_SEED: readonly ImbuementSeed[] = [
  // ── DAMAGE ────────────────────────────────────────────────
  {
    name: 'Strike',
    namePl: 'Obrażenia krytyczne',
    tier: 'epic',
    category: 'damage',
    description: 'Zwiększa szansę i siłę ciosu krytycznego.',
  },
  {
    name: 'Scorch',
    namePl: 'Obrażenia od ognia',
    tier: 'epic',
    category: 'damage',
    description: 'Dodaje obrażenia od ognia do ataków wręcz i dystansowych.',
  },
  {
    name: 'Venom',
    namePl: 'Obrażenia od ziemi',
    tier: 'epic',
    category: 'damage',
    description: 'Dodaje obrażenia od trucizny/ziemi do ataków.',
  },
  {
    name: 'Frost',
    namePl: 'Obrażenia od lodu',
    tier: 'epic',
    category: 'damage',
    description: 'Dodaje obrażenia od lodu (i spowalnia cel).',
  },
  {
    name: 'Electrify',
    namePl: 'Obrażenia od energii',
    tier: 'epic',
    category: 'damage',
    description: 'Dodaje obrażenia od energii do ataków.',
  },
  {
    name: 'Reap',
    namePl: 'Obrażenia od śmierci',
    tier: 'epic',
    category: 'damage',
    description: 'Dodaje obrażenia od śmierci do ataków wręcz.',
  },

  // ── PROTECTION ────────────────────────────────────────────
  {
    name: 'Vibrancy',
    namePl: 'Usuwanie paraliżu',
    tier: 'epic',
    category: 'protection',
    description: 'Szansa na usunięcie paraliżu po jego otrzymaniu.',
  },
  {
    name: 'Lich Shroud',
    namePl: 'Ochrona przed śmiercią',
    tier: 'epic',
    category: 'protection',
    description: 'Zmniejsza obrażenia od śmierci.',
  },
  {
    name: 'Snake Skin',
    namePl: 'Ochrona przed ziemią',
    tier: 'epic',
    category: 'protection',
    description: 'Zmniejsza obrażenia od trucizny/ziemi.',
  },
  {
    name: 'Dragon Hide',
    namePl: 'Ochrona przed ogniem',
    tier: 'epic',
    category: 'protection',
    description: 'Zmniejsza obrażenia od ognia.',
  },
  {
    name: 'Quara Scale',
    namePl: 'Ochrona przed lodem',
    tier: 'epic',
    category: 'protection',
    description: 'Zmniejsza obrażenia od lodu.',
  },
  {
    name: 'Cloud Fabric',
    namePl: 'Ochrona przed energią',
    tier: 'epic',
    category: 'protection',
    description: 'Zmniejsza obrażenia od energii.',
  },
  {
    name: 'Demon Presence',
    namePl: 'Ochrona świętości',
    tier: 'epic',
    category: 'protection',
    description: 'Zmniejsza obrażenia od świętości (holy).',
  },

  // ── SUPPORT ───────────────────────────────────────────────
  {
    name: 'Vampirism',
    namePl: 'Wysysanie życia',
    tier: 'epic',
    category: 'support',
    description: 'Część zadanych obrażeń leczy postać (life leech).',
  },
  {
    name: 'Void',
    namePl: 'Wysysanie many',
    tier: 'epic',
    category: 'support',
    description: 'Część zadanych obrażeń odnawia manę (mana leech).',
  },
  {
    name: 'Swiftness',
    namePl: 'Zwiększenie prędkości',
    tier: 'epic',
    category: 'support',
    description: 'Zwiększa prędkość poruszania się.',
  },
  {
    name: 'Featherweight',
    namePl: 'Zwiększenie pojemności',
    tier: 'epic',
    category: 'support',
    description: 'Zwiększa udźwig postaci.',
  },
  {
    name: 'Blockade',
    namePl: 'Tarcza',
    tier: 'epic',
    category: 'support',
    description: 'Zwiększa umiejętność obrony tarczą (shielding).',
  },

  // ── SKILL ─────────────────────────────────────────────────
  {
    name: 'Precision',
    namePl: 'Walka dystansowa',
    tier: 'epic',
    category: 'skill',
    description: 'Zwiększa umiejętność distance fighting.',
  },
  {
    name: 'Epiphany',
    namePl: 'Magic Level',
    tier: 'epic',
    category: 'skill',
    description: 'Zwiększa Magic Level postaci.',
  },
  {
    name: 'Chop',
    namePl: 'Walka toporem',
    tier: 'epic',
    category: 'skill',
    description: 'Zwiększa umiejętność axe fighting.',
  },
  {
    name: 'Slash',
    namePl: 'Walka mieczem',
    tier: 'epic',
    category: 'skill',
    description: 'Zwiększa umiejętność sword fighting.',
  },
  {
    name: 'Bash',
    namePl: 'Walka maczugą',
    tier: 'epic',
    category: 'skill',
    description: 'Zwiększa umiejętność club fighting.',
  },
] as const;

export const toImbuementRows = (): NewImbuement[] =>
  IMBUEMENTS_SEED.map(imbuement => ({
    name: imbuement.name,
    namePl: imbuement.namePl,
    tier: imbuement.tier,
    category: imbuement.category,
    description: imbuement.description,
  }));
