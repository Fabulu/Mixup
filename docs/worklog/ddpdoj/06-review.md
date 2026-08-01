# Wave 6 review — the pixel slice

status: DONE
wave: 6   role: review   started: 2026-08-01

## The task, as I understood it

Verify, by content and by re-running, the wave-6 implementer's commit `ecb2bd6`
("WAVE 6: the pixel slice"). READER only: no edits to `games/ddpdoj/src/` or
tools except three deliberate, hashed-and-restored breaks; no commits.

## Verdict

**The pixel half is sound and reproduces exactly.** Every headline number was
re-measured on this machine and matched to the digit, including a FRESH MAME run
that re-dumped the whole corpus. Three findings, none of which touch the
renderer's correctness; the largest is that the wave's own stated blocker
("no headless browser is installed") is FALSE — I ran the demo page, it works,
and pressing the shot key **silently freezes it**.

## What I MEASURED

### 1. Everything the implementer claimed, re-run

```
$ node --test games/ddpdoj/tests/
# tests 61  # pass 61  # fail 0  # skipped 0

$ python games/ddpdoj/tools/oracle/pgm.py pixslice --reuse
PASS: 13647872/13647872 = 100.0000% over 136 frame pair(s); densest run 61
      consecutive, busiest 122 sprites, biggest palette delta 403 words

$ python .../pgm.py pixslice --reuse --mutate all
BASELINE: PASS
  tx-msb 95.9603  bg-planes 66.3689  spr-mask 39.7776  zoom-off 99.6051
  spr-order 79.7763  u19-at-200000 46.7007  pal-same-frame 92.5591
  state-same-frame 72.4366  pri-ignore 99.9905      ALL RED, 9/9

$ python .../pgm.py demogate
PASS: ... 15955968/15955968 = 100.0000% identical to MAME over 159 frames
  --break off-by-one     99.3113 %  RED
  --break frozen-player  98.2587 %  RED
  --break no-input       98.2587 %  RED

$ python .../pgm.py gate
run 1 = run 2 = 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
IDENTICAL                       <- unmoved; frame.lua's new blocks are inert

$ python .../pgm.py flyaround
COLS   34 compared
DIGEST c752ac4c2ed0d9733cefbd95908f5b5eabb32b6df7af1c36d140f9a3c3c73209
RESULT 0 DIVERGENT FRAMES on 34 columns over 2200 logic frames   <- unmoved
```

**Fresh, not reused** — `pgm.py pixslice` with no `--reuse`, i.e. a new MAME run
that deleted and re-dumped `rip/pix-slice` (115 dumps) and `rip/pix-pri` (9):

```
PASS: 13647872/13647872 = 100.0000% over 136 frame pair(s)   (identical totals)
MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
BUILD required=B frames_on_required=1901 frames_on_other=699
CENSUS armpc 13C5B6:699 23C212:1901        <- chooser in A, then 1901 frames in B
CENSUS halt_loop_interrupts=0
```

**It is VERSION-B.** The 699 build-A frames are the chooser (arm PC `$13C5B6`);
every dumped frame is at lf >= 995, i.e. inside the 1901 build-B frames, and the
run asserts the LAST frame is in B.

### 2. Claims I checked independently, not just re-ran

* **The JS is a translation, not a parallel invention** — I ran wave 3's Python
  gate and wave 6's JS gate side by side on the same 16 pairs. Not "to four
  decimal places": **identical to the pixel**.
  `tx-msb 1536030 / bg-planes 1162525 / spr-mask 821491 / zoom-off 1561899 /
  spr-order 1392295 / u19-at-200000 848682`, all of 1605632, both gates.
* **The two corpus holes are real.** `pal-same-frame` and `pri-ignore` both score
  `PASS 1605632/1605632 = 100.0000%` on `rip/gfx-gate` (max palette delta there
  is 3 words), and `pri-ignore` scores `PASS 12845056/12845056 = 100.0000%` over
  the 128 NATURAL pairs but `FAIL 801515/802816 = 99.8379%` on the 8
  intervention pairs. My own census of the dumps:
  `gfx-gate 1397 records, pri=1 -> 0`; `pix-slice 9774 records, pri=1 -> 0`;
  `pix-demo 7671 records, pri=1 -> 0`; `pix-pri 180 records, pri=1 -> 48`.
* **The ship correlation reproduces exactly** (re-ran `pixpack.mjs` into a
  scratch dir): `lag0/shift 74, lag0/round 58, lag1/shift 161 with 3 accepted,
  lag1/round 102, lag2/shift 75, lag2/round 57`.
