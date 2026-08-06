# Wave 39 IMPLEMENTER - the `$80D4` game modes 0-4 and 6

status: DONE
implementer, 2026-08-04
(agent 1 died on an API error after §0-§1; agent 2 wrote §2 onward)

Brief: port the remaining `$80D4` game modes - title, attract, game-over. The
plan calls this "W36 - Title / attract / game-over modes 0-3, 6"
(`29-plan-whole-game.md`); W36 is taken, so this wave is 39.

---

## §0. THE OPEN QUESTION THE PLAN FLAGS - SETTLED, AND THE ANSWER IS "ONE"

`29-plan-whole-game.md` W36 names it in the same paragraph as the scope:

> The open dependency is the **`$882C`/`$8871` full-screen RLE loader**
> (the title/attract/GameOver screens; `00-plan.md` exclusions) - a recon item
> at the top of the wave decides whether the loader is one shared routine or
> three.

**It is ONE routine with TWO entry points and a TWO-ENTRY pointer table, and it
loads two screens, not three.** Straight off the listing:

```
8824  A9 03 / 85 2D     $2D := 3
8828  A2 02  LDX #$02   -->  $882E          the TITLE/attract screen
882A  D0 02  BNE $882E
882C  A2 00  LDX #$00   -->  falls into $882E   the PLAYFIELD screen
882E  BD 93 88  LDA $8893,X / 85 9B
8833  BD 94 88  LDA $8894,X / 85 9C          $9B:$9C := the screen LIST
...
8845  PPUADDR := $2000
8856  six 2-byte pointers off that list (CPY #$0C), each JSR $8871
886E  JMP $81B5
```

with

```
8893:  78 8C  8C 8C  60
       X=0 -> $9B:$9C = ($8893, $8894) = $8C78
       X=2 -> $9B:$9C = ($8895, $8896) = $8C8C
```

so **`$8893` is a 2-entry INTERLEAVED word table** - the two words overlap on
the byte at `$8895`, which is why it is five bytes and not four - and `$8871` is
the single shared RLE decoder for both:

```
8871  LDY #$00
8873  LDA ($99),Y
      $34 -> RUN: count := next, value := next, X writes of value ($888B)
      $39 -> END of this chunk (RTS)
      else -> one literal to $2007
8880  INY / BNE $8873          <- 256 bytes max per chunk
```

**This retires `export_assets.py`'s NOT_EXPORTED line** *"The title screen's
nametable. `$8871` writes it at load time; its source table has not been
identified."* It is identified: `$8893` -> `$8C78` (playfield) and `$8C8C`
(title/attract), six chunk pointers each, RLE with escape `$34` and terminator
`$39`. What is still NOT done is emitting the 2304 `$2007` writes - see §11.

**What the answer costs this wave: nothing.** The loader's RAM side effects have
been ported since W4 (`src/flow.js fullScreenLoad`, reached from `$9B78`), and
`$8824` differs from `$882C` only in `$2D` and in WHICH nametable image is
pushed. Neither is state any mode reads. So the open dependency does not gate
the mode port; it gates the PICTURE, and the picture was already a named gap.

## §1. BASELINE - measured by me before any edit

`git HEAD 907f539`, `games/gradius/src` clean.

```
node games/gradius/tools/test-all.mjs   GREEN -- 12 passed, 0 failed, 0 SKIPPED
    ... and the same 6 FIELD-level skips inside compare.mjs the gate line does
    NOT mention: pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins.
47 scenarios, 29,657 of 29,657 frames compared, 0 failures
node --test games/gradius/tests/   650 pass, 0 fail, 0 skipped
```

Re-confirmed by the SECOND agent (this one) at `git HEAD 33e0454`, tree clean
apart from the salvaged worklog: `node --test games/gradius/tests/` 650 pass,
0 fail, 0 skipped. §1 stands.

## §2. THE MODE SWEEP, BEFORE ANY EDIT - 6 of 7 modes threw on frame 0

