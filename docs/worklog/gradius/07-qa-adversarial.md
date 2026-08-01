# QA, adversarial: wave 7 (the power-up loop -- capsule, meter, shield)
status: DONE
wave: 7   role: qa   started: 2026-08-01   commit under review: b9a40d1

## The task, as I understood it

READER. Do not edit `games/gradius/src/`. Do not commit. NARROWED remit:
re-run the fast gate; re-run ONLY the oracle scenarios this wave touches and
name them; read the diff against the ROM bytes; break at least two of the
wave's new checks and watch them go red; and then SAY EXPLICITLY what I did
NOT re-run. Lens: adversarial -- try to make the wave fail.

I did not edit `src/` at any point. Every mutation below was applied to a
SCRATCH COPY of `games/gradius` at
`%TEMP%/claude/.../scratchpad/g7/games/gradius`, with `tools/oracle/out` a
Windows junction back to the real (gitignored, ROM-derived) artifacts and the
cartridge hard-linked, not copied. `git status --porcelain games/gradius/src`
is empty at the end of this run.

## What I MEASURED

### 1. The gate, run by me, twice (start of run and after the re-record)

```
node --test games/gradius/tests/
# pass 256   # fail 0   # skipped 0

node games/gradius/tools/test-all.mjs
  35 scenarios, 11695 of 11695 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins).
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

The "6 fields SKIPPED" is a FIELD count, not a stage count, and is pre-existing
(five probe.lua fields with no port counterpart, plus pad2). The stage verdict
is 0 SKIPPED. Both figures reproduce the implementer's report exactly.

### 2. Oracle scenarios I RE-RECORDED from the cartridge (2m27s)

```
python games/gradius/tools/oracle/scen.py --only \
   capsule-pickup capsule-consume capsule-sweep capsule-shield capsule-die right-wall
```

`right-wall` is included because it is `capsule-shield`'s stated control.
Every one of the six re-recorded artifacts is **byte-identical** to the
committed one (JSON-compared key by key, `why` excluded):

```
capsule-pickup IDENTICAL   capsule-consume IDENTICAL   capsule-sweep IDENTICAL
capsule-shield IDENTICAL   capsule-die   IDENTICAL     right-wall     IDENTICAL
```

So the oracle side is genuinely a fresh derivation from `Gradius (USA).nes` and
not a hand-edited file, and every compare run below is against real ROM data.

Transitions read out of the artifacts by me (not quoted from the report):

```
capsule-pickup  w_0042 [(647,0,1)]   w_0040 []          w_0044 [(401,0,1)]  w_0047 [(530,0,1),(678,1,2)]
capsule-consume w_0042 []            w_0040 [(647,0,1)] w_0044 [(401,0,1)]  w_0047 [(530,0,1),(678,1,2)]
capsule-sweep   w_0042 [(461,0,2),(481,2,0),(501,0,3),(521,3,0),(541,0,4),(561,4,0),
                        (601,0,5),(621,5,0),(641,0,6),(661,6,0)]
                w_0040 [(421,0,1),(661,1,2)]  w_0044 [(481,0,2),(521,2,1)]
                w_0045 [(561,0,1),(581,1,2)]  w_0046 [(621,0,5)]  w_0041 [(441,0,1)]
                w_0017 [(481,0,1),(561,1,2),(581,2,3),(621,3,4)]
capsule-shield  w_0046 [(401,0,5),(493,5,4),(509,4,3),(526,3,2),(542,2,1),(647,1,0)]
                w_0017 [(401,0,1),(647,1,0)]  w_0047 [(561,0,1),(779,1,0)]
capsule-die     w_0042 [(626,0,6),(635,6,1),(690,1,2),(914,2,1)]
                w_0035 [(283,0,20),(635,20,4),(914,4,20)]  w_0044 [(401,0,1),(914,1,0),(915,0,1)]
```

**capsule-pickup collects at f647, not f626.** See finding F1.

### 3. The diff against the cartridge bytes

Every address in the commit message was disassembled by hand out of
`Gradius (USA).nes` (mapper 3, 32K PRG, file offset = `0x10 + addr - 0x8000`).
Verified correct against the port:

* `$894B-$8973` -- `INC $42`, `CMP #$07 / BCC $8969`, `JSR $CE89`, `BNE $895C`,
  `LDA #$04 / STA $35`, `CMP #$05 / BNE $8965`, `LDA #$10 / JSR $8455`,
  `LDA #$01 / STA $42`, `JSR $845B`, `LDA #$0D / JSR $EC1E`, `JMP $8A30`.
  Note the `$8958` arm leaves A = 4, so `digit == 0` and `digit == 5` really are
  mutually exclusive -- the port's two independent `if`s are equivalent.
