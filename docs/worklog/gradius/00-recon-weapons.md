# RECON 2 of 5 - player weapons: shots, missiles, power-up meter, Options
status: DONE (with named open questions)
wave: 0   role: recon   started: 2026-07-31

READER role. Nothing under `games/*/src/` was touched. New files, both probes:

* `games/gradius/tools/oracle/weapons.lua` + `weapons.py` - per-game-frame dump
  of the weapon RAM (the flat object arrays + the weapon zero page), with pokes,
  exec counters and per-frame exec samples. Sample point `$80B5`, the one
  `PROBE.md §1` proves.
* `games/gradius/tools/oracle/zpxref.py` - decoded zero-page cross-reference over
  the PRG (`dis6502.py xref` only handles absolute operands).

Nothing was committed.

## The task, as I understood it

`$A0E9-$A234` (firing + the shot/missile movement loops that run while the player
is dead), the weapon tables at `$A0E0/$A0E3/$A0E6`, the slot types
`$0123/$0126/$0129`, the autofire timer `$35`, the missile gate `$41`, the
capsule + selection bar + the `$8989` jump table, Options `$45` and the ring, and
the shield `$46`.

---

## 0. TWO NUMBERS IN `NOTES-player.md` ARE WRONG. Measured, both ways.

`NOTES-player.md §9` says:

> `$44` weapon: **0 normal, 1 double, 2 laser** … Slot B … is **skipped when
> `$44 == 2` (laser)**.

Both halves are backwards.

**`$44`: 0 = normal, 1 = LASER, 2 = DOUBLE.** Proven twice, independently.

1. From the `$8989` jump table (below): meter entry 3 (`DOUBLE` on the bar) is
   the arm that stores **2** into `$44`; entry 4 (`LASER`) stores **1**.
2. From the cartridge, by forcing `$44` and watching the shots
   (`weapons.py --poke 44=N@390-459`, A held from game frame 400):

| `$44` | slot A | slot B | behaviour |
|---|---|---|---|
| 0 | type `$06`, sub 0 | type `$06`, sub 0 | one shot per fire, `x += 7` |
| 1 | type `$07`, sub 1 | type `$07`, sub 1 | one shot per fire, `x += $0C` |
| 2 | type `$06`, sub 0 | type `$24`, sub **2** | **both slots on the same frame**; B goes `x += 4, y -= 4` |

The `$44 == 2` row is the visual signature of DOUBLE (forward shot + 45°-up
shot, fired together). Raw rows, `$44 = 2`, frames 400-403:

```
  f   44 ty                     sub                    x                      y
  400   2  1  0  0  6  0  0 24    0  0  0  0  0  0  2   50 50 50 57  0  0 54   60 60 60 60  0  0 5C
  401   2  1  0  0  6  0  0 24    0  0  0  0  0  0  2   50 50 50 5E  0  0 58   60 60 60 60  0  0 58
  402   2  1  0  0  6  0  0 24    0  0  0  0  0  0  2   50 50 50 65  0  0 5C   60 60 60 60  0  0 54
```

**Slot B is skipped when `$44 != 2`, not when `$44 == 2`.** `$A124: LDA $44 /
CMP #$02 / BEQ $A134` - the branch *into* the slot-B block is taken **on** 2.

`NOTES-player.md §9` also says a 90-frame hold of A produced **3** shot spawns.
Measured with exec hooks on the two spawn routines, 300 frames of held A from
game frame 400:

```
$A235 (slot A) frames = [400, 444, 488, 530, 574, 618, 660]
$A250 (slot B) frames = [421, 465, 509, 551, 595, 639, 681]
interleaved gaps      = [21, 23, 21, 23, 21, 21, 21, 23, 21, 23, 21, 21, 21]
```

Frames 400..489 contain **5** spawns, not 3.

`NOTES-player.md §9`'s missile line ("`+2` or `+8`/`$80` per frame from the table
at `$A1A4`") is a misreading of the table - see §4.

