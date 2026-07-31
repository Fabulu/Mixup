# Wave 5 review: death, respawn, checkpoint — fidelity + behaviour preservation
status: DONE  (verdict: defects-found — FOUR DOCUMENTATION/MEASUREMENT defects,
               ZERO behaviour defects. The port matches the cartridge.)
wave: 5   role: review   started: 2026-07-31

## The task, as I understood it
Reviewer (READER, no src/ edits in the repo, no commits) for wave 5, commit
`0ac07d4`. NARROWED remit: fast gate + only the oracle scenarios this wave
touches; read the diff against ROM bytes; break >= 2 new checks and see them red;
then LIST EXPLICITLY WHAT I DID NOT RE-RUN.

I did NOT edit `games/gradius/src`. Every deliberate break was applied to a
**copy** of `games/gradius` in the scratchpad
(`.../scratchpad/g`, made with `tar` excluding `tools/oracle/out`, `rip`,
`tools/node_modules`, plus a one-line `package.json` with `"type":"module"`),
with a sha256 assert on restore. `git status` on the repo is unchanged
throughout except for this file.

## What I MEASURED

### 1. The gate, run by me

```
$ node --test games/gradius/tests/
# tests 189   # pass 189   # fail 0   # skipped 0   # todo 0
# duration_ms 13371.656

$ node games/gradius/tools/test-all.mjs
  23 scenarios, 7047 of 7047 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
  GREEN -- 6 passed, 0 failed, 0 SKIPPED

$ python games/gradius/tools/verify_assets.py --self-test
  31 of 31 mutations reddened their target; 12 of 12 families seen red
  (coll-shift / coll-box / coll-expl all [RED] -> collision)

$ node tools/build-dist.mjs
  rom-leak guard: 121 files checked against 2 ROM(s) -- clean,
  1 deliberate exception(s);  dist/ built: 124 files, 1701 KB
```

The 6 SKIPPED are **field**-level, not stage-level, and are the pre-existing
"no port counterpart" list — not a stage that could not run.

Arithmetic check on "0 truncated": the per-scenario compared counts sum to
exactly `rows - align - 1` for all 23 (357+85+239·16+1465+599+239·4 = 7047).
Nothing is silently dropped.

### 2. The oracle side, RE-RECORDED BY ME from the cartridge

```
$ python games/gradius/tools/oracle/scen.py --only terrain-death \
      terrain-death-miss right-wall intro-respawn
$ python games/gradius/tools/oracle/scen.py --only diag-rd-lu diag-ru-ld \
      lr-both speed3-diag speed6-right idle
```

All ten artifacts came back **sha256-IDENTICAL** to the ones the implementer
committed against (I copied them aside first). The recordings are genuine
cartridge output and are deterministic. `compare.mjs` after my re-record:
23 scenarios, 7047/7047, 0 failures.

Which scenarios actually contain a death (measured, `w_001B == $A0`):

```
diag-rd-lu   107 dying frames, first 533     lr-both       121, first 482
diag-ru-ld   121, first 445                  right-wall    121, first 493
intro-respawn 121, first 493                 speed3-diag   111, first 529
speed6-right 121, first 515                  terrain-death 121, first 501
terrain-death-miss 0     idle 0     (all other 14: 0)
```
So 8 of 23 exercise `$1B = $A0`; `terrain-death-miss` and `idle` are the
controls. That matches the implementer's list.

### 3. The ROM bytes, disassembled by me from `Gradius (USA).nes`

`dis6502.py linear` over `$BFDA-$C060`, `$C0C7-$C13D`, `$C13D-$C20A`,
`$C20A-$C33A`, `$C3A3-$C420`, `$979D-$9812`, `$9BED-$9C15`, `$96E5-$9700`.
**Every instruction quoted in src/collision.js and src/flow.js is byte-for-byte
what the cartridge holds**, including:

* `$BFDA` = `10 20 30 10` (widths), `$BFDE` = `10 20 30 02` (heights) — so
  class 0 really is `$10 x $10`, the SAME byte in both tables, and class 3 is
  the only class where they differ. The committed
  `assets/collision/tables.json` carries `[16,32,48,16,16,32,48,2]` and
  `[45,46,47,48,48,0,0]`, matching.
* `$C0FA` = `2D 2E 2F 30 30 00 00`; `$C0F1 STA $0140` genuinely falls through
  into `$C0F4 CE 40 01 DEC $0140`.
* `$C12C LDA $A1 / $C12E F9 2C 03 SBC $032C,Y` reached with carry CLEAR
  (`$C127 CMP` fell through), so the `- 1` in the port's `dy` is the borrow.
