// Scripted moves: the automatic walk-through that fires on an exit or trigger
// cell.  ROM: armed at loc_00_272C, driven at loc_00_164A.
//
// This is NOT a level transition. Touching collision $04 (floor) or $05
// (horizontal) hands control to a short canned animation -- Batman walks into
// a doorway, or steps up onto a ledge -- and normal player logic is bypassed
// entirely until the script runs out.
//
// State ($C737-$C73A):
//   $C737 mode 1-3, 0 = inactive. Also selects the script AND its direction:
//         an EVEN mode walks the script backwards and flips each direction's
//         low bit, so one script serves both ways through a door.
//   $C738 steps remaining
//   $C739 X progress accumulator
//   $C73A Y progress accumulator

import { u8, u16 } from './state.js';

const STEP = 0x60;          // 6 px per frame ($0060 / $FFA0)

/**
 * ROM: loc_00_272C. Arm a scripted move.
 *
 * The mode is chosen purely from the player's metatile column, and the far
 * right of a map ($2F and beyond) reports SOLID instead of triggering.
 *
 * @returns the collision value to report: 0 (passable) or 1 (solid)
 */
export function armScriptedMove(state) {
  const p = state.player;
  const s = state.script;

  if (s.mode !== 0) {                  // $272F: already running
    p.action = 0;                      // $276F
    return 0;
  }

  const col = p.x >> 8;                // $2732
  let mode;
  if (col < 0x06) mode = 1;            // $2734
  else if (col < 0x20) mode = 2;       // $2738
  else if (col >= 0x2F) return 1;      // $273E: solid, no script
  else mode = 3;                       // $2740

  s.mode = mode;                       // $274A
  s.steps = state.tables.scriptSteps[mode - 1] ?? 0;   // $2751-$2756
  s.accX = u8((p.x & 0xF0) + 0x80);    // $2759
  s.accY = p.y & 0xF0;                 // $2762

  requestSound(state, 0x23);           // $2769
  p.action = 0;                        // $276F
  return 0;
}

/**
 * ROM: loc_00_164A. One frame of the scripted move.
 * @returns true if a script consumed this frame (normal player logic skipped)
 */
export function updateScriptedMove(state) {
  const p = state.player;
  const s = state.script;

  p.attrMask = 0;                      // $1640: cleared every frame regardless
  if (s.mode === 0) return false;      // $1647 -> loc_00_170A

  const t = state.tables;
  const base = t.scriptPtrs[s.mode - 1];
  if (base === undefined) { s.mode = 0; return false; }
  const odd = (s.mode & 1) !== 0;

  // $165C: odd modes index the script forward, even modes backward.
  const idx = base + (odd ? s.steps : -s.steps);
  let dir = t.scriptData[idx] ?? 0;    // $166C
  if (!odd) dir ^= 1;                  // $1674: and mirror left/right

  if (dir === 0) stepX(state, +STEP);        // $1689
  else if (dir === 1) stepX(state, -STEP);   // $168E
  else if (dir === 2) stepY(state, -STEP);   // $1693
  else stepY(state, +STEP);                  // $1684
  return true;
}

/** ROM: loc_00_16D4 */
function stepX(state, delta) {
  const p = state.player;
  const s = state.script;

  p.x = u16(p.x + delta);              // $16D4 -> sub_00_18E7

  // $16DB: accumulate the ABSOLUTE step; a carry means a metatile was crossed.
  const sum = s.accX + Math.abs(delta);
  if (sum <= 0xFF) { s.accX = sum; return; }   // $16E3: JR NC

  p.x = (p.x & 0xFF00) | 0x80;         // $16E5: snap Xlo to the centre
  const left = s.steps - 1;
  if (left < 0) {                      // $16EE: JR NC fails -> script over
    p.vx = 0x40;                       // $16F0
    s.mode = 0;                        // $16F5
    p.vy = 0;                          // $16F8
    p.air = 0;                         // $16FA
    s.accX = 0;
    return;
  }
  s.steps = left;                      // $16FE
  s.accX = 0;                          // $1701: XOR A -> $C739
}

/** ROM: loc_00_1696 */
function stepY(state, delta) {
  const p = state.player;
  const s = state.script;

  p.y = u16(p.y + delta);              // $1696 -> sub_00_18F1

  const sum = s.accY + Math.abs(delta);
  if (sum <= 0xFF) { s.accY = sum; return; }   // $16A9: JR NC

  p.y = p.y & 0xFF00;                  // $16AB: snap Ylo to 0
  // $16AE: moving UP also bumps the row, compensating for the snap.
  if (delta < 0) p.y = u16(p.y + 0x100);

  const left = s.steps - 1;
  if (left < 0) {                      // $16BC
    p.air = 1;                         // $16BE: leaves you rising
    p.vy = 0x30;                       // $16C2
    s.mode = 0;                        // $16C6
    p.vx = 0;                          // $16CA
    s.accY = 0;
    return;
  }
  s.steps = left;                      // $16CE
  s.accY = 0;                          // $1706
}

/** ROM: sub_00_0AE1 mailbox. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
