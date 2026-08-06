# 101 -- IMPL: boot the PAGE at any ladder rung

status: **DONE.** committed and pushed 2026-08-06.
role: IMPLEMENTER. target: `ddpdojblk` VERSION-B. `[M]` = measured by me.

The plan is `101-Plan-boot-the-page-at-any-rung.md`. Read it; this file does
not repeat its reasoning, only records what I did and what I measured.

## 0. THE seed.bin LAYOUT, DERIVED (the one non-trivial piece)

The plan warned: "Derive the seed.bin byte layout from the exporter and the
page -- do not assume." I derived it three ways and they agree.

* `tools/export-web.mjs:164` reads `seed.bin` raw and `:2380` writes it raw
  (`put('seed.bin', seed)`), no packing.
* `src/web/assets.js:697` loads it; `src/web/app.js` passes it to `new
  Game(bundle.seed, ...)`; `src/main.js` does `this.ram = new Ram(seed)`.
* `src/ram.js` rejects anything not `MACHINE.ramSize` long, and
  `src/machine.js` says `ramSize: 0x20000`.

`[M]` shipped `games/ddpdoj/rip/web/seed.bin` is 131072 bytes; `[M]` a rung's
`c002000.ram.bin` is 131072 bytes. **seed.bin IS the 128 KiB work RAM and
nothing else.** The `$900000` BG ring is NOT in it: the page takes that from
the capture (`bgSeed: this.cap.part(0, 'bg')`), and seedcmp takes it from
`<rung>.bg.bin`.

### PREMISE CORRECTION

The plan (and my brief) said "assemble the rung's ram/bg/regs into that [seed]
layout." There is nothing to assemble. seed.bin is RAM-only; the BG ring is a
separate Game input; and `regs.txt` is UNUSED -- seedcmp ignores it, and the
page overrides all four scroll registers from `game.video` every frame
(`app.js` draw()). The regs file's `ctrl=001f` and `bg_scale=0210` are
stage-wide constants the capture already carries on every frame. The three
rung files map to three Game-constructor inputs, exactly as seedcmp already
does for the headless comparison:

```js
new Game(rungRamBytes, tables, { bgSeed: beWords(rungBgBytes),
  logicFrame: rung.lf, videoFrame: rung.vf })
```

The `beWords` here is the same big-endian decode `seedcmp.mjs` uses; the page
has its own copy (not an import) so the gate can disagree with the loader.

## 1. WHAT I SHIPPED (four deliverables)

1. **`?rung=N` on the page.** `index.html` parses it (plus optional
   `?ladder=<scenario>`, default `stage1-sweep`, and `?ladderDir=<path>`).
   `boot()` calls the new `loadRung()` in `src/web/app.js`, which fetches the
   manifest + the rung's `.ram.bin` + `.bg.bin` and builds `{seed, bgSeed, lf,
   vf, intervention, ...}`. `Demo` uses those instead of the shipped seed. A
   visitor with no `?rung=` sees nothing change: `[M]` the default page boots to
   lf2445, no banner, `seeded: null`.
2. **Local-dev serving, structural.** `loadRung` resolves the ladder dir
   relative to `import.meta.url` (`games/ddpdoj/tools/oracle/out/w69/...`), so
   it is reachable only when the repo (or `games/ddpdoj/`) is served over HTTP.
   `build-dist.mjs`'s INCLUDE list does not copy `tools/` into dist, so on the
   published page the manifest fetch 404s and `loadRung` throws a clear
   AssetError naming the local-dev caveat. The published page keeps its single
   seed.
3. **Provenance on screen.** A `#rung-banner` overlay prints
   `SEEDED rung lf<N> (<scenario>)` + the manifest's own `intervention` text;
   `stats().seeded` carries a slim projection (no bytes) into the object the
   photo harness samples, and the `#stats` line ends with `SEEDED lf<N>` every
   frame so a cropped screenshot still carries its label.
4. **`webgate.mjs --rung N`.** A dedicated stage boots the port from the rung
   headlessly, steps `--frames` (default 300), reprints the manifest's
   intervention banner (as seedcmp does), and reports lf reached, records
   drawn, any throw. It exits before the regression stages, whose numbers are
   pinned to the shipped seed.

