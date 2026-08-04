# 42 — IMPL: strip the recorded enemies out of the DRAW path

status: **DONE** — gate `ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED`, unit
tests 546 -> 553, and the page was driven in a real browser.
started / finished: 2026-08-04. WAVE 37.
mandate: owner, `39-OWNER-visible-play-before-sound.md` — "Also we have to get rid
of the recorded enemies, they look retarded." + "go removal first."
spec: `41-recon-sprite-art.md` §5, work item **W-A**.

Scope: `games/ddpdoj/src/web/app.js` `Demo.draw()` only, AFTER the splice.
**NOT** `tools/export-web.mjs` — see recon §5.3: `bundlegate.mjs` demands
100.0000 % pixel identity from the published bundle, and stripping in the DATA
path would turn that gate red for the right reason.

## 1. THE RECON'S NUMBERS, RE-MEASURED INDEPENDENTLY — CONFIRMED TO THE DIGIT

Before touching `app.js` I wrote a SECOND implementation of the strip (a
scratchpad harness, not the one under test) and drove it through the page's own
`loadBundle` and the real `Renderer` over the real published bundle, all 161
frames, comparing palette indexes:

```
frames                 161
display-list records   7671 -> 886
per frame              23..72 before, 5..6 after
changed pixels         1452475 of 16156672 = 8.9899 %
changed span           x 2..447, y 0..223
classes surviving      8
    3x32 c0 p0 f0     THE SHIP
    2x16 c0 p0 f0     option pod
    2x16 c0 p0 f2     option pod
    5x40 c2 p0 f0     exhaust plume
    1x32 c26 p0 f0    exhaust glow
    1x16 c24 p0 f0    SHIP SHADOW
    1x8  c24 p0 f0    option shadow
    1x8  c24 p0 f2    option shadow
throws                 0
```

**`41-recon-sprite-art.md` §5.2 is right in every figure**: 7,671 -> 886 (88.45 %
of the records go), 8.99 % of pixels, 23..72 -> 5..6 per frame, span x 2..447 /
y 0..223, no throw. The 8 survivors are exactly the 8 attached classes of
`capture.js`'s wave-9 matcher and nothing else. Nothing to report as a
divergence from the recon.

## 2. THE CHANGE

`games/ddpdoj/src/web/app.js`:

- **`stripToAttached(st, recs)`** — exported and PURE, for the same reason
  `pickScale` and `streamColumnOf` are: a method on an unexported class cannot
  be tested and this one decides what the player sees. It compacts the records
  `cap.attached()[fi]` names to the front of `st.spritebuffer` and writes the
  hardware's own terminator (`word4 & $7FFF == 0`) after them. Compaction is
  in place and safe because `attached()` is built by walking `parseSpriteList`
  in order, so the kept indices ascend and the destination never runs ahead of
  the source. RELATIVE ORDER SURVIVES, which matters: a higher list index draws
  IN FRONT, and the shadows are below the ship on 243 of 243 recorded records.
  **The two impossible cases are LOUD, not quiet.** A non-ascending or
  out-of-range index throws by name instead of being skipped: a `continue`
  there would turn a broken matcher into a ship that silently stops being
  drawn, which is the exact failure shape this project keeps paying for.
- **`Demo.draw()`** calls it AFTER `this.cap.splice(...)` and before
  `renderIndexed`. The order is forced: `splice` addresses records by their
  index in the ORIGINAL list and `#shipRecord` identifies the ship by its size
  word among those same indices.
- **`Demo.stats()`** gains `stripped` / `kept`, and `index.html` prints
  `rec-N keep M` on the status line every frame. An empty sky with no
  explanation is the same defect class as a black screen with no explanation.
- The header block's SIMULATED/REPLAYED list and the page's own prose are
  rewritten in the same commit, because `app.js`'s header says to and because
  the old text ("the enemies cannot see you and cannot be shot") is now false.

**NOT** `tools/export-web.mjs`, and a test asserts that it stays that way.

## 3. THE PAGE, IN A REAL BROWSER — the check no gate in this repo makes

The brief asked whether the actual page could be observed. **It can.**

**This falsifies a premise six documents in this repo rest on.**
`tools/webgate.mjs`'s header, `tests/web-page.test.js`'s header, and worklogs
07, 09, 14 and 27 all say "there is no browser on this machine" — 07 twice, and
09 says it "governs everything below". Measured today: **Chrome and Edge are
both installed**
(`C:\Program Files\Google\Chrome\Application\chrome.exe`) and the Python
`playwright` package (1.58.0) is already present — nothing was downloaded. I am
not claiming nobody has ever done this; I am claiming the documents that say it
is impossible are wrong, and that is worth more than this wave.

So the page was served over `python -m http.server`, loaded in a real headless
Chrome, driven with the keyboard, and read back through its own DOM.

