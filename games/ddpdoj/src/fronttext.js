// THE FRONT END'S TWO TEXT DRAWERS -- `$259FF8` and `$23CFDE`. W376.
//
// Slot [8] (`objslot8.js`) counted both of these as deferrals from W375 until this wave, and they
// are why a cold boot was silent and blank: `$259FF8` is the ONLY thing arm 13's line walk draws
// with, and `$23CFDE` is the ONLY thing that tells a player a coin registered. Neither is a screen
// sub-machine -- between them they are 74 + 130 bytes of dispatcher plus twelve short tails -- and
// both bottom out in printers this port has had since W116.
//
// **THEY DO NOT SHARE A PRINTER, AND THAT IS THE MAIN THING TO GET RIGHT.**
//
//   $259FF8  -> $240E1A  (`txPrint240E1A`, hud.js) -- the DEFERRED printer. It appends
//                        (dest, tile) pairs to the `$80B058` buffer, and IRQ6's `$141258` flush
//                        drains them into TxVram on the NEXT frame. So a line emitted by arm 13
//                        on frame N is on the tilemap from frame N+1.
//   $23CFDE  -> $25A14C  (`txString25A14C`, background.js) -> $240CF0 (`txBlock240CF0`) -- the
//                        DIRECT blit. It writes TxVram there and then, in the same frame.
//
// A port that routed both through one of them would either lose a frame on the credit line or
// draw the warning screen a frame early, and neither would look like a bug on a still frame.
//
// THE OTHER TRAP IS THE FONT. `$25A14C` uses the character byte AS the tile number; `$259FF8`
// looks it up in a 96-entry table at `$25A042` and each glyph is TWO tiles, `T` and `T + $10`.
// Feeding `$259FF8`'s strings through `$25A14C` draws the wrong glyphs at half the size, which is
// exactly the sort of failure that reads as a font-ROM problem rather than as a wrong routine.

import { u16, u32, i16 } from './ram.js';
import { txPrint240E1A } from './hud.js';
import { txString25A14C, txBlock240CF0 } from './background.js';

export const FRONTTEXT = Object.freeze({
  // --- `$259FF8`, `$259FF8..$25A041` -- 74 bytes, `rts` at `$25A040`.
  emit: 0x259ff8, emitEnd: 0x25a042,
  font: 0x25a042,          // $25A010 lea ($25A042,PC),A1 -- EA = $25A012 + $30, the EXTENSION
                           //         WORD's own address plus the displacement
  fontLen: 0x00c0,         // 96 words, chars $20..$7F -- see the window note in export-tables.py
  fontFirst: 0x20,         // $25A01A subi.w #$20,D4
  fontChars: 96,
  emitCols: 0x0001,        // $25A002 moveq #$1,D2 -- (D2+1) = TWO cells per glyph
  emitRows: 0x0000,        // $25A004 moveq #$0,D3 -- (D3+1) = one cell tall
  emitStride: 0x0010,      // $25A02A move.w #$10,D5 -- $240E1A's inter-COLUMN tile stride
  emitAdvance: 0x0100,     // $25A036 addi.w #$100,D1 -- one character
  emitAttr: 0x0000,        // $259FFC move.w #$0,D2 / $25A000 move.w D2,D5 -- HARDWIRED, see below

  // --- `$23CFDE`, `$23CFDE..$23D05F` -- 130 bytes, and its twelve tails live BELOW it at
  //     `$23CD80..$23CFDD`. `$23D060` is `creditSpend23D060`, already ported in objslot8.js.
  creditLine: 0x23cfde, creditLineEnd: 0x23d060,
  digit: 0x23cd80,         // $23CD80..$23CDAB -- the one-hex-digit printer
  dip: 0x803808,           // $23CFE2 move.b $803808,D0 -- the coinage band
  dipSlot2: 0x80380b,      // $23CFE8 move.b $80380B,D1 -- 1 = SEPARATE credit pools
  freePlay: 0x12,          // $23CFEE cmpi.w #$12
  coinMode: 0x11,          // $23D00C cmpi.w #$11
  bandLo: 0x09, bandHi: 0x10,   // $23D02E cmpi.w #$9 / blt and $23D028 cmpi.w #$10 / bgt
  separate: 0x01,          // $23CFF6 / $23D012 / $23D034 / $23D04A cmpi.b #$1,D1

  // The five counters the eight tails read. `$803956` is `isr.js`'s `COIN.coinsPerCredit` and
  // `$803958`/`$80395A` are the pair `coinage13CE22` walks: `(A0)` is the COIN accumulator and
  // `($2,A0)` the CREDIT count. `isr.js` calls `$803958` `creditA`, which is a misnomer its own
  // header already admits; `objslot8.js SCREEN8` names them the way this line displays them.
  coinsPerCredit: 0x803956,
  coinA: 0x803958, creditA: 0x80395a,
  coinB: 0x80395e, creditB: 0x803960,

  // The six strings, every one NUL-terminated and every one read by `$25A15A tst.b D4 / beq`.
  strFreePlay: 0x23cdac,      // $23CDBE / $23CDE0 lea -- "FREE PLAY"
  strCoins: 0x23cdf0,         // $23CE00 / $23CE2A / $23CE4E lea -- "COINS:"
  strCreditsPair: 0x23ce6a,   // $23CE94 lea -- "CREDITS: ( / )"
  strCredits: 0x23ce7a,       // $23CED8 / $23CF24 lea -- "CREDITS"
  strPairOnly: 0x23ce83,      // $23CEE6 / $23CF32 lea -- "  ( / )"
  strCreditsColon: 0x23cf68,  // $23CF7A / $23CF9E / $23CFC2 lea -- "CREDITS:"
});

