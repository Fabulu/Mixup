# Wave 8 test hardening -- redden what the corpus cannot see (the $ED02 sound driver)
status: DONE
wave: 8   role: test   started: 2026-07-29

## The task, as I understood it

Wave 8 ported the $EC1E/$ED02 sound driver (commit 54353fc). The implementer
found 2 deliberate breaks that survive the whole gate; the reviewer found 3
more; QA found 9 more. My job is to WRITE TESTS ONLY -- files under
games/gradius/tests/, plus scenarios.json entries and the harness support for
them -- and every test I add must be SEEN RED against a named mutation of
games/gradius/src/sound.js and green with the file restored byte-identical.

I do not change src/ behaviour. A test that cannot pass is a knownFail with the
measurement, not a fixed port.

## Method

Every mutation is applied to a COPY of the tree under the session scratchpad
(`w8t/games/gradius`, with `tools/oracle/out/*` junctioned to the real
artifacts so the 35 recorded scenarios are the real ones). The working tree's
src/ is never touched.

    sha256(games/gradius/src/sound.js)
      27df2a8f8400f64c432c5bd90f303d85ea1d3ff9d15d5f3ad440aacba169dd1a
    -- asserted by w8t/brk.py after EVERY restore; a mismatch aborts the run.

`w8t/brk.py` + `w8t/muts.json`: for each mutation, patch (anchor count asserted
== 1), run `node --test --test-reporter=tap` over the two sound test files and
`node games/gradius/tools/oracle/compare.mjs` over ALL 35 scenarios, restore,
re-hash.

## What I did

1. Measured which arms the corpus actually executes, by patching a COPY of
   sound.js with arm counters.
2. Wrote `games/gradius/tests/sound-unwitnessed.test.js` -- 12 tests, one per
   unfalsifiable site.
3. Removed three checks from `tests/sound.test.js` that could not fail, and
   corrected two stale statements in its header.
4. Added the `fade-music` scenario + `$00F0` to porttrace.mjs's POKEABLE, which
   makes the fade arm CARTRIDGE-comparable for the first time.
5. Ran 16 mutations, twice (once with the corpus as it was, once with
   fade-music in it).

## What I MEASURED

### A. Which arms the corpus reaches (arm counters, 8 scenarios, 3,822 frames)

    node games/gradius/tools/oracle/compare.mjs --only idle,long-idle,pause,
      enemy-waves,terrain-death,intro-boot,intro-respawn,autofire-normal
    -> 8 scenarios, 3822 of 3822 frames compared, 0 failures
    COUNTERS {"octle4":745,"loop_bmi":70,"freeze_y0":100,
              "dA_volTest":194,"loop_sbc":1,"fadeArm":2}

  * `dA_F8` is ABSENT: dialect A's `$F8 vv` volume prefix runs ZERO times. The
    test reaches the byte 194 times and it is never $F8.
  * `clampBit` is ABSENT: the pulse-2 fade arm runs twice and the $EEF0 clamp
    never bites -- so its constant was free.
  * `freeze_yN` is ABSENT: all 100 freezes have Y = 0.
  * `octGT4` is ABSENT: no stream reaches an octave above 4 (still open, as the
    recon left it).
  * `loop_sbc` = 1: the $ECF7 overshoot arm IS reached, once, in enemy-waves.
    The port's own comment said "no measured stream reaches it" -- WRONG.

### B. The fade is reached IN PLAY. The port and this file both said otherwise.

From the cartridge's own recorded rows, out/scen/enemy-waves.json, no poke:

    f1849 (0,0,0,0)   f1850 (1,0,0,0)   f1855 (1,5,0,15)   f1865 (1,15,0,15)

$8398 INC $F0 fires at game frame 1850. The window then ENDS -- the ship dies at
1866 and compare.mjs truncates -- so the corpus sees 16 frames of a ~530-frame
fade. "Unreached" and "unreachable" are different claims and only the first was
ever true.

### C. THE MUTATION TABLE

16 mutations. Every one RED on the intended new test; each restored and the file
re-hashed. `unit` is `node --test games/gradius/tests/sound.test.js
games/gradius/tests/sound-unwitnessed.test.js` (30 tests, baseline 0 fail);
`corpus` is compare.mjs over ALL 35 scenarios (11,695 frames, baseline 0
failures).

