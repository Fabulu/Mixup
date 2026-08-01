# Review of wave 10 — seed the port at any cartridge frame
status: DONE — wave 10 is SOUND; 4 real defects in the CHECKS, none blocking
wave: 10   role: review   started: 2026-08-01

## The task, as I understood it

Review, as a READER (no src/ edits, no commits), the wave-10 implementation
committed as `8ffe85d` + `ff6e7a9`. Specifically:

- Does the new code match the ROM at the addresses it cites? Spot-check bytes.
- The fall-through trap.
- IS THE SEED HIDING BUGS? Corrupt a value the seed sets and see if anything notices.
- Are the new checks capable of failing? Break >=2, watch red, restore, hash-verify.
- Did the 36 existing scenarios regress? Display list is watched now.
- Run the gate MYSELF. gateGreen must reflect a gate I ran.

## What I did

1. Read `docs/worklog/README.md`, `09-DECIDED`, `06-FINDING`, `99-final-verification`,
   `10-impl-seed-anywhere.md`, and the full diff of `8ffe85d` + `ff6e7a9`.
2. Ran the gate cold, myself (below).
3. Re-recorded the whole corpus from the cartridge with `scen.py` and diffed the
   artifacts against the ones in the tree.
4. Spot-checked every ROM address the wave cites against `assets/prg.bin`.
5. Independent break experiments (src/ restored + sha256-verified each time).

## What I MEASURED

### 1. The gate, run by me, cold (before touching anything)

```
node --test games/gradius/tests/
  # tests 292  # pass 292  # fail 0  # skipped 0  # todo 0

node games/gradius/tools/oracle/compare.mjs
  38 scenarios, 12748 of 12748 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED
  DISPLAY LIST: 38/38, 815872 slot-frames, 178577 live, 0 Y, 0 live-content
  VIDEO: TERRAIN MAP 0/512 (cartridge rewrote 89); 0 nametable over 28 strict,
         0 palette, 0 hardware-OAM; [STILL BROKEN] knownFail $8871 7 of 10, 879 B
  DEEP REACH: deep-page4 reaches $B098 at f2301; 1 scenario past $0380

node games/gradius/tools/test-all.mjs
  GREEN -- 8 passed, 0 failed, 0 SKIPPED
  6 neuters all RED (lead1 249, seed-x+1 123, laginject=450 731,
                     seed-nt+1 1, seed-pal+1 5, seed-coll0 105)
```

**GATE GREEN, 0 SKIPPED, verified by me, not quoted.**

Two numbers in `10-impl-seed-anywhere.md` §8 do not reproduce: it reports the
display list as `813056 slot-frames, 176679 live`; the real numbers are
`815872 / 178577` (= 12748 x 64, which its own summary line implies). That block
mixes a stale run's numbers into the final gate transcript.

### 2. The oracle side, re-recorded from the cartridge

`python games/gradius/tools/oracle/scen.py` (full, no `--only`), then sha256 of
every artifact against the tree copy. **All 39 byte-identical**, including every
new field (`seedVram/seedPalette/seedOam/seedChrBank/seedChrOffset/
seedSplitRan/finalVram/finalPalette/finalOam/finalColl/ntChanged/
ntHalvesDiffer/collChanged`). Nothing was hand-edited.

### 3. ROM spot-checks (`assets/prg.bin`), every address the wave cites

| cited | bytes | verdict |
|---|---|---|
| `$AE1C` entry 18 | `98 B0` | **$B098** ✓, and `$92 AND $7F = $12` = 18 ✓ |
| `$AE1C` entry 6 | `98 B1` | **$B198** ✓, `$86 AND $7F` = 6 ✓ |
| `$AE1C` length | 42 entries, ends $AE70 (`60` RTS = handler 0) ✓ |
| `$B098` | `A9 92 9D 0C 03` = LDA #$92 / STA $030C,X | ✓ type-$92 handler |
| `$A3B1` | `A2 09 BD 0C 03 F0 04 CA 10 F8 60` | ✓ the 10-slot free search |
| `$BC56` | `90 01` BCC, `$BC59` = `A2 09` | ✓ 05-FINDING's addresses |
| `$8085/$8087` | `A0 02 8C 14 40` | ✓ LDY #$02 / STY $4014 |
| `$8AA8` | `30 32 31 33` | ✓ the CHR latch table |
| `$9AA3` | `AD 02 20 29 40 F0 F9` | ✓ the sprite-0 spin |
| `$9ABF` | `A0 02` | ✓ band B LDY #$02 |
| `$9F94` | `A5 58 29 07 C9 06 90 15 A9 19 65 58` | ✓ `+= $19 + carry` = $1A |
| `$A859` chunk (`$61=2`, `chunkTable $A7DE`+2) | see below | scroll/cmd ✓, **offset prose wrong** |

