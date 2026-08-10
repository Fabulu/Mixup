# W196: Stage-3 type $3B

Status: COMPLETE

## Scope

Use W192's complete static Stage-3 census to translate the next chronological
unsupported family, type `$3B` at record `$23453A`, clock `$0048`, with its
directly reachable runtime and visible asset dependencies. Run one focused
behavior regression and one real Stage-3 spawn smoke.

## Starting state

- W195 is complete and live as build `20260810004205`.
- Stage 3 has 267/414 records and 17/28 enemy types translated.
- Type `$3C` and all earlier records are live.
- The next unsupported record is `$23453A`, type `$3B`, body `$264D5A`, handler
  `$264E82`.

## Static findings

Type `$3B` occurs three times. Its live dependency spans are
`$264D52..$265314` and `$26539C..$2653E6`; the adjacent code between them has
no path from this family. Init loads one sub-record, preserves the spawn clock,
sets its clock-owned stage latch, applies the fixed position bias, and chooses
clockwise or counter-clockwise spin from `$242EC2`.

The handler maintains four packed orbit vectors, renders a 16-frame hull plus
four satellites, and fires paired bullets from every satellite. Rank changes
both the cadence and the first/second bullet speeds. Its opening HP countdown,
hit palette, score, six-row death burst, sound, cull latch, and stage-latch
cleanup all run in the same ordering as the ROM. Freeze only suppresses the
shared scroll helper here; it does not pause the formation logic.

The live draw path owns exactly 17 new streams: 16 hull frames and one fixed
satellite. Death art, palette banks, bullets, effects, and sound were already
shipped.

## Implementation

- Added init body `$264D5A` and handler `$264E82`.
- Translated the three clock-specific latches, initial bias/spin, invulnerability
  countdown, damage/death path, four orbit calculations, ranked paired-bullet
  cadence, five-record draw path, and cull cleanup.
- Exported only the live code/data span and death rows, with registry,
  occurrence, movement, art, death-table, next-frontier, and SHA checks.
- Harvested the 17 live art streams into deferred shard 17. The sprite inventory
  grows from 3,375 to 3,392 streams.
- Advanced Stage 3 to 270/414 records and 18/28 types; overall enemy-family
  coverage is now 49/256.

## Verification

- ROM/table export: green.
- Web asset export: green, 3,392 sprite streams.
- Focused init/orbit/fire/draw/death regression: green.
- Real clock-`$0048` Stage-3 spawn smoke: green, consuming type `$3B` and
  advancing the script cursor to `$234542`.
- Release gate: 1,552/1,552 tests, bundle render, web fetch, and ROM leak guard.

## Result

All three Stage-3 type `$3B` records now spin, fire, take damage, explode, and
draw with complete art. The next chronological unsupported record is type
`$38` at `$2345D2`, clock `$0064`, with body `$264C1C` and shared handler
`$2647A6`. Stage 3 has 270/414 translated records, leaving 144 records across
10 unsupported types.

## Release

- implementation commit: `a0bdda6`
- production build: `20260810010717`
- deployment: `https://gbtman.pages.dev/games/ddpdoj/`
- confirmation: three consecutive production polls returned the new build
