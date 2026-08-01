# WAVE 11 — THE DISPLAY-LIST KEYSTONE

status: **DONE** — every done-when in `PLAN-no-recordings.md` §W11 met, with
three of that section's own instructions corrected against the listing (§2) and
one gate (`pgm.py flyaround`) left RED for a reason that predates this wave and
belongs to W14 (§8.2).
wave: 11   role: implementer   started: 2026-08-01
target: **`ddpdojblk`, VERSION-B** (2002.10.07 BLACK VER). Every address is
build B unless the line says otherwise (`games/ddpdoj/NOTES-build-split.md`).
Machine pin printed on every run: `maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 B.

Brief: `games/ddpdoj/PLAN-no-recordings.md` §W11 — port main-loop call #4
(`$23D2AE`) WHOLE, with no producers; the enqueue API; the zoom table as a baked
constant with a boot assertion; the bucket ablation; the staged-bytes replay
gate at 0 divergent frames.

---

## THE HEADLINE

```
python games/ddpdoj/tools/oracle/pgm.py dlgate
  W11 pairs=1901 logicframes=2600 staged_bytes_max=1440
  W11 display_list_writer_pcs 10 distinct: 23D6B4 23D6B6 23D6B8 23D6BE 23D6EE
                                           23D6F4 23D6FA 23D680 23D686 23D68C
  ZOOM TABLE: the running machine matches the baked $23C588 blob on all 16
              entries; entry $F reads 00000000 and the port substitutes 1
  frames compared          1901  (lf700..lf2600)
  DIVERGENT FRAMES         0   (hardware-visible: 0)
  records max/frame        120 of 251
  RESULT: 0 DIVERGENT FRAMES

