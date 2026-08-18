// THE CONTINUE PANEL -- the four jump-table bodies of the `$288610` computed-call dispatcher. W418.
//
// `$288610` walks two 22-byte RAM records (`$81B706` and `$81B71C`, stride `$16`), reads each one's
// index word, skips a 0 and otherwise `jsr`s `$288638[idx]`. That jump table has FIVE longs:
//
//     $288638   0 / $28864C / $28871C / $28875E / $288952
//
// and `rank.js computedDispatch` threw on every non-zero index for the project's whole life. The
// index is not exotic: `objslot13.js` writes it. `selectSet288598` posts **1** from the run gate's
// closed arm and **3** from `$288AC8`, and `selectAdvance2885C6` turns a 1 into **2** and anything
// else into **4**. All four are the continue panel's own states, and this file is all four.
//
//     [1] $28864C   PROMPT   -- clear both blocks, print " CONTINUE     ", the digit, the cue
//     [2] $28871C   WIPE     -- blank the text line, clear the index (one shot)
//     [3] $28875E   COUNT    -- blank BOTH text lines, then animate the banner and the digit
//     [4] $288952   CLEAR    -- clear both blocks, clear the index (one shot)
//
// **ENTRY 3 IS THE ONE THE BOOT TAKES.** `playgate` reaches it on `hold=shot` at lf11672, on
// `hold=auto` at lf13285 and on `hold=auto+down` at lf13985, always with `$81B706` holding 3.
//
// EVERY DEPENDENCY WAS ALREADY IN THE PORT. `$240DC2`/`$240E1A`/`$240EBC` are `hud.js`'s three TX
// printer variants (W116), `$25A14C` is `background.js txString25A14C` (W125), `$23CD80` is
// `fronttext.js hexDigit23CD80` (W373) and `$28C6AC` is a plain `WRAPPERS` row (BGM id `$18`).
// Nothing here needed a new subsystem; what it needed was the four extents and the four tables.
//
// THREE THINGS A TIDY REWRITE LOSES, all three measured off the image:
//
//  1. **`$2887B6 move.w #$0,$81B71C` IS ABSOLUTE.** Entry 3, running on EITHER record, clears
//     record B's index word. It is not `($16,A4)` and must not become it. Same family of
//     cross-side write `objslot13.js selectAdvance2885C6` already documents at `$2885FA`.
//  2. **`move.w #$3,($E,A4)` FILLS TWO BYTE FIELDS.** `($E,A4)` is a BYTE countdown and `($F,A4)`
//     its BYTE reload; the word literal writes `$00` then `$03`. The counter therefore starts at
//     zero, borrows on the very first frame and reloads -- so the banner steps on frame 1, not on
//     frame 4. `move.w #$1,($12,A4)` is the same shape on `($12)`/`($13)`.
//  3. **`$2887C2` AND `$288832` ARE `bcc` AFTER `subq.b`, `$288846` IS `blt` (`$6D`).** The two
//     `bcc`s are the no-borrow arms of a byte countdown -- they SKIP the advance while the counter
//     is still non-zero. `$288840 cmpi.w #$C / $288846 blt` is a signed compare on the digit's own
//     ring offset, and `$6C` would have been `bge`; the byte here is `6D`.
//
// AND THE THING THE ROUTINE ITSELF PROVES ABOUT ITS TABLES: `$2887EE cmpi.w #$44,($10,A4)` is the
// banner ring's own wrap, so the largest offset ever read is `$40`. The table at `$28886A` has an
// EIGHTEENTH long at `$2888AE` that the wrap makes unreachable, and the ROM window declared for it
// is `$44` bytes rather than `$48` for exactly that reason.

import { u16, u32 } from './ram.js';
import { txPrint240DC2, txPrint240E1A, txPrint240EBC } from './hud.js';
import { txString25A14C } from './background.js';
import { hexDigit23CD80 } from './fronttext.js';
import { menuCarry28D53C } from './tallyscreen.js';

