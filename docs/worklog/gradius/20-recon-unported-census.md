# 20 - RECON: the unported census (static)

status: DONE (static; nothing validated against the cartridge -- see §9)
scope: READER. Nothing under `games/gradius/src/` was edited. New tools only.

Wave 20, recon 3 of 5. The question, phrased as a fraction: **of everything the
ROM contains, how much does the port implement?**

Method is `docs/knowledge/09-enumerate-then-validate.md`: the ROM is the source
of the INVENTORY. Every number below is read out of `games/gradius/assets/prg.bin`
or `games/gradius/rip/prg.asm`. No emulator was run for this pass.

Tools written (all `games/gradius/tools/oracle/`, all offline):

| tool | what it enumerates |
|---|---|
| `wavecensus.py` | every wave record of every stage, decoded like `$A2C0`/`$A335`/`$A37A` |
| `handlerclosure.py` | which of the 42 `$AE1C` dispatch entries each stage NEEDS, closed over handler-spawns-handler edges |
| `callcensus.py` | recursive descent from `$806A` and `$9650`; every JSR/JMP target vs what `src/` names |
| `silentgaps.py` | reachable basic blocks with ZERO mention anywhere in `src/` |
| `throwinventory.py` | every `throw new Error()` in `src/`, split gate vs assertion |

---

## 0. The headline

```
$ python games/gradius/tools/oracle/handlerclosure.py
stage  need   ported  MISSING dispatch entries
0      16     10      7:$B6E1 9:$B311 12:$B3CB 15:$AF2E 16:$AF88 19:$B747
1      14     9       9:$B311 11:$B37F 12:$B3CB 15:$AF2E 16:$AF88
2      14     9       13:$B402 14:$B434 22:$C906 23:$B7A1 28:$B4FD
3      18     10      7:$B6E1 9:$B311 12:$B3CB 13:$B402 14:$B434 15:$AF2E 16:$AF88 19:$B747
4      7      3       13:$B402 14:$B434 20:$CA5E 29:$B559
5      11     8       9:$B311 15:$AF2E 26:$B480
6      20     8       7:$B6E1 11:$B37F 12:$B3CB 16:$AF88 19:$B747 30:$B569 32:$AF10 33:$AF10 34:$AF10 35:$AF10 36:$AF10 37:$AF10

UNION over the 7 stage scripts: 32 of 42 entries needed, 10 ported, 22 missing
entries no stage script needs: 0 3 10 21 24 25 27 31 38 40
```

**Stage 1 needs 16 of the 42 enemy handlers. The port has 10.** That is the
owner's bug report expressed as a denominator, and it was in the ROM on day one.

## 1. Where stage 1 breaks, to the record

`wavecensus.py` decodes stage 0's 92 distinct records. The first eleven -
chunk 0 and chunk 1, scroll `$0000`-`$03FF` - are 100 % ported. From chunk 2 on:

```
$A87E  trig $20 scroll $0440  cmd $03  SINGLE type $07 -> entry  7 $B6E1  MISS
$A880  trig $22 scroll $0444  cmd $04  SINGLE type $13 -> entry 19 $B747  MISS
$A88A  trig $68 scroll $04D0  cmd $06  SINGLE type $0F -> entry 15 $AF2E  MISS
$A8D8  trig $98 scroll $0930  cmd $07  SINGLE type $10 -> entry 16 $AF88  MISS
```
(18 such records in stage 1; `wavecensus.py` lists all of them with their
chunk, trigger byte and descriptor.)

**The static census predicts wave 12's measured first-execution frames EXACTLY.**
Scroll advances 1/2 px per frame and scroll 0 sits at game frame 314 (derived
from wave-fire frames already recorded in `03-impl-…`: 378 @ scroll 32,
506 @ 96, 634 @ 160 → t0 = 314 in all three):

| handler | scroll | 314 + 2·scroll | `throwaudit.py` measured |
|---|---|---|---|
| `$B6E1` | `$0440` = 1088 | **2490** | **2490** |
| `$B747` | `$0444` = 1092 | **2498** | **2498** |
| `$AF2E` | `$04D0` = 1232 | **2778** | **2778** |
| `$AF88` | `$0930` = 2352 | **5018** | **5018** |

