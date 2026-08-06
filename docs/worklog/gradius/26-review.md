# Wave 26 REVIEW - the boss (head `$B914`, body `$B913`)

status: DONE (verdict: APPROVE)
reviewer (read-only), 2026-08-03

Subject: independent verification of `26-recon-boss.md` and `26-impl-boss.md`
against `games/gradius/rip/prg.asm` + the raw `assets/prg.bin`, and a fresh re-run
of the endchain done-when. Everything below was re-derived and re-measured, not
quoted back from the worklogs. No `src/` edit was left in place (the one
temporary RED mutation was restored and SHA-verified; see §4).

Verdict up front: **APPROVE.** The boss port is byte-faithful - every routine,
table and the script-4 decode were re-derived from the ROM and match the impl.
The endchain done-when is met on the cartridge's frame, the RED mutation was
seen, and the full corpus is GREEN with zero skips. Findings are all
MINOR/INFORMATIONAL documentation defects in the *recon text* or honestly-
disclosed coverage limits - none is a correctness defect in the ported code.

## Baseline re-measured (independent of the worklog's numbers)

```
node --test games/gradius/tests/              -> 468 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs         -> GREEN, 10 passed, 0 failed, 0 SKIPPED
   (self-check: 7 deliberate breaks all RED)
   46 scenarios, 22830 of 22831 frames compared (2 truncated: endchain@11012,
     gameover@4364), 0 failures, 0 clamps uncovered, 6 fields SKIPPED
     (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
node games/gradius/tools/oracle/compare.mjs --only endchain
   -> 4851 of 4852 frames compared, TIER 1 800 fields 0 divergent,
      [PASS] THREW at 9904: frame 11013 -- "$9904: $1B = $86 (stage-end)."
      DISPLAY LIST 310464 slot-frames / 125826 live, 0 Y / 0 content mismatches
RED mutation (INC $1B disabled)               -> [FAIL] THREW at 9904: did NOT
                                                throw over 4851 frames
                                                (SHA restored to 94b63200...)
```

The `(X_MIN/Y_MAX/video) FAIL` lines on the `--only endchain` subset run are
`fullRun=false` artifacts (those gates need the whole corpus); they were all
PASS with 0 clamps uncovered in the full `test-all` run.

## Criterion 1 - head/body/script/rank-tables/damage-ladder/death-chain byte-faithful. PASS.

Re-derived from `rip/prg.asm` (lines 6531-6808, 9121-9142) and the raw PRG
(`assets/prg.bin`, base `$8000`). Every boss data table was read byte-for-byte
out of the PRG and cross-checked against the impl's `rom.read(...)` operands:

```
B8EF morph   (7): 6C 6D 6E 6F 70 71 00         -- matches impl line 2532
B8F8 mvmt lo (8): 00 20 40 60 80 A0 C0 F0      -- matches impl line 2634
B901 mvmt hi (8): 01 01 01 01 01 01 01 01       -- see F1: recon text says 02 at rank 7
B90A fire    (8): 5A 50 46 3C 32 28 23 23       -- matches impl line 2621/2587
BAF7 X-off   (4): 08 F8 F8 08                    -- matches impl line 2710
BAFB Y-off   (4): F1 FE 0A 17                    -- matches impl line 2711
BAFF vel     (8): 02 03 03 03 03 04 04 04        -- matches impl line 2718
BB07 vel     (8): C0 00 40 80 C0 00 40 80        -- matches impl line 2719
AE8B script4 (7): A2 6B 6A 69 68 6A 00           -- the boss explosion stream
AE71 ptr[4]     : 8B AE  -> $AE8B  (script 4)    -- $AE71 + 2*4 = $AE79
B8E6-B8EE (9)   : 00 A0 A0 00 00 00 00 01 00     -- NOT boss data (loc_B8A5's)
B900 / B912     : 00 / 23                        -- padding, as the recon says
```

