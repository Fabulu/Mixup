# W192: Stage-3 install and static spawn census

Status: COMPLETE

## Scope

Install Stage 3 from its ROM-owned stage tables, statically enumerate every
spawn record and movement stream before runtime work, identify the chronological
unsupported live frontier, and translate the smallest dependency-complete slice
that produces visible Stage-3 gameplay. Use one focused regression and one
real Stage-3 product smoke.

## Starting state

- W191 is complete and live as build `20260809224615`.
- Stage 2 has 332/332 statically known spawn records and no unsupported live
  scheduler entry in its reachable boss graph.
- The browser bundle contains 3,138 sprite streams.
- Stage-3 resources begin at stage script `$2342BA`, auxiliary table `$234FB2`,
  and resource block `$2350A8`; the following Stage-4 script begins at
  `$2358B0`.

## Static findings

Stage 3 contains exactly 414 spawn records and 28 enemy types. Its 123-word
auxiliary table addresses 123 strictly bounded movement streams; 100 indices
are used by spawn records, and the resource block ends exactly at the Stage-4
script. Before this slice, 183 records and 13 types were already translated.

The first unsupported family was type `$3E` at clock `$0006`. It occurs 70
times. Its complete local closure is `$2653E6..$265798`: the run-length stub,
init body, record prototype, two sub-record prototypes, handler, and 64-entry
heading/mirror sprite table. The handler owns two linked hitboxes, applies only
the larger damage delta, fires three bullets normally or five in the special
stage mode, and dies through the existing score, effect, sound, and free paths.

The static asset pass also found a presentation hole outside the enemy
closure: the browser atlas did not contain the human Stage-2 or Stage-3
background tile families. Stage 2 uses 1,404 distinct tiles from 168 columns;
Stage 3 uses 252 distinct tiles from 28 columns. Their palette blocks were
already ROM-addressable, but the tiles themselves needed deferred web shards.

## Implementation

- Exported the complete Stage-3 spawn, aux, movement, background, and type
  `$3E` ROM dependencies with exact boundary and hash checks.
- Added the type `$3E` two-sub-record init and handler, including aim cadence,
  scaled bullet headings, linked damage, death effect, mirror animation, and
  register-convention sprite output.
- Harvested all 64 type `$3E` streams into deferred sprite shard 17. The web
  sprite bundle grows from 3,138 to 3,202 streams.
- Added deferred background shard 8 for Stage 2 and shard 9 for Stage 3. This
  restores the 1,404-tile Stage-2 terrain family and the 252-tile Stage-3
  opening family without increasing the first-frame payload.
- Extended reusable static coverage with the live Stage-3 family and an
  ordered unsupported-record frontier derived from the ROM aux/resource
  tables.

## Verification

- ROM/table export: green, 294 windows.
- Web asset export: green, 3,202 sprite streams and 10 background shards.
- Focused W192 regression: 5/5 green. It covers the complete census and hashes,
  both sub-records, movement init, scaled firing, mirrored sprite output,
  maximum linked damage, death, and the real clock-6 three-record spawn pass.
- Reusable coverage: green at 253/414 Stage-3 records and 14/28 Stage-3 types.
- Directly affected coverage and shard-loader checks: 10/10 green.
- Release compatibility gate: 1,544/1,544 green. Its first pass found three
  stale registry counts; the focused 35-check inventory set is green after
  adding the new init and handler entries.

## Result

Stage 3 now installs from its real stage table, its opening type `$3E` family
is playable with complete art, and both Stage-2 and Stage-3 human background
tile families are available to the browser renderer. The next chronological
unsupported record is type `$36` at `$234312`, clock `$000A`. Stage-3 coverage
is 253/414 records, leaving 161 records across 14 unsupported types.

## Release

- implementation commit: `5956fa0`
- registry inventory update: `eca24e9`
- production build: `20260809231913`
- deployment: `https://gbtman.pages.dev/games/ddpdoj/`
- confirmation: three consecutive production polls returned the new build and
  HTTP 200 for the game route
