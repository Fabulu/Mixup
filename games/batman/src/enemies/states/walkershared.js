// Shared walker movement: the step, the wall reaction, the ledge scan and the
// scripted pit leap.
//
// ROM range: loc_01_521B / loc_01_54E5 (move right), loc_01_5329 / loc_01_558D
// (move left), loc_01_5228 and loc_01_54F3 (the two wall stops), loc_01_5262
// (the hard turn), loc_01_5288 / loc_01_5339 (the ledge scan) and sub_01_7D09
// with its tables at 1:$7E3F-$7F28.
//
// WHY THIS IS A FILE AND NOT PART OF walker.js. States 1 and 2 share the step
// and the scan but NOT the wall reaction -- state 1 turns around, state 2
// pushes on into the wall at +-$12 and relies on the jump assist -- so the ROM
// passes the reaction in and the port passes `wallStop` as a parameter. Both
// arms live here, together, because the difference between them is the whole
// point and it is only visible with the two side by side.
//
// game.json's enemies[] entries for states 1 and 2 name this file in their
// `shared` field for the same reason.

import { u8, i8, u16, mapCollisionByIndex } from '../../state.js';
import {
  E_FLAGS, E_FACING, E_X_HI, E_X_LO, E_Y_HI, E_Y_LO, E_VX,
} from '../record.js';
import { addX } from '../util.js';
import { probeRight, probeLeft } from '../probe.js';
import { riseTail, fallTail } from '../tails.js';

// ---------------------------------------------------------------------------
// Shared walker movement: move + probe + ledge scan.
// ---------------------------------------------------------------------------

/** ROM: loc_01_521B (state 1) / loc_01_54E5 (state 2). */
export function walkerMoveRight(state, r, v, wallStop) {
  addX(r, i8(v));                                   // sub_01_63AD
  if (probeRight(state, r) !== 0) {                 // sub_01_63B4
    r[E_X_LO] = 0x80;                               // $5225: snap X-lo to centre
    return wallStop(state, r);
  }
  return ledgeCheck(state, r, +1);                  // loc_01_5288
}

/** ROM: loc_01_5329 / loc_01_558D. */
export function walkerMoveLeft(state, r, v, wallStop) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // sub_01_6499
    r[E_X_LO] = 0x80;
    return wallStop(state, r);
  }
  return ledgeCheck(state, r, -1);                  // loc_01_5339
}

/**
 * ROM: loc_01_5228 (state 1). Just hit a wall: clear the walk commitments,
 * then -- if grounded and not mid-animation -- react. r[1] bit 7 latches so a
 * wall is reacted to once: first contact turns (or, via the wall-ahead assist
 * in the probe, jumps), the next merely stops.
 */
export function wallStopWalker(state, r) {
  r[0x15] = 0;                                      // $522C
  r[1] &= ~0x10;                                    // $5232
  r[E_FLAGS] &= ~0x08;                              // $5237
  if (r[E_FLAGS] & 0x01) return riseTail(state, r);       // $5239
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);       // $523E
  const f1 = r[1];                                  // $5244
  if (f1 & 0x60) return riseTail(state, r);         // $5245 -> $552B
  if (f1 & 0x80) {                                  // $524F: latched -- stop
    r[1] = f1 & 0x7F;
    r[E_VX] = 0;                                    // $525B
    return riseTail(state, r);
  }
  turnHard(state, r, f1);                           // $5262
  return riseTail(state, r);
}

/** ROM: loc_01_54F3 (state 2) - same, but the turn keeps its facing. */
export function wallStopWalkerJump(state, r) {
  r[0x15] = 0;
  r[1] &= ~0x10;
  r[E_FLAGS] &= ~0x08;
  if (r[E_FLAGS] & 0x01) return riseTail(state, r);
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);
  const f1 = r[1];
  if (f1 & 0x60) return riseTail(state, r);
  if (f1 & 0x80) {                                  // $551C
    r[1] = f1 & 0x7F;
    r[E_VX] = 0;
    return riseTail(state, r);
  }
  // $5531: unlike state 1 this does NOT flip the facing -- it pushes on into
  // the wall at +-$12, relying on the wall-ahead jump assist to clear it.
  r[1] = f1 | 0xC0;
  r[E_VX] = r[E_FACING] === 0 ? 0x12 : 0xEE;        // $5540 / $5544
  r[0x18] = 8;                                      // $554B
  return riseTail(state, r);
}

/** ROM: loc_01_5262 - flip facing, walk away at +-$10, start the turn anim. */
export function turnHard(state, r, f1) {
  r[1] = f1 | 0xC0;                                 // $5262
  r[E_FACING] ^= 1;                                 // $526A
  r[E_VX] = r[E_FACING] === 0 ? 0x10 : 0xF0;        // $5274 / $5278
  r[0x18] = 8;                                      // $527F
}

