// THE HIGH-SCORE SCREEN -- `$25B492`'s column routines.  W302.
//
// W301 found this family with one scan: every absolute long in the image pointing anywhere
// into `$803824..$8038BA`. It is the caller family that touches all nine columns, so it is
// the code that reads back everything W299, W300 and W301 wrote, and it is what the player
// actually sees.
//
// ============================ THE FAMILY'S SHAPE ===========================
//
// `$25B492` is eleven consecutive `bsr.w`s and nothing else, and nine of the eleven are the
// same routine written nine times:
//
//     lea <column base>,A6        the RAM column
//     lea (<glyph table>,PC),A0   the art
//     move.l #<packed XY>,D1      high word Y, low word X
//     move.w #<attr>,D3 / move.w #<palette>,D4
//     moveq #$4,D7                FIVE rows
//   row:
//     move.w (A6)+,D0             the entry's value for this column
//     ... index A0 by it, load D2 = the art long ...
//     jsr $23DFB4                 the register-convention emitter
//     swap D1 / subi.w #$11C0,D1 / swap D1        step Y to the next row
//     dbra D7,row
//     rts
//
// **EVERY `lea` HERE NAMES A BASE, and that is the exact complement of W300's rule.** The
// insert family walks with `-(An)` so its `lea`s name ENDS; the display walks with `(A6)+`
// so its `lea`s name BASES. Same nine arrays, two conventions, and the two together are why
// the layout was worth pinning with assertions in W301 rather than comments.
//
// `$23DFB4` is already a port helper: `enqueueRegistersThroughStub(ram, rom, stub, d1, d2,
// d3, d4)` in `spritequeue.js`, and the four registers line up exactly. Nothing new was
// needed to draw any of this -- another family the port already had.
//
// ============================ THE ALL MARKER, FROM THE OTHER SIDE ==========
//
// W300 read `$287C4C tst.w $81309A / beq` forcing `(loop, stage)` to `(1, 5)` and argued
// that 5 is one past the last zero-based stage index, so it cannot arise from play and must
// be a deliberate "ALL" marker. `$25B650` is the same fact seen from the display:
//
//     25b674  move.w (A1)+,D0             the LOOP
//     25b676  beq $25B6BA                 loop 0 -> draw the stage alone
//     25b678  cmpi.w #$1,D0
//     25b67c  bne $25B696
//     25b67e  cmpi.w #$5,(A2)             loop 1 AND stage 5 ...
//     25b682  bne $25B696
//     25b684  addq.w #2,A2                ... skip the stage word
//     25b68a  move.l #$3317C0,D2          ... and draw ONE special glyph
//
// A single sprite for the pair, `$3317C0`, which is outside the nine-glyph digit table this
// routine otherwise uses. **The inference and the renderer agree**, which is as close to
// confirmation as a port gets without a board.
//
// ============================ AND THE INITIALS, CONFIRMED AGAIN ============
//
// `$25B7C0 move.l (A6)+,D2 / move.l (A0,D2.w),D2` indexes the character table with the
// stored value **UNSCALED**. The table is longs, so the stored value is a byte offset, which
// is why every factory character is a multiple of four -- W301 inferred that from the data
// and this is the instruction that requires it.
//
// It also means the `$FF`/`$FE` tag the insert stamps is not merely out of range: `$FF` is
// not a multiple of four, so it would be a MISALIGNED read past the end of a 116-byte table.
// The tag cannot reach this routine, so a name must be entered before the screen draws it.
// That is a constraint on the name entry, recorded here because this is where it bites.

