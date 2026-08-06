# WAVE 7 - get it on the live site

status: **DONE**, with one thing I could not do and could not fake: **no part of
this page has ever been run in a browser.** There is no browser on this machine
and the brief forbids downloading one. Everything else below is a command in
this file with its actual output. The human-check list is §9 and it is not
optional reading.
wave: 7   role: impl   started: 2026-08-01

All addresses are **VERSION-B** (`$23xxxx`–`$28xxxx`, 2002.10.07 BLACK VER)
unless a line says build A.

## THE HEADLINE

```
node games/ddpdoj/tools/export-web.mjs
  BUNDLE games\ddpdoj\assets: 363.2 KiB served          (was 58 MiB + 4.0 MiB)

node games/ddpdoj/tools/bundlegate.mjs ...
  PASS: the PUBLISHED BUNDLE renders 15955968/15955968 = 100.0000% identical
        to MAME over 159 frames
  4 of 4 breaks RED

node games/ddpdoj/tools/webgate.mjs ...
  PASS: 11 files fetched over HTTP in 622 ms, assembled, and one frame
        rendered 100352 px with 99105 (98.8%) non-black
  3 of 3 breaks RED

node --test games/ddpdoj/tests/      77 pass, 0 fail, 0 SKIPPED   (was 61)

node tools/build-dist.mjs
  rom-leak guard: 166 files checked (8 also checked decompressed) against
  12 ROM(s) -- clean, 1 deliberate exception(s)
  dist/ built: 170 files, 2414 KB

UNMOVED (wave 6's gates, re-run):
  demogate  15955968/15955968 = 100.0000% over 159 frames
  pixgate   13647872/13647872 = 100.0000% over 136 frame pairs
  gradius   node --test games/gradius/tests/  292 pass, 0 fail, 0 skipped
```

## 1. What I found when I started

- `games/ddpdoj/index.html` + `web/app.js` existed and had **never been
  executed**. They fetched `rip/` directly - **58 MiB of cartridge graphics**
  plus a **4.0 MiB** board capture. Nobody serves that to a phone.
- **`web/` would never have been published at all.** `tools/build-dist.mjs`
  copies `games/<id>/src` and `games/<id>/index.html`; a module under `web/`
  is silently left behind. That is a black page and no message.
- No `game.json`, not in `games/index.json`, not in `build-dist.mjs`.
- No touch controls of any kind. Keyboard bound to `KeyZ` only.
- **No `onError` channel.** Every unported path in this port is a throw; the
  fire button reaches one. Thrown inside `requestAnimationFrame` it lands where
  nothing is listening and the canvas freezes silently - the exact defect
  reported from play on Gradius as "softlocks and screen freezes".
- **And the leak guard was VACUOUS for this game.** It reads ROMs matching
  `\.(gb|gbc|nes|sfc|smc|gen)$` **in the repo root**. DaiOuJou's cartridge is
  ten files with names like `cave_a04401w064.u7` under `games/ddpdoj/rip/rom/`.
  It would have printed "clean" having never read a byte of the cartridge it
  was supposed to be checking against. §6.

## 2. THE SMALLEST HONEST ASSET BUNDLE - the measurement, then the export

Wave 6 wrote the 58 MiB off as untrimmable: *"cannot be trimmed to what this
capture uses without a second measurement, because a sprite stream on this board
cannot be random-accessed"* (`06-impl-pixel-slice.md` §"What I could not do" 4).

**This is that second measurement, and the argument that makes it exact.** The
page draws 161 captured frames on a loop with the ship spliced in, and
`src/render/capture.js`'s `splice()` touches **only the position fields** - word
0 bits 10..0 and word 1 bits 9..0. It never touches `offs`, `width`, `height` or
a tile number. So the set of ROM bytes the page can *ever* read is fixed by the
capture and enumerable:

```
node games/ddpdoj/tools/export-web.mjs
coverage over 161 captured frames, 7671 records:
  BG tiles 415   TX tiles 159   sprite streams 150
```

