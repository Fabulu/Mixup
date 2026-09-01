// OBJECT DISPATCH [9], `$25CACA` -- slot [17]'s TWIN, and the fuller version of it. W373.
//
// It walks the SAME two `$70` records at `$812EA0` with the same `moveq #$1,D7` `dbra`, and runs the
// same state machine on `($1,A6)`. The difference is coverage: slot [17] handles 3, 5, 6, 7 and slot
// [9] handles EIGHT states, adding 4, 0, 1 and 2.
//
//     3 -> $25D306      7 -> $25D560      1 -> $25D1DA
//     4 -> $25D402      0 -> $25D010      2 -> $25D164
//     5 -> $25D39C
//     6 -> $25D4F0
//
// FOUR OF THE EIGHT ARE ALREADY PORTED, in `objslot17.js`, because they are literally the same
// routines: `phase3_25D306`, `phase5_25D39C`, `phase6_25D4F0` and -- since W374 -- `phase7_25D560`.
// W373 wrote "four" here while naming only three, because state 7's handler was the one still
// missing; W374 ported it, so the count and the list finally agree. Reading this slot is also what
// exposed slot [17]'s inner dispatch as a state machine rather than four flags -- two callers
// disagreeing about one byte is what made the operand order visible.
//
// **AND IT IS WHY `$25D306` SETS STATE 4.** Slot [17] overwrites that with 5 the instant the handler
// returns, because it has no state-4 arm. Slot [9] has one and lets it stand. The same routine
// therefore advances the two screens to two different states, which is only sane once both callers
// are in front of you.

import { u16, i16 } from './ram.js';
import { RAM } from './machine.js';
import { SCHED } from './scheduler.js';
import { paletteSet241688, install24150A, install2414BE, fade246292 } from './palette.js';
import { txString25A14C, clearTx23C622 } from './background.js';
import { hexDigit23CD80 } from './fronttext.js';
import { menuDips23C932, readInput23D186 } from './tallyscreen.js';
import { enqueueRegistersThroughStub, enqueueZoomedRegistersThroughStub } from './spritequeue.js';
import { queueKill, stageCreate } from './objalloc.js';
import { announceBox260A20 } from './rank.js';
// $25C8C2 jsr $23C47A -- the SAME routine stageend.js calls from $28D5C4. Imported rather than
// transcribed a second time so the two callers cannot drift apart. stageend.js imports neither
// objslot9.js nor objslot17.js, so there is no cycle.
import { clear23C47A } from './stageend.js';
// $25CB98 jsr $23D16C / $25CBC8 jsr $23D17E, and $25CBB8 jsr $23C98E / $25CBE6 jsr $23C9F0. All
// four are already ported in `objslot8.js`, which is where the credit dips live, so `$25CB94`
// calls them rather than transcribing a second copy of the coin logic into this file.
//
// **THIS CLOSES A CYCLE AND IT IS SAFE, DELIBERATELY.** `objslot8.js` imports `clear25C57E` from
// HERE (its own `$25A9B2` teardown needs it), so the two files now import each other. Every one
// of the four names below is an `export function` -- a hoisted declaration, initialised before
// either module body runs -- and this file calls them only from inside `joinPoll25CB94`, never at
// module scope. `objslot8.js` uses `clear25C57E` the same way. So whichever module the loader
// evaluates first, neither ever reads a binding of the other's that is still in its TDZ.
// The rule the file header states for `stageend.js` is unchanged: what must not happen is a
// module-scope read across a cycle, and there is none here. Importing `SCREEN8` (a `const`) into
// module scope WOULD be one, which is why `$8000` below is spelled out at its own site instead.
import {
  startRaw23D16C, creditTake23C98E, creditTake23C9F0,
} from './objslot8.js';
import {
  SCREEN17, phase3_25D306, phase5_25D39C, phase6_25D4F0, phase7_25D560, sideFromD7_25D4E4, DESC17,
  clear25F442, LABELS_25F2D0, sideLabels25F2D0,
} from './objslot17.js';

export const SCREEN9 = Object.freeze({
  entry: 0x25caca, start: 0x25c8a2, dispatch: 0x240f62,
  state: 0x02, busy: 0x03,
  // The state values in the order the cartridge compares them, which is NOT ascending.
  states: Object.freeze([0x03, 0x04, 0x05, 0x06, 0x07, 0x00, 0x01, 0x02]),
  handlers: Object.freeze([0x25d306, 0x25d402, 0x25d39c, 0x25d4f0, 0x25d560,
    0x25d010, 0x25d1da, 0x25d164]),
  // $25CB5E cmpi.b #$7,($1,A6) / bcc -- an UNSIGNED >= test, so states 7 and above skip the tail.
  tailLimit: 0x07, tailCount: 0x31, tailReload: 0x02, tailFlag: 0x2e, tailSet: 0x30,
  // ($2F,A6) is the LOW HALF of the auto-confirm clock. `$25D010` seeds the pair with a single
  // `move.w #$599,($2E,A6)`, so ($2E,A6) is $05 and ($2F,A6) is $99 -- trap 3, one word literal
  // covering two byte fields, and reading it as one word hides the whole timer.
  tailLowAt: 0x2f,
  after: 0x25cb94,
  // W390 -- `$241292 lea ($4C,A5),A0`. The object's ID LONG, and `queueKill`'s real argument.
  idAt: 0x4c,
});

/** `$25CB94..$25CC44` -- everything the record walk does that is NOT a state handler.
 *
 *  THE ADDRESS `$25CB94` IS NOT "AFTER THE LOOP" AND NEVER WAS. `$25CAE8 beq.w` has its
 *  displacement word at `$25CAEA` and `$00AA` past that is `$25CB94` (trap 4, and it is why the
 *  old note here described a tail that runs once a frame -- it runs once per DEAD RECORD). The
 *  loop's real seam is two bytes earlier: `$25CB92 bra.s` lands on `$25CBF4`, which is inside the
 *  loop, and `$25CBFE dbra D7` (`51CF FEE6`, displacement word at `$25CC00`, -282) goes back to
 *  `$25CAE6`. So the shape is:
 *
 *      $25CAE6  live?  no  -> $25CB94  JOIN POLL         (this record is empty; may it start?)
 *                      yes -> handlers, then $25CB5E tail, then $25CB92 bra
 *      $25CBF4  jsr $25E72E                              EVERY record, live or dead
 *      $25CBFA  lea ($70,A6),A6 / $25CBFE dbra
 *      $25CC02  the TEARDOWN decision, then $25CC40 bsr.w $25C818, $25CC44 rts
 */
export const WALK9 = Object.freeze({
  join: 0x25cb94, joinEnd: 0x25cbf4, drawSite: 0x25cbf4, done: 0x25cc02, rts: 0x25cc44,
  // $25CB9E / $25CBCE btst #$F,D0 on the RAW (held, not edge) input word.
  startBit: 0x8000,
  // $25CBB0 / $25CBDE cmpi.b #$6,<other record's state> / bcc -- an UNSIGNED >=, and the arm it
  // skips is the credit take. So once the OTHER side is at state 6 or past it, nobody else joins.
  lateState: 0x06,
  // $25CBF4 jsr $25E72E -- $25E72E..$25E7B7, 138 bytes, ending at the `$25E7B6 rts`.
  draw: 0x25e72e, drawBytes: 0x8a,
  // $25CC12 / $25CC28 cmpi.b #$8 -- state 8 is `$25D748`'s retirement marker.
  retired: 0x08, bothBits: 0x0003, killState: 0x02,
});

/** `$25C818..$25C8A1`, 138 bytes -- **THE SELECT SCREEN'S PALETTE PULSE**, and the writer of
 *  `$813005`, which is the byte `$25C8A2` seeds to 0 and nothing else in the port sets.
 *
 *  `movem.l D0-D7/A0-A6,-(A7)` at `$25C818` and `movem.l (A7)+,D0-D7/A0-A6` at `$25C89C` bracket
 *  the whole body, so it is REGISTER-TRANSPARENT (trap 9) and returns nothing. Its only products
 *  are `$813004`, `$813005` and one palette bank.
 *
 *  IT IS A ONE-WAY LATCH. `$25C81C tst.b $813005 / bne $25C89C` leaves immediately once the byte
 *  is set, and the only thing that sets it is `$25C840`, four instructions later, when EITHER
 *  record has reached state 6. So the pulse animates the whole time the players are choosing and
 *  then stops dead on the frame the first one commits.
 *
 *  **THE TWO RECORD TESTS ARE SIGNED AND NEITHER LOOKS AT A LIVE BYTE.** `$25C832 bge.w` and
 *  `$25C83C blt.w` read `($1,A6)` and `($71,A6)` straight through; a dead record simply still
 *  holds the 0 `$25C8A2` seeded, which is below 6, so it never latches the byte on its own.
 *
 *  The pulse itself is a brightness sweep: `$813004` advances by 6 a frame and is used as the
 *  ANGLE into `$241D34` at speed index `$50`; `$800` minus the returned D2, shifted right six,
 *  is the LEVEL handed to `$246292` for each of 32 words copied `$812F84 -> $812FC4`. `$812F84`
 *  is the 64-byte block `$25CA94` copied out of `$223FF8`, so the source is already windowed.
 */
export const PULSE9 = Object.freeze({
  addr: 0x25c818, rts: 0x25c8a0, bytes: 0x8a,
  gate: 0x813005, phase: 0x813004, phaseStep: 0x06,   // $25C81C / $25C858 addi.b #$6,$813004
  freeze: 0x06,                                       // $25C82C / $25C836 cmpi.b #$6
  src: 0x812f84, dst: 0x812fc4, words: 0x20,          // $25C84C / $25C852 / $25C87A moveq #$1F + dbra
  speedIdx: 0x50, levelBase: 0x0800, levelShift: 6,   // $25C860 / $25C872 / $25C878 lsr.w #$6
  bank: 0x0b,                                         // $25C892 move.w #$B,D0 / $25C896 jsr $24150A
});

/** The fifteen palette installs `$25C8A2` ends with, in cartridge order, `$25C9A6..$25CA72`.
 *  THE FIRST GOES THROUGH `$2414BE` AND COPIES 32 BYTES; the other fourteen go through `$24150A`
 *  and copy 64. Folding them into one loop puts 64 bytes of the wrong thing into the TX bank.
 *
 *  This list is BYTE-FOR-BYTE the same fifteen `{src, bank, via}` triples as slot [17]'s
 *  `SCREEN17_PAL`, in the same order -- w374slot9seed.test.js asserts that identity rather than
 *  either file importing the other's array, so that a future edit to one screen's furniture cannot
 *  silently move the other's. */
const SEED9_PAL = Object.freeze([
  Object.freeze({ src: 0x222618, bank: 0, via: 0x2414be }),  // $25C9A6/$25C9AC/$25C9AE
  Object.freeze({ src: 0x222838, bank: 2, via: 0x24150a }),  // $25C9B4/$25C9BA/$25C9BC
  Object.freeze({ src: 0x223c38, bank: 24, via: 0x24150a }),
  Object.freeze({ src: 0x223c78, bank: 25, via: 0x24150a }),
  Object.freeze({ src: 0x223cb8, bank: 27, via: 0x24150a }),
  Object.freeze({ src: 0x223d38, bank: 26, via: 0x24150a }),
  Object.freeze({ src: 0x223d78, bank: 28, via: 0x24150a }),
  Object.freeze({ src: 0x223ff8, bank: 18, via: 0x24150a }),
  Object.freeze({ src: 0x2240b8, bank: 19, via: 0x24150a }),
  Object.freeze({ src: 0x2241b8, bank: 20, via: 0x24150a }),
  Object.freeze({ src: 0x2240f8, bank: 16, via: 0x24150a }),
  Object.freeze({ src: 0x224038, bank: 21, via: 0x24150a }),
  Object.freeze({ src: 0x224178, bank: 22, via: 0x24150a }),
  Object.freeze({ src: 0x224138, bank: 23, via: 0x24150a }),
  Object.freeze({ src: 0x224078, bank: 17, via: 0x24150a }),  // $25CA6A/$25CA70/$25CA72
]);

export const SEED9 = Object.freeze({
  addr: 0x25c8a2, rts: 0x25cac0, bytes: 0x220,
  // Absolute words and bytes it touches, in cartridge order.
  dualGate: 0x803926,                        // $25C8BA move.w #$0 -- sound.js's SOUND.gateDual
  clear23c47a: 0x80392e, clear23c47aWords: 6,  // $25C8C2 jsr $23C47A
  flagA: 0x812f82,                           // $25C8C8
  byte813005: 0x813005,                      // $25C8D0
  flagC: 0x812f80,                           // $25C936 clr.w -- the word just past the two records
  word813006: 0x813006,                      // $25C99A clr.w
  // Off A5. `mask` is READ at $25C942 and then OVERWRITTEN with $FF at $25C972.
  mask: 0x04, busy: 0x03, slots: 0x04, slotCount: 6, extra: 0x0a, stateValue: 0x01,
  // Off A0, per record. `$64` is ONE and is the gate `draw25E220` reads; everything else is 0 or a
  // plain constant. $56 is a LONG.
  liveAt: 0x00, phaseAt: 0x01, phaseSeed: 0x00,
  sentinelAt: 0x56, sentinel: 0xffffffff,
  // Named `recFields` and NOT `recWords`, which in `SCREEN17` is the 112-word bulk-clear count.
  recFields: Object.freeze([[0x60, 0x0000], [0x62, 0x0000], [0x64, 0x0001], [0x66, 0x0000],
    [0x68, 0x0000], [0x6a, 0x0002], [0x6c, 0x0140]]),
  gateWord: 0x64,
  // The mask arms, as three INDEPENDENT compares. See the doc comment.
  maskArms: Object.freeze([
    Object.freeze({ value: 3, recs: Object.freeze([0, 1]) }),   // $25C946/$25C94C/$25C950
    Object.freeze({ value: 2, recs: Object.freeze([1]) }),      // $25C956/$25C95C
    Object.freeze({ value: 1, recs: Object.freeze([0]) }),      // $25C962/$25C968
  ]),
  childType: 0x0a, newRecArm: 0x04,          // $25CA78 move.w #$A,D0 / $25CA82 move.w #$0,($4,A0)
  soundStream: 0x28cb38, soundWrapper: 0x28ca94,   // $25CA88 / $25CA8E
  copySrc: 0x223ff8, copyDst: 0x812f84, copyLongs: 16,   // $25CA94..$25CABE, SIXTEEN move.l
  palettes: SEED9_PAL,
});

/** The three RAM-clearing leaves `$25C8A2` opens with. `$25F442` is shared with slot [17] and lives
 *  in `objslot17.js`; these two are slot [9]'s alone. */
export const LEAVES9 = Object.freeze({
  b: Object.freeze({ addr: 0x25fa78, base: 0x813070, words: 5, seed: 0x3c, redundant: 0x813072 }),
  c: Object.freeze({ addr: 0x25c57e, base: 0x812e82, words: 15 }),
});

/** `$25FA78` -- 44 bytes, and the ONLY one of the four leaves that is register-transparent.
 *
 *  `movem.l D0-D7/A0-A6,-(A7)` ... `movem.l (A7)+` brackets the whole body, so unlike `$25F442` and
 *  `$25C57E` it clobbers nothing at all. It clears FIVE words -- `move.w #$4,D0` plus `dbra` --
 *  which is 10 bytes, `$813070..$813079`, and then IMMEDIATELY writes `$3C` back into `$813070`.
 *
 *  `$25FA96 move.w #$0,($813072).l` then re-clears a word the loop cleared four instructions
 *  earlier. It is redundant as shipped. TRANSCRIBED ANYWAY: "redundant" is a claim about the five
 *  words the `dbra` covers, and folding the line away is exactly how that claim would rot unnoticed
 *  if the count ever turned out to be four. */
export function clear25FA78(ram) {
  for (let i = 0; i < LEAVES9.b.words; i++) {                // $25FA82 move.w #$4,D0 + dbra = FIVE
    ram.setU16(LEAVES9.b.base + i * 2, 0);                   // $25FA88 move.w D1,(A0)+ with D1 = 0
  }
  ram.setU16(LEAVES9.b.base, LEAVES9.b.seed);                // $25FA8E -- seeds $3C straight back
  ram.setU16(LEAVES9.b.redundant, 0);                        // $25FA96 -- already zero. Kept.
}

/** `$25C57E` -- 20 bytes, `lea $812E82,A0 / move.w #$E,D0 / moveq #$0,D1 / move.w D1,(A0)+ / dbra`.
 *
 *  `$E` is 14, so FIFTEEN words = 30 bytes = `$812E82..$812E9F`, and `$812EA0` is the base of
 *  record 0. The clear therefore ENDS EXACTLY ON the record wall without crossing it, which is what
 *  makes the separate 112-word record clear at `$25C8D8` non-overlapping rather than merely
 *  redundant. One word more and it would wipe record 0's live flag AFTER the seeder set it.
 *
 *  No `movem`: D0, D1 and A0 are clobbered. */
export function clear25C57E(ram) {
  for (let i = 0; i < LEAVES9.c.words; i++) {                // $25C584 move.w #$E,D0 + dbra = 15
    ram.setU16(LEAVES9.c.base + i * 2, 0);                   // $25C58A move.w D1,(A0)+ with D1 = 0
  }
}

/** `$25C8A2` -- SLOT [9]'s OBJECT STATE 0, 544 bytes (`$25C8A2..$25CAC1`), and **IT IS THE SEEDER
 *  THAT FEEDS `$25D010`, NOT A PEER OF IT.**
 *
 *  Two different state bytes are in play and confusing them inverts the whole routine. `($2,A5)` is
 *  the OBJECT's state and this sets it to **1** as its very first instruction, so the dispatcher's
 *  `tst.b ($2,A5) / beq $25C8A2` never comes back here: it is one-shot. `($1,A0)` is each RECORD's
 *  state and it sets that to **0**, which routes both records to `phase0_25D010` on the next frame.
 *
 *  **IT NEVER TOUCHES A6 AND IT IS NOT PER-SIDE.** Both `$812EA0` records are reached through A0 as
 *  an absolute pointer, there is no `tst.w D7` anywhere in the 544 bytes, and both records receive
 *  IDENTICAL field values. The only per-record difference in the whole routine is the live flag.
 *  D0 and A0 are clobbered (no `movem`); A5 is inherited.
 *
 *  **`($4,A5)` IS A TWO-BIT JOIN MASK AND THE ROUTINE READS IT, THEN CLOBBERS IT.** `$25ACCA
 *  ori.b #$1` (side 0) and `$25ACE8 ori.b #$2` (side 1) build it; 3 is both, 2 is record 1, 1 is
 *  record 0, 0 is neither. `$25C942` reads it into D0 and `$25C972` overwrites the same byte with
 *  `$FF` forty-eight bytes later. Both halves are load-bearing: the mask decides which records go
 *  live, and the `$FF` is the "no choice yet" sentinel `$25D306` tests with a SIGNED `tst.b`.
 *
 *  **THE THREE `cmpi.b` ARE PORTED AS THREE INDEPENDENT `if`s, NOT AN ELSE-IF CHAIN.** They are
 *  sequential in the cartridge and D0 is not touched between them, so at most one can fire -- but
 *  that is a property of the DATA (a two-bit value is never 3 and 2 at once), not of the control
 *  flow. Writing it as `else if` would encode an assumption the instructions do not make.
 *
 *  **`$223FF8` IS READ TWICE, FOR TWO UNRELATED PURPOSES.** Once at `$25CA08` as bank 18's 64-byte
 *  palette, and once at `$25CA94` as a 64-byte data copy into `$812F84`. Folding them into one
 *  operation would tie a palette install to a RAM buffer that has nothing to do with the palette.
 *
 *  **THE SIXTEEN `move.l (A0)+,(A1)+` ARE UNROLLED IN THE CARTRIDGE**, with no counter and no
 *  `dbra`. Sixteen longwords is exactly 64 bytes, the same width as one palette block, which is the
 *  only reason the count can be checked at all.
 */
export function seed25C8A2(ram, rom, a5, ctx) {
  // $25C8A2 move.b #$1,($2,A5). FIRST INSTRUCTION, and it is this OBJECT's state, not a record's.
  ram.setU8(a5 + SCREEN9.state, SEED9.stateValue);
  clear25F442(ram);                                          // $25C8A8 -- 72 bytes at $813028
  clear25FA78(ram);                                          // $25C8AE -- 10 bytes at $813070, + $3C
  clear25C57E(ram);                                          // $25C8B4 -- 30 bytes ending at $812EA0
  ram.setU16(SEED9.dualGate, 0);                             // $25C8BA move.w #$0,$803926
  clear23C47A(ram);                                          // $25C8C2 jsr $23C47A
  ram.setU16(SEED9.flagA, 0);                                // $25C8C8 move.w #$0,$812F82
  ram.setU8(SEED9.byte813005, 0);                            // $25C8D0 move.b #$0,$813005

  // $25C8D8..$25C8E6 -- `move.w #$6F,D0` plus `dbra` is ONE HUNDRED AND TWELVE words = $E0 bytes =
  // exactly two $70 records. The count is the cartridge's own; it stops one word BELOW $812F80.
  for (let i = 0; i < SCREEN17.recWords; i++) ram.setU16(SCREEN17.recs + i * 2, 0);

  for (let r = 0; r < SCREEN17.recCount; r++) {              // $25C8F0 moveq #$1,D0 + dbra = TWO
    const a0 = SCREEN17.recs + r * SCREEN17.recStride;       // $25C92E lea ($70,A0),A0
    ram.setU8(a0 + SEED9.liveAt, 0);                         // $25C8F2 -- the live flag, cleared
    // $25C8F6 move.b #$0,($1,A0) -- THE RECORD STATE, and 0 is `phase0_25D010`'s arm. This is the
    // hand-off: slot [9]'s inner walk will find state 0 on the next frame and run $25D010.
    ram.setU8(a0 + SEED9.phaseAt, SEED9.phaseSeed);
    ram.setU32(a0 + SEED9.sentinelAt, SEED9.sentinel);       // $25C8FC move.l #$FFFFFFFF,($56,A0)
    for (const [off, v] of SEED9.recFields) ram.setU16(a0 + off, v);  // $25C904..$25C92C
  }

  ram.setU16(SEED9.flagC, 0);                                // $25C936 clr.w $812F80

  // $25C93C lea $812EA0,A0 reloads A0, which the loop above left at $812FE0.
  // $25C942 move.b ($4,A5),D0 -- THE JOIN MASK, read BEFORE $25C972 destroys it.
  const d0 = ram.u8(a5 + SEED9.mask);
  for (const arm of SEED9.maskArms) {                        // three SEQUENTIAL cmpi.b, not else-if
    if (d0 !== arm.value) continue;
    for (const r of arm.recs) ram.setU8(SCREEN17.recs + r * SCREEN17.recStride, 1);
  }

  ram.setU8(a5 + SEED9.busy, 0);                             // $25C96C move.b #$0,($3,A5)
  // $25C972..$25C990 -- SIX bytes to $FF, and ($4,A5) is the first of them, so the mask read eleven
  // instructions ago is gone by the time this returns.
  for (let i = 0; i < SEED9.slotCount; i++) ram.setU8(a5 + SEED9.slots + i, 0xff);
  ram.setU16(a5 + SEED9.extra, 0);                           // $25C996 clr.w ($A,A5)
  ram.setU16(SEED9.word813006, 0);                           // $25C99A clr.w $813006

  clearTx23C622(ctx.tx);                                     // $25C9A0 jsr $23C622
  for (const p of SEED9.palettes) {                          // $25C9A6..$25CA72
    if (!ctx.palette) {
      ctx.unported?.note(p.via, `$25C9A6.. bank ${p.bank} <- $${p.src.toString(16).toUpperCase()
        } with no PaletteState on this chain`);
      continue;
    }
    if (p.via === 0x2414be) {
      // THIRTY-TWO bytes, not 64 -- $2414BE is the TX installer and reads half what $24150A does.
      install2414BE(ram, ctx.palette, p.bank, rom.bytes(p.src, 32), 0x25c9ae, 'slot [9] TX palette');
    } else {
      install24150A(ram, ctx.palette, p.bank, rom.bytes(p.src, 64), 0x25c9bc, 'slot [9] palette');
    }
  }

  // $25CA78 move.w #$A,D0 / $25CA7C jsr $241182 -- stages dispatch type $A, slot [10]. THE PRIORITY
  // COMES FROM THE TABLE, never from a constant: $241182 reads it out of ($4,A0,D1) itself, which
  // is why `dispatchPri` is a CALLBACK. $240F62 + $A*8 gives handler $260794 and priority $001F.
  const made = stageCreate(ram, SEED9.childType,
    (t) => rom.u16(SCREEN9.dispatch + t * 8 + 4));
  // $25CA82 move.w #$0,($4,A0) -- A0, NOT A5. $24150A preserves A0, so A0 still held $224078 across
  // the fourteenth install; then $241182 REPLACED it with the record it just staged and did not
  // restore it. So this word lands on the NEW type-$A record and clears its $4 and $5 together. It
  // does NOT touch this object's ($4,A5), which is the $FF written twenty bytes earlier. Slot [17]
  // has the identical trap at $25CEA2 and tally.js a third at $260024.
  // On a full create queue $241182 hands back the DUMMY at $80D51C in A0 and the ROM writes through
  // it just the same, so this is unconditional rather than guarded on `made.ok`.
  ram.setU16(made.addr + SEED9.newRecArm, 0);

  ctx.soundPost?.(SEED9.soundStream);                        // $25CA88 jsr $28CB38 -- streaming leaf
  ctx.soundPost?.(SEED9.soundWrapper);                       // $25CA8E jsr $28CA94 -- id $41

  // $25CA94..$25CABE -- the SECOND read of $223FF8, and it is a plain data copy, not a palette.
  // Sixteen literal `move.l (A0)+,(A1)+` with no loop; 16 longwords is 64 bytes, $812F84..$812FC3.
  for (let i = 0; i < SEED9.copyLongs; i++) {
    ram.setU32(SEED9.copyDst + i * 4, rom.u32(SEED9.copySrc + i * 4));
  }
  // $25CAC0 rts. $25CAC2 is the NEXT routine (`jmp $241292`), reached only from $25CAD2.
}

