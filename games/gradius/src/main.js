// Boot, and the clock that drives the NMI.
//
// There is no game loop in the cartridge -- src/nmi.js is the whole of it -- so
// everything here is host plumbing: load the assets, put the machine into the
// state the stage-1 play path starts from, and call nmi() at the NES's frame
// rate.

import { createState, MODE_STAGE } from './state.js';
import { attachInput, nextInputWord, inputQueueStats } from './input.js';
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

/**
 * THE STATE AT `$8067` -- i.e. what RESET leaves for the first NMI. W39.
 *
 *   8022  clear $0000-$07CF (the ($98),Y walk skips each page's byte 0)
 *   8035  LDX #$F0 / CMP $0700,X ...   is $07F0-$07FF already $F0..$FF?
 *   8042  cold boot: $0700-$07FF := 0, then $07F0-$07FF := $F0..$FF
 *   8052  A9 50 / 8D E1 07             $07E1 := $50   -- TOP = 50000
 *   8057  A9 00 / 85 00                $00 := 0       -- MODE 0
 *   805B  8D 00 07 / JSR $81AB / JSR $83AB / JSR $8510
 *   8067  JMP $8067                    the empty spin; the NMI does the rest
 *
 * `$07E1 = $50` IS RESET'S, NOT THE ATTRACT MODE'S. This file said "TOP score,
 * the 50000 the attract mode leaves" in two places for eleven waves and the
 * listing says otherwise: `$8052` writes it before the first NMI ever runs, and
 * on a WARM boot ($07F0-$07FF still holding the signature) it is not written at
 * all -- which is how the cartridge keeps a high score across a soft reset.
 *
 * The `$8035` signature check is not modelled: a browser tab has no warm boot,
 * so the port takes the cold arm every time and says so here rather than
 * carrying a $07F0 array nothing else reads.
 *
 * `$8510` (hold A+B at power-on -> the `$8523` service screen) is not modelled
 * either. It reads the pad at RESET, before any of this port's input plumbing
 * exists, and it ends `$852E STA $00` -- mode 0 again -- by a different road.
 */
export function resetState(manifest) {
  const s = createState();
  s.mode = 0;                      // $8059 STA $00 -- MODE 0, the title
  s.substate = 0;                  // $1B, inside the $8022 clear
  // $1E and $1F default to 1 and 2 in createState() because those are the values
  // MEASURED mid-play; RESET's clear puts both at 0 and $80F6 INCs $1F to 1.
  s.zp1E = 0;
  s.zp1F = 0;
  s.ppu.ctrl = 0;                  // $10 -- $8256 sets $A8
  s.ppu.mask = 0;                  // $11 -- $8256 sets $1E
  s.ppu.scrollY = 0;               // $13
  s.ppu.chrSel = 0;                // $2D -- $80EC sets 3
  s.zp.autofire = 0;               // $35 -- $9B5E sets 20 at the stage intro
  s.score[0x01] = 0x50;            // $07E1 -- $8052/$8054, TOP = 50000
  s.vram.pal.set(gameplayPalette(manifest));
  s.bandA.chrBank = chrBank(0);
  s.bandB.chrBank = chrBank(2);
  return s;
}

/**
 * The catch-up clamp, in logic frames. A backgrounded tab hands back a delta of
 * minutes and simulating those is both pointless and slow.
 */
export const MAX_CATCHUP_FRAMES = 8;

/**
 * HOW MANY LOGIC FRAMES ARE DUE, and a census of the answer.
 *
 * Split out of `tick()` and exported for one reason: k -- the number of logic
 * frames one animation-frame callback runs -- is the number
 * `13-FINDING-input-granularity-under-load.md` asked for and nobody could
 * produce, because it lived inside a closure inside a requestAnimationFrame
 * callback where nothing could see it. Now it is an object with a histogram,
 * `tests/loop.test.js` drives it with a fake clock, and index.html puts `k` on
 * the page next to the lag counter so the owner can read it off a real browser
 * on a real machine -- which is the only place the question can actually be
 * settled (this file's author has no browser).
 *
 * COUNTED, NOT TIMED, in the sense docs/knowledge/06 means it: the host clock
 * decides only how many frames have come due. What each of them computes is
 * decided entirely by nmi() and by the word nextInputWord() hands it.
 */
export class FramePacer {
  constructor(period, clamp = MAX_CATCHUP_FRAMES) {
    this.period = period;
    this.clamp = clamp;
    this.acc = 0;
    this.last = null;
    this.callbacks = 0;
    this.logicFrames = 0;
    this.maxK = 0;
    this.clamped = 0;              // callbacks that hit the ceiling
    /** hist[k] = callbacks that ran exactly k logic frames, k = 0..clamp. */
    this.hist = new Uint32Array(clamp + 1);
  }

  /**
   * @param {number} now  a DOMHighResTimeStamp (rAF's argument)
   * @returns {number} k, in 0..clamp
   */
  due(now) {
    // FIRST CALL: no delta exists yet, so run nothing rather than inventing a
    // frame. rAF's timestamp is the start of the frame and CAN be earlier than
    // the performance.now() taken just before the loop was armed, which used to
    // make the first delta negative; `last === null` says so instead of
    // pretending, and the Math.max keeps a negative delta from unwinding acc.
    if (this.last === null) { this.last = now; this.callbacks++; this.hist[0]++; return 0; }
    const dt = Math.max(0, now - this.last);
    this.last = now;
    this.acc = Math.min(this.acc + dt, this.period * this.clamp);
    // DIVIDE, do not subtract in a loop. `acc -= period` repeated eight times
    // does not return exactly 0 from `period * 8` in IEEE-754, and the residual
    // is on the wrong side: the clamped burst came out as SEVEN logic frames,
    // not eight, which tests/loop.test.js caught. `period * clamp` is an exact
    // scaling by a power of two, so `acc / period` is exactly `clamp` there and
    // `acc -= k * period` leaves exactly 0.
    let k = Math.floor(this.acc / this.period);
    if (k > this.clamp) k = this.clamp;       // only reachable through rounding
    this.acc -= k * this.period;
    if (k >= this.clamp) this.clamped++;
    this.callbacks++;
    this.logicFrames += k;
    if (k > this.maxK) this.maxK = k;
    this.hist[Math.min(k, this.clamp)]++;
    return k;
  }

