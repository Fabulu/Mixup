# Wave 4 QA (adversarial): flow structure - the $1B ladder, the stage intro, pause
status: DONE
wave: 4   role: qa   started: 2026-07-29

## The task, as I understood it
Read-only adversarial QA of commit `1c699fe`. Assume the wave is broken; find
where. I do not edit `games/gradius/src/`, I do not commit. A reproducible
divergence with a frame number beats an opinion.

## What I did

1. Read `docs/worklog/README.md` in full, then the commit diff (20 files).
2. **Ran the gate myself.** Numbers below are mine, not quoted.
3. Built a MUTATION SANDBOX so that "break it, watch it go red, restore" could
   be done without touching `src/`:
   `<scratchpad>/sb/games/gradius/{src,tests,tools,game.json,index.html}` is a
   copy; `assets/` is an NTFS **junction** to the real gitignored
   `games/gradius/assets`, so no ROM-derived byte was duplicated anywhere and
   nothing was created inside the repo. `package.json` copied for `type:module`.
   Sandbox baseline reproduces the real tree exactly (see below).
4. Ran **60 deliberate source-level breaks** through
   `node --test games/gradius/tests/` + `tools/oracle/compare.mjs`, restoring
   from a pristine copy between each.
5. Two direct state-transition experiments the corpus cannot reach.

## What I MEASURED

### The gate, run by me, on the real tree

```
$ node --test games/gradius/tests/
# tests 157 / # pass 157 / # fail 0 / # skipped 0 / # todo 0

$ node games/gradius/tools/test-all.mjs
  OK: 0 mismatch(es) across 11 check families, 17 tables, 42 constants,
      12 palettes, 2048 CHR tiles, 425 terrain blocks
  28 of 28 mutations reddened their target; 11 of 11 families seen red
  21 scenarios, 5726 of 6569 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
  speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
  PASS  intro-boot     357 frames   (align 282)
  PASS  intro-respawn   85 frames   (align 614)
  PASS  pause          239 frames
```

GREEN with 0 SKIPPED, and the 6 SKIPPED *fields* each carry a reason
(`no port counterpart`). The implementer's numbers reproduce exactly.

Sandbox baseline: `units_fail=5  compare_failures=0`. The 5 unit failures are
the touch-pad/`index.html` DOM tests, which fail identically for a
layout-relative reason in the copy and are **not** wave 4; every mutation below
is scored against that same baseline, and `novel=` lists only failures the
mutation itself introduced.

### FINDING 1 (moderate) - `state.bandB.ran` is never cleared by the intro dispatch, and both intro scenarios pass only because the port enters the intro from a fresh `createState()`

`mode5Tail()` is the only writer of `state.bandB.ran`, and `introStep()` never
calls it (correctly - `$96C2 JSR $83E4`'s handlers RTS to `$80AD`, skipping
`$9A5E-$9ACE`). So the raster-split record from the LAST played frame stands for
every frame of an intro entered from play. `porttrace.mjs sampleRow()` reads it
for two compared fields:

```js
const bank = state.bandB.ran ? state.bandB.chrBank : state.bandA.chrBank;
chrOffset: bank * 0x2000,
sprite0Hit: (state.bandB.ran && state.ppu.spriteZeroOn) ? 1 : 0,
```

Reproduced (`<scratchpad>/sb/bandb.mjs`: 6 play frames, then `$1B = 0`, which is
exactly `$8165`'s and `$979D`'s handover):

```
after play: bandB.ran = true  bandA.chrBank=0  bandB.chrBank=1
intro frame 0: $1B=1 $0D=6 bandB.ran=true chrOffset=8192 sprite0Hit=1
intro frame 1: $1B=2 $0D=3 bandB.ran=true chrOffset=8192 sprite0Hit=0
intro frame 2: $1B=3 $0D=3 bandB.ran=true chrOffset=8192 sprite0Hit=0
intro frame 3: $1B=4 $0D=3 bandB.ran=true chrOffset=8192 sprite0Hit=0
intro frame 4: $1B=4 $0D=5 bandB.ran=true chrOffset=8192 sprite0Hit=0
intro frame 5: $1B=4 $0D=5 bandB.ran=true chrOffset=8192 sprite0Hit=0
```

The CARTRIDGE, from the recorded oracle artifacts, on every one of those frames:

```
intro-boot     282..312  off=0 s0h=0    (27 intro frames + the 4 blank frames)
intro-respawn  614..644  off=0 s0h=0
```

So the port would report `chrOffset` 8192 vs the cartridge's 0 on **all 27
frames of a respawn intro**, i.e. `intro-respawn` frames 614-640.