export const CONTINUE = Object.freeze({
  // the dispatcher and its jump table
  dispatcher: 0x288610,
  jumpTable: 0x288638,
  prompt: 0x28864c, wipe: 0x28871c, count: 0x28875e, clear: 0x288952,

  // ------------------------------------------------------------ the 22-byte record's fields
  // A4 is `$81B706` (side 0) or `$81B71C` (side 1); `objslot13.js SCREEN13.selA/selB`.
  fIndex: 0x00,    // the dispatch index -- entries 2 and 4 clear it to retire themselves
  fState: 0x02,    // 0 = run the init arm; `$288598`/`$2885C6` zero it on every CHANGE of fIndex
  fSide: 0x04,     // written by `$2885BC`/`$288606`; picks text row 1 or row $F
  fCol: 0x06,      // ($6,A4) -- the LATCHED D1 (column) the prompt re-prints from each frame
  fRow: 0x08,      // ($8,A4) -- the LATCHED D0 (row)
  fMark: 0x0a,     // ($A,A4) -- the SECONDS digit. Byte. `$81B710`/`$81B726`, and slot [13]'s
                   //   descriptor `dRam` is the same address: this is the field `$2889CC` stamps.
  fMarkPrev: 0x0c, // ($C,A4) -- last-seen fMark; a CHANGE is what fires the $28C6AC cue
  fBannerCount: 0x0e, fBannerPeriod: 0x0f,   // byte countdown + byte reload (one word literal)
  fBannerOff: 0x10,                          // word: byte offset into BANNER, step 4, wrap $44
  fDigitCount: 0x12, fDigitPeriod: 0x13,     // byte countdown + byte reload (one word literal)
  fDigitOff: 0x14,                           // word: byte offset inside a digit group, wrap $C

  // ------------------------------------------------------------ the ROM tables and strings
  strPrompt: 0x2886fc,   // " CONTINUE     " + NUL -- lea ($44,PC) at $2886B6, PC = $2886B8
  strBlank: 0x28870c,    // fourteen blanks + NUL  -- lea at $288792, $2887A8 and $28874A
  banner: 0x28886a,      // lea ($9C,PC) at $2887CC, PC = $2887CE
  bannerWrap: 0x0044,    // $2887EE cmpi.w #$44 -- 17 longs are reachable, the 18th is not
  digitPtrs: 0x2888b2,   // lea ($B2,PC) at $2887FE, PC = $288800 -- TEN longs, one per digit
  digitPtrCount: 10,
  digitWrap: 0x000c,     // $288840 cmpi.w #$C -- three longs per digit

  // ------------------------------------------------------------ the two TX blocks, by register
  // Entry 1 and entry 4 CLEAR exactly the two rectangles entries 1 and 3 draw into, with the same
  // four registers, which is how the pairing is known rather than assumed.
  bannerD0: 0x008c, bannerD1: 0x0400, bannerD2: 3, bannerD3: 0x13,
  digitD0: 0x0074, digitD1: 0x0c00, digitD2: 7, digitD3: 3, digitD5: 0x000c,
  textCol: 0x0033,       // D1 at $28878E/$2887A4/$28872E/$28873E/$288692/$2886A2
  textRow0: 0x0001, textRow1: 0x000f,
  textAttr: 0x0002,      // D2 at $288796/$2887AC/$28874E/$2886BC/$2886F0
  digitBias: 0x000a,     // $2886E8 addi.w #$A,D0 -- the prompt's digit sits $A rows past the text

  recordB: 0x81b71c,     // $2887B6 -- ABSOLUTE, see note 1 in the header
  cue: 0x28c6ac,         // $2886D8 / $288862 jsr $28C6AC -- BGM id $18
});

/** `$28872A..$288756` -- BLANK THE TEXT LINE, and latch the row/column it used.
 *
 *  Shared by entry 2 (its own body) and entry 1 (`$288652 bcs $28872A` jumps straight in here when
 *  `$28D53C` reports the menu busy). Entry 3 does NOT come through here: it prints the blank string
 *  at BOTH rows unconditionally and latches nothing. */
function blankLine28872A(ram, rom, ctx, a4) {
  let d0 = CONTINUE.textRow0;                              // $28872A move.w #$1,D0
  let d1 = CONTINUE.textCol;                               // $28872E move.w #$33,D1
  if (ram.u16(a4 + CONTINUE.fSide) !== 0) {                // $288732 tst.w ($4,A4) / beq $288742
    d0 = CONTINUE.textRow1;                                // $28873A move.w #$F,D0
    d1 = CONTINUE.textCol;                                 // $28873E move.w #$33,D1
  }
  ram.setU16(a4 + CONTINUE.fCol, d1);                      // $288742 move.w D1,($6,A4)
  ram.setU16(a4 + CONTINUE.fRow, d0);                      // $288746 move.w D0,($8,A4)
  txString25A14C(ctx.tx, rom, d0, d1, CONTINUE.textAttr,   // $28874A lea / $28874E / $288752
    CONTINUE.strBlank);
}

