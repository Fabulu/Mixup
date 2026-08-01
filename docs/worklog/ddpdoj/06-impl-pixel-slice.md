# WAVE 6 — the pixel slice

status: **DONE on the pixel half, BLOCKED on half of the demo clause** — with
the measured reason for the blocked half, and every number below produced by a
command in this file.
wave: 6   role: impl   started: 2026-08-01

All addresses are **VERSION-B** (`$23xxxx`–`$28xxxx`, 2002.10.07 BLACK VER)
unless a line says build A. Machine pin printed on every run:
`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 bytes.

## The task, as I understood it

`PLAN-vertical-slice.md` §"Wave 6": wire the wave-3 decoder into the port's
renderer — tilemaps, rowscroll, sprites with zoom, palette, priority, the two
sample-point offsets honoured.

**Done when (plan, verbatim):** for the wave-4 and wave-5 scenarios, sampled
framebuffers (every N frames, plus every frame of one dense stretch) are
pixel-identical to MAME's, including at least one palette-fade frame and one
≥90-sprite frame; and the whole slice — seeded boot → flying → shooting all
three weapons — runs interactively in the browser at 59.185606 Hz.

**The part of that exit condition that cannot exist, and why.** Wave 5 came back
BLOCKED. `stage1-open-shot/-laser/-bomb` were never written, and none of the
five enemy handlers, four shot handlers or the bomb is translated
(`05-impl-enemies-and-weapons.md` §"Why the done-when is BLOCKED"). So "the
wave-5 scenarios" have nothing to sample and "shooting all three weapons" has no
port behind it. I did not invent either. Everything else in the clause is met
and measured.

## THE HEADLINE

```
python games/ddpdoj/tools/oracle/pgm.py pixslice
  PASS: 13647872/13647872 = 100.0000% over 136 frame pair(s);
        densest run 61 consecutive, busiest 122 sprites,
        biggest palette delta 403 words

python .../pgm.py pixslice --reuse --mutate all
  RED VALIDATION: every mutation was caught          (9 of 9)

python .../pgm.py demogate
  PASS: the port drives the ship and the page's own render path is
        15955968/15955968 = 100.0000% identical to MAME over 159 frames

node --test games/ddpdoj/tests/     61 pass, 0 fail, 0 SKIPPED   (was 35)
python .../pgm.py flyaround         DIGEST c752ac4c...  0 DIVERGENT FRAMES  (unmoved)
python .../pgm.py gate              635bb92f1a9dc81e...  IDENTICAL          (unmoved)
```

## What I did

1. Translated the wave-3 decoder into the port's own JavaScript —
   `games/ddpdoj/src/render/` — as a transcription of `igs023_video.cpp`
   (mame0289), not of `tools/framerender.py`.
2. Built a second pixel gate over it, `tools/pixgate.mjs`, with **nine**
   mutations (wave 3's six plus three new ones), and drove the corpus at the two
   things wave 3's corpus turned out not to contain.
3. Measured, censused and then dumped a corpus that actually tests the rules:
   a 61-frame dense stretch, a palette FADE, a palette CUT, and the
   sprite-vs-background priority rule by intervention.
4. Built the demo page (`index.html` + `web/app.js`) at the board's own cadence,
   with the ship driven live by wave 4's player port, and gated the whole demo
   path end to end headlessly (`tools/demogate.mjs`), because I could not run a
   browser from this environment.
5. Identified the ship's display-list records **by correlation** rather than by
   eye, with a lag/conversion sweep that could have refuted the inherited claim
   it ended up confirming.

## What I MEASURED

### 1. The JS renderer is pixel-exact, first run, on wave 3's own corpus

Before touching the corpus at all, the new JS gate was pointed at the existing
`rip/gfx-gate` dumps — the same 16 pairs `pgm.py gfx` scores:

```
$ node games/ddpdoj/tools/pixgate.mjs --rom rip/rom --dump rip/gfx-gate --min-pairs 12
PASS: 1605632/1605632 = 100.0000% over 16 frame pair(s)
```

Identical to the Python gate's `PASS: 1605632/1605632 = 100.0000%`, pair for
pair, including `f2536 -> f2537` with 111 sprites.

**And the six shared mutations reproduce the Python gate's percentages to four
decimal places**, which is the strongest single piece of evidence that the JS is
a translation and not a parallel invention:

| mutation | Python (wave 3, 16 pairs) | JS (same 16 pairs) |
|---|---|---|
| `tx-msb` | 95.6651 % | 95.6651 % |
| `bg-planes` | 72.4030 % | 72.4030 % |
| `spr-mask` | 51.1631 % | 51.1631 % |
| `zoom-off` | 97.2763 % | 97.2763 % |
| `spr-order` | 86.7132 % | 86.7132 % |
| `u19-at-200000` | 52.8566 % | 52.8566 % |

### 2. TWO RULES THAT NO FRAME IN THE PROJECT'S CORPUS HAS EVER TESTED

Three of the nine mutations are new. Two of them **stayed green** on wave 3's
corpus, and that is a fact about the corpus, not about either decoder — the
Python gate has the same hole:

```
--- mutation pal-same-frame (must go RED) ---
PASS: 1605632/1605632 = 100.0000%     pal-same-frame: STILL GREEN -- THE GATE IS FAKE
--- mutation pri-ignore (must go RED) ---
PASS: 1605632/1605632 = 100.0000%     pri-ignore:     STILL GREEN -- THE GATE IS FAKE
```

**(a) The palette sample-point offset is untested because there is no fade.**
The largest palette movement in all 32 dumped frames is **3 words of 2,560**, so
frame N's palette and frame N+1's are the same picture and both choices score
100.0000 %. `00-recon-assets.md` §4 says outright that only a fade frame exposes
the difference; nobody had put one in the corpus.

Rather than guess which logic frame is a fade, I censused it. New
`PROBE_PALDELTA` in `frame.lua` (opt-in; 2,560 palette words read per video
frame):

```
$ python .../pgm.py pixslice --paldelta
CENSUS paldelta_top24 words_of_2560
 [vf1238/lf1204:403 vf1239/lf1205:399     <- a hard CUT
  vf1026/lf1002:217 vf1028/lf1003:215 vf1030/lf1004:212 vf1032/lf1005:209
  vf1034/lf1006:206 vf1036/lf1007:203 vf1038/lf1008:202 vf1040/lf1009:197
  vf1042/lf1010:193 vf1044/lf1011:190 vf1049/lf1016:189 vf1046/lf1013:188
                                          <- a SUSTAINED fade, lf1002..1016
  vf716/lf699:181 vf2439/lf2405:138 vf40/lf25:124 vf28/lf13:124 ...]
