# Wave 24 PLAN - the play sub-state machine (jt_$982F) and the game-over arm

status: DONE (plan; ARCHITECT, READ-ONLY - no src/ edits, no commit)
architect, 2026-08-02

Consolidates `24-recon-substate-machine.md` (DONE) into an implementer wave
brief. Every DONE-WHEN below is a MEASUREMENT, drawn from the W24 entry of
`20-plan-completeness.md` §3 and refined with the recon's frame-confirmed
numbers. The implementer owns `src/nmi.js` (`playArm`, the `$80` exit), the
new dispatch + timer arms, `src/flow.js` only if the 4 intro-shared arms
delegate, and one tool edit (`export_assets.py`) for the missing `$9A35` table.

The denominator is settled: **16 play sub-states at jt_$982F; 1 ported; 15
throw.** The stage-1-clear critical path through the table is **7 states**
(`$80`→`$81`→`$82`→`$83`→`$84`→`$85`→`$86`, then it leaves for `$90`→`$96CF`).
W24 lands 6 of those 7 bodies plus the `$80` exit; **`$86` stays a throw
(W27 - the exit).** The game-over arm `$96FB` (the `$1B & $40` ladder arm, not
a jt_$982F entry) also lands in W24.

> **CORRECTION TO THE RECON (measured here, RULE 1).** The endchain run is
> **not zero-death** and is **not stage-0-only**: its `$1B` gate histogram
> carries `160 ($A0): 118` frames (one death) and `$19` flips 0→1
> (`{0:4235, 1:1765}`). It cleared stage 0, advanced to stage 1, played ~1600
> frames there and died. The recon's §5 table wrote `$80: 2676 frames,
> 310-1338` - that conflates the **cross-stage histogram total** (`128:2676`,
> stage-0 play + stage-1 play before the death) with the **stage-0 frame
> range** (f310-1338 = ~1029 frames). The W24 done-when is **stage-0-only**;
> every frame range and every non-`$80` count below is stage-0 and correct.
> The `128:2676` histogram value is real but spans two stages - do not quote it
> as the stage-0 `$80` duration.
>
> **ARCHITECT RE-VERIFIED 2026-08-02** against `throwaudit-endchain.json`:
> `$19` gate `{"0":4235,"1":1765}` (stage advance at f4235 ✓); death hook `C1D6`
> `n:1, first:5882` (in stage 1, after the f4235 advance ✓); `$A0`=118 frames
> (f5882–5999 ✓); `$96CF` `n:1, first:4235` (one stage advance ✓). The
> cross-stage arithmetic closes: `$80` 2676 = 1029 (stage 0, f310–1338) + 1647
> (stage 1, f4235–5882). All stage-0 hook `first`-frames below match the file.
> The recon's three MUST-CONFIRMs ((a) `$9658`, (b) `$98FD` byte count, (c) the
> 14-key histogram) are CLOSED - see §5, §4 and §2 respectively.

---

## 1. The denominator and the dispatch

jt_$982F (`$982F`, 32 bytes, 16 word entries; proven complete by `$984F
st_984F` abutting at line 2532). Reached only from `$982A LDA $1B / JSR $83E4`,
which is the bit-7 arm of the `$96A5` ladder. `$83E4` opens `ASL A`: the `$80`
high bit leaves as carry-out and is dropped, so the index is exactly
**(low nibble of $1B) << 1**, 0–15. The port already gets this (`playArm` tests
`substate !== 0x80`); W24 generalises it to the real table.

The port today (`src/nmi.js` `playArm`, line 377) refuses any `substate !==
0x80` with a throw, and refuses `$80`'s own exit (`$9A56`, the boss-page
transition) with a throw. Both are W24 work items.

---

## 2. THE MEASURED `$1B` TIMELINE - the primary DONE-WHEN, reproduced to the frame

Read out of `tools/oracle/out/throwaudit-endchain.json` (6000-frame cartridge
run that cleared stage 0, advanced to stage 1 and died there; `maxScroll` =
3584 = `$0E00`). The frame ranges below are **stage-0-only**, read from the
exec hooks' `first` frames (which fire once per stage-0 transition). The `$1B`
gate histogram over the WHOLE run is `{0:283, 1:1, 2:1, 3:1, 4:23, 128:2676,
129:1, 130:768, 131:1, 132:512, 133:1101, 134:513, 144:1, 160:118}` (**14
keys, sum exactly 6000** - re-verified against `throwaudit-endchain.json`;
keys `1`/`2`/`3` are one-frame boot transients) - note `128` = 2676 spans
BOTH stages and `160` = 118 is a stage-1 death; only the stage-0 segment of
`$80` (f310-1338) is W24's concern.

```
$1B   state    frames        game-frame range        role                          W24?
----  ----     -----------   --------------------    ----------------------------   ----
$80   $9A4D    ~1029         310 - 1338              scroll to boss page $0C        body PORTED; $9A56 exit LANDS
$81   $9A0E    1             1339                    countdown setup               LANDS
$82   $99E9    768           1340 - 2107             THE 768-frame countdown        LANDS
$83   $99C0    1             2108                    transition                    LANDS
$84   $9982    512           2109 - 2620             THE 512-frame boss-page scroll LANDS (incl. despawn $994A)
$85   $997E    1101          2621 - 3721             THE BOSS FIGHT                LANDS (INC $5B only; handler/death = W26)
$86   $9904    513           3722 - 4234             stage-end                     THROW (W27)
$90   ->96CF   1             4235                    next stage (leaves the table) THROW (W27)
```

The numbers that make the timeline exact, all confirmed:

- **`$80` exits at `$9A56` on frame 1338** when `$3F` (camera page) reaches
  `$9A3D[$19]` = `$9A3D[0]` = **`$0C` = 3072 px**. (`$9A4D` does `CMP $9A3D,X /
  BCC $9A5B`; the port already compares `cam.hi >= stage.bossPage`.)
- **`$82` is EXACTLY 768 frames.** `$81` (`$9A0E`) sets `$4D := $9A35[$17]`,
  `$4C := 0`; `$82` (`$99E9`) is a 16-bit decrement of `$4C:$4D` via `$840C`
  until both are 0. This run is **unpowered: rank `$17` = 1** the whole
  countdown, `$9A35[1]` = `$03`, so `$00:$03` = **768**. CONFIRMED.
- **`$84` is EXACTLY 512 frames.** During `$82` the camera is FROZEN: `$99E9`
  does `INC $5B`, and the camera step `$98EE` is gated on `$5B == 0` inside
  `$9A5E` (`$9A9C LDA $5B / D0 03 BNE $9AA3` skips `$9AA0 JSR $98EE`). So `$3F`
  holds at `$0C` through the countdown. `$84` then crawls at 0.5 px/frame
  (`camera.stepSub` = `$80`); 512 frames × 0.5 px = 256 px = exactly one page,
  taking `$3F` from `$0C` to `$0D`. Each of those 512 frames `$3F == $0C`
  (`$9A3D[0]`), so `$9982`'s `BEQ $99BA` runs the despawn sweep `$994A` and
  stays. The frame `$3F` becomes `$0D` (≠ `$0C`) the spawn path fires once and
  `INC $1B` → `$85`. The arithmetic is self-consistent.
- **`$85` entry is frame 2621.** `$1B` = `$85`. `$85`'s own code is one
  instruction (`INC $5B`); it exits 1101 frames later via the **boss-death
  `INC $1B`**, which lives in the boss death chain (`$B914`, W26) - NOT in
  `$997E`. `$997E` has no `$1B` writer.

**PRIMARY DONE-WHEN:** drive the port through the endchain button script; the
port's `$1B` byte matches the timeline above **to the frame** for the states
W24 owns (`$80` f310–1338, `$81` f1339, `$82` f1340–2107, `$83` f2108, `$84`
f2109–2620, `$85` entry f2621) - all **stage-0**; the stage-1 segment (where
`$80` re-runs and the run dies) is out of scope. The 1022-address field
comparison is **exact through the end of `$84` (frame 2620)** - the countdown
with the frozen camera and the 512-frame despawn crawl. **`$85` field-exactness
is W26's done-when, not W24's** (see §7): on frame 2621 `$84`'s advance path
creates the boss object and the boss handler (`$B914`) is unported, so the
comparison window ends at `$85` ENTRY with `$1B` matched; whether the port
throws on the boss type that frame or diverges is W26-coupled and explicitly
out of scope.

> TOOLING NOTE. `throwaudit-endchain.json` is a HOOK recording, not a per-frame
> field dump. There is **no `scen/endchain.json` and no `endchain` entry in
> `scenarios.json`** today (only `deep-powered` is). The DONE-WHEN therefore
> requires the implementer to **record the endchain run as a `scen/` field
> dump** (scen.py, the same RUA-hold-from-~5000 boss-kill script the sweep map
> proved reachable) **and add the compare scenario**, comparing frames 310–2620
> against the cartridge. The hook recording already proves the `$1B` timeline;
> the `scen` dump is what makes the field comparison machine-checkable.

---

## 3. Arm-by-arm - what LANDS and what stays a LOUD THROW

### LANDS in W24

| arm | `$1B` | target | what W24 ports |
|---|---|---|---|
| dispatch | - | jt_$982F | Replace `playArm`'s single `$80` test with the real 16-entry table; every arm not implemented below throws loudly **with its ROM target**. |
| `$80` exit | `$80` | `$9A4D` | Body already ported. **Port the `$9A56` arm**: `$1B := $9A45[$19]` (all `$81`), then `$9A5B` (= `setBgm`, already ported). The convergence at `$9A5B` (BCC-taken "keep playing" vs the `$9A56` advance) is two roads, one tail - NOT a fall-through. |
| `$81` | `$81` | `$9A0E` | `X=$17`; stage≠6 (the port loads one stage, so the `$19==6` special case at `$9A12` is unreachable - throw on `$19==6` rather than skip); `$4D := $9A35[$17]`, `$4C := 0`; `INC $5B`; `INC $1B`; `$62 := 1`; clear `$63-$6F` (`sub_$99DF`); `JMP $9A5B`. |
| `$82` | `$82` | `$99E9` | `INC $5B`; 16-bit decrement `$4C:$4D` via `$840C` (`X=$4C`, A=1); when `$4C\|$4D == 0`: `STA $60` (zero), `INC $1B`; stage 0 or 3 → `JSR $EC1E` with A=`$3F` (`loc_$9A06`); `JMP $9A5E`. |
| `$83` | `$83` | `$99C0` | `INC $1B`; `$19 >= 5` → `$1B := $86` (stage 5 also fires sfx `$AC`); else `INC $5B`, `$62 := 2`, clear `$63-$6F` (`$99DF`); `JMP $9A5E`. (Stage≥5 is unreachable in the port; throw on it.) |
| `$84` | `$84` | `$9982` | `CMP $9A3D,X`; **BEQ** (`$3F == boss page`) → `JSR $994A` despawn + stay; **else** the advance path (`$998B`): two HUD packets (`$1E`,`$05` via `$85E8`), `$2D := 1`, allocate via `$A527` with `$A8 := 9`, write the boss object (`$0315 := $98`, `$0335 := $80`, `$0375 := $F0`), `INC $5B`, `INC $1B` → `$85`, `$5E := #$3F`; `JMP $9A5E`. **Includes the despawn sweep `sub_$994A`** (§6). |
| `$85` | `$85` | `$997E` | **`INC $5B` ONLY.** The `$9980 BNE $99B7` is taken and ports as `JMP $9A5E`. The fall-through is DEAD (§5) and must NOT be ported. The boss-death `INC $1B` is W26. |
| `$96FB` | `$A0`+ | `$96FB` | The game-over arm (the `$1B & $40` ladder arm, line 326 of nmi.js). Port the `$B0` gate (wait for the game-over jingle: `$B0` = pulse-1 duration counter, `src/sound.js`) and the timeout/continue path. See §8. |

