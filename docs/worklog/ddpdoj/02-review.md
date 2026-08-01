# WAVE 2 REVIEW — the object driver, the forced overrun, and which build's ISR runs

status: DONE
wave: 2   role: review   started: 2026-08-01
subject: commit `f2d49c1` "ddpdoj wave 2: the object driver, and the first forced overrun"
implementer worklog: `docs/worklog/ddpdoj/02-impl-object-driver-and-overrun.md`

I am a READER. I edited nothing under `games/ddpdoj/` and committed nothing. The
only file I wrote inside the repo is this one. Two temporary probes live in the
session scratchpad, not in the tree.

## The task, as I understood it

Verify wave 2 by content, not by report: read the diff, read the ROM at the
addresses cited, re-run the measurements, break at least two checks and watch
them go red, and say what I did NOT re-measure.

## Machine pin — every run below

```
MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
refresh_hz=59.185606061 frame_attos=16896000000000000 cycles_per_frame=337920
decrypted image out/maincpu.bin sha256
  4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c
```
No `.zip` has crept back beside `ddpdojblk.7z` (the shadow copy is renamed
`ddpdojblk.zip.SHADOWED-bad-nv`).

---

## What I MEASURED

### A. The gate reproduces bit-for-bit

```
python pgm.py gate
  run 1: 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
  run 2: 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
  IDENTICAL
  CENSUS stack_guard_hits=0 below_$81FD00
  CENSUS object_slots_processed 0:699 1:504 2:1 5:413 7:350 8:632 9:1
  CENSUS object_slots_live      0:2   1:1201 2:1 5:413 7:350 8:632 9:1
  BUILD required=B frames_on_required=1901 frames_on_other=699
```
Exactly the hash the commit message records. The wave-2 digest change is real
and is reproducible on a second machine-session.

### B. The overrun reproduces, number for number

```
python pgm.py overrun 60000
CONTROL OK -- at 0 nops only ['cyc','d_top','spin','work'] moved
INJECT sled at $340000 nops=60000 jmp_at=$35D4C0 site=$23BFE8
       original_target=$2410BC added_cycles=240012 budget=337920
CENSUS irq6_per_logicframe 1:1968 2:631 3:1
CENSUS armed_vblanks 1:2600
CENSUS work_cycles min=7338 max=2580102 budget=337920 over_budget=624
OVERRUN n=696 after lf1905: spanned>1_videoframe=614  isr6_A_gate_firings=614
                            objn<objlive=0
PACE 695 logic frames over 1309 video frames = 0.5309 logic/video;
     $80390A advanced 695 (= logic frames: YES)
STATE vs the 0-nop control: d_ram@1903, pix@2000, objn/objord@2512
```
Identical to the worklog. (B) dominant, (A) fires 614 times, (C) absent at the
top level, the game's own counters track LOGIC. **MAME-timed, uncalibrated.**

### C. The phase timings reproduce

`phase.lua`, 2,600 frames, `PH_ATTRIB=1`:
```
MARK postvbl 244296  counters 246121  call1 246414  call2 246632
     call3 324357   call4 326091   sync 341685      (=> call2 77,725, call4 15,594)
CENSUS sr_mask_main 0:2289861   CENSUS sr_mask_isr 6:44760 7:24164 4:16487
ATTR pc=23D6B4 n=156954 call4:156954   ATTR pc=240DEC n=37832 call2:37832
```

### D. The ROM says what the worklog says it says — byte by byte

Verified against the decrypted image, not quoted:

* `$2410BC` `6100 01a4` bsr $241262 / `6100 005c` bsr $24111E / `4bf9 0080E240`
  lea / `7013` moveq #$13 / `3215` / `6718` / `0241 00ff` / `e749` / `2f0d`
  move.l A5,-(A7) / `3f00` move.w D0,-(A7) / `41fa fe86` → `$240F62` /
  `2070 1000` / `4e90` / `301f` / `2a5f` / `4bed 0050` / `51c8 ffde` → `$2410CC`
  / `4e75`. **No budget test, no time test.** Ends in `rts`; the next word
  `48e7` at `$2410F2` is the memmove helper, so there is no fall-through.
