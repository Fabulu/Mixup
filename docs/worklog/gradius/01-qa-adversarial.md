# Wave 1 QA - adversarial review of `15f88dc`

status: DONE
wave: 1   role: qa   started: 2026-07-31

READER. I did not edit `games/gradius/src/` and I did not commit. All mutation
work was done on a full copy of `games/gradius` in my scratchpad
(`<scratch>/g`, with a `package.json` carrying `"type":"module"` so the ESM
tests run there). `git status games/gradius` is empty and HEAD is still
`15f88dc`.

## The task, as I understood it

Assume wave 1 is broken and find where. Re-measure every number the
implementer quoted; hunt `docs/knowledge/03`'s four shapes in the nine new
tests; find the constants the corpus never moves.

## What I did

1. Re-ran the gate myself.
2. Re-dumped every ROM region wave 1 cites, from `Gradius (USA).nes` at the
   repo root (mapper 3 / CNROM, 32 KB PRG at file offset 16, so `$8000` ->
   offset 16), and produced a full recursive-descent disassembly with the
   repo's own `tools/nesdis.py` so I could read xrefs rather than guess at
   reachability.
3. Ran 25 mutations against the scratch copy, each scored on
   `tests/frame-gates.test.js`, the other six unit-test files, and the full
   `compare.mjs` corpus.
4. Drove the port into two states the corpus avoids (`$15 = 1`, `$5B = 1`) and
   read the fields out.

## What I MEASURED

### The gate, run by me, on the committed tree

```
node --test games/gradius/tests/
  # tests 54  # pass 54  # fail 0  # skipped 0  # todo 0

node games/gradius/tools/test-all.mjs
  GREEN -- 5 passed, 0 failed, 0 SKIPPED
  16 scenarios, 3341 of 4184 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
  speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations.
  [STILL BROKEN] terrain-streams-at-double-rate: 47 field/scenario pairs

compare.mjs long-idle detail:
  w_000E: 327/599 differ, first at 402   <- the implementer's headline number,
  w_0057:  56/599 differ, first at 599       reproduced exactly
  w_0054:  54/599 @598   w_0055: 27/599 @854   w_0058: 106/599 @572
```

I did NOT re-run `scen.py` (it re-records the oracle side and needs a Mesen
run); I used the artifacts already in `tools/oracle/out/scen`. Everything below
is therefore port-side or ROM-byte evidence, never a re-recorded oracle claim.

### ROM bytes I re-dumped (all confirmed as the implementer reported)

```
$80AD  20 AB 8B  JSR $8BAB / $80B0  20 41 86  JSR $8641 / $80B3 A9 00 / $80B5 85 04
$8641  A9 00 F0 00 A6 0E 9D 00 07 E8 86 0E 60          one byte, as claimed
$8B14  A9 00 A2 03 85 9D A4 1F F0 0D A2 07 88 D0 06 A0 02 84 1F D0 02 A9 01 85 1E
$9A88  A5 1B 10 38 | A5 1E F0 34 | A5 1F F0 30 | A5 0D D0 2C | A5 15 D0 07 |
       A5 5B D0 03 | 20 EE 98 | AD 02 20 ...            $15/$5B skip only the JSR
$9D83  A5 3A D0 06 A5 0E C9 04 90 01 60 A9 00 85 57 A5 58 D0 1C ... 30 0F (BMI)
```