```

A cut and a fade are different shapes and the corpus now contains both
(lf 995..1020 and lf 1198..1210). With them in, `pal-same-frame` costs
**7.4409 %** of the pixels.

**(b) The sprite-vs-background priority rule is untested because NOT ONE SPRITE
IN THE CORPUS SETS ITS `pri` BIT.** Counted directly from the dumped
`spritebuffer` shares:

```
$ node <scratch>/pri.mjs
sprites 1397 with pri=1 0 {}
```

So `pgm_draw_pix`'s `if (!pri || !(pri_bitmap & 2))` has never been exercised by
anything this project has rendered. Driven by intervention instead — new
`PROBE_PRICOV` in `frame.lua`, the same shape as wave 3's zoom poker and for the
same reason (the sample point is the only instant a poked list survives): twelve
records, two rows of six, **identical except for word 2's bit 7**, over gameplay
background, four batches walking down the screen.

```
PRICOV batch=1/4 sprites=12 pri0_y=4   pri1_y=30  offs=$22B3DC vf=2236 lf=2200
PRICOV batch=2/4 sprites=12 pri0_y=56  pri1_y=82  offs=$22B404 vf=2238 lf=2202
PRICOV batch=3/4 sprites=12 pri0_y=108 pri1_y=134 offs=$22B490 vf=2240 lf=2204
PRICOV batch=4/4 sprites=12 pri0_y=160 pri1_y=186 offs=$22B4CC vf=2242 lf=2206
```

and the difference the rule makes, isolated:

```
$ node tools/pixgate.mjs --dump rip/gfx-gate --dump rip/pix-slice --mutate pri-ignore
PASS: 12845056/12845056 = 100.0000% over 128 pairs      <- the NATURAL corpus
                                                           cannot see the rule
