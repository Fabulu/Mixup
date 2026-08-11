# W297: `$2532B6` -- the last note inside the nine bonus lines

Status: DONE. Suite 2039/2039 (2034 + 5), sweep 0 missing on both, run before the commit.

The nine bonus lines are now complete with no counted gap of their own.

## Starting state

W296 committed and pushed at `9418689`, suite 2034/2034. Its handoff named the high-score
insert as the next item; that is a five-routine subsystem over three parallel tables whose
failure mode is a silently mis-ordered table, so this wave finished the lines instead and left
the insert for a fresh start. `$287D96`'s search and `$287CEE`'s shift-insert are read and
recorded below for it.

## `setPanel2603B0` HAD BEEN COUNTING A PATH THE PORT ALREADY OWNED

The note said `$2532B6` is "a `$240E1A` plus four `$240DC2` calls, i.e. the DEFERRED text
path". **Both printers have been ported since W116.** The only thing actually missing was the
arithmetic deciding how many of each row to draw, which is the interesting part:

    253310  D0 = 8, D2 = 2, D3 = 0, D5 = 2 / jsr $240E1A      the header
    253322  add.w D7,D1
    253324  tst.w D7 / bmi / add.w D7,D7        <- D7 DOUBLES IF NON-NEGATIVE
    25332a  D6 = 5 / D5 = ($25,A6) / D6 -= D5
    253336  swap D5 / D5.b = ($24,A6)           D5 = (($25,A6) << 16) | ($24,A6)
      LOOP A  $02CC000A, and `subi.l #$10001,D5` decrements BOTH HALVES while
              `tst.w D5` tests only the low one
      LOOP B  $02C0000A, dbra on what is LEFT of the high half
      LOOP C  $02C6000A, dbra on D6
    253384  $02D2000A                            the closer

**ONE BAR IN THREE SEGMENTS, AND THEY SUM TO SIX.** Measured across six threshold pairs and
six every time. So it is a progress indicator cut by two thresholds the player record
carries, not three independent lists -- a port that read the loops as unrelated would draw a
variable number of rows.

## THE SIX WAS A CORRECTION, AND THE NEIGHBOUR HAD ALREADY WRITTEN IT DOWN

The first draft of this port said the runs sum to FIVE, from `moveq #$5,D6`. Measuring said
six. The reason is `dbra`, which runs its body n+1 times -- **exactly the fact W276 recorded
for `$2533F6`'s own `moveq #$5,D7`**: "moveq #$5,D7 with dbra is SIX passes".

So the immediate is 5 and the pass count is 6, both correct and meaning different things. The
constant keeps the ROM's value and the `<=` in loop C is where the extra pass comes from, with
the two numbers explained at the line.

## `subi.l #$10001,D5` IS THE TRICK

One instruction decrements both halves of the packed pair while `tst.w` tests only the low
one, so by the time loop B swaps back, its length is already `($25,A6) - ($24,A6)`. Modelling
the halves separately is fine; modelling them as one long and forgetting the high half would
give run B a length of `hi` instead. Asserted with `lo == hi == 4`, where the correct answer
for run B is zero.

## D7: DEAD IN ONE ROUTINE, LOAD-BEARING IN ITS SIBLING

W276 recorded that `move.w #$100,D7` before `$2533F6`'s `jsr $240E1A` is overwritten at
`$240E44` and therefore dead. **That is still true there.** Here the same immediate is the ROW
STEP: `$253322 add.w D7,D1` uses it after the call, and `$253324`'s `bmi` doubles it only for
P1 -- so P1 steps `+$200` and P2 `-$200`, matching the hardcoded steps in `$2533F6`/`$253448`
but derived rather than written.

Two routines, the same constant, one dead and one load-bearing. Asserted, because "this
immediate is dead" is exactly the kind of note that gets copied to a sibling.

## Recorded for the high-score insert

    $287D96   the SEARCH. Walks FIVE entries BACKWARDS from $803838 (longs) and $8038BA
              (words), comparing (overflow D5, score D7) as a TWO-PART KEY --
              `cmp.w D5,D2 / bhi / bcs / cmp.l D7,D1` then `dbcc`, so it is lexicographic
              and the loop continues while carry is CLEAR.
    $287CEE   the INSERT. `bsr $287D96`, then shifts entries down from the tail with
              `move.l (-$8,A2),-(A2)` and `move.w (-$4,A5),-(A5)`, writes D7 and D5 at the
              gap, and repeats the shift for a THIRD parallel array at $803874.

Three parallel arrays, five entries, a two-word key. Every RAM address is already named in
`hud.js`; the work is the comparison and the shift.

## Order for the next wave

1. **THE HIGH-SCORE INSERT**, with the above as its starting point. BCD and ordering, so its
   failure is silent -- worth a test that inserts a known sequence and asserts the whole
   table order rather than one entry.
2. **`$280252`** stays blocked on measuring A0 at `$28029A` (W288).
3. `$280BCE`'s 5/6/7 need `fillGeneralImpact280B3E` parameterised on the speed draw.
4. Then stage 5 and the loops.
