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
import { portWordFromPlayerBits } from '../input.js';
import { createInput, attachFloatingStick } from '../../../../shared/input.js';

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

// DOJ control name -> normalized action name (shared/input.js's vocabulary).
// The keyboard is now driven by the shared layer; this table is the bridge from
// the DOJ names game.json and the tests carry to the neutral names the shared
// controller speaks.
const DOJ_TO_NORMAL = Object.freeze({
  UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT',
  SHOT: 'A1', BOMB: 'A2', AUTO: 'A3', START: 'START',
});

/** e.code -> normalized action, derived from KEYMAP.  Both KeyY and KeyZ map to
 *  A1 (SHOT), preserving the Swiss QWERTZ binding the owner asked for twice. */
const KEYMAP_BY_CODE = Object.freeze(
  Object.fromEntries(Object.entries(KEYMAP)
    .map(([code, control]) => [code, DOJ_TO_NORMAL[control]])));

// Owner decision (04-INPUT-SYSTEM.md section 11): gamepad bomb = button B
// (Standard button 1). A -> a1 (SHOT), B -> a2 (BOMB), X -> a3 (AUTO),
// start -> START, and back/select -> SELECT. DOJ routes SELECT to the separate
// P1 coin port below; it never enters the player-port bit shuffle.
export const GAMEPAD_MAP = Object.freeze({
  a: 'A1', b: 'A2', x: 'A3', back: 'SELECT', start: 'START',
});

// Two shared controllers feed the board's two halves of `$C08000`. Controller 0
// also owns the P1 keyboard map; controller 1 is physical-pad only, so mobile and
// keyboard remain P1-only.
let controller = null;
let controllerP2 = null;
const controllerCoinDown = [false, false];
const controllerCoinBlocked = [false, false];
const controllerHadPad = [false, false];
let touchHeld = 0;

/** Convert one normalized controller state to `$803970/$803976` bit positions. */
function maskFromController(c) {
  if (!c) return 0;
  const s = c.state();
  let mask = 0;
  if (s.up) mask |= M('UP');
  if (s.down) mask |= M('DOWN');
  if (s.left) mask |= M('LEFT');
  if (s.right) mask |= M('RIGHT');
  if (s.a1) mask |= M('SHOT');
  if (s.a2) mask |= M('BOMB');
  if (s.a3) mask |= M('AUTO');
  if (s.start) mask |= M('START');
  return mask & 0xffff;
}

/** P1's live mask: controller index 0 plus the P1-only mobile/keyboard paths. */
export function currentMask() {
  return (maskFromController(controller) | touchHeld) & 0xffff;
}

/** P2's live mask: controller index 1 only. Mobile remains deliberately P1-only. */
export function currentP2Mask() { return maskFromController(controllerP2); }

/** Bit POSITIONS, for `portWordFromBits`. */
export function currentBits(mask = currentMask()) {
  const out = [];
  for (let b = 0; b < 16; b++) if (mask & (1 << b)) out.push(b);
  return out;
}

/** The board's one `$C08000` word this frame, with P1 in its low-byte path
 * and P2 in its high-byte path, through `$13D464`'s existing machine contract. */
export function currentPortWord() {
  return portWordFromPlayerBits(currentBits(), currentBits(currentP2Mask()));
}

// ----------------------------------------------------------------- $C08004, THE COIN PORT
//
// `$C08004` IS A DIFFERENT PORT FROM `$C08000` AND MUST NOT GO THROUGH `portWordFromBits`.
// That function is the inverse of build A's `$13D464`, which does `ror.w #1,D0` before `not.w`,
// so it clears bit `(b+1) & 15` -- the PLAYER port's shuffle, and nothing else's. The coin port
// has no shuffle: `$13CFBA` and `$13CEC8` both do a plain `move.w (A0),D0 / not.w D0`, so bit N
// of the word IS switch N. Running a coin bit through the player shuffle credits the wrong slot
// on the wrong frame, and conflating the two ports already cost six test failures once.
//
// ACTIVE LOW: idle is $FFFF and a held switch CLEARS its bit.
//
// The bit numbers are the cartridge's own I/O TEST screen, which reads `$C08004` and labels each
// bit it finds low:
//     $156BF2 btst #$5  SERVICE      $156C2E btst #$0  COIN 1
//     $156C10 btst #$4  TEST         $156C4C btst #$1  COIN 2
//
// KEYS, MAME-conventional and by `e.code` so they are layout-invariant. The digits and F2 sit in
// the same physical place on Swiss QWERTZ as on US QWERTY, so no pairing is needed here -- but
// THE STANDING RULE IS UNCHANGED: any binding that ever uses `KeyZ` or `KeyY` must bind BOTH,
// the way SHOT does above.