/** The seven draws `$25D800` -- `phase7_25D560`'s tail -- calls, keyed by the names `TAIL_25D560`
 *  in `objslot17.js` looks them up under. THE KEYS ARE THE EXPORT NAMES; a rename here without a
 *  rename there turns the sprite into a counted note rather than a crash.
 *
 *  **THIS IS THE ASYMMETRY, AND IT IS DELIBERATE.** `phase7_25D560(..., draws = ctx?.selectDraws)`
 *  takes its draws as INJECTED data because `objslot9.js` already imports `objslot17.js` and the
 *  tail importing them back would close a cycle. `main.js` therefore has to seed `ctx.selectDraws`
 *  from the `objslot9` NAMESPACE before it runs slot [17], because `objslot17.js` cannot see these
 *  functions. **Slot [9] has no such problem: this file is where all seven are DEFINED**, so its
 *  own edge into `$25D560` hands them over directly and needs no `ctx.selectDraws` at all. Do not
 *  "tidy" this into a `ctx` read to match slot [17] -- that would make slot [9] depend on `main.js`
 *  having run slot [17] first.
 *
 *  `$25EDF8` is ported in this file too and is deliberately NOT here: `$25D800` calls `$25E4D0` and
 *  does not call `$25EDF8`, the exact opposite of `confirmAndDraw`'s two tails. */
const DRAWS9_25D800 = Object.freeze({
  draw25E220,                                                // $25D808
  draw25E29E,                                                // $25D80E
  draw25E4D0,                                                // $25D814 -- UNGATED
  draw25E6CE,                                                // $25D822
  draw25E824,                                                // $25D828
  draw25EF30,                                                // $25D82E
  draw25F074,                                                // $25D834
});

/** Sign-extend a byte. `$25C832 bge.w` and `$25C83C blt.w` are the SIGNED conditions, and a record
 *  state byte is only ever 0..8 on the board -- but the port must branch on what the instruction
 *  tests, not on what the data happens to be. `ram.js` exports `i16` and not this. */
const i8 = (v) => (v << 24) >> 24;

/** `$25CB86 sbcd D0,D1` -- a **PACKED-BCD** subtract, not the `cmp.b` this file used to call it.
 *
 *  `8300` is SBCD D0,D1 (`rosetta.py dasm` agrees), and the difference is the whole auto-confirm
 *  clock: SBCD leaves its RESULT in D1, and `$25CB8E move.b D1,($2F,A6)` stores that result. The
 *  old transcription read the opcode as a compare, concluded D1 was untouched, and wrote back the
 *  literal 1 -- which pinned ($2F,A6) at 1 from the first tick onwards and made the borrow that
 *  drives ($2E,A6) impossible. See `walkTail25CB5E`.
 *
 *  **X IS ZERO ON EVERY PATH THAT REACHES IT**, so this models `Dx - Dy` and not `Dx - Dy - X`.
 *  SBCD is the only instruction here that reads X, and the last writer of X before it is
 *  `$25CB66 subq.b #1,($31,A6)`. The `$25CB6A bne` we fell through means that subq's result was
 *  zero, and a byte subtract of 1 can only give zero from 1, which does not borrow. (A `($31,A6)`
 *  of 0 WOULD borrow, but it also gives $FF and takes the `bne`.)
 *
 *  @returns `{ value, borrow }` -- `borrow` is the C the `$25CB88 bcc` reads. */
function sbcd25CB86(dx, dy) {
  let lo = (dx & 0x0f) - (dy & 0x0f);
  let hi = ((dx >>> 4) & 0x0f) - ((dy >>> 4) & 0x0f);
  if (lo < 0) { lo += 10; hi -= 1; }
  let borrow = false;
  if (hi < 0) { hi += 10; borrow = true; }
  return { value: ((hi & 0x0f) << 4) | (lo & 0x0f), borrow };
}

/** `$25CB5E..$25CB92` -- THE PER-RECORD TAIL, and it is the AUTO-CONFIRM CLOCK.
 *
 *  `($31,A6)` is a divide-by-two on frames. Every second frame the BCD pair `($2E,A6)`/`($2F,A6)`
 *  -- seeded `$0599` by `$25D010`'s one `move.w` -- counts down by one, and the frame `($2E,A6)`
 *  reaches 0 the other arm fires `move.b #$1,($30,A6)`, which is exactly the byte
 *  `confirmAndDraw` reads as "confirmed with no button". 500 ticks at one per two frames is
 *  1000 frames, and that is the select screen's timeout.
 *
 *  It is factored out of `objSlot9` because `$25CB92 bra.s $25CBF4` is a jump INTO the loop tail,
 *  not out of the iteration: the `jsr $25E72E` at `$25CBF4` still has to run. Written with
 *  `continue`, as it was, that call could never be reached.
 *
 *  EXPORTED so `w379slot9.test.js` can step the clock without a handler running underneath it.
 *  Every state below 7 has a handler and several of them advance `($1,A6)` mid-pass, so driving
 *  the tail through `objSlot9` alone cannot hold the state still long enough to watch 500 ticks;
 *  the real path proves it end to end and this proves the arithmetic. */
export function walkTail25CB5E(ram, a6) {
  // $25CB5E cmpi.b #$7,($1,A6) / $25CB64 bcc.s $25CB92 -- UNSIGNED, so 7 and above skip it all.
  if (ram.u8(a6 + SCREEN17.phaseAt) >= SCREEN9.tailLimit) return;
  const left = (ram.u8(a6 + SCREEN9.tailCount) - 1) & 0xff;   // $25CB66 subq.b #1,($31,A6)
  ram.setU8(a6 + SCREEN9.tailCount, left);
  if (left !== 0) return;                                    // $25CB6A bne.s $25CB92
  ram.setU8(a6 + SCREEN9.tailCount, SCREEN9.tailReload);     // $25CB6C -- reload TWO
  if (ram.u8(a6 + SCREEN9.tailFlag) === 0) {                 // $25CB72 tst.b ($2E,A6) / bne.s
    ram.setU8(a6 + SCREEN9.tailSet, 1);                      // $25CB78 move.b #$1,($30,A6)
    return;                                                  // $25CB7E bra.s $25CB92
  }
  // $25CB80 moveq #$1,D0 / $25CB82 move.b ($2F,A6),D1 / $25CB86 sbcd D0,D1 -- the BCD tick.
  const { value, borrow } = sbcd25CB86(ram.u8(a6 + SCREEN9.tailLowAt), 1);
  if (borrow) {                                              // $25CB88 bcc.s $25CB8E
    ram.setU8(a6 + SCREEN9.tailFlag,
      (ram.u8(a6 + SCREEN9.tailFlag) - 1) & 0xff);           // $25CB8A subq.b #1,($2E,A6)
  }
  ram.setU8(a6 + SCREEN9.tailLowAt, value);                  // $25CB8E move.b D1,($2F,A6)
}

/** `$25CB94..$25CBF2` -- **THE MID-SCREEN JOIN POLL**, run for a record that is NOT live.
 *
 *  `$25CB94 tst.w D7 / beq.s $25CBC8` splits it into two arms that are the same eleven
 *  instructions with the other player's four addresses in them:
 *
 *      D7 != 0  (record 0)   $23D16C  P1 raw   other = ($70,A0)   $23C98E  take a P1 credit
 *      D7 == 0  (record 1)   $23D17E  P2 raw   other = ($1,A0)    $23C9F0  take a P2 credit
 *
 *  and the four callees are `objslot8.js`'s, not new ones. `creditTake*` already carries the
 *  cartridge's contract: **`true` means REFUSED**, which is the `bcs.w $25CBF4` at `$25CBBE` and
 *  `$25CBEC`. A refusal leaves the record dead, which is the correct answer on a board with no
 *  credit left, and it is why this can be a call rather than an invention.
 *
 *  THREE CONDITIONS, ALL OF WHICH MUST HOLD, and the middle one is easy to invert:
 *   1. `btst #$F` on the RAW (held) word -- START is down.
 *   2. the OTHER record is dead, OR its state is still BELOW 6. `$25CBB0 cmpi.b #$6 / bcc.s`
 *      branches AWAY on >=, so a partner already at state 6 CLOSES the door.
 *   3. the credit is granted.
 *
 *  Only then `$25CBC2`/`$25CBF0 move.b #$1,(A6)`. `$25C8A2` left the record's state byte at 0, so
 *  the next frame's walk finds it in state 0 and runs `phase0_25D010` -- the joiner gets the full
 *  entry sequence, not a half-built record. */
function joinPoll25CB94(ram, ctx, a6, d7) {
  const first = u16(d7) !== 0;                               // $25CB94 tst.w D7 / $25CB96 beq.s
  const raw = startRaw23D16C(ram, first ? 0 : 1);            // $25CB98 jsr $23D16C / $25CBC8 $23D17E
  if ((raw & WALK9.startBit) === 0) return;                  // $25CB9E btst #$F,D0 / $25CBA2 beq
  // $25CBA4 / $25CBD4 lea $812EA0,A0 -- the SAME absolute in both arms; only the displacement
  // moves, so this is "the other record" spelled two ways.
  const other = SCREEN17.recs + (first ? SCREEN17.recStride : 0);
  if (ram.u8(other) !== 0                                    // $25CBAA / $25CBDA tst.b -- live?
    && ram.u8(other + SCREEN17.phaseAt) >= WALK9.lateState) return;   // $25CBB0 / $25CBDE cmpi/bcc
  const refused = first ? creditTake23C98E(ram, ctx) : creditTake23C9F0(ram, ctx);
  if (refused) return;                                       // $25CBBE / $25CBEC bcs.w $25CBF4
  ram.setU8(a6, 1);                                          // $25CBC2 / $25CBF0 move.b #$1,(A6)
}

export const DRAW_25E72E = Object.freeze({
  addr: 0x25e72e, bytes: 0x8a,
  records: Object.freeze([0x25e716, 0x25e722]), recordBytes: 0x0c,
  gate: 0x813005, announce: 0x260a7c, announceStateAt: 0x02,
  offset: 0x25f1ec, offsetBody: 0x25f30c,
  message: Object.freeze([0x25f270, 0x25f290, 0x25f2b0]), messageStride: 0x10,
  config: 0x803808, separate: 0x80380b,
  pair: Object.freeze({
    commonRate: 0x803956, commonCoins: 0x803958, coinRateA: 0x803959,
    commonCoinsB: 0x80395e, coinRateB: 0x80395f,
  }),
  coordHighAdd: 0xfa00, coordLowAdd: 0xec00,
  emitter: 0x23e08c, d3: 0x06a0, d4: 0x000b,
});

/** `$260A7C..$260A87` -- preserve A4, select `$813162/$813166`, and return mailbox word +2. */
export function announceState260A7C(ram, side) {
  return ram.u16(announceBox260A20(side) + DRAW_25E72E.announceStateAt);
}

/** `$23C838/$23C874`, only as `$25F30C` consumes their returned D0/D1 pair. */
function creditPair25F372(ram, d7) {
  const D = DRAW_25E72E;
  const config = ram.u8(D.config);
  if (config === 0x12) return [0, 0];                           // $23C842/$23C87E -- FREE PLAY
  const separate = ram.u8(D.separate) === 1;
  if (u16(d7) !== 0) {                                        // $25F382 jsr $23C838 -- P1
    if (config === 0x11) return [ram.u8(D.pair.coinRateA), ram.u8(D.pair.commonCoins)];
    return [ram.u8(D.pair.commonRate), ram.u8(D.pair.commonCoins)];
  }
  // $25F378 jsr $23C874 -- P2. Separate pools replace only D1's coin source here.
  const d1 = ram.u8(separate ? D.pair.commonCoinsB : D.pair.commonCoins);
  if (config === 0x11) return [ram.u8(D.pair.coinRateB), d1];
  return [ram.u8(D.pair.commonRate), d1];
}

/** The three `$25F39C/$25F3DE/$25F414` message leaves, each exactly two `$10`-spaced lines. */
function offsetMessage25F39C(tx, rom, desc, addr, digit) {
  const D = DRAW_25E72E;
  const d0 = rom.u16(desc + 2);
  const d1 = rom.u16(desc);
  txString25A14C(tx, rom, d0, d1, 0, addr);                    // $25F3AC/$25F3EE/$25F422
  txString25A14C(tx, rom, d0, u16(d1 - 1), 0, addr + D.messageStride);
  if (digit !== undefined) {
    hexDigit23CD80(tx, u16(d0 + 1), u16(d1 - 1), 0, digit);    // $25F3C6/$25F408
    return u16(d0 + 1);
  }
  return d0;
}

/** `$25F1EC -> $25F30C` -- return the art offset and the carry consumed at `$25E780`.
 *
 * The no-message leaves return D0 0 or 4 with carry clear. The three message leaves draw their
 * cartridge TX strings and set carry, which suppresses both side labels and the record sprite in the caller. */
export function selectOffset25F1EC(ram, rom, tx, d7) {
  const D = DRAW_25E72E;
  const side = sideFromD7_25D4E4(d7);
  const desc = LABELS_25F2D0.descriptors[side];                 // $25F30C/$25F318, selected by D7
  let [d0, d1] = menuDips23C932(ram);                          // $25F31E jsr $23C932
  if (u16(d7) === 0 && ram.u8(D.separate) === 1) d0 = d1;      // $25F324..$25F336
  if (d0 !== 0) return { d0: 4, carry: false };                // $25F338 -> $25F360

  const config = ram.u8(D.config);
  if (config === 0x12) return { d0: 4, carry: false };         // $25F344 -> $25F366
  if (config !== 0x11 && i8(config) < 9) return { d0: 0, carry: false };   // $25F35C

  [d0, d1] = creditPair25F372(ram, d7);                        // $25F372/$25F382
  if (d0 === 1) {                                             // $25F388 cmpi.w #1,D0
    return { d0: d1 !== 0 ? 4 : 0, carry: false };             // $25F390..$25F394
  }
  if (d1 === 0) {
    const out = offsetMessage25F39C(tx, rom, desc, D.message[0], d0);   // $25F39C..$25F3CC
    return { d0: out, carry: true };                           // $25F3CC ori #1,SR
  }

  const diff = u16(d0 - d1);                                  // $25F3D2 sub.w D1,D0
  if (i16(diff) <= 0) return { d0: 4, carry: false };          // $25F3D4 ble $25F360
  const out = diff === 1
    ? offsetMessage25F39C(tx, rom, desc, D.message[2])         // $25F414..$25F434, no digit
    : offsetMessage25F39C(tx, rom, desc, D.message[1], diff);  // $25F3DE..$25F40E
  return { d0: out, carry: true };                             // both leaves `ori #1,SR`
}

/** `$25E72E..$25E7B7` -- one select-screen draw for the caller's current record. */
export function draw25E72E(ram, rom, ctx, a6, d7) {
  const D = DRAW_25E72E;
  const side = u16(d7 + 1) & 1;                                // $25E746..$25E74C
  // These three exits share `$25E762`: draw the side labels, then return without a sprite.
  if (ram.u8(D.gate) !== 0                                    // $25E73C tst.b $813005
    || announceState260A7C(ram, side) === 4                    // $25E74E/$25E754
    || ram.u8(a6) !== 0) {                                    // $25E75C tst.b (A6)
    sideLabels25F2D0(ctx.tx, rom, side);
    return;
  }

  // `$25E774..$25E77C` saves D7/A0-A6 around the helper. D0 and carry are its only products here.
  const offset = selectOffset25F1EC(ram, rom, ctx.tx, d7);
  if (offset.carry) return;                                    // $25E780 bcs $25E7B6
  sideLabels25F2D0(ctx.tx, rom, side);                         // $25E78E jsr $25F2D0

  // D7 zero keeps `$25E716`; nonzero selects `$25E722`. Each record is coordinate plus two art longs.
  const rec = D.records[u16(d7) !== 0 ? 1 : 0];
  const coord = rom.u32(rec);                                  // $25E796 move.l (A0)+,D1
  const hi = u16((coord >>> 16) + D.coordHighAdd);             // $25E798 swap / addi.w #$FA00
  const lo = u16(coord + D.coordLowAdd);                       // $25E79E swap / addi.w #$EC00
  const art = rom.u32(rec + 4 + i16(offset.d0));               // $25E7A4 adda.w D0,A0 / move.l (A0)
  enqueueRegistersThroughStub(ram, rom, D.emitter,
    ((hi << 16) | lo) >>> 0, art, D.d3, D.d4);                 // $25E7A8..$25E7B0, bucket 7
}

/** `$25C818` -- see `PULSE9`. */
export function pulse25C818(ram, ctx) {
  if (ram.u8(PULSE9.gate) !== 0) return;                     // $25C81C tst.b / $25C822 bne.w $25C89C
  const recs = SCREEN17.recs;                                // $25C826 lea $812EA0,A6
  // $25C82C cmpi.b #$6,($1,A6) / bge.w $25C840 and $25C836 cmpi.b #$6,($71,A6) / blt.w $25C84C.
  // SIGNED, and the second is only consulted when the first fails, which is an OR either way.
  if (i8(ram.u8(recs + SCREEN17.phaseAt)) >= PULSE9.freeze
    || i8(ram.u8(recs + SCREEN17.recStride + SCREEN17.phaseAt)) >= PULSE9.freeze) {
    ram.setU8(PULSE9.gate, 1);                               // $25C840 move.b #$1,$813005
    return;                                                  // $25C848 bra.w $25C89C
  }
  const phase = (ram.u8(PULSE9.phase) + PULSE9.phaseStep) & 0xff;   // $25C858 addi.b #$6,$813004
  ram.setU8(PULSE9.phase, phase);
  if (!ctx?.tables || !ctx?.palette) {
    ctx?.unported?.note(PULSE9.addr, `$${PULSE9.addr.toString(16).toUpperCase()
      } -- the select screen's palette pulse needs BOTH a MoveTables ($241D34) and a PaletteState `
      + '($24150A). This chain carries neither, so $813004 advanced and nothing was installed');
    return;
  }
  // $25C860 move.w #$50,D0 / $25C864 moveq #0,D1 / $25C866 move.b $813004,D1 / $25C86C jsr $241D34.
  // D2 is the component `handlers.js`'s $272540 also names `.dy`.
  const d2 = ctx.tables.shotVector(PULSE9.speedIdx, phase).dy;
  // $25C872 move.w #$800,D6 / $25C876 sub.w D2,D6 / $25C878 lsr.w #$6,D6 -- a WORD subtract and a
  // LOGICAL shift, so the level is unsigned however far D2 swings.
  const level = u16(PULSE9.levelBase - u16(d2)) >>> PULSE9.levelShift;
  for (let i = 0; i < PULSE9.words; i++) {                   // $25C87A moveq #$1F,D7 -- dbra, so 32
    ram.setU16(PULSE9.dst + i * 2,
      fade246292(ram.u16(PULSE9.src + i * 2), level));       // $25C87C..$25C888
  }
  // $25C88C `41 f9` is lea $812FC4,A0 -- A0, NOT A1 (`43F9` would be A1). It reloads the SOURCE,
  // because $24150A's own `lea $80E886,A1` would overwrite an A1 set here. The loop above already
  // left A0 at $812FC4 anyway; the cartridge spells it out and so does this.
  const src = new Uint8Array(64);
  for (let i = 0; i < 64; i++) src[i] = ram.u8(PULSE9.dst + i);
  install24150A(ram, ctx.palette, PULSE9.bank, src, 0x25c896, '$25C818 select-screen pulse');
}

/** `$25CACA` -- THE DISPATCH ENTRY. State 1 is the fall-through and is the record walk. */
export function objSlot9(ram, rom, a5, ctx) {
  const st = ram.u8(a5 + SCREEN9.state);
  if (st === 0) {                                            // $25CACA tst.b / beq $25C8A2
    seed25C8A2(ram, rom, a5, ctx);
    return;
  }
  if (st === 2) {                                            // $25CAD2 cmpi.b #$2 / beq $25CAC2
    // W390 -- `$241292 41ed 004c` is `lea ($4C,A5),A0`, and `$241238`'s `$241252 22 90` is
    // `move.l (A0),(A1)`. The argument is the ID LONG at `($4C,A5)`, never the type word at (A5).
    // A 16-bit read here silently queued the wrong value and `$2411F4`'s `cmp.w` matched nothing,
    // so the screen asked to die and never did (trap 18).
    queueKill(ram, ram.u32(a5 + SCREEN9.idAt));              // $25CAC2 JMP $241292 -- one instruction
    return;
  }

  ram.setU8(a5 + SCREEN9.busy, 0);                           // $25CADA clr.b ($3,A5)
  for (let r = 0; r < SCREEN17.recCount; r++) {              // $25CAE4 moveq #$1,D7 + dbra = TWO
    const a6 = SCREEN17.recs + r * SCREEN17.recStride;
    const d7 = SCREEN17.recCount - 1 - r;                    // dbra counts DOWN
    // $25CAE6 tst.b (A6) / $25CAE8 beq.w $25CB94. THE `beq` IS NOT `continue`: its target is the
    // JOIN POLL, and both arms of the branch rejoin at $25CBF4 inside the loop.
    if (ram.u8(a6) === 0) {
      joinPoll25CB94(ram, ctx, a6, d7);                      // $25CB94..$25CBF2
    } else {
      recordWalk25CAEC(ram, rom, ctx, a5, a6, d7);           // $25CAEC..$25CB92
    }
    // $25CBF4 jsr $25E72E -- EVERY record reaches this, live or dead. The callee either draws the
    // side labels alone, prints its carry-setting credit message, or enqueues one bucket-7 record sprite.
    draw25E72E(ram, rom, ctx, a6, d7);
    // $25CBFA lea ($70,A6),A6 / $25CBFE dbra D7,$25CAE6 ($51CF FEE6, -282 from $25CC00).
  }

  // ---------------------------------------------------------------------------------------------
  // $25CC02..$25CC44 -- THE TEARDOWN DECISION, and it is the screen's only exit.
  //
  // D0 starts at 3 with BOTH bits set and each record CLEARS its own bit unless it is finished:
  // a DEAD record never clears (the `beq` jumps the `andi` entirely), and a live one clears and
  // then puts the bit back only if its state is 8, `$25D748`'s retirement marker. So 3 means
  // "neither record is still choosing", and that writes ($2,A5) = 2 -- the state `$25CAD2` turns
  // into `jmp $241292` on the NEXT frame. Without this block slot [9] runs for ever and the front
  // end never hands over.
  //
  // `1B7C 0002 0002` is `move.b #$2,($2,A5)`. The immediate comes first and the displacement
  // second (trap 1), and here they are the SAME VALUE -- so this one site cannot tell a reader
  // which order the assembler used. `$25CC12 0C2E 0008 0001` next door can, and does: immediate
  // $8, displacement $1. That is where the order was checked; this line just follows it.
  // ---------------------------------------------------------------------------------------------
  let d0 = WALK9.bothBits;                                   // $25CC02 moveq #$3,D0
  const recs = SCREEN17.recs;                                // $25CC04 lea $812EA0,A6
  if (ram.u8(recs) !== 0) {                                  // $25CC0A tst.b (A6) / beq.s $25CC1E
    d0 &= 0xfffe;                                            // $25CC0E andi.w #$FFFE,D0
    if (ram.u8(recs + SCREEN17.phaseAt) === WALK9.retired) d0 |= 0x0001;   // $25CC12 / $25CC1A ori
  }
  const rec1 = recs + SCREEN17.recStride;
  if (ram.u8(rec1) !== 0) {                                  // $25CC1E tst.b ($70,A6) / beq.s
    d0 &= 0xfffd;                                            // $25CC24 andi.w #$FFFD,D0
    if (ram.u8(rec1 + SCREEN17.phaseAt) === WALK9.retired) d0 |= 0x0002;   // $25CC28 / $25CC30
  }
  if (d0 === WALK9.bothBits) {                               // $25CC34 cmpi.w #$3,D0 / $25CC38 bne.s
    ram.setU8(a5 + SCREEN9.state, WALK9.killState);          // $25CC3A move.b #$2,($2,A5)
  }
  // $25CC40 `4EBA FBD6` bsr.w -- the displacement word is at $25CC42 and -1066 from there is
  // $25C818, so it runs UNCONDITIONALLY, on the same frame the kill is armed. $25CC44 rts.
  pulse25C818(ram, ctx);
}

