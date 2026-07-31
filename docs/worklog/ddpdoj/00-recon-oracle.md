# Oracle bring-up: a per-frame probe on DoDonPachi DaiOuJou (ddpdojblk)
status: DONE (with two named open items)
wave: 0   role: recon   started: 2026-07-31

## The task, as I understood it

Deliver a RUNNABLE per-frame state probe on `ddpdojblk` under MAME 0.288, the way
`games/gradius/tools/oracle/` works under Mesen. Answer by MEASUREMENT: the
sampling point, execution hooks, determinism, input injection + lead,
savestates, and the frame rate from the driver source.

Everything below was run on this machine today. Every number has its command.

## The deliverable

```
games/ddpdoj/tools/oracle/
  .gitignore     out/ *.tsv *.bin *.png *.ppm  -- nothing ROM-derived is committed
  pgm.py         the driver layer + `trace` / `determinism` / `inputlead` commands
  frame.lua      THE PER-FRAME STATE PROBE (the deliverable)
  api.lua        MAME Lua surface on the PGM driver
  irq.lua        interrupt census, game-agnostic
  hunt.lua       autovector -> handler entry, interrupted-PC histogram
  tapcal.lua     read-tap semantics ON THE 68000 (the correction, see below)
  sync.lua       who writes the vblank semaphore, and from where
  ramdump.lua    128 KiB RAM dump keyed on the GAME's frame counter
```

Runs, end to end, no arguments beyond a frame count:

```
$ python games/ddpdoj/tools/oracle/pgm.py determinism 150
run 1: 203dcb01c3fdaeace9d0c7fb1a7b78cd54bb7aa1f346adbf25f9e8297783c05e  ...det1.tsv
run 2: 203dcb01c3fdaeace9d0c7fb1a7b78cd54bb7aa1f346adbf25f9e8297783c05e  ...det2.tsv
IDENTICAL

$ python games/ddpdoj/tools/oracle/pgm.py inputlead 100
applied at logic frame 100; game input mirror $803970 first non-zero at logic
frame 101; lead = 0 extra frames
```

## What I MEASURED

### 1. THE SAMPLING POINT — `$803940`, armed at `$13C5B6`

Found without reading any disassembly first, in three steps.

**(a) Interrupt census** (`irq.lua`, 900 video frames, attract):

```
PROBE videoframes=900 iacks=1776
PROBE iack_offset=FFFFFC n=888        <- 68000 autovector IAK, level 6
PROBE iack_offset=FFFFF8 n=888        <- level 4
PROBE iacks_per_videoframe[0]=12      <- boot, before interrupts are enabled
PROBE iacks_per_videoframe[2]=888     <- every other frame: exactly one of each
```

A read tap on `:maincpu`'s **`cpu_space`** is a game-agnostic interrupt hook on
the 68000, exactly as `NOTES-slowdown-oracle.md` §3c predicted. IRQ4 and IRQ6
fire exactly once per video frame each. No frame in 900 delivered more or fewer.

**(b) Where was the main loop when the interrupt hit.** At the IAK moment the
68000 has **not yet pushed the exception frame** — `SP_at_iack=00820000 n=1769`,
i.e. the stack is empty — so the interrupted PC is *not* on the stack there.
It is in a register instead. Tapping the handler's first instruction
(`tapcal.lua`) shows:

```
PROBE H6hit off=000CBE data=2F39 CURPC=13C6BA PC=000078 SP=81FFF6 IR=001E
PROBE H6 CURPC-addr=1292790 n=228     -> CURPC = $13C6B4
PROBE H6 CURPC-addr=1292796 n=156     -> CURPC = $13C6BA
PROBE H6_tap_hits=389 frames=400
```

**At an exception-entry opcode fetch on the 68000, `CURPC` is the INTERRUPTED PC
and `PC` is the vector address (`$78`).** 384 of 389 interrupts landed on two
addresses six bytes apart: a two-instruction busy-wait.

**(c) What the loop is waiting for.** Disassembled to scratch (not committed):

```
$13C5B6  move.b #$1,$803940       <- the main loop ARMS the semaphore
$13C5BE  tst.w  $80390E
$13C5C4  bne    $13C6B4           <- BRANCHES INTO the middle of the wait routine
   ...
$13C6AC  move.b #$2,$803940       <- a head that this path never executes
$13C6B4  tst.b  $803940
$13C6BA  bne    $13C6B4           <- the spin
$13C6BC  rts
```

