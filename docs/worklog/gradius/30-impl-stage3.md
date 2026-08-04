# Wave 30 IMPLEMENTER -- stage 3 ($19=2) plays start-to-finish

status: IN PROGRESS
implementer, 2026-08-04

Scope (from the brief + `29-plan-whole-game.md` W30): make stage 3 (`$19 = 2`)
play start to finish. The heaviest stage. Five new handler routines + the
inline-5 ROUTE (the stride-change trap) + one wiring fix:

- the inline-5 route `$A37A` loader + `$A466` splitter (cmd >= `$F0` ⇒ 5-byte
  records). STRIDE CHANGE -- a misparse desynchronises the whole remaining
  stream.
- `$A46F` (the moai-spawn arm, `$19==2` ⇒ force `$030C := $96`)
- `$C906` (~180 lines, the moai: nametable-patching destructible, `$0700,Y`
  ring buffer, rank reopen `$C936`)
- `$B7A1` (~187 lines, bespoke mover) + the `$C686` stage-3 wiring fix
- `$B4FD` (entry 28) + the shared pair `$B402`/`$B434` (entries 13/14)

DONE-WHEN: `python games/gradius/tools/stageledger.py` shows stage `$19=2`
complete, and `node games/gradius/tools/test-all.mjs` GREEN with 0 SKIPPED.

---

## LOG

(updated as findings arrive)

### 2026-08-04 -- opened. BASELINE MEASURED before any edit

`python games/gradius/tools/oracle/stageledger.py` (NB the brief's path
`games/gradius/tools/stageledger.py` does not exist; the tool lives under
`tools/oracle/`):

```
stage  distinct  ported   unported  inline5  ported %     first unported
2      78        28       5         45       35.9         scroll $00E0  (@$A9CB)
```

---

## INLINE RECON (read out of rip/prg.asm before any src/ edit)

### 1. THE INLINE-5 STRIDE -- verified against the listing

