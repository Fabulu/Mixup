# W273: `$2600D8` -- the stage-clear SCORE TALLY, and five HUD rows nobody had

Status: DONE. Suite 1876/1876 (1851 + 25), sweep 0 missing on both the shipped seed and the
stage-2 rung, both run before the commit.

The owner's words were "maybe even score totalling, which I see none of". This is the
routine that posts it.

## Starting state

W272 committed at `28a8e60`, suite 1851/1851, eleven of twelve docket items closed.

## `$2600D8` IS NOT A DESCRIPTOR WALKER

W270 recon'd object dispatch `[11]` down to one unread dependency and called `$2600D8`
"the descriptor walker" from the shape of its eleven call sites. Reading it says otherwise.
It is the tally's POSTER, `$2600D8..$2601F2`, and per call it:

1. picks a side from `tst.w D2` and posts the caller's D0/D1 into that side's pair of
   `$81308x` words;
2. writes one DIP-selected word through a pointer the tally record supplies;
3. allocates the object that runs one bonus line and fills three of its fields;
4. repaints the WHOLE HUD ROW STACK for the side -- seven routines;
5. clears the record's head, posts announcement state `$8`, and recounts the live sides.

## THE FAMILY CHECK PAID OFF ON ALL SEVEN ROWS

    $286FA6 / $286FB4   the extend-threshold seed          NEW
    $287148 / $287198   the score-drain reset              NEW
    $2871E8 / $287210   the chain-meter clear              NEW
    $287238 / $28725E   the digit-state bump, capped at 9  NEW
    $287AAA / $287ADC   the tally's own text row           NEW
    $286ED6 / $286F3E   the hyper stock row                W113, called since W271
    $2878CC / $28795C   the lives row                      W116, called since W271

**Every RAM address the five new ones touch was already named in `HUDRAM`**, and that is
the argument for where they belong:

* `digitsP1` carries the comment "9 records of stride $A" -- `$287148` is the loop that
  seeds those nine;
* `digitStateP1` and `$287238`'s counter are the same word;
* `$2871E8`'s 40-byte sweep is exactly the `HUDRAM.p1` chain-meter block from `accA`
  through `chain`, asserted field by field;
* `extendNextP1`/`extendIdxP1` are `$286FA6`'s two destinations, and `extendStep286FDA`
  -- the STEP that reads them -- has been ported since W63.

So the port has been DRAWING all of this and INITIALISING none of it. The five land in
`hud.js` beside the two they run with; `$2600D8` and `$25FD94` get `src/tally.js`.

## W63 LEFT THE SEED NAMED AND UNPORTED, AND ITS TABLE HALF-WINDOWED

`hud.js`'s own W63 comment says it outright: "`$286FA6`, the INIT that seeds `$81B4AC`/
`$81B4B4` from DIP `$80380D`, is NOT in this closure and is not ported." W63 ported the
step, documented the seed's table `$2883FE` and even asserted its extent in
`check_hud_extents` -- and never gave it a window.

**The two neighbouring windows leave an eight-byte hole.** `$2883E6 + $20` ends at
`$288405`; `$28840E + $10` starts past it. So DIP options 0 and 1 resolved and 2 and 3
threw. Nothing had ever noticed, because nothing had ever read the table for an option
other than the seed's own 0. `$2883FE + $10` is added and all four now read.

## TWO THINGS A PARAPHRASE GETS WRONG

**The extend cursor holds the BYTE OFFSET, not the DIP.** `$286FC8`/`$286FCA add.w D0,D0`
twice and THEN `move.w D0,(A1)`, so option 1 leaves `4` in `extendIdx`. That is what
`extendStep286FDA` wants, because it uses the same word as a `(A5,D0.w)` byte index. A port
that stored the DIP would read the wrong interval on every extend after the first.

**The row block comes from the RECORD, not from D2.** `$2600DC tst.w D2` chooses the record
and the pair of `$81308x` words; then `$260154 move.b ($17,A6),D0 / cmpi.w #$0,D0 / bne`
chooses the row block from `+$17`. A port that reused D2 for both is right on every call
the game currently makes and wrong the moment a side-1 record carries selector 0. The test
drives exactly that case.

## `$241182` LEAVES A0 POINTING AT THE NEW RECORD

