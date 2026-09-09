"use client";

/**
 * @file panels/comparison-panel.tsx — task 25.
 *
 * Comparison tab: PLACEHOLDER for T27 (side-by-side comparison).
 * Today's behavior: friendly CTA card explaining that the full
 * comparison surface ships with task 27.
 *
 * Per task 25 must-not-do: "Nie implementuj compare (to T27) —
 * placeholder panel z CTA."
 */

import * as React from "react";
import { ArrowLeftRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/routing";

export function ComparisonPanel() {
  const t = useTranslations("Workspace.panelsContent.comparison");

  return (
    <Card className="border-dashed bg-muted/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowLeftRight className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{t("title")}</span>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <Badge variant="secondary" className="gap-1.5">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {t("comingSoon")}
        </Badge>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/workspace/compare">{t("cta")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}