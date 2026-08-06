# Wave 8 QA - adversarial review of the $ED02 sound driver port
status: DONE
wave: 8   role: qa   started: 2026-08-01

## The task, as I understood it
READER. Do not edit src/, do not commit. Re-run the fast gate. Re-run ONLY the
oracle scenarios wave 8 touches. Read the diff against ROM bytes. Break at least
two of the wave's new checks and see them red. Then list EXPLICITLY what I did
not re-run.

## What I did
(updated as I go)

- [x] gate: node --test games/gradius/tests/   -> 280 pass 0 fail 0 skipped
- [x] gate: node games/gradius/tools/test-all.mjs -> GREEN 7/0/0 SKIPPED
- [x] read commit 54353fc diff
- [x] ROM byte check of every ported routine against dis6502 output
- [x] RE-RECORDED 3 oracle scenarios (pause, idle, long-idle) from the cartridge
      and byte-compared to the implementer's artifacts -> IDENTICAL
- [x] 35 deliberate breaks in a scratchpad COPY of the tree (src/ untouched)

## What I MEASURED

### 1. The gate, run by me

```
$ node --test games/gradius/tests/
# tests 280 / pass 280 / fail 0 / skipped 0 / todo 0

$ node games/gradius/tools/test-all.mjs
  35 scenarios, 11695 of 11695 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  neuter lead1 -> RED 241, seed-x+1 -> RED 116, laginject=450 -> RED 722
  GREEN -- 7 passed, 0 failed, 0 SKIPPED
```

NOTE for the record: "0 SKIPPED" is the STAGE count. Inside the compare stage
6 FIELDS are still skipped (pad2 oamBudget spriteOverflow scanline cpuCycle
splitSpins). That is pre-existing, not wave 8's, and `NOT_PRODUCED` in
porttrace.mjs carries the reason for each.

### 2. The oracle side is reproducible - I re-recorded it

```
$ python games/gradius/tools/oracle/scen.py --only pause idle long-idle
  pause          640 frames  lag=1 [283]
  idle           640 frames  lag=1 [283]
  long-idle     1000 frames  lag=1 [283]
$ cmp <backup> <new>   ->  pause IDENTICAL / idle IDENTICAL / long-idle IDENTICAL
```

So the recorded oracle rows the 11695-frame comparison is judged against really
do come from `Gradius (USA).nes` under Mesen and are deterministic. I did NOT
re-record the other 32.

### 3. ROM byte check

Every routine claimed ported was read out of the cartridge with
`python games/gradius/tools/dis6502.py "Gradius (USA).nes" linear <lo> <hi>` and
compared instruction by instruction against `games/gradius/src/sound.js`:

  $EC1E-$ECB1 (request), $ECB2-$ECC6 ($ECB6 endStream + the 4-byte base table),
  $ECC7-$ED01 (fetchPointer, $ECD2 loop-exit, $ECE5 chain, $ECEB loop),
  $ED02-$ED45 (frame loop + fade epilogue), $ED46-$ED76 (tick + freeze),
  $ED77-$EDBD (dispatcher), $EDBE-$EE34 (dialect A), $EE35-$EE81 (release ramp),
  $EE82-$EF61 (dialect B), $EF62-$EFB7 (period write + advance),
  $8357-$83AD (BGM selector / fade / setBgm / stopAll),
  $9AE0-$9B3D (pause save + resume restore), $97E9 (STA $1C).

I found NO instruction-level divergence in any of them. Details of the fiddly
ones I checked explicitly because they are the ones a re-implementation gets
wrong:

* `$EC26 ROL A x3 / AND #$03` really is `req >> 6` and really is independent of
  the caller's carry (the carry lands in bit 2 and is ANDed away).
* `$EC33 ASL A / CLC / ADC $DF` is `index*3` with no wrap for index <= $3F.
* `$EDED BNE $EDBE` falls THROUGH into the `$10` test with A still holding the
  detune operand when Y wraps to 0 - the port reproduces the fall-through.
* `$EE76 LDA $08,X / SBC #$01` relies on the carry left set by `$EE71`; that
  carry is provably 1 on the only path that reaches it, so `shadow - 1` is right.
* `$EF16 SBC $F2` after the `$EEF0` clamp can only produce -11..+15, so the
  port's `if (v < 0) v = 0` is exactly `BPL / LDA #$00`.
* `$ED2C CMP #$07 / BPL` is the SIGN of ($F3 - 7), and the port spells it that
  way rather than as `>= 7`.
