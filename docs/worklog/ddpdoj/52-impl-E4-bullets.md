# 52 — IMPL E4: the player's shots and the enemy bullets, VISIBLE

status: IN PROGRESS
started: 2026-08-05
role: IMPLEMENTER. SOLE writer to `games/ddpdoj/`. `games/gradius/` NOT TOUCHED.
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.
brief: the owner is playing the live build — "Shooting enemies with bullets
works, but you can't see the bullets and no explosions." The explosions are E5.
**Mine is that nothing draws the shot itself, or the enemy bullet.**
inputs read in full: 43-plan §4 E4, 40-recon, 44-impl-E1, 47-impl-E2,
50-recon-effects, 51-impl-L3, HANDOVER, `docs/knowledge/09` and `10`,
`26-review.md` F1–F4.

`[M]` = measured by me, this session, on this tree.

---

## 0. THE BRIEF'S PREMISE — TWO OF ITS THREE NUMBERS ARE WRONG, BOTH LOW

The brief's *shape* is exactly right: the shots and the bullets go down the same
emission path, nothing draws them, and E2's harvest-by-address + shard machinery
is the answer. Its **sizes** are a floor, and one of them by a factor of seven.

### 0.1 "bucket 14, nine streams, 2,184 bytes raw" — [M] it is **71 streams**

Recon 40 §5 measured the shots under `--no-pods` with a tap every four frames,
on a tree where any fire press threw `$24C180`. W45 and L3 removed that throw,
so **the OPTION PODS now fire too** — and they are a second shot producer
(`$24D480`, `src/options.js podShotSpawn`), writing type-`$8002` records into the
same 36-slot table `$810572`, dispatch entry [2] `$253E34`.

```
[M] 1,200 logic frames from the shipped seed, fire tapped every 4 frames:
      bucket 14 = 21,691 records, max 20 per frame   (recon 40: max 10)
      20 DISTINCT streams live in $810572, and ZERO of them are in the sheet
      -- and 11 of the 20 are in NEITHER of recon 40's nine
[M] the same run with fire HELD: 360 bucket-14 records, max 12 -- holding the
      button charges the beam and the ordinary cadence nearly stops
[M] nothing pressed: 0
```

**[M] ENUMERATED FROM THE CARTRIDGE, following the chain `src/shots.js` and
`src/options.js` walk: 71 distinct shot streams, 10.5 KiB gz.** Not nine, and
not 2,184 bytes. The chain, with what pins each end:

| producer | pointer table | entries harvested | why that many |
|---|---|---:|---|
| ship primary | `$2554EA[0]` → `$255532` | 5 | `$249C48` indexes by ($20,A6)\*2, and ($20,A6) is the power 0,2,4,6,8 |
| ship secondary | `$255502[0]` → `$255546` | 5 | `$249C92`, same index |
| pod 0 | `$24D2FC[0]` → `$24D30C` | 5 | `$24D4F8`, same index |
| pod 1 | `$24D35C[0]` → `$24D36C` | 5 | `$24D4FC`, same index |

and per 38-byte template three chains, each with its own extent:

* the SPAWN's own descriptor — `$24A238 move.l (A2,D0.w),(A0)+` / `$24D548`,
  D0 = the player's ($42,A6) or the pod's ($52/$54,A6), which cycle **8,4,0** →
  3 longs;
* the per-frame animation — ($1e,A6) indexed by ($24,A6), which counts DOWN by
  4 and reloads to 4 on borrow (`$253BC6`), so **0..(what the spawn installed)**:
  {0,4} for the ship, {0,4,8} for the pods;
* the HIT re-point — `$253C76`'s `$24DEB2[tableIdx]` (nibble 0/8) or
  `$253F34`'s `$25014C[tableIdx]` (nibble 2/10). The block's
  `move.l (A0)+,$22(A6)` is a LONG whose **LOW word is the index the hit
  animation starts at**, counting down to 0: [M] 16 for the ship, 28 for the pods.

**[M] All 20 measured streams are inside the 71.** Measurement proves presence;
the enumeration bounds absence.

