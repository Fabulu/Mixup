#!/usr/bin/env python3
"""Real-Chrome release gates for the exact asset-backed and asset-free builds."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
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
DDPDOJ_7Z_FIXTURE = Path("C:/oldpcsx2/mixup/ddpdojblk.7z")
BATMAN_ARCHIVE_FIXTURE = Path(
    "C:/oldpcsx2/mixup/Batman - Return of the Joker (USA, Europe).zip"
)
GRADIUS_ARCHIVE_FIXTURE = Path("C:/oldpcsx2/mixup/Gradius (USA).zip")
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
RUNNING_BATMAN = (
    "Batman is running entirely from the validated local cartridge. Press Enter to start."
)
RUNNING_GRADIUS = (
    "Gradius is running entirely from the validated local cartridge. Press Enter to start."
)
RUNNING_DDPDOJ = (
    "DaiOuJou is running entirely from validated local ROMs. "
    "Insert a coin with 5, then press Enter."
)

CANVAS_IDENTITY = """
({ selector, width, height, minColors = 8 }) => {
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
    valid: nonBlack >= 512 && colors.size >= minColors,
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
        cache_control = production.pop("Cache-Control", None)
        for name, value in production.items():
            self.send_header(name, value)
        if cache_control is not None:
            self.send_header("Cache-Control", cache_control)
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

    def run(self, name: str, body, expected_console_errors: tuple[str, ...] = (),
            expected_downloads: tuple[str, ...] = (),
            context_options: dict | None = None) -> None:
        options = {
            "viewport": {"width": 1280, "height": 900},
            "service_workers": "block",
            "accept_downloads": False,
        }
        options.update(context_options or {})
        context = self.browser.new_context(**options)
        failures: list[str] = []
        active_requests: set = set()
        failed_requests: list[tuple[object, str, str, str, bool]] = []
        closing_context = False
        extra_pages: list = []
        expected = list(expected_console_errors)
        pending_downloads = list(expected_downloads)

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
            directives = {
                directive.strip().lower()
                for directive in cache_control.split(",")
            }
            response_path = unquote(urlsplit(response.url).path)
            required_cache = "no-store" if self.asset_free \
                or response_path in {"/", "/index.html"} else "no-cache"
            if required_cache not in directives \
                    or headers.get("pragma", "").lower() != "no-cache" \
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

        def download_started(download) -> None:
            filename = download.suggested_filename
            if pending_downloads and filename == pending_downloads[0]:
                pending_downloads.pop(0)
            else:
                failures.append(f"download started: {filename}")

        def instrument_page(candidate) -> None:
            candidate.on("pageerror", lambda error: failures.append(f"page error: {error}"))
            candidate.on("download", download_started)
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
            try:
                page.wait_for_load_state("networkidle", timeout=60000)
            except PlaywrightTimeoutError as error:
                raise GateFailure("network did not settle after recheck") from error
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
        if pending_downloads:
            failures.append(f"expected download was not observed: {pending_downloads[0]}")

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
                    timeout: int = 60000, min_colors: int = 8) -> dict:
    arguments = {
        "selector": selector, "width": width, "height": height,
        "minColors": min_colors,
    }
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
        page.add_init_script("""
        (() => {
          Object.defineProperty(globalThis, 'requestAnimationFrame', {
            configurable: true,
            writable: true,
            value: () => 1,
          });
          Object.defineProperty(globalThis, 'cancelAnimationFrame', {
            configurable: true,
            writable: true,
            value: () => {},
          });
        })();
        """)
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
                armedVblanks: app.game.armedVblanks,
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
        require(initial["logicFrame"] == 0,
                f"mod-only page started at logic frame {initial['logicFrame']}")
        require(initial["videoFrame"] == 0,
                f"mod-only page started at video frame {initial['videoFrame']}")
        require(initial["armedVblanks"] == 0,
                f"mod-only cold boot injected replay semaphore {initial['armedVblanks']}")
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

    def runahead_projection(page):
        page.add_init_script("""
        (() => {
          Object.defineProperty(globalThis, 'requestAnimationFrame', {
            configurable: true,
            writable: true,
            value: () => 1,
          });
          Object.defineProperty(globalThis, 'cancelAnimationFrame', {
            configurable: true,
            writable: true,
            value: () => {},
          });
        })();
        """)
        open_page(page, origin, "/games/ddpdoj/start.html")
        for depth in (1, 2, 3):
            option = page.locator(f'[data-id="runahead-{depth}"]')
            require(option.count() == 1 and option.is_visible(),
                    f"runahead {depth} is not uniquely visible in the mod menu")

        page.locator('[data-id="runahead-2"]').click()
        page.locator("#formation-side-by-side").click()
        require(page.locator("#conflict").inner_text()
                == " | Formation cannot be combined with runahead",
                "formation and runahead conflict text is not exact")
        require(page.locator("#launch").is_disabled(),
                "formation and runahead conflict left LAUNCH enabled")

        open_page(page, origin, "/games/ddpdoj/start.html")
        page.locator('[data-id="runahead-2"]').click()
        page.locator("#launch").click()
        page.wait_for_url("**/games/ddpdoj/index.html*", timeout=30000)
        require(urlsplit(page.url).fragment == "mods=runahead-2",
                f"unexpected runahead launch URL {page.url}")
        wait_for_condition(page, "window.__mixup !== undefined", timeout=180000)
        page.evaluate("() => { window.__mixup.demo.running = false; }")

        state = page.evaluate("""() => {
          const demo = window.__mixup.demo;
          const hash = values => {
            let digest = 2166136261;
            for (let index = 0; index < values.length; index++) {
              digest = Math.imul(digest ^ values[index], 16777619);
            }
            return digest >>> 0;
          };
          const canonical = () => ({
            logicFrame: demo.game.logicFrame,
            videoFrame: demo.game.videoFrame,
            ram: hash(demo.game.ram.b),
            bg: hash(demo.game.vram.w),
            tx: hash(demo.game.txvram.w),
            palette: hash(demo.game.palette.words),
          });
          const initial = window.__mixup.stats();
          const cadenceEvents = [];
          const soundTick = demo.soundController.tick.bind(demo.soundController);
          const logicStep = demo.step.bind(demo);
          demo.soundController.tick = () => {
            cadenceEvents.push('sound');
            return soundTick();
          };
          demo.step = options => {
            cadenceEvents.push('logic');
            return logicStep(options);
          };
          demo.game.armedVblanks = 2;
          demo.game.ram.setU8(0x803940, 2);
          demo.cadence.reset();
          const start = 100;
          demo.last = start;
          demo.running = true;
          demo.loop(start + demo.periodMs);
          const afterFirstPeriod = {
            logicFrame: demo.game.logicFrame,
            cadenceEvents: cadenceEvents.slice(),
          };
          demo.loop(start + demo.periodMs * 2);
          demo.running = false;
          demo.soundController.tick = soundTick;
          demo.step = logicStep;
          const view = demo.runaheadView;
          const stepped = window.__mixup.stats();
          const beforeDraw = canonical();
          demo.draw();
          const afterDraw = canonical();
          const playback = demo.playback;
          demo.playback = {};
          const playbackSuspended = demo._projectRunahead(0xffff) === null;
          demo.playback = playback;
          return {
            initial,
            stepped,
            view: view && {
              baseLogicFrame: view.baseLogicFrame,
              logicFrame: view.logicFrame,
              depth: view.depth,
              detachedBg: view.bg !== demo.game.vram.w,
              detachedTx: view.tx !== demo.game.txvram.w,
              detachedPalette: view.palette.words !== demo.game.palette.words,
              detachedPortList: view.portList.words !== demo.portList.words,
            },
            beforeDraw,
            afterDraw,
            playbackSuspended,
            afterFirstPeriod,
            cadenceEvents,
          };
        }""")
        require(state["initial"]["runaheadConfigured"] == 2
                and state["initial"]["runaheadActive"] == 0,
                f"runahead did not start configured and idle: {state['initial']}")
        require(state["stepped"]["logicFrame"] == 1
                and state["stepped"]["runaheadConfigured"] == 2
                and state["stepped"]["runaheadActive"] == 2
                and state["stepped"]["displayLogicFrame"] == 3,
                f"runahead did not keep one canonical frame and project two: {state['stepped']}")
        require(state["afterFirstPeriod"] == {
                    "logicFrame": state["initial"]["logicFrame"],
                    "cadenceEvents": ["sound"],
                },
                f"sound did not run independently during arm-two wait: {state['afterFirstPeriod']}")
        require(state["cadenceEvents"] == ["sound", "logic", "sound"],
                f"coincident logic/sound boundary is out of order: {state['cadenceEvents']}")
        require(state["view"] == {
            "baseLogicFrame": 1,
            "logicFrame": 3,
            "depth": 2,
            "detachedBg": True,
            "detachedTx": True,
            "detachedPalette": True,
            "detachedPortList": True,
        }, f"runahead projection is not a detached two-frame future: {state['view']}")
        require(state["beforeDraw"] == state["afterDraw"],
                "drawing the runahead projection mutated canonical state")
        require(state["playbackSuspended"],
                "runahead projection remained active during replay playback")

        def recheck() -> None:
            current = page.evaluate("""() => ({
              stats: window.__mixup.stats(),
              viewDepth: window.__mixup.demo.runaheadView?.depth ?? 0,
            })""")
            require(current["stats"]["logicFrame"] == 1
                    and current["stats"]["displayLogicFrame"] == 3
                    and current["viewDepth"] == 2,
                    f"runahead state changed while its loop was stopped: {current}")

        return recheck

    gate.run("asset-backed runahead projection", runahead_projection)

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
            page.evaluate("() => { window.__mixup.demo.running = false; }")
            wait_for_condition(
                page,
                "() => [window.__mixup.bundle.bg, window.__mixup.bundle.spr]"
                ".every(queue => { const state = queue.status(); "
                "return state.ready === state.total && state.loading.length === 0; })",
                timeout=180000,
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
            page.evaluate("() => { window.__mixup.demo.running = false; }")
            wait_for_condition(
                page,
                "() => [window.__mixup.bundle.bg, window.__mixup.bundle.spr]"
                ".every(queue => { const state = queue.status(); "
                "return state.ready === state.total && state.loading.length === 0; })",
                timeout=180000,
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

    def block_post_preparation_reads(page) -> None:
        page.evaluate("""() => {
          const key = Symbol.for('mixup.releaseGate.postPreparationReads');
          Object.defineProperty(File.prototype, key, {
            value: 0,
            writable: true,
            configurable: true,
          });
          File.prototype.arrayBuffer = async function() {
            File.prototype[key] += 1;
            throw new Error('START GAME reread a File after local preparation completed');
          };
        }""")

    def require_no_post_preparation_reads(page, title: str) -> None:
        reads = page.evaluate("""() => File.prototype[
          Symbol.for('mixup.releaseGate.postPreparationReads')
        ]""")
        require(reads == 0,
                f"{title} reread validated files after preparation: {reads!r}")

    def shell_layout(page):
        open_page(page, origin, "/")
        guide = page.locator("#upload-guide")
        require(guide.count() == 1 and guide.is_visible(),
                "Mixup ROM upload checklist is not uniquely visible")
        guide_text = guide.inner_text()
        for required in (
            "Add one game or all three",
            "Batman - Return of the Joker (USA, Europe).zip",
            "Gradius (USA).zip",
            "ddpdojblk.zip",
            "ddpdojblk.7z",
        ):
            require(required in guide_text,
                    f"Mixup quick upload guide omits {required!r}")
        extracted = page.locator("#upload-guide .extracted-roms")
        require(extracted.count() == 1,
                "Mixup has no single extracted-file disclosure")
        require(extracted.get_attribute("open") is None,
                "Mixup opens advanced extracted-file details by default")
        require("Using extracted DaiOuJou files instead?" in extracted.inner_text(),
                "Mixup extracted-file disclosure has no clear label")
        extracted_text = extracted.text_content() or ""
        for required in DDPDOJ_ROM_NAMES:
            require(required in extracted_text,
                    f"Mixup extracted-file details omit {required!r}")
        guide_box = guide.bounding_box()
        intake_box = page.locator(".intake-grid").bounding_box()
        require(guide_box is not None and intake_box is not None
                and guide_box["y"] < intake_box["y"],
                "Mixup upload checklist is not before the upload controls")

        support = page.locator("#support-link")
        require(support.count() == 1 and support.is_visible(),
                "Mixup support link is not uniquely visible")
        require("support on ko-fi" in support.inner_text().lower(),
                "Mixup support link has no visible accessible label")
        require(support.get_attribute("href") == "https://ko-fi.com/readzen",
                "Mixup support link does not use the canonical Ko-fi destination")
        require(support.get_attribute("target") is None,
                "Mixup support link must remain a same-tab link")
        require(support.get_attribute("onclick") is None,
                "Mixup support link must not use an inline handler")
        require(page.locator("iframe").count() == 0,
                "Mixup support link introduced an iframe")

        def assert_width(width: int) -> None:
            page.set_viewport_size({"width": width, "height": 900})
            page.wait_for_timeout(100)
            layout = page.evaluate("""
                () => {
                  const selectors = [
                    '.hero', '#support-link', '#upload-guide', '.upload-game',
                    '.intake-grid', '.picker', '.drop-zone',
                    '.game-cards', '.game-card', '.launch-row', '#launch-game'
                  ];
                  const bounds = selectors.flatMap(selector =>
                    Array.from(document.querySelectorAll(selector)).map(element => {
                      const rect = element.getBoundingClientRect();
                      return { selector, left: rect.left, right: rect.right, width: rect.width };
                    }));
                  const columns = selector => getComputedStyle(
                    document.querySelector(selector)).gridTemplateColumns.split(' ').length;
                  const supportRect = document.querySelector('#support-link').getBoundingClientRect();
                  return {
                    clientWidth: document.documentElement.clientWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    bounds,
                    intakeColumns: columns('.intake-grid'),
                    uploadColumns: columns('.upload-guide-grid'),
                    cardColumns: columns('.game-cards'),
                    supportWidth: supportRect.width,
                    supportHeight: supportRect.height,
                    supportText: document.querySelector('#support-link').innerText,
                  };
                }
            """)
            require(layout["scrollWidth"] <= layout["clientWidth"] + 1,
                    f"Mixup shell overflows horizontally at {width}px: {layout!r}")
            for bounds in layout["bounds"]:
                require(bounds["width"] > 0 and bounds["left"] >= -1
                        and bounds["right"] <= layout["clientWidth"] + 1,
                        f"{bounds['selector']} escapes the {width}px viewport: {bounds!r}")
            expected_columns = 2 if width == 1280 else 1
            expected_uploads = 3 if width == 1280 else 1
            expected_cards = 3 if width == 1280 else 1
            require(layout["intakeColumns"] == expected_columns,
                    f"intake grid has {layout['intakeColumns']} columns at {width}px")
            require(layout["uploadColumns"] == expected_uploads,
                    f"quick upload guide has {layout['uploadColumns']} columns at {width}px")
            require(layout["cardColumns"] == expected_cards,
                    f"game grid has {layout['cardColumns']} columns at {width}px")
            require(layout["supportHeight"] >= 44 and layout["supportWidth"] >= 140,
                    f"support link target is too small at {width}px: {layout!r}")
            require("support on ko-fi" in layout["supportText"].lower(),
                    f"support text is hidden at {width}px")

        for width in (1280, 700, 360):
            assert_width(width)

        def recheck() -> None:
            for width in (1280, 700, 360):
                assert_width(width)

        return recheck

    gate.run("asset-free arcade shell and support link", shell_layout)

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
        }, timeout=300000)
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

    def folder_discovery(page):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as output:
            for fixture in ROM_FIXTURES:
                output.writestr(fixture.name, fixture.read_bytes())
        open_page(page, origin, "/")
        folder_input = page.locator("#folder-files")
        folder_input.evaluate("input => input.removeAttribute('webkitdirectory')")
        folder_input.set_input_files((
            {
                "name": "ddpdojblk.zip",
                "mimeType": "application/zip",
                "buffer": archive.getvalue(),
            },
            {
                "name": "SLPM-65378 (AEDB8BB2).00.p2s",
                "mimeType": "application/octet-stream",
                "buffer": b"PK\x03\x04unrelated save",
            },
            {
                "name": "broken.zip",
                "mimeType": "application/zip",
                "buffer": b"PK\x03\x04broken archive",
            },
        ), timeout=300000)
        wait_for_condition(
            page,
            "document.querySelector('#status').dataset.kind === 'good'",
            timeout=300000,
        )
        card = page.locator('.game-card[data-game-id="ddpdoj"]')
        folder_status = page.locator("#status").inner_text()
        page.locator(".verification-details").evaluate("details => { details.open = true; }")
        page.locator("#game").select_option("ddpdoj")

        def assert_folder_ready() -> None:
            status = folder_status
            require("Could not inspect the selection" not in status,
                    f"unrelated folder file aborted discovery: {status!r}")
            require("Read 10 members from 1 local archive." in status,
                    f"folder archive status is not exact: {status!r}")
            require("Skipped 1 invalid archive candidate." in status,
                    f"malformed folder archive was not skipped: {status!r}")
            require("Searched 3 folder files and ignored 1 non-candidate without opening them."
                    in status, f"folder candidate search status is not exact: {status!r}")
            require(not card.is_disabled(),
                    "folder with unrelated archive-like save left DaiOuJou locked")
            requirements = page.locator("#identities .identity-requirements").inner_text()
            require("all ten exact MAME members" in requirements,
                    f"required-set summary is unclear: {requirements!r}")
            require("replaces ddb10_10_8_434f.u45 and ddp3_bios.u37" in requirements,
                    f"decrypted replacement summary is unclear: {requirements!r}")
            headings = page.locator("#identities h4").all_inner_texts()
            require(headings == ["Required complete ROM set", "Accepted replacement input"],
                    f"required-set headings are not exact: {headings!r}")
            tables = page.locator("#identities tbody")
            require(tables.count() == 2 and tables.nth(0).locator("tr").count() == 10
                    and tables.nth(1).locator("tr").count() == 1,
                    "required and replacement ROM rows are not separated 10 plus 1")

        assert_folder_ready()
        return assert_folder_ready

    gate.run("asset-free folder ROM discovery", folder_discovery)

    def complete_archive_folder(page):
        fixture_routes = (
            ("/__mixup-folder-batman", BATMAN_ARCHIVE_FIXTURE,
             "Batman - Return of the Joker (USA, Europe).zip"),
            ("/__mixup-folder-ddpdoj", DDPDOJ_7Z_FIXTURE, "ddpdojblk.7z"),
            ("/__mixup-folder-gradius", GRADIUS_ARCHIVE_FIXTURE,
             "Gradius (USA).zip"),
        )
        def fixture_handler(path):
            def fulfill(route):
                route.fulfill(
                    status=200,
                    path=str(path),
                    content_type="application/octet-stream",
                    headers={
                        "Cache-Control": "no-store",
                        "Pragma": "no-cache",
                        "Expires": "0",
                    },
                )
            return fulfill

        for request_path, fixture, _name in fixture_routes:
            page.route(f"**{request_path}", fixture_handler(fixture))
        page.add_init_script("""
        globalThis.__mixupDirectoryHandle = null;
        Object.defineProperty(globalThis, 'showDirectoryPicker', {
          value: async () => globalThis.__mixupDirectoryHandle,
          configurable: true,
        });
        """)
        open_page(page, origin, "/")
        page.locator(".folder-options").evaluate("details => { details.open = true; }")
        require(not page.locator("#choose-folder").is_hidden(),
                "supported directory picker was hidden")
        handle_details = page.evaluate("""
        async fixtures => {
          const root = await navigator.storage.getDirectory();
          const directory = await root.getDirectoryHandle('mixup-gate', { create: true });
          for (const fixture of fixtures) {
            const response = await fetch(fixture.url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`fixture request failed: ${response.status}`);
            const file = await directory.getFileHandle(fixture.name, { create: true });
            const writable = await file.createWritable();
            await writable.write(await response.arrayBuffer());
            await writable.close();
          }
          globalThis.__mixupDirectoryHandle = directory;
          return {
            kind: directory.kind,
            permission: typeof directory.queryPermission === 'function'
              ? await directory.queryPermission({ mode: 'read' })
              : 'unsupported',
          };
        }
        """, [
            {"url": request_path, "name": name}
            for request_path, _fixture, name in fixture_routes
        ])
        require(handle_details == {"kind": "directory", "permission": "granted"},
                f"native test directory is not reusable: {handle_details!r}")
        page.locator("#choose-folder").click()
        wait_for_condition(
            page,
            "document.querySelector('#status').dataset.kind === 'good'",
            timeout=300000,
        )
        cards = {
            game_id: page.locator(f'.game-card[data-game-id="{game_id}"]')
            for game_id in ("batman", "gradius", "ddpdoj")
        }

        def assert_complete_folder() -> None:
            status = page.locator("#status").inner_text()
            require("Read 14 members from 3 local archives." in status,
                    f"complete folder archive count is not exact: {status!r}")
            require("Ignored 2 non-ROM archive members before hashing." in status,
                    f"complete folder extras were not ignored exactly: {status!r}")
            require("Searched 3 folder files and ignored 0 non-candidates without opening them."
                    in status, f"complete folder search count is not exact: {status!r}")
            require("Skipped " not in status,
                    f"complete folder skipped an exact archive: {status!r}")
            for game_id, card in cards.items():
                require(not card.is_disabled(),
                        f"complete folder left {game_id} locked")
                require(card.locator(".card-state").inner_text() == "Identity validated",
                        f"complete folder did not validate {game_id}")

        assert_complete_folder()
        open_page(page, origin, "/")
        wait_for_condition(
            page,
            "!document.querySelector('#reuse-folder').hidden",
            timeout=60000,
        )
        page.locator(".folder-options").evaluate("details => { details.open = true; }")
        require(page.locator("#reuse-folder").inner_text() == "Reuse saved folder",
                "remembered native directory did not retain granted permission")
        page.locator("#reuse-folder").click()
        wait_for_condition(
            page,
            "document.querySelector('#status').dataset.kind === 'good'",
            timeout=300000,
        )
        assert_complete_folder()
        return assert_complete_folder

    gate.run("asset-free remembered archive folder", complete_archive_folder)

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

    def latest_preparation_wins(page):
        held_routes = []

        def hold_gradius_module(route) -> None:
            held_routes.append(route)

        page.route("**/src/gradius-local.js", hold_gradius_module)
        open_page(page, origin, "/")
        page.locator("#files").set_input_files(str(GRADIUS_ARCHIVE_FIXTURE))
        deadline = time.monotonic() + 120
        while not held_routes and time.monotonic() < deadline:
            page.wait_for_timeout(25)
        require(len(held_routes) == 1,
                "Gradius preparation did not request its delayed runtime module")
        card = page.locator('.game-card[data-game-id="gradius"]')
        require(card.is_disabled(),
                "Gradius unlocked before delayed preparation completed")

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
        held_routes[0].continue_()
        page.unroute("**/src/gradius-local.js", hold_gradius_module)
        page.wait_for_timeout(1000)

        def assert_latest_preparation() -> None:
            status = page.locator("#status").inner_text()
            require("No complete game identity set was found." in status,
                    f"stale preparation replaced newer selection status: {status!r}")
            require(card.is_disabled(),
                    "stale Gradius preparation unlocked the newer selection")
            require(card.locator(".card-state").inner_text() == "ROM required",
                    "stale Gradius preparation retained a ready card state")

        assert_latest_preparation()
        return assert_latest_preparation

    gate.run("asset-free latest preparation wins", latest_preparation_wins)

    def local_cartridge(game_id: str, fixture: Path, title: str,
                        running_status: str, width: int, height: int):
        def run(page):
            open_page(page, origin, "/")
            page.locator("#files").set_input_files(str(fixture))
            wait_for_condition(
                page,
                "document.querySelector('#status').dataset.kind === 'good'",
                timeout=120000,
            )
            block_post_preparation_reads(page)
            card = page.locator(f'.game-card[data-game-id="{game_id}"]')
            require(not card.is_disabled(), f"validated {title} card remains disabled")
            card.click()
            page.locator("#launch-game").click()
            wait_for_condition(
                page,
                "() => { const shell = document.querySelector('#local-shell'); "
                "return shell && !shell.hidden; }",
                timeout=120000,
            )
            shell = page.locator("#local-shell")
            require(shell.get_attribute("role") == "dialog"
                    and shell.get_attribute("aria-modal") == "true",
                    f"{title} launcher is not an accessible modal")
            require(page.locator("main").evaluate("node => node.inert"),
                    f"{title} launcher did not make setup controls inert")
            require(page.evaluate("document.activeElement?.id") == "local-picker-games",
                    f"{title} launcher did not move focus into the modal")
            require(page.locator(".local-customizer").get_attribute("open") is None,
                    f"{title} launcher opens advanced options by default")

            page.locator("#local-start").click()
            wait_for_condition(
                page,
                "expected => document.querySelector('#boot-status').textContent === expected",
                arg=running_status,
                timeout=120000,
            )
            canvas_identity(
                page, "#game-canvas", width, height, timeout=120000,
                min_colors=4 if game_id == "batman" else 8,
            )
            require(page.evaluate("document.activeElement?.id") == "game-canvas",
                    f"{title} game screen did not receive focus")
            require_no_post_preparation_reads(page, title)

            sound = None
            if game_id == "gradius":
                sound = page.locator("#local-sound")
                require(sound.is_visible() and sound.inner_text() == "SOUND ON",
                        "Gradius sound did not arm from the START gesture")
                sound.click()
                require(sound.inner_text() == "SOUND OFF",
                        "Gradius sound control did not turn sound off")

            page.locator("#local-game-mods").click()
            require(page.locator("#local-picker").is_visible()
                    and page.evaluate("document.activeElement?.id") == "local-picker-games",
                    f"{title} MODS did not return focus to the picker")
            page.locator("#local-start").click()
            wait_for_condition(
                page,
                "expected => document.querySelector('#boot-status').textContent === expected",
                arg=running_status,
                timeout=120000,
            )
            if sound is not None:
                require(sound.inner_text() == "SOUND OFF",
                        "Gradius sound preference was lost on restart")
            page.wait_for_timeout(750)
            canvas_identity(
                page, "#game-canvas", width, height, timeout=120000,
                min_colors=4 if game_id == "batman" else 8,
            )
            require_no_post_preparation_reads(page, title)

            page.keyboard.press("Escape")
            require(shell.is_hidden(), f"Escape did not close the {title} launcher")
            require(not page.locator("main").evaluate("node => node.inert"),
                    f"{title} launcher did not restore setup controls")
            require(page.evaluate("document.activeElement?.id") == "launch-game",
                    f"{title} launcher did not restore focus to its opener")
            if game_id == "gradius":
                input_state = page.evaluate("""async () => {
                  const input = await import('/games/gradius/src/input.js');
                  window.dispatchEvent(new KeyboardEvent('keydown', {
                    code: 'ArrowRight', bubbles: true,
                  }));
                  return { buttons: input.currentButtons(), stats: input.inputQueueStats() };
                }""")
                require(input_state["buttons"] == 0
                        and input_state["stats"]["depth"] == 0,
                        f"Gradius keyboard input remained attached after close: {input_state!r}")

            def recheck() -> None:
                require(shell.is_hidden(), f"{title} launcher reopened while settling")
                require(not page.locator("main").evaluate("node => node.inert"),
                        f"{title} setup controls became inert while settling")
                require_no_post_preparation_reads(page, title)

            return recheck
        return run

    gate.run("asset-free local Batman", local_cartridge(
        "batman", BATMAN_ARCHIVE_FIXTURE, "Batman",
        RUNNING_BATMAN, 800, 720,
    ))
    gate.run("asset-free local Gradius", local_cartridge(
        "gradius", GRADIUS_ARCHIVE_FIXTURE, "Gradius",
        RUNNING_GRADIUS, 256, 240,
    ))

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

          const orientation = screen.orientation;
          const calls = [];
          Object.defineProperty(orientation, Symbol.for('mixup.releaseGate.orientationCalls'), {
            value: calls,
          });
          Object.defineProperty(orientation, 'lock', {
            configurable: true,
            value: async (value) => { calls.push(['lock', value]); },
          });
          Object.defineProperty(orientation, 'unlock', {
            configurable: true,
            value: () => { calls.push(['unlock']); },
          });
        })();
        """)
        open_page(page, origin, "/")
        page.evaluate("""() => {
          localStorage.removeItem('ddpdoj.controls');
          localStorage.removeItem('ddpdoj.mode');
          localStorage.removeItem('ddpdoj.orientationLock');
        }""")
        baseline_globals = page.evaluate("() => Object.getOwnPropertyNames(window)")
        page.locator("#files").set_input_files(str(DDPDOJ_7Z_FIXTURE))
        wait_for_condition(
            page,
            "document.querySelector('#status').dataset.kind === 'good'",
            timeout=300000,
        )
        archive_status = page.locator("#status").inner_text()
        require("Read 10 members from 1 local archive." in archive_status,
                f"7z intake status is not exact: {archive_status!r}")
        block_post_preparation_reads(page)
        card = page.locator('.game-card[data-game-id="ddpdoj"]')
        require(not card.is_disabled(), "validated DaiOuJou card remains disabled")
        require(card.locator(".card-state").inner_text() == "Identity validated",
                "DaiOuJou card does not report exact identity validation")
        page.evaluate("""() => {
          Object.defineProperty(document, '__mixupReleaseGateMarker', {
            value: {}, configurable: true,
          });
        }""")
        original_url = page.url
        card.click()
        require(page.locator("#primary-world").inner_text()
                == "DoDonPachi DaiOuJou Black Label",
                "DaiOuJou is not the selected primary world")
        page.locator("#launch-game").click()
        wait_for_condition(
            page,
            "() => { const shell = document.querySelector('#local-shell'); "
            "const picker = document.querySelector('#local-picker'); "
            "return shell && !shell.hidden && picker && !picker.hidden; }",
            timeout=300000,
        )
        require(page.url == original_url,
                "Mixup navigated away while opening local game options")
        require(page.evaluate(
            "() => Object.hasOwn(document, '__mixupReleaseGateMarker')"),
            "Mixup replaced the document while opening game options")
        require(page.locator("#local-shell").count() == 1
                and page.locator("#local-shell").is_visible(),
                "Mixup local shell is not uniquely visible")
        require(page.locator("#local-shell").get_attribute("role") == "dialog"
                and page.locator("#local-shell").get_attribute("aria-modal") == "true"
                and page.locator("main").evaluate("node => node.inert")
                and page.evaluate("document.activeElement?.id") == "local-picker-games",
                "Mixup local shell did not establish modal focus")
        require(page.locator("#local-picker").is_visible()
                and page.locator("#game-screen").is_hidden(),
                "Mixup did not stop at the game options screen")
        require(page.locator("#local-picker-title").text_content()
                == "DoDonPachi DaiOuJou Black Label",
                "Mixup options screen has the wrong game title")
        require(page.locator("#local-picker-content select").count() >= 2,
                "Mixup options screen has no simple quick choices")
        require(page.locator(".local-customizer").count() == 1
                and page.locator(".local-customizer").get_attribute("open") is None,
                "Mixup opens detailed mod customization by default")
        require(not page.locator("#local-start").is_disabled(),
                "Mixup local start button is disabled")
        ships = page.locator("#local-picker-content .local-fields select").nth(1)
        ships.select_option("all-three-pilots-each-piloting-a-ship")
        require("three-ship formation" in page.locator(
            "#local-loadout-summary").inner_text().lower(),
                "Mixup did not retain the three-ship quick choice")
        page.locator(".local-customizer summary").click()
        runahead = page.locator('[data-mod-id="runahead-2"]')
        require(runahead.count() == 1 and runahead.is_visible(),
                "Mixup has no unique two-frame runahead choice")
        runahead.click()
        conflict_summary = page.locator("#local-loadout-summary").inner_text()
        require("Formation cannot be combined with runahead." in conflict_summary,
                f"Mixup formation/runahead refusal is unclear: {conflict_summary!r}")
        require(page.locator("#local-start").is_disabled(),
                "Mixup formation/runahead conflict left START GAME enabled")
        page.locator('[data-mod-id="runahead-2"]').click()
        require(not page.locator("#local-start").is_disabled(),
                "Mixup START GAME stayed disabled after clearing runahead")

        def assert_picker_width(width: int) -> None:
            page.set_viewport_size({"width": width, "height": 900})
            page.wait_for_timeout(100)
            layout = page.evaluate("""() => {
              const shell = document.querySelector('#local-shell');
              const launch = document.querySelector('.local-launch-bar');
              const controls = [...launch.querySelectorAll('button')].map(button => {
                const rect = button.getBoundingClientRect();
                return { left: rect.left, right: rect.right,
                         top: rect.top, bottom: rect.bottom,
                         width: rect.width, height: rect.height };
              });
              const rect = shell.getBoundingClientRect();
              const launchRect = launch.getBoundingClientRect();
              return {
                clientWidth: shell.clientWidth,
                scrollWidth: shell.scrollWidth,
                shell: { left: rect.left, right: rect.right,
                         top: rect.top, bottom: rect.bottom },
                launch: { left: launchRect.left, right: launchRect.right,
                          top: launchRect.top, bottom: launchRect.bottom,
                          width: launchRect.width, height: launchRect.height },
                controls,
              };
            }""")
            require(layout["scrollWidth"] <= layout["clientWidth"] + 1,
                    f"Mixup options overflow at {width}px: {layout!r}")
            require(abs(layout["shell"]["left"]) <= 1
                    and abs(layout["shell"]["right"] - width) <= 1
                    and abs(layout["shell"]["top"]) <= 1
                    and abs(layout["shell"]["bottom"] - 900) <= 1,
                    f"Mixup options do not cover {width}px viewport: {layout!r}")
            for bounds in [layout["launch"], *layout["controls"]]:
                require(bounds["width"] > 0 and bounds["height"] > 0
                        and bounds["left"] >= -1 and bounds["right"] <= width + 1
                        and bounds["top"] >= -1 and bounds["bottom"] <= 901,
                        f"Mixup option control escapes {width}px viewport: {bounds!r}")

        for width in (1280, 700, 360):
            assert_picker_width(width)
        page.set_viewport_size({"width": 1280, "height": 900})
        page.locator("#local-start").click()
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
            boot_status = page.locator("#boot-status").inner_text()
            game_status = page.locator("#local-game-status").inner_text()
            require(boot_status == RUNNING_DDPDOJ,
                    f"asset-free DaiOuJou lost its runtime status: {boot_status!r}")
            require(game_status == boot_status,
                    "asset-free game view and setup status disagree")
            require(page.url == original_url
                    and page.evaluate(
                        "() => Object.hasOwn(document, '__mixupReleaseGateMarker')"),
                    "asset-free game launch replaced its document")
            require(page.locator("#local-shell").is_visible()
                    and page.locator("#game-screen").is_visible()
                    and page.locator("#local-picker").is_hidden(),
                    "asset-free game did not own the full-page shell")
            require(page.locator("#local-stage").is_visible()
                    and page.locator("#local-viewport").is_visible(),
                    "asset-free game stage is hidden")
            require(page.locator("body").get_attribute("data-local-view") == "true",
                    "asset-free game did not lock the setup document")
            require(page.locator("#primary-world").inner_text()
                    == "DoDonPachi DaiOuJou Black Label",
                    "asset-free DaiOuJou lost primary-world selection")
            dimensions = page.locator("#game-canvas").evaluate(
                "canvas => ({ width: canvas.width, height: canvas.height, "
                "area: canvas.width * canvas.height })"
            )
            require(dimensions == {"width": 224, "height": 448, "area": 448 * 224},
                    f"unexpected TATE canvas dimensions {dimensions}")
            require_no_post_preparation_reads(page, "DaiOuJou")

        def assert_stage_size(width: int, height: int) -> None:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(150)
            layout = page.evaluate("""() => {
              const screen = document.querySelector('#game-screen').getBoundingClientRect();
              const stage = document.querySelector('#local-stage').getBoundingClientRect();
              const viewport = document.querySelector('#local-viewport').getBoundingClientRect();
              const canvas = document.querySelector('#game-canvas').getBoundingClientRect();
              const padElement = document.querySelector('#local-pad');
              const pad = padElement.getBoundingClientRect();
              const padVisible = getComputedStyle(padElement).display !== 'none';
              const canvasPadOverlap = padVisible
                && canvas.left < pad.right && canvas.right > pad.left
                && canvas.top < pad.bottom && canvas.bottom > pad.top;
              const actions = [...document.querySelectorAll('.local-game-actions button')]
                .filter(button => getComputedStyle(button).display !== 'none' && !button.hidden)
                .map(button => {
                  const rect = button.getBoundingClientRect();
                  return { left: rect.left, right: rect.right,
                           top: rect.top, bottom: rect.bottom,
                           width: rect.width, height: rect.height };
                });
              return {
                docWidth: document.documentElement.clientWidth,
                docScroll: document.documentElement.scrollWidth,
                screen: { left: screen.left, right: screen.right,
                          top: screen.top, bottom: screen.bottom },
                stage: { width: stage.width, height: stage.height },
                viewport: { left: viewport.left, right: viewport.right,
                            top: viewport.top, bottom: viewport.bottom,
                            width: viewport.width, height: viewport.height },
                canvas: { left: canvas.left, right: canvas.right,
                          top: canvas.top, bottom: canvas.bottom,
                          width: canvas.width, height: canvas.height },
                pad: { left: pad.left, right: pad.right,
                       top: pad.top, bottom: pad.bottom,
                       width: pad.width, height: pad.height,
                       visible: padVisible, overlapsCanvas: canvasPadOverlap },
                actions,
              };
            }""")
            require(layout["docScroll"] <= layout["docWidth"] + 1,
                    f"Mixup game view overflows at {width}px: {layout!r}")
            require(abs(layout["screen"]["left"]) <= 1
                    and abs(layout["screen"]["right"] - width) <= 1
                    and abs(layout["screen"]["top"]) <= 1
                    and abs(layout["screen"]["bottom"] - height) <= 1,
                    f"Mixup game view does not cover {width}x{height} viewport: {layout!r}")
            require(layout["stage"]["width"] > 0 and layout["stage"]["height"] > 0
                    and layout["viewport"]["width"] > 0
                    and layout["viewport"]["height"] > 0,
                    f"Mixup game stage collapsed at {width}px: {layout!r}")
            canvas = layout["canvas"]
            viewport = layout["viewport"]
            require(canvas["width"] > 0 and canvas["height"] > 0
                    and canvas["left"] >= viewport["left"] - 1
                    and canvas["right"] <= viewport["right"] + 1
                    and canvas["top"] >= viewport["top"] - 1
                    and canvas["bottom"] <= viewport["bottom"] + 1,
                    f"Mixup canvas escapes the stage at {width}px: {layout!r}")
            pad = layout["pad"]
            require(pad["visible"] and pad["width"] > 0 and pad["height"] > 0
                    and not pad["overlapsCanvas"],
                    f"Mixup touch controls cover the canvas at {width}px: {layout!r}")
            for bounds in layout["actions"]:
                require(bounds["width"] > 0 and bounds["height"] > 0
                        and bounds["left"] >= -1 and bounds["right"] <= width + 1
                        and bounds["top"] >= -1 and bounds["bottom"] <= height + 1,
                        f"Mixup game action escapes {width}x{height} viewport: {bounds!r}")

        assert_running()
        assert_no_runtime_globals()
        canvas_identity(page, "#game-canvas", 224, 448, timeout=120000)
        record = page.locator("#local-record")
        require(record.is_visible() and not record.is_disabled(),
                "Mixup formation launch did not expose REC")
        record.click()
        wait_for_condition(
            page,
            "document.querySelector('#local-replay-status').dataset.kind === 'error'",
            timeout=30000,
        )
        formation_replay_status = page.locator("#local-replay-status").inner_text()
        require("REC is unavailable while formation mode is active"
                in formation_replay_status,
                f"Mixup formation REC refusal is unclear: {formation_replay_status!r}")
        require(record.get_attribute("aria-pressed") == "false",
                "Mixup formation REC armed despite the replay refusal")
        for width, height in ((1280, 900), (700, 900), (360, 900), (900, 360)):
            assert_stage_size(width, height)
        page.set_viewport_size({"width": 1280, "height": 900})
        page.wait_for_timeout(150)

        controls = page.locator("#local-controls")
        stick = page.locator("#local-stick-zone")
        dpad = page.locator("#local-dpad")
        require(controls.inner_text() == "AUTO"
                and controls.get_attribute("aria-pressed") == "false",
                "Mixup DaiOuJou touch scheme did not start in AUTO")
        require(stick.bounding_box() is not None and dpad.is_hidden(),
                "Mixup DaiOuJou AUTO did not choose the floating stick on touch")
        stick.evaluate("""element => {
          element.setPointerCapture = () => {};
          const bounds = element.getBoundingClientRect();
          const x = bounds.left + bounds.width / 2;
          const y = bounds.top + bounds.height / 2;
          element.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 40, pointerType: 'touch',
            clientX: x, clientY: y,
          }));
          element.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true, cancelable: true, pointerId: 40, pointerType: 'touch',
            clientX: x - 60, clientY: y - 60,
          }));
        }""")
        stick_state = page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          return {
            mask: input.currentMask(),
            expected: (1 << input.CONTROLS.UP) | (1 << input.CONTROLS.LEFT),
            originVisible: document.querySelector('#local-stick-origin')
              .getAttribute('aria-hidden') === 'false',
            knobVisible: document.querySelector('#local-stick-knob')
              .getAttribute('aria-hidden') === 'false',
          };
        }""")
        require(stick_state["mask"] == stick_state["expected"]
                and stick_state["originVisible"] and stick_state["knobVisible"],
                f"Mixup floating stick did not reach DaiOuJou input: {stick_state!r}")
        stick.evaluate("""element => element.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 40, pointerType: 'touch',
        }))""")
        require(page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          return input.currentMask() === 0
            && document.querySelector('#local-stick-origin').getAttribute('aria-hidden') === 'true'
            && document.querySelector('#local-stick-knob').getAttribute('aria-hidden') === 'true';
        }"""), "Mixup floating stick stayed held or visible after release")

        controls.click()
        require(controls.inner_text() == "FIXED"
                and controls.get_attribute("aria-pressed") == "true"
                and page.evaluate("localStorage.getItem('ddpdoj.controls')") == "fixed",
                "Mixup DaiOuJou did not persist the FIXED touch scheme")
        require(dpad.bounding_box() is not None and stick.is_hidden(),
                "Mixup DaiOuJou did not switch from floating to fixed touch")
        require(page.locator("#local-formation-pad-note").is_visible()
                and page.locator("#local-pad-owner").is_hidden(),
                "Mixup formation exposed P2 touch ownership")
        owner_state = page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          return input.currentTouchOwner();
        }""")
        require(owner_state == "P1",
                f"Mixup formation touch owner is not P1: {owner_state!r}")

        dpad = page.locator("#local-dpad")
        require(dpad.bounding_box() is not None,
                "Mixup DaiOuJou d-pad has no pointer target")
        dpad.evaluate("""element => {
          element.setPointerCapture = () => {};
          const bounds = element.getBoundingClientRect();
          element.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 41, pointerType: 'touch',
            clientX: bounds.left + 3, clientY: bounds.top + 3,
          }));
        }""")
        touch_state = page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          return {
            mask: input.currentMask(),
            expected: (1 << input.CONTROLS.UP) | (1 << input.CONTROLS.LEFT),
          };
        }""")
        require(touch_state["mask"] == touch_state["expected"],
                f"Mixup d-pad did not reach DaiOuJou touch input: {touch_state!r}")
        dpad.evaluate("""element => element.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 41, pointerType: 'touch',
        }))""")
        require(page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          return input.currentMask() === 0;
        }"""), "Mixup DaiOuJou d-pad stayed held after pointer release")

        shot = page.locator("#local-pad-buttons .local-pad-button", has_text="SHOT")
        require(shot.bounding_box() is not None,
                "Mixup DaiOuJou SHOT has no pointer target")
        shot.evaluate("""element => {
          element.setPointerCapture = () => {};
          element.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 42, pointerType: 'touch',
          }));
        }""")
        shot_state = page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          return { mask: input.currentMask(), expected: 1 << input.CONTROLS.SHOT };
        }""")
        require(shot_state["mask"] == shot_state["expected"],
                f"Mixup SHOT did not reach DaiOuJou touch input: {shot_state!r}")
        shot.evaluate("""element => element.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 42, pointerType: 'touch',
        }))""")
        require(page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          return input.currentMask() === 0;
        }"""), "Mixup DaiOuJou SHOT stayed held after pointer release")

        coin = page.locator("#local-pad-buttons .local-pad-button", has_text="COIN")
        require(coin.bounding_box() is not None,
                "Mixup DaiOuJou COIN has no pointer target")
        coin.evaluate("""element => {
          element.setPointerCapture = () => {};
          element.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 43, pointerType: 'touch',
          }));
        }""")
        coin_word = page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          return input.currentCoinWord();
        }""")
        require((coin_word & 1) == 0,
                f"Mixup COIN did not reach DaiOuJou coin port: {coin_word:#06x}")
        coin.evaluate("""element => element.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 43, pointerType: 'touch',
        }))""")
        page.evaluate("""async () => {
          const input = await import('/games/ddpdoj/src/web/input.js');
          input.clearTouch();
          input.clearCoin();
        }""")

        lock = page.locator("#local-lock")
        require(lock.is_visible() and lock.inner_text() == "LOCK"
                and lock.get_attribute("aria-pressed") == "false",
                "Mixup orientation lock is unavailable or starts dishonest")

        page.locator("#local-picture").click()
        require(page.evaluate("localStorage.getItem('ddpdoj.mode')") == "yoko",
                "Mixup did not persist WIDE picture mode")
        lock.click()
        wait_for_condition(
            page,
            "document.fullscreenElement?.id === 'local-stage'",
            timeout=30000,
        )
        wait_for_condition(
            page,
            """() => screen.orientation[Symbol.for(
              'mixup.releaseGate.orientationCalls')].some(
                call => call[0] === 'lock' && call[1] === 'landscape')""",
            timeout=30000,
        )
        require(lock.inner_text() == "LOCKED"
                and lock.get_attribute("aria-pressed") == "true"
                and page.evaluate(
                    "localStorage.getItem('ddpdoj.orientationLock')") == "1",
                "Mixup did not persist the desired orientation lock")
        page.evaluate("document.exitFullscreen()")
        wait_for_condition(page, "document.fullscreenElement === null", timeout=30000)
        page.wait_for_timeout(150)

        page.locator("#local-picture").click()
        require(page.evaluate("localStorage.getItem('ddpdoj.mode')") == "tate",
                "Mixup did not restore and persist TATE picture mode")
        page.locator("#local-fullscreen").click()
        wait_for_condition(
            page,
            "document.fullscreenElement?.id === 'local-stage'",
            timeout=30000,
        )
        wait_for_condition(
            page,
            """() => screen.orientation[Symbol.for(
              'mixup.releaseGate.orientationCalls')].some(
                call => call[0] === 'lock' && call[1] === 'portrait')""",
            timeout=30000,
        )
        page.evaluate("document.exitFullscreen()")
        wait_for_condition(page, "document.fullscreenElement === null", timeout=30000)
        page.wait_for_timeout(150)

        lock.click()
        wait_for_condition(
            page,
            """() => screen.orientation[Symbol.for(
              'mixup.releaseGate.orientationCalls')].some(call => call[0] === 'unlock')""",
            timeout=30000,
        )
        require(lock.inner_text() == "LOCK"
                and lock.get_attribute("aria-pressed") == "false"
                and page.evaluate(
                    "localStorage.getItem('ddpdoj.orientationLock')") == "0",
                "Mixup did not persist orientation unlock")

        page.locator("#local-fullscreen").click()
        wait_for_condition(
            page,
            "document.fullscreenElement?.id === 'local-stage'",
            timeout=30000,
        )
        fullscreen_layout = page.evaluate("""() => {
          const stage = document.querySelector('#local-stage');
          const pad = document.querySelector('#local-pad');
          const canvas = document.querySelector('#game-canvas');
          const stageRect = stage.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          return {
            ownsPad: stage.contains(pad),
            padVisible: getComputedStyle(pad).display !== 'none',
            stage: { width: stageRect.width, height: stageRect.height },
            canvas: { width: canvasRect.width, height: canvasRect.height },
          };
        }""")
        require(fullscreen_layout["ownsPad"] and fullscreen_layout["padVisible"]
                and fullscreen_layout["stage"]["width"] > 0
                and fullscreen_layout["stage"]["height"] > 0
                and fullscreen_layout["canvas"]["width"] > 0
                and fullscreen_layout["canvas"]["height"] > 0,
                f"Mixup fullscreen omitted game or touch controls: {fullscreen_layout!r}")
        page.evaluate("document.exitFullscreen()")
        wait_for_condition(page, "document.fullscreenElement === null", timeout=30000)
        page.wait_for_timeout(150)

        page.locator("#local-game-mods").click()
        require(page.locator("#local-picker").is_visible()
                and page.evaluate("document.activeElement?.id") == "local-picker-games",
                "DaiOuJou MODS did not return focus to the picker")
        page.locator("#local-picker-content .local-fields select").nth(1).select_option("")
        page.locator(".local-customizer summary").click()
        page.locator('[data-mod-id="runahead-2"]').click()
        require("1 mod" in page.locator("#local-loadout-summary").inner_text()
                and not page.locator("#local-start").is_disabled(),
                "Mixup could not prepare one-ship two-frame runahead")
        page.evaluate("""async () => {
          const { LocalDdpdojRuntime } = await import('/src/ddpdoj-local.js');
          const prototype = LocalDdpdojRuntime.prototype;
          const key = Symbol.for('mixup.releaseGate.runaheadRuntime');
          if (prototype[key]) return;
          const capture = prototype._captureRunaheadView;
          Object.defineProperty(prototype, key, { value: capture });
          prototype._captureRunaheadView = function(...args) {
            const view = Reflect.apply(capture, this, args);
            const previous = document[key];
            document[key] = {
              runtime: this,
              captures: previous?.runtime === this ? previous.captures + 1 : 1,
            };
            return view;
          };
        }""")
        page.locator("#local-start").click()
        wait_for_condition(
            page,
            "expected => document.querySelector('#boot-status').textContent === expected",
            arg=RUNNING_DDPDOJ,
            timeout=300000,
        )
        wait_for_condition(
            page,
            "() => document[Symbol.for('mixup.releaseGate.runaheadRuntime')]?.captures > 0",
            timeout=120000,
        )
        assert_running()
        assert_no_runtime_globals()
        require(page.locator("#local-controls").inner_text() == "FIXED"
                and page.locator("#local-dpad").bounding_box() is not None
                and page.locator("#local-stick-zone").is_hidden(),
                "Mixup runahead restart did not retain the persisted fixed touch scheme")
        require(page.locator("#local-pad-owner").is_hidden()
                and page.locator("#local-formation-pad-note").is_hidden(),
                "Mixup runahead launch exposed formation or P2 touch ownership")
        runahead_state = page.evaluate("""() => {
          const key = Symbol.for('mixup.releaseGate.runaheadRuntime');
          const runtime = document[key].runtime;
          runtime.running = false;
          cancelAnimationFrame(runtime.request);
          const hash = values => {
            let digest = 2166136261;
            for (let index = 0; index < values.length; index++) {
              digest = Math.imul(digest ^ values[index], 16777619);
            }
            return digest >>> 0;
          };
          const canonical = () => ({
            logicFrame: runtime.game.logicFrame,
            videoFrame: runtime.game.videoFrame,
            ram: hash(runtime.game.ram.b),
            bg: hash(runtime.game.vram.w),
            tx: hash(runtime.game.txvram.w),
            palette: hash(runtime.game.palette.words),
          });
          const calls = [];
          const gameStep = runtime.game.step.bind(runtime.game);
          runtime.game.step = word => {
            calls.push({ logicFrame: runtime.game.logicFrame, word });
            return gameStep(word);
          };
          let recorderInputs = 0;
          let recorderFeeds = 0;
          let p2Updates = 0;
          const updateP2Joined = runtime.updateP2Joined.bind(runtime);
          runtime.updateP2Joined = () => {
            p2Updates++;
            return updateP2Joined();
          };
          runtime.recorder = {
            input() { recorderInputs++; },
            feed() { recorderFeeds++; },
          };
          const cadenceEvents = [];
          const soundTick = runtime.audio.tick.bind(runtime.audio);
          const runtimeStep = runtime.step.bind(runtime);
          runtime.audio.tick = () => {
            cadenceEvents.push('sound');
            return soundTick();
          };
          runtime.step = options => {
            cadenceEvents.push('logic');
            return runtimeStep(options);
          };
          runtime.game.armedVblanks = 2;
          runtime.game.ram.setU8(0x803940, 2);
          runtime.cadence.reset();
          const start = 100;
          const period = runtime.cadence.soundPeriodMs;
          const initialLogicFrame = runtime.game.logicFrame;
          runtime.lastTime = start;
          runtime.running = true;
          runtime.frame(start + period);
          cancelAnimationFrame(runtime.request);
          const afterFirstPeriod = {
            logicFrame: runtime.game.logicFrame,
            cadenceEvents: cadenceEvents.slice(),
          };
          runtime.frame(start + period * 2);
          cancelAnimationFrame(runtime.request);
          runtime.running = false;
          runtime.audio.tick = soundTick;
          runtime.step = runtimeStep;
          runtime.recorder = null;
          const view = runtime.runaheadView;
          const beforeDraw = canonical();
          runtime.draw();
          const afterDraw = canonical();
          const playback = runtime.playback;
          runtime.playback = {};
          const playbackSuspended = runtime._projectRunahead(0xffff) === null;
          runtime.playback = playback;
          return {
            configured: runtime.runaheadFrames,
            initialLogicFrame,
            canonicalLogicFrame: runtime.game.logicFrame,
            view: view && {
              baseLogicFrame: view.baseLogicFrame,
              logicFrame: view.logicFrame,
              depth: view.depth,
              detachedBg: view.bg !== runtime.game.vram.w,
              detachedTx: view.tx !== runtime.game.txvram.w,
              detachedPalette: view.palette !== runtime.game.palette.words,
              detachedSprites: view.spritebuffer !== runtime.spritebuffer,
              dedicatedSprites: view.spritebuffer === runtime.runaheadSpritebuffer,
            },
            calls,
            recorderInputs,
            recorderFeeds,
            p2Updates,
            beforeDraw,
            afterDraw,
            playbackSuspended,
            afterFirstPeriod,
            cadenceEvents,
          };
        }""")
        calls = runahead_state["calls"]
        require(runahead_state["afterFirstPeriod"] == {
                    "logicFrame": runahead_state["initialLogicFrame"],
                    "cadenceEvents": ["sound"],
                },
                f"Mixup sound did not run during the arm-two wait: {runahead_state}")
        require(runahead_state["cadenceEvents"] == ["sound", "logic", "sound"],
                f"Mixup coincident logic/sound boundary is out of order: {runahead_state}")
        require(runahead_state["canonicalLogicFrame"]
                == runahead_state["initialLogicFrame"] + 1,
                f"Mixup arm-two cadence did not delay exactly one logic step: {runahead_state}")
        require(runahead_state["configured"] == 2
                and len(calls) == 3
                and [call["logicFrame"] for call in calls]
                == [runahead_state["canonicalLogicFrame"] - 1,
                    runahead_state["canonicalLogicFrame"],
                    runahead_state["canonicalLogicFrame"] + 1]
                and len({call["word"] for call in calls}) == 1,
                f"Mixup runahead did not reuse one input across one real and two future frames: {runahead_state}")
        require(runahead_state["view"] == {
            "baseLogicFrame": runahead_state["canonicalLogicFrame"],
            "logicFrame": runahead_state["canonicalLogicFrame"] + 2,
            "depth": 2,
            "detachedBg": True,
            "detachedTx": True,
            "detachedPalette": True,
            "detachedSprites": True,
            "dedicatedSprites": True,
        }, f"Mixup runahead projection is not detached: {runahead_state['view']}")
        require(runahead_state["recorderInputs"] == 1
                and runahead_state["recorderFeeds"] == 1
                and runahead_state["p2Updates"] == 1,
                f"Mixup runahead leaked speculative host callbacks: {runahead_state}")
        require(runahead_state["beforeDraw"] == runahead_state["afterDraw"],
                "Mixup runahead draw mutated canonical simulation state")
        require(runahead_state["playbackSuspended"],
                "Mixup runahead projection remained active during PLAY")
        canvas_identity(page, "#game-canvas", 224, 448, timeout=120000)
        require_no_post_preparation_reads(page, "DaiOuJou runahead")

        # Reload the document so this final pass proves a fresh shell restores
        # rather than passing on its in-memory state.
        page.locator("#local-picture").click()
        require(page.evaluate("localStorage.getItem('ddpdoj.mode')") == "yoko",
                "Mixup did not prepare WIDE mode for the fresh-page persistence gate")
        page.evaluate("localStorage.setItem('ddpdoj.orientationLock', '1')")
        open_page(page, origin, "/")
        baseline_globals = page.evaluate("() => Object.getOwnPropertyNames(window)")
        page.locator("#files").set_input_files(str(DDPDOJ_7Z_FIXTURE))
        wait_for_condition(
            page,
            "document.querySelector('#status').dataset.kind === 'good'",
            timeout=300000,
        )
        block_post_preparation_reads(page)
        page.evaluate("""() => {
          Object.defineProperty(document, '__mixupReleaseGateMarker', {
            value: {}, configurable: true,
          });
        }""")
        card = page.locator('.game-card[data-game-id="ddpdoj"]')
        card.click()
        page.locator("#launch-game").click()
        wait_for_condition(
            page,
            "() => { const shell = document.querySelector('#local-shell'); "
            "const picker = document.querySelector('#local-picker'); "
            "return shell && !shell.hidden && picker && !picker.hidden; }",
            timeout=300000,
        )
        page.locator(".local-customizer summary").click()
        screen_select = page.locator(
            '#local-picker-content label:has-text("Screen") select')
        require(screen_select.input_value() == "yoko",
                "a fresh Mixup shell did not restore persisted WIDE mode")
        screen_select.select_option("tate")
        require(page.evaluate("localStorage.getItem('ddpdoj.mode')") == "tate",
                "the Mixup screen picker did not persist its TATE selection")
        page.evaluate("""async () => {
          const [{ LocalDdpdojRuntime }, { RAM }] = await Promise.all([
            import('/src/ddpdoj-local.js'),
            import('/games/ddpdoj/src/main.js'),
          ]);
          const prototype = LocalDdpdojRuntime.prototype;
          const key = Symbol.for('mixup.releaseGate.slowReplayArm');
          if (prototype[key]) return;
          const armRecording = prototype.armRecording;
          Object.defineProperty(prototype, key, { value: armRecording });
          prototype.armRecording = async function(...args) {
            const wasRunning = this.running;
            if (wasRunning) {
              this.running = false;
              cancelAnimationFrame(this.request);
            }
            this.game.armedVblanks = 2;
            this.game.ram.setU8(RAM.semaphore, 2);
            try {
              return await Reflect.apply(armRecording, this, args);
            } finally {
              if (wasRunning) this.start();
            }
          };
        }""")
        page.locator("#local-start").click()
        wait_for_condition(
            page,
            "expected => document.querySelector('#boot-status').textContent === expected",
            arg=RUNNING_DDPDOJ,
            timeout=300000,
        )
        assert_running()
        assert_no_runtime_globals()
        require(page.locator("#local-controls").inner_text() == "FIXED"
                and page.locator("#local-dpad").bounding_box() is not None
                and page.locator("#local-stick-zone").is_hidden(),
                "a fresh Mixup shell did not restore the persisted fixed touch scheme")
        require(page.locator("#local-lock").inner_text() == "LOCKED"
                and page.locator("#local-lock").get_attribute("aria-pressed") == "true",
                "a fresh Mixup shell did not restore the desired orientation lock")
        require(page.locator("#local-formation-pad-note").is_hidden()
                and page.locator("#local-pad-owner").is_hidden(),
                "a fresh original launch exposed formation or P2 touch ownership")
        canvas_identity(page, "#game-canvas", 224, 448, timeout=120000)
        require_no_post_preparation_reads(page, "DaiOuJou")

        record = page.locator("#local-record")
        play = page.locator("#local-play")
        replay_status = page.locator("#local-replay-status")
        require(record.is_visible() and play.is_visible()
                and not record.is_disabled() and not play.is_disabled(),
                "a fresh original launch did not enable REC and PLAY")
        record.click()
        wait_for_condition(
            page,
            "document.querySelector('#local-record').getAttribute('aria-pressed') === 'true' "
            "&& document.querySelector('#local-replay-status').dataset.kind === 'recording'",
            timeout=30000,
        )
        require(record.inner_text() == "STOP & SAVE" and play.is_disabled(),
                "Mixup REC did not expose stop or disable PLAY")
        page.wait_for_timeout(1800)
        with page.expect_download(timeout=120000) as download_info:
            record.click()
        download = download_info.value
        require(download.suggested_filename == "ddpdoj-mixup-local.replay",
                f"unexpected local replay filename {download.suggested_filename!r}")
        replay_path = download.path()
        require(replay_path is not None, "Chrome did not retain the local replay download")
        replay_bytes = Path(replay_path).read_bytes()
        try:
            replay = json.loads(replay_bytes.decode("utf-8"))
            tables_bytes = base64.b64decode(replay["seed"]["tablesB64"], validate=True)
            replay_tables = json.loads(tables_bytes.decode("utf-8"))
            ram_bytes = base64.b64decode(replay["seed"]["ramB64"], validate=True)
            bg_bytes = base64.b64decode(replay["seed"]["bgB64"], validate=True)
        except (KeyError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise GateFailure(f"downloaded local replay is malformed: {error}") from error
        require(replay.get("format") == "ddpdoj.replay/v1"
                and replay.get("build") == "B"
                and replay.get("version", {}).get("buildId") == "mixup-local",
                "downloaded replay lost its Mixup-local v1 identity")
        require(replay.get("seed", {}).get("arm") == 2,
                "Mixup-local replay did not retain active slowdown in its seed")
        require(replay.get("poke") == "",
                "Mixup-local recording acquired an undeclared RAM poke")
        require(isinstance(replay.get("portin", {}).get("count"), int)
                and replay["portin"]["count"] >= 30,
                f"Mixup REC captured too few complete frames: {replay.get('portin')!r}")
        require(len(ram_bytes) == 0x20000 and len(bg_bytes) == 0x1000,
                "Mixup-local replay seeds have the wrong RAM or BG size")
        require(isinstance(replay_tables, dict) and "rom" not in replay_tables,
                "Mixup-local replay embedded packaged cartridge ROM windows")
        require(replay.get("version", {}).get("tablesSha256")
                == hashlib.sha256(tables_bytes).hexdigest(),
                "Mixup-local replay table digest does not match its seed")
        require(replay_status.get_attribute("data-kind") == "saved",
                "Mixup REC did not report a local save")
        saved_status = replay_status.inner_text()
        for wording in (
            "exact Black Label ROM identity",
            "contain no cartridge ROM windows",
            "not automatically standalone headless verifier artifacts",
        ):
            require(wording in saved_status,
                    f"Mixup replay portability warning omits {wording!r}: {saved_status!r}")
        require(not record.is_disabled() and not play.is_disabled()
                and record.get_attribute("aria-pressed") == "false",
                "Mixup replay controls did not recover after save")

        replay_payload = {
            "name": download.suggested_filename,
            "mimeType": "application/json",
            "buffer": replay_bytes,
        }
        with page.expect_file_chooser(timeout=30000) as chooser_info:
            play.click()
        chooser_info.value.set_files(replay_payload)
        wait_for_condition(
            page,
            "document.querySelector('#local-replay-status').dataset.kind === 'playing'",
            timeout=30000,
        )
        require(record.is_disabled() and play.is_disabled(),
                "Mixup left REC or PLAY enabled during replay playback")
        page.keyboard.down("5")
        try:
            live_coin_word = page.evaluate("""async () => {
              const input = await import('/games/ddpdoj/src/web/input.js');
              return input.currentCoinWord();
            }""")
            require((live_coin_word & 1) == 0,
                    f"release gate did not press live COIN during PLAY: {live_coin_word:#06x}")
            wait_for_condition(
                page,
                "document.querySelector('#local-replay-status').dataset.kind === 'green'",
                timeout=120000,
            )
        finally:
            page.keyboard.up("5")
        green_status = replay_status.inner_text()
        require(green_status.startswith("GREEN: all ")
                and "recorded frames and the final digest matched" in green_status,
                f"Mixup local replay did not report final GREEN: {green_status!r}")
        require(not record.is_disabled() and not play.is_disabled(),
                "Mixup replay controls did not recover after GREEN")
        require_no_post_preparation_reads(page, "DaiOuJou replay")

        divergent = json.loads(json.dumps(replay))
        divergent["digest"]["periods"][0]["sha256"] = "0" * 64
        divergent_payload = {
            "name": "ddpdoj-divergent-local.replay",
            "mimeType": "application/json",
            "buffer": json.dumps(divergent).encode("utf-8"),
        }
        with page.expect_file_chooser(timeout=30000) as chooser_info:
            play.click()
        chooser_info.value.set_files(divergent_payload)
        wait_for_condition(
            page,
            "document.querySelector('#local-replay-status').dataset.kind === 'red'",
            timeout=120000,
        )
        red_status = replay_status.inner_text()
        require(red_status.startswith("RED: replay verification failed")
                and "first divergent digest period 1" in red_status,
                f"Mixup local replay did not localize final RED: {red_status!r}")
        require(not record.is_disabled() and not play.is_disabled(),
                "Mixup replay controls did not recover after RED")
        require_no_post_preparation_reads(page, "DaiOuJou divergent replay")

        malformed = json.loads(json.dumps(replay))
        malformed_tables = json.loads(base64.b64decode(
            malformed["seed"]["tablesB64"], validate=True
        ).decode("utf-8"))
        del malformed_tables["dirTable"]["bytes"]
        malformed["seed"]["tablesB64"] = base64.b64encode(
            json.dumps(malformed_tables).encode("utf-8")
        ).decode("ascii")
        malformed_payload = {
            "name": "ddpdoj-malformed-tables.replay",
            "mimeType": "application/json",
            "buffer": json.dumps(malformed).encode("utf-8"),
        }
        before_malformed = page.evaluate(
            "() => CanvasRenderingContext2D.prototype["
            "Symbol.for('mixup.releaseGate.putImageDataCount')]"
        )
        with page.expect_file_chooser(timeout=30000) as chooser_info:
            play.click()
        chooser_info.value.set_files(malformed_payload)
        wait_for_condition(
            page,
            "document.querySelector('#local-replay-status').dataset.kind === 'error'",
            timeout=30000,
        )
        malformed_status = replay_status.inner_text()
        require("Replay tables do not match the exact local Black Label ROM identity"
                in malformed_status,
                f"Mixup accepted malformed replay tables: {malformed_status!r}")
        page.wait_for_timeout(250)
        after_malformed = page.evaluate(
            "() => CanvasRenderingContext2D.prototype["
            "Symbol.for('mixup.releaseGate.putImageDataCount')]"
        )
        require(after_malformed > before_malformed
                and not record.is_disabled() and not play.is_disabled(),
                "malformed replay input replaced or stopped the valid local game")

        page.evaluate("""() => {
          const key = Symbol.for('mixup.releaseGate.deferredReplayText');
          const state = { original: File.prototype.text, reject: null };
          Object.defineProperty(File.prototype, key, {
            value: state, configurable: true,
          });
          File.prototype.text = function() {
            return new Promise((_resolve, reject) => { state.reject = reject; });
          };
        }""")
        with page.expect_file_chooser(timeout=30000) as chooser_info:
            play.click()
        chooser_info.value.set_files(replay_payload)
        wait_for_condition(
            page,
            "typeof File.prototype[Symbol.for("
            "'mixup.releaseGate.deferredReplayText')].reject === 'function'",
            timeout=30000,
        )
        page.locator("#local-game-mods").click()
        require(page.locator("#local-picker").is_visible(),
                "deferred replay read did not allow a return to MODS")
        page.locator("#local-start").click()
        wait_for_condition(
            page,
            "() => { const record = document.querySelector('#local-record'); "
            "return !document.querySelector('#game-screen').hidden "
            "&& record && !record.disabled; }",
            timeout=300000,
        )
        page.evaluate("""() => {
          const key = Symbol.for('mixup.releaseGate.deferredReplayText');
          const state = File.prototype[key];
          File.prototype.text = state.original;
          state.reject(new Error('stale replay file read'));
        }""")
        page.wait_for_timeout(250)
        require(replay_status.is_hidden() and not record.is_disabled()
                and not play.is_disabled()
                and record.get_attribute("aria-pressed") == "false",
                "a stale replay read changed the replacement local session")
        require_no_post_preparation_reads(page, "DaiOuJou stale replay read")

        draw_count = page.evaluate(
            "() => CanvasRenderingContext2D.prototype["
            "Symbol.for('mixup.releaseGate.putImageDataCount')]"
        )
        require(isinstance(draw_count, int) and draw_count > 0,
                f"asset-free draw counter is invalid: {draw_count!r}")

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

    gate.run("asset-free local DaiOuJou", local_ddpdoj,
             expected_downloads=("ddpdoj-mixup-local.replay",),
             context_options={"has_touch": True, "accept_downloads": True})


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
            supplied_root / "src/batman-local.js",
            supplied_root / "src/gradius-local.js",
            supplied_root / "src/local-shell.js",
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
        require_files((BATMAN_ARCHIVE_FIXTURE, GRADIUS_ARCHIVE_FIXTURE,
                       DDPDOJ_7Z_FIXTURE),
                      "exact local cartridge archive fixtures")

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
