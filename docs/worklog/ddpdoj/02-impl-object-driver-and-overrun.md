# WAVE 2 - the measurements that decide the architecture

status: DONE (items 1,2,3,4,7 measured; 5 partial; 6,8 BLOCKED -- see below)
wave: 2   role: impl (recon, oracle-assisted)   started: 2026-07-31

All addresses are **VERSION-B** (`$23xxxx`/`$24xxxx`/`$25-28xxxx`, 2002.10.07
BLACK VER) unless a line says build A. Machine pin on every run:
`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 bytes.

## The task, as I understood it

`PLAN-vertical-slice.md` §"Wave 2" - eight questions, on VERSION-B, through the
wave-1 harness. No port code. The three that HARD-GATE wave 5 are items 1
(object driver), 2 (force an overrun) and 4 (phase order).

## What I did

New tools, all under `games/ddpdoj/tools/oracle/`:

| file | what it does |
|---|---|
| `objhunt.lua` | write map with CURPC attribution: per instruction, the offsets touched, the GCD of consecutive deltas (= the stride of the table it walks), and the count PER LOGIC FRAME |
| `phase.lua` | times the seven main-loop calls by tapping each `jsr`'s first word, and attributes every main-RAM write to the call it happened in (interrupts separated by the 68000's own IPL mask, not guessed) |
| `xref.py` | static helpers over the decrypted image: `lea`/abs-long xref, caller search, pointer-table dump, `unidasm` wrapper |

Extended: `derive.py` (object-driver + allocator landmarks, both builds, with
the whole driver shape asserted), `frame.lua` (the `objn`/`objord`/`objlive`
columns, the artificial-load injector, the dead-stack guard), `pgm.py`
(`objdriver`, `overrun`), `scenarios.json` (the permanent `overrun` scenario).

---

## What I MEASURED

### 1. THE TOP-LEVEL OBJECT DRIVER - located. `$2410BC`, main-loop call #2.

**How it was found, in order, because the order is the method:**

`phase.lua` tapped the first word of each of the seven `jsr abs.l` in the main
loop. That is straight-line code, so the fetch of `jsr N+1` happens when routine
N returns, and the difference of two fetch times is routine N's duration.
2,600 logic frames of the gate scenario, cycles measured from the sample point:

```
MARK postvbl    n=1900 mean_cyc_into_frame=244296 min=88556  max=346730
MARK tail       n=1900 mean=244736
MARK IRQ4       n=2617 mean=244864
MARK counters   n=1901 mean=246121      $23BE8C     293 cyc
MARK call1      n=1901 mean=246414      $256D5A     218 cyc
MARK call2      n=1901 mean=246632      $2410BC  77,725 cyc   <-- THE WORK
MARK IRQ6       n=2617 mean=252976
MARK call3      n=1901 mean=324357      $24683E   1,734 cyc
MARK call4      n=1901 mean=326091      $23D2AE  15,594 cyc   <-- sprite list
MARK w23D6B4    n=78477 mean=334202                the sprite emitter
MARK sync       n=1901 mean=341685      $23C212  arms + spins
CENSUS sr_mask_main 0:2289861      CENSUS sr_mask_isr 6:44760 7:24164 4:16487
```

and the write attribution was unambiguous - **every object-ish writer is in
call2, every sprite-list writer is in call4**:

```
ATTR pc=23D6B4 n=156954 call4:156954     the 10-byte hardware sprite entries
ATTR pc=23D718 n=57030  call4:57030
ATTR pc=240DEC n=37832  call2:37832
ATTR pc=23DFD6 n=31268  call2:31268
ATTR pc=2417B0 n=18938  call2:18938
ATTR pc=268900 n=8153   call2:8153
... 70 of 70 reported writers land in exactly one call
```

Then `xref.py callers 2410BC` → **exactly one caller, `$23BFE8`** = main-loop
call #2. Disassembling it gives the driver verbatim:

```
2410bc: bsr $241262          drain the pending-KILL queue
2410c0: bsr $24111E          drain the pending-CREATE queue (priority insert)
2410c4: lea $80E240,A5       THE OBJECT TABLE
2410ca: moveq #$13,D0        20 SLOTS
2410cc: move.w (A5),D1       slot type word; 0 = empty
2410ce: beq  $2410E8
2410d0: andi.w #$ff,D1
2410d4: lsl.w #3,D1
2410d6: move.l A5,-(A7)
2410d8: move.w D0,-(A7)
2410da: lea ($240F62,PC),A0  the dispatch table
2410de: movea.l (A0,D1.w),A0
2410e2: jsr (A0)             the per-slot handler
2410e4: move.w (A7)+,D0
2410e6: movea.l (A7)+,A5
2410e8: lea ($50,A5),A5      STRIDE $50 = 80 bytes
2410ec: dbra D0,$2410CC
2410f0: rts
```

**Geometry: 20 slots × $50 bytes at `$80E240`..`$80E87F`.** Confirmed twice
over: `$24107C` is the table init and clears exactly 20 slots at stride $50, and
`$2411E2`/`$24111E` both use the literal `$80E880` as the table end.

Record layout established so far: `+$00` word = type (0 = empty; `| $8000` marks
a freshly created one), `+$4A` word = **priority / sort key**, `+$4C` long =
unique ID.

Dispatch table `$240F62`, **8-byte entries = {handler long, priority word, 0}**,
**20 entries** (entry 20 onward disassembles as code):

```
[ 0] $28D520 pri 09   [ 5] $28B5E0 pri 18   [10] $260794 pri 1f   [15] $291F66 pri 1e
[ 1] $26127A pri 1a   [ 6] $28D63C pri 0a   [11] $25DBB4 pri 0a   [16] $256E7A pri 1e
[ 2] $2491C0 pri 1c   [ 7] $290BE8 pri 1e   [12] $28F3AC pri 09   [17] $25CEB8 pri 0a
[ 3] $249246 pri 1b   [ 8] $25A770 pri 0a   [13] $288A60 pri 0b   [18] $24902A pri 0a
[ 4] $260B30 pri 09   [ 9] $25CACA pri 0a   [14] $288C6C pri 14   [19] $28EE88 pri 1e
```

> **THERE IS NO BUDGET TEST AND NO TIME TEST IN THAT LOOP.** `moveq #$13,D0 …
> dbra` - 20 slots, unconditionally, every frame. That is the LISTING's answer
> to mechanism (C) at the top level. The runtime column below is the
> measurement, because only a measurement can carry it.

**Build A has the identical architecture at `$1413FE`** (same table, same 20
slots, same $50 stride, dispatch table `$141294`, allocator `$1414BC`). Two
independent implementations of one design agreeing is the free cross-check this
cartridge gives us, and `derive.py` asserts the whole 0x2C-byte shape on both.

#### The allocator, and what happens when allocation fails

This is wave-2 item 3's *real* question. The sprite display list is a hardware
cap; the object table is the game's.

```
241182: movem.l D1-D2,-(A7)
241186: move.w $80DBAC,D2       pending-CREATE queue write pointer
24118c: cmpi.w #$640,D2         $640 = 20 records of $50
241190: bge  $2411D4            ---- FULL ----
241194: move.w D0,D1            D0 = the requested TYPE
241196: lsl.w #3,D1
241198: lea ($240F62,PC),A0
24119c: move.w ($4,A0,D1.w),D1  the type's PRIORITY, out of the dispatch table
2411a0: lea $80D56C,A0          the staging area
2411a6: adda.w D2,A0
2411a8: ori.w #$8000,D0
2411ac: move.w D0,(A0)          +$00 type | $8000
2411b2: move.w D1,($4a,A0)      +$4A priority
2411be: addq.l #1,$80E882       the ID counter
2411ca: move.l D0,($4c,A0)      +$4C unique ID
2411d2: rts                     -> A0 = the new record
2411d4: lea $80D51C,A0          ---- FULL: a DUMMY record ----
2411da: moveq #$0,D0
2411e0: rts
```

**Allocation failure #1 - the pending-create queue is full (20 spawns already
staged this frame): `$2411D4` hands back a DUMMY record at `$80D51C` and D0=0.
The caller fills in the dummy, the object never enters the table, and the spawn
is SILENTLY DROPPED. Nothing is evicted, nothing is signalled.**

The commit, run at the top of the driver, inserts staged records into the table
**in descending `+$4A` priority order**:

```
24111e: tst.w $80DBAC ; beq $241180
241128: lea $80D56C,A0
24112e: tst.w (A0) ; beq $241172
241134: move.w ($4a,A0),D5        the new object's priority
241138: lea $80E240,A1 ; moveq #$13,D6
241140: cmp.w ($4a,A1),D5
241144: blt $24116A               new.pri < slot.pri -> keep looking
241148: lea ($50,A1),A2 ; movea.l A1,A3
24114e: D4=A2 ; D3=$80E880-D4     bytes from slot+1 to the table END
241158: bsr $2410F2                SHIFT THE TAIL DOWN ONE SLOT
24115a: move.w #$27,D2 ; move.w (A2)+,(A1)+ ; dbra    copy the $50-byte record in
24116a: lea ($50,A1),A1 ; dbra D6,$241140
241172: lea ($50,A0),A0 ; subi.w #$50,$80DBAC ; bne $24112E
```

Two consequences that a port cannot invent:

* **Insertion memmoves the tail DOWN by one slot, so slot 19's contents are
  overwritten and lost.** When the table is full, spawning a higher-priority
  object DESTROYS the lowest-priority one, with no notification.
* **If the `dbra D6` runs out - every slot's priority is higher than the new
  object's - control falls through to `$241172` and the staged record is
  discarded.** Second silent-drop path.

Deletion (`$2411E2`, matching an object by its `+$4C` ID) memmoves the tail
**UP** and clears the now-vacant last slot. So **slot indices are not stable
identities, but the ORDER is semantics** - precisely the shape
`docs/knowledge/06` warns about, and the reason `objord` hashes the *sequence*
and not a set.

The kill side has its own queue: push at `$241238` with the same
`cmpi.w #$640 / bge` full-check that **silently drops the request**, drained at
`$24126C`.

