# Gradius: the Vic Viper

**Everything here was measured on the running cartridge, then checked against the PRG
bytes.** The finder is `tools/oracle/playerhook.py` (write hooks + execution-order log);
the statement of what the code does is `tools/oracle/playermodel.py`, a free-running
simulation that is compared against the machine's RAM every frame and has been seen to go
red six different ways.

`Gradius (USA).nes`, SHA-1 `92645fe1…`. 32 KB PRG at `$8000-$FFFF`, no banking.

> The one number in `tools/oracle/PROBE.md` that is **wrong**: it gives the X clamp as
> `[16, 220]`. The ROM clamps at `$F0 = 240` (`$A028: C9 F0`), and the ship has been
> driven there — `X reached : 80..240` in run B of `playermodel.py`. 220 was the furthest
> that particular 160-frame hold got, not a wall. `Y ∈ [16, 192]` is correct.

---

## 1. Where it is

```
$9FFC   sub_9FFC   the whole player update
```

Found by putting a Mesen **write** callback on `$0360`/`$0320` and recording the PC:

```
$ python games/gradius/tools/oracle/playerhook.py --frames 500 \
      --script "200:,10:S,190:,120:R" --watch 0360,0320 --from 400

    addr    PC*   writes frames  /frame   first   last
   $0360 $A296       94     94       1     400    493
   $0360 $A031       94     94       1     400    493
```

`PC` is the instruction *after* the store, so those are `STA $0320,Y` at `$A293` (with
`Y = $40`) and `STA $0360` at `$A02E`. Two writes per frame, one per frame each, for
exactly the 94 frames RIGHT was held.

**Negative controls, all four seen green and one seen red first**
(`playerhook.py --selfcheck`): a range the game never writes (`$0600-$06FF`, itself
measured) reports zero sites; no site appears outside the requested range, which is where
the RAM mirrors at `$0B60/$1360/$1B60` would have shown up; and only two PCs are reported,
where a hook that also fired on *reads* would have reported dozens. The first version of
this check used `$0790-$079F` and **failed with 38 sites** — RESET's RAM-integrity test at
`$8037-$8050` writes the whole `$0700` page.

## 2. The RAM the player lives in

Page `$0300` is four parallel arrays and they are `$20` apart. `$A285` is the proof, not a
guess: the same subroutine services **both** axes, and the axis is chosen by the 6502 `Y`
register — `LDY #$00` for the vertical axis, `LDY #$40` for the horizontal one.

| array | meaning | notes |
|---|---|---|
| `$0320+i` | **Y**, integer pixels | |
| `$0340+i` | **Y**, 1/256 pixel | the sub-pixel accumulator |
| `$0360+i` | **X**, integer pixels | `= $0320 + $40` |
| `$0380+i` | **X**, 1/256 pixel | `= $0340 + $40` |

Slot 0 is the player; slots 1 and 2 are the two Options.

Other per-object arrays touched by this routine:

| addr | meaning | evidence |
|---|---|---|
| `$0100+i` | object status. Player: `1` = alive, `>= 2` = dying/dead | `$9FFC: AD 00 01 / C9 02 / 90 03 / 4C 6F A1` |
| `$0120+i` | sprite/tilt index. Player: `1` level, `2` nose-down, `3` nose-up; Options: `4`/`5` | written at `$A0C0` and `$A0DB` |
| `$0140+i` | animation timer | `INC $0140` at `$A0AD`, `INC $0141,X` at `$A0CD` |
| `$0160` | **position-ring cursor**, 0..23 | `$A092: STA $0160` |
| `$0163+`, `$0166+`, `$0169+` | shot-slot fields (same array, higher slots) | `$A24A`, `$A263`, `$A281` |
| `$07A0-$07B7` | 24-entry ring of past **X** | `$A099: STA $07A0,Y` |
| `$07C0-$07D7` | 24-entry ring of past **Y** | `$A09F: STA $07C0,Y` |

Zero page:

