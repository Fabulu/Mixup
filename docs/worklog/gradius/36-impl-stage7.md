# Wave 36 IMPLEMENTER — stage 7 (`$19 = 6`)

status: DONE
implementer, 2026-08-04

Brief: make stage 7 play start to finish. The plan calls this "W34 — Stage 7
core" (`29-plan-whole-game.md`); W33/W34/W35 consumed those numbers, so this
wave is 36.

---

## BASELINE, MEASURED BY ME BEFORE ANY EDIT

```
stageledger.py   stage $19=6   111 distinct, 104 ported, 7 unported, 0 inline5,
                               93.7 %, first unported scroll $0AC0 (@$AD98)
                               admission: THROWS (scope guard) -- blocked
                 ALL           598 distinct, 591 ported, 98.8 %

stagesweep.mjs   96 chunk runs, 134,400 nmi() frames, 3.04 s, 0 undecided throws
                 -- and it sweeps stages 0..5 ONLY (it parses the `>= 6` guard
                 live), so it says NOTHING about stage 7.

node --test games/gradius/tests/       603 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs  GREEN -- 12 passed, 0 failed, 0 SKIPPED
```

---

## §1. THE SWEEP FORCED ONTO STAGE 7, BEFORE ANY PORT WORK

Per the brief's lesson 1. A COPY at `C:/tmp/w36sweep`
(`games/gradius/{src,assets,tools,tests}` + repo `package.json`), the `$A2F0`
guard alone lifted `>= 6` → `>= 7`, **nothing else touched**, 1400 frames/chunk:

```
  PASSIVE  stage $19=6    .     .   f1332!  .     f140! f140!  f0!
  PLAYING  stage $19=6    .     .     .     .     f76!  f76!   f0!

  7 of 112 chunk runs THREW.  Three DISTINCT causes:
    $B569  entry 30, type $1E   PASSIVE chunk 2 @f1332; PLAYING chunks 5,6 @f76
    $AF10  entry 32, type $20   PASSIVE chunks 5,6 @f140
    "enemy tables: $8010 is not in any exported range"
                               chunk 7, BOTH modes, FRAME 0
```

**All three predate this wave.** The first two are the plan's named scope. The
third is not in the plan at all and is investigated in §2.

## §2. THE CHUNK-7 `$8010` THROW — STAGE 7'S CHUNK TABLE HAS SEVEN ENTRIES

`$A7D0` holds 7 stage pointers; each stage's subtable is read with
`$61 = $3F AND $0E` as a BYTE offset, so chunk `c` is the word at
`stageTable + 2c`, `c = 0..7`. Dumped out of `prg.bin`:

```
$A7DE $A7EE $A7FE $A80C $A81A $A828 $A836   <- the 7 stage subtables
```

The gaps are **16, 16, 14, 14, 14, 14** bytes. Only stages 0 and 1 own eight
words. From stage 2 on, **each subtable's 8th word IS the next stage's 1st** --
which is why stage 2's chunk 7 is `$AAEC` = stage 3's chunk 0 (W34 noticed the
coincidence and did not say why). Stage 6 has no successor, so its 8th word is
`$A844` -- the **first two bytes of the wave-stream data**, `10 80` -> `$8010`.

