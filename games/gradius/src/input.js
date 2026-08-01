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

// ===========================================================================
// WAVE 14: INPUT BELONGS TO A LOGIC FRAME, NOT TO A WALL-CLOCK MOMENT
// ===========================================================================
//
// docs/worklog/gradius/13-FINDING-input-granularity-under-load.md, and it was
// right: src/main.js used to call `currentButtons()` INSIDE its catch-up loop,
// so when k logic frames ran in one animation-frame callback all k consumed the
// same live mask. Two things follow, and the second is the one that matches the
// word the owner used ("unresponsive", not "slow"):
//
//  1. at the k=8 clamp the game advanced at full speed while sampling input
//     7.5 times a second;
//  2. **a press and its release that both landed between two callbacks were
//     invisible.** The mask went 0 -> A -> 0 with nothing looking, so the shot
//     was never fired at all. That is not latency; that is a dropped input, and
//     it is why the fix is not "make the loop faster".
//
// So the mask is no longer sampled by the loop. Every CHANGE to it is pushed
// here as it happens -- inside the DOM event handler, on the browser's own
// schedule -- and `nextInputWord()` hands out exactly one word per LOGIC frame.
// The host clock decides only HOW MANY logic frames have come due, never what
// any of them reads (games/ddpdoj/NOTES-replay.md constraint 1). That is also
// the precondition for a deterministic replay: a recorded run is the sequence
// of words this function returned, and nothing about when they were returned.
//
// THE QUEUE IS TWO DEEP, and the number is a trade with two named cases:
//
//   * A TAP shorter than an animation frame is `[mask, 0]` -- two entries. It
//     must survive, or the tap is lost, which is the defect above. So the cap
//     cannot be 1.
//   * A FINGER SLIDING ACROSS THE D-PAD emits a pointermove per direction, many
//     per animation frame, all of them level changes rather than taps. Whatever
//     the queue cannot drain becomes steering LAG: at the cap, the ship keeps
//     turning `cap` logic frames after the finger did. At 2 that is 33 ms; at 8
//     it would be 133 ms and unflyable. So the cap cannot be large.
//
// Two is the smallest value that keeps the tap, and the largest that keeps the
// slide honest. When the queue is full the NEWEST state overwrites the tail --
// never the head -- so the current truth is always the last thing in the queue
// and the transient at the head is still delivered. What that loses is a
// press-release-press inside one animation frame (a 16 ms double tap), and that
// is written down rather than discovered.
const MAX_PENDING = 2;

/** States not yet consumed by a logic frame, oldest first. Length <= MAX_PENDING. */
const pending = [];

/** The mask as of the last event. What a logic frame gets once the queue is dry. */
let live = 0;

/** Logic frames that found the queue empty and reused `live`. Diagnostic only. */
let repeats = 0;
/** Transitions the cap made us overwrite. Non-zero means the cap is biting. */
let coalesced = 0;

/**
 * Called after ANY change to `held` or `touchHeld`. Idempotent: a handler that
 * fires without changing the mask queues nothing, so holding a key does not
 * push 60 identical words a second.
 */
function noteInput() {
  const w = u8(held | touchHeld);
  if (w === live) return;
  live = w;
  if (pending.length < MAX_PENDING) pending.push(w);
  else { pending[pending.length - 1] = w; coalesced++; }
}

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
  noteInput();
}

/**
 * Replace the whole direction nibble in one write, leaving A/B/START/SELECT
 * alone. The d-pad is a single surface rather than four buttons (see
 * dpadMask), so it hands over a mask, not an edge.
 */
export function setTouchDirections(mask) {
  touchHeld = u8((touchHeld & ~DPAD_MASK) | (mask & DPAD_MASK));
  noteInput();
}

/** The backstop. Any interruption the buttons never saw clears everything. */
export function clearTouchButtons() { touchHeld = 0; noteInput(); }

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
    noteInput();
  });
  target.addEventListener('keyup', (e) => {
    const b = KEYMAP[e.code];
    if (!b) return;
    e.preventDefault();
    held &= ~b;
    seen &= ~b;
    noteInput();
  });
  // Keyboard only. The touch mask's backstop lives with the buttons that set
  // it (index.html binds blur, visibilitychange and pagehide to
  // clearTouchButtons), so a lost keyup and a lost pointerup are recovered
  // independently -- see the note on touchHeld.
  target.addEventListener('blur', () => { held = 0; seen = 0; noteInput(); });
}

/**
 * The live button mask, in $0007's bit layout: keyboard OR on-screen pad.
 *
 * THE FRAME LOOP DOES NOT CALL THIS ANY MORE -- `nextInputWord()` does the job,
 * once per logic frame, and this is the mask as of the last DOM event with no
 * relationship to any frame at all. It stays exported because the page and
 * tests/input.test.js legitimately want "what is held right now"; a caller that
 * feeds it to nmi() re-creates the wave-13 defect.
 */
export function currentButtons() { return u8(held | touchHeld); }

/**
 * THE ONE WORD ONE LOGIC FRAME GETS. src/main.js calls this exactly once per
 * call to nmi() and never anything else.
 *
 * Oldest queued transition first; once the queue is dry, the state the last
 * event left. A held button therefore reads the same word every frame with no
 * queue traffic at all, which is the common case and costs one length check.
 */
export function nextInputWord() {
  if (pending.length === 0) { repeats++; return live; }
  return pending.shift();
}

/**
 * Diagnostics for the page and for tests. `depth` is what has not been consumed
 * yet -- a number that sits at MAX_PENDING means the host is not running enough
 * logic frames to keep up with the events, which is the condition this whole
 * mechanism exists to survive; `coalesced` counts the transitions the cap threw
 * away and should be 0 in ordinary keyboard play.
 */
export function inputQueueStats() {
  return { depth: pending.length, live, repeats, coalesced, cap: MAX_PENDING };
}

/**
 * Drop everything: the mask, the queue and the edge memory. For tests, which
 * share one module instance across files, and for nothing in the page -- the
 * page's own backstops (blur/pagehide/visibilitychange) go through the ordinary
 * setters so their zeroes are QUEUED like any other transition rather than
 * vanishing.
 */
export function resetInput() {
  held = 0; seen = 0; touchHeld = 0; live = 0;
  pending.length = 0; repeats = 0; coalesced = 0;
}

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
