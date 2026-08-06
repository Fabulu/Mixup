# Wave 29 PLAN - finish the whole game (stages 2-7 + end-game + modes + loops)

status: PLAN (architect, READ-ONLY - no `src/` edits, no commit; only this file written)
architect, 2026-08-03

Inputs read in full: `28-recon-stages-2-7.md` (THE recon - per-stage inventory,
reuse-vs-bespoke, the 4 refinements, the ~8-10 wave estimate), `20-plan-completeness.md`
(the stage-1 plan structure + the §5 "deliberately excluded" list), the stage-1 wave
worklogs (`22-impl-six-routines.md`, `24-impl-substate-machine.md`, `25-impl-volcano.md`,
`26-recon-boss.md`/`26-impl-boss.md`, `27-impl-exits.md`), and `loop-1a-recon.md`.
Live tool output re-run for this plan: `tools/oracle/wavecensus.py`,
`tools/oracle/handlerclosure.py` (numbers below are fresh, not quoted).

**Stage-index convention (matches the recon).** `$19 = 0..6`; in-game stage = `$19 + 1`.
"Stage 1" = `$19 = 0` = DONE (W22-W27: plays start-to-finish, field-exact, throws at the
stage-2 boundary `loc_$A2F0`). "Stages 2-7" below = `$19 = 1..6`. Every count is read out
of `assets/prg.bin` + `rip/prg.asm`; the per-stage "ported %" is a STATIC prediction
cross-checked by two independent decoders (`wavecensus.py` and `wavedump.py` agree
byte-for-byte). Where the runtime has not yet confirmed a number it is labelled STATIC,
per `docs/knowledge/09-enumerate-then-validate.md`.

---

## 0. Headline

The stage-1 plan's "per-stage marginal cost ≈ 1 wave/stage for the handler/data layer,
the boss decode is free, loops are nearly free, the one new piece is the end-of-game
chain" is **CONFIRMED in shape, REFINED in four places** (the recon's §7 verdict, adopted
here unchanged):

1. **The inline-5 route** (`$A466`→`$A46F`/`$A4A6`; 49 distinct records in stages 2-7, 73
   game-wide) is an unported SPAWN ROUTE that **changes the wave-stream STRIDE** (5-byte
   records vs the 4-byte default). Stage 3 needs `$A46F`; stage 5 needs `$A4A6`.
2. **The 5 late-spawner wrappers** (`$C546`/`$C686`-stage-3/`$C5AD`/`$C653`/`$C6DE`) are
   small per-stage arms over the already-ported `sub_$C44F`. Cheap, but per-stage.
3. ~~**Stage 5's destructible-terrain `$0600` substrate**~~ **CORRECTED BY W32's RECON
   (`32-recon-destructible-terrain.md`): `$0600` IS NOT TERRAIN.** It is a 4-group ×
   `$30`-byte **articulated-ARM pool** (six segments each) owned by the stage-5 enemy
   `$CA5E`. It touches no nametable, no VRAM packet and no terrain map; every field of all
   `$30` bytes is accounted for from the 71 instruction sites that reference
   `$0600`-`$06BF`. It IS still a stage-specific SUBSYSTEM (allocator + sprite pass +
   kinematics + collision arms) rather than a handler, and it IS still the biggest single
   risk - but the *mechanism* named here was wrong, and the one piece that really was
   about terrain (`$C32F`) turns out not to run on stage 5 at all.
4. **The end-of-game chain** (brain `$BB0F` + typewriter `$CE94` + 4 state entries + the
   `$CF3B` script) is a substantial NEW piece (~150-200 lines bespoke JS) that doubles as
   the loop-wrap point - the ONLY `$1A` increment lives in `$9872`, so this chain **GATES LOOPS**.

**Net wave count: 10** (W28 ledger+loudness; W29-W34 stages 2-7 core, with stage 5 the
heavy one; W35 end-of-game chain / loop wrap; W36 modes 0-3,6; W37 dynamic validation /
loop-2 / rank). Stages 2-7 core is 6 waves, matching the recon's ~6-7 estimate.

---

## 1. The denominator per stage (with the UNION arithmetic)

Fresh from `python tools/oracle/wavecensus.py` + `python tools/oracle/handlerclosure.py`.
"distinct records" = distinct ROM addresses (the honest denominator; chunk streams share
tails so "record reads" is larger). "live chunks" = `0 .. floor(($98FD[$19]-1)/2)`.

| `$19` | in-game | chunks (live) | distinct records | boss-trigger `$9A3D` | stage-end `$98FD` | inline-5 (dist) | MISSING dispatch entries (closure) |
|---|---|---|---|---|---|---|---|
| 0 | 1 | 8 (0-6) | 92 | `$0C` | `$0E` | 0 | **NONE - shipped** |
| 1 | 2 | 8 (0-6) | 93 | `$0C` | `$0E` | 0 | `11:$B37F` |
| 2 | 3 | 7 (0-6) | 78 | `$0C` | `$0E` | 45 | `13:$B402` `14:$B434` `22:$C906` `23:$B7A1` `28:$B4FD` |
| 3 | 4 | 7 (0-6) | 98 | `$0C` | `$0E` | 0 | `13:$B402` `14:$B434` (shared with stage 3) |
| 4 | 5 | 7 (0-6) | 28 | `$0B` | `$0D` | 4 | `13:$B402` `14:$B434` `20:$CA5E` `29:$B559` |
| 5 | 6 | 7 (0-5) | 98 | `$0B` | `$0C` | 0 | `26:$B480` |
| 6 | 7 | 7 (0-6) | 111 | `$0C` | `$0D` | 0 | `11:$B37F` `30:$B569` `32-37:$AF10` (×6 entries) |