* `$8455` puts A in `$9A` and zeroes `$99`/`$9B` (+$001000); `$845B` puts $50 in
  `$99` (+$0050). Confirmed byte for byte.
* `$CE89 = LDA $18 / ASL / ASL / TAY / LDA $07E5,Y / AND #$0F`. Port's
  `score[4 + 4*player + 1]` is the right byte.
* `jt_8989` at `$8989` = `8983 89A1 89AF 89BB 89CF 89D3 8997` -- seven entries,
  in the port's order. All six refusal branches land on `$8983 RTS` with `$42`
  untouched. `$89CF LDA #$01 / BNE $89BD` enters DOUBLE's `STA $98` (the port's
  comment says `$89BF`, one instruction late -- cosmetic).
* `$9C45-$9C5D` -- `LDX $44 / BEQ / INY`, `TYA / CLC / ADC $45 / TAY`,
  `LDA $46 / BEQ / INY`, `LDA $19 / BEQ / INY`, `STY $17`. Exactly the port.
* `$C136` loop tail, `$C13D`/`$C159`/`$C17D`/`$C181`/`$C186`/`$C18A` dispatch,
  `$C18C-$C1AC` (free, sfx `$0B`, `LDY #$09` down-loop with the three skips,
  `JMP $C20A`), `$C1AF-$C1B5`, `$C1B8-$C1CD` (`BPL $C1CD`, `LDA $46 / BEQ
  $C1D6`, `DEC $46`, `BPL $C1D0`, `LDX $A8 / INC $046C,X`). All match.
  `$A8 == Y == j` confirmed from `$C101 LDA #$09 / STA $A8` and
  `$C115 LDY $A8`, so `$046C,X` is `s0460[j + 12]`.
* `$C1FD = TYA / TAX / JMP $AEF8`; `$AEF8` zeroes `$030C,X $010C,X $012C,X
  $014C,X $016C,X` -- `freeSlot()` clears exactly those five.
* `$8AAC` READS `$9E` (`$8AE0 ORA $9E`) and never writes it, so re-passing the
  original `$0180,X` mask to the second expansion is right.
* `$8B47`'s loop index is `$9D` itself (`$8B47 LDX $9D`), NOT a rotated slot --
  the rotation `$2F += $44` is on `$9C`, the OAM write cursor. So
  `LDA $9D / BNE $8B89` really is "object slot 0", and the port's
  `if (slot !== 0)` is correct. I checked this specifically because a rotation
  on the object index would have made the force field follow the wrong object.
* `$02` is INC'd at `$80BE`, AFTER `$80A7 JSR $8B10`. The port increments
  `state.frame` after `buildDisplayList` -- so `$8B7D LDA $02` sees the
  pre-increment value in both. Correct.

Two things the wave declared as "read off the listing, unverified", which I
have now VERIFIED from the bytes and which can be upgraded in the notes:

* **terrain ignores `$46`.** `$C2B0 LDA $02 / LSR / BCC $C2FF`, then
  `$C2B5 LDA $0100 / CMP #$02 / BCS $C2C4 / JSR $C3A3 / BEQ $C2C4 /
  $C2C1 JMP $C1D6`. There is no `$46` anywhere in that path. The src note
  saying "unverified" is now conservative rather than wrong.
* **`$BBE5` is unreachable on stage 1 by construction.** `$BBBD LDA $19 /
  ORA $1A / $BBC1 BEQ $BBEC` jumps the whole ladder, `$BBE5 LDA $17 /
  CMP #$03` included, and `$BBEC STY $98` with Y still 1. Confirmed from the
  bytes AND re-measured (below).

### 4. The 23 readers of `$17`, enumerated and then MEASURED

A naive opcode+operand scan of the whole PRG for `$17` gives 25 hits. One
(`$87D4 ASL $17`) is inside a palette table, i.e. data; one is the writer
`$9C5B STY $17`. That leaves exactly **23 reads**, which is the number the port
claims -- so that figure is now measured rather than quoted:

```
9A0E AFFC B48D B4BC B4D4 B6A2 B7BB B82C BA18 BA34 BA6E BAE4
BBE5 BCB8 BD5F BDB3 BF42 C09F C948 C9A6 CA5E CADF CBAB
```

`$9C45` is the only writer. I then ran the cartridge under `pow.py` with exec
hooks, on **capsule-sweep's own script and its own thirteen pokes**:

```
python games/gradius/tools/oracle/pow.py --frames 720 \
  --script "200:,10:S,190:,320:B" --from 400 \
  --poke "42=1@420-420,...,42=1@660-660" --zp 17,42,44,45,46 \
  --wexec "AFFC,B008,BBE5,BC59,C099,BF3B,C18C,C1AF,C1C1,894B,8974,AFD7"

  f   17  42  44  45  46      wexec $8974 n=410   $894B n=0   $AFD7 n=0
  400   0   0   0   0   0     wexec $AFFC n=0     $B008 n=0   $BBE5 n=0
  481   1   0   2   0   0     wexec $BC59 n=0     $BF3B n=0   $C099 n=0
  561   2   0   1   1   0     wexec $C18C n=0     $C1AF n=0   $C1C1 n=0
  581   3   0   1   2   0
  621   4   0   1   2   5
```

and again on the busiest stage-1 scenario, `enemy-waves` (1466 compared frames):

```
python .../pow.py --frames 1866 --script "200:,10:S,190:,1466:RD" --from 400 ...
  $8974 n=1556  $9C45 n=1556
  $AFFC n=0  $B008 n=0  $AFD7 n=0  $BBE5 n=0  $BC59 n=0  $BF3B n=0  $C099 n=0
```

`$AFFC` is the one I went looking for and did not find in the report: it is
`LDY $17 / (INY if $19) / (INY if $1A) / LDA $B01D,Y / STA $04EC,X /
STA $040C,X`, i.e. a RANK-INDEXED table write into two WATCHED arrays
(`w_040C-w_0415`, `w_04EC-w_04F5`) which the port does not model at all. It runs
zero times on stage 1. That is a real hole scheduled rather than a bug today --
see F5.

### 5. Twenty-two deliberate breaks, applied to the scratch copy

Harness: `scratchpad/qa7break.py` + `qa7breaks.json` / `qa7breaks2.json`.
Each break asserts its anchor occurs EXACTLY ONCE, applies it, runs the FULL
35-scenario `compare.mjs` and eleven unit-test files, then restores and
re-hashes the file (SHA-256 equality asserted). Raw output:
`scratchpad/qa7break-run1.txt`, `qa7break-run2.txt`.

CAUGHT BY THE CORPUS (each with the frame):

| break | file | first divergence |
|---|---|---|
| `rank-options-tested-not-added` (`$9C4C` ADC -> a zero test) | powerup.js | w_0017 @401 and @581, 2 scenarios |
| `meter-gate-eight` (`CMP #$08`) | powerup.js | 216 field failures, playerX @779 |
| `option-cap-three` (`$89D5 BCS` at 3) | powerup.js | w_0045/w_0017/w_0042 @601, msExpanded @603 |
| `shield-value-four` (`$899B LDA #$04`) | powerup.js | w_0046 @621 |
| `apply-to-a-not-b` (`AND #$80`) | powerup.js | w_0040/w_0042 @647, 325 failures |
| `apply-redraws-cursor-always` (`$8A30` from every arm) | powerup.js | w_000E @441, w_0700+ @441 |
| `rank-recomputed-at-the-death-wipe` (rank at `$9B5E`) | flow.js | **w_0017 @914** -- capsule-die alone |
| `hud-shield-cell-never-owned` (`$8A22`) | hud.js | w_0718/w_0719 @408 and @624 |
| `hud-option-cell-owned-at-one` (`$8A15`) | hud.js | w_0713-w_0716 @568 |
| `hud-double-cell-owned-nonzero` (`$89FB`) | hud.js | w_070B-w_070E @408 |
| `hud-missile-cell-never-owned` (`$89F0`) | hud.js | w_0707-w_070A @408 |

The last four matter beyond wave 7: those `$89F0-$8A2A` owned-form arms are
WAVE 2 code that was unfalsifiable through the oracle until this wave made
`$41/$44/$45/$46` move. Wave 7 promoted four pre-existing decorative checks to
compared state, and nobody claimed it.

