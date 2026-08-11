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
import { unreached } from './unported.js';
import { stageCreate, queueKill, resolveHandle241298, ALLOC } from './objalloc.js';
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
import { setPanel2603B0 } from './player.js';

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

// ===========================================================================
// W289 -- `$25FFA8`, THE FIRST BONUS LINE
// ===========================================================================
// `$25FF52`'s ten longwords are the bonus lines, selected by the request word
// `$25FF38` posts and driven by `$25FF7A` over both records at stride `$24`.
// Entry 0 is null and guarded by `$25FF84 cmpi.w #$0,D0 / beq`; **this is entry 1**,
// the first real one.
//
//   25ffa8  jsr $23C668                      256 longwords of a staging area
//   25ffae  move.l #$0,($18,A6)              drop the previous object
//   25ffb6  move.w #$78,$8130D4              **FREEZE THE GAME FOR 120 FRAMES**
//   25ffbe  jsr $261116                      $81316C = 1, $81316A = 0
//   25ffc4  movea.l ($8,A6),A0 / subq.w #1,(A0) / tst.w (A0) / bpl $26000C
//     the counter BORROWED -- this line is finished:
//   25ffd0    ($17,A6) picks the side, then three words per side
//   260004    (A6) = 2                       -> the NEXT state
//     not finished -- run one more frame of it:
//   26000c    ($17,A6) ? $28795C : $2878CC   THE LIVES ROW, ported W116
//   260024    the allocator-fill, and it is $2600D8's shape
//   26004a    (A6) = 0                       -> re-post, so the driver comes back
//   26004e  ($2,A6) = 0 / rts
//
// **THE COUNTER IS A POINTER, NOT A FIELD.** `movea.l ($8,A6),A0 / subq.w #1,(A0)`
// decrements a word the RECORD POINTS AT, so two records can share one counter and the
// tally's own `($8,A6)` is what decides. A port that decremented `($8,A6)` itself would
// count down the pointer.
//
// **AND THE BORROW TEST IS `bpl`, NOT `beq`.** `subq.w #1 / tst.w / bpl` continues while
// the result is ZERO OR POSITIVE, so a counter of 1 runs one more frame at 0 and only
// finishes at -1. That is the old-zero borrow this project has been caught by six times,
// in its other form.
//
// `$8130D4` is the FREEZE word `boss2attacks.js`, `bossf23.js` and `bossguns.js` all
// name. So a bonus line stops the game while it counts -- which is what a tally screen
// does, and it is why the freeze is set on EVERY frame of the line rather than once.
const BONUS1 = Object.freeze({
  site: 0x25ffa8,
  freeze: 0x8130d4,
  freezeFrames: 0x78,
  crossA: 0x81316c, crossB: 0x81316a,          // $261116's two writes
  // $25FFD8..$25FFFE -- three PAIRS, interleaved by side.
  doneA: Object.freeze([0x812930, 0x812932]),
  doneB: Object.freeze([0x812934, 0x812936]),
  doneC: Object.freeze([0x812938, 0x81293a]),
});

/**
 * `$25FFA8` -- bonus line 1. Returns true when the line FINISHED this frame.
 *
 * @param a6 the tally record (`$8130FA` or `$81311E`)
 */
