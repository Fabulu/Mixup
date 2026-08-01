# THE oracle — one harness, pinned to VERSION-B

status: wave 1, built and measured 2026-07-31.
Evidence, with every command and its actual output:
`docs/worklog/ddpdoj/01-impl-oracle-pin-versionb.md`.

Wave 0 left four harnesses. This is the consolidation. **Everything new goes
through `games/ddpdoj/tools/oracle/pgm.py`.** `tools/pgm.py`, `probes/*.lua`,
`tools/hard/*` and `tools/drive.lua` stay in the tree as the record of how their
numbers were produced; nothing new should be built on them.

```
games/ddpdoj/tools/oracle/
  pgm.py           THE entry point. Every command below.
  frame.lua        the per-frame state probe (the sample point, the census)
  objhunt.lua      write map with CURPC attribution: stride, count/logic frame
  phase.lua        times the seven main-loop calls; attributes writes to phases
  xref.py          static xref / call search / unidasm over the decrypted image
  derive.py        re-derives the landmark table from the decrypted image
  dumpcpu.lua      dumps the DECRYPTED :maincpu region for derive.py/unidasm
  landmarks.json   the derived table, ADDRESSES ONLY, committed
  scenarios.json   the corpus
  .gitignore       out/ *.tsv *.bin *.png *.state — nothing ROM-derived commits
```

```
python pgm.py verify       -verifyroms + the machine pin
python pgm.py landmarks    the per-build landmark table
python pgm.py trace 900    one probe run
python pgm.py scen         the whole corpus, lag census on every scenario
python pgm.py gate         THE determinism gate (add --break-cfg to see it RED)
python pgm.py snap         framebuffer PNGs — LOOK AT THEM
python pgm.py seed         produce the VERSION-B-preselected NVRAM
python pgm.py seedstate    savestate at the game's own sample point + resume
python pgm.py inputlead    expect 0
python pgm.py rtc          RTC census + determinism across a date change
python pgm.py drc          -drc vs -nodrc
python pgm.py pixred       red-validate the pixel column
python pgm.py objdriver    THE OBJECT DRIVER: derived table + measured slots
python pgm.py overrun      FORCE AN OVERRUN: the 0-nop control, then a sweep
```

## 1. THE TRAP THAT DEFINES THIS CARTRIDGE

`ddpdojblk` contains **two complete games**. It boots to a chooser —
`1: VERSION-A (OLD)` / `2: VERSION-B (NEW)` — and the countdown's silent default
is **VERSION-A = 2002.04.05 MASTER VER, which is not Black Label**.

Measured, wave 1, as a controlled pair of runs through the same harness:

| scenario | chooser input | build at the end | legal screen |
|---|---|---|---|
| `chooser-a` | none, countdown expires | `$13C5B6` on 1600/1600 frames | **2002.04.05.MASTER VER** |
| `stage1-open` | P1 Down @lf560, P1 Button 1 @lf600 | `$23C212` on 1901/2600 | **2002.10.07.BLACK VER** |

**Every probe run declares which build it is in and fails if it is the wrong
one.** The discriminator is the top nibble of the PC that armed the frame
semaphore (`$13xxxx` = A, `$23xxxx` = B), plus the rule that the run must still
be in the required build on its LAST frame — the chooser itself is build-A code,
so "some frames were in B" is not enough.

## 2. The sample point, and why it is a write tap

The main loop's call #5 arms a vblank semaphore at `$803940` with the number of
vblanks to wait, then busy-waits; the IRQ6 handler releases it. **The sample
point is the ARM WRITE — the 0 → non-zero transition of `$803940`.** At that
instant the frame's work is done and nothing of the next frame has begun.

On the 68000 a *read* tap fires on the **prefetch**, so it cannot prove that an
address executed, and `CURPC == tapped address` is a **6502** rule that is false
here (the 68000 discriminator is `PC == offset`). Writes are never speculative.
Two wave-0 recons lost runs to this.

Every tap handle and notifier subscription lives in a Lua **global**. A dropped
handle is garbage-collected and the hook silently stops firing; the symptom is a
run that prints nothing at all and exits 0. Three agents have hit this.

## 3. The landmark table (`python pgm.py landmarks`)

Re-derived on BOTH builds by `derive.py` from the decrypted `:maincpu` region —
not copied from any document. The two builds share the RAM layout and not one
code address; the per-call deltas run from +0xFFC5C to +0x100C94, so **no
address may be translated by adding 0x100000**.

