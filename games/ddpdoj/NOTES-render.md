# The renderer — measured

status: wave 6, built and measured 2026-08-01.
Evidence, with every command and its actual output:
`docs/worklog/ddpdoj/06-impl-pixel-slice.md`.
The DECODE was proved bit-exact in Python by wave 0 and gated by wave 3
(`NOTES-assets.md`); wave 6 translates it into the port's JavaScript and gates
**that**, because a Python decoder that scores 100 % says nothing about the JS
a browser runs.

```
python games/ddpdoj/tools/oracle/pgm.py pixslice              THE PIXEL GATE
python games/ddpdoj/tools/oracle/pgm.py pixslice --reuse --mutate all   9 RED
python games/ddpdoj/tools/oracle/pgm.py pixdemo               the demo capture
python games/ddpdoj/tools/oracle/pgm.py demogate              the demo, gated
python games/ddpdoj/tools/oracle/pgm.py demogate --break off-by-one
node --test games/ddpdoj/tests/                               61 pass, 0 skipped
```

## 0. The claim, and the number behind it

**136 frame pairs, 13,647,872 of 13,647,872 pixels identical to MAME's own
framebuffer, 100.0000 %.** Nine mutations, each breaking one rule, all seen RED.

```
PASS: 13647872/13647872 = 100.0000% over 136 frame pair(s);
      densest run 61 consecutive, busiest 122 sprites,
      biggest palette delta 403 words
```

The two sides are independently derived — this side is a transcription of
`igs023_video.cpp` into JS, the other is MAME's C++ executing. It is
deliberately **not** a comparison against `tools/framerender.py`: that would
compare a translation with its own source and could only find typos
(`docs/knowledge/03`, the two-sides rule).

## 1. What the renderer is, in one page

| | |
|---|---|
| module | `games/ddpdoj/src/render/` — `regions`, `tiles`, `spritelist`, `sprites`, `igs023`, `capture` |
| screen | 448 × 224, MAME's visible area. The cabinet is **TATE**: the game's long axis (`posY`) is the bitmap's **X** |
| fill | pen `0x3ff` (`igs023_video.cpp:772`) |
| BG | 64 × 16 tiles of 32×32, 5bpp, palette base `0x400`, 32 palettes of 32, **transparent pen 31**, per-row scroll |
| TX | 64 × 32 tiles of 8×8, 4bpp packed_lsb, palette base `0x800`, 32 palettes of 16, **transparent pen 15**, flat scroll, drawn LAST |
| sprites | length-compressed 5bpp streams; list walked **BACKWARDS**, first-drawn-wins, so a **higher list index draws IN FRONT** |
| priority | the record's `pri` bit means "behind the BG": `pri==0` draws unconditionally, `pri==1` loses every pixel the BG wrote |
| palette | xRGB_555, `pal5bit` = `(v<<3)|(v>>2)` |
| ctrl | bit 11 disables TX, bit 12 disables BG, bit 13 draws only `pri` records |

Region assembly is `pgm.cpp:5361-5386`. **`cave_t04401w064.u19` loads at
`0x180000`, not `0x200000`** — it OVERWRITES the top `0x80000` of
`pgm_t01s.rom`. Getting that wrong still renders a plausible picture: measured
at **46.7 %** of pixels correct over this corpus.

## 2. The two sample-point offsets are part of the renderer's contract

Both were measured in `00-recon-assets.md` §4 and are re-stated in
`src/render/igs023.js` because they are the reason a naive comparison is wrong:

1. Video state read at frame **N** is what MAME draws in frame **N+1**.
2. The palette that applies is **N+1's**, because `screen:pixels()` resolves the
   indexed bitmap at the END of the frame.

Wave 6 turned both into mutations. `state-same-frame` costs 27.6 % of the
pixels. `pal-same-frame` costs 7.4 % — **but only because wave 6 went and found
a fade**; see §3.

## 3. Two things the wave-3 corpus does not test, both measured, both fixed

Wave 3's gfx gate is green on 16 pairs. Two of the nine mutations stay green on
it, and that is a fact about the CORPUS, not about either decoder:

**(a) No palette fade.** The largest palette movement across all 32 dumped
frames is **three words of 2,560**, so frame N's palette and frame N+1's are the
same picture and the measured offset is untested. Found by censusing rather than
guessing (`PROBE_PALDELTA`, new):

