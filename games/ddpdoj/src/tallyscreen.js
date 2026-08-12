// OBJECT DISPATCH [11], `$25DBB4` -- THE STAGE-CLEAR SCREEN.
//
// W270 recon'd this as "one small routine away from transcribable" and named
// `$2600D8` as the routine. W273 landed `$2600D8`, W274 closed its last gap, and
// the object was still not one routine away: W276's own recon found six more
// unported dependencies in state 1 alone, and `$25DD0C` onward turned out to be a
// MENU CURSOR. So `[11]` is a screen with the score tally inside it, which is why it
// is 900 counted notes a run.
//
// This wave lands the TALLY PATH end to end and leaves state 1's gates counted:
//
//   $25DBB4  the dispatcher, on ($2,A5)     <- here
//     state 0  $25DB30  pick a descriptor, print the header, post state 0, arm  <- here
//     state 1  $25DBB4's fall-through, six unported dependencies      <- COUNTED
//     state 2  $25DB7C  read the two cursors, call $2600D8, self-kill  <- here
//
// which means the score tally now RUNS: state 0 arms, and state 2 is the call the
// owner's "maybe even score totalling, which I see none of" was about.
//
// ===========================================================================
// THE RECORD
// ===========================================================================
//   +$02  b   THE STATE. 0 -> $25DB30, 2 -> $25DB7C, anything else -> state 1
//   +$07  b   THE SIDE, and it picks the descriptor, the header and the row block
//   +$08  l   the descriptor pointer state 0 chose
//   +$0c  b   state 1's phase, cleared by state 0
//   +$0e  b   the x cursor, indexed into `$25D986` -- two entries
//   +$0f  b   the y cursor, indexed into `$25D98A` -- three entries
//   +$12  w   armed to $4B0 by state 0
//   +$14  w   armed to $4 by state 0
//   +$4c  l   the object id, for the self-kill
//
// ===========================================================================
// THE DESCRIPTOR, and its three longs are CODE
// ===========================================================================
// 26 bytes, and reading BOTH of them gives the shape: w, w, l, l, l, l, w, w, w.
// `$25D952`'s three code pointers are `$23D16C`, `$23D186` and `$23C98E`; `$25D96C`'s
// are `$23D17E`, `$23D18E` and `$23C9F0`. State 1 calls through `($4,A4)`, `($8,A4)`
// and `($c,A4)`; **state 2 uses none of them**, which is why the tally path can land
// without any of the six.

import { u16, u32 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueRegisters } from './spritequeue.js';
import { RAM } from './machine.js';
import { queueKill } from './objalloc.js';
import { txPrint240DC2, txPrint240E1A, HUDRAM } from './hud.js';
import { announcePost, announceChoose260ACA } from './rank.js';
import { tally2600D8, TALLY } from './tally.js';

/** `$24018C`'s bucket: `lea $80AD14,A0 / adda.w $80AFEE,A0` is `BUCKETS[26]`, ten records of
 *  twelve. Declared in `spritequeue.js` since W30 and unused by anything until W328. */
const TALLY_BUCKET = 26;

/** `$25DE8A` -- the cursor highlight's two ROW OFFSETS, as words. [M] `0000 0600`, and the $600
 *  matches the step between the two labels, which is what puts the highlight on a label row. */
const TALLY_CURSOR_ROWS = Object.freeze([0x0000, 0x0600]);
/** `$25DFF0` -- the Y draw's THREE row offsets, as words. [M] `0000 0600 0C00`, the same $600
 *  step as the X pair with one more row, because the Y cursor has three entries. */
const TALLY_Y_ROWS = Object.freeze([0x0000, 0x0600, 0x0c00]);

/** `$25DFF0` indexed by an entry number DOUBLED, and the table is THREE words. The ROM does not
 *  range-check it, and it cannot be masked: `$25DFD6 add.w (A2),D1` with an entry of `$FF` would
 *  read `$25DFF0 + $1FE`, far past the table, and add whatever is there to a sprite position.
 *
 *  **THE ROM RELIES ON THE SENTINEL NEVER REACHING HERE.** `$25DAC2` answers `$FFFF` when attract
 *  is off, and `$25DFC6 bmi` catches exactly that -- but the "nothing saved" byte `$FF` is NOT
 *  caught, because `move.b ($1,A0),D0` writes only D0's low byte and the caller had just masked D0
 *  to 0..3 for the blink phase, so `tst.w D0` sees `$00FF` and reads POSITIVE. So a saved-selection
 *  byte of `$FF` with attract LIVE would overrun, and the port refuses rather than inventing a row. */
function yRow(entry, site) {
  if (entry >= TALLY_Y_ROWS.length) {
    unreached(site, `$${site.toString(16).toUpperCase()} indexes $25DFF0 with entry $${
      entry.toString(16).toUpperCase()}, and the table is THREE words (0000 0600 0C00). The ROM does `
      + `not range-check this: entry * 2 would read past it and add whatever is there to a sprite `
      + `position. $25DFC6's \`bmi\` only catches $25DAC2's attract-off $FFFF, NOT the "nothing `
      + `saved" byte $FF, because move.b leaves D0's high bits alone and the caller had masked them `
      + `to 0..3. Reaching here means a saved-selection byte was $FF while $81308C was live, which `
      + `is a state the board is relying on not to happen`);
  }
  return TALLY_Y_ROWS[entry];
}
/** `$25DE8E` (side 0) and `$25DE9E` (side 1) -- the highlight's FOUR blink descriptors each,
 *  ascending by `$4C`. [M] read from the image. */
const TALLY_BLINK_S0 = Object.freeze([0x00333fc4, 0x00334010, 0x0033405c, 0x003340a8]);
const TALLY_BLINK_S1 = Object.freeze([0x003340f4, 0x00334140, 0x0033418c, 0x003341d8]);

export const SCREEN11 = Object.freeze({
  entry: 0x25dbb4,
  descA: 0x25d952,              // $25DB36 lea ($25D952,PC),A4
  descB: 0x25d96c,              // $25DB40 -- taken when ($7,A5) != 0
  xTable: 0x25d986,             // $25DB88, two entries ($25DD42 andi.b #$1)
  yTable: 0x25d98a,             // $25DB98, three entries
  xEntries: 2,
  yEntries: 3,
  // the record's own fields
  state: 0x02, side: 0x07, desc: 0x08, phase: 0x0c,
  xCur: 0x0e, yCur: 0x0f, armA: 0x12, armB: 0x14, id: 0x4c,
  // the two globals state 1's gates read, ported here because they are two and nine
  // instructions and every other caller of them will want them too
  carryWord: 0x81df20,          // $28D53C tst.w
  dipConfig: 0x803808,          // $23C932 move.b
  dipA: 0x80395a, dipB: 0x803960,
  // W278: the two SAVED-SELECTION records. `$25D990 move.b #$FF,$813008` -- the
  // instruction that pins the data window -- writes the "nothing saved" sentinel
  // into savedA, and `($1,A0)` is the selected entry beside it.
  savedA: 0x813008, savedB: 0x813018,
});