export function bonusLine125FFA8(ram, rom, ctx, a6) {
  ctx?.unportedLog?.note(0x23c668, '$25FFA8 jsr $23C668 -- clears 256 longwords of a '
    + 'staging area this port does not model; the same note player.js and tally.js '
    + 'both carry for their own callers of it');
  ram.setU32(a6 + TALLY.result, 0);                        // $25FFAE move.l #$0
  ram.setU16(BONUS1.freeze, BONUS1.freezeFrames);          // $25FFB6 move.w #$78
  ram.setU16(BONUS1.crossA, 1);                            // $25FFBE jsr $261116
  ram.setU16(BONUS1.crossB, 0);

  // $25FFC4 -- the counter lives where ($8,A6) POINTS.
  const ctr = ram.u32(a6 + TALLY.ptr);
  ram.setU16(ctr, u16(ram.u16(ctr) - 1));                  // $25FFC8 subq.w #1,(A0)
  const side = ram.u8(a6 + TALLY.row) !== 0 ? 1 : 0;

  if ((ram.u16(ctr) & 0x8000) !== 0) {                     // $25FFCA tst.w / $25FFCC bpl
    // Finished. Three words for the side, then state 2.
    ram.setU16(BONUS1.doneA[side], 0);                     // $25FFD8 / $25FFF0
    ram.setU16(BONUS1.doneB[side], 1);                     // $25FFDE / $25FFF6
    ram.setU16(BONUS1.doneC[side], 0);                     // $25FFE6 / $25FFFE
    ram.setU16(a6 + 0x00, 2);                              // $260004 move.w #$2,(A6)
    ram.setU16(a6 + 0x02, 0);                              // $26004E
    return true;
  }

  // Not finished: paint the side's lives row and re-post.
  livesRow2878CC(ram, rom, ctx, side);                     // $260014 / $26001E
  // $260024..$260044 -- the same allocator-fill `$2600D8` does, and the same trap:
  // `$241182` leaves the staging slot in A0 and does not restore it, so these four
  // writes go to the NEW record. The SOURCE fields differ though -- ($C,A6)/($E,A6)
  // here against ($10,A6)/($12,A6) there, which is why this is not one shared helper.
  const made = stageCreate(ram, ram.u16(a6 + TALLY.type),
    (t) => rom.u16(DISPATCH + t * 8 + 4));                 // $260028 jsr $241182
  if (made.ok) {
    ram.setU8(made.addr + 0x06, 0);                        // $260032
    ram.setU8(made.addr + 0x07, ram.u8(a6 + TALLY.row));   // $260038
    ram.setU16(made.addr + 0x08, ram.u16(a6 + 0x0c));      // $26003E ($C,A6)
    ram.setU16(made.addr + 0x0a, ram.u16(a6 + 0x0e));      // $260044 ($E,A6)
  }
  ram.setU16(a6 + 0x00, 0);                                // $26004A move.w #$0,(A6)
  ram.setU16(a6 + 0x02, 0);                                // $26004E
  return false;
}

// ===========================================================================
// W290 -- `$260056`, BONUS LINE 2, and it is what CREATES the display objects
// ===========================================================================
//   260056  jsr $23C668                    COUNTED, as line 1 counts it
//   26005c  jsr $25FD94                    liveSides25FD94 -- ported W277
//   260060  tst.w $803926 / bne $2600C2    a gate: set -> do nothing but re-post
//   26006a  ($17,A6) ? $287C08 : $287BD2   the HIGH-SCORE CHECK, carry = "no"
//   26007c    carry CLEAR -> ori.b #$1 (or #$2) into $8130CC
//   26009a  D0 = $D / jsr $241182 / ($20,A6) = D0 / ($7,A0) = ($17,A6)
//   2600ae  D0 = $B / jsr $241182 / ($1C,A6) = D0 / ($7,A0) = ($17,A6)
//   2600c2  (A6) = 0 / ($2,A6) = 0 / rts
//
// **TYPE `$B` IS OBJECT DISPATCH `[11]`** -- `src/tallyscreen.js`, ported in W276. So
// this line is what BRINGS THE TALLY SCREEN INTO EXISTENCE, and D9's old note that
// "type `$B` is the same unported `$25DBB4` that D11 is about" now closes: the creator
// and the created are both in the tree. Type `$D` is its companion and is separate.
//
// Note the record keeps BOTH object handles, at `($20,A6)` and `($1C,A6)`, where line 1
// keeps one at `($18,A6)`. Three different fields for three different objects, so a
// port that reused one would silently drop a handle.
//
// **THE HIGH-SCORE CHECK IS ONE COUNTED GAP.** `$287BD2`/`$287C08` are a P1/P2 pair that
// each load a side's score state -- `$81B440`/`$81B444` (the totals), `$81B44C`/`$81B44E`
// (the overflows), `$813084`/`$813088` (the words `$2600D8` posts), `$81B632`/`$81B634`
// (the chain high-waters) and `$81B49A`/`$81B49E` (the digit states), all already named
// in `hud.js` -- into `$81B420`/`$81B430` and then share `$287C3E`, which writes the loop
// and stage, calls `$287CEE` to find a slot, and compares overflow words. That is a
// high-score TABLE INSERT and it is a subsystem, not a routine: it wants its own wave and
// BCD care rather than the tail of this one.
//
// The carry it returns decides one bit of `$8130CC` and nothing else in this line, so
// deferring it costs exactly that bit -- which is why the line is worth landing now with
// the gap named.
const BONUS2 = Object.freeze({
  site: 0x260056,
  gate: 0x803926,                 // $260060 tst.w
  flags: 0x8130cc,                // $26007C/$260092 ori.b -- bit 0 P1, bit 1 P2
  hiScore: Object.freeze([0x287bd2, 0x287c08]),
  objA: Object.freeze({ type: 0x0d, handle: 0x20 }),   // $26009A
  objB: Object.freeze({ type: 0x0b, handle: 0x1c }),   // $2600AE -- object [11]
});

