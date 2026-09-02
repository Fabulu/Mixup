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

/** D1's low word, sign-extended: what every caller in the shot handlers uses. */
export function drawWord(ram, rom) {
  const v = draw(ram, rom) & 0xffff;
  return v >= 0x8000 ? v - 0x10000 : v;
}

function validateBoundedDraw(resources, entries) {
  if (!resources || !Number.isSafeInteger(resources.table)
      || resources.entries !== entries) {
    throw new TypeError(`bounded RNG resource must supply a ${entries}-entry cartridge table`);
  }
  return resources;
}

function advanceSharedCounter(ram) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);
  return u16(ram.u16(RNG.state));
}

/** Resource-bound 64-longword member used by an edition's ordinary-shot hit path. */
export function drawWordWithResources(ram, rom, suppliedResources) {
  const resources = validateBoundedDraw(suppliedResources, 64);
  const index = advanceSharedCounter(ram) & 0x3f;
  const value = rom.u32(resources.table + index * 4) & 0xffff;
  return value >= 0x8000 ? value - 0x10000 : value;
}

/** Resource-bound unmasked unsigned-byte member used by Pool-A fill hooks. */
export function drawUnmaskedByteWithResources(ram, rom, suppliedResources) {
  const resources = validateBoundedDraw(suppliedResources, 256);
  const state = advanceSharedCounter(ram);
  const index = state >= 0x8000 ? state - 0x10000 : state;
  return rom.u8(resources.table + index);
}

/** Resource-bound unmasked signed-byte member used by the spark slot filler. */
export function drawSignedByteWithResources(ram, rom, suppliedResources) {
  const resources = validateBoundedDraw(suppliedResources, 256);
  const state = advanceSharedCounter(ram);
  const index = state >= 0x8000 ? state - 0x10000 : state;
  const value = rom.u8(resources.table + index);
  return value >= 0x80 ? value - 0x100 : value;
}

