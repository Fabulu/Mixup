# Wave 6 review: weapons and the kill chain (firing, shots, missiles, enemy death, score)
status: DONE
wave: 6   role: review   started: 2026-07-29   (calendar rolled to 07-31 mid-run)

## The task, as I understood it

READER for commit `4c7f07b`. Verdict on behaviour preservation and fidelity to
the cartridge. NARROWED remit: run the fast gate myself; re-run only the oracle
scenarios wave 6 touches; read the diff against ROM bytes; break >= 2 of the
wave's new checks and see them red; and then LIST EXPLICITLY what I did not
re-run. No edits to src/, no commits. Nothing was staged or committed by me
(`git diff --cached --name-only` empty at start and at end).

## What I did

1. Read `docs/worklog/README.md`, `docs/knowledge/01`, `02`, `03` in full.
2. Ran the fast gate (below).
3. Wrote my OWN 6502 disassembler (scratchpad `dump.py`, PRG at file offset
   `16 + (addr - 0x8000)`, 32 KB, no banking) and read every address the new
   code cites out of `Gradius (USA).nes` directly. Deliberately not through
   `export_assets.py`'s helpers (docs/knowledge/03: two sides independently
   derived).
4. Broke four things and watched them go red; restored each and re-verified the
   file sha256 against the pre-break value.
5. Diffed `scenarios.json` STRUCTURALLY (json, not regex) old vs new.
6. Read the 28 recorded oracle artifacts' `seedRam` blobs directly.

## What I MEASURED

### The gate, this tree, by me

```
node --test games/gradius/tests/
# tests 222  # pass 222  # fail 0  # skipped 0  # todo 0   duration 6364 ms

node games/gradius/tools/test-all.mjs
  28 scenarios, 9062 of 9062 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  neuter lead1          -> RED, 193 TIER 1 failures (good)
  neuter seed-x+1       -> RED, 116 TIER 1 failures (good)
  neuter laginject=450  -> RED, 640 TIER 1 failures (good)
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

GREEN with 0 skipped STAGES. The "6 fields SKIPPED" line is field-level, is
pre-existing (`porttrace.mjs NOT_PRODUCED`, dropped 9 -> 6 in wave 5), and is
printed with a reason per field, which is what docs/knowledge/03 asks for.

I did NOT re-run `scen.py`. Per the remit; and the corpus artifacts on disk are
the ones the implementer recorded.

### ROM byte checks (all read by me out of the .nes, all MATCH the code)

* `$A0E0-$A16D` firing block: disassembled `$A0E0-$A16F`. Every instruction in
  weapons.js's comment block is byte-for-byte what is in the ROM. Tables
  `$A0E0` = 06 07 06, `$A0E3` = 06 07 24, `$A0E6` = 01 02 01.
* `$A131` IS a fall-through (`DE A3 03 DEC $03A3,X` then straight into `$A134
  LDA $0126,X`) -- no branch over slot B. Port models it. `$A12F BNE $A15C` is
  on `$35`, and the port writes the `$35 == 0` arm out. Correct.
* `$A159` DEC after the cross-reload, `$A14E CMP #$02 / BEQ $A15C` jumps over
  BOTH `$A154` and `$A159`: slot B's spawn frame reads `$35 - 1` only when
  `$44 != 2`. Port correct.
* `$A16F-$A1E5` missile loop and `$A1E6-$A234` shot loop: disassembled whole.
  Tables `$A1A4` = 02 00, `$A1A6` = 00 02, `$A1A8` = 80 00. Fly = dy 2,
  dx $0080; crawl = dy 0, dx 2. Two kill thresholds ($F8 for sub 0/2, $F0 +
  carry for sub 1) confirmed at `$A1FD` / `$A229`/`$A22B`.
* `$A235` / `$A250` / `$A26B`: confirmed `STA $0363,X` / `$0366,X` / `$0369,X`,
  the `AND #$01` on slot A's subtype and its ABSENCE on slot B (`$A263 9D 66 01`),
  `ADC #$06` on the missile's Y, and `$A284 RTS` with no `JMP $EC1E` (silent).
* `$BFE2-$C049` outer sweep and `$BFED-$C044` inner sweep: confirmed. The dy
  borrow is real -- `$C01C CMP $A3 / BCS $C030` means the ADC-path carry is
  CLEAR at `$C025 SBC $032C,Y`, so dy = a1 - y - 1. Port has the `- 1`.
* `$C055-$C0C6`: confirmed, including `$C0AE CMP #$01 / BEQ $C0C6` (the laser
  is not consumed) and `$C0B7` being the FALL-THROUGH tail of the kill.