RAM, shared by both builds: `$803940` semaphore · `$80390A` frame counter
(advances per MAIN LOOP ITERATION) · `$80390E` mod-3 phase (read back by the
frame sync) · `$803970/72/74` P1 raw/edge/prev · `$801470/$801478` IRQ4/IRQ6 RAM
vectors · `$80FA84` IRQ4 phase · `$800000-$8009FF` sprite display list.

| | build A (`$13xxxx`, MASTER) | build B (`$23xxxx`, **BLACK — the target**) |
|---|---|---|
| loop head / tail | `$13C356` / `$13C380` | `$23BFDC` / `$23C006` |
| counters | `$13BE8C` | `$23BE8C` |
| work calls | `$1562F0 $1413F6 $145F1C $13D61A` | `$256D5A $2410BC $24683E $23D2AE` |
| frame sync | `$13C5B6` | `$23C212` |
| post-vblank call | `$13D496` | `$23D12A` |
| wait loops | `$13C5AC $13C6B4 $13C6C6` | `$23C208 $23C390 $23C3BC` |
| …sync reaches | `$13C6B4` | `$23C390` |
| ISR6 release | `$13C806` | `$23C46C` |
| ISR6 (A) gate | `$13C7E6` → `$13C80C` | `$23C44C` → `$23C472` |
| …skipping | `$141676 $140FFE $141258 $185DC4` | `$24133C $240CC0 $240F26 $287286` |
| input read | `$13D464` | `$23D0F8` |
| P1 mirror store | `$13D488` | `$23D11C` |
| RTC access | `$13C8B0` | `$23C53A` (`lea $C00006,A0`) |

**Two corrections to the recons, both found by re-deriving rather than quoting:**

1. There is not ONE wait loop per build, there are **three**, each with its own
   arm. `00-recon-oracle.md` flagged this as an open item and named the arm
   addresses; these are the matching spin addresses.
2. **Build B has a THREE-vblank arm (`$23C25C: move.b #$3,$803940`) that build A
   does not have**, and also arms through a register (`$23C38A: moveq #$2,D0 /
   move.b D0,$803940`). A search for `move.b #imm,$803940` — which is what the
   recons ran — is blind to the second one. So build B has a 19.7 Hz scheduling
   path as well as the 29.6 Hz one. **Both are scheduling, not slowdown**, and
   both will masquerade as slowdown to anything that only counts frames. The
   probe reports which value was armed on every frame (`armed_vblanks` census).

## 4. The lag census — printed by every scenario, never optional

```
CENSUS irq6_per_logicframe 1:2584 2:15 3:1
CENSUS releases_per_logicframe 0:1 1:2599
CENSUS armed_vblanks 1:2600
CENSUS spanned_gt1_videoframe=16 gated_zero_release=1
CENSUS work_cycles min=38070 max=402178 budget=337920 over_budget=2
CENSUS spin_iters_bucketed500 0:700 ... 9000:404 ... 12000:287 12500:1
CENSUS max_sprite_entries=122
CENSUS build_by_armpc_top_nibble 1:699 2:1901
```

* `irq6 > 1` — the logic frame spanned more than one video frame: case (B).
* `releases == 0` — the IRQ6 (A) gate fired and its four subroutines were
  skipped **while the input read before the gate still ran**. A dropped frame is
  not uniform.
* `armed_vblanks` — 2 or 3 is the deliberate divider, **not** an overrun.
* `work_cycles` — cycles from the ISR6 release that started the frame to the arm
  that ended it, against the exact 337,920-cycle budget (20 MHz ÷ 15625/264 Hz).
  Free: no extra tap. The spin meter measures the same thing from the other side.

**Every one of these numbers is MAME-timed and UNCALIBRATED.** MAME is
authoritative for WHAT the game computes and not for WHEN.

## 5. Determinism — a gate, seen red

`pgm.py gate` runs the boot→stage-1 VERSION-B scenario twice and compares the
whole trace byte for byte. Measured: **IDENTICAL**. With `--break-cfg` (MAME's
own `cfg`/`nvram` directories, `-readconfig -writeconfig`) it goes **DIVERGED**
on `vf`, `cyc`, `work`, `spin`, `d_ram`, `d_top`, `d_pal`, `d_tx` and `pix`.
A gate that has never been seen red is not a gate.