415 of 16,384 possible BG tiles. 11,325 mask words of 8,388,608 and 21,784
colour words of 16,777,216 - **0.13 % of each sprite region**.

Tile coverage is every `bgram[ti*2]` for ti in 0..1023 and every `txram[ti*2]`
for ti in 0..2047, over all 161 frames, because `buildBgMap`/`buildTxMap` decode
**every** map entry whether it is on screen or not. Sprite coverage walks each
record's mask stream exactly as `SpriteDrawer` does and counts: `2 + wide*high`
mask words, one 5-bit pixel per CLEAR mask bit, three pixels to a colour word.
Both drawing paths consume identically - a ygrow-doubled line REWINDS and
replays the same words, a yzoom-dropped line is consumed without being drawn -
and if that reading of `sprites.js` were wrong by one word the bundle gate in §3
would stop being 100 %.

### The output is not a slice of the cartridge

* **Tiles are DECODED.** 5bpp LSB-first bitstream → one byte per pixel; 4bpp
  packed-lsb → one byte per pixel. The same transformation
  `games/gradius/assets/chr/tiles.u8` is.
* **Sprite streams are RE-BASED** into a compact 16-bit address space. Each
  stream's two-word header is *rewritten* to point at its colour data's new
  address (and the two bits the `>>> 2` discards are written as zero), and
  **every display-list record in `capture.bin` has its `offs` field rewritten**
  to the new base. The published `spr/mask.u16` is a different address space
  from the cartridge's.

The exporter *refuses* to re-base if two streams' mask blocks overlap, because
then rewriting one header would corrupt the other's data. Measured: 150 streams
coalesce to exactly 150 disjoint mask blocks, so they do not.

### The sizes

```
  gfx/bg.tiles.u8.gz          158569 B  (from 424960 B)
  gfx/bg.tileno.u16.gz           635 B  (from 830 B)
  gfx/tx.tiles.u8.gz            2549 B  (from 10176 B)
  gfx/tx.tileno.u16.gz           297 B  (from 318 B)
  spr/mask.u16.gz               5021 B  (from 32768 B)
  spr/col.u16.gz               28701 B  (from 65536 B)
  capture.bin.gz               67495 B  (from 4131904 B)     <- 61:1
  seed.bin.gz                   6878 B  (from 131072 B)
  player.tables.json           57940 B
  manifest.json                 5666 B
  capture.json                 38202 B
BUNDLE: 363.2 KiB served
```

**Everything binary is gzipped and inflated by `DecompressionStream`.** The
capture is 161 nearly identical frames of video state and compresses 61:1; that
is the whole difference between a 4.0 MiB fetch and a 66 KiB one. `.gz` is not
served with `Content-Encoding`, so the browser hands us the envelope and we open
it - and if a CDN ever does set that header, the failure is a named message
saying exactly that, not a stream `TypeError` (`webgate --break not-gzip`).

In `dist/` the whole page comes to **549.2 KiB**: 360.4 KiB of assets (the
manifest is re-minified by `build-dist`), 166.9 KiB of port JavaScript (text,
so the CDN compresses it) and 22 KiB of page and manifests.

### FAIL LOUDLY, and the specific failure that has no symptom

A 404 on a `.bin` yields an **empty buffer**, and a zero-filled tile sheet
renders a perfectly plausible empty starfield. So:

1. every fetch checks `r.ok` (`src/web/assets.js` `httpReader`);
2. every length is asserted against the manifest;
3. the array lengths are asserted to be powers of two, because `SpriteDrawer`
   indexes with `& (len-1)`;
4. `capture.json` must be marked `rebased`, or it is the raw oracle capture
   whose offsets point at cartridge addresses this bundle does not contain;
5. **`verifyCoverage()` runs at boot over all 161 frames** - every tile number
   in both tilemaps and every sprite record - and a miss is a message naming the
   frame, the map entry and the tile.

## 3. THE BUNDLE GATE - `tools/bundlegate.mjs`