**DELIBERATELY NOT HARVESTED, named rather than omitted:** the `+4` LASER arm of
all four tables (`$25556E`, `$255582`, `$24D334`, `$24D394`). [M] Their templates
carry type words `$8004` / `$8006` = shot dispatch entries [4] and [6], and
`src/shots.js` throws `$254078` for [4] and has no [6] at all. Harvesting art for
a handler that does not exist is E2's `$268594` all over again — and the exporter
now **asserts they stay unported**, so the day `$254078` lands the export stops
and says so rather than leaving the laser's shots a silent named skip (§4.3).

### 0.2 "the impact pool `$27F95A` is E4's" — [M] IT IS NOT, AND IT IS NOT MINE

Recon 50 assigns me `$27F95A` because "its callers are the bullet block's". [M]
The callers are `$281D2E` (the screen clear) and `$281E3A` (the mover's
global-kill), so the *reference* is right. **The conclusion is not**, for the
reason L3 §3.1 already wrote down and this wave re-checked:

* `$27F8F8` is the ALLOCATOR over the impact pool `$8171BE` (70 × `$2C`);
* its only DRIVER is `$27F95A`, type-5 call #4, unported;
* allocating without the driver consumes all 70 slots and then fails silently
  forever — W33's leak one level down, which is recon 50's own warning.

**THIS WAVE ALLOCATES FROM NO POOL, AND HERE IS THE DRAIN PROOF.** It writes into
two buffers that already exist and are already sized by the board — `$809C4C`
(bucket 23's staging buffer, which IS the mover's A4) and `$809274 + $80AFE0`
(bucket 22's, the trail cursor). Both are **DRAINED EVERY FRAME by call #4**,
`$23D2AE`, which sums the thirty counters, emits the records and clears all
thirty (`src/displaylist.js`).

```
[M] buckets 22 and 23 are 2,520 bytes each = 210 records of 12
    -- and the bullet pool is 210 slots. The board sized the buffer at exactly
       the pool's own capacity, so the bulk writer cannot overflow it.
[M] 1,200 frames from the shipped seed: $80AFE2 reads 0 after call #4 on
    1,200 of 1,200 frames. It drains COMPLETELY, every frame.
[M] the peak WITHIN a frame (buildDisplayList's own telemetry) is 65 records
    = 780 B of the 2,520.
```

No allocator is called; `$27F8F8` stays the counted note L3 made it. Porting
`$27F95A` is E5/E7's, with its driver, or not at all.

### 0.3 What the brief is right about

* the shots and the bullets are the SAME path — buckets 14, 22 and 23 of the
  same thirty, drained by the same call #4, into the same `$800000` list;
* the art is the real cost — [M] 369 new streams, 26.0 KiB gz, against ~40 lines
  of sink;
* E2's machinery is the answer and it needed no new mechanism.

---

## 1. THE BULLETS: [M] BUCKETS 22 AND 23 WERE EMPTY, MEASURED

```
[M] 1,200 frames, nothing pressed:  bucket 22 = 0,  bucket 23 = 0
[M] 1,200 frames, fire tapped:      bucket 22 = 0,  bucket 23 = 0
[M] and the pool is BUSY the whole time: 14,172 live bullet record-frames with
    nothing pressed, 68 distinct descriptors, first at lf+40 = +0.7 s
```

`src/mover.js spriteEmit` opened `if (!ctx.sprites) return;` and
`src/bulletdriver.js` passed no sink, so the board's own bulk writer ran and
wrote both counters from cursors that never moved.

**[M] ENUMERATED FROM THE CARTRIDGE AND FROM THE PORT'S OWN TRANSCRIPTION (every
line of which cites its ROM address): 213 distinct bullet streams**, from six
sources — `$281956[k]+6` (39 templates), `$283D4C` (32 × 12 B), 31 `setU32(base
+$0a, imm)` immediates, 20 `animateRenderOffsWrap` runs, the `$283C4C` dir tables
`$282714`/`$2830EA` and the `$2822EC` dir rings `$2821FA`/`$282C8E`, and
`$283704`.

**AND THAT ENUMERATION IS NOT WHAT SHIPS.** It is what the ranges were CUT from.
[M] Walking the mask ROM's own stream chain across the four ranges those 213 live
in gives **306 streams and contains all 213**, and the walk is what ships:

| range | streams | pinned by |
|---|---:|---|
| `$1BF58C`..`$1C0E9C` | 228 | bottom `$282118 move.l #$1BF58C`; top `$282E4A cmpi.l #$1C0E9C`, the highest wrap limit in the family — **and the cartridge's chain closes EXACTLY on it** |
| `$1C1418`..`$1C143C` | 1 | kind 1's `$281FDC` immediate, alone |
| `$1C1658`..`$1C167C` | 1 | kind 1's `$281FC4` immediate, alone |
| `$1C1B68`..`$1C23D8` | 76 | the bouncers' `$282F80 #$1C1B68` and the tracker's `$282D46 #$1C1E38`; the chain closes exactly on `$1C23D8`, whose stride is **6,276 words against the 20 of every bullet before it** — 313× — i.e. a different subject |

The reason is `46-diag`'s lesson about the tank hulls, applied one level up: **an
animation ring sized off a reading is how you ship a quarter of the art.** The
chain cannot be read wrong — `streamExtent` solves each stream's stride out of
the cartridge — and the walk must END EXACTLY on the stated address or the build
stops. [M] That check was seen to fail (§4.3).

### 1.1 **`26-review` F2 IS NOT LATENT — AND THERE ARE THREE OF THEM, NOT TWO**

The plan asks for `26-review` F1 and F2 to be fixed in the same change because
both are latent only while no sink exists. Both are fixed here **from the
listing**, and the sink found a THIRD of the same family that no review had.

| # | ROM | the defect | how it was found |
|---|---|---|---|
| F1 | `$28428E`/`$284292` | the port added word@+$6 to posB and word@+$8 to posA — **the two axes swapped** | `26-review`, re-derived here from `swap D0 / add.w (A1)+,D0` |
| F2 | `$282B7A` | kind 19 stepped `+$24` past the wrap `cmpi.l #$1C1E38 / move.l #$1C1BF8` | **[M] MEASURED, not latent:** with the sink on, the port emits `$1C1E5C`, `$1C1E80` and `$1C1EA4` — three descriptors that are **not stream starts in the cartridge's own chain and are in no ROM animation table**, i.e. the port reading off the end of the ring |
| **NEW** | `$282748` | kind 7's ring is bounded by the LIMIT at +$10 and the SPAN at +$14 (`cmp.l (A0)+,D0 / sub.l (A0),D0`) and reloads the delay byte `+$19 := +$18` (`$282758 move.b (A0)+,(A0)+`). The port did a bare `+$24` and neither of the other two | **[M] the sink found it, on its first run**: kind 7 emitted **2,478 records over 66 descriptors from `$1C0158` to `$1C0B9C`**, none of them a stream start, i.e. up to sixty frames off the end of a THREE-frame ring |

The third one is exactly kind 26's `$283128`, which this file already
transcribed correctly — so the port contained both readings of the same
instruction sequence and only one of them was right.

### 1.2 What the sink also reached, and what it did NOT

**`epilogueSprite283C0E` was gated `if (ctx.sprites)`, so `$283C38`'s read of
`$282714` had never executed in this port.** The first sink run stopped at
`UNPORTED $282718` — a loud named throw, correct behaviour, at step 1,417. Sized
exactly like the two windows beside it (`$2830EA+$24`, `$2822EC`): the `$283C4C`
offsets top out at `$20` and the read is a longword, so the extent is `$24`, and
`$282714 + $24 = $282738` is kind 7's own continuation — an abutting bound.
Added to `tools/export-tables.py` with that reasoning.

**[M] BUCKET 22 IS STILL 0** over every run this wave made, and that is presence,
not absence: the trail block is kinds 27/36/37/38's, none of which spawns in
stage 1's opening. The code is ported and unit-tested; nothing in this corpus
reaches it. Said plainly rather than reported as coverage.

---

## 2. WHAT WAS PORTED / CHANGED

