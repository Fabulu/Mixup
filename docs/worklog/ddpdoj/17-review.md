# Wave 17 review - the invulnerable 9,500-frame stage-1 measurement run

status: **DONE - DEFECTS FOUND (none blocking).** Every headline number in
`17-impl-invuln-stage-run.md` reproduced, including on a fresh MAME run I took
myself. Three defects: one **wrong ROM address that produced a false absence
claim**, one **broken reproduction recipe**, and one **under-stated absence**
that a later wave could read as licence to drop a live path.

date: 2026-08-02
role: reviewer (READER - no `src/` edits, no commits)
target: `ddpdojblk`, **VERSION-B**. Every address below is build B unless the
line says otherwise (`games/ddpdoj/NOTES-build-split.md`).

---

## 0. WHAT I RE-RAN, AND WHAT IT SAID

All commands from `games/ddpdoj/tools/oracle/`.

```
$ python scrollgate.py out/w17-stage1-invuln-p2.tsv 0 1620 0
  reset detected at lf=12360 -- window ends here
  frames compared: 10431   handler-skipped ($8130D2=1): 308
  DIVERGENT: clock=0  cursor=0  acc=0  b012=0            <- claim reproduced

$ python w17ledger.py out/w17-stage1-invuln-p2.log
  MODEL 57 (script0=41, script1=16), op-$10=13 / BOARD 57 / MISMATCHES: 0
  BGELEM model=13 board-constructions=13 / MISMATCHES: 0 / GATE GREEN
```

