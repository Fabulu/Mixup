# Wave 36 IMPLEMENTER — stage 7 (`$19 = 6`)

status: IN PROGRESS
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


