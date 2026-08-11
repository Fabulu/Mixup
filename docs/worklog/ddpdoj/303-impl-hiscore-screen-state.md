# W303: the high-score screen's state routine, and `$25B492` closes at eleven of eleven

Status: DONE. Suite 2133/2133 (2117 + 16), no skips. Sweep 0 missing on both.

W302 ported nine of `$25B492`'s eleven `bsr.w`s. This wave adds the other two, the state
routine above them, and the loader that state routine needs.

## Starting state

W302 committed and pushed at `667d035`, suite 2117/2117.

## `$246710` IS `$24652A` PLUS ONE CONSTANT

The family check, and the strongest form of it yet: the two routines open with the SAME four
instructions to the byte -- `movem.l D1-D7/A0-A4,-(A7)`, `move.w #$0,D6`, `lea $810346,A1`,
`moveq #$2,D7` -- and then run the same three-slot player scan at stride `$30`, the same
twenty-slot pool at `$80FA86` stride `$70`, the same `($2C)` link, the same `$FFFF0000`
lifetime seed, the same free-and-bail through `$246800` and the same `$FFFFFFFF` on failure.

**The whole difference in the pool lifecycle is one word: `$246762` writes `#$1` into
`($1E,node)` where `$246576` writes `#$0`.** (They also swap the order of the `($2,node)` and
`($1E,node)` stores, which changes nothing.) So `chainLoader24652A` became a shared body over a
two-entry spec table and `chainLoader246710` is the second entry.

The test for that is the one worth having: build the same script through both entry points into
two fresh RAMs and **byte-compare the whole of main RAM**, asserting that every differing byte
falls at offset `$1E` or `$1F` within some pool node. Eight nodes, eight differing bytes. A
claim of "one constant apart" is cheap to make and that is what makes it worth proving.

`$246710`'s per-node CONTENT seeding is larger -- four script words per node through the
`$24627A` code-pointer table and the `$246B38` anim-data table -- but that is the SAME
presentation tier `$24652A`'s existing comment already declares out of scope for the anim
driver's sake. So it is counted with a note naming both tables, not invented.
`PRESENTATION_DEVIATION[0x28d6fc]` is unchanged.

## THE FRAME, AND A CORRECTION I MADE TO MYSELF MID-WAVE

`$25B4D6` is four requests built entirely from immediates, through `$23DECE` rather than the
`$23DFB4` the nine columns use. I wrote in the source that the two stubs are "different
buckets", because two stub addresses reading as two draw layers is the obvious inference. Then
the test measured it: **both resolve to the SAME bucket.**

That flips into a better fact than the one I assumed. With all eleven `bsr`s feeding one
bucket, **the `bsr` order IS the draw order** -- which is why `$25B492` calls the frame and the
row labels before any data column. They have to be underneath. `SCREEN_COLUMNS` is in `bsr`
order for that reason and the test asserts the first two entries are the frame and the labels.

The third frame element is gated: `$25B50A tst.w $80390C / beq $25B52C`. `$80390C` is the
global phase word `bee.js` calls `collisionPhase` and `bomb.js` calls `phase`, so **the screen
has a blinking element**, and a port that dropped the gate renders it permanently lit. Phase 0
draws three parts, phase 1 draws four, and `$333E54` is the one that comes and goes.

## THREE BARE `rts` BYTES, AND A LIVE CALL INTO ONE OF THEM

`$25B4EC bsr $25B54A` lands on an immediate `rts`. There are three `4E75`s in a row at
`$25B546`, `$25B548` and `$25B54A`: the first is the frame routine's own exit and the other two
are spares. So the call is live and the callee does nothing -- **a stubbed-out feature, not a
missing routine**, which is why it is not a counted gap. Asserted straight out of the image,
including that the `bsr`'s displacement really does land on `$25B54A`.

## THE ROW LABELS, AND WHY THE TABLE IS EXACTLY FIVE

`$25B54C move.l ($18,PC,D6.w),D2` with `addq.w #4,D6`. The extension word sits at `$25B560`, so
the base is `$25B560 + $18 = $25B578` -- computed, after W302 got a PC-relative base wrong by
two by hand and had to let the disassembler do it. Five longs, all distinct, and `$25B58C`
being the next routine is what pins the count. The tenth column: no RAM read at all, yet it
still varies per row.

## THE STATE ROUTINE, AND TWO EXITS THAT DIFFER ONLY IN THE CARRY

`$25B412`, one caller (`$25A938`), three states on `$812E5C`:

    state 0   chainCheck($812E60); when the chain has finished, free it and go to state 1
    state 1   subq.w #1,$812E5E; at zero, load $25BAAA through $246710, keep the handle,
              and go to state 2
    state 2   chainCheck again; when THAT chain finishes, free it and take the other exit

Each `cmpi` **falls through** into the next state's test rather than branching away, so one
call can advance twice -- state 0 can free its chain, set state 1, and have state 1's timer
tick in the same frame. A port that returned after each state would spend an extra frame per
step. Asserted.

The two exits are both idioms rather than flags:

    25b4c2  ori #$1,SR       after the draw     -> carry SET   = still running
    25b4d2  move.w D0,D0     after $28C170      -> carry CLEAR = finished

`move.w D0,D0` is there to CLEAR the carry, exactly as `ori` is there to set it. It reads as a
no-op, and a port that treated it as dead code would return whatever carry the previous call
left -- the caller would never see the screen end. That is the third time this session that an
exit's carry has been the whole answer a routine returns (`$287C3E`, `$287D96`, and now this),
so it is worth stating as a habit: **in this cartridge, check how a routine leaves the carry
before deciding it returns nothing.**

`$25B48E bra $25B4C8` is the only path that skips the eleven `bsr`s, so the screen draws on
every frame except the one it ends on. `$28C170` on that frame is counted, and it is a cue
`tally.js` already names as `cueA`.

## Changes

* `src/stageend.js`: `chainLoader24652A` becomes a shared body over `CHAIN_LOADERS`;
  `chainLoader246710` added.
* `src/hiscorescreen.js`: `drawFrame25B4D6`, `drawRowLabels25B54C`, `hiscoreScreen25B412`,
  `SCREEN_STATE`, and `SCREEN_COLUMNS` grows to eleven.
* `tools/export-tables.py`: two windows, `$25B578 + $14` and `$25BAAA + $42`. 400 windows.
* `tests/w303hiscorestate.test.js`, 16 assertions. Three W302 assertions updated for the
  eleven-column reality, including the exact draw-count sum.

## Order for the next wave

1. **`$28F6F6..$28F7D4`**, the result screen. It reads eight of the nine columns, and its head
   `$28F32x` is the SECOND caller of `$287BD2`/`$287C08` -- so it is the other place a score
   enters the table, and it is where the name entry most likely lives. `$8130CC`'s two bits are
   read at `$28F350` and copied to `($5,A5)`, which is the thread to pull.
2. **`$280252`** still blocked on measuring A0 at `$28029A` (W288) -- a register feeding
   arithmetic, per W294's rule, so it needs the capture.
3. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
4. The four other announcement-poster caller regions, then D11's remainder -- which `$246710`
   has now brushed against from a second direction.
5. Stage 5 and both loops.