---

## 1. The object array, settled

Everything the weapon code touches is one flat 32-slot object array. The index
is the *object*, and the firing code just uses fixed `+3 / +6 / +9` offsets on
the array bases:

| object | who |
|---|---|
| 0 | player |
| 1, 2 | Options |
| 3, 4, 5 | shot slot **A** for player / Option 1 / Option 2 |
| 6, 7, 8 | shot slot **B** |
| 9, 10, 11 | missiles |

| array | field | seen as |
|---|---|---|
| `$0100+i` | status (player: 1 alive, ≥2 dying) | |
| `$0120+i` | **type / sprite id, 0 == slot free** | `$0123,X` `$0126,X` `$0129,X` |
| `$0160+i` | **subtype** (`$0160` itself is the ring cursor) | `$0163,X` `$0166,X` `$0169,X` |
| `$0320+i` / `$0340+i` | Y / Y-sub | `$0323,X` … |
| `$0360+i` / `$0380+i` | X / X-sub | `$0363,X` … |
| `$03A0+i` | **autofire timer** | `$03A3,X` `$03A6,X` |

## 2. `$A0E9` - the weapon parameter fetch

```
A0E9  LDX $44 / LDA $A0E0,X -> $98   slot-A type
      LDA $A0E6,X -> $99             sfx id
      LDA $A0E3,X -> $9C             slot-B type
A0FA  LDX $18 / LDA $05,X & $80 -> $9A   A, EDGE
      LDA $07,X & $80 -> $9B             A, HELD
A108  LDX $45                        loop X = $45 down to 0 (DEX / BPL $A10A)
```

ROM bytes, read out of the file:

```
A0E0 (slot A type): 06 07 06
A0E3 (slot B type): 06 07 24
A0E6 (sfx id)     : 01 02 01
```

The loop runs **from `$45` down to 0**, so all Options fire on the same frame as
the player. Measured with `$45` forced to 2 - three shots, one per object, on
frame 400, at each object's own X:

```
  f   45 ty                     x                      tm
  400   2  1  4  4  6  6  6      82 77 6C 89 7E 73      0 0 0 14 14 14 14 14 14
```

## 3. Firing, `$A10A-$A16D` - the timer only ticks while the slot is EMPTY

Per object X:

* **slot A** (`$0123,X`): busy → skip entirely (**timer not decremented**).
  Free → fire if A-edge, or if `$03A3,X == 0` and A is held; else `DEC $03A3,X`.
* on a slot-A fire: `$03A3,X = $35`; **if `$44 != 2`** also `$03A6,X = $35` and
  jump past slot B; **if `$44 == 2`** fall into slot B and let it fire too.
* **slot B** (`$0126,X`): identical shape with `$03A6,X`, and on a fire it
  reloads `$03A3,X` too when `$44 != 2` - and then **falls into `DEC $03A6,X`**,
  so the timer reads `$35 - 1` on the spawn frame. Slot A does not do this
  (`$A12F: BNE $A15C` jumps over the `DEC`).

That last asymmetry is visible in the dump - on the slot-B spawn frame 421,
`tm[3] = $14` but `tm[6] = $13`:

```
  420   … tm  0 0 0 14  0  0  0 …      slot B timer hits 0
  421   … tm  0 0 0 14  0  0 13 …      slot B fires; A reloaded to 20, B to 20 then DEC'd
```

**Consequence for the port: the cadence is not 21 frames, it is
`shot lifetime + $35`.** The timer is frozen while the slot is occupied, so a
shot that dies early (hits an enemy, or is fired from further right) brings the
next shot forward. That is why the measured gaps alternate 21/23 and drop to 21
when a shot hits something.

`$35` measured **20** (`$14`) in stage 1 and re-set to `$14` at `$9B60` on every
respawn.