* Build A is the same 0x2C bytes at `$1413FE` (only the PC-relative dispatch
  displacement differs).
* Dispatch table `$240F62`: exactly 20 entries with pad word 0; entry [20] is
  `36 39 00 80 E8 80` = `move.w $80E880,D3`, i.e. code. The 20-entry count is
  right.
* `$2410BC` has **one** absolute-long caller, `$23BFE8`, and — a check the
  implementer did not run — **no `bsr` anywhere in `$100000-$2FFFFF`** reaches
  it either. "Only caller" is stronger than reported.
* Main loop `$23BFDC`: seven `4EB9` + `60D4` bra back to `$23BFDC`. Call #2 is
  `$23BFE8 jsr $2410BC`.
* Allocator `$241182` matches to the byte, including the `bge.w` to `$2411D4`,
  the `lea $80D51C,A0 / moveq #0,D0` dummy return and the `rts` at `$2411E0`.
* Priority insert `$24111E`: `bsr $2410F2` is a **downward** `move.l -(A3),-(A2)`
  memmove of exactly `$80E880 − (slot+$50)` bytes — it fills to the table end
  and no further, so slot 19 is overwritten and lost. Claim confirmed. The
  `dbra D6` fall-through to `$241172` really is a second silent-drop path.
* Sprite queue `$23D746` (`cmpi.w #$bc4` / `beq $23D75A` / `clr.w (A1)` /
  `ori #$1,SR`) and `$23D664` (`move.w #$bc4,D0`) match, as does the 52-record
  filler at `$23D680`.
* Rank: `$25C22A lea ($25C042,PC),A0 / move.b $80380C,D0` matches. `$2595F2`
  matches to the byte and every path converges on `$25962A moveq #$4,D0 / rts`.
* Player clamp/store `$2496D4..$2496E8` matches, `movem.w D2-D3,($2,A6)` and all.

### E. RED — four checks broken, all went red, all restored

1. `derive.py` shape assert, `lsl.w #3,D1` at `$2410D4` → `nop`:
   `build B: object driver shape broken at $2410D4: expected e749 …, got 4e71`
2. `derive.py`, `dbra` opcode at `$2410EC` corrupted: same class of failure.
3. `derive.py`, `dbra` **displacement** at `$2410EE` `ffde`→`ffdc`:
   `build B: the dbra at $2410EC does not branch back to the loop top $2410CC`
   (the semantic check, not just the byte pattern).
   Image restored; sha256 back to `4d3efd54…`, and `derive.py --show` re-emits
   `$2410C4 / hook $2410D8 / 20 entries` unchanged.
4. **The wrong-build guard**, which is the one that matters on this cartridge:
   booted with the VERSION-A prefix while requiring build B →
   ```
   BUILD required=B frames_on_required=0 frames_on_other=1600
   FAIL NOT ONE logic frame ran in the required build B
   FAIL the LAST logic frame armed from build 1, not the required B
   check() raised: red-build: the probe FAILED its own boot assertions
   ```
5. **The (C) detector is live**, not decoration. Pointing `PROBE_OBJ` at the
   `move.l` (`$2410D6`) instead of the `move.w` (`$2410D8`):
   ```
   correct $2410D8: object_slots_processed 0:699 1:504 2:1 5:296
   WRONG   $2410D6: object_slots_processed 0:699 2:504 4:1 10:296
   ```
   Exactly 2×, live count unchanged — the documented trap reproduced, and proof
   that `objn` would move if the driver ever truncated.

### F. Two claims the wave asserted from the listing, now MEASURED

* **The NOP sled overwrites nothing the game reads.** frame.lua asserts this
  from the memory map. Read tap over `$300000-$3FFFFF`, unpatched gate scenario:
  ```
  ROMWATCH range=$300000-$3FFFFF logicframes=2600 reads=0 distinct_pcs=0
  ```
  (Bounded by this scenario; presence proves presence.) Note also that
  `$300000-$4FFFFF` is *not* blank in the image — it is unfilled ROM that
  `init_ddp3` decrypted from zeros, which is why it looks like data.
