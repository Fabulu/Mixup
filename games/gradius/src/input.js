// Input. ROM: the joypad read `$81BF`, called from the NMI at $80A4.
//
// $8206: STA $05,X   -- buttons PRESSED this frame (edge), P1 = $0005
// $8208: STY $07,X   -- buttons HELD,               P1 = $0007
// $18 selects which player's pair is used ($A01D: LDX $18 / B5 07).
//
// THE INPUT LEAD IS ZERO, and this file exists partly to say so in code.
// $81BF runs at $80A4 and the state machine that moves the ship at $80AA --
// same NMI, six instructions apart. MEASURED twice, from two directions:
// START pressed on game frame 220 changes the mode on frame 220, and RIGHT
// held from frame 400 moves $0360 on frame 400 (80 -> 81). Do NOT inherit the
// Game Boy port's one-tick lead.
//
// The bit layout was measured by A/B RAM diff rather than looked up
// (PROBE.md 4): RIGHT $01, LEFT $02, DOWN $04, UP $08, START $10, A $80.

import { BTN, u8 } from './state.js';

// Keys are matched on e.code, i.e. PHYSICAL position, so the layout the user
// types on does not matter. On a QWERTZ keyboard the key printed Z sits where
// QWERTY has Y and reports as `KeyY`, so both are bound.
const KEYMAP = {
  ArrowRight: BTN.RIGHT, ArrowLeft: BTN.LEFT,
  ArrowDown: BTN.DOWN, ArrowUp: BTN.UP,
  KeyD: BTN.RIGHT, KeyA: BTN.LEFT, KeyS: BTN.DOWN, KeyW: BTN.UP,
  KeyX: BTN.A, Space: BTN.A,
  KeyZ: BTN.B, KeyY: BTN.B, KeyC: BTN.B,
  Enter: BTN.START, ShiftRight: BTN.SELECT, ShiftLeft: BTN.SELECT,
};

let held = 0;
// Keys we have seen a real (non-repeat) keydown for. A key already down when
// the page loaded only ever reaches us as an auto-repeat; taking those at face
// value turns the Enter that launched the page into a START press.
let seen = 0;

// ---------------------------------------------------------------------------
// On-screen controls (phones). The page owns the LAYOUT; this file owns the
// BITS, so there is exactly one place where a control is attached to a joypad
// bit and tests/input.test.js can hold it against the keyboard.
//
// The touch mask is SEPARATE from the keyboard mask and OR'd in
// currentButtons(). Two masks and not one, the same split the Game Boy port
// uses: the paths lose events in different ways -- a keyup missed while
// something steals focus, a pointerup missed when the browser takes over the
// gesture -- and each has its own recovery. Merged, the keyboard's blur reset
// would wipe a finger that is still on the screen, and a stuck touch bit could
// not be cleared without also clearing the keyboard.
//
// It is OR'd in BEFORE readJoypad(), so the touch path produces $0007 and
// $0005 through the cartridge's own edge computation. There is deliberately no
// second input route into state.input: a control that works in the DOM and
// does nothing in the game is the failure this avoids.
let touchHeld = 0;

/** The button ids the on-screen pad uses (`data-btn`), in $0007's layout. */
export const TOUCH_BUTTONS = Object.freeze({
  UP: BTN.UP, DOWN: BTN.DOWN, LEFT: BTN.LEFT, RIGHT: BTN.RIGHT,
  A: BTN.A, B: BTN.B, SELECT: BTN.SELECT, START: BTN.START,
});

/** The direction nibble. `AND #$0F` at $A082 is the ROM's own name for it. */
export const DPAD_MASK = BTN.RIGHT | BTN.LEFT | BTN.DOWN | BTN.UP;

/** Press (`down`) or release one on-screen button. */
export function setTouchButton(bit, down) {
  if (down) touchHeld |= u8(bit); else touchHeld &= u8(~bit);
}

/**
 * Replace the whole direction nibble in one write, leaving A/B/START/SELECT
 * alone. The d-pad is a single surface rather than four buttons (see
 * dpadMask), so it hands over a mask, not an edge.
 */
export function setTouchDirections(mask) {
  touchHeld = u8((touchHeld & ~DPAD_MASK) | (mask & DPAD_MASK));
}

/** The backstop. Any interruption the buttons never saw clears everything. */
export function clearTouchButtons() { touchHeld = 0; }

/**
 * Which directions a point on the d-pad surface means. `u`,`v` are the pointer
 * position relative to the pad's top-left corner and `w`,`h` its size, in any
 * consistent unit.
 *
 * A 3x3 grid: the outer thirds are directions, the middle third is neutral on
 * that axis. A finger in a CORNER third therefore reports TWO bits, which is
 * not decoration -- updatePlayer() tests X ($A021/$A033) and Y ($A04B/$A065)
 * independently and has no diagonal case, so two simultaneous bits are the
 * only way the ship flies diagonally.
 *
 * Out-of-range coordinates land in the outer bands by construction, so a
 * finger that has slid off the pad keeps the direction it slid towards instead
 * of dropping to neutral. Its release still arrives, because the caller holds
 * a pointer capture.
 */
export function dpadMask(u, v, w, h) {
  let m = 0;
  if (w > 0) {
    const cx = u / w;
    if (cx < 1 / 3) m |= BTN.LEFT; else if (cx >= 2 / 3) m |= BTN.RIGHT;
  }
  if (h > 0) {
    const cy = v / h;
    if (cy < 1 / 3) m |= BTN.UP; else if (cy >= 2 / 3) m |= BTN.DOWN;
  }
  return m;
}

export function attachInput(target = (typeof window !== 'undefined' ? window : null)) {
  if (!target) return;                    // headless: tests drive readJoypad()
  target.addEventListener('keydown', (e) => {
    const b = KEYMAP[e.code];
    if (!b) return;
    e.preventDefault();
    if (e.repeat && !(seen & b)) return;
    seen |= b;
    held |= b;
  });
  target.addEventListener('keyup', (e) => {
    const b = KEYMAP[e.code];
    if (!b) return;
    e.preventDefault();
    held &= ~b;
    seen &= ~b;
  });
  // Keyboard only. The touch mask's backstop lives with the buttons that set
  // it (index.html binds blur, visibilitychange and pagehide to
  // clearTouchButtons), so a lost keyup and a lost pointerup are recovered
  // independently -- see the note on touchHeld.
  target.addEventListener('blur', () => { held = 0; seen = 0; });
}

/**
 * The live button mask, in $0007's bit layout: keyboard OR on-screen pad.
 * main.js hands this to nmi() -> readJoypad() once per frame.
 */
export function currentButtons() { return u8(held | touchHeld); }

/**
 * `$81BF` at $80A4. Given this frame's raw button mask, produce $0007 (held)
 * and $0005 (pressed = the rising edge against the previous frame).
 *
 * The ROM computes the edge with the previous HELD byte, not with a separate
 * latch, which is why a button that is held across a lag frame -- when $81BF
 * never runs at all -- produces no second edge.
 */
export function readJoypad(state, buttons) {
  const now = u8(buttons);
  state.input.pressed = u8(now & ~state.input.prev);   // $8206 STA $05,X
  state.input.held = now;                              // $8208 STY $07,X
  state.input.prev = now;
}