/** Resource-bound masked byte member used by the spark fill tail. */
export function drawByteWithResources(ram, rom, suppliedResources) {
  const resources = suppliedResources;
  if (!resources || !Number.isSafeInteger(resources.table)
      || (resources.entries !== 64 && resources.entries !== 128)) {
    throw new TypeError('bounded byte RNG resource must supply a 64- or 128-entry cartridge table');
  }
  const index = advanceSharedCounter(ram) & (resources.entries - 1);
  return rom.u8(resources.table + index);
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
//
// ---- W65 (B3): AND TWO MORE, BOTH ON THE LASER BOMB'S PATH -----------------
//
// The LASER BOMB (`$249A80`) reaches `$289FF4`, whose fill tail `$28A252` draws
// from `$242EC2` and from `$28AB86` -- the twin the paragraph above says
// "NOTHING in this wave's path reaches", which was true of W53 and is not true
// of W65.  Both are transcribed below and both get a ROM window.
//
//   $242EC2  **NO MASK** -- `move.w $803916,D0` then `move.b (A0,D0.w),D0`,
//            the same unmasked read `$242FDE` makes, and safe for the same
//            reason (`$23BE36 clr.w $803916` zeroes the high byte and `addq.b`
//            never carries into it).  Table `$242EDE`, and its far end is
//            **`$242FDE`, the next `addq.b` site** -- 256 bytes exactly.
//   $28AB86  mask $3F -> 64 bytes `$28ABA0..$28ABDF`, far end pinned by
//            `$28ABE0`, which is the routine above.
//   $24311A  mask $7F -> 128 bytes `$243174..$2431F3`, far end pinned by
//            `$2431F4`, ANOTHER member of the family (`src/rng.js` already
//            names it).  Its bytes are `[M] 0, 1 and 2 only`, which is what
//            makes `$28A000`'s `*4` index into the THREE-entry table at
//            `$28A030` safe -- entry 3 is `$48E7FFFE`, i.e. code.

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

// ======================= W65 (B3): THE LASER BOMB'S THREE ===================

/** `$242EC2`'s table.  **NO MASK** -- `$242EC8 move.w $803916,D0`.  256 bytes,
 *  `$242EDE..$242FDD`, and `$242FDE` (the next `addq.b`) pins the far end. */
export const RNG_242EC2 = { table: 0x242ede, entries: 256 };
/** `$28AB86`'s table: `moveq #$3F`, 64 bytes `$28ABA0..$28ABDF`, far end pinned
 *  by `$28ABE0` -- `drawByte28ABE0`'s own `addq.b`. */
export const RNG_28AB86 = { table: 0x28aba0, entries: 64 };
/** `$24311A`'s table: `moveq #$7F`, 128 bytes `$243174..$2431F3`, far end pinned
 *  by `$2431F4`.  `[M]` every byte in it is 0, 1 or 2. */
export const RNG_24311A = { table: 0x243174, entries: 128 };

/**
 * `$242EC2` -- bump the shared counter, return `$242EDE[state]` in D0's low byte.
 *
 *   242ec2: 52 39 00 80 39 17   addq.b #1,$803917
 *   242ec8: 30 39 00 80 39 16   move.w $803916,D0     <-- NO MASK, like $242FDE
 *   242ece: 2f 08               move.l A0,-(A7)
 *   242ed0: 41 fa 00 0c         lea ($242EDE,PC),A0
 *   242ed4: 4e 71               nop
 *   242ed6: 10 30 00 00         move.b (A0,D0.w),D0
 *   242eda: 20 5f               movea.l (A7)+,A0
 *   242edc: 4e 75               rts
 *
 * **AND THERE IS NO `ext.w`.**  `$242FDE` ends `move.b (A0,D0.w),D0 / ext.w D0`;
 * this one ends `move.b (A0,D0.w),D0 / rts`.  So D0's upper bits are whatever
 * `move.w $803916,D0` left there -- and `$803916`'s high byte is 0, so the word
 * this returns is 0..255 and **ITS BIT 15 IS ALWAYS CLEAR AND MEANS NOTHING**.
 *
 * **W416 -- WHAT THE HARDWARE ACTUALLY SETS.  DOCKET D48.**  `$242EDA movea.l`
 * does not affect the CCR and neither does `$242EDC rts`, so the last
 * instruction in this routine to touch N is `$242ED6 move.b`, and N is **BIT 7
 * OF THE TABLE BYTE**.  Every `bpl`/`bmi` that follows a `jsr $242EC2` branches
 * on that bit, NOT on the returned word's sign.  This comment used to assert
 * bit 15 and call the `bmi` arms unreachable; fifteen call sites believed it.
 * Read the flag through `drawNegative242EC2` below rather than testing the word.
 * `[M]` 128 of the 256 bytes in `$242EDE..$242FDD` have bit 7 set -- exactly
 * half -- and all 256 indices are reachable, because `$23BE36 clr.w $803916`
 * zeroes the high byte and `addq.b` walks the low one through 0..255.
 * @returns {number} D0, 0..65535 (in practice 0..255).  NOT a signed value.
 */
export function drawWord242EC2(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $242EC2
  const i = u16(ram.u16(RNG.state));                          // $242EC8, whole word
  const idx = i >= 0x8000 ? i - 0x10000 : i;                  // (A0,D0.w) is signed
  return (i & 0xff00) | rom.u8(RNG_242EC2.table + idx);       // $242ED6 move.b
}

/**
 * `$242EC2`'s **N FLAG** -- the one thing a `bpl`/`bmi` after the `jsr` reads.
 *
 * `true` means N is SET, i.e. `bmi` is taken and `bpl` is not.  It is bit 7 of
 * the byte `$242ED6 move.b (A0,D0.w),D0` loaded, for the reason spelled out on
 * `drawWord242EC2` above.  Callers that need the VALUE as well as the flag (the
 * `$29E162` site, which negates the byte on the `bpl` arm) still read the word
 * and mask it themselves; every caller that needs only the branch uses this, so
 * that no site has to re-derive which bit the CCR carries.
 *
 * It advances the shared counter exactly once, like every other member of the
 * family -- it IS the draw, not a peek at one.
 * @returns {boolean} N after `$242ED6`.
 */
export function drawNegative242EC2(ram, rom) {
  return (drawWord242EC2(ram, rom) & 0x80) !== 0;
}

/**
 * `$24328E` -- W95, and it is THE FIRST MEMBER OF THIS FAMILY THAT RETURNS A
 * WORD OUT OF A WORD TABLE.  Every other one the port has read is a byte:
 *
 *   24328e: addq.b #1,$803917
 *   243294: moveq #$7F,D0 / and.w $803916,D0
 *   24329c: add.w D0,D0                  <-- **THE INDEX IS DOUBLED**
 *   24329e: move.l A0,-(A7) / lea ($2432AE,PC),A0 / nop
 *   2432a6: move.w (A0,D0.w),D0          <-- a WORD, not a byte
 *   2432aa: movea.l (A7)+,A0 / rts
 *
 * so it is 128 WORDS at `$2432AE..$2433AD` and the far end is pinned by
 * `$2433AE`, which is `52 39 00 80 39 17` -- the family's next `addq.b` site,
 * the same pin `$242FDE` and `$2431F4` use.  A port that copied one of the byte
 * members and forgot `add.w D0,D0` would read the HIGH BYTE of the word it
 * wanted, every time, and the values would still look plausible.
 *
 * `[M]` the table's values are signed word offsets (`$0800 $1000 $0000 $0C00
 * $1400 $F400 ...`); E script 13 uses it three times a volley as
 * `asr.w #$3,D0` -- a jitter of +-$280 on the muzzle.
 * @returns {number} D0's low word, 0..65535 (the raw table word).
 */
export const RNG_24328E = { table: 0x2432ae, entries: 128 };
export function drawWord24328E(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $24328E
  const i = u16(ram.u16(RNG.state)) & 0x7f;                   // $243294/$243296
  return rom.u16(RNG_24328E.table + i * 2);                   // $24329C/$2432A6
}

/** `$28AB86` -- `$28ABE0`'s twin, one table earlier.  Identical shape:
 *  `moveq #$3F,D1 / and.w $803916,D1 / lea ($28ABA0,PC),A2 / adda.w D1,A2 /
 *  move.b (A2),D1`.
 *  @returns {number} D1, 0..255. */
export function drawByte28AB86(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $28AB86
  const i = u16(ram.u16(RNG.state)) & 0x3f;                   // $28AB8C/$28AB8E
  return rom.u8(RNG_28AB86.table + i);                        // $28AB9C
}

// =========================== W107: $242B3C, the boss death's angle ========
//
// D-script 6's death emitters (timer A/B/C spawns and the $28B4BE big burst)
// draw their angle jitter through `$242B3C`, which the W31 family scan lists
// but none of the W31/W53/W65 entries ported.  It is the same shape as
// `$242FDE` / `$242EC2`: NO MASK (`move.w $803916,D0`), then
// `move.b (A0,D0.w),D0` -- NO `ext.w` -- so D0 is the byte the table holds,
// 0..255, in the low half of D0.  Its far end is pinned by `$242CAC`, the next
// `addq.b #1,$803917` site in the W31 list, so the table is 256 bytes exactly.

/** `$242B3C`'s table.  **NO MASK** -- `$242B42 move.w $803916,D0`.  256 bytes,
 *  `$242BAC..$242CAB`, and `$242CAC` (the next `addq.b`) pins the far end. */
export const RNG_242B3C = { table: 0x242bac, entries: 256 };

/**
 * `$242B3C` -- bump the shared counter, return `$242BAC[state]` (no `ext.w`).
 *
 *   242b3c: addq.b #1,$803917
 *   242b42: move.w $803916,D0             <-- NO MASK, exactly like $242FDE
 *   242b48: move.l A0,-(A7) / lea ($242BAC,PC),A0
 *   242b50: move.b (A0,D0.w),D0 / movea.l (A7)+,A0 / rts
 *
 * The callers use only the low byte (`move.b D0,$1B(A0)` or `asr.b #2,D0`), so
 * the upper bits `$803916` left in D0 never matter -- transcribed without an
 * `ext.w`, exactly as the ROM has it.
 * @returns {number} D0's low byte, 0..255 (the table byte).
 */
export function drawByte242B3C(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $242B3C
  const i = u16(ram.u16(RNG.state));                          // $242B42, whole word
  const idx = i >= 0x8000 ? i - 0x10000 : i;                  // (A0,D0.w) is signed
  return rom.u8(RNG_242B3C.table + idx);                      // $242B50
}

/**
 * `$242B90`, the D5-return twin of `$242B3C` over the same `$242BAC` table.
 * `move.w $803916,D5` replaces D5's low word, then `move.b (A0,D5.w),D5`
 * replaces only that word's low byte. The caller at `$2A9BA8` immediately uses
 * `asr.b #1,D5`, but preserving the high byte here pins the wrapper itself.
 * @returns {number} D5's low word after the byte load.
 */
export function drawWord242B90(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $242B90
  const i = u16(ram.u16(RNG.state));                          // $242B96 move.w -> D5
  const idx = i >= 0x8000 ? i - 0x10000 : i;
  return (i & 0xff00) | rom.u8(RNG_242B3C.table + idx);       // $242BA4 move.b -> D5
}

/** `$24311A` -- `moveq #$7F,D0 / and.w $803916,D0 / lea ($243174,PC),A0 /
 *  move.b (A0,D0.w),D0`.  `[M]` the table holds only 0, 1 and 2.
 *  @returns {number} D0, 0..2 for every byte of the real table. */
export function drawByte24311A(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);   // $24311A
  const i = u16(ram.u16(RNG.state)) & 0x7f;                   // $243120/$243122
  return rom.u8(RNG_24311A.table + i);                        // $243130
}

