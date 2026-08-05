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

// ===========================================================================
// W31 -- `$2433AE` IS ONE MEMBER OF A FAMILY, AND THE FAMILY SHARES ITS STATE.
//
// The comment above says "THE COUNTER IS SHARED" and names one other bumper
// ($289F62).  MEASURED this wave, by scanning the whole 6 MB decrypted image
// for the byte string `52 39 00 80 39 17` (`addq.b #1,$803917`): there are
// **32 sites in build B** --
//   $24276C $242B3C $242B58 $242B74 $242B90 $242CAC $242CCA $242CE8 $242D06
//   $242E24 $242EC2 $242FDE $242FFC $24311A $243138 $243156 $2431F4 $243212
//   $243230 $24328E $2433AE $2434D0 $2434F2 $243614 $243736 $243858 $24397A
//   $243A9C $243BBE $289F62 $28AB86 $28ABE0
// (and 30 more in build A's $142xxx/$143xxx, which are that build's copies).
// Each reads a DIFFERENT canned table with a different mask; they all advance
// the one 8-bit counter.  So "the port drew N times" is only comparable to the
// board if every family member the board reached is ported -- which is why the
// `rng` column ($803916) is REPORTED and not claimed.
//
// The stage-1 MIDBOSS `$26B6FA` uses two of them, and they are ported here.

/** `$2431F4`'s table.  `moveq #$3f` masks the index, so 64 bytes; `$24328E` is
 *  the next routine's `addq.b`, which pins the far end. */
export const RNG_2431F4 = { table: 0x24324e, entries: 64 };
/** `$242FDE`'s table.  There is **NO MASK** -- `move.w $803916,D0` then
 *  `move.b (A0,D0.w),D0` -- so the index is the WHOLE word.  256 bytes,
 *  `$24301A..$243119`, pinned at the far end by `$24311A`, which is code.
 *  The unmasked read is in range only because `$23BE36 clr.w $803916` zeroes
 *  the high byte and `addq.b` never carries into it; if that ever stops being
 *  true the ROM window turns it into a loud named throw rather than a wrong
 *  byte. */
export const RNG_242FDE = { table: 0x24301a, entries: 256 };

/**
 * `$2431F4` -- bump the shared counter, return the byte at `$24324E[state & $3F]`.
 *
 *   2431f4: addq.b #1,$803917
 *   2431fa: moveq #$3f,D0 / and.w $803916,D0
 *   243204: lea ($24324E,PC),A0 / move.b (A0,D0.w),D0
 *
 * D0's upper 24 bits are 0 on entry to the `move.b` (the `moveq`+`and.w` leave
 * a value <= $3F), so the returned D0 IS the table byte -- 0..3 for every entry
 * in this table.  `$2431F4` and `$243212` are the same routine returning into
 * D0 and D1 respectively; the midboss uses the D0 one, three times.
 * @returns {number} D0, 0..255.
 */
export function drawByte2431F4(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $2431F4
  const i = u16(ram.u16(RNG.state)) & 0x3f;                   // $2431FA/$2431FC
  return rom.u8(RNG_2431F4.table + i);                        // $24320A
}

/**
 * `$242FDE` -- bump the shared counter, return `ext.w` of `$24301A[state]`.
 *
 *   242fde: addq.b #1,$803917
 *   242fe4: move.w $803916,D0            <-- NO MASK
 *   242fec: lea ($24301A,PC),A0 / move.b (A0,D0.w),D0 / ext.w D0
 *
 * @returns {number} D0 as a SIGNED 16-bit value (`ext.w`).
 */
export function drawSigned242FDE(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $242FDE
  const i = u16(ram.u16(RNG.state));                          // $242FE4, whole word
  const idx = i >= 0x8000 ? i - 0x10000 : i;                  // (A0,D0.w) is signed
  const b = rom.u8(RNG_242FDE.table + idx);                   // $242FF2
  return b >= 0x80 ? b - 0x100 : b;                           // $242FF6 ext.w D0
}

