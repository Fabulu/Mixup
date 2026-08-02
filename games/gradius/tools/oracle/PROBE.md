# The Gradius reference probe

`probe.lua` + `probe.py` + `ramdiff.py`. The NES counterpart of Batman's
`tools/oracle/probe.py` + `trace.py`, on the emulator `README.md` in this
directory settled on (Mesen 2.1.1, headless via `--testRunner`).

The point of this file is the **shape**, not the coverage. Everything below was
measured by running it; where something was found by being wrong first, that is
said so.

---

## 1. The sample point, which is the only decision that really matters

`docs/knowledge/01-the-oracle-method.md`: *sample at a stable point in the
game's own loop, never at the emulator's tick boundary.* On the Game Boy,
getting this wrong produced a phantom camera bug that was chased for a long
time.

Gradius makes the choice unusually clear, because **it has no main loop**. Read
out of the running cartridge:

```
$FFFA -> $806A                       the NMI vector
$8067: 4C 67 80   JMP $8067          RESET ends in an empty infinite spin
```

Everything — OAM DMA, the VRAM queue, scroll, sound, the joypad, the game state
machine — happens inside the NMI handler. Its bytes, read at runtime:

```
$806A: 08 48 8A 48 98 48   PHP/PHA/TXA/PHA/TYA/PHA
$8070: AD 02 20            LDA $2002
$8073: A4 04               LDY $04        re-entrancy guard
$8075: D0 40               BNE $80B7      taken == this frame is DROPPED
$8077: 20 36 83            JSR $8336      ... every subsystem ...
$80A4: 20 BF 81            JSR $81BF      joypad
$80AA: 20 BE 80            JSR $80BE      game state machine
$80B3: A9 00               LDA #$00
$80B5: 85 04               STA $04        <-- WE HOOK HERE
$80B7: 68 A8 68 AA 68 28 40 PLA/TAY/PLA/TAX/PLA/PLP/RTI
```

**`$80B5` is where a frame is unambiguously finished** and the guard has not
been cleared yet. Hit counts over 300 emulator frames on the title screen:

| address | hits | meaning |
|---|---|---|
| `$806A` | 296 | NMI entries |
| `$8075` | 296 | reached the guard |
| `$8077` | 296 | guard not taken — real work |
| `$80B5` | 296 | **samples taken** |
| `$81BF` | **297** | joypad — one *more* than the NMI count, because RESET's init path reads it once at frame 3 before NMI is enabled |
| `$9AA3` | 0 | the sprite-0 split does not run on the title screen |

### The check that proves the hook is where we think it is

`$04` must read **1** at every sample: `$809F` did `INC $04` and `$80B5`
(`STA $04`) has not executed yet. `probe.py` asserts this on every frame.

It has been seen to fail. Moving the hook one instruction later, to `$80B7`:

```
[FAIL] $04 == 1 at every sample (the hook is really at $80B5); 319 violations
```

Everything else in that run still passed. Without this assertion, a
one-instruction slip would have produced a perfectly plausible trace.

### Lag frames