Per-stage ported fraction (STATIC prediction):

```
stage  distinct  ported  unported  inline5  ported %
0      92        92      0         0        100.0%   (shipped)
1      93        88      5         0         94.6%
2      78        28      5         45        35.9%   (inline-5 = the moai wall)
3      98        96      2         0         98.0%
4      28        8       16        4         28.6%   (16 unported = $B559×10, $B402/$B434×3 each; +4 inline-5)
5      98        47      51        0         48.0%   (51 unported = $B480×51)
6      111       95      16        0         85.6%
ALL    598       454     95        49        75.9%
```

**The UNION arithmetic (the work denominator).** `handlerclosure.py` live output:

```
UNION over the 7 stage scripts: 32 of 42 entries needed, 16 ported, 16 missing
entries no stage script needs: 0 3 10 21 24 25 27 31 38 40
```

Of the 42 dispatch entries, **32 are reached by some stage's wave script**; **16 are
ported** (covering the common vocabulary + the boss); **16 are MISSING** and they collapse
to **11 distinct routines** (`$AF10` covers 6 entries; `$B402`/`$B434` are the shared pair).
The 10 entries no wave script needs include the combat boss head/body (`24`/`25`,
spawned by `$9982` not a wave record), the volcano `$0A` (`10`, spawned by the stage-1
late spawner), and three reached only dynamically: `21:$B377` (the stage-4 late-spawner
child), `27:$B4F2` (no producer found), `40:$BB0F` (the end-of-game brain, spawned by
`$988C`). So the throwing total is **19 entries / 14 distinct routines**; the stages-2-7
wave-reachable subset is **16 entries / 11 distinct**; the dynamic-only tail is **3
entries / 3 distinct**.

**The boss is identical across all 7 stages** (recon §4, re-confirmed): `$9A3D` = the
per-stage scroll at which `st_9982` (sub-state `$84`) allocates slot 9 type `$98` → entry
24 → `$B914`. Both head `$B914` and body `$B913` are ported (W26). **"A boss decode each"
is therefore FREE for stages 2-7**, not 6 new decodes. The only boss-adjacent new code is
the stage-2 `$19==1 && $04CC==1 && $04AC<$78 → INC $39` warp arm at `$B962` (decoded in
`26-recon-boss.md` §9; its firing window is tight and was not reproduced - recon item in W37).

**The end-of-game chain is the single non-BigCore "boss"** and it only fires on stage 7
after the BigCore dies and `$9904` runs with `$19==6 → JMP $9872`. See W35.

---

## 2. The reuse map (FREE vs NEW per stage)

Each wave needs to know what is **FREE** (already-ported routine the stage reuses) vs
**NEW** (bespoke). FREE set compiled from recon §3a + the live `wavecensus.py` type lists.

**The common vocabulary (FREE for every stage that names it):** `$B205`($04),
`$B0AF`($05), `$B26C`($08), `$B026`($11), `$B098`($12), `$AF2E`($0F), `$B198`($06),
`$B6E1`($07), `$B747`($13), `$AF88`($10), `$AEDD`($27/$29) - eleven routines, the stage-1
set is the game's common vocabulary. **Plus the FREE infrastructure:** the dispatch
`jt_$AE1C`, the spawn engine (`$A2C0`/`$A335`/`$A527`/`$A3B1`/`$A3E4`/`$A411`), the play
sub-state machine `jt_$982F` + seamless stage-end `$9904`/`$96CF` (W24/W27), the late
spawner pattern-stepper `sub_$C44F` (W25, the shared body all 5 wrapper arms ride on),
movement/rank/scroll/camera, bullets, power-ups, the kill chain, and the boss framework
`$B914`/`$B913` + the armament quartet + the death chain (W26).

| stage | NEW handler routines (bespoke) | NEW late-spawner / stage-end arm | FREE routines ridden on |
|---|---|---|---|
| 2 (`$19=1`) | `$B37F` (jellyfish, 1) | `$C546` | `$B205 $B0AF $B26C $B026 $B098 $AF2E $AF88 $AEDD` + boss `$B914` |
| 3 (`$19=2`) | `$B402` `$B434` `$C906` (moai) `$B7A1` `$B4FD` (**5 - the heaviest**) + inline-5 `$A46F` | `$C686` stage-3 wiring (fn exists) | `$B205 $B0AF $B26C $B026 $B098 $AEDD` + boss |
| 4 (`$19=3`) | `$B402` `$B434` (**FREE once stage 3 ports them**) | `$C5AD` (+ child `$B377`, 6-line) | `$B205 $B0AF $B198 $B6E1 $B747 $AF88 $AF2E $B026 $B098 $AEDD` + boss |
| 5 (`$19=4`) | `$CA5E` (the arm owner, inline-5) `$B559` (shares body with `$B4FD`) - **`$B559` SHIPPED, W32a**; `$B402`/`$B434` FREE from stage 3 | `$C653` (routes through `$A4A6`) | `$B26C` + boss. **NEW subsystem: the `$0600` ARM-GROUP pool (NOT destructible terrain - W32 recon)** |
| 6 (`$19=5`) | `$B480` (cell/wall, 53 records) | `$C6DE` (slot-scan, metasprite `$8D`); `$CDA5` stage-end hook (5 lines) | `$B205 $B0AF $B26C $AF2E $B026 $B098 $AEDD` + boss |
| 7 (`$19=6`) | `$B569` (2 records); `$AF10` (1 handler, entries 32-37, the `$20`-`$25` gallery); `$B37F` FREE from stage 2 | `$C429` = RTS (already handled) | `$B205 $B0AF $B198 $B6E1 $B747 $AF88 $B026 $B098 $AEDD` + boss; then the end-of-game chain (W35) |