| addr | meaning | evidence |
|---|---|---|
| `$40` | **SPEED level**. Starts 0, `INC $40` per SPEED UP, no upper bound of its own | `$89A1: E6 40`, jump-table entry 1 of `jt_8989` |
| `$41` | missile flag (0/1) | `$89B3: E6 41` |
| `$44` | weapon: **0 normal, 1 LASER, 2 DOUBLE** | `$89BB`/`$89CF`, see below |
| `$45` | **Option count**, capped at 2 | `$89D3: A5 45 / C9 02 / B0 AA / E6 45` |
| `$46` | shield/barrier, set to 5 | `$899D: 85 46` |
| `$35` | autofire delay, measured **20** frames | `$A11F: A5 35` |
| `$18` | current player index, 0 or 1. Measured 0 | `$A01D: A6 18` then `B5 07` |
| `$05`/`$06` | buttons **pressed** (edge), P1/P2 | `$8206: STA $05,X` |
| `$07`/`$08` | buttons **held**, P1/P2 | `$8208: STY $07,X` |
| `$98`,`$99` | 16-bit step, low/high. **Scratch** — reused all over the frame | `$A011`/`$A015` |
| `$9A`,`$9B` | A-edge / A-held, and `$9B` is the tilt code before that | `$A047`, `$A100`, `$A106` |
| `$9C` | second-shot type here; the joypad shift register earlier in the frame | `$A0F8` |

`$9C` being two different things in one frame is the same trap `PROBE.md §2` documents
from the other direction.

## 3. Speed: a 16-bit sub-pixel accumulator, and six instructions decide everything

```
A006: A5 40      LDA $40         ; speed level
A008: 18         CLC
A009: 69 02      ADC #$02        ; 8-bit, and it WRAPS -- see below
A00B: C9 10      CMP #$10
A00D: 90 02      BCC $A011
A00F: A9 10      LDA #$10        ; ceiling
A011: 85 99      STA $99
A013: A9 00      LDA #$00
A015: 85 98      STA $98         ; $99:$98 = raw * 256
A017: 46 99      LSR $99
A019: 66 98      ROR $98         ; $99:$98 = raw * 128
A01B: A0 40      LDY #$40
```
bytes: `$9FFC: AD 00 01 C9 02 90 03 4C 6F A1 A5 40 18 69 02 C9` / `$A00C: 10 90 02 A9 10 85 99 A9 00 85 98 46 99 66 98 A0`

**`step = min(($40 + 2) & $FF, $10) × 128` in units of 1/256 px per frame**, i.e.
`min($40+2,16) / 2` pixels per frame. It is applied to the 16-bit pair
`($0360:$0380)` / `($0320:$0340)`.

Measured over 17 speed levels by forcing `$40` and reading the 16-bit delta:

| `$40` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 13 | 14 | 15 | 16 | 20 | 64 | 255 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| px/frame | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 5.0 | 6.0 | 7.0 | 7.5 | **8.0** | 8.0 | 8.0 | 8.0 | 8.0 | **0.5** |

Every one of those matched the formula exactly. Two things fall out that a listing alone
would not settle:

* **Speed saturates at 8.0 px/frame at `$40 = 14`.** `INC $40` has no cap of its own; the
  cap is `CMP #$10` on the biased value.
* **`ADC #$02` is 8-bit and wraps.** At `$40 = 255` the raw value is `1`, not `257`, so it
  slips *under* the ceiling and the ship moves at **half** speed. Measured: 128/frame.
  That is the exact 8-bit semantics the port has to keep.

**This is why the recon saw "0 or 1 px per frame, never 2".** At `$40 = 0` the step is
exactly `$0100` = 1.00 px, so the sub-pixel byte never changes and the motion looks
integral. It is not; it just happens to land on 1.0.

## 4. X, and it is not symmetric with Y

