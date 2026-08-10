# W247: Stage-4 boss A3 3..8, six scripts for the price of one

Status: DONE. Suite 1688/1688 (1682 + 6), run before the commit.

W246 left F5 arming eleven scripts that did not exist. This wave closed six of them,
and it closed them with one routine, because the ROM had already said they were one.

## Starting state

W246 committed at `e391d61`, suite 1682/1682.

## The check that did the work

The sixteenth time this session that asking "is this new thing a member of a family the
port already has?" came back positive, and the widest one yet. The A3 table
(`$2A1370`, installed by `$29EC82`) reads:

    A3 3  $2A14AA / $2A14B0        A3 6  $2A1534 / $2A153A
    A3 4  $2A14D8 / $2A14DE        A3 7  $2A1562 / $2A1568
    A3 5  $2A1506 / $2A150C        A3 8  $2A1590 / $2A1596

A uniform `$2E` stride between INITs and the STEP exactly `$6` past each. Six bodies of
identical length is not a coincidence to note in passing, it is the finding: they are
one routine with three parameters, and the bodies differ in an offset, a sign and a
limit and in nothing else.

D1 `$2A1462` and D2 `$2A1486`, which W224 already ported, are the SAME shape on a `$24`
stride. So this family is those two with a third pair of parameters, and the port went
from two hand-written copies to a parameter table.

    move.w #$1,$2(a4)              INIT, and it FALLS THROUGH
    subq.b #1,$2(a4) / bcc rts     the old-zero borrow
    move.b $3(a4),$2(a4)           reload
    addq.w/subq.w #$4,OFF(a6)
    cmpi.w #LIMIT,OFF(a6) / blt|bgt rts
    move.w #LIMIT,OFF(a6)
    bra $2A13C8                    `clr.w (a4) / rts` -- it retires itself

## They are ANIMATIONS, which is why this is visible work

The three offsets are cursors the port's own object code has been reading all along:

    $88(a6), $A8(a6)  -> `$29F356`, the two pods' frames, 0..$20   (objects 7 and 8)
    $106(a6)          -> `$29F002` / `$29F096`, 0..$3C             (objects 9 and 0)

so A3 5 and A3 7 OPEN the two pods, 6 and 8 close them, and 3 and 4 drive the body's
own cursor the way D0 already did. Every descriptor at every step of all three ramps
already resolved, so no window needed widening -- the test walks all of them rather
than asserting that once.

## Two things the transcription had to get right

1. **`move.w #$1` sets TWO bytes and they do different jobs.** The byte at `$2` is the
   counter and lands at ZERO, so the borrow fires on the arming frame. The byte at `$3`
   is the period and lands at ONE, so every reload costs one idle frame afterwards. A
   ramp of n steps takes **2n-1 frames, not n**, and I wrote the comment claiming
   "every frame" before the test corrected it: A3 3 took 29 frames and I had predicted
   15. The prediction was the useful part -- it is what turned a plausible reading into
   a measured one.
2. **The limit is PINNED, not compared for equality.** `cmpi.w / blt|bgt` is signed and
   the ramp can overshoot: a descending cursor at 2 goes to -2 and `move.w #$0` cleans
   it up. D1/D2's existing port tests `next === 0` instead, which is safe only because
   their own start values happen to divide by 4. The new family pins, and the test
   drives a deliberate non-multiple through both directions to prove it.

## What is still missing

F5 arms five A1 scripts and one MAIN that do not exist yet:

    A1 6  $2A2D70 / $2A2D8E        A1 9  $2A307A / $2A30A8
    A1 7  $2A2E8C / $2A2E9E        A1 10 $2A320E / $2A323E
    A1 8  $2A2F1E / $2A2F72        MAIN7 (A0 entry 7)

These are NOT on a uniform stride ($11E, $92, $15C, $194), so they are genuinely
different attacks rather than one routine again, and they should be sized individually.
A1 8 is the one arm 2 reaches first.

## Order for the next wave

1. A1 8 `$2A2F1E`/`$2A2F72`, which arm 2's bit 1 starts once the pod pair retires.
2. A1 9 `$2A307A`, the repeating shot arm 6 drives, including the `$6(A0)` side
   selector F5 writes into it.
3. A1 6, A1 7, A1 10, then MAIN7, at which point the second phase runs end to end.
