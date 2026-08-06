# 43 - PLAN: THE DaiOuJou ENEMY LAYER

status: **DONE** (planning). role: ARCHITECT, read-only except this file. no commits.
date: 2026-08-04. tree: HEAD `c968f58`, with **W42 IN FLIGHT** (`src/web/app.js`,
`tools/webgate.mjs`, `tests/web-page.test.js`, `index.html` modified;
`docs/worklog/ddpdoj/42-impl-strip-capture-enemies.md` untracked).
target: `ddpdojblk` VERSION-B. Every address below is build B.

inputs, read in full: `40-recon-emission-path.md` (RECON 1),
`41-recon-sprite-art.md` (RECON 2), `39-OWNER-visible-play-before-sound.md`
(BINDING), `28-recon-stage1-remaining.md`, `games/ddpdoj/PLAN-no-recordings.md`,
`HANDOVER.md`, `docs/knowledge/09` and `10`. Also read for sizing:
`37-recon-laser.md` section 6, `38-recon-bomb-hyper.md` section 6.

**`[M-A]` = measured by me, this session, on this tree.** Everything else names
the document it came from. Every port-run figure below was produced by running
`games/ddpdoj/src/` at HEAD `c968f58` from the page's own seed
(`rip/web/seed.bin`, `rip/port/player.tables.json`), reading the raw list out of
`game.ram` at `$800000..$8009FF` and parsing it with
`src/render/spritelist.js parseSpriteList(words, RAM_STRIDE)` -- the same parser
both recons used, so the numbers are comparable to theirs. Nothing here was
compared against MAME. Coverage below is streams, records, table entries and
branches. Never frames.

---

## 0. THE HEADLINE - THE CRITICAL PATH IS **ONE WAVE** AND IT NEEDS **ZERO NEW ART**

Both recons converge on "render the port's own `$800000` list", and both then
say the art must ship with it, because the sheet is re-based. **The second half
is half wrong, and the half that is wrong is the half that decides the plan.**

The remap is mandatory (RECON 1 is right: 301 of 302 streams draw garbage
without it). **The ART is not.** Measured:

> **[M-A] Over the first 5.32 seconds of play from the page's own seed - 315
> logic frames, 16,183 display-list records - the port's own emitter asks for
> 119 distinct sprite streams and EVERY ONE OF THEM IS ALREADY IN THE SHIPPED
> 39.2 KiB BUNDLE. Zero records have no art.**
>
> **[M-A] Bucket 0 - THE ENEMIES - appended 14,352 requests over those first
> 296 frames, 48.49 per frame (min 14, max 62), and 100.00 % of them carry a
> stream the bundle already contains.**

So the shortest sequence from here to a visible ported enemy is:

1. teach the exporter to keep the ROM address it already computes (one line);
2. remap the port's list through it in the page, and skip-and-name what is not
   there;
3. render that list instead of the recording's.

**One wave. +1,328 bytes of boot. 14 to 62 ported enemies per frame on screen.**

That is the plan's spine, and §1 is the evidence.

---

## 1. THE MEASUREMENTS THIS PLAN RESTS ON

All `[M-A]`, this session. Method, once: `new Game(rip/web/seed.bin,
rip/port/player.tables.json, {logicFrame: 2000})`, stepped N logic frames, the
raw list read out of `$800000..$8009FF` (`0x500` words) and parsed with
`RAM_STRIDE`. THE SHIPPED SET is the 166 ROM offsets the bundle actually holds
art for: the capture's own 150 (`tools/w35atlas.mjs capture`) plus the 17
`$25533A` ship tilts from `player.tables.json` (`$001520` is in both).
**INTERVENTIONS, named** (`docs/knowledge/09`): the page's own standing
`$810424 = $FF`; three input conditions, each labelled; no MAME; no
`--stub-unported`, no `--no-pods`.

### 1.1 How much of the port's own list already has art

| input condition | frames | distinct streams | streams in the sheet | records | records with art |
|---|---:|---:|---:|---:|---:|
| nothing pressed (`$FFFF`) | 3,000 | **302** | 119 | 139,238 | 73,146 = **52.53 %** |
| the recorded `fly-around` inputs | 3,000 | 376 | 135 | 139,306 | 72,176 = **51.81 %** |

The no-input row **reproduces RECON 1 §4 step 0's 302 exactly**, independently.
Of the 24.38 records per frame that have art, **exactly 1.00 per frame is the
ship** (3,000 of 3,000 frames carry exactly one ship-tilt stream), so at least
23 records per frame that are *not* the player already draw correctly.

### 1.2 Coverage by PLAY TIME - the number that makes this one wave

Percentage of the port's emitted display-list records whose stream is in the
shipped sheet, cumulative from the seed:

| play time | nothing pressed | recorded `fly-around` | owner's stick sweep |
|---|---:|---:|---:|
| 3 s | 100.0 % | 100.0 % | 97.9 % |
| **5 s** | **100.0 %** | **100.0 %** | **98.2 %** |
| 8 s | 97.7 % | 97.2 % | 96.0 % |
| 10 s | 94.7 % | 94.0 % | 93.0 % |
| 15 s | 86.1 % | 85.0 % | 84.2 % |
| 20 s | 77.3 % | 76.1 % | 75.3 % |
| 30 s | -- | 62.4 % | -- |
| 50 s | -- | 51.8 % | -- |

**The first record with no art is `$233F34`, a 5x80 BACKGROUND ELEMENT, at
lf2315 = +5.32 s.** The first *small* (enemy-sized) miss is `$0650A8`, 1x16, at
+5.42 s. The degradation is gradual and starts with the biggest pictures, which
is the same shape RECON 2 §2.3 measured from the other side (50 streams are half
the payload).

**WHY THIS IS TRUE, STATED SO NOBODY MISREADS IT.** It is not luck and it is not
general. The page's boot seed *is* the recording's window (lf2000, `fly-around`)
and the sheet was harvested from that recording. **The free five seconds are a
property of THIS SEED.** A from-boot start, a different seed, or a warp to a
later stage has no such grace period. Say so wherever this number is quoted.