| # | site | mutation | unit | corpus (35 scen) | test that went RED |
|---|------|----------|------|------------------|--------------------|
| M1 | $836F | `$833F[stage]` -> `[stage+1]` | 1 | **0** | area theme is $833F[$19] |
| M2 | $8383 | `bossPage` -> `bossPage+1` | 2 | **0** | boss page / $1B gate |
| M3 | $8390 | `CMP #$82` -> `#$92` | 1 | **0** | fade armed only below $82 |
| M4a | $EEF0 | clamp `$0B` -> `$0C` | 1 | **0** | $F2 is clamped at $0B |
| M4b | $EEF0 | clamp `$0B` -> `$0A` | 1 | **0** | $F2 is clamped at $0B |
| M5 | $ED2C | kill threshold 7 -> 8 | 1 | **0** | triangle dies at 0..6 |
| M6a | $EEF8 | `RELOFF := 6` -> 0 | 1 | 2 (enemy-waves w_00CE/w_00CF@1855) | release offset / rate |
| M6b | $EEFC | RELRATE always $05 | 1 | 1 (enemy-waves w_00D0@1855) | release offset / rate |
| M6c | $EEFC | RELRATE always $0D | 1 | **0** | release offset / rate |
| M7 | $EE0E | `CMP #$F8` -> `#$F9` | 2 | **0** | the volume prefix |
| M8a | $EE02 | `AND #$10` -> `#$20` | 1 | **0** | it is bit 4, not bit 5 |
| M8b | $EE02 | `AND #$10` -> `#$08` | 2 | 57 (15 scenarios, first pause@466) | it is bit 4, not bit 3 |
| M9 | $EF64 | noise gets the detune | 1 | **0** | noise gets no detune |
| M10 | $ECF7 | overshoot arm removed | 1 | 1 (enemy-waves w_00D8@1848) | loop counter steps back |
| M11 | $EE82 | pause test moved below $Dn | 1 | **0** | pause tested first |
| M12 | nmi.js | `apuWrites` never reset | 1 | 35 (every scenario) | counters reset per frame |

Eleven of the sixteen are invisible to 11,695 compared frames. Five are caught,
three of them by ONE FIELD OF ONE SCENARIO on ONE FRAME.

### D. The five checks I deleted or replaced, because they could not fail

  * `assert.ok(s.work.apuWrites < 1000)` (sound.test.js) -- true of a running
    total for fifty frames and of anything at all for one frame. Replaced by
    "the four audio counters are RESET each frame", which runs the same frame
    twice with the counters poisoned in between and is RED on M12.
  * `assert.ok(rd(t, 0xF2) >= 0x0B, 'the fade runs its full range')` -- one
    sided; satisfied by a clamp of $0C (M4a passes it). Replaced by the
    oscillation test, which pins the constant from both sides.
  * `steps.push(f - (steps.length ? 0 : 0))` -- a ternary with two identical
    arms. Now `steps.push(f)`.
  * The `$EC95` test's comment described request $7D while the code requested
    $1D. The code was right (record $1D is a pulse-2 stream at $F77E,
    `snddata.py --table`); the comment now says so.
  * The file header's "none reaches the $F0 fade (measured 0 in eleven scripted
    runs)" -- falsified by the corpus's own enemy-waves artifact (B above).

### E. The new scenario: `fade-music`

`tail: "600:"`, `poke: "00F0=1@+0"` -- long-idle's window with the fade latch
armed for one frame, and `$00F0` added to porttrace.mjs's POKEABLE with the
enemy-waves measurement as its admission (the cartridge produces this value
itself; no script survives long enough to reach it twice).

    python games/gradius/tools/oracle/scen.py --only fade-music
      fade-music  1000 frames  lag=1 [283]  slotsVisited 32..32
                  poke 00F0=1@400-400

THE CARTRIDGE'S OWN ROWS (out/scen/fade-music.json, w_00F0..w_00F3 and w_00D4):

    f401  (1,1,0,0)      the latch, one frame after the poke, as designed
    f448  (1,0,1,15)     $F1 hit $30 -> $F2 = 1. Then 496 544 592 640 688 736
                         784 832 880 928 976 -- every 48 frames, exactly
    f880  ... $D4 = 0    THE TRIANGLE IS KILLED ($F3 had fallen to 6)
    f976  (1,0,12,4)     $F2 INCed past the clamp
    f991  (1,15,11,4)    AND PULLED BACK TO $0B BY $EEF4

    node games/gradius/tools/oracle/compare.mjs --only fade-music,long-idle
      2 scenarios, 1198 of 1198 frames compared, 0 failures

So the port's fade -- the 48-frame ladder, the triangle kill AND the $0B clamp
-- is now compared against the cartridge instead of against itself.

### F. What the new scenario CATCHES (the same 16 mutations, `--only fade-music`)

| # | mutation | fade-music | first divergence |
|---|----------|-----------|------------------|
| M4a | clamp $0B -> $0C | **5 failures** | w_00F2@991 w_00F3@991 w_00C9@991 apuDigest@991 apuWrites@995 |
| M4b | clamp $0B -> $0A | **5 failures** | w_00F2@935 w_00F3@935 w_00C9@935 apuDigest@935 apuWrites@940 |
| M5 | kill threshold 7 -> 8 | **12 failures** | apuWrites@832 apuDigest@832 w_00D4@832 w_00D2@833 ... |
| M6a | RELOFF 6 -> 0 | 5 | w_00CE@415 w_00CF@415 (enemy-waves also caught it, at 1855) |
| M6b | RELRATE always $05 | 4 | w_00D0@415 |
| M12 | apuWrites not reset | 1 | apuWrites@402 |
| M1 M2 M3 M6c M7 M8a M8b M9 M10 M11 | -- | 0 | not what this scenario is for |

