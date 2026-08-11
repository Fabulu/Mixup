# W301: the factory high-score table, and the data that checks W300

Status: DONE. Suite 2091/2091 (2079 + 12), no skips. Sweep 0 missing on both.

`$28841E` is nine `lea` pairs and nine `dbra` copies out of one contiguous ROM run. Small.
The reason it earned a wave is that its DATA is evidence for three things W300 could only
argue from instruction senses.

## Starting state

W300 committed and pushed at `290d83c`, suite 2079/2079.

## HOW IT WAS FOUND, WHICH IS THE REUSABLE PART

W300's worklog named "the name entry" as item 1 and pointed at `($C,A4)`. The obvious search
was for who reads that pointer field, and the answer was **nobody**: `$81B42C` and `$81B43C`
have zero references in the build. Following `$8130CC` instead led to `$28F320`, a second
caller of the same P1/P2 pair, and from there to `$28CB74` -- which looked like the name-entry
screen and **is already in the port**, as BGM cue 10 in `sound.js`. It is one of a family of
tiny `moveq #N,D0 / move.w #$FF,D7 / jsr $28CAFC` wrappers. So `$28F360 jsr $28CB74` starts the
entry music; it is not the entry.

Two hours of that was avoidable. The search that actually worked was one scan: **every
absolute long in the image pointing anywhere into `$803824..$8038BA`.** That returns four
caller families at once, and each names itself by which columns it touches:

    $25B58E..$25B946   all nine columns   the DISPLAY
    $28841E..$2884CC   all nine columns   the INSTALLER  <- this wave
    $28F6F6..$28F7D4   eight of nine      the result/entry screen
    $23B822..$23BD8C   62 refs to $8038BA one past the table, a different array entirely

Worth generalising: **when a subsystem is a set of parallel arrays, scan for references into
the whole address RANGE rather than chasing one pointer field.** The families fall out sorted,
and the one that touches every column is the one that understands the layout.

## THE DEFAULTS CONFIRM W300'S COLUMN ASSIGNMENT WITH DATA

W300 derived which of the six word arrays receives which of `$287D7A`'s six source words from
the ROM's register order -- A1, A2, A3, A0, A5, A6, with **A0 fourth** -- and flagged that a
port tidying those into address order would silently pair the wrong array with the wrong word.
The factory defaults settle it independently, because a wrong assignment puts recognisable
values in the wrong column:

    $803874  0 0 0 0 0          the LOOP     a factory table has cleared no loop
    $80387E  3 2 2 1 1          the STAGE    DESCENDING in step with the scores
    $803888  0 6 2 2 2          the SHIP     6 is in P2's rebased 4..7 range
    $803892  6 4 6 4 4          the STYLE
    $80389C  $0719 x4, $0720    the CHAIN    BCD 719 and 720, unmistakable
    $8038A6  4 4 2 0 6          the DIGITS   and a digit state is capped at 9 by $28725C

Had A0 been paired first, the loop would land in the column holding BCD `$0719` and the chain
in the all-zero one. Three independent checks in one table: the BCD chain, the stage falling in
step with the score, and the digit states all inside their cap.

The ship column also contains a **6**, which is in the 4..7 range only reachable through
W300's `addq.w #4,D0` rebase. That finding now has shipped data behind it and not just the
eight-byte gap between `$2881E2` and `$2881EA`.

## THE 12-BYTE ENTRY IS THREE INITIALS, ONE LONG PER CHARACTER

W300 could say only that the slot was "the initials/name slot", inferred from `$287C3E`
stamping a tag into it. Fifteen longs of defaults settle it:

    $38 $48 $0C    $28 $58 $48    $20 $48 $38    $20 $30 $28    $28 $30 $4C

Every value small and every one a multiple of four: **three characters per name, one longword
each, each a character index times four.** So `$287C7E move.l D6,(A4)` writes `$FF`/`$FE` into
the FIRST character, and `$FF`/`$FE` are neither multiples of four nor within the default range
-- an out-of-band "not entered yet" marker that also records which side owes the entry. That is
why the insert can leave the other eight bytes holding whatever the shift dragged down.

## AND IT SOURCES W299'S MEASUREMENT A SECOND TIME

The five default score longs are `$01182223 $00846001 $00816579 $00775305 $00699653` -- byte
for byte the five W299 read out of `rip/web/seed.bin` to settle the ordering. **The shipped
seed holds the FACTORY table, not a played one.** W299's conclusion stands and now has two
independent sources: a RAM snapshot and cartridge data.

That is also why this needs no boot catch-up. W92's object stream and W93's text banks are
replayed because the seed cannot carry their results; the seed carries this one exactly. The
test asserts installing over the seed changes nothing, so a future wave adding a catch-up call
has to argue against a failing test rather than a comment. `$28841E` runs once at cold boot,
at `$23BF74` in the reset routine `palette.js` maps as `$23BF20..$23C010`, four calls before
the five palette installs and the `bra` into the main loop.

One more small playable fact falls out: `$288432 move.l $803824,$81B448` sits between the score
copy and the overflow copy, so the HUD's HI score is published from the table's index 0. The
two cannot disagree at boot, and the port now does that in the same place.

## Changes

* `src/hiscore.js`: `HISCORE_DEFAULTS` and `hiscoreDefaults28841E`.
* `tools/export-tables.py`: one window, `$287DF8 + $96`, covering all nine source blocks. They
  are contiguous even though their destinations are not in address order, which is asserted
  rather than assumed -- each block starts where the previous ended, and the run ends at
  `$287E8E`.
* `tests/w301hiscoredefaults.test.js`, 12 assertions.

## Order for the next wave

1. **`$25B58E..$25B946`, the high-score DISPLAY.** It touches all nine columns, so it is the
   routine that reads back everything the last three waves wrote, and it is what the player
   actually sees. The obvious next thing.
2. `$28F6F6..$28F7D4`, the result screen that reads eight of the nine, and the `$28F32x` head
   that is the second caller of `$287BD2`/`$287C08`.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
5. The four other announcement-poster caller regions, then D11's remainder.
6. Stage 5 and both loops.