// -------------------------------------------------------------------------------------------
// `$259FF8` -- THE WARNING SCREEN'S STRING EMITTER.

/**
 * `$259FF8` -- draw a NUL-terminated string through the FONT TABLE and the deferred printer.
 * Seventy-four bytes, `$259FF8..$25A041`, and the whole image contains exactly ONE reference to
 * it: `$25AC64 jsr $259FF8` in arm 13. (Scanned for `4EB9`/`4EF9 00259FF8` and for every
 * pc-relative `4EBA`/`4EFA` in `$200000..`; one hit.)
 *
 *     259FF8  48e7fffe        movem.l  d0-d7/a0-a6,-(a7)
 *     259FFC  343c0000        move.w   #$0,d2
 *     25A000  3a02            move.w   d2,d5
 *     25A002  7401            moveq    #$1,d2
 *     25A004  7600            moveq    #$0,d3
 *     25A006  7800            moveq    #$0,d4        <- THE LOOP TOP, and $25A03A branches here
 *     25A008  1818            move.b   (a0)+,d4
 *     25A00A  4a04            tst.b    d4
 *     25A00C  6700002e        beq.w    $25A03C
 *     25A010  43fa0030        lea      ($25A042,pc),a1
 *     25A014  4e71            nop
 *     25A016  024400ff        andi.w   #$FF,d4
 *     25A01A  04440020        subi.w   #$20,d4
 *     25A01E  d844            add.w    d4,d4
 *     25A020  d2c4            adda.w   d4,a1
 *     25A022  3811            move.w   (a1),d4
 *     25A024  4844            swap     d4
 *     25A026  3805            move.w   d5,d4
 *     25A028  2f05            move.l   d5,-(a7)
 *     25A02A  3a3c0010        move.w   #$10,d5
 *     25A02E  4eb900240e1a    jsr      $240E1A
 *     25A034  2a1f            move.l   (a7)+,d5
 *     25A036  06410100        addi.w   #$100,d1
 *     25A03A  60ca            bra.s    $25A006
 *     25A03C  4cdf7fff        movem.l  (a7)+,d0-d7/a0-a6
 *     25A040  4e75            rts
 *
 * FIVE THINGS THE BYTES SAY THAT A SUMMARY WOULD NOT:
 *
 *   * **THE ATTRIBUTE IS HARDWIRED ZERO.** `$259FFC move.w #$0,D2` runs BEFORE
 *     `$25A000 move.w D2,D5`, so D5 -- the low word of every tile longword -- is 0 no matter what
 *     the caller put in D2. Its near-twin `$25A14C` does `move.w D2,D5` FIRST and therefore
 *     honours the caller's D2. Two routines, one line apart in shape, opposite contracts. Arm 13
 *     passes `#$0` in D2 anyway (`$25AC60`), so this is invisible from the one call site -- which
 *     is exactly why it has to be written down rather than inferred from the caller.
 *   * **`moveq #$0,D4` IS INSIDE THE LOOP.** `$25A03A bra.s $25A006` lands on it, not on
 *     `$25A008`, so D4's high word is cleared every character and `swap` cannot carry the
 *     previous glyph's number into the low word.
 *   * **`$25A028`/`$25A034`'s PUSH AND POP OF D5 ARE DEAD.** `$240E1A` opens
 *     `48e7ff80 movem.l d0-d7/a0,-(a7)` and closes `4cdf01ff movem.l (a7)+,d0-d7/a0`, so it
 *     restores D5 itself. The port keeps D5 as a constant and does not model the stack traffic;
 *     nothing can observe it. It is also what proves D0, D1, D2 and D3 survive the call, which is
 *     the assumption the loop is built on.
 *   * **THE TABLE IS INDEXED SIGNED.** `add.w D4,D4` then `adda.w D4,A1` sign-extends a WORD.
 *     For a byte below `$20` the index would go NEGATIVE and read behind the table. The port does
 *     the same arithmetic rather than clamping; the fourteen strings arm 13 feeds it hold only
 *     `$20..$59`, measured, so it never happens -- but a clamp would be an invention.
 *   * **`$25A010 lea` IS INSIDE THE LOOP TOO**, reloading A1 every character. That is what makes
 *     `adda.w` an absolute index rather than a running one.
 *
 * @param d0 `($8,A5)`, arm 13's sprite Y -- `$240E1A`'s outer-axis base, untouched by the loop.
 * @param d1 the character advance, `$0` at `$25AC5C` and `+$100` a character.
 * @param addr A0, `$25AA36 + ($6,A5)`.
 */
