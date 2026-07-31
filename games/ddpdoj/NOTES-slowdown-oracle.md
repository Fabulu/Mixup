# Can an oracle SEE the slowdown? — MAME capability findings

**Status: the answer is YES, and the capability was measured, not inferred.**
Every claim below marked **[MEASURED]** was produced by running a command on this machine;
the command and its output are quoted. Claims marked **[DERIVED]** are arithmetic on
MAME's own machine database. Claims marked **[UNTESTED]** are risks that could not be
settled without the DaiOuJou board image and are named as such.

> **Companion document.** `NOTES-mame-oracle.md` covers MAME's general oracle capabilities.
> This file covers the *slowdown* question specifically, and closes two things that file
> leaves open: **§3a** proves a 68000's `:maincpu` program space is tappable for opcode
> fetches, and **§7b** shows `igs/pgm.cpp` declares its refresh via raw timing
> (`pixclock`/`htotal`/`vtotal` are present in `-listxml`), not a rounded `set_refresh_hz`
> literal — so for `ddpdoj`, unlike the NES driver, MAME's reported refresh *is* a
> derivation and can be trusted.

**No ROM for DoDonPachi DaiOuJou was obtained, searched for, or used.** Everything here was
established with MAME's public binary, MAME's public machine database, the project's own
`Gradius (USA).nes` and `Batman - Return of the Joker (USA, Europe).gb`, and a 32 KB 68000
test program written from scratch for this investigation.

---

## 0. The headline, before the detail

1. **MAME 0.288 satisfies all three oracle criteria of `01-the-oracle-method.md`**, headless,
   unattended, on Windows, with no window and no admin rights. Execution hooks, direct
   memory access, deterministic stepping and a readable framebuffer: all four demonstrated.
2. **Slowdown is directly measurable, two independent ways that agree to 4 CPU cycles.**
3. **MAME's execution is bit-deterministic** across repeats, throttle, frameskip, emulation
   speed, host thread count and debugger-enabled — including the frames that overran.
4. **`ddpdoj` is not Cave hardware.** MAME places it in `igs/pgm.cpp` — the IGS
   PolyGameMaster: **68000 @ 20 MHz + Z80 @ 8.4672 MHz + a fully emulated ARM7 @ 20 MHz.**
   The README's working assumption ("Cave board", "something close to 54 Hz") is wrong on
   both counts.
5. **The refresh rate is exactly `15625/264 Hz = 59.185606060606…`**, and the frame period
   is exactly **16,896.000 µs** — i.e. exactly **337,920 68000 cycles per frame**. Derived
   from the driver's own raw video timing, per `07-clocks-and-framerates.md`.
6. **The one thing that must be planned for:** the ARM7 is not a protection stub — it is a
   second programmable CPU that MAME emulates. Any (B) time-dilation model for this game is
   a model of *two* CPUs' workloads plus MAME's scheduler interleave, not one.

---

## 1. Setup — reproducible from nothing

```
$ curl -L -o mame0288b_x64.exe \
    https://github.com/mamedev/mame/releases/download/mame0288/mame0288b_x64.exe
$ sha256sum mame0288b_x64.exe
e4ae20a2359d716fb16824961b1b0fb28d8662ffd1298504edff39d368bb4a55 *mame0288b_x64.exe
   ... matches the official SHA256SUMS line for mame0288b_x64.exe
$ "/c/Program Files/7-Zip/7z.exe" x -y -omame mame0288b_x64.exe     # no installer, no admin
$ ./mame.exe -version
0.288 (mame0288)
```

**The unattended invocation** — this is the equivalent of Mesen's `--testRunner`, and unlike
Mesen it is documented:

```
mame.exe nes -cart "Gradius (USA).nes" \
  -video none -sound none -nothrottle -skip_gameinfo \
  -autoboot_delay 0 -autoboot_script probe.lua -seconds_to_run 30
```

**[MEASURED] No window is created.** While a run was in flight:

