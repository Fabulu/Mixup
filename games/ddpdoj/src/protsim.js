// THE PROTECTION LATCH AT $500000 -- and it is on the ship's own draw path.
//
// WHY A PORT OF THE SHIP NEEDS THIS AT ALL.  `$24A54E`, the block that draws the
// ship's second attached record (the 1x32 colour-26 sprite the wave-9 attach
// report calls the "exhaust glow"), computes that record's LONG-AXIS coordinate
// by handing two numbers to the IGS027A latch and reading the sum back:
//
//   24a5b6: move.w D1,D0 / andi.l #$FFFF,D0
//   24a5be: move.l D0,-(A7) / move.l #$0,-(A7) / jsr $246D04   set slot 0 = D1
//   24a5d2: move.w ($2,A6),D0
//   24a5d6: move.l D0,-(A7) / move.l #$1,-(A7) / jsr $246D04   set slot 1 = posY
//   24a5e8: move.l #$1,-(A7) x2 / move.l #$0,-(A7) / jsr $246EA4    the SUM
//   24a604: move.l #$1,-(A7) / jsr $246CAC                     read slot 1
//   24a614: move.w D0,D1
//
// So the ship cannot be drawn without it.  There is no way to route around it
// that is not an invention.
//
// WHAT THE DEVICE IS, and the two things that are NOT the same claim:
//
//  (a) `NOTES-machine.md` §protection: on `ddpdojblk` MAME does NOT run the
//      ARM7 -- `pgm_arm_type1_sim` calls `set_disable()` and `init_ddp3`
//      installs a 40-line handler over `$500000..$500005` implementing five
//      commands: `$67` set-high-bits, `$E5` set-low-bits, `$40`
//      `slot[a] = slot[b] + slot[c]` (24-bit), `$8E` read-back, `$99` reset.
//      **A 32-entry 24-bit adder plus a region byte.**  So the oracle itself is
//      a simulation here, and this file is a port OF THAT SIMULATION.  It is
//      not, and must never be described as, a model of the silicon.
//  (b) INDEPENDENTLY MEASURED, on the board, wave 12: bucket 19's third record
//      over 1,117 drawn frames of `fly-around` has long-axis field
//      `((posY + $F880) & $FFFF) >> 6`, where `$F880` is the FIRST WORD of the
//      struct `$255A22[0] -> $255A2A` = `F880 FC00 0220`.  That is exactly
//      "slot1 := slot1 + slot0, then read slot1" for the call shape above, and
//      it is what pins the wrappers below.  Worked example, lf2000:
//      posY $1179 + $F880 = $109F9, `move.w D0,D1` keeps $09F9, `>> 6` = $27,
//      and the board's record reads $8027.  The ship's own record on the same
//      frame is $802D, six units in front.
//
// WHAT IS UNDER-DETERMINED, said out loud.  `$246EA4` packs its three arguments
// as `(arg3 << 10) | (arg2 << 5) | arg1` ($246EA8..$246EB8) and the whole corpus
// calls it with arg1=0, arg2=1, arg3=1.  The measurement pins the DESTINATION to
// slot 1 and the operands to slots 0 and 1 -- a naive reading of
// NOTES-machine.md's one-line summary (`slot[a] = slot[b] + slot[c]`, with `a`
// the first argument) would put the result in slot 0 and make `$246CAC(1)`
// return `posY` alone, which would place the record at long-axis $45 where the
// board puts it at $27.  So the mapping below is THE MEASUREMENT's, not the
// note's, and the note's summary is a paraphrase of MAME source this wave did
// not read.  What the measurement CANNOT separate, because arg2 == arg3: which
// of the two source fields is which.  A second call shape would settle it and no
// scenario in this corpus produces one.
//
// THE SLOTS ARE 24-BIT.  Not observable from the one measured call (the game
// keeps only `move.w D0,D1`, the low 16 bits), so the mask is here on the
// authority of (a) and is labelled as such.

import { unreached } from './unported.js';

export const PROT = {
  slots: 32,               // the command word's 5-bit fields
  mask: 0xffffff,          // 24-bit, per NOTES-machine.md's reading of MAME
  cmdSetHigh: 0x67,        // $246D30's first write pair
  cmdSetLow: 0xe5,
  cmdSum: 0x40,            // $246EA4
  cmdRead: 0x8e,           // $246CD C's `move.w #$8e,D1`
  latch: 0x500000,
};

/**
 * The 32-slot latch.  One per Game, held in the Game rather than in a module
 * global: a module-level accumulator is shared state between two replays and
 * `NOTES-replay.md` §2 forbids exactly that (state must derive from the initial
 * state and the input words and nothing else).
 */
export class ProtLatch {
  constructor() {
    // MEASURED: nothing in the corpus reads a slot the same frame's code has
    // not written, so the power-on contents are unobserved.  Zero is therefore
    // an ASSUMPTION and `readSlot` refuses to return one that was never set --
    // an unwritten slot is a path this wave never measured, not a zero.
    this.slot = new Int32Array(PROT.slots);
    this.written = new Uint8Array(PROT.slots);
  }

  /** `$246D04(index, value)` -- ($a,A6) = index, ($c,A6) = the longword. */
  setSlot(index, value) {
    this.#check(index, 0x246d04);
    this.slot[index] = (value >>> 0) & PROT.mask;   // $246D14 the high half
    this.written[index] = 1;                        // $246D72 ...and the low
  }

  /** `$246EA4(a, b, c)` -- ($a,A6)=a, ($e,A6)=b, ($12,A6)=c, packed at
   *  `$246EA8 move.w ($12,A6),D0 / lsl.w #$a / or (($e,A6) << 5) / or ($a,A6)`
   *  and issued as command $40.  See the header on which field is the dest. */
  sum(a, b, c) {
    for (const i of [a, b, c]) this.#check(i, 0x246ea4);
    if (!this.written[a] || !this.written[b]) {
      unreached(0x246ea4, `$246EA4 summed protection slots ${a} and ${b} and at `
        + `least one of them was never written by $246D04. Wave 12 measured only `
        + `the call shape (0,1,1) with both operands set in the same routine; a `
        + `run that reaches this has taken a path the corpus never did`);
    }
    // MEASURED (see the header): the destination is the THIRD argument -- the
    // one $246EAC shifts into bits 10..14 -- and the operands are the first two.
    this.slot[c] = (this.slot[a] + this.slot[b]) & PROT.mask;
    this.written[c] = 1;
  }

  /** `$246CAC(index)` -- command $8E, and `$246CFA andi.l #$FFFFFF,D0`. */
  readSlot(index) {
    this.#check(index, 0x246cac);
    if (!this.written[index]) {
      unreached(0x246cac, `$246CAC read protection slot ${index}, which nothing `
        + `has written. The port does not invent a power-on value for the `
        + `$500000 latch: NOTES-machine.md's reading of MAME's simulated handler `
        + `says nothing about its reset state and no scenario measured one`);
    }
    return this.slot[index] & PROT.mask;
  }

  #check(i, site) {
    if (!Number.isInteger(i) || i < 0 || i >= PROT.slots) {
      unreached(site, `protection slot ${i} is outside the 32 the command word's `
        + `5-bit fields can address`);
    }
  }
}
