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
//
// **W418 -- THIS IS THE CONTINUE SCREEN, AND HALF OF IT HAD NEVER RUN.** State 1's tail
// `$288B00..$288BAC` -- `menuArm` below -- returned at its first line for the whole life of this
// file, because that line tested `ctx.menuCarry28D53C`, a ctx field nothing in the tree writes.
// The nine-second countdown lives in there, so `$81B710` stayed at the `$2889CC` stamp of 9 and
// the screen could never time out. `src/continuescreen.js` is the panel those nine seconds are
// drawn on: `selectSet288598`/`selectAdvance2885C6` below post the index and `$288610` (the rank
// object's second callee) runs the body. See `menuArm`'s own note for the two faults on one line.

import { u16 } from './ram.js';
import { readInput23D186, menuCarry28D53C, coinChanged23C796 } from './tallyscreen.js';
import { announcePost } from './rank.js';
import { bgPause25FD82, clear24631C } from './stageend.js';
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
  // $2889CC writes ONE word literal into TWO byte fields: ($4,A5) = $09 and ($5,A5) = $3C.
  // **W418: BOTH halves are read back out.** `($4,A5)` is the CONTINUE panel's seconds digit and
  // `($5,A5)` is its frame tick, and `$288B3C subq.b #1,($5,A5)` / `$288B4A subq.b #1,($4,A5)` are
  // the nine-second countdown. The note that used to sit here said only the high byte was read;
  // that was true of the port because the arm those two live in had never run, not of the ROM.
  markValue: 0x093c,
  frameTick: 0x05,        // ($5,A5) -- $288B3C's byte, reloaded from $288B44's #$3C
  tickReload: 0x3c,       // $288B44 move.b #$3C,($5,A5) -- markValue's own LOW byte
  markSinkA: 0x81b710,    // $288B98 move.b D0,$81B710 -- ABSOLUTE, side A's block, either side
  inputMask: 0x70, requestArg: 0x08,
  // W389 -- `$241292 lea ($4C,A5),A0`. The object's ID LONG, and `queueKill`'s real argument.
  idAt: 0x4c,
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

/**
 * `$288B00..$288BAC` -- the MENU arm, **all of it**.
 *
 * **W418: THIS FUNCTION HAD NEVER RUN A SINGLE INSTRUCTION, AND ITS FIRST LINE WAS BACKWARDS.**
 * Two independent faults on one line:
 *
 *  1. `ctx.menuCarry28D53C` **has no writer anywhere in the tree.** `main.js` builds the ctx and
 *     never sets that field, so `ctx.menuCarry28D53C?.(ram)` was `undefined` on every call for the
 *     whole life of this file, `!undefined` is `true`, and the function returned at line one.
 *     Every instruction below it was dead. `continuescreen.js` imports the real helper from
 *     `tallyscreen.js`; so does this file now.
 *  2. **`$288B06` is `65 00 00 A4` -- `bcs $288BAC`, and `$288BAC` is the `rts`.** Carry SET is
 *     "the menu is busy, abandon", exactly as `tallyscreen.js:916` and `objslot8.js` already read
 *     the same `$28D53C` result. The port's `if (!carry) return` was the inverse of that.
 *
 * WHAT WAS MISSING BELOW THEM IS THE CONTINUE COUNTDOWN. `$288B14 beq` and `$288B1E bcc` are NOT
 * returns -- they branch to `$288B3C` and `$288B36`, the frame tick and its reset -- and
 * `$288B3C`/`$288B4A` are the nine-second countdown whose digit `continuescreen.js` entry 3 draws.
 * With this arm dead, `$81B710` stayed at the `$2889CC` stamp of 9 forever: measured over a full
 * boot, `hold=shot` sat on `mark=9` for all 1,337 recorded state changes of the panel and the
 * `$28C6AC` cue never fired once. The panel could never time out, so the six playgate holds ran
 * 30,000 frames "clean" -- **a green produced by a stall, which is the shape trap 21 is about.**
 *
 * THE TWO `bge`s ARE `$6C`, SIGNED, AND ON BYTES. `subq.b #1` on 0 gives `$FF`, which is negative
 * as an int8 and is the borrow that reloads. Reading them as `bcc` (`$64`) would have been the
 * same answer here only because neither counter ever passes `$80`, so the distinction is asserted
 * from the opcode byte rather than from behaviour.
 */