* `$BE93-$BEE9`: confirmed, including `$BEB1 D6 48 DEC $48,X` + `BNE $BEB7`
  with A already 0 (the underflow / carrier-promotion), and `AND #$1F` (not
  `$7F`) for the explosion script.
* `$8455-$850F`: confirmed byte for byte. `$84BD 69 05 ADC #$05` is entered
  with the carry the `CMP #$0A` set, so it adds SIX -- the implementer's claim
  is right and I re-derived it independently. `$84F0` is `F6 20` = INC $20,X
  (my own disassembler table had $F6 wrong; the ROM byte is INC, the code is
  right). `$849E STA $07E0,X` really does write TOP, not the player.
* `$C3AF-$C3D1`, the two carry fall-throughs the implementer flagged for
  re-derivation: **both confirmed independently.** `$C3B7 CPX #$06 / BCC $C3BD`
  -- the only way to reach `$C3BB ADC #$03` is X >= 6, and CPX sets carry
  exactly then, so a missile probes Y+**4**. `$C3BF CMP #$01 / BNE $C3CE` --
  the laser arm is the EQUAL arm, CMP sets carry on equality, so `$C3C9 ADC #$0A`
  adds **$0B**. Wave 5's `+3 / +$0A` comment was wrong and is correctly fixed.
* `$C2C4-$C2EF`: `$C2EA JSR $C0BD` -- the port is right to inline only the last
  three stores and NOT zero `$A9` in the terrain loop.
* `$C3E9-$C40E` vs `terrain.js probeCollision`: the ROM returns the field IN
  PLACE (`AND $C40F,Y`) and `$C2CF-$C2D6` shifts it down; the port returns it
  pre-shifted. I traced the shift loop for $A3 = 2 and it is exactly
  equivalent (the loop's early `BNE` exit is unreachable because the field is
  non-zero whenever the caller did not already take `BEQ`). Documented in code.
* The missile participates in the ENEMY sweep too (`$BFE2` runs X = 8..0, i.e.
  object slots 3..11) and its box is the 4th entry of each `$BFCE` table
  (`$BFD1`=08, `$BFD5`=$10, `$BFD9`=00). The exported block covers it.

### Deliberate breaks, all seen RED, all restored byte-identical

sha256 before == after for `score.js` (adbfdf04...), `collision.js`
(6b720cd6...), `weapons.js` (098b805e...).

| break | what | result |
|---|---|---|
| `score.js $84BD` `a+5+1` -> `a+5` | drop the decimal-adjust carry | **RED** 2/222: `$84A9` and `$84D3/$84F7`. NOTE: the corpus cannot see this -- every kill adds $10, low nibble 0. |
| `collision.js $C3C6` `+0x0B` -> `+0x0A` | the laser terrain probe | **RED** 1/222: `$C3C6`. |
| `weapons.js $C3B4` `y+4` -> `y+3` | the missile terrain probe | **RED** 1/222: "the unported arms are loud" (the crawl case moves off cell $055B). |
| `weapons.js $A131` add `doB = false` | turn the fall-through into a continue (docs/knowledge/02 trap 1) | **RED at CORPUS level**: `autofire-normal` 105 divergent, `autofire-laser` 121, `autofire-double` 97, `autofire-die` 9; `autofire-missile` clean. First divergences at w_03A6@495 / @435 / @433 / @442. |

`node games/gradius/tools/oracle/compare.mjs --only autofire-normal,autofire-laser,autofire-double,autofire-die,autofire-missile`
is 5/5 PASS unbroken (seen in the full gate run above).

### Structural diff of the corpus definition

```
watch old 447 new 521   (+74, NOT the +73 the report claims)
removed: none
align/bootPrefix/knownFail/expectDying: unchanged
scenarios old 23 new 28; 5 added; 0 removed; 0 EXISTING SCENARIO CHANGED
```
No existing scenario's script, poke, frame count or annotation moved. Combined
with 28/28 PASS at 9062/9062 frames, existing behaviour is preserved.

### THE DEFECT: `$2A` is $01, not $02

`src/main.js` `bootState()` and `introEntryState()` both set
`s.extraLife[0] = s.extraLife[1] = 0x02` and both say `MEASURED $02 in the seed
of all 28 scenarios`. `src/state.js` and `src/score.js` repeat it. It is $01.

Two independent measurements:

1. All 28 recorded oracle artifacts. `seedRam` is base64 of $0000-$07FF; I
   validated the indexing on `$20`=3 / `$21`=3 / `$35`=$14 and on
   `intro-respawn`'s `$20`=2:
   ```
   every scenario:  $2A=$01  $2B=$01
   ```
