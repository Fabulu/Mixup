# W22 REVIEW — the spawn side (the stage-1 spawn walker)

status: **APPROVE with one MODERATE finding.** The walker, the dispatch, the
+8 rule, the sub-record allocator, the install and the deferred-queue ENQUEUE
are byte-faithful to maincpu.bin (every address re-derived with capstone). The
done-when is met on the columns the port can produce: cursor 0 divergent over
10,742 lf and spawn counter 339 = 339 to the $231704 terminator, both re-run
independently. The required `clock-per-frame` RED is genuine (6568/10742) and
three more mutations + the test suite are green/red as claimed. **One real
translation defect** in the deferred-queue DRAIN (9 of 16 field copies missing
— the fall-through trap, F1), latent only because nothing feeds the queue yet.
Tests 334/0/0-skip; export VERIFY OK; W21/W20 gates unchanged.

wave: 22 (plan W21 "the spawn side")   role: reviewer (READ-ONLY — no src/ edits, no commit)
date: 2026-08-02
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). All addresses below re-derived
from `tools/oracle/out/maincpu.bin` (6,291,456 B = $600000; PGM file offset == 68000 address).

---

## 0. METHOD

READ-ONLY review. Every ROM address below was re-derived by disassembling
`maincpu.bin` with capstone 5.0.7 (m68k 030 mode) and reading raw longwords/
words with `struct.unpack('>I'/'H')`. The corpus (`w22-spawn-stage1.tsv`) was
re-analysed independently for the window, the allocation counts and the deferred
type breakdown. The gate (`w22spawngate.mjs`) was re-run GREEN and `--break all`.
`src/spawn.js` was SHA-256'd against the worklog's claim. The test suite and
`export-tables.py --verify` were re-run. No file under `src/` was modified.

---

## 1. BYTE-FAITHFULNESS — every address re-derived from maincpu.bin

### 1.1 the stage table `$263336` and the install `$263386` — FAITHFUL

`stageTableEntry(rom, 0)` reads the same longwords `$263386` installs from:

```
$263336 + 0*0x10:  script=$230C6C  aux=$23170C  res=$231852   (stage 1 = index 0)
$263336 + 1*0x10:  script=$2325D0                                (stage 2)
```

The install `$263386` disassembles to `lea $8132CC,A4; move.w $813096,D0;
add.w D0,D0; add.w D0,D0` (= stage*4 << 2 = stage*16) `lea $263336(PC),A0;
adda.w D0,A0; move.l (A0)+,(A4); move.l (A0)+,$4(A4); ... jsr $246D04;
clr.w $815EA8`. The port's `installStage` mirrors exactly: LIVE_CURSOR=script,
AUX_BASE=aux ($8132D0 = LIVE_CURSOR+4), DEFQ_COUNT cleared, resource install
`$246D04` noted (not the per-record `$246CAC` — the two are correctly distin-
guished). Stage index = `$813096 >> 2` = 0 for stage 1; the gate passes 0. ✓

### 1.2 the walker `$2633BE` — FAITHFUL

Disassembly vs `walkScriptLoop`, line for line:

| ROM | port |
|---|---|
| `lea $8132CC,A3` / `movea.l (A3),A2` | `ram.u32(LIVE_CURSOR)` |
| `move.w (A2),D0; cmpi #$FFFF; beq $263444` | `if (trig === 0xffff) break` |
| `cmp.w $8130CE,D0; blt $263440` | `if (i16(trig) < i16(clock)) { cursor += 8; continue }` |
| `bne $263444` | `if (trig !== clock) break` |
| `move.b $4(A2),D0` (type) / `move.l $4(A2),D1; andi #$FFF000; lsr #16` (flags) | `u8(cursor+$4)` / `u8(cursor+$5)` — see note |
| `move.w $6(A2),D7; andi #$FFF,D7` (idx) | `u16(cursor+$6) & 0xfff` |
| `addq #8,A2; bra $2633C6` | `cursor += 8` |
| `move.l A2,(A3)` (writeback at exit only) | `ram.setU32(LIVE_CURSOR, cursor)` |

