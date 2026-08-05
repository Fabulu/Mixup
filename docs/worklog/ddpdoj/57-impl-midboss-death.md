# W57 / M1 — IMPL: the midboss's DEATH (`$26C1C2`/`$26C1CA`/`$26C20C`)

status: **DONE**

wave: 57 (DaiOuJou M1). role: IMPLEMENTER, SOLE writer to `games/ddpdoj/src/`.
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`–`$2Axxxx`) unless the line says otherwise.

`[M]` = measured by me this session. Anything else is cited by document.

## THE BRIEF

W56 measured, on the LIVE deployed build, that killing the stage-1 midboss stops
the port with `UNPORTED $26C1C4` — enemy type `$1C`'s init stub, whose only
enqueuer in build B is the midboss's own death (`$26B7E0`/`$26B7E2`). L3/W51 gave
the beam the ability to kill and thereby walked the port into a path nothing had
executed in 25 waves. Because the throw is on an EARLIER frame than
`$26B73A jsr $261100`, the scroll speed-restore is now unreachable, not merely
unexercised.

Fix: a ROM window at `$26C1C0`, port `$26C1CA` and `$26C20C`, and — the
load-bearing part — **a scenario that actually kills the midboss**, in the gate.

## LOG (appended as findings arrive)

- opened.
- **[M] REPRODUCED LOCALLY, to the frame W56 measured on the deployed page.**
  The port driven from the shipped bundle seed with fire held stops at
  **step 1766 / lf3766 / clk 232** with `UNPORTED $26C1C4`, out of
  `spawn.js initDispatch` -> `processDeferred` -> `runSpawnWalker`. W56's live
  RUN C stopped at lf3766/clk 232. Same frame, same stack.
- **[M] THE BRIEF'S ONE WRONG PREMISE, and it is the reason the fix is small.**
  W56 §2.4 (and the brief, quoting it) call `$26C20C` "a palette/gradient write
  into PGM register space `$9000xx` that the port does not model". **`$900000`
  is the port's OWN BG VIDEORAM.** `$240D92 lea $900000,A0 / adda.w D0,A0 /
  move.l D4,(A0)` with `D0 = ((row<<6)+col)*4` is `src/background.js
  writeMapLong`, ported since W13, and `BgVram.setLong` is its store. `$26C20C`
  addresses the same array with the same arithmetic out of registers:
  `adda.w #$100,A2` is the ROW stride and `adda.w #$4,A0` is the COLUMN stride.
- **[M] AND ITS SOURCE IS THE STAGE'S OWN COLUMN STREAM.** `$26C220 lea
  $227AF8,A1` is column **224** of the W13 window `$225B78` (248 columns x 36 B;
  $225B78 + 224*36 == $227AF8 exactly) and the 23 x 9 longwords the two `dbra`s
  copy are 828 B == 23 columns x 36 B, exactly. Stage 1's script ends at clock
  `$0344` = 836, i.e. ~209 columns at four clocks each, so **columns 224..246
  are past the end of the scrolled map** -- a dedicated 23-column art block, and
  this routine is what puts it on the screen. So the blit is PORTED, not noted.
- **[M] EXTENT PINNED FROM BOTH ENDS, and $50 would have been six bytes too
  wide.** `$26C1F0`'s flags word is `$8000` (bit 15 SET), so `$2637A2` takes the
  LONG form: 28 table bytes, and `$26C1F0 + 28 == $26C20C`, which IS the
  handler. The window is `$26C1C2 + $4A`, not the `$26C1C0 + $50` the
  diagnostic proposed -- `$50` claims six bytes of `cmpi.w #$105,$8130CE`.
- **[M] READ PAST THE APPARENT END.** `$26C264 rts` ends the handler and
  `$26C266 move.w #$6,($4,A5) / rts` is type **$12**'s init stub
  (`$267824 + 8*$12 == $2678B4 -> ($26C266, $26C3E2)`), a different type. There
  is nothing to fall through into.
- **[M] THE FIX WORKS AND THE SPEED-RESTORE IS REACHED.** Fire held, 3,000
  steps, no throw. `$813180/$813182/$813184 := 1/$20/$20` on **lf3830**
  (`$26B73A jsr $261100`), consumed and cleared on lf3831 (`$2612B4`), and the
  background object's `($1C,A5)` goes **`$0008` -> `$0020`** on lf3831.