/** `$28864C` -- ENTRY 1, THE PROMPT. Clear both blocks once, then print " CONTINUE     " and the
 *  seconds digit every frame, and fire `$28C6AC` on the frame the digit changes.
 *
 *  ITS FIRST INSTRUCTION IS A GATE INTO SOMEONE ELSE'S BODY. `$28864C jsr $28D53C / $288652 bcs
 *  $28872A` lands inside ENTRY 2, past entry 2's state test, and then falls through entry 2's
 *  `$288758 move.w #$0,(A4)` -- so a busy menu makes the prompt blank its line and RETIRE, not
 *  merely skip a frame. Measuring entry 1 forward from `$28864C` to `$28871C` and stopping there
 *  gets the code right and the control flow wrong. */
export function continuePrompt28864C(ram, rom, ctx, a4) {
  if (menuCarry28D53C(ram)) {                              // $28864C jsr $28D53C / $288652 bcs
    blankLine28872A(ram, rom, ctx, a4);                    // ... into $28872A
    ram.setU16(a4 + CONTINUE.fIndex, 0);                   // ... falling through $288758
    return;
  }
  if (ram.u16(a4 + CONTINUE.fState) === 0) {               // $288656 tst.w ($2,A4) / bne $2886AE
    ram.setU16(a4 + CONTINUE.fState, 1);                   // $28865E
    ram.setU8(a4 + CONTINUE.fMarkPrev, 0);                 // $288664 move.b #$0,($C,A4)
    txPrint240EBC(ram, CONTINUE.bannerD0, CONTINUE.bannerD1,
      CONTINUE.bannerD2, CONTINUE.bannerD3);               // $28866A..$288676 jsr $240EBC
    txPrint240EBC(ram, CONTINUE.digitD0, CONTINUE.digitD1,
      CONTINUE.digitD2, CONTINUE.digitD3);                 // $28867C..$288688 jsr $240EBC
    let d0 = CONTINUE.textRow0;                            // $28868E move.w #$1,D0
    let d1 = CONTINUE.textCol;                             // $288692 move.w #$33,D1
    if (ram.u16(a4 + CONTINUE.fSide) !== 0) {              // $288696 tst.w ($4,A4) / beq $2886A6
      d0 = CONTINUE.textRow1;                              // $28869E
      d1 = CONTINUE.textCol;                               // $2886A2
    }
    ram.setU16(a4 + CONTINUE.fCol, d1);                    // $2886A6 move.w D1,($6,A4)
    ram.setU16(a4 + CONTINUE.fRow, d0);                    // $2886AA move.w D0,($8,A4)
  }
  // $2886AE -- the per-frame arm, and it re-reads the LATCHED pair rather than recomputing them.
  const d1 = ram.u16(a4 + CONTINUE.fCol);                  // $2886AE move.w ($6,A4),D1
  const d0 = ram.u16(a4 + CONTINUE.fRow);                  // $2886B2 move.w ($8,A4),D0
  txString25A14C(ctx.tx, rom, d0, d1, CONTINUE.textAttr,   // $2886B6 lea / $2886BC / $2886C0
    CONTINUE.strPrompt);
  const mark = ram.u8(a4 + CONTINUE.fMark);                // $2886C6 moveq #0,D4 / $2886C8 move.b
  if (mark !== ram.u8(a4 + CONTINUE.fMarkPrev)) {          // $2886CC cmp.b ($C,A4),D4 / $2886D0 beq
    ram.setU8(a4 + CONTINUE.fMarkPrev, mark);              // $2886D4 move.b D4,($C,A4)
    ctx.soundPost?.(CONTINUE.cue);                         // $2886D8 jsr $28C6AC
  }
  // $2886DE -- the digit, printed $A rows past the text and through the ONE-hex-digit printer.
  hexDigit23CD80(ctx.tx,                                   // $2886F4 jsr $23CD80
    u16(ram.u16(a4 + CONTINUE.fRow) + CONTINUE.digitBias), // $2886E4 move.w ($8,A4),D0 / $2886E8
    ram.u16(a4 + CONTINUE.fCol),                           // $2886EC move.w ($6,A4),D1
    CONTINUE.textAttr,                                     // $2886F0 move.w #$2,D2
    ram.u8(a4 + CONTINUE.fMark));                          // $2886DE moveq #0,D4 / $2886E0 move.b
}

