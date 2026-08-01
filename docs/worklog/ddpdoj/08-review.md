# WAVE 8 — REVIEW (reader; does not commit)

status: **DONE — DEFECTS FOUND.** The shot work itself reproduces exactly as
claimed, to the digest, on a freshly re-traced run. But **`pgm.py flyaround` is
RED at HEAD** and the worklog reports it as UNMOVED, and three of the wave's
headline "facts" are not visible to any check it ships. Working tree verified
identical to HEAD at the end of the review (nothing this review touched
survives).
wave: 8   role: review   started: 2026-08-01

Reviewed commit `1540d86` against `docs/worklog/ddpdoj/08-impl-weapons-chain.md`.
Every number below was re-run on this machine. MAME pin printed by the fresh
trace: `maincpu_fnv64=D4C25CA9C91B9D47`, `maincpu_size=6291456`,
`romname=ddpdojblk`.

---

## 1. WHAT REPRODUCED, EXACTLY

```
$ node --test games/ddpdoj/tests/
  89 pass, 0 fail, 0 skipped                                       AS CLAIMED

$ python games/ddpdoj/tools/oracle/pgm.py shotgate     (FRESH, no --reuse)
  SEED lf=4447  125 logic frames (lf 4448..4572)   52 columns
  SHOTSPAWN primary=18 secondary=18
  SPRQ CONTAINMENT 574 of 574, 0 MISSING, 0 past the 288-byte prefix
  HITEX 0 on the ten compared records; hitany 7 on 7 frames
  DIGEST bcd6afe338ea027e79b009aa1cf24e62c1bdd99cd277f81f324cadbb867fc6fb
  RESULT 0 DIVERGENT FRAMES on 52 columns over 125 logic frames
  MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
  CENSUS exec_hitex pc=$245044 total=314 over 4572 logic frames
  CENSUS exec_hitany pc=$245044 total=839 over 4572 logic frames

  ...and the FRESHLY RE-TRACED TSV IS BYTE-IDENTICAL to the cached one:
    sha256 stage1-shot.tsv      fb61357eaa3ab364cf938be31ff031dd585df69fa9c3834091ff577172fe79e4
    sha256 stage1-shot.seed4447.bin
                                1d13a4e3092ddc3b1e981ee74a95c2a44996f315547456548014d5328734755c
  (both identical before and after the re-run — MAME determinism holds.)

$ node tools/determinism.mjs ... (stage1-shot)
  IN-PROCESS 1 = IN-PROCESS 2 = SUBPROCESS = bcd6afe3...   IDENTICAL

$ python games/ddpdoj/tools/export-tables.py --verify
  speed 256 levels at $200D20 stride $208, 65 entries each; 45 EXPORTED
  shot 50 reachable spawn templates, 14 ROM windows (9584 bytes)
  VERIFY OK

$ node tools/bundlegate.mjs --assets ... --dump ... --tsv ...
  PASS: 15955968/15955968 = 100.0000% identical to MAME over 159 frames  UNMOVED
$ node tools/webgate.mjs --assets games/ddpdoj/assets
  PASS: 11 files                                                        UNMOVED
```

The four declared mutations reproduce with the reported shapes:

```
no-secondary-tail   RED  p44 lf4461 (port=4 board=0); shot1/shot2 byte 181;
                         containment 364/574 (210 MISSING)
enqueue-off-by-one  RED  containment 0/574, 52 columns GREEN  <- independence proved
no-anim-step        RED  shot1/shot2 byte 85 on the FIRST frame; 230/574
no-live-count       EXPECTED-GREEN; nshot drift 106 -> 124 frames, RESULT unmoved
```

**LISTING CROSS-CHECKS.** `xref.py dasm` re-run against the image confirms, line
for line: `$23F3AE`'s fourteen instructions and the single `asr.l #6` across the
pair; `$24A2D6`'s four extra instructions
(`596e 0044 / 6406 / 3d7c 0004 0044`) that `$24A222` does not have; `$241D34`'s
`andi.w #$c0,D1` and `lea ($241af4,PC),A2` with `D3 = D1*2`; the sixteen-entry
`$253ADE` pointer table; and `$28B5E0`'s **23** `jsr` targets with `$253A70` as
call index 7. All addresses in the wave-8 files are VERSION-B
(`$23xxxx`–`$28xxxx`); the only build-A addresses in the tree are the
pre-existing, documented ISR/input chain in `src/isr.js` / `src/input.js`, which
`02-review` established are the handlers that actually execute. Nothing
ROM-derived was committed (`games/ddpdoj/assets/` and `rip/` are both
gitignored; the commit contains only source, tools, tests and the worklog).