`demogate.mjs` proves the demo path off the *cartridge*. This asks the only new
question wave 7 raises: does the same path off the *363 KiB bundle* produce the
same pixels?

```
$ node games/ddpdoj/tools/bundlegate.mjs --assets games/ddpdoj/assets \
      --dump games/ddpdoj/rip/pix-demo --tsv games/ddpdoj/tools/oracle/out/w6/demo.tsv
PASS: the PUBLISHED BUNDLE renders 15955968/15955968 = 100.0000% identical to
      MAME over 159 frames
  bundle: 415 BG tiles + 159 TX tiles decoded, 150 sprite streams (11325 mask
          + 21784 colour words packed into 16384 + 32768), 161 capture frames
```

It runs `loadBundle()` - the page's own loader, not a second reader - so the
assembly, the length assertions and the coverage check are all under test.

**Four breaks. Every one seen to fail.**

```
--break drop-tile    AssetError: capture frame 0 (lf2000) uses BG tile 2936 at
                     map entry 531, which the exported sheet does not contain
--break drop-stream  AssetError: capture frame 91 (lf2091) record 51 points at
                     packed sprite offset 0, which is not an exported stream base
--break zero-col     14280066/15955968 = 89.4967% -- diverged, as it must
--break blank-tile   15804494/15955968 = 99.0507% -- diverged, as it must
```

### THE FOURTH ONE CAUGHT ME, exactly the way wave 6 said it would

`blank-tile` first blanked "the middle slot of the sheet" and came back
**15955968/15955968 STILL EXACT**. Not because the renderer is wrong - because
most of the 415 exported BG tiles are in the tilemap **without ever being on
screen**: `buildBgMap` decodes all 1,024 map entries and the visible window is
224 rows of 448 pixels out of a 512×2048 map.

A break that cannot fail is worth nothing (`docs/knowledge/03`), so the victim is
now *measured*: the visible tile cells are computed from each frame's
`bg_yscroll`, `bg_xscroll` and rowscroll exactly as `igs023.js` computes them,
and the tile blanked is the one maximising (frames visible) × (pixels that are
not the transparent pen 31).

```
  victim: BG tile 3073, on screen in 161 of 161 frames, 1024/1024 pixels opaque
EXPECTED-RED [--break blank-tile]: 15804494/15955968 = 99.0507%
```

`mostVisibleBgTile()` **throws** rather than returning if no visible opaque tile
exists, so this cannot silently degenerate again.

## 4. THE PAGE - `games/ddpdoj/index.html` + `src/web/`

`web/app.js` is **moved to `src/web/app.js`** and the old copy deleted, because
`build-dist.mjs` publishes `games/<id>/src` and would have left it behind.
`NOTES-render.md`, `tools/demogate.mjs` and `pgm.py`'s docstring were updated to
say so; wave 6's worklog is left as the historical record it is.

Three modules, all published:

| file | what |
|---|---|
| `src/web/assets.js` | the bundle loader: `httpReader` (r.ok), `gunzip`, assembly, `verifyCoverage` |
| `src/web/input.js` | keyboard + the on-screen pad, ending as one 68000 port word |
| `src/web/app.js` | `boot(canvas, {onError})`, `fitCanvas`, the frame loop |

**The renderer was not modified.** `TileCache` already accepts
`bgTileFn`/`txTileFn`, so the decoded sheets go in through an existing seam, and
`SpriteDrawer` only ever sees two typed arrays. `roms.igs023` is handed in as a
**zero-length** array: with both tile functions overridden nothing in
`src/render/` reads it (`tiles.js` holds the only two readers), and zero length
makes that a range error rather than a wrong tile if that stops being true.

### The onError channel, and why it is not optional

```js
const app = await boot(canvas, {
  onError: (e) => showError(e, 'The port reached something it has not ported.'),
});
```

