# Wave 24 review - the play sub-state machine (jt_$982F) and the game-over arm

status: DONE
reviewer, 2026-08-02
subject: commit `537c8e1` "Gradius W24: the play sub-state machine jt_$982F and
the game-over arm $96FB" (plus ledger commit `579ea5e`).

VERDICT: **SOUND.** No correctness defect found. Every ported routine was
re-derived from `games/gradius/rip/prg.asm` instruction-by-instruction and
matches; the `$1B` timeline checks against the cartridge hook dump to the frame;
13 of 16 independent mutations went RED and were SHA-256-verified both ways.
Three findings, all coverage / test-quality (no ported line is wrong): the
load-bearing one is that the `$82` countdown's *zero-test* half is unpinned - a
mutant that ends the timer 512 frames early passes every test - and the
implementer's "17 of 18" table does not name it.

## What I re-ran (executed here, 2026-08-02 - not quoted from the worklog)

```
node --test games/gradius/tests/            445 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs       GREEN -- 10 passed, 0 failed, 0 SKIPPED
                                            44 scenarios, 17416/17416 frames (regression clean)
                                            self-check: 7 deliberate neuts all RED
python games/gradius/tools/census.py dispatch
    entries ported 19 / 42 ; throwing 23 ; distinct 16 / 34   (UNCHANGED)
```

