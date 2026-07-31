// The HOST half of src/main.js: the browser plumbing the cartridge knows
// nothing about.  Zero ROM.  No address in this file cites one, because there
// is none to cite -- a Game Boy has no canvas, no requestAnimationFrame, no
// AudioContext and no way to be suspended by a tab losing focus.
//
// Split out of src/main.js in Phase 10, which cut that file along the ROM/host
// line.  The other side is src/game/frame.js ($0567-$0650).
//
// WHAT IS DELIBERATELY *NOT* HERE, and this is the important half of the note.
// The fixed-timestep accumulator and the rAF scheduling stay in src/main.js.
// They look like host code and they are, but they are FUSED to the screen state
// machine: the `while (acc >= FRAME_MS && steps < 4)` loop wraps the per-screen
// dispatch, and the post-frame transition arms read four flags
// (startPressed / introDone / endingDone / menuChoice) that the loop body sets.
// Pulling the accumulator out means inverting control -- main.js would hand the
// dispatch in as a callback and get the flags back out -- which is a rewrite of
// the frame loop's control flow, not a move.
//
// It is not verifiable here either, and that is what decided it.  NO test-all
// stage drives boot() at all; the harness that does (tools/oracle/headless.mjs,
// repaired in this same phase) runs a CONTROLLED clock advancing exactly one
// FRAME_MS per rAF callback, so it only ever exercises the one-step case.  The
// clamp (`Math.min(now - last, FRAME_MS * 4)`, which exists because rAF stops
// entirely in a background tab) and the four-step cap would both be rewritten
// blind.  Everything this file DOES export is exercised on all 1072 frames of
// that harness's walk through title, round select, level 1, a pit death and the
// ending.
//
// Whoever moves the accumulator later: the precondition is a harness that can
// advance the clock by an arbitrary delta, so `due(now)` can be asserted to
// return 0, 1, 4 and 4-when-a-minute-was-missed.

import { createFramebuffer, SCREEN_W, SCREEN_H } from '../render/renderer.js';

/**
 * INTEGER UPSCALE, done here rather than left to CSS.
 *
 * The DMG frame is 160x144 and the page shows it several times larger. Handing
 * that scale to the browser means trusting it to map one source pixel onto a
 * whole number of device pixels -- and it does not always: a fractional CSS
 * scale, a fractional devicePixelRatio, or an element whose left edge lands
 * between device pixels all make some source pixels one device pixel wider
 * than their neighbours. On flat art that is invisible. On a 50% DITHER it is
 * not: the checkerboard beats against the sampling grid and reads as coarse
 * irregular blocks.
 *
 * That is what the ending's credit circle is made of. Its edge is a dithered
 * ring, and it was reported as "giant pixels at the corners, more like tetris
 * pieces than pixels". The RENDER is not at fault -- the ending is pixel-exact
 * against the cartridge over 88 frames of the whole crawl, and the cartridge
 * runs no per-scanline program there at all (MEASURED: rIE = $05 with the STAT
 * bit clear, and the STAT vector fires 0 times in 600 credit frames, so there
 * is no smoothing layer to be missing). The fault is in how it is DISPLAYED.
 *
 * So blit the framebuffer into an offscreen 160x144 canvas and drawImage it
 * onto a backing store that is an exact integer multiple, with smoothing off.
 * The scale-up is then ours and always whole-pixel; whatever the browser does
 * to fit the result is a smooth resample of an already-correct image rather
 * than a per-pixel rounding decision.
 *
 * @returns {{fb: any, present: () => void}} `fb` is the framebuffer the
 *          renderer writes into; `present()` puts it on the canvas.
 */
export function createPresenter(canvas) {
  const fb = createFramebuffer();
  const ctx = canvas.getContext('2d');
  const src = document.createElement('canvas');
  src.width = SCREEN_W;
  src.height = SCREEN_H;
  const srcCtx = src.getContext('2d');
  const image = srcCtx.createImageData(SCREEN_W, SCREEN_H);
  /** Re-read the integer scale the page asked for, clamped to something sane. */
  const backingScale = () => {
    const s = parseInt(canvas.dataset.scale || '0', 10);
    return Number.isFinite(s) && s >= 1 ? Math.min(s, 8) : 1;
  };
  let scale = 0;
  const sizeBacking = () => {
    const s = backingScale();
    if (s === scale) return;
    scale = s;
    canvas.width = SCREEN_W * s;
    canvas.height = SCREEN_H * s;
    ctx.imageSmoothingEnabled = false;
  };
  sizeBacking();

  return {
    fb,
    present() {
      image.data.set(fb.rgba);
      sizeBacking();                 // the page may have resized since last frame
      srcCtx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0, SCREEN_W, SCREEN_H,
                    0, 0, SCREEN_W * scale, SCREEN_H * scale);
    },
  };
}

