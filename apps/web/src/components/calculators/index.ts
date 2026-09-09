/**
 * Public API of `apps/web/src/components/calculators/`.
 *
 * Re-exports everything the calculator ecosystem needs:
 *   - The shared catalog of 14 calculators (used by the index page,
 *     dynamic route, mega-menu, and individual calculator pages).
 *   - The `<ResultDisplay/>` component that renders every calculator's
 *     primary number + secondary values + recommendation + copy-link.
 *   - The `<CalculatorLayout/>` server component that wraps every
 *     calculator page with breadcrumbs + two-column grid.
 *   - The `<CalculatorForm/>` + `<FormField/>` + `<CalculatorNumberInput/>`
 *     primitives used by the form sections of T17-T23.
 *
 * Import path (preferred):
 *
 *   import { ResultDisplay, CalculatorLayout } from "@/components/calculators";
 *
 * Direct imports still work for treeshaking if you only need one symbol.
 */
export {
  CALCULATORS,
  CATEGORY_ORDER,
  findCalculatorBySlug,
  getCalculatorsByCategory,
} from "./catalog";
export type {
  CalculatorCategory,
  CalculatorMeta,
} from "./catalog";

export { ResultDisplay } from "./result-display";
export type {
  ResultDisplayProps,
  ResultSecondaryValue,
  ResultValue,
  Recommendation,
  RecommendationObject,
  RecommendationTone,
} from "./result-display";

export { CalculatorLayout } from "./calculator-layout";
export type { CalculatorLayoutProps } from "./calculator-layout";

export {
  CalculatorForm,
  FormField,
  CalculatorNumberInput,
} from "./calculator-form";
export type { CalculatorFormProps, FormFieldProps } from "./calculator-form";

export { PremiumBlur } from "./premium-blur";
export type { PremiumBlurProps } from "./premium-blur";