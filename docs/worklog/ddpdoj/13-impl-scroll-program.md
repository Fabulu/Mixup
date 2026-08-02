# Wave 13 — the scroll program, ported: the whole level scrolls live

status: **DONE.** `src/background.js` runs object type 1, all seven opcodes, the
repeat/unfreeze partner, the entry-clock fast-forward, both cameras, the
register upload and the tilemap ring writer. Two independent gates:
`tools/scrollportgate.mjs` at **0 divergent over 14,443 logic frames across four
scenarios and two entry clocks** on twelve columns, with **nine red mutations**;
and `pgm.py flyaround` at **0 divergent on 88 columns** (up from *1 of 72* — the
column that was red was `$813176`, and its writer is what this wave ported).
`pgm.py demogate` renders the port's OWN background at **15,955,968/15,955,968 =
100.0000 % pixel-identical to MAME** over 159 frames, with a counterfactual that
drops it to 23.65 %.

**CAPTURE LEDGER: L5 REPLACED, L6's program half REPLACED, L15's background half
closed.** The tile PIXELS (L7) are W15's and the page says so out loud.

date: 2026-08-02
role: implementer (the only agent writing `games/ddpdoj/`)
target: `ddpdojblk`, **VERSION-B** (2002.10.07 BLACK VER). Every address is
build B (`$23xxxx–$29xxxx`) unless the line says otherwise
(`games/ddpdoj/NOTES-build-split.md`) — and **one line does**, §3, which is the
biggest thing this wave found.

**WAVE NUMBERING, stated once so nobody is misled.** The brief labels this W13.
`20-plan-level-and-patterns.md`'s own W13 (the `$24C476` fall-through) was closed
by `12_5-impl-fallthrough-24C476.md`. What this wave actually executed is the
plan's **W14 (the camera and the scroll spine) and W16 (the scroll VM) together,
plus the decode half of W18's op-`$10`**. Both plan entries are marked DONE with
a pointer here. W15 (the tiles) and W18 (the elements) are untouched.

---

## 0. THE BLOCKING DEFECT, FIRST

`12_5-review` blocked on `tools/breakage.mjs` not parsing: two unescaped
apostrophes inside single-quoted strings (`the ship twin's` at :197 and
`$24C4EC's` at :203) added by that commit's `FIRE_EXPECTED_GREEN`. Seven stages
of `pgm.py check` import it transitively and died before doing any work.

```
$ node --check tools/breakage.mjs
tools/breakage.mjs:197
    + '($20,A4) is 0), so `lsr.b #1` and the ship twin's `lsr.w #1 / andi.b '
                                                       ^
SyntaxError: Unexpected identifier 's'
```

Fixed (two backslashes). `node --check` now passes on `breakage.mjs`,
`portdiff.mjs` and `determinism.mjs`. **I hit the identical defect once myself,
in `scrollportgate.mjs`, and `node --check` caught it in seconds — it is worth a
pre-commit habit, not a review finding.**

## 1. WHAT I BUILT

| file | what it is |
|---|---|
| `src/background.js` | **NEW.** The whole subsystem: `$26127A` dispatch and its 3-frame warm-up, `$26114C` init, `$2612A0` per-frame, `$262062` interpreter, all seven opcode handlers, `$261F76`, `$261FDA`+`$26200E`, `$26146C`/`$2613B4`/`$2613FC`/`$261420`/`$2614BA` (the player-driven cross axis), `$240B0E`/`$240B94`/`$240C22`/`$240F08`, `$140FFE`, `$240D76`, plus `BgVram` (`$900000`) and `VideoRegs` |
| `src/main.js` | `defaultHandlers` gains `[1] = $240F62[1]`; the game carries `vram`, `video`, `scrollEvents` |
| `src/isr.js` | the 2nd of the four ISR6-gated routines is PORTED — `$140FFE`, the register upload. §3 |
| `src/machine.js` | `ROM.isr6RegUpload` / `ROM.isr6RegUploadBuildB` |
| `src/state.js` | 16 new compared columns in `WATCH_SPEC` and `CLAIMED`; **and a latent bug fixed** — `stateVector` read every `:l` column as a WORD while `frame.lua:1014` writes a LONG (§6) |
| `src/player.js` | two entries removed from `FROZEN_GLOBALS` and one NAME corrected: `$8130CE` is not "bomb stock", it is the distance odometer |
| `src/web/app.js`, `src/web/assets.js`, `index.html` | the page's background is the port's; missing tiles are counted and printed |
| `tools/export-tables.py` | 4 new ROM windows (§7) |
| `tools/scrollportgate.mjs` | **NEW.** The gate, 12 columns, 9 mutations |
| `tools/demogate.mjs` | now draws the PORT's background, and gains `bg-frozen-camera` |
| `tests/background.test.js` | **NEW**, 26 listing-derived tests |
| `tools/oracle/pgm.py` | 4 new `check` stages + one more demogate RED |
| `tools/breakage.mjs` | §0 |

## 2. THE HEADLINE — twelve columns, 14,443 frames, two entry clocks

```
$ node tools/scrollportgate.mjs
FRAMES 10431 compared (lf1621..12051), window ended at lf12052: $8130D2 rose and
  its INTRA-FRAME ORDER against the background object is unported