* **The `--break no-lag` 117/161 is exactly right.** I counted, from
  `out/w6/demo.tsv`, the frames where the truncated position changes between
  lf-1 and lf: **117 changed, 44 unchanged**. The stated explanation is precise.
* **The pod geometry.** Records 17/18 are `w=2 h=16` (32x16 px), record 19 is
  `w=3 h=32` (48x32, the ship). Ship centre = (cy, cx) exactly; pod centres are
  `cx-41+8 = cx-33` and `cx+24+8 = cx+32`, i.e. -33/+32 against the memmap's
  +-32.53. The arithmetic is right; the prose calling the pods "16-px-wide" is
  loose (16 is their HEIGHT, which is the axis the +8 applies to).
* **ROM provenance.** Every file in `rip/rom/` matches MAME's `ROM_START(
  ddpdojblk)` CRC32: `pgm_t01s.rom 1a7123a0, cave_t04401w064.u19 3a95f19c,
  cave_a04401w064.u7 ed229794, cave_a04402w064.u8 752167b0,
  cave_b04401w064.u1 17731c9d, ddb10_10_8_434f.u45 d21561db` — the Black Label
  program, not `ddb_1dot.u45`.
* **`regions.js` against MAME's source**, `pgm.cpp:5359-5385` in the scratchpad
  copy: `igs023` region `0xa00000`, `pgm_t01s.rom @0`, `u19 @0x180000 len
  0x800000`; `sprcol` `0x2000000` REGION16_LE with u7@0 / u8@0x800000; `sprmask`
  `0x1000000` with one 0x800000 file. Transcribed correctly.
* **`sprites.js` / `spritelist.js` / `tiles.js` / `igs023.js` against
  `igs023_video.cpp`**: `get_sprites` field extraction, `sext(11)/sext(10)`,
  `0x10-z` grow flip, `zoom_word`'s `z>=0x10 -> 0` / `z==0xf -> 1`,
  `get_sprite_pix`'s 5-bit/3-per-word walk, the `>>2` mask header,
  `pgm_draw_pix`'s `if(!(destpri&1)){ if(!pri || !(destpri&2)) ... }`,
  first-drawn-wins, the backwards walk, ctrl bits 11/12/13, `bitmap.fill(0x3ff)`,
  the BG per-row scroll `(y+bg_yscroll)&0x1ff` / `bg_xscroll+rowscroll[y]`, the
  transparent pens 31/15, colour bases 0x400/0x800 — all match. The two places
  the JS deliberately differs (an early `return` for `wide==0||high==0`, and the
  dropped early-out `return`s in the zoomed path) cannot change output; I
  checked the reasoning line by line.
* **ROM bytes at the addresses the code cites** (decrypted image
  `rip/sound/maincpu.bin`, 0x600000):
  `$2410C4: 4B F9 00 80 E2 40 70 13 32 15 67 18 02 41 00 FF E7 49 2F 0D 3F 00` =
  `lea $80E240,A5 / moveq #$13,D0 / move.w (A5),D1 / beq / andi.w #$ff,D1 /
  lsl.w #3,D1 / move.l A5,-(A7) / move.w D0,-(A7)` — exactly frame.lua's
  documented driver. `$23BE8C: 52 79 00 80 39 0A ...` = `addq.w #1,$80390A`,
  `bset #0,$80390D`, `addq.w #1,$80390E`, `cmpi.w #3` — exactly as documented.
  `$249BE2: move.w ($58,A6),D0 / add.w D0,D0 / lea ($0A,PC),A0 / nop /
  adda.w D0,A0 / jmp (A0)`, table at `$249BF4`: entry 0 `bra.w -> $249BFC`,
  entry 2 `bra.w -> $249D2C`. The two throw addresses in `player.js` are the
  real targets, and they are build-B (`$24xxxx`).

### 3. Breaks I made myself, watched go red, and restored byte-identically

sha256 before == after for all three (`tiles.js
2880bbb301b0b96fb9b12fe67b054f47ff8920f6cd7f5b21679727264ada8a08`,
`sprites.js 1438c0fb2380a4c33291f698c29ca3d95fbb47147e9bcaf0a9e1846f9f37bf12`,
`igs023.js 3cb4173f6196248f82215439aa1832d60d315a4853e1c7738160ae2e23041adb`).

| break | full 136-pair corpus |
|---|---|
| `buildBgMap` transparent pen 31 -> 30 | `FAIL 13640675/13647872 = 99.9473%` |
| `_drawPix` first-drawn-wins removed | `FAIL 10887764/13647872 = 79.7763%` |
| `Renderer._key` returns a constant (cache never invalidated) | `FAIL 7071983/13647872 = 51.8175%` |

