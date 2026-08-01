// THE DEMO PAGE  (wave 6).  Read the banner in index.html before this file.
//
// WHAT IS SIMULATED AND WHAT IS REPLAYED, stated here because a picture cannot
// say it:
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
//     ship come out of `rip/web/capture.bin` -- 161 consecutive frames of the
//     `fly-around` scenario, the same window wave 4 compares.
//
//   SPLICED:  the ship's and the two option pods' display-list records are
//     moved to the PORT's position each frame.  Which records those are was
//     MEASURED, not eyeballed -- `tools/pixpack.mjs` correlates every record's
//     offset from the board's own player position across all 161 frames and
//     accepts only offsets that hold on >=90 % of them.  Result: three offsets
//     at 161/161, at frame lag 1 (the sprite buffer lags main RAM by one frame)
//     and truncating fixed-point conversion; every other lag/conversion
//     combination accepted NOTHING.  The numbers are in `capture.json`.
//
// THE CADENCE IS THE BOARD'S: 15625/264 Hz = 59.185606060606..., frame period
// exactly 16.896 ms.  The host clock decides only HOW MANY logic frames have
// come due, never what any of them computes (`NOTES-replay.md` constraint 1).
// Same input word in, same frame out, on any machine, at any refresh rate.

import { Game, RAM, MACHINE } from '../src/main.js';
import { P } from '../src/machine.js';
import { BIT } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import {
  loadRegions, Renderer, paletteRgb, resolveRgb, rotateCCW, rgbToRgba,
  SCREEN_W, SCREEN_H, IGS023_LAYOUT, SPRCOL_LAYOUT, SPRMASK_LAYOUT,
} from '../src/render/index.js';
import { Capture } from '../src/render/capture.js';

const $ = (id) => document.getElementById(id);
const BASE = new URL('..', import.meta.url);          // games/ddpdoj/

// The fly-around scenario's intervention, applied here for the same reason and
// on the same terms as in the comparison: $810424 is the player record's
// ($3e,A6) invulnerability timer, held at $FF from the seed.  $FF is a value
// the game itself writes at $2495A2; it changes WHETHER the ship dies, not what
// any ported routine computes.  Without it a button-free run of this script
// dies at lf2469 on the board (measured, `scenarios.json`).
const INVULN = 0x810424;

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = +(res.headers.get('content-length') || 0);
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, n);
    n += value.length;
    onProgress?.(n, total);
  }
  return out;
}

/** Keyboard -> the bits of the P1 mirror $803970.  The port WORD is derived
 *  from these by `portWordFromBits`, which is in `src/input.js` next to the
 *  routine it inverts and is unit-tested against the board's measurements. */
const KEYMAP = [
  [['ArrowUp', 'KeyW'], BIT.up], [['ArrowDown', 'KeyS'], BIT.down],
  [['ArrowLeft', 'KeyA'], BIT.left], [['ArrowRight', 'KeyD'], BIT.right],
  [['KeyZ'], BIT.b1], [['KeyX'], BIT.b2], [['KeyC'], BIT.b3],
  [['Enter'], BIT.start],
];

function heldBits(keys) {
  const out = [];
  for (const [codes, bit] of KEYMAP) {
    if (codes.some((c) => keys.has(c))) out.push(bit);
  }
  return out;
}

class Demo {
  constructor(roms, cap, seed, tables) {
    this.roms = roms;
    this.cap = cap;
    this.renderer = new Renderer(roms);
    this.seedLf = cap.frames[0].lf;
    this.game = new Game(seed, tables, {
      logicFrame: this.seedLf,
      videoFrame: cap.frames[0].vf,
    });
    this.keys = new Set();
    this.prevPos = [this.game.ram.u16(RAM.player1 + P.posY),
      this.game.ram.u16(RAM.player1 + P.posX)];

    this.canvas = $('screen');
    this.canvas.width = SCREEN_H;      // TATE: the rotated picture is 224x448
    this.canvas.height = SCREEN_W;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.img = this.ctx.createImageData(SCREEN_H, SCREEN_W);
    this.rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.rot = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    this.pal = new Uint8Array(0x1000 * 3);

    this.acc = 0;
    this.last = 0;
    this.stepsRun = 0;
    this.presentSkips = 0;
    this.hudAt = 0;
  }