### STAYS a LOUD THROW in W24 (the dispatch throws, carrying the ROM target)

| arm | `$1B` | target | why it throws / where it goes |
|---|---|---|---|
| `$86` | `$86` | `$9904` | **W27 (the exit).** Stage-end: despawn on `$1C==$93`; `CMP $98FD,X`; `$39==0` → `$1B := $90` (next stage), else `INC $19`, `$1B := $8E` (warp). 513 hits in the endchain run but its port is W27. Throw naming `$9904`/W27. |
| `$87`-`$8A` | `$87`-`$8A` | `$9B3E`/`$9BED`/`$9C12`/`$9C1E` | **Routine bodies already ported** via the intro dispatch jt_$96C5 (`flow.js` introReset/introPackets/introHud/introMeter). 0 hits in the endchain run - off the stage-1 clear path. **May delegate to the existing intro code** (cheap) OR throw "reached via jt_$982F arm `$87`-`$8A`; delegate to `introStep` or leave for the stage-transition wave". Default: throw; delegation is the implementer's option and is unvalidated either way (0 hits). |
| `$8B`-`$8D` | `$8B`-`$8D` | `$988C`/`$98DD`/`$98E5` | 0 hits; off the stage-1 clear path. `$8D` (`$98E5`) is reset-to-intro (`$1B := 0 / JMP $9B3E`). Throw. |
| `$8E`,`$8F` | `$8E`,`$8F` | `$984F` | **W27 (the warp route).** Throw naming `$984F`/W27. |
| `$96CF` | `$90`+ | `$96CF` | The `$1B & $10` next-stage ladder arm. **W27.** Already a throw (nmi.js line 320). |

