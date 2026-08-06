# Wave 32 RECON - stage 5 (`$19 = 4`) and the `$0600` substrate

status: DONE
recon agent, READ-ONLY (no `src/` edits, no commit; only this file is written)

This file is the RECON GATE named in `docs/worklog/gradius/29-plan-whole-game.md`
§3 W32 ("risk HIGH; recon gate first"). It decides whether W32 is one wave, two,
or blocked, BEFORE any implementer touches `src/`.

Method per `docs/knowledge/09-enumerate-then-validate.md`: the ROM is the
inventory. Every number below was counted this session out of
`games/gradius/rip/prg.asm`, `games/gradius/assets/prg.bin` and
`games/gradius/src/`. Where I could not settle a question I say so and list what
I ruled out.

---

## 0. HEADLINE (written first so an interrupted run still says something)

**`$0600` is not "destructible terrain". It is a 4-slot articulated-ARM pool**
(4 groups × `$30` bytes = `$0600`-`$06BF`, 6 segments each), owned by the
stage-5 enemy `$CA5E`. Nothing in it touches the terrain map, the nametable, or
the VRAM queue.

**The plan's §3 W32 table lists four coupled pieces. One of them is wrong:**
`$C32F`/`$C2DC` (the breakable-wall VRAM patch) is *excluded* on stage 5 -
`$C2AB CMP #$04 / BNE $C2B5 / $C2AF RTS` means `$19 == 4` skips the entire
terrain-collision block. `src/collision.js:822` already transcribes that RTS
correctly. So `$C32F` is a stage-2/4/6/7 item, not a stage-5 item.

**The plan is missing a fifth piece it does not name:** `$9663`'s half-rate
fork. When ≥ 2 arm groups are live and `$02` is odd, stage 5 runs a *reduced
frame* (`$A2C0`/`$CB91`/`$ADAB`/`$BBB7`/`$9FFC`/`$C0C7` and nothing else) and
jumps straight to `$9A8C`, skipping the `$1B` sub-state machine, the scroll and
the wave stream for that frame. That is a control-flow fork at the very top of
play mode `$9650`, and it is the highest-risk item in the wave.

Full verdict in §8.

---

## 1. WHAT THE `$0600` SUBSTRATE IS

### 1a. The shape, derived from the code (not from any document)

Four groups, base `B ∈ {$0600, $0630, $0660, $0690}`, `$30` bytes each. The
`-$30` walk appears verbatim in five routines (`$8BEA`, `$A4C7`, `$BF04`,
`$C29E`, `$CB83`, `$CBC3` - six sites), always `LDX #$90 … SBC #$30 … BPL`, so
the group count and stride are the ROM's, not an inference.

Field map, from the 71 instruction sites that reference `$0600`-`$06BF`
(counted this session; the offsets below are the complete set - there is no
access at any other offset):

| offset | meaning | written by | read by |
|---|---|---|---|
| `B+$00` | **owner enemy slot** (0 = group free) | `$A50E`, `$CB5F`=0, `$CC1B`=0, `$BF5A`=0 | `$8BDF $966B $9671 $9677 $967D $A4BD $BEF9 $BF52 $C269 $CB54 $CB9B` |
| `B+$01` | **shape** = (nibble − 1) | `$A509` | `$CC56 $CC5B` |
| `B+$02` | cleared, no reader found | `$A51A` | - |
| `B+$03` | update-parity counter (`DEC`, odd frame → skip) | `$CC3B` | `$CC38 $CC3E` |
| `B+$04` | fire timer vs `$CBCA,$17` | `$CBA5` `$CBBA` | `$CBA8` |
| `B+$05` | **hit counter** vs `$BEEA,$17` | `$BF3C` | `$BF3F` |
| `B+$10..$15` | per-segment **angle/state** (6) | `$A517`, `$CCAA $CCBB $CCCD $CCE1 $CCF4` | `$CCBE $CCF7 $CD06 $CD40`, `$8C0E` (`B+$15` only) |
| `B+$18..$1D` | per-segment **X** (6) | `$A51D`, `$CC82`, `$CD22 $CD31` | `$8C27 $BF1A $C27C $CD13 $CD1F`, `$BF5F`/`$CB6E` (`B+$1A`), `$CBDE`/`$CC04` (`B+$1D`) |
| `B+$20..$25` | per-segment **Y** (6) | `$CC8B`, `$CD58` | `$8C33 $BF23 $C285 $CD47 $CD51`, `$BF65`/`$CB74` (`B+$22`), `$CBE9`/`$CC0D` (`B+$25`) |

