# RECON - MiSTer PGM core: timing, CPU budget and slowdown

status: IN PROGRESS

Recon 1 of 2 on the MiSTer FPGA PGM core (`MiSTer-devel/Arcade-IGSPGM_MiSTer`,
cloned OUTSIDE this repo at `C:\programmieren\pgm-mister`). Recon 2 covers the
sprite/video pipeline in `77-*`. This file covers **timing, CPU budget and
slowdown** only.

**LICENCE.** The core is GPL. Mixup is MIT. **Nothing has been copied,
transliterated or paraphrased from it into this repo.** What follows are FACTS
about 1997 IGS PolyGame Master hardware - cycle counts, bus schedules, register
semantics, measured throughput numbers - restated in our own words against our
own addresses, with the core cited as *a source consulted*, by file and module
name. See the LICENCE NOTE at the bottom.

---

## 0. THE PREMISE CHECK - is the core cycle-accurate?

**Yes, for the CPU/video bus, and it is better evidence than an FPGA core
normally is - because it is not primarily an FPGA core's opinion. It is a
logic-analyser capture of a real PGM board.**

The repository contains a *hardware measurement programme*, not just RTL:

| what | where (their repo) |
|---|---|
| a 68000 test ROM that benchmarks VRAM access shapes in IRQ6-framed windows | `testroms/pages/vram_bench.c` |
| a second test ROM that stresses program-fetch under sprite load | `testroms/pages/sdr_stress.c` |
| a host driver that runs it over a debug link and records JSONL | `util/vram_bench/run.py`, `util/sdr_stress/run.py` |
| **raw results from a REAL BOARD** | `util/vram_bench/results/hw_*.jsonl`, `util/sdr_stress/results/sdr_hw.jsonl` |
| **logic-analyser findings, dated, with capture setup** | `util/vram_bench/results/LA_FINDINGS.md` |
| custom hardware to do the capture (pass-through PCB, Pico programmer) | `hardware/PGMPassThru`, `hardware/PGMPicoProg` |

`LA_FINDINGS.md` documents a DSLogic U3Pro32 at 250 MHz probing CPU
AS#/RW/DTACK#/CLK, VRAM WR#/OE#/CE#, four VRAM address nibbles and SYNC# on a
running board, over five successive decoding sessions in which they *retracted
three of their own models* as artifacts before arriving at the current one.

So the answer to "is this a functional reimplementation dressed up as a core" is
no. **But the accuracy is not uniform**, and §6 lists exactly where it is not.

**The one caveat that matters for us:** this is cycle accuracy of the *bus*, not
of the *game*. The core does not tell us what DoDonPachi DaiOuJou does with its
cycles. It tells us, to a measured ±1%, **how many cycles the board gives it.**

---

## 1. CLOCKS - and they confirm our numbers

### 1.1 What the core implements

The IGS023 video chip runs its own position counters, and they are the timing
authority for everything else:

- pixel-slot rate **10 MHz exactly** (100 ns per slot)
- **640 slots per line** → line period **64.000 µs**, line rate **15.625 kHz**
- **264 lines per frame** (counter wraps 263 → 0)
- visible region 448 × 224 (the last 448 slots of each line, the last 224 lines)
- frame period **264 × 64 µs = 16.896 ms** → **59.185606060606… Hz**
- 68000 at **20 MHz** → **337,920 cycles per frame**, and exactly **2 CPU cycles
  per pixel slot**

Source consulted: `rtl/igs023.sv` (module `IGS023`, its hcnt/vcnt counters and
pixel clock-enable divider), `rtl/video_timing.sv`.

**Every one of these agrees with `docs/knowledge/07-clocks-and-framerates.md`
and HANDOVER.** 15625/264 = 59.185606…, 337,920 cycles/frame. Independently
derived, from a different implementation, from the hardware side rather than
from MAME's driver source. That is exactly the cross-check
`06-lag-and-slowdown.md` rule 4 asks for, and our number survives it.

*(Note: `rtl/video_timing.sv` uses a 262-line raster. That is the MiSTer
**display output** path after resync, not the board. The board's counter is the
one in `igs023.sv`, and it is 264.)*

### 1.2 What their HARDWARE measurement says

Two independent hardware confirmations of the same figures:

- `LA_FINDINGS.md`: **"CPU_CLK = 20.0 MHz exactly; SYNC# line period = 64.000 µs
  = 1280 CPU cycles."** Directly probed. 1280 × 264 = 337,920.
- `util/vram_bench/results/hw_full.jsonl` header: the board's own SCANLINE
  register (our `$B07000`) was calibrated on hardware and read
  **min 0, max 263** - i.e. **264 lines, measured on the board**, not inferred.
  The same calibration records the register reading **224 at IRQ6**, which
  places the vblank interrupt exactly at the end of the 224 visible lines.

### 1.3 The one place the board disagrees with the ideal

Their commentary on `rtl/PGM.sv` records an LA measurement that the 68000 runs
from **its own 20 MHz crystal, about +5 ppm off the video crystal**: measured
**337,921.7 CPU cycles per video frame** against the locked 337,920.0. The
CPU-to-video phase therefore slips ~85 ns per frame and sweeps every timing
knife-edge through all alignments over a few seconds.

**Consequence for us: none, and knowing that is worth something.** 5 ppm is
1.7 cycles in 337,920. It matters to *them* because it turns knife-edge bus
arbitration outcomes into per-frame statistical variation on real hardware (see
§2.4). It does not move our frame rate. Our 337,920 stands.

---

## 2. WHAT STALLS THE 68000 - the enumeration

This is the heart of the brief. Below, **HW** = attested by their hardware
measurement, **RTL** = implemented in the core, **FPGA-ONLY** = an artifact of
being an FPGA and explicitly not hardware.

### 2.1 IGS023 VRAM arbitration - THE stall source (HW, RTL)

**The only large, genuine CPU stall on a PGM board is 68000 access to the
IGS023's tilemap VRAM.** In our address space that is **`$900000`–`$907FFF`**:
the BG tilemap, the FG tilemap and the rowscroll table.

The IGS023 owns a single VRAM address bus and time-slices it between three
consumers - its FG tile fetcher, its BG tile fetcher, and the CPU. It is, in
their decoded description, an **address-bus multiplexer running a fixed
positional schedule**; a CPU access is a mux slot granted to the CPU. Per active
line, the schedule is:

1. **FG line-buffer fetch - CPU LOCKED OUT.** ~13.4 µs, a linear crawl at
   ~30 ns per access (the 33.8688 MHz master clock), building the 8×8 FG line
   buffer during hblank.
2. **BG head-start - CPU STILL LOCKED OUT.** A further ~4.4 µs of pixel-rate BG
   prefetch. **Its length shrinks by one 100 ns slot per pixel of BG scroll
   alignment within the 32 px tile** - measured law: the lock ends at
   **11.8 µs − 100 ns × (bg_x mod 32) after SYNC#**, single-bin sharp,
   deterministic.
3. **Steady state - CPU gets HALF the slots.** An 800 ns microcycle of eight
   100 ns slots: the first four are the BG fetcher's byte scan, the last four
   are the **CPU window**. Every slot carries a bus event - BG fills whatever
   the CPU does not take - so the window is a *preemption right*, not exclusive
   occupancy. The trailing edge is soft: a new request pending at the microcycle
   boundary wins slot 0 as well (~90% of chunk re-entries on hardware).
4. **Vblank lines - CPU FREE.** No schedule at all.

Total lock ("the hole") is **~17.8 µs of every 64 µs active line** - 28% of the
line in which a VRAM access simply cannot complete, plus a 50%-of-slots ceiling
for the remaining 46 µs. There are **224 fetched lines and 40 free vblank
lines** per frame.

Behaviours worth recording because they are non-obvious:

- **A read and a write cost the same.** The 68000 asserts its data strobes a
  clock later on writes, but the 023 starts its cycle from AS# + address, so
  writes are not penalised.
- **A byte access costs the same as a word.** Both halves of the pair always
  cycle.
- **There is no read↔write turnaround penalty.** They fitted a "decaying R/W
  turnaround" model to two data points, then killed it with a second capture:
  alternating read/write pairs stream at a flat 1600 ns between holes.
- **Back-to-back accesses partially escape the pacing.** A scattered access pays
  a full 800 ns slot; a `movem` stream gets ~540–650 ns per word.
- **A write dispatched in the tail of the window straggles**: its odd byte slips
  to the last slot of the following BG half (a redundant BG re-read slot the BG
  donates), stalling the CPU an extra grant period. This is the *entire*
  read-vs-write throughput asymmetry on free-running loops, ~250 words/frame.
