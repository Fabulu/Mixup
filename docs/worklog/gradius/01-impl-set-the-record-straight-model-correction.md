# Wave 1 - Set the record straight: model corrections and queue plumbing
status: DONE
wave: 1   role: impl   started: 2026-07-31

WRITER. I edited `games/gradius/src/`, the two NOTES files, `scenarios.json` and
`porttrace.mjs`, and added one test file. Committed.

## The task, as I understood it

Eight one-to-few-liners from `00-plan.md` §Wave 1: fix everything in `src/` and
NOTES that the recons proved wrong, and close the cheap half of the
`terrain-streams-at-double-rate` knownFail (the missing `$8641` terminator
byte), so wave 2 is judged on the `$8898` alternation alone.

## What I did

Every ROM fact below I re-dumped from `Gradius (USA).nes` myself before writing
a line - I did not take the recons' bytes on trust. The dumps:

```
$806A  08 48 8A 48 98 48 AD 02 20 A4 04 D0 40 ... 20 AB 8B 20 41 86 A9 00 85 04
$8641  A9 00 F0 00 A6 0E 9D 00 07 E8 86 0E 60
$8B08  F4 F4 F4 F4 CE 6D 23 F8 A9 3E 85 9F A9 00 A2 03 85 9D A4 1F F0 0D A2 07
       88 D0 06 A0 02 84 1F D0 02 A9 01 85 1E A0 03 BD 08 8B 99 00 02 CA 88 10 F6
$9A80  A5 10 29 FC 69 00 85 10 A5 1B 10 38 A5 1E F0 34 A5 1F F0 30 A5 0D D0 2C
       A5 15 D0 07 A5 5B D0 03 20 EE 98 AD 02 20 ... 20 45 9C 20 98 88 A5 5B D0 03
       20 83 9D
$9D83  A5 3A D0 06 A5 0E C9 04 90 01 60 A9 00 85 57 A5 58 D0 1C A5 54 38 E5 3E
       85 98 A5 55 E5 3F 30 0F C9 01 90 0B D0 06 A5 98 C9 80 90 03 E6 57 60
$A0DC  21 01 D0 EA | 06 07 06 | 06 07 24 | 01 02 01 | A6 44 ...
$A118  A5 9B F0 18 20 35 A2 A5 35 9D A3 03 A5 44 C9 02 F0 0A A5 35 9D A6 03 D0 2B
$A1A4  02 00 00 02 80 00
$89BB  A9 02 85 98 A5 44 C5 98 F0 BE A5 98 85 44 ... $89CF A9 01 D0 EA
```

Confirming, in order: `$8641` is a **one-byte** routine (`LDA #$00 / BEQ $8645 /
LDX $0E / STA $0700,X / INX / STX $0E / RTS`) called at `$80B0`; the split block
is gated by `$1B` bit 7 / `$1E` / `$1F` / `$0D` and `$15`/`$5B` branch to
`$9AA3`, i.e. **past `JSR $98EE` and onto the split**; `$9D87` compares `$0E`
against 4; `$9DA1 BMI` builds; `$A128 BEQ $A134` enters slot B **on** `$44 == 2`;
`$89BB` (DOUBLE) stores 2 and `$89CF` (LASER) stores 1; `$A1A4` is three 2-entry
tables.

### Code

* **`src/nmi.js`** - the split/camera block rewritten as `$9A88-$9AC1`. `split`
  = `$1B` bit 7 && `$1E` != 0 && `$1F` != 0 && `$0D` == 0; `advanceCamera()`
  moved *inside* it behind `$15 == 0 && $5B == 0`; `bandB.ran = split`. Added
  `queueTerminator()` at the `$80B0` position and the `$9ACA` `$5B` gate around
  `streamBlock`. Header rewritten: `$8641` is no longer called "HUD packets",
  the real HUD tick (`$9AC7 JSR $8898`) is named as unported, and the `$0D`
  comment no longer claims `$0D` was never non-zero (the intro runs it).
  `$5C >= 2` throw re-worded: it is stage-5-only, which closes NOTES-player 12
  open question 1.
* **`src/vram.js`** - `state.vram.cursor` is now a real `$0E`. `queuePacket`
  advances it by `4 + n`; new `queueTerminator()` = `$8641`; `drainQueue` zeroes
  it (`$8A7B`). `QUEUE_LIMIT` (a packet count) renamed `QUEUE_GATE_BYTES`.
  I went one step past the plan here: the plan said reuse porttrace's byte sum,
  I made `$0E` a stored byte instead, so the port and the harness cannot drift.
* **`src/terrain.js`** - gate reads `state.vram.cursor` (bytes); `$57` written
  `= 0` at the `$9D90` position and `+= 1` at `$9DAF`; the lead test rewritten
  branch-for-branch (`BMI` / `CMP #$01 BCC` / `BNE` / `CMP #$80 BCC`).
* **`src/oam.js`** - `$8B1A-$8B2B` ported literally, so `$1E`/`$1F` are real
  bytes and `spriteZeroOn` is derived from the X register the ROM uses. This
  was needed to *state* the split gate at all; it also turned two permanently
  SKIPPED comparison fields into compared ones.