Why the wave's own scenarios are blind: `seedFromRam()` seeds no band state, so
both intro scenarios start the port at `createState()`'s default
`bandB.ran = false` - which happens to be the right answer. The field is right
by luck, not by code. It becomes live the moment wave 5's `$979D` lets the port
reach `$9B3E` from a play frame, and `intro-respawn`'s own note already plans to
re-align to ~611 "the moment `$979D` lands". `introStep()` needs the equivalent
of "no `$9A88` this frame", i.e. `state.bandB.ran = false`.

### FINDING 2 (moderate) - `$9B8B LSR` (`+ ($3F >> 1)`) has no check anywhere: deleting the shift is green on the whole gate, INCLUDING the unit test written to exercise it

```
M31-drop-the->>1-shift   ($9B8E: `(state.cam.hi >> 1)` -> `(state.cam.hi)`)
    units_fail=5 (= baseline, novel=none)   compare_failures=0
```

`tests/flow.test.js` line 87-97 exists for this term and says so
("$19 = 1 with checkpoint 4 is index $9BCC[1] + 2 = 7 -> $66"). It does not
hold it: with the shift the index is `5 + (4>>1) = 7`; without it, `5 + 4 = 9`.
`$9BD4[7]` and `$9BD4[9]` are **both `$66`** (`65 65 65 65 65 65 65 66 66 66`),
so the assertion `u.obj.y[0] === (packed & 0xF0)` - where `packed` is read at a
**hardcoded** `0x9BD4 + 5 + 2` - passes either way. That is
`docs/knowledge/03` shape (d): the test computes its expectation from an index
it supplies itself, and never compares the index the port used.

Not caught by the corpus for a separate reason: `$24` (the checkpoint) is **0
on every frame of every scenario**, so `$3F >> 1` and `$3F` are both 0.