**IS IT REACHABLE?** No, and the listing settles it without an emulator.
`loadChunk` is entered from `$A302 LDY $61 / INY / INY / CPY $3F / BEQ $A2D1`,
so chunk 7 needs `$3F` = 14. The camera's ceiling is `$992A LDA $3F /
CMP $98FD,Y / BCC $9947` -- `$98FD[6]` = **13** (`stage.endPage`, exported).
`13 AND $0E` = 12 -> chunk 6. Chunk 7 is entered at `$3F` = 14 and stage 7
stops at 13.

Cross-check that the reasoning is not circular: `$98FD` = `14 14 14 14 13 12 13`.
Stages 0-3 DO reach `$3F` = 14 and are exactly the stages whose chunk-7 word is
a real pointer. Stages 4, 5 and 6 stop at 13, 12 and 13 -- and stage 6, the last
one, is the only one that does not get a valid 8th word for free from the
overlap. **The ROM's table is exactly as long as its camera can index.**

So the chunk-7 run is the SWEEP seeding a state the game cannot enter
(`seedChunk` writes `$6A:$6B` directly). **Nothing is widened and nothing is
clamped**: the port's "not in any exported range" is the honest answer to a
pointer the cartridge never loads. Reported to the sweep's owner as a tool-scope
item -- `stagesweep.mjs` is W37's file and I do not write in `tools/`.

## §3. SCOPE, VERIFIED AGAINST THE LISTING RATHER THAN BELIEVED

The 7 unported records are all in stage 7's chunk-5 stream `$AD8A` (chunk 6
shares it):

```
$AD98  scroll $0AC0  cmd $4B  type $1E  x=$F0 y=$40   -> entry 30 $B569
$AD9E  scroll $0B60  cmd $63  type $20  x=$F0 y=$9B   -> entry 32 $AF10
$ADA0  scroll $0B60  cmd $64  type $21  x=$F0 y=$2B   -> entry 33 $AF10
$ADA2  scroll $0B90  cmd $65  type $22  x=$F0 y=$9B   -> entry 34 $AF10
$ADA4  scroll $0B90  cmd $66  type $23  x=$F0 y=$2B   -> entry 35 $AF10
$ADA6  scroll $0BBC  cmd $67  type $25  x=$F0 y=$2B   -> entry 37 $AF10
$ADA8  scroll $0BC0  cmd $68  type $24  x=$F0 y=$9B   -> entry 36 $AF10
```

The plan's two handlers are the whole enemy scope. **But the plan is wrong about
what they are, and wrong about how stage 7 ends.** §4 and §5.

Also settled by the same scan: after this wave **two** of the 42 dispatch entries
are still unported -- entry 27 (`$B4F2`, type `$1B`, which NO wave record in any
of the seven stages references) and entry 40 (`$BB0F`, type `$28`, the ending
brain, spawned by `$988C`). Both are asserted in `tests/enemies.test.js` so
"two left" is a checked number rather than a sentence.

## §4. `$AF10` IS THE GALLERY, AND `$B569` IS NOT AN ENEMY AT ALL

`$AF10` matches the plan: 26 lines, one metasprite from `$AF0A,Y` by
`(type - $20)`, six entries sharing one handler. What the plan does not say is
that the whole routine is a **BLINK**, and that the blink comes from the GLOBAL
frame counter:

```
AF12  LDA $02 / AND #$1F / CMP #$1A / BCS $AF26     ($02 AND $1F) >= $1A -> BLANK
AF1A  LDA $030C,X / SEC / SBC #$20 / TAY
AF21  LDA $AF0A,Y / BNE $AF28        `89 87 8C 8B 8A 88`, all six NON-ZERO,
AF26  LDA #$00                        so the BNE is always taken
AF28  STA $012C,X  /  AF2B  JMP $AEDD
```

26 frames on, 6 off, a 32-frame cycle, and **all six pieces flash together**
because nothing about the phase is per-object. `$AF28` is ABOVE `$AF2B`, so a
frozen frame still writes the metasprite and only suppresses the drift -- which
matters on stage 7 specifically, because the shutter three chunks earlier is
what freezes it.

`$B569` is the interesting one and **the plan describes only its shape**
("~101 lines, falls into `$B574`-`$B605`, `$5B`/`$046C,X` state" -- all true).
What it IS:

* it drifts in from x `$F0` under `$AEDD`, and below x `$B0` it **takes the
  frame**: `$B574 INC $5B`, which suppresses the camera (`$9A9C`) and the
  terrain streamer (`$9ACA`). The screen stops.
* `$B574` is ABOVE the phase test, so `$5B` is INCd on **every one of the 121
  frames**, not only the six that do work.
* one setup frame (canned packet `$1F`), then **six steps of twenty frames**
  (`$B590 CMP #$14`), then `$B583 CPY #$07 / JMP $AEF8` frees it.
* each step queues canned packet `$20` **twice** and then **REWRITES the
  address and data bytes of both packets it has just appended**, by absolute
  address `$06F1,Y` with `Y = $0E` -- i.e. `$0700 + $0E - 15`. Same back-patch
  `$88E5 STA $06FE,Y` does in `src/hud.js`, eight bytes deeper.
* the three nametable address PAIRS are `$2578`+`$2618`, `$2598`+`$25F8`,
  `$25B8`+`$25D8`, shared by STEP PAIRS because `$B5D3 AND #$FE` drops the low
  bit before `$B5D5 ASL A`.
