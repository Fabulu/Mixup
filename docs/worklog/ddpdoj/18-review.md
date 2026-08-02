# Wave 18 review — the 13 stage-1 BACKGROUND ELEMENTS

status: **DONE — APPROVE. Two MINOR defects (one stale comment, one inaccurate
change-manifest); neither blocking, no correctness defect found.** Every
headline claim in `18-impl-background-elements.md` reproduced: the denominator
is honest (13/13 + the 8-slot driver byte-faithful, re-derived from
`maincpu.bin`), `$246BB8` is correctly classified, the rider is soundly scoped
out, and the done-when is green with the red seen.

date: 2026-08-02
role: reviewer (READER — no `src/` edits, no commits)
target: `ddpdojblk`, **VERSION-B**. Every address below is build B unless the
line says otherwise (`games/ddpdoj/NOTES-build-split.md`).

---

## 0. WHAT I RE-RAN, AND WHAT IT SAID

All commands from `games/ddpdoj/tools/oracle/` or `games/ddpdoj/`.

```
$ node tools/w18gate.mjs
  FRAMES 1880 compared (lf1621..3500), 1186 with active elements
  DIVERGENT emask=0 ecount=0 staged=0 b03c=0
  GATE GREEN                                              <- claim reproduced

$ node tools/w18gate.mjs --break delete-handler0-data
  DIVERGENT emask=0 ecount=0 staged=482 b03c=0
    first stream divergence @ lf3019:
      port=81C0800C0000000024D00014   (data word zeroed)
      board=81C0800C0022CBCC24D00014  (handler 0's real data ptr $22CBCC)
  GATE RED  (exit 1)                                      <- red reproduced

$ node tools/w18gate.mjs                                   <- restore
  DIVERGENT emask=0 ecount=0 staged=0 b03c=0   GATE GREEN

$ node --test games/ddpdoj/tests/
  # tests 308  # pass 308  # fail 0  # skipped 0

$ python pgm.py pixslice --reuse
  PASS: 12845056/12845056 = 100.0000% over 128 frame pair(s)

$ python pgm.py shardgate
  BASELINE: PASS (6121472/6121472, 61 past-160 pairs);
  bg-planes RED 55.9883%; blank-shard-tile RED 99.4845%   <- both reds caught
```

The green/red/green cycle matches the worklog §6/§7 to the digit: **482**
staged frames diverge under `delete-handler0-data` from **lf3019**, and
`emask`/`ecount` stay 0-divergent throughout (the `+8` updater pointer is still
written, so the constructor-field deletion touches only the staged bytes —
exactly the done-when's scope). 308/0/0 tests, pixslice and shardgate unchanged
at 100.0000 %.

## 1. THE DENOMINATOR — re-derived from `out/maincpu.bin`, 13/13 honest

`BGTAB.elemTable` = `$262302`; `rom.u32($262302)` = **`$26224A`** (the stage-0
handler-table base, indexed by `$813096`). The 13 longwords at `$26224A`:

```
id  0 @$26224A: $2623A4   id  5 @$26225E: $26253C   id 10 @$262272: $2626C2
id  1 @$26224E: $2623FC   id  6 @$262262: $26258A   id 11 @$262276: $262710
id  2 @$262252: $26244A   id  7 @$262266: $2625D8   id 12 @$26227A: $26275E
id  3 @$262256: $26249C   id  8 @$26226A: $262626   id 13 @$26227E: $2627AC
id  4 @$26225A: $2624EE   id  9 @$26226E: $262674
```

ids 0..12 are the 13 stage-1 constructors; id 13 (`$2627AC`) is the next
stage's table start. **The port's `BGELEM_HANDLERS` ctor column matches all 13
to the byte.** I then re-derived every constructor field (data `+10`, Y `+14`,
updater `+8`, kind `+D`) and every updater's despawn shape (threshold, `.w`/
`.l`, `bge`/`bgt`, the `$8130DA` gate) by byte-scanning each routine. All 13
match the port — the four I disassembled in full (`$2623A4`/`$2623FC`/`$26244A`/
`$26249C`) and the despawn-region dump of all 13:

```
id  0 upd $2623C2 gate=T: 302E 0002 0640 4800 6C00 ..  -> wbge thr=$4800
id  1 upd $26241A gate=F: 302E 0002 0640 2800 6C00 ..  -> wbge thr=$2800
id  2 upd $262468 gate=F: 302E 0002 48C0 0680 00002C00 6E00 -> lbgt thr=$2C00
id  3 upd $2624BA gate=F: 302E 0002 48C0 0680 00004C00 6E00 -> lbgt thr=$4C00
id  4 upd $26250C: 0640 4C00 6E00 -> wbgt  id 5: 0640 5000 6E00 -> wbgt
... (ids 6..12 all `0640 <thr> 6E00` -> wbgt; thr $4C00/$5000/$5400/$3C00/$4000/$1400)
```

The `.w`/`.l` distinction is real: handlers 2 and 3 use `ext.l d0` + `addi.l`
(`48C0 0680`); the rest use `addi.w` (`0640`). The `$8130DA` kill gate
(`4a79 008130da / bne`) is **handler 0 only** — confirmed at `$2623C2`, absent
from the other 12 updaters. **The port's `gate:true` on handler 0 and `false`
on the rest is correct.** 13 of 13, denominator honest.

**The 8-slot driver `$26233A` and spawner `$262366`** re-derived in full:
`$26233A` = `lea $8131c8,a0; moveq #7,d7; tst.b (a0)/beq skip; move.w
$813176,d0; sub.w d0,$4(a0); movea.l $8(a0),a1; jsr (a1); lea $20(a0),a0;
dbra d7` — slot 0..7, subtract `scrollDelta` from `+4`, call `+8`. `$262366` =
scan 8 slots for the first `+0==0`, set `+0=$80`, store `arg` long at `+2`,
read the ctor from `*(*($8132c8) + id*4)`, `jsr`, return; the all-busy arm
falls through to `movem/rts` (silent drop). The port's `elemDriver`/
`elemSpawn` translate both as written, including the flagged (never-smoothed)
silent-drop arm. The slot clear in `backgroundInit` is **130 words** (`moveq
#$81,d0; dbra` = N+1 iterations), which clears `$8131C8..$8132CB` — four bytes
*past* the 8-slot table into the `$8132C8` elemTable pointer — and then writes
the table pointer afterwards; the port's `for (...+ 260 ...)` + subsequent
`setU32(BGRAM.elemTable, …)` matches that order exactly. (`$8131C8 + 8*$20` =
`$8132C8`, the self-check W17 §5 named.)

## 2. THE `$246BB8` CLASSIFICATION — correct, re-derived

The object stream lives at `$26157A` (`SCRIPT0 $261610` holds obj=`$26157A`,
cue=`$261602`). Its 22 entries + terminator, read back:

```
entries 0..5,7..21: all $22xxxx DATA pointers
entry 6: ptr $246BB8 param $0018  <- the one CODE-segment address
entry 22: TERMINATOR ($FFFFFFFF)
```

`$246BB8` is **64 bytes of `$00`** (hex-dumped: four rows of `00`). The create
callee `$24150A` is `lea $80e886,a1; lsl.w #6,d0; adda.w d0,a1; moveq #$f,d0;
move.l (a0)+,(a1)+ dbra; move.w #$1,$80fa66` — a uniform 64-byte prototype
copier into the work-RAM object table that treats **every** ptr as a DATA
source. So `$246BB8` is a zero prototype the copier reads as bytes; it is not
an executable routine. **Classification correct.** The port walks the stream,
advances the cursor, and flags the code-segment ptr loudly (`runOpcode` case
`0x00`) rather than smoothing it; the prototype copy itself is W21, as stated.

## 3. THE RIDER — `$26C20C` / `$26C24A` soundly scoped out