The stride is **2 bytes normally, 5 when `cmd >= $F0`**. (The plan's wording
"5-byte records vs the 4-byte default" is loose: the 4 is the DESCRIPTOR the
2-byte record's cmd indexes, not the stream stride.)

```
A335  INC $5D
A337  LDY #$00 / STY $9A / STY $9B / LDX #$00
A33F  LDA ($6A),Y      Y=0  -> the TRIGGER byte; $FF ends the stream
A346  INY / LDA ($6A),Y  Y=1 -> the CMD, stashed in $98
A34B  CMP #$F0 / BCS $A37A          <-- THE SPLIT
A34F  LDA #$02 / LDX #$6A / JSR $8402        cursor += 2   (normal)
...
loc_A37A:                              X is STILL 0 from $A33D
A37A  LDY #$00
A37C  LDA ($6A),Y / INY / STA $63,X / INX / CPY #$05 / BCC $A37C
        -> the FIVE bytes land in $63,$64,$65,$66,$67
A386  LDA #$05 / LDX #$6A / JSR $8402        cursor += 5   (inline)
A38D  LDA $64 / SEC / SBC #$70 / STA $64     $64 := cmd - $70  (>= $80)
A394  JMP $A466
```

So an inline-5 record is `[trigger][cmd $F0-$FF][b2][b3][b4]`. `$63` receives
the trigger and is never read again (scratch). `$64` is the cmd MINUS $70.

`$A466` splits on the stage, and it is an EQUALITY test, not a range test:

```
A466  LDA $19 / CMP #$02 / BEQ $A46F / JMP $A4A6
```

so every stage except in-game stage 3 routes to `$A4A6` (the stage-5
terrain-mounted arm, deferred to W32 by the plan). `$A4A6` must stay a LOUD
throw, and it is still reachable from `$C653` (`$C676 JSR $A4A6`, stage 5's
late-spawner arm, also still throwing).

### 2. `$A46F` -- the moai spawner (stage 3 only)

```
A46F  LDX #$09 / loop LDA $030C,X / BEQ $A47A / DEX / BPL   (DEX/BPL: tests slot 0)
A479  RTS                                the spawn is DROPPED on a full table
A47A  LDA #$01 / STA $5D                 an absolute STORE, not the INC at $A335
A47E  STX $A8 / JSR $A527                clearSlot
A483  LDX $A8 / STA $69                  <-- $69 := sub_A527's EXIT A (see below)
A487  $010C,X := $64                     status  = cmd - $70   ($80..$8F)
A48C  $032C,X := $65                     Y position
A491  $03BC,X := $66                     nametable addr HI  (yvel, reused)
A496  $03EC,X := $67                     nametable addr LO  (yvelf, reused)
A49B  $030C,X := $96                     type $96 -> entry 22 -> $C906
A4A0  $036C,X := $F0                     X = $F0 (right edge)
A4A5  RTS
```

`$A483 STA $69` is NOT a typo in the listing: A is whatever `sub_$A527` left,
and `sub_$A527` ends `$A56E LDA #$00 / ... / $A577 RTS` -- see below. The port
must reproduce the VALUE, not guess it.

### 3. `$C906` (entry 22, type $96) -- the moai. Span `$C906`-`$CA28` PLUS the
   continuation `$C77C`-`$C821` and the helper `$C822`-`$C87A`.

READ PAST THE APPARENT END: `$C916 JMP $C77C` has nothing returning to it --
`$C77C` is the DESTROYED continuation and it sits BEFORE `$C906` in the ROM.
`$C77C` ends at `$C821 RTS`. `$C822` (`sub_C822`) is its collision-map helper.

- `$A9` := `$010C,X & $0F` = the moai VARIANT (0..3), from the record's cmd.
- `$046C,X` (`s0460`) is the HIT COUNT; `>= 3` -> destroyed -> `$C77C`.
- otherwise `JSR $AEDD` (drift left 0.5 px/frame, free below X=8), then gates:
  `$5D != 0` -> RTS; `$0E >= 4` (VRAM queue not empty) -> RTS;
  `$04AC,X != 0` -> DEC and RTS.
- `$048C,X` is the OPEN flag. Closed -> `$C95A` proximity test against the
  ship; open -> `$C93D` close.
- both arms land on `loc_$C9BA`, which appends **VRAM QUEUE packets at
  `$0700`** -- `$0700` is the port's `state.vram.q` / `$0E` = `state.vram.cursor`
  (src/vram.js), NOT a new substrate. The recon's "plasma-ring buffer" is the
  ordinary nametable queue.
- the moai's nametable address lives in `$03BC:$03EC` (yvel:yvelf), planted by
  `$A46F` from record bytes 3 and 4.
- rank reopen timer `$C936` = `$50 $4B $46 $41 $3C $28 $1E` (7 rows, `$17`).
- tile table `$CA29`, indexed by `$AA` = `$A9*4` (open) or `$A9*4 + $10` (close).

`$C77C` (destroyed): `INC $5F`; **`$5F >= $0A` -> `$39 := 1`, the WARP** (the
same `$39` W27 already routes); `INC $5D`; `JSR $844F` (+$0300); `JSR $C822`
(patch the `$0500`/`$0600` collision map); build the rubble nametable packets
from the pointer table `$C893`; `LDA #$0C / JSR $CB26` -> sound $0C +
`$CB2B` explodeInPlace (both already ported).

### 4. `$B7A1` (entry 23, type $97) -- span `$B7A1`-`$B8E5`, data at `$B852`
   INSIDE it. Reached by ONE stage-3 wave record and by the `$C686`
   late-spawner arm. Calls `$B690` (ported), `$844F`, `$CB26` (ported), and
   **`$BD2C`** -- an entry INTO the middle of `aimBullet`'s tail.

### 5. `$B402`/`$B434` (entries 13/14) share `loc_$B407`; both tail into
   `loc_$B212` (which is inside `st_$B205` and already transcribed in the
   port's `h_B205` init block). `$B434` also uses `loc_$B1F1`/`loc_$B1FA`.

### 6. `$B4FD` (entry 28) -- `loc_$B502` is the shared body stage 5's `$B559`
   will reuse. Uses `$B628`, `$B251`, `$B2AF`, `$B2D2` -- all ported.

### 7. `$C686` -- already ported (W27, the warp rain). The stage-3 arm is the
   SAME function with `$3A == 0`: `$C684[0] = $28` (throttle), `$C6CA[0] = $3F`
   (anim), `$C6CC[0] = $97` (type -> `$B7A1`). The fix is one `case` label.
