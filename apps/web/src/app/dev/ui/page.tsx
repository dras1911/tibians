"use client";

import * as React from "react";
import { useTheme } from "@tibians/ui";
import {
  Bell,
  ChevronDown,
  Copy,
  Heart,
  Mail,
  Plus,
  Search,
  Settings,
  Shield,
  Star,
  Trash2,
  User,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonButton, SkeletonCard } from "@/components/ui/loading-skeletons";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDensity } from "@/components/density-provider";
import { DataTable } from "@/components/data-table";
import { PageLayout } from "@/components/page-layout";
import { cn } from "@/lib/utils";

/**
 * Showcase page (`/dev/ui`) — every shadcn component × {light, dark}
 * × {compact, comfortable}. Toggles in the header switch the GLOBAL theme
 * (`useTheme` → `<html class="dark">`) and GLOBAL density
 * (`useDensity` → `<html data-density="…">`); every section below reacts.
 *
 * Acceptance criteria (T3 plan):
 *   - 0 console errors
 *   - Every color comes from `var(--token)` (audit via grep)
 *   - Touch targets ≥ 44×44 px on mobile (button `size="sm"` overridden to h-11)
 *   - Skeleton (not spinner) for loading states
 *
 * NOTE: this page is hidden from indexing (`robots: { index: false }` in
 * layout + `/dev/ui` will be added to robots.txt in T65).
 */

// ──────────────────────────────────────────────────────────────────────
// Anchor navigation list — single source of truth for the section map
// ──────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "buttons", label: "Buttons" },
  { id: "inputs", label: "Inputs & Labels" },
  { id: "select", label: "Select" },
  { id: "checkbox-switch", label: "Checkbox & Switch" },
  { id: "slider", label: "Slider" },
  { id: "badges", label: "Badges" },
  { id: "card", label: "Card" },
  { id: "tabs", label: "Tabs" },
  { id: "dropdown", label: "Dropdown menu" },
  { id: "popover", label: "Popover" },
  { id: "dialog", label: "Dialog" },
  { id: "sheet", label: "Sheet" },
  { id: "tooltip", label: "Tooltip" },
  { id: "command", label: "Command palette" },
  { id: "table", label: "Table (shadcn)" },
  { id: "data-table", label: "DataTable (TanStack)" },
  { id: "scroll-separator", label: "Scroll area & Separator" },
  { id: "skeletons", label: "Skeleton states" },
  { id: "page-layout", label: "PageLayout wrapper" },
] as const;

// ──────────────────────────────────────────────────────────────────────
// Header — theme + density controls + section nav
// ──────────────────────────────────────────────────────────────────────