/** `$260056` -- bonus line 2. Returns the two object handles it created, or null. */
export function bonusLine2260056(ram, rom, ctx, a6) {
  ctx?.unportedLog?.note(0x23c668, '$260056 jsr $23C668 -- the 256-longword clear, the '
    + 'same one line 1 and $2600D8 count');
  liveSides25FD94(ram);                                    // $26005C jsr $25FD94

  if (ram.u16(BONUS2.gate) !== 0) {                        // $260060 tst.w / bne
    ram.setU16(a6 + 0x00, 0);                              // $2600C2
    ram.setU16(a6 + 0x02, 0);                              // $2600C6
    return null;
  }

  const side = ram.u8(a6 + TALLY.row) !== 0 ? 1 : 0;
  // $26006A..$260098 -- the high-score check, and the ONE thing this line defers.
  ctx?.unportedLog?.note(BONUS2.hiScore[side], `$${
    BONUS2.hiScore[side].toString(16).toUpperCase()} -- the side-${side} HIGH-SCORE `
    + `CHECK. It loads the side's totals ($81B440/$81B444), overflows ($81B44C/$81B44E), `
    + `the words $2600D8 posted ($813084/$813088), the chain high-waters ($81B632/`
    + `$81B634) and the digit states ($81B49A/$81B49E) into $81B420/$81B430, then shares `
    + `$287C3E -- which writes the loop and stage, calls $287CEE for a slot and compares `
    + `overflow words. That is a high-score TABLE INSERT and wants its own wave. Its `
    + `carry would set bit ${side} of $8130CC and affects nothing else here, so this `
    + `line runs without it`);

  // $26009A / $2600AE -- BOTH objects, and the handles land in different fields.
  for (const o of [BONUS2.objA, BONUS2.objB]) {
    const made = stageCreate(ram, o.type, (t) => rom.u16(DISPATCH + t * 8 + 4));
    ram.setU32(a6 + o.handle, made.ok ? made.addr : 0);    // $2600A4 / $2600B8
    if (made.ok) {
      ram.setU8(made.addr + 0x07, ram.u8(a6 + TALLY.row)); // $2600A8 / $2600BC
    }
  }

  ram.setU16(a6 + 0x00, 0);                                // $2600C2 move.w #$0,(A6)
  ram.setU16(a6 + 0x02, 0);                                // $2600C6
  return { objA: ram.u32(a6 + BONUS2.objA.handle), objB: ram.u32(a6 + BONUS2.objB.handle) };
}

