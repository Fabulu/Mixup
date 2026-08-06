# Wave 7 review - the power-up loop (capsule pickup, meter, shield)
status: DONE
wave: 7   role: review   started: 2026-08-01

## The task, as I understood it

Reviewer / READER for wave 7 (`b9a40d1`). Lens: behaviour preservation and
fidelity to the cartridge. Narrowed remit: fast gate + ONLY the oracle
scenarios this wave touches, read the diff against ROM bytes, break >= 2 new
checks and watch them go red, and LIST EXPLICITLY what I did not re-run.

I am a READER. The only writes to `src/` were the four deliberate breaks below,
each restored and each verified byte-identical by sha256 afterwards.

## What I MEASURED - the gate (I ran it)

```
$ node --test games/gradius/tests/
# tests 256  # pass 256  # fail 0  # skipped 0  # todo 0   duration_ms 8975

$ node games/gradius/tools/test-all.mjs
  35 scenarios, 11695 of 11695 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  self-check: neuter lead1 -> RED 193; seed-x+1 -> RED 116; laginject=450 -> RED 640
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```
The "6 fields SKIPPED" are the pre-existing per-FIELD exclusions, not skipped
stages; the stage count is 0 SKIPPED. Both numbers match the implementer's.

## What I MEASURED - the oracle side, re-recorded FROM THE CARTRIDGE by me

`scen.py` re-run so the comparison is not against the implementer's own
recording. First the wave's own five plus the two controls:

```
$ python games/gradius/tools/oracle/scen.py --only capsule-pickup
$ python games/gradius/tools/oracle/scen.py --only capsule-consume capsule-sweep \
      capsule-shield capsule-die right-wall autofire-laser        real 1m50s
```
Then, because the wave DID change something every scenario passes through (the
watch list grew by `$17` and `computeRank` runs on every mode-5 tail), the whole
corpus - 35 scenarios, ~11 minutes, not the "nearly five hours" the brief feared.

Transitions read straight out of MY artifacts (`out/scen/*.json`), which
reproduce the scenario prose exactly:

```
capsule-pickup  align 400 700f lag1[283]  w_0042 (647,0,1)  w_0044 (401,0,1)
                w_0017 (401,0,1)  w_0047 (530,0,1)(678,1,2)
capsule-consume same, but w_0040 (647,0,1) and w_0042 never moves
capsule-sweep   w_0042 461/481/501/521/541/561/601/621/641/661 as documented
                w_0017 (481,0,1)(561,1,2)(581,2,3)(621,3,4)
                w_0040 (421,0,1)(661,1,2)  w_0045 (561,0,1)(581,1,2)
capsule-shield  w_0046 (401,0,5)(493,5,4)(509,4,3)(526,3,2)(542,2,1)(647,1,0)
                w_0100 (283,0,1)(658,1,2)(779,2,1)   lag 2 [283, 779]
capsule-die     w_0042 (626,0,6)(635,6,1)(690,1,2)(914,2,1)
                w_0035 (283,0,20)(635,20,4)(914,4,20)  w_0044 (914,1,0)(915,0,1)
```
So the artifact numbers in `scenarios.json` are the artifacts' own numbers.

## What I MEASURED - the ROM bytes

`python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear <a> <b>`, every
address the wave cites. All of the following were read off the cartridge and
match `src/`:

* `$894B-$8971` INC/CMP #$07/JSR $CE89/BNE/LDA #$04 STA $35/CMP #$05/JSR $8455/
  LDA #$01 STA $42/JSR $845B/LDA #$0D JSR $EC1E/JMP $8A30 - verbatim.
  The wrap really is `LDA #$01`. `$895C CMP #$05` compares the A left by
  `LDA #$04`, so the two arms are mutually exclusive; the port's two `if`s are
  equivalent.
* `$8974-$8986` `LDA $0100 / CMP #$01 / BNE $8983`, `LDX $18 / LDA $07,X /
  AND #$40`. `$07`, not `$05`.
* jt_8989 at `$8989`: `83 89 A1 89 AF 89 BB 89 CF 89 D3 89 97 89` = $8983 $89A1
  $89AF $89BB $89CF $89D3 $8997 - seven entries, and the port's table matches
  row for row. `$89CF LDA #$01 / BNE $89BD` really is LASER re-entering DOUBLE.
* `$9C45-$9C5D` verbatim (`$44` tested, `$45` ADDed, `$46` tested, `$19` tested).
* `$8A30-$8A4B` verbatim; `$85E8`/`$85F3`/`$8645` have NO queue-full gate, so
  the port's ungated `queueByte` is right and the extra `$1A` packet a pickup
  appends mid-body is real.
* `$C101-$C1FF` verbatim, including `$C1AC JMP $C20A` (not $C136), `$C1C8 LDX $A8
  / INC $046C,X`, `$C1FD TYA/TAX/JMP $AEF8`, and `$AEF8`'s FIVE stores.