Four for four, no slack. Wave 12 needed 27,400 emulated frames to find these;
`wavecensus.py` finds them in well under a second from the PRG image - and finds
the ones no run has reached with the same confidence.

Wave 12's note that `$B311`/`$AF2E`/`$AF88` were reached "only on a run carrying
power-ups" is **wrong** and this pass retires it: all three are plain stage-1
wave records, `$AF2E` and `$AF88` directly and `$B311` at one remove - see §3.

## 2. The spawn-script inventory

```
$ python games/gradius/tools/oracle/wavecensus.py
stage  table   records   distinct enemy types spawned
0      $A7DE   112       $04 $05 $06 $07 $08 $0F $10 $11 $12 $13 $27 $29
1      $A7EE   133       $04 $05 $08 $0B $0F $10 $11 $12 $27 $29
2      $A7FE   87        $04 $05 $08 $0D $0E $11 $12 $17 $1C $27 $29 $96
3      $A80C   111       $04 $05 $06 $07 $08 $0D $0E $0F $10 $11 $12 $13 $27 $29
4      $A81A   44        $08 $0D $0E $14 $1D
5      $A828   104       $04 $05 $08 $0F $11 $12 $1A $27
6      $A836   127       $04 $05 $06 $07 $08 $0B $10 $11 $12 $13 $1E $20 $21 $22 $23 $24 $25

TOTAL record READS across all 7 stage tables: 718
DISTINCT wave records (by ROM address, $A844-$ADAA): 598

stage  distinct  ported   unported inline5  ported %
0      92        74       18       0        80.4%
1      93        83       10       0        89.2%
2      78        28       5        45       35.9%
3      98        75       23       0        76.5%
4      28        8        16       4        28.6%
5      98        45       53       0        45.9%
6      111       57       54       0        51.4%
ALL    598       370      179      49       61.9%
```

Structural facts established while decoding, each with its ROM evidence:

* `$A7D0` holds **eight** words but there are **seven** stages. The eighth is
  `$A844`, which is stage 1's chunk-0 stream - the chunk tables are packed back
  to back and the 8th word is just the byte after the 7th table. Chunk counts
  are therefore `(next table − this table)/2` = **8, 8, 7, 7, 7, 7, 7**.
* A record is 2 bytes `[trigger, cmd]` **unless `cmd >= $F0`, in which case it
  is 5** (`$A386 LDA #$05`). Walking every record as 2 bytes inflates stage 2
  from 78 to 147 records and invents eight enemy types that do not exist. That
  mistake is in the first draft of `wavecensus.py`; it is recorded here so
  nobody re-makes it.
* Chunk streams **share tails**: stage 0 chunks 5/6/7 are all `$A8ED`, stage 1
  chunks 3/6/7 are all `$A970`, and stage 2 chunk 1's stream runs through chunk
  2's and chunk 3's start addresses. So "record reads" and "distinct record
  addresses" are different denominators and both are given.
* `assets/manifest.json` tags `enemy.stageStreams` / `enemy.stage1Streams`
  "listing only - never hooked, do not treat as measured". They are now decoded
  end to end, and independently: `tools/oracle/wavedump.py` (written this same
  wave by another recon) reproduces stage 0 byte for byte, and its stage-1
  unported list is the same 18 records once its chunk-tail duplicates are
  removed. **Two decoders written independently from the same ROM, one answer.**

## 3. The spawner inventory - 9 sites, 2 ported

Every spawn in the game calls `$A527` (clear the slot) first.
`grep "JSR \$A527" rip/prg.asm` returns **exactly nine** sites, and that is the
complete list of spawners in the cartridge:

| site | what | ported? |
|---|---|---|
| `$A3BE` | `$A3B1` single wave spawn (`cmd < $80`) | **yes** |
| `$A422` | `$A411` formation member (`cmd $80-$EF`) | **yes** |
| `$A480` | `$A46F`, the inline-5 arm for `$19 = 2`, forces type `$96` | no - `enemies.js:368` throws |
| `$A4D7` | `$A4A6`, the inline-5 arm that fills the `$0600` terrain-object array | no - same throw |
| `$AFD9` | **`$AF98`, a handler spawning a handler** | no |
| `$9897`, `$989C` | `$988C`, the end-of-stage chain (`$1B = $0B`) | no - `nmi.js:379` throws |
| `$999D` | the `$99xx` boss-approach chain | no - `nmi.js:379` throws |
| `$C42A` | `$C413`, the stage-advance engine | no - `enemies.js:306/323` throw |

