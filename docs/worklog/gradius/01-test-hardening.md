# Wave 1 test hardening: pin the review/QA findings, and make every gate seen red
status: DONE
wave: 1   role: test   started: 2026-07-29

## The task, as I understood it

I am the TEST WRITER for wave 1. I write `games/gradius/tests/` and oracle
harness support ONLY; I never edit `games/gradius/src/`. Where a test cannot
pass because the port is wrong, it becomes an ANNOTATED knownFail with the
cartridge bytes behind it, said loudly -- not a test that blesses the port.

Inputs: the implementer's report on `15f88dc`, the reviewer's verdict
(defects-found, 6 findings) and QA's (defects-found, 12 findings, one BLOCKING).

## What I MEASURED

### 0. Every ROM fact re-dumped by me, not quoted

`python` on `Gradius (USA).nes`, PRG at file offset 16, bank 0 at $8000:

```
$9650  a9 0c 85 13 a9 00 85 5d 85 5b 85 5c a5 15 f0 03 4c 8c 9a a5 19 c9 04 d0 3c
$9A88  a5 1b 10 38 a5 1e f0 34 a5 1f f0 30 a5 0d d0 2c a5 15 d0 07 a5 5b d0 03
       20 ee 98 ad 02 20 29 40 f0 f9 20 c3 8b ad 02 20 a2 00 8e 05 20 8e 05 20
       a5 10 29 fc 8d 00 20 a0 02 20 9e 8a 20 45 9c 20 98 88 a5 5b d0 03 20 83 9d
$8641  a9 00 f0 00 a6 0e 9d 00 07 e8 86 0e 60
$80D1  20 e4 83 | e2 80 16 81 21 81 37 81 65 81 50 96      <- table[5] = $9650
$9689  a5 02 4a 90 17 20 c0 a2 20 91 cb 20 ab ad 20 b7 bb 20 fc 9f 20 c7 c0
       e6 5b 4c 8c 9a                                      <- $96A0 INC $5B
$98C8+ ... e6 1f a9 21 ... e6 5b 20 ab ad 4c 8c 9a         <- $98DD INC $5B
$96EF  a5 4c d0 03 4c 9d 97 c6 4c 4c 5e 9a e6 5b           <- $96FB INC $5B
$9ACE  20 83 9d a5 1b 10 04 29 70 f0 01 60 a5 09 05 16 05 0d d0 5b
```

So, established here and not taken on trust:

* **$5B is cleared at $9658 on EVERY mode-5 frame**, before the $15 test, along
  with $5D ($9656) and $5C ($965A). QA's BLOCKING finding is correct.
* **$5B is not uncharacterised.** A byte-scan of the PRG for `85 5B / E6 5B`
  gives one STA ($9658) and eleven INCs, and three of the INCs ($96A0, $98DD,
  $96FB) sit on arms whose next instruction is `JMP $9A8C` / `JMP $9A5E` -- they
  raise it *inside* the frame and fall into the readers at $9A9C and $9ACA. It
  is "this frame's update already ran": do not scroll, do not stream.
* **$15 short-circuits the whole body** ($9660 `4C 8C 9A`), landing past
  $9A6A JSR $9FFC and past the $9A79 scroll latch -- and past $9A88's own bit-7
  test. QA's moderate finding is correct.
* **$1F's only zeroing writer is $883F** (`85 1F` with A = 0, inside the $8836
  screen loader that $8871 drives). That is the ONLY thing that can make
  $9A90's gate differ from $9A8C's, and it is unported -- see "could not do".

### 1. The suite

`node --test games/gradius/tests/`  before: **54 pass, 0 fail, 0 skipped**
`node --test games/gradius/tests/`  after:  **59 pass, 0 fail, 0 skipped**

`tests/frame-gates.test.js` 9 tests -> 14 (3 of them knownFail).
`tests/helpers.js` gains `knownFail(name, why, fn)`: the assertions failing is a
PASS with a loud diagnosis on stdout and stderr; the assertions PASSING is a
FAILURE ("SURPRISE PASS -- unwrap it"). Same contract as compare.mjs's
scenario-level annotations, which the unit suite did not have and which is
exactly why wave 1 had to choose between blessing a defect and not pinning it.

### 2. THE MUTATION TABLE

