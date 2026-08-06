# Recon 2/5 - the COMPLETE stage wave script, every stage, every record

status: DONE (one item unresolved - see section 6)
date: 2026-08-01
role: READER. Nothing in `games/gradius/src/` was edited. Two new tools under
`games/gradius/tools/oracle/`: `wavedump.py` (the inventory, ROM only) and
`wavelog.lua` / `wavelog.py` (the verdict, cartridge only).

Method: `docs/knowledge/09-enumerate-then-validate.md`. The ROM is the source of
the INVENTORY; the cartridge is the source of the VERDICT. Both halves are here
and the second one is a diff against the first, not a substitute for it.

---

## 1. The shape, verified line by line against `rip/prg.asm`

```
$A7D0[$19*2]                 7 stage entries, $A7DE $A7EE $A7FE $A80C $A81A $A828 $A836
  -> chunk pointer table     indexed by $61 = $3F AND $0E, used as a BYTE offset
                             so chunk index = ($3F >> 1) AND 7
    -> wave list             records; a $FF in the TRIGGER byte terminates
```

`$A30C-$A328` computes the fire position: `$98 = (trigger*2) AND $FF`,
`$99 = $61 + carry`, i.e. **scroll = chunk*512 + trigger*2**, and the record
fires on the first frame `$3F:$3E >= $99:$98`.

`$A346` reads the command byte and `$A34B CMP #$F0 / BCS $A37A` splits three
ways - the brief said two, it is three:

| cmd | descriptor | route | record size |
|---|---|---|---|
| `< $80` | 4 bytes at `[$A5FE]`=**`$A662`** + `3*cmd` (**stride 3, records overlap**) | `$A3B1` single spawn | 2 |
| `$80-$EF` | 4 bytes at `[$A600]`=**`$A602`** + `(4*cmd) AND $FF` | `$A3E4` formation | 2 |
| `>= $F0` | **the 5 bytes are inline in the wave stream**, copied to `$63-$67`, then `$64 -= $70` | `$A466` | **5** |

The 5-byte case is the fall-through trap in this subsystem: a decoder that
assumes a fixed 2-byte stride desynchronises the whole list from the first
`>= $F0` record onward. Stage 3 is 53/87 such records; stage 5 is 20/44.

`$A466` then splits again on the STAGE: `LDA $19 / CMP #$02 / BEQ $A46F` -
stage 3 (index 2) gets `$A46F`, which forces **type `$96`**; every other stage
gets `$A4A6`, whose type is the 4th inline byte.

### The dispatch index is `type AND $7F`, and `$96` is not out of range

`$AE19 JSR $83E4` with `A` = the type byte. `$83E4`'s `ASL A` is eight bits and
the carry is discarded, so the effective index into the 42-entry table at
`$AE1C` is `type AND $7F`. `$96 AND $7F = $16 = 22 -> $C906`. The port already
has this right (`src/enemies.js` `dispatch()`); `wavedump.py` did not on its
first pass and printed a bogus out-of-range pointer, which is recorded here
because it is exactly the kind of thing that makes an inventory wrong.

### Where a stage stops

```
$9A3D[$19] = 0C 0C 0C 0C 0B 0B 0C   $3F at which $9A4D sets $1B = $81 (boss)
$98FD[$19] = 0E 0E 0E 0E 0D 0C 0D   $3F at which $9904 advances the stage
```

chunk `k` is live for `$3F` in `[2k, 2k+1]`, so the last live chunk index is
`floor(($98FD[$19]-1)/2)`. Stage 1: chunks **0-6** of the 8 in its table -
**chunk 7 is dead data**.

---

## 2. The complete record list

`python games/gradius/tools/oracle/wavedump.py [--stage N] [--json]`

Counted from `assets/prg.bin`, no emulator:

| stage | chunk ptrs | live chunks | records | live | FORM | SINGLE | INLINE |
|---|---|---|---|---|---|---|---|
| 1 (`$19`=0) | 8 | 0-6 | 112 | **102** | 49 | 53 | 0 |
| 2 (1) | 8 | 0-6 | 133 | 113 | 31 | 82 | 0 |
| 3 (2) | 7 | 0-6 | 87 | 87 | 16 | 18 | **53** |
| 4 (3) | 7 | 0-6 | 111 | 111 | 48 | 63 | 0 |
| 5 (4) | 7 | 0-6 | 44 | 44 | 24 | 0 | **20** |
| 6 (5) | 7 | 0-5 | 104 | 98 | 28 | 70 | 0 |
| 7 (6) | 7 | 0-6 | 127 | 127 | 38 | 89 | 0 |

