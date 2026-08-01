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
 * THE INTRO IS NOT MISSING ANY MORE and this function is no longer how the
 * game starts -- `introEntryState()` below is, and it runs the cartridge's own
 * $9B3E to produce the position, the rings, $0100 and $0120 rather than
 * asserting them. What is left here is the SEED the unit suite uses: the state
 * the cartridge is measured to be in at align frame 400, which is 90 frames of
 * play after the intro ended and so is not the intro's output ($48 = $2E, the
 * camera moved on, the queue phase is mid-rotation).
 *
 * tests/flow.test.js holds the two against each other: running the intro from
 * introEntryState() must produce this function's position, ring, $0100, $0120,
 * $35 and camera. That turns the constants below from claims into a check.
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
  // every scenario in the corpus and identical in all 28 -- see the SEEDED
  // INPUTS note in src/state.js for what that does and does not prove.
  s.lives[0] = s.lives[1] = 3;     // $20/$21
  s.zp0A = 1;                      // $0A -- player 1 in, player 2 out. Read by
                                   // $97C7's respawn switch; MEASURED 1 in the
                                   // seed of all 28 scenarios.
  s.zp48 = 0x2E;                   // $48
  s.score[0x00] = 0x00;            // $07E0  \
  s.score[0x01] = 0x50;            // $07E1   > TOP = 50000
  s.score[0x02] = 0x00;            // $07E2  /
  // $2A,X -- the score at which the next extra life is granted ($84D9 CMP
  // $2A,X). MEASURED $02 in the seed of all 28 scenarios; src/score.js reads it
  // and $84EE writes it back, the first time a score reaches $02xxxx.
  s.extraLife[0] = s.extraLife[1] = 0x02;
  s.vram.pal.set(gameplayPalette(manifest));
  s.bandA.chrBank = chrBank(0);
  s.bandB.chrBank = chrBank(2);
  return s;
}

/**
 * The state mode 4 hands mode 5, i.e. what the cartridge has at the $80B5 of
 * game frame 282 on the standard boot.
 *
 * `$8165` is the whole of mode 4 -- `LDA #$00 / STA $1B / INC $00`, three
 * instructions -- so entering mode 5 with $1B = 0 is the cartridge's own
 * handover and the intro does the rest. Everything $9B3E computes is left OUT
 * of this function on purpose: the ship's position, both rings, $0100, $0120,
 * $35, $3F, $55 and the whole $3D-$97 zero page are the intro's output, not
 * boot constants.
 *
 * What IS here is the state $9B3E READS and mode 5 never writes: the lives and
 * scores the title/attract path left ($20 = 3, TOP = 50000), and the four saved
 * per-player bytes $22/$24/$26/$28, which are 0 at the first stage because
 * $82C7 cleared RAM and only $979D (wave 5) ever writes them.
 */
export function introEntryState(manifest) {
  const s = createState();
  s.mode = MODE_STAGE;             // $00 -- $8167 INC $00 from mode 4
  s.substate = 0;                  // $1B -- $8165 LDA #$00 / STA $1B
  s.ppu.chrSel = 0;                // $2D
  s.lives[0] = s.lives[1] = 3;     // $20/$21
  s.zp0A = 1;                      // $0A -- see bootState()
  s.score[0x00] = 0x00;            // $07E0  \
  s.score[0x01] = 0x50;            // $07E1   > TOP = 50000, left by the attract
  s.score[0x02] = 0x00;            // $07E2  /
  s.extraLife[0] = s.extraLife[1] = 0x02;   // $2A,X -- see bootState()
  // $22/$24/$26/$28 stay 0: stage 0, checkpoint 0, no meter to restore.
  s.vram.pal.set(gameplayPalette(manifest));
  s.bandA.chrBank = chrBank(0);
  s.bandB.chrBank = chrBank(2);
  return s;
}

