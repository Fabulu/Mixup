// THE STAGE-CLEAR SCORE TALLY -- `$2600D8`, and the live-side count `$25FD94`.
//
// The owner asked about this by name: "maybe even score totalling, which I see
// none of". W270 recon'd object dispatch `[11]` (`$25DBB4`) down to the routines
// it needs and found ONE that nobody had read, `$2600D8`. This is that routine.
//
// IT IS NOT A DESCRIPTOR WALKER, which is what W270's recon guessed from its
// call sites. It is the tally's POSTER: given a per-side tally record it
// allocates the object that runs one bonus line, fills that object's three
// fields, repaints the whole HUD row stack for the side, posts announcement
// state `$8` and recounts how many sides are still live.
//
// ===========================================================================
// THE SEVEN ROWS, AND WHY THIS WAVE WAS SMALL
// ===========================================================================
// Each of `$2600D8`'s two arms calls seven routines, and the FAMILY CHECK paid
// off for all seven: two were already in `hud.js` and uncalled (W271 found and
// called them), and the other five touch nothing but RAM `HUDRAM` had already
// named -- `digitsP1` is documented "9 records of stride $A" and `$287148` is
// the loop that seeds those nine. So the seven rows are `hud.js`'s business and
// this file only drives them.
//
// ===========================================================================
// THE TALLY RECORD
// ===========================================================================
// Two records, `$8130FA` (side 0) and `$81311E` (side 1), $24 bytes apart. The
// fields this routine touches:
//
//   +$00  w   cleared on the way out ($2601D0)
//   +$02  w   cleared on the way out ($2601D4)
//   +$08  l   a POINTER, and the only thing the DIP word is written through
//   +$10  w   -> the new object's ($8,A0)
//   +$12  w   -> the new object's ($a,A0)
//   +$14  w   the object TYPE to allocate
//   +$17  b   THE ROW SELECTOR: 0 takes the P1 row block, anything else P2
//   +$18  l   the allocation result, and what `$25FD94` counts
//
// **`+$17` SELECTS THE ROWS, NOT D2.** `$2600DC tst.w D2` chooses which record
// and which pair of `$81308x` words to write, and then `$260154 move.b ($17,A6),
// D0 / cmpi.w #$0,D0 / bne` chooses the row block from the RECORD. A port that
// reused D2 for both would be right on every call the game currently makes and
// wrong the moment a side-1 record carries selector 0.

import { u16 } from './ram.js';
import { stageCreate } from './objalloc.js';
import {
  HUDRAM,
  hyperStock286ED6,
  livesRow2878CC,
  extendInit286FA6,
  scoreDrainReset287148,
  chainMeterClear2871E8,
  digitStateBump287238,
  tallyRow287AAA,
} from './hud.js';
import { announcePost } from './rank.js';
import { paletteSet241688 } from './palette.js';

/** The two tally records, `$260104 lea $8130FA,A6` and `$2600EE lea $81311E,A6`. */
const DISPATCH = 0x240f62;   // $241198 lea ($240F62,PC),A0 -- the object table

export const TALLY = Object.freeze({
  side0: 0x8130fa,
  side1: 0x81311e,
  stride: 0x24,                 // $81311E - $8130FA
  // $2600E2/$2600F8 and $2600E8/$2600FE -- the two words each arm posts. Both
  // pairs are already named in `hud.js`: $813084/$813086 are the LIVES-ICON
  // indices `livesRow2878CC` reads through $2881E2/$2881EA.
  postD0: Object.freeze([0x813084, 0x813086]),
  postD1: Object.freeze([0x813088, 0x81308a]),
  counter: 0x813142,            // $260112 subq.w #1
  dip: 0x80380e,                // $26011C move.b -- indexes DIP_WORDS
  dipWords: 0x2600ce,           // $260124 lea ($2600CE,PC),A1
  dipWordCount: 5,              // pinned from above by $2600D8's own movem.l
  // the record's own fields
  ptr: 0x08, argA: 0x10, argB: 0x12, type: 0x14, row: 0x17, result: 0x18,
});