/**
 * `$28D53C` -- SET THE CARRY FROM `$81DF20`.
 *
 *   tst.w $81DF20 / beq $28D54C
 *   ori  #$1,SR      -> carry SET      (non-zero)
 *   andi #$FFFE,SR   -> carry CLEAR    (zero)
 *
 * Six instructions whose entire product is the C flag, so in JS it is a boolean and
 * the caller's `bcs` is an `if`. Exported because state 1 reads it twice and
 * `$25DFF6` reads it again.
 */
export function menuCarry28D53C(ram) {
  return ram.u16(SCREEN11.carryWord) !== 0;
}

/**
 * `$23C932` -- the two menu DIP bytes, or zeroes.
 *
 *   move.b $803808,D0 / cmpi.b #$12,D0 / bne $23C944
 *   moveq #0,D0 / moveq #0,D1 / rts            <- config $12 answers (0, 0)
 *   $23C944: D0 = $80395A, D1 = $803960        <- BOTH ZERO-EXTENDED BYTES
 *
 * `moveq #$0,Dn` before each `move.b` is what makes them zero-extended rather than
 * sign-extended, so this is NOT W270's signed-byte trap -- and the `cmpi.b #$12` is
 * an equality, so its sign never comes up either.
 */
export function menuDips23C932(ram) {
  if (ram.u8(SCREEN11.dipConfig) === 0x12) return [0, 0];   // $23C938 cmpi.b / beq
  return [ram.u8(SCREEN11.dipA), ram.u8(SCREEN11.dipB)];    // $23C948 / $23C94E
}

// `$2533F6` (side 0) and `$253448` (side 1) -- THE SCREEN'S HEADER, and the second is
// not a mirror of the first: it walks UPWARD.
//
//   $2533F6  D1 = $0000   first step +$100   loop step +$200   header $02D8000A
//   $253448  D1 = $1B00   first step -$200   loop step -$200   header $02D8008A
//
// **`move.w #$100,D7` / `move.w #$FE00,D7` before the `jsr $240E1A` IS DEAD.**
// `$240E44 move.w D3,D7` overwrites it at entry, so the caller's value never reaches
// anything; both routines then load `moveq #$5,D7` for the `dbra` that follows. The
// port does not model the dead write, and this comment is why.
const HEADER = Object.freeze([
  Object.freeze({ site: 0x2533f6, d1: 0x0000, first: 0x0100, step: 0x0200, top: 0x02d8000a }),
  Object.freeze({ site: 0x253448, d1: 0x1b00, first: -0x0200, step: -0x0200, top: 0x02d8008a }),
]);
const HEADER_ROW = 0x02c6000a;    // $253420 / $253472
const HEADER_END = 0x02d2000a;    // $253436 / $253488

/** `$2533F6` / `$253448` -- eight prints: the top line, six rows, then the closer. */
export function screenHeader2533F6(ram, who) {
  const h = HEADER[who === 0 ? 0 : 1];
  let d1 = h.d1;
  // $253414 jsr $240E1A with D0=8, D2=2, D3=0, D5=2 -- the STRIDE variant.
  txPrint240E1A(ram, 8, d1, 2, 0, h.top, 2);
  d1 = u16(d1 + h.first);                          // $25341A addi / $25346C subi
  for (let n = 0; n < 6; n++) {                    // moveq #$5,D7 / dbra -- SIX
    txPrint240DC2(ram, 8, d1, 2, 1, HEADER_ROW);   // $253428 / $25347A
    d1 = u16(d1 + h.step);                         // $25342E / $253480
  }
  txPrint240DC2(ram, 8, d1, 2, 1, HEADER_END);     // $25343C / $25348E
}

/**
 * `$25FF38` -- POST A REQUEST INTO THE SIDE'S TALLY RECORD.
 *
 *   lea $8130FA,A0 / tst.w D0 / beq / lea $81311E,A0
 *   move.w D1,(A0) / clr.w ($2,A0) / rts
 *
 * The same two words `$2600D8` clears on its way out (`$2601D0`/`$2601D4`), and the
 * same `(request, state)` shape `announce260B30`'s mailbox at `$813162` uses. So the
 * tally record's head is a MAILBOX and this is its poster.
 *
 * `$25DCB0 move.w #$7,D1 / jsr $25FF38` is state 1's one call, so 7 is a request id --
 * and `$25FF52` is the table it selects from: nine longwords starting `$00000000`,
 * `$0025FFA8`, `$00260056`, `$0026010E`, `$002601F4`, `$002602B6`, `$00260348`,
 * `$0026035A`, `$0026037C`. Those are CODE, they are the bonus lines W270 counted as
 * "eight bonus-line routines per side", and `$25FF92 lea ($25FF52,PC)` is the ONE
 * place that reads the table. **None of the nine is ported and none is called from
 * here**; posting the request is all this routine does.
 */
export function tallyRequest25FF38(ram, d0, d1) {
  const rec = (d0 & 0xffff) !== 0 ? 0x81311e : 0x8130fa;   // $25FF3E tst.w / $25FF44
  ram.setU16(rec + 0x00, u16(d1));                         // $25FF4A move.w D1,(A0)
  ram.setU16(rec + 0x02, 0);                               // $25FF4C clr.w ($2,A0)
  return rec;
}

/**
 * `$23D186` (side 0) / `$23D18E` (side 1) -- THE DESCRIPTOR'S INPUT READ.
 *
 *   move.w $803972,D0 / rts          and $803978 for the other side
 *
 * Two instructions each, and they are the descriptor's `($8,A4)` -- the second of its
 * three code pointers. `$803972`/`$803978` are `RAM.p1edge`/`p2edge`, the
 * EDGE-triggered input words the port already models, so a held direction moves the
 * cursor once and not every frame.
 *
 * The bits the screen tests are 2 and 3, which `BIT` names LEFT and RIGHT.
 */
export function readInput23D186(ram, who) {
  return ram.u16(who === 0 ? RAM.p1edge : RAM.p2edge);
}