CORPUS-GREEN, CAUGHT ONLY BY A UNIT TEST (i.e. the implementer's declared
unexercised set, independently confirmed -- each of these went RED on the named
test, so the tests are not decorative):

| break | closed by |
|---|---|
| `dying-ship-may-spend` (`$0100 >= 1`) | `$8974: the ship must be EXACTLY alive...` |
| `armoured-accumulator-wrong-index` (`$0460,X` for `$046C,X`) | `$C1C1: the shield absorbs the hit...` |
| `every-enemy-keeps-sweeping` (`$C1AC` -> `JMP $C136`) | `$C18C: the every-16th item...` |
| `every-enemy-class-threshold-2` (`CMP #$02`) | `$C18C: ...` |
| `capsule-ends-the-sweep` (`$C1B5` -> `JMP $C20A`) | `$C101/$C136: the sweep runs slot 9 DOWN to 0` |
| `force-field-no-dying-gate` (drop `$1B AND #$70`) | `$8B6F: no force field while $1B has bits 4-6` |
| `force-field-flash-always` (`$9E = 3` unconditional) | `$8B6B` and `$8B79` |
| `force-field-anim-shift-one` (`LSR` once, not twice) | `$8B6B: ...$5A + (($02 >> 2) & 3)` |

CAUGHT BY NOTHING AT ALL (both are genuinely order-independent in the modelled
state, so they are recorded as unconstrained rather than as defects):

* `pickup-cursor-before-score` -- moving `$8971 JMP $8A30` above `$8969 JSR
  $845B` inside `$894B`. corpus-green, unit-green.
* `pickup-frees-slot-after-meter` -- swapping `$C1FD` and `$894B` at `$C1AF`.
  corpus-green, unit-green.

I found **no break of a semantically load-bearing parameter that escaped both
layers.** That is a real result and it is the headline of this review.

### 6. docs/knowledge/03's four shapes, checked against the new tests

* (a) "only asserts nothing threw" -- none. Every new test asserts values.
* (b) "harness sets up state the app never has" -- three do, and all three say
  so at the code: `$42 = 7` (the jt_8989 tripwire), `$010C,Y` bit 7 (the
  armoured enemy, "unexercised on the cartridge"), `$1B = $8F`. Legitimate.
* (c) "no transitions in the sampled frames" -- the opposite. `capsule-sweep`
  carries 10 `$42` transitions, 4 `$17`, 2 `$40`, 2 `$44`, 2 `$45`, 1 `$46`,
  1 `$41` in one 320-frame window.
* (d) "the test takes the answer as an argument" -- `oam.test.js`'s `$8B6B`
  builds its expected shadow OAM by calling `drawMetasprite`, the function
  under test, so the POSITION half is a consistency check rather than an
  independent one. The metasprite IDs (`$5A $5B $5C $5D`) and the `+1`
  `msExpanded` delta are independent, and `force-field-anim-shift-one` was RED,
  so the check is not vacuous. Noted, not a finding.

## What I could not do, and why

* I did not re-record the other 29 scenarios (that is the point of the narrowed
  remit). See "NOT RE-RUN" below.
* I could not reach `$C18C`, `$C1C8`, `$8960` or `$8B79` through the oracle at
  all, for the reasons the implementer gives, and I confirmed each of those
  reasons rather than accepting them (`$47` reaches 2, `$07E5` is not pokeable,
  `$010C,Y` bit 7 is never set on stage 1, `$46` hits 0 eleven frames before
  the death). Unit tests hold all four and all four went red under mutation.
* I did not exercise any consumer of `$17`. Nothing can, on stage 1 -- measured
  above, n=0 for all seven I hooked, across two scripts.

## Findings

F1 MODERATE, rule 6 + "a number is not a fact until it is measured".
   Three surviving `f626` attributions in src/ that belong to `capsule-die`,
   not `capsule-pickup`. The implementer flagged exactly this class in their
   own report ("grep for any 626/778 I missed") and three got through:
     games/gradius/src/hud.js:65   "`capsule-pickup` puts a cursor on the bar at f626 and leaves it there"
     games/gradius/src/hud.js:301  "`capsule-pickup` collects at f626 and holds $42 = 1"
     games/gradius/src/state.js:228 "`capsule-pickup` holds it at 1 from f626"
   `capsule-pickup.json` (re-recorded by me, bit-identical to the committed
   artifact) has `w_0042 [(647, 0, 1)]` and NOTHING at 626. f626 is where
   `capsule-die`'s `0042=6@625` poke lands. `powerup.js:24` documents the
   626-vs-647 correction correctly, which makes the three survivors worse, not
   better: the file that explains the trap is next to three files that fell in.