export function txFontString259FF8(ram, rom, d0, d1, addr) {
  const d5 = FRONTTEXT.emitAttr;                 // $259FFC / $25A000 -- see the note above
  let d1w = u16(d1);
  for (let a = addr; ; a++) {
    let d4 = rom.u8(a) & 0xff;                   // $25A006 moveq #$0,D4 / $25A008 move.b (A0)+,D4
    if (d4 === 0) return;                        // $25A00A tst.b D4 / $25A00C beq.w $25A03C
    d4 = u16(d4);                                // $25A016 andi.w #$FF,D4
    d4 = u16(d4 - FRONTTEXT.fontFirst);          // $25A01A subi.w #$20,D4
    d4 = u16(d4 + d4);                           // $25A01E add.w D4,D4
    const a1 = FRONTTEXT.font + i16(d4);         // $25A010 lea / $25A020 adda.w -- SIGN-EXTENDED
    const tile = rom.u16(a1);                    // $25A022 move.w (A1),D4
    // $25A024 swap D4 / $25A026 move.w D5,D4 -- the tile NUMBER is the HIGH word and the
    // attribute the LOW, the same layout `txBlock240CF0` documents for $240CF0's D4.
    const d4long = u32(((tile << 16) >>> 0) | d5);
    txPrint240E1A(ram, d0, d1w, FRONTTEXT.emitCols, FRONTTEXT.emitRows,
      d4long, FRONTTEXT.emitStride);             // $25A02E jsr $240E1A
    d1w = u16(d1w + FRONTTEXT.emitAdvance);      // $25A036 addi.w #$100,D1
  }
}

// -------------------------------------------------------------------------------------------
// `$23CFDE` -- THE CREDIT / FREE PLAY LINE.

/**
 * `$23CD80` -- ONE HEX DIGIT, and every counter on the credit line goes through it.
 *
 *     23CD80  48e7f800        movem.l  d0-d4,-(a7)
 *     23CD84  02840000000f    andi.l   #$F,d4
 *     23CD8A  3a02            move.w   d2,d5
 *     23CD8C  7400            moveq    #$0,d2
 *     23CD8E  7600            moveq    #$0,d3
 *     23CD90  0c04000a        cmpi.b   #$A,d4
 *     23CD94  6d02            blt.s    $23CD98
 *     23CD96  5e44            addq.w   #$7,d4
 *     23CD98  06440030        addi.w   #$30,d4
 *     23CD9C  4844            swap     d4
 *     23CD9E  3805            move.w   d5,d4
 *     23CDA0  4eb900240cf0    jsr      $240CF0
 *     23CDA6  4cdf001f        movem.l  (a7)+,d0-d4
 *     23CDAA  4e75            rts
 *
 * `andi.l #$F` is the LOW NIBBLE ONLY, so a counter of `$1A` prints `A` and a counter of `$10`
 * prints `0`. That is not a bug this port should smooth over -- `coinage13CE22` clamps both
 * counters at nine (`isr.js`), so the nibble is the whole value on any machine that got here
 * legally, and the `cmpi.b #$A / addq #$7` arm exists for the ones that did not.
 *
 * `moveq #$0,D2 / moveq #$0,D3` make `$240CF0`'s grid ONE cell. D2 is read into D5 as the
 * attribute BEFORE being zeroed, so the caller's D2 is the palette -- and every caller in this
 * file passes 0, inherited from its own `move.w #$0,D2`.
 *
 * **EXPORTED, because it is NOT the credit line's private helper.** A scan of `$130000..` for
 * `4EB9`/`4EF9`/`4EBA`/`4EFA` reaching it finds TWENTY-FOUR call sites: the fifteen below, and
 * nine outside this file -- `$25B0AA $25B0F2 $25B32A $25B362` (the high-score screen's
 * neighbourhood), `$25E1B4 $25E1F4`, `$25F3C6 $25F408` and `$2886F4`. Whoever ports those should
 * call this rather than transcribe it a second time.
 */