`$260118 movea.l ($8,A6),A0` is used only by `$26012A move.w (A1),(A0)`, the DIP write.
`$241182` then clobbers A0 with its own `lea` and does not restore it, so
`$26013A..$26014C`'s four fills go to the NEWLY STAGED OBJECT. A port that kept `($8,A6)`
would write the DIP destination four more times and never fill the object at all. The test
asserts the staged record has the three fields and that the DIP destination holds only the
DIP word.

## `$25FD94` IS (LIVE SIDES - 1), WITH NO FLOOR

    clr.w $81308C / tst.l ($18,A2) -> addq / tst.l ($18,A3) -> addq
    subq.w #1,$81308C / move.w $81308C,$81308E

So none gives `$FFFF`. Ten sites across `effects.js`, `handlers.js`, `laser.js` and
`damage.js` read `$81308C` as "=== 0 is the narrow case", which is consistent with one live
side -- the READS are right and only the NAME is off. It is `HUDRAM.attract` in this port,
from W63's `$284B0E tst.w`. Left as `attract` rather than renamed across five files in a
wave whose subject is the tally, and recorded in `tally.js` so the next reader does not
re-derive it.

## THE WINDOW THAT PINS ITSELF

`$260124 lea ($2600CE,PC),A1` with D0 = `$80380E` doubled: WORD entries, and
`$2600CE + $A` **is `$2600D8`**, whose first word is `$48E7` -- the routine's own
`movem.l`. So the extent needed no guess, and the test asserts both halves: five entries
resolve and the sixth throws.

A DIP past the table is COUNTED at `$2600CE` and names the bound. It deliberately does not
read the ROM to build its message: W264's trap is that an error built from an out-of-window
read reports a WINDOW error about the wrong address instead of the real gap.

## THE XREF INSTRUMENT MISSES PC-RELATIVE CALLERS, AND IT HAS COST TWICE

`$2600D8`'s remaining gap is `$241688`, the tally's palette set: four arms on (D0, D1),
each installing three sprite banks through `$24150A` plus one text bank through `$2414BE`.
Twelve source blocks, each needing its own window, so it is deferred with its address and
counted -- but reading it produced a correction worth recording.

**`src/palette.js` says "[M] bank 9 (`$2226F8`) has NO installer anywhere in the image at
all."** `$2416C0 lea $2226F8,A0 / moveq #$9,D0 / jsr ($2414BE,PC)` is one. It was missed
because the call is PC-RELATIVE, and `tools/hard/absxref.py` -- the instrument that
sentence rests on -- walks `jsr/jmp <abs>.l` only.

That is the second time this session: `src/type5.js` records `$24C8BE` as having "no
absolute-long caller (checked: it is reached PC-relative from inside `$24C096`)". So the
blind spot is known per-site and has never been fixed at the instrument. **A PC-relative
xref pass is the mechanical fix and it is now the top item in the work order**, because
every "[M] nothing calls this" claim in the tree rests on the same scan.

Not fixed here, and `palette.js`'s sentence is left standing rather than edited from a
disassembly this wave did not otherwise verify -- the correction is recorded in `tally.js`
at the deferral and in the handoff.

## Also recorded

* `HUDRAM.total2P1/P2` and `ovf2P1/P2` (`$81B4A0`/`$81B4A8` and their P2 twins) are named
  from the PAIRING with `totalP1`/`ovfP1` four words below, which `$287148` zeroes together.
  No routine that READS them is ported, so the inference is unconfirmed and labelled.
* Neither side's nine-record loop abuts its own `extraRec`: P1's nine abut P2's nine, and
  P2's abut `extraRecA`. Both `$28716C`/`$2871BC` leas are fresh. The test asserts this,
  because an off-by-one loop would look correct if they did abut.
* `$260112 subq.w #1,$813142` is UNGUARDED and wraps past zero. Asserted.

## Order for the next wave

1. **A PC-RELATIVE XREF PASS**, extending `tools/hard/absxref.py` or beside it. Two
   documented claims in `src/` are already wrong because of its absence and both were found
   by accident. This is cheap, mechanical, and it audits every "nothing calls this" in the
   tree -- including the ones this session's waves relied on.
2. **`$241688`**, the tally's palette set: twelve source blocks across four arms. Its arm 0
   installs TEXT bank 9, which closes `palette.js`'s open question about `$2226F8`.
3. **Object dispatch `[11]` `$25DBB4` end to end.** With `$2600D8` landed it needs only
   `$28D53C` (6 instructions) and `$23C932` (9), both trivial. Then the four other
   announcement-poster caller regions, which share W270's protocol.
4. Then D11's remainder and stage 5, as the handoff has them.