That is the **fall-through trap in its other direction**: the spin lives inside a
routine whose head (`$13C6AC`, which arms with **2**) is jumped *over*. Over 1,200
frames of attract **and** gameplay the arming site was `$13C5B6` every single
time (`armpc histogram Counter({'13C5B6': 1200})`) — but the probe keys on the
*semaphore*, not on that PC, so a different wait site would still be sampled.

**The IRQ6 handler is the other half, and it contains an (A)-style gate:**

```
$000CBE  move.l $801478.l,-(A7) / rts   <- vector trampoline through a RAM vector
$801478 = $13BDBA  (893 of 900 frames; $000CC6, the BIOS default, for the first 8)
$13BDBA  movem.l D0-D7/A0-A6,-(A7) / jsr $13C7D4
$13C7D4  jsr $13CFBA
$13C7DA  jsr $13D464        <- READS THE INPUTS, $C08000
$13C7E0  jsr $18ACC0
$13C7E6  tst.b $803940
$13C7EC  beq  $13C80C       <- THE GATE: if the main loop is NOT waiting, skip...
$13C7EE  jsr $141676
$13C7F4  jsr $140FFE
$13C7FA  jsr $141258
$13C800  jsr $185DC4
$13C806  subq.b #1,$803940  <- ...and release the main loop
$13C80C  jmp $13C4FC
```

**So the sampling point is the ARM WRITE: the 0 → non-zero transition of
`$803940`.** At that instant the frame's updates are finished and nothing of the
next frame has begun. It is the exact analogue of Gradius's `$80B5`.

This also hands us the lag instrumentation for free, and it is **case (A) as
well as case (B)**: four subroutines in the IRQ6 handler are skipped when the
main loop overran, while the input read at `$13D464` still runs — the same
"the dropped frame is not uniform even within one driver" shape as Batman's
`$C757`. `docs/knowledge/06` says name which of the three you have before
modelling: **on this game, at least (A) and (B) are both present in the same
handler.** (C) — a truncated object loop — is **not measured either way**.

### 2. EXECUTION HOOKS — the inherited rule is WRONG on this CPU

`NOTES-mame-oracle.md` says a read tap is an execution hook and `CURPC`
discriminates fetch from data read. **That is true on the 6502 and false on the
68000**, and getting it wrong cost me a run that reported zero hits:

```
PROBE handler=00000CA6 executions=0 curpc_matched=0    <- filtered on CURPC==addr
PROBE handler=00000CBE executions=0 curpc_matched=0
```

Measured behaviour of `install_read_tap` on `:maincpu`'s `program` space:

| case | `offset` | `PC` | `CURPC` |
|---|---|---|---|
| opcode **prefetch** of X | X | **X** | the *currently executing* instruction (lags) |
| **data** read of X | X | reader's next fetch addr | **the reading instruction** |
| **exception entry** fetch | handler | **the vector address** ($78) | **the interrupted PC** |

Evidence for the data case, from the same run: `DATAhit off=800000 data=0000
CURPC=00C036 PC=00C038` — `CURPC` is the reader, `PC` is `CURPC+2`.

**So on the 68000 the discriminator is `PC == offset`, not `CURPC == offset`.**
And even then a read tap only proves the address *entered the prefetch queue*.
`$13C6BC` is prefetched on every spin of the wait loop and executes once per
frame; no `CURPC` filter can separate those, because the execution does not
re-read memory.

**The reliable 68000 execution hook is a WRITE tap.** Writes are never
speculative. `sync.lua` on the semaphore:

```
PROBE write_803940 CURPC=13C5B6 n=885     <- the arm, once per frame
PROBE write_803940 CURPC=13C806 n=884     <- the ISR release, once per frame
PROBE writes_803940_per_videoframe[2]=884
```

Two more tap traps, both of which produced **completely silent** failures:

* `install_write_tap(0x803940, 0x803940, ...)` → `Fatal error: ... end address
  has low bits unset, did you mean 803941?` (a 16-bit space wants word-aligned
  ranges).
* **`emu.add_machine_frame_notifier` returns a subscription that must be kept
  alive**, exactly like a tap handle. Dropped on the floor it is
  garbage-collected and never fires — two of my runs produced *no output at all
  and no error*. `NOTES-mame-oracle.md` §6 records this for taps; it is true for
  notifiers too.

### 3. FRAME RATE — 15625/264 Hz, and it IS a derivation

From MAME's own machine database on this machine (`-listxml ddpdojblk`):

