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
import { tagLookupForSide, tagForSide } from './hiscore.js';

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
  live: 0x12,           // $28F41A move.w #$1,($12,A4)
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

  // $28F77A/$28F782/$28F788 -- the side picks BOTH the setup bit and the block.
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
  // $28F41A/$28F420/$28F424 -- the arm's own setup, before the lookup.
  ram.setU16(a4 + NAME_REC.live, 1);                       // $28F41A move.w #$1,($12,A4)
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