**718 records total, 682 live.** Across all seven scripts the live records name
**28 distinct enemy types**, and with the two spawner children and the capsule
that is **31 types resolving to 24 distinct handler ROUTINES. Seven of the 24
are ported. 270 of the 682 live records are a throw today.**

Stage 1's own list, chunk by chunk, is in the tool output; the summary is:

| chunk | ptr | records | first scroll | last scroll |
|---|---|---|---|---|
| 0 | `$A844` | 10 | `$0020` | `$01C0` |
| 1 | `$A859` | 16 | `$0200` | `$03E0` |
| 2 | `$A87A` | 20 | `$0400` | `$05F0` |
| 3 | `$A8A3` | 17 | `$0600` | `$07E0` |
| 4 | `$A8C6` | 19 | `$0820` | `$09F0` |
| 5 | `$A8ED` | 10 | `$0A00` | `$0B00` |
| 6 | `$A8ED` (again) | 10 | `$0C00` | `$0D00` | post-boss scroll |
| 7 | `$A8ED` (again) | - | - | - | **dead: `$98FD[0]=$0E`** |

Stage 1 authors **92 distinct records**; chunk 6 replays chunk 5's ten during
the post-boss scroll, for 102 live firings.

**Every chunk table repeats its last pointer**, and that repetition is the ROM's
own statement that the post-boss window is meant to spawn:

```
S1 $A7DE: A844 A859 A87A A8A3 A8C6 A8ED A8ED A8ED
S2 $A7EE: A903 A918 A93D A970 A999 A9BC A970 A970   <- repeats chunk 3, not 5
S3 $A7FE: A9C3 A9E0 A9FA AA38 AA81 AAC1 AAC1
S4 $A80C: AAEC AB07 AB24 AB4D AB74 AB9B AB9B
S5 $A81A: ABB6 ABD3 ABE8 ABE8 ABE8 ABE8 ABE8        <- one list for chunks 2-6
S6 $A828: ABFD AC16 AC39 AC6A AC8F ACBA ACBA
S7 $A836: ACC7 ACE8 AD0F AD36 AD61 AD8A AD8A
```

## 3. The enemy types stage 1 uses - and the ones the script does not name

Wave-script types, stage 1: `$04 $05 $06 $07 $08 $0F $10 $11 $12 $13 $27 $29`
= **12**, mapping to **12 distinct handler routines**.

That is not the whole set. Two of those handlers are SPAWNERS and produce types
that appear nowhere in any wave list:

* `$AF2E` (entry 15, type `$0F`) - `$AF43 LDY #$08 / LDA #$09 / JSR $AF98`
  spawns up to five children of **type `$09` -> `$B311`** (entry 9).
* `$AF88` (entry 16, type `$10`) - `$AF8D LDY #$F6 / LDA #$0C / JSR $AF98`
  spawns children of **type `$0C` -> `$B3CB`** (entry 12).
* `$AEC1 LDA #$01 / STA $030C,X` - any enemy whose `$03AC` bit is set becomes
  **type `$01` -> `$AEDD`** (the power-up capsule) when it dies.
* `$B0B4 LDA #$80 / CLC / ADC $030C,X` - twelve handlers add `$80` to their own
  type on first update; `AND $7F` sends them back to the same routine.

**Stage 1's transitive handler closure is 13 routines, not 12.** Wave 12's
`$B311` sighting "only on a run carrying power-ups" was never a power-up thing:
it is `$AF2E`'s child, and `$AF2E` is only spawned at `$04D0`, `$0750` and
`$09F0`.

## 4. How finished stage 1 is

`src/enemies.js` `dispatch()` implements ten handler routines: `$AE70 $AEDD
$AE99 $AEE1 $B026 $B098 $B0AF $B198 $B205 $B26C`. The `cmd >= $F0` route throws
outright (`src/enemies.js:367`).

