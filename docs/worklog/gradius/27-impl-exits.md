# Wave 27 IMPLEMENTER - the exits (stage-end + warp route)

status: DONE
implementer, 2026-08-03

Scope (from the W27 brief + `20-plan-completeness.md` §3 W27): port the two ways
out of stage 1 -- the SEAMLESS next-stage transition (`$9904` -> `$96CF`) and the
`$39` warp route (`$984F` + `$C686` + the double `INC $19`) -- so the endchain
scenario compares GREEN through the boss death and the transition into stage 2,
and the warp route is validated under a both-sides `$39` poke.

Read the recon FIRST: `26-recon-boss.md` (the death chain -> `$1B $86` -> `$9904`
handoff) and `25b-recon-reaching-script.md` (the reaching method). Everything
below is the implementer's measurement log.

---

## INLINE RECON (read out of rip/prg.asm before any src/ edit)

### $9904 (sub-state $86, stage-end) -- line 2656

```
9904  LDA $19 / CMP #$06 / BNE $990D
990A  JMP $9872                 ; $19 == 6 -> the ending sequence (OUT OF SCOPE)
990D  CMP #$05 / D0 03
9911  JSR $CDA5                 ; $19 == 5 -> stage-6 specific (OUT OF SCOPE)
9914  LDA $B2 / BNE $991D       ; pulse1 OWNER; skip the seed if a sound owns it
9918  LDX #$93 / JSR $839F      ; setBgmCode($93): $1C := $93, sfx $7D then sfx $93
991D  LDA $1C / CMP #$93 / BNE $9926
9923  JSR $994A                 ; $1C == $93 -> run the despawn sweep (already ported)
9926  LDY $19 / LDA $3F / CMP $98FD,Y / BCC $9947   ; cam.hi < endPage -> keep scrolling
992F  LDA $1B / AND #$70 / BNE $9947               ; dying/game-over bits -> skip
9935  LDA #$90 / LDX $39 / BEQ $9945               ; $39 == 0 -> $1B := $90 (next stage)
993B  INC $19 / INC $3A / LDA #$00 / STA $3F / LDA #$8E   ; WARP: $1B := $8E
9945  STA $1B
9947  JMP $9A5E
```

- `$B2` is pulse1's OWNER byte (`$B0 + OFF.OWNER = $B2`); the seed-sound only
  fires when pulse1 is free. `setBgmCode` already de-dupes on `$1C`, so the gate
  is belt-and-braces.
- `$98FD` = `stage.endPage`, 7 bytes `[$0E,$0E,$0E,$0E,$0D,$0C,$0D]`, indexed by
  `$19`. Stage 1 (`$19=0`) ends at cam.hi `$0E`.
- `$39 == 0` -> `$1B := $90` (bit 4 set -> next frame the `$96A5` ladder takes
  the bit-4 arm -> `$96CF`). `$39 != 0` -> warp: `INC $19`, `INC $3A`, `cam.hi := 0`,
  `$1B := $8E` (low nibble $E -> `$984F`).
- The transition is TWO frames: `$9904` sets `$1B := $90` (frame N); `$96CF` runs
  on frame N+1 (the ladder sees bit 4). `INC $19` lands on frame N+1.

### $96CF (the $1B&$10 ladder arm, next-stage) -- line 2302

```
96CF  LDX $1B
96D1  INC $19                   ; stage counter 1 -> 2 (seamless) / 2 -> 3 (warp tail)
96D3  LDA #$00
96D5  STA $39 / STA $3A / STA $3F   ; clear warp flag, warp gate, cam.hi
96DB  LDX #$20
96DD  STA $50,X / DEX / BPL     ; clear $50-$70 (33 bytes)
96E2  LDA #$01 / STA $55        ; build.hi := 1 (streamer page cursor)
96E6  JSR $9BF0                 ; HUD packets + INC $1B + clearAhead (NO stopAllSound)
96E9  JSR $9C3C                 ; startPlay: $60 := 1, $1B := $80
96EC  JMP $9A5E                 ; the mode-5 body runs THIS frame (stage 2 begins)
```

- `$9BF0` (NOT `$9BED`): the packet body without the `JSR $83AB` stop-sound
  prologue. Its `INC $1B` is overwritten by `$9C3C`'s `$1B := $80`; its
  `clearAhead` (`$57 := 0, $5E := $3F`) survives and re-seeds the despawn cursor.
- SEAMLESS: `$9C3C` sets `$60 := 1` (spawn engine loads the next chunk) and
  `$1B := $80`. No `$882C` screen reload, no intro wait. Play continues into
  stage 2 immediately; cam.sub/lo keep their momentum, cam.hi wraps to 0.

### $984F (the warp route, sub-states $8E/$8F) -- line 2551