`-drc` and `-nodrc` produce byte-identical traces.

### The date, and it is the one thing that was really broken

The board carries a **V3021 RTC that MAME feeds from the host clock**, build B
reads it (`lea $C00006,A0` at `$23C53A`; 216 calendar reads in the gate
scenario), and **the calendar lands in main RAM**. Two otherwise identical
2,600-frame runs 26 hours apart on the calendar differ in **exactly ten bytes**:

```
$80209B = 08 vs 07     $80209D = 01 vs 1F        (month, day)
$8020AC..AD   $80211C..1D   $802204..05   $8022C8..C9   = 0801 vs 071F
```

Everything else — sprite list, palette, sprite buffer, BG, TX, framebuffer
pixels, the frame counters, work, spin — was identical. Those five 8-byte words
are therefore carved out of `d_ram` and reported as their own column `d_date`,
named in `frame.lua` with the measurement that justifies each. **Reported, not
hidden.** With the carve-out, two runs 26 hours apart differ in `d_date` and in
nothing else.

## 6. Other measured facts

* **Input lead is ZERO**, re-measured on VERSION-B in gameplay: Button 1 applied
  at the sample point of logic frame 2000, `$803970` bit 4 set at 2001.
* **Savestate seeding works** if the save is taken in the frame notifier one
  video frame after the arm. Resumed and aligned on `$80390A`, 120 frames
  compared: `d_ram` differs on 1 frame (the boundary), `d_top` (dead stack) on
  20, `$80FA84` on 1; `d_spr`, `d_pal`, `d_spb`, `d_bg`, `d_tx`, `sprites`,
  `$80390E`, `p1raw` identical on all 120. `$80FA84` is a compared column
  (`irq4ph`), not a hidden artifact.
  **Calling `buffer_save()` from inside the memory tap does NOT work**: the
  state restores but is not resumable — measured, the resumed run diverged on
  `d_ram` and `$80390E` on all 120 frames. It re-enters the core mid-instruction.
* **The pixel column is red-validated.** `pgm.py pixred` clears bit 0 of the
  IGS023 control register `$B0E000` (the sprite-DMA enable) from Lua: `pix` and
  `d_spb` move, every RAM digest stays identical. So the pixel hash can see a
  missing sprite layer, and the RAM digests correctly cannot.
* **Speed: ~107 % of real time** with full digests, the spin meter and a pixel
  hash every 50th frame (5,000 logic frames in 79 s wall). A 10,000-frame
  scenario costs about 2.6 minutes. Wave 0's probe ran at 17–21 %.
* **Peak sprite-list length observed: 133** of the hardware's 256 (wave 0 saw
  95). The cap has still never been reached, and that says nothing about what
  happens at it.

## 7. The seeded VERSION-B NVRAM (`pgm.py seed`)

Main RAM **is** the NVRAM on this board (`pgm.cpp` maps the same 128 KiB as
`m_mainram` and as the `sram` NVRAM device), so MAME writing nvram on exit
persists the game's own state, version choice included.

Procedure, which is the deliverable — the image itself is a snapshot of the
board's RAM, is ROM-derived, and is **never committed**:

1. Run with `-nvram_save` into a private `-nvram_directory`, scripting the
   chooser to VERSION-B. MAME leaves `<dir>/ddpdojblk/sram`, 131,072 bytes.
2. Boot again from that directory **with no input at all** and assert the run
   ends in build B.

Measured 2026-07-31:

```
sha256  3c4d8ef5818fbf8cfc0715ba91515f9399cc6255b579ceff6f4c56c9f5235e84
size    131072      non-zero bytes 3244, range $01400..$1FFFF
$03810  01          (00 in the factory blob and at boot)
silent boot: cursor pre-set on "2: VERSION-B (NEW)", countdown expires,
             legal screen reads 2002.10.07.BLACK VER
```

**`$03810` in the saved image is the versions recon's candidate flag,
confirmed**: 00 in `ddp3blk_defaults.nv` and in main RAM at boot, 01 after
choosing VERSION-B. (The `sram` file is word-swapped relative to main RAM —
`region[i] == mainram[i^1]` — so which of `$803810`/`$803811` it is was not
established.)

