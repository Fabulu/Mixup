# WAVE 7 REVIEW — publish

status: **DONE** — verdict **defects-found** (nothing blocking; the page boots,
renders, reports its errors, and no gate of wave 7's is fake)
wave: 7   role: review   started: 2026-08-01   commit under review: `b7263e9`

READER. No commit from this wave. Every number below was re-measured on this
machine; nothing was taken from the implementer's report.

All addresses VERSION-B (`$23xxxx`–`$28xxxx`) unless the line says build A.

---

## 1. What re-ran clean

```
node tools/build-dist.mjs
  published verbatim, deliberately: games/batman/assets/player.tiles.bin (6974 B)
    -- the player animation tile pool, fetched by games/batman/src/assets.js:82
  rom-leak guard: 166 files checked (8 also checked decompressed) against 12 ROM(s)
   [Batman - Return of the Joker (USA, Europe).gb, Gradius (USA).nes,
    games/ddpdoj/rip/rom/{cave_a04401w064.u7, cave_a04402w064.u8, cave_b04401w064.u1,
    cave_m04401b032.u17, cave_t04401w064.u19, ddb10_10_8_434f.u45,
    ddp3blk_defaults.nv, ddp3_bios.u37, pgm_m01s.rom, pgm_t01s.rom}]
   -- clean, 1 deliberate exception(s)
  dist/ built: 170 files, 2414 KB

  THE DELIBERATE EXCEPTION IS BATMAN'S, NOT DAIOUJOU'S.  Nothing of ddpdoj's is
  allowlisted; SUBSTITUTE is still empty.

node games/ddpdoj/tools/bundlegate.mjs --assets games/ddpdoj/assets ...
  PASS 15955968/15955968 = 100.0000% over 159 frames
node games/ddpdoj/tools/bundlegate.mjs --assets dist/games/ddpdoj/assets ...   <-- NOT TESTED BY THE IMPLEMENTER
  PASS 15955968/15955968 = 100.0000%          (dist re-minifies manifest.json)
  --break blank-tile   victim: BG tile 3073, on screen 161/161, 1024/1024 opaque
                       EXPECTED-RED 15804494/15955968 = 99.0507%
  --break drop-stream  EXPECTED-RED AssetError: capture frame 91 (lf2091) record 51 ...

node games/ddpdoj/tools/webgate.mjs --assets games/ddpdoj/assets       PASS, 11 files, 1309 ms
node games/ddpdoj/tools/webgate.mjs --assets dist/games/ddpdoj/assets  PASS, 11 files, 1207 ms

node --test games/ddpdoj/tests/     77 pass, 0 fail, 0 skipped
node --test games/gradius/tests/    292 pass, 0 fail, 0 skipped
node tools/pixgate.mjs --rom rip/rom --dump rip/gfx-gate --dump rip/pix-slice --dump rip/pix-pri
  PASS 13647872/13647872 = 100.0000% over 136 frame pair(s)
node tools/demogate.mjs --rom rip/rom --web rip/web --dump rip/pix-demo --tsv .../demo.tsv
  PASS 15955968/15955968 = 100.0000% over 159 frames
```

Sizes, measured: `games/ddpdoj/assets` = **371,953 B = 363.235 KiB**;
`dist/.../assets` = 369,009 B = 360.36 KiB; whole dist page = 562,421 B =
549.24 KiB. Manifest: bg 415, tx 159, streams 150, frames 161, encoding gzip.
Every claimed size and count reproduces.

### dist/ contains what the page fetches

`dist/games/ddpdoj/` walked: all 11 assets (`manifest.json`, `gfx/{bg,tx}.{tiles.u8,tileno.u16}.gz`,
`spr/{mask,col}.u16.gz`, `capture.json`, `capture.bin.gz`, `seed.bin.gz`,
`player.tables.json`) plus `game.json` and `index.html`. The ES-module graph
from `index.html` resolves to **22 modules with 0 missing**. Four files ship but
are unreachable: `src/{buildid,enemies,state,weapons}.js`.

`dist/_headers` sets `Cache-Control: no-cache` on `/games/*`, so the bundle
revalidates and a mixed deploy cannot stick.

Nothing ROM-derived committed: `git ls-files games/ddpdoj/assets games/ddpdoj/rip`
is EMPTY; `assets/.gitignore` is `*` and root `.gitignore:22` ignores `assets/`.

---

## 2. THREE CHECKS BROKEN, ALL SEEN RED, ALL RESTORED BYTE-IDENTICAL

### BREAK A (new check, mine) — the onError channel

I wrote a headless page harness (stub canvas/rAF, real `node:http` origin,
the page's own `src/web/app.js` + `src/web/input.js`) and deleted
`opts.onError?.(e);` from `app.js`'s frame-loop catch.

```
baseline   SHOT HELD: onError called 1 time(s); loop still running = false
--BREAK--  SHOT HELD: onError called 0 time(s); loop still running = false
           RED: onError=0, blits=27, diagonal=true, release-clears=true
restored   sha256 5122d057cfe52b7f938d2955cc90cc2626699ae647d594bd696347c2f2f55a38  (identical)
```

### BREAK B (new check, mine) — `KeyY`

Removed `KeyY: 'SHOT'` from `src/web/input.js`'s `KEYMAP`.

```
--BREAK--  KEYBOARD e.code=KeyY -> mask 0x0 NOT SHOT -- FAIL
           node --test games/ddpdoj/tests/  not ok 64, not ok 65, 75 pass 2 fail
restored   sha256 a47f7c90428101d5472b50ef46b66feca6a44117a6c88979174f835621e020c4  (identical)
```

### BREAK C — the leak guard, with MY OWN bytes

Planted `games/ddpdoj/assets/REVIEW-leak.bin.gz` = 64 KiB of
`cave_a04402w064.u8` at $200000, gzipped to 44,403 B on the wire.

```
$ node tools/build-dist.mjs ; echo EXIT=$?
EXIT=1
REFUSING TO BUILD: dist/ contains verbatim cartridge data.
  games/ddpdoj/assets/REVIEW-leak.bin.gz  (65536 B, decompressed, verbatim inside
  games/ddpdoj/rip/rom/cave_a04402w064.u8)
$ ls dist    -> No such file or directory     (dist/ was removed, as designed)
```

Removed, rebuilt: 170 files, 2414 KB, clean. The guard is real and its new
`.gz`-inflate + `games/*/rip/rom/*` corpus both work.

---

## 3. THE THREE THINGS THE IMPLEMENTER LEFT TO A HUMAN — two of them now measured

Harness: real HTTP origin over `assets/`, `boot(canvas,{base,gameJson,target,onError})`,
a manual rAF pump, a stub 2d context counting `putImageData`.

```
BOOT: 27 canvas blits over 30 rAF ticks, lf=2027, onError calls so far 0

SHOT HELD (e.code=KeyY): onError called 1 time(s); loop still running = false
  message: UNPORTED $249BFC: THE SHOT SPAWN for ship type 0 (dispatched by
           $249BE2's two-entry jump table at $249BF4) ...
  names a ROM address: YES     $249BFC is VERSION-B
  the same throw ALSO escaped the rAF callback (console trace kept): yes
  after 30 more ticks onError calls went 1 -> 1 (must not grow: OK)

DIAGONAL: corner third mask=0x5 bits=[0,2] want=0x5 -> TWO BITS, OK
  slide LEFT-only=0x4  back-to-corner=0x5  off-screen=0x5  after-release=0x0
  port word neutral=0xffff corner=0xfff5 -> reaches the 68000 word, OK

KEYBOARD e.code=KeyZ -> 0x10 SHOT OK ; KeyY -> 0x10 SHOT OK ; Space -> 0x10 SHOT OK
```

So human-check items **3 (the diagonal)**, **4 (stuck direction)** and
**5 (SHOT reaches a named throw and the loop stops cleanly)** are now measured
headlessly and all pass. Item 5 in particular: the channel is REAL, exactly once,
carrying a VERSION-B address, and it does not re-fire.

Still genuinely untestable here: a real browser's canvas raster, real pointer
event dispatch, real rAF cadence, `matchMedia('(pointer: coarse)')`, CSS layout
and `devicePixelRatio`.

---

## 4. DEFECTS

### D1 (moderate) THE PAGE OVERCLAIMS: the option pods are NOT computed live

`games/ddpdoj/index.html:150` banner —

> "Its position, velocity, tilt, clamps, speed modes **and its two option pods**
> are computed **live, by the port**"

and `src/web/app.js:13` lists "options" under **SIMULATED**. Against the tree:

* `docs/worklog/ddpdoj/04-impl-skeleton-and-player.md` §"What I could not do" 1
  is titled **"THE OPTION OBJECT IS NOT PORTED."**
* `games/ddpdoj/src/state.js:95` — *"The option columns. Separate because the
  option OBJECT is not ported in wave 4"*; `OPTION_COLUMNS` are excluded from the
  34 compared columns the same banner cites.
* No writer exists: `grep p1Options games/ddpdoj/src/` finds only the address
  constant and the two read-only comparison columns. `$24D130`, `$24C33E`,
  `$24C310`, `$24C900` appear nowhere in `src/`.
* `src/render/capture.js:80` `splice(st,i,py,px)` moves all THREE records —
  ship and both pods — to `(py>>6)+dx, (px>>6)+dy` where `dx,dy` are the
  **captured** per-frame offsets from `frames[i].player`. The pods replay the
  board's recorded offsets from the port's ship. That is replay, not simulation.

This is the one claim on the page that is not true, and it is the claim class
the page exists to avoid. One clause to fix.

### D2 (moderate) The named "Content-Encoding" message does not fire in the common case

`src/web/assets.js:98–109`:

```js
const total = +(r.headers.get('content-length') || 0);
if (!r.body || !total) return new Uint8Array(await r.arrayBuffer());
const out = new Uint8Array(total);
... out.set(value, n);
```

`total` is the **compressed** length; with `Content-Encoding: gzip` the client
inflates transparently and `out.set` overruns. Measured, serving `assets/**.gz`
two ways:

```
Content-Encoding: gzip WITH content-length   -> RangeError: offset is out of bounds
                                                mentions Content-Encoding: NO
Content-Encoding: gzip, chunked (no length)  -> AssetError: a gzipped asset did not
                                                inflate ... If the server sets
                                                Content-Encoding: gzip on .gz files ...
                                                mentions Content-Encoding: YES
```

A static-file CDN that pre-compresses sends the length. So worklog §2's *"if a
CDN ever does set that header, the failure is a named message saying exactly
that"* and human-check item 8 hold only for the chunked variant, and
`webgate --break not-gzip` only ever exercises that variant. The user still sees
a message (the boot `try/catch` catches it) — it just says "offset is out of
bounds". Fix: size `out` from the manifest, or drop the streaming path when
`content-encoding` is present, or wrap the `out.set` in the named AssetError.

### D3 (minor) `spr/col.u16.gz` DOES contain a verbatim cartridge slice — 22,040 bytes of it

The guard asks "is the WHOLE file a slice". I asked the stricter question, from
high-entropy seeds only so zero padding cannot masquerade (300 probes/file,
24-byte seed requiring ≥8 distinct values, extended both directions):

```
dist/.../spr/col.u16.gz    LONGEST VERBATIM RUN inside sprcol  = 22040 B  (body offset 5145)
dist/.../spr/mask.u16.gz   LONGEST VERBATIM RUN inside sprmask =   401 B
dist/.../gfx/bg.tiles.u8.gz  vs igs023 = 0 B
dist/.../gfx/tx.tiles.u8.gz  vs igs023 = 0 B
window 5145..27185: distinct bytes 127, zeros 684/22040 (3.1%)   <- real art, not padding
```

Half of the 44,226 used bytes of the colour file is one unbroken copy of the
sprite-colour ROM. That is inherent — only the mask **headers** are rewritten,
colour blocks are copied — and it is the same class as Batman's documented
deliberate exception, with `assets/` gitignored and uncommitted either way. But
worklog §2's heading *"The output is not a slice of the cartridge"* is true at
file granularity and true for the tiles, and NOT true for `spr/col.u16`. The
guard structurally cannot see it.

### D4 (minor) A build-A address without the caveat

`games/ddpdoj/game.json:58` and `07-impl-publish.md:261`: *"one bit per
direction, tested independently by the mover at `$141B2E`"*. `$141B2E` is
**build A** (it comes from `00-recon-memmap.md`, pre-version-pin). game.json's
own `rom.note` says an address in `$13xxxx/$14xxxx` is a defect unless a comment
says why, and the worklog's header says the same. The VERSION-B mover writes are
`$2417F4/$2417F8` (`src/player.js:187-188`), clamp store `$2496E8`.
(`$13D464` in `src/web/input.js` is build A and IS labelled as such — correct,
per 02/04-review: a VERSION-B run really does execute build A's IRQ6.)

### D5 (minor) The guard's allowlist bypass runs BEFORE the gz inflate

`tools/build-dist.mjs`: `const why = PUBLISH_VERBATIM.get(rel); if (why) {
deliberate.push(...); continue; }` sits above the `.gz` handling, so an
allowlisted `.gz` is never inflated, never checked, and is reported at its
COMPRESSED size. Not exploitable today (the map holds one `.bin`), but it is the
same shape as the hole wave 7 just closed.

### D6 (informational) `tools/publish.mjs:106-110` comment is stale

*"It has NO allowlist... The pool is now replaced at copy time by original
placeholder art"* — the build prints `published verbatim, deliberately:
games/batman/assets/player.tiles.bin (6974 B)` and `1 deliberate exception(s)`.
`PUBLISH_VERBATIM` still holds it. Pre-existing, untouched by wave 7, and it
concerns Batman, so I left it alone per the brief.

### D7 (informational) The publish gate gates the SOURCE bundle, not the shipped one

`publish.mjs` runs bundlegate and webgate against `games/ddpdoj/assets`;
`build-dist` re-minifies `manifest.json` on the way into `dist/` (5666 → 2722 B),
so the gated bytes are not the deployed bytes. I ran both gates against
`dist/games/ddpdoj/assets` — 100.0000 % and PASS — so this is a gap in the gate,
not a live defect.

### D8 (informational) Four modules ship unreachable

`dist/games/ddpdoj/src/{buildid,enemies,state,weapons}.js` are not in the page's
module graph. `buildid.js` was disclosed; the other three are dead weight.

---

## 5. What I did NOT re-run, and why

* **MAME itself.** Every pixel gate here compares against dumps already in
  `rip/`; I re-ran the gates, not the capture. The wave-4 figure "0 divergent
  frames over 2,200 logic frames on 34 columns" is therefore inherited, not
  re-measured.
* **A real browser.** None on this machine, downloading forbidden. Human-check
  items 1, 2, 6, 7, 8, 9 remain open; items 3, 4 and 5 are now closed headlessly
  (§3).
* **`games/gradius/` and `games/batman/`** — untouched, per the brief. Gradius's
  suite re-run only to confirm the shared-tool edits are harmless (292/0/0).