F2 MINOR, rule 6. games/gradius/src/enemies.js:132-134 still reads
   "`$BE93` -- KILL an enemy. Wave 6. The only caller in this port is `$C0A9`
   ...; the cartridge also reaches it from `$C1D0` (the shield destroying what
   it absorbed, wave 7) and `$C19E`." Wave 7 made BOTH of those port callers:
   `collision.js armedEnemy()` calls `killEnemy` at `$C1D0` and
   `everyEnemy()` calls it at `$C1A6`. The note now understates the port. (The
   `$C19E` address is also one instruction early -- `$C19E` is `BPL $C1A9`; the
   `JSR $BE93` is at `$C1A6`.)

F3 MINOR, rule 6. games/gradius/tools/oracle/scenarios.json, `autofire-laser`'s
   `why`: "the ship TOUCHES the first capsule at f626, which is `$C1AF` -- the
   wave-7 pickup -- and a loud throw." `$C1AF` is not a throw any more. The
   f626 there is a recon number (poked from 390) and is separately not this
   corpus's frame.

F4 INFORMATIONAL. `powerup.js applyCapsule()` throws only for `$18 > 1`; `$18 == 1`
   is allowed and then reads `state.input.held`, which is player 1's `$07`,
   where `$897D LDA $07,X` would read `$08`. The comment says "playerIndex()
   above is the tripwire", but there is no `playerIndex()` call in this
   function -- the inline check is `p !== 0 && p !== 1`. Harmless today ($18 is
   0 on every measured frame and 2P is not ported), wrong as written.

F5 INFORMATIONAL, COVERAGE, and the one I would schedule. `$17` is now a
   compared byte in six scenarios, but **not one of its 23 cartridge consumers
   executes anywhere in the corpus.** Measured by me, hooks on the real
   cartridge, two scripts: `$BBE5 n=0`, `$BC59 n=0`, `$AFFC n=0`, `$B008 n=0`,
   `$AFD7 n=0`, `$BF3B n=0`, `$C099 n=0` -- in `capsule-sweep`'s own window with
   `$17 = 4`, and across 1466 frames of `enemy-waves`. So `$9C45` is verified as
   ARITHMETIC and not as an EFFECT. `$AFFC` is the sharpest of the seven and is
   not named anywhere in the wave: it writes `$B01D[$17 + ($19!=0) + ($1A!=0)]`
   into `$04EC,X` AND `$040C,X`, both of which are WATCHED arrays
   (`w_04EC-w_04F5`, `w_040C-w_0415`) that the port does not model. The day a
   stage or a loop reaches it, the corpus will go red in two arrays at once and
   the cause will not be obvious.

F6 INFORMATIONAL. Two orderings inside the wave's own new code are constrained
   by nothing: `$8969 JSR $845B` vs `$8971 JMP $8A30` inside `$894B`, and
   `$C1FD` vs `$894B` at `$C1AF`. Both swaps are corpus-green on all 35
   scenarios and green on every unit test. They are order-independent in the
   modelled state, so this is not a defect -- but it is the `apply-before-sweep`
   shape the implementer already got bitten by once, and it should be written
   down rather than rediscovered.