**The 7 late-spawner arms** (`jt_$C439`, indexed by `$19`; `sub_$C44F` already ported, so
each arm is a ~15-25-line wrapper):

| `$19` | arm | scope | wave |
|---|---|---|---|
| 0 | `$C486` | volcano (`$0A`), stage 1 | **ported (W25)** |
| 1 | `$C546` | type `$0B` via `$C44F` X=2 → `$C58D` | **W29** |
| 2 | `$C686` | type `$97`/`$A6`; also the `$3A` warp-rain target (fn exists) | **W30** (stage-3 wiring fix) |
| 3 | `$C5AD` | type `$15` (`$B377`) via `$C44F` X=4 → `$C633` | **W31** |
| 4 | `$C653` | routes through `$A4A6` (inline-5 `$0600` ARM-GROUP allocator) | **W32b** (coupled to the pool) |
| 5 | `$C6DE` | slot-scan on `$0136,X`, metasprite `$8D` | **W33** |
| 6 | `$C429` | RTS (stage 7 has no late spawner) | **handled** |

So: **4 small wrapper arms to port + 1 wiring fix (`$C686`)**, distributed across the
stage waves. None is a wave of its own; each rides its stage.

---

## 3. Ordered waves

Ordered by (a) dependency - what unblocks what - and (b) front-loading the risky thing's
*recon* so its size is known before we commit. Every DONE-WHEN is a MEASUREMENT citing ROM
addresses. Each wave is sized for one implementer. RULE 2 items are named inside the wave
that owns them, not guessed.

### W28 - The CI ledger + loudness (risk: low; do FIRST; parallel-safe with everything)