#### The runtime column - `objn` / `objord` / `objlive`

`frame.lua` now hooks `$2410D8` (`move.w D0,-(A7)`), reads A5 and derives the
slot index, and emits three columns in the standard state vector:

```
CENSUS object_slots_processed 0:699 1:504 2:1 5:1396
CENSUS object_slots_live      0:2   1:1201 2:1 5:1396
```

(the `0:699` are the boot frames that run in **build A**, whose driver is at a
different address - a build-B hook cannot see them, and that is stated rather
than papered over.)

> **A TRAP PAID FOR HERE, worth its own line.** The obvious hook is `$2410D6`,
> `move.l A5,-(A7)` - also a write, also a legitimate 68000 execution hook. It
> gave `object_slots_processed 10` against `object_slots_live 5` on 796 frames.
> **The program space is 16 bits wide, so a longword write is two bus cycles and
> fires a write tap TWICE.** Read as "the driver processes twice as many slots as
> exist", that would have been a plausible, stable, entirely wrong number. Hook
> the WORD push.

### 2. THE OVERRUN - forced, and the tool it took

**MAME's `-speed` is not the tool.** It is a host throttle; the emulated frame
is still exactly 337,920 cycles, so it produces no in-game slowdown at all.

**The intended tool - a per-CPU clock scale - is NOT REACHABLE in MAME 0.288.**
Four places looked, all measured on this machine:

