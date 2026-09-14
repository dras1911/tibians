import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/*.config.cjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      // Node + browser globals inline (bez zależności `globals`).
      // Bez tego `no-undef` zgłasza console/process/fetch jako niezdefiniowane.
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "writable",
        global: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        ReadableStream: "readonly",
        crypto: "readonly",
        performance: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        matchMedia: "readonly",
        HTMLElement: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        Node: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `{}` jest świadomie używane w mockach testowych / placeholderach
      // generycznych; `Record<string, never>` pogarsza czytelność bez zysku.
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    // Pliki testowe: NBSP (U+00A0) jest celowe — testy parsowania bidów
    // weryfikują format PL („25 501" z non-breaking space, patrz T30/T31).
    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**/*.ts"],
    rules: {
      "no-irregular-whitespace": "off",
    },
  },
  prettier,
);