* **`src/state.js`** - `zp1E`/`zp1F`/`vram.cursor` added; the `$15`/`$5B`
  comment replaced with the ROM bytes and the correct meaning; `$3A` and `$57`
  documented; the `$44` comment corrected to 0 / 1 LASER / 2 DOUBLE.
* **`tools/oracle/porttrace.mjs`** - seeds and peeks `$1E`/`$1F`; `$0E` reads
  the cursor; `UNMODELLED` loses `001E`/`001F` and gains `0019`/`0020`/`0024`/
  `004C` with per-address reasons and the wave that will fix each.
* **`tools/oracle/scenarios.json`** - watch += `0000 0019 0020 0024 004C`;
  the knownFail `why` rewritten as the two-cause split with `$8898` named as
  the sole remaining cause; `expect` now says w_000E first diverges on an ODD
  frame (402), not 401.
* **`tests/frame-gates.test.js`** - new, 9 tests, one per corrected fact.

### Notes (rule 6, same commit)

* `NOTES-player.md`: `$44` row corrected + the measured 3-row table; slot B is
  skipped when `$44 != 2` with the `$A124-$A12F` bytes; "90 frames → 3 spawns"
  replaced with the measured 5 (and the 21/23 frozen-timer cadence); `$A1A4`
  described as three interleaved 2-entry tables; the `$5C` claim closed; the
  "first 28 frames" constant flagged as not a constant (respawn = 26).
  All cite `00-recon-weapons.md` / `00-recon-flow.md`.
* `NOTES-terrain.md`: the gate counts BYTES; `$3A` characterised as the
  stage-advance latch; `$57` described as a result flag with its two write
  sites; the full `$9DA1`-`$9DAF` branch ladder including the `BMI` catch-up
  arm; `$8641` labelled a one-byte stop-byte producer and explicitly *not* a
  HUD producer; the packet cost `4 + n` with the 37/38 cross-check; §7's port
  checklist updated for all of the above.

## What I MEASURED

### Baseline, before I touched anything

```
node --test games/gradius/tests/       45 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs  GREEN -- 5 passed, 0 failed, 0 SKIPPED
  16 scenarios, 3341 of 4184 frames compared (6 truncated), 0 failures
  [STILL BROKEN] terrain-streams-at-double-rate: 47 pairs
      long-idle:w_000E@401  long-idle:w_0054@598  long-idle:w_0055@854
      long-idle:w_0057@571  long-idle:w_0058@572  idle:w_000E@401 (+41 more)
```

### The cartridge's own `$0E`, read out of the recorded artifacts

```
node -e "... out/scen/*.json, frames > 400 ..."
  idle       f401: $0E=1  $54=0 $55=2 $57=1 $58=0
  $0E values in the live window: {1, 15, 9, 40, 38}
  seed at align 400: $0E=40 $57=1 $58=0 $54=0 $55=2 $1E=1 $1F=2 $0D=0 $02=145
```

`1` is the `$8641` byte alone on an even frame; `9/15/40` are the HUD's 8/14/39
plus it; `38` is a terrain block's 37 plus it. That arithmetic is what pins the
`4 + n` packet cost and the terminator at the same time. `$02 = 145` at frame
400, so frame 401 is even - which is why the cartridge reads exactly 1 there and
the port read 0.

### Live-window constancy (why these fixes were invisible)

Over the live window of all 16 scenarios: `$1E` = 1, `$1F` = 2, `$0D` = 0,
`$15` = 0, `$5B` = 0, `$3A` = 0, `$1B` = $80 - every one of them a constant.

### After

```
node --test games/gradius/tests/       54 pass, 0 fail, 0 skipped   (45 + 9 new)
node games/gradius/tools/test-all.mjs  GREEN -- 5 passed, 0 failed, 0 SKIPPED
  16 scenarios, 3341 of 4184 frames compared
  (6 truncated: right-wall@493, diag-rd-lu@533, diag-ru-ld@445, lr-both@482,
   speed6-right@515, speed3-diag@529), 0 failures, 0 clamps uncovered,
   0 stale annotations.
  [STILL BROKEN] terrain-streams-at-double-rate: 47 pairs
      long-idle:w_000E@402  long-idle:w_0054@598  long-idle:w_0055@854
      long-idle:w_0057@599  long-idle:w_0058@572  idle:w_000E@402 (+41 more)
```

`w_000E` moved 401 → **402**, the first ODD frame, and its divergence count on
long-idle fell from 599/599 to **327/599** - the even frames now match exactly,
which is the shape the diagnosis predicts. `w_0057` moved 571 → 599. Same 3341
frames, same 6 truncations, 0 failures. Two fields (`w_001E`, `w_001F`) moved
from SKIPPED to compared and are exact.

### SEEN RED - every fix, deliberately broken and watched fail

Scripted (`<scratchpad>/break.py`), src restored from a backup between each.

