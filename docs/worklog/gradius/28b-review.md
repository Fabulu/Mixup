# Wave 28b REVIEW -- the per-stage ledger + non-mode-5 loudness

status: APPROVED (with findings)   reviewer: sole src/ writer = bammf1, review independent
wave: 28b   reviewed: 2026-08-03   impl worklog: 28b-impl-ledger-loudness.md

Read-only review of the W28b wave (commits 26ba444, 0c13b2d, a737ac3, edd6f76).
Scope: (A) the per-stage coverage ledger + regression gate, (B) the non-mode-5
loudness throws. Every claim below was re-derived; nothing is taken on trust. No
src/ edit and no commit was made by this review; the one break performed on
src/enemies.js was restored and SHA-verified both ways (RULE 4), leaving the
tree byte-identical to HEAD (edd6f76).

## VERDICT

The wave is sound and the impl worklog is honest. Ledger, loudness, and the
no-regression gate all verify. The frame count the worklog quotes (29184/29184)
reproduces exactly; the SHA it quotes (f190eeee...357c28) is the live SHA of
src/enemies.js. One INFORMATIONAL finding only.

## PART A -- THE LEDGER  (games/gradius/tools/oracle/stageledger.py)

Prints all 7 stages with honest fractions; FAILS red on a backward move and
restores clean. The record-counting convention (DISTINCT ROM addresses) is
documented in both the tool docstring and the impl worklog.

### A1. the print reproduces the worklog table exactly

`python games/gradius/tools/oracle/stageledger.py` -- measured 2026-08-03:

```
stage  distinct  ported  unported  inline5  ported %  first unported
0      92        92      0         0        100.0     NONE (shipped)
1      93        88      5         0         94.6     scroll $09A0 (@$A9B5)
2      78        28      5         45        35.9     scroll $00E0 (@$A9CB)
3      98        96      2         0         98.0     scroll $0160 (@$AAFA)
4      28        8       16        4         28.6     scroll $0000 (@$ABB6)
5      98        47      51        0         48.0     scroll $03B0 (@$AC2E)
6      111       95      16        0         85.6     scroll $0340 (@$AD02)
ALL    598       454     95        49        75.9
```

Every row matches the worklog's MEASURED block. distinct = ported + unported +
inline5 holds on every row (the convention is honest, not just asserted).
Convention check: these are DISTINCT addresses -- stage 2's 45 inline-5 records
sit on top of a 28+5 single/formation layer for 78 distinct, NOT 78+45 reads.

### A2. RULE 4 -- the gate was seen to fail (re-done by this review)

Captured baseline SHA of src/enemies.js: f190eeee...357c28 (== the worklog's
quoted SHA). Broke the handler label `case 0xB205` -> `case 0xBEEF` (removing
dispatch() case 0xB205 from the ported set). The ledger went RED, exit 1:

  stage 0 regressed: was fully shipped (no unported record), now first unported at scroll $02C0 (@$A863).
  stage 0 regressed: ported 73 < baseline floor 92 (a handler that was ported is no longer ported).
  (+ 8 more across stages 1,2,3,5,6 -- both signals: first-unported scroll moved
   BACKWARD and ported count < floor. Stage 4 did not move: 0xB205 is not on its
   record set, which is itself the correct behaviour.)

Restored from backup, SHA-verified f190eeee...357c28 both ways, `git status`
clean on src/enemies.js, ledger GREEN (exit 0) again. The worklog's RULE 4 claim
reproduces character-for-character (same stage-0 message, same 73 < 92, same
first-unported $02C0). A SKIP IS NOT A PASS -- the gate exits 1, not SKIP.

### A3. wiring + convention

Wired into tools/test-all.mjs as a coverage stage ("per-stage coverage ledger"),
needs only assets/ (reads prg.bin + dispatch() live, not the .nes), PASSes in
the full gate. The ported set is READ LIVE out of src/enemies.js dispatch()
(via wavecensus._ported_targets, the same read census.py uses), so it cannot go
stale the way a hand-kept literal would. The baseline is COVERAGE (the port's
own state), re-derived every run -- not ROM content; consistent with the
committed rip/prg.asm convention that ROM addresses as identifiers are fair.

## PART B -- LOUDNESS  (src/nmi.js, src/oam.js)

Both throws fire, both cite named ROM addresses, both verified byte-exact
against assets/prg.bin. Neither is reachable in the corpus (the port boots mode
5 / stage 1), so they are tripwires, not regressions.

### B1. the jt_80D4 mode table + the else throw

MODE_TARGETS in nmi.js = [0x80E2, 0x8116, 0x8121, 0x8137, 0x8165, 0x9650,
0x816C]. Read straight out of prg.bin at $80D4: identical. The dispatch bytes
at $80CF-$80D4 are A5 00 20 E4 83 (LDA $00 / JSR $83E4), confirming the
$80D1 cite. Only entry 5 ($9650 = MODE_STAGE) is ported; the new `else throw`
fires for every other mode and names the entry + target.

