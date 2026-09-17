#!/usr/bin/env python3
"""Tibians browser-fetch — mikroserwis renderujący strony przez CloakBrowser.

DLACZEGO ISTNIEJE:
    tibia.com jest za Cloudflare Managed Challenge. Scraper (Node) musi
    dostawać GOTOWY HTML po przejściu challenge'u. Ten serwis opakowuje
    CloakBrowser (stealth Chromium z patchami C++ na fingerprint) w prosty
    HTTP API — dzięki temu cała „brudna" część przeglądarkowa żyje w jednym
    kontenerze, a scraper pozostaje zwykłym klientem HTTP.

API (zgodne z podzbiorem FlareSolverr — jeden klient w scraperze obsługuje
i ten serwis, i prawdziwy FlareSolverr jako fallback):

    POST /v1
      {"cmd": "request.get", "url": "...", "maxTimeout": 60000}
      → {"status": "ok", "solution": {"url", "status", "response", "headers"}}
      → {"status": "error", "message": "..."}

      {"cmd": "health"}
      → {"status": "ok", "message": "browser-fetch (CloakBrowser) ready"}

    GET /health → {"status": "ok"}  (dla docker healthcheck)

Env:
    BF_BIND        — adres nasłuchu (default 0.0.0.0)
    BF_PORT        — port (default 8192)
    BF_TOKEN       — opcjonalny token; gdy ustawiony, wymagany w nagłówku
                     `X-BF-Token` (ochrona przed otwartym proxy)
    CB_PROXY       — proxy dla przeglądarki (np. socks5://127.0.0.1:40000 — WARP)
    BF_HEADLESS    — "1" (default) / "0" (headed — Xvfb w obrazie)
    BF_HUMANIZE    — "1" włącza human-like ruchy (default "0")
    BF_CHALLENGE_WAIT_S — maks. czas oczekiwania na przejście challenge'u
                     (default 15)

Bezpieczeństwo: serwis ma być wystawiony WYŁĄCZNIE do sieci dockerowej
(host network + ufw: allow from 172.16.0.0/12) i/lub chroniony tokenem.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cloakbrowser import launch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("browser-fetch")

BIND = os.environ.get("BF_BIND", "0.0.0.0")
PORT = int(os.environ.get("BF_PORT", "8192"))
TOKEN = os.environ.get("BF_TOKEN") or None
PROXY = os.environ.get("CB_PROXY") or None
HEADLESS = os.environ.get("BF_HEADLESS", "1") == "1"
HUMANIZE = os.environ.get("BF_HUMANIZE", "0") == "1"
CHALLENGE_WAIT_S = float(os.environ.get("BF_CHALLENGE_WAIT_S", "15"))
DEFAULT_TIMEOUT_MS = int(os.environ.get("BF_TIMEOUT_MS", "60000"))

# Markery stron przejściowych Cloudflare (gdyby challenge nie zdążył przejść).
CHALLENGE_MARKERS = (
    "Just a moment",
    "Attention Required",
    "cf-mitigated",
    "challenge-platform",
    "Verifying you are human",
)

# ── Stan przeglądarki (lazy init + lock) ────────────────────────────────────

_browser = None
_lock = threading.Lock()


def _get_browser():
    """Zwraca (i w razie potrzeby tworzy) singleton CloakBrowser."""
    global _browser
    if _browser is None:
        kwargs: dict = {"headless": HEADLESS}
        if PROXY:
            kwargs["proxy"] = PROXY
        if HUMANIZE:
            kwargs["humanize"] = True
        log.info("launch cloakbrowser (headless=%s, proxy=%s)", HEADLESS, PROXY)
        _browser = launch(**kwargs)
    return _browser


def _reset_browser(reason: str) -> None:
    """Zamyka i unieważnia singleton (po crashu Chrome)."""
    global _browser
    log.warning("reset browser: %s", reason)
    try:
        if _browser is not None:
            _browser.close()
    except Exception:  # noqa: BLE001 — best-effort cleanup
        pass
    _browser = None


def _looks_like_challenge(html: str) -> bool:
    return any(marker in html for marker in CHALLENGE_MARKERS)


def _wait_out_challenge(page) -> str:
    """Czeka aż strona przestanie być challenge'em CF; zwraca finalny HTML."""
    html = page.content()
    deadline = time.time() + CHALLENGE_WAIT_S
    while _looks_like_challenge(html) and time.time() < deadline:
        page.wait_for_timeout(1200)
        html = page.content()
    return html


