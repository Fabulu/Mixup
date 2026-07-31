# RECON 5 of 5 — the two hard systems: slowdown and rank (DaiOuJou / ddpdojblk)
status: DONE (slowdown instrument built and calibrated) / BLOCKED (rank unresolved; no overrun reached)
wave: 0   role: recon   started: 2026-07-31

## The task, as I understood it

Not to SOLVE slowdown or rank. To establish **how they would be measured**, so
nobody designs an architecture that cannot express them. Specifically:

SLOWDOWN — which of the three mechanisms of `docs/knowledge/06` this hardware
does (A dropped updates / B time dilation / C partial completion of an object
loop); is it deterministic; what the real signal is (NOT consecutive-framebuffer
comparison, already falsified); and **does the game's own logic observe it**
(does any counter or RNG advance per LOOP ITERATION rather than per frame).

RANK — the table in `docs/knowledge/08`: what feeds it, where computed, WHO
READS IT, does it reach SPAWNS, how many thresholds, can it go down, what resets
it. With the rule: **the LISTING establishes the complete reader set; measurement
can only prove presence.**

## Environment, as measured at the start

```
$ ls "/c/Users/Fabian Trunz/AppData/Local/Mixup/mame/" | grep -E 'mame.exe|unidasm'
mame.exe
unidasm.exe          <-- the listing tool. Present. This is what makes the
                         static half of the rank question possible today.
```

MAME 0.288. ROM path `C:\oldpcsx2`.

**The ROM directory changed under me mid-session** (another agent is working in
this tree). At 20:47 it held `ddpdojblk.zip`, `ddpdojblk2.zip` and
`ddpdojblk.7z`; by 21:00 the two zips had been renamed
`ddpdojblk.zip.SHADOWED-bad-nv` / `ddpdojblk2.zip.dup-of-above`, leaving the
`.7z`. **Everything I measured before ~20:56 was taken on the bad-NVRAM set and
is invalid — see "The first result was of a halted machine" below.** Every
number below the line was re-measured after the change.

```
$ mame.exe -rompath C:\oldpcsx2 -verifyroms ddpdojblk
ddpdojblk   : ddp3_igs027a.bin (16384 bytes) - NOT FOUND - NO GOOD DUMP KNOWN
romset ddpdojblk [ddp3] is best available
1 romsets found, 1 were OK.
```

## What I did

New code, all mine, all under `games/ddpdoj/tools/hard/` (a private directory —
another agent was creating `games/ddpdoj/tools/oracle/` and `tools/pgm.py` at the
same minute, and a shared module that changes mid-run makes a measurement
unreproducible):

| file | what it does |
|---|---|
| `hardrun.py` | headless MAME runner for the PGM sets |
| `boot.lua` | inventory + interrupt census + interrupted-PC histogram + raster-register tap |
| `dump.lua` | writes the DECRYPTED `:maincpu` region to `out/` for unidasm |
| `nvcheck.lua` | why the machine halts: the NVRAM magic gate |
| `loop.lua` | main-loop landmark hunt |
| `work.lua` | the LOAD METER + sprite-list writer map |

`games/ddpdoj/tools/hard/.gitignore` ignores `out/` in the same breath, per the
worklog rule. `out/` holds the decrypted 68000 image and every probe report —
ROM-derived, never committed.

## What I MEASURED

### 0. The first result was of a HALTED MACHINE — trap 4, live

The first two runs (600 and 10,000 video frames) reported a beautiful, stable
signal: only **six** distinct interrupted PCs in 9,988 interrupts, 9,983 of them
at `$13C398`/`$13C39A`.

```
video_frames=10000 irq4_vector_fetches=9988 irq6_vector_fetches=9988
distinct_interrupted_pcs=6
interrupted_pc=13C39A n=4992 first_irq6=6
interrupted_pc=13C398 n=4991 first_irq6=5
raster_reads=0
```

Disassembling the decrypted image showed what `$13C398` is:

```
13c330: cmpi.l  #$36982136, $803800.l
13c33a: bne     $13c382
13c33e: cmpi.l  #$76349621, $803804.l
13c348: bne     $13c382
...
13c382: move.w  #$2, D0
13c386: lea     ($13c39c,PC), A0        ; the string at $13c39c is "ROM ERROR ! "
13c38c: jsr     $1564aa.l               ; print it
13c398: nop
13c39a: bra     $13c398                 ; <-- halt forever
```

So that run measured a machine sitting in a **"ROM ERROR" halt loop**, and every
number it produced (including `raster_reads=0`) was worthless. `pgm.cpp:5359`'s
note that Black Label *"expects Magic values in NVRAM to boot"* is exactly this
gate, and `NOTES-versions.md`'s live question — "a wrong `.nv` may be the
difference between an unlocked set and a locked one" — is now answered for the
stronger case: **with the bad `ddp3blk_defaults.nv`, ddpdojblk does not boot at
all.** With the `.7z` copy it does:

```
$ python hardrun.py nvcheck.lua --seconds 20 --env HARD_NV_AT=300
sram_region@0x3800=98363621347621960100020100010100     (region is word-swapped)
mainram@0x803800=36982136763496210001010201000001
magic_expected=36982136,76349621 got=36982136,76349621
cpu PC=13C6BC CURPC=13C6BA SP=81FFFC
```

Magic present, gate passed, CPU somewhere else entirely.

**Lesson for the folder, and it is `02-traps.md` §4 verbatim: a probe that
reports a clean, stable, plausible signal from a game that is not running looks
exactly like success.** The thing that caught it was disassembling the address
the probe kept pointing at instead of quoting the count.

### 1. The machine, from the booted set

```
mame=0.288 romname=ddpdojblk
screen 448x224 refresh_as=16896000000000000 refresh_hz=59.1856060606
devices=:,:ics,:igs023,:maincpu,:mono,:palette,:prot,:rtc,:scantimer,:screen,
        :soundcpu,:soundlatch1,:soundlatch2,:soundlatch3,:sram
shares=:arm7_shareram:64 :igs023:bg_videoram:4096 :igs023:rowscrollram:4096
       :igs023:spritebuffer:4096 :igs023:tx_videoram:8192 :igs023:zoomram:64
       :palette:5120 :sram:131072 :z80_mainram:65536
regions=:ics:16777216 :igs023:10485760 :igs023:sprcol:33554432
        :igs023:sprmask:16777216 :maincpu:6291456 :prot:16384 :sram:131072
cpu_state_names=A0..A6,CURFLAGS,CURPC,D0..D7,IR,PC,SP,SR,USP
cpu_spaces=cpu_space,program
vector_irq4@70=00000CA6 vector_irq6@78=00000CBE
```

`refresh_hz=59.1856060606` confirms `NOTES-machine.md`'s derivation from the
running machine, and `:prot` IS in the device list even though it is
`set_disable()`d.

### 2. The frame architecture, read out of the decrypted image

```
$0CA6  move.l $801470,-(A7) ; rts      BIOS IRQ4 trampoline -> RAM vector
$0CBE  move.l $801478,-(A7) ; rts      BIOS IRQ6 trampoline -> RAM vector
```

Both interrupt handlers are **BIOS trampolines that RTS to an address the game
stores in RAM** (`$801470` for IRQ4, `$801478` for IRQ6). Any hook on the game's
own interrupt code must read those two longwords at runtime; they are not
static.

The main context's frame boundary:

```
13c6ac: 13fc 0002 0080 3940   move.b  #$2, $803940.l
13c6b4: 4a39 0080 3940        tst.b   $803940.l     <-- THE VBLANK WAIT LOOP
13c6ba: 66f8                  bne     $13c6b4
13c6bc: 4e75                  rts
13c6be: 13fc 0001 0080 3940   move.b  #$1, $803940.l   (second entry: wait 1)
```

`$803940` is the frame-sync flag; the caller writes the number of vblanks to
wait and spins until an interrupt handler zeroes it. **Two entry points, one
writing 2 and one writing 1** — i.e. the game has a "wait two vblanks" mode,
which is a 29.6 Hz cadence on a 59.19 Hz display. That is a scheduling fact the
port has to carry, and it is not slowdown.

