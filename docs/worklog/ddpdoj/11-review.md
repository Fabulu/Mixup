# WAVE 11 - REVIEW (reader; no src/ edits kept, no commits)

status: **DONE** - verdict DEFECTS-FOUND (two, neither in the gated transform).
reviewer wave: 11-review   date: 2026-08-01
under review: commit `25455c2` (22 files, +3333/−133) and
`docs/worklog/ddpdoj/11-impl-display-list-keystone.md`.
target: `ddpdojblk`, VERSION-B. Machine pin re-printed on every run below:
`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 B, `BUILD required=B last=2`.

Method: read the diff; disassemble the ROM at every cited address with
`xref.py dasm` and check the translation line for line; re-run every
measurement the report quotes from a FRESH MAME dump; break three checks and
watch two of them red; restore and hash.

---

## 1. THE HEADLINE - everything the report claims, re-measured, reproduces

Fresh dumps (not `--reuse`), three MAME runs of 2,600 logic frames each:

```
pgm.py dlgate
  frames compared 1901 (lf700..lf2600)   DIVERGENT FRAMES 0 (hardware-visible 0)
  records max/frame 120 of 251   entries 123/256   fillers max 2
  buckets with any bytes  0 1 2 3 5 7 14 15 17 19 20 23 25
  $80B054  00000000:1901
  W11 display_list_writer_pcs 10 distinct: 23D6B4 23D6B6 23D6BE 23D6B8 23D6F4
                                           23D6EE 23D6FA 23D680 23D686 23D68C
  ZOOM TABLE: running machine matches the baked $23C588 blob on all 16 entries

pgm.py dlgate --cap    0 DIVERGENT; 251 records, 4 fillers, 256 entries,
                       runtime_cap_carry=600, drop20=600, drop6/9=600,
                       capbuckets capbucket_80AFC2:600, terminated 1901/1901
pgm.py dlgate --cap0   0 DIVERGENT; runtime_cap_carry=0, both drops 600

pgm.py dlgate --reuse --break all
  BASELINE open/cap/cap0: PASS PASS PASS
  cap-as-ge RED[cap0]  terminator-by-count RED[cap,cap0]  always-terminate GREEN
  no-preemptive-drop RED[cap,cap0]  drain-order-reversed RED[all]  no-filler RED[all]
  filler-every-52-flat RED[all]  b054-two-16bit-adds GREEN  emit-mask-03ff RED[all]
  no-flip-patch RED[all]  sum-without-queue RED[all]  no-counter-clear RED[cap]

node --test games/ddpdoj/tests/     142 tests, 142 pass
pgm.py shotgate                     RESULT 0 DIVERGENT FRAMES on 56 columns
                                    (the 4 new: b002 b004 b054 sprctr)
pgm.py zoomcov                      eff-index-0F COVERED on both encodings and
                                    both axes; eff-index-10 COVERED;
                                    ZOOM COVERAGE: COMPLETE;
                                    EXPECTED-RED zoom-off diverged;
                                    EXPECTED-RED zoom-f-literal diverged
demogate    PASS 15955968/15955968 = 100.0000% over 159 frames
bundlegate  PASS 15955968/15955968 = 100.0000%  (published bundle)
webgate     PASS 11 files over HTTP, one frame 100352 px
```

Every number in the implementer's headline reproduced exactly. No pixel gate
regressed.

## 2. THE LISTING, LINE FOR LINE - what I checked against the ROM

All build B. `python tools/oracle/xref.py dasm`:

* `$23D2B4..$23D362` - the sum is 1 `move.w` + 29 `add.w`, and its order is
  `C0 C2 C4 C6 **D2** C8 **D4 D0** CA CC CE D6 D8 DA DC DE E0 E2 E4 E6 E8 EA EC
  EE F0 F2 F4 F6 F8 FA`. `SUM_ORDER` in `src/displaylist.js` matches word for
  word. The §2d correction ("a THIRD order") is right.
* `$23D372 subi.w #$bd0 / $23D380 ext.l / $23D382 move.w D0,$80B000 /
  $23D388 divs.w #$c / $23D38C move.w D0,$80AFFE` - the port's signed
  truncating division matches `divs`.
* `$23D3A8..$23D3D8` - the drop policy, by NAME: `$80AFDE` first, `sub.w D0,
  $80B000 / bmi`, then `clr.w $80AFD2` + `clr.w $80AFD4`, flags `$80B002` /
  `$80B004`. Ported as named-bucket drops, not truncation (proved in §4).
