"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Link } from "@/i18n/routing";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

/**
 * MegaMenu — header navigation entry that opens a multi-column panel on
 * hover or keyboard activation.
 *
 * Architecture §4.2:
 *   - Trigger is a real <button> (keyboard activatable: Enter / Space).
 *   - On hover the HoverCard opens after 100 ms (avoids flicker).
 *   - Escape closes and focus returns to the trigger (Radix default).
 *   - Content is grouped by INTENT (Skills & Training / Stamina / Wycena
 *     / Imbuement & Charms / Experience / Wheel) — NOT alphabetically.
 *
 * `groups` shape:
 *   [
 *     { label: 'Skills & Training', items: [{ label, href, description? }] },
 *     { label: 'Stamina',            items: [...] }, // single item groups
 *     ...
 *   ]
 *
 * The Trigger is min-h-11 (44 px) so it remains tappable on mobile even
 * though mega-menus primarily live in the desktop nav.
 */
export interface MegaMenuItem {
  label: string;
  href: string;
  description?: string;
  /** Renders a small icon/emoji to the left of the label (optional). */
  icon?: React.ReactNode;
}

export interface MegaMenuGroup {
  label: string;
  items: MegaMenuItem[];
}

export interface MegaMenuProps {
  /** Section label, e.g. "Kalkulatory". */
  label: string;
  groups: MegaMenuGroup[];
  /** Forced open state (used by the mobile sheet). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Trigger-side rendered extra content (e.g. accent badge). */
  trailing?: React.ReactNode;
}

const TRIGGER_BASE_CLASSES = [
  // Mobile-first: min 44 px touch target (architecture §6.3).
  "group inline-flex h-11 items-center gap-1 rounded-md px-3",
  "text-sm font-medium text-foreground/90",
  "transition-colors hover:bg-accent hover:text-accent-foreground",
  // Focus is handled by the design system :focus-visible rule — never
  // `outline: none` (architecture §6.5).
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
].join(" ");

export function MegaMenu({
  label,
  groups,
  trailing,
}: MegaMenuProps) {
  // HoverCard handles Escape (close + return focus), Tab cycle within the
  // panel, and ArrowKey navigation between focusable elements for free.
  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(TRIGGER_BASE_CLASSES)}
          aria-haspopup="menu"
        >
          {label}
          <ChevronDown
            className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
          {trailing}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        sideOffset={12}
        className="w-[min(640px,calc(100vw-2rem))] p-6"
      >
        <div
          // Each group becomes a vertical column; the grid auto-fills based
          // on how many groups the caller passed in (1–3 columns).
          className="grid gap-x-8 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]"
          role="menu"
          aria-label={label}
        >
          {groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={`${group.label}-${item.label}`}>
                    <Link
                      href={item.href}
                      role="menuitem"
                      className={cn(
                        // 44 px touch target preserved on touch devices
                        "flex min-h-11 items-start gap-2 rounded-md px-2 py-2",
                        "text-sm text-foreground transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      )}
                    >
                      {item.icon ? (
                        <span aria-hidden="true" className="mt-0.5 shrink-0">
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="flex flex-col leading-tight">
                        <span className="font-medium">{item.label}</span>
                        {item.description ? (
                          <span className="text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}