* and on the EVEN steps only it writes **four collision-map columns** at
  `$06C2`/`$06CA`/`$06D2`/`$06DA`, three bytes each, from `$B612` -- the same
  stride-8 column layout W35 derived for `$CDA5`.

**So type `$1E` is a SHUTTER in the fortress wall**: it stops the level, opens a
hole in the nametable and the collision map together over two seconds, and
deletes itself. Nothing in the plan or in `28-recon-stages-2-7.md` says the
stage-7 wave stream contains a routine that writes terrain.

### THE FALL-THROUGH, INCIDENT SIXTEEN

```
B5A2  BCS $B5BC          <-- loc_B5BC's ONLY listed xref
B5A4  ...                    the even arm: the collision-map loop
B5BA  BPL $B5A9
B5BC  LDA #$20 / JSR $85E8   <-- and the loop FALLS INTO THIS
```

There is no `JMP` and no `RTS` between `$B5BA` and `$B5BC`. Read the label's
xref list and stop at the loop, and the shutter queues its packets on three
steps of six instead of six of six. Mutant M16 is exactly that misreading and it
reddens five checks.

## §5. WHAT THE PLAN GETS WRONG: STAGE 7 HAS NO BOSS

`29-plan-whole-game.md`'s DONE-WHEN for this wave is *"A stage-7 scenario reaches
the stage-7 BigCore death (`$9A3D[6]=$0C`, stage-end `$98FD[6]=$0D`)"*.

* `$9A3D[6]` is `bossPage` -- **where the CAMERA stops**, not a boss. `$98FD[6]`
  is `$0D` = 13, and it is `endPage`, likewise a camera bound.
* and there IS no stage-7 BigCore. `$99C4 CMP #$05 / BCS $99C8` sends **both**
  stage 6 and stage 7 straight from sub-state `$83` to `$86`, so `$9982`
  (`$84`, the BigCore CREATION) and `$85` never run on either stage. W35 shipped
  that arm; this wave only had to read it.

Stage 7's only "boss" is the brain at `$9872` (`$988C` -> entry 40 `$BB0F` ->
the `$CE94` typewriter), which the plan itself assigns to its own W35 section.
It is left as a named throw and it is the wave after this one.

So the stage's real shape, end to end, is: wave stream -> camera reaches
`bossPage` 12 -> `$81` (`$9A12`, §6) -> `$82` counts 458 frames -> `$83` ->
`$86` -> `$9872`.

## §6. `$9A12` -- THE CIRCULAR UNREACHABILITY CLAIM, EXACTLY AS THE BRIEF WARNED

```js
if (state.zp19 === 6) {                        // $9A12 CMP #$06
  throw new Error('$9A12: $19 = 6 (stage 6 special case). $4D:=1, $4C:=$CA '
                + 'is unreachable -- the port loads one stage.');
}
```

Stage 7 **is** `$19 == 6`, and `$81` is the sub-state `$9A4D` hands to the frame
the camera reaches `bossPage`. It has been on the ordinary stage-7 path since the
stage existed. W35's `$99C4` again, one stage later.

**`stagesweep.mjs` cannot find it**: it seeds `$1B = $80` and runs 1400 frames at
2 px/frame, which is page 10, and `$9A3D[6]` is page 12. What found it was
scanning `assets/prg.bin` for every `$19` compare: **21 sites** where a zero-page
load of `$19` is followed by a `CMP/CPX/CPY #imm` within 16 bytes, plus a
separate scan proving **no instruction in the PRG compares against `$19` as an
operand** (`C5/E4/C4 19`: zero hits). Exactly TWO compare with `#$06`, and both
are `BNE` -- equality -- so stage 7 is the only stage that can take either arm:

```
$9906 CMP #$06 -> JMP $9872   the end-of-game chain     STILL A THROW (next wave)
$9A12 CMP #$06 -> $9A16       the countdown seed        W36  <--
```

On the other 19 sites stage 7 takes an arm a shipped stage already takes; the
list is in `src/enemies.js` beside the guard.

### AND `$9A1C` IS A `BNE`, NOT A `JMP`, WHICH IS THE WHOLE POINT

