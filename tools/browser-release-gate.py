#!/usr/bin/env python3
"""Real-Chrome release gates for the exact asset-backed and asset-free builds."""

from __future__ import annotations

import argparse
import base64
import io
import re
import sys
import threading
import time
import traceback
import zipfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PLAYWRIGHT_IMPORT_ERROR: ImportError | None = None
try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except ImportError as error:
    PLAYWRIGHT_IMPORT_ERROR = error
    PlaywrightTimeoutError = None
    sync_playwright = None


ROOT = Path(__file__).resolve().parents[1]
CHROME = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")

DDPDOJ_ROM_NAMES = (
    "cave_a04401w064.u7",
    "cave_a04402w064.u8",
    "cave_b04401w064.u1",
    "cave_m04401b032.u17",
    "cave_t04401w064.u19",
    "ddb10_10_8_434f.u45",
    "ddp3_bios.u37",
    "ddp3blk_defaults.nv",
    "pgm_m01s.rom",
    "pgm_t01s.rom",
)
ROM_FIXTURES = tuple(ROOT / "games/ddpdoj/rip/rom" / name for name in DDPDOJ_ROM_NAMES)
DDPDOJ_7Z_FIXTURE = Path("C:/oldpcsx2/ddpdojblk.7z")
SYNTHETIC_7Z_FIXTURE = base64.b64decode(
    "N3q8ryccAAR1baoBCAAAAAAAAABiAAAAAAAAAA+E0UQBAAMBAgMEAAEEBgABCQgABwsBAAEhIQEA"
    "DAQACAoBzfs8tgAABQEZDAAAAAAAAAAAAAAAABEXAG0AZQBtAGIAZQByAC4AcgBvAG0AAAAZBAAA"
    "AAAUCgEAQBCnDXw23QEVBgEAIIC2gQAA"
)

FORBIDDEN_CARTRIDGE_SEGMENTS = frozenset({
    "rip", "rom", "roms", "cartridge", "cartridges", "archives",
})
FORBIDDEN_ASSET_FREE_SEGMENTS = frozenset({
    "assets", "capture", "seed", "tables", "shards",
})
FORBIDDEN_CARTRIDGE_SUFFIXES = (
    ".rom", ".gb", ".gbc", ".gba", ".nes", ".sfc", ".smc",
    ".md", ".gen", ".pce", ".n64", ".z64", ".v64", ".nds",
    ".3ds", ".prg", ".iso", ".cue", ".ccd", ".chd", ".nv",
    ".zip", ".7z", ".rar",
)
FORBIDDEN_ASSET_FREE_SUFFIXES = FORBIDDEN_CARTRIDGE_SUFFIXES + (
    ".bin", ".gz",
)
CARTRIDGE_CHIP_SUFFIX = re.compile(r"\.(?:u|ic)\d+[a-z]?$", re.IGNORECASE)
EXPECTED_FORMATION_ERROR = "Error: formation mode cannot be combined with a native P2 selection"
EXPECTED_FORMATION_VISIBLE_ERROR = (
    "The game could not start.\n\n"
    "formation mode cannot be combined with a native P2 selection\n\n"
    "The frame loop has stopped. Reload to start again."
)
RUNNING_DDPDOJ = (
    "DaiOuJou is running entirely from validated local ROMs. "
    "Insert a coin with 5, then press Enter."
)

CANVAS_IDENTITY = """
({ selector, width, height }) => {
  const canvas = document.querySelector(selector);
  if (!canvas) return { valid: false, reason: 'missing canvas' };
  const style = getComputedStyle(canvas);
  const bounds = canvas.getBoundingClientRect();
  const visible = !canvas.hidden && style.display !== 'none' && style.visibility !== 'hidden'
    && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0;
  if (!visible) return { valid: false, reason: 'hidden canvas' };
  if (canvas.width !== width || canvas.height !== height) {
    return { valid: false, reason: `dimensions ${canvas.width}x${canvas.height}` };
  }
  const context = canvas.getContext('2d');
  if (!context) return { valid: false, reason: 'missing 2d context' };
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonBlack = 0;
  let hash = 2166136261;
  const blockHashes = new Uint32Array(64);
  blockHashes.fill(2166136261);
  const colors = new Set();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const rgb = (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2];
    if (rgb !== 0) nonBlack += 1;
    if (colors.size < 256) colors.add(rgb);
    hash = Math.imul(hash ^ rgb, 16777619) >>> 0;
    const pixel = offset >>> 2;
    const x = pixel % canvas.width;
    const y = Math.floor(pixel / canvas.width);
    const cell = Math.min(7, Math.floor(y * 8 / canvas.height)) * 8
      + Math.min(7, Math.floor(x * 8 / canvas.width));
    blockHashes[cell] = Math.imul(blockHashes[cell] ^ rgb, 16777619) >>> 0;
  }
  return {
    valid: nonBlack >= 512 && colors.size >= 8,
    reason: `nonBlack=${nonBlack} colors=${colors.size}`,
    nonBlack,
    colors: colors.size,
    hash,
    blockHashes: Array.from(blockHashes),
    bounds: [bounds.width, bounds.height],
  };
}
"""


class GateFailure(RuntimeError):
    """A release invariant failed."""

    def __init__(self, message: str,
                 diagnostics: tuple[BaseException, ...] = ()) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