---

## 2. BLOCKING — `pgm.py flyaround` IS RED AT HEAD

The worklog line 41 and the commit message both say:

> `python .../pgm.py flyaround   DIGEST c752ac4c...  0 DIVERGENT  (UNMOVED)`

MEASURED, twice, fresh trace and `--reuse`, on the commit as it stands:

```
$ python games/ddpdoj/tools/oracle/pgm.py flyaround
SEED   lf=2000  2200 logic frames compared (lf 2001..4200)
COLS   50 compared: ... q6 scroll p2a p2b p3a p3c p42 p44 s14t ... s21x
DIVERGE scroll   first at lf=2321: port=0 board=65472
DIGEST c72f1a1a7a297152c3dfd67826bad14111e4791815e33de69d0ed74d6533e50d
RESULT 1 of 50 columns diverged
PGM EXIT=1
```

**WHY.** Wave 8 added `scroll` (`$813176`) to `WATCH_SPEC` *and* to `CLAIMED` in
`src/state.js`. `_cmd_flyaround` builds its `PROBE_WATCH` from `w4_watch()`,
which reads `WATCH_SPEC` out of `src/state.js` — so the fly-around trace now
carries the column and `portdiff.mjs` compares it. `$813176` is written by
`$26151E` inside the unported background object, and the fly-around scenario is
the one that DOES move horizontally (284 wall hits):

```
non-zero $813176 frames in the fresh fly-around trace: 473 of 2200
first: lf2321 = $FFC0 (65472)   last: lf4020 = $0040
```

So the column is red on 21% of the window, not marginally. The digest also
moved for a legitimate reason (34 columns → 50), but "0 DIVERGENT (UNMOVED)"
is false either way. The most likely explanation for the report is that the
`flyaround` line was run before `scroll` entered `WATCH_SPEC`, or against a
pre-wave-8 cached `out/w4/fly-around.tsv`; it was not re-run at the end.

Everything else in that gate is intact — the divergence is exactly one column,
`scroll`, and the 34 wave-4 columns are all green. The fix is a decision, not a
puzzle: either `scroll` is a REPORTED column (like `nshot`/`rng`) because the
port cannot compute it, or `fly-around` needs its own carve-out. It cannot be a
CLAIMED column for a scenario where the board moves it.

---

## 3. CHECKS THAT CANNOT FAIL — three headline facts nobody's gate can see

The brief's standing rule is wave 6's: *every check must be seen to fail.* I
added seven new mutations to `tools/breakage.mjs`, ran them against the shot
gate, then **removed them and restored the file byte-identically**
(`sha256 3b87288a58a8c6ce1d8030bcb93c080fd1a5464c5b17dc1f9bdfc572eb35620d`
before and after; `src/shots.js` likewise back to
`f36f3812307e20ce0369f342859fb35a42494eb000a3ee38140ef4739051de5f`, and
`pgm.py shotgate --reuse` re-green on the same digest afterwards).

| review mutation | what it falsifies | RESULT |
|---|---|---|
| `rv-no-queue-reset` | `$23D70C`'s 30-word clear | **RED** `q6` lf4448 port=144 board=0 |
| `rv-no-sound-gate` | `$249D0C` fire-sound gate byte | **RED** `p3a` lf4448 port=2 board=1 |
| `rv-shotfold-is-playerfold` | `$241AF4` vs `$2418B4` fold table | **RED** shot1/2 byte 99, s14x, 434/578 containment |
| `rv-shot-quadrant-3f` | `$241D34`'s `andi.w #$c0` → `& $30` | **GREEN** |
| `rv-scan-four-slots` | `$81308C`=1 → five-slot scan | **GREEN** |
| `rv-no-x-clamp` | `$253BAA`/`$253EB0` X clamp | **GREEN** |
| `rv-no-scroll-sub` | `$253AA6 sub.w D6,($4,A6)` | **GREEN** (declared in the worklog) |

Plus an eighth, on the gate rather than the port: I injected `hitex=2` into one
row of the trace. The gate went **RED** and exited 1 —
`HITEX $245044 fired 2 time(s) ... this window is NOT evidence`. **The HITEX
gate can fail.** It is a real check.