2. The cartridge's own initialiser, which sits in the SAME instruction block as
   the lives byte the port DOES get right:
   ```
   82FA  A9 03     LDA #$03
   82FC  85 20     STA $20
   82FE  85 21     STA $21
   8300  A9 01     LDA #$01
   8302  85 2A     STA $2A
   8304  85 2B     STA $2B
   ```
   and the per-player reset `$9725 A9 01 / $9727 95 2A STA $2A,X`. The only
   other writers are `$84EE` (the port's own `$84D3` arm) and `$8EC5` (a bulk
   clear).

The oracle cannot see it: `porttrace.mjs seedFromRam` reads `r(0x2A)` from the
cartridge's RAM, so the compared path gets $01 and stays green. `bootState()` /
`introEntryState()` are only on the BROWSER path (`boot()` calls
`introEntryState`) and on `collision-unwitnessed.test.js`. This is precisely the
hole `porttrace.mjs`'s own header names -- "the risk is that seeding HIDES an
initialisation bug". Effect on the shipped game: the first extra life is granted
at the wrong score.

### The check that cannot fail

`weapons.js fireWeapons()` ends with

```js
if (iters !== state.zp.options + 1) {
  throw new Error(`$A108 ran ${iters} objects for $45 = ${state.zp.options}`);
}
```

`iters` is incremented once per iteration of `for (let x = state.zp.options; x >= 0; x--)`,
so it is `options + 1` by construction. The comment above it claims "The port
asserts the range rather than reading past slot 5 / 8 / 11 in silence". It does
not. MEASURED (scratchpad `opt.mjs`, driving `fireWeapons` directly):

```
$45 = 3   -> NO THROW.  anim[3..11] = 6,6,6,6,0,0,0,0,0
                        i.e. it wrote slot 6, which is slot B of owner 0
$45 = 12  -> NO THROW.
```

The PORT IS STILL FAITHFUL here -- `$A108 LDX $45` has no guard on the
cartridge either and would alias the same slots -- so this is a decorative
check plus a false comment, not a behaviour divergence. The same tautology is
in `missileLoop` (`iters !== 3`), `shotLoop` (`iters !== 6`) and, pre-existing,
`shotSweep` (`iters !== 9`). The one that DOES have teeth is
`shotVsEnemies`'s `iters !== ENEMY_SLOTS && !freed`, because `$A9` is written
by `$C0BB`.

### $17 (rank): the implementer's own caveat, checked and enlarged

`0017` is not in `watch` and there is no `state.zp17`. The report says "both
readers test >= 3". I counted the ROM's `$17` references: **27** sites,
`$9C5B STY $17` the writer. The ones that matter and their thresholds:

```
$BBE5  LDA $17 / CMP #$03   enemy bullets ($BBB7, PORTED)
$BCB8  LDA $17 / CMP #$03
$BD5F  LDA $17 / CMP #$02   <- threshold 2, not 3
$BDB3  LDA $17 / CMP #$02   <- threshold 2, not 3
$BF42  LDY $17 / CMP $BEEA,Y   table index; $BEEA[0] = $BEEA[1] = $02
$C09F  LDY $17 / CMP $BFC5,Y   the unported $C099 arm
plus 15 x `LDY $17` inside enemy/boss handlers ($AFFC $B48D $B4BC $B4D4
$B6A2 $B7BB $B82C $BA18 $BA34 $BA6E $BAE4 $C948 $C9A6 $CA5E $CADF $CBAB)
```
All 28 artifacts record `$17 = 0` at the align frame, so the port's 0 is right
at the seed. The report's "the autofire pokes make the cartridge's $17 = 1" is
NOT what the recorded seeds show ($17 = 0 in every one) -- if it becomes 1
mid-window that is unrecorded, because `0017` is unwatched. The conclusion
(safe today) survives, because 0 and 1 are on the same side of both the `>= 2`
and the `>= 3` tests and `$BEEA[0] == $BEEA[1]`. The reasoning is thinner than
stated. Wave 7 adding `0017` to `watch` is the right call and is now doubly
justified.

## What I did NOT re-run

Handed forward for the final full-corpus pass.

1. **`python games/gradius/tools/oracle/scen.py` -- the oracle side was NOT
   re-recorded.** Everything I compared against is the artifact set the
   implementer produced. If the recording harness or the ROM path had drifted,
   I would not know. A regression looks like: compare.mjs green against stale
   artifacts.
