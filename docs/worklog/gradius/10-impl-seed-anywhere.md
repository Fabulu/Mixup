# Wave 10 (follow-up) — seed the port at ANY cartridge frame

status: DONE
wave: 10   role: impl   started: 2026-08-01

## The task, as I understood it

`09-DECIDED-seed-anywhere.md`: the scenario artifact carries `seedRam`
($0000-$07FF at the align frame) and `align` is already per-scenario, so the CPU
side of "start deep" exists. What does not exist is the VIDEO state the port
rebuilds by running from the beginning — PPU nametable, palette RAM, OAM, CHR
bank — plus the terrain build cursor.

This wave runs FIRST of the three follow-ups because it is what makes the other
two testable: both crashing paths ($BC59 enemy bullets, $A3B1 single-enemy
spawn) need the ship somewhere the corpus never goes.

Done-condition that must not be weakened: a deep-seeded scenario being green is
NOT enough. Seeding INVERTS the usual trap — the risk is that the seed HIDES a
bug. So I must prove the seed is not doing the work.

Deliverable: at least one scenario aligned PAST scroll $0380.

## What I did

1. **`probe.lua`** — `PROBE_VIDEO` + `PROBE_VIDEO_AT` (a LIST of game frames). At
   the $80B5 sample point of each listed frame it writes a 2336-byte blob: PPU
   $2000-$27FF (2 KB, the two physical nametables — vertical mirroring makes
   $2800/$2C00 aliases), palette RAM $3F00-$3F1F (32 B), hardware OAM (256 B).
   Written from the exec hook, not the endFrame handler, because by endFrame
   $8087 has DMA'd a new OAM and $8A51 has drained a new queue into VRAM.
2. **`probe.py`** — plumbs it through and asserts the blob length.
3. **`scen.py`** — asks for TWO dumps: the align frame (the SEED) and the last
   frame of the window (the CHECK). New artifact fields: `seedVram`,
   `seedPalette`, `seedOam`, `seedChrBank`, `seedChrOffset`, `seedSplitRan`,
   `finalFrame`, `finalVram`, `finalPalette`, `finalOam`, `finalColl`,
   `ntChanged`, `ntHalvesDiffer`, `collChanged`. `finalColl` costs no extra
   emulator time — the per-frame RAM dump was already being taken for the seed
   and thrown away.
4. **`porttrace.mjs`** — `seedFromRam(state, ram)` → `seedFromCartridge(state,
   seed)`. Installs the nametable (+ its mirror), palette, hardware OAM, both
   render bands, **and the terrain collision map $0500-$06FF, which was already
   inside `seedRam` and had been deliberately skipped**. `loadOracle` REFUSES a
   pre-wave-10 artifact by name instead of seeding nothing. `tracePort` returns
   `finalVideo` and gained `stopOnThrow`.
5. **`compare.mjs`** — three new blocks, all counting into the verdict:
   * **VIDEO** — the port's nametable, palette and hardware OAM at the last frame
     of the window against the cartridge's. **Nothing had ever compared these.**
   * **TERRAIN MAP** — $0500-$06FF at the same frame, for the same reason.
   * **DEEP REACH** — scenarios may carry `expectThrow: {rom, atFrame}`; they are
     not field-compared, they are asserted to hit a named unported ROM address at
     a named frame, with knownFail's surprise-success rule. Plus a corpus check
     that at least one scenario aligns past scroll $0380.
6. **Three new scenarios**: `deep-page3` (align 1900, camera $0319),
   `deep-ground` (align 1700, camera $02B5, dies on real terrain),
   `deep-page4` (align 2300, camera $03E1 — past $0380). The corpus is 39.
7. **Four new neuters** that delete or corrupt what the seed installs:
   `seed-nt+1`, `seed-pal+1`, `seed-coll0`, `seed-oam0`. Three of them are wired
   into the gate's self-check stage.

### Two items on the plan's work list were ALREADY DONE

* **The terrain build cursor.** `09-DECIDED` item 3 asks to "derive the terrain
  build cursor from the seeded state rather than replaying". `porttrace.mjs` has
  seeded `$54`/`$55`/`$57`/`$58` into `state.build.{lo,hi,ahead,prog}` since wave
  1 and all four are watched fields. Nothing to do; the notes are corrected
  rather than left implying a gap.