`B+$06..$0F`, `B+$16..$17`, `B+$1E..$1F`, `B+$26..$2F` are never touched.

Two segment indices are special and both are the ROM's constants:
* **segment 2** (`B+$1A`/`B+$22`) is the only vulnerable one - `$BF31 LDA $AB /
  CMP #$02 / BEQ $BF3A`, and it is also where the explosion and the replacement
  object are placed on destruction (`$BF5F`/`$BF65`, `$CB6E`/`$CB74`);
* **segment 5** (`B+$15`, `B+$1D`, `B+$25`) is the TIP - it selects the head
  sprite (`$8C0E`) and it is the muzzle the arm fires from (`$CBDE`/`$CBE9`).

### 1b. `$06C0`-`$06FF` is NOT part of it

`$06C0`-`$06FF` is the tail of the **`$0700` VRAM queue page**, addressed
backwards (`$06FE,Y` with `Y = $0E` etc). The 16 instruction sites there belong
to `$88E5` (HUD digits), `$9818`, `$B5A9`/`$B5DF` (which is `$B569`, **stage
7's** handler, reached only via `$B574` - *not* `$B559`) and `$CEF8`. Group 3
ends at `$06B5` used / `$06BF` reserved, so there is no overlap. Ruled out by
reading each of the 16 sites.

### 1c. The two clears are generic, not part of the subsystem

* `$9B49` (inside `st_9B3E`, the stage/life reload) zeroes `$0600`-`$06FF` with
  `STA $0600,X / STA $0680,X`, X = `$7F..0`. Already ported.
* `$994A` (the despawn sweep) zeroes `$0600,X / $0640,X / $0680,X / $06C0,X`
  with X = `$5E`. Stride `$40`, not `$30` - this is a page sweep, not the group
  structure. Already ported (`src/nmi.js:549`, `:669`).

Neither needs changing for stage 5. (Their stores land in the offset table
above only as an artefact of my base arithmetic; they are not fields.)

---

## 2. HOW "DESTRUCTION" ACTUALLY WORKS

There are exactly two ways a group leaves play, and neither writes a nametable
or a VRAM packet:

1. **Shot destroys the arm** - `$BEF3` → `$BF0B`. Per group, walk segments
   `B+5` down to `B+0` (`$AA = B + $AB`, `$AB = 5..0`). Reject unless the shot
   box hits; then only `$AB == 2` counts. `INC $0605,X`, compare against
   `$BEEA,$17` (9 rank rows `02 02 03 04 05 06 07 08 09` - so 2 to 9 hits by
   rank). Below threshold → `JMP $C0B7` (shot consumed). At threshold:
   `JSR $8453`, `LDX $0600,Y` → `DEC $016C,X` (the OWNER's arm count),
   `STA $0600,Y` = 0 (group freed), then segment 2's X/Y are copied into
   **object slot 0** and `LDA #$0C / LDX #$00 / JSR $CB28` turns slot 0 into the
   explosion. **`$CB28` is a fall-through** (`JSR $EC1E` then straight into
   `$CB2B`) - already noted and ported in `src/enemies.js:2466`.
2. **Owner dies** - `$CA5E` → `$CB1B` → `$CB4E`. Walks the 4 groups; for each
   whose `B+$00` equals the dying slot `$A8`, frees it and converts a free
   object slot (`X = 7..0`, `$030C,X == 0`) into an explosion via `$CB2B`,
   positioned at segment 2 (`$061A`/`$0622`).

There is also a silent free: `$CC33`'s first two instructions
(`LDA $030C,Y / BEQ $CC19`) zero `B+$00` if the owner slot has become empty by
any other route.

**Data representation:** the arm is 6 (x, y, angle) triples in RAM, regenerated
every other frame by `$CC33`+`$CC99` from the owner's position; there is no
tile map, no bitmask, no nametable patch. It is drawn purely as sprites by
`$8C06` (5 body sprites tile `$F7`, 1 head sprite from `$8BF2,X` with attribute
`$8C02,Y`). **So "destructible terrain" is a misnomer inherited into the plan;
the correct name is the arm/tentacle pool.**

---

## 3. THE INVENTORY, AND WHAT IS PORTED (N of M)

**Denominator, counted this session:** 11 ROM routines reference
`$0600`-`$06BF`. Two of them (`$9B49`, `$994A`) are the generic clears above and
are already ported, leaving **9 stage-5-specific routines**. Add the three
routines that are part of the same closure but do not themselves name `$0600`
(`$CA5E` the owner, `$C653` the late-spawner arm, `$C772` the per-frame hook)
and the wave's real denominator is **12 routines**.

| # | ROM | role | gate | in `src/` today |
|---|---|---|---|---|
| 1 | `$9663` (`loc_9663`, inside `st_9650`) | census of the 4 headers → `$5C`; the **half-rate fork** | `$19==4` | **THROWS** `src/nmi.js:341` |
| 2 | `$8BD9` (`loc_8BD9`) | walk headers, call `$8C06` | `$19==4` at `$8B8D` | **THROWS** `src/oam.js:211` |
| 3 | `$8C06` (`sub_8C06`) | draw 6 sprites for one group | - | not ported (behind #2) |
| 4 | `$A4A6` (`sub_A4A6` + `loc_A500`) | allocate groups, spawn the owner | `$A466`: any `$19 != 2` | **THROWS** `src/enemies.js:685` |
| 5 | `$BEF3`/`$BF0B` | shot vs segments, the kill | `$19==4` at `$C037` | **THROWS** `src/collision.js:227` |
| 6 | `$C267` (`loc_C267`) | player body vs segments | `$19==4` at `$C25D` | **THROWS** `src/collision.js:416` |
| 7 | `$CB4E` (`loc_CB4E`) | free groups when the owner dies | via `$CB23` | not ported |
| 8 | `$CB8A`/`$CB91` (`sub_CB91`) | per-frame group driver + fire timer | `$C772` (`$19==4`) or `$9691` | not ported |
| 9 | `$CBD1` (`sub_CBD1`) | the arm's tip fires a bullet (`$BCB1`) | - | not ported |
| 10 | `$CC33` (+ `$CC19`, `$CC99`-`$CD64`) | segment kinematics | - | not ported |
| 11 | `$CA5E` (`st_CA5E`, dispatch entry 20) | the owner enemy | wave/late records | not ported (entry 20 throws) |
| 12 | `$C653` (`st_C653`, `jt_$C439[4]`) | stage-5 late spawner → `$A4A6` | `$19==4` | **THROWS** `src/enemies.js:450` |

**PORTED: 0 of 12**, measured against `games/gradius/src/` as it stood while a
W30 implementer was concurrently writing to it - `$B402`/`$B434` were still
unported at the moment I read (`stageledger.py`: `stage 2: 28/78`,
`stage 3: 96/98`), `$B4FD`/`loc_B502` had already landed. None of the twelve is
in W30's scope, so the 0/12 is stable; the stage-3 numbers I quote are not.
Six of the twelve are already **loud named throws** (rows
1, 2, 4, 5, 6, 12) - W28's loudness work landed, including the sprite pass that
the plan listed as a "silent gap". Rows 3, 7, 8, 9, 10, 11 are unreachable
behind those throws, so they are covered, not silent.

Corrections to the plan's W32 table:
* `$C32F`/`$C2DC` - **not a stage-5 piece.** See §0 and §5.
* `$8BD9`/`$8C06` - **no longer a silent gap**; it throws today.
* `$9663`'s half-rate fork - **missing from the plan's table entirely.**

One more `$5C` reader exists that no plan document names: `$C04B` (inside
`$BFE2`'s tail) - `LDA $5C / CMP #$02 / BCC $C052 / RTS`, i.e. `$5C >= 2`
suppresses `JMP $C0C7`. `src/collision.js:125` already has it, correctly.

---

## 4. WHAT STAGE 5 NEEDS THAT STAGES 1-4 DID NOT

### 4a. The half-rate frame fork - THE thing the plan missed

`$5C` (the count of live arm groups) is read in **three** places and written in
**two**, all read out of the listing this session (`$5C` appears at exactly five
instruction sites in the whole PRG: `$965A`, `$9683`, `$9A5E`, `$C04B`,
`$CB8A`):

```
9650  st_9650 = jt_$80D4[5], THE PLAY MODE
965A  STA $5C                     $5C := 0, every mode-5 frame
9663  LDA $19 / CMP #$04 / BNE $96A5        <-- stage 5 only
9669  count $0600/$0630/$0660/$0690 nonzero into X
9683  STX $5C
9685  CPX #$02 / BCC $96A5        fewer than 2 arms -> normal frame
9689  LDA $02 / LSR / BCC $96A5   even frame        -> normal frame
968E  JSR $A2C0  JSR $CB91  JSR $ADAB  JSR $BBB7  JSR $9FFC  JSR $C0C7
96A0  INC $5B / JMP $9A8C         <-- SKIPS the whole $1B sub-state machine

9A5E  LDA $5C / CMP #$02 / BCS $9A70   <-- and on the OTHER parity the normal
                                           body SKIPS $A2C0 $BBB7 $9FFC $ADAB
C04B  LDA $5C / CMP #$02 / BCC $C052   <-- and $BFE2 skips $C0C7
```

So with **≥ 2 arms alive**, stage 5 splits one logical frame across two hardware
frames: the odd frame runs spawn/arms/objects/bullets/**player**/collision and
nothing else; the even frame runs the `$1B` machine + shots but *not* the
player, the spawn engine, the enemy bullets or the object update. **The player
is updated at 30 Hz while two arms are on screen.** That is the developers' own
slowdown mitigation and it is a stage-5-only control-flow fork sitting at the
top of the play mode.

Nothing else in the port has this shape. Every ported stage runs one frame per
frame. This is the single largest new thing in W32, and it is a *frame
structure* change, not a handler.

The port has it as a tripwire in all three places today
(`src/nmi.js:342`, `src/nmi.js:924`, and the correct RTS at
`src/collision.js:125`), so nothing is silent.

### 4b. Everything else stage 5 needs

| need | source | new? |
|---|---|---|
| the arm pool (12 routines, §3) | - | **entirely new** |
| the inline-5 stride route `$A37A`/`$A466` | W30 decodes it for stage 3 | shared |
| `$B402` / `$B434` (entries 13/14) | W30 | shared, still unported today |
| `$B559` (entry 29, 10 records) | `$B55C BPL $B502`; **`loc_B502` is already ported** (`src/enemies.js:2299`) | 16 bytes, 6 instructions |
| the boss | identical to stages 1-4 (`$B914`) | FREE |
| stage-end | `$98FD[4] = $0D`, `$9A3D[4] = $0B` (measured from `assets/prg.bin` this session) | FREE |
| terrain collision | **none** - `$C2AB CMP #$04 / RTS` | FREE (already right) |
| breakable walls `$C32F` | **not reached on stage 5** | not applicable |

### 4c. The stage-5 wave stream, decoded with the correct stride

Live chunks 0-6 (`$98FD[4] = $0D` → chunks `0..6`), chunk table `$A81A`:

```
chunk 0  $ABB6  14 records   types $1D $1D $08 $08 $0D $0E $1D $1D $08 $08 $0D $0E $1D $1D
chunk 1  $ABD3  10 records   types $1D $1D $08 $08 $0D $0E $1D $1D $08 $08
chunk 2  $ABE8   4 records   ALL inline-5, all type $14 ($CA5E):
   $ABE8 trig $40  $64=$80 $65=$01 $66=$14 $67=$80   -> 1 arm,  shape 0
   $ABED trig $80  $64=$80 $65=$12 $66=$14 $67=$40   -> 2 arms, shapes 1 then 0
   $ABF2 trig $C0  $64=$80 $65=$02 $66=$14 $67=$80   -> 1 arm,  shape 1
   $ABF7 trig $F0  $64=$80 $65=$21 $66=$14 $67=$60   -> 2 arms, shapes 0 then 1
chunks 3,4,5,6    ALL point at $ABE8 -- the same four records replayed
```

28 distinct records = 24 four-byte + 4 inline-5, which reproduces
`stageledger.py`'s `stage 4: 28 distinct, 8 ported, 16 unported, 4 inline5`
exactly. **The stage splits cleanly in two:** scroll `$0000`-`$03FF` has *no
arms at all* (24 records, needing only `$B559` + W30's `$B402`/`$B434`), and
scroll `$0400`-`$0DFF` is the arm section. `stageledger.py` reports stage 5's
first unported record at **scroll `$0000` (`$ABB6`)** - a `$B559`, not an arm.

`$C653`, the late spawner, adds arms independently every `$28` frames from
`$C67A` (12 bytes, index `$69 & $06`, so 4 live rows): `(02,80)` 1 arm shape 1,
`(00,40)` **0 arms**, `(01,80)` 1 arm shape 0, `(00,C0)` **0 arms**. Rows at
offsets 8 and 10 (`12 40`, `28 0A`) are unreachable through `AND #$06`.

**Inline-5 records exist in exactly two stages.** Decoding all seven live chunk
ranges out of `assets/prg.bin` this session: stage 3 has 45, stage 5 has 4,
every other stage has 0 (92 / 93 / 78 / 98 / 28 / 98 / 111 distinct records,
matching `stageledger.py` line for line). So `$A466`'s `$19 != 2 → $A4A6` arm
is, in practice, stage 5's alone.

---

## 5. HIDDEN COUPLING - WHAT COULD BREAK WHAT ALREADY PASSES

I looked for coupling in four ways: every reader of `$5C`; every xref of every
routine in §3; every shared subroutine the substrate calls; and every RAM range
it writes. Results:

**LOW RISK - shared code the substrate only calls, all already ported:**
`$A527` (slot clear), `$CB28`/`$CB2B` (score + explosion conversion - and
`$CB28` is a *fall-through* into `$CB2B`, already documented at
`src/enemies.js:2466`), `$C0B7`/`$C0BD` (shot free), `$AEF8`, `$8453`, `$844B`,
`$AEE1`, `$BCB1` (itself a documented fall-through into `$BCB5`), `$EC1E`,
`$8402`, `$B0B4`, `$B628`, `$B251`, `$loc_B502`. Porting W32 calls them; it does
not change them.

**LOW RISK - `$5C` on stages 1-4.** `$965A STA $5C` runs on *every* mode-5
frame before `$9663`, and `$9683` is the only other writer and is behind
`$19 == 4`. So `$5C` is provably 0 on every other stage and the two new
branches (`$9A5E`, `$C04B`) are no-ops there. Replacing the two throws with the
real branches cannot regress stages 1-4.

**MEDIUM RISK - the OAM budget.** `$8BD9` is *not* a subroutine: `$8B91 BEQ
$8BD9` jumps into it and `$8BF0 BMI $8B93` falls back into the shared sprite
tail. It consumes the shared OAM cursor `$9C` and the remaining-sprite counter
`$9F`, up to 6 sprites per group × 4 groups = 24 sprites. Stage-5 only, but it
sits inside a routine stage 1 depends on, so an edit there is an edit to shipped
code. **Read `$8B47`-`$8BC2` before touching `src/oam.js`.**

**MEDIUM RISK - `$BF49`'s hard-coded slot 0.** On the frame an arm is
destroyed the explosion is written into **enemy slot 0 unconditionally**
(`$BF5D LDX #$00`, `$BF6D LDX #$00`), clobbering whatever occupies it. That is
the cartridge's behaviour and the port must reproduce it, not "fix" it. Note
also `$BF4C LDX #$00 / $BF4E LDA #$00` are dead (overwritten two instructions
later by `$BF52 LDX $0600,Y`) - a transcription trap that reads like a slot-0
default and is not one.

**NOT COUPLED (ruled out by reading):** the terrain map (`$C3D3` and the
`$C32F` VRAM patch are both unreachable on `$19 == 4`); the `$0700` VRAM queue
(the substrate writes no packets); the `$0500` page; `$0600`'s two generic
clears; `$06C0`-`$06FF` (the queue's tail, written by `$88E5`, `$9818`,
`$B569` and `$CEF8`, none of them stage-5).

---

## 6. THE ROM TABLES, AND WHETHER THEY ARE EXPORTED

`python games/gradius/tools/tablecoverage.py`, run this session:

```
TABLES: 66 PRG bases indexed by the 42 $AE1C handlers + $C413; 48 exported ranges (7477 bytes)
OK: every table the handlers index is exported, and every metasprite id the ROM names exists
```

That is a real green, but its ROOT SET is the 42 dispatch entries + `$C413`.
Six of the twelve routines in §3 are **not reachable from that root set**
(`$8BD9`/`$8C06` hang off `$8BAB`; `$BEF3`/`$BF0B` off `$C044`; `$CB8A`/`$CB91`
off `$9A76`/`$9691`; `$9663` off `$80D4[5]`). Re-running the tool's own walker
from those roots (read-only, its own `walk()` and `exported_blocks()`):

| table | size | reader | exported? |
|---|---|---|---|
| `$C67A` stage-5 late-spawner rows | 12 | `$C664`/`$C66D` | **yes** - `enemies/tables.json/approachStage4` |
| `$CA49` / `$CA50` / `$CA57` rank rows for `$CA5E` | 7 each | `$CA60`/`$CA65`/`$CAE9`,`$CB03` | **yes** - `enemies/tables.json/page600Object` (`$CA29`+53) |
| `$8BF2` arm-head tile by angle | 16 | `$8C19` | **NO** |
| `$8C02` arm-head attribute | 4 | `$8C1E` | **NO** |
| `$BEEA` rank → hits to destroy an arm (`02 02 03 04 05 06 07 08 09`) | 9 | `$BF44` | **NO** |
| `$CBCA` rank → arm fire interval (`28 23 1E 19 19 19 19`) | 7 | `$CBAD` | **NO** |
| `$CC1F`-`$CC32` arm shape params (4 rows × 2 + 8 rows × 2) | 20 | `$CC63` `$CC68` `$CC7C` `$CC85` | **NO** |
| `$CD65` segment dX by angle | 32 | `$CD16`/`$CD1C` | **NO** |
| `$CD85` segment dY by angle | 32 | `$CD4B`/`$CD55` | **NO** |

**120 bytes across 7 ranges to export.** Metasprites are already covered: the
owner's `$89` (`$A4F0`) and `$81`-`$84` (`$CA77`), and the arm bullet's `$86`
(`$CBF2`) all come from `LDA #imm` → store into `$0120`-`$013F`, which is
exactly source (b) of `tablecoverage.py`'s metasprite scan, and it reports OK.
`$8C06` draws raw OAM (tile `$F7` + the two tables above) and needs no
metasprite.

**Recommendation for the implementer:** add `$8BD9`, `$BEF3`, `$CB91` and
`$9663` to `tablecoverage.py`'s root set in the same wave. As it stands the tool
would not have caught these seven gaps, and its green is narrower than it reads.

---

## 7. SIZE, MEASURED

Byte spans and instruction counts parsed out of `rip/prg.asm` this session
(instruction = a line with an opcode, `.byte` rows excluded):

```
$9663 half-rate fork       $9663-$96A4    66 bytes  ~ 30 insn
$8BD9 sprite scan          $8BD9-$8BF1    25 bytes  ~ 12 insn
$8C06 draw one group       $8C06-$8C77   114 bytes  ~ 55 insn
$A4A6 allocator            $A4A6-$A526   129 bytes  ~ 60 insn
$BEF3/$BF0B shot-vs-arm    $BEF3-$BF74   130 bytes  ~ 59 insn
$C263 player-vs-arm        $C263-$C2A4    66 bytes  ~ 33 insn
$CB4E free-on-death        $CB4E-$CB89    60 bytes  ~ 27 insn
$CB8A/$CB91 driver         $CB8A-$CBD0    71 bytes  ~ 30 insn
$CBD1 arm fires            $CBD1-$CC18    72 bytes  ~ 32 insn
$CC19/$CC33 kinematics     $CC19-$CD64   332 bytes  ~142 insn
$CA5E owner enemy          $CA5E-$CB25   200 bytes  ~ 85 insn
$C653 late spawner         $C653-$C679    39 bytes  ~ 20 insn
$B559 wrapper              $B559-$B568    16 bytes  ~  6 insn
                          TOTAL         1320 bytes  ~591 insn   + 120 table bytes
```

Calibration, same parser, same session:

```
W30's stage-3 bespoke scope ($C906 $B7A1 $B402 $B434 $B4FD $A46F)
                                          620 bytes  ~249 insn   ("medium-high, the heaviest stage")
W26's boss head + morph ladder $B8EF-$B9EF 257 bytes  ~ 94 insn
```

**W32 as scoped is 2.1× W30 and 5× W26.** That is the number the verdict rests
on; it is not an impression.

---

## 8. VERDICT

**W32 is TRACTABLE. It is NOT one wave. There is NO blocker.**

Nothing in the subsystem is unknowable, undecodable or dependent on data we do
not have: it is 1,320 bytes of ordinary 6502 over a 4×`$30`-byte RAM structure
whose every field I could account for, with 120 bytes of table to export and no
nametable, VRAM, terrain-map or compression involvement anywhere. The plan's
"single biggest risk" framing was right about the size and wrong about the
mechanism - it is not destructible terrain, and the one piece that *was* about
terrain (`$C32F`) turns out not to run on stage 5 at all.

**Recommended split - three sub-waves, ROM-derived, each with its own
first-divergence measurement:**

* **W32a - stage 5's first two chunks (small).** `$B559` (16 bytes, over the
  already-ported `loc_B502`) plus whatever W30 leaves of `$B402`/`$B434`.
  DONE-WHEN: a stage-5 scenario runs from scroll `$0000` and the first throw
  moves from `$ABB6` (scroll `$0000`) to `$ABE8` (scroll `$0480`), TIER-1 0
  divergent. This is one afternoon and it buys a *validated cartridge-aligned
  stage-5 scenario* before the expensive part starts.
* **W32b - the arm substrate (the big one, ~1,040 bytes).** The `$5C` half-rate
  machine (`$9663` + `$9A5E` + `$C04B`), `$A4A6`, `$C653`, `$CA5E`,
  `$CB8A`/`$CB91`, `$CC33`, `$CB4E`, `$8BD9`/`$8C06`, and the 7 table exports.
  Arms spawn, move, draw and die with their owner. DONE-WHEN: the four `$ABE8`
  records place 6 arms across a stage-5 pass, field-exact on `$0600`-`$06BF`
  against the cartridge, **including the two-parity frame split** - the
  comparison must be shown to cover both parities with ≥ 2 arms alive.
* **W32c - the interactions (~285 bytes).** `$CBD1` (arms fire), `$BEF3`/`$BF0B`
  (shot destroys an arm, `$BEEA` rank rows), `$C263` (arm kills the player).
  DONE-WHEN: stage 5 clears to the BigCore death at `$9A3D[4] = $0B`, stage-end
  `$98FD[4] = $0D`, TIER-1 0 divergent, and `stageledger.py` prints
  `stage 4: 28/28`.

If W32b's frame fork proves harder than it reads, it is the only piece that can
grow, and it can be shipped alone.

**Confidence: HIGH on the inventory, MEDIUM-HIGH on the sizing, MEDIUM on the
half-rate fork.**

What would change it:
* **Down to LOW on the fork** if the port's frame harness cannot express "this
  frame skips the `$1B` dispatch and half the engine". I could not settle that
  by reading - it is a property of `src/nmi.js`'s structure and the oracle's
  frame alignment, not of the ROM. **This is the single biggest unknown left.**
* **Down** if a producer exists that puts a shape ≥ 2 into `$0601`. `$CC1F,Y`
  and `$CC21,Y` have four rows; the only producers I found (stage 5's four
  inline-5 records and `$C67A`'s four live rows) yield only shapes 0 and 1, and
  rows 2/3 of `$CC21` (`04 04`) do not look like sane max-angle clamps. **I
  could not find a third producer.** Where I looked: every live wave record in
  all seven stages, all seven `jt_$C439` arms, and both xrefs of `$A4A6`
  (`$A46C`, `$C676`). I did *not* scan for an indirect or computed write to
  `$65`.
* **Up** once a stage-5 scenario exists (W32a) - the fork's behaviour becomes
  measurable rather than argued.

### Open items handed forward

1. **`stagewaves.py` is broken on the inline-5 stride.** It advances 2 bytes
   past a `cmd >= $F0` record: `--stage 5` prints chunk 2 with 10 records and
   non-monotonic triggers ($40, $01, $80, $F0, $14, …) where the ROM has 4, and
   `--stage 3` **crashes** with a `TypeError` at line 182. `wavecensus.py` and
   the CI-wired `stageledger.py` both get it right (28/24/4 for stage 5,
   verified against my own independent decoder this session). Not blocking -
   `stagewaves.py` is not in `test-all.mjs` - but it is a diagnostic that lies.
2. **`tablecoverage.py`'s root set misses six of the twelve routines** (§6).
3. **No reader found for `B+$02`, `B+$06`, `B+$07`.** They are cleared by
   `$A517` and I found no load from them. Stated as "not found", not "unused".
4. **W28's CI ledger is partly done**: `stageledger.py` and `tablecoverage.py`
   are wired into `test-all.mjs`; `wavecensus.py` and `handlerclosure.py` are
   not.

---

status: DONE