/** Coin-port switch -> its BIT POSITION in the raw `$C08004` word. */
export const COIN_BITS = Object.freeze({ COIN1: 0, COIN2: 1, TEST: 4, SERVICE: 5 });

/** `e.code` -> coin switch. PHYSICAL positions. */
export const COIN_KEYMAP = Object.freeze({
  Digit5: 'COIN1', Digit6: 'COIN2', Digit9: 'SERVICE', F2: 'TEST',
});

// THE KEY DEBOUNCE, and it exists because of a real UX cliff in `$13CEC8`.
//
// That routine counts how many of ITS OWN calls a coin switch was held for, and credits only when
// the count lands in [3, $26] INCLUSIVE. It runs once every two video frames (IRQ4 fires once per
// frame -- measured n=2617 over 1,901 logic frames -- and `$1453BC andi.w #$1` halves that), so
// the window is 6 to 76 video frames, roughly 0.1 s to 1.27 s. A key held past that writes $0001
// instead of $0080 and CREDITS NOTHING, SILENTLY.
//
// A human leaning on the 5 key blows straight through 1.27 s. So a keydown does not hand the port
// a held switch: it arms a fixed-length PULSE measured in debounce calls, parks it in the middle
// of the window, and lets go by itself. One press, one coin, however long the key is down.
//
// 12 calls = 24 video frames = about 0.4 s, comfortably inside [3, 38].
export const COIN_PULSE_CALLS = 12;

// Only COIN1 and COIN2 are pulsed: they are the two the debounce watches (record 0 -> port bit 0,
// record 1 -> port bit 1, via the `ror.w #1,D0` at `$13CF76`). SERVICE and TEST never reach it.
// SERVICE goes through `$13CFBA`'s EDGE word instead -- `prev & now & $E0` is a rising edge, so a
// held SERVICE key already fires exactly once and pulsing it would be a second, wrong debounce.
const coinPulse = { COIN1: 0, COIN2: 0 };

// The raw key state, one bit per COIN_BITS entry, 1 = HELD. Kept separate from the pulse so a
// fresh press can be told from an autorepeat.
let coinHeld = 0;

/** Press or release one coin switch by name. A press EDGE arms the pulse; a release does NOT
 *  cancel it, so even a one-frame tap still spends its full 12 calls and credits. */
export function setCoinKey(name, down) {
  const b = 1 << COIN_BITS[name];
  if (down) {
    if (coinHeld & b) return;                 // autorepeat / already down -- do not re-arm
    coinHeld |= b;
    if (name in coinPulse) coinPulse[name] = COIN_PULSE_CALLS;
  } else {
    coinHeld &= ~b;
  }
}

/**
 * The raw `$C08004` word this frame. Starts at $FFFF and CLEARS each held bit.
 *
 * PURE -- calling it twice in a frame returns the same word and changes nothing. That matters
 * because two ROM routines read this port at DIFFERENT RATES: `$13CFBA` once per IRQ6 (every
 * frame) and `$13CEC8` once per two. Advancing the pulse in here would make the answer depend on
 * who asked last. `tickCoinPulse()` below is the advance, and it belongs next to the debounce.
 */
export function currentCoinWord() {
  let w = 0xffff;                                            // ACTIVE LOW: idle is all ones
  for (const [name, b] of Object.entries(COIN_BITS)) {
    // A pulsed switch reports its PULSE, not the key; the others report the key.
    const on = (name in coinPulse) ? coinPulse[name] > 0 : (coinHeld & (1 << b)) !== 0;
    if (on) w &= ~(1 << b);                                  // held -> bit CLEARED
  }
  return w & 0xffff;
}