`boot()` resolves long before the frame loop runs, so its caller's `try/catch`
cannot see a throw from inside `requestAnimationFrame`. The loop stops being
rescheduled and the canvas holds its last frame. `app.js` wraps every tick,
stops **cleanly** on a throw (rather than throwing once per frame forever),
hands the error to `onError`, and re-throws to keep the console trace. The page
prints the message with a line saying that a `$23xxxx`/`$24xxxx` address means
*that path is not ported yet, not a mystery crash*. **The fire buttons reach one
of these in normal play**, so this is a first-minute-of-play path, not an
exotic one.

### MOBILE CONTROLS

* **Pointer events, not touch events.** One path for finger, pen and mouse.
* **`setPointerCapture`** on press, so a finger sliding off a control still
  delivers its release. Without it: a stuck direction.
* **`touch-action: none` + `preventDefault`**, or the browser decides the
  gesture was a scroll and steals it mid-press.
* **A backstop on `blur` / `pagehide` / `visibilitychange`** clearing the whole
  mask, for every interruption the controls never see. The keyboard and touch
  masks are cleared **separately** and OR'd, the same split Gradius uses: a lost
  keyup and a lost pointerup are different failures with different recoveries,
  and merged, the keyboard's blur reset would wipe a finger still on the screen.
* **A 3×3 HIT-TESTED D-PAD, ONE capture target.** Four capture-holding buttons
  can *never* report a diagonal - the capture that stops a stuck direction is
  what stops a second button ever seeing the finger - and DaiOuJou is a vertical
  shooter where the diagonal is how you leave a bullet pattern. The corner
  thirds report **two bits**, which is what `$803970` carries anyway: one bit
  per direction, tested independently by the mover at `$141B2E`. Out-of-range
  coordinates land in the outer bands by construction, so a finger that has slid
  off keeps the direction it slid towards.
* **Landscape** puts the pad in the letterbox beside the 224×448 picture rather
  than under it, so `fitCanvas` can pick a bigger integer scale;
  `pointer-events` is off on the container and back on for the two clusters so
  the invisible strip cannot swallow a tap.

**`e.code`, and `KeyZ` AND `KeyY` both bound to shot.** The owner's keyboard is
Swiss QWERTZ: the key printed Z sits where QWERTY has Y and reports `KeyY`. It
has its own test so a tidy-up cannot drop it:

```
ok 65 - both KeyZ and KeyY are SHOT (Swiss QWERTZ)
```

### Integer scaling in DEVICE pixels

`fitCanvas()` floors `min(availW*dpr/224, availH*dpr/448)` and sets the CSS size
to `scale*logical/dpr`, plus `image-rendering: pixelated` and
`canvas.dataset.scale`. A fractional scale puts the canvas's 1:1 pixels on
non-integer device pixels and the browser resamples them - the Batman port
shipped a dithered circle that looked like tetris pieces because of exactly
this. Re-fit on `resize`, `orientationchange` and `visualViewport` resize (the
URL bar sliding away moves only the visual viewport).

### BEING HONEST ON THE PAGE

The banner says, in the page's own words: the ship flies and is computed live
(0 divergent frames over 2,200 logic frames on 34 columns); the picture is
pixel-exact (15,955,968/15,955,968); **everything else you see is a replayed
board capture and the enemies are not simulated and cannot be hit**; there are
**no weapons and no sound**, wave 5 came back BLOCKED, and pressing fire reaches
a named throw. A collapsible section lists which command measured which number,
and ends with what is *not* measured - including that no part of the page had
been run in a browser before it was first published.

## 5. THE BROWSER FETCH PATH, GATED - `tools/webgate.mjs`

Wave 6 listed four untested things and this closes the first. It starts a real
`node:http` server over `assets/` and loads the bundle through the page's own
`httpReader` - same `r.ok`, same `.gz` naming, same `DecompressionStream` - then
renders a frame and requires a picture rather than a black rectangle.

