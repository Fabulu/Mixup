# W229: the stale Stage-4 censuses

Status: COMPLETE

## Scope

Five census tests had been failing since the Stage-4 waves. They are the tests
that assert "everything the port registers has a cartridge witness" and
"the counts are what the waves say they are", so while they were red they could
not catch a regression in anything. Close all five.

## Starting state

- W228 is committed at `3b5351d`.
- The suite was 1611/1616. All five failures reproduce at `6d19202`, so they are
  debt from W218 through W224, not a regression from the docket work.

## Delivered

Nothing in `src/` changed. Each test kept its own claim and had its list, count
or extent brought up to date, with the addition named by the wave that caused it.

- `w62stageend.test.js:369`, every registered script must come out of an
  installed pointer table: it carried the stage-1, 2 and 3 boss tables and never
  got the Stage-4 ones, so it failed on `$2A017A` from W219. Added the Stage-4
  boss A0 `$29F498` (9 pairs), A3 `$2A1370` (11), A4 `$2A0088` (7), A1 `$2A1608`
  (15) and the A2 object list `$29EF54` (12 longwords and its `$FFFFFFFF`
  terminator). Every extent is measured off the image the same way the older ones
  are, and the negative case at the foot is untouched, so the widening cannot
  weaken the test.
- `handlers.test.js:113`: added `$27C81A` and `$27DB30` (W218), `$29EF0A` (the
  W219 Type-`$40` boss) and `$2A3840` (the W223 emitted type `$41`).
- `initbody.test.js:54`: the same four bodies, `$27C5BE`, `$27DA78`, `$29EC82`
  and `$2A37E4`, each asserted by name, and the length 65 -> 69.
- `integration.test.js:244`: `handlerMap()` 60 -> 64, with the four named.
- `w167coverage.test.js:65`: `enemy_types` 72/256 ported and 54 unknown ->
  76/256 and 50, which is the same four.

## Verification

`node --test games/ddpdoj/tests/`

Result: **1620/1620, zero failures, zero skips.** The suite is green for the
first time since the Stage-4 boss work began.