def _fetch_once(url: str, timeout_ms: int) -> dict:
    """Jedno pobranie strony (współdzielony lock — jeden page naraz)."""
    with _lock:
        browser = _get_browser()
        page = browser.new_page()
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            status = response.status if response is not None else 0
            headers = {}
            try:
                headers = response.all_headers() if response is not None else {}
            except Exception:  # noqa: BLE001 — nagłówki są opcjonalne
                headers = {}
            html = _wait_out_challenge(page)
            return {
                "url": page.url,
                "status": status,
                "response": html,
                "headers": headers,
            }
        finally:
            try:
                page.close()
            except Exception:  # noqa: BLE001
                pass


def do_request_get(url: str, timeout_ms: int) -> dict:
    """request.get z jednorazową autoregeneracją przeglądarki."""
    try:
        return _fetch_once(url, timeout_ms)
    except Exception as first_err:  # noqa: BLE001
        msg = f"{type(first_err).__name__}: {first_err}"
        # Chrome mógł umrzeć — spróbuj raz jeszcze na świeżej instancji.
        _reset_browser(msg)
        return _fetch_once(url, timeout_ms)


# ── HTTP handler ─────────────────────────────────────────────────────────────


class Handler(BaseHTTPRequestHandler):
    server_version = "tibians-browser-fetch/1.0"

    # Logowanie w formacie prostym (json-file w dockerze i tak zbiera).
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        log.info("%s - %s", self.address_string(), fmt % args)

    def _send_json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        if TOKEN is None:
            return True
        return self.headers.get("X-BF-Token", "") == TOKEN

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/health", "/"):
            self._send_json(200, {"status": "ok"})
        else:
            self._send_json(404, {"status": "error", "message": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1":
            self._send_json(404, {"status": "error", "message": "not found"})
            return
        if not self._authorized():
            self._send_json(403, {"status": "error", "message": "invalid token"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, TypeError) as err:
            self._send_json(400, {"status": "error", "message": f"bad json: {err}"})
            return

        cmd = payload.get("cmd")
        if cmd == "health":
            self._send_json(
                200,
                {"status": "ok", "message": "browser-fetch (CloakBrowser) ready"},
            )
            return

        if cmd != "request.get":
            self._send_json(
                400, {"status": "error", "message": f"unsupported cmd: {cmd!r}"}
            )
            return

        url = payload.get("url")
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            self._send_json(400, {"status": "error", "message": "missing/invalid url"})
            return

        timeout_ms = int(payload.get("maxTimeout") or DEFAULT_TIMEOUT_MS)
        started = time.time()
        try:
            solution = do_request_get(url, timeout_ms)
        except Exception as err:  # noqa: BLE001 — kontrakt: błąd jako JSON
            log.error("fetch failed url=%s err=%s", url, err)
            self._send_json(
                500, {"status": "error", "message": f"{type(err).__name__}: {err}"}
            )
            return

        log.info(
            "fetch ok url=%s status=%s len=%d dt=%.1fs",
            url,
            solution.get("status"),
            len(solution.get("response", "")),
            time.time() - started,
        )
        self._send_json(200, {"status": "ok", "solution": solution})


def main() -> None:
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    log.info(
        "browser-fetch listening on %s:%d (token=%s, proxy=%s)",
        BIND,
        PORT,
        "yes" if TOKEN else "no",
        PROXY,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _reset_browser("shutdown")
        server.server_close()


if __name__ == "__main__":
    main()