- **The access held through the hole commits at the hole's end**, ahead of the
  BG's first half-cycle; its follower waits for the next window.

### 2.2 How big is it? MEASURED, on the board

`util/vram_bench/results/hw_full.jsonl` runs **byte-identical 68000 loops**
against work RAM and against VRAM - same instructions, same unrolled 16-access
chunk, only the base address register differs. The ratio is therefore a clean
measurement of the tax. Aggregated over the free-running whole-frame window
(their "all"), 60-frame runs, 3 repeats:

| access shape | work RAM acc/frame | VRAM acc/frame | **VRAM / work RAM** |
|---|---:|---:|---:|
| `rmw` (addq to memory) | 31,748 | 15,647 | **0.493** |
| `movem` write | 45,738 | 23,831 | **0.521** |
| `movem` read | 44,239 | 23,088 | **0.522** |
| long read / long write | 31,748 | 18,336 | **0.578** |
| byte write | 22,677 | 13,968 | **0.616** |
| word write | 23,065 | 14,307 | **0.620** |
| word read | 23,065 | 14,506 | **0.629** |

**Read that table against the owner's 50% datum.** A frame spent entirely on
VRAM read-modify-write runs at **0.493×** on real hardware. That is not a fit,
not a tuning constant and not MAME's opinion - it is a logic-analysed 1997
arcade board, and it is a factor of two.

**But it is a CEILING, not a typical value**, and §5 says why that distinction
decides everything.

Two further measured facts from the same data:

- **Restricting to one scanline** (their "line" window, one line polled): word
  access 48/line on VRAM against 80/line on work RAM - **0.60**.
- **BUS_MASTER mode lifts most of it.** The IGS023 control register (our
  `$B0E000`) has a bit that suspends the fetch schedule; with it set the ratio
  rises to **0.79–0.91**. The residue is the fact that the CPU still shares the
  chip. Games can set this bit. Whether DaiOuJou does is a question for our
  listing, not for the core.

### 2.3 Sprite-list DMA - small, load-dependent, and MEASURED (HW, RTL)

Once per frame, at **scanline 221** (three lines before vblank), if the DMA
enable bit of the control register is set, the IGS023 **bus-requests the
68000**, takes BGACK, and reads the sprite list out of **work RAM starting at
offset 0** - five words per sprite, up to 256 sprites, terminating early on a
zero size word. The CPU is off the bus for the whole transfer.

**This corroborates our own map exactly, in both directions.**
`games/ddpdoj/src/machine.js` already has `spriteList: 0x800000, ..$8009FF, 10
bytes/entry` - 256 entries × 10 bytes = the core's 256 sprites × 5 words, at the
same base. **One correction to our note, though:** that line says "DMA'd at
vblank". The transfer starts at **scanline 221, three lines BEFORE vblank**, so
the last ~192 µs of the visible frame is when the list must already be final -
not the vblank boundary. Worth a one-word fix if anything ever depends on it.

**This is the only load-dependent CPU theft on the board, and it is tiny.** From
`util/sdr_stress/results/sdr_hw.jsonl`, real board, 120-frame runs, throughput
of a register-only loop that touches no data memory at all:

| sprites in the list | throughput vs 0 sprites |
|---:|---:|
| 32 | 0.9992 |
| 64 | 0.9985 |
| 128 | 0.9970 |
| **224** | **0.9947** |

**224 sprites costs the 68000 0.53% of a frame** - about 90 µs. And it costs
*the same* 0.53% whether the loop is register-only, cache-hot, or miss-heavy,
which proves the mechanism is the bus hold and nothing else.

