// THE PAGE.  (wave 7; the wave-6 `web/app.js` moved here so `build-dist.mjs`
// publishes it -- that script copies `games/<id>/src`, and a module under
// `web/` would have been left behind, which is a black page and no message.)
//
// WHAT IS SIMULATED AND WHAT IS REPLAYED, stated here because a picture cannot
// say it, and printed on the page itself because a reader will not open this
// file:
//
//   SIMULATED, live, from the port's own code:  the seven-call main loop, the
//     frame counters and their three masks, the ISR model and its (A) gate, the
//     input mirrors and edges, the frame-sync governor, the object driver with
//     its work budget, and THE PLAYER -- position, velocity, tilt, clamps,
//     speed modes, options.  That is wave 4's port, which compares 0 divergent
//     frames against the board over 2,200 logic frames on 34 columns.
//
//   REPLAYED, from a board capture:  everything else in the picture.  The port
//     does not build the display list (main-loop call #4, $23D2AE, is unported)
//     and 18 of the 20 top-level object handlers are unported, so the
//     background, the enemies, the HUD text and every sprite that is not the
//     ship come out of `assets/capture.bin` -- 161 consecutive frames of the
//     `fly-around` scenario, the same window wave 4 compares -- and loop.
//
//   SPLICED:  the ship's and the two option pods' display-list records are
//     moved to the PORT's position each frame.  Which records those are was
//     MEASURED, not eyeballed (`tools/pixpack.mjs`): three offsets accepted at
//     161/161 frames, at frame lag 1 and truncating fixed-point conversion,
//     with every other lag/conversion combination accepting NOTHING.
//
//   NOT THERE AT ALL:  enemies as SIMULATION, any weapon, and sound.  Wave 5
//     came back BLOCKED; the fire keys drive the ported cadence machine
//     ($249B2C..$249BE2) and then reach a loud named throw at the ship-type
//     jump table.  That throw is the reason `onError` below is not optional.
//
// THE CADENCE IS THE BOARD'S: 15625/264 Hz = 59.185606060606..., frame period
// exactly 16.896 ms, read from `game.json` where it is spelled once.  The host
// clock decides only HOW MANY logic frames have come due, never what any of
// them computes (`NOTES-replay.md` constraint 1).  Same input word in, same
// frame out, on any machine, at any refresh rate.

import { Game, RAM, MACHINE } from '../main.js';
import { P } from '../machine.js';
import {
  Renderer, paletteRgb, resolveRgb, rotateCCW, rgbToRgba, SCREEN_W, SCREEN_H,
} from '../render/index.js';
import { loadBundle, httpReader, AssetError } from './assets.js';
import { attachKeyboard, currentPortWord } from './input.js';

// The rotated picture.  The cabinet is TATE, so the game's long axis is the
// bitmap's X and the canvas is 224 wide by 448 tall.
export const CANVAS_W = SCREEN_H, CANVAS_H = SCREEN_W;

// The fly-around scenario's intervention, applied here on the same terms as in
// the comparison: $810424 is the player record's ($3e,A6) invulnerability
// timer, held at $FF from the seed.  $FF is a value the game itself writes at
// $2495A2; it changes WHETHER the ship dies, not what any ported routine
// computes.  Without it a button-free run of this script dies at lf2469 on the
// board (measured, `scenarios.json`).
const INVULN = 0x810424;

/**
 * Integer scaling in DEVICE pixels.
 *
 * `image-rendering: pixelated` AND a whole-number scale.  Both are needed: a
 * fractional scale puts the canvas's 1:1 pixels on non-integer device pixels
 * and the browser resamples them.  The Batman port shipped a dithered circle
 * that came out looking like tetris pieces because of exactly this, and it was
 * reported from play.  So this FLOORS -- do not "fix" it into a percentage.
 */
export function fitCanvas(canvas, container = canvas.parentElement) {
  const dpr = window.devicePixelRatio || 1;
  const availW = (container?.clientWidth || window.innerWidth) * dpr;
  const availH = (container?.clientHeight || window.innerHeight) * dpr;
  const scale = Math.max(1, Math.floor(Math.min(availW / CANVAS_W, availH / CANVAS_H)));
  canvas.style.width = `${(CANVAS_W * scale) / dpr}px`;
  canvas.style.height = `${(CANVAS_H * scale) / dpr}px`;
  canvas.style.imageRendering = 'pixelated';
  canvas.dataset.scale = String(scale);
  return scale;
}

class Demo {
  constructor(canvas, bundle, frameHz) {
    this.bundle = bundle;
    this.cap = bundle.cap;
    // The tile functions come from the exported sheets; nothing else about the
    // renderer changes, and `tools/bundlegate.mjs` is what proves that.
    this.renderer = new Renderer(bundle.roms, bundle.tileFns);
    this.seedLf = this.cap.frames[0].lf;
    this.game = new Game(bundle.seed, bundle.tables, {
      logicFrame: this.seedLf,
      videoFrame: this.cap.frames[0].vf,
    });
    this.prevPos = [this.game.ram.u16(RAM.player1 + P.posY),
      this.game.ram.u16(RAM.player1 + P.posX)];

    this.canvas = canvas;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.img = this.ctx.createImageData(CANVAS_W, CANVAS_H);
    this.rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.rot = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.pal = new Uint8Array(0x1000 * 3);

    this.periodMs = 1000 / frameHz;
    this.acc = 0;
    this.last = 0;
    this.stepsRun = 0;
    this.hudAt = 0;
    this.hudSteps = 0;
    this.hz = 0;
    this.running = true;
  }