pgm.py dlgate --cap                    (bucket 1's counter poked to $BC4)
  W11 preemptive_drop_bucket20=600 preemptive_drop_b6b9=600 runtime_cap_carry=600
  records max/frame 251 of 251   entries max/frame 256 of 256   fillers max 4
  frames terminated 1901 of 1901
  RESULT: 0 DIVERGENT FRAMES

pgm.py dlgate --cap0                   (the QUEUE pointer poked to $B40)
  W11 preemptive_drop_bucket20=600 preemptive_drop_b6b9=600 runtime_cap_carry=0
  RESULT: 0 DIVERGENT FRAMES

pgm.py dlgate --reuse --break all      (the union of the three scenarios)
  cap-as-ge                RED on ['cap0']
  terminator-by-count      RED on ['cap', 'cap0']
  always-terminate         GREEN everywhere, as DECLARED
  no-preemptive-drop       RED on ['cap', 'cap0']
  drain-order-reversed     RED on ['open', 'cap', 'cap0']
  no-filler                RED on ['open', 'cap', 'cap0']
  filler-every-52-flat     RED on ['open', 'cap', 'cap0']
  b054-two-16bit-adds      GREEN everywhere, as DECLARED
  emit-mask-03ff           RED on ['open', 'cap', 'cap0']
  no-flip-patch            RED on ['open', 'cap', 'cap0']
  sum-without-queue        RED on ['open', 'cap', 'cap0']
  no-counter-clear         RED on ['cap']
  RED VALIDATION: every mutation behaved as declared
```

**THREE THINGS THE RECON GOT WRONG AND THE LISTING SETTLES.** §2 below. They are
not nitpicks: two of them are in the recon's "seven things that will save you
the hours they cost me" list, and one of them would have made the port write a
truncated display list on exactly the frames that matter.

---

## 1. WHAT WAS BUILT

| file | what |
|---|---|
| `src/displaylist.js` | main-loop call #4 whole: the sum, the pre-emptive drop policy, the 29-bucket drain with the equality cap and the abandon-the-tail carry, the emit, the terminator, the thirty-counter clear. Plus the standing short-axis assertion and the twelve declared mutations |
| `src/spritequeue.js` | REWRITTEN as the enqueue API: the 30-bucket table, ONE parameterised per-record stub for the ~130 copies, the zooming variant `$23D9E2` with its $23E54A scale table, and the bulk-writer convention |
| `src/zoomtable.js` | the `$23C588` blob as a baked constant, the popcount-ramp argument, `assertZoomTable` |
| `tools/oracle/w11dl.lua` | the probe: the staged bytes at `$23D382`, the display list at the arm, the emit's own record/filler/terminator counters, the display-list writer census, the ablation poke, framebuffer dumps |
| `tools/dlgate.mjs` | the staged-bytes replay gate, and `--census` |
| `tools/w11/bsrscan.py` | the `bsr`-target scan the recon left open (§4) |
| `pgm.py dlgate` / `pgm.py ablate` | the two new commands |
| `tests/displaylist.test.js` | 30 listing-derived unit tests, including the two cases the board cannot supply |

`node --test games/ddpdoj/tests/` — **142 tests, 142 pass** (was 101).

---

## 2. THREE CORRECTIONS TO `10-recon-display-list.md`, FROM THE LISTING

### 2a. THE TERMINATOR IS NEVER SKIPPED — the recon's §2c and its "seven things" item 7 are wrong

The recon reads

```
23d6e8: cmpi.w #$BC4,D1
23d6ec: beq $23D6FE          <-- SKIP THE TERMINATOR
```

as *"if exactly 251 records are emitted, NO terminator is written"*, on the
assumption that D1 still holds the byte count `$23D678 move.w D0,D1` put there.
**It does not.** D1 is clobbered twice on the way:

```
23d698: move.l D3,D1          inside the emit loop: D1 becomes the RECORD
...
23d6da: move.w #$12,D1        the tag argument of the SEVENTH dead bsr $240ADC
23d6de: bsr $240adc           ...which is a bare `rts`, so D1 survives as $12
23d6e2: move.w D0,$80afc0
23d6e8: cmpi.w #$BC4,D1       D1 == $0012.  Never $0BC4.
```

So the terminator is written at **every** length. Measured, not only read:
`pgm.py dlgate --cap` forces 251-record frames and the probe counts executions of
`$23D6FA` (`move.w #$0,(A0)+`, exactly one per terminator) — **1,901 of 1,901
frames terminated**, 600 of them at exactly 251 records.

The plan's mutation name `always-terminate` assumes the recon's baseline, so it
is a no-op here; it is DECLARED EXPECTED-GREEN with this reason rather than
dropped, and the mutation that carries the finding is **`terminator-by-count`**
(implement the recon's reading), which goes **RED on both forced scenarios**.

### 2b. 251 RECORDS CARRY FOUR FILLERS, NOT FIVE

`$23D676 moveq #$33` (51) then `$23D67E moveq #$32` (50), with a second
`subq.w #1,D4` at `$23D694` inside the filler path: the cadence is **51 records,
a filler, then one filler per 50**. At the cap that is 251 + 4 = 255 entries,
and the terminator makes **exactly 256** — the IGS023 maximum, which is a better
fit than the recon's "251 + 5 = 256" (which would already have been 256 without
the terminator). Measured on the forced scenario: `fillers max 4`,
`entries max 256`.

### 2c. `$23D726` COPIES SIXTEEN BYTES PER TWELVE-BYTE RECORD

```
23d736: move.l (A0)+,(A2)+ x4      <-- SIXTEEN bytes
23d73e: addi.w #$c,$80afc0         <-- TWELVE
23d754: bne $23D736                <-- back to the COPY.  A2 is NOT recomputed
```

A2 advances 16 per iteration while the counter advances 12, so the copy is an
identity map `S[j] -> Q[q0+j]` that simply RUNS 4n BYTES PAST the accounted end;
the stray tail is overwritten by the next bucket's copy, whose A2 starts exactly
at the accounted end. The net effect is the plain 12-byte-per-record
concatenation everyone assumes — but "it works out" is a conclusion and the
instruction is the fact, so the port copies 16.

This is also what makes the gate's PREFIX dump sound: the emit provably reads
only `S[0 .. 12n)` of each bucket, so the probe dumps `counter` bytes per bucket
rather than the whole 30,336-byte region. If that reasoning were wrong the gate
would be red, which is what a gate is for.

### 2d. (a smaller one) the SUM's order is a THIRD order

The recon says the sum is "in *counter-address* order (NOT drain order)".
`$23D2B4..$23D362` is neither: `C0 C2 C4 C6 **D2** C8 **D4 D0** CA CC CE D6 ...`
It does not matter — `add.w` is commutative mod 2^16 — and the port keeps the
ROM's order anyway so a reviewer can check it line for line. A unit test asserts
it is *not* the drain order, so nobody "tidies" one into the other.

---

## 3. THE GATE, AND THE TWO THINGS IT COST TO MAKE IT HONEST

**The transform is pure, so the capture becomes the INPUT.** `w11dl.lua` taps
`$23D382` (`move.w D0,$80B000` — the one instant all thirty counters are live,
after the sum and before the drop policy) and buffers the thirty counters,
`$80B054` and each bucket's live prefix; at the semaphore arm it writes that
buffer, then `$800000..$8009FF`, then call #4's OTHER outputs. `dlgate.mjs`
replays each frame through `buildDisplayList` and compares.

**Two things had to be fixed before "0 divergent" meant anything:**

1. **THE BOARD NEVER CLEARS THE DISPLAY LIST.** First run: 1,534 divergent
   frames, every one of them *past the terminator*. Call #4 writes as many
   entries as it has records plus the terminator, and everything beyond is
   RESIDUE from an earlier, longer frame — invisible to the hardware, which
   stops parsing at the terminator. A gate starting from zeroed RAM sees it as a
   divergence. Fixed by carrying ONE 128 KiB image across the whole run, seeded
   once at the first compared frame; from frame two on the residue is produced
   by the PORT's own previous emits and the comparison is the whole 2,560 bytes.
   `divergentLive` reports the hardware-visible half separately so the two can
   never be confused.

2. **THE LIST BYTES ALONE CANNOT SEE HALF THE MUTATIONS.** `sum-without-queue`
   and `no-counter-clear` move only the budget words and the counters;
   `terminator-by-count` moves ten bytes that are usually already zero. So the
   probe also dumps `$80AFC0..$80AFFF`, `$80B000..$80B005`, `$80393C` and the
   emit's OWN per-frame counts of records / fillers / terminators (from
   `$23D6BE`, `$23D68C`, `$23D6FA` — three instructions that execute exactly once
   per thing). All are compared. `$80393C` is compared **by mask, bit 0 only**,
   because it is a shared bitfield: call #4 clears bit 0 at `$23C1A2` and sets it
   back at `$23C194` and touches nothing else, and the board's other bits ($1E of
   them) belong to subsystems the port does not model. The mask is written in the
   gate, not hidden in a tolerance.

