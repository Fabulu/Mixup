#!/usr/bin/env python3
"""W165 real Chrome interaction gate for replay and control-help UX."""

import json
import os
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[3]
PAGE = "/games/ddpdoj/index.html"
FIXTURE = ROOT / "games/ddpdoj/tools/oracle/out/w69/fly-around/fly-around.lf2000-2250.replay"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    if not FIXTURE.exists():
        raise SystemExit(f"missing replay fixture: {FIXTURE}")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    old = os.getcwd()
    os.chdir(ROOT)
    server_thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=CHROME)
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto(f"http://127.0.0.1:{server.server_port}{PAGE}",
                      wait_until="domcontentloaded", timeout=120000)
            page.wait_for_function("window.__mixup !== undefined", timeout=120000)

            for ident in ("rot", "ctrl", "rec", "play", "infobtn"):
                assert page.locator(f"#{ident}").get_attribute("title") is None
            banner = page.locator("#replay-banner")
            assert banner.evaluate("e => getComputedStyle(e).pointerEvents") == "none"

            rec = page.locator("#rec")
            bar_bottom = page.locator("#bar").bounding_box()["y"] + page.locator("#bar").bounding_box()["height"]
            rec.hover()
            help_box = page.locator("#control-help").bounding_box()
            assert page.locator("#control-help").evaluate("e => getComputedStyle(e).pointerEvents") == "none"
            assert help_box["y"] >= bar_bottom

            rec.click()
            page.wait_for_function("document.querySelector('#rec').textContent === 'STOP REC'")
            with page.expect_download(timeout=30000):
                rec.click()
            page.wait_for_function("document.querySelector('#rec').textContent === 'REC'")

            # A known-good file must be GREEN in the browser, not merely appear
            # to play. This is the real page's digest verdict.
            page.locator("#play-input").set_input_files(str(FIXTURE))
            page.wait_for_function("document.querySelector('#replay-banner').classList.contains('green')",
                                   timeout=30000)
            assert "REPLAY GREEN" in page.locator("#replay-banner").inner_text()

            # Corrupt only the cumulative digest: all frame windows still play,
            # so a real mismatch must remain visible rather than being hidden.
            obj = json.loads(FIXTURE.read_text())
            first = "1" if obj["digest"]["cumulative"][0] != "1" else "2"
            obj["digest"]["cumulative"] = first + obj["digest"]["cumulative"][1:]
            with tempfile.NamedTemporaryFile("w", suffix=".replay", delete=False) as f:
                json.dump(obj, f)
                bad = f.name
            try:
                page.locator("#play-input").set_input_files(bad)
                page.wait_for_function("document.querySelector('#replay-banner').classList.contains('red')",
                                       timeout=30000)
                assert "REPLAY MISMATCH" in page.locator("#replay-banner").inner_text()
            finally:
                Path(bad).unlink(missing_ok=True)
            browser.close()
    finally:
        server.shutdown()
        os.chdir(old)
    print("PASS W165 Chrome replay/control-help interaction gate")


if __name__ == "__main__":
    main()
