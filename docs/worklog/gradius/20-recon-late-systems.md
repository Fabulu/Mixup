---
status: DONE
wave: 20
role: recon 5 of 5 -- the boss, the stage end, everything reachable only late
started: 2026-08-01
---

# Recon: late systems (boss, stage end, `$C413` arms, the loop counter `$1A`)

Method contract for this round (`docs/knowledge/09-enumerate-then-validate.md`):
**the ROM is the source of the INVENTORY, the oracle is the source of the
VERDICT.** Every section below ends in a COUNT taken from `assets/prg.bin`, and
every count that could be checked dynamically was checked against the cartridge.

Tool added by this round (`games/gradius/tools/zpuse.py`, ROM-derived output
only, nothing committed): an exhaustive static census of every instruction that
could touch a zero-page address or reference an absolute address, scanned at
**every** alignment over all 32768 bytes. Deliberately a SUPERSET -- a pair of
data bytes can decode as `LDA $1A` -- because the question it answers is "is this
address read anywhere at all", and only a superset can answer that with a No.
`rip/prg.asm` cannot: it is a *traced* disassembly and covers 44.3% of the PRG.

Everything else used tools that already existed: `dis6502.py`,
`oracle/wavedump.py`, `oracle/wavecensus.py`, `oracle/throwaudit.py`.

---

## 0. The headline

The port implements **1 of the 16 play sub-states**. `$80` is ported; `$81`-`$8F`
-- the entire end-of-stage sequence, the boss, the stage transition, the
alternate route and the end-of-game/loop chain -- are 15 `throw`s.

`src/nmi.js` `playArm()` throws on `$1B != $80` and again on
`$3F >= res.stage.bossPage`. **Both fire in ordinary play of stage 1**, measured
below at cartridge frames 1338/1339. That is the owner's "super unfinished as
soon as you get a bit further along in stage one".

---

## 1. `$96A5` -- the five arms of `$1B`

`$96A5` is a bit ladder, not a jump table. In order:

| test | target | meaning | ported? |
|---|---|---|---|
| `$1B & $10` | `$96CF` | **NEXT STAGE** | **no** |
| `$1B & $20` | `$96EF` | dying | yes (wave 5) |
| `$1B & $40` | `$96FB` | game over / continue | **no** |
| `$1B & $80` | `$982A` | playing -> `jt_982F` | 1 of 16 |
| else | `$96BE` | stage intro -> `jt_96C5` (5 entries, `$96C5`-`$96CE`) | yes, 5 of 5 |

**5 arms; 2 fully ported, 1 one-sixteenth ported, 2 not ported.**

`$96CF` in full, and it matters because it is NOT a screen reload:

```
96CF  A6 1B     LDX $1B                 (loaded, never used)
96D1  E6 19     INC $19                 next stage
96D3  A9 00 / 85 39 / 85 3A / 85 3F     $39 = $3A = $3F = 0
96DB  A2 20 / 95 50 / CA / 10 FB        clear $50..$70 (33 bytes)
96E2  A9 01 / 85 55                     $55 = 1
96E6  20 F0 9B  JSR $9BF0               HUD canned packets 16, 8+$19, 7, 5
96E9  20 3C 9C  JSR $9C3C               $60 = 1, $1B = $80
96EC  4C 5E 9A  JMP $9A5E
```

No `$882C`, no `$9B3E`. **The Gradius stage transition is seamless**: the terrain
streamer keeps streaming and the stage index changes underneath it. A port that
treats "next stage" as "reload everything" will be wrong.

---

## 2. `jt_982F` -- the play sub-state table, ALL 16 ENTRIES

Table at `$982F`, 32 bytes, index `($1B * 2) AND $FF` (`$83E4` starts with
`ASL A`), i.e. the low nibble. `$982F + 32 = $984F`, which is code and is itself
entries `$8E`/`$8F`'s target -- so **16 is proven by the byte layout**, not
assumed. Bytes:

```
4D 9A  0E 9A  E9 99  C0 99  82 99  7E 99  04 99  3E 9B
ED 9B  12 9C  1E 9C  8C 98  DD 98  E5 98  4F 98  4F 98
```