COLS   12: d0ce d18a d18c b012 b016 b034 b038 b03c scr0 scr1 bgx bgy
EXTSPEED $813180 consumed on 1 frame(s) (lf 4379)
SCROLL EVENTS the port's VM executed: spawn=22 bgelem=13 cue=1 defer=1
MAP COLUMNS written into $900000 by $240D76: 669
RESULT 0 DIVERGENT FRAMES on 12 columns over 10431 logic frames
```

| trace | entry clock | frames | result |
|---|---|---|---|
| `w17-stage1-invuln-p2.tsv` (the whole stage) | `$0000` | **10,431** | 0 divergent, 12 columns |
| `bg-attract.tsv` (the attract demo) | **`$0038`** | **1,364** | 0 divergent, 9 columns |
| `bg-deep.tsv` (deep play, dies) | `$0000` | **1,668** | 0 divergent, 9 columns |
| `bgrecon.tsv` | `$0000` | **980** | 0 divergent, 9 columns |

**14,443 logic frames.** The 10,431 and the 1,668 are exactly `scrollgate.py`'s
own published numbers (`17-impl` §2, `20-recon-scroll-engine` §7) — the port
reproduces the Python model's windows to the frame without importing it.

Eight columns beyond the plan's required four: `$80B016` and `$80B038` (the
cross axes, which validate the D1 half of both accumulators), `$80B034` (the TX
along axis — `$240C22` was previously validated by nothing), `$80B03C` (the word
every background element will read in W18, and the one the recon said had no
writer), the two script record cursors `$813192`/`$8131AA` (wave 17's own record
ledger, so a WRONG RECORD is a mismatch and not merely a wrong state) and both
uploaded hardware registers `$B03000`/`$B02000`.

`pgm.py flyaround` — the whole port, in the object driver's own slot order,
against a live board:

```
RESULT 0 DIVERGENT FRAMES on 88 columns over 2200 logic frames
WALLHITS 284 ($261126)
```

72 → 88 columns, and **`1 of 72` → `0 of 88`**. The one that was red was
`scroll` = `$813176`; `src/web/app.js`'s header had carried "ONE COLUMN IS STILL
RED AND IT IS NOT THIS WAVE'S" since wave 11. Its writer is `$26151E`, inside
`$26146C`, inside the background object. It is ported and it is green.

Distinct values each new column takes inside that window, so "compared" is not
"compared for free": `b012` 1,076, `d18c` 256, `d0ce` 136, `d170/d172/d174` 65
each, `d18a` 34, `scr0` 10, `d16e`/`scroll` 3. `d0d2` and `d190` take one value
each and are declared watches, not claims.

**AND EVERY OTHER GATE IS STILL GREEN with object type 1 running inside it** —
the background object joins the driver's slot walk, which reorders nothing but
does write `$813176` and clear the players' `($5c,A1)` every frame:

```
pgm.py shipgate     RESULT 0 DIVERGENT FRAMES over 2200 logic frames, staged AND emitted
pgm.py dlgate       RESULT: 0 DIVERGENT FRAMES -- byte for byte from the board's staged bytes
pgm.py firegate     free-running 2571 frames 0 DIVERGENT / re-seeded 2572 frames 0 DIVERGENT
node tools/determinism.mjs   IDENTICAL -- 2200 logic frames, 88 columns, three runs, one digest
```

## 3. THE MEASUREMENT THIS WAVE MADE FOR ITSELF: `$240CC0` DOES NOT RUN

`20-plan` §2 W14 says "the register upload gated inside IRQ6" and names
`$240CC0`. **`$240CC0` is build B's copy and it does not execute.** The routine
that runs on a VERSION-B run is **build A's `$140FFE`** — the second of the four
routines behind `$13C7E6`'s gate, which `src/isr.js` has been counting as
UNPORTED since wave 2. `NOTES-build-split.md` exists for exactly this.

The two are the same routine except that build B's folds in the screen shake:

```
140ffe: A0=$80B010 ; A1=$B02000 ; A2=$B03000      240cc0: (identical)
141010: D0=($2,A0) ; D1=($6,A0)                   240cd2: (identical)
141018: lsr.l #6 D0 ; lsr.l #6 D1                 240cda: (identical)
                                                  240cde: sub.w $80B054,D0   <--
                                                  240ce4: sub.w $80B056,D1   <--