```
A01D: A6 18      LDX $18
A01F: B5 07      LDA $07,X
A021: 29 01      AND #$01        ; RIGHT
A023: F0 0C      BEQ $A031
A025: 20 85 A2   JSR $A285       ; 16-bit ADD, returns the new integer byte in A
A028: C9 F0      CMP #$F0
A02A: 90 02      BCC $A02E
A02C: A9 F0      LDA #$F0
A02E: 8D 60 03   STA $0360
A031: B5 07      LDA $07,X       ; <-- NOT an else
A033: 29 02      AND #$02        ; LEFT
A035: F0 0C      BEQ $A043
A037: 20 97 A2   JSR $A297       ; 16-bit SUBTRACT
A03A: C9 10      CMP #$10
A03C: B0 02      BCS $A040
A03E: A9 10      LDA #$10
A040: 8D 60 03   STA $0360
```
bytes: `$A01C: 40 A6 18 B5 07 29 01 F0 0C 20 85 A2 C9 F0 90 02` / `$A02C: A9 F0 8D 60 03 B5 07 29 02 F0 0C 20 97 A2 C9 10` / `$A03C: B0 02 A9 10 8D 60 03 …`

```
sub_A285 (add)                        sub_A297 (subtract)
A285: A5 98      LDA $98              A297: B9 40 03   LDA $0340,Y
A287: 18         CLC                  A29A: 38         SEC
A288: 79 40 03   ADC $0340,Y          A29B: E5 98      SBC $98
A28B: 99 40 03   STA $0340,Y          A29D: 99 40 03   STA $0340,Y
A28E: A5 99      LDA $99              A2A0: B9 20 03   LDA $0320,Y
A290: 79 20 03   ADC $0320,Y          A2A3: E5 99      SBC $99
A293: 99 20 03   STA $0320,Y          A2A5: 99 20 03   STA $0320,Y
A296: 60         RTS                  A2A8: 60         RTS
```
bytes `$A285`: `A5 98 18 79 40 03 99 40 03 A5 99 79 20 03 99 20 03 60 B9 40 03 38 E5 98 99 40 03 B9 20 03 E5 99`

Notes the port must keep:

* **Clamp constants are `$F0` (240) and `$10` (16), from the bytes `C9 F0` and `C9 10`.**
* **LEFT is tested unconditionally after RIGHT** — `$A031` is a fall-through target, not an
  `else`. Holding L+R therefore runs *both*: add step, clamp, subtract step, clamp. Away
  from the walls the net displacement is zero (measured — `$3` is one of the direction
  combinations `playermodel.py` run A exercises and the model reproduces it).
* **There is no pre-check on X.** At the right wall the integer is re-clamped to `$F0`
  every frame while `$0380` keeps accumulating, so the sub-pixel byte is *not* frozen. The
  Y axis behaves differently (below), and the difference is observable.
* The subroutine writes the *unclamped* byte to `$0360` first; `$A02E`/`$A040` then
  overwrite it with the clamped one. Both writes are real and both show up in the hook.

## 5. Y, which has a pre-check and a priority

```
A043: A9 01      LDA #$01
A045: A0 00      LDY #$00        ; the Y-axis arrays: index 0
A047: 85 9B      STA $9B         ; tilt = 1 (level) unless something changes it
A049: B5 07      LDA $07,X
A04B: 29 04      AND #$04        ; DOWN
A04D: F0 14      BEQ $A063
A04F: AD 20 03   LDA $0320
A052: C9 C0      CMP #$C0
A054: B0 0D      BCS $A063       ; already at the floor -> fall through to the UP test
A056: 20 85 A2   JSR $A285
A059: C9 C0      CMP #$C0
A05B: 90 02      BCC $A05F
A05D: A9 C0      LDA #$C0
A05F: A0 02      LDY #$02        ; tilt = 2
A061: D0 18      BNE $A07B
A063: B5 07      LDA $07,X
A065: 29 08      AND #$08        ; UP
A067: F0 17      BEQ $A080
A069: AD 20 03   LDA $0320
A06C: C9 10      CMP #$10
A06E: 90 10      BCC $A080       ; STRICTLY above the ceiling -> no move at all
A070: 20 97 A2   JSR $A297
A073: C9 10      CMP #$10
A075: B0 02      BCS $A079
A077: A9 10      LDA #$10
A079: A0 03      LDY #$03        ; tilt = 3
A07B: 84 9B      STY $9B
A07D: 8D 20 03   STA $0320
```
bytes: `$A03C: … A9 01 A0 00 85 9B B5 07 29` / `$A04C: 04 F0 14 AD 20 03 C9 C0 B0 0D 20 85 A2 C9 C0 90` / `$A05C: 02 A9 C0 A0 02 D0 18 B5 07 29 08 F0 17 AD 20 03` / `$A06C: C9 10 90 10 20 97 A2 C9 10 B0 02 A9 10 A0 03 84` / `$A07C: 9B 8D 20 03 …`