```
CENSUS paldelta_top24 words_of_2560
  [vf1238/lf1204:403 vf1239/lf1205:399   <- a hard CUT
   vf1026/lf1002:217 vf1028/lf1003:215 vf1030/lf1004:212 ...
   vf1046/lf1013:188                     <- a sustained FADE, lf1002..1016
   vf716/lf699:181 vf2439/lf2405:138 ...]
```

The wave-6 corpus dumps lf 995..1020 (the fade) and lf 1198..1210 (the cut), and
the gate **FAILS** if no pair in it has a palette delta ≥ 100 words.

**(b) No sprite has its priority bit set.** Counted over the whole wave-3
corpus: **0 of 1,397 records**. So `pgm_draw_pix`'s priority test is exercised
by nothing, in the Python decoder either. Driven by intervention instead
(`PROBE_PRICOV`, new): two rows of the SAME sprite are written into the game's
own display list at the sample point, one row `pri=0`, one row `pri=1`, over
gameplay background, four batches walking down the screen.

```
natural corpus (128 pairs)  --mutate pri-ignore  100.0000 %  GREEN  <- untested
intervention   (8 pairs)    --mutate pri-ignore   99.8379 %  RED    <- 1,301 px
```

That is the whole argument for keeping interventions in the corpus: the number
0.0095 % is small and it is the difference between a rule that is verified and
a rule that is merely not contradicted.

## 4. The nine mutations, and what each one costs

Measured on the wave-6 corpus (136 pairs). The first six are wave 3's Python
set, re-expressed against the JS; on wave 3's own 16 pairs they reproduce that
gate's percentages **to four decimal places** (95.6651 / 72.4030 / 51.1631 /
97.2763 / 86.7132 / 52.8566), which is the strongest single piece of evidence
that the JS is a faithful translation and not a parallel invention.

| mutation | what it breaks | wave-6 corpus |
|---|---|---|
| `spr-mask` | mask bit polarity | 39.7776 % |
| `u19-at-200000` | the region overlap | 46.7007 % |
| `bg-planes` | BG plane weights | 66.3689 % |
| `state-same-frame` | sample-point offset 1 | 72.4366 % |
| `spr-order` | list drawn forwards | 79.7763 % |
| `pal-same-frame` | sample-point offset 2 | 92.5591 % |
| `tx-msb` | TX nibble order | 95.9603 % |
| `zoom-off` | the zoom loop | 99.6051 % |
| `pri-ignore` | sprite-vs-BG priority | 99.9905 % |

**`zoom-off` costs 0.4 % and `pri-ignore` costs 0.01 %.** Neither would be
caught by a gate that reported "about right".

## 5. The demo page, and exactly what it does not claim

`games/ddpdoj/index.html` + `src/web/app.js` (wave 6 put it at `web/app.js`;
wave 7 moved it under `src/` because `tools/build-dist.mjs` publishes
`games/<id>/src` and would have left a module under `web/` behind — a black
page and no message). The cadence is the board's —
15625/264 Hz, 16.896 ms per logic frame — and the host clock decides only how
many logic frames have come due, never what any of them computes
(`NOTES-replay.md` constraint 1).

**Simulated live:** the seven-call main loop, the counters and their three
masks, the ISR model, the input mirrors and edges, the frame-sync governor, the
object driver with its budget, and the player — position, velocity, tilt,
clamps, speed modes, options.

**Replayed:** everything else. Wave 11 ported main-loop call #4 (`$23D2AE`, the
display-list build) WHOLE — the 29-bucket gather, the pre-emptive drop policy,
the equality cap, the emit and the terminator, gated at **0 divergent frames
over 1,901 build-B frames** by `pgm.py dlgate` — but the port has a simulated
PRODUCER for exactly one of the thirty buckets (14, the shots), and 18 of the 20
top-level object handlers are still unported. So the pipeline is real and empty:
the background, the enemies and the HUD still come out of a 161-frame board
capture.

