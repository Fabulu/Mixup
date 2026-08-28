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
let inputTarget = null;

function keyDown(event) {
  const bit = KEYMAP[event.code];
  if (!bit) return;
  event.preventDefault();
  if (event.repeat && !(seen & bit)) return;
  seen |= bit;
  held |= bit;
  noteInput();
}

function keyUp(event) {
  const bit = KEYMAP[event.code];
  if (!bit) return;
  event.preventDefault();
  held &= ~bit;
  seen &= ~bit;
  noteInput();
}

function blurKeyboard() {
  held = 0;
  seen = 0;
  noteInput();
}

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
// ---------------------------------------------------------------------------
// WAVE 15: WHAT THE QUEUE IS FOR, AND THE ONLY RULE IT HAS TO OBEY
// ---------------------------------------------------------------------------
//
// Wave 14 capped the queue at two and said "at the cap the NEWEST state
// overwrites the tail". THAT RULE DESTROYS THE THING THE QUEUE EXISTS FOR, and
// wave 14's reviewer measured it: a press AND its release arriving while the
// queue is full write the tail twice -- `A`, then `0` -- so the press never
// occupies a slot at all. On a touch pad the queue is AT THE CAP CONTINUOUSLY
// (a sliding finger emits a pointermove per direction, several per animation
// frame -- see the note on touchHeld), so on a phone this is not a corner case,
// it is the steady state. MEASURED, k=1, no host load:
//
//     finger sliding on the d-pad + FIRE tapped 10x/s, sub-frame taps
//       wave 14:  taps 20   A-edges  0        <- zero of twenty shots fired
//       wave 15:  taps 20   A-edges 20
//     60 sub-frame taps, nothing else happening
//       wave 14:  taps 60   A-edges  1
//       wave 15:  taps 60   A-edges 30        <- 30 is the ARITHMETIC MAXIMUM:
//                                                two rising edges need a 0 word
//                                                between them, so 60 frames
//                                                hold at most 30 edges.
//
// THE RULE, derived from the board and not from convenience. `readJoypad()`
// below is `$81BF`: `$8206` is `pressed = now & ~prev`. A bit therefore produces
// an edge if and only if it appears SET in some word a logic frame is actually
// handed. So:
//
//     A BIT MAY NEVER LEAVE THE QUEUE WHILE IT IS STILL AN UNDELIVERED PRESS.
//
// Everything else in a queued word is a LEVEL, and a level may be merged away:
// dropping an intermediate level costs at most one logic frame of steering
// fidelity, and the finger is still there to say what it means. Dropping a press
// costs the shot, and nothing says it again.
//
// This is not just about the A button. `$9775` (src/flow.js codeMatch) compares
// `$0005` against a table of DIRECTION bits, so a direction's rising edge is
// load-bearing cartridge state too. The rule is about every bit.
//
// SO, AT THE CAP: the newest state is merged into the tail, carrying the tail's
// still-undelivered presses with it --
//
//     tail := w | (tail & ~prev)
//
// where `prev` is the word before the tail in the delivery order (the head, or
// the last word a logic frame was handed). `tail & ~prev` is exactly the set of
// rising edges that are in the queue and have not been seen yet; OR-ing them
// into `w` means a press SURVIVES ITS OWN RELEASE and is released one to two
// logic frames later instead of never. No bit is ever cleared out of the queue.
//
// THE CAP STAYS AT TWO, and the wave-14 trade is why -- the cap was never the
// defect, the merge rule was:
//
//   * The queue drains at ONE word per LOGIC frame while a sliding finger fills
//     it at several per ANIMATION frame, so any depth it is allowed to reach is
//     steering LAG the player feels: the ship keeps turning `depth` logic frames
//     after the finger did. At 2 that is 33 ms; at 8 it would be 133 ms and
//     unflyable. A growable queue makes that unbounded, which is why "make it
//     deeper" is the wrong fix and is not the fix here.
//   * A tap shorter than an animation frame is `[mask, 0]` -- two entries -- so
//     from a drained queue the cap must be at least 2.
//
// THE MEMORY BOUND IS TWO WORDS, FOR EVER. `pending.push` is reachable only
// under `pending.length < MAX_PENDING`; the merge branch writes in place and
// never grows the array. A page left running for an hour holds two numbers, the
// same two it held at boot, whatever the event rate.
//
// WHAT IS STILL NOT REPRESENTABLE, and it is COUNTED rather than left in a
// comment -- a rule that hid its own loss in a comment is why this file is being
// edited a second time. A bit pressed, RELEASED and pressed AGAIN before the
// first press has been handed to a logic frame cannot produce two edges: the
// first press is still set in the word ahead, and `now & ~prev` cannot rise from
// a bit that never fell. That is a second tap of the same button within one to
// two frames, i.e. above 30 Hz on one finger, and it is the FRAME QUANTUM the
// cartridge itself has -- `$81BF` runs once per NMI, so real hardware cannot
// express it either.
//
// `lostEdges` is exactly that number, counted on both the merge path and the
// ordinary push path, and index.html prints it. THE BOOKS BALANCE and
// tests/loop.test.js asserts it over 40,000 random events:
//
//     presses in the event stream  ==  $0005 edges produced  +  lostEdges
//
// which is the strongest claim this design can make, and precisely the claim
// wave 14's rule broke SILENTLY: under `pending[last] = w` a press evaporated
// with no counter moving, so the page could show a healthy `inq 1` while every
// shot was being destroyed.
const MAX_PENDING = 2;