```
$ node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets
PASS: 11 files fetched over HTTP in 622 ms, assembled, and one frame rendered
      100352 px with 99105 (98.8%) non-black
  manifest.json gfx/bg.tiles.u8.gz gfx/bg.tileno.u16.gz gfx/tx.tiles.u8.gz
  gfx/tx.tileno.u16.gz spr/mask.u16.gz spr/col.u16.gz capture.json
  capture.bin.gz seed.bin.gz player.tables.json

--break missing-file  AssetError: assets/gfx/bg.tiles.u8.gz: HTTP 404. ...
--break truncated     AssetError: assets/gfx/bg.tiles.u8 is 423936 B, the
                                  manifest says 415 x 1024 = 424960
--break not-gzip      AssetError: a gzipped asset did not inflate (incorrect
                                  header check). If the server sets
                                  Content-Encoding: gzip on .gz files ...
```

622 ms for the whole bundle over loopback. **THE OTHER THREE OF WAVE 6's FOUR
ARE STILL UNTESTED**: the canvas blit, the keyboard and pointer events, and the
`requestAnimationFrame` cadence. §9.

## 6. THE ROM-LEAK GUARD WAS VACUOUS FOR THIS GAME. I STRENGTHENED IT AND BROKE IT THREE WAYS.

The brief says do not weaken the guard. What I found is that for DaiOuJou it was
not weak, it was **blind**, in two independent ways:

1. **The corpus.** `tools/build-dist.mjs` read ROMs matching
   `\.(gb|gbc|nes|sfc|smc|gen)$` **in the repo root**. An arcade set is not one
   file with a console's extension: DaiOuJou's is ten files named
   `cave_a04401w064.u7` and so on, 42 MiB, under `games/ddpdoj/rip/rom/`. The
   guard would have printed "clean" having read nothing of the cartridge in
   question.
2. **Compression.** Every binary in my bundle is gzipped, and **gzip bytes never
   appear inside a ROM whatever they decompress to**. Shipping compressed assets
   would have made the guard structurally unable to see their contents.

Both fixed, both additive:

* the corpus now also includes every file under `games/<id>/rip/rom/` when
  present (best-effort by construction - `rip/` is gitignored scratch - so it
  can only ever strengthen the check);
* a shipped `.gz` is **inflated and the decompressed body checked too**, and a
  file named `.gz` that fails to inflate is a build failure, because the guard
  cannot see inside it;
* the `< 1 KB, a coincidental match means nothing` early-out now applies to the
  **body**, not the file. That distinction cost a red-validation run: a `.gz` of
  64 KiB of mask ROM came to **96 bytes** on the wire, so the old early-out
  skipped it and the guard printed "clean" over a planted leak;
* `rom.includes(body)` became `containsVerbatim()` - same answer, but it
  searches for one 4 KB window from the MIDDLE of the body and memcmps at each
  candidate. With a 42 MiB corpus the naive search took the build from under a
  second to **over two minutes**, and a publish gate nobody will wait for is a
  publish gate that gets a skip flag added to it. Now 22 s.

**Seen to fail, three ways** (planted, then removed):

```
64 KiB of cave_t04401w064.u19, raw:
  REFUSING TO BUILD: games/ddpdoj/assets/leaktest.bin (65536 B, verbatim inside
  games/ddpdoj/rip/rom/cave_t04401w064.u19)

the same 64 KiB, gzipped to 96 B:
  REFUSING TO BUILD: games/ddpdoj/assets/leaktest2.bin.gz (65536 B,
  decompressed, verbatim inside .../cave_t04401w064.u19)

64 KiB of cave_a04401w064.u7 (127 distinct byte values), gzipped to 26062 B:
  REFUSING TO BUILD: games/ddpdoj/assets/leaktest3.bin.gz (65536 B,
  decompressed, verbatim inside .../cave_a04401w064.u7)
```

And the real build, clean:

