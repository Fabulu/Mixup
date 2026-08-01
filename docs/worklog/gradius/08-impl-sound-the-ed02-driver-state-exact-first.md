# Wave 8 — Sound: the $ED02 driver, state-exact first
status: DONE
wave: 8   role: impl   started: 2026-08-01 (date given in-session)

## The task, as I understood it

Port the Gradius sound driver (`$EC1E` request entry, `$ED02` frame loop, both
sequence dialects, pause, the `$F0` fade, the lag rule) into
`games/gradius/src/`, verified per frame against the cartridge. State-exactness
(the four owner bytes `$B2/$C3/$D4/$E5` and the four duration counters
`$B0/$C1/$D2/$E3`) is the bar; register/audio output is the stretch.

## Baseline, measured before I touched anything

```
node games/gradius/tools/test-all.mjs
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
  35 scenarios, 11695 of 11695 frames compared (0 truncated), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED
node --test games/gradius/tests/   262 pass, 0 fail, 0 skipped
```

(The wave brief quoted "16 scenarios, 3341 frames" from the plan; the corpus has
grown to 35 and 11695 since. Re-measured, not quoted.)

## What I did

### 1. The data — `assets/sound/tables.json`

`tools/export_assets.py` gained `sound_tables()`. Three blocks, all read at CPU
addresses by `src/sound.js`:

| block | range | why |
|---|---|---|
| `bgm` | `$833F-$8355` | the three interleaved 7-entry tables `$8357` reads with `Y = $19` (area theme, CHR select `$2D`, the `$3F` page the area theme takes over at) |
| `chanBase` | `$ECB2-$ECB5` | `$EC42 LDX $ECB2,Y` — and reading one past the end of *those four bytes* IS the index-0 crash |
| `data` | `$EFB8-$FFF9` | pitch table + the 64 sound records + every sequence stream, **in one block** |

The single `data` block is deliberate: `$EFCD-$EFCF` is simultaneously record 0
and the last two entries of the pitch table, so any split forces a choice about
which copy of two shared bytes is real. Build-time assertions, all of which I
watched abort by editing the constants:

* record 0's three bytes ARE `pitch[10] & $FF, pitch[11] >> 8, pitch[11] & $FF`;
* record 0's `apuOffset` (`$C0`) is NOT a valid channel offset;
* the pitch table is strictly descending C..B;
* every record `$01-$3F` has `apuOffset ∈ {0,4,8,$0C}` and points inside the
  block; the STOP records are exactly `$3C-$3F`;
* `$8357` is `LDY $19`, `$EFB7` is `sub_EFA6`'s RTS, `$8346[0] == 0`;
* the NMI vector at `$FFFA` reads `$806A`, `$FFC0-$FFF9` is `$FF` filler and
  `$FFBF` is not.

**What I could not do here, and it is a finding.** I first anchored the block's
end on "walk every stream and take the highest byte it reads". Both ways failed:

```
reachability search (explore both arms of every $FE/$FD)
    ABORT: the stream at $FC66 walks to $01E2
simulation with a repeated-(pos,count,insub,ret) state test
    ABORT: the stream at $FC66 walks to $01E2
```