Measured confirmation, 1,786 IRQ6s over 1,800 video frames:

```
stackframe irq6=600  SP=81FFF6 SR=2600 stack=[2000 0013 C6BA 0013] CURPC=13C6B4
stackframe irq6=1200 SP=81FFF6 SR=2600 stack=[2000 0013 C6BA 0013] CURPC=13C6B4
```

The 68000 group-2 exception frame is `[SR][PC_hi][PC_lo]`, so the interrupted PC
is `$13C6BA` — inside the wait loop — on both samples. **Reading the interrupted
PC off the supervisor stack at the vector fetch works, and it is game-agnostic.**

A counter that advances with the game's own frame:

```
13be8c: 5279 0080 390a       addq.w  #1, $80390a.l
13be92: 0879 0000 0080 390d  bchg    #$0, $80390d.l
13be9a: 5279 0080 390e       addq.w  #1, $80390e.l
13bea0: 0c79 0003 0080 390e  cmpi.w  #$3, $80390e.l
```

`$80390A` is a 16-bit free-running counter, `$80390D` bit 0 a 2-phase alternator
and `$80390E` a mod-3 phase. Measured delta per video frame over 1,800 frames:

```
ctr_803A0A_delta_per_video_frame 0 -> 24 frames      (boot, before it starts)
ctr_803A0A_delta_per_video_frame 1 -> 1774 frames
ctr_803A0A_delta_per_video_frame 65139 -> 1 frames   (one init write, not a wrap)
final_ctr_80390A=06EE
```

So in the attract state it is exactly 1 per video frame. **Whether it is driven
per interrupt or per main-loop iteration is the whole question and is measured
in §3 by write-site attribution, not assumed.**

### 3. The SECOND trap: the 68000 prefetch, and it read as "the game never runs"

Every execution hook in the first version of `work.lua` was gated on
`CURPC == tapped address` — the discriminator `capability_probe.lua` uses on the
6502 and the one that is **wrong on the 68000**. `NOTES-slowdown-oracle.md` §3a
already records why (the tap fires on the *prefetch*, one to two instructions
ahead of `CURPC`) and I walked into it anyway. Result:

```
video_frames=1500 irq6=1486 spin_iterations_total=0
loop_head_fetches=0
```

i.e. "the game executes neither its main loop nor its wait loop" — while the
write-tap in the same run showed `$80390A` being incremented 1,483 times from
`$13BE8C`. Two counters in one script disagreeing is what caught it.

**Rule for this machine, written where the next person will hit it: on the
68000, do not filter execution hooks by CURPC. Tap only the FIRST word of the
instruction and count raw fetches; one fetch is then one execution.** With that
fix the same taps read exactly as expected.

### 4. THE FRAME ARCHITECTURE — and it is not what a port would guess

The complete main loop, disassembled and confirmed by xref (`$13BE8C` has
exactly one caller in the whole image, at `$13C358`):

```
13c356: jsr $13BE8C     frame counters: $80390A++ ; bchg #0,$80390D ; $80390E mod 3
13c35c: jsr $1562F0
13c362: jsr $1413F6
13c368: jsr $145F1C
13c36e: jsr $13D61A
13c374: jsr $13C5B6     FRAME SYNC -- sets $803940 and spins at $13C6B4
13c37a: jsr $13D496     runs AFTER the vblank wait
13c380: bra $13C356
```

Seven top-level calls, five before the vblank wait and one after it. Both
interrupt handlers are BIOS trampolines through RAM vectors:

```
$0CA6  move.l $801470,-(A7) ; rts        IRQ4  (scanline 0)
$0CBE  move.l $801478,-(A7) ; rts        IRQ6  (vblank)
```

so a hook on the game's own interrupt code has to read those two longwords at
runtime — they are not static addresses. Measured: IRQ4 and IRQ6 each dispatch
**exactly once per video frame**, on 9,987 of 10,000 frames (the other 13 are
before interrupts are enabled).

The frame sync is *not* a plain "wait for vblank". `$13C5B6` is:

```
13c5b6: move.b #$1, $803940       ; frames to wait
13c5be: tst.w  $80390e            ; the mod-3 phase from $13BE8C
13c5c4: bne    $13c6b4            ; -> spin
13c5c8: tst.w  $80392e            ; a countdown
13c5ce: beq    $13c5dc
13c5d2: subq.w #1, $80392e
13c5d8: bra    $13c6ac            ; -> move.b #$2,$803940 : WAIT **TWO** VBLANKS
...
13c6ac: move.b #$2,$803940
13c6b4: tst.b  $803940 ; bne $13c6b4      THE WAIT LOOP
13c6be: move.b #$1,$803940
```

and the IRQ side releases it with `13c806: subq.b #1,$803940 ; jmp $13c4fc`.

**There is a software frame-rate divider here — a code path that waits TWO
vblanks — gated on a mod-3 phase counter and a countdown, entirely independent of
how long the frame's work took.** Anyone modelling "DaiOuJou runs at 59.19 Hz"
will be wrong wherever that path is taken, and it will look exactly like
slowdown. It is not.

### 5. THE LOAD METER, and it works

`$13C6B4` is `tst.b $803940` — the head of the wait loop. One opcode-fetch tap
there counts **spin iterations per video frame**: how much of the frame the game
spent with nothing left to do. Measured over 5,000 video frames:

```
main_loop_iterations=4982  wait_spin_fetches=49806134
loop_iters_per_video_frame       0:18 1:4982
ctr_80390A_delta_per_video_frame 0:16 1:4982 65139:1
spin_iters_per_video_frame_bucketed 0:18 6000:2 7000:2 8000:1 9000:4297 10000:16 11000:39 12000:625
frames_with_zero_spin=16          <- frames 1..16 only, i.e. boot
distinct_interrupted_pcs=7
interrupted_pc=13C6BA n=3143
interrupted_pc=13C6B4 n=1838
```

Two independent readings of the same quantity that must agree, and do:
`main_loop_iterations` (an opcode-fetch tap on `$13C356`) and
`ctr_80390A_delta` (a RAM counter read at the frame boundary) are both 1 per
video frame on the same 4,982 frames.

**This is the detector `docs/knowledge/06` asks for and the one
`NOTES-slowdown-oracle.md` §4 says the framebuffer hash cannot be.** It is
continuous, not binary: ~9,000–12,000 idle iterations means a nearly empty
frame; the number falling toward 0 is the frame filling up; **0 with the
interrupted PC outside `$13C6B4/$13C6BA` is an overrun.** It costs one tap.

### 6. Does the game's own logic observe the slowdown? — the mechanism is there

`$80390A`, `$80390D` bit 0 and `$80390E` (mod 3) are incremented **inside the
main loop body**, at `$13BE8C`, whose only caller in the image is the loop head
`$13C356`. They are *not* incremented by the interrupt handler.

So they count **loop iterations, not vblanks**. In every state measured so far
the two coincide exactly (1:1 on 4,982 of 4,982 non-boot frames) — but the
coupling is the thing: if the loop ever fails to complete within a frame, these
counters fall behind the display, and `$80390E` in particular is read *by the
frame sync itself* (`13c5be: tst.w $80390e`). That is a per-loop-iteration
counter feeding back into scheduling.

`$80390A` alone has **83 absolute-long reference sites** across the image
(`xref.py`), spread from `$13Bxxx` to `$18Fxxx`. It is not a debug counter.

**Status of the headline question: the MECHANISM by which the game's own logic
observes its own pace is present and located. Whether an overrun actually
occurs in play, I have not yet reached — see "What I could not do".**

### 7. The raster register `$B07000`

`NOTES-machine.md` flagged the IGS023's read-only current-raster-line register
as the hardware route by which the program could time itself. A read tap on it
counted **0 reads** in every run: 10,000 frames (halted machine, worthless),
1,500 frames and 5,000 frames of a booted machine.