`$A859`'s records are `00 81 20 80 30 82 40 82 50 82 60 83 70 84 80 83 90 82
A0 82 B0 82 C0 00 ...`. The first record with `cmd < $80` is `C0 00`, at
**`$A859+$16`**, and it is the **twelfth** record (eleven precede it). The wave's
prose says "`$A859+$18`" and "the thirteenth" — off by one in both, twice
(worklog and commit message). The load-bearing numbers are right: trigger $C0
with `$61=2` gives `hi = 2+1`, `lo = $80` -> **scroll $0380, cmd $00**, exactly
what `src/enemies.js fireWave` computes and what wave 3 put in the throw.

Camera positions, read off the artifacts, all confirmed:
`deep-ground` align $02B5 -> last $0332; `deep-page3` $0319 -> **$0380**;
`deep-page4` $03E1 -> $043B; `enemy-waves` $002B -> $0308.

### 4. IS THE SEED HIDING BUGS — my own breaks, all restored + sha256-verified

Every run below: edit `src/`, run `compare.mjs --only ...`, restore from the
original bytes, re-hash all 21 `src/**/*.js`. **RESTORED byte-identical: True
after every one.**

| # | break | scenarios | result |
|---|---|---|---|
| R1 | `src/terrain.js` `$9F81` stride `c*8` -> `c*4` | **enemy-waves alone** | **RED** — TERRAIN MAP 39/512 (`first $508`), while TIER 1 stayed **exact** |
| R2 | `src/vram.js` palette value `b` -> `b ^ 1` | idle, intro-boot, deep-ground | **RED on intro-boot only** (palette 28/32). idle and deep-ground GREEN |
| R3 | `src/vram.js` nametable addr `- 0x2000` -> `- 0x1FFF` | idle, terrain-death, right-wall, enemy-waves | **RED on idle (128) and enemy-waves (443)**; **terrain-death (386) and right-wall (397) graded `[KNOWN]` and counted 0** |
| R4 | `src/vram.js` mirror mask `& 0x7FF` -> `& 0x3FF` | idle, enemy-waves, deep-ground, deep-page3 | **GREEN — SURVIVES** (impl's finding reproduced) |
| R5 | `src/oam.js` DMA `& 0xE3` dropped | idle, terrain-death, enemy-waves, deep-ground, intro-boot | **RED via TIER 1 `s0a`** (terrain-death@624, intro-boot@283). The new VIDEO hardware-OAM arm read **0/256 on all five** |
| R6 | `src/enemies.js` add `case 0xB098: return;` | idle, deep-page4 | **RED** — DEEP REACH, message no longer names `$B098` |
| R7 | `scenarios.json` `expectThrow.atFrame` 2301 -> 2302 | idle, deep-page4 | **RED** — DEEP REACH frame arm |
| R8 | neuter `seed-oam0` (no src edit) | intro-boot, deep-ground, deep-page3, enemy-waves, terrain-death | **0 failures — INVISIBLE**, impl's claim reproduced |
| R9 | `src/render/ppu.js` `chrBank` `sel` -> `sel ^ 1` | idle, deep-page3, intro-boot | **RED (crash)** — the new seed-time CHR assertion fires: `$2D = 0, split ran -> CHR offset 24576, but the cartridge reported 8192` |

### 5. What those breaks establish, and what they falsify

* **R1 falsifies the wave's own coverage claim.** `10-impl` §4 and the commit
  message say the TERRAIN MAP check's 89 changed cells "**every one of them
  comes from a scenario this wave added**". Measured per scenario:
  `enemy-waves 44`, `deep-ground 37`, `deep-page3 4`, `missile-wall 2`,
  `missile-wall-miss 1`, `terrain-death-miss 1` = 89. **The largest single
  contributor, 44 of 89, is `enemy-waves` — a pre-existing align-400 scenario**
  (the last three are the scenarios' own `$05xx` pokes, not `$9F55` output). R1
  shows `enemy-waves` catches the stride break **on its own**. The check is
  therefore stronger than claimed and does not depend on the new scenarios; the
  claim as written is wrong.
* **R2: the palette arm of VIDEO has exactly ONE scenario of coverage and no
  vacuity guard.** Measured `finalPalette != seedPalette` across all 39
  artifacts: non-zero in `intro-boot` only (11/32). `nt` has a corpus guard
  (`ntChangedTotal === 0` -> FAIL) and `coll` has one (`collChangedTotal === 0`
  -> FAIL); **palette has neither**. If `intro-boot` is deleted or shortened,
  `0 palette bytes differ` becomes seed-compared-to-seed and prints `[PASS]`
  forever. The `seed-pal+1` neuter does NOT cover this: it corrupts the seed,
  which nothing overwrites, so it goes red without any port palette write.
* **R3: the `$8871` excuse is broader than its own diagnosis.** `compareVideo`
  excuses the WHOLE nametable of any window in which `$1B` re-enters {1,2,3,4}.
  The diagnosis behind it is byte-level and is stated in the code itself — "the
  differing bytes are cells the CARTRIDGE blanked and the PORT left at the
  seed's star tiles — port == seed on 84/84, 69/69, 356/356, 179/179". That
  predicate is encodable (`port.nt[i] === seed.vram[i]`, and `seed.vram` is
  already loaded), and it was not encoded. Consequence, measured: a genuine
  one-byte address error in `drainQueue` adds **520 wrong bytes across two
  excused scenarios** and contributes **0** to the verdict. 10 of 38 scenarios
  are affected, and they are the interesting ones — every death/respawn window
  (`terrain-death`, `right-wall`, `diag-ru-ld`, `lr-both`, `speed6-right`,
  `autofire-die`, `capsule-die`) plus the two intros and `capsule-shield`.
* **R5 falsifies "Nothing else tests that mask."** `compare.mjs` lines 216-219
  justify the hardware-OAM arm with the `$8087` `& $E3` mask. Dropping the mask
  is caught by the **pre-existing TIER 1 field `s0a`** (hwOam[2]) and the new
  arm reports 0/256 on all five scenarios I ran. Combined with R8 (`seed-oam0`
  invisible), the hardware-OAM arm of VIDEO is measured to catch nothing that
  something older does not already catch. The impl's own table row 3 ("RED 1")
  is that same `s0a` failure, attributed to the new block.
  **The narrow excuse is feasible today and I measured it both ways.** Script:
  `scratchpad/w10narrow.mjs`, which traces the port and classifies every
  differing nametable byte.

  ```
  UNBROKEN (all 10 excused scenarios)
    intro-boot 0 / intro-respawn 0 / capsule-shield 0
    terrain-death 179  right-wall 84  diag-ru-ld 27  lr-both 80
    speed6-right 356   autofire-die 84  capsule-die 69
    TOTAL diff 879, excusable (port==seed && rom!=seed) 879, NOT excusable 0

  WITH R3's one-byte drainQueue address error
    terrain-death  diff 386  excusable 175  NOT excusable 211
    right-wall     diff 397  excusable  80  NOT excusable 317
    speed6-right   diff 374  excusable 279  NOT excusable  95
    TOTAL diff 1157, excusable 534, NOT excusable 623
  ```

  So the byte-level excuse would be **0/879 today** and would catch **623 wrong
  bytes** the blanket excuse counts as zero. Nothing has to be re-recorded:
  `loadOracle` already decodes `seed.vram`.
* **R4 confirms the one break the wave left open**, with the wave's own
  explanation intact.
* **R6/R7 confirm both arms of DEEP REACH can fail.**
* **R8 confirms `seed-oam0` is inert.** I also checked the stated reason
  end-to-end: `nmi()` returns before `oamDma()` on a lag frame, and `intro-boot`
  is the one scenario with a drop recorded at `align+1` (f283) — so I ran it
  explicitly. Still invisible. The reason holds; seeding hwOam is harmless and
  correctly kept out of the gate's break list.

### 6. Regression check on the 36 pre-existing scenarios

No regression. All 36 PASS with all TIER 1 fields exact, display list 0/0 over
815,872 slot-frames and 178,577 live slots, lag exact everywhere, and the
artifacts re-record byte-identically from the cartridge. The new seeding is a
measured no-op on them: `$0500-$06FF` is **0/512 non-zero at the align frame of
all 36**, and nothing in `src/` reads `vram.nt`/`vram.pal`/`hwOam` except
`render/ppu.js` and the `s0*` sample, so the video seed cannot move a TIER 1
field on an align-400 window.

### 6b. The gate re-run on MY re-recording (the number that counts)

```
python games/gradius/tools/oracle/scen.py
  === ORACLE CORPUS: 39 scenarios, align frame 400, 872 watched addresses ===
  sha256 vs the tree: ALL 39 artifacts re-recorded; 0 differ