// =========================== W191: POOL-D DEBRIS RNG ======================

/** `$242CAC`'s signed-byte table: 256 bytes `$242D24..$242E23`, pinned by
 * `$242E24`, the next shared-counter draw entry. */
export const RNG_242CAC = { table: 0x242d24, entries: 256 };

/** `$242CAC` -- the signed-byte twin of `$242FDE` over its own table. */
export function drawSigned242CAC(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);
  const i = u16(ram.u16(RNG.state));
  const idx = i >= 0x8000 ? i - 0x10000 : i;
  const b = rom.u8(RNG_242CAC.table + idx);
  return b >= 0x80 ? b - 0x100 : b;
}

/** `$24397A`'s 64 packed position offsets at `$24399C..$243A9B`. */
export const RNG_24397A = { table: 0x24399c, entries: 64 };

/** `$24397A` -- advance the shared counter and return one packed long offset. */
export function drawLong24397A(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);
  const i = u16(ram.u16(RNG.state)) & 0x3f;
  return rom.u32(RNG_24397A.table + i * 4);
}

/** `$243A9C`'s 64 packed offsets at `$243ABE..$243BBD`. */
export const RNG_243A9C = { table: 0x243abe, entries: 64 };

/** `$243A9C` -- the adjacent packed-long RNG used by the Stage-3 boss F9 debris. */
export function drawLong243A9C(ram, rom) {
  ram.setU8(RNG.counter, (ram.u8(RNG.counter) + 1) & 0xff);
  const i = u16(ram.u16(RNG.state)) & 0x3f;
  return rom.u32(RNG_243A9C.table + i * 4);
}