14101c: (A2)=D0.w ; (A1)=D1.w                     240cea: (identical)
```

Which one runs is decidable from data already on disk. Over the wave-17 corpus,
10,738 consecutive frame pairs of stage 1:

```
frames 10738 | noshake($140FFE) match 10738 | shake-subtracted($240CC0) match 10696
```

The shake form is wrong on **exactly the 42 frames** `$80B054`/`$80B056` are
non-zero — the boss's shake at lf11922..11964, which wave 17 found and which
wave 10 and the recon had both recorded as unreachable. So a port that took the
build-B routine would have been invisible for 10,696 frames and wrong for 42.

`upload-subtracts-shake` is a red switch on the gate and it reddens `bgx` on 42
frames and `bgy` on 35 and nothing else. To make it *able* to go red the gate
has to supply `$80B054`/`$80B056` from the board (the shake is `$260EC8`'s and
is unported) — which is stated in the gate's header, because a mutation that
subtracts a zero the port never writes is not a mutation.

## 4. THE NINE RED SWITCHES, ALL SEEN RED

`node tools/scrollportgate.mjs --break all`, ACTUAL:

| mutation | falsifies | result |
|---|---|---|
| `clock-per-frame` | `$26132C` — the clock is an ODOMETER | RED 9 cols, first `d0ce`@lf1905 |
| `loop-word-as-iterations` | `$262134` — the loop word is the PASS COUNT | RED 9 cols, first @lf1900 |
| `len-not-lenplus1` | `$262130 addq.w #1,D0` | RED 9 cols, first @lf1896 |
| `reload-lenplus1` | `$261FD0` reloads at len | RED 9 cols, first @lf1900 |
| `cond-word-honoured` | `$262082` is unconditional | RED 9 cols, **from lf1621** (nothing executes) |
| `commit-the-fraction` | `$240BA4`'s `&~$3F` | RED on **b012/b034/bgx ONLY**, first @lf2379 |
| `upload-subtracts-shake` | build B's `$240CDE` | RED on **bgx=42 bgy=35 ONLY**, first @lf11923 |
| `prefill-14-columns` | `$261202 moveq #$e` + `dbra` = 15, not 14 | RED `d18a` on the FIRST compared frame |
| `no-fast-forward` | `$26200E` | declared **EXPECTED-GREEN at entry clock 0** (`$26200E` returns immediately when `$8130CE` is 0) and **RED on 6 of the attract trace's 9 columns from its first frame** |

The last three are the ones worth reading. `commit-the-fraction` moves only the
two camera longs and the register derived from them; `upload-subtracts-shake`
moves only the two registers. A gate whose columns all move together on every
mutation is one column pretending to be twelve — this one is twelve.
`no-fast-forward`'s expected-green declaration is **entry-clock conditional**
(`EXPECTED_GREEN(entry)`), because a blanket declaration would have excused the
mutation on the trace where it matters.