def parse_release_headers(directory: str) -> tuple[tuple[str, dict[str, str]], ...]:
    rules: list[tuple[str, dict[str, str]]] = []
    current: dict[str, str] | None = None
    for raw in (Path(directory) / "_headers").read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        if raw[0].isspace():
            if current is None or ":" not in raw:
                raise GateFailure(f"malformed generated _headers line: {raw!r}")
            name, value = raw.strip().split(":", 1)
            current[name] = value.strip()
            continue
        current = {}
        rules.append((raw.strip(), current))
    return tuple(rules)


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Serve one build root with production headers and no request logging."""

    def __init__(self, *args, directory: str, **kwargs) -> None:
        self.release_headers = parse_release_headers(directory)
        super().__init__(*args, directory=directory, **kwargs)

    def production_headers(self) -> dict[str, str]:
        request_path = unquote(urlsplit(self.path).path)
        headers: dict[str, str] = {}
        for pattern, values in self.release_headers:
            matches = request_path == pattern
            if pattern.endswith("*"):
                matches = request_path.startswith(pattern[:-1])
            if matches:
                headers.update(values)
        return headers

    def guess_type(self, path: str) -> str:
        supplied = self.production_headers().get("Content-Type")
        return supplied if supplied else super().guess_type(path)

    def end_headers(self) -> None:
        production = self.production_headers()
        production.pop("Content-Type", None)
        cache_control = production.pop("Cache-Control", "no-store, must-revalidate")
        for name, value in production.items():
            self.send_header(name, value)
        self.send_header(
            "Cache-Control", f"{cache_control}, no-cache, max-age=0"
        )
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *_args) -> None:
        pass

    def _reject_write(self) -> None:
        self.send_response(405)
        self.send_header("Allow", "GET, HEAD")
        self.end_headers()

    do_POST = _reject_write
    do_PUT = _reject_write
    do_PATCH = _reject_write
    do_DELETE = _reject_write


def require(condition: bool, message: str) -> None:
    if not condition:
        raise GateFailure(message)


def require_files(paths: tuple[Path, ...], label: str) -> None:
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise GateFailure(f"missing {label}: {', '.join(missing)}")


def request_violation(request, origin: str, asset_free: bool) -> str | None:
    parsed = urlsplit(request.url)
    request_origin = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
    if request_origin != origin:
        return f"nonlocal request {request.method} {request.url}"
    if request.method not in {"GET", "HEAD"} or request.post_data:
        return f"upload or unsupported method {request.method} {request.url}"
    path = unquote(parsed.path).lower()
    segments = {segment for segment in path.split("/") if segment}
    basename = path.rsplit("/", 1)[-1]
    if basename in {name.lower() for name in DDPDOJ_ROM_NAMES}:
        return f"page requested local fixture name {request.url}"
    if segments & FORBIDDEN_CARTRIDGE_SEGMENTS:
        return f"page requested cartridge path {request.url}"
    if path.endswith(FORBIDDEN_CARTRIDGE_SUFFIXES) \
            or CARTRIDGE_CHIP_SUFFIX.search(path):
        return f"page requested cartridge-like file {request.url}"
    if not asset_free:
        return None
    if segments & FORBIDDEN_ASSET_FREE_SEGMENTS:
        return f"asset-free page requested cartridge path {request.url}"
    if path.endswith(FORBIDDEN_ASSET_FREE_SUFFIXES):
        return f"asset-free page requested cartridge-like file {request.url}"
    return None


class BrowserGate:
    def __init__(self, browser, origin: str, asset_free: bool) -> None:
        self.browser = browser
        self.origin = origin
        self.asset_free = asset_free

    def run(self, name: str, body, expected_console_errors: tuple[str, ...] = ()) -> None:
        context = self.browser.new_context(
            viewport={"width": 1280, "height": 900},
            service_workers="block",
            accept_downloads=False,
        )
        failures: list[str] = []
        active_requests: set = set()
        failed_requests: list[tuple[object, str, str, str, bool]] = []
        closing_context = False
        extra_pages: list = []
        expected = list(expected_console_errors)

        def intercept(route) -> None:
            violation = request_violation(route.request, self.origin, self.asset_free)
            if violation:
                failures.append(violation)
                route.abort("blockedbyclient")
            else:
                route.continue_()

        def console(message) -> None:
            if message.type != "error":
                return
            lines = message.text.splitlines()
            expected_with_stack = expected and lines and lines[0] == expected[0] \
                and all(line.startswith("    at ") for line in lines[1:])
            if expected and (message.text == expected[0] or expected_with_stack):
                expected.pop(0)
            else:
                failures.append(f"console error: {message.text}")

        def request_started(request) -> None:
            active_requests.add(request)

        def failed(request) -> None:
            failed_requests.append(
                (request, request.method, request.url, str(request.failure), closing_context)
            )
            active_requests.discard(request)

        def finished(request) -> None:
            active_requests.discard(request)

        def response_received(response) -> None:
            headers = response.headers
            cache_control = headers.get("cache-control", "")
            if not ({"no-store", "no-cache"} & {
                directive.strip().lower()
                for directive in cache_control.split(",")
            }) or headers.get("pragma", "").lower() != "no-cache" \
                    or headers.get("expires") != "0":
                failures.append(f"cacheable response: {response.url}")
            if response.status >= 400:
                failures.append(f"HTTP {response.status}: {response.url}")
            if self.asset_free:
                response_path = unquote(urlsplit(response.url).path)
                if response_path in {"/", "/index.html"}:
                    csp = headers.get("content-security-policy", "")
                    for directive in (
                        "script-src 'self' 'wasm-unsafe-eval'",
                        "worker-src 'self'",
                        "connect-src 'self'",
                    ):
                        if directive not in csp:
                            failures.append(
                                f"production CSP missing {directive}: {response.url}"
                            )
                if response_path.endswith("/sevenzip-wasm.wasm") \
                        and headers.get("content-type", "").split(";", 1)[0] \
                        != "application/wasm":
                    failures.append(f"wrong WASM content type: {response.url}")

        def instrument_page(candidate) -> None:
            candidate.on("pageerror", lambda error: failures.append(f"page error: {error}"))
            candidate.on("download", lambda download: failures.append(
                f"download started: {download.suggested_filename}"
            ))
            candidate.on("websocket", lambda websocket: failures.append(
                f"websocket opened: {websocket.url}"
            ))
            candidate.on("popup", lambda extra_page: reject_extra_page(extra_page))

        def block_websocket(websocket_route) -> None:
            failures.append(f"websocket attempted: {websocket_route.url}")
            websocket_route.close(code=1008, reason="release gate blocks WebSockets")

        context.on("console", console)
        context.on("request", request_started)
        context.on("requestfailed", failed)
        context.on("requestfinished", finished)
        context.on("response", response_received)
        context.route("**/*", intercept)
        route_web_socket = getattr(context, "route_web_socket", None)
        if not callable(route_web_socket):
            close_error = None
            try:
                context.close()
            except Exception as error:
                close_error = error
            message = f"{name}: installed Playwright cannot block WebSockets"
            if close_error is not None:
                message += f"; context close failed: {close_error}"
                raise GateFailure(
                    message, diagnostics=(close_error,)
                ) from close_error
            raise GateFailure(message)
        try:
            route_web_socket("**/*", block_websocket)
        except Exception as error:
            diagnostics = [error]
            message = f"{name}: could not install WebSocket firewall: {error}"
            try:
                context.close()
            except Exception as close_error:
                diagnostics.append(close_error)
                message += f"; context close failed: {close_error}"
            raise GateFailure(
                message, diagnostics=tuple(diagnostics)
            ) from error

        page = context.new_page()
        instrument_page(page)

        def reject_extra_page(extra_page) -> None:
            if any(candidate is extra_page for candidate in extra_pages):
                return
            extra_pages.append(extra_page)
            failures.append(f"popup or extra page opened: {extra_page.url}")
            instrument_page(extra_page)
            try:
                extra_page.close()
            except Exception as error:
                failures.append(f"could not close extra page: {error}")

        context.on("page", reject_extra_page)
        body_error: Exception | None = None
        close_error: Exception | None = None
        try:
            recheck = body(page)
            try:
                page.wait_for_load_state("networkidle", timeout=60000)
            except PlaywrightTimeoutError as error:
                raise GateFailure("network did not become idle") from error
            page.wait_for_timeout(1500)
            if callable(recheck):
                recheck()
            page.wait_for_timeout(250)
        except Exception as error:
            body_error = error
            try:
                if not page.is_closed():
                    page.wait_for_timeout(750)
            except Exception as settle_error:
                failures.append(f"could not settle failed page: {settle_error}")
        finally:
            closing_context = True
            try:
                context.close()
            except Exception as error:
                close_error = error
                failures.append(f"context close failed: {error}")

        for _request, method, url, detail, during_close in failed_requests:
            failures.append(
                f"request failed: {method} {url}: {detail} "
                f"(during context close: {during_close})"
            )
        for request in active_requests:
            failures.append(
                f"request remained unfinished: {request.method} {request.url}"
            )
        if expected:
            failures.append(f"expected console error was not observed: {expected[0]}")

        details = []
        if body_error is not None:
            details.append(str(body_error))
        details.extend(failures)
        if details:
            diagnostics = tuple(
                error for error in (body_error, close_error)
                if error is not None
            )
            failure = GateFailure(
                f"{name}: {'; '.join(details)}",
                diagnostics=diagnostics,
            )
            if diagnostics:
                raise failure from diagnostics[0]
            raise failure

        print(f"PASS {name}")


def open_page(page, origin: str, path: str) -> None:
    response = page.goto(f"{origin}{path}", wait_until="domcontentloaded", timeout=120000)
    require(response is not None and response.ok, f"navigation failed for {path}")


def wait_for_condition(page, predicate: str, *, arg=None,
                       polling: int = 100, timeout: int = 30000) -> None:
    deadline = time.monotonic() + timeout / 1000
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            ready = page.evaluate(predicate, arg) if arg is not None \
                else page.evaluate(predicate)
            if ready:
                return
            last_error = None
        except Exception as error:
            last_error = error
        page.wait_for_timeout(polling)
    failure = GateFailure(
        f"browser condition did not become true within {timeout} ms: {predicate[:120]}"
    )
    if last_error is not None:
        raise failure from last_error
    raise failure


def canvas_identity(page, selector: str, width: int, height: int,
                    timeout: int = 60000) -> dict:
    arguments = {"selector": selector, "width": width, "height": height}
    try:
        wait_for_condition(
            page,
            f"arguments => ({CANVAS_IDENTITY})(arguments).valid",
            arg=arguments,
            timeout=timeout,
        )
    except GateFailure as error:
        identity = page.evaluate(CANVAS_IDENTITY, arguments)
        raise GateFailure(
            f"{selector} did not become a visible diverse canvas: "
            f"{identity.get('reason', identity)}"
        ) from error
    identity = page.evaluate(CANVAS_IDENTITY, arguments)
    require(identity["valid"],
            f"{selector} is not a visible diverse canvas: {identity['reason']}")
    return identity


def require_canvas_change(first: dict, second: dict, label: str) -> None:
    require(second["hash"] != first["hash"], f"{label} canvas did not change")
    changed_blocks = sum(
        before != after
        for before, after in zip(first["blockHashes"], second["blockHashes"], strict=True)
    )
    require(changed_blocks >= 2,
            f"{label} canvas changed in only {changed_blocks} of 64 pixel blocks")


def wait_for_canvas_change(page, first: dict, selector: str, width: int, height: int,
                           label: str, timeout: int = 15000) -> dict:
    arguments = {
        "selector": selector,
        "width": width,
        "height": height,
        "hash": first["hash"],
        "blockHashes": first["blockHashes"],
    }
    predicate = f"""arguments => {{
      const current = ({CANVAS_IDENTITY})(arguments);
      if (!current.valid || current.hash === arguments.hash) return false;
      let changed = 0;
      for (let index = 0; index < current.blockHashes.length; index++) {{
        if (current.blockHashes[index] !== arguments.blockHashes[index]) changed++;
      }}
      return changed >= 2;
    }}"""
    try:
        wait_for_condition(
            page, predicate, arg=arguments, polling=250, timeout=timeout
        )
    except GateFailure:
        current = canvas_identity(page, selector, width, height)
        require_canvas_change(first, current, label)
        return current
    current = canvas_identity(page, selector, width, height)
    require_canvas_change(first, current, label)
    return current


def gate_asset_backed(browser, origin: str) -> None:
    gate = BrowserGate(browser, origin, asset_free=False)

    def root_launcher(page):
        open_page(page, origin, "/")
        wait_for_condition(
            page,
            "document.querySelectorAll('#gamegrid .card.game').length === 3",
            timeout=30000,
        )

        def assert_root_launcher() -> None:
            require(page.locator("#gamegrid").count() == 1, "root launcher has no #gamegrid")
            cards = page.locator("#gamegrid .card.game")
            require(cards.count() == 3,
                    "root launcher does not expose exactly three games")
            require(all(cards.nth(index).is_visible() for index in range(3)),
                    "one or more root launcher game cards are hidden")
            boot_error = page.locator("#boot-err")
            require(boot_error.count() == 1, "root launcher has no #boot-err")
            require(boot_error.is_hidden(), "root launcher shows #boot-err")

        assert_root_launcher()
        return assert_root_launcher

    gate.run("asset-backed root launcher", root_launcher)

    def mod_only_cabinet(page):
        open_page(page, origin, "/games/ddpdoj/start.html")
        page.locator('[data-category="survival"] [data-id="invincibility"]').click()
        page.locator("#launch").click()
        page.wait_for_url("**/games/ddpdoj/index.html*", timeout=30000)
        require(urlsplit(page.url).fragment == "mods=invincibility",
                f"unexpected mod-only launch URL {page.url}")
        wait_for_condition(page, "window.__mixup !== undefined", timeout=180000)
        page.evaluate("() => { window.__mixup.demo.running = false; }")

        def read_state() -> dict:
            return page.evaluate("""() => {
              const app = window.__mixup;
              const ram = app.game.ram;
              const types = [];
              for (let index = 0; index < 20; index++) {
                const word = ram.u16(0x80e240 + index * 0x50);
                if (word !== 0) types.push(word & 0xff);
              }
              return {
                coldBoot: app.demo.coldBoot,
                seedLf: app.demo.seedLf,
                logicFrame: app.game.logicFrame,
                videoFrame: app.game.videoFrame,
                booted: Boolean(app.game.bootResult),
                modIds: app.stats().modIds,
                formationId: app.stats().formationId,
                runActive: app.demo.mods.runtime.cabinetRunActive,
                screenState: ram.u16(0x812e56),
                demoFlag: ram.u16(0x803926),
                credit: ram.u8(0x80395a),
                loop: ram.u16(0x813098),
                types,
              };
            }""")

        def advance_to(frame: int) -> dict:
            page.evaluate("""target => {
              const demo = window.__mixup.demo;
              while (demo.game.logicFrame < target) demo.step();
            }""", frame)
            return read_state()

        initial = read_state()
        require(initial["coldBoot"] is True, "mod-only launch is not a cold boot")
        require(initial["seedLf"] == 0, f"mod-only seed LF is {initial['seedLf']}")
        require(initial["logicFrame"] < 305,
                f"mod-only page advanced past warning at LF{initial['logicFrame']}")
        require(initial["videoFrame"] < 305,
                f"mod-only page advanced past warning video frame {initial['videoFrame']}")
        require(initial["booted"] is True, "mod-only launch skipped Game.boot")
        require(initial["modIds"] == ["invincibility"],
                f"wrong mod-only IDs {initial['modIds']}")
        require(initial["formationId"] is None, "mod-only launch gained a formation")
        require(initial["runActive"] is False, "mod activated before cabinet flow")

        warning = advance_to(20)
        require(warning["screenState"] == 13,
                f"mod-only warning state is {warning['screenState']}")
        scores = advance_to(305)
        require(scores["screenState"] == 2 and scores["credit"] == 0,
                f"mod-only zero-credit screen is {scores}")

        page.keyboard.down("Enter")
        refused = advance_to(306)
        page.keyboard.up("Enter")
        require(refused["screenState"] == 2 and refused["credit"] == 0,
                "mod-only uncredited START was not refused")

        title = advance_to(1190)
        require(title["screenState"] == 1, f"mod-only title state is {title['screenState']}")
        attract = advance_to(1940)
        require(attract["screenState"] == 5 and attract["demoFlag"] == 1,
                f"mod-only attract state is {attract}")
        require(attract["runActive"] is False,
                "Invincibility activated during attract gameplay")

        returned = advance_to(4340)
        require(returned["screenState"] == 2 and returned["demoFlag"] == 0,
                f"mod-only attract did not return to cabinet: {returned}")
        page.keyboard.down("5")
        for _ in range(30):
            page.evaluate("() => window.__mixup.demo.step()")
        page.keyboard.up("5")
        credited = read_state()
        require(credited["credit"] == 1 and credited["screenState"] == 3,
                f"mod-only coin did not credit: {credited}")

        page.keyboard.down("Enter")
        for _ in range(12):
            page.evaluate("() => window.__mixup.demo.step()")
        page.keyboard.up("Enter")
        selection = read_state()
        require(selection["credit"] == 0 and selection["screenState"] == 14,
                f"mod-only START did not spend one credit: {selection}")
        require(9 in selection["types"],
                f"mod-only credited path has no fighter selector: {selection['types']}")
        require(selection["runActive"] is False,
                "Invincibility activated before fighter selection completed")

        gameplay = advance_to(selection["logicFrame"] + 2500)
        require(2 in gameplay["types"] and 11 in gameplay["types"]
                and 9 not in gameplay["types"],
                f"mod-only selector did not hand off to gameplay: {gameplay['types']}")
        require(gameplay["runActive"] is True,
                "Invincibility did not activate at credited selector handoff")
        require(gameplay["loop"] == 0,
                f"Invincibility changed the cartridge loop counter to {gameplay['loop']}")

        def recheck() -> None:
            current = read_state()
            require(current["coldBoot"] is True and current["seedLf"] == 0,
                    "mod-only cold-boot identity changed during settling")
            require(current["runActive"] is True,
                    "mod-only credited run policy became inactive")
            require(2 in current["types"] and 11 in current["types"]
                    and 9 not in current["types"],
                    f"mod-only gameplay topology changed: {current['types']}")

        return recheck

    gate.run("asset-backed mod-only cabinet flow", mod_only_cabinet)

    def side_by_side(page):
        open_page(page, origin, "/games/ddpdoj/start.html")
        white = page.locator("#edition-white-label")
        require(white.is_disabled(), "White Label is selectable")
        require(white.get_attribute("aria-disabled") == "true", "White Label lacks aria-disabled")
        page.locator('[data-category="survival"] [data-id="invincibility"]').click()
        page.locator("#formation-side-by-side").click()
        page.locator("#launch").click()
        page.wait_for_url("**/games/ddpdoj/index.html*", timeout=30000)
        require(urlsplit(page.url).fragment
                == "mods=invincibility&formation=fly-both-ships-side-by-side",
                f"unexpected side-by-side launch URL {page.url}")
        wait_for_condition(page, "window.__mixup !== undefined", timeout=180000)

        def read_state() -> dict:
            return page.evaluate("""() => ({
              logicFrame: window.__mixup.stats().logicFrame,
              modIds: window.__mixup.stats().modIds,
              formationId: window.__mixup.stats().formationId,
              companions: window.__mixup.demo.formation.foundation.companions.length,
            })""")

        def assert_state(state: dict) -> None:
            require(state["modIds"] == ["invincibility"], f"wrong mod IDs {state['modIds']}")
            require(state["formationId"] == "fly-both-ships-side-by-side",
                    f"wrong formation ID {state['formationId']}")
            require(state["companions"] == 1,
                    f"expected one companion, got {state['companions']}")

        initial = read_state()
        assert_state(initial)
        first_canvas = canvas_identity(page, "#screen", 224, 448)
        wait_for_condition(
            page,
            "minimum => window.__mixup.stats().logicFrame >= minimum",
            arg=initial["logicFrame"] + 8,
            timeout=30000,
        )
        page.wait_for_timeout(500)
        second = read_state()
        assert_state(second)
        require(second["logicFrame"] >= initial["logicFrame"] + 8,
                "side-by-side logic frames did not advance")
        second_canvas = wait_for_canvas_change(
            page, first_canvas, "#screen", 224, 448, "side-by-side"
        )

        def recheck() -> None:
            current = read_state()
            assert_state(current)
            require(current["logicFrame"] >= second["logicFrame"] + 8,
                    "side-by-side logic frames stopped during settling")
            wait_for_canvas_change(
                page, second_canvas, "#screen", 224, 448, "settled side-by-side"
            )

        return recheck

    gate.run("asset-backed side-by-side formation", side_by_side)

    def three_ship(page):
        open_page(page, origin, "/games/ddpdoj/start.html")
        page.locator("#formation-three").click()
        page.locator("#launch").click()
        page.wait_for_url("**/games/ddpdoj/index.html*", timeout=30000)
        wait_for_condition(page, "window.__mixup !== undefined", timeout=180000)

        def read_state() -> dict:
            return page.evaluate("""() => ({
              logicFrame: window.__mixup.stats().logicFrame,
              formationId: window.__mixup.stats().formationId,
              companions: window.__mixup.demo.formation.foundation.companions.length,
            })""")

        def assert_state(state: dict) -> None:
            require(state["formationId"] == "all-three-pilots-each-piloting-a-ship",
                    f"wrong three-ship formation ID {state['formationId']}")
            require(state["companions"] == 2,
                    f"expected two companions, got {state['companions']}")

        initial = read_state()
        assert_state(initial)
        first_canvas = canvas_identity(page, "#screen", 224, 448)
        wait_for_condition(
            page,
            "minimum => window.__mixup.stats().logicFrame >= minimum",
            arg=initial["logicFrame"] + 8,
            timeout=30000,
        )
        page.wait_for_timeout(500)
        second = read_state()
        assert_state(second)
        require(second["logicFrame"] >= initial["logicFrame"] + 8,
                "three-ship logic frames did not advance")
        second_canvas = wait_for_canvas_change(
            page, first_canvas, "#screen", 224, 448, "three-ship"
        )

        def recheck() -> None:
            current = read_state()
            assert_state(current)
            require(current["logicFrame"] >= second["logicFrame"] + 8,
                    "three-ship logic frames stopped during settling")
            wait_for_canvas_change(
                page, second_canvas, "#screen", 224, 448, "settled three-ship"
            )

        return recheck

    gate.run("asset-backed three-ship formation", three_ship)

    def menu_conflict(page):
        open_page(
            page,
            origin,
            "/games/ddpdoj/start.html?p2=1&p2ship=2&p2style=6",
        )
        page.locator("#formation-side-by-side").click()

        def assert_menu_conflict() -> None:
            conflict = page.locator("#conflict")
            require(conflict.inner_text()
                    == " | Formation cannot be combined with an explicit native P2 selection",
                    "formation and native P2 conflict text is not exact")
            require(page.locator("#launch").is_disabled(), "conflicted launch remains enabled")

        assert_menu_conflict()
        return assert_menu_conflict

    gate.run("asset-backed formation menu conflict", menu_conflict)

    def direct_conflict(page):
        open_page(
            page,
            origin,
            "/games/ddpdoj/index.html?p2=1&p2ship=2&p2style=6"
            "#formation=fly-both-ships-side-by-side",
        )
        error = page.locator("#err")
        error.wait_for(state="visible", timeout=30000)

        def assert_direct_conflict() -> None:
            require(error.inner_text() == EXPECTED_FORMATION_VISIBLE_ERROR,
                    f"direct formation conflict error is not exact: {error.inner_text()!r}")
            require(page.evaluate("() => window.__mixup === undefined"),
                    "direct formation conflict constructed window.__mixup")

        assert_direct_conflict()
        return assert_direct_conflict

    gate.run(
        "asset-backed direct formation conflict",
        direct_conflict,
        expected_console_errors=(EXPECTED_FORMATION_ERROR,),
    )


def gate_asset_free(browser, origin: str) -> None:
    gate = BrowserGate(browser, origin, asset_free=True)

    def zip_intake(page):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as output:
            for fixture in ROM_FIXTURES:
                output.writestr(fixture.name, fixture.read_bytes())
        open_page(page, origin, "/")
        page.locator("#files").set_input_files({
            "name": "ddpdojblk.zip",
            "mimeType": "application/zip",
            "buffer": archive.getvalue(),
        })
        wait_for_condition(
            page,
            "document.querySelector('#status').dataset.kind === 'good'",
            timeout=300000,
        )
        card = page.locator('.game-card[data-game-id="ddpdoj"]')

        def assert_zip_ready() -> None:
            status = page.locator("#status").inner_text()
            require("Read 10 members from 1 local archive." in status,
                    f"ZIP intake status is not exact: {status!r}")
            require(not card.is_disabled(), "ZIP intake left DaiOuJou locked")
            require(card.locator(".card-state").inner_text() == "Identity validated",
                    "ZIP intake did not validate exact DaiOuJou identities")

        assert_zip_ready()
        return assert_zip_ready

    gate.run("asset-free ZIP intake", zip_intake)

    def seven_zip_intake(page):
        open_page(page, origin, "/")
        page.locator("#files").set_input_files({
            "name": "synthetic.7z",
            "mimeType": "application/x-7z-compressed",
            "buffer": SYNTHETIC_7Z_FIXTURE,
        })
        wait_for_condition(
            page,
            "() => { const status = document.querySelector('#status'); "
            "return status.dataset.kind === 'bad' "
            "&& status.textContent.includes('Read 1 member from 1 local archive.'); }",
            timeout=120000,
        )
        card = page.locator('.game-card[data-game-id="ddpdoj"]')

        def assert_7z_read() -> None:
            status = page.locator("#status").inner_text()
            require("No complete game identity set was found." in status,
                    f"synthetic 7z status is not exact: {status!r}")
            require("Read 1 member from 1 local archive." in status,
                    f"synthetic 7z was not expanded: {status!r}")
            require(card.is_disabled(), "synthetic 7z unlocked DaiOuJou")

        assert_7z_read()
        return assert_7z_read

    gate.run("asset-free 7z intake", seven_zip_intake)

    def archive_rejections(page):
        def zipped(entries, compression=zipfile.ZIP_STORED):
            body = io.BytesIO()
            with zipfile.ZipFile(body, "w", compression=compression) as output:
                for name, data in entries:
                    output.writestr(name, data)
            return body.getvalue()

        open_page(page, origin, "/")
        cases = (
            ("malformed.zip", b"not a zip", "extension does not match"),
            ("traversal.zip", zipped((("../member.rom", b"safe"),)),
             "Unsafe archive path"),
            ("nested.zip", zipped((("nested.zip", zipped((("member.rom", b"safe"),))),)),
             "nested archives are not accepted"),
            ("duplicate.zip", zipped((("a/member.rom", b"one"),
                                       ("b/member.rom", b"two"))),
             "duplicate basename"),
            ("many-entries.zip", zipped(tuple(
                (f"member-{index:03}.rom", b"x") for index in range(300)
            )), "decoder output exceeded"),
            ("ratio.zip", zipped((("large.rom", bytes(1024 * 1024)),),
                                  zipfile.ZIP_DEFLATED),
             "expansion ratio exceeds"),
        )
        card = page.locator('.game-card[data-game-id="ddpdoj"]')
        for name, body, expected in cases:
            page.locator("#files").set_input_files({
                "name": name,
                "mimeType": "application/zip",
                "buffer": body,
            })
            try:
                wait_for_condition(
                    page,
                    "expected => { const status = document.querySelector('#status'); "
                    "return status.dataset.kind === 'bad' "
                    "&& status.textContent.includes(expected); }",
                    arg=expected,
                    timeout=120000,
                )
            except GateFailure as error:
                status = page.locator("#status").inner_text()
                raise GateFailure(
                    f"archive {name} did not report {expected!r}: {status!r}"
                ) from error
            require(card.is_disabled(), f"rejected archive {name} unlocked DaiOuJou")

        def assert_rejected() -> None:
            require(card.is_disabled(), "rejected archive gate left DaiOuJou unlocked")
            require("expansion ratio exceeds" in page.locator("#status").inner_text(),
                    "final bomb-like archive rejection was not retained")

        assert_rejected()
        return assert_rejected

    gate.run("asset-free archive rejection policy", archive_rejections)

    def latest_selection_wins(page):
        page.add_init_script("""
        (() => {
          const workers = [];
          class DelayedArchiveWorker {
            constructor() {
              this.listeners = new Map();
              this.terminated = false;
              workers.push(this);
            }
            addEventListener(name, listener) {
              this.listeners.set(name, listener);
            }
            postMessage(message) {
              if (message.action !== 'list') return;
              setTimeout(() => {
                this.listeners.get('message')?.({
                  data: { ok: false, error: 'stale archive worker failure' },
                });
              }, 750);
            }
            terminate() {
              this.terminated = true;
            }
          }
          Object.defineProperty(globalThis, '__mixupDelayedArchiveWorkers', {
            value: workers,
          });
          Object.defineProperty(globalThis, 'Worker', {
            configurable: true,
            writable: true,
            value: DelayedArchiveWorker,
          });
        })();
        """)
        open_page(page, origin, "/")
        page.locator("#files").set_input_files({
            "name": "pending.zip",
            "mimeType": "application/zip",
            "buffer": b"PK\x03\x04pending",
        })
        wait_for_condition(
            page,
            "globalThis.__mixupDelayedArchiveWorkers.length === 1",
            timeout=30000,
        )
        page.locator("#files").set_input_files({
            "name": "newer.rom",
            "mimeType": "application/octet-stream",
            "buffer": b"newer selection",
        })
        wait_for_condition(
            page,
            "() => { const status = document.querySelector('#status'); "
            "return status.dataset.kind === 'bad' "
            "&& status.textContent.includes('No complete game identity set was found.'); }",
            timeout=30000,
        )
        page.wait_for_timeout(1000)
        card = page.locator('.game-card[data-game-id="ddpdoj"]')

        def assert_latest() -> None:
            status = page.locator("#status").inner_text()
            require("No complete game identity set was found." in status,
                    f"stale archive replaced newer selection status: {status!r}")
            require("stale archive worker failure" not in status,
                    "stale archive error escaped intake generation guard")
            require(card.is_disabled(), "stale archive unlocked DaiOuJou")
            require(page.evaluate("""() =>
              globalThis.__mixupDelayedArchiveWorkers.every((worker) => worker.terminated)
            """), "superseded archive worker was not terminated")

        assert_latest()
        return assert_latest

    gate.run("asset-free latest selection wins", latest_selection_wins)

    def local_ddpdoj(page):
        page.add_init_script("""
        (() => {
          const key = Symbol.for('mixup.releaseGate.putImageDataCount');
          const prototype = CanvasRenderingContext2D.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(
            prototype, 'putImageData'
          );
          Object.defineProperty(prototype, key, {
            value: 0,
            writable: true,
          });
          Object.defineProperty(prototype, 'putImageData', {
            ...descriptor,
            value(...args) {
              prototype[key] += 1;
              return Reflect.apply(descriptor.value, this, args);
            },
          });
        })();
        """)
        open_page(page, origin, "/")
        baseline_globals = page.evaluate("() => Object.getOwnPropertyNames(window)")
        using_7z = DDPDOJ_7Z_FIXTURE.is_file()
        inputs = [str(DDPDOJ_7Z_FIXTURE)] if using_7z \
            else [str(path) for path in ROM_FIXTURES]
        page.locator("#files").set_input_files(inputs)
        wait_for_condition(
            page,
            "document.querySelector('#status').dataset.kind === 'good'",
            timeout=300000,
        )
        if using_7z:
            archive_status = page.locator("#status").inner_text()
            require("Read 10 members from 1 local archive." in archive_status,
                    f"7z intake status is not exact: {archive_status!r}")
        card = page.locator('.game-card[data-game-id="ddpdoj"]')
        require(not card.is_disabled(), "validated DaiOuJou card remains disabled")
        require(card.locator(".card-state").inner_text() == "Identity validated",
                "DaiOuJou card does not report exact identity validation")
        card.click()
        require(page.locator("#primary-world").inner_text()
                == "DoDonPachi DaiOuJou Black Label",
                "DaiOuJou is not the selected primary world")
        page.locator("#launch-game").click()
        wait_for_condition(
            page,
            "expected => document.querySelector('#boot-status').textContent === expected",
            arg=RUNNING_DDPDOJ,
            timeout=300000,
        )

        def assert_no_runtime_globals() -> None:
            exposure = page.evaluate("""baseline => {
              const own = Object.getOwnPropertyNames(window);
              const baselineSet = new Set(baseline);
              const forbiddenNames = [
                '__mixup', 'activeRuntime', 'runtime', 'game', 'gameState',
                'ram', 'RAM', 'debugGame', 'ddpdojRuntime', 'localDdpdojRuntime',
              ];
              return {
                added: own.filter((name) => !baselineSet.has(name)),
                forbidden: forbiddenNames.filter((name) =>
                  Object.prototype.hasOwnProperty.call(window, name)),
              };
            }""", baseline_globals)
            require(exposure["forbidden"] == [],
                    f"asset-free page exposes runtime globals {exposure['forbidden']}")
            require(exposure["added"] == [],
                    f"asset-free launch added window globals {exposure['added']}")

        def assert_running() -> None:
            require(page.locator("#boot-status").inner_text() == RUNNING_DDPDOJ,
                    "asset-free DaiOuJou lost its exact running status")
            require(page.locator("#game-screen").is_visible(), "asset-free game screen is hidden")
            require(page.locator("#primary-world").inner_text()
                    == "DoDonPachi DaiOuJou Black Label",
                    "asset-free DaiOuJou lost primary-world selection")
            dimensions = page.locator("#game-canvas").evaluate(
                "canvas => ({ width: canvas.width, height: canvas.height, "
                "area: canvas.width * canvas.height })"
            )
            require(dimensions == {"width": 224, "height": 448, "area": 448 * 224},
                    f"unexpected TATE canvas dimensions {dimensions}")

        assert_running()
        assert_no_runtime_globals()
        first_canvas = canvas_identity(page, "#game-canvas", 224, 448, timeout=120000)
        page.keyboard.press("5")
        page.wait_for_timeout(1000)
        page.keyboard.down("Enter")
        page.wait_for_timeout(500)
        page.keyboard.up("Enter")
        page.wait_for_timeout(1000)
        second_canvas = wait_for_canvas_change(
            page, first_canvas, "#game-canvas", 224, 448, "asset-free DaiOuJou",
            timeout=30000,
        )
        assert_running()
        assert_no_runtime_globals()
        page.keyboard.down("Enter")
        page.wait_for_timeout(500)
        page.keyboard.up("Enter")
        page.wait_for_timeout(500)
        page.keyboard.down("z")
        page.wait_for_timeout(500)
        page.keyboard.up("z")
        wait_for_canvas_change(
            page, second_canvas, "#game-canvas", 224, 448,
            "asset-free DaiOuJou first selection", timeout=30000,
        )
        page.wait_for_timeout(1000)
        page.keyboard.down("z")
        page.wait_for_timeout(500)
        page.keyboard.up("z")
        canvas_identity(page, "#game-canvas", 224, 448)
        draw_count = page.evaluate(
            "() => CanvasRenderingContext2D.prototype["
            "Symbol.for('mixup.releaseGate.putImageDataCount')]"
        )
        require(isinstance(draw_count, int) and draw_count > 0,
                f"asset-free draw counter is invalid: {draw_count!r}")
        assert_running()
        assert_no_runtime_globals()

        def recheck() -> None:
            assert_running()
            assert_no_runtime_globals()
            canvas_identity(page, "#game-canvas", 224, 448)
            settled_draw_count = page.evaluate(
                "() => CanvasRenderingContext2D.prototype["
                "Symbol.for('mixup.releaseGate.putImageDataCount')]"
            )
            require(settled_draw_count > draw_count,
                    "asset-free renderer stopped during settling")

        return recheck

    gate.run("asset-free local DaiOuJou", local_ddpdoj)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gate an exact built release with installed real Google Chrome."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dist", metavar="PATH", help="gate the asset-backed dist build")
    mode.add_argument("--dist-rom", metavar="PATH", help="gate the asset-free dist-rom build")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    asset_free = args.dist_rom is not None
    expected_root = (ROOT / ("dist-rom" if asset_free else "dist")).resolve()
    supplied_root = Path(args.dist_rom if asset_free else args.dist).resolve()
    require(supplied_root == expected_root,
            f"gate must serve the exact build root {expected_root}, got {supplied_root}")
    require(supplied_root.is_dir(), f"build root does not exist: {supplied_root}")
    require(CHROME.is_file(), f"required Google Chrome is missing: {CHROME}")
    if sync_playwright is None:
        raise GateFailure(
            "Python Playwright is required; install it before publishing"
        ) from PLAYWRIGHT_IMPORT_ERROR

    required = (
        (
            supplied_root / "index.html",
            supplied_root / "src/setup.js",
            supplied_root / "src/archive-worker.js",
            supplied_root / "src/vendor/sevenzip-wasm/sevenzip-wasm.js",
            supplied_root / "src/vendor/sevenzip-wasm/sevenzip-wasm.wasm",
            supplied_root / "src/vendor/sevenzip-wasm/LICENSE",
            supplied_root / "src/ddpdoj-local.js",
            supplied_root / "src/buildid.js",
        ) if asset_free else (
            supplied_root / "index.html",
            supplied_root / "games/index.json",
            supplied_root / "games/ddpdoj/start.html",
            supplied_root / "games/ddpdoj/index.html",
            supplied_root / "games/ddpdoj/assets/manifest.json",
        )
    )
    require_files(required, "release artifacts")
    if asset_free:
        require_files(ROM_FIXTURES, "exact DaiOuJou ROM fixtures")

    handler = partial(NoCacheHandler, directory=str(supplied_root))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, executable_path=str(CHROME))
            try:
                if asset_free:
                    gate_asset_free(browser, origin)
                else:
                    gate_asset_backed(browser, origin)
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    print("PASS asset-free browser release gate" if asset_free
          else "PASS asset-backed browser release gate")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except GateFailure as error:
        print(f"FAIL browser release gate: {error}", file=sys.stderr)
        roots = []
        root = error.__cause__ or error.__context__
        if root is not None:
            roots.append(root)
        roots.extend(error.diagnostics)
        seen: set[int] = set()
        for diagnostic in roots:
            identity = id(diagnostic)
            if identity in seen:
                continue
            seen.add(identity)
            print("Root cause traceback:", file=sys.stderr)
            traceback.print_exception(diagnostic, file=sys.stderr)
        raise SystemExit(1) from None
