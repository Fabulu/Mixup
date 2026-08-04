# Wave 32b IMPLEMENTER -- the `$0600` arm substrate and the `$5C` half-rate frame fork

status: DONE
implementer, 2026-08-04

Scope, from the brief and `32-recon-destructible-terrain.md` §8 + `32a-impl-b559.md` §4:
**W32b only.** The `$0600` 4-group x `$30`-byte articulated ARM pool and the
`$9663` half-rate frame fork. NOT W32c (`$CBD1` arms fire, `$BEF3`/`$BF0B` shot
destroys an arm, `$C263` arm kills the player).

---

## BASELINE, MEASURED BEFORE ANY EDIT

`python games/gradius/tools/oracle/stageledger.py` (note: the brief's path
`games/gradius/tools/stageledger.py` does not exist; the tool lives under
`tools/oracle/` -- the same correction W30, W31 and W32a all had to make):

```
stage  distinct  ported   unported  inline5  ported %     first unported
4      28        24       4         4        85.7         scroll $0480  (@$ABE8)   <-- MY STAGE
```

PER-STAGE RUNNABILITY: `4  THROWS (scope guard)  $C653 THROWS  blocked`

`node games/gradius/tools/test-all.mjs`: **GREEN -- 11 passed, 0 failed, 0 SKIPPED.**

---

## §1. THE FIRST QUESTION, ANSWERED FIRST -- CAN THE PORT EXPRESS A FORKED FRAME?

**YES. The mechanism already exists, it is already used by shipped code, and the
recon's framing of the risk was wrong in a way worth writing down.**

The recon (§8, "the single biggest unknown left") asked whether `src/nmi.js` and
the oracle's frame alignment can express "this frame skips the `$1B` dispatch and
half the engine". Answered by reading both sides this session, before any pool
code was written:

### 1a. The fork does not span two HARDWARE frames. It never did.

The recon's own words -- "one logical frame is split across TWO hardware frames"
-- describe the GAME's experience, not the harness's. Read as a harness claim it
implies the port would need a frame that is half a `nmi()` call, and that is what
made it look like an architecture risk. The listing says otherwise:

```
9689: A5 02      LDA $02
968B: 4A         LSR A
968C: 90 17      BCC $96A5        even frame -> the normal $96A5 ladder
968E: 20 C0 A2   JSR $A2C0        spawn
9691: 20 91 CB   JSR $CB91        THE ARM DRIVER
9694: 20 AB AD   JSR $ADAB        enemies
9697: 20 B7 BB   JSR $BBB7        enemy bullets
969A: 20 FC 9F   JSR $9FFC        THE PLAYER
969D: 20 C7 C0   JSR $C0C7        player-vs-enemy collision
96A0: E6 5B      INC $5B
96A2: 4C 8C 9A   JMP $9A8C
```

`$9650` is entered once per NMI from `$80D1`, and `$96A2 JMP $9A8C` lands inside
the same NMI. **Every hardware frame still runs exactly one `nmi()`, still
samples input once at `$80B5`, still emits one display list.** There is no
sub-frame, no re-entry, no skipped tick. The oracle's frame alignment is
untouched, because nothing about the frame's OUTER shape changes -- only which
subset of subroutines runs inside it.

### 1b. The port's shape for it is the one the pause path already ships

`$96A0 INC $5B / JMP $9A8C` is structurally identical to `$9660 JMP $9A8C`, the
PAUSE jump, which `stagePlay()` has expressed since wave 1:

```js
if (state.zp15 !== 0) {          // $965C/$965E
  mode5Tail(state, res);         // $9660 JMP $9A8C
  return;
}
```

`mode5Tail(state, res)` with `test1B` defaulting to `false` IS the `$9A8C` entry,
and its docstring already names `$96A2` as one of the three ROM arms that use it:
*"`$9A8C` is a real jump target, reached from `$9660` (pause), `$96A2` (the
stage-5 half-rate arm, right after `INC $5B`) and `$98E2`."* The half-rate arm was
written into the port's structure as a known caller before this wave existed.

### 1c. Every callee the fork needs is already a separate function

| ROM | port | already exported? |
|---|---|---|
| `$968E JSR $A2C0` | `spawnEngine` | yes (`enemies.js`) |
| `$9691 JSR $CB91` | `armDriver` | **NEW -- the only new one** |
| `$9694 JSR $ADAB` | `updateEnemies` | yes |
| `$9697 JSR $BBB7` | `enemyBullets` | yes |
| `$969A JSR $9FFC` | `updatePlayer` | yes |
| `$969D JSR $C0C7` | `collision` | yes -- **exported SEPARATELY from `shotSweep`** |

