# Wave 26 RECON - the boss (head `$B914`, body `$B913`)

status: DONE (recon, READ-ONLY - no src/ edits, no commit)
recon, 2026-08-02

Scope (from the W26 brief / `20-plan-completeness.md` §3): decode +
enumerate the boss script format - the head handler `$B914`, the inert body
`$B913`, the three-slot layout, the script/morph/rank tables, the damage
ladder, the death chain, and every fall-through in the region. Deliver the
DENOMINATOR (record counts, rank rows, parts) and a per-piece inventory, and
confirm the in-situ done-when is achievable.

Everything below is read out of `games/gradius/rip/prg.asm` (the disassembly)
and cross-checked against the recorded cartridge artifacts
(`tools/oracle/scenarios.json`, the W24/W25b worklogs). The PGM-style
addresses in the brief (`$259554`, `$294AD8`, `$25962E`, `$81B626/$81B62A`)
are confirmed NOT in this mapper's address space (32 KB PRG at `$C000`-`$FFFF`,
mapper 3 CNROM, no PRG banking) - they are placeholders. The real addresses
are mapped in §7.

---

## 1. THE DENOMINATOR

| set | count | source |
|---|---|---|
| boss object slots | **3** (head $98 slot 9; body $99 slots 8 & 7) | `$9982` spawn + `$B914` head + the `$030B,X` slot-N-1 trick (§3) |
| dispatch entries the boss uses (`$AE1C`) | **2**: `[24] $B914` head, `[25] $B913` body (RTS, inert) | `jt_AE1C` line 4821-4822 |
| morph / damage-ladder records (`$B8EF`) | **7** entries = 6 live morph states + 1 terminator | `$B8EF` data, indexed Y=`$046C,X` 0..6 (§5) |
| rank rows per rank table (`$B8F8`/`$B901`/`$B90A`) | **8** (rank 0..7, `$17`) | data §6 |
| boss HP | **6 damage points** (laser = 1, missile = 2; `$046C` reaches index 6 → death) | `$C087 ADC $046C,X` §4 |
| armament bullets per fire cycle | **4** (re-positioned slots 3..0 each fire) | `loc_BAA0` §8 |
| armament tables | **4**: `$BAF7`(4) `$BAFB`(4) Y/X offsets, `$BAFF`(8) `$BB07`(8) rank | data §8 |
| death-chain steps | **8**: score, `INC $3B`, sfx, explosion, script-4 override, body-clear×2, `INC $1B` | §9 |
| death triggers | **2**: damage (phase end → `$B97A`, scores + warp-check) and timeout (`$04CC`≥6 → `$BA9C`, no score) | §9 |

---

## 2. THE SLOT / RECORD LAYOUT - confirmed, and the `$030B,X` trick

The boss occupies **3 slots**, but only one is a "live" dispatched enemy:

- **Head = slot 9, type `$98`.** Created by `st_$9982` (`$9982`, line 2741):
  `LDX #$09 / STX $A8 / JSR $A527` (allocate slot 9), then absolute stores
  `STA $0315` (= `$030C[9]` = `$98`), `STA $0335` (= `$032C[9]` = `$80` X),
  `STA $0375` (= `$036C[9]` = `$F0` Y). Only the head is spawned here.
- **Body = slots 8 and 7, type `$99`.** Created by the head handler itself
  (`sub_B9B7` → `sub_B9F2`, every frame), and they dispatch to `[25] $B913`,
  which is a single `RTS` (line 6532) - **inert**. They are rendered and
  collision-checked but execute no logic of their own.

**The `$030B,X` slot-N-1 trick (load-bearing).** The object arrays are 1 byte
per slot at bases `$010C, $012C, $030C, $032C, …` (the despawn sweep at
`$994A` clears exactly `$010C,X / $012C,X / $030C,X`). `STA $030B,X` computes
address `$030B+X` = `$030C+(X-1)` - i.e. it writes the **previous** slot's
`$030C`. So:

- `sub_B9F2` at `$B9FD`: `LDA #$99 / STA $030B,X`. Entered **twice** (§10
  fall-through): once via `JSR $B9F2` with X=9 → writes `$030C[8]` = `$99`
  (body slot 8); then `DEX` (X=8) + fall-through → writes `$030C[7]` = `$99`
  (body slot 7). Same trick for `$010B,X` → `$010C[8]`=`$010C[7]`=`$80`.
- The death loop `$B991`: `STA $030B,X / STA $012B,X / STA $010B,X` with
  X=9 then X=8 → clears body slots 8 and 7 (type, `$012C`, `$010C`).

This is why the brief's "`$030B,X = $99`" is exact, not a typo: the body
"type" is stored through the offset-by-`$01` alias. `$030C` itself is never
written `$99` directly anywhere in the PRG (verified: no `A9 99 / 9D 0C 03`;
the only `$99→$030C` stores are `STA $030C,Y` at `$BED3/$C14A/$C15B`, all
power-up capsules, type `$02`).

Dispatch index = `(type & $7F) << 1` into `jt_AE1C` (`$83E4` does `ASL A`,
dropping bit-7 as carry; line 702-720). `$98`→entry 24, `$99`→25, `$02`→2.

---

## 3. THE HEAD HANDLER `st_B914` - per-frame flow (line 6535)

```
B914  LDX $A8                 ; X = head slot (9)
B916  LDA $03AC,X / BPL $B920 ; clear $04EC if $03AC negative (loop-2 shield)
B920  LDA #$90 / STA $010C,X  ; anim = $90 (always ≥ $80 → always "hittable")
B925  LDA #$03 / STA $0460,X  ; $0460[9] = 3 (the missile-double-damage flag, §4)
B92A  LDA #$98 / STA $030C,X  ; re-assert head type $98 every frame
B92F  LDY $046C,X             ; Y = phase / cumulative damage  (THE HP COUNTER)
B932  CPY #$07 / BCS $B962    ; phase ≥ 7  → death gate
B936  LDA $B8EF,Y             ; phase 0..6 → morph value
B939  BEQ $B962               ; morph == $00 (phase 6) → death gate
B93B  CMP $012C,X / BEQ $B9A8 ; unchanged → skip morph step
B940  STA $012C,X             ; advance the displayed morph
B943  CMP #$6C / BEQ $B9A8    ; the initial/closed morph $6C → no sfx
B947  JSR $845B ; JSR $EC1E($08)  ; morph-changed sfx
B951  [loop-2 only] $04EC=$FF, $03AC=$00   ; ($1A≠0 arm, §loop-1a)
B95F  JMP $B9A8
;--- death / warp gate (reached when phase ran off the $B8EF table) ---
B962  LDA $19 / CMP #$01 / BNE $B97A        ; stage≠1 → straight to death
B968  LDA $04CC,X / CMP #$01 / BNE $B97A    ; volley counter ≠ 1 → death
B971  LDA $04AC,X / CMP #$78 / BCS $B97A    ; charge ≥ $78 → death
B978  INC $39                                ; STAGE-1 WARP ROUTE (else)  → W27
;--- death (falls through from $B97A; also the target of $BA9C timeout) ---
B97A  LDA #$10 / JSR $8455                   ; score +$10
B97F  LDX $18 / INC $3B,X                    ; per-player kill counter
B983  LDA #$AC / JSR $CB26                   ; sfx $AC + convert head → type $02
B988  LDA #$04 / STA $016C,X                 ; OVERRIDE explosion script = 4 (→ $A2)
B98D  LDA #$00 / LDY #$01                    ; clear body slots 8 & 7 via $030B trick
B991  STA $030B,X / STA $012B,X / STA $010B,X / DEX / DEY / BPL $B991
B99E  LDA $0100 / CMP #$02 / BCS $B9A7       ; transition flag ≥ 2 → skip
B9A5  INC $1B                                ; *** $85 → $86 (boss-death advance) ***
B9A7  RTS
```

The body of the handler (`loc_B9A8` onwards, §4/§8) only runs while the boss
is alive (phase < 6): the intro Y-descent + body-sync, then the rank-indexed
horizontal movement, then the fire cycle.

