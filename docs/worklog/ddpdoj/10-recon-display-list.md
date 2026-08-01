# WAVE 10 RECON 1/5 — the sprite request pipeline

status: **DONE** on the pipeline mechanics, the bucket map, the cap and the zoom
table; **PARTIAL** on naming all 20 top-level dispatch entries; **BLOCKED** on
proving what each bucket DRAWS in pixels (the ablation experiment is specified
below and was not run).
wave: 10   role: recon   started: 2026-08-01

Target: **`ddpdojblk`, VERSION-B** (2002.10.07 BLACK VER). Every address is
build B unless the line says build A. Machine pin printed on every run:
`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 bytes.

New tools (all under `games/ddpdoj/tools/`, none of them edits `src/`):

| file | what it does |
|---|---|
| `w10/buckets.py` | the drain order out of call #4, the 29 staging buffers, their derived capacities, every enqueue stub and its absolute-long callers |
| `w10/stubs.py` | every `addi.w #$c,$80AFxx` keyed on the PC a write tap reports, plus every other abs-long reference to `$80AFC0..$80AFFB` |
| `oracle/w10bucket.lua` + `w10/runbucket.py` | the runtime bucket census: per-bucket pending records per logic frame, the pre-emptive overflow policy, the runtime cap, emitted entries and fillers, `$80B054` |
| `oracle/w10zoom.lua` + `w10/runzoom.py` | the zoom table's contents and the EFFECTIVE zoom-index census over the whole display list |

## THE HEADLINE

```
python games/ddpdoj/tools/w10/runbucket.py stage1-open      (2,600 logic frames)
  TOTAL   pending records max=120   (hard cap $BC4=251, pre-emptive test $BD0=252)
  OVERFLOW frames_total>=252recs=0  preemptive_drop_bucket20=0
           preemptive_drop_b6b9=0   runtime_cap_carry=0
  EMIT    hardware entries max/frame=120  fillers max/frame=2
  B054    1 distinct values of $80B054: 00000000:1901
  13 of the 30 request sources are used at all in the stage-1 opening

python games/ddpdoj/tools/w10/runzoom.py stage1-deep        (5,000 logic frames)
  ZOOMRAM 1 distinct table contents over 5000 logic frames
  ZOOMRAM 55555555 55155555 55155515 15155515 15151515 15111515 15111511
          11111511 11111111 11011111 11011101 01011101 01010101 00010101
          00010001 00000000
  EFF x index 16 distinct: 01:2790 02:18 ... 08:1099 ... 0F:34 10:201205
  EFF y index 16 distinct: 01:549  02:18 ... 07:2245 08:1099 0A:2439 0F:18 10:198904
  LIST entries_total=205434 max_len=133
```

**THE ZOOM TABLE QUIRK IS A HARDWARE FACT. REPRODUCE IT.** §6.

---

## 1. What main-loop call #4 (`$23D2AE`) actually does

The display list is **not** built by anything walking objects. It is a
**29-bucket gather with a pre-emptive overflow policy**, and the whole of it
lives in `$23D2AE..$23D724`. In execution order:

| step | ROM | what |
|---|---|---|
| a | `$23D2AE` | `jsr $23C1A2` — clears bit 0 of `$80393C` (an IRQ/section flag). Not sprite work |
| b | `$23D2B4..$23D366` | **the SUM**: `$80AFC0` + the 29 bucket counters `$80AFC2..$80AFFA`, in *counter-address* order (NOT drain order) → D0 = total pending BYTES |
| c | `$23D36E/$23D37C/$23D398` | `bsr $240ADC` three times — **`$240ADC` is a bare `rts`**. A stripped profiling hook. Three dead calls, four more later. They cost cycles and nothing else |
| d | `$23D372..$23D38C` | `D0 -= $BD0`; store to `$80B000` (bytes over budget) and `$80B000/12` to `$80AFFE` (records over budget) |
| e | `$23D39C..$23D3DE` | **THE PRE-EMPTIVE OVERFLOW POLICY** — see §4 |
| f | `$23D3E0..$23D622` | **THE DRAIN**: 29 × `lea BUF,A0 / lea CTR,A1 / bsr $23D726 / bcs $23D624`, in a fixed hand-written order |
| g | `$23D624..$23D6CC` | **THE EMIT**: queue → `$800000`, 12-byte request → 10-byte hardware entry, one filler inserted every 52 records |
| h | `$23D6E8..$23D6FC` | the terminator — **skipped if the list is exactly full** |
| i | `$23D70C..$23D71C` | clear all 30 counters (`moveq #0,D1 / move.w #$1D,D0 / move.w D1,(A0)+ / dbra`) |
| j | `$23D71E` | `jsr $23C194` — sets bit 0 of `$80393C` back |

Measured cost, wave 2: **15,594 cycles mean**, against call #2 (the object
driver) at 77,725. Call #4 is ~4.6 % of the frame.

## 2. The record format — 12-byte REQUEST in, 10-byte HARDWARE ENTRY out

### 2a. The enqueue: object record → 12-byte request