THREE mutations that NOTHING in the repo could redden are now red against the
cartridge itself. M6c ($EEFC's rate as a constant $0D) is still invisible to
every scenario, because pulse 2 is owned by $13 on every frame of every window
in which the fade is armed; only the unit test reaches the other arm.

### G. Four notes in src/sound.js were FALSE and are corrected in this commit

COMMENTS ONLY -- `git diff -U0 games/gradius/src/sound.js` has no non-comment
line, and the unit suite and the corpus are byte-identical across the change.
Repo rule 6, and every one of these is a note the next agent would have acted on:

  1. `loopCommand`: "Reproduced; no measured stream reaches it" -- a real stream
     does (A above, loop_sbc = 1).
  2. `soundDriver`'s epilogue: "MEASURED by intervention only ($F0 was 0 in all
     eleven scripted runs)" -- the cartridge arms it in play (B above).
  3. `fadeStep`: "what game situation reaches it is not established" -- it is:
     $3E == 0, $3F + 1 == $834F[$19], $1B < $82.
  4. `dialectB`'s $EEFC comment: "A cross-channel read, and the only one in the
     driver". IT IS NOT CROSS-CHANNEL. The arm only runs with X = $C1 ($EEEA
     four instructions above), so `LDA $C3` is `$02,X` -- pulse 2's own owner
     byte. This one matters practically: I needed to know what to vary to reach
     the $05 arm, and the answer is "give pulse 2 to a different sound".

### H. THE GATE

    node --test games/gradius/tests/
      # tests 292  # pass 292  # fail 0  # skipped 0  # todo 0

    node games/gradius/tools/test-all.mjs
      36 scenarios, 12294 of 12294 frames compared (0 truncated: none),
      0 failures, 0 clamps uncovered, 0 death-coverage failures,
      0 stale annotations, 6 fields SKIPPED (pad2 oamBudget spriteOverflow
      scanline cpuCycle splitSpins)
      neuter lead1 -> RED 241; seed-x+1 -> RED 116; laginject=450 -> RED 722
      GREEN -- 7 passed, 0 failed, 0 SKIPPED

    python games/gradius/tools/oracle/scen.py --only fade-music
      (the ONE artifact this commit needs re-recorded; the other 35 are
       untouched and were not re-recorded by me)

The 6 SKIPPED are FIELDS, not stages -- porttrace.mjs NOT_PRODUCED entries,
pre-existing, unchanged by this diff. The STAGE skip count is 0.

## What I could not do, and why

  * **The other 35 oracle artifacts were NOT re-recorded.** I recorded
    `fade-music` from the cartridge and compared the port against all 36. A
    regression here looks like a doctored artifact, invisible until re-recorded.
  * **M6c stays unfalsifiable by the corpus** ($EEFC's rate forced to $0D). No
    window exists in which the fade is armed AND pulse 2 is owned by something
    other than $13; constructing one needs a scenario that plays a second
    pulse-2 sound over the BGM while the fade runs, which the priority test at
    $EC4B rejects for every index below $13. Only the unit test covers it.
  * **The octave loop above 4 ($EF56) is STILL OPEN.** Arm counters:
    octGT4 = 0 over 3,822 frames. Whether any real stream carries an octave
    above 4 is 00-recon-sound.md's own open item, it is unresolved, and the one
    unit test that reaches it does so by poking $10,X.
  * **`$ECB6` with Y != 0** is covered by exactly one constructed unit test
    (wave 8's) and by nothing else; my M11 pins the ORDER that makes the
    sibling case ($ED5E's Y) provably dead, but not $ECB6's own.
  * **No audio is synthesised** and nothing I added changes that. The register
    side is compared as address/value/order only.
  * **I did not run rendergate.py** (the pixel gate; not part of test-all) and
    did not run tools/build-dist.mjs or its ROM-leak guard. This commit adds no
    asset and touches neither.
  * **`$00FC-$00FF` are still outside the watch list**, as QA reported. Not
    changed here.

## If someone picks this up cold

  * The mutation harness is `w8t/brk.py` + `w8t/muts.json` (all 16 mutations as
    exact anchor/replacement pairs) and `w8t/brk2.py` (the same against one
    scenario). It lives in the session scratchpad and is disposable: rebuild it
    by copying games/gradius somewhere, junctioning tools/oracle/out, and
    keeping a `sound.js.pristine` next to it. EVERY restore asserts the sha256.
  * `fade-music` needs `python games/gradius/tools/oracle/scen.py --only
    fade-music` in any tree that has the ROM; without the artifact compare.mjs
    will say so.
  * If you are about to "simplify" anything in the pulse-2 fade arm, the three
    constants in it are pinned in two places now and both of them are cheap to
    run. Do not delete the `fade-music` scenario to make a red run green.
