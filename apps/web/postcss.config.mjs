/**
 * PostCSS config — Tailwind 3 (architecture decision: Tailwind 4 has
 * compatibility issues with Next 15 at the time of T3; revisit when stable).
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;