import { u16, u32 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { chainCheck24681A, chainFree246800, chainLoader246710 } from './stageend.js';

const EMIT = 0x23dfb4;                  // the register-convention emitter, W30's family
const ROW_STEP = 0x11c0;                // subi.w #$11C0 -- the same in all nine routines
const ROWS = 5;                         // moveq #$4,D7 with dbra is FIVE, not four

/** `swap D1 / subi.w #$11C0,D1 / swap D1` -- step the Y half and leave the X half alone. */
function stepRow(d1) {
  return (((u16((d1 >>> 16) - ROW_STEP) << 16) | (d1 & 0xffff)) >>> 0);
}
/** `addi.w #$200,D1` and friends -- the X half only, which is D1's LOW word. */
function stepX(d1, delta) {
  return (((d1 & 0xffff0000) | u16((d1 & 0xffff) + delta)) >>> 0);
}

export const SCREEN = Object.freeze({
  driver: 0x25b492,
  emit: EMIT,
  rowStep: ROW_STEP,
  rows: ROWS,
  // The nine table BASES, which is what makes this family the mirror of `hiscore.js`.
  ship: 0x803888, style: 0x803892, loop: 0x803874, stage: 0x80387e,
  chain: 0x80389c, initials: 0x803838, scores: 0x803824, overflow: 0x8038b0,
  digits: 0x8038a6,
  // The glyph tables, each pinned on both sides by the code around it.
  shipTable: 0x25b5c2,        // 4 entries x 8 bytes
  styleTable: 0x25b61a,       // 3 longs
  stageDigits: 0x25b6dc,      // 9 longs
  chainDigits: 0x25b778,      // 10 longs
  initialsFontBig: 0x25b7e6,  // 29 longs, NULL at offset $6C
  initialsFontSmall: 0x25b85a,
  digitFontBig: 0x25b984,     // 10 longs
  digitFontSmall: 0x25b9ac,
  allMarker: 0x3317c0,        // $25B68A -- loop 1 + stage 5
  allMarkerAttr: 0x218,       // $25B690
  separator: 0x333e48,        // $25B6A8 -- the glyph between the loop and the stage digit
});

// ===========================================================================
// 1. `$25B58C` -- THE SHIP COLUMN
// ===========================================================================
// The only routine whose table carries its own D3 AND D4: `move.l (A0,D0.w),D2` takes the
// art and `movem.w ($4,A0,D0.w),D3-D4` takes the attribute and the palette from the same
// 8-byte entry. So the ship's colour is per-entry data, not a constant.
//
// The index is `value * 4` against 8-byte entries, which only tiles because **the stored
// values are even**: 0, 2, 4, 6 land on offsets 0, 8, $10, $18 and the odd values would read
// a half-overlapped entry. That is the same evenness W300's `addq.w #4,D0` relies on -- a +4
// in the value is +8 bytes, exactly the gap between P1's icon base `$2881E2` and P2's
// `$2881EA`. Entries 0 and 1 have palette 0 and entries 2 and 3 have palette 1, so the
// rebase lands P2's ships on the second palette. The two facts are the same fact.
export function drawShips25B58C(ram, rom) {
  let d1 = 0x53000a80;                                   // $25B596
  let a6 = SCREEN.ship;
  for (let row = 0; row < ROWS; row++) {                 // $25B59C moveq #$4,D7
    const d0 = ram.u16(a6); a6 += 2;                     // $25B59E move.w (A6)+,D0
    const off = u16(d0 * 4);                             // $25B5A0/$25B5A2 add.w D0,D0 x2
    if (off & 4) {
      unreached(0x25b5a4, `$25B58C read an ODD ship index (${d0}) at row ${row}. The `
        + `index is value*4 over 8-byte entries, so only even values tile the table; an `
        + `odd one reads an entry straddling two`);
    }
    if (off >= 0x20) {
      unreached(0x25b5a4, `$25B58C read ship value ${d0} -> offset $${off.toString(16)}, `
        + `past the FOUR-entry table at $25B5C2. Values 0, 2, 4 and 6 are the whole index `
        + `space, and 4 and 6 are P2's after $287C24's rebase`);
    }
    const at = SCREEN.shipTable + off;
    enqueueRegistersThroughStub(ram, rom, EMIT, d1,       // $25B5AE jsr $23DFB4
      rom.u32(at), rom.u16(at + 4), rom.u16(at + 6));    // $25B5A4 / $25B5A8 movem.w
    d1 = stepRow(d1);                                    // $25B5B4..$25B5BA
  }
}

// ===========================================================================
// 2. `$25B5E2` -- THE STYLE COLUMN
// ===========================================================================
// `subq.w #2,D0` THEN one `add.w D0,D0`: the index is `(value - 2) * 2` over a table of
// longs, so the reachable values are 2, 4 and 6 and there are exactly three entries. The
// subtract is the interesting half -- a style value of 0 would index -2 and read the two
// bytes before the table, which are the tail of this routine's own `rts`.
export function drawStyles25B5E2(ram, rom) {
  let d1 = 0x4f0009c0;                                   // $25B5EC
  let a6 = SCREEN.style;
  for (let row = 0; row < ROWS; row++) {
    const d0 = ram.u16(a6); a6 += 2;                     // $25B5FC
    const off = u16(u16(d0 - 2) * 2);                    // $25B5FE subq / $25B600 add.w
    if (off >= 0x0c || (off & 3)) {
      unreached(0x25b602, `$25B5E2 read style value ${d0} -> offset $${off.toString(16)}, `
        + `outside the THREE longs at $25B61A. Only 2, 4 and 6 are reachable, and value 0 `
        + `would index -2 into this routine's own rts`);
    }
    enqueueRegistersThroughStub(ram, rom, EMIT, d1,
      rom.u32(SCREEN.styleTable + off), 0x220, 0x0008);  // $25B5F2 / $25B5F6, constants
    d1 = stepRow(d1);
  }
}

// ===========================================================================
// 3. `$25B626` and `$25B700` -- THE TWO STATIC COLUMNS
// ===========================================================================
// Neither reads RAM. They draw one fixed glyph once per row, so they are furniture: a column
// separator or label that exists on all five lines. Ported because they are inside the same
// `bsr` run and leaving them out would make the screen's own draw count wrong.
const STATIC_COLUMNS = Object.freeze([
  Object.freeze({ site: 0x25b626, d1: 0x4fc01800, art: 0x333f98, d3: 0x228, d4: 5 }),
  Object.freeze({ site: 0x25b700, d1: 0x57c02bc0, art: 0x331854, d3: 0x220, d4: 8 }),
]);

export function drawStaticColumn(ram, rom, spec) {
  let d1 = spec.d1;
  for (let row = 0; row < ROWS; row++) {
    enqueueRegistersThroughStub(ram, rom, EMIT, d1, spec.art, spec.d3, spec.d4);
    d1 = stepRow(d1);
  }
}
export const drawStatic25B626 = (ram, rom) => drawStaticColumn(ram, rom, STATIC_COLUMNS[0]);
export const drawStatic25B700 = (ram, rom) => drawStaticColumn(ram, rom, STATIC_COLUMNS[1]);

// ===========================================================================
// 4. `$25B650` -- THE LOOP AND STAGE COLUMN, AND THE ALL MARKER
// ===========================================================================
// Two RAM columns in one routine, A1 for the loop and A2 for the stage, and three arms:
//
//   loop 0            draw the stage digit alone, at X $2600 (where the separator would be)
//   loop 1, stage 5   draw ONE glyph, `$3317C0` with attribute $218 -- the ALL marker
//   otherwise         loop digit at $2400, separator at +$200, stage digit at +$400
//
// The `addq.w #2,A2` on the ALL arm is what keeps the two walks in step: the stage word is
// consumed without being drawn, so row 2 still reads its own stage. A port that skipped the
// draw but not the increment would shear the stage column by one row from the ALL entry down.
export function drawLoopStage25B650(ram, rom) {
  let d1 = 0x4fc00000 >>> 0;                             // $25B660 move.w #$4FC0 / swap
  let a1 = SCREEN.loop;
  let a2 = SCREEN.stage;

  const digit = (v, site) => {
    const off = u16(v * 4);                              // $25B696/$25B6C0 add.w D0,D0 x2
    if (off >= 0x24) {
      unreached(site, `$25B650 read ${v} where the digit table at $25B6DC has NINE `
        + `entries, so 0..8 is the whole index space`);
    }
    return rom.u32(SCREEN.stageDigits + off);
  };

  for (let row = 0; row < ROWS; row++) {                 // $25B66A moveq #$4,D7
    d1 = stepX(d1 & 0xffff0000, 0x2400);                 // $25B66C move.w #$2400,D1
    const loop = ram.u16(a1); a1 += 2;                   // $25B674 move.w (A1)+,D0

    if (loop === 0) {                                    // $25B676 beq $25B6BA
      d1 = stepX(d1, 0x2600 - 0x2400);                   // $25B6BA move.w #$2600,D1
    } else if (loop === 1 && ram.u16(a2) === 5) {        // $25B678/$25B67E -- the ALL arm
      a2 += 2;                                           // $25B684 addq.w #2,A2
      enqueueRegistersThroughStub(ram, rom, EMIT,        // $25B6C8, the shared tail
        stepX(d1, 0), SCREEN.allMarker, SCREEN.allMarkerAttr, 5);
      d1 = stepRow(d1);
      continue;
    } else {
      enqueueRegistersThroughStub(ram, rom, EMIT, d1,    // $25B69E -- the LOOP digit
        digit(loop, 0x25b69a), 0x208, 5);
      d1 = stepX(d1, 0x200);                             // $25B6A4
      enqueueRegistersThroughStub(ram, rom, EMIT, d1,    // $25B6AE -- the separator
        SCREEN.separator, 0x208, 5);
      d1 = stepX(d1, 0x200);                             // $25B6B4
    }

    const stage = ram.u16(a2); a2 += 2;                  // $25B6BE move.w (A2)+,D0
    enqueueRegistersThroughStub(ram, rom, EMIT, d1,      // $25B6C8
      digit(stage, 0x25b6c4), 0x208, 5);
    d1 = stepRow(d1);                                    // $25B6CC..$25B6D4
  }
}

// ===========================================================================
// 5. `$25B72A` -- THE CHAIN, AND `dbeq` AS LEADING-ZERO SUPPRESSION
// ===========================================================================
//     25b74c  move.w D0,D2 / andi.w #$F,D2      the low BCD nibble
//     25b752  add.w D2,D2 x2                    * 4, over a table of longs
//     25b75a  jsr $23DFB4
//     25b760  subi.w #$200,D1                   step X LEFT: least significant first
//     25b764  lsr.w #4,D0                       and this sets Z when nothing is left
//     25b766  dbeq D6,$25B74C
//
// **`dbeq` exits when Z is SET**, which is W299's rule applied to a different condition: the
// loop stops as soon as the shifted value reaches zero. That is leading-zero suppression, and
// the four-digit cap comes from `moveq #$3,D6`. So chain `$0719` draws three glyphs, and a
// chain of 0 draws exactly one -- the `dbeq` is tested AFTER the first draw.
export function drawChain25B72A(ram, rom) {
  let d1 = 0x54800000 >>> 0;                             // $25B734 / $25B738 swap
  let a6 = SCREEN.chain;
  for (let row = 0; row < ROWS; row++) {                 // $25B742
    let d0 = ram.u16(a6); a6 += 2;                       // $25B744
    d1 = stepX(d1, 0x31c0 - (d1 & 0xffff));              // $25B746 move.w #$31C0,D1
    let x = d1;
    for (let n = 0; n < 4; n++) {                        // $25B74A moveq #$3,D6
      const nib = d0 & 0x0f;                             // $25B74C/$25B74E andi.w #$F
      if (nib > 9) {
        unreached(0x25b756, `$25B72A read nibble ${nib} from chain $${d0.toString(16)}. `
          + `The table at $25B778 has TEN entries because the value is BCD; nibble $A..$F `
          + `would read the code after it`);
      }
      enqueueRegistersThroughStub(ram, rom, EMIT, x,
        rom.u32(SCREEN.chainDigits + nib * 4), 0x208, 0x0008);
      x = stepX(x, -0x200);                              // $25B760 subi.w #$200
      d0 = (d0 >>> 4) & 0xffff;                          // $25B764 lsr.w #4
      if (d0 === 0) break;                               // $25B766 dbeq -- exits on Z SET
    }
    d1 = stepRow(d1);
  }
}

// ===========================================================================
// 6. `$25B7A0` -- THE INITIALS, AND TWO FONTS
// ===========================================================================
// Three characters per row, `move.l (A6)+,D2` then `move.l (A0,D2.w),D2` with the value used
// UNSCALED as a byte offset. Row 1 uses `$25B7E6` and rows 2..5 use `$25B85A`, because the
// `lea` for the second font sits INSIDE the loop at `$25B7D4` while the first is outside at
// `$25B7B6` and the `dbra` goes back to `$25B7BA`. The top entry gets the bigger font.
//
// Both fonts are 29 longs and **both have `$00000000` at offset `$6C`** with a valid glyph
// after it at `$70`. So the index space is 0..28 with a hole in it, which is why the ROM
// window is $E8 rather than the $D8 that 27 real characters would suggest.
const INITIALS_CHARS = 3;               // $25B7BE moveq #$2,D5 with dbra
const INITIALS_ENTRIES = 29;
const INITIALS_HOLE = 0x6c;

export function drawInitials25B7A0(ram, rom) {
  let d1 = 0x57c00000 >>> 0;                             // $25B7A6 / $25B7AA swap
  let a6 = SCREEN.initials;
  let font = SCREEN.initialsFontBig;                     // $25B7B6, OUTSIDE the loop
  for (let row = 0; row < ROWS; row++) {
    let x = stepX(d1, 0x1680 - (d1 & 0xffff));           // $25B7BA move.w #$1680,D1
    for (let c = 0; c < INITIALS_CHARS; c++) {           // $25B7BE moveq #$2,D5
      const off = u32(ram.u32(a6)); a6 += 4;             // $25B7C0 move.l (A6)+,D2
      if (off >= INITIALS_ENTRIES * 4 || (off & 3)) {
        unreached(0x25b7c2, `$25B7A0 read character offset $${off.toString(16)} at row `
          + `${row} char ${c}. The value is used UNSCALED against a table of longs, so it `
          + `must be a multiple of four below $${(INITIALS_ENTRIES * 4).toString(16)} -- `
          + `and $FF/$FE, the tag $287C7E stamps, is neither. A name must be entered `
          + `before this screen draws it`);
      }
      if (off === INITIALS_HOLE) {
        unreached(0x25b7c2, `$25B7A0 read character offset $6C, which is $00000000 in BOTH `
          + `fonts -- the hole in the 29-entry table, not a glyph`);
      }
      enqueueRegistersThroughStub(ram, rom, EMIT, x, rom.u32(font + off), 0x410, 5);
      x = stepX(x, 0x400);                               // $25B7CC addi.w #$400
    }
    font = SCREEN.initialsFontSmall;                     // $25B7D4, INSIDE the loop
    d1 = stepRow(d1);                                    // $25B7D8..$25B7DE
  }
}

// ===========================================================================
// 7. `$25B8CE` -- THE SCORE, WHICH SPANS TWO COLUMNS
// ===========================================================================
// Eight nibbles out of the score long and then, only if the long ran out, up to four more
// out of the overflow word. The suppression test is the pair, not either half:
//
//     25b90e  lsr.l #4,D0
//     25b910  bne $25B916          more of the long left -> keep going
//     25b912  tst.w (A2)
//     25b914  beq $25B932          long empty AND overflow zero -> this row is done
//
// So a score of `$00000123` with overflow 0 draws three glyphs, and the same score with a
// non-zero overflow draws all eight plus the overflow's own digits -- because the leading
// zeros of the long are significant once something sits above them. Getting that backwards
// gives a table where big scores lose their middle digits.
//
// Two fonts again, and the SAME two the digit column uses: `$25B984` for row 1 (loaded at
// `$25B8DA`, outside) and `$25B9AC` for rows 2..5 (loaded at `$25B932`, inside).
export function drawScores25B8CE(ram, rom) {
  let d1 = 0x53c00000 >>> 0;                             // $25B8DE / $25B8E2 swap
  let a1 = SCREEN.scores;
  let a2 = SCREEN.overflow;
  let font = SCREEN.digitFontBig;                        // $25B8DA, OUTSIDE the loop

  const glyph = (nib, site) => {
    if (nib > 9) {
      unreached(site, `the score/digit font at $${font.toString(16).toUpperCase()} has TEN `
        + `entries because the value is BCD; nibble $${nib.toString(16)} would read past it`);
    }
    return rom.u32(font + nib * 4);
  };

  for (let row = 0; row < ROWS; row++) {                 // $25B8EC moveq #$4,D7
    let x = stepX(d1, 0x2580 - (d1 & 0xffff));           // $25B8EE move.w #$2580,D1
    let d0 = u32(ram.u32(a1)); a1 += 4;                  // $25B8F4 move.l (A1)+,D0
    let done = false;
    for (let n = 0; n < 8; n++) {                        // $25B8F2 moveq #$7,D6
      enqueueRegistersThroughStub(ram, rom, EMIT, x,
        glyph(d0 & 0x0f, 0x25b900), 0x208, 5);
      x = stepX(x, -0x200);                              // $25B90A
      d0 = (d0 >>> 4) >>> 0;                             // $25B90E lsr.l #4
      // $25B910 bne / $25B912 tst.w (A2) / $25B914 beq -- the PAIR decides.
      if (d0 === 0 && ram.u16(a2) === 0) { done = true; break; }
    }
    if (!done) {
      let ovf = ram.u16(a2);                             // $25B91A move.w (A2)+,D0
      for (let n = 0; n < 4 && ovf !== 0; n++) {         // $25B91C beq $25B932
        enqueueRegistersThroughStub(ram, rom, EMIT, x,
          glyph(ovf & 0x0f, 0x25b928), 0x208, 5);
        x = stepX(x, -0x200);
        ovf = (ovf >>> 4) & 0xffff;
      }
    }
    a2 += 2;                                             // the (A2)+ on both paths
    font = SCREEN.digitFontSmall;                        // $25B932, INSIDE the loop
    d1 = stepRow(d1);                                    // $25B936..$25B93C
  }
}

// ===========================================================================
// 8. `$25B944` -- THE DIGIT-STATE COLUMN
// ===========================================================================
// The simplest of the nine: one masked nibble per row, no suppression loop, and the same two
// fonts as the score. `andi.w #$F` on a value the board caps at 9 through `$28725C`.
export function drawDigits25B944(ram, rom) {
  let d1 = 0x53c02780;                                   // $25B94A
  let a6 = SCREEN.digits;
  let font = SCREEN.digitFontBig;                        // $25B95A, before the dbra target
  for (let row = 0; row < ROWS; row++) {
    const nib = ram.u16(a6) & 0x0f; a6 += 2;             // $25B95E / $25B960
    if (nib > 9) {
      unreached(0x25b968, `$25B944 read digit state $${nib.toString(16)}; the font has TEN `
        + `entries and $28725C caps the state at 9`);
    }
    enqueueRegistersThroughStub(ram, rom, EMIT, d1,
      rom.u32(font + nib * 4), 0x208, 5);               // $25B968 / $25B96C
    font = SCREEN.digitFontSmall;                        // $25B972, INSIDE the loop
    d1 = stepRow(d1);                                    // $25B976..$25B97C
  }
}

// ===========================================================================
// 9. `$25B4D6` -- THE FRAME, ON A SECOND EMITTER AND WITH A BLINK
// ===========================================================================
// Four requests with nothing but immediates, through `$23DECE` rather than `$23DFB4`. Both
// are register-convention stubs the port already resolves, and **they resolve to the SAME
// bucket** -- measured, because the natural assumption is that two stub addresses mean two
// draw layers and they do not. Which is worth knowing for a reason: with all eleven `bsr`s
// feeding one bucket, **the `bsr` order IS the draw order**, and that is why the frame and
// the row labels are called first -- they have to be under the data.
//
// The third element is GATED: `$25B50A tst.w $80390C / beq $25B52C`. `$80390C` is the global
// phase word `bee.js` calls `collisionPhase` and `bomb.js` calls `phase`, so this element is
// drawn on some frames and not others -- **the screen has a blinking element**, which a port
// that dropped the gate would render as permanently lit.
//
// And `$25B4EC bsr $25B54A` calls an immediate `rts`. There are THREE bare `rts` bytes in a
// row at `$25B546`, `$25B548` and `$25B54A`: the first is this routine's own exit and the
// other two are spares. So the call is live and the callee does nothing -- a stubbed-out
// feature, not a missing routine, and worth saying so rather than counting it as a gap.
const FRAME_PARTS = Object.freeze([
  Object.freeze({ site: 0x25b4d6, d1: 0x00000000, art: 0x3216c0, d3: 0x38e0, d4: 7 }),
  Object.freeze({ site: 0x25b4f0, d1: 0x5f000400, art: 0x3326a8, d3: 0x08c0, d4: 6 }),
  // $25B512 -- ONLY when the phase word is non-zero.
  Object.freeze({ site: 0x25b512, d1: 0x63000800, art: 0x333e54, d3: 0x04a0, d4: 5,
    gate: 0x80390c }),
  Object.freeze({ site: 0x25b52c, d1: 0x05c00000, art: 0x3329ac, d3: 0x2ee0, d4: 6 }),
]);
const FRAME_EMIT = 0x23dece;            // a different STUB from $23DFB4, the same bucket
export const FRAME_STUB_RTS = 0x25b54a; // $25B4EC bsr -- an immediate rts

export function drawFrame25B4D6(ram, rom) {
  for (const p of FRAME_PARTS) {
    if (p.gate !== undefined && ram.u16(p.gate) === 0) continue;   // $25B510 beq
    enqueueRegistersThroughStub(ram, rom, FRAME_EMIT, p.d1, p.art, p.d3, p.d4);
  }
}

// ===========================================================================
// 10. `$25B54C` -- THE ROW LABELS, INDEXED BY THE ROW ITSELF
// ===========================================================================
// The tenth column and the only one that reads no RAM at all yet still varies per row:
// `move.l ($18,PC,D6.w),D2` with `addq.w #4,D6`. The extension word sits at `$25B560`, so
// the table base is `$25B560 + $18 = $25B578` -- five longs, and `$25B58C` is the next
// routine, which pins it at exactly five. These are the 1ST..5TH markers.
export const LABEL_TABLE = 0x25b578;

export function drawRowLabels25B54C(ram, rom) {
  let d1 = 0x538004c0;                                   // $25B54C
  for (let row = 0; row < ROWS; row++) {                 // $25B55C moveq #$4,D7
    enqueueRegistersThroughStub(ram, rom, EMIT, d1,
      rom.u32(LABEL_TABLE + row * 4), 0x610, 5);         // $25B55E / $25B562
    d1 = stepRow(d1);                                    // $25B56A..$25B570
  }
}

/**
 * `$25B492`'s ELEVEN column routines, in the ROM's own `bsr` order. `$25B4D6` and `$25B54C`
 * come first because the frame and the labels are drawn under the data.
 */
export const SCREEN_COLUMNS = Object.freeze([
  Object.freeze({ site: 0x25b4d6, draw: drawFrame25B4D6 }),
  Object.freeze({ site: 0x25b54c, draw: drawRowLabels25B54C }),
  Object.freeze({ site: 0x25b58c, draw: drawShips25B58C }),
  Object.freeze({ site: 0x25b5e2, draw: drawStyles25B5E2 }),
  Object.freeze({ site: 0x25b626, draw: drawStatic25B626 }),
  Object.freeze({ site: 0x25b650, draw: drawLoopStage25B650 }),
  Object.freeze({ site: 0x25b700, draw: drawStatic25B700 }),
  Object.freeze({ site: 0x25b72a, draw: drawChain25B72A }),
  Object.freeze({ site: 0x25b7a0, draw: drawInitials25B7A0 }),
  Object.freeze({ site: 0x25b8ce, draw: drawScores25B8CE }),
  Object.freeze({ site: 0x25b944, draw: drawDigits25B944 }),
]);

/** All eleven of `$25B492`'s `bsr.w`s, in order. */
export function drawHiscoreColumns(ram, rom) {
  for (const c of SCREEN_COLUMNS) c.draw(ram, rom);
}

// ===========================================================================
// 11. `$25B412` -- THE SCREEN AS A STATE ROUTINE, AND THE CARRY IT RETURNS
// ===========================================================================
// One caller, `$25A938 jsr $25B412`. Three states on `$812E5C`, each falling THROUGH into the
// next state's test rather than branching away, so a single call can advance twice:
//
//   state 0   chainCheck($812E60) -- when the chain has finished, free it and go to state 1
//   state 1   subq.w #1,$812E5E -- a countdown; at zero, load the chain script at $25BAAA
//             through `$246710`, keep the handle in `$812E60`, and go to state 2
//   state 2   chainCheck again; when THAT chain finishes, free it and take the other exit
//
// **THE TWO EXITS DIFFER ONLY IN THE CARRY, and both of them are idioms rather than flags:**
//
//   25b4c2  ori #$1,SR       after the draw       -> carry SET   = still running
//   25b4d2  move.w D0,D0     after $28C170        -> carry CLEAR = finished
//
// `move.w D0,D0` looks like a no-op and is there to CLEAR the carry, which `ori` is there to
// set. A port that treated `$25B4D2` as dead code would return whatever carry the last call
// left, and the caller would never see the screen end.
//
// The draw at `$25B492` runs in every state EXCEPT the frame on which state 2's chain
// finishes -- states 0 and 1 reach it by falling past both `cmpi`s, and state 2 reaches it
// while its chain is still alive. So the screen draws continuously and then, on one frame,
// frees the chain, fires the `$28C170` cue and reports finished without drawing.
export const SCREEN_STATE = Object.freeze({
  site: 0x25b412,
  caller: 0x25a938,
  state: 0x812e5c,          // $25B416/$25B440/$25B46E cmpi.w
  timer: 0x812e5e,          // $25B44C subq.w #1
  handle: 0x812e60,         // $25B460 move.l D0
  script: 0x25baaa,         // $25B454 lea ($25BAAA,PC),A0 -- EIGHT nodes, $42 bytes
  scriptNodes: 8,
  endCue: 0x28c170,         // $25B4C8 -- already a known cue in tally.js
});

/**
 * `$25B412` -- one frame of the high-score screen.
 *
 * @returns {boolean} the CARRY: `true` (set) means still running, `false` (clear) means the
 *   screen has finished. Named as a boolean rather than returned as a flag because the two
 *   exits are the only difference between them.
 */
export function hiscoreScreen25B412(ram, rom, ctx) {
  if (ram.u16(SCREEN_STATE.state) === 0) {                  // $25B416 cmpi.w #$0
    if (chainCheck24681A(ram, ram.u32(SCREEN_STATE.handle)) === 0) {  // $25B428 jsr / bne
      chainFree246800(ram, ram.u32(SCREEN_STATE.handle));   // $25B432 jsr $246800
      ram.setU16(SCREEN_STATE.state, 1);                    // $25B438
    }
  }
  if (ram.u16(SCREEN_STATE.state) === 1) {                  // $25B440 -- FALLS THROUGH
    const t = u16(ram.u16(SCREEN_STATE.timer) - 1);         // $25B44C subq.w #1
    ram.setU16(SCREEN_STATE.timer, t);
    if (t === 0) {                                          // $25B452 bne
      const handle = chainLoader246710(ram, rom, SCREEN_STATE.script, ctx);  // $25B45A
      ram.setU32(SCREEN_STATE.handle, handle >>> 0);        // $25B460
      ram.setU16(SCREEN_STATE.state, 2);                    // $25B466
    }
  }
  if (ram.u16(SCREEN_STATE.state) === 2) {                  // $25B46E
    if (chainCheck24681A(ram, ram.u32(SCREEN_STATE.handle)) === 0) {  // $25B480 / $25B486
      chainFree246800(ram, ram.u32(SCREEN_STATE.handle));   // $25B488
      // $25B48E bra $25B4C8 -- the ONLY path that skips the draw.
      ctx?.unportedLog?.note(SCREEN_STATE.endCue,
        '$25B4C8 jsr $28C170 -- the screen-end BGM cue, the same one tally.js names as cueA');
      return false;                                         // $25B4D2 move.w D0,D0
    }
  }
  drawHiscoreColumns(ram, rom);                             // $25B492, eleven bsr.w
  return true;                                              // $25B4C2 ori #$1,SR
}
