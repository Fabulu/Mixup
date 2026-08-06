# RECON - the NES Gradius power-up system, end to end
status: DONE (with named BLOCKED items in "What I could not do")
wave: 0   role: recon   started: 2026-07-31

READER role. Nothing under `games/*/src/` or any test was touched. Nothing was
committed. New files, all probes:

* `games/gradius/tools/oracle/pow.lua` + `pow.py` - per-game-frame dump of any
  set of the `$0x00+i` object arrays over any slot range, plus a configurable
  zero page, pokes, exec hooks with register + memory samples. `weapons.lua`
  only reaches objects 0-11; **the capsule lives at object 12-21**, the enemy
  half of the pool, which is why a new probe was needed.
* `games/gradius/tools/oracle/reach.py` - 6502 call-graph reachability over the
  PRG. Walks opcodes from an entry point, follows every branch/JMP/JSR and every
  entry of this cartridge's inline `JSR $83E4` jump tables, and reports which
  reachable instruction names a given address. Written to answer one question
  the owner escalated: *can the spawn engine read the rank byte `$17`?*

Sample point is `$80B5` throughout (`PROBE.md` §1). Every poke lands there,
after the dump, so row *N* is pre-poke and row *N+1* is the cartridge's reaction.

## The task, as I understood it

Measure the whole power-up loop against the cartridge so the wave that
implements it starts from measurement: the capsule, the meter `$42`, the apply
path `$8974`/`$8989`, each power-up's byte-level effect, the rank byte `$17`
**and its consumers**, the death interaction, the HUD bar. Every number in
`00-recon-weapons.md`, `00-plan.md` and `NOTES-player.md` treated as a
hypothesis.

---

# CONTRADICTIONS AND NEW FINDINGS - read this section if you read nothing else

1. **`$C1C1` is not the only place the shield is spent.** There are **three**
   `DEC $46` sites: `$C1C1` (player vs enemy body), `$C24E` (player vs the
   `$0136,Y` object array) and `$C293` (the `$19 == 4` `$0600` array). The plan
   names only `$C1C1`. See §7.
2. **The shield does NOT protect against terrain.** `$C2B5`-`$C2C1` calls the
   terrain probe `$C3A3` and, on a hit, `JMP $C1D6` (death) with **no `$46`
   test at all**. See §7.
3. **Every 16th capsule is a different item.** `$AEC8: INC $47 / AND #$0F` -
   when the result is zero the promoted object gets type **7**, not 6. Type 7 is
   **not** a meter capsule: the collision arm falls past `$C18A CMP #$06 / BEQ
   $C1AF` into **`$C18C`, which destroys every enemy on screen** and never calls
   `$894B`. It has its own sprite set. Measured by intervention (§2).
4. **`$17` has 23 readers, not one.** `00-plan.md` names `$BBE5` as "its
   consumer". `reach.py` over the NMI finds 23 reads + 1 write. And **`$BBE5`
   is unreachable in stage 1 loop 1** (`$BBBD: LDA $19 / ORA $1A / BEQ $BBEC`
   skips it when both are 0) - measured `$BBE5` n=0 in every stage-1 run. The
   rank effects that ARE live in stage 1 are `$BCB5` (aiming) and
   `$BD5F`/`$BDB3` (bullet speed). See §8.
5. **SPEED UP's saturation is at `$40 = 14`, and the add is 8-bit and wraps.**
   `speed = min(($40 + 2) & $FF, $10) / 2` px/frame. `$40 = 254` freezes the
   ship at 0 px/frame; `$40 = 255` gives 0.5. Measured for 16 values of `$40`,
   exact. Since SPEED UP has no cap this is reachable, not hypothetical. §6.
6. **The player X clamp is `$F0` = 240**, confirming the correction the brief
   flags; `PROBE.md`'s 220 is stale. Y clamp `[$10, $C0]` = [16,192].
7. **The capsule has no lifetime timer.** It drifts left at exactly 0.5 px/frame
   and is destroyed the frame its X drops below 8. Measured: born X=`$65` at
   frame 1007, destroyed at frame 1194 with X=7 - 187 frames, = (101-7)·2. §1.
8. **The HUD's OPTION owned-form needs `$45 >= 2`, not `$45 >= 1`.** With one
   Option the bar still reads OPTION. `$8A19: CPX #$02 / BCC` (§9).
9. `$89E3` **returns without drawing anything when the player is dead**
   (`$0100 >= 2`). §9.
10. **The bar is redrawn every 8 game frames, not once at stage init.**
    `00-recon-weapons.md` §5 says `$89E3` is "called once, from `$9C1E`, during
    stage init". Measured `$89E3` **n = 96** in a 770-frame window - it is one
    of the four canned HUD packets rotated by `$8898`/`$88AD`. §9.
11. **`$9E` is transient, not state.** It is set inside the sprite emitter and
    consumed in the same frame; it reads 0 at `$80B5` even when it was set on
    645 consecutive frames. Same shape as `PROBE.md` §2's `$9C` trap. §7.

## That the probe is not lying

```
run A                     14580abc81ee075b
run B                     14580abc81ee075b [PASS] byte-identical
poke 44=0 (a no-op)       14580abc81ee075b [PASS] identical to baseline
poke 47=15 (a real one)   8c2ad3d66f3071da [PASS] differs
```

Two separate Mesen processes agree; a poke that writes the value the game
already holds changes nothing, and a poke that writes a different one changes
the trace (`docs/knowledge/03` trap 4.3). Every intervention in this file was
run with at least two values that produced different outcomes: the `$42` sweep
(six values, six different variables moved, the untouched ones stayed put), the
`$47` promotion (15 vs untouched → type 7 vs 6), the `$07E5` bonus (four values,
three outcomes plus a no-poke control), the `$40` speed table (16 values), the
rank comparison (rank 1 vs 4, with the rank-gated branches as the live control),
and the shield (`$46` 0 vs 5).

---

## 1. The capsule

### Where it comes from

`$A579`, called at spawn time from `$A447`, sets `$03AC,X` (the drop flag) from
the low bit of the enemy's parameter byte. `$A44A` overrides it for squadrons:

```
A44A: LDA $65 / CMP #$0B / BEQ skip        class $0B never drops
A450: LDA $6F / CMP #$04 / BCC skip        squadrons smaller than 4 never drop
A456: LDA $49 / STA $03AC,X                squadron id, 2 or 3
```

`$49` alternates: `$A3F5: INC $49 / AND #$01 / ORA #$02` → 2,3,2,3. The squadron
member count is stored at `$0048+$49` (`$A402: STA $0048,Y`), i.e. `$004A` and
`$004B` - two squadrons can be in flight at once.

`$BE93` (destroy an enemy) does the bookkeeping:

```
BEA5: LDA $03AC,Y / BEQ skip           0 -> this enemy drops nothing
BEAA: CMP #$01 / BEQ $BEB5             1 -> always drops
BEAE: TAX / LDA #$00 / DEC $48,X       squadron: one member down
BEB3: BNE $BEB7                        members left -> $03AC = 0, no drop
BEB5: LDA #$01                         LAST member -> $03AC = 1, DROP
BEB7: STA $03AC,Y
```