The **script-4 decode** (the "largest unread block") is correct and is the part
most worth confirming, because it is what makes the boss explosion start at
metasprite `$A2`. The chain: `$B988 LDA #$04 / STA $016C,X` overrides the `$02`
that `sub_CB2B` just wrote (impl `bossDeathTail`: `explodeInPlace` then
`bossSet(0x016C+x, 0x04)`). `st_AE99` reads `$016C,X`=4, `ASL`->8, fetches the
pointer at `$AE71+8` = `$AE79` = `8B AE` -> **`$AE8B`**, and the byte stream
there is `A2 6B 6A 69 68 6A 00`. `sub_CB2B` zeroed `$042C[9]`, so frame 0 of the
explosion reads `$A2`. Verified end to end. The impl reuses the existing
`explodeInPlace` (`$CB2B`) and overrides `$016C` to 4 afterward - faithful.

The **`$030B,X` slot-N-1 trick** (the load-bearing addressing oddity) is handled
by the impl's raw-address resolver `bossGet/bossSet`, which mirrors
`porttrace.mjs`'s `peek` range-for-range (incl. the `$03A0`/`$03B0`
carrier/yvel split). Both the body-create (`sub_B9B7`/`sub_B9F2`, run twice via
the `$B9EE JSR` + `$B9F1 DEX` fall-through) and the death body-clear (`$B991`
loop) write the previous slot's `$030C` through the `+$0B` alias; the impl
reproduces both passes exactly (`bodySyncSlot` called with x=9 then x=8; the
clear loop `for (xx=x,y=1; y>=0; xx--,y--)`). Enemy index 9 resolves to absolute
slot 21 (`ENEMY_BASE=0x0C`), bodies to 20/19 - consistent across the boss
resolver, `explodeInPlace` and `hitEnemy`.

The **death chain** (`$B962`-`$B9A7`) is faithful step by step: the stage-1 warp
gate (`$19==1 && $04CC==1 && $04AC<$78` -> `INC $39`, then falls straight into
`$B97A` - the warp does NOT skip the score/kill/explosion), score `LDA #$10 /
JSR $8455` (mid byte `$10` = +$001000, verified against `$8455` at line 806:
`STA $9A / LDA #$00 / BEQ $8469`), `INC $3B,X`, `$CB26` sfx+$02 conversion,
script-4 override, body clear, and `INC $1B` gated by `$0100<2`. The timeout
death (`$04CC>=6 -> JMP $B983`) skips `$B97A` (no score/kill/warp) - the impl's
`scored` flag selects exactly this. Both `$8455` (death, +$001000) and `$845B`
(morph step, +$0050; verified `$845B` ignores A and loads `#$50` at line 814)
are correct.

**The rank-move carry** (`loc_BA18`-`$BA68`) is the one genuinely subtle piece -
the `SBC`/`ADC` carry in is path-dependent and `LDA` does not touch it. The impl
tracks `carry` explicitly through both entry paths (charge-vs-threshold and the
player-Y comparison) and threads the borrow/carry through the lo-then-hi
subtract/add. I traced all four (dir × charge-vs-thr) cases against the 6502
`SBC`/`ADC` semantics; all four match, including the "charge under threshold
subtracts one extra sub-pixel" case the impl's block comment calls out. Correct.

## Criterion 2 - the done-when met on the cartridge's frame; RED verified. PASS.

MEASURED on the re-recorded 12000-frame cartridge artifact
(`out/scen/endchain.json`, `gameFrames: 12000`, re-recorded 2026-08-03 00:06):

- The port runs the boss handler `$B914` for ~2760 frames (boss spawned `$85` @
  f8252; the port is GREEN through every one of them) and the boss **dies by
  TIMEOUT** at f11012 (`$04CC` reaches 6, the `$BA9C -> $B983` path) - matching
  the impl worklog. The player's RUA hold drives the ship to the right wall and
  no missile connects, so HP stays 0 the whole fight.
