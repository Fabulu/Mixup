// Input.  ROM: the joypad read inside the VBlank ISR, $07CC-$07F6.
// Produces the same bit layout as $FFE1 (held) / $FFE2 (newly pressed).
//
// This module has NO imports on purpose.  BTN lived in src/player.js until
// Phase 10, which meant the joypad module depended on the player state machine
// -- backwards, and the reason fourteen of player.js's seventeen inbound edges
// were modules that wanted nothing from it but eight bit masks.

// Joypad bits ($FFE1/$FFE2)
export const BTN = {
  A: 0x01, B: 0x02, SELECT: 0x04, START: 0x08,
  RIGHT: 0x10, LEFT: 0x20, UP: 0x40, DOWN: 0x80,
};

// Keys are matched on e.code, i.e. PHYSICAL position, not the printed letter.
// On a QWERTZ layout (Swiss/German) the key labelled Z sits where QWERTY has Y
// and reports as `KeyY` -- so both are bound to attack, and the pair works out
// the same on either layout. Space and C are accepted as alternates too.
const KEYMAP = {
  KeyX: BTN.A,        Space: BTN.A,
  KeyZ: BTN.B,        KeyY: BTN.B,        KeyC: BTN.B,
  ShiftRight: BTN.SELECT, ShiftLeft: BTN.SELECT,
  Enter: BTN.START,
  ArrowRight: BTN.RIGHT, ArrowLeft: BTN.LEFT,
  ArrowUp: BTN.UP,    ArrowDown: BTN.DOWN,
  KeyD: BTN.RIGHT,    KeyA: BTN.LEFT,
  KeyW: BTN.UP,       KeyS: BTN.DOWN,
};

let held = 0;
// Keys we have seen a real (non-repeat) keydown for. Anything absent here that
// arrives as a repeat was already down before attachInput() ran -- see the
// keydown handler.
let seen = 0;
// The first sample seeds `prev` from whatever is already down, so a button
// held across the boot boundary needs a release before it counts as pressed.
// Covers the gamepad and touch paths, which have no repeat flag to test.
let firstSample = true;
let touchHeld = 0;
let inputTarget = null;

function keyDown(event) {
  const bit = KEYMAP[event.code];
  if (!bit) return;
  event.preventDefault();
  // A key still down from BEFORE we attached only ever reaches us as an
  // auto-repeat -- its real keydown went to the launcher. Taking those at face
  // value turns the Enter that clicked LAUNCH into a START press, and since
  // Enter is BTN.START the title screen is dismissed on frame 1 and the player
  // drops straight into the level having seen nothing.
  //
  // Whether that happens is a race against how long boot() takes, which is why
  // it looked like a caching problem: a warm cache boots fast enough to catch
  // the key still down, and opening devtools slows it enough to miss.
  if (event.repeat && !(seen & bit)) return;
  seen |= bit;
  held |= bit;
}

function keyUp(event) {
  const bit = KEYMAP[event.code];
  if (!bit) return;
  held &= ~bit;
  seen &= ~bit;
  event.preventDefault();
}

export function resetInput() {
  held = 0;
  seen = 0;
  touchHeld = 0;
  firstSample = true;
}

function blurInput() { resetInput(); }

/**
 * Press or release a button from an on-screen control. Kept separate from the
 * keyboard mask so a touch that never sends its "up" (finger dragged off the
 * button, browser stealing the gesture) cannot be cleared by a key event, and
 * vice versa.
 */
export function setTouchButton(bit, down) {
  if (down) touchHeld |= bit; else touchHeld &= ~bit;
}

export function clearTouchButtons() { touchHeld = 0; }

export function detachInput() {
  if (inputTarget) {
    inputTarget.removeEventListener?.('keydown', keyDown);
    inputTarget.removeEventListener?.('keyup', keyUp);
    inputTarget.removeEventListener?.('blur', blurInput);
    inputTarget = null;
  }
  resetInput();
}

export function attachInput(target = (typeof window !== 'undefined' ? window : null)) {
  if (!target || target === inputTarget) return; // headless harness drives state.input directly
  detachInput();
  inputTarget = target;
  target.addEventListener('keydown', keyDown);
  target.addEventListener('keyup', keyUp);
  target.addEventListener('blur', blurInput);
}

/** Call once per frame, before the game update. */
export function sampleInput(state) {
  const gp = readGamepad();
  const now = (held | gp | touchHeld) & 0xFF;
  if (firstSample) { state.input.prev = now; firstSample = false; }
  state.input.pressed = now & ~state.input.prev;   // $FFE2
  state.input.held = now;                          // $FFE1
  state.input.prev = now;
}

function readGamepad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
  const pads = navigator.getGamepads();
  for (const p of pads) {
    if (!p) continue;
    let v = 0;
    if (p.buttons[0]?.pressed) v |= BTN.A;
    if (p.buttons[2]?.pressed || p.buttons[1]?.pressed) v |= BTN.B;
    if (p.buttons[8]?.pressed) v |= BTN.SELECT;
    if (p.buttons[9]?.pressed) v |= BTN.START;
    if (p.buttons[12]?.pressed || p.axes[1] < -0.5) v |= BTN.UP;
    if (p.buttons[13]?.pressed || p.axes[1] > 0.5) v |= BTN.DOWN;
    if (p.buttons[14]?.pressed || p.axes[0] < -0.5) v |= BTN.LEFT;
    if (p.buttons[15]?.pressed || p.axes[0] > 0.5) v |= BTN.RIGHT;
    return v;
  }
  return 0;
}
