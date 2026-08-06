# Wave 4 - Flow structure: the $1B ladder, the stage intro, pause
status: DONE
wave: 4   role: impl   started: 2026-07-31

## The task, as I understood it

Mode 5 stops being "constant $1B = $80" and becomes the cartridge's real
bitfield ladder at `$96A5`. The five intro states (`$9B3E $9BED $9C12 $9C1E
$9C24`) exist and are driven from a seeded mode-4-entry state, compared per
frame against the cartridge's recorded boot and respawn windows. `$0D` becomes
a real PPUMASK behaviour. Pause (`$9ADA` + `$9650`'s jump to `$9A8C`) works and
is compared. Every unported ladder arm throws with the ROM address it would
have reached.

## What I did

### New / changed

| file | what |
|---|---|
| `src/flow.js` **new** | `$96BE` dispatch, `$9B3E` `$9BED/$9BF0` `$9C12` `$9C1E` `$9C24` `$9C3C`, `$882C`'s RAM side effects, `$9AD1/$9ADA/$9AFF` pause, `$9765` the button-code matcher |
| `src/nmi.js` | the `$96A5` ladder with every unported arm a named throw; `$9650`'s pause jump; `$982A`/st_9A4D play arm; `$96EF` dying arm; `mode5Body()`; `mode5Tail(…, test1B)`; `$0D` comment corrected with measured numbers; `frameDrops`/`work.enemySlots` reset |
| `src/terrain.js` | `$9D8E` split out of `$9D83` as `buildBlock()`; **`preloadTerrain()` deleted** and its "NEITHER has been measured" note replaced with the measurements |
| `src/main.js` | `introEntryState()`; `boot()` plays the real intro instead of preloading |
| `src/state.js` | `$19 $4C $09 $16 $33 $3B,X $22/$24/$26/$28,X`, and `frameDrops` |
| `src/oam.js` | hardware OAM masks attribute bits 2-4 (`& $E3`) - see MEASURED 3 |
| `src/hud.js` | the four producers exported (the intro calls them directly) |
| `src/assets.js`, `tools/export_assets.py`, `tools/verify_assets.py` | new `flow` asset family: `$9BCC-$9BEC` (start positions) and `$9785-$979C` (button codes), with a `check_flow` family and three mutations |
| `tools/oracle/scenarios.json` | three new scenarios, per-scenario `align`, 13 new watched addresses, three UNMODELLED entries retired |
| `tools/oracle/scen.py` | per-scenario `align` override |
| `tools/oracle/porttrace.mjs` | seeds/peeks the new bytes; `lagged` is now a per-frame DROP COUNT, not a boolean |
| `tools/oracle/compare.mjs` | truncation is a set of modelled `$1B` values, not `$1B & $80`; port lag is summed |
| `tests/flow.test.js` **new** | 17 tests |
| `tests/frame-gates.test.js` | the `$965C-$9660` knownFail retired itself (SURPRISE PASS) and was unwrapped |

### Deliberately NOT ported, each a named throw carrying its ROM address

`$96CF` (next stage), `$96FB` (game over - gated on `$B0`, uncharacterised),
`$979D` (respawn, wave 5), play sub-states `$81-$8F` (`$9A0E`… the boss chain),
`$9663`'s stage-5 `$5C` census, `$9C5E` (the pause-screen cheat), `$8871`'s 2304
PPU writes, `$8357` (CHR select + BGM), every `$EC1E` request.

## What I MEASURED

### 1. The intro, both windows, on the cartridge

```
python games/gradius/tools/oracle/flowprobe.py --frames 340 \
  --script "200:,10:S,130:" --hooks 9B3E,9BF0,9C12,9C1E,9C24,9C3C,9D8E,882C,8871,9A5E,982A
  hook.9B3E = total 1 firstGameFrame 283      hook.9BF0 = 1 @284
  hook.9C12 = 1 @285   hook.9C1E = 1 @286     hook.9C24 = total 23 @287
  hook.9C3C = 1 @309   hook.9D8E = total 103 @287
  hook.882C = total 2 @0   hook.8871 = total 18 @0   hook.982A = 30 @310
  lag.dropAtGameFrame = 283      lagFrames = 1      guardViolations = 0

python games/gradius/tools/oracle/flowprobe.py --frames 660 \
  --script "200:,10:S,190:,300:R" ...
  hook.C1D6 = 1 @493   hook.979D = 1 @614   hook.97DD = 1 @614
  hook.9B3E = total 2 @283             lag.dropAtGameFrame = 283 AND 614
  f614 $1B $A0->1, $0D 0->6, $0E ->1, $1F 2->0, lives 3->2, $12/$13/$3E ->0,
       $0360 174->80
  f615 $1B 2, $0E 49   f616 $1B 3, $0E 37   f617 $1B 4, $0E 40
  f618 $0D 3->5, $0E 149 ... f639 $0E ->1 and $57 0->1
  f640 $1B 4->128, $1F 0->1     f641 $0D 5->4, $1F 1->2
```

**THE PLAN'S FRAME COUNTS ARE WRONG AND I AM CORRECTING THEM.** It carries
"boot = 28 frames, respawn = 26 frames - a data-dependent exit, not a fixed 28".
Measured, twice each: **both intros are 27 mode-5 frames** (283-309 and
614-640), of which 23 are state 4. The recon's "f282 $1B=0" is the MODE-4
handover frame, not a mode-5 frame - `$8165` is three instructions and mode 5's
own handler first runs at 283.

The exit *is* data-dependent - `$9C24` reads `$57` and there is no counter
anywhere in the ROM - but on stage 1 it always lands on the same number, and
the reason is structural rather than lucky: **`$9B3E` sets `$3F` and `$55` from
the SAME byte** (`$24`, the checkpoint, at `$9B6A`/`$9B6C`) **and clears
`$3E`/`$54`/`$58`, so the streamer's 16-bit lead is exactly 0 at every intro,
whatever the checkpoint.** From a zero lead `$9DA7` first refuses on block 85
(`$0180` = 384 px = three 128-px half-pages of 28 blocks) and `$9C24` emits four
a frame: 84 blocks over 21 frames, all four calls of frame 22 throttled, frame
23 reads `$57` and leaves. Verified from the other side - a 23-frame counter is
GREEN on both scenarios (see MEASURED 6).

### 2. The one lag frame in the corpus, and what it is

`probe.lua` and `objloop.lua` independently report `lag.dropAtGameFrame = 283`
on every boot script and `283, 614` on the death script - i.e. exactly the two
frames that run `$9B3E`, and no others. `$882C` is what costs it: `h_8871 = 6`
chunks and `h_888B = 2304` `$2007` writes in one NMI.

`objloop.lua` attributes a drop to the frame that was still running (its
`gframe` only advances at `$80B5`, and a dropped NMI never reaches it), so it
belongs on THAT frame's row and does not consume a row of its own. The port
models it as `state.frameDrops = 1` inside `fullScreenLoad()`, and
`porttrace.mjs`'s `lagged` became a per-frame count instead of a boolean. With
the store removed, `intro-boot` reports `lag: cartridge 1 in window; port 0
[FAIL]` and `w_lagged@283` - seen red.

### 3. HARDWARE OAM MASKS ATTRIBUTE BITS 2-4, and the intro is what found it

First run of `intro-boot`: `s0a` diverged on all 28 blanked frames, `rom 224
port 244`. `$F4` is the byte `$8B08[0..3]` stores to park sprite 0
(`$8B2F LDA $8B08,X` with X = 3, and `$8B08 = F4 F4 F4 F4 CE 6D 23 F8`), and
`$F4 AND $E3 = $E0 = 224`. Bits 2-4 of an OAM attribute byte do not exist and
read back as 0; Mesen models it and the port did not.

It had never cost a frame because the corpus's sprite 0 is always the LIVE
record, whose attribute byte is `$23` - and `$23 AND $E3 = $23`. A parked
sprite 0 only happens while `$1F` is 0, which before this wave was outside every
compared window. docs/knowledge/03 shape 3, found by widening the window.

### 4. `enemySlots` was a stale counter, and pause is what found it

`pause` first run: `enemySlots` `rom 0 port 10` on all 50 paused frames.
`updateEnemies()` zeroes the counter at its own top, which was enough while
every mode-5 frame ran it; the intro dispatch never reaches `$9A5E` and a paused
frame jumps past it. Reset moved to the top of `nmi()`. This is the FIRST
divergence this field has ever produced.

### 5. The gate, before and after

```
BEFORE (as found)
  node --test games/gradius/tests/     140 pass, 0 fail, 0 skipped
  node games/gradius/tools/test-all.mjs
    18 scenarios, 5045 of 5888 frames compared (6 truncated), 0 failures,
    9 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle
    splitSpins w_0019 w_0024 w_004C)
    GREEN -- 6 passed, 0 failed, 0 SKIPPED

AFTER
  node --test games/gradius/tests/     157 pass, 0 fail, 0 skipped
  python games/gradius/tools/verify_assets.py --self-test
    11 check families (flow is new), 28 of 28 mutations reddened their target,
    11 of 11 families seen red
  node games/gradius/tools/test-all.mjs
    21 scenarios, 5726 of 6569 frames compared (6 truncated: right-wall@493,
    diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
    speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations,
    6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
    GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

**+681 compared frames, and none of the 18 existing scenarios moved** (5726 −
5045 = 681 = 357 + 85 + 239, the three new ones). Three SKIPPED fields retired:
`w_0019`, `w_0024`, `w_004C` are modelled now.

The three new windows compare **100% of their frames, 0 divergent TIER 1
fields**, 396 fields each:

```
  PASS  intro-boot     357 frames  all TIER 1 fields exact   (align 282)
  PASS  intro-respawn   85 frames  all TIER 1 fields exact   (align 614)
  PASS  pause          239 frames  all TIER 1 fields exact
```

### 6. Every check seen red - and the FIVE deliberate breaks that PASSED

Method: patch `src/`, run the scenario comparison and/or `flow.test.js`,
restore. Full script kept in the scratchpad; results:

| break | scenario | unit | verdict |
|---|---|---|---|
| drop `frameDrops = 1` | RED (lag FAIL, `lagged@283`) | - | |
| `streamBlock` for all four `$9C24` calls | RED, 110 fields | RED | |
| `$85E8` prologue on `$9BFA` | RED, `w_000E@284` | RED | |
| swap the X/Y nibbles at `$9B95`/`$9BAB` | RED, 120 fields | RED | |
| drop `$9C24`'s `$0D = 5` | RED, 98 fields | RED | |
| move `$96C0`'s `$0D = 3` after the dispatch | RED, `w_000D@284` | RED | |
| remove the `$9660` pause jump | RED, 71 fields | - | |
| remove the OAM `& $E3` | RED, `s0a@283` | - | |
| remove the `work.enemySlots` reset | RED, `enemySlots@451` | - | |
| clear `$0380` in `$9B3E` too | GREEN | RED | |
| drop `$9B6A`'s `$3F` restore | GREEN | RED | |
| drop `$9B47`'s `$0100`/`$0300` page clears | GREEN | RED (after fix) | |
| `$9B25 INC $5B`, `$9765`'s two rules, `$9AD5`'s `AND #$70`, the ladder as a switch, DEC-then-test in `$96EF` | (unreachable) | RED | |

**Five breaks that PASSED. These are the findings.**

1. **`counter-not-57`** - replacing `$9C24`'s `$57` test with a 23-frame counter
   is GREEN on `intro-boot` AND `intro-respawn`. Both measured intros are 23
   state-4 frames, for the structural reason in MEASURED 1, so the corpus cannot
   tell a loop from a counter. Closed by `tests/flow.test.js`, which starts the
   phase with a `$0100` lead (a state `$9F94`'s own advance produces) and pins
   the phase at 9 frames instead of 23. **A reviewer should check that test
   first: it is the only thing holding the loop shape.**
2. **`no-882C-1F`** - dropping `$883F STA $1F` is GREEN. The cartridge's `$1F`
   is ALREADY 0 at frame 282 (measured: `seed $1F = 0`), so the store is a no-op
   in this window. Unfalsifiable, not wrong.
3. **`no-clear-48`** - dropping `$48` from `$9B3E`'s zero-page clear is GREEN
   for the same reason: `$48` is 0 at frame 282 (`$88A4` only runs from
   `$9AC7`, which modes 0-4 never reach). Closed by a unit assertion.
4. **`no-page-clear-0300`** - dropping the `$0300` page clear is GREEN: nothing
   is spawned at either seed. It stays unfalsifiable by the corpus until wave 5
   drives a respawn intro from BEFORE `$9B3E`, with ten enemy slots live.
   Closed by a unit assertion (added after this run).
5. **`always-test-1B`** - making `mode5Tail`'s `$9A88` test unconditional is
   GREEN, and it is genuinely unreachable: the only `JMP $9A8C` the port takes
   is `$9660` (pause), where `$1B` is `$80`. The other two (`$96A2` stage 5,
   `$98E2` play sub-state `$8C`) are unported. Recorded, not closed.

And one break that was GREEN because the BREAK was wrong, which is worth
writing down too: `streamBlock` for only the FIRST of `$9C24`'s four calls is
green, because `$0E` is 0 at that point and the gate passes anyway. All four had
to be swapped to make it bite.

Two more that were green on a check I then strengthened:

* **`held-not-edge-START`** was GREEN on the `pause` scenario *and* on the first
  version of the unit test. The scenario presses START for one frame, where
  `$05` and `$07` are the same byte; the unit test held it for FIVE frames and
  checked the end state, and an edge-vs-held mistake TOGGLES, so an odd-length
  hold ends on `$15 = 1` and looks right. Two green checks, one live defect. The
  test now asserts after every frame AND adds the case that actually separates
  the two: START pressed while `$0D` blocks spends its edge, so the cartridge
  does not pause when the blank ends.
* **`no-page-clear-0300`** as above.

### 7. Smaller measurements worth keeping

* `$9BD4`'s first ten bytes are `65 65 65 65 65 65 65 66 66 66` and stage 1's
  base index `$9BCC[0]` is 0, so **all five of stage 1's checkpoints start the
  ship at exactly (80, 96)**. The `+ ($3F >> 1)` term is unfalsifiable on stage
  1; the unit test uses `$19 = 1` (index 7 → `$66` → (96, 96)) to exercise it.
* `$9BCC[$19] + ($3F >> 1)` is bounded by **4**, not 6: `$9B6A` sets `$3F` from
  `$24` BEFORE `$9B8A` reads it, and `$97B1-$97BB` writes `$24 = min($3F AND
  $0E, 8)`. With +6 the exporter's guard rejects stage 6 (base 20, table 25
  bytes); with +4 it lands exactly on the last byte.
* `$5E` has **two writers (`$99B5`, `$9C0F`) and zero readers** in the whole
  PRG. It changed 0 → 63 at f615 on the respawn run with no `STA $5E` on that
  path - presumably an indexed store I did not chase. Not modelled; nothing can
  read it. Unresolved, and harmless.
* `$0E` per intro frame, measured and now reproduced: 1, 49, 37, 40, then 149
  for 21 frames, then 1. 149 = 4 × 37 + `$8641`'s one byte, which is where
  `frame-gates.test.js`'s "the cartridge's own `$0E` reaches 149" came from.
* `$0D` at the `$80B5` sample: 6, 3, 3, 3, then 5 for 23 frames, then
  4, 3, 2, 1, 0 - and the split first fires on the frame it reaches 0
  (cartridge f314), always at scanline 207.

## What I could not do, and why

* **`$8871`'s image is still not drawn.** Only `$882C`'s RAM side effects
  (`$0E`, `$1F`, `$12`, `$13`, `$10`, `$0D`, and the frame overrun) are
  reproduced, with the gap named at `src/flow.js fullScreenLoad()`. In practice
  `$9C24`'s 84 blocks rebuild 384 px of terrain in front of a camera at 0 before
  `$0D` lets the picture back on, so the boot is visually right; **on a respawn
  the port keeps the previous screen's tiles outside that band.** Nothing in the
  compared vector can see it (the oracle rows carry no nametable), so this is a
  written-down gap, not a measured pass.
* **`$9B3E` on the RESPAWN is not compared.** `intro-respawn` aligns at 614,
  which is the frame `$979D` ran, because `$979D` jumps into `$9B3E` in the same
  frame and `$979D` is wave 5. Wave 5 should re-align this scenario to ~611 the
  moment `$979D` lands - that is the cheapest coverage in the next wave.
* **The `$9A88`-vs-`$9A8C` entry distinction is unfalsifiable today** (finding
  5 above). It stays in the code because the two ROM arms that would exercise it
  are named and unported.
* **`$9C5E` (the pause-screen Konami cheat) is a throw.** `$9765`, the matcher
  that leads to it, IS ported, because `$9AFF` runs it on every paused frame and
  `$33` is live state whenever anything is paused.
* I did not touch the mode machine, `$80BE`, or modes 0-4. `intro-boot` seeds at
  the mode-4 handover; everything before frame 282 is still untested.

## If someone picks this up cold

* The intro is `src/flow.js`; the ladder is `stagePlay()` in `src/nmi.js`. Every
  arm that throws names the ROM address, so a crash report identifies the arm.
* Reproduce the cartridge side with:
  ```
  python games/gradius/tools/oracle/flowprobe.py --frames 340 \
    --script "200:,10:S,130:" --hooks 9B3E,9BF0,9C12,9C1E,9C24,9C3C,9D8E,882C \
    --fields sub1B,blank,qlen,f57,camLo,camHi,pst,pani,f1F
  ```
* Re-record after any watch-list change:
  `python games/gradius/tools/oracle/scen.py` (21 scenarios, ~15 min).
* `scenarios.json` scenarios may now carry their own `align`. Only `scen.py`
  resolves it; both harnesses read it back out of the recorded artifact, so they
  cannot drift.
* If you make `lagged` a boolean again, `intro-boot` breaks. It is a COUNT.