/** `$25FD94` -- HOW MANY SIDES ARE STILL IN THE TALLY, minus one.
 *
 *   lea $8130FA,A2 / lea $81311E,A3 / clr.w $81308C
 *   tst.l ($18,A2) / beq / addq.w #1,$81308C
 *   tst.l ($18,A3) / beq / addq.w #1,$81308C
 *   subq.w #1,$81308C / move.w $81308C,$81308E
 *
 * So the word is (live sides - 1): 0 for one side, 1 for two, and **-1 ($FFFF)
 * for none**, which the `subq` produces without a floor.
 *
 * `$81308C` is `HUDRAM.attract` in this port, named in W63 from `$284B0E tst.w`.
 * Ten sites across `effects.js`, `handlers.js`, `laser.js` and `damage.js` read
 * it as "=== 0 means the narrow case", which is consistent with one live side --
 * so the READS are right and only the NAME is off. Left as `attract` here rather
 * than renamed across five files in a wave whose subject is the tally; recorded
 * so the next reader does not re-derive it.
 */
export function liveSides25FD94(ram) {
  let n = 0;
  if (ram.u32(TALLY.side0 + TALLY.result) !== 0) n++;      // $25FDA6/$25FDAE
  if (ram.u32(TALLY.side1 + TALLY.result) !== 0) n++;      // $25FDB4/$25FDBC
  const w = u16(n - 1);                                    // $25FDC2 subq.w #1
  ram.setU16(HUDRAM.attract, w);
  ram.setU16(0x81308e, w);                                 // $25FDC8 move.w -> $81308E
  return w;
}

/** The row stack, `$26016C..$260190` (selector 0) and `$2601A6..$2601CA`.
 *  Seven calls per arm, IN THE ROM'S ORDER, which is the order they paint in --
 *  and the order matters: `$287238` bumps the digit state and marks
 *  `extraRecA` dirty, then `$287148` immediately re-seeds it to 1. */
function rowStack(ram, rom, ctx, who) {
  digitStateBump287238(ram, who);                          // $26016C / $2601A6
  scoreDrainReset287148(ram, who);                         // $260172 / $2601AC
  extendInit286FA6(ram, rom, ctx, who);                    // $260178 / $2601B2
  tallyRow287AAA(ram, rom, ctx, who);                      // $26017E / $2601B8
  chainMeterClear2871E8(ram, who);                         // $260184 / $2601BE
  hyperStock286ED6(ram, rom, ctx, who);                    // $26018A / $2601C4
  livesRow2878CC(ram, rom, ctx, who);                      // $260190 / $2601CA
}

/**
 * `$2600D8` -- POST ONE BONUS LINE FOR ONE SIDE.
 *
 * @param ram
 * @param rom  the RomWindows, for the rows that read tables
 * @param ctx  for the two counted gaps below
 * @param d0   the caller's D0. Its LOW WORD is posted to `$813084`/`$813086`;
 *   its HIGH word survives into `+$18` untouched, see the note there.
 * @param d1   the caller's D1, posted to `$813088`/`$81308A`
 * @param d2   ZERO selects side 0, anything else side 1
 * @returns the record the allocator left for the caller to fill, or null when
 *   the create queue was full
 */