/**
 * `$25DAEA` -- IS THE OTHER PLAYER ALREADY ON THIS ENTRY?
 *
 *   lea $813008,A0 / tst.b ($7,A5) / bne $25DB00 / lea $813018,A0
 *   move.b ($1,A0),D1
 *   tst.w $81308C / bne $25DB12 / move.w #$FFFF,D1
 *   cmpi.b #$FF,D1 / beq -> CARRY CLEAR
 *   cmp.b D7,D1   / bne -> CARRY CLEAR
 *   otherwise           -> CARRY SET
 *
 * **NOTE THE SENSE OF THE SIDE TEST: IT IS INVERTED FROM EVERY OTHER ONE IN THIS
 * FILE.** `bne` jumps PAST the second `lea`, so side NON-ZERO keeps `$813008` and side
 * ZERO takes `$813018`. That is correct and it is the point: a side reads the OTHER
 * side's saved selection, which is the only way a lockout can work.
 *
 * `$813008`/`$813018` are the two saved-selection records, and `$25D990
 * move.b #$FF,$813008` -- the instruction that pins W276's data window -- is what
 * writes the "nothing saved" sentinel `$FF` this routine tests for. The same `$FF`
 * `cursorsFromPosted25D9E6` treats as "use the defaults".
 *
 * `tst.w $81308C` is the LIVE-SIDE count (`liveSides25FD94`, and `HUDRAM.attract` is
 * the port's name for it). Zero means one live side, and then D1 is FORCED to `$FF`:
 * **a one-player game has no lockout at all.**
 *
 * @returns true when the other side holds `d7` -- i.e. the C flag the caller's `bcs`
 *   and `bcc` read.
 */
export function otherSideHolds25DAEA(ram, a5, d7) {
  const other = ram.u8(a5 + SCREEN11.side) !== 0                // $25DAF2 tst.b / bne
    ? SCREEN11.savedA : SCREEN11.savedB;                        // $25DAEC / $25DAFA
  let d1 = ram.u8(other + 0x01);                                // $25DB00 move.b ($1,A0)
  if (ram.u16(HUDRAM.attract) === 0) d1 = 0xff;                 // $25DB04 tst.w / $25DB0E
  if (d1 === 0xff) return false;                                // $25DB12 cmpi.b / beq
  return d1 === (d7 & 0xff);                                    // $25DB1A cmp.b D7,D1
}

/**
 * `$25DFF6` -- state 1's second `$28D53C` gate.
 *
 *   jsr $28D53C / bcs $25E004 (rts) / bra $25E0F2
 *
 * Three instructions: carry set returns, carry clear tails into `$25E0F2`. `$25E0F2`
 * is unported, so this reports which way it went and counts the tail rather than
 * inventing it.
 *
 * @returns true when it returned early (carry set), false when the board would have
 *   jumped to `$25E0F2`
 */
export function gate25DFF6(ram, ctx) {
  if (menuCarry28D53C(ram)) return true;                        // $25DFFC bcs -> rts
  ctx?.unportedLog?.note(0x25e0f2, '$25E000 bra $25E0F2 -- state 1\'s tail when '
    + '$81DF20 is zero. $25E0F2 is unported; its neighbour $25E0EA is '
    + '`lea ($25E006,PC),A0 / bra $25E200`, and $25E006 is a run of $20 bytes -- ASCII '
    + 'SPACES -- so the pair is a text blit and $25E200 is the printer');
  return false;
}

/**
 * `$25D9E6` -- TURN THE POSTED VALUES BACK INTO TABLE INDICES.
 *
 * This is the exact inverse of state 2's lookup, and having both makes the design
 * plain: the cursors live in the record as INDICES, `$2600D8` posts the table VALUES
 * into `$81308x`, and this reads them back as indices again.
 *
 *   cmpi.w #$FF,D6 / bne $25DA10          $FF means "nothing saved"
 *     D5 == 0 -> (D6,D7) = (0, 0)         side 0's defaults
 *     D5 != 0 -> (D6,D7) = (1, 2)         side 1's
 *     ...then $25DA56, which pops and `ori #$1,SR` -- CARRY SET
 *   $25DA10: moveq #$1,D0 / lea ($25D986,PC),A0 ... dbra D0
 *   $25DA2E: moveq #$2,D0 / lea ($25D98A,PC),A0 ... dbra D0
 *     ...then $25DA4C, which pops and `andi #$FFFE,SR` -- CARRY CLEAR
 *
 * **THE TWO `dbra` COUNTS CONFIRM THE TABLE SIZES A THIRD TIME.** `moveq #$1,D0` with
 * `dbra` walks indices 1 then 0 -- two entries; `moveq #$2,D0` walks 2, 1, 0 -- three.
 * That agrees with `$25DD42 andi.b #$1,($e,A5)` and with the window's own far end at
 * `$25D990`, from three independent directions.
 *
 * AND THE SEARCH IS DOWNWARD, so a value present twice would resolve to the LOWER
 * index. Neither table has a duplicate, but the direction is the ROM's and is kept.
 *
 * A value in neither table leaves D6/D7 AS THEY WERE -- the `dbra` just falls through
 * without storing. So the raw posted value ends up in the cursor, and state 2's own
 * bound is what catches it. Faithful, and the reason that bound is a note and not a
 * clamp.
 *
 * @returns {{x:number, y:number, defaulted:boolean}} `defaulted` is the C flag.
 */
export function cursorsFromPosted25D9E6(rom, d5, d6, d7) {
  if (u16(d6) === 0x00ff) {                                // $25D9EA cmpi.w #$FF,D6
    return (d5 & 0xffff) !== 0
      ? { x: 1, y: 2, defaulted: true }                    // $25DA04/$25DA08
      : { x: 0, y: 0, defaulted: true };                   // $25D9F8/$25D9FC
  }
  let x = u16(d6);
  for (let i = SCREEN11.xEntries - 1; i >= 0; i--) {       // $25DA10 moveq #$1 / dbra
    if (rom.u16(SCREEN11.xTable + i * 2) === u16(d6)) { x = i; break; }
  }
  let y = u16(d7);
  for (let i = SCREEN11.yEntries - 1; i >= 0; i--) {       // $25DA2E moveq #$2 / dbra
    if (rom.u16(SCREEN11.yTable + i * 2) === u16(d7)) { y = i; break; }
  }
  return { x, y, defaulted: false };                       // $25DA50 andi #$FFFE,SR
}

