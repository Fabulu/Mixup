// Drive the REAL game -- src/main.js's boot() and its rAF frame loop -- with no
// browser, and hand back the pixels it actually put on the canvas.
//
// WHY THIS EXISTS.  Every gameplay harness in this tree (trace.py's twin
// render-frame.mjs, pixeldiff.mjs, regress.mjs) calls `tick()` directly and
// starts from `initLevel(state, N)`.  That is the whole game EXCEPT its
// skeleton: the title screen, round select, the stage-intro card, the level
// hand-off arms, the death handoff, the game-over reset and the ending all live
// in boot()'s step(), and NOTHING has ever driven them frame by frame.  Both of
// the last two real bugs in this project were invisible to memory comparison
// and only showed when someone rendered a picture; this makes that cheap for
// the parts of the game a `tick()` loop cannot reach at all.
//
// The pixels come out of the canvas shim's putImageData -- i.e. literally the
// bytes the browser would have blitted -- not out of a framebuffer we rendered
// ourselves on the side.  Time is a controlled clock advancing exactly one
// FRAME_MS per rAF callback, so the fixed-timestep accumulator in step() runs
// exactly one logic tick per displayed frame and the run is deterministic.
//
// Input goes in through src/input.js's own setTouchButton(), so sampleInput()
// -- which step() calls -- is the real one, with the real pressed/held edge
// detection.  Writing state.input directly would bypass it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, gamePath, installFetchShim } from './_env.mjs';
export { ROOT };

export const FRAME_MS = 1000 / 59.73;      // must match src/main.js

// ---------------------------------------------------------------- DOM shims

const listeners = new Map();
function fakeTarget() {
  return {
    addEventListener(t, f) { (listeners.get(t) ?? listeners.set(t, []).get(t)).push(f); },
    removeEventListener() {},
  };
}

let CLOCK = 0;
let RAF = [];

// The frame recorder the OFFSCREEN canvas writes into.  boot() no longer
// putImageData's straight onto the canvas it was handed: c7a1e22 moved the
// integer upscale inside the game, so the pixels now go
//   image -> srcCtx.putImageData -> ctx.drawImage(src, ..., W*scale, H*scale)
// where `src` comes from document.createElement('canvas').  The recorder
// therefore has to live on the offscreen half, and this module-level handle is
// how createElement -- which is global and installed once -- reaches the
// per-boot recorder made by fakeCanvas().
let RECORDER = null;

function installShims() {
  if (globalThis.__romHeadlessInstalled) return;
  globalThis.__romHeadlessInstalled = true;

  installFetchShim();

  const win = {
    addEventListener() {}, removeEventListener() {},
    // No AudioContext on purpose: Sound.start() returns false and the game
    // runs silent.  The sound driver is proved bit-exact by sounddiff.mjs;
    // this harness is about the picture.
  };
  globalThis.window = win;
  globalThis.document = {
    addEventListener() {}, hidden: false,
    // src/main.js:112 builds a 160x144 offscreen canvas and blits THROUGH it.
    // Without this, boot() threw `document.createElement is not a function`
    // before its first frame and every consumer of bootHeadless was dead --
    // which was invisible because the only one, tools/oracle/flowpix.mjs, is
    // not a test-all stage.  See the note above RECORDER.
    createElement: (tag) => {
      if (String(tag).toLowerCase() !== 'canvas') {
        throw new Error(`headless shim: document.createElement('${tag}')`);
      }
      return offscreenCanvas();
    },
  };
  globalThis.performance = { now: () => CLOCK };
  globalThis.requestAnimationFrame = (cb) => { RAF.push(cb); return RAF.length; };
  globalThis.cancelAnimationFrame = () => {};
}

