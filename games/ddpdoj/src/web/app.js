// THE PAGE.  (wave 7; the wave-6 `web/app.js` moved here so `build-dist.mjs`
// publishes it -- that script copies `games/<id>/src`, and a module under
// `web/` would have been left behind, which is a black page and no message.)
//
// WHAT IS SIMULATED AND WHAT IS REPLAYED, stated here because a picture cannot
// say it, and printed on the page itself because a reader will not open this
// file.  WAVE 9 CORRECTED THIS LIST: it used to say "options" under SIMULATED
// and it was not true (07-review.md D1, and a play report that saw the two pods
// detach as a cluster).  If you change what the page shows, change this list in
// the same commit; a stale note here has misled somebody every time.
//
//   SIMULATED, live, from the port's own code:  the seven-call main loop, the
//     frame counters and their three masks, the ISR model and its (A) gate, the
//     input mirrors and edges, the frame-sync governor, the object driver with
//     its work budget, and THE SHIP -- position, velocity, tilt, clamps and
//     speed modes.  That is wave 4's port; wave 12 added THE OPTION OBJECT
//     $24C096 and the ship's own draw block $24A482, so the two pods and the
//     ship's five attached records are computed too.  MEASURED: 0 divergent
//     frames over 2,200 logic frames of `fly-around` on 66 compared columns --
//     `OPTION_COLUMNS` among them, which wave 4 had to exclude and said so.
//     The four hitbox words $8103F6..$8103FD are compared for the first time
//     as well; the port had been writing them under the name `animB` since
//     wave 4, believing they were animation.
//
//     ONE COLUMN IS STILL RED AND IT IS NOT THIS WAVE'S: `scroll` ($813176)
//     diverges at lf2321 because its writer is inside the unported background
//     object -- verified pre-existing by 11-review.md §4b, and W14's.
//
//   REPLAYED, from a board capture:  everything else in the picture.  The port
//     does not build the display list (main-loop call #4, $23D2AE, is unported)
//     and 18 of the 20 top-level object handlers are unported, so the
//     background, the enemies, the HUD text and every sprite that is not the
//     player's come out of `assets/capture.bin` -- 161 consecutive frames of
//     the `fly-around` scenario, the same window wave 4 compares -- and loop.
//     The enemies are pixels: they do not see the ship and cannot be hit.
//
//   PRODUCED (wave 12), and written into the replayed list:  EIGHT display-list
//     records are now COMPUTED every frame rather than relocated -- the ship
//     ($24A538), its invulnerability aura ($24A532), its exhaust glow
//     ($24A632, which goes through the $500000 protection latch), the two
//     option pods ($24D12E x2 out of $24C096) and the three ground shadows
//     ($249EE2 for the ship, $24C438/$24C470 for the pods).  Every byte of all
//     eight is gated by `pgm.py shipgate` against the board's own staged bucket
//     bytes AND against the display-list entries they become: 0 divergent
//     frames over 2,200 logic frames of `fly-around`, with ten red-validated
//     mutations.  THE SHIP BANKS: `manifest.ship.pairs` is the 17 rebased
//     animation pairs the exporter now emits, 16 of which are not in the
//     capture at all because the recorded ship never tilted.
//
//     WHAT THE RECORDING STILL SUPPLIES FOR THEM is WHICH SLOT each occupies.
//     That is not a property of the ship: the port cannot build the whole list
//     until the other 26 buckets have producers, so its records are written
//     into the recorded one at the slots the wave-9 conditional matcher finds.
//
//   NOT THERE AT ALL:  enemies as SIMULATION, any DRAWN weapon, and sound.
//     Pressing fire runs the ported cadence machine ($249B2C..$249BE2) and the
//     ported spawn and driver, but no shot sprite stream is in the bundle, so
//     what the port computes is INVISIBLE.  The bomb ($249814) and HOLDING fire
//     reach loud named throws.  WAVE 12 MOVED THE HELD-FIRE THROW to the board's
//     own gate: $24C164 `btst #4,($40,A6)`, on the RAW HELD byte $24C134 copies
//     out of the player, entered on the FIRST held frame with no speed-index
//     condition.  Wave 9's throw fired on the fourth held frame and only when
//     the ship was OFF its speed floor, so a player already at the floor held
//     fire and still got silence -- the exact failure it existed to prevent.
//     Those throws are the reason `onError` below is not optional.
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