$ node tools/pixgate.mjs --dump rip/pix-pri --mutate pri-ignore
FAIL: 801515/802816 = 99.8379% over 8 pairs             <- 1,301 pixels
$ node tools/pixgate.mjs --dump rip/pix-pri                     (the baseline)
PASS: 802816/802816 = 100.0000% over 8 frame pair(s)
```

1,301 pixels of 13.6 million is 0.0095 %. That is the entire difference between
a rule that is verified and a rule that is merely not contradicted.

### 3. The wave-6 corpus, and every one of its numbers has a reason

| range | frames | why, measured |
|---|---|---|
| wave 3's 16 points | 16 pairs | boot + stage 1, kept as-is |
| lf 995..1020 | 26 | the FADE the `PROBE_PALDELTA` census found |
| lf 1198..1210 | 13 | the hard CUT, 403 of 2,560 words |
| lf 2500..2560 | 61 | the DENSE stretch: every consecutive pair. Chosen at 2500 because `pgm.py gfx` measured 111 sprites at f2536, the busiest natural frame |
| lf 2200 + 8 | 8 | the priority intervention |

136 pairs, longest consecutive run 61, busiest pair 122 sprites, biggest palette
delta 403 words. The gate FAILS — not warns — if any of those falls below
`--min-pairs 60`, `--min-dense 40`, `--min-sprites 90`, `--min-paldelta 100`.
Those thresholds exist because a gate that passes on an empty corpus is the
subject of `docs/knowledge/03`.

### 4. The nine mutations on the full corpus, all RED

```
$ python .../pgm.py pixslice --reuse --mutate all
BASELINE: PASS
  spr-mask          39.7776 %  RED       mask bit polarity
  u19-at-200000     46.7007 %  RED       the region overlap
  bg-planes         66.3689 %  RED       BG plane weights
  state-same-frame  72.4366 %  RED       sample-point offset 1  (NEW)
  spr-order         79.7763 %  RED       list drawn forwards
  pal-same-frame    92.5591 %  RED       sample-point offset 2  (NEW)
  tx-msb            95.9603 %  RED       TX nibble order
  zoom-off          99.6051 %  RED       the zoom loop
  pri-ignore        99.9905 %  RED       sprite-vs-BG priority  (NEW)
RED VALIDATION: every mutation was caught
```

### 5. THE SHIP, IDENTIFIED BY CORRELATION — and the sweep could have refuted it

The demo draws the ship at the PORT's position, so something has to say which
display-list records are the ship. Nothing in this repo had ever measured that.
`tools/pixpack.mjs` histograms every record's `(x - py>>6, y - px>>6)` against
the board's own player position across 161 captured frames of `fly-around`, and
sweeps **three frame lags × two fixed-point conversions**:

```
$ python .../pgm.py pixdemo
SHIP CORRELATION over 161 captured frames, min-hit 90%:
  lag=0 conv=shift best single offset  74/161 frames; 0 accepted []
  lag=0 conv=round                     58/161;        0 accepted []
  lag=1 conv=shift                    161/161;        3 accepted
        [{"off":"-16,24","hits":161},{"off":"-16,-41","hits":161},
         {"off":"-24,-16","hits":161}]
  lag=1 conv=round                    102/161;        0 accepted []
  lag=2 conv=shift                     75/161;        0 accepted []
  lag=2 conv=round                     57/161;        0 accepted []
  CHOSEN lag=1 conv=shift
  161 frame(s) carry at least one identified record, 0 carry none
```

Five of the six combinations accept NOTHING, so this is a comparison that could
have come out empty. Three facts fall out of it, two of them independent
confirmations of numbers measured by completely different routes:

* **`:igs023:spritebuffer` really does lag main RAM by one frame** — inherited
  from PLAN §Assets, now confirmed by a sweep that would have shown lag 0 or 2
  if it were wrong.
* **The fixed-point conversion is TRUNCATION (`>>6`), not rounding.**
* **The two option pods sit at −41 and +24 from `px`**, i.e. centres at −33 and
  +32 for a 16-px-wide record — the `±32.53 px` the memmap recon measured from
  RAM. Two routes, same number.

The ship itself is `(-24,-16)`, a `w3h32` record: 48×32 px.

**The splice is a gate, not a convenience.** Feeding it the BOARD's own position
must reproduce the BOARD's own display list, byte for byte, or the page would
draw a ship in the wrong place and look entirely plausible:

```
SPLICE ROUND-TRIP: 161/161 frames reproduce the board's own display list byte
                   for byte when fed the board's own position (3 records/frame)