The flags read: the ROM reads the longword at +4, masks `$FFF000`, shifts `>>16`,
which resolves to exactly **byte +5** (the high-nibble of byte 6 is masked into
the shift and discarded). The port's `u8(cursor+$5)` yields the same value. ✓

### 1.3 the dispatch `$2635F6` and THE +8 RULE — FAITHFUL, +8 PRESENT

The second entry point is real and load-bearing:

```
$2635F8  move.b $C(A5),D7          type byte at enemy+$0C
$2635FC  lea $267824,A0  / $263608 lea $27E412,A0   LO/HI type tables
$263602  cmpi #$80,D7; blt        type < $80 -> LO
$26360E  subi #$80,D7             else HI, subtract $80
$263612  lsl.w #3,D7              *8 (stride)
$263614  movea.l (A0,D7.w),A1     init pointer
$263618  jsr (A1)                 CALL THE 8-BYTE STUB (writes run-length to +$4)
$26361A  addq.w #8,A1             <-- THE +8 RULE (initBody = init + 8)
$26361C  move.w $4(A5),D0         run-length just written
$263620  bsr $2635B2              sub-record allocator
$263622  bcs $263674              alloc fail -> clr.w (A5)
$263624  move.l A6,$6(A5)         sub-record ptr
$263628  movea.l $4(A0,D7.w),A0   handler
$26362C  move.l A0,$4C(A5)        handler at +$4C
$263638  btst #0,$1(A5) / ...     player select -> +$3
$26364C  clr.w $3E(A5)
$263650  jsr (A1)                 THE INIT+8 BODY (throws, W23)
$263656  btst #0,$D(A5); sub.w $813172,$4(A6)   scroll-locked fixup
```

Every constant in `initDispatch` matches: TYPE_LO=$267824, TYPE_HI=$27E412,
stride 8, subRec +$6, handler +$4C, player +$3, clear3E +$3E, classByte +$D,
scroll delta $813172, subrec+$4 fixup. The +8 is exactly `init + 8`. ✓

**All 256 type-table init entries are mechanically 8-byte stubs** (`3b7c ???? 0004
4e75` = `move.w #N,($4,A5)/rts`): verified all 256 (LO types $00-$7F, HI $80-$FF),
zero non-stub. NULL inits $267814 / $27E402 are the same stub with N=0; NULL
handler $26781C = `jmp $263762` (the free routine). Type $11 -> init $268714,
handler $2688CC, init+8 $26871C (the census §4 values). ✓

### 1.4 the sub-record allocator `$2635B2` — FAITHFUL

Band select (class byte bit 7 OR bit 5 -> special), pools $81521C (50) /
$81459C (100), stride $20, free = byte+0 == 0, run-of-(runLen+1)-consecutive
search with reset-on-occupied, mark $8000, return the FIRST slot. Traced the
ROM's `dbra D1`/reset-`D1=D0`/back-up-and-mark loop against the port's
`need`/`runStart` translation for runLens 0 and 1, with and without an occupied
slot before the run: identical slot selection and identical marks. ✓

### 1.5 the deferred queue ENQUEUE `$263678/$263684/$263690` — FAITHFUL