/** `$28871C` -- ENTRY 2, THE WIPE. One blank line, then retire. The `bne` at `$288720` jumps to the
 *  retire, and the init arm FALLS INTO it, so this body clears its own index on every frame it
 *  runs -- it is a one-shot by construction, not by a latch. */
export function continueWipe28871C(ram, rom, ctx, a4) {
  if (ram.u16(a4 + CONTINUE.fState) === 0) {               // $28871C tst.w ($2,A4) / bne $288758
    ram.setU16(a4 + CONTINUE.fState, 1);                   // $288724
    blankLine28872A(ram, rom, ctx, a4);                    // $28872A..$288756
  }
  ram.setU16(a4 + CONTINUE.fIndex, 0);                     // $288758 move.w #$0,(A4)
}

/** `$28875E` -- ENTRY 3, THE COUNT. **The body the boot actually reaches.**
 *
 *  Its init erases the prompt on BOTH rows (row 1 and row $F, ignoring `($4,A4)` entirely, which is
 *  what makes it an erase of the other side's line too) and clears record B's index. Then, every
 *  frame: step a 17-frame banner every FOUR frames, and draw the seconds digit's 3-frame blink
 *  every frame while stepping it every TWO. The cue fires only when the digit itself changes.
 *
 *  THE BANNER IS NOT DRAWN ON THE FRAMES IT DOES NOT STEP. `$2887C2 bcc $2887FE` skips the read,
 *  the draw AND the advance together. That is correct and not a dropped call: the TX printers write
 *  a tilemap that persists, so re-issuing the same cells every frame would be redundant. The digit
 *  block IS re-issued every frame, because the `bcc` for it sits AFTER its draw at `$28882E`. */