`prefill-14-columns` also **BLOCKED** with a named throw 55 frames after it
first diverged — the short pre-fill walks the column pointer off the front of
the stream at the boss lock's rewind (`UNPORTED $225B54: outside every ROM
window`). The gate reports the divergences it had gathered AND the block; a
named throw that erased the divergence report would have pointed at the blast
radius instead of the cause.

## 5. WHAT I FOUND THAT NOBODY HAD: `$8130D2`'s TWO WRITERS DISAGREE ON ORDER

Building the gate turned up something `scrollgate.py` structurally cannot see.
`$8130D2` (the background freeze) is raised by three unported writers, and **the
frame on which it rises does not have a single answer for whether the background
handler already ran**:

| event | trace, frame | `$8130D2` at the sample point | `$80B012` on that frame |
|---|---|---|---|
| the STAGE CLEAR (`$28D5D6 → $25FCFA → $25FD82`) | `w17-...-p2`, lf12052 | 1 | **advanced** `$147380 → $147480` |
| the DEATH PAUSE (`$25FD94 → $25FD82`) | `bg-deep`, lf3289 | 1 | **did not move** |

Same flag, opposite answer, 8,763 frames apart. A port fed only the sample-point
value cannot tell them apart, and picking either reading costs the other run
$20..$100 for the rest of it — MEASURED both ways while building this: 308
divergent frames on the wave-17 corpus with the death reading, 814 on `bg-deep`
with the stage-clear reading. So **the gate's window ends at the first rising
edge**, loudly, and the intra-frame ordering is W18/W28's. That is also exactly
`scrollgate.py`'s *effective* window, which is why the two agree at 10,431 and
1,668 — it skips flagged frames and its runs happen to end shortly after.

A second, smaller one of the same shape: `$813180` (the external speed push) is
`1` at the SAMPLE POINT of lf4378 and consumed on lf4379, so `$2610FE`'s
unidentified caller also sits *after* the background object in the table. The
gate arms the push for the frame after the row that shows it, and it carries
wave 17's measured `($813182, $813184) = ($0020, $0020)` in a named table that
**throws** if the corpus ever shows a push it has no measurement for. The
consumer arm at `$2612AA..$2612CC` is ported and RUNS once in the stage — W17
warned that skipping it would be "right in stage 1 by luck".

## 6. A LATENT DEFECT IN THE COMPARED-COLUMN MACHINERY

`frame.lua:1014` reads a `:l` watch column with `read_u32`. `state.js`'s
`stateVector` read every non-`'b'` size with `u16`. So a longword column was
compared as its HIGH WORD against the board's full longword.

It never fired because the only `:l` column before this wave was `b054`, which
is `$00000000` on every frame anyone has ever sampled — both sides printed `0`
and the defect was invisible **by construction**. Six of this wave's columns are
real longwords and would have gone red for the wrong reason. Fixed, with a test.

## 7. WHAT IS PORTED, AND WHAT IS DELIBERATELY NOT

**All seven opcodes are ported**, which is more than `20-plan` W16 asked for
(it scheduled `$00/$10/$14/$18` as loud throws). The distinction I drew is
between an opcode's OWN arithmetic and its CALLEE:

| op | the port does | the callee |
|---|---|---|
| `$00` SPAWN | walks the object stream, decodes `(ptr, param)`, advances `($4,A6)` — **including the `$FFFFFFFF` arm that does NOT write the cursor back** (`$2620EC` branches past `$2620FC`) | `$24150A` — **counted, by address, with the record's clock and the pointer**. 22 of 22 stage-1 entries reached |
| `$10` BGELEM | resolves the per-stage handler table and the handler, computes `arg - $800 - $813170`, honours the `$813190` skip | `$262366` — counted, with the id, the CONSTRUCTOR ADDRESS and the argument. 13 of 13 reached, and the 13 addresses match `17-impl` §5's measured constructors minus `$E` |
| `$14` CUE | walks the cue stream, all three sub-ops; **sub-op 0 is ported outright** (it is pure state: `$8131C2`/`$8131C4`) and the deferred countdown+dispatch at `$26209E` is ported | `$28C170`/`$28C186`/the callback `$28CB88` — counted. Sound is excluded (`20-plan` §7 item 1) |
| `$18` FLAG | the 1..4 rung ladder into `$81B414..$81B41A` | none. **Never executed in stage 1** (stage index 4 only) — reached by a unit test, not by the corpus |

A quiet return would have been a defect in its own right, so every callee is an
`unportedLog.note()` carrying the ROM address, the record's clock value and the
data it would have used. The gate prints all 36 of them. **An eighth opcode and
a fourth cue sub-op are loud named throws** (`$2620C2` / `$2621AA`) — both are
real hazards, because `$262086` and `$262196` index their tables with no bound
check and would `jsr` into data.

**Not ported, named, and why:**

* `$26233A`, the 8-slot background-element driver, and the 13 constructors — W18.
  Counted on every frame, including frozen ones (`$2613A0` runs it either way).
* `$260EC8`, the screen shake — W18/W30. Counted. `$813186` is measured live for
  43 frames of the boss (W17 §9), so this is a real gap, not a cold path.
* `$2415E8`, the BG palette upload — W15. Counted once, with the block address.
* `$26C24A`, the SECOND BG-map writer W17 found (23 columns x 9 rows for 271
  frames, 64 % of the stage's map traffic, tile base `$32A90000`) — **not
  touched, and it is the thing most likely to bite W15**. Nothing in this wave
  models it; the four scenarios' compared columns do not include the map bytes,
  so this wave's 0-divergent claim says nothing about those 271 frames' PICTURE.
* Stages 2–5's column streams are **not exported**, so a `$813096` other than 0
  is a loud throw by address. There is a unit test for it.
* `ctrl` (`$23C008`) and `bg_scale` (`$23C5DC`): both are write-once constants
  ($001F / $0210 on all 16,000 measured frames), the page still takes them from
  the capture, and the caller of `$23C008` is NOT identified. Stated in
  `VideoRegs`, and a W19 rider.

## 8. THE PAGE — and the honest limit

`src/web/app.js` now hands the renderer the PORT's `$900000` ring and the PORT's
four scroll registers in place of the recording's. The ring is SEEDED from the
capture's frame-0 `bg` (63 columns the board wrote before the recording started;
the port writes at most one column per column-step and an empty ring would blank
the rest) — the recording is the input, never the output.

**What that does not give you is the whole stage's PICTURE.** The bundle holds
415 harvested BG tiles; stage 1 references 1,820. So the moment the port scrolls
past what the recording flew over, the ring asks for tiles the sheet does not
hold. The missing-tile path used to be an unconditional `AssetError` and that
was right when every tile came from the recording. It now **splits**: the
capture's own tiles still throw at load from `verifyCoverage` (naming the frame
and the tile), and a tile the PORT's ring asks for is **counted in
`bundle.missingBgTiles` and drawn as the transparent pen**, with the count on
the status line as `miss N`. A blank column that says "1,405 tiles missing, W15"
is honest; a page that dies four seconds in is not, and one that quietly repeats
the recording is worse.

The pixel proof that the SCROLL itself is right, over the window where the tiles
DO exist and against MAME's own framebuffer, is `demogate` — which loads the
real IGS023 regions and therefore has every tile:

```
$ python tools/oracle/pgm.py demogate
PASS: the port drives the ship and the page's own render path is
      15955968/15955968 = 100.0000% identical to MAME over 159 frames