```
$ node tools/build-dist.mjs
published verbatim, deliberately: games/batman/assets/player.tiles.bin (6974 B) -- ...
rom-leak guard: 166 files checked (8 also checked decompressed) against 12 ROM(s)
  [Batman - Return of the Joker (USA, Europe).gb, Gradius (USA).nes,
   games/ddpdoj/rip/rom/cave_a04401w064.u7, .../cave_a04402w064.u8,
   .../cave_b04401w064.u1, .../cave_m04401b032.u17, .../cave_t04401w064.u19,
   .../ddb10_10_8_434f.u45, .../ddp3blk_defaults.nv, .../ddp3_bios.u37,
   .../pgm_m01s.rom, .../pgm_t01s.rom]
  -- clean, 1 deliberate exception(s)
dist/ built: 170 files, 2414 KB
```

**No allowlist entry was added and `SUBSTITUTE` is still empty.** Nothing in
DaiOuJou's bundle is a verbatim slice of its cartridge, and that is now measured
rather than asserted.

## 7. WIRED INTO THE SITE

* `games/ddpdoj/game.json` - `code.page`, **not** `code.entry`/`mods`/`input`;
  `display.frameHz` **15625/264 = 59.185606060606**, derived not rounded, and
  `src/web/app.js` **refuses to boot** if it disagrees with
  `MACHINE.refreshHz` by more than 1e-6. Tested.
* `games/index.json` - `ddpdoj` added.
* the root launcher - `PLATFORM.pgm = 'IGS PGM (arcade)'`; the `code.page`
  branch that already existed for Gradius handles the card.
* `tools/build-dist.mjs` - `GAMES` and `PAGES`.
* `tools/publish.mjs` - a DaiOuJou stage (unit tests, bundle gate, fetch gate)
  that refuses to publish if any is red; and the post-deploy poll now also
  requires `/games/ddpdoj/` to be 200, **`/games/ddpdoj/assets/manifest.json` to
  be 200** (the page is static HTML and 200s whether or not the bundle
  deployed - a 404 asset is the silent-empty-starfield failure), and `ddpdoj` to
  be in the live `games/index.json`. `--only ddpdoj` added; the `--only`
  conditions were rewritten as `only === null || only === '<id>'`, because the
  old `only !== 'batman'` form would have run Gradius on `--only ddpdoj`.
* `games/ddpdoj/README.md` - the "it is **still not** in `games/index.json`,
  and that is now a decision" paragraph is replaced with why that reversed.

## 8. THE UNIT SUITE: 61 → 77, still 0 skipped

`tests/web-input.test.js`, and nothing in it touches the cartridge -
`node --test games/ddpdoj/tests/` is the cheap stage that must work on a tree
with no ROMs extracted. It holds the control tables against **all four** places
they are spelled: `index.html`'s markup, `src/web/input.js`, `game.json`, and
`src/machine.js`'s measured `BIT`. Plus the d-pad hit test cell by cell, the
corner-diagonal property, the slid-off-the-pad property, the touch/keyboard mask
split, and the board's own measured port words ($FFFE for Start alone, $FF7F for
Button 3).

It caught its own first bug: scraping `data-cell` from the whole file found
**ten** cells in a 3×3 grid, because the stylesheet contains `data-cell=""` too.
Scoped to the pad's markup.

## 9. WHAT I COULD NOT DO - READ THIS BEFORE CALLING IT DONE

**I COULD NOT TEST IN A BROWSER.** There is no browser on this machine, headless
or otherwise, and the brief forbids downloading one. Every number in this file
is headless. What that leaves for a human, in the order I would check it:

1. **Open `/games/ddpdoj/` on the phone.** Does anything draw at all? A black
   canvas with no error text means the loop never started; a black canvas with
   red text means the port told you where it stopped, and that message is the
   most useful output this port has.
2. **Fly.** Arrow keys / d-pad. Does the ship move, and does it move *smoothly*
   at ~59 Hz? The `logic Hz` figure in the status line should sit near 59.19.
3. **THE DIAGONAL.** Put a finger in a corner third of the d-pad and check the
   ship moves diagonally, and that sliding from LEFT into UP+LEFT without
   lifting works.
4. **The stuck-direction test.** Hold a direction, slide the finger off the pad
   and off the screen edge, lift. The ship must stop. Then switch apps
   mid-press and come back: it must stop.
