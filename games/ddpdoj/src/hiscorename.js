// THE NAME-ENTRY SCREEN -- `$28F428`/`$28F482` and what they do with a tagged row.  W305.
//
// W304 found the two routines that USE the `$FF`/`$FE` tag. This is the screen that calls one
// of them, and it closes the last open thread in the subsystem: what `$8130CC`'s two bits are
// for, end to end.
//
// ============================ THE `$8130CC` THREAD, CLOSED ==================
//
// Five waves, one bit each:
//
//   $26007C / $260092   bonus line 2 sets bit 0 or bit 1 -- "this side MADE the table"  (W300)
//   $28F32C / $28F348   a second caller of $287BD2/$287C08 sets the same bits           (W301)
//   $28F350             move.b $8130CC,($5,A5) -- the screen COPIES them into its object
//   $28F358             tst.b ($5,A5) / bne -> jsr $28CB74, the entry BGM cue           (W301)
//   $28F6C8             bclr <side>,($5,A5) when that side has no tagged row left
//
// So the byte is a work list: **one bit per side that owes a name.** `$28F6C8` clears a side's
// bit when the lookup cannot find its tag, and when the byte reaches zero it writes
// `move.b #$2,($2,A5)` -- the screen's own state -- and the name entry is over. The bit
// numbering agrees at both ends: `ori.b #$1`/`#$2` sets bits 0 and 1, and `bclr D0,($5,A5)`
// with D0 taken straight from `($2C,A4)` clears bit 0 or bit 1.
//
// ============================ AND THE LOOKUP'S CARRY IS IMPLICIT ============
//
// `$28F430 bcc $28F43A` reads a carry that `$28F6F4` never sets explicitly:
//
//   the MISS path   moveq #$0,D0 / subq.w #1,D0     0 - 1 BORROWS -> carry SET
//   the HIT path    ... add.w D0,D0 / lea / adda.w  the doubling does not carry, and
//                                                  neither `lea` nor `adda` touches the flags
//
// So **carry SET means not found**, and the hit path's carry-clear is a side effect of the last
// `add.w` rather than a decision. It is correct for a five-entry table because the largest
// index is 4 and `4 * 4` cannot carry out of a word; it would be fragile in a bigger one.
//
// That is the FOURTH routine this session whose whole answer is the carry, after `$287D96`
// (a borrow), `$287C3E` (an explicit `ori`/`andi`) and `$25B412` (`ori` against
// `move.w D0,D0`). Worth keeping as the habit W303 named: in this cartridge, check how a
// routine leaves the carry before deciding it returns nothing.