$ python tools/oracle/pgm.py demogate --break bg-frozen-camera
EXPECTED-RED [--break bg-frozen-camera]: 3773953/15955968 = 23.6523% -- diverged, as it must
```

That counterfactual is not decoration: a 100 % match "with the port's own
background" is worth nothing unless the substitution can be seen, and holding
the camera at its first value must wreck 161 frames that scroll 160 px. It does.

## 9. THE CAPTURE LEDGER — what this removes

| # | before | after |
|---|---|---|
| **L5** | video registers: bg x/y, tx scroll, ctrl, bg_scale, rowscroll | **REPLACED.** `bg_xscroll`/`bg_yscroll` are `$140FFE`'s output from the ported `$240B94`; `tx_xscroll`/`tx_yscroll` are `$23C5F2`'s write-once constants, in the port. `ctrl`/`bg_scale`/rowscroll are still the capture's — all three constant on 16,000 measured frames, writers named, rowscroll still all-zero |
| **L6** | BG tilemap ring + its motion program | **REPLACED, the PROGRAM half.** The VM, the camera, `$261F76`, `$26200E` and `$240D76` are the port's; `$900000` is written from the cartridge's own column stream, 669 columns over the stage. The ring's INITIAL CONTENTS are still seeded from the capture and the tile PIXELS are L7 |
| **L15** | the 161-frame loop bound | **background half CLOSED.** The camera, the registers and the map program run the stage's 7,317 frames and then hold at the boss lock — correctly; `17-impl` §4 proved the lock is never exited. The background's PICTURE is still bounded by L7's 415 tiles |
| L7 | BG tile pixels + palette | **unchanged, and now the page's visible limit.** W15 |
| L1 | the thirty sprite buckets | unchanged (this wave adds no producer) |

## 10. RUN IT AGAIN

```
cd games/ddpdoj
node --check tools/breakage.mjs                     # the W12.5 blocker
node --test tests/                                  # 200 tests, 26 of them new
node tools/scrollportgate.mjs                       # 10,431 frames, 12 columns
node tools/scrollportgate.mjs --break all           # 9 mutations
node tools/scrollportgate.mjs tools/oracle/out/bg-attract.tsv --entry 0x38 --k 2636
node tools/scrollportgate.mjs tools/oracle/out/bg-attract.tsv --entry 0x38 --k 2636 \
     --break no-fast-forward
