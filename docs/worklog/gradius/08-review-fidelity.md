# Wave 8 review — Sound: the $ED02 driver, state-exact first (FIDELITY LENS)
status: DONE
wave: 8   role: review   started: 2026-08-01
verdict: SOUND — no behavioural defect found; three unfalsifiable lines reported

Reviewing commit `54353fc` "gradius wave 8: the $ED02 driver runs, and four bytes
of zero page that were JS variables".

I am a READER. No edits to `games/gradius/src/` except temporary deliberate
breaks that are restored and verified byte-identical (sha256 before/after).

## The task, as I understood it
NARROWED remit: fast gate + only the oracle scenarios this wave touches + read
the diff against ROM bytes + break >= 2 new checks. Then list explicitly what I
did NOT re-run.

## What I did
(running log below)

## What I MEASURED

### 1. The gate, run by me
```
$ node --test games/gradius/tests/
# tests 280  # pass 280  # fail 0  # cancelled 0  # skipped 0  # todo 0
# duration_ms 4548.7254

$ node games/gradius/tools/test-all.mjs
  35 scenarios, 11695 of 11695 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  neuter lead1          -> RED, 241 TIER 1 failures
  neuter seed-x+1       -> RED, 116 TIER 1 failures
  neuter laginject=450  -> RED, 722 TIER 1 failures
  GREEN -- 7 passed, 0 failed, 0 SKIPPED
```
The 6 SKIPPED *fields* are `NOT_PRODUCED` in porttrace.mjs and pre-date this
wave (unchanged by the diff). The stage count is 7 with 0 skipped stages.

### 2. The oracle side is genuine, not fabricated
The implementer's artifacts could in principle have been hand-written. I
re-recorded five of them from the cartridge under Mesen and diffed by sha256:

```
$ python games/gradius/tools/oracle/scen.py --only idle pause
$ python games/gradius/tools/oracle/scen.py --only long-idle autofire-normal capsule-die
idle             ba66940735e12972 -> ba66940735e12972 SAME
pause            05ef8c159019c960 -> 05ef8c159019c960 SAME
long-idle        6dd39048356b7ac8 -> 6dd39048356b7ac8 SAME
autofire-normal  f085db74d95b00a6 -> f085db74d95b00a6 SAME
capsule-die      6f14e66e5a081f0f -> 6f14e66e5a081f0f SAME
```
616 watched addresses reported by scen.py, matching the claim.

### 3. The new watch range is not a constant-field watch
`long-idle.json`, 1000 frames: 51 of the 77 new `w_00Bx..w_00Fx` addresses take
more than one value; `w_00C1` and `w_00CE` take 105 distinct values each.
`audioChannels` takes {0,2,3,4}; `audioTicks` is {1} on every sampled frame (by
construction — scen.py now raises if it is not); `apuWrites` {0..10,16};
`apuDigest` 77 distinct values.

### 4. The code against the cartridge, instruction by instruction
Disassembled from `Gradius (USA).nes` (PRG = file offset 16, CPU $8000-$FFFF)
and walked against `src/sound.js`:

* `$EC1E-$ECB1` (request), `$ECB2-$ECFF` (bases/$ECB6/$ECC7/$ECD2/$ECE5/$ECEB),
  `$ED02-$ED44` (frame loop + fade epilogue), `$ED46-$ED76` (channel + freeze),
  `$ED77-$EDBD` (dispatcher), `$EDBE-$EE34` (dialect A), `$EE35-$EE81` (release
  ramp), `$EE82-$EF61` (dialect B), `$EF62-$EFA5` (period + retrigger guard),
  `$EFA6-$EFB7` (advance), `$8357-$83AD`, `$9AF0-$9AFC`, `$9B27-$9B3B`,
  `$97E9`, `$80A1`, `$9A5B`. Every line the port cites is at the address it
  cites and does what the port does. Verified in particular:
  - `ROL A x3 / AND #$03` really is `(req >> 6) & 3` and really is
    carry-independent (the incoming carry lands in bit 2 and is masked off).
  - `$EC91 LDA $DF` is not reloaded per record. See §5.
  - `$EED1 ADC $0A,X` is inside the loop and the `CLC` is at `$EED0`, OUTSIDE
    it, so the carry really does chain across adds; the port reproduces that.
  - `$EE76 LDA $08,X / E9 01 SBC #$01` has **no** `SEC`; the carry is inherited
    from `$EE71` and is provably set on the only path that reaches it. The
    port's plain `-1` is correct.
  - `$EF62` is entered two ways — `JSR` from `$EE2F` and **fall-through** from
    `$EF60`'s not-taken `BNE`. The port calls `writePeriod()` on both.
  - `$ECD2`'s arm falls through into `$ECE5`; `$EC93` falls through into
    `$EC95`; `$EE1F` falls through into `$EE22`; `$EED7 BEQ $EEDB` is always
    taken; `$8357` falls through into `$9A5E`. All five handled.
  - `$EDED BNE $EDBE` — the Y-wrap fall-through with A still holding the detune
    operand — is reproduced (`c = $0C,X`), not turned into a `continue`.

