# Wave 28 RECON — stages 2-7 (and the end-of-game chain)

status: DONE (recon, READ-ONLY — no `src/` edits, no commit; only this file written)
recon, 2026-08-03

Scope (from the brief): enumerate stages 2-7 so an architect can plan the waves
to finish the game. Stage 1 (`$19 = 0`, in-game stage 1) just shipped (W22-W27):
it plays start-to-finish, field-exact, and throws at the stage-2 boundary
(`loc_$A2F0`, the play sub-state entry that runs the spawn engine once `$19`
flips to 1). This recon measures the DELTA from stage 1 to stages 2-7 and the
finite end-of-game chain, and either CONFIRMS or REFUTES the plan's "per-stage
marginal cost" claim (`20-plan-completeness.md` §3, §5).

Method: `docs/knowledge/09-enumerate-then-validate.md`. Every count below is
read out of `games/gradius/assets/prg.bin` + `games/gradius/rip/prg.asm` by the
existing tools (`tools/oracle/wavecensus.py`, `tools/oracle/wavedump.py`,
`tools/census.py`, `tools/oracle/handlerclosure.py`, `tools/handlerflow.py`).
No emulator was run for this pass — consistent with the plan's §5 note that
stages 2-7's wave decode is "read-from-ROM only — zero dynamic validation."
Where dynamic validation will be needed is flagged per RULE 2.

**Stage-index convention.** The ROM uses `$19 = 0..6`. In-game stage = `$19 + 1`.
"Stage 1" in the owner's framing = `$19 = 0`. "Stages 2-7" below = `$19 = 1..6`.

---

## 0. The headline