`st_B913` (line 6531) is **`RTS`** - the body slots (7, 8) dispatch here and
do nothing. Confirmed inert.

---

## 4. THE DAMAGE SYSTEM - `$046C` is the boss HP, NOT rank-indexed

The head handler never writes `$046C[9]`. It is incremented by the **player-shot
collision** routine `sub_C055` (line 7587), called from the bullet/enemy
overlap loop at `$C00F` (`JSR $C055` at `$C02D`):

```
C055  LDA $030C,Y / BPL $C0B7        ; type < $80 → normal-enemy kill path
C05A  LDA $010C,Y / BPL $C090        ; anim < $80 → type-$9A / normal path
C05F  ... sfx $05 (hit clang, unless type $94 or $012C==0)
C070  LDA $048C,Y / BEQ $C0B7        ; *** vulnerability gate: $048C==0 → NO DAMAGE ***
C075  LDX $A9 / LDA #$01
C079  LDY $0460,X / BEQ $C086        ; $0460==0 → damage stays 1 (no missile bonus)
C07E  LDY $A8 / CPY #$06 / BCC $C086 ; shot slot < 6  → laser (damage 1)
C084  LDA #$02                       ; shot slot ≥ 6  → missile (damage 2)
C086  CLC / ADC $046C,X / STA $046C,X ; *** damage += 1 (laser) or 2 (missile) ***
```

So:

- The boss (type ≥ `$80`, anim `$90` ≥ `$80`) routes to the damage path, not
  the one-shot `sub_BE93` that kills normal enemies.
- **Damage per hit = 1 (laser) or 2 (missile).** Missiles (shot slot ≥ 6) do
  double, and only because the head sets `$0460[9]=$03` (`B925`) which arms the
  missile check; with `$0460==0` damage is always 1.
- **The vulnerability gate is `$048C[9]`.** Only non-zero during the volley
  window (§8). Outside it, shots clang (`sfx $05`) but deal no damage.
- `$046C` is therefore the boss's **cumulative-damage / phase counter**, and
  it indexes the morph table `$B8EF` (§5). The boss dies when `$046C` reaches
  index 6 (6 laser hits, or 3 missile hits, or any mix summing to 6).

---

## 5. THE MORPH / DAMAGE-LADDER TABLE `$B8EF` - 7 entries, damage-indexed (NOT rank)

```
B8EF:  6C 6D 6E 6F 70 71 00     ; 7 bytes, indexed Y = $046C,X (phase 0..6)
```

| phase (`$046C`) | morph value | meaning |
|---|---|---|
| 0 | `$6C` | initial / closed core (no sfx on entry, `CMP #$6C` at `$B943`) |
| 1 | `$6D` | opening step 1 |
| 2 | `$6E` | opening step 2 |
| 3 | `$6F` | opening step 3 |
| 4 | `$70` | opening step 4 |
| 5 | `$71` | fully open |
| 6 | `$00` | **terminator** → `BEQ $B962` death gate |

Each value is a metasprite/anim id written to `$012C,X` (the displayed
metasprite). The morph advances one step **per damage point** - the boss
visibly opens as it takes hits, and dies on the 6th.

**CORRECTION to the plan.** `20-plan-completeness.md` §3 / W26 row says
"the damage ladder `$B8EF` (boss HP / damage per hit, **rank-indexed via
`$17`**)." That is wrong on two counts: `$B8EF` is indexed by `$046C`
(cumulative **damage**), and the table is **fixed across ranks** - the boss
takes the same 6 damage points to die at every rank. The rank-indexed tables
are `$B8F8` / `$B901` / `$B90A` (§6). The brief's listing of `$B8EF` among
the "rank tables" repeats this conflation. (This is a documentation defect in
the plan, not in the ROM.)

**The stray bytes above `$B8EF`.** `$B8E6-$B8EE` (`$00 $A0 $A0 $00 $00 $00
$00 $01 $00`) belong to a **different** bullet-spawner, `loc_B8A5` (line
6496, self-loop at `$B8E3`; reads `$B8E6,Y` / `$B8E9,Y` / `$B8EC,Y`). They
abut the boss tables but are not boss data. `$B900` (one `$00`) and `$B912`
(one `$23`) are padding between the rank tables / before `st_B913`.

