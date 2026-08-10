# W194: Stage-3 type $37

Status: COMPLETE

## Scope

Use W192's complete static Stage-3 census to translate the next chronological
unsupported family, type `$37` at record `$234502`, clock `$003B`, with only
its directly reachable runtime and visible asset dependencies. Run one focused
behavior regression and one real Stage-3 spawn smoke.

## Starting state

- W193 is complete and live as build `20260809235214`.
- Stage 3 has 258/414 records and 15/28 enemy types translated.
- Type `$36` and all earlier records are live.
- The next unsupported record is `$234502`, type `$37`, body `$264740`, handler
  `$2647A6`.

## Static findings

Type `$37` occurs once in Stage 3. Its exact local closure is
`$264738..$264C14`, SHA-256
`9366c6e59a7a88bfb998efadec25226803fa0a37622c6323075d4ac40fffd08f`.
The zero run length selects one sub-record. The init loads its record and
sub-record prototypes, consumes movement `$23518E..$235194`, then applies the
two ROM position biases.

The live handler draws a fixed hull plus a four-phase rotating body, aims one
step per call, and fires three-shot bursts through the existing bullet
generators. Its outer burst timer deliberately leaves the inner cadence timer
untouched while no burst is armed. Death keeps the fixed hull visible, emits
the existing kind-`$84` blast, and allocates a kind-4 pool-C satellite.

Pool C is therefore a direct visible dependency. Its exact translated slice is
`$289B50..$289EDA`, SHA-256
`234d3695f6acb9e707db03410085fdb42c49645756666882037a4ae1830eec1d`.
It includes the absolute allocator, collision-aware fill, animation/cull
driver, kind-4 template, and all three reachable descriptor lists.

## Implementation

- Added init body `$264740` and handler `$2647A6`.
- Translated the cull latch, hit/death state, one-step aim, nested burst cadence,
  three bullet calls, fixed hull, and 128-frame rotating body selection.
- Added pool-C kind-4 allocation and the type-5 pool-C driver, including its
  slot limits, collision screening, RNG order, animation, cull, and bucket-3
  emission.
- Exported both exact ROM closures with fixed registry, record, movement,
  template, boundary, and SHA checks.
- Harvested 128 rotating-body streams, fixed hull `$2A60F8`, and eight distinct
  pool-C streams. The sprite inventory grows from 3,235 to 3,372 streams.
- Advanced reusable Stage-3 coverage to 259/414 records and 16/28 types;
  overall enemy-family coverage is now 47/256.

## Verification

- ROM/table export: green.
- Web asset export: green, 3,372 sprite streams.
- Focused type `$37` cadence/death/pool-C regression: green.
- Real clock-`$003B` Stage-3 spawn smoke: green through type `$37`, then loud at
  the honest same-clock type `$3C` frontier.
- Directly affected integration and reusable coverage checks: green.

## Result

The Stage-3 type `$37` fighter now initializes, aims, fires, explodes, keeps its
fixed wreck visible, and runs its pool-C death satellite with complete art. The
next chronological unsupported record is type `$3C` at `$234512`, clock
`$003B`, with body `$266968` and handler `$2669E2`. Stage 3 has 259/414
translated records, leaving 155 records across 12 unsupported types.

## Release

- implementation commit: `4b7305b`
- registry expectation correction: `6560d8a`
- production build: `20260810002237`
- release gate: 1,548/1,548 tests, bundle render, web fetch, and ROM leak guard
- deployment: `https://gbtman.pages.dev/games/ddpdoj/`
- confirmation: three consecutive production polls returned the new build