```
<display tag="screen" type="raster" rotate="270" width="448" height="224"
   refresh="59.185606" pixclock="10000000" htotal="640" hbend="0" hbstart="448"
   vtotal="264" vbend="0" vbstart="224" />
<driver status="imperfect" emulation="good" savestate="supported"/>
```

`pixclock`/`htotal`/`vtotal` being present is the proof that the driver used
`set_raw(...)` and not a rounded `set_refresh_hz(literal)` — `docs/knowledge/07`'s
distinction, checked rather than assumed. There is **no `<feature type="timing">`**
on this driver.

```
10,000,000 / (640 x 264) = 15625/264 = 59.185606060606...  Hz
```

And the emulator agrees to the attosecond (`api.lua`):

```
PROBE screen w=448 h=224 refresh_attos=16896000000000000 refresh_hz=59.185606061
```

`16,896,000,000,000,000 as` = **16.896 ms exactly** → **337,920 68000 cycles per
frame exactly**. Independently corroborated by the probe's own per-frame cycle
column, computed from `machine.time` deltas between sample points:

```
cyc min 133962  max 738420  mean 341853   budget 337920      (1200-frame run)
```

Steady-state rows read 337498 / 338382 / 337518 — straddling 337920 because the
sample point drifts a few hundred cycles inside the frame, exactly as expected.

### 4. DETERMINISM — yes, once you isolate MAME's writable state

**This is the finding that would have silently poisoned the corpus.** My first
two runs of the same script with the same arguments produced *different* traces:

```
0f9aea051aebc0455c0248bebc293bcdc6e252686a089beabeddd920e1aeb1c2  a.tsv
30ab4ad718fd07aa5115e4a38daac623b565ec2e2f5ff6d4920cfc04bb310416  b.tsv
30ab4ad718fd07aa5115e4a38daac623b565ec2e2f5ff6d4920cfc04bb310416  c.tsv
$ diff a.tsv b.tsv | grep -c '^<'
300           # every single row
```

MAME persists per-machine state in `<cfg_directory>/ddpdojblk.cfg` and rewrites
it on exit. It contains, among other things, **the coin counter**:

```xml
<system name="ddpdojblk"><counters><coins index="0" number="8" /></counters>
```

With `-noreadconfig -nowriteconfig` and private `-cfg_directory` /
`-nvram_directory`, repeated runs are byte-identical, including across a
2.5-minute wall-clock gap:

```
3fee7609bf6930dfed5aaf2508905b31807af5d262081798ea23a9d4141da3ee  g.tsv  21:12
3fee7609bf6930dfed5aaf2508905b31807af5d262081798ea23a9d4141da3ee  h.tsv  21:12
3fee7609bf6930dfed5aaf2508905b31807af5d262081798ea23a9d4141da3ee  i.tsv  21:15
```

`pgm.py` bakes those five flags in so no probe can forget them.

**What I did NOT establish**, and it is written down rather than assumed: I
changed config isolation and directory isolation *together*, so I cannot
attribute the original divergence to the coin counter specifically. And the PGM
board carries a **V3021 RTC** that MAME feeds from the host clock. Eight minutes
of runs agreed; **a run tomorrow is not proven to agree with a run today.** That
is a scheduled check, not a settled fact.

### 5. INPUT INJECTION — works mid-frame, and the LEAD IS ZERO

The game reads `$C08000` once per logic frame, inside the IRQ6 handler:

```
PROBE inread 13D46A@C08000 n=385      (385 logic frames, 385 reads)
$13D464  lea $C08000,A0
$13D46A  move.w (A0),D0        ... ror/not ...
$13D488  move.w D0,$803970     <- P1 input mirror
$13D48E  move.w D1,$803976     <- P2
$13D496  ...                   -> $803972 P1 newly-pressed, $803974 P1 previous
```

Applying `P1 Button 1` **at the sample point of logic frame 100**:

```
lf  vf  p1raw p1edge p1prev
100 114     0      0      0
101 116    16     16     16
102 116    16      0     16
```

**Lead = 0.** A button set at the sample point of frame N is latched by the ISR
that runs while the main loop waits, and is consumed by frame N+1's work — i.e.
identically to a port that reads input at the top of its tick. Same result for
Start (`p1raw=32768` at lf 101 for a press at lf 100). Gradius measured zero;
the Game Boy needed one; **this machine needs zero**, measured, not assumed.

`field:set_value()` takes effect immediately for a bus read later in the same
video frame — MAME does not defer it to a frame boundary.

