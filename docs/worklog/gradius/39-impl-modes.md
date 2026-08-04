# Wave 39 IMPLEMENTER — the `$80D4` game modes 0-4 and 6

status: IN PROGRESS
implementer, 2026-08-04

Brief: port the remaining `$80D4` game modes — title, attract, game-over. The
plan calls this "W36 — Title / attract / game-over modes 0-3, 6"
(`29-plan-whole-game.md`); W36 is taken, so this wave is 39.

---

## §0. THE OPEN QUESTION THE PLAN FLAGS — SETTLED, AND THE ANSWER IS "ONE"

`29-plan-whole-game.md` W36 names it in the same paragraph as the scope:

> The open dependency is the **`$882C`/`$8871` full-screen RLE loader**
> (the title/attract/GameOver screens; `00-plan.md` exclusions) — a recon item
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

so **`$8893` is a 2-entry INTERLEAVED word table** — the two words overlap on
the byte at `$8895`, which is why it is five bytes and not four — and `$8871` is
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
`$39`. What is still NOT done is emitting the 2304 `$2007` writes — see §11.

**What the answer costs this wave: nothing.** The loader's RAM side effects have
been ported since W4 (`src/flow.js fullScreenLoad`, reached from `$9B78`), and
`$8824` differs from `$882C` only in `$2D` and in WHICH nametable image is
pushed. Neither is state any mode reads. So the open dependency does not gate
the mode port; it gates the PICTURE, and the picture was already a named gap.

## §1. BASELINE — measured by me before any edit

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

## §2. THE MODE SWEEP, BEFORE ANY EDIT — 6 of 7 modes threw on frame 0

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

## §3. WHAT THE LISTING SAYS THE MODES ARE — and the plan was wrong AGAIN

`29-plan-whole-game.md` calls these "Title / attract / game-over modes 0-3, 6"
and `src/nmi.js` called them "the title/attract/continue/high-score screens".
**There is no game-over mode, no continue screen and no high-score entry in
`jt_80D4` at all.** Read straight off `$80E2`-`$8181`:

| $00 | ROM | what it actually is |
|---|---|---|
| 0 | `$80E2` | boot + the title screen SCROLLING IN, `$12` $FE -> 0 by twos, 127 frames |
| 1 | `$8116` | the title MENU: the cursor ship, and a 256-frame countdown |
| 2 | `$8121` | the ATTRACT DEMO — `$964D` is `JSR $9C6D` **falling into `$9650`** |
| 3 | `$8137` | START pressed: sfx `$90`, then 80 frames blinking the chosen line |
| 4 | `$8165` | `$1B := 0`, `INC $00`. Three instructions |
| 5 | `$9650` | PLAY |
| 6 | `$816C` | two RAM clears, `$03 &= $0F`, back to mode 0 |

GAME OVER is `$96FB`, a mode-5 sub-state, and it has been ported since W24.
CONTINUE is `$970D` inside it, which sets `$00 := 4` — so mode 4 is not a
"continue screen", it is the one handover both a fresh game and a continue use.
There is no high-score entry in this cartridge.

**The attract demo is the game.** `$964D`/`$9650` is fall-through number
nineteen, and it means mode 2 is a real mode-5 frame with `$05`/`$07`
overwritten from a script and `$09` set so scoring (`$846F`), the BGM change
(`$835E`) and pause (`$9ADA`) are all suppressed.

## §4. FALL-THROUGH NUMBER EIGHTEEN — `$8256` -> `$8279`, and it is load-bearing

```
8273  20 A1 82  JSR $82A1
8276  20 B6 82  JSR $82B6
      -- no RTS --
8279  A2 00  LDX #$00     <- sub_8279, xref'd from $8220 as a CALL
827B  86 4C  STX $4C / E8 INX / 86 4D STX $4D / 60
```

`$8256` does not end at `$8276`. It falls into `$8279` and seeds `$4C:$4D` with
`$0100` = 256 — **and that pair IS the title screen's length**, because `$8116`
16-bit-decrements it through `$819B`/`$840C` and hands over to the attract demo
at zero. Stop at the last JSR and the title menu never ends.

## §5. MODE 6 IS TRANSCRIBED AND NOTHING WRITES 6 TO `$00`

An enumeration, not an impression. Every writer of `$00` in the 32 KB:

* direct — `$8059` (:=0, RESET), `$818F` (:=0 from `$8135`/`$8131`, :=3 from
  `$8234`), `$8251` (:=1), `$852E` (:=0, the A+B service screen), `$9712` (:=4),
  `$9756` (:=0)
* `INC $00` — `$8186` only, and its four callers (`$810B $811E $8162 $8169`)
  reach it with `$00` = 0, 1, 3, 4, so it produces 1, 2, 4, 5
* `STA $00,X` — `$830E` (X = `$12`..`$EF`); `$8405`/`$8411` with X in
  {`$3E`,`$4C`,`$54`,`$6A`,`$A8`,`$AA`} — all nine call sites read
* `STA ($98),Y` — `$831F` (`$0300-$06FF`), `$8436` (`$0100-$017F` and
  `$0020-$0097`), `$802C` (RESET's `$0000-$07CF` wipe, writing 0)

It is ported anyway and it is deliberately NOT commented "unreachable" — three
"unreachable" comments on this project have turned out to be artefacts of
something else being unported. `tests/modes.test.js` pins the enumeration.

## §6. WHAT ELSE THE LISTING CORRECTED

* **`$07E1 = $50` (TOP = 50000) is RESET's, not the attract mode's.**
  `src/main.js` said "the 50000 the attract mode leaves" in TWO places for
  eleven waves. `$8052`/`$8054` writes it before the first NMI, and only on a
  COLD boot — `$8035`'s `$07F0-$07FF == $F0..$FF` signature check is how the
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

* `src/flow.js` — `fullScreenLoad` exported and given the `which` selector,
  `$8824` added as `titleScreenLoad`, `clearZeroPage` exported (it IS
  `$8424`'s second half, byte for byte).
* `src/state.js` — `$01 $03 $0B $0F $30 $31`, and the six mode constants.
* `src/nmi.js` — the `if (mode === 5) … else throw` replaced by `modeDispatch`.
* `src/main.js` — `resetState()`, and `boot()` now starts at `$8067`'s state
  (mode 0) instead of at mode 4's handover.
* `tools/export_assets.py` — three new flow blocks (`$8254`, `$82B4`,
  `$9CB7-$9D4E`) each with an opcode-anchored guard, and the demo script's
  extent WALKED rather than assumed (75 records then `FF FF`; the exporter
  aborts if it is not).

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
**GREEN — 12 passed, 0 failed, 0 SKIPPED**; `node --test games/gradius/tests/`
650 pass, 0 fail, 0 skipped.

(sections fill in as work lands)