Missiles, `$A15C`: gated on `$41 != 0`, `$0129,X == 0`, and **A HELD** (`$9B`) -
*not* the edge, and **no timer at all**. The rate limit is purely the flight
time of the one live missile per object.

Spawns:

| | writes |
|---|---|
| `$A235` slot A | `$0363,X=$0360,X`, `$0323,X=$0320,X`, `$0123,X=$98`, `$0163,X=$44 & 1` |
| `$A250` slot B | `$0366,X=$0360,X`, `$0326,X=$0320,X`, `$0126,X=$9C`, `$0166,X=$44` |
| `$A26B` missile | `$0369,X=$0360,X`, `$0329,X=$0320,X + 6`, `$0129,X=$0A`, `$0169,X=$03` |

Both shot spawns converge on `$A266: LDA $99 / JMP $EC1E`, so **every shot plays
the sfx**: DOUBLE plays it twice in one frame, and with two Options a DOUBLE
volley calls `$EC1E` six times in one frame. The missile spawn plays nothing.

**The X-sub byte `$0380+i` is not initialised on spawn** for shots (only the
missile uses it, and it inherits whatever the previous missile left).

## 4. Movement - `$A16F` missiles, `$A1E6` shots. Both run while dead.

`$9FFC: LDA $0100 / CMP #$02 / BCC $A006 / JMP $A16F` - with the player at
status ≥ 2 the update jumps straight into these two loops.

**Missile loop `$A173`**, loop index `$A8` = 8 → 6, i.e. objects 11 → 9
(`DEC $A8 / CMP #$06 / BCS`). Per live missile:

* `$19 == 4` → skip the probe, fly.
* else `JSR $C3AF` (terrain probe at the object's position; `$A5 = Y (+3 for
  loop index ≥ 6)`, `$A4 = X`). Returns 0 → fly.
* non-zero → probe again 8 px up and 8 px right (`$A5 -= 8`, `$A4 += 8`,
  `JSR $C3D3`); non-zero → **kill the missile**; zero → crawl.

`$A1A4` is **three 2-entry tables**, not one: `dy = {2, 0}`, `dxhi = {0, 2}`,
`dxlo = {$80, 0}`, selected by `Y` (0 = fly, 1 = crawl). So

* fly: `y += 2`, `x += 0.5`/frame, sprite id `$0A`
* crawl: `y += 0`, `x += 2`/frame, sprite id `$08`

Killed at `y >= $C8`, or `x` carry, or `x >= $F8`.

Measured (`$41` forced to 1, A held, player at Y `$60`): missile spawns at
`x = $50, y = $68` (= player Y + 6, then +2 the same frame) and thereafter
`y += 2` every frame with `$0380+9` alternating `$80 / $00` - exactly the fly
row.

**The crawl path is never taken in stage 1's opening.** Over 1000 game frames of
held A with `$41 = 1` and the ship driven up and down:

```
exec $A182 (terrain probe call) n=916
exec $A18B (probe returned non-zero) n=0
exec $A19E (crawl selected)          n=0
exec $A1AA (fly selected)            n=916
exec $A26B (missile spawn)           n=22
exec $A1D6 (missile killed)          n=20
```

**Missile fired at the floor is born dead.** With the ship clamped at `Y = $C0`,
the missile spawns at `y = $C6 + 2 = $C8` and the `CMP #$C8 / BCS` kills it on
the spawn frame - the slot is free again next frame, so it silently respawns and
dies every single frame. No sfx, so it is inaudible; but a port that models the
missile as "one per N frames" will diverge here.

**Shot loop `$A1E6`**, index X = 0..5, i.e. objects 3..8. Arms by `$0163,X`:

| sub | motion | killed when |
|---|---|---|
| 0 | `x += 7` | `x >= $F8` |
| 2 | `y -= 4`, then `x += 4` | `y < $10` (tested first), or `x >= $F8` |
| else (1) | `x += $0C` | carry out of the add, **or `x >= $F0`** |