export function hexDigit23CD80(tx, d0, d1, d2, d4) {
  const d5 = u16(d2);                            // $23CD8A move.w D2,D5 -- BEFORE the moveq
  let n = d4 & 0x0f;                             // $23CD84 andi.l #$F,D4
  if (n >= 0x0a) n = u16(n + 7);                 // $23CD90 cmpi.b #$A / $23CD94 blt / $23CD96
  n = u16(n + 0x30);                             // $23CD98 addi.w #$30,D4
  // $23CD9C swap D4 / $23CD9E move.w D5,D4 / $23CDA0 jsr $240CF0 with D2 = D3 = 0.
  txBlock240CF0(tx, d0, d1, 0, 0, u32(((n << 16) >>> 0) | d5));
}

/** The eight tails all print their label the same way: `move.w #d0,D0 / move.w #d1,D1 /
 *  lea (str,PC),A0 / move.w #$0,D2 / jsr $25A14C`. `$25A14C` saves and restores D0-D5/A0
 *  (`48e7fc80` / `4cdf013f`), which is what lets each tail keep using D0 afterwards. */
function label(tx, rom, d0, d1, addr) {
  txString25A14C(tx, rom, d0, d1, 0x0000, addr);
}

/**
 * `$23CDB6`, `$23CDCE` and `$23CDD8` -- FREE PLAY. Three entries, and the last two FALL INTO ONE
 * BODY at `$23CDE0` differing only in D0 (`$23CDD6 bra.s $23CDE0` jumps over `$23CDD8`'s
 * `move.w #$11,D0`): the trap `objslot8.js` already documents for `$246410`/`$24641A`.
 *
 *   $23CDB6  D0 = $A   -- the SHARED-pool line, one "FREE PLAY" in the middle
 *   $23CDCE  D0 = $3   -- P1's, and `$23D002` reaches it with `jsr`, not `jmp`
 *   $23CDD8  D0 = $11  -- P2's, reached by the `jmp` right after, so BOTH are drawn
 *
 * `$23CDB6` is its own copy of the same four instructions rather than a third entry into
 * `$23CDE0`; the port folds the three into one helper because the only thing that differs is D0.
 */
function freePlayLine(tx, rom, d0) {
  label(tx, rom, d0, 0x0003, FRONTTEXT.strFreePlay);   // $23CDBE / $23CDE0 lea $23CDAC
}

/**
 * `$23CDF8`, `$23CE22` and `$23CE46` -- the `$11` COIN-MODE line: "COINS:" and one digit six
 * columns further on (`$23CE0E addq.w #$6,D0`).
 *
 *   $23CDF8  label at $B, digit at $11 = `$803958 + $80395E`  -- shared pool, BOTH slots summed
 *   $23CE22  label at $4, digit at $A  = `$803958`            -- separate, P1
 *   $23CE46  label at $12, digit at $18 = `$80395E`           -- separate, P2
 *
 * `$23CE16 add.b $80395E,D4` is a BYTE add, so the sum wraps at `$FF` before `$23CD80` takes its
 * low nibble. Modelled, not widened.
 */
function coinsLine(tx, rom, d0, count) {
  label(tx, rom, d0, 0x0003, FRONTTEXT.strCoins);     // $23CE00 / $23CE2A / $23CE4E lea $23CDF0
  hexDigit23CD80(tx, u16(d0 + 6), 0x0003, 0, count);     // $23CE0E addq.w #$6,D0 / jmp $23CD80
}