// =========================== W53: THREE MORE MEMBERS ========================
//
// The shot's IMPACT SPARK (`src/spark.js`, pool E) draws from three more of the
// 32 sites the scan above lists, and each has its OWN canned table with its own
// mask.  Both far ends are pinned by the next `addq.b` site, exactly the way
// W31 pinned `$24324E` and `$24301A`:
//
//   $242E24  mask $7F -> 128 bytes $242E42..$242EC1, and $242EC2 IS the next
//            routine's `addq.b`.  ALREADY a ROM window (W23 exported it as
//            "the rank-adjustment byte table"; it is the same table and the
//            same routine -- the label was written for the caller W23 had).
//   $242FFC  NO MASK, `move.w $803916,D5` -- the EXACT TWIN of $242FDE above,
//            reading THE SAME 256-byte table $24301A and returning into D5.
//            Two entry points, one body; nothing new to export.
//   $28ABE0  mask $3F -> 64 bytes $28ABFA..$28AC39, and $28AC3A is
//            `lea $81DB90,A0`, i.e. code.  A NEW window.
//
// `$28AB86` is a fourth twin ($3F mask, table $28ABA0..$28ABDF, whose far end is
// $28ABE0 itself).  Nothing in this wave's path reaches it and it is NOT ported.

/** `$242E24`'s table: `moveq #$7f` masks the index, so 128 bytes,
 *  `$242E42..$242EC1`, and `$242EC2` is the next `addq.b` (far end PINNED). */
export const RNG_242E24 = { table: 0x242e42, entries: 128 };
/** `$28ABE0`'s table: `moveq #$3f`, 64 bytes `$28ABFA..$28AC39`, and `$28AC3A`
 *  is `lea $81DB90,A0` -- code (far end PINNED). */
export const RNG_28ABE0 = { table: 0x28abfa, entries: 64 };

/**
 * `$242E24` -- bump the shared counter, return the byte at `$242E42[state & $7F]`.
 *
 *   242e24: addq.b #1,$803917
 *   242e2a: moveq #$7f,D0 / and.w $803916,D0
 *   242e32: lea ($242E42,PC),A0 / move.b (A0,D0.w),D0
 *
 * `moveq`+`and.w` leave D0 <= $7F with its upper 24 bits clear, and `move.b`
 * writes only the low byte, so the returned D0 is 0..255 and NOTHING above bit 7
 * survives.  `$28A39E addq.b #8,D0` then adds within that byte.
 * @returns {number} D0, 0..255.
 */
export function drawByte242E24(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $242E24
  const i = u16(ram.u16(RNG.state)) & 0x7f;                   // $242E2A/$242E2C
  return rom.u8(RNG_242E24.table + i);                        // $242E3A
}

/**
 * `$242FFC` -- `$242FDE`'s twin, returning into D5 instead of D0, off the SAME
 * 256-byte table.  Kept as its own entry point because the CALLER's address is
 * what a reader checks against the listing, and because the two return into
 * different registers, which is the only reason the ROM has both.
 * @returns {number} D5 as a SIGNED 16-bit value (`ext.w`).
 */
export function drawSigned242FFC(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $242FFC
  const i = u16(ram.u16(RNG.state));                          // $243002, whole word
  const idx = i >= 0x8000 ? i - 0x10000 : i;                  // (A0,D5.w) is signed
  const b = rom.u8(RNG_242FDE.table + idx);                   // $243010
  return b >= 0x80 ? b - 0x100 : b;                           // $243014 ext.w D5
}

/**
 * `$28ABE0` -- bump the shared counter, return the byte at `$28ABFA[state & $3F]`.
 *
 *   28abe0: addq.b #1,$803917
 *   28abe6: moveq #$3f,D1 / and.w $803916,D1
 *   28abee: lea ($28ABFA,PC),A2 / adda.w D1,A2 / move.b (A2),D1
 *
 * NOTE THE ADDRESSING: `adda.w D1,A2` then `move.b (A2),D1`, not
 * `move.b (A2,D1.w),D1`.  Same result, different instruction; transcribed as
 * the ROM writes it so a reader can match it line for line.
 * @returns {number} D1, 0..255.
 */
export function drawByte28ABE0(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $28ABE0
  const i = u16(ram.u16(RNG.state)) & 0x3f;                   // $28ABE6/$28ABE8
  return rom.u8(RNG_28ABE0.table + i);                        // $28ABF6
}