**Scope.** This is `20-plan-completeness.md` §3 W28 ("the verdict machine becomes a
ledger"), broadened from stage-1 to all 7 stages. Wire `tools/oracle/wavecensus.py`,
`tools/oracle/stagewaves.py`, and `tools/oracle/handlerclosure.py` into
`tools/test-all.mjs` as a stage that **FAILs on regression**: if any stage's
first-unported scroll moves backward, or a ported handler begins to throw, CI goes RED.
Pick ONE record-counting convention (this plan's: distinct ROM addresses) and document it;
reconcile `wavedump.py`'s stale frozen `PORTED` literal with `wavecensus.py`'s
`src/enemies.js`-parsed set. **Make modes 0-3,6 LOUD**: add the `else throw` on
`src/nmi.js`'s mode dispatch (the `$80D4` 7-mode table - currently a silent miss, 76/76
non-mode-5 windows diverge), and the `$8BD9`/`$8C06` terrain-object sprite-pass throw
(`src/oam.js` names `$8BAB` but not the pass; `20-recon-unported-census.md` §6 item 1).
These are the W21 loudness fixes that were left for the files that own them.

**Dependencies.** None. Every later wave benefits from its regression gate.

**DONE-WHEN (measurement).** `test-all.mjs` prints `stage N: X/Y records, first unported
at $ZZZZ` for all 7 stages and FAILs (exit non-zero) when a 1-record deliberate regression
is injected into `src/enemies.js`; `census.py dispatch` and `handlerclosure.py` agree on
the 32/42 union; the unpowered sweep's 76 silent windows (title/attract after game-over)
become named throws instead of silent divergence.

---

### W29 - Stage 2 (`$19=1`): the smallest delta, opens stage 2 (risk: low)

**Scope.** `$B37F` (entry 11, type `$0B`/`$8B`, ~48 prg.asm lines - the jellyfish-type)
+ the `$C546` late-spawner wrapper (over the ported `sub_$C44F`). The boss is FREE:
`$B914` @ `$9A3D[1]=$0C`, stage-end `$98FD[1]=$0E`. 9 of stage 2's 10 named types are
already ported (the common vocabulary).

**Dependencies.** W28 (for the census gate). Nothing stage-specific - stage-1
infrastructure is complete and `$B37F` is self-contained.

**DONE-WHEN (measurement).** A stage-2 scenario (seed-anywhere at the stage-2 entry
`$A2F0`, i.e. `$19=1`, plus the reaching script - the `25b-recon-reaching-script.md`
method generalizes: align to the stage-2 scroll, the powered poke, the RDA/RUA tail)
reaches the stage-2 BigCore death **on the cartridge's frame**, TIER-1 0 divergent;
`wavecensus.py` prints `stage 1: 93/93`; the endchain now throws at the **stage-3**
boundary (`$A2F0`'s analogue for `$19=2`, the first stage-3 wave record).

---

### W30 - Stage 3 (`$19=2`): the moai + the inline-5 route (risk: medium-high; the heaviest stage)

**Scope.** Five new handler routines + the inline-5 ROUTE + one wiring fix:

- **The inline-5 ROUTE** (the stride-change trap): the `$A37A` 5-byte loader + the `$A466`
  splitter (cmd >= `$F0` ⇒ 5-byte records, not 4-byte - a misparse here corrupts the whole
  remaining stream, and the symptom is *wrong enemies*, not a missing enemy). Decode this
  ONCE here; both stage 3 (`$A46F`) and stage 5 (`$A4A6`) ride on it.
- **`$A46F`** (the moai-spawn arm, ~30 lines): `$19==2` → allocate slot, force
  `$030C := $96`. Fully portable now (it does NOT touch `$0600`).
- **`$C906`** (~180 lines, the biggest bespoke handler in stages 2-7): the moai
  nametable-patching destructible, 3 hits, rank-indexed reopen timer `$C936` (7 rows
  `$50 $4B $46 $41 $3C $28 $1E`), writing plasma-ring packets into the **`$0700,Y` ring
  buffer** (a different substrate from `$0600`, also used by `$CE94`).
- **`$B7A1`** (~187 lines, the second-biggest): the bespoke mover; ALSO the `$C686`
  warp-rain stage-3 path - port the **`$C686` stage-3 wiring fix** (the function exists;
  one-line wiring once `$B7A1` lands).
- **`$B4FD`** (entry 28, ~71 lines) + **the shared pair `$B402`/`$B434`** (entries 13/14,
  ~33/27 lines, share a body via `$B407`/`loc_B502` - port ONCE, stages 3/4/5 all reuse).
  `$B559` (stage 5) shares `$B4FD`'s `loc_B502` body too - porting `$B4FD` right makes
  stage 5's `$B559` a 9-line wrapper later.

`$A4A6`'s `$0600` group-scan BODY is DEFERRED to W32b (it allocates an ARM GROUP, not a
terrain cell - see the W32 recon). The loader/splitter it shares with `$A46F` lands here.

**Dependencies.** W28. The inline-5 stride change is the load-bearing decode; `$C906`'s
`$0700` ring buffer is a new (small) substrate but self-contained.

**DONE-WHEN (measurement).** A stage-3 scenario reaches the stage-3 BigCore death
(`$9A3D[2]=$0C`, stage-end `$98FD[2]=$0E`) on the cartridge's frame, TIER-1 0 divergent;
`wavecensus.py` prints `stage 2: 78/78` (23 ported handler records + 45 inline-5 all live);
the moai wall (45 distinct inline-5 records forcing type `$96`) reproduces spawn-for-spawn
against a cartridge recording of the moai approach. The `$A466` stride is mutation-tested
RED (one mis-parsed stride byte must diverge the whole tail).

**RULE 2 (inside this wave).** The 45 inline-5 records have never been exercised
dynamically. The static decode is two-decoder cross-checked; the scenario above is the
validation. If the moai approach cannot be reached by a button script, fall back to a
both-sides poke labelled per knowledge/09 - validates the CODE, not the route's geometry.

---

### W31 - Stage 4 (`$19=3`): nearly free (risk: low)

**Scope.** Rides on W30's `$B402`/`$B434` (stage 4's only two missing handler entries).
Ports `$C5AD` (the stage-4 late-spawner wrapper) + its child `$B377` (entry 21, type
`$15`, the 6-line handler - reached only dynamically, never by a wave record). 12 of
stage 4's 14 named types are already ported.

**Dependencies.** W30 (for `$B402`/`$B434`).

**DONE-WHEN (measurement).** A stage-4 scenario clears to the stage-4 BigCore death
(`$9A3D[3]=$0C`, stage-end `$98FD[3]=$0E`) on the cartridge's frame, TIER-1 0 divergent;
`wavecensus.py` prints `stage 3: 98/98`; `census.py dispatch` shows entry 21 ported.

---

### W32 - Stage 5 (`$19=4`): the `$0600` ARM-GROUP pool - THE RISK (risk: HIGH; recon gate first)

> **THIS SECTION AS ORIGINALLY WRITTEN WAS WRONG ABOUT THE MECHANISM AND THE RECON GATE
> CAUGHT IT.** Read `docs/worklog/gradius/32-recon-destructible-terrain.md` first.
> `$0600` is a 4-group × `$30`-byte articulated-ARM pool, not a terrain map; `$C32F` (the
> only genuinely terrain piece below) is EXCLUDED on stage 5 by `$C2AB CMP #$04 / RTS`;
> and the plan MISSED a fifth piece, `$9663`'s half-rate frame fork, which is the real
> risk. The recon split the wave into three:
>   * **W32a - `$B559` (entry 29). SHIPPED** (`32a-impl-b559.md`). Ten of stage 5's 28
>     records, all of chunks 0-1. Ledger stage 4: 14/28 → 24/28, first unported
>     `$0000` → `$0480`.
>   * **W32b - the arm substrate (~1,040 bytes)** including the frame fork.
>   * **W32c - the three interaction routines (~285 bytes).**

**Scope.** Stage 5 is structurally different: 28 distinct records, and **4 of them are
inline-5** (replayed across chunks 2-6) that force type `$14` (the arm owner, `$CA5E`)
via the **`$A4A6` arm**. `$A4A6` does NOT just spawn - it scans the **`$0600,X` arm-group
headers** (a separate pool from `$030C`) for a free group to mount the enemy on. The
coupled pieces on `$19==4`, corrected:

| piece | role | port status |
|---|---|---|
| `$A4A6` inline-5 arm (`enemies.js`) | arm-group allocator (reads `$0600,X`) | throws |
| `$C267`-`$C299` player-vs-arm-segment (`collision.js`, gated `$19==4`) | the arm kills the player | throws |
| ~~`$C32F`-`$C39A` breakable-wall VRAM patch~~ | **NOT REACHED ON STAGE 5** - `$C2AB CMP #$04 / BNE $C2B5 / $C2AF RTS`. A stage-2/4/6/7 item. | (n/a) |
| `$8BD9`/`$8C06` arm sprite pass (`oam.js`, in `$8BAB`) | draws the six segments of each live group | throws (W28 made it loud) |
| **`$9663`'s half-rate frame fork** (MISSING FROM THE ORIGINAL TABLE) | with ≥ 2 arms alive one logical frame is split across two hardware frames; the player runs at 30 Hz | throws (`nmi.js`), + tripwires at `$9A5E` and `$C04B` |

**W32a MEASURED A SIXTH THING THE PLAN AND THE RECON BOTH MISSED.** Stage 5 cannot run a
single frame with the scope guard opened alone: FOUR stage-5 gates fire *unconditionally*
every frame, before the spawn engine reads a wave record, and every one walks the four
`$0600` group headers - `$9663` (nmi), `$8B8D`→`$8BD9` (oam), `$C25D`→`$C267`
(collision) and `$9A76`→`$C772`→`$CB8A`. The last of those **has no call site in the port
at all** (`nmi.js` has only a comment), so it becomes a SILENT no-op the moment `$9663`'s
throw is lifted. W32b must add it in the same edit.

**RECON GATE (the first sub-step of this wave; read-only).** Before any `src/` edit,
enumerate from the ROM + `rip/`: the loader `$9663` (the stage-5 terrain census), the
`$0600` array layout and its writers/readers, the `$8BD9`/`$8C06` sprite pass, the
`$C267`/`$C32F` collision/VRAM arms, `$CA5E`, `$B559` (9-line wrapper over `$B4FD`'s
`loc_B502`, ported in W30), `$A4A6`'s body, `$C653`. Decide from the recon gate whether
this is 1 wave or 2 (the substrate + its 4 coupled pieces may force a split: substrate +
handlers). This is the one wave most likely to grow.

**Dependencies.** W28 (sprite-pass loudness, so the silent gap becomes a throw). W30
(`$B402`/`$B434` + the inline-5 `$A466` loader, which `$A4A6` shares).

**DONE-WHEN (measurement).** A stage-5 scenario clears to the stage-5 BigCore death
(`$9A3D[4]=$0B` - note `$0B`, the shorter approach, not `$0C`; stage-end `$98FD[4]=$0D`)
on the cartridge's frame, TIER-1 0 divergent; `wavecensus.py` prints `stage 4: 28/28`
(8 handlers + 4 inline-5 + the 16 `$B559`/`$B402`/`$B434` records all live); the
breakable walls crumble (`$C2DC` VRAM patch) field-exact against a cartridge recording.

**RULE 2 (inside this wave).** `$0600` is populated only when `$19==4`; its layout must
be measured from the loader `$9663`, not inferred. The 4 inline-5 sun/eye records
(`$14`/`$CA5E`) need a scenario that scrolls past them on both sides.

---

### W33 - Stage 6 (`$19=5`): the cell enemy + the "track" recon item (risk: medium)

**Scope.** `$B480` (entry 26, type `$1A`, ~70 lines, 53 of stage 6's 98 records - the
signature enemy: state-machine creature, `$B628`-driven animator, two rank fire modes
`$B4E4`/`$B4EB`, `$BCB5` bullet fire, `$AEE1` move arm) + `$C6DE` late-spawner (slot-scan
on `$0136,X`, metasprite `$8D`) + `$CDA5` (5-line stage-end hook called from `$9904` when
`$19==5`). No bespoke substrate.

**RULE 2 RECON ITEM (named inside this wave, not guessed).** "Stage 6's track" is **not
statically decidable** (recon §5c): no `prg.asm` evidence of a track/rail; nothing in
stage 6's records names one. The wave opens with a read-only check of
`rip/stage6-terrain.txt` + the `handlerflow` off `$B480`/`$C6DE`. If a rail/track is found
in the terrain stream, name it and port it; if it is a dynamic behaviour of `$B480`, the
stage-6 scenario reveals it; if neither, record that "track" is not a stage-6 mechanic.

**Dependencies.** W28. Stage 6 reuses 7 of the common-vocabulary routines + the boss.

**DONE-WHEN (measurement).** A stage-6 scenario clears to the stage-6 BigCore death
(`$9A3D[5]=$0B`, stage-end `$98FD[5]=$0C`) on the cartridge's frame, TIER-1 0 divergent;
`wavecensus.py` prints `stage 5: 98/98`; the "track" question is answered in the worklog
(either ported or documented as absent, with the evidence).

---

### W34 - Stage 7 core (`$19=6`): the gallery (risk: low-medium)