$ node tools/pixpack.mjs ... --break shift-by-5   161 of 161 frames diverged
$ node tools/pixpack.mjs ... --break swap-axes    161 of 161 frames diverged
$ node tools/pixpack.mjs ... --break no-lag       117 of 161 frames diverged
```

(`no-lag` is 117 and not 161 because on frames where the ship did not move the
lag makes no difference. That is the honest number.)

### 6. THE DEMO PATH, GATED END TO END — the port's arithmetic becomes pixels

`tools/demogate.mjs` runs exactly what `web/app.js` runs, minus the DOM and the
host clock: the port's `Game` fed the board's own recorded input words (`portin`,
one per logic frame, measured lead ZERO — never the board's positions, which
would be feeding it the answer), the shared splice, the port's renderer, against
MAME's framebuffers.

```
$ python .../pgm.py demogate
PASS: the port drives the ship and the page's own render path is
      15955968/15955968 = 100.0000% identical to MAME over 159 frames
  UNPORTED calls the port made during those frames:
      320 x $240F82 object dispatch entry [4]
      160 x $23D2AE main-loop call #4: THE SPRITE LIST BUILD
      160 x $240F62/$240F6A/$240F8A/$240FB2/$240FBA  dispatch entries 0/1/5/10/11
      160 x $256D5A / $24683E                        main-loop calls #1 / #3
      160 x $185DC4 / $13C4FC                        ISR6 gated routine / tail
      160 x $249BA4 shot: idle, no cadence counter running
      160 x $249E7E player tail: shadow emit $23EFC0 + the BCD block

$ python .../pgm.py demogate --break off-by-one     99.3113 %  RED
$ python .../pgm.py demogate --break frozen-player  98.2587 %  RED
$ python .../pgm.py demogate --break no-input       98.2587 %  RED
```

**WHAT THAT 100 % DOES NOT SAY, and I am putting it directly under the number
because that is where a reader stops.** Because wave 4's port agrees with the
board to the unit, the SPLICED display list is byte-identical to the board's
own — so "the port drove the ship" and "nothing was spliced at all" produce the
same picture, and this gate cannot separate them. What it proves is the other
direction: the pixels DO come from the number the port computed. `off-by-one`
moves the port's `py` by one whole pixel and **109,885 pixels change — 691 per
frame, 0.6887 % of a 100,352-pixel frame**, against a ship record of 48×32 =
1,536 px plus two 16-px-wide pods; that is the part of the ship whose colour
differs from its own neighbour one pixel over. `frozen-player` and `no-input`
cost 1.7413 % each and print the SAME number, which is not a copy-paste error:
in this window the fly-around script's first stick input is at lf2000, so
"never move the ship" and "never send input" are the same experiment here. A
window that started mid-move would separate them.

### 7. Nothing upstream moved

`frame.lua` gained two opt-in blocks and one call site. Both are inert without
their env var, and the two hashes that would catch a change did not move:

```
$ python .../pgm.py flyaround
  COLS   34 compared
  DIGEST c752ac4c2ed0d9733cefbd95908f5b5eabb32b6df7af1c36d140f9a3c3c73209
  RESULT 0 DIVERGENT FRAMES on 34 columns over 2200 logic frames
$ python .../pgm.py gate
  run 1 = run 2 = 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
  IDENTICAL
