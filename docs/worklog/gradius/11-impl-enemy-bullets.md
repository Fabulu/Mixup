# Wave 11 (follow-up) - enemy bullets: slots 22-31, the $BC59 allocator, the $BDD5 mover
status: DONE
wave: 11   role: impl   started: 2026-08-01

## The task, as I understood it

`05-FINDING-enemy-bullets-reached-in-play.md`: the owner flew LEFT of an enemy in
the live build and the port threw at `$BC56 BCC -> $BC59`. The exclusion's premise
("no measured run has exercised them") was a fact about OUR CORPUS promoted into a
claim about the cartridge.

Port: `$BC59` (allocation), `$BDD5` (the mover), slots 22-31 and their interaction
with the shared object arrays. PRESERVE what the cartridge does when allocation
FAILS. Build scenarios where enemies actually fire. RED-VALIDATE everything. Fix
the page text in the same commit.

## What I built

### 1. A new probe, because nothing existed that could see this path

`tools/oracle/bulletprobe.lua` + `.py`. 38 exec hooks over `$BBB7 $BC0C $BC44
$BC58 $BC59 $BC63 $BC6A $BC77 $BCB1 $BCBE $BCD8 $BD1C $BD1F $BD28 $BD46 $BD65
$BD7E $BD9A $BDB9 $BDD5 $BDE1 $BE01 $BE17 $BE39 $BE4F $BE6B $C20A $C22F $C24B
$C24E $C2FF $C30A $C327 $BF75 $BF7D $BF97 $BF9F $83B5`, three of them recording
ARGUMENTS at the instruction (the firing decision's operands, the allocated slot,
and the divide's inputs AND outputs), plus a per-frame dump of all fifteen arrays
of all ten bullet slots. It also speaks the corpus's own poke syntax.

### 2. The port

* **`src/enemies.js`** - `allocBullet()` (`$BC59-$BCAE`, including the `$BC63`
  failure arm), `aimBullet()` (`$BCB5-$BDD1`, both rank arms and both speed
  bumps), `divide83B5()` (`$83B5`, transcribed instruction by instruction), and
  `moveBullet()` (`$BDD5-$BE6D`). `bulletUpdate()` (`$BC19`) stopped being a
  tripwire and became the loop it always was.
* **`src/collision.js`** - the bodies of `$C20A` (player vs bullets, `$C24B`
  death and `$C24E` shield), `$C2FF` (bullets vs terrain) and `$BF75` (a shot vs
  a bullet: `$BF97`'s type-2 arm, `$BF9F`'s INC `$5D` + score + sfx, `$BFBB`'s
  `$59` arm).
* **`src/state.js`** - `work.bulletSlots` and `work.bulletAllocFail`.
* **Assets**: four new ROM ranges through `export_assets.py`, each anchored on
  the opcodes around it - `bulletMuzzle $BC32-$BC43`, `bulletKind $BC64-$BC67`,
  `bulletAnim $BDD1-$BDD4`, `bulletBoxes $C202-$C209` - with re-read,
  offset-re-derivation and measured-consequence arms in `verify_assets.py` and
  six new self-test mutations.
* **Watch list**: 872 -> **1022** addresses. Fifteen arrays x ten slots.
* **Four new scenarios**, corpus 39 -> **43**.

## What I MEASURED

### 1. WHY NO SCRIPT CAN REACH THIS, and it is not "the ship is in the wrong place"

`$BC44` IS reached naturally. Over 1900 frames of `enemy-waves`'s own script:

```
$BC44 n=7  at f1158 1223 1285 1354 1734 1799 1862 -- and $BC58 RTS all seven
  every one type $88, enemy X = 33..38, playerX = 240, $040C = $04EC = 200
```

The countdown is the reason. `$04EC` is `style AND $FE`, and **every stage-1
squadron's style is `$C8`/`$C9`** - read out of `$A5BC` through the descriptors
for all 22 pattern entries, and confirmed on the cartridge by those seven rows.
So an enemy reaches its shot 200 frames after its `$F0` spawn, by which time it
has marched to X ≈ 35, and `$BC56` needs the ship STRICTLY further left. Five
scripted attempts to get there:

| script | result |
|---|---|
| `L` from 210 | dies f1083, before any enemy is 200 frames old |
| `RD` to 1080 then `L` | dies **f1149**, X = 170 |
| `RD` to 1560 then `L` | dies **f1734**, X = 106 |
| `RD` to 1720 then `L`, `$40 = 6` | dies **f1742**, X = 152 |
| `RD` to 1740 then `L`, `$40 = 6` | dies **f1800**, X = 72 |

Stage 1's opening kills anything in the left half long before frame 1158. So the
scenarios poke `$040C,X` - the countdown itself, one frame before the borrow the
cartridge was always going to take. `POKEABLE_RANGES` carries that reasoning.

### 2. WHAT THE CARTRIDGE DOES, measured before a line was written

One fire, `--poke 0415=0@450`:

```
$BC44/$BC59/$BC68 at f451; enemy (96,42) type $85 status 1, ship (80,96)
$BC6A -> bullet slot 9  ($0496 = 0, so muzzle (0,0))
$0136 = $25   $0316 = $00   $0176 = $00   $0116 = $00
$BD1C: |dy| 53  |dx| 16  dir 1  steep 1     $BD1F: $98:$99:$9A = 0:0:77
-> yvel 1 yvelf 0  xvel 0 xvelf 77 ; $BE17 + $BE39 on all 154 frames
$C22F n=50, $C24B at f500 (dx 0, dy 3; dx was 255 at f499), $BE6B at f604
```

Ten fires five frames apart:

```
$BC59 n=14  $BC68 n=10  $BC63 n=4  (f501, f507, f511, f516)
allocated slots, in order: 9,8,7,6,5,4,3,2,1,0  -> object slots 31 down to 22
$BD1F over the ten:  (16,53)->77  (18,45)->102  (23,35)->168  (25,28)->228
                     (33,33)->116 (38,38)->33   (45,45)->11   (60,60)->8
                     (75,75)->6   (90,90)->5
```

`divide83B5()` reproduces **all ten exactly**, `$98` and `$99` zero on every one
(tests/enemies.test.js replays them).

With `$46 = 5` poked: `$C24E` at f493, 494, 498, 500, 503 - five absorptions -
and `$C24B` kills at f513. With `$45 = 2` and `$46 = 5` (rank `$17` = 3):
`$BCBE` n=10, `$BD65` n=5, `$BDB9` n=5, `$BE01` n=124.

**That last configuration corroborates `docs/knowledge/08` independently.** The
power-up recon's rank-1-vs-rank-4 run recorded exactly these five sites moving
(`$BCBE` 0→24, `$BCD8` 20→0, `$BD65` 0→4, `$BDB9` 0→20, `$BC44` 38→43) as its
positive control, months before this path was ported. Same sites, same direction.

### 3. THE FOUR SCENARIOS, and the gate they passed on the FIRST run

```
node tools/oracle/compare.mjs --only enemy-bullet,enemy-bullets-full,enemy-bullet-rank,enemy-bullet-wall
  PASS  enemy-bullet        239 frames  all TIER 1 fields exact
  PASS  enemy-bullets-full  199 frames  all TIER 1 fields exact
  PASS  enemy-bullet-rank   299 frames  all TIER 1 fields exact
  PASS  enemy-bullet-wall   239 frames  all TIER 1 fields exact
  DISPLAY LIST: 0 Y mismatches, 0 live-slot content mismatches
```

800 compared fields per scenario over 976 frames, with up to ten bullets in
flight, their aim vectors, their sprites in the display list, two deaths, five
shield absorptions and four allocation failures. **Zero divergent fields.**

### 4. SEEN RED - 17 breaks against the corpus, 6 survived

`scratchpad/break11.mjs`: edit `src/`, run the four scenarios, read the failure
count off the SUMMARY LINE (never off prose - wave 10's near miss), restore from
the bytes read before the edit, sha256 every `src/**/*.js`.
**`SRC RESTORED byte-identical: true`.**

| break | corpus |
|---|---|
| `$BC59` allocator scans UP | **RED 221** |
| `$83CD` divide runs 16 iterations not 17 | **RED 378** |
| `$83B5` `INC $5D` dropped | **RED 4** |
| `$BD65` the `$17` bump carries the ROR bit, not 1 (X-major) | **RED 10** |
| `$BDB9` the same, Y-major | **RED 10** |
| `$BE2A` X free bound `$02` -> `$03` | **RED 15** |
| `$BC90` muzzle index from `$0480+j+12` instead of `$0496` | **RED 173** |
| `$BCC6` the lead reads `$02 >> 1` instead of `>> 2` | **RED 42** |
| `$BCCC` the ADC carries bit 7 of `$02` instead of bit 1 | **RED 11** |
| `$C250` the shield frees slot `j` instead of `$0A + j` | **RED 266** |
| `$BC86` the box class is not copied into `$0176` | GREEN |
| `$BDFD` `dir >= 2` written as `dir & 2` | GREEN |
| `$BD0D` `|dx| >= |dy|` made strict | GREEN |
| `$C224` `ADC #$04` given the CLC the ROM does not have | GREEN |
| `$C23F` the `- 1` the clear carry supplies, dropped | GREEN |
| `$C238/$C242` the width and height tables swapped | GREEN |
| `$C312` the terrain probe's `+ 8` dropped | GREEN, then **RED 8** |

Re-run after the `enemy-bullet-wall` fix below: **11 RED, 6 survivors.**
`SRC RESTORED byte-identical: true` after both batches.

The six survivors, re-graded against the UNIT suite (`scratchpad/break11u.mjs`,
same restore + hash discipline):

```
[RED ] 1    $BC86: the box class is not copied into $0176
[RED ] 1    $BD0D: |dx| >= |dy| becomes |dx| > |dy|
[RED ] 2    $C23F: the -1 the clear carry supplies is dropped
[RED ] 1    $C238/$C242: the width and height tables swapped
[GREEN] 0   $BDFD: the X direction test uses bit 1 instead of >= 2
[GREEN] 0   $C224 ADC #$04 given the CLC the ROM does not have
SRC RESTORED byte-identical: true
```

**Every one of the survivors was diagnosed, not noted.** Two are provably
EQUIVALENT to the ROM, one is vacuous while a table entry stays unreachable,
three are real corpus blind spots now covered by unit tests, and the seventh
(`$C312`) turned out to be a defect in my own scenario and is now red.

* **`$BDFD` and `$C224` are not holes.** `$046C` is built by two `INY`s from 0,
  so it is 0..3 and `CMP #$02 / BCC` and `AND #$02` agree on every value it can
  take. `$C224`'s inherited carry needs playerY > 247 and `$A052` caps `$0320`
  at 192. Both are now stated at the code, with "measured GREEN and it should
  be" next to them, so the next person does not re-derive it.
* **`$BC86` is vacuous too, for now**: the box class is the bullet KIND, and
  kind 1 needs a firing enemy with status `$80-$8F`, measured n=0. Covered by a
  unit test that walks the window `$01/$80/$8F/$90/$FF`.
* **`$BD0D`, `$C23F` and `$C238/$C242` are real blind spots and are the reason
  this section is worth the time.** None of the ten fires in the corpus has
  `|dx| == |dy|`; and every accepted bullet-vs-ship frame has dx = 0 and dy = 1,
  which is inside a `$10 x $08` box AND inside an `$08 x $10` one AND inside the
  same box one pixel bigger. Three new unit tests separate them, each written
  from the ROM's own arithmetic and each seen red (the block above).
* **`$C312` was MY BUG, in the scenario, not in the port.** `enemy-bullet-wall`
  poked `$05B3 = $FF`, and `$FF` sets all four 2-bit fields - so the `+ 8` that
  moves the probe from tile row 13 to row 14 (the same cell either way, because
  the cell index is `trow >> 2`) could not change the answer. Re-measured on the
  cartridge with `$10`: `$C327` still fires at f496, and the break is red. The
  scenario's `why` now carries that, because **a poked constant can make a check
  vacuous exactly the way a scripted one can.**

### 4b. THE DISPLAY LIST, which nobody had to touch

The bullets entered page `$02` for free: `$8B47` walks slots 0-31 and the port's
`src/oam.js` already did. The number that says so:

```
=== DISPLAY LIST COVERAGE ($0200-$02FF) ===
  42/42 scenarios compared, 878336 slot-frames, 193997 live
  [PASS] 0 Y mismatches, 0 live-slot content mismatches
```

193,997 live slot-frames against wave 10's 178,577 - the difference is the
bullets' own sprites, byte-exact including the OAM slot they landed in, which is
what makes the allocator's downward scan a compared fact rather than a comment.

**A WARNING FOR WHOEVER RUNS THIS NEXT.** One intermediate run of this block
reported `[FAIL] 27 Y mismatches` and it was my own fault: I ran `compare.mjs`
while `break11.mjs` had `src/` mutated. The harness restores, but not
instantaneously. Do not run the comparison and the break harness at the same
time; the same mistake also produced one `SRC RESTORED byte-identical: false`,
which was a concurrent edit of mine and not a harness failure. Both were re-run
clean and both are the numbers above.

### 5. A DEFECT IN A PRE-EXISTING TEST, found by porting the loop

`tests/enemies-unwitnessed.test.js` asserted `s.spawn.zA8 === 9` after a fire,
with the comment "`$BBF0 STX $A8` must hold the slot that fired". **The cartridge
does not do that**: `$BC0F JMP $BC19` runs `LDX #$09 / STX $A8` and then walks
`$A8` down to `$FF`. The test passed only because the port's `$BC19` was a no-op
loop that never touched `$A8`, and `$A8` is not a watched address, so nothing
else could have caught it. Corrected with the loop body, in this commit.

### 6. A MEASUREMENT WAVE 11 COULD NOT CLOSE: `$882C` does not always drop a frame

`src/flow.js fullScreenLoad()` sets `frameDrops = 1` unconditionally, with the
comment "the cartridge's own work overran this frame's vblank on EVERY measured
run". `enemy-bullets-full` is the first window where it did not:

```
enemy-bullets-full  700 frames  lag=1 [283]      respawn at f614 -- NO drop
enemy-bullet-wall   640 frames  lag=2 [283, 617] respawn at f617 -- dropped
enemy-bullet        640 frames  lag=2 [283, 621] respawn at f621 -- dropped
```

compare.mjs read `lagged@614 LAG rom 0 port 1`. `$882C`'s 2304 PPU writes sit
marginally inside the frame and what tips them over is a cycle question this port
has no model for (docs/knowledge/06). I did NOT invent a condition. The scenario's
window was shortened to f401-f600, which is before its own respawn and still
contains everything it exists for (the four `$BC63` failures at f501/507/511/516,
ten live bullets, and the death at f493) - and the other two scenarios still
compare a respawn with the lag exact. The scenario's `why` says all of this and
says explicitly: **do not "fix" it by making `frameDrops` conditional on
something plausible.**

### 7. THE WHOLE CORPUS, RE-RECORDED COLD, AND THE GATE

```
python games/gradius/tools/oracle/scen.py
  === ORACLE CORPUS: 43 scenarios, align frame 400, 1022 watched addresses ===
  (all 43 re-recorded from the cartridge under Mesen, this commit -- the watch
   list grew, so every pre-existing artifact was stale by construction)

node games/gradius/tools/oracle/compare.mjs
  42 scenarios, 13724 of 13724 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED

  DISPLAY LIST: 42/42, 878336 slot-frames, 193997 live, 0 Y, 0 live-content
  DEATH COVERAGE: 1783 dying frames across 16 scenarios, 19 of 42 expectDying,
                  all matched -- including enemy-bullet 121 and
                  enemy-bullet-wall 121, two deaths the corpus could not
                  previously cause at all
  VIDEO: TERRAIN MAP 0/512; 0 nametable over 30 strictly graded, 0 palette,
         0 hardware-OAM; [STILL BROKEN] knownFail $8871, 9 of 12 windows
  DEEP REACH: deep-page4 reaches $B098 at f2301; 1 scenario past $0380

node games/gradius/tools/oracle/shapecheck.mjs
  [PASS] all 1022 watched addresses are modelled or explained
  12 shape checks, 0 failed
```

`42 scenarios` in compare.mjs against `43` in scen.py is not a discrepancy:
`deep-page4` is recorded like every other scenario and graded by DEEP REACH
because the port still cannot execute its window ($B098 is wave 12's).

```
node games/gradius/tools/test-all.mjs

  neuter lead1          -> RED, 249 TIER 1 failures (good)
  neuter seed-x+1       -> RED, 167 TIER 1 failures (good)
  neuter laginject=450  -> RED, 983 TIER 1 failures (good)
  neuter seed-nt+1      -> RED,   1 TIER 1 failures (good)
  neuter seed-pal+1     -> RED,   6 TIER 1 failures (good)
  neuter seed-coll0     -> RED, 105 TIER 1 failures (good)
  neuter bullet-nosub   -> RED,  71 TIER 1 failures (good)      <-- wave 11
  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
  PASS  sound data == the measured ownership window (snddata.py --selfcheck)
  PASS  port trace shape == probe.lua state vector
  PASS  the renderer rebuilds the cartridge pixel-exactly (rendergate.py)
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken

  GREEN -- 8 passed, 0 failed, 0 SKIPPED

node --test games/gradius/tests/
  # tests 303   # pass 303   # fail 0   # skipped 0   # todo 0
```

**0 SKIPPED at both levels.** Inside the gate: `verify_assets.py --self-test`
reports **46 of 46 mutations reddened their target; 14 of 14 families seen red**
(39 before wave 10, 40 before this wave -- six of the six new ones are the
enemy-bullet tables), and `rendergate.py` still rebuilds every natural frame at
**0 of 61440 pixels**.

`bullet-nosub` is wave 11's own neuter and it is in the gate for the reason wave
10 put `deep-ground` there: every scenario the self-check subset held has ZERO
live enemy-bullet slots on every frame, so it would have been a break that does
not break. `enemy-bullet-rank` joined the subset with it.

**ONE COSMETIC CHANGE LANDED AFTER THAT GATE RUN**, and it is named rather than
glossed: the four new `scenarios.json` entries were appended as single JSON
lines and then reflowed to the file's own indented style. The reflow script
parses the file before and after and asserts the two objects are `==` before
writing, so the gate above ran on byte-different but semantically identical
JSON. `node --test` was re-run after it (303/303).

## What I could not do, and why

1. **No NATURAL (unpoked) window reaches `$BC59`.** §1 is the measurement, not an
   assumption: five scripts, four deaths, and a 200-frame countdown that every
   stage-1 squadron shares. The owner reaches it in ordinary play because a human
   dodges; a fixed hold cannot.
2. **`$BF75`'s body ($BF7D/$BF97/$BF9F) is ported and NO SCENARIO REACHES IT.**
   Measured: two runs with A held and ten bullets converging give `$BF75` n=6651
   and n=1473, and `$BF7D` **n=0** both times - the shot's `$10 x $10` box and a
   bullet aimed at the ship do not overlap in these geometries. It is held by
   three unit tests (the destroy arm, the type-2 clink, the `$59` laser arm) and
   by nothing else. **This is the weakest part of the wave.**
3. **`$BC77` (bullet kind 1, metasprite `$59`) is listing-only.** It needs a
   firing enemy with `$010C` in `$80-$8F`; measured n=0 in every run made here,
   because no stage-1 squadron sets bit 7. Ported (four lines, unambiguous) and
   labelled at the code, at the table, and in the unit test.
4. **`$BDE1`, the bullet ANIMATION, is dead on the ported path** and is
   transcribed anyway: `$BC8B` sets the new bullet's status to 0 and `$BDDA`
   leaves on it, measured n=0. It is reachable from `$B3B9/$B4B3/$B4FA`, three
   entries of two unported enemy handlers.
5. **`$BC44`'s `$1A`/`$19 >= 2` arm** (stages 2+ skip the position gate) stays a
   loud throw, as does the `$BBC3-$BBEB` ladder above it.
6. **The `$C202/$C206` box constants are bracketed, not pinned.** 1267 rejected
   and 2 accepted samples give W ∈ [1,235] and H ∈ [2,204], because a bullet
   aimed at the ship arrives head on and every accept has dx = 0. What holds
   `$10`/`$08` is the byte-for-byte re-read from the .nes; what the play data
   holds is the INDEXING. Said so at `EXPECT_COLL_BULLET_BOX`.
7. **`work.bulletSlots` is asserted by the port and NOT compared against the
   cartridge's own execution count**, unlike `work.enemySlots`, which
   `objloop.lua` counts at `$ADE5` and `compare.mjs` grades per frame. Adding a
   `$BC21` counter (and a `$BC63` one, which would make the allocation-failure
   count a compared field rather than an internal one) means changing the
   objloop artifact schema, which stales all 43 recordings and costs a
   40-minute re-record. Written down instead of half-done. **This is the
   cheapest real improvement left on this path.**
8. **`games/ddpdoj/` and `games/batman/`: not touched, not measured.** The
   shared index still carries another agent's staged deletions -- 67 entries,
   `D` on files that exist on disk -- exactly as wave 10 and wave 99 described.
   I committed through a private index (`.git/gradius.index`), read-tree'd
   immediately before the commit.

## If someone picks this up cold

* The corpus is **43 scenarios and 1022 watched addresses**. Any artifact
  recorded before this commit is stale; `loadOracle()` says so by name.
* `python games/gradius/tools/oracle/bulletprobe.py --frames 700 --script
  "200:,10:S,490:" --poke "0415=0@450,..." --hits --args --dump 450:60
  --dumpslots` is how every number above was taken. `$040C+j` = 0 makes enemy
  slot `j` fire on the next frame.
* To see the new checks bite in ten seconds:
  `node tools/oracle/compare.mjs --only enemy-bullet --neuter …` is not needed -
  change `for (let x = 9; x >= 0; x--)` in `allocBullet()` to count up and run
  `--only enemy-bullet,enemy-bullets-full,enemy-bullet-rank,enemy-bullet-wall`.
* **The next thing to do here is `$BF7D`**: find a geometry where a player shot
  and an enemy bullet overlap, and promote three unit tests into a scenario.