| ROM | what | where |
|---|---|---|
| `$284286` (= the inline `$281E96`) | the 12-byte sprite emit to (A4)+, F1 fixed | `mover.js spriteEmit` |
| `$283194..$2831A6` | the TRAIL block, including the **permanent A4 rewind** | `mover.js trailEmit` |
| `$282B74..$282B86` | kind 19's wrap (F2) | `mover.js` |
| `$282748..$282758` | kind 7's bounded ring + delay reload (the new one) | `mover.js` |
| `$281D9E`/`$281DCE`/`$281DD6` | A4 is a real address; both counters are real pointer differences | `bulletdriver.js` |
| `$282714` | kind 7's dir-indexed frame table, `+$24` | `export-tables.py` |
| `$2554EA`/`$255502`/`$24D2FC`/`$24D35C` | the shot art harvest, 71 streams | `export-web.mjs` |
| 4 chain ranges | the bullet art harvest, 306 streams | `export-web.mjs` |

### 2.1 THE TRAIL BLOCK IS A MOVE, NOT A COPY, AND THAT IS THE WHOLE INSTRUCTION

```
283194: lea (-$c,A4),A4          <-- A4 REWINDS, and NOTHING restores it
283198: movea.l $81B41C,A0
28319e: movea.l A4,A2
2831a0: move.l (A2)+,(A0)+  x3
2831a6: move.l A0,$81B41C
```

Nothing between here and `lea $40(A6),A6` puts A4 back, so the next slot's emit
overwrites those twelve bytes: **the record is MOVED from bucket 23 to bucket
22.** A port that "copied" would give every trailing bullet two display-list
records. Red-validated as M6.

### 2.2 THE DELIVERY: TWO DEFERRED SHARDS, AND BOOT WENT **DOWN**

```
[M] BOOT BEFORE  473.7 KiB   (export-web.mjs's own figure, this tree)
[M] BOOT AFTER   473.2 KiB   -- 0.5 KiB SMALLER
[M] deferred     719.4 -> 745.4 KiB   (the 26.0 KiB of new art)
    shard 6 shots    71 streams  mask 2,828 + col  7,896 = 10.5 KiB
    shard 7 bullets 298 streams  mask 3,591 + col 12,283 = 15.5 KiB
```

Boot fell while 369 streams were added, and the whole of it is one decision:

* **the stream table is PLANAR AND DELTA-CODED.** 747 triples sorted by packed
  base: column 1 is strictly increasing and column 0 nearly so, but interleaved
  gzip sees `rom, base, words, rom, base, words…` and can exploit neither.
  [M] **interleaved 4,152 B · planes without delta 4,502 B · PLANES + DELTA
  500 B.** Column 2 (maskWords) is deliberately NOT differenced — small,
  unordered, and differencing makes it bigger. `spr.streamsFormat` names the
  encoding, and the loader refuses any other **by name**, because a wrong stream
  table draws the wrong picture and never throws.