* **The dead-stack boundary.** Static scan of the whole 6 MiB image: **zero**
  absolute-long constants anywhere point into `$81FD00-$81FFFF`. Register-
  relative access stays invisible, so this is corroboration, not proof — but it
  is the strongest static evidence available and it agrees with the 49
  push-shaped writer PCs.

---

## THE DEFECT: on a VERSION-B run, the INTERRUPT HANDLERS ARE BUILD A's

The worklog's item 4 (phase order — a hard gate for wave 5) and item 2's
description of the (A) gate name build-B ISR addresses. **None of them
executes.** Measured three independent ways on the standard gate scenario:

**1. The RAM vectors, read at the game's own sample point.**
```
VECTORS at lf=2600: IRQ4 $801470=$13BDAA   IRQ6 $801478=$13BDBA
IRQ6 dispatches=2617  vector-at-dispatch histogram: 000CC6:2  13BDBA:2615
```
Both are `$13xxxx`. `lf=2600` is deep in VERSION-B stage 1 and the main loop is
unambiguously build B (`armpc 23C212:1901`, `13C5B6:699`).

**2. Execution hooks (write taps) on each build's P1 mirror store.**
```
P1 mirror store executions: buildA $13D488=2615   buildB $23D11C=0
ISR6 releases:              buildA $13C806=2599   buildB $23C46C=0
```

**3. A read-tap census of `$803940` with CURPC attribution** — the very probe
the implementer listed as "not run", open item 4:
```
pc=13C6B4 n=7652052   build A wait loop
pc=23C390 n=16938767  build B wait loop
pc=13C7E6 n=2615      build A (A) GATE
pc=13D478 n=2615      build A input-read gate
pc=13C806 n=2599      build A release
pc=13C590 n=1  pc=23C1EC n=1
                      -- $23C44C, $23D10C and $23C46C: NOT ONE READ
```

The ISR that actually runs, from the listing at the address the vector holds:
```
$13BDBA movem.l D0-D7/A0-A6,-(A7) / jsr $13C7D4 / movem / rte
$13C7D4 jsr $13CFBA              (coin/service)
$13C7DA jsr $13D464              THE INPUT READ  (mirror store $13D488;
                                  its own inner gate is tst.b at $13D478)
$13C7E0 jsr $18ACC0
$13C7E6 tst.b $803940 / beq $13C80C          THE (A) GATE
$13C7EE jsr $141676 / $140FFE / $141258 / $185DC4     the four GATED routines
$13C806 subq.b #1,$803940                     THE RELEASE
$13C80C jmp $13C4FC                           ISR tail
```
That is a 1:1 structural match to the worklog's build-B table
(`$23CC4E/$23D0F8/$28C19A/$23C44C/$24133C,$240CC0,$240F26,$287286/$23C46C/
$23C158`) — same shape, entirely different addresses, and it is the build-A set
that runs. `$801478` has exactly two absolute-long writers in the whole image,
`$00090C` and `$000CC0`, both BIOS; no build-B code installs a vector by
absolute long.

**Why nothing broke.** `frame.lua`'s `REL` set contains *both* builds' release
PCs and the sample point is keyed on the semaphore, so every measurement in the
wave is still valid — the gate, the object driver, the overrun census, `objn`.
What is wrong is the *documentation of the interrupt half of the frame*, which
is precisely the deliverable wave 4 is told to port ("the ISR model with its
overrun gate", PLAN §"Wave 4"). A wave-4 implementer following the worklog would
port four routines that never run and omit the four that do.

The evidence was in front of the wave and was not followed: the implementer's
own dead-stack census lists `W pc=13BDBA n=60` and `W pc=13CEC8 n=3341` —
build-A PCs pushing stack during a build-B run. `$13BDBA` *is* the IRQ6 handler.

This also answers PLAN §1's open item "the IRQ6 handler (build A, measured;
build B to be re-derived)": there is nothing to re-derive. VERSION-B runs
VERSION-A's interrupt handlers.

**Scope of my claim.** Measured on the corpus's boot path (chooser → Down →
Button 1 → coin → start). A silent boot from the seeded NVRAM image was not
tested; the vector is installed by BIOS-adjacent code before the chooser, so I
expect the same, but I did not measure it.