Independent ROM scans I ran rather than took on trust:
```
absolute accesses to $4000-$401F in the whole 32 KB PRG:
  8087 4014, 81AD 4015, 81B2 4017, 81C1/81C5/81CA 4016, 81D5 4017,
  9B2B 4000, 9B30 4008,
  EC8B EC8E ECC3 ED36 ED39 ED65 ED68 ED6B ED70 EDD1 EDF9 EE1F EE7E
  EF2C EF41 EF9B EFA2
```
i.e. every $4000-$400F writer is inside the driver plus the two pause-resume
stores, all of them ported, and `$4010-$4013` is never written. That is the
claim `apuWrites`/`apuDigest` rest on, and it holds.

```
$Dx ?? $FF triples in $EFB8-$FFBF:  ['F74E']   (D3 B3 FF)
$FFC0-$FFF9:  all $FF;  $FFFA-$FFFF: 6A 80 10 80 BD 80
every record 1..$3F points inside $EFB8-$FFF9; record 0 points at $038A (RAM)
records $3C-$3F all point at $F08F, first byte $00
records $13/$14/$15 -> offsets 00/04/08 = pulse1/pulse2/triangle
```

### 5. The wave's headline correction, re-measured from the cartridge
Owner bytes over `long-idle.json` (my own re-recording):
```
frame    ($B2, $C3, $D4, $E5)
    0    (0, 0, 0, 0)
  200    (16, 16, 16, 0)     the attract demo's $90  -> index $10 on three
  250    (0, 0, 0, 0)
  310    (19, 19, 19, 0)     the stage's $93         -> index $13 on three
  823    (0, 19, 19, 0)
```
So the records are consecutive but the OWNER BYTES ARE NOT — all three read
$13, not $13/$14/$15. The implementer's correction to the plan is right, and
310..822 inclusive is 513 frames, which is the number `snddata.py --selfcheck`
independently derives as 512 ticks + `$EC63`'s one setup frame.

### 6. Deliberate breaks — eight, each run and restored
`sha256(src/sound.js)` before and after every break:
`27df2a8f8400f64c432c5bd90f303d85ea1d3ff9d15d5f3ad440aacba169dd1a`.
Subset used for the corpus column: idle, pause, long-idle, autofire-normal,
capsule-die (2235 compared frames; baseline 0 failures).

| # | break | unit tests | corpus subset |
|---|---|---|---|
| 1 | `$EF85` retrigger guard never suppresses the `$4003` write | pass | **RED** 5/5, `apuWrites`+`apuDigest` first at f407 |
| 2 | `$ECB6` frees the owner to a literal 0 instead of Y | **RED** (1) | GREEN |
| 3 | `$EF56` octave loop clamps (`yo >= 4`) instead of wrapping | **RED** (1) | GREEN |
| 4 | `snddata.py` decodes `base << exp` instead of `base*(exp+1)` | n/a | **RED**, gate stage FAIL, exit 1 |
| 5 | `$EEFC` release rate always `$05` (never the `$C3 == $13` `$0D`) | pass | **GREEN — NOTHING CATCHES IT** |
| 6 | `$EEF8` fade `RELOFF := 0` instead of 6 | pass | **GREEN — NOTHING CATCHES IT** |
| 7 | `$EEEE` `$F2` clamp `$0B` -> `$0A` | pass | **GREEN — NOTHING CATCHES IT** |
| 8 | `$EE62` release-ramp `d <= rate` inverted to `d >= rate` | pass | RED, 8 failures on idle+long-idle |
| 9 | `$ED70` freeze arm writes `$400C = 0` instead of `$30` | pass | RED, 1 failure (pause) |