node games/gradius/tools/oracle/compare.mjs
  38 scenarios, 12748 of 12748 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED
node games/gradius/tools/test-all.mjs   GREEN -- 8 passed, 0 failed, 0 SKIPPED
node --test games/gradius/tests/        292 pass, 0 fail, 0 skipped
```

### 7. Smaller things

* **`seed-nt+1` rests on one scenario too, and that is not written down.**
  `--only wiggle,corner-br,speed3-diag,opt2-wiggle,deep-ground --neuter
  seed-nt+1` -> the four align-400 scenarios are `nametable 0/2048` (the
  streamer rewrites PPU `$2123` inside their windows and heals the corruption);
  only `deep-ground` reports `1/2048`. So TWO of the three new gate neuters
  (`seed-nt+1`, `seed-coll0`) are load-bearing on `deep-ground` alone. That is
  documented for `seed-coll0` and not for `seed-nt+1`, whose comment reads as
  though the byte is generally visible.

* `compare.mjs --only <subset>` exits **1** whenever the subset's cartridge
  rewrote no nametable or collision bytes — the two vacuity guards are not
  `fullRun`-gated (DEEP REACH's is). `--only idle` prints `0 failures` and
  `2 video-coverage failures` and returns 1. The impl's own "see it bite in ten
  seconds" recipe (`--only idle --neuter seed-nt+1`) is in that class.
  `test-all.mjs` is unaffected: it reads the summary line, not the exit code,
  and its subset contains `deep-ground` (ntChanged 122, collChanged 37).
* `test-all.mjs` prints `RED, N TIER 1 failures` where `N` is the summary total
  (TIER 1 + lag + display list + video). For `seed-nt+1` and `seed-pal+1` the
  failures are **entirely VIDEO**, so the label is wrong for exactly the two
  neuters this wave added.
* The regex near-miss (`/(\d+) failures/` picking up `deep-ground`'s `why`)
  would have produced `base.n = 104` and a **loud stage FAILURE**, not a silent
  pass — the fix is right, the danger is overstated.
* `$B198` is described as "unported" throughout; `src/enemies.js` actually has
  `case 0xB198: return h_B198(j);` whose body is a throw saying the body is
  shared with `$B205` and ported but the entry is not. Effect is the same, the
  wording in the worklog is looser than the code.
* Docs: `tools/oracle/README.md` and `PROBE.md` document neither the artifact
  schema nor `probe.lua`'s env vars, so they are **not** stale. `seedFromRam`
  survives only in historical worklogs and in the new error message that names
  it deliberately.

## What I RULED OUT

* **A regression in the 36 pre-existing scenarios.** Not present. All PASS, all
  TIER 1 exact, display list 0/0 over 178,577 live slot-frames, lag exact, and
  every artifact re-records byte-identically.
* **A doctored artifact.** Not present: all 39 reproduce byte-for-byte from the
  cartridge under Mesen, including all 13 new fields.
* **The seed silently overwriting a wrong port value.** Tested field by field:
  collision map (R1 — visible on a pre-existing scenario), nametable (R3 —
  visible on strict scenarios), palette (R2 — visible on one), CHR derivation
  (R9 — asserted at seed time and the assertion fires), hardware OAM (R8 —
  provably inert, documented as such). The one genuinely untestable seeded
  field is hardware OAM and it is correctly kept out of the gate's break list.
* **A ROM address the wave got wrong.** Every cited address checks out against
  `assets/prg.bin`. Only the RECORD OFFSET prose (`$A859+$18`) is wrong, and the
  artifact's own `$6A` cursor (ending at 111 = `$A86F` = `$A859+$16`) settles it.
* **`tools/oracle/README.md` / `PROBE.md` going stale.** They document neither
  the artifact schema nor `probe.lua`'s env vars, so no doc was left behind.
* **The `test-all.mjs` regex being a silent hazard.** With the old regex the
  baseline would have read 104 and the stage would have returned FAIL loudly.

## What I could not do, and why

1. **I could not compare a single field-compared frame past scroll `$0380`.**
   Confirmed the wave's own account: `deep-page3`'s last compared frame is
   f2105 at camera **`$0380` exactly**, and the record at `$A859+$16` fires on
   the next frame with `cmd $00`. `deep-page4` is graded only by DEEP REACH.
   That limit belongs to waves 11/12, not to this review.
2. **I did not re-run `rendergate.py` separately** — it runs inside
   `test-all.mjs`, which I ran, and it imports no `src/`.
3. **`games/ddpdoj/` and `games/batman/`: not touched, not measured.** I did
   not commit anything and did not stage anything, so the shared index is
   exactly as I found it (still carrying another agent's staged deletions).
4. I am a READER: every `src/` and `scenarios.json` edit above was a deliberate
   break, restored in the same command, with sha256 over all 21 `src/**/*.js`
   verified after each one and once more at the end
   (`SRC IDENTICAL TO SESSION START`). `git status --porcelain games/gradius/`
   is empty apart from this worklog.

## If someone picks this up cold

**The wave is sound. The port is right where it is checked, the artifacts are
real, the new checks bite, and the gate is green with 0 skips — I ran it.**
Nothing here needs reverting. What needs doing, in value order:

1. **Narrow the `$8871` excuse in `compare.mjs compareVideo()`.** Replace the
   blanket `ntKnown: introInWindow` with the byte predicate the code's own
   comment already states: excuse byte `i` only when
   `port.finalVideo.nt[i] === oracle.seed.vram[i] && oracle.final.nt[i] !== oracle.seed.vram[i]`.
   Measured: 0 residual today, 623 wrong bytes caught under a real one-byte
   `drainQueue` error. Ten scenarios — including every death/respawn window —
   currently have their whole nametable comparison switched off.
2. **Give the palette a vacuity guard** like `ntChangedTotal` and
   `collChangedTotal` have. Measured coverage is ONE scenario (`intro-boot`,
   11/32 bytes). Compute `palChanged` in `scen.py` and fail the corpus at 0.
3. **Fix or delete the hardware-OAM arm's justification.** "Nothing else tests
   that mask" is false — `s0a` does, and it is what actually went red when I
   dropped `& $E3`. Either keep the arm as belt-and-braces and say so, or state
   what it is measured to add (currently: nothing).
4. **Correct three numbers in `10-impl-seed-anywhere.md`** (and the commit
   message): the record is at `$A859+$16` and is the twelfth, not `+$18` /
   thirteenth; `collChanged 89` is NOT all from wave-10 scenarios (44 of it is
   `enemy-waves`, which catches the `$9F81` break by itself); the display-list
   figures in the §8 gate transcript are from a stale run.
5. `compare.mjs --only <subset>` exits 1 from the un-`fullRun`-gated video
   vacuity guards whenever the subset happens to rewrite no nametable or
   collision bytes. Gate them like DEEP REACH's, or say so in the recipe.
