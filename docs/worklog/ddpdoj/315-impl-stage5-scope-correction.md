# W315: the family check comes back NEGATIVE, and W314's count was one too high

Status: DONE. Suite 2288/2288 (2287 + 2, one W314 test split), no skips. Sweep 0 missing on both.

Two findings, both corrections, and one of them was caught by the project's own tooling rather than
by me.

## Starting state

W314 committed and pushed at `c984aa1`, suite 2287/2287.

## THE FAMILY CHECK FAILS THIS TIME

W314 flagged `$48`/`$49`/`$4A`/`$4B` as "the signature of a family": consecutive types, consecutive
inits (`$271284`, `$27159E`, `$2719AE`, `$271C92`), two records each. W286, W287, W298 and W312 all
turned out that way, so the prediction was reasonable.

It is wrong. Diffing the handlers:

    $48 vs $4A   identical for SEVEN bytes, then a branch displacement and real divergence
    $49 vs $4B   identical for FORTY-SEVEN bytes, then `move.w #$250,D6` against `#$290,D6`
                 -- and after that they diverge structurally, not parametrically

`$49`/`$4B` looked most promising: 47 shared bytes and then a single differing immediate. But the
two routines are different lengths (`$15C` against `$160`) and the byte diff past that immediate is
187 bytes of noise, which is what misalignment looks like rather than what a parameter looks like.
The inits differ too -- run length 1 for `$48`/`$4A` and 0 for `$49`/`$4B`, with three different
`lea` displacements between the four.

So **stage 5's fifteen missing types are fifteen real routines**, not four table rows plus eleven.
Worth recording as plainly as the four positive results were: the shape that predicted a shared body
four times did not predict one here, and "consecutive types with consecutive inits" is a hypothesis
to test, not a conclusion.

## AND THE COVERAGE TOOL CAUGHT MY OTHER ERROR

I then ported what looked like the cheapest of the sixteen. Type `$00`'s init is the 8-byte stub with
run length 0 and its handler is six bytes -- `$26781C jmp $263762`, which is `freeEnemy` -- bounded
by the stub before it and by `$267824`, the type table that names it. Provably complete, so it could
go in without a scenario.

Registering it turned five tests red, and one of them was not a count pin:

    FAIL inventory: 1 source registry entries are not in ROM inventories
      enemy_types:handler:$26781C

`tools/dojcoverage.py` line 120: `NULL_HANDLERS = {0x26781C, 0x27E40A}`. Those two addresses are
why its report counts **130 of the 256 types as `null`** rather than `unknown`. Type `$00` is not an
unported type at all; it is one of the null ones, and the project has classified it that way since
whenever that tool was written.

**So W314's census was wrong**: it defined "unported" as absence from `enemyHandlerMap`, and absence
from that map is not the same as unported. The corrected numbers are **fifteen types over 65 of
stage 5's 770 records**, and the type-`$00` record is a real record that spawns with no sub-records
and frees itself on its first frame -- a no-op, not a gap.

The registration is reverted. The one thing worth keeping from it is the reading of `$26781C`, which
is now asserted in the test: the `jmp`, its target, the `nop` pad, and that `$267824` follows.

That is the second time in two waves that a check I ran to test my own conclusion changed it. W314's
control (every stage throws under a bare `Ram`) stopped a wrong defect report; this one stopped a
wrong port. Both are cheaper than the alternative.

## Changes

* `tests/w314stage5scope.test.js`: `NULL_HANDLERS` excluded from the census, the count corrected
  from sixteen/66 to fifteen/65, type `$00` removed from the address list, and a new test for why.
* No source change. The type `$00` registration was reverted with `git checkout`.

## Order for the next wave

1. **TYPE `$45` (21 records), then `$46` (13), then `$8E` (6)** -- 40 of stage 5's 65 missing
   records. Fifteen real routines, so this is per-type work; do not expect a shared body among
   `$48`/`$49`/`$4A`/`$4B`, which W315 checked and refuted.
2. Then the rest of the fifteen, stage 5's boss and end sequence, then **the loops** -- seven
   loop-2 rules are translated and all read `$813098`.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
4. `$23E45A`, the sixth zooming-family member (`movem.l D4/D7/A0`, table at `$23E78C`, extent from
   D3, needs the emit-stub window widened past `$23E0C2`). It gates `$28F7F4` and `$28FAF4`.
5. `$280BCE` is DONE at eighteen of twenty; indices 1 and 16 belong to `allocBee27F92A`.
6. The four other announcement-poster caller regions, then D11's anim tier.

**A note for whoever ports one of the fifteen:** `dojcoverage.py`'s inventory check is load-bearing.
It compares the live source registries against a ROM-derived inventory, and it will fail a handler
registration the ROM does not agree is a handler. Run it, not just the suite.