```
$ Get-Process mame | ForEach-Object { 'pid='+$_.Id+' MainWindowHandle='+$_.MainWindowHandle+' Title=['+$_.MainWindowTitle+']' }
pid=12620 MainWindowHandle=0 Title=[]
```

and the same with the debugger enabled (`-debug -debugger none`):

```
DEBUG MODE: pid=36440 MainWindowHandle=0 Title=[]
```

`MainWindowHandle=0` means the process owns no top-level window. **`-debugger none` is the
piece that matters** — `-debug` alone would open the Windows debugger UI. This is MAME's
answer to the Mesen GUI problem, and it is a supported documented option
(`-debugger  debugger used: windows, imgui, gdbstub or none`), not an undocumented mode.

Every run in this document exited with rc=0 from a non-interactive shell.

---

## 2. Question 1 — per-frame CPU work

### 2a. Cycles, exactly **[MEASURED]**

The debugger's expression symbols are reachable from Lua when MAME runs with
`-debug -debugger none`. `manager.machine.debugger:command("print totalcycles")` writes to
`debugger.consolelog`, whose last entry is the value in hex:

```lua
local function cycles()
  DBG:command("print totalcycles")
  local cl = DBG.consolelog
  return tonumber(cl[#cl], 16)
end
```

Symbols confirmed present by evaluating each one: `cycles`, `totalcycles`,
`lastinstructioncycles`, `frame`, `beamx`, `beamy`, `pc`, `cpunum`, `logunmap`.
(`beamh` / `beamv` do not exist — the console answered `unknown symbol`.)

Without `-debug`, `manager.machine.debugger` is `nil` and `cpu.debug` does not exist —
**so cycle symbols require the debugger, and the debugger requires `-debugger none` to stay
headless.** That is the whole trick.

Sampled at the NES NMI entry and exit, for Gradius:

```
gframe  cycles/logic-frame
   1       45448
   2        7146
   3        6068
 ...
 min 4105   max 45448   mean 23718     budget 29780.5
```

The budget is `1,789,772.727 Hz ÷ 60.0988 Hz = 29,780.5` CPU cycles per frame. So MAME gives
literally *"this frame the CPU used N cycles of a budget of M"*.

### 2b. Elapsed emulated time, without the debugger **[MEASURED]**

`manager.machine.time` is an attotime and is readable **inside a memory-tap callback**, so
the time of any bus access is available to attosecond precision with no debugger at all.
Cross-checking the two measures over 2,392 logic frames of Gradius:

```
cycles vs (elapsed_time × 1.7897727 MHz):  mean err 3.99 cyc,  max |err| 4.00 cyc
```

A **constant** 4-cycle bias, zero variance — the two methods are the same measurement,
offset by where in the instruction the tap fires. Either can be used; the cycle counter is
exact, the time route is dependency-free.

### 2c. It works on a 68000 too **[MEASURED]**

On MAME's `megadriv` driver running a 32 KB 68000 program written for this test:

```
vframe 2: cycles this frame = 152922
vframe 3: cycles this frame = 152922
vframe 4: cycles this frame = 152926
```

7.6 MHz ÷ 49.7015 Hz PAL ≈ 152,922. Cycle accounting is generic MAME machinery, not a
6502 special case.

---

## 3. Question 2 — did the game finish its frame?

### 3a. Execution hooks exist, and they are *memory taps* **[MEASURED]**

This was the biggest open risk and it is resolved. `address_space:install_read_tap(lo, hi,
name, cb)` **fires on opcode fetches**, so a read tap on a code address is an execution hook
— PyBoy's `hook_register` equivalent, without the debugger.

Proof on the 6502, hooking Gradius's NMI entry `$806A` and the `$04` lock byte:

```
RESULT frames=600 reads@0x806A=595 writes@0x0004=1786
```

