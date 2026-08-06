# Wave 38 IMPLEMENTER - the end-of-game chain `$9872` and the loop wrap

status: DONE
implementer, 2026-08-04

Brief: port the end-of-game chain and let `$1A` increment, wrapping the game to
loop 2. The plan calls this "W35 - The end-of-game chain / loop wrap"
(`29-plan-whole-game.md`); W35/W36/W37 are taken, so this wave is 38.

---

## BASELINE, MEASURED BY ME BEFORE ANY EDIT

`git HEAD 1dcde6c`, `games/gradius/src` clean.

```
node games/gradius/tools/test-all.mjs   GREEN -- 12 passed, 0 failed, 0 SKIPPED
    ... and 6 FIELD-level skips inside compare.mjs, which the gate line does
    NOT mention: pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins.
    A gate-level skip count of 0 is not a field-level skip count of 0.
stageledger.py    ALL 598/598, 100.0 %; all seven stages ADMITTED
                  (BASELINE[6] in the tool still reads `debt` -- W36's open item)
stagesweep.mjs    110 chunk runs, 154,000 nmi() frames, 3.87 s,
                  0 undecided throws, 7 of 7 stages swept
node --test games/gradius/tests/   619 pass, 0 fail, 0 skipped
```

## §1. THE SWEEP FIRST - the states this wave reaches, BEFORE any port work

`stagesweep.mjs` seeds `$1B = $80` and cannot leave it, so it says nothing about
the chain. What it *can* be asked is the question W36 asked: stage 7 seeded at
each of the sixteen `$982F` play sub-states and run. My own probe
(`scratchpad/w38probe.mjs`, 900 frames per state, PASSIVE, stage `$19 = 6`,
chunk-0 stream pointer), on the untouched tree:

```
  $80  clean 900f            $80 -> $A0 -> intro 1,2,3,4
  $81  THREW f460  $9872     $81 -> $82 -> $83 -> $86 -> the chain    <-- THE PATH
  $82  clean 900f (counting)
  $83  THREW f0    "enemy tables: $0000 is not in any exported range"  PRE-EXISTING
  $84  clean       $85  clean
  $86  THREW f0    $9872
  $87  THREW f0    $9B3E (jt_$982F arm 7)
  $88  THREW f0    $9BED      $89  THREW f0  $9C12      $8A  THREW f0  $9C1E
  $8B  THREW f0    $988C      $8C  THREW f0  $98DD      $8D  THREW f0  $98E5
  $8E  clean       $8F  clean
```

**Eight of sixteen states threw before I touched anything; seven of the eight
are this wave's scope and the eighth (`$83`) is the KNOWN PRE-EXISTING null wave
cursor.** The `$81` row is the important one: seeded at the sub-state `$9A4D`
hands over at `bossPage`, stage 7 counts its 458 frames, passes `$83`, reaches
`$86` and hits `$9872` at frame 460 - i.e. **the chain is on the ordinary
stage-7 path and nothing else is between here and it.**

## §2. THE BRIEF'S PREMISE - CHECKED, AND IT HOLDS, BUT THE PLAN'S SCOPE DOES NOT

### 2a. `$1A` is a scalar, re-derived rather than inherited

`loop-1a-recon.md` says `$1A` is a rank scalar, not a wave-stream selector. I
re-derived it from `rip/prg.asm` instead of quoting it. **Every instruction in
the PRG that names `$1A`, all eleven:**

```
$82EC STA $1A   cold-boot zero        $9B74 STA $1A   restore from $28,X
$97BD LDA $1A   persist into $28,X
$B003 LDA $1A   +1 on a $17-indexed row of $B01D      $B951 LDA $1A   two STA
$BBBF ORA $1A   gate flag             $BBC9 LDA $1A   +1/+2 rung
$BC44 LDA $1A   branch                $BD42 / $BD96   second ADC on a bullet
$CEAC LDA $1A   clamp to 6, ASL, TAX, LDA $CF2D,X
```

There is **no `$1A,X` / `$1A,Y` form and no `$001A` absolute** anywhere (both
scanned separately). `$1A` reaches an index register exactly twice: `$B007 INY`
and `$CEB5 TAX` after `CMP #$06 / BCC / LDA #$06`. So it can select a row of
`$B01D` (9 bytes) and a word of `$CF2D` (7 words, and all seven are `$CF3B`) and
**nothing else**. It cannot select a wave stream, a terrain base or a `(zp),Y`
pointer pair. **The premise holds.**

And the increment: `$28,X` has exactly **three** instructions in the whole PRG
- `$97BF STA` (persist), `$9B72 LDA` (restore) and **`$9889 INC $28,X`**, inside
`$9872`. One increment, one gate.

### 2b. WHERE THE BRIEF'S PLAN IS STALE: the loop gates are ALREADY GONE

