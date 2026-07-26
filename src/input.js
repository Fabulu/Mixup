// Input.  ROM: the joypad read inside the VBlank ISR, $07CC-$07F6.
// Produces the same bit layout as $FFE1 (held) / $FFE2 (newly pressed).

import { BTN } from './player.js';

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
let touchHeld = 0;

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

export function attachInput(target = (typeof window !== 'undefined' ? window : null)) {
  if (!target) return;             // headless harness drives state.input directly
  target.addEventListener('keydown', (e) => {
    const b = KEYMAP[e.code];
    if (b) { held |= b; e.preventDefault(); }
  });
  target.addEventListener('keyup', (e) => {
    const b = KEYMAP[e.code];
    if (b) { held &= ~b; e.preventDefault(); }
  });
  target.addEventListener('blur', () => { held = 0; });
}

/** Call once per frame, before the game update. */
export function sampleInput(state) {
  const gp = readGamepad();
  const now = (held | gp | touchHeld) & 0xFF;
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