Run on a full copy of `games/gradius` in my scratchpad
(`<scratch>/g`, `<scratch>/mut.mjs`, `<scratch>/muts.json`), 21 mutants x 7 test
files. Every mutant's edit asserts its anchor appears EXACTLY once; every mutant
is restored and every file's sha256 re-checked against the pre-run baseline
(`nmi.js 37cdc689...`, `vram.js 834480d2...`, `terrain.js 37882bec...`,
`oam.js 75658a8d...`, `camera.js 8cae7870...`) -- the runner refuses to continue
if a restore is not byte-identical. `git status --short games/gradius/src/` is
empty; the repo's src/ was never edited.

| # | mutation (site) | unit tests that went RED | corpus |
|---|---|---|---|
| M1 | `queueTerminator` body deleted (`$8641`) | fg1 `$80B0 JSR $8641`, fg3, fg6 | -- |
| M2 | `QUEUE_GATE_BYTES` 4 -> 1 | fg3 `$9D89 CMP #$04` | GREEN |
| M3 | `QUEUE_GATE_BYTES` 4 -> 3 | fg3 | -- |
| M4 | `QUEUE_GATE_BYTES` 4 -> 64 | fg3, fg6 | -- |
| M5 | `queuePacket` wire length 4+n -> 3+n | fg1, fg3 | -- |
| M6 | `$9DA1 BMI` arm neutered (`if (false)`) | fg5 `$9DA1 BMI`, fg1 | GREEN |
| M7 | `$9D90 STA $57` hoisted above both gates | fg6 `$57 is written by the streamer` | -- |
| M8 | `$15` dropped from the camera gate ($9A98) | fg7 `$15 (pause) freezes the CAMERA` | GREEN |
| M9 | pre-wave-1 model: `bandB.ran = split && $15==0 && $5B==0` | fg7 | GREEN |
| M10 | `$9ACA` $5B gate around `streamBlock` deleted | **NOTHING** (see debt below) | GREEN |
| M11 | `&& state.zp1E !== 0` deleted from the split | fg11 `$9A8C LDA $1E: the handover frame` | **RED, 4 failures** |
| M12 | `&& state.zp1F !== 0` deleted from the split | **NOTHING** | GREEN |
| M13 | `&& state.ppu.blank === 0` deleted | fg10, fg12 | -- |
| M14 | split reads $0D BEFORE `$8090 DEC $0D` | fg12 `$0D is DECREMENTED before $9A94` | GREEN |
| M15 | `AND #$FC` dropped from band B's PPUCTRL | fg13 `$9ABA AND #$FC` | GREEN |
| M16 | band B takes the LIVE $10 instead of band A's | **NOTHING** (provably equivalent) | GREEN |
| M17 | `state.ppu.spriteZeroOn` pinned to `true` | fg14 `$8B1A-$8B2B: the $1E/$1F ladder` | GREEN |
| M18 | `$8641` moved above the mode dispatch | **NOTHING** | GREEN |
| F1 | **THE FIX**: port `$9658` (clear $5B/$5C at mode-5 entry) | fg9 `[knownFail] $9656-$965A` = SURPRISE PASS | GREEN |
| F2 | **THE FIX**: port `$9660` (paused frame runs no player/latch) | fg8 `[knownFail] $965C-$9660` = SURPRISE PASS | GREEN |
| F3 | **THE FIX**: `$0E` masked to 8 bits | fg4 `[knownFail] $864A INX` = SURPRISE PASS | GREEN |

"fgN" = the Nth test of tests/frame-gates.test.js. "--" = corpus not run for that
mutant. Corpus = full `compare.mjs`, 17 scenarios, scored on the failure count,
the knownFail pair count and the first w_000E frame.

### 3. THE BLOCKING FINDING, reproduced and closed

Wave 1's own test 7 (`$5B freezes the camera AND the streamer`) asserted that a
$5B set between frames survives. I checked out `15f88dc:tests/frame-gates.test.js`
into the scratch copy and applied the cartridge's own $9658:

```
node --test tests/wave1-original.test.js            -> 9 pass, 0 fail
  + state.zp5B = 0; state.zp5C = 0;   at the top of stagePlay()
node --test tests/wave1-original.test.js            -> not ok 7 - $5B freezes the
                                                       camera AND the streamer
node --test tests/frame-gates.test.js  (mine)       -> not ok 9 - [knownFail]
                                                       $9656-$965A ... (SURPRISE PASS)
```

So the wave-1 test really did block the ROM-faithful fix, and the replacement
fails in the other direction -- the direction that says "unwrap me".

### 4. THE CORPUS FIX: a scenario for the sprite-0 handover