---

## The rest, in severity order

**Moderate — `pgm.py overrun` prints a wrong number next to the right one.**
`_cmd_overrun` still labels the sweep `ITERS={n} (~{n*18} added 68000
cycles/frame)`, left over from the deleted busy-wait version. Actual output of
the run above:
```
-- ITERS=60000  (~1080000 added 68000 cycles/frame, budget 337,920)
   INJECT sled at $340000 nops=60000 ... added_cycles=240012 budget=337920
```
1,080,000 vs 240,012, two lines apart. The SWEEP header also still says
"injected busy-wait". The worklog's own numbers use the correct 240,012.

**Moderate — the rank-writer enumeration undercounts writers 2 → 4.** The
worklog names `$258F9C subq.b` and `$259040 addq.b` as the only writes and calls
`$258FA4/$258FAE/$259048/$259052` "bounds constants". `$258FAE` and `$259052`
are the operand addresses of two more **writes**:
```
258f9c: subq.b #1,$80380c      259040: addq.b #1,$80380c
258fa2: cmpi.b #$0,$80380c     259046: cmpi.b #$4,$80380c
258faa: bge $258fb4            25904e: blt $259058
258fac: move.b #$3,$80380c     259050: move.b #$0,$80380c   <-- WRITES
```
The conclusion ("only the service menu writes rank") survives — all four are the
same wrap-around pair — but an enumeration offered as *the* answer to "who
writes rank" must be right, and a port that models rank as monotonic ±1 would be
wrong at both ends.

**Minor — the per-slot hook is mislabelled in two shipped places**, and it is
the exact mislabel the worklog says cost hours. `derive.py` and `landmarks.json`
are correct (`objSlotHook = $2410D8`, "move.w D0,-(A7)"), but
`pgm.py:744` prints `per-slot hook $2410D8  move.l A5,-(A7)`, and `frame.lua`'s
header (lines 94-98) and its tap comment (548-553) both say "`$2410D6` … <-- THE
HOOK". Anyone reading the probe rather than the deriver walks straight into the
double-count.

**Minor — `frame.lua` contradicts itself on the deepest stack write.** Line ~164
says "the deepest write seen is `$81FE76`"; line ~277, `NOTES-oracle.md`, the
commit message and the worklog all say `$81FE36`. `$81FE76` is the *low* offset
of a different writer in the same table.

**Minor — a scan reported as exhaustive missed a hit.** "I scanned every 6xxx
branch in `$200000-$2FFFFF` for a target of `$25962A`: one hit, `$259620`."
There are two: `$259620 bra` and `$259626 ble`, and the second is printed in the
worklog's own disassembly three lines above the claim. Conclusion unaffected.

**Minor — a cheap check left undone and then reported as unknown.** "I did not
confirm `$2595F2` is even called." It has **25** absolute-long callers
(`$2945B2 $295018 $2950A6 $2956B0 $29592A …`), found in one second with the
`xref.py` this wave shipped. The dead-rank finding is stronger than reported:
25 live call sites all receive a hard-coded 4.

**Informational — `call2 = 77,725 cyc` is wall time, not routine time.**
`MARK IRQ6 mean=252976` falls between `call2 246632` and `call3 324357`, so the
IRQ6 handler's cycles are inside the call-2 window on most frames. Fine for
"where does the work live"; not a routine cost for a budget constant.

**Informational — "the hardware snapshots a half-built sprite list" is an
inference, not a measurement.** It sits in a section headed "What I MEASURED".
In the 60000-nop run `d_spr` and `sprites` did *not* diverge from the control,
so nothing in the corpus exhibits it yet.

**Informational — the stack guard has never been seen red.** It cannot be
triggered through any env var, so I could not break it without editing
`frame.lua`. The `fails`→non-zero-exit plumbing it rides on *was* seen red (E4),
so what is unvalidated is the trigger, not the reporting.

**Informational — the `_cmd_objdriver` "measured slot census" re-runs the gate
scenario**, i.e. the same run as `pgm.py gate`. It is not an independent
measurement of the driver under load; `pgm.py overrun` is.