* `$23D3E0..$23D61E` - 29 drain sites. I extracted all 29 `(buffer, counter)`
  pairs and they equal `BUCKETS[1..29]` in `src/spritequeue.js` exactly, and
  `BUCKETS[6/9/20].counter` = `$80AFD2/$80AFD4/$80AFDE`, so the drop policy's
  indices are the drain positions the ablation table names.
* `$23D726..$23D760` - the guarded copy verbatim: four `move.l (A0)+,(A2)+`
  (16 B) against `addi.w #$c` (12 B), `cmpi.w #$BC4 / beq $23D75A`,
  `clr.w (A1) / ori #$1,SR`. The port is faithful.
* `$23D624..$23D6CC` - the emit. `andi.l #$F800F800` / `andi.l #$07FF3FFF` /
  `add.l $80B054,D1` / `andi.l #$07FF3FFF` / `or.l D3,D1`, then
  `move.b (A1)+,D3 / or.b (A1)+,D3 / move.b D3,(-$6,A0)`. THE THREE ARITHMETIC
  TRAPS ARE ALL PORTED CORRECTLY:
  - `asr.l #6` is one 32-bit arithmetic shift across both fields in
    `enqueueRequest` (`(((long<<16)|short)|0) >> 6`);
  - the re-mask is `$3FFF` and it happens AFTER the `add.l`;
  - so an overflow reaches bits 13..11, which `parseSpriteList`
    (`src/render/spritelist.js`) reads as `yzom` - the pollution path is the
    hardware's. `assertShortAxis` watches the DELTA across the add, which is the
    right question (the value is legitimately non-zero on zoomed records).
* `$23D6DA move.w #$12,D1 / bsr $240adc / $23D6E2 / $23D6E8 cmpi.w #$BC4,D1`
  and **`240adc: 4e75 rts`** - a bare `rts`, D1 survives as `$0012`. **The
  recon's "terminator skipped at 251" is refuted; the implementer is right.**
* `$23D676 moveq #$33` / `$23D67E moveq #$32` / the second `subq.w #1,D4` at
  `$23D694`: 51 then 50. **FOUR fillers at 251, not five.** Right.
* `$23D70C lea $80AFC0 / move.w #$1d,D0 / move.w D1,(A0)+ / dbra` = 30 words,
  `$80AFFC` survives. Right.
* `$23BFE2..$23C006` - the main loop is `call1 $256D5A / call2 $2410BC /
  call3 $24683E / **call4 $23D2AE** / arm $23C212 / $23D12A`. `src/main.js`
  puts `buildDisplayList` in exactly that slot.
* `$23C588` is byte-identical to `$00DF2C` and `$13C8F4` and to the baked
  `ZOOM_TABLE`, and `$23C5C8` uploads 16 longwords to `$B01000`. Confirmed by
  reading the decrypted image directly.
* `$23E54A` table: entry 24 → `$23E726` = ×24, entry **25 → `$23E730` = ×21**
  (`D0=x; D1=2x; 4x; 5x; 10x; 20x; 21x`), entry 26 → `$23E740` = ×26, entries
  32..63 all `$0023E64A`. The implementer's decode is right.