F7 INFORMATIONAL. tests/powerup.test.js:230 says "`$AFFC` indexes at
   `$17 + ($19 != 0)`". The bytes are `LDY $17 / LDA $19 / BEQ / INY /
   LDA $1A / BEQ / INY`, so it is `$17 + ($19 != 0) + ($1A != 0)` -- which is
   also why the table has seven entries. One term short.

## WHAT I DID NOT RE-RUN (hand this to the full-corpus pass)

1. **The 29 non-capsule oracle scenarios were not re-recorded.** I re-recorded
   only `capsule-pickup`, `capsule-consume`, `capsule-sweep`, `capsule-shield`,
   `capsule-die` and `right-wall`. I DID compare the port against all 35
   recorded artifacts, 11695 frames, on every one of my 22 break runs -- but the
   ORACLE side of the other 29 is the implementer's recording, not mine. A
   regression there would look like: a scenario whose recorded artifact was made
   before some other change and now encodes stale cartridge behaviour, showing
   up as a divergence that appears out of nowhere on the next full re-record.
   Cheap to close: `scen.py` with no `--only`.
2. **`verify_assets.py --self-test`, the ROM-leak guard in `build-dist.mjs`, the
   renderer/pixel tests and the video captures** ran only as part of
   `test-all.mjs` stages, whose verdicts I read but whose internals I did not
   inspect. A regression would look like: a green stage hiding a skipped family.
3. **Sound.** `$896C` / `$89DD` / `$C18F` push `$0D` / `$0E` / `$0B` into
   `state.sfx` and nothing compares that list -- the driver is wave 8. A wrong
   sfx id in any of the three power-up sites is invisible to the corpus today
   and is caught only by two `deepStrictEqual` assertions in unit tests. Wave 8
   should re-check those three ids against `$EC1E`'s table.
4. **The 6 SKIPPED comparison fields** (`pad2 oamBudget spriteOverflow scanline
   cpuCycle splitSpins`) and the one INFO field (`w_0036`, the OAM write cursor,
   which differs on EVERY frame of EVERY scenario by design). The force field
   adds a second `$8AAC` per shielded frame and therefore moves `$9F`, the
   unmodelled sprite budget, which is `w_0036`'s cause. Nobody has checked
   whether the shield pushes `$9F` anywhere near its `$3E` seed. A regression
   would look like: sprite dropout on a shielded frame that the port never
   reproduces because it does not model the budget at all.
5. **`$17`'s consumers.** See F5. Zero of 23 execute. When stage 2+, loop 2, or
   enemy bullets arrive, `$AFFC`/`$B008`, `$BBE5`, `$BCB8`, `$BD5F`, `$BDB3`,
   `$BF42`, `$C09F` and the eleven `$B4xx-$BAxx` reads all come alive at once.
   A regression would look like: enemy fire cadence, aim and hit points all
   wrong together on the first stage that has them, with `w_0017` itself green.
6. **Terrain vs `$46`.** I verified from the bytes that `$C2B5-$C2C1` has no
   `$46` test, but no scenario runs a shielded ship into terrain: `terrain-death`
   has `$46 = 0` and `capsule-shield` never touches the map. A regression would
   look like: a shielded ship surviving a wall.
7. **`$C24E` and `$C293`, the other two `DEC $46` sites** (enemy bullets, stage
   5) -- unported, declared, and I did not read their bytes.
8. **The every-16th item end to end.** `$C18C` is unit-tested only; the real
   `$AEC8` promotion producing status 7 has never run in any measured frame
   ($47 reaches 2). I verified `$AEC1-$AED6`'s arithmetic against the bytes
   (`LDY #$07 / INC $47 / LDA $47 / AND #$0F / BEQ / LDY #$06`) and it matches
   the port, but nothing has EXECUTED it. A regression would look like: the 16th
   capsule of a real playthrough clearing the screen at the wrong moment, or a
   frozen game if a later refactor turns the arm back into a throw.
9. **`$8960`'s `($07E5 & $0F) == 5` bonus** -- unit test only, `$07E5` not
   pokeable, declared by the implementer and confirmed unreachable by me.
10. **Two-player.** `$18 = 1` (F4) is untested everywhere in this port.

## If someone picks this up cold

The scratch harness is reusable and cost about 40 s per break (30 s full
`compare.mjs` + 10 s of unit tests):

```
scratchpad/qa7break.py  scratchpad/qa7breaks.json  scratchpad/qa7breaks2.json
scratchpad/g7/          scratch copy; tools/oracle/out is a junction, ROM a hardlink
```

Two things worth reusing beyond wave 7: (1) the naive opcode+operand PRG scan
that turned "23 readers of $17" from a quoted number into a measured one -- it
takes six lines of Python and it found `$AFFC`, which no document mentions;
(2) `pow.py --wexec` on a SCENARIO'S OWN script and pokes, which is how "is this
consumer reachable" gets answered by intervention instead of by argument.

Verdict: **the ported CODE is sound** -- twenty-two deliberate breaks, and not
one semantically load-bearing parameter escaped both the corpus and the unit
tests. The defects are documentary: F1 (three wrong frame numbers, rule 6 and
the measured-number rule, and the file that explains that exact trap is sitting
next to the three files that fell into it), F2 and F3. F5 is a coverage
statement rather than a defect, and it is the one I would put on the schedule.