Byte-search of `$2623A4..$262800` (the 13 handlers' whole span) for
`$0026C20C`, `$0026C24A`, `$32A90000`: **all NONE** — no op-`$10` handler
references the second-map writer. `$26C20C` disassembles as `cmpi.w #$105,
$8130ce / bne skip; lea $227af8,a1; lea $9000bc,a0; ...` and `$26C244:
addi.l #$32A90000,d4; $26C24A: move.l d4,(a2); adda.w #$100,a2; dbra d7` —
23 cols (`moveq #$16`) × 9 rows (`moveq #$8`), tile base `$32A90000`, gated on
distance clock `$0105`. That is the midboss window W17 §9 measured
(lf4315..4585), **far past W18's first-three-elements window** (clocks
`$0090..$00C0`, lf2314..3018). It is object type `$1C`, not an op-`$10`
handler, and its 205 tiles + `bg.smap.u16` shipped in W15 shard 7. **Correctly
deferred to W29; not this wave's scope.**

## 4. THE DONE-WHEN — window content and variant coverage

The gate window (lf1621..3500) contains the first **four** element spawns,
verified from the TSV's `emask`/`ecount` transitions:

```
lf2315 clock=$0090 emask=1 ecount=1   (id 12, slot 0)   variant wbgt
lf2331 clock=$0092 emask=3 ecount=2   (id  1, slot 1)   variant wbge
lf2475 clock=$009E emask=7 ecount=3   (id  2, slot 2)   variant lbgt
lf3019 clock=$00C0 emask=F ecount=4   (id  0, slot 3)   variant wbge + $8130DA gate
```

These match W17 §5's spawn table to the clock. The staged bytes carry the
exact ROM constructor fields (e.g. `0022DED416900013` = handler 2's data
`$22DED4`, Y `$1690`, kind `$0013`). **All three despawn variants** (`wbge`/
`wbgt`/`lbgt`) **and the kill-gate arm** are exercised by these four — the
remaining 9 handlers (ids 3..11, clocks `$00EE..$01AD`, lf4122..7274) share the
identical code path and are byte-faithful by §1's static re-derivation, but are
not dynamically reached by this 3,500-frame recording. That is within the
done-when's letter ("the first three elements") and the project's
static-then-dynamic rule; the kill-gate's die arm is a no-op in-window
(`$8130DA` rises at lf4314, the midboss) and is byte-verified only — both
limits are stated in the worklog §0/§6.

**The overflow-flag fix (§4) is correct.** `bge`/`bgt` test the true signed sum
(`N==V`), not `i16(wrapped result)`. The port's `sum = i16(slot2) + thr;
alive = sum >= 0 (bge) | sum > 0 (bgt)` reproduces this: for handler 0's first
frame (slot2=`$7000`, thr=`$4800`) the true sum `$B800`=+47104 > 0 → alive,
where the 16-bit-wrapped reading `$B800`=i16 -18432 would kill it 2 frames
early. The `.l` variants reduce to the same expression (the 32-bit add cannot
overflow: max `i16+thr` = 32767+`$5400` = 54271 ≪ 2³¹).

## 5. DEFECTS

### 5.1 MINOR — `BGRAM.elemGate` comment overstates (handler-0-only, not "every")

`src/background.js:87`:

```
elemGate: 0x8130da,     // read by every element updater (W18)    $2623C2
```

The code is correct — `elemUpdate` (`:504`) gates on `h.gate`, and only handler
0 carries `gate: true`; the worklog §0 explicitly corrects W17 §3b's "every
updater tests it" to "HANDLER-0 ONLY". But this comment still says "every
element updater", contradicting both the port's own table and the worklog's
finding. **Failure scenario:** a future reader (W29 midboss, or another stage's
BGELEM set) trusts the BGRAM comment, assumes the gate is universal, and is
surprised when only handler 0 dies on `$8130DA`. One-word fix: "every" →
"handler 0's". Not a code defect — the behaviour is right; the comment misleads.

### 5.2 MINOR — worklog §8 change-manifest is wrong on two of six files

`git show --numstat HEAD` shows **six** files; §8 lists five and mislabels two:

| file | git numstat | §8 says | actual |
|---|---|---|---|
| `tools/oracle/w18elem.lua` | `166 0` (new) | `M` (modified) | **A** — a new recorder ("a STRIPPED copy of w17stage.lua"), no prior `git log --follow` history |
| `tools/oracle/w18run.py` | `54 0` (new) | *(absent)* | **A** — the recorder's driver, omitted from §8 entirely |

The commit itself is correct (all six files staged and committed). The defect
is the worklog's own change manifest: a reader relying on §8 to inventory the
wave's tooling misses `w18run.py` and misreads `w18elem.lua`'s provenance.
Neither affects any result — both files are present and `w18run.py` is the
documented way to regenerate `w18-elem.tsv`.

## 6. WHAT SURVIVED THE HARDEST LOOK

- **op `$10` BGELEM (`$262160`)** byte-faithful: `move.w (a1)+,d0;
  move.l (a1)+,d1; tst.w $813190/bne; subi.w #$800,d1; sub.w $813170,d1;
  jsr $262366`. The port's low-word-only subtraction (high word of `arg`
  untouched) is correct — both ROM subs are `.w` on D1's low half.
- **`$23DF2A` sprite stage** byte-faithful: `asr.l #6,d0; andi.l #$7ff03ff;
  ori.l #$80008000` then `d0(l),d2(l),d3(w),d4(w)` + `addi.w #$c,$80afc4`. The
  `asr` vs `lsr` choice is moot — the `andi #$07FF03FF` clears bits 27-31 that
  `asr` would sign-extend, so the port's `>>` and the ROM's `asr` agree.