## Correct and worth keeping

* Everything is VERSION-B where it should be. The main loop, the object driver,
  the allocator, the sprite queue, the rank byte and the player store are all
  `$23xxxx/$24xxxx/$25xxxx` and all verified against the ROM. The only build-A
  intrusion is the ISR, and that is the game's doing, not the wave's.
* The 0-nop control is a real control and its two failures were real defects.
  The `work`-overflow fix is correct (`seconds*20000000 + attos//50000000000`)
  and the `over_budget 275 → 624` correction reproduces.
* `objn`/`objord`/`objlive` are in `COLS`, emitted on every run, and demonstrably
  driven by the hook.
* `overrun` is a permanent scenario in `scenarios.json` with `inject=60000:1900`.
* Every slowdown figure I found carries "MAME-timed, uncalibrated" — worklog
  §2, the commit message, `scenarios.json`'s `why`, and both NOTES additions.
* `docs/worklog/ddpdoj/01-review.md` really is wave 1's review and really was
  untracked; including it is housekeeping, not smuggling.
* The commit touched 12 files, none under `games/gradius/` or `games/batman/`.

## What I did NOT re-measure

* `pgm.py rtc`, `drc`, `seedstate`, `pixred`, `inputlead`, `seed` — wave 1
  commands. A regression there looks like: the gate diverging only on `d_date`
  (RTC), `-drc` vs `-nodrc` disagreeing, the savestate resume moving `irq4ph`,
  `pixred` reporting `pix` unchanged, or a non-zero input lead.
* The `chooser`, `chooser-a` and `stage1-deep` scenarios.
* The 25000/45000-nop sweep points (I ran 60000 only). A regression looks like
  the monotonic pace curve breaking — 1.0000 → 0.6033 → 0.5309 logic/video.
* Item 5's player numbers beyond the byte check of `$2496D4..$2496E8`: no write
  tap on `$8103E0-$8104FF`, no clamp bounds, no per-button speeds.
* The 20 per-type handlers' own sub-table loops (`$813660`, `$8145A0`,
  `$810570`, `$81C8FC`, `$80B058`). (C) stays unmeasured below the top level.
* Items 6 (hitbox) and 8 (`ddpdojp` cross-check): not attempted by the wave and
  not by me.
* Whether a **silent boot from the seeded NVRAM** installs the same (build A)
  interrupt vectors.
* Whether MAME's sprite DMA really reads live RAM at the vblank edge — a
  `pgm.cpp` claim I did not check against source.

## THE SHARED INDEX IS AGAIN CARRYING STAGED DELETIONS OF ddpdoj FILES

Not wave 2's doing, and wave 1 flagged the same thing (`977d005`), but it is
live right now and the next `git commit` from a shared index would ship it:

```
git status --porcelain -- games/ddpdoj docs/worklog/ddpdoj
  D  docs/worklog/ddpdoj/01-review.md
  D  docs/worklog/ddpdoj/02-impl-object-driver-and-overrun.md
  D  games/ddpdoj/tools/oracle/objhunt.lua
  D  games/ddpdoj/tools/oracle/phase.lua
  D  games/ddpdoj/tools/oracle/xref.py
  ?? (the same five, present and intact on disk)
```
Five of wave 2's twelve committed files are **staged for deletion** in
`.git/index`. The working tree is fine — I verified every file I reviewed is
byte-identical to `f2d49c1` with line endings normalised — but anyone who runs
`git commit` without a private `GIT_INDEX_FILE` will delete this wave's three
new tools and two worklogs from HEAD. Use the private-index recipe, and read
`git diff --cached --name-only` before every commit.

## If someone picks this up cold

The one thing to fix before wave 4 writes a line of the ISR: **read the RAM
vector, do not read the listing you expect.** `$801478` holds `$13BDBA` while
the main loop is build B. Re-run
`isrwho.lua`-style vectors + the `$803940` read census (both reproduced above)
after any change to the boot path, and put the *executing* ISR chain into
`landmarks.json` next to the per-build listing chains, so the difference is
visible instead of assumed.
