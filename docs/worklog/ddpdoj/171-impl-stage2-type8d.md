# W171: Stage-2 type `$8D`

Status: COMPLETE, POST-PUSH EMITTER CORRECTION VERIFIED

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
labelled auto-fire intervention. The original W171 board-run wall time was 136
seconds. The post-push correction below added one bounded 134-second evidence
run; no repeated correction run was started.

## Deliberate reds and verification

- Changing `TYPE8D_ART.headings` from 32 to 31 made W171/1 red; restoring 32
  re-greened it.
- Replacing the live emitter-table index with zero made the index-5 mutation
  red: bucket 7 received no records. Restoring `(sub+$1E)*4` re-greened exact
  body, turret, and overlay routing.
- `dojcoverage.py --break-coverage` lost a registry token and failed.
- `dojcoverage.py --break-stage2-spawn-inventory` injected an impossible
  record and failed the hard dynamic-minus-static gate. Both coverage mutations
  were restored and the clean coverage report is green.
- Focused W133/W169/W170/W171 and handler tests: 47/47, zero skipped.
- Full DOJ unit suite: 1,452/1,452, zero skipped.
- `npm run typecheck`: passed.
- `export-tables.py`: passed with the exact W171 ROM gates.
- `dojcoverage.py`: passed; stage 2 is 299/332, dynamic 28, inventory zero.
- `bosscoverage.py`: unchanged and passed, 103/111 with eight proven dead.
- `export-web.mjs`: passed; shard 17 contains the 39 new type-specific streams.
- `bundlegate.mjs`: 15,955,968/15,955,968 pixels, 100.0000%.
- `webgate.mjs`: passed.
- `publish.mjs --only ddpdoj --dry`: passed; correction build id
  `20260809040449`.
- No deployment was performed.
- `git diff --check`: passed.

No sound, replay, hyper, bee, Gradius, or `$29540C` behavior was changed. The
three untracked `c1_*.py` owner files were preserved and are not part of W171.

## Post-push emitter correction

Independent review found a load-bearing error after commit `2173892` was
pushed, before deployment. That commit hardcoded `$23D852/$23DF86/$23DF58`
instead of translating the two indirect table lookups at `$276ABC/$276AF0`
and `$276BC6/$276BFA`, plus the optional-overlay reuse at `$276B3C`. It routed
ordinary type-`$8D` art to buckets 7 and 3 even though the prototype's live
animation word starts at zero and the board routes it to bucket 0.

The corrected boundary is two adjacent tables, not the older claimed single
24-entry table:

- `$27829C..$2782E4`: 12 record-convention and six zoom-family pointers
- `$2782E4..$278314`: 12 register-convention pointers
- `$278314`: coordinate/remap data, proving the pointer-table end

`emit8d` now reads both pointers from the cartridge at
`table + (sub+$1E)*4`. Body uses the record stub, turret uses the register
stub, and the optional overlay reuses that same register stub. Index zero is
`$23D762/$23DECE`, both bucket 0. A live-index-5 mutation proves the port is
not accidentally pinned to zero: the ROM selects `$23D852/$23DF86` and all
three requests move to bucket 7.

The bounded `w171-correction-emitter` board run recorded the actual counter
writes. On the first isolated type-`$8D` handler frame, `$23D794` then
`$23DEF2` advanced bucket 0 by 12 bytes each. At the labelled first-death
intervention, mirror2 was set to 1 solely to expose the optional arm. The fifth
live type-`$8D` slot then ended its slot-ordered sequence with `$23D794`,
`$23DEF2`, `$23DEF2`: body, turret, overlay, all bucket 0. This intervention is
valid for emitter address, bucket, order, and reachability, not natural
mirror2 timing or frequency.

The structural exporter now includes the final register stub `$23E08C`
through its RTS at `$23E0C0`; unrelated zoom code begins at `$23E0C2`. The
nearby W171 indirect-call audit found no other hardcoded indirect translation:
the heading, animation, remap, and shot-generator paths retain their exact
ROM-derived tables or direct callees.