**WHO ELSE WRITES `$800000..$8009FF`?** The gate's whole claim is that the bytes
at the arm are call #4's output and nobody else's. Measured, not assumed: a write
tap over the region, censused only inside the compared window, reports **ten
distinct PCs and every one is inside the emit** (`23D6B4 23D6B6 23D6B8 23D6BE
23D6EE 23D6F4 23D6FA 23D680 23D686 23D68C`). Outside the window — during the
chooser, which is build A — `$13DA02..$13DA48`, `$23C65C`, `$13C9C8` and the
BIOS at `$000E5C..$000E7A` write it too. That is why the window starts at lf700.

### THE FORCED SCENARIOS — the cap policy is gameplay, so it is tested

The queue never fills in natural play (max **120 of 251** over 1,901 frames), so
three code paths cannot be reached by any recording. Both forcings poke a value
**the game itself holds every frame** at the sample point, so they change WHEN
the cap is reached and nothing about WHAT call #4 does about it (wave 2's NOP
sled rule, wave 4's invulnerability rule).

* `--cap` pokes **bucket 1's counter `$80AFC2` = `$0BC4`**. The queue pointer
  starts at bucket 0's byte count (always a multiple of 12) and `$BC4` = 3012 is
  a multiple of 12, so the drain lands on the cap EXACTLY. Result: 600 frames
  with `runtime_cap_carry`, 600 with both pre-emptive drops, 251 records, 4
  fillers, 256 entries. **Wave 5 had to sweep six values to reach the cap
  because it poked `$80AFC0`, which the UNGUARDED appender `$23D762` consumes
  first; poking a bucket counter has no such problem.**