**Scope.** `$B569` (entry 30, type `$1E`, ~101 lines, falls into `$B574`-`$B605`,
`$5B`/`$046C,X` state) + `$AF10` (entries 32-37, types `$20`-`$25`, ONE shared 26-line
handler that picks a metasprite from `$AF0A,Y` by `(type-$20)` - a 6-frame "boss debris"
gallery). `$B37F` (type `$0B`, 9 records) is FREE from W29. `$C429` is RTS (handled).
After stage 7's BigCore dies, `$9904` with `$19==6` does `JMP $9872` → W35.

**Dependencies.** W29 (`$B37F`). W28.

**DONE-WHEN (measurement).** A stage-7 scenario reaches the stage-7 BigCore death
(`$9A3D[6]=$0C`, stage-end `$98FD[6]=$0D`) on the cartridge's frame, TIER-1 0 divergent;
`wavecensus.py` prints `stage 6: 111/111`. The throw then passes to `$9872` (W35).

---

### W35 - The end-of-game chain / loop wrap (stage 7 only) (risk: medium-high; THIS GATES LOOPS)

**Scope.** After stage 7's BigCore dies, `$9904` runs with `$19==6 → JMP $9872`. This is
the **finite end-of-game chain** - the only non-BigCore "boss" - and it is the **loop-wrap
point** (the ONLY `$1A` increment in the whole PRG lives here). None of it is ported;
`playArm()` throws on every sub-state past `$86`. Port, in order:

| `$1B` | handler | role | size |
|---|---|---|---|
| - | `$9872` (`loc_9872`) | `INC $1B` (`$86→$87`); **`INC $28,X`** (the single loop-counter write); `$19,$24,$3F := 0`; `$22,X := ($42?1:0)`; PPUMASK:=0 | ~15 lines |
| `$8B` | `$988C` (`st_988C`) | the brain spawner: slot 9 type `$28` (→ entry 40 → `$BB0F`) at X `$A4`, Y `$88`; slot 8 metasprite `$9E`; `$0100 := 3`; sound `$E8`; `INC $1F`; canned packets `$21`,`$05` | ~15 lines |
| (slot 9 type `$28`) | `$BB0F` (`st_BB0F`) | the brain SCENE DIRECTOR (not combat): reads the 26-record path script at `$BB82` (2-byte `[dX, Yhi|msLo]`, `$FF`-terminated), `JMP $CE94` each frame the brain is "settled" (`$4F != $FF`); `loc_BB1F`: `DEC $4C / BNE / JSR $AEF8 / INC $1B` ends the scene | ~73-line region |
| (typewriter) | `$CE94` (`loc_CE94`) | the typewriter text writer: every 8 frames (`$4E`), re-emit the line +1 char; `$FE`=pause, `$FF`=restart; script at `$CF3B` (the `$CF2D` table is FLAT - all 7 entries point at `$CF3B`, so the ending text is identical every loop) | ~40-60 lines + `$CF3B` data export |
| `$8C` | `$98DD` (`st_98DD`) | `INC $5B / JSR $ADAB` (objects-only update) / `JMP $9A8C` | ~10 lines |
| `$8D` | `$98E5` (`st_98E5`) | `INC $5B / $1B := 0 / JMP $9B3E` - full intro reload, now `$19=0` and `$1A` = loop+1 restored from `$28,X` (the loop wrap) | ~10 lines |

Plus **drop the loop gates**: remove the two `zp1A !== 0` throws (`enemies.js:791`/`854`,
the `$BBBF`/`$BC44` arms) and port the three trivial `$1A` scalars (`$BBC9` one ladder
rung, `$B951` two STA on boss hit, `$CEAC` the flat `$CF2D` table - a no-op even when
wired). The three already-correct `$1A` readers (`$B003`, `$BD42`, `$BD96`) then run
faithfully once `$1A != 0`.

**Dependencies.** W34 (must reach stage-7 boss death). `$984F` (the forced 4 px/frame
scroll, sub-states `$8E`/`$8F`) is ALREADY ported (W27, the `$39` warp route uses it) -
FREE here.

**DONE-WHEN (measurement).** A stage-7-clear scenario runs the brain scene + typewriter
field-exact to the cartridge (path fly-in `$BB82` spawn-for-spawn; typewriter `$CE94`
character cadence on the `$CF3B` script), TIER-1 0 divergent through `$98E5`; then a
**loop-2 clear** reloads stage 1 with `$1A = 1` and the three fire-rate/bullet-velocity
scalars (`$B003`, `$BD42`, `$BD96`) firing, TIER-1 0 divergent into stage 1 of loop 2.
`census.py dispatch` shows entry 40 (`$BB0F`) ported.

---

### W36 - Title / attract / game-over modes 0-3, 6 (risk: medium; depends on an open question)

**Scope.** The `$80D4` 7-mode dispatch (modes 0=boot, 1=title, 2=attract, 3=game-over-
demo, 4=continue, 6=high-score; mode 5=play is the one ported). Currently a **silent
miss** - `src/nmi.js`'s mode dispatch has no `else`; W28 makes it LOUD. This wave PORTS
them. The open dependency is the **`$882C`/`$8871` full-screen RLE loader** (the
title/attract/GameOver screens; `00-plan.md` exclusions) - a recon item at the top of the
wave decides whether the loader is one shared routine or three.

**Dependencies.** W28 (loudness - the wave cannot start until the silent miss is a throw).
Otherwise independent of the stage waves; can run in parallel with W29-W35.

