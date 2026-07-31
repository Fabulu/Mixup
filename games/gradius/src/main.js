// Boot, and the clock that drives the NMI.
//
// There is no game loop in the cartridge -- src/nmi.js is the whole of it -- so
// everything here is host plumbing: load the assets, put the machine into the
// state the stage-1 play path starts from, and call nmi() at the NES's frame
// rate.

import { createState, MODE_STAGE } from './state.js';
import { attachInput, currentButtons } from './input.js';
import { loadResources, loadGameJson, gameplayPalette } from './assets.js';
import { nmi } from './nmi.js';
import { preloadTerrain } from './terrain.js';
import { drainQueue } from './vram.js';
import { renderFrame, frameFor, W, H, chrBank } from './render/ppu.js';

/**
 * The state the mode-5 play path starts from.
 *
 * These are the values the oracle READ at a stage-1 gameplay frame, not
 * defaults chosen to look right:
 *   $0360 = 80, $0320 = 96   the ship's start position (f400 and f1200 agree)
 *   $0100 = 1                alive
 *   $0120 = 1                metasprite id 1, the level ship
 *   $2D   = 0  -> CHR bank 0 (mode 4/5 on 3,919 of 4,200 census frames)
 *   $13   = 12               scroll Y during stage 1, set at $9650
 *   $10   = $A8              NT $2000, bg pat $0000, spr pat $1000, 8x16
 *   $11   = $1E              bg + sprites on, leftmost 8 px shown
 *   $35   = 20               autofire reload
 *   $20   = 3                lives (both players' bytes; $18 = 0 selects P1)
 *   $48   = $2E              the HUD rotation phase. $2E AND 3 = 2, so the
 *                            first tick after the align frame ran st_89E3 --
 *                            and the cartridge's $0E at that sample point is
 *                            $28 = 40, i.e. st_89E3's 39 bytes plus $8641's
 *                            one. Cross-checked before a line of src/hud.js
 *                            was written.
 *   $07E0-$07E2 = 00 50 00   TOP score, the 50000 the attract mode leaves
 *   $07E4-$07EA = 0          both players' scores
 *   $42 = 0, $46 = 0         no capsule collected, no shield
 *
 * What is NOT modelled, and it is a real difference: the ROM spends 28 frames
 * in the stage-intro sub-state before any of this is live ($1B stepping
 * 1,2,3,4 then $80), and $8871 pushes a full-screen image at the stage load.
 * Neither has been reversed, so this port starts at $1B = $80 with an empty
 * nametable and lets the streamer fill it (see preloadTerrain).
 */
export function bootState(manifest) {
  const s = createState();
  s.mode = MODE_STAGE;
  s.substate = 0x80;
  s.obj.x[0] = 80;                 // $0360
  s.obj.y[0] = 96;                 // $0320
  s.obj.status[0] = 1;             // $0100
  s.obj.anim[0] = 1;               // $0120, metasprite id 1
  s.ring.x.fill(80);               // the ring is seeded from the ship, so the
  s.ring.y.fill(96);               // Options do not start at (0,0)
  s.obj.x[1] = s.obj.x[2] = 80;
  s.obj.y[1] = s.obj.y[2] = 96;
  s.ppu.ctrl = 0xA8;               // $10
  s.ppu.mask = 0x1E;               // $11
  s.ppu.scrollY = 0x0C;            // $13  -- $9650
  s.ppu.chrSel = 0;                // $2D
  // The HUD producers' inputs. Read off the cartridge at align frame 400 of
  // every scenario in the corpus and identical in all 17 -- see the SEEDED
  // INPUTS note in src/state.js for what that does and does not prove.
  s.lives[0] = s.lives[1] = 3;     // $20/$21
  s.zp48 = 0x2E;                   // $48
  s.score[0x00] = 0x00;            // $07E0  \
  s.score[0x01] = 0x50;            // $07E1   > TOP = 50000
  s.score[0x02] = 0x00;            // $07E2  /
  s.vram.pal.set(gameplayPalette(manifest));
  s.bandA.chrBank = chrBank(0);
  s.bandB.chrBank = chrBank(2);
  return s;
}

export async function boot(canvas, opts = {}) {
  const [game, res] = await Promise.all([loadGameJson(), loadResources(0)]);
  const state = bootState(res.manifest);

  // The port's stand-in for the stage load. Loudly not a translation -- see
  // terrain.js. Without it the first ~84 frames show an empty starfield while
  // the streamer's 384 px lead builds up from nothing.
  preloadTerrain(state, res.stage, drainQueue);
  drainQueue(state);

  attachInput(opts.target);

  const ctx = canvas.getContext('2d', { alpha: false });
  const img = ctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);

  // FRAME RATE COMES FROM game.json. It is spelled once, there, and is derived
  // rather than rounded: 60.098814 Hz is NTSC PPU 5369318.18 / 89341.5, the
  // half-cycle being the dot skipped on the pre-render line of odd frames.
  const period = 1000 / game.display.frameHz;

  let acc = 0, last = performance.now(), running = true;
  function tick(now) {
    if (!running) return;
    // Catch up in whole frames, but never run away: a backgrounded tab hands
    // back a delta of minutes, and simulating those is both pointless and slow.
    acc = Math.min(acc + (now - last), period * 8);
    last = now;
    let stepped = false;
    while (acc >= period) {
      acc -= period;
      nmi(state, currentButtons(), res);
      stepped = true;
    }
    if (stepped) {
      renderFrame(frameFor(state), res.tiles, px);
      ctx.putImageData(img, 0, 0);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return { state, res, stop() { running = false; } };
}

/**
 * Integer device-pixel scaling.
 *
 * NOT a CSS percentage. On the Batman port a fractional scale put the canvas's
 * 1:1 pixels on non-integer device pixels and the browser resampled them --
 * a dithered circle came out looking like tetris pieces. The fix is to size the
 * element to an integer multiple of 256x240 DEVICE pixels and let it letterbox.
 */
export function fitCanvas(canvas, container = canvas.parentElement) {
  const dpr = window.devicePixelRatio || 1;
  const availW = container.clientWidth * dpr;
  const availH = container.clientHeight * dpr;
  const scale = Math.max(1, Math.floor(Math.min(availW / W, availH / H)));
  canvas.style.width = `${(W * scale) / dpr}px`;
  canvas.style.height = `${(H * scale) / dpr}px`;
  canvas.style.imageRendering = 'pixelated';
  return scale;
}