* **7 of the 13** handler routines stage 1 needs.
* **80 of the 102** live records spawn something the port can run (78%).
* The first record it cannot run is **`$A87E`, chunk 2, scroll `$0440`, cmd
  `$03`, type `$07` -> `$B6E1`** - 1088 px into a 3072-px stage, i.e. **35% of
  the way in**. Measured, not computed: that record fired at **cartridge frame
  2490**, scroll 1088, `$61 = 4`, route `$A3B1`
  (`out/wavelog-shield.json`). Wave 12 measured `$B6E1`'s first execution at
  frame 2490 by a completely different hook; the two agree to the frame.
  The next three blockers land at frames **2498** (`$A880`, type `$13`),
  **2778** (`$A88A`, type `$0F`) and **5018** (`$A8D8`, type `$10`).

Missing, with the count of stage-1 live records each blocks:

| handler | entry | type | live records blocked |
|---|---|---|---|
| `$B747` | 19 | `$13` | 11 |
| `$B6E1` | 7 | `$07` | 7 |
| `$AF2E` | 15 | `$0F` | 3 |
| `$AF88` | 16 | `$10` | 1 |
| `$B311` | 9 | `$09` | (child of `$0F`, never in a wave list) |
| `$B3CB` | 12 | `$0C` | (child of `$10`, never in a wave list) |

22 blocked, 80 clean, of 102. If chunk 6 turns out not to run (section 6), the
denominators are 18 / 74 / 92 - 80%. Neither reading moves the first blocker.

### And the other six stages, same measurement

| stage | routines needed | ported | blocked live records | first blocker |
|---|---|---|---|---|
| 1 | 13 | 7 | 22 of 102 | `$0440`, 35% in |
| 2 | 11 | 6 | 12 of 113 | `$03F0`, 33% in |
| 3 | 11 | 6 | **58 of 87** (53 are the `>= $F0` route) | `$00E0`, 7% in |
| 4 | 15 | 7 | 28 of 111 | `$0160`, 11% in |
| 5 | 6 | 2 | **36 of 44** (20 are the `>= $F0` route) | `$0000`, 0% in |
| 6 | 9 | 6 | 53 of 98 | `$0340`, 30% in |
| 7 | 14 | 7 | 61 of 127 | `$0220`, 18% in |

**Stage 1 is not special - it is roughly the best case, and the best case gets
35% of the way in.** Stage 2 is the only one with fewer blocked records (12 of
113); stage 5's very FIRST record is a throw; stage 3 is unplayable past 7%
because more than half its script is the unported `cmd >= $F0` route. Whatever
"how finished is Gradius" means, it is not larger than **412 of 682 live
records** and **7 of 24 handler routines**.

## 5. Validation on the cartridge

`python games/gradius/tools/oracle/wavelog.py --frames 16000 --script
"200:,10:S,190:,15600:R" --poke "0046=200"`

`wavelog.lua` hooks `$A335` (record fired; `$6A:$6B` still points at it),
`$A3B1`/`$A3E4`/`$A466` (which route ran), `$AE19` (the type byte) and `$9A56`
(boss page). `wavelog.py` diffs every firing against `wavedump.py`'s table.
`$46` is the shield counter - `$C1BF`, `$C249`, `$C28E` all read it - so poking
it holds the ship alive past the openings that kill every scripted run.

```
frames 16000  maxScroll $0A65  records 232  boss frame None
routes: {'A3B1': 105, 'A3E4': 127, 'A466': 0}
matched 232   mismatched 0   unknown-cursor 0
distinct static records confirmed on the cartridge: 86 of 92
```

Type histogram from `$AE19` on that run:
`$01:11242 $02:4644 $04:134 $05:94 $06:20 $07:16 $08:152 $09:30 $0C:12 $0F:7
$10:4 $11:14 $12:17 $13:15 $29:633 $84:6766 $85:10300 $86:2675 $87:7331
$88:16277 $89:3783 $8C:1720 $8F:2320 $90:1860 $91:5228 $92:7486 $93:6378`

`$09` and `$0C` are in that histogram and in no wave list - section 3's claim,
measured. The six unreached records are chunk 5's `$0A68` onward; the run
stopped 3 pixels short of the first of them.

Two more things fell out of that run's per-record `$1B` and `$61` columns:

* `$61` took the values `0 2 4 6 8 10`, i.e. chunks 0-5 loaded, exactly the
  live set section 1 predicts for a run that never reaches the boss.
* records fired with `$1B` = `$80` (224 times) **and `$1B` = `$A0` (8 times)**.
  `$A0` is the death/respawn mode (`$C1F3`). So the spawn engine keeps running
  through a death - and the last record of the 16k run fired at scroll `$0420`
  at frame 15957, long after `maxScroll` `$0A65`, because a death rewinds the
  camera to the checkpoint and the chunk is reloaded from the start. Any
  scenario that measures "records fired" without also measuring `$3E:$3F` is
  measuring a different stage each time it dies.

## 5b. The descriptor tables' own denominators

* **Table A (`$A662`, single spawn, stride 3, 4 bytes read).** Its last usable
  entry is bounded by the stage pointer table at `$A7D0`: `(A7D0-A662-4)/3` =
  **cmd `$00`-`$78`, 121 entries**. Scripts use **119 of them**; `$32` and
  `$52` are the only two never referenced. The highest, `$78`, is used by
  stage 7 at `$ACBA`. So this table has no slack - a decoder that assumed a
  round number would be wrong at both ends.
* **Table B (`$A602`, formation, 4 bytes).** `$A602-$A661` = 96 bytes =
  **24 entries, cmds `$80`-`$97`, and all 24 are used.**
* **Formation table `$A592`** (2 bytes): 21 entries, `$A592-$A5BB`; 16 used.
* **Pattern table `$A5BC`** (3 bytes): 22 entries, `$A5BC-$A5FD`; 13 used.
* **Inline records:** 73 in the ROM, and only in two stages - 53 in stage 3,
  20 in stage 5. Stage 3's all become type `$96` (`$A46F`); stage 5's carry
  type `$14` in the fourth byte (`$A4A6`).

## 6. What I could NOT reach

* **Chunk 6 firing during the post-boss scroll is READ, not MEASURED.** The
  reasoning: `$9904` (mode `$86`, set at `$99CF`) ends `JMP $9A5E`, which calls
  `$A2C0`; `$A2F0` only refuses `$1B == $81` and `$1B == $82`; `$98FD[0] = $0E`
  so 512 px of scroll remain after the boss. Two runs (16k and 30k frames,
  shield poked, autofire) did not get past the boss, so I could not put a hook
  on it. If it turns out chunk 6 does not fire, stage 1 is 92 live records and
  74 of them clean instead of 102 and 80.
* **Chunk 7 is dead, also by reading.** `$9926` (the `$3F >= $98FD[$19]` test)
  runs BEFORE `$9A5E`/`$A2C0` in the same frame, so by the time the spawn engine
  sees `$3F = $0E` the stage has already advanced and `$3F` is 0. The one
  residual path - `$39 == 0` at `$9939`, which sets `$1B = $90` without
  resetting `$3F` - does reach `$A302` with `Y == $3F == $0E` and reloads chunk
  7, but `$A2D1` returns immediately after loading, and `$1B` bit 4 sends the
  next frame to `$96CF` (NEXT STAGE). So chunk 7's list can be *loaded* and
  never *run*. Not measured.
* Stages 2-7 are decoded but only stage 1 was diffed against the cartridge.
* Two further runs were launched and had not returned when this was written:
  a 30,000-frame autofire run aimed at getting past the boss, and a
  15,200-frame run that pokes `$1B = $86` at frame 14,000 to test the one
  uncertain half of the chunk-6 argument directly (does `$A2F0` let the engine
  run in mode `$86`). Three Mesen processes were competing for the CPU. The
  supporting evidence that survives without them: **every chunk table repeats
  its last pointer**, which is only useful if the post-boss window spawns, and
  records were measured firing in mode `$A0` (death/respawn), so `$A2F0`'s
  refusal really is only `$81`/`$82`.
* I did not enumerate what the OTHER 14 `STA $030C` sites in the ROM spawn -
  only the two reachable from stage 1's handler set (`$AF98`'s two callers) and
  the capsule at `$AEC1`. A full type-production graph is the obvious next
  recon and it is the thing that turns "12 types in the script" into "15 types
  on screen".