/** `$25CAEC..$25CB92` -- one LIVE record's pass: the eight sequential compares and the tail. */
function recordWalk25CAEC(ram, rom, ctx, a5, a6, d7) {
  // Eight compares against ONE byte, run in SEQUENCE. A handler that advances the state lets the
  // next arm fire in the same pass, exactly as in slot [17].
  for (const [i, phase] of SCREEN9.states.entries()) {
    if (ram.u8(a6 + SCREEN17.phaseAt) !== phase) continue;
    switch (phase) {
      case 0x03:
        phase3_25D306(ram, rom, ctx, a5, a6, d7);          // $25CAF4 -- leaves state 4 STANDING
        break;
      case 0x05:
        phase5_25D39C(ram, rom, ctx, a5, a6, d7, DESC17.base[sideFromD7_25D4E4(d7)]);
        break;
      case 0x06:
        phase6_25D4F0(ram, rom, ctx, a6, d7);              // $25CB1E
        break;
      // $25CB24 cmpi.b #$7,($1,A6) / $25CB2A bne.s / $25CB2C jsr $25D560 -- SLOT [9]'s OWN edge
      // into the state-7 handler, and it sits FIFTH in the compare sequence, immediately after
      // state 6's. That position is load-bearing: the compares are sequential, not else-if, and
      // `$25D522` inside `$25D4F0` writes `($1,A6) = 7`, so a record that entered this pass in
      // state 6 runs state 7 in the SAME frame. The order lives in `SCREEN9.states`, which the
      // loop above iterates -- reordering these `case` labels for tidiness would not change it,
      // but reordering that array would, and it must not be.
      //
      // Slot [17] reaches the same routine from `$25CF0A`/`$25CF12`. The draws are passed
      // DIRECTLY here and injected as `ctx.selectDraws` in `main.js`; see `DRAWS9_25D800` for
      // why the two callers cannot do the same thing.
      //
      // `$25D748 move.b #$8,($1,A6)` retires the record to state 8 and FALLS THROUGH into the
      // draws, so state 8 is visible to them on that frame. Nothing dispatches 8 -- it is the
      // retirement marker, it is not in `SCREEN9.states`, and it must not get an arm.
      case 0x07:
        phase7_25D560(ram, rom, ctx, a5, a6, d7, DRAWS9_25D800);   // $25CB2C
        break;
      case 0x04:
        phase4_25D402(ram, rom, ctx, a5, a6, d7);          // $25CB02
        break;
      case 0x00:
        phase0_25D010(ram, rom, ctx, a6, d7);              // $25CB3A
        break;
      case 0x01:
        phase1_25D1DA(ram, rom, ctx, a5, a6, d7);          // $25CB48
        break;
      case 0x02:
        phase2_25D164(ram, rom, ctx, a5, a6, d7,           // $25CB58
          DESC17.base[sideFromD7_25D4E4(d7)]);
        break;
      // ALL EIGHT OF `SCREEN9.states` NOW HAVE AN ARM, so nothing in this file reaches `default:`
      // any more. IT STAYS ANYWAY. It is the only thing that would catch a state added to
      // `SCREEN9.states`/`SCREEN9.handlers` without an arm to run it -- which is exactly the hole
      // state 7 sat in until W375, and reading this note's count is what would have found it.
      default:
        ctx.unported?.note(SCREEN9.handlers[i], `$${SCREEN9.handlers[i].toString(16).toUpperCase()
          } -- slot [9]'s handler for state ${phase} on ($1,A6). Unread`);
    }
  }
  walkTail25CB5E(ram, a6);                                   // $25CB5E..$25CB90, then $25CB92 bra
}

export const HANDLER2 = Object.freeze({
  addr: 0x25d164, table: 0x25cf60, entries: 2,
  string: 0x25d1ca, nextPhase: 0x03, col: 0x08, shift: 9, bias: 8,
});

/** `$25D164` -- SLOT [9]'s STATE-2 HANDLER, and it CLOSES THE LOOP: it sets `($1,A6)` back to 3.
 *
 *  So a record cycles 3 -> 4 -> ... -> 2 -> 3 rather than running to an end. Slot [17], which has no
 *  state-2 arm, cannot cycle -- another way the two screens differ while sharing the machine.
 *
 *  It is `$25D39C`'s shape with three things moved: the index is `($3,A6)` not `($5,A6)`, the table
 *  is `$25CF60` (TWO entries, bounded by a descriptor at `$25CF64`), and it writes the THIRD slot
 *  byte `($8,A5)`/`($9,A5)` rather than the first. The side select is the same `tst.w D7`.
 *
 *  Because it lands on `($8,A5)`/`($9,A5)` it completes the picture of the six per-side bytes: `$4`
 *  and `$5` from `$25D39C`, `$6` and `$7` from `$25D306`, `$8` and `$9` from here. Three pairs, one
 *  handler each, and every one of them selects by D7.
 */
export function phase2_25D164(ram, rom, ctx, a5, a6, d7, a4) {
  const d0 = rom.u16(HANDLER2.table + u16(ram.u8(a6 + 0x03) << 1));   // $25D166/$25D16A/$25D170
  ram.setU8(a5 + (u16(d7) !== 0 ? 0x08 : 0x09), d0 & 0xff);  // $25D174 tst.w D7 / $25D178 / $25D17E

  // $25D182 -- D0 is rebuilt as the SIDE INDEX here, the same 0/1 $25D4E4 produces, and handed to
  // $241688 together with ($2,A6) as D1.
  const side = sideFromD7_25D4E4(d7);                        // $25D184 tst.w D7 / bne / $25D188
  if (ctx.palette) {
    paletteSet241688(ram, ctx.palette, rom, side, ram.u16(a6 + 0x02));   // $25D18A / $25D18E
  } else {
    ctx.unported?.note(0x241688, `$25D18E jsr $241688 with D0=${side} -- no PaletteState here`);
  }

  const src = a4 === undefined ? 0 : rom.u16(a4 + 0x0a);     // $25D194 move.w ($A,A4),D1
  const row = u16((src >>> HANDLER2.shift) + HANDLER2.bias); // $25D198 lsr #6 / $25D19A lsr #3
  txString25A14C(ctx.tx, rom, HANDLER2.col, row, 0, HANDLER2.string);   // $25D1AC jsr $25A14C
  ram.setU8(a6 + SCREEN17.phaseAt, HANDLER2.nextPhase);      // $25D1B2 -- back to THREE
}

export const HANDLER4 = Object.freeze({
  addr: 0x25d402, options: 3, nextPhase: 0x05,
  bitPrev: 0x02, bitNext: 0x03, confirmMask: 0x70,
  moveSound: 0x28c6fa, confirmSound: 0x28c6e0,
  moved: 0x28, autoConfirm: 0x30, clearOnConfirm: 0x2e,
  sharedGuard: 0x03,                          // ($3,A5), bset here and cleared at the top of the walk
  drawsA: Object.freeze([0x25e220, 0x25e29e]),
  drawsB: Object.freeze([0x25e6ce]),
  drawsAlways: Object.freeze([0x25e824, 0x25edf8, 0x25ef30, 0x25f074]),
});

/** `$25D402` -- SLOT [9]'s STATE-4 HANDLER: THE CURSOR ITSELF, and the mutual exclusion in motion.
 *
 *  It reads input through the DESCRIPTOR's edge reader -- `movea.l ($6,A4),A0 / jsr (A0)` -- so the
 *  side's reader comes from the same `$25D29A`/`$25D2A8` records `$25D306` selects.
 *
 *  BIT 2 STEPS BACK AND BIT 3 STEPS FORWARD, each wrapping across THREE options, and each **loops
 *  again while the new value equals `(A3)`** -- the OTHER side's byte, which the head leas as
 *  `($7,A5)` for side 0 and `($6,A5)` for side 1. So the cursor SKIPS OVER whatever the other player
 *  is on rather than being blocked by it. Written as a plain `+1 mod 3` it would land on the other
 *  player's choice and stick there.
 *
 *  CONFIRM IS TWO CONDITIONS, NOT ONE. `($30,A6)` non-zero confirms outright; otherwise a button in
 *  the `$70` mask is required. `($30,A6)` is exactly what the dispatcher's `($31,A6)` countdown
 *  sets, so the record can also confirm ITSELF on a timer.
 *
 *  AND THE FIVE DRAW CALLS ARE GUARDED BY `bset` ON `($3,A5)`, the byte the walk clears each frame.
 *  The FIRST record to reach state 4 does the shared draws; the second sees the bit already set and
 *  skips them. Dropping the guard draws the shared parts twice per frame.
 */
export function phase4_25D402(ram, rom, ctx, a5, a6, d7) {
  const side = sideFromD7_25D4E4(d7);
  const a4 = DESC17.base[side];                              // $25D406 / $25D410
  const a3 = a5 + (side === 0 ? 0x07 : 0x06);                // $25D40A / $25D414 -- the OTHER side
  const d0 = readInput23D186(ram, side);                     // $25D418 movea.l ($6,A4),A0 / jsr (A0)

  const step = (dir) => {
    ctx.soundPost?.(HANDLER4.moveSound);                     // $25D426 / $25D450
    ram.setU16(a6 + HANDLER4.moved, 1);                      // $25D42C / $25D456
    let d1 = ram.u16(a6 + 0x04);                             // $25D432 / $25D45C
    for (let guard = 0; guard <= HANDLER4.options; guard++) {
      d1 = u16(d1 + dir);
      if (dir < 0 && (d1 & 0x8000) !== 0) d1 = HANDLER4.options - 1;   // $25D438 bpl / $25D43C
      if (dir > 0 && d1 > HANDLER4.options - 1) d1 = 0;                // $25D462 cmpi #$2 / ble
      // $25D440 / $25D46C cmp.b (A3),D1 / beq -- go round AGAIN on the other side's choice.
      if ((d1 & 0xff) !== ram.u8(a3)) break;
    }
    ram.setU16(a6 + 0x04, d1);                               // $25D444 / $25D470
  };

  if ((d0 & (1 << HANDLER4.bitPrev)) !== 0) step(-1);        // $25D41E btst #$2,D0
  if ((d0 & (1 << HANDLER4.bitNext)) !== 0) step(+1);        // $25D448 btst #$3,D0

  ram.setU8(a5 + (side === 0 ? 0x06 : 0x07),                 // $25D474 tst.w D7 / $25D478 / $25D480
    ram.u8(a6 + 0x05));

  confirmAndDraw(ram, rom, ctx, a5, a6, d0, HANDLER4.nextPhase, d7);   // $25D486..$25D4E2
}

/** `$25D486..$25D4E2` and `$25D23A..$25D292` -- THE SHARED CONFIRM-AND-DRAW TAIL. The two blocks are
 *  byte for byte the same apart from the state they write, so this is one routine assembled twice
 *  rather than two: state 1's tail advances to 2 and state 4's to 5.
 *
 *  CONFIRM IS TWO CONDITIONS. `($30,A6)` non-zero confirms outright; otherwise a button in the `$70`
 *  mask is needed. `($30,A6)` is what the dispatcher's `($31,A6)` countdown sets, so a record can
 *  confirm itself on a timer with no input at all.
 *
 *  THE DRAWS ARE GUARDED BY `bset` ON `($3,A5)`, the byte the walk clears every frame. `bset` returns
 *  the OLD bit, so the FIRST record to reach here does the gated draws and the second skips them.
 *  Drop the guard and the shared parts draw twice per frame.
 */
function confirmAndDraw(ram, rom, ctx, a5, a6, d0, nextPhase, d7) {
  // **THE NO-CONFIRM PATH FALLS INTO THE DRAWS. IT DOES NOT RETURN.** `$25D244 beq.w $25D254`
  // (extension word at `$25D246`, `+$E`) lands on `$25D254 move.l A4,-(SP)`, which is the FIRST
  // instruction of the draw block -- not on the `rts` at `$25D292`. State 4's copy is the same
  // shape: `$25D490 beq.w $25D4A4` skips `$25D49A move.b #$5,($1,A6)` and `$25D4A0 clr.w ($2E,A6)`
  // and lands on its own `move.l A4,-(SP)`.
  //
  // So a frame with no confirm SKIPS the sound and the state write and STILL DRAWS. This was
  // modelled as an early `return` until W374, which meant the whole screen drew only on the single
  // frame the player pressed a button.
  //
  // It also decides what `($1,A6)` is when the draws run, which is load-bearing downstream: on a
  // non-confirm frame it is still 1 (state 1's tail) or 4 (state 4's), NOT 2 or 5. That is why
  // `$25EDF8`'s and `$25F074`'s `cmpi.b #$4,($1,A6)` gates DO fire -- W374 briefly recorded both as
  // dead on the strength of the old early return, and both claims were withdrawn. Trap 10 exactly:
  // the state byte advances mid-frame and a compare downstream sees the new value in the same pass.
  const confirmed = ram.u8(a6 + HANDLER4.autoConfirm) !== 0  // $25D23A / $25D486 tst.b ($30,A6)
    || (d0 & HANDLER4.confirmMask) !== 0;                    // $25D240 / $25D48C andi.w #$70
  if (confirmed) {
    ctx.soundPost?.(HANDLER4.confirmSound);                  // $25D248 / $25D494 jsr $28C6E0
    ram.setU8(a6 + SCREEN17.phaseAt, nextPhase);             // $25D24E / $25D49A
    if (nextPhase === HANDLER4.nextPhase) {
      ram.setU8(a6 + HANDLER4.clearOnConfirm, 0);            // $25D4A0 -- state 4's tail ONLY
    }
  }

  const guard = ram.u8(a5 + HANDLER4.sharedGuard);           // $25D256 / $25D4A6 bset #$0,($3,A5)
  ram.setU8(a5 + HANDLER4.sharedGuard, guard | 0x03);
  if ((guard & 0x01) === 0) {
    draw25E220(ram, rom, ctx, a6);                           // $25D25E / $25D4AE jsr $25E220
    draw25E29E(ram, rom, ctx, a6);                           // $25D264 / $25D4B4 jsr $25E29E
  }
  if ((guard & 0x02) === 0) {                                // $25D26A / $25D4BA bset #$1
    draw25E6CE(ram, rom, ctx, a6);                            // $25D272 / $25D4C2 jsr $25E6CE
  }
  // THE UNGATED TAIL, IN ROM ORDER. The order is load-bearing: these four emit into the same
  // bucket, so reordering them reorders the sprites. $25D278/$25D27E/$25D284/$25D28A on state 1's
  // tail and $25D4C8/$25D4CE/$25D4D4/$25D4DA on state 4's.
  // $25D278 / $25D4C8 jsr $25E824. It runs FIRST of the ungated tail, and that order matters for
  // more than sprite sequence: it is the SOLE WRITER of ($2C,A6), which $25EDF8 and $25F074 both
  // read further down this same tail. Until it was ported that flag was permanently 0, so those
  // two draws' animation arms never ran.
  draw25E824(ram, rom, ctx, a6, d7);
  // $25D27E / $25D4CE jsr $25EDF8. WITHDRAWN CLAIM, kept as a warning: W374 recorded this as a
  // call whose body never runs. It was wrong, and it was wrong because `confirmAndDraw` modelled
  // the no-confirm path as an early `return`. On a non-confirm frame `($1,A6)` is still 4 here and
  // the body DOES run. See the note on `confirmAndDraw` above. The stale reasoning was:
  // THE BODY NEVER RUNS: the `setU8(phaseAt, nextPhase)` near the
  // top of this function has already put ($1,A6) at 2 (state 1's tail) or 5 (state 4's), and
  // $25EE28 gates the whole body on 4. So this call is an immediate rts as shipped, on both paths.
  // Wired faithfully anyway, and w374selectdraws.test.js pins the fact so a future change that
  // makes the body live has to be deliberate.
  draw25EDF8(ram, rom, ctx, a6, d7);
  draw25EF30(ram, rom, ctx, a6, d7);                         // $25D284 / $25D4D4 jsr $25EF30
  // $25D28A / $25D4DA jsr $25F074. The record state is 2 here (state 1's tail) or 5 (state 4's) on
  // a confirm frame, and still 1 or 4 on a non-confirm one -- see `confirmAndDraw`'s head. All four
  // are below 7, so BOTH OF THESE call sites take the full eight-emit path.
  //
  // W373 said the slice-2-only arm "is reachable only from $25D560's tail at $25D836, which is not
  // ported". The first half is still exactly right and the second is superseded: W374 ported
  // $25D560 as `phase7_25D560` (objslot17.js) with its tail as `TAIL_25D560`, and `main.js`
  // registers slot [17], so $25D836 -- `TAIL_25D560[6]` -- IS LIVE AT RUNTIME and the slice arm now
  // has a real host. It still never runs from HERE, which is the only thing this line has to say.
  draw25F074(ram, rom, ctx, a6, d7);
}

export const HANDLER1 = Object.freeze({
  addr: 0x25d1da, options: 2, nextPhase: 0x02,
  desc: Object.freeze([0x25cf64, 0x25cf72]),   // the SECOND descriptor pair, not $25D29A's
  at: 0x02,
});

/** `$25D1DA` -- SLOT [9]'s STATE-1 HANDLER: A SECOND CURSOR, on `($2,A6)` and over TWO options.
 *
 *  Three things separate it from state 4's cursor, and none is cosmetic:
 *
 *   1. **IT USES THE OTHER DESCRIPTOR PAIR**, `$25CF64`/`$25CF72`, not `$25D29A`/`$25D2A8`. Same
 *      14-byte layout, different records, and its edge reader comes from `($6,A4)` of those.
 *   2. **IT HAS NO MUTUAL EXCLUSION.** There is no `(A3)` compare at all -- the two options are not
 *      contended, so the cursor just wraps.
 *   3. **THE SOUND IS CONDITIONAL.** It saves `($2,A6)` into D6 first and only posts `$28C6FA` when
 *      the value actually CHANGED. State 4 posts unconditionally. At the ends of a two-option wrap
 *      that difference is audible, which is presumably the point.
 */
export function phase1_25D1DA(ram, rom, ctx, a5, a6, d7) {
  const side = sideFromD7_25D4E4(d7);
  const a4 = HANDLER1.desc[side];                            // $25D1DA / $25D1E2 -- the SECOND pair
  void a4;
  const d0 = readInput23D186(ram, side);                     // $25D1E6 movea.l ($6,A4),A0 / jsr (A0)

  const step = (dir, wrapTo, limit) => {
    const before = ram.u16(a6 + HANDLER1.at);                // $25D1EC / $25D210 move.w ($2,A6),D6
    let v = u16(ram.u16(a6 + HANDLER1.at) + dir);
    if (dir < 0 && (v & 0x8000) !== 0) v = wrapTo;           // $25D1F6 subq / bge / $25D1FC
    if (dir > 0 && v > limit) v = wrapTo;                    // $25D21A addq / cmpi #$1 / ble / $25D226
    ram.setU16(a6 + HANDLER1.at, v);
    // $25D202 / $25D22C cmp.w ($2,A6),D6 / beq -- the sound is CONDITIONAL on a real change.
    if (v !== before) ctx.soundPost?.(HANDLER4.moveSound);
  };

  if ((d0 & (1 << HANDLER4.bitPrev)) !== 0) step(-1, HANDLER1.options - 1, HANDLER1.options - 1);
  if ((d0 & (1 << HANDLER4.bitNext)) !== 0) step(+1, 0, HANDLER1.options - 1);

  confirmAndDraw(ram, rom, ctx, a5, a6, d0, HANDLER1.nextPhase, d7);   // $25D23A..$25D292
}

export const HANDLER0 = Object.freeze({
  addr: 0x25d010, nextPhase: 0x01,
  desc: Object.freeze([0x25cf64, 0x25cf72]),
  // Per-side coordinates: side 0 gets $1A00/$E600 and side 1 $1E40/$5200.
  coord: Object.freeze([Object.freeze([0x1a00, 0xe600]), Object.freeze([0x1e40, 0x5200])]),
  d0At: 0x0e, d1At: Object.freeze([0x14, 0x1a, 0x20, 0x26]),
  pairs: Object.freeze([[0x0a, 0x0060], [0x0c, 0x0c00], [0x10, 0x0060], [0x12, 0x0c00],
    [0x2e, 0x0599], [0x40, 0x1ac0]]),
  countAt: 0x31, countValue: 0x02,
  clearBytes: Object.freeze([0x30, 0x34, 0x35]),
  clearWords: Object.freeze([0x36, 0x38, 0x3a, 0x3c, 0x3e,
    0x42, 0x44, 0x46, 0x48, 0x4a, 0x4c, 0x4e, 0x50, 0x52, 0x54]),
  palettes: Object.freeze([
    Object.freeze({ src: 0x223fb8, bank: 24 }), Object.freeze({ src: 0x223f78, bank: 25 }),
    Object.freeze({ src: 0x223f38, bank: 27 }), Object.freeze({ src: 0x223d38, bank: 26 }),
    Object.freeze({ src: 0x223d78, bank: 28 }), Object.freeze({ src: 0x223db8, bank: 29 }),
    Object.freeze({ src: 0x223df8, bank: 30 }), Object.freeze({ src: 0x223e38, bank: 12 }),
    Object.freeze({ src: 0x223e78, bank: 13 }), Object.freeze({ src: 0x223eb8, bank: 14 }),
    Object.freeze({ src: 0x223ef8, bank: 15 }),
  ]),
});

/** `$25D010` -- SLOT [9]'s RECORD STATE 0: arm a record and hand it to state 1.
 *
 *  THE ONLY PER-SIDE VALUE IS THE COORDINATE PAIR. Side 0 gets `$1A00`/`$E600` and side 1
 *  `$1E40`/`$5200`; everything else it writes is identical for both. D1 goes into FOUR fields at
 *  `$14`/`$1A`/`$20`/`$26`, a `$6` stride, so those are one array rather than four names.
 *
 *  It clears three BYTES and fifteen WORDS, and `($40,A6)` alone is set to `$1AC0` in the MIDDLE of
 *  that run. Transcribed as the list it is: folding the clears into a range would take `$40` with
 *  them and lose the only non-zero field in the block.
 *
 *  ELEVEN PALETTE INSTALLS, all through `$24150A`. They overlap slot [17] state 0's set in FIVE banks
 *  -- 24, 25, 26, 27, 28 -- and differ in the other six, which is what you would expect of two
 *  screens that share their character art and not their furniture.
 */
export function phase0_25D010(ram, rom, ctx, a6, d7) {
  const side = sideFromD7_25D4E4(d7);
  ram.setU16(a6 + 0x02, 0);                                  // $25D010 (and again at $25D022)
  const [d0, d1] = HANDLER0.coord[side];                     // $25D028/$25D034 -- the ONLY per-side part
  ram.setU16(a6 + HANDLER0.d0At, d0);                        // $25D03C
  for (const off of HANDLER0.d1At) ram.setU16(a6 + off, d1); // $25D040..$25D04C, a $6 stride
  for (const [off, v] of HANDLER0.pairs) ram.setU16(a6 + off, v);   // $25D050..$25D068, $25D094
  ram.setU8(a6 + HANDLER0.countAt, HANDLER0.countValue);     // $25D06E
  for (const off of HANDLER0.clearBytes) ram.setU8(a6 + off, 0);    // $25D074..$25D07C
  for (const off of HANDLER0.clearWords) ram.setU16(a6 + off, 0);   // $25D080..$25D0BE

  for (const p of HANDLER0.palettes) {                       // $25D0C2..$25D156
    if (ctx.palette) {
      install24150A(ram, ctx.palette, p.bank, rom.bytes(p.src, 64), 0x25d0c8, 'slot [9] palette');
    } else {
      ctx.unported?.note(0x24150a, `$25D0C8.. bank ${p.bank} <- $${p.src.toString(16).toUpperCase()}`);
    }
  }
  ram.setU8(a6 + SCREEN17.phaseAt, HANDLER0.nextPhase);      // $25D15C -- 0 ADVANCES to 1
}