2. **The 23 pre-wave-6 scenarios were re-COMPARED (all 28 ran in my gate) but
   their four deliberate-break validations were not re-run beyond the three the
   gate injects (`lead1`, `seed-x+1`, `laginject=450`) on the 4-scenario subset
   `wiggle,corner-br,speed3-diag,opt2-wiggle`.** A regression here looks like a
   scenario that has quietly stopped testing itself (wave 5 found one).
3. **No pixel / renderer stage exists in the gradius gate at all.**
   `tools/oracle/rendergate.py` and `rendercheck.py` are in the tree and are
   NOT in `test-all.mjs`; I did not run them. Shadow OAM is compared only as
   entry 0 (`s0y/s0t/s0a/s0x`) plus three COUNTS (`msExpanded`,
   `spriteRecords`, `spritesStored`). Page `$02` is not watched. Wave 6 is the
   first wave that puts NEW sprites on screen (shots, missiles, explosions) and
   moves the HUD's score digits; a wrong OAM byte for a shot, at a right count
   and from right `$0123`/`$0363`, is not caught by anything I ran.
   docs/knowledge/02 trap 2 is exactly this shape.
4. **`state.sfx` is recorded and NEVER compared.** No oracle counterpart until
   wave 8 hooks `$EC1E`. Every `requestSfx` id, its ORDER, and the count per
   frame (six on a DOUBLE volley with two Options) are unverified against the
   cartridge. Only `tests/weapons.test.js` holds them.
5. **Everything before each scenario's align frame.** `bootState()` is on no
   compared path; `introEntryState()` is compared only from frame 282 of
   `intro-boot`. This is where the `$2A` defect above lived undetected --
   assume there are others in the same seeded set (`$20/$21`, `$0A`, `$48`,
   `$07E0-$07E2`, `$42`, `$46`, `$2A/$2B`).
6. **The loud-throw arms, i.e. what the port does NOT do.** I confirmed each
   throws and names its address, and I confirmed by ROM reading that the shapes
   described are real, but I did not measure that they are unreachable: the
   armoured `$C05F`, the type-`$9A` `$C099` + `$BFC5[$17]`, the wall-break
   `$C2DC`/`$C32F`, the missile crawl `$A19E`, shot-vs-bullet `$BF7D`, the
   stage-5 arms `$C03D`/`$A17C`, and wave 7's `$C1AF`. `autofire-laser` and
   `autofire-double` carry movement segments whose only purpose is to dodge
   `$C1AF`; I did not re-measure that those segments still dodge it, only that
   the scenarios pass.
7. **Two-player.** `$A0FA LDX $18` is a throw; `$18` is 0 in every seed. Never
   exercised.
8. **`verify_assets.py --self-test` ran inside the gate (PASS) but I did not
   independently re-derive its 35 mutations**, nor did I check that the four
   new weapons mutations are the only ones that can catch a wrong weapons
   table.
9. **`tools/build-dist.mjs`'s ROM-leak guard.** Not run by me. `assets/weapons/
   tables.json` is a NEW ROM-derived cache file; it is under the gitignored
   `assets/` tree and `git status` shows it untracked-and-ignored, but I did not
   run the publish guard to confirm it is excluded from `dist/`.

## What I could not do, and why

* Attribute the `$17` mid-window value on the cartridge -- `0017` is unwatched
  and I did not re-record. Bounded above instead.
* Confirm the implementer's per-arm execution counts ("0 executions in every
  run made here", "$BF75 entered 2482 times"): those come from Mesen hook runs
  I did not repeat. The unit tests prove the throws fire; nothing I ran proves
  the arms are cold on the cartridge.

## If someone picks this up cold

The wave is sound. The ROM transcription is the most accurate I have checked in
this repo -- the two carry fall-throughs at `$C3AF` are a genuine find and I
re-derived both from the bytes without using the implementer's reasoning. Two
things to fix, neither of which the gate can see:

1. `src/main.js` lines ~113 and in `bootState()`: `0x02` -> `0x01`, and the
   three "MEASURED $02" comments in `main.js`, `state.js` and `score.js` with
   it (rule 6). Evidence is `$8300 LDA #$01 / STA $2A / STA $2B` and 28
   artifacts. There is no check that would go red either way -- if you fix it,
   add one that reads `$2A` out of `seedRam` and compares it to `bootState()`'s,
   which is a check the whole seeded set needs, not just this byte.
2. `weapons.js fireWeapons()`: either make the `$45` assertion real
   (`state.zp.options > 2` is the thing worth throwing on) or delete the
   sentence claiming it guards the range.
