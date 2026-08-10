# W215: Stage-4 type $9D

Status: COMPLETE

## Scope

Statically bind and translate the sole Stage-4 type `$9D` record at `$235FF0`,
including its exact movement stream, init/prototypes, handler, direct child
graph, visible assets, and chronological next live frontier.

## Starting state

- W214 is complete and live as build `20260810085716`.
- Stage 4 covers 370/382 spawn records and 24/29 script types.
- Type `$9D`: clock `$01D8`, body `$27B2FE`, handler `$27B78A`, movement
  `$2367CE..$2367D4`.

## Delivered

- Translated the complete three-part Type `$9D` carrier, including linked-part
  aiming, alternating attacks, damage, palette flashes, death presentation,
  item release, and the exact final sides-only tail.
- Translated its directly spawned live Type `$9E` child and deferred spawn
  path. No adjacent Type `$9F` code was pulled into the live closure.
- Exported the two exact ROM closures and all 56 newly reachable streams: 16
  root frames, four overlays, four attached-part frames, and 32 child frames.
- Added one focused ROM/runtime check and a real clock `$01D8` product smoke.
  Stage 4 now covers 371/382 records and 25/29 script types. Enemy registry
  coverage is 70/256.

## Verification and publication

- Implementation commits: `c07feb2`, `169883d`.
- Release gate: 1,588/1,588 tests, bundle gate, web fetch gate, ROM-leak guard,
  deployment, and three live confirmations all passed.
- Live build: `20260810093032`.

## Next frontier

The next unsupported Stage-4 record is Type `$A3` at `$2360D0`, clock `$0234`,
raw `02340000a3000069`. Registry row `$27E52A` points to stub/body
`$27D3FC/$27D404` and handler `$27D674`. Movement index `$069` resolves to
`$2370D8..$23712E`.