```
9A16  A9 01 / 85 4D     $4D := 1
9A1A  A9 CA / D0 07     A := $CA, BNE $9A25   -- SKIPS $9A1E *AND* $9A23
9A1E  BD 35 9A / 85 4D  $4D := $9A35[$17]
9A23  A9 00             A := 0
9A25  85 4C             $4C := A              -- the SHARED store
```

The branch lands past `$9A23 LDA #$00`, so the `$CA` survives into the shared
`STA $4C`. **Stage 7's boss countdown is a fixed `$01CA` = 458 frames at every
rank**; every other stage's is `$9A35[$17] * 256` (768 at rank 0, 1536 at rank
5). A port that read `$9A1C` as a jump to `$9A25` *without* noticing it also
skips `$9A23` gets the same answer; one that read it as a fall-through gets 0.

## §7. THE PORT

| ROM | what | file |
|---|---|---|
| `$B569`-`$B605` + `$B606`-`$B61D` | entry 30, the shutter | `src/enemies.js` |
| `$AF10`-`$AF2D` + `$AF0A`-`$AF0F` | entries 32-37, the gallery | `src/enemies.js` |
| `$9A16`-`$9A25` | stage 7's countdown seed | `src/nmi.js` |
| `$A2F0` guard | `>= 6` -> `>= 7`, past the last stage | `src/enemies.js` |

`jt_$C439[6]` = `$C429` is a bare `RTS` and was already handled.

### ONE MODELLING NOTE, AND IT IS A TOOL COUPLING RATHER THAN A ROM QUESTION

`$B569` is the first ENEMY handler that appends a canned `$0700` packet, so it
needs `res.hudPackets`. Every other producer in this port takes that as an
argument, which here means widening `dispatch()`'s parameter list -- and
`tools/oracle/wavecensus.py::_ported_targets` locates `dispatch()` by its EXACT
declaration text and reads the `case 0x` labels after it to decide which of the
42 handlers are ported. Widening the list makes that parser raise and takes
`stageledger.py` and the coverage gate with it. `tools/` is another agent's this
wave, so the packet table is a module binding set at the top of `updateEnemies()`
and cleared in a `finally`, with a named throw if a handler reads it unset.
**It is scaffolding, it is labelled as such in the source, and it should be
deleted the moment that anchor stops being a full signature.**

(While doing it: putting the anchor's literal text into that binding's own
docstring made `str.index` find the COMMENT first, so the parser read the wrong
function's body and reported ZERO ported handlers. Found by doing it; the
docstring now describes the anchor instead of quoting it.)

## §8. THE SWEEP AFTER THE PORT

`node games/gradius/tools/oracle/stagesweep.mjs`, real tree, no patch:

```
  PASSIVE  stage $19=6   .  .  .  .  .  .  .
  PLAYING  stage $19=6   .  .  .  .  .  .  .
  110 chunk runs, 154000 nmi() frames, 5.82 s
  7 of 7 stages swept (7 admitted, 0 forced behind the guard); 0 NOT SWEPT.
  OK -- 0 undecided throws on 7 admitted stage(s)
```

Before: 7 of 112 forced runs threw (§1). **And the chunk-7 `$8010` run is gone
from the tool independently of me** -- W37's `chunkGeometry` now clips each
stage's slot count to the ROM's own table and prints why, which is the same
conclusion §2 reached from the listing, reached from the other direction. Two
agents, two methods, one answer; recorded because agreeing by accident is the
thing this project keeps getting caught by.

### THE PASS THE SWEEP CANNOT DO

Stage 7 driven through **all sixteen `$982F` play sub-states**, seeded, 400
frames each, both modes:

* `$80 $81 $82 $84 $85 $8E $8F` -- **clean**.
* `$86` -- `$9872`, the end-of-game chain. The documented boundary (§5).
* `$87`-`$8D` -- the intro/ending arms, throwing with their own ROM addresses.
  Out of scope, unchanged by this wave, same as W35.
* **`$83` throws `enemy tables: $0000 is not in any exported range`** -- the
  KNOWN PRE-EXISTING null wave cursor. W35 measured it identical on stages 0, 1,
  4 and 5; **I measured it on all SEVEN**, character for character. Not a
  stage-7 property, not a regression, not clamped.

And the shutter driven to completion (`scratchpad/w36probe.mjs`):