```
device usertype metatable (dumped in full, 30 members):
  __eq __index __name __newindex __pairs __tostring __type basetag class_cast
  class_check configured debug ioport items membank memregion memshare name new
  owner parameter roms shortname siblingdevice siblingtag spaces started state
  subdevice subtag tag
  -> no clock, no clock_scale, no set_clock_scale
manager.ui metatable: get_char_width get_general_input_setting get_string_width
  image_display_enabled line_height menu_active options set_aggressive_input_focus
  show_fps show_menu show_profiler single_step ui_active   -> no slider list
mame.exe -showusage | grep -i clock  -> only -yiq_p "Pixel Clock scaling"
strings mame.exe                     -> "Overclock CPU %1$s" EXISTS (the internal
  UI slider) but there is no <slider> cfg node, so it is not persisted either
```

So the slider exists in the binary and is reachable only through the interactive
UI. **I could not reach it; here is what I tried.** Recorded as a did-not-find.

**What I used instead: a NOP sled written into the decrypted `:maincpu` image.**
`$340000` is inside the 68000's ROM window (`cavepgm_mem` maps `$000000-$3FFFFF`)
and past the end of the 2 MiB program (`$100000..$2FFFFF`), so nothing the game
can reach is overwritten. N `nop`s then `jmp <original target>`, and one
main-loop `jsr` operand repointed at it. A `nop` pushes nothing, clobbers no
register, sets no flag: it changes WHEN the frame runs out of time and nothing
about WHAT the game does about it.

#### The control failed twice, and both failures were worth more than the sweep

**First version** was a counted delay loop that saved D0 on the stack. With
ITERS=0 its trace still differed from the unpatched run on `d_ram`. Rather than
wave it through, I dumped all 128 KiB at the injection frame in both runs:

```
differing bytes: 18
  $81FEE2  c0   vs 00        $81FF26  c0   vs 00
  $81FEE8  0280 vs 0000      $81FF2C  0280 vs 0000
  $81FEEC  000a vs 5000      $81FF30  000a vs 5000
  $81FEF1  00   vs 01        $81FF35  00   vs 01
                             $81FF37  904000 vs 25f1f6   <-- $0025F1F6 is a
                             $81FF53  00   vs 04              build-B CODE address
                             $81FF56  0d0a vs 0cf4
```

Every one is dead stack, and `$81FF37` names the cause: a 12–60 cycle shift
changes which instruction an interrupt lands on, so the PC the 68000 pushes in
the exception frame differs, and after the `RTE` that is residue below SP.

**Which exposed a real defect in the wave-1 oracle.** Wave 1 hashed
`$800000..$81FEFF` as `d_ram` and carved only the top page `$81FF00..$81FFFF`
out as `d_top` "(dead stack)". **The stack goes deeper than one page**, so
`d_ram` has been hashing ~256 bytes of stack residue all along. Measured, write
tap on `$81FE00-$81FEFF` over the 2,600-frame gate scenario:

```
RANGE $81FE00-$81FEFF frames=2600 distinct_writer_pcs=49
W pc=13CEC8 n=3341 off=81FE36..81FEFE span=200 perframe 3..30 frames_active=332
W pc=28D38A n=246  off=81FEB8..81FEF2 span=58
W pc=13BDBA n=60   off=81FE76..81FEE0 span=106
W pc=000CBE n=4    off=81FEAE..81FEE0 span=50    <- the BIOS IRQ6 TRAMPOLINE
W pc=000CA6 n=2    off=81FEB2..81FEB4 span=2     <- the BIOS IRQ4 TRAMPOLINE
... 49 PCs, EVERY ONE a push: spans of 2/6/50/106/200 bytes (movem frames),
    none data-shaped, deepest write $81FE36
```

So the boundary moved to `$81FE00` (54 bytes of headroom under the deepest
observed push) and a **guard tap on the 256 bytes below it FAILS the run** if
the stack ever goes deeper. **This changes every digest in the corpus against
wave 1's recorded hashes** - that is the price of the correction and it is
stated rather than hidden.

**Second version** (the NOP sled) then produced the intended control:

```
=== CONTROL: patch installed, ZERO nops, vs no patch at all ===
  col cyc:   first differs at row 1901 (lf=1901): 336706 vs 336718   (+12, the jmp)
  col work:  first differs at row 2148: 161616 vs 161636
  col spin:  first differs at row 1902: 9702 vs 9701
  col d_top: first differs at row 1901                                (dead stack)
  -> d_ram, d_spr, d_pal, d_spb, d_bg, d_tx, sprites, objn, objord, objlive,
     $80390A, $80390E, p1raw, irq4, irq6, rel, armpc, build: ALL IDENTICAL
```

