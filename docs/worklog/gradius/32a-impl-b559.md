# Wave 32a IMPLEMENTER -- `$B559` (dispatch entry 29), stage 5's first two chunks

status: IN PROGRESS
implementer, 2026-08-04

Scope, from the brief and `32-recon-destructible-terrain.md` §8: **W32a only.**
Port `$B559` (16 bytes, entry 29), which shares its body with `$B4FD` via
`$B55C BPL $B502`. NOT W32b (the `$0600` arm substrate + the `$9663` half-rate
frame fork) and NOT W32c (the three interaction routines). If `$B559` drags
either in, STOP and report.

---

## BASELINE, MEASURED BEFORE ANY EDIT

`python games/gradius/tools/oracle/stageledger.py` (the brief's path
`games/gradius/tools/stageledger.py` does not exist -- the tool lives under
`tools/oracle/`; the same correction W30 and W31 both had to make):

```
stage  distinct  ported   unported  inline5  ported %     first unported
0      92        92       0         0        100.0        NONE (shipped)
1      93        93       0         0        100.0        NONE (shipped)
2      78        78       0         45       100.0        NONE (shipped)
3      98        98       0         0        100.0        NONE (shipped)
4      28        14       14        4        50.0         scroll $0000  (@$ABB6)   <-- MY STAGE
5      98        47       51        0        48.0         scroll $03B0  (@$AC2E)
6      111       104      7         0        93.7         scroll $0CC0  (@$AD98)
ALL    598       526      72        49       88.0

PER-STAGE RUNNABILITY
4      THROWS (scope guard)   $C653 THROWS          blocked
```

Stage `$19 = 4` (in-game stage 5): **14 of 28, first unported at scroll `$0000`
(`@$ABB6`)**. Recon §4c predicted exactly this.

---

## HEADLINE (written early so an interrupted run still says something)

1. **`$B559` is ported.** Ledger stage 4: **14/28 → 24/28**, first unported
   **`$0000` (`@$ABB6`) → `$0480` (`@$ABE8`)**, which is the first of the four
   inline-5 arm records — exactly the boundary the recon predicted, at exactly
   the scroll it predicted.
2. **THE SCENARIO DID NOT MATERIALISE, AND IT COULD NOT HAVE.** The recon's
   W32a done-when says "a stage-5 scenario runs from scroll `$0000`". It cannot,
   and the reason is in the listing rather than in the run: **the scope guard is
   not stage 5's first wall, it is the LAST of five.** §4 below.
3. **The ledger's first-unported column was reporting the WRONG SCROLL for any
   record reached from more than one chunk**, and had been since W28. Fixed, with
   a check that can fail. §5.
4. **`$9A76 JSR $C772` had no call site in the port at all** — a comment and
   nothing else. It is covered today only by a throw W32b is going to delete.
   Made loud. §4.

---

## THE ROUTINE, TRANSCRIBED

```
st_B559:                          16 bytes, 6 instructions, $B559-$B568
  B559  BD 0C 03  LDA $030C,X
  B55C  10 A4     BPL $B502       <- BACKWARD 87 bytes, into $B4FD's body
  B55E  A0 09     LDY #$09
  B560  20 28 B6  JSR $B628       the shared animator, ROW 9
  B563  DE 6C 03  DEC $036C,X     one pixel left, every frame
  B566  4C 51 B2  JMP $B251       the off-screen box (may FREE the slot)
```

Entry 29 of `$AE1C`, types `$1D`/`$9D`. **Ten of stage 5's 28 distinct records**
are type `$1D` — every record in chunks 0 and 1, i.e. the whole of scroll
`$0000`-`$047F` (`$ABB6 $ABB8 $ABC2 $ABC4 $ABCE $ABD0 $ABD3 $ABD5 $ABDF $ABE1`,
decoded out of `assets/prg.bin` this session; all ten have descriptor byte 0 =
`$00`, so `status` is 0 and `$ADE8 BEQ $AE14` skips the `$ADC1` status animator
entirely — `$012C` is driven by `$B628` alone).

### READING PAST THE APPARENT END -- what I checked

