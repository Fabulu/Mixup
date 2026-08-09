# W177: Stage-2 type `$91`

Status: COMPLETE

## Scope

Port the dependency-complete type `$91` family at the first chronological
unsupported stage-2 record `$232CE8`, clock `$013F`, init body `$279AA2`,
handler `$279B2E`, and movement index `$02B`. Verify the Version-B ROM closure
and advance the controlled boot to the next honest unsupported boundary.

## Starting state

- W176 is committed, pushed, and live as build `20260809092221`.
- Stage-2 coverage is 315/332 records with 17 unknown.
- The seeded boot completes 227 records and stops at `$279AA2`.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## ROM closure

The exact `$279A9A..$279CD0` closure is pinned from the Version-B image. It
contains the type `$91` run-length-zero stub, init body, five palette pairs,
two-word record prototype, one 28-byte long-form sub-record prototype, death
tail, handler, three pool-B effects, seven-vector impact table, and the next
type `$92` stub required to reach the next honest init-body boundary.

The sole stage-2 occurrence is record `$232CE8`, trigger `$013F`, movement
index `$02B`, using the exact six-byte stream `$233634..$23363A`.

## Translation

- Init `$279AA2` loads both prototypes, runs the movement-position reader, and
  installs the adjacent per-stage base/flash palette bytes.
- Handler `$279B2E` ports movement, carry-polarity lifetime bounds, damage flag
  acknowledgement, `$0380` palette threshold, hit score, lethal branch, and
  indirect `$27829C` emission.
- Death posts sound `$28C2DC`, awards packed BCD `$13`, creates the three exact
  kind-5 effects, and enters the authentic byte linger.
- Linger draws while `subq.b` has no borrow. On underflow it records the seven
  ROM vectors passed to the still-deferred `$27F8FA` impact allocator, then
  frees the enemy.

## Integration finding

The first controlled boot reached `$279CCA`, the immediate inside type `$92`'s
stub, because the initial export ended at `$279CC8`. Extending the exact W177
window by the stub's eight bytes made the next boundary addressable without
exporting any type `$92` body code.

## Verification

- Focused W177 plus affected integration/coverage set: 30 passed, zero failed
  or skipped.
- Controlled stage-2 boot: 4 passed, stopping at type `$92` body `$279CD0`,
  record `$232D58`, clock `$0155`.
- Boot prefix: 241 records consumed, 237 allocations, four authentic declines.
- Enemy coverage: 37/256 ported, 89 unknown, 130 null.
- Stage-2 coverage: 316/332 ported, 16 unknown, dynamic-minus-static zero.
- `export-tables.py`: passed with 233 windows and 273,132 bytes.
- `dojcoverage.py`: passed; static-minus-dynamic remains 304.

## Release

- Commit `1612905` contains the W177 port and current-state docs.
- Commit `1429ea5` refreshes the two whole-registry expectations found by the
  release gate.
- Release gate: 1,492 passed, zero failed/skipped; bundle/web and ROM-leak
  checks passed.
- Published and confirmed live as build `20260809095334` at
  `https://gbtman.pages.dev/games/ddpdoj/`.