That last row is the one that could have blocked the wave. `$C0C7` has exactly
two callers (`$969D` and `$C052`), and `src/collision.js` already splits
`collision()` out of `shotSweep()` as its own export -- wave 5 did that for
transcription reasons, and it happens to be exactly what `$969D` needs.

### 1d. The two half-rate SKIPS were already transcribed as tripwires

`$9A5E`'s `LDA $5C / CMP #$02 / BCS $9A70` is `nmi.js:924` (a throw) and
`$C04B`'s `LDA $5C / CMP #$02 / BCC $C052` is `collision.js:122` (the real
branch, correct). Only the first has to change from throw to branch.

**VERDICT: the fork is ~12 lines against structure that already exists. It is
NOT the risk in this wave.** The recon's MEDIUM confidence on the fork should be
read up, and its "down to LOW if the harness cannot express it" contingency does
not fire.

---

## §2. THE ORDER TRAP INSIDE THE FORK

The two paths run the same four engine routines **in different orders**, and the
difference is not cosmetic:

```
$9A5E normal:   $A2C0 spawn -> $BBB7 bullets -> $9FFC player -> $ADAB enemies
$968E fork:     $A2C0 spawn -> $CB91 arms -> $ADAB enemies -> $BBB7 bullets -> $9FFC player
```

The normal path updates the PLAYER BEFORE the enemies; the fork updates the
enemies BEFORE the player. `nmi.js`'s own header records why that matters -- the
fan (`$B0AF` sub-states 1 and 2) compares its Y against `$0320`, the player's, so
it sees THIS frame's player position on one path and LAST frame's on the other.
A port that reused `mode5Body`'s order for the fork would be wrong on every
stage-5 odd frame and no timing check would see it.

---

## §3. HEADLINE, AND THE DONE-WHEN AS A MEASUREMENT

```
stageledger.py, stage $19 = 4

  BEFORE   28 distinct   24 ported   4 unported   85.7 %   first unported scroll $0480 (@$ABE8)
  AFTER    28 distinct   28 ported   0 unported  100.0 %   first unported NONE (shipped)

node games/gradius/tools/test-all.mjs   GREEN -- 11 passed, 0 failed, 0 SKIPPED
node --test games/gradius/tests/        537 pass, 0 fail, 0 skipped  (14 of them new)
```

**There is no surviving throw in stage 5's wave stream.** All twenty-eight
distinct records have a handler: W32a's `$B559` (entry 29, ten records) and this
wave's `$CA5E` (entry 20) behind the four inline-5 records at `$ABE8`.

**FOUR OF THE FIVE WALLS FALL.** W32a's §4 named five stage-5 gates:

| # | ROM | fires | W32b |
|---|---|---|---|
| 1 | `$9663` | every mode-5 frame | **PORTED** -- the `$5C` census + the fork |
| 2 | `$8B8D` -> `$8BD9` | every sprite pass, at `$80A7` | **PORTED** -- `$8C06`, six sprites per group |
| 3 | `$C25D` -> `$C267` | every collision frame | **PORTED** -- player body vs the segments |
| 4 | `$9A76` -> `$C772` -> `$CB8A` | every play frame | **PORTED** -- `$CB91`, `$CC33`, `$CC99` |
| 5 | `$C037` -> `$BEF3` | whenever a shot is alive | **STILL THROWS** -- W32c |

and a sixth thing that is not a "wall" but behaves like one: **`$CBD1`, the arm's
own shot, now throws from INSIDE the ported driver** (`$CB91` calls it every
`$CBCA[$17]` = 25 to 40 frames per live arm). Wall 4 therefore falls for the
group walk, the kinematics and the fire TIMER, and not for the shot itself.

A stage-5 frame with an EMPTY pool now runs clean end to end -- measured, not
argued: `tests/flow.test.js`'s stage-5 case was `assert.throws(/\$8BD9/)` and is
now `assert.doesNotThrow`.

**THE SCOPE GUARD STAYS AT `>= 4`.** Not caution: `$BEF3` fires whenever a shot
is alive and `$CBD1` within ~30 frames of any arm, so admitting stage 5 would
make `stageledger.py`'s runnability column print RUNNABLE for a stage that
cannot survive one player shot. That is the lie W31 built the column to kill and
the same reason W32a refused. W32c lowers it, and those two throws are what it
has to delete first. The guard's MESSAGE was rewritten -- it named `$CA5E`,
`$A4A6`, `$C653` and the four walkers, all of which shipped this wave, and
`w32a-b559.test.js` check 5 now pins the CURRENT debt instead (that message has
now gone stale twice, which is why the check exists).