export const DRAW_25E220 = Object.freeze({
  addr: 0x25e220, exit: 0x25e21e, stub: 0x23dfb4,
  gateWord: 0x64, gateByte: 0x35, offA: 0x46, offB: 0x48,
  sprites: Object.freeze([
    Object.freeze({ d1: 0x34010d00, art: 0x0019dd68, attr: 0x0c78, pal: 0x13, op: 'addHigh' }),
    Object.freeze({ d1: 0x21410d00, art: 0x0019e03c, attr: 0x0c78, pal: 0x13, op: 'subHigh' }),
    Object.freeze({ d1: 0x21810e00, art: 0x001a125c, attr: 0x1650, pal: 0x14, op: 'subLowB' }),
    Object.freeze({ d1: 0x21811640, art: 0x001a15d0, attr: 0x1650, pal: 0x14, op: 'addLowB' }),
  ]),
});

/** `$25E220` -- the first of the shared draws, called by state 1's tail, state 4's, AND `$25D560`'s
 *  (`TAIL_25D560[0]`, `$25D808`, ported in W374). W373 wrote "the SEVEN shared draws" here and "the
 *  eight" everywhere else; both counts are real and neither is the number of routines. **EIGHT are
 *  ported in this file. SEVEN run from any one call site**, and not the same seven:
 *  `confirmAndDraw`'s two tails fire `$25EDF8` and never `$25E4D0`, `$25D560`'s tail fires
 *  `$25E4D0` and never `$25EDF8`. This routine is in all three.
 *
 *  TWO GATES, and they are different kinds: `tst.w ($64,A6) / beq` returns when the WORD is zero,
 *  and `tst.b ($35,A6) / bne` returns when the BYTE is NON-zero. Both jump to the same `rts` at
 *  `$25E21E`, which sits BEFORE the entry -- so the routine's own exit is above its first byte.
 *
 *  FOUR SPRITES, and the offsets go to different HALVES of D1. The first two use `swap D1 /
 *  add.w or sub.w ($46,A6) / swap`, so they move the HIGH word; the third and fourth apply
 *  `($48,A6)` to the LOW word with no swap at all. Same idiom, opposite halves, and reading the
 *  swaps as decoration puts every offset in the wrong axis.
 *
 *  THE FOURTH SPRITE INHERITS D1'S HIGH WORD FROM THE THIRD. `$25E286 move.w #$1640,D1` writes only
 *  the low half, so `$2181` carries over. Rebuilding D1 from scratch for each sprite loses that.
 *
 *  It ends in `jmp $23DFB4`, so the fourth emit is a tail call rather than a fourth `jsr`.
 */
export function draw25E220(ram, rom, ctx, a6) {
  if (ram.u16(a6 + DRAW_25E220.gateWord) === 0) return;      // $25E220 tst.w / beq $25E21E
  if (ram.u8(a6 + DRAW_25E220.gateByte) !== 0) return;       // $25E226 tst.b / bne $25E21E -- INVERTED

  const offA = ram.u16(a6 + DRAW_25E220.offA);
  const offB = ram.u16(a6 + DRAW_25E220.offB);
  for (const sp of DRAW_25E220.sprites) {
    let d1 = sp.d1 >>> 0;
    const hi = (d1 >>> 16) & 0xffff;
    const lo = d1 & 0xffff;
    if (sp.op === 'addHigh') d1 = ((u16(hi + offA) << 16) | lo) >>> 0;   // $25E232 swap/add/swap
    if (sp.op === 'subHigh') d1 = ((u16(hi - offA) << 16) | lo) >>> 0;   // $25E254 swap/sub/swap
    if (sp.op === 'subLowB') d1 = ((hi << 16) | u16(lo - offB)) >>> 0;   // $25E26E sub.w, NO swap
    if (sp.op === 'addLowB') d1 = ((hi << 16) | u16(lo + offB)) >>> 0;   // $25E28A add.w, NO swap
    enqueueRegistersThroughStub(ram, rom, DRAW_25E220.stub, d1, sp.art, sp.attr, sp.pal);
  }
}

export const DRAW_25E29E = Object.freeze({
  addr: 0x25e29e, rts: 0x25e47e, bytes: 481,
  stub: 0x23e2f2,                            // the ZOOMING REGISTER family, bucket 0
  // The FOUR unrolled arms. Only `live` reaches a `jsr`; the other three are dead stores.
  armDeadHead: Object.freeze({ from: 0x25e29e, to: 0x25e2f1 }),
  armLive: Object.freeze({ from: 0x25e2f2, to: 0x25e391 }),
  armDeadLsl: Object.freeze({ from: 0x25e392, to: 0x25e40d }),
  armDeadAsr: Object.freeze({ from: 0x25e40e, to: 0x25e47d }),
  // Off A6, all WORDS. $62 is read by the DEAD head only and is deliberately not listed here.
  longAt: 0x4e, shortAt: 0x50, cursorAt: 0x60,
  // $25E2F2 lea ($25E480,PC),A4 -- the extension word is at $25E2F4 and $25E2F4 + $18C = $25E480.
  ramp: 0x25e480, rampEntries: 16, rampStep: 0x04, rampLast: 0x3c,
  rampBytes: 0x40,                           // the ONE declared ROM window: $25E480 + $40
  leaAt: 0x25e2f2, leaExt: 0x25e2f4, leaDisp: 0x018c,
  // The four emits, in ROM order. `op` names WHICH half the record offset lands on and which the
  // doubled term does; see the doc comment. `d3`/`d4` are `null` where the cartridge INHERITS them.
  emits: Object.freeze([
    Object.freeze({ at: 0x25e322, base: 0x48010000, art: 0x0019e310, attr: 0x14e0, pal: 0x0010,
      op: 'addLongHigh' }),                  // hi = $4801 + X, lo = -2Y
    Object.freeze({ at: 0x25e344, base: 0xfe810000, art: 0x0019ebd4, attr: null, pal: null,
      op: 'subLongHigh' }),                  // hi = $FE81 - X, lo = +2Y
    Object.freeze({ at: 0x25e36a, base: 0x00010000, art: 0x0019f498, attr: 0x3840, pal: null,
      op: 'subShortLow' }),                  // hi = $0001 - 2X, lo = -Y
    Object.freeze({ at: 0x25e38c, base: 0x00012800, art: 0x0019fb9c, attr: null, pal: null,
      op: 'addShortLow' }),                  // hi = $0001 + 2X, lo = $2800 + Y
  ]),
});

/** `$25E29E` -- the second of the eight shared select-screen draws, `$25E29E..$25E47E`, 481 bytes,
 *  ONE STRAIGHT LINE to the `rts` at `$25E47E`. **There is not a single branch, gate, `cmpi` or
 *  `tst` in it**, and `($1,A6)` is never read. Its only gate is the caller's `bset #$0,($3,A5)`.
 *
 *  **IT IS FOUR UNROLLED ARMS OF FOUR REGISTER-LOAD GROUPS EACH, AND ONLY ONE ARM EMITS.**
 *
 *      $25E29E..$25E2F1  the HEAD    reads ($62,A6), 1x, groups 3/4 have no swap   -- NO jsr
 *      $25E2F2..$25E391  **LIVE**    reads ($4E,A6) once and ($50,A6) twice        -- FOUR jsr
 *      $25E392..$25E40D  the LSL arm same fields, `lsl.w #2,D0` = 4x, B's signs    -- NO jsr
 *      $25E40E..$25E47D  the ASR arm `asr.w #1,D0` = 0.5x on group 1, 1x on 2/3/4  -- NO jsr
 *
 *  **THE THREE SILENT ARMS ARE DEAD STORES, PROVEN AND NOT ASSUMED.** A full 6 MB scan of the image
 *  for every 8-bit `Bcc`, every 16-bit PC-relative displacement (`bra.w`/`bsr.w`/`Bcc.w` and every
 *  `4xFA` / `(d16,PC)` extension word) and every absolute longword landing in `$25E29E..$25E47F`
 *  returns **zero** references. The only references to the routine at all are the three `jsr`
 *  operands at `$25D266`, `$25D4B6` and `$25D810`, all pointing at `$25E29E` itself. Every value the
 *  three silent arms compute is overwritten by the next arm before anything can observe it, and the
 *  head reads a **different RAM field** (`$62`, not `$4E`/`$50`) -- which is why "superseded variant,
 *  disabled by deleting its `jsr`" is the natural reading. This is the same shipping-disablement
 *  family as the dead gates in `$25EDF8` and `$25F074`, done with the knife rather than with an
 *  unsatisfiable `cmpi.b`. **Only the live arm is modelled below**; the spans are recorded in
 *  `DRAW_25E29E` and pinned by a test so that nobody later "discovers" them and assumes a gap.
 *
 *  **THE SWAP SHAPES ARE ASYMMETRIC AND THAT IS THE WHOLE POINT.** Emits 1 and 2 do
 *  `swap / +/-($4E,A6) / swap / +/-D0 / +/-D0`, so the record offset lands on the **HIGH** half and
 *  the doubled term on the LOW. Emits 3 and 4 do `+/-($50,A6) / swap / +/-D0 / +/-D0 / swap`, which
 *  is the **opposite** way round. Read the swaps as decoration and every offset goes to the wrong
 *  axis -- exactly what `$25E220`'s docstring already warns about. With `X = ($4E,A6)` and
 *  `Y = ($50,A6)`, D1 resolves to (high = LONG axis):
 *
 *      1  ($4801 + X) : (-2Y)        art $0019E310  D3 $14E0  D4 $0010
 *      2  ($FE81 - X) : (+2Y)        art $0019EBD4  D3 and D4 INHERITED
 *      3  ($0001 - 2X) : (-Y)        art $0019F498  D3 $3840  D4 INHERITED
 *      4  ($0001 + 2X) : ($2800 + Y) art $0019FB9C  D3 and D4 INHERITED
 *
 *  **THE DOUBLING IS TWO INSTRUCTIONS, NOT A SHIFT.** `$25E310`/`$25E312` are two separate
 *  `sub.w D0,D1`, and likewise `$25E33A`/`$25E33C`, `$25E35A`/`$25E35C`, `$25E380`/`$25E382`.
 *  Collapse either pair into one and the sprite lands at half its offset. **There are NO cancelling
 *  immediates here**, unlike `$25E6CE` and `$25EF30`: every literal above is the final value.
 *
 *  **D3 AND D4 ARE INHERITED ACROSS THE `jsr`s, AND THAT IS LOAD-BEARING.** `$23E2F2` does
 *  `movem.l D4/D7/A0,-(SP)` and never writes D1/D2/D3/D6, so D3, D4, D6, A4 and A6 all survive.
 *  Rebuilding D3 per emit puts `$14E0` on emits 3 and 4 and loses the x56 scale below.
 *
 *  **D3 = `$3840` ON EMITS 3 AND 4 IS THE ONE INDEX WHERE THE TWO SCALE TABLES DISAGREE.** Its width
 *  index is `$38 & $3E` = 56, and `ZOOM_REG_SCALE_TABLE[56]` is **x56** where `SCALE_TABLE[56]` is
 *  the x1 out-of-range guard. This routine is the only live producer of that index in the corpus, so
 *  aliasing the two tables would be invisible everywhere else and wrong here.
 *
 *  **D7 IS NEITHER READ NOR WRITTEN ANYWHERE IN THE 481 BYTES**, so there is no `d7` parameter and
 *  no side select. `$23E2F2` preserves D7 regardless, so the caller's selector survives the call.
 *  A4 is loaded locally at `$25E2F2` and clobbered; A0 is untouched. **The routine writes NO RAM at
 *  all** -- every write goes through `$23E2F2` into the sprite bucket.
 *
 *  **THE ZOOM RAMP, AND A TRAP THE PROJECT ALREADY FELL INTO.** `D6 = (A4)` with
 *  `A4 = $25E480 + ($60,A6)`: sixteen longwords whose halves are both `$8000 + $800*i`, i.e. grow
 *  set on both axes and the zoom field counting 0..15 -- a sixteen-frame zoom-in. **The `lea` is at
 *  `$25E2F2`, NOT `$25E2EE`.** `$25E2EE` falls inside the preceding `move.l #$0019FB9C,D2` (which
 *  starts at `$25E2EC`), and reading the extension word there gives a base of `$25E47C` and an
 *  off-by-one cursor. An earlier recon made exactly that error and it was propagated.
 *
 *  **THE CURSOR IS BOUNDED BY CODE, NOT BY ADJACENCY.** `($60,A6)` is initialised only at
 *  `$25D51C move.w #$0,($60,A6)`, advanced only at `$25D7B6 addq.w #4,($60,A6)`, and that `addq` is
 *  skipped by `$25D7AC cmpi.w #$3C,($60,A6) / beq`. So it takes exactly `{0, 4, ..., $3C}` and
 *  saturates on the last entry, which is what makes `$25E480 + $40` the whole window.
 *
 *  **AT TWO OF THE THREE CALL SITES IT DRAWS ITS LITERALS.** `$25D264` (state 1's tail) and
 *  `$25D4B4` (state 4's) arrive with `X = Y = 0` and the cursor at 0, so D1 is exactly `$48010000`,
 *  `$FE810000`, `$00010000`, `$00012800` and D6 is `$80008000` -- the no-zoom encoding. Only
 *  `$25D80E`, in `$25D560`'s tail, drives the fields.
 *
 *  W373 added "and that state is not ported", which made the zoom path look like dead transcription.
 *  **W374 PORTED IT**: `$25D560` is `phase7_25D560` in `objslot17.js`, `$25D80E` is `TAIL_25D560[1]`,
 *  and `main.js` registers slot [17] -- so the literals-only reading above is the SPECIAL case now,
 *  not the whole story, and the sixteen-entry ramp below is exercised on real frames. Which is also
 *  why the `($60,A6)` bound check is worth keeping honest: it is no longer unreachable defence.
 *
 *  Reads: `($4E,A6)`, `($50,A6)`, `($60,A6)`, all WORDS. Inherited: **A6 only**. */
export function draw25E29E(ram, rom, ctx, a6) {
  const D = DRAW_25E29E;
  const x = ram.u16(a6 + D.longAt);                          // ($4E,A6), the LONG-axis accumulator
  const y = ram.u16(a6 + D.shortAt);                         // ($50,A6), the SHORT-axis one
  const cursor = ram.u16(a6 + D.cursorAt);                   // $25E2F8 adda.w ($60,A6),A4

  // $25E2F2 lea ($25E480,PC),A4 / $25E2F6 nop / $25E2F8 adda.w / $25E2FC move.l (A4),D6. The `nop`
  // is real cartridge padding between the lea and the adda; named rather than silently dropped.
  if (cursor > D.rampLast || (cursor & (D.rampStep - 1)) !== 0) {
    // $25D51C / $25D7AC / $25D7B6 bound ($60,A6) to {0, 4, ..., $3C}, and $25E480 + $40 is the only
    // ROM window declared for this routine. Anything else is off the table -- do not invent it.
    ctx.unported?.note(D.leaAt, `$${D.leaAt.toString(16).toUpperCase()} -- ($60,A6) = $${
      cursor.toString(16).toUpperCase()} indexes the zoom-flag ramp outside $${
      D.ramp.toString(16).toUpperCase()}..$${(D.ramp + D.rampBytes - 1).toString(16).toUpperCase()
    }, the sixteen longwords $25D51C/$25D7AC/$25D7B6 bound it to. No ROM is read for that cursor`);
    return;
  }
  const d6 = rom.u32(D.ramp + cursor) >>> 0;                 // $25E2FC move.l (A4),D6 -- ZOOM FLAGS

  // D3 and D4 SURVIVE each `jsr $23E2F2` (`movem.l D4/D7/A0` and no write to D3), so they are
  // carried in these two variables across the loop rather than rebuilt per emit.
  let d3 = 0;                                                // $25E31A move.w #$14E0,D3
  let d4 = 0;                                                // $25E31E move.w #$0010,D4

  for (const e of D.emits) {
    // D1 is carried as an explicit (high, low) pair so that every `swap` is a real step and the two
    // opposite shapes stay visible side by side.
    let hi = (e.base >>> 16) & 0xffff;
    let lo = e.base & 0xffff;

    if (e.op === 'addLongHigh' || e.op === 'subLongHigh') {
      // EMITS 1 and 2. $25E304 / $25E32E swap -- the record offset goes to the HIGH half.
      [hi, lo] = [lo, hi];
      // $25E306 add.w ($4E,A6),D1 / $25E330 sub.w ($4E,A6),D1
      lo = u16(e.op === 'addLongHigh' ? lo + x : lo - x);
      [hi, lo] = [lo, hi];                                   // $25E30A / $25E334 swap -- back
      const d0 = y;                                          // $25E30C / $25E336 move.w ($50,A6),D0
      // $25E310 + $25E312 sub.w D0,D1 TWICE, and $25E33A + $25E33C add.w D0,D1 TWICE. Two separate
      // instructions, hence -2Y and +2Y; one of each gives half the offset.
      lo = u16(e.op === 'addLongHigh' ? lo - d0 : lo + d0);
      lo = u16(e.op === 'addLongHigh' ? lo - d0 : lo + d0);
    } else {
      // EMITS 3 and 4, THE OPPOSITE SHAPE. $25E350 sub.w ($50,A6),D1 / $25E376 add.w ($50,A6),D1 --
      // applied to the LOW half FIRST, with no swap before it.
      lo = u16(e.op === 'subShortLow' ? lo - y : lo + y);
      [hi, lo] = [lo, hi];                                   // $25E354 / $25E37A swap
      const d0 = x;                                          // $25E356 / $25E37C move.w ($4E,A6),D0
      // $25E35A + $25E35C sub.w D0,D1 TWICE, $25E380 + $25E382 add.w D0,D1 TWICE -- so -2X and +2X
      // land on what is now the low half...
      lo = u16(e.op === 'subShortLow' ? lo - d0 : lo + d0);
      lo = u16(e.op === 'subShortLow' ? lo - d0 : lo + d0);
      [hi, lo] = [lo, hi];                                   // $25E35E / $25E384 swap -- ...and the
      // final swap puts the DOUBLED term on the HIGH half, the reverse of emits 1 and 2.
    }

    // $25E314 / $25E33E / $25E360 / $25E386 move.l #<art>,D2 -- rewritten at every emit.
    const d2 = e.art;
    // `null` here means the cartridge does NOT rewrite the register: $25E31A/$25E366 are the only
    // two `move.w ..,D3` and $25E31E is the only `move.w ..,D4` in the live arm.
    if (e.attr !== null) d3 = e.attr;
    if (e.pal !== null) d4 = e.pal;

    enqueueZoomedRegistersThroughStub(ram, rom, D.stub, ((hi << 16) | lo) >>> 0, d2, d3, d4, d6);
  }
  // $25E392 -- the LSL arm begins here and never runs. $25E47E rts.
}

export const DRAW_25E6CE = Object.freeze({
  addr: 0x25e6ce, end: 0x25e713, stub: 0x23dfb4,
  base: 0x38001c00,                          // $25E6CE move.l -- CANCELLED, see the note below
  addHigh: 0xc800, addLow: 0xe400,           // $25E6D6 / $25E6E0 addi.w
  offA: 0x3e,                                // ($3E,A6), READ THREE TIMES, written never
  art: 0x0019c068, attr: 0x38e0,
  // $25E6EE move.w #$0015,D4 and $25E70A ori.w #$6000,D4 -- BOTH flip bits at once.
  pal: Object.freeze([0x0015, 0x6015]), flipOr: 0x6000,
});

/** `$25E6CE` -- A MIRROR PAIR, and the whole routine is 70 bytes (`$25E6CE..$25E713`).
 *
 *  The 342-byte figure in the older docket was the GAP to the next routine, not this one's length.
 *  Nothing past `$25E70E jmp $23DFB4` belongs to it.
 *
 *  **`#$38001C00` IS FULLY CANCELLED BY THE TWO `addi.w`, AND THAT IS DELIBERATE.**
 *  `$25E6D6 addi.w #$C800` lands on the `$3800` half and `$3800 + $C800` wraps to exactly `$0000`;
 *  `$25E6E0 addi.w #$E400` lands on the `$1C00` half and `$1C00 + $E400` wraps to exactly `$0000`.
 *  So D1 leaves the preamble as `(+/-f) << 16` with a HARD ZERO low word -- the long immediate is a
 *  carrier for two constants that annihilate, not a coordinate base. A port that keeps `$38001C00`
 *  and adds the offset on top is wrong by `$3800` in the long axis and by `$1C00` in the short one.
 *  It looks like a transcription mistake. It is not. The arithmetic is kept in the code below rather
 *  than folded to `0` so that the cancellation is visible and checkable.
 *
 *  **IT HAS NO GATES OF ITS OWN.** No `tst`, no `cmp`, no branch: one entry, one exit, two emits.
 *  That is a real structural difference from `$25E220`, which opens with two gates of opposite
 *  sense. This routine's only gate is the caller's `bset #$1,($3,A5)`.
 *
 *  **THE SECOND EMIT RELOADS D2 WITH THE VALUE IT ALREADY HOLDS** (`$25E6F8 move.l #$0019C068,D2`).
 *  D2 survives the `jsr`, so the reload is redundant -- transcribed anyway, because "redundant" is a
 *  claim about `$23DFB4`'s clobber set and that claim is what would silently rot.
 *
 *  **AND THE MIRROR IS TWO SEPARATE `sub.w`, NOT ONE.** `$25E700` and `$25E704` both subtract
 *  `($3E,A6)` from the low word, which after the swap holds `f`: `f - f - f = -f`. Collapsing them
 *  into a single subtract gives `0` and both sprites land on top of each other.
 *
 *  `($3E,A6)` is a WORD and is never written non-zero anywhere in `$25C000..$260000` -- the only
 *  writer there is the `clr.w` at `$25D090`, already ported as `HANDLER0.clearWords` entry `$3E`.
 *  Both sprites therefore currently sit at coordinate 0. The field is still READ rather than folded
 *  to a constant, because a writer outside that range would be invisible if it were folded.
 *
 *  Inherited: **A6 only**. D7 is NOT used, so there is no side select here.
 */
export function draw25E6CE(ram, rom, ctx, a6) {
  const f = ram.u16(a6 + DRAW_25E6CE.offA);                  // $25E6DA / $25E700 / $25E704 ($3E,A6)

  // D1 is carried as an explicit (high, low) pair so every `swap` is a real step and the two
  // cancellations stay separately visible. $25E6CE move.l #$38001C00,D1:
  let hi = (DRAW_25E6CE.base >>> 16) & 0xffff;               // $3800
  let lo = DRAW_25E6CE.base & 0xffff;                        // $1C00
  [hi, lo] = [lo, hi];                                       // $25E6D4 swap  -> D1 = $1C00_3800
  lo = u16(lo + DRAW_25E6CE.addHigh);                        // $25E6D6 addi.w #$C800 -> EXACT $0000
  lo = u16(lo + f);                                          // $25E6DA add.w ($3E,A6),D1 -> f
  [hi, lo] = [lo, hi];                                       // $25E6DE swap  -> D1 = f_1C00
  lo = u16(lo + DRAW_25E6CE.addLow);                         // $25E6E0 addi.w #$E400 -> EXACT $0000

  enqueueRegistersThroughStub(ram, rom, DRAW_25E6CE.stub, ((hi << 16) | lo) >>> 0,
    DRAW_25E6CE.art, DRAW_25E6CE.attr, DRAW_25E6CE.pal[0]);  // $25E6F2 jsr $23DFB4 -- EMIT 1

  // $25E6F8 move.l #$0019C068,D2 -- the redundant reload, transcribed as its own read of the
  // constant rather than "whatever D2 still holds".
  const art2 = DRAW_25E6CE.art;
  [hi, lo] = [lo, hi];                                       // $25E6FE swap  -> D1 = $0000_f
  lo = u16(lo - f);                                          // $25E700 sub.w ($3E,A6),D1 -> $0000
  lo = u16(lo - f);                                          // $25E704 sub.w ($3E,A6),D1 -> -f
  [hi, lo] = [lo, hi];                                       // $25E708 swap  -> D1 = (-f)_$0000
  const pal2 = (DRAW_25E6CE.pal[0] | DRAW_25E6CE.flipOr) & 0xffff;   // $25E70A ori.w #$6000,D4
  enqueueRegistersThroughStub(ram, rom, DRAW_25E6CE.stub, ((hi << 16) | lo) >>> 0,
    art2, DRAW_25E6CE.attr, pal2);                           // $25E70E jmp $23DFB4 -- EMIT 2, TAIL
}