`$AF98` is the finding the wave census alone cannot produce, and it is the
missing half of wave 12's power-up theory:

```
AF43: A0 08      LDY #$08
AF45: A9 09      LDA #$09      <- type $09
AF47: 20 98 AF   JSR $AF98     <- st_AF2E (entry 15, type $0F) SPAWNS type $09

AF8D: A0 F6      LDY #$F6
AF8F: A9 0C      LDA #$0C      <- type $0C
AF91: 20 98 AF   JSR $AF98     <- st_AF88 (entry 16, type $10) SPAWNS type $0C
```

So stage 1's handler set is not the twelve types its script names - it is those
plus `$09` (entry 9, `$B311`), `$0C` (entry 12, `$B3CB`), `$01` (the capsule,
`$AEC3`) and `$02` (the explosion, `$BED3`). Sixteen entries. `handlerclosure.py`
computes that closure per stage; §0's table is its output.
`throwaudit.py` measured `$B311` first at frame 2783, five frames after
`$AF2E`'s 2778 - the edge, measured, without anyone knowing it was there.

## 4. The enemy-handler table, in full

42 entries at `$AE1C`, **34 distinct targets**, **13 entries / 10 distinct
targets ported**.

```
 0 $AE70 OK (bare RTS)   14 $B434 --            28 $B4FD --
 1 $AEDD OK              15 $AF2E --            29 $B559 --
 2 $AE99 OK              16 $AF88 --            30 $B569 --
 3 $AEE1 OK              17 $B026 OK            31 $AE70 OK (bare RTS)
 4 $B205 OK              18 $B098 OK            32-37 $AF10 -- (six entries, one target)
 5 $B0AF OK              19 $B747 --            38 $B61E --
 6 $B198 OK              20 $CA5E --            39 $AEDD OK
 7 $B6E1 --              21 $B377 --            40 $BB0F --
 8 $B26C OK              22 $C906 --            41 $AEDD OK
 9 $B311 --              23 $B7A1 --
10 $B36F --              24 $B914 --
11 $B37F --              25 $B913 --
12 $B3CB --              26 $B480 --
13 $B402 --              27 $B4F2 --
```

`$83E4`'s `ASL A` is eight bit, so the index is `type AND $7F` - type `$85` and
type `$05` share entry 5. Ten entries (0, 3, 10, 21, 24, 25, 27, 31, 38, 40) are
needed by NO stage script; they are boss/terrain-object types or the two
bare-RTS slots. **22 of the 42 are needed by a stage script and unported.**

## 5. The call graph - what the port has never even mentioned

```
$ python games/gradius/tools/oracle/callcensus.py
From the NMI $806A -- the whole cartridge frame, all seven game modes:
  JSR/JMP targets reachable        : 324
  named anywhere in src/           : 204  (63%)
  NOT MENTIONED ANYWHERE in src/   : 120  (37%)

From the mode-5 entry $9650 -- stage play only:
  JSR/JMP targets reachable        : 276
  named anywhere in src/           : 179  (65%)
  NOT MENTIONED ANYWHERE in src/   : 97  (35%)
  reachable instruction addresses  : 5708 (17.4% of the 32 KB image)

  the SILENT mode-5 set by ROM region:
    $8000-$83FF boot / house helpers                2 silent of  11 reachable
    $8400-$87FF math + canned VRAM packets          2 silent of  16 reachable
    $8800-$8BFF VRAM streamer / OAM builder         4 silent of  22 reachable
    $8C00-$8FFF metasprite tables                   2 silent of   2 reachable
    $9600-$9CFF flow / mode-5 state machine         3 silent of  32 reachable
    $9D00-$9FFF terrain streamer                    0 silent of   5 reachable
    $A000-$A1FF player + weapons                    0 silent of   1 reachable
    $A200-$A5FF spawn engine                        1 silent of  15 reachable
    $A600-$ADFF wave tables + enemy update          0 silent of   3 reachable
    $AE00-$BBFF enemy handlers                     38 silent of  89 reachable
    $BC00-$BFFF enemy bullets / shot sweep          1 silent of  15 reachable
    $C000-$C3FF collision                           1 silent of  17 reachable
    $C400-$C8FF stage advance / terrain enemies    18 silent of  20 reachable
    $C900-$CFFF bosses                             25 silent of  26 reachable
    $EC00-$FFFF sound driver                        0 silent of   2 reachable
```