Note the two different X kill thresholds - `$F8` for subs 0/2, `$F0` for sub 1.
Sub 3 (missiles) never reaches this loop; the loop stops at object 8.

## 5. The power-up meter - `$8974`, and the `$8989` jump table

`$8974` runs once per game frame from `$9A73` (measured: 1036 hits in a
1000-frame gameplay window).

```
8974  LDA $0100 / CMP #$01 / BNE RTS      player must be exactly status 1
897B  LDX $18 / LDA $07,X / AND #$40      B, ***HELD***
8984  LDA $42 / JSR $83E4                 indexed jump, table inline at $8989
```

Table bytes at `$8989`: `83 89 A1 89 AF 89 BB 89 CF 89 D3 89 97 89`

| `$42` | target | bar label | arm |
|---|---|---|---|
| 0 | `$8983` | - | RTS |
| 1 | `$89A1` | SPEED UP | `INC $40`, `$42 = 0`, sfx `$0E`, `JMP $8A30` (cursor redraw). **No cap, no "already owned" test.** |
| 2 | `$89AF` | MISSILE | if `$41 != 0` → RTS **without consuming `$42`**; else `INC $41` |
| 3 | `$89BB` | DOUBLE | if `$44 == 2` → RTS (kept); else `$44 = 2` |
| 4 | `$89CF` | LASER | if `$44 == 1` → RTS (kept); else `$44 = 1` |
| 5 | `$89D3` | OPTION | if `$45 >= 2` → RTS (kept); else `INC $45` |
| 6 | `$8997` | ? (shield) | if `$46 != 0` → RTS (kept); else `$46 = 5` |

Arms 2-6 end at `$89DD: LDA #$0E / JSR $EC1E / RTS`; only SPEED UP redraws the
cursor via `$8A30`. All six measured on the cartridge by forcing `$42` and
tapping B one frame later:

```
  f   42  40  41  44  45  46
  404   1   0   0   0   0   0
  405   0   1   0   0   0   0     <- B, $42 = 1  => SPEED UP
  424   2   1   0   0   0   0
  425   0   1   1   0   0   0     <- $42 = 2  => MISSILE
  444   3   1   1   0   0   0
  445   0   1   1   2   0   0     <- $42 = 3  => $44 = 2  (DOUBLE)
  464   4   1   1   2   0   0
  465   0   1   1   1   0   0     <- $42 = 4  => $44 = 1  (LASER)
  484   5   1   1   1   0   0
  485   0   1   1   1   1   0     <- $42 = 5  => OPTION
  504   6   1   1   1   1   0
  505   0   1   1   1   1   5     <- $42 = 6  => SHIELD = 5
```

**B is level-triggered, not edge-triggered.** Forcing `$42 = 1` every frame
while B is held increments `$40` every frame:

```
  f   42  40  07
  401   1   0   0
  402   0   1  64      ($40 = B held)
  403   0   2  64
  …
  419   0  18  64
  420   0  18   0
```

In real play the arm zeroes `$42`, so one capsule is still one power-up - but the
distinction is observable: **holding B while touching a capsule consumes it on
the touch frame.** Measured on a natural pickup (frame 1366) with B held: `$42`
is never seen non-zero at the sample point and `$40` goes 0 → 1 on 1366.

### The capsule, `$894B`

Reached from the player/enemy collision at `$C1AF`, which is the arm for
`$030C,Y & $7F == 1` and `$010C,Y == 6` - **object type `$06` in the `$010C`
array is the power-up capsule**. It does `JSR $C1FD` (kill the object) then
`JSR $894B`:

```
894B  INC $42
      CMP #$07 / BCC $8969          <- 1..6 pass straight through
8953  JSR $CE89                     <- A = ($07E5 + 4*$18) & $0F
      BNE $895C
8958  LDA #$04 / STA $35            <- RAPID FIRE: autofire delay 20 -> 4
895C  CMP #$05 / BNE $8965
8960  LDA #$10 / JSR $8455          <- score bonus
8965  LDA #$01 / STA $42            <- the meter wraps to 1, not 0
8969  JSR $845B                     <- +$0050 to the score
      LDA #$0D / JSR $EC1E
      JMP $8A30
```