---

## 4. THE TABLES (byte-verified off `rip/prg.asm` line 2859)

```
$9A35:  03 03 04 04 05 05 06 06     <- rank countdown, X=$17 (rank). $82 = byte × 256.
$9A3D:  0C 0C 0C 0C 0B 0B 0C 02     <- boss-page threshold, X=$19 (stage). [0]=$0C=3072px
$9A45:  81 81 81 81 81 81 81 81     <- $80->$81 next-state, X=$19. Always $81.
$98FD:  0E 0E 0E 0E 0D 0C 0D        <- stage-end threshold, Y=$19. [0]=$0E=3584px
```

`$9A35` is one 16-byte block split across two names: head (rank countdown) and
tail (`$9A3D`, boss page). They never collide (rank vs stage index disjoint
halves).

**EXPORT STATUS (measured against `assets/manifest.json` 2026-08-02):**
- `stage.bossPage` (`$9A3D`) - **EXPORTED as 7 values** `[12,12,12,12,11,11,12]`
  (`tables.stage.bossPage.values`, len 7), read by the port as
  `res.stage.bossPage`. The 8th ROM byte `$02` at `$9A44` is beyond stage 6 and
  is NOT shipped. (This corrects recon §10, which said the manifest "shows 8
  entries" - it ships 7.) **The ROM column is 8 bytes**; the manifest drops the
  unused 8th. `$9A3D[0]=$0C`=3072 px (the `$80`→`$81` exit).
- `stage.endPage` (`$98FD`) - **EXPORTED as 7 values** `[14,14,14,14,13,12,13]`
  (`tables.stage.endPage.values`, len 7). **ARCHITECT-CLOSED (recon
  MUST-CONFIRM (b)): `$98FD` is exactly 7 bytes - `st_9904` abuts at `$9904`
  (`$98FD+7`, line 2656); no 8th entry, no shift.** Not yet READ by the port
  (`$86`/`$9904` is a W27 throw) but the data is in the tree.
- **`$9A35` (rank countdown, first 8 bytes `03 03 04 04 05 05 06 06`) - NOT
  EXPORTED** (no `stage.rankCountdown` key exists). This is the load-bearing
  data for `$82`. **W24 must add it** to `export_assets.py` (e.g.
  `stage.rankCountdown`) and regenerate the manifest; a unit test pins the 8
  bytes.
- `$9A45` - NOT exported, but trivially the constant `$81` for every stage. A
  literal is honest; an export is cheaper to defend. Implementer's call.

---

## 5. THE DEAD `$997E` FALL-THROUGH - must NOT be implemented

`st_$997E` (`$85`) is two instructions:

```
997E  E6 5B      INC $5B
9980  D0 35      BNE $99B7      ; taken -> JMP $9A5E (continue)
                               ; NOT taken -> fall into st_$9982 ($84)
```

This is an **ABSENCE proof from the listing, not just the 0/1101 empirical
sample** (the endchain run reproduced 1101 `$85` frames, 0 fall-throughs):
`$5B` is zeroed EVERY mode-5 frame at `$9658 STA $5B` (line 2221, inside
`stagePlay`) BEFORE the `$96A5` ladder - and therefore before `$997E`. So at
the `INC`, `$5B` is always 0 → becomes 1 → `BNE` (test ≠ 0) is ALWAYS taken.
The fall-through requires `$5B` to wrap `$FF`→`$00` on the `INC`, impossible
when `$5B` was just cleared. Every entry to `$997E` passes through `$9658`.

> **ARCHITECT-CLOSED (recon MUST-CONFIRM (a)).** Verified against
> `rip/prg.asm`: `st_9650` (line 2216) runs `9658: 85 5B STA $5B`
> unconditionally (no branch skips it), and `st_9650` IS `jt_80D4[5]` - the
> mode-5 arm of the `$80D1` mode dispatch (`.word $9650 ; [5]`, line 147). So
> `$5B` is cleared on every mode-5 frame before `$997E`; the dead-branch claim
> is structural, not just the 0/1101 sample. The implementer need not re-confirm.

Port `$85` as **`INC $5B` then `JMP $9A5E`**. Record the dead branch in a
comment citing `$9658`. Implementing the fall-through would re-fire `$9982`
every 256 frames and **re-spawn the boss every 256 frames** (the §6 hazard in
`20-plan-completeness.md`). It does not, because of `$9658`.

---

## 6. THE DESPAWN SWEEP `sub_$994A` - keep the `$3E >= $D0` guard

Called from `$9982`'s `BEQ $99BA` (when `$3F ==` boss page) and from `$9904`'s
`$1C==$93` arm (`JSR $994A` at `$9923`, the latter is W27). Body (line 2709):

```
994A  A6 3E   LDX $3E / CPX #$D0 / BCC $997D      ; THE GUARD: only when $3E >= $D0
9950  A6 5E   LDX $5E / BMI $997D                   ; cursor valid
9954  C6 5E   DEC $5E                               ; advance the despawn cursor
9958-996D  clear 8 object-RAM columns at slot $5E ($0600/$0640/.../$05C0,X)
9970  E0 14   CPX #$14 / BCS $997D                  ; old cursor >= $14: skip status clear
9974-997A  clear $010C,$012C,$030C at the slot
997D  60     RTS
```

- **KEEP the `$3E >= $D0` guard** (`CPX #$D0 / BCC`): the sweep only runs in
  the last ~¼ of a scroll page. `$3E` is the scroll LOW byte; at 0.5 px/frame
  the sweep is armed for the tail of `$84`.
- **The immediate `$5E := #$3F`** is set at `$99B3` (`A9 3F LDA #$3F` - the
  CONSTANT `$3F`, not the register) on the `$84`→`$85` transition, seeding the
  cursor. (`$5E` has two writers - `$99B5`, `$9C0F` - and zero readers in the
  PRG; it is the sweep's own cursor, confirmed by `src/flow.js:155`.)

---

## 7. The `$84` boss spawn couples to W26 - scope boundary

`$84`'s advance path (`$998B`) creates an object: `JSR $A527` with `$A8 := 9`,
then absolute stores `$0315 := $98`, `$0335 := $80`, `$0375 := $F0` (slot 9:
type `$98`, status `$80`, X `$F0`). `$98`/`$99` are the boss types (`20-plan`
W26: head `$B914` + body `$B913`, three-slot layout `$030B,X = $99`). **W24
ports the CREATION; the boss per-frame handler (`$B914`) and the death chain
(`$85`→`$86` `INC $1B`) are W26.** Consequence, stated plainly:

- The endchain field comparison is **exact through the `$84` despawn crawl
  (frame 2620)**.
- On frame 2621 the boss object exists in RAM but its handler is unported. The
  port **throws loudly** on the boss type (if routed through the `$AE1C`
  dispatch's unported entry) OR the fields diverge. Either is correct and
  expected; `$85` field-exactness is **W26's done-when, not W24's**.
- The W24 measurement at frame 2621 is the **`$1B` value** (`$85`) matching the
  cartridge - that is what "reproduces the timeline to … `$85` entry" means.

The implementer should confirm at port time how `$98`/`$99` route through the
enemy update sweep (`$ADAB`), so the throw (if any) is the expected one and
carries the ROM address.

---

## 8. THE GAME-OVER ARM `$96FB` - the secondary DONE-WHEN

`$96FB` is the `$1B & $40` ladder arm (nmi.js line 326), NOT a jt_$982F entry.
**Re-summed across all 11 `throwaudit-*.json` recordings (50,100 frames):
`$96FB` executes 794 times** - 397 in `deep-survivor` (first@3380) + 397 in
`deep-autofire` (first@3968). `$97F1` (lives went negative) executes 2 times.
This is the **highest-traffic unported arm in the whole port**: two ordinary
"lose three lives" runs each sit in `$96FB` for ~400 frames. It needs nothing
exotic - a player who is not very good.

`$96FD` gates both the timeout and START on `$B0` (pulse-1's duration counter,
`src/sound.js` - "wait until the game-over jingle finishes"); neither the
timeout arm nor the continue screen is ported today (the current throw names
both).

**SECONDARY DONE-WHEN:** the `deep-survivor` and `deep-autofire` recordings
(6000 frames each, already in the tree as hook dumps) drive the port into
`$96FB` and the **`$1B` value and the 1022 fields match the cartridge
frame-for-frame across the `$96FB` windows** (the `$B0`-gated hold + the
timeout/continue transition). This requires the same scen-dump/scenario
treatment as the endchain run (§2 tooling note) for whichever of the two the
implementer picks as the machine-check; both are recorded.

---

## 9. Consolidated DONE-WHEN (every one a MEASUREMENT)

1. **The endchain `$1B` timeline (stage 0).** The port, driven through the
   endchain script, reproduces the timeline to the frame for `$80` (f310–1338,
   ~1029 fr in stage 0, exit at `$9A56` when `$3F` reaches `$0C`), `$81`
   (f1339, 1 fr), `$82` (f1340–2107, **768 fr** = `$9A35[1]`×256 at rank 1),
   `$83` (f2108, 1 fr), `$84` (f2109–2620, **512 fr** at 0.5 px/frame = 256 px
   = one page, despawn `$994A` running every frame), and `$85` ENTRY (f2621,
   `$1B` = `$85`). (Stage 0 ends at `$90`/f4235; the stage-1 segment and the
   death are out of scope.)
2. **Endchain fields.** 1022-address comparison **exact f310–2620** (the
   frozen-camera countdown + the despawn crawl). `$85` field-exactness is W26.
3. **Game-over.** The `deep-survivor`/`deep-autofire` `$96FB` windows compare
   field-exact; `$96FB` runs 794× across the 11 recordings (397+397), `$97F1`
   2× - the port reproduces the `$B0`-gated hold, not a throw.
4. **The dispatch is real.** `playArm` dispatches all 16 arms; the 8 throwing
   arms (`$86`, `$8B`-`$8F`, and `$87`-`$8A` unless delegated) throw **with
   their ROM target** (`$9904`/`$988C`/`$98DD`/`$98E5`/`$984F`/`$9B3E`/`$9BED`/
   `$9C12`/`$9C1E`). A quiet return is a defect.
5. **`$997E` is dead.** `$85` ports as `INC $5B` → `JMP $9A5E`; the fall-through
   is NOT implemented and is cited to `$9658`.
6. **Export.** `export_assets.py` emits `$9A35` (8 bytes `03 03 04 04 05 05 06
   06`); a unit test pins it. `$9A3D`/`$98FD` already exported; `$9A45` = `$81`.
7. **Tooling.** A `scen/endchain.json` field dump + `endchain` scenario exist
   and compare f310–2620 green; the `$96FB` scenario likewise for one survivor
   run. (The hook recordings prove the timeline; the `scen` dumps make the
   fields machine-checkable.)
8. **The gate.** `node --test` and `test-all.mjs` GREEN, **0 skipped**; census
   unchanged at 19/42 dispatch entries (W24 ports no enemy handler - it ports
   the STATE machine). The `deep-powered`/`deep-page4` scenarios stay green
   (regression - W24 changes `playArm`, which they exercise).

Every DONE-WHEN must be SEEN TO FAIL: the implementer breaks the `$82` count
(`$9A35[1]` $03 → $04: 768 → 1024 frames, red), the `$84` despawn guard
(`$3E >= $D0` → `$D1`: sweep misfires, red), the `$96FB` `$B0` gate, and
restores each with SHA-256 verified both ways (RULE 4).

---

## 10. RISKS

1. **The fall-through trap.** Three fall-throughs in this region (recon §9),
   read past every one:
   - **`$997E` → `$9982`: STRUCTURALLY DEAD** (§5). Must NOT be implemented.
   - **`$9BED` → `$9BF0`: REAL** - but that is arm `$88`, off the stage-1 clear
     path (0 hits), already ported via `introPackets`. If `$88` delegates, the
     fall-through is already handled.
   - **`$9A4D`'s `$9A56` → `$9A5B`: convergence**, not a trap (both paths land
     at `setBgm`).
   - Verified NOT traps: `$99C0`→`$99D3`, `$9A0E`→`$9A25`, the `JMP $9A5E`/
     `JMP $9A5B` exits. Every table entry ends in `JMP $9A5E`/`$9A5B` or RTS;
     no other accidental drop-into-the-next-routine.
   This is the project-wide hazard (10+ incidents); W24 touches 6 routines in a
   row, so the discipline is load-bearing here.

2. **Rank coverage.** The 768-frame `$82` countdown is `$9A35[$17] × 256`.
   **Every deep measurement pins rank `$17` = 1** (the endchain run is
   unpowered) → `$9A35[1]` = `$03` → 768. At rank 4 (a powered run: `$44=2,
   $45=2, $46=5, $41=1`) it would be `$9A35[4]` = `$05` → **1280 frames**,
   *unverified dynamically* - no powered endchain run has ever been recorded.
   The `$82` countdown AND the boss damage ladder (W26) are rank-indexed; W24's
   done-when is **EXACT only at the measured rank row (rank 1)**. Other rows
   ship read-from-ROM (the table is exported) until a higher-rank run exists.
   Say "exact at rank 1; rank 4 = 1280 fr is table-derived, unmeasured" - not
   "the countdown is 768 frames".

3. **The `$997E` dead fall-through (must NOT be implemented).** Named separately
   because it is the highest-blast-radius trap in the wave: implementing it
   re-spawns the boss every 256 frames. It is dead because of `$9658`
   (per-frame `$5B` clear), an absence proof from the listing. See §5.

4. **The repo-index hazard (W22 review finding 1, LIVE).** The shared git index
   is poisoned - it carries staged deletions of files that exist on disk, so
   `git status` lies and `git checkout -- <path>` / `git restore` / `git stash`
   SILENTLY REVERT W22's work. Commit through a **private index**:
   `GIT_INDEX_FILE=.git/grad.index`; `git read-tree HEAD` immediately before;
   add paths **by name** (NEVER `git add -A`); read `git diff --cached
   --name-only`; commit. If the ref is locked by the parallel DaiOuJou track,
   wait, re-`read-tree`, re-add, commit again. Never force-push or rewrite
   history.

5. **`$84` boss spawn / `$85` boundary (§7).** W24 creates the boss object but
   not its handler. The endchain field comparison MUST end at frame 2620; a
   "green through `$85`" claim in W24 is wrong on its face (the boss handler is
   W26). The implementer confirms how `$98`/`$99` route so the throw is the
   expected loud one.

6. **Stage-unreachable arms.** `$83`'s stage≥5 shortcut (`$1B := $86`) and
   `$81`'s `$19==6` special case (`$4D=1,$4C=$CA`) cannot fire in a port that
   loads one stage. Throw on those conditions (`$19==5`/`$19==6`) with the ROM
   address - do NOT silently skip. A skipped arm is a quiet future defect.

7. **`$87`-`$8A` delegation is unvalidated.** If the implementer delegates the
   four intro-shared arms to `introStep`, that path has **0 dynamic hits** in
   the endchain run. It is "ported as routines, throwing as arms" today; making
   it not-throw is cheap but the change is unexercised until a stage-transition
   run exists (W27). Default to leaving them as throws unless the implementer
   specifically validates the delegation; say which.