* **DOWN wins over UP** when both are held — but only because DOWN is tested first. If
  DOWN is held *and* the ship is already at `Y >= $C0`, `$A054` falls through into the UP
  test and **UP is honoured**. That is not the same as "DOWN has priority", and the model
  variant `no-down-priority` was seen to diverge on frame 535 of run B because of it.
* **The pre-checks matter, not just the clamps.** At the floor (`Y == $C0`) DOWN writes
  *nothing at all* — not the integer, not the sub-pixel byte, not even the tilt code, so
  `$9B` stays 1 and the ship straightens up. The model variant `no-y-precheck` (clamp
  after the add, as X does) went red on `animId` and on the ring cursor.
* The pre-checks are asymmetric: DOWN is `>= $C0` (blocks *at* the wall), UP is `< $10`
  (blocks only *below* it, so UP still runs and still moves the sub-pixel byte while the
  ship sits on `Y == $10`).
* Clamp constants `$C0` (192) and `$10` (16), from `C9 C0` and `C9 10`.

## 6. Diagonals: no special case, no normalisation

X is done, then Y is done, each with the **same** `$99:$98` step. Holding RIGHT+DOWN moves
the ship the full step on both axes — diagonal speed is `step × √2`.

Measured rather than asserted: `playermodel.py`'s `diag-norm` variant (halve the step when
two axes are held) diverges at frame 440 of run A and 485 of run B. There is no diagonal
arm anywhere in `$9FFC`.

## 7. The position ring and the Options

```
A080: B5 07      LDA $07,X
A082: 29 0F      AND #$0F        ; ANY direction held?
A084: F0 27      BEQ $A0AD       ; no -> the ring does not advance
A086: AD 60 01   LDA $0160
A089: 18         CLC
A08A: 69 01      ADC #$01
A08C: C9 18      CMP #$18
A08E: 90 02      BCC $A092
A090: E9 18      SBC #$18        ; carry set by the CMP, so a plain -24
A092: 8D 60 01   STA $0160
A095: A8         TAY
A096: AD 60 03   LDA $0360
A099: 99 A0 07   STA $07A0,Y
A09C: AD 20 03   LDA $0320
A09F: 99 C0 07   STA $07C0,Y
A0A2: A0 01      LDY #$01
A0A4: AD 60 01   LDA $0160
A0A7: 20 A9 A2   JSR $A2A9       ; Option 1 <- ring[cursor - 11]
A0AA: 20 A9 A2   JSR $A2A9       ; Option 2 <- ring[cursor - 22]

sub_A2A9:
A2A9: 38 E9 0B   SEC / SBC #$0B
A2AC: B0 02      BCS $A2B0
A2AE: 69 18      ADC #$18        ; carry clear here, so a plain +24
A2B0: AA         TAX
A2B1: BD A0 07   LDA $07A0,X
A2B4: 99 60 03   STA $0360,Y
A2B7: BD C0 07   LDA $07C0,X
A2BA: 99 20 03   STA $0320,Y
A2BD: C8 8A 60   INY / TXA / RTS
```