The deliberate break that PASSED and was worth the most: M11/M12, both terms of
the split gate at $9A8C/$9A90, deletable with all 16 scenarios byte-identically
green. Diagnosis: `$1E = 1` and `$1F = 2` on all 3341 compared frames, because
the only frames where they are anything else are the stage intro's, at 282-314,
which is before this corpus's align of 400.

Fixed the corpus rather than only the unit suite:

* `scenarios.json` -- new scenario **`s0-handover`**: `idle`'s script plus
  `"poke": "001F=1@+40"`.
* `scen.py` -- a poke segment may now carry `@+N`, ONE frame at align+N, instead
  of the default whole-window hold. Also stores the EXPANDED poke (absolute
  frames) in the artifact, so porttrace.mjs and probe.lua read the same string
  instead of each resolving `align` themselves.
* `porttrace.mjs` -- `parsePokes` understands `@FROM-TO` (probe.lua always did),
  the poke is applied only inside its window, and `$1F` joins POKEABLE with the
  reason written out: `$9C38 A9 01 85 1F` is the cartridge writing this value
  itself, and it must be ONE frame because `$8B1A-$8B2B` promotes 1 to 2 on the
  next build, so a held 1 is a state the cartridge is never in.

Recorded and measured. The CARTRIDGE at frames 437-445 of `s0-handover`, one row
per frame, against `idle` recorded from the same script:

```
f440  $1E 1  $1F 2  sprite0Hit 1  splitSpins 1908  chrOffset 8192
f441  $1E 0  $1F 2  sprite0Hit 0  splitSpins    0  chrOffset    0   <- the handover
f442  $1E 1  $1F 2  sprite0Hit 1  splitSpins 1956  chrOffset 8192
idle f441 (no poke): $1E 1  $1F 2  sprite0Hit 1  splitSpins 1889  chrOffset 8192
```

One frame, exactly the one asked for, and the port reproduces it:
`compare.mjs --only s0-handover` -> **239 of 239 frames, 109 TIER 1 fields, 0
divergent**. With M11 applied it goes red on four of them:

```
scrollX    FIRST divergence at frame 442 (99/239)   rom 63  port 64
scrollLo   FIRST divergence at frame 441 (100/239)  rom 63  port 64
chrOffset  FIRST divergence at frame 441 (1/239)    rom  0  port 8192  [derived]
sprite0Hit FIRST divergence at frame 441 (1/239)    rom  0  port    1  [derived]
```

-- i.e. the corpus now sees both halves of the gate: the split that must not run
AND the camera that must not advance ($9A8E branches past $9AA0 too).

### 5. compare.mjs verdict line

QA's finding that wave 1 took the per-scenario SKIPPED field count from 8 to 10
while every headline number stayed identical. The verdict line now ends
`..., N fields SKIPPED (<names>)`, so a commit that removes fields from the
comparison has to move a number somebody reads.

### 6. THE GATE, run by me, after everything

```
$ node --test games/gradius/tests/
# tests 59 / # pass 59 / # fail 0 / # cancelled 0 / # skipped 0 / # todo 0

$ python games/gradius/tools/oracle/scen.py            (exit 0, all 17 re-recorded)
=== ORACLE CORPUS: 17 scenarios, align frame 400, 92 watched addresses ===
  long-idle 1000 frames lag=1 [283] ... s0-handover 640 frames lag=1 [283]
  (poke lines printed: 001F=1@440-440, 0040=6@400-639, 0040=3@400-639, 0045=2@400-639)

$ node games/gradius/tools/test-all.mjs
  PASS inputs / unit tests / port trace shape / port vs cartridge / self-check
  [STILL BROKEN] terrain-streams-at-double-rate: 51 field/scenario pairs diverge
  CLAMP COVERAGE: X_MAX/X_MIN/Y_MAX/Y_MIN all PASS
  17 scenarios, 3580 of 4423 frames compared (6 truncated), 0 failures,
  0 clamps uncovered, 0 stale annotations, 10 fields SKIPPED (pad2 oamBudget
  spriteOverflow scanline cpuCycle splitSpins w_0019 w_0020 w_0024 w_004C).
  neuter lead1 -> RED 153 | seed-x+1 -> RED 116 | laginject=450 -> RED 146
  GREEN -- 5 passed, 0 failed, 0 SKIPPED

$ node tools/build-dist.mjs
  rom-leak guard: 112 files checked against 2 ROM(s) -- clean, no allowlist
```