// ===========================================================================
// W292 -- `$2601F4`, BONUS LINE 4, AND IT CARRIES TWO LOOP-2 RULES
// ===========================================================================
//   2601f4  movea.l ($8,A6),A0
//   2601f8  move.b $80380E,D0 / add.w D0,D0 / lea ($2600CE,PC),A1
//   260204  move.w (A1,D0.w),(A0)          the DIP word, as $2600D8 writes it
//   260208  tst.w $813098 / beq $26022A    **LOOP GATE ONE**
//   260212    ($17,A6) ? (A0) = $8130C4 : (A0) = $8130C2
//   26022a  D0 = ($14,A6) / jsr $241182 / ($18,A6) = D0
//   260238  ($6,A0) = $813099              a BYTE from RAM, not the literal 0
//   260240  ($7,A0) = ($17,A6) / ($8,A0) = ($10,A6) / ($a,A0) = ($12,A6)
//   260254  ($17,A6) ? D1 = $813086 : D1 = $813084
//   260286  jsr $241688                    the palette set -- ported W274
//   26028c  tst.w $813098 / bne $26029C    **LOOP GATE TWO**
//   260296    jsr $286FB4                  the extend seed, side 1's arm
//   26029c  ($17,A6) -> jsr $260AB6        announcement state $8
//   2602a6  (A6) = 0 / ($2,A6) = 0
//   2602b0  jsr $25FD94 / rts
//
// **SO THIS LINE BEHAVES DIFFERENTLY IN LOOP 2 IN TWO SEPARATE WAYS**, and they are not
// the same test used twice -- one is `beq` and the other `bne`:
//
//   loop 1   the pointer gets the DIP word, and `$286FB4` RUNS
//   loop 2   the pointer gets `$8130C2`/`$8130C4`, and `$286FB4` is SKIPPED
//
// That takes this port's translated loop-2 rules from five to SEVEN. The other five are
// W241's zero-lives extend, W250's A1 6 ring, A4 id6's two, and W270's `$260ACA`.
//
// AND IT IS NOT THE SEVEN-ROW STACK. `$2600D8` paints all seven HUD rows; this line
// paints the palette set and then AT MOST ONE row -- `$286FB4`, which is
// `extendInit286FA6`'s SIDE-1 arm, called regardless of `($17,A6)`. Reading it as "the
// row for this side" would be wrong twice over: wrong arm, and conditional on the loop.
//
// `($6,A0)` also differs: `$2600D8` writes the literal 0 and this writes the BYTE at
// `$813099`, which is **the LOW byte of the loop word `$813098`** -- 68000 is big-endian,
// so `$813098` is the high byte and `$813099` the low one. So the object is told WHICH
// LOOP it is in, and the two gates above test the same word this byte comes out of. A
// port that read `$813099` as a separate flag would find it moving with the loop and never
// know why.
const BONUS4 = Object.freeze({
  site: 0x2601f4,
  loop: 0x813098,                          // $260208 / $26028C tst.w
  loopByte: 0x813099,                      // $260238 -- the loop word's LOW byte
  loopWord: Object.freeze([0x8130c2, 0x8130c4]),
});

/** `$2601F4` -- bonus line 4. Returns the object it created, or null. */
export function bonusLine42601F4(ram, rom, ctx, a6) {
  const side = ram.u8(a6 + TALLY.row) !== 0 ? 1 : 0;
  const ptr = ram.u32(a6 + TALLY.ptr);                     // $2601F4 movea.l ($8,A6)

  // $2601F8..$260204 -- the DIP word, then LOOP GATE ONE overwrites it.
  const dip = ram.u8(TALLY.dip);
  if (dip >= TALLY.dipWordCount) {
    ctx?.unportedLog?.note(TALLY.dipWords, `$260200 indexes $2600CE by DIP $80380E = ${
      dip}, and the table is only ${TALLY.dipWordCount} words ($2600CE + $A IS $2600D8's `
      + `own movem.l). The same bound $2600D8 carries`);
  } else {
    ram.setU16(ptr, rom.u16(TALLY.dipWords + dip * 2));    // $260204
  }
  const inLoop2 = ram.u16(BONUS4.loop) !== 0;
  if (inLoop2) {                                           // $260208 tst.w / beq
    ram.setU16(ptr, ram.u16(BONUS4.loopWord[side]));       // $26021A / $260224
  }

  // $26022A -- the allocate, and ($6,A0) is a BYTE FROM RAM here.
  const made = stageCreate(ram, ram.u16(a6 + TALLY.type),
    (t) => rom.u16(DISPATCH + t * 8 + 4));                 // $26022E jsr $241182
  const res = (((0 & 0xffff0000) | (u16(ram.u16(a6 + TALLY.type) | 0x8000))) >>> 0);
  ram.setU32(a6 + TALLY.result, res);                      // $260234 move.l D0
  if (made.ok) {
    ram.setU8(made.addr + 0x06, ram.u8(BONUS4.loopByte));  // $260238 -- NOT a literal 0
    ram.setU8(made.addr + 0x07, ram.u8(a6 + TALLY.row));   // $260240
    ram.setU16(made.addr + 0x08, ram.u16(a6 + TALLY.argA));// $260246
    ram.setU16(made.addr + 0x0a, ram.u16(a6 + TALLY.argB));// $26024C
  }

  // $260254..$260286 -- the palette set, on the RECORD's row byte as always.
  if (ctx?.palette) {
    paletteSet241688(ram, ctx.palette, rom,
      ram.u8(a6 + TALLY.row), ram.u16(TALLY.postD0[side]));
  }

  // $26028C -- LOOP GATE TWO. `bne` skips, so loop 2 does NOT seed the extend.
  if (!inLoop2) {
    extendInit286FA6(ram, rom, ctx, 1);                    // $260296 jsr $286FB4
  }

  announcePost(ram, 0x260ab6, ram.u8(a6 + TALLY.row));     // $2602A0 jsr $260AB6
  ram.setU16(a6 + 0x00, 0);                                // $2602A6
  ram.setU16(a6 + 0x02, 0);                                // $2602AA
  liveSides25FD94(ram);                                    // $2602B0 jsr $25FD94
  return made.ok ? made.addr : null;
}