python tools/export-tables.py --verify              # 20 ROM windows, 25,744 B
python tools/oracle/pgm.py flyaround                # 0 of 88, 2,200 lf
python tools/oracle/pgm.py demogate                 # 100.0000 %
python tools/oracle/pgm.py demogate --break bg-frozen-camera
python tools/oracle/pgm.py check                    # 4 new stages, no MAME needed
```

## 11. WHAT I GOT WRONG ON THE WAY

1. **I read `$8130D2` from the same row and got 308 divergent frames.** Then I
   read it from the previous row and got 0 — and 814 on `bg-deep`. Tuning it
   either way would have shipped a gate that was green on the corpus I was
   looking at. §5 is what came out of not doing that.
2. **`$80B03C` is the HIGH word of the TSV's `read_u32(0xb03c)` column**, not the
   low. Masking with `& 0xffff` compared `$80B03E` against `$80B03C` and gave
   8,291 divergent frames that looked like a camera defect.
3. **`$261194`'s D0 is still live at `$261198`.** The init's two accumulate calls
   take `(clock & 3) << 9` as D0, not zero. It is 0 at entry clock 0 AND at the
   attract's `$0038` (`$38 & 3 = 0`), so no gate on earth would have caught it —
   translated as written, with the comment saying why it is invisible.
4. **`$262102`'s register sense is inverted from what it looks like.** `lea
   ($10,A5),A2 / tst.w D6 / beq / lea ($a,A5),A2` means script 0 (D6 = 1) uses
   `($a,A5)`. Same shape at `$26213A`. I wrote it backwards first.
5. **The deferred cue callback fires on the BORROW** (`subq.w #1` then `bcc`
   skips), i.e. a countdown of 0 fires on the arming frame itself. I wrote a test
   asserting `$8131C4` still held the pointer afterwards; `$2620B6` clears it.
6. **A `moveq #$e` + `dbra` is fifteen.** My first pre-fill test asked for 8
   stream columns and the port threw by address on the fifteenth — which is the
   ROM window doing its job, but it cost me ten minutes of reading the wrong
   thing.

## 12. WHAT THE REVIEWER SHOULD LOOK AT HARDEST

1. **§5, the `$8130D2` intra-frame ordering.** I chose to END THE WINDOW rather
   than pick a reading. If you think one reading is defensible, the 308 or 814
   frames past the edge are recoverable — but the two measurements really do
   disagree and I could not find a rule.
2. **`crossFromBoard`.** The scroll gate does not drive `$26146C`; it supplies
   `$81316E`. That routine is validated only by `pgm.py flyaround` (2,200
   frames, columns `d16e`/`d170`/`d172`/`d174`/`scroll`, 3–65 distinct values
   each, 284 wall hits). If you think that is thin cover for `$2613FC`/`$261420`
   — the TWO-PLAYER free-camera arms — you are right: P2 is dead in every
   scenario this project has, so `$261420`'s second call returns at its first
   instruction on every measured frame, and the whole `$81316A` clamp ladder at
   `$261444..$261464` is listing-only. It is ported as written and unvalidated.
3. **`EXT_SPEED_PUSH`.** One hardcoded measured pair in a gate. It throws if the
   corpus ever shows a push it cannot account for, but it IS a number from a
   worklog rather than from the TSV, and it is the only one.
4. **`$26C24A`** (§7). 64 % of the stage's BG map writes come from a routine
   nobody has read, for 271 frames. This wave's columns cannot see it. If W15
   ships tiles and the page shows the wrong background for 271 frames in the
   middle of the stage, this is why.
5. **The missing-tile split in `src/web/assets.js`.** I turned an unconditional
   throw into a counted transparent tile for the BG path only. That is a
   deliberate weakening of a load-time check and the argument for it is in §8;
   check that the CAPTURE's own coverage check (`verifyCoverage`) is genuinely
   untouched, because if it is not, a mismatched bundle now draws blanks
   silently instead of saying so.
6. **`stateVector`'s `:l` fix** (§6). It changes how `b054` is read on every
   existing gate. It has been `0` on every frame ever sampled, so nothing should
   move — but "should" is doing work in that sentence.