import { u16 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { tagLookupForSide, tagForSide } from './hiscore.js';
import { chainLoader246704 } from './stageend.js';

/**
 * The name-entry record, `A4`. Every offset here is a store this wave transcribed, so the
 * names are the ROM's own semantics rather than a guess at a struct.
 */
export const NAME_REC = Object.freeze({
  state: 0x02,          // $28F412 move.w ($2,A4),D7 / bne -- non-zero leaves state 0
  blockA: 0x06,         // $28F796..  the twelve-word per-side block, in ITS order
  blockB: 0x08,
  digits: 0x0a,         // $28F762 move.w D2,($A,A4)      -- D2's LOW half
  score: 0x0c,          // $28F75E move.l (A1),($C,A4)    -- the score long itself
  overflow: 0x10,       // $28F768 after swap D2          -- D2's HIGH half
  // W308 CORRECTION. W305 called this `live` and had the P1 arm write 1 for BOTH sides. It is
  // the SETUP BIT NUMBER: `$28F41A move.w #$1,($12,A4)` in the P1 block and
  // `$28F472 move.w #$2,($12,A4)` in the P2 block -- the same 1 and 2 that `$28F77A`/`$28F788`
  // put in D0 for `bset D0,$81E0D9`, and that `$28F6B0 bclr D1,$81E0D9` takes back out.
  //
  // Writing 1 for P2 was a real defect, not a naming slip: `$28F6B0` would clear P1's bit for
  // a P2 name, P2's would stay set forever, and `$28F506 tst.w $81E0D8` would then freeze the
  // countdown permanently. W305's test only checked side 0, which is why it passed.
  setupBit: 0x12,
  side: 0x2c,           // $28F420 clr.w ($2C,A4) -- 0 for P1; W304's `not.b` input
  cursor: 0x2e,         // $28F424 clr.w ($2E,A4)
  entry: 0x30,          // $28F75A move.l A0,($30,A4) -- the matched 12-byte row's ADDRESS
  input: 0x36,          // $28F40E move.w D0,($36,A4) -- readInput23D186's word
  index: 0x38,          // $28F76C move.w D1,($38,A4) -- the row index
  ship: 0x3a,           // $28F770 move.w D3,($3A,A4)  -- D3's LOW half
  style: 0x3c,          // $28F776 after swap D3       -- D3's HIGH half
});

/** The object record, `A5`. `($5)` is the `$8130CC` copy `$28F350` makes. */
export const NAME_OBJ = Object.freeze({
  state: 0x02,          // $28F6DA move.b #$2,($2,A5)
  owed: 0x05,           // $28F350 move.b $8130CC,($5,A5)
  doneState: 0x02,      // the value written, which is also the field -- both are 2
});

// `$28F796..$28F7C6` copies TWELVE words into these A4 offsets, in this order. They are not
// contiguous and they are not ascending past `($8)`, so the order is the data's and a port
// that sorted them would pair the wrong word with the wrong field.
const BLOCK_FIELDS = Object.freeze([
  0x06, 0x08, 0x14, 0x16, 0x18, 0x1e, 0x20, 0x22, 0x24, 0x26, 0x28, 0x2a,
]);

export const NAME_SCREEN = Object.freeze({
  p1: 0x28f428, p2: 0x28f482,
  cache: 0x28f75a,
  giveUp: 0x28f6c8,
  flags: 0x8130cc,               // the source of ($5,A5)
  setupFlag: 0x81e0d9,           // $28F790 bset D0,$81E0D9
  // $28F97C and $28F994, twelve words each and exactly adjacent: $28F97C + $18 == $28F994.
  blocks: Object.freeze([0x28f97c, 0x28f994]),
  blockWords: 12,
  // $28F77A moveq #$1,D0 / $28F788 moveq #$2,D0 -- so the bits are 1 and 2, NOT 0 and 1.
  setupBits: Object.freeze([1, 2]),
});

/**
 * `$28F75A` -- cache the matched row into the record and install the side's setup block.
 *
 * @param found the result of W304's `tagLookupForSide`
 *
 * The `swap` pairs land the HIGH half in the SECOND field of each pair: `($A)` takes D2's low
 * (digits) and `($10)` its high (overflow); `($3A)` takes D3's low (ship) and `($3C)` its high
 * (style). Same shape twice, and the two fields of a pair are far apart in the record, so
 * getting one round the wrong way is invisible until something reads it.
 */
export function nameCache28F75A(ram, rom, a4, found) {
  ram.setU32(a4 + NAME_REC.entry, found.entry >>> 0);      // $28F75A move.l A0,($30,A4)
  ram.setU32(a4 + NAME_REC.score, ram.u32(found.score));   // $28F75E move.l (A1),($C,A4)
  ram.setU16(a4 + NAME_REC.digits, found.d2 & 0xffff);     // $28F762 move.w D2
  ram.setU16(a4 + NAME_REC.overflow, found.d2 >>> 16);     // $28F766 swap / $28F768
  ram.setU16(a4 + NAME_REC.index, u16(found.index));       // $28F76C move.w D1
  ram.setU16(a4 + NAME_REC.ship, found.d3 & 0xffff);       // $28F770 move.w D3
  ram.setU16(a4 + NAME_REC.style, found.d3 >>> 16);        // $28F774 swap / $28F776

  // $28F77A/$28F782/$28F788 -- the side picks BOTH the setup bit and the block. The bit is the
  // same value the arm put in `($12,A4)`, which is what `$28F6B0` later uses to clear it.
  const side = ram.u16(a4 + NAME_REC.side) !== 0 ? 1 : 0;  // $28F782 tst.w ($2C,A4) / beq
  const bit = NAME_SCREEN.setupBits[side];                 // moveq #$1 / moveq #$2
  const block = NAME_SCREEN.blocks[side];                  // lea ($28F97C) / ($28F994)
  ram.setU8(NAME_SCREEN.setupFlag,                         // $28F790 bset D0,$81E0D9
    ram.u8(NAME_SCREEN.setupFlag) | (1 << bit));

  for (const [i, field] of BLOCK_FIELDS.entries()) {        // $28F796..$28F7C2, twelve
    ram.setU16(a4 + field, rom.u16(block + i * 2));
  }
}

/**
 * `$28F6C8` -- this side has no tagged row, so drop it from the work list.
 *
 * @returns {boolean} whether the whole list is now empty, which is the frame the screen ends.
 *
 * `bne $28F6C6` on a non-zero byte lands on a bare `rts`, so a side dropping out while the
 * other still owes a name changes nothing else. Only the last one to go writes the state.
 */
export function nameGiveUp28F6C8(ram, a4, a5) {
  const side = ram.u16(a4 + NAME_REC.side);                // $28F6C8 move.w ($2C,A4),D0
  ram.setU8(a5 + NAME_OBJ.owed,                            // $28F6CC bclr D0,($5,A5)
    ram.u8(a5 + NAME_OBJ.owed) & ~(1 << (side & 7)) & 0xff);
  if (ram.u8(a5 + NAME_OBJ.owed) !== 0) return false;      // $28F6D0 tst.b / $28F6D4 bne
  ram.setU8(a5 + NAME_OBJ.state, NAME_OBJ.doneState);      // $28F6DA move.b #$2,($2,A5)
  return true;
}

/**
 * `$28F428` (P1) and `$28F482` (P2) -- byte-identical twins whose only difference is which
 * lookup head they `bsr`, which is to say which tag they search for.
 *
 * @returns {boolean} whether a tagged row was found and cached. `false` means the side was
 *   dropped from the work list, and the second return value of that is in `$28F6C8`.
 */
export function nameArm28F428(ram, rom, a4, a5, side) {
  if (side !== 0 && side !== 1) {
    unreached(NAME_SCREEN.p1, `the name-entry arms are a P1/P2 pair, so the side must be 0 `
      + `or 1; ${side} has no tag, since $287C3E only ever stamps $FF and $FE`);
  }
  // $28F41A/$28F420/$28F424 -- the arm's own setup, before the lookup. The setup-bit number is
  // 1 for P1 and 2 for P2, from two separate `move.w` immediates at $28F41A and $28F472.
  ram.setU16(a4 + NAME_REC.setupBit, NAME_SCREEN.setupBits[side]);
  ram.setU16(a4 + NAME_REC.side, side);                    // $28F420 clr.w ($2C,A4) for P1
  ram.setU16(a4 + NAME_REC.cursor, 0);                     // $28F424 clr.w ($2E,A4)

  const found = tagLookupForSide(ram, side);               // $28F42C / $28F486 bsr
  if (!found.found) {                                      // $28F430 bcc -- carry SET = miss
    nameGiveUp28F6C8(ram, a4, a5);                         // $28F436 / $28F490 bra $28F6C8
    return false;
  }
  nameCache28F75A(ram, rom, a4, found);                    // $28F43A / $28F494 bsr $28F75A
  return true;
}

/** The tag each arm searches for, exposed so a caller cannot get the pair backwards. */
export const NAME_ARMS = Object.freeze([
  Object.freeze({ site: 0x28f428, side: 0, tag: tagForSide(0), lookup: 0x28f6e2 }),
  Object.freeze({ site: 0x28f482, side: 1, tag: tagForSide(1), lookup: 0x28f6ea }),
]);

// ===========================================================================
// W307 -- THE GRID'S FURNITURE, AND FOUR BUCKETS IN ONE SCREEN
// ===========================================================================
// Three straight-line draw routines, all built from immediates, all the shape W303 ported for
// `$25B4D6`. What makes them worth their own block is what they reveal about the emitter.
//
// ## FOUR STUBS, AND THIS TIME THEY REALLY ARE DIFFERENT BUCKETS
//
// W303 assumed `$23DECE` and `$23DFB4` were different draw layers, measured them, and found one
// bucket behind both. Here the same measurement gives the opposite answer:
//
//     $23DECE -> bucket 0        $23DF2A -> bucket 2        $23DF58 -> bucket 3
//
// `$28FCAA` alone uses three of them in four calls. So "stub address implies layer" is false and
// "stub address implies nothing" is also false: it has to be resolved, every time, which is
// exactly what `resolveEmitStub` is for. The lesson from W303 was the inference, not the answer.
//
// ## THE POSITION IS TWO INSTRUCTIONS, AND THE CARRY IS HARMLESS BY CONSTRUCTION
//
// Every part is `move.l #base,D1 / addi.l #delta,D1` with a negative delta. It is a LONGWORD add,
// so in principle the low half carries into the high half -- and MEASURED, in all EIGHT parts
// across the three routines, it does, by exactly bit 16 every time.
//
// It makes no difference. `$23DECE` and its siblings pack `D1 >> 6` and mask, and that mask
// drops the bit for all eight: feeding the emitter the longword result and the per-axis result
// produces byte-identical records. So the two-instruction pair really is a **signed per-axis
// encoding** that happens to be spelled as one 32-bit add, and the carry is discarded
// downstream rather than meaning anything.
//
// Worth writing down in that direction rather than as a warning. My first draft of this comment
// claimed a port adding the halves independently would be "one unit out in Y"; the test showed
// the emitter cannot tell the two apart, so the warning was for a bug that cannot happen. The
// longword add is transcribed because it is what the ROM does, not because it is observable.
//
// ## THE ONE-SIDE ARMS ARE THE SAME TWO SPRITES, MIRRORED
//
// `$28FD2C` (only P2 owes) and `$28FD6E` (only P1 owes) are twins: same two art longs, same two
// D3s, and they differ in the D1 low words -- the X -- and in D4, which is `$03` on one side and
// `$43` on the other. **`$43` is `$03 | $40`**, so the difference is one bit, and both of them
// end in a tail `jmp` rather than a `jsr`+`rts`.
//
// Both are called only when EXACTLY ONE side owes a name: `$28F4D4 cmpi.b #$3,D0 / beq $28F4F4`
// skips both when the work list has both bits set. So the screen draws this furniture to fill
// the half nobody is using, which is why there is nothing to draw when both halves are busy.
const GRID_ROW = Object.freeze({
  // $28FCAA..$28FD24, four calls. `stub` is resolved per call, never assumed.
  cursor: Object.freeze([
    Object.freeze({ at: 0x28fcc4, base: 0x2a001c00, delta: 0xee00ea00,
      art: 0x322f78, d3: 0x12b0, d4: 0x04, stub: 0x23dece }),
    Object.freeze({ at: 0x28fce4, base: 0x38001c00, delta: 0xc800e400,
      art: 0x31fe3c, d3: 0x38e0, d4: 0x02, stub: 0x23df2a }),
    Object.freeze({ at: 0x28fd04, base: 0x38001c00, delta: 0xc800e400,
      art: 0x323c60, d3: 0x38e0, d4: 0x03, stub: 0x23df58 }),
    Object.freeze({ at: 0x28fd24, base: 0x62801c40, delta: 0xfa00ea00,
      art: 0x31f9b8, d3: 0x06b0, d4: 0x04, stub: 0x23df58 }),
  ]),
  // $28FD2C (P2-only) and $28FD6E (P1-only): index 0 is the side that OWES.
  soleSide: Object.freeze([
    Object.freeze({ site: 0x28fd6e, parts: Object.freeze([
      Object.freeze({ base: 0x4e802b80, delta: 0xf600f500, art: 0x31fbcc, d3: 0x0a58, d4: 0x43 }),
      Object.freeze({ base: 0x42002b00, delta: 0xfc00f500, art: 0x31fd88, d3: 0x0458, d4: 0x43 }),
    ]) }),
    Object.freeze({ site: 0x28fd2c, parts: Object.freeze([
      Object.freeze({ base: 0x4e800c80, delta: 0xf600f500, art: 0x31fbcc, d3: 0x0a58, d4: 0x03 }),
      Object.freeze({ base: 0x42000d00, delta: 0xfc00f500, art: 0x31fd88, d3: 0x0458, d4: 0x03 }),
    ]) }),
  ]),
  soleStub: 0x23df58,
  flipBit: 0x40,                 // $43 is $03 | $40
  cursorField: 0x2e,             // $28F4C4 tst.w ($2E,A4) / beq
  bothOwed: 0x03,                // $28F4D4 cmpi.b #$3,D0 / beq -- neither arm runs
  active: 0x81e0d6,              // $28F4AC move.w #$1,$81E0D6
  animScript: 0x28fa98,          // $28F4B4 lea ($28FA98,PC),A0
  animDriver: 0x246410,          // $28F4BA jsr -- the declared presentation tier
});

// ===========================================================================
// W308 -- THE COUNTDOWN, AND A WORD TEST THAT IS REALLY A BYTE TEST
// ===========================================================================
// `($1E,A4)` is a countdown, and `$28F532 beq $28F6D8` on it reaching zero lands on the SAME two
// instructions `$28F6C8` reaches when the work list empties: `move.b #$2,($2,A5)` and `rts`. So
// **the name entry has two ways to end** -- nobody left to name, and running out of time -- and
// they share one exit.
//
// ## `tst.w $81E0D8` READS THE SETUP-BIT BYTE
//
// `$28F506 tst.w $81E0D8 / bne $28F540` suspends the countdown. `$81E0D8` looks like its own
// flag and is not one: the word spans `$81E0D8` and `$81E0D9`, and **`$81E0D8` has no writer
// anywhere in the build** -- scanned it. The only things that ever change that word are
// `$28F790 bset D0,$81E0D9` (W305) and `$28F6B0 bclr D1,$81E0D9`, so the word test reduces
// exactly to "is any side still being set up".
//
// Which is worth writing down because it is fragile in a way the ROM gets away with: anything
// that ever wrote a non-zero `$81E0D8` would freeze the countdown forever, and nothing does.
//
// ## AND THE BIT IS RELEASED BY `($12,A4)`
//
// `$28F6AC move.w ($12,A4),D1 / $28F6B0 bclr D1,$81E0D9`, immediately after `$28F6A8 bsr
// $28F7C8` -- the name writer. So the sequence is: the arm records the side's bit number in
// `($12,A4)`, `$28F790` sets it, the name is written, and `$28F6B0` clears it. That is the pair
// W305 saw only half of, and getting `($12,A4)` wrong is what made W305's P2 arm a defect.
//
// ## THE FRAME COUNTER HAS TWO THRESHOLDS
//
//     28f542  addq.w #1,($2,A4)        the screen's own frame counter
//     28f54a  cmpi.w #$30,D7 / bcc     below 48 frames -> draw only, no input
//     28f556  cmpi.w #$738,D7 / bcc    at or past 1848 -> $28F606
//
// Both are UNSIGNED (`bcc` is carry-clear, i.e. >=). $30 is a short lead-in during which the
// screen ignores input, and $738 is 1848 frames -- a little over thirty seconds at 60Hz, which
// is a name-entry time limit. The countdown at `($1E,A4)` is a separate, shorter one.
const TIMEOUT = Object.freeze({
  counter: 0x1e,               // ($1E,A4) -- block word 5, starts 0
  suspend: 0x81e0d8,           // $28F506 tst.w -- spans $81E0D9, and has NO writer of its own
  setupFlagByte: 0x81e0d9,
  reload: 0x30,                // $28F514/$28F536 cmpi.w #$30
  reloadScript: 0x28fad2,      // $28F520 lea ($28FAD2,PC),A0
  reloadLoader: 0x246704,      // $28F526 jsr -- the D6=1 sibling W308 added
  endSite: 0x28f6d8,           // $28F532 beq -- the SAME exit $28F6C8 uses
  frame: 0x02,                 // ($2,A4)
  leadIn: 0x30,                // $28F54A cmpi.w #$30 / bcc
  limit: 0x738,                // $28F556 cmpi.w #$738 / bcc -> $28F606
  drawSite: 0x28f7f4,          // the shared panel draw, $28F7F4..$28F8AA
  inputField: 0x36,            // ($36,A4) -- readInput23D186's word, W305
});

/** `$28F6AC`/`$28F6B0` -- release the side's setup bit after the name is written. */
export function nameReleaseSetup28F6B0(ram, a4) {
  const bit = ram.u16(a4 + NAME_REC.setupBit);              // $28F6AC move.w ($12,A4),D1
  ram.setU8(TIMEOUT.setupFlagByte,                          // $28F6B0 bclr D1,$81E0D9
    ram.u8(TIMEOUT.setupFlagByte) & ~(1 << (bit & 7)) & 0xff);
}

/**
 * `$28F4FC..$28F540` -- the countdown arm, taken whenever `($1E,A4)` is non-zero.
 *
 * @returns {'idle'|'suspended'|'nocursor'|'reloaded'|'ticked'|'expired'}
 *   `idle` means the countdown is not running and the caller should take the input path.
 */
export function nameCountdown28F4FC(ram, rom, a4, a5, ctx) {
  if (ram.u16(a4 + TIMEOUT.counter) === 0) return 'idle';  // $28F4FC tst.w / $28F500 beq

  ctx?.unportedLog?.note(TIMEOUT.drawSite, '$28F502 bsr $28F7F4 -- the name-entry panel draw, '
    + '$28F7F4..$28F8AA, an emitter chain of immediates that ends exactly where W306\'s '
    + 'banned-name table begins');

  // $28F506 -- the word spans $81E0D9 and $81E0D8 itself has no writer, so this is exactly
  // "is any side still being set up".
  if (ram.u16(TIMEOUT.suspend) !== 0) return 'suspended';   // $28F50C bne $28F540
  if (ram.u16(a4 + GRID_ROW.cursorField) === 0) return 'nocursor';   // $28F50E tst.w / beq

  if (ram.u16(a4 + TIMEOUT.counter) === TIMEOUT.reload) {   // $28F514 cmpi.w #$30 / bne
    ram.setU16(a4 + TIMEOUT.counter, u16(ram.u16(a4 + TIMEOUT.counter) - 1));  // $28F51C subq
    chainLoader246704(ram, rom, TIMEOUT.reloadScript, ctx); // $28F520 lea / $28F526 jsr
    return 'reloaded';                                     // $28F52C rts
  }

  const left = u16(ram.u16(a4 + TIMEOUT.counter) - 1);      // $28F52E subq.w #1
  ram.setU16(a4 + TIMEOUT.counter, left);
  if (left === 0) {                                        // $28F532 beq $28F6D8
    ram.setU8(a5 + NAME_OBJ.state, NAME_OBJ.doneState);     // $28F6DA move.b #$2,($2,A5)
    return 'expired';
  }
  // $28F536 cmpi.w #$30 / bne / $28F53E moveq #$20,D2 -- reachable only from $31, and D2 is
  // never read again on either path. Transcribed as a no-op because that is what it is.
  return 'ticked';
}

/**
 * `$28F542..$28F55C` -- the frame counter's two thresholds.
 *
 * @returns {'leadin'|'input'|'over'} `leadin` draws and ignores input, `over` is `$28F606`.
 */
export function nameFrameBands28F542(ram, a4, ctx) {
  const n = u16(ram.u16(a4 + TIMEOUT.frame) + 1);          // $28F542 addq.w #1,($2,A4)
  ram.setU16(a4 + TIMEOUT.frame, n);
  if (n < TIMEOUT.leadIn) {                                // $28F54A cmpi.w #$30 / bcc
    ctx?.unportedLog?.note(TIMEOUT.drawSite,
      '$28F550 bsr $28F7F4 -- the panel draw, on the lead-in path');
    return 'leadin';                                       // $28F554 rts
  }
  if (n >= TIMEOUT.limit) {                                // $28F556 cmpi.w #$738 / bcc
    ctx?.unportedLog?.note(0x28f606, '$28F55A bcc $28F606 -- the name-entry TIME LIMIT arm at '
      + `frame $${TIMEOUT.limit.toString(16)} (${TIMEOUT.limit} frames, just over thirty `
      + 'seconds at 60Hz); its body is not in this wave');
    return 'over';
  }
  return 'input';
}

/**
 * `$28F4A6` -- arm the grid: cursor to 1, the global active flag to 1, and hand `$28FA98` to
 * the animation driver.
 *
 * `$246410` is the anim-object driver `stageend.js` declares out of scope as
 * `PRESENTATION_DEVIATION[0x28d6fc]`, and W303 counted `$246710`'s content seeding for the same
 * reason. So this is COUNTED, not invented -- the third place this session that the same tier
 * has been reached from a different direction, which is worth knowing when someone finally
 * decides to port it.
 */
export function nameArmGrid28F4A6(ram, a4, ctx) {
  ram.setU16(a4 + GRID_ROW.cursorField, 1);            // $28F4A6 move.w #$1,($2E,A4)
  ram.setU16(GRID_ROW.active, 1);                      // $28F4AC move.w #$1,$81E0D6
  ctx?.unportedLog?.note(GRID_ROW.animDriver, `$28F4BA jsr $246410 with A0 = $28FA98 -- the `
    + `name-entry grid's animation objects. Same presentation tier stageend.js declares out `
    + `of scope (PRESENTATION_DEVIATION[0x28d6fc]) and W303 counted $246710's seeding for; `
    + `the cursor and the furniture around it ARE drawn, by $28FCAA`);
}

/** `move.l #base,D1 / addi.l #delta,D1` -- a LONGWORD add, so the halves are not independent. */
const packD1 = (base, delta) => ((base + delta) >>> 0);

/** `$28FCAA` -- the cursor and grid furniture. Four calls across THREE buckets. */
export function drawGrid28FCAA(ram, rom) {
  for (const p of GRID_ROW.cursor) {
    enqueueRegistersThroughStub(ram, rom, p.stub, packD1(p.base, p.delta), p.art, p.d3, p.d4);
  }
}

/**
 * `$28FD6E` / `$28FD2C` -- the furniture for the half nobody is entering a name in.
 *
 * @param side which side OWES the name, so 0 selects `$28FD6E` and 1 selects `$28FD2C`
 */
export function drawSoleSide(ram, rom, side) {
  const spec = GRID_ROW.soleSide[side];
  if (!spec) {
    unreached(GRID_ROW.soleSide[0].site, `the sole-side furniture is a P1/P2 pair; ${side} `
      + `selects neither, and $28F4DA/$28F4E8 only ever test bits 0 and 1`);
  }
  for (const p of spec.parts) {
    // $28FD46 jsr and $28FD66 jmp -- a tail jump, but the same call.
    enqueueRegistersThroughStub(ram, rom, GRID_ROW.soleStub,
      packD1(p.base, p.delta), p.art, p.d3, p.d4);
  }
}

/**
 * `$28F4C4..$28F4F2` -- the grid's per-frame dispatch.
 *
 * @param a4 the name-entry record; `($2E)` gates the cursor draw
 * @param a5 the object; `($5)` is the work list
 *
 * The work-list test is the part worth transcribing carefully: `cmpi.b #$3,D0 / beq` leaves
 * BEFORE either `btst`, so with both sides owing a name neither arm draws. Reading it as a
 * two-way choice would draw one side's furniture over a half that is in use.
 */
export function drawGridFrame28F4C4(ram, rom, a4, a5) {
  if (ram.u16(a4 + GRID_ROW.cursorField) !== 0) {      // $28F4C4 tst.w / $28F4C8 beq
    drawGrid28FCAA(ram, rom);                          // $28F4CA jsr ($28FCAA,PC)
  }
  const owed = ram.u8(a5 + NAME_OBJ.owed);             // $28F4D0 move.b ($5,A5),D0
  if (owed === GRID_ROW.bothOwed) return 'both';       // $28F4D4 cmpi.b #$3 / beq $28F4F4
  if ((owed & 0x01) !== 0) {                           // $28F4DA btst #$0,D0
    drawSoleSide(ram, rom, 0);                         // $28F4E0 jsr ($28FD6E,PC)
    return 'p1';
  }
  if ((owed & 0x02) !== 0) {                           // $28F4E8 btst #$1,D0
    drawSoleSide(ram, rom, 1);                         // $28F4EE jsr ($28FD2C,PC)
    return 'p2';
  }
  return 'none';                                       // $28F4EC beq $28F4F4
}

// ===========================================================================
// W306 -- THE BANNED-NAME FILTER, AND THE ALPHABET IT PROVES
// ===========================================================================
// `$28F674 lea ($28F8AC,PC),A1` and then a loop with no counter:
//
//     28f67a  movea.l ($30,A4),A0        the player's OWN row, every iteration
//     28f67e  move.l (A1),D0
//     28f680  cmpi.l #$FFFFFFFF,D0
//     28f686  beq $28F6A8                the TERMINATOR -> the name is allowed, commit
//     28f688  cmp.l (A0),D0              character 0
//     28f68a  bne $28F6A2
//     28f68c  move.l ($4,A1),D0 / cmp.l ($4,A0),D0 / bne $28F6A2       character 1
//     28f696  move.l ($8,A1),D0 / cmp.l ($8,A0),D0 / beq $28F59E       character 2 -> REJECT
//     28f6a2  adda.w #$C,A1 / bra $28F67A
//
// So the table is 12-byte entries -- three character longs, the same shape as a high-score
// name -- ending in a `$FFFFFFFF` sentinel rather than a count. **And the sentinel is only its
// FIRST long**: `$28F978` holds `$FFFFFFFF` and `$28F97C` is already the P1 setup block W305
// windowed. The `beq` fires on the first long, so the other eight bytes of that "entry" are
// somebody else's data. Sizing the window to whole entries would overlap the block.
//
// ## THE TABLE DECODES AS WORDS, WHICH VERIFIES THREE WAVES OF INFERENCE
//
// W301 inferred from the factory data that a stored character is an index times four. W302
// found the instruction that requires it (`move.l (A0,D2.w),D2`, unscaled, over a table of
// longs). W304 showed the tag cannot collide with one. None of that said what index 0 IS.
//
// Divide each value by four and read 0 as 'A':
//
//     AAA  AHO  ASS  AUM  DIE  ETA  FUC  FUK  HIV  IRA  KKK  PEE  PIS  PLO  SEX  <28><28><28>
//
// Fourteen of the seventeen are recognisable English or Japanese, and `SEX` = 18,4,23 and
// `KKK` = 10,10,10 fix the mapping exactly. **It is a profanity filter**, and a natural-language
// decode is about as independent a check on an index convention as this port can get.
//
// The seventeenth is index 28 three times, which is the glyph AFTER the font's null hole at 27
// (W302). So the alphabet is A..Z at 0..25 and three more slots at 26, 27 and 28, of which 27
// is unused -- and the font's 29 entries with a hole are exactly that shape.
//
// ## AND THE REJECTION IS A SUBSTITUTION, NOT A RETRY
//
//     28f59e  movea.l ($30,A4),A0 / movea.l A0,A1
//     28f5a4  move.l #$C,(A1)+           index 3
//     28f5aa  move.l #$C,(A1)+           index 3
//     28f5b0  move.l #$3C,(A1)+          index 15
//     28f5b6  move.w #$3,($16,A4)        mark the name complete
//     28f5bc  bra $28F6A8                and COMMIT it
//
// 3, 3, 15 is **`DDP`** -- the game's own initials. A banned name is silently replaced and
// entered anyway; the player is never asked again. That is a third independent confirmation of
// the alphabet, from two constants in the code rather than from a table.
export const NAME_ALPHA = Object.freeze({
  scale: 4,                    // a stored character is its index times four
  letterA: 0,                  // index 0 is 'A', fixed by SEX and KKK decoding
  letters: 26,
  hole: 27,                    // W302: `$00000000` in both fonts at offset $6C
  last: 28,
  table: 0x28f8ac,             // $28F674 lea ($28F8AC,PC),A1
  entries: 17,
  sentinel: 0x28f978,          // holds $FFFFFFFF; only the FIRST long is the terminator
  stride: 12,
  countField: 0x16,            // $28F66A cmpi.w #$3,($16,A4) -- characters entered
  chars: 3,
  replacement: Object.freeze([0x0c, 0x0c, 0x3c]),   // $28F5A4/$28F5AA/$28F5B0 -- D, D, P
  rejectSite: 0x28f59e,
  scanSite: 0x28f674,
});

/** A stored character value as a letter, for messages and tests. Not a ROM routine. */
export function charName(value) {
  const i = value / NAME_ALPHA.scale;
  if (!Number.isInteger(i) || i < 0 || i > NAME_ALPHA.last) return `<$${value.toString(16)}>`;
  if (i < NAME_ALPHA.letters) return String.fromCharCode(65 + i);
  return `<${i}>`;
}

/** The seventeen banned names, read out of the ROM rather than restated here. */
export function bannedNames(rom) {
  return Array.from({ length: NAME_ALPHA.entries }, (_, i) =>
    [0, 1, 2].map((k) => rom.u32(NAME_ALPHA.table + i * NAME_ALPHA.stride + k * 4)));
}

/**
 * `$28F664`'s gate plus `$28F674..$28F6A8` -- check the entered name and commit it.
 *
 * @returns {'incomplete'|'allowed'|'replaced'} `incomplete` is `$28F670 bcs $28F6C6`, the bare
 *   `rts`: fewer than three characters entered and nothing happens at all.
 *
 * The scan has NO counter -- it runs until the sentinel or a full three-long match -- so a
 * table without its `$FFFFFFFF` would walk into the setup block and then into code. That is
 * worth saying because the sentinel is the only thing bounding it.
 */
export function nameFilter28F674(ram, rom, a4) {
  if (ram.u16(a4 + NAME_ALPHA.countField) < NAME_ALPHA.chars) {   // $28F66A cmpi / $28F670 bcs
    return 'incomplete';
  }
  const row = ram.u32(a4 + NAME_REC.entry);                       // $28F67A movea.l ($30,A4)
  const entered = [0, 1, 2].map((k) => ram.u32(row + k * 4));

  let a1 = NAME_ALPHA.table;                                      // $28F674 lea
  for (;;) {
    if (a1 > NAME_ALPHA.sentinel) {
      unreached(NAME_ALPHA.scanSite, `$28F674's scan passed $${
        NAME_ALPHA.sentinel.toString(16).toUpperCase()} without meeting $FFFFFFFF. The loop `
        + `has no counter, so the sentinel is the only thing bounding it -- past it lie the `
        + `setup blocks and then code`);
    }
    if (rom.u32(a1) === 0xffffffff) return 'allowed';              // $28F67E / $28F686 beq
    const banned = [0, 1, 2].map((k) => rom.u32(a1 + k * 4));
    // $28F688 / $28F690 / $28F69A -- three compares, any mismatch skips to the next entry.
    if (banned[0] === entered[0] && banned[1] === entered[1] && banned[2] === entered[2]) {
      for (const [k, c] of NAME_ALPHA.replacement.entries()) {     // $28F5A4..$28F5B0
        ram.setU32(row + k * 4, c);
      }
      ram.setU16(a4 + NAME_ALPHA.countField, NAME_ALPHA.chars);    // $28F5B6 move.w #$3
      return 'replaced';                                          // $28F5BC bra $28F6A8
    }
    a1 += NAME_ALPHA.stride;                                      // $28F6A2 adda.w #$C
  }
}
