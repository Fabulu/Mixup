// OBJECT DISPATCH [13], `$288A60` -- the second front-end slot this port has written. W373.
//
// IT IS THE SAME DESCRIPTOR FAMILY AS SLOT [11]. Two per-side records in ROM at `$28898A` and
// `$28899E`, chosen by `($7,A5)`, each holding three code pointers and a RAM block:
//
//     ($0,A4)  $0036 $0001 / $0036 $000F     two words, not a long
//     ($4,A4)  $23C97A / $23C984             UNPORTED
//     ($8,A4)  $23D16C / $23D17E             the RAW input read
//     ($C,A4)  $23D186 / $23D18E             the EDGE input read -- readInput23D186
//     ($10,A4) $81B710 / $81B726             this side's RAM block
//
// `tallyscreen.js` documents the identical arrangement for `$25D952`/`$25D96C`, so the port already
// had the shape and only the addresses were new.
//
// FIVE STATES ON `($2,A5)`, and THREE OF THEM SIT BELOW THE DISPATCH ADDRESS -- `$288A60` branches
// backward to `$2889DE`, `$288A2A`, `$288A22` and `$288A3C`. Fifth time this port has hit that, and
// measuring forward from the table entry gets the span wrong every time.
//
// IT CHAINS. State 4 stages dispatch type `$E`, which is slot [14], and slot [14] stages type `$C`.
// The front end is a chain of screens handing over through `$241182`, not a set of peers.

import { u16 } from './ram.js';
import { readInput23D186 } from './tallyscreen.js';
import { announcePost } from './rank.js';
import { bgPause25FD82 } from './stageend.js';
import { armRequest25FF38 } from './player.js';
import { stageCreate, queueKill, objTableInit24107C } from './objalloc.js';

export const SCREEN13 = Object.freeze({
  entry: 0x288a60, start: 0x2889cc, dispatch: 0x240f62,
  descA: 0x28898a, descB: 0x28899e, descSize: 0x14,
  // the descriptor's own fields
  dRaw: 0x08, dEdge: 0x0c, dEntry: 0x04, dRam: 0x10,
  // the object record's fields
  state: 0x02, latch: 0x03, mark: 0x04, side: 0x07, desc: 0x08, arm: 0x14,
  // $288598/$2885C6's two six-byte selection blocks, one per side.
  selA: 0x81b706, selB: 0x81b71c,
  gateA: 0x813098, gateB: 0x813092, gateBValue: 0x04, dip: 0x803809,
  childType: 0x0e, announceSite: 0x260a88,
  // $2889CC writes ONE word literal into TWO byte fields: ($4,A5) = $09 and ($5,A5) = $3C. Only the
  // high byte is read back out, which is why both halves are named.
  markValue: 0x093c,
  inputMask: 0x70, requestArg: 0x08,
});

/** `$25FE00` -- IS THE SCREEN ALLOWED TO RUN? Twenty-eight bytes and a carry-flag answer:
 *  `ori.w #$1,SR` at `$25FE16` is true, `andi.w #$FFFE,SR` at `$25FE1C` is false.
 *
 *  BOTH conditions must hold, and the second is an equality against `$FFFF` rather than a
 *  non-zero test -- `cmpi.w #$FFFF,$81308E`. Any other value, including zero, closes it.
 */
export function runGate25FE00(ram) {
  if (ram.u16(0x813142) !== 0) return false;                 // $25FE00 tst.w / bne $25FE1C
  if (ram.u16(0x81308e) !== 0xffff) return false;            // $25FE0A cmpi.w #$FFFF / bne
  return true;                                               // $25FE16 ori.w #$1,SR
}

/** `$288598` -- SET THIS SIDE'S SELECTION, and only when it CHANGES.
 *
 *  Six bytes per side: `[0]` the selection, `[2]` cleared on every change, `[4]` the side. The
 *  `cmp.w (A4),D0 / beq` means a repeated selection writes nothing at all, so `[2]` survives -- it
 *  is a "this is new" flag and clearing it unconditionally would destroy that.
 */
