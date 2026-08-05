# 67 — IMPL T1: THE SHIP'S SIX-DEEP AFTERIMAGE TRAIL (`$253604`, BUCKET 12)

status: **IN PROGRESS**

started: 2026-08-05
wave: 67. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
`games/gradius/` NOT TOUCHED.

target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.

brief: port `$24A53E jsr $253604` — the ship's six-deep afterimage trail into
bucket 12, bucket 12's ONLY producer in the cartridge, unported. W55 §4.3 is the
source of every claim in the brief.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `55-diag-invisible-content.md`, `66-impl-E6-bomb-art.md`,
`58-impl-E3-art.md`, `HANDOVER.md`, `docs/knowledge/09`, `docs/knowledge/10`.

---

## 1. THE BRIEF'S PREMISE, CHECKED — right in KIND, wrong in three NUMBERS

The brief rests on `55-diag` §4.3. It holds where it matters — `$253604` is the
ship's afterimage trail, it is bucket 12's only producer, it needs no new art
and no gate here could see it — and **three of its specifics are wrong**, all
three in the same direction (reading `moveq #$5,D7` as the shape of the thing).

| the brief / W55 §4.3 says | `[M]` this session, from the cartridge |
|---|---|
| a **SIX**-deep trail, "up to six extra records per frame" | **FIVE.** `dbra` runs the body six times, but the sixth reads `tst.w D7` as 0, takes `$253680` — store-the-new-head — and `rts`es. It never reaches `$2536AA`. `[M]` measured: a 1,500-frame held-fire run's records-per-frame histogram is `{1:2, 2:1, 3:2, 4:48, 5:679}`. **Six never occurs** |
| "`$253660 moveq #$5,D7` <- SIX entries" / "its 6-entry ring" | the ring is **SIXTEEN** longs. `$253658 lea ($40,A1),A1` walks past `$40` bytes, the shift moves exactly 16 slots (1 + 5x3), and the initialiser `$2536B6` fills 16 (`moveq #$f,D0`). The five records are **taps at slots 15, 12, 9, 6 and 3** — the ship as it was 3, 6, 9, 12 and 15 calls ago |
| "`$2536AA` … BUCKET 12" and bucket 12 has ONE producer | **CONFIRMED, twice, and there is a SECOND STUB.** `xref.py callers 23FDB2` -> `$2536AA` only; `callers 253604` -> `$24A53E` only. And `$23FDE8` is a **second** enqueue on the same `$80AF24`/`$80AFEA` pair — the ZOOMING register convention — with **zero** absolute-long callers. `xref.py`'s own rule makes that a lower bound, so it is named, not declared dead |
| "**NO NEW ART IS NEEDED** — verify it" | **TRUE, and now measured rather than argued.** `[M]` the 3,597 records a 1,500-frame run emits ask for **17** distinct streams, `$001200 $001264 … $001840` in steps of `$64` — exactly `$25533A[0]`'s seventeen tilt frames, i.e. the ship's own image. `[M]` **0 named-missing, 0 pending, 3,597 of 3,597 DRAWN** |
| "`tst.b ($3f,A6)` gates it and I did not find the writer … the trail may only run in a state `fly-around` never entered" | **THE GATE IS THE LASER, and it is armed in ordinary play.** `$24C282 move.b #$1,($3f,A4)` sets it the frame the beam's arm-up completes; `$24C2D6 move.b D0,($3f,A4)` clears it on release. It is the same byte `src/player.js` reads at `$249B40` to switch the shot cadence machine off while a beam is up — the port has known this since W45 and called the field `P.dead`. `[M]` on the shipped seed with fire HELD it is set at **logic frame 17** |
| W55 §6: "the board draws ZERO colour-31 records" (in 161 captured frames) | **CONSISTENT, NOT CONTRADICTORY.** `$25364A move.w #$1f,D4` really does make the trail colour 31 — and `fly-around` never holds the fire button, so `($3f,A6)` is 0 on all 161 frames and the trail cannot have been in that capture. It is **not** the hitbox box of §6, which is 1x16 at `#$001F/$401F/$201F/$601F`; this is 3x32 at the ship's own offsets |

**AND ONE THING THE PORT ALREADY HAD AND NEVER READ.** The ring INITIALISER
`$2536B6`/`$2536D0` has been ported since W45 — `src/laser.js
seedPositionHistory`, called at `$24C288` on the frame the beam arms. So the
port has been filling two 16-long rings on every laser for twenty-two waves and
**nothing has ever read them.** That is the same shape as E6's finding one wave
earlier: state that was right, with no record ever emitted from it.

## 2. BEFORE AND AFTER — BUCKET 12

`[M]` 1,500 logic frames from the shipped seed, **fire HELD** (so `$24C282`
arms the gate) and the ship **sweeping left/right every 60 frames** (so the
`$FF80FF80` coarse-position test can ever be unequal — a stationary ship has no
trail at all, by `$25369C cmp.l D6,D5 / beq`). Probe: `.scratch/t1bucket12.mjs`,
reading `buildDisplayList`'s own `perBucketRecords[12]` and attributing the
`$800000` entries by the cumulative drain boundaries, fillers excluded.

| | BEFORE | AFTER |
|---|---|---|
| bucket 12 records **EMITTED** | **0** | **3,597** on 732 of 1,500 frames, first at frame 18 |
| **DRAWN** (the sheet has the picture) | 0 | **3,597** |
| PENDING on a shard | 0 | **0** |
| **NAMED-MISSING** | 0 | **0** |
| distinct streams | 0 | **17** (`$001200`..`$001840` step `$64`) |

732 of 1,500 is the `$80390C` 50 % duty (`$25368A`), the same one the aura and
the glow are on. The `{4:48, 3:2, 2:1, 1:2}` tail of the histogram is the
coarse-position skip firing as the ship decelerates at each sweep reversal.

**E6's DEFECT SHAPE IS EXPLICITLY EXCLUDED:** the count that moved is the
number of RECORDS IN `$800000`, not a counter in the port — and every one of
them resolved to a picture in the shipped sheet.

## LOG (appended as findings arrive)

- opened.
- §1 `[M]`: the premise holds in kind. **FIVE records, not six**; the ring is
  **SIXTEEN** deep with taps at 15/12/9/6/3; bucket 12 has a **second, uncalled
  stub** `$23FDE8`.
- §1 `[M]`: **THE GATE IS THE LASER** — `$24C282`/`$24C2D6`, `P.dead`. On the
  shipped seed with fire held it is set at logic frame **17**. W55's open
  question is closed and the trail is armed in ordinary play.
- §1 `[M]`: the ring INITIALISER was already ported (W45, `laser.js
  seedPositionHistory`) and **nothing had ever read the rings**.
- §2 `[M]`: **bucket 12 goes 0 -> 3,597 records, 3,597 DRAWN, 0 missing, 17
  distinct streams — all of them the ship's own `$25533A[0]` tilt frames.**