`chrome --headless --screenshot` ALONE IS NOT ENOUGH and that is worth writing
down: under `--virtual-time-budget` the boot never completes — at budgets of
8 s, 12 s, 16 s and 20 s the shot came back on `loading gfx/bg.pal.u16.gz…` and
`loading gfx/bg.tileno.u16.gz…`, i.e. mid-`loadBundle`, and at 120 s Chrome
exited 2. Virtual time and the loader's `DecompressionStream` do not get along.
Playwright driving real time works first try.

**AFTER the change** (12 s of free running, then a left/down fly, then fire):

```
BOOTED   lf 2011  69.9,83.0px  clk 106 bg 2640 col 0  shards 4/8  rec-22 keep 5  27.5Hz
+12s     lf 2736  69.9,83.0px  clk 174 bg 3186 col 17 map 57 shards 8/8  rec-48 keep 6  56.2Hz
flying   lf 2855  32.0,12.0px  clk 181 bg 3246 col 19 map 59 shards 8/8  rec-29 keep 6  60.0Hz
canvas   224x448, 83,399 of 100,352 px lit, 115 distinct colours
```

- **HUD survives**: `PLAYER-1`, the score, `PRESS START`, the MAX power bar and
  the `B B B` bomb count are all on screen.
- **Background survives and SCROLLS**: `bg` 2,640 -> 3,246, `col` 0 -> 19,
  `map` 57 -> 59, all 8 shards land.
- **The ship survives and FLIES**: 69.9,83.0 -> 32.0,12.0 px on the arrows, with
  its exhaust flame, its pods and its shadows.
- **The recorded enemies are gone.** `rec-22..48` records dropped per frame.
- **No new throw.** Pressing fire reaches `UNPORTED $24C180: THE LASER` — which
  is `39-OWNER`'s already-known blocker, and it is reached identically on the
  PRE-CHANGE tree, so it is not this wave's.
- **And the error box works.** The screenshot after fire shows the page's own
  `$24C180 IS NOT PORTED YET. This is not a crash...` panel with the whole ROM
  message. (My first probe read `#status`, which `showError` CLEARS; the text
  goes to `#err`. That was my instrument, not the page.) So the failure a
  player hits is a named, readable stop, not a freeze.

**BEFORE the change, same script, same 12 s**: no `rec-` field, 81,953 px lit,
**151 distinct colours** (vs 115 after) — and the screenshot is the owner's
complaint made visible: a swarm of recorded tanks floating **over the rooftops
and across the HUD**, in a part of the picture where no ground vehicle can be.
That is what a 161-frame loop replayed against a 7,317-frame computed scroll
looks like. It is direct visual confirmation of `39-OWNER`'s explanation,
which that document explicitly asked to be re-checked rather than assumed.

## 4. EVERY CHECK SEEN TO FAIL

Six mutations, each turning a NAMED test red, tree restored and hashed
byte-identical after every one:

| mutation | red |
|---|---|
| M1 the terminator is not written | `the strip keeps the ATTACHED records and nothing else` (+1) |
| M2 the strip keeps everything | same (+2), and `webgate` prints `FAIL ... 7671 -> 7671 ... 0.0000 %` |
| M3 the strip edits a surviving record | `the strip keeps the ATTACHED records and nothing else` |
| M4 the survivors come out reversed | same (+2) |
| M5 `draw()` strips BEFORE it splices | `Demo.draw() really calls them in that order` |
| M6 the page claims the recorded enemies are still on screen | `the page says the recorded enemies were REMOVED...` |

And the whole-file red: with `HEAD`'s `app.js` restored, the new test file does
not even load and `webgate` fails at import — the checks cannot pass on the
pre-change tree.

**Where the real-bundle numbers live.** `tests/` must pass on a tree with no
cartridge, so the unit tests use the synthetic capture. The 7,671 -> 886
assertion is in `tools/webgate.mjs`, which already exits 2 rather than skipping
when `assets/` is missing. It is TWO-SIDED on the pixel fraction (0 % = the
strip did nothing, ~100 % = it wrecked the screen) and checks that the worst
stripped frame is still >50 % lit, which is the "HUD and background survived"
assertion in machine-readable form. Measured there: **100.0 % lit**.

## 5. THE BRIEF'S PREMISE, CHECKED

The brief was right, and that is worth saying plainly because eight briefs on
this project have not been. The change is in the right file, does exactly what
was described, and the measured effect is the recon's to the digit. Three small
corrections, none of which changes the work:

1. **`41-recon-sprite-art.md` §5.1 says "let the next record's already-zero
   word 4 terminate the list". That is not safe** and the implementation does
   not rely on it. Compaction happens inside a buffer that still holds the
   recording's own records behind the survivors, so the word after the last
   survivor is whatever the board wrote, not zero. The terminator is written
   explicitly. Mutation **M1** removes that write and the strip test goes red,
   so this is a measured correction rather than a stylistic one.