---

## 6. THE RANK TABLES - 8 rows each, indexed by `$17`

All three are read with `LDY $17` in the movement block `$BA18-$BA73`. They
control **movement speed** and **fire interval**, not HP.

```
B8F8:  00 20 40 60 80 A0 C0 F0     ; movement delta X, LOW byte  (rank 0..7)
B901:  01 01 01 01 01 01 01 02     ; movement delta X, HIGH byte (rank 0..7)
B90A:  5A 50 46 3C 32 28 23 23     ; fire-interval threshold    (rank 0..7)
```

- `$B8F8`/`$B901` form a 16-bit signed horizontal step, applied by `SBC`/`ADC`
  at `$BA3E`/`$BA50` depending on the direction flag `$03EC,X`. The combined
  magnitudes (lo:hi) are `$0100 $0120 $0140 $0160 $0180 $01A0 $01C0 $02F0` -
  the boss paces faster at higher rank. Result clamped to `[$18, $A8]`
  (`$BA5C`/`$BA62`).
- `$B90A` is the fire cadence: the charge counter `$042C,X` increments each
  non-firing frame and the boss fires when it reaches `$B90A[rank]`
  (`CMP $B90A,Y` at `$BA1D` and `$BA73`). Rank 0 = `$5A` (90f), rank 7 =
  `$23` (35f) - same shape as the hatch fire table `$B01D` (W22 / loop-1a).
  Lower rank value in the table would mean faster fire; here higher rank →
  smaller value → faster fire. Consistent rank-row, finite, 8 entries.

These three are the rank tables the plan names; `$B8EF` is not one of them
(§5). All four addresses (`$B8EF/$B8F8/$B901/$B90A`) are the W21 export set
`$B8EF/$B8F8/$B901/$B90A` - confirm they are present in
`assets/enemies/tables.json` before porting (W21 was to export them).

---

## 7. PGM-PLACEHOLDER → real address map

The brief's script-format addresses are **not in this ROM** (they exceed
`$FFFF`; mapper 3 has no PRG banking, so there is no high address space). Map:

| brief (PGM placeholder) | real Gradius address | role |
|---|---|---|
| "brain `$294AD8`" | **`$B914`** (`st_B914`, line 6535) | head per-frame handler (entry `[24]`) |
| "inert body" | **`$B913`** (`st_B913`, line 6531) | `RTS` (entry `[25]`) |
| "stepper `$25962E`" | **`$B92F`-`$B95F`** (the `LDY $046C,X` / `LDA $B8EF,Y` / `CMP $012C,X` block) | the morph stepper - advances `$012C` one value per damage point |
| "$259554's five installed tables" | **`$B8EF` `$B8F8` `$B901` `$B90A`** (§5/§6) + the armament quartet `$BAF7`/`$BAFB`/`$BAFF`/`$BB07` (§8) | the boss's data tables (4 logic + 4 armament) |
| "the parts list" | the 3-slot layout: head `$98` slot 9, bodies `$99` slots 7 & 8 (§2) + 4 armament bullets (§8) | |
| "HP at `$81B626`/`$81B62A`" | **`$046C,X`** (per-object, slot 9 = `$046C[9]`) is the HP/damage counter; **`$04CC,X`** is the volley/timeout counter; **`$048C,X`** is the vulnerability gate | HP is in object RAM, not a fixed table address |

There is no separate "brain" object or pointer-driven script interpreter here
- the boss is a single per-frame handler (`$B914`) with a fixed 7-entry morph
table and four rank tables, exactly the shape `loop-1a-recon.md` predicts
(rank-indexed, finite, table-driven; the boss damage ladder is rank-indexed
the same way `$82`'s `$9A35[$17]` is - except here it is the *movement/fire*
that is rank-indexed, and the HP/morph sequence is fixed).

---

## 8. THE ARMAMENT (the 4-bullet fire cycle) - `loc_BAA0` (line 6769)