---

## §4. WHAT WAS PORTED, AND THE COUPLING THAT CAME WITH IT

| ROM | bytes | where | note |
|---|---|---|---|
| `$9663`-`$96A2` | 66 | `src/nmi.js` | the census + the fork |
| `$9A5E`-`$9A62` | 5 | `src/nmi.js` | throw -> the real `BCS $9A70` |
| `$9A76` -> `$C772` | 10 | `src/nmi.js` | the call W32a made loud |
| `$8BD9`-`$8BF1` | 25 | `src/oam.js` | the group walk |
| `$8C06`-`$8C77` | 114 | `src/oam.js` | six sprites, the head, the cull |
| `$C263`-`$C2A4` | 66 | `src/collision.js` | player vs segments |
| `$A4A6`-`$A526` | 129 | `src/enemies.js` | the nibble allocator |
| `$C653`-`$C679` | 39 | `src/enemies.js` | the stage-5 late spawner |
| `$CA5E`-`$CB25` | 200 | `src/enemies.js` | the owner (entry 20) |
| `$CB4E`-`$CB89` | 60 | `src/enemies.js` | free on death |
| `$CB8A`-`$CBC9` | 64 | `src/enemies.js` | the driver + its `$5C` gate |
| `$CC19`-`$CD64` | 332 | `src/enemies.js` | the kinematics |
| | **1,110** | | recon estimated 1,040 + `$C263`'s 66 |

`$C263` is in the recon's W32c list and in the brief's list of four walls. The
brief wins: without it stage 5 throws on every collision frame and nothing about
the pool is measurable. It is the one scope deviation and it is 66 bytes.

**THE POOL IS NOT ITS OWN ARRAY.** It lives inside `state.coll`
(`$0500`-`$06FF`) at `ARM_POOL = $100`, because `$994A`'s despawn sweep clears
`$0600,X / $0640,X / $0680,X / $06C0,X` at stride **`$40`, not `$30`** -- it cuts
ACROSS the group structure -- and `$9B49` clears the whole page. A dedicated
`Uint8Array` would have made both a no-op on the arms. Both clears were already
ported and neither needed a line changed.

### Fall-throughs and dead code, read past the apparent end

* `$CB26` (`LDX $A8`) falls into `$CB28` (`JSR $EC1E`) falls into `$CB2B` -- two
  in six bytes, both already documented at `explodeInPlace()`.
* `$CB1B` is a BRANCH TARGET (`$CAB1 BCS`), not a fall-through: `$CB1A RTS` ends
  the live path. `$CB23 JMP $CB4E` hands `$CB4E` the caller's return.
* `$8BD9` is **not a subroutine**: `$8B91 BEQ` jumps in and `$8BF0 BMI` (always
  taken) falls back into `$8B93`. It consumes the shared OAM cursor `$9C` and
  the sprite budget `$9F`.
* `$A46C JMP $A4A6` is a JMP -- `$A4A6`'s RTS returns to `$A466`'s caller.
* **Two dead loads transcribed as comments, not as code:** `$CC38 LDA $0603,X`
  (overwritten by `$CC3E` two instructions later) and `$CD05 TYA` (overwritten
  by `$CD06`). Named so the next reader does not "restore" them.