```
 f0   phase 0->1   $5B=1  15 bytes queued  no map write
 f20  phase 1->2   $5B=1  16 bytes         MAP WRITTEN
 f40  phase 2->3   $5B=1  16 bytes         no map write
 f60  phase 3->4   $5B=1  16 bytes         MAP WRITTEN
 f80  phase 4->5   $5B=1  16 bytes         no map write
 f100 phase 5->6   $5B=1  16 bytes         MAP WRITTEN
 f120 phase 6->7   $5B=1  16 bytes         no map write
 f121 FREED
 queue: 01 27 d6 af ff 01 27 de aa ff 01 27 e6 fa ff   <- packet $1F, THREE
        01 25 78 c5 c5 c5 c5 ff 01 26 18 c3 c3 c3 c3 ff   packets from one index
```

**Packet `$1F` is the first caller of `$85F3`'s `$FD` arm.**
`src/hudpackets.js` records that arm as *"NOT EXERCISED BY ANY MEASURED FRAME"*.
It is now: `27 D6 AF FD 27 DE AA FD 27 E6 FA FE` emits three complete
single-byte ATTRIBUTE writes at `$27D6`, `$27DE` and `$27E6` -- the shutter
recolours its corner of nametable 1 before it moves.

### A MEASUREMENT THE FIXTURE FORCED ME TO MAKE

Driven **passively** over chunk 5, the object pool is FULL (all ten slots) for
**92 of 300 frames, and it is full at scroll `$0AC0`** -- so `$AD98`'s type `$1E`
allocates nothing and **the shutter never appears at all**. That is the ROM's own
behaviour (`$A415`'s scan returns -1, the member is dropped, `$69` is still
decremented). It means a passive stage-7 run reaches the boss page without the
screen ever freezing, and it is why `tests/w36-stage7.test.js`'s stream check
frees one slot every eight frames -- an INTERVENTION, labelled, for coverage
only (docs/knowledge/09).

## §9. THE MUTATION TABLE -- 40 MUTANTS, 38 RED, 2 PROVABLY UNCATCHABLE

Harness `scratchpad/mut36.py`, on a COPY at `C:/tmp/w36mut`
(`games/gradius/{src,tests,assets,tools,index.html,game.json}` plus the repo
`package.json`; the copy baselines at 0 failures). It patches source as BYTES
and normalises each needle to the file's own line endings. Both files hash
identical before and after all of them: `enemies.js 419145c73912`,
`nmi.js 1e89825bb868`. The copy is deleted.

| # | mutant | red |
|---|---|---|
| M1 | `$AF10`'s `- $20` becomes `- $1F` | 3 |
| M2 | the blink bound `$1A` becomes `$1B` | 1 |
| M3 | the cycle mask `$1F` becomes `$0F` | 1 |
| M4 | the blink test inverted | 3 |
| M5 | the blink driven by the OBJECT's timer, not `$02` | 1 |
| M6 | `$AF2B JMP $AEDD` dropped | 1 |
| M7 | the `Y > 5` bound removed | **1, after §9a** |
| M8 | `$AF0A` read at a CONSTANT index | 1 |
| M9 | `$B569`'s `$B0` trigger becomes `> $B0` | 1 |
| M10 | `$B569 JSR $AEDD` dropped | 9 |
| M11 | `INC $5B` moved BELOW the phase test | 2 |
| M12 | phase 0 queues packet `$1E`, not `$1F` | 1 |
| M13 | the phase-0 arm falls through into the step code | 3 |
| M14 | the free bound 7 becomes 8 | 4 |
| M15 | the 20-frame dwell becomes 10 | 3 |
| M16 | **THE FALL-THROUGH** -- the even arm returns instead | 5 |
| M17 | the even/odd parity inverted | 2 |
| M18 | the map loop counts Y UP, not down | ***SURVIVED*** |
| M19 | the column stride 8 becomes 4 | 2 |
| M20 | the map page `$06` becomes `$05` | 2 |
| M21 | `x0 = step`, losing `$B5A4`'s ADC | 1 |
| M22 | the map table base `$B612` becomes `$B615` | 2 |
| M23 | one of the two `$20` packets dropped | 4 |
| M24 | the address index loses `AND #$FE` | 1 |
| M25 | the `$C2`/`$C3` parity flipped | 1 |
| M26 | `$B5FC ADC #$02` dropped | 1 |
| M27 | packet A's address offset off by one | 1 |
| M28 | packet B's address offset off by one | 1 |
| M29 | the two data runs swapped | 1 |
| M30 | the wrapped-cursor guard removed | 1 |
| M31 | `$B587 JMP $AEF8` becomes a quiet return | 1 |
| M32 | the four map columns become one | 2 |
| M33 | `$9A12`'s fork tests 5, not 6 | 1 |
| M34 | `$4C` left 0 -- `$9A1C` read as a fall-through | 1 |
| M35 | `$4D` from the rank table -- the fork dropped | 1 |
| M36 | the `$A2F0` guard walks back to `>= 6` | 5 |
| M37 | the guard removed altogether | 3 |
| M38 | `framePackets`' unset guard removed | ***SURVIVED*** |
| M39 | the `$AF21` throw stops naming the offending type | 1 |
| M40 | `updateEnemies` stops SETTING `framePackets` | 9 |