* `$C1FA 4C C4 C2 JMP $C2C4` — the death is not an RTS.
* `$9C07 E6 1B INC $1B` falls into `$9C09 A9 00 / 85 57 / A9 3F / 85 5E / 60`;
  the RTS is at `$9C11`.
* `$97B1 LDA $3F / 29 0E AND #$0E / C9 08 CMP #$08 / 90 02 BCC / A9 08 / 95 24`.

xrefs, run by me:
```
xref C0C7 -> 969D JSR, C052 JMP                (exactly two, as claimed)
xref BFE2 -> 9A70 JSR                          (one)
xref 979D -> 96F3 JMP                          (one)
xref 9C09 -> 97EB JSR, 980B JMP                (+ the fall-through)
xref C1D6 -> C1BF BEQ, C24B JMP, C290 JMP, C2C1 JMP   (the four routes)
xref C2A5 -> C0F7 JMP, C261 BNE
```

The `$C3D3` cell derivation in `tests/collision.test.js` re-derives to `$055B`
from the ROM listing independently of `src/terrain.js` — I recomputed it by
hand off my own disassembly and got the same byte and the same `$C40F[2] = $30`
mask.

### 4. Nineteen deliberate breaks, applied to the scratch copy

Unit set = `collision.test.js flow.test.js flow-unwitnessed.test.js
nmi.test.js` (49+ tests, baseline 0 fail). Corpus = `compare.mjs --only` over
8 scenarios (terrain-death, terrain-death-miss, right-wall, intro-respawn,
idle, diag-ru-ld, lr-both, speed6-right), baseline **0 failures / 1758 frames**.

| break | units | corpus |
|---|---|---|
| A swap `$BFDA`/`$BFDE` | **RED 1** (`$C127 vs $C131`) | green (class 0 is the same byte) |
| B `$0460[j+12]` for `$0460[j]` | **RED 1** | **CRASH** — `collision tables: $C01A is not in any exported range` |
| C drop the `- 1` borrow in dy | **RED 2** | **RED 197** |
| D checkpoint mask `$0E` -> `$0F` | **RED 1** | green ($3F = 0 at every death) |
| E explosion `return` instead of falling into `$C0F4` | **RED 1** | **RED 5** |
| F drop `state.bandB.ran = false` | **RED 1** | **RED 10** |
| G drop `clearAhead()` from `introPackets()` | **RED 1** | green (inert on these paths) |
| H drop `$97E3 STA $5D` | green | green — **nothing can falsify it**, exactly as the commit says |
| I `probeCollision(x + 8)` | **RED 2** | **RED 159** |
| J drop the `$C2B5` dying gate | **RED 1** | **RED 161** |
| K `$C1B8` BPL -> `type !== 0` | **RED 1** | green |
| L drop `DEC $20,X` | **RED 2** | **RED 10** |
| M `$4C = 119` not 120 | **RED 3** | **RED 867** |
| N make `STA $60` unconditional | **RED 1** | **RED 292** |
| O drop the `shotSweep()` call | **RED 3** | **RED 919** |
| P dying frame runs the TAIL not the BODY | **RED 1** | **RED 377** |
| Q five-entry explosion table | **RED 1** | **RED 30** |
| R save `$42` raw into `$22,X` | **RED 2** | green |
| S drop the `>= 8 -> 8` cap | **RED 1** | green |
| T invert the 2P switch | **RED 3** | **CRASH** |

Every break except **H** is caught by at least one check. H is the one the
commit message declares unfalsifiable and it is: I reproduce that result.

### 5. THE ONE CLAIM THAT DOES NOT REPRODUCE

The commit message and `tests/collision.test.js:80-94` both state:

> reading `$0460[j+12]` instead of `$0460[j]` was GREEN — **both are 0 on every
> frame of every scenario**, so wave 3's warning about the two different bytes
> is unfalsifiable by the corpus.

Measured over all 23 recorded artifacts (`w_0460`..`w_0469` and
`w_046C`..`w_0475`):

* `$0460-$0469` **is** 0 on every frame of every scenario — half the claim holds;
* `$046C-$0475` is **NOT** 0 anywhere. It takes values 1..64 in **all 23**
  scenarios (`right-wall`: `$0470`-`$0475` run 30..64).

and the break is **not** green on the corpus: `compare.mjs --only right-wall`
dies with

```
Error: collision tables: $C01A is not in any exported range
  (boxes $BFDA-$BFE1, explosion $C0FA-$C100).
    at playerVsEnemies (src/collision.js:234)
```