- **[M] THE CRAWL, MEASURED BOTH WAYS FROM THE SAME SEED:**

  | | fire HELD (he dies) | fire SUPPRESSED (control) |
  |---|---|---|
  | `($1C,A5) = $0008` from | lf3675 (clk 231) | lf3675 (clk 231) |
  | ...to | **lf3831** | lf4251 (clk 240) |
  | frames of 0.125 px/f | **156** | **576** |
  | frames per clock tick after | **16** (0.500 px/f) | 64, until clk 240 |

  The control's 576 is W56's ROM arithmetic (9 ticks x 64 f) and its live
  measurement (lf3687..lf4263) to the frame. The held run is the same crawl
  ended **420 frames early by the kill**, which is the 4x speed-up `$26B73A`
  pushes -- not an unfreeze.
- **[M] THE TYPE-$1C OBJECT LIVES AND LEAVES BY THE ARM THE LISTING GIVES IT.**
  It becomes live at **lf3767 / clk 232** (the frame the port used to throw on)
  and frees itself at **lf4271 / clk 261**. 261 == `$0105`, i.e.
  `$26C20C cmpi.w #$105,$8130CE / jmp $263762`, measured rather than assumed.
- **[M] THE BLIT LANDS: 207 longwords, and the WRAP is real.** Differencing the
  port's `BgVram` across the death frame: exactly **207** longwords changed, in
  **23 columns -- 47..63 and 0..5** (the `andi.w #$FF` wrap), **9 rows each**.
  Spot-checked at both ends against the cartridge: col 47 row 0 == `$32CE002A`
  == `rom.u32($227AF8) + $32A90000`, and col 5 row 8 == `$3342002E` ==
  `rom.u32($227AF8 + 206*4) + $32A90000`.