- **`$24179E` scroll comp** byte-faithful: `tst.w $8130d2/bne; move.l $80b03c,d0;
  swap d0; add.w d0,$2(a6)`. The port reads the high word of the `$80B03C`
  longword (the swapped low half) and adds it to `+2` — the despawn half of the
  arg, not the position half the driver subtracts. Correct.
- **The recorder's two fixes (§5)** are visible in `w18elem.lua`: `before =
  (data - 0x0c) & 0xffff` (derive the pre-bump offset from the value being
  written) and `RAM:read_u8(0x5cc8 + ...)` (share-relative, not the CPU address
  `$805CC8`). The TSV's staged records are non-zero 24-hex strings, confirming
  both landed.
- **Build split.** Every code address cited (`$262xxx`, `$24150A`, `$246BB8`,
  `$23DF2A`, `$24179E`, `$26C20C`) is build B (`$23xxxx-$29xxxx`); the
  `$22xxxx` object-stream pointers are data-segment and build-independent. No
  build-A address is load-bearing in W18.
- **Nothing ROM-derived committed.** The six touched files are all
  `.md`/`.js`/`.mjs`/`.lua`/`.py`; `out/`, `rip/`, `assets/` untouched.

## 7. WHAT I DID NOT RE-MEASURE

- **Frames 3,501..7,317 (handlers 3..11).** The 3,500-frame recording reaches
  ids 12/1/2/0 only; the other 9 are byte-faithful (§1) but not run through the
  gate. A longer `w18run.py` (≥8,000 frames) would cover them; not required by
  the done-when.
- **The `$8130DA` kill arm dynamically.** It is a no-op in-window (rises at
  lf4314); byte-verified at `$2623C2` only. Exercising it needs a midboss-window
  run (W29).
- **A fresh MAME run of `w18-elem.tsv`.** I re-gated the committed corpus; I did
  not re-drive `w18run.py` (the recorder is unchanged from the run that
  produced it, and W17's fresh-run reproducibility already covers the shared
  scaffolding).
- **`flyaround` / `scrollportgate`.** Unchanged by W18 (no scroll/cross-axis
  edit); their last green is on record.

## 8. VERDICT

APPROVE. The denominator is honest and byte-faithful; `$246BB8` is correctly
classified as a zero-prototype data block; the `$26C20C`/`$26C24A` rider is
correctly out of scope; the done-when is green with the red seen and restored;
tests and both pixel gates are unchanged at 100.0000 %. The two MINOR findings
(a stale "every updater" comment and an inaccurate §8 manifest) are
documentation nits — fix them when convenient; neither blocks the wave or the
Phase A milestone it closes.