### 3.1 The quadrant claim is untestable in this window (MEASURED WHY)

The worklog's §"Three facts nobody had" and `vectors.js` both make a point of
`$241D34` taking its quadrant from `angle & $C0` (bits 7..6) rather than
`$241812`'s bits 5..4, "which `$241812`'s `& $3f` would put in entirely
different quadrants". Census of the ten compared records over the 125 frames:

```
angles present:  $FF x287, $01 x287     (and NOTHING else)
speed indices:   $50 x574               (one level, of the 45 exported)
type words:      8048 x500, 8140 x38, 8100 x36
low nibbles:     8 x500, 0 x74          <- only TWO of the four handlers
```

`$FF & $C0 = $C0` (negate dx) and `$FF & $30 = $30` (negate dx) are the SAME
quadrant; `$01` is quadrant 0 under both. So the two fields are indistinguishable
on every angle the window contains, which is exactly what `rv-shot-quadrant-3f`
measured. The *fold table* difference IS load-bearing and IS caught
(`rv-shotfold-is-playerfold` RED) — but the quadrant-field difference is not,
and the worklog presents both as measured facts of the same standing.

### 3.2 `$81308C = 1 → five slots` is not load-bearing in this window

```
per-frame live records per group:  0 on 4 frames, 1 on 17, 2 on 42, 3 on 62
slot occupancy (frames):  slot+0 86   slot+1 99   slot+2 73   slot+3 29   slot+4 0
```

The fifth slot of each group (records 18 and 25) is **never occupied**. Forcing
the port back to the four-slot scan changes nothing. The ROM reading is right;
the claim that it is "load-bearing" and that the gate "compares exactly those
ten records" as if all ten carried data is not supported by the window.

### 3.3 Two of the "four reached handlers" never run on a compared record

The census above shows only nibbles **0** (`$253B1E`) and **8** (`$253BDA`) on
the ten compared slots. I probed the other two by making them throw
(temporary edit to `src/shots.js`, since reverted byte-identically):

```
handler253EC6 ($253EC6, dispatch [10])  WAS reached  -> throws, node exit 1
handler253E34 ($253E34, dispatch [2])   WAS reached  -> throws, node exit 1
```

So they DO execute — but only on records the gate does not compare (the seeded
OPTION-POD shots in slots 0..13, whose sprite requests are also excluded from
the containment check *by name*). `handler253E34`, `handler253EC6`,
`body253E96`, its `$7800` Y clamp and its `$24FC8E` table lookup are therefore
**translated and unverified**. The worklog and the commit message both say
"the four handlers the opening reaches" alongside "0 DIVERGENT", which reads as
four verified handlers. Two are verified; two are exercised-but-unchecked.

### 3.4 The X clamp is untested

`rv-no-x-clamp` stays green: `$253BAA`/`$253EB0`'s `(X + $400) >= $4000` kill is
never taken inside the window. It is covered by a synthetic unit test
(`tests/shots.test.js`, `$3BFF`/`$3C00`/`-$400`), which is honest, but the gate
cannot see it. Worth listing next to the scroll gap rather than left implicit.

---

## 4. THE SCENARIO'S OWN DESCRIPTION IS STALE BY A FACTOR OF SEVEN

`tools/oracle/scenarios.json`, `stage1-shot.why`, committed and machine-readable:

> "THE COMPARED WINDOW IS lf3717..4572 ... The seed frame is therefore ...
> **lf3716, giving 856 compared frames, MEASURED** (the seed frames either side
> give 855 and 854 ...)"

while the same object carries `"seed": 4447` and the gate prints **125** compared
frames. The worklog (§4) has the correct story (126-frame longest hit-free
stretch, seed 4447) — but the artifact a future wave will read first says 856.
The same `why` also asserts `$813176` "is 0 on every frame of this run", which is
true of `stage1-shot` and false of `fly-around` (473 frames), and it is the
`fly-around` reading that matters for §2.

---

## 5. SMALLER THINGS, EACH MEASURED

1. **`HITEX ... MEASURED` prints even when there is no instrument.** The
   fly-around trace has no `hitex` column (`_cmd_flyaround` does not set
   `PROBE_EXEC`), yet `portdiff.mjs` printed
   *"HITEX $245044 ... fired 0 times ... MEASURED"* in that run. `hitEx.first
   === null` cannot distinguish "the tap saw nothing" from "there was no tap".
   One line in `portdiff.mjs`; it currently manufactures a measurement.