export async function boot(canvas, opts = {}) {
  const [game, res] = await Promise.all([loadGameJson(), loadResources(0)]);
  // THE REAL STAGE INTRO, not a stand-in. preloadTerrain() used to run the
  // streamer's gate to exhaustion here; the port now enters mode 5 at $1B = 0
  // and plays out $9B3E, $9BF0, $9C12, $9C1E and $9C24's 84 blocks over the
  // cartridge's own 27 frames, with the screen blanked by $0D throughout.
  const state = introEntryState(res.manifest);

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
    // EVERY UNPORTED PATH IN THIS PORT IS A THROW, and they are reached in
    // ordinary play, not just in exotic states. Thrown from inside tick() they
    // escape into requestAnimationFrame's callback, where NOTHING is listening:
    // boot() resolved long ago, so the page's `await boot(canvas)` try/catch
    // cannot see them. The loop simply stops being rescheduled and the canvas
    // holds its last frame.
    //
    // REPORTED FROM PLAY as "softlocks and screen freezes" after 10-30 seconds
    // of flying around. It was a named throw the whole time -- $BC59's enemy
    // bullet allocator -- and the message was sitting in the console while the
    // page showed a frozen picture and said nothing.
    //
    // This is the SAME defect Batman's launcher already carries a comment
    // about: an async failure after boot() resolves "used to leave the frame
    // loop dead with the music still playing, and nothing on screen said so."
    // That fix never crossed over to this page. It does now.
    //
    // WAVE 12 PUT A NUMBER ON "reached in ordinary play". An exec hook on every
    // ROM address a throw in src/ names, over 27,400 cartridge frames of seven
    // scripts (tools/oracle/throwaudit.py), found FIFTEEN reachable ones. The
    // two nearest the front are $B6E1, first executed at game frame 2490 --
    // about 40 seconds in -- and GAME OVER ($96FB, 794 executions from frame
    // 3380), which needs nothing but losing three lives. So this catch is not
    // belt-and-braces for an unlikely state; it is the normal exit of a play
    // session. The ranked table is in
    // docs/worklog/gradius/12-impl-spawn-and-throw-audit.md.
    try {
      let stepped = false;
      while (acc >= period) {
        acc -= period;
        nmi(state, currentButtons(), res);
        // ---- WAVE 13: ONE AUDIO BATCH PER LOGIC FRAME ----------------------
        // Inside the catch-up loop, not after it, and that is the whole design.
        // `state.apuLog` is this frame's $4000-$400F writes and src/nmi.js
        // clears it at the top of the NEXT frame, so a burst of k frames must
        // hand over k batches here or k-1 frames of music are lost. What the
        // audio path then does with them is its own business and runs on the
        // AudioContext's clock, never on this one (src/audio/output.js).
        //
        // NOTE FOR WAVE 14, which owns the input side of this same loop:
        // `currentButtons()` above is still read k times per callback and all k
        // reads return the same word, which is
        // docs/worklog/gradius/13-FINDING-input-granularity-under-load.md. The
        // fix has the same shape as this line -- one input word per LOGIC
        // frame, taken from a queue rather than from the live mask -- and it
        // belongs here, at the same seam. Audio does not depend on it and does
        // not block it.
        opts.audio?.frame(state.apuLog);
        stepped = true;
      }
      if (stepped) {
        renderFrame(frameFor(state), res.tiles, px);
        ctx.putImageData(img, 0, 0);
      }
      // Outside the loop: turning batches into samples is per ANIMATION frame,
      // and it is deliberately after the picture, so a slow audio pump delays
      // sound rather than the display.
      opts.audio?.pump();
    } catch (e) {
      // Stop cleanly rather than throwing once per frame forever, and hand the
      // error somewhere a human can see it. The message names the ROM address,
      // which is the whole point of the throws being loud.
      running = false;
      if (opts.onError) opts.onError(e);
      throw e;                       // keep the console trace intact
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