`29-plan-whole-game.md` W35 says to "drop the two `zp1A !== 0` throws
(`enemies.js:791`/`854`)" and "port the three trivial `$1A` scalars (`$BBC9`,
`$B951`, `$CEAC`)". **Two of those five items were done by waves that landed
after the plan was written.** Measured on this tree:

| `$1A` reader | plan says | actually |
|---|---|---|
| `$B003` | ported | ported, `enemies.js:3781` |
| `$B951` | absent (boss not ported) | **ported**, `enemies.js:4178` (W26) |
| `$BBBF` | THROW | **ported**, `enemies.js:1289` (W29) |
| `$BBC9` | covered by the throw | **ported**, `enemies.js:1293-1295` |
| `$BC44` | THROW | **ported**, `enemies.js:1387` |
| `$BD42` / `$BD96` | ported | ported, `enemies.js:1669` / `1626` |
| `$CEAC` | absent | absent - **this wave** |

`grep -n zp1A games/gradius/src/*.js` returns eight reader sites and no throw.
So the loop cost is **the chain plus `$CEAC`**, not the chain plus five items.
`$1A` is pinned at 0 for one reason only: `$9889` is unported.

## §3. WHAT THE CHAIN ACTUALLY IS - and the plan is wrong about its shape

The plan's table reads `$9872` -> `$8B $988C` -> `$BB0F` -> `$CE94` -> `$8C` ->
`$8D`. **Four sub-states are missing from that list, and they are the reason the
ending happens over STAGE 1's terrain.** `$9872` does `INC $1B` from `$86` to
`$87`, and `jt_$982F[7..10]` are `$9B3E $9BED $9C12 $9C1E` - **the ordinary
stage-intro ladder, entered through the PLAY dispatcher instead of `$96C5`.**

```
$86  $9904   $19 == 6 -> JMP $9872
     $9872   INC $1B (->$87); $2001 := 0; $3F := 0; $26,X := 0; $24,X := 0;
             $22,X := ($42 ? 1 : 0);  INC $28,X   <- THE ONLY LOOP INCREMENT
$87  $9B3E   the full wipe. $19 := $26,X = 0 (STAGE 1) and $1A := $28,X = loop+1
$88  $9BED   stop sound, the four HUD packets, INC $1B, $57 := 0
$89  $9C12   lives / top score / score
$8A  $9C1E   the power-up meter
$8B  $988C   $57 == 0 -> JMP $9C24 (stream four terrain columns, DO NOT advance)
             $57 != 0 -> the BRAIN: clear slots 9 and 8, slot 9 type $28 at
                         ($A4,$88), slot 8 metasprite $9E at ($74,$80),
                         $0100 := 0 then 3, INC $1B, sfx $E8, INC $1F,
                         canned packets $21 and $05
$8C  $98DD   INC $5B / JSR $ADAB / JMP $9A8C   -- objects only, no player,
             no collision, no spawn engine: the brain scene runs here
$8D  $98E5   INC $5B / $1B := 0 / JMP $9B3E    -- the ordinary intro, and
             $9C3C then sets $1B := $80: LOOP 2, STAGE 1
```

**`$988C` and `$9C24` are the SAME rung of two different ladders.** `jt_$96C5[4]`
is `$9C24` directly; `jt_$982F[11]` is `$988C`, which *falls into* `$9C24` while
the terrain streamer is still catching up and diverts to the brain the frame it
has (`$57`). That is the whole trick: the ending replays the stage-1 intro and
then, instead of starting play, spawns the brain on top of it.

`$9C24`'s own `$57 != 0` arm (`$9C38` -> `$9C3C` -> `$1B := $80`) is therefore
**unreachable from `$988C`** - `$988C` tests `$57` first. Not clamped: the port
calls `introTerrain` exactly as the ROM's `JMP $9C24` does, and the arm is dead
by the caller's test, not by anything this wave wrote.

## §4. THE PORT

| ROM | what | file |
|---|---|---|
| `$9872`-`$988B` | the loop wrap | `src/nmi.js` `loc9872` |
| `jt_$982F[7..10]` | the intro ladder, reached through `$982A` | `src/nmi.js` `playArm` |
| `$988C`-`$98DC` | the brain spawner | `src/nmi.js` `st988C` |
| `$98DD`-`$98E4` | the scene frame | `src/nmi.js` `st98DD` |
| `$98E5`-`$98ED` | the wrap into the intro | `src/nmi.js` `st98E5` |
| `$BB0F`-`$BB81` | dispatch entry 40, the brain | `src/enemies.js` `h_BB0F` / `loc_BB66` |
| `$CE94`-`$CF2C` | the typewriter | `src/enemies.js` `loc_CE94` |
| `$CF2D`-`$CF4D` | the loop-indexed script table + the script | `assets`, new block `endingScript` |

`$4E` and `$4F` are new zero-page fields; `$9B3E`'s `$3D`-`$97` wipe clears both.

### 4a. THE FALL-THROUGH, INCIDENT SEVENTEEN

