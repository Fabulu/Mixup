# Wave 24 QA / ADVERSARIAL - the play sub-state machine (jt_$982F) and game-over

status: DONE
qa / adversarial (read-only on src/), 2026-08-02

Subject: W24 (`24-impl-substate-machine.md`). The implementer's own done-when
#1, #2, #3 (the in-situ `$1B`-timeline and game-over cartridge comparison) were
NOT reached -- they were hook-recorded only, and explicitly deferred per RULE 2.
This wave's job is to close that gap, and to try to break the ported sub-states.

Scope (from the wave brief):
  - Does a clear traverse `$80 -> $81 -> $82 -> $83 -> $84 -> $85`? (The port
    throws at the `$84`->`$85` boss-creation frame: `$B914` is W26. So the
    portable prefix is `$80..$84`-despawn; `$85` is the expected loud throw.)
  - Is the `$1B` timeline reproduced to the frame?
  - Is game-over (`$96FB`) field-exact?
  - Try to break it: rank rows other than `$17`, lag frames, dying
    mid-countdown, the despawn sweep (`sub_$994A`) edge cases.
  - Label EVERY intervention (poke / invuln) per docs/knowledge/09.

Output dir (mine, distinct from every other agent's): `tools/oracle/out/w24qa/`.

## Gate (regression)

`node games/gradius/tools/test-all.mjs` -> **GREEN, 10 passed, 0 failed, 0 SKIPPED**.
Self-check: 7 deliberate breaks (laginject=450, seed-nt+1, seed-pal+1, seed-coll0,
bullet-nosub, ...) all RED. Baseline regression-clean. `compare.mjs` PASS.

## Instruction-level verification (read against prg.bin, 2026-08-02)

The ROM tables, byte-for-byte out of `assets/prg.bin` (the authority):

```
$9A35 rankCountdown (8): 03 03 04 04 05 05 06 06   <- matches export + tests
$9A3D bossPage (8):      0C 0C 0C 0C 0B 0B 0C 02   <- [0]=$0C=3072px
$9A45 nextState (8):     81 81 81 81 81 81 81 81   <- constant $81
$98FD endPage (7):       0E 0E 0E 0E 0D 0C 0D
jt_982F (16 words):
  [0]$9A4D [1]$9A0E [2]$99E9 [3]$99C0 [4]$9982 [5]$997E [6]$9904 [7]$9B3E
  [8]$9BED [9]$9C12 [10]$9C1E [11]$988C [12]$98DD [13]$98E5 [14]$984F [15]$984F
```

The port's `playArm` switch (`substate & 0x0F`) dispatches to EXACTLY these targets
for the 6 ported arms and throws `$9904/$9B3E/$9BED/$9C12/$9C1E/$988C/$98DD/$98E5/
$984F` for the other 10. Match confirmed.

Hand-decoded every W24 routine from the raw bytes and compared to `src/nmi.js`:

- **`$840C` (16-bit decrement, A=1).** `EOR #$FF / SEC / ADC $00,X / STA / BCS / DEC $01,X`.
  Equivalence to the port's `if zp4C!=0: zp4C-- else {zp4C=$FF; zp4D--}` verified at
  $4C=$05 (no borrow), $4C=$00 (borrow), $4C=$01 (boundary -> $00, no borrow). The
  zero-test `$4C ORA $4D / BNE` matches `(zp4C | zp4D) !== 0`.
- **`$99E9` ($82):** `INC $5B / LDX #$4C / LDA #$01 / JSR $840C / ORA / BNE loop /
  STA $60 / INC $1B / stage 0|3 -> sfx $3F / JMP $9A5E`. Port matches line for line;
  the `STA $60` writes A=0 (the ORA result of two zeros), port sets `spawn.z60 = 0`.
- **`$9A0E` ($81):** `LDX $17 / LDA $19 / CMP #$06 / BNE / [stage6] / LDA $9A35,X /
  STA $4D / LDA #$00 / STA $4C / INC $5B / INC $1B / LDA #$01 / STA $62 / JSR $99DF /
  JMP $9A5B`. Port matches; throws on $19==6 (unreachable). The BNE $9A25 at $9A1C
  (stage-6 path) is the only path that stores $CA in $4C; ported as a throw.
- **`$9982` ($84):** `CMP $9A3D,X / BEQ $99BA (despawn) ; else advance`. BEQ polarity
  verified (equal -> despawn). Advance: packets $1E/$05, $2D:=1, `$A8:=9 / JSR $A527`,
  `$0315:=$98 / $0335:=$80 / $0375:=$F0`, INC $5B, INC $1B (->$85), `$5E:=#$3F`.
  Port matches byte for byte (the 8 absolute stores map to the port's separate arrays).
- **`$997E` ($85):** `INC $5B / BNE $99B7`. Two instructions. Port: INC $5B then
  mode5Body. The dead fall-through into $9982 is NOT ported (cited to $9658). Correct.
- **`$99C0` ($83):** `INC $1B / LDA $19 / CMP #$05 / BCC / [stage>=5 shortcut] / INC $5B /
  LDA #$02 / STA $62 / JSR $99DF / JMP $9A5E`. Port matches; throws on $19>=5.
- **`$994A` (despawn sweep):** `LDX $3E / CPX #$D0 / BCC RTS / LDX $5E / BMI RTS /
  DEC $5E / 8x STA $0600..$05C0,X / CPX #$14 / BCS RTS / clear $010C,$012C,$030C,X`.
  All 8 collision columns map correctly (`coll[$100+x]`..`coll[$0C0+x]`); the `$D0`
  guard, the `BMI` cursor check, the `DEC $5E` (old cursor in X), and the `$14`
  object-clear bound all match. Port faithful.

**VERDICT (instruction level): SOUND.** No transcription defect found in any W24
routine. Every branch polarity, every constant, every array base matches the ROM.
This is the same conclusion the byte-check in `24-impl` reached, independently
re-derived here from the raw bytes.

## Adversarial port-side checks (`out/w24qa/adversarial.mjs`, 19/19 OK)

Driven via `nmi()` directly (no Mesen). Each tries to break a W24 claim.

- **A. `$82` countdown duration per rank, DYNAMIC (full run).** Seeded at `$81`
  with each rank, stepped until `$1B` left `$82`:
  - rank 0 -> **768** frames (RANK_CD[0]*256 = 3*256) OK
  - rank 1 -> **768** OK
  - rank 2 -> **1024** (4*256) OK
  - rank 4 -> **1280** (5*256) OK
  **This closes the plan's rank-4 gap on the port side**: `24-plan` §10 risk 2
  called 1280 "table-derived, unmeasured -- no powered endchain run exists". It is
  now MEASURED on the port (the table row reads correctly and the machine runs the
  full 1280 frames). It is still NOT cartridge-measured at rank 4 -- no powered run
  reaches the boss page. Exact at the port's table read; cartridge rank-4 duration
  is table-derived. Stated per RULE 2.

- **B. lag frame mid-`$82`.** `nmi(lag=true)` returns false and does NOT decrement
  `$4C:$4D`; the next normal frame decrements normally. The countdown pauses one
  frame per lag, as the cartridge's `$8073` bail does. OK (3/3).

- **C. dying mid-`$82`.** If `$C1D6` fires inside `$82`'s `mode5Body` (sets
  `$0100:=2`, `$1B:=$A0`), the next frame's `$96A5` ladder sees bit 5 and runs
  `dyingArm`. The countdown ABORTS; `$1B` goes `$82 -> $A0`, `$4C` (the death
  countdown, seeded 120) decrements. The port follows correctly. OK (2/2). This is
  the "dying mid-countdown" edge case from the brief.

- **D. despawn sweep edges.**
  - cursor `$00 -> DEC -> $FF` (underflow); next frame `BMI` (`$FF >= $80`) skips
    the sweep. OK.
  - the old cursor (0) DID clear its column on the underflow frame. OK.
  - `$3E=$CF` refuses the sweep; `$3E=$D0` runs it (BCC is `<`, not `<=`). OK.
  - the `$84` advance path seeds `$5E := #$3F` (the IMMEDIATE, not register `$3F`
    which is `$0D` there). OK -- this is the trap the plan §6 flagged, and the port
    has it right.

- **E. `$96FB` game-over arm.** `$B0 != 0` (jingle) -> `$4C` held, `$5B` INC'd;
  `$B0 == 0` -> `$4C` counts down; `$4C == 0` (solo) -> throws at `$9751`. OK (4/4).

## Cartridge `$96FB` window, measured off `out/w24qa/reach-zig.json`

The zig run (shield poke `$46=5`, labeled intervention -- off-distribution but the
game-over it reaches is the ordinary "lose all lives" outcome) entered `$C0` at
f3846 and held for **397 frames** (f3846-f4242). At entry: `$4C=$78` (120),
`$0A=$00` (P1 dropped at `$97F9`), `$5B=$00`. The window decomposes as
**~277 frames of `$B0` jingle hold** (`$AF` owns pulse 1; `pulse1Dur != 0`) **+
120 frames of `$4C` countdown** = 397, exactly the structure `24-impl` ported.
4 deaths (`$A0` entries) preceded it; 1 entry into `$C0`. This matches the plan's
"794 executions across two survivor runs (397+397)" -- each ordinary loss sits in
`$96FB` for ~397 frames.

## Game-over (`$96FB`) IN-SITU cartridge comparison -- DONE-WHEN #3 CLOSED

The implementer's done-when #3 ("the `deep-survivor`/`deep-autofire` `$96FB`
windows compare field-exact") was NOT reached in `24-impl` (no `scen/` dump).
Closed here. `compare.mjs` truncates at `$1B == $C0` (it is not in
`MODELLED_1B`), so the standard harness CANNOT compare the window; I wrote a
focused QA harness (`out/w24qa/cmp-gameover.mjs`) that seeds the port from the
cartridge's RAM and compares `$1B/$4C/$5B/$0A/$0100` frame-by-frame.

Cartridge run: `200:,10:S,190:,4000:U` (hold U -- an ordinary "lose all lives"
run, ON-distribution, NO intervention). `$C0` entered at f3939; seeded at f3934
(still `$A0`, `$4C` death-countdown at 4, lives `$20=0`). Compared f3935-4336.

**402 frames compared, 0 field-divergences.** The port reproduces the whole
sequence field-for-field:

```
f3935-3938  $1B=$A0 dying, $4C 3->2->1->0 (the death countdown), $0A=$01
f3939       $1B=$C0 GAME OVER, $4C=$78 (120, the continue timeout), $0A=$00
            -- this is $97F1 (enterGameOver): lives $20 went $00 -> $FF (BMI)
f3940-4215  $1B=$C0, $4C HELD at 120  -- the $B0 jingle hold ($96FD gate,
            pulse 1 DUR != 0 while game-over jingle $AF owns it): 276 frames
f4216-4335  $1B=$C0, $4C 119->0       -- the continue-timeout countdown (120 fr)
f4336       $4C==0 -> port throws $9751 (continue expired, restart to title)
            -- the cartridge does the same (mode := 0)
```

The 276-frame jingle hold is the SOUND DRIVER being correct: `$96FD`'s gate on
`$B0` (`pulse1Dur`) holds for exactly as long as the cartridge's `$AF` jingle
owns pulse 1, on BOTH sides. The `$97F1` entry, the `$4C=$78` seed, the `$0A`
clear and the `$4C` decrement all match the cartridge every frame.

(The earlier zig run -- shield poke `$46=5`, labeled intervention -- entered
`$C0` at f3846 with the same 397-frame hold and the same `$4C=$78` seed, so the
two runs agree on the window's shape, as they should.)

## What I could NOT reach (RULE 2)

- **The boss page (`$0C00`) in situ on the cartridge.** Stage 0 `bossPage` = `$0C`
  = 3072 px. At the measured 0.5 px/frame scroll rate that is game frame ~6454 from
  play start (310). No button script in the tree survives that long: the deepest
  measured run (`deep-powered`, shield `$46=5` held -- a labeled intervention) dies
  at scroll `$0A64` (frame ~5530) from TERRAIN (`$C2C1`), which the shield does not
  prevent. I tried three further strategies here, all with the shield poke (labeled):
  a "zig" (alternating RUA/RDA) -- died at `$04B9`; a ceiling hold (`6700:U`); a
  floor hold (`6700:D`, maxScroll `$03E5`). None reached `$81`. The shield prevents
  enemy-contact death (`$C1BD-$C1CA` BPL skips it) but NOT terrain death (`$C2C1` is
  a separate route that ignores `$46`). What I did NOT try: poking `$0100:=1`
  (force the ship alive) every frame -- that prevents the death ROUTINE's effect but
  `$C1D6` still sets `$1B:=$A0`, so the state machine still enters dying; and a
  collision-map wipe (`$0500-$06FF := 0` held) would break the terrain streamer's
  own writes and the comparison with it. So: **the `$80 -> $81 -> $82 -> $83 -> $84
  -> $85` traverse is NOT cartridge-verified in situ this wave.** It is port-verified
  (the 19 checks above + the implementer's 17/18 mutation-verified unit tests) and
  the cartridge `$1B` timeline is hook-proven (`throwaudit-endchain.json`: `$82` 768
  fr, `$84` 512 fr, `$85` 1101 fr -- the durations the port reproduces). The gap is
  the per-frame FIELD comparison through the countdown + despawn crawl, which needs a
  cartridge run that reaches the boss page. The instruction-level byte check (above)
  found no defect.

- **`$85` field-exactness.** W26 by design (the boss handler `$B914` is unported;
  the port throws on the boss type the frame `$84`'s advance path creates it).

## Findings

### 1. (none, correctness) No defect in the W24 port.

The sub-state machine is SOUND. Every routine is byte-faithful to the ROM
(verified by hand-decode above); 19 adversarial port-side checks pass; the
`$96FB` game-over window is field-exact against the cartridge (402 fr, 0 div);
the rank-4 `$82` countdown (1280 fr) is dynamically verified on the port,
closing the plan's "table-derived, unmeasured" gap on the port side.

### 2. (moderate, tooling) `compare.mjs`'s `MODELLED_1B` does not include `$81-$85` or `$C0`.

`compare.mjs` line ~83: `MODELLED_1B = new Set([0,1,2,3,4,0x80,0xA0])`. After W24
the port ALSO models `$81-$85` (the timer/boss-page/despawn arms) and `$C0`
(game over). The harness still TRUNCATES the window at the first frame `$1B`
leaves that set, so even with a recorded `scen/` artifact the standard gate
cannot compare the W24 sub-states. This is why the implementer's done-when #1/#2
(the endchain field comparison) and #3 (game-over) were unreachable through the
standard harness -- I had to write `cmp-gameover.mjs` to compare `$96FB` at all.

**Recommendation for whoever owns `compare.mjs` (not src/, so not read-only):**
add `$81,$82,$83,$84,$85,$C0` to `MODELLED_1B`. The endchain and game-over
scenarios can then be field-compared through the standard gate. (The
`$80`-body convergence still works: `$81-$85` all run `mode5Body`, so the 1022
fields are produced; `$C0` runs `mode5Body` during the `$B0` hold.)

### 3. (minor, tooling) No `scen/endchain.json` and no boss-page-reaching script in the tree.

The plan's done-when #7 wanted a `scen/endchain.json` field dump. None exists,
and the `throwaudit-endchain.json` hook recording that drove the timeline is an
ad-hoc `--script` run whose script is NOT in the tree (and whose frame-1338 boss
page implies a faster-than-0.5px/frame scroll that no normal button script
reproduces -- I could not reconcile it; the hook TIMING is valid for the `$1B`
sequence but the run's provenance is unclear). A boss-reaching run needs either
a script that survives to `$0C00` (not found here) or a `$0100:=1`-style invuln
poke on both sides (labeled; would let the field comparison run but produces an
impossible game-state -- valid for COVERAGE of the transitions, not for normal
spawn timing past the death).

## Verdict

**SOUND.** No correctness defect found. The W24 port is byte-faithful and the
`$96FB` game-over arm is field-exact in situ (402 fr, 0 div). The `$80->$85`
traverse is port-verified and cartridge-hook-proven but NOT cartridge
field-compared (the boss page is unreachable from a button script); the
instruction-level byte check and the 19 adversarial checks found no defect. The
rank-4 `$82` countdown (1280 fr) is now port-measured. Two tooling gaps
(`MODELLED_1B`, the missing endchain `scen`) are named for the owner of
`compare.mjs`/W28.

status: DONE


Findings written as they arrive. RULE 4: every check seen RED before GREEN.
RULE 2: absence claims cite what was tried, never asserted.

## Recon (read before touching Mesen)

- Stage 0 `bossPage` = `$0C` (camera `$3F = $0C` = scroll `$0C00` = 3072 px),
  read from `assets/terrain/stages.json` (exported from `$9A3D`, byte-verified).
- Stage 0 `rankCountdown` = `[3,3,4,4,5,5,6,6]` (`$9A35`). So `$82` duration at
  rank R is `rankCountdown[R] * 256` frames: rank 1 -> 768, rank 4 -> 1280.
- `compare.mjs`'s `MODELLED_1B` = `{0,1,2,3,4,$80,$A0}` -- it does NOT include
  `$81-$85` or `$C0`. So the standard harness TRUNCATES the window at the first
  `$81` frame: the W24 sub-states are ported but NOT field-compared by the
  existing harness even with a recorded artifact. This is the core gap.
- `throwaudit-endchain.json` (implementer's ad-hoc run, 6000 frames) `$1B`
  histogram, re-read here off the artifact:
  `{0:283,1:1,2:1,3:1,4:23, $80:2676,$81:1,$82:768,$83:1,$84:512,$85:1101,
   $86:513, $90:1, $A0:118}`. The implementer's worklog quoted only the
  `$80..$86`+`$90` subset and omitted the intro (0-4) and dying ($A0); all
  present here.