* `$BE93` indexes by **Y**, so `killEnemy(state,res,y)` inside `$C18C`'s
  `LDY #$09` loop is the right index (a port that used X would kill the touched
  slot ten times). Checked because it is exactly a fall-through-class trap.
* `$8B47-$8B89` verbatim; `$8AAC` reads `$99`/`$9A` and never writes them, so
  the second expansion legitimately reuses slot 0's position.
* `$AEC1-$AED6` confirms status 7 on `($47 & $0F) == 0` - the every-16th claim.
* `$C2B5-$C2C1` has NO `$46` test. The implementer flagged this as "read off the
  bytes, unverified"; **I verified it. Terrain kills through a shield.** Closed.
* xrefs: `$894B` <- `$C1B2` only; `$8974` <- `$9A73` only; `$8A30` <- `$8971`
  and `$89AC` only; `$9C45` <- `$9AC4` only; `$C1FD` <- `$C18C`/`$C1AF` only.
  Every "reached from X only" claim in the new code is true.

Ruled out: `$98` (written at `$89BD` even on a refusal, and at `$8A3E`) is a
whole-ROM scratch byte - `zpxref.py 98` shows 60+ sites, every reader preceded
by its own writer - so the port not modelling those two stores is not a
divergence.

## What I MEASURED - breaks I made myself (each seen RED, each restored)

sha256 before/after identical for all five touched files.

| # | break | check that went RED |
|---|---|---|
| 1 | `src/oam.js` `const mask = y === 1 ? 3 : orMask` -> `orMask` | `oam.test.js` `$8B79: the LAST hit flashes` - not ok 5, 5/6 pass |
| 2 | `src/collision.js` `everyEnemy` returns `NEXT_SLOT` not `TO_BULLETS` | `collision.test.js` `$C18C: the every-16th item ...` - not ok 20, 19/20 |
| 3 | `src/score.js` `scoreDigit` drops `& 0x0F` | `powerup.test.js` `$8953/$8958/$8960 ... DIGIT OF THE SCORE` - not ok 3 |
| 4 | `src/powerup.js` `zp.meter = 1` -> `= 0` (wrap to zero) | `powerup.test.js` `$8965: ... wraps $42 to ONE` - not ok 2 |

Breaks 1 and 3 are two of the four "green breaks the corpus could not see"; both
of the closing unit tests are genuinely capable of failing.

## What I MEASURED - corpus breaks (the oracle side, my own recording)

```
BREAK A  src/collision.js: delete `$C1C1 DEC $46`
   node games/gradius/tools/test-all.mjs
   -> 35 scenarios, 11695 frames, 279 failures.  RED -- 4 passed, 2 failed
   restored; sha256 identical.

BREAK B  src/oam.js: `const mask = 3` (the $8B79 flash, ALWAYS)
   node games/gradius/tools/test-all.mjs
   -> compare.mjs 11695 of 11695 frames, **0 failures**, [PASS]
      only `unit tests` FAILed.   RED -- 5 passed, 1 failed
   CONFIRMED INDEPENDENTLY: the 35-scenario corpus is BLIND to $9E. The new
   oam.test.js `$8B79` test is the only thing in the repo that catches it.
   restored; sha256 identical.

BREAK C  src/nmi.js: move `applyCapsule` ABOVE `shotSweep` -- a GENUINE move
   (delete the line, re-insert before $9A70), which is what the implementer
   said their first attempt was not.
   node games/gradius/tools/oracle/compare.mjs
   -> 25 failures, all in `capsule-consume`:
      w_000E@647 w_0040@647 w_0042@647 w_0048@648 w_0702..w_0716 @647/@648
   That is exactly the implementer's "25 fields, first at 647". Their
   correction is honest.
   restored; sha256 identical.
```

Final state after every restore:
```
$ git status --porcelain games/gradius          (empty)
$ node --test games/gradius/tests/              256 pass, 0 fail, 0 skipped
$ node games/gradius/tools/test-all.mjs         GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

## What I RULED OUT

* `$98` is clobbered by `$89BD` (even on a refused DOUBLE/LASER) and by
  `$8A3E`, and the port models neither. `zpxref.py 98` shows 60+ sites across
  the PRG and every reader is preceded by its own writer - pure scratch. Not a
  divergence.
* `$897D LDA $07,X` with `$18 = 1` would read `$08` on the cartridge and `$07`
  in the port. Unreachable: `src/player.js:121` throws on `$18 != 0` earlier in
  the same frame. Not a defect.
* `$C18C` leaves `$A8` at the touched slot. The port's readers of `spawn.zA8`
  (`$AEE1`, `$B251`) are inside the enemy update, which writes `$A8` itself at
  `$ADB3` first, and `$C20C`/`$BFE4` rewrite it before any other read. No leak.
* `$BE93` indexes by **Y**, so `killEnemy(state,res,y)` inside `$C194`'s
  `LDY #$09` loop is the right index. A port that had passed the touched slot
  would have killed it ten times; it does not.
