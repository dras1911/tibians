/**
 * Drizzle Kit config — generowanie migracji SQL ze schema TS.
 *
 * Usage:
 *   pnpm --filter @tibians/db db:generate   # → migrations/0001_xxx.sql
 *   pnpm --filter @tibians/db db:migrate    # stosuje wygenerowane SQL
 *   pnpm --filter @tibians/db db:push       # push schemy bez migracji (dev only)
 *   pnpm --filter @tibians/db db:studio     # Drizzle Studio (GUI)
 *
 * `dialect: "postgresql"` + node-postgres driver (pod spodem).
 */
import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  // Nie rzucamy — pozwalamy na `db:generate` (nie potrzebuje DB).
  // `db:migrate` i `db:push` rzucą same w drizzle-kit.
  console.warn(
    '[drizzle.config] DATABASE_URL not set; `db:migrate`/`db:push`/`db:studio` will fail.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: databaseUrl ?? 'postgresql://localhost:5432/placeholder',
  },
  verbose: true,
  strict: true,
});
