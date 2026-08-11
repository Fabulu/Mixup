# W277: the cursor round trip, and the bonus-line table found

Status: DONE. Suite 1925/1925 (1917 + 8), sweep 0 missing on both the shipped seed and the
stage-2 rung, both run before the commit.

Three of state 1's six, taken in the dependency-first order worklog 276 set. The result is
that the screen and the tally are now a closed loop rather than two halves.

## Starting state

W276 committed at `ef7a7f6`, suite 1917/1917, object `[11]` registered with state 1 counted.

## `$25FF38` FIRST, BECAUSE IT WRITES THE TALLY RECORDS

    lea $8130FA,A0 / tst.w D0 / beq / lea $81311E,A0
    move.w D1,(A0) / clr.w ($2,A0) / rts

Four instructions, and they write the same two words `$2600D8` clears on its way out at
`$2601D0`/`$2601D4` -- the same `(request, state)` shape `announce260B30`'s mailbox at
`$813162` uses. **So the tally record's head is a MAILBOX** and this is its poster.
`tst.w D0` is a word test, asserted with `$10000`.

## AND THAT IS HOW THE BONUS-LINE TABLE TURNED UP

`$25DCB0 move.w #$7,D1 / jsr $25FF38` is state 1's one call, so 7 is a REQUEST ID. The
longwords immediately after `$25FF38` are what it selects from:

    $25FF52  $00000000 $0025FFA8 $00260056 $0026010E $002601F4
             $002602B6 $00260348 $0026035A $0026037C

Nine entries, entry 0 null, and `python tools/rosetta.py codexref 25FF52` finds **exactly one
reader**, `$25FF92 lea ($25FF52,PC)`. Those eight non-null targets are the bonus-line
routines W270 counted as "eight bonus-line routines per side", now located rather than
inferred. None is ported and none is called from this wave; recording where they are is the
deliverable.

## `$25D9E6` IS THE EXACT INVERSE OF STATE 2's LOOKUP

    cmpi.w #$FF,D6 / bne $25DA10           $FF means "nothing saved"
      D5 == 0 -> (D6,D7) = (0, 0)          side 0's defaults
      D5 != 0 -> (D6,D7) = (1, 2)          side 1's
      ...$25DA56 pops and `ori #$1,SR`     CARRY SET
    $25DA10  moveq #$1,D0 / lea ($25D986,PC),A0 / ... / dbra D0
    $25DA2E  moveq #$2,D0 / lea ($25D98A,PC),A0 / ... / dbra D0
      ...$25DA4C pops and `andi #$FFFE,SR` CARRY CLEAR

W276 established that the cursors are indices and `$2600D8` posts the table VALUES. This
reads the values back and returns the indices, so the design is now visible from both
directions and the test drives the round trip end to end: run state 2, wipe the cursors,
restore them, and they come back unchanged.

**THE TWO `dbra` COUNTS CONFIRM THE TABLE SIZES A THIRD TIME.** `moveq #$1,D0` with `dbra`
walks indices 1 then 0 -- two entries. `moveq #$2,D0` walks 2, 1, 0 -- three. That agrees
with `$25DD42 andi.b #$1,($e,A5)` and with the window's far end at `$25D990`, from three
independent directions, and the assertion says so in one place.

Three details a paraphrase loses, all asserted:

* **the search is DOWNWARD**, so a value present twice would resolve to the LOWER index.
  Neither table has a duplicate, but the direction is the ROM's and is kept.
* **D7 is ignored on the `$FF` arm.** Both defaults are written unconditionally, so a
  garbage D7 cannot leak through.
* **a value in NEITHER table is left RAW.** The `dbra` falls through without storing, so
  the posted value ends up in the cursor and state 2's own bound is what catches it. That
  is exactly why W276 made that bound a counted note instead of a clamp -- the two
  decisions fit together and neither reads right alone.

## `$25DA60` CLOSES THE LOOP

    move.w $813084,D6 / move.w $813088,D7      side 0
    tst.b ($7,A5) / beq
    move.w $813086,D6 / move.w $81308A,D7      side 1
    moveq #0,D5 / move.b ($7,A5),D5 / bsr $25D9E6
    move.b D6,($e,A5) / move.b D7,($f,A5)

**The pair it reads is the pair `$2600D8` wrote** -- `TALLY.postD0`/`postD1` are the same
four words. So the screen restores its cursors from what the tally posted last time, which
is the round trip. Ported with a test that runs state 2 and then restores.

`move.b D6,($e,A5)` stores only the LOW BYTE of a word `$25D9E6` may have left raw, so a
value above `$FF` truncates HERE and not there. Asserted with `$1234` -> `$34`.

## What is left of state 1

Three of six. Still unported: `$25DFF6` (another `$28D53C` gate), `$25DEAE` (`($f,A5)` from
the `($c,A5) == 2` arm) and `$25E0EA` (`lea ($25E006,PC),A0 / bra $25E200`, a table-driven
jump). The state-1 note in `tallyScreen25DBB4` still names all six; it is now three names
too long and the next wave should trim it as it lands them.

State 1 also installs a palette from `$225978`, which needs a window -- run
`node tools/export-web.mjs --extent 0x225978` first.

## Order for the next wave

1. **`$25DFF6`, `$25DEAE`, `$25E0EA`** -- the last three of state 1, then wire state 1 up
   and delete its note. `$25E0EA`'s table at `$25E006` will need its own extent measured.
2. **The eight bonus lines at `$25FF52`** -- `$25FFA8`, `$260056`, `$26010E`, `$2601F4`,
   `$2602B6`, `$260348`, `$26035A`, `$26037C`, plus `$25FF92`, the one routine that reads
   the table. This is the score tally's actual arithmetic and it is the largest single
   thing left in the subsystem.
3. **The menu cursor `$25DD0C`**, whose D0 comes from `($8,A4)` -- `$23D186` for side 0 and
   `$23D18E` for side 1 -- so that input read has to land first.
4. Then the four other announcement-poster caller regions, D11's remainder and stage 5.