A capsule was collected **naturally** (no poke) at game frame 1366 of a scripted
play run; `$894B` and `$C1AF` each fired exactly once and `$42` went 0 → 1.

**The 7th capsule wraps the meter to 1 and pays a bonus that depends on a digit
of the SCORE.** `$CE89` reads `$07E5` (the middle byte of the current player's
3-byte BCD score - `$07E4..$07E6` for P1, `$07E8..$07EA` for P2; the adder at
`$8474` builds its pointer as `$07E4 + 4*$18` and adds 3 BCD bytes) and masks the
low nibble. Measured, and then **proved by intervention**:

```
poke 42=6 just before the natural pickup          -> $8958 ran, $35 became 4, $42 = 1
poke 42=6 AND 07E5=5 just before the same pickup  -> $8958 n=0, $8960 n=1, $35 stayed 20
```

That is a real, reproducible behaviour of the cartridge. I am flagging it as
**semantically surprising** - it reads like a routine that was meant to return
the stage number and reads the score instead - but it is what the ROM does, and
both arms have been made to fire on demand.

### The bar itself

`$89E3` redraws the whole bar (called once, from `$9C1E`, during stage init).
Each label is queued as string id `$15` MISSILE / `$16` DOUBLE / `$17` LASER /
`$18` OPTION / `$1B` ? , replaced by id `$19` (the "owned" form) when the
corresponding variable says you already have it. SPEED UP has no owned form.
`$8A30` is `$89E3`'s tail and also the target of `JMP` from `$8971` and `$89AC`:
it queues string `$1A` and then patches one byte of the just-queued run -
`$0700[$0E - (8 - $42)] = $55` - which is the cursor tile. `$0E` is the VRAM
queue write cursor; `$85E8`/`$85F3` are the string-queue entry points and the
pointer table is at `$864E`.

## 6. Options - `$45`, and the ring

Confirmed unchanged from `NOTES-player.md §7` (ring length 24 at `$0160`,
history at `$07A0`/`$07C0`, Options trail by 11 and 22, ring advances only while
a direction is held). What this recon adds:

* the firing loop `LDX $45 … DEX / BPL` means Option 2 fires first and the
  player last, all on one frame, each from its own `$0360+i`;
* each Option has its **own** pair of timers (`$03A4/$03A5`, `$03A7/$03A8`) but
  they are loaded from the same `$35` on the same frame, so they stay in lock
  step unless one Option's shot dies early;
* `$45` is capped at 2 by the meter arm only (`CMP #$02 / BCS`); nothing else
  bounds it, and `$A108: LDX $45` would happily loop over more slots.

## 7. The shield `$46` - reachable in stage 1 only via the meter

Consumed in the collision routine:

```
C1B8  LDA $030C,Y / BPL $C1CD
C1BD  LDA $46 / BEQ $C1D6        <- no shield -> DEATH
C1C1  DEC $46
C1C3  LDA $010C,Y / BPL $C1D0    <- and destroy the thing you hit ($BE93)
C1C8  LDX $A8 / INC $046C,X
```

Death (`$C1D6`): `$0100 = 2`, `$0160 = 0`, `$0140 = 0`, `$1B = $A0`, `$4C = $78`,
sfx `$F7`.

Proved by intervention - identical script, `$46` forced to 5 for two frames:

```
baseline ($46 = 0)        forced $46 = 5
 $C1BD n=4                 $C1BD n=8
 $C1C1 n=0                 $C1C1 n=5      <- five absorptions
 $C1D6 n=4 (deaths)        $C1D6 n=3
                           $46: 5 -> 4 (f630) -> 3 (f647) -> 2 (f1005)
                                -> 1 (f1016) -> 0 (f1027), death at f1081
```