**Caveat, and it is why the scripted chooser stays the default:** the seed is a
snapshot of the whole 128 KiB of live RAM at exit, not a minimal settings blob
(3,244 non-zero bytes against the factory blob's 80–97). It seeds far more state
than the version choice. Scenarios therefore script the chooser; the seed exists
because the plan asked for it and because a silent boot into Black Label is a
useful independent check.

## 8. What is still NOT closed

* The date experiment moves the **local** date via `TZ` (+14 vs −12, 26 hours).
  It does not exercise a month/year rollover, and a real system-clock change was
  not performed.
* `armpc` was `$13C5B6`/`$23C212` on every frame of every scenario run. That is a
  **presence** result. Two other wait routines exist per build and have not been
  shown to be unreachable. The probe keys on the semaphore, not on the PC, so it
  survives either way.
* No overrun of the game's own frame has been forced. `work_cycles` exceeded the
  337,920-cycle budget on 2 of 2,600 frames and `irq6 > 1` on 16, but the loop
  completed every frame. Case **(C)** — a truncated per-object loop — remains
  completely unmeasured, and the top-level object driver is still not located.
  That is wave 2's job, and `docs/knowledge/06` says (C) cannot be retrofitted.


---

## WAVE 2 — the object driver, the overrun, and two defects in this harness

Full evidence: `docs/worklog/ddpdoj/02-impl-object-driver-and-overrun.md`.

### New compared columns (they are NOT optional)

`objn`, `objord`, `objlive` are in the standard state vector on every run.
`docs/knowledge/06` names "object slots processed" the field most likely to be
missing from inherited tooling and the one that decides whether slowdown can be
retrofitted, so it is in the vector before wave 4 has an object driver at all.

* **The top-level object driver is main-loop call #2, `$2410BC`** (build A:
  `$1413FE`), whose only caller is the loop head. **20 slots x $50 bytes at
  `$80E240..$80E87F`**, type word at +$00 (0 = empty), priority at +$4A, unique
  ID at +$4C, dispatch through a 20-entry 8-byte table at `$240F62`.
  **The loop is `moveq #$13,D0 / ... / dbra`: no budget test, no time test.**
* Allocation is a staged create queue (`$241182`, cap 20, **full = return a
  DUMMY record at `$80D51C` and silently drop the spawn**) committed in priority
  order by `$24111E`, whose insert **memmoves the tail DOWN and destroys the
  last slot**. Deletion (`$2411E2`) memmoves it UP. **Slot indices are not
  stable identities; the ORDER is semantics.** `objord` hashes the sequence.
* `pgm.py objdriver` prints all of it, derived by `derive.py` from the image
  with the whole 0x2C-byte driver shape asserted on both builds.

### TWO DEFECTS IN THE WAVE-1 HARNESS, both found by the overrun control

1. **`work` was 0 on half of every run.** `M.time.attoseconds + M.time.seconds *
   1e18` overflows int64 at 10 emulated seconds, and `work` is guarded by
   `rel_t > 0`. Measured: 1,254 of 2,600 frames. `over_budget` on the same
   NOPS=60000 run read **275** before the fix and **624** after. Cycles are now
   computed exactly: `seconds*20000000 + attoseconds//50000000000`.
2. **The dead-stack boundary was one page too high.** Wave 1 carved only
   `$81FF00..$81FFFF` out as `d_top`; measured, 49 writer PCs reach into the
   `$81FE00` page (including the BIOS IRQ4/IRQ6 trampolines `$000CA6`/`$000CBE`)
   and the deepest push seen is `$81FE36`. `d_ram` had been hashing ~256 bytes
   of stack residue. `RAM_LEN` is now `$1FE00`, `d_top` is 512 bytes, and a
   **guard tap on `$81FD00-$81FDFF` FAILS the run** if the stack goes deeper.

**Both changes move every digest in the corpus.** The gate scenario's hash:

```
wave 1:  13f8ef743e0b3a53dbcf0ae36278dbe2defc4b514e0219fe1d8f834481841382
wave 2:  635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
         (still IDENTICAL across two runs; stack_guard_hits=0)
```

### And a correction to the lag census

`gated_zero_release` counts logic frames with `rel == 0`. **That is not the
(A)-gate firing count.** A dilated logic frame sees N vblanks and gets exactly
ONE release; the other N-1 IRQ6s take the gate. The count is `sum(irq6 - rel)`.
On the forced-overrun run `gated_zero_release` read **1** while the gate fired
**614** times.

