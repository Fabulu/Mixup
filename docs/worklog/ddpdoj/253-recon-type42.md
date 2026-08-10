# W253: type $42, the Stage-4 boss's children -- RECON AND BOUND

Status: SPEC COMPLETE, implementation not started. No code written, deliberately.

Type `$42` is the last thing standing between F5 and the Stage-4 boss's second phase
running end to end. This wave measured it instead of starting it, and the measurement
changed the size of the job by a large factor, which is the reason to write it down
before writing any of it.

## Starting state

W252 committed at `f281abc`, suite 1725/1725. Seven waves this session (W246..W252)
translated F5 and every one of its descendants except this.

## Where it sits

    type $42   init    $2A394A   a two-instruction runLen stub: `move.w #$4,$4(a5) / rts`
               body    $2A3952   the real init, $2A3952..$2A3A69
               proto   $2A3A6A   FIVE long-form entries, $8C bytes
               handler $2A3AF6   roughly 2 KB

The port's BODY registry keys type `$41` at `$2A37E4`, which is its own stub plus 8, so
type `$42`'s BODY key is `$2A3952` by the same rule.

## THE PROTOTYPE IS PINNED EXACTLY, WITH NO GAP

Walking `$2A3A6A` the way `$2637A2` does, with the stub's runLen of 4 and therefore five
iterations, gives five LONG-form entries (flags `$8000`) of 28 bytes each:

    $2A3A6A  $2A3A86  $2A3AA2  $2A3ABE  $2A3ADA   -> ends $2A3AF6

and `$2A3AF6` is the handler's first instruction. Zero bytes between them. So the window
is `$2A3A6A + $8C` and both ends are pinned by code rather than by a run length.

## THE BOUND THAT MATTERS: F5 ONLY NEEDS ONE ROLE

`$3C(a6)` is the handler's role selector and it branches on `$FF`, 0, 1, 2, 3, and
`$70`/`$71`. The body sets it from `$21(a5)` (`$2A3974 move.b $21(a5),$3c(a6)`), which is
a field the SPAWNER writes into the deferred-queue entry.

Over the whole 6 MB image there are exactly TWO spawners of type `$42`:

    $2A30DC   A1 9, ported in W249     -- writes `$21(a0) = #$FF` as a CONSTANT
    $2A31BA   A1 11 ($2A317C/$2A31A0)  -- writes `$21(a0)` from its own LIST

A1 11's list is at `$2A31EC` (single entry table at `$2A31E8`, no index): speed `$0E`,
count 10, then ten (angle, role) PAIRS --

    ($00,$00) ($F0,$01) ($E0,$02) ($D0,$03) ($80,$04)
    ($70,$05) ($60,$06) ($50,$07) ($E8,$70) ($68,$71)

-- so roles 0..7 and `$70`/`$71` all come from A1 11 and NONE of them from A1 9. And A1 11
is started at `$2A128A moveq #$B,d0 / jsr $259A18`, which is inside A4 id6 (`$2A11D4`), a
script this port has not translated.

**So for F5's phase to run end to end, only the role-`$FF` path of the handler is
needed.** The roles 0..7 and `$70`/`$71` belong to A4 id6's phase, which is a separate and
later frontier, and until A4 id6 is ported they are honestly unreachable -- an
`unreached()` by role is the correct treatment, not a stub.

That is what changes the size of this job. The handler read as ~2 KB of multi-role
behaviour; the reachable slice today is the `$FF` arm plus whatever it shares.

## What the body does (`$2A3952..$2A3A69`), instruction by instruction

    lea $2A3A6A / jsr $2637A2          the five-entry prototype
    move.l $16(a5),$2(a6)              position, from the spawner
    move.b #$0,$1a(a6)
    clr.b $16(a5) / move.b #$0,$17(a5)
    move.b $21(a5),$3c(a6)             THE ROLE
    ext.w of $1a(a5) -> $26(a6), and copied to $38(a6) and $48(a6)
    $6c(a6) = 0, and 1 if $26(a6) is negative      the direction flag
    d0 = $1b(a5) & $ff                             the angle
    if d0 is one of $10 $65 $BB $F0 $45 $9B -> move.b #$1,$8d(a6)
    asl.w #4,d0 -> $28(a6)                         the angle, fixed-point
    move.b #$0,$19(a5)
    move.b $20(a5),$1a(a5)
    d1 = asr.w #4 of $28(a6) / jsr $241D34         `MoveTables.shotVector`, ALREADY PORTED
    asl.w #3,d2 / asl.w #3,d3
    $20(a5) = $2000
    movea.l $1c(a5),a0                             the PARENT pointer A1 9 stored
    d2 += $22(a0) / d2 -= $20(a5) / d3 += $24(a0)  positioned relative to the PARENT
    $2(a6) = d2 / $4(a6) = d3
    $22(a5) = $404, $3a(a5) = 0, $3b(a5) = $18, $3c(a5) = 0, $3e(a5) = 0
    if $3c(a6) is $70 or $71 -> skip
    (a6) = $8000                                   otherwise mark it

The six angles that set `$8D(a6)` are worth noting: `$10 $65 $BB $F0 $45 $9B` are exactly
six of the nine angles in A1 9's two nine-shot formations (`$2A3152` and `$2A315D`), so
that flag marks the cluster members and not the ring ones.

`$241D34` is `MoveTables.shotVector`, already in `vectors.js` -- the twentieth positive
availability check.

## Landmarks already found inside the handler

    $2A3AF6   cmpi.w #$2,$8130F4 and $3C(a6) == $FF   the role-$FF entry gate
    $2A3B30   jsr $289004                             the fire-gen, ported
    $2A3B48   jmp $263762                             freeEnemy, ported
    $2A3B5E   jsr $286096                             the shared DAMAGE, ported
    $2A3D5A   movea.l $1c(a5),a0 / addq.w #$1,$19e(a0) THE PARENT COUNTER A1 9 WAITS ON
    $2A3E16   another $8130F4 == 2 gate, on $6c(a6)
    $2A4000   a $8E(a6)/$8F(a6) cadence writing $8130E4/$8130E5

`$8130E4` and `$8130E5` are globals nothing else in the port touches; they are written
under a `$3C(a6)` role test, so whether the `$FF` path reaches them is the first thing to
settle when writing it.

## Why this is a spec and not code

Same reason W244 gave, and W244's spec then made W246 a single clean pass. This is the
eighth wave of one session; the previous seven each had at least one prediction corrected
by its own test (three of them the old-zero borrow, one a masked-off half, one a matcher
that collapsed two ROM lists into one). Type `$42` is the largest single routine left and
its correctness is what makes A1 9's rendezvous close. It should be written against a
fresh budget with this bound in hand rather than started at the end of a long one.

## Order for the next wave

1. The window `$2A3A6A + $8C`, then the body `$2A3952` into `initbody.js`'s BODY registry
   keyed at `$2A3952`, with a test that drives it from a real A1 9 queue entry.
2. Walk the handler from `$2A3AF6` with `$3C(a6) = $FF` ONLY, and `unreached()` by role on
   0..7 and `$70`/`$71` with the A1 11 / A4 id6 reason spelled out.
3. Then close the loop end to end: F5 arm 6 starts A1 9, A1 9 spawns ten children, the
   children die into `$19E(a6)`, A1 9 retires, and F5's arm 7 hands the cycle back to
   bit 2. That is the first time the Stage-4 boss's second phase runs as a phase.
