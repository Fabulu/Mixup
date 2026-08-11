# W319: type $8E, and the Hibachi trap found while looking at $B0

Status: DONE. Suite 2315/2315, no skips. Sweep 0 missing on both.
`dojcoverage.py` reports **80/256 enemy types ported, 46 unknown**, both OK lines.

Stage 5's work list goes from thirteen types to **twelve, over 37 of its 770 records**.

## Starting state

W318 committed and pushed at `67b423c`, suite 2315/2315. W318 was recon: it read `$8E` end to end
and left two things to settle before writing any of it. Both settled here.

## `$2782CC` RESOLVED: IT IS THE ZOOM FAMILY'S SUB-TABLE

The draw is `move.w ($1E,A6),D0 / add.w D0,D0 x2 / lea ($2782CC,PC),A0 / movea.l (A0,D0.w),A0 /
jsr (A0)` with `D6 = $F800F800`. `$2782CC` is **entry 12 of the 18-entry primary emitter table
`$27829C`**, and entries 12..17 are exactly the five zoom members `spritequeue.js` documents plus
the duplicate at 12/13:

    [12] $23D9E2   [13] $23D9E2   [14] $23DA5C   [15] $23DAD6   [16] $23DB50   [17] $23DBCA

So `($1E,A6)` picks a ZOOM bucket and the port's `enqueueZoomedThroughStub` is the right wrapper --
it runs the entry through `resolveZoomStub`, whose whole job is that a routine merely starting with
the same four opcodes cannot pass as a family member. **This is the first type in the port whose
draw goes through the zoom family rather than a fixed stub.**

Nothing in the ROM bounds `($1E,A6)`. At index 6 the `movea.l` reads `$2782E4`, the first of the
twelve register-convention entries, and would dispatch it as if it were a zoom member. The port
throws, naming the six.

## `$278314` BOUNDED BY A SECOND RUN OF ITS OWN SHAPE

Six words -- `0000 0000 0004 0008 000C 0010` -- and `$278320` begins another run starting with the
same four values. That is what bounds it; the death arm's index is the same `($1E,A6)` the draw uses,
so 0..5.

## AND A DEFECT W316 SHIPPED, FOUND BY WRITING THE SECOND ONE

`handler45` called `aim64AtTarget(ctx.tables, ...)`. In the live game `ctx.tables` is the
**MoveTables**; `aim64AtTarget` wants the **AimTables**, which this file memoises per ROM as
`aimTables(rom)` -- the convention every other one of its nine aim sites uses.

W316's test passed because its fixture put an `AimTables` in `ctx.tables`. So the test agreed with
the port and both were wrong about the live shape. Both of `handler45`'s aim sites are corrected
here.

**The lesson is about the fixture, not the call**: a hand-built `ctx` that happens to satisfy the
code under test proves the code consistent with itself. Where a real `ctx` is available -- and
`main.js` builds one -- the fixture should be that shape.

The init body needed the same care and got the memo-map treatment types `$16`, `$85`/`$86` and `$8D`
already use in `initbody.js`.

## ONE COUNTED GAP, AND IT IS ONE THE PORT ALREADY COUNTS

`$27F8EE` with `D0 = 8` and `D2 = ($1E,A6)` -- the death routine `handlers.js` counts at three
sites, one of them **type `$89`'s with these exact registers**. Same deferral, not a new one, and the
note says so.

Also worth recording: `$27653C` is `tst.L $8130D2`, a LONGWORD over the freeze word and `$8130D4`
together -- the same shape as W308's `tst.w $81E0D8`, and a `.w` reading would ignore `$8130D4`.

## THE FIVE-STAGE PARAMETER TABLE

`$276484 move.w $813094,D0 / lea ($2764A0,PC),A0 / adda.w D0,A0` -- `$813094` is stage*2, so five
two-byte rows: `10 0F | 00 1E | 00 1E | 00 1E | 11 0E`. The three reads are `(A0)` then `(A0)+`
twice, so `($1D,A6)` and `($18,A5)` BOTH take the row's first byte and only `($19,A5)` takes the
second. Stage 5's row is `$11,$0E`.

## THE HIBACHI TRAP, FOUND WHILE LOOKING AT WHAT COMES NEXT

The owner raised this and it checks out, with addresses. Type `$B0` -- one record, and W317 called it
"standalone" -- is **not a little enemy**:

    2a4606  jsr $2A6B94        UNPORTED, and it is the real boss machinery
    2a460c  jsr $25962E        ported
    2a4612  bcc $2A4622        the carry decides
    2a4614  jsr $242952        THE STAGE ADVANCE
    2a461a  jmp $263762        freeEnemy

`stageend.js` has documented `$2A4614` since long before stage 5 started, as **one of the five
`$242952` callers that are the five bosses** (`$292922` stage 1, then `$2973A8`, `$29BE36`,
`$29EF14`, `$2A4614`). Nobody had joined that to type `$B0`, because the two facts lived in
different files: the boss list in `stageend.js`, the type census in `w314stage5scope.test.js`.

So type `$B0` is a **completion GATE of about 28 bytes**, and `$2A6B94` is what owns the boss. And
`$2A6B94` opens `tst.w ($106,A6) / tst.b ($10E,A6) / bne $2A6F12` -- record offsets past 256 bytes
and a branch `$370` forward, which is a boss-sized record and a large routine, not a helper.

**The trap is exact**: port `$B0`'s 28 bytes, watch the missing-handler census reach zero, watch
`$242952` fire and the stage number advance -- and no boss ever existed. Every measurement this
project currently has would report success. `HIBACHI CLOSURE RULE` is now in the handoff to stop it.

## Changes

* `src/handlers.js`: `handler8E`, `draw8E`, `death8E`, `T8E`, the registration, and the two
  `handler45` aim-table corrections.
* `src/initbody.js`: the `$27640C` body and its memoised AimTables.
* `tools/export-tables.py`: three windows -- `$2764A0 + $32`, `$2782CC + $18`, `$278314 + $0C`, each
  bounded on both sides. 411 windows.
* `tests/w314stage5scope.test.js`: twelve/37, `$8E` removed from the list, and `$1B` asserted as the
  next clean target.
* Four count pins moved (handler list, adapter 67 -> 68, init bodies 72 -> 73, `enemy_types`
  79/47 -> 80/46).

## Order for the next wave

1. **`$1B`** (5 records, ~1020B) then **`$81`** (3, ~1452B) -- the two whose every `jsr` target the
   port already implements and which spawn nothing.
2. Then `$1A`, then `$49`/`$4A`/`$4B`, then `$47`.
3. The dependency bundles: `$55` before `$46`, `$54` before `$48`, `$44` before `$43`, and `$4C`
   last because it alone wants four children. **So "twelve types left" understates it: those twelve
   expose seven more child types, at least nineteen handler types before anything found deeper.**
4. **`$B0` IS NOT AN ORDINARY ENEMY.** It is the head of boss reconnaissance. Read `HIBACHI CLOSURE
   RULE` in the handoff before touching it.
5. `$280252` still blocked on measuring A0 at `$28029A` (W288).
