// $2433AE -- the board's "random" source, and it is NOT a generator.
//
//   2433ae: addq.b #1,$803917          <- the LOW BYTE of the word at $803916
//   2433b4: moveq #$3f,D1
//   2433b6: and.w $803916.l,D1         <- ...so the index is (that byte) & $3F
//   2433bc: add.w D1,D1 / add.w D1,D1
//   2433c0: move.l A0,-(A7)
//   2433c2: lea ($2433d0,PC),A0
//   2433c8: move.l (A0,D1.w),D1        <- 64 longwords of canned noise
//   2433cc: movea.l (A7)+,A0
//   2433ce: rts
//
// So the whole state is ONE WORD at $803916 and the "randomness" is a 64-entry
// ROM table walked in order.  Two consequences that a port must not smooth over:
//
//  1. `addq.b` increments the LOW BYTE ONLY.  It wraps 255 -> 0 without
//     carrying into $803916's high byte, so the high byte is whatever some
//     other subsystem left there and the index is a pure 8-bit counter.
//  2. THE COUNTER IS SHARED.  $289F54 (a sound request) bumps the same byte at
//     $289F62 before doing anything else, so any unported caller of that
//     routine desynchronises every later draw.  That is why $803916 is a
//     COMPARED COLUMN (`rng` in src/state.js) rather than internal bookkeeping:
//     NOTES-replay.md constraint 2 says port the board's RNG with its state in
//     the state vector, and a shared counter is exactly the case where a
//     divergence has to be attributable rather than diffuse.
//
// The caller uses D1's LOW WORD (`asr.w #1,D1` / `asr.w #2,D1`), but the read
// is a longword and the table holds longwords, so both halves are returned.

import { u16 } from './ram.js';

export const RNG = {
  state: 0x803916,      // $2433B6 and.w $803916,D1
  counter: 0x803917,    // $2433AE addq.b #1 -- the LOW BYTE of that word
  table: 0x2433d0,      // $2433C2 lea ($2433D0,PC),A0
  entries: 64,          // $2433B4 moveq #$3f
};

/**
 * $2433AE.  Advances the shared counter and returns the drawn longword.
 * @returns {number} D1, unsigned 32-bit.
 */
export function draw(ram, rom) {
  // $2433AE addq.b #1,$803917 -- a BYTE add, no carry into the high byte.
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);
  const i = u16(ram.u16(RNG.state)) & (RNG.entries - 1);   // $2433B4/$2433B6
  return rom.u32(RNG.table + i * 4);                       // $2433C8
}

/** D1's low word, sign-extended -- what every caller in the shot handlers uses. */
export function drawWord(ram, rom) {
  const v = draw(ram, rom) & 0xffff;
  return v >= 0x8000 ? v - 0x10000 : v;
}