* `$ECD6-$ECE3` (the $FE loop exit) adds `u8(y+3)` to $FA with the carry into
  $FB - the port's `(fa|fb<<8) + u8(y+3)` is equivalent.

I also re-derived, from the cartridge, the load-bearing claim behind the
`$ECB6 STY $02,X` argument:

```
$ Dx ?? FF triples in $EFB8-$FFBD: ['0xf74e']    bytes at F74E: d3 b3 ff d6
```

Exactly one, and it is inside index $30 (pulse 2, $F71C), so the implementer's
reachability argument holds. It is also SUFFICIENT: the only way to enter $ED77
with Y != 0 is $EEA1 (the triangle's `$Dn`), every other arm ends in $ECE5 which
re-enters $ED46 and reloads Y = 0, so any path to $ECB6 with Y != 0 must have
`$Dx ?? $FF` as its last three bytes. The scan is over every byte offset, not
only aligned ones, so arbitrary $FD/$FE entry points are covered.

### 4. HOW I BROKE IT

I am a reader, so nothing in `games/gradius/src` was touched. I copied the tree
to my scratchpad (`.../scratchpad/gq`), copied all 35 oracle artifacts and the
cartridge in, and confirmed the copy reproduces the real numbers:

```
baseline (scratch): 35 scenarios, 11695 of 11695 frames, 0 failures
control break ($EE49 REST test $C0 -> $D0): 136 failures       <- harness works
sound.test.js: 18 tests, 0 fail
```

(The scratch copy runs 278 of the tree's 280 unit tests and 5 touch-control
tests fail there for path reasons unrelated to sound; all break deltas below are
against that constant baseline, and `sound.test.js` was run separately and is
clean at baseline.)

**35 deliberate breaks. 24 went red. ELEVEN went green** - and nine of those
eleven survive the FULL 35-scenario / 11695-frame corpus AND all 280 unit tests.
The implementer reported two such survivors. There are eleven.

RED (the wave is doing these things, and something can see it):

| break | what | caught by |
|---|---|---|
| `advance()` never carries into `$04,X` | $EFAF | 44 fields, 3 scenarios |
| $8346 chrSel index +2 | $8359 | chrBank/chrOffset, 4 scenarios |
| $834F threshold index +6 | $8372 | 74 fields |
| $EE62 release `d >= rate` | $EE5F | 31 fields, all 8 |
| the freeze arm's `$400C` write dropped | $ED70 | **pause only**, apuWrites/apuDigest only |
| release RATE $0D/$05 swapped | $EEFC | **enemy-waves only, w_00D0@1855** |
| `STY $0C,X` dropped from endStream | $ECBD | **terrain-death only, w_00BC@618** |
| STOP record no longer forces `$DF=0` | $EC76 | 144 fields + 1 unit test |
| `$4002` written only when `$4003` was | $EF9E | apuWrites/apuDigest, all 8 |
| `STA $E1` dropped | $EC3D | w_00E1, 4 scenarios |
| `STA $F6` dropped | $EC58 | w_00F6, 5 scenarios |
| `$F1` counts to $2F | $ED22 | **unit test ONLY**, corpus 0 |
| RELOFF 6 -> 7 on the fade path | $EEF8 | **enemy-waves only, @1855** |
| the `$FE` overshoot arm stores `a` | $ECF7 | **enemy-waves only, w_00D8@1848** |
| `STY $06,X` dropped on a new sound | $EC66 | w_00B6, 2 scenarios |
| pause exemption $3B -> $3C | $ED5A | pause, 10 fields + unit test |
| request-time silencing $30 on the triangle | $EC85 | **apuDigest ONLY**, 3 scenarios |
| dialect A duration from a literal 1 | $EDD9 | 38 fields |
| release-ramp REST test $C0 -> $D0 | $EE4F | 28 fields, all 8 |
| a triangle REST writes $30 | $EF3B | **apuDigest ONLY**, 5 scenarios |
| audio counters cleared below the lock | nmi.js | **unit test ONLY** |
| apuDigest multiplier 31 -> 33 | sound.js | 35 fields |
| `$ED0A` owner-0 gate removed | $ED0C | 869 fields + 4 unit tests |
| `$EE02 AND #$10` -> `#$08` / `#$40` | $EE02 | 10 fields |

GREEN - SURVIVED THE FULL CORPUS AND ALL 280 UNIT TESTS:

| # | break | ROM | why nothing sees it |
|---|---|---|---|
| 1 | `$833F[stage]` read at +1 ($96 -> $59) | $836F | the area-theme code is loaded on every $3E==0 frame and NEVER used with its own value; both live paths overwrite X with $93/$A5 |
| 2 | `res.stage.bossPage + 1` | $8383/$8386 | $3F never gets near page $0C in any window |
| 3 | `$838E CMP #$82` -> `#$92` | $838E | $1B is $80 on every play frame; both gates pass |
| 4 | `$EEF0 CMP #$0B` clamp -> `$0C` | $EEEE | $F2 never leaves 0 in the corpus, and the unit test's `assert.ok($F2 >= 0x0B)` is satisfied by a clamp of $0C |
| 5 | `$ED2E CMP #$07` -> `#$08` | $ED2C | $F3 is 0 or 15, never 7; the unit test only asserts the triangle eventually dies, which a threshold of 8 also does |
| 6 | `$EE0E CMP #$F8` -> `#$F9` | $EE0E | dialect A's `$F8 vv` volume prefix is executed ZERO times in 11695 frames |
| 7 | `$EF64 BCS` -> `!== $D2` (noise gets the detune add) | $EF62 | the noise channel enters dialect A exactly ONCE in the whole 8-scenario subset and its `$0C,X` is 0 |
| 8 | `$EE86` freeze passes 0 instead of Y | $ED60 | `freezeAndSilence` is entered 100 times, ALL with y = 0 |
| 9 | `$EE02 AND #$10` -> `#$20` | $EE02 | every `$4000` shadow the corpus produces is `$3x`, so bits 4 and 5 are always equal. `#$08` and `#$40` both go red, so it is specifically the 4-vs-5 confusion that is invisible |
| + | `$8346[stage]` read at +1 | $8359 | $8346[0] == $8346[1] == 0; not a real semantic change (+2 IS red) |
| + | `$ED5E` first-path freeze y | $ED60 | already 0 in the source; not a real change |

### 5. PATH COVERAGE, measured

I instrumented the scratch copy's `sound.js` with counters and ran the 8-scenario
subset (3822 compared frames). Totals:

```
dialectB 1005 ($b0 209 / $c1 189 / $d2 607)   dialectA 229 ($b0 139/$c1 58/$d2 31/$e3 1)
cmd_FD 5   cmd_FE 86   cmd_FF 16   endStream 14 (ALL y=0)   freeze 100 (ALL y=0)
releaseRamp 8578  octave_shift 3036  retrigger_skip 464  tri_Dn_redispatch 49
dB_Dn 75  dB_En 319   dA_2n 16  dA_10_sweep 5  dA_11_detune 1  dA_constvol 194
loop_bmi 70   loop_sbc 1        fade_branch 2   fade_epilogue 15
requests: $01 x27  $06 x11  $3b x1  $7d x2  $93 x2  $f7 x1  $fc x5   (49 total)
NEVER REACHED: dA_F8 (the $F8 volume prefix), fade_kill_triangle ($ED32),
               endStream with y != 0, freeze with y != 0, octave > 4
```

### 6. TWO STALE FACTS THE WAVE'S OWN CORPUS FALSIFIES

**(a) "the $F0 fade is only reachable by intervention" is FALSE.** From the
CARTRIDGE's own rows in `out/scen/enemy-waves.json` (w_00F0/F1/F2/F3):

```
f1849  (0,0,0,0)
f1850  (1,0,0,0)     <- $8398 INC $F0 fires IN PLAY
f1855  (1,5,0,15)    <- $EEE6's fade branch runs; $F3 := 15
...    $F1 reaches 15 by f1865 (the window ends; $30 is never reached)
```

So `$F0` IS set by the game, on the frame the camera crosses `$3F + 1 ==
$834F[$19]` or `$3F == $9A3D[$19]` with `$3E == 0`. This contradicts, verbatim:
`src/sound.js` line ~421 ("MEASURED by intervention only ($F0 was 0 in all
eleven scripted runs)"), `src/sound.js` line ~999 ("what game situation reaches
it is not established"), `tests/sound.test.js` line 7 ("none reaches the $F0
fade"), and the impl worklog's open-items list. Only 16 frames of it are
reached and the `$F1 == $30` step, the `$F2` clamp and the triangle kill are
still unreached - but "unreached" and "unreachable" are different claims and the
file makes the wrong one.

**(b) "no measured stream reaches it" on `$ECF7` is FALSE.** Break V (`stored =
a` on the overshoot arm) goes RED against the cartridge at `enemy-waves
w_00D8@1848`, and my instrumentation counts `loop_sbc` = 1. The `$ECF5 BMI /
$ECF7 SEC SBC #$01` arm IS taken, once, by a real stream.

### 7. CHECKS THAT CANNOT FAIL (docs/knowledge/03)

* `scen.py` build(): `if r["audioChannels"] < 0: raise` - objloop.lua's counter
  is a non-negative Lua integer, so this can never fire. Its own comment says
  the bound worth asserting is "a frame with no owned channel is 0"; it does not
  assert that. Shape (a).
* `tests/sound.test.js` "the work counters are per-FRAME": `assert.ok(
  s.work.apuWrites < 1000)` is vacuous. Shape (a).
* `tests/sound.test.js` fade test: `assert.ok(rd(t, 0xF2) >= 0x0B)` is one-sided
  and passes for a clamp of `$0C` (measured, break P). Shape (d)-adjacent - the
  test does not pin the ROM's constant.
* `tests/sound.test.js` fade test: the triangle-kill assertion passes for a
  `$F3 < 8` threshold as well as `$F3 < 7` (measured, break R).
* `tests/sound.test.js` fade test line 328:
  `steps.push(f - (steps.length ? 0 : 0))` - a dead ternary, both arms 0.
* `tests/sound.test.js` `$EC95` test: the comment block describes `$7D` (records
  `$3D $3E`) but the call is `soundRequest(s, 0x1D)`. The test is still valid
  ($1D is a pulse-2 record), the prose is not.

## What I RULED OUT

* **No instruction-level divergence.** I read every ported routine out of the
  cartridge and compared it against the port line by line (section 3). I did not
  find one wrong branch, one wrong constant, one wrong register or one missing
  store. The eleven survivors above are COVERAGE holes, not port bugs - the port
  is right; nothing checks that it is right.
* **The oracle side is not fabricated.** I re-recorded `pause`, `idle` and
  `long-idle` from the cartridge myself and got byte-identical artifacts.
* **The four new work counters are load-bearing.** `apuDigest` alone catches the
  triangle-REST value ($EF3B) and the request-time silencing value ($EC85);
  nothing in the RAM layer sees either. The digest multiplier itself is pinned
  (31 -> 33 is 35 failures).
* **The nmi.js counter-clear placement is defended** - moving the four clears
  below the lock bail reddens `tests/sound.test.js` (fail=1). The implementer's
  reviewer item #4 stands.
* **`bindSoundRom` as a module-level binding is safe on the frame order I could
  reach**: `soundDriver()` binds at $80A1 before any of the nine request sites,
  `assets.js soundTables()` binds at load, and the unbound path throws with the
  fix named. I did not find a path that requests a sound before either.

## What I could not do, and why

* **I did not re-record the other 32 oracle scenarios.** I re-ran the port
  against all 35 recorded artifacts (0 failures), and I re-recorded 3 of them
  from the cartridge and got identical bytes. A regression in the other 32
  would look like: the ROM side of a scenario silently changing (it cannot
  without the cartridge or Mesen changing) - this is low risk and is exactly
  what the final full-corpus pass covers.
* **I did not reach the $F1 == $30 fade step, the $F2 clamp, the triangle kill,
  the $F8 dialect-A prefix, an octave > 4, or $ECB6/$ED5E with Y != 0 in
  PLAY.** Nothing in the corpus does. Four of those are covered by unit tests;
  three are not covered by anything (see findings).
* **I did not construct the two-channels-in-a-$FD-sub-phrase case** that the
  recon and the implementer both leave open. `cmd_FD` fires 5 times in 3822
  frames and never twice in the same tick, so I could not reach it either.
  Status unchanged: OPEN.
* **I did not run `verify_assets.py --self-test` or `snddata.py --selfcheck` by
  hand** beyond what `test-all.mjs` runs (both PASS there).
* **I did not audit the exporter** (`export_assets.py`'s new sound family) byte
  by byte; I spot-checked $ECB2-$ECB5, $EFB8 (pitch), $EFCD (records), $833F /
  $8346 / $834F / $9A3D and the $F74E triple against the .nes directly and all
  matched.

## If someone picks this up cold

The break harness is at
`%TEMP%/claude/C--programmieren-batman/<session>/scratchpad/gq` - a full copy of
`games/gradius` plus the ROM plus all 35 oracle artifacts, with
`sound.js.pristine` / `nmi.js.pristine` and `brk.py`. `python runA.py` etc.
re-run each break batch. That directory is disposable; the method is:

```python
from brk import *
restore(); patch(SRC, "<exact source line>", "<broken line>"); report("tag")
```

`report()` runs sound.test.js, the whole unit suite and the 8-scenario compare;
swap in `compare.mjs` with no `--only` for the full 35.

status: DONE