// ===========================================================================
// W293 -- `$2602B6`, BONUS LINE 5: THE TEARDOWN
// ===========================================================================
// The first line that does not take the record it is handed. It takes BOTH:
//
//   2602b6  lea $8130FA,A2 / lea $81311E,A3
//   2602c2  nine x { lea <handle>,A0 / jsr $241238 }
//             ($1C,A2) ($1C,A3)      the type-$B handles line 2 created
//             ($20,A2) ($20,A3)      the type-$D handles line 2 created
//             $813148 $813144 $81314C $813150 $813154    five globals
//   260326  jsr $28C170 / jsr $28C0FC          two cues
//   260332  move.w #$E,D0 / jsr $241182        ONE new object, type $E
//   26033c  (A6) = 0 / ($2,A6) = 0 / rts
//
// **SO LINE 5 TEARS DOWN WHAT LINE 2 BUILT, FOR BOTH SIDES AT ONCE**, and that is why it
// reaches past its own record. Line 2 put the type-`$D` handle at `($20,A6)` and the
// type-`$B` handle at `($1C,A6)`; those are exactly the first four kills here. The pairing
// is what makes the two lines legible: neither field choice looks meaningful alone.
//
// **`$241238` TAKES A POINTER, NOT AN ID.** `$241252 move.l (A0),(A1)` dereferences, so
// every call site does `lea <field>,A0` first. The port's `queueKill(ram, id)` takes the
// VALUE -- the same convention `hud.js` uses at `$28D518` -- so each of the nine
// dereferences here. Passing the ADDRESS would queue a kill for a handle equal to a RAM
// address, which the drain would silently fail to match.
//
// The kill queue is LIFO (`$24126C` subtracts before reading), so the nine are applied in
// reverse. Nothing here depends on the order, but a later reader should not assume FIFO.
const BONUS5 = Object.freeze({
  site: 0x2602b6,
  // the two per-record handle fields, in the ROM's own order
  recordFields: Object.freeze([0x1c, 0x20]),
  // $2602EA..$260320 -- five globals, in the ROM's order (NOT sorted)
  globals: Object.freeze([0x813148, 0x813144, 0x81314c, 0x813150, 0x813154]),
  cueA: 0x28c170,
  cueB: 0x28c0fc,
  newType: 0x0e,                           // $260332 move.w #$E,D0
});

/** `$2602B6` -- bonus line 5. Returns the type-`$E` record it created, or null. */
export function bonusLine52602B6(ram, rom, ctx, a6) {
  // $2602C2..$260320 -- the nine kills, and the order is the ROM's.
  for (const field of BONUS5.recordFields) {
    for (const rec of [TALLY.side0, TALLY.side1]) {         // A2 then A3
      queueKill(ram, ram.u32(rec + field));                 // $241238, dereferenced
    }
  }
  for (const g of BONUS5.globals) {
    queueKill(ram, ram.u32(g));
  }

  ctx?.soundPost?.(BONUS5.cueA);                            // $260326 jsr $28C170
  ctx?.soundPost?.(BONUS5.cueB);                            // $26032C jsr $28C0FC

  // $260332 -- ONE object, type $E, and its handle is NOT kept anywhere. The ROM drops
  // D0 on the floor: no `move.l D0,(...)` follows, unlike lines 1, 2 and 4. So whatever
  // type $E is, it finds its own way out.
  const made = stageCreate(ram, BONUS5.newType,
    (t) => rom.u16(DISPATCH + t * 8 + 4));                  // $260336 jsr $241182

  ram.setU16(a6 + 0x00, 0);                                 // $26033C move.w #$0,(A6)
  ram.setU16(a6 + 0x02, 0);                                 // $260340
  return made.ok ? made.addr : null;
}