```
984F  LDA #$01 / STA $2D        ; CHR selector := 1 (CNROM bank 2, the warp palette)
9853  LDX #$3E / LDA #$04 / JSR $8402   ; cam.lo:hi += 4 (the 4 px/frame forced scroll)
985A  LDA $3F / CMP #$11 / BCC $986F    ; cam.hi < $11 -> keep scrolling
9860  LDA $1B / AND #$70 / BNE $986F    ; dying/game-over -> skip
9866  LDA #$50 / JSR $8455              ; score +$5000 ($9A := $50)
986B  LDA #$90 / STA $1B                ; -> $96CF next stage
986F  JMP $9A5E
```

### $C686 (the type-$A6 rain, reached via the late spawner's $3A gate) -- line 8498

```
C686  INC $68 / LDA $68 / LDY $3A / CMP $C684,Y / BCS $C692 / RTS   ; count gate
C692  LDA $3F / CMP #$0E / BCC $C699 / RTS                          ; stop at cam.hi $0E
C699  LDA #$00 / STA $68           ; reset count
C69D  LDX $A8                      ; the slot the late spawner just cleared
C69F  LDA $69 / INC $69 / AND #$0F / TAY    ; Y = ($69++) & $0F
C6A6  LDA $C6CE,Y / STA $032C,X    ; Y position
C6AC  LDA #$01 / STA $0460,X       ; flag (missile-damage arm in $C055)
C6B1  LDY $3A / LDA $C6CA,Y / STA $012C,X   ; anim/metasprite
C6B9  LDA $C6CC,Y / STA $030C,X    ; type ($A6 for $3A=1)
C6BF  LDA #$80 / STA $010C,X       ; status
C6C4  LDA #$F0 / STA $036C,X       ; X position
C6C9  RTS
```

- `$3A = 1` after the warp (one `INC $3A` at `$993D`): anim `$C6CA[1] = $00`,
  type `$C6CC[1] = $A6`. The rain is type `$A6` (dispatch entry 38 -> `$B61E`).

### $B61E (the type-$A6 handler) -- line 6108

```
B61E  LDY #$00 / JSR $B628        ; the animator (INC $014C, step $016C/$012C)
B623  LDA #$FE / JMP $B103        ; = JSR $B164 (X -= 2) / JMP $B251 (despawn)
```

Tables: `$B650/$B651/$B652` (animator params for Y=0), `$C684` (count threshold).

FALL-THROUGH check: `$9904` ends `JMP $9A5E` (no drop into the despawn sweep body
at `$994A`; that is a `JSR`). `$96CF` ends `JMP $9A5E`. `$984F` ends `JMP $9A5E`.
No accidental drop-into-next-routine in any of the three.

---

## 1. WHAT WAS PORTED

`games/gradius/src/nmi.js`:
- **`st9904`** (sub-state $86, stage-end): the despawn seed `setBgmCode($93)`
  (gated on pulse1 OWNER `$B2`), the despawn sweep (`sub994A` while `$1C == $93`),
  the `stage.endPage` threshold, and the `$39` fork -- `$1B := $90` (seamless) or
  `INC $19 / INC $3A / $3F := 0 / $1B := $8E` (warp).
- **`nextStage`** (`$96CF`): `INC $19`, clear `$39/$3A/$3F`, the `$50-$70` wipe
  (`clearStageAdvanceZp`), `$55 := 1`, `sub9BF0` (packets), `startPlay` (`$60 := 1,
  $1B := $80`), then the mode-5 body THIS frame. SEAMLESS.
- **`st984F`** (sub-states $8E/$8F, warp): `$2D := 1` (CHR bank 2), `addCamera16(4)`
  (the 4 px/frame forced scroll), and at cam.hi `$11`: score +$5000, `$1B := $90`.

`games/gradius/src/flow.js`: **`sub9BF0`** factored out of `introPackets` -- the
`$9BF0` packet body without `$9BED`'s stop-sound prologue, shared by intro state 1
and `$96CF`.