i.e. `$BFDA + 64`. So the corpus DOES falsify that break — as a hard crash from
the asset reader's bounds throw, not as a comparison diff. The port is right;
the recorded reason is wrong, and it is wrong in a source-tree comment that a
later agent will read as a measured fact.

### 5b. THE HOOK COUNTS, RE-MEASURED BY ME ON THE CARTRIDGE

```
$ python games/gradius/tools/oracle/flowprobe.py --frames 700 \
    --script "200:,10:S,190:,300:R" --hooks "BFE2,C052,C0C7,969D,C101,C2A5,..."

hook.BFE2 = 363 first 310   hook.C052 = 363 first 310   hook.C0C7 = 363 first 310
hook.969D = 0               <- the stage-5 arm NEVER fires: $C052 is the only
                               live caller, which is the wave's headline claim
hook.C101 = 243   hook.C2A5 = 362   hook.C2BC = 242
hook.C1BF = 1 @493  hook.C24B = 0  hook.C290 = 0  hook.C2C1 = 0  hook.C1AF = 0
hook.C1D6 = 1 @493  hook.979D = 1 @614  hook.97F1 = 0  hook.9C09 = 3 first 284
hook.C115 = 2421  hook.C228 = 2420  hook.C2C8 = 2178  hook.C303 = 3630
hook.BFE6 = 3267
```
**Every number the implementer reported reproduces exactly**, including the
loop shapes (2178 = 363x6, 3630 = 363x10, 3267 = 363x9, 2420 = 242x10) and the
nine-short 2421 vs 243x10.

### 6. THE FOUR DEFECTS I AM REPORTING (all documentation, none behavioural)

1. **`$0460[j+12]` is NOT 0 and the corpus DOES catch that break** — section 5
   above. Wrong in the commit message AND in
   `games/gradius/tests/collision.test.js:83-85`.
2. **`src/flow.js` `clearAhead()`: "`$5E` ... the PRG contains no reader at all
   (grep: two writers, `$99B5` and `$9C0F`, zero readers)" is FALSE.**
   `zpxref.py "Gradius (USA).nes" 5E` plus my own disassembly:
   ```
   994A  A6 3E LDX $3E / E0 D0 CPX #$D0 / 90 2D BCC $997D
   9950  A6 5E LDX $5E        <- A READER
   9952  30 29 BMI $997D
   9954  C6 5E DEC $5E        <- AND A READ-MODIFY-WRITE
   9956  A9 00 LDA #$00 / 9D 00 06 STA $0600,X ... 9D C0 05 STA $05C0,X
   ```
   `$994A` is called from `$9923` (`LDA $1C / CMP #$93 / JSR $994A`) and from
   `$99BA`, and `$99B3 LDA #$3F / STA $5E` seeds the same cursor `$9C0D` does.
   **`$994A` is the routine that CLEARS the terrain collision map
   `$0500-$06FF`** — the exact map wave 5 just wired `probeCollision()` to.
   ($AC8A `CPX $5E` that zpxref also prints is a false positive: it sits in a
   data blob, surrounded by undecodable bytes.)
   The true statement is: **two writers, one reader, and the reader is only
   reachable from play sub-states `$81-$8F`** (the end-of-stage/boss chain the
   port throws on). Not modelling `$5E` today is still right; the stated reason
   is not, and the failure mode it invites is a future wave porting `$9910-$99BD`
   and leaving the collision map uncleared between stages.
   Note by contrast that the same paragraph hedges `$39` correctly ("no reader
   on any path this port takes") — `$9937 LDX $39` is in the same unported
   block. The author knew how to hedge; `$5E` is an unhedged slip.
3. **`$1C` is not only a music byte.** The same note calls it "the
   background-music de-dupe byte `$8363` compares against" (the compare is
   actually at `$839B CPX $1C`, reached from `$8363`'s path — substantively
   right). But `$991D LDA $1C / C9 93 CMP #$93 / D0 03 BNE / 20 4A 99 JSR $994A`
   reads it to gate the map clear. `$97E9 STA $1C` is deliberately not modelled
   on that description.
4. **`src/state.js` says "MEASURED 1 in the seed of all 21 scenarios"** for
   `$0A`; the same commit made the corpus 23 and `scenarios.json` says 23. I
   measured `$0A` = 1 in the seedRam of all 23 and `w_000A` = 1 on every frame
   from 281 onward (0 only on frames 0-280, before every compared window).

### 7. Other measured cross-checks
* `$0A` in the seedRam of all **23** artifacts = 1 (`src/state.js` still says
  "all 21 scenarios" — stale by the same commit that added two). `w_000A` is 0
  only on frames 0-280, i.e. before every compared window opens.