/** Advance the coin pulse by one `coinDebounce13CEC8` call. CALL IT EXACTLY WHERE THE DEBOUNCE IS
 *  CALLED -- once per two video frames -- and nowhere else. Ticking it per frame halves the hold
 *  the ROM sees; ticking it twice per debounce call quarters it. */
export function tickCoinPulse() {
  for (const k of Object.keys(coinPulse)) if (coinPulse[k] > 0) coinPulse[k]--;
}

/** The coin backstop for replay, controller loss, and page lifecycle boundaries.
 *  A controller that was already present is blocked until a sampled release, so
 *  its still-held SELECT cannot recreate the pulse that this boundary cancels. */
export function clearCoin() {
  coinHeld = 0;
  for (const k of Object.keys(coinPulse)) coinPulse[k] = 0;
  for (let i = 0; i < 2; i++) {
    controllerCoinDown[i] = false;
    controllerCoinBlocked[i] ||= controllerHadPad[i];
  }
}

/**
 * Wire the coin keys. Separate from `attachInput`'s shared controller because the shared
 * controller speaks the PLAYER port's normalized vocabulary and these switches are not in it.
 * `visibilitychange` belongs to the document, not the window event target.
 *
 * @returns {() => void} the backstop, already wired to lifecycle boundaries.
 */
export function attachCoinKeys(
  target = (typeof window !== 'undefined' ? window : null),
  documentTarget = (typeof document !== 'undefined' ? document : null),
) {
  if (!target && !documentTarget) return clearCoin;   // headless tests drive setCoinKey
  const onDown = (e) => {
    const name = COIN_KEYMAP[e.code];
    if (!name) return;
    e.preventDefault();                              // F2 is a browser shortcut in some hosts
    if (e.repeat) return;                            // setCoinKey ignores it too; belt and braces
    setCoinKey(name, true);
  };
  const onUp = (e) => {
    const name = COIN_KEYMAP[e.code];
    if (!name) return;
    e.preventDefault();
    setCoinKey(name, false);
  };
  target?.addEventListener('keydown', onDown);
  target?.addEventListener('keyup', onUp);
  target?.addEventListener('blur', clearCoin);
  target?.addEventListener('pagehide', clearCoin);
  target?.addEventListener('gamepaddisconnected', clearCoin);
  documentTarget?.addEventListener('visibilitychange', clearCoin);
  return clearCoin;
}

// ---------------------------------------------- shared controller (kb + pad)

/**
 * Create and attach the shared input controller (keyboard + gamepad).  Replaces
 * the per-game keyboard handler: the launch-Enter / `e.repeat` / firstSample
 * guard is now generalized inside `shared/input.js`'s `createInput`, and the
 * gamepads (Standard and maintained non-Standard profiles, radial deadzone plus
 * 8-way gate) are wired alongside it by exact browser index. Index 0 owns P1;
 * index 1 owns P2 and receives no keyboard mapping.
 *
 * Both normalized states are read by `currentPortWord()` above each logic frame;
 * the ROM-faithful one-word `$C08000` shuffle is unchanged.
 *
 * @returns P1's controller, preserving the existing caller contract.
 */
export function attachInput(target = (typeof window !== 'undefined' ? window : null)) {
  controller = createInput({
    keyboard: KEYMAP_BY_CODE,
    gamepad: GAMEPAD_MAP,
    gamepadIndex: 0,
  });
  controllerP2 = createInput({ gamepad: GAMEPAD_MAP, gamepadIndex: 1 });
  controllerCoinDown.fill(false);
  controllerCoinBlocked.fill(false);
  controllerHadPad.fill(false);
  if (target) {
    controller.attach(target);
    controllerP2.attach(target);
  }
  return controller;
}

/** Refresh both indexed gamepads once per animation frame. Each pad's
 * back/select feeds its matching active-low coin bit through the existing fixed
 * pulse. Lifecycle clears block either held SELECT until that pad releases. */