Rule 1 of the brief, done first. `scratchpad/w39sweep.mjs` seeds `$00` and `$01`
and runs frames until something throws.

| mode | before | note |
|---|---|---|
| 0 `$80E2` | THREW f0 `$80D1` | the W28b loudness throw, all three `$01` seeds |
| 1 `$8116` | THREW f0 `$80D1` | " |
| 2 `$8121` | THREW f0 `$80D1` | " |
| 3 `$8137` | THREW f0 `$80D1` | " |
| 4 `$8165` | THREW f0 `$80D1` | " |
| 5 `$9650` | THREW f0 `$C3AD` | **PRE-EXISTING, and not a mode defect**: a bare `createState()` has `$1B = $80` (PLAY) and `$0360 = 0`, i.e. a play frame with no ship. Reproduces identically at `git HEAD` before this wave's first edit |
| 6 `$816C` | THREW f0 `$80D1` | the loudness throw |

So the whole sweep before the wave is ONE pre-existing throw and six instances
of the same deliberate one. Nothing else predates me at the mode level. The two
open findings the brief names (`$1B = $83` on a null wave cursor; `$B7B5`
->`$B797`'s table extent) are elsewhere and unchanged.

## §3. WHAT THE LISTING SAYS THE MODES ARE - and the plan was wrong AGAIN

`29-plan-whole-game.md` calls these "Title / attract / game-over modes 0-3, 6"
and `src/nmi.js` called them "the title/attract/continue/high-score screens".
**There is no game-over mode, no continue screen and no high-score entry in
`jt_80D4` at all.** Read straight off `$80E2`-`$8181`:

| $00 | ROM | what it actually is |
|---|---|---|
| 0 | `$80E2` | boot + the title screen SCROLLING IN, `$12` $FE -> 0 by twos, 127 frames |
| 1 | `$8116` | the title MENU: the cursor ship, and a 256-frame countdown |
| 2 | `$8121` | the ATTRACT DEMO - `$964D` is `JSR $9C6D` **falling into `$9650`** |
| 3 | `$8137` | START pressed: sfx `$90`, then 80 frames blinking the chosen line |
| 4 | `$8165` | `$1B := 0`, `INC $00`. Three instructions |
| 5 | `$9650` | PLAY |
| 6 | `$816C` | two RAM clears, `$03 &= $0F`, back to mode 0 |

GAME OVER is `$96FB`, a mode-5 sub-state, and it has been ported since W24.
CONTINUE is `$970D` inside it, which sets `$00 := 4` - so mode 4 is not a
"continue screen", it is the one handover both a fresh game and a continue use.
There is no high-score entry in this cartridge.

**The attract demo is the game.** `$964D`/`$9650` is fall-through number
nineteen, and it means mode 2 is a real mode-5 frame with `$05`/`$07`
overwritten from a script and `$09` set so scoring (`$846F`), the BGM change
(`$835E`) and pause (`$9ADA`) are all suppressed.

## §4. FALL-THROUGH NUMBER EIGHTEEN - `$8256` -> `$8279`, and it is load-bearing

```
8273  20 A1 82  JSR $82A1
8276  20 B6 82  JSR $82B6
      -- no RTS --
8279  A2 00  LDX #$00     <- sub_8279, xref'd from $8220 as a CALL
827B  86 4C  STX $4C / E8 INX / 86 4D STX $4D / 60
```

`$8256` does not end at `$8276`. It falls into `$8279` and seeds `$4C:$4D` with
`$0100` = 256 - **and that pair IS the title screen's length**, because `$8116`
16-bit-decrements it through `$819B`/`$840C` and hands over to the attract demo
at zero. Stop at the last JSR and the title menu never ends.

## §5. MODE 6 IS TRANSCRIBED AND NOTHING WRITES 6 TO `$00`

An enumeration, not an impression. Every writer of `$00` in the 32 KB:

* direct - `$8059` (:=0, RESET), `$818F` (:=0 from `$8135`/`$8131`, :=3 from
  `$8234`), `$8251` (:=1), `$852E` (:=0, the A+B service screen), `$9712` (:=4),
  `$9756` (:=0)
* `INC $00` - `$8186` only, and its four callers (`$810B $811E $8162 $8169`)
  reach it with `$00` = 0, 1, 3, 4, so it produces 1, 2, 4, 5
* `STA $00,X` - `$830E` (X = `$12`..`$EF`); `$8405`/`$8411` with X in
  {`$3E`,`$4C`,`$54`,`$6A`,`$A8`,`$AA`} - all nine call sites read
* `STA ($98),Y` - `$831F` (`$0300-$06FF`), `$8436` (`$0100-$017F` and
  `$0020-$0097`), `$802C` (RESET's `$0000-$07CF` wipe, writing 0)

It is ported anyway and it is deliberately NOT commented "unreachable" - three
"unreachable" comments on this project have turned out to be artefacts of
something else being unported. `tests/modes.test.js` pins the enumeration.

## §6. WHAT ELSE THE LISTING CORRECTED

* **`$07E1 = $50` (TOP = 50000) is RESET's, not the attract mode's.**
  `src/main.js` said "the 50000 the attract mode leaves" in TWO places for
  eleven waves. `$8052`/`$8054` writes it before the first NMI, and only on a
  COLD boot - `$8035`'s `$07F0-$07FF == $F0..$FF` signature check is how the
  cartridge keeps a high score across a soft reset.
* **`$14` has no reader.** `EOR $14` at `$81E7` and `STA $14` at `$81E9` are the
  only two instructions in the PRG that name it (full opcode scan). No port
  field needed, and `$8307`'s wipe has nothing to clear there.
* **`$07EC-$07EF` has no reader either.** `$82D5`'s 12-byte clear from `$07E4`
  is the only instruction that touches them; the port's score array is
  `$07E0-$07EB` and stays that size.
* **`$8893` is a two-entry INTERLEAVED word table** (§0). `export_assets.py`'s
  NOT_EXPORTED line "its source table has not been identified" is retired and
  replaced with what IS still missing: the 2304 decoded bytes per image.

## §7. WHAT LANDED

New: `src/modes.js` (the six handlers, `$821A`, `$8256`, `$8279`, `$82A1`,
`$82B6`, `$82C7`, `$82D5`, `$8307`, `$8418`, `$8424`, `$819B`, `$8186`/`$8188`/
`$818F`, `$9C5E`, `$9C6D`/`$9C88`/`$9CB1`, and `$80C0`-`$80D1`).

* `src/flow.js` - `fullScreenLoad` exported and given the `which` selector,
  `$8824` added as `titleScreenLoad`, `clearZeroPage` exported (it IS
  `$8424`'s second half, byte for byte).
* `src/state.js` - `$01 $03 $0B $0F $30 $31`, and the six mode constants.
* `src/nmi.js` - the `if (mode === 5) … else throw` replaced by `modeDispatch`.
* `src/main.js` - `resetState()`, and `boot()` now starts at `$8067`'s state
  (mode 0) instead of at mode 4's handover.
* `tools/export_assets.py` - four new flow blocks (`$8254`, `$82B4`, `$9749`,
  `$9CB7-$9D4E`) each with an opcode-anchored guard, and the demo script's
  extent WALKED rather than assumed (75 records then `FF FF`; the exporter
  aborts if it is not). `flow/tables.json` goes from 2 ranges to 6.
* `tools/oracle/stagesweep.mjs` - three of the four DECIDED excuses deleted,
  because the paths they excused now run; `$97C5` added, which was reachable
  before and had no entry.

A SECOND COMMIT (see §9) then ported the four mode-5 tails that LEAVE mode 5:
`$9805` (the demo's game over), `$970D` (CONTINUE -> mode 4), `$9721` (the
continue cheat) and `$9751` (the restart to title). All four were throws for one
reason only -- the modes they jump to did not exist -- and `$9751` is the one
HANDOVER.md called "the crash a real player reaches". `$97DD` was factored out
of `respawn()` because `$9746` jumps straight to it.

## §8. THE SWEEP AFTER

Same harness, 900 frames per seed:

```
  mode 0 $01=0/1/2   clean 900f (mode now 2)     boot -> title -> attract
  mode 1 $01=0/1/2   clean 900f (mode now 2)
  mode 2 $01=0       clean 900f (mode now 2)
  mode 2 $01=1/2     THREW f0 $C3AD    <- the PRE-EXISTING null-ship seed, §2
  mode 3 $01=0/1/2   clean 900f (mode now 5)     start -> handover -> PLAY
  mode 4 $01=0/1/2   clean 900f (mode now 5)
  mode 5 $01=0/1/2   THREW f0 $C3AD    <- the PRE-EXISTING null-ship seed, §2
  mode 6 $01=0/1/2   clean 900f (mode now 2)
```

The two remaining throws are the same one the sweep found BEFORE any edit, and
they are a property of seeding a bare `createState()` into a play frame, not of
this wave. Reached from a real boot (`§9`) neither occurs.

status of the gate at this point: `node games/gradius/tools/test-all.mjs`
**GREEN - 12 passed, 0 failed, 0 SKIPPED**; `node --test games/gradius/tests/`
650 pass, 0 fail, 0 skipped.

## §9. THE CARTRIDGE COMPARISON - the first one of any mode but 5

This is the part of the wave that could have gone either way, and it is the only
evidence here that is not port-vs-listing.

`gameover` is a real 12,000-frame cartridge dump. It carried
`compareUntilThrow: "9751"` and stopped at the restart to title, because mode 0
did not exist. With the modes in, the annotation went **stale by design** - the
gate says so in as many words:

```
[FAIL] THREW at 9751: did NOT throw over 599 compared frames
       -- 9751 may have been ported; re-measure
```

Promoted, the scenario runs to the end of its window and reports

```
=== gameover === 599 of 599 compared frames (align 3800)
    [PASS] TIER 1: 800 fields, 0 divergent
    lag: cartridge 5 total, 1 inside the compared window; port 1  [PASS]
```

**`$00` is in the watch list.** So the game mode itself is compared frame for
frame across `$9751`, mode 0's two full-screen loads, and all 127 frames of the
title scroll, and it agrees on every one of them. Nothing else in this wave
comes close to that as evidence.

### What the promotion FOUND - a real defect, and it was mine to inherit

The first promoted run was not clean. **One** field diverged:

```
lagged: FIRST divergence at frame 4365 (1/599 frames differ)
       f4364  rom  1   port  1
    >> f4365  rom  0   port  1
```

`src/flow.js fullScreenLoad()` set `state.frameDrops = 1` unconditionally, with
the comment *"the cartridge's own work overran this frame's vblank on every
measured run"*. The cartridge says otherwise, twice:

* **f4364** - `$9751`'s `JSR $9B3E`, ONE full-screen load (2304 `$2007` writes).
  The cartridge drops an NMI. rom 1.
* **f4365** - mode 0 phase 0, `$80E6 JSR $882C` **and** `$8256`'s
  `JSR $8824`. TWO loads, 4608 writes, twice the work. **rom 0.**

and W11 had already found a third counter-example (`enemy-bullets-full`'s
respawn at f614 does not drop, while its two siblings at f617/f621 do) and
written *"do NOT 'fix' this by making frameDrops conditional on something
plausible"*.

I did not invent a condition. The constant **moved to the call site**: `$9B78`
keeps it, with all four measurements listed above it, and `$80E6` does not,
because the cartridge is measured not to drop there. That is a measurement per
call site, not a rule - and `tests/modes.test.js` pins both halves, so the
mutant that puts the drop back in mode 0 goes red.

### The video excuse, re-derived rather than listed

`compareVideo()` excuses the nametable exactly when the cartridge ran a
full-screen load in the window, and the derivation was `$1B in {1,2,3,4}`. That
was complete while `$882C` could only be reached from the stage intro. It is not
any more: mode 0 loads two screens and `$1B` is 0 the whole time. Worse, **the
`$9751` frame itself samples `$1B = 0`** - `$9B3E` INCs it to 1 at `$9B76` and
`$9758` puts it straight back - so the intro set never sees that load either.

The derivation is now `$1B in {1,2,3,4}` **OR `$00 == 0`**, still read off the
oracle's own bytes and still not a list of scenario names. `knownFail` stays
empty.

## §10. THE MUTATION TABLE

Method: 90 single-edit mutants across `src/modes.js`, `src/flow.js` and
`src/nmi.js`; after each, `node --test` over `modes.test.js`,
`w24-substate.test.js`, `collision.test.js`, `flow.test.js` and
`frame-gates.test.js`; then restore and **verify the file is byte-identical by
SHA-256 both ways** (the harness asserts it and would abort the run otherwise).
Baseline confirmed green before the first mutant.

### The result

| | round 1 | round 2 | round 3 | final |
|---|---|---|---|---|
| RED | 72 | +13 | +3 | **88** |
| SURVIVED | 14 | 2 | 0 | **2** |
| HUNG | 0 | 0 | 0 | 0 |
| bad find-string | 4 | 3 | 0 | 0 |

Round 2 re-ran the 14 survivors against a suite strengthened to close them;
round 3 re-ran the three whose find-strings had missed (CRLF, and one comment
I had mistyped). **88 of 90 single-edit mutants are caught by a NAMED test.**

### The two survivors, and both are (c) PROVABLY UNCATCHABLE

**1. `$82C7`'s save and restore of `$0A` around the wipe.**

```
82C7  A5 0A / 48     PHA
82CA  20 07 83       JSR $8307
82CD  68 / 85 0A     PLA / STA $0A
```

`$8307` is `LDX #$12 ... CPX #$F0`, so it clears `$0012-$00EF`. **`$0A` is below
`$12` and the wipe never touches it.** The cartridge's own PHA/PLA is redundant,
and no state the machine can be in distinguishes the store from its absence.
Ported anyway; reported here rather than defended with a test that only agrees
with itself.

**2. `$8824`'s `$2D := 3`.**

Its one caller (`$8256`) sets `$2D = 3` four instructions earlier at `$8259`, and
`$8263`'s `JSR $8424` clears it two instructions later, and `$80EC`/`$8111` set
it again on every mode-0 and mode-1 frame. The value written here is overwritten
on every path, in both directions. The code comment says so at the line.

### What round 1 found that was not a mutant at all

**THE FIRST MUTANT HUNG THE SUITE INSTEAD OF REDDENING IT.** `advanceMode`'s
`INC` deleted means mode 0 never advances, and three of my own tests waited for
a transition with an unbounded `while (s.mode === 0) nmi(...)`. A hang reads as
"still running", which is how a mutation run silently stops covering everything
after mutant 0 -- I noticed only because the file on disk still held mutant 0
twelve minutes in.

Fixed both ends: every wait in `tests/modes.test.js` now goes through
`until(s, done, cap, what)`, which **fails** with the machine's state rather than
spinning, and the harness treats a 240-second suite as `HUNG` rather than as a
pass. Final run: 0 HUNG.

### The thirteen suite holes round 1 exposed, and what closed each

| mutant | why it survived | the check that closes it |
|---|---|---|
| `$818A` drop `$0B := 0` | the mode sequence 0,1,2,0,1 is the same whether the demo lasts 3239 frames or 1 | the cycle test now runs TWO attract laps and compares their LENGTHS |
| `$812F` invert the `$0B` test | same | same |
| `$812A` drop the demo joystick | the demo ship still dies eventually, so `$9805` still ends it | the cycle test asserts `$31` walked the script |
| `$8307` drop the `$0300-$06FF` clear | nothing looked at those pages | `$82C7`'s test now seeds `$0307`, `$0500` and `$06FF` |
| `$82B6` drop packet 1 | nothing looked at the queue | a whole-queue comparison against `queueOf([6,4,3,2,1])` |
| `$82B6` index `$A0` not `$A0+1` | same | same |
| `$80FF` drop the palette packet | same | a new per-scroll-frame queue check |
| `$814B` packet `$0F` not `1 + $0F` | packets 0 and 1 share their first byte, and the test only read the first byte | the blink test now compares the WHOLE queue, for `$0F` = 0 AND 1 |
| `$8165` drop `$1B := 0` | both live routes into mode 4 run `$82D5`, whose wipe already zeroed `$1B` | a direct `st8165()` call with `$1B = $77`, and the docstring says why it has to be direct |
| `$82E2` drop `$09 := 0` | `$09` was already 0 in the seed | `newGame()` driven with `$09 = 5` |
| `$9CA1` store `$30` after the `CMP` | only differs on the terminator record, whose `$30` nothing reads | the terminator test now pins the STORE, and says it is pinning a store |
| `$9C8D` drop `prev := b` | nothing read the next frame's edge basis | the demo test now asserts `$05`, `$07` and `prev` all take the script byte |
| `$8424` drop `$31 := 0` | (find-string typo, not a real survivor) | already covered by the mode-6 test |

## §11. WHAT I COULD NOT REACH, AND WHAT I LEFT

* **`$8871`'s 2304 `$2007` writes per image.** Identified (§0) and still not
  emitted. This is now the ONLY thing between the port and a real title screen:
  everything that reaches the picture through the `$0700` queue -- the palette
  (packet 6), the four text lines (packets 4,3,2,1) and the cursor ship -- does
  arrive, because those producers have existed since W2. The logo does not.
* **`$97C5`, the two-player continue switch.** Still a throw, and now the last
  one on the game-over path. It ends `STX $18` with X = 1, which is the one
  value `playerIndex()` refuses. Unreachable with one player (`$97F9` clears the
  only bit `$974D` tests), and selecting 2 PLAYERS on the menu is a route into
  it -- transcribed WITHOUT a clamp, per the brief.
* **`$9B10`'s pause cheat.** `$9C5E`'s body is ported (the demo needs it) but
  `$9B10`'s caller is still a throw and `tests/flow.test.js` still pins it. Left
  alone on purpose: it is the cheat's CONSEQUENCES (`DEC $3B,X`, `$33 := 0`, and
  what a live cheat does to a compared run) that are unexercised, not the four
  stores. Named here so the next wave does not have to rediscover it.
* **`$9C7D` CANNOT FIRE THROUGH THE MODE-2 ROUTE, and that is a finding, not a
  port defect.** `$9C79 LDA $05 / AND #$30 / BNE $9CB1` looks like "the player
  interrupts the demo" and cannot be: `$80C0` runs `$821A` on every mode-2 frame
  (mode < 3, and `$03` is 0 throughout the attract loop because `$80F4` clears
  it), so a START or SELECT edge is consumed at `$8248` and the frame never
  reaches `$8121` at all. `$80CF`'s re-read of `$00` is what makes that
  immediate. The ONE frame where `$03` still holds `$40` in mode 0 is the frame
  after `$9751`, and that is mode 0, not mode 2. Transcribed and exercised by
  calling `demoInput()` directly; NOT reachable through `nmi()`, and the test
  says so.
* **`$824A STA $0E` is provably uncatchable.** `$80CC` is reached from `$80AA`,
  and `$8099` -- twelve instructions earlier in the same NMI -- ran the drainer,
  whose `$8A7B` already stored 0 in `$0E`. No frame the cartridge can produce
  distinguishes the store from its absence. Ported; reported as uncatchable
  rather than dressed up in a passing test.
* **`$09` INCREMENTS ACROSS ATTRACT LAPS and nothing resets it.** `$82D2` is an
  `INC`, `$8307`'s wipe starts at `$12` and `$8424`'s at `$20`, so a machine left
  on the attract loop counts 1, 2, 3, ... MEASURED over 9,000 port frames: three
  complete laps, `$09` = 1, 2, 3. After 256 laps (~4.3 hours) it wraps to 0 and
  the next demo would score, change the BGM and be pausable. That is the
  cartridge's, transcribed, and I have not reproduced it on the board.
* **No cartridge comparison of modes 1, 2, 3, 4 or 6.** `gameover`'s window
  covers `$9751` and mode 0 only. The rest is port-vs-listing.
* **`stagesweep.mjs`'s DECIDED list went from four entries to two.** `$9751`,
  `$970D` and `$9721` were all "mode 0 / mode 4 is not ported" and all three now
  run, so the excuses are deleted rather than kept. `$9B10` stays, and `$97C5`
  is added -- it was reachable before and simply had no entry.

## §12. THE MEASUREMENT THE BRIEF ASKS FOR

**Which modes now run:** all seven `jt_80D4` entries. A passive boot from
`resetState()` walks 0 -> 1 -> 2 -> 0 -> 1 -> 2 unattended, three complete
attract laps in 9,000 frames; pressing START on the menu walks 1 -> 3 -> 4 -> 5
and reaches PLAY 27 intro frames later; losing the last life walks
5 -> `$96FB` -> (397 frames) -> `$9751` -> 0 -> 1 -> 2.

**Sweep, before:** 6 of 7 modes threw on frame 0, all at `$80D1` (the W28b
loudness throw). The seventh (mode 5) threw at `$C3AD`, which is a property of
seeding a bare `createState()` into a play frame and reproduces at `git HEAD`
before this wave's first edit.

**Sweep, after:** every mode runs clean for 900 frames from a valid seed. The
only remaining throws in the harness are the same pre-existing `$C3AD` on the
two seeds that skip `$82C7`'s RAM wipe.

**Gate:** `node games/gradius/tools/test-all.mjs` -> **GREEN, 12 passed, 0
failed, 0 SKIPPED**. `node --test games/gradius/tests/` -> **682 pass, 0 fail,
0 skipped** (650 before; +32 in `tests/modes.test.js`). compare.mjs: 47
scenarios, **29,693 of 29,693 frames, 0 failures** (29,657 before -- the
`gameover` scenario is 36 frames longer because it no longer stops at `$9751`).
`stagesweep.mjs`: 110 chunk runs, 154,000 frames, **0 undecided throws on 7
admitted stages** -- with three of its four DECIDED excuses now deleted.

**Field-level skips, reported separately as the brief requires:** the same SIX
inside compare.mjs that the gate line does not mention -- `pad2 oamBudget
spriteOverflow scanline cpuCycle splitSpins`. Unchanged by this wave. Gate-level
skips: **0**.

**One transient skip, chased and not reproduced.** A single `node --test` run
mid-wave reported `681 pass, 1 skipped` -- `tests/ppu.test.js`'s `f2600` capture
(`helpers.js captureSkipMessage`). Every run before and after reports
`682 pass, 0 skipped`, and the capture directory is complete. It is a
ROM-DERIVED, gitignored artifact and the most likely cause is that the run raced
`rendergate.py` writing into that same directory from the gate. **Recorded
rather than dismissed**: a skip that appears once is exactly the shape this
project has shipped a green run on before, and if it comes back the next agent
should suspect that race first.

## §13. LOOSE ENDS FOR THE NEXT WAVE

1. **Emit `$8871`.** Both chunk lists are identified; what is needed is the
   decoder's 2304 bytes per image into `assets/` and `fullScreenLoad()` writing
   them. It would close the `gameover` scenario's nametable knownFail AND give
   the port a title screen.
2. **A cartridge scenario for the ATTRACT DEMO.** The demo is deterministic --
   a 75-record script and a wiped RAM -- so it is the cheapest new oracle window
   in the game and it would compare modes 1, 2 and 3 in one run. The port's own
   lap is 3,239 frames.
3. **`$97C5`** (above), and **`$9B10`** (above).