Every one of the ~130 per-record enqueue stubs is the same 14 instructions.
`$23D762` (the direct-to-queue one) verbatim, A6 = the caller's object record:

```
23d762: lea $80397C,A0 / adda.w $80AFC0,A0     the destination
23d76e: lea ($2,A6),A1
23d772: move.l (A1)+,D0        D0 = [A6+2..A6+5]
23d774: swap D0
23d776: add.w  (A1)+,D0        D0.lo = word@A6+2 + word@A6+6
23d778: swap D0
23d77a: add.w  (A1)+,D0        D0.lo = word@A6+4 + word@A6+8
23d77c: asr.l  #6,D0           1/64-px FIXED POINT -> PIXELS, on the WHOLE LONG
23d77e: andi.l #$07FF03FF,D0
23d784: ori.l  #$80008000,D0   BOTH grow bits set, BOTH zoom fields 0 = NO ZOOM
23d78a: move.l D0,(A0)+        request words 0,1
23d78c: move.l (A1)+,(A0)+     request bytes 4..7   <- (A6+$A) long
23d78e: move.w (A1)+,(A0)+     request bytes 8..9   <- (A6+$E) word
23d790: move.w ($1c,A6),(A0)+  request bytes 10..11 <- (A6+$1C) word
23d794: addi.w #$c,$80AFC0
```

**So the source object record's sprite fields are fixed by the ROM and a port
does not get to choose them:**

| field | meaning |
|---|---|
| `(A6+$2)` word | LONG-axis position, 1/64 px (the game's "vertical"; on the TATE glass this is the bitmap's **X**) |
| `(A6+$4)` word | SHORT-axis position, 1/64 px |
| `(A6+$6)` word | LONG-axis offset, added before the shift |
| `(A6+$8)` word | SHORT-axis offset |
| `(A6+$A)` long | hardware words 2 and 3 — `pri` bit 7, `offs` bits 22..16, `offs` low 16 |
| `(A6+$E)` word | hardware word 4 — `width` (bits 14..9), `height` (bits 8..0) |
| `(A6+$1C)` word | its **two bytes are OR-ed together** at emit time into hardware word 2's HIGH byte = flip (14,13) + color (12..8) |

Three traps in fourteen instructions:

1. **`asr.l #6` is on the whole 32-bit register**, so the long axis's low 6 bits
   bleed into the short axis's top 6 bits and are then removed by the `$03FF`
   mask. A port doing two independent 16-bit shifts gets the same answer only
   because of that mask. Translate the long form.
2. **`ori.l #$80008000` sets both GROW bits with both zoom fields zero.** That is
   the NO-ZOOM encoding (`0x10 - 0 = 0x10` → `zoom_word()` returns 0). `zom=0,
   grow=0` would be a real zoom, table entry 0. Measured: 201,205 of 205,434
   records in `stage1-deep` are exactly this (§6).
3. The enqueue masks the short axis to **`$03FF`**; the emit re-masks it to
   **`$3FFF`** *after* adding `$80B054` (§2b). Bits 13..11 of that field are the
   ZOOM field. See the warning in §2b.

There are **three** enqueue conventions, not one:

* **per-record stubs**, ~130 of them, the shape above. Some are preceded by
  `movem.l D0/A0-A1,-(A7)` (register-preserving variants) — same body.
* **`$23D9E2`**, a *zooming* variant: it builds the flags in D6 from two
  PC-relative jump tables (`$23E54A`) indexed by `($E,A6)` and `or.l D6,D1`
  instead of `ori.l #$80008000`, so the zoom/flip/colour fields come from the
  object rather than being hard-zero.
* **BULK writers**: a loop writing `(A4)+` that sets the counter *at the end*
  from the pointer difference — `suba.l (A7)+,A4 / move.w A4,$80AFxx`.
  `$28A098`→`$28A198` (bucket 20), `$281D9A`→`$281DCE/$281DD6` (buckets 22 and
  23). **Bucket 23's counter `$80AFE2` has no `addi` stub at all** and would be
  invisible to a scan that only looked for the common shape.

### 2b. The emit: 12-byte request → 10-byte hardware entry

```
23d696: move.l (A1)+,D3           request words 0,1
23d698: move.l D3,D1
23d69a: andi.l #$F800F800,D3      keep grow+zoom of BOTH words
23d6a0: andi.l #$07FF3FFF,D1      keep the two position fields
23d6a6: add.l  $80B054,D1         A 32-BIT ADD, not two 16-bit adds
23d6ac: andi.l #$07FF3FFF,D1
23d6b2: or.l   D3,D1
23d6b4: move.l D1,(A0)+           hardware words 0,1
23d6b6: move.l (A1)+,(A0)+        hardware words 2,3
23d6b8: move.w (A1)+,(A0)+        hardware word 4
23d6ba: move.b (A1)+,D3 / or.b (A1)+,D3
23d6be: move.b D3,(-$6,A0)        -> hardware word 2's HIGH byte
```