- `$1B` advances **`$85 -> $86` at f11012** on the cartridge's frame (the port's
  `INC $1B` fires the same frame), and on f11013 the port's `$96A5` ladder
  reaches the `$9904` arm and throws. `compareUntilThrow: "9904"` turns that
  throw into the done-when: **`[PASS] THREW at 9904: frame 11013`**. A non-throw
  (or a throw elsewhere) is the failure.
- 4851 of 4852 compared frames GREEN, **TIER 1 800 fields, 0 divergent**; the
  +1 is the `$86` frame itself (the W27 truncation point). Display list 0 Y / 0
  live-slot mismatches across 310464 slot-frames - the `$8BAB` blank-pass fix
  (impl §5) holds.

**RED mutation (RULE 4).** With `state.substate + 1` -> `+ 0` in
`bossDeathTail` (disabling the `$85->$86` advance; backup first, original SHA
`94b63200258c0825fd2ae192448d09e61bd88977` == `HEAD:games/gradius/src/enemies.js`):

```
mutated SHA : 4fc634c54dc71bd7a18b82c86c655e3da229078a   (differs)
[FAIL] THREW at 9904: did NOT throw over 4851 compared frames -- 9904 may have
       been ported; re-measure
SUMMARY: FAIL endchain  THROW 9904 missing
TIER 1 : 800 fields, 0 divergent   (mutation is surgical: only the $1B advance)
restored SHA: 94b63200258c0825fd2ae192448d09e61bd88977   (== original == HEAD)
git diff HEAD -- games/gradius/src/enemies.js : (empty)
git status --porcelain games/gradius/src/enemies.js : (empty)
```

The done-when went RED exactly because the port never reaches `$86`, so the
`$9904` throw does not fire - while every TIER 1 field still matched (the boss
behaviour is identical; only the death advance broke). Seen RED, restored,
SHA-verified both ways. No `git checkout`/`restore`/`stash`/`add -A` used; the
file was restored from a byte-identical backup copy and verified against `HEAD`.

## Criterion 3 - no regression; corpus unaffected. PASS.

```
node --test games/gradius/tests/        : 468 pass / 0 fail / 0 skipped
node games/gradius/tools/test-all.mjs   : GREEN, 10 passed / 0 failed / 0 SKIPPED
```

The 46-scenario corpus compares **22830 of 22831 frames** (the +2 truncated are
`endchain@11012` and `gameover@4364` - both W27-ish boundaries, expected); 0
failures, 0 stale annotations, 0 display-list failures, 0 video failures. The
`$8BAB` blank-pass change touched `oam.js` and the impl worklog §5 explains why
it left the other 45 scenarios green (none had cull-ghosts; the old top-of-pass
`$F4` fill had been equivalent for them). Confirmed: the display list is 0/0
across the corpus.

## Criterion 4 - the non-scenario paths are pinned. PASS.

The endchain boss dies by **timeout**, so the DAMAGE death, the morph ladder
and the warp arm are not exercised by any scenario. `tests/w26-boss.test.js`
pins all of them (7 tests, each with a named RED-when mutation, all green):

- `$B8EF` morph ladder advances `$6C..$71` one step per damage point;
- morph step (not the initial `$6C`) scores +$0050 (`$845B`) + sfx $08;
- body-sync writes both inert slots (type `$99`, anim `$85`/`$32`, status `$80`);
- damage death at HP=6: type->$02, script-4 override (animFrame `$04`),
  `$1B->$86`, `INC $3B`, score mid-byte `$10`, body clear, sfx `$AC`;
- HP>=7 also hits the death gate (`CPY #$07`, not `#$06`);
- the `$0100>=2` guard skips `$1B` during a ship death;
- the stage-1 warp arm `INC $39` fires only in the `$04CC==1 && $04AC<$78`
  window.