/**
 * `$23CE8C` -- the `$9..$10` BAND, shared pool. One line carrying all three numbers:
 *
 *     "CREDITS: ( / )"  at (7, 3)
 *     $13 <- $803956    coins per credit  ($23CEA2 addi.w #$C,D0)
 *     $11 <- $803958 + $80395E            ($23CEB0 subq.w #$2,D0)
 *     $F  <- $80395A    credits           ($23CEC2 subq.w #$2,D0)
 *
 * The three digits land INSIDE the label's own span -- `$25A14C` printed columns 7..$14 and these
 * overwrite 8, 10 and 12 of it, which are the three blanks in `"CREDITS: ( / )"`. Walking D0
 * DOWNWARD from `$13` is what makes the arithmetic come out; a port that walked up would put the
 * credits where the coinage goes.
 */
function bandSharedLine(ram, tx, rom) {
  label(tx, rom, 0x0007, 0x0003, FRONTTEXT.strCreditsPair);              // $23CE94 lea $23CE6A
  hexDigit23CD80(tx, 0x0013, 0x0003, 0, ram.u8(FRONTTEXT.coinsPerCredit));  // $23CEA6 / $23CEAC
  hexDigit23CD80(tx, 0x0011, 0x0003, 0,                                     // $23CEB2 / $23CEB8
    u16(ram.u8(FRONTTEXT.coinA) + ram.u8(FRONTTEXT.coinB)) & 0xff);      // add.b -- a BYTE
  hexDigit23CD80(tx, 0x000f, 0x0003, 0, ram.u8(FRONTTEXT.creditA));         // $23CEC4 / $23CECA
}

/**
 * `$23CED0` (P1) and `$23CF1C` (P2) -- the `$9..$10` band with SEPARATE pools, and these are the
 * only two tails that print TWO strings:
 *
 *     "CREDITS"  at (D0, 4)      <- D1 = 4, one column off the rest of the line
 *     "  ( / )"  at (D0, 3)      <- D1 = 3, and D0 is UNCHANGED because $25A14C restored it
 *     D0+5 <- $803956, D0+3 <- the slot's COIN count, D0+1 <- the slot's CREDIT count
 *
 * `$23CED0` starts at D0 = 3 and reads `$803958`/`$80395A`; `$23CF1C` starts at D0 = `$11` and
 * reads `$80395E`/`$803960`. `$23D040 jsr $23CED0` then `$23D044 jmp $23CF1C`, so both print.
 */
function bandSeparateLine(ram, tx, rom, d0, coin, credit) {
  label(tx, rom, d0, 0x0004, FRONTTEXT.strCredits);                       // $23CED8 / $23CF24
  label(tx, rom, d0, 0x0003, FRONTTEXT.strPairOnly);                      // $23CEE6 / $23CF32
  const base = u16(d0 + 5);                                               // $23CEF4 addi.w #$5,D0
  hexDigit23CD80(tx, base, 0x0003, 0, ram.u8(FRONTTEXT.coinsPerCredit));
  hexDigit23CD80(tx, u16(base - 2), 0x0003, 0, ram.u8(coin));                // $23CF02 subq.w #$2,D0
  hexDigit23CD80(tx, u16(base - 4), 0x0003, 0, ram.u8(credit));              // $23CF0E subq.w #$2,D0
}

/**
 * `$23CF72`, `$23CF96` and `$23CFBA` -- THE DEFAULT BAND, i.e. every coinage byte outside
 * `$9..$12`. **This is the arm a cold boot takes**, because `$803808` on zeroed RAM is `$00`.
 * "CREDITS:" and one digit EIGHT columns on (`$23CF88 addq.w #$8,D0`), no coin count at all.
 *
 *   $23CF72  label at $A,  digit at $12 = `$80395A`   -- shared pool
 *   $23CF96  label at $3,  digit at $B  = `$80395A`   -- separate, P1
 *   $23CFBA  label at $11, digit at $19 = `$803960`   -- separate, P2
 */
function plainCreditsLine(ram, tx, rom, d0, credit) {
  label(tx, rom, d0, 0x0003, FRONTTEXT.strCreditsColon);           // $23CF7A / $23CF9E / $23CFC2
  hexDigit23CD80(tx, u16(d0 + 8), 0x0003, 0, ram.u8(credit));         // $23CF88 addq.w #$8,D0
}