function ShowcaseHeader() {
  const { theme, setTheme } = useTheme();
  const { density, toggle } = useDensity();

  return (
    <div className="container flex h-16 items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
          T
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Tibians</span>
          <span className="text-xs text-muted-foreground">
            /dev/ui · Design system showcase
          </span>
        </div>
      </div>

      <nav aria-label="Sections" className="hidden lg:block">
        <ul className="flex items-center gap-1 text-sm">
          {SECTIONS.slice(0, 6).map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {s.label}
              </a>
            </li>
          ))}
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "gap-1",
                )}
              >
                More <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SECTIONS.slice(6).map((s) => (
                  <DropdownMenuItem key={s.id} asChild>
                    <a href={`#${s.id}`}>{s.label}</a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
      </nav>

      <div className="flex items-center gap-2">
        {/* Density toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={toggle}
                aria-label={`Switch density (current: ${density})`}
              >
                {density === "compact" ? "Compact" : "Comfortable"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {density === "compact"
                  ? "Currently 40 px rows — power-user view"
                  : "Currently 52 px rows — default desktop"}
              </p>
              <p className="text-xs opacity-70">Click to toggle</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Theme switcher — segmented control, 1-click state (arch §6.6) */}
        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex h-11 items-center rounded-md border bg-muted p-1 text-xs"
        >
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={cn(
                "h-9 rounded-sm px-3 capitalize transition-colors",
                theme === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Reusable section heading + surface frame
// ──────────────────────────────────────────────────────────────────────

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 py-8">
      <header className="mb-4 flex items-end justify-between gap-4 border-b pb-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <a
          href={`#${id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          #{id}
        </a>
      </header>
      <div className="rounded-lg border bg-card p-6 shadow-sm">{children}</div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sample data for DataTable demo
// ──────────────────────────────────────────────────────────────────────

interface SampleRow {
  id: number;
  name: string;
  vocation: "Knight" | "Paladin" | "Druid" | "Sorcerer" | "Monk";
  level: number;
  bid: number;
  region: "EU" | "NA" | "BR";
}

const SAMPLE_DATA: SampleRow[] = [
  { id: 1, name: "Aldwin Stormblade", vocation: "Knight", level: 612, bid: 14500, region: "EU" },
  { id: 2, name: "Yara Moonshadow", vocation: "Druid", level: 489, bid: 8900, region: "NA" },
  { id: 3, name: "Thorgal the Wise", vocation: "Sorcerer", level: 555, bid: 11200, region: "EU" },
  { id: 4, name: "Brightspear", vocation: "Paladin", level: 401, bid: 6400, region: "BR" },
  { id: 5, name: "Quietfist", vocation: "Monk", level: 533, bid: 9700, region: "EU" },
  { id: 6, name: "Ragna Forgeborn", vocation: "Knight", level: 698, bid: 22000, region: "NA" },
  { id: 7, name: "Vaelira", vocation: "Druid", level: 372, bid: 5100, region: "EU" },
  { id: 8, name: "Sablefen", vocation: "Sorcerer", level: 619, bid: 15800, region: "BR" },
];

const VOCATION_TONE: Record<SampleRow["vocation"], string> = {
  Knight: "bg-voc-knight/20 text-voc-knight border-voc-knight/40",
  Paladin: "bg-voc-paladin/20 text-voc-paladin border-voc-paladin/40",
  Druid: "bg-voc-druid/20 text-voc-druid border-voc-druid/40",
  Sorcerer: "bg-voc-sorcerer/20 text-voc-sorcerer border-voc-sorcerer/40",
  Monk: "bg-voc-monk/20 text-voc-monk border-voc-monk/40",
};

// ──────────────────────────────────────────────────────────────────────
// Showcase page
// ──────────────────────────────────────────────────────────────────────

export default function DevUIShowcasePage() {
  return (
    <PageLayout header={<ShowcaseHeader />}>
      <TooltipProvider delayDuration={200}>
        <Section
          id="overview"
          title="Overview"
          description="Every shadcn component rendered against the Tibians OKLCH tokens. Theme and density are global — use the controls in the header to walk through all four combinations."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Theme</CardTitle>
                <CardDescription>
                  <code className="font-mono">useTheme()</code> z{" "}
                  <code className="font-mono">@tibians/ui</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Przełącznik light/dark/system zapisuje preferencję w{" "}
                <code className="font-mono">localStorage</code> i ustawia{" "}
                <code className="font-mono">&lt;html class=&quot;dark&quot;&gt;</code>{" "}
                inline skryptem przed pierwszym paintem (zero FOUC).
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Density</CardTitle>
                <CardDescription>
                  compact 40 px · comfortable 52 px (arch §6.3)
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <code className="font-mono">useDensity()</code> z tego
                workspace&apos;a przełącza{" "}
                <code className="font-mono">&lt;html data-density&gt;</code> —
                tabele i rzędy reagują automatycznie.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tokens</CardTitle>
                <CardDescription>
                  100% przez <code className="font-mono">var(--…)</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Zero hardkodowanych kolorów — wszystko mapowane na tokeny z{" "}
                <code className="font-mono">packages/ui/src/tokens.css</code>.
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section
          id="buttons"
          title="Buttons"
          description="Variants × sizes. size=sm jest celowo ustawiony na h-11 (44 px) dla mobile touch target (arch §6.3)."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">
              <Trash2 /> Destructive
            </Button>
          </div>
          <Separator className="my-6" />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small (h-11)</Button>
            <Button>Default (h-10)</Button>
            <Button size="lg">Large (h-13)</Button>
            <Button size="icon" aria-label="Add">
              <Plus />
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          <Separator className="my-6" />
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href="#overview">asChild → &lt;a&gt;</a>
            </Button>
            <Button variant="secondary" asChild>
              <a href="#inputs">asChild secondary</a>
            </Button>
          </div>
        </Section>

        <Section
          id="inputs"
          title="Inputs & Labels"
          description="Formularze. Każdy input ma h-10 (40 px) domyślnie; aria-invalid mapowany na destructive token."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="char-name">Nazwa postaci</Label>
              <Input id="char-name" placeholder="np. Aldwin Stormblade" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="search">Szukaj</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="search" placeholder="Szukaj gracza, przedmiotu, vocation…" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="gracz@tibia.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invalid">Niepoprawne</Label>
              <Input id="invalid" aria-invalid="true" defaultValue="za krótkie" />
            </div>
          </div>
        </Section>

        <Section id="select" title="Select" description="Radix Select z tokenizowanym triggerem.">
          <div className="grid gap-4 md:grid-cols-3">
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz vocation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="knight">Knight</SelectItem>
                <SelectItem value="paladin">Paladin</SelectItem>
                <SelectItem value="druid">Druid</SelectItem>
                <SelectItem value="sorcerer">Sorcerer</SelectItem>
                <SelectItem value="monk">Monk</SelectItem>
              </SelectContent>
            </Select>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Region serwera" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eu">Europe</SelectItem>
                <SelectItem value="na">North America</SelectItem>
                <SelectItem value="br">South America</SelectItem>
              </SelectContent>
            </Select>
            <Select disabled>
              <SelectTrigger>
                <SelectValue placeholder="Disabled" />
              </SelectTrigger>
            </Select>
          </div>
        </Section>

        <Section
          id="checkbox-switch"
          title="Checkbox & Switch"
          description="Pola binarne. Wszystkie ≥ 44×44 px na mobile."
        >
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Checkbox id="soulwar" />
              <Label htmlFor="soulwar">Soul War available</Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="primal" defaultChecked />
              <Label htmlFor="primal">Primal Ordeal available</Label>
            </div>
            <Separator orientation="vertical" className="h-11" />
            <div className="flex items-center gap-3">
              <Switch id="live" defaultChecked />
              <Label htmlFor="live">Live updates</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="muted" />
              <Label htmlFor="muted">Wycisz powiadomienia</Label>
            </div>
          </div>
        </Section>

        <Section id="slider" title="Slider" description="Kontrolka zakresu — kciuk 44×44 px.">
          <div className="space-y-4">
            <Slider defaultValue={[33]} max={100} step={1} />
            <Slider defaultValue={[50, 80]} max={100} step={1} />
            <Slider defaultValue={[25]} max={100} step={1} disabled />
          </div>
        </Section>

        <Section id="badges" title="Badges" description="Semantic tokens (success/warning/danger/info) + obrona neutralnych wariantów.">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="success">Okazja</Badge>
            <Badge variant="warning">&lt; 1h</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="success" className="border-voc-druid/40 bg-voc-druid/20 text-voc-druid">
              Druid 612
            </Badge>
          </div>
        </Section>

        <Section id="card" title="Card" description="Kontener dla bloków informacyjnych. Hover podnosi cień (token shadow-md).">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Aldwin Stormblade</CardTitle>
                <CardDescription>Level 612 · Knight · EU</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Aktualna oferta: <span className="font-mono tabular-nums">14 500 TC</span>
                </p>
              </CardContent>
              <CardFooter className="gap-2">
                <Button>Otwórz</Button>
                <Button variant="outline">Oceń</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Yara Moonshadow</CardTitle>
                <CardDescription>Level 489 · Druid · NA</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Aktualna oferta: <span className="font-mono tabular-nums">8 900 TC</span>
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="secondary">Snapshot</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Thorgal the Wise</CardTitle>
                <CardDescription>Level 555 · Sorcerer · EU</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Aktualna oferta: <span className="font-mono tabular-nums">11 200 TC</span>
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="ghost">Szczegóły</Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        <Section id="tabs" title="Tabs" description="Panel-switching. Tło aktywnej zakładki to --background (nie --card).">
          <Tabs defaultValue="skills">
            <TabsList>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="value">Value</TabsTrigger>
            </TabsList>
            <TabsContent value="skills" className="rounded-md border p-4 text-sm">
              114 Axe Fighting · 113 Distance · 110 Magic Level · 105 Shielding
            </TabsContent>
            <TabsContent value="items" className="rounded-md border p-4 text-sm">
              11/23 imbuements · 28/42 quests · 44-0-0 gems · 2 340 boss points
            </TabsContent>
            <TabsContent value="value" className="rounded-md border p-4 text-sm">
              Wycena: <span className="font-mono tabular-nums">16 200 TC</span> · pewność 0.78
            </TabsContent>
          </Tabs>
        </Section>

        <Section id="dropdown" title="Dropdown menu" description="Menu akcji z Radix — keyboard navigation, focus mgmt, type-ahead.">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Akcje <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Postać</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User /> Profil
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings /> Ustawienia
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell /> Powiadomienia
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Heart /> Obserwowane
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                <Trash2 /> Usuń
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section id="popover" title="Popover" description="Lekki popup — np. zaawansowane filtry Bazaar.">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4" /> Filtry
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3">
              <div className="space-y-1">
                <Label className="text-sm">Minimalny level</Label>
                <Input type="number" defaultValue={300} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Maksymalna cena (TC)</Label>
                <Input type="number" defaultValue={15000} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="soulwar-pop" defaultChecked />
                <Label htmlFor="soulwar-pop">Tylko z Soul War</Label>
              </div>
            </PopoverContent>
          </Popover>
        </Section>

        <Section id="dialog" title="Dialog" description="Modal z portalem — overlay, focus trap, ESC zamyka.">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Otwórz dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Potwierdź akcję</DialogTitle>
                <DialogDescription>
                  Ten dialog używa <code className="font-mono">--background</code> jako tła
                  i <code className="font-mono">--border-default</code> jako ramki.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Dialog blokuje fokus wewnątrz, zamyka się na ESC lub klik w overlay.
                Animacje z <code className="font-mono">tailwindcss-animate</code>.
              </p>
              <DialogFooter>
                <Button variant="outline">Anuluj</Button>
                <Button>Zatwierdź</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>

        <Section id="sheet" title="Sheet" description="Slide-in panel — używany przez mobile menu (T5).">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Mail /> Otwórz sheet
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Powiadomienia</SheetTitle>
                <SheetDescription>
                  Ostatnie aktualizacje aukcji obserwowanych postaci.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <Bell className="mt-1 h-4 w-4 text-warning" />
                  <div>
                    <p className="font-medium">Aukcja Yara kończy się za 12 min</p>
                    <p className="text-muted-foreground">8 900 TC · NA</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-start gap-3">
                  <Shield className="mt-1 h-4 w-4 text-success" />
                  <div>
                    <p className="font-medium">Aldwin: nowy bid 14 500 TC</p>
                    <p className="text-muted-foreground">EU · 2 min temu</p>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </Section>

        <Section id="tooltip" title="Tooltip" description="Dymek — używany dla skrótów i hintów w tabeli Bazaar.">
          <div className="flex flex-wrap gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Copy">
                  <Copy />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Kopiuj ID aukcji</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">
                  <Zap /> Szybka akcja
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ctrl+K · Command palette</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary">
                  <Star /> Obserwuj
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Dodaj do obserwowanych</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </Section>

        <Section id="command" title="Command palette" description="Szybkie wyszukiwanie (⌘K / Ctrl+K). cmdk pod spodem.">
          <Command className="rounded-lg border shadow-md">
            <CommandInput placeholder="Szukaj aukcji, kalkulatora, vocation…" />
            <CommandList>
              <CommandEmpty>Brak wyników.</CommandEmpty>
              <CommandGroup heading="Kalkulatory">
                <CommandItem>
                  <Zap /> Exercise Weapons
                </CommandItem>
                <CommandItem>
                  <Zap /> Stamina
                </CommandItem>
                <CommandItem>
                  <Zap /> Imbuement cost
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Bazaar">
                <CommandItem>
                  <User /> Knight 300-600 EU
                </CommandItem>
                <CommandItem>
                  <User /> Monk z Soul War
                </CommandItem>
                <CommandItem>
                  <User /> Tanie okazje
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </Section>

        <Section id="table" title="Table (shadcn)" description="Statyczny przykład. Wysokość wierszy kontrolowana przez density.">
          <div className="rounded-md border">
            <Table>
              <TableCaption>Przykładowe aukcje (statyczne)</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Postać</TableHead>
                  <TableHead>Vocation</TableHead>
                  <TableHead className="text-right">Level</TableHead>
                  <TableHead className="text-right">Bid (TC)</TableHead>
                  <TableHead>Region</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_DATA.slice(0, 4).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-xs",
                          VOCATION_TONE[row.vocation],
                        )}
                      >
                        {row.vocation}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.level}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.bid.toLocaleString("pl-PL")}
                    </TableCell>
                    <TableCell>{row.region}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section id="data-table" title="DataTable (TanStack)" description="Gotowy wrapper dla listy Bazaar (T39+). Sortowanie po kliknięciu nagłówka; puste stany = skeleton (arch §6.4).">
          <div className="rounded-md border">
            <DataTable
              caption="Aukcje Bazaar"
              columns={[
                {
                  accessorKey: "name",
                  header: "Postać",
                  cell: (info) => (
                    <span className="font-medium">{info.getValue() as string}</span>
                  ),
                },
                {
                  accessorKey: "vocation",
                  header: "Vocation",
                  cell: (info) => {
                    const v = info.getValue() as SampleRow["vocation"];
                    return (
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-xs",
                          VOCATION_TONE[v],
                        )}
                      >
                        {v}
                      </span>
                    );
                  },
                },
                {
                  accessorKey: "level",
                  header: "Level",
                  cell: (info) => (
                    <span className="font-mono tabular-nums">
                      {info.getValue() as number}
                    </span>
                  ),
                },
                {
                  accessorKey: "bid",
                  header: "Bid (TC)",
                  cell: (info) => (
                    <span className="font-mono tabular-nums">
                      {(info.getValue() as number).toLocaleString("pl-PL")}
                    </span>
                  ),
                },
                { accessorKey: "region", header: "Region" },
              ]}
              data={SAMPLE_DATA}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Kliknij nagłówek kolumny aby posortować. Wiersze przełączają się
            między 40 px (compact) a 52 px (comfortable).
          </p>
        </Section>

        <Section id="scroll-separator" title="Scroll area & Separator" description="Własny scrollbar (Radix). Separator dziedziczy --border.">
          <ScrollArea className="h-48 w-full rounded-md border p-4">
            <div className="space-y-3">
              {Array.from({ length: 16 }).map((_, i) => (
                <React.Fragment key={i}>
                  <div className="text-sm">
                    Wiersz {i + 1} — przewijaj, pasek po prawej korzysta z{" "}
                    <code className="font-mono">--border</code>.
                  </div>
                  {i < 15 ? <Separator /> : null}
                </React.Fragment>
              ))}
            </div>
          </ScrollArea>
        </Section>

        <Section
          id="skeletons"
          title="Skeleton states"
          description="Zamiast spinnera (arch §6.4). Kształt odpowiada docelowemu elementowi."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-11 w-24 rounded-md" />
              <Skeleton className="h-10 w-32 rounded-md" />
              <Skeleton className="h-13 w-40 rounded-md" />
              <Skeleton className="h-11 w-11 rounded-md" />
              <SkeletonButton size="sm" />
              <SkeletonButton />
              <SkeletonButton size="lg" />
            </div>
            <Separator />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <Separator />
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Postać</TableHead>
                    <TableHead>Vocation</TableHead>
                    <TableHead className="text-right">Level</TableHead>
                    <TableHead className="text-right">Bid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-4 w-10" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-4 w-16" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </Section>

        <Section id="page-layout" title="PageLayout wrapper" description="Header slot + sidebar + main + footer (arch §4.2). Używany przez każdą stronę po T5.">
          <div className="overflow-hidden rounded-lg border">
            <div className="flex h-10 items-center justify-between border-b bg-muted px-4 text-xs">
              <span className="font-mono">header slot</span>
              <span className="text-muted-foreground">h-16 w produkcji</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[10rem_1fr]">
              <aside className="hidden border-r bg-muted/40 p-3 text-xs md:block">
                <p className="font-mono text-muted-foreground">sidebar slot</p>
              </aside>
              <main className="p-6 text-sm">
                <p className="font-medium">main content</p>
                <p className="mt-1 text-muted-foreground">
                  Grid collapses na &lt;md — sidebar znika, header zostaje.
                </p>
              </main>
            </div>
            <div className="border-t bg-muted px-4 py-3 text-xs">
              <span className="font-mono">footer slot</span>
            </div>
          </div>
        </Section>

        <footer className="py-12 text-center text-xs text-muted-foreground">
          Tibians · Design system showcase · T3 deliverable
        </footer>
      </TooltipProvider>
    </PageLayout>
  );
}