**The core reproduces this to three decimal places** (their sim column reads
0.9947 at 224 sprites against the board's 0.9947).

### 2.4 Things that DO NOT stall the CPU on real hardware

Negative results, and they are as valuable as the positive ones:

- **Program ROM fetch is free.** The board has zero-wait mask ROM. Stated
  explicitly in their `sdr_stress.c` commentary and confirmed by the data above:
  a conflict-miss loop loses the same 0.53% to 224 sprites as a register-only
  loop.
- **Sprite art fetch does not touch the CPU bus.** The sprite A/B ROMs are on
  their own buses on real hardware. This is stated in their `sdram.sv`
  commentary *as the reason their FPGA arbiter had to be re-prioritised* - see
  §6.1.
- **IGS023 register access is free.** Their benchmark polls our `$B07000`
  between chunks specifically because it takes immediate DTACK and never enters
  the VRAM arbitration.
- **Palette RAM (`$A00000`) appears to be free** - the core lets the CPU take
  the palette port unconditionally and steals the cycle from the video read.
  **UNVERIFIED: their benchmark never tested a palette target** (only work RAM,
  BG VRAM, FG VRAM). Flagged in §6 - it matters, because DaiOuJou writes palette
  every frame.
- **The Z80 and the ICS2115 have their own bus.** No 68000 contention.

### 2.5 Interrupts (HW, RTL)

- **IRQ6 = vblank**, asserted on the transition into blanking (video line 224,
  SCANLINE register reads 224). Level-held until acknowledged; the acknowledge
  is a control-register operation and **a missing ack livelocks the board in an
  IRQ6 storm** - their test-ROM commentary records this as a real failure mode.
- **IRQ4 = a free-running line counter**, asserting every **62 scanlines**
  (≈ every 3.968 ms, ≈ 252 Hz, ≈ 4.26 per frame) and **not reset per frame** -
  so its phase drifts against the frame. Enabled by its own control-register
  bit. Their `testroms/pages/irq4_test.c` exists to probe it; no LA calibration
  of the 62 is recorded, so treat the exact period as RTL-asserted rather than
  hardware-attested.

**Note for us:** our first slowdown divergence is at `irq6`, logic frame 8,227.
IRQ4's 62-line period and drifting phase is a plausible thing to have got wrong
and is cheap to check on our side.

---

## 3. WHICH OF THE THREE MECHANISMS DOES THE HARDWARE IMPLEMENT?

**None of them. And that is the finding.**

`docs/knowledge/06`'s three mechanisms - (A) dropped updates, (B) time
dilation, (C) partial completion - are all descriptions of **what software does
when it runs out of time**. The PGM board does not implement any of them:

- The video timing is **absolutely rigid**. 264 lines, 64 µs each, 59.185606 Hz,
  forever. There is no frame-hold, no stretched vblank, no mechanism by which
  the display waits for the CPU. **The board cannot dilate time (B).**
- There is no per-object hardware budget, so **the board cannot truncate (C).**
- There is no hardware skip flag, so **the board cannot drop updates (A).**

What the board does is **set the CPU's budget** - 337,920 cycles per frame,
minus a VRAM-access tax that is a deterministic function of *where* the code
reads and writes, not of how many objects are alive. Everything the player
perceives as slowdown is the **ROM's** response to running out of that budget.

**That is a load-bearing correction to how this project has been framing the
problem.** "The board drops or dilates differently" (worklog 74's second
candidate) is not a live hypothesis: the board does neither. The three
mechanisms live in the listing, and we already know which one DaiOuJou uses -
`games/ddpdoj/src/isr.js` and `src/budget.js` record it: **(A), with gated ISR
routines**, measured at 614 gate firings in 696 forced-overrun frames, and
explicitly **not (C)** (all 20 object slots processed unconditionally on every
one of those 696 frames).

So the question the core answers is not "which mechanism" but the harder one
underneath it: **how many cycles does the real board actually give DaiOuJou,
and is it fewer than MAME gives it?**

---

## 4. THE OWNER'S 50% DATUM - what the core does and does not explain

> "Mame running at 50% speed or so should gets closest to real slowdown."

### What the core DOES supply

A real, measured, previously-unknown-to-this-project cycle thief with **exactly
the right ceiling**: a frame spent entirely on VRAM access runs at **0.493×** on
hardware. If MAME does not model the IGS023 VRAM arbitration - and there is no
sign in this project that anyone has checked - then MAME grants DaiOuJou cycles
the board would have withheld, and the gap is real, structural, and of the right
order.

It also supplies the *shape* of the effect, which a scaling factor could never:
the tax is **positional** (a hole anchored to the raster, a slot grid anchored
to the hole's end), so it is heavier for code that runs during active lines than
for code that runs in vblank, and it moves with **BG scroll position mod 32**.
A game whose per-frame VRAM work straddles the vblank boundary would slow down
*non-linearly* with load. That is a mechanism, and it is testable.

### What the core does NOT supply, and we must say so

**0.493× is an upper bound reached only by 100%-VRAM-bound code, and DaiOuJou's
frame is almost certainly not 100% VRAM-bound.** The `$900000` region is
tilemaps and rowscroll - a few hundred words a frame for a shooter whose bullets
all live in the sprite list in *work RAM*. On a first-order estimate that is
single-digit percent of the frame, not 50%.

**So the honest position is: the core hands us a mechanism of the right
magnitude and the right character, and does NOT prove it accounts for the
owner's factor of two.** Proving or refuting that is a measurement we can now
make (§7), and it was not available before.

### The other suspects, ranked, now that this one is quantified

1. **The IGS027A ARM7 co-processor.** DaiOuJou is `GAME_DDP3` - IGS027A "type1",
   20 MHz, and per the core's own game table its **internal ROM is
   *recreated*, not dumped**, for ddp3/ket/espgal alike. The 68000 talks to it
   through a **64-byte shared window and a command latch**. If the 68000 blocks
   on ARM responses, the ARM's real execution time is part of the frame budget -
   and **neither MAME nor this core has the real ARM code**. This is now the
   single largest known-unknown in the DaiOuJou timing picture, and it is
   unknowable from the FPGA core by construction.
2. **VRAM arbitration** (above) - real, bounded, measurable by us.
3. **Sprite DMA** - real, measured, and far too small: 0.53% at 224 sprites.
   **Rule this one out.** "Something in the sprite/DMA path stalls the board in
   a way MAME does not model" (worklog 74's third candidate) is *false* for the
   DMA and *false* for sprite art fetch.
4. **The game's own overrun mechanism plus video-capture artifacts.** Our wave-2
   forced-overrun run already produced **0.5309 logic frames per video frame**
   from injected cycles alone. Some part of the owner's impression may be the
   game doing exactly what MAME says it does.

**Do not act on this datum yet.** Worklog 74's rule stands: it is a target to
explain. What has changed is that we now have two of the four candidates
*quantified* and one of them *eliminated*.

---

## 5. WHAT THEIR AUTHORS SAY vs WHAT THEY IMPLEMENT

Kept separate deliberately, per the brief.

### 5.1 They say the core is BETA and ask for bug reports

`README.md`, verbatim in substance: "This core is currently BETA. Most games
work, but the core needs more testing." Their supported list includes
"DoDonPachi III / Dai-Ou-Jou".

### 5.2 They document their own retractions - three of them

`LA_FINDINGS.md` is a chronological record of models built and then **killed by
better captures**. This is the most trust-building thing in the repository and
it is also a warning about how easy the mistakes are:

- A **"grant-slot ceiling"** and per-access arbitration model, inferred from
  aggregate throughput data - retracted as "artifacts of the end-anchored hole;
  **do not model them**".
- A **"decaying read/write turnaround"** model - retracted: "a wrong mechanism
  fitted to two points; removed."
- A **±1.5 µs hole-length jitter** - retracted: it was an artifact of the
  benchmark loop's own phase, not the hardware's. The hole is deterministic.
- Slot sets **{0,3}** then **{0,2,3}** - both superseded by the contiguous
  half-cycle window; each had been a genuine fit to a real capture, and each was
  a different benchmark's request spacing sampling the same window.

**The lesson transfers directly to us**: every one of those was a model fitted
to aggregate throughput that turned out to describe the *measurement loop*
rather than the *machine*. That is precisely the failure mode of an
object-count-fitted slowdown heuristic.

### 5.3 Their open questions - still open at the last commit

- **Burst semantics.** Long/`movem` intra-burst cadence on hardware sits between
  "free" and "paced" and is not fully modelled.
- **Metastability at the window edge.** On hardware the write-straggle outcome
  is genuinely statistical (per-frame counts vary ±15 words about a stable
  long-run mean) because of the 5 ppm crystal beat. The deterministic sim lands
  every boundary case the same way, so they dither it with an LFSR at p=1/4 and
  note **a single p cannot serve both scattered writes and `movem` streams** -
  "fixing movem_w needs sub-50 ns 68k bus-timing fidelity."
- **Flipped screen untested.** The BG head-start scroll-alignment law is
  "unverified for global_flip_x - all LA data is unflipped."
- Residual model error: worst full-matrix delta **0.87%**, on a bus-master read
  row, attributed to sub-tick raw cycle length.

### 5.4 Where they say the FPGA is NOT the hardware

They are explicit about this, which is why it is safe to use them:

- **Program ROM.** Real hardware is zero-wait mask ROM; the FPGA runs it through
  a 16 KB direct-mapped cache in front of SDRAM shared with the sprite fetchers,
  **so every cache miss is FPGA-only stall time.** They found sprite traffic
  starving the CPU ROM path at −10..−12% in their sim against a flat −0.5% on
  the board, traced a real game (`espgalbl`) running ~3 s slow per 16 min to it,
  and fixed it by re-prioritising the SDRAM arbiter. That is an emulator bug of
  exactly the kind this project's `06-lag-and-slowdown.md` warns about, found
  only because they had board data to compare against.
- **The CPU clock enable is a "chaser".** The 68000 enable is nominally 2/5 of
  the system clock (20 MHz) but is allowed to run up to 25 MHz to repay debt
  accrued during FPGA-only stalls (ROM cache miss, ARM shared-RAM cache miss),
  so the long-run average stays 20 MHz. **They document a known bug in it**: the
  debt comparator is 10 bits wide and aliases, "silently forgiving exactly 1024
  cycles per wrap event - one wrap/frame is 0.30%". Marked a still-open
  follow-up.
- **They deliberately chose the LESS hardware-faithful clock model.** A
  fractional-accumulator enable reproducing the real 5 ppm crystal beat was
  implemented and **reverted**, because the phase sweep made free-running
  benchmark rows track hardware *worse*. They record the resulting known
  deviation: whole-frame write rows read ~+1.4% against hardware and the
  hardware's read/write asymmetry is not reproduced. **This is a modelling
  choice, honestly labelled, and it is the kind of thing we must not read as
  ground truth.**
- **68000 DTACK for cartridge protection.** `rtl/PGM.sv` carries their own note
  that stalling the 68000 while the IGS022 protection engine runs "can't be what
  games do because the carts can't access DTACK". A self-flagged
  non-hardware-faithful stall - **it affects the IGS022 games (Killing Blade,
  Dragon World 3), not DaiOuJou.**

### 5.5 What is NOT calibrated and they do not say so

- **The sprite-DMA transfer rate.** Their state machine reads a word every four
  system-clock ticks (80 ns) with no clock-enable gating, and there is no LA
  capture of the DMA in `LA_FINDINGS.md` and no commentary file for the sprite
  module. It nevertheless **matches the board to three decimals** on the
  sprite-count throughput sweep (§2.3), which is strong circumstantial
  validation - but it is validation of an *aggregate*, not of the transfer's
  internal timing.
- **The IRQ4 62-line period.** Asserted in RTL, no calibration recorded.
- **Palette RAM arbitration.** The benchmark has no palette target; the RTL
  assumes the CPU wins unconditionally. Untested either way.

---

## 6. WHAT THE CORE IS AND IS NOT GOOD FOR

**Good for:** the 68000's frame budget, the VRAM stall schedule and its exact
magnitude, the raster's clock relationships, sprite DMA cost, interrupt timing
and semantics, control-register bit meanings, and - through their sim server -
a **second cycle-accurate oracle** for DaiOuJou.

**Not good for:** anything downstream of the IGS027A. DaiOuJou's protection ARM
runs recreated code in both MAME and this core. If the 68000 waits on it, the
size of that wait is unknown to every implementation we have access to.

**Not usable as:** a source of code, ever. GPL.

---

## 7. WHAT WE COULD NOW MEASURE THAT WE CANNOT TODAY

Concrete, ordered by value per hour. All of these are new capabilities created
by this recon; none require a line of their code.

1. **Does MAME model the VRAM stall at all? (½ day, decides everything else.)**
   Replicate their experiment inside our existing MAME oracle: run two
   byte-identical 68000 loops - one against `$800000` work RAM, one against
   `$900000` VRAM - and compare accesses per frame. Hardware says the ratio is
   **0.49–0.63** depending on access shape (§2.2 table is the reference). **If
   MAME returns 1.00, MAME grants DaiOuJou cycles the board withholds, and we
   have found a real, sized, mechanism-level discrepancy** - the first hard
   evidence for the owner's standing claim. This is a *direct* replication with
   a *published hardware reference*, which is far stronger than anything the
   emulator-vs-emulator method could produce.

2. **How VRAM-bound is a DaiOuJou frame, really? (½ day.)** Census, per logic
   frame, the 68000's accesses to `$900000`–`$907FFF` split by shape
   (word/byte/`movem`/rmw) and by raster position (active line vs vblank), using
   the write-tap execution hook we already have. Multiply by the measured
   per-shape stall from §2.2 and we get **the real board's cycle cost of a
   DaiOuJou frame** - the first number in this project that is neither
   MAME-timed nor a fit. Feed it into `WorkBudget.charge()`, which was built for
   exactly this and is currently set to `NEVER_TRIGGERS`.

3. **Does DaiOuJou set BUS_MASTER? (1 hour.)** One bit of `$B0E000` lifts the
   VRAM tax from 0.49–0.63 to 0.79–0.91. Grep the listing for writes to
   `$B0E000` and decode the bit pattern. If the game sets it during its VRAM
   burst, the tax is much smaller than the ceiling and candidate 2 of §4 drops
   down the list. If it does not, the tax is real. **Do this first - it is an
   hour and it can eliminate a candidate.**

4. **Run DaiOuJou inside the core's simulator as a SECOND ORACLE. (2–3 days.)**
   Their `docs/sim-server.md` documents a JSON-RPC server over a Verilator build
   with: `sim.run_frames`, `sim.run_cycles`, `sim.run_until` **with PC-equality
   and PC-range conditions**, `cpu.get_state`, `memory.read`/`write`,
   `signal.read` on arbitrary internal nets, `state.save`/`load`, and
   `video.screenshot`. That is every capability
   `docs/knowledge/01-the-oracle-method.md` demands, on a **cycle-accurate**
   machine. Running it is not copying it. This gives us the thing
   `06-lag-and-slowdown.md` §"Two emulators disagreed" says is the whole game:
   **an independent implementation to disagree with MAME.** And unlike Mesen vs
   MAME, one of the two has a logic analyser behind it.

5. **Re-examine our `irq6` divergence at logic frame 8,227 (1 day).** With
   IRQ6's exact position (video line 224, SCANLINE register = 224) and IRQ4's
   62-line free-running period now known, check whether our divergence is an
   IRQ *phase* error rather than a slowdown event. `06-lag-and-slowdown.md`
   rule 3: never diagnose a timing-shaped divergence without checking the lag
   census - and we now have a second thing to check it against.

6. **Un-skip `cpuCycle` and `splitSpins` in the gate.** HANDOVER records six
   fields skipped inside the 47-scenario run, two of them timing fields. Once
   item 2 gives us a per-frame stall estimate, `cpuCycle` becomes a field with a
   *hardware-referenced* expected value rather than a MAME-timed one.

7. **Check the rowscroll write pattern against the BG-scroll law.** The hole
   length varies with `bg_x mod 32`. DaiOuJou is a vertical scroller writing a
   rowscroll table every frame. If its VRAM writes land near the hole boundary,
   its stall cost varies with scroll position - a *periodic, positional* slowdown
   component that no object-count heuristic could ever produce, and one we could
   look for directly in arcade video (worklog 74's landmark method).

---

## LICENCE NOTE - required by the brief

`C:\programmieren\pgm-mister` is a clone of the GPL-licensed
`MiSTer-devel/Arcade-IGSPGM_MiSTer`. It sits **outside this repository**, is not
a submodule, not a dependency and not on any path in our build.

**No code, comment text, identifier scheme or expression from that project has
been copied, transliterated or paraphrased into this repository**, in this file
or anywhere else. Every technical statement above is a **fact about 1997 IGS
PolyGame Master hardware** - clock rates, bus schedules, cycle counts, measured
throughput ratios, register bit semantics - restated in our own words, against
our own address notation, and attributed to the file and module we consulted so
the claim can be re-checked. Facts about how an arcade board behaves are not
copyrightable; that project's expression of them is, and it stays there.

Two numeric tables (§2.2, §2.3) are aggregates **we computed ourselves** from
their published raw hardware measurement data (`util/vram_bench/results/*.jsonl`,
`util/sdr_stress/results/*.jsonl`) - measurements of a physical board, not
authored expression.

If any future wave wants to *run* their Verilator simulator as an oracle (§7
item 4), that is use, not derivation, and remains clean - but nothing from it
may be vendored, and any harness we write to talk to its JSON-RPC interface must
be ours from scratch.

---

status: DONE
