# W197: Stage-3 types $38, $39, and $3A

Status: COMPLETE

## Scope

Use W192's complete static Stage-3 census to translate the structurally adjacent
types `$38`, `$39`, and `$3A` together. They are three data variants of the
already translated shared handler `$2647A6`. Run one focused behavior regression
and real Stage-3 clock-batch smokes.

## Starting state

- W196 is complete and live as build `20260810010717`.
- Stage 3 has 270/414 records and 18/28 enemy types translated.
- Type `$3B` and all earlier records are live.
- The next unsupported record is `$2345D2`, type `$38`, body `$264C1C`, shared
  handler `$2647A6`.

## Static findings

The ROM confirms three consecutive zero-run init variants in
`$264C14..$264D52`, ending exactly at the type-`$3B` stub. Each loads one
record/sub-record prototype and one six-byte movement stream, then applies its
own position bias. All three use the existing type-`$37` handler without any
semantic branch or modification.

The handler already reads each variant's fixed hull, selector, fixed offset,
rotating origin, and hit geometry from its prototypes. The rotating 128-frame
body, muzzle vectors, bullets, death effect, pool-C satellite, palettes, and
sound are shared and already shipped. The only new visible dependencies are
fixed hulls `$2A63FC`, `$2A67C0`, and `$2A6A94`.

## Implementation

- Added init bodies `$264C1C`, `$264C84`, and `$264CEC` through one readable
  shared loader with exact per-type prototypes and position biases.
- Kept handler `$2647A6` unchanged and verified each variant supplies its own
  fixed hull, selector, fixed offset, rotating origin, and hit geometry.
- Exported the exact contiguous trio with occurrence, movement, registry,
  fixed-art, next-frontier, and SHA checks.
- Added all three fixed hull streams to deferred shard 17. The sprite inventory
  grows from 3,392 to 3,395 streams.
- Advanced Stage 3 to 273/414 records and 21/28 types; overall enemy-family
  coverage is now 52/256.

## Verification

- ROM/table export: green.
- Web asset export: green, 3,395 sprite streams.
- Focused table-driven init/draw/death regression: green for all three variants.
- Real clock-`$0064`, `$0083`, and `$00BF` spawn batches: green.
- Release gate: 1,554/1,554 tests, bundle render, web fetch, and ROM leak guard.

## Result

Types `$38`, `$39`, and `$3A` now initialize and draw their distinct hulls while
reusing the complete rotating attack and death behavior already translated for
type `$37`. The next chronological unsupported record is type `$12` at
`$2348B2`, clock `$00E0`, body `$26C26E`, handler `$26C3E2`. Stage 3 has
273/414 translated records, leaving 141 records across seven unsupported types.

## Release

- implementation commit: `8e1ad77`
- production build: `20260810012425`
- deployment: `https://gbtman.pages.dev/games/ddpdoj/`
- confirmation: three consecutive production polls returned the new build