Breaks 1-4 confirm the implementer's own results (with one correction, below).
**Breaks 5, 6 and 7 are new: a THIRD unfalsifiable region the wave did not
find.** Details in the findings section.

Correction to the implementer's B7 note: it says the retrigger guard is "caught
by `apuDigest` alone". It is caught by `apuWrites` as well — an unsuppressed
write changes the per-frame count, not only the digest. Both fields are new
this wave, so the conclusion (the register side had to be compared) stands.

## What I could not do, and why

Deliberately, under the narrowed remit. **Each of these is a scheduled check for
the final full-corpus pass, not a covered area.**

1. **I did not re-record 30 of the 35 oracle scenarios.** I re-recorded idle,
   pause, long-idle, autofire-normal and capsule-die. I DID run `compare.mjs`
   over all 35 against the implementer's recordings (0 failures, 11695 frames),
   so the port side is fully compared; what is unverified is whether the other
   30 recordings came off the cartridge. Given five out of five reproduced
   byte-identically, the risk is low, but a regression there would look like a
   scenario that is green against a doctored artifact — invisible until a
   re-record.
2. **I did not run `rendergate.py` (the pixel-exact renderer).** Wave 8 touches
   the renderer only through `state.ppu.chrSel`, which `setBgm` now loads from
   `$8346[$19]`; `$8346[0] = 0` (verified against the ROM), and `w_002D`
   compares clean at 0 on all 35 scenarios, so the renderer's input is
   unchanged. A regression would look like a wrong CHR bank on stage 1 — which
   `w_002D` would already have caught, but only for stage 0.
3. **I did not exercise stage index != 0 at all.** `setBgm` indexes three new
   tables with `$19`. `$833F[1..6]` = 59 5B 5D 5F 61 63, `$8346[1..6]` = 00 02
   00 02 01 03, `$834F[1..6]` = 04 04 04 04 04 02. Nothing in this corpus loads
   another stage, so the six non-zero rows of all three tables and the
   `res.stage.bossPage` comparison at `$8383` are exported, ported, and
   completely unexercised. A regression looks like the wrong theme, or the
   wrong CHR bank in `$2D`, on stage 2+. (Not a crash: no `$833F` entry has low
   6 bits 0, so the `$EC42` throw cannot fire from that table on any stage.)
4. **I did not reach the `$838E` fade path in the app.** `$F0` is set only by
   `$8398`, which needs `$3E == 0` AND `$3F + 1 == $834F[$19]` (page 3 for
   stage 1) AND `$1B < $82`. No scenario gets past camera page 0. The fade
   epilogue is exercised by unit test only, by poking `$F0`.
5. **I did not close the static-decode desync the exporter is BLOCKED on**
   (index `$23`/`$FC66` walking to `$01E2`). It does not affect the port, which
   executes `$ED77`; it means the exported block's end is anchored on the CPU
   vectors, not on the data.
6. **I did not test the app in a browser** (`loadResources` fetching
   `assets/sound/tables.json`). The unit path uses `helpers.js`, which builds
   the same reader from the same file.
7. **I did not review waves 1-7's arms**, only the lines this diff touched in
   them (each `state.sfx.push(id)` -> `soundRequest(state, id)`).

## If someone picks this up cold

* The port is a faithful transcription. I found no behavioural defect.
* The one thing to close is the **pulse-2 fade arm** (`$EEEE-$EF08`): three
  independent breaks in it were invisible to both layers. Anything reached only
  while `$F0 != 0` is currently unguarded except for the two facts the
  `$ED1A` unit test asserts (the 48-frame step and the triangle kill).
* `bindSoundRom` is module-global mutable state re-bound on every `soundDriver`
  call. Two `res` objects in one process would race. Argued in the file; not a
  defect today because every path binds the same tables.
* Index staged by another agent (18 `games/ddpdoj/*` paths) was already there
  when I started and I did not touch it. I committed nothing.