export function selectSet288598(ram, d0, d1) {
  const a4 = u16(d1) === 0 ? SCREEN13.selA : SCREEN13.selB;  // $28859C/$2885A8 tst.w D1 / beq
  if (ram.u16(a4) === u16(d0)) return;                       // $2885AE cmp.w (A4),D0 / beq
  ram.setU16(a4, u16(d0));                                   // $2885B4 move.w D0,(A4)
  ram.setU16(a4 + 2, 0);                                     // $2885B6
  ram.setU16(a4 + 4, u16(d1));                               // $2885BC
}

/** `$2885C6` -- ADVANCE this side's selection. `$288598`'s sibling over the same six-byte blocks,
 *  and NOT the same routine: it writes a value it computes, `1 -> 2` and anything else `-> 4`.
 *
 *  TWO THINGS IN ITS CONTROL FLOW THAT A TIDY REWRITE LOSES:
 *
 *   1. WHEN `$81B706` HOLDS 3 AND THE SIDE IS NON-ZERO, THE BRANCH JUMPS PAST THE `lea`. A4 is
 *      still SIDE 0's block at `$2885FA`, so a side-1 call writes side 0's record. That is a real
 *      cross-side write, not a mistake to tidy away.
 *   2. AN EMPTY BLOCK DOES NOTHING. `$2885EA beq` returns on a zero selection without writing, so
 *      this cannot start a sequence -- only `$288598` can.
 */
export function selectAdvance2885C6(ram, d1) {
  let a4 = SCREEN13.selA;                                    // $2885CA lea $81B706,A4
  if (u16(d1) !== 0) {                                       // $2885D0 tst.w D1 / beq $2885E8
    if (ram.u16(SCREEN13.selA) === 3) {                      // $2885D6 cmpi.w #$3,$81B706 / beq
      ram.setU16(a4, 4);                                     // $2885FA -- A4 STILL side 0's block
      ram.setU16(a4 + 2, 0);                                 // $288600
      ram.setU16(a4 + 4, u16(d1));                           // $288606
      return;
    }
    a4 = SCREEN13.selB;                                      // $2885E2 lea $81B71C,A4
  }
  const d0 = ram.u16(a4);                                    // $2885E8 move.w (A4),D0
  if (d0 === 0) return;                                      // $2885EA beq -- empty, no write at all
  ram.setU16(a4, d0 === 1 ? 2 : 4);                          // $2885EE/$2885F2/$2885FA/$2885FE
  ram.setU16(a4 + 2, 0);                                     // $288600
  ram.setU16(a4 + 4, u16(d1));                               // $288606
}

/** `$2889CC` -- STAMP THE MARK. Reached by `bra` from state 0 and by `bsr` from state 3.
 *
 *  ON THE STATE-3 PATH A4 IS STALE: the dispatcher loads it from `($8,A5)` only after the state-3
 *  test has already branched away. In practice that is the same descriptor, because state 0 wrote
 *  it into `($8,A5)` and every state-1 frame reloads it -- so the port reads `($8,A5)`, which is
 *  what A4 holds whenever this is reached with A4 live, and is defined on the path where it is not.
 */
function stampMark2889CC(ram, rom, a5) {
  ram.setU16(a5 + SCREEN13.mark, SCREEN13.markValue);        // $2889CC -- $09 then $3C, two bytes
  const a0 = rom.u32(ram.u32(a5 + SCREEN13.desc) + SCREEN13.dRam);   // $2889D2 movea.l ($10,A4),A0
  ram.setU8(a0, ram.u8(a5 + SCREEN13.mark));                 // $2889D6/$2889DA -- the HIGH byte, $09
}