/**
 * `$25DA60` -- RESTORE THE CURSORS FROM WHAT THE TALLY POSTED.
 *
 *   move.w $813084,D6 / move.w $813088,D7        side 0
 *   tst.b ($7,A5) / beq
 *   move.w $813086,D6 / move.w $81308A,D7        side 1
 *   moveq #0,D5 / move.b ($7,A5),D5 / bsr $25D9E6
 *   move.b D6,($e,A5) / move.b D7,($f,A5) / rts
 *
 * **THE PAIR IT READS IS THE PAIR `$2600D8` WROTE.** `TALLY.postD0`/`postD1` are the
 * same four words, so the screen and the tally are a round trip: state 2 posts the
 * table values, this reads them back as indices, and state 2 posts them again. That
 * closes the loop W273 landed one half of.
 *
 * `move.b D6,($e,A5)` stores only the LOW BYTE of a word `$25D9E6` may have left as a
 * raw posted value, so a value above $FF truncates here rather than there.
 */
export function restoreCursors25DA60(ram, rom, a5) {
  const side = ram.u8(a5 + SCREEN11.side) !== 0 ? 1 : 0;   // $25DA6C tst.b / beq
  const d6 = ram.u16(TALLY.postD0[side]);                  // $25DA60 / $25DA74
  const d7 = ram.u16(TALLY.postD1[side]);                  // $25DA66 / $25DA7A
  const d5 = ram.u8(a5 + SCREEN11.side);                   // $25DA82 move.b ($7,A5),D5
  const c = cursorsFromPosted25D9E6(rom, d5, d6, d7);      // $25DA86 bsr $25D9E6
  ram.setU8(a5 + SCREEN11.xCur, c.x & 0xff);               // $25DA8A move.b D6,($e,A5)
  ram.setU8(a5 + SCREEN11.yCur, c.y & 0xff);               // $25DA8E move.b D7,($f,A5)
  return c;
}

/**
 * `$25DB30` -- STATE 0. Choose the descriptor, print the header, post announcement
 * state 0, and arm the two counters.
 *
 * The side byte is read THREE times and used for three different things: the
 * descriptor (`$25DB3A`), the header (`$25DB48`) and the announcement side
 * (`$25DB60`). All three take the same `!= 0` sense.
 */
export function screenState0_25DB30(ram, ctx, a5) {
  ram.setU8(a5 + SCREEN11.state, 1);                        // $25DB30 move.b #$1
  const side = ram.u8(a5 + SCREEN11.side) !== 0 ? 1 : 0;
  ram.setU32(a5 + SCREEN11.desc,                            // $25DB44 move.l A4,($8,A5)
    side === 0 ? SCREEN11.descA : SCREEN11.descB);          // $25DB36 / $25DB40
  screenHeader2533F6(ram, side);                            // $25DB50 / $25DB5A
  announcePost(ram, 0x260a88, ram.u8(a5 + SCREEN11.side));  // $25DB64 jsr $260A88
  ram.setU8(a5 + SCREEN11.phase, 0);                        // $25DB6A clr.b ($c,A5)
  ram.setU16(a5 + SCREEN11.armA, 0x04b0);                   // $25DB6E move.w #$4B0
  ram.setU16(a5 + SCREEN11.armB, 0x0004);                   // $25DB74 move.w #$4
  void ctx;
}

/**
 * `$25DB7C` -- STATE 2. **THE SCORE TALLY'S CALL**, then the self-kill.
 *
 *   moveq #0,D0 / move.b ($e,A5),D0 / add.w D0,D0 / lea ($25D986,PC),A0
 *   move.w (A0,D0.w),D0            <- D0 comes from the x TABLE, not the cursor
 *   moveq #0,D1 / move.b ($f,A5),D1 / add.w D1,D1 / lea ($25D98A,PC),A0
 *   move.w (A0,D1.w),D1            <- and D1 from the y table
 *   moveq #0,D2 / move.b ($7,A5),D2
 *   jsr $2600D8 / jmp $241292
 *
 * **THE TWO CURSORS ARE INDICES INTO TABLES, NOT THE VALUES.** A port that handed
 * `($e,A5)` straight to `$2600D8` would post 0 or 1 where the cartridge posts 0 or 2,
 * and `$813084` is the LIVES-ICON index `livesRow2878CC` reads through `$2881E2` --
 * so the wrong icon, silently.
 *
 * D2 is the RAW side byte, and `$2600D8` tests it as a word, so a side byte of 2 or
 * more still selects side 1. Handed over raw for that reason.
 *
 * `jmp $241292` is a TAIL JUMP: the object kills itself and state 2 never returns to
 * the dispatcher. `queueKill` is the same call `hud.js` makes at `$28D518`.
 */
export function screenState2_25DB7C(ram, rom, ctx, a5) {
  const xi = ram.u8(a5 + SCREEN11.xCur);
  const yi = ram.u8(a5 + SCREEN11.yCur);
  if (xi >= SCREEN11.xEntries || yi >= SCREEN11.yEntries) {
    // Not a clamp. `$25D986 + $4` IS `$25D98A`, so an x cursor of 2 reads the y
    // table's first word, and `$25D98A + $6` is `$25D990`, which is
    // `move.b #$FF,$813008` -- CODE. The bound is the window's, and the window's is
    // that instruction. `$25DD42 andi.b #$1,($e,A5)` keeps x to 0..1 on the board.
    ctx?.unportedLog?.note(0x25db7c, `object [11] state 2 has x cursor ${xi} and y `
      + `cursor ${yi}; the tables hold ${SCREEN11.xEntries} and ${SCREEN11.yEntries} `
      + `entries and $25D98A + $6 is $25D990, the `
      + `\`move.b #$FF,$813008\` that pins the window. Only $25DD0C's cursor code, `
      + `which this wave does not port, can move them`);
    return;
  }
  const d0 = rom.u16(SCREEN11.xTable + xi * 2);             // $25DB8C move.w (A0,D0.w)
  const d1 = rom.u16(SCREEN11.yTable + yi * 2);             // $25DB9C move.w (A0,D1.w)
  const d2 = ram.u8(a5 + SCREEN11.side);                   // $25DBA2 move.b ($7,A5),D2
  tally2600D8(ram, rom, ctx, d0, d1, d2);                   // $25DBA6 jsr $2600D8
  queueKill(ram, ram.u32(a5 + SCREEN11.id));               // $25DBAC jmp $241292
}

/**
 * `$25DBB4` -- OBJECT DISPATCH `[11]`, the state machine's entry.
 *
 *   tst.b ($2,A5) / beq $25DB30        state 0
 *   cmpi.b #$2,($2,A5) / beq $25DB7C   state 2
 *   ...fall through into state 1's gates
 *
 * State 1 is `$25DBC4..$25DD0A` and it is COUNTED, not guessed. Its two named
 * dependencies are ported above (`menuCarry28D53C`, `menuDips23C932`) because they
 * are cheap and every future caller wants them, but six more are not:
 * `$25DA60`, `$25DA94`, `$25DFF6`, `$25DEAE`, `$25E0EA` and `$25FF38` -- and the last
 * of those writes the tally records at `$8130FA` directly, so guessing it would
 * corrupt the thing this file exists to drive.
 */