Reached when the charge counter hits the threshold (`$BA76 BCS $BAA0`). It
resets the counter and re-positions **4** sub-objects (the boss's guns /
muzzle flares) at slots 3..0 (`$A9 := 3 … 0`, `BPL $BAA9` loop):

```
BAA0  reset $042C,X := 0 ; A9 := 3
BAA9  (loop X = 3,2,1,0)
  BAB6  LDA $036C,Y (head Y) ; ADC $BAF7,X (Y-offset) ; STA $0376,X   ; bullet Y
  BAC0  LDA $032C,Y (head X) ; ADC $BAFB,X (X-offset) ; STA $0336,X   ; bullet X
  BAC0+ set $0176=$02, $0136=$41, clear $0316/$0116/$03F6/$03C6
  BAE4  LDY $17 ; LDA $BAFF,Y ; STA $0436,X   ; rank-indexed velocity/flag byte
       LDY $17 ; LDA $BB07,Y ; STA $0456,X   ; rank-indexed velocity/flag byte
BAF6  RTS
```

Tables (all four are boss data):

```
BAF7:  08 F8 F8 08           ; 4 Y-offsets for armament bullets 0..3
BAFB:  F1 FE 0A 17           ; 4 X-offsets for armament bullets 0..3
BAFF:  02 03 03 03 03 04 04 04   ; 8 rank rows → $0436 (velocity/flag)
BB07:  C0 00 40 80 C0 00 40 80   ; 8 rank rows → $0456 (velocity/flag)
```

These slots (`$xx76`/`$xx36`/`$xx16` arrays) are a **separate projectile
pool** from the enemy slots (`$xx0C`/`$xx2C`/`$xx6C`); they do not collide
with head slot 9 or body slots 7/8.

**The volley/vulnerability/timeout ladder** (in the firing tail `$BA78`-`$BA9C`,
driven by `$04AC`/`$04CC`):

```
BA78  INC $042C,X ; INC $04AC,X       ; charge + accumulator
BA7E  BNE $BA9F                    ; $04AC not wrapped → done
BA80  INC $04CC,X                  ; $04AC wrapped (256): volley counter ++
BA83  LDY $04CC,X
BA86  CPY #$01 / BCS +2 / STA $048C,X = $01   ; $04CC ≥ 1 → VULNERABLE
BA8F  CPY #$05 / BCS +2 / STA $048C,X = $00   ; $04CC ≥ 5 → INVULNERABLE again
BA98  CPY #$06 / BCS +2
BA9C  JMP $B983                    ; $04CC ≥ 6 → TIMEOUT DEATH (no score, no warp-check)
```

So the fight is a timed window: the core is damageable only while `$04CC ∈
[1,4]` (each `$04CC` step ≈ 256 non-firing frames). If the player has not
killed it by `$04CC = 6`, the boss self-destructs via `$BA9C → $B983`
(skipping the score add + `INC $3B` + the warp gate that the damage death
runs). This is the second, "no-credit" death trigger in §1.

---

## 9. THE DEATH CHAIN - confirmed end to end (line 6590-6620)

For the normal stage-1 kill (boss damaged to phase 6, `$B962 → $B97A`):

1. **Warp-route gate** (`$B962`-`$B978`): on stage 1, if `$04CC[9]==1` AND
   `$04AC[9]<$78` at the moment of death, the code does `INC $39` (the warp
   flag). **It then falls straight into `$B97A`** - `INC $39` at `$B978` is
   immediately followed by `loc_B97A` (line 6590), no branch between them, so
   the warp does NOT skip the score/kill/explosion; it sets `$39` *and then*
   runs the full normal death. Any other stage, any other volley count, or
   `$04AC≥$78` branches past the `INC $39` directly to `$B97A`. So `$39` just
   records "the boss was killed during the `$04CC==1` window" for W27's
   stage-end warp (`$984F`/`$C686`) to read; the death itself is identical
   either way. (Matches the W23 `$39` recon's "kill during the window"
   condition.) **The timeout death (`$BA9C → $B983`) is the ONLY death path
   that skips `$B97A`** - it jumps straight to the explosion, with no score,
   no `INC $3B`, and no warp-gate evaluation.