export const DRAW_25EF30 = Object.freeze({
  addr: 0x25ef30, end: 0x25f013, stub: 0x23dfb4,
  bodyA: 0x25ef40, gateA: 0x25ef46,          // the bsr TARGET is the gate, not the body head
  bodyB: 0x25efa8, gateB: 0x25efae,
  other: 0x70,                               // +/- SCREEN17.recStride; the sign comes from D7
  loopCounter: 0x813098,                     // absolute WORD -- both halves draw on loop 0 only
  off36: 0x36, off38: 0x38,
  // Resolved D1 immediates, after every cancelling `addi.w`. Every LOW word is exactly $0000 on the
  // first emit of each half, exactly as in $25E6CE.
  a1: Object.freeze({ base: 0x4500, art: 0x001a0630, attr: 0x16e0, pal: 0x0016, op: 'addHigh36' }),
  a2: Object.freeze({ high: 0x35c0, base: 0x2800, art: 0x001a0fd4, attr: 0x0a40, pal: 0x0016,
    op: 'addLow38' }),
  b1: Object.freeze({ base: 0xff40, art: 0x001a0630, attr: 0x16e0, pal: 0x0076, op: 'subHigh36' }),
  b2: Object.freeze({ high: 0x2600, base: 0x0000, art: 0x001a1118, attr: 0x0a40, pal: 0x0016,
    op: 'subLow38' }),
  oriB1: 0x0060,                             // $25EFDC ori.w #$0060,D4 -- THIS EMIT ONLY
});

/** `$25EF30` -- TWO MUTUALLY RECURSIVE HALVES, `$25EF30..$25F013`, 228 bytes.
 *
 *  This is NOT a body plus a subroutine. It is two PEER bodies that call each other, and the only
 *  thing that stops the recursion is WHERE the `bsr`s land.
 *
 *  **BOTH `bsr` TARGETS ARE THE GATE ENTRIES, PAST THE `tst.b (A1)`.** `$25EF44 bsr $25EFAE` skips
 *  body B's own `tst.b (A1) / bne`, and `$25EFAC bsr $25EF46` skips body A's. Neither half re-tests
 *  the other record, so the mutual call is one level deep by construction and not by luck. Modelled
 *  below as two functions whose entry point IS the gate, with the `tst.b` living in the caller half.
 *  Point either `bsr` at the body head instead and it either spins forever or drops a sprite pair.
 *
 *  **A1 IS THE *OTHER* RECORD.** `$25EF30 lea (-$70,A6),A1` is the DEFAULT and `$25EF38 lea
 *  ($70,A6),A1` is the D7-driven override, and D7 then picks the body as well: D7 != 0 takes body A
 *  with `A1 = A6 + $70`, D7 == 0 takes body B with `A1 = A6 - $70`. Since D7 != 0 is record 0, both
 *  halves are always looking at the record they are not drawing for. `(A1)` is a BYTE -- the other
 *  record's active flag.
 *
 *  **BEHAVIOUR: if the other record is EMPTY, BOTH halves draw, and the other half runs FIRST**,
 *  because the `bsr` precedes the fall-through into the caller's own gate.
 *
 *  `tst.w $813098` is the loop counter, so this pair draws on the FIRST LOOP ONLY -- and it is
 *  tested INSIDE each half, which is why a non-zero counter silences both even when the `bsr` fired.
 *
 *  **NOTHING IS INHERITED BETWEEN EMITS.** D1..D4 are rebuilt from immediates every single time.
 *  That is the opposite of `$25E220`, whose fourth sprite inherits D1's high word from the third,
 *  and it is why `$25EFDC ori.w #$0060,D4` does NOT survive into emit B2: `$25F006 move.w #$0016,D4`
 *  is a full-word write that overwrites the `$76` outright.
 *
 *  Same cancelling-immediate idiom as `$25E6CE` (see there): `$5B00 + $EA00 -> $4500` then
 *  `$1C00 + $E400 -> $0000`, and `$1540 + $EA00 -> $FF40` then `$1C00 + $E400 -> $0000`. The first
 *  emit of each half therefore has a HARD ZERO low word.
 *
 *  Reads only: `($36,A6)` word, `($38,A6)` word, `(A1)` byte, `$813098` word.
 *  **THE ROUTINE WRITES NOTHING TO RAM ITSELF.** Inherited: A6 and D7. A0/A4 untouched.
 */
function emitHalfA_25EF46(ram, rom, a6) {
  if (ram.u16(DRAW_25EF30.loopCounter) !== 0) return;        // $25EF46 tst.w $813098 / bne $25EFA6
  const m36 = ram.u16(a6 + DRAW_25EF30.off36);
  const m38 = ram.u16(a6 + DRAW_25EF30.off38);

  // $25EF50..$25EF64: $5B00 -> +$EA00 = $4500, +m36; low $1C00 -> +$E400 = $0000.
  const d1a1 = ((u16(DRAW_25EF30.a1.base + m36) << 16) | 0x0000) >>> 0;
  enqueueRegistersThroughStub(ram, rom, DRAW_25EF30.stub, d1a1,
    DRAW_25EF30.a1.art, DRAW_25EF30.a1.attr, DRAW_25EF30.a1.pal);    // $25EF74 jsr -- EMIT A1

  // $25EF7A..$25EF8E: high $3FC0 -> +$F600 = $35C0; low $3000 -> +$F800 = $2800, +m38.
  const d1a2 = ((DRAW_25EF30.a2.high << 16) | u16(DRAW_25EF30.a2.base + m38)) >>> 0;
  enqueueRegistersThroughStub(ram, rom, DRAW_25EF30.stub, d1a2,
    DRAW_25EF30.a2.art, DRAW_25EF30.a2.attr, DRAW_25EF30.a2.pal);    // $25EF9E jmp -- EMIT A2, TAIL
  // $25EFA4 nop / $25EFA6 rts
}

function emitHalfB_25EFAE(ram, rom, a6) {
  if (ram.u16(DRAW_25EF30.loopCounter) !== 0) return;        // $25EFAE tst.w $813098 / bne $25F012
  const m36 = ram.u16(a6 + DRAW_25EF30.off36);
  const m38 = ram.u16(a6 + DRAW_25EF30.off38);

  // $25EFB8..$25EFCC: $1540, SUB m36 ($25EFC0 -- body A ADDs), then +$EA00 = $FF40 - m36;
  // low $1C00 -> +$E400 = $0000.
  const d1b1 = ((u16(DRAW_25EF30.b1.base - m36) << 16) | 0x0000) >>> 0;
  // $25EFDC ori.w #$0060,D4 -> $0076. It applies to THIS EMIT ONLY.
  const palB1 = (DRAW_25EF30.a1.pal | DRAW_25EF30.oriB1) & 0xffff;
  enqueueRegistersThroughStub(ram, rom, DRAW_25EF30.stub, d1b1,
    DRAW_25EF30.b1.art, DRAW_25EF30.b1.attr, palB1);                 // $25EFE0 jsr -- EMIT B1

  // $25EFE6..$25EFFA: high $3000 -> +$F600 = $2600; low $0800 -> +$F800 = $0000, SUB m38.
  const d1b2 = ((DRAW_25EF30.b2.high << 16) | u16(DRAW_25EF30.b2.base - m38)) >>> 0;
  // $25F006 move.w #$0016,D4 -- a FULL WORD write, so B1's ori is gone. Not `palB1 & ~$60`.
  enqueueRegistersThroughStub(ram, rom, DRAW_25EF30.stub, d1b2,
    DRAW_25EF30.b2.art, DRAW_25EF30.b2.attr, DRAW_25EF30.b2.pal);    // $25F00A jmp -- EMIT B2, TAIL
  // $25F010 nop / $25F012 rts
}

export function draw25EF30(ram, rom, ctx, a6, d7) {
  // $25EF34 / $25EF3C are `tst.w D7`, a WORD test, so mask before testing -- the same reason
  // `sideFromD7_25D4E4` does. A caller that hands over a wider value must not read as non-zero here.
  const side = u16(d7);
  // $25EF30 lea (-$70,A6),A1 is the DEFAULT; $25EF38 lea ($70,A6),A1 is D7's override.
  const a1 = side !== 0 ? a6 + DRAW_25EF30.other : a6 - DRAW_25EF30.other;

  if (side !== 0) {                                          // $25EF3C tst.w D7 / beq $25EFA8
    // BODY A. $25EF40 tst.b (A1) / bne $25EF46 -- the other record EMPTY runs body B FIRST.
    if (ram.u8(a1) === 0) emitHalfB_25EFAE(ram, rom, a6);     // $25EF44 bsr $25EFAE, past B's tst.b
    emitHalfA_25EF46(ram, rom, a6);                           // fall through into A's own gate
    return;
  }
  // BODY B. $25EFA8 tst.b (A1) / bne $25EFAE.
  if (ram.u8(a1) === 0) emitHalfA_25EF46(ram, rom, a6);       // $25EFAC bsr $25EF46, BACKWARD
  emitHalfB_25EFAE(ram, rom, a6);
}

export const DRAW_25EDF8 = Object.freeze({
  addr: 0x25edf8, exit: 0x25ef2e, stub: 0x23dfb4,
  // THE STATE GATE, called "THE DEAD GATE" by W373 and NOT dead -- W374 withdrew that; see the doc
  // comment. $25EE28 cmpi.b #$4,($1,A6) -- immediate word $0004 BEFORE displacement $0001.
  gateAt: 0x01, gateValue: 0x04,
  cursorAt: 0x04, movedAt: 0x28, timerAt: 0x2a, animAt: 0x2c, phaseAt: 0x5c,
  timerReload: 0xb4,                         // $25EE3C / $25EE60 move.w #$B4,($2A,A6)
  timerPeriod: 0xb5,                         // $B4 + 1 -- see the `bcc` note in the doc comment
  phaseStep: 0x04, phaseWrap: 0x0c,          // $25EE66 addq.w #$4 / $25EE6A cmpi.w #$C
  cursorMax: 0x02,                           // $25D402 cmpi.w #$2,D1 / ble -- the cursor is 0..2
  frameCounter: RAM.frameCounter,            // $80390A, the MAIN-LOOP counter
  mirror2: SCHED.mirror2,                    // $80390C -- gates emit 2 entirely
  frameMask: 0x0e,                           // $25EEB2 / $25EF12 moveq #$E,D2 -> EIGHT frames
  frameEntries: 8,
  coordBias: 0xe600,                         // $25EEE6 / $25EEEE addi.w #$E600, i.e. -$1A00
  attrEmit2: 0x1ad0,                         // $25EEFE move.w #$1AD0,D3
  pal: 0x0012,                               // $25EED2 / $25EF02 / $25EF20 move.w #$12,D4 -- ALL THREE
  // The in-routine jump table at $25EE86: DATA inside the routine, three bra.w, 12 bytes. It is
  // indexed by BYTES, because ($5C,A6) is 0, 4 or 8 and each bra.w is 4 bytes wide.
  jumpTable: 0x25ee86,
  arms: Object.freeze([0x25ee86, 0x25ee8a, 0x25ee8e]),
  armTargets: Object.freeze([0x25ee92, 0x25eea2, 0x25eec4]),
  // The four lea'd tables, INDEXED BY `sideFromD7_25D4E4`. Entry 0 is the OVERRIDE set that D7 != 0
  // takes ($25EE0C..$25EE18); entry 1 is the FALL-THROUGH set that D7 == 0 keeps ($25EDF8..$25EE04).
  // Every displacement below was re-resolved from the extension word's own address.
  tables: Object.freeze([
    Object.freeze({ a0: 0x25edf0, a1: 0x25edd8, a2: 0x25ecd8, a3: 0x25eb64 }),   // side 0, D7 != 0
    Object.freeze({ a0: 0x25edf4, a1: 0x25ede4, a2: 0x25ece4, a3: 0x25eb94 }),   // side 1, D7 == 0
  ]),
  // The 660-byte data block $25EB64..$25EDF7, bounded below by the `rts` at $25EB62 and above by
  // this routine's first opcode. It TILES EXACTLY -- no gaps, no overlaps.
  dataFrom: 0x25eb64, dataTo: 0x25edf7,
});

/** `$25EDF8` -- the third of the four ungated draws, `$25EDF8..$25EF2F`, and **AS SHIPPED IT IS AN
 *  IMMEDIATE `rts`.**
 *
 *  **THE BODY IS LIVE. A W374 CLAIM THAT IT IS UNREACHABLE WAS WITHDRAWN -- read this before
 *  trusting any "dead" claim on this screen.** `$25EE28 cmpi.b #$4,($1,A6) / bne $25EF2E` gates
 *  everything below it on record state 4, and it DOES fire.
 *
 *  The withdrawn reasoning was: both callers write `($1,A6)` a few instructions earlier
 *  (`$25D24E move.b #$2` before `$25D27E jsr`, `$25D49A move.b #$5` before `$25D4CE jsr`), and a
 *  6 MB scan for the longword `$0025EDF8` finds exactly those two `jsr` operands and no third
 *  entry. All of that is TRUE and it is not enough.
 *
 *  **What it missed is that those two writes are CONDITIONAL and the draws are not.**
 *  `$25D244 beq.w $25D254` jumps PAST the state write and lands on the first instruction of the
 *  draw block, so on any frame the player does not confirm, `($1,A6)` is still **4** when this runs
 *  from `$25D4CE`. `confirmAndDraw` modelled that branch as an early `return`, which hid it. Trap
 *  10 in one line: the state byte advances mid-frame, and a compare downstream sees whichever value
 *  it actually has.
 *
 *  Nobody knows why. The gate is ported faithfully and the full body is ported anyway, and the dead
 *  gate is pinned by a test, so that a later change which makes the body live is a deliberate,
 *  visible act rather than an accident. Do not "fix" it and do not force state 4.
 *
 *  **THE SIDE SELECT READS BACKWARDS UNTIL YOU CHECK THE MAPPING.** `$25EE0A beq.s $25EE1C` is taken
 *  when `D7 == 0`, and it SKIPS the second block -- so `D7 == 0` KEEPS the fall-through set
 *  `$25EDF4/$25EDE4/$25ECE4/$25EB94`. `sideFromD7_25D4E4` INVERTS D7, so that fall-through set is
 *  SIDE 1 and the override set `$25EDF0/$25EDD8/$25ECD8/$25EB64` is SIDE 0.
 *
 *  **`($2A,A6)`'s PERIOD IS 181 DECREMENTS, NOT 180.** `$25EE5A subq.w #$1,($2A,A6)` then `$25EE5E
 *  bcc.s` reloads on the BORROW, so the reload fires on the transition OUT of 0 -- after `$B4 + 1`
 *  decrements. Reading it as a plain "reload at zero" is a one-frame animation drift that no static
 *  check can see.
 *
 *  **A2 IS DEREFERENCED BEFORE THE GATE.** `$25EE24 movea.l (0,A2,D0.w),A2` turns the lea'd pointer
 *  table into a record list, so A2 is a LONG POINTER by the time the tail's loop reads it, not art.
 *
 *  **THE JUMP AT `$25EE82` IS A BYTE-INDEXED TABLE.** `lea ($25EE86,PC),A4 / adda.w D1,A4 /
 *  jmp (A4)` with `D1 = ($5C,A6)` in {0, 4, 8} lands on one of three `bra.w` sitting INSIDE the
 *  routine. Arms 0 and 2 are byte-identical apart from arm 0's `bra.s`; arm 1 is the ONLY one whose
 *  art comes from a FRAME TABLE, and the only one that touches A0 (which it saves and restores).
 *
 *  **`$80390C` GATES EMIT 2 ENTIRELY.** Inside it, `move.w (A0)+,D1` then `move.w (A0),D1` -- `(A0)+`
 *  THEN `(A0)`, exactly two words, which is what bounds the A0 coordinate table at two.
 *
 *  **THE RECORD LOOP IS AWKWARD AND IS TRANSCRIBED AS-IS.** It is ENTERED at `$25EF0C`, one
 *  instruction ABOVE the loop top at `$25EF0E`; the top re-reads D3 and A0 but NOT D1; and the
 *  terminator is a ZERO LONGWORD consumed as D1 by `$25EF2A`. A rewritten `while` that reads all
 *  three fields at the top either emits the terminator as a sprite or drops the first record.
 *
 *  D4 is `$12` at all three emit sites. Inherited: A6 and D7. A4 is clobbered by the computed jump,
 *  but the caller saves it (`$25D4A4` / `$25D4E0`), so the save is not modelled. A5, D5, D6 unused.
 */
export function draw25EDF8(ram, rom, ctx, a6, d7) {
  // $25EE08 tst.w D7 -- a WORD test, so mask, exactly as `sideFromD7_25D4E4` and `draw25EF30` do.
  // $25EDF8..$25EE06 lea the fall-through set; $25EE0C..$25EE18 overrides it when D7 != 0.
  const side = sideFromD7_25D4E4(d7);                        // D7 != 0 -> 0, D7 == 0 -> 1. INVERTS.
  const t = DRAW_25EDF8.tables[side];
  let a0 = t.a0;                     // the TWO-WORD coordinate pair, emit 2 only
  const a1 = t.a1;                   // the emit-2 art table, three longs, by cursor
  let a2 = t.a2;                     // a pointer table, three longs, by cursor
  let a3 = t.a3;                     // the outer art table, three longs, by PHASE

  // $25EE1C move.w ($4,A6),D0 / $25EE20 add.w D0,D0 / $25EE22 add.w D0,D0 -- cursor * 4. The cursor
  // is bounded 0..2 by $25D402, so D0.w's sign extension in the indexed modes never bites.
  let d0 = u16(u16(ram.u16(a6 + DRAW_25EDF8.cursorAt) * 2) * 2);
  a2 = rom.u32(a2 + d0);                                     // $25EE24 movea.l (0,A2,D0.w),A2

  // THE STATE GATE, AND IT IS LIVE. $25EE28 cmpi.b #$4,($1,A6) / $25EE2E bne.w $25EF2E -- straight
  // to the rts. W373 called this "THE DEAD GATE"; W374 withdrew that, because `confirmAndDraw`'s
  // no-confirm path leaves ($1,A6) at 4 when the draws run. Read the doc comment before trusting
  // any "dead" label on this screen.
  if (ram.u8(a6 + DRAW_25EDF8.gateAt) !== DRAW_25EDF8.gateValue) return;

  if (ram.u16(a6 + DRAW_25EDF8.movedAt) !== 0) {             // $25EE32 tst.w / $25EE36 beq.s $25EE48
    ram.setU16(a6 + DRAW_25EDF8.movedAt, 0);                 // $25EE38 clr.w ($28,A6) -- CONSUMED
    ram.setU16(a6 + DRAW_25EDF8.timerAt, DRAW_25EDF8.timerReload);   // $25EE3C move.w #$B4,($2A,A6)
    ram.setU16(a6 + DRAW_25EDF8.phaseAt, DRAW_25EDF8.phaseStep);     // $25EE42 move.w #$4,($5C,A6)
  }

  // $25EE48..$25EE4E recomputes cursor * 4. REDUNDANT here -- nothing has touched D0 since $25EE22
  // -- and kept anyway, because "redundant" is a claim about the two instructions in between.
  d0 = u16(u16(ram.u16(a6 + DRAW_25EDF8.cursorAt) * 2) * 2);
  let d1 = 0;                                                // $25EE50 move.w #$0,D1
  let arm = 0;                                               // the beq at $25EE58 lands on arm 0
  if (ram.u16(a6 + DRAW_25EDF8.animAt) !== 0) {              // $25EE54 tst.w / $25EE58 beq.s $25EE92
    // $25EE5A subq.w #$1,($2A,A6) / $25EE5E bcc.s $25EE76 -- BRANCH ON NO BORROW, so the reload
    // runs only on the 0 -> $FFFF transition. PERIOD $B4 + 1 = 181 DECREMENTS, not 180.
    const was = ram.u16(a6 + DRAW_25EDF8.timerAt);
    ram.setU16(a6 + DRAW_25EDF8.timerAt, u16(was - 1));
    if (was === 0) {                                         // the borrow
      ram.setU16(a6 + DRAW_25EDF8.timerAt, DRAW_25EDF8.timerReload);          // $25EE60
      ram.setU16(a6 + DRAW_25EDF8.phaseAt,                                    // $25EE66 addq.w #$4
        u16(ram.u16(a6 + DRAW_25EDF8.phaseAt) + DRAW_25EDF8.phaseStep));
      // $25EE6A cmpi.w #$C,($5C,A6) / $25EE70 bne.s $25EE76 / $25EE72 clr.w -- 0 -> 4 -> 8 -> 0.
      if (ram.u16(a6 + DRAW_25EDF8.phaseAt) === DRAW_25EDF8.phaseWrap) {
        ram.setU16(a6 + DRAW_25EDF8.phaseAt, 0);
      }
    }
    d1 = ram.u16(a6 + DRAW_25EDF8.phaseAt);                  // $25EE76 move.w ($5C,A6),D1
    // $25EE7A lea ($25EE86,PC),A4 / $25EE7E nop / $25EE80 adda.w D1,A4 / $25EE82 jmp (A4). The
    // landing site is a BYTE offset into the three-entry bra.w table, NOT an entry index.
    const landing = DRAW_25EDF8.jumpTable + d1;
    arm = DRAW_25EDF8.arms.indexOf(landing);
    if (arm < 0) {
      ctx.unported?.note(landing, `$${landing.toString(16).toUpperCase()} -- $25EE82 jmp (A4) with `
        + `($5C,A6) = $${d1.toString(16).toUpperCase()}, which is not one of the three bra.w at `
        + `$25EE86/$25EE8A/$25EE8E. The cartridge only ever produces 0, 4 or 8`);
      return;
    }
  }
  // $25EE84 nop -- padding between `jmp (A4)` and the table, unreachable.

  // Arms 0 ($25EE92) and 2 ($25EEC4) are byte-identical apart from arm 0's `bra.s $25EED2`; arm 2
  // falls through into the tail. Both dereference A3 twice: outer by PHASE, inner by CURSOR * 4.
  a3 = rom.u32(a3 + d1);                                     // $25EE92/$25EEA2/$25EEC4 (0,A3,D1.w)
  a3 = rom.u32(a3 + d0);                                     // $25EE96/$25EEA6/$25EEC8 (0,A3,D0.w)
  const d1emit = rom.u32(a3);                                // move.l (A3)+,D1 -- packed coords
  const d3 = rom.u16(a3 + 4);                                // move.w (A3)+,D3 -- attr
  let d2;
  if (arm === 1) {
    // $25EEAA move.l A0,-(SP) ... $25EEC0 movea.l (SP)+,A0. A0 is BORROWED for the frame table and
    // handed back, which is why emit 2 below still sees the lea'd coordinate pair.
    const savedA0 = a0;
    a0 = rom.u32(a3 + 6);                                    // $25EEB0 movea.l (A3)+,A0 -- FRAMES
    d2 = rom.u32(a0 + frameIndex25EEB2(ram));                // $25EEB2..$25EEBC
    a0 = savedA0;                                            // $25EEC0
  } else {
    d2 = rom.u32(a3 + 6);                                    // $25EE9E / $25EED0 move.l (A3)+,D2
  }

  // $25EED2 move.w #$12,D4 / $25EED6 jsr $23DFB4 -- EMIT 1.
  enqueueRegistersThroughStub(ram, rom, DRAW_25EDF8.stub, d1emit, d2, d3, DRAW_25EDF8.pal);

  if (ram.u16(DRAW_25EDF8.mirror2) !== 0) {                  // $25EEDC tst.w / $25EEE2 beq.s $25EF0C
    // $25EEE4 move.w (A0)+,D1 / $25EEE6 addi.w #$E600 / $25EEEA swap D1 / $25EEEC move.w (A0),D1 --
    // `(A0)+` THEN `(A0)`, so exactly TWO words are ever read and the coordinate table is two long.
    const hi = u16(rom.u16(a0) + DRAW_25EDF8.coordBias);
    a0 += 2;                                                 // the ONLY post-increment here
    const lo = u16(rom.u16(a0) + DRAW_25EDF8.coordBias);     // $25EEEC (A0), NOT (A0)+ / $25EEEE
    // $25EEF2..$25EEF8 recomputes cursor * 4. NOT redundant: $23DFB4 clobbers D0.
    d0 = u16(u16(ram.u16(a6 + DRAW_25EDF8.cursorAt) * 2) * 2);
    const art2 = rom.u32(a1 + d0);                           // $25EEFA move.l (0,A1,D0.w),D2
    enqueueRegistersThroughStub(ram, rom, DRAW_25EDF8.stub, ((hi << 16) | lo) >>> 0,
      art2, DRAW_25EDF8.attrEmit2, DRAW_25EDF8.pal);         // $25EF06 jsr $23DFB4 -- EMIT 2
  }

  // THE RECORD LOOP. $25EF0C is the ENTRY -- one instruction ABOVE the loop top at $25EF0E -- so D1
  // is read once here and then again at the BOTTOM, while D3 and A0 are re-read every pass. The
  // terminator is the ZERO LONGWORD that $25EF2A consumes as D1, and it is never emitted.
  let rd1 = rom.u32(a2);                                     // $25EF0C move.l (A2)+,D1
  a2 += 4;
  for (;;) {                                                 // $25EF0E -- THE LOOP TOP
    const rd3 = rom.u16(a2);                                 // $25EF0E move.w (A2)+,D3
    a2 += 2;
    const ra0 = rom.u32(a2);                                 // $25EF10 movea.l (A2)+,A0 -- FRAMES
    a2 += 4;
    const rd2 = rom.u32(ra0 + frameIndex25EEB2(ram));        // $25EF12..$25EF1C
    // $25EF20 move.w #$12,D4 / $25EF24 jsr $23DFB4 -- EMIT 3..N.
    enqueueRegistersThroughStub(ram, rom, DRAW_25EDF8.stub, rd1, rd2, rd3, DRAW_25EDF8.pal);
    rd1 = rom.u32(a2);                                       // $25EF2A move.l (A2)+,D1
    a2 += 4;
    if (rd1 === 0) break;                                    // $25EF2C bne.s $25EF0E
  }
  // $25EF2E rts
}