`pgm.py overrun` refuses to report a sweep unless the control moves nothing
outside `{cyc, work, spin, d_top}`.

#### And a second defect, found by the same control: `work` was 0 half the time

Wave 1's `emit()` computed `t = M.time.attoseconds + M.time.seconds * 1e18`.
int64's maximum is 9.223e18, so **that product overflows once `seconds` reaches
10** and `t` goes negative - roughly every 9.2 emulated seconds, i.e. every ~546
logic frames. `cyc` survived because it is a difference and two's-complement
subtraction wraps correctly. `work` is guarded by `rel_t > 0`, which is FALSE
whenever the clock is in a wrapped stretch. Measured on the unpatched gate
scenario, printing the frames where `work` changes between 0 and non-zero:

```
lf=2    work=40156      lf=531  work=0      lf=1059 work=63000
lf=1603 work=0          lf=2148 work=161616
```

**1,254 of 2,600 frames had `work = 0`**, and the `work_cycles` census line was
computed over whichever half of the run happened to have a positive clock.
Fixed by computing cycles directly and exactly - the 68000 is 20 MHz, so one
cycle is 5e10 attoseconds:

```lua
local function cycnow()
  return M.time.seconds * 20000000 + (M.time.attoseconds // 50000000000)
end
```

The size of the correction, same NOPS=60000 run before and after the fix:

```
before:  CENSUS work_cycles min=38070 max=402178 budget=337920 over_budget=275
after:   CENSUS work_cycles min=7338  max=2580102 budget=337920 over_budget=624
```

`phase.lua` had the same expression and is fixed too (its numbers were deltas
and so were already right, but the expression should not survive anywhere).

#### THE SWEEP - the overrun, characterised

`python pgm.py overrun 25000 45000 60000`, injected before the object driver
from logic frame 1900, 2,600-frame `overrun` scenario, VERSION-B.
**Every figure is MAME-timed and UNCALIBRATED; this is mechanism, not
magnitude.**

```
-- NOPS=25000  (100,012 added cycles/frame, budget 337,920)
   CENSUS irq6_per_logicframe 1:2584 2:15 3:1
   CENSUS armed_vblanks 1:2600
   CENSUS work_cycles min=7338 max=2580102 budget=337920 over_budget=14
   CENSUS object_slots_processed 0:699 1:504 2:1 5:413 7:350 8:632 9:1
   CENSUS object_slots_live      0:2   1:1201 2:1 5:413 7:350 8:632 9:1
   OVERRUN n=696 after lf1905: spanned>1_videoframe=0 A_gate_firings=0 objn<objlive=0
   PACE  695 logic frames over 695 video frames = 1.0000 logic/video

-- NOPS=45000  (180,012 added cycles/frame)
   CENSUS irq6_per_logicframe 1:2126 2:473 3:1
   CENSUS armed_vblanks 1:2600
   CENSUS work_cycles ... over_budget=415
   CENSUS object_slots_processed 0:699 1:504 2:1 5:413 7:350 8:632 9:1
   CENSUS object_slots_live      0:2   1:1201 2:1 5:413 7:350 8:632 9:1
   OVERRUN n=696: spanned>1_videoframe=458  A_gate_firings=458  objn<objlive=0
   PACE  695 logic frames over 1152 video frames = 0.6033 logic/video

-- NOPS=60000  (240,012 added cycles/frame)
   CENSUS irq6_per_logicframe 1:1968 2:631 3:1
   CENSUS releases_per_logicframe 0:1 1:2599
   CENSUS armed_vblanks 1:2600
   CENSUS work_cycles min=7338 max=2580102 budget=337920 over_budget=624
   CENSUS object_slots_processed 0:699 1:504 2:1 5:413 7:350 8:631 9:1 11:1
   CENSUS object_slots_live      0:2   1:1201 2:1 5:413 7:350 8:632 9:1
   CENSUS max_sprite_entries=122
   OVERRUN n=696: spanned>1_videoframe=614  isr6_A_gate_firings=614  objn<objlive=0
   PACE  695 logic frames over 1309 video frames = 0.5309 logic/video;
         $80390A advanced 695 (= logic frames: YES)
   STATE vs the 0-nop control: 4 of 14 game-state columns diverge
     col objn:   first differs at lf=2512: 8 vs 11
     col objord: first differs at lf=2512
     col d_ram:  first differs at lf=1903
     col pix:    first differs at lf=2000
```

Raw per-frame, lf2000-2050 of the NOPS=60000 run against the control:

```
control    cyc mean=339037  irq6 {1}  rel {1}   (1 video frame per logic frame)
NOPS=60000 cyc mean=676980  irq6 {2}  rel {1}   (2 video frames per logic frame)
```

**Five answers, and they are the point of the whole wave:**

1. **The overrun is (B) time dilation at whole-video-frame granularity.** At
   240,012 added cycles the logic frame takes 676,980 cycles = exactly two video
   frames (2 × 337,920 = 675,840), and the game runs at **0.5309 logic frames
   per video frame - ~31.4 Hz against the display's 59.1856 Hz**.