/**
 * `$23CFDE` -- THE CREDIT LINE'S DISPATCHER. `$23CFDE..$23D05F`, 130 bytes, and `$23D060` is
 * `creditSpend23D060` -- already ported in `objslot8.js`, which pins the end exactly.
 *
 * TWO DIPS, FOUR BANDS, TWO POOL MODES -- eight tails, and the shape is the same every time:
 * `bne` past this band, then `cmpi.b #$1,D1 / beq` to the separate-pool pair. A separate-pool
 * band is always `jsr <P1 tail>` FOLLOWED BY `jmp <P2 tail>`, so both sides print; a shared-pool
 * band is a single `jmp`.
 *
 *     $803808 == $12       FREE PLAY   -> $23CDB6      | $23CDCE + $23CDD8
 *     $803808 == $11       coin mode   -> $23CDF8      | $23CE22 + $23CE46
 *     $9 <= $803808 <= $10 the band    -> $23CE8C      | $23CED0 + $23CF1C
 *     otherwise            the default -> $23CF72      | $23CF96 + $23CFBA
 *
 * **THE BAND TEST IS SIGNED AND IT IS THE THIRD TEST, NOT THE FIRST.** `$23D028 cmpi.w #$10,D0 /
 * bgt` and `$23D02E cmpi.w #$9,D0 / blt` both jump to the DEFAULT tail, and `$12` and `$11` have
 * already been taken out above them -- so the band really is `$9..$10` and not `$9..$12`. D0 and
 * D1 are both `moveq #$0` then `move.b`, i.e. ZERO-EXTENDED bytes, which is what makes the signed
 * compares agree with unsigned ones here.
 *
 * `$803808` and `$80380B` are the same two dips `creditTake23C98E` and `creditTake23C9F0` read,
 * and this routine's four bands are the same four `coinage13CE22` (`isr.js`) uses to decide what
 * a coin is worth. The line and the counter therefore always agree about which machine this is.
 */
export function creditLine23CFDE(ram, rom, tx) {
  const d0 = ram.u8(FRONTTEXT.dip);                    // $23CFDE moveq #$0,D0 / $23CFE2 move.b
  const d1 = ram.u8(FRONTTEXT.dipSlot2);               // $23CFE0 moveq #$0,D1 / $23CFE8 move.b
  const sep = d1 === FRONTTEXT.separate;               // $23CFF6 / $23D012 / $23D034 / $23D04A

  if (d0 === FRONTTEXT.freePlay) {                     // $23CFEE cmpi.w #$12 / $23CFF2 bne.w
    if (!sep) { freePlayLine(tx, rom, 0x000a); return; }         // $23CFFC jmp $23CDB6
    freePlayLine(tx, rom, 0x0003);                               // $23D002 jsr $23CDCE
    freePlayLine(tx, rom, 0x0011);                               // $23D006 jmp $23CDD8
    return;
  }
  if (d0 === FRONTTEXT.coinMode) {                     // $23D00C cmpi.w #$11 / $23D010 bne.s
    if (!sep) {                                                  // $23D018 jmp $23CDF8
      coinsLine(tx, rom, 0x000b,
        u16(ram.u8(FRONTTEXT.coinA) + ram.u8(FRONTTEXT.coinB)) & 0xff);   // $23CE16 add.b
      return;
    }
    coinsLine(tx, rom, 0x0004, ram.u8(FRONTTEXT.coinA));         // $23D01E jsr $23CE22
    coinsLine(tx, rom, 0x0012, ram.u8(FRONTTEXT.coinB));         // $23D022 jmp $23CE46
    return;
  }
  if (d0 >= FRONTTEXT.bandLo && d0 <= FRONTTEXT.bandHi) {        // $23D028/$23D02E, both to $23D04A
    if (!sep) { bandSharedLine(ram, tx, rom); return; }          // $23D03A jmp $23CE8C
    bandSeparateLine(ram, tx, rom, 0x0003,                       // $23D040 jsr $23CED0
      FRONTTEXT.coinA, FRONTTEXT.creditA);
    bandSeparateLine(ram, tx, rom, 0x0011,                       // $23D044 jmp $23CF1C
      FRONTTEXT.coinB, FRONTTEXT.creditB);
    return;
  }
  if (!sep) {                                                    // $23D050 jmp $23CF72
    plainCreditsLine(ram, tx, rom, 0x000a, FRONTTEXT.creditA);
    return;
  }
  plainCreditsLine(ram, tx, rom, 0x0003, FRONTTEXT.creditA);     // $23D056 jsr $23CF96
  plainCreditsLine(ram, tx, rom, 0x0011, FRONTTEXT.creditB);     // $23D05A jmp $23CFBA
}