### 6. SAVESTATES — restore works; resume differs by ONE byte plus dead stack

`machine:buffer_save()` from the **frame notifier** (not from inside a tap):

```
PROBE SAVED vf=120 lf=105 bytes=8947832
PROBE LOADED bytes=8947832 at vf=120
```

Resuming and aligning on the game's own frame counter `$80390A`, the resumed run
continues at exactly the right game frame (saved at game frame 105, resumed run's
first sample is game frame 106) and **`d_spr`, `d_pal`, `d_spb`, `d_bg`, `d_tx`,
`sprites`, `armpc` and all thirteen named words match on all 60 compared frames.**

A full 128 KiB RAM dump at the same *game* frame from a boot run and a resumed
run (`ramdump.lua`) differs in **28 bytes**:

```
differing bytes: 28    runs: 13
  $80FA85..$80FA85  len=1   boot=00  res=01
  $81FF7D..$81FFF7  (12 runs, 27 bytes, all above the live stack pointer)
```

* The 27 bytes are **dead stack** — garbage below SP left by a different call
  history. `frame.lua` therefore digests `$800000-$81FF00` as `d_ram` and the top
  page separately as `d_top`, so the artifact is *reported, not hidden*.
* The one live byte is `$80FA84/85`, written by the **IRQ4** chain
  (`$13BDAA → jsr $1453A6`), sites `$1453B6` / `$1453BC`, cycling 0→1→2:
  ```
  PROBE w 1453BC off=80FA84 mask=FFFF data=0001 n=93
  PROBE w 1453B6 off=80FA84 mask=FFFF data=0002 n=92
  ```
  It is an IRQ4 phase counter. The savestate was taken at a *video*-frame
  boundary, which is not aligned with that phase, so the resumed run is one step
  out of phase on it and stays there.

**This is a much sharper answer than `NOTES-slowdown-oracle.md` §8.4's "a replay
from that state did not reproduce the original trace (first mismatch at step
1)".** The state restores exactly and the replay *does* reproduce the game;
what differs is one interrupt-phase byte and dead stack. Seeding deep is viable
(`docs/worklog/gradius/09-DECIDED-seed-anywhere.md`), with one fix to make:
take the save at the game's own sample point, not at a video-frame boundary.

### 7. Real gameplay reached, and slowdown is visible

Coin + Start + stick, 1,200 logic frames:

```
$ PROBE_INPUT="60=N;64=;100=S;104=;200=U;260=UA;400=A;460=" ... frame.lua
PROBE DONE logicframes=1200 videoframes=1229
sprite max 95
irq6 histogram   Counter({'1': 1185, '2': 14, '3': 1})
gated histogram  Counter({'1': 1199, '0': 1})
armpc histogram  Counter({'13C5B6': 1200})
cyc min 133962 max 738420 mean 341853  budget 337920
frames over 400k cycles: 28   e.g. lf=663 vf=679 cyc=738420 irq6=2 sprites=95
```

**15 logic frames out of 1,200 spanned more than one video frame** (14 spanned
two, 1 spanned three) — a measured **(B) time-dilation** event set on the real
game, and `cyc=738420 ≈ 2.19 × 337920` on the worst one. One frame had the IRQ6
gated block skipped (`gated=0`). The `sprites` column (the hardware's own
sprite-list terminator rule from `igs023_video.cpp`) reached 95.

`videoFrame` and `logicFrame` are separate columns from the first probe, as
`NOTES-slowdown-oracle.md` §9 demands, and the lag census is in the standard
output rather than on request.

### 8. Performance

| configuration | speed |
|---|---|
| bare, no probe (`-seconds_to_run 3`) | 149.60% (ddp3, from NOTES-versions) |
| `irq.lua` (cpu_space tap only) | 106–136% |
| `frame.lua` (six digests + sprite walk per frame) | **17–21%** |

At ~20% of real time a 10,000-frame scenario costs about 14 minutes. Usable, but
the digest loop is the cost and is the obvious first optimisation.

## What I could not do, and why

1. **The V3021 RTC is an unclosed determinism risk.** Runs agree over minutes.
   Nothing proves they agree across a date change, and the driver instantiates a
   real-time clock. MAME has no `-rtc` override that I found. **Scheduled check,
   not a settled fact.**
2. **Whether the original a≠b divergence was the coin counter** specifically. I
   applied five isolation flags at once and did not bisect them.