/** `$25EEB2 moveq #$E,D2 / and.w $80390A,D2 / add.w D2,D2` -- and the same three at `$25EF12`.
 *  The mask is `$E` and the doubling makes byte offsets 0, 4, ..., 28, so a frame table is EIGHT
 *  entries and the index is `(counter & $E) * 2`. The `and.w` writes only D2's low word, and the
 *  moveq zeroed the high word first, so no inherited garbage survives into the index. */
function frameIndex25EEB2(ram) {
  return u16(u16(DRAW_25EDF8.frameMask & ram.u16(DRAW_25EDF8.frameCounter)) * 2);
}

export const DRAW_25F074 = Object.freeze({
  addr: 0x25f074, rts: 0x25f1ba, bytes: 327,
  stub: 0x23dfb4,                            // emits 1..5, the plain register enqueue
  zoomStub: 0x23e2f2,                        // emits 6..8, the ZOOMING register family, bucket 0
  // $25F086 cmpi.b #$7,($1,A6) / bcs -- an UNSIGNED <, so states 0..6 run everything and 7..$FF
  // take `adda.l #$18,A0 / bra.w $25F128`. BOTH ARMS ARE LIVE; see the doc comment.
  stateAt: 0x01, stateLimit: 0x07, sliceSkip: 0x18,
  // THE EMIT-1 ART SWAP. $25F0A8 cmpi.b #$4,($1,A6) -- immediate word $0004 BEFORE displacement
  // $0001. W373 named it "THE DEAD GATE" and W374 withdrew that; `deadGateValue` and `artEmit1Dead`
  // are FOSSIL NAMES kept because the tests pin them, not a live claim. $0019A410 IS drawn.
  deadGateValue: 0x04, artEmit1: 0x0019a35c, artEmit1Dead: 0x0019a410,
  // Off A6. $2E is read as a WORD here; see the doc comment before "correcting" it.
  animAt: 0x2c, nibblesAt: 0x2e, shortAt: 0x38, cursorAt: 0x66,
  gateEmit1: SCHED.mirror2,                  // $80390C -- gates EMIT 1 ONLY
  loopCounter: DRAW_25EF30.loopCounter,      // $813098 -- the same word $25EF30 tests
  // $25F0CC lea ($25F1BC,PC),A1 / adda.w ($66,A6),A1. TWELVE longs, four frames at stride $E4,
  // each held for three ticks. The bound is stated by the wrap, not measured.
  ramp: 0x25f1bc, rampStep: 0x04, rampWrap: 0x30, rampEntries: 12, rampStride: 0xe4,
  emit7Back: 0x03c0,                         // $25F174 subi.w -- $3C0 / 64 = 15 px
  zoomFlags: 0x80005000,                     // D6, loaded from scratch at all THREE zoom sites
  attr: Object.freeze({ e1: 0x0458, e2: 0x0e20, e3: 0x0630, e5: 0x0218, e6: 0x0818, e8: 0x0610 }),
  pal: 0x0012,                               // D4 at emits 1, 3, 4, 5, 6, 7 and 8
  palEmit2: 0x0017, palEmit2Ori: 0x0060,     // $25F0DC then $25F0F8 -> $0077, side 1 only
  // Table offsets AS THE CODE READS THEM. This is NOT a uniform {D1, art} array: pairing only
  // begins at +$08, which is why +$04 = $4F013000 is a COORDINATE and not an art pointer.
  off: Object.freeze({ d1e1: 0x00, d1e2: 0x04, d1e3: 0x08, d2e3: 0x0c, d1e4: 0x10, d2e4: 0x14,
    d1e5: 0x18, d2e5: 0x1c, d1e67: 0x20, d2e67: 0x24, d1e8: 0x28, d2e8: 0x2c }),
  tableBytes: 0x30,
  // INDEXED BY `sideFromD7_25D4E4`. Entry 0 is D7 != 0, which the `bne` at $25F07E KEEPS on the
  // $25F074 lea with D5 un-negated; entry 1 is D7 == 0, which falls into $25F080 and `neg.w D5`.
  sides: Object.freeze([
    Object.freeze({ table: 0x25f014, negate: false }),
    Object.freeze({ table: 0x25f044, negate: true }),
  ]),
  // The three ($2E,A6) nibbles, in the order the code reads them.
  nib6: Object.freeze({ mask: 0x00f0, shift: 4, mul: 0x0064, at: 0x25f14c }),
  nib7: Object.freeze({ mask: 0x0f00, shift: 8, mul: 0x0064, at: 0x25f178 }),
  nib8: Object.freeze({ mask: 0x000f, shift: 0, mul: 0x0034, at: 0x25f19a }),
});

/** `move.w ($2E,A6),D0 / andi.w #<mask>,D0 / lsr.w #<n>,D0 / muls.w #<mul>,D0` at `$25F14C` and
 *  `$25F178`, and the `moveq #$F,D0 / and.w ($2E,A6),D0 / muls.w #$34,D0` form at `$25F19A`, which
 *  is the same nibble with mask `$F` and no shift.
 *
 *  **`($2E,A6)` IS A WORD HERE**, spanning `$2E` and `$2F`, while `SCREEN9.tailFlag` and
 *  `HANDLER4.clearOnConfirm` read `$2E` as a BYTE. Both readings are the cartridge's own. Neither
 *  is a mistake and neither should be unified with the other.
 *
 *  The nibble is 0..$F, so `muls.w`'s signedness never bites and the product is 0..1500.
 *  **NOTHING IN THIS ROUTINE MASKS OR CLAMPS IT**, so $A..$F would index past the intended frames.
 *  No bound is stated anywhere and the writer of `($2E,A6)` was not found, so no clamp is invented;
 *  the out-of-range case is NOTED instead, and only when it actually happens. */
function nibbleOffset25F074(ram, ctx, a6, spec) {
  const w = ram.u16(a6 + DRAW_25F074.nibblesAt);
  const n = (w & spec.mask) >>> spec.shift;
  if (n > 0x09) {
    ctx?.unported?.note(spec.at, `$${spec.at.toString(16).toUpperCase()} -- ($2E,A6) = $${
      w.toString(16).toUpperCase()} puts nibble $${n.toString(16).toUpperCase()} through `
      + `muls.w #$${spec.mul.toString(16).toUpperCase()}. Nothing in $25F074 clamps it and no `
      + `writer of ($2E,A6) was found, so the art frame this selects is not measured`);
  }
  return n * spec.mul;
}

/** `$25F074` -- the LAST of the eight shared select-screen draws by size, `$25F074..$25F1BA`,
 *  **327 bytes and EIGHT emits**: five through `$23DFB4` and three through `$23E2F2`.
 *
 *  **A0 AND D5 ARE INHERITED ACROSS ALL EIGHT CALLS.** A0 is the table pointer and D5 the short-axis
 *  offset, and neither stub touches them: `$23DFB4` pushes and restores A0/D0, `$23E2F2` `movem`s
 *  D4/D7/A0. D1/D3/D4 carry from emit 3 into emit 4 and from emit 6 into emit 7 the same way.
 *
 *  **THERE ARE NO CANCELLING `addi.w`/`swap` CHAINS HERE AT ALL** -- unlike every sibling in this
 *  file. D1 comes out of the tables verbatim and the only arithmetic is `add.w D5,D1`,
 *  `subi.w #$3C0,D1` and `add.l D0,D2`. There is nothing to unwind.
 *
 *  **THE SIDE SENSE IS INVERTED RELATIVE TO ITS SIBLINGS AND THE SEMANTICS ARE IDENTICAL.**
 *  `$25F07E` is a `bne` where `$25EDF8` and `$25E824` use `beq`, and `sideFromD7_25D4E4` inverts as
 *  well, so the two inversions cancel: D7 != 0 is SIDE 0 and keeps the `$25F014` lea and an
 *  un-negated D5; D7 == 0 is SIDE 1, takes `$25F044`, `neg.w D5` and emit 2's `ori.w #$0060`.
 *  Swap the two tables and the port is wrong on both screens at once.
 *
 *  **THE `cmpi.b #$7` IS A TABLE SLICE, NOT AN EXIT.** States 0..6 run all eight emits; states
 *  7..$FF do `adda.l #$18,A0 / bra.w $25F128` and land with EXACTLY the A0 the full path reaches
 *  via `lea ($10,A0),A0`, then emit 5..8. A full-image scan for the longword `$0025F074` finds
 *  exactly three operands, all `jsr`: `$25D28C` (state 1's confirm tail, `($1,A6)` = 2),
 *  `$25D4DC` (state 4's, = 5) and `$25D836` (`$25D560`'s tail, = 7 or 8). **Both arms are reachable
 *  as shipped**, and W373's follow-on -- "only the full path has a host in the port today, because
 *  `$25D560` is not ported" -- **NO LONGER HOLDS**. W374 ported `$25D560` as `phase7_25D560`
 *  (`objslot17.js`); `$25D836` is `TAIL_25D560[6]`; `main.js` registers slot [17]. **BOTH ARMS HAVE
 *  A LIVE HOST**, the slice arm through state 7/8 and the full path through this file's two tails.
 *
 *  **BOTH ART ARMS ARE LIVE. A W374 "DEAD GATE" CLAIM HERE WAS WITHDRAWN**, for the same reason as
 *  `$25EDF8`'s: `($1,A6)` at entry is NOT only ever 2, 5, 7 or 8. `$25D490 beq.w $25D4A4` skips the
 *  `move.b #$5,($1,A6)` and lands in the draw block, so on a non-confirm frame the state is still
 *  **4** and `$25F0A8 cmpi.b #$4` fires. **`$0019A410` is reachable art, not unreachable.** Both
 *  arms are transcribed, which was right; only the claim about which one runs was wrong.
 *
 *  **THE TWO GATES INSIDE THE FULL PATH SKIP DIFFERENT AMOUNTS.** `$80390C` skips EMIT 1 only --
 *  both `move.l (A0)+,D1` sit OUTSIDE it, so A0 lands on +$08 either way. `($2C,A6)` skips EMIT 2
 *  *and* the `($66,A6)` advance, so a zero anim field freezes the ramp cursor as well.
 *
 *  **`$813098` IS THE ONLY EARLY EXIT** and it lands directly on the `rts`, after emits 1..4 have
 *  already been queued on the full path.
 *
 *  **A TOOL DEFECT, not a port one:** `aligned.py` groups `C1FC 0064 D480` at `$25F156` and
 *  `$25F1A0` as one six-byte instruction. It is `muls.w #$0064,D0` (4 bytes) plus `add.l D0,D2`
 *  (2). Same total length, so no address slips, but the listing is wrong -- the same class as the
 *  known `divs.w`/`adda.w` mis-sizings.
 *
 *  Reads: `($1,A6)` byte TWICE, `($2C,A6)`, `($2E,A6)` WORD three times, `($38,A6)`, `($66,A6)`,
 *  `$80390C`, `$813098`. **WRITES ONLY `($66,A6)`**, and only when `($2C,A6)` is non-zero.
 *  Inherited: A6 and D7. */
export function draw25F074(ram, rom, ctx, a6, d7) {
  const D = DRAW_25F074;
  // $25F07C tst.w D7 / $25F07E bne.s $25F086 -- a WORD test, so mask, exactly as `draw25EF30` does.
  // `sideFromD7_25D4E4` IS that masked test; it returns 0 for D7 != 0, which is the arm the `bne`
  // takes and therefore the arm that KEEPS the $25F074 lea.
  const side = sideFromD7_25D4E4(d7);
  const sel = D.sides[side];
  let a0 = sel.table;                                        // $25F074 or $25F080 lea (dN,PC),A0
  let d5 = ram.u16(a6 + D.shortAt);                          // $25F078 move.w ($38,A6),D5
  if (sel.negate) d5 = u16(-d5);                             // $25F084 neg.w D5 -- SIDE 1 ONLY

  // $25F086 cmpi.b #$7,($1,A6) / $25F08C bcs.s $25F098 -- UNSIGNED <, so this is `state < 7`.
  if (ram.u8(a6 + D.stateAt) < D.stateLimit) {
    // ---- EMIT 1. $25F098 move.l (A0)+,D1 -- table +$00, and it happens BEFORE the gate below.
    let d1 = rom.u32(a0);
    a0 += 4;
    // $25F09A tst.w $80390C / $25F0A0 beq.s $25F0C4 -- SKIPS EMIT 1 ONLY. Both `(A0)+` reads sit
    // outside it, which is why A0 reaches +$08 whether or not this fires.
    if (ram.u16(D.gateEmit1) !== 0) {
      let d2 = D.artEmit1;                                   // $25F0A2 move.l #$0019A35C,D2
      // THE ART SWAP, AND IT IS TAKEN. $25F0A8 cmpi.b #$4,($1,A6) / $25F0AE bne.s $25F0B6.
      // W373 wrote "Never taken as shipped: no caller can arrive in state 4. Transcribed, not
      // folded away." Transcribing it was right; the reason was wrong, and W374 withdrew it --
      // `confirmAndDraw`'s no-confirm path skips the `move.b #$5,($1,A6)` and reaches the draws
      // with ($1,A6) STILL 4, so this fires on every frame the player does not confirm.
      if (ram.u8(a6 + D.stateAt) === D.deadGateValue) {
        d2 = D.artEmit1Dead;                                 // $25F0B0 -- the state-4 art
      }
      // $25F0B6 move.w #$0458,D3 / $25F0BA move.w #$0012,D4 / $25F0BE jsr $23DFB4.
      enqueueRegistersThroughStub(ram, rom, D.stub, d1, d2, D.attr.e1, D.pal);
    }

    // ---- EMIT 2. $25F0C4 move.l (A0)+,D1 -- table +$04, again BEFORE the gate.
    d1 = rom.u32(a0);
    a0 += 4;
    // $25F0C6 tst.w ($2C,A6) / $25F0CA beq.s $25F102 -- skips the emit AND the cursor advance.
    if (ram.u16(a6 + D.animAt) !== 0) {
      // $25F0CC lea ($25F1BC,PC),A1 / $25F0D0 nop / $25F0D2 adda.w ($66,A6),A1 / $25F0D6 move.l
      // (A1),D2. ($66,A6) is a BYTE OFFSET into the twelve longs, not an entry index. The `nop` is
      // real cartridge padding between the lea and the adda; it does nothing and is named here
      // rather than silently dropped.
      const cur = ram.u16(a6 + D.cursorAt);
      const d2 = rom.u32(D.ramp + cur);
      let d4 = D.palEmit2;                                   // $25F0DC move.w #$0017,D4
      ram.setU16(a6 + D.cursorAt, u16(cur + D.rampStep));    // $25F0E0 addq.w #4 -- THE RAM WRITE
      // $25F0E4 cmpi.w #$30,($66,A6) / $25F0EA bne.w $25F0F4 -- re-READ, after the addq.
      if (ram.u16(a6 + D.cursorAt) === D.rampWrap) {
        ram.setU16(a6 + D.cursorAt, 0);                      // $25F0EE -- the wrap
      }
      // $25F0F4 tst.w D7 / $25F0F6 bne.s $25F0FC -- D7 == 0, i.e. SIDE 1, falls into the ori.
      if (side === 1) d4 = u16(d4 | D.palEmit2Ori);          // $25F0F8 ori.w #$0060,D4 -> $0077
      enqueueRegistersThroughStub(ram, rom, D.stub, d1, d2, D.attr.e2, d4);   // $25F0FC jsr
    }

    // ---- EMIT 3. $25F102 move.l (A0),D1 with NO post-increment, where both neighbours use
    // `(A0)+`. A0 stays at +$08 and the `lea ($10,A0),A0` below is what finally moves it.
    enqueueRegistersThroughStub(ram, rom, D.stub,
      rom.u32(a0 + 0), rom.u32(a0 + 4),                      // $25F102 / $25F104 ($4,A0)
      D.attr.e3, D.pal);                                     // $25F108 / $25F10C / $25F110 jsr

    // ---- EMIT 4. D3 AND D4 ARE INHERITED from emit 3: neither is rewritten between the two jsr.
    enqueueRegistersThroughStub(ram, rom, D.stub,
      rom.u32(a0 + 8), rom.u32(a0 + 12),                     // $25F116 ($8,A0) / $25F11A ($C,A0)
      D.attr.e3, D.pal);                                     // $25F11E jsr

    a0 += 0x10;                                              // $25F124 lea ($10,A0),A0 -> base+$18
  } else {
    // $25F08E adda.l #$18,A0 / $25F094 bra.w $25F128 -- the SLICE. Same landing A0 as above.
    a0 += D.sliceSkip;
  }

  // $25F128 tst.w $813098 / $25F12E bne.w $25F1BA -- THE ONLY EARLY EXIT, straight onto the rts,
  // and on the full path emits 1..4 have already been queued by the time it is tested.
  if (ram.u16(D.loopCounter) !== 0) return;

  // ---- EMIT 5. table +$18 and +$1C.
  let d1 = rom.u32(a0);
  a0 += 4;                                                   // $25F132 move.l (A0)+,D1
  d1 = withShort(d1, u16(d1 + d5));                          // $25F134 add.w D5,D1 -- SHORT axis
  let d2 = rom.u32(a0);
  a0 += 4;                                                   // $25F136 move.l (A0)+,D2
  enqueueRegistersThroughStub(ram, rom, D.stub, d1, d2, D.attr.e5, D.pal);   // $25F138..$25F140

  // ---- EMIT 6, the first zoom. table +$20 and +$24.
  d1 = rom.u32(a0);
  a0 += 4;                                                   // $25F146 move.l (A0)+,D1
  d1 = withShort(d1, u16(d1 + d5));                          // $25F148 add.w D5,D1
  const d2base67 = rom.u32(a0);
  a0 += 4;                                                   // $25F14A move.l (A0)+,D2
  d2 = (d2base67 + nibbleOffset25F074(ram, ctx, a6, D.nib6)) >>> 0;   // $25F14C..$25F15A add.l
  // $25F164 move.l #$80005000,D6 -- the high word $8000 is grow 1 / zoom 0, so the LONG-axis
  // adjustment is exactly 0 and only the short axis moves. Both heights here ($18 and $10) are
  // multiples of 8, so $23E2F2's `height & 7` throw is not reachable from this routine.
  enqueueZoomedRegistersThroughStub(ram, rom, D.zoomStub, d1, d2,
    D.attr.e6, D.pal, D.zoomFlags);                          // $25F16A jsr $23E2F2

  // ---- EMIT 7. D2 IS RE-READ FROM (-$4,A0), i.e. table +$24 AGAIN -- the same base emit 6 used,
  // with a DIFFERENT nibble. D1 is emit 6's, moved 15 px back along the short axis. D3 and D4 are
  // INHERITED from emit 6; only D6 is reloaded, from the identical literal.
  const d2base7 = rom.u32(a0 - 4);                           // $25F170 move.l (-$4,A0),D2
  d1 = withShort(d1, u16(d1 - D.emit7Back));                 // $25F174 subi.w #$03C0,D1
  d2 = (d2base7 + nibbleOffset25F074(ram, ctx, a6, D.nib7)) >>> 0;    // $25F178..$25F186
  enqueueZoomedRegistersThroughStub(ram, rom, D.zoomStub, d1, d2,
    D.attr.e6, D.pal, D.zoomFlags);                          // $25F188 / $25F18E jsr $23E2F2

  // ---- EMIT 8. table +$28 and +$2C, and the third nibble at a DIFFERENT stride ($34, not $64).
  d1 = rom.u32(a0);
  a0 += 4;                                                   // $25F194 move.l (A0)+,D1
  d1 = withShort(d1, u16(d1 + d5));                          // $25F196 add.w D5,D1
  d2 = rom.u32(a0);
  a0 += 4;                                                   // $25F198 move.l (A0)+,D2 -- A0 dies
  d2 = (d2 + nibbleOffset25F074(ram, ctx, a6, D.nib8)) >>> 0;         // $25F19A..$25F1A4
  enqueueZoomedRegistersThroughStub(ram, rom, D.zoomStub, d1, d2,
    D.attr.e8, D.pal, D.zoomFlags);                          // $25F1A6..$25F1B4 jsr $23E2F2
  void a0;                                                   // $25F1BA rts
}

/** Replace D1's LOW word and keep its high word. `add.w D5,D1` and `subi.w #$3C0,D1` are WORD ops:
 *  they touch the short axis only and never carry into the long one. */
function withShort(d1, lo) {
  return (((d1 & 0xffff0000) >>> 0) | u16(lo)) >>> 0;
}