* `--cap0` pokes **`$80AFC0` = `$0B40`** (240 records — bucket 0's buffer holds
  502). The pointer is already past `$BC4` when the drain starts, so the guarded
  `beq` can never match all frame: `runtime_cap_carry=0`, both pre-emptive drops
  fire, and 251 records are emitted from the clamp at `$23D65E`.

**AND ONE QUESTION THE BOARD CANNOT BE ASKED.** `cmpi.w #$BC4 / beq` versus a
hypothetical `bge` fire on exactly the same record whenever the pointer starts on
the 12-byte grid — which it always does. They are indistinguishable *in the
display list* by construction. `--cap0` is where they differ, and the difference
is only visible in **`$80AFFC`** (the post-drain queue length, written at
`$23D62A` before the emit and NOT reached by the thirty-word clear) — which is
why the gate compares call #4's other outputs and not only the list. The
straddling case (a pointer off the 12-byte grid) is genuinely unreachable and is
tested in `tests/displaylist.test.js` against the LISTING, labelled as such.

### THE TWO DECLARED EXPECTED-GREEN MUTATIONS

Declared with the reason **before** the run, in `pgm.py`:

* `always-terminate` — §2a: the board already terminates at every length.
* `b054-two-16bit-adds` — `$80B054` was `$00000000` on all 1,901 frames here and
  on all 5,000 of `stage1-deep` (10-recon-display-list §6), and adding zero one
  way or the other is the same answer. Red-validated in a unit test with
  `$80B054 = $0000FFFF` and a short axis of `$0001`, chosen so the low word wraps
  exactly back to itself and the ONLY visible difference is the carry into the
  long axis. **If a later wave ever sees `$80B054` move, this becomes a
  board-red mutation and the declaration must come out.**

---

## 4. THE STANDING ASSERTION THAT FIRED — and was wrong, and the right one

The plan asks for *"a standing assertion that the short axis never exceeds 10
bits after the `$80B054` add"*. Written that way it fires **764 times on
`stage1-open`**, with `$80B054 = 0`:

```
lf1204: UNPORTED $23D6AC: the emit's $3FFF re-mask left $10b8 in hardware word 1
```

That is not pollution, it is a **zoomed record**. `$23D69A andi.l #$F800F800,D3`
keeps a COPY of grow+zoom, `$23D6A0` keeps bits 13..0 of the same word, and
`$23D6B2 or.l D3,D1` puts the zoom bits back — so bits 13..11 being SET in the
masked field is exactly what a record with a real zoom field looks like, and
**stage 1 contains them** (which is the first direct evidence in this project
that the zooming enqueue `$23D9E2` or a bulk writer is live in stage-1 play).

The hazard 10-recon-display-list §2b names is real but it is about the **delta**:
`add.l $80B054` can carry out of the ten-bit position field into bits 13..10, and
because the recombination is an OR the extra bits can only be ADDED — a sprite
that overflows its position quietly changes SIZE. So the assertion compares bits
13..10 **across the add**, not the value. It is red-validated in a unit test
(`$80B054 = 1`, short axis `$3FF`) and it cannot fire on the board while
`$80B054` is zero, which is stated rather than hidden.

---

## 5. THE ZOOM TABLE — reproduced, and now gated

`$23C588`, 16 longwords, baked into `src/zoomtable.js`. Re-measured in this wave
rather than quoted: the same 64 bytes at `$00DF2C` (BIOS), `$13C8F4` (build A)
and `$23C588` (build B), and `:igs023:zoomram` read off the running machine on
every `dlgate` run matches all 16 entries. The popcount ramp is asserted as an
arithmetic fact (`popcounts()` = 16,15,…,2 and then **0** where the ramp predicts
one set bit) rather than asserted in prose.

**The substitution is now a NAMED case with a red-validated mutation.** Before
this wave `zoomWord`'s `if (z === 0xf) return 1` was covered by nothing:
`zoomcov`'s table treated `$F` as one of sixteen anonymous rows.

