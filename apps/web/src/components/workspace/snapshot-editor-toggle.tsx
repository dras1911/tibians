"use client";

/**
 * @file snapshot-editor-toggle.tsx
 *
 * `<Switch>` "Edytuj" / "Podgląd" w nagłówku /workspace (plan T26,
 * arch. §13.3, §13.4). Włącza / wyłącza tryb edycji snapshota — kiedy
 * ON, pojawia się `<SnapshotEditorPanel />` z wszystkimi edytowalnymi
 * polami, a panele T25 przeliczają się live przy każdej zmianie.
 *
 * Używa tego samego contextu co `<SnapshotEditor />` (provider w pliku
 * `snapshot-editor.tsx`). Bez providera → nic się nie dzieje.
 *
 * Design:
 *   - Inline Switch + tekst (PL/EN) dla jasności stanu.
 *   - Aria-label z opisem (czytniki ekranowe).
 *   - Domyślnie OFF — snapshot w trybie tylko-do-odczytu.
 */

import * as React from "react";
import { useTranslations } from "next-intl";

import { useSnapshotEditor } from "./snapshot-editor";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Switch "Edytuj" / "Podgląd" — komponent kliencki dla nagłówka /workspace.
 *
 * @example
 *   // w workspace-layout.tsx (T25):
 *   <SnapshotEditorProvider>
 *     <header>
 *       <SnapshotEditorBadge />
 *       <SnapshotEditorToggle />
 *       <SnapshotEditorActions />
 *     </header>
 *     <SnapshotEditorPanel />
 *   </SnapshotEditorProvider>
 */
export function SnapshotEditorToggle({
  className,
}: {
  className?: string;
}) {
  const t = useTranslations("Workspace.editor");
  const { editMode, setEditMode } = useSnapshotEditor();

  const handleCheckedChange = React.useCallback(
    (checked: boolean) => {
      setEditMode(checked);
    },
    [setEditMode],
  );

  // ID stabilny per render, ale generowany client-side.
  // Radix Switch wymaga unikalnego id dla accessibility.
  const id = React.useId();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
        editMode ? "bg-warning/10" : "bg-muted/30",
        className,
      )}
    >
      <Switch
        id={id}
        checked={editMode}
        onCheckedChange={handleCheckedChange}
        aria-label={t("toggle.ariaLabel")}
      />
      <Label
        htmlFor={id}
        className={cn(
          "cursor-pointer text-sm font-medium select-none",
          editMode ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {editMode ? t("toggle.on") : t("toggle.off")}
      </Label>
    </div>
  );
}