2. **Score** (`$B97A`): `LDA #$10 / JSR $8455` - queues score +$10 (×player
   multiplier `$18` inside `$8455`/`$8469`).
3. **Kill counter** (`$B97F`-`$B981`): `LDX $18 / INC $3B,X` - per-player kill
   tally.
4. **Falls into `$B983`** (real fall-through, §10): `LDA #$AC / JSR $CB26`.
5. **Explosion conversion** (`sub_CB26` → `sub_CB28` → `sub_CB2B`, line 9121):
   `JSR $EC1E` (sfx `$AC`), then `sub_CB2B` clears the head's `$042C/$014C/
   $018C/$046C/$04AC/$010C/$03AC/$040C`, sets `$030C[9]=$02` (explosion),
   `$016C[9]=$02`.
6. **Script-4 override** (`$B988`-`$B98A`): `LDA #$04 / STA $016C,X` -
   overrides the `$02` from `sub_CB2B` to **explosion script 4**.
7. **Body clear** (`$B991` loop): clears body slots 8 & 7 via the `$030B,X`
   trick (§2).
8. **`$85 → $86` advance** (`$B99E`-`$B9A5`): `LDA $0100 / CMP #$02 /
   BCS $B9A7 / INC $1B`. `$0100` is a transition flag (set to `$03` in the
   `$8C` ending-chain state at `$98C9`; `0` during ordinary stage-1 play), so
   the `INC $1B` fires on a normal clear - confirming the W24 recon's "boss
   death advances `$1B` `$85→$86` via an external `INC`, not via `$997E`."
   The `$0100≥2` guard is an ending-chain edge case (skip the advance if a
   stage transition is already in progress).

**Script 4 → metasprite `$A2`, confirmed live.** `st_AE99` (entry `[2]`, the
explosion handler, line 4848) reads `$016C,X` (=`4`), `ASL`→8, fetches the
2-byte script pointer at `$AE71+8` = **`$AE8B`**, then reads the script
byte-stream via `($98),Y` with `Y=$042C` (incremented each frame). The byte
stream at `$AE8B` is:

```
AE8B:  A2 6B 6A 69 68 6A 00     ; script 4: A2, 6B, 6A, 69, 68, 6A, terminator
```

`sub_CB2B` zeroed `$042C[9]`, so the **first frame of the boss explosion is
metasprite `$A2`** - the big boss explosion W21 exported. (Normal enemies use
`$016C` 0/1/3 → scripts `$AE7D`/`$AE81`/`$AE86`, 4-5 small frames; the boss
uniquely starts with `$A2` and runs 6 frames + terminator.) `$A2` is the W21
export prerequisite made live here.

**Two death triggers, recapped:** damage (phase end → `$B97A` → score + kill
+ warp-gate → `$B983`) and timeout (`$04CC≥6` → `$BA9C → $B983` directly, no
score/kill/warp). For the in-situ endchain run the player kills the boss by
damage, so the `$B97A` path is the one exercised.

---

## 10. FALL-THROUGHS in the boss region (read past every one)

1. **`sub_B9F2` double-execution (`$B9EE` JSR + `$B9F1` DEX fall-through).**
   `sub_B9B7` calls `JSR $B9F2` with X=9 (sets up body slot 8 via the `$030B`
   trick), `sub_B9F2` ends `LDX $A8 / RTS` (restores X=9), then `$B9F1 DEX`
   (X=8) and control **drops straight into `sub_B9F2` again** - running it
   with X=8 (sets up body slot 7), whose `RTS` then pops `sub_B9B7`'s caller.
   This is how both body slots get created from one written-once subroutine.
   Not a trap - intentional - but exactly the shape RULE "read past the
   apparent end" warns about.
2. **`$B97A` → `$B983`** (the score/kill falls into the explosion code). Real
   fall-through; both the damage-death path and the `$BA9C` timeout jump land
   at `$B983`.