**WAVE 12 CHANGED WHAT THIS PARAGRAPH MEANS.** The eight player-attached records
are no longer MOVED; they are PRODUCED. `src/shipsprite.js` and
`src/options.js` port `$24A482` and `$24C096`, so the port fills buckets 19, 15
and 5 itself and `pgm.py shipgate` compares those bytes -- and the display-list
entries they become -- against the board at 0 divergent frames over 2,200 logic
frames. `splice` now writes each record's IMAGE (words 2-3) as well as its
position, from `manifest.ship.pairs`, so the ship banks. What the capture still
supplies is WHICH SLOT each record occupies, because the other 26 buckets have
no producer and the port cannot build the whole list yet.

The correlation sweep below is what FOUND the eight records, and it stays here
because it is still how the page decides which slots to write. It is no longer
how their contents are decided:

```
lag=0 conv=shift  best offset holds on  74/161 frames;   0 accepted
lag=0 conv=round                        58/161;          0 accepted
lag=1 conv=shift                       161/161;   3 ACCEPTED
                 [-24,-16] the ship, [-16,-41] and [-16,+24] the two pods
lag=1 conv=round                       102/161;          0 accepted
lag=2 conv=shift                        75/161;          0 accepted
lag=2 conv=round                        57/161;          0 accepted
```

Three independent confirmations fall out of that table: the sprite buffer really
does lag main RAM by one frame (PLAN §Assets); the fixed-point conversion is
TRUNCATION, not rounding; and the two pods sit at ±32.5 px around the ship
(`-41+8` and `+24+8` for a 16-px-wide record), which is the `±32.53 px` the
memmap recon measured from RAM by a completely different route.

**The demo path is gated end to end.** `pgm.py demogate` runs `app.js`'s
pipeline headlessly with the port driving the ship:

```
PASS: the port drives the ship and the page's own render path is
      15955968/15955968 = 100.0000% identical to MAME over 159 frames
  --break off-by-one     99.3113 %   (py shifted one pixel)
  --break frozen-player  98.2587 %
  --break no-input       98.2587 %
```

**What that gate cannot tell you**, and it must be said next to the 100 %:
because the port agrees with the board to the unit, the written list is
byte-identical to the board's own, so "the port drove the ship" and "nothing was
spliced" produce the same picture. What is proved is the other direction — the
pixels DO come from the number the port computed. Moving the port's `py` by one
pixel moves **691 pixels per frame, 0.6887 % of the frame**, against a ship
record of 48×32 px plus two 16-px pods. `frozen-player` and `no-input` print the
same 1.7413 % because in this window the script's first stick input is at
lf2000, so the two experiments coincide; a window starting mid-move would
separate them.

**There are no weapons.** Wave 5 came back BLOCKED: no enemy handler, no shot
handler and no bomb is translated. The fire keys drive the ported cadence
machine (`$249B2C..$249BE2`) and then reach a named throw at the ship-type jump
table. The plan's wave-6 demo clause asks for "shooting all three weapons"; that
half has no port behind it and the page says so on its face.

## 6. What is NOT covered

* **`bg_scale != 0x210`.** MAME does not implement the register. The gate FAILS
  any pair drawn with a different value rather than scoring it.
* **Mixed x/y zoom levels**, as in `NOTES-assets.md` §6 — unchanged here.
* **The browser page has never been executed.** No headless browser is installed
  and nothing may be downloaded. `demogate.mjs` runs everything except the
  fetch/assembly path, the canvas blit, the keyboard mapping and the
  `requestAnimationFrame` cadence loop; those four were UNTESTED in wave 6.
  **Wave 7 closed the first of the four** — `tools/webgate.mjs` starts a real
  HTTP server over `assets/`, loads the bundle through the page's own
  `httpReader` (same `r.ok` check, same `.gz` naming, same
  `DecompressionStream`) and renders a frame from it, with three breaks that go
  red. THE OTHER THREE ARE STILL UNTESTED: the canvas blit, the keyboard and
  pointer events, and the `requestAnimationFrame` cadence. A human with a
  browser has to look.
* **Sprites the corpus never displayed**, and therefore stream shapes the
  drawer has never walked. Presence, not coverage.
* **The published bundle vs. the cartridge.** `tools/bundlegate.mjs` proves the
  363 KiB exported bundle renders the same 15,955,968/15,955,968 pixels the
  58 MiB cartridge does — but only for THIS capture. Any new capture needs
  `node tools/export-web.mjs` re-run; the bundle's boot-time coverage check
  turns a stale bundle into a message naming the frame and the tile rather than
  a blank tile, which is the only reason that is safe.