```
BB6F  A9 AC      LDA #$AC
BB71  CA         DEX                      X := 8
BB72  20 28 CB   JSR $CB28   -->  CB28  20 1E EC  JSR $EC1E
                                  CB2B  A9 00     LDA #$00      <-- sub_CB2B,
                                  CB2D  9D 2C 04  STA $042C,X       NO RTS above
BB75  A9 05 / 9D 6C 01          animFrame[20] := 5
```

`$CB28` is a one-instruction routine that FALLS INTO `$CB2B`, the explosion
conversion. Read `$BB72` as a plain sound request and slot 8 keeps its type 0
and its live metasprite `$9E`, and the very next instruction writes an
explosion-script index into an object that is not an explosion - a wrong scene
with nothing throwing. Mutant M39 is exactly that misreading.

This one is doubly easy to get wrong because `$CB28` has three xrefs (`$AF82`,
`$BB72`, `$BF6F`) and the port's own comment at `$AF82` already says it falls
through; the trap is that the comment is 800 lines away from the new caller.

### 4b. `$4F` IS A COUNT *AND* A PHASE, WHICH IS WHY THE TEXT RE-SENDS ITSELF

`$CED6 STA $9A` seeds the emit loop from `$4F`, and `$CF23 DEC $9A` runs BEFORE
each character, so tick *n* writes *n+1* characters into a **fresh packet at the
same PPU address** `$22C8`. The line is re-drawn from scratch every tick; there
is no "append one character" anywhere. Then:

```
$00-$7F   emit ($4F + 1) characters
$80       $CF0C on the script's $FE ... and $CF09 INCs it in the same frame,
          so $4F is NEVER OBSERVED as $80 -- it goes 16 -> $81
$81-$FE   $CECA waits for pulse 1 ($B2) to go free
$FF       $CECE, +10,000 points ($843F is $9B:$9A:$99 = 01 00 00), and $BB16
          stops calling $CE94 at all
```

### 4c. THE ONE DESIGN CALL, AND IT IS A TRANSCRIPTION NOT A MODEL

`$BB0F` opens `LDX #$09` and **discards the slot it was dispatched for**. The
port does the same rather than throwing on `j != 9`. A guard would have been
inventing behaviour: on the cartridge a type `$28` in any slot drives slot 9's
fields, and the only producer of type `$28` in the whole ROM is `$988C`, which
uses slot 9. (Checked: `census.py` reports entry 40 with no wave record in any
of the seven stages naming type `$28`.)

## §5. WHAT THE CHAIN MEASURES - 1,256 FRAMES, EVERY LEG DERIVED

`$1B = $86`, `$19 = 6`, no input, driven through `nmi()`:

```
 f0     $86 -> $87    $9872. $1A's source $28,X goes 0 -> 1
 f1     $87 -> $88    $9B3E: $19 := 0, $1A := 1
 f2..f4 $88 $89 $8A   one frame each
 f4..f27              $988C loops on $9C24 -- 23 frames               <- derived
 f27    $8B -> $8C    the brain spawns at ($A4,$88)
 f183                 path record 26 consumed -- 156 frames           <- 26 x 6
 f353                 SETTLED. 170 frames of $BB6B waiting on $D4
 f514                 first character -- 161 frames                   <- $A0 + 1
 f658                 the $FE, $4F -> $81 -- 144 frames               <- 16 x 9
 f973                 $4F := $FF, +10,000 points. 315 frames on $B2
 f1229  $8C -> $8D    256 frames of DEC $4C from 0                    <- derived
 f1230  $8D -> $01    $98E5
 f1256  $04 -> $80    the second intro, 26 frames    LOOP 2, STAGE 1
```

Four of those legs are exact arithmetic off the listing and are asserted as such
in `tests/w38-ending.test.js`: 23 (`$9C24` from a zero streamer lead, the same 23
the boot intro measures), 156 (26 records at `$BB2F CMP #$06`), 161 (`$4E := $A0`
plus a tick), 144 (sixteen more at 8 DECs + a tick) and 256 (`$4C` is 0, so
`$BB1F` walks the whole byte). The two SOUND legs - 170 frames on `$D4` and 315
on `$B2` - are the driver's, not a timer's, and are reported as measured
rather than derived.

**DOES THE GAME END? Yes.** **DOES IT LOOP? Yes.** **IS `$1A` STILL PINNED? No:
it reads 1 on the frame `$9B3E` restores it and 2 after a second lap.**

## §6. WHAT LOOP 2 ACTUALLY DOES - swept, not assumed

`$1A` stopped being structurally pinned this wave, so eight readers went from
dead-but-faithful to live and **nothing in the corpus can reach a second lap**.
`stagesweep.mjs` gains `--loop N` (default 0; the gate passes nothing else) and
seeds `$1A` *and* `$28,X`, because an intro inside the run would otherwise put
it back. All seven stages, both modes, 1400 frames a chunk:

```
          runs   nmi() frames   undecided throws   DECIDED ($9751)
loop 0    110      152,881             0                  8
loop 1    110      151,910             0                 28
loop 2    110      151,462             0                 31
loop 3    110      151,462             0                 31
loop 6    110      151,462             0                 31
```

Three things fall out of that table:

1. **No stage produces a new undecided throw at any loop.** The `$9751` cells
   are the KNOWN PRE-EXISTING shipped game-over crash (W34 item 3, mode 0 not
   ported) and are already on the sweep's DECIDED list. They appear only in the
   PASSIVE runs: a pad-down run survives 1400 frames on most stages at loop 0
   and dies on 28 of 110 at loop 1 and 31 of 110 at loop 2+. That is loop
   difficulty, observed from the outside, by a fixture that does nothing at all.
2. **LOOP 2, LOOP 3 AND LOOP 6 ARE IDENTICAL FRAME FOR FRAME** - 151,462 in all
   three, the same 31 cells. That is not luck and it is the listing: every
   *gameplay* reader of `$1A` branches on zero / non-zero (`$B003 INY`, `$B951`,
   `$BBBF ORA`, `$BC44 BNE`, `$BD42`, `$BD96`) except `$BBC9`, whose ladder is
   `BEQ / INY / CMP #$02 / BCC / INY` - **three tiers: 0, 1, and >= 2.** So
   loops 3 through 7 are gameplay-identical to loop 2, and the "7-loop ceiling"
   (`$CEAC`'s clamp on a table whose seven entries are the same word) is
   decoration on top of a difficulty ladder that tops out at **loop 3**. That is
   a correction to `29-plan-whole-game.md`'s "Max supported loop = 7", which is
   true of the ending TABLE and not of the game.
3. Loop 1's 151,910 vs loop 2's 151,462 is `$BBC9`'s middle rung, measured.

**Loop 0's own row moved this wave, and it is §7a's fix, proved by a CONTROL
RUN rather than assumed.** Before, loop 0 was 154,000 frames (110 x 1400, i.e.
nothing terminated early) and 0 DECIDED. A COPY of the tree with **only** the
`res.stage` -> `res.stages[$19]` line reverted, same tool, same flags:
`110 chunk runs, 154000 nmi() frames, OK -- 0 undecided throws`. So the eight
new `$9751`s are all stage 5 PASSIVE, and they are the fix working: a
pad-down ship dies, respawns, and the intro now rebuilds **stage 5's** terrain
instead of stage 1's - which has walls in it - so the next life dies too and
the run reaches game over. One line, one behaviour change, one control run.

## §7. TWO PRE-EXISTING DEFECTS THIS WAVE FOUND AND FIXED

Neither is in the brief and neither is mine; both are in routines the chain
newly routes through, which is how they surfaced.

### 7a. `introTerrain` STREAMED THE WRONG STAGE'S TERRAIN

`src/flow.js`'s four `buildBlock` calls - `$9C24`'s `JSR $9D8E` x4 - passed
`res.stage`, the stage the LAUNCHER selected, while `streamBlock` at `$9ACE` has
passed `res.stages[state.zp19]` since W27's seamless transition. **Same ROM
routine, two different stages.** So every stage-2+ intro built STAGE 1's blocks,
and a stage-2+ intro is not exotic: it is what `$979D` does on **every respawn**.
On stage 1 the two expressions are the same object, which is why nothing caught
it - including `src/assets.js`, whose comment said in so many words *"nothing in
the runtime reads `res.stage` after boot"*. That sentence is corrected in place
rather than deleted, because it is the sentence that hid the defect. Mutant M61
walks it back and reddens the suite.

### 7b. `$9B3E`'s WIPE WAS NOT CLEARING `$4D`

`LDX #$5A / STA $3D,X` covers `$3D`-`$97` and `$4D` is inside it. The port has
had a `zp4D` field since W24 and `clearZeroPage` never cleared it; the docstring
still listed `$4D` among "RAM the port has no field for". Inert on every path
measured so far (`$9A0E` rewrites the countdown pair before `$99E9` reads it,
and the death and continue timers are 8-bit), which is why nothing caught it.
Transcribed now. The cartridge comparison is unchanged at 0 failures over
29,657 frames either way, which is the evidence that it was inert - not evidence
that it did not matter.

## §8. THE SWEEP AFTER THE PORT

The same sixteen-sub-state probe as §1, same fixture, real tree:

```
  $80 clean   $81 CLEAN, walks $81 $82 $83 $86 $87 $88 $89 $8A $8B $8C $8D
                          -> intro 1,2,3,4 -> $80 with $19=0 and $1A=1
  $82 clean   $83 THROWS f0 (the PRE-EXISTING null wave cursor, unchanged)
  $84 $85 $86 $87 $88 $89 $8A $8B $8C $8D $8E $8F   ALL CLEAN
```

Seven of the eight pre-port throws are gone; the eighth is `$83` and it is
byte-identical to what W35 and W36 measured. A 2500-frame passive run from `$80`
or `$85` now ends on `$9751` - the shipped game-over crash - because a pad-down
ship eventually runs out of lives. That is not new and it is on the DECIDED list.

`stagesweep.mjs` on the real tree, after the port:

```
  110 chunk runs, 152,881 nmi() frames, 0 undecided throws,
  8 DECIDED ($9751, and they are section 7a's -- see the control run in section 6)
  7 of 7 stages swept (7 admitted, 0 forced); 0 NOT SWEPT
  ... and the "BASELINE still calls it debt" warning is GONE -- W38 lifted
      stageledger.py's row 6 to None/111/admitted, which W36 left behind.
```

## §9. COVERAGE, IN BRANCHES AND TABLE ENTRIES

| denominator | before | after |
|---|---|---|
| `$AE1C` dispatch entries (`census.py`, its number) | 40 of 42 | **41 of 42** |
| distinct handler routines | 32 of 34 | **33 of 34** |
| `$982F` play sub-states | 9 of 16 | **16 of 16** |
| `$1A` consumer sites ported (8 + the persist read) | 8 of 9 | **9 of 9** |
| wave records that spawn a ported handler | 598 of 598 | 598 of 598 |
| enemy table blocks exported | 39 | **40** |
| `tablecoverage.py` KNOWN_GAPS | 2 | **0** |

The one dispatch entry left is **27, `$B4F2`, type `$1B`** - and no wave record
in any of the seven stages references it, which is a smaller statement than
"unreachable" and is deliberately worded that way.

`$982F` reaching 16 of 16 retires HANDOVER's "play sub-states: **1 of 16**" and
its "next up: the boss and end-of-stage machine (15 of 16 sub-states)".


### 9a. `$988C` IS THE ONLY PRODUCER OF TYPE `$28`, PROVED FROM THE LISTING

Not "no measured run spawns it elsewhere" - the stronger statement, and it took
one grep: **`$989F` is the ONLY `LDA #$28` in the whole 32 KB PRG.**
`wavecensus.py` decodes all 598 wave records and none names type `$28`; the late
spawner's only type row (`$C6CC`) holds `$97` and `$A6`. So `$BB0F`'s
`LDX #$09` can never be handed a slot other than 9 by anything the cartridge
does, which is why the port transcribes the `LDX` instead of guarding it.

## §10. THE MUTATION TABLE

Harness `scratchpad/mut38.py`, on a COPY at `C:/tmp/w38mut`
(`games/gradius/` plus the repo `package.json`; the copy baselines at 0
failures). It patches source as BYTES, normalises each needle to the file's own
line endings, **refuses any needle that does not appear exactly once**, and
re-hashes all three files after every restore. All three are byte-identical
before and after every pass - `nmi.js bb028d6fa843`, `enemies.js 89deb3285d4a`,
`flow.js 42e9f9664309`. The copies are deleted.

**63 mutants. First pass: 53 red, 10 survived. Second pass, after the seven
checks §10a describes: 61 red, 2 survived, and both are provably uncatchable.**

| # | mutant | red |
|---|---|---|
| M1 | `$9889 INC $28,X` dropped - the loop counter stops | 6 |
| M2 | `$28,X := 1` instead of INC (a one-shot wrap) | 2 |
| M3 | `$987D STA $26,X` dropped - the stage is not reset | 1 |
| M4 | `$987F STA $24,X` dropped - the page is not reset | 1 |
| M5 | `$22,X` takes `$42` verbatim, not `($42 ? 1 : 0)` | 1 |
| M6 | `$987B STA $3F` dropped | 1 |
| M7 | `$9878 STA $2001` dropped - the screen stays on | 1 |
| M8 | `$9872 INC $1B` dropped | 5 |
| M9 | `$9906 CMP #$06` becomes `>= 6` | ***SURVIVED*** |
| M10 | `$9906 CMP #$06` becomes `== 5` | 7 |
| M11 | arm 7 collapses into arm 8 (`$9B3E` -> `$9BED`) | **1st: SURVIVED - 2nd: 2** |
| M12 | arms 9 and 10 swapped | **1st: SURVIVED - 2nd: 1** |
| M13 | arm 12 (`$98DD`) becomes a quiet return | 2 |
| M14 | `$988C`'s `$57` test dropped - always stream, never the brain | 2 |
| M15 | `$988C`'s `$57` test inverted | 4 |
| M16 | the brain's type becomes `$27` | 2 |
| M17 | slot 9's X and Y swapped | 1 |
| M18 | slot 8's metasprite `$9E` dropped | 1 |
| M19 | `$98C5 INC $1B` dropped - `$8B` never advances | 2 |
| M20 | `$98C9 STA $0100` dropped | 1 |
| M21 | `$98D1 INC $1F` dropped | 1 |
| M22 | the sfx `$E8` request dropped | 1 |
| M23 | the two canned packets dropped | **1st: SURVIVED - 2nd: 1** |
| M24 | `$98DD` runs the full mode-5 body, not the tail | 2 |
| M25 | `$98DD`'s `INC $5B` dropped | 1 |
| M26 | `$98E5` does not zero `$1B` | 2 |
| M27 | `$98E5` does not call `$9B3E` | 2 |
| M28 | `$BB0F` uses the dispatched slot, not the hardcoded 9 | **1st: SURVIVED - 2nd: 1** |
| M29 | the 6-frame path gate becomes 5 | 4 |
| M30 | the path cursor is not INCd | 3 |
| M31 | the `$FF` terminator is not tested | 6 |
| M32 | the record's two nibbles swapped | 1 |
| M33 | the metasprite base `$96` becomes `$95` | 1 |
| M34 | `$B647`'s tail does not reset the timer | 3 |
| M35 | the `$4F == $FF` test inverted | 9 |
| M36 | `$BB1F DEC $4C` dropped | 3 |
| M37 | `$BB23 JSR $AEF8` dropped | 1 |
| M38 | `$BB26 INC $1B` dropped - the scene never ends | 2 |
| M39 | **THE FALL-THROUGH** - `$CB28` read as a plain sound request | 1 |
| M40 | the `$D4` triangle gate dropped | 1 |
| M41 | the `$D4` gate reads pulse 1's `$B2` instead | 2 |
| M42 | `$4E` armed with 8, not `$A0` | 2 |
| M43 | `INC $0495` dropped - the brain never settles | 2 |
| M44 | `$BB75`'s animFrame override 5 -> 2 | 1 |
| M45 | `$BB68`'s blanking of the brain dropped | **1st: SURVIVED - 2nd: 1** |
| M46 | the `$1A` clamp dropped | 1 |
| M47 | the clamp is 7, not 6 | 1 |
| M48 | the script-table index is not doubled | 3 |
| M49 | `$4E` re-armed with 4, not 8 | 1 |
| M50 | the DEC/emit order flipped - n characters, not n+1 | 2 |
| M51 | the two PPU address bytes are not emitted | 1 |
| M52 | `$CF02`'s `$FF` terminator not appended | 3 |
| M53 | the `$FE` arm falls into the click instead of skipping it | 1 |
| M54 | the two click sounds swapped | 1 |
| M55 | the `$B2` pulse-1 wait dropped | 1 |
| M56 | the ending bonus is `$001000`, not `$010000` | 1 |
| M57 | the `$C3` pulse-2 gate on the ending music dropped | 1 |
| M58 | `$CF09 INC $4F` dropped - the typewriter never advances | 3 |
| M59 | `$CF12`'s restart re-reads `$CF2D,X`, not `$CF2D` | ***SURVIVED*** |
| M60 | dispatch entry 40 unwired again | 17 |
| M61 | `introTerrain` back to `res.stage` (the shipped defect) | **1st: SURVIVED - 2nd: 1** |
| M62 | `$9B3E` stops clearing `$4D` | **1st: SURVIVED - 2nd: 1** |
| M63 | `$9B3E` stops clearing `$4F` | **1st: SURVIVED - 2nd: 1** |

### 10a. SIX OF THE TEN SURVIVORS WERE HOLES IN THE SUITE, NOT FACTS ABOUT THE ROM

W36 named a third category - a defective MUTANT - and this wave adds nothing to
it. What it does add is the observation that **five of the six holes had the same
shape: the check asserted the WRONG THING WELL.**

* **M11 and M12 - `jt_$982F[7..10]` all `INC $1B`.** The check asked "where does
  `$1B` end up", which is the one property the four arms share. `$9B3E` is now
  held by what only it does - the `$3D`-`$97` wipe and the `$19`/`$1A` restore -
  and `$9C12`/`$9C1E` by their producers' byte counts, **37 and 40, which are the
  CARTRIDGE's** (measured at f285 and f286 of the boot script, recorded in
  `src/flow.js` since W4).