**This is a PRESENCE measurement returning nothing, which proves nothing.**
`docs/knowledge/08`: only the listing can prove absence. The static xref for
`$00B07000` has not been run and the register can also be reached through an
address register, which the xref cannot see. **Do not write "the game does not
read the beam position" anywhere.**

### 8. Getting into the game at all — two more output-not-throw lessons

`ddpdojblk` does **not** boot into an attract loop. Framebuffer snapshots
(`scr:snapshot`) show:

* frame 600 — a **VERSION SELECT** menu: `1: VERSION-A (OLD)` /
  `2: VERSION-B (NEW)`, `SELECT = UP or DOWN`, `START = SHOT`, on a 5-second
  countdown that falls through to VERSION-A;
* frame 1500 — the Japan-only legal screen, `2002.04.05.MASTER VER` — i.e. the
  timeout picked the **old** version, not Black Label's own build.

**The port target's own ROM contains two selectable game versions and the
default is the one that is NOT Black Label.** Any corpus scenario must state
which arm it took.

And the first 5,000-frame "gameplay" run, which pressed 1P-START and SHOT
together, spent the whole time in the board's **INPUT TEST** screen — total
sprite entries emitted: 59. It reported clean, plausible numbers throughout.
Only the snapshot showed it.

Scripted `coin, coin, start` after selecting a version does reach the game: the
frame-1700 snapshot is the **DOLL SELECT** screen with a live countdown.

### 9. THE STRUCTURAL HEADLINE: ddpdojblk's program ROM holds TWO GAMES

Scripting `down` then `shot` at the version menu (i.e. choosing
`2: VERSION-B (NEW)`) moved every interrupted PC from `$13Cxxx` to `$23Cxxx`:

```
distinct_interrupted_pcs=33
interrupted_pc=23C396 n=5120
interrupted_pc=23C390 n=3143
interrupted_pc=13C6BA n=439      <- before the choice, at frame 702
interrupted_pc=13C6B4 n=245
```

and every one of my `$13xxxx` landmarks went dead
(`main_loop_iterations=685` out of 9,000 frames) while the RAM counter
`$80390A` kept advancing 1 per frame (`ctr_80390A_delta 1:8948`).

**The RAM layout is shared between the two builds; the code is not.** Byte-exact
pattern searches over the decrypted image:

```
addq.w #1,$80390a : 2 sites -> 0x13be8c, 0x23be8c
tst.b  $803940    : 10 sites -> 13c5ac 13c6b4 13c6c6 13c7e6 13d478
                                23c208 23c390 23c3bc 23c44c 23d10c
subq.b #1,$803940 : 2 sites -> 0x13c806, 0x23c46c
```

and the two main loops, both found by xrefing the *unique* caller of each
build's counter routine:

| | VERSION-A ($1xxxxx) | VERSION-B ($2xxxxx) |
|---|---|---|
| counters (`$80390A++`) | `13BE8C` | `23BE8C` |
| call 2 | `1562F0` | `256D5A` |
| call 3 | `1413F6` | `2410BC` |
| call 4 | `145F1C` | `24683E` |
| call 5 | `13D61A` | `23D2AE` |
| **frame sync** | `13C5B6` | `23C212` |
| post-vblank call | `13D496` | `23D12A` |
| loop head / tail | `13C356` / `bra` at `13C380` | `23BFDC` / `bra` at `23C006` |
| wait loop | `13C6B4` | `23C390` |
| sprite-entry emitters (`move.l (A1)+,(A0)+` ×2 + `move.w`) | `13DA02 1498B6 149910 14996A 1499D0 1805B8 180866` | `24A242 24A29C 24A2F6 24A35C 28156C 28187E` |

Same seven-call shape, **different addresses with no constant offset** (per-call
deltas run from +0xFFC5C to +0x100C94), so this is two builds, not a mirror.

And exactly one control-flow crossing exists between them:

```
$13C0DE:  jmp $23BEEA          the ONLY abs-long jmp/jsr from $1xxxxx into $2xxxxx
```

(measured by scanning every `4EF9`/`4EB9` in `$100000-$1FFFFF` for a target in
`$200000-$2FFFFF`: 1 hit).