/**
 * `$25DD80..$25DE18` -- THE STAGE-CLEAR SCREEN'S HEADER AND ITS TWO LABELS.
 *
 * D30/W328. The owner's report was "Stage transition looks good but is busted. 0's, some pictures
 * of medals" and, earlier, "labels too I think". This is the labels.
 *
 *   25dd72  move.l #$5BC00000,D1                    side 0's HEADER position
 *   25dd78  tst.b ($7,A5) / beq $25DD86             ... and side 0 KEEPS it
 *   25dd80  move.l #$5BC02C00,D1                    side 1's, and $25DD86 saves it in D7
 *   25dd88  move.l #$334300,D2 / move.w #$630,D3
 *   25dd92  moveq #$0,D4 / move.w ($14,A4),D4      the palette, out of the DESCRIPTOR
 *   25dd98  jsr $24018C                            -> enqueueRegisters on BUCKET 26
 *   25dd9e  tst.b ($7,A5) / bne $25DDE2            THE SIDE
 *   25dda6  addi.l #$04000100,D1 ; D2 = $334394 ; D3 = $410 ; emit
 *   25ddc2  addi.l #$00000600,D1 ; D2 = $3343B8 ; D3 = $410 ; emit
 *   25ddde  bra $25DE1A                            past the other side's pair
 *   25dde2  addi.l #$04000100,D1 ; D2 = $3343DC ; D3 = $410 ; emit   } side 1's
 *   25ddfe  addi.l #$00000600,D1 ; D2 = $334400 ; D3 = $410 ; emit   } own pair
 *
 * **TWO LABELS PER SIDE, NOT FOUR IN A ROW.** The four descriptors ascend by exactly `$24`, which
 * reads like one row of four until the `bra` at `$25DDDE` is accounted for: the first pair is side
 * 0's and the second pair is side 1's, at the SAME two offsets. A port that drew all four would put
 * the other player's labels on this player's screen.
 *
 * **`$24018C` IS `enqueueRegisters` ON BUCKET 26.** It is the same routine the port transcribed from
 * `$23EFC6` -- `lea $80AD14,A0 / adda.w $80AFEE,A0`, bump the counter by `$C`, then `asr.l #6` with
 * `$07FF03FF`/`$80008000` and four writes -- and `BUCKETS[26]` already declares that exact pair.
 * The first pass of D30's analysis called it the screen's one missing primitive; it never was.
 *
 * The positions are packed longs and the emitter shifts them right by 6, so they are written here
 * as the literals the ROM holds rather than as pixel coordinates.
 *
 * @param a4 the DESCRIPTOR (`($8,A5)`), whose `($14,A4)` is the palette every emit shares.
 * @param side the record's `($7,A5)`.
 * @returns {number} how many records were emitted -- 3, always, and returned so a caller can say so.
 */
export function drawTallyHeader25DD80(ram, a4, side, cursor = 0) {
  const d4 = ram.u16(a4 + 0x14);                  // $25DD94 move.w ($14,A4),D4
  // $25DD72 loads $5BC00000 and $25DD78 `tst.b ($7,A5) / beq $25DD86` KEEPS it for side 0; only
  // side 1 reaches $25DD80's $5BC02C00. **THE HEADER POSITION IS PER-SIDE**, and W328 first shipped
  // the side-1 constant for both -- caught by reading $25DD72, which is two instructions ABOVE
  // where the constant that looked like "the" header position lives.
  let d1 = side !== 0 ? 0x5bc02c00 : 0x5bc00000;  // $25DD80 / $25DD72
  const d7 = d1;                                  // $25DD86 move.l D1,D7 -- SAVED for the cursor
  enqueueRegisters(ram, TALLY_BUCKET, d1, 0x00334300, 0x0630, d4);   // $25DD98
  // $25DD9E `tst.b ($7,A5) / bne` -- each side has its OWN pair of descriptors.
  const pair = side !== 0
    ? [0x003343dc, 0x00334400]                    // $25DDE2 / $25DDFE
    : [0x00334394, 0x003343b8];                   // $25DDA6 / $25DDC2
  d1 = u32(d1 + 0x04000100);                      // $25DDA6 / $25DDE2 addi.l
  enqueueRegisters(ram, TALLY_BUCKET, d1, pair[0], 0x0410, d4);
  d1 = u32(d1 + 0x00000600);                      // $25DDC2 / $25DDFE addi.l
  enqueueRegisters(ram, TALLY_BUCKET, d1, pair[1], 0x0410, d4);

  // ==================== $25DE1A..$25DE66 -- THE BLINKING CURSOR HIGHLIGHT
  //
  //   25de1a  move.l D7,D1                     back to the HEADER position D7 saved
  //   25de1c  moveq #$0,D0 / move.b ($E,A5),D0 / add.w D0,D0
  //   25de24  lea ($25DE8A,PC),A2 / adda.w D0,A2 / add.w (A2),D1
  //           the ROW OFFSET: two WORDS, $0000 and $0600 -- so the highlight sits on whichever of
  //           the two label rows the cursor is on, which is why the offsets match the labels' $600
  //   25de2e  lea ($25DE8E,PC),A2 ; $25DE34 tst.b ($7,A5) / beq ; $25DE3C lea ($25DE9E,PC),A2
  //   25de42  move.w $80390A,D0 / asr.w #1,D0 / andi.w #$3,D0
  //           A FOUR-PHASE BLINK off the global frame word, halved -- so it changes every OTHER
  //           frame, not every frame
  //   25de4e  add.w D0,D0 / add.w D0,D0 / move.l (A2,D0.w),D2      the phase's descriptor
  //   25de56  move.w #$618,D3 / D4 = ($14,A4) / jsr $24018C
  //
  // **`asr.w #1` BEFORE the mask is what makes it every other frame.** Masking first would give a
  // four-frame cycle at one frame each; this gives four phases of two frames.
  const row = TALLY_CURSOR_ROWS[cursor & 0x01];    // $25DE8A -- two words, so one bit
  d1 = u32(d7 + row);                             // $25DE2C add.w (A2),D1
  const phase = (ram.u16(0x80390a) >> 1) & 0x03;  // $25DE42..$25DE4A
  const blink = side !== 0 ? TALLY_BLINK_S1 : TALLY_BLINK_S0;   // $25DE2E / $25DE3C
  enqueueRegisters(ram, TALLY_BUCKET, d1, blink[phase], 0x0618, d4);  // $25DE60
  return 4;
}