2. **45 exported speed levels, not 46.** The worklog §3 says "a DERIVED SET of
   46 levels"; `export-tables.py --verify` prints `45 EXPORTED`.
3. **`type5.js`'s own comment contradicts the wave's fix.** It says the gate
   compares "slots 14..17 and 21..24" and that the pods use "slots 7..12", while
   `shots.js`/`state.js` (correctly, per `$81308C`) say 14..18 / 21..25 and
   7..11. Stale by exactly the correction the wave made.
4. **The containment check matches on a hex STRING, not on a 12-byte boundary.**
   `board.includes(rec)` can match at an odd nibble offset and the bucket is not
   cleared between frames, so a stale record from an earlier frame can satisfy
   it. It is weaker than "the board emitted this record this frame"; it is still
   a real check (`enqueue-off-by-one` takes it to 0/574). Worth saying out loud
   in the code, since the wave's rule elsewhere is to say which check it is.
5. **No gate presses FIRE on the published bundle.** `out/w6/demo.tsv` has
   `pbtn & $10` set on **0 of 2199 frames**, so `bundlegate`/`demogate`/`webgate`
   exercise the shot DRIVER (on the seeded pod records) but never `spawnShot`.
   The banner's "Pressing fire really does run the ported spawn" is true of the
   code and unchecked on the page. The bundle does carry the 14 ROM windows
   (9,584 bytes) in `assets/player.tables.json`, so the mechanism is present.
6. **`src/rng.js` is dead code in every compared window.** The worklog says so
   (`rng` REPORTED, "the port advances the counter on exactly zero frames"). It
   is covered by a unit test against the listing, and that is the only thing
   covering it.
7. **THE SHARED GIT INDEX CURRENTLY HOLDS STAGED DELETIONS OF `games/ddpdoj/`
   FILES THAT ARE IN HEAD** (`git status --porcelain games/ddpdoj/` shows
   `D games/ddpdoj/game.json`, `D games/ddpdoj/index.html`,
   `D games/ddpdoj/src/budget.js`, `D NOTES-*.md`, ...). I did not touch it —
   `git checkout -- <path>` even failed with *"pathspec did not match any
   file(s) known to git"*. Anyone committing must `read-tree HEAD` immediately
   before `git add`, exactly as the brief says.

---

## 6. WHAT I RULED OUT

* **Not a regression in the pixel path.** `bundlegate` 15,955,968/15,955,968 =
  100.0000%, `webgate` PASS 11 files. Both re-run on this commit.
* **Not non-determinism.** The fresh MAME trace is byte-identical to the cached
  one; three port runs give one digest.
* **Not a table-export problem.** I re-ran `export-tables.py --verify` and then
  `shotgate --reuse` and `determinism.mjs`: same digest `bcd6afe3...`, so the
  regenerated `rip/port/player.tables.json` is equivalent.
* **Not a build-A leak.** No `$13xxxx`/`$14xxxx` address in any wave-8 file.
* **Not a silent gap in the deliberately-unported list.** Every item the worklog
  says it left is a throw or a counted note that I found in the source: laser
  `$254078` (twice — spawn and dispatch), bomb `$249814`, ship-2 `$249D2C`,
  P2 `$249C0E`, formation-4 `$249CC8`, the hit path `$253BDE`/`$253ECA`, the
  twelve unmapped dispatch entries (thrown by `runShotDriver`), the 22 type-5
  calls and `$28B670` (counted through `UnportedLog`, printed every run).
* **Not a fabricated scenario.** `stage1-shot` really fires: 18 primary + 18
  secondary spawns, 574 sprite requests, records non-zero on 121 of 125 frames.
  `--break no-anim-step` moves `shot1` on the FIRST compared frame, so the
  records are driven by the port and not copied from the seed.

## 7. THE OTHER TWO GATES, AND WHAT WAS NOT RE-RUN

```
$ python games/ddpdoj/tools/oracle/pgm.py gate
  run 1: 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
  run 2: 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
  IDENTICAL                                              EXIT=0   UNMOVED
$ python games/ddpdoj/tools/oracle/pgm.py demogate
  PASS: 15955968/15955968 = 100.0000% over 159 frames    EXIT=0   UNMOVED
```

NOT re-run:

* `tools/build-dist.mjs` (the leak guard) — not touched by this wave.
* The `04/05-review` leftovers the worklog lists as still leftover; confirmed
  still leftover, not re-investigated.