2. **The recon's §3.2 lists L4 (player shot sprites) among the rows removal
   empties. It is not**: the player's shots were never in the capture, so there
   was nothing to remove. L4 stays `open` in the ledger with a note.
3. The brief says "HUD / background / scroll untouched". Confirmed — but the
   stronger statement, which only the browser could make, is that they are
   untouched **and still correct on screen** after 850 logic frames of live
   play with all eight background shards landed.

## 6. THE GATE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
```

Unchanged from W32/W33/W34/W35/W36's 49/0/0. **Nothing was disabled, skipped,
narrowed or loosened.** Every stage read individually, not just the verdict
line — including `pixel gate ... vs MAME`, `demo gate: the port drives the ship,
pixel-exact` and its four REDs, and `background shard gate`, all of which are
the pixel-identity gates a strip in the DATA path would have broken. They are
green because the strip is in the PAGE, which is the whole point of §5.3 of the
recon.

**One honesty note about the count.** The runner's `port unit tests` stage
executed at **552** — it ran early in a ~40-minute gate, before the last test
(`a broken attached set THROWS by name...`) was added. The final tree is
**553 passed, 0 failed, 0 skipped**, re-run afterwards. No other stage reads
any file this wave touched (`app.js` is imported by no gate; `demogate.mjs`
and `pgm.py` only NAME it in comments), so nothing else could have been caught
mid-edit.

Also green on the final tree, and not part of `pgm.py check`:

```
node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets
PASS: 14 files fetched over HTTP ... one frame rendered 100352 px with 99105 (98.8%) non-black
PASS: W37 strip over 161 frames -- display-list records 7671 -> 886 (expect 7671 -> 886),
      8 classes survive (expect 8), 1452238/16156672 px changed = 8.9885 %,
      worst stripped frame 100.0 % lit
```

(8.9885 % here vs 8.9899 % in §1 because this run splices the capture's own
player position first and §1's harness did not. Same measurement, 1.4e-3 apart.)

## 7. WHAT THIS WAVE DID *NOT* DO, DELIBERATELY

- **Nothing in `tools/export-web.mjs`.** No asset is rebuilt; boot is byte-for-
  byte what it was. The 14.5 KiB the recon says could be reclaimed by shrinking
  the sheet to the 100 surviving streams needs `verifyCoverage` and
  `bundlegate` reworked first, and "removal must not ship with a bundle change"
  is the recon's own rule (§6).
- **`bundlegate`'s tolerance is untouched**, and a new test asserts that
  `exact === total` is still in it.
- **The drift RATE against the board was not measured** — that needs MAME and
  stays open (`41-recon-sprite-art.md` §7.5). What this wave adds is a
  screenshot showing recorded ground vehicles drawn across the ROOFTOPS, which
  is direct visual evidence for the mechanism without measuring its magnitude.

## LOG (appended as findings arrive)

- opened.
- §1 [M]: the recon's numbers reproduce **exactly** on an independent
  implementation — 7,671 -> 886 records, 8.9899 % of pixels, 0 throws, the 8
  attached classes survive.
- §2: implemented in `app.js` only. The exporter is untouched and a test now
  asserts it stays untouched, alongside `bundlegate`'s `exact === total`.
- §3 [M]: **the actual browser page was driven, for the first time on this
  project** — Chrome + Python playwright. HUD, background, scroll, shards and
  ship all survive; the recorded swarm is gone; the fire throw is unchanged and
  pre-existing. The BEFORE screenshot shows recorded tanks drawn over the
  rooftops, which is `39-OWNER`'s drift explanation confirmed by eye.
- §3 [M]: `chrome --headless --screenshot --virtual-time-budget` CANNOT boot
  this page (it stalls inside `loadBundle`); playwright in real time can.
- §4 [M]: six mutations, six named reds, six byte-identical restores.
- §5: the brief's premise HOLDS. Three small corrections, none changing the
  work: the recon's "already-zero word 4" terminator is not safe (M1 proves
  it), L4 was not affected by removal, and "untouched" understates what the
  browser could show.
- §6 [M]: **`pgm.py check` ALL GREEN 49/0/0, 0 SKIPPED**; unit tests
  546 -> **553**, 0 skipped; `webgate` green on both its stages.
- **CARRIED FORWARD, and it is bigger than this wave:** a browser-driven
  PLAYABILITY gate — load the page, run frames, press fire, fail on any throw —
  is BUILDABLE on this machine today. `39-OWNER` §"THE GAP THIS EXPOSES" asks
  for exactly that and every document here said it was impossible. The recipe
  is `python -m http.server` + Python `playwright` + `channel="chrome"`; not
  `chrome --headless --virtual-time-budget`, which cannot get past `loadBundle`.
  Next wave's cheapest large win.

status: **DONE**
