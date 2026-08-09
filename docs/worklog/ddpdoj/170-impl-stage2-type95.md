# W170: Stage-2 type $95

Status: DONE

## Scope and boundary

W169 stopped at stage-2 script record `$232660`, clock `$000C`, because type
`$95` named init body `$277836`. W170 ports that type as one dependency-complete
wave: its run-length stub, init, two prototype families, movement, handler,
shots, damage/death state, and every art stream its live emissions can name.

The port now consumes 38 stage-2 records and stops at clock `$001E`, record
`$232700`, type `$8D`, on body `$276946`. That type has a different init
`$276946`, handler `$276A02`, movement `$2332EE..$2332F3`, and art family. It is
the next honest dependency boundary, not part of type `$95`, so this wave does
not guess across it.

## Exact ROM closure

The static closure is `$27782E..$277DE0`:

- `$27782E..$277836`: the exact run-length-1 stub
- `$277836..$27795A`: init body
- `$27795A..$277964`: five palette pairs
- `$277964..$27797E`: 13-word record prototype
- `$27797E..$2779B6`: two 28-byte sub-record prototypes
- `$2779B6..$277DB8`: handler and its reachable state machine
- `$277DB8..$277DC0`: four muzzle-offset words
- `$277DC0..$277DE0`: exactly eight animation pointers
- `$277DE0`: the next type's init stub, proving the far boundary

The exporter pins the loader targets, call closure, prototype starts, muzzle
table, all eight pointers, fixed-art immediate, and both adjacent init stubs
against `maincpu.bin`. The handler has 248 instructions in the reusable W167
lower-bound walk. Address-register indirect calls remain UNKNOWN in that count;
they were not invented as zero-cost closure.

The body applies the cartridge's zero-based stage gates: human stage 2 is
`$813092 == 1`. It copies the record/sub-record prototypes, installs movement,
selects the stage-index-times-two palette pair, uses reload 5 through human stages 1/2 and 2
afterward, applies stage-2 clock/kill/HP gates, and preserves the stage-5
four-way progress gates.

The handler ports movement and bounds, hit palette/score and signed HP/floor
clamping, freeze gates, the alternating side guns, the aimed four-shot burst,
states `0 -> 1 -> 2 -> 3`, animation cursor `0,4,...,$1C,...,0`, both death
effects, sound, score, and final free. Its direct cartridge call family includes
`$263762`, `$2638A6`, `$23D852`, `$23DF86`, `$23DF58`, `$2422A2`, `$2813F0`,
`$281708`, `$2817B8`, `$286096`, `$28615E`, `$289004`, and `$28C2DC`.

## Complete art family

There are ten streams, not an address-range guess:

- body `$1744F8`, whose stream closes exactly at `$17479C`
- eight pointers at `$277DC0`: `$17479C`, `$174878`, `$174954`, `$174A30`,
  `$174B0C`, `$174BE8`, `$174CC4`, `$174DA0`; each is stride `$DC`, and the
  eighth closes exactly at `$174E7C`
- fixed overlay `$174E7C`, which closes at `$174F40`

The emission order is body through `$23D852` into bucket 7, indexed animation
through `$23DF86` into bucket 7, then the conditional fixed overlay through
`$23DF58` into bucket 3. Bucket 3 drains before bucket 7; tests preserve both
call order and drain ownership.

The family initially received its own small deferred shard. Publish dry caught
that the colour plane, decompressed, was one contiguous verbatim ROM span. No
owner exception was added. The ten late-stage streams now share deferred shard
17 with the immediately preceding boss family, producing one derived packed
multi-family plane. The leak guard then passed with the existing six exceptions
unchanged.

## Controlled board evidence

`tools/w170-stage2-type95-evidence.json` is record-qualified VERSION-B evidence.
The ROM script contains exactly 31 type-`$95` records. The controlled run saw
the first four at:

| Logic frame | Record | Clock | Slot |
|---:|---:|---:|---:|
| 12554 | `$232660` | `$000C` | `$8138CC` |
| 12810 | `$2326E8` | `$001C` | `$81364C` |
| 13066 | `$232768` | `$002C` | `$8136EC` |
| 13162 | `$232780` | `$0032` | `$81369C` |

The first enemy was isolated only after its pre-handler sample by clearing
other enemy slots and clearing the enemy-bullet pool once. This intervention is
valid for the type's lifecycle, animation, emission and shot deltas, not for
unaided pacing. Across 552 samples, the animation advanced through all eight
pointer entries and descended back through them. Enemy-bullet occupancy rose
by four at logic frames 12713, 12719, 12725, 12803 and 12809.

A separate named `W170_KILL_FIRST` intervention applied a P1 hit and signed
`$8001` HP/floor after the first pre-handler sample at logic frame 12554. The
type scored, posted its death sound, produced both exact effect arms, and freed
at 12555. This proves death ordering, not natural time-to-kill. W169's longer
controlled occurrence corpus had already witnessed six type-`$95` spawns; the
new corpus is deliberately narrower and handler-instrumented.

## Coverage and deliberate reds

W167 now derives `$277836` and `$2779B6` from the live source registries and
joins the four new record-qualified observations against the 332 ROM-derived
stage-2 records. The exact `$232660` overlap with W169 is one corroborating
witness; any disagreement in record, trigger, or type is a hard inventory
error.

Stage-2 spawn coverage is now 262/332 ported, 70 UNKNOWN, 22 dynamically
observed records, and 310 static-minus-dynamic records. Dynamic-minus-static is
zero. The machine-readable backlog names the next exact frontier:
`$232700/$001E/$8D`, body `$276946`, handler `$276A02`, and movement
`$2332EE..$2332F3`.

Relevant reds were demonstrated and restored:

- changing the live eight-frame art registry to seven makes the exact W170
  registry/table assertion fail
- `dojcoverage.py --break-coverage` drops a live registry entry and fails
- `dojcoverage.py --break-stage2-spawn-inventory` injects a record outside the
  ROM family and fails dynamic-minus-static

## Verification

- Focused W133/W167/W169/W170 and integration/art tests: green, zero skipped.
- Full DOJ unit suite: 1,445/1,445 passed, zero skipped.
- `npm run typecheck`: passed.
- `export-tables.py` and `export-web.mjs`: passed; shard 17 now contains 358
  streams including the ten type-`$95` streams.
- `bosscoverage.py`: 103/111 entries ported, zero live-unported, eight proven
  dead, dynamic-minus-static zero.
- `dojcoverage.py`: passed with both required reds restored.
- `pgm.py check --quick`: reached its summary at 52 passed, the same four
  inherited failures (stage end, chain expiry, bomb, laser bomb), zero skipped.
  A prior full `pgm.py check` exceeded the ten-minute host ceiling and left
  child processes alive; it is not claimed green. Those exact orphaned DOJ
  processes were stopped, assets were regenerated, and all final gates below
  were run afterward without concurrent MAME.
- `node tools/publish.mjs --only ddpdoj --dry`: passed unit, bundle, web,
  ROM-leak, and build gates; build id `20260809030910`; no deployment.
- `git diff --check`: passed.

No sound, replay, chain/hyper, bee, Gradius, `$29540C`, owner exception, or
deployment behavior was changed.