/**
 * Audio cannot start without a user gesture. boot() is CALLED from one --
 * the launcher's LAUNCH click -- so try immediately: browsers keep transient
 * activation alive for a few seconds, which comfortably covers the awaits
 * above. Waiting for the *next* gesture instead is why the music used to
 * come in several seconds late, after whatever the player happened to press
 * first.
 *
 * The listeners stay as the fallback for when that window has closed (a slow
 * asset load) or when boot() was not reached from a gesture at all.
 */
export function armAudio(sound) {
  const rearm = () => {
    sound.start();
    window.removeEventListener('keydown', rearm);
    window.removeEventListener('pointerdown', rearm);
  };
  try {
    sound.start();
  } catch {
    window.addEventListener('keydown', rearm);
    window.addEventListener('pointerdown', rearm);
  }
}

/**
 * Refocusing must not replay the missed time, and any key held when focus
 * was lost never sends its keyup -- attachInput's blur handler clears those.
 *
 * The handler itself stays in main.js, because what it resets (`last`, `acc`)
 * is the accumulator this file deliberately does not own.
 */
export function onRefocus(resync) {
  window.addEventListener('focus', resync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
}

/**
 * The suspended-loop watchdog.
 *
 * step() hands off to an async load by RETURNING without rescheduling; only
 * resume() restarts it. Every such handoff is therefore a window in which the
 * game is, correctly, frozen -- and an incorrectly frozen game looks exactly
 * the same. A player sees one thing either way: everything vanishes and the
 * music keeps playing.
 *
 * So make the difference observable. Arm a timer at each handoff and disarm
 * it in resume(); if it ever fires, the loop was suspended and never came
 * back, and we can say WHICH handoff did it instead of guessing from a
 * description. This exists because a reported level-6 softlock could not be
 * reproduced from any scripted input -- the level itself is bit-exact against
 * the cartridge for 400 frames -- so the next occurrence has to report itself.
 *
 * @param onStall called with the handoff name that never resumed.
 */
export function createWatchdog(onStall, WATCHDOG_MS = 5000) {
  let watchdog = null;
  return {
    arm(where) {
      if (watchdog !== null) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        watchdog = null;
        onStall(where, new Error(`no resume() within ${WATCHDOG_MS} ms`));
      }, WATCHDOG_MS);
    },
    disarm() {
      if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
    },
  };
}

/**
 * Every async screen swap suspends the rAF loop: step() `return`s WITHOUT
 * rescheduling, and only resume() restarts it. So a rejected load left the loop
 * dead forever while the audio worklet carried on -- a silent freeze with the
 * music still playing, and nothing in the console unless you happened to be
 * watching for an unhandled rejection.
 *
 * REPORTED FROM PLAY on level 6, whose clear is the one handoff that goes
 * through a transition rather than a screen. The level-6 simulation itself
 * is bit-exact against the cartridge for 400 frames, so the fault was never
 * in the game code -- it was that a failure here had no way to be seen.
 *
 * Stop the sound too: a dead game that keeps playing music reads as a game
 * bug rather than a load failure, which is what sent the last investigation
 * looking in the wrong place.
 *
 * @param halt    clears the loop's `running` flag, which lives with the
 *                accumulator in main.js.
 * @returns the curried `fail(where)(err)` the screen machine hands to .catch().
 */
export function createFailReporter({ sound, onError, halt }) {
  return (where) => (err) => {
    halt();
    try { sound.stop(); } catch { /* the driver may never have started */ }
    const msg = `${where} failed: ${(err && err.message) || err}`;
    if (onError) onError(msg, err);
    else console.error('[mixup] ' + msg, err);
  };
}