5. **Press SHOT.** It *should* stop the loop and print a named throw with a
   `$249xxx` address. If it freezes silently instead, the `onError` wiring is
   wrong and that is the single most important thing to report.
6. **The pixels.** At an integer scale the art must be crisp. If it looks soft
   or the dithering looks like blocks, `fitCanvas` picked a fractional scale -
   `canvas.dataset.scale` on the element says which.
7. **Rotate the phone.** Landscape should put the pad beside the picture and
   the canvas should still be an integer scale.
8. **Reload with a cold cache** and watch the status line count the files. If a
   `.gz` arrives already inflated (a CDN setting `Content-Encoding`), the page
   says so by name.
9. **The launcher card** at `/` should read "IGS PGM (arcade) · Cave / AMI ·
   2002 · own page" and link to the page rather than trying to boot it inline.

Other things I did not do:

* **The enemies are still a recording** and every weapon is still unported. That
  is wave 5's BLOCKED chain and it was explicitly not this wave's job.
* **No sound at all.** Not started.
* **`buildid.js`** is written into `dist/games/ddpdoj/src/` by `build-dist`'s
  generic loop and this port does not read it. Batman and Gradius use it to
  detect a mixed deploy (new JS + old manifest). Worth wiring up; not done.
* **The `--only` refactor in `publish.mjs` changes behaviour for
  `--only <unknown>`**: previously an unknown value ran both games, now it runs
  neither. That is arguably better and is certainly different.
* **`04-review.md` / `05-review.md` leftovers** are still leftover. Untouched
  again, deliberately.
* **`games/gradius/` and `games/batman/` untouched.** The two shared files I did
  change - `tools/build-dist.mjs` and `tools/publish.mjs` - I re-ran for
  Gradius afterwards (`292 pass, 0 fail, 0 skipped`) and the guard output for
  Batman's `player.tiles.bin` exception is byte-for-byte what it was.

## 10. If someone picks this up cold

```
node games/ddpdoj/tools/export-web.mjs        build assets/ from rip/  (363 KiB)
node games/ddpdoj/tools/bundlegate.mjs --assets games/ddpdoj/assets \
     --dump games/ddpdoj/rip/pix-demo --tsv games/ddpdoj/tools/oracle/out/w6/demo.tsv
node games/ddpdoj/tools/bundlegate.mjs ... --break drop-tile|drop-stream|zero-col|blank-tile
node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets
node games/ddpdoj/tools/webgate.mjs ... --break missing-file|truncated|not-gzip
node --test games/ddpdoj/tests/               77 pass, 0 skipped
node tools/build-dist.mjs                     the leak guard, 22 s
python -m http.server 8000                    then open /games/ddpdoj/
```

**Five things that will save you the hours they cost me:**

1. **`build-dist.mjs` publishes `games/<id>/src` and `games/<id>/index.html` and
   nothing else.** A page module anywhere else is silently absent from the
   deploy. That is a black page with no message, and it is why `web/app.js`
   moved.
2. **A leak guard is only as wide as its corpus and only as deep as its
   compression.** Ours was blind to arcade ROM naming *and* to gzip. Both were
   found by planting a leak and watching it not be caught. Plant one.
3. **The splice touching only position fields is what makes the bundle
   enumerable.** If a future wave splices an ANIMATION FRAME - a different
   `offs` - the coverage argument collapses and `export-web.mjs` must be
   re-derived. The boot-time check will say so loudly rather than drawing a
   blank, but it will say it on the phone, not here.
4. **Most exported BG tiles are never on screen.** 415 tiles are in the tilemap;
   the visible window is a fraction of a 512×2048 map. Any experiment that
   picks "a tile" at random will pick an invisible one and prove nothing.
5. **`DecompressionStream` is in node 18+ as well as every target browser**,
   which is the only reason `webgate.mjs` can run the page's exact loader.
   Do not replace it with a bundled inflater; that would fork the path under
   test away from the path that ships.