/** States not yet consumed by a logic frame, oldest first. Length <= MAX_PENDING. */
const pending = [];

/** The mask as of the last event. What a logic frame gets once the queue is dry. */
let live = 0;

/** The last word handed to a logic frame. `prev` for the merge when depth is 1. */
let delivered = 0;

/** Logic frames that found the queue empty and reused `live`. Diagnostic only. */
let repeats = 0;
/** Transitions merged into the tail because the queue was at the cap. */
let coalesced = 0;
/** Merges that had to carry a press forward past its own release. */
let carried = 0;
/**
 * Presses that will produce NO `$0005` edge, because the bit is already set in
 * the word that will precede them in the delivery order. This is the one number
 * here that means an input the player made produced nothing, and it is counted
 * on BOTH paths -- the merge at the cap and the ordinary push -- because the
 * push can spend an edge too, when a tap lands on top of a press the queue has
 * not handed out yet.
 */
let lostEdges = 0;

/**
 * Called after ANY change to `held` or `touchHeld`. Idempotent: a handler that
 * fires without changing the mask queues nothing, so holding a key does not
 * push 60 identical words a second.
 *
 * THE GUARD BELOW IS LOAD-BEARING AND WAS UNTESTED FOR A WHOLE WAVE. Deleting
 * `if (w === live) return;` left all 368 of wave 14's checks green, because
 * every queue test handed the setters a DIFFERENT mask each time. Without it,
 * auto-repeat keydowns and a finger resting in one third of the d-pad push a
 * word per event, the queue never drains, and a never-draining queue is exactly
 * the state that used to destroy taps. `tests/loop.test.js` PART 2b now hands
 * the setters the same mask on purpose; see the wave-15 worklog's mutation
 * table for the red.
 */
function noteInput() {
  const w = u8(held | touchHeld);
  if (w === live) return;
  const rising = u8(w & ~live);          // the bits this transition PRESSES
  live = w;
  if (pending.length < MAX_PENDING) {
    // Room: the word goes in whole and nothing is merged. It still gets no EDGE
    // for a bit that the word already in front of it leaves set -- `now & ~prev`
    // cannot rise from a bit that never fell -- so say so rather than let the
    // page report a clean queue while a tap does nothing.
    const ahead = pending.length ? pending[pending.length - 1] : delivered;
    if (rising & ahead) lostEdges++;
    pending.push(w);
    return;
  }
  // AT THE CAP. The tail is collapsed onto `prev`, so `prev` becomes the word
  // the merged one is edged against, and everything still undelivered in the
  // queue -- tail OR prev -- is already spent as far as a NEW press of the same
  // bit is concerned.
  const tail = pending[pending.length - 1];
  const prev = pending.length >= 2 ? pending[pending.length - 2] : delivered;
  const undelivered = u8(tail & ~prev);   // rising edges the queue still owes
  if (rising & (tail | prev)) lostEdges++;
  const merged = u8(w | undelivered);     // <- a press survives its own release
  if (merged !== w) carried++;
  pending[pending.length - 1] = merged;
  coalesced++;
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

export function detachInput() {
  if (inputTarget) {
    inputTarget.removeEventListener?.('keydown', keyDown);
    inputTarget.removeEventListener?.('keyup', keyUp);
    inputTarget.removeEventListener?.('blur', blurKeyboard);
    inputTarget = null;
  }
  resetInput();
}

export function attachInput(target = (typeof window !== 'undefined' ? window : null)) {
  if (!target || target === inputTarget) return; // headless: tests drive readJoypad()
  detachInput();
  inputTarget = target;
  target.addEventListener('keydown', keyDown);
  target.addEventListener('keyup', keyUp);
  target.addEventListener('blur', blurKeyboard);
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
  if (pending.length === 0) { repeats++; delivered = live; return live; }
  delivered = pending.shift();
  return delivered;
}

/**
 * Diagnostics for the page and for tests.
 *
 * `depth` is what has not been consumed yet -- a number that sits at MAX_PENDING
 * means the host is not running enough logic frames to keep up with the events,
 * which is the condition this whole mechanism exists to survive.
 *
 * `coalesced` counts transitions merged into the tail. It is NOT a loss count
 * and index.html must not label it one: a merge drops an intermediate LEVEL and
 * keeps every press (see the wave-15 note above). It is 0 in ordinary keyboard
 * play and large under a finger on the d-pad, where it is normal.
 *
 * `carried` is the merges that had to hold a press past its own release --
 * i.e. taps that the wave-14 rule would have thrown away. `lostEdges` is the
 * only number here that means an input the player made produced nothing.
 */
export function inputQueueStats() {
  return {
    depth: pending.length, live, repeats, coalesced, carried, lostEdges,
    cap: MAX_PENDING,
  };
}

/**
 * Drop everything: the mask, the queue and the edge memory. Runtime shutdown
 * uses this so picker keys cannot become transitions in a restarted game. Tests
 * also use it because they share one module instance across files.
 */
export function resetInput() {
  held = 0; seen = 0; touchHeld = 0; live = 0; delivered = 0;
  pending.length = 0; repeats = 0; coalesced = 0; carried = 0; lostEdges = 0;
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