* **`$80B054` is a global position offset added to every sprite in the frame.**
  Measured `$00000000` on all 1,901 build-B frames of `stage1-open` — but it has
  writers at `$240CE0` (inside `$240CC0`, the *IRQ-gated* BG-scroll routine) and
  at `$260E4A/$260E6C/$260E8E/$260EB0/$260EFC/$260F26`. **Presence, not
  coverage: this recon never saw it non-zero and cannot say it never is.**
* **The short axis is masked to `$3FFF` here, 14 bits, but the hardware field is
  10 bits and bits 13..11 are the ZOOM field.** A position that overflows 10 bits
  after the `$80B054` add — a negative short-axis coordinate, for instance — will
  OR garbage into the zoom nibble. Not observed (because `$80B054` was 0 and the
  enqueue pre-masks to `$03FF`), and worth a standing assertion in the port.
* `add.l` means a carry out of the short axis propagates into the long axis.
* The last two request bytes are **OR-ed**, then written *over* the byte the
  preceding `move.l` already placed. A port that copies the request straight
  through and then patches gets the same answer; one that skips the patch loses
  flip and colour entirely.

### 2c. Fillers and the terminator

```
23d676: moveq #$33,D4                 ; 51
23d67a: subq.w #1,D4 / bcc $23D696
23d67e: moveq #$32,D4                 ; 50 thereafter
23d680: move.l #$FC003800,(A0)+ / move.l #0,(A0)+ / move.w #$201,(A0)+
```

One fixed filler entry every 52 records. **251 records + 5 fillers = 256**, the
IGS023 maximum — the two numbers are designed against each other, re-confirmed
here from the listing and measured (`fillers max/frame=2` at 120 records).

```
23d6e8: cmpi.w #$BC4,D1
23d6ec: beq $23D6FE          <-- SKIP THE TERMINATOR
23d6ee: move.l #0,(A0)+ / move.l #0,(A0)+ / move.w #0,(A0)+
```

**If exactly 251 records are emitted, NO terminator is written.** The list runs
to the hardware's own 256-entry limit. A port that unconditionally writes a
terminator is wrong in exactly the case that only happens when the screen is
full.

## 3. THE 29 BUCKETS — the drain order IS the depth order

`$23D3E0..$23D622`, read out of the ROM by `w10/buckets.py`; capacities derived
from consecutive staging-buffer addresses; the last three columns measured over
`stage1-open`, 1,901 build-B frames.

**A HIGHER display-list index draws IN FRONT** (`00-recon-assets.md` §3, and
`src/render/igs023.js` walks `i = length-1 … 0` with first-drawn-wins). The
queue is filled bucket 0 first and drained #1…#29, and the emit copies the queue
FORWARD into ascending list indices. **Therefore drain position = depth: bucket 0
is furthest BACK, drain #29 is furthest FRONT.**

