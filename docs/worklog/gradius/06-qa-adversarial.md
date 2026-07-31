# Wave 6 QA (adversarial): weapons and the kill chain — firing, shots, missiles, enemy death, score
status: DONE
wave: 6   role: qa   started: 2026-07-31

## The task, as I understood it

Reader. No src/ edits, no commits. NARROWED remit:
- re-run the fast gate (`node --test games/gradius/tests/`, `node games/gradius/tools/test-all.mjs`)
  and read the SKIP count.
- re-run ONLY the oracle scenarios wave 6 touches; say which.
- read the diff against the ROM bytes.
- break >= 2 of the wave's new checks and watch them go red.
- and then LIST EXPLICITLY what I did not re-run, so the final full-corpus pass has it.

Lens: adversarial. Assume it is broken.

## What I did

1. Read docs/worklog/README.md in full, then the wave-6 commit `4c7f07b`.
2. Ran the fast gate on the user's tree (see MEASURED).
3. Disassembled every ROM range wave 6 claims, from the cartridge in place
   (`Gradius (USA).nes`, PRG at file offset 16 -> $8000), with a throwaway
   wrapper over `games/gradius/tools/nesdis.py`. Ranges checked byte for byte:
   $A0E0-$A16E, $A16F-$A1E5, $A1E6-$A234, $A235-$A284, $A1A4-$A1A9 (tables),
   $BE6E-$BEE9, $BF75-$BF7C, $BFC5-$BFE1 (tables), $BFE2-$C0C6, $C2C4-$C2FF,
   $C3AF-$C40E, $8455-$850F.
4. Built an ISOLATED SANDBOX rather than editing src/ (I am a reader):
   `scratchpad/qa6/g` = a copy of games/gradius with src/ and tests/ restored
   from commit 4c7f07b, plus assets/, tools/, tools/oracle/out/scen, game.json
   and index.html. Baseline in the sandbox: the five wave-6 test files 70/70
   pass, and compare.mjs on the six wave-6 scenarios 2254/2254 frames, 0
   failures -- identical to the user's tree.
5. Ran 61 distinct deliberate breaks in the sandbox. Every one restores the file it
   touched; `git status games/gradius` at the end shows I changed nothing.
6. RECORDED TWO NEW ORACLE SCENARIOS from the cartridge (sandbox only), for the
   two states the wave's own corpus deliberately avoids.

## What I MEASURED

### The gate, on the user's tree, AFTER it was clean again (see PROCESS below)

```
$ node --test games/gradius/tests/
1..222
# tests 222 / # pass 222 / # fail 0 / # skipped 0 / # todo 0

$ node games/gradius/tools/test-all.mjs
  28 scenarios, 9062 of 9062 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  GREEN -- 6 passed, 0 failed, 0 SKIPPED

$ python games/gradius/tools/verify_assets.py --self-test
  35 of 35 mutations reddened their target; 13 of 13 families seen red
  (weap-shift / weap-laser-width / weap-missile-dy / weap-kill-sfx all RED)
```

The six SKIPPED FIELDS are pre-existing (no port counterpart) and are printed on
every run. The gate's "0 SKIPPED" is stages, not fields; both numbers read.

### The oracle scenarios I re-ran, and only those

```
$ node games/gradius/tools/oracle/compare.mjs --only \
    autofire-normal,autofire-laser,autofire-double,autofire-die,autofire-missile,opt2-wiggle
  6 scenarios, 2254 of 2254 frames compared, 0 failures
```

`opt2-wiggle` is in that list because wave 6 made `fireWeapons()` run on every
frame of it ($45 = 2, A never pressed, so the six reload timers $03A3-$03A8 tick
down and are compared per frame).

### The ROM, byte for byte

Every range wave 6 claims matches the cartridge. Nothing below is quoted from a
doc; each was disassembled out of `Gradius (USA).nes` during this run.

* $A0E9-$A16D firing, $A16F-$A1E5 missiles, $A1E6-$A234 shots, $A235/$A250/$A26B
  spawns -- the port's inline listings are correct instruction for instruction,
  including all four fall-throughs ($A131, $A159, $A21C -> $A1F6, $C0B7).