A *static* decode of dialect B goes out of phase inside the `$2E-$34` group.
That is the same class of unresolved item `00-recon-sound.md` records for index
`$24` ("either my decoder desynchronises inside that stream's `$FD`
sub-phrases, or the data path was not reached in 500 frames"). The PORT does not
care — it executes `$ED77` rather than pre-decoding it — but the exporter must
not claim a number it cannot derive, so the block is anchored on the vectors and
the filler run instead, with the two failures written into the code.

### 2. `src/sound.js` — the driver

`state.snd` is `$00B0-$00FF` **as one flat array indexed by address**, because
the structs deliberately overlap the globals and a port with four struct objects
plus separate fields cannot express it:

* `$DD/$DE` is the triangle struct's `+$B/+$C`, reused as the ONE GLOBAL
  sub-phrase return address shared by all four channels;
* `$F0-$F3` is the noise struct's `+$D..+$10`, reused as the fade globals;
* `$DF/$E0/$E1/$E8` — `$EC1E`'s own scratch — sit on the triangle's `+$D..+$F`
  and the noise's `+$5`. **This one bit me** (see MEASURED below).

Ported: `$EC1E` (index/count split, the priority test, STOP records, the
silencing writes, the pulse-2 `$F0/$F1/$F2` reset on BOTH the accepted and the
rejected path), `$ED02`/`$ED46` (four structs, DEC duration, the `$ED1A` fade
epilogue), `$ED77` + `$ECC7`/`$ECD2`/`$ECEB`/`$ECE5`/`$ECB6` (the control
commands, chained inside one tick by `JMP`), dialect A `$EDBE`, dialect B
`$EE82` (including `duration = base*(dddd+1)` as a repeated ADD with the carry
chained, and the triangle's missing `dd` byte with its `JMP $ED77`), `$EE35`
release ramp, `$EF62` period write with the retrigger guard, `$EF56` octave loop
written LITERALLY (Y wraps through 256 for octave > 4), `$EFA6`.

Callers wired: `$8357`/`$839B`/`$83AB`/`$8398` (the BGM selector, the `$1C`
de-dupe, stop-all, the fade setter), `$9AF0`/`$9AFA` and `$9B27-$9B3B` (the
pause struct save/restore), `$97E9` (`$1C` cleared on the respawn), and the nine
existing `$EC1E` sites in weapons/collision/enemies/powerup/score, which used to
`state.sfx.push(id)` and now call `soundRequest(state, id)`. `state.sfx` stays —
it is what the weapon and power-up tests hold the CALL SITES to, and that
matters more now that most requests are correctly REJECTED.

### 3. The comparison

`scenarios.json` watch gained `$001C`, `$00B0-$00FB` (the whole driver zero
page) and `$01A0-$01B0` (the pause save area) — 616 watched addresses, up from
518. `porttrace.mjs` seeds all of it from the cartridge's RAM at the align frame,
so the port does not *start* a track: it **picks the stage-1 BGM up in flight**
(owners `$13/$14/$15`, pointers mid-stream, counters mid-note) and has to stay
in phase for hundreds of frames.

`objloop.lua` gained four counters, merged by `scen.py`, produced by
`porttrace.mjs`, compared as TIER 1:

* `audioTicks` — `$ED02` executions. The lag rule. `scen.py` now ABORTS if the
  cartridge ever reports anything but 1 on a sampled frame.
* `audioChannels` — `$ED46` executions: owned channels PLUS every control
  command chained inside the tick (`$ECE5` re-enters by `BNE`, not `JSR`).
* `apuWrites` — writes to `$4000-$400F` ($4014/$4015/$4017 excluded on purpose).
* `apuDigest` — a rolling hash of (offset, value) over those writes IN ORDER,
  `h = (h*31 + (off<<8) + v) & $FFFF`. This is the register-level comparison:
  the shadow itself is not comparable (write-only registers, and the port's
  starts at zero), but the writes made during the frame are.

## What I MEASURED

### The one divergence the corpus found, and what it was

First run of the new watch list, `idle`, 239 frames:

```
[FAIL] TIER 1: 650 fields, 1 divergent
  w_00F4: FIRST divergence at frame 415 (4/239 frames differ)
     f 414  rom     8   port     8
  >> f 415  rom     0   port     8
     f 416  rom     8   port     8
```

`$F4` is REAL RAM and I had dialect B's duration multiplier in a JS local.
`$EECA STA $F4` puts it there and `$EED3 DEC $F4` counts it out there; on a REST
(`$EF35 CMP #$0C` returns at `$EF44`) nothing writes `$F4` again, so the
cartridge leaves the counted-out **0** where a note leaves `$F4 | $08`. Four
frames of `idle` play a rest. Fixed by making `$F4`, `$F5`, `$FA` and `$FB`
accessors on `state.snd` rather than locals; `idle` then read

```
[PASS] TIER 1: 650 fields, 0 divergent
```

The same class of error was caught by inspection one step earlier: `$EC1E`'s
`$DF/$E0/$E1/$E8` are the triangle's `+$D..+$F` and the noise's `+$5`, and the
first draft kept all four in JS locals too.

### The compared fields are not constants

`idle`, from the recorded artifact:

```
distinct audioChannels  [0, 3, 4]
distinct apuWrites      [0,1,2,3,4,5,6,7,8,9,10,16]
distinct apuDigest      50 distinct values over 239 frames
```

### A CORRECTION TO THE WAVE BRIEF: the owner byte is not the record index

The brief and the plan both say "consecutive records". The RECORDS are
consecutive; the OWNER BYTES ARE NOT. `$EC91 LDA $DF / STA $02,X` reads `$DF`,
and `$DF` is written once at `$EC2F` and never reloaded inside the loop — so a
multi-channel request stamps the FIRST index on every channel it takes.

I wrote the test asserting `[$13, $14, $15]` and it went red. Both sides agree
with the port:

```
00-recon-sound.md 6, the pause rows:  c0=3B  c1=13  c2=13
out/scen/idle.json, w_00B2/w_00C3/w_00D4 transitions:
    f0   (0,0,0,0)        f200 (16,16,16,0)   <- the attract demo's $90
    f250 (0,0,0,0)        f310 (19,19,19,0)   <- the stage's $93
```

It matters for the priority rule: every channel of one piece of music guards
itself with the same number, so a shot ($01) is refused by all three.

### snddata.py --selfcheck, re-run here

```
python games/gradius/tools/oracle/snddata.py --selfcheck
index $13 ($F396, pulse1) decodes to 512 ticks; measured ownership was
513 frames = 1 setup + 512
[PASS] decoded tick count matches the measured channel-ownership window   rc=0
```

### FIFTEEN DELIBERATE BREAKS, and the two that survived

Each break was applied to `src/sound.js`, the oracle re-run over an 8-scenario
subset (idle, long-idle, enemy-waves, pause, autofire-double, intro-boot,
intro-respawn, capsule-shield) and `node --test` re-run, then restored.
Baseline: 0 failures.

| break | oracle | unit |
|---|---|---|
| B1 `base << dddd` instead of `base*(dddd+1)` | **183 failures** | 1 |
| B2 no priority test, every request accepted | **35** | 2 |
| B3 `$ECB6` frees with a literal 0 instead of Y | 0 | 0 |
| B4 `$EC95` fade reset only on the ACCEPTED path | 0 | **1** |
| B5 pause does not freeze (no `$ED5E INC`) | **15** | 2 |
| B6 octave loop clamped instead of the literal Y wrap | 0 | 0 |
| B7 the `$EF85` retrigger guard always writes `$4003` | **29** | 0 |
| B8 `$8369`: the BGM selector ignores `$3E` | 0 | **1** |
| B9(+b) `$FD` return address per channel, not the global `$DD/$DE` | **crash** | 0 |
| B10 `$EC63` seeds the duration with 0 instead of 1 | **107** | 1 |
| B11 `$FE`: cnt is REPEATS, not total passes | **53** | 1 |
| B12 dialect B does not silence a REST | **16** | 0 |
| B13 `$EE9D`: the triangle reads a decay byte it has not got | **100** | 0 |
| B14 the release ramp runs on the triangle too | **40** | 0 |

Thirteen of fifteen reddened. **B7 is the interesting green-to-red one:** the
retrigger guard is an APU-WRITE-ONLY behaviour — it changes no RAM at all — and
it was caught by `apuDigest`, i.e. by the register-level field. Without that
field the guard would have been unfalsifiable. B4 and B8 are caught only by
`tests/sound.test.js`, which is the reason that file exists.

**THE TWO THAT SURVIVED, and what I did about them.** Per the brief, a break
that passes is the most valuable finding of the day.

* **B3 — `$ECB6 STY $02,X` reads Y, not a literal 0.** Y is 0 on every path the
  corpus reaches. The one path with Y != 0 is the TRIANGLE's `$Dn vv` handler:
  `$EE9D` jumps back to the DISPATCHER at `$ED77` with Y at 2, so a triangle
  stream whose `$Dn vv` is immediately followed by `$FF` frees the channel to
  **2** and writes 2 to `$4008`. **No stream in this cartridge does that** — a
  scan of the whole `$EFB8-$FFBF` data region finds exactly ONE `$Dx ?? $FF`
  triple, at `$F74E`, and it is inside index `$30`, a PULSE 2 stream where `$Dn`
  is three bytes and the `$FF` is its decay operand. Closed by a unit test that
  builds the case from those real ROM bytes; seen red against B3.
* **B6 — the `$EF56` octave loop.** `LDY $10,X ... INY / BNE $EF56`: for an
  octave above 4 the loop wraps Y through 256 and shifts ~253 times, zeroing the
  period. Whether real data reaches it is 00-recon-sound.md's own unresolved
  item and it is STILL unresolved (the static decode desynchronises — see
  above). Closed by a unit test that forces `$10,X = 7` on a live channel and
  asserts `$F4/$F5` come out `$08/$00` rather than a pitch-table value; seen red
  against B6.

### The gate, after

```
node --test games/gradius/tests/     280 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs
  GREEN -- 7 passed, 0 failed, 0 SKIPPED
  35 scenarios, 11695 of 11695 frames compared (0 truncated), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED
  neuter lead1          -> RED, 241 TIER 1 failures   (was 193 before this wave)
  neuter seed-x+1       -> RED, 116 TIER 1 failures
  neuter laginject=450  -> RED, 722 TIER 1 failures   (was 640)
```

The two neuter counts going UP is the new fields taking effect: `laginject`
now also reddens `audioTicks`, and `lead1` reddens the driver's zero page.

## What I could not do, and why

* **A static decode of dialect B desynchronises**, on index `$23` (`$FC66`) at
  least — it walks to `$01E2`, i.e. out of the ROM. Two independent decoders
  (mine, twice, and the recon's, which needed a step limit) hit it. The PORT is
  unaffected because it executes the parser; what it cost is the ability to
  anchor the exported block's end on the stream data, so it is anchored on the
  vectors and the `$FF` filler instead. **Unresolved, and it is the same open
  item 00-recon-sound.md records for index `$24`.** A follow-up wants a Mesen
  run that forces `$23`/`$24` on to a channel and hooks `$ED77` to record the
  real byte sequence.
* **No audio is synthesised.** The APU register writes are reproduced exactly
  (address, value and order — that is what `apuDigest` compares), but nothing
  turns them into samples. The wave brief calls that the stretch and it is not
  attempted.
* **The `$F0` fade is still only reachable by intervention.** What game
  situation sets it (`$1B < $82` at `$8390`, on a frame where `$3F + 1` equals
  the area-theme page) is not established — stage 1's threshold is page 4 and
  nothing in this corpus gets past page 0. `tests/sound.test.js` drives it by
  poking `$F0`, exactly as the recon did.
* **Two-channel `$FD` sub-phrases at once.** `$DD/$DE` is one slot for all four
  channels. Reproduced literally; I did not construct a case that breaks it, and
  neither did the recon. B9 shows the port CRASHES if the slot is made
  per-channel, which at least proves the sharing is load-bearing on real data.
* **`$B0` is now characterised** (it is pulse 1's duration counter), which is
  the condition `00-plan.md`'s exclusion list put on revisiting game over /
  continue. `$96FB` is still a throw; that is now a scope decision rather than
  an unknown, and the comments in `src/flow.js` and `src/nmi.js` say so.

## If someone picks this up cold

```
python games/gradius/tools/export_assets.py          # writes assets/sound/tables.json
python games/gradius/tools/verify_assets.py --self-test   # 39 mutations, 14 families
python games/gradius/tools/oracle/snddata.py --selfcheck
python games/gradius/tools/oracle/scen.py            # re-record (needs Mesen + the ROM)
node   games/gradius/tools/oracle/compare.mjs
node   games/gradius/tools/test-all.mjs
```

The driver is `games/gradius/src/sound.js`, top to bottom in the ROM's own
order: `$EC1E`, `$ED02`, `$ED46`, `$ED77`, dialect A `$EDBE`, dialect B `$EE82`,
then the shared tails `$EE35`/`$EF62`/`$EFA6`, then the callers
(`$8357`/`$839B`/`$83AB`, the pause save/restore). Every non-obvious line
carries its ROM address.

**The three things a reviewer should look at hardest:**

1. **`state.snd` is one flat array indexed by ADDRESS.** If that looks like
   laziness, read the note at the top of the file: `$DD/$DE`, `$F0-$F3` and
   `$EC1E`'s own `$DF/$E0/$E1/$E8` are all struct bytes, and the wave found two
   separate bugs (`$F4` and the request scratch) that came from keeping ROM
   bytes in JS locals. Any refactor that gives a channel its own field
   re-introduces them.
2. **`bindSoundRom` is a module-level binding**, not a `res` parameter. The
   argument is in the file; the alternative was threading a parameter through
   `die()`, `addScore()` and `requestSfx()`, which the machine does not have.
3. **The owner byte of a multi-channel request is the FIRST index for all of
   them** (see the correction above). It reads like a bug and it is the ROM.
