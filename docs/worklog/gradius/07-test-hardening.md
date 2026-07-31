# Wave 7 test hardening — the power-up loop, and the checks nobody has seen red
status: DONE
wave: 7   role: test   started: 2026-08-01

## The task, as I understood it

TEST WRITER for wave 7 (capsule pickup, the meter, apply, the force field, rank).
I write only `games/gradius/tests/` and, if needed, `tools/oracle/scenarios.json`
+ harness support. I do NOT edit `games/gradius/src/`. Every check I add must be
seen RED against a deliberate mutation of the source, with the source restored
byte-identical (sha256 before/after) afterwards.

Inputs: implementer commit `b9a40d1`, reviewer verdict (sound, 5 findings), QA
verdict (defects-found, 7 findings, 22 breaks of which **2 passed**).

## What I did

1. Read `docs/worklog/README.md` and `docs/knowledge/03` in full, then the
   wave-7 source (`src/powerup.js`, the `$C1AF`/`$C18C`/`$C1B8` arms of
   `src/collision.js`, `src/oam.js`'s force field, `src/score.js`,
   `src/hud.js`'s `$8A30`).
2. Built a scratch copy of `games/gradius` (`<scratchpad>/t7`, 255 MB including
   the recorded corpus) and a mutation driver
   (`<scratchpad>/w7t_mut.py` + `w7t_muts*.py`). **I did not edit
   `games/gradius/src/` at any point** -- every mutation is applied to the
   scratch copy, restored, and its sha256 asserted unchanged.
3. Ran a PROBE round first: 21 mutations of wave-7 code against the EXISTING
   suite, to find which of wave 7's checks cannot fail.
4. Re-read the five capsule artifacts myself and pinned the frame numbers.
5. Wrote `games/gradius/tests/powerup-unwitnessed.test.js` and corrected one
   vacuous assertion in `games/gradius/tests/powerup.test.js` (QA's F7).
6. Re-ran every mutation against the new file; ran the gate.

7. Fixed one stale note in `tools/oracle/scenarios.json` (rule 6, QA's F3) and
   re-ran the gate afterwards.

## What I MEASURED

### The artifacts, re-read by me (and F1 re-confirmed)

Not quoted from the reports — decoded out of `tools/oracle/out/scen/*.json` by
walking each watched field for transitions:

```
capsule-pickup  w_0042 [(647, 0, 1)]                     w_0040 []
capsule-consume w_0042 []                                w_0040 [(647, 0, 1)]
capsule-sweep   w_0042 [(461,0,2)(481,2,0)(501,0,3)(521,3,0)(541,0,4)(561,4,0)
                        (601,0,5)(621,5,0)(641,0,6)(661,6,0)]
                w_0017 [(481,0,1)(561,1,2)(581,2,3)(621,3,4)]
capsule-shield  w_0046 [(401,0,5)(493,5,4)(509,4,3)(526,3,2)(542,2,1)(647,1,0)]
                w_0100 [(283,0,1)(658,1,2)(779,2,1)]
capsule-die     w_0042 [(626,0,6)(635,6,1)(690,1,2)(914,2,1)]
                w_0035 [(283,0,20)(635,20,4)(914,4,20)]
```

So `capsule-pickup` collects at **f647**; f626 belongs to `capsule-die`'s poke.
The three stale `f626` sites the reviewer and QA both reported are **still in
`src/`** (`src/hud.js:65`, `src/hud.js:301`, `src/state.js:228`) — I am the test
writer and may not edit `src/`, so they are reported again below, and every
frame number I put in a test comes from the table above.

### The probe round: which wave-7 checks cannot fail

29 mutations, each applied to `<scratchpad>/t7` only, each restored with its
sha256 asserted unchanged. Unit subset = 12 test files (181 → 187 tests);
corpus = `compare.mjs`, all 35 scenarios, 11695 frames.

**Nine mutations passed the ENTIRE gate** — 256 unit tests and 11695 compared
frames — before this commit:

| id | mutation | unit | corpus | now |
|---|---|---|---|---|
| P1 | the force field draws but does not ADVANCE the OAM cursor | green | green | **closed** |
| P3 | the `$46 == 1` flash is ORed into the SHIP's records too | green | green | **closed** |
| P5 | the field drops the ship's own `$0180` mask (`$9E`) | green | green | **closed** |
| P6 | `$8969`'s score and `$896C`'s sfx swapped | green | green | **closed** |
| P16 | the shield is spent once per FRAME, not once per contact | green | green | **closed** |
| P33 | `$80BE INC $02` moved ABOVE `$80A7 JSR $8B10` | green | green | **closed** |
| P7 | `$8971`'s cursor moved above `$8969`'s score (QA F6a) | green | green | ruled out |
| P8 | `$C1FD` and `$894B` swapped (QA F6b) | green | green | ruled out |
| P27 | a force field on a slot whose `$0120` is 0 | green | green | ruled out |

The last three are argued at the bottom of
`games/gradius/tests/powerup-unwitnessed.test.js`: P7 and P8 are **provably
commutative on the cartridge** (the two routines share no byte, in either
direction), and P27's state (`$0120 = 0` with `$46 != 0` and `$1B AND #$70 == 0`)
cannot occur — `$9B83` sets `$0120 = 1` at every stage entry, `$A0BE` rewrites it
with the tilt code 1..3, and `$9B3E` clears `$46` at every death. A check on any
of the three would be a check that cannot fail.

### The mutation table — 29 mutations, 26 RED, 3 ruled out

Driver: `python <scratchpad>/w7t_mut.py w7t_muts{,2,3,4}.json [--corpus]`.
Every row restored byte-identical (the driver asserts sha256 or aborts).

| # | mutation | file | unit | corpus | test(s) that went red |
|---|---|---|---|---|---|
| P1 | force field does not advance the cursor | oam.js | RED | green | `$8B86: the force field CLAIMS its OAM slots` |
| P2 | field expanded BEFORE the ship | oam.js | RED (6) | — | `$8B6B`, `$8B79`, `$8B86`, `$8B79/$8B52`, `$8B52 -> $9E`, `$80A7 before $80BE` |
| P3 | the flash reaches the ship's records | oam.js | RED | green | `$8B79/$8B52: the flash is the FIELD's own $9E` |
| P4 | field drawn for slot 1 too | oam.js | RED | RED (3) | `$8B86: the force field CLAIMS its OAM slots` |
| P5 | field expanded with a hardcoded 0 mask | oam.js | RED | green | `$8B52 -> $9E -> $8AE0` |
| P6 | `$8969`/`$896C` swapped | powerup.js | RED | green | `$894B's tail: $845B scores BEFORE $896C` |
| P9 | the `$46 == 0` test moved BELOW the DEC | collision.js | RED (8) | — | `$C1C1: the shield absorbs the hit`, +7 |
| P10 | `$C1A6` killed by the touched slot, not Y | collision.js | RED | — | `$C18C: the every-16th item` |
| P11 | `$C1B5` becomes `JMP $C20A` | collision.js | RED | — | `$C101/$C136: the sweep runs slot 9 DOWN to 0` |
| P12 | `$AEF8` also clears the slot position | enemies.js | green | RED (340) | — (corpus only) |
| P16b | the shield spent once per FRAME | collision.js | RED | green | `$C1C1: the shield is spent ONCE PER CONTACT` |
| P24a | `$9C47` `$44` ADDED instead of tested | powerup.js | RED | — | `$9C45: $17 = ...` |
| P24b | `$9C4C` `$45` tested instead of added | powerup.js | RED (2) | — | `$9C45: $17 = ...` |
| P24c | `$9C51` `$46` term dropped | powerup.js | RED (2) | — | `$9C45: $17 = ...` |
| P24d | `$9C56` `$19` term dropped | powerup.js | RED | — | `$9C45: $17 = ...` |
| P33 | `INC $02` above `JSR $8B10` | nmi.js | RED | green | `$80A7 before $80BE` |
| P34 | `$8A40` patches at a FIXED offset | hud.js | RED (2) | RED (18) | `$8A30: the meter cursor`, `$8A40 LDA $0E / SBC $98` |
| Q1 | `$C199` BMI skip dropped | collision.js | RED | — | `$C18C: the every-16th item` |
| Q2 | `$C19E` BPL skip dropped | collision.js | RED | — | `$C18C: the every-16th item` |
| Q3 | `$C1A4` BCC skip dropped | collision.js | RED | — | `$C18C: the every-16th item` |
| Q4 | `$C1AF`'s `freeSlot` dropped | collision.js | RED | — | `$C1AF: touching a power-up capsule` |
| Q5 | `$C1D0`'s kill dropped | collision.js | RED (2) | — | `$C1C1: the shield absorbs the hit`, +1 |
| Q6 | `$C1C8` indexed by j, not j+12 | collision.js | RED | — | `$C1C1: the shield absorbs the hit` |
| Q7 | `$8B6F` gate mask `#$70` -> `#$80` | oam.js | RED (7) | — | `$8B6F: no force field while $1B ...`, +6 |
| Q8 | `$89D5`'s `>= 2` cap becomes `!= 0` | powerup.js | RED | — | `$89D3: OPTION is capped at 2` |
| Q9 | `$897D`'s `$18` tripwire removed | powerup.js | RED | — | `$897D: $18 outside 0..1 is loud` |
| Q10 | `$8984`'s out-of-range throw removed | powerup.js | RED | — | `$8984: a $42 outside 0..6 is loud` |
| Q11 | `$8B6B` reads `$44` instead of `$46` | oam.js | RED (7) | — | `$8B6B: a shielded ship draws a SECOND metasprite`, +6 |
| R1 | `$9B3E` also clears `$17` | flow.js | RED | RED (1) | `$9C45 is the ONLY writer of $17` |

`Q1`-`Q11` are **QA's entire "NOT seen red by me" list** — the checks whose
red-ness was unproven. All eleven go red. That item can be closed.

`R1` is the proof that QA's F7 was real and is now fixed: with
`powerup.test.js` **as committed in b9a40d1** the same mutation is
`unitFail = 0`, and with the rewritten assertion it is `unitFail = 1`,
`$9C45 is the ONLY writer of $17`. Both runs are in `w7t_mutout.json`.

### Why the corpus is blind, measured rather than asserted

* **P1 / P3 / P5 / P33** — everything the oracle knows about sprites is OAM
  entry 0 (`s0y/s0t/s0a/s0x`, which is copied from `$8B08` and never allocated)
  plus four work counts (`slotsVisited`, `msExpanded`, `spriteRecords`,
  `spritesStored`). All four mutations move a sprite, its colour or its tile
  without changing how many sprites there are. This is the third wave in a row
  to land on it: `tools/oracle/rendergate.py` and `rendercheck.py` are in the
  tree and in nothing's path.
* **P16** — I instrumented `$C1BD` in the port and ran all 35 recorded
  scenarios through `porttrace` (`<scratchpad>/w7t_census.mjs`):

```
capsule-die     armed contacts/frame {"0":411,"1":1}   capsules/frame {"0":410,"1":2}
capsule-shield  armed contacts/frame {"0":406,"1":6}
diag-ru-ld      armed contacts/frame {"0":91,"1":1}
lr-both         armed contacts/frame {"0":91,"1":1}
WHOLE CORPUS: {"0":10063,"1":9}
```

  **Not one frame in the corpus has two enemies touching the ship**, and not one
  has two capsules collected in a frame either. A per-frame shield and a
  per-contact shield are the same program on all 11695 compared frames.
* **P6** — `state.sfx` is compared by nothing until wave 8 wires `$EC1E`, and
  the biggest score any scenario reaches is `$0164`, so `$845B`'s extra-life
  arm (`$84F2 LDA #$36`) never runs inside a compared window.

### The six new tests

`games/gradius/tests/powerup-unwitnessed.test.js`, 6 tests, 262 unit tests total
(was 256), 0 skipped.

1. `$8B86: the force field CLAIMS its OAM slots -- the next object starts AFTER
   it` — the scarce thing in the frame is OAM. A shield plus one Option; the
   Option's records must start one slot past the field's, and the same page with
   no shield puts the Option where the field was. Also pins `msExpanded == 3`.
   RED for P1, P2, P4.
2. `$8B79/$8B52: the flash is the FIELD's own $9E, and the ship keeps its own` —
   RED for P3.
3. `$8B52 -> $9E -> $8AE0: the field inherits $0180, and the flash REPLACES it`
   — labelled a TRANSCRIPTION check because `$0180` is 0 in all 35 seeds; both
   halves asserted, so an ORing port fails the second. RED for P5.
4. `$80A7 before $80BE: the display list is built from the OLD $02` — four
   frames through the real `nmi()`, checking which of `$5A`-`$5D` landed and
   that the record sits at the ship's PRE-state-machine position. RED for P33.
5. `$C1C1: the shield is spent ONCE PER CONTACT, and the last point goes to
   slot 9` — two armed enemies in one box. `$46 = 2`: both absorbed, both
   destroyed, ship alive. `$46 = 1`: slot 9 spends the last point and is
   destroyed, slot 3 kills the ship and is NOT destroyed, `$A8` left at 3.
   RED for P16b and P9.
6. `$894B's tail: $845B scores BEFORE $896C asks for the sound` — 199950 + the
   capsule's `$0050` crosses `$2A`, so `$84F2` fires inside `$845B` and the sfx
   list is `[$36, $0D]`. RED for P6.

### The gate, run by me, on this tree

```
$ node --test games/gradius/tests/
# tests 262   # pass 262   # fail 0   # cancelled 0   # skipped 0   # todo 0
# duration_ms 4219.9674

$ node games/gradius/tools/test-all.mjs
  35 scenarios, 11695 of 11695 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  [PASS] port vs cartridge (compare.mjs)
  neuter lead1 -> RED 193 / seed-x+1 -> RED 116 / laginject=450 -> RED 640 (good)
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

Run twice: once before the `scenarios.json` prose fix and once after. The
"6 fields SKIPPED" is the pre-existing per-FIELD exclusion count; the STAGE
count is 0 SKIPPED.

## Findings against wave 7 (src/ is not mine to edit)

1. **MODERATE, and it is the second time it has been reported — the three stale
   `f626` sites are still there.** `src/hud.js:65`, `src/hud.js:301`,
   `src/state.js:228` all attribute f626 to `capsule-pickup`, whose own artifact
   (re-read by me, above) has its only `w_0042` transition at **f647**. The
   reviewer and QA both filed this against `b9a40d1`; nothing has changed. It is
   rule 6's exact failure mode and it is a three-line edit.
2. **MINOR — `src/enemies.js:132-134` still says `$BE93`'s "only caller in this
   port is `$C0A9`"**, when `b9a40d1` itself added two more (`$C1D0` and the
   `$C194` loop, both in `src/collision.js`), and gives `$C19E` for the
   cartridge's second call site where the `JSR $BE93` is at `$C1A6`. Also
   reported by both the reviewer and QA; also unfixed.
3. **FIXED BY ME (rule 6, and it is in a file I am allowed to edit)** —
   `tools/oracle/scenarios.json`, `autofire-laser`'s `why` described `$C1AF` as
   "the wave-7 pickup -- and a loud throw". It is ported. Rewritten to say so,
   and to name the poke window the f626 in that sentence came from
   (`flowprobe.py --poke 0044=1@390-1000`, i.e. f390, not the corpus's align of
   400). The recorded artifacts embed a copy of `why`, so the copy in
   `out/scen/autofire-laser.json` stays stale until the next `scen.py` run;
   `out/` is gitignored and `why` is print-only in `compare.mjs`.
4. **INFORMATIONAL — `state.zp17` still has no reader in `src/`.** Unchanged
   from QA's F-item; it closes when the enemy-bullet allocator (`$BC59`) lands.

## What I RULED OUT

* **P7 (`$8971` above `$8969`) and P8 (`$C1FD` after `$894B`) are not holes,
  they are commutative.** `$8A30` reads `$42`/`$0E` and writes `$0700,X`;
  `$845B` touches `$07E0-$07EA`, `$2A,X`, `$20,X` and the sound queue. `$AEF8`
  writes five bytes of one enemy slot; `$894B` touches `$42`, the score, the
  sound queue and the VRAM queue. No shared byte in either pair, so the two
  orders compute the same state ON THE CARTRIDGE. A test claiming to catch them
  would be decoration. (Wave 6 recorded `shotLoop`'s direction the same way.)
* **P27 (a force field on an invisible slot) is unreachable, not untested.** The
  reachability argument is in the test file's footer.
* **I did not add a scenario.** The only one of the nine green breaks a scenario
  could catch is P16, and the specification is below rather than a guess.

### THE CORPUS FIX, specified but NOT recorded

To make the per-contact shield observable the corpus needs **one frame with two
enemies inside the ship's 16x16 box**, which the measurement above says it has
never had. The shape, following `capsule-shield` (which is `right-wall`'s script
with `0046=5@400-400`):

```
name : shield-double-hit
tail : right-wall's script, ship parked at the wall where the squadron arrives
poke : 0046=2@<align>-<align>          (2, not 5 -- the pair must run out)
```

and the discriminator is `w_0046` stepping **2 -> 0 in one frame** with
`w_0100` staying 1. A per-frame port gives `2 -> 1` and stays alive, which is a
one-frame, one-byte divergence — enough. Deriving the frame needs the cartridge:
run `pow.py --wexec` with a hook on `$C1BD` over `right-wall`'s script and look
for a frame with two executions; if none exists, the ship's parked Y has to be
moved so that two members of one squadron overlap it. I did not have a budget to
iterate on the cartridge for this, and a scenario written from a guess would be
recorded, would pass, and would test nothing (wave 6's appendix is the worked
example of exactly that mistake).

## What I could not do, and why

* **I did not re-record any scenario.** I compared against the artifacts as
  committed, and I re-read five of them field by field. A regression here looks
  like `compare.mjs` green against stale artifacts.
* **No pixel/OAM-content layer was run.** Four of the six new tests exist
  precisely because there is none; `rendergate.py` and `rendercheck.py` remain
  referenced by nothing. This is now the largest uncovered layer for the third
  wave running, and wave 7 is the wave that added a sprite.
* **`state.sfx` is still compared by nothing.** Test 6 pins the ORDER of two
  sound requests, which is the most a unit test can do until `$EC1E` exists.
* **The `$2A` knownFail from wave 6 is still open** (`bootState` seeds `$02`,
  the cartridge says `$01`). Test 6 sets `extraLife[0]` explicitly rather than
  leaning on the seed, so it is unaffected either way.
* **The five `page-wiring.test.js` tests do not run in my scratch copy** (Node
  cannot resolve a `file:` URL under a path containing a space). They are
  unrelated to wave 7 and pass in the real tree; my mutation subset excludes
  that file.

## If someone picks this up cold

1. `<scratchpad>/w7t_mut.py` + `w7t_muts*.py` is the whole campaign, re-runnable
   in about 40 s per mutation with `--corpus` and 1.2 s without.
   `<scratchpad>/w7t_census.mjs` answers "how often does X happen in the corpus"
   by instrumenting the port and replaying all 35 scenarios — that is how the
   two-contacts-per-frame hole was turned from an argument into a number.
2. The three stale `f626` sites and the `$BE93` note (findings 1 and 2) are
   still open and belong to whoever next writes `src/`.
3. The corpus fix above is specified and unrecorded.
4. A pixel layer is the highest-value thing left in this port's gate.