**Consequence for the plan, and it is not small: "port Black Label" means
porting the `$2xxxxx` build. Every address in this worklog's §4-§6 is the
VERSION-A build and is the wrong target** — they are still useful, because the A
build is a free second implementation of the same design to cross-check a
reading against, which is a luxury this project has never had.

### 10. The raster register, static half

```
$ python xref.py 0x00B07000
=== xref 0xb07000: 4 absolute-long occurrences ===
  0x1ba51a  0x1ba559  0x2bbad4  0x2bbb13
```

**Two of the four are at ODD file offsets, which cannot be 68000 instruction
operands**, and disassembly around all four shows a data region
(`1ba500: ae70 dc.w; 1ba502: move.l ($713a,A3),(A0); 1ba506: ab70 dc.w`) — a
table, not code. So: **no code site in the image reaches `$B07000` by
absolute-long addressing**, and the read tap counted 0 in every booted run.

That is as far as it can honestly be pushed. A pointer in an address register
would be invisible to both halves. The correct sentence is "no absolute-long
reference and no observed read", never "the game does not read the beam".

### 11. DETERMINISM — measured on this game, not inherited

Two identical 3,000-video-frame runs of the same scripted scenario (version
select → coin → start → autofire), each emitting a **per-frame** trace line of
`frame / loop-iterations / spin-iterations / sprite-entries / clear-fetches /
$80390A`:

```
$ sha256sum out/det1.txt out/det2.txt
64eb7f6a25bedbd1415f843752ce9274cba50a0baac205117f84abcfb8cdc236 *out/det1.txt
64eb7f6a25bedbd1415f843752ce9274cba50a0baac205117f84abcfb8cdc236 *out/det2.txt
$ wc -l out/det1.txt
3036 out/det1.txt
```

**Bit-identical, including the load meter.** So on this driver — 68000 + Z80 +
(disabled) ARM7, three devices in MAME's scheduler — the same inputs produce the
same work profile. Frame-exact verification of slowdown is possible here. This
is the ddpdoj-specific version of a claim `NOTES-mame-oracle.md` had only
measured on the NES.

**Not tested:** `-drc` vs `-nodrc` (the ARM7 is disabled on this set, so there
may be no DRC in play at all), and determinism across MAME's other host knobs.

### 12. THE LOAD METER UNDER REAL PLAY — and what it did and did not show

12,000 video frames, VERSION-B, scripted into stage 1 with autofire (framebuffer
snapshots at 2,600 and 5,000 confirm dense on-screen action; the 11,000 snapshot
is the title screen again, so the run also contains a death and a game-over):

```
video_frames=12000 irq6=11980 main_loop_iterations=11247
loop_iters_per_video_frame       0:753 1:11247        <- the 753 are boot+menu
ctr_80390A_delta_per_video_frame 0:66 1:11931
spin_iters_per_video_frame_bucketed1000
   0:772 1000:14 2000:27 3000:74 4000:437 5000:1006 6000:484
   7000:717 8000:273 9000:651 10000:7034 11000:79 12000:432
frames_with_spin_lt_1000=55
low_spin_frames=1010,1012,1204,1562,1620,3713,3716,3717,3720,3724,3725,...,3848
```

Read that carefully, because it is the whole slowdown answer for this session:

* **The meter has enormous dynamic range and it responds to content.** Idle
  spin iterations run ~10,000–12,000 on a quiet frame and fall to under 1,000
  on 55 frames — one isolated cluster, `f3713–f3848`, i.e. a specific ~2.3
  second stretch of stage 1. That is a frame going from ~10% utilised to >90%
  utilised, visible per frame, from one tap.
* **No overrun occurred.** `loop_iters_per_video_frame` is 1 on every one of the
  11,247 post-boot frames — never 0, never 2 — and every interrupted PC in the
  gameplay portion is `$23C390`/`$23C396`, the wait loop. So on everything this
  corpus reached, the game finished its frame every frame.
* **Therefore I cannot yet name which of (A)/(B)/(C) this game does under
  overload, because I never overloaded it.** What I can say is what the
  ARCHITECTURE permits, which §13 sets out.

