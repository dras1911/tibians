/**
 * Seed: calculator_config — współczynniki formuł kalkulatorów (arch §2.1, §7.2).
 *
 * Loader `getConfig(key)` w packages/calc (task 16) czyta te wartości z DB
 * z cache in-memory 60s. Zmiana w DB → funkcja czyta nową wartość po 60s,
 * BEZ deploya.
 *
 * Dlaczego w DB a nie env: zmiana balansu gry (nowy tier, nowy cennik TC)
 * wymaga tylko UPDATE, nie redeploya całej aplikacji.
 *
 * Idempotentny: `onConflictDoUpdate` na `key`.
 */
import type { NewCalculatorConfig } from '../schema/calculator';

export interface CalculatorConfigSeed {
  readonly key: string;
  readonly value: unknown;
  readonly description: string;
}

export const CALCULATOR_CONFIG_SEED: readonly CalculatorConfigSeed[] = [
  // ── Ekonomia (TibiaPal §2.1) ───────────────────────────────
  {
    key: 'economy.tc_price_gold',
    value: 13900,
    description:
      'Aktualna cena 1 TC w gold. Powyżej tego progu kalkulator Exercise Weapons rekomenduje "kup za gold".',
  },
  {
    key: 'economy.gold_to_tc_divisor',
    value: 13900,
    description: 'Mnożnik do konwersji gold → TC w valuation (asset_gold_to_tc rule).',
  },

  // ── Exercise Weapons ────────────────────────────────────────
  {
    key: 'exercise.weapon.regular.charges',
    value: 500,
    description: 'Ilość użyć broni Regular (precyzyjna wartość).',
  },
  {
    key: 'exercise.weapon.durable.charges',
    value: 1000,
    description: 'Ilość użyć broni Durable (w przybliżeniu).',
  },
  {
    key: 'exercise.weapon.lasting.charges',
    value: 2000,
    description: 'Ilość użyć broni Lasting (mniej precyzyjne).',
  },
  {
    key: 'exercise.weapon.double_event_multiplier',
    value: 2,
    description: 'Mnożnik doświadczenia podczas Double Event (weekend).',
  },
  {
    key: 'exercise.weapon.private_dummy_multiplier',
    value: 1.5,
    description: 'Mnożnik doświadczenia z Private Training Dummy (zamiast NPC).',
  },
  {
    key: 'exercise.recommendation.threshold_gp',
    value: 13900,
    description: 'Próg ceny TC (gp) dla rekomendacji "kup exercise za gold zamiast TC".',
  },

  // ── Loyalty (TibiaWiki §2.2) ────────────────────────────────
  {
    key: 'loyalty.points_per_5pct',
    value: 360,
    description: 'Ile loyalty point = 5% bonusu (TibiaWiki ground truth).',
  },
  {
    key: 'loyalty.max_percent',
    value: 50,
    description: 'Maksymalny bonus lojalności (50%).',
  },

  // ── Stamina ─────────────────────────────────────────────────
  {
    key: 'stamina.regen_minutes_premium',
    value: 3,
    description: 'Minuty na 1 punkt staminy dla konta premium (3 min/point → 42h do pełna).',
  },
  {
    key: 'stamina.regen_minutes_free',
    value: 6,
    description: 'Minuty na 1 punkt staminy dla konta free (6 min/point → 84h do pełna).',
  },
  {
    key: 'stamina.max_hours',
    value: 42,
    description: 'Maksymalny stamina (godziny hunty online).',
  },

  // ── Charm (TibiaWiki Charms) ────────────────────────────────
  {
    key: 'charm.max_points',
    value: 9000,
    description: 'Maksymalna pula punktów charm na poziomie max.',
  },
  {
    key: 'charm.expansion_threshold',
    value: 7000,
    description: 'Próg punktów charm, od którego zaczyna się "wiele charmów" (heurystyczny tag).',
  },

  // ── Boss Points (Bosstiary) ────────────────────────────────
  {
    key: 'boss.points_per_kill_base',
    value: 5,
    description: 'Bazowe punkty boss za kill (mnożone przez difficulty i tier).',
  },

  // ── Quests (TibiaWiki) ──────────────────────────────────────
  {
    key: 'quest.notable_total',
    value: 42,
    description: 'Ilość "notable quests" wliczanych do postępu "Quests X/42".',
  },
  {
    key: 'quest.imbuement_slots_total',
    value: 23,
    description: 'Maksymalna ilość odblokowanych slotów imbuement (11/23 = 11 aktywnych).',
  },
] as const;

export const toCalculatorConfigRows = (): NewCalculatorConfig[] =>
  CALCULATOR_CONFIG_SEED.map(cfg => ({
    key: cfg.key,
    value: cfg.value,
    description: cfg.description,
  }));