// ===========================================================================
// W294 -- `$260348`, BONUS LINE 6: FOUR INSTRUCTIONS, AND ONE OF THEM USES A5
// ===========================================================================
//   260348  move.b #$2,($2,A5)      <- the CALLER's object, not the tally record
//   26034e  move.w #$0,(A6)
//   260352  move.w #$0,($2,A6)
//   260358  rts
//
// **THE DRIVER NEVER SETS A5.** `$25FF7A lea $8130FA,A6 / moveq #$1,D7` sets A6 and D7 and
// nothing else, so A5 at entry is whatever the call chain left -- and `$25FF7A`'s three
// callers (`$26059E`, `$2605C2`, `$2607A4`) reach it by `bsr` from inside routines that
// have one. For an object handler that is the object's own record.
//
// So `($2,A5)` is **the caller's object state byte**, and `$2` is exactly the offset
// `SCREEN11.state` uses -- object `[11]`'s state, whose value 2 is `screenState2_25DB7C`,
// the tally call itself. So line 6's whole job is: *tell the object that posted this
// request to advance to its tally state.*
//
// W288 stopped on an A5/A0 question and reverted a finished body. This one is deliberately
// NOT that situation, and the difference is worth stating because it is the judgement call:
//
//   $280252   A0 fed `movem.w ($2,A0),D2-D3` -- a TARGET POSITION read through it. A wrong
//             A0 yields plausible coordinates and plausible motion, silently.
//   $260348   A5 feeds one unconditional `move.b #$2` into a known state offset. A wrong
//             A5 puts a 2 somewhere it does not belong, which is loud, and no arithmetic
//             is derived from it.
//
// So A5 is an explicit PARAMETER here rather than a guess, and the caller supplies it the
// way every object handler in this port already threads its own record.
const BONUS6 = Object.freeze({
  site: 0x260348,
  callerState: 0x02,               // == SCREEN11.state, and value 2 is the tally state
});

/**
 * `$260348` -- bonus line 6.
 *
 * @param a6 the tally record
 * @param a5 THE CALLER'S OBJECT RECORD. The driver does not set A5, so this cannot be
 *   defaulted; a caller with no object of its own has no business running this line.
 */
export function bonusLine6260348(ram, a6, a5) {
  if (a5 === undefined || a5 === null) {
    unreached(BONUS6.site, '$260348 move.b #$2,($2,A5) writes the CALLER\'s object state '
      + 'byte, and $25FF7A never sets A5 -- so the caller must supply it. Passing nothing '
      + 'would write a 2 into $0002, which is neither a record nor an error the drain '
      + 'would catch');
  }
  ram.setU8(a5 + BONUS6.callerState, 2);                    // $260348
  ram.setU16(a6 + 0x00, 0);                                 // $26034E
  ram.setU16(a6 + 0x02, 0);                                 // $260352
}

// ===========================================================================
// W295 -- `$26035A`, BONUS LINE 7: THE COUNTER GOES BACK UP
// ===========================================================================
//   26035a  addq.w #1,$813142       <- the counter $2600D8 DECREMENTS at $260112
//   260360  move.l ($20,A6),D0      the type-$D handle line 2 stored
//   260364  jsr $241298             resolve it to a record
//   26036a  move.b #$3,($2,A0)      set THAT object's state to 3
//   260370  (A6) = 0 / ($2,A6) = 0 / rts
//
// **`$813142` IS THE SAME WORD `$2600D8` SPENDS.** `$260112 subq.w #1,$813142` takes one
// per post and this gives one back, so the pair is a lease rather than a countdown, and
// W273's note that the decrement "is UNGUARDED and wraps past zero" is only half the
// story: nothing guards it because something else is expected to return it.
//
// **AND IT ADVANCES A DIFFERENT OBJECT FROM LINE 6, BY A DIFFERENT ROUTE.**
//
//   line 6  ($2,A5) = 2      the CALLER's object, through a register the driver leaves
//   line 7  ($2,A0) = 3      the TYPE-$D object, through the handle line 2 STORED
//
// So the two lines advance two different objects to two different states, and the only
// reason line 7 can do it safely is that line 2 kept the handle at `($20,A6)`. That is
// now the third wave to depend on line 2's field choice -- W293 killed those fields, and
// this reads one.
//
// A handle that no longer resolves gets `ALLOC.createDummy`, not an error: see
// `resolveHandle241298`. An object dying between the frame that stored its handle and the
// frame that uses it is normal, and the cartridge writes to the dummy and carries on.
const BONUS7 = Object.freeze({
  site: 0x26035a,
  counter: 0x813142,               // the same word $2600D8 decrements
  handleField: 0x20,               // line 2's type-$D handle
  newState: 3,                     // $26036A move.b #$3,($2,A0)
  stateOff: 0x02,
});