* `tools/zoomcov.py` gained a **NAMED CASES** section: `eff-index-0F` must be
  covered through BOTH encodings (`grow=0,zom=$F` and `grow=1,zom=1`) on BOTH
  axes with pixels drawn and zoom word 1, and `eff-index-10` (the no-zoom
  encoding, 97.9 % of all records) must be covered by the basic path.
* `tools/gfxgate.py` gained `zoom-f-literal` — read entry `$F` literally (0)
  instead of substituting 1 — and `pgm.py zoomcov` runs it as an EXPECTED-RED
  against MAME's own framebuffer.
* It is in gfxgate's `EXTRA_MUTATIONS`, **not** in the `--mutate all` sweep, for
  a measured reason: the natural 16-pair gfx corpus contains no frame that
  reaches effective index `$F`, so putting it in `MUTATIONS` would make
  `pgm.py gfx --mutate all` report a permanent false failure. Where the case
  exists — the zoomcov poker, which drives `$F` on purpose — is where it is
  red-validated.

RUN, on this machine, `pgm.py zoomcov`:

```
=== NAMED CASES (wave 11) ===
  eff-index-0F  grow=0,zom=$F  axis x: COVERED max_pixels=29 zoom_word(s)=[1]
  eff-index-0F  grow=0,zom=$F  axis y: COVERED max_pixels=29 zoom_word(s)=[1]
  eff-index-0F  grow=1,zom=1   axis x: COVERED max_pixels=29 zoom_word(s)=[1]
  eff-index-0F  grow=1,zom=1   axis y: COVERED max_pixels=29 zoom_word(s)=[1]
  eff-index-10  grow=1,zom=0  (NO ZOOM): COVERED 138 sprites, 24326 pixels
ZOOM COVERAGE: COMPLETE
PASS: 2207744/2207744 = 100.0000% over 22 frame pair(s)      (native table)
EXPECTED-RED zoom-off:        diverged, as it must
EXPECTED-RED zoom-f-literal:  diverged, as it must
```

**The classification does not change and is not upgraded by any of this:
HARDWARE FACT BY INFERENCE.** `zoom-f-literal` going red proves MAME's
framebuffer agrees with the substitute; it does not probe the ASIC. The argument
is the ramp plus MAME's behaviour plus three independently built images shipping
the same zero, and `src/zoomtable.js` says so at the top.

---

## 6. THE BUCKET ABLATION — what each bucket DRAWS

10-recon-display-list §7.1: *"I did not prove what any bucket DRAWS in pixels …
the ablation experiment settles all 30 in one run and I did not run it."*

`pgm.py ablate` zeroes one bucket's counter at `$23D382` — after the sum, so the
budget arithmetic is bit-identical to the control, and before the drop policy and
the drain, so exactly that bucket's records disappear — and diffs the raw
framebuffer against a control whose only difference is the missing poke.

Two passes, because a bucket can only lose pixels on a frame where it HAD
records, and the rare buckets are live on a few hundred of 1,901 frames. The
per-bucket census (`node tools/dlgate.mjs <dump> --census --at …`, which
reproduces 10-recon-display-list §3's max/mean/frames≠0 column for column from an
independent instrument) is what chose pass 2's frames.

**PASS 1** — `pgm.py ablate`, 31 MAME runs, framebuffers at lf 1900 / 2100 /
2300 / 2500. `pixels_lost` is over all four frames; the boxes are what vanished,
in the UNROTATED 448×224 bitmap (the game's "vertical" is the bitmap's X).