**DONE-WHEN (measurement).** A boot-to-attract scenario (cold boot through title into the
attract demo and back) compares GREEN through modes 0→1→2 and the game-over transition
`$96FB`→mode 3→mode 0; the 76 windows that were silent in `20-recon-sweep-harness.md`
(now loud from W28) all PASS; TIER-1 0 divergent.

---

### W37 - Dynamic validation / loop-2 / rank rows (risk: low-medium; the cross-cutting close-out)

**Scope.** The reaching-method generalisation (per the brief: seed-anywhere + the
per-stage scroll). Stages 2-7 wave decode is ROM-only until this wave ties a bow: a
**continuous loop-2 full clear** (7-stage lap + the W35 chain + stage-1 reload with
`$1A=1`), **rank-row coverage** for the boss at rank ≠ the measured row 4 (the endchain
run that validated `$B914` is rank 4; other rank rows ship read-from-ROM per `20-plan` §6
- this wave exercises rank 0 and rank 7), the **stage-2 `$39` warp arm** (`$B962`:
`$19==1 && $04CC==1 && $04AC<$78 → INC $39`) reproduced naturally or under a both-sides
poke, and the **`$B4F2` no-producer entry** (entry 27) - settle the no-producer claim or
leave it documented per knowledge/09.

**Dependencies.** W29-W35 all done (a loop-2 clear needs every stage + the chain).

**DONE-WHEN (measurement).** A continuous loop-2 clear runs start → stage-7 brain →
stage-1 reload with `$1A=1`, TIER-1 0 divergent end to end, on the cartridge's frames;
boss scenarios at rank 0 and rank 7 are field-exact (rank tables `$B8F8`/`$B901`/`$B90A`
exercised at their extremes); the loop-2 fire-rate shift (`$B003` row +1) is observed on
both sides. The 7-loop ceiling (`$CEAC` clamps `$1A` to 6; `$CF2D` is 7 flat words) is
documented as the finite bound.

---

## 4. The loop story

**CONFIRMED (loop-1a-recon.md): `$1A` is a rank/difficulty scalar, NOT a wave-stream
selector.** Loops 2+ reuse the same code, the same wave data (598 records), the same
terrain streams - only a handful of fire-rate/bullet-velocity scalars change. There is no
second game of data hiding behind `$1A`. The wave/terrain tables are indexed by stage
(`$19`) and rank (`$17`), never by `$1A`. Of `$1A`'s 8 reader sites: 2 are table-indexed
(`$B003` the rank-row nudge, `$CEAC` the FLAT ending-table pointer), 6 are scalar
branches; **zero are stream-selectors.**

**Loops are gated on the end-of-game chain (W35), and ~free once it ships.** The ONLY
`$1A` increment in the whole PRG is `$9889 INC $28,X` inside `$9872` (read back into
`$1A` by `$9B3E`), reached only when `$19==6` on a stage-7 clear. So the chain is the
loop gate - there is no other path. After W35:

- The 3 already-ported `$1A` readers (`$B003`, `$BD42`, `$BD96`) become live and faithful
  (they are dead-but-faithful while `$zp1A` stays 0).
- The 3 throwing readers (`$BBBF`, `$BBC9`, `$BC44`) are trivial scalars ported in W35.
- `$CEAC` indexes the `$CF2D` table - **flat** (`$CF3B` × 7), so even the one `$1A`-indexed
  pointer is a no-op across loops. The ending text is byte-identical in every loop.

**The 7-loop ceiling.** `$CEAC` clamps `$1A` to 6 before indexing (`CMP #$06 / BCC / LDA
#$06`); the `$CF2D` table is exactly 7 words; the `$B01D` fire table has 9 rows and `$1A`
adds at most +1 to a `$17`-bounded Y. **Max supported loop = 7** (indices 0..6); loop 8+
reads the clamped entry - no overflow, just the same ending. No "loop 8 needs more ROM"
cliff anywhere.

**Where loops land in the wave order:** W35 (the chain) is the loop-wrap wave; W37
validates a loop-2 clear and documents the 7-loop ceiling. Loops are NOT a separate
multi-wave effort - they are a consequence of W35 + dropping 3 throws.

---

## 5. Risks (ranked)

1. **Stage 5's `$0600` ARM-GROUP pool (BIGGEST).** *(Was "destructible-terrain
   substrate"; corrected by the W32 recon - see above. `$0600` is a 4×`$30`-byte
   articulated-arm pool owned by `$CA5E`, with no nametable, VRAM, terrain-map or
   compression involvement anywhere.)* The coupled pieces are the `$A4A6` allocator, the
   `$C267` player-vs-segment sweep, the `$BEF3` shot-vs-segment sweep, the `$8BD9`/`$8C06`
   sprite pass, the `$CB91` driver, the `$CC33` kinematics and `$CA5E` itself - across
   three files (`enemies.js` + `collision.js` + `oam.js`) - **plus `$9663`'s half-rate
   frame fork, which the original list omitted and which is the item that can still
   grow**: it is a control-flow change at the top of play mode, not a handler.
   `$C32F`/`$C2DC` is NOT part of it. Measured size: 1,320 bytes / ~591 instructions,
   2.1× W30's stage-3 scope. **Mitigation, which WORKED:** the read-only RECON GATE ran
   first, corrected the mechanism, and split the wave into W32a/W32b/W32c. W32a is
   shipped.

