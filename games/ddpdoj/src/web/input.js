// THE PAGE'S INPUT.  Keyboard and the on-screen pad, both ending up as ONE
// 68000 port word.  (wave 7)
//
// This file owns which CONTROL is which BIT.  It does not own the bit shuffle:
// `src/input.js`'s `portWordFromBits` is the inverse of build A's $13D464 and
// is unit-tested against the board's own measured port words ($FFFE for 1P
// Start alone, $FF7F for Button 3 held).  There is deliberately no second route
// into the port word -- a control that works in the DOM and does nothing in the
// game is the failure this arrangement prevents.
//
// KEYS ARE MATCHED ON `e.code`, i.e. PHYSICAL POSITION, and both `KeyZ` and
// `KeyY` are bound to shot.  The owner's keyboard is Swiss QWERTZ, where the
// key printed Z sits where QWERTY has Y and reports as `KeyY`.  This has been
// asked for twice; it is a standing requirement, not a nicety.
//
// THE ON-SCREEN PAD's lessons are carried over from Gradius and the Game Boy
// port, each of which cost somebody an evening:
//   * POINTER events, not touch events -- one path for finger, pen and mouse.
//   * `setPointerCapture` on press, so a finger that slides off a control still
//     delivers its release to it.  Without it you get a stuck direction and the
//     ship flies into the wall.
//   * `touch-action: none` plus `preventDefault`, or the browser decides the
//     gesture was a scroll and steals it mid-press.
//   * A blur / pagehide / visibilitychange BACKSTOP that clears the whole mask,
//     for every interruption the controls themselves never see.
//   * The d-pad is ONE capture target hit-tested as a 3x3 grid, NOT four
//     buttons.  Four captured buttons can never report a diagonal -- the same
//     capture that stops a stuck direction stops a second button ever seeing
//     the finger -- and DaiOuJou is a vertical shooter where a diagonal is how
//     you leave a bullet pattern.  The corner thirds report TWO bits, which is
//     exactly what the board's own mirrors carry: $803970 has one bit per
//     direction and the mover tests them independently.
//
// The keyboard mask and the touch mask are kept SEPARATE and OR'd, the same
// split Gradius uses: the two paths lose events in different ways (a keyup
// missed while something steals focus; a pointerup missed when the browser
// takes over the gesture) and each needs its own recovery.  Merged, the
// keyboard's blur reset would wipe a finger that is still on the screen.

import { BIT } from '../machine.js';
import { portWordFromBits } from '../input.js';

/** Control name -> a bit POSITION in $803970's layout (machine.js BIT). */
export const CONTROLS = Object.freeze({
  UP: BIT.up, DOWN: BIT.down, LEFT: BIT.left, RIGHT: BIT.right,
  SHOT: BIT.b1, BOMB: BIT.b2, AUTO: BIT.b3, START: BIT.start,
});

const M = (name) => 1 << CONTROLS[name];
export const DPAD_MASK = M('UP') | M('DOWN') | M('LEFT') | M('RIGHT');

/**
 * `e.code` -> control.  PHYSICAL positions.
 *
 * KeyZ and KeyY are BOTH shot: on a Swiss QWERTZ keyboard the key printed Z is
 * where QWERTY has Y and reports `KeyY`.  Space is a second shot because it is
 * what a hand on a laptop reaches for.
 */
export const KEYMAP = Object.freeze({
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  KeyW: 'UP', KeyS: 'DOWN', KeyA: 'LEFT', KeyD: 'RIGHT',
  KeyZ: 'SHOT', KeyY: 'SHOT', Space: 'SHOT',
  KeyX: 'BOMB', KeyC: 'AUTO',
  Enter: 'START',
});

let keyHeld = 0;
// Keys we have seen a real (non-repeat) keydown for.  A key already down when
// the page loaded only ever reaches us as an auto-repeat; taking those at face
// value turns the Enter that launched the page into a START press.
let keySeen = 0;
let touchHeld = 0;

/** The live mask, keyboard OR pad, one bit per CONTROLS entry. */
export function currentMask() { return (keyHeld | touchHeld) & 0xffff; }

/** Bit POSITIONS, for `portWordFromBits`. */
export function currentBits(mask = currentMask()) {
  const out = [];
  for (let b = 0; b < 16; b++) if (mask & (1 << b)) out.push(b);
  return out;
}

/** The 68000 port word this frame, via the inverse of $13D464. */
export function currentPortWord() { return portWordFromBits(currentBits()); }

// --------------------------------------------------------------- keyboard