`[M]` `webgate --rung 2000` and `--rung 8500` both PASS (30 and 8 records on
the busiest frame; no throw in 50/60 steps). `[M]` the real page at
`?rung=8500` boots straight to lf8826 in ~8 s (skipping the ~8,500-frame
reach), shows the banner, carries `SEEDED lf8500` in the stats line, and
photographs the boss -- then stops honestly at the known unported `$29540C`
(recon 99's F-script-3 INIT, the documented debt). `[M]` unit tests 1211 pass,
0 fail.

## 2. CHECKS SEEN TO FAIL

* **The URL-depth bug (my own, caught by my own browser gate).** My first
  `loadRung` resolved the ladder relative to the ASSET base. `base` is
  `.../games/ddpdoj/assets/`, so `../../tools` climbed to `games/tools/` (one
  too many). The page printed `rung 8500: ...manifest returned HTTP 404`. Fixed
  by resolving relative to `import.meta.url` (app.js at `src/web/`), so
  `../../tools` = `games/ddpdoj/tools/`.
* **The trailing-slash bug (my own, same gate).** The manifest's `dir` is
  `"ckpt"` with no slash. `new URL('ckpt', dir)` yields a base whose last
  segment is `ckpt`, so the filename resolution REPLACES it instead of
  descending. The page fetched `.../stage1-sweep/c008500.ram.bin` (404) instead
  of `.../stage1-sweep/ckpt/c008500.ram.bin`. Fixed with
  ``new URL(`${man.dir ?? 'ckpt'}/`, dir)``.
* **`webgate --rung` throw path.** `--rung 8500 --frames 400` reaches `$29540C`
  at lf8826 and the stage reports `FAIL: RUNG BOOT threw ... $29540C`. That is
  the documented unported boss routine, and the same address the real page
  stops at -- which is the point: a seeded boot proves the CODE and loudly
  names the path it has not translated.
* **`webgate --rung 999999`** (non-existent rung) errors with the full rung
  list. (Caveat: piping through `tail` reports `tail`'s exit 0, not the
  gate's 1 -- the HANDOVER trap; redirect and grep instead.)

### A CHECK OF MY OWN I COULD NOT MAKE FAIL

`runRungStage`'s `drawnMax > 0` floor ("the seed produced a visible picture").
Every rung I tried draws records from frame 0, so I could not make it fail
without fabricating a corrupt seed (byte-swapping the ring, say), which would
not be an honest mutation. Reported rather than asserted. The throw and
bad-rung paths above are the failure modes I could and did exercise.

## 3. THE LEAK GUARD, AND A PREMISE CORRECTION WITH TEETH

The plan said: "build-dist.mjs's leak guard checks published files against
every ROM present; a rung file would be caught, and it should be."

**That is half wrong, and I verified both halves.**

`[M]` I planted a rung's `.ram.bin` (128 KiB) and `.bg.bin` (4 KiB) in
`games/ddpdoj/assets/` as publish candidates and ran `node tools/build-dist.mjs`.
It built CLEAN ("258 files checked -- clean"), and `[M]` both files reached
`dist/`. The verbatim guard does NOT catch them: board work RAM and the BG
ring are RUNTIME-MUTATED STATE, not contiguous ROM slices, so
`containsVerbatim` finds no match. The guard's own `< 1024 B` early-out does
not apply either (both are over 1 KiB).

`[M]` Then I planted a real 4 KiB verbatim slice of `cave_a04401w064.u7` and
ran it again: `REFUSING TO BUILD: dist/ contains verbatim cartridge data`,
exit 1. So the guard works; it is just the wrong tool for RAM/bg dumps.

**The real protection is structural, and it holds.** `tools/oracle/out/` is
not in `build-dist.mjs`'s INCLUDE list (only `index.html`, `src/`, `assets/`
and the page files are copied), and `[M]` `find dist -path '*oracle/out*'`
returns nothing. The page fetches rung files from that dir at runtime over the
dev HTTP server; they are never bundled, never copied, never committed
(gitignored: `[M]` `git check-ignore` confirms). If rung boot on the live site
is ever wanted, it is the OWNER DECISION the plan names -- and it would need a
new protection, because the verbatim guard will not be the thing that stops it.

## 4. PREMISES IN THE BRIEF THAT TURNED OUT FALSE

1. **"Assemble the rung's ram/bg/regs into that [seed] layout."** Nothing to
   assemble: seed.bin is RAM-only, BG is a separate Game input, regs unused.
2. **"webgate.mjs drives the page in real Chrome via Python playwright ...
   reads status from the DOM, and screenshots the canvas."** It does not.
   `webgate.mjs` is a Node gate that loads the bundle over HTTP and renders in
   Node; the photo harness is an ad-hoc `.scratch/<wave>/*.py` script (e.g.
   `.scratch/w98/bossshot.py`) that drives Chrome over `http.server`. I added
   `--rung` to webgate (the headless half) AND `?rung=` to the page (what the
   photo scripts use). Both are needed and both are shipped.
3. **"a rung file would be caught [by the leak guard]."** See section 3: the
   verbatim guard does not catch RAM/bg. The structural INCLUDE-list exclusion
   is what keeps them out of dist, and that is verified.