SKIP COUNT READ: 0 skipped stages, 0 skipped unit tests, 10 skipped comparison
fields (all six structural + the four UNMODELLED, each with a written reason).

## What I could not do, and why

**1. The $5B readers at $9A9C and $9ACA have NO honest coverage, and mutation
M10 proves it.** Once $9658 is ported (knownFail fg9), nothing a unit test can
do from outside the frame can put $5B up at either reader: the only raisers are
$96A0, $98DD and $96FB, and all three are unported arms that jump into the
middle of the body. I removed the wave-1 test that appeared to guard it, because
it guarded it only by asserting a state the cartridge cannot be in. The honest
fixes, in order: port the $96A0 arm (wave 4/5 owns the $1B ladder anyway) and
drive it; failing that, export the mode-5 body so a test can enter it at $9A8C
with $5B already raised. **Do not close this by re-asserting that an externally
set $5B survives the frame.** Written into tests/frame-gates.test.js as well, at
the point where a reader will hit it.

**2. M12 (`&& state.zp1F !== 0`) is still unkillable, and I can say exactly
why.** $1E is derived from $1F by $8B1A-$8B2B at $80A7 of every frame, so $1E is
0 whenever $1F is -- the two gates can only differ if something writes $1F
BETWEEN $8B2B and $9A90. A PRG scan for writers of $1F gives `$80F6 INC $1F`,
`$883F STA $1F` (A = 0), `$8B25 STY $1F` and `$9C3A STA $1F`; the only one that
can zero it mid-frame is $883F, inside the $8836 full-screen loader that $8871
drives at a stage load. That routine is unported, so the state is unreachable in
the port -- not equivalent, unreachable. When wave 4 ports the stage load, drive
a frame through it and this closes.

**3. M16 and M18 are equivalent mutants, not coverage holes.** M16 (band B reads
the live $10 instead of band A's) cannot be distinguished: $9A80-$9A86 only ever
touches bits 0-1 of $10 and $9ABC clears exactly those. M18 ($8641 moved above
the dispatch) cannot bite while the port has one producer that can never leave
$0E in 1..3. Both are recorded so nobody re-derives them; if wave 2's $8898
producers change the second one, the test to add is a frame with 3 bytes already
in $0E at $9D83.

**4. A pause SCENARIO for the corpus, which is what the $15 finding really
wants.** The script language already has START (`10:S` is in the boot prefix),
so the cartridge side is one line. The port side is not: with $15 = 1 the
cartridge freezes the player and the port does not, so ~15 TIER 1 fields would
diverge and the only way to keep the gate green would be a knownFail listing
`w_0320`/`w_0360` and friends -- and compare.mjs's knownFail is matched by FIELD
NAME ACROSS ALL SCENARIOS, so that annotation would switch the player
comparison off in all 17. **The prerequisite is per-scenario knownFail
scoping**; until then the pause defect is pinned by the unit knownFail (fg8)
only. This is the single most valuable thing the next harness owner can do.

**5. I did not measure the cartridge's own paused frame.** No oracle script
drives START mid-stage and samples the player, for the reason above. The pause
knownFail rests on the $965C/$9660 bytes, which are unambiguous, plus the
port-side measurement in the test itself.

## If someone picks this up cold

* `tests/helpers.js` `knownFail()` is the mechanism. Read its docblock before
  adding one; an unproven knownFail is a disabled test with a better name.
* Three knownFails are live: **$9656-$965A** (clear $5D/$5B/$5C at mode-5 entry
  -- the blocking one), **$965C-$9660** (pause skips the player and the latch),
  **$864A INX** ($0E wraps at 256). Each carries the ROM bytes, the owner, and
  the fix. Fixing any of them turns its test RED with "SURPRISE PASS"; that is
  the signal to delete the wrapper and keep the assertions.
* The mutation harness is worth keeping: `<scratch>/mut.mjs`, `mutcorpus.mjs`
  and `muts.json`, driven against a copy of `games/gradius`. It restores every
  file and refuses to proceed unless the sha256 matches. Copy it forward rather
  than rebuilding it; 21 mutants took about four minutes.
* The corpus is blind to almost all of this: of the 14 mutants I scored against
  the full comparison, exactly ONE (M11, and only because I added `s0-handover`)
  turns it red. That is the wave's own headline finding, reproduced a third time
  by a third agent. The unit suite is load-bearing; do not treat a green
  comparison as coverage of anything in `frame-gates.test.js`.