export const DRAW_25E824 = Object.freeze({
  addr: 0x25e824, rts: 0x25eb2c, bytes: 778,
  // The shared subroutine. Named `approach*` and not `sub*` because `sub` below is the RECORD
  // sub-block layout, and one name for both is exactly the collision that hides a NaN.
  approach: 0x25eb2e, approachRts: 0x25eb62, approachEnd: 0x25eb63, approachBytes: 54,
  stub: 0x23dfb4,                            // SEVEN emits, all `jsr $23DFB4`
  vectorAt: 0x241812,                        // $25EB30 jsr -- MoveTables.vector, src/vectors.js
  // Off A6. `($2C,A6)` is the POINT of the routine: this is its SOLE WRITER and $25EDF8 / $25F074
  // are its SOLE READERS.
  off36: 0x36, flagAt: 0x2c, stateAt: 0x01, pairCursorAt: 0x02, tripleCursorAt: 0x04,
  state1: 0x01, state4: 0x04, state7: 0x07,  // $25E846 / $25E99E / $25E9A8, all cmpi.b
  loopCounter: DRAW_25EF30.loopCounter,      // $813098 -- gates E/D/C's DRAW only
  frameCounter: RAM.frameCounter,            // $80390A, the FOUR-frame animation counter
  flySpeed: 0x0060, flyTol: 0x0c00,          // $25E876/$25E87C and the four copies of it
  animMask: 0x03, animFrames: 4,             // $25E8D8 moveq #$3 -- FOUR frames, not eight
  snapTolLimit: 0x20,                        // $25EB52 cmpi.w #$20,($2,A2)
  coordBias: 0xe600,                         // $25E8A0 / $25E8AA addi.w, i.e. -$1A00
  attrMain: 0x1ad0,                          // D3 at emits 1, 3, 5, 6 and 7
  // INDEXED BY `sideFromD7_25D4E4`, which INVERTS D7. Entry 1 is the FALL-THROUGH set that D7 == 0
  // keeps ($25E824/$25E828) and the side that NEGATES D6; entry 0 is the override the `bne` past
  // $25E834 takes ($25E836/$25E83A) and does NOT negate.
  tables: Object.freeze([
    Object.freeze({ a0: 0x25e7b8, a1: 0x25e7f0, negD6: false }),   // side 0, D7 != 0
    Object.freeze({ a0: 0x25e7d4, a1: 0x25e80a, negD6: true }),    // side 1, D7 == 0
  ]),
  // A1 IS A FLAT 13-WORD STRUCT AND IS NEVER ADVANCED. Displacements, not indices.
  a1: Object.freeze({ home: 0x00, angle: 0x02, limit: 0x04, step: 0x06, base: 0x08,
    d4e1: 0x0a, d4e3: 0x0c, d4e2: 0x0e, d4e4: 0x10,
    hi2: 0x12, lo2: 0x14, hi4: 0x16, lo4: 0x18 }),
  // The record's FIVE 6-byte sub-blocks {speed, tolerance, position}, $0A..$27.
  sub: Object.freeze({ speed: 0x00, tol: 0x02, pos: 0x04, size: 0x06 }),
  // BLOCKS B and A -- state 1, two emits each. `flyWhenZero` is the ONE inverted test: B is
  // `tst.w ($2,A6) / beq` ($25E854) and A is the same `tst.w` with `bne` ($25E8FA).
  pairs: Object.freeze([
    Object.freeze({ at: 0x25e850, block: 'B', sub: 0x10, coord: 0x14, flyWhenZero: true,
      art: 0x00, d4: 0x0a, join: 0x25e89c, ble: 0x25e8f6, emits: Object.freeze([0x25e8b8, 0x25e8f0]),
      anim: Object.freeze({ hiBias: 0xfa00, loBias: 0xf000, hi: 0x12, lo: 0x14,
        stride: 0x0184, art: 0x14, attr: 0x0680, d4: 0x0e }) }),
    Object.freeze({ at: 0x25e8f6, block: 'A', sub: 0x0a, coord: 0x0e, flyWhenZero: false,
      art: 0x04, d4: 0x0c, join: 0x25e942, ble: 0x25e99e, emits: Object.freeze([0x25e960, 0x25e998]),
      anim: Object.freeze({ hiBias: 0xfc00, loBias: 0xf000, hi: 0x16, lo: 0x18,
        stride: 0x0104, art: 0x18, attr: 0x0480, d4: 0x10 }) }),
  ]),
  // BLOCKS E, D and C -- states 4 and 7, ONE emit each, and the only three with the $813098 gate.
  // `cursor` is the `cmpi.w #N,($4,A6)` immediate: a WORD compare four instructions from the BYTE
  // state compares. `d4` is a move.w IMMEDIATE here, not an A1 field.
  triples: Object.freeze([
    Object.freeze({ at: 0x25e9b2, block: 'E', cursor: 0x02, sub: 0x22, coord: 0x26, art: 0x08,
      d4: 0x001b, join: 0x25ea00, ble: 0x25ea30, emit: 0x25ea2a }),
    Object.freeze({ at: 0x25ea30, block: 'D', cursor: 0x01, sub: 0x1c, coord: 0x20, art: 0x0c,
      d4: 0x0019, join: 0x25ea7e, ble: 0x25eaae, emit: 0x25eaa8 }),
    Object.freeze({ at: 0x25eaae, block: 'C', cursor: 0x00, sub: 0x16, coord: 0x1a, art: 0x10,
      d4: 0x0018, join: 0x25eafc, ble: 0x25eb2c, emit: 0x25eb26 }),
  ]),
});

/** `$25EB2E..$25EB63` -- A DAMPED, ONE-AXIS APPROACH, and the shared subroutine five `bsr` in
 *  `$25E824` call ($25E870, $25E916, $25E9D4, $25EA52, $25EAD0).
 *
 *  A2 is a THREE-WORD sub-block `{speed, tolerance, position}`. D1 is the angle, D5 the target.
 *
 *  **`$241812`'s D2 -- the LONG-axis delta -- IS DISCARDED ONE INSTRUCTION LATER.** `$25EB36` adds
 *  only D3 to the position and `$25EB3A move.w D5,D2` overwrites D2 with the target before anything
 *  can read it. So this motion is ONE AXIS. A port that also applies `dy` moves the sprite on an
 *  axis the cartridge never touches.
 *
 *  **THE `bpl` / `neg.w` IS TRANSCRIBED, NOT `Math.abs`.** `neg.w` on `$8000` yields `$8000` again,
 *  which is not what an absolute value would give, and the difference should not be smoothed away.
 *
 *  **`$25EB4A bcc` IS UNSIGNED.** Still farther from the target than the tolerance -> return with
 *  nothing damped. Inside the tolerance, BOTH speed and tolerance halve (`lsr.w`, so they walk
 *  `$60, $30, $18, $0C, $06, $03, $01, $00` from the `$0060`/`$0C00` seed), and once the halved
 *  tolerance is `<= $20` the position SNAPS to the target and the tolerance is zeroed -- which is
 *  what makes the "arrived" compare at the top of each block fire on the next frame.
 *
 *  `$241812` clobbers D0-D3 and A3. Harmless: `$25E824` reloads D1 after every `bsr` before it uses
 *  it again, and A0/A1/D5/D6/D7 are untouched here. */
function approach25EB2E(ram, ctx, a2, angle, d5, tables) {
  const S = DRAW_25E824.sub;
  const d0 = ram.u16(a2 + S.speed);                          // $25EB2E move.w (A2),D0 -- SPEED LEVEL
  if (!tables) {
    ctx.unported?.note(DRAW_25E824.vectorAt, `$25EB30 jsr $241812 with no MoveTables on ctx. `
      + `$25E824's damped approach needs speed level $${d0.toString(16).toUpperCase()} at angle `
      + `$${u16(angle).toString(16).toUpperCase()}; refusing to invent a delta`);
    return;
  }
  const v = tables.vector(d0, angle);                        // $25EB30 jsr $241812 -> D2 dy, D3 dx
  // $25EB36 add.w D3,($4,A2) -- THE ONLY write of the vector. D2 (dy) is dead from here.
  ram.setU16(a2 + S.pos, u16(ram.u16(a2 + S.pos) + v.dx));
  const d2 = u16(d5);                                        // $25EB3A move.w D5,D2 -- D2 = TARGET
  let d0abs = u16(ram.u16(a2 + S.pos) - d2);                 // $25EB3C move.w / $25EB40 sub.w
  if ((d0abs & 0x8000) !== 0) d0abs = u16(-d0abs);          // $25EB42 bpl.s / $25EB44 neg.w
  // $25EB46 cmp.w ($2,A2),D0 / $25EB4A bcc.s $25EB62 -- UNSIGNED >=, i.e. still far away.
  if (d0abs >= ram.u16(a2 + S.tol)) return;
  ram.setU16(a2 + S.speed, ram.u16(a2 + S.speed) >>> 1);     // $25EB4C lsr.w (A2)
  ram.setU16(a2 + S.tol, ram.u16(a2 + S.tol) >>> 1);         // $25EB4E lsr.w ($2,A2)
  // $25EB52 cmpi.w #$20,($2,A2) / $25EB58 bgt.s $25EB62 -- SIGNED, transcribed as such.
  if (i16(ram.u16(a2 + S.tol)) > DRAW_25E824.snapTolLimit) return;
  ram.setU16(a2 + S.pos, u16(d5));                           // $25EB5A move.w D5,($4,A2) -- SNAP
  ram.setU16(a2 + S.tol, 0);                                 // $25EB5E clr.w ($2,A2)
  // $25EB62 rts
}

/** The movement half every one of the five blocks opens with, byte for byte the same in all five
 *  apart from the fields the caller passes in. Returns `true` when control reaches the block's JOIN
 *  POINT (so the emits run) and `false` when the `ble.s` fires and the whole block is skipped.
 *
 *  `selected` is the block's cursor test, and BLOCK A'S IS INVERTED against block B's -- `$25E854
 *  beq.s` versus `$25E8FA bne.s`, the same `tst.w ($2,A6)` in both. Blocks E/D/C use a WORD
 *  `cmpi.w #N,($4,A6)` instead, four instructions away from the BYTE state compares. */
function moveBlock25E850(ram, rom, ctx, a6, d7, a1, blk, selected, tables) {
  const A = DRAW_25E824.a1;
  const S = DRAW_25E824.sub;
  if (selected) {
    const d0 = ram.u16(a6 + blk.coord);                      // $25E856 move.w (<coord>,A6),D0
    const home = rom.u16(a1 + A.home);                       // $25E85A cmp.w (A1),D0
    if (d0 === home) {
      // $25E85E move.w #$1,($2C,A6) -- ARRIVED. The flag $25EDF8 and $25F074 read.
      ram.setU16(a6 + DRAW_25E824.flagAt, 1);
      return true;                                           // $25E864 bra.s the join point
    }
    // $25E866 lea (<sub>,A6),A2 / $25E86A move.w ($2,A1),D1 / $25E86E move.w (A1),D5
    approach25EB2E(ram, ctx, a6 + blk.sub, rom.u16(a1 + A.angle), home, tables);   // bsr $25EB2E
    return true;                                             // $25E874 bra.s the join point
  }

  // THE FLY-OUT ARM. $25E876 / $25E87C re-seed the sub-block EVERY FRAME the item is unselected,
  // which is what makes the damping start from $60/$0C00 again the moment it is selected.
  ram.setU16(a6 + blk.sub + S.speed, DRAW_25E824.flySpeed);  // move.w #$0060,(<sub>,A6)
  ram.setU16(a6 + blk.sub + S.tol, DRAW_25E824.flyTol);      // move.w #$0C00,(<sub>+2,A6)
  let d0 = ram.u16(a6 + blk.coord);                          // $25E882 move.w (<coord>,A6),D0
  let d1 = rom.u16(a1 + A.limit);                            // $25E886 move.w ($4,A1),D1 -- the LIMIT
  // $25E88A tst.w D7 / $25E88C bne.s -- so `$25E88E exg D0,D1` runs on D7 == 0 ONLY, which
  // `sideFromD7_25D4E4` calls SIDE 1. It REVERSES the compare below, and it is the only place the
  // two sides' off-screen directions differ. `exg` swaps the full longs; both halves that matter
  // here were written by `move.w`, and `cmp.w` reads the low words only.
  if (u16(d7) === 0) { const t = d0; d0 = d1; d1 = t; }
  // $25E890 cmp.w D1,D0 / $25E892 ble.s -- SIGNED, and it lands on the NEXT block's head (block C's
  // lands on the `rts`). Past the limit -> this block emits nothing at all this frame.
  if (i16(d0) <= i16(d1)) return false;
  // $25E894 move.w ($6,A1),D1 / $25E898 add.w D1,(<coord>,A6) -- the constant slide off screen.
  ram.setU16(a6 + blk.coord, u16(ram.u16(a6 + blk.coord) + rom.u16(a1 + A.step)));
  return true;
}

/** `$25E824..$25EB2D` -- 778 bytes, the SEVENTH of the eight shared select-screen draws, and the
 *  one that MOVES the menu. Plus its 54-byte subroutine `$25EB2E`, five `bsr` sites.
 *
 *  **`($0A..$27,A6)` IS FIVE 6-BYTE SUB-BLOCKS `{speed, tolerance, position}`, NOT LOOSE FIELDS.**
 *  `HANDLER0.d1At: [$14, $1A, $20, $26]` had already half-noticed the $6 stride; `($0E,A6)` is
 *  element 0 of the same array and `HANDLER0.d0At` names it separately only because state 0 seeds it
 *  with the other coordinate.
 *
 *      A  $0A/$0C/$0E -> emits 3, 4     B  $10/$12/$14 -> emits 1, 2
 *      C  $16/$18/$1A -> emit 7         D  $1C/$1E/$20 -> emit 6      E  $22/$24/$26 -> emit 5
 *
 *  **TWO CURSORS, AND THEY GATE DIFFERENT STATES.** `($2,A6)` is state 1's two-option cursor and
 *  picks between blocks A and B; `($4,A6)` is states 4 and 7's three-option cursor (bounded 0..2 by
 *  `$25D402`) and picks among C, D and E. `$25E846 cmpi.b #$1,($1,A6)` runs the pair, `$25E99E
 *  cmpi.b #$4` and `$25E9A8 cmpi.b #$7` run the triple, and anything else is an immediate `rts`.
 *
 *  **NEITHER STATE GATE IS DEAD.** `confirmAndDraw`'s no-confirm path skips the state write and
 *  falls into the draws, so `($1,A6)` is still 1 or still 4 when this runs. W374 briefly recorded
 *  `$25EDF8`'s and `$25F074`'s `cmpi.b #$4` gates as dead on the old early-`return` model and both
 *  claims were withdrawn; the same reasoning applies here. Read `confirmAndDraw`'s comment first.
 *
 *  **THE SELECTED ITEM EASES HOME; THE OTHERS SLIDE OFF AND STOP DRAWING PAST THE LIMIT.** The
 *  fly-out arm re-seeds `{$0060, $0C00}` every frame, so the damping always restarts from the top,
 *  and its `ble.s` lands on the NEXT block's head -- block C's on the `rts` -- so an item past the
 *  limit contributes no sprite at all.
 *
 *  **BLOCK A'S CURSOR TEST IS INVERTED AGAINST BLOCK B'S.** `$25E854 beq.s` versus `$25E8FA
 *  bne.s`, on the same `tst.w ($2,A6)`. Copy B's sense into A and both halves of the pair fly out
 *  together on one cursor value and both ease home on the other.
 *
 *  **THE `exg D0,D1` RUNS ON SIDE 1 ONLY** (`tst.w D7 / bne` skips it, and D7 == 0 is side 1), and
 *  it REVERSES the limit compare. The two records slide off opposite edges, and the `exg` is the
 *  entire mechanism -- there is no second limit word.
 *
 *  **`$813098` GATES ONLY BLOCKS E/D/C's DRAW, AND IT SITS AFTER THE MOVEMENT.** The stepping and
 *  the damping run every loop; only the `jsr $23DFB4` is first-loop-only. Blocks B and A have no
 *  such test at all. Hoisting the gate to the top of those blocks freezes the three-option menu.
 *
 *  **`($2C,A6)` IS THE POINT OF THE ROUTINE.** This is its SOLE WRITER -- `clr.w` at `$25E842` and
 *  `move.w #$1` at the five "arrived" sites -- and `$25EDF8` and `$25F074` are its SOLE READERS. It
 *  means "the selected item finished sliding home this frame". Because `$25E824` was unported it had
 *  been permanently 0, so `$25EDF8`'s timer arm and `$25F074`'s emit 2 plus its `($66,A6)` ramp
 *  advance were both permanently OFF. Porting this turns them on.
 *
 *  **NOTHING IS INHERITED BETWEEN THE SEVEN EMITS.** All seven load D1, D2, D3 and D4 fresh, which
 *  is the opposite of `$25E220`. D3's and D4's high halves are inherited garbage at every site and
 *  unobservable, because `$23DFB4` consumes both as words.
 *
 *  **THE ANIMATION IS FOUR FRAMES AND THE `mulu` YIELDS A BYTE DELTA DIRECTLY** -- `moveq #$3 /
 *  and.w $80390A / mulu.w #$0184` (emit 2) and `#$0104` (emit 4), added to `($14,A0)` / `($18,A0)`
 *  with `add.l`. This is NOT `$25EDF8`'s eight-frame `(counter & $E) * 2` index idiom; the two look
 *  alike and produce different arts.
 *
 *  **A0 IS SEVEN ART LONGS AND IS NOT IN EMIT ORDER.** Entries 0..4 are the five sub-blocks' STATIC
 *  art in SUB-BLOCK order (`$10`, `$0A`, `$22`, `$1C`, `$16`); entries 5..6 are the animation bases.
 *  **A1 IS A FLAT 13-WORD STRUCT AND IS NEVER ADVANCED** -- the only writes to it are the two `lea`.
 *  `HANDLER0.coord` is exactly `+$00` and `+$04` of the two A1 tables, side for side, which is an
 *  independent read of the same constants by already-shipped code.
 *
 *  `($36,A6)` is 0 as shipped (`HANDLER0.clearWords` clears it and no writer exists in
 *  `$25C000..$260000`), so D6 contributes nothing to emits 5-7 today. Read from RAM anyway, exactly
 *  as `draw25E6CE` reads `($3E,A6)`: a writer outside that range would be invisible if it were
 *  folded to a constant.
 *
 *  Inherited: **A6 and D7 only**. A4/A5 untouched. `$23DFB4` pushes and restores A0 and D0, so
 *  A0, A1, D5, D6 and D7 survive all seven calls -- that is what lets the head's `lea`s and the
 *  negated D6 reach the last emit. */
export function draw25E824(ram, rom, ctx, a6, d7) {
  const D = DRAW_25E824;
  const A = D.a1;
  // $25E824/$25E828 lea the FALL-THROUGH set and $25E830 neg.w D6; $25E834 beq keeps them on
  // D7 == 0. `sideFromD7_25D4E4` INVERTS, so the fall-through set is SIDE 1. Same `beq` sense as
  // $25EDF8: swap the two rows of `DRAW_25E824.tables` and every sprite lands on the wrong record.
  const side = sideFromD7_25D4E4(d7);
  const t = D.tables[side];
  const a0 = t.a0;
  const a1 = t.a1;
  // $25E82C / $25E83E move.w ($36,A6),D6, and $25E830 neg.w D6 on the fall-through ONLY.
  const d6 = t.negD6 ? u16(-ram.u16(a6 + D.off36)) : ram.u16(a6 + D.off36);
  const tables = ctx.tables;

  ram.setU16(a6 + D.flagAt, 0);                              // $25E842 clr.w ($2C,A6) -- ALWAYS

  const state = ram.u8(a6 + D.stateAt);
  if (state === D.state1) {
    // $25E846 cmpi.b #$1,($1,A6) -- the immediate word $0001 comes BEFORE the displacement $0001.
    // Both happen to be $01 here, which is exactly the coincidence that hides an operand-order slip.
    const cursor = ram.u16(a6 + D.pairCursorAt);             // $25E850 / $25E8F6 tst.w ($2,A6)
    for (const blk of D.pairs) {
      // BLOCK B is `beq.s` (fly out when the cursor is 0); BLOCK A is `bne.s`, the INVERSE.
      const selected = blk.flyWhenZero ? cursor !== 0 : cursor === 0;
      // The `ble.s` at $25E892 lands on $25E8F6 (block A's head) and the one at $25E938 on $25E99E
      // (the state-4 compare), so in both cases it is exactly "skip the rest of this block".
      if (!moveBlock25E850(ram, rom, ctx, a6, d7, a1, blk, selected, tables)) continue;

      // ---- FIRST EMIT ($25E89C join / $25E942 join). D1 is a (high, low) pair: the `swap` at
      // $25E8A4 puts the A1 base word in the HIGH half and the record coordinate in the LOW.
      const hi1 = u16(rom.u16(a1 + A.base) + D.coordBias);   // move.w ($8,A1),D1 / addi.w #$E600
      const lo1 = u16(ram.u16(a6 + blk.coord) + D.coordBias);   // move.w (<coord>,A6),D1 / addi.w
      enqueueRegistersThroughStub(ram, rom, D.stub, ((hi1 << 16) | lo1) >>> 0,
        rom.u32(a0 + blk.art),                               // move.l (A0),D2 / move.l ($4,A0),D2
        D.attrMain,                                          // move.w #$1AD0,D3
        rom.u16(a1 + blk.d4));                               // move.w ($A,A1),D4 / ($C,A1),D4

      // ---- SECOND EMIT, THE ANIMATED ONE. Every register is rebuilt from scratch; nothing at all
      // is inherited from the emit above.
      const an = blk.anim;
      // $25E8BE..$25E8CA: base + $FA00 (block A: $FC00) + ($12,A1) (A: $16,A1), then swap.
      const hi2 = u16(u16(rom.u16(a1 + A.base) + an.hiBias) + rom.u16(a1 + an.hi));
      // $25E8CC..$25E8D6: coordinate + $F000 + ($14,A1) (A: $18,A1). BOTH blocks bias by $F000.
      const lo2 = u16(u16(ram.u16(a6 + blk.coord) + an.loBias) + rom.u16(a1 + an.lo));
      // $25E8D8 moveq #$3,D2 / and.w $80390A,D2 / mulu.w #$0184 (A: #$0104) / add.l ($14,A0),D2
      // (A: ($18,A0)). FOUR frames, and the multiply is the BYTE DELTA -- there is no index step.
      const frame = u16(D.animMask & ram.u16(D.frameCounter));
      const d2 = ((frame * an.stride + rom.u32(a0 + an.art)) >>> 0);
      enqueueRegistersThroughStub(ram, rom, D.stub, ((hi2 << 16) | lo2) >>> 0, d2,
        an.attr,                                             // move.w #$0680,D3 / #$0480,D3
        rom.u16(a1 + an.d4));                                // move.w ($E,A1),D4 / ($10,A1),D4
    }
    // Block A's second emit at $25E998 FALLS THROUGH into $25E99E, and there is no `bra` in
    // between. Returning is equivalent and not a shortcut: `($1,A6)` is still 1 here -- nothing in
    // the routine writes it -- so both `cmpi.b` below fail and the fall-through reaches the `rts`.
    return;
  }

  // $25E99E cmpi.b #$4,($1,A6) / beq.w $25E9B2 and $25E9A8 cmpi.b #$7,($1,A6) / bne.w $25EB2C.
  // NEITHER is dead. State 4 is reached on any frame the player does not confirm.
  if (state !== D.state4 && state !== D.state7) return;      // $25E9AE bne.w -> the rts

  const cursor = ram.u16(a6 + D.tripleCursorAt);
  for (const blk of D.triples) {
    // $25E9B2 / $25EA30 / $25EAAE cmpi.w #N,($4,A6) -- `$0C6E` is cmpi.W. Four instructions from the
    // BYTE state compares above and easy to read as a byte; a byte compare here would match on
    // $XX02 as well as $0002.
    const selected = cursor === blk.cursor;
    if (!moveBlock25E850(ram, rom, ctx, a6, d7, a1, blk, selected, tables)) continue;

    // $25EA00 tst.w $813098 / bne.w -- FIRST LOOP ONLY, and it is AFTER the movement, so the
    // stepping and the damping above already ran. Only the draw is gated. Blocks B and A have no
    // such test anywhere.
    if (ram.u16(D.loopCounter) !== 0) continue;

    // $25EA0A..$25EA1C. D6 -- the SIDE-SIGNED ($36,A6) -- lands on the HIGH half, before the swap.
    const hi = u16(u16(rom.u16(a1 + A.base) + D.coordBias) + d6);
    const lo = u16(ram.u16(a6 + blk.coord) + D.coordBias);
    enqueueRegistersThroughStub(ram, rom, D.stub, ((hi << 16) | lo) >>> 0,
      rom.u32(a0 + blk.art),                                 // move.l ($8,A0),D2 -- ($C,A0), ($10,A0)
      D.attrMain,                                            // move.w #$1AD0,D3
      blk.d4);                                               // move.w #$1B,D4 -- an IMMEDIATE here
  }
  // $25EB2C rts
}

