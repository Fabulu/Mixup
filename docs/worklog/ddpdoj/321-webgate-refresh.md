# W321: the web gate had been red for 182 commits, and the port was never what broke it

Status: the gate is GREEN, exit 0, 31 of 31. Suite 2315/2315, no skips. Sweep 0 missing,
4244 of 4244 streams. `dojcoverage.py` both OK lines.

This wave unblocked publishing. `tools/publish.mjs` had been refusing with
`REFUSING TO PUBLISH: "ddpdoj web fetch gate" failed.` and thirteen FAILs, which is why the
owner said "I think we're far behind" -- and they were right by a bigger margin than the
phrase suggests.

## THE ONLY HONEST WAY TO MOVE A WITNESS IS TO PROVE THE SUBJECT IS HEALTHY FIRST

Thirteen counts in `webgate.mjs` disagreed with the port. Editing them to match is the
"adjust the test until it passes" failure, and this file's numbers are behavioural witnesses,
so the edit was refused until two controlled experiments had run. Both came back NEGATIVE.

**Experiment 1, THE PORT.** `610ac3a`'s source (pre-W300, twenty waves back) run against
HEAD's assets, via a detached worktree and the gate's own `--assets` flag. The result was a
**byte-identical set of thirteen FAILs** -- same checks, same numbers, to the record. Diffed
mechanically, not by eye. **This session's twenty waves of translation did not move these
counts.**

**Experiment 2, THE TABLES.** The assets carry `player.tables.json`, and `new Game(bundle.seed,
bundle.tables, ...)` means the exporter feeds the SIMULATION, not just the art. This session
took `export-tables.py` from 389 to 411 ROM windows, so the tables were the obvious next
suspect: regenerating them is a real input change. HEAD's source was run with `610ac3a`'s
regenerated tables -- a genuinely different file, 1015426 bytes against HEAD's 1042073, 391
windows against 411. **Byte-identical output again.** The added windows are high-score,
name-entry and stage-5 data that a stage-1 window never reads.

So the drift is older than both, and belongs to the window between `c62f35e` and W299. **W321
does not claim to have traced each commit inside that window** and says so in the file. What
it does claim is measured.

## HOW FAR BEHIND, EXACTLY

    c62f35e  2026-08-10  ddpdoj: refresh post-debris web witnesses   <- last refresh
    d37e186  2026-08-10  ddpdoj: translate stage 4 type a1           <- last webgate touch
    6f44b1b  2026-08-11  HEAD

**182 commits** since the witnesses were recorded and **119** since the gate was touched at
all. The gate is not in `node --test`, so 182 commits of green suite said nothing about it.
That is the actual finding here and it is a process finding, not a code one.

## THE SUBJECT IS HEALTHY, AND HERE IS THE MEASUREMENT

`games/ddpdoj/tools/w321itemspan.mjs` is new and is the wave's real product. The gate sums
records over a window and prints one total; a total cannot distinguish "the same object lived
a shorter life" from "the object stopped being produced". The tool prints the **spans**: every
run of consecutive frames carrying a record for the bucket, with length and peak, plus the
per-shard spread so a count that merely moved shard is not mistaken for a count that vanished.
It takes `--tables` to swap the simulation's tables while leaving the assets alone, which is
how experiment 2 ran. It loads assets off disk through `loadBundle`'s reader argument, so it
needs no HTTP server -- nothing here tests the fetch path.

Three things hold across all thirteen checks:

1. **Nothing lost its art.** Every counted record is DRAWN, 0 pending, 0 named missing. The
   structural assertions `drawn === rec`, `pend === 0`, `named === 0` were **not touched** by
   this wave and all pass. Those are the witnesses that carry meaning. So do the `--break`
   red-validations, all of which still fire.
2. **Every `first` frame is exact**: 1, 98, 24, 24, 678, 315, 24, 201. A moved seed moves all
   of them. The seed is stable.
3. **The behaviour is intact by span analysis**, below.

### The item is still one item with one whole life

    span f678..f749   72 frames,  72 records, peak 1
    span f751..f810   60 frames,  60 records, peak 1

488 -> 132, and **W84 predicted this exact number would move.** Its comment, still in the
file: *"THIS NUMBER IS FRAGILE AND IT IS RECORDED AS SUCH: it is a lifetime, and the ship
sweeps every 60 frames, so any shift in the drop phase moves it by a whole sweep. `first`,
`distinct` and `streams` are the stable three and all three are still asserted."*