Probe (node -e, no repo file written):
  mode 0 -> `$80D1: game mode 0 is not ported -- jt_80D4 entry 0 -> $80E2 ...`
  mode 1 -> `$80D1: ... entry 1 -> $8116 ...`
  mode 6 -> `$80D1: ... entry 6 -> $816C ...`
All FIRE, none silent. (Modes 2,3,4 throw by the same else branch -- the code
is `if (mode === 5) stagePlay else throw`, so 0-4,6 are all covered; the brief's
"0-3,6" is the screen enumeration, the implementation is stricter and correct.)
A non-mode-5 entry throws -- CONFIRMED.

### B2. the $8BD9 / $8C06 stage-5 sprite-pass throw

$8B8D-$8B92 in prg.bin: A5 19 C9 04 F0 46 -- LDA $19 / CMP #$04 / BEQ, operand
$46 -> target $8BD9. $8BD9 itself: A2 90 (LDX #$90) ... BD 00 06 (LDA $0600,X)
... 20 06 8C (JSR $8C06) -- exactly what the throw message describes (cursor
$90, walks $0600,X, calls $8C06 per live cell). oam.js buildDisplayList throws
on `state.zp19 === 4`, cited to $8BD9.

Probe: zp19=4 -> `$8BD9: stage-5 ($19 = 4) terrain-object sprite pass is not
ported ...`. FIRES. Verified the ORDERING claim: buildDisplayList runs at $80A7
(line 251), BEFORE the mode-5 state machine at $80AA, so for $19==4 this $8BD9
throw fires before the $9663 census arm -- the flow.test.js assertion was
correctly moved `/\$9663/` -> `/\$8BD9/` to match the real first-failure addr.

### B3. the shapecheck seed consequence

shapecheck seeds a blank machine; its old all-zero RAM = mode 0, which the new
throw (correctly) refuses. Commit a737ac3 seeds $00 = 5 (mode 5). Verified:
shapecheck PASSes (12/12, incl. "the port trace runs on a blank mode-5
machine"). This does NOT re-silence the sweep -- the sweep seeds via
seedFromCartridge which reads $00 faithfully, so its mode-0 windows still throw
$80D1 (loud), not DIVERGED (silent). The two seeds are independent; the fix is
correct.

### B4. why the corpus is unaffected (the gameover subtlety)

The worklog says "no compared frame reaches them". Verified the mechanism: the
gameover scenario is `compareUntilThrow 9751` -- the port throws the
PRE-EXISTING $9751 (continueTimeout, src/nmi.js:868) at the continue-window
expiry, BEFORE the mode would transition to 0. So $80D1 is never reached on
that path; gameover PASSes, throwing $9751 as before. The new throws are
genuinely unreachable today (port boots mode 5, loads stage 1, and the one
mode-0 exit is caught earlier by $9751) -- they exist to make a FUTURE silent
wrong frame loud.

## PART C -- NO REGRESSION

  node --test games/gradius/tests/         -> 475 pass, 0 fail, 0 skipped
  node tools/test-all.mjs                  -> GREEN, 11 passed, 0 failed, 0 SKIPPED
  corpus (compare.mjs)                     -> 47 scenarios, 29184/29184 frames
                                             compared, 0 failures, 2 truncations
                                             (endchain@11527, gameover@4364 --
                                             both expected compareUntilThrow)
  census.py dispatch                       -> 23/42 ported, 19 throwing
                                             (20 distinct ported, 14 distinct
                                             throwing) -- unchanged from W26
  self-check (7 deliberate breaks)         -> all RED (249/167/983/1/6/105/71
                                             TIER 1 failures)

The 29184 frame count reproduces exactly (the impl worklog's number is correct;
games/gradius/tools/oracle/out/gate11.txt is a stale 08-01 subset run showing
13724/42-scenarios, NOT authoritative). The 6 SKIPPED FIELDS
(pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins) are a pre-existing
named set of hardware counters the port does not model; they are FIELDS, not
gate stages, and the headline is 0 stages SKIPPED. They predate W28b.

## FINDINGS

### F1 -- INFORMATIONAL: stageledger.compute() rebuilds all 7 stages 7x

stageledger.py:115-116 -- `for st in range(7): recs = _stage_records()[st]`
calls `_stage_records()` once per loop iteration, and `_stage_records()`
itself iterates all 7 stages, so the full per-stage record map is built 7 times
(O(n^2) in the stage count). Failure scenario: none -- it is a speed nit only;
the tool runs in ~0.1s and the result is correct. A one-line hoist
(`all_recs = _stage_records()` before the loop, then `all_recs[st]` inside)
removes it. Not blocking; not worth a commit on its own.

No other findings. The wave is correct, the worklog's measured numbers all
reproduce, RULE 4 was satisfied for both the ledger (re-broken, re-watched-red,
re-restored, SHA-matched) and the two throws (probed live), and the corpus is
unaffected.