export function attachKeyboard(target = (typeof window !== 'undefined' ? window : null)) {
  if (!target) return () => {};                   // headless: tests drive the mask
  const down = (e) => {
    const c = KEYMAP[e.code];
    if (!c) return;
    e.preventDefault();
    const b = 1 << CONTROLS[c];
    if (e.repeat && !(keySeen & b)) return;
    keySeen |= b;
    keyHeld |= b;
  };
  const up = (e) => {
    const c = KEYMAP[e.code];
    if (!c) return;
    e.preventDefault();
    const b = 1 << CONTROLS[c];
    keyHeld &= ~b;
    keySeen &= ~b;
  };
  const clear = () => { keyHeld = 0; keySeen = 0; };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', clear);
  return () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
    target.removeEventListener('blur', clear);
    clear();
  };
}

// ------------------------------------------------------------ on-screen pad

/** Press or release one on-screen button. */
export function setTouchButton(name, down) {
  const b = 1 << CONTROLS[name];
  if (down) touchHeld |= b; else touchHeld &= ~b;
}

/** Replace the whole direction nibble in one write, leaving the face buttons
 *  alone.  The d-pad is one surface, so it hands over a MASK, not an edge. */
export function setTouchDirections(mask) {
  touchHeld = ((touchHeld & ~DPAD_MASK) | (mask & DPAD_MASK)) & 0xffff;
}

/** The backstop.  Any interruption the buttons never saw clears everything. */
export function clearTouch() { touchHeld = 0; }

/** Test seam: the keyboard half of the backstop. */
export function clearKeyboard() { keyHeld = 0; keySeen = 0; }

/**
 * Which directions a point on the d-pad surface means.  `u`,`v` are the pointer
 * position relative to the pad's top-left corner and `w`,`h` its size, in any
 * consistent unit.
 *
 * A 3x3 grid: outer thirds are directions, the middle third is neutral on that
 * axis, so a finger in a CORNER third reports TWO bits.  Out-of-range
 * coordinates land in the outer bands by construction, so a finger that has
 * slid off the pad KEEPS the direction it slid towards rather than dropping to
 * neutral -- and its release still arrives, because the caller holds a pointer
 * capture.
 */
export function dpadMask(u, v, w, h) {
  let m = 0;
  if (w > 0) {
    const cx = u / w;
    if (cx < 1 / 3) m |= M('LEFT'); else if (cx >= 2 / 3) m |= M('RIGHT');
  }
  if (h > 0) {
    const cy = v / h;
    if (cy < 1 / 3) m |= M('UP'); else if (cy >= 2 / 3) m |= M('DOWN');
  }
  return m;
}

/**
 * Wire an on-screen pad.  `dpadEl` is ONE capture target hit-tested by
 * `dpadMask`; `buttons` are elements carrying `data-btn="SHOT"` etc.
 *
 * @returns {() => void} the backstop, so the page can also call it from
 *          `blur` / `pagehide` / `visibilitychange`.
 */
export function attachPad(dpadEl, buttons, { onPaint } = {}) {
  let padPointer = null;
  const paint = (mask) => onPaint?.(mask);

  const apply = (e) => {
    const r = dpadEl.getBoundingClientRect();
    const m = dpadMask(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    setTouchDirections(m);
    paint(m);
  };
  dpadEl.addEventListener('pointerdown', (e) => {
    // One finger owns the pad at a time, so a second finger landing on it can
    // neither steal the direction nor clear it on ITS release.
    if (padPointer !== null) return;
    e.preventDefault();
    padPointer = e.pointerId;
    dpadEl.setPointerCapture?.(e.pointerId);
    apply(e);
  });
  dpadEl.addEventListener('pointermove', (e) => {
    if (e.pointerId !== padPointer) return;
    e.preventDefault();
    apply(e);                       // slide from LEFT into UP+LEFT without lifting
  });
  const end = (e) => {
    if (e.pointerId !== padPointer) return;
    e.preventDefault();
    padPointer = null;
    setTouchDirections(0);
    paint(0);
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    dpadEl.addEventListener(t, end);
  }
  dpadEl.addEventListener('contextmenu', (e) => e.preventDefault());

  for (const b of buttons) {
    const name = b.dataset.btn;
    if (!(name in CONTROLS)) {
      throw new Error(`on-screen button data-btn="${name}" is not a control; `
        + `known: ${Object.keys(CONTROLS).join(', ')}`);
    }
    const press = (e) => {
      e.preventDefault();
      // The finger may slide off the button; the capture keeps its release ours.
      b.setPointerCapture?.(e.pointerId);
      b.dataset.on = '1';
      setTouchButton(name, true);
    };
    const release = (e) => {
      e.preventDefault();
      delete b.dataset.on;
      setTouchButton(name, false);
    };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    // Fires after a normal pointerup too (release is idempotent), and covers
    // the case where no pointerup ever comes because the capture was taken.
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  return function backstop() {
    clearTouch();
    padPointer = null;
    paint(0);
    for (const b of buttons) delete b.dataset.on;
  };
}