### 13. Which mechanism the architecture can express

From the code, not from the run:

* **(A) dropped updates is not what this structure does.** There is no lag flag
  gating subsystems. The main loop calls its seven routines unconditionally and
  then waits.
* **(B) time dilation is the natural failure mode.** The loop's five work calls
  run, then `$23C212` sets `$803940` and spins at `$23C390` until the vblank IRQ
  decrements it. If the work takes longer than a frame, the wait is simply
  already satisfied and the next iteration starts late — the whole game state
  advances less often in wall-clock time, uniformly. That is textbook (B).
* **(C) partial completion is not visible at the site I found.** The sprite
  emitter's loop in build B ends:

  ```
  23d6b4: move.l D1,(A0)+          ; the 5-word IGS023 entry
  23d6b6: move.l (A1)+,(A0)+
  23d6b8: move.w (A1)+,(A0)+
  23d6ba: move.b (A1)+,D3
  23d6be: move.b D3,(-$6,A0)
  23d6c4: addi.w #$c,D2
  23d6c8: subi.w #$c,D0
  23d6cc: bne    $23d67a           ; count-driven exit, no time or budget test
  ```

  A **data count in D0**, not a budget. **This is one site, not the object
  driver**, and it is a presence observation — it does not license "the game has
  no (C) anywhere". The top-level object loop has not been located.

The object system's code map, produced by measurement (write tap over the
`$800000-$8009FF` sprite list with CURPC attribution, 4,200 frames of play):

```
sprite_list_writer_sites=38 (top of 38)
sprwriter pc=23D6B4 n=441370 off=800000..800642     <- build B's sprite emitter
sprwriter pc=23D6B6 n=441370 off=800004..800646
sprwriter pc=23D6B8 n=220685 off=800008..800648
sprwriter pc=23D6BE n=220685 off=800004..800644
sprwriter pc=23D6EE n=6896   off=800000..80064C
sprwriter pc=23D680 n=5396   off=8001FE..8005FC
sprwriter pc=23C65C n=1280   off=800000..8009FE     <- the full-list clear
sprwriter pc=13C9C8 n=1280   off=800000..8009FE     <- build A's clear
sprwriter pc=000E5C..000E7A n=80 each               <- the BIOS blitter
sprite_writes_per_frame_bucketed200 0:2057 200:252 400:1078 600:704 800:106 1000:1 1200:2
```

**The (C) detector is one tap away from existing**: put a fetch tap on the
object driver's per-slot instruction and read the slot index out of a register
at that point (`cpu.state["D0"]` etc. — §3b of `NOTES-slowdown-oracle.md` proved
registers are readable at a hook). What is missing is the address, not the
capability.

### 14. RANK — what the ROM itself calls rank

The title screen (framebuffer snapshot, frame 11,000) prints **`RANK : NORMAL`**
along with `1ST 20000000PTS / 2ND 20000000PTS` and `C BUTTON FULL-AUTO`. So the
game uses the word "rank" for its own operator difficulty setting.

Byte search over the decrypted image:

```
b'RANK'      : 8 hits -> 0x15b3cf 0x15b3ee 0x15b40f 0x15b42c   (build A)
                        0x25c05b 0x25c07a 0x25c09b 0x25c0b8   (build B)
```

and the strings, with a 4-entry pointer table immediately before them:

```
00 15 B3 C6  00 15 B3 E6  00 15 B4 06  00 15 B4 26      (table at 0x15B3B6)
"         RANK: EASY         "
"        RANK: NORMAL        "
"         RANK: HARD         "
"      RANK: VERY HARD       "
```

**So the operator rank setting has exactly FOUR values: EASY / NORMAL / HARD /
VERY HARD** — a measured answer to one row of `docs/knowledge/08`'s table, for
the *static* setting.

Neither pointer table (`$15B3B6`, `$25C042`) has a single absolute-long
reference anywhere in the image, so both are reached PC-relative or through a
base register — which is the same limitation §10 hit, and the reason the next
step for rank is a **read tap on the table with CURPC attribution**, not more
scanning.