3. **Case (C) — a truncated per-object loop — is completely unmeasured.** I found
   (A) and (B). I did *not* look for a `for slot < limit { if (!budget) break }`
   shape. `docs/knowledge/06` says this is the one that cannot be retrofitted, so
   it is next-steps item 3. **I am not claiming it is absent.**
4. **`armpc` was `$13C5B6` on every one of 1,200 frames covering attract and the
   first stage.** That is a *presence* result. There are three other wait sites in
   the same routine (`$13C5A4`, `$13C6AC`, `$13C6BE`); I have not shown they are
   never used. The probe keys on the semaphore, not the PC, so it survives either
   way — but do not write "the game only waits at $13C5B6" anywhere.
5. **The ARM7 (`:prot`) is `set_disable()`d on this set** and its internal ROM is
   `NO_DUMP`. Nothing here measures it. `NOTES-slowdown-oracle.md` §8.1 assumed
   the ARM7 is a live second CPU whose workload must be modelled; for the Cave
   sets **it is switched off and simulated in C++**, so that risk is smaller than
   recorded — but the simulation is still not the silicon.
6. **No pixel layer.** `PROBE_PIXELS=1` hashes a sparse sample of
   `screen:pixels()`; I did not verify the framebuffer contains a real picture on
   this driver (`docs/knowledge/02` trap 2 says assert on the output). Unverified.
7. **`-drc` vs `-nodrc`** was not tested. With the ARM7 disabled the 68000 core is
   Musashi (no DRC), so it probably does not apply here, but it is untested.

## Traps this cost, recorded so nobody pays twice

1. `CURPC == tapped address` is a **6502** rule. On the 68000 it is `PC ==
   offset`, and a read tap means *prefetched*, not *executed*. Use write taps.
2. **Notifier subscriptions are garbage-collected**, like tap handles. Symptom:
   a run that prints nothing at all and exits 0.
3. `install_*_tap` on a 16-bit space needs a word-aligned end address.
4. **MSYS/Git-Bash mangles `VAR="120:/c/path/file"`** into something `io.open`
   cannot open — and `io.open` returns nil with no message, so the failure
   surfaces as `attempt to index a nil value (local 'fh')` several lines later.
   Pass Windows paths (`cygpath -w`).
5. `emu.add_machine_stop_notifier` produced **no output** under
   `-seconds_to_run`. Dump from the frame notifier and call `machine:exit()`.
6. MAME's `cfg` directory is live machine state (coin counters). Isolate it or
   your runs are not reproducible — and another process using the same MAME
   install will rewrite it underneath you.

## If someone picks this up cold

```
python games/ddpdoj/tools/oracle/pgm.py determinism 150   # must print IDENTICAL
python games/ddpdoj/tools/oracle/pgm.py inputlead 100     # must print lead = 0
python games/ddpdoj/tools/oracle/pgm.py trace 600
```

The addresses that matter, all measured today, all on `ddpdojblk`:

| address | what |
|---|---|
| `$803940` | **the vblank semaphore — THE SAMPLE POINT** (0 → non-zero = frame done) |
| `$13C5B6` | the main loop's arm site (the only one seen in 1,200 frames) |
| `$13C6B4` / `$13C6BA` | the busy-wait spin, entered by branch, not fall-through |
| `$13C806` | the IRQ6 release (`subq.b #1,$803940`) |
| `$13C7E6` | **the (A) gate** — four ISR subroutines skipped if the loop overran |
| `$13D464` / `$13D46A` | the input read, inside IRQ6 |
| `$803970 / $803972 / $803974` | P1 raw / newly-pressed / previous |
| `$803976 / $803978 / $80397A` | P2 raw / newly-pressed / previous |
| `$80390A` | the game's own frame counter — align resumed runs on this, not on `vf` |
| `$80FA84` | IRQ4 phase counter; the one live byte a savestate resume gets wrong |
| `$801470 / $801478` | RAM vectors: the real IRQ4 / IRQ6 handlers (`$13BDAA` / `$13BDBA`) |
| `$000CA6 / $000CBE` | BIOS autovector trampolines that jump through them |
| `$800000..$8009FF` | the sprite list, 10 bytes/entry, ≤256, terminated by word 4 & 0x7fff == 0 |

Nothing ROM-derived is committed. Traces, dumps, savestates and disassembly all
went to the session scratch directory; `games/ddpdoj/tools/oracle/.gitignore`
covers `out/`, `*.tsv`, `*.bin`, `*.png`, `*.ppm`.