* **M23 - nothing looked at `$988C`'s queue at all.** Held now by a fact derived
  from `$85F3`'s control codes rather than from the packet data: packet `$21`
  ends on `$FE` (close one run) and packet `$05` takes the `$FD` arm (close one,
  open another), so the pair leaves **exactly three `$FF` terminators**. Drop
  either and the count changes.
* **M45 - DOCS/KNOWLEDGE/03, VERBATIM.** The old check was
  `assert anim[21] === 0` on a fixture where `anim[21]` had never been written.
  It agreed with itself. It now clears a real value (`$9D`, what the last path
  record leaves) with the `$D4` gate held so nothing else can be responsible.
* **M28 - every fixture put the brain in slot 9**, where `LDX #$09` and the
  dispatched index are the same number. Held by an INTERVENTION, labelled: type
  `$28` in slot 5 is a state the cartridge cannot produce (`$989F` is the only
  `LDA #$28` in the PRG), so the check proves the TRANSCRIPTION of the `LDX`,
  not a reachable state.
* **M61 and M62 - the two pre-existing defects §7 describes.** M61 is the more
  interesting: a stage check at the level's START cannot see it, because
  **every stage's first two pages are the same empty sky** - measured, all seven
  stages queue byte-identical blocks at page 0 and at page 1, and they first
  diverge at page 4. That is why the defect survived eleven waves, and the new
  fixture seeds page 4 (a state any mid-level death reaches, since `$97BB` caps
  the checkpoint at 8). It also cross-checks `$9C24` against `$9ACE` - the two
  call sites of one ROM routine, which is exactly what disagreed.