| drain | staging buffer | counter | cap (recs) | max | mean | frames≠0 | who feeds it (abs-long callers = LOWER BOUND) |
|---:|---|---|---:|---:|---:|---:|---|
| 0 | `$80397C` (the queue itself) | `$80AFC0` | 502 | **100** | 27.38 | 1595 | `$23D762` (10 sites, `$267CB2 $267ED0 $267F68 $269058 $2755B2 $2799A6 $27C7FE $27CA9C $27CAAE $27CB72` — enemy code), `$23D88E` (5 sites `$24D56E…` — the option object), `$23DECE` (83 sites `$258062 $25B4E6 $25BF40 $25C3B0 …`), `$23DFB4`, `$23E2F2` |
| 1 | `$805104` | `$80AFC2` | 251 | 3 | 0.34 | 419 | `$23D79E` (4), `$23DEFC` (26, `$262848 $262B96 …`) |
| 2 | `$805CC8` | `$80AFC4` | 251 | 3 | 0.36 | 286 | `$23D7DA` (6), `$23D916` (1), `$23DF2A` (35, `$2623F4 …`) |
| 3 | `$80688C` | `$80AFC6` | 251 | 7 | 0.32 | 301 | `$23D816` (8), `$23DF58` (34, `$262A44 $266048 $26959E $26BF3A $26D2BE …`) |
| 4 | `$8083D4` | `$80AFCC` | 25 | 0 | 0 | 0 | `$23E9D8` (2, `$2810A2 $2810B4`) |
| 5 | `$80862C` | `$80AFD0` | 6 | 3 | 0.44 | 280 | `$23EFC0` (1, `$249EE2` — the player block) |
| 6 | `$808674` | `$80AFD2` | 20 | 0 | 0 | 0 | `$23EC84 $23ECFC $23ED84 $23EDE0` (bsr only) — **sacrificed second** |
| 7 | `$807450` | `$80AFC8` | 251 | **18** | 1.87 | 1035 | `$23D852` (10, `$269E16 $273C94 $274E4E $275A24 $277CA6 $278634`), `$23DF86` (29, `$25F5E0 $265690 $26EDF2 $2709xx`) |
| 8 | `$808014` | `$80AFCA` | 80 | 0 | 0 | 0 | `$23EBA0` (13, `$27FAB2 … $281xxx`), `$23EC20` (4) |
| 9 | `$808764` | `$80AFD4` | 20 | 0 | 0 | 0 | `$23ECC0 $23ED40 $23EDB2 $23EE16` — **sacrificed second** |
| 10 | `$80A864` | `$80AFE8` | 10 | 0 | 0 | 0 | 8 stubs, bsr only |
| 11 | `$80AD8C` | `$80AFF0` | 10 | 0 | 0 | 0 | 8 stubs, bsr only |
| 12 | `$80AF24` | `$80AFEA` | 10 | 0 | 0 | 0 | `$23FDB2 $23FDE8` |
| 13 | `$80A8DC` | `$80AFEC` | 90 | 0 | 0 | 0 | `$23FF06` (5, `$255F44 $25613x`), `$23FF42` (3) |
| **14** | `$808854` | `$80AFD6` | 72 | **20** | 5.02 | 574 | `$23F3AE` (23 sites, **`$253B40 $253BD2 $253C08 $253CBA $253D4A $253E42 …` = the player-shot handlers**) |
| 15 | `$808EB4` | `$80AFDA` | **4** | 2 | 0.59 | 561 | `$23F2CA` (7, `$24C8B4 $24CCC6 $24CDB6 $24CFB0 $24D17E $24D1F8 $24D27A` = **the OPTION object `$24C096`**) |
| 16 | `$808BB4` | `$80AFD8` | 64 | 0 | 0 | 0 | `$23F508` (9, `$2548BA $25497C $254A56 … $25514C`) |
| 17 | `$808500` | `$80AFCE` | 25 | 1 | 0.06 | 123 | `$23EB06` (9, `$27EAC4 … $27F66E`) |
| 18 | `$80AEAC` | `$80AFF8` | 10 | 0 | 0 | 0 | `$240A5A` (4, `$287374 $2873F4 $287452 $2874D2`) |
| **19** | `$808EE4` | `$80AFDC` | 16 | 3 | 0.60 | 599 | `$23F104` (2, `$24A538 $24A6C4`), `$23F1FA` (2, `$24A532 $24A632`) — **the player's own block** |
| **20** | `$808FA4` | `$80AFDE` | 60 | **24** | 2.00 | 460 | the BULK writer `$28A098` → `$28A198/$28A1B4/$28A1D0` — **SACRIFICED FIRST** |
| 21 | `$80A624` | `$80AFE4` | 16 | 0 | 0 | 0 | `$23F896` (4, `$2698C4 $2698E2 $2698F6 $269906`) |
| 22 | `$809274` | `$80AFE0` | 210 | 0 | 0 | 0 | BULK `$281D9A`→`$281DCE`; also `$23F746` (7), `$23F782` (4), `$23F7C6` (2) |
| 23 | `$809C4C` | `$80AFE2` | 210 | **11** | 0.80 | 431 | BULK `$281D9A`→`$281DD6` — **no `addi` stub exists for this bucket** |
| 24 | `$80AF9C` | `$80AFFA` | 3 | 0 | 0 | 0 | `$23FE5C $23FE92` |
| 25 | `$80A6E4` | `$80AFE6` | 32 | 5 | 1.50 | 633 | `$23FA96` (21 sites, `$28490E $284AB0 … $2856CC` — the `$284/$285xxx` block wave 5 named as the BOMB's callees) |
| 26 | `$80AD14` | `$80AFEE` | 10 | 0 | 0 | 0 | 8 stubs, bsr only |
| 27 | `$80AE04` | `$80AFF2` | 10 | 0 | 0 | 0 | 8 stubs, bsr only |
| 28 | `$80AE7C` | `$80AFF4` | 2 | 0 | 0 | 0 | `$240892` (2, `$2529BC $252A48`) |
| 29 | `$80AE94` | `$80AFF6` | 2 | 0 | 0 | 0 | `$240976` (2, `$252AC8 $252B3C`) |

**377 absolute-long call sites reach the enqueue family**, and that is a lower
bound — a `bsr` or a call through a register is invisible to it. Ten of the
thirty buckets have **zero** abs-long callers and are fed entirely by `bsr`.

Three of these identifications are cross-confirmed by an independent number and
are the ones I would build on first:

* **bucket 14 = the player's shots.** Its max is **20 records/frame**; wave 5's
  completely separate census of the 36-slot shot driver `$253A70` reported
  `SHOT live per logic frame max=20`. Same number, two instruments.
* **bucket 15 = the two option pods.** Capacity **4 records**, measured max **2**,
  fed only by `$24C096`'s handler — and there are exactly two pods.
* **bucket 19 = the player ship.** Fed only from `$24A5xx/$24A6xx`, inside the
  player object's own block, max 3.
* **buckets 22 and 23 = the ENEMY BULLETS.** Their only feeder is the bulk
  writer `$281D9A`, and its first act is `clr.w $81B40C` before the emit loop —
  `$81B40C` is one of the three terms wave 5 found the frame-sync governor
  `$23C272` summing (`$81B40C + $81295C + 2*$81295E`), the second of which wave 5
  identified as the live **player-shot** count. So `$81B40C` is the live
  **enemy-bullet** count, the two 210-record buckets are what it counts, and they
  drain at #22/#23 — near the very front, which is how DDP looks.

And the depth ordering that falls out of them is a sanity check on the whole
"higher index = front" rule: shots (#14) behind options (#15) behind the ship
(#19). That is what the game looks like.

**Two orderings exist and they are independent.** The object table's `+$4A`
priority (from the dispatch table's per-type word, `$240F62+4`) decides which
HANDLER RUNS FIRST. The bucket decides where its sprites LAND IN DEPTH. They
coincide only for bucket 0, whose records are appended in object-execution order.

### The queue's real geometry — a wave-5 number corrected

Wave 5 wrote *"the queue buffer `$80397C..$80AFBF` is 30,276 bytes ≈ 2,523
records, far larger than the cap"*. **That is wrong.** `$80397C` runs into
bucket 1's staging buffer at `$805104`, so the queue has **6,024 bytes = 502
records** before it starts overwriting bucket 1. Wave 5's `POKE $0B40` runs
reached 355–365 records = `$1A94..$1B24` bytes → `$805410..$8054A0`, which **is
inside bucket 1's staging area**. It happens to be harmless — bucket 1 is drained
FIRST, so by the time the pointer gets there its records are already copied, and
the counters are zeroed wholesale the next frame — but the reasoning that made
it safe was not the reasoning wave 5 gave, and the 2,523 figure should not be
quoted again.

## 4. THE CAP — there are TWO policies, and the first one is design, not accident

### 4a. The PRE-EMPTIVE policy (`$23D39C..$23D3DE`) — this is the interesting one

```
23d372: subi.w #$BD0,D0            $BD0 = 3024 bytes = 252 records
23d382: move.w D0,$80B000
23d38c: move.w D0/12,$80AFFE
23d39c: clr.w $80B002 / clr.w $80B004
23d3a8: tst.w $80B000 / bmi $23D3E0        under budget -> drain everything
23d3b0: move.w $80AFDE,D0 / clr.w $80AFDE  DROP BUCKET 20 ENTIRELY
23d3bc: move.w #$1,$80B002
23d3c4: sub.w D0,$80B000 / bmi $23D3E0     enough? -> drain
23d3cc: clr.w $80AFD2 / clr.w $80AFD4      DROP BUCKETS 6 AND 9 ENTIRELY
23d3d8: move.w #$1,$80B004
```

**Before anything is copied, the game decides in advance which whole categories
of sprite it is willing to lose.** Bucket 20 (`$808FA4`, 60-record capacity, fed
by the bulk writer `$28A098` inside top-level type 5) is the designated first
sacrifice; buckets 6 and 9 (`$808674`, `$808764`, 20 records each) are the
second. Nothing else is ever pre-emptively dropped. **That is gameplay: a
specific class of object is chosen by hand to vanish when the screen is full,
and it is the same class every time.**

`$80B002` and `$80B004` are the flags saying it happened. `xref.py abs` finds
**four** absolute-long sites for each — two writes in build B's call #4, two in
build A's — and **no reader anywhere**. Same for `$80AFFE` (`$23D38E` writes it,
`$13D6FA` in build A, nothing reads it) and `$80B000` (written and read only
inside call #4). They are telemetry. Absolute-long is a lower bound, so this is
"I found no reader", not "nothing reads them".

### 4b. The RUNTIME cap (`$23D726` / `$23D75A`) — wave 5's result, re-derived

Confirmed unchanged: `$23D746 cmpi.w #$BC4,$80AFC0 / beq $23D75A`, EQUALITY not
`>=`; `$23D75A` zeroes the current bucket's remaining count and sets carry; all
29 drain sites `bcs $23D624`, so **the current bucket's remainder and every
later bucket are abandoned wholesale**. In depth terms — and wave 5 did not say
this — **what is abandoned is the FRONT-MOST part of the picture**, because the
later a bucket drains the closer to the viewer it draws.

### 4c. Does it ever fire? Measured: NO, not in natural play

```
TOTAL   pending records max=120  (cap 251, pre-emptive test 252)
OVERFLOW frames_total>=252recs=0 preemptive_drop_bucket20=0
         preemptive_drop_b6b9=0  runtime_cap_carry=0
```

Over 1,901 build-B frames of `stage1-open` the total never exceeded **120 of
251**. Wave 5 reached the cap only by poking `$80AFC0`, and that intervention
also makes the emitter re-read stale bytes, so it is not a clean measure of
*which* sprites are lost. **The clean experiment exists and I did not run it:**
zero one bucket's counter at the sample point and diff the framebuffer against
the control. That both identifies what every bucket draws AND exercises the drop
path with the rest of the frame untouched. It is one `PROBE_*` env var in
`frame.lua` plus a pixel diff, and it is the single highest-value follow-up in
this recon.

## 5. THE 20 TOP-LEVEL DISPATCH ENTRIES — what I established

`$240F62`, 8-byte entries `{handler long, priority word, 0}` (wave 2). Every one
of the 20 handlers opens with the same three lines — `tst.b ($2,A5) / beq <init>`
and usually `cmpi.b #$2,($2,A5) / beq <teardown>` — so **`(A5+$2)` is the object's
lifecycle state: 0 = construct, 2 = destruct, anything else = run.**

Wave 5 measured the live set over lf1960..2600: types `10, 2, 1, 5, 11, 4, 4, 0`
at priorities `1F 1C 1A 18 0A 09 09 09`. Those eight are what the stage-1
opening needs.

| # | handler | pri | what it is (evidence) |
|---|---|---|---|
| 0 | `$28D520` | 09 | `jsr $2842B0 / $28444E`; the init path at `$28D566` clears `$81DEBE..` (0x77 words) and `bset` s `$81DF1E` bits 0 and 3 — a screen/section manager |
| 1 | `$26127A` | 1a | reads `$8130D2`, `$813180/82/84`, calls `$26146C` and `$262062`, writes `($1C,A5)/($22,A5)` — **not identified** |
| **2** | `$2491C0` | 1c | **PLAYER 1.** `lea $8103E6,A6` (the player record), `lea $8104AA,A2` (the option pair), `ori.w #$1,$813090`, `jsr $253A1E` |
| 3 | `$249246` | 1b | **PLAYER 2**, the same code against `$810448` / `$81050E` / `$253A3A` |
| 4 | `$260B30` | 09 | a 4-entry PC-relative state machine at `$260B6A`; **two instances live at once** in the opening |
| **5** | `$28B5E0` | 18 | **THE WEAPONS/ENEMY SUBSYSTEM LIST.** Wave 5 counted 15 `jsr`s; it is **23**, `$28B5E6..$28B66A`: `$289B80 $2634F4 $28AD54 $27F95A $288E4E $2890F2 $255DD8 $253A70 $24C096 $254680 $255042 $28A098 $2527CE $24A458 $24A46C $24A440 $24A44C $27E99E $252BD0 $281D9A $25354C $25292A $252A52`. Then, NOT a `jsr` and therefore easy to miss, the **collision block** at `$28B670`: `tst.w $81308C / move.w $8103E6,D4 / lea $810572,A0` (the shot table) `/ lea $811EF2,A1 / lea $811802,A2 / lea $811892,A3 / lea $8103E6,A4` (the player) `/ ... / jmp $244D62` |
| 6 | `$28D63C` | 0a | calls `$28EDC0 / $28E7E6 / $25FD38 / $25FD0C / $27F8C4`, touches `$81DF1E`, `$812972` — a mode/flow manager |
| 7 | `$290BE8` | 1e | `lea $81E0DC,A6`, PC-relative jump table at `$290C8E` on `($8,A6)` |
| 8 | `$25A770` | 0a | reads `$812E56`, `$803808` (an operator byte), calls `$24107C` (the object-table INIT) — the boot/attract sequencer |
| 9 | `$25CACA` | 0a | `lea $812EA0,A6`, `moveq #1,D7` — a 2-slot driver dispatching on `($1,A6)` to `$25D306/$25D402/$25D39C/$25D4F0/$25D560` |
| **10** | `$260794` | 1f | **THE STAGE/SCROLL DIRECTOR.** `$8130CA = $80390A & $E` (an animation phase), `addq.l #1,$8130C6` (a 32-bit stage clock), `jsr $2608D2 / $288610`, sets `$81B414` |
| 11 | `$25DBB4` | 0a | `jsr $28D53C` then `$260ACA / $260A88 / $260A9A` on `($7,A5)` |
| 12 | `$28F3AC` | 09 | dispatches on `($5,A5)` bits to `$28F3F8` / `$28F450`; `lea $81E056,A4` |
| 13 | `$288A60` | 0b | reads `$803809` (operator byte), `$813098`, `$813092`; `jsr $25FE00 / $27F8E6 / $25FD82` |
| 14 | `$288C6C` | 14 | a counted animation on `($10..$1A,A5)`, `jsr $28CB4C / $242E24` |
| 15 | `$291F66` | 1e | `jsr $291DF4`, reads `$81E120`, PC-relative table at `$291FD8` |
| 16 | `$256E7A` | 1e | not disassembled |
| 17 | `$25CEB8` | 0a | not disassembled |
| 18 | `$24902A` | 0a | not disassembled |
| 19 | `$28EE88` | 1e | not disassembled |

**A WAVE-5 DEFECT, CORRECTED.** `05-impl-enemies-and-weapons.md`'s "seven
things", item 1, says *"The enemies are 58 records at `$81332C` driven by
`$263502`, reached from **type 10**"*. Measured here:

```
$ python xref.py callers 263502        (nothing)
$ python xref.py dasm 2634F4 24
  2634f4: move.l A5,-(A7) / bsr $2633BE / bsr $263502 / movea.l (A7)+,A5 / rts
$ python xref.py callers 2634F4
  $28B5EC  jsr $2634F4
```

`$28B5EC` is the second `jsr` of `$28B5E0` = **dispatch entry [5]**. Wave 5's own
§"why blocked" item 4 says type 5 and its summary says type 10; the summary is
the wrong one. **The enemies, the player's shots, the options, the bomb and the
first-sacrificed bucket 20 are ALL inside one top-level handler, type 5.**

## 6. THE ZOOM TABLE — HARDWARE FACT. Reproduce it.

### The MAME comment, fetched verbatim

`src/mame/igs/igs023_video.cpp` (`raw.githubusercontent.com/mamedev/mame/master/`,
read 2026-08-01), inside `get_sprites()`:

```cpp
if (xgrow)
{
//  xzom = 0xf - xzom; // would make more sense but everything gets zoomed slightly in dragon world 2 ?!
    xzom = 0x10 - xzom; // this way it doesn't but there is a bad line when zooming after the level select?
}
...
// some games (e.g. ddp3) have zero in last zoom table entry but expect 1
// is the last entry hard-coded to 1, or does zero have the same effect as 1?
m_sprite_ptr_pre->xzoom = (xzom < 0x10) ? (xzom == 0xf) ? 1 : ((u32(m_zoomram[xzom*2]) << 16) | m_zoomram[xzom*2+1]) : 0;
m_sprite_ptr_pre->yzoom = (yzom < 0x10) ? (yzom == 0xf) ? 1 : ((u32(m_zoomram[yzom*2]) << 16) | m_zoomram[yzom*2+1]) : 0;
```

MAME states the question and does not answer it. Two things settle it from here.

### (a) The table, from the ROM and from the running machine — they agree

The zoom table is **ROM data uploaded once**, not computed:

```
23c5c8: lea $B01000,A0 / lea ($23C588,PC),A1 / move.w #$F,D0
23c5d6: move.l (A1)+,(A0)+ / dbra D0,$23C5D6
```

`$23C588`, 16 longwords. The identical 64-byte blob occurs three times in the
image: **`$00DF2C` (the BIOS), `$13C8F4` (build A), `$23C588` (build B)**.

```
 [0] 55555555 pop=16      [8] 11111111 pop=8
 [1] 55155555 pop=15      [9] 11011111 pop=7
 [2] 55155515 pop=14      [A] 11011101 pop=6
 [3] 15155515 pop=13      [B] 01011101 pop=5
 [4] 15151515 pop=12      [C] 01010101 pop=4
 [5] 15111515 pop=11      [D] 00010101 pop=3
 [6] 15111511 pop=10      [E] 00010001 pop=2
 [7] 11111511 pop=9       [F] 00000000 pop=0     <-- the ramp says 1
```

`w10zoom.lua` read `:igs023:zoomram` at the sample point of every logic frame
and got **one distinct table over 5,000 frames**, byte-identical to the ROM
literal. So for the port the zoom table is a constant blob — with the standard
caveat that 5,000 frames of stage 1 is presence, not coverage, and `$B01000`'s
only writer found is this one.

**The table is a monotone popcount ramp 16, 15, 14 … 2 — a Bresenham-even
distribution of N set bits across 32.** Entry `$F` is the one place the ramp
breaks, and the value that would continue it is a 32-bit word with **exactly one
bit set: `0x00000001`**. That is precisely the constant MAME substitutes.

### (b) The game DOES reach effective index `$F`

Effective index = `zom` when `grow == 0`, `0x10 - zom` when `grow == 1`.
Over `stage1-deep`, 5,000 logic frames, 205,434 display-list records:

```
EFF x index 16 distinct: 01:2790 02:18 03:32 04:18 05:32 06:18 07:32 08:1099
                         09:34 0A:18 0B:34 0C:18 0D:34 0E:18 0F:34  10:201205
EFF y index 16 distinct: 01:549  02:18 03:18 04:18 05:18 06:18 07:2245 08:1099
                         09:18 0A:18 0B:18 0C:18 0D:18 0E:18 0F:18  10:198904
```

* **97.9 % of all records are index `$10` = NO ZOOM** (`grow=1, zom=0`), which is
  exactly what the enqueue's `ori.l #$80008000` produces. That is the encoding
  trap `NOTES-assets.md` §2 warned about, measured.
* **Index `$F` occurs: 34 x-records and 18 y-records in 5,000 frames.** It is
  reached both ways (`grow=1,zom=1` 18×, and `grow=0,zom=$F` 16× on the x axis).
* The flat 18-per-value bands across `$02..$0E` are one scripted sweep, not
  gameplay. The 800-frame `chooser` scenario shows **`EFF x/y index 1 distinct:
  10:1201`** — no zoom at all during boot — so the sweep and the `$F` records are
  somewhere after the chooser and before lf5000. **I did not bracket it further.**
* Natural gameplay zooms are `$01`, `$07`, `$08`, `$0A`. Wave 3's "the corpus
  covers entries 1 and 0xa" is confirmed by a second instrument, and extended:
  `$07` and `$08` are natural too.

### The classification

**HARDWARE FACT — reproduce it.** The argument, stated so it can be attacked:
the table is an arithmetic ramp whose last term is missing; the value MAME
inserts is exactly the term the ramp predicts; three independently-built program
images (the PGM BIOS and both games on this cartridge) ship the same zero; and
the game really does index that entry. If the ASIC used the literal 0 there, a
sprite at that zoom level would lose every source pixel and vanish, not shrink.
**What I cannot do is measure the silicon.** This is inference from the ROM plus
MAME's behaviour, not a hardware capture, and it should be labelled that way
wherever it is quoted.

The port already does the right thing — `src/render/sprites.js` `zoomWord()`
returns `1` for `z === 0xf` — but there is **no gate on it**: `zoomcov`'s
coverage table treats `$F` as one of sixteen anonymous combinations. Making it a
NAMED case with a red-validated mutation (`zoom-f-literal`, i.e. read the table
value 0 instead of substituting 1) is a small, well-specified unit and is listed
below.

## 7. What I could NOT do, and why

1. **I did not prove what any bucket DRAWS in pixels.** Buckets 14, 15 and 19 are
   identified by two independent numbers each and I would build on those; every
   other identification in §3 is "the callers live in this address range", which
   is a lead, not a measurement. The ablation experiment in §4c settles all 30 in
   one run and I did not run it.
2. **Five of the twenty dispatch entries are unopened** (`$256E7A`, `$25CEB8`,
   `$24902A`, `$28EE88` and, in substance, `$26127A`). Three of those five are
   not in wave 5's live set for the stage-1 opening, so they are not on the
   critical path — but "not in the live set over lf1960..2600" is a statement
   about one window of one scenario.
3. **`$80B054` was zero in every frame I measured.** It has six writers I did not
   disassemble, one of them inside the IRQ-gated `$240CC0`. If it is ever
   non-zero the emit's `add.l` and the `$3FFF` short-axis mask become live and
   the zoom-field-pollution hazard in §2b becomes real. Not closed.
4. **I did not localise the effective-index-`$F` frames.** They are after the
   800-frame `chooser` window and inside 5,000 frames of `stage1-deep`. A
   per-frame TSV instead of a histogram would name them; `w10zoom.lua` would need
   four more lines.
5. **The caller lists in §3 are absolute-long only.** Ten of thirty buckets have
   none at all and are fed entirely by `bsr`. A static `bsr`-target scan of
   `$200000-$2A0000` per stub — the same scan wave 5 ran for `$23D726` and got 29
   hits — would close this and I did not run it.
6. **I did not re-run `pgm.py check`, `gate`, `flyaround` or `pixslice`.** This
   recon added two new Lua probes and two new Python drivers and edited nothing
   under `src/` or in the existing harness, so no corpus digest should have
   moved — but I did not prove that, and the next commit should.
7. **The `$23D9E2` zooming enqueue variant is read but not traced.** It is the
   only path that puts a non-zero zoom field into a request, so it is the only
   path that can reach the `$F` entry, and I did not enumerate its callers.

## 8. If someone picks this up cold

```
python games/ddpdoj/tools/w10/buckets.py              the bucket map, static
python games/ddpdoj/tools/w10/stubs.py                every counter-advancing PC
python games/ddpdoj/tools/w10/runbucket.py stage1-open the bucket census, live
python games/ddpdoj/tools/w10/runzoom.py stage1-deep   the zoom table + coverage
python games/ddpdoj/tools/oracle/xref.py dasm 23D2AE 400   call #4
python games/ddpdoj/tools/oracle/xref.py dasm 23D624 200   the emit
python games/ddpdoj/tools/oracle/xref.py dasm 23D762 60    one enqueue stub
```

**Seven things that will save you the hours they cost me:**

1. **`$240ADC` is a bare `rts`.** Seven `bsr`s in call #4 go there. They are a
   stripped profiling hook; do not go looking for what they record.
2. **The drain order is the DEPTH order**, and it is hand-written, not derived
   from any priority field. The object table's `+$4A` priority is a *different*
   ordering that decides which handler runs, not where its sprites land.
3. **Three enqueue conventions.** Per-record stubs (`addi.w #$c,$80AFxx`), the
   zooming variant `$23D9E2`, and BULK writers that set the counter from a
   pointer difference at the END. Bucket 23 has **only** a bulk writer, so a scan
   for the common shape reports it as unfed while the census shows 11 records a
   frame.
4. **The game decides IN ADVANCE what to sacrifice.** `$23D3B0` drops bucket 20
   whole, then `$23D3CC` drops buckets 6 and 9 whole, before a single record is
   copied. That is a designed degradation policy and it is gameplay.
5. **`asr.l #6` and `add.l $80B054` are 32-BIT operations across both coordinate
   fields.** Two independent 16-bit versions agree only because of the masks
   either side. Translate the long form.
6. **"No zoom" is `grow=1, zom=0`, not `zom=0`** — 201,205 of 205,434 measured
   records. And **zoom entry `$F` reads 0 from the table but must be treated as
   1**; the game reaches it 34 times in 5,000 frames, which is exactly rare
   enough that a natural corpus will tell you nothing is wrong.
7. **A full list has NO terminator.** `$23D6E8 cmpi.w #$BC4,D1 / beq` skips it at
   exactly 251 records.