* **The CHR bank.** `$2D` is inside `seedRam` and `src/render/ppu.js chrBank()`
  derives the offset from it; `chrOffset` is already TIER 1 on every frame. So it
  is not an input — it is now a seed-time ASSERTION instead.

## What I MEASURED

### 1. The seed carries real state, and the numbers say how much

`python games/gradius/tools/oracle/scen.py` now prints, per scenario:

```
  intro-boot     640 frames ...
     seed@282:  nt halves differ 262/1024, hwOAM vs shadow 19/256, coll   0/512,
                $2D=0 chrOffset=0
  intro-respawn  700 frames ...
     seed@614:  nt halves differ   0/1024, hwOAM vs shadow 40/256, coll   0/512
  idle           640 frames ...
     seed@400:  nt halves differ  44/1024, hwOAM vs shadow 40/256, coll   0/512,
                $2D=0 chrOffset=8192
  deep-ground   1950 frames ...
     seed@1700: nt halves differ 128/1024, hwOAM vs shadow 80/256, coll  32/512
  deep-page3    2106 frames ...
     seed@1900: nt halves differ 233/1024, hwOAM vs shadow 54/256, coll  65/512
  deep-page4    2480 frames ...
     seed@2300: nt halves differ 243/1024, hwOAM vs shadow 64/256, coll 105/512
```

**`coll 0/512` at align 400 and `65/512` at align 1900 is the whole argument for
seeding the collision map.** The old note said seeding it would "copy 512 zeros
and hide the one initialisation the comparison wants to see" — true of a corpus
that only ever aligned at 400.

### 2. THE DEEP SCENARIOS

| scenario | align | camera at align | window | result |
|---|---|---|---|---|
| `deep-ground` | 1700 | **$02B5** (693) | 1701-1949, 249 frames | PASS, all TIER 1 exact; the ship dies on the ground at f1866 |
| `deep-page3` | 1900 | **$0319** (793) | 1901-2105, 205 frames | PASS, all TIER 1 exact |
| `deep-page4` | 2300 | **$03E1** (993) | 2301-2479 | the port throws on its FIRST frame |

Before this wave every align was 282, 400 or 614 — camera $0000 or $002B — and
the deepest camera the corpus had ever COMPARED was $0308, reached by
`enemy-waves` playing 1465 frames. `deep-page3` is handed the machine and
compares camera $0319..$0380 in 205 frames.