### How the overrun is forced

MAME's `-speed` is a HOST throttle and changes no emulated cycle. A per-CPU
clock scale is **not reachable from MAME 0.288** (the Lua `device` usertype has
no clock member, `manager.ui` has no slider list, there is no command-line
option, and the binary has no `<slider>` cfg node -- the "Overclock CPU %s"
slider is UI-only). So `PROBE_INJECT="nops:fromLF"` writes a **NOP sled** into
the decrypted `:maincpu` image at `$340000` -- inside the 68000's ROM window,
past the end of the 2 MiB program -- and repoints one main-loop `jsr` operand at
it. A nop pushes nothing, clobbers no register, sets no flag.

`pgm.py overrun` runs the **0-nop control first** and refuses to report a sweep
unless the only columns that moved are `cyc`, `work`, `spin` and `d_top`.
**Every number it prints is MAME-timed, UNCALIBRATED, and a MECHANISM result.**

---

## WAVE 3 — the asset gates, and one finding that changes what an oracle frame means

Full evidence: `docs/worklog/ddpdoj/03-impl-asset-export-with-teeth.md`.
The asset pipeline has its own note: **`games/ddpdoj/NOTES-assets.md`**.

### New commands (all through this same harness, VERSION-B, build-asserted)

```
python pgm.py gfx        THE GFX GATE: 16 state+framebuffer pairs over boot AND
                         stage 1, our decoder vs MAME, 100.0000 % or FAIL --
                         and FAIL, not skip, if fewer than 12 pairs were dumped
python pgm.py gfx --mutate all    six mutations, every one must go RED
python pgm.py zoomcov    ALL 16 zoom-table entries x grow/shrink x axes x flips
python pgm.py sprites    harvest every sprite `offs` the game uses (the atlas)
python pgm.py sound      the sound map: mailbox -> keyon, the Z80 blob, ICS in order
python pgm.py check      THE CHECK RUNNER, cheapest first, SKIPS COUNTED
python pgm.py check --break-decoder u19-at-200000     see the runner RED
```

`pgm.py check` measured, on a fresh extraction of the ROMs from `ddpdojblk.7z`:
`ALL GREEN -- 10 passed, 0 failed, 0 SKIPPED`, and with `--break-decoder`:
`FAILURES -- 7 passed, 1 failed, 0 SKIPPED`.

### `bg_scale` is now watched on EVERY run, and it tripped immediately

```
CENSUS bg_scale writes=4 non_0210=2 values_written[0210:2 0610:2]
                values_seen_per_frame[0210:2600]
BGSCALE vf=0 lf=0 value=0610 pc=0065E2
```

`$0065E2` is in the PGM BIOS and both writes are at `lf=0`: **the BIOS programs a
non-100 % background scale during boot**, and MAME does not implement the
register (`igs023_video.cpp:193`). Those boot frames are rendered without a
feature the hardware has. Nothing in the corpus compares them, so it is a WARN;
a non-0x210 value **at a sample point**, or any non-0x210 write after the first
logic frame, is a FAIL. `gfxgate.py` also fails any frame pair drawn with
`bg_scale != 0x210` outright.

### The one that matters beyond assets: what a "state dump" can and cannot be

**MAME's `draw_sprites` does not re-read `:igs023:spritebuffer` at draw time.**
Poking that share with the sprite DMA disabled put our list in the dump and left
MAME drawing the game's sprites (92.64 %, and the framebuffer PNG showed the
game's explosion, not our grid). The share is an OUTPUT of the DMA; the draw uses
what the DMA parsed. On the natural corpus the two always agree — which is
exactly why the decoder can be validated against the share — but any future
intervention has to go into the game's own list in main RAM, at the sample point.

And **the zoom table reaching the draw is latched one frame AHEAD of the sprite
buffer**: a table changed mid-run costs exactly one frame pair (measured, 978
pixels, and re-scoring that pair against the previous frame's table gives
100352/100352). Where MAME latches it was not established, so the zoom-coverage
runs hold the table constant and run twice instead of modelling the offset.

### Sprite-list peak, again

`CENSUS max_sprite_entries=122` on the gate scenario. Wave 0 saw 95, wave 1 saw
133. **The 256 cap has still never been reached, and that still says nothing
about what happens at it.**
