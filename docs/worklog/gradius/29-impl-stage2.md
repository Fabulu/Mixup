# Wave 29 IMPLEMENTER -- stage 2 ($19=1) plays start-to-finish

status: DONE
implementer, 2026-08-03

Scope (from the brief + `29-plan-whole-game.md` W29): make stage 2 (`$19 = 1`)
play start-to-finish. The smallest delta: `$B37F` (entry 11, the jellyfish) +
`$C546` (the stage-2 late-spawner arm) + the per-stage TERRAIN/wave loading
question (the port "loads one stage"). The boss is FREE (`$B914` @
`$9A3D[1]=$0C`, stage-end `$98FD[1]=$0E`). 9 of stage 2's 10 named types are
already ported (the common vocabulary).

Read FIRST: `28-recon-stages-2-7.md` (the recon), `29-plan-whole-game.md` W29,
`27-impl-exits.md` (the `$96CF` transition that flips `$19` to 1), `26-impl-boss.md`.

---

## INLINE RECON (read out of rip/prg.asm before any src/ edit)

### $B37F (entry 11, types $0B/$8B -- the jellyfish) -- prg.asm line 5700

TRUE span `$B37F`-`$B3C1` (RTS) + a 9-byte anim table at `$B3C2`. The next
externally-callable routine is `st_B3CB` (entry 12) at line 5748. NO fall-through
out of `$B37F`; the internal fall-throughs (`loc_B39D` -> `loc_B3A2` ->
`loc_B3A7`) are real and handled.

```
B37F  BD 0C 03   LDA $030C,X / BMI $B3AA      type bit 7 picks the form
  $0B form (morph-in):
B384  BD CC 04   LDA $04CC,X / BNE $B39D      already-initialised -> transition
B389  FE AC 04   INC $04AC,X                  INC morph counter
B38C  BD AC 04   LDA $04AC,X / LSR / LSR / TAY  Y = counter >> 2
B392  B9 C2 B3   LDA $B3C2,Y / STA $012C,X   anim = table[Y]
B398  C0 08      CPY #$08 / BEQ $B39D        Y==8 -> transition
B39C  RTS                                   else stay ($0B)
loc_B39D: A9 01 / STA $04CC,X                $04CC := 1
loc_B3A2: A9 00 / STA $048C,X                accel := 0
loc_B3A7: JMP $B0B4                          initialised bit ($0B -> $8B)
  $8B form (initialised, BMI taken):
B3AA  A9 67 / STA $012C,X                    anim := $67
B3AF  BD 8C 04   LDA $048C,X / BNE $B3B9     first frame only (accel==0)
B3B4  A5 A8 / JSR $BCB5                      aim THE ENEMY at the ship (A=$A8=j)
B3B9  JSR $BDFA                              move by direction/velocity
B3BC  A9 01 / STA $048C,X                    accel := 1
B3C1  RTS
B3C2: .byte $64 $64 $64 $65 $65 $65 $66 $66 $66   (9 anims, 3 frames each)
```