```
bucket   counter  pixels_lost  per-frame                bounding boxes
     0 $80AFC0        87545  [42739,10558,18802,15446]  lf1900:0,0..447,223  lf2100:297,8..447,223  lf2300:94,34..356,223  lf2500:2,0..447,223
     7 $80AFC8        11741  [    0,    0, 2442, 9299]  lf2300:292,31..447,189  lf2500:241,27..447,223
    19 $80AFDC         6380  [    0, 2121, 2193, 2066]  lf2100:249,65..326,100  lf2300:12,58..90,93  lf2500:49,63..126,98
    25 $80AFE6         4472  [    0, 2153,  285, 2034]  lf2100:316,1..429,71  lf2300:383,64..429,71  lf2500:316,1..429,71
    14 $80AFD6         3775  [    0, 1542,  840, 1393]  lf2100:310,35..446,126  lf2300:87,45..179,78  lf2500:106,41..447,120
     1 $80AFC2         2937  [    0, 1295,    0, 1642]  lf2100:395,24..447,122  lf2500:85,106..163,166
     2 $80AFC4         2693  [    0,    0,    0, 2693]  lf2500:325,0..447,208
    23 $80AFE2          828  [    0,    0,  142,  686]  lf2300:327,146..341,157  lf2500:104,68..319,163
    15 $80AFDA          643  [    0,  344,    0,  299]  lf2100:289,43..310,121  lf2500:90,42..111,119
    17 $80AFCE          251  [    0,    0,    0,  251]  lf2500:310,25..348,45
    20 $80AFDE          195  [    0,  118,    0,   77]  lf2100:406,48..447,141  lf2500:143,76..433,117
  3 4 5 6 8 9 10 11 12 13 16 18 21 22 24 26 27 28 29        0 pixels
```

**PASS 2** — `pgm.py ablate --at 2107,2201,2401,2581 3 5 17`, at frames the
per-bucket census says those buckets are LIVE on (pass 1's four frames were
chosen before the census existed).

```
    17 $80AFCE          738  [   0,   0,   0, 738]  lf2581:191,21..229,44
     5 $80AFD0          689  [ 182, 172, 167, 168]  lf2107:183,78..196,115  lf2201:183,42..196,80  lf2401:49,78..62,114  lf2581:164,77..177,115
     3 $80AFC6          513  [   0, 158,  93, 262]  lf2201:201,166..216,180  lf2401:182,163..201,176  lf2581:237,50..375,177
```

### What the boxes SAY, which the pixel counts alone do not

* **Bucket 19 is the SHIP.** A 78×36 box, the same size at three different
  positions, and it moves. Third independent instrument agreeing with the
  recon's "fed only from `$24A5xx/$24A6xx` inside the player's own block".
* **Bucket 15 is the TWO OPTION PODS.** A 22×79 strip flanking the ship at
  exactly the ship's other axis, at (289,43) and (90,42) — it moves WITH the
  78×36 box. Capacity 4 records, measured max 2, and there are two pods.
* **Bucket 5 is the SHIP'S EXHAUST.** 14×38, moving with the ship, 3 records a
  frame from `$23EFC0` ← `$249EE2` (the player block). Invisible in pass 1
  because none of pass 1's four frames had a bucket-5 record.
* **Bucket 14 is the SHOTS** — wide, forward of the ship, biggest when firing.
* **Bucket 0 is the ENEMIES and the whole screen**: 87,545 px, 71 % of every
  sprite pixel measured here, up to the full 448×224 frame. It is fed
  direct-to-queue by 83 abs-long sites in `$25Bxxx..$27Cxxx` and it drains FIRST,
  i.e. FURTHEST BACK.
* **Bucket 23 is the ENEMY BULLETS** — scattered small boxes across the
  playfield, and its counter `$80AFE2` has no `addi` stub at all (§7).
* **Buckets 1, 2, 3, 7, 17, 25** are real, named-by-address only: their boxes
  are formation-shaped rather than object-shaped and this wave does not claim to
  know which handler owns them. Bucket 25's box at lf2100 and lf2500 is
  IDENTICAL — `316,1..429,71`, 400 frames apart — so it is something static or
  cyclic, which does not match wave 5's "the BOMB's callees" label for the
  `$284/$285xxx` block; nobody bombed in this run. **Recorded as unresolved.**
* **Bucket 20 loses only 195 px** — and it is the one the game SACRIFICES FIRST
  when the screen is full. The degradation policy gives up the cheapest thing on
  the screen first, which is a design decision this table makes visible.