* `bandB.ran = false` sits AFTER the `lag || state.lock` early return, so it is
  "every non-lag frame" as the comment claims.
* Fall-throughs I checked one by one and found correctly modelled:
  `$C049 -> $C04B`, `$C0F1 -> $C0F4`, `$C25B -> $C25D`, `$C2EF -> $C2F1`,
  `$C2FE/$C2FF`, `$9C07 -> $9C09`, `$C1FA JMP $C2C4`, `$C13A JMP $C20A`.

## What I did NOT re-run — READ THIS, IT IS THE TRADE
See the structured `notReRun` list returned to the orchestrator; the same list:

1. **`scen.py` for 13 of the 23 scenarios.** I re-recorded 10
   (terrain-death, terrain-death-miss, right-wall, intro-respawn, idle,
   diag-rd-lu, diag-ru-ld, lr-both, speed3-diag, speed6-right) and all 10 came
   back byte-identical. NOT re-recorded: corner-br, corner-tl, down-wall,
   enemy-waves, intro-boot, left-wall, long-idle, opt2-wiggle, pause,
   s0-handover, ud-both, up-wall, wiggle. A regression there would look like a
   stale artifact recorded against the OLD watch list silently comparing fewer
   fields — `$0A` was added to `watch` in this commit, so every artifact had to
   be re-recorded; if any of those 13 were not, `w_000A` would be missing and
   the compare would quietly not check it.
2. **`rendergate.py` / `rendercheck.py`.** The gradius pixel check that IS in
   the gate is `games/gradius/tests/ppu.test.js` and I ran it (4 tests, 0
   skipped: "natural frames rebuild pixel-for-pixel", "every break switch is
   seen to fail"). What I did NOT run is `tools/oracle/rendergate.py`, which
   rebuilds Mesen's own framebuffers and does not import `src/` at all — so
   wave 5 cannot regress it. **The real hole is elsewhere:** there is no
   end-to-end "port state -> pixels" comparison, and `$0200-$02FF` (shadow OAM)
   is NOT in the 447-address watch list. The explosion's drawn output is
   compared only through `$0120`, `spritesStored`, `msExpanded`,
   `slotsVisited` and the sprite-0 record. A wrong metasprite EXPANSION on a
   death frame would show up as a `spritesStored` count difference or not at
   all.
3. **The corpus-wide effect of my 19 breaks.** Each break was scored against 8
   scenarios, not 23. "green on the corpus" in my table means green on those 8.
   Breaks A, D, G, K, R, S are the ones I am calling green on incomplete
   evidence; K in particular (spawn-frame invulnerability) could plausibly bite
   in `enemy-waves`, which I did not include.
4. **Everything the wave left as a throw.** Game over (`$97F1`/`$96FB`, gated
   on `$B0`), the shield arm `$C1C1`, the capsule arm `$C1AF`, types
   `$27`/`$29`, the enemy-bullet body `$C24B`/`$C20A`, the stage-5 block sweep
   `$C290`, `$C18C`'s destroy-everything arm, the shot inner sweep
   `$BFE6-$C047`, `$C2C4`'s body, `$EC1E`'s death sound. I verified each is a
   throw carrying its ROM address; I did not verify any of them against the
   cartridge, because nothing reaches them.
5. **The checkpoint formula against the cartridge.** `$3F` is 0 at every death
   in the corpus, so `min($3F AND $0E, 8)` is 0 whatever it is. Break D (mask
   `$0F`) and break S (no cap) are both corpus-GREEN. The only evidence is
   `tests/collision.test.js` replaying 00-recon-flow.md's three intervention
   rows, which I did NOT re-measure with `flowprobe.py --poke 003F=N`. A
   regression would be a respawn that restarts at the wrong checkpoint for
   `$3F >= 3` — invisible until a scenario scrolls past camera page 2.
6. **The stage-3 arm `$C2B0` (`LDA $02 / LSR / BCC $C2FF`).** Modelled as
   `state.frame & 1`, unreachable on stage 1, never executed by anything.
7. **The box classes 1, 2 and 3.** `$0460,Y` is measured 0 on every frame of
   every scenario, so classes 1-3 are LISTING-DERIVED only, as the test says.
8. **Two-player.** `$0A` is 1 and `$18` is 0 everywhere; `$97C5-$97DB` is a
   no-op in every measured run.
9. **`terrain-death`'s poked cell `$05B3`.** I re-recorded the scenario and it
   reproduced, but I did not re-run `kill.py` to re-derive the cell. It is
   camera-position dependent; if the scenario's script ever changes, the poke
   silently stops landing under the ship and the scenario stops testing
   anything. `terrain-death-miss` is the only guard.