export function tally2600D8(ram, rom, ctx, d0, d1, d2) {
  // $2600DC tst.w D2 -- a WORD test, so a d2 whose low word is zero takes the
  // side-0 arm however large its high half is.
  const side = (d2 & 0xffff) !== 0 ? 1 : 0;
  ram.setU16(TALLY.postD0[side], u16(d0));                 // $2600E2 / $2600F8
  ram.setU16(TALLY.postD1[side], u16(d1));                 // $2600E8 / $2600FE
  const a6 = side === 1 ? TALLY.side1 : TALLY.side0;       // $2600EE / $260104

  // $260112 subq.w #1,$813142 -- an UNGUARDED decrement, so it wraps past zero.
  ram.setU16(TALLY.counter, u16(ram.u16(TALLY.counter) - 1));

  // $260118..$26012A -- the DIP word, written through the record's own pointer.
  // `move.b $80380E,D0 / add.w D0,D0` is a byte read doubled, so the table is
  // five WORDS and $2600CE + $A is $2600D8 itself: the routine's own `movem.l`
  // pins the far end and nothing here has to guess the extent.
  const a0ptr = ram.u32(a6 + TALLY.ptr);                   // $260118 movea.l ($8,A6),A0
  const dip = ram.u8(TALLY.dip);
  if (dip >= TALLY.dipWordCount) {
    // Not a clamp: the board would read the first word of $2600D8's `movem.l`
    // and store $48E7 through a pointer the tally record supplied.
    ctx?.unportedLog?.note(TALLY.dipWords, `$260124 indexes $2600CE by DIP `
      + `$80380E = ${dip}, and the table is only ${TALLY.dipWordCount} words `
      + `($2600CE + $A IS $2600D8's own movem.l). No corpus has produced a `
      + `value past 4`);
  } else {
    ram.setU16(a0ptr, rom.u16(TALLY.dipWords + dip * 2));  // $26012A move.w (A1),(A0)
  }

  // $26012C/$260130 -- allocate the object that RUNS the line. $241182 leaves
  // the staging slot in A0 and does not restore it, so the four fills below go
  // to the NEW record and not to ($8,A6)'s pointer above. Getting that wrong
  // would write the DIP word's destination four more times.
  const type = ram.u16(a6 + TALLY.type);
  // $241198 lea ($240F62,PC),A0 / $24119C move.w ($4,A0,D1.w),D1 -- the same
  // dispatch table and the same +$4 priority word `stageend.js` reads.
  const made = stageCreate(ram, type, (t) => rom.u16(DISPATCH + t * 8 + 4));
  // $260136 move.l D0,($18,A6). D0's low word is $2411A8's `ori.w #$8000,D0`;
  // its HIGH word is the caller's, untouched by every `move.b`/`move.w` above.
  // `$25FD94` only tests the long for zero and `type | $8000` is never zero, so
  // the high half is unobservable -- but it is stored, so it is stored here.
  const res = (((d0 & 0xffff0000) | (u16(type | 0x8000))) >>> 0);
  ram.setU32(a6 + TALLY.result, res);
  if (made.ok) {
    ram.setU8(made.addr + 0x06, 0);                        // $26013A move.b #$0,($6,A0)
    ram.setU8(made.addr + 0x07, ram.u8(a6 + TALLY.row));   // $260140 move.b ($17,A6)
    ram.setU16(made.addr + 0x08, ram.u16(a6 + TALLY.argA));// $260146 move.w ($10,A6)
    ram.setU16(made.addr + 0x0a, ram.u16(a6 + TALLY.argB));// $26014C move.w ($12,A6)
  }

  // $260152..$26015C -- the ROW SELECTOR is the RECORD's byte, not D2.
  const who = ram.u8(a6 + TALLY.row) === 0 ? 0 : 1;
  // $260160/$26019A -- THE PALETTE SET. D0 is the ROW SELECTOR (`who`, already
  // computed) and D1 is re-read from the side's own $81308x word rather than
  // passed down, which is why `$260160` and `$26019A` differ only in which word
  // they load. Ported in W274; arm 0's fourth load is TEXT bank 9 from $2226F8,
  // which `palette.js` had recorded as having no installer anywhere.
  // D0 is the RAW row byte, not a 0/1 -- `$260154 moveq #0,D0 / move.b ($17,A6),D0`
  // then `$241688 tst.w D0`. Both tests are nonzero tests so the arm is the same,
  // but the value handed over is the byte the record carries.
  const d1Set = ram.u16(TALLY.postD0[who]);                // $260160 / $26019A
  if (ctx?.palette) {
    paletteSet241688(ram, ctx.palette, rom, ram.u8(a6 + TALLY.row), d1Set);
  }

  rowStack(ram, rom, ctx, who);

  ram.setU16(a6 + 0x00, 0);                                // $2601D0 move.w #$0,(A6)
  ram.setU16(a6 + 0x02, 0);                                // $2601D4 move.w #$0,($2,A6)
  announcePost(ram, 0x260ab6, ram.u8(a6 + TALLY.row));     // $2601DE jsr $260AB6
  liveSides25FD94(ram);                                    // $2601E4 jsr ($25FD94,PC)
  ctx?.unportedLog?.note(0x23c668, '$2601E8 jsr $23C668 -- clears 256 longwords '
    + 'of a staging area this port does not model; the same note player.js '
    + 'carries for $25FFA8\'s call to it');
  return made.ok ? made.addr : null;
}