| `$1B` | handler | what it is | ported |
|---|---|---|---|
| `$80` | `$9A4D` | normal play; `$3F >= $9A3D[$19]` -> `$1B = $9A45[$19] = $81` | **yes** |
| `$81` | `$9A0E` | arm the end-of-stage timer `$4C:$4D` | no |
| `$82` | `$99E9` | count it down -- **and this is what arms `$C413`** | no |
| `$83` | `$99C0` | `$19 < 5` -> `$1B = $84`; `$19 >= 5` -> `$1B = $86` | no |
| `$84` | `$9982` | despawn sweep, then SPAWN THE BOSS | no |
| `$85` | `$997E` | `INC $5B`, and **falls through into `$9982`** | no |
| `$86` | `$9904` | scroll to the stage's real end; the `$39` branch | no |
| `$87` | `$9B3E` | (shared with intro state 0) full reload | as intro only |
| `$88` | `$9BED` | (shared with intro state 1) | as intro only |
| `$89` | `$9C12` | (shared with intro state 2) | as intro only |
| `$8A` | `$9C1E` | (shared with intro state 3) | as intro only |
| `$8B` | `$988C` | **end-of-game celebration** (loop complete) | no |
| `$8C` | `$98DD` | celebration body: `JSR $ADAB` then `JMP $9A8C` | no |
| `$8D` | `$98E5` | `$1B = 0`, `JMP $9B3E` -- start the next loop | no |
| `$8E` | `$984F` | forced fast scroll, +4 px/frame | no |
| `$8F` | `$984F` | same target, listed twice | no |

**16 entries, 15 distinct handlers, 1 ported as a play state.**

### FALL-THROUGH -- one live, one that MEASUREMENT KILLED

* `$CF23`/`$CF25`/`$CF28` in the ending writer are three entry points into one
  falling body (`DEC $9A` / `LDA ($98),Y + INY` / `STA $0700,X + INX`). Reading
  `$CF25` as a self-contained subroutine gets the packet format wrong. **Live.**
* `$997E` (`$85`) is `E6 5B / D0 35` = `INC $5B / BNE $99B7`, and `$9982` (`$84`)
  is the very next byte. My first reading of this file said "when `$5B` wraps to
  zero it falls into `$9982`, so the boss respawns every 256 frames". **That is
  wrong and the run disproves it.** `$5B` is not a free-running counter:
  `$9658 STA $5B` zeroes it at the TOP of every mode-5 frame (alongside `$5D`
  and `$5C`), so `INC $5B` at `$997E` always leaves 1 and the `BNE` is always
  taken. `$5B` is a per-frame "a handler has run" flag, read at `$9A9C` and
  `$9ACA` to gate `$98EE` and `$9D83`.

  The measurement is decisive and arithmetic, not impressionistic: `$9982` 512
  hits and `$997E` 1101 hits, and **512 + 1101 = 1613 = 3722 - 2109** exactly.
  The two states partition the frames with no overlap, so the fall-through fired
  zero times in 1101 opportunities. `$85` is left by the boss dying
  (`$B9A5 INC $1B`), and by nothing else.

  Logged because this is the trap running the other way: `docs/knowledge/02`
  says read past a handler's apparent end, and doing so produced a plausible,
  confidently-stated, false claim that only the cartridge could settle.

---

## 3. Stage 1's end sequence, complete, with its tables

All read out of `assets/prg.bin`:

| table | bytes | meaning |
|---|---|---|
| `$9A3D` | `0C 0C 0C 0C 0B 0B 0C` (+`02`) | per-stage `$3F` at which `$80` -> `$81` |
| `$9A45` | `81` x8 | the sub-state it goes to (always `$81`) |
| `$9A35` | `03 03 04 04 05 05 06 06` | `$4D` for the `$82` countdown, by **rank `$17`** |
| `$98FD` | `0E 0E 0E 0E 0D 0C 0D` | per-stage `$3F` at which `$86` ends the stage |
| `$B8EF` | `6C 6D 6E 6F 70 71 00 00` | the boss's 6 damage metasprites, then 0 = dead |
| `$B8F8` | `00 20 40 60 80 A0 C0 F0` | boss dY fraction by `$17` |
| `$B901` | `01` x8 | boss dY integer by `$17` |
| `$B90A` | `5A 50 46 3C 32 28 23 23` | boss turn-around threshold by `$17` |

The sequence, ROM-derived and then MEASURED (run `endchain`, section 8):

1. `$80` `$9A4D`: `$3F >= $9A3D[0] = $0C` -> `$1B = $81`. *measured f1338.*
2. `$81` `$9A0E`: `$4D = $9A35[$17]`, `$4C = 0`; `INC $5B`; `INC $1B`; `$62 = 1`;
   `JSR $99DF` (zero `$63`..`$6F`). Special case `$19 == 6`: `$4D = 1, $4C = $CA`.
   *measured 1 hit at f1339; `$17` was 1, so `$4D` = 3.*
3. `$82` `$99E9`: 16-bit decrement of `$4C:$4D` via `$840C`; **while this state is
   live, `$A2F7/$A2FB` diverts the whole spawn engine into `$C413`** -- the
   VOLCANO ERUPTION. At zero: `$60 = 0`, `INC $1B`, and for `$19` 0 or 3, sound
   `$3F`. *measured exactly 768 = 3 x 256 frames, f1340..f2107.*
4. `$83` `$99C0`: `INC $1B` -> `$84` (since `$19 < 5`); `INC $5B`; `$62 = 2`;
   zero `$63`..`$6F`. *measured 1 hit at f2108 = 1340 + 768. Exact.*