Counted exactly rather than by subtraction: the `$806A` hook reads `$04` on
entry. Non-zero means the previous NMI has not finished and this one takes the
`BNE` at `$8075`, dropping the whole frame's update. Measured: **1 lag frame**
in a 560-frame boot-and-play run, at game frame 283 — the stage load. Reported
as `lagFrames`, with the game frame printed, never hidden
(`docs/knowledge/02-traps.md` #6).

---

## 2. Input: the controller port, not RAM

Buttons are set with `emu.setInput()` on the `inputPolled` event, i.e. when the
CPU reads `$4016`. The game's own strobe routine at `$81BF` shifts them in.
**Nothing is poked into RAM** — and the probe proves the bits really travelled,
by reporting `$9C`, which only becomes non-zero if the shift register ran.

**Button bits in `$9C`**, measured one button at a time:

```
bit7 A   bit6 B   bit5 Select   bit4 Start
bit3 Up  bit2 Down bit1 Left    bit0 Right
```

### `$9C` is a trap: read it at the wrong instant and you get nonsense

The first version of this probe sampled `$9C` at `$80B5` and produced an input
trace with **65 distinct values on a run where no button was pressed**. The
sprite emitter reuses it:

```
$8B39: A5 2F 18 69 44 D0 03 18 69 04 85 2F 85 9C
       LDA $2F / CLC / ADC #$44 / BNE +3 / CLC / ADC #$04 / STA $2F / STA $9C
```

`$9C` holds the per-frame OAM flicker base by the end of the frame. The probe
therefore latches `$9C`/`$9D` with a second hook at **`$80A7`**, the instruction
immediately after `JSR $81BF`. Same shape as `docs/knowledge/02` trap #3: the
field that would not make sense was the measurement, not the game.

The *durable* input fields are `$0005` and `$0007` — see the RAM map below.

### The input lead is ZERO. Measured, not inherited.

The Game Boy needed buttons held one tick early. `python probe.py --lead`
presses START on exactly one game frame:

```
asked for START on game frame 220 only
frames where $9C != 0   = [220]
$9C values              = [(220, '0x10')]
mode ($00) transitions  = [(128, 1), (220, 3), (301, 4), (302, 5)]
[PASS] and the game REACTED on the same frame: mode changed at 220
```

The latch *and* the consequence land on the press frame, because `$81BF` runs at
`$80A4` inside the same NMI as the state machine at `$80AA`. **Do not carry the
Game Boy's one-tick lead over.**

---

## 3. Determinism

```
python games/gradius/tools/oracle/probe.py --frames 560 \
    --script "200:,10:S,90:,120:R,60:D,80:L" --twice
```

Two separate Mesen processes:

```
run A: gameFrames=560 lag=1 finalMode=5 json sha256=cc2a1948deb5c1b0…56180ed
run B: gameFrames=560 lag=1 finalMode=5 json sha256=cc2a1948deb5c1b0…56180ed
[PASS] state-vector JSON byte-identical
[PASS] full RAM dump byte-identical (1146880 bytes each)
```

The JSON is written by the Lua side with a fixed key order and integers only, so
the hash is of the emulator's output and not of Python's formatting. The RAM
dump — 2048 bytes per game frame — is compared too, which is a far stronger
statement than the state vector alone.

Speed: **560 game frames in 4.8 s wall**, including ~2 s of process startup.

---

## 4. What was found with it: the first real RAM addresses

`ramdiff.py` runs the probe several times off one identical boot prefix and
diffs the full 2 KB. Since the runs are byte-identical until the scripts
diverge (asserted, and it prints PASS/FAIL), any address that differs afterwards
is downstream of the button, and the frame it first differs on orders the chain.

```
python games/gradius/tools/oracle/ramdiff.py --find-player
python games/gradius/tools/oracle/ramdiff.py --ab "" "R"
```

`--find-player` uses a **discriminating** test rather than "changes when you
press something", which **472 of 2048 addresses** do once there are enemies on
screen. A tier-1 candidate must satisfy three conditions at once:

1. drift one way under RIGHT and the *other* way under LEFT,
2. be **completely still** on the idle run over the same window,
3. by a margin.

Condition 2 is what does the work. Without it the table is topped by shadow-OAM
bytes and by `$00F5`, which drift under both directions but also move on their
own. Tier 2 is printed anyway, so anything that fails only condition 2 is
visible rather than silently discarded.

**Honest limit:** the diff alone cannot separate a variable from its faithful
copies. Tier 1 for X contains `$0360` *and* `$020F`/`$02CB` (the player
metasprite's shadow-OAM X bytes) *and* `$07B4`-`$07B6` (the history ring), all
with near-identical drift. That is what `--pokecheck` is for.

### The map

| address | what | evidence |
|---|---|---|
| **`$0360`** | **player X**, screen pixels | drift +140 under RIGHT, −64 under LEFT, exactly 0 while idle. Poking it moves the ship (below). |
| **`$0320`** | **player Y**, screen pixels | drift +96 under DOWN, −80 under UP, 0 while idle |
| `$0005` | buttons **pressed this frame** (edge) | reads `$10` on the START press frame and `$00` on all nine frames it stayed held |
| `$0007` | buttons **held** | RIGHT `$01`, LEFT `$02`, DOWN `$04`, UP `$08`, START `$10` — the low nibble of `$9C`, and unlike `$9C` it survives to the end of the frame |
| `$0361`,`$0362` / `$0321`,`$0322` | the two Option/Multiple followers | trail the player by 11 and 22 entries of the position ring |
| `$07A0`-`$07B7` | 24-entry ring of past player **X** | at one frame: `$0360` = 201, ring = `200 201 178 179 … 199` — a circular buffer with its cursor at index 1 |
| `$07C0`-`$07D7` | 24-entry ring of past player **Y** | same extent, moves only under UP/DOWN |

**Clamps**, measured by holding a direction into the wall for 150 frames:
X ∈ [16, 220], Y ∈ [16, 192]. Base speed steps the value by **0 or 1 per
frame** (never 2), which is the pre-SPEEDUP rate.

Both fields read **0** on the first frame or two of game mode 5 — the actor is
not initialised until after the mode changes. A port that samples the transition
frame will see zeros, and they are real.

**A ten-frame "input lag" that is not one.** Holding RIGHT from game frame 300
moves `$0360` only at frame 310. Holding it from frame 400, or from 500, moves
it **on the press frame itself** (80 → 81 at frame 400). So the ship is simply
not under player control for roughly the first 28 frames of mode 5 — a
stage-entry window in the game. Measured at three different start frames
specifically because a single measurement at 300 would have been reported as a
harness lead. It also confirms the zero input lead a second time, on a gameplay
consequence rather than a menu.

### Correlation is not proof, so: poke it and look

```
python games/gradius/tools/oracle/probe.py --pokecheck 0360=40
```

Runs the identical script twice, forcing `$0360` in one of them:

```
$0360 at final frame : baseline 230   poked 41
framebuffer fnv1a    : baseline 0x1B04E2D8   poked 0x9E13D058
[PASS] the ROM kept the poked value ($0360 reads 41, asked 40)
[PASS] the PICTURE changed -- the poke is visible on screen
[PASS] the poked frame is still a real picture, not a blank/garbage screen
```

**I looked at the two PNGs.** The Vic Viper is on the right of the screen in the
baseline and on the left in the poked one; the three spinning enemies, the
`SPEEDUP/MISSILE/LASER/OPTION` bar, the life count and both scores are pixel
identical. That is an intervention, not a correlation.

`$0360` reads **41** rather than 40 because the poke lands at `$80B5` of frame N
and frame N+1's update adds the still-held RIGHT to it — i.e. the ROM *consumes*
`$0360` as the position it increments, which is stronger evidence than the
poke sticking would have been.

**The poke check is not vacuous**, and it does the one job the RAM diff cannot —
telling a variable apart from a copy of it.

Poking an inactive actor slot:

```
python games/gradius/tools/oracle/probe.py --pokecheck 0330=48
framebuffer fnv1a : baseline 0x1B04E2D8   poked 0x1B04E2D8
[FAIL] the PICTURE changed -- the poke is visible on screen
```

Poking `$00A4`, which tracks the player X almost perfectly in every RAM diff
(80 → 173 under RIGHT while `$0360` goes 80 → 174):

```
python games/gradius/tools/oracle/probe.py --pokecheck 00A4=40
$00A4 at final frame : baseline 230   poked 230        <-- overwritten same frame
framebuffer fnv1a    : baseline 0x1B04E2D8   poked 0x1B04E2D8
[FAIL] the ROM kept the poked value ($00A4 reads 230, asked 40)
[FAIL] the PICTURE changed -- the poke is visible on screen
```

`$00A4` is regenerated from `$0360` every frame and controls nothing. On drift
numbers alone the two are indistinguishable; under intervention they are not.
Same for `$00A5`/`$00A6`, which track Y. **`$0360`/`$0320` are the variables;
`$00A4`/`$00A5` are working copies.**

### A structure that falls out of it, stated as a candidate

`$0320` and `$0360` are `$40` apart, and page `$0300` looks like parallel arrays
of 32 slots. At one gameplay frame:

```
$0300: … 133 133 133 133 …   (slots 18-21)
$0320:  96  96  96 … 42 42 42 42
$0360: 220 209 198 … 164 142 120  98
$03A0: …   3   3   3   3 …
```

Slot 0 is the player, slots 1-2 its two followers, slots 18-21 a four-enemy
squadron evenly spaced 22 px apart. So `$0320+i` = Y, `$0360+i` = X, and
`$0300+i` / `$03A0+i` are plausibly type and state. **The Y/X arrays are
measured; the type/state reading is one frame of inference and should be
confirmed before anything is built on it.**

### Independent corroboration of somebody else's number

At one gameplay frame the player's metasprite is three shadow-OAM entries at
`$0360 + {-9, -1, +7}`, `$0320 + 0`, in **slots 13, 28 and 43** — 15 apart. The
static recon derived a −15-slot stride between consecutive sprites from
`$8AF2: TXA / CLC / ADC #$C4`, by reading the listing. Two derivations, one
number (`docs/knowledge/03`).

---

## 5. Commands

```
# trace: boot, play, JSON + summary
python games/gradius/tools/oracle/probe.py --frames 560 \
    --script "200:,10:S,90:,120:R,60:D,80:L" --shot out/final.png

# determinism
python games/gradius/tools/oracle/probe.py --frames 560 \
    --script "200:,10:S,90:,120:R,60:D,80:L" --twice

# input lead
python games/gradius/tools/oracle/probe.py --lead

# causation for an address
python games/gradius/tools/oracle/probe.py --pokecheck 0360=40

# find variables
python games/gradius/tools/oracle/ramdiff.py --find-player --hold 150
python games/gradius/tools/oracle/ramdiff.py --ab "" "D" --hold 120

# extra addresses in the state vector
python games/gradius/tools/oracle/probe.py --frames 400 --watch 0300,03A0

# the ENEMY BULLETS ($BC59 / $BCB5 / $83B5 / $BDD5 / $C20A / $C2FF / $BF75),
# wave 11.  38 exec hooks, three of them recording ARGUMENTS at the instruction,
# plus a per-frame dump of all fifteen arrays of all ten bullet slots (22-31).
# $040C+j is the enemy's shot countdown: poking it to 0 makes enemy slot j fire
# on the very next frame, which is the only way a script can reach $BC59 at all
# (see src/enemies.js $BC44 for why).
python games/gradius/tools/oracle/bulletprobe.py --frames 700     --script "200:,10:S,490:" --poke "0415=0@450,0415=0@455,0415=0@460"     --hits --args --dump 450:60 --dumpslots

# WHICH UNPORTED PATHS DOES A PLAYER ACTUALLY REACH? (wave 12)
# 79 exec hooks -- one per ROM address named by a loud throw in src/, plus all
# 42 entries of the $AE1C handler table -- driven by seven long, varied scripts
# (27,400 cartridge frames).  Also samples 19 RAM GATES per frame, because
# several throws are not a branch the cartridge takes but a VALUE the port
# refuses ($18, $19, $1A, $3A, $5C, the rank $17), and for those an address
# hook answers the wrong question.
python games/gradius/tools/oracle/throwaudit.py
python games/gradius/tools/oracle/throwaudit.py --only deep-powered
python games/gradius/tools/oracle/throwaudit.py --name adhoc --frames 4000     --script "200:,10:S,190:,3600:RD" --poke "0044=2,0045=2,0046=5,0041=1"
```

**Two traps `throwaudit.py` was written into, both worth inheriting.**

1. **Hook the ARM, not the test.** `$9663` is `LDA $19 / CMP #$04 / BNE $96A5`
   and executes on every single frame; the stage-5 census the port refuses
   starts at `$9669`. The first version of the hook list reported 1613 hits for
   a path nothing reaches. Where there is no arm address of its own — `$A17C`
   and `$C3AD` both land on code the normal path also reaches — the only honest
   measurement is the RAM value, and those are in the gate list instead.
2. **A script that never presses START runs the ATTRACT DEMO**, which is mode-5
   gameplay with `$09` set and the pause cheat already granted (`$9C5E` at
   f414, `$45 = 2`, `$46 = 5`, `$41 = 1`, `$17 = 3` for the whole run). Every
   run starts with the corpus's own `200:,10:S,190:` for that reason.

**And read the zeroes correctly.** A zero is not "the cartridge does not do
this"; it is "these frames of these scripts did not do this". That exact slip —
a fact about our sampling, promoted into a claim about the cartridge — is what
produced two crashes in ordinary play (`docs/worklog/gradius/05-FINDING` and
`06-FINDING`), and the tool prints the frame budget next to every zero to keep
the distinction in front of whoever reads it.

Input script grammar: comma-separated `count:buttons`, buttons from
`U D L R A B S(tart) E(select)`, empty means nothing held. Frames past the end
of the script hold nothing. Counts are **game** frames (samples), not emulator
frames.

`ramdiff.py`'s shared boot prefix is `"200:,10:S,190:"` — 400 game frames. Game
mode 5 (gameplay) starts at frame 282, the single lag frame is at 283, and the
ship becomes controllable at ~310, so holds start at 400, clear of all three.

---

## 6. Known limits and traps for whoever extends this

- **`emu.stop()` is asynchronous.** The endFrame handler runs at least once more
  after it, so the final report printed twice with *different* counters until a
  `stopped` flag was added. Any new script must do the same.
- **Every path handed to Lua must be absolute.** Mesen's cwd is not ours; a
  relative path fails inside `io.open`, and the failure used to surface as the
  driver re-reading the *previous* run's JSON and reporting it as this run's
  result. `probe.py` now deletes the target first, raises on a tagged
  `ERROR =` line, and checks the file exists.
- The state vector is deliberately small. It is a **shape**, not coverage: game
  mode, frame counter, input, player, the video state the renderer will need,
  and shadow-OAM sprite 0. Add fields as they are found and justified, the way
  Batman's `trace.py` field table grew.
- Only stage 1's opening has been driven. Nothing here has been checked against
  a boss, a death, or stages 2-6.
- The `$0300` page reading is one frame of evidence. The player X/Y are not.