// --------------------------------------------------------------- PRESENTATION
//
// THE CABINET IS TATE.  MAME's driver declares the screen `rotate="270"` on the
// 448x224 buffer, so the correct picture is 224 WIDE by 448 TALL and the long
// axis of the game is the bitmap's X.
//
// THE ROTATION HAPPENS IN THE PIXEL BUFFER, NOT IN CSS, AND THAT IS THE WHOLE
// TRICK FOR KEEPING THE SCALE INTEGER.  `rotateCCW` writes a 224x448 RGB buffer
// and the canvas's backing store IS 224x448, so the canvas's CSS box is a plain
// axis-aligned rectangle that `fitCanvas` sizes to an exact whole multiple of
// 224x448 in DEVICE pixels.  A `transform: rotate(90deg)` would have put the
// browser's own resampler between the port and the glass -- the transform's
// output box is not the element's layout box, so "the layout box is an integer
// multiple" stops being the same statement as "the painted pixels land on whole
// device pixels", and any transform-origin or sub-pixel offset reintroduces the
// resample.  There is NO transform on the canvas.  Do not add one.
//
// TWO MODES, and only two:
//   tate  224x448, `rotateCCW` applied.  The correct presentation.  DEFAULT.
//   yoko  448x224, the raw board buffer, unrotated.  Offered because a desktop
//         window is wide, and because it is what the gates' PNGs show before
//         `np.rot90`.  It is the game lying on its side; it is a preference,
//         not a correction.
//
// The mode is NOT switched automatically on orientationchange.  A phone tilted
// in a hand would otherwise change what the picture means mid-play, and the two
// modes are different pictures, not two layouts of one.
export const PICTURES = Object.freeze({
  tate: Object.freeze({ w: SCREEN_H, h: SCREEN_W, rotate: true }),
  yoko: Object.freeze({ w: SCREEN_W, h: SCREEN_H, rotate: false }),
});
export const DEFAULT_MODE = 'tate';
export const MODES = Object.freeze(Object.keys(PICTURES));

/** Back-compat: the TATE picture's dimensions, which is what the page had. */
export const CANVAS_W = PICTURES.tate.w, CANVAS_H = PICTURES.tate.h;

// The fly-around scenario's intervention, applied here on the same terms as in
// the comparison: $810424 is the player record's ($3e,A6) invulnerability
// timer, held at $FF from the seed.  $FF is a value the game itself writes at
// $2495A2; it changes WHETHER the ship dies, not what any ported routine
// computes.  Without it a button-free run of this script dies at lf2469 on the
// board (measured, `scenarios.json`).
const INVULN = 0x810424;

/**
 * PURE.  The largest whole scale in DEVICE pixels, for either picture.
 *
 * `image-rendering: pixelated` AND a whole-number scale.  Both are needed: a
 * fractional scale puts the canvas's 1:1 pixels on non-integer device pixels
 * and the browser resamples them.  The Batman port shipped a dithered circle
 * that came out looking like tetris pieces because of exactly this, and it was
 * reported from play.  So this FLOORS -- do not "fix" it into a percentage.
 *
 * It is a separate exported function from `fitCanvas` so it can be TESTED: this
 * is the one piece of the page's layout that is arithmetic rather than CSS, and
 * `tests/web-scale.test.js` drives it at nine device-pixel ratios in both
 * orientations.  The CSS box it returns is `device / dpr`, which is what puts
 * the picture back on whole device pixels; the test asserts the round trip.
 *
 * @param {{w:number,h:number}} pic  PICTURES.tate or PICTURES.yoko
 * @param availCssW,availCssH  the container's size in CSS pixels
 */
export function pickScale(pic, availCssW, availCssH, dpr = 1) {
  const d = dpr > 0 ? dpr : 1;
  const availW = Math.max(0, availCssW) * d;
  const availH = Math.max(0, availCssH) * d;
  // Math.max(1, ...) so a viewport too small for even 1:1 shows 1:1 and
  // overflows rather than showing a resampled sub-pixel picture.
  const scale = Math.max(1, Math.floor(Math.min(availW / pic.w, availH / pic.h)));
  const deviceW = pic.w * scale, deviceH = pic.h * scale;
  return { scale, deviceW, deviceH, cssW: deviceW / d, cssH: deviceH / d };
}

/**
 * Size `canvas` inside `container` for `mode`.  Returns the `pickScale` result.
 *
 * The canvas's BACKING STORE is set by `Demo.setMode`, not here -- this only
 * decides the CSS box.  No transform is ever applied (see PRESENTATION above).
 */