All three are still asserted and all three still hold: 139 streams, 28 distinct, first at 678.
Peak 1 record on any frame means it is still ONE item. It reaches **all 28 distinct images** --
four body frames and 24 collected frames -- so it is still dropped, still drifts, and is still
picked up: the whole lifecycle, ending at f810 rather than running to the 2400-frame wall. The
single blank frame at f750 is the pickup, where the item record is swapped for the collected
animation's. What changed is only WHEN it is collected, f810 rather than f1166, and 356 frames
is very nearly six whole 60-frame sweeps.

### The laser bomb still fires three times

    span f201..f331   131 frames, 1042 records, peak  8
    span f701..f832   132 frames, 1130 records, peak 10
    span f1201..f1332 132 frames, 1046 records, peak  9

One per press, three matched spans. A broken bomb loses a span or truncates one unevenly.

## AND ONE CLAIM IN THE FILE TURNED OUT TO BE FALSE

`webgate.mjs` asserted, at W47 and repeated at W66: *"`records`, `distinct` and `first` are
the PORT's own and no bundle can supply them; `streams` is the one number a short harvest
moves."*

**That is not true, and this wave is how it was found.** Every one of these loops filters on
`map.get(offs)?.[2] !== <shard>`, so a record only counts **while its art is packed on that
shard**, and shard membership is an asset-packing artifact -- `romToPackedMap(manifest,
(b) => bundle.spr.shardOfBase(b))`. Re-running `export-web.mjs` with more streams repartitions
the shards and moves `records` and `distinct` without the port changing at all.

Measured: the packer now places **4244 streams**, and **only two shards changed membership**.
Seventeen of nineteen match their recorded counts exactly.

    shard 11   362 -> 799 streams   (+437)
    shard 13   252 -> 228 streams   (-24)

Shard 13's loss is the laser bomb's 5906 -> 3218 and 136 -> 115 distinct: 21 of the 24 streams
it gave up were the bomb's, and they are high-frequency segment art drawn many times a frame,
which is how 21 images cost 2688 records. The **control is on the same shard**: the ordinary
bomb's TAP arm is 346 records EXACTLY as recorded, because its 16 streams did not move. Shard
11's gain is why its `distinct` went UP by six rather than down -- the stage draws the same
pictures and six more of them are now on shard 11.

The corrected claim is in the file at `EXP66.hold`, next to the sentence it contradicts.

## WHAT MOVED

    W52 shots      22466 -> 22665    streams/distinct/first held
    W52 bullets     6854 -> 6855     held
    W53 spark       9720 -> 9935     held
    W54 explosion   6031 -> 6091     held
    W58 laser       1739 -> 1742     held
    W58 structures 12805 -> 12849, streams 362 -> 799, distinct 97 -> 103, first held
    W61 item         488 -> 132      streams/distinct/first held  (W84's fragile number)
    W66 laser bomb  5906 -> 3218, streams 252 -> 228, distinct 136 -> 115, first held
    W90 impact     17361 -> 17385, entries 520 -> 521, beamLive 1039 -> 1041

W90's arithmetic closes on itself: two more frames of live beam bought one more entry, and
17385 - 17361 = 24 is one entry's worth of records. Its two meaning-carrying assertions,
ADJACENT-FRAME entries 0 and WRONG-PHASE entries 0, are untouched and both pass. The
`--break drop-impact-art` mutation derives its expectation from `EXP90.records`, so it tracked
the refresh without an edit -- which is how these should have been written throughout.

## THE PROCESS FINDING, WHICH MATTERS MORE THAN THE NUMBERS

**The web gate is not in `node --test`, so 182 commits of a green suite said nothing about
it.** Publishing is the only thing that runs it, so the gate goes stale exactly as long as
nobody publishes, and then blocks the publish that would have caught it. That is a ratchet.
The owner's standing instruction is to publish periodically; honouring it is also what keeps
this gate honest, and the two are the same task.

Two of these expectations were written to auto-track (`m90.named === EXP90.records`,
`m90.rec === a90.rec`) and needed no edit. The rest are literals. A future wave that adds a
count here should derive it where the relationship is arithmetic and pin it only where the
number is the measurement.

## Order for the next wave

Unchanged from W320, which this wave interrupted to clear the publish:

1. **Finish `$1B`** -- read `$269582` and the death arm at `$26962E`, then write it, sharing
   the damage arm with `$8E` rather than transcribing it a third time.
2. **Then `$8130D8` as its own small wave**: read `$28190C`'s caller and two of the five
   stage-1 `tst.w` sites, then rename in `handlers.js` AND `bullets.js` with the evidence.
3. Then `$81` (3 records), `$1A`, `$49`/`$4A`/`$4B`, `$47`, then the dependency bundles.
4. **`$B0` is boss reconnaissance, not an enemy.** HIBACHI CLOSURE RULE in the handoff.