/**
 * `$25DD0C..$25DD70` -- THE STAGE-CLEAR SCREEN'S CURSOR, and it is the routine the header and
 * label row hang off: when it does NOT confirm it falls straight into the draw at `$25DD72`.
 *
 *   25dd0c  movea.l ($8,A4),A0 / jsr (A0)     the descriptor's SECOND code pointer -- the EDGE read
 *   25dd12  btst #$2,D0 / beq $25DD2A         bit 2 = LEFT
 *   25dd1a  subq.b #1,($E,A5) / move.b #$1,($D,A5) / jsr $28C6FA
 *   25dd2a  btst #$3,D0 / beq $25DD42         bit 3 = RIGHT
 *   25dd32  addq.b #1,($E,A5) / move.b #$1,($D,A5) / jsr $28C6FA
 *   25dd42  andi.b #$1,($E,A5)                the CLAMP -- two entries, so one bit
 *   25dd48  movea.l ($10,A4),A0 / move.b ($E,A5),(A0)   store THROUGH the descriptor
 *   25dd50  subq.w #1,($12,A5) / beq $25DD60  the timeout
 *   25dd58  andi.w #$70,D0 / beq $25DD72      no button -> DRAW
 *   25dd60  jsr $28C6E0 / move.w #$4B0,($12,A5) / ori #$1,SR / rts    CONFIRM, carry SET
 *
 * **THE LEFT ARM FALLS THROUGH INTO THE RIGHT TEST.** There is no branch after `$28C6FA`, so a
 * frame with both bits set applies BOTH -- the cursor nets zero and the cue fires twice. Written as
 * the ROM writes it, because an `else if` would silently make that frame a single step.
 *
 * **THE CLAMP IS `andi.b #$1` AND NOT A RANGE CHECK.** `SCREEN11.xEntries` is 2, so one bit is the
 * whole range and stepping off either end WRAPS rather than sticking. `subq.b` on 0 gives `$FF`,
 * which the mask turns into 1 -- so left from 0 lands on 1, not on 0.
 *
 * **THE TIMEOUT IS `subq.w / beq`, NOT the `bcc` old-zero idiom** the enemy cadences use. It fires
 * on the frame the word REACHES zero, and `$25DD66` re-arms it to `$4B0` on the way out, so a
 * confirmed screen leaves a fresh timer behind rather than a zero.
 *
 * @param a4 the descriptor (`($8,A5)`); its `($8,A4)` is the input read and `($10,A4)` the store.
 * @returns {boolean} the CARRY: true when the screen was confirmed, which is `$25DCD8 bcc`.
 */
export function tallyCursor25DD0C(ram, slot, a4, side, ctx) {
  const d0 = readInput23D186(ram, side);                    // $25DD0C jsr ($8,A4)
  if ((d0 & (1 << 2)) !== 0) {                              // $25DD12 btst #$2
    ram.setU8(slot + SCREEN11.xCur, (ram.u8(slot + SCREEN11.xCur) - 1) & 0xff);
    ram.setU8(slot + 0x0d, 1);                              // $25DD1E
    ctx?.soundPost?.(0x28c6fa);                             // $25DD24
  }
  // NO `else` -- $25DD2A is reached from both arms.
  if ((d0 & (1 << 3)) !== 0) {                              // $25DD2A btst #$3
    ram.setU8(slot + SCREEN11.xCur, (ram.u8(slot + SCREEN11.xCur) + 1) & 0xff);
    ram.setU8(slot + 0x0d, 1);                              // $25DD36
    ctx?.soundPost?.(0x28c6fa);                             // $25DD3C
  }
  ram.setU8(slot + SCREEN11.xCur, ram.u8(slot + SCREEN11.xCur) & 0x01);   // $25DD42
  // $25DD48 -- the descriptor's DATA pointer, so the chosen entry leaves the record.
  ram.setU8(ram.u32(a4 + 0x10), ram.u8(slot + SCREEN11.xCur));
  const t = u16(ram.u16(slot + SCREEN11.armA) - 1);         // $25DD50 subq.w #1
  ram.setU16(slot + SCREEN11.armA, t);
  if (t === 0 || (d0 & 0x70) !== 0) {                       // $25DD54 beq / $25DD58 andi/beq
    ctx?.soundPost?.(0x28c6e0);                             // $25DD60
    ram.setU16(slot + SCREEN11.armA, 0x04b0);               // $25DD66 -- RE-ARMED on the way out
    return true;                                           // $25DD6C ori #$1,SR
  }
  // $25DD72 -- not confirmed, so DRAW.
  drawTallyHeader25DD80(ram, a4, side, ram.u8(slot + SCREEN11.xCur));
  return false;
}

/**
 * `$25DEAE..$25DF4A` -- THE Y CURSOR, and it is `$25DD0C` again over THREE entries instead of two.
 *
 * The X cursor clamps with `andi.b #$1` because two entries is one bit. Three is not a power of
 * two, so this one cannot mask: it STEPS and RETRIES, skipping any entry the other player is
 * already sitting on. That is what `$25DA94` (up) and `$25DEAE` (down) are, and why the port has
 * `otherSideHolds25DAEA`.
 *
 *   25deae  D7 = ($F,A5) ; bsr $25DAEA ; bcc $25DECA     a PRE-PASS: step off a held entry
 *   25debc  subq.b #1,D7 / bge / else D7 = 2             before the input is even read
 *   25deca  movea.l ($8,A4),A0 / jsr (A0)               the EDGE read, as $25DD0C's
 *   25ded0  D7 = ($F,A5) ; move.w D7,D6                 D6 keeps the ORIGINAL, for the cue test
 *   25ded8  btst #$2,D0 / beq $25DEF6                   bit 2: step DOWN, wrapping to 2
 *   25dee6  subq.b #1,D7 / bge / else D7 = 2 ; bsr $25DAEA / bcs $25DEE6   RETRY while held
 *   25def6  btst #$3,D0 / beq $25DF18                   bit 3: step UP, wrapping to 0
 *   25df04  addq.b #1,D7 / cmpi.b #$2,D7 / ble / else D7 = 0 ; bsr $25DAEA / bcs $25DF04
 *   25df18  cmp.b D6,D7 / beq $25DF24 ; else jsr $28C6FA
 *   25df24  move.b D7,($F,A5) ; $25DF28 ($1,A0) = ($F,A5)
 *   25df32  subq.w #1,($12,A5) / beq -> CONFIRM ; $25DF3A andi.w #$70,D0 / beq -> DRAW
 *   25df42  jsr $28C6E0 / bra $25DB7C                   CONFIRM tails into STATE 2
 *
 * **THE CUE ONLY FIRES IF THE CURSOR ACTUALLY MOVED.** `$25DF18 cmp.b D6,D7 / beq` compares against
 * the value saved BEFORE the steps, so a press whose every candidate entry is held by the other
 * player is silent. The X cursor has no such test because masking always moves.
 *
 * **THE STORE IS AT `($1,A0)`, NOT `(A0)`.** `$25DD4C` wrote the X cursor to `(A0)`; this writes the
 * Y cursor one byte along. They share the descriptor's data pointer, so an offset slip here would
 * overwrite the other cursor.
 *
 * **AND CONFIRM DOES NOT RETURN A CARRY, IT TAILS INTO STATE 2.** `$25DF48 bra $25DB7C` is
 * `screenState2_25DB7C`, already ported -- so this routine's confirm is a JUMP, not a flag the
 * caller tests. Returning a boolean and letting the caller dispatch would be the same behaviour,
 * and it is what the port does, but the ROM's shape is recorded so the difference is deliberate.
 *
 * @returns {boolean} true when confirmed, i.e. the caller should run state 2.
 */
