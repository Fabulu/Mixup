# Wave 1 — ONE oracle, pinned to VERSION-B
status: DONE (with four named open items, all listed below)
wave: 1   role: impl   started: 2026-07-31

## The task, as I understood it

`games/ddpdoj/PLAN-vertical-slice.md` §"Wave 1". Wave 0 left three parallel
harnesses (`tools/oracle/`, `tools/` + `probes/`, `tools/hard/`) and a fourth
ad-hoc one (`tools/drive.lua`). Consolidate on `tools/oracle/pgm.py` as the one
entry point, make it VERSION-B-native, re-derive every landmark on build B, add
a scenario runner with a mandatory lag census, close the wave-0 open items, and
make determinism a **red-validated gate**.

Done when (the plan's words): `pgm.py gate` exists, runs boot→stage-1 on
VERSION-B twice, prints IDENTICAL, has been seen RED under the deliberate cfg
breakage, the pixel snapshot of stage 1 has been looked at, and the landmark
table + seeded-NVRAM procedure are committed.

## Environment, verified at the start

```
$ ls "/c/Users/Fabian Trunz/AppData/Local/Mixup/mame/mame.exe"
/c/Users/Fabian Trunz/AppData/Local/Mixup/mame/mame.exe
$ ls /c/oldpcsx2/ | grep -i ddp
ddp3.zip
ddpdoj.zip
ddpdojb.zip
ddpdojblk.7z
ddpdojblk.zip.SHADOWED-bad-nv        <- still renamed out of MAME's reach
ddpdojblk2.zip.dup-of-above
$ python --version
Python 3.14.0
```

No `ddpdojblk.zip` has crept back beside the `.7z` (`NOTES-versions.md`'s trap).

## What I did

Everything under `games/ddpdoj/tools/oracle/`. I deleted nothing; the other
three harnesses stay as the record of how their numbers were produced.

| file | what |
|---|---|
| `pgm.py` | **rewritten.** THE entry point: 12 commands, the five isolation flags, the build assertion, the machine pin, the per-COLUMN first-divergence report |
| `frame.lua` | **rewritten.** The probe: sample point, lag census, load meter, pixel layer, RAM dump, savestate seeding, boot assertions |
| `derive.py` | **new.** Re-derives the landmark table from the decrypted image, for BOTH builds |
| `dumpcpu.lua` | **new.** Dumps the decrypted `:maincpu` region (init_ddp3 decrypts in place, so the ROM file's bytes are not the executed bytes) |
| `landmarks.json` | **new, committed.** Addresses only |
| `scenarios.json` | **new.** 4 scenarios incl. the controlled VERSION-A/B pair |
| `games/ddpdoj/NOTES-oracle.md` | **new.** The harness note |

## What I MEASURED

### 1. Landmarks re-derived on BOTH builds — and two corrections to the recons

`derive.py` dumps the decrypted image and derives the frame architecture by byte
patterns + `unidasm`, asserting at each step (unique `addq.w #1,$80390a.l`;
exactly one caller of it; the loop tail must branch back to the head).

```
$ python derive.py
# image=...\out\maincpu.bin size=6291456
#   sha256=4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c

=== build B  ($200000-$2FFFFF) ===
   counters routine  $23BE8C  (unique `addq.w #1,$80390A.l` in build B)
   main loop head    $23BFDC  (its ONLY caller in the whole image)
   loop tail         $23C006  bra -> $23BFDC  (7 calls in the body)
     call 0 $23BE8C  call 1 $256D5A  call 2 $2410BC  call 3 $24683E
     call 4 $23D2AE  call 5 $23C212  call 6 $23D12A
   semaphore write   $23C1EC  clr.b,$803940
   semaphore write   $23C200  move.b #$1,$803940   -> waits 1 vblank(s)
   semaphore write   $23C212  move.b #$1,$803940   -> waits 1 vblank(s)
   semaphore write   $23C248  move.b #$2,$803940   -> waits 2 vblank(s)
   semaphore write   $23C25C  move.b #$3,$803940   -> waits 3 vblank(s)
   semaphore write   $23C38A  move.b D0,$803940
   semaphore write   $23C3B4  move.b #$1,$803940   -> waits 1 vblank(s)
   frame sync        $23C212  (main-loop call #5; arms $803940)
   wait loop         $23C208 / $23C3BC / $23C390   (sync branches to $23C390)
   ISR6 release      $23C46C  (subq.b #1,$803940)
   IRQ6 (A) gate     $23C44C  beq -> $23C472
     gated subroutines: ['$24133C', '$240CC0', '$240F26', '$287286']
   input port lea    ['$23D0F8']   P1 mirror store ['$23D11C']
```

**Correction 1 — there are THREE wait loops per build, not one.**
`00-recon-oracle.md` listed this as an open item and named the ARM addresses
(`$13C5A4`, `$13C6AC`, `$13C6BE`); these are the matching SPIN addresses
(`$13C5AC`, `$13C6B4`, `$13C6C6` in A; `$23C208`, `$23C390`, `$23C3BC` in B).
My first version of `derive.py` asserted exactly one and aborted — recorded here
because the abort is what found it.

**Correction 2 — build B has a THREE-vblank arm that build A does not have**,
and also arms through a register:

```
23c238: tst.w  $803930.l
23c23e: beq    $23c268
23c242: subq.w #1, $803930.l
23c248: move.b #$2, $803940.l      <- 29.6 Hz path (both builds)
23c250: cmpi.w #$f, $803930.l
23c258: bls    $23c390
23c25c: move.b #$3, $803940.l      <- 19.7 Hz path (BUILD B ONLY)
...
23c388: moveq  #$2, D0
23c38a: move.b D0, $803940.l       <- arms through a register
```

The recons searched for `move.b #imm,$803940` (`13FC`) only, which is blind to
`$23C38A`. `derive.py` now classifies every absolute-long write to `$803940` by
the opcode in front of the operand instead of by one assumed encoding.
**Both are SCHEDULING, not slowdown**, and both will masquerade as slowdown to
anything that only counts frames. The census reports the armed value per frame.

### 2. A scripted run provably lands in VERSION-B — as a controlled pair

```
$ python pgm.py scen chooser-a          (no chooser input, countdown expires)
  CENSUS build_by_armpc_top_nibble 1:1600
  CENSUS armpc 13C5B6:1600
  BUILD required=A frames_on_required=1600 frames_on_other=0
  snapshot lf1590: "2002.04.05.MASTER VER"

$ python pgm.py scen stage1-open        (P1 Down @lf560, P1 Button 1 @lf600)
  CENSUS build_by_armpc_top_nibble 1:699 2:1901
  CENSUS armpc 13C5B6:699 23C212:1901
  BUILD required=B frames_on_required=1901 frames_on_other=699
  snapshot lf2400: stage 1 gameplay, score 50810, ~14 enemies on screen

$ python pgm.py seed  (silent boot from the seeded NVRAM)
  snapshot lf1450: "2002.10.07.BLACK VER"
```

I looked at all of these PNGs as images. `lf001750` is the ship-select screen,
`lf002400` is unmistakable stage-1 gameplay (player ship firing, tanks,
explosions, HUD). **This closes `PLAN` assumption 3** — VERSION-B's own version
screen says `2002.10.07.BLACK VER`.

The build assertion is *last-frame* as well as *any-frame*: the chooser runs
from build-A code, so "some frames were in B" would let a timeout fall-through
pass. An earlier 900-frame seed check reported "still build A" — that was the
run ending before the countdown expired (the countdown ticks about once every
115 logic frames: "6" at lf560, "4" at lf790, "3" at lf850), not the seed
failing. Recorded because the wrong conclusion was one sentence away.

### 3. THE GATE, and it has been seen RED

```
$ python pgm.py gate
=== gate scenario 'stage1-open'
  run 1: 13f8ef743e0b3a53dbcf0ae36278dbe2defc4b514e0219fe1d8f834481841382 (2600 rows)
  run 2: 13f8ef743e0b3a53dbcf0ae36278dbe2defc4b514e0219fe1d8f834481841382 (2600 rows)
IDENTICAL

$ python pgm.py gate --break-cfg      (MAME's own cfg/nvram, -readconfig -writeconfig)
  run 1: efd70f75750600ea0a42c437a02a7dce84499ef1300eda81cb0b16219da0929e
  run 2: d120376db923319f9290da7ec40dc406f1342708e03590b8e4c196c30bf9f5b7
DIVERGED
  col vf:    first differs at row 1 (lf=1): 16 vs 15
  col cyc:   first differs at row 1 (lf=1): 5525303 vs 5300763
  col work:  first differs at row 2 (lf=2): 40156 vs 40166
  col spin:  first differs at row 1205: 2584 vs 2554
  col d_ram: first differs at row 1 (lf=1): 6723357791677262253 vs 2746873631406365912
  col d_top: first differs at row 1
  col d_pal: first differs at row 1205
  col d_tx:  first differs at row 101
  col pix:   first differs at row 120
EXPECTED-RED: diverged, as it must
```

The report is **per COLUMN**, not "the files differ": a single
first-divergent-row report points at whichever field happens to be leftmost and
hides the rest, which is exactly the shape `docs/knowledge/08` warns about.

`--break-cfg` writes into MAME's install `cfg/`+`nvram/` (both already existed
from wave 0). Nothing in this harness reads those directories.

### 4. THE DATE — the wave-0 open item that turned out to be a real bug

`00-recon-oracle.md` left "a run tomorrow is not proven to agree with a run
today" as a scheduled check. It does **not** agree, and I localised it to ten
bytes.

```
$ python pgm.py rtc
  CENSUS rtc_reads=896
  CENSUS rtc_site off=C00006 pc=23C544 n=8      <- build B reads the calendar
  CENSUS rtc_site off=C00006 pc=00B79A n=200    <- the BIOS
  CENSUS rtc_site off=C00006 pc=13C8B0 n=8      <- build A
  CENSUS rtc_site off=C00004 pc=18AD10 n=680    <- soundlatch2, not the RTC
```

`$C00006` is the V3021 calendar (`pgm.cpp` maps `c00002/4/c` to the sound
latches and `c00008/a` to Z80 reset+control). Build B reaches it through
`$23C53A: lea $C00006,A0`.

MAME has no RTC override and I could not move the system clock, so I moved the
LOCAL date with `TZ`: `XXX-14` (UTC+14) vs `XXX+12` (UTC-12) are 26 hours apart
and are guaranteed to be different calendar days. The two runs demonstrably read
different bytes out of the calendar, so the experiment did what it claims:

```
TZ=XXX-14  rtc_first_bytes_at_C00006=0000 0000 ... 0001 0000 0001 0001 ...
TZ=XXX+12  rtc_first_bytes_at_C00006=0000 0000 ... 0000 0001 0000 0001 ...
DIVERGED across the date change
  col d_ram: first differs at row 1 (lf=1)
```

Only `d_ram` differed — every other column agreed on all 2,600 frames. A full
128 KiB RAM dump at logic frame 2600 from both runs:

```
differing bytes: 10
  $80209B..$80209B  len=1  A=08  B=07
  $80209D..$80209D  len=1  A=01  B=1f
  $8020AC..$8020AD  len=2  A=0801  B=071f
  $80211C..$80211D  len=2  A=0801  B=071f
  $802204..$802205  len=2  A=0801  B=071f
  $8022C8..$8022C9  len=2  A=0801  B=071f
```

Month 08 day 01 versus month 07 day 31 — the calendar, five copies of it. The
five 8-byte words containing them are carved out of `d_ram` and emitted as their
own column `d_date`, named in `frame.lua` with the measurement that justifies
each hole. Re-run after the carve-out:

```
  TZ=XXX-14   48c6a8fb...   TZ=XXX+12   13f8ef74...
DIVERGED
  col d_date: first differs at row 1 (lf=1)      <- and NOTHING else
```

**Reported, not hidden.** A hole in a digest that nobody can see is how a real
divergence gets excused later. The gate prints `IDENTICAL-EXCEPT-DATE` and
passes only when `d_date` is the sole differing column.

### 5. The other wave-0 open items

**(b) Savestate seeding at the game's own sample point.**
Saving from *inside* the write tap does not work — measured, not assumed:

```
  aligned on $80390A: 120 frames compared
  d_ram:  differs on 120/120 frames    d_top: 117/120
  d_pal:  57/120    d_tx: 1/120    c390e: 120/120
```

`buffer_save()` in a memory tap re-enters the emulation core mid-instruction.
Arming the save at the arm write and TAKING it in the next frame notifier:

```
  SAVED_AT_SAMPLEPOINT lf=2000 vf=2036 bytes=8947832
  aligned on $80390A: 120 frames compared
  d_ram:  differs on 1/120    d_top: 20/120    irq4ph: 1/120
```

`d_spr`, `d_pal`, `d_spb`, `d_bg`, `d_tx`, `sprites`, `$80390E` and `p1raw` are
identical on all 120 frames. `$80FA84` is a compared column (`irq4ph`), which is
the plan's stated alternative to fixing the phase.

**(c) Pixel layer — dumped, looked at, and RED-VALIDATED.** `PROBE_PIXELS=N`
hashes the *whole* framebuffer (every 8 bytes of the 401,408-byte pixel string)
every Nth logic frame. Sensitivity, measured:

```
stage1-open: pix sampled 130x, distinct 88
             sampled frames with >50 sprite entries: 30, distinct pix 30
stage1-deep: pix sampled 100x, distinct 70;  >50 entries: 38, distinct pix 38
```

and the real test — `pgm.py pixred` clears bit 0 of the IGS023 control register
`$B0E000` (the sprite-DMA enable, `igs023_video.cpp sprite_dma()`) from Lua, so
the game's RAM is untouched but the picture loses its whole sprite layer:

```
  columns that differ with the sprite layer switched off: ['d_spb', 'pix']
PIXEL LAYER RED-VALIDATED: pix moved, the RAM digests did not
```

`d_spb` is the post-DMA sprite buffer — the DMA's destination — so it moving is
confirmation the poke did what it claimed.

**(d) Speed.** The wave-0 probe ran at 17–21 % of real time; the digest loop was
the cost. Replacing the per-u32 four-byte FNV with a per-u64 xor-multiply over
the same bytes (2 Lua ops per 8 bytes instead of ~16 per 4):

```
$ time python pgm.py scen stage1-deep      # 5000 logic frames, meter + pixels
real 1m19s        -> ~107 % of real time; 10,000 frames ≈ 2.6 min
```

Comfortably inside the plan's "10,000-frame scenario in ≤5 minutes".
(`read_u64` raises "integer value will be misrepresented in lua" for values with
the top bit set — use `read_i64` and `string.unpack("<i8", …)`.)

**(e) `-drc` vs `-nodrc`:** byte-identical traces, same sha256
`13f8ef743e0b3a53...`.

### 6. Other numbers from the pinned harness

```
maincpu_fnv64=D4C25CA9C91B9D47   (decrypted :maincpu, 6,291,456 bytes, every run)
refresh_hz=59.185606061 frame_attos=16896000000000000 cycles_per_frame=337920
input lead: Button 1 at the sample point of lf2000 -> $803970 bit 4 set at lf2001; lead = 0
peak sprite-list length: 133 of 256 (wave 0 saw 95). The cap is still unreached.
work_cycles over the 337,920 budget: 2 of 2,600 frames; irq6>1 on 16 frames
seeded NVRAM sha256 3c4d8ef5818fbf8cfc0715ba91515f9399cc6255b579ceff6f4c56c9f5235e84
$03810 = 01 after choosing VERSION-B, 00 in the factory blob and at boot
```

## What I could not do, and why

1. **A real system-clock date change.** The `TZ` trick moves the local date by
   26 hours and the two runs provably read different calendar bytes, but it does
   not exercise a month/year rollover and it depends on MAME's CRT honouring
   `TZ`. If a future run disagrees with a number here, check the date first.
2. **I did not prove the three wait routines per build are unreachable.**
   `armpc` was `$13C5B6`/`$23C212` on every frame of every scenario — a
   PRESENCE result. The probe keys on the semaphore rather than on the PC, so it
   survives either way, but **do not write "the game only waits at $23C212"**.
3. **No overrun was forced.** `work_cycles` exceeded the budget on 2 of 2,600
   frames and 16 frames spanned >1 video frame, but the loop completed every
   frame. Case **(C)** is still completely unmeasured and the top-level object
   driver is still not located. That is wave 2 item 1/2 and `docs/knowledge/06`
   says (C) cannot be retrofitted.
4. **The ten date bytes were localised at one logic frame of one scenario.**
   They are almost certainly a fixed structure, but the carve-out's addresses are
   a measurement of `stage1-open` at lf2600, not a proof about all of RAM. If a
   future scenario shows a date byte outside those five words, the hole list is
   wrong and `d_ram` will (correctly) go red.
5. **`$18AD10` reads `$C00004` 680 times during a VERSION-B run.** `$18xxxx` is
   nominally build A's address range, so either the sound code is shared between
   the builds or the range boundary is not where I assumed. Not chased; it is
   wave 3's sound-map territory. Written down because a "build B only executes
   `$23xxxx`" assumption would be wrong.
6. **`--break-cfg` rewrote MAME's install `cfg/ddpdojblk.cfg` and
   `nvram/ddpdojblk/`.** Both already existed from wave 0 and nothing in this
   harness reads them, but a run that deliberately uses MAME's defaults will now
   start from this session's coin counter.

## If someone picks this up cold

```
cd games/ddpdoj/tools/oracle
python pgm.py verify        # -verifyroms + the machine pin
python pgm.py landmarks     # the per-build table -- READ THIS FIRST
python pgm.py gate          # must print IDENTICAL
python pgm.py gate --break-cfg   # must print DIVERGED
python pgm.py scen          # the corpus, lag census on every scenario
```

`python derive.py` regenerates `landmarks.json` from a fresh dump if the ROM
directory ever changes. `out/` is gitignored twice over; the decrypted image,
the traces, the PNGs, the savestates and the seeded NVRAM all live there and
none of them is ever committed.

Five things that will save you the hours they cost me:

1. **`read_u64` fails on this Lua build** for values with the top bit set:
   `integer value will be misrepresented in lua`. Use `read_i64` and
   `string.unpack("<i8", …)`. Same bits, no error.
2. **`buffer_save()` inside a memory tap produces a state that restores but does
   not resume.** Arm in the tap, save in the frame notifier.
3. **The build assertion must check the LAST frame**, not just "any frame". The
   chooser is build-A code, so a run that fell through to VERSION-A after
   scripting the chooser would otherwise pass.
4. **A short run is not a negative result.** The chooser countdown ticks about
   once per 115 logic frames and does not expire until ~lf1200–1400. Two
   conclusions of mine ("the seed does not work", "the timeout does not pick A")
   were both just runs that ended too early.
5. **Look at a PNG in every session.** `pgm.py snap`. This project has produced
   clean, plausible, entirely worthless numbers from a halted machine and from
   the INPUT TEST screen, twice.

## Postscript — the shared-index hazard, seen live

My work was committed as `ac60c4e` through a private index, correctly. The very
next commit, `3761405` (another workflow, the rank/loops/replay recon), was built
from an index that had been `read-tree`'d at a HEAD **predating** mine, so its
tree carried the OLD `tools/oracle/` and **dropped all ten wave-1 paths**:

```
$ git show --numstat 3761405 | grep ddpdoj/tools/oracle
0   336  games/ddpdoj/tools/oracle/derive.py
0    45  games/ddpdoj/tools/oracle/dumpcpu.lua
130 422  games/ddpdoj/tools/oracle/frame.lua
0   246  games/ddpdoj/tools/oracle/landmarks.json
...
```

Restored verbatim in `f552714` — re-applying `ac60c4e`'s ten paths on top of
`3761405`, through a private index, touching nothing of theirs
(`git diff ac60c4e HEAD -- <my paths>` is empty; `git diff 3761405 HEAD` is
exactly my ten paths). `NOTES-slowdown-oracle.md` needed nothing: `3761405`
committed a working tree that already contained wave 1's append to it.

**The lesson is narrower than "use a private index" — I did use one.**
`git read-tree HEAD` has to happen **immediately before** staging, not at the
start of a session: an index read even a few minutes early silently reverts
whatever landed in between, and `git commit` will not warn you. Worth checking
`git log --oneline -3` after every commit, which is how this was caught.

### WARNING, live at the time of writing

The **shared** index (`.git/index`) currently holds staged DELETIONS of all ten
wave-1 paths, because it was read at a HEAD that predates them:

```
$ git status --porcelain games/ddpdoj
D  games/ddpdoj/tools/oracle/derive.py
D  games/ddpdoj/tools/oracle/landmarks.json
D  games/ddpdoj/NOTES-oracle.md
...
```

**If the next commit from that index goes in without a fresh `git read-tree
HEAD`, wave 1 is reverted a second time.** I deliberately did not refresh it:
it also holds staged state belonging to the other workflow
(`D games/ddpdoj/NOTES-replay.md`), and touching another agent's index is how
the first accident happened. Whoever commits next: `git read-tree HEAD`
immediately before `git add`, then read `git diff --cached --name-only`, and
`git log --oneline -3` afterwards.