595 NMI dispatches in 600 frames (the first ~5 predate NMI enable), and 1,786 writes to
`$04` = 3 per NMI — which is exactly right: `INC $04` is a read-modify-write and the 6502
emits a dummy write plus the real write, plus the `STA $04` that clears it. 595×3 = 1,785,
plus one at init. The tap is seeing the real bus, not an approximation.

Proof on the 68000, on our own test program (`nop / nop / nop / bra.s`):

```
program space: width=16 mask=FFFFFF endian=big
range $200-20F read-tap hits over 60 frames: 2085306
   off=000200 data=4E71 PC=000000 CURPC=000000
   off=000202 data=4E71 PC=000202 CURPC=000000
   off=000204 data=4E71 PC=000204 CURPC=000200
   off=000206 data=60F8 PC=000206 CURPC=000202
   off=000208 data=0000 PC=000208 CURPC=000204
```

`4E71` is `NOP`, `60F8` is `BRA.S -8`. Correct data, correct addresses.

> **Trap, recorded now so it is not discovered later:** on the 68000 the tap fires on the
> **prefetch**, and `PC` leads `CURPC` by roughly one instruction. `off=000208` is fetched
> although nothing at `$208` ever executes. On a 68000 target, a read tap at address X is
> "X entered the prefetch queue", **not** "X executed". Compare `CURPC`, or hook the address
> after the branch, or accept a one-to-two instruction lead and calibrate it once.

The `:maincpu` on both megadriv and the NES exposes only a `program` space (plus
`cpu_space` on the 68000) — there is no separate `AS_OPCODES` space that fetches could hide
in.

### 3b. CPU registers are readable *at* the hook **[MEASURED]**

Hooking `$8087` in Gradius, which is `STY $4014` (the OAM DMA trigger, preceded by
`LDY #$02`):

```
gframe=1 A=00 X=00 Y=02 SP=1F8 P=74 PC=8087 CURPC=8087 GENPC=8085 IR=A0
```

`Y=02` — the shadow-OAM page, exactly as the ROM notes predict. `IR=A0` is the `LDY #`
opcode and `GENPC=8085` is that instruction's start. This is the capability that makes the
(C) detector possible: **the object slot index normally lives in a register at the top of
the object loop, and we can read it there.**

### 3c. A game-agnostic interrupt hook **[MEASURED]**

You do not need to know the game's code to hook its vblank interrupt. Tap the CPU's
**vector fetch**.

NES (`$FFFA`, the NMI vector):

```
600 frames: NMI vector byte-reads=1190 IRQ vector byte-reads=0
per-frame NMI vector fetches: 0 on 5 frames, 1 on 595 frames
```

68000, on our own test program with the level-6 autovector at `$78` and a VDP vblank IRQ
enabled:

```
cpu_space present, tap installed
600 frames: vector@$78 reads=600  handler@$300 fetches=600  cpu_space reads=600
```

Exactly one per frame on all three counters. **`cpu_space` is the 68000's interrupt-
acknowledge space**, so a tap on it is a hook on *every interrupt dispatch* with no
knowledge of the game whatsoever. That is the generic half of question 2.

### 3d. The other half: a main-loop landmark, and the ordering **[MEASURED]**

The ordering comparison the brief asks for works, and it produced a real result on Gradius.
The full signal set of `06-lag-and-slowdown.md` was implemented (`sig.lua`) and run for
2,400 video frames with a scripted input:

```
video frames = 2400, logic frames = 2392
cycles/logic-frame: min=4105 max=45448 mean=23718  budget=29780.5

logic frames exceeding the per-frame cycle budget: 5
   gframe=1    ventry=3    vexit=4    cycles=45448  work_us=25390.944  nslot=1   lock=0 done=1
   gframe=321  ventry=324  vexit=325  cycles=32615  work_us=18220.757  nslot=32  lock=0 done=1
   gframe=633  ventry=637  vexit=638  cycles=33771  work_us=18866.649  nslot=32  lock=0 done=1
   gframe=1089 ventry=1094 vexit=1095 cycles=33171  work_us=18531.411  nslot=32  lock=0 done=1
   gframe=1929 ventry=1935 vexit=1936 cycles=34655  work_us=19360.567  nslot=32  lock=0 done=1

video frames with NO logic frame completed: 8 -> [1, 2, 3, 4, 325, 638, 1095, 1936]
video frames with >1 logic frame: 0
```

