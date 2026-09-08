# Tibians

Community hub for Tibia players: calculators, character valuation and Char Bazaar analysis.

> **Tibia** is a registered trademark of CipSoft GmbH. Tibia and all products related to Tibia are copyright by CipSoft GmbH. **Tibians** is not affiliated with CipSoft GmbH.

## Quickstart

```bash
# 1. Install dependencies (pnpm 9.x, Node 22 LTS)
pnpm install

# 2. Copy environment template
cp .env.example .env

# 3. Run the dev servers (web + scraper)
pnpm dev

# 4. Verify the monorepo
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

## Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict, zero `any`) |
| Web | Next.js 15 (App Router, RSC, ISR) |
| Scraper | Node.js worker (cheerio + undici) |
| DB | PostgreSQL 17 + Drizzle ORM |
| Validation | Zod |
| Tests | Vitest + Testing Library + Playwright |
| CI | GitHub Actions |

## Structure

```
apps/
  web/        Next.js 15 application (Bazaar, calculators, workspace)
  scraper/    Node.js worker (Bazaar + items/outfits/mounts scraping)
packages/
  ui/                 Design system (OKLCH tokens + components)
  db/                 Drizzle schema + migrations
  shared/             Shared TS types + Zod (scraper ↔ API ↔ UI contract)
  calc/               Pure calculator functions (no React)
  character-context/  CharacterSnapshot type + Zod (core contract)
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run all dev servers (Turborepo) |
| `pnpm build` | Build all packages/apps |
| `pnpm typecheck` | Type-check all packages/apps |
| `pnpm test` | Run Vitest across the workspace |
| `pnpm lint` | Run ESLint across the workspace |
| `pnpm clean` | Remove build artifacts |
| `pnpm format` | Format the whole repo with Prettier |

## Environment variables

See `.env.example` for the full list (`DATABASE_URL`, `SCRAPER_SECRET`, `TIBIADATA_BASE_URL`, `NEXT_PUBLIC_SITE_URL`).

## License

[The Unlicense](LICENSE) — public domain.