/** The offscreen 160x144 canvas src/main.js draws the framebuffer into. */
function offscreenCanvas() {
  return {
    width: 160, height: 144,
    getContext() {
      return {
        imageSmoothingEnabled: false,
        createImageData: (w, h) => ({ width: w, height: h,
                                      data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img) => {
          if (RECORDER) { RECORDER.data = img.data; RECORDER.n++; }
        },
      };
    },
  };
}

/** A 2D canvas that keeps the last blitted frame. */
function fakeCanvas() {
  const W = 160, H = 144;
  const last = { data: null, n: 0 };
  const canvas = {
    width: W, height: H,
    // backingScale() reads `canvas.dataset.scale` and clamps it; the page sets
    // it from the fitted CSS size.  An empty dataset is the "page asked for
    // nothing" case, which clamps to scale 1 -- so the drawImage below is a
    // 1:1 blit and the recorded pixels are the framebuffer's own.
    dataset: {},
    getContext() {
      return {
        imageSmoothingEnabled: false,
        createImageData: (w, h) => ({ width: w, height: h,
                                      data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img) => { last.data = img.data; last.n++; },
        // The upscale blit.  At scale 1 it copies the offscreen canvas
        // unchanged, and the offscreen putImageData above has already recorded
        // exactly those bytes, so there is nothing left to do here.
        drawImage() {},
      };
    },
  };
  return { canvas, last };
}

// -------------------------------------------------------------- the driver

const SHADE_OF_RGB = new Map();   // packed RGB -> shade

/** Button masks, matching src/input.js's BTN. */
export const BTN = { A: 0x01, B: 0x02, SELECT: 0x04, START: 0x08,
                     RIGHT: 0x10, LEFT: 0x20, UP: 0x40, DOWN: 0x80 };

/**
 * Expand a trace.py-style script -- "20:,180:R" -- into a per-frame mask.
 * Same grammar the rest of the oracle uses, so scenarios stay comparable.
 */
export function expand(script) {
  const out = [];
  for (const seg of String(script).split(',')) {
    const [n, keys = ''] = seg.split(':');
    let m = 0;
    for (const k of keys.trim()) {
      const b = BTN[k.toUpperCase()] ?? ({ R: BTN.RIGHT, L: BTN.LEFT,
        U: BTN.UP, D: BTN.DOWN, S: BTN.START, E: BTN.SELECT }[k.toUpperCase()]);
      m |= b || 0;
    }
    for (let i = 0; i < parseInt(n, 10); i++) out.push(m);
  }
  return out;
}

/**
 * Boot the game headlessly.
 *
 * @returns {Promise<{state, frame, shades, run, screen, stop}>}
 *   frame(mask)  -- advance exactly one DISPLAYED frame with `mask` held.
 *   shades()     -- the 160x144 shade buffer of the last blitted frame.
 *   screen()     -- a one-line name for whichever screen is up.
 */
export async function bootHeadless(opts = {}) {
  installShims();
  const { canvas, last } = fakeCanvas();
  RECORDER = last;                 // the offscreen canvas records into this run

  const main = await import(pathToFileURL(gamePath('src/main.js')).href);
  const input = await import(pathToFileURL(gamePath('src/input.js')).href);
  const R = await import(pathToFileURL(gamePath('src/render/renderer.js')).href);

  if (!SHADE_OF_RGB.size) {
    R.DMG_PALETTE.forEach((c, i) =>
      SHADE_OF_RGB.set((c[0] << 16) | (c[1] << 8) | c[2], i));
  }

  CLOCK = 0;
  RAF = [];
  const handle = await main.boot(canvas, opts);

  let held = 0;
  const setMask = (mask) => {
    for (const b of Object.values(BTN)) {
      if (((mask ^ held) & b) !== 0) input.setTouchButton(b, (mask & b) !== 0);
    }
    held = mask;
  };

  const settle = () => new Promise((r) => setTimeout(r, 0));

  let displayed = 0;
  async function frame(mask = 0) {
    setMask(mask);
    // An async screen swap (initLevel, loadRoundSelect) returns from step()
    // WITHOUT queueing another rAF; resume() re-queues it once the promise
    // lands.  So drain the microtask/macrotask queue until the loop is armed
    // again -- that wait IS the loading screen, and it costs no game frames.
    for (let spin = 0; RAF.length === 0; spin++) {
      if (spin > 4000) throw new Error('frame loop stalled: no rAF queued');
      await settle();
    }
    const cbs = RAF; RAF = [];
    CLOCK += FRAME_MS;
    const before = last.n;
    for (const cb of cbs) cb(CLOCK);
    await settle();
    displayed++;
    return last.n > before;          // false: this frame swapped a screen
  }

  function shades() {
    const d = last.data;
    if (!d) return null;
    const out = new Uint8Array(160 * 144);
    for (let i = 0; i < out.length; i++) {
      const o = i * 4;
      const s = SHADE_OF_RGB.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
      if (s === undefined) throw new Error('canvas colour outside the DMG palette');
      out[i] = s;
    }
    return out;
  }

  const state = handle.state;
  function screen() {
    if (state.copyright) return 'copyright';
    if (state.title) return 'title';
    if (state.options) return 'options';
    if (state.roundSelect) return 'roundselect';
    if (state.stageIntro) return 'stageintro';
    if (state.ending) return 'ending';
    return `level${state.level.number}`;
  }

  /** Run a script, calling `onFrame(i, screen)` after each displayed frame. */
  async function run(script, onFrame) {
    const tl = typeof script === 'string' ? expand(script) : script;
    for (let i = 0; i < tl.length; i++) {
      await frame(tl[i]);
      if (onFrame) {
        const r = await onFrame(i + 1, screen());
        if (r === 'stop') return i + 1;
      }
    }
    return tl.length;
  }

  return { state, handle, frame, shades, screen, run,
           get displayed() { return displayed; },
           stop() { handle.stop(); } };
}

// ------------------------------------------------------------- diff helpers

export const W = 160, H = 144, TOTAL = W * H;

/** Wrong-pixel count plus the six worst rows, the pixeldiff.mjs shape. */
export function diff(a, b) {
  let bad = 0;
  const perRow = new Int32Array(H);
  for (let i = 0; i < TOTAL; i++) if (a[i] !== b[i]) { bad++; perRow[(i / W) | 0]++; }
  const worst = [...perRow].map((v, y) => [y, v]).filter((r) => r[1])
    .sort((x, y) => y[1] - x[1]).slice(0, 6);
  return { bad, pct: (TOTAL - bad) / TOTAL, worst };
}

/** A shade histogram -- how much of the screen is each of the four shades. */
export function histogram(sh) {
  const h = [0, 0, 0, 0];
  for (let i = 0; i < sh.length; i++) h[sh[i]]++;
  return h;
}

/** Render a frame to a PGM so a human can actually look at it. */
export function writePGM(file, sh) {
  const head = Buffer.from(`P5\n${W} ${H}\n255\n`, 'ascii');
  const px = Buffer.alloc(TOTAL);
  const lum = [0xE0, 0xA0, 0x50, 0x08];
  for (let i = 0; i < TOTAL; i++) px[i] = lum[sh[i]];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([head, px]));
}

/** ASCII thumbnail, 40x36, for terminal output. */
export function thumb(sh) {
  const ch = ' .:#';
  const rows = [];
  for (let y = 0; y < H; y += 4) {
    let s = '';
    for (let x = 0; x < W; x += 4) s += ch[sh[y * W + x]];
    rows.push(s);
  }
  return rows.join('\n');
}
