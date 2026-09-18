import {
  Axe,
  Crosshair,
  Fish,
  Hammer,
  Hand,
  Shield,
  Sword,
  Wand2,
  type LucideIcon,
} from "lucide-react";

/**
 * Skille postaci — wspólne ikony do kart/tabel.
 *
 * Lucide nie ma 1:1 odpowiedników dla „club" (obuch) i „fist" (pięść) —
 * używamy najbliższych (młotek / dłoń). Pełne nazwy skilli w i18n
 * (`Bazaar.card.skills.*`) — używane jako title/aria-label, żeby skill był
 * czytelny także bez ikony.
 */

/** Kolejność jak w grze (magic → fishing) — zgodna z gridem na kartach. */
export const SKILL_KEYS = [
  "magic",
  "club",
  "fist",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
] as const;

export type SkillKey = (typeof SKILL_KEYS)[number];

export const SKILL_ICON: Record<SkillKey, LucideIcon> = {
  magic: Wand2,
  club: Hammer,
  fist: Hand,
  sword: Sword,
  axe: Axe,
  distance: Crosshair,
  shielding: Shield,
  fishing: Fish,
};

export function SkillIcon({ skill, className }: { skill: SkillKey; className?: string }) {
  const Icon = SKILL_ICON[skill];
  return <Icon className={className} aria-hidden="true" />;
}