```

Both are the wave-5 values, unchanged.

### 8. The unit suite: 35 → 61, still 0 skipped

`tests/render.test.js` runs on SYNTHETIC regions and never touches the
cartridge, because `node --test games/ddpdoj/tests/` is the cheap stage that has
to work on a tree with no ROMs extracted, and a test that skips when `rip/` is
missing is a test that never runs. It pins one rule per test: the u19 overlap
in both directions, the BG plane order and its mutation twin, the TX nibble
order, `TILE_FLIPYX`, both transparent pens and both colour bases, the display
list's field layout and DMA masks and terminator at both strides, `zoom_word`'s
two special cases, THE "no zoom is zom=0 AND grow=1" trap, mask polarity, the
priority rule in both directions, first-drawn-wins, three 5-bit pixels per
colour word, the ctrl layer bits, per-row scroll and its 0x7ff wrap, `pal5bit`,
MAME's ARGB32 byte order, `np.rot90` equivalence, `portWordFromBits` against the
board's three measured port words, and the splice's field preservation.

## What I could not do, and why

1. **"Shooting all three weapons" in the browser.** Wave 5 is BLOCKED; no enemy
   handler, no shot handler and no bomb is translated. The fire keys drive the
   ported cadence machine `$249B2C..$249BE2` and then reach a loud named throw
   at the ship-type jump table (`$249BFC` / `$249D2C`). Not stubbed, not faked.
   The page says this on its own face, in the banner, and so does
   `NOTES-render.md` §5.
2. **"The wave-5 scenarios" as a gate corpus.** They do not exist. The pixel
   gate covers the wave-1 gate scenario (`stage1-open`) and the wave-4 port
   scenario (`fly-around`), which is every scenario that has a port behind it.
3. **THE BROWSER PAGE HAS NEVER BEEN EXECUTED.** There is no headless browser on
   this machine and the brief forbids downloading one. I mitigated it as far as
   I could: every non-DOM part of `web/app.js` is shared code that
   `demogate.mjs` runs and gates (the `Game`, the `Capture`, the splice, the
   `Renderer`, the palette/rotate/resolve chain), and `portWordFromBits` is unit
   tested against the board's measured port words. **UNTESTED: the fetch and
   region-assembly path in the browser, the canvas blit, the keyboard event
   mapping, and the `requestAnimationFrame` cadence loop.** A reviewer with a
   browser should open it before anyone calls the demo clause done. I would
   rather say this than let "runs interactively" stand on an inference.
4. **The 58 MiB the page fetches.** The whole IGS023 tile region plus both
   sprite regions. It cannot be trimmed to "what this capture uses" without a
   second measurement, because a sprite stream on this board cannot be
   random-accessed and a header cannot be told from two arbitrary bytes
   (`NOTES-assets.md` §3). Not attempted.
5. **A full `pgm.py check`.** I ran: the unit suite, `pixslice` fresh, `pixslice
   --mutate all`, `pixdemo` (which includes the splice round-trip gate and its
   three breaks), `demogate` and its three breaks, `flyaround` fresh, and
   `gate`. I did NOT re-run the wave-3 stages (`gfx`, `zoomcov`, `sprites`,
   `sound`, `assets.py check`) or `rtc`/`drc`/`seedstate`/`overrun`/`objdriver`.
   The two hashes above are the evidence that nothing they measure moved.
6. **`04-review.md`'s and `05-review.md`'s leftover items are still leftover** —
   the `memmoveDown`/`memmoveUp` zero-length case, the `$813176` hoist in
   `enemies.js`, the `$815E9C` attribution in `NOTES-machine.md`, the
   "type 5 is 15 subsystem calls" count (the review measured 23), the
   `clamp-first`/`no-tilt-decay` mutations being broader than their names, and
   the unlabelled per-call cycle costs in `src/main.js`. I touched none of them;
   they are outside this wave and I did not want to move wave-5 code under a
   reviewer who has not seen it yet.

## If someone picks this up cold

```
python games/ddpdoj/tools/oracle/pgm.py pixslice                  THE PIXEL GATE
python games/ddpdoj/tools/oracle/pgm.py pixslice --reuse --mutate all
python games/ddpdoj/tools/oracle/pgm.py pixslice --paldelta       the fade census
python games/ddpdoj/tools/oracle/pgm.py pixdemo                   capture + ship id
python games/ddpdoj/tools/oracle/pgm.py demogate                  the demo, gated
python games/ddpdoj/tools/oracle/pgm.py demogate --break off-by-one
node --test games/ddpdoj/tests/                                   61 pass, 0 skipped
python -m http.server 8000    # then open /games/ddpdoj/  -- NEVER YET RUN, see above
```

**Six things that will save you the hours they cost me:**

1. **A 100 % gate can be 100 % because the corpus cannot see the rule.** Two of
   nine mutations passed on wave 3's corpus. Before trusting any percentage, ask
   which frames could possibly have distinguished the two answers — and if the
   answer is "none", say so in the output rather than printing the percentage.
2. **`pri` on a sprite record means BEHIND the background, not in front.** The
   transcription is `if (!pri || !(pri_bitmap & 2))`: `pri==0` draws
   unconditionally. It reads backwards and it is right.
3. **"No zoom on this axis" is `zom=0` WITH `grow=1`.** `zom=0, grow=0` selects
   zoom-table entry 0, which is a real zoom. This is in `NOTES-assets.md` §2 and
   it is still the easiest thing in the renderer to get wrong.
4. **`cave_t04401w064.u19` loads at `0x180000`, over the top of
   `pgm_t01s.rom`.** Getting it wrong scores 46.7 % — a picture, not noise.
5. **The sprite buffer lags main RAM by one frame, and it is load-bearing for
   anything that joins RAM state to a drawn frame.** The lag sweep in
   `pixpack.mjs` is the cheap way to re-confirm it for a new join.
6. **The renderer's decode caches are keyed on the videoram bytes** (an FNV-1a
   of the whole share), so they can make it faster and cannot make it disagree.
   If you add a cache, key it the same way or not at all.