* the carry claims hold: `$C3B7 CPX #$06 / BCC / ADC #$03` is only reached with
  the carry SET (X >= 6 is the only way past the BCC), so a missile probes at
  Y + 4; `$C3BF CMP #$01 / BNE` reaches `$C3C9 ADC #$0A` only on the EQUAL arm,
  carry SET, so the laser probes at X + $0B. Both confirmed independently.
* `$84BD ADC #$05` is entered with the carry the `CMP #$0A` set, i.e. +6.
* `$84A5` is `STX $98 / LDX #$00` falling into `$84A9`, so the extra-life
  threshold's addend is 1. Confirmed.
* `$C023 LDA $A1 / SBC $032C,Y` has no SEC and the carry is CLEAR from the CMP
  above it, so dy is one MORE than the difference. Confirmed.
* `$BEB1 DEC $48,X / BNE` branches on the RESULT with A = 0. Confirmed.
* assets/weapons/tables.json matches the PRG for all five blocks:
  params $A0E0-$A0E8 `06 07 06 06 07 24 01 02 01`; missileStep $A1A4-$A1A9
  `02 00 00 02 80 00`; killSfx $BE6E-$BE8F (34 = $22 entries, exactly the
  `CPX #$22` guard); shotBoxes $BFCE-$BFD9 `08 10 08 08 | 10 30 10 10 |
  08 08 08 00`; rankHits $BFC5-$BFCD `05 05 05 05 06 07 08 09 0A`. And
  collision/tables.json boxes $BFDA-$BFE1 `10 20 30 10 10 20 30 02`.
* callers, from a full PRG scan: `$C055` has EXACTLY ONE (`$C02D`);
  `$BE93` three (`$C0AB`, `$C1A6`, `$C1D0`); `$8463` two (`$BFB1`, `$C0A6`);
  `$C3AF` two (`$A182`, `$C2CA`); `$C0BD` one (`$C2EA`). That single caller of
  $C055 is the basis of finding 2 below.

### TWO NEW ORACLE SCENARIOS, recorded from the cartridge in this session

The wave's five autofire scenarios all have $45 = 0, and the only scenario with
$45 = 2 (`opt2-wiggle`) never presses A. So the firing block's per-object loop
had never executed more than ONE iteration on a firing frame anywhere. I closed
that, in the sandbox, with `scen.py` against the real cartridge:

```
  qa-opt2-fire  700 frames  poke 0045=2@400-699   tail 120:DA,180:A
  qa-all-on     660 frames  poke 0044=1,0045=2,0041=1@400-659  tail 120:DA,140:A

$ node tools/oracle/compare.mjs --only qa-opt2-fire,qa-all-on
  PASS  qa-opt2-fire   299 frames  all TIER 1 fields exact
  PASS  qa-all-on      259 frames  all TIER 1 fields exact
  2 scenarios, 558 of 558 frames compared, 0 failures
```

Both genuinely exercise what they were built for -- `qa-opt2-fire` puts a live
shot in all six slots $0123-$0128 with all six timers moving; `qa-all-on` puts
subtype 1 in all six shot slots AND subtype 3 in all three missile slots
$0129-$012B at once. THE PORT IS EXACT ON BOTH. The tails carry 120 frames of
DOWN because with the ship parked it walks into the capsule its own kills drop
and hits wave 7's `$C1AF` throw (the same reason autofire-laser/double do).

### The break campaign: 61 distinct breaks, 39 RED and 22 PASSED

