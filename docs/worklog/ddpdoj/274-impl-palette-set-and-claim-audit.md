# W274: `$241688`, and an audit that corrected two of my own claims

Status: DONE. Suite 1889/1889 (1876 + 13), sweep 0 missing on both the shipped seed and the
stage-2 rung, both run before the commit.

W273 closed with "build a PC-relative xref pass" as the top work-order item. **That item was
wrong**: the pass already exists, `tools/rosetta.py codexref`, and it has handled all six
encodings since it was written. So this wave did the audit instead of the tool, and the audit
found more than the thing it was aimed at.

## Starting state

W273 committed at `63a66be`, suite 1876/1876.

## CORRECTION 1: W273's diagnosis of the bank-9 miss

W273 said `palette.js`'s claim "[M] bank 9 (`$2226F8`) has NO installer anywhere in the image
at all" was missed "because the call is PC-RELATIVE". Wrong. The reference is
`$2416C0 lea $2226F8,A0` -- **absolute long**. What could not see it is
`tools/hard/absxref.py`, whose whole method is to histogram operands that land in MAIN RAM
(`$800000..$81FFFF`); a ROM block at `$2226F8` is outside its range by construction.
`codexref` finds it in one line and always could have.

The claim in `palette.js` is corrected in place, and the sentence above it is left standing,
because the correction is the interesting part: an absence is only as strong as the scan
behind it, and now that one names its scan.

## THE AUDIT, and every other claim in `src/` holds

Re-checked against the image, and re-checked in the suite so they cannot rot:

    $2226F8   palette.js  "no installer anywhere"        FALSE -- one, $2416C0
    $261138   background.js "no caller at all"           holds, 0 references
    $28E7B6   stageend.js "no caller in the image"       holds, 0 references
    $294370   boss.js     nothing transfers here         holds, 0 references
    $294377   boss.js     one transfer, inside the       holds, exactly 1, at $292322
                          ASCII credits
    $24C8BE   type5.js    "no ABSOLUTE-LONG caller"      holds -- 3 callers, all bsr.w,
                                                         all inside $24C096

`$24C8BE` is the shape that makes the missing scan dangerous: the sentence is precise, true,
and reads as "uncalled" to anyone skimming. `codexref`'s six encodings are reimplemented in
`tests/w274paletteset.test.js` so the audit runs on every suite pass rather than when someone
remembers to invoke a python tool.

## CORRECTION 2, AND IT IS A REAL PORT BUG: `$24A458`'s COMPARE IS INVERTED

W272 wrote: "no instruction anywhere in `$240000..$2A6000` sets bit 8 of the player state
word, so the walker is unreachable." **That scan was run against `rip/sound/maincpu.bin` with
a base of `$200000` when the file is OFFSET-ADDRESSED** -- offset equals address, which is
what `rosetta.py`'s `RANGES = {A: (0x100000, 0x1C8000), B: (0x200000, 0x2B0000)}` means. So it
read the wrong bytes and reported zero. Re-run correctly there are 67 candidate sites in
build B, and one of them matters:

    24a118: andi.w #$2000,(A6)          the state word becomes exactly $2000
    24a11c: bset   #$0,(A6)             ...then $2100: bit 15 CLEAR, BIT 8 SET
    24a120: move.l #$255B7C,($14,A6)    the walker's PROGRAM POINTER
    24a128: move.w #$6,($18,A6)         and its counter

Then the two entries themselves, twelve bytes apart, reading the same word with **opposite
senses**:

    24a448: bmi $24A482      $24A440 drawShip:  negative CONTINUES to the draw
    24a460: bmi $24A46A      $24A458 this one:  **$24A46A IS THE RTS**

So the cartridge returns from `$24A458` when bit 15 is SET and tests bit 8 when it is CLEAR.
The port had `drawShip`'s line copied into both, which makes the arm dead by construction --
a live player always carries bit 15 -- and `$24A118` is exactly the state that reaches it.

**The correct compare is not shippable yet.** Flipping it turns W227, W228 and W231 -- the
three real-death tests -- straight into `$24A6B4` throws, because `$24A118` is on the DEATH
path. So the port keeps a known-wrong line rather than a known-broken death, and the line
now carries the full diagnosis, the reason it is not flipped, and the instruction to flip it
only together with the walker.

