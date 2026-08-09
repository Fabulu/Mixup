# W173: Stage-2 type `$84`

Status: COMPLETE, NOT DEPLOYED

## Result

Stage-2 type `$84` is ported through its next honest chronological boundary.
The dependency closure is:

- run-length stub `$27514C..$275154`
- init body `$275154..$275216`
- five palette pairs `$275218..$275222`
- 14-word record prototype `$275222..$27523E`
- two 28-byte sub-record prototypes `$27523E..$275276`
- four-record threshold cue script `$275276..$2752B0`
- handler `$2752B0..$2757C2`
- handler tables `$2757CA..$275812`, bounded by the next init stub
- movement `$2331F4..$233218` for `$232820`, and `$234188..$2341B8` for `$232880`

The init copies both long sub-records, preserves the loader-returned `$275276`
cue cursor in record `+$44`, and installs the ROM palette, timing, HP, sprite,
and movement fields. The handler preserves movement, coupled secondary-position
updates, on-screen lifetime, damage and palette flash, four-frame body
animation, the four-state opening/firing/closing machine, both bullet
generators, score `$162`, sound `$28C2DC`, five ported death effects, and the
exact two `$289B22` plus seven `$27F8FA` shared-effect calls as named notes.

The normal draw is five direct bucket-0 calls in ROM order:

`$23DECE, $23D762, $23DECE, $23DECE, $23DECE`

They draw the animated attachment, body `$17D994`, and fixed streams `$17DB98`,
`$17DE10`, `$17DDCC`. The four-pointer body animation table is
`$2757CA -> $17DE54,$17DED8,$17DF5C,$17DFE0`. The eleven phase words, three
muzzle words, and seven death vectors are statically pinned through the next
stub at `$275812`.

## Cue-pool closure

`$275494` calls `$28AC72` on every live handler pass, so the cue producer and
the type-5 call-3 consumer are inseparable from type `$84`. W173 ports the
bounded live family instead of counting it:

- pool `$81DB90`, 10 slots of `$26` bytes
- live count `$81DD0C`, stagger `$81DD0E`
- threshold spawner `$28AC72..$28AD50`
- sub-record reaper `$28AD54..$28AD6E` falling directly into the cue driver
- driver `$28AD70..$28AF6A`
- descriptor dispatch `$28AFD4`, with type-`$84` live kinds 0, 4, and 8
- six-entry emitter table `$28AF6C`
- kind-0/4/8 art tables `$28B032`, `$28B050`, `$28B06E`, with 4/4/8 entries

The four thresholds are `$1F72,$18B5,$11F8,$0B3B`, followed by `$FFFF`.
Their scripts produce descriptor chains 0,4,8 and 0,4. Allocation, full-pool
cursor advancement, parent validity, global kill, countdown, replace-in-place
descriptor chaining, animation phase, position following, and emitter dispatch
are translated from ROM.

When the next script word is `$FFFF`, `$28ACE8` sets low-byte bit 7 in the new
descriptor. `$28ADAC` then holds that terminal descriptor and keeps drawing it
until the parent or global kill gate frees the cue; the terminator does not free
the cue immediately.

Two layout traps are now explicit. `$28ADAC tst.b D2` reads the low byte of the
flags word, while memory `btst` sites read its high byte. Also, descriptor word
`+$08` is copied to cue `+$1C`, script starts at cue `+$1E`, and the descriptor
timer long from descriptor `+$0A` starts at cue `+$22`; its low word is the art
phase at cue `+$24`.

The first two thresholds naturally use emitter byte offset `$14`, resolving
through the ROM table to `$23D852`, bucket 7. The port resolves the live word on
every frame rather than hardcoding it. Kind-0 art shares the already closed
laser-impact chain `$22C59C..$22C6BC`, so it remains in sprite shard 10. Kinds 4
and 8 and the body family are added to shard 17. This preserves existing shard
ownership and keeps the W58 laser gate byte-for-byte green.

## Occurrences, coverage, and frontier

The ROM stage-2 script contains exactly two type-`$84` records:

- `$232820`, clock `$0054`, movement index `$005`
- `$232880`, clock `$006C`, movement index `$09F`

The controlled port boot consumes 96 records, with 92 allocations and four
authentic declines, then stops loudly at:

- record `$2328D0`
- clock `$0085`
- type `$90`
- init body `$27980A`
- handler `$279898`
- movement index `$037`, stream `$233670..$233676`

W167 reusable coverage is now 33/256 enemy types and 312/332 stage-2 script
records. The config contains the remaining 20 records in exact chronological
order, re-derived from the live registries, ROM script, aux table, and movement
resource on every gate run. Dynamic-minus-static remains zero.

## Controlled board attempt

One bounded MAME attempt was run as required: `w173-type84`, 13,720 logic
frames and 13,772 video frames, with the existing labelled auto-fire from logic
frame 1,250. It completed in 90 seconds with `fails=0` but reached only stage-1
handlers. The 4,602,800-byte TSV contains no `X84` row. Per the cap, it was not
retried.

`tools/w173-stage2-type84-evidence.json` records this negative result and keeps
the two static occurrences separate from the empty observed set. Lifecycle,
emission, firing, death, and cue behavior are ROM/static plus port-unit
verified in this wave, not claimed as controlled-board observations.

## Checks capable of failing

- Hardcoding the cue emitter byte offset to `$14` made W173/4b red when the
  fixture changed it to `$04`; restoring the ROM-table lookup re-greened it.
- `dojcoverage.py --break-coverage` removed a registry token and went red.
- `dojcoverage.py --break-stage2-spawn-inventory` injected `$2325C8` outside
  static inventory and went red.
- The ROM exporter pins init/body/handler boundaries, direct-call closure,
  absence of type-`$84` indirect calls, art and data tables, both occurrences,
  type-`$90` frontier, cue pool/cursor ownership, the reaper fall-through,
  descriptor dispatch, emitter table, and kind-0/4/8 art.

## Verification

- Focused W133/W167/W169/W173/init/handler/integration tests: 49 passed, zero
  failed, zero skipped.
- Full DOJ suite: 1,468 passed, zero failed, zero skipped.
- `npm run typecheck`: passed.
- `export-tables.py --verify`: passed, 230 ROM windows, 266,478 bytes.
- `dojcoverage.py`: green, coverage and inventory regressions restored.
- `bosscoverage.py`: unchanged at 103/111, zero live-unported, eight DEAD.
- `export-web.mjs`: passed; 2,670 streams across 18 shards.
- `bundlegate.mjs`: 15,955,968/15,955,968 pixels, 100.0000 percent.
- `webgate.mjs`: all stages passed.
- `node tools/publish.mjs --only ddpdoj --dry`: passed, build
  `20260809052609`; no deployment.
- `git diff --check`: passed.

The three owner `c1_*.py` files remain untracked and untouched. No sound,
replay, hyper, bee, Gradius, or `$29540C` behavior changed.
