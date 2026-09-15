import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@tibians/db";

/**
 * /api/health (plan T75, używany przez Dockerfile.web + docker-compose.prod.yml)
 *
 * Sprawdza:
 *   1. PostgreSQL — `SELECT 1`
 *   2. TibiaData — `GET {TIBIADATA_BASE_URL}/readyz` (2 s timeout)
 *   3. Świeżość scrape'a — wiek najnowszego `scrape_runs` (ostrzeżenie > 30 min)
 *
 * 200 = wszystko OK (freshness może być ostrzeżeniem)
 * 503 = krytyczny komponent (DB lub TibiaData) niedostępny
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface HealthPayload {
  status: "ok" | "degraded";
  db: "ok" | "error";
  tibiadata: "ok" | "error" | "unknown";
  scrapeFreshnessMinutes: number | null;
  scrapeStale: boolean;
  timestamp: string;
}

const TIBIADATA_URL =
  process.env.TIBIADATA_BASE_URL ?? "http://tibiadata:8080";
const STALE_THRESHOLD_MINUTES = 30;

async function checkDb(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

async function checkTibiaData(): Promise<boolean | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    const res = await fetch(`${TIBIADATA_URL}/readyz`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return null; // unknown — nie blokuje health (TibiaData to only auxiliary source)
  }
}

async function checkScrapeFreshness(): Promise<number | null> {
  try {
    const rows = await db.execute<{ minutes: number | null }>(
      sql`SELECT EXTRACT(EPOCH FROM (NOW() - MAX(started_at))) / 60 AS minutes
          FROM scrape_runs`,
    );
    const first = rows.rows[0];
    if (!first || first.minutes == null) return null;
    return Math.round(Number(first.minutes));
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse<HealthPayload>> {
  const [dbOk, tibiadataOk, freshness] = await Promise.all([
    checkDb(),
    checkTibiaData(),
    checkScrapeFreshness(),
  ]);

  const scrapeStale =
    freshness !== null && freshness > STALE_THRESHOLD_MINUTES;

  // Krytyczne: DB. TibiaData unknown (null) nie blokuje — mamy fallback na Bazaar scrape.
  const critical = dbOk;
  const status: HealthPayload["status"] =
    critical && !scrapeStale ? "ok" : "degraded";

  const payload: HealthPayload = {
    status,
    db: dbOk ? "ok" : "error",
    tibiadata: tibiadataOk === null ? "unknown" : tibiadataOk ? "ok" : "error",
    scrapeFreshnessMinutes: freshness,
    scrapeStale,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, { status: critical ? 200 : 503 });
}
