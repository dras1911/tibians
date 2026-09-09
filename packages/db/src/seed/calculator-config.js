/**
 * Seed: calculator_config — współczynniki formuł kalkulatorów (arch §2.1, §7.2).
 *
 * Loader `getConfig(key)` (src/config-loader.ts) czyta te wartości z DB
 * z cache in-memory 60s. Zmiana w DB → funkcja czyta nową wartość po 60s,
 * BEZ deploya (arch §16 Faza 1B).
 *
 * Dlaczego w DB a nie env: zmiana balansu gry (nowy tier, nowy cennik TC)
 * wymaga tylko UPDATE, nie redeploya całej aplikacji.
 *
 * Idempotentny: `onConflictDoUpdate` na `key` (seedCalculatorConfig).
 *
 * Źródła wartości:
 *   - arch §2.1 (TibiaPal: próg 13 900 gp/TC, typy broni)
 *   - TibiaWiki Exercise_Weapons (charges + ceny broni)
 *   - TibiaWiki Skills_Calculator (loyalty 360 pkt = 5%)
 *   - TibiaWiki Stamina (regen 3:1 / 6:1, max 42h premium / 40h free)
 *   - TibiaWiki Blessings (wzór R(L): 2000 / 200·(L−20) / 20000+75·(L−120))
 *   - TibiaWiki Imbuing (opłaty 7500/60000/250000 gp, czas 20h)
 */
