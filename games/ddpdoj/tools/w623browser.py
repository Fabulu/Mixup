#!/usr/bin/env python3
"""W623 exact production Chrome gate for the full cabinet lifecycle."""

import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[3]
PAGE = "/games/ddpdoj/index.html"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


LIFECYCLE = r"""
async () => {
  const app = window.__mixup;
  app.stop();
  const demo = app.demo;
  const game = app.game;
  const canvas = document.querySelector('#screen');
  const TABLE = 0x80e240;
  const SLOTS = 20;
  const STRIDE = 0x50;
  const PHASE = 0x0c;
  const ID = 0x4c;
  const TALLY_SCREEN_HANDLE = 0x813116;
  const CREDIT = 0x80395a;
  const CONTINUE_DIP = 0x803809;
  const SCREEN8_STATE = 0x812e56;

  const statusReady = (queue) => {
    const status = queue.status();
    if (status.failed.length) throw new Error(`asset queue failed: ${status.failed.join(',')}`);
    return status.ready === status.total;
  };
  app.bundle.bg.prefetchAll();
  app.bundle.spr.prefetchAll();
  const assetDeadline = performance.now() + 30000;
  while (!statusReady(app.bundle.bg) || !statusReady(app.bundle.spr)) {
    if (performance.now() >= assetDeadline) throw new Error('deferred production assets timed out');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const active = () => {
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
      const rec = TABLE + i * STRIDE;
      const type = game.ram.u16(rec) & 0x7fff;
      if (type) out.push({ rec, type });
    }
    return out;
  };
  const has = (type) => active().some((o) => o.type === type);
  const resolve = (id) => active().find((o) => game.ram.u32(o.rec + ID) === id)?.rec ?? 0;
  const choice = () => resolve(game.ram.u32(TALLY_SCREEN_HANDLE));
  const choicePhase = () => {
    const rec = choice();
    return rec ? game.ram.u8(rec + PHASE) : -1;
  };
  const event = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
    code, key: code, bubbles: true, cancelable: true, repeat: false,
  }));
  const down = (...codes) => codes.forEach((code) => event('keydown', code));
  const up = (...codes) => codes.forEach((code) => event('keyup', code));
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) demo.step();
  };
  const pulse = (codes) => {
    down(...codes);
    step();
    up(...codes);
    step();
  };
  const until = (predicate, limit, label) => {
    for (let frame = 1; frame <= limit; frame++) {
      step();
      if (predicate()) return frame;
    }
    throw new Error(`${label} did not arrive within ${limit} frames`);
  };
  const mark = (label) => {
    demo.draw();
    const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let colored = 0;
    let signature = 0x811c9dc5;
    for (let i = 0; i < image.data.length; i++) {
      const value = image.data[i];
      if ((i & 3) !== 3 && value !== 0) colored++;
      signature = Math.imul(signature ^ value, 0x01000193) >>> 0;
    }
    if (demo.portList.skipped !== 0) {
      throw new Error(`${label} skipped ${demo.portList.skipped} cartridge sprite records`);
    }
    if (colored === 0) throw new Error(`${label} produced a blank final canvas`);
    return {
      label, logicFrame: game.logicFrame, colored, signature,
      records: demo.portList.records, drawn: demo.portList.drawn,
      types: active().map((o) => o.type),
    };
  };
  const coin = () => {
    down('Digit5');
    step(30);
    up('Digit5');
    step(10);
  };
  const start = () => {
    down('Enter');
    step(12);
    up('Enter');
    step(2);
  };

  if (!demo.coldBoot || demo.seedLf !== 0 || game.logicFrame > 10) {
    throw new Error(`not a production cold boot stopped near frame zero: ${game.logicFrame}`);
  }
  if (demo.authentic !== undefined || demo.rung !== null || demo.formation !== null) {
    throw new Error('the production launch used a host selection, rung, or formation shortcut');
  }
  if (game.ram.u8(CONTINUE_DIP) !== 1) {
    throw new Error('the cartridge factory operator block did not enable continues');
  }
  if (canvas.width !== 224 || canvas.height !== 448) {
    throw new Error(`wrong TATE canvas ${canvas.width}x${canvas.height}`);
  }

  step(305);
  const cabinet = mark('cabinet');
  if (game.ram.u8(CREDIT) !== 0) throw new Error('cold cabinet invented a credit');
  pulse(['Enter']);
  if (game.ram.u8(CREDIT) !== 0 || game.ram.u16(SCREEN8_STATE) !== 2) {
    throw new Error(`uncredited START bypassed the cartridge front-end gate: credit=${
      game.ram.u8(CREDIT)} state=${game.ram.u16(SCREEN8_STATE)} LF=${game.logicFrame}`);
  }

  coin();
  if (game.ram.u8(CREDIT) !== 1) throw new Error('real Digit5 coin edge did not credit P1');
  start();
  if (game.ram.u8(CREDIT) !== 0 || !has(0x09)) {
    throw new Error('real Enter START did not spend the credit and open type $9');
  }
  const selection = mark('selection');

  until(() => has(0x02) && has(0x0b) && !has(0x09), 3000,
    'cartridge selector to gameplay handoff');
  const gameplay = mark('gameplay');

  until(() => has(0x0d), 6000, 'first natural final-life death');
  const firstCountdown = mark('first-countdown');
  if (game.ram.u8(CREDIT) !== 0) throw new Error('the first run retained an opening credit');
  if (!choice() || choicePhase() !== 0) {
    throw new Error('the first continue choice did not begin in phase 0');
  }

  coin();
  if (game.ram.u8(CREDIT) !== 1) throw new Error('Digit5 did not credit the continue countdown');
  pulse(['Enter']);
  if (game.ram.u8(CREDIT) !== 0 || choicePhase() !== 1) {
    throw new Error('credited Enter did not spend one credit and reach the X cursor');
  }
  down('KeyY');
  step();
  const xPressPhase = choicePhase();
  const xPressRaw = game.ram.u16(0x803970);
  const xPressEdge = game.ram.u16(0x803972);
  up('KeyY');
  step();
  if (choicePhase() !== 2) {
    const currentChoice = choice();
    throw new Error(`Swiss-QWERTZ shot did not confirm the X cursor: phase=${
      choicePhase()} pressPhase=${xPressPhase} raw=${
      xPressRaw.toString(16)} edge=${xPressEdge.toString(16)} current=${
      currentChoice.toString(16)} type=${
      (currentChoice ? game.ram.u16(currentChoice) : 0).toString(16)} handle=${
      game.ram.u32(TALLY_SCREEN_HANDLE).toString(16)}`);
  }
  pulse(['KeyZ']);
  until(() => has(0x02) && !has(0x0d) && !choice(), 30,
    'confirmed continue respawn');
  const continued = mark('continued-gameplay');

  until(() => has(0x0d), 6000, 'second natural final-life death');
  if (!choice() || choicePhase() !== 0) {
    throw new Error('the second uncredited continue choice did not begin in phase 0');
  }
  const secondCountdown = mark('second-countdown');

  const mash = [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'KeyY', 'KeyZ', 'Space', 'KeyX', 'KeyC', 'Enter',
  ];
  let mashFrames = 0;
  let gameOverFrames = 0;
  let firstGameOver = 0;
  let gameOver = null;
  let scoreEntryFrame = 0;
  let attractFrame = 0;
  for (let frame = 1; frame <= 2200; frame++) {
    if ((frame & 1) !== 0) down(...mash); else up(...mash);
    step();
    mashFrames++;
    const types = new Set(active().map((o) => o.type));
    const choiceRec = choice();
    if (choiceRec && game.ram.u8(choiceRec + PHASE) !== 0) {
      throw new Error('uncredited full-control mash advanced the continue choice');
    }
    if (types.has(0x0e)) {
      gameOverFrames++;
      if (!firstGameOver) {
        firstGameOver = frame;
        step(2);
        mashFrames += 2;
        gameOverFrames += 2;
        gameOver = mark('game-over');
      }
    }
    if (!scoreEntryFrame && types.has(0x0c)) scoreEntryFrame = frame;
    if (scoreEntryFrame && types.has(0x08)) {
      attractFrame = frame;
      break;
    }
  }
  up(...mash);
  step(2);

  if (mashFrames < 300) throw new Error(`only ${mashFrames} mash frames ran`);
  if (!firstGameOver || !gameOver) throw new Error('continue timeout never reached Game Over');
  if (gameOverFrames < 300) {
    throw new Error(`button mashing shortened Game Over to ${gameOverFrames} frames`);
  }
  if (!scoreEntryFrame || scoreEntryFrame <= firstGameOver) {
    throw new Error('Game Over did not hand off to score/name entry');
  }
  if (!attractFrame || attractFrame <= scoreEntryFrame) {
    throw new Error('score/name entry did not return to the cartridge front end');
  }
  if (game.ram.u8(CREDIT) !== 0) throw new Error('button mashing invented a credit');
  const returned = mark('returned-front-end');

  coin();
  if (game.ram.u8(CREDIT) !== 1) throw new Error('post-Game-Over Digit5 did not credit P1');
  start();
  if (game.ram.u8(CREDIT) !== 0 || !has(0x09)) {
    throw new Error('post-Game-Over Enter did not open the cartridge selector');
  }
  const restartedSelection = mark('restarted-selection');
  until(() => has(0x02) && has(0x0b) && !has(0x09), 3000,
    'second cartridge selector to gameplay handoff');
  const restartedGameplay = mark('restarted-gameplay');

  const landmarks = [
    cabinet, selection, gameplay, firstCountdown, continued,
    secondCountdown, gameOver, returned, restartedSelection, restartedGameplay,
  ];
  const signatures = new Set(landmarks.map((entry) => entry.signature));
  if (signatures.size < 8) throw new Error('production canvas landmarks were not visibly distinct');
  if (gameOver.drawn < 1 || gameOver.records < 1) {
    throw new Error('Game Over did not draw its cartridge sprite on the final canvas');
  }
  if (app.bundle.missingTxTiles.size || app.bundle.missingBgTiles.size) {
    throw new Error(`the complete lifecycle requested unshipped cartridge tiles: tx=${
      [...app.bundle.missingTxTiles].join(',')} bg=${
      [...app.bundle.missingBgTiles].join(',')}`);
  }

  return {
    logicFrame: game.logicFrame,
    mashFrames,
    gameOverFrames,
    firstGameOver,
    scoreEntryFrame,
    attractFrame,
    signatures: signatures.size,
    landmarks,
  };
}
"""