* **The nineteen buckets at 0 px measured ZERO RECORDS on all 1,901 frames**
  (§the census), except bucket 22, which is real elsewhere: it is one of the two
  enemy-bullet buckets and its census is 0 for the whole of `stage1-open`.
  "0 pixels" for those is "never appeared", not "appeared and drew nothing";
  buckets 3, 5 and 17 were the three where the distinction mattered and pass 2
  settles them.

**The framebuffers are dumped RAW** (`lf%06d.pixels.bin`, the same layout
`gfxgate.py` consumes), not as PNGs: everything under `rip/` is ROM-derived and
gitignored twice over, so a PNG would be an artifact nobody can commit either.
The bounding boxes are what a reader can check without the dumps.

---

## 7. THE `bsr` SCAN — a NEGATIVE result, and it corrects the recon

10-recon-display-list §7.5 left this open: *"Ten of thirty buckets have no
absolute-long callers at all and are fed entirely by `bsr`. A static `bsr`-target
scan … would close this and I did not run it."*

`tools/w11/bsrscan.py` runs it. The scanner is validated against a known answer
first — **29 `bsr` sites target `$23D726`**, exactly wave 5's number, and 8 target
`$240ADC`.

```
bucket  6  $80AFD2  stubs $23EC84 $23ECFC $23ED84 $23EDE4   0 abs-long, 0 bsr
bucket  9  $80AFD4  stubs $23ECC0 $23ED40 $23EDB2 $23EE1A   0 abs-long, 0 bsr
bucket 10  $80AFE8  8 stubs                                 0 abs-long, 0 bsr
bucket 11  $80AFF0  8 stubs                                 0 abs-long, 0 bsr
bucket 12  $80AFEA  stubs $23FDB6 $23FE24                   0 abs-long, 0 bsr
bucket 20  $80AFDE  stubs $23F662 $23F69E $23F6E2 $23F714   0 abs-long, 0 bsr
bucket 24  $80AFFA  stubs $23FE60 $23FECE                   0 abs-long, 0 bsr
bucket 26  $80AFEE  8 stubs                                 0 abs-long, 0 bsr
bucket 27  $80AFF2  8 stubs                                 0 abs-long, 0 bsr
```

**They are not "fed entirely by `bsr`". They have NO static caller of any kind.**
The other half of the answer comes from the counter-writer census the same tool
prints:

```
bucket 20 $80AFDE  move.w A4,_ (THE BULK WRITER)   $28A12A $28A198 $28A1B4 $28A1D0
bucket 22 $80AFE0  move.w D0,_                     $281DCE
bucket 23 $80AFE2  move.w A4,_ (THE BULK WRITER)   $281DD6
```

So bucket 20 — the one of these nine that carries records (max 24/frame) — is fed
by the **bulk writer `$28A098`**, and its four `addi` stubs are simply never
called. The remaining eight measured **zero records on every one of 1,901
frames**. That is "I found no caller", never "nothing calls it": a call through a
register or a jump table is invisible to any static scan.

---

## 8. WHAT I DID NOT DO, AND WHY

1. **`$23D9E2` has no producer and therefore no oracle in this wave.** It is
   translated (the `(0x80 - flagsByte) × extent/8` recentring, the `or.l D6,D1`,
   the direct-to-queue append) and unit-tested against hand-computed values, but
   nothing in the corpus calls it, so the translation is LISTING-ONLY. Two things
   inside it are named throws rather than guesses:
   * the `$23E54A` scale table's **entry 25 multiplies by 21, not 25** —
     decoded by symbolically executing all 64 routines out of the ROM; entries
     32..63 are 128 bytes of the literal `$0023E64A` (×1), a deliberate guard for
     the out-of-range indices the second dispatch can produce;
   * the FIRST dispatch indexes the 4-byte table with `height/2` as a BYTE
     offset, which only lands on an entry when height ≡ 0 (mod 8) and is an
     ODD-ADDRESS long read (a 68000 address error) at height ≡ 2,3 (mod 4).
     The port throws naming `$23D9FA` rather than inventing an answer.