/**
 * ROM: loc_01_5288 (rightward) / loc_01_5339 (leftward).
 *
 * After an unobstructed step, scan the column half a metatile ahead (+$80
 * going right, -$90 going left) from one row below the feet down to the world
 * bottom. Any solid cell = ground is coming, keep walking (and re-assert the
 * facing). A completely empty column is a pit: consult the per-level leap
 * table (sub_01_7D09) and either jump it or turn around.
 *
 * Quirk kept: the scan row starts at (Yhi+1) & $0F but ITERATES $20-(Yhi+1)
 * times, so an enemy in the lower half of the map scans past its own column
 * bottom into the top rows of the NEXT column.
 */
export function ledgeCheck(state, r, dir) {
  if (r[E_FLAGS] & 0x03) return riseTail(state, r);       // $528F: airborne -- skip
  const x = (r[E_X_HI] << 8) | r[E_X_LO];
  const col = u16(x + (dir > 0 ? 0x80 : -0x90)) >> 8;       // $529A / $534B
  const rowBelow = u16(((r[E_Y_HI] << 8) | r[E_Y_LO]) + 0x100) >> 8;   // $52A6
  let found = false;
  let idx = col * 16 + (rowBelow & 0x0F);           // sub_00_11B9
  for (let n = 0x20 - rowBelow; n > 0; n--, idx++) {
    if (mapCollisionByIndex(state, idx) !== 0) { found = true; break; }  // $52B6
  }
  if (!found) found = gapLeap(state, r);            // $52C5 -> sub_01_7D09
  if (found) {                                      // $52E1 / $537D
    r[E_FACING] = dir > 0 ? 0 : 1;
    return riseTail(state, r);
  }
  const f1 = r[1];                                  // $52D4
  if (f1 & 0x60) return riseTail(state, r);
  turnHard(state, r, f1);                           // $52DF -> $5262
  return riseTail(state, r);
}

/**
 * ROM: sub_01_7D09 + tables 1:$7E3F-$7F28.
 *
 * Scripted pit leaps: a per-level nibble table indexed by Xhi>>1 (even column
 * = high nibble) names one of 14 canned {Yvel, Xvel} pairs. Nonzero = launch
 * immediately (bit 0 set right here, unlike the wall jump which waits out the
 * turn animation).
 */
/**
 * Per-level base offsets into `gapTable`, plus the column guard each is paired
 * with. These are IMMEDIATES in the dispatch at $7D2E-$7D5F, not a pointer
 * table, so they belong next to the code rather than in the manifest.
 *
 * Levels 7 and 13 share $7EDC and the same $4C guard -- that is not a typo.
 * There is a sixth arm at $7D59 (guard $4E, table $7F02) that nothing jumps
 * to: the JR at $7D57 steps over it, and the disassembler finds no xref. It
 * is dead on the cartridge, so no level maps to it here either.
 */
const GAP_BASE = { 1: 0x00, 2: 0x40, 3: 0x50, 5: 0x78, 7: 0x9D, 0x0D: 0x9D };
/** Column past which each guarded level stops leaping. $7D39/$7D44/$7D4F. */
const GAP_GUARD = { 3: 0x43, 5: 0x4A, 7: 0x4C, 0x0D: 0x4C };

export function gapLeap(state, r) {
  const lvl = state.level.number;
  const xhi = r[E_X_HI];
  if (xhi >= (GAP_GUARD[lvl] ?? 0x100)) return false;
  const base = GAP_BASE[lvl];
  if (base === undefined) return false;             // $7D2B
  const table = state.tables?.gapTable;
  const leaps = state.tables?.gapLeaps;
  // Levels 1, 2, 3, 5, 7 and 13 all reach this. A missing table would silently
  // turn every scripted leap into a turn-around, which looks like plausible
  // enemy behaviour -- so refuse to guess.
  if (!table || !leaps) {
    throw new Error('gapLeap: tables.gapTable/gapLeaps missing from the manifest');
  }
  const byte = table[base + (xhi >> 1)] ?? 0;
  const id = (xhi & 1) ? (byte & 0x0F) : (byte >> 4);   // $7D63
  if (id === 0 || id > 14) return false;            // $7D71 / $7DB9
  const [yv, xv] = leaps[id - 1];
  r[0x13] = yv;                                     // per-leap launch velocity
  r[E_VX] = (r[E_FACING] & 1) ? u8(-xv) : xv;       // $7E26: signed by facing
  r[E_FLAGS] |= 0x01;                               // $7E31: rising, NOW
  return true;
}
