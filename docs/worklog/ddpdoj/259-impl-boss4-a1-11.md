# W259: Stage-4 boss A1 11, the spawner that creates the aimers

Status: DONE. Suite 1778/1778 (1772 + 6), sweep 0 missing, both run before the commit.

`$2A317C` (INIT) / `$2A31A0` (STEP), A1 table entry 11, which A4 id6's state 0 starts once
A3 3 finishes. It is A1 9's sibling and it is the reason type `$42` has roles at all.

## Starting state

W258 committed at `490a28d`, suite 1772/1772.

## THE ONLY PRODUCER OF ROLES 0..7 AND $70/$71

W257 translated an aimer-and-fan design that nothing could reach: two invisible children
publish a heading into `$8130E4`/`$8130E5` and eight visible ones fire a wide fan along
it. A1 11's list is where those ten children come from, and nothing else in the 6 MB image
produces them.

Its list carries TWO bytes per child where A1 9's carries one:

    $2A31EC   direction $0E, count 10, then (angle, role) PAIRS --
              ($00,$00) ($F0,$01) ($E0,$02) ($D0,$03) ($80,$04)
              ($70,$05) ($60,$06) ($50,$07) ($E8,$70) ($68,$71)

`$2A31DC move.b (a3)+,$21(a0)` is the instruction that matters: A1 9 writes `$FF` there as
a constant, and this writes a different value per child. The test follows all ten through
the deferred queue AND through `processDeferred` into their sub-records' `$3C(A6)`, which
is the field the handler branches on, because the role only does anything after that copy.

## Three differences from A1 9, and the third is the point

1. ONE list, not eight -- `$2A31AA lea / movea.l (a3),a3` with no index, where A1 9 picks
   with `andi.w #$7`.
2. It RETIRES ITSELF the moment the volley is out (`$2A31E4 clr.w (a4)`), so there is no
   rendezvous and no `$19E` counting. A4 id6's state 0 does the waiting instead.
3. The per-child role, above.

## A FIFTH VESTIGIAL CONSTRUCT

`$2A3A50` in type `$42`'s body skips `move.w #$8000,(a6)` for roles `$70` and `$71` -- and
it changes nothing. `loadSubProto` has already written `$8000` at `(a6)` from the
prototype's own first flags word before the body runs, so aimer and non-aimer end the
frame identical in that field. My test asserted a difference, found none, and now asserts
the sameness plus the prototype word that causes it, so nobody turns the skip into a real
difference later.

That is five in this boss now: A1 8's three dead register loads, A1 9's clobbered side
selector, A1 10's and A1 11's unread INIT words, type `$42`'s three absent emitters, and
this.

## The window

New: `$2A31E8 + $1A`, pinned at both ends -- the single selector entry points at
`$2A31E8 + 4`, and the list stops at `$2A3202`.

`$2A3202` is deliberately NOT exported. It is another table of the same shape (one entry
at `$2A3206`, direction `$F6`, three pairs, ending exactly at A1 10's INIT) with **no
`lea` reference anywhere in the boss's bank**. Exporting data nothing reads would be
guessing about a reader; the test asserts it throws, so the day something does read it the
port says so by address.

## What is left of the Stage-4 boss

    A1 13  $2A34CA / $2A34EE   the pair A4 id6's $6(a4) alternates, each handed a
    A1 14  $2A36EA / $2A3714   parameter through the slot $259A18 returns
    MAIN8  $29FA8A / $29FAAE   A0 entry 8

## Order for the next wave

1. A1 13 and A1 14. They are the last two of A4 id6's descendants and A1 13 takes two
   parameters (`$10` and `$12` of its slot) where A1 14 takes one, so the pair is not a
   family and should be sized separately.
2. MAIN8, and then the third phase runs end to end the way the second does.