* **The ring advances only while a direction is held** (`AND #$0F / BEQ`). Standing still
  freezes the whole Option chain in place. The model variant that advanced it every frame
  diverged at frame 362.
* Ring length is **24** (`$18`), cursor in `$0160`, and the two Options trail by **11** and
  **22** entries. `opt-lag-12` diverged at frame 340.
* `$A0A7`/`$A0AA` run **unconditionally**, whatever `$45` says. Slots 1 and 2 are
  maintained from stage start even with no Options collected — which is why `PROBE.md`
  saw them trailing before anything was drawn.

## 8. The tilt latch, and the Options' animation

```
A0AD: EE 40 01   INC $0140
A0B0: 10 05      BPL $A0B7
A0B2: A9 10      LDA #$10
A0B4: 8D 40 01   STA $0140       ; unreachable in practice: the reset below fires at 8
A0B7: AD 40 01   LDA $0140
A0BA: C9 08      CMP #$08
A0BC: 90 0A      BCC $A0C8
A0BE: A5 9B      LDA $9B
A0C0: 8D 20 01   STA $0120       ; the ship's sprite index
A0C3: A9 00      LDA #$00
A0C5: 8D 40 01   STA $0140
```

**The ship's tilt is latched only every 8 frames**, from whatever `$9B` happened to be on
the frame the counter hit 8. A one-frame tap of UP between latches is invisible.

`$0120` is causal, not correlated — forcing it and looking at the picture:

```
baseline  $0120=1  fb=0x117871A8  nonblack=2149
tilt=3    $0120=3  fb=0x274A5EA1  nonblack=2149
tilt=2    $0120=2  fb=0x5AD24902  nonblack=2171
```

Three different pictures, all still real pictures.

Options (`$A0C8`, `X` from `$45` down to 1):
`INC $0141,X` then `$0121,X = (($0141,X >> 3) & 1) + 4`, i.e. frames 4 and 5 alternating
every 8 frames, free-running. Measured with `$45` forced to 2: `$0141 = 100 → $0121 = 4`,
`104 → 5`, `112 → 4`.

## 9. Firing, and what else the routine does

Weapon parameters come from three 3-byte tables indexed by `$44`:

```
$A0E0: 06 07 06     -> $98, the type written to shot slot A ($0123,X)
$A0E3: 06 07 24     -> $9C, the type written to shot slot B ($0126,X)
$A0E6: 01 02 01     -> $99, the sound id passed to $EC1E
```
bytes: `$A0DC: 21 01 D0 EA  06 07 06 06 07 24 01 02 01  A6 44 BD`

```
A0FA: A6 18      LDX $18
A0FC: B5 05      LDA $05,X / AND #$80 / STA $9A      ; A button, EDGE
A102: B5 07      LDA $07,X / AND #$80 / STA $9B      ; A button, HELD
A108: A6 45      LDX $45                             ; loop slot $45 .. 0
```

**`$44` IS 0 NORMAL / 1 LASER / 2 DOUBLE**, which is the opposite of what this section
said for most of the port's life. Proven twice independently in
`docs/worklog/gradius/00-recon-weapons.md` 0: from the `$8989` meter jump table, where
the arm labelled DOUBLE stores **2** (`$89BB: LDA #$02 / STA $98 / ... STA $44`) and the
arm labelled LASER stores **1** (`$89CF: LDA #$01`); and from the cartridge, by forcing
`$44` and watching the shots —

| `$44` | slot A | slot B | behaviour |
|---|---|---|---|
| 0 | type `$06`, sub 0 | type `$06`, sub 0 | one shot per fire, `x += 7` |
| 1 | type `$07`, sub 1 | type `$07`, sub 1 | one shot per fire, `x += $0C` |
| 2 | type `$06`, sub 0 | type `$24`, sub **2** | **both slots on the same frame**; B goes `x += 4, y -= 4` |