5. `$84` `$9982`: while `$3F == $9A3D[$19]` it runs only `$994A`, the DESPAWN
   SWEEP (needs `$3E >= $D0`; one slot index per frame out of `$5E`, clearing
   `$0500/$0540/$0580/$05C0/$0600/$0640/$0680/$06C0` and, for index < `$14`,
   `$010C/$012C/$030C`). Once `$3F` leaves that page: sounds `$1E` and `$05`,
   `$2D = 1`, allocate slot 9, `$030C+9 = $98`, `$032C+9 = $80` (Y),
   `$036C+9 = $F0` (X, off the right edge), `INC $5B`, `INC $1B`, `$5E = $3F`
   -- **`A9 3F`, the immediate 63, not the zero-page byte**. *measured 512 hits
   f2109..f2620.*
6. `$85` `$997E`: `INC $5B` then `JMP $9A5E`, every frame, until the boss dies.
   *measured 1101 hits, f2621..f3721, and NOT one re-entry into `$9982`.*
7. **The boss**: type `$98`. `$030C,X` is dispatched with `ASL A`, so the index is
   `type AND $7F` = `$18` = entry 24 = **`$B914`**. It also writes slot `X-1` with
   type `$99` = entry 25 = `$B913` = a plain `RTS` (drawn, never updated).
   *measured `$B914` 1102 hits, `$B913` 2202 hits, both first at f2620.*
8. `$86` `$9904`: the boss's death does `if $0100 < 2 then INC $1B` (`$B9A5`),
   landing here. Scrolls on; `$19 == 5` calls `$CDA5`; `$B2 == 0` queues canned
   packet `$93` via `$839F`; `$1C == $93` calls `$994A`. When
   `$3F >= $98FD[$19]`: `$39 == 0` -> `$1B = $90`; `$39 != 0` -> `INC $19`,
   `INC $3A`, `$3F = 0`, `$1B = $8E`. *measured 513 hits f3722..f4234.*
9. `$1B = $90` -> `$96A5` bit-4 arm -> `$96CF`. *measured 1 hit at f4235, and
   `$19` went 0 -> 1 on exactly that frame.*

### The boss, `$B914`, in detail

* Two slots: head (`$98` -> `$B914`) and body (`$99` -> `$B913` = RTS).
  `$B9FD` writes `$030B,X = $99` and `$010B,X = $80`; `$B9C3` gives the body
  metasprite `$85`; `$B9D4` sets `$012A,X = $32`.
* Rises from X `$F0` toward `$A4` (`$B9A8`: `CMP #$A4 / BCC / DEC $036C,X`).
* Then tracks the player's Y (`$BA0A` compares `$0360` with `$036C,X`) and
  oscillates with a rank-indexed speed (`$B8F8`/`$B901`), reversing at
  `$B90A[$17]`.
* Damage: `$046C,X` 0..6, metasprite `$B8EF,Y`; when the table byte is 0 or
  `$046C >= 7` it dies at `$B962`: score `$10` via `$8455`, `INC $3B,X`,
  explosion `$AC` via `$CB26`, both slots cleared, `INC $1B` if `$0100 < 2`.
* **LOOP-DEPENDENT**: `$B951 LDA $1A / BEQ` -- on loop 2+, every hit also sets
  `$04EC,X = $FF` and `$03AC,X = 0`. On loop 1 that arm never runs.
* Stage-2 special: `$B962` -> `if $19 == 1 and $04CC,X == 1 and $04AC,X < $78
  then INC $39`.

---

## 4. `$C413` -- what the "stage-advance arms" actually are

Two callers, meaning two different things:

* `$A2C4`: `LDA $3A / BEQ / JMP $C413` -- taken when `$3A != 0`.
* `$A2FB`: reached when `$1B == $82` (so `$3A == 0` there).

```
C413  LDA $02 / AND #$03 / BNE -> RTS      runs on 1 frame in 4
C41A  LDX #$09 ... $030C,X == 0 ?          find a free slot, 9 down to 0
C42A  JSR $A527                            clear it
C42D  LDA $3A / BEQ $C434 / JMP $C686      $3A != 0 -> the $C686 arm
C434  LDA $19 / JSR $83E4                  per-stage dispatch, table at $C439
```

**The `$C439` table is exactly 7 entries and this is byte-proven**, not assumed:
`$C439`-`$C446` are the 7 stage words, `$C447`-`$C44E` are 4 more words that
`$C44F` reads as a base (`LDA $C447,X` / `LDA $C448,X`, called with X = 0, 2, 4,
6 from `$C491`, `$C54F`, `$C5B8`, `$C6E6`), and `$C44F` itself is the next
instruction. 14 + 8 = 22 bytes, no slack.

