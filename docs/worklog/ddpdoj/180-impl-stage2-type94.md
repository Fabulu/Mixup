# W180: Stage-2 type `$94`

Status: COMPLETE, RELEASE PENDING

## Scope

Port the dependency-complete type `$94` family at the first chronological
unsupported stage-2 record `$232DC0`, clock `$016B`, init body `$27A0E8`,
handler `$27A1B4`, and movement index `$039`. Verify the Version-B ROM closure
and advance the controlled boot to the next honest unsupported boundary.

## Starting state

- W179 is committed, pushed, and live as build `20260809105517`.
- Stage-2 coverage is 323/332 records with 9 unknown.
- The seeded boot completes 254 records and stops at `$27A0E8`.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## ROM closure

The dependency-complete stub-inclusive family is `$27A0E0..$27A44C`, exactly
`$36C` bytes, SHA-256
`076bca12c95c9bc3082d60a58f3368aea7799e0dd954a67101baa676ef26ea0f`.
It contains the init, palettes, record and sub-record prototypes, handler, and
the full 16-entry art/collision table. `$27A44C` begins the adjacent type `$96`
stub and is excluded. There is no cue script.

The six exact stage-2 occurrences are:

- `$232DC0`, clock `$016B`, movement `$039`
- `$232E00`, clock `$0176`, movement `$053`
- `$232E50`, clock `$0181`, movement `$071`
- `$232EC0`, clock `$018D`, movement `$03B`
- `$232EF8`, clock `$0198`, movement `$072`
- `$232F10`, clock `$01A3`, movement `$077`

The first three movement streams are normal. The last three use escape `$88`
to select the mirrored form. Init consumes only the selector high byte, keeps
selector word `$0003`, sets mirror bit 6, and moves the live collision pointer
from sub-record `+$16` to `+$14`.

## Port

`initbody.js` now translates `$27A0E8`: both prototype loads, movement init,
stage cadence, rank subtraction, mirror folding, collision pointer selection,
and the five palette pairs.

`handlers.js` now translates `$27A1B4`: movement, wrapped horizontal bounds,
damage and palette flash, the long freeze gate, all four animation/fire states,
the `$268018` distance gate, target fallback, `$2422A2` aim, `$281764` bullet
fan, draw dispatch through `$27829C`, score `$34`, sound `$28C2C2`, one kind
`$0C` pool-B death effect, and immediate free.

The subtle fire branches remain distinct: distance carry skips both the bullet
and salvo decrement, while both targets dead skips the bullet but still consumes
the salvo. All byte countdowns preserve the 68000 borrow transition.

## Art and coverage

The art table `$27A3CC..$27A44C` contains 16 reachable entries. Their stream
addresses are `$236430 + n*$104`; their collision words are `$0600 + n*$40`.
`export-web.mjs` harvests all 16 into shard 17. The regenerated packed atlas has
2,742 streams, and an explicit decoded-map check finds all 16 original offsets.

Static coverage advances to 40/256 enemy types and 329/332 stage-2 records,
with three unknown records. The controlled boot completes 292 records with 288
allocations and four authentic declines, then stops honestly at record
`$232EF0`, clock `$0197`, type `$93`, body `$279EC2`, handler `$279F4A`.

## Verification

- `python games/ddpdoj/tools/export-tables.py`: passed with the exact W180 ROM
  closure, call, table, occurrence, movement, and next-frontier assertions.
- `node games/ddpdoj/tools/export-web.mjs`: passed; 2,742 streams.
- Focused W180 behavior: 5 passed, zero failed/skipped.
- Combined registry, boot, coverage, integration, and W180 check: 50 passed,
  zero failed/skipped.
- Release gate, deployment, and live confirmation are pending.