2. **The inline-5 stride-change trap.** The `$A466` splitter changes the wave-stream
   STRIDE (5-byte records at cmd >= `$F0`). A misparse does NOT throw - it desynchronises
   the whole remaining stream and emits wrong enemies, which is harder to catch than a
   missing enemy. **Mitigation:** decode the loader/splitter ONCE in W30; mutation-test
   that one mis-parsed stride byte diverges the tail (the DONE-WHEN requires this RED);
   two-decoder cross-check (`wavecensus.py`/`wavedump.py`) already agrees byte-for-byte.

3. **The end-of-game chain's bespoke length.** ~150-200 lines of new JS (`$BB0F` ~73,
   `$CE94` ~40-60, 4 states ~15 each), living in the `$CF2D`-`$EC1D` 7409-byte region
   that is the single largest unreached hole in the PRG (`20-recon-late-systems.md` §6) -
   none of it has ever been reached dynamically. **Mitigation:** the decode is from
   `prg.asm` and the path script (`$BB82`, 26×2 + `$FF`) and typewriter script (`$CF3B`)
   are finite data exports; a stage-7-clear scenario is the prerequisite and W34 delivers
   it. Because the chain gates loops, slippage here slips loops - it is on the critical
   path for "the whole game."

4. **Dynamic-validation gaps (RULE 2 register).** Every per-stage "ported %" in §1 is a
   STATIC prediction. The reaching method (`25b-recon-reaching-script.md`) generalises
   (seed-anywhere + the per-stage scroll + the reaching script), but each stage's
   first-unported scroll needs its own scenario to validate. Items that are NOT statically
   decidable and must be measured inside their wave, not guessed:
   - **Stage 6's "track"** (W33): no static evidence; terrain-stream or dynamic only.
   - **The 45 stage-3 moai inline-5 records** (W30): ROM-derived decode, never exercised.
   - **The brain `$BB0F` / typewriter `$CE94`** (W35): never reached; in the largest
     unreached region.
   - **The boss at rank ≠ 4** (W37): rank tables ship read-from-ROM; rows 0 and 7 unmeasured.
   - **The stage-2 `$39` warp arm `$B962`** (W37): tight firing window, not reproduced.
   - **`$B4F2` (entry 27)**: no-producer claim rests on the absolute-store scan; an
     indirect-pointer write would evade it (documented, not blocking).

5. **The `$030B,X` alias-trap family (project history).** The W26 boss body-sync and the
   W27 warp-rain `$0460` alias were both off-by-one slot-index traps caught only by
   both-sides comparison. Stages 2-7 introduce no NEW slot-aliasing (the boss framework is
   reused verbatim), but the inline-5 `$A46F`/`$A4A6` arms allocate slots through the
   shared `$A527` - each new spawner is a place a `+$0C` vs raw-index bug can hide.
   **Mitigation:** every wave's DONE-WHEN is a field-exact cartridge comparison, not a
   unit test; the both-sides poke is the accepted fallback when a button script cannot
   reach (knowledge/09).

---

## 6. What rides for FREE (the reuse summary, so no wave re-ports shared code)

- **The combat boss** (`$B914`/`$B913`, the armament quartet `$BAF7`/`$BAFB`/`$BAFF`/`$BB07`,
  the rank tables `$B8F8`/`$B901`/`$B90A`, the morph ladder `$B8EF`, the death chain) -
  FREE for all 7 stages (W26).
- **The 11 common-vocabulary routines** - FREE for every stage that names them (§2 table).
- **The late-spawner pattern-stepper `sub_$C44F`** (W25) - the 5 wrapper arms ride on it.
- **The inline-5 `$A466`/`$A37A` loader** (decoded W30) - `$A46F` (stage 3) and `$A4A6`
  (stage 5) share it.
- **The shared `$B402`/`$B434` pair** (W30) - stages 3, 4, 5 all reuse.
- **`$B4FD`'s `loc_B502` body** (W30) - stage 5's `$B559` is a 9-line wrapper over it.
- **`$B37F`** (W29) - stage 7 reuses it (type `$0B`, 9 records).
- **`$984F`** (W27, the forced scroll) - the end-of-game chain reuses it (sub-states
  `$8E`/`$8F`).
- **The `$1A` loop scalars** - 3 of 8 readers already ported (`$B003`/`$BD42`/`$BD96`);
  loops cost the chain (W35) + 3 trivial scalar ports, nothing more.

Key ROM addresses cited: `$A7D0` (stage table), `$A844`-`$ADAA` (wave data), `$AE1C`
(42-entry dispatch), `$9A3D` (boss-trigger, 7 bytes `$0C $0C $0C $0C $0B $0B $0C`),
`$98FD` (stage-end, 7 bytes `$0E $0E $0E $0E $0D $0C $0D`), `$C439`/`$C447` (7-entry
late-spawner dispatch), `$A466`/`$A37A`/`$A46F`/`$A4A6` (inline-5 route), `$0600` (stage-5
terrain array), `$0700` (moai ring buffer), `$B914`/`$B913` (combat boss), `$9872`/
`$988C`/`$BB0F`/`$BB82`/`$CE94`/`$CF3B`/`$98DD`/`$98E5` (end-of-game chain), `$9889`
(the single `$1A` increment), `$80D4` (mode dispatch), `$882C`/`$8871` (RLE loader),
`$B962` (stage-2 warp arm).
