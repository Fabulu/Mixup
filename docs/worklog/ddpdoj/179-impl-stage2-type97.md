# W179: Stage-2 type `$97`

Status: COMPLETE, RELEASE PENDING

## Scope

Port the dependency-complete type `$97` family at the first chronological
unsupported stage-2 record `$232DA8`, clock `$0162`, init body `$277DE8`,
handler `$277F26`, and movement index `$065`. Verify the Version-B ROM closure
and advance the controlled boot to the next honest unsupported boundary.

## Starting state

- W178 is committed, pushed, and live as build `20260809102233`.
- Stage-2 coverage is 318/332 records with 14 unknown.
- The seeded boot completes 251 records and stops at `$277DE8`.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## ROM closure

The exact stub-inclusive `$277DE0..$278348` family closure is pinned from the
Version-B image. It contains the run-length-zero stub, init body, five palette
pairs, 17-word record prototype, one long-form sub-record prototype, three
word-threshold cue records, handler, four-frame body-art table, five impact
vectors, shared record/register emitter tables, death selector/remap words,
and the structurally enclosed shared-overlay table. Unrelated code opens at
`$278348` with `48E7 FFFE`.

Two external indexed dependencies are exported separately:

- `$272C7A..$272CFA`: 32 heading-attachment art pointers
- `$272FFA..$27307A`: 32 heading-indexed bullet muzzle vectors

Type `$97` occurs five times through three movement streams:

- `$232DA8`, clock `$0162`, index `$065`
- `$232DE8`, clock `$0173`, index `$06A`
- `$232E48`, clock `$0180`, index `$06A`
- `$232E88`, clock `$0188`, index `$055`
- `$232F00`, clock `$01A0`, index `$055`

## Translation

- Init `$277DE8` loads the prototypes and cue cursor, consumes the movement
  stream, folds the mirrored selector, aims the initial attachment, selects
  stage palette bytes, and preserves all three movement-dependent collision
  setup arms.
- Handler `$277F26` ports movement-vector collision adjustment, wrapped bounds,
  damage and `$02C0` palette threshold, live cue spawning, four-frame body
  animation, target selection, one-step heading slew, both sprite layers, and
  the heading-indexed `$281420` bullet fan.
- The ROM uses a word freeze gate for body animation and separate long freeze
  gates for retargeting and firing. The translation preserves that distinction.
- Death posts `$28C28E`, awards packed BCD `$88`, records the `$289B22` burst
  and five `$27F8FA` impacts, creates the exact kind-`$0D` and kind-`$08`
  pool-B effects, and frees immediately.

## Asset integration

The type needs 36 sprite streams that were absent from W178's bundle: four
body animation frames at `$17E608..$17EA94` and 32 heading attachments at
`$14FE90..$150AAC`. Both pointer tables are now harvested into shard 17. The
regenerated `streams.u32.gz` contains all 36 and reports 2,726 total streams.

## Verification

- New W179 regression demonstrated red by moving the handler registration,
  producing four failures, then restored green.
- Focused W179 plus affected boot/registry/integration/coverage set: 50 passed,
  zero failed or skipped.
- Controlled stage-2 boot: 4 passed, stopping at type `$94` body `$27A0E8`,
  record `$232DC0`, clock `$016B`.
- Boot prefix: 254 records consumed, 250 allocations, four authentic declines.
- Enemy coverage: 39/256 ported, 87 unknown, 130 null.
- Stage-2 coverage: 323/332 ported, 9 unknown, dynamic-minus-static zero.
- `export-tables.py`: passed with 238 windows and 275,278 bytes.
- `dojcoverage.py`: passed; static-minus-dynamic remains 304.
- `export-web.mjs`: passed; all 36 required sprite streams are present.

## Release

Release gate, deployment, and live build confirmation are pending.