W272's other conclusions are untouched and stand on their own evidence: the board's bucket 19
holds exactly three ship records on four rungs of the ladder, and the port's three plus its
five trail records match the board byte for byte 100 frames out from the cartridge's own RAM.
That was always the primary argument; the bit-8 scan was a secondary one and it is withdrawn.

## `$241688` -- WHAT THE WAVE WAS FOR

`$2600D8`'s last counted gap, and the structure is a two-bit selector, not four routines:

           D0  D1     spr           spr           spr           tx
    $241696  0   0    0 <- $222878  2 <- $222978  4 <- $2229F8   9 <- $2226F8
    $2416D0  0  !0    0 <- $2228B8  2 <- $2229B8  4 <- $222A38   9 <- $222738
    $241710 !0   0    1 <- $2228F8  3 <- $222978  4 <- $2229F8  $A <- $222718
    $24174A !0  !0    1 <- $222938  3 <- $2229B8  4 <- $222A38  $A <- $222758

**D1 picks the SOURCE and D0 picks the DESTINATION BANK.** The two D1=0 arms share their
second and third sources and the two D1!=0 arms share theirs; D0 shifts the sprite banks from
(0,2) to (1,3) and the text bank from 9 to `$A`. Bank 4 is installed by all four arms and
never shifts. Both selector tests are on WORDS, so a high half never picks an arm -- asserted.

In `tally.js` the two call sites `$260160`/`$26019A` differ only in which `$81308x` word they
load into D1, and D0 is the record's own row byte. Both are handed over as the ROM has them:
D0 is the RAW byte, not a 0/1.

## TWELVE SOURCE BLOCKS, TWO WINDOWS, NO GUESSED EXTENT

Both windows end exactly where a window that already existed begins:

* the eight sprite blocks are `$40` apart from `$222878`, and `$222A38 + $40` is `$222A78`
  where W91's palette-family window starts -- so `$222878 + $200` is exactly eight blocks
  and abuts it;
* the four text blocks are `$20` apart from `$2226F8`, `$222638 + $C0` ends AT `$2226F8`,
  and `$222758 + $20` is `$222778` where another window starts -- so `$2226F8 + $80` fills
  the hole between two existing windows exactly.

387 ROM windows. Both adjacencies are asserted in the test, so a later widening that breaks
one is caught.

## Order for the next wave

1. **`$24A6B4`, THE SCRIPT-DRIVEN DISPLAY WALKER, AND THEN FLIP `$24A458`'s COMPARE.** These
   are one job and the wave is not done until the flip is in and W227/W228/W231 are green
   with it. The walker is compact and its shape is already read:

       $24A6B4  btst #$2,(A6) / bne -> rts          the state gate
       $24A6BA  tst.w ($18,A6) / beq                the counter, decremented then
       $24A6C0  subq.w #1,($18,A6) / jsr $23F104    ONE plain per-record enqueue
       $24A6CA  movea.l ($14,A6),A2 / movea.l (A2),A2   the pointer is INDIRECT
       $24A6D0  move.l (A2)+,D2 -- the opcode loop, and a NEGATIVE opcode ends it
         op 0     ($2a,A6) = a long, ($2e,A6) = a word
         op 1     $24A70E, the one that reads a second long and biases by -$400/-$1000
         op 2     ($4,A6) = a word
         op >2    D1 = ($2,A6) + ($2a,A6) as a LONG add, D3 = ($2e,A6),
                  D4 = ($28,A6), jsr $23F294
   Needs: the rest of op 1 past `$24A724`, a window for the program at `$255B7C` (whose
   first long is itself a pointer -- `movea.l (A2),A2`), and `$23F294`'s port checked. It is
   on the DEATH path, so it is player-visible.
2. **Object dispatch `[11]` `$25DBB4` end to end** -- `$2600D8` is done and `[11]` needs only
   `$28D53C` (6 instructions) and `$23C932` (9). Then the four other announcement-poster
   caller regions.
3. Then D11's remainder and stage 5.

## And a rule for the next reader

Two claims of mine were wrong this session and both were absences: "nothing sets this bit"
and "nothing calls this block". Both came from a scan whose range or base I did not check
against the instrument that already existed. **A negative result about the image is a claim
about a SCAN, so name the scan and prefer `rosetta.py codexref` -- and when the answer is
zero, verify the scan finds something you already know is there.** The `$2600D8` sanity check
in this wave's scan (`u16($2600D8) == $48E7`) is that habit written down.
