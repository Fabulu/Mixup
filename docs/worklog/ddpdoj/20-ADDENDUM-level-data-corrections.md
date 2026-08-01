# ADDENDUM — the level-data recon landed late and corrects the plan

status: DONE (corrections recorded; the plan's §5 figures are superseded)
raised: 2026-08-02

The original `level-data` recon **died on an API 500** after writing only its file
header. The four siblings finished and the architect planned without it, so
`20-plan-level-and-patterns.md` §5 (the asset/sharding decision) was written from
partial evidence. A replacement recon has now delivered
`20-recon-level-data.md`. **Where the two disagree, the replacement wins** — it
measured, the plan estimated.

## What changes

| | plan §5 | measured |
|---|---|---|
| stage-1 background | 666 KB gz | **874.8 KiB gz** |
| all five stages | 2.86 MB | **3.58 MiB gz** |
| current bundle | 363.2 KiB | **407.9 KiB** (documented figure was wrong) |
| bundle once the recording is deleted | ~1.1 MB first paint | **1,023.9 KiB total** |
| shard scheme | per stage | **8 shards of 32 columns** |

**The sharding recommendation is better than the plan's, and it answers the
owner's "instant loading DoJ would be unreal" directly:**

- 8 column-shards: 110.5 / 102.1 / 66.1 / 77.8 / 97.7 / 76.3 / 119.6 / 0.4 KiB
- overhead **+865 B (0.13 %)**, because the shards are disjoint
- **boot needs only shards 0–1 = 212.6 KiB — LESS THAN THE PAGE LOADS TODAY**
- tightest later deadline is 119.6 KiB with 4.3 s of lead at 228 kbit/s; most
  shards have 12–42 s

So the whole stage can scroll live with a *smaller* first paint than the current
161-frame recording. The owner's approval of "~1.1 MB first paint" was given
against the worse number; the real plan is better and no re-approval is needed
for that direction.

## The structural finding, which is why the numbers are what they are

**The DaiOuJou background is a PAINTED STRIP, not a tilemap.** 88.4 % of stage-1
tiles are used in exactly one column, and stages 2–5 have a reuse factor of
exactly 1.00. That is why the data is large and why it compresses the way it
does — there is almost no repetition to exploit.

**Nothing is shared between stages**, and this was answered the right way: by
CONTENT HASH, not by tile number. Tile numbers are disjoint by construction and
prove nothing. 7,634 numbers hold 7,325 distinct pictures; cross-stage
intersections are 0 or 1 tile; **three duplicate pictures in the whole game**. So
the marginal cost of a later stage is its full cost — there is no cheap stage 2.

## It corrects a sibling recon

`20-recon-scroll-engine.md` §9.3 reported 24 stage-1 map columns as unreachable
by the scroll program. **The scroll VM is not the only writer of the BG map.**
Type `$1C`'s handler `$26C20C` paints 23×9 columns from a SECOND, SEPARATE
23-column map at `$227AF8` (828 B) — accounting for 23 of those 24.

Validated by tapping `$900000` across an 11,000-frame invulnerable run that
reached the boss lock (`$8130CE = $0344`): **573/573 ring columns matched, 224 of
248 stream columns proven, and 93,150 of 93,248 remaining writes explained
exactly by the second map.** Both gates red-validated by mutation.

**Note the provenance, per `docs/knowledge/09`: that was an INVULNERABLE run.**
It is being used for coverage — proving which writes exist — which is exactly
what such a run is valid for. It is not evidence about spawn timing or density.

## Still open

- Sprite cost for live enemies is NOT in the 1,023.9 KiB figure.
- Stages 2–5 were checked statically only, so their totals are **lower bounds** —
  they may have second maps too, as stage 1 does.
- What spawns type `$1C` is unknown.
- Column 247 (36 B) is unaccounted for.