### 10b. THE TWO THAT ARE UNCATCHABLE, AND WHY

**M9 - `$9906 CMP #$06` widened to `>= 6` changes nothing, because `$19` cannot
exceed 6 on the cartridge.** The two instructions that increment it are
`$993B INC $19` (inside `$9904`'s own `$39` warp fork, which `$19 == 6` jumps
past) and `$96D1 INC $19` (the `$1B & $10` arm, reached only from `$9904`/`$984F`
setting `$1B := $90`, which `$19 == 6` also jumps past). So stage 7 is the fixed
point: nothing in the ROM can produce `$19 = 7`, and the port's `$A2F0` guard
throws before this line if anything hands it one. Equality and `>=` agree on
every state that exists.

**M59 - `$CF12`'s restart reading `$CF2D,X` instead of `$CF2D` is doubly
unobservable.** The arm needs an `$FF` inside the script and `$CF3B`'s nineteen
bytes contain none, so it never executes; and if it did, all seven words of
`$CF2D` are `$CF3B`, so the two expressions return the same pointer for every
value of `$1A`. It is transcribed from the listing and written down here rather
than "fixed", exactly as W34's M19, W35's M27 and W36's M18 were.


## §11. WHAT I COULD NOT REACH - attempts, not absences

1. **ANY CARTRIDGE COMPARISON OF ANYTHING IN THIS WAVE.** Unchanged from W32b
   through W37 and still the largest gap in the Gradius port. Reaching `$9872`
   on the board needs a seven-stage clear, and the corpus's deepest run
   (`endchain`) is a stage-1 boss timeout. Every number above is
   port-vs-listing. **Nobody has watched the brain fly in on the cartridge**,
   and its 26-record path, its typewriter cadence and its two SOUND-gated waits
   (170 frames on `$D4`, 315 on `$B2`) are the parts most likely to be wrong in
   a way only the board can show - the two waits are the driver's timing, not a
   counter, so they are exactly the kind of number this project has been wrong
   about before.