/** `$26035A` -- bonus line 7. Returns the record it advanced, dummy included. */
export function bonusLine726035A(ram, a6) {
  ram.setU16(BONUS7.counter, u16(ram.u16(BONUS7.counter) + 1));   // $26035A addq.w #1
  const handle = ram.u32(a6 + BONUS7.handleField);                // $260360 move.l ($20,A6)
  const r = resolveHandle241298(ram, handle);                     // $260364 jsr $241298
  ram.setU8(r.rec + BONUS7.stateOff, BONUS7.newState);            // $26036A
  ram.setU16(a6 + 0x00, 0);                                       // $260370
  ram.setU16(a6 + 0x02, 0);                                       // $260374
  return r;
}

// ===========================================================================
// W296 -- `$26037C`, BONUS LINE 8, AND THE DRIVER `$25FF7A`
// ===========================================================================
//   26037c  lea $8130FA,A2 / lea $81311E,A3       <- BOTH records, like line 5
//   260388  D0 = ($20,A2) / jsr $241298 / clr.b ($5,A0)
//   260396  D0 = ($20,A3) / jsr $241298 / clr.b ($5,A0)
//   2603a4  (A6) = 0 / ($2,A6) = 0 / rts
//
// The FOURTH wave to use line 2's `($20,A6)`: W290 stored it, W293 killed it, W295 read
// it, and this clears a byte on both sides' objects through it.
//
// Like line 7, the write lands on `ALLOC.createDummy` when a handle no longer resolves,
// and that is the cartridge's behaviour rather than an error -- see
// `resolveHandle241298`.
const BONUS8 = Object.freeze({
  site: 0x26037c,
  handleField: 0x20,
  clearOff: 0x05,                  // $260392 / $2603A0 clr.b ($5,A0)
});

/** `$26037C` -- bonus line 8. Clears `($5,A0)` on BOTH sides' type-`$D` objects. */
export function bonusLine826037C(ram, a6) {
  const hit = [];
  for (const rec of [TALLY.side0, TALLY.side1]) {            // A2 then A3
    const r = resolveHandle241298(ram, ram.u32(rec + BONUS8.handleField));
    ram.setU8(r.rec + BONUS8.clearOff, 0);                   // $260392 / $2603A0
    hit.push(r);
  }
  ram.setU16(a6 + 0x00, 0);                                  // $2603A4
  ram.setU16(a6 + 0x02, 0);                                  // $2603A8
  return hit;
}

// ===========================================================================
// `$25FF7A` -- THE DRIVER, AND ALL NINE LINES ARE NOW REACHABLE
// ===========================================================================
//   25ff7a  lea $8130FA,A6 / moveq #$1,D7        TWO records, via dbra
//   25ff82  move.w (A6),D0 / cmpi.w #$0,D0 / beq $25FF9E
//   25ff8c  add.w D0,D0 / add.w D0,D0            the request, *4
//   25ff92  lea ($25FF52,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
//   25ff9e  lea ($24,A6),A6 / dbra D7,$25FF82
//
// **ENTRY 0 IS NULL AND THE GUARD IS THE CODE, NOT THE TABLE.** `$25FF52[0]` really is
// `$00000000`; `$25FF84 cmpi.w #$0,D0 / beq` is what stops a request of 0 jumping to
// address 0. So the null entry is real data -- W279's window covers it deliberately --
// and the port must test the request rather than the table.
//
// THE NINE LINES, and where each one lives:
//
//   1  $25FFA8  bonusLine125FFA8      W289  the counter, the freeze, the lives row
//   2  $260056  bonusLine2260056      W290  CREATES the type-$D and type-$B objects
//   3  $26010E  bonusLine326010E      W291  $2600D8's SECOND ENTRY POINT
//   4  $2601F4  bonusLine42601F4      W292  two loop-2 rules
//   5  $2602B6  bonusLine52602B6      W293  the teardown -- nine kills
//   6  $260348  bonusLine6260348      W294  advances the CALLER through A5
//   7  $26035A  bonusLine726035A      W295  returns the lease, advances type-$D
//   8  $26037C  bonusLine826037C      W296  clears a byte on both type-$D objects
//   9  $2603B0  setPanel2603B0        (player.js, earlier) the SET/bonus panel
//
// Line 9 was already ported and nobody had noticed it was a bonus line: `player.js`
// describes it as "jump-table entry 9 of `$25FF7A`" in its own words, so the connection
// was recorded and the table that needed it did not exist yet.
//
// **LINES 6 AND 7 NEED THINGS THE DRIVER DOES NOT HAVE.** Line 6 needs A5, the caller's
// object record, which `$25FF7A` never sets (W294); line 9 needs a ctx for its counted
// note. So the driver takes both and passes them on, rather than pretending the ROM's
// register state is reconstructible from the record alone.
const LINE_COUNT = 9;