Instruction-level proxy, same walk: **3231 of 5708 reachable mode-5 instruction
addresses (56.6 %) sit in a basic block that `src/` mentions at least once**;
496 of 878 blocks (56.5 %). NMI-wide it is 3874 of 6604 (58.7 %).

## 6. Silent non-implementations - the search, and what it found

`silentgaps.py` cuts the mode-5 reachable code into 878 basic blocks and reports
the 98 that live in a region the port CLAIMS and that `src/` never mentions.
Each was read by hand. The triage:

**RULED OUT - guarded by a named throw upstream, the port cannot get there:**

* `$BF0B`/`$BEF3` (shot vs. the `$0600` destructible blocks) - reached only from
  `$C044`, gated `$19 == 4`; `collision.js:226` throws.
* `$C267`-`$C299` (bullet vs. `$0600`) - `$C263`, gated `$19 == 4`;
  `collision.js:394` throws.
* `$C32F`-`$C39A` (the breakable-wall VRAM patch) - from `$C2DC`;
  `collision.js:847` throws.
* `$C166` - reached only from `$C13D`, which throws.
* `$82D5`/`$8307`, `$9715`-`$9746`, `$975D` - under `$96FB` (game over);
  `nmi.js:339` throws.
* `$840C`, `$9872`, `$9893`-`$98DA`, `$994A`, `$99DF`, `$9A1E` - under `$982A`
  (`$1B != $80`); `nmi.js:379` throws.
* `$A37C`-`$A394`, `$A471`-`$A524`, `$A4CD` - the inline-5 form;
  `enemies.js:368` throws.
* `$843F` and all 25 blocks in `$C900-$CFFF` - bosses, behind `$9A56`.
* `$AF10`, `$B31E` … `$BB0F` (38 blocks) - enemy handlers, behind the `$AE1C`
  default throw, which prints the exact target address at runtime.

**RULED OUT - implemented, just not quoted at that exact address:**

* `$BCD3` (the `LDA #$F8` target-X saturation in `$BC44`) - `enemies.js:850` has
  `tx = sum > 0xFF ? 0xF8 : sum` with the `$BCCF` citation.
* `$C2D1`-`$C2D6` (the 2-bit field shift) - `collision.js` folds it into
  `probeCollision()` and says so.
* `$9F02`-`$9F34` (terrain RLE control codes `$07`-`$0A` and the `$9D73` fill
  table) - ported, but in `tools/oracle/terrain.py`, not `src/`; `src/terrain.js`
  consumes the exported `stages.json`. My scan only reads `src/`, so this is a
  false positive of the tool and is recorded as one.
* `$8943` - the two-player arm of `st_892C`; `$8915`, the BCD digit-pair
  expander it jumps into, IS named (`hud.js`, `vram.js`), and `player.js:121`
  throws on `$18 != 0`. Listed here because it was my first candidate and it
  did not survive the check.

**NOT RULED OUT - genuinely silent, in code that runs every frame:**

1. **`$8B91 → $8BD9 → $8C06`, the `$0600` terrain-object sprite pass.** It runs
   unconditionally inside `$8BAB` on every frame of every stage. `src/oam.js`
   names `$8BAB` and says the blank pass is not ported; it does not mention
   `$8BD9`, `$8C06` or `$8C65`, and the port has no equivalent of the pass at
   all. Consequence today: none, because `$0600` is only populated by
   `$A4D7`/`$A4A6` and by `$9663`'s census, both `$19 == 4`. Consequence the
   moment stage 5 is ported: every terrain-mounted object is invisible, with no
   throw to say so. **A quiet return, exactly the shape asked for.**
