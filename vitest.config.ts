import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// ESM-safe `__dirname` — `vitest.config.ts` jest modułem ES (`package.json`
// `"type": "module"`). Budujemy absolutne ścieżki do aliasów TS z `tsconfig.json`.
const here = path.dirname(fileURLToPath(import.meta.url));
const appsWebSrc = path.resolve(here, "apps/web/src");
const packagesRoot = path.resolve(here, "packages");

// Aliasy lustrzane z `tsconfig.base.json` + `apps/web/tsconfig.json`.
// Vitest NIE czyta `tsconfig.paths` automatycznie — bez tego testy z
// `import x from "@/..."` kończą się "Failed to load url @/...". Tasks T38+T54.
//
// Vite domyślnie traktuje string `find` jako prefix (nie wildcard) —
// dla sub-pathów (np. `@tibians/shared/auction`) musimy użyć regex.
// Dopasowania exact (np. `@tibians/shared`) zostawiamy jako string —
// bardziej czytelne i szybsze niż `^foo$`.
// UWAGA — KOLEJNOŚĆ MA ZNACZENIE: regex `@scope/*` muszą być PRZED exact
// match `@scope` — inaczej vite dopasuje exact match i nigdy nie dotrze
// do wildcard (exact `@tibians/shared` "pasuje" do prefixu `@tibians/shared/...`
// i zwraca błędny path).
const aliasEntries: Array<{ find: string | RegExp; replacement: string }> = [
  { find: "@", replacement: appsWebSrc },
  { find: /^@tibians\/ui\/(.*)$/, replacement: path.resolve(packagesRoot, "ui/src") + "/$1" },
  { find: "@tibians/ui", replacement: path.resolve(packagesRoot, "ui/src/index.ts") },
  { find: /^@tibians\/shared\/(.*)$/, replacement: path.resolve(packagesRoot, "shared/src") + "/$1" },
  { find: "@tibians/shared", replacement: path.resolve(packagesRoot, "shared/src/index.ts") },
  { find: "@tibians/db", replacement: path.resolve(packagesRoot, "db/src/index.ts") },
  { find: "@tibians/db/seed", replacement: path.resolve(packagesRoot, "db/src/seed/index.ts") },
  { find: "@tibians/calc", replacement: path.resolve(packagesRoot, "calc/src/index.ts") },
  { find: "@tibians/character-context", replacement: path.resolve(packagesRoot, "character-context/src/index.ts") },
];

export default defineConfig({
  resolve: {
    alias: aliasEntries,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      // Task 13: 100% line + branch coverage dla packages/character-context.
      // Wzorzec pasuje zarówno z roota monorepo (packages/character-context/src/**)
      // jak i z katalogu pakietu (src/**) — vitest rozwiązuje globy względem root.
      include: ["packages/character-context/src/**", "src/**"],
      exclude: [
        // types.ts to plik wyłącznie typów (export type) — zero kodu runtime.
        "packages/character-context/src/types.ts",
        "src/types.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/__tests__/**",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});