export function tallyYCursor25DEAE(ram, slot, a4, side, ctx) {
  void side;
  // $25DEAE..$25DEC8 -- the pre-pass, before any input is read.
  let d7 = ram.u8(slot + SCREEN11.yCur);
  let guard = 0;
  while (otherSideHolds25DAEA(ram, slot, d7) && guard++ < 4) {
    d7 = d7 === 0 ? 2 : d7 - 1;                            // $25DEBC subq.b / bge / else 2
  }
  const d0 = readInput23D186(ram, ram.u8(slot + SCREEN11.side));   // $25DECA jsr ($8,A4)
  d7 = ram.u8(slot + SCREEN11.yCur);                       // $25DED0 -- RE-READ, not the pre-pass value
  const d6 = d7;                                           // $25DED6 move.w D7,D6
  if ((d0 & (1 << 2)) !== 0) {                             // $25DED8 btst #$2
    ram.setU8(slot + 0x0d, 1);                             // $25DEE0
    guard = 0;
    do {
      d7 = d7 === 0 ? 2 : d7 - 1;                          // $25DEE6 wrapping to 2
    } while (otherSideHolds25DAEA(ram, slot, d7) && guard++ < 4);   // $25DEF4 bcs
  }
  // NO `else` -- $25DEF6 is reached from both arms, as $25DD2A is in the X cursor.
  if ((d0 & (1 << 3)) !== 0) {                             // $25DEF6 btst #$3
    ram.setU8(slot + 0x0d, 1);                             // $25DEFE
    guard = 0;
    do {
      d7 = d7 >= 2 ? 0 : d7 + 1;                           // $25DF04 wrapping to 0
    } while (otherSideHolds25DAEA(ram, slot, d7) && guard++ < 4);   // $25DF16 bcs
  }
  if (d7 !== d6) ctx?.soundPost?.(0x28c6fa);               // $25DF18 cmp.b D6,D7 / beq
  ram.setU8(slot + SCREEN11.yCur, d7 & 0xff);              // $25DF24
  ram.setU8(ram.u32(a4 + 0x10) + 0x01, d7 & 0xff);         // $25DF28 -- ($1,A0), NOT (A0)
  const t = u16(ram.u16(slot + SCREEN11.armA) - 1);        // $25DF32 subq.w #1
  ram.setU16(slot + SCREEN11.armA, t);
  if (t === 0 || (d0 & 0x70) !== 0) {                      // $25DF36 beq / $25DF3A andi/beq
    ctx?.soundPost?.(0x28c6e0);                            // $25DF42
    return true;                                           // $25DF48 bra $25DB7C
  }
  drawTallyYRows25DF4C(ram, slot, a4, ram.u8(slot + SCREEN11.side), d7);   // $25DF4C
  return false;
}

/** `$25DAC2` -- WHICH ENTRY HAS THE OTHER SIDE SELECTED, or `$FFFF` for "none".
 *
 *   lea $813008,A0 / tst.b ($7,A5) / bne / lea $813018,A0
 *   move.b ($1,A0),D0 / tst.w $81308C / bne $25DAE8 / move.w #$FFFF,D0 / rts
 *
 * It reads the same two saved-selection records `otherSideHolds25DAEA` does, and picks the same one
 * for the same side -- but it RETURNS the entry instead of comparing it, and it is gated on the
 * attract word `$81308C` the other way round: attract ZERO answers `$FFFF`. The Y cursor's third
 * value row is drawn only when this is non-negative, which is what makes the other player's marker
 * appear on your screen and only while a game is running. */
export function otherSideEntry25DAC2(ram, a5) {
  const rec = ram.u8(a5 + SCREEN11.side) !== 0                // $25DAC8 tst.b / bne
    ? SCREEN11.savedA : SCREEN11.savedB;                      // $25DAC2 / $25DAD0
  if (ram.u16(HUDRAM.attract) === 0) return 0xffff;           // $25DADA tst.w / $25DAE4
  return ram.u8(rec + 0x01);                                  // $25DAD6 move.b ($1,A0),D0
}

/**
 * `$25DF4C..$25DFEC` -- THE Y CURSOR'S DRAW, and the three value rows the owner's zeros are about.
 *
 * Structurally it is `drawTallyHeader25DD80` again with THREE row offsets instead of two, and it
 * reuses that routine's blink tables outright:
 *
 *   25df4c  move.l #$5BC00000,D1 ; $25DF52 tst.b ($7,A5) / beq ; $25DF5A move.l #$5BC02600,D1
 *           **PER-SIDE, and side 1's is $5BC02600 -- NOT the X draw's $5BC02C00.** The W328 trap
 *           in its own shape: the constant a scan finds is the side-1 one and the side-0 one sits
 *           two instructions above the branch.
 *   25df60  move.l D1,D7                            saved, as the X draw saves it
 *   25df62  D2 = $334224 ; D3 = $648 ; D4 = ($14,A4) ; jsr $24018C
 *   25df78  D1 = D7 ; D0 = ($F,A5) * 2 ; add.w ($25DFF0,D0),D1
 *           THREE row offsets, `0000 0600 0C00` -- the X draw's table has TWO
 *   25df8c  A2 = $25DE8E / $25DE9E ; the SAME four-phase blink, `$80390A` asr 1 and 3
 *   25dfb0  D3 = $618 ; jsr $24018C                 the cursor's own highlight
 *   25dfc0  jsr $25DAC2 / tst.w D0 / bmi $25DFEE    THE OTHER PLAYER'S MARKER, skipped if none
 *   25dfca  D1 = D7 + ($25DFF0,D0*2) ; D2 = $334424 ; jsr $24018C
 *
 * So it emits TWO or THREE records: the row label, this player's blinking highlight, and -- only
 * when the other side has an entry selected and attract is live -- a second static marker on THEIR
 * row. That third one is why the screen can show both players' choices at once.
 *
 * @returns {number} records emitted: 3 normally, 2 when the other side has nothing selected.
 */