2. **The ending TEXT itself.** `$CF3D`'s sixteen bytes are CHR tile indices and
   the port queues them verbatim; what they SPELL is a question about the
   character ROM and nobody has rendered the frame. `rendergate.py` compares
   pixels only on frames the corpus reaches.
3. **`$CF12`, the typewriter's restart arm.** Transcribed and provably
   unreachable ON THIS DATA: it fires on an `$FF` in the script and `$CF3B`'s
   nineteen bytes contain none. Not clamped, not deleted; mutant M59 is
   uncatchable for the same reason and is reported as such.
4. **The `$3F` half of `$CEF6`'s click.** `LDY $06FF,X / BEQ` picks the quiet
   click when the last byte written is `$00`, and none of the sixteen characters
   is `$00`, so no value of `$4F` can take it. Forcing one would prove a JS
   branch, not a cartridge state.
5. **`$1B = $83`'s null wave cursor.** The KNOWN PRE-EXISTING item, re-measured
   by me on stage 7 this wave and character-identical to W35's and W36's. It
   sits between `$82` and `$86` on every stage's ordinary path, so it is still
   the most likely thing to stop a real stage-7 clear on a live tree. Not
   clamped and not widened.
6. **`$9751`, the game-over crash.** W34 item 3, and this wave made it MORE
   visible rather than less: a passive loop-2 run reaches it on 31 of 110 chunk
   runs, and a passive stage-5 run now reaches it at loop 0 too (section 7a).
   It is the port's declared edge (mode 0 is not ported) and it is on the
   sweep's DECIDED list, but it is now the single most reachable throw in the
   game and the loop wrap leads straight into more of it.
7. **Whether the brain's 170-frame `$D4` wait is the cartridge's.** It is
   however long sfx `$E8` holds the triangle in the PORT's driver. The driver is
   ported and validated (W8) but not on this sound.
8. **`$B7B5`/`$B797`** - W34's OPEN table-extent finding, printed every run.
   Untouched for the fifth wave running; nothing here reaches type `$97`.

## §12. OPEN ITEMS HANDED FORWARD

1. **The cartridge comparison for stages 2-7 AND for the ending chain.** The
   standing item since W32c, and the ending makes it worse: 1,256 frames of new
   behaviour with no board run behind any of it.
2. **`$9751`** (section 11 item 6). It is now the first thing a player who
   finishes the game will hit twice.