export function fitCanvas(canvas, container = canvas.parentElement,
  mode = DEFAULT_MODE) {
  const pic = PICTURES[mode] ?? PICTURES[DEFAULT_MODE];
  const dpr = window.devicePixelRatio || 1;
  const fit = pickScale(pic,
    container?.clientWidth || window.innerWidth,
    container?.clientHeight || window.innerHeight, dpr);
  canvas.style.width = `${fit.cssW}px`;
  canvas.style.height = `${fit.cssH}px`;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.transform = 'none';        // belt and braces: never a CSS rotate
  canvas.dataset.scale = String(fit.scale);
  canvas.dataset.mode = mode;
  return fit;
}

class Demo {
  constructor(canvas, bundle, frameHz, mode = DEFAULT_MODE) {
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
    this.prevTilt = this.game.ram.u16(RAM.player1 + P.tilt) << 16 >> 16;
    this.prevPos = [this.game.ram.u16(RAM.player1 + P.posY),
      this.game.ram.u16(RAM.player1 + P.posX)];

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.rot = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.pal = new Uint8Array(0x1000 * 3);
    this.mode = null;
    this.setMode(mode);

    this.periodMs = 1000 / frameHz;
    this.acc = 0;
    this.last = 0;
    this.stepsRun = 0;
    this.hudAt = 0;
    this.hudSteps = 0;
    this.hz = 0;
    this.running = true;
  }

  /**
   * Switch presentation.  This RESIZES THE BACKING STORE, which is the reason
   * the rotation never needs a CSS transform: the canvas is 224x448 in tate and
   * 448x224 in yoko, and `fitCanvas` then multiplies whichever it is by a whole
   * number.  Resizing a canvas clears it, so the next `draw()` repaints; the
   * SIMULATION is untouched, which is the point -- the mode changes the picture
   * and never a logic frame.
   */
  setMode(mode) {
    const name = PICTURES[mode] ? mode : DEFAULT_MODE;
    if (name === this.mode) return name;
    const pic = PICTURES[name];
    this.mode = name;
    this.canvas.width = pic.w;
    this.canvas.height = pic.h;
    this.img = this.ctx.createImageData(pic.w, pic.h);
    this.dirty = true;
    return name;
  }

  /** ONE LOGIC FRAME of the port.  No pixel work happens in here. */
  step() {
    const g = this.game;
    this.prevPos = [g.ram.u16(RAM.player1 + P.posY), g.ram.u16(RAM.player1 + P.posX)];
    this.prevTilt = g.ram.u16(RAM.player1 + P.tilt) << 16 >> 16;   // ($4e,A6)
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
    //
    // WAVE 9: this now moves EIGHT records, not three -- the ship, two option
    // pods, two exhaust records and three ground shadows.  See
    // `render/capture.js`'s header for the conditional matcher that finds them
    // and `tools/attachreport.mjs` for what it rejected.
    // WAVE 12: the tilt and the 17 REBASED animation pairs now go in with the
    // position, so the ship BANKS.  `prevTilt`, not the current one, for the
    // same measured reason the position is one frame behind: the sprite buffer
    // lags main RAM by one frame.
    this.spliced = this.cap.splice(st, fi, this.prevPos[0], this.prevPos[1],
      { tilt: this.prevTilt, ship: this.bundle.manifest.ship ?? null });
    const idx = this.renderer.renderIndexed(st);
    // The palette that applies is the NEXT frame's -- the measured sample-point
    // offset (00-recon-assets.md §4).  On a looping capture the next frame is
    // the next captured one.
    paletteRgb(this.cap.part((fi + 1) % n, 'palette'), this.pal);
    resolveRgb(idx, this.pal, this.rgb);
    // TATE rotates the BUFFER; yoko blits the board's own 448x224 buffer.
    // Either way the canvas backing store already matches (`setMode`).
    if (PICTURES[this.mode].rotate) {
      rotateCCW(this.rgb, SCREEN_W, SCREEN_H, this.rot);
      rgbToRgba(this.rot, this.img.data);
    } else {
      rgbToRgba(this.rgb, this.img.data);
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
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
      mode: this.mode,
      spliced: this.spliced,
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
    if (n || this.dirty) {
      // `dirty` is set by setMode: resizing the backing store blanks it, and a
      // mode change between two logic frames would otherwise leave a black
      // canvas until the next one came due.
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
 * ordinary play -- the bomb reaches one, and so does HOLDING fire.  Thrown from inside
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
  const demo = new Demo(canvas, bundle, frameHz, opts.mode ?? DEFAULT_MODE);
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
    get mode() { return demo.mode; },
    setMode: (m) => demo.setMode(m),
    stop() { demo.running = false; },
  };
}