export const DRAW_25E4D0 = Object.freeze({
  addr: 0x25e4d0, end: 0x25e68d, bytes: 446,
  // The two `4E71` pads. They are INSIDE the extent: $25E5AE closes half A and $25E68C closes half B.
  pads: Object.freeze([0x25e5ae, 0x25e68c]),
  // The `rts` of the routine ABOVE this one. It is at $25E47E and NOT at $25E47C: $25E478
  // `move.l #$0019FB9C,D2` occupies $25E478..$25E47D, so $25E47C..$25E47D is that immediate's tail.
  // Recorded because a recon put it two bytes low and the figure was about to be propagated.
  prevRts: 0x25e47e,
  zoomStub: 0x23e2f2,                        // emits 1, 3, 4 and 6 -- the ZOOMING register family
  stub: 0x23dfb4,                            // emits 2 and 5 -- the plain register enqueue
  // The half select. $25E4D0 tst.w D7 / $25E4D2 beq.w $25E5B0 (extension word at $25E4D4, +$DC).
  halfB: 0x25e5b0, beqExt: 0x25e4d4, beqDisp: 0x00dc,
  // Off A6. These EIGHT are the only (d16,A6) offsets in the whole 446 bytes. `($1,A6)` is NOT among
  // them: there is no `cmpi.b` on the state byte here, so the dead-gate trap does not arise.
  sideAt: 0x02,                              // $25E504 / $25E5DE move.w ($2,A6),D5 -- the ART INDEX
  xAt: 0x40, yAt: 0x44,                      // read 4x each: twice per half
  zAt: 0x4a,                                 // read 2x -- and SUBTRACTED in BOTH halves
  wAt: 0x50,                                 // read 4x, emits 3 and 6 ONLY, as TWO separate ops
  gateAt: 0x54,                              // $25E52E / $25E608 tst.w -- gates EMIT 2/5 ONLY
  channelAt: 0x56,                           // $25E4F4 / $25E5CE move.l D1 -- THE ONLY RAM WRITE
  cursorAt: 0x60,                            // $25E522 / $25E5A2 / $25E5FC / $25E680 adda.w
  mirror2: SCHED.mirror2,                    // $80390C -- the SECOND gate on emit 2/5
  blink: RAM.frameCounterMod4,               // $803910 -- emit 2/5's four-frame blink
  // THE DATA PROLOGUE, $25E4C0..$25E4CF, sitting BELOW the routine's own entry. TWO 2-entry
  // longword tables, both indexed by `D5 = 4 * ($2,A6)`.
  artTable: 0x25e4c0,                        // emits 1 and 4's D2:  $00001520 / $00001BC4
  ptrTable: 0x25e4c8,                        // emits 2 and 5's A0:  $0025576E / $0025583A
  geomTable: 0x255a22,                       // $25E540 lea $255A22,A1 -- ALREADY the port's glowGeom
  sideCount: 2, sideStep: 0x04,              // $25E508/$25E50A add.w D5,D5 twice -> D5 in {0,4}
  // The emit-2/5 art tables the pointer table reaches, indexed by `D0 = ($803910 << 1) & 4`.
  blinkShift: 1, blinkMask: 0x0004, blinkFrames: 4,
  // THE TWO RAMPS, both sixteen longwords at stride 4, both indexed by the SAME `($60,A6)`.
  // $25E68E[i] == $25E480[15-i] entry for entry: $25E480 is the sixteen-frame zoom IN and this is
  // the same ramp backwards, a zoom OUT. So emits 1/4 zoom OUT while emits 3/6 zoom IN.
  rampOut: 0x25e68e,                         // emits 1 and 4 -- the routine's OWN window
  rampIn: DRAW_25E29E.ramp,                  // emits 3 and 6 -- $25E480, SHARED with $25E29E
  rampEntries: 16, rampStep: 0x04, rampLast: 0x3c, rampBytes: 0x40,
  // The `lea`s, resolved from their own EXTENSION WORD addresses. Emits 1/4 carry a `nop` between
  // the lea and the adda; emits 3/6 do NOT. Named so the asymmetry is checkable.
  leaOutA: 0x25e51c, leaOutB: 0x25e5f6, nopAfterOut: Object.freeze([0x25e520, 0x25e5fa]),
  leaInA: 0x25e59e, leaInB: 0x25e67c,
  // The constants every half shares.
  biasSwapped: 0xfe80,                       // $25E4E6 / $25E5C0 addi.w, on the LONG axis
  undoHigh: 0xfa00,                          // $25E4FA / $25E5D4 addi.w, undone at $25E560/$25E63A
  undoLow: 0xfc00,                           // $25E500 / $25E5DA addi.w, undone at $25E568/$25E642
  attrE1: 0x0620,                            // $25E514 / $25E5EE move.w #$620,D3
  palE2: 0x001a,                             // $25E570 / $25E64A move.w #$1A,D4
  artE3: 0x0019d8ec,                         // $25E590 / $25E66A move.l #$19D8EC,D2
  attrE3: 0x1668,                            // $25E596 / $25E670 move.w #$1668,D3
  palE3: 0x0011,                             // $25E59A / $25E674 move.w #$11,D4
  oriE6: 0x0040,                             // $25E678 ori.w #$40,D4 -- HALF B ONLY, $11 -> $51
  // THE TWO HALVES, in the order `sideFromD7_25D4E4` numbers them: entry 0 is half A (D7 != 0,
  // side 0), entry 1 is half B (D7 == 0, side 1). SEVEN differences and nothing else.
  halves: Object.freeze([
    Object.freeze({
      at: 0x25e4d6, name: 'A',
      base1: 0x37800d40,                     // 1. $25E4D6 move.l #$37800D40,D1
      addXY: false,                          // 2. $25E4DC/$25E4E0 sub.w -- half B ADDs
      bias: 0x0780,                          // 4. $25E4F0 addi.w #$780
      palE1: 0x0000,                         // 5. $25E518 move.w #$0,D4
      base3: 0x21810040, addXY3: false,      // 6. $25E57A + four sub.w
      ori: 0x0000,                           // 7. no ori.w -- half B's is the one extra instruction
      emits: Object.freeze([0x25e528, 0x25e574, 0x25e5a8]),
    }),
    Object.freeze({
      at: 0x25e5b0, name: 'B',
      base1: 0x37802a80,
      addXY: true,
      bias: 0xf880,
      palE1: 0x0001,
      base3: 0x21811d80, addXY3: true,
      ori: 0x0040,
      emits: Object.freeze([0x25e602, 0x25e64e, 0x25e686]),
    }),
  ]),
});

/** The cursor and side-index bound checks, shared by both halves. `null` means "in range"; anything
 *  else is the note text that has already been filed. Both bounds are stated by CODE, not by
 *  adjacency: `($60,A6)` is seeded at `$25D51C`, advanced by `$25D7B6 addq.w #4` and stopped by
 *  `$25D7AC cmpi.w #$3C / beq`, and `($2,A6)` is wrapped to `{0,1}` by the state-1 handler's own
 *  `$25D1FA bge` / `$25D1FC move.w #$1` and `$25D21E cmpi.w #$1` / `$25D226 move.w #$0`. */
function bounds25E4D0(ctx, side, cursor) {
  const D = DRAW_25E4D0;
  const hex = (v) => `$${v.toString(16).toUpperCase()}`;
  if (side >= D.sideCount) {
    // $25E510 move.l (0,A0,D5.w),D2 with A0 = $25E4C0, and $25E546 with A0 = $25E4C8. The declared
    // window is exactly $25E4C0..$25E4CF, which is the two tables and nothing else.
    ctx.unported?.note(0x25e510, `${hex(0x25e510)} -- ($2,A6) = ${hex(side)} indexes the two-entry `
      + `tables at ${hex(D.artTable)} and ${hex(D.ptrTable)} past their second entry. $25D1FA and `
      + `$25D21E bound it to {0,1} and ${hex(D.artTable)}..${hex(D.artTable + 0x0f)} is the only `
      + 'ROM declared for it. No ROM is read for that index');
    return true;
  }
  if (cursor > D.rampLast || (cursor & (D.rampStep - 1)) !== 0) {
    // Both ramps are $40 bytes and take the SAME cursor, so one check covers emits 1/4 and 3/6.
    ctx.unported?.note(D.leaOutA, `${hex(D.leaOutA)} -- ($60,A6) = ${hex(cursor)} indexes the zoom `
      + `ramps ${hex(D.rampOut)}..${hex(D.rampOut + D.rampBytes - 1)} (emits 1/4, the zoom OUT) and `
      + `${hex(D.rampIn)}..${hex(D.rampIn + D.rampBytes - 1)} (emits 3/6, the zoom IN) outside the `
      + 'sixteen longwords $25D51C/$25D7AC/$25D7B6 bound it to. No ROM is read for that cursor');
    return true;
  }
  return false;
}

/** One half of `$25E4D0`. The two are PEERS, not mutually recursive: neither branches to the other,
 *  unlike `$25EF30`'s pair. `h` carries the SEVEN differences and nothing else. */
function half25E4D0(ram, rom, ctx, a6, h, playerIdx) {
  const D = DRAW_25E4D0;
  const cursor = ram.u16(a6 + D.cursorAt);
  const side = ram.u16(a6 + D.sideAt);                        // $25E504 / $25E5DE move.w ($2,A6),D5
  if (bounds25E4D0(ctx, side, cursor)) return;
  // $25E508/$25E50A add.w D5,D5 TWICE -- D5 is a BYTE offset of 4 * ($2,A6), not an entry index.
  const d5 = u16(u16(side * 2) * 2);
  // **D5 IS INHERITED ACROSS THE EMIT-1 `jsr $23E2F2`** and is read again at $25E546 and $25E55A.
  // $23E2F2 does `movem.l D4/D7/A0` and never touches D5, so it is loaded here ONCE.

  const x = ram.u16(a6 + D.xAt);                              // ($40,A6)
  const y = ram.u16(a6 + D.yAt);                              // ($44,A6)
  const z = ram.u16(a6 + D.zAt);                              // ($4A,A6)

  // ---- D1, built as an explicit (high, low) pair so every `swap` is a real step.
  // $25E4D6 / $25E5B0 move.l #$37800D40,D1 (half B: #$37802A80).
  let hi = (h.base1 >>> 16) & 0xffff;
  let lo = h.base1 & 0xffff;
  // $25E4DC/$25E4E0 sub.w, and $25E5B6/$25E5BA add.w. THE SHORT AXIS IS MIRRORED.
  lo = u16(h.addXY ? lo + x : lo - x);
  lo = u16(h.addXY ? lo + y : lo - y);
  [hi, lo] = [lo, hi];                                       // $25E4E4 / $25E5BE swap
  lo = u16(lo + D.biasSwapped);                              // $25E4E6 / $25E5C0 addi.w #$FE80
  // $25E4EA sub.w ($4A,A6),D1 AND $25E5C4 sub.w ($4A,A6),D1 -- **SUB IN BOTH HALVES**. The LONG
  // axis is NOT mirrored. Making this an `add` on half B is the single most plausible wrong port
  // of this routine, and it is wrong: the cartridge really does subtract on both sides.
  lo = u16(lo - z);
  [hi, lo] = [lo, hi];                                       // $25E4EE / $25E5C8 swap
  lo = u16(lo + h.bias);                                     // $25E4F0 addi.w #$780 (B: #$F880)

  // ---- $25E4F4 / $25E5CE move.l D1,($56,A6). **THE ONLY RAM WRITE IN THE WHOLE 446 BYTES**, and
  // it is a CROSS-ROUTINE CHANNEL of the same class as ($2C,A6). It is written ONLY by these two
  // halves and read ONLY at $25D71C `move.l ($56,A6),D0`, which immediately also reads ($56,A0) --
  // the OTHER record's copy -- `exg`s the pair on one side and feeds both to $2603FE behind a
  // once-only latch on $812F80. $25D71C sits at a LOWER address than the $25D814 call that reaches
  // this routine, so it consumes the value written on the PREVIOUS frame.
  //
  // **THE STORED VALUE IS EMIT 2's ANCHOR, not emit 1's and not emit 3's.** It is captured HERE,
  // before the two `addi.w` below, and those two are exactly what $25E560/$25E568 subtract back off
  // to rebuild emit 2's D1. Move this write one instruction later and the channel carries emit 1's
  // coordinates instead, which is a different sprite by $600 on the long axis and $400 on the short.
  const anchor = ((hi << 16) | lo) >>> 0;
  ram.setU32(a6 + D.channelAt, anchor);
  if (ctx?.playerSpriteFilter?.(ram, {
    player: a6,
    playerIdx,
    phase: 'launch',
    anchor,
  }, ctx) === false) return;

  [hi, lo] = [lo, hi];                                       // $25E4F8 / $25E5D2 swap
  lo = u16(lo + D.undoHigh);                                 // $25E4FA / $25E5D4 addi.w #$FA00
  [hi, lo] = [lo, hi];                                       // $25E4FE / $25E5D8 swap
  lo = u16(lo + D.undoLow);                                  // $25E500 / $25E5DA addi.w #$FC00

  // ---- EMIT 1 / EMIT 4. Everything fresh. $25E51C lea ($25E68E,PC),A0 / $25E520 NOP / $25E522
  // adda.w ($60,A6),A0 / $25E526 move.l (A0),D6. The `nop` is real cartridge padding between the
  // lea and the adda -- named rather than silently dropped, because emits 3/6 do NOT have one.
  const d6out = rom.u32(D.rampOut + cursor);                 // the zoom-OUT ramp
  enqueueZoomedRegistersThroughStub(ram, rom, D.zoomStub, ((hi << 16) | lo) >>> 0,
    rom.u32(D.artTable + d5),                                // $25E510 move.l (0,A0,D5.w),D2
    D.attrE1,                                                // $25E514 move.w #$620,D3
    h.palE1,                                                 // $25E518 move.w #$0,D4 (half B: #$1)
    d6out);                                                  // $25E528 / $25E602 jsr $23E2F2

  // ---- EMIT 2 / EMIT 5. TWO GATES, BOTH LIVE, and both skip THIS EMIT ONLY -- emit 3/6 below is
  // reached either way and rebuilds every register from scratch, so the skipped path is safe.
  // $25E52E tst.w ($54,A6) / beq.s and $25E534 tst.w $80390C / beq.s, both landing on $25E57A.
  // **NEITHER SIDE FLIPS THIS EMIT.** Emits 2 and 5 are byte-identical apart from their branch
  // displacements: same A1 struct, same D4 = $001A, same D3 out of the struct. That
  // asymmetry-in-symmetry is real -- do not "fix" it by mirroring it like emits 1/4 and 3/6.
  if (ram.u16(a6 + D.gateAt) !== 0 && ram.u16(D.mirror2) !== 0) {
    // $25E53C lea ($25E4C8,PC),A0 / $25E546 movea.l (0,A0,D5.w),A0 -> $25576E or $25583A.
    const a0 = rom.u32(D.ptrTable + d5);
    // $25E54A move.w $803910,D0 / $25E550 lsl.w #1,D0 / $25E552 andi.w #$4,D0. The counter runs
    // 0..3 and this collapses it to {0,0,4,4}: a 2-on/2-off FOUR-FRAME BLINK between two arts.
    const d0 = u16(u16(ram.u16(D.blink) << D.blinkShift) & D.blinkMask);
    const d2 = rom.u32(a0 + d0);                             // $25E556 move.l (0,A0,D0.w),D2
    // $25E55A movea.l (0,A1,D5.w),A1 with A1 = $255A22 -> $255A2A (s=0) or $255A30 (s=1). Three
    // words, read with `(A1)+` twice and then once more: the {bias, dx, size} layout shipsprite.js
    // already calls `glowGeom`, which is an independent confirmation of the same three constants.
    let a1 = rom.u32(D.geomTable + d5);
    // **D1 IS INHERITED-AND-MODIFIED, not rebuilt.** $23E2F2 preserves D1 across emit 1's jsr, and
    // these two `subi.w` are the exact inverses of $25E4FA and $25E500 -- they walk D1 back to the
    // value ($56,A6) already holds, and then the struct's two words are added on top.
    [hi, lo] = [lo, hi];                                     // $25E55E / $25E638 swap
    lo = u16(lo - D.undoHigh);                               // $25E560 subi.w #$FA00 -- UNDOES $FA00
    lo = u16(lo + rom.u16(a1));                              // $25E564 add.w (A1)+,D1 -- w0
    a1 += 2;
    [hi, lo] = [lo, hi];                                     // $25E566 / $25E640 swap
    lo = u16(lo - D.undoLow);                                // $25E568 subi.w #$FC00 -- UNDOES $FC00
    lo = u16(lo + rom.u16(a1));                              // $25E56C add.w (A1)+,D1 -- w1
    a1 += 2;
    const d3 = rom.u16(a1);                                  // $25E56E move.w (A1)+,D3 -- w2
    a1 += 2;
    void a1;
    // $25E570 move.w #$1A,D4 / $25E574 jsr $23DFB4 -- the NON-zooming stub, and the only one here.
    enqueueRegistersThroughStub(ram, rom, D.stub, ((hi << 16) | lo) >>> 0, d2, d3, D.palE2);
  }

  // ---- EMIT 3 / EMIT 6. EVERYTHING FRESH: nothing at all survives from emits 1 and 2 into this
  // block, which is why the gate-skipped path above needs no repair. $25E57A move.l #$21810040,D1
  // (half B: #$21811D80).
  let hi3 = (h.base3 >>> 16) & 0xffff;                       // $2181 on BOTH halves
  let lo3 = h.base3 & 0xffff;
  // $25E580/$25E584 sub.w ($40,A6)/($44,A6) -- half B's $25E65A/$25E65E add.w. RE-READ from RAM,
  // not carried from the top: that is what makes the "x4" read counts in the doc comment literal,
  // and it is what would show if anything downstream ever started writing these fields.
  const x3 = ram.u16(a6 + D.xAt);
  const y3 = ram.u16(a6 + D.yAt);
  lo3 = u16(h.addXY3 ? lo3 + x3 : lo3 - x3);
  lo3 = u16(h.addXY3 ? lo3 + y3 : lo3 - y3);
  // **$25E588 AND $25E58C ARE TWO SEPARATE `sub.w ($50,A6),D1`, NOT A SHIFT.** So the term is -2W
  // (half B: +2W at $25E662/$25E666). Collapse the pair into one and the sprite lands at half its
  // offset -- the same trap `$25E29E` and `$25E6CE` document.
  const w = ram.u16(a6 + D.wAt);
  lo3 = u16(h.addXY3 ? lo3 + w : lo3 - w);
  lo3 = u16(h.addXY3 ? lo3 + w : lo3 - w);
  // $25E59A move.w #$11,D4, then $25E678 ori.w #$40,D4 on HALF B ONLY -- the one extra instruction
  // in the whole routine, and the only thing that separates emit 6's D4 ($51) from emit 3's ($11).
  const pal3 = u16(D.palE3 | h.ori);
  // $25E59E lea ($25E480,PC),A0 -- and there is **NO nop here**, where emits 1/4 have one.
  const d6in = rom.u32(D.rampIn + cursor);                   // the zoom-IN ramp, SHARED with $25E29E
  enqueueZoomedRegistersThroughStub(ram, rom, D.zoomStub, ((hi3 << 16) | lo3) >>> 0,
    D.artE3, D.attrE3, pal3, d6in);                          // $25E5A8 / $25E686 jmp -- TAIL CALL
}

/** `$25E4D0` -- **THE EIGHTH AND LAST of the shared select-screen draws**, `$25E4D0..$25E68D`,
 *  **446 bytes** and **THREE EMITS PER SIDE**. Its DATA PROLOGUE sits BELOW its entry, at
 *  `$25E4C0..$25E4CF`, exactly as `$25EDF8`'s 660-byte block sits below its.
 *
 *  **IT IS TWO PEER HALVES, NOT A BODY PLUS A SUBROUTINE AND NOT A RECURSIVE PAIR.** `$25E4D0
 *  tst.w D7 / beq.w $25E5B0` picks one and neither half branches to the other -- so unlike
 *  `$25EF30` there is no `bsr`, no other-record `tst.b` and no possibility of both halves running
 *  in one call. `sideFromD7_25D4E4` INVERTS D7, so **D7 != 0 is side 0 and takes HALF A**, and
 *  **D7 == 0 is side 1 and takes HALF B**.
 *
 *  **SEVEN DIFFERENCES SEPARATE THE HALVES, AND ONE EXPECTED DIFFERENCE IS ABSENT.**
 *
 *      1  #$37800D40                 vs  #$37802A80
 *      2  sub.w ($40)/($44)          vs  ADD.W both        -- the SHORT axis IS mirrored
 *      3  sub.w ($4A,A6)             vs  sub.w ($4A,A6)    -- **SUB IN BOTH. NOT mirrored.**
 *      4  addi.w #$780               vs  addi.w #$F880
 *      5  move.w #$0,D4              vs  move.w #$1,D4
 *      6  #$21810040 + four sub.w    vs  #$21811D80 + four ADD.W
 *      7  (nothing)                  vs  $25E678 ori.w #$40,D4 -- the ONE extra instruction
 *
 *  Difference 3 is the one a port invents. The long axis is genuinely subtracted on both sides.
 *
 *  **EMITS 2 AND 5 ARE NOT MIRRORED EITHER.** They are byte-identical apart from their branch
 *  displacements: the same `$255A22` struct, the same `D4 = $001A`, the same D3 out of the struct.
 *  In a routine whose other four emits mirror cleanly that reads like an oversight; it is what the
 *  cartridge does, and it is pinned by a test.
 *
 *  **THE ONLY RAM WRITE IS `($56,A6)`, AND IT IS A CROSS-ROUTINE CHANNEL.** Written ONLY at
 *  `$25E4F4` and `$25E5CE`, read ONLY at `$25D71C move.l ($56,A6),D0`, which in the same breath
 *  reads `($56,A0)` -- the OTHER record's copy -- `exg`s the pair on one side and hands both to
 *  `$2603FE` behind a once-only latch on `$812F80`. `$25D71C` is at a LOWER address than the
 *  `$25D814` call that reaches here, so it consumes the PREVIOUS frame's value. **The stored long
 *  is EMIT 2's anchor**, captured before the `$FA00`/`$FC00` pair that emit 1 uses and that
 *  `$25E560`/`$25E568` subtract straight back off. That is the only reason the write exists.
 *
 *  **TWO GATES, BOTH LIVE, AND BOTH SKIP EMIT 2 ONLY.** `tst.w ($54,A6)` (set by `$25D6EE move.w
 *  #$1`, cleared by `$25D0BE clr.w`) and `tst.w $80390C` (`SCHED.mirror2`) both branch to the emit
 *  3 head. **There is NO `cmpi.b` on `($1,A6)` anywhere in the routine and `($1,A6)` is never
 *  read**, so the dead-gate trap that cost two withdrawn claims this wave does not arise here.
 *
 *  **FRESH VERSUS INHERITED.** Emits 1/4 are entirely fresh. Emits 2/5 inherit **D1** -- rebuilt by
 *  undoing two `addi.w` and adding the struct's first two words -- and inherit **D5** across the
 *  emit-1 `jsr $23E2F2`, where it is load-bearing at `$25E546` and `$25E55A`. (`$23E2F2` `movem`s
 *  D4/D7/A0 and touches neither D5 nor D0.) Emits 3/6 are entirely fresh again, which is what makes
 *  the gate-skipped path safe without any repair.
 *
 *  **THE TWO RAMPS ARE THE SAME RAMP BACKWARDS.** `$25E68E[i] == $25E480[15-i]` for all sixteen
 *  entries. `$25E480` is `$25E29E`'s sixteen-frame zoom IN (`$8000 + $800*i`); `$25E68E` is that run
 *  backwards, a zoom OUT. Both are indexed by the SAME `($60,A6)` in `{0, 4, ..., $3C}`, so on every
 *  frame emits 1 and 4 zoom out exactly as far as emits 3 and 6 zoom in.
 *
 *  **THE `nop` ASYMMETRY IS REAL.** `$25E520` and `$25E5FA` pad between emit 1/4's `lea` and its
 *  `adda.w`; emit 3/6's `lea` at `$25E59E`/`$25E67C` has no pad at all.
 *
 *  Reads: `($2,A6)`, `($40,A6)` x4, `($44,A6)` x4, `($4A,A6)` x2, `($50,A6)` x4 (emits 3/6 only),
 *  `($54,A6)`, `($60,A6)` x4, `$80390C`, `$803910`, all WORDS. **`$813098` and `($2C,A6)` are NOT
 *  touched** -- this is the only one of the eight with no `$813098` loop gate at all.
 *  Inherited: **A6 and D7**.
 *
 *  **IT HAS ITS CALLER NOW.** W373 shipped this "deliberately unwired": its only call site is
 *  `$25D814`, inside `$25D560` -- state 7's handler -- which was not ported, and it is NOT in
 *  either of this file's two confirm tails, so it was exported and left unreferenced rather than
 *  being given an invented caller. **W374 PORTED `$25D560`** as `phase7_25D560` (`objslot17.js`),
 *  where `$25D814` is `TAIL_25D560[2]` -- UNGATED, so it fires on BOTH records -- and `main.js`
 *  registers slot [17]. This routine runs on real frames.
 *
 *  **THE ORIGINAL WARNING STILL STANDS, FOR A NEW REASON: DO NOT ADD A CALL TO IT IN
 *  `confirmAndDraw`.** It was "the callee with no caller" then; it is "the callee with the OTHER
 *  caller" now. `$25D23A`/`$25D486` hold seven `jsr`s and `$25E4D0` is not among them, exactly as
 *  `$25D800..$25D839` holds seven and `$25EDF8` is not among THOSE. **NO CALL SITE ANYWHERE RUNS
 *  ALL EIGHT DRAWS** -- the two sets are seven each and differ by one call in each direction, and a
 *  brief that says "all eight" is wrong about the cartridge. Counted from the dump both times. */
export function draw25E4D0(ram, rom, ctx, a6, d7) {
  // $25E4D0 tst.w D7 -- a WORD test, so mask, the same reason `sideFromD7_25D4E4` and `draw25EF30`
  // do. `sideFromD7_25D4E4(d7)` IS this index: D7 != 0 -> 0 -> half A, D7 == 0 -> 1 -> half B.
  const side = u16(d7) !== 0 ? 0 : 1;                        // $25E4D2 beq.w $25E5B0 takes half B
  half25E4D0(ram, rom, ctx, a6, DRAW_25E4D0.halves[side], side);
  // $25E5AE / $25E68C nop -- the two pads, and the last bytes of the routine's extent.
}