  /** Numbers for the page. `k` is the histogram as a plain array. */
  stats() {
    return {
      callbacks: this.callbacks, logicFrames: this.logicFrames,
      maxK: this.maxK, clamped: this.clamped, k: Array.from(this.hist),
    };
  }
}

/**
 * THE CATCH-UP LOOP'S BODY: run `k` logic frames, one input word each.
 *
 * Exported and not inlined into `tick()` for one reason, and it is the reason
 * this wave exists. The defect
 * `13-FINDING-input-granularity-under-load.md` describes lived exactly here, in
 * a closure inside a requestAnimationFrame callback inside boot(), where the
 * only way to test it was to read it -- which is how it survived thirteen
 * waves. As a function it can be called with real headless resources and the
 * real input queue, and `tests/loop.test.js` does: k frames must consume k
 * words, in order, off the queue.
 *
 * @param {number} k       logic frames due, from FramePacer.due()
 * @param {object} state   the port's state, mutated in place
 * @param {object} res     loadResources()'s bundle
 * @param {{frame:(log:Uint8Array|number[])=>void}} [audio]
 */
export function stepLogicFrames(k, state, res, audio) {
  for (let i = 0; i < k; i++) {
    // ---- WAVE 14: ONE INPUT WORD PER LOGIC FRAME ---------------------------
    // This used to be `currentButtons()` -- the LIVE mask, re-read k times in
    // this loop, all k reads returning the same word because the browser only
    // updates it between callbacks. A press and its release that both landed
    // inside one callback were therefore never seen at all. The word now comes
    // off a queue that the DOM event handlers fill as the events arrive
    // (src/input.js), so a logic frame OWNS its input instead of borrowing
    // whatever the wall clock happened to be showing.
    //
    // This is also the precondition for a deterministic replay -- the run is the
    // sequence of words, not the times they were read -- which is the same
    // requirement games/ddpdoj/NOTES-replay.md states and the same shape as the
    // audio line below.
    nmi(state, nextInputWord(), res);
    // ---- WAVE 13: ONE AUDIO BATCH PER LOGIC FRAME --------------------------
    // Inside the catch-up loop, not after it, and that is the whole design.
    // `state.apuLog` is this frame's $4000-$400F writes and src/nmi.js clears it
    // at the top of the NEXT frame, so a burst of k frames must hand over k
    // batches here or k-1 frames of music are lost. What the audio path then
    // does with them is its own business and runs on the AudioContext's clock,
    // never on this one (src/audio/output.js).
    audio?.frame(state.apuLog);
  }
}

export async function boot(canvas, opts = {}) {
  const [game, res] = await Promise.all([loadGameJson(), loadResources(0)]);
  // W39: THE PORT NOW BOOTS WHERE THE CARTRIDGE BOOTS -- mode 0, $8067's state.
  // It used to start at `introEntryState()`, i.e. at the handover mode 4 makes
  // to mode 5, because modes 0-4 and 6 were not ported. The title menu, the
  // 256-frame countdown, the attract demo, START, and the whole way back round
  // from a game over now run.
  //
  // WHAT A PLAYER SEES IS NOT YET THE CARTRIDGE'S TITLE SCREEN, and that is the
  // one gap left: `$8871`'s 2304 `$2007` writes are not ported (src/modes.js
  // header), so the LOGO is missing. Everything that reaches the screen through
  // the $0700 queue -- the palette (packet 6), the four text lines (packets
  // 4,3,2,1) and the cursor ship -- does arrive, because those are producers
  // this port has had since W2.
  //
  // `opts.startMode` exists for the launcher and for anyone who wants the old
  // behaviour; it is not a fallback the frame loop can take by itself.
  const state = opts.startMode === MODE_STAGE
    ? introEntryState(res.manifest)
    : resetState(res.manifest);

  attachInput(opts.target);

  const ctx = canvas.getContext('2d', { alpha: false });
  const img = ctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);

  // FRAME RATE COMES FROM game.json. It is spelled once, there, and is derived
  // rather than rounded: 60.098814 Hz is NTSC PPU 5369318.18 / 89341.5, the
  // half-cycle being the dot skipped on the pre-render line of odd frames.
  const period = 1000 / game.display.frameHz;

  const pacer = new FramePacer(period);
  let running = true;
  function tick(now) {
    if (!running) return;
    // How many logic frames have come due. The clamp and the accumulator moved
    // into FramePacer so the answer is countable from outside -- see the class.
    const k = pacer.due(now);
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
      stepLogicFrames(k, state, res, opts.audio);
      if (k > 0) {
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

  // `loop` and `input` are exposed so index.html can put k and the input queue
  // depth on the page. They are READ-ONLY diagnostics: nothing in the frame loop
  // reads them back, so watching them cannot change what a frame computes.
  return {
    state, res, loop: pacer,
    loopStats: () => pacer.stats(),
    inputStats: inputQueueStats,
    stop() { running = false; },
  };
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