**Finding the script was most of the work, and it is measured, not chosen.**
First death per fixed hold, from frame 210: `R` 515, `idle` 1051 (camera $0171),
`D` 1066, `U` 1076, `L` 1083, `LD` 1098, `LU` 1108, `RD` 1866 (camera $0302),
`RU` 2106 (camera $0380). From frame 400 (the corpus's boot prefix) `RU` dies at
445. Stage 1's opening kills anything not in a corner; the bottom-right corner
survives to camera $0302 and then the ground gets it; the top-right survives from
there to camera $0380 and then the first `cmd < $80` wave gets it; and mid-height
survives past that. Hence `1350:RD,324:RU,80:RD,326:R`.

### 3. WHAT `deep-page4` FOUND, and it is a THIRD unported path

```
=== DEEP REACH (align-frame scroll, past $0380) ===
  [PASS] deep-page4: align 2300, scroll $03E1, port reaches $B098 at frame 2301
         unimplemented enemy handler $B098 for type $92 (entry 18 of the
         42-entry table at $AE1C) in slot 21.
```

Read straight out of `assets/enemies/tables.json` (not guessed): stage 1's chunk
`$61=2` is the wave list at `$A859`, records are `[trigger, cmd]` firing at
`($61 + trigger>>7)*256 + (trigger*2 AND $FF)`. The first twelve are cmd
$80..$84. The thirteenth, trigger $C0, fires at **scroll $0380 with cmd $00** —
the first command < $80 in the whole stage. **Wave 3's measured boundary, in the
throw message at `src/enemies.js`, is exactly right.**

The enemy that record spawns is **type $92**, and `$92 AND $7F = $12` indexes
entry 18 of `$AE1C` → handler **`$B098`, also unported**. It is live on the
cartridge from frame 2106 and is therefore already in the pool at the align
frame. A second unported type, **$86 → `$B198`**, joins at frame 2234.

`$A3B1` itself is just out of reach on purpose: the engine reloads chunk `$61=4`
(`$A87A`) when `$3F` hits 4 at frame 2361, fires its cmd $82 records at $0400 and
$0420, and would hit trigger $20 → scroll $0440, cmd $03 next. The window's last
camera is **$043B — five pixels short**. Extending the tail by ~15 frames reaches
`$A3B1` once `$B098` and `$B198` are ported.

**So there is no green field-compared window past scroll $0380 with the port as
it stands, and that is a measured fact, not a shortfall of this wave.** The
`expectThrow` mechanism is how the reachability is pinned instead: a surprise
SUCCESS fails the run, so when wave 11/12 ports those handlers the gate forces
the annotation to be retired and the scenario promoted to a real comparison.

### 4. PROVING THE SEED IS NOT DOING THE WORK

This is the done-condition and it is answered two ways.

#### (a) Delete what the seed installs, and see what notices

`compare.mjs --only <set> --neuter X`, failure count off the summary line:

| neuter | what it deletes | deep-page3 + idle | 5-scenario gate subset |
|---|---|---|---|
| *(none)* | — | 0 | 0 |
| `seed-nt+1` | one nametable byte | **1** | **1** |
| `seed-pal+1` | one palette byte | **2** | red |
| `seed-coll0` | the whole collision map | **0 — INVISIBLE** | **104** |
| `seed-oam0` | hardware OAM | **0 — INVISIBLE** | 0 |
| `seed-x+1` | the ship's X | 5 | red |
| `seed-nosub` | both sub-pixel accumulators | 12 | red |
| `lead1` | the input lead | 64 | 249 |
| `laginject=1950` | a forced dropped NMI | 171 | red |

`seed-coll0` being INVISIBLE on `deep-page3` is why **`deep-ground` exists**. It
aligns at 1700 with 32/512 collision bytes non-zero and the cartridge's ship dies
on the ground at f1866. With the map seeded: 0 failures, 84 dying frames, exact.
With `seed-coll0` — i.e. the port exactly as it was before this wave —
**104 failures, 101 TIER 1 fields divergent, `w_0100` and `w_001B` first at
f1866**: the port flies straight through the ground. `deep-ground` is now in the
gate's self-check subset for exactly this reason; the four scenarios that subset
used to hold are all align-400, where the map is 0/512 and `seed-coll0` is a
no-op that would have been reported as a break that does not break.

`seed-oam0` is invisible and **stays invisible on purpose**: `nmi()`'s first act
on frame align+1 is `$8087`'s DMA, which rewrites all 256 bytes of hardware OAM
from the shadow before anything reads them. No compared field can depend on it.
It is seeded anyway so `seedFromCartridge()` leaves a complete machine, and it is
NOT in the gate's break list, with the reason written at both places rather than
omitted silently.

#### (b) Break `src/`, watch it go red, restore, hash both ways

Every edit below was applied with binary I/O, graded, restored, and all 21
`src/*.js` + `render/*.js` sha256-verified. **`SRC RESTORED byte-identical: True`
after every batch.**

| # | break | scenarios | result |
|---|---|---|---|
| 1 | `$9DBC` nametable address `row * 128` → `row * 129` | deep-page3, idle, enemy-waves | **RED 17** — TIER 1 *and* the new VIDEO block (34 / 63 / 296 nametable bytes) |
| 2 | `$9E94` attribute packet address `+$C0/$C4` → `+$C1/$C5` | deep-page3, idle, enemy-waves | **RED 6** (3 / 19 / 68 nametable bytes) |
| 3 | `$8087` OAM attribute mask `& $E3` dropped | + deep-ground, terrain-death | **RED 1** |
| 4 | `$C3E9` collision probe `+$14` → `+$24` | deep-ground, terrain-death | **RED 317** |
| 5 | `$C3F3` collision index `tileRow>>2` → `>>1` | deep-ground, terrain-death | **RED 317** |
| 6 | `$C3D3` collision worldLo `+8` → `+16` | deep-ground, terrain-death | **RED 213** |
| 7 | `$9F94` build cursor `+= $1A` → `+= $19` | deep-page3, idle | **RED (crash)** — `terrain: no block undefined in stages.json`, the port's own loud throw |
| 8 | `$9F7F` collision base `u8($54+$58)` → `+1` | deep-ground, terrain-death, deep-page3 | **GREEN — SURVIVED**, then **RED 2** after the fix below |
| 9 | `$9F81` collision stride `c*8` → `c*4` | deep-ground, terrain-death, deep-page3 | **GREEN — SURVIVED**, then **RED 2** after the fix below |
| 10 | `$8A88` nametable mirror mask `& $7FF` → `& $3FF` | deep-page3, idle, enemy-waves, deep-ground | **GREEN — SURVIVED**, still does |

#### The three breaks that PASSED, diagnosed rather than noted

**8 and 9 — the collision WRITE path — passed BECAUSE OF THE SEED. This is the
trap this wave was warned about, caught in the act.** Every collision cell that
kills the ship in `deep-ground` was written by `$9F55` hundreds of frames before
the align frame and is now handed to the port. The two `terrain-death` scenarios
cannot see it either — they POKE a cell into an all-zero map and never run
`$9F55` at all. So after seeding, `$9F55-$9F92` was tested by nothing.

**Fixed in this commit**, and the fix costs no emulator time: `scen.py` slices
$0500-$06FF out of the LAST frame of the RAM dump it was already taking, and
`compare.mjs` compares the map the port ENDS the window with, printing how many
cells the cartridge itself rewrote so the check states its own coverage.

Re-run of the same two breaks with the TERRAIN MAP block in place:

```
=== $9F7F collision base u8(lo+prog) -> +1   failures: 2   restored: True
=== $9F81 collision stride c*8 -> c*4        failures: 2   restored: True
SRC RESTORED byte-identical: True
```

and unbroken, over the whole corpus:

```
  [PASS] TERRAIN MAP: 0 of 512 bytes differ; the cartridge rewrote 89 over
         those windows
```

89 cells is the whole corpus's `$9F55` output inside a compared window —
`deep-ground` 37, `deep-page4` 32, `deep-page3` 4, and 16 spread over the rest.
**Every one of them comes from a scenario this wave added.** Before wave 10 that
number was 0 and the check would have been vacuous, which is why `compare.mjs`
fails outright if it ever returns to 0.

**10 — the nametable mirror mask — passed for a reason that is purely about
where the corpus goes.** Measured directly by counting the port's own queue
output per window:

```
idle:        port QUEUED 2095 bytes to $2000-$23FF and    0 to $2400-$27FF
deep-page3:  port QUEUED 1467 bytes to $2000-$23FF and    0 to $2400-$27FF
deep-ground: port QUEUED 1871 bytes to $2000-$23FF and    0 to $2400-$27FF
enemy-waves: port QUEUED 11629 bytes to $2000-$23FF and 952 to $2400-$27FF
...and CHANGED 0 bytes in $2400-$27FF in every one of the four
```

Three of four windows never write to the second nametable at all, and the one
that does writes bytes identical to what is already there — stage 1's pages 0-3
are all screen 0 (`pageOrder = [0,0,0,0,1,6,2,3,4,5,6,7,8,0]`) and the nametable
is 512 px wide, so page N and page N+2 hold the same tiles. **Folding $2400 onto
$2000 is invisible until a window's build cursor sits in an ODD page carrying a
different screen — cursor page 5 (screen 6), i.e. camera $0380..$047F. That is
exactly the region `$B098`/`$A3B1` currently block.** LEFT OPEN, with the
measurement, rather than half-fixed.

### 5. THE NEW SCREEN CHECK FOUND A REAL DIVERGENCE ON ITS FIRST RUN

Nothing in this repo had ever compared the port's nametable against the
cartridge's. `src/vram.js drainQueue` is the only nametable writer in the game
and the only check on it was `$0E`, a byte cursor. `rendergate.py` rebuilds
pictures from **Mesen's** video state and imports no `src/`, so it could not see
this either.

First full-corpus run with the VIDEO block: **879 nametable bytes differ across 7
of 37 scenarios** — `terrain-death` 179, `speed6-right` 356, `right-wall` 84,
`autofire-die` 84, `lr-both` 80, `capsule-die` 69, `diag-ru-ld` 27.

Diagnosed, not assumed: on every one of them the differing bytes are cells the
CARTRIDGE blanked (rom 0) and the port left at the seed's star tiles (58..63) —
**port == seed on 84/84, 69/69, 356/356 and 179/179 of them**, i.e. the port
wrote nothing there at all. That is `src/flow.js fullScreenLoad()`'s own declared
gap: *"$8849-$886B: PPUADDR = $2000 and six JSR $8871 chunks. NOT PORTED."*
`$882C` rewrites 2304 bytes from $2000 on every stage load.

Treated as `knownFail $8871`, with the excuse **DERIVED, not listed**: it applies
exactly when the cartridge's `$1B` re-enters the intro set {1,2,3,4} inside the
window. That is 10 of 37 scenarios and three of those ten (`intro-boot`,
`intro-respawn`, `capsule-shield`) are byte-exact anyway. **The other 27 —
including all three deep scenarios and every long one — are graded strictly, and
all 27 are 0/2048.** The annotation is held to account at corpus level: if no
excused window diverges any more, the run fails as STALE.

### 6. Two things I got wrong, both caught by measurement

1. **The seed-time CHR assertion was wrong on its first version.** I asserted
   `chrBank($2D) * $2000 == chrOffset`. On `idle` that is 0 vs the cartridge's
   8192. `$80B5` is at scanline ~231, AFTER `$9AA3`'s sprite-0 spin, so the
   offset in force is band B's (`$9ABF LDY #$02` → bank 1 → 8192), not `$2D`'s.
   The artifact carries `seedSplitRan` and the assertion picks the band.
2. **"The two nametables are never identical" was wrong.** I made it a hard error
   in `scen.py` and it fired on `intro-respawn` (align 614, ntdiff 0) — a REAL
   state: `$8871` pushes 2304 bytes from $2000, past $23FF, filling both halves
   with one image. Moved to corpus level: identical in ONE scenario proves
   nothing, identical in ALL of them is a mirrored read.

### 7. A NEAR MISS I CAUSED AND FIXED: prose that broke a regex the gate reads

`test-all.mjs`'s self-check stage read `/(\d+) failures/` — **the first match
anywhere in stdout**. `compare.mjs` prints each scenario's `why`, and
`deep-ground`'s `why` quotes its own evidence ("seed-coll0 -> 104 failures").
The stage would have graded every deliberate break against a number baked into a
description. I hit it in my own break harness first, which is the only reason I
looked. Now anchored on the summary line:
`/frames compared \([^)]*\), (\d+) failures/`. This is the exact shape that
stage's own header already warns about — validating a check with a signal that
means something else.

### 8. THE GATE, run cold, at the end

```
python games/gradius/tools/oracle/scen.py
  === ORACLE CORPUS: 39 scenarios, align frame 400, 872 watched addresses ===
  (all 39 re-recorded from the cartridge under Mesen, this commit)

node games/gradius/tools/oracle/compare.mjs
  38 scenarios, 12748 of 12748 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED (pad2 oamBudget spriteOverflow
  scanline cpuCycle splitSpins)

  === DISPLAY LIST COVERAGE ($0200-$02FF) ===
    38/38 scenarios compared, 813056 slot-frames, 176679 live
    [PASS] 0 Y mismatches, 0 live-slot content mismatches
  === VIDEO COVERAGE (PPU $2000-$27FF, $3F00-$3F1F, OAM) ===
    38/38 scenarios compared their screen; the cartridge rewrote 2148 nametable
    bytes over those windows; 37 have two DIFFERENT nametables at their align frame
    [PASS] TERRAIN MAP: 0 of 512 bytes differ; the cartridge rewrote 89
    [PASS] 0 nametable (over 28 strictly graded scenarios), 0 palette,
           0 hardware-OAM bytes differ
    [STILL BROKEN] knownFail $8871: 7 of 10 windows with a stage load diverge,
           879 bytes total
  === DEEP REACH (align-frame scroll, past $0380) ===
    [PASS] deep-page4: align 2300, scroll $03E1, port reaches $B098 at frame 2301
    [PASS] 1 scenario(s) align past $0380: deep-page4@$03E1

node --test games/gradius/tests/
  # tests 292   # pass 292   # fail 0   # skipped 0   # todo 0

node games/gradius/tools/test-all.mjs
  neuter lead1          -> RED, 249 TIER 1 failures (good)
  neuter seed-x+1       -> RED, 123 TIER 1 failures (good)
  neuter laginject=450  -> RED, 731 TIER 1 failures (good)
  neuter seed-nt+1      -> RED,   1 TIER 1 failures (good)
  neuter seed-pal+1     -> RED,   5 TIER 1 failures (good)
  neuter seed-coll0     -> RED, 105 TIER 1 failures (good)
  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
  PASS  sound data == the measured ownership window (snddata.py --selfcheck)
  PASS  port trace shape == probe.lua state vector
  PASS  the renderer rebuilds the cartridge pixel-exactly (rendergate.py)
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken

  GREEN -- 8 passed, 0 failed, 0 SKIPPED
```

**0 SKIPPED at both levels** — 0 skipped stages and 0 skipped tests.
`38 scenarios` in compare.mjs and `39` in scen.py is not a discrepancy:
`deep-page4` is recorded like every other scenario and graded by DEEP REACH
rather than field by field, because the port cannot execute its window.

## What I could not do, and why

1. **No green FIELD-COMPARED window past scroll $0380.** Measured and explained
   in §3: three unported paths sit at or immediately past the boundary
   (`$A3B1` at scroll $0380, `$B098` for type $92, `$B198` for type $86).
   `deep-page4` delivers the align frame past $0380 and pins the throw; it cannot
   deliver a comparison until waves 11/12 land.
2. **The second nametable page ($2400-$27FF) is not distinguishable** by any
   compared window — §4, break 10. Same root cause as (1).
3. **`$0500-$06FF` is still not in the WATCH list.** The end-of-window comparison
   added here catches a wrong derivation but not the frame it first went wrong
   on. Watching the range is 512 more addresses and ~60% artifact growth
   (99-final-verification.md item 1); `peek()` still does not map it.
4. **The live browser path cannot start deep.** `seedFromCartridge` is an oracle
   concept; `src/main.js` still boots into the cartridge's own intro. Nothing
   asked for a deep start in the browser and no ROM-derived seed may be shipped.
5. **`games/ddpdoj/` and `games/batman/`: not touched, not measured.** The shared
   index still carries another agent's staged deletions — **67 entries**, mostly
   `D` on files that exist on disk, exactly as `99-final-verification.md` §9
   described. I committed through a private index (`.git/gradius.index`),
   read-tree'd immediately before the commit.

   **One consequence worth knowing, because it is not obvious.** Committing from
   a private index MOVES HEAD, and the shared index still describes the OLD
   HEAD — so straight after my commit, `git status` showed my 13 files as `MM`
   and `10-impl-seed-anywhere.md` as `D`, i.e. the shared index had become armed
   to revert this whole wave. I fixed only my own 14 paths (`git add` them into
   the shared index, working tree already == HEAD, so they simply become clean)
   and verified the 67 ddpdoj/batman entries were byte-identical before and
   after. I did NOT clear or reset anything else. **Whoever owns ddpdoj: your
   index is still staged with those deletions.**

## If someone picks this up cold

* The corpus is **39 scenarios** now, not 36. Any artifact in
  `tools/oracle/out/scen/` recorded before this commit is stale and
  `loadOracle()` will say so by name, with the command to fix it.
* `seedFromRam` is gone. It is `seedFromCartridge(state, seed)` and `seed` is an
  OBJECT; passing a bare `Uint8Array` throws a message that says so.
* To see the new checks bite in ten seconds each:
  ```
  node games/gradius/tools/oracle/compare.mjs --only deep-ground --neuter seed-coll0
  node games/gradius/tools/oracle/compare.mjs --only idle --neuter seed-nt+1
  ```
* **For wave 11/12**: `deep-page4` is your reproduction. Port `$B098` and
  `$B198`, delete the `expectThrow` block from its entry in `scenarios.json`, and
  the scenario becomes an ordinary field comparison. Extend its tail by ~15
  frames and the camera passes $0440, where `$A3B1` is.
* The full sequence I ran:
  ```
  python games/gradius/tools/oracle/scen.py
  node   games/gradius/tools/oracle/compare.mjs
  node   games/gradius/tools/test-all.mjs
  node   --test games/gradius/tests/
  ```