  /** ONE LOGIC FRAME of the port.  No pixel work happens in here. */
  step() {
    const g = this.game;
    this.prevPos = [g.ram.u16(RAM.player1 + P.posY), g.ram.u16(RAM.player1 + P.posX)];
    g.ram.setU8(INVULN, 0xff);           // the scenario's intervention
    g.step(currentPortWord());
    this.stepsRun++;
  }

  /** The picture for the port's CURRENT logic frame. */
  draw() {
    const n = this.cap.length;
    const k = (this.game.logicFrame - this.seedLf) % n;
    const fi = k < 0 ? k + n : k;
    const st = this.cap.state(fi);
    // THE SPLICE, through the shared module the packer proves round-trips.
    // `prevPos`, not the current position: the sprite buffer lags main RAM by
    // one frame, measured (`capture.js`).
    this.cap.splice(st, fi, this.prevPos[0], this.prevPos[1]);
    const idx = this.renderer.renderIndexed(st);
    // The palette that applies is the NEXT frame's -- the measured sample-point
    // offset (00-recon-assets.md §4).  On a looping capture the next frame is
    // the next captured one.
    paletteRgb(this.cap.part((fi + 1) % n, 'palette'), this.pal);
    resolveRgb(idx, this.pal, this.rgb);
    rotateCCW(this.rgb, SCREEN_W, SCREEN_H, this.rot);
    rgbToRgba(this.rot, this.img.data);
    this.ctx.putImageData(this.img, 0, 0);
    return this.cap.frames[fi];
  }

  /** Everything the page's status line shows.  Read, never computed here. */
  stats() {
    const g = this.game;
    const py = g.ram.u16(RAM.player1 + P.posY);
    const px = g.ram.u16(RAM.player1 + P.posX);
    return {
      logicFrame: g.logicFrame,
      videoFrame: g.videoFrame,
      py, px,
      pyPx: py / 64, pxPx: px / 64,
      tilt: g.ram.u16(RAM.player1 + P.tilt) << 16 >> 16,
      frameCounter: g.ram.u16(RAM.frameCounter),
      logicHz: this.hz,
      capture: this.capFrame,
      unported: g.unportedLog.report(),
    };
  }

  loop(now) {
    if (!this.running) return;
    if (!this.last) this.last = now;
    let dt = now - this.last;
    this.last = now;
    // A tab that was in the background must not run a thousand frames at once.
    // Presentation is dropped; the SIMULATION is never altered.
    if (dt > 200) dt = this.periodMs;
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.periodMs && n < 8) {
      this.acc -= this.periodMs;
      this.step();
      n++;
    }
    if (n) {
      this.capFrame = this.draw();
      if (this.hudAt) {
        this.hz = 1000 * (this.stepsRun - this.hudSteps) / (now - this.hudAt);
      }
      if (!this.hudAt || now - this.hudAt > 500) {
        this.hudAt = now;
        this.hudSteps = this.stepsRun;
      }
    }
  }
}

/**
 * Boot the port onto `canvas`.
 *
 * `opts.onError` IS NOT OPTIONAL in practice, and the comment is here rather
 * than in the page because this is where the throw escapes.  EVERY UNPORTED
 * PATH IN THIS PORT IS A THROW carrying a ROM address, and they are reached in
 * ordinary play -- pressing the fire button reaches one.  Thrown from inside
 * the requestAnimationFrame callback they land where NOTHING is listening:
 * `boot()` resolved long ago, so the page's `await boot(...)` try/catch cannot
 * see them.  The loop simply stops being rescheduled and the canvas holds its
 * last frame.
 *
 * REPORTED FROM PLAY on Gradius as "softlocks and screen freezes", where it was
 * a named throw the whole time and the message was sitting in the console while
 * the page showed a frozen picture and said nothing.  The fix is this
 * parameter plus the try/catch below, and it is copied here deliberately.
 */
export async function boot(canvas, opts = {}) {
  const base = opts.base ?? new URL('../../assets/', import.meta.url);
  const gameJsonUrl = opts.gameJson ?? new URL('../../game.json', import.meta.url);

  const r = await fetch(gameJsonUrl);
  if (!r.ok) throw new AssetError(`game.json: HTTP ${r.status}`);
  const gameJson = await r.json();
  const frameHz = gameJson.display.frameHz;
  // Spelled once, in game.json, DERIVED (15625/264) and not rounded. If the two
  // ever disagree the page is running at a rate the port was not measured at.
  if (Math.abs(frameHz - MACHINE.refreshHz) > 1e-6) {
    throw new AssetError(`game.json says ${frameHz} Hz, the port's machine `
      + `model says ${MACHINE.refreshHz}. One of them is wrong.`);
  }

  const bundle = await loadBundle(httpReader(base, opts.onProgress), opts.bundleOpts);
  const demo = new Demo(canvas, bundle, frameHz);
  attachKeyboard(opts.target);

  const frame = (t) => {
    if (!demo.running) return;
    try {
      demo.loop(t);
    } catch (e) {
      // Stop cleanly rather than throwing once per frame forever, and hand the
      // error somewhere a human can see it. The message names the ROM address,
      // which is the whole point of the throws being loud.
      demo.running = false;
      opts.onError?.(e);
      throw e;                       // keep the console trace intact
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    demo,
    bundle,
    stats: () => demo.stats(),
    stop() { demo.running = false; },
  };
}