### 9a. THE ONE FIRST-RUN SURVIVOR WAS A DEFECTIVE **MUTANT**, NOT A DEFECTIVE CHECK

A third category, and it is worth naming because it looks identical to a hole in
the suite until you read it. **M7 first survived as `if (y > 99)`** -- and the
type that reaches it is `$A0`, so `y` = `$80` = **128**, which is still greater
than 99. The guard fired, the named throw arrived, the check stayed green, and
the mutant had simply not removed anything. Rewritten as `if (false)`, it is red.

A mutation harness can lie in the same direction the code does. The lesson is
the one the project already has about green runs: **a surviving mutant needs its
own diagnosis before it is written up as a hole**, or the write-up is a second
wrong number on top of the first.

### 9b. THE TWO THAT ARE UNCATCHABLE, AND WHY

**M18 -- reversing the collision loop's direction reddens nothing, and it cannot,
because ALL THREE OF THE CARTRIDGE'S TRIPLES ARE PALINDROMES.** Counted out of
`prg.bin` this session:

```
x0 = 0   $B612-$B614   FF 00 FF     palindrome
x0 = 3   $B615-$B617   FF C3 FF     palindrome
x0 = 6   $B618-$B61A   FF FF FF     palindrome
```

`$B5A7 LDY #$02 ... $B5B9 DEY / $B5BA BPL` writes the three bytes back to front,
and every triple the loop can be handed reads the same either way. The four
column writes are the same byte, in the same frame, and nothing observes the
order. So the direction is transcribed from the listing and is **unobservable in
every state the ROM can reach** -- same category as W35's M27 and W34's M19. It
is written down rather than "fixed" because the next reader will otherwise spend
the same twenty minutes proving it again.

**M38 -- removing `framePackets`' unset guard reddens nothing**, and that is a
fact about the module's surface rather than about the ROM: `h_B569` and
`dispatch` are not exported, so `updateEnemies()` is the ONLY way in and it
always sets the binding. Nothing this suite can call reaches a handler with it
unset. It is a guard against a future refactor, and **M40 proves the mechanism is
live** -- deleting the SETTER makes the named throw fire and reddens 9 checks.
This one retires itself: it disappears with the scaffolding in §7.

---

## §10. WHAT I COULD NOT REACH -- attempts, not absences

1. **ANY CARTRIDGE COMPARISON OF ANYTHING IN THIS WAVE.** Unchanged from W32b,
   W32c, W33, W34 and W35, and still the largest gap in the Gradius port. Every
   number above is port-vs-listing. Nobody has watched stage 7's shutter freeze
   the screen on the board, and its 121 frames of frozen camera plus 111 queued
   VRAM bytes are the single most visible thing this wave adds.