3. **`$BA0A` → `$BA12`/`$BA15` → `$BA18`**: the Y-position catch-up (`INC
   $036C,X` twice if below the player) falls into the rank-movement block at
   `$BA18`. Real, benign.
4. **`$B913` (RTS) → `$B914`**: NOT a fall-through issue - `$B913` is a
   dispatched `RTS`, control returns to the per-frame loop, it does not drop
   into `$B914`.
5. **`sub_CB26` → `sub_CB28` → `sub_CB2B`** (line 9121-9142): three labels on
   one straight-line path (`CB26 LDX $A8` then falls into `CB28 JSR $EC1E`
   then falls into `CB2B`). Real fall-through; `sub_CB28` is the entry other
   callers use (`AF82`, `BB72`, `BF6F`) to skip the `LDX $A8`.

No other accidental drop-into-the-next-routine found in `$B914`-`$BAF6` or
`$CB26`-`$CB4D`.

---

## 11. THE IN-SITU DONE-WHEN - achievable, confirmed

The endchain scenario (`tools/oracle/scenarios.json`, name `endchain`) is
configured:

```
align 6160 ; tail "1350:RDA,324:RUA,80:RDA,2846:RA,4000:RUA"
poke 0044=2@400-8999, 0045=2@400-8999, 0046=5@400-8999, 0041=1@400-8999
compareUntilThrow: "B914"
```

MEASURED (W25b `reachcheck.py`, fresh Mesen): the run reaches **`$1B = $85` @
f8252** (scroll `$0D00`, zero deaths), which is the `$84`→`$85` advance that
spawns the boss (slot 9, type `$98`) and routes the enemy engine to `$B914`.
The `compareUntilThrow` mechanism field-compares every frame the port CAN run
(through `$81`/`$82`/`$83`/`$84`) and asserts the throw fires at `$B914` on
f8252 - **GREEN, 2091 frames compared, 0 divergent TIER-1 fields**
(`25b-recon-reaching-script.md` §4). The scenario's own `_` field states the
W26 contract verbatim: *"If W26 ports `$B914`, delete `compareUntilThrow` and
extend the window: the boss fight becomes an ordinary comparison."*

So: **porting `$B914` (and the body-sync `$B9B7`/`$B9F2`, the armament
`$BAA0`, and the death chain) deletes the throw and extends the green
in-situ comparison through the boss fight + death, with `INC $1B $85→$86`
landing on the cartridge's frame as the done-when.** The existing `scen`
dump covers **748 frames past `$85` entry** (f8252 → ~f9000).

**MUST-CONFIRM for the implementer (the one genuine unknown).** The dump
window past `$85` is 748 frames. The fight length is *not* a fixed ROM
constant - it depends on when the player damages the boss to phase 6 during
the `$04CC∈[1,4]` vulnerability window. With this scenario's load (RUA hold +
the `$41=1` missile poke → missiles do 2 damage, 3 hits to kill once
vulnerable), the boss should die well inside 748 frames, but the **exact
death frame has not been measured on a ported `$B914`** (the port cannot yet
run the fight). Bounds: the boss becomes vulnerable around `$04CC=1` (≈256
non-firing frames after spawn ≈ a few hundred real frames) and self-destructs
no later than `$04CC=6` (≈1500 frames). If the ported run's death fires
beyond f9000, **extend the `scen` dump window** (it is a scenario parameter,
not a port gap). Stated per RULE 2: the done-when is structurally achievable
(the dump reaches the boss, the throw is at the right address, the death
chain is fully decoded); the only unmeasured number is the death frame inside
the window.

---

## 12. WHAT I COULD / COULD NOT REACH (RULE 2)

- **CONFIRMED from the listing** (static): the 3-slot layout + `$030B` trick;
  the `$B914` per-frame flow; `$B8EF`/`$B8F8`/`$B901`/`$B90A` (counts, index
  registers, roles); the armament quartet; the `$C055` damage path (1 vs 2,
  `$048C` gate); the full death chain incl. script-4→`$A2`; both death
  triggers; every fall-through; the PGM→real address map.
