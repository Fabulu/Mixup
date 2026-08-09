# W188: Stage-1 tank deaths and hyper presentation/crash

Status: COMPLETE

## Scope

Reproduce and fix three owner-reported playable defects: tanks on the right-side
buildings disappearing without death explosions, incomplete hyper activation
visuals around the large yellow beam, and a crash when hyper is activated as
the stage-1 boss begins. Use static ROM analysis before changing gameplay,
verify the actual visible paths, and preserve the current sound/chain/hyper
mechanics.

## Starting state

- W187 is committed, pushed, and live as build `20260809173436`.
- All 332 stage-2 spawn records and the complete F3/E6-E11 attack cycle run.
- Stage-2 spawn coverage is 332/332; enemy coverage is 44/256 and the bundle
  contains 2,919 sprite streams.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## Static findings

### Tank deaths

The missing primary explosion was a layer-index mistranslation, not missing
pool-B art. Type `$11` at `$2687B0..$2687BC` and type `$10` at
`$26813A..$268146` preserve sub-record byte `+$1F` in D1, replace it only when
`+$1E` is nonzero, then double and store D1 into `+$1E` unconditionally. The JS
had doubled only a nonzero `+$1E`.

Movement streams such as `$231D58` and `$231E80` set `+$1F=4` while leaving
`+$1E=0`. The old port therefore indexed death remap `$267FA0` at byte zero and
put the explosion in bucket 0 behind the building. The ROM stores `+$1E=8`,
which remaps to `$000C`, bucket 3 in front. This affects 11 type-`$11` and four
type-`$10` stage-1 records, including the right-side building tanks the owner
reported. Their pool-B kind `$07`/`$04` art was already complete.

### Hyper presentation

The activation and ending paths at `$287324/$287340/$2873AC` use 34 valid
112x80 sprite streams from `$0530FC` through `$0579B0`, stride `$234`. None was
in the W187 bundle. The large yellow beam was the weapon itself; the absent
family was the separate bucket-18 burst/aura.

The ROM also redraws the hyper-stock HUD immediately at `$285A3E/$285B68` and
`$285B24/$285C4E`. The translated state machine omitted those calls, which was
visible when the boss-up HUD branch bypassed the ordinary transition redraw.

### Hyper firing crash

The exact stable reproduction is stage-1 checkpoint `lf8000`: seed one stock,
step neutral, press Button 2, then hold Button 3. The old port threw at
`$254078` before allocating the first hyper projectile. Static closure showed
four ship entries `$254078/$254136/$2541BC/$25427A` and four option entries
`$254300/$2543A4/$25442A/$2544CE`. The latter are required on the same firing
frame, so stopping after the first cleared exception would still crash.

The ship pair uses normal/hit tables `$24EC72/$24ED4E` and
`$24F3D2/$24F4AE`. The option pair uses `$251526/$2519E0` and
`$25211C/$2525D6`. All base, continuation, hit, clamp, animation-reload,
velocity-quarter, spark, and sound paths are translated. Both TYPE-A and TYPE-B
option templates and art are exported. Hyper fire selects its authentic
`$28C3EE` wrapper rather than the ordinary `$28C3BA` shot sound.

## Implementation

- Corrected the type `$10/$11` `+$1F` to `+$1E` layer transfer.
- Added the eight hyper-shot dispatch entries and their ROM table windows.
- Added the `$28C3EE` hyper-shot sound wrapper.
- Added immediate hyper-stock redraw callbacks without introducing an ESM
  cycle between `hyper.js` and `hud.js`.
- Added all 34 aura streams to deferred shard 13.
- Expanded shard 6 from 71 to 96 streams for complete ship and option hyper
  projectile art. The full bundle now contains 2,978 streams, up from 2,919.

## Verification

- Focused W188 gate: 74/74 tests green.
- Real-ROM tank fixtures: both types set `+$1F=4`, store `+$1E=8`, and remap
  death to `$000C`; the old zero value is explicitly pinned to bucket 0.
- `lf8000` product smoke: 30 held-fire frames complete with active level-1
  hyper and live dispatch nibbles 4, 6, 12, and 14.
- Generated bundle contains all 34 aura streams.
- Full DOJ unit suite: 1,533/1,533 green.
- Bundle gate: 100.0000% green.
- Real HTTP web gate: green after updating the measured shard inventories to
  96 shot streams and 252 bomb/hyper streams.

## Result

The affected building tanks now place their primary death explosion in front,
the hyper activation has its complete aura and immediate HUD transition, and
hyper plus held fire runs through ship and option projectiles without the
reported boss-start crash. W188 does not change the stage-2 completion
frontier; after publication, continue the full-game goal at the F1/F2/F8 boss
phase closures recorded in `instructions.md`.

## Release

- implementation commit: `7079fa60fe3b8064e7f7a2e0a559c9ebabed9a06`
- production build: `20260809204248`
- deployment: `https://c4d9d9f7.gbtman.pages.dev`
- production URL: `https://gbtman.pages.dev/games/ddpdoj/`
- production confirmation: three consecutive checks reported the expected
  build ID and HTTP 200 for the DOJ page and asset manifest