import { sql } from 'drizzle-orm';
import { calculatorConfig } from '../schema/calculator-config';
export const CALCULATOR_CONFIG_SEED = [
    // ── Ekonomia (arch §2.1 TibiaPal) ─────────────────────────────
    {
        key: 'economy.tc_price_gold_threshold',
        value: 13900,
        description: 'Próg ceny TC w gold. TibiaPal: "Always buy exercise weapons for gold when the price of Tibia Coins is above 13 900 gp". Dokładny break-even TibiaWiki: 13 889 gp/TC.',
    },
    {
        key: 'economy.tc_value_gold',
        value: 10000,
        description: 'Bazowa wartość 1 TC = 10 000 gp (konwersja gold↔TC w kalkulatorach i wycenie).',
    },
    {
        key: 'economy.gold_to_tc_fee',
        value: 0.02,
        description: 'Prowizja CipSoft 2% przy konwersji gold→TC (per task spec T16).',
    },
    // ── Exercise Weapons (arch §2.1, TibiaWiki Exercise_Weapons) ─
    {
        key: 'exercise.weapon.regular.charges',
        value: 500,
        description: 'Regular exercise weapon: 500 charges (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.durable.charges',
        value: 1800,
        description: 'Durable exercise weapon: 1 800 charges (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.lasting.charges',
        value: 14400,
        description: 'Lasting exercise weapon: 14 400 charges (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.regular.price_tc',
        value: 25,
        description: 'Regular exercise weapon: 25 TC (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.durable.price_tc',
        value: 90,
        description: 'Durable exercise weapon: 90 TC (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.lasting.price_tc',
        value: 720,
        description: 'Lasting exercise weapon: 720 TC (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.regular.price_gp',
        value: 347222,
        description: 'Regular exercise weapon: 347 222 gp (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.durable.price_gp',
        value: 1250000,
        description: 'Durable exercise weapon: 1 250 000 gp (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.lasting.price_gp',
        value: 10000000,
        description: 'Lasting exercise weapon: 10 000 000 gp (TibiaWiki).',
    },
    {
        key: 'exercise.weapon.double_event_multiplier',
        value: 2,
        description: 'Mnożnik XP podczas Double Skill/XP Event (×2).',
    },
    {
        key: 'exercise.weapon.private_dummy_multiplier',
        value: 1.1,
        description: 'Private Training Dummy: +10% skuteczności vs publiczny (TibiaQA).',
    },
    // ── Loyalty (arch §2.2, TibiaWiki Skills_Calculator) ─────────
    {
        key: 'loyalty.points_per_5_percent',
        value: 360,
        description: '360 loyalty points = 5% bonusu lojalności (TibiaWiki ground truth).',
    },
    {
        key: 'loyalty.max_percent',
        value: 50,
        description: 'Maksymalny bonus lojalności: 50% (3600 loyalty points).',
    },
    // ── Stamina (TibiaWiki Stamina) ──────────────────────────────
    {
        key: 'stamina.regen_minutes_per_hour',
        value: 3,
        description: '3 min offline = 1 min staminy (normalna strefa 0-39h, premium i free).',
    },
    {
        key: 'stamina.regen_minutes_per_hour_free',
        value: 6,
        description: '6 min offline = 1 min staminy (zielona strefa 39-42h, premium-only).',
    },
    {
        key: 'stamina.hours_per_day_full',
        value: 42,
        description: 'Maksymalna stamina premium: 42h.',
    },
    {
        key: 'stamina.hours_per_day_full_free',
        value: 40,
        description: 'Maksymalna stamina free: 40h.',
    },
    {
        key: 'stamina.green_zone_start_hours',
        value: 39,
        description: 'Zielona strefa (Happy Hours, +50% XP) zaczyna się od 39h staminy.',
    },
    // ── Blessings (TibiaWiki Blessings) ──────────────────────────
    {
        key: 'blessing.cost_per_blessing_level_1',
        value: 2000,
        description: 'Koszt 1 regularnego błogosławieństwa dla level ≤ 30: 2 000 gp (TibiaWiki).',
    },
    {
        key: 'blessing.cost_per_blessing_level_100',
        value: 16000,
        description: 'Koszt dla level 100: 200×(100−20) = 16 000 gp (TibiaWiki wzór R(L)).',
    },
    {
        key: 'blessing.cost_per_blessing_level_200',
        value: 26000,
        description: 'Koszt dla level 200: 20 000 + 75×(200−120) = 26 000 gp (TibiaWiki wzór R(L)).',
    },
    // ── Imbuement (TibiaWiki Imbuing) ────────────────────────────
    {
        key: 'imbuement.gold_per_minute_savings',
        value: 87500,
        description: 'Oszczędności z imbuementów: 87 500 gp/h (≈875 TC za 100h przy 10k gp/TC).',
    },
    {
        key: 'imbuement.basic_slot_cost_tc',
        value: 25,
        description: 'Koszt slotu Basic imbuement w TC (per task spec T16).',
    },
    {
        key: 'imbuement.powerful_slot_cost_tc',
        value: 150,
        description: 'Koszt slotu Powerful imbuement w TC (per task spec T16).',
    },
    {
        key: 'imbuement.fee_basic_gp',
        value: 7500,
        description: 'Opłata za Basic imbuement: 7 500 gp (TibiaWiki).',
    },
    {
        key: 'imbuement.fee_intricate_gp',
        value: 60000,
        description: 'Opłata za Intricate imbuement: 60 000 gp (TibiaWiki).',
    },
    {
        key: 'imbuement.fee_powerful_gp',
        value: 250000,
        description: 'Opłata za Powerful imbuement: 250 000 gp (TibiaWiki).',
    },
    {
        key: 'imbuement.duration_hours',
        value: 20,
        description: 'Imbuement trwa 20h użycia (TibiaWiki).',
    },
    // ── Charm / Boss / Quest (heurystyki Bazaar, arch §2.4) ──────
    {
        key: 'charm.max_points',
        value: 9000,
        description: 'Maksymalna pula punktów charm (heurystyczny tag "Dużo charmów").',
    },
    {
        key: 'charm.expansion_threshold',
        value: 7000,
        description: 'Próg punktów charm dla tagu "Dużo charmów" (heurystyka).',
    },
    {
        key: 'boss.points_per_kill_base',
        value: 5,
        description: 'Bazowe punkty boss za kill (mnożone przez difficulty i tier).',
    },
    {
        key: 'quest.notable_total',
        value: 42,
        description: 'Ilość "notable quests" w postępie "Quests X/42".',
    },
    {
        key: 'quest.imbuement_slots_total',
        value: 23,
        description: 'Maksymalna ilość slotów imbuement (11/23 = 11 aktywnych).',
    },
];
export const toCalculatorConfigRows = () => CALCULATOR_CONFIG_SEED.map(cfg => ({
    key: cfg.key,
    value: cfg.value,
    description: cfg.description,
}));
/**
 * Wstawia/aktualizuje wszystkie klucze configa.
 * Idempotentny: `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`.
 * Zwraca liczbę dotkniętych wierszy.
 */
export async function seedCalculatorConfig(db) {
    const rows = toCalculatorConfigRows();
    const inserted = await db
        .insert(calculatorConfig)
        .values(rows)
        .onConflictDoUpdate({
        target: calculatorConfig.key,
        set: {
            value: sql `excluded.value`,
            description: sql `excluded.description`,
            updatedAt: sql `now()`,
        },
    });
    return 'rowCount' in inserted && typeof inserted.rowCount === 'number'
        ? inserted.rowCount
        : rows.length;
}
//# sourceMappingURL=calculator-config.js.map