3. **The `$83` null wave cursor**, unchanged.
4. **HANDOVER's Gradius numbers were stale by roughly ten waves** - "`$AE1C`
   enemy dispatch: 19 of 42", "wave records: 454 of 598", "play sub-states: 1 of
   16", "`$1A` loop counter pinned at 0", "Gate: 9 stages", and "Gradius plays
   most of stage 1 and has no boss, no title screen and no ending". Every one of
   those was measurably wrong. **Re-measured and rewritten by this wave**
   (commit `f56e80b`), including the two counterweights the old list did not
   carry: the 6 field-level skips inside the comparison run, and the fact that
   nothing past stage 1 has ever been compared against the board.
5. **`wavecensus.py`'s `_ported_targets` anchor is still a full function
   signature** (W36 item 4), so W36's `framePackets` module-binding scaffolding
   in `src/enemies.js` is still there and still labelled for deletion.
6. **`stagewaves.py` is still broken on the inline-5 stride**; `wavecensus.py`
   and `handlerclosure.py` are still not CI-wired (W34 items 4/5).
7. **`--loop` is not in the gate.** `test-all.mjs` runs `stagesweep.mjs` at loop
   0 only. Adding a loop-2 pass would cost ~20 s and would cover eight readers
   the gate currently never executes; I did not wire it because the gate's
   budget is somebody's decision, not mine.


---

## FINAL NUMBERS

```
DONE-WHEN, as measurements:

  does the game reach its ending?   YES. $1B = $86 with $19 = 6 runs $9872 and
                                    the brain scene plays out over 1,256 frames.
  does it wrap to loop 2?           YES. It lands on $1B = $80, $19 = 0.
  is $1A still pinned at 0?         NO. It reads 1 after one lap and 2 after two,
                                    and $9889 INC $28,X is the only instruction
                                    in the PRG that can do it.
  what does the sweep say?          Before: 8 of the 16 $982F sub-states threw on
                                    stage 7. After: ONE does, and it is the
                                    pre-existing $83 null wave cursor, identical
                                    character for character to W35's and W36's.
                                    stagesweep.mjs: 0 undecided throws at loops
                                    0, 1, 2, 3 and 6.
  node games/gradius/tools/test-all.mjs
                                    GREEN -- 12 passed, 0 failed, 0 SKIPPED
                                    (and 6 FIELD-level skips inside compare.mjs,
                                    reported separately per the brief: pad2
                                    oamBudget spriteOverflow scanline cpuCycle
                                    splitSpins. Unchanged by this wave.)

stageledger.py    ALL 598/598, 100.0 %, all seven ADMITTED, and BASELINE[6]
                  lifted to None/111/admitted -- the disagreement stagesweep.mjs
                  had printed on every run since W36
census.py         41 of 42 dispatch entries, 33 of 34 distinct routines
tablecoverage.py  OK, 82 bases, 56 exported ranges, 4 extent sites, 1 OPEN
                  ($B7B5), and KNOWN_GAPS is now EMPTY
node --test games/gradius/tests/   650 pass, 0 fail, 0 skipped  (619 before)

the chain, $86 -> loop 2 stage 1, no input:
  1,256 frames.  23 stream / 156 path / 170 on $D4 / 161 + 144 typewriter /
  315 on $B2 / 256 on $4C / 26 intro.  Five of the seven are exact arithmetic
  off the listing; the two SOUND waits are the driver's and are labelled as
  measured, not derived.

the loop sweep (stagesweep.mjs --loop N, new this wave):
  loop 0  152,881 frames   0 undecided   8 DECIDED ($9751)
  loop 1  151,910          0            28
  loop 2  151,462          0            31
  loop 3  151,462          0            31        <- identical to loop 2
  loop 6  151,462          0            31        <- and to loop 6
  So the difficulty ladder has THREE rungs (0 / 1 / >= 2) and tops out at
  loop 3, not at the ending table's 7.

63 mutants, 53 red on the first pass, 10 survivors -- six of which were holes
in the suite and are now closed, and TWO of which are provably uncatchable and
written up as such. Second pass: 61 red, 2 survived.

real tree, sha256 over sha256sum of every .js under games/gradius/{src,tests},
sorted, after all mutation work:
  ad297ad0671bd036789d0d289f679b59dbc088aa039ba3df2a17467d432c5833
`git status --porcelain games/gradius/src games/gradius/tests` is empty; the
copies at C:/tmp/w38mut, w38mut2, w38mut3 and w38ctl are deleted.
```

31 new checks in `tests/w38-ending.test.js`, seven of which exist only because a
mutant survived the first pass. **Five existing checks were inverted rather than
deleted**, each named in its own comment (`enemies.test.js` - entry 40's loud
throw, on its sixth move; `flow.test.js` - `$9904`'s last out-of-scope
sub-path; `w24-substate.test.js` x2 - the `$88` routing discriminator and the
whole "unported play arms" table, which no longer has an unported arm in it;
`tables.test.js` - the `$CF2D` unexported-range check, moved to `$CF4E`).

status: DONE