export function pollInput() {
  const pads = [controller, controllerP2];
  if (!pads[0] || !pads[1]) return;

  for (const pad of pads) pad.pollGamepad();
  const hasPad = pads.map((pad) => pad.hasPad);
  const lostPad = controllerHadPad.some((had, i) => had && !hasPad[i]);
  if (lostPad) {
    clearCoin();
    for (let i = 0; i < 2; i++) controllerHadPad[i] = hasPad[i];
    return;
  }
  for (let i = 0; i < 2; i++) controllerHadPad[i] = hasPad[i];

  for (let i = 0; i < 2; i++) {
    if (!hasPad[i]) continue;
    const down = !!pads[i].state().select;
    const coin = i === 0 ? 'COIN1' : 'COIN2';
    if (!down) {
      setCoinKey(coin, false);
      controllerCoinDown[i] = false;
      controllerCoinBlocked[i] = false;
      continue;
    }
    if (controllerCoinDown[i]) continue;
    controllerCoinDown[i] = true;
    if (!controllerCoinBlocked[i]) setCoinKey(coin, true);
  }
}

/** Whether either profiled gamepad was seen on the last poll. UI hint only. */
export function hasGamepad() {
  return !!(controller?.hasPad || controllerP2?.hasPad);
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

/** Test seam + page backstop: the keyboard half of the reset.  With the shared
 *  controller, this clears its keyboard state; in headless (no controller) it is
 *  a no-op, which is what the tests need -- they drive touchHeld directly. */
export function clearKeyboard() { controller?.clearKeyboard(); }

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
 * Wire an on-screen pad. `dpadEl` is ONE capture target hit-tested by
 * `dpadMask`; `buttons` carry either `data-btn="SHOT"` for the player port or
 * `data-coin="COIN1"` for the separate coin port.
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
    const coinName = b.dataset.coin;
    if ((name ? 1 : 0) + (coinName ? 1 : 0) !== 1) {
      throw new Error('on-screen button needs exactly one of data-btn or data-coin');
    }
    if (name && !(name in CONTROLS)) {
      throw new Error(`on-screen button data-btn="${name}" is not a control; `
        + `known: ${Object.keys(CONTROLS).join(', ')}`);
    }
    if (coinName && !(coinName in COIN_BITS)) {
      throw new Error(`on-screen button data-coin="${coinName}" is not a coin switch; `
        + `known: ${Object.keys(COIN_BITS).join(', ')}`);
    }
    const setButton = coinName
      ? (down) => setCoinKey(coinName, down)
      : (down) => setTouchButton(name, down);
    const press = (e) => {
      e.preventDefault();
      // The finger may slide off the button; the capture keeps its release ours.
      b.setPointerCapture?.(e.pointerId);
      b.dataset.on = '1';
      setButton(true);
    };
    const release = (e) => {
      e.preventDefault();
      delete b.dataset.on;
      setButton(false);
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
    for (const b of buttons) {
      if (b.dataset.coin) setCoinKey(b.dataset.coin, false);
      delete b.dataset.on;
    }
  };
}

/**
 * Wire a floating touch stick on `zoneEl` (the left-half movement zone).  The
 * stick origin appears on pointerdown; the drag delta runs through the shared
 * `gate8way` deadzone + 8-way gate and the resulting four booleans are written
 * into the SAME `setTouchDirections` the fixed D-pad uses.  So both touch
 * schemes feed exactly the same path, and the picker can switch between them
 * at runtime with no game-logic change.
 *
 * The face buttons (COIN1/START/SHOT/BOMB/AUTO) stay the fixed cluster; the floating
 * stick replaces ONLY the D-pad. `onPaint` receives the direction mask while
 * `onVisual` receives the shared stick's origin and current pointer, or two
 * nulls when it clears.
 *
 * @returns {() => void} the backstop, for blur / pagehide / visibilitychange.
 */
export function attachStick(zoneEl, { onPaint, onVisual } = {}) {
  const onDirections = ({ up, down, left, right }) => {
    let m = 0;
    if (up) m |= M('UP');
    if (down) m |= M('DOWN');
    if (left) m |= M('LEFT');
    if (right) m |= M('RIGHT');
    setTouchDirections(m);
    onPaint?.(m, up || down || left || right);
  };
  return attachFloatingStick(zoneEl, { onDirections, onPaint: onVisual });
}