function menuArm(ram, rom, a5, ctx, desc) {
  if (menuCarry28D53C(ram)) return;                          // $288B00 jsr / $288B06 bcs $288BAC
  const d0 = readInput23D186(ram,                            // $288B0A movea.l ($C,A4),A0 / jsr (A0)
    rom.u32(desc + SCREEN13.dEdge) === 0x23d186 ? 0 : 1);
  if ((d0 & SCREEN13.inputMask) !== 0) {                     // $288B10 andi.w #$70 / beq $288B3C
    if (runGate25FE00(ram)) {                                // $288B18 jsr $25FE00 / bcc $288B36
      armRequest25FF38(ram, ram.u8(a5 + SCREEN13.side),      // $288B22 moveq #0 / $288B24 move.b
        SCREEN13.requestArg);                                // $288B28 move.w #$8,D1 / $288B2C
    } else {
      // $288B36 -- pressing the button with the run gate CLOSED restarts the frame tick rather
      // than doing nothing. It is the only writer of ($5,A5) other than the stamp and the reload.
      ram.setU8(a5 + SCREEN13.frameTick, 0);                 // $288B36 move.b #$0,($5,A5)
    }
  }
  // $288B3C -- THE NINE-SECOND COUNTDOWN, frame tick then seconds.
  const tick = (ram.u8(a5 + SCREEN13.frameTick) - 1) & 0xff; // $288B3C subq.b #1,($5,A5)
  ram.setU8(a5 + SCREEN13.frameTick, tick);
  if (((tick << 24) >> 24) < 0) {                            // $288B40 bge.w $288B76 -- $6C, SIGNED
    ram.setU8(a5 + SCREEN13.frameTick, SCREEN13.tickReload); // $288B44 move.b #$3C,($5,A5)
    const secs = (ram.u8(a5 + SCREEN13.mark) - 1) & 0xff;    // $288B4A subq.b #1,($4,A5)
    ram.setU8(a5 + SCREEN13.mark, secs);
    if (((secs << 24) >> 24) < 0) {                          // $288B4E bge.w $288B76
      exitArm(ram, rom, a5, ctx, desc);                      // falls into $288B52
      return;
    }
  }
  // $288B76 -- the tail. A coin inserted during the countdown RESTARTS it, and the seconds digit
  // is republished into the panel's own record.
  if (coinChanged23C796(ram, ram.u8(a5 + SCREEN13.side))) {  // $288B76/$288B7C / $288B82 bcc
    stampMark2889CC(ram, rom, a5);                           // $288B86 bsr $2889CC
  }
  if (runGate25FE00(ram)) {                                  // $288B8A jsr $25FE00 / bcc $288BA2
    // $288B94/$288B98 -- ABSOLUTE $81B710. Side 1 running with the gate open writes side 0's
    // block, the same cross-side shape `selectAdvance2885C6` documents at $2885FA. NOT ($10,A4).
    ram.setU8(SCREEN13.markSinkA, ram.u8(a5 + SCREEN13.mark));
    return;
  }
  // $288BA2 -- gate closed: through the DESCRIPTOR's own RAM pointer, so this one IS per-side.
  ram.setU8(rom.u32(desc + SCREEN13.dRam), ram.u8(a5 + SCREEN13.mark)); // $288BA2..$288BAA
}

/** `$288B52` -- the EXIT arm, taken by both closed gates AND by the countdown running out. It runs
 *  the descriptor's FIRST code pointer and then **branches into another state's body in the same
 *  frame**: `$288B68 bra $288A3C` is state 4 and `$288B72 bra $288A22` is state 3's head, which
 *  itself falls into state 2. W418 wires both; before this wave the arm set the state byte and
 *  returned, deferring the body by one frame. */
function exitArm(ram, rom, a5, ctx, desc) {
  ctx.unported?.note(rom.u32(desc + SCREEN13.dEntry),
    `$288B52 movea.l ($4,A4),A0 / jsr (A0) -- the descriptor's FIRST code pointer, $23C97A for `
    + `side 0 and $23C984 for side 1. Unported, and it is the only one of the three this port has `
    + `no name for`);
  if (!runGate25FE00(ram)) {                                 // $288B58 jsr $25FE00 / $288B5E bcc
    ram.setU8(a5 + SCREEN13.state, 3);                       // $288B6C
    // $288B72 bra $288A22 -- state 3's head, THIS frame: set state 2, stamp, fall into state 2.
    ram.setU8(a5 + SCREEN13.state, 2);                       // $288A22
    stampMark2889CC(ram, rom, a5);                           // $288A28 bsr $2889CC
    state2(ram, a5);                                         // falls through to $288A2A
    return;
  }
  ram.setU8(a5 + SCREEN13.state, 4);                         // $288B62
  state4(ram, rom, ctx);                                     // $288B68 bra $288A3C -- THIS frame
}