2. **The IRQ6 (A) gate fires on every missed vblank: 614 firings in 696 frames.**
   A dilated logic frame sees N vblanks and gets exactly ONE release; the other
   N−1 IRQ6s find `$803940 == 0`, take the `beq` at `$23C44C`, and skip
   `$24133C` `$240CC0` `$240F26` `$287286` and the release. **The input read
   `$23D0F8` runs before the gate on every one of them.** *A dropped frame is
   not uniform*, measured on this ROM.
   > Note on the census: wave 1's `gated_zero_release` counts frames with
   > `rel == 0`, which stayed at 1 through all of this. The right statistic is
   > `sum(irq6 − rel)`. Reading `gated_zero_release` as "gate firings" would
   > have reported **0** on a run with **614**.
3. **THERE IS NO MECHANISM (C).** `object_slots_processed` equals
   `object_slots_live` on **all 696 overrun frames** at 0.53× speed with 624
   over-budget frames. The driver walked all 20 slots and dispatched every live
   one, every frame, exactly as the `dbra` in the listing says it must.
   The one frame where they differ has `objn = 11 > objlive = 8` (spawn/kill
   churn within the frame), never `objn < objlive`.
4. **YES, THE GAME'S OWN LOGIC OBSERVES THE SLOWDOWN.** `$80390A` advanced 695
   over the same stretch in which **1,309 video frames** passed - it tracks
   LOGIC frames exactly and falls 614 frames behind the display. It is
   incremented at `$23BE8C` inside the loop body and has 83 reference sites, and
   `$80390E` is read back by the frame sync itself. So animation phase,
   alternation and anything else driven by those counters **slows WITH the game,
   not with the display**. This was `NOTES-slowdown-oracle.md`'s "single most
   important question in this folder"; it is now measured rather than argued.
5. **An overrun changes WHAT the game computes, not only when.** `d_ram`
   diverges from the control **three frames after the injection starts**
   (lf1903), the framebuffer from lf2000, and the object population by lf2512.
   Note that `d_pal`, `d_bg`, `d_tx`, `d_spr`, `d_spb` and `sprites` did **not**
   diverge in this scenario - the gated subroutines are themselves conditional
   (`$24133C` begins `tst.w $80FA66 / beq`), so "the gate skipped the palette
   upload" is a fact about which code ran, and on this scenario it happened to
   have no palette-visible effect. Both halves of that are stated.

And one negative result worth keeping: **`armed_vblanks` was `1:2600` in every
run, overrun included.** The 2-vblank (29.6 Hz) and 3-vblank (19.7 Hz) divider
paths at `$23C248`/`$23C25C` **still have never been observed to execute**, and
they are not an overrun response. They remain a listing-only feature.

### 4. THE PHASE ORDER WITHIN ONE FRAME

Measured (`phase.lua`, order signature per frame, 1,901 build-B frames) and
read out of the listing where the measurement could not see inside an ISR.
**One order dominates and there is no second shape**:

```
ORDER n=305 postvbl>tail>counters>call1>call2>call3>call4>sync
ORDER n=244 ...>call4>[emitter x24]>sync          (same order, sprite emitter
ORDER n=191 ...>call4>[emitter x36]>sync           iterations vary with content)
```

Full cycle, from one sample point (the `$803940` arm) to the next:

| # | what | where | note |
|---|---|---|---|
| 1 | main loop SPINS on `$803940` | `$23C390` | the load meter counts these |
| 2 | **hardware sprite DMA** | `pgm.cpp screen_vblank` | vblank rising edge, `$800000-$8009FF` → IGS023. **Not double-buffered in RAM** |
| 3 | **IRQ6** dispatch | vector `$801478` | |
| 4 | `jsr $23CC4E` | reads `$C08004` (service/coin) → `$803950/52/54` | |
| 5 | **`jsr $23D0F8` - THE INPUT READ** | `lea $C08000,A0` → `$803970` (P1), `$803976` (P2) | runs BEFORE any gate |
| 5b | …inside it: `$23D10C tst.b $803940 / beq $23D11C / jsr $25C60C` | | **a SECOND (A) gate, inside the input read**: on an overrun frame `$25C60C` is skipped, but the mirrors are still stored |
| 6 | `jsr $28C19A` | | |
| 7 | **THE (A) GATE** `$23C44C tst.b $803940 / beq $23C472` | | |
| 8 | …gated: `$24133C` | copies `$80E886` → **palette RAM `$A00000`**, 0x400 bytes | **an overrun frame does not upload the palette** |
| 9 | …gated: `$240CC0` | BG scroll → `$B02000`/`$B03000` | **an overrun frame does not update the scroll registers** |
| 10 | …gated: `$240F26` | walks a `$80B058` pointer/value list, terminator `$FFFFFFFF` | deferred hardware writes |
| 11 | …gated: `$287286` | `$81B4C8` list, 18 entries | |
| 12 | …gated: `$23C46C subq.b #1,$803940` | THE RELEASE | |
| 13 | `jmp $23C158` | ISR tail | |
| 14 | `jsr $23D12A` - **post-vblank** | derives `$803972/74` (P1 edge/prev) and `$803978/7A` from the mirrors | main-loop call #6 |
| 15 | `bra` → `jsr $23BE8C` **counters** | `$80390A++`, `bchg $80390D` bit 0, `$80390E` mod 3 | 293 cyc |
| 16 | `jsr $256D5A` (call 1) | | 218 cyc |
| 17 | **`jsr $2410BC` (call 2) - THE OBJECT DRIVER** | | **77,725 cyc mean** |
| 18 | `jsr $24683E` (call 3) | | 1,734 cyc |
| 19 | **`jsr $23D2AE` (call 4) - THE SPRITE LIST BUILD** | emitters `$23D6B4`/`$23D680` write `$800000-$8004C2` | 15,594 cyc |
| 20 | `jsr $23C212` (call 5) - arm `$803940`, spin | **THE SAMPLE POINT is this arm write** | |

