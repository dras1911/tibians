import { defineConfig } from "vitest/config";

export default defineConfig({
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