Five hits absorbed, sixth kills. The player's sprite emitter reads `$46` at
`$8B6B` to draw the force field and sets `$9E = 3` when `$46 == 1` (last-hit
flash).

In stage 1's opening a shield is **not reachable naturally** - it is meter entry
6, i.e. the sixth capsule. One capsule was collected in ~1000 frames of scripted
play. It is reachable by the Konami-code grant at `$9C5E` (`$46 = 5`, `$41 = 1`,
`$40 = 1`, `$45 = 2`), which is out of this recon's scope.

## 8. Death wipes everything except `$35` and `$42`

Measured: `$40=5 $41=1 $44=2 $45=2 $46=1` forced at frame 400; death at 2053;
at frame **2174** all of `$40 $41 $42 $44 $45 $46` go to 0 in one frame and
`$1B` restarts at 1. The single writer, found with a write hook on `$0040-$0046`:

```
$0040..$0046 <- pc $9B44   n=1 each   frame 2174   chain = [$80AD, $8068]
```

`$9B3E: LDX #$5A / LDA #$00 / STA $3D,X / DEX / BPL` - zeroes `$003D-$0097`.
Then `$9B5E: LDA #$14 / STA $35` restores the autofire delay (so **the `$35 = 4`
rapid-fire bonus is lost on death**), and `$9B66: LDA $22,X / STA $42` restores
the meter cursor from a per-player save at `$22`.

## 9. `$19` and `$17`

* `$19` is 0 for the whole of stage 1 (measured over 2600 frames). It is loaded
  from `$26,X` at `$9B70` on stage/respawn init. `$A17C` compares it to 4 to
  bypass the missile terrain probe entirely - **never taken in stage 1**.
* `$9C45` computes `$17 = ($44 != 0) + $45 + ($46 != 0) + ($19 != 0)` - a rank
  derived from how powered-up you are. `$BBE5: LDA $17 / CMP #$03` uses it
  inside `$BBB7` (the routine `$9A67` calls one step before the player update).
  **Collecting power-ups changes enemy behaviour.** That belongs to the enemy
  recon; flagged here because it is a coupling the port must not lose.

## 10. That the probe is not lying

```
run A                230869b2f9bf9e59
run B                230869b2f9bf9e59  [PASS] byte-identical
poke 44=0 (no-op)    230869b2f9bf9e59  [PASS] identical to baseline
poke 44=1 (real)     5a8d103cedad9971  [PASS] differs
```

Two separate Mesen processes agree; the poke channel writing the value the game
already holds changes nothing, and writing a different one changes the trace.
Every intervention in this file was run with at least two values that produced
different outcomes, so none of them is vacuous (`docs/knowledge/03`, trap 4.3).

The `$42` sweep is its own negative control: six different forced values
produced six different variables changing, and the untouched ones stayed put.

## What I could not do, and why

* **`$C3AF` / `$C3D3` are described from the listing, not measured.** The probe
  returned 0 on all 916 calls in stage 1, so the non-zero path - and therefore
  the crawling missile, sprite `$08`, and the `$A199` wall-kill - is **entirely
  unexercised**. Do not port the crawl from my reading without a scenario that
  makes it fire; the honest state is "shape known, constants unverified".
* **`$19 == 4`** never happened. The bypass is unverified.
* **Score `$07E5` as the wrap-bonus condition.** Measured and forced both ways,
  but I cannot explain *why*, and I did not check the on-screen score digits
  against `$07E4..$07E6` with a screenshot.
* **`$046C,X`** (`$C1CA`) never incremented in any run.
* **Two-player (`$18 = 1`)** untouched everywhere.
* No stage past stage 1's opening; no boss; `$5C` was 0 throughout, so the
  `$969A` second call site of `$9FFC` is still unexercised.