* **`$B566` is a `JMP`, so nothing falls out.** `$B569` is `st_B569` (entry 30,
  stage 7's) and its only xref is `$AE19`, the dispatch. It is never fallen into.
  The routine really is 16 bytes.
* **`$B55C BPL $B502` is a BACKWARD branch into the MIDDLE of entry 28**, which
  begins 92 bytes earlier. This is the fall-through family's shape for the
  fifteenth time on this project — and the first time it was caught *before* the
  port was written, because W30/W31 had already factored `loc_B502` out for
  exactly this. The port re-uses it and does not re-transcribe it.
* **`sub_B628` with Y = 9 reads `$B659`/`$B65A`/`$B65B`.** `$B650`'s table is
  TWELVE bytes (`$B650`-`$B65B`) and `$B65C` is code (`loc_B65C`), so **Y = 9 is
  the last row that fits and there is no overrun.**
* **`loc_B502` ends at `$B50F RTS`**; `$B510` is `loc_B510` whose only xref is
  `$B500`. Not a fall-through.
* **`$B251` (`offScreenCheck`) and `$B0B4` (`setInitialised`)** were already
  ported and unchanged by this wave.

### THE TWO TRAPS, both of which the tests pin

| | `$B4FD` (entry 28, stage 3) | `$B559` (entry 29, stage 5) |
|---|---|---|
| animator row | Y = 3 → `$B653`/`$B654`/`$B655` = **`$08` / `$4A` / `$08`** | Y = 9 → `$B659`/`$B65A`/`$B65B` = **`$08` / `$52` / `$06`** |
| the box | `$B518 **JSR** $B251`, and the routine KEEPS GOING on a freed slot | `$B566 **JMP** $B251` — nothing follows |
| body | a four-phase lander (`$046C` 0-4, `$04AC` countdown) | animate + move + box, nothing else |

**The thresholds are EQUAL.** A port that used row 3 would keep the right
cadence — one step every eight frames — and show the wrong sprite for the wrong
number of frames. No timing check can see that, which is why test 5 asserts the
`$012C` SEQUENCE and not a count.

**`loc_B502` writes two fields `$B559` never reads.** `$048C := $80` and
`$04AC := $14` exist for `$B4FD`'s phase machine. Transcribed because the
cartridge writes them and they are observable in RAM, not because they do
anything here. Test 3 asserts they then stay put for 20 frames, which is what a
delegation to `h_B4FD` would break.

**A cartridge detail that corrected my own first draft:** the first metasprite a
fresh `$1D` shows is **`$53`, not the base `$52`**. `$B633 LDA $016C,X / CLC /
ADC #$01` increments the frame FIRST, `$B640` stores it, and only then `$B644
ADC $B651,Y` adds the base — so frame 0 (= `$52`) is reached only after the
count-`$06` wrap. My first test expected `$52` first and went red against the
port, and the ROM said the port was right.

---

## §4. THE FINDING THAT KILLED THE SCENARIO -- five walls, not one

The recon's W32a done-when is *"a stage-5 scenario runs from scroll `$0000`"*.
It cannot, and this is a listing result, not a failed experiment.

`runEngine`'s scope guard (`if (stageIndex >= 4) throw`) is the wall W31 moved
forward one stage at a time, and the natural W32a move is to lower it to `>= 5`.
**That would buy nothing.** FOUR other stage-5 gates fire *unconditionally*,
every frame, before the spawn engine reads a single wave record — and every one
of them walks the four `$0600` arm-group headers:

| ROM | port | gate | fires |
|---|---|---|---|
| `$9663` | `src/nmi.js` throws | `$9663 LDA $19 / CMP #$04 / BNE $96A5` | every mode-5 frame |
| `$8B8D` → `$8BD9` | `src/oam.js` throws | `$8B8D LDA $19 / CMP #$04 / BEQ $8BD9` | every sprite pass, and it runs at `$80A7`, AHEAD of the state machine |
| `$C25D` → `$C267` | `src/collision.js` throws | `$C25D LDA $19 / CMP #$04 / BNE $C2A5` | every collision frame |
| `$9A76` → `$C772` → `$CB8A` | **NO CALL SITE AT ALL** | `$C772 LDA $19 / CMP #$04 / BNE $C77B` | every play frame |
| `$C037` → `$BEF3` | `src/collision.js` throws | `$C037` + `$0123,X != 0` | whenever a shot is alive |

All five are "walk the four group headers and do nothing when they are 0" loops.
Porting the empty-walk half of each is ~200 bytes of **half-ported subsystem**,
which the brief names as the thing to stop for. **So I did not lower the guard**,
and that is a decision with a measurement behind it rather than caution: lowering
it would move the crash from a wave record to `$9663` while making
`stageledger.py`'s runnability column print stage 5 as "admitted" — the exact lie
W31 built that column to kill.

### `$9A76 JSR $C772` WAS A SILENT GAP WEARING A COMMENT

`src/nmi.js` had, at the `$9A76` position, a comment and *nothing else*: no call,
no throw. It is COVERED today (not silent) because `$9663` throws first — but it
is covered by **the very throw W32b deletes**. The moment W32b ports the `$5C`
census, `$CB8A`/`$CB91` (the arm driver, its `$5C >= 2` skip, the `$CBCA` fire
timer and `$CBD1`) becomes a genuine quiet no-op with nothing left to announce
it. **Made loud this wave** so W32b's own gate cannot pass without wiring it.
Mutant M15 (neuter the new guard) reddens check 12.

### What this changes about W32b's estimate

Nothing about the fork's SIZE, but it moves an item off "later" onto "first":
W32b cannot ship `$9663` alone. The four walkers are a package — the first frame
of stage 5 needs all four present, even if all four do nothing.

`$5C` and `$B559`: **no interaction.** `$B559` reads and writes only `$030C`,
`$012C`, `$014C`, `$016C`, `$036C`, `$048C`, `$04AC` and `$A8`. `$5C`'s five
instruction sites (`$965A $9683 $9A5E $C04B $CB8A`) are all outside it. So the
brief's question 1 answers cleanly: W32b's estimate is unchanged by this wave.

---

## §5. THE LEDGER WAS REPORTING THE WRONG SCROLL, AND HAD BEEN SINCE W28

The recon predicted the first-unported record would move to **scroll `$0480`**.
After the port the ledger printed **`$0C80`**. The port was right and the tool
was wrong.

`_stage_records()` keys records by ROM address (the honest denominator — chunk
streams share tails) and did `recs[p] = r`. **Chunk POINTERS are shared too**:
stage 5's chunks 2, 3, 4, 5 and 6 are all the same pointer `$ABE8`, so the record
was written five times and the LAST chunk's scroll won. Decoded out of
`assets/prg.bin` this session:

```
chunk 2 -> $ABE8   @$ABE8 scroll $0480    <- where a player actually meets it
chunk 3 -> $ABE8   @$ABE8 scroll $0680
chunk 4 -> $ABE8   @$ABE8 scroll $0880
chunk 5 -> $ABE8   @$ABE8 scroll $0A80
chunk 6 -> $ABE8   @$ABE8 scroll $0C80    <- what the ledger printed
```

Measured cost of the bug across the whole table:

| stage | printed | true | error |
|---|---|---|---|
| 4 | `$0C80` | `$0480` | 2,048 px |
| 6 | `$0CC0` | `$0AC0` | 512 px, **and it had been wrong since W28** |

Stage 6's row was not touched by this wave at all. **The ledger has been
reporting stage 6 as 512 px more finished than it is for four waves**, and the
error flatters the port in both cases, which is why nobody noticed.

Fixed (keep the earliest scroll), and the BASELINE rows for stages 4 and 6
updated — **row 6 is lowered, which the file's own docstring says never to do**,
so the reason is written into the dict next to it: the number was wrong, not the
port.

**AND THE FIX ARRIVED UNGUARDED.** Mutant M12 (revert it) originally REDDENED
NOTHING: both stages' numbers move FORWARD under the old code, and `gate()` reads
forward as "coverage advanced". So `_scroll_convention_check()` was added — a
second, structurally different computation of the minimum, plus the two
shared-pointer records pinned as hand-checkable literals — and wired into
`main()` ahead of the ledger. M12 reddens it now.

---

## WHAT I CHANGED

| file | change |
|---|---|
| `src/enemies.js` | `h_B559()` new; `case 0xB559` in `dispatch()`; the scope-guard comment and message rewritten (it named `$B559` as missing and called `$0600` "destructible terrain") |
| `src/nmi.js` | **`$9A76 -> $C772` given a loud named throw** — it had no call site |
| `src/oam.js` | `$8BD9`'s comment and throw corrected: "terrain-object sprite pass / moai wall / destructible scenery" → the arm-segment pass; the `$8B91`-jumps-in / `$8BF0`-falls-back structure and the shared `$9C`/`$9F` cursors written down for W32b |
| `src/collision.js` | `$C037`/`$C263`'s throws corrected off "destructible blocks" |
| `tools/oracle/stageledger.py` | earliest-scroll fix + `_scroll_convention_check()` + BASELINE rows 4 and 6 |
| `tests/w32a-b559.test.js` | new, 12 checks |
| `docs/worklog/gradius/29-plan-whole-game.md` | the five "destructible terrain" sites corrected per the recon |

**The guard stays at `>= 4`.** §4.

---

## THE MUTATION TABLE

Harness: patch the file as BYTES (an earlier text-mode version silently converted
two CRLF sources to LF — HANDOVER §10's Windows note, caught with
`git diff --ignore-cr-at-eol` and repaired), run the named check, restore,
sha256 before and after every one. All five hashes identical before and after
all 17: `enemies.js 3fbdf393e99b`, `stageledger.py ea41e6321288`,
`nmi.js f3def6bb8cae`, `oam.js 3723622a334c`, `collision.js 4cd49b297089`.

| # | mutant | reddened |
|---|---|---|
| M1 | `case 0xB559` removed | 1, 2, 3, 5, 7, 8, 9, 10 |
| M2 | animator row 9 → 3 (`$B4FD`'s) | 5 |
| M3 | animator row 9 → 0 (the warp rain's) | 5 |
| M4 | `$B55C BPL` inverted | 2, 5, 7, 8, 9, 10 |
| M5 | the init arm falls through instead of `RTS` | 2 |
| M6 | `$B563 DEC` → −2 | 7, 8 |
| M7 | `$B566 JMP $B251` dropped | 8, 9, 10 |
| M8 | entry 29 delegated to `h_B4FD` (the shared-BODY error) | 3, 5, 9 |
| M9 | the box checked BEFORE the move | 8, 9 |
| M10 | scope guard `>= 4` → `>= 5` | 11 |
| M11 | the guard message stops naming the four `$0600` walkers | 11 |
| M12 | ledger: the min-scroll fix reverted | the convention check |
| M13 | `case 0xB559` removed, vs **stageledger** | stage 4 first-unported moved BACKWARD |
| M14 | metasprite `$52` deleted from the export | 6 |
| M15 | `$9A76 -> $C772`'s guard neutered (the silent gap returns) | 12 |
| M16 | `$9663`'s throw loses its ROM address | 12 |
| M17 | `$8BD9`'s throw loses its ROM address | 12 |
| M18 | `$C263`'s throw loses its ROM address | 12 |

**No mutant reddened nothing** — after M12 was fixed. M12's first run reddened
NOTHING and that is recorded above rather than quietly repaired: the ledger fix
had no check behind it until `_scroll_convention_check()` was written.

**Check 4 is not reddened by any mutant, by construction.** It asserts the three
bytes of `$B650` row 9 (and row 3, the trap) against `assets/prg.bin`. It is a
FIXTURE check — it pins the cartridge constants that check 5 reasons about — and
no mutation of the port can move it. Stated rather than dressed up.

---

## WHAT I COULD NOT REACH

Stated as attempts, not absences.

* **A stage-5 both-sides cartridge scenario.** Not attempted as a button script:
  W31 already measured the wall (the endchain trajectory dies three times inside
  stage 2 between scroll `$03E8` and `$0463` and game-overs at f14333; stages
  visited `$19` = 0 and 1 only, over 26,000 frames). None of the 47 corpus
  scenarios goes past stage 2. What would close it is a stage-2-and-3-surviving
  input script, which is the plan's W37 and a search over button scripts.
* **A stage-5 run in the PORT.** Blocked by the four unconditional `$0600`
  walkers (§4), not by `$B559` and not by the scope guard. This is the finding,
  not a shortfall.
* **`$B559` against the cartridge at all.** Type `$1D` has zero records outside
  stage 5, so no in-corpus run dispatches entry 29. The remaining route is a
  poked both-sides intervention (force `$030C,X := $9D` on a live slot on both
  sides at the same instant, W31's `stage4poke.py` pattern) — see the section
  below for how far I got.
* **The 7 unexported tables the recon lists (§6 of the recon).** None of them is
  read by `$B559`: its only table is `$B650`, which `sub_B628` reads straight out
  of `rom` (no export needed), and its six metasprites `$52`-`$57` are already in
  `assets/metasprites.json` (checked, and check 6 pins it — M14 reddens it).
  `tablecoverage.py` stays green and its root set is untouched; the six routines
  outside its walk are still outside it, and that remains W32b's item.
