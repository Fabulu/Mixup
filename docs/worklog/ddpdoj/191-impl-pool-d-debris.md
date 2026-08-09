# W191: Pool-D secondary debris

Status: COMPLETE

## Scope

Statically map and translate the live pool-D allocator at `$289098`, its
type-5 driver at `$2890F2`, reachable templates, RNG consumption, and sprite
art. Restore the secondary debris requested by the completed Stage-2 boss
death effects without translating dormant Stage-2 boss scripts. Use one
focused regression and one visible Stage-2 product smoke.

## Starting state

- W190 is committed, pushed, and live as build `20260809215527`.
- Every scheduler entry reachable from the Stage-2 type-`$30` boss graph is
  translated.
- Primary boss death effects, palette transition, blast, and shake run.
- Pool-B effects already request pool-D children, but the safe refusal at
  `$289098/$2890F2` suppresses their secondary debris.

## Static findings

Pool D is 20 records at `$81C8EC`, stride `$40`, with its live count at
`$81CDEC`. `$289098` treats the parent's `$12` field as count minus one and
fills one or more records through `$289658`. The five `$90`-byte templates at
`$289810..$289AE0` each own a 32-pointer descriptor list. Template zero can
randomly select four of those lists, so all five lists and all 160 distinct
sprite streams are reachable.

The driver at `$2890F2` preserves three movement paths, per-record speed
cadence, periodic culling, animation cursor wrap, hold and lifetime gates, and
the five legal record emitters. The current packed bucket calculation folds to
bucket zero exactly as the ROM does.

One rank branch is intentionally odd. It tests `$813098` before replacing the
inherited A6 from the preceding pool-B call. It therefore clears words starting
at pool B's bit bucket while decrementing pool D's live count, leaving the
actual pool-D status words occupied. The translation preserves this behavior
explicitly rather than silently normalizing it.

## Implementation

- Added the `$289098` allocator, `$289658` fill, all five template init paths,
  and the `$2890F2` 20-slot driver.
- Wired type-5 call 6 immediately after pool B's explosion driver.
- Wired the already translated pool-B and pool-D clears into `$25FD38`, so a
  stage rebuild cannot inherit debris from the previous stage.
- Added the two missing shared RNG helpers at `$242CAC` and `$24397A`.
- Added exact ROM windows and SHA-256 pins for the allocator, driver, vector
  solver, animation/fill closure, and five descriptor lists.
- Added deferred sprite shard 18 with 160 distinct streams, 12,280 opaque
  pixels, and a 7.1 KiB compressed payload. The full bundle grows from 2,978
  to 3,138 streams.
- Retired the historical pool-D refusal assertions and retained the parent
  record's one-shot disarm semantics.

## Verification

- Export verification: green, 291 ROM windows.
- Asset generation: green, exactly 160 new streams in shard 18 and 3,138 total.
- Focused W191 regression: 1/1 green. It proves allocation, exact RNG count,
  real sprite emission, multi-record jitter, and eventual slot drain.
- Directly affected legacy checks: 62/62 green.
- Existing Stage-2 product smoke: 4/4 green, including the long boss run.
- Release compatibility gate: all 1,539 checks green. The first pass found one
  stale W167 expected total after type-5 coverage moved from 17 to 18; its
  focused three-check file is green after updating that declared total.

## Result

Stage 2 now includes the secondary debris requested by ordinary enemy deaths
and by the completed boss-death effect sequences. The reachable Stage-2 spawn,
boss scheduler, death presentation, and pool-D dependency graph are closed.
The next honest delivery frontier is the Stage-3 install and static spawn
census, followed by its chronological unsupported gameplay families.

## Release

- implementation commit: `18b0852`
- completion documentation commit: `369ce01`
- refreshed deterministic web witnesses: `c62f35e`
- translated shard packaging commit: `8c9d48b`
- production build: `20260809224615`
- deployment: `https://gbtman.pages.dev/games/ddpdoj/`
- confirmation: three consecutive production polls returned the new build and
  HTTP 200 for the game route