### 1.3 The marginal art, priced

New streams the port asks for that the bundle does NOT have, cumulative, packed
and gzipped the way `tools/export-web.mjs` does it (coalesce the used word
ranges, pack, `gzipSync level 9`; ~0.4 % below what the exporter writes, for
RECON 2 §1.1's power-of-two reason):

| play time | new streams | mask gz | colour gz | **total gz** |
|---|---:|---:|---:|---:|
| to 5.32 s | **0** | 0 | 0 | **0 B** |
| to 10 s | 60 | 2,185 | 23,068 | **24.7 KiB** |
| to 20 s | 164 | 7,101 | 142,093 | **145.7 KiB** |
| to 30 s | 213 | 9,588 | 219,074 | **223.3 KiB** |
| to 50.7 s (run end) | 241 | 11,500 | 266,052 | **271.0 KiB** |

### 1.4 Extents, the null stream, and the landmine neither recon found

`tools/export-web.mjs` takes every stream's extent from the ROM chain
(`streamExtent`, line 191), not from the observed `width x height`, so a shipped
stream is the FULL stream. **[M-A] Of the 135 shipped streams the port emits,
134 have enough mask words for the largest record the port draws them at. The
one exception is `$000000`.**

**[M-A] The port emits `offs $000000` 1,075 times in 3,000 frames -- 1,065 at
1x1 (the null placeholder both recons named) and TEN AT 3x40, which reads 120
mask words against a packed stream of 10.** All 1,075 were off screen in this
window (x in -1024..-470; the right edge never exceeds -422). Measurement proves
presence: off screen *here* is not off screen *ever*. **The guard must treat a
remapped base of 0 with `2 + w*h > 10` as NO ART and name it**, not draw it --
otherwise the one coincidence RECON 1 §4 identified (packed base 0 == ROM
`$000000`) becomes the one record that silently reads someone else's data.

### 1.5 The palette - RECON 1's open item §7.4, CLOSED

**[M-A] The port's records ask for 16 of the 32 sprite colour banks.** Against
the capture's palette part (frame 0, words `$000..$3FF`):

```
banks 0, 2, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 26, 28
        -- 15 banks, 31 non-zero pens each
bank 24 -- 0 non-zero, 5,732 records: the three GROUND SHADOWS
```

Bank 24 being all zeros **independently reproduces RECON 2 §4.2's ROM-side
finding** ("Bank 24 is all zeros"), and it is the bank the shadows already draw
against on the page today. **Emission may draw against the capture's palette and
be right** (RECON 2 §4.3's ordering freedom), so the sprite-palette uploader is
off the critical path. No palette work in E1.

### 1.6 Firing still throws - reproduced

**[M-A]** From the seed, `$24C180` throws:

- HOLDING Button 1 from lf2100 -> **threw at lf2100, the FIRST held frame**;
- a single-frame tap every 8 frames from lf2100 -> **threw at lf2104**, the
  first tap.

RECON 1 §5 and the owner's report are both exactly right, and there is no tap
short enough. **"Shoot" is behind the laser, and nothing in this layer changes
that.**

---

## 2. PREMISE CHECK - WHAT I VERIFIED, AND THE FOUR THINGS I CORRECT

Both recons corrected the briefs they were given. Neither is immune, and neither
is wrong about anything load-bearing. Four corrections, in descending order of
how much they save an implementer.

### C1. RECON 1's "301 of 302 records would draw GARBAGE" is TRUE of streams and MISLEADING about records

As a statement about the re-basing it is exactly right: without a remap, 301 of
the 302 ROM offsets index the packed mask array at `offs & (16384-1)` and draw
the wrong picture. It reads, though, as "shipping §4.1 alone shows nothing", and
RECON 1 §6 draws that conclusion ("it cannot be SHIPPED alone ... needs either
§4.2 or a SKIP-AND-COUNT guard"). **With the remap and the guard and NO new art,
52.5 % of all emitted records - and 100 % of the first 5.32 seconds, including
48.49 enemy records per frame - draw their correct art** (§1.1, §1.2). The guard
is not a consolation prize. It is the wave.

### C2. RECON 1's `spriteStride` trap is WITHDRAWN

RECON 1 §4 step 1 warns that `spriteStride` "lives in `renderIndexed`'s
red-validation options bag, whose comment says *Nothing in the port may pass a
non-default value*", and asks the architect to restructure the API.
**[M-A] That comment is on the CONSTRUCTOR's bag, not on `renderIndexed`'s.**
`src/render/igs023.js:36-41` documents `constructor(roms, opts)` - the decoder
overrides (`bgTileFn`, `txTileFn`). `renderIndexed`'s own bag (lines 74-78)
carries `spriteOrderReversed`, `zoomWordFn`, `maskBitOpaque`, `ignoreBgPriority`
- and also `scrollSign` and `spriteStride`, which are **structural parameters,
not mutations**: `tools/pixgate.mjs:327-332` builds `drawOpts` from exactly the
four mutation knobs and passes neither. **Passing `spriteStride: RAM_STRIDE`
from the page violates nothing and needs no restructuring.** One less thing in
E1.

### C3. RECON 2's "506 streams / BOTH 63" is measured under interventions that DELETE the overlap

RECON 2 §0/§1.2's port set is `--fire 4 --stick --no-pods --stub-unported`.
`--stub-unported` frees the eight unported stage-1 handlers' enemies on the
spawn frame, and `--no-pods` removes the option object entirely - **both remove
exactly the streams the recording shares**, because the recording is ordinary
play with pods and live enemies. **[M-A] Without those interventions the overlap
is 119 (no input) or 135 (recorded inputs), not 63**, and the port's
first-5-second set is **119 streams, not RECON 2 §2.4's 99**. RECON 2's shard
curve is a floor under a lower bound. It points the right way; do not price a
shard off it - §1.3 is the number to price off.

This is not a contradiction between the two recons (RECON 1 never measured the
overlap), but it is the one place where a RECON 2 headline would mislead the
delivery wave, and it is why §6 sets the shard boundary from my numbers.

### C4. `PRODUCED_BUCKETS` is not simply "stale" - the ARRAY is load-bearing

RECON 1 §1.4 correctly flags `src/main.js:47-55` as claiming four produced
buckets when eight are filled. **[M-A] The ARRAY is consumed by
`tools/shipgate.mjs` (imported at :51, printed at :304) and by
`main.js:351 this.staged = PRODUCED_BUCKETS.map(snapshotBucket)` - it is the set
`shipgate` SUBSTITUTES into the board's staged bytes.** Widening it to eight
changes what that gate compares. **Fix the COMMENT; do not touch the array
without owning `shipgate`.** Same for the "NINE" at `src/main.js:57-59`:
`TYPE5_PORTED` holds ten and is the authority (`src/type5.js:13-20` says so
itself).

### 2.1 What I verified and found correct

- `src/main.js:352` is the ONLY mention of `displayList` in `src/` or `tools/`.
  One writer, zero readers. **Confirmed.**
- `parseSpriteList(words, RAM_STRIDE)` applies `WORD_MASK` (word 1 bit 10, word
  2 bit 15) - the DMA's own masks - so the RAM list and the post-DMA buffer
  parse identically. **Confirmed** (`spritelist.js:29`).
- `SpriteDrawer.draw` indexes `this.mask[... & (this.mlen - 1)]`
  (`sprites.js:142-143`), and `manifest.spr.note` says the arrays are powers of
  two for exactly that reason. **An out-of-range `offs` wraps; it does not
  throw. Confirmed.**
- `src/web/assets.js verifyCoverage` (:601) walks `cap.state(i).spritebuffer`
  only, and demands both stream-base membership and `have >= 2 + w*h`. **It
  cannot see a port record. Confirmed.**
- `manifest.ship.pairs` is consumed ONLY by `Capture.splice`
  (`render/capture.js:380`). It relocates the RECORDING's ship record; the
  port's own ship record carries a ROM offset from `ctx.rom.u32(...)`
  (`shipsprite.js:237-239`). **`ship.pairs` is not a general remap, and it dies
  with the splice. Confirmed.**
- **The ROM-to-packed map already exists in the exporter.** `offsMap` is built
  at `tools/export-web.mjs:582-605` for every stream in the bundle and is used
  to rewrite `capture.bin`; line 787-790 then emits
  `[offsMap.get(offs), w.maskWords]` and **throws the ROM key away**.
  **Confirmed, and it is the whole of §5.**
- RECON 2 §5.2's strip numbers (7,671 -> 886 records, 8.99 % of pixels, 5..6 per
  frame, 0 throws) were already re-measured independently by the W42
  implementer, digit for digit. Not re-run by me.

---

## 3. THE CRITICAL PATH TO ONE VISIBLE PORTED ENEMY

**One wave. E1. Nothing else is on the path.**

```
  W42 (IN FLIGHT)  strip the recorded enemies      -- owner's order, already landing
        |
        v
  E1   RENDER THE PORT'S OWN DISPLAY LIST          <-- A VISIBLE PORTED ENEMY IS HERE
        |  exporter keeps the ROM key it already computes  (+1,328 B boot)
        |  the page remaps, and skip-and-names what is absent
        |  the page renders $800000..$8009FF, one frame late
        v
       everything else in this plan is downstream, and NONE of it is on this path
```

E1 does **not** depend on: new art, a shard, the sprite-palette uploader, the
effect pool, the bullet sink, the laser, `ROM_TABLES` being level with the port,
or resolving `$288D62`/`$25E7B8`. It depends on W42 only in the trivial sense
that both edit `Demo.draw()` - and E1 makes W42's strip dead (§3.4).

### 3.1 E1, step by step

**(a) `tools/export-web.mjs`, one line.** Emit `[offs, offsMap.get(offs),
w.maskWords]` at line 788 instead of `[offsMap.get(offs), w.maskWords]`, and say
so in `spr.note`. **[M-A] Cost: `manifest.spr.streams` goes 1,706 -> 3,034 JSON
bytes; +1,328 B on a 10,112 B `manifest.json`, which is served uncompressed.
Boot 470.0 -> 471.3 KiB.** No `.gz` asset changes at all, so
`tools/bundlegate.mjs` renders the same pixels and stays at 100.0000 %.

**(b) `src/web/app.js`, one pure exported function.**

```
portSpriteList(ram, romToPacked) -> { words: Uint16Array(0x500),
                                      drawn, skipped, missing: Map<romOffs, count> }
```

- copy `$800000..$8009FF` out of `game.ram` (0x500 words);
- for each 5-word entry: `offs = ((w2 & 0x007f) << 16) | w3`; look it up;
- **present** -> write the packed base back as
  `w2 = (w2 & 0xff80) | (packed >>> 16)` and `w3 = packed & 0xffff`. This is
  byte-for-byte what `export-web.mjs` does to `capture.bin` (line 609+) and what
  `Capture.splice` does with `ship.pairs` - the same transformation, in the same
  direction, on a different list;
- **absent** (or a remapped base of 0 with `2 + w*h > 10`, §1.4) -> **zero the
  WIDTH field of word 4 and count the ROM address.** `SpriteDrawer.draw` returns
  before touching a ROM word when `wide === 0` (`sprites.js:139`), and
  `parseSpriteList` terminates only on `(w4 & 0x7fff) === 0`
  (`spritelist.js:46`), so a zero width skips the record **without truncating
  the list**. Zeroing word 4 instead would silently drop everything behind the
  first gap, which is why it is a red mutation in §3.2.

**(c) `Demo.draw()`.** Hold the previous frame's `words` and pass THAT as
`st.spritebuffer`, with `renderIndexed(st, { spriteStride: RAM_STRIDE })`.
**The one-frame hold is not optional**: `src/render/capture.js`'s own header
measures `:igs023:spritebuffer` lagging main RAM by one frame - "lag 1 gives
three offsets holding on 161/161 captured frames, lag 0 and lag 2 give none" -
and the existing splice already honours it with `prevPos`/`prevTilt`. A page
that renders the list `step()` has just built is one frame early, and it will
look *almost* right, which is the worst kind of wrong on this project.

**(d) the status line.** `drawn`, `skipped`, and the top missing ROM addresses
by count. RECON 1 is right that this is worth building for its own sake: it
turns "the picture is wrong" into "17 records this frame have no art:
`$233F34`, `$0650A8`, ...", which is E2's shopping list.

**(e) the three stale comments** RECON 1 §8 names -
`src/render/index.js:8`, `src/render/capture.js:8`, `src/main.js:47-59` -
corrected in the same commit, per C4 (the comment only, never the array).

### 3.2 E1's DONE-WHEN, as measurements

1. **`tools/webgate.mjs`** - which already loads the real bundle over real HTTP
   and, since W42, already drives the page's draw-path helpers - runs 300 logic
   frames from the shipped seed with no input and asserts, exactly:
   > **[M-A] 16,457 display-list records, 20..69 per frame, `skipped === 0`.**

   That single line cannot be satisfied by a black screen, by the recording, or
   by an empty list.
2. **The guard is alive, not vacuous.** A second window to lf2400 asserts
   `skipped > 0` and that the named misses include **`$233F34`**.
3. **Bucket 0 is on screen.** The same run asserts
   `game.displayList.perBucketRecords[0] >= 14` on every one of the 300 frames
   (**[M-A] min 14, max 62, mean 48.49**) and that every one of those records
   survives the remap.
4. **RED VALIDATIONS, each seen to fail** (`docs/knowledge/03`):
   - `no-remap` - pass the identity map. **[M-A] must report 301 of 302 streams
     missing** in the no-input window; the whole screen goes to the guard.
   - `drop-one-stream` - delete `$0166EE4` (**[M-A] the port's most-drawn
     shipped stream, 9,644 records in 3,000 frames**) from the map. Its records
     must be SKIPPED AND NAMED and `drawn` must fall by exactly its count.
   - `lag-0` - render the current frame's list. The ship's drawn position must
     differ from the splice's answer; if it does not, the hold is untested.
   - `terminate-instead-of-zero-width` - skip by zeroing word 4. `drawn` must
     COLLAPSE at the first gap, proving §3.1(b)'s choice is load-bearing.
5. **`node --test games/ddpdoj/tests/`**, `pgm.py check`, `bundlegate`,
   `pixgate`, `demogate`: unchanged and green, **with the skip count read**
   (`HANDOVER` §5: a skip is not a pass). `bundlegate` must still print
   `exact === total`; if the manifest change moved it, the exporter did more
   than one line.
6. **The owner loads the page and sees enemies.** Not automatable. In the
   done-when anyway, because it is the actual gate (`39-OWNER`).

### 3.3 Ledger moves for E1 (`PLAN-no-recordings.md` §1)

- **L1** - "the CONTENTS of the thirty sprite buckets": the page stops reading
  `capture.bin`'s `spritebuffer` **at all**. L1's remaining half ("which list
  SLOT the records occupy", `12-review` F3) closes with it, because the port
  now chooses every slot. **L1 becomes REPLACED.**
- **L2 / L3** - already REPLACED; add the note that the SPLICE and
  `manifest.ship.pairs` are now dead code (deleted in E6, not here).
- **L4** - player shots: still empty. E1 draws no shot, because §1.6 says none
  can be fired.
- **L10** - the enemies: gains "and they are on screen".
- **L14** - gains §1.5: answered for the 16 banks the port asks for, over the
  recorded window.

### 3.4 One deliberate cost, named up front

**E1 kills W42.** Once `st.spritebuffer` is the port's own list,
`Capture.splice` and `stripToAttached` operate on a buffer nothing renders. That
is not waste - W42 is the owner's own ordering, it is landing today, and it
makes the page honest a day earlier - but the plan should say it rather than
discover it.

**Do not delete either in E1.** Keep both and keep their tests (W42's
red-validated "strip before the splice and the ship vanishes" is a real check),
and put the port's list behind the page's existing mode mechanism as the
**DEFAULT**, with the capture path reachable as a labelled diagnostic. That
gives the owner an A/B on one keypress: **the ship must land in the same place
in both paths**, which is the cheapest correctness check this wave has and the
only one available without MAME (§8.1). Delete the capture sprite path in E6,
where the bytes are reclaimed.

---

## 4. THE WAVE BREAKDOWN - THE WHOLE LAYER

Sizes are measured. Where a size is another document's, it says so.

### E1 - RENDER THE PORT'S OWN LIST  *(the critical path)*

- **scope:** §3.1 (a)-(e).
- **size:** **[M-A] +1,328 B boot** (`manifest.json` 10,112 -> 11,440 B);
  ~15 lines in `export-web.mjs`, ~60 in `app.js`; **0 new art bytes.**
- **depends on:** W42 landing (same function).
- **done when:** §3.2 - **[M-A] 300 frames, no input: 16,457 records, 20..69 per
  frame, 0 skipped; `perBucketRecords[0] >= 14` on every frame;** four red
  mutations; `bundlegate` still 100.0000 %.

### E2 - THE ART THE PORT ASKS FOR, BY ADDRESS

- **scope:** harvest by ROM address - the mechanism `export-web.mjs` already
  uses for the ship's 16 tilts (lines 226-277) - instead of from the capture's
  records; and **extend `verifyCoverage` to walk the PORT's emitted records, not
  only the capture's**, which RECON 2 §6 correctly names as the only check that
  can turn a short sheet into a message.
- **size:** **[M-A] 60 streams / 24.7 KiB gz** buys play to 10 s; **164 /
  145.7 KiB** to 20 s; **241 / 271.0 KiB** to 50.7 s. RECON 2 §1.3 [cited]:
  `ROM_TABLES`/`ROM_ANIM_RANGES` are **92 streams / 151.5 KiB short of the
  port** and must be brought level before any ROM-derived sheet.
- **depends on:** E1 (the map and the miss list must exist first).
- **done when:** the guard's `skipped` count is **0 over the first N seconds**
  for a stated, measured N; `verifyCoverage` walks a port run and passes N of N.

### E3 - THE SHARD

- **scope:** boot shard plus deferred shards on `BgShards`' machinery
  (`src/web/assets.js:70`, `promote`/`demand`, "named, never black").
- **size:** boot shard is **[M-A] 0 B for 5.32 s** (§6.2 - it is a re-labelling
  of the existing 39.2 KiB sheet); the deferred tail is E2's 271.0 KiB against
  the 510.2 KiB of deferred BG shards (RECON 2 §2.1 [cited]).
- **depends on:** E2.
- **done when:** boot bytes **<= 471.3 KiB**, measured; a `demand()` on an
  unloaded sprite shard NAMES it and draws nothing, never black; the shard-404
  red case passes as `bundlegate --break shard-404` already does for BG.

### E4 - THE SHOTS DRAWN, AND THE BULLET SINK

- **scope:** the 9 shot streams by address; the bullet sink for buckets 22/23.
- **size:** RECON 1 §5 [cited]: **9 streams, 2,184 B raw**, max 10 records per
  frame. **[M-A] none of the 9 is in today's sheet** (`$004970 $00498C $004D18
  $004D3C $004D60 $005064 $005098 $0050CC $005100`). Sink: `mover.js
  spriteEmit`:331 + `bulletdriver.js`, 2 buckets, **plus `26-review` F1 (swapped
  renderOffs half-words vs `$284286`) and F2 (kind 19's missing wrap), which go
  live the day a sink exists and must be fixed in the same change.**
- **depends on:** E1 + E2's harvester **and the LASER track L1+L2** - §1.6.
- **done when:** bucket-14 records appear in the port's list with `skipped ===
  0`; buckets 22/23 emit non-zero; F1/F2 fixed with a listing citation each.

### E5 - THE EFFECT POOL `$288E4E` + `$289004`

- **scope:** explosions, into buckets 0/1/2/3/7 via the five-entry table
  `$288FF0`.
- **size:** RECON 1 §3.3 [cited]: 80 slots, stride `$38`, base `$81B732`,
  scripts `$221520`/`$221630`; W35 §7.2 [cited]: 34 kinds, 294 call sites.
- **depends on:** E1.
- **done when:** 5 of 5 emitter-table targets reached; a kill produces bucket-0
  records that are not the enemy.

### E6 - BOOT RECLAIM, AND THE CAPTURE SPRITE PATH DELETED

- **scope:** drop `capture.bin`'s `spritebuffer` part; delete `splice`,
  `stripToAttached`, `attached()`, `manifest.ship.pairs`.
- **size:** RECON 2 §5.4 [cited]: `spritebuffer` is **32,236 of
  `capture.bin.gz`'s 67,494 B**, boot 470.0 -> ~431 KiB. **[M-A] 31 of the
  sheet's 166 streams the port never emits** also become droppable.
- **depends on:** E1..E5 **and a decision about `bundlegate`** (§8.3).
- **done when:** boot bytes measured and down; whatever replaces `bundlegate`
  states what it now proves.

### E7 - THE REMAINING EMISSION-PATH TYPE-5 CALLS

- **scope:** `$27F95A` (bucket 8), `$28A098` (bucket 20), `$289B80` (0/1/2/3/7),
  `$255042` / `$27E99E` / `$254680` / `$25292A` / `$252A52` (buckets 16, 17, 28,
  29); and RESOLVE `$2890F2` and `$2527CE` by finding their PC-relative dispatch
  tables.
- **size:** RECON 1 §3.3, measured there. W11's ablation weights (**four frames
  of one scenario - not a stage-wide denominator**): bucket 8 = 0 px, 17 = 738,
  20 = 195, and **bucket 25 = 4,472 px and still unnamed by anybody** (§8.5).
- **depends on:** E1.
- **done when:** per call, its dispatch table's N of N entries are ported or
  throwing by address.

**Seven waves for the enemy layer. E1 is the only one on the critical path.**

### 4.1 The two tracks the OWNER'S TEST OF DONE needs that are NOT this layer

The owner's sentence is *load the page, fly, shoot, laser, bomb, and kill a
VISIBLE enemy.* This layer delivers **fly** (already), **kill** (W34's damage,
already) and **VISIBLE** (E1). It does not deliver **shoot**, **laser** or
**bomb** - and **[M-A] §1.6 proves shoot and laser are the same throw, not two.**

| track | waves | size |
|---|---|---|
| **LASER** (`37-recon-laser.md` §6 [cited]) | **L1 + L2 must ship together**, L3 after | 5,234 B across 15 routines + ~2,032 B of unexported tables; **32 dispatch entries / 17 distinct handlers** at `$254712`. *L1 alone moves the throw 17 frames later and does not make the game playable.* |
| **BOMB / HYPER** (`38-recon-bomb-hyper.md` §6 [cited]) | 3, realistic 3-5 | 4,027 B / 876 instructions over 11 measured spans, plus named unsized dependencies (`$28C4FC`, `$24A440`, `$286B9C`) |

**Ordering, and this is the one place the owner's own ordering does not survive
contact.** The owner ranked DRAWING first and the LASER second. E1 honours that
and is cheap. But **E4 (shots drawn) cannot be reached from the page until
L1+L2 land**, because the board's gate at `$24C164` fires on the first held
frame. **Schedule E4 after the laser, not after E2.** RECON 1 §5 says this and
it is correct.

Recommended global order, given the owner's test of done:

```
  W42  strip            (in flight)
  E1   render the list  <-- the owner can SEE ported enemies
  L1+L2 the beam        <-- the owner can PRESS FIRE without a throw
  E2   the art          <-- play stops thinning out after 5 s
  B1..B3 bomb/hyper     <-- the owner's sentence is complete
  E3   the shard, E4 shots+bullets, E5 effects, E7 the rest, E6 reclaim
```

### 4.2 The playability gate the owner asked for, and where it goes

`39-OWNER` asks for a check that loads the page, runs frames, presses fire, and
fails on any throw. **`tools/webgate.mjs` is its home** - it already refuses to
run without `assets/`, already builds the real bundle over real HTTP, and W42
has already taught it the draw path.

Add it in E1 as a **counted, NAMED EXPECTED-THROW LIST, not a pass**: today it
must record `$24C180` on the first fire frame and go green; the day L1+L2 land
it must go **red** until that entry is removed. **[M-A] The list has exactly one
entry today for a single-frame tap from the shipped seed: `$24C180` at the first
tap.** That is the only shape that cannot rot back into "all gates green means
playable", which is the defect `39-OWNER` named.

---

## 5. THE REMAP DECISION

This is the piece most likely to be got wrong, so it is four decisions with the
reason for each.

### D1. WHERE IT LIVES - in the MANIFEST, produced by the EXPORTER, applied in the PAGE

`tools/export-web.mjs` **already computes the exact map** (`offsMap`, lines
582-605) and already applies it to `capture.bin`. **Nobody has to derive
anything.** The manifest gains a third integer per stream; the page gains one
lookup.

Rejected alternatives, with reasons:

- **"an exporter that does not re-base"** (RECON 1 §4.2b's other arm).
  **Rejected.** The re-basing is what makes the sheet a 16 K / 32 K
  power-of-two array indexable with `& (len-1)`; unwinding it means shipping
  ROM-addressed arrays, i.e. the cartridge's own address space, and
  `tools/build-dist.mjs`'s verbatim-ROM guard exists precisely to make that a
  decision rather than an accident.
- **a remap inside `SpriteDrawer.draw`** (at `this.b = s.offs`,
  `sprites.js:140`). **Rejected.** `SpriteDrawer` is on `bundlegate`'s and
  `pixgate`'s 100.0000 % pixel path, where the records are ALREADY packed. A
  conditional there is a change to the strongest gate this port owns, for no
  gain.
- **generalising `manifest.ship.pairs`.** That is a *producer-side
  substitution* (the page writes packed words into a recorded record), not a
  map. It cannot serve 302 streams and it dies with the splice.

### D2. WHEN IT SHIPS - **FIRST, IN E1, AND WITHOUT ANY ART**

**The remap ships BEFORE any new art and WITHOUT any new art.** This is the
plan's central inversion of both recons' "MUST SHIP TOGETHER" (RECON 1 §6,
RECON 2 §6). They are right that *art without a remap is useless*; neither
measured that *the remap without art is 52.5 % of all records and 100 % of the
first five seconds* (§1.1, §1.2). **Art is E2. The remap is E1.**

### D3. WHAT HAPPENS TO THE 301 IF IT IS LATE - they draw garbage, silently

There is no failure mode in which a late remap is safe. A record carrying
`$12D430` indexes the packed mask array at `$12D430 & 16383`; **RECON 1 §4
step 2 [cited]: 234 of the 302 are `>= 16384` and wrap, the other 68 land on
arbitrary mask data**, and nothing throws, because the array length is a power
of two by design.

**Therefore E1 may not ship its render step without its map step.** They are one
wave and one commit, and the `no-remap` red mutation (§3.2.4) exists to prove
the map is doing the work rather than being ignored.

### D4. THE MISS POLICY - **EXACT MAP, LOUD MISS, NEVER A FALLBACK**

- A record whose ROM `offs` is not a key is **not drawn**, and its ROM address
  is **counted and named** on the status line and in `webgate`'s output.
- A record whose remapped base is **0** and whose `2 + w*h > 10` is a miss
  (§1.4 - the `$000000` 3x40 case, ten occurrences in 3,000 frames).
- **No modulo, no clamp, no nearest-stream, no "draw it anyway".** The whole
  value of the guard is that a missing stream produces an ADDRESS, which is what
  makes E2 a shopping list instead of a hunt.
- **It is a SKIP, not a THROW.** A throw here would take the page down for a
  background element the owner does not care about, and would make E1
  unshippable before E2. The project's "unported paths are LOUD NAMED THROWS"
  rule is about CODE; the honest analogue for missing DATA is a named skip with
  a count. **Write that reason in the code comment**, or a reviewer will read it
  as the quiet-return defect `HANDOVER` §4 forbids - and be right to.

---

## 6. THE DELIVERY DECISION

### 6.1 The alternatives, priced

RECON 2 §2.5 priced four options and its verdict stands. I re-price option B
from §1.3's numbers, which are not intervention-suppressed (C3).

| option | boot delta | verdict |
|---|---|---|
| **A.** ship a ROM-derived sheet at boot | RECON 2 §0 [M, cited]: **+1,153.4 KiB** (470 -> 1,623 KiB) | rejected by the owner's standing "boot must not get slower" (`HANDOVER` §8.8) |
| **B. TIME-SHARD** | **[M-A] +0 B for the first 5.32 s**; +24.7 KiB gz buys 10 s; +271.0 KiB gz buys 50.7 s, deferred | **the answer** |
| **C.** lazy per-stream fetch on first draw | +0 | rejected. `renderIndexed` is synchronous inside the frame; a stream that has not arrived can only be skipped - which is the guard. Degenerates to B with a worse schedule |
| **D.** a different compression | RECON 2 §2.2 [M, cited]: **-9.7 %** for the best gzip-decodable re-encoding (and it triples the in-memory array); **-19.2 %** brotli, which `src/web/assets.js` cannot inflate because `DecompressionStream` has no brotli | not a lever |

### 6.2 THE SHARD BOUNDARY

**The boot shard is what the bundle already ships.** **[M-A] The 166 streams
already in `assets/spr/` cover the port's own emitter completely for 315 logic
frames = 5.32 s** (100.0 % of 16,183 records; 98.2 % at 5 s even under the
owner's own stick sweep). **E3's boot shard is therefore a re-labelling of an
existing 39.2 KiB asset, not a new payload**, and boot after E1+E2+E3 is
**471.3 KiB against today's 470.0 KiB** - the +1,328 B of §3.1(a) and nothing
else.

**Deferred shards are CUT by time-to-first-use and SCHEDULED off the stage-1
spawn script's own trigger clocks**, not a wall clock - RECON 2 §2.5's
structural note, and it is right for the same reason the BG shards are driven by
`streamColumnOf` rather than a timer: the schedule must be a function of the
simulation, or a slow host desynchronises delivery from the game. Those clocks
are already read from ROM at run time by `stage1Handlers()` in
`tools/w34damagegate.mjs`.

Cut points and deadlines, all **[M-A]**:

| shard | due by | new streams | gz |
|---|---|---:|---:|
| boot | - | 0 (the existing sheet) | 0 |
| 1 | **5.3 s** | 60 | 24.7 KiB |
| 2 | 10 s | 104 | 121.0 KiB |
| 3 | 20 s | 49 | 77.6 KiB |
| 4 | 30 s | 28 | 47.7 KiB |

**The tightest sprite deadline is 5.3 s for 24.7 KiB.** The BG recon's cited
figure is "25 s of slack, tightest deadline 4.3 s" for 510.2 KiB - so **the
sprite queue's first deadline is a second looser than the background's for one
twentieth of the bytes.** That answers RECON 2 §7.7's contention question for the
HEAD of the queue. It does not answer it for the tail, and §7 keeps that risk.

### 6.3 WHEN THE PLAYER OUTLIVES THE SHARD

They already do, and §1.2 says exactly what it looks like: **94.0 % of records
at 10 s, 85.0 % at 15 s, 76.1 % at 20 s, 51.8 % at 50 s.** The missing ones are
skipped and named. The picture degrades by losing the biggest, rarest pictures
first (**[M-A] the very first miss is a 5x80 background element**) and it never
lies: a record with no art is ABSENT AND COUNTED, not drawn wrong. **This is a
shippable state, and E1 ships in it.**

### 6.4 THE FAILURE MODE IF A SHARD IS MISSING

Reuse `BgShards`' contract exactly, because it is already correct and already
red-validated (`bundlegate --break shard-404`):

- a shard **in flight**: its records are skipped and the SHARD is named on the
  status line - "named, never black" (`assets.js:63-66`);
- a shard that **404s or fails to inflate**: the failure is recorded at fetch
  and **raised by `demand()` from inside the frame that first needs it**, as an
  `AssetError` naming the shard and the rebuild command - not at boot, so a
  shard nobody reaches cannot take the page down;
- a stream in **NO shard**: that is an EXPORT GAP, not a late fetch, and it must
  say so in different words. `assets.js:96` already draws this distinction for
  BG tiles. **This is the case E2's extended `verifyCoverage` exists to catch**,
  and RECON 2 §6's warning stands: today's `verifyCoverage` walks only the
  capture's records and **would not catch a sheet that is short for the port.**

---

## 7. RISK ORDER

Ordered by expected overrun, not by size.

### R1 - E2, THE ART HARVEST. Most likely to blow its estimate.

This project's signature failure is "the last fifth is 2.2x the code"
(`28-recon` §1 L10: six handlers own 79.6 % of stage-1 spawns and the other
20.4 % is 2,063 instructions against 936). **E2's version of it: the streams the
port asks for are a FUNCTION OF WHICH HANDLERS ARE PORTED**, and eight stage-1
handlers, the effect pool, the midboss's later phases and the boss are not.
Every art figure in §1.3 is therefore a **FLOOR under a moving target** - RECON
2 §1.1 says exactly this, and RECON 2 §1.3 measured the committed ROM list
already 92 streams / 151.5 KiB behind the port.

**What settles it early, and it is ONE RUN.** In E1, before E2 is briefed, log
the guard's missing-address set over a long run and diff it against
`w35atlas.mjs rom`'s 2,035. **[M-A] I have already done the 3,000-frame
version: 241 missing streams / 271.0 KiB gz.** Extend it to the full 7,317-frame
stage as handlers land and E2's denominator stops being a guess. **Do it in
E1's own worklog.** It is the single cheapest de-risking available in this plan.

### R2 - `$288D62` AND `$25E7B8`: 32 streams, 420 KiB, 35 % of the payload, UNCITED

RECON 2 §2.3 / §7.2. Both are read `lea (d16,PC)` so no literal scan can name
their reader, and both were admitted to `ROM_TABLES` only because an observed
stream's longword happens to live inside them. **If either belongs to another
stage or to a boss, E2/E3's payload drops by up to a third for the price of one
listing read.** RECON 2 calls it "the single highest-value listing read
available" and I agree. **Schedule it before E3 is briefed, not inside it.**

### R3 - E5, THE EFFECT POOL

80 slots, 34 kinds, 294 call sites, two script tables at `$221520`/`$221630`
that nobody has read, and `28-recon` §1 L12 records that the per-effect
behaviour dispatch (the analogue of `$282030`) was never located. **This is a
subsystem wearing a wave's clothes**, and it has the boss's shape: a small body
over an unread format. Expect it to split.

### R4 - THE LASER, WHICH IS NOT IN THIS LAYER BUT BLOCKS PART OF IT

`37-recon-laser.md` §6 says three waves, warns that **L2 may split again at the
17 handlers**, and states that **L1 alone buys 17 frames of play and no more**.
The risk to THIS plan is purely scheduling: E4 is blocked on L1+L2 and nothing
in the enemy layer can unblock it.

### R5 - E1 ITSELF: LOW, and here is why I believe that

Its two new behaviours are a table lookup and a width store. Its trap list is
short and every item is measured: the one-frame hold (§3.1c), the
zero-width-not-terminator skip (§3.1b), the `$000000` case (§1.4). RECON 1's
`spriteStride` trap is withdrawn (C2). **The thing most likely to go wrong in E1
is that the picture looks SUBTLY wrong and nobody can say why**, because no gate
compares a list the board never built this way. §3.4's A/B toggle is the
mitigation available today: the ship must land in the same place in both paths,
checkable by eye in one keypress. §8.1 is the mitigation that does not exist.

### R6 - TWO HALF-MEGABYTE DEFERRED QUEUES ON ONE CONNECTION

RECON 2 §7.7, unresolved. §6.2 shows the first sprite shard's deadline is looser
than the background's for one twentieth of the bytes, so the head of the queue
is safe. **The tail is analysed by nobody.**

---

## 8. WHAT I COULD NOT DECIDE

1. **Whether the port's enemies will look RIGHT once drawn.** RECON 1 §7.1 says
   this and I cannot improve on it: nothing in either recon, or in this plan, is
   compared against MAME. I have proved the records carry positions, sizes,
   colour banks and stream addresses the bundle can resolve. **A record with a
   correct descriptor can still be the wrong record.**
   *Settled by:* a pixel comparison of the PORT's own list against a MAME frame
   at the same `lf` - which needs a NEW gate, because `pixgate` and
   `bundlegate` both compare the CAPTURE's list. **That gate does not exist and
   I did not schedule it, because I could not size it.** It is the largest
   unpriced item in this plan.
2. **The shard boundary past 50.7 s.** My run is 3,000 frames of a 7,317-frame
   stage. §1.3's 271.0 KiB is what 50.7 s costs, not what stage 1 costs.
   *Settled by:* one 7,400-frame run once the eight unported handlers are in -
   i.e. R1's run, later.
3. **Whether E6's boot reclaim is reachable at all.** Dropping `capture.bin`'s
   `spritebuffer` (~39 KiB) requires `tools/bundlegate.mjs` - the 100.0000 %
   pixel gate, and the strongest check this port owns - to stop needing it, and
   **I do not know what replaces that gate.** *Settled by:* deciding what proves
   the renderer right once the recording is not the subject. This is the one
   place where "delete `capture.bin`" and "keep the strongest gate" genuinely
   conflict; RECON 2 §5.3 settles it for the STRIP only.
4. **When the TX layer (the HUD) should be ported.** E1 leaves `st.tx`,
   `st.palette`, `st.rowscroll`, `st.zoomram`, `st.regs.ctrl` and
   `st.regs.bg_scale` as the capture's (RECON 2 §3.1). `28-recon` §1 L8 says TX
   is blocked by nothing (11 measured call sites) and the owner's test of done
   does not mention it. I did not place it.
5. **Bucket 25.** 4,472 ablation pixels, the third-largest figure W11 measured,
   and **nobody on this project has ever named it** - not W11, not RECON 1
   (§7.3). It is in no wave above because I do not know what it is.
6. **Whether `$2890F2` (type-5 #6) and `$2527CE` (#13) are emission.** RECON 1
   §7.2 found no bucket reference and says explicitly that its methods cannot
   prove absence for this shape - §3.2 documents five PC-relative dispatch
   tables no `bsr` scan can see. E7 carries them as RESOLVE items.
   *Settled by:* finding their dispatch tables in the listing.
7. **Sprite palette bank 6** (RECON 2 §7.3) - non-zero and not a verbatim ROM
   run. **[M-A] the port did not ask for bank 6 in 3,000 frames**, so it is off
   E1's path. That is presence, not absence, and it will matter to somebody.

---

## LOG

- opened; read the seven required documents in full, plus `37-recon-laser.md`
  §6 and `38-recon-bomb-hyper.md` §6 to size the tracks the owner's test of done
  needs and this layer does not contain.
- verified against the tree: one writer / zero readers of `displayList`;
  `parseSpriteList`'s DMA masks; `SpriteDrawer`'s `& (len-1)` wrap;
  `verifyCoverage` walking only the capture; `manifest.ship.pairs` consumed only
  by `Capture.splice`; and **`offsMap` already existing inside
  `tools/export-web.mjs` and being discarded at the manifest line.**
- **[M-A] THE FINDING THIS PLAN TURNS ON: the port's own emitter is 100 %
  covered by the ALREADY-SHIPPED sheet for the first 5.32 s - 315 frames,
  16,183 records, 0 misses - and bucket 0, THE ENEMIES, runs at 48.49 records
  per frame over that window with 100.00 % coverage.** So the critical path is
  ONE wave and ZERO new art bytes.
- [M-A] reproduced RECON 1's 302 distinct streams exactly under its own no-input
  condition, and measured the overlap it did not: 119 of 302 streams, 52.53 % of
  records, already have art.
- [M-A] priced the marginal art myself: 0 B to 5.32 s, 24.7 KiB gz to 10 s,
  271.0 KiB gz to 50.7 s.
- [M-A] closed RECON 1's open item §7.4: the port asks for 16 of 32 colour
  banks; 15 have 31 non-zero pens in the capture's palette and the 16th is bank
  24, which RECON 2 independently found all-zero in ROM.
- [M-A] found a landmine neither recon has: the port emits `offs $000000` at
  3x40 - 120 mask words against a 10-word packed stream - ten times in 3,000
  frames, all off screen in this window.
- [M-A] withdrew RECON 1's `spriteStride` trap (the "non-default value" comment
  is on the CONSTRUCTOR's bag, not `renderIndexed`'s) and corrected RECON 2's
  intervention-suppressed overlap (63, against a true 119/135).
- [M-A] reproduced the `$24C180` throw on the first held frame AND on a
  single-frame tap: shots and the laser are one blocker, not two, so E4 is
  scheduled behind L1+L2.
- seven waves for the layer; **E1 alone on the critical path**; R1 (E2's art
  denominator) is the wave most likely to blow its estimate, and one run
  inside E1 settles it.

status: DONE