The damage path itself (`$C055`) IS ported in `src/collision.js` `hitEnemy`:
type>=`$80` + status>=`$80` -> armoured branch, the `$048C` vulnerability gate
(`s0480[e]`), the `$0460` missile flag (`s0460[j]`) + shot-slot>=6 -> dmg 2, and
`$046C += dmg` (`s0480[e]`). So the damage death is dynamically reachable in
principle (a shot landing during the `$04CC∈[1,4]` window would advance the HP);
it is simply not reached by any corpus scenario. See F4.

## Findings

**F1 - MINOR (recon doc): `$B901` rank-7 high byte transcribed as `$02`; the ROM
has `$01`.** `26-recon-boss.md` §6 prints `B901: 01 01 01 01 01 01 01 02` and
the "combined magnitudes" list ends `$02F0`. The raw PRG (`assets/prg.bin`,
`$B901-$B908`) is `01 01 01 01 01 01 01 01` - rank 7's high byte is `$01`, so
the rank-7 step magnitude is `$01F0`, not `$02F0`. *No GREEN impact*: the impl
reads `rom.read(0xB901 + rank)` directly (line 2635) and gets `$01`; rank 7 is
not exercised by the endchain run anyway (it is rank 4). Pure recon-text defect.

**F2 - MINOR (recon doc, already corrected by impl): `$032C`/`$036C` X/Y roles
swapped in the recon.** `26-recon-boss.md` §2/§8 labels `$032C`=X, `$036C`=Y
(and the armament offsets follow that). The actual roles are `$032C`=Y (the
rank move clamps it to `[$18,$A8]` vertically, tracking the player) and
`$036C`=X (the intro `$F0->$A3` descent; the `$BA0A` catch-up reads player X at
`$0360`). The impl corrected this - it uses `state.obj.x[0]` for `$0360` and
treats the rank move as vertical - and operates throughout on RAW addresses via
`bossGet/bossSet`, so byte-faithfulness does not depend on the label. Impl
worklog §3 records the correction. No code impact.

**F3 - INFORMATIONAL (stale worklog): the "`$B9C8` mis-printed as `#$32`" claim.**
Impl worklog §3 says the `prg.asm` listing mis-printed `$B9C8` as `LDA #$32`
("two consecutive `A9 32`"). The CURRENT committed listing shows
`B9C8: A9 03 LDA #$03` (line 6640) and the raw PRG byte at `$B9C9` is `$03`. So
the ported value (`$03`) is correct and oracle-GREEN either way, but the
worklog's description does not match the present listing (it was either fixed
post-impl or misremembered). The lone `$A9 32` nearby is `$B9D4`, which is
correct (`$012A[9]=$32`). No code impact; noted so the next reader is not
confused by the worklog hunting for a defect that is not there.

**F4 - INFORMATIONAL (coverage, honestly disclosed): only the TIMEOUT death
trigger is scenario-validated; the DAMAGE death trigger is unit-test-only.**
The endchain boss self-destructs at `$04CC=6` (timeout) because the RUA hold
never lands a missile. The damage death (`$B97A` path: score +`INC $3B` + warp
gate), the morph ladder and the warp arm are pinned only by `w26-boss.test.js`.
This is disclosed in the impl worklog §4 and the test file header, and the
damage path is fully ported in `collision.js` (so it is reachable, just
unexercised). Not a defect - flagging the denominator per RULE 5: the done-when
proves the timeout death, not the damage death.

**F5 - INFORMATIONAL (stale scenario prose): `endchain.why` still says
"compareUntilThrow B914".** The operative `compareUntilThrow` field is `"9904"`
(the `$1B=$86` stage-end arm, changed when `$B914` was ported) and the `_` field
documents the change correctly. Only the `why` prose was not updated. No
behavioural impact - the field that `compare.mjs` reads is correct.

## Must-fix

None. All findings are documentation/coverage notes; none blocks the port. F1
is worth a one-line fix to the recon text (`$02` -> `$01`, `$02F0` -> `$01F0`)
so a future reader does not mis-derive the rank-7 speed, but it is not a code
change.
