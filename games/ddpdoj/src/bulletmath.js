// THE ANGLE AND SPEED MATHS OF THE ENEMY BULLETS -- `$284190`, exactly.
//
// This is the whole of it.  Fourteen instructions, three tables, and if any one
// of the four conventions below is wrong the bullet is in the wrong place a
// second later and no amount of per-frame agreement on one path will say so.
//
//   284190: add.w D0,D0 / add.w D0,D0        speed * 4  -- a LONGWORD index
//   284194: lea $200920,A3 / movea.l (A3,D0.w),A3       the per-SPEED table
//   28419E: move.w D1,D3 / add.w D3,D3       direction * 2 -- a WORD index
//   2841A2: lea ($283F50,PC),A2 / adda.w D3,A2 / adda.w (A2),A3   THE FOLD
//   2841AA: move.l (A3)+,D2 / move.l (A3)+,D3
//   2841AE: asr.l #4,D2 / asr.l #4,D3        the tables are 1/16ths
//   2841B2: andi.w #$C0,D1 / lea ($2841C2,PC),A3 / adda.w D1,A3 / jmp (A3)
//           +$00 $2841C2 rts                      Q0 ( dA,  dB)
//           +$40 $284202 neg.w D2 / rts           Q1 (-dA,  dB)
//           +$80 $284242 neg.w D2 / neg.w D3 / rts Q2 (-dA, -dB)
//           +$C0 $284282 neg.w D3 / rts           Q3 ( dA, -dB)
//
// ============================ THE FOUR CONVENTIONS ==========================
//
// 1. **DIRECTION IS 1/256 TURN**, 1.40625 degrees a step, held in ONE BYTE at
//    record +$1B.  Bank-A generators (`$2813F0`..) take the angle in 1/64 turn
//    and `$281586 add.b D1,D1` TWICE before storing it; bank-B generators
//    (`$2816F6`..) take it already in 1/256.  Confusing the two puts every
//    bullet at four times its angle -- and both units are live in this
//    cartridge, in two banks of generators that otherwise look identical.
//
// 2. **SPEED IS AN INDEX, NOT A VELOCITY.**  Record +$1A is a byte 0..255 that
//    selects one of 256 tables.  A port that stores a dx/dy pair and integrates
//    it is a different program: the mover RECOMPUTES the velocity from
//    (+$1A, +$1B) EVERY FRAME (`$281EF6..$281F02`), which is exactly how a
//    curving or homing bullet works here -- the behaviour writes the direction
//    BYTE and the velocity follows.  Nothing ever stores a heading vector.
//
// 3. **THE FIELD IS AN ELLIPSE, 1.5 : 1.**  Axis A (record +$2, the vertical)
//    is 1.5040x axis B (record +$4, the horizontal) at every measured speed and
//    angle -- `w21patterns.py field` prints the ratio for 12 speeds and it is
//    1.5042 for every speed above 4.  It is the SAME 1.5 the aim carries on the
//    other axis (`$24205C`, `20-recon-aiming.md` §2), and the two cancel so a
//    shot flies down the true line.  A textbook unit-circle table plus a
//    textbook atan2 is self-consistent AND WRONG.  Ship both tables as bytes.
//
// 4. **THE UNITS.**  The table entries are LONGWORDS in 1/16 of a position
//    unit; `asr.l #4` (ARITHMETIC -- it rounds toward -infinity, and the entries
//    are non-negative before the quadrant negate, so this is exact) leaves a
//    delta in the position's own 1/64-pixel units.  Template base speed 20
//    gives 223/64 = 3.48 px per frame on axis A.  The quadrant negation happens
//    AFTER the shift, on the WORD (`neg.w`), so it is a 16-bit negate of an
//    already-shifted value and not a negate of the 1/16ths.
//
// ============================== QUANTISATION ================================
//
// There is exactly one quantiser and it is the fold table.  `$283F50` is 256
// words, MEASURED to be exactly `8 * triangle(i)` with triangle of period 128
// peaking at 64 -- so the 256 directions fold onto 65 quarter-angle records
// (0..64 INCLUSIVE, which is why the stride is 65*8 = $208 and not 64*8).
// There is NO interpolation and NO rounding anywhere else: direction 37 reads
// record 37 and that is the entire calculation.  The 1/16ths in the table are
// the game's only sub-unit precision and they are thrown away by `asr.l #4`
// before anything uses them.