KEY INSIGHT: `JSR $BCB5` with A=`$A8`=enemy-index j aims the ENEMY ITSELF at the
ship, NOT a bullet. `$BCB5` (`aimBullet`) writes velocity/direction to the slot
`a9 + ENEMY_BASE`; called with `a9 = k+$0A` (bullet slot) by the allocator, but
called with `a9 = j` (the enemy's own slot) here. So the jellyfish picks a
velocity toward the ship on its first initialised frame, then flies straight.

Helpers (all ported): `$B0B4`=setInitialised, `$BCB5`=aimBullet (call with j),
`$BDFA`=the aimed-movement core (needs a new enemy-facing wrapper -- see below).

### $BDFA (the aimed-movement core) -- prg.asm line 7250

`$B37F`'s `JSR $BDFA` enters at `$BDFA` (NOT `$BDD5`), so it runs ONLY the
movement core: read direction `$046C,X`, move X by `$042C:$044C` (sign = bit 1),
free if X outside [2,$FB], move Y by `$03BC:$03EC` (sign = bit 0), free if Y
outside [8,$C3]. `$BE6B JMP $AEF8` frees via the short free. The port's
`moveBullet` (the bullet mover) inlines this core for slot `22+x`; the enemy
needs the same core for slot `j+ENEMY_BASE`, freeing via `freeSlot(state,j)`.

### $C546 (jt_$C439[1], the stage-2 late-spawner arm) -- prg.asm line 8373

TRUE span `$C546`-`$B56C` (RTS) + the (x,y) spawn tables at `$C56D`. Next
routine `st_C58D` (the stream data) at line 8398. NO fall-through out of `$C546`.

```
C546  A5 02 / AND #$07 / BEQ $C54D / RTS     SECOND gate: fire only when $02&7==0
C54D  A2 02 / JSR $C44F                      pattern stepper, X=2 -> stream $C58D
C552  A4 A9 / LDY $A9                        Y = a9 (the nibble*2 position index)
C554  A6 A8 / LDX $A8                        X = the slot the late spawner cleared
C556  B9 6D C5 / STA $036C,X                 X pos = $C56D[Y]
C55C  B9 6E C5 / STA $032C,X                 Y pos = $C56E[Y]  (= $C56D[Y+1]!)
C562  A9 0B / STA $030C,X                    type $0B (jellyfish -> $B37F)
C567  A9 67 / STA $012C,X                    anim $67
C56C  RTS
```

The X/Y tables are OFFSET BY ONE BYTE: `$C56E = $C56D+1`, so Y[pos] = $C56D[pos+1].
`sub_$C44F` (ported W25) returns `{a9, aa}`; only `a9` is used here. The combined
cadence is the late spawner's every-4th AND `$C546`'s every-8th = every 8th frame.

### The per-stage TERRAIN/wave loading question (the open item)

The port "loads one stage": `loadResources(stageIndex=0)` / `headlessResources(0)`
return `res.stage = stages.stages[stageIndex]` -- ONE stage's terrain/bossPage/
endPage/rankCountdown, fixed at boot. The wave engine already indexes the LIVE
`$19` (`loadChunk`/`runEngine` read `state.zp19`), and `nextStage` (`$96CF`)
resets the build cursor AND does `INC $19`. So when the endchain's `$96CF` flips
`$19` to 1, the WAVE data is already correct but the TERRAIN/bossPage/endPage are
still stage 0's -> the comparison would build the wrong nametable and read the
wrong boss/end pages.

The terrain DATA for all 7 stages is already exported
(`assets/terrain/stages.json`, 7 entries, verified). So NO new export is needed;
the fix is to make the runtime READ the live stage. Done by exposing the full
array `res.stages` and reading `res.stages[state.zp19]` at the runtime sites
(nmi.js bossPage/rankCountdown/endPage/streamBlock, flow.js buildBlock,
sound.js bossPage). `res.stage` stays as the initial stage for the unit suite
(tests call `streamBlock(s, res.stage)` with stage 0 and never transition).

### $BBC3 (the fire-countdown ladder) -- prg.asm line 6893

DISCOVERED while planning the stage guards: `enemyBullets`' `$BBC1 BEQ $BBEC`
skips the fire-rate ladder only when `$19|$1A == 0`. Stage 2 (`$19=1`) does NOT
skip -- the ladder runs. The current port THROWS on `res.stage.stage != 0`. For
stage 2 to play GREEN the ladder must be ported (it sets `$98`, the per-frame
countdown subtract; stage 2 with rank>=3 makes `$98=2`, i.e. enemies fire twice
as fast). The ladder is 25 lines and self-contained; ported faithfully here.

---

## THE TERRAIN FALLBACK BUG (found + fixed, the real blocker)

The first endchain run into stage 2 went RED -- 191 TIER-1 failures, 98
nametable bytes, all starting at f11527 (the first normal stage-2 frame; the
old $A2F0 throw had hidden it). Diagnosis by direct cartridge/port value dump:

  f11527 $0703 (queue byte 3, the first block's ATTRIBUTE): cartridge $4C,
  port $10. Same address $27C0, same build cursor (prog/hi/lo all match),
  same queue cursor -- ONLY the tile/attr bytes differed.

Root cause: `emitBlock` keyed the screens/blocks dicts by the RAW stage
(`stage.stage`), but the ROM `$9E38-$9E5A` applies a STAGE GATE before the
screen indexes the layout: stage 0 uses screen as-is; stages > 0 DECREMENT the
screen, and a 0 entry falls back to STAGE 0's tables (the shared empty
starfield that opens every stage). `export_assets.py` ALREADY re-implements
this (`$9E4C` at line 1382) and keys the dicts `"<effStage>:<effScreen>"`, so
stage 2's data CARRIES the fallback screen `"0:0"` and block `"0:51"` -- but
the port read `"1:0"` / `"1:0"` instead. Block `0:51` has attr $4C and tiles
`[0,0,0,0, 0,60,0,0, 0,0,63,0, 59,0,0,0]`; block `1:0` has attr $10 and tiles
`[0,0,0,0, 0,59,0,0, ...]` -- byte-for-byte the divergence measured.

Stage 0 never triggers the gate, which is why ALL of stage 1 (in-game) shipped
field-exact without it. The fix (`emitBlock` computes effStage/effScreen and
keys by them) made the endchain compare GREEN through all 5839 frames (TERRAIN
MAP 0/512, all TIER 1 fields exact). This is a stages-2-7-wide fix, not just
stage 2.

## THE STAGE-2 MEASUREMENT (the done-when)

`stageledger.py`: stage `$19=1` at **93/93 (NONE shipped)** -- the ledger
advanced from 88/93 (first unported $09A0) to 93/93. Stage `$19=6` also
advanced 95 -> 104 (`$B37F` is reused by stage 7).

`node --test`: 486 pass, 0 fail, 0 skip (475 + 11 new W29 tests).

The endchain (re-recorded to traverse stage 2) compares **GREEN** through the
stage-2 content + the stage-2 boss death + the stage-2->stage-3 transition,
throwing at the first stage-3 wave record ($A2F0 runEngine, $19=2).

**MEASURED 2026-08-04**, full gate on HEAD after the terrain.js restore:

```
PASS  port vs cartridge (compare.mjs)
PASS  self-check: the comparison goes red when the port is broken
      -- subset clean at 0 failures, 7 deliberate breaks all red
GREEN -- 11 passed, 0 failed, 0 SKIPPED
```

The self-check line matters as much as the PASS: the comparison that reports
green here is the same one that went red on all seven deliberate breaks
(lead1, seed-x+1, laginject=450, seed-nt+1, seed-pal+1, seed-coll0,
bullet-nosub). A green from a comparison that cannot fail would be worthless.

The same gate then passed inside `publish.mjs`, which refuses on red or any
SKIP, and the site went live as build `20260804010834`.

THE FRAME COUNT WAS ALREADY IN THIS FILE. The terrain-fallback section above
records the endchain going GREEN "through all 5839 frames (TERRAIN MAP 0/512,
all TIER 1 fields exact)" — measured by the wave itself before it died. Three
attempts were spent re-deriving it from a fresh run, each truncating its own
output (`tail -25`, `tail -50`, then a `head -8` inside a backgrounded pipe),
before the existing measurement was noticed twenty lines up in the document
being edited.

So: 5839 frames is the wave's own figure and stands. The 2026-08-04 re-run
confirms the VERDICT is still GREEN on current HEAD; it did not re-capture the
count, and does not need to. To re-derive it:

    node games/gradius/tools/oracle/compare.mjs | grep -A4 '^=== endchain'