2. **`$9872`, and therefore a stage-7 CLEAR.** Stage 7 plays start to finish and
   then hands to the end-of-game chain, which is a named throw and is the plan's
   own next section (`$9872` -> `$8B` `$988C` -> entry 40 `$BB0F` -> `$CE94`'s
   typewriter -> `$98E5`'s loop wrap). I did not port it: it is a wave, not a
   loose end, and it is the ONLY thing between here and loop 2.
3. **`$1B = $83`'s null wave cursor.** W35's open item 1, re-measured on all
   seven stages this wave and identical on every one. On the cartridge
   `LDA ($6A),Y` with `$6A:$6B` = 0 reads zero page and does not crash; the port
   models the wave cursor as ROM-only and throws. It sits between `$82` and
   `$86` on every stage's ordinary path, so it is the most likely thing to stop
   a real stage-7 clear. **Not clamped and not widened** -- letting the cursor
   address RAM is a substrate decision that needs its own evidence.
4. **Whether the shutter is EVER allocated in real play.** §8: passive, it is
   dropped, because the pool is full at scroll `$0AC0`. Whether a player who has
   killed things arrives with a free slot is a question about play, and the only
   fixture I have that answers it is an intervention.
5. **`$B7B5`/`$B797`** -- W34's OPEN finding, printed by `tablecoverage.py` every
   run. Untouched again: nothing in stage 7 reaches type `$97`. Note `$B58A` (my
   `INC $04AC,X`) now appears in that tool's INC-candidate lists; the tool says
   in its own output that the pairing is by RAM address and over-reports.
6. **`$0600`'s two models.** W35 §6, unchanged: `state.coll` is `$0500-$06FF`
   and `state.arm`/`ARM_POOL` is `$0600-$06BF`. `$B569` writes `$06C2`-`$06DC`,
   which is ABOVE the arm pool, so this wave does not make them collide -- but
   it is now a THIRD writer of page `$06` in a port that models that page twice,
   and the next wave to put arms and a shutter in one stage will get a silent
   wrong answer.

---

## §11. OPEN ITEMS HANDED FORWARD

1. **`$9872`, the end-of-game chain and the loop wrap.** The only thing left in
   the whole `$982F` play ladder that a normal run reaches, and it gates loop 2.
2. **The `$83` null wave cursor** (§10 item 3) -- every stage, pre-existing,
   measured on all seven now.
3. **The cartridge comparison for stages 2-7** -- W32c/W33/W34/W35's standing
   item, unchanged and still the highest-value unclaimed work.
4. **`wavecensus.py`'s `_ported_targets` anchor is a full function signature**,
   which is what forced §7's scaffolding. Relaxing it to the declaration's NAME
   would let `res` be a parameter and let the module binding be deleted.
5. **`$B7B5 LDA $B797,Y`** -- W34's item 1, unchanged.
6. **`$9751` is a crash a real player reaches on every stage** -- W34's item 3,
   unchanged.
7. **`stagewaves.py` is still broken on the inline-5 stride**; `wavecensus.py`
   and `handlerclosure.py` are still not CI-wired (W34 items 4/5, W35 item 5).

---

## FINAL NUMBERS

```
stageledger.py  stage $19=6   BEFORE  111 distinct, 104 ported, 7 unported,
                                      93.7 %, first unported scroll $0AC0
                                      (@$AD98); admission BLOCKED
                              AFTER   111 distinct, 111 ported, 0 unported,
                                      100.0 %, first unported NONE; ADMITTED
                ALL           BEFORE  591/598, 98.8 %   AFTER  598/598, 100.0 %
                              and all seven stages ADMITTED

stagesweep.mjs  BEFORE  gate run swept stages 0..5, 96 runs / 134,400 frames.
                        FORCED onto stage 7 on a copy: 7 of 112 runs threw --
                        $B569 x3, $AF10 x2, chunk-7 $8010 x2 (a tool-scope
                        artifact, §2)
                AFTER   110 chunk runs, 154,000 nmi() frames, 5.82 s,
                        0 undecided throws, 7 of 7 stages swept

node --test games/gradius/tests/        619 pass, 0 fail, 0 skipped  (603 before)
node games/gradius/tools/test-all.mjs   GREEN -- 12 passed, 0 failed, 0 SKIPPED
tablecoverage.py                        OK, 4 extent sites, 1 still OPEN ($B7B5)
```

16 new checks in `tests/w36-stage7.test.js`, plus **six** boundary checks
inverted rather than deleted across five existing suites, each named in its own
comment (`enemies.test.js`, `flow.test.js`, `w24-substate.test.js`,
`w31-stage4.test.js`, `w32a-b559.test.js`, `w32c-interactions.test.js`).
40 mutants, 38 red, 2 provably uncatchable and reported as such, 1 first-run
survivor that was a defective MUTANT and is written up as its own category.

Real tree, `sha256` over `sha256sum` of every `.js` under
`games/gradius/{src,tests}`, sorted, after all mutation work:
`010b927c5da7bff180198983c7e369e3bea7f33d3c64c8d8a02434f0589e54d8`.
`git status --porcelain games/gradius/src` is empty.

status: DONE

