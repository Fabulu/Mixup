# Wave 38 IMPLEMENTER — the end-of-game chain `$9872` and the loop wrap

status: IN PROGRESS
implementer, 2026-08-04

Brief: port the end-of-game chain and let `$1A` increment, wrapping the game to
loop 2. The plan calls this "W35 — The end-of-game chain / loop wrap"
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

## §1. THE SWEEP FIRST — the states this wave reaches, BEFORE any port work

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
`$86` and hits `$9872` at frame 460 — i.e. **the chain is on the ordinary
stage-7 path and nothing else is between here and it.**

## §2. THE BRIEF'S PREMISE — CHECKED, AND IT HOLDS, BUT THE PLAN'S SCOPE DOES NOT

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
— `$97BF STA` (persist), `$9B72 LDA` (restore) and **`$9889 INC $28,X`**, inside
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
| `$CEAC` | absent | absent — **this wave** |

`grep -n zp1A games/gradius/src/*.js` returns eight reader sites and no throw.
So the loop cost is **the chain plus `$CEAC`**, not the chain plus five items.
`$1A` is pinned at 0 for one reason only: `$9889` is unported.

## §3. WHAT THE CHAIN ACTUALLY IS — and the plan is wrong about its shape

The plan's table reads `$9872` -> `$8B $988C` -> `$BB0F` -> `$CE94` -> `$8C` ->
`$8D`. **Four sub-states are missing from that list, and they are the reason the
ending happens over STAGE 1's terrain.** `$9872` does `INC $1B` from `$86` to
`$87`, and `jt_$982F[7..10]` are `$9B3E $9BED $9C12 $9C1E` — **the ordinary
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
**unreachable from `$988C`** — `$988C` tests `$57` first. Not clamped: the port
calls `introTerrain` exactly as the ROM's `JMP $9C24` does, and the arm is dead
by the caller's test, not by anything this wave wrote.

(filled in as work lands)