Two consequences for the port that fall straight out of this:

* **Input is read in IRQ6 into raw mirrors; edges are derived in the main loop
  AFTER the vblank wait (`$23D12A`).** So on a frame the loop overran, the raw
  mirrors still advance (the read is before both gates) but the edges are
  derived per LOOP ITERATION. Input lead 0 survives an overrun; edge derivation
  does not run twice.
* **The sprite display list is DMA'd by hardware at vblank from live main RAM.**
  If the loop overruns, vblank arrives while call4 is still rebuilding the list,
  and the hardware snapshots a half-built list. Nothing in software prevents it.

### 3. THE SPRITE-LIST CAP - answered from the listing, and there are TWO paths

The plan asks what the game does as the display list approaches the hardware's
256 entries. The corpus peak is 133/256 and I did not reach the cap by playing
either, so this is the LISTING's answer; a measurement can only prove presence.

The display list is not built directly. Object handlers **enqueue 12-byte
sprite requests** into a queue at `$80397C`, with the running byte offset in
`$80AFC0` (`$23D726`), and main-loop call #4 (`$23D2AE`) turns the queue into
the 10-byte hardware entries at `$800000`.

**Path 1 - the enqueue tells the caller, `$23D726`:**

```
23d726: move.w (A1),D0            ; how many records to append
23d728: beq  $23D758
23d72a: lea $80397C,A2
23d730: adda.w $80AFC0,A2
23d736: move.l (A0)+,(A2)+  x4    ; the 12-byte record
23d73e: addi.w #$c,$80AFC0
23d746: cmpi.w #$bc4,$80AFC0      ; $BC4 = 3012 bytes = 251 records
23d74e: beq  $23D75A              ; ---- QUEUE FULL ----
23d750: subi.w #$c,D0 ; bne $23D736
23d756: move.w D0,(A1) ; rts      ; C clear
23d75a: clr.w (A1)                ; zero the caller's remaining count
23d75c: ori #$1,SR                ; SET CARRY -- "the queue is full"
23d760: rts
```

**Path 2 - the emit clamps regardless, `$23D664`:**

```
23d64e: move.w $80AFC0,D0
23d654: beq  $23D6EE
23d658: lea $80397C,A1
23d65e: cmpi.w #$bc4,D0
23d662: bls  $23D668
23d664: move.w #$bc4,D0           ; CLAMP to 251 records
23d668: move.w D0,D3
   ... emit loop, `subi.w #$c,D0 / bne $23D67A`, walking the queue FORWARD
```

So: **the cap is 251 requests, enforced twice; requests past it are dropped, the
ones enqueued LAST lose, and nothing already queued is evicted.** The
`ori #$1,SR` is a real overflow signal to the caller - whether any caller acts
on it I did not establish (the callers reach it by `bsr`, which the
absolute-long xref cannot see).

Why 251 and not 256: the emitter inserts a fixed filler entry
(`$23D680: move.l #$FC003800,(A0)+ / move.l #0,(A0)+ / move.w #$201,(A0)+`)
every 52 records (`moveq #$33,D4` then `moveq #$32,D4`). 251 + 5 fillers = 256,
which is exactly the IGS023's hardware maximum. The two numbers are designed
against each other.

`$80AFC0..$80AFFB` is 30 words of per-bucket queue counters, cleared every frame
by `$23D712` (`moveq #0,D1 / move.w #$1D,D0 / move.w D1,(A0)+ / dbra`) and summed
at the top of call #4 (`$23D2B4`: 30 `add.w` of `$80AFC0..$80AFFA`).

### 7. THE RANK BYTE - `$80380C`, found in the listing, plus a dead computation