Then the enemy becomes class **2** (`$030C,Y = 2`), the explosion, with
`$016C,Y` = the explosion-script index and `$042C,Y = 0`.

Class 2's arm is `$AE99`. It steps the explosion script; when the script byte
reads 0 (end of script):

```
AEBC: LDY $03AC,X / BEQ $AEF8          flag clear -> destroy the object
AEC1: LDA #$01 / STA $030C,X           class 1  == "collectable"
      LDY #$07
AEC8: INC $47 / LDA $47 / AND #$0F
      BEQ $AED2                        every 16th -> Y stays 7
      LDY #$06                         otherwise  -> type 6, the meter capsule
AED2: TYA / STA $010C,X / RTS
```

**`$47` is wiped to 0 by the `$3D-$97` death/stage wipe (§10), so the every-16th
counter restarts on every death and every stage.**

### How it moves, and how long it lives

Class 1's arm is `$AEDD` - and it is a **fall-through chain**, the trap this
project has hit nine times. `$AEDD` and `$AEE1` are both jump-table targets and
`$AEE1` falls into `$AEF8`:

```
AEDD: LDA $5B / BNE $AF09              a freeze flag -> do not move
AEE1: LDX $A8
      LDA $038C,X / SEC / SBC #$80 / STA $038C,X    X-sub -= $80
      BCS $AF09                                     no borrow -> done
AEEE: DEC $036C,X                                   borrow -> X -= 1
      LDA $036C,X / CMP #$08 / BCS $AF09
      (falls through)
AEF8: destroy the object                            X < 8 -> gone
```