For contrast, a *different* wrong shift IS caught, which is why this hole is
easy to miss:
```
M31b-shift->>2   units_fail=6  novel=['$9B3E puts the ship where the cartridge
                 put it, from the TABLE']   compare_failures=0
```
(5 + 1 = 6 -> `$65` -> X = 80 -> the test's `notStrictEqual(x, 80)` fires.)

Smallest fix that would have caught it: assert the index, or add a `$19`/`$24`
pair whose correct and shift-free indices land on different bytes, e.g.
`$19 = 1, $24 = 6` -> 5+3 = 8 (`$66`) vs 5+6 = 11.

### FINDING 3 (moderate) - the `$0700` VRAM queue IMAGE is not compared anywhere; only `$0E`, its length. Three orderings/IDs of the intro's packets are green

`scenarios.json`'s `watch` has 366 addresses. Page 7 holds 57 of them and
`min = $07A0`, `max = $07EA` - the position rings and the score. **Not one
address in `$0700-$079F` is watched**, and that is where all 149 queue bytes
live. `$0E` is watched; its contents are not.

Green breaks that follow directly:

```
M1-swap-9C15-9C18-order   $9C12: stTopScore/stScore emitted in the wrong order
                          units_fail=5 (baseline)   compare_failures=0
M2-swap-packets-7-5       $9BFD/$9C02: canned packets 7 and 5 swapped
                          units_fail=5 (baseline)   compare_failures=0
M23-copyPacket-19+9       $9BF5: `$19 + 8` -> `$19 + 9` (a different packet)
                          units_fail=5 (baseline)   compare_failures=0
```

All three keep `$0E` at 37/49 and are invisible. `tests/hud.test.js` checks each
producer's own emitted image, but nothing checks the intro's COMPOSITION, which
is what `$9BF0`/`$9C12` are. M23 in particular means the second canned packet's
identity - the one thing in `introPackets()` that depends on `$19` - is
unfalsifiable. The wave's own note calls `$0E = 49 / 37 / 40 / 149` its
evidence; length is all it is.

### FINDING 4 (moderate) - every `$9B3E`/`$882C` store whose source or target is already zero is unfalsifiable, and four of them have no unit test either

Measured from the recorded seeds:

```
intro-boot      align 282   $18=0 $19=0 $1A=0 $22=0 $24=0 $26=0 $28=0
                            $33=0 $3B=0 $0160=0 $0E=1 $1F=0 $48=0
intro-respawn   align 614   identical, all zero
pause / idle    align 400   identical, all zero
$22 / $24 / $28 over the whole compared window: the single value 0
```

Wave 4 added eight watched addresses `$22-$29` whose value is `0` on 100% of
5726 compared frames. So the largest single thing the wave added - the
wipe-and-restore block at `$9B62-$9B74` - is proved by the corpus only in the
sense that 0 equals 0. Four stores are held by NOTHING:

```
M14-drop-meter-restore     $9B66 STA $42 ($22,X)   units_fail=5  compare 0
M15-drop-1A-restore        $9B74 STA $1A ($28,X)   units_fail=5  compare 0
M48-drop-ring-cursor-clear $0160 := 0              units_fail=5  compare 0
M52-drop-882C-STA-0E       $883B STA $0E           units_fail=5  compare 0
```

M52 is the sharp one: `tests/flow.test.js` line 147 asserts
`s.vram.cursor === 1` and names `'$883B STA $0E, then $8641 adds one byte'` -
but the 1 is produced by `drainQueue()` zeroing the cursor at `$8099`, three
calls earlier in the same frame, so the assertion is satisfied whether or not
the store under test exists. `docs/knowledge/03` shape (c)/(d).

Two more restores (`$9B70 STA $19`, `$9B6A/$9B6C STA $3F/$55`) are corpus-blind
too, but ARE held by `tests/flow.test.js` (M16, M31b go red on the unit suite).

### FINDING 5 (minor) - `AND #$F0` is unfalsifiable in width

```
M33-AND-F0-to-F8   `packed & 0xF0` -> `packed & 0xF8`
                   units_fail=5 (baseline)   compare_failures=0
```
`$65 & $F0 = $65 & $F8 = $60` and `$66 & $F8 = $60` too, so the mask cannot be
distinguished from any mask covering bits 5-7 on stage 1's table. The unit
test's stated red condition is "the `AND #$F0` / `ASL x4` pair is **swapped**",
which is a different mistake.

### FINDING 6 (minor) - `$9B01 LDA $3B,X / BMI` modelled as a zero test

```
M37-cheat-test-eq0   `!(state.cheat[p] & 0x80)` -> `state.cheat[p] === 0`
                     units_fail=5 (baseline)   compare_failures=0
```
`$3B,X` is a COUNT (`$B981 INC $3B,X`, `$9B15 DEC $3B,X`), so 1..127 is a real
state in which the ROM runs the matcher and the mutant does not. The unit test
only uses 0 and `$FF`. `$3B/$3C` read 0 on all 5726 frames.

### FINDING 7 (informational) - the commit message's "FIVE DELIBERATE BREAKS PASSED" is stale against its own tests

Re-run individually, three of the five now go RED on `node --test`:

```
#2 M50-drop-882C-STA-1F   units_fail=6  novel=['$882C leaves $0E/$1F/$12/$13 ...']
#3 M49-drop-48-from-clear units_fail=6  novel=['$9B3E wipes the power-ups ...']
#4 M45-drop-0300-type-clear units_fail=6 novel=['$9B3E wipes the power-ups ...']
#1 M57-23-frame-counter   units_fail=6  novel=['the intro is $9C24 looping ...']
                          compare_failures=0   <- CONFIRMED corpus-blind
#5 M19-pause-tail-test1B-true  units_fail=5  compare_failures=0  <- still green
```
Only #5 is still a break that passes the gate. #1-#4 pass the ORACLE COMPARISON
and are caught by `tests/flow.test.js`. The list should say which layer it means
- this repo's own rule is that a stale note has misled somebody every time.

Also dead-but-harmless, green as expected, worth naming so nobody re-derives
them: `M9` (`fullScreenLoad`'s `$886E` ctrl store, overwritten 2 lines later by
`$9B7F`), `M10` (both `$0D = $10` stores, overwritten by `$9BC5`), `M58`
(`$9AD1`'s bit-7 gate - `pauseCheck` is only ever reached with bit 7 set).

### FINDING 8 (informational) - every one of the 681 new compared frames carries one tolerated divergent field

```
intro-boot     w_0036: 357/357 frames differ, first at 283
intro-respawn  w_0036:  85/85  frames differ, first at 615
pause          w_0036: 239/239 frames differ, first at 401
```
Pre-existing (`$36`, the OAM write cursor, downstream of the unmodelled `$9F`
sprite budget) and correctly classed INFO rather than TIER 1 - but the wave's
"all TIER 1 fields exact" line is worth reading next to it.

### Coverage vs content

Behaviours the wave added, and whether a scenario exercises them:

| behaviour | exercised by a scenario? |
|---|---|
| `$96BE` 5-state dispatch, `$1B` 0->1->2->3->4->$80 | YES (both intros) |
| `$0D` 6,3,3,3,5x23,4,3,2,1,0 | YES |
| `$0E` 1,49,37,40,149x22 (LENGTHS ONLY) | YES / content NO |
| `$9C24`'s `$57` loop vs a counter | **NO** (unit test only) |
| `$882C` frame drop | YES (intro-boot only; respawn's is outside the window) |
| `$9B62-$9B74` per-player restore | **NO** (all four sources are 0) |
| `+ ($3F >> 1)` | **NO** (nothing, see Finding 2) |
| `$9B47` page clears | **NO** (all targets already 0; unit test only) |
| `$3D-$97` wipe | **NO** (all targets already 0; unit test only) |
| `$15` pause toggle, the `$9660` jump | YES (pause) |
| `$9ADA`'s `$09`/`$16` gates | **NO** (both 0 everywhere; unit test only) |
| `$9AD5`'s bits 4-6 gate | **NO** (unit test only) |
| `$9765` matcher, both rules | **NO** (unit test only) |
| `$9B25 INC $5B` | YES (pause) |
| every unported ladder arm's throw | **NO** (unit test only, correctly) |
| `oamDma & $E3` | YES (intro-boot, 2 failures when removed) |
| `enemySlots` per-frame reset | YES (pause, 1 failure when removed) |

Seven of ~17 are corpus-exercised. That is not itself a defect - the wave says
as much - but three of the unexercised seven (`$3F>>1`, the `$22`/`$28`
restores, `$0160`) have no unit test either, which is the gap.

## What I RULED OUT (and how)

* **`clearZeroPage()` completeness.** Enumerated every `state.js` field carrying
  a `$3D`-`$97` address against the function: `$3D $3E $3F $40 $41 $42 $44 $45
  $46 $47 $48 $49 $4A $4B $4C $54 $55 $57 $58 $5B $5C $5D $60 $61 $64-$67 $69
  $6A-$6F` - all present. `$98/$99` (`zp.step`), `$9B` (`tilt`), `$A8`, `$AE`
  are past `$97` and correctly absent; `$3A` (`build.gate`) and `$35`
  (`autofire`) are below `$3D` and correctly absent (`$35` is set explicitly at
  `$9B5E`). No missing field.
* **The `$9B47` page clears.** `LDX #$7F` x6 stores = `$0100-$017F`,
  `$0300-$037F`, `$0500-$06FF`. `state.coll` is `new Uint8Array(0x200)` =
  exactly `$0500-$06FF`. `$0180`, `$0380`, `$03A0-$04FF` correctly survive.
* **`res.flowTables` on the browser path.** `main.js` now boots into the intro,
  which reads `res.flowTables`. `assets.js:129` returns it from
  `loadResources()`, not only from `headlessResources()`. Not a boot crash.
* **Branch targets.** Hand-recomputed `$9AE6 D0 17 -> $9AFF`,
  `$9AEA F0 51 -> $9B3B`, `$9B03 30 16 -> $9B1B`, `$9B0E D0 0B -> $9B1B`,
  `$9B19 -> $9B1B`. The port's shapes match; `$9B13`'s `DEC $3B,X` /
  `STA $33` are correctly inside the throwing cheat arm only.
* **`$10` / `$11` ordering through `$882C`.** `$886E -> $81B5` sets `$10 = $88`
  and `$9B7F` then sets `$A8`; the port does both in that order and ends at
  `$A8`. `M43` (`$A8 -> $A9`) is caught by the corpus, so `$10` is real
  coverage. (`$11` is NOT a compared field - only the `bootState()`
  cross-check holds it; `M42` `$1E -> $18` was corpus-green.)
* **Dropped-NMI / input alignment.** A cartridge NMI dropped at `$8073` never
  reaches `$80A4 JSR $81BF`, so it consumes no script entry and never advances
  `gframe`; `porttrace`'s 1:1 `g -> buttons[g]` is right and `lagged` as a
  per-row DROP COUNT matches `objloop.lua`'s attribution. `M8` is red (2
  failures), so the model has teeth.
* **`$0D` decrement ordering.** `$808A-$8094` runs before `$80AA`, and
  `$9650 STA $13` runs before `$882C STA $13`; the port's order gives the
  measured 6,3,3,3,5... and the split first firing on the frame `$0D` hits 0.
  `M18` and `M22` both red.
* **Pausing during the intro / entering the intro paused.** Faithful: `$9AD1`
  refuses (bit 7 clear) and `$965C` deadlocks on both sides identically.
* **`introStep`'s `default:` throw** is unreachable (`$1B` only ever walks 0..4
  then `$80`), and correct as a loud throw.

## What I could not do, and why
* I could not drive a respawn against the cartridge from BEFORE `$9B3E`
  (`$979D` is wave 5), so Finding 1 is demonstrated port-side + against the
  recorded cartridge rows, not as a single red scenario run.
* `$9C5E`, `$96CF`, `$96FB`, `$8871`'s image and all `$EC1E` are out of scope
  and correctly throw/are named.

## If someone picks this up cold
The sandbox recipe is worth repeating: copy `src tests tools game.json
index.html` + the repo `package.json`, junction `assets/`, then
`node --test games/gradius/tests/` and `node tools/oracle/compare.mjs` from the
copy. It reproduces the gate bit-for-bit and lets a reviewer run source-level
deliberate breaks without ever writing to `src/`. `<scratchpad>/battery.py` is
the driver; 60 mutations, ~40 s each.

The single highest-value follow-up is **Finding 2**: one extra `$19`/`$24` pair
in `tests/flow.test.js` closes an arithmetic term that today nothing in the
repo holds.