export function drawTallyYRows25DF4C(ram, a5, a4, side, cursor) {
  const d4 = ram.u16(a4 + 0x14);                              // $25DF6E
  const d7 = side !== 0 ? 0x5bc02600 : 0x5bc00000;            // $25DF5A / $25DF4C
  enqueueRegisters(ram, TALLY_BUCKET, d7, 0x00334224, 0x0648, d4);   // $25DF72
  // $25DF78..$25DFBA -- this player's highlight, on the row the Y cursor is on.
  const mine = u32(d7 + yRow(cursor & 0xff, 0x25df88));
  const blink = side !== 0 ? TALLY_BLINK_S1 : TALLY_BLINK_S0; // $25DF8C / $25DF98
  const phase = (ram.u16(0x80390a) >> 1) & 0x03;              // $25DFA2/$25DFA4
  enqueueRegisters(ram, TALLY_BUCKET, mine, blink[phase], 0x0618, d4);   // $25DFBA
  // $25DFC0 -- and the OTHER player's marker, only if they have one.
  const theirs = otherSideEntry25DAC2(ram, a5);               // $25DFC0 jsr $25DAC2
  if ((theirs & 0x8000) !== 0) return 2;                      // $25DFC6 bmi $25DFEE
  const at = u32(d7 + yRow(theirs & 0xff, 0x25dfd6));
  enqueueRegisters(ram, TALLY_BUCKET, at, 0x00334424, 0x0618, d4);   // $25DFE8
  return 3;
}

export function tallyScreen25DBB4(ram, slot, slotIndex, ctx) {
  const st = ram.u8(slot + SCREEN11.state);
  if (st === 0) {                                          // $25DBB4 tst.b / beq
    screenState0_25DB30(ram, ctx, slot);
    return;
  }
  if (st === 2) {                                          // $25DBBC cmpi.b #$2 / beq
    screenState2_25DB7C(ram, ctx.rom, ctx, slot);
    return;
  }
  // ==================== $25DBC4..$25DC2A -- STATE 1's GATE CASCADE. W328 RUNS IT.
  //
  // Every routine it calls was already ported; what was missing was the CASCADE, so none of the
  // three announcements the screen makes on entry were happening. All three take the side byte and
  // exactly one of them can fire.
  const side = ram.u8(slot + SCREEN11.side);
  if (menuCarry28D53C(ram)) {                              // $25DBC4 jsr $28D53C / $25DBCA bcs
    announcePost(ram, 0x260a9a, side);                     // $25DC24 -- and this arm RETURNS
    return;
  }
  // $25DBCE `tst.b ($C,A5) / bne $25DC2C` -- a non-zero phase skips the whole cascade.
  if (ram.u8(slot + SCREEN11.phase) === 0) {
    // $25DBD6/$25DBE0 -- the stage test is only reached when $813098 is set, and `$813092 == 4`
    // is STAGE 5. So stage 5 leaves this screen by a different door than stages 1..4 do.
    if (ram.u16(0x813098) !== 0 && ram.u16(0x813092) === 4) {
      announcePost(ram, 0x260a9a, side);                   // $25DBE8 beq $25DC20 -- RETURNS
      return;
    }
    const [d0] = menuDips23C932(ram);                      // $25DBEC jsr $23C932
    if (d0 !== 0) {                                        // $25DBF2 tst.w / bne $25DC12
      announcePost(ram, 0x260a88, side);                   // $25DC16
    } else if (ram.u8(SCREEN11.dipConfig) === 0) {         // $25DBF8 cmpi.b #$0 / bne $25DC2C
      announceChoose260ACA(ram, side);                     // $25DC08 jsr $260ACA
    }
    // else: $803808 non-zero falls straight through to the body.
  }

  // ==================== $25DCC0 -- PHASE 1, the cursor. W328 RUNS IT.
  //
  //   25dcc0  cmpi.b #$1,($C,A5) / bne $25DCEA
  //   25dcca  move.b ($7,A5),D0 / jsr $260A88      the announcement, every frame of this phase
  //   25dcd4  bsr $25DD0C                          the cursor -- and it DRAWS when it does not
  //   25dcd8  bcc $25DCE8                          not confirmed -> rts
  //   25dcdc  move.b #$2,($C,A5) / move.b #$1,($D,A5)   confirmed -> advance the phase
  //   25dce8  rts
  //
  // The announcement is re-posted on EVERY frame of the phase, not once on entry, which is what
  // keeps it on screen while the cursor is up.
  if (ram.u8(slot + SCREEN11.phase) === 1) {
    announcePost(ram, 0x260a88, side);                     // $25DCCE
    const a4 = ram.u32(slot + SCREEN11.desc);
    if (tallyCursor25DD0C(ram, slot, a4, side, ctx)) {      // $25DCD4 bsr / $25DCD8 bcc
      ram.setU8(slot + SCREEN11.phase, 2);                 // $25DCDC
      ram.setU8(slot + 0x0d, 1);                           // $25DCE2
    }
    void slotIndex;
    return;                                                // $25DCE8 rts
  }

  // $25DC2C onward -- THE BODY, still counted. The note is narrower than it was: the cascade above
  // and `$25FF38` (already here as `tallyRequest25FF38`) are done, and `$24018C` was never missing
  // -- it is `enqueueRegisters` on bucket 26, which `drawTallyHeader25DD80` now uses. What remains
  // is the arm between `$25DC2C` and `$25DD80` plus the cursor half.
  ctx?.unportedLog?.note(0x25dc2c, 'object [11] state 1\'s BODY -- $25DC2C onward. W328 ported '
    + 'the gate cascade above it and the header/label row at $25DD80 (drawTallyHeader25DD80). '
    + 'What is left: the arm $25DC2C..$25DD80, which gates on ($C,A5), $813098/$813092, $803926 '
    + 'and the descriptor\'s ($4,A4) input read with btst #$F; the six remaining emit sites; and '
    + 'the CURSOR half from $25DD0C ($25DA60, $25DA94, $25DEAE, $25E0EA -- and $25DA94/$25DEAE '
    + 'are the entry-picker over $25DAEA, not digit formatters)');
  void slotIndex;
}