The plan's "per-stage marginal cost" claim is **CONFIRMED in spirit, REFINED in
two places.** Stages 2-7 need **11 new distinct enemy-handler routines** (16
dispatch entries; `$AF10` covers 6 of them) on top of the 20 already ported,
plus **5 small late-spawner arms**, plus **2 inline-5 arms**, plus **one
stage-specific subsystem** (stage 5's destructible terrain), plus the **finite
end-of-game chain** (brain + typewriter + 4 state-machine entries). The wave
data itself (598 distinct records, 506 of them in stages 2-7) is pure DATA —
no new spawn engine. The boss is **identical across all 7 stages** and is
already ported (W26). The genuine new work is bounded and itemised in §6.

The brief's snapshot ("19/42 entries, 16/34 routines ported") is **stale**: it
is the pre-W26 count. The fresh number, read out of `src/enemies.js` by
`census.py`, is **23/42 entries, 20 distinct routines ported** (W26 added the
boss `$B914`/`$B913` and the warp-rain `$B61E`; `$B36F` also landed). The
fresh throwing count is therefore **19/42 entries (14 distinct routines)**, of
which **16 entries / 11 distinct** are reached by stages 2-7 wave data and
**3 entries / 3 distinct** are reached only dynamically (the moai late-spawner
child `$B377`, the no-producer `$B4F2`, and the end-of-game brain `$BB0F`).

---

## 1. The per-stage inventory table

All counts FRESH, from `python tools/oracle/wavecensus.py` +
`python tools/oracle/wavedump.py` + `python tools/oracle/handlerclosure.py`
(handlerclosure reads the ported set from `src/enemies.js` dynamically, so it
is not the stale literal `wavedump.py` carries).

"live chunks" = the chunks the stage actually plays before `$98FD[$19]` ends
it = `0 .. floor(($98FD[$19] - 1) / 2)`. "distinct records" = distinct ROM
addresses (the honest denominator; chunk streams share tails, so "record
reads" is larger — see `20-recon-unported-census.md` §2).

| `$19` | in-game | chunks (live) | distinct records | boss-trigger `$9A3D` | stage-end `$98FD` | inline-5 (dist) | types named (live) | dispatch entries needed | ported | MISSING entries (closure) |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | **1** | 8 (0-6) | 92 | `$0C` | `$0E` | 0 | 12 | 16 | **16** | **NONE — shipped** |
| 1 | 2 | 8 (0-6) | 93 | `$0C` | `$0E` | 0 | 10 | 14 | 13 | **`$B37F`** (11) |
| 2 | 3 | 7 (0-6) | 78 | `$0C` | `$0E` | 45 | 12 + `$96` | 14 | 9 | `$B402` `$B434` `$C906` `$B7A1` `$B4FD` |
| 3 | 4 | 7 (0-6) | 98 | `$0C` | `$0E` | 0 | 14 | 18 | 16 | `$B402` `$B434` |
| 4 | 5 | 7 (0-6) | 28 | `$0B` | `$0D` | 4 | 5 | 7 | 3 | `$B402` `$B434` `$CA5E` `$B559` |
| 5 | 6 | 7 (0-5) | 98 | `$0B` | `$0C` | 0 | 8 | 11 | 10 | `$B480` |
| 6 | 7 | 7 (0-6) | 111 | `$0C` | `$0D` | 0 | 17 | 20 | 12 | `$B37F` `$B569` `$AF10` (×6 entries) |

Totals stages 2-7: **506 distinct records** (598 game-wide), **16 missing
dispatch entries / 11 distinct routines**. UNION over all 7 stages: 32 of 42
entries needed by a wave script, 16 ported, 16 missing (handlerclosure).

Per-stage ported fraction (distinct records, including the inline-5 as their
own column — they are not "unported handlers", they are an unported ROUTE):

```
stage  distinct  ported  unported  inline5  ported %
0      92        92      0         0        100.0%   (shipped)
1      93        88      5         0         94.6%
2      78        28      5         45        35.9%   (inline-5 = the moai wall)
3      98        96      2         0         98.0%
4      28        8       16        4         28.6%   (16 unported = $B559×10, $B402/$B434×3 each)
5      98        47      51        0         48.0%   (51 unported = $B480×51)
6      111       95      16        0         85.6%
ALL    598       454     95        49        75.9%
```

(The gap between "MISSING entries (closure)" and "unported records" is
real: stage 5 has 51 unported records but they all map to ONE handler
`$B480`; stage 4's 16 map to three handlers `$B402`/`$B434`/`$B559`. The
record count is the DATA denominator; the handler count is the WORK
denominator. §6 is the work denominator.)

---

## 2. The 19/42 throwing dispatch entries — which stages reach them

`python tools/census.py dispatch` (ported set read from `src/enemies.js`).
20 distinct routines ported (covering 23 entries: `$AE70`×2, `$AEDD`×3,
`$AF10` would-be-×6 but is NOT ported). 14 distinct routines throw (19
entries). Split by reachability:

### 2a. Reached by stages 2-7 wave data — 16 entries / 11 distinct routines

| entry | type(s) | handler | reach | prg.asm bespoke span* |
|---|---|---|---|---|
| 11 | `$0B`/`$8B` | `$B37F` | stage 2, 7 | 48 lines (`$B37F`-`$B3CB`) |
| 13 | `$0D`/`$8D` | `$B402` | stage 3, 4, 5 | 33 lines (shares body w/ `$B434` via `$B407`) |
| 14 | `$0E`/`$8E` | `$B434` | stage 3, 4, 5 | 27 lines |
| 20 | `$14`/`$94` | `$CA5E` | stage 5 (inline-5 only) | 121 lines (the sun/eye, indexes `$CA49` rank + `$CA29`/`$CA2C` shape) |
| 22 | `$16`/`$96` | `$C906` | stage 3 (inline-5 only, type forced to `$96`) | 180 lines (the moai: `$0700,Y` ring-buffer writes, rank reopen `$C936`) |
| 23 | `$17`/`$97` | `$B7A1` | stage 3 (1 record) + the `$C686` warp-rain arm | 187 lines (bespoke mover, biggest single handler) |
| 26 | `$1A`/`$9A` | `$B480` | stage 6 (53 records — stage 6's signature enemy) | 70 lines |
| 28 | `$1C`/`$9C` | `$B4FD` | stage 3 (2 records) | 71 lines (shares body w/ `$B559` via `loc_B502`) |
| 29 | `$1D`/`$9D` | `$B559` | stage 5 (10 records) | 9 lines (its real body IS `$B4FD`'s `loc_B502`) |
| 30 | `$1E`/`$9E` | `$B569` | stage 7 (2 records) | 101 lines (falls into `$B574`-`$B605`, `$5B`/`$046C,X` state) |
| 32-37 | `$20`-`$25`/`$A0`-`$A5` | `$AF10` | stage 7 (12 records — 6 entries, ONE shared handler) | 26 lines (anim pick from `$AF0A,Y` by `(type-$20)`) |

\* "bespoke span" = label to next externally-callable `st_`/`sub_`/`jt_` routine
in `prg.asm`; includes internal `loc_` labels and shared-helper fall-through,
**excludes** JSR-reached infrastructure that is already ported (`$B0B4`,
`$B164`, `$B1FA`, `$B212`, `$B251`, `$B628`, `$AEDD`, `$AEE1`, `$AEF8`,
`$BDFA`, `$BCB5`). These spans are READ-only proxies for porting effort, not
line counts of new JS — most of the body is shared-mover calls.

### 2b. Throwing but NOT reached by any wave record — 3 entries / 3 routines

| entry | type | handler | how it is reached | status |
|---|---|---|---|---|
| 21 | `$15`/`$95` | `$B377` | spawned by the **stage-4 late-spawner** `$C5AD` (via `$C44F` X=4 → stream `$C633`) | throws; 6-line handler |
| 27 | `$1B`/`$9B` | `$B4F2` | **no producer found anywhere in the PRG** (plan §5: "Port never") | throws; 10-line handler. The absolute-store scan is the evidence; an indirect-pointer write would evade it (documented). |
| 40 | `$28`/`$A8` | `$BB0F` | spawned by **`$988C`** (play sub-state `$8B`, the end-of-game spawner): `LDA #$28 / STA $0315` (slot 9 `$030C`) | throws; **the end-of-game brain** — see §4 |

### 2c. Already ported (for reference) — 23 entries / 20 routines

`$AE70`(0,31), `$AEDD`(1,39,41), `$AE99`(2), `$AEE1`(3), `$B205`(4), `$B0AF`(5),
`$B198`(6), `$B6E1`(7), `$B26C`(8), `$B311`(9), `$B36F`(10), `$B3CB`(12),
`$AF2E`(15), `$AF88`(16), `$B026`(17), `$B098`(18), `$B747`(19), `$B914`(24,
boss head), `$B913`(25, boss inert body), `$B61E`(38, warp rain). All
confirmed by `grep "case 0x" src/enemies.js`.

---

## 3. The reuse-vs-bespoke split (the DELTA from stage 1)

### 3a. What stages 2-7 REUSE (already ported, free)

**All of the shared infrastructure** (per the brief): the dispatch `jt_$AE1C`,
the spawn engine (`$A2C0`/`$A335`/`$A527`/`$A3B1`/`$A3E4`/`$A411`), the play
sub-state machine `jt_$982F` + the seamless stage-end `$9904`/`$96CF`
(W24/W27), movement/rank/scroll/camera, the bullet + power-up systems, the
weapon/kill chain, and **the boss framework (W26)** — see §4.

**Plus 9 of the 11 ported "regular enemy" routines appear in stages 2-7 wave
data** (the stage-1 set is the game's common vocabulary):
- `$B205` (type `$04`) — stages 2, 3, 4, 6, 7
- `$B0AF` (type `$05`) — stages 2, 3, 4, 6, 7
- `$B26C` (type `$08`) — stages 2, 3, 4, 5, 6, 7
- `$B026` (type `$11`) — stages 2, 3, 4, 6, 7
- `$B098` (type `$12`) — stages 2, 3, 4, 6, 7
- `$AF2E` (type `$0F`) — stages 2, 4, 6
- `$B198` (type `$06`) — stages 3, 7
- `$B6E1` (type `$07`) — stages 3, 7
- `$B747` (type `$13`) — stages 3, 7
- `$AF88` (type `$10`) — stages 3, 7
- `$AEDD` (types `$27`/`$29`) — stages 2, 3, 4, 6

These eleven routines (stages 2-7's "common vocabulary") carry **the majority
of every stage's record count**: e.g. stage 7's 111 distinct records are 95
ported / 16 unported (85.6 %), and the 16 unported collapse to 3 routines.

### 3b. What is NEW (bespoke porting work) per stage

| stage | new handler routines (bespoke) | new spawner/late-spawner arms | stage-specific subsystem |
|---|---|---|---|
| 2 | `$B37F` (jellyfish-type, 1 routine) | `$C546` late-spawner | — |
| 3 | `$B402` `$B434` `$C906` (moai) `$B7A1` `$B4FD` (5 routines — **the heaviest stage**) | `$C686` stage-3 arm (function exists for warp rain; the stage-3 invocation path throws) | the moai `$0700` plasma-ring buffer |
| 4 | `$B402` `$B434` (shared with stage 3, FREE once stage 3 ports them) | `$C5AD` late-spawner (spawns `$B377`) | — |
| 5 | `$CA5E` (sun/eye, inline-5-only) `$B559` (shares body with `$B4FD`) | `$C653` late-spawner (routes through `$A4A6`) | **the destructible terrain `$0600` substrate** (see §5) |
| 6 | `$B480` (the cell/wall, 53 records) | `$C6DE` late-spawner (slot-scan, metasprite `$8D`); `$CDA5` stage-end hook (5 lines) | — |
| 7 | `$B569` `$AF10` (covers `$20`-`$25`); `$B4F2` if ever produced | `$C429` = RTS (already handled) | **the end-of-game chain** (brain + typewriter + 4 states, see §4) |

### 3c. The late-spawner `jt_$C439` — 7 arms, 1 ported, 5 throw, 1 RTS

`$C413` is NOT "stage advance" — it is the **per-stage LATE SPAWNER** that runs
during the `$82` end-of-stage countdown (the volcano eruption in stage 1).
`jt_$C439` is a 7-entry inline dispatch (`$C434 LDA $19 / JSR $83E4`), and the
**shared pattern-stepper `sub_$C44F` is already ported** (`src/enemies.js:538`).
So each arm is a thin wrapper. Status:

| `$19` | arm | spawns | ported? |
|---|---|---|---|
| 0 | `$C486` | type `$0A` volcano fireball (`$B36F`), the ONLY producer of `$0A` in the ROM | **yes** (W25, stage 1 shipped with it) |
| 1 | `$C546` | type `$0B` (`$B377`) via `$C44F` X=2 → `$C58D` | **throws** — 20-line wrapper |
| 2 | `$C686` | type `$97`/`$A6` (`$B7A1`/`$B61E`); ALSO the `$3A` warp-rain target | **warp-rain function exists** (`st_C686`); the **stage-3 invocation path throws** (one-line wiring fix once `$B7A1` lands) |
| 3 | `$C5AD` | type `$15` (`$B377`) via `$C44F` X=4 → `$C633` | **throws** |
| 4 | `$C653` | routes through `$A4A6` (inline-5 `$0600` terrain arm) | **throws** — coupled to the stage-5 terrain substrate (§5) |
| 5 | `$C6DE` | slot scan on `$0136,X`, metasprite `$8D` | **throws** |
| 6 | `$C429` | **`RTS`** — stage 7 has no late spawner | **handled** (`return`) |

So: **4 small wrapper arms to port (`$C546`/`$C5AD`/`$C653`/`$C6DE`)** + **1
wiring fix (`$C686` stage-3 path)**. Each is ~15-25 lines of JS once the
payload handler and `sub_C44F` (already ported) are in place.

---

## 4. The boss decode — per stage

**CONFIRMED (W26 recon, re-verified here): there is ONE boss in the combat
sense, and it is the same all 7 stages.** The boss-trigger scroll table
`$9A3D` = `$0C $0C $0C $0C $0B $0B $0C` (per-stage `$3F` value at which
`st_9982`/sub-state `$84` spawns it). At that scroll, `$9982` runs:

```
999D  JSR $A527          ; allocate slot 9
99A0  LDA #$98 / STA $0315   ; slot 9 $030C = $98 -> entry 24 -> $B914 (head)
99A5  LDA #$80 / STA $0335   ; slot 9 X = $80
99AA  LDA #$F0 / STA $0375   ; slot 9 Y = $F0 (off right edge)
99AF  INC $5B / INC $1B      ; advance to sub-state $85
```

So every stage's boss is **type `$98` → entry 24 → `$B914`** (head) + **type
`$99` → entry 25 → `$B913`** (inert body, a plain `RTS`). Both are ported
(W26). The body slots 7/8 are created by the head's `sub_B9B7`/`sub_B9F2`
via the `$030B,X` slot-N-1 aliasing trick (W26 recon §2). The damage ladder
`$B8EF` (6 morphs + terminator), the rank tables `$B8F8`/`$B901`/`$B90A`, the
armament quartet `$BAF7`/`$BAFB`/`$BAFF`/`$BB07`, the death chain (score +
`INC $3B` + explosion script 4 → metasprite `$A2` + `INC $1B`), and the
`$BA9C` timeout death are all decoded in `26-recon-boss.md` and ported.

| stage | boss | ported? | notes |
|---|---|---|---|
| 1 | BigCore `$B914`+`$B913` @ `$9A3D[0]=$0C` | **yes** (W26; endchain GREEN) | the only stage with a measured death frame |
| 2 | BigCore `$B914`+`$B913` @ `$9A3D[1]=$0C` | **yes** (same code) | stage-2 special: `$B962`'s `$19==1 && $04CC==1 && $04AC<$78 → INC $39` warp arm (decoded W26 §9) |
| 3 | BigCore `$B914`+`$B913` @ `$9A3D[2]=$0C` | **yes** | — |
| 4 | BigCore `$B914`+`$B913` @ `$9A3D[3]=$0C` | **yes** | — |
| 5 | BigCore `$B914`+`$B913` @ `$9A3D[4]=$0B` | **yes** | `$0B` not `$0C` — shorter approach |
| 6 | BigCore `$B914`+`$B913` @ `$9A3D[5]=$0B` | **yes** | — |
| 7 | BigCore `$B914`+`$B913` @ `$9A3D[6]=$0C`, **THEN the brain** | BigCore **yes**; brain **no** | after the BigCore dies + stage-end scroll `$98FD[6]=$0D`, `$19==6` routes `$9904 → $9872` into the **end-of-game chain** (below) |

**The plan's "a boss decode each" is therefore FREE for stages 2-7**: the
combat boss is one routine, already ported. (The plan's wording anticipated a
per-stage boss decode; the W26 recon retired that as a single decode.)

### 4a. The end-of-game chain (stage 7 only) — the actual new boss

After stage 7's BigCore dies, `$9904` runs with `$19 == 6` and does
`JMP $9872` (line 2660). That is the **end-of-game / loop-wrap chain**, and it
is the "finite end-of-game chain" the brief names as the one new piece for
loops. None of it is ported; `src/nmi.js:playArm()` throws on every sub-state
past `$86` (W27 shipped `$9904`/`$96CF` + the `$984F` warp-scroll, but `$9872`
and everything it leads to is out of W27 scope).

The chain (all read out of `prg.asm`, all currently throwing):

| `$1B` | handler | line | role | ported? |
|---|---|---|---|---|
| — | `$9872` (`loc_9872`) | 2573 | `INC $1B` ($86→$87); `INC $28,X` (the **single loop-counter write** in the whole PRG, per `loop-1a-recon.md`); `$19,$24,$3F := 0`; `$22,X := ($42?1:0)`; PPUMASK:=0 | **throws** (`nmi.js`) |
| `$8B` | `$988C` (`st_988C`) | 2592 | **the brain spawner**: allocate slots 9 and 8; slot 9 type `$28` (→ entry 40 → `$BB0F`) at X `$A4`, Y `$88`; slot 8 metasprite `$9E`; `$0100 := 3` (the ending-transition flag); sound `$E8`; `INC $1F`; canned packets `$21`,`$05` | **throws** |
| (slot 9 type `$28`) | `$BB0F` (`st_BB0F`) | 6813 | **the brain scene director**: reads the 26-record path script at `$BB82` (2-byte `[dX, Yhi|msLo]`, `$FF`-terminated), and `JMP $CE94` (the typewriter) on each frame the brain is "settled" (`$4F != $FF`). `loc_BB1F`: `DEC $4C / BNE / JSR $AEF8 / INC $1B` ends the scene. | **throws** (~73-line region `$BB0F`-`$BB85`; the path script `$BB82` is 26×2 + `$FF`) |
| (typewriter) | `$CE94` (`loc_CE94`) | 9585 | the typewriter text writer: every 8 frames (`$4E`), re-emit the line with one more character; `$FE`=pause, `$FF`=restart; script at `$CF3B` (the `$CF2D` table is **flat** — all 7 entries point at `$CF3B`, so the ending text is identical every loop; `loop-1a-recon.md` §8) | **throws** (in the `$CF2D`-`$EC1D` 7409-byte unreached region — the single largest hole in the PRG, `20-recon-late-systems.md` §6) |
| `$8C` | `$98DD` (`st_98DD`) | 2631 | `INC $5B / JSR $ADAB` (objects-only update) / `JMP $9A8C` | **throws** |
| `$8D` | `$98E5` (`st_98E5`) | 2637 | `INC $5B / $1B := 0 / JMP $9B3E` — full intro reload, now with `$19=0` and `$1A` = loop+1 restored from `$28,X` (the loop wrap) | **throws** |
| `$8E`/`$8F` | `$984F` (`st_984F`) | 2551 | the forced 4 px/frame scroll (`$984F`'s `+$0400` camera adder) | **ported** (W27 — the `$39` warp route uses the same handler) |

So the brain `$BB0F` is **not a combat boss** — it is a scripted scene with a
path-driven fly-in and the typewriter text. Its bespoke porting cost is the
path-script interpreter (~40 lines), the typewriter (`$CE94`, ~40-60 lines),
and the four small state-machine entries (`$9872`/`$988C`/`$98DD`/`$98E5`,
~10-20 lines each). **~150-200 lines of new JS total**, plus the `$CF3B`
ending-script export (data).

This chain is also **the only way `$1A` (loop counter) ever increments**
(`$9872`'s `INC $28,X`, read back into `$1A` by `$9B3E`). `loop-1a-recon.md`
established that `$1A` is a rank/difficulty scalar (NOT a wave-stream
selector): loops 2+ reuse the same wave data, terrain, and code; only 5
fire-rate/bullet-velocity scalars change (`$B003`, `$BBBF`, `$BBC9`, `$BC44`,
`$BD42`/`$BD96` — 2 of which are already ported, 3 currently throw behind the
`$BBBF`/`$BC44` gates). So **loops are nearly free once the end-of-game chain
ships** — exactly as the brief states.

---

## 5. The stage-specific subsystems

### 5a. Stage 3 (`$19=2`) — the moai (`$C906`, `$0700` ring buffer)

Type `$96` is **stage-3-only** and **inline-5-only** (45 distinct records, all
in stage 3, all via the `$A46F` arm that forces `$030C := $96`). `$C906`
(line 8820, ~180 lines) is a nametable-patching destructible that takes 3
hits, reopens on a rank-indexed timer (`$C936` = `$50 $4B $46 $41 $3C $28 $1E`,
7 rows), and writes plasma-ring packets into the **`$0700,Y` ring buffer**
(not the `$0600` terrain array — a different substrate, also used by `$CE94`).
This is the same handler the `20-recon-late-systems.md` §10 "ruled out" as a
stage-1 boss candidate — confirmed: 0 hits over a full stage-1 clear.

The inline-5 route into `$C906` is `loc_$A46F` (line 4427): `$19==2` →
allocate slot, set `$030C := $96`, X/Y/etc. **The whole inline-5 route
(`$A466`→`$A46F`/`$A4A6`) currently throws** in `src/enemies.js` (the `$A37A`
5-byte loader). Stage 3 needs `$A46F`; stage 5 needs `$A4A6` (below).

### 5b. Stage 5 (`$19=4`) — the destructible terrain `$0600` substrate (the risk)

Stage 5 is **structurally different** from the other stages: 28 distinct
records, only 8 ported (28.6 %), and **20 of its 28 records are inline-5
(4 distinct, repeated across 5 chunks)** that all force type `$14` (the
sun/eye, `$CA5E`) via the **`$A4A6` arm**. `$A4A6` (line 4461) does NOT just
spawn — it scans the **`$0600,X` destructible-terrain array** (a separate
object pool from `$030C`), looking for a free cell to mount the enemy on.

The `$0600` page is populated only when `$19 == 4`: by `$9663`'s census (the
stage-5 terrain loader) and by `$A4D7`/`$A4A6` themselves. Three coupled
gates in the port currently throw or are silent on `$19 == 4`:

| piece | line | role | port status |
|---|---|---|---|
| `$A4A6` inline-5 arm | 4461 | the terrain-mounted spawner (reads `$0600,X`) | **throws** (`enemies.js:368`) |
| `$C267`-`$C299` bullet-vs-`$0600` | — | bullet interacts with destructible wall | **throws** (`collision.js:394`, gated `$19==4`) |
| `$C32F`-`$C39A` breakable-wall VRAM patch (`$C2DC`) | — | the wall visibly crumbles | **throws** (`collision.js:847`) |
| `$8BD9`/`$8C06` terrain-object sprite pass | — | draws the `$0600`-mounted objects every frame (runs unconditionally in `$8BAB`) | **silent gap** — `src/oam.js` names `$8BAB` but not the pass; `20-recon-unported-census.md` §6 item 1 |

So porting stage 5 is not just "write `$CA5E`" — it is porting the **`$0600`
destructible-terrain substrate** (the loader, the sprite pass, the
collision/VRAM arms) as a unit. This is the single biggest stage-specific
risk in stages 2-7.

### 5c. Stage 6 (`$19=5`) — `$CDA5` + the cell enemy `$B480`

Stage 6 has **one dominant signature enemy**: type `$1A` (`$B480`, 53 of 98
records) — a state-machine creature with a `$B628`-driven animator and two
fire modes (`$B4E4`/`$B4EB` rank fire tables, `$BCB5` bullet fire, `$AEE1`
move arm). Plus the stage-end hook `$CDA5` (5 lines, called from `$9904` when
`$19==5` — a small scroll/scroll-target check), and the `$C6DE` late-spawner
(slot-scan on `$0136,X`, metasprite `$8D`). No bespoke substrate — `$B480` +
`$C6DE` + `$CDA5` is the whole stage-specific work.

The brief asks about "stage 6's track." **Not statically decidable from the
wave data alone**: nothing in stage 6's records names a "track" or rail
mechanic. What I tried: `grep` of `prg.asm` for stage-6-only tables indexed by
`$19==5`, the `census.py tables` dump, and the handlerflow reach off `$B480`.
None names a track/rail. **The "track" (if it exists) is either a property of
the terrain stream (`games/gradius/rip/stage6-terrain.txt`, not examined
here) or a dynamic behaviour of `$B480`/`$C6DE` that needs a stage-6 scenario
to observe.** Flagged per RULE 2 — the architect should treat "stage 6's
track" as needing dynamic validation, not static assertion.

### 5d. Stage 7 (`$19=6`) — the gallery + the brain

Stage 7's 17 types include the `$20`-`$25` group (entries 32-37, all →
`$AF10`, one shared 26-line handler that picks a metasprite from `$AF0A,Y` by
`(type-$20)` — a 6-frame animation gallery, "boss debris"-shaped). Stage 7
also has `$B569` (2 records, type `$1E`) and reuses stage 2's `$B37F`
(type `$0B`, 9 records). No bespoke substrate beyond the end-of-game chain
(§4a), which fires AFTER stage 7's BigCore dies.

---

## 6. The scope estimate — waves to finish stages 2-7 + end-game + loops

### 6a. The work, itemised (the architect's input)

| item | bespoke size (prg.asm proxy) | count | notes |
|---|---|---|---|
| new enemy-handler routines | 9-187 lines each (median ~70) | **11 distinct** (16 entries) | `$AF10` covers 6 entries; `$B402`/`$B434`/`$B4FD`/`$B559` share bodies |
| inline-5 route arms | `$A46F` ~30 lines, `$A4A6` ~60 lines | **2** | `$A46F` = moai; `$A4A6` = stage-5 terrain mount |
| late-spawner arms | ~20 lines each | **4 + 1 wiring fix** | thin wrappers over the ported `sub_$C44F` |
| stage-5 `$0600` substrate | the loader `$9663`, the sprite pass `$8BD9`/`$8C06`, the collision arms `$C267`/`$C32F` | **1 subsystem** | the risk; couples `$CA5E` + `$C653` + collision.js |
| end-of-game chain | `$BB0F` ~73 lines, `$CE94` ~50, 4 states ~15 each, `$CF3B` data | **1 chain** | NOT data, NOT shared — the brain scene + typewriter + loop wrap |
| title/attract/game-over modes 0-3, 6 | the `$80D4` 7-of-7 modes, `$882C`/`$8871` full-screen RLE loader | **excluded from current plan** (`00-plan.md`, `20-plan-completeness.md` §5) | separate scope |
| `$1A` loop system | 2 of 8 readers already ported; 3 throw behind `$BBBF`/`$BC44`; the flat `$CF3B` table | **nearly free** once the end-of-game chain ships | `loop-1a-recon.md` |

### 6b. Rough wave count (1 implementer per wave; ordered by dependency)

1. **Stages 2 & 4 wave handlers** — `$B37F`, `$B402`, `$B434` (3 routines; the
   `$B402`/`$B434` pair is shared by stages 3/4/5 so port it once) + stage-2
   late-spawner `$C546`. **~1 wave.** Stage 2 then plays to its boss.
2. **Stage 3 (the moai)** — `$C906` (the big one), `$B7A1`, `$B4FD`, the
   inline-5 `$A46F` arm, the `$C686` stage-3 wiring fix, `$C5AD` (stage 4's
   late-spawner that spawns `$B377`). **~1.5 waves** (`$C906` and `$B7A1` are
   the two biggest bespoke handlers in stages 2-7).
3. **Stage 5 (the risk)** — `$CA5E`, `$B559`, the inline-5 `$A4A6` arm, the
   `$0600` destructible-terrain substrate (loader + sprite pass + collision
   arms), `$C653` late-spawner. **~1.5-2 waves** (the substrate is the
   unknown; couple it to `collision.js`).
4. **Stage 6** — `$B480`, `$C6DE` late-spawner, `$CDA5` stage-end hook.
   **~1 wave.**
5. **Stage 7 + end-of-game chain** — `$B569`, `$AF10`; the brain `$BB0F` +
   path-script `$BB82`; the typewriter `$CE94` + `$CF3B` data export; the
   state-machine entries `$9872`/`$988C`/`$98DD`/`$98E5`; the 3 remaining
   `$1A` readers. **~1.5-2 waves.**
6. **Title/attract/game-over modes 0-3, 6** — separate scope per the plan.
   **~1-2 waves** (depends on the `$882C`/`$8871` full-screen RLE loader,
   which is its own open question — `00-plan.md` exclusions).
7. **Dynamic validation / loops** — SEED-ANYWHERE scenarios per stage that
   drive past each stage's first-unported scroll; rank-row coverage; the
   `$39` warp on stage 2; a loop-2 clear. **~1 wave.**

**Total: ~8-10 waves** to finish stages 2-7 + the end-of-game chain + modes +
loops validation. **Stages 2-7 core (items 1-5) is ~6-7 waves**, which matches
the plan's "per-stage marginal cost ≈ 1 wave/stage" reading for the
handler/data layer; the end-of-game chain (+~1.5), the modes (+~1.5), and
validation (+~1) are the additions the plan's §5 explicitly excluded.

---

## 7. Verdict on the "per-stage marginal cost" claim

The plan (`20-plan-completeness.md` §3/§5) and the brief frame stages 2-7 as
"mostly DATA + bespoke handlers + a boss decode each," with loops "nearly
free" and "the one new piece is the finite end-of-game chain." Measured:

- **CONFIRMED**: stages 2-7's wave data is pure DATA (598 distinct records,
  506 in stages 2-7; no new spawn engine). The shared infrastructure
  (dispatch, spawn engine, sub-state machine, movement/rank/scroll/camera,
  bullets, power-ups, kill chain) is 100 % reused. The boss is IDENTICAL
  across all 7 stages and already ported (W26) — "a boss decode each" is
  FREE, not 6 new decodes. Of the 11 stage-2-7 enemy types, 9 are stage-1's
  common vocabulary reused; only 11 new routines are needed (most small,
  median ~70 prg.asm lines), and several share bodies (`$B402`/`$B434`,
  `$B4FD`/`$B559`, the `$AF10`×6). Stage 2 needs just ONE new handler.

- **REFINED (the claim under-counts four things)**:
  1. **The inline-5 route** (`$A466`→`$A46F`/`$A4A6`, 73 records / 49 distinct)
     is an unported SPAWN ROUTE, not just data. Stage 3 needs `$A46F`; stage 5
     needs `$A4A6`.
  2. **The 5 late-spawner arms** (`$C546`/`$C686`-stage-3/`$C5AD`/`$C653`/`$C6DE`)
     are small per-stage wrappers that currently throw. (`sub_$C44F` is ported,
     so each arm is cheap, but they ARE per-stage work.)
  3. **Stage 5's destructible-terrain `$0600` substrate** is a
    stage-specific SUBSYSTEM (loader + sprite pass + collision/VRAM arms),
    not a handler — the single biggest stage-specific risk.
  4. **The end-of-game chain** (brain `$BB0F` + typewriter `$CE94` + 4 states
    + the `$CF3B` script) is a substantial NEW piece (~150-200 lines bespoke
    JS) that is neither data nor shared. It doubles as the loop-wrap point
    (the ONLY `$1A` increment lives in `$9872`), so loops are gated on it.

- **NET**: the marginal-cost claim is right in **shape** (data-driven,
  bounded, no second game of data) and roughly right in **magnitude**
  (~1 wave/stage for the handler/data layer). It under-counts the
  inline-5 route, the late-spawner arms, the stage-5 terrain substrate, and
  the end-of-game chain. A truer one-liner: **"stages 2-7 are mostly data +
  ~11 small handlers + 5 late-spawner wrappers + stage-5's terrain substrate,
  and the one genuinely new piece is the end-of-game brain scene that also
  unlocks loops."**

---

## 8. What could not be decided statically (RULE 2)

Each item names what was tried; none of these block the architect's plan, but
each must be on the implementer's "measure first" list per `00-plan.md`'s
shape ("no work unit starts without its denominator"):

- **Stages 2-7's wave decode is read-from-ROM only — zero dynamic validation.**
  This is the plan's own §5 caveat. Every per-stage "ported %" in §1 is a
  STATIC prediction; the first-unported scroll per stage needs a
  SEED-ANYWHERE scenario to validate (the W28 verdict-machine worklog names
  this). The static decode has been cross-checked by **two independent
  decoders** (`wavecensus.py` and `wavedump.py`) that agree byte-for-byte
  (`20-recon-unported-census.md` §2), so the inventory is trustworthy even
  though the runtime has not confirmed it.
- **The 73 inline-5 records have never been exercised dynamically.** Their
  decode (`$A37A` loader, `$A466` splitter, `$A46F`/`$A4A6` arms) is
  ROM-derived; the stage-3 moai wall (45 distinct records, type `$96`) and
  the stage-5 sun/eye (4 distinct, type `$14`) need scenarios that scroll
  past them on both sides.
- **The brain `$BB0F` and the typewriter `$CE94` have never been reached.**
  They live in the `$CF2D`-`$EC1D` 7409-byte region that is the single
  largest unreached hole in the PRG (`20-recon-late-systems.md` §6). Their
  decode here is from `prg.asm`; a stage-7-clear scenario is the prerequisite
  to dynamic validation, which in turn needs stages 2-7 + the chain ported.
- **"Stage 6's track" is not statically decidable.** See §5c — no `prg.asm`
  evidence of a track/rail mechanic; it is either a property of
  `rip/stage6-terrain.txt` (not examined) or a dynamic behaviour. Flagged.
- **The boss's per-stage behaviour at rank ≠ the measured row.** The endchain
  run that validated `$B914` (W26) is rank 4 (held shield). Other rank rows
  ship read-from-ROM (`$B8F8`/`$B901`/`$B90A`); the stage-2 `$19==1` warp
  arm (`$B962`) is decoded but its firing window (`$04CC==1 && $04AC<$78`) is
  tight and was not reproduced on the cartridge (`26-recon-boss.md` §12).
- **The no-producer entry `$B4F2` (type `$1B`).** The absolute-store scan
  finds no writer; "Port never" rests on that scan, which an indirect-pointer
  write would evade (`20-plan-completeness.md` §5). Documented, not blocking.
- **`wavedump.py`'s port-coverage numbers are STALE** (it carries a frozen
  10-entry `PORTED` literal). Its INVENTORY (chunks, types, scroll tables) is
  correct and was used here; its "PORTED" column was NOT — `wavecensus.py`
  and `handlerclosure.py`, which read `src/enemies.js` dynamically, are
  authoritative for coverage. Reconciling the two tools' PORTED sources is
  `20-plan-completeness.md` W28.

---

## 9. The architect's one-page summary

- **Stages 2-7 = 506 wave records, 11 new handler routines (16 entries), 5
  late-spawner wrappers, 2 inline-5 arms, 1 stage-specific substrate
  (stage-5 `$0600`), 0 new combat bosses (same `$B914` all 7 stages, ported).**
- **End-of-game chain = brain `$BB0F` + typewriter `$CE94` + 4 state entries
  + the loop-wrap `$9872`. ~150-200 lines bespoke. Gates loops.**
- **Modes 0-3, 6 (title/attract/game-over) = excluded from the current plan;
  separate scope (~1-2 waves), depends on the `$882C`/`$8871` RLE loader.**
- **Rough total: ~8-10 waves to "the whole game, loops included"; ~6-7 for
  stages 2-7 core.**
- **The "per-stage marginal cost" claim: CONFIRMED in shape, REFINED — it
  under-counts the inline-5 route, the late-spawner arms, stage 5's terrain
  substrate, and the end-of-game chain. The combat-boss decode is free.**

Key ROM addresses cited: `$A7D0` (stage table), `$A844`-`$ADAA` (wave data),
`$AE1C` (42-entry dispatch), `$9A3D` (boss-trigger per stage),
`$98FD` (stage-end per stage), `$C439` (7-entry late-spawner dispatch),
`$A466`/`$A46F`/`$A4A6` (inline-5 route), `$0600` (stage-5 terrain array),
`$B914`/`$B913` (combat boss), `$9872`/`$988C`/`$BB0F`/`$CE94`/`$CF3B`
(end-of-game chain).