export function continueCount28875E(ram, rom, ctx, a4) {
  if (ram.u16(a4 + CONTINUE.fState) === 0) {               // $28875E tst.w ($2,A4) / bne $2887BE
    ram.setU16(a4 + CONTINUE.fState, 1);                   // $288766
    ram.setU8(a4 + CONTINUE.fMarkPrev, 0);                 // $28876C move.b #$0,($C,A4)
    ram.setU16(a4 + CONTINUE.fBannerOff, 0);               // $288772 move.w #$0,($10,A4)
    ram.setU16(a4 + CONTINUE.fBannerCount, 3);             // $288778 -- ($E) = 0, ($F) = 3
    ram.setU16(a4 + CONTINUE.fDigitOff, 0);                // $28877E move.w #$0,($14,A4)
    ram.setU16(a4 + CONTINUE.fDigitCount, 1);              // $288784 -- ($12) = 0, ($13) = 1
    txString25A14C(ctx.tx, rom, CONTINUE.textRow0, CONTINUE.textCol,
      CONTINUE.textAttr, CONTINUE.strBlank);               // $28878A..$28879A
    txString25A14C(ctx.tx, rom, CONTINUE.textRow1, CONTINUE.textCol,
      CONTINUE.textAttr, CONTINUE.strBlank);               // $2887A0..$2887B0
    ram.setU16(CONTINUE.recordB, 0);                       // $2887B6 -- ABSOLUTE $81B71C
  }
  // $2887BE subq.b #1,($E,A4) / $2887C2 bcc $2887FE -- borrow (the byte was 0) runs the arm.
  const bc = ram.u8(a4 + CONTINUE.fBannerCount);
  ram.setU8(a4 + CONTINUE.fBannerCount, (bc - 1) & 0xff);
  if (bc === 0) {
    ram.setU8(a4 + CONTINUE.fBannerCount,                  // $2887C6 move.b ($F,A4),($E,A4)
      ram.u8(a4 + CONTINUE.fBannerPeriod));
    const off = ram.u16(a4 + CONTINUE.fBannerOff);         // $2887D2 adda.w ($10,A4),A0
    txPrint240DC2(ram, CONTINUE.bannerD0, CONTINUE.bannerD1, CONTINUE.bannerD2,
      CONTINUE.bannerD3, rom.u32(CONTINUE.banner + off));  // $2887D6..$2887E4
    const next = u16(off + 4);                             // $2887EA addq.w #$4,($10,A4)
    ram.setU16(a4 + CONTINUE.fBannerOff,
      next === CONTINUE.bannerWrap ? 0 : next);            // $2887EE cmpi.w #$44 / bne / $2887F8
  }
  // $2887FE -- the digit block, EVERY frame, off the per-digit pointer table.
  const mark = ram.u8(a4 + CONTINUE.fMark);                // $288804 moveq #0,D4 / $288806 move.b
  const group = rom.u32(CONTINUE.digitPtrs                 // $28880A/$28880C add.w D4,D4 (*4)
    + u16(mark * 4));                                      // $28880E adda.w D4,A0 / $288810 movea.l
  const cell = u32(group + ram.u16(a4 + CONTINUE.fDigitOff)); // $288812 adda.w ($14,A4),A0
  txPrint240E1A(ram, CONTINUE.digitD0, CONTINUE.digitD1, CONTINUE.digitD2,
    CONTINUE.digitD3, rom.u32(cell), CONTINUE.digitD5);    // $288816..$288828
  // $28882E subq.b #1,($12,A4) / $288832 bcc $288850
  const dc = ram.u8(a4 + CONTINUE.fDigitCount);
  ram.setU8(a4 + CONTINUE.fDigitCount, (dc - 1) & 0xff);
  if (dc === 0) {
    ram.setU8(a4 + CONTINUE.fDigitCount,                   // $288836 move.b ($13,A4),($12,A4)
      ram.u8(a4 + CONTINUE.fDigitPeriod));
    const next = u16(ram.u16(a4 + CONTINUE.fDigitOff) + 4); // $28883C addq.w #$4,($14,A4)
    ram.setU16(a4 + CONTINUE.fDigitOff, next);
    // $288840 cmpi.w #$C,($14,A4) / $288846 blt $288850 -- `6D`, signed, and the offsets are 0/4/8.
    if (!(((next << 16) >> 16) < CONTINUE.digitWrap)) {
      ram.setU16(a4 + CONTINUE.fDigitOff, 0);              // $28884A move.w #$0,($14,A4)
    }
  }
  // $288850 -- the cue, on the frame the SECONDS digit changes and on no other.
  const now = ram.u8(a4 + CONTINUE.fMark);                 // $288850 moveq #0 / $288852 move.b
  if (now !== ram.u8(a4 + CONTINUE.fMarkPrev)) {           // $288856 cmp.b ($C,A4),D4 / $28885A beq
    ram.setU8(a4 + CONTINUE.fMarkPrev, now);               // $28885E move.b D4,($C,A4)
    ctx.soundPost?.(CONTINUE.cue);                         // $288862 jsr $28C6AC
  }
}

/** `$288952` -- ENTRY 4, THE CLEAR. Blank both TX blocks once and retire. The same two `$240EBC`
 *  calls with the same four registers entry 1's init makes, which is the positive witness that the
 *  two rectangles this file names are the two rectangles the panel owns. */
export function continueClear288952(ram, rom, ctx, a4) {
  void rom; void ctx;
  if (ram.u16(a4 + CONTINUE.fState) === 0) {               // $288952 tst.w ($2,A4) / bne $288984
    ram.setU16(a4 + CONTINUE.fState, 1);                   // $28895A
    txPrint240EBC(ram, CONTINUE.bannerD0, CONTINUE.bannerD1,
      CONTINUE.bannerD2, CONTINUE.bannerD3);               // $288960..$28896C jsr $240EBC
    txPrint240EBC(ram, CONTINUE.digitD0, CONTINUE.digitD1,
      CONTINUE.digitD2, CONTINUE.digitD3);                 // $288972..$28897E jsr $240EBC
  }
  ram.setU16(a4 + CONTINUE.fIndex, 0);                     // $288984 move.w #$0,(A4)
}

/** The `$288638` jump table, by index. Index 0 never arrives here -- `$28861A beq` skips it in the
 *  dispatcher itself -- so the four bodies above are the whole table. */
export const DISP_288610_TARGETS = Object.freeze({
  1: continuePrompt28864C,
  2: continueWipe28871C,
  3: continueCount28875E,
  4: continueClear288952,
});