The `$1B` timeline, read out of `tools/oracle/out/throwaudit-endchain.json`
myself (the implementer's gate dump, 6000 frames, `maxScroll=3584`):

| `$1B` | state | frames | source / check |
|---|---|---|---|
| `$00`-`$04` | intro | 283+1+1+1+23 | jt_96C5 (pre-W24) |
| `$80` | play | 2676 | `$9A4D` body (pre-W24) |
| `$81` | countdown setup | 1 | `$9A0E` (W24) |
| `$82` | the countdown | **768** | `$9A35[1]`×256 = 3×256 = **768** ✓ |
| `$83` | transition | 1 | `$99C0` (W24) |
| `$84` | boss-page scroll | 512 | `$9982`+`$994A` (W24) |
| `$85` | boss fight | 1101 | `$997E` (W24; handler W26) |
| `$86` | stage end | 513 | `$9904` (W27 throw) |
| `$90` | next-stage | 1 | `$96CF` (W27 throw - bit-4 arm) |
| `$A0` | dying | 118 | `$96EF` (pre-W24) |

The two numbers the wave brief made done-when - `$82` = 768 frames and `$81`/`$83`
= 1 frame each - reproduce exactly. The `$96FB` traffic the worklog cites also
reproduces: `$1B=$C0` runs **397** times in `deep-survivor` and **397** in
`deep-autofire` = 794, read out of those two hook dumps myself.

## Does the code match the ROM? - every routine re-derived from rip/prg.asm

Read the listing for every address W24 cites and reconstructed each routine
before opening the impl. **All match.** The load-bearing details, verified:

* **jt_$982F (lines 2532-2548):** 16 `.word` entries, `$9A4D/$9A0E/$99E9/$99C0/
  $9982/$997E/$9904/$9B3E/$9BED/$9C12/$9C1E/$988C/$98DD/$98E5/$984F/$984F`. The
  port's `switch (substate & 0x0F)` cases 0-5 call the right routine; 6-15 throw
  with the right target. The `& 0x0F` masking is correct **only because** the
  `$96A5` ladder tests bit 4 (`$10`) *before* bit 7, so `$1B=$90` (set by the
  unported `$9904` next-stage route at `$9945`) routes to `$96CF`, never to
  playArm. I confirmed the port's `stagePlay` replicates this: `if (sub & 0x10)
  throw '$96CF'` runs BEFORE the `0x20/0x40/0x80` arms (nmi.js:320). So playArm
  only ever sees `$80-$8F` and `& 0x0F` is exact. `$83E4`'s `ASL A` was read in
  full (lines 702-720): it is a stack-trick indirect JMP, no mask; the table is
  indexed `(value & $7F) << 1`, which for `$80-$8F` is the low nibble × 2.
* **`$840C` (the 16-bit subtract-1, lines 735-745):** `EOR #$FF / SEC / ADC /
  STA / BCS skip / DEC hi`. So `$4C!=0` → `$4C-=1`, no borrow; `$4C==0` →
  `$4C:=$FF`, `$4D-=1`. The port's `st99E9` reproduces this exactly.
* **`st9A4D` / `st9A0E` / `st99E9` / `st99C0` / `st9982` / `sub994A` /
  `st997E` / `clearSpawnExt` / `gameOverArm` / `continueTimeout` /
  `enterGameOver`:** every constant, polarity, array base and INC/STA order
  checked against the listing. `$9A35` = `03 03 04 04 05 05 06 06` (+ the
  `$9A3D` bossPage tail) and `$9A45` = eight `$81`s, both byte-verified at
  prg.asm:2859-2860.
* **Infrastructure mappings, all confirmed in state.js/sound.js:** `ENEMY_BASE`
  = `$0C` (so the boss at `$0315` = slot 9+12 = 21), `BTN.START` = `$10`,
  `cam.lo`=`$3E` / `cam.hi`=`$3F`, `coll` = `$0500-$06FF` (so `$0600,X` =
  `coll[0x100+x]`), `SLOTS` = 32, `pulse1Dur` = `snd[OFF.DUR]` = `$B0`.

### The fall-through trap - read past every apparent end myself

* **`st997E` → `st9982` is the one the plan pre-charted, and it is genuinely
  dead.** `$9658 STA $5B` zeroes `$5B` on every mode-5 frame BEFORE the ladder
  (nmi.js:293, verified), nothing between `$9658` and the `$85` arm touches
  `$5B`, so `$997E INC $5B` makes it 1 and `BNE $99B7` is always taken. The
  fall-through into `$9982` would re-fire the boss spawn every 256 frames; it is
  correctly NOT ported. (Mutating the port to advance `$1B` from `$85` went RED
  - F11 below.)
* Every other W24 routine ends in an explicit `JMP $9A5E` / `JMP $9A5B` (→
  setBgm → `$9A5E`), and the port calls `mode5Body` after each. `$9A5B JSR $8357`
  is JSR+RTS, not a fall-through; modelled correctly.
* `sub994A` ends `RTS`; `gameOverArm`'s two non-throw tails (`$975D`,
  `$975B`→`$975D`) both `JMP $9A5E` via `codeMatch(0)`+body. All handled.
* **`clearSlot(state, 9)` is a faithful model of `$A8:=9; JSR $A527`:** I read
  `sub_A527` (lines 4548-4578) - it is *not* a free-slot search, it clears exactly
  the slot named by `$A8`. So the boss allocation is right, and the absolute
  `$0315/$0335/$0375` writes land in slot 9 after the clear.

## The deliberate breaks I ran (16 mutations, 13 RED, SHA-256-verified both ways)

`tools/w24-review-breaks.py` (scratch, not committed) applies one mutation at a
time, runs `w24-substate`+`flow`+`collision` (68 tests), restores, and asserts
the SHA matches baseline. Baseline files restored byte-identical (re-checked).

| # | mutation | result |
|---|---|---|
| 1 | `$80` exit `>=` → `>` (BCC polarity) | **RED** |
| 2 | `$81` `$4D` reads `rankCountdown[0]` not `[rank]` | **RED** |
| 3 | `$82` 16-bit borrow dropped (`$4C:=$FF` only, no DEC `$4D`) | **RED** |
| 4 | **`$82` zero-test reads only `$4C` (drops `\| $4D`)** | **GREEN - see F1** |
| 5 | **`$83` boundary `>=5` → `>=4`** | **GREEN - see F2** |
| 6 | `$84` BEQ polarity `===` → `!==` | **RED** |
| 7 | `$84` boss type `$98` → `$99` | **RED** |
| 8 | `$994A` guard `$D0` → `$D1` | **RED** |
| 9 | `$994A` guard `<` → `<=` (refuses at `$D0`) | **RED** |
| 10 | `$994A` object-clear bound `$14` → `$15` | **GREEN - the documented survivor (F3)** |
| 11 | `$85` dead fall-through implemented (advance `$1B`) | **RED** |
| 12 | `$96FB` `$B0` gate inverted | **RED** |
| 13 | `$9715` `$4C!=0` → `==0` | **RED** |
| 14 | `$97F1` `$1B := $C0` → `$C1` | **RED** |
| 15 | `$97F1` `$4C := $78` → `$77` | **RED** |
| 16 | `pulse1Dur` `OFF.DUR` → `OFF.OWNER` | **RED** |

The implementer's documented survivor (#12, the `$14`→`$15` object-clear bound)
reproduces exactly as GREEN: at cursor `$14` the object write targets slot
`12+$14=32`, which is past the end of the `Uint8Array(32)` object arrays
(`SLOTS=32`, confirmed), so it is a silent no-op. The guard stands on the
listing (`$9970 CPX #$14`), not on a test. Sound.

**The two GREEN survivors the implementer's table does NOT name are the
findings.** F1 is load-bearing.

---

## Findings

### F1 - (moderate) the `$82` countdown's zero-test half is unpinned: a mutant ending the timer 512 frames early passes every test

`st99E9` continues the countdown while `(zp4C | zp4D) !== 0`. Mutating that to
`(zp4C) !== 0` (dropping `| zp4D`) is GREEN on all 68 tests. The implementer's
mutation #4 broke the *borrow* direction (RED) and called it "the load-bearing
half" - but the *zero-test* direction is equally load-bearing: with only `$4C`
tested, the countdown ends the first frame `$4C` reaches 0 with `$4D` still
nonzero, i.e. after **256 frames instead of 768** at rank 1.

I confirmed the gap with a distinguishing probe (`$4C:$4D = $01:$01`):
```
REAL   substate=$82 (130), zp4C=0, zp4D=1   -- stays $82 ($4D nonzero)
MUTANT substate=$83 (131), zp4C=0, zp4D=1   -- advances early
```
This state is not exotic - the countdown passes through it three times at rank 1
(every time `$4C` wraps `$00→$FF` while `$4D>0`). No unit test drives it, because
the two `$82` tests use `$0002` (two frames, `$4D` always 0) and `$00:$01` (one
frame, after which `$4C=$FF`). The worklog also discloses that the in-situ `scen/`
field comparison for `$82` was **not** recorded - so the 768-frame duration rests
on the borrow test alone, and the zero-test is a check that cannot fail its test
(RULE 4: such a check is a decoration). The ported line is *correct* (verified
against `$99F2 LDA $4C / ORA $4D`); the verification is incomplete.

Fix: add a test that pre-sets `$4C:$4D = $01:$01`, runs one frame, and asserts
`substate` stays `$82` (and `$4C=0,$4D=1`). One assertion pins it.

### F2 - (minor/informational) the `$83` stage boundary `CMP #$05` is pinned only from above; stage-4 (normal) is untested

`st99C0` throws for `zp19 >= 5`. Mutating `>= 5` → `>= 4` is GREEN: the test
drives stage 0 (normal) and stages 5/6 (throw), but never stage 4, which on the
cartridge takes the normal path (`4 < 5`) and under the mutant would wrongly
throw. Same shape as the documented survivor: faithful transcription whose
mutant is silent because the distinguishing input (stage 4) is unreachable - the
port loads one stage, `$19` is always 0. Not a defect; recording it so the
`#$05` boundary is not read as a covered fact. (The implementer's mutation #7
pinned `$62:=2`, not this boundary.)

### F3 - (minor, test quality) the boss-handler assertion matches almost any throw in the port

`w24-substate.test.js:253`:
```js
assert.throws(() => nmi(s, 0, res), /undefined|handler|\$|Error/);  // boss handler W26
```
The alternation includes a literal `\$`, and **every** throw message in the port
carries a ROM address containing `$`. So this regex passes for essentially any
throw, not specifically the boss handler's. The throw itself is genuine - I ran
the `$84` advance path and got `unimplemented enemy handler $B914 for type $98
(entry 24 ...)` (census agrees: `24 $B914 THROWS`). But the test would not catch
a *wrong* throw (e.g. if the advance path threw at `$A527` instead of routing
type `$98` to entry 24). Tighten to `/handler \$B914|entry 24/` to pin it.

### F4 - (informational, already disclosed) the game-over window and states `$81-$85` are unit-tested only; no in-situ field comparison exists

Stated per RULE 2, and the worklog states it too. Confirming the boundary: the
44-scenario compare.mjs corpus does **not** include `deep-survivor`/`deep-
autofire` (those are `throwaudit.py` hook runs, not `scenarios.json` entries),
and `deep-powered` - the deepest compared scenario - holds `$1B=$80` for all
3099 frames. So no compared frame traverses `$81-$85` or `$C0`. This is
unavoidable for the game-over window as long as modes 0/4 are out of scope (the
port correctly throws at `$970D`/`$9751`, so a field comparison there is
impossible without porting those modes). The `$82`/`$84`/`$85` *durations* are
pinned against the cartridge gate dump to the frame (table above); the per-field
behaviour during those states is unit-tested only.

---

## Things I checked and found CORRECT (so nobody re-derives them)

* The `$96A5` ladder is five sequential bit-tests in the order `$10`,`$20`,
  `$40`, then `BPL` for bit 7 (prg.asm:2273-2285). The port's `stagePlay`
  reproduces the order, including the bit-4 `$96CF` throw (nmi.js:320). This is
  what makes `playArm`'s `& 0x0F` dispatch safe.
* `respawn()` returning `false` on game-over and `dyingArm` then calling
  `mode5Body` correctly models `$97F1 ... JMP $9A5E`; the normal-respawn `true`
  return correctly does NOT run the body (the intro takes over via `$9B3E`).
* `$5B` freezes the camera during `$82`: `mode5Body` gates `advanceCamera` on
  `zp15===0 && zp5B===0` (nmi.js:832, modelling `$9A98/$9A9C`), and `st99E9`'s
  `INC $5B` is what activates it. So the 768-frame countdown holds the camera.
* `enterGameOver`'s `$06EC,X := $18+$31` → `coll[0x1EC + p] = u8(p+0x31)`:
  `$06EC-$0500 = $1EC`, `X=p=$18`'s value. Correct for both players.
* `$96FB`'s `codeMatch(0)` models `$975D LDX #$00 / JSR $9765`; `codeMatch` is
  pre-existing and reads the pointer table at `$9785`. The CONTINUE
  (`$970D`/mode 4) and timeout-expired (`$9751`/mode 0) exits throw loudly.
* `flow.js`'s big diff (1282 lines) is CRLF churn: `git diff --ignore-cr-at-eol`
  shows the real change is ~60 lines (the `enterGameOver` body, `respawn` return
  value, `clearAhead`'s `$5E:=$3F`, `clearZeroPage`'s `$5E` clear). Nothing
  functional was rewritten wholesale.
* The two stale tests rewritten (`collision.test.js` `$97C1`→`$97F1`,
  `flow.test.js` ladder) match the ported throws.