def main():
    if not Path(CHROME).exists():
        raise SystemExit(f"missing installed Chrome: {CHROME}")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    old = os.getcwd()
    os.chdir(ROOT)
    server_thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=CHROME)
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.on("pageerror", lambda error: print(f"PAGE ERROR: {error}"))
            page.on("console", lambda message: print(
                f"BROWSER {message.type}: {message.text}")
                if message.type in ("error", "warning") else None)
            page.goto(f"http://127.0.0.1:{server.server_port}{PAGE}",
                      wait_until="domcontentloaded", timeout=120000)
            page.wait_for_function("window.__mixup !== undefined", timeout=120000)
            result = page.evaluate(LIFECYCLE)
            browser.close()
    finally:
        server.shutdown()
        os.chdir(old)

    print("PASS W623 exact production Chrome cabinet lifecycle")
    print(f"  logic frames: {result['logicFrame']}")
    print(f"  full-control mash frames: {result['mashFrames']}")
    print(f"  Game Over frames: {result['gameOverFrames']}")
    print(f"  distinct canvas signatures: {result['signatures']}")
    for landmark in result["landmarks"]:
        print(f"  {landmark['label']}: LF{landmark['logicFrame']} "
              f"rgba={landmark['signature']:08X} colored={landmark['colored']} "
              f"sprites={landmark['drawn']}/{landmark['records']}")


if __name__ == "__main__":
    main()