Read that table twice. **Every mid-run over-budget logic frame has `vexit = ventry + 1`, and
its `vexit` video frame is exactly a video frame on which no logic frame completed.** Four
overruns, four lost logic frames, one-to-one, at frames 325 / 638 / 1095 / 1936. Frames 1–4
are boot, before the NMI is enabled.

Simultaneously: `lock` (the `$04` re-entrancy byte read at `$8073`) was **never** non-zero,
and `oam`, `ppumask`, `input` and `done` were **exactly 1 on every one of the 2,392 logic
frames**. So on this run Gradius never took the `$8075` bail and never partially executed
its NMI. What it did was run its logic 2,392 times in 2,400 video frames.

That is a textbook **(B) time-dilation** signature at whole-frame granularity, measured
end to end by an oracle that did not know in advance what it would find. Whether it is the
*only* thing Gradius does under heavier load is the Gradius workflow's question, not this
one — but the instrument that would answer it now exists and is proven.

> **Bucketing trap, measured.** The first version of this harness bucketed by *emulator*
> frame and reported 3 spurious "the NMI did not finish" frames — which were simply NMIs
> whose entry and tail straddled MAME's frame boundary. `01-the-oracle-method.md` says
> "sample at a stable point in the game's own loop"; this is that rule producing a false
> positive within an hour of ignoring it. **Bucket by the game's own frame** (`$806A` →
> `$80B7`), keep the emulator frame as a separate column, and the disagreement between the
> two columns *is* the measurement.

---

## 4. Question 3 — frame-rate observation without knowing the game's code

Two game-agnostic signals, both measured:

| signal | how | result on the 2,400-frame Gradius run |
|---|---|---|
| logic frames per video frame | count interrupt-vector fetches / handler completions per video frame | 8 video frames with 0, none with 2 |
| identical framebuffer twice | hash `screen:pixels()` each video frame | 518 duplicates |

`screen:pixels()` returns the real framebuffer even under `-video none` — dumped to PPM and
inspected, it shows the Gradius title screen at frame 250 and the Vic Viper in Stage 1 with
enemies on screen at frames 400 / 700 / 1100. **The framebuffer criterion is satisfied.**

**But the duplicate-frame detector on its own is not a slowdown detector, and this run
proves it in both directions:**

- 518 duplicates against 4 real lost logic frames — the title screen and quiet stretches
  repeat pixels while the logic is running perfectly. Enormous false-positive rate.
- Of the 4 real events, only 2 (frames 325 and 638) also produced an identical framebuffer.
  On 1095 and 1936 the background was still scrolling, so the picture changed even though
  the game logic had not advanced. **False negatives too.**

So: **use the framebuffer hash as a corroborating field, never as the detector.** The
detector is the count of completed game-loop iterations per video frame. This is exactly the
`videoFrame` / `logicFrame` separation demanded by `07-clocks-and-framerates.md`, and MAME
supplies both cleanly.

---

## 5. Question 4 — determinism

**[MEASURED] Bit-identical output across eight configurations**, including the overrun
frames, from the same 1,200-frame scripted Gradius scenario:

```
562e2bca4fa4a9e3ce38312813587d9cb82f034b312df2e7e902f58fdaebd947 *run  (repeat 1)
562e2bca4fa4a9e3ce38312813587d9cb82f034b312df2e7e902f58fdaebd947 *run  (repeat 2)
562e2bca4fa4a9e3ce38312813587d9cb82f034b312df2e7e902f58fdaebd947 *run  (repeat 3)
562e2bca4fa4a9e3ce38312813587d9cb82f034b312df2e7e902f58fdaebd947 *base       -nothrottle
562e2bca4fa4a9e3ce38312813587d9cb82f034b312df2e7e902f58fdaebd947 *throttle   -throttle
562e2bca4fa4a9e3ce38312813587d9cb82f034b312df2e7e902f58fdaebd947 *fskip8     -frameskip 8
562e2bca4fa4a9e3ce38312813587d9cb82f034b312df2e7e902f58fdaebd947 *speed5     -speed 5.0
```

plus host thread count:

```
931004a0231dfc8d7c8ebd430a38e68ca80da7a75500444cd9a722ae418686ce *np1.gframe.tsv   -numprocessors 1
931004a0231dfc8d7c8ebd430a38e68ca80da7a75500444cd9a722ae418686ce *np8.gframe.tsv   -numprocessors 8
```

**And the instrumentation does not perturb the emulation** — two decisive checks:

- 68000, 300 frames, with and without a read tap that fired **10,426,553 times**:
  `totalcycles=45876854` in both runs. Identical to the cycle.
- Gradius, 2,400 frames, with `-debug -debugger none` and without: every non-cycle column
  of both output files identical, video-frame file identical.

Wall-clock cost of a tap: 10.4 M callbacks cost 2.3 s, ≈ **220 ns per callback**; emulation
speed fell from 439 % to 167 % of real time and stayed above real time. A per-object-slot
tap firing ~10 k times a frame is ~2 ms/s of overhead. **Instrumentation density is not a
constraint.**

> This answers the brief's "we need to know NOW": **frame-exact verification of slowdown is
> possible.** MAME's execution is not merely repeatable, it is invariant to every host-side
> knob tested. What remains untested for DaiOuJou specifically is §8.

---

## 6. Question 5 — the (C) detector, and it is more than a sketch

`06-lag-and-slowdown.md` calls "object slots processed: 0..N" the field most likely to be
missing from inherited tooling and the one that decides whether slowdown can be retrofitted.
**It is buildable on MAME today**, and the primitives were all exercised on Gradius.

### The mechanism

```lua
-- 1. bound the frame with the game's own landmarks, not the emulator's
hook(NMI_ENTRY, function() slots = {}; seen = {}; c0 = cycles() end)
hook(NMI_TAIL,  function() emit(gframe, #slots, slots, cycles() - c0) end)

-- 2. one execution hook at the TOP OF THE OBJECT LOOP BODY, reading the slot index
--    out of the register that holds it. This is the (C) detector itself.
PRG:install_read_tap(OBJ_LOOP_BODY, OBJ_LOOP_BODY, "slot", function()
  local slot = CPU.state["D1"].value & 0x3F        -- 68000: whatever register indexes it
  slots[#slots+1] = slot                            -- ORDER is semantics, not just count
end)
```

`#slots` per game-frame is the answer to "how many object slots did the scheduler get
through this frame". If it is the object limit every frame, the game is not doing (C). If it
varies with load, it is, and the port needs a budget and an early exit **in its first
commit**.

### Finding the loop without a disassembly

You do not have to know `OBJ_LOOP_BODY` in advance. Put a **write** tap over the suspected
object arrays and record `CURPC` at every write — MAME then tells you which code writes the
table. Run against Gradius, over 1,200 frames, tapping `$0300-$037F`:

```
--- writers into $0300-$037F: CURPC -> count, offset range ---
B168  n=2336    off=$0370..$0375
B0F1  n=1000    off=$0370..$0375
B180  n=500     off=$0330..$0335
9B4C  n=256     off=$0300..$037F     <- walks the whole table: the clear/init routine
802C  n=128     off=$0300..$037F
831F  n=128     off=$0300..$037F
82A3  n=109     off=$0360..$0360
82B0  n=109     off=$0320..$0320
A2BA  n=72      off=$0321..$0322
A2B4  n=72      off=$0361..$0362
...
```