  /** ONE LOGIC FRAME of the port.  No pixel work happens in here. */
  step() {
    const g = this.game;
    this.prevPos = [g.ram.u16(RAM.player1 + P.posY), g.ram.u16(RAM.player1 + P.posX)];
    g.ram.setU8(INVULN, 0xff);           // the scenario's intervention
    g.step(portWordFromBits(heldBits(this.keys)));
    this.stepsRun++;
  }

  /** The picture for the port's CURRENT logic frame. */
  draw() {
    const n = this.cap.length;
    const k = (this.game.logicFrame - this.seedLf) % n;
    const fi = k < 0 ? k + n : k;
    const f = this.cap.frames[fi];
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
    return f;
  }

  hud(f, now) {
    const g = this.game;
    const hz = this.hudAt ? (1000 * (this.stepsRun - this.hudSteps)
      / (now - this.hudAt)) : 0;
    this.hudAt = now; this.hudSteps = this.stepsRun;
    const py = g.ram.u16(RAM.player1 + P.posY), px = g.ram.u16(RAM.player1 + P.posX);
    $('hud').innerHTML = [
      `<b>logic</b> ${g.logicFrame}`,
      `<b>video</b> ${g.videoFrame}`,
      `<b>py</b> ${py} <span class=dim>(${(py / 64).toFixed(2)} px)</span>`,
      `<b>px</b> ${px} <span class=dim>(${(px / 64).toFixed(2)} px)</span>`,
      `<b>tilt</b> ${g.ram.u16(RAM.player1 + P.tilt) << 16 >> 16}`,
      `<b>$80390A</b> ${g.ram.u16(RAM.frameCounter)}`,
      `<b>logic Hz</b> ${hz.toFixed(3)}`,
      `<b>capture</b> f${f.vf}/lf${f.lf}`,
    ].join(' &nbsp; ');
  }

  loop(now) {
    if (!this.last) this.last = now;
    let dt = now - this.last;
    this.last = now;
    // A tab that was in the background must not run a thousand frames at once.
    // Presentation is dropped; the SIMULATION is never altered.
    if (dt > 200) { this.presentSkips++; dt = MACHINE.frameNs / 1e6; }
    this.acc += dt;
    const period = MACHINE.frameNs / 1e6;         // 16.896 ms exactly
    let n = 0;
    while (this.acc >= period && n < 8) { this.acc -= period; this.step(); n++; }
    if (n) {
      const f = this.draw();
      this.hud(f, now);
    }
    requestAnimationFrame((t) => this.loop(t));
  }
}

async function boot() {
  const say = (s) => { $('status').textContent = s; };
  try {
    const romBase = new URL('rip/rom/', BASE);
    const need = [...IGS023_LAYOUT, ...SPRCOL_LAYOUT, ...SPRMASK_LAYOUT];
    const files = new Map();
    let done = 0;
    const totalBytes = need.reduce((s, [, , len]) => s + len, 0);
    for (const [name, , len] of need) {
      say(`loading ${name} (${(done / 1048576).toFixed(0)}/`
        + `${(totalBytes / 1048576).toFixed(0)} MiB of cartridge graphics)`);
      files.set(name, await fetchBytes(new URL(name, romBase)));
      done += len;
    }
    say('assembling regions');
    const roms = loadRegions((n) => files.get(n));

    say('loading the board capture');
    const web = new URL('rip/web/', BASE);
    const manifest = await (await fetch(new URL('capture.json', web))).json();
    const capBin = await fetchBytes(new URL('capture.bin', web));
    const seed = await fetchBytes(new URL('seed.bin', web));
    const tables = await (await fetch(new URL('rip/port/player.tables.json', BASE))).json();

    const cap = new Capture(manifest, capBin);
    const demo = new Demo(roms, cap, seed, tables);
    const sc = manifest.shipCorrelation;
    $('provenance').textContent =
      `capture: ${manifest.frames} frames of '${manifest.scenario}' from `
      + `lf${manifest.seedLf}; ship records identified at lag ${sc.lag}, `
      + `conversion ${sc.conversion}, offsets `
      + sc.accepted.map((e) => `(${e.off})x${e.hits}`).join(' ')
      + ` of ${manifest.frames} frames`;
    say('');
    $('overlay').hidden = true;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') return;
      demo.keys.add(e.code); e.preventDefault();
    });
    addEventListener('keyup', (e) => { demo.keys.delete(e.code); });
    addEventListener('blur', () => demo.keys.clear());
    requestAnimationFrame((t) => demo.loop(t));
  } catch (e) {
    $('overlay').hidden = false;
    say('');
    $('err').textContent = String(e.stack || e);
  }
}

boot();