`games/gradius/src/camera.js`: **`addCamera16`** -- `$8402`, the 16-bit add into
`$3E:$3F` (the warp's 4 px/frame uses it directly).

`games/gradius/src/enemies.js`:
- **`spawnEngine`/`runEngine` now index the wave tables on the LIVE `$19`**
  (`$A2D1 LDA $19`), not `res.stage.stage`, so the transition frame's wave cursor
  is field-exact. A stage-2 guard in `runEngine` throws at the first stage-2 wave
  record.
- **`st_C686`** (the warp rain): the `$68`-throttled type-$A6 spawner.
- **`h_B61E`** + **`sub_B628`** (entry 38, type $A6): the rain handler -- the
  `$B650/$B651/$B652` animator (8 frames at metasprites `$8E..$95`, step 6) + the
  shared `$B103` 2-px drift + despawn.
- **`lateSpawner`'s `$3A` gate** now routes to `st_C686` (was a throw).

`games/gradius/src/state.js`: **`spawn.z68`** -- the warp-rain throttle counter.

## 2. THE DONE-WHEN -- MET (both)

### Done-when 1: the seamless transition (the endchain run)

MEASURED on the endchain scenario (re-recorded to 12000 frames in W26):

- **`$19` flips on the cartridge's frame.** Both sides: `$19 = $00` at f11525,
  `$19 = $01` at f11526 (the `$96CF` frame). `$1B`: `$86` -> `$90` (f11525) ->
  `$80` (f11526). MATCH on all three frames.
- **The endchain compares GREEN through the transition.** 5366 of 5366 frames
  compared, **TIER 1 800 fields, 0 divergent**, display list 0 mismatches.
- **It throws at the first stage-2 content.** The throw fires at **`$A2F0 @ f11527`**
  -- the first stage-2 WAVE record (`runEngine` with `$19 = 1`). The throw is loud
  and named; 0 divergent fields before it. Stage 2 itself is out of scope (the port
  loads one stage).

The boundary moved from `$9904 @ f11013` (W26's truncation) to `$A2F0 @ f11527`
(W27's stage-2 wave content). The transition's `$96CF` frame (f11526) is
GREEN-compared; the throw is the frame AFTER.

### Done-when 2: the `$39` warp route (the poke)

The endchain is a TIMEOUT kill, so `$39` stays 0 (the warp arm `$B978` does not
fire on a timeout). The route is therefore validated under an identical `$39`
poke on BOTH sides (labelled per knowledge/09), not by a natural four-hatch kill:

- A new **`warp`** scenario: the endchain's reaching script + power-up poke, PLUS
  `0039=1@11013-11999` (forces `$9904`'s warp fork at f11525). Recorded fresh on
  Mesen (scen.py) and compared.
- **GREEN: 5839 of 5839 frames compared, TIER 1 0 divergent.** The warp's 4 px/frame
  scroll, the CHR-bank switch, the type-$A6 rain (cadence + position + animator +
  drift) are all field-exact against the cartridge up to the 12000-frame dump end.
  (The warp does not complete inside the dump -- cam.hi reaches only ~`$07` of the
  `$11` needed for the +$5000 and the stage-3 entry -- so there is no stage-3
  throw to mark.)

This validates the warp CODE (`$984F`/`$C686`/`$B61E`), not the route's natural
reachability (which needs a damage kill the corpus cannot reproduce).

## 3. THE `$030B` ALIAS TRAP (caught)

`$C6AC STA $0460,X` uses the RAW enemy index (`X = $A8 = 0..9`), NOT the `+$0C`
slot alias the rain's OTHER fields use (`$030C/$032C/$036C/$010C/$012C` are all
`base + $0C + X`, i.e. slot `X + 12`). So the rain's `$0460` lives at `$0460+index`
(slot 0..9), while its type/anim/etc. live at slot `index + 12`. The first warp
run wrote `s0460[index + ENEMY_BASE]` and showed **6 divergent fields**
(`$0467-$0475`) at the first rain spawn; corrected to `s0460[index]` -> 0
divergent. This is exactly the W26 `$030B,X`-style trap the recon warned of, and
the BOTH-SIDES poke caught it (the unit tests did not -- `$0460` is a compared
field, not a unit-test assertion).

## 4. RED MUTATIONS (RULE 4)

1. **Break `INC $19` in `nextStage`** (`+1` -> `+0`): the endchain goes **RED --
   190 divergent TIER-1 fields** at f11528 (the transition frame). `$19` never
   advances, the port replays stage-1 wave data for stage 2, and the throw at
   `$A2F0` does not fire. Restored; 0 divergent.
2. **The `$0460` alias** (§3): 6 divergent fields before the fix; 0 after. This is
   the warp's own RED, caught by the both-sides poke.

## 5. REGRESSION

- `node --test games/gradius/tests/`: **475 tests, 0 fail, 0 skip** (468 + 7 new
  W27 tests in `w27-exits.test.js`).
- `node games/gradius/tools/test-all.mjs`: **GREEN, 10 passed, 0 failed, 0 SKIPPED**.
- The full corpus (compare.mjs over all scenarios including the new `warp`): GREEN.

## 6. THE NEW SCENARIO + HARNESS BITS

- `scenarios.json`: endchain `compareUntilThrow` `9904` -> `A2F0`; new `warp`
  scenario (the `$39` poke, no compareUntilThrow). endchain `_` updated for W27.
- `compare.mjs`: `MODELLED_1B` += `$86/$8E/$90`.
- `porttrace.mjs`: `$39` added to `POKEABLE` (the warp flag, both-sides poke).

NOTE: the `warp` scenario's cartridge dump (`out/scen/warp.json`) and the
endchain re-record are ROM-derived and gitignored. The scenario DEFINITIONS (the
poke parameters, align, tail) are not ROM-derived and are committed.