That is the object system's code map, produced by measurement in one run. The offset
clustering at `$0320`, `$0330`, `$0360`, `$0370` is consistent with the parallel-array
layout that `games/gradius/NOTES-lag.md` lists as an *unverified* third-party lead — and
this is how to verify it properly, rather than repeating it.

### What this run did and did not show

A slot tracer on `$0320-$033F` was carried in the state vector for the 2,400-frame run:

```
object-slot touch counts per logic frame:
  0 -> 1320 frames, 1 -> 297, 2 -> 291, 3 -> 190, 4 -> 80,
  5 -> 68, 6 -> 37, 7 -> 69, 8 -> 25, 9 -> 10, 32 -> 5
```

The 5 frames with 32 are the full-table walk from `$9B4C`, and they are **the same 5 frames
that blew the cycle budget** — a stage/wave initialisation, not a per-frame object loop.
So this particular range is *not* the per-frame object update, and the `$0320 = object Y`
lead is not confirmed by it. **Reported as a negative result rather than dressed up**: the
detector mechanism is proven, the Gradius address it should be pointed at is not yet known,
and finding it is `NOTES-lag.md`'s job.

### Why this matters more on the real target

On PGM the object loop is 68000 code and the slot index will be in a data or address
register — readable at the hook, as §3b proved on the 6502 and §3c proved the 68000 side of.
The prefetch caveat of §3a applies: place the hook on an instruction that is unambiguously
inside the loop body and validate the count against a known-idle frame first.

---

## 7. The machine, and the number nobody has written down yet

All ROM-free, from MAME's own database (`mame.exe -listxml ddpdoj ddpdojblk ddpdojt ddpdfk`).

**[MEASURED]**

```
=== ddpdoj  sourcefile=igs/pgm.cpp
   desc: DoDonPachi Dai-Ou-Jou (Japan, 2002.04.05.Master Ver, 68k Label V101)
   year 2002 | mfr Cave (AMI license) | romof: ddp3
   chip cpu   tag=maincpu   name=Motorola MC68000            clock=20000000
   chip cpu   tag=soundcpu  name=Zilog Z80                   clock=8467200
   chip cpu   tag=prot      name=ARM7 (little)               clock=20000000
   chip audio tag=ics       name=ICS2115 WaveFront Synth     clock=33868800
   display: rotate=270 width=448 height=224 refresh=59.185606
            pixclock=10000000 htotal=640 hbend=0 hbstart=448
                              vtotal=264 vbend=0 vbstart=224
   driver: status=imperfect emulation=good savestate=supported
   feature: sound=imperfect
```

`ddpdojblk` (Black Label) is identical hardware. For contrast:

```
=== ddpdfk  sourcefile=cave/cv1k.cpp     (DoDonPachi Dai-Fukkatsu, 2008 — the actual Cave CV1000)
   chip cpu Hitachi SH7709S clock=102400000
   display: refresh=60.024000        <- no pixclock/htotal/vtotal: a declared rate, not a derived one
   driver: savestate=UNSUPPORTED     feature: TIMING=IMPERFECT

=== ddpdojt  sourcefile=igs/pgm2.cpp     (Dai-Ou-Jou Tamashii, 2010, PGM2)
   chip cpu IGS036 clock=100000000
   display: refresh=59.080000        <- also a declared rate
   driver: status=good  savestate=supported
```

### 7a. Three corrections to `games/ddpdoj/README.md`

1. **"Which MAME driver, which CPU, which board revision" — answered.** `ddpdoj` in
   `igs/pgm.cpp`, IGS PolyGameMaster. Cave developed the game; IGS built the board. The
   README's framing of "Cave hardware" is not right for *this* title.
2. **"One estimate in conversation was 'something close to 54'" — that estimate is wrong**
   by more than five hertz, and §7b gives the exact figure with its derivation. This is
   precisely the kind of number `07-clocks-and-framerates.md` warns would have poisoned the
   whole slowdown effort.