Measured (`pow.py`, `--slots 17-17`, the capsule's slot, with its Y poked out of
the player's reach so it is never collected):

```
python games/gradius/tools/oracle/pow.py --frames 1260 \
  --script "200:,10:S,190:,300:A,60:UA,500:A" --from 1000 \
  --zp 42,47,5B --arrays 0100,0300,0320,0360,0380 --slots 17-17 \
  --poke "0331=210@1008-1259" --tag life2

  f   42  47  5B  0100  0300  0320  0360  0380
 1000   0   0   0   0   2  2A  68   0     <- still the enemy, class 2
 ...
 1177   0   1   0   6   1  D2  10   0     <- type 6, class 1, X-sub 0/$80 alternating
 1178   0   1   0   6   1  D2   F  80
 ...
 1192   0   1   0   6   1  D2   8  80
 1193   0   1   0   6   1  D2   8   0
 1194   0   1   0   0   0  D2   7  80     <- X hit 7: destroyed
```

* **Y never changes.** The poked `$0331` (capsule Y) read back `210` on every
  one of 250 frames - nothing else writes it. Vertical velocity is exactly 0.
* **X decreases by 1 every 2 frames**, i.e. 0.5 px/frame, for its whole life.
* **No timer.** Born at X = `$65` (101) on frame 1007, destroyed on frame 1194.
  187 frames = (101 − 7) × 2, exactly.
* `$5B` read 0 on every frame of every run. I tried to force the freeze branch
  with `--poke "5B=1@1020-1119"`: **the poke did not stick** - `$5B` read 0 at
  the next sample every time, so something rewrites it inside the frame. The
  `$AEDD` freeze branch is **UNVERIFIED**; see §12.

### What it looks like

The capsule keeps running the generic object animator `$ADE5`, which is *not*
part of the class dispatch - it runs first, then falls through to `$AE14`'s
dispatch. It is gated on the **type** byte:

```
ADE5: LDA $010C,X / BMI $AE14 / BEQ $AE14     type 0 or bit7 -> no animation
ADEC: LDA $014C,X / BNE $AE11                 tick a 6-frame timer
ADF1: LDA #$06 / STA $014C,X
ADF6: LDA $010C,X / ASL / ASL / STA $98       4 bytes of table per TYPE
ADFD: INC $016C,X
AE00: Y = ($016C,X & 3) + $98 ; A = $ADC1,Y
AE0C: BEQ $ADFD                               0 entry -> skip, wrap the cycle
AE0E: STA $012C,X                             sprite id
```

`$ADC1` (4 bytes per type): type 6 = `10 11 12 00`, type 7 = `13 14 15 00`.
**The two pickups are visually distinct.** Measured, slot 17's `$0120+i`:

```
 1007..1012  $28     leftover last frame of the explosion script
 1013..1018  $11
 1019..1024  $12
 1025..1030  $10
 1031..1036  $11     -> 6 game frames per sprite, cycle 10,11,12
```

### The collision arm that picks it up - and the every-16th one that does not

`$C101` is the player-body-vs-enemy loop (`$A8` = 9..0 → objects 12..21,
hitbox `$A0 = playerX + 4`, `$A1 = playerY + 8`). On a hit:

```
C16E: LDA $030C,Y / AND #$7F
      CMP #$27 -> $C13D    (a different item, gated on ($07E5 & 1) == 0)
      CMP #$29 -> $C159    (another item)
      CMP #$03 / BCS $C1B8 (>= 3: the damaging path, shield or death)
      CMP #$01 / BNE skip  (class 1 == collectable)
C183: LDA $010C,Y / BEQ skip
      CMP #$06 / BEQ $C1AF        type 6 -> capsule
C18C: (type 7, or anything else non-zero) JSR $C1FD (kill self)
      LDA #$0B / JSR $EC1E        sfx $0B, NOT the capsule's $0D
      LDY #$09
C196: for Y = 9..0: if $010C,Y >= 0 and $030C,Y has bit7 set and
                    ($030C,Y & $7F) >= 3 -> JSR $BE93   DESTROY IT
C1AF: JSR $C1FD / JSR $894B / JMP $C136     the meter
```

**Measured by intervention.** Same script, `$47` poked to 15 on the frames
before the promotion so the INC lands on 16:

```
python games/gradius/tools/oracle/pow.py --frames 1070 \
  --script "200:,10:S,190:,300:A,60:UA,300:A" --from 1005 \
  --arrays 0100,0300,0360 --slots 12-21 --poke "47=15@1000-1006" \
  --wexec 894B,C1AF,C18C,BE93 --tag t7

  f   42  47   ... $0100 slots 12-21 ...      ... $0300 slots 12-21 ...
 1006   0  15   0 0 0 0 0 0 0 0 0 0           0 0 0 0 0 2 0 88 88 88
 1007   0  16   0 0 0 0 7 0 0 0 0 0           0 0 0 0 0 1 0 88 88 88   <- TYPE 7
 1039   0  16   0 0 0 0 7 0 0 0 0 0           0 0 0 0 0 1 88 88 88  2
 1040   0  16   0 0 0 0 0 0 0 0 0 0           0 0 0 2  2 0  2  2  2  0  <- ALL DEAD
wexec $894B n=0      wexec $C1AF n=0      wexec $C18C n=1
```

Baseline (`$47` untouched) at the same frames gave type **6**, `$C1AF` n=1,
`$894B` n=1, `$42` 0→1, and the other enemies untouched. Two values, two
different outcomes - not vacuous (`docs/knowledge/03` trap 4.3).

Natural pickups, no poke at all, 2700-frame play script
(`"200:,10:S,190:,300:A,60:UA,300:A,60:DA,300:A,60:UA,1200:A"`):

```
  f   17  35  40  41  42  44  45  46  47
 1007   0  20   0   0   0   0   0   0   1     <- capsule promoted
 1040   0  20   0   0   1   0   0   0   1     <- collected, $42 0 -> 1
 1808   0  20   0   0   1   0   0   0   0     <- $47 wiped (respawn)
 2343   0  20   0   0   1   0   0   0   1
 2503   0  20   0   0   2   0   0   0   1     <- second capsule
wexec $AE99 n=1313   $AEBC n=59   $AEC1 n=2   $AEC8 n=2   $C1AF n=2   $894B n=2
```

59 explosion scripts ended; only 2 promoted. The `$03AC` squadron gate is doing
real work.

## 2. The meter - `$894B`

```
894B  INC $42
      LDA $42 / CMP #$07 / BCC $8969      1..6 pass straight through
8953  JSR $CE89                           A = ($07E5 + 4*$18) & $0F
      BNE $895C
8958  LDA #$04 / STA $35                  RAPID FIRE, autofire delay 20 -> 4
895C  CMP #$05 / BNE $8965
8960  LDA #$10 / JSR $8455                score bonus
8965  LDA #$01 / STA $42                  wraps to 1, NOT to 0
8969  JSR $845B                           +$0050 score
      LDA #$0D / JSR $EC1E                sfx $0D
      JMP $8A30                           redraw the bar cursor
```

`$CE89` verified out of the cartridge:

```
CE89: LDA $18 / ASL / ASL / TAY / LDA $07E5,Y / AND #$0F / RTS
```

`$18` is the player index, so P1 reads `$07E5` and P2 `$07E9`. `$07E4..$07E6` is
P1's 3-byte BCD score. **The condition genuinely is a digit of the score.**

Verified on the cartridge FOUR ways, on the same natural pickup (frame 1040),
by poking `$42 = 6` on the frames before it so the INC lands on 7, and poking
`$07E5` to a chosen value:

```
poke                              $8953 $8958 $8960 $8965   result
(none, control)                      0     0     0     0    $42 0->1, $35 = 20
42=6                                 1     0     0     1    $42 6->1, $35 = 20
42=6, 07E5=0                         1     1     0     1    $42 6->1, $35 = 20 -> 4
42=6, 07E5=16 ($10, low nibble 0)    1     1     0     1    $42 6->1, $35 = 20 -> 4
42=6, 07E5=7                         1     0     0     1    $42 6->1, $35 = 20
42=6, 07E5=5                         1     0     1     1    $42 6->1, $35 = 20
```

* `$8953` (`JSR $CE89`) runs only on the 7th, never on the 1st-6th - the
  `CMP #$07 / BCC` gate is real.
* `$8965` runs on the 7th: **the meter wraps to 1, not to 0.** Confirmed.
* `$07E5 = $00` and `$07E5 = $10` both trigger `$35 = 4`; `$07E5 = 7` does not.
  So it is the **low nibble**, and the rapid-fire arm is reachable on demand.
* `$07E5 = 5` triggers the score bonus arm `$8960` instead, and leaves `$35`
  at 20.

Six pokes, four distinct outcomes, including a no-poke control that takes
neither arm. This is the one in the plan flagged as "semantically surprising";
it is surprising and it is exactly what the cartridge does.

## 3. Applying it - `$8974` and the `$8989` table

```
8974  LDA $0100 / CMP #$01 / BNE RTS      player must be EXACTLY status 1
897B  LDX $18 / LDA $07,X / AND #$40      $07 is HELD, not $05 (edge)
8981  BNE $8984 ; else RTS
8984  LDA $42 / JSR $83E4                 inline word table at $8989
```

Table bytes `$8989`: `83 89 A1 89 AF 89 BB 89 CF 89 D3 89 97 89`.

| `$42` | arm | bar label | what it does | when already owned |
|---|---|---|---|---|
| 0 | `$8983` | - | RTS | - |
| 1 | `$89A1` | SPEED UP | `INC $40`, `$42 = 0`, sfx `$0E`, `JMP $8A30` | **no test at all - always applies** |
| 2 | `$89AF` | MISSILE | `INC $41`, `$42 = 0`, sfx `$0E` | `$41 != 0` → RTS, `$42` kept |
| 3 | `$89BB` | DOUBLE | `$44 = 2`, `$42 = 0`, sfx `$0E` | `$44 == 2` → RTS, `$42` kept |
| 4 | `$89CF` | LASER | `$44 = 1` (shares `$89BD`), `$42 = 0`, sfx | `$44 == 1` → RTS, `$42` kept |
| 5 | `$89D3` | OPTION | `INC $45`, `$42 = 0`, sfx | `$45 >= 2` → RTS, `$42` kept |
| 6 | `$8997` | ? / shield | `$46 = 5`, `$42 = 0`, sfx | `$46 != 0` → RTS, `$42` kept |

Note the shared tails: `$89B5` (`$42 = 0`) → `$89DD` (sfx `$0E`, RTS) for arms
2 and 6; `$89C9` → `$89DD` for arms 3, 4, 5. Only SPEED UP redraws the cursor.

**All of it measured in one run**, B held for the whole window, one-frame pokes:

```
python games/gradius/tools/oracle/pow.py --frames 600 --script "200:,10:S,190:,200:B" \
  --from 398 --zp 17,35,40,41,42,44,45,46,07 --changes \
  --poke "41=1@400-400,42=2@402-402,44=2@418-418,42=3@420-420,42=4@440-440,\
44=1@458-458,42=4@460-460,45=2@478-478,42=5@480-480,46=5@498-498,42=6@500-500,\
42=1@520-520,42=1@540-560" \
  --wexec 8974,89A1,89AF,89BB,89CF,89D3,8997,8983,89DD,8A30 --tag arms

  f   17  35  40  41  42  44  45  46  07
  398   0  20   0   0   0   0   0   0   0
  400   0  20   0   0   0   0   0   0  64     <- $07 = $40, B HELD
  401   0  20   0   1   0   0   0   0  64     <- $41 = 1 forced (own MISSILE)
  403   0  20   0   1   2   0   0   0  64     <- $42 = 2 ... and it STAYS 2
  419   1  20   0   1   2   2   0   0  64        for 16 frames of held B
  421   1  20   0   1   3   2   0   0  64     <- $42 = 3, $44 = 2 ... STAYS 3
  441   1  20   0   1   0   1   0   0  64     <- $42 = 4 with $44 = 2: APPLIES, $44 -> 1
  461   1  20   0   1   4   1   0   0  64     <- $42 = 4 with $44 = 1: STAYS 4
  479   3  20   0   1   4   1   2   0  64     <- $45 = 2 forced
  481   3  20   0   1   5   1   2   0  64     <- $42 = 5 with $45 = 2: STAYS 5
  499   4  20   0   1   5   1   2   5  64     <- $46 = 5 forced
  501   4  20   0   1   6   1   2   5  64     <- $42 = 6 with $46 = 5: STAYS 6
  521   4  20   1   1   0   1   2   5  64     <- $42 = 1: SPEED UP applies, $42 -> 0
  541   4  20   2   1   0   1   2   5  64     <- $42 forced to 1 EVERY frame 540-560
  542   4  20   3   1   0   1   2   5  64        and $40 climbs one per frame
  ...
  561   4  20  22   1   0   1   2   5  64        to 22, with no cap and no clamp

wexec $8974 n=290  $8983 n=267  $8997 n=20  $89A1 n=22
      $89AF n=18   $89BB n=20   $89CF n=21  $89D3 n=20  $89DD n=1  $8A30 n=57
```

Every claim in the table above is a row in that dump:

* **the refusals KEEP the capsule** - `$42` held its value for 16-20 consecutive
  frames of held B in all five owned cases (arms 2,3,4,5,6). Confirmed.
* **SPEED UP has no cap and no "already owned" test** - 22 increments in 21
  frames, `$40` reaching 22. Confirmed.
* **B is HELD (level), not EDGE** - one poke of `$42` per frame with B
  continuously held produced one SPEED UP per frame. If B were edge-triggered,
  `$40` would have moved once. Confirmed.
* the six arms fire the six different variables and only those; the five
  untouched variables stay put in each case. That is the sweep's own negative
  control.

### Pickup and apply in the same frame

The order is fixed by the caller and is **pickup first**:

```
9A6A  JSR $9FFC       player + weapon update
9A6D  JSR $ADAB       object loop  (this is where the capsule moves)
9A70  JSR $BFE2       collision -> ... -> $C1AF -> $894B      (INC $42)
9A73  JSR $8974       apply                                    (reads $42)
```

So on the frame you touch a capsule with B already held, `$42` is incremented at
`$9A70` and consumed at `$9A73` - the power-up lands on the touch frame.

**Measured, as a controlled pair on the same capsule.** Identical script except
that the second run also holds B from frame 900:

```
A only  ("...,300:A,60:UA,300:A")     $894B 1  $C1AF 1  $89A1 0  $8A30 97
  f 1039  $42=0 $40=0
  f 1040  $42=1 $40=0     <- the meter moves, nothing is consumed
  f 1048  $42=1 $40=0

A+B     ("...,300:A,60:UA,100:A,200:AB")  $894B 1  $C1AF 1  $89A1 1  $8A30 98
  f 1039  $42=0 $40=0
  f 1040  $42=0 $40=1     <- SPEED UP applied on the TOUCH FRAME
  f 1048  $42=0 $40=1
```

Same capsule, same frame (1040), `$894B` and `$C1AF` once in each - holding B
did not perturb the run at all, it only consumed. **`$42` is never observably
non-zero at `$80B5`.** One extra `$8A30` (97→98) is SPEED UP's cursor redraw.

## 4. Each power-up's byte-level effect

| meter | byte | effect |
|---|---|---|
| SPEED UP | `$40` | ship speed = `min(($40 + 2) & $FF, $10) / 2` px/frame - §6 |
| MISSILE | `$41` | `$A15C` gates the missile spawn on `$41 != 0`; A **HELD**, no timer |
| DOUBLE | `$44 = 2` | slot A type `$06` + slot B type `$24` sub 2, fired the SAME frame |
| LASER | `$44 = 1` | slot A/B type `$07` sub 1, `x += $0C`, killed at `x >= $F0` |
| OPTION | `$45` | 0..2; `$A108: LDX $45 … DEX / BPL` - every Option fires each frame |
| ? | `$46 = 5` | five absorbed hits - §7 |

`$44`: **0 = normal, 1 = LASER, 2 = DOUBLE.** This is the pair
`NOTES-player.md` §9 has backwards. I re-derived it two independent ways here:
the `$8989` table (entry 3 = the bar's DOUBLE, stores 2; entry 4 = LASER, stores
1) and the HUD substitution (`$89FF CPX #$02` for the DOUBLE label, `$8A0C CPX
#$01` for LASER). Both agree with `00-recon-weapons.md`'s cartridge measurement.

MISSILE, DOUBLE, LASER and OPTION were measured on the cartridge in
`00-recon-weapons.md` §§2-4 and §6 and I did not re-run them; nothing I measured
here contradicts them. SPEED UP and the shield are re-measured below because
both had a number I could not confirm from the existing text.

## 6. SPEED UP, measured for 16 values of `$40`

```
A006  LDA $40 / CLC / ADC #$02        ***8-bit, wraps***
      CMP #$10 / BCC $A011 / LDA #$10 saturate at $10
A011  STA $99 / LDA #$00 / STA $98
      LSR $99 / ROR $98               ($99:$98) = A/2, 8.8 fixed point
```

The ship's own clamps are in the same routine: X `CMP #$F0` on the way right and
`CMP #$10` on the way left; Y `CMP #$C0` / `CMP #$10`. **X ∈ [16, 240].**

Measured with 6-frame RIGHT/LEFT alternations so the clamps are never reached,
`$40` forced to a new value every 12 frames, delta computed on the 16-bit
`$0360:$0380` pair:

```
 $40 | +deltas (256 = 1 px) | px/f | model min(($40+2)&$FF,$10)/2
   0 | [256]                | 1.00 | 1.00 OK
   1 | [384]                | 1.50 | 1.50 OK
   2 | [512]                | 2.00 | 2.00 OK
   4 | [768]                | 3.00 | 3.00 OK
   5 | [896]                | 3.50 | 3.50 OK
   6 | [1024]               | 4.00 | 4.00 OK
   7 | [1152]               | 4.50 | 4.50 OK
   8 | [1280]               | 5.00 | 5.00 OK
   9 | [1408]               | 5.50 | 5.50 OK
  10 | [1536]               | 6.00 | 6.00 OK
  11 | [1664]               | 6.50 | 6.50 OK
  12 | [1792]               | 7.00 | 7.00 OK
  13 | [1920]               | 7.50 | 7.50 OK
  14 | [2048]               | 8.00 | 8.00 OK
 254 | []                   | 0.00 | 0.00 ZERO-OK   ship does not move at all
 255 | [128]                | 0.50 | 0.50 OK
```

Sixteen values, sixteen agreements, including the two that only exist because
the add is 8-bit. **The saturation point is `$40 = 14`**, not `$40 = $10`. A
port that clamps `$40` itself, or that uses 16-bit arithmetic here, diverges at
`$40 = 254` - and `$40` is unbounded because the SPEED UP arm has no cap.

## 7. The shield `$46` - three consumers, and terrain is not one of them

```
C1B8  LDA $030C,Y / BPL $C1CD          player vs enemy BODY
C1BD  LDA $46 / BEQ $C1D6                  no shield -> DEATH
C1C1  DEC $46
C1C3  LDA $010C,Y / BPL $C1D0              ...and destroy what you hit ($BE93)
C1C8  LDX $A8 / INC $046C,X

C247  LDA $46 / BNE $C24E                player vs the $0136,Y array
C24B  JMP $C1D6                             no shield -> DEATH
C24E  DEC $46 / LDA #$0A / CLC / ADC $A8 / TAX / JSR $AEF8   destroy it

C28C  LDA $46 / BNE $C293                the $19 == 4 / $0600 array
C290  JMP $C1D6
C293  DEC $46

C2B5  LDA $0100 / CMP #$02 / BCS $C2C4  TERRAIN
C2BC  JSR $C3A3 / BEQ $C2C4
C2C1  JMP $C1D6                           <- NO $46 TEST. Terrain always kills.
```

Re-measured independently here. Identical 2500-frame moving script, `$46` poked
to 5 **once** on frame 400 (not held), against an unpoked baseline:

```
                      $46 = 0        $46 = 5 once
$C1BD  shield test         4              8
$C1C1  DEC $46             0              5     <- five absorptions
$C1D6  death               4              3
$C247  ($0136 array)       0              0     <- NEVER REACHED
$C24E  DEC $46             0              0     <- NEVER REACHED
$C28C  ($19 == 4)          0              0     <- NEVER REACHED
$C293  DEC $46             0              0     <- NEVER REACHED
$C2BC  terrain probe    1549           1746
$C2C1  terrain death       0              0     <- NEVER REACHED
$8B6B  emitter reads $46 2016           2161

$46: 5 (f401) -> 4 (f489) -> 3 (f505) -> 2 (f641) -> 1 (f868) -> 0 (f876)
```

Five absorptions, sixth hit kills - `00-recon-weapons.md` §7 reproduced with a
different script. **`$C24E`, `$C293` and `$C2C1` I could not reach**; they are
read off the cartridge bytes and are unverified behaviourally (§12). A port
implementing only `$C1C1` will under-consume the shield if the `$0136` array is
ever populated, and will over-protect the player against terrain - but I am
naming those as risks from the listing, not as measured facts.

Death itself, `$C1D6`: `$4C = $78`, `$0100 = 2`, `$0160 = 0`, `$0140 = 0`,
`$1B = $A0`, sfx `$F7`; and if `$1B >= $81` on entry, `$60 = 0` first.

### The `$9E` flash flag is transient - do not put it in a state vector

```
8B67  LDA $9D / BNE $8B89
8B6B  LDY $46 / BEQ $8B89            no shield -> nothing
8B6F  LDA $1B / AND #$70 / BNE $8B89 <- suppressed while $1B has those bits
8B75  CPY #$01 / BNE $8B7D
8B79  LDA #$03 / STA $9E             LAST-HIT FLASH
8B7D  LDA $02 / LSR / LSR / AND #$03 / CLC / ADC #$5A / JSR $8AAC
                                     the force-field metasprite, 4-frame cycle
```

Measured three ways:

```
                         $46 drained 5->0   $46 forced 1   no shield
$8B6B  reached                    851             921          851
$8B75  $46 != 0, $1B ok           476             645            0
$8B79  $9E = 3  ($46 == 1)          8             645            0
$8B86  force-field sprite emitted 476             645            0
$9E as read at $80B5              [0]             [0]          [0]
```

`$8B79` fired on **exactly the 8 frames** the natural run spent at `$46 == 1`
(f868-f876). But **`$9E` reads 0 at the `$80B5` sample point in every run**,
including the one where it was set 645 times - `$8B55` clears it earlier in the
same frame and the emitter consumes it before end-of-frame. This is `PROBE.md`
§2's `$9C` trap in a second place: a field that would look constant is the
measurement, not the game. Compare `$9E` at the emitter, or not at all.

## 8. `$17` - the RANK byte. Its own section, because it is the coupling

### The formula, confirmed

```
9C45  LDY #$00
      LDX $44 / BEQ + / INY            ($44 != 0)
      TYA / CLC / ADC $45 / TAY        + $45
      LDA $46 / BEQ + / INY            + ($46 != 0)
      LDA $19 / BEQ + / INY            + ($19 != 0)
9C5B  STY $17
```

Called once per frame from `$9AC4`. Measured 590 executions in a 590-frame
window; and every row of the §3 arm sweep agrees: `$44=2` → 1; `+$45=2` → 3;
`+$46=5` → 4.

**Range.** `$45` is bounded at 2 only by the meter arm, `$19` is 0 in stage 1,
so **`$17 ∈ 0..4` is the whole of what stage 1 can reach**, and 5 is the
absolute maximum anywhere (1 + 2 + 1 + 1). The rank tables have 7-9 entries, so
the design range is 0..6; `$AFFC` reads `LDY $17 / LDA $19 / BEQ / INY`, i.e.
indexes at `$17 + ($19 != 0)`, which is where 6 comes from.

**It is not monotonic - it goes DOWN.** Every input is destroyed by the death
wipe (§10), so dying drops the rank to 0 immediately. Nothing else lowers it;
within a life it only rises.

### Who reads it: 23 sites, not 1

`reach.py --entry 806A --find 17` walks the whole NMI (7015 reachable
instruction bytes, 151 JSR targets) and finds every one:

```
  HIT  $9A0E  LDX $17     HIT  $BA34  LDY $17     HIT  $C09F  LDY $17
  HIT  $9C5B  STY $17     HIT  $BA6E  LDY $17     HIT  $C948  LDY $17
  HIT  $AFFC  LDY $17     HIT  $BAE4  LDY $17     HIT  $C9A6  LDY $17
  HIT  $B48D  LDY $17     HIT  $BBE5  LDA $17     HIT  $CA5E  LDY $17
  HIT  $B4BC  LDY $17     HIT  $BCB8  LDA $17     HIT  $CADF  LDY $17
  HIT  $B4D4  LDY $17     HIT  $BD5F  LDA $17     HIT  $CBAB  LDY $17
  HIT  $B6A2  LDY $17     HIT  $BDB3  LDA $17
  HIT  $B7BB  LDY $17     HIT  $BF42  LDY $17
  HIT  $B82C  LDY $17
```

What each one does, read from the cartridge bytes:

| site | table | what rank changes |
|---|---|---|
| `$9A0E` | `$9A35` = `03 03 04 04 05 05 06 06` | `$4D:$4C`, a 16-bit stage-flow countdown, in the state that also does `INC $5B` / `INC $1B`. **Higher rank = a longer phase.** |
| `$AFFC` | - | indexes at `$17 + ($19!=0)` for an enemy movement arm |
| `$B48D`,`$B4BC` | `$B4E4` | `$04CC,X` for the arm at `$B480` |
| `$B4D4` | `$B4EB` | `$04CC,X`, the other branch |
| `$B6A2` | `$B6D2` | `$04EC,X` **and** `$040C,X` - an enemy's fire-timer reload |
| `$B7BB` | - | `$B747` arm gate |
| `$B82C` | `$B787`, `$B852` | thresholds on `$03BC,X` and `$046C,X` |
| `$BA18`,`$BA6E` | `$B90A` | threshold on `$042C,X` |
| `$BA34` | `$B8F8` | subtracted from `$034C,X` (a speed) |
| `$BAE4` | `$BAFF`, `$BB07` | `$0436,X` / `$0456,X` - bullet parameters |
| `$BBE5` | - | `$17 >= 3` → enemy fire timers count down by 2 instead of 1 |
| `$BCB8` | - | `$17 >= 3` → **enemies aim at a randomised lead** instead of exactly at the player |
| `$BD5F`,`$BDB3` | - | `$17 >= 2` → **enemy bullets +25% speed** |
| `$BF42` | `$BEEA` = `02 02 03 04 05 06 07 08 09` | hit points of a `$0600`-array object |
| `$C09F` | `$BFC5` = `05 05 05 05 06 07 08 09 0A` | **hit points of a class-`$9A` enemy** |
| `$C948`,`$C9A6` | `$C936` | `$04AC,X` - boss hit points |
| `$CA5E` | `$CA49`=`0A 0C 0E 10 12 14 16`, `$CA50`=`14 18 1C 20 24 28 2C` | two parameters of a class arm |
| `$CADF` | `$CA57` = `40 48 50 60 70 80 90` | subtracted from `$034C,X` |
| `$CBAB` | `$CBCA` | threshold on `$0604,X` |

`$BBE5`, the one the plan names, is the **least** reachable of them:

```
BBB7  LDA $5D / BNE $BC19
BBBB  LDY #$01
BBBD  LDA $19 / ORA $1A / BEQ $BBEC    <- stage 1 loop 1: SKIP the whole thing
...
BBE5  LDA $17 / CMP #$03 / BCC $BBEC / INY
BBEC  STY $98                          $98 = how fast fire timers count down
```

Measured, every stage-1 run in this recon: `$BBE5` **n = 0**, `$BBEC`
n = 585…3228. `$19` and `$1A` are both 0 in stage 1's first loop, so the rank
never reaches the fire-rate decision there. It is not dead code - it is
stage-2-and-later code.

### The escalated question: does rank reach ENEMY SPAWNS?

**Static.** `reach.py` from each of the five spawn entry points - the level
script decoder `$A335`, the two "find a free slot and fill it" routines `$A3B1`
and `$A411`/`$A420`, and `$A466` - walks the complete reachable set with **zero
unresolved jumps** and finds **no instruction that names `$17`**:

```
$ python games/gradius/tools/oracle/reach.py --entry A335 --find 17
reachable  : 289 instruction bytes, 4 distinct JSR targets
  NO INSTRUCTION in the reachable set names $17
unresolved : 0
$ ... --entry A411 : 83 bytes, no hit, 0 unresolved
$ ... --entry A420 : 75 bytes, no hit, 0 unresolved
$ ... --entry A466 : 120 bytes, no hit, 0 unresolved
$ ... --entry A3B1 : 67 bytes, no hit, 0 unresolved
```

The tool is not blind: the same walk from `$806A` finds all 23 reads (above),
and the same walk from `$A2C0` looking for `$45` correctly reports nothing.

The wider walk from `$A2C0` (the whole per-frame spawn tick, 1117 bytes) *does*
report one hit, `$BDB3`. That is reached only through `$A2C4`/`$A2FB`
`JMP $C413`, the bail-outs for `$3A != 0` and `$1B == $82`, which leave the
spawn engine entirely for another subsystem. `$BDB3` is the enemy-**bullet**
velocity setter, not an enemy spawner. **That walk also has 13 unresolved
addresses** (data walked as code), so treat the `$A2C0` number as indicative and
the five narrow entries as the result.

**Measured.** Two runs of the identical 3600-frame moving script, rank forced by
poking the *inputs* (`$17` cannot be poked - `$9C45` rewrites it every frame),
both with `$46 = 5` so neither run dies:

* run 1: `$44=0 $45=0 $46=5` → `$17` = 1
* run 2: `$44=2 $45=2 $46=5` → `$17` = 4

Every execution of the spawn writer `$A45B` recorded with its slot and the nine
spawn parameters `$64 $65 $66 $67 $69 $6A $6B $3E $3F`:

```
moving 3600-frame run, ENEMY SPAWN events ($A45B): rank1=92 rank4=92
IDENTICAL = True
```

and the same comparison on a 1800-frame parked script: 57 = 57, identical.

**The check is not vacuous, and here is the proof.** In the same pair of runs,
the rank-gated branches downstream *did* diverge:

```
site                          rank 1   rank 4
$BC44  an enemy fires             38       43
$BC59  bullet slot allocated      20       24
$BCB5  aim entry                  20       24
$BCBE  rank >= 3 aim (lead)        0       24     <-- 
$BCD8  rank <  3 aim (exact)      20        0     <--
$BD5F  bullet X-speed entry        2        4
$BD65  rank >= 2 X boost           0        4     <--
$BDB3  bullet Y-speed entry       18       20
$BDB9  rank >= 2 Y boost           0       20     <--
$BBE5  rank >= 3 fire rate          0        0     (unreachable in stage 1)
$C1D6  player death                 0        0     (neither run died)
```

So: in a run where the cartridge demonstrably behaved differently because of
rank - different aiming, faster bullets, more bullets - **the enemy spawn
sequence was byte-for-byte the same.**

**Conclusion, stated at the strength the evidence supports.** In stage 1, over
92 spawns and 3600 frames, rank did not change *which* enemy spawned, *when*,
*where*, or *how many*; and no instruction reachable from any of the five spawn
routines reads `$17`. What rank changes is **enemy bullets** (speed at `$17>=2`,
aim at `$17>=3`, count via `$B6A2`'s timer reload), **enemy and boss hit
points** (`$C09F`/`$BF42`/`$C948`), several **movement parameters**, and - the
one that is not a per-enemy parameter - **the length of a stage-flow phase**
(`$9A0E`, `$4D` = 3..6 by rank).

What I have **not** ruled out, and what the next person must not read as ruled
out:

* Stages 2-6 and loop 2 were never entered. `$9A0E`'s `$4D` is a stage-flow
  countdown and `$AFFC` indexes at `$17 + ($19 != 0)`, so **rank plainly does
  reach stage-flow timing**, and a longer or shorter phase shifts everything
  after it. That is a spawn-*schedule* effect even though it is not a
  spawn-*decision* effect, and it is only reachable outside my window.
* `$CA5E`, `$C948`, `$C9A6`, `$CBAB`, `$BA18`, `$B48D` and friends never
  executed in any run I drove. Their tables are read out of the ROM, not
  measured.
* Two-player (`$18 = 1`) untouched.

### The shape, for DoDonPachi and anything else with a rank system

* **One byte, recomputed from scratch every frame** - `$9C45` is a pure function
  of `$44`, `$45`, `$46`, `$19`. There is no accumulator and no hysteresis, so
  it cannot drift; get the four inputs right and `$17` is right. That is the
  single best property of this design for a port.
* **It is a function of the player's LOADOUT, not of skill, time, or score.**
  Contrast the usual arcade rank, which integrates over play.
* **It is not monotonic**: death zeroes the loadout and therefore the rank, in
  one frame.
* **Small integer range, 0..6, used as a direct table index** - 19 of the 23
  readers are `LDY $17 / LDA table,Y`. Only 4 are threshold comparisons, and
  there are exactly **three thresholds in the whole game: `>= 2`, `>= 3`**
  (twice at each). So the observable behaviour has few steps even though the
  byte has seven values.
* **The tables are the game design.** Porting rank = porting `$9C45` plus 14
  small byte tables. The tables must be extracted verbatim; interpolating or
  "smoothing" them changes the difficulty curve.
* **It does not feed the spawn engine here.** That is what makes the power-up
  system portable in isolation - a rank error degrades *how* enemies behave, not
  *which* enemies exist, so it produces a bounded divergence instead of a total
  one. Do not assume the same of the next game; the check is cheap
  (`reach.py --entry <spawner> --find <rank byte>`) and it is the difference
  between a small bug and an unusable oracle.
* **Verification consequence for wave 7**: `$17` must be in the watch set, and
  scenarios must deliberately visit `$17` = 0, 2 and 3 - the two thresholds.
  Stage 1 reaches 0..4, but only 0..1 is reachable *without pokes* in any
  realistic window (a shield is the sixth capsule). Every scenario that does not
  force the inputs runs at rank 0 or 1 and leaves both thresholds untested while
  looking covered - the same trap as the sub-pixel accumulator.

## 9. The HUD bar

**`$89E3` is not a stage-init routine.** `00-recon-weapons.md` §5 says it is
"called once, from `$9C1E`, during stage init". Measured over a 770-frame
gameplay window it ran **96 times, once every 8 game frames**:

```
python games/gradius/tools/oracle/pow.py --frames 1070 \
  --script "200:,10:S,190:,300:A,60:UA,300:A" --from 300 \
  --exec 89E3,89EB,8A30,8A39,8A48 --execmem 42,0E --tag hud

$89E3 n=96   f=312,320,328,336,344,352,360,368, ...   ($42, $0E) = (0,0)
$8A30 n=97   same frames, plus one extra              ($42, $0E) = (0,$1C)
$8A39 n=5    f=1040 ($42=1, $0E=$0B), then 1042,1050,1058,1066 ($0E=$27)
$8A48 n=5    same
```

The extra `$8A30` is the pickup's own `JMP $8A30` from `$8971` on frame 1040 -
which is why `$0E` reads `$0B` there and `$27` on the periodic redraws.

The 8-frame cadence comes from `$8898` (called from `$9AC7`), the HUD packet
rotation this project already ported in wave 2: bail if `$0E >= 4` (queue busy)
or if `$02` bit 0 is set, then `INC $48` and dispatch `$48 & 3` through the
inline table at `$88AD` = `$88B6, $88F6, `**`$89E3`**`, $892C`. So the power-up
bar is one of four rotating canned packets. **A port that redraws the bar only
on pickup will still look right most of the time and will diverge on the VRAM
queue every 8 frames.**

`$89E3` itself, and its fall-through tail `$8A30`:

```
89E3  LDA $0100 / CMP #$02 / BCC $89EB / RTS    <- dead player: draws NOTHING
89EB  LDA #$0F / JSR $85E8                      queue string $0F (SPEED UP)
      LDA #$15 / LDX $41 / BEQ + / LDA #$19     MISSILE  -> owned form if $41 != 0
      LDA #$16 / LDX $44 / CPX #$02 / BNE + / LDA #$19   DOUBLE -> if $44 == 2
      LDA #$17 / LDX $44 / CPX #$01 / BNE + / LDA #$19   LASER  -> if $44 == 1
      LDA #$18 / LDX $45 / CPX #$02 / BCC + / LDA #$19   OPTION -> if $45 >= 2
      LDA #$1B / LDX $46 / BEQ + / LDA #$19     ?        -> if $46 != 0
8A2D  JSR $863D
      (falls through)
8A30  LDA #$1A / JSR $85E8                      the cursor row
      LDA $42 / BEQ RTS                         $42 == 0 -> NO cursor drawn
      LDA #$08 / SEC / SBC $42 / STA $98
      LDA $0E / SEC / SBC $98 / TAX
      LDA #$55 / STA $0700,X                    patch one queued byte to tile $55
```

Three things a port must not lose:

* `$8A30` is **`$89E3`'s fall-through tail** and also the `JMP` target of
  `$8971` (after a pickup) and `$89AC` (after SPEED UP). It is a continuation,
  not a separate routine. Arms 2-6 do **not** redraw the cursor - they end at
  `$89DD` - so after MISSILE/DOUBLE/LASER/OPTION/SHIELD the bar keeps showing
  the old cursor until something else redraws it.
* SPEED UP has no owned form (there is no `$40` test), so the leftmost label
  never changes.
* **OPTION's owned form needs `$45 >= 2`.** One Option still shows OPTION.

`$0E` is the VRAM-queue write cursor at the moment `$8A30` runs, so the patched
byte is `8 - $42` bytes back from the end of the string just queued. State that
drives the bar: `$41`, `$44`, `$45`, `$46`, `$42`, `$0100`, `$0E`. I did **not**
verify the on-screen result with a framebuffer diff - see §12.

Also measured: `$8A39`/`$8A48` (the cursor patch) ran **only** on the 5 frames
after `$42` became non-zero, and never before - the `LDA $42 / BEQ $8A4B` guard
is real, so with an empty meter no cursor tile is written at all.

## 10. Death, and what survives

`$9B3E` (xrefs `$96C2 $9751 $97EE $982C $98EB`):

```
9B3E  LDX #$5A / LDA #$00
9B42  STA $3D,X / DEX / BPL          zeroes $003D-$0097
9B47  LDX #$7F
9B49  STA $0100,X / $0300,X / $0500,X / $0580,X / $0600,X / $0680,X ...
9B5E  LDA #$14 / STA $35             autofire delay restored to 20
9B62  LDX $18
      LDA $22,X / STA $42            meter cursor      <- per-player save
      LDA $24,X / STA $3F / STA $55  stage script pos
      LDA $26,X / STA $19
      LDA $28,X / STA $1A
9B76  INC $1B
9B85  LDA #$01 / STA $0120           the player's sprite
```

The wipe covers `$3D-$97`, which destroys **`$40 $41 $42 $44 $45 $46`** and also
**`$47`, the every-16th capsule counter** and **`$49`, the squadron alternator**.
`$35` is explicitly restored to `$14` two instructions later, so **the `$35 = 4`
rapid-fire bonus is LOST on death** - it is not "kept", it is overwritten by a
constant. `$42` is then restored from `$22,X`.

The per-player saves are written at `$97AB` (`$22,X`), `$97BB`/`$9732` (`$24,X`),
`$97AF`/`$987D` (`$26,X`), `$97BF` (`$28,X`) and `$9889` (`INC $28,X`) - i.e.
`$22,X` = meter cursor, `$24,X` = stage script position, `$26,X` = `$19`,
`$28,X` = `$1A`. In the natural-pickup run the meter survived a respawn
(`$42` = 1 before and after frame 1808) while `$47` went 1 → 0 in the same
frame, which is the wipe and the restore in one row.

`00-recon-weapons.md` §8 measured the single writer with a write hook
(`$0040..$0046 <- pc $9B44`, chain `$80AD, $8068`). Consistent.

## What I MEASURED - index of commands

| what | command / run tag | key output |
|---|---|---|
| baseline, 900 frames | `pow.py --frames 900 --script "200:,10:S,690:A" --wexec 894B,C1AF,C18C,AEC8,8974,BBE5,BBEC,9C45` | `$8974` 590, `$9C45` 590, `$BBEC` 585, **`$BBE5` 0**, no capsule |
| natural capsules | tag `nat`, 2700 frames | `$C1AF` 2, `$894B` 2, `$AEBC` 59, `$AEC1` 2 |
| capsule object trace | tag `cap`, slots 12-21 | slot 17: class 2→1, type 6, X `$65`, Y `$2A` |
| capsule lifetime | tag `life2`, `--poke 0331=210@1008-1259` | born f1007 X=`$65`, destroyed f1194 X=7 |
| capsule sprite | tag `frz`, `--arrays 0120` | `$28` then `$11 $12 $10` × 6 frames |
| every-16th | tag `t7`, `--poke 47=15@1000-1006` | type **7**, `$C18C` 1, `$C1AF` 0, `$894B` 0, all enemies → class 2 |
| the six arms + refusals | tag `arms` | full table in §3 |
| speed vs `$40` | tag `spd2`, 16 values | 16/16 match `min(($40+2)&$FF,$10)/2` |
| rank vs spawns, parked | tags `r1`,`r4`, 1800 frames | 57 = 57 spawn events, identical |
| rank vs spawns, moving | tags `sp1`,`sp4`, 3600 frames | 92 = 92 spawn events, identical |
| rank-gated branches | tags `mv1`,`mv4` | `$BCBE` 0→24, `$BCD8` 20→0, `$BD65` 0→4, `$BDB9` 0→20 |
| spawn engine reachability | `reach.py --entry A335/A411/A420/A466/A3B1 --find 17` | no hit, 0 unresolved |
| reachability control | `reach.py --entry 806A --find 17` | all 23 reads found |

## What I RULED OUT

* **Rank does not reach the enemy spawn decisions** - not in stage 1, over 92
  spawns in a run that demonstrably diverged elsewhere, and not statically from
  any of the five spawn entry points (0 unresolved jumps). §8.
* **`$42` is not consumed on an "already owned" refusal.** Five separate arms,
  16-20 frames of held B each, `$42` unchanged. It is not a one-frame race and
  it is not a sfx-only difference.
* **B is not edge-triggered.** One SPEED UP per frame under continuous hold.
* **The capsule has no lifetime timer, and no vertical motion.** Both were
  candidates; both are 0.
* **`$9E` is not durable state.** It reads 0 at end-of-frame even on the 645
  frames it was set.
* **`$BBE5` is not the stage-1 rank consumer.** n=0 in every run; `$BCB5` and
  `$BD5F`/`$BDB3` are.
* **`$47`'s every-16th item is not a capsule variant.** It skips `$894B`
  entirely.

## What I could not do, and why

Everything here is "I could not reach it and here is what I tried", **never**
"the cartridge does not do this".

* **`$5B`, the capsule freeze gate (`$AEDD`).** `$5B` read 0 on every frame of
  every run. I tried `--poke "5B=1@1020-1119"`; the value **did not survive to
  the next sample** - something rewrites `$5B` inside the frame, so the poke
  channel at `$80B5` cannot force this branch. `INC $5B` appears at `$9A27` and
  `$99E9` (stage-flow states) and `$A335`; reaching it needs a scenario that
  enters one of those, or a poke at a different hook point. **BLOCKED.**
* **`$C24E` and `$C293`, the other two `DEC $46` sites.** `$C247` needs the
  `$0136,Y` array populated and `$C28C` needs `$19 == 4`; both were 0 in a
  2500-frame moving run with the shield up. Listing-only.
* **Terrain vs the shield.** `$C3A3` was called 640-1746 times per run and
  returned 0 every time - I held DOWN into the clamp at Y=`$C0` for 550 frames
  and stage 1's opening simply has no floor there. `$C2C1` n=0. The claim that
  terrain ignores `$46` is read off `$C2B5`-`$C2C1` and is **UNVERIFIED**.
* **A natural 16th capsule.** I forced `$47 = 15`. `$47` is wiped on every death
  and every stage init, so 16 promotions in one life is a long scenario.
* **The HUD on screen.** The string ids, the substitution conditions and the
  cursor patch are read from `$89E3`/`$8A30` and the redraw cadence is measured,
  but I did not diff a framebuffer, so "string `$19` is the owned form" is an
  inference from the code, not from pixels.
* **`$9A0E`** (the rank-dependent stage-flow countdown `$4D`) never executed.
  Neither did `$CA5E`, `$C948`, `$C9A6`, `$CBAB`, `$BA18`, `$BA34`, `$BA6E`,
  `$B48D`, `$B4BC`, `$B4D4`, `$B6A2`, `$B7BB`, `$B82C`, `$BF42`, `$C09F` or
  `$BAE4`. Their rank tables are ROM bytes I read; the *effect* is unmeasured.
* **`$17` = 5 and 6** are unreachable in stage 1 (they need `$19 != 0`).
  `$17` = 4 needs a shield, i.e. the sixth capsule - forced here, never natural.
* **Stages 2-6, loop 2 (`$1A != 0`), the boss, two-player (`$18 = 1`).**
  Untouched. Note that `$1A != 0` alone changes bullet speed at `$BD42` and
  opens `$BBE5`, so loop 2 is a different game.
* **Why `$CE89` reads the score.** Both arms now fire on demand, but the design
  intent is still unexplained. It reads like a routine meant to return something
  else. Port it literally with a citation.
* **`$C13D`/`$C159`** - the class `$27` and `$29` collision arms, which are two
  more pickup-like items (and `$C13D` has its own `$07E5` bit-0 gate and an
  `INC $20,X`). Out of scope here, never reached, flagged because they sit in
  the same dispatch as the capsule.

## If someone picks this up cold

* Start with the **CONTRADICTIONS** section at the top. Six of the seven items
  there change what a port must do.
* The probes are `pow.py` (state + exec hooks + pokes over any object array) and
  `reach.py` (call-graph reachability). `pow.py --changes` is what makes a
  3600-frame run readable. Every run tag in the table above regenerates.
* The one-line reproduction of the capsule: script
  `"200:,10:S,190:,300:A,60:UA,300:A"` promotes a capsule in slot 17 at game
  frame **1007** and the player collects it at **1040**. Every capsule
  measurement in this file hangs off those two frames; use them.
* **`$17` must be in the wave-7 watch set**, and scenarios must force `$44`,
  `$45`, `$46` to cross `$17 >= 2` and `$17 >= 3`. `$17` cannot be poked (it is
  recomputed every frame at `$9C45`); poke its inputs.
* The fall-through trap bit twice here and both are load-bearing: `$AEDD` →
  `$AEE1` → `$AEF8` is the capsule's whole mover *and* its destructor in one
  chain, and `$8A30` is `$89E3`'s tail, not a routine.
* Nothing ROM-derived was written anywhere; `out/**` is gitignored.