/**
 * `$25FF7A` -- run one frame of the tally for BOTH records.
 *
 * @param a5 the caller's object record. `$25FF7A` does not set A5 and line 6 writes
 *   through it, so it is threaded rather than guessed. See `bonusLine6260348`.
 * @returns the request each record ran, `[side0, side1]`, 0 meaning idle.
 */
export function tallyDriver25FF7A(ram, rom, ctx, a5) {
  const ran = [];
  for (const a6 of [TALLY.side0, TALLY.side1]) {             // $25FF7A / $25FF9E, dbra
    const req = ram.u16(a6 + 0x00);                          // $25FF82 move.w (A6),D0
    ran.push(req);
    if (req === 0) continue;                                 // $25FF84 cmpi.w #$0 / beq
    if (req > LINE_COUNT) {
      // $25FF92's table is ten longwords and entry 0 is null, so a request past 9 reads
      // `$25FF7A`'s own `lea` as a pointer and jumps into it. The port refuses instead.
      unreached(0x25ff92, `$25FF92 indexes $25FF52 by request ${req}, and the table is `
        + `TEN longwords whose entry 0 is null -- so ${req} would read $${
          (0x25ff52 + req * 4).toString(16).toUpperCase()}, which is $25FF7A's own code. `
        + `Only requests 1..${LINE_COUNT} are lines`);
    }
    switch (req) {
      case 1: bonusLine125FFA8(ram, rom, ctx, a6); break;
      case 2: bonusLine2260056(ram, rom, ctx, a6); break;
      case 3: bonusLine326010E(ram, rom, ctx, a6); break;
      case 4: bonusLine42601F4(ram, rom, ctx, a6); break;
      case 5: bonusLine52602B6(ram, rom, ctx, a6); break;
      case 6: bonusLine6260348(ram, a6, a5); break;
      case 7: bonusLine726035A(ram, a6); break;
      case 8: bonusLine826037C(ram, a6); break;
      default: setPanel2603B0(ram, ctx, a6); break;          // 9
    }
  }
  return ran;
}

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
  return tallyBody260112(ram, rom, ctx, a6, d0);
}

/**
 * `$26010E` -- **BONUS LINE 3, AND IT IS `$2600D8`'S SECOND ENTRY POINT.**
 *
 *   26010e: movem.l D0-D7/A0-A6,-(A7)      <- and then FALLS INTO $260112
 *
 * W273 read this and wrote it down -- "`$26010E` is a distinct entry that skips the side
 * setup" -- without knowing what used it. `$25FF52[3]` is what uses it: bonus line 3 is
 * the same body as `$2600D8` with the side selection skipped, because `$25FF7A`'s driver
 * has ALREADY put the record in A6 and walks both of them itself.
 *
 * So line 3 needed no new code, only the entry exposed. Fourth time this session after
 * `$23F294` = `$23F1FA` (W275), kind 16's hook (W286) and the eight finish hooks (W287) --
 * and the only one of the four that a previous wave had already half-noticed.
 *
 * @param a6 the record the DRIVER chose, not one this routine picks
 * @param d0 the caller's D0, whose high word survives into `+$18` (see the body)
 */
export function bonusLine326010E(ram, rom, ctx, a6, d0 = 0) {
  return tallyBody260112(ram, rom, ctx, a6, d0);
}

/** `$260112..$2601F2` -- the body both entry points share. */
function tallyBody260112(ram, rom, ctx, a6, d0) {
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