3. **`ddpdoj` is a *better* oracle target than any Cave-board DoDonPachi.** MAME rates its
   emulation `good`, supports save states, and flags only *sound* as imperfect. The CV1000
   title `ddpdfk` has `savestate=unsupported` **and** an explicit `timing: imperfect` flag —
   a timing-imperfect driver is close to disqualifying for a project whose whole subject is
   timing. If the game is ever swapped for "a Cave shooter", check this field first.

### 7b. The refresh rate, derived **[DERIVED]**

The driver declares raw video timing, so `07-clocks-and-framerates.md`'s rule applies
directly:

```
refresh = pixel_clock / (htotal × vtotal)
        = 10,000,000 / (640 × 264)
        = 10,000,000 / 168,960
        = 15625 / 264 Hz                       (exact rational)
        = 59.185606060606… Hz
```

MAME's own `refresh="59.185606"` attribute agrees. And because the clocks are commensurate,
the derived budgets are **exact integers**, which is unusually convenient:

| quantity | exact value |
|---|---|
| frame period | **16,896.000 µs** exactly |
| 68000 cycles per frame | **337,920** exactly (20 MHz ÷ 15625/264) |
| ARM7 cycles per frame | **337,920** exactly |
| Z80 cycles per frame | 89,413,632 / 625 = 143,060.851 (not integer) |

**Write `15625/264`, or `59.185606060606`, into the manifest — never `59.19`, never `54`.**

For contrast, a caution measured on the NES driver: `screen.refresh` reported
**60.0988000000** — MAME's `nes` driver declares a *rounded* literal, not the exact
60.098813897 that `07-clocks-and-framerates.md` derives. The error is 1.4 × 10⁻⁵ Hz and
harmless, but the lesson generalises: **`screen.refresh` returns whatever the driver
declared.** Trust it only when `-listxml` also reports `pixclock`/`htotal`/`vtotal`, which
proves the driver used raw timing. For `ddpdoj` it does. For `ddpdfk` and `ddpdojt` it does
**not**, and their refresh figures are declared constants of unknown provenance.

---

## 8. What is NOT proven — the honest list

Ordered by how much damage each could do.

1. **[UNTESTED] The ARM7 changes the shape of the problem.** `prot` is a real ARM7 that MAME
   executes; on PGM it runs game logic, not just a challenge/response. A (B) model for this
   game must account for 68000 work, ARM7 work, and how the two rendezvous. None of that can
   be probed without the board image — but the *instrument* for probing it is identical
   (`machine.devices[":prot"].spaces["program"]` taps, its own `totalcycles`), and MAME will
   happily give per-device cycle counts for all three CPUs.
2. **[UNTESTED] DRC.** MAME's ARM7 core has a dynamic recompiler; `-drc`/`-nodrc` exists.
   Whether cycle accounting and determinism hold identically under DRC was not testable here
   (neither the 6502 nor the Musashi 68000 uses one). **First experiment on day one with the
   board image: run the same scenario with `-drc` and `-nodrc` and diff.** If they differ,
   pin `-nodrc` in the harness and say so.
3. **[UNTESTED] Multi-CPU scheduler quantum.** With three CPUs the interleave granularity
   affects when each CPU sees the other's writes. MAME sets this per driver
   (`set_perfect_quantum` / `set_quantum_time`); there is no command-line override, so it is
   at least *fixed*, and every determinism test here passed — but they were on a
   single-CPU-driven workload. Verify on the real machine before trusting cross-CPU ordering.