I also checked the two things the wave asserts but did not show: the streamer's
own packet cost, and the drain. `$9E94-$9EB6` queues the ATTRIBUTE packet first
(mode 1, 3 header + 1 data + `$FF` = 5), then `$9EC2-$9F4A` queues four tile
packets whose data length is pinned at 4 by the `$99` counter on every arm
(`$9F06`, `$9F18` which DECs twice for two bytes, `$9F2A`, `$9F37`), each with
its own `$FF` at `$9F40` -> `4 * 8 + 5 = 37`, then `$9F4D STX $0E`. So `4 + n`
and 37 are right, independently of the implementer's cartridge sample. `$8A76
A9 00 / 8D 00 07 / 85 0E` confirms the drain zeroes `$0E`.

### Mutation sweep - 25 breaks, each scored three ways

`gates_fail` = `tests/frame-gates.test.js`; `units_fail` = the other six test
files; corpus = full `compare.mjs`.

| mutation | gates | units | corpus |
|---|---|---|---|
| M1  wire length `3 + n` instead of `4 + n` | **1** | 0 | unchanged |
| M2  `queueTerminator` moved before the game update | 0 | 0 | unchanged |
| M3  `QUEUE_GATE_BYTES = 1` | **0** | 0 | unchanged |
| M4  `QUEUE_GATE_BYTES = 3` | **0** | 0 | unchanged |
| M5  `QUEUE_GATE_BYTES = 64` | **0** | 0 | unchanged |
| M6  drop `zp1E !== 0` from the split | **0** | 0 | unchanged |
| M16 drop `zp1F !== 0` from the split | **0** | 0 | unchanged |
| M7  `spriteZeroOn = true` always | **0** | 0 | unchanged |
| M8  split reads `$0D` BEFORE the `$808A` decrement | **0** | 0 | unchanged |
| M9  terminator adds 2 | 3 | 0 | `w_000E@401` |
| M10 drop `INC $57` | 1 | 0 | pairs 47 -> **53**, `w_0057@401` |
| M11 `lo < 0x81` at the `$0180` boundary | 1 | 0 | `w_0057@569` |
| M12 `$5B` dropped from the camera gate | 1 | 0 | unchanged |
| M13 terminator on a lag frame | 1 | 0 | unchanged |
| M14 `$1F == 1` sets `$1E = 1` | 1 | 0 | unchanged |
| M17 `bandB.ran = true` | 1 | 0 | unchanged |
| M18 no `$8641` at all | 2 | 0 | `w_000E@401` |
| M19 `$57 = 0` before the gates | 1 | 0 | unchanged |
| M20 drop `substate & 0x80` | 0 | 0 | unchanged (declared redundant) |
| M21 `bandB.ctrl` from live `$10` | 0 | 0 | unchanged |
| M22 `bandB.chrBank = chrBank(0)` | 0 | 0 | **fail=16** |
| M23 `bandB.ctrl` unmasked | 0 | 0 | unchanged |
| **FIX-9658** add the ROM's `$9658 STA $5B` | **1 (test 7)** | 0 | unchanged |
| **FIX-9660** skip the player + latch when `$15 != 0` | **0** | 0 | unchanged |

The two rows in bold at the bottom are the important ones: they are the
CARTRIDGE'S OWN behaviour added to the port. One of them turns a wave-1 test
red; the other one changes nothing, which means the wave-1 test named for it
cannot tell the two models apart.

### `$9650`, raw, and what it settles

```
9650  A9 0C  LDA #$0C / 85 13  STA $13
9654  A9 00  LDA #$00
9656  85 5D  STA $5D
9658  85 5B  STA $5B        <- $5B := 0 at the top of EVERY mode-5 frame
965A  85 5C  STA $5C
965C  A5 15  LDA $15
965E  F0 03  BEQ $9663
9660  4C 8C 9A  JMP $9A8C   <- PAUSE jumps past the player AND the scroll latch
```
and the two raisers, both of which then reach the readers:
```
969A  20 FC 9F JSR $9FFC / 20 C7 C0 JSR $C0C7 / E6 5B INC $5B / 4C 8C 9A JMP $9A8C
96FB  E6 5B INC $5B  ... -> $975D -> 9762 4C 5E 9A JMP $9A5E   (game over)
```

Port behaviour, measured (`<scratch>/qa1pause.mjs`):

```
30 frames, RIGHT+DOWN held
  $15=0 : dx=30 dy=30 dcam=15 dring=24 dscroll=15
  $15=1 : dx=30 dy=30 dcam= 0 dring=24 dscroll= 1
after one write of $5B = 1 and 60 further frames:
  zp5B = 1   cam.lo = 0   build.prog = 1     (frozen forever)