The third answers the implementer's question 5: the tile-map cache **is**
exercised and a stale map is caught hard. Note the first: on a 12-pair subset the
same break stayed 100.0000 % — the BG-transparency rule is worth only 0.05 % of
the corpus, so it is the dense/varied corpus that catches it, not the gate.

The gate's corpus thresholds are also capable of failing — `pixgate.mjs` on
`rip/gfx-gate` alone with wave 6's thresholds prints
`FAIL TOO FEW PAIRS: 16 < 60`, `FAIL NO PALETTE-FADE FRAME: ... 3 words, 100
required`, `FAIL NO DENSE STRETCH: ... 1, 40 required`. And the "densest run 61"
is genuinely inside one dump dir (`gfx-gate densest 1, pix-slice densest 61,
pix-pri densest 8`), not an artifact of concatenating dirs.

### 4. THE BROWSER PAGE — the blocker is not real, and the page has a bug

The worklog says: *"THE BROWSER PAGE HAS NEVER BEEN EXECUTED. There is no
headless browser on this machine and the brief forbids downloading one."*

**This machine has three, already installed, no download required:**

```
/c/Program Files/Google/Chrome/Application/chrome.exe          (Chrome 150)
/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe
/c/Users/<user>/AppData/Local/ms-playwright/chromium-1234/
/c/Users/<user>/AppData/Local/ms-playwright/chromium_headless_shell-1234/
```

I served the repo (`python -m http.server`, then a small node static server) and
drove Chrome headless over the DevTools protocol (Node 20's
`--experimental-websocket` gives a global `WebSocket`; ~35 lines of CDP is
enough — `--virtual-time-budget` is what does NOT work here, it advances the
page's clock through the 34 MiB of fetches and freezes JS mid-boot, which is
probably what a first attempt would have looked like).

**The page runs.** After 60 s:

```
status ""   err ""
hud    logic 5387  video 5423  py 4473 (69.89 px)  px 5312 (83.00 px)
       tilt 0  $80390A 4688  logic Hz 59.880  capture f2042/lf2006
prov   capture: 161 frames of 'fly-around' from lf2000; ship records identified
       at lag 1, conversion shift, offsets (-16,24)x161 (-16,-41)x161 (-24,-16)x161
canvas 98972 of 100352 non-black px
```

and the screenshot is stage 1 drawn correctly, tate, with the ship and both pods.
Keyboard works and hits the measured clamps:

```
idle        py 4473 (69.89 px)   px 5312 (83.00 px)   tilt 0
ArrowUp     py 25856 (404.00 px) px 5312 (83.00 px)   tilt 0     <- the wall
ArrowLeft   py 25856             px 768 (12.00 px)    tilt -32   <- the [12,212] clamp
```

**And pressing Z (shot) kills the demo silently.** `logic` stops advancing and
never resumes; `#err` stays empty and `#status` stays empty, so the page looks
alive with the last frame still on the canvas. Two uncaught exceptions in the
console:

```
Unreached: UNPORTED $249BFC: THE SHOT SPAWN for ship type 0 ...
  at unreached (src/unported.js:35:9)
  at bombAndShotGuards (src/player.js:372:3)
  at finish (src/player.js:265:3)
```

The throw itself is correct and loud in the console — but `Demo.loop()` has no
`try/catch`, so the throw escapes before `requestAnimationFrame` is
re-scheduled. The `boot()` catch does not cover the loop. The banner does warn
that the fire keys reach a named throw; a user still gets a dead page with no
message, and pressing fire is the first thing anyone does in a shmup.

### 5. Smaller things

* **The SPLICE ROUND-TRIP gate is a tautology w.r.t. record identity.**
  `pixpack.mjs` stores `player[i] = [s.i, s.x - cy, s.y - cx]` recomputed from
  the same frame, so `splice` writing back `cy + dx` reproduces `s.x` for ANY
  record. Demonstrated: I substituted records 0/1/2 (which are not the ship) for
  17/18/19 and the round-trip still printed `0 of 161 frames diverged`. The three
  `--break`s perturb the input position, not the identification, so they do not
  close it either; nor does `demogate`, for the same reason. What actually
  supports the identification is the correlation sweep (3 offsets at 161/161
  while 5 of 6 lag/conversion combinations accept nothing) — which is good
  evidence. The round-trip proves only that the word masks preserve the other
  fields. `NOTES-render.md` §5 and the worklog oversell it as "or the page would
  draw a ship in the wrong place".