Per slot (player = 0, Options = 1..`$45`): if shot slot A is free (`$0123,X == 0`) and
either A was just pressed **or** the autofire timer `$03A3,X` has run down while A is
held, `$A235` spawns it — `$0363,X = $0360,X`, `$0323,X = $0320,X`,
`$0123,X = $98`, `$0163,X = $44 & 1` — and `$03A3,X` is reloaded from `$35` (measured 20).
Slot B is the same shape at `$A250`/`$0126,X`/`$0166,X`, and is **skipped when
`$44 != 2`** — also the opposite of what this said. The bytes:

```
A124  A5 44     LDA $44
A126  C9 02     CMP #$02
A128  F0 0A     BEQ $A134     <- the branch INTO the slot-B block is taken ON 2
A12A  A5 35 9D A6 03          $44 != 2: cross-reload the OTHER slot's timer
A12F  D0 2B     BNE $A15C     ... and jump PAST slot B entirely
```

If `$41` (missile) is set and `$0129,X` is free, `$A26B` spawns a
missile at `$0369,X` / `$0329,X + 6`.

**Two player bullets on screen at a time**, one per slot, throttled by a 20-frame timer.
This section used to claim 90 frames of held A produced **3** shot spawns. Measured with
exec hooks on the two spawn routines over 300 frames of held A from game frame 400:

```
$A235 (slot A) frames = [400, 444, 488, 530, 574, 618, 660]
$A250 (slot B) frames = [421, 465, 509, 551, 595, 639, 681]
interleaved gaps      = [21, 23, 21, 23, 21, 21, 21, 23, 21, 23, 21, 21, 21]
```

Frames 400..489 contain **5** spawns, not 3. The gaps are not a constant either: the
timers are FROZEN while a slot is occupied, so the cadence is the shot's lifetime plus
`$35`, which alternates 21/23. Wave 6 ports this.

The rest of `$9FFC`, in order:

* `$A16F-$A234` — the missile/shot movement loops. These run **even when the player is
  dead**: `$9FFC`'s first act is `LDA $0100 / CMP #$02 / BCC $A006 / JMP $A16F`, which
  jumps *past* movement, ring, tilt and firing straight into them.
* `$A173` loop: slots 8..6, the missiles. This used to describe the table at `$A1A4` as
  "`+2` or `+8`/`$80` per frame", which is a misreading of it. `$A1A4` = `02 00 | 00 02 |
  80 00` is **three interleaved 2-entry tables** — `dy = {2, 0}`, `dxhi = {0, 2}`,
  `dxlo = {$80, 0}` — indexed by `Y` (0 = fly, 1 = crawl). So fly is `y += 2, x += 0.5`
  with sprite id `$0A`, and crawl is `y += 0, x += 2` with sprite id `$08`. Killed at
  `Y >= $C8`, on an `x` carry, or at `X >= $F8`
  (`docs/worklog/gradius/00-recon-weapons.md` 4).
* `$A1EA` loop: slots 0..5, the shots (`X += 7`, or `X += 4` while `Y -= 4` for the
  upward laser variant; killed at `X >= $F8` / `X >= $F0` / `Y < $10`).

**The dead-gate proved by intervention, not by waiting for a death.** Forcing `$0100 = 3`
over frames 399-459 of an otherwise identical run:

```
alive ($0100 == 1)          forced dead ($0100 == 3)
 $0360 <- $A296  60 writes    (no writes to $0360 at all)
 $0360 <- $A031  60 writes    (none)
 $0160 <- $A095  60 writes    (none from $A095)
 $0363 <- $A1FD  18 writes    $0160 <- $C0E3, twice a frame on 6 frames
```

## 10. The order of the frame

Measured with execution hooks and the CPU cycle counter, one gameplay frame
(`playerhook.py --order`, game frame 330). Cycles are relative to the previous frame's
`$80B5`:

| +cycles | scanline | address | what |
|---|---|---|---|
| 0 | 231 | `$80B5` | previous frame ends (`STA $04`) |
| 1107 | 241 | `$806A` | **NMI entry** |
| 1170 | 241 | `$8087` | OAM DMA from page `$02` — copies the display list the **previous** frame built |
| 1697 | 246 | `$8096` | PPUMASK |
| 1701 | 246 | `$8099` | `JSR $8A51` |
| 2367 | 252 | `$809C` | `JSR $8281` (VRAM queue) |
| 2420 | 252 | `$809F` | `INC $04` — the frame lock goes up |
| 2431 | 252 | `$ED02` | sound driver |
| 2897 | 256 | `$80A4` | **joypad** `$81BF` → `$05`/`$07` |
| 3327 | 260 | `$8B10` | sprite-budget seed |
| 5502 | 17 | `$80AA` | `JSR $80BE` — the game state machine |
| 5508 | 17 | `$80BE` | `INC $02`, the free-running frame counter |
| 5524 | 17 | `$80D1` | mode dispatch (`$83E4`, table `$80D4`); mode 5 → `$9650` |
| 5766 | 20 | `$9A5E` | stage-play tail; `LDA $5C / CMP #$02 / BCS $9A70` |
| 5773 | 20 | `$9A64` | `JSR $A2C0` |
| 5876 | 21 | `$9A67` | `JSR $BBB7` |
| **6395** | **25** | **`$9FFC`** | **THE PLAYER** |
| 6404 | 25 | `$A006` | speed |
| 6447 | 26 | `$A025` | X |
| 6526 | 26 | `$A056` | Y |
| 6589 | 27 | `$A086` | ring + Options |
| 6719 | 28 | `$A0AD` | tilt latch |
| 6737 | 28 | `$A0C8` | Option animation |
| 6745 | 28 | `$A0E9` | weapon table |
| 6793 | 29 | `$A10A` | firing |
| 6849 | 29 | `$A16F` | missiles |
| 6928 | 30 | `$A1E6` | shots |
| 7033 | 31 | `$9A6D` | `JSR $ADAB` (enemies) |
| 7459 | 34 | `$9A70` | `JSR $BFE2` |
| 8642 | 45 | `$9A73` | `JSR $8974` |
| 8693 | 45 | `$9A79` | scroll copy `$3E/$3F → $12/$13` |
| 8744 | 46 | `$9AA0` | `JSR $98EE`, then the sprite-0 spin |
| 27102 | **207** | `$9AAA` | the split fires — **18,358 cycles, 161 scanlines of busy-wait** |
| 28289 | 218 | `$80AD` | `JSR $8BAB` |
| 28361 | 218 | `$8641` | last subsystem |

Three consequences the port has to encode:

1. **Input is read before the player moves, in the same NMI.** `$81BF` at `$80A4`,
   the state machine at `$80AA`. Input lead is zero, and this is why.
2. **OAM DMA runs at the top of the NMI, before the player update.** The position written
   on frame N reaches the PPU on frame N+1. `PROBE.md` says the same thing from the
   sampling side.
3. **The player update finishes long before the sprite-0 split.** The split's 18 kcycle
   spin is *downstream* of everything the player did, so a port that models the split as a
   render-time event and the player as a logic-time event has the order right.

### What gates the update

* `$9FFC` runs **once per game frame**, from `$9A6A`, whenever mode (`$00`) is 5 and the
  stage-play path is reached. Measured over 900 frames: 590 calls to `$9FFC`, 590 to
  `$9A6A`, **0** to the alternative call site at `$969A`.
* `$969A` is the *other* caller (`JSR $9FFC` at `$969A`), reached when `$5C >= 2` and only
  on **even** frames (`LDA $02 / LSR / BCC` at `$9689`). **It is stage-5-only, and that is
  now settled rather than merely unobserved:** `$9650` computes `$5C` at all only when the
  stage index `$19 == 4`, by counting the non-zero bytes at `$0600/$0630/$0660/$0690`
  (`docs/worklog/gradius/00-recon-flow.md` 3). On every other stage `$5C` stays 0, so
  stage 1 cannot reach the half-rate path.