* **Two `SBC`/`ADC` with no `SEC`/`CLC`:** `$CAE9`/`$CB03` (the owner's Y bob)
  and `$C27C`/`$C285` (the player box). Both inherit a carry from a `CMP` and
  both are transcribed with the carry modelled. `$CAE9`'s is the subtler one --
  on the frame the bob timer resets, `$CAD2 CMP $0320` sets the carry, and that
  is also the frame that picks the UP branch, so one subtract in up to 64 is one
  1/256 px smaller than every other.
* `$CC6D`'s `TXA / ASL A / ADC $02 / AND #$7F / ADC $0360` carries TWO carries a
  rewrite loses: `ASL` on base `$90` sets carry (group 3's `ADC $02` is one
  higher than groups 0-2's) and `AND #$7F` does not clear it, so it rides into
  the add of the player's X.

### Two field facts the recon's map did not spell out, found by porting

* **`$0460 + j` and `$046C + j` are different bytes and both matter.**
  `$A4FC STA $0460,X` with X = `$A8` = the slot index writes `$0460 + j` (the
  one-shot DEPLOY flag `$CA87` tests and `$CA8C` clears, and the byte `$C079`
  reads to decide 1 or 2 damage per hit). `$CA7E`/`$CAAC`'s `LDA $046C,X` is
  `$0460 + $0C + j`, the accumulated DAMAGE `$C087` adds to. Getting these the
  same way round is what makes the owner a multi-hit enemy at all. Mutant M5.
* **`$A517` clears three arrays, not four.** Six iterations write `+$10..$15`
  (angle), `+$02..$07` and `+$18..$1D` (X). The segment Ys at `+$20..$25` keep
  whatever the previous tenant left. Transcribed, and pinned by a check
  (mutant M34) rather than tidied.

---

## §5. THE BUG THE UNIT SUITE CAUGHT, AND IT WAS IN ALL FIVE WALKS

Every routine over this pool walks the four groups as

```
LDX #$90 / STX $A9
loop:  ... body ...
       LDA $A9 / SEC / SBC #$30 / STA $A9 / BPL loop
```

**The `BPL` is at the END.** The first pass runs unconditionally and the test is
on the value AFTER the subtraction: `$90`, `$60`, `$30`, `$00`, then `$D0` fails
it. The first draft wrote that as

```js
for (let base = 0x90; !(base & 0x80); base = u8(base - 0x30)) {
```

which is a PRE-test loop -- and `$90` has bit 7 set, so **all five walks did
nothing at all**. `$A4A6` allocated no groups, `$CB4E` freed none, `$CB91` drove
none, `$8BD9` drew none and `$C267` tested none.

Six of the fourteen new checks went red at once. It is fixed as `ARM_BASES`, an
exported list in `state.js` with the derivation next to it, so the shape cannot
come back.

**This is the wave's argument for writing the checks before believing the code.**
A port with five silently empty loops passes every existing gate, ships green,
and looks exactly like a working arm subsystem until somebody reaches stage 5.

---

## §6. TABLE EXPORTS, AND THE ROOT SET THAT WAS NARROWER THAN ITS GREEN

Five ranges, 120 bytes, all validated at export time against the instruction
that follows them:

| block | range | bytes | reader |
|---|---|---|---|
| `armHeadSprite` | `$8BF2`-`$8C05` | 20 | `$8C19` tiles + `$8C1E` attributes, one run |
| `armHitsByRank` | `$BEEA`-`$BEF2` | 9 | `$BF44` -- **W32c's reader**, see below |
| `armFirePeriod` | `$CBCA`-`$CBD0` | 7 | `$CBAD` |
| `armShapeParams` | `$CC1F`-`$CC32` | 20 | `$CC63`/`$CC68`/`$CC7C`/`$CC85` |
| `armSegmentDelta` | `$CD65`-`$CDA4` | 64 | `$CD16`/`$CD1C` dX, `$CD4B`/`$CD55` dY |

`tablecoverage.py` reported **OK with all of them missing**, exactly as the brief
warned. Its root set was the 42 `$AE1C` entries plus `$C413`, and the routines
that read these hang off the NMI's own order instead: `$8C06` off `$8BAB`
(`$80A7`), `$CB91` off `$9691`/`$9A76`, `$CC33`/`$CC99` off `$CB91`, `$BEF3` off
`$C037`. **Three roots added** (`$8BD9`, `$CB91`, `$BEF3`); the walk goes from 66
indexed bases to **78**, and 48 exported ranges to 53.

**`$9663` was NOT added, and the recon's §6 recommendation to add it was wrong.**
Its body indexes nothing -- four absolute `LDA`s and an `INX`. Rooting it drags
in the whole of mode 5 (`$A2C0`, `$ADAB`, `$9FFC`, `$C0C7`, `$9A8C`'s tail) and
with it seventeen terrain/streamer tables that ARE exported, just decoded into
`terrain/stages.json` rather than raw into one of `TABLE_FILES`. **Measured:
adding it turns the tool from 1 gap into 20, none of them real.**

`$BEEA` is W32c's table and is exported anyway: rooting `$BEF3` without it would
just relocate the gap, and the tool's job is to cover what the ROM indexes, not
what the port has reached.

**`$CC1F` IS DELIBERATELY NOT EXTENDED.** `$CC7C LDA $CC23,Y` is indexed by
`$9A` = `4*$0460[owner] + shape`, which runs past `$CC32` for any shape above 3.
The recon found no producer of a shape above 1 and I found none either (the four
inline-5 records give 0 and 1; `$C67A`'s four reachable rows give 0 and 1), but
neither of us can prove one cannot exist -- so the block stops at the ROM's own
code boundary and an overrunning shape becomes a **loud throw out of
`romByteReader`** instead of silently reading opcodes as a table.

---

## §7. THE MUTATION TABLE -- 34 MUTANTS, 33 RED, 1 SURVIVOR REPORTED

Harness: `scratchpad/w32bmut.mjs`. Patches source as BYTES (HANDOVER §10's
Windows note -- a text-mode patch rewrites CRLF, and three of these five files
are CRLF and two are LF), runs `w32b-arms.test.js` + `w32a-b559.test.js`,
restores, and hashes before and after **every single mutant**.

All five hashes identical before and after all 34:
`enemies.js 2ec7d1013a38`, `oam.js 8e815d936eb4`, `collision.js d043dc0cc930`,
`nmi.js ae6fc13828ee`, `state.js 41655da8bca1`.

`b`N = check N of `w32b-arms.test.js`, `a`N = check N of `w32a-b559.test.js`.

| # | mutant | reddened |
|---|---|---|
| M1 | `ARM_BASES` reversed (low group first) | b2 b8 |
| M2 | `$A506` shape = nibble (the `-1` dropped) | b2 |
| M3 | `$A4CD` LSR once, not four times | b1 b2 |
| M4 | `$A4A6`'s allocator tests slot 0 (`DEX/BPL`) | b3 |
| M5 | `$A4FC` writes `$046C+j`, not `$0460+j` | b2 b11 |
| M6 | `$A504` the nibble-0 arm allocates anyway | b1 |
| M7 | `$9663` census drops the `$0690` header | b4 b6 |
| M8 | `$9689` parity inverted (EVEN frame forks) | b5 |
| M9 | `$9685` `CPX #$02` becomes `>= 1` | b5 b6 |
| M10 | `$9A5E`'s `$5C < 2` gate removed | b5 |
| M11 | `$CB8A`'s gate removed (arms driven twice) | b7 |
| M12 | `$CB91`'s `$AE` one-shot removed | ***SURVIVED*** |
| M13 | `$CC33` parity test inverted | b9 b10 |
| M14 | `$CC19`'s silent free removed | b9 |
| M15 | `$CC99` runs SIX passes, not five | b10 |
| M16 | `$CC99` writes segment 0's angle too | b10 |
| M17 | `$CA49`/`$CA50` swapped | b11 |
| M18 | `$CAA9` `$048C` not set (stops absorbing) | b11 |
| M19 | `$CA87` the nudge is not a one-shot | b11 |
| M20 | `$CB4E` explodes on SEGMENT 0, not 2 | b12 |
| M21 | `$8C06`'s TIP becomes segment 0 | b13 |
| M22 | `$8C06`'s cull advances the cursor | b13 |
| M23 | `$8C49`'s flipped-head 8 px lift dropped | b13 |
| M24 | `$C27C`/`$C285` the borrow (`-1`) dropped | b14 |
| M25 | `$C293` the shield ENDS the sweep | b14 |
| M26 | `$C28C` a hit with no shield stops killing | b14 |
| M27 | `$CBD1` becomes a silent return | b8 |
| M28 | the fork reuses `mode5Body`'s order | b5 |
| M29 | `$C65F` `AND #$06` becomes `AND #$0E` | b1 |
| M30 | the `$9A76` -> `$C772` call removed | a12 |
| M31 | `$8BD9`'s sprite-pass call removed | b13 a12 |
| M32 | `$C267`'s whole sweep removed | b14 |
| M33 | `$A4E1` status `$80` -> `$00` (not armoured) | b1 |
| M34 | `$A517` clears the Ys as well | b2 |

Every one of the fourteen checks is reddened by at least one mutant.

### THE SURVIVOR, AND WHY IT IS A FINDING RATHER THAN A GAP

**M12: deleting `$CBB2`'s `LDA $AE / BNE $CBC0` one-shot reddens nothing.**
`$AE` exists so that at most ONE arm fires per driver pass. But `$CBD1` is W32c
and throws, so the FIRST ripe group ends the pass and no second group is ever
reached -- the one-shot has no observable consequence in this port. It becomes
testable the moment W32c ports `$CBD1`, and it is written into the check's own
comment so the next wave inherits the obligation rather than the illusion.

### FOUR CHECKS THAT COULD NOT FAIL, FOUND AND FIXED

These were survivors on the FIRST mutation run and are recorded rather than
quietly repaired, because the green run before the fix was worthless and looked
identical to the green run after it:

1. **b10's fixture never entered the code.** It set the group's parity byte
   `+$03` to 0; `$CC3B DEC` takes it to `$FF`, which is ODD, so `$CC45 RTS` fired
   and every assertion about the segment chain held **vacuously**. M15 and M16
   both survived. Fixed to `+$03 = 1`, plus an explicit "and it produced angles"
   assertion so a vacuous pass cannot come back. This is
   `docs/knowledge/03`'s shape 1 and it is the second time this project has
   shipped it.
2. **b5/b6 could not distinguish the two parities** because both paths reached
   the `$A2F0` scope guard and threw. M9 survived. Rewritten to use `$60 = 0` so
   the fork RUNS, and to read `$5B` -- which is the ROM's own signal that a frame
   forked (`$96A0 INC $5B`, read by `$9A9C` and `$9ACA`).
3. **b13 counted sprites where it needed to count SLOTS.** M22 (the cull
   advancing the OAM cursor) changes no sprite count at all. Rewritten to pin
   the byte index of segment 2 against `$8B39`'s rotated base and to walk the
   remaining four down `nextSlot`.
4. **b5's order check read the COMMENTS.** It regexed `$969x JSR $xxxx` out of
   the source, which survives any reordering of the statements those comments
   sit on (M28). Rewritten to extract the CALL NAMES in source order; the
   comment scan and a `prg.bin` read of the six `JSR` operands stay as the
   cross-check that the comments and the cartridge still agree.

---

## §8. WHAT I COULD NOT REACH -- attempts, not absences

* **A cartridge comparison of anything in this wave.** No corpus scenario
  reaches stage 5; W31 measured the endchain trajectory dying three times inside
  stage 2 and game-overing at f14333, and W32a re-confirmed it over 47
  scenarios. W32a's fallback -- a `$19` poke that rides one chunk crossing --
  does not transfer: its run 1 accidentally loaded chunk 2 and produced **2,533
  frames with live `$0600` arm groups on the board**, which is precisely this
  subsystem, but reproducing it as a COMPARISON needs the port to survive
  `$BEF3` and `$CBD1` (both W32c) for those frames. **That is the single highest
  -value thing W32c can do and it is nearly free**: `tools/oracle/b559poke.py`
  already knows how to open the window, and W32a recorded that opening it at
  f1400 instead of f1338 is what loads the arm chunk.
* **Any measurement at a rank but `$17 = 0`.** `$CA49`, `$CA50`, `$CA57` and
  `$CBCA` are all rank rows; the checks read row 0 out of `prg.bin` and pin the
  row COUNTS (7 each), but no run exercised rows 1-6.
* **A shape above 1.** §6. I looked at every live wave record in all seven
  stages, all four reachable `$C67A` rows and both xrefs of `$A4A6`. I did not
  scan for an indirect or computed write to `$65` -- the same gap the recon
  declared.
* **`$CC1F` rows 2 and 3** (`$56 $04` / `$76 $04`) are exported and unread.
* **The `$8C02` attribute values `$42` and `$82`.** The checks exercise index 0
  (`$02`, bit 7 clear) and index 2 (`$C2`, bit 7 set). Indices 1 and 3 are
  transcribed and unexercised.
* **`$CD65`/`$CD85` at every angle.** b10 walks whatever five angles one call
  produces and checks each against the table; it does not sweep all 32.
* **The `$9F` sprite budget actually biting inside `$8C06`.** `$8C6F BMI $8C77`
  needs 62 sprites already stored; the arm fixtures have no objects at all. The
  branch is transcribed, with its "the RTS ends the GROUP, not the pass" note,
  and it is unexercised.

---

## §9. OPEN ITEMS HANDED FORWARD

1. **W32c's three routines**, and `$CBD1` first: it throws from inside a ported
   driver, which is the only place in this subsystem where a half-ported gap
   sits behind working code.
2. **M12 becomes testable when `$CBD1` lands.** §7.
3. **The stage-5 cartridge comparison** described in §8, first bullet.
4. **`stagewaves.py` is still broken on the inline-5 stride** (recon §8 open
   item 1). Not touched this wave; still not in `test-all.mjs`.
5. **`wavecensus.py` and `handlerclosure.py` are still not CI-wired** (recon §8
   open item 4).
6. **No reader found for `B+$02`, `B+$06`, `B+$07`** -- unchanged from the
   recon, and stated as "not found", not "unused".

---

status: DONE