* **`demogate.mjs:134` takes the palette from `(i + 1) % cap.length`.** On the
  last capture frame that wraps to frame 0's palette. It is inert today only
  because `rip/pix-demo/f002197.pixels.bin` does not exist, so that iteration is
  `continue`d and 159 of 160 are compared. On a capture whose last pair IS
  dumped, and in a window with a fade, it would report a false divergence.
  `web/app.js:145` has the same expression, where it is deliberate (a looping
  capture) and documented.
* **"58 MiB the page fetches"** (index.html, `NOTES-render.md`, worklog item 4)
  is wrong: the five files total **34 MiB**; 58 MiB is the size of the assembled
  region buffers. The page's own status text says 34.
* **The machine pin is printed but not enforced by default.**
  `pgm.py:109 PINNED_MAINCPU_FNV64 = os.environ.get("PGM_PIN") or "AUTO"` and
  `check()` skips the comparison when it is `"AUTO"`. `NOTES-versions.md` §4
  says the harness "stops a cross-session number loudly". It prints
  `D4C25CA9C91B9D47` on every run (I saw it) but would not stop anything unless
  `PGM_PIN` is set. Pre-existing (wave 1), not wave 6's — recording it because
  wave 6's worklog opens by citing the pin.
* **`Renderer._key` is an FNV-1a *hash*, not "the videoram bytes themselves"** as
  the code comment and worklog claim. A 32-bit collision would silently reuse a
  stale tile map. Astronomically unlikely and irrelevant to the gate; the wording
  is what is wrong.
* **The renderer ignores ctrl bit 0 (sprite DMA enable).** MAME's `get_sprites()`
  returns early when it is clear and redraws the previously parsed list; since
  the JS parses the dumped `spritebuffer` (which the DMA did not update either),
  the result is the same. Correct, but undocumented.

### 6. REPO HAZARD, not wave 6's doing but live right now

The SHARED index (`.git/index`) currently has **every wave-4/5/6 ddpdoj file
staged as DELETED** while the files exist on disk:

```
$ git status --porcelain games/ddpdoj/src/render/tiles.js
D  games/ddpdoj/src/render/tiles.js
?? games/ddpdoj/src/render/tiles.js
$ git diff --cached --name-only | wc -l      -> 57 ddpdoj paths, all deletions
```

`HEAD` is fine (`git ls-tree -r HEAD games/ddpdoj` has them all). But a bare
`git commit` by any agent in this repo right now would delete the entire ddpdoj
port from HEAD. The private-index procedure in the brief (`GIT_INDEX_FILE`,
`git read-tree HEAD`) is exactly what avoids it, and the wave-6 implementer did
use `.git/ddpdoj.index`. Somebody should `git read-tree HEAD` the shared index.
I did not touch it — reviewers do not commit.

## What I could not do, and why

* I did not re-run wave 3's `gfx`, `zoomcov`, `sprites`, `sound`, `assets.py
  check`, nor `rtc`/`drc`/`seedstate`/`overrun`/`objdriver`, nor `pgm.py check`
  end to end. `pgm.py gate`'s hash and the fresh `pixslice` census are the
  evidence that the machine and the harness did not move.
* I did not re-derive the wave-4 player or wave-5 enemy work; `flyaround` was
  re-run only for its digest.
* I did not test the demo page in Firefox/Safari, on a real display, or with a
  gamepad; nor did I test its behaviour past the 161-frame capture loop point
  beyond ~90 s of runtime.
* Every slowdown-adjacent figure I quote (`work_cycles`, `spin_iters`) is the
  harness's own and remains **MAME-timed, uncalibrated**.

## If someone picks this up cold

The three commands that prove the wave, in order of cost:

```
node --test games/ddpdoj/tests/                       ~1 s
python games/ddpdoj/tools/oracle/pgm.py pixslice --reuse   ~1 min
python games/ddpdoj/tools/oracle/pgm.py pixslice           ~10 min (fresh MAME)
```

And to see the demo, which the wave believed impossible here:

```
node -e "..."  # or: python -m http.server 8123   (from the repo root)
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=old \
  --remote-debugging-port=9333 --user-data-dir=<tmp> about:blank &
node --experimental-websocket <cdp client>   # Page.navigate, wait REAL time,
                                             # Page.captureScreenshot
```

Do **not** use `--virtual-time-budget`: it advances `Date.now()` through the
34 MiB of fetches and freezes the page mid-boot at "loading ... (2/34 MiB)",
which reads exactly like a hang in the app.