* `$9A5E` bails to `$9A70` when `$5C >= 2` — the player update is skipped entirely.
* `$9FFC` skips movement/ring/tilt/firing when `$0100 >= 2`.
* **Stage entry: the player update does not run for the opening frames of mode 5.**
  Measured: mode 5 at game frame 282, `$0100` becomes 1 at 283, `$9FFC` first runs at
  **310**. The gate is `$96B7: LDA $1B / BPL $96BE` — while bit 7 of `$1B` is clear the
  mode-5 handler runs the stage-intro table at `$96C5` instead of `JMP $982A`. `$1B` was
  measured stepping `1,2,3,4` over frames 283-308 and reaching `$80` on 309.
  **THE 28 IS NOT A CONSTANT** — this line used to say "the first 28 frames" and the
  stage-flow recon measured a respawn intro of **26** frames (f614-f640) off the same
  code. `$9C24` exits by watching `$57`, not by counting
  (`docs/worklog/gradius/00-recon-flow.md` 5). Recorded here because it is the reason a
  port that starts moving the ship on the first gameplay frame is wrong.

## 11. The model, and how it was checked

`tools/oracle/playermodel.py` implements sections 3-8 and **free-runs** them: seeded from
RAM at one frame, then driven only by the button stream, compared against the machine's
RAM every frame. Free-running is the point — a sub-pixel accumulator's error only shows up
by compounding.

Fields compared every frame: `$0360`, `$0380`, `$0320`, `$0340`, `$0160`, all 24 entries of
`$07A0` and all 24 of `$07C0`, `$0120`, `$0140`, and both Options' X and Y.

```
run A: natural speed ($40 = 0), all 8 directions plus L+R and U+D
  window frames 325..559, X 70..100, Y 76..121
  [PASS] free-ran 234 frames from seed 325: every field exact

run B: $40 forced to 5 (3.5 px/frame), driven into both X walls
  window frames 325..559, X 80..240, Y 96..183
  [PASS] free-ran 234 frames from seed 325: every field exact
```

**Six negative controls, every one seen red** (`--negative`):

| variant | first divergence |
|---|---|
| `no-subpixel` — whole pixels only | run B frame 340, `xf` |
| `x-max-220` — believe PROBE.md's 220 | run B frame 380, `x` 220 vs 223 |
| `diag-norm` — halve the step on diagonals | run A frame 440 |
| `no-down-priority` — let UP win over DOWN | run B frame 535 |
| `no-y-precheck` — clamp instead of pre-checking | run A frame 340 |
| `ring-always` / `opt-lag-12` — ring length 23 / Option lag 12 | frames 362 / 340 |

**`no-subpixel` and `x-max-220` are VACUOUS in run A** and pass there. That is not a bug in
the check, it is a fact about the cartridge: at `$40 = 0` the step is exactly 1.00 px so
the accumulator never moves, and the ship never gets near `$F0`. Run B exists only because
run A could not fail those two. The tool reports it rather than hiding it, and only calls a
control broken if it stayed green in **both** runs.

## 12. Known limits

* Only stage 1's opening, `$40 ≤ 20` by injection, `$44 = 0`, `$45 ∈ {0, 2}` (2 by
  injection). Nothing here has been checked against a boss, a warp, or stages 2-6.
* The `$969A` call site and the `$5C >= 2` path have **never been executed** in any run
  here, and now have a reason: `$5C` is only computed on stage 5 (`$19 == 4`). Do not
  assume the player update is once-per-frame on stage 5.
* `$0160` has a second writer, `$C0E3`, which only appeared while the player was dead. If
  it ever fires during live play the ring model breaks; it did not in 60 consecutive live
  frames.
* The weapon system beyond "which table byte lands where" is not reversed. `$0123`,
  `$0126`, `$0129` are treated as opaque slot types here.
* `$A0B2: LDA #$10 / STA $0140` is unreachable while the `CMP #$08` reset exists. Kept in
  the model for shape; if a later finding lets `$0140` be written from elsewhere it
  becomes live.