import { unreached } from './unported.js';

export const VEC = {
  entry: 0x284190,
  speedPtrs: 0x200920,     // $284194 lea $200920,A3
  speedLevels: 256,        // proven from both ends: w21patterns.py field
  quadEntries: 65,         // 0..64 quarter-angles INCLUSIVE
  quadStride: 65 * 8,      // $208
  fold: 0x283f50,          // $2841A2 lea ($283F50,PC),A2
  foldEntries: 256,
  quadJump: 0x2841c2,      // $2841B6 lea ($2841C2,PC),A3 / adda.w D1,A3
};

/** `asr.l #4` -- ARITHMETIC, on the 32-bit value, rounding toward -infinity. */
const asrl4 = (v) => (v | 0) >> 4;
/** `neg.w` -- a 16-bit negate.  The result is re-read as a SIGNED word. */
const negw = (v) => ((-v) << 16) >> 16;
/** the low 16 bits of a longword, signed -- what `movem.w D2-D3,($1e,A6)`
 *  actually stores and therefore the only part of D2/D3 that survives. */
const low16 = (v) => (v << 16) >> 16;

/**
 * `$284190` -- (speed index, direction byte) -> (dA, dB), the pair the mover
 * writes to record +$1E / +$20 and adds to +$02 / +$04.
 *
 * @param rom   RomWindows -- the cartridge, read the way the 68000 reads it
 * @param speed record +$1A, 0..255 (`moveq #0,D0 / move.b ($1a,A6),D0`)
 * @param dir   record +$1B, 0..255 (`moveq #0,D1 / move.b ($1b,A6),D1`)
 * @returns {{dA:number, dB:number}} signed words.  dA goes to +$1E (axis A,
 *          the record's +$02 coordinate); dB to +$20 (axis B, +$04).
 */
export function velocity(rom, speed, dir) {
  if (!(speed >= 0 && speed < 256) || !(dir >= 0 && dir < 256)) {
    // Not defensive padding: both come from `moveq #0,Dn / move.b`, so the
    // 68000 CANNOT present anything else, and a caller that does has invented
    // a state the board has no encoding for.
    unreached(VEC.entry, `$284190 was called with speed=${speed} dir=${dir}; `
      + `both are BYTES on the board ($281EF6 moveq #0,D0 / move.b ($1a,A6),D0) `
      + `and 0..255 is the whole domain`);
  }
  const table = rom.u32(VEC.speedPtrs + 4 * speed);   // $28419A movea.l (A3,D0.w)
  const foldBytes = rom.u16(VEC.fold + 2 * dir);      // $2841A8 adda.w (A2),A3
  let d2 = asrl4(rom.i32(table + foldBytes));         // $2841AA / $2841AE
  let d3 = asrl4(rom.i32(table + foldBytes + 4));
  const quad = dir & 0xc0;                            // $2841B2 andi.w #$C0,D1
  // $2841BE jmp (A3) into the four-entry table at $2841C2, stride $40.
  if (quad === 0x40) { d2 = negw(d2); }                       // $284202
  else if (quad === 0x80) { d2 = negw(d2); d3 = negw(d3); }   // $284242
  else if (quad === 0xc0) { d3 = negw(d3); }                  // $284282
  return { dA: low16(d2), dB: low16(d3) };
}

/**
 * The fold table's own arithmetic, exposed so a test can assert the SHAPE
 * rather than the values: `$283F50[i] = 8 * triangle(i)`, period 128, peak 64.
 * The port NEVER uses this -- it reads the cartridge -- but a test that checks
 * the exported window against it is checking the export, not itself.
 */
export function foldModel(i) {
  const m = i % 128;
  return 8 * (m <= 64 ? m : 128 - m);
}