4. **[MEASURED, with a caveat] Save states.** `machine:buffer_save()` produced a 2,257,358-byte
   buffer and `machine:buffer_load()` restored RAM **exactly** — a hash over `$0000-$07FF`
   matched the saved value on the very next read:
   ```
   vf=500 ramsum=2783029931 buflen=2257358
   vf=520 before load ramsum=2200882372
   vf=520 immediately after buffer_load ramsum=2783029931 (target 2783029931) match=true
   ```
   **But a replay from that state did not reproduce the original trace** (first mismatch at
   step 1 of 60). The restore is exact; resuming *deterministically* from a mid-run load is
   not yet solved — most likely input/frame-boundary alignment in the harness rather than
   MAME. `ddpdoj` advertises `savestate=supported`, so this is worth an hour to get right,
   because it is what makes per-level scenario setup cheap. **Do not build the corpus on
   save-state resume until this is nailed down.**
5. **[UNTESTED] Whether DaiOuJou's own logic observes the slowdown** — the README calls this
   the single most important question in the folder and it remains completely open. It is
   answerable the moment there is a board image: hook the RNG's step site and the main
   counter increments, and check whether they advance per loop iteration or per interrupt.
   Nothing about MAME blocks it.
6. **[UNTESTED] MAME's absolute timing fidelity for PGM.** MAME rates `ddpdoj` emulation
   `good` with no timing caveat, which is the best signal available short of a board. But
   "MAME is accurate enough that its slowdown pattern *is* the hardware's" is an assumption,
   not a measurement, and this project does not have hardware to check it against. Say it
   out loud in the definition of done. The Gradius cross-check (same ROM under Mesen and
   MAME, per the README) is the cheapest available proxy and should be done.

**Nothing on this list is a "MAME cannot do this".** The capability question — the one this
folder exists to answer — came back clean.

---

## 9. Recommendation

- **The oracle method applies to `ddpdoj`.** Proceed on that basis. MAME 0.288 + Lua meets
  every criterion in `01-the-oracle-method.md`, headless and deterministic on Windows.
- **Put `15625/264 Hz` in the manifest** and delete "close to 54" from the README.
- **Correct the README's hardware description**: IGS PolyGameMaster, 68000 + Z80 + ARM7.
  The ARM7 is a first-class part of the port's problem and should be named in the plan.
- **Build the state vector with `videoFrame` and `logicFrame` as separate compared fields
  from the very first probe**, plus the per-frame cycle count. All three are free now.
- **Carry the slot-order field from the start**, even before there is an object driver — it
  is `06-lag-and-slowdown.md`'s explicit instruction and §6 shows it costs nothing.
- **Do not use the duplicate-framebuffer hash as a slowdown detector.** §4 measured both its
  false-positive and false-negative rate on a real game.
- **Day-one experiments once a board image exists**, in this order: `-drc` vs `-nodrc` diff;
  per-CPU cycle census for `maincpu` and `prot`; RNG/counter step-site hook to settle
  README question 5; save-state replay determinism.

---

## Appendix — probe scripts

The Lua probes used here are in `games/ddpdoj/probes/`. They are our own code and contain no
ROM-derived data beyond Gradius landmark addresses already recorded in
`games/gradius/NOTES-rom.md`. `mk68ktest.py` generates the 32 KB 68000 test program used for
the 68000 capability proofs — also entirely our own code, and the binary is deliberately not
checked in.

| file | proves |
|---|---|
| `probe_api.lua` | the MAME Lua API surface actually present in 0.288 |
| `probe_debugger.lua` | debugger reachable headless; which expression symbols exist |
| `probe_tap.lua` | read taps fire on opcode fetches (6502) |
| `probe_m68k.lua` | read taps fire on 68000 fetches; prefetch lead; `cpu_space` |
| `probe_vectors.lua` | game-agnostic interrupt hook via vector fetch |
| `probe_registers.lua` | CPU registers readable at a hook; writer attribution by `CURPC` |
| `probe_cycles.lua` | `totalcycles` per game frame; agreement with elapsed emulated time |
| `probe_state.lua` | `buffer_save` / `buffer_load` |
| `signals.lua` | the full per-frame signal set of `06-lag-and-slowdown.md` |
| `mk68ktest.py` | generates the 68000 test program |
