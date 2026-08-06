# Wave 11 review - enemy bullets: slots 22-31, the $BC59 allocator, the $BDD5 mover
status: DONE
wave: 11   role: review   started: 2026-08-01

## The task, as I understood it

Review commit `7fe9a7e` as a READER. No edits to `src/` beyond break-and-restore,
no commits. Verify: ROM fidelity at the cited addresses, the fall-through trap,
that the four new scenarios reach the state they name, that the new checks CAN
fail (break, watch red, restore, hash both ways), and that the 36 pre-existing
scenarios did not regress now that the display list ($0200-$02FF) is watched.

## What I MEASURED

### 1. THE GATE, RUN BY ME, COLD

```
node --test games/gradius/tests/
  # tests 303   # pass 303   # fail 0   # skipped 0   # todo 0

node games/gradius/tools/test-all.mjs
  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
        46 of 46 mutations reddened their target; 14 of 14 families seen red
  PASS  sound data == the measured ownership window
  PASS  port trace shape == probe.lua state vector
        [PASS] all 1022 watched addresses are modelled or explained
        12 shape checks, 0 failed
  PASS  the renderer rebuilds the cartridge pixel-exactly (rendergate.py)
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken
        lead1 RED 249, seed-x+1 RED 167, laginject=450 RED 983, seed-nt+1 RED 1,
        seed-pal+1 RED 6, seed-coll0 RED 105, bullet-nosub RED 71
  GREEN -- 8 passed, 0 failed, 0 SKIPPED
```

compare.mjs, from that run:

```
42 scenarios, 13724 of 13724 frames compared (0 truncated), 0 failures,
0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
0 display-list coverage failures, 0 video-coverage failures,
0 deep-reach failures, 6 fields SKIPPED (pad2 oamBudget spriteOverflow
scanline cpuCycle splitSpins)

DISPLAY LIST ($0200-$02FF): 42/42, 878336 slot-frames, 193997 live,
                            0 Y mismatches, 0 live-slot content mismatches
DEATH COVERAGE: 1783 dying frames across 16 scenarios, 19 of 42 expectDying,
                all matched -- including enemy-bullet 121, enemy-bullets-full
                107, enemy-bullet-wall 121
```

**No regression in the 36 pre-existing scenarios**, and the display list is 0/0
across all 42. The implementer's numbers reproduce exactly. The 6 SKIPPED
fields are the pre-existing hardware-only fields (NOT_PRODUCED in porttrace),
not new.

### 2. ROM FIDELITY -- read instruction by instruction against `rip/prg.asm`
and spot-checked against `assets/prg.bin`

Every routine the commit claims: `$BC44-$BC58`, `$BC59-$BCAE`, `$BCB1` (the
FALL-THROUGH into `$BCB5`), `$BCB5-$BDD1` (both rank arms, both speed bumps),
`$83B5-$83E2`, `$BDD5-$BE6D`, `$C20A-$C259`, `$C2A5-$C2FE`, `$C2FF-$C32E`,
`$BF75-$BFC4` and its `$C0AE/$C0B7` tail. **I found no transcription defect.**
Checked in particular:

* `$BD42` carries in the ROR's shifted-out bit (`LDA $1A / BEQ` touch no carry);
  `$BD5F` always carries in 1 (`CMP #$02` overwrote it, and the arm only runs
  when that compare set it). Both arms, both axes. Correct in the port.
* `$C23D LDA $A4,X / SBC` and `$BF87 LDA $A0 / SBC` both inherit a CLEAR carry
  from the CMP that fell through -> the `- 1`. Both present.
* `$BC90 LDX $0496,Y` is `s0480[22 + j]`, not `s0480[j + 12]`. Correct, and
  `state.js` documents the alias.
* `$BE2C/$BE30` are jumps to `$BE6B` (`JMP $AEF8`), so the X test RETURNS and
  the Y update never runs. The port returns.
* `$BDF7 DEC $014C,X` is the FALL-THROUGH target of the reload arm, not its
  else. Correct.
* `$C24E` falls into the loop tail; `$C24B JMP $C1D6` ends at `$C1FA JMP $C2C4`
  and `$C2F1 BCS $C2FF` then still runs the bullet-terrain loop for a dying
  ship. All three reproduced.
* Byte spot-checks off `assets/prg.bin`: `$BC32-$BC43` = `00 F8 08 F8 08 00 F8
  08 00 00 F8 F8 08 08 F8 00 00 08`, `$BC64-$BC67` = `25 59 00 01`,
  `$BDD1-$BDD4` = `60 7A 7B 7C`, `$C202-$C209` = `10 16 16 16 08 12 12 10`,
  `$BC44` = `A5 1A`. All match the code, the export ranges and the anchors.
* Watch list: all 15 object arrays x slots 22-31 are present (150 addresses;
  872 + 150 = 1022). Verified by index, not by counting.

### 3. THE FOUR SCENARIOS DO REACH THE STATE THEY NAME
(read out of the CARTRIDGE recordings under `tools/oracle/out/scen/`, counting
non-zero `w_0136..w_013F`)

```
enemy-bullet        640 rows  max 1 live slot, 153 frames live, f451..f603
enemy-bullets-full  600 rows  max 10 live, 149 frames live; TEN live for 76 frames
enemy-bullet-rank   700 rows  max 10 live, 123 frames live
enemy-bullet-wall   640 rows  max 1 live, 45 frames live, f451..f495 (the ground
                              eats it at f496)
```

`enemy-bullets-full` fires at 451,456,...,516 (14 pokes at align+50..+115) and
the pool is at ten from ~f496, so the four `$BC63` failures at 501/507/511/516
are forced by the recording itself, not asserted. `enemy-bullet-wall`'s poke is
`05B3=16` -- both harnesses parse the value as DECIMAL (`probe.lua` `%d+` /
`porttrace.mjs` `Number`), so it really is `$10` and not `$16`; the "$FF made
the check vacuous" story checks out.

### 4. BREAK-AND-RESTORE, RUN BY ME
Harness: read bytes -> edit -> run -> restore from the bytes read BEFORE the
edit -> sha256 every `src/**/*.js`. Run AFTER the gate finished, never
concurrently with it.

**Corpus** (`compare.mjs --only enemy-bullet,enemy-bullets-full,enemy-bullet-rank,enemy-bullet-wall`):

```
[RED ] 221  CONTROL: $BC59 allocator scans UP instead of down
[RED ]   8  CONTROL: $C312 the terrain probe's +8 dropped
[GREEN]  0  $BF7D: the WHOLE shot-vs-bullet body made unreachable
[GREEN]  0  $83BF: the >= $80 pre-scale arm dropped entirely
[RED ]  34  $BE62: the Y upper free bound $C4 -> $C5          (mine, new)
[RED ]  81  $BC8B: the new bullet's status 0 -> 1             (mine, new)
SRC RESTORED byte-identical: true
```

Both controls reproduce the implementer's own numbers exactly (221 and 8), so
the harness and the corpus are honest.

**Unit suite:**

```
[RED ]  2  $BF7D/$BF87: the two AXES swapped
[RED ]  1  $BF9F: INC $5D dropped
[RED ]  3  $83CD: the divide runs 16 iterations, not 17
[RED ]  2  $C23F: the -1 dropped (player vs bullet dy)
[RED ]  1  $BC8E: muzzle index from s0480[j+12] instead of s0480[22+j]
[GREEN]  0  $BF87: the -1 dropped (shot vs bullet dx)     <-- whole 303-test suite
[GREEN]  0  $BF83: the constant $10 replaced by $A3       <-- whole 303-test suite
[GREEN]  0  $83BF: the >= $80 pre-scale dropped           <-- whole 303-test suite
SRC RESTORED byte-identical: true   (9e2ccac8...fb41 both ways, all three batches)
```

## What I FOUND

1. **`$83BF`, the divide's `>= $80` pre-scale, is interrogated by NOTHING.**
   GREEN on the whole 303-test unit suite AND GREEN on all four bullet
   scenarios when the arm is deleted outright. `tests/enemies.test.js` has
   `assert.strictEqual(divide83B5(s, 100, 0, 200).lo, 128, '$83C3 halves both')`
   -- that assertion is arithmetically incapable of failing, because
   `100*256/200` and `50*256/100` are both 128. The test's own "RED WHEN" list
   names "the >= $80 pre-scale is dropped". The arm is REACHABLE IN PLAY: the
   divisor is `max(|dx|,|dy|)` and `$BC56` only fires when the ship is LEFT of
   the enemy, so a shot across the screen has `|dx|` well over $80. I read the
   arm against the listing and it is transcribed correctly -- this is an
   uninterrogated parameter, not a bug. A witness needs min < max/2 with
   max >= $80, e.g. `divide83B5(s, 3, 0, 200)`: 2 with the pre-scale, 3 without.

2. **Two of `$BF7D`'s parameters are held by nothing either**, and the test
   comment claims otherwise. Dropping `$BF87`'s `- 1`, and swapping `$BF83`'s
   constant `$10` for the shot width `$A3`, are both GREEN on the whole unit
   suite -- and `$BF7D` is measured n=0 by every scenario (I confirmed: making
   the whole body unreachable is GREEN 0 on the corpus). The reason both
   survive is the test's own geometry: shot and bullet are both at (100,100),
   so dx = 7 or 8 are both inside $10, and `$BFD2[0]` IS `$10`, so the
   constant-swap is a no-op for subtype 0. The three assertions that DO bite
   (axes swapped, `INC $5D`, `$BFBB CMP #$59`) are real.

3. **`src/collision.js` `bulletsVsTerrain`'s header is stale in its own
   commit** (rule 5). It says "NOT REACHED BY ANY SCENARIO YET ...
   `enemy-bullet-ground` is the scenario that closes that: it aligns at 1700
   like `deep-ground`". There is no `enemy-bullet-ground` in
   `scenarios.json`; the scenario that closes it is `enemy-bullet-wall`, it
   aligns at 400, and `$C327` DOES fire in it at f496 -- which is exactly what
   makes my `$C312` control go RED 8.

4. **`porttrace.mjs`'s `bullet-nosub` comment cites the wrong address.** It
   says "zeroing the two sub-pixel accumulators `$0396`/`$03F6`"; the code
   zeroes `obj.xf` and `obj.yf`, which are `$0396` and `$0356`. `$03F6` is
   `yvelf[22]`, a different array.

5. **`11-impl-enemy-bullets.md` §2's divide table is mis-transcribed.** It
   prints `(33,33)->116 (38,38)->33 (45,45)->11 (60,60)->8 (75,75)->6
   (90,90)->5`. The correct pairs, from the test's own table and from the
   arithmetic, are `(15,33)->116 (5,38)->33 (2,45)->11 (2,60)->8 (2,75)->6
   (2,90)->5` -- the worklog dropped the min and repeated the max. The CODE and
   the TEST are right; only the restart record is wrong, which is the one place
   it matters most.

6. **The `$882C` judgement (item 2 of the implementer's own list) is sound as a
   diagnosis and questionable as a treatment.** The lag table across all 44
   recordings supports the finding: `autofire-die` drops at f614 and
   `enemy-bullets-full`'s respawn is ALSO at f614 and does not -- same frame
   number, different object load, which is exactly the cycle argument. But the
   response was to shorten the window to f401-f600, which removes a MEASURED
   port-vs-cartridge divergence from the gate entirely. The corpus has a
   `knownFail` mechanism that prints `[STILL BROKEN]` for precisely this (it is
   used for `$8871`). Truncation leaves the only record of it in a `why` string
   nobody has to read. Six other scenarios still compare a respawn where both
   sides drop, so coverage is not zero -- but the gate can no longer see the
   one configuration where the port is known wrong.

## What I RULED OUT

* **Not a fall-through miss.** All nine hazards on this path were checked
  individually (list in §2 above); `$BCB1`, `$BDF7`, `$C24E`, `$C1FA -> $C2C4`,
  `$C2F1`, `$BFBF -> $C0AE -> $C0B7`, `$BE2C/$BE30 -> $BE6B` are all right.
* **Not a scenario that fails to reach its state.** §3: measured off the
  cartridge recordings, not off the scenario names.
* **Not a display-list regression.** 42/42, 878336 slot-frames, 0 mismatches,
  in my own run.
* **Not a silent no-op replacing a throw.** The remaining unported arms
  (`$BC44`'s `$1A`/`$19>=2` gate, `$BBC3-$BBEB`, `$C22F` box class > 2,
  `$C03D`, `$C263`) are still named throws carrying their ROM address.
* **Nothing ROM-derived committed.** `git diff-tree` on `7fe9a7e`: 22 paths, all
  under `games/gradius/{src,tests,tools,index.html}` or `docs/`; no deletions
  (`--diff-filter=D` empty); `assets/` and `tools/oracle/out/` are both
  gitignored. `games/ddpdoj/` and `games/batman/` untouched.
* **Not a restructure disguised as a port.** The only non-bullet change in
  `collision.js` is `shotVsBullet`'s call site gaining `res, x, a0, a1, a3`.
  `shotProbe`'s `+$0B` is pre-existing, not this commit.

## If someone picks this up cold

The three GREEN breaks in §4 are the work item: `$83BF`'s pre-scale first,
because it is reachable in ordinary play and nothing anywhere can see it.
`divide83B5(s, 3, 0, 200)` is a two-line unit test that closes it. The
`$BF7D` pair needs the bullet moved off the shot's own pixel in
`tests/weapons.test.js` -- e.g. dx at 15 and 16, dy at 15 and 16, and a
subtype-1 shot where `$A3` is `$30` rather than `$10`.