**I did not find a dynamic rank.** I did not locate the RAM byte holding the
setting, did not enumerate its readers, and have no measurement bearing on
whether DaiOuJou also has a runtime-varying difficulty value. Everything in
`docs/knowledge/08`'s table except "how many thresholds (static setting): 4" is
**unanswered**.

## What I could not do, and why

1. **I never made the game overrun.** The corpus reached stage 1 with autofire
   and a death; the heaviest 2.3 seconds took the frame to >90% utilised and no
   further. Without an overrun I cannot say by measurement whether the game does
   (B) cleanly or has (A)/(C) behaviour hiding inside it. What exists now is a
   calibrated meter and a baseline, which is what the next attempt needs.
2. **I did not locate the top-level object driver**, only the sprite-list
   emitter it feeds. So the (C) detector — "object slots processed: 0..N", which
   `docs/knowledge/06` names the field most likely to be missing — is **not yet
   in the state vector**. It is the single most important thing still owed.
3. **Rank is unresolved beyond the four-value operator setting** (§14).
4. **I could not close any ABSENCE claim.** The absolute-long xref covers 1,310
   distinct RAM addresses over 16,463 sites, but the sprite emitter at `$13DA02`
   / `$23D6B4` is `move.l (A1)+,(A0)+` — invisible to it. Any "nothing reads X"
   sentence needs the register-relative case closed first, and none is.
5. **`-drc` vs `-nodrc` not compared**, and cross-emulator validation of the
   timing (`06-lag-and-slowdown.md`'s two-emulators lesson) is impossible: there
   is no second PGM emulator on this machine.
6. **The environment changed under me.** The ROM directory was being edited by
   another agent while I measured (§0). Everything before ~20:56 in this session
   is void. If a future run disagrees with a number here, check what
   `ddpdojblk` resolves to first.

## If someone picks this up cold

Start here:

```
cd games/ddpdoj/tools/hard
python hardrun.py scen.lua --seconds 200 --env HARD_FRAMES=4200 \
  --env HARD_LOOP=0x23BFDC --env HARD_WAIT=0x23C390 --env HARD_EMIT=0x24A242 \
  --env "HARD_SCRIPT=560:down:6,600:shot:6,1000:coin:8,1100:coin:8,1200:start:8,1500:shot:6,1560:shot:6,1700:shot:6" \
  --env HARD_AUTOFIRE=1900 --env HARD_SNAPAT=2600 --env HARD_SPRITEMAP=1
```

That boots ddpdojblk, chooses **VERSION-B (NEW)**, coins up, starts, plays, and
prints the load meter plus the sprite-list code map. `out/` is gitignored;
`out/maincpu_ddpdojblk.bin` is the decrypted 68000 image and is what `xref.py`
and `unidasm.exe` read. Regenerate it with `dump.lua` if it is missing.

Five things that will save you the hours they cost me:

1. **Take a snapshot in every run and LOOK AT IT.** Two separate runs produced
   clean, plausible, entirely worthless numbers — one from a machine halted on
   "ROM ERROR", one from the board's INPUT TEST screen.
2. **Do not gate 68000 execution hooks on CURPC.** Prefetch. Tap the first word
   of the instruction and count raw fetches.
3. **`ddpdojblk` contains two games.** `$1xxxxx` = VERSION-A (OLD), `$2xxxxx` =
   VERSION-B (NEW); the boot menu chooses, the timeout picks A, and the only
   crossing is `$13C0DE: jmp $23BEEA`. Landmarks are per build.
4. **The frame flag is `$803940` and the loop counter is `$80390A`, and both are
   shared by the two builds.** The counter advances once per MAIN LOOP
   ITERATION, not once per vblank — that is the coupling that makes slowdown a
   state change rather than a pace change.
5. **There is a software 2-vblank path** (`move.b #$2,$803940` at `$13C6AC` /
   `$23C248`, gated on `$80390E` mod 3 and `$80392E`/`$803930`). It is a
   deliberate frame-rate divider, not slowdown, and it will look exactly like
   slowdown to anything that only counts frames.