```

### Reachability of `$9A88` with `$1B` bit 7 clear

`nesdis.py` xrefs: `$9A5E` is entered from `96EC, 96F8, 9762, 9827, 986F,
9947, 99B7, 99BD, 99DC, 99F6, 9A04, 9A0B`; `$9A8C` from `9660, 96A2, 98E2`.
`$96EC` is the tail of `$96CF` (bit 4, stage advance), `$96F8` of `$96EF`
(bit 5, dying), `$9762` of `$96FB` (bit 6, game over). The stage-INTRO arm is
`$96BE: LDX #$03 / STX $0D / JSR $83E4` -> `jt_96C5` -> `$9B3E/$9BED/$9C12/
$9C1E/$9C24`, and `$83E4` replaces the return address, so those routines RTS to
the mode dispatcher. **The intro never reaches `$9A88` or `$9AC4`.**

## Findings

1. **BLOCKING-ish - `$5B` is reset every frame and the port never resets it;
   test 7 locks the wrong model in.** `$9658 STA $5B`. In the port a single
   `$5B = 1` freezes the camera and the streamer permanently (measured, 60
   frames). Adding `state.zp5B = 0` at the top of `stagePlay()` turns
   `tests/frame-gates.test.js:7` RED and nothing else. So the correct fix is
   now blocked by a wave-1 test.
2. **`$5B` is NOT uncharacterised.** `$96A0` (stage-5 double update) and
   `$96FB` (game over) INC it; `$9658` clears it each frame. That is a complete
   characterisation: "this frame's update already ran / this is not a normal
   play frame -- do not scroll, do not stream." `src/nmi.js`, `src/state.js`
   and the implementer worklog all say the opposite.
3. **The bit-7-clear entry is misattributed to the intro.** It is `$96CF` /
   `$96EF` / `$96FB` (stage advance, dying, game over) -- wave 5, not wave 4.
   Written in `src/nmi.js`, in test 8's comment and in the worklog.
4. **The port runs the player and the scroll latch on a paused frame.**
   `$9660 JMP $9A8C` skips `$9A64`-`$9A87` including `$9A6A JSR $9FFC`.
   Measured: `$15 = 1` + RIGHT/DOWN for 30 frames moves `$0360`/`$0320` by 30.
   Test 6 drives zero buttons and asserts only the camera; the ROM-faithful fix
   leaves the whole gate green, so test 6 cannot distinguish the two models.
5. **`QUEUE_GATE_BYTES = 4` is guarded by nothing** (1, 3 and 64 all green).
   Test 3 uses the constant as its own loop bound.
6. `$9A8C` (`$1E`) and `$9A90` (`$1F`) are indistinguishable -- either can be
   deleted with everything green. Test 8's "`$1E = 0`" case sets `zp1F = 0` too.
7. `state.ppu.spriteZeroOn` can be pinned to `true` with everything green.
8. The `$0D` pre/post-decrement read is unguarded; no test crosses `1 -> 0`.
9. SKIPPED **fields** went 8 -> 10 per scenario (UNMODELLED 2 entries -> 4);
   the gate's "0 SKIPPED" counts stages, so this is invisible there. The two
   fields promoted to "compared, exact" are constants 1 and 2.
10. `queueTerminator`'s position relative to `$9ACE` is unguarded (M2 green).
11. `state.vram.cursor` is not masked to a byte; `$0E` is.
12. `bandB.ctrl` reads `bandA.ctrl` (latched at `$809C`) where `$9ABA` reads
    the live `$10` that `$9A80` rewrote earlier in the same frame. Equal only
    because `AND #$FC` clears the one bit that differs. M21 and M23 both green.

## What I could not do, and why

* I did not re-record the oracle (`scen.py`), so every cartridge-side number I
  quote is either a ROM byte I dumped myself or an artifact already in
  `tools/oracle/out/scen`. The pause and `$5B` findings rest on branch targets,
  not on a re-run.
* I could not produce a divergence inside the 3341 compared frames. Everything
  above is latent: `$15`, `$5B`, `$0D`, `$1F != 2` and a non-zero `$0E` at the
  gate are all unreachable from this corpus, which is the wave's own finding
  turned back on itself.
* `$1B` bit 4/5/6 behaviour past `$9A5E` I did not chase -- I only established
  which arms reach it.

## If someone picks this up cold

```
python games/gradius/tools/nesdis.py "Gradius (USA).nes" --out /tmp/prg.asm
grep -n "9A5E\|9A8C" /tmp/prg.asm         # the xref lists that settle finding 3
```
The one experiment that matters: add `state.zp5B = 0;` at the top of
`stagePlay()` in a scratch copy and run `node --test tests/frame-gates.test.js`.
Test 7 goes red. That is finding 1 in one command.
