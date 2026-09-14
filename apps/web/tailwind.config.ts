import type { Config } from "tailwindcss";

/**
 * Tailwind config — colors are mapped 1:1 to OKLCH tokens exported by
 * `@tibians/ui/styles.css`. **Never** hardcode hex/oklch() values here;
 * every color must reference `var(--token)` so dark/light switches live in
 * a single source of truth (packages/ui/src/tokens.css).
 *
 * Density knobs (architecture §6.3):
 *   - Compact row:    40 px (h-10)
 *   - Comfortable row: 52 px (h-13, custom value)
 *
 * Touch targets (architecture §6.3): buttons override `size="sm"` to h-11
 * (44 px) for mobile compliance — see src/components/ui/button.tsx.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx,js,jsx,mdx,css}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        md: "1.5rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1600px",
      },
    },
    extend: {
      // ★ Semantic colors — every value is `var(--token)` from @tibians/ui
      colors: {
        background: "var(--bg-base)",
        foreground: "var(--text-primary)",
        border: "var(--border-default)",
        input: "var(--border-default)",
        ring: "var(--accent)",
        card: {
          DEFAULT: "var(--bg-surface)",
          foreground: "var(--text-primary)",
        },
        popover: {
          DEFAULT: "var(--bg-surface)",
          foreground: "var(--text-primary)",
        },
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "var(--on-accent)",
        },
        secondary: {
          DEFAULT: "var(--bg-elevated)",
          foreground: "var(--text-primary)",
        },
        muted: {
          DEFAULT: "var(--bg-inset)",
          foreground: "var(--text-secondary)",
        },
        accent: {
          DEFAULT: "var(--accent-subtle)",
          foreground: "var(--accent)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "var(--bg-base)",
        },
        // ★ T45/T47 — `bg-danger/15` używane przez AuctionCountdownCell,
        // AuctionCard i inne — musi być zarejestrowane w Tailwind.
        danger: "var(--danger)",
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--bg-base)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--bg-base)",
        },
        info: {
          DEFAULT: "var(--info)",
          foreground: "var(--bg-base)",
        },
        // Vocation accents — useful for badges in auctions
        "voc-knight": "var(--voc-knight)",
        "voc-paladin": "var(--voc-paladin)",
        "voc-druid": "var(--voc-druid)",
        "voc-sorcerer": "var(--voc-sorcerer)",
        "voc-monk": "var(--voc-monk)",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      // ★ h-13 = 52 px (comfortable row, arch §6.3). Default h-* only goes to h-12.
      height: {
        "13": "3.25rem",
        "14": "3.5rem",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)",
        "4xl": "var(--text-4xl)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // T56 — flash przy zmianie bid (arch §6.4 pkt "non-distracting live").
        // Subtelny highlight tła + skali, ~900 ms — znaczy "coś się zmieniło"
        // ale nie rozprasza przy długim czytaniu listy.
        "bazaar-flash": {
          "0%": { backgroundColor: "transparent", transform: "scale(1)" },
          "20%": {
            backgroundColor: "color-mix(in oklch, var(--success) 18%, transparent)",
            transform: "scale(1.04)",
          },
          "100%": {
            backgroundColor: "transparent",
            transform: "scale(1)",
          },
        },
        // T56 — fade-out dla auto-remove aukcji zakończonych (5 s grace).
        "bazaar-fade-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(-8px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "bazaar-flash": "bazaar-flash 0.9s ease-out",
        "bazaar-fade-out": "bazaar-fade-out 0.6s ease-in forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;