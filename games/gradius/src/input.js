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
  target.addEventListener('blur', () => { held = 0; seen = 0; });
}

/** The live keyboard mask, in $0007's bit layout. */
export function currentButtons() { return held; }

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