/** `$2889DE` -- STATE 0. Pick the side's descriptor, announce, and run the side's own opener. */
function state0(ram, rom, a5, ctx) {
  ram.setU8(a5 + SCREEN13.state, 1);                         // $2889DE
  const side = ram.u8(a5 + SCREEN13.side);
  const desc = side === 0 ? SCREEN13.descA : SCREEN13.descB; // $2889E4 lea / $2889E8 tst.b / $2889F0
  ram.setU32(a5 + SCREEN13.desc, desc);                      // $2889F4 move.l A4,($8,A5)
  ram.setU16(a5 + SCREEN13.arm, 1);                          // $2889F8
  announcePost(ram, SCREEN13.announceSite, side);            // $2889FE/$288A02 jsr $260A88

  // $288A08 -- and the OPENER is a per-side PAIR, $287B0E and $287B54, not one routine with an
  // argument. Both are unread; each clears $817F82 and tails into the $27F8C4 family.
  ctx.unported?.note(side === 0 ? 0x287b0e : 0x287b54,
    `$${(side === 0 ? 0x288a10 : 0x288a1a).toString(16).toUpperCase()} jsr $${
      (side === 0 ? 0x287b0e : 0x287b54).toString(16).toUpperCase()} -- slot [13]'s per-side opener. `
    + `$287B0E sets D0=$D4/D2=7/D3=7 and tests $8130F9 bit 0 and $81B61E bit 4; its sibling is the `
    + `same routine on the other side's words`);

  stampMark2889CC(ram, rom, a5);                             // $288A16/$288A20 bra $2889CC
}

/** The fall-through arm -- STATE 1, the only one that reads input. */
function state1(ram, rom, a5, ctx) {
  const desc = ram.u32(a5 + SCREEN13.desc);                  // $288A80 movea.l ($8,A5),A4

  // $288A84 -- THREE gates, and they do not agree on what "closed" means: the first is a non-zero
  // test that OPENS the second, the second is an equality against $4, the third is an equality
  // against zero on an operator DIP. Only the third being non-zero lets the screen run.
  if (ram.u16(SCREEN13.gateA) !== 0                          // $288A84 tst.w $813098 / beq
      && ram.u16(SCREEN13.gateB) === SCREEN13.gateBValue) {  // $288A8E cmpi.w #$4,$813092 / beq
    return exitArm(ram, rom, a5, ctx, desc);                 // $288A96 -> $288B52
  }
  if (ram.u8(SCREEN13.dip) === 0) {                          // $288A9A cmpi.b #$0,$803809 / beq
    return exitArm(ram, rom, a5, ctx, desc);                 // $288AA2 -> $288B52
  }

  if (!runGate25FE00(ram)) {                                 // $288AA6 jsr $25FE00 / $288AAC bcc
    // $288ADA -- the gate CLOSED arm, and it is not a no-op: it releases the latch and re-selects.
    if (ram.u8(a5 + SCREEN13.latch) === 0) {                 // $288ADA tst.b ($3,A5) / beq
      selectSet288598(ram, 1, ram.u8(a5 + SCREEN13.side));   // $288AF4 moveq #1 / $288AFC bsr
      return;
    }
    ram.setU8(a5 + SCREEN13.latch, 0);                       // $288AE2 clr.b ($3,A5)
    // $288AEC bsr $2885C6 -- the ADVANCE, not $288598. The two displacements differ by $3E and the
    // routines do different things; taking the near one here would re-SET the selection to 0.
    selectAdvance2885C6(ram, ram.u8(a5 + SCREEN13.side));    // $288AE6/$288AEC
    stampMark2889CC(ram, rom, a5);                           // $288AF0 bsr $2889CC
    return;
  }

  // $288AB0 -- the latch is set ONCE, on the first frame the gate opens.
  if (ram.u8(a5 + SCREEN13.latch) === 0) {                   // $288AB0 tst.b ($3,A5) / bne
    ram.setU8(a5 + SCREEN13.latch, 1);                       // $288AB8
    ctx.unported?.note(0x27f8e6, '$288ABE jsr $27F8E6 -- clr.w $817F82 then bra $27F8C4, the bee '
      + 'cursor reset. Two instructions here, but $27F8C4 is unread');
    stampMark2889CC(ram, rom, a5);                           // $288AC4 bsr $2889CC
  }
  selectSet288598(ram, 3, 0);                                // $288AC8 moveq #3 / $288ACA moveq #0
  bgPause25FD82(ram);                                        // $288AD0 jsr $25FD82
  menuArm(ram, rom, a5, ctx, desc);                          // $288AD6 bra $288B00
}

