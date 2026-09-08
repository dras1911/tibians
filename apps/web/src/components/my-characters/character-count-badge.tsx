"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { useSavedCharacters } from "@tibians/character-context";

/**
 * CharacterCountBadge — pokazuje `3/3` (free) lub `∞` (zalogowany).
 *
 * Arch. §15.1: limit 3 dla anonymous, bez limitu dla zalogowanych (Faza 6).
 * Używa `useSavedCharacters` hook (subskrybuje localStorage 'storage' event
 * dla multi-tab sync).
 */
export function CharacterCountBadge({
  isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  const t = useTranslations("myCharacters");
  const { count, limit } = useSavedCharacters({ isAuthenticated });

  const label =
    limit === Infinity
      ? t("limitBadgeUnlimited")
      : t("limitBadge", { count, limit });

  return (
    <Badge variant="secondary" aria-label={label}>
      {label}
    </Badge>
  );
}