* `bsr`-target scan reproduced independently in 12 lines of Python:
  **29 → `$23D726`** (wave 5's number), **8 → `$240ADC`**, **0 → `$23D9E2`**.
  `bsrscan.py` reports the nine buckets 6, 9, 10, 11, 12, 20, 24, 26, 27 with
  0 abs-long and 0 bsr, and bucket 20 fed by `move.w A4,_` at
  `$28A12A/$28A198/$28A1B4/$28A1D0`. Matches §7.

Build-A addresses in the new code: only `$00DF2C`/`$13C8F4` (the zoom blob,
explicitly labelled as the same 64 bytes in three images) and `$13C398` in
`w11dl.lua` (the "ROM ERROR !" halt PC - the same constant `frame.lua:239`
uses project-wide). No defect.

## 3. FALL-THROUGH HUNT - one hit

`$23D724` is `rts`, so call #4 does not fall into `$23D726`. But:

```
23c194: move.w #$1,D0 / or.w  D0,$80393c.l / bra $23c008
23c1a2: move.w #$1,D0 / not.w D0 / and.w D0,$80393c.l / bra $23c008
23c008: lea $b0e000.l,A0 / move.w $80393c.l,(A0) / rts
```

**Both helpers call #4 uses fall through into `$23C008`, which mirrors
`$80393C` into `$B0E000` - the IGS023 control register whose bit 0 is the
SPRITE-DMA ENABLE** (`NOTES-machine.md` line 238; `10-recon-background` §6
lists `$23C00E` as the ctrl writer). So call #4 turns sprite DMA OFF before it
rewrites the list and ON again after, twice per frame, and the port models
neither write. See finding F2.

## 4. BREAKING THINGS AND WATCHING RED (three breaks, hashes both ways)

`sha256sum src/displaylist.js src/spritequeue.js src/zoomtable.js` recorded
before and after; **restored byte-identical** (`20066923…`, `3039febe…`,
`487b2cfa…`).

1. **Non-invasive** - corrupt entry `$F` of the `--zoomram` argument:
   `FAIL ZOOM TABLE MISMATCH (1/16): entry $F: … has 00000001, $23C588 has
   00000000`, **exit 1**. The boot assertion is real.
2. **Break #1, the cap policy is NAMED** - `BUCKETS[20]` → `BUCKETS[21]` in
   the pre-emptive drop (bucket 21 measures 0 records everywhere in this
   scenario, so the *list* is unchanged):
   `open` GREEN, **`cap` RED 453 frames, `cap0` RED 453 frames**, reported as
   `lf2002: the display list agrees but call #4's OTHER outputs do not --
   $80b000: port 02 board 01`. This is the answer to "named-bucket drops or a
   truncation that merely looks similar": the gate can tell, and only because
   `$80AFC0..$80AFFF` + `$80B000..$80B005` are compared as well as the list.
3. **Break #2, the filler cadence** - `fillerFirst` `0x33` → `0x34`:
   **RED on all three dumps, 1,599 frames each** (hardware-visible 600 / 308 /
   11).
4. **Break #3, the §1 equivalence claim, tested rather than believed** - replace
   the 16-byte copy with the naive 12-byte one (`k<12`, `a0+=12; a2+=12`):
   **0 divergent on all three dumps.** So the ROM's 16-byte copy really is an
   identity map over the accounted region and the port's faithful translation
   is provably harmless. §1's reasoning holds; it is an equivalence, not a
   measurement the gate can distinguish, and the worklog says so.

## 4b. `pgm.py flyaround` IS RED, AND IT IS PRE-EXISTING - verified independently

```
pgm.py flyaround                       (this tree, 53 columns)
  DIVERGE scroll   first at lf=2321: port=0 board=65472
  RESULT 1 of 53 columns diverged                                exit 1

git archive 25455c2^ | tar -x   then the SAME portdiff invocation on the SAME
trace and seed:
  COLS 50 …
  DIVERGE scroll   first at lf=2321: port=0 board=65472
  RESULT 1 of 50 columns diverged
```

Same column, same logic frame, before and after the wave. `scroll` is
`$813176`, whose build-B absolute-long writer list includes `$261520` - inside
the unported background object, i.e. **W14**. Wave 11 added three columns
(`b002`, `b004`, `b054`) and no divergence. §8.2's claim is confirmed; this is
not a wave-11 regression, and `pgm.py check` would report it as a failure
today for a reason that predates this commit.

## 5. FINDINGS

### F1 (MODERATE) - `$23D9E2`'s second scale-table index is halved

`src/spritequeue.js:291`

```js
const scaleLong = SCALE_TABLE[(widthByte & 0x3e) >> 1];     // $23DA10..$23DA1C
```

The ROM:

```
23da10: 703e        moveq #$3e,D0
23da12: c02e 000e   and.b ($e,A6),D0      D0.w = byte@(A6+$E) & $3E
23da16: e548        lsl.w #2,D0           D0.w = that * 4  -- a BYTE offset
23da18: d0c0        adda.w D0,A0          A0 = $23E54A + that*4
23da1a: 2050        movea.l (A0),A0       entries are 4 bytes -> INDEX = that
```

The entry index is `(byte & $3E)`, not `(byte & $3E) >> 1`. The port picks
entry *n*/2 and multiplies by half the ROM's scale on the long axis. Two things
in the file prove the code and not the comment is wrong: the comment three
lines above the bug says `-> entry index = width*2` (i.e. `byte & $3E`), and
the comment at `spritequeue.js:247` explains that entries 32..63 are a guard
"for the out-of-range indices the second dispatch can produce" - with `>>1` the
index can never exceed 31 and that guard is unreachable.

The first dispatch is correct (`lsr.w #1` then a byte offset = `height/8`,
ported as `(height>>1)>>2`).

Not gate-visible: `$23D9E2` has no producer (`xref.py callers` finds none, my
own `bsr` scan finds 0), so no scenario reaches it and `dlgate` cannot see it.
**But `tests/displaylist.test.js:187` locks the defect in**: its expected value
hardcodes `* 2` for the long axis where the ROM gives `* 4`
(`size = (2<<9)|0x20` → `byte@(A6+$E) = $04` → `$04 & $3E = 4` → entry 4 = ×4).
The test was written from the port, not from the listing, so it is a check that
cannot fail. The worklog's §8.1 calls this routine "translated … and
unit-tested against hand-computed values"; the hand-computed value is wrong.

### F2 (MINOR) - call #4's `$80393C` helpers also write `$B0E000`, and the port drops it silently

`src/displaylist.js:11, 23, 274, 462` describe `$23C1A2` / `$23C194` as
`and.w`/`or.w` on `$80393C` and stop there. Both routines end in
`bra $23C008`, which does `move.w $80393C,$B0E000` - the IGS023 control
register (sprite-DMA enable). The port makes neither hardware write, the
address is not in `WATCH_SPEC`, and there is no `unreached`/`note` marking the
gap. `tests/displaylist.test.js:411` asserts the helpers "touch nothing else",
which the listing refutes.

No consequence today: the port's renderer takes `ctrl` from the capture's video
registers (`src/render/index.js`), and the value at the sample point is
identical either way because `$23C194` restores bit 0 before the arm. But the
plan gives ctrl to **W14** ("ctrl at the loop head"), and W14 will inherit the
belief that the loop head is the only writer. Worth one line in W14's brief.

### F3 (INFORMATIONAL) - the four new `shotgate` columns are constant-zero on both sides

`b002`, `b004`, `b054` and `sprctr` are all identically zero at every sample
point of `stage1-shot` (the drops never fire in natural play; `$80B054` has
never moved; the thirty counters are cleared by call #4's tail on both sides).
"0 divergent on 56 columns, four of them new" is true and reads stronger than
it is. `src/state.js` is honest about exactly this, and the red validation that
matters (`no-counter-clear`) lives in `dlgate` and goes RED on `--cap`. Nothing
to fix; do not quote the column count as coverage.

### F4 (INFORMATIONAL) - divergent-frame counts under a mutation are not independent

`tools/dlgate.mjs` carries one 128 KiB list image across the run (correctly -
the board never clears `$800000..$8009FF`), so the first divergence poisons the
residue of every later frame. My break #2 reports exactly 1,599 on all three
dumps. The counts are a *presence* signal, not a count of independent failures.
The tool's own `divergentLive` split is the useful number.

## 6. NOT RE-RUN - and what a regression there would look like

* **`pgm.py ablate`** (31 MAME runs; the bucket→pixels table and bounding boxes
  in §6, and the L18 replacement). A regression = a mis-named bucket, which
  would mis-wire W12 (ship/pods/exhaust = 19/15/5), W13 (14), W23 (22/23).
  Partially cross-checked: I re-ran `dlgate --census` on my own dump and it
  reproduces the record counts the table's frames were chosen from (bucket 0
  max 100 / mean 27.38, bucket 20 max 24, buckets 3/5/17 live but zero at
  pass 1's four frames, bucket 22 zero for the whole scenario).
* **`pgm.py gfx`, `gfx --mutate all`, `pixslice`, `pixdemo`, `overrun`,
  `gate`, `assets check`, `determinism.mjs`, `pgm.py check` end to end.**
  A regression = decoder / determinism / overrun-model drift, invisible to
  `dlgate` and to the three pixel gates I did run.
* **The `$23D9FA` odd-address throw on real hardware** - unreachable by
  construction; listing-only, as declared.
* **Bucket 25's "identical box 400 frames apart" anomaly** (§6) - recorded
  unresolved by the implementer; I did not investigate it.

## 7. ENVIRONMENT WARNING (not a wave-11 defect)

The shared git index currently holds staged **deletions** of most of
`games/ddpdoj/src/` and all of `docs/worklog/ddpdoj/`:
`git ls-files games/ddpdoj/src/` returns two files, and `git checkout --
games/ddpdoj/src/displaylist.js` fails with `pathspec … did not match`. I
restored my temporary edits with `git show HEAD:<path> > <path>` instead. This
is `PLAN-no-recordings.md` §6 risk 7 live: **anyone committing must
`git read-tree HEAD` into a private index immediately before `git add`, and
read `git diff --cached --name-only` before committing.**

## 8. VERDICT

The deliverable is sound. Main-loop call #4 is translated faithfully at every
address I checked, the gate is real (I broke it twice and watched it go red on
the right scenarios and stay green on the one where the path is absent), the
three corrections to `10-recon-display-list` are all correct, and every number
in the report reproduces from a fresh dump. L17 and L18 are legitimately
REPLACED and L1 legitimately CONVERTED.

Two defects, both **outside** the gated transform: the zoom-enqueue's long-axis
scale index (F1, with a unit test that locks it in) and the `$B0E000`
fall-through (F2). Neither can move a byte of any measured column today; both
will be inherited by later waves if not fixed now.