| `$19` | handler | period | pattern | spawns |
|---|---|---|---|---|
| 0 | `$C486` | every 4 frames (`$C413`'s own gate) | `$C526` | **type `$0A`** (`$B36F`) -- STAGE 1 |
| 1 | `$C546` | `$02 & $07` | `$C58D` | type `$0B` (`$B37F`) |
| 2 | `$C686` | `$C684[$3A]` | -- | type `$97` / `$A6` |
| 3 | `$C5AD` | -- | `$C633` | type `$15` (`$B377`) |
| 4 | `$C653` | `$68 >= $28` | `$C67A` | routes through `$A4A6` |
| 5 | `$C6DE` | -- | `$C752` | slot scan on `$0136,X`, metasprite `$8D` |
| 6 | `$C429` | -- | -- | **`RTS` -- stage 7 has no late spawner** |

`$C447` pattern pointers: `$C526 $C58D $C633 $C752`. Each is **32 bytes = a
64-nibble cyclic pattern**, stepped by `$69 AND $3F`, the nibble selecting a row
of the per-stage emission table.

### Stage 1's volcano eruption, `$C486`, fully enumerated

```
C486  LDY $69 / BNE           $69 == 0 -> sound $0F (the eruption rumble)
C48F  LDX #$00 / JSR $C44F    pattern $C526; nibble -> $A9 = nibble*2
C494  Y = $A9 + $A9/2 = 3*nibble    -> 16 TRIPLES at $C4F6
C49D  $042C,X = $C4F6[Y]      dX high
C4A3  $03BC,X = $C4F7[Y]      dY high
C4A9  $69 < $1E -> DEC $03BC,X x2 ; $69 < $0A -> DEC x2 more   (ramp-up)
C4BF  $048C,X = (($02 << 3) & 7) + $C4F8[Y]     lifetime, frame-jittered
C4CD  $04AC,X = 1             HP
C4D2  $036C,X = $C4F4[$AA]    X = $38 or $B8  -- the TWO CRATERS
C4DA  $030C,X = $0A           the type
C4DF  $032C,X = $90           Y = the ground line
C4E4  $044C,X = $03EC,X = $02 AND $3F
C4EE  $012C,X = $58           the metasprite
```

Data, verbatim. `$C4F4` = `38 B8`. `$C4F6` = 16 triples:

```
02 07 40 | FE 07 40 | 02 08 40 | FE 08 40 | 03 06 60 | FD 06 60 | 01 08 40 | FF 08 40
03 07 40 | FD 07 40 | 03 08 40 | FD 08 40 | 04 05 40 | FC 05 40 | 02 08 60 | FE 08 60
```

`$C526` = `AF BE 01 AE FE B0 A1 89 45 67 89 76 EF 54 BA DC 78 CE 32 AF AE BF BE
01 89 98 45 54 23 32 01 10`.

`$69` wraps `$FF -> $7F` (`$C459`-`$C463`), so after the first cycle the
ramp-up rows (`$69 < $1E`, `$69 < $0A`) are never revisited.

**Type `$0A` -> handler entry 10 -> `$B36F` (`LDA $030C,X / BPL $B3A7` ->
`JMP $B0B4`).** `wavecensus.py` reports type `$0A` referenced by **zero** spawn
records in all seven stages: `$C486` is the only producer of a volcano fireball
in the entire ROM. Measured `$B36F` 6365 hits, first at f1339 -- the frame `$1B`
became `$82`.

### The `$3A` arm, `$C686`

`$3A` is an INDEX, not a flag: `$C68A LDY $3A`, `$C6B1 LDY $3A`.

```
$C684  28 0A     spawn period, by $3A
$C6CA  3F 00     metasprite $012C, by $3A
$C6CC  97 A6     type $030C,     by $3A
$C6CE  40 60 80 20 A0 80 40 A0 40 60 80 40 A0 20 A0 60    Y, by $69 AND $0F
```

`$3A = 0` (stage 3's normal case): type `$97` -> entry 23 = `$B7A1`, every `$28`
frames. `$3A = 1`: type `$A6` -> entry 38 = `$B61E`, every `$0A` frames. Both
also gated on `$3F < $0E`, spawned at X = `$F0`.

**`$3A` has exactly three writers in the ROM.** `zpuse.py zp 3A` gives 12 raw
hits; 4 are inside the `$CF2D`+ data blob, 1 is an `ORA (izx)` inside `$A759`
data. The real three: `$96D7 STA $3A` (=0, next stage), `$97E1 STA $3A` (=0,
respawn) and **`$993D INC $3A`, the only way it ever becomes non-zero.**

---

## 5. `$39` -- the branch nobody had written down, and it lives in STAGE 1

`zpuse.py zp 39` -> 7 hits; `$8D3A` is a `ROL $39,X` inside data. The 6 real:

| site | what |
|---|---|
| `$96D5 STA $39` | cleared on next stage |
| `$97DF STA $39` | cleared on respawn |
| `$AF7E INC $39` | **stage 1 only** (below) |
| `$B978 INC $39` | stage 2 only, from the boss death path |
| `$C786 STA $39` (`#$01`) | when `$5F >= $0A`, from `$C77C` = handler 22's destruction |
| `$9937 LDX $39` | the ONLY reader, inside `$9904` |

`$AF7E` in context. This is the destruction tail of handler 15 (`$AF2E`, type
`$0F`), which handler 16 (`$AF88`, type `$10`) also reaches through `$AF54`:

```
AF63  CPY #$05 / BCC        $046C,X (hits taken) < 5 -> not dead
AF67  LDA $19 / BNE $AF80   STAGE 0 ONLY
AF6B  LDA $18 / ASL / ASL / TAY
AF70  LDA $07E5,Y / LSR A / BCS $AF80    bit 0 of the player's MIDDLE SCORE BYTE
AF76  INC $5F / LDA $5F / CMP #$04 / BCC $AF80
AF7E  INC $39
```

`$07E4/$07E5/$07E6` is player 1's 3-byte BCD score (`$8474`: `LDA #$E4 / LDY $18
/ BEQ / LDA #$E8 / STA $9C`, `$9D = 7`, three bytes written through `($9C),Y` at
`$8490`); `$07E8`+ is player 2's, and `$AF6B`'s `ASL/ASL` produces exactly that
stride of 4. So the gate is **"bit 0 of the middle score pair is clear"**.

The denominator lands exactly. `wavedump.py` shows stage 0's script contains
**precisely four** records of those two types:

```
$A88A  scroll $04D0  type $0F  $AF2E
$A8B9  scroll $0750  type $0F  $AF2E
$A8D8  scroll $0930  type $10  $AF88
$A8EA  scroll $09F0  type $0F  $AF2E
```

and `$5F` must reach 4. **All four sit before page `$0A`**, i.e. before the
furthest point any measured run has ever reached -- which is exactly why 27,400
frames of throwaudit reported `$3A` as a flat zero. Nothing in that corpus killed
all four with the score bit clear.

What `$39 != 0` buys, from `$9904`:

```
9935  LDA #$90
9937  LDX $39 / BEQ $9945       $39 == 0 -> $1B = $90 -> $96CF -> INC $19
993B  INC $19                   $39 != 0 -> the stage index advances HERE
993D  INC $3A                   ...and the spawn engine is diverted to $C686
993F  $3F = 0
9943  LDA #$8E                  ...into the forced fast scroll
9945  STA $1B
```

`$8E` = `$984F`: `$2D = 1`; `$3E:$3F += 4` every frame via `$8402`; when
`$3F >= $11` and `$1B & $70 == 0`, sound `$50` and `$1B = $90` -> `$96CF` ->
**`INC $19` a second time**. Net from stage 1: `$19` 0 -> 1 -> 2, i.e. **stage 2
is skipped**, with a ~1088-frame forced-scroll segment in between during which
`$C686` rains type `$A6` every 10 frames.

Not reproduced dynamically -- see Blockers.

---

## 6. The loop counter `$1A`

### Writers -- complete

`zpuse.py zp 1A` -> 12 raw hits. `$D0A2` is an `ORA (izx)` inside the `$CF2D`+
data blob; `$BBBF` is a genuine `ORA $1A`. The writers:

| site | what |
|---|---|
| `$82EC STA $1A` | new-game init |
| `$9B74 STA $1A` | `$9B3E` intro state 0: `LDA $28,X / STA $1A` -- restore |
| `$97BD` | `LDA $1A / STA $28,X` -- save into the checkpoint slot |
| **`$9889 INC $28,X`** | the ONE increment, and it is not a `$1A` instruction at all |

`$9889` is inside `$9872`, reached from `$9904` only when `$19 == 6` (stage 7):

```
9872  E6 1B      INC $1B          $86 -> $87, i.e. into the intro chain
9874  A6 18      LDX $18
9876  A9 00 / 8D 01 20            PPUMASK = 0
987B  85 3F                       $3F = 0
987D  95 26                       $26,X = 0   -- stage index back to stage 1
987F  95 24                       $24,X = 0   -- checkpoint page back to 0
9881  A4 42 / F0 02 / A9 01       A = ($42 != 0) ? 1 : 0
9887  95 22                       $22,X       -- one speed-up carried into the loop
9889  F6 28      INC $28,X        <-- THE LOOP COUNTER
988B  60
```

So **`$1A` is incremented exactly once per completed 7-stage lap, in the
checkpoint slot**, and read back into `$1A` by `$9B3E`. It is never clamped on
write; `$CEAC` is the only place it is clamped, and only for a table index.

### Readers -- complete, 8 real sites

| site | effect of `$1A != 0` |
|---|---|
| `$B003` | `LDY $17 / ($19 != 0) INY / ($1A != 0) INY / LDA $B01D,Y` -> `$04EC,X`, `$040C,X`. `$B01D` = `64 46 3C 37 32 2D 28 23 1E` (9 entries) = a child object's FIRE INTERVAL. Loop 2+ shortens it one step. |
| `$B951` | inside the stage-end boss `$B914`: each hit also sets `$04EC,X = $FF`, `$03AC,X = 0` |
| `$BBBF` | `LDA $19 / ORA $1A / BEQ $BBEC` -- on **stage 1 of loop 1 only**, the enemy-fire accumulator Y is pinned at its minimum of 1 and the whole `$BBC3` ladder is skipped |
| `$BBC9` | `LDA $1A / BEQ` -> `INY`; `CMP #$02 / BCC` -> `INY` again. Loop 2 = +1 fire rate, loop 3+ = +2 |
| `$BC44` | `LDA $1A / BNE $BC59` -- skips the `$19 < 2` + "the enemy must be right of the player" restriction on firing |
| `$BD42` | enemy-bullet dY: loop 2+ adds a second velocity accumulation and sets `$044C,X = $80` |
| `$BD96` | the same for the other axis (`$042C`/`$03EC`) |
| `$CEAC` | `CMP #$06 / clamp to 6 / ASL / LDA $CF2D,X` -- the ENDING TEXT script pointer |

`$CF2D` is **7 words and every one of them is `$CF3B`**:

```
CF2D: 3B CF 3B CF 3B CF 3B CF 3B CF 3B CF 3B CF
```

The loop-indexed ending table is decoration: the ending text is identical in
every loop. That is the only `$1A`-indexed *table* in the ROM, and it is flat.

**Net: a port that never leaves loop 1 has 8 untested read sites, and 5 of the 8
are in the enemy-bullet engine** -- exactly the subsystem the owner has already
falsified once (`05-FINDING`). `$1A` should be a first-class byte in `state.js`,
not a constant 0.

### The way into loop 2 is the end-of-game chain

`$8B`/`$8C`/`$8D` are not "late stage" states; they are the **ending**:

* `$988C` (`$8B`): `$57 == 0` -> `JMP $9C24` (keep streaming terrain). Else
  allocate slots 8 and 9: slot 9 type `$28` (entry 40 = `$BB0F`) at
  `$036C+9 = $A4`, `$032C+9 = $88`; slot 8 metasprite `$9E` at `$74`, `$80`;
  `$0120 = 0`, `$0100 = 0`, `INC $1B`, `$0100 = 3`, sound `$E8`, `INC $1F`,
  canned packets `$21` and `$05`.
* `$BB0F` runs the scene; `$BB1C JMP $CE94` runs the **typewriter text writer**:
  every 8 frames (`$4E`), re-emit the whole line with one more character (`$4F`
  characters this pass), `$FE` = pause, `$FF` = restart. Script at `$CF3B`.
  `$BB26 INC $1B` ends it.
* `$98DD` (`$8C`): `INC $5B`, `JSR $ADAB` (objects only), `JMP $9A8C`.
* `$98E5` (`$8D`): `INC $5B`, `$1B = 0`, `JMP $9B3E` -- a full intro, now with
  `$19 = 0` and `$1A` = loop+1 restored from the checkpoint slots.

The `$CF2D`-`$EC1D` hole in `rip/prgmap.txt` -- 7409 bytes, the single largest
unreached region in the PRG, 22.6% of it -- **starts with this ending script.**

---

## 7. Terrain / map objects late in stage 1

`oracle/wavedump.py`, stage 0: the chunk pointer list at `$A7DE` has **8
entries**, and entries 5, 6 and 7 are the **same pointer `$A8ED`**:

```
$A844 $A859 $A87A $A8A3 $A8C6 $A8ED $A8ED $A8ED
```

`$A8ED` is 10 records + the `$FF` terminator:

```
trig $00 cmd $04 -> type $13 $B747      trig $02 cmd $03 -> type $07 $B6E1
trig $20 cmd $09 -> type $13 $B747 POWERUP
trig $30 cmd $02 -> type $06 $B198      trig $34 cmd $69 -> type $27 $AEDD
trig $40 cmd $02 -> type $06 $B198      trig $50 cmd $04 -> type $13 $B747
trig $60 cmd $02 -> type $06 $B198      trig $70 cmd $01 -> type $06 $B198 POWERUP
trig $80 cmd $02 -> type $06 $B198
```

So from world X `$0A00` to the end of the stage the SCRIPT contributes **four
distinct enemy types and nothing else**: `$13` (`$B747`, NOT ported), `$07`
(`$B6E1`, NOT ported), `$06` (`$B198`, ported wave 12), `$27` (`$AEDD`, ported).
Everything else appearing after page `$0A` comes from `$C413`, not the script.

There is no late terrain variant to find in stage 1. `$9A3D[0] = $0C` is where
`$80` hands over, and pages `$0C`-`$0E` play out under sub-states `$82`-`$86`
with the streamer running unchanged.

---

## 8. MEASURED -- run `endchain`

```
python games/gradius/tools/oracle/throwaudit.py --frames 6000 --name endchain \
  --script "200:,10:S,190:,1350:RD,324:RU,80:RD,3846:R" \
  --poke "0046=5,0020=9,003F=11@1200"
```

Interventions stated, not hidden: `$46 = 5` held every frame (the force field
absorbs at `$C1BD`/`$C247`/`$C28C`, so the ship survives), `$20 = 9` lives held,
and `$3F` poked to `$0B` **once** at frame 1200 to skip ~4000 frames of scrolling
the corpus has already characterised. Poking `$3F` costs the terrain's
correctness on that frame; it costs nothing in the logic under test, which reads
`$3F` and nothing else. `$17` was 1 throughout play (the held shield counts 1
toward the rank), which is why the `$82` countdown is 3 pages and not 4.

Actual output, the rows that matter:

```
$9A56  $3F reached the boss page -> $1B = $81          1@1338
$9A0E  play sub-state $81 (end of stage)               1@1339
$99E9  play sub-state $82                            768@1340
$99C0  play sub-state $83                              1@2108
$9982  play sub-state $84                            512@2109
$997E  play sub-state $85                           1101@2621
$9904  play sub-state $86                            513@3722
$984F  play sub-states $8E/$8F                         0@   -
$988C  play sub-state $8B                              0@   -
$96CF  NEXT STAGE ($1B bit 4)                          1@4235
$B36F  hdlr 10 (type $0A, the volcano fireball)      6365@1339
$B914  hdlr 24 (the stage-end boss head)             1102@2620
$B913  hdlr 25 (the boss body, an RTS)               2202@2620
$C906  hdlr 22                                         0@   -
$C1D6  the death routine                               1@5882

$1B  0x283, 1x1, 2x1, 3x1, 4x23, 128x2676, 129x1, 130x768, 131x1,
     132x512, 133x1101, 134x513, 144x1, 160x118
$19  0x4235, 1x1765
$1A  0x6000
$3A  0x6000
$17  0x310, 1x3925, 2x1765
max scroll reached: endchain=$0E00
```

Three exact arithmetic confirmations of the ROM reading, not approximations:

* `$82` ran **768 = 3 x 256** frames, and `$9A35[$17=1] = 3`.
* `$83` fired at **2108 = 1340 + 768**, once, exactly as the `INC $1B` implies.
* `$19` changed 0 -> 1 on frame **4235**, the same frame `$96CF` executed once.

`$1A` and `$3A` were 0 on all 6000 frames -- consistent with section 5 (the `$39`
path needs four kills this trajectory does not make) and section 6 (`$1A` needs
six more stages).

---

## 8b. WHY FIFTEEN WAVES NEVER SAW ANY OF THIS -- it was arithmetically impossible

Two more runs, no `$3F` poke, shield and lives still held:

```
warphunt    9000 frames  "...,1350:RDA,324:RUA,80:RDA,7046:RA"   max scroll $0A64
driftright  7000 frames  "...,1000:RA,4046:A"                    max scroll $0A9B
```

`warphunt` stopped at **`$0A64` -- byte for byte the same ceiling the 27,400-frame
wave-12 corpus reported.** That is not a sampling coincidence; it is a budget.

The scroll rate is measured, not quoted: sub-state `$84` occupied exactly 512
frames while `$3F` advanced one page (`$0C` -> `$0D`), i.e. **256 px / 512 frames
= 0.5 px per frame**. So:

| leg | frames |
|---|---|
| boot to first play frame | 310 |
| `$3F` 0 -> `$0C` at 512 frames/page | 6144 |
| `$82` countdown, `$9A35[$17]` x 256 | 768-1536 |
| `$84` despawn wait, one page | 512 |
| `$85` until the boss dies | ~1100 |
| `$86` `$3F` `$0D` -> `$0E` | ~513 |
| **`$96CF`, stage 2 begins** | **~9350** |

**No script in the corpus was ever longer than 6000 frames.** The longest could
not have reached `$1B = $81` even with perfect play, let alone the boss. And a
single death past the checkpoint clamp (`$97B5 CMP #$08 / BCC / LDA #$08` pins
the stage-1 checkpoint page at 8) costs another ~1000 frames of re-scrolling --
which is the whole difference between `warphunt` (three deaths, `$0A64`) and
`driftright` (one death, `$0A9B`).

So the throwaudit zeroes for `$9A0E`..`$9904` were never evidence about the
cartridge. They were evidence that **every scenario in the corpus is shorter than
the thing it was being used to rule out**, and no amount of *more varied* input
would have fixed it -- only *longer* input. This is `docs/knowledge/09`'s point
with a number attached: the frame budget was checkable statically, on day one,
from `$9A3D[0] = $0C` and a scroll rate, and nobody checked it.

**Concrete corpus requirement:** a scenario that reaches the end of stage 1 needs
**>= 9400 frames** and must not die after page 8. Seed-anywhere (wave 10) is the
cheaper route and is exactly what it was built for; `endchain` above is a
one-poke version of it.

---

## 9. What the port needs, in the order the cartridge needs it

1. `jt_982F` as a real 16-entry table, plus `$9A3D`/`$9A45`/`$9A35`/`$98FD` as
   exported data. Nothing else is reachable without it.
2. `$9A0E`/`$99E9`/`$99C0` -- the timer states. Small, pure, no new entities.
3. `$C413` + `$C486` + `$C44F` + the four data tables: the volcano eruption, the
   single most visible missing thing in stage 1.
4. Handler entry 10, `$B36F` -> `$B0B4` -- the fireball's motion and draw.
5. `$9982`/`$997E` + `$994A`, including the `$997E` fall-through.
6. Handler entries 24/25, `$B914`/`$B913` + `$B9A8`/`$BA0A` -- the boss, its two
   slots, its damage table and its rank-indexed tracking.
7. `$9904` + `$96CF` -- the stage transition; seamless, no reload.
8. `$39` + `$3A` + `$984F` + `$C686` -- the alternate route.
9. `$1A` as a live byte, and its 8 read sites.
10. `$988C`/`$98DD`/`$98E5` + `$BB0F` + `$CE94` + `$CF3B` -- the ending and the
    loop wrap.

## 10. Ruled out

* **"Handler 22 `$C906` is the stage-1 boss."** It is not. `wavecensus.py` shows
  type `$96` (-> entry 22) has 53 spawn records and every one is in stage 3
  (`$19 = 2`). `$C906` is a nametable-patching destructible taking 3 hits;
  `$C936` is its rank-indexed reopen timer, not hit points. Measured 0 hits over
  a full stage-1 clear.
* **"Type `$0A` comes from the wave script."** Zero records in all seven stages
  reference it; `$C486` is its only producer.
* **"`$C413` is the stage advance."** It is the per-stage LATE SPAWNER. The
  actual stage advance is `$96CF`. The name used in `src/enemies.js` and in
  `throwaudit.lua` is wrong and has been steering the reading of it.
* **"Stage 7 has a `$C413` handler."** `$C439`'s 7th entry is `$C429`, an `RTS`.
* **"The loop counter changes the ending."** `$CF2D`'s 7 entries are all `$CF3B`.
* **"`$9982` sets `$5E` from the camera page."** `A9 3F` is an immediate 63.
* **"`$997E` falls through into `$9982` and respawns the boss."** My own first
  reading; killed by `$9658 STA $5B` plus 512 + 1101 = 1613 exactly (section 2).
* **"The corpus's `$0A64` ceiling means stage 1 stalls there."** It does not.
  With `$3F` poked past it the run went to `$0E00` and cleared the stage. `$0A64`
  is where a 6000-frame budget runs out, not where the game stops (section 8b).
* **"`$1A` could become non-zero in the port today."** It cannot. `save28` is
  written only from `zp1A` (`flow.js:166`) and read back (`flow.js:260`); the
  ROM's single increment `$9889 INC $28,X` lives inside the unported `$9872`, so
  `$1A` is structurally pinned at 0 and all 8 read sites are dead.

## 11. Blockers

1. **The `$39` route is enumerated but not reproduced.** It needs all four of
   stage 1's `$AF2E`/`$AF88` objects killed (5 hits each) with bit 0 of `$07E5`
   clear at each kill, in one life, before page `$0A`. What I tried: `warphunt`
   (9000 frames, autofire held) put 1631 frames through `$AF2E` and 1612 through
   `$AF88`, so both object types were live and being shot at, and `$3A` still
   never left 0 -- but that run also never reached `$9904`, so `$39`'s only
   reader never executed and the run cannot distinguish "`$39` was 0" from
   "`$39` was never looked at". `$39` is not in `throwaudit.lua`'s `GATE_ADDR`
   list; adding it is a two-line change and the next wave should make it.
2. **`$07E5`'s role in `$AF70` is inferred from the score layout, not measured.**
   No run yet kills the same object at two different score parities.
3. **Nothing in stages 2-7 was validated dynamically.** Every claim about
   `$C546`/`$C686`/`$C5AD`/`$C653`/`$C6DE`, about `$B978`, and about the ending
   chain is read-from-ROM only.
4. **`$B0B4`, `$ADAB`, `$9A8C`, `$CB26`, `$839F`, `$CDA5`** are named here as
   call targets but were not themselves enumerated; they belong to recon 1-4's
   subsystems.