| break | effect |
|---|---|
| `no-8641` (drop the `$80B0` call) | unit test 1 RED; **corpus `w_000E@401` returns, 239/239 and 599/599 differ** |
| `peek-0e-no-term` (harness-side twin) | same corpus result - the two sides agree about where the byte comes from |
| `gate-packets` (`queue.length >= 4`) | unit tests 3 and 5 RED |
| `lead-unsigned` (`BMI` arm refuses) | unit tests 1 and 4 RED |
| `no-57` (drop `$9D90 STA $57`) | unit tests 4 and 5 RED; corpus `w_0057` 599 → 401 |
| `no-9aca` (drop the `$5B` streamer gate) | unit test 7 RED |
| `no-1e-handover` (`$1E` always 1) | unit test 9 RED |
| `old-15-5b` (the pre-wave-1 model) | unit tests 6, 7 and 8 RED |

Restored: 9/9 green, corpus back to `w_000E@402`.

### THE FINDING: six of the seven fixes are INVISIBLE to the 16-scenario corpus

The brief says a deliberate break that PASSES is the most valuable finding of
the day. Here is one, measured, six times over. Full `compare.mjs` run under
each break:

```
gate-packets     16 scenarios, 3341/4184, 0 failures, 0 clamps uncovered, 0 stale
lead-unsigned    16 scenarios, 3341/4184, 0 failures, 0 clamps uncovered, 0 stale
no-57            16 scenarios, 3341/4184, 0 failures, 0 clamps uncovered, 0 stale
no-9aca          16 scenarios, 3341/4184, 0 failures, 0 clamps uncovered, 0 stale
no-1e-handover   16 scenarios, 3341/4184, 0 failures, 0 clamps uncovered, 0 stale
old-15-5b        16 scenarios, 3341/4184, 0 failures, 0 clamps uncovered, 0 stale
RESTORED         16 scenarios, 3341/4184, 0 failures, 0 clamps uncovered, 0 stale
```

Even the *printed detail* is unchanged for four of them: only `no-57` shifts a
number (`w_0057` 599 → 401, and that is a knownFail field so the gate stays
green). **Only the `$8641` fix is observable in the oracle comparison at all.**

The reason is the constancy table above: `$15`, `$5B`, `$0D` are 0, `$1E`/`$1F`
are 1/2, and `$0E` is 0 at the one instant the gate reads it, on every one of
the 3341 compared frames. The corpus reaches all of this code and interrogates
none of its parameters - docs/knowledge/03's third shape, exactly. That is why
`tests/frame-gates.test.js` exists and why it sets the gate bytes by hand: it is
the *only* thing in the gate that can see six of these seven fixes. Reviewers
should treat it as load-bearing, not as decoration.

### A latent bug the `BMI` fix closed, found by the red run

Under `lead-unsigned`, unit test 1 also went red - and that was not planned.
From `bootState()` the build cursor and the camera both start at 0, so within
two frames the camera has overtaken the cursor and the lead is negative. With
the old unsigned test the streamer refuses, the cursor never moves, the camera
keeps going, and it refuses **forever**: a permanent stall. It never bit only
because `main.js` runs `preloadTerrain()` first and pushes the cursor ~384 px
ahead, and because no test drove the streamer from a bare `bootState()`. The
`BMI` arm is the ROM's catch-up path and it is now the port's.

## What I could not do, and why

* **`$5B` is still uncharacterised.** Eleven `INC $5B` sites, three readers
  (`$9A9C`, `$9ACA`, `$AEDD`), 0 on every measured frame. I ported both gates
  because the bytes are unambiguous, but I cannot say what raises it. The
  comment in `src/nmi.js` says so rather than implying it is understood.
* **`$1B` bit 7 clear is modelled in two incompatible places.** The ROM reaches
  `$9A88` from the *intro* path too, where bit 7 is clear: no camera, no split,
  but `$9AC4` onward - including the streamer at `$9ACE` - still runs. The
  port's `stagePlay()` returns at `$96B7` and runs none of it. I wrote the
  `substate & 0x80` term out anyway so wave 4 does not have to rediscover it,
  and both the code and the test say the term is currently redundant. Do not
  "simplify" it away.
* **The byte-vs-packet gate cannot be told apart by the cartridge today.** Both
  read 0. The unit test distinguishes them by putting bare bytes in the cursor
  with zero packets, which is a state the port can reach but this corpus never
  does. Honest, and weaker than a cartridge measurement would be.
* **I did not touch the HUD**, `$8898`, the packet table at `$864E`, rows 28-29
  of the nametable comparison, or the knownFail entry's existence. All wave 2.

## If someone picks this up cold

```
node --test games/gradius/tests/frame-gates.test.js     # the 9 corrected facts
node games/gradius/tools/oracle/compare.mjs --only long-idle | grep w_000E
python games/gradius/tools/oracle/scen.py               # re-record (needs the ROM)
node games/gradius/tools/test-all.mjs
```

The one number that proves wave 1 landed: `w_000E` first diverges at **402**,
not 401, and 133/239 frames differ on `idle` instead of 239/239. If it says 401
again, `queueTerminator()` at the `$80B0` position in `src/nmi.js` is gone.
