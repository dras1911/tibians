import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `session.ts` importuje `next/headers`, które poza runtime'em Next rzuca.
// Testujemy WYŁĄCZNIE czyste funkcje (encode/decode) — realne API Next nie
// jest tu potrzebne, więc podstawiamy atrapę.
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import {
  decodeSession,
  encodeSession,
  SESSION_MAX_AGE_SECONDS,
  type SessionUser,
} from "../session";

const SECRET = "test-secret-value-at-least-16-chars";
const USER: SessionUser = {
  discordId: "123456789012345678",
  username: "Atlas",
  avatarUrl: "https://cdn.discordapp.com/avatars/123/a.png",
};

describe("session encode/decode", () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it("roundtrip: zwraca tego samego użytkownika", () => {
    const token = encodeSession(USER);
    expect(token).not.toBeNull();
    expect(decodeSession(token as string)).toEqual(USER);
  });

  it("akceptuje świeży token na granicy TTL", () => {
    const issuedAt = Date.now();
    const token = encodeSession(USER, issuedAt) as string;
    const almostExpired = issuedAt + (SESSION_MAX_AGE_SECONDS - 1) * 1000;
    expect(decodeSession(token, almostExpired)).toEqual(USER);
  });

  it("odrzuca token po upływie TTL", () => {
    const issuedAt = Date.now();
    const token = encodeSession(USER, issuedAt) as string;
    const expired = issuedAt + (SESSION_MAX_AGE_SECONDS + 1) * 1000;
    expect(decodeSession(token, expired)).toBeNull();
  });

  it("odrzuca token z przyszłości (ujemny wiek)", () => {
    const issuedAt = Date.now();
    const token = encodeSession(USER, issuedAt) as string;
    expect(decodeSession(token, issuedAt - 1000)).toBeNull();
  });

  it("odrzuca podmieniony podpis (tampering)", () => {
    const token = encodeSession(USER) as string;
    const [payload] = token.split(".");
    expect(decodeSession(`${payload}.deadbeef`)).toBeNull();
  });

  it("odrzuca podmieniony payload (podpis nie pasuje)", () => {
    const token = encodeSession(USER) as string;
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...USER, discordId: "999", iat: Date.now() }),
      "utf8",
    ).toString("base64url");
    expect(decodeSession(`${forged}.${signature}`)).toBeNull();
  });

  it("odrzuca token podpisany innym sekretem", () => {
    const token = encodeSession(USER) as string;
    process.env.SESSION_SECRET = "a-different-secret-16chars-plus";
    expect(decodeSession(token)).toBeNull();
  });

  it("odrzuca token bez separatora", () => {
    expect(decodeSession("no-dot-here")).toBeNull();
  });

  it("odrzuca payload niebędący JSON-em", () => {
    const bogus = Buffer.from("not-json", "utf8").toString("base64url");
    // Podpis nie pasuje, więc i tak odrzucone — ale test dokumentuje intencję.
    expect(decodeSession(`${bogus}.whatever`)).toBeNull();
  });

  it("zwraca null gdy SESSION_SECRET nieustawiony", () => {
    delete process.env.SESSION_SECRET;
    expect(encodeSession(USER)).toBeNull();
    // Token wygenerowany wcześniej też nie może być zweryfikowany bez sekretu.
    process.env.SESSION_SECRET = SECRET;
    const token = encodeSession(USER) as string;
    delete process.env.SESSION_SECRET;
    expect(decodeSession(token)).toBeNull();
  });

  it("zwraca null gdy sekret jest za krótki", () => {
    process.env.SESSION_SECRET = "short";
    expect(encodeSession(USER)).toBeNull();
  });

  it("avatarUrl=null przechodzi przez roundtrip", () => {
    const anon: SessionUser = { ...USER, avatarUrl: null };
    const token = encodeSession(anon) as string;
    expect(decodeSession(token)).toEqual(anon);
  });
});
