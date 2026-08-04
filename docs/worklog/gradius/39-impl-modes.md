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

(sections fill in as work lands)