Three entry points differ only in D1 ($80 / $00 / caller's); the shared body
`$263694` reads count, `cmpi #$C80; beq $2636CA` (full -> dummy $816B2A),
`lea $815EAA; adda D2`, writes type at +2, flags at +4, zeroes +$12, count += $50.
The port's `enqueueDeferred` matches all of this, including the three DEFQ_D1
modes and the dummy return. The cap arithmetic is `$C80/$50 = 40` (see F2 for
the comment, not the code). ✓

### 1.6 the enemy allocator `$2636D6` (earlier wave, reused) — FAITHFUL

Re-checked because the spawn path calls it: three bands ($20-$23 -> 8-slot boss
at $8133CC; D1>=0 -> 48-slot common at $81364C; else 2-slot special at $81332C),
claim write at `$26371A move.w D3,(A0)` with D3=idx|$8000, type at +$C, flags
at +$D, dummy $81454C + carry on exhaustion. The lua's CLAIM_PC=$26371A and tap
range $81332C..$81454B are correct (58 slots * $50 = $1220, $81332C+$1220=$81454C).
✓

---

## 2. THE DONE-WHEN — re-run independently

```
$ node tools/w22spawngate.mjs
window lf 1618..12359 (10742 frames, reset at lf 12360)
RESULT cursor divergent: 0 of 10742 frames (100.0000 %)
SPAWN COUNTER port script=339 board script=339 (terminus REACHED at 339)
BOARD total allocations=382 (script 339 + deferred 43)
CURSOR at terminator: port=231704 board=231704 (want $231704 = $230C6C + 339*8)
```

Reproduced exactly. The cursor at the end of the stage-1 window is `$230C6C +
339*8 = $231704` (the `$FFFF` terminator) on both sides. Independent corpus
analysis confirms the window (install lf1618 = cursor first non-zero, reset
lf12360 = clock returns to 0), 382 total allocator claims, and the deferred
breakdown:

| type | claims | script | deferred | (worklog §4) |
|---|---|---|---|---|
| $11 | 137 | 104 | +33 | ✓ |
| $10 | 24 | 16 | +8 | ✓ |
| $1E | 4 | 0 | +4 (script-less) | ✓ |
| $1C | 1 | 0 | +1 (script-less) | ✓ |
| $82 | 30 | 33 | -3 (sample artifact) | ✓ |

Total deferred = 33+8+4+1-3 = 43. ✓ Every number in the worklog's deferred-queue
table reproduced from the TSV.

### The clock-per-frame RED — genuine

```
$ node tools/w22spawngate.mjs --break all
RED [clock-per-frame]  divergent= 6568 of 10742 RED
RED [advance-by-7]     divergent=10397 of 10742 RED
RED [no-terminator]    divergent=10397 of 10742 RED
RED [trigger-low-byte] divergent= 7870 of 10742 RED
```

All four match the worklog §3. `clock-per-frame` is the REQUIRED red (plan §3)
and it is genuine: the gate sets `DISTANCE_CLOCK = lf` (not the board's `$8130CE`)
and runs the REAL `walkScriptLoop`, so the port's own clock-reading code is what
diverges. The clock is an odometer ($26132C, +1 per $200 of scroll, W14); the
first spawn's trigger is $60=96, which a per-frame counter would match at lf96
versus the board's lf1963 — divergence at the first spawn, never recovering.

### SHA + tests + export

- `sha256sum src/spawn.js` = `70ee530f...d167a3` = the worklog's claimed SHA
  (byte-identical to the "before/after all three source breaks" value). ✓
- `node --test games/ddpdoj/tests/` = **334 pass, 0 fail, 0 skip** (the two
  real-tables tests ran, not skipped — `player.tables.json` is present). ✓
- `python tools/export-tables.py --verify` = **VERIFY OK, 36 ROM windows,
  168,576 B** (the worklog's "+3 windows, 36 total, 168,576 B"). ✓

### live-count — honestly pending (not a defect)

The done-when names cursor/clock/live-count + spawn counter. The port meets
cursor (0 divergent), clock (an INPUT — trivially 0 divergent), and spawn
counter (339=339). **live-count (`$815E9C`) is board-measured only**: it is
written by the enemy driver `$263502` after the handlers run (W25), and the
gate's `walkScriptLoop` runs with a counting callback that does not allocate.
The worklog states this plainly (§2). This is a W25-blocked column, not a
failure of W22.

---

## 3. FINDINGS

### F1 — MODERATE. The deferred-queue DRAIN copies 7 of 16 fields (fall-through trap)

`processDeferred` (spawn.js) copies only `+$2` and the longwords `+$12..+$26`:

```js
ram.setU8(r.addr + 0x02, ram.u8(a + 0x02));
for (const off of [0x12, 0x16, 0x1a, 0x1e, 0x22, 0x26])   // $263478..$263496
  ram.setU32(r.addr + off, ram.u32(a + off));
```

The ROM's drain `$263446` copies SIXTEEN fields, through `$2634CC`:

```
$263472  move.b $2(A4),$2(A0)          +$2 (byte)
$263478  move.l $12(A4),$12(A0)        +$12
$26347E  move.l $16..                  +$16
$263484  move.l $1a..                  +$1A
$26348A  move.l $1e..                  +$1E
$263490  move.l $22..                  +$22
$263496  move.l $26..                  +$26   <-- the port stops here
$26349C  move.l $2a(A4),$2a(A0)        +$2A   <-- MISSING
$2634A2  move.l $2e..                  +$2E   MISSING
$2634A8  move.l $32..                  +$32   MISSING
$2634AE  move.l $36..                  +$36   MISSING
$2634B4  move.l $3a..                  +$3A   MISSING
$2634BA  move.l $3e..                  +$3E   MISSING
$2634C0  move.l $42..                  +$42   MISSING
$2634C6  move.l $46..                  +$46   MISSING
$2634CC  move.w $4a(A4),$4a(A0)        +$4A (word)  MISSING
$2634D2  move.w D6,$815EA8             (the pop)
```

Eight longwords (`+$2A..+$46`) and the word at `+$4A` are not copied. The inline
comment `// $263478..$263496` truncates the copy range and hides the rest — the
classic fall-through trap the project warns about ("read PAST the apparent end
of every routine").

**Failure scenario.** Today the queue is unfed (the enemy handlers `$263678/
$263684/$263690` are W25/W29), so `processDeferred` runs over an empty queue and
the defect is invisible — the unit test passes because it only checks the count
reaches 0, and `enqueueDeferred` only sets `+$2/+​$4/$12` so the missing source
fields are zero on both sides. The worklog's claim that "the port drains it
correctly (unit-tested)" is inaccurate for field fidelity. **When W25 ports a
handler that enqueues a deferred spawn with real state in `+$2A..+$4A` (position,
sub-record state, etc.), the drained enemy record will be missing those fields**
and will diverge from the board — a hard-to-localise defect because the drain is
not on the cursor-comparison path.

**Why MODERATE, not higher.** No current behaviour is wrong (0 deferred spawns
in the port; the headline done-when is unaffected). It is ported code that
claims correctness it does not have, and it will bite in W25/W29. The fix is a
one-line array extension:
```js
for (const off of [0x12,0x16,0x1a,0x1e,0x22,0x26,0x2a,0x2e,0x32,0x36,0x3a,0x3e,0x42,0x46])
  ram.setU32(r.addr + off, ram.u32(a + off));
ram.setU16(r.addr + 0x4a, ram.u16(a + 0x4a));   // $2634CC (word)
```
Either apply it before W25 feeds the queue, or correct the worklog's "drains it
correctly" claim to "drains the count and the first 7 fields; the remaining 9
are W25-territory."

### F2 — MINOR. Stale "25 entries" cap comment

`src/spawn.js:312`: `// $C80 = 25 entries.` Arithmetic: `$C80 = 3200`,
`3200/$50 = 40`. The code (`DEFQ_CAP: 0x0c80`) and the test ("cap $C80 = 40
entries, the 41st is silently dropped") are correct at 40. The worklog §7 says
"this corrected an earlier '25' in my notes -- $C80 = 3200, 3200/$50 = 40", but
the inline comment was not updated. Comment-only; no behavioural impact.

### F3 — INFORMATIONAL. Two gate mutations are synthetic post-hoc skews

The four `--break` mutations are not all equal:
- `clock-per-frame` (the REQUIRED red) and `trigger-low-byte` are genuine — they
  change what the real `walkScriptLoop` reads (the clock input / the trigger word).
- `advance-by-7` and `no-terminator` are synthetic: after `walkScriptLoop` runs
  normally (stride 8, terminator honoured), the gate OVERWRITES the cursor with a
  skewed value (`base + portSpawns*7`, or `pc + 0x10000`). They demonstrate the
  gate *can* see a stride/terminator error, but they do not exercise the port's
  `cursor += 8` or the `0xffff` test.

This is acceptable because the actual constants ARE verified — by the three
source breaks (worklog §3), which change `src/spawn.js` and redden the unit tests
(`cursor += 8 -> += 7`: 4 of 26 red; `init+8 -> init+7`: 1 of 26 red; etc.) and
whose SHA is confirmed here. The worklog keeps the two categories separate
("gate mutations" vs "source breaks"); it does not claim the synthetic skews are
source-level. Noting only so a future reader does not mistake them for it.

### F4 — INFORMATIONAL. Scroll-gate divergence location misstated (pre-existing, not W22)

The worklog §8 item 5 says the scroll gate fails "at lf3248". Re-running
`scrollportgate.mjs` over `w17-stage1-invuln-p2.tsv`: 9 of 12 columns diverge,
but only `d18a`/`d18c` start at lf3248 — the other seven (`b012`,`b016`,`b034`,
`bgx`,`b038`,`b03c`,`bgy`) start at lf2965-2967. The conclusion (pre-existing,
NOT W22's regression) is correct and verified: the W22 commit `592667c` touches
no scroll/background code (`scrollportgate.mjs`, `src/background.js` absent from
the diff). The gate exits 0 regardless (the divergences are reported, not fatal),
so this does not fail `pgm.py check`. Owned by the scroll subsystem.

---

## 4. NO REGRESSION

- The W22 commit `592667c` adds only: `src/spawn.js`, `tests/spawn.test.js`,
  `tools/export-tables.py` (+3 windows), `tools/oracle/{pgm.py,w22run.py,
  w22spawn.lua}`, `tools/w22spawngate.mjs`, and this worklog. **No existing
  `src/` file is modified** — `state.js`'s `WATCH_SPEC`/`CLAIMED` are unchanged
  (spawn.js is not imported by the live frame loop; `runSpawnWalker` exists but
  is unwired, exactly as W20/W21 were).
- `export-tables.py --verify`: OK (the 3 new windows integrate cleanly).
- W21 pattern gate: 0/197 spawns divergent (unchanged).
- W20 turret gate: closed-loop 0 divergent (unchanged).
- The full `pgm.py check` could not be completed in this review (it stalls on a
  MAME-based gate — gfx/fly-around — which is environmental and unrelated to W22).
  Every non-MAME stage the W22 `check` runner adds was re-run directly: spawn
  gate GREEN, spawn gate 4-RED, scroll gate (pre-existing, exits 0).

---

## 5. VERDICT

APPROVE. The spawn walker is byte-faithful where it counts — the walker, the
dispatch, the +8 rule (present and correct), the sub-record allocator, the
install, the enemy allocator, and the deferred ENQUEUE all match maincpu.bin
instruction-for-instruction. The done-when is met on every column the port can
produce (cursor 0/10742, spawn counter 339=339 to the $231704 terminator), the
required clock-per-frame RED is genuine, the SHA/tests/export all check out, and
there is no regression. The deferred-queue drain field-copy defect (F1) is real
but latent (queue unfed); it should be fixed — or the worklog's "drains it
correctly" claim corrected — before W25 feeds the queue. F2 is a one-line comment
fix. F3/F4 are informational.