The build-B rank string pointer table `$25C042` has **no absolute-long
reference** (`xref.py abs 25C042` → the table's own 4 entries and nothing else)
and no `lea $25C042,An`. Scanning every `lea (d16,PC),An` in `$200000-$2FFFFF`
for a target inside the table found **exactly one site**:

```
25c22a: lea ($25c042,PC),A0
25c22e: moveq #$0,D0
25c230: move.b $80380C.l,D0      <-- THE RANK BYTE
25c236: add.w D0,D0
25c238: add.w D0,D0              (x4: longword table entries)
25c23a: movea.l (A0,D0.w),A0     -> "RANK: EASY|NORMAL|HARD|VERY HARD"
25c250: nop
25c252: lea ($25c0d2,PC),A0      (the NEXT setting's string table)
25c258: move.b $80380D.l,D0
```

**So the operator rank lives at `$80380C`, one byte, values 0..3**, and
`$80380D` is the setting immediately after it. Both sit in the settings block at
`$803800+` whose first two longwords are the NVRAM boot magic
(`cmpi.l #$36982136,$803800`).

Absolute-long references in build B: **15 to `$80380C`**, of which the
instruction-shaped ones are

```
read   $257044 $258D82 $2595FA $25C230 $2608A0   move.b $80380C,D0
read   $259612                                   move.b $80380C,D1
write  $258F9C  subq.b #1,$80380C   |  $259040  addq.b #1,$80380C
       (the service-menu decrement/increment pair, with $258FA4/$258FAE/
        $259048/$259052 as their bounds constants)
```

and 15 more in build A at the analogous sites (`$1565DA $15831A $158534 …`).
**Only the two service-menu sites write it.** That is an absolute-long result
and therefore a lower bound: a register-relative reader is invisible to it, so
"nothing else writes rank" is NOT what this says.

Two readers matter for gameplay and are worth naming:

```
2608a0: move.b $80380C,D0        ; a per-object handler ($2608xx sits between
2608a6: tst.w $803926            ;  dispatch entries [4] $260B30 and [10] $260794)
2608ac: beq $2608B4
2608b0: move.b #$1,D0            ; $803926 non-zero overrides rank to 1
2608b4: add.w D0,D0
2608b6: lea ($260896,PC),A0      ; -> a word table, -> $813160
2608c4: lea ($260886,PC),A0      ; -> a long table, -> $81315C
```

**and a rank-shaped computation that is DEAD in this build:**

```
2595f2: asr.w #2,D0 ; moveq #0,D1 ; move.w D0,D1 ; moveq #0,D0
2595fa: move.b $80380C,D0       ; the operator rank
259600: subq.w #4,D0
259602: move.w $81309E,D2       ; a RUNTIME value
259608: ext.l D2
25960a: divs.w D1,D2
25960c: add.w D2,D0             ; rank = operator + (runtime / divisor) - 4
25960e: bpl $259612
259610: moveq #$0,D0            ; floor at 0
259612: move.b $80380C,D1
259618: subq.b #1,D1
25961a: cmp.b D1,D0
25961c: bgt $259622
25961e: move.b D1,D0 ; bra $25962A
259622: cmpi.w #$7,D0
259626: ble $25962A
259628: moveq #$7,D0            ; ceiling at 7
25962a: moveq #$4,D0            ; <-- OVERWRITES EVERYTHING ABOVE
25962c: rts
```

`$25962A` is reached only by fall-through from `$259628` and by the `bra` at
`$259620` (I scanned every 6xxx branch in `$200000-$2FFFFF` for a target of
`$25962A`: one hit, `$259620`). **So this routine always returns 4, and the
dynamic-rank arithmetic in front of it cannot affect anything.** That is a
listing result about ONE routine; it is a lead about dynamic rank in VERSION-B,
not a proof that no dynamic rank exists anywhere. I did not run the read tap on
`$80380C` during play, and I did not enumerate `$81309E`'s writers.

### 5. PLAYER FACTS ON VERSION-B - partial

Write tap on `$8103E0-$8104FF` with CURPC attribution, 2,600-frame gate
scenario, build B:

```
W pc=2496E8 n=1118 off=8103E8..8103EA stride=2 perframe=2 frames_active=559
W pc=24D146 n=1122 off=8104AC..8104CC stride=32 perframe=2 frames_active=561
W pc=24D16C n=1122 off=8104AE..8104CE stride=32 perframe=2 frames_active=561
W pc=24C33E n=1010 off=8104AC..8104AE                     frames_active=505
W pc=24C342 n=1010 off=8104CC..8104CE                     frames_active=505
W pc=249E62 n=1122 off=8103F0..8103F2   W pc=249E78 off=8103FA..8103FC
```

So on build B the position store is `$2496E8`, and it is `movem.w D2-D3,($2,A6)`
- **the player is an object record based at `$8103E6`**, position at +2/+4
(`$8103E8` vertical, `$8103EA` horizontal - the RAM addresses the memmap recon
measured on build A, confirmed to be shared). The **two option pods** are
written by `$24D146`/`$24D16C` with a **stride of $20 = 32 bytes**
(`$8104AC`/`$8104CC` and `$8104AE`/`$8104CE`), which is the build-B analogue of
build A's pair.

One clamp is visible immediately above the store:

```
2496d4: cmpi.w #$800,D2
2496d8: bcc  $2496E8
2496da: move.w #$800,D0 ; sub.w D2,D0 ; add.w D0,($30,A6)
2496e4: move.w #$800,D2      ; clamp, and COMPENSATE ($30,A6) by the overshoot
2496e8: movem.w D2-D3,($2,A6)
```

`$800 = 2048 = 32.0 px` in the measured 1/64-px fixed point - and the clamp is
**move-past-then-clamp with a compensating write to another field**, the same
order trap the memmap recon called out on build A.

**NOT done for item 5:** the mover PC (the writer that fires only while the
stick is deflected) was not isolated on build B, the per-button speed table was
not re-measured, the horizontal clamp bounds were not re-measured, TYPE-B was
not exercised, and **the button map (which of B1/B2/B3 is shot / laser / bomb)
was not established.** Wave 4 needs all of those and they are cheap through
`objhunt.lua` with `OBJ_REGS` on `$2496E8`.

### 6. THE HITBOX - BLOCKED, not attempted

I did not write-tap the lives/death state, did not find the player-hit routine,
and did not step a bullet across a pinned ship. Nothing here bears on the
owner's smaller-hitbox claim. The VERSION-A/VERSION-B controlled-experiment idea
in the plan is untouched.

### 8. PROTECTION CROSS-CHECK (`ddpdojp` vs `ddpdojblk`) - BLOCKED, not attempted

Not run. `ddpdojp` needs a different boot script (no version chooser, different
BIOS) and its own landmark derivation - `derive.py`'s build A/B ranges and every
landmark in `landmarks.json` are `ddpdojblk`-specific, and `frame.lua`'s build
assertion would fail on it by construction. That is half a day of harness work
and I spent the time on items 1/2/4 instead, as the plan's hard gate says to.

## What I could not do, and why

1. **I could not reach MAME's per-CPU clock scale.** The intended tool for this
   wave. The slider exists in the binary (`"Overclock CPU %1$s"`) but the Lua
   `device` usertype has no clock member, `manager.ui` has no slider list, there
   is no command-line option and no `<slider>` cfg node. Four places looked, all
   printed in the worklog above. **I could not reach it; here is what I tried.**
   It is a did-not-find, not a does-not-exist: driving the internal UI's slider
   menu through `manager.machine.uiinput` was not attempted.
2. **Injected load is not underclocking.** A NOP sled adds work at ONE point in
   the loop; underclocking would scale every routine and both interrupt handlers
   uniformly. For MECHANISM the two are equivalent (either way the frame's work
   does not fit), and mechanism is all this wave claims. **If someone later
   wants a magnitude, none of these numbers is one.**
3. **(C) is proven absent only at the TOP-LEVEL driver, and only over what this
   corpus reached.** The 20-slot walk at `$2410C4` has no budget test in the
   listing and never truncated in 696 measured overrun frames. But each of the
   20 handlers walks its own sub-tables - the write map shows at least
   `$813660` (24 × $50), `$8145A0` (25 × $20), `$810570` (25 × $30),
   `$81C8FC` (10 × $40), `$80B058` - **and I did not disassemble those loops
   looking for budget tests.** The honest sentence is "the top-level object
   driver does not truncate", never "the game has no (C)". The instrument to
   settle it exists: the same write-tap-plus-CURPC method, one sub-table at a
   time, under the `overrun` scenario.
4. **I did not enumerate everything that reads the frame semaphore.** Build B has
   five absolute-long `tst.b $803940` sites and I named all five, but a
   register-relative read is invisible to that search. A read tap on `$803940`
   with CURPC attribution under the `overrun` scenario would close it and would
   be the strongest available evidence for or against a hidden budget test. Not
   run.
5. **Items 6 and 8 were not attempted at all** (see their sections). Item 5 is
   partial and its missing half - the button map - is a prerequisite for wave 4,
   not wave 5.
6. **The rank result is from the listing.** `$80380C` is the operator rank byte
   and `$2595F2`'s dynamic-rank arithmetic is overwritten by `moveq #$4,D0`. I
   did not put a read tap on `$80380C` during play, did not confirm `$2595F2` is
   even called, and did not find `$81309E`'s writers. No dynamic-rank *candidate
   byte* is offered.
7. **Every digest in the corpus moved** because the dead-stack boundary moved
   from `$81FF00` to `$81FE00`. Wave 1's recorded gate hash
   `13f8ef743e0b3a53…` is therefore stale; the new one is in `NOTES-oracle.md`
   §5 and in this file. That is a deliberate correction, not drift.

## If someone picks this up cold

```
python pgm.py objdriver     the object driver, derived + measured
python pgm.py overrun       the control, then the sweep. START HERE.
python pgm.py gate          the determinism gate (hash changed in wave 2)
python derive.py --show     re-derives every landmark, both builds, with evidence
python xref.py dasm 2410BC 200
```

Five things that will save you the hours they cost me:

1. **On a 16-bit bus a `move.l` write fires a write tap TWICE.** Hooking
   `$2410D6` instead of `$2410D8` reports exactly double the object slots and
   looks completely plausible.
2. **`machine.time.seconds * 1e18` overflows int64 after 10 emulated seconds.**
   Any expression of that shape is wrong for runs longer than ~546 logic frames,
   and it fails silently because differences still wrap correctly. Use
   `seconds * 20000000 + attoseconds // 50000000000` for 68000 cycles.
3. **The stack reaches to `$81FE36`, not `$81FF00`.** If you add a probe that
   perturbs timing at all, `d_ram` will move on dead stack unless the boundary
   is where it now is. There is a guard tap that will tell you if it moves again.
4. **The (A) gate count is `sum(irq6 − rel)`, not `count(rel == 0)`.**
5. **The 2- and 3-vblank divider paths have still never executed**, including
   under a forced overrun. Do not model them from the listing as if they were
   observed behaviour, and do not diagnose an overrun as a divider frame.

**The gate for wave 5 is OPEN.** The object driver is located, its geometry and
allocator are read out of the ROM, `object slots processed` is a compared column
in the standard state vector, the overrun exists as a permanent scenario, and
the phase order is fixed. **Mechanism (C) is measured ABSENT at the top level** -
so `PLAN-vertical-slice.md` §5's instruction stands unchanged: wave 4 still
builds the work budget in, because it costs nothing if it never triggers, and
because item 3 of "what I could not do" means the sub-drivers are unexamined.