2. **`pgm.py flyaround` is RED, and it was RED before this wave.** `RESULT 1 of
   53 columns diverged`, `DIVERGE scroll first at lf=2321: port=0 board=65472`.
   Verified as pre-existing by running **HEAD's** `src/` against the same trace
   (`git archive HEAD | tar -x` into a scratch dir): `RESULT 1 of 50 columns
   diverged`, same column, same frame. `scroll` = `$813176` is written by
   `$26151E` inside the unported background object, so it cannot be green until
   **W14**; wave 8 chose `stage1-shot`'s window precisely because `$813176`
   stays 0 there. Wave 11 adds three columns (50 → 53) and no divergence.
3. **I did not localise the effective-index-`$F` frames** (recon §7.4). The
   named-case coverage runs on the zoomcov poker, which reaches `$F` on purpose;
   the natural corpus's 34-in-5,000 occurrences are still unbracketed.
4. **I did not re-run `pgm.py check` end to end.** Run individually and green:
   `dlgate` ×3 + the union sweep, the 142 port unit tests, `shotgate`
   (**0 divergent on 56 columns**, four of them new), `zoomcov` (complete, both
   reds), `webgate` (the page still assembles and renders). NOT re-run: `gfx`,
   `pixslice`, `pixdemo`/`demogate`, `overrun`, `gate`, `assets check`. `check`
   itself would report FAILURES today because of item 2, which is why it was not
   run as a headline.
5. **`$80B054` is still zero everywhere.** Presence, not coverage: six writers,
   none disassembled, one inside the IRQ-gated `$240CC0`. It is now a compared
   column with a loud runtime warning, which is the most a wave with no producer
   can do.

---

## 9. THE LEDGER

| row | status | why |
|---|---|---|
| **L17** — the zoom table blob + the entry-`$F` quirk | **REPLACED** | baked as the `$23C588` constant in `src/zoomtable.js`, asserted against `:igs023:zoomram` on every `dlgate` run, named `zoomcov` cases `eff-index-0F` (both encodings, both axes) and `eff-index-10`, and the `zoom-f-literal` mutation |
| **L18** — the identity of 25 of the 30 sprite buckets | **REPLACED** | the ablation table in §6 plus the `bsr`/counter-writer census in §7 |
| **L1** — the hardware display list itself | **CONVERTED** | the port BUILDS it, gated at 0 divergent frames; it is now "the source of bucket CONTENTS" instead of "the only source of pixels" |

---

## 10. IF SOMEONE PICKS THIS UP COLD

```
python games/ddpdoj/tools/oracle/pgm.py dlgate            the gate
python games/ddpdoj/tools/oracle/pgm.py dlgate --cap      force the runtime cap
python games/ddpdoj/tools/oracle/pgm.py dlgate --cap0     force the pre-emptive drops
python games/ddpdoj/tools/oracle/pgm.py dlgate --reuse --break all
python games/ddpdoj/tools/oracle/pgm.py ablate            bucket -> pixels
node   games/ddpdoj/tools/dlgate.mjs <dump> --census --at 1900,2100,2300,2500
python games/ddpdoj/tools/w11/bsrscan.py
node   --test games/ddpdoj/tests/
```

**Six things that will save you the hours they cost me:**

1. **The board never clears `$800000..$8009FF`.** Anything past the terminator is
   last frame's list. A gate that starts from zeroed RAM reports 1,534 divergent
   frames and every one is a lie.
2. **`$23D6E8` compares D1, and D1 is `$12`.** The terminator is never skipped.
   Do not port the recon's reading.
3. **The filler cadence is 51 then 50**, not "every 52". 251 records + 4 fillers
   + the terminator = 256 exactly.
4. **`$23D726` copies 16 bytes per 12-byte record and does not re-derive A2.**
   It works out to a plain copy; translate the instruction anyway.
5. **Poke a BUCKET counter, not `$80AFC0`, to force the cap.** The unguarded
   appender `$23D762` eats a `$80AFC0` poke first and can carry the pointer past
   `$BC4`, after which `beq` can never match — which is why wave 5 needed a sweep.
6. **A zoomed record has bits 13..11 set in the `$3FFF`-masked short axis and
   that is NORMAL** — `or.l D3,D1` puts them back. The hazard is the DELTA across
   `add.l $80B054`, not the value.