/** `$288B00` -- the MENU arm: carry test, the descriptor's edge read, then a request. */
function menuArm(ram, rom, a5, ctx, desc) {
  if (!ctx.menuCarry28D53C?.(ram)) return;                   // $288B00 jsr $28D53C / $288B06 bcs
  const d0 = readInput23D186(ram,                            // $288B0A movea.l ($C,A4),A0 / jsr (A0)
    rom.u32(desc + SCREEN13.dEdge) === 0x23d186 ? 0 : 1);
  if ((d0 & SCREEN13.inputMask) === 0) return;               // $288B10 andi.w #$70 / beq
  if (!runGate25FE00(ram)) return;                           // $288B18 jsr $25FE00 / $288B1E bcc
  armRequest25FF38(ram, ram.u8(a5 + SCREEN13.side),          // $288B22 moveq #0 / $288B24 move.b
    SCREEN13.requestArg);                                    // $288B28 move.w #$8,D1 / $288B2C
}

/** `$288B52` -- the EXIT arm, taken by both closed gates. It runs the descriptor's FIRST code
 *  pointer and, if the run gate is open, advances to state 4. */
function exitArm(ram, rom, a5, ctx, desc) {
  ctx.unported?.note(rom.u32(desc + SCREEN13.dEntry),
    `$288B52 movea.l ($4,A4),A0 / jsr (A0) -- the descriptor's FIRST code pointer, $23C97A for `
    + `side 0 and $23C984 for side 1. Unported, and it is the only one of the three this port has `
    + `no name for`);
  if (!runGate25FE00(ram)) {                                 // $288B58 jsr $25FE00 / $288B5E bcc
    ram.setU8(a5 + SCREEN13.state, 3);                       // $288B6C -- via $288B68's bra
    return;
  }
  ram.setU8(a5 + SCREEN13.state, 4);                         // $288B62
}

/** `$288A2A` -- STATE 2. Two instructions and a tail kill. */
function state2(ram, a5) {
  selectAdvance2885C6(ram, ram.u8(a5 + SCREEN13.side));      // $288A2A/$288A30 bsr $2885C6
  queueKill(ram, ram.u16(a5 + 0x00));                        // $288A34 JMP $241292 -- a TAIL kill
}

/** `$288A3C` -- STATE 4. Hand over to slot [14] and die. */
function state4(ram, rom, ctx) {
  ctx.soundPost?.(0x28c170);                                 // $288A3C
  ctx.soundPost?.(0x28c0fc);                                 // $288A42
  ctx.clear24631C?.(ram);                                    // $288A48
  // $288A4E jsr $24107C -- UNCONDITIONAL, four back-to-back `4EB9`s from $288A3C
  // with nothing between them.  It destroys ALL TWENTY object slots (including
  // this one) and resets the ID counter and both queue cursors, which is why the
  // create below has to come AFTER it: $24107C clears `createSp`.
  objTableInit24107C(ram);
  // $288A54 move.w #$E,D0 / $288A58 JMP $241182 -- a TAIL create of dispatch type $E, which is slot
  // [14]. $241182 takes the priority from the DISPATCH TABLE; a bare 0 type-errors here.
  stageCreate(ram, SCREEN13.childType,
    (t) => rom.u16(SCREEN13.dispatch + t * 8 + 4));
}

/** `$288A60` -- THE DISPATCH ENTRY. State 1 is the fall-through; every other arm is BELOW it. */
export function objSlot13(ram, rom, a5, ctx) {
  const st = ram.u8(a5 + SCREEN13.state);
  if (st === 0) { state0(ram, rom, a5, ctx); return; }       // $288A60 tst.b / beq $2889DE
  if (st === 2) { state2(ram, a5); return; }            // $288A68 cmpi.b #$2 / beq $288A2A
  if (st === 3) {                                            // $288A70 cmpi.b #$3 / beq $288A22
    // $288A22 sets state 2, stamps, and then FALLS INTO state 2's body in the same frame.
    ram.setU8(a5 + SCREEN13.state, 2);                       // $288A22
    stampMark2889CC(ram, rom, a5);                           // $288A28 bsr $2889CC
    state2(ram, a5);                                         // falls through to $288A2A
    return;
  }
  if (st === 4) { state4(ram, rom, ctx); return; }           // $288A78 cmpi.b #$4 / beq $288A3C
  state1(ram, rom, a5, ctx);
}
