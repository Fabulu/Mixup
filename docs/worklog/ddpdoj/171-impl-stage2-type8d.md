# W171: Stage-2 type `$8D`

Status: COMPLETE

## Scope

Reconstruct and port the dependency-complete type-`$8D` init, handler,
lifecycle, movement, prototypes, palette, emissions and exact art family, then
continue only to the next honest unsupported stage-2 spawn boundary.

## Result and next boundary

Type `$8D` is complete. The stage-2 boot consumes 64 records, with 60 successful
allocations and four authentic allocator declines, then stops loudly at record
`$2327D0`, clock `$0045`, type `$8F`, body `$27751C`, handler `$2775CC`.
Its exact movement stream is `$2340CC..$2340D3`. No part of type `$8F` was
guessed or smoothed.

W167 coverage now derives 299 of 332 stage-2 records as ported, leaving 33
UNKNOWN. The dynamic join contains 28 exact board-observed records and has zero
dynamic-minus-static inventory failures. Static-minus-dynamic remains 304
records, which is an evidence limitation rather than a claim that the records
are dead.

## ROM closure

The exported main-CPU closure is `$27693E..$277270`:

- `$27693E..$276946`: run-length-zero stub
- `$276946..$2769C4`: init body
- `$2769C4..$2769CE`: five palette pairs
- `$2769CE..$2769E6`: twelve-word record prototype
- `$2769E6..$276A02`: one 28-byte sub-record prototype
- `$276A02..$276D50`: complete handler and tail jump
- `$276D50..$276DD0`: 32 heading art pointers
- `$276DD0..$276DE8`: six animation art pointers
- `$276DE8..$276E68`: 32 shot-delta longwords
- `$276E68..$277270`: 516 structurally bounded bob words

The bob phase is incremented by `addq.b #3,$2B(A5)`, so only the first 256
words are reachable through this handler. The full 516-word extent is still
exported and pinned by the next type `$89` stub at `$277270`; structural extent
and live index extent are kept as separate facts.

The handler's direct call closure includes `$2638A6`, `$242684`, `$286096`,
`$24203E`, `$242190`, `$268018`, `$281420`, `$2813F0`, `$28615E`, `$289004`,
`$28C25A`, and the `$263762` tail. Sprite emitters are address-register indirect
calls through the closed `$27829C/$2782E4` tables, so W167 continues to label
instruction size as a lower bound instead of assigning zero cost to them.

## Behavior

The init copies both exact prototypes, reads the movement position, aims at the
selected player, selects heading art, advances the shared RNG twice, applies
the byte-width rank arithmetic, and selects the palette with `$813094` as the
raw stage-index-times-two offset. This also corrects the old `G.loop` name in
`initbody.js`; the address and arithmetic were already right, but the name and
W170 test fixture were wrong.

The handler ports movement, on-screen ownership, hit scoring and palette flash,
six-frame descending animation, byte-phase bobbing, aim and one-step slew,
record and register sprite emissions, optional shared overlay, player-distance
fire gate, both `$2813F0` and `$281420` shot generators, cadence reloads, and
the full two-stage death:

1. The first negative-HP hit scores `$11`, spawns kind `$0B`, installs fixed art
   `$193B4C`, restores HP `$0140`, sets the intermediate flag, and stays live.
2. The next negative-HP hit posts `$28C25A`, scores `$08`, spawns kind `$0C`,
   and frees the enemy.

## Art closure

The dependency family has 43 streams:

- 32 heading streams `$192ACC + $84*i`, through `$193AC8`
- fixed death stream `$193B4C`
- six animation streams `$193BD0..$193DC7`, stride `$54`
- four shared overlays selected through `$278338`

The 39 type-specific streams join the existing derived boss shard 17. The four
shared overlays retain their earlier W53/W58 owner in shard 10. An initial
exporter ordering put those four into shard 17 first and made the laser web gate
red, 403 streams versus its established 407. Restoring the existing owner
re-greened the exact laser gate without an owner exception.

## Controlled board evidence

`tools/w171-stage2-type8d-evidence.json` is record-qualified VERSION-B
evidence. A corrected controlled run observed the first six type-`$8D` records:

| Logic frame | Record | Clock |
|---:|---:|---:|
| 12842 | `$232700` | `$001E` |
| 12890 | `$232730` | `$0021` |
| 12938 | `$232748` | `$0024` |
| 12938 | `$232750` | `$0024` |
| 13002 | `$232758` | `$0028` |
| 13274 | `$2327A0` | `$0039` |

Isolation begins only after the first pre-handler sample and is explicitly
invalid for pacing, density, difficulty, and unaided lifetime. Across 202
sampled lifecycle frames, the board walked all six animation streams in the
ROM's descending pointer order, advanced the bob phase by three, changed
heading art, and raised the enemy-bullet occupancy. At logic frames 13042 and
13043, two labelled negative-HP interventions reached the intermediate and
final death arms; the slot was absent at logic frame 13044.

The first 13,200-frame attempt left the probe's default auto-fire disabled and
never reached stage 2. It is recorded as a runner-input correction, not negative
type-`$8D` evidence. The corrected 13,400-frame run enabled the existing
labelled auto-fire intervention. Aggregate board-run wall time was 136 seconds,
well inside the one ten-minute cap, and no further board attempt was started.

## Deliberate reds and verification

- Changing `TYPE8D_ART.headings` from 32 to 31 made W171/1 red; restoring 32
  re-greened it.
- `dojcoverage.py --break-coverage` lost a registry token and failed.
- `dojcoverage.py --break-stage2-spawn-inventory` injected an impossible
  record and failed the hard dynamic-minus-static gate. Both coverage mutations
  were restored and the clean coverage report is green.
- Focused W133/W169/W170/W171 and handler tests: 31/31, zero skipped.
- Full DOJ unit suite: 1,451/1,451, zero skipped.
- `npm run typecheck`: passed.
- `export-tables.py`: passed with the exact W171 ROM gates.
- `dojcoverage.py`: passed; stage 2 is 299/332, dynamic 28, inventory zero.
- `bosscoverage.py`: unchanged and passed, 103/111 with eight proven dead.
- `export-web.mjs`: passed; shard 17 contains the 39 new type-specific streams.
- `bundlegate.mjs`: 15,955,968/15,955,968 pixels, 100.0000%.
- `webgate.mjs`: passed.
- `publish.mjs --only ddpdoj --dry`: passed; build id `20260809034441`.
- No deployment was performed.
- `git diff --check`: passed.

No sound, replay, hyper, bee, Gradius, or `$29540C` behavior was changed. The
three untracked `c1_*.py` owner files were preserved and are not part of W171.