- **CONFIRMED from the recorded cartridge artifacts + prior worklogs**: the
  endchain scenario reaches `$85` @ f8252 and throws at `$B914` (GREEN);
  `$0100` is a transition flag (`0` in ordinary play → `INC $1B` fires); the
  `$82`/rank system is loop-invariant for the boss (`loop-1a-recon.md`).
- **NOT measured dynamically here** (out of recon scope - port cannot run the
  fight yet): the exact death frame inside the 748-frame window (§11); the
  `$82`-countdown / fight behaviour at rank ≠ 4 (the endchain run is rank 4;
  other rank rows ship read-from-ROM per `20-plan` §6); whether the
  stage-1 warp arm (`INC $39`) fires on this specific run (it needs
  `$04CC==1 && $04AC<$78` at death - a tight window the RUA+missile kill may
  or may not hit; if it fires, W27's warp route lights up as a side effect,
  which the implementer should watch for).
- **Exports CONFIRMED present** (verified in `assets/`, not assumed): the
  `$B8E6` block in `assets/enemies/tables.json` carries `$B8EF`/`$B8F8`/
  `$B901`/`$B90A` (bytes `[108,109,110,111,112,113,0]` = `$6C..$00` for the
  morph ladder - exact match); the `$BAF7` block carries the armament quartet
  (`$BAF7`/`$BAFB`/`$BAFF`/`$BB07`); the `$AE71` block carries the
  explosion-script pointer table. `assets/metasprites.json` has `$A2` (decimal
  key `"162"`, **18 records** - the one the W21 `n > 16` guard fix was for).
  The exporter's own `note` on `$B8E6` independently calls `$B8EF` the
  "damage frames," confirming the §5 correction. W26's data prerequisites are
  met; no re-export needed.

---

## 13. WHAT W26 PORTS (the implementer's to-do, distilled)

1. **`$B914` head handler** (entry `[24]`) and **`$B913` body** (entry `[25]`,
   `RTS` - a no-op arm, but wire it so the dispatch is complete and loud).
2. The **`$030B,X` slot-N-1 trick** for body create/clear - port the alias
   explicitly or model body slots 7/8 as their own slots whose type anim/etc.
   mirror the head minus one.
3. The **morph stepper** (`$B92F`-`$B95F`): `$012C,X := $B8EF[$046C,X]`, sfx on
   change, skip sfx for `$6C`.
4. The **rank movement** (`$BA18`-`$BA68`): direction-flagged `SBC`/`ADC`
   `$B8F8/$B901[$17]`, clamp `[$18,$A8]`; the intro Y-descent + `$BA0A` catch-up.
5. **`sub_B9B7`/`sub_B9F2` body-sync** (the double-execution fall-through).
6. The **fire cycle** (`$BAA0`-`$BAF6`) + the volley/vulnerability/timeout
   ladder on `$04AC`/`$04CC`/`$048C`.
7. The **death chain**: score, `INC $3B`, `sub_CB26`→type`$02`, script-4
   override (`$016C=4`→`$A2` via `st_AE99`), body clear, `INC $1B` (gated
   `$0100<2`); plus the `$BA9C` timeout death and the stage-1 `$39` warp arm
   (the warp arm's effect is W27, but its *firing* must not throw).
8. **Damage intake** is already routed by the port's collision if/when the
   shot-vs-boss overlap (`sub_C055`) is ported - confirm the port's collision
   adds 1/2 to `$046C[9]` only while `$048C[9]≠0` and `$0460[9]≠0` (missile
   bonus). If the port's collision is generic, this may already be correct;
   if not, it is part of W26's closure.

**Call closure for the boss** (supersedes the plan's partial list
`$B0B4/$ADAB/$9A8C/$CB26/$839F/$A527/$8455` - several of those are not
boss-specific): spawn `$A527` (via `$9982`), dispatch `$ADAB`/`$83E4`/`jt_AE1C`,
sfx `$845B`/`$EC1E`, score `$8455`, explosion `$CB26`/`$CB2B`/`st_AE99`,
body-sync `$B9B7`/`$B9F2`, damage `sub_C055`. `$B0B4` (state-flip) and
`$9A8C`/`$839F` are NOT used by the boss.