/** `$288A2A` -- STATE 2. Two instructions and a tail kill.
 *
 *  **W389 -- THE ARGUMENT WAS THE TYPE WORD, AND THE KILL DID NOTHING.** The same defect W388
 *  fixed in `objslot14.js`, verified again from the image this wave:
 *
 *      288A34  4ef9 00241292   jmp $241292
 *      241292  41ed 004c       lea ($4C,A5),A0     <- the ID field, NOT ($0,A5)
 *      241296  60a0            bra $241238
 *      241252  2290            move.l (A0),(A1)    <- the queue takes the LONG THROUGH A0
 *
 *  `killById` then compares `u16(id)` against `u16(($4C,slot))`. With the type word `$800D`
 *  queued it compared `$800D` against an id like `$0001`, never matched, and the type-$D screen
 *  object stayed live in the twenty-slot table for the rest of the run -- accepted silently,
 *  because `queueKill` returns OK for anything that fits in the queue. */
function state2(ram, a5) {
  selectAdvance2885C6(ram, ram.u8(a5 + SCREEN13.side));      // $288A2A/$288A30 bsr $2885C6
  queueKill(ram, ram.u32(a5 + SCREEN13.idAt));               // $288A34 JMP $241292 -- a TAIL kill
}

/** `$288A3C` -- STATE 4. Hand over to slot [14] and die.
 *
 *  **W425 (D58): `$28C170` IS A REAL POST HERE AGAIN -- THE GAME-OVER BGM CUE.** The two earlier
 *  readings were each half right and the difference is worth keeping. `$28C170` has no row in
 *  `sound.js`'s `WRAPPERS` and STILL must not be given one -- it loads D0/D1 and calls `$28BBAC`,
 *  a DIFFERENT packer from the `$28BB04` every `WRAPPERS` row describes. But "no row" never meant
 *  "no post": W423 built the `$28BBAC` tier its own path (`postBgmCommand`) and W425 made
 *  `postWrapper` dispatch to it, so `ctx.soundPost?.(0x28c170)` enqueues $15000000 and invents
 *  nothing. There is NO GATE on that path -- `$28BBAC` branches straight to the ring enqueue.
 *
 *  Before that path existed this line was a LIVE CRASH, and W385 measured it rather than guessing:
 *  once the player object exists, a cold-boot run with no input loses its last life at frame
 *  +4,075 past START; `$25FFA8`'s borrow arms bonus-line request 2, `$260056` creates this object,
 *  and its state 4 ran this line on frame +4,079 and killed the run. W385 made it a counted note,
 *  which stopped the crash and left the game over silent. This wave is the other half.
 *
 *  **`$28C0FC` ON THE NEXT LINE IS THE GLOBAL IMMEDIATE-SFX RELEASE.** W567 proved
 *  that this preserving entry needs no inherited id, pan, or channel: its no-tail
 *  type-`$10` post is always `$10000000`, and `sound.js` deliberately dispatches
 *  the address with zeroed fields. The cartridge places it between the game-over
 *  BGM stop and the object-table reset so looping voices owned by objects about to
 *  be destroyed cannot survive forever:
 *
 *      288A3C  4eb9 0028C170     jsr $28C170
 *      288A42  4eb9 0028C0FC     jsr $28C0FC
 *      288A48  4eb9 0024631C     jsr $24631C
 *      288A4E  4eb9 0024107C     jsr $24107C
 */
function state4(ram, rom, ctx) {
  // The cartridge posts both stops before destroying the objects whose own
  // selector-specific stop calls can no longer run after $24107C.
  ctx.soundPost?.(0x28c170);                                 // $288A3C jsr $28C170
  ctx.soundPost?.(0x28c0fc);                                 // $288A42 jsr $28C0FC
  clear24631C(ram);                                          // $288A48
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