* `manifest.json` grew 8,683 → 9,820 B for the two shard entries and the fetch
  order; the harvest ledger keeps only the numbers, the prose stays in
  `export-web.mjs` (W47's own rule).

**SHARD 0 IS UNTOUCHED and remains the only boot shard**, so `capture.bin` is
byte-identical and `bundlegate`'s pixel identity cannot have moved — verified,
§4.4.

### 2.3 THE FETCH ORDER IS PUBLISHED NOW, BECAUSE INDEX ORDER STOPPED BEING NEED ORDER

`ShardQueue.prefetchAll`'s comment said "in ascending (i.e. need) order". [M]
That stopped being true this wave: the enemy bullets want art at **+0.7 s** and
the shots on the **first frame the button is held**, against sprite shard 1's
+7.7 s and shard 5's +103 s. The exporter now publishes `shards[i].order`
(`SPR_ORDER = [0, 7, 6, 1, 2, 3, 4, 5]`) and the queue reads it; a meta entry
without one falls back to its index, which is what every background shard still
does. `demand()` still promotes to the head, so the SIMULATION can always
overrule the schedule.

---

## 3. THE RESULT, AS MEASUREMENTS

### 3.1 Emitted vs drawn vs NAMED-missing, over a run

[M] From the shipped seed, `$810424 = $FF` each step, fire TAPPED every 4 frames,
through the page's own `portSpriteList` and the page's own map, to the run's
honest end — a **loud named throw at `$26C1C4` on step 2,204**, which is L3
§3.2's enemy-layer export frontier and not this wave's:

```
                         BEFORE (this tree, W51)      AFTER
[M] bucket 14 records           25,631                25,631
[M]   ...distinct streams           20                    20
[M]   ...with art                    0                    20      <- 0 -> ALL
[M] bucket 23 records                0                 7,465      <- the sink
[M] bucket 22 records                0                     0      (§1.2)
[M] bullet descriptors, distinct   153                    65
[M]   ...with art                   87                    65      <- 0 MISSING
```

The bullet descriptor count FALLING from 153 to 65 is the two ring fixes: 88 of
the 153 were the port walking off the end of kind 7's and kind 19's animations.

And over the 300-step no-input window `webgate` pins:

```
[M] 18,893 display-list records (was 16,457), 20..82 per frame (was 20..69)
[M] 0 with NO ART ANYWHERE
[M] 14 skipped as IN FLIGHT, from step 59, on shard 7 -- named, never black
[M] bucket 23: 2,432 records (it was 0 on every frame of every run before)
```

### 3.2 Coverage — streams, records and table entries, never frames

* **shot art: 71 of 71 harvested streams are exported and resolvable; [M] 20 of
  the 71 are REACHED** in a 1,200-frame tapped window from this seed (one
  formation, one power level, and some chains need a hit). 20 of 20 draw.
* **bullet art: 306 of 306 harvested streams exported; [M] 32 of the 306 are
  REACHED** in the same window, 65 over the longer 2,204-step one. All draw.
* **`$281956`'s 39 kinds:** unchanged by this wave — the sink is downstream of
  the dispatch. The 32 unported behaviour INITIALISERS still throw by address.
* **the four bullet ranges: 4 of 4 close exactly on their stated end.**
* **the four shot template tables: 4 of 4 walked, 20 of 20 templates admitted;
  4 of 4 laser arms REFUSED and asserted to stay refused.**
* **unit tests 618 → 635, 0 skipped.**

---

## 4. EVERY CHECK SEEN TO FAIL

### 4.1 Twenty unit mutants, twenty named reds, no survivors

`node games/ddpdoj/.scratch/mutate52.mjs`: apply ONE edit, run ONE test file,
require a NAMED test red, restore, **verify the file's sha256 is byte-identical**
(the harness throws on a mismatch). Every restore matched.

| # | mutation | the NAMED test that went red |
|---|---|---|
| M1 | `$28428E`/`$284292` pair the halves the other way (= F1) | `$284286 adds the +$6 half to posA…` |
| M2 | `$2842A4` the descriptor is not written | same |
| M3 | `$2842A8` reads the attribute from +$1E | same |
| M4 | the emit does not advance A4 | `…write TWELVE bytes and advance A4 by twelve` |
| M5 | the emit runs with no sink | `a caller with no spriteOut writes nothing at all` |
| M6 | `$283194` COPIES instead of moving | `$283194 lea (-$c,A4),A4 REWINDS A4` |
| M7 | `$2831A6` does not advance the trail cursor | same |
| M8 | `$282B7A` steps past kind 19's wrap (= F2) | `$282B7A wraps kind 19 at $1C1E38…` |
| M9 | `$282752` subtracts the LIMIT, not the SPAN | `$282748 bounds kind 7 by the limit…` |
| M10 | `$282758`'s delay reload dropped | same |
| M11 | `$281D9E` passes no cursor (the pre-W52 tree) | `$281DCE/$281DD6 set both counters…` |
| M12 | `$281DB2` does not read `$80AFE0` back | `bucket 22 APPENDS…` |
| M13 | the loader accepts any stream-table format | `the stream table is PLANAR and DELTA-coded…` |
| M14 | the delta accumulator drops its `>>> 0` | same |
| M15 | `prefetchAll` back to index order | `ShardQueue.prefetchAll reads the published order` |
| M16 | an unported nibble no longer stops the harvest | `the shot harvest REFUSES a template…` |
| M17 | a range stepping OVER its end is accepted | `every bullet range must close EXACTLY…` |
| M18 | the shots folded into the BOOT shard | `the two weapon shards are DEFERRED…` |
| M19 | the fetch order back to index order | same |
| M20 | the pod ring sized off the SHIP's two frames | `the shot harvest walks the four template tables` |

**20 of 20 red, 0 survivors.** Three of them (M1, M5, M6) were SKIPPED on the
first pass with "pattern absent" — `src/mover.js` is one of this tree's 28 CRLF
files (`HANDOVER` §10) and a multi-line anchor written with `\n` matches nothing.
A skipped mutant is not a passed one; the harness now converts.

### 4.2 The gate's own W44 stage moved, and it is re-stated rather than nudged

`webgate`'s W44 stage went RED on the first run after the sink landed: **18,893
records against its hard-coded 16,457**, and 14 `skipped`. Both are correct
consequences and neither is a loosening:

* the record count moved because bucket 23 emits. It is not absorbed into the
  total — the stage now also asserts **bucket 23 = 2,432 records** as its own
  absolute number, which was 0 on every frame of every run before this wave.
* `skipped === 0` is split into `missing === 0` AND `pending === 14 on shard 7
  from step 59`. Collapsing the two would let a bundle that has LOST a picture
  pass as one that is merely still loading it.

### 4.3 The exporter's own checks, seen red against the cartridge

A unit test can only read the exporter's SOURCE. These run the real export
against the real ROM; `export-web.mjs` was hashed byte-identical after each.

| mutation | what the export printed |
|---|---|
| bullet range A ends `$1C0E90` instead of `$1C0E9C` | `Error: bullet range $1bf58c: the cartridge's stream chain steps from $1c0e78 OVER $1c0e90 to $1c0e9c. This file's end address is not a stream boundary…` |
| the shot walk takes `[+4]`, the LASER arm | `Error: shot template $24e8bc (from $2554ea[0], power 0) carries type word $8004, i.e. $253ADE dispatch nibble 4. src/shots.js ports nibbles 0, 2, 8 and 10 only…` |

**AND ONE MUTATION THAT DID *NOT* GO RED, RECORDED RATHER THAN HIDDEN.** Ending
range D at `$1C23C4` instead of `$1C23D8` exports 305 streams instead of 306 and
**passes**, because `$1C23C4` is also a stream boundary. The `a !== endsAt` check
catches an end that is not on the chain; it cannot catch an end that is on the
chain in the wrong place. That second half is pinned by evidence, not by the
check: the stride at `$1C23D8` is **6,276 words against the 20 of every stream
before it**. Category (a) of the brief's three — a defective check — and it is
named here because the next person to move that constant deserves to know the
export will not stop them.

### 4.4 `bundlegate` and the ROM-leak guard, both untouched

```
node tools/bundlegate.mjs --assets assets --dump rip/pix-demo --tsv .../demo.tsv
PASS: the PUBLISHED BUNDLE renders 15955968/15955968 = 100.0000% identical to
      MAME over 159 frames                                <- UNMOVED

node tools/build-dist.mjs
rom-leak guard: 225 files checked (31 also checked decompressed) against 12
ROM(s) -- clean, 4 deliberate exception(s)                 <- UNCHANGED
```

**`PUBLISH_VERBATIM` is still W47's four entries and this wave added none.**
Shard 6's streams are scattered across five ROM runs and shard 7's colour data is
not a single contiguous run, so neither packed body matches the cartridge
verbatim. That is luck about packing order, not virtue, and it is stated as such.

---

## 5. THE PAGE, IN A REAL BROWSER — WHAT I SAW [M]

Chrome + Python `playwright` over `python -m http.server`, the recipe W42
established. Nothing downloaded. **The server was killed afterwards and [M] zero
`python -m http.server` processes remain.**

### 5.1 **THE SHOTS AND THE BULLETS ARE ON THE SCREEN**

**[M] With NOTHING PRESSED, +4 s from boot: TWO SWEEPING ARCS OF BLUE ROUND
ENEMY BULLETS**, about eighteen of them, curving across the upper third of the
screen — the classic DoDonPachi aimed spread — plus small pink bullets close to
the ship. Six tanks with bodies on the road below them. This is the first time
anything in this port has drawn an enemy bullet.

**[M] With FIRE TAPPED: TWO LONG WHITE SHOT STREAKS with red arrowhead tips**
travelling up the screen from the ship, a spread of **red diamond pod shots**
beside them, and an **orange muzzle burst** where a shot met a tank. At the same
instant the blue bullet arcs are still there, so both producers draw in the same
frame, in the right depth order — the shots pass IN FRONT of the road and BEHIND
the HUD.

**[M] Flying while tapping** moves the ship to the top of the road with its two
pods and their muzzle flashes; the tanks keep their bodies; no throw.

### 5.2 The status line, sampled

```
[M] BOOTED     lf 2506  [port] dl 70 drawn 65 b0 54  spr 8/8  NO ART 5: $233F34x1 $22DA70x1 $22DED4x1
[M] NOFIRE+4s  lf 2757  [port] dl 61 drawn 51 b0 24  spr 8/8  NO ART 10: ...
[M] TAP+2s     lf 2905  [port] dl 70 drawn 60 b0 17  spr 8/8  NO ART 10: ...
[M] FLY+TAP    lf 3083  [port] dl 35 drawn 25 b0 10  spr 8/8  NO ART 10: ...
```

`spr 8/8` — all eight sprite shards land. **Not one address the page names is a
shot or a bullet stream**; every remaining `NO ART` is a background element
(`$233F34`, `$22DA70`, `$22DED4`, `$22C608`) or `$12Dxxx`/`$12Cxxx`, which is
W47's own leftover list and belongs to producers this wave did not touch.

### 5.3 What I did NOT see, stated as a limit

**Nothing here is compared against MAME.** No gate in this repo compares the
PORT's own list against a board frame, and this wave did not build one. I have
proved the port asks for stream addresses the cartridge's own tables and its own
chain contain, that the bundle holds them, and that they draw. **A record with a
correct descriptor can still be the wrong record.**

---

## LOG (appended as findings arrived)

- opened.
- §0.1 [M]: **the brief's "nine streams / 2,184 bytes" is a floor.** 20 streams
  measured, **71 enumerated from the cartridge, 10.5 KiB gz** — and the reason
  is that L3 unblocked the OPTION PODS, a second shot producer recon 40's
  `--no-pods` intervention had deleted.
- §0.2 [M]: **the brief's `$27F95A` assignment is refused, with L3's reason.**
  Its allocator without its driver is W33's leak one level down. This wave
  allocates from no pool; both buffers it writes are drained by call #4 every
  frame, measured.
- §1 [M]: buckets 22 and 23 measured EMPTY over 1,200 frames both with and
  without fire, while 14,172 live bullet record-frames went past. 213 bullet
  streams enumerated; **306 shipped by walking the cartridge's own chain**, both
  ranges closing EXACTLY on their stated end.
- §1.1 [M]: **`26-review` F2 is observable** — three descriptors past the wrap —
  **and there is a THIRD of the same family** at `$282748`, which the sink found
  on its first run: 2,478 records over 66 addresses that are not stream starts.
- §1.2 [M]: the sink reached `$283C38`'s read of `$282714` for the first time in
  this port's history — a loud named throw, and a new export window sized by an
  abutting bound. **And bucket 22 is still 0**: kinds 27/36/37/38 do not spawn
  here. Presence, not absence.
- §2.2 [M]: **BOOT 473.7 → 473.2 KiB. It went DOWN while 369 streams of art were
  added**, because the stream table became planar and delta-coded: 4,152 → 500 B.
- §2.3 [M]: the shard queue's "index order is need order" comment stopped being
  true; the order is published now.
- §3 [M]: **bucket 14 art 0 of 20 → 20 of 20; bucket 23 records 0 → 7,465; the
  bullet descriptor set 153 → 65 distinct, ALL with art**, the shrinkage being
  the two ring fixes.
- §4.1 [M]: 20 mutants, **20 named reds, 0 survivors**, every restore
  byte-identical by sha256. Three were SKIPPED on the first pass because
  `mover.js` is CRLF; a skipped mutant is not a passed one.
- §4.3 [M]: two exporter mutations seen red against the cartridge, **and one
  that did NOT go red, recorded as a defective check** — an end address that is
  a stream boundary in the wrong place is not caught.
- §4.4 [M]: `bundlegate` **15955968/15955968 = 100.0000 %, unmoved**; the ROM-leak
  guard clean with W47's same four exceptions.
- §5 [M]: **THE OWNER'S WAVE, IN A REAL BROWSER. Two arcs of blue enemy bullets
  with nothing pressed; two white shot streaks with red tips and a spread of red
  pod shots with fire tapped; an orange muzzle burst on a tank.** The page names
  no shot or bullet address at any sample.