RED (the wave's checks work): $A131-as-continue (2 unit + 332 corpus),
$A246 AND #$01 dropped (71), $A124 CMP #$02 -> #$03 (84), $A14E likewise (79),
$A263 slot-B subtype AND 1 (83), $A11F timer $35+1 (65), $A1FD $F8 -> $F0 (266),
$A218 top-kill $10 -> $0C (21), $A21C step 4 -> 7 (78), $A275 born at +5 (8),
$A1B9 >= -> > (8), $A160 free-slot test dropped (8), $A1C7 carry dropped (1),
$C023 borrow dropped (46), the dying ship FIRES (59), addScore -> $07E8 (15),
copyTopScore comparisons swapped (12) -- plus a dozen that are unit-RED only.

PASSED -- these are the findings. Each was GREEN on every unit test AND on all
EIGHT scenarios (the six above plus my two new ones, 2812 frames):

| break | what it means |
|---|---|
| firing loop $45..0 -> 0..$45 | tests/weapons.test.js:87 SAYS this is red. It is not. |
| missile loop 8..6 -> 6..8 | no check on the order |
| shot loop 0..5 -> 5..0 | no check on the order |
| $C058's arm does not consume the shot | the arm is UNREACHABLE (finding 2) |
| $A18B 2nd probe (+8,-8) -> (-8,+8) | the wall/crawl split is unverified |
| $A199 -> $A1D6 wall kill deleted | ...and its ported half never runs |
| $BFDE -> $BFDA (enemy height -> width) | $0460,Y is 0 on all 9062 frames |
| shotProbe's x>=6 ? 4 : 0 -> 0x77 | dead: shotsVsTerrain only passes x = 0..5 |
| $C3B2 empty-slot early-out deleted | dead |
| $C0C3 STA $0103,X deleted | $0103-$010B is 0 throughout |
| $A1AC STA $0123,X deleted | the missile's per-frame metasprite re-store |
| $A177 liveness from type, not subtype | the two are always set/cleared together |
| $A1D0 BCS (missile X carry-out) | never reached |
| $BFF9 LDA #$FF (X saturation) | unreachable IN PRINCIPLE, see finding 5 |
| $849A BCD overflow arm -> writes player | score never overflows 3 BCD bytes |
| $C0A6/$C0A9 score-then-kill order swapped | unobservable |
| $BEAA carrier==1 arm -> writes 0 | no run kills an already-flagged carrier |
| $A12F branch on $35 -> unconditional | $35 is $14 always (honestly written out) |
| $C037/$C03D and $A17C stage-5 throws deleted | $19 is 0 always |
| $C2F1 dying/stage-3 gate inverted | pre-existing (wave 5), $19 never 2 |
| the `iters !== ENEMY_SLOTS` assertion deleted | knowledge/03 shape (a) |
| nmi.js `state.sfx.length = 0` deleted | nothing checks sfx at all |
| $BE99 CPX #$22 -> #$40 | corpus-blind (unit-RED, so covered) |
| $84BD +6 -> +5 | corpus-blind (unit-RED, so covered) |
| $84D3 extraLife deleted | corpus-blind (unit-RED, so covered) |

The last three are listed for completeness: they are corpus-invisible but a unit
test catches each, which is the arrangement the wave intended.

### Data behind the coverage claims

`$0460-$0469` (the enemy box class, `$C020 LDX $0460,Y`) is **0 on every frame
of all 28 recorded scenarios** and of both scenarios I recorded. Checked
directly in the artifacts. So `$BFDE,X` is a constant $10 everywhere.

`$BFF9`'s saturation is unreachable by construction, not by luck: `shotLoop`
runs before `shotSweep` in the same frame and frees at x >= $F8 (subtypes 0/2,
$BFCE = $08 -> $F7 + 8 = $FF) and at x >= $F0 (the laser, $BFCE = $10 ->
$EF + $10 = $FF). Both maxima are exactly $FF with no carry.

## PROCESS: another agent wrote to games/gradius/src/ while I was measuring

At the start of my run `git status games/gradius` was clean. Minutes later
`games/gradius/src/weapons.js` carried

```
-        // ...and FALLS THROUGH into $A134. doB stays true.
+        doB = false;  // BREAK: treat $A131 as a continue, not a fall-through
```

(captured with `git diff`; file mtimes 22:04 and 22:06 on collision.js and
weapons.js). It was restored again shortly after. Rule 3 says exactly one agent
writes to src/ at a time; whoever that was is not honouring it. Consequences:
my FIRST gate run straddled a foreign edit and is not trustworthy -- the numbers
in this file are from the RE-RUN on the clean tree -- and every measurement I
made after that point was made in the isolated sandbox, restored from 4c7f07b,
so none of it can be polluted by the other agent.

## What I did NOT re-run

Handing this list to the final full-corpus pass. Anything here is a scheduled
check, not a covered one.

1. **The other 22 scenarios under my breaks.** They were run once, clean, by
   `test-all.mjs` (28 scenarios, 9062/9062, 0 failures). I ran NONE of my 61
   breaks against them. A wave-6 regression visible only in `intro-boot`,
   `intro-respawn`, `pause`, `terrain-death`, `terrain-death-miss`,
   `enemy-waves`, `long-idle`, `s0-handover`, `idle` or the 12 movement
   scenarios would not have been seen by my campaign. Concretely: `enemy-waves`
   is the one with many live enemies and no firing -- a break in the sweep's
   ENEMY side (not the shot side) is exactly what it would catch and my subset
   would not.
2. **`scen.py` for the 28 existing scenarios.** Deliberately not re-recorded
   (the narrowed remit). I trusted `tools/oracle/out/scen/*.json` as the
   implementer left them. I did re-record two NEW ones, so I know the recorder
   works today against this cartridge. A regression here would look like: the
   artifacts are stale relative to the current `watch` list, and compare.mjs
   silently compares fewer fields than the header claims.
3. **`$17` (rank).** Unwatched, and I did NOT measure it on the cartridge. The
   implementer's claim that the autofire pokes make the cartridge's $17 = 1 is
   unverified by me. What I DID verify from the PRG: wave 6's only reader is
   `$C0A1 CMP $BFC5,Y`, inside the unported `$C099` throw, and `$BFC5[0..3]` are
   all $05 -- so ranks 0-3 are indistinguishable there anyway. Wave 7 must add
   `0017` to `watch`.
4. **Sound.** `state.sfx` is recorded by the port and compared by NOTHING (my
   break proved it: deleting the per-frame clear is green everywhere). Every sfx
   id, count and ORDER in wave 6 rests on unit tests alone. Wave 8.
5. **The loud-throw arms**, none of which any run reaches and none of which I
   could reach: armoured `$C05F`, type-$9A `$C099`, wall-break `$C2DC`/`$C32F`,
   missile crawl `$A19E`, shot-vs-bullet `$BF7D`, stage-5 `$C03D`/`$A17C`,
   two-player `$A0FA`, attract demo `$846F`, `$C18C`, `$C1AF`, `$C1C1`.
6. **The renderer.** I ran no visual/capture test and no `tests/visual`. Wave 6
   moves `msExpanded`/`spriteRecords`/`spritesStored` (they are red in several
   of my breaks), so the display list IS downstream of this wave.
7. **The root `src/` (batman/Mixup) tree.** Out of scope, untouched, unmeasured.
8. **Long windows.** Every wave-6 scenario is 239-599 compared frames. Nothing
   holds A for thousands of frames, so a slow drift (a timer that is off by one
   every hundredth reload, a score byte that wraps at 4 digits) is unmeasured.

## What I could not do, and why

* I could NOT produce a behavioural divergence. 8 scenarios, 2812 compared
  frames including two states the wave's own corpus avoids, 0 divergent frames.
  Everything I found is a coverage or documentation defect, not a wrong byte.
* I could not exercise the enemy box class, the armoured branch, the crawl, a
  breakable wall or an enemy bullet from a button script -- those need a poke
  the harness does not have (an enemy TYPE poke), which is a wave-7+ tool.

## If someone picks this up cold

* The sandbox is `<scratchpad>/qa6/g` -- a full games/gradius copy with src/ and
  tests/ from 4c7f07b, `tools/oracle/mesen.py`'s `DEFAULT_ROM` repointed at
  `C:/programmieren/batman/Gradius (USA).nes`, and two extra scenarios in
  `tools/oracle/scenarios.json`. `<scratchpad>/qa6/run.py` + `b*.json` replay the
  whole break campaign. Nothing under `games/` was modified by me.
* The two new scenarios are worth adopting into the real corpus verbatim
  (`qa-opt2-fire`, `qa-all-on`); they cost ~90 s to record and they are the only
  thing in existence that runs the firing block's loop more than once on a
  firing frame.
* The three findings worth acting on are, in order: the `$A108` test that says
  it catches loop order and does not; the `$C058` arm that is unreachable while
  two comments say it is a live alternative to `$C011`; and the missile's
  wall-kill branch, whose ported half and both offsets nothing can see.