2. **`$8BC3`, the sprite-0 wait** (`$9AAA`), and **`$8A9E`**, the CNROM latch
   (`$9AC1`). `src/nmi.js` says the renderer "models the split as two bands
   rather than as a spin"; neither address appears anywhere in `src/`. The
   `$37`/`$36` divergence `oam.js` already documents is the visible tail of this.
3. **`st_984F`'s 4 px/frame camera adder** (`camera.js:26`, "not ported: stage
   1's normal path never uses it"). Named in a comment, guarded only by
   `playArm`'s `$982A` throw - correct today, but the note states it as a
   stage-1 fact when the guard is a sub-state fact. Same sentence shape that has
   cost this project five bugs.

## 7. The throw inventory

```
$ python games/gradius/tools/oracle/throwinventory.py
throw new Error() sites: 69
  carrying >=1 ROM address        : 57
  no ROM address (invariant/assert): 12
  distinct ROM addresses named    : 134
```

The 12 without a ROM address are asset-loader and range assertions
(`assets.js` ×6, `terrain.js` ×2, `sound.js` ×2, `player.js` `$18 != 0`,
`apu.js` sample rate) - none is an unported-path gate. So **57 named gates
covering 134 ROM addresses** is the port's honest self-report, and this pass
adds the four §6 items that self-report does not cover.

## 8. Other subsystem denominators, counted from the ROM

| set | total | ported | note |
|---|---|---|---|
| inline jump tables (`JSR $83E4`) | 7 | 3 fully | `$80D4`(7), `$88AD`(5), `$8989`(7), `$96C5`(5), `$982F`(16), `$AE1C`(42), `$C439`(11) |
| game modes `$80D4` | 7 | 1 + a stub | mode 5 only; mode 4 is a 3-instruction handover, `main.js:91` |
| play sub-states `$982F` | 16 | 1 | entry 0 `$9A4D`, and only for `$1B = $80` |
| intro states `$96C5` | 5 | 5 | `src/flow.js` |
| power-up meter `$8989` | 7 | 7 | `powerup.js:167` guards the 8th |
| HUD packet dispatch `$88AD` | 5 | 5 | `hud.js` / `hudpackets.js` |
| stage-advance `$C439` | 11 | 0 | the whole table sits behind `$C413` |
| canned VRAM packets `$864E` | 39 | 39 | `assets/hud/packets.json` |
| metasprite ids (`$8D9E`/`$8E9E`) | 256 slots, 170 with a non-empty record | 161 exported | 77 slots hold a pointer outside PRG, 9 point at a `$00` |
| sound records (`$EFB8-$FFF9`) | 63 | 63 | data-driven; `sound.js` throws only on `$EC42` request range |
| terrain stages | 7 | 7 | all exported; 9 screens / 40 blocks for stage 1 |
| wave records (`$A844-$ADAA`) | 598 distinct | 370 | 179 need an unported handler, 49 are the inline-5 form |
| enemy handlers `$AE1C` | 42 entries / 34 targets | 13 / 10 | §4 |
| spawners (`JSR $A527`) | 9 | 2 | §3 |

## 9. What I could not do - blockers

* **Nothing here was validated against the cartridge.** Every number is
  read-from-ROM. The next step is `wavelog.py` (already written by the parallel
  recon) confirming the decode against a live run, and a SEED-ANYWHERE scenario
  parked just before scroll `$0440` to watch `$B6E1` fail on demand.
* `silentgaps.py` only reads `src/`. Logic ported into `tools/` (the terrain
  streamer) reads as a gap and is not one. A second pass should scan the
  exporters too, or the tool will keep producing that class of false positive.
* I did not enumerate the boss scripts (`$C900-$CF2D`, the 7409-byte unreached
  gap) or the `$9CB8` (75-word), `$8D9E` (164-word) and `$F254` (42-word) tables
  beyond counting their entries.
* The "instruction addresses in a block `src/` mentions" figure (56.6 %) is a
  reachability proxy, not a correctness measure. A mentioned block can still be
  wrong; only the oracle answers that.