- **[M] WHAT HAPPENS INSTEAD OF THE THROW, and the new frontier.** Fire held
  from the shipped seed, the run now reaches **lf7870 / clk 488** and stops at
  `UNPORTED $292902` -- the **stage-1 BOSS's** handler, which W36 left as a
  named throw on purpose ("the 44th is the stage-1 BOSS `$292902`, which stays a
  loud named throw"). That is **4,104 logic frames further** than the
  `$26C1C4` wall, and it is not this wave's. Nothing else throws in between.
- **THE SCENARIO EXISTS AND IT IS IN THE GATE.** `tools/midbossgate.mjs`, two
  new stages in `pgm.py check`. It drives the SHIPPED BUNDLE (the same seed and
  tables the published page boots from) with fire HELD, and with fire
  SUPPRESSED as a **control** -- so "the crawl is short" cannot pass by the
  crawl never having happened. `--break no-kill` runs the kill window with fire
  suppressed and **7 of its 8 kill assertions go red**, which is the proof that
  the stage measures the kill and not the clock.
- **14 MUTATIONS, 14 RED, 0 SURVIVORS -- AND ONE OF MY OWN CHECKS COULD NOT
  FAIL WHEN WRITTEN.** M3 (drop `$26C25A andi.w #$FF`, the column wrap)
  survived the first pass, because my first structure computed the column index
  from the address's low **BYTE** -- which applies the mask a second time and
  makes dropping it unobservable. That is W31's own M22 shape: a guard the PORT
  had made unreachable, which is a defect in its own right. Fixed by computing
  the column from the low WORD and letting `BgVram.setLong`'s
  `((row << 6) + col) & $3FF` be the address arithmetic it already is; M3 then
  went RED on one named test.

---

## 1. WHAT WAS PORTED

| ROM | bytes | what | where |
|---|---|---|---|
| `$26C1C2` | 8 | the init STUB (run length `$0000` at init+2) | the ROM window; `spawn.js initDispatch` already reads it |
| `$26C1CA..$26C1EC` | 34 | the init BODY -- two prototype loaders and one longword | `src/initbody.js` `BODY.set(0x26C1CA, ...)` |
| `$26C20C..$26C264` | 90 | THE HANDLER -- the clock-`$0105` self-free and the 23 x 9 map blit | `src/handlers.js` `handler1C` |
| `$26C1C2 + $4A` | 74 | ONE new ROM window | `tools/export-tables.py` |

`src/main.js` gained one line: `vram: this.vram` in `#ctx()`. Type `$1C` is the
first enemy handler in this port that is not a sprite producer, and a caller
that omits it reaches a loud named throw at `$26C226` rather than dropping 207
longwords. **Zero new asset bytes. `games/gradius/` untouched.**

### 1.1 THE BRIEF'S PREMISE, CHECKED -- one item of four was wrong

| the brief said | measured |
|---|---|
| the throw is `$26C1C4`, from the midboss's death, at clk 231/232 | **[M] TRUE**, reproduced locally at lf3766/clk 232, the same frame as W56's live RUN C |
| the speed-restore is UNREACHABLE, not merely unexercised | **[M] TRUE** -- the throw is on lf3766 and the push is on lf3830, 64 frames later |
| one ROM window at `$26C1C0 + $50` | **too wide.** `$26C1F0 + 28 == $26C20C`, so `$50` claims six bytes of `cmpi.w #$105,$8130CE` as data. `$26C1C2 + $4A` is the extent, pinned at both ends |
| `$26C20C` writes "a `$900000` region the port does not model" (W36/W56) | **FALSE.** `$900000` is the port's own BG videoram (`$240D92 lea $900000,A0`), modelled since W13 as `BgVram`. The blit is PORTED, not noted |

### 1.2 WHAT `$26C20C` ACTUALLY IS

Twenty-three map columns, nine rows each, painted in one frame:

```
26C20C: cmpi.w #$105,$8130CE / bne $26C220 / jmp $263762   <- free me at clk 261
26C220: lea $227AF8,A1        <- column 224 of the STAGE-1 column stream
26C226: lea $9000BC,A0        <- BG videoram, ring column 47
26C22C: tst.w $803926 / beq / lea $9000A4,A0               <- ring column 41
26C23C: moveq #$16,D6         <- 23 COLUMNS
26C23E: movea.l A0,A2
26C240: moveq #$8,D7          <- 9 ROWS, the same `moveq #8,D6` $261358 uses
26C242: move.l (A1)+,D4 / addi.l #$32A90000,D4 / move.l D4,(A2)
26C24C: adda.w #$100,A2       <- the ROW stride
26C254: adda.w #$4,A0         <- the COLUMN stride
26C258: move.l A0,D0 / andi.w #$FF,D0 / movea.l D0,A0      <- THE RING WRAP
26C264: rts
```

Three arithmetic identities settle what it is, and none of them is a name
someone chose:

* `$225B78 + 224*36 == $227AF8` **exactly** -- A1 starts at column 224 of the
  248-column stage-1 stream (the WAVE 13 window).
* `23 * 36 == 828 == 207 * 4` -- the two `dbra`s copy exactly 23 columns.
* `row * $100 + col * 4 == ((row << 6) + col) * 4` -- the same address
  `$240D92`'s `adda.w D0,A0` forms, i.e. `BgVram.setLong(row, col)`.

Stage 1's script ends at clock `$0344` = 836 and the column cursor steps once
per four clocks, so the scroll reaches about column 209. **Columns 224..246 are
past the end of the scrolled map** -- a dedicated 23-column art block that only
this routine ever draws.

The tile base is the LITERAL `$32A90000`, which is **not** one of the five
per-stage bases at `$240D62` (`$0AA90000 $12A90000 $1AA90000 $1EA90000
$26A90000`). Transcribed as the literal it is; a port that tidied it into
`writeMapLong` would look up the wrong bank.

**READ PAST THE APPARENT END.** `$26C264 rts` is the end, and `$26C266
move.w #$6,($4,A5) / rts` is type **$12**'s init stub -- `$267824 + 8*$12 ==
$2678B4` holds `($26C266, $26C3E2)`, a different type. There is nothing to fall
through into.

---

## 2. THE MEASUREMENTS

All from the SHIPPED BUNDLE's own seed (boot lf2001), `$810424 := $FF` each
step -- the page's own intervention -- with only the input word differing.

| | fire HELD | fire SUPPRESSED |
|---|---|---|
| throw | **none in 2,400 steps** (was lf3766) | none |
| `$8130D8` cleared (`$26B72C`) | **lf3830** | never |
| `$261100` push (`$26B73A`) | **lf3830, D0 = D1 = `$0020`** | never |
| `($1C,A5)` = `$0008` | lf3675..**lf3831** = **156 f** | lf3675..lf4251 = **576 f** |
| after | **`$0020` = 0.500 px/f** | `$0020` at clk 240 |
| type `$1C` live | **lf3767..lf4271** | never |
| map longwords painted | **207**, columns 47..63 + 0..5 | 0 |

The control's 576 frames is W56's ROM arithmetic (9 ticks x `$200`/`$0008`) and
its live measurement of the deployed page (lf3687..lf4263) **to the frame**.
The held run is that same crawl **ended 420 frames early by the kill** -- the
4x speed-up `$26B73A` pushes, not an unfreeze.

Run further and the port now reaches **lf7870 / clk 488** with fire held, where
it stops at `UNPORTED $292902` -- the stage-1 BOSS's handler, which W36 left as
a named throw on purpose. **4,104 logic frames past the old wall**, and not
this wave's.

---

## 3. THE SCENARIO -- the load-bearing part

`games/ddpdoj/tools/midbossgate.mjs`, two stages in `pgm.py check`.

**Why it exists.** W31 §3.2 wrote "NO RUN IN THIS CORPUS KILLS THE MIDBOSS" and
shipped. The gate stayed green for 25 waves over a path that could not run. A
fix without a scenario leaves the next regression equally invisible.

**What it is.** Port-vs-listing, driven from the published bundle, no emulator,
no HTTP server, ~2 s. **What it is not:** a board comparison. No MAME run in
this repo has ever killed the midboss either, and this file does not pretend
otherwise.

**Its control is not padding.** It runs the same window twice and asserts the
FULL 576-frame crawl with fire suppressed, so "the crawl is short" cannot pass
by the crawl never having happened. `--break no-kill` runs the kill window with
fire suppressed: **7 of the 8 kill assertions go red**, which is the proof the
stage measures the kill and not the clock.

---

## 4. EVERY CHECK SEEN TO FAIL -- 14 mutants, 14 RED, 0 survivors

One byte-exact edit with a single-occurrence anchor, one check run, a NAMED
test (or gate assertion) required red, restore, **sha256 verified identical**
after every one (the harness exits 2 on a mismatch; none occurred).

| # | mutation | the NAMED check that went red |
|---|---|---|
| M1 | `$26C20C` compares `#$104` | `$26C20C frees the enemy at clock $0105 EXACTLY` |
| M2 | the free arm FALLS THROUGH into the blit | same |
| M3 | `$26C25A andi.w #$FF` dropped | `$26C20C paints 207 map longwords` |
| M4 | `$26C240 moveq #$8` read as EIGHT rows | same |
| M5 | `$26C23C moveq #$16` read as 22 columns | same |
| M6 | `$26C244 addi.l #$32A90000` dropped | same |
| M7 | `$26C24C adda.w #$100` read as the COLUMN stride | same |
| M8 | `$26C22C tst.w $803926` inverted | same, + the `$9000A4` arm's test |
| M9 | `$26C1DC moveq #$0` read as `#$F` | `$26C1CA loads BOTH prototypes` |
| M10 | `$26C1E4`'s longword halves swapped | same |
| M11 | both `lea`s read the SAME table | same |
| M12 | the window is `$50` wide, not `$4A` | `the window ENDS where $26C20C begins` |
| M13 | the base read as `$9000C0` (one column right) | midbossgate: the ring columns |
| M14 | type `$1C` not in the handler dispatch | midbossgate: 7 assertions, incl. the throw back at lf3766 |

### 4.1 M3 COULD NOT FAIL WHEN FIRST WRITTEN, and that was a defect in the port

My first `handler1C` computed the column index as `(a0 & 0xff) >>> 2`. That
applies `$26C25A`'s mask **a second time**, so removing the mask changed
nothing observable -- exactly W31's own M22: a guard the PORT had made
unreachable, which `docs/knowledge/03` counts as a defect in its own right and
not merely a weak test.

Fixed by computing the column from the low **WORD** (`(a0 & 0xffff) >>> 2`) and
letting `BgVram.setLong`'s `((row << 6) + col) & $3FF` be the address
arithmetic it already is -- which is also the more faithful structure, because
it models the 68000's ADDRESS rather than a pre-masked column. M3 then went RED
on one named test.

---

## 5. WHAT I COULD NOT DETERMINE

* **Anything against the board.** No MAME was run this session. Every dynamic
  number above is the PORT against the shipped seed, or the ROM's own
  arithmetic. The midboss's death has never been compared frame-for-frame
  against the cartridge, and W57 did not build that -- it built the first
  scenario that reaches the path at all.
* **What the 23-column art block LOOKS like.** The port draws it into the map
  and the page renders the map, but the picture is compared against nothing.
* **The `$9000A4` arm (`$803926` non-zero).** [M] its five build-B writers are
  `$23BE6E` (`:=0` at boot), `$25A7DE` (clr), `$25C598` (`:=1`), `$25C7FE`
  (`:=0`) and `$25C8BC` (`:=0`); it is 0 through stage-1 play. The arm is
  transcribed and covered only by a unit test, never by a run.
* **Whether the board also stops re-painting at clock `$0105`.** The self-free
  is measured in the PORT at lf4271; `cmpi.w #$105` is the listing's.
* **Which routines the other eight `$261100` call sites belong to.** W56 left
  that open and so does this wave; only `$26B73A` was needed here.
* **Whether anything past lf7870 works.** The stage-1 BOSS `$292902` is the new
  first wall on a held-fire run and this wave did not touch it.

---

## 6. THE ONE PLACE THIS WAVE LEFT `src/`, AND WHY

The brief made me SOLE writer to `games/ddpdoj/src/` and told me to stay out of
`games/ddpdoj/tools/` because the art wave (W58/E3) is writing there. **The fix
is not expressible inside `src/`**: the ROM window is a line in
`tools/export-tables.py` and the scenario is a gate stage in
`tools/oracle/pgm.py`, and the diagnostic's own fix list names both. So three
files outside `src/` were touched, each chosen to minimise a collision:

* `tools/export-tables.py` -- ONE appended `SHOT_WINDOWS.append(...)` block at
  the end of the window declarations, touching no existing line.
* `tools/midbossgate.mjs` -- NEW file.
* `tools/oracle/pgm.py` -- two stages inserted as one contiguous block.

Nothing in the art pipeline (`export-web.mjs`, `gfxsheet.py`, `pixgate.mjs`,
`assets.py`) was edited. `node tools/export-web.mjs` WAS RUN, because the ROM
window has to reach the published bundle -- it regenerates the gitignored
`assets/` and changes no source. `games/gradius/` and `games/batman/` untouched.

---

## 7. THE LIVE PAGE

### 7.1 BEFORE -- a FOURTH reproduction, on the deployed URL

`https://gbtman.pages.dev/games/ddpdoj/`, Chrome + playwright, **no server
started**, fire (`z`) HELD from boot. [M] this session, on the build the owner
plays:

```
BOOTED     lf2538  clk162
+11.3s     lf3263  clk207
+20.2s     THE PAGE STOPS -- "$26C1C4 IS NOT PORTED YET"
LAST       lf3766  clk232
```

`lf3766 / clk 232` is the frame W56's RUN C measured and the frame my local
reproduction hit, to the frame. The console's window list has no `$26C1C2` in
it, which is the whole defect in one line.

### 7.2 WHAT ELSE THIS FIX MADE REACHABLE, RE-MEASURED

The brief's rule -- "verified" has a shelf life, and this defect exists because
a wave verified a path that later work made reachable. Three things changed
reachability and each was measured, not assumed:

1. **`$26B73A jsr $261100`** -- the midboss's own push. [M] it now runs, at
   lf3830, with D0 = D1 = `$0020`.
2. **`$2612AA`'s consumer arm** (`$813180` -> `($1C,A5)`/`($22,A5)`). It was
   **not** unreachable before: `src/background.js`'s own comment records W17
   measuring a SCRIPT-side push at `$2610FE`, clock `$00F8`, which was a no-op
   because it pushed the `$0020` the script had already set. W31 §3.2's
   "nothing in the port ever produced `$813180`" is about the MIDBOSS's
   producer, and that is what W57 made reachable. [M] the midboss's push is
   visible in a per-frame sample where the script's is not, because it happens
   in the ENEMY driver, after the background object has already run and cleared
   the handshake.
3. **Everything on the stage-1 script from clk 232 to clk 488**, which a
   held-fire run now reaches. [M] no throw anywhere in it. The spawn walker is
   driven by the distance CLOCK, so the kill moves which FRAME each spawn lands
   on but not which clock, and the whole-stage spawn/stats gates (which replay
   board traces) are untouched -- confirmed by the gate below.

---

## 8. THE GATE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 51 passed, 0 failed, 0 SKIPPED
  [PASS] midboss DEATH: the scroll release, type $1C and its 207 map longwords
  [PASS] midboss DEATH RED [no-kill] -- went red without the kill, as it must
```

**49 -> 51 stages, and the two new ones are this wave's scenario and its red.**
Nothing was disabled, skipped, narrowed or loosened. Every pre-existing stage is
untouched, including `fly-around` (**0 divergent on 88 columns over 2,200
frames**, digit for digit with W31's) and the four whole-stage board replays --
which is what the port's no-kill path being unchanged looks like.

```
node --test games/ddpdoj/tests/     706 pass, 0 fail, 0 SKIPPED   (was 697)
```

Nine new tests in `tests/w57midbossdeath.test.js`. Three existing inventory
tests were UPDATED rather than left to rot, and each says what changed:
`handlers.test.js` (the registered set), `initbody.test.js` (20 bodies, with
the 19 SCRIPT bodies asserted separately from W57's deferred one) and
`integration.test.js` (`m.size` 19, with the script denominator still 18 of 19,
the boss). **The denominators were not merged**: type `$1C` is not one of the
nineteen stage-1 script handlers and saying it was would invent coverage.

### 7.3 AFTER -- the DEPLOYED build, same recipe, same browser

Build `20260805035733`, confirmed live on three consecutive polls, then driven
with fire (`z`) HELD from boot:

```
BOOTED     lf2543  clk162
+22.3s     lf3925  clk239     <- PAST the old wall (lf3766/clk232) and past the crawl
+43.8s     lf5184  clk318
+65.7s     lf6486  clk399
+89.9s     lf7870  clk488     <- stops at "$292902 IS NOT PORTED YET"
```

**Killing the midboss on the deployed page no longer stops the game.** What
stops it now is the **stage-1 BOSS**, `$292902`, 4,104 logic frames and about
68 seconds of play further on -- a loud named throw W36 left deliberately, and
the honest new frontier. The `#err` panel is empty for the whole of the midboss
window; the local run against the same bundle over `http://127.0.0.1` stopped
at **exactly the same frame**, lf7870/clk488.

**[M] the server I started for the local run was killed and the post-run sweep
(`Get-CimInstance Win32_Process`) finds ZERO `http.server`/`serve.py`
processes.**

### 7.4 WHAT THE DEPLOY CARRIED THAT IS NOT MINE -- said out loud

W58/E3 (the art wave) was mid-flight in `games/ddpdoj/tools/` when this fix was
ready, with `export-web.mjs`, `webgate.mjs` and `tests/w52weapons.test.js`
UNCOMMITTED. `assets/` is one shared artifact, so the published bundle carries
their work as well as mine. I did not stash, revert or edit any of their files
(`docs/knowledge/05`, and the HANDOVER's own warning about a dirty tree).

What I did instead, and what justified pressing publish: I ran **their** gate on
**this exact tree** and it is green -- `webgate.mjs` **13 of 13 PASS**, including
their two new W58 stages -- on top of `pgm.py check` **51/0/0** and **706** unit
tests. Nothing red was published. But the record should say that build
`20260805035733` contains W58's in-flight art, published by W57.

## LOG (continued)

- **[M] LIVE, BEFORE:** the deployed build stopped at lf3766/clk232 with
  `$26C1C4`, a FOURTH reproduction.
- **[M] LIVE, AFTER:** build `20260805035733` runs to lf7870/clk488 and stops at
  `$292902`, the stage-1 boss. Same frame as the local run against the same
  bundle. Server killed; zero orphans.
- gate **ALL GREEN 51 passed / 0 failed / 0 SKIPPED** (49 -> 51: this wave's
  scenario and its red). Unit tests **697 -> 706**, 0 skipped.

status: **DONE**