**All five scrollgate reds and all five ledger reds fire, with the exact
numbers the worklog tabulates** (scrollgate `clock-per-frame` 7031/9998/10133/
10139; `loop-word-as-iterations` 7148/10138/6525/10147; `len-not-lenplus1`
2385/7816/10151/10151; `cond-word-honoured` 10431/10372/10354/10431;
`commit-the-fraction` 0/0/0/**3120** - only `$80B012`. Ledger 57/48/53/53/2).

**A FRESH RUN OF MY OWN.** `python w17run.py 5000 w17-REVIEW-repro`
(~2 min) → `out/w17-REVIEW-repro.tsv`. Its 5,000 rows are **byte-identical to
the corpus' first 5,000 rows**, `scrollgate` on it is 0-divergent over 3,380
frames, and the constructor ledger matches lf-for-lf. The corpus is
reproducible from the committed tooling.

**Corpus figures re-derived independently** (not trusting the worklog's
arithmetic): 837 distinct clocks with **no gap in `$0000..$0344`**; first
`$0344` at **lf8936 = 1620 + 7316**; held **3,424** frames; `$813096` 0 → 4 at
lf12359; the 308 `$8130D2=1` frames are **contiguous, lf12052..12359, clock
parked at `$0344`, `$80B012` frozen at `$00147480` across all of them**; live
mask `01→03→07→0F→1F`, `$1F` for 6,734 frames; rank `$0000 → $007A`;
`$813098` = 0 on all 16,000 rows; 13 element births at handler+`$E`, each
exactly once, in the script's id order (12,1,2,0,3,5,4,6,8,7,9,10,11).

**§9 re-derived:** exactly **271 contiguous frames lf4315..4585**, 267 at 414
tap fires and 4 at 432 = 112,266; minus the 4 concurrent ring-writer frames
(4 × 18 = 72) = **112,194, matching the `$26C24A` census line to the byte**.
Shake: 43 frames lf11922..11964, 42 with a non-zero offset, 26 distinct
non-zero pairs.

**Regression, older corpora:** `bg-deep` 1,668/0 divergent; `bgrecon` 980/0;
`bg-attract` (`0 2636 0x38`, the documented k) 1,364/0. Control TSV re-gated:
2,202 frames, 814 skipped, reset lf4637 - the 4.7× is real.

**Pixel gates, unchanged at 100.0000 %:**
```
bundlegate  15955968/15955968 = 100.0000% over 159 frames   PASS
demogate    15955968/15955968 = 100.0000% over 159 frames   PASS
webgate     11 files, 517 ms, 100352 px                     PASS
node --test games/ddpdoj/tests/   163 pass, 0 fail
```

**Nothing ROM-derived was committed.** The two commits touch eight files, all
`.md`/`.py`/`.lua`; `out/` and `rip/` are both `check-ignore`-confirmed.

## 1. THE GATES CAN FAIL - BROKEN FROM THE BOARD SIDE, NOT JUST THE MODEL SIDE

The built-in `--mutate` switches perturb the MODEL. They cannot catch a gate
that reads the wrong TSV column or a constant. So I broke the **board** side,
on copies, and hashed the originals before and after (`sha256sum -c`: both
**OK**, byte-identical afterwards).

| break | result |
|---|---|
| `$80B012` +`$40` on one row (lf6000) | `b012=1`, `('b012', 6000, '0x47b00', '0x47ac0')`, other three still 0 |
| ring cursor +1 on one row (lf7000) | `cursor=1`, `('cursor', 7000, '0x2e', '0x2d')`, other three still 0 |
| shift ONE `$262092` HUNTLOG line by +1 lf | `RECORD-LEDGER MISMATCHES: 1`, `lf1621 script0 rec $261618 model frame 0 -> lf1620`, **GATE RED** |
| delete ONE executed record's tap pair | `board ran 40 script-0 records, model runs 41` + 40 cascade mismatches, **GATE RED** |
| delete ONE `ELEMLOG` construction | `BGELEM MISMATCHES: 13`, **GATE RED** |

Both gates fail safe on truncation too: a HUNTLOG cap hit shortens the board
list, which trips the length check and reddens rather than silently agreeing.

## 2. `w17ledger.predict()` vs `scrollmap.cmd_sim` - the check §12 item 5 asked for

Ran both in one process and aligned them (dropping `cmd_sim`'s one non-dispatch
event, `REPEAT DONE @279`):

```
sim 57  pred 57   mismatched pairs: 0
```

The two independent copies of the VM agree on **all 57 dispatches and all 57
frames**. `cmd_sim` tracks `speed_bg`/`speed_tx` separately and `predict()`
tracks only script 0's - correct, because `$26213A` selects `($1C,A5)` on
`D6≠0` (script 0) and `($22,A5)` on `D6=0` (script 1), and only `($1C,A5)`
drives the odometer.

## 3. ROM SPOT-CHECKS - the cited bytes, read back

Verified against `out/maincpu.bin` via `xref.py dasm`:

| worklog claim | ROM | verdict |
|---|---|---|
| `240c7c: move.w D0,$80B03C` (90 B into `$240C22`) | `33c0 0080 b03c` at `$240C7C`; `$240C7C-$240C22 = $5A = 90` | ✔ |
| `240c9c: move.w D1,$80B03E` | `33c1 0080 b03e` | ✔ |
| `$262068 lea $813192,A6` / `$262092 move.l A1,(A6)` | `4df9 0081 3192` / `2c89` | ✔ |
| `$262082` is an **unconditional** `addq.w #2,A1` | `5449` - no branch | ✔ (and `scrollmap script 0` prints `cond words seen: $FFFFx41`, so `cond-word-honoured` is a genuine misreading, not a strawman) |
| `$25FD82 move.w #1,$8130D2` / `$25FD8C clr.w` | ✔ | ✔ |
| `25fcfa: bsr $25FD82 / lea $813144,A0 / jmp $241238` | ✔ | ✔ |
| `$28D5AC..$28D5BE clr.w $81B414..$81B41A`, `$28D5D6 jsr $25FCFA` | ✔ | ✔ |
| `$28D5D6` is the ONLY abs-long caller of `$25FCFA` | `xref callers 25FCFA` → one hit | ✔ |
| `$26C242..$26C250`, base `$32A90000`, D6=`$16`, D7=`$8`, A0=`$9000A4` | ✔ | ✔ |
| `$2612AA..$2612CC` is the `$813180` consumer | ✔, and it runs **before** `$262062` | ✔ |
| `$26115E` clears `$81316A..$81318D` (`moveq #$11,D0`, 18 words) | ✔ - accounts for `extfreeze` 2 writes and `extspeed` 6 | ✔ |
| `$26224A` 13 entries, constructor = handler + `$E` | ✔, `$2623B2: move.l #$2623C2,($8,A6)`; `$2623C2: tst.w $8130DA / bne` | ✔ |
| `$261186` → `($20,A5) = (clock&3)<<9` | `andi #3 / lsl #3 / lsl #6` | ✔ |
| **`$2610FE: move.w #$1,$813180`** | **NO - see §4.1** | ✘ |

`w17stage.lua` columns 1..25 are **byte-for-byte** `bgrecon.lua:181`'s format
string and argument list - I diffed them literally, and `scrollgate.py` runs on
the new TSV unmodified, which proves it.

## 4. DEFECTS

### 4.1 MODERATE - `$2610FE` is not an instruction, and the "no caller" absence is false

`17-impl-invuln-stage-run.md` §3d prints

```
2610fe: move.w #$1,$813180      ; a three-line leaf setter, no absolute-long caller
261106: move.w D0,$813182
26110c: move.w D1,$813184
261112: rts
```

That is a **misaligned disassembly transcribed without re-aligning**. The real
code, and the PCs the run itself measured:

```
261100: 33fc 0001 0081 3180  move.w  #$1, $813180.l     <- HUNTLOG @261100
261108: 33c0 0081 3182       move.w  D0, $813182.l      <- HUNTLOG @261108
26110e: 33c1 0081 3184       move.w  D1, $813184.l      <- HUNTLOG @26110E
261114: 4e75                 rts
```

(MAME's write-tap `CURPC` is the instruction **start** here - confirmed on
three independent taps: `$240C7C`, `$2623B2`, `$261100`.)

The consequence is not cosmetic. §3d says *"`$2610FE` has **no absolute-long
caller**; `xref.py` cannot see `jsr (d16,PC)`… so the arming site is
unidentified… that is a hypothesis, not a measurement."* Against the right
address:

```
$ python xref.py callers 261100
  $26B73A  jsr $261100          <- and eight more
  $26D802 $26D864 $26E04C $26E152 $26F614 $26F6C6 $2A5D28 $2A61E0

26b72c: clr.w   $8130d8.l
26b732: move.w  #$20, D0        <- the measured $813182 = $0020
26b736: move.w  #$20, D1        <- the measured $813184 = $0020
26b73a: jsr     $261100.l
```

`$26B73A` is inside the stage-1 midboss handler `$26B6FA` - the same routine
whose `$26B7D8` the wave measured setting `$8130DA`. **The "hypothesis" was
statically provable in one command**, and the project's own rule ("only the
listing proves absence") was applied to an address that does not exist.

The wrong address is repeated in `20-plan-level-and-patterns.md` (the W17 DONE
block and §7 item 6), in the `20-recon-scroll-engine.md` pointer, and in
`7ab2066`'s commit message.

**Not blocking:** the 0-divergent result is unaffected - see §5.

### 4.2 MODERATE - `w17run.py` never writes the `.log` the readers require

`w17run.py` prints `pgm.run`'s `PROBE` lines to stdout and writes only the TSV.
`w17ledger.py` and `w17report.py` both consume `out/<tag>.log`. §11's
"RUN IT AGAIN" block does not redirect. Measured on my own fresh run:

```
$ python w17run.py 5000 w17-REVIEW-repro          # OK, TSV written
$ python w17ledger.py out/w17-REVIEW-repro.log
  FileNotFoundError: 'out\w17-REVIEW-repro.log'
$ python w17report.py out/w17-REVIEW-repro.tsv
  PROVENANCE UNKNOWN -- no INTERVENTION line in out\w17-REVIEW-repro.log;
  treat every number below as unlabelled and do not quote it
```

So on a clean reproduction the wave's **second gate does not run at all** and
the **provenance-labelling machinery §0 rests on silently degrades to
UNKNOWN** - the exact failure `docs/knowledge/09` names. The committed logs
came from an undocumented stdout redirect (the trailing `TSV <path> (4230274
B)` line, which is `w17run.py`'s own print, proves it). One-line fix in
`w17run.py`, or a `>` in §11.

### 4.3 MODERATE - `$81317E`'s absence is under-stated against the listing

§3c: *"Over 16,000 logic frames… **nothing sets `$81317E`**"*, correctly bounded
as a per-run absence. But the listing was not consulted, and it has the path in
full:

```
261138: 33fc 0001 0081 317e  move.w #$1,$81317E    rts     ; external FREEZE
261142: 33fc 0002 0081 317e  move.w #$2,$81317E    rts     ; external UNFREEZE
2612d8: move.w $81317E,D0 / beq $2612FE / clr.w $81317E
2612e8: cmpi.w #$1,D0 / beq -> move.w #$1,($8,A5) ; else clr.w ($8,A5)

$ python xref.py callers 261142
  $26C7F4  jsr $261142
  $26D254  jsr $261142
```

Two setters, a **two-valued** protocol, a consumer at `$2612D8..$2612FE` that
writes the object's own freeze word, and the unfreeze setter has two
absolute-long callers - one of them in `$26Cxxx`, the very family §9 flags as
unread. The worklog gave `$813180` the right instruction ("W18/W30 must still
port `$2612AA..$2612CC`") and gave `$81317E` no equivalent, so a later wave can
read "never written" as licence to drop `$2612D8..$2612FE`. It must not.

### 4.4 MINOR - the ledger's BGELEM half never checks handler identity

`w17ledger.py:238-242` unpacks the model's `pid` and the board's `pc` and then
compares **only** `pf + k != lf`. "13/13 background elements" therefore means
*13 constructions on 13 correct frames*, not *13 correct handlers*; a
handler-table mis-index that preserved the frames would pass. (I checked the
identity by hand out of the log: all 13 board PCs are `$26224A`-table entry +
`$E`, each exactly once, in script order - so the claim is TRUE, just not
gated.)

### 4.5 MINOR - two boss-length-derived durations quoted without `[DIST]`

§3b's *"stays 1 until… lf12360 - **8,046** consecutive frames"* and §5's
*"stays at `$1F` for **6,734** frames"* both end at the boss death, which §8
item 1 already declares distribution-sensitive. The endpoints are labelled; the
two durations are not. Everything else in §8's six-item list checks out, and
the element birth frames are correctly treated as coverage (they are
clock-driven, not player-driven).

### 4.6 MINOR - §9's "64 % of all BG map traffic **in the stage**"

The denominator, 174,862, is the whole **16,000-frame run** - it includes
stage 2 and the boot VRAM clears (`$23C642:24576`, `$13C9AE:16384`, the
`$000Exx` family). 112,194/174,862 = 64.2 % is right for the run; "in the
stage" overstates it. The finding itself is solid and reproduced exactly.

### 4.7 COSMETIC

* `w17report.py`'s docstring says "26..43 are wave 17's"; the row has **49**
  columns and `rows()` requires `len >= 49`. The `C` map stops at 42.
* `w17stage.lua:371` comments "44..49: the cheap riders"; 44..47 are the W26
  active-window ladder. The per-field comments below it are right.

## 5. WHAT SURVIVED THE HARDEST LOOK

**§3d's no-op reasoning is CORRECT, and I checked the half the worklog did
not.** The override pushes D0→`$813182`→`($1C,A5)` and D1→`$813184`→`($22,A5)`,
i.e. **both** speed fields. `scrollmap script 0` shows script 0's record at
t=`$00F0` set `$0020` and script 1's record at t=`$00F0` set `$0020`, and the
next SPEED on either script is t=`$01E4`. At the push (clock `$00F8`) both
fields already held `$0020`, so the write is inert in both axes, not just the
one the four columns watch. `$2612AA` also runs *before* `$262062`, so no
same-frame record could mask it. **The 0-divergent result is not resting on an
unexamined path.** The instruction to port `$2612AA..$2612CC` anyway stands.

**§4's caller inference is stronger than the worklog claims.** `$25FD82` has
exactly one absolute-long caller (`$288AD0`, the banner) and the `bsr` from
`$25FCFA` is PC-relative and invisible to `xref`. But the run measured
`$28D5AC/$28D5B2/$28D5B8/$28D5BE` firing on **lf12051, the same frame** as the
`$25FD82` write, and `$28D5AC → $28D5D6` is one unconditional straight line
(`clr.w ×4`, then `jsr $23C47A / $260EBE / $28EC86 / $25FCFA`) whose target's
first instruction is `bsr $25FD82`. Co-frame + straight-line ⇒ `$28D5D6` fired.
`$288AD0` is not *excluded*, but `$25FD82` was written exactly **once** in
16,000 frames, on that frame. The conclusion holds; the self-flagging in §12
item 2 was honest and slightly too modest.

**§5's "slots are never freed" is measured on `+8` only - and the tap can only
see `+8..+B` by construction** (`w17stage.lua:228`). The claim is correctly
scoped in the worklog. W18 must not widen it.

**The 308-frame skip is never exercised with a resume** - it is one contiguous
block at the very end and the window closes immediately after. I checked the
branch is right anyway, from both sides: `$2612A0: tst.w $8130D2 / bne $2613A0`
and `$2613A0: jsr $26233A / jsr ($260EC8,PC) / rts` - no camera advance - and
`$80B012` is frozen at `$00147480` on all 308 rows. `scrollgate`'s "skip ⇒ do
not advance" is correct, it is just untested for the resume case.

**Build split.** Build-A addresses do appear in the census (`$15F73E`,
`$149ED0`, `$13BEB2/$13BEBC/$13BE24`, `$13C9AE`) - every one inside the first
~700 logic frames or a boot clear, exactly as `NOTES-build-split.md` predicts,
and §0 states the rule. **No build-A address is load-bearing in any
conclusion.** `W17_REQUIRE_BUILD=B` printed `fails=0` on my fresh run too.

**Line endings / commit hygiene.** `ba4dce4`'s claim checks out: the plan file
is 0 CR / 569 LF and `git diff 4c43af8 ba4dce4` on it is **three hunks, 46+/6-**.
`scrollgate.py` is CRLF in the committed blob, but it was CRLF before W17
(184 CR at `4c43af8`) - inherited, like `scrollmap.py`. Not this wave's.

**The shared `.git/index`** shows 67 staged deletions, but it is dated
Aug 1 16:43 - *before* wave 17. `.git/dojA.index` is dated Aug 2 01:08 and the
two commits touch only their eight files. Another workflow's stale index, not
this one's.

## 6. WHAT I DID NOT RE-MEASURE

* **Frames 5,001..16,000 of the invulnerable pass.** I reproduced 1..5,000
  byte-identically on a fresh MAME run; the boss lock, the shake window and the
  stage-2 handoff come from the implementer's on-disk corpus. A regression
  would look like a different lf12360 boundary or scrollgate reddening late.
* **The `--no-invuln` control as a MAME run.** I re-gated the existing TSV
  (2,202/814/reset lf4637) but did not re-drive it.
* **Pass 1** (`w17-stage1-invuln.tsv`). Compared byte-wise to pass 2 across all
  43 shared columns (0 differing rows) but not re-produced - its 8-fewer-taps
  configuration is not in the committed `.lua`.
* **`out/maincpu.bin`.** Every listing check, including §4.1, trusts the
  existing decrypted image. If it were stale, all of them move together.
* **`gfxgate` / `shipgate` / `pixgate` / `dlgate` / `determinism.mjs` /
  `portdiff` / `breakage` / `attachreport` / `build-dist.mjs`.** Wave 17 changed
  no `src/`, so a regression there belongs to another wave.
* **`$26C1xx`** - flagged, unread, by design (§9).
* **Gradius and Batman** - out of scope by instruction.
