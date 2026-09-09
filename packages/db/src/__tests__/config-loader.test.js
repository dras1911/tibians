/**
 * Testy loadera konfiguracji (task 16).
 *
 * Scenariusze:
 *   - cache hit: drugi call w TTL = 0 DB queries
 *   - cache miss: pierwszy call czyta DB
 *   - invalid value (nie przechodzi Zod) → null + warning, bez crash
 *   - missing key → null (negative caching)
 *   - TTL expiration: po 60s kolejny call ponownie czyta DB
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfigLoader } from '../config-loader';
/** Mock klienta DB — liczy zapytania, zwraca stałe wiersze. */
function createMockDb(rows) {
    const queries = [];
    const db = {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => {
                        queries.push('SELECT * FROM calculator_config WHERE key = $1');
                        return rows;
                    },
                }),
            }),
        }),
    };
    return { db: db, queries };
}
const ROW = (key, value) => ({
    key,
    value,
    description: 'test',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
});
describe('createConfigLoader', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it('cache miss: pierwszy call czyta DB i zwraca wartość', async () => {
        const { db, queries } = createMockDb([ROW('economy.tc_price_gold_threshold', 13900)]);
        const loader = createConfigLoader({ db });
        const result = await loader.getConfig('economy.tc_price_gold_threshold');
        expect(result).toBe(13900);
        expect(queries).toHaveLength(1);
        expect(loader.getStats().misses).toBe(1);
        expect(loader.getStats().hits).toBe(0);
    });
    it('cache hit: drugi call w TTL = 0 DB queries', async () => {
        const { db, queries } = createMockDb([ROW('exercise.weapon.regular.charges', 500)]);
        const loader = createConfigLoader({ db });
        await loader.getConfig('exercise.weapon.regular.charges');
        await loader.getConfig('exercise.weapon.regular.charges');
        expect(queries).toHaveLength(1);
        expect(loader.getStats().hits).toBe(1);
        expect(loader.getStats().misses).toBe(1);
    });
    it('missing key → null, a drugi call w TTL nie queryje ponownie (negative caching)', async () => {
        const { db, queries } = createMockDb([]);
        const loader = createConfigLoader({ db });
        const first = await loader.getConfig('missing.key');
        const second = await loader.getConfig('missing.key');
        expect(first).toBeNull();
        expect(second).toBeNull();
        expect(queries).toHaveLength(1);
    });
    it('invalid value (nie przechodzi Zod) → null + warning, bez crash', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const { db } = createMockDb([ROW('bad.key', null)]);
        const loader = createConfigLoader({ db });
        const result = await loader.getConfig('bad.key');
        expect(result).toBeNull();
        expect(loader.getStats().invalid).toBe(1);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
    it('TTL expiration: po 60s kolejny call ponownie czyta DB', async () => {
        const { db, queries } = createMockDb([ROW('stamina.hours_per_day_full', 42)]);
        const loader = createConfigLoader({ db });
        await loader.getConfig('stamina.hours_per_day_full');
        expect(queries).toHaveLength(1);
        vi.advanceTimersByTime(60_001);
        const result = await loader.getConfig('stamina.hours_per_day_full');
        expect(result).toBe(42);
        expect(queries).toHaveLength(2);
    });
    it('wartość obiektowa (rekord) przechodzi walidację i wraca z cache', async () => {
        const { db, queries } = createMockDb([
            ROW('test.object', { threshold: 13900, enabled: true }),
        ]);
        const loader = createConfigLoader({ db });
        const result = await loader.getConfig('test.object');
        const cached = await loader.getConfig('test.object');
        expect(result).toEqual({ threshold: 13900, enabled: true });
        expect(cached).toEqual({ threshold: 13900, enabled: true });
        expect(queries).toHaveLength(1);
    });
    it('clearCache wymusza ponowny odczyt z DB', async () => {
        const { db, queries } = createMockDb([ROW('key', 1)]);
        const loader = createConfigLoader({ db });
        await loader.getConfig('key');
        loader.clearCache();
        await loader.getConfig('key');
        expect(queries).toHaveLength(2);
    });
});
//# sourceMappingURL=config-loader.test.js.map