* `$85E8`/`$85F3`/`$8645` have no queue-full gate, so the extra `$1A` packet a
  pickup appends from the mode-5 BODY (out of `$8898`'s phase) is right.
* `$C2B5-$C2C1`: `LDA $0100 / CMP #$02 / BCS $C2C4 / JSR $C3A3 / BEQ $C2C4 /
  JMP $C1D6`. **No `$46` test anywhere.** The implementer marked this "read off
  the bytes, unverified"; it is verified now. Terrain kills through a shield.
* `scenarios.json` gained NO annotations and NO `knownLag` entries - the only
  changes are `0017` in `watch`, prose, and the five new scenarios. Nothing was
  papered over. `compare.mjs` and `test-all.mjs` are untouched by this commit,
  so GREEN is measured with wave 6's yardstick.
* The index is clean (`git diff --cached --name-only` empty) and
  `00-recon-powerups.md`, `pow.py`, `pow.lua`, `reach.py` all exist.

## What I FOUND

1. MINOR, rule 6 - three `src/` comments attribute frame **f626** to the named
   scenario `capsule-pickup`, whose own artifact says **f647**:
   `src/hud.js:65`, `src/hud.js:301`, `src/state.js:228`. The commit message
   claims this sweep was finished ("grep for any 626/778 I missed"); these are
   the misses. `src/nmi.js:400` cites f627 but names the recon's `"380:A"`
   script, which is a real pow.py measurement - confusing next to the scenario
   numbers, but not false.
2. MINOR, rule 6 - `src/enemies.js:131-133` still says `$BE93`'s "only caller
   in this port is `$C0A9`". This commit added two more (`$C1D0` and `$C18C`'s
   loop, both in `src/collision.js`), and the ROM address it gives for the
   second cartridge caller, `$C19E`, is `BPL $C1A9`; the `JSR $BE93` is at
   **`$C1A6`**.
3. INFORMATIONAL - the commit message's "NOT PORTED" list opens with `$8960`'s
   `($07E5 & $0F) == 5` bonus, which **is** ported (`src/powerup.js:99`
   `scoreCapsuleBonus`) and unit-tested. It is unwitnessed by the corpus, not
   unported. The other two entries on that list genuinely are unported.
4. INFORMATIONAL - `state.zp17` is written by `computeRank` and read by nothing
   in `src/`. `$17` is a compared byte with no in-port consumer.
5. INFORMATIONAL - `tests/powerup.test.js:250`'s middle assertion cannot fail:
   nothing in the port recomputes the rank on assignment, so the "RED WHEN"
   it advertises is not reachable by any edit to `src/`.

## What I did NOT re-run  (handed to the final full-corpus pass)

* The **pixel/renderer** gate for gradius (`tools/oracle/rendergate.py`,
  `rendercheck.py`) - not run. A regression there is exactly the shape BREAK B
  proved the corpus cannot see: the force field's second `$8AAC` landing in the
  wrong OAM slots, or `$9E = 3` colouring the wrong palette. `compare.mjs`
  reads sprite 0's four bytes and four work counters and nothing else.
* `tools/build-dist.mjs` (ROM-leak guard) and any `dist/` publish. Wave 7 added
  no assets, so the risk is low, but I did not measure it.
* `verify_assets.py --self-test` standalone - it ran inside test-all and
  PASSed; I did not read its 35-mutation / 13-family breakdown.
* Break-sensitivity of the wave's OTHER new checks. I broke four unit checks
  and three corpus behaviours. NOT seen red by me: `$C1AF`'s `freeSlot`,
  `$C1D0`'s kill, `$8B6F`'s `$1B AND #$70` gate, `$89D5`'s `>= 2` option cap,
  `$897D`/`$8984`'s throws, each of `$9C45`'s four terms separately, and each of
  `$C18C`'s three skip conditions (`$C199 BMI`, `$C19E BPL`, `$C1A4 BCC`).
* `$C1C8 INC $046C,X` (the armoured accumulator). `w_046C-w_0475` are watched,
  but no stage-1 enemy sets `$010C` bit 7, so a wrong index there - e.g.
  `s0460[j]` instead of `s0460[j + 12]` - is invisible to all 35 scenarios. I
  checked it against the bytes by hand; I did not break it.
* `$8960`'s bonus in the ORACLE: no scenario reaches it. A wrong magnitude
  (+$0010 instead of +$001000) would be invisible to `compare.mjs`.
* The three new sfx requests ($0D pickup, $0E apply, $0B every-16th): recorded
  into `state.sfx` and cleared each frame; no oracle field compares them.
* Two-player (`$18 = 1`) anywhere, and the unported `DEC $46` sites `$C24E`
  (enemy bullets) and `$C293` (stage 5) - both behind loud throws.
* The **ddpdoj** side of the staged-deletion incident the implementer flagged.
  I confirmed the gradius index is empty and the four named files exist; I did
  not audit ddpdoj file contents for loss.

status: DONE
