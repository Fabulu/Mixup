# Wave 17 - the invulnerable whole-stage-1 measurement run

status: **DONE.** The four columns compare at **0 divergent over 10,431 logic
frames** - the whole of stage 1 plus its boss lock - the record-execution
ledger matches the model **57/57 records and 13/13 background elements
frame-exactly**, and **all four W17 taps yielded a writer**. Two blockers the
plan had booked for later waves also closed. Nothing was ported; nothing left
the CAPTURE LEDGER.

date: 2026-08-02
role: implementer (measurement wave - the only agent writing `games/ddpdoj/`)
target: `ddpdojblk`, **VERSION-B** (2002.10.07 BLACK VER). Every address is
build B (`$23xxxx–$29xxxx`) unless the line says otherwise
(`games/ddpdoj/NOTES-build-split.md`). The first ~700 logic frames of every run
below are build A (the chooser); `W17_REQUIRE_BUILD=B` asserts the *last* logic
frame was armed from build B and printed `fails=0` on every run.

---

## 0. THE PROVENANCE BANNER - read this before quoting one number

Every dynamic number in this document comes from a run with **two labelled
interventions**:

1. **INVULNERABILITY.** `$810424` - the player record's `($3E,A6)`
   invulnerability countdown, record base `$8103E6` - is written `$FF` at the
   board's own sample point on **every logic frame from lf 1250**. The board
   still *flags* hits; the player never dies.
2. **AUTOPILOT.** P1 Button 3 (auto-shot) held from lf 1800, plus a 12-frame
   left / centre / right / centre oscillation from lf 1900 - the owner's own
   routine (sit bottom-centre, hold the shot, move left and right a little).

`docs/knowledge/09` §"Intervention runs give you STATES, not a picture of the
game" governs what may be concluded:

* **VALID here - coverage.** Which scroll records execute and when, which
  handlers are reached, which addresses have writers, whether the stage can
  end. A record either executed on frame N or it did not, and no amount of
  off-distribution play changes the answer.
* **INVALID here - the game.** Spawn timing, bullet density, difficulty pacing,
  how long a boss takes, what rank does. §8 lists every one of them by name.

Every figure below that depends on the interventions carries **[DIST]**.

## 1. WHAT I BUILT

| file | what it is |
|---|---|
| `games/ddpdoj/tools/oracle/w17stage.lua` | the recorder. Columns 1..25 are **byte-for-byte** `bgrecon.lua:181`'s row so `scrollgate.py` runs on it unmodified; 26..49 are wave 17's. Carries the two interventions, 16 write taps and the BG-element construction ledger |
| `games/ddpdoj/tools/oracle/w17run.py` | the driver. Goes through `pgm.run` - `pgm.py` stays the ONE machine entry point, so `-noreadconfig`/`-nowriteconfig`/private cfg+nvram/the pin all come from there. `--no-invuln` is the control |
| `games/ddpdoj/tools/oracle/w17ledger.py` | **a new gate**: the board's own record-execution ledger vs the listing-derived model, record for record and frame for frame, with five red mutations |
| `games/ddpdoj/tools/oracle/w17report.py` | the reader. Prints provenance **read back from the run's log**, never hardcoded |
| `games/ddpdoj/tools/oracle/scrollgate.py` | **six red switches added** (`--mutate`), and the measured-result block updated from 1,668 frames to 10,431 |

Runs on disk (all `out/`, gitignored - ROM-derived):

```
w17-stage1-invuln.tsv       16,000 lf   pass 1
w17-stage1-invuln-p2.tsv    16,000 lf   pass 2, + 8 more taps    <- the corpus
w17-stage1-noinvuln-ctl.tsv  9,000 lf   THE CONTROL, no intervention
w17-smoke.tsv                2,400 lf   shakedown
```

## 2. THE HEADLINE - the stage, end to end, and it ENDS

```
$ python scrollgate.py out/w17-stage1-invuln-p2.tsv 0 1620 0
  reset detected at lf=12360 -- window ends here
  frames compared: 10431   handler-skipped ($8130D2=1): 308
  DIVERGENT: clock=0  cursor=0  acc=0  b012=0
```

| | before W17 | after W17 |
|---|---|---|
| frames the 4-column gate covers | 1,668 (22.8 % of 7,317) | **10,431** - the stage **and** the boss lock |
| clock values reached | `$0000..$00D0` (209 of 837) | **all 837, `$0000..$0344`** |
| scroll records validated | ~17 of 57 | **57 of 57** |
| background elements reached | 4 of 13 | **13 of 13** |
| cues | 0 of 2 | **2 of 2** |
| boss lock | never reached | reached at lf8936, held 3,424 lf, **exited** |

**The recon's headline number is now measured, not simulated.** Stage 1 to the
boss lock is 7,317 logic frames: the model puts record `$261618` (t=`$0000`) at
sim frame 0 and the board executed it at **lf1620**; the model puts the boss
lock at sim frame 7,316 and the board parked the clock at `$0344` at **lf8936 =
1620 + 7316**. Every one of the 57 records lands on `lf = simframe + 1620`.

## 3. THE FOUR HUNTED WRITERS - all four found, none blocked

The plan (§2 W17, §7 item 8) named four addresses the port must not guess over.
All four are **write taps** - the only reliable 68000 execution hook.

### 3a. `$80B03C` - FOUND, and the recon's absence claim was wrong

`20-recon-scroll-engine` §9 item 6: *"`$80B03C` is read by `$24179E` to
scroll-compensate every background element and I did not find its writer - it
is not written by `$240B94` or `$240C22`."*

It is written by `$240C22`. The write is 90 bytes into that routine's body,
past the point a reader stops - **the fall-through trap in its other costume**:

```
240c6a: add.w  D0, $80B048        ; a THIRD sub-pixel accumulator, TX side
240c70: move.w $80B048, D0
240c76: andi.w #$FFC0, D0         ; whole pixels only
240c7a: neg.w  D0                 ; NEGATED
240c7c: move.w D0, $80B03C        ; <- the per-frame element compensation
240c82: andi.w #$3F, $80B048      ; keep the fraction
240c9c: (the same shape for $80B03E)
```

Measured: `writes=28142 pcs=[240C9C:14071 240C7C:14071]` over 16,000 lf - once
per logic frame each, from lf1617 on. 20 distinct values over the stage.
`$24179E` reads it as a LONG and `swap`s, so the word at `$80B03C` is what
lands in `($2,A6)`; a second entry point at `$2417B6` returns the pair in D2/D3
and **zeroes both when `$8130D2` is set**. A ported element that ignores this
drifts by exactly the whole-pixel part of one frame's scroll, every frame.

### 3b. `$8130DA` - FOUND: the midboss turns the background elements off

```
26b4c0: move.w #$0,$8130DA     ; measured lf3097, clock $00C5
26b7d8: move.w #$1,$8130DA     ; measured lf4313, clock $00F4
```

`$26B6FA` is the stage-1 midboss handler (`20-recon-enemy-census`). The gate
goes **1 at lf4314 and stays 1 until the stage is torn down at lf12360** - 8,046
consecutive frames. Every BG-element updater tests it (`$2623C2: tst.w $8130DA
/ bne -> die`). It does **not** free the slot: the live-slot mask stayed `$1F`
across the whole 8,046 frames (§5), so "die" suppresses the updater, it does not
deallocate. W18 must read that arm rather than assume it.

### 3c. `$81317E` (external freeze) - NEVER WRITTEN, and now that is measured

```
HUNT extfreeze_81317E   writes=2 pcs=[26115E:2]
```

Both writes are `$26115E`, the object init's `move.w #0,(A0)+` clear loop over
`$81316A..$81318D`. Over 16,000 logic frames covering the whole of stage 1, a
midboss and a boss, **nothing sets `$81317E`**. Measurement proves presence;
this is an absence, so it is bounded: *no frame of a whole-stage-1 run sets it*,
not *the game never does*.

### 3d. `$813180/$813182/$813184` (external speed) - FOUND, and it fires ONCE

```
2610fe: move.w #$1,$813180      ; a three-line leaf setter, no absolute-long caller
261106: move.w D0,$813182
26110c: move.w D1,$813184
261112: rts
```

Measured, exactly once in the stage:

```
lf4377/clk00F8@261100:813180=0001
lf4377/clk00F8@261108:813182=0020
lf4377/clk00F8@26110E:813184=0020
lf4378/clk00F8@2612B4:813180=0000   <- $2612B4 consumes and clears it
```

**And it was a no-op**, which is why the model still compared at 0 divergent
without modelling it: the script's own record at clock `$00F0` had already set
speed `$0020` (0.500 px/f) and the next speed record is `$01E4`, so the push
wrote the value that was already there. That is a *measured* coincidence, not a
licence - W18/W30 must port `$2612AA..$2612CC` as written, because a port that
skips it is right in stage 1 by luck. (`$2610FE` has **no absolute-long
caller**; `xref.py` cannot see `jsr (d16,PC)`/register-indirect calls, so the
arming site is unidentified. Its being one frame after `$8130DA` goes high and
64 frames after the midboss appears points at the midboss; that is a hypothesis,
not a measurement, and it is not needed to port the consumer.)

## 4. THE BOSS-LOCK EXIT - named, with the listing and the frames

The recon's open question: *"the stage-1 boss lock is permanent until something
OUTSIDE the VM intervenes"*, and it named `$813180`/`$81317E` as the two
candidates. **Neither is the answer. The background object is destroyed.**

Measured sequence, one run, one stage:

| lf | clock | what the board did |
|---|---|---|
| 8936 | `$0344` | `04 FFF2 000E FFFF` + `0C` execute; the clock parks. 3,424 frames of the 14-column loop follow |
| 12051 | `$0344` | `$28D5AC..$28D5BE` `clr.w $81B414/$81B416/$81B418/$81B41A` - the bullet active-window ladder is torn down |
| 12051 | `$0344` | `$25FD82: move.w #$1,$8130D2` - **the whole background handler stops** (`$2612A0`'s first instruction) |
| 12052..12359 | - | 308 frames with `$8130D2 = 1`. `$8130BE` (lives) never moves: **this is not a death** |
| 12358 | `$0344` | `$25FD0C/$25FD14/$25FD1C` write `$813092=1`, `$813094=2`, `$813096=4` |
| 12359 | → 0 | `$25FD2E`, a `dbra` clear of 22 words from `$8130CE`, wipes the clock |
| 12360 | 0 | `$26114C`/`$26115E` build a **new** background object; `$262320` clears all 8 element slots |

The routine, from the listing:

```
28d5ac: clr.w $81B414 / $81B416 / $81B418 / $81B41A
28d5c4: jsr $23C47A
28d5ca: jsr $260EBE
28d5d0: jsr $28EC86
28d5d6: jsr $25FCFA          <- the only absolute-long caller of $25FCFA
28d5dc: move.w #$1,$812970
25fcfa: bsr $25FD82          ; SET $8130D2 -- freeze everything
25fcfe: lea $813144,A0
25fd04: jmp $241238          ; DESTROY the background object
```

**Three consequences the port must carry.**

1. **The stage-1 boss lock is never *exited*. The object is destroyed and a new
   one is constructed for the next stage.** A port that waits for the scroll to
   resume waits forever, correctly, and the stage change has to come from the
   flow layer.
2. **`$8130D2` is not only "every player is dead".** `20-recon-scroll-engine`
   §6 identified its writers correctly and then named the flag after one of its
   three callers. The stage-clear path `$28D5D6 → $25FCFA → $25FD82` sets it
   with every player alive, measured. Honest name: **the background freeze**;
   `$25FD94` is one of three things that raises it.
3. **`$813092` is the STAGE INDEX, not the loop count.** `$25FD0C` is one
   setter writing N, 2N and 4N into `$813092`, `$813094`, `$813096` - the same
   number three times. `20-plan` §1's "`$813092/94/96`" list of globals is one
   global. (`$813098`, the fan gate, is a different word and is untouched - §7.)
4. **The 24 "unreachable" stage-1 map columns stay unreachable, measured.** The
   script never leaves the 14-column loop and nothing external resumes the
   stream. `20-plan` W15's "export all 248, do not trim" is still the right
   call for a different reason: the saving is 864 B, and the columns are now
   *known* dead rather than *suspected* dead.

## 5. THE BACKGROUND ELEMENTS - 13 of 13, frame-exact, in five slots

`$262366`'s slot table is `$8131C8`, `$20` bytes per slot, 8 slots - the handler
table pointer `$8132C8` sits exactly `8 × $20` above it, so both numbers check
each other. Every one of the 13 stage-1 constructors writes the per-frame
updater pointer at `(slot + $8)`. Tapping that field gives every birth:

| clock | model frame | measured lf | Δ | constructor | slot |
|---|---|---|---|---|---|
| `$0090` | 694 | 2314 | +1620 | `$26276C` | 0 |
| `$0092` | 710 | 2330 | +1620 | `$26240A` | 1 |
| `$009E` | 854 | 2474 | +1620 | `$262458` | 2 |
| `$00C0` | 1398 | 3018 | +1620 | `$2623B2` | 3 |
| `$00EE` | 2502 | 4122 | +1620 | `$2624AA` | 0 |
| `$00FE` | 2854 | 4474 | +1620 | `$26254A` | 1 |
| `$0114` | 3206 | 4826 | +1620 | `$2624FC` | 2 |
| `$0126` | 3494 | 5114 | +1620 | `$262598` | 3 |
| `$0146` | 4006 | 5626 | +1620 | `$262634` | 4 |
| `$014E` | 4134 | 5754 | +1620 | `$2625E6` | 0 |
| `$0170` | 4678 | 6298 | +1620 | `$262682` | 1 |
| `$018C` | 5126 | 6746 | +1620 | `$2626D0` | 2 |
| `$01AD` | 5654 | 7274 | +1620 | `$26271E` | 0 |

**Nine of those thirteen are past clock `$00D0`** - precisely the nine the plan
said the old corpus could not reach. Each constructor PC is the recon's handler
address + `$E` (`$2623A4+$E = $2623B2`, …, `$26275E+$E = $26276C`), i.e. all 13
entries of `$26224A` are reached, each exactly once - **13 of 13, denominator
from the ROM**.

Slots are **reused round-robin, never freed**: only five slots (0..4) are ever
occupied and the live mask climbs `01 → 03 → 07 → 0F → 1F` and then **stays at
`$1F` for 6,734 frames**, through the entire `$8130DA = 1` window. So an element
"dying" leaves its slot's `+8` pointer intact and the constructor overwrites it.
W18 must read that path; this wave measured the shape and did not open it.

## 6. TWO GATES, BOTH SEEN TO FAIL

### 6a. `scrollgate.py` - the four state columns, now with `--mutate`

```
$ python scrollgate.py out/w17-stage1-invuln-p2.tsv 0 1620 0
  frames compared: 10431   handler-skipped: 308
  DIVERGENT: clock=0  cursor=0  acc=0  b012=0
```

| mutation | clock | cursor | acc | b012 |
|---|---|---|---|---|
| *(none)* | **0** | **0** | **0** | **0** |
| `clock-per-frame` | 7031 | 9998 | 10133 | 10139 |
| `loop-word-as-iterations` | 7148 | 10138 | 6525 | 10147 |
| `len-not-lenplus1` | 2385 | 7816 | 10151 | 10151 |
| `cond-word-honoured` | 10431 | 10372 | 10354 | 10431 |
| `commit-the-fraction` | 0 | 0 | 0 | 3120 |

The last row is the useful one to read: `commit-the-fraction` reddens **only**
`$80B012`, because it is the only mutation that touches `$240B94`. A gate whose
columns all move together on every mutation is one column pretending to be four;
this one is four.

### 6b. `w17ledger.py` - the record-execution gate (new)

State can agree while the program that produced it is wrong. This compares
**events**: `$262092: move.l A1,(A6)` writes the script's record cursor and runs
**only** after a record has been dispatched, so a write tap on `$813192`
(script 0) / `$8131AA` (script 1) fires exactly once per executed record and its
value names the next one. The comparison is positional, so a *wrong record* is a
mismatch and not merely a wrong frame.

```
$ python w17ledger.py out/w17-stage1-invuln-p2.log
BOARD stage-1 window: lf < 12360
MODEL   57 record executions (script0=41, script1=16), op-$10=13
BOARD   57 record executions matched (script0=41, script1=16), k=1620
RECORD-LEDGER MISMATCHES: 0
BGELEM model=13 board-constructions=13
BGELEM MISMATCHES: 0
GATE GREEN
```

| mutation | record mismatches | bgelem mismatches |
|---|---|---|
| *(none)* | **0** | **0** |
| `off-by-one` | 57 | 13 |
| `clock-per-frame` | 48 | 13 |
| `loop-word-as-iterations` | 53 | 13 |
| `len-not-lenplus1` | 53 | 13 |
| `cond-word-honoured` | 2 (model executes 0 records) | 13 |

### 6c. The intervention itself, seen to matter

The control is the same scenario with the poke removed
(`w17run.py 9000 … --no-invuln`):

| | invulnerable | **control, no intervention** |
|---|---|---|
| comparable frames | 10,431 | **2,202** |
| highest clock | `$0344` (837 of 837 values) | `$00E9` (231) |
| lives `$8130BE` | `2` from lf1967 to the end | `2 → 1 → 0 → $FFFF`, three deaths |
| `$8130D2` high | 308 frames (stage clear) | **814 frames (the death pause)** |
| outcome | stage 2 at lf12358 | **reset to title at lf4637** |

That is the 4.7× the wave was for, and it reproduces the old `bg-deep.tsv`
failure exactly (that run also died and sat out 814 frames). It also caught a
bug in my own control: `if lf >= POKE_FROM` made `--no-invuln` (`POKE_FROM=0`)
poke from frame 0 - *more* invulnerable than the treatment. A control that
cannot go red is not a control; fixed to `POKE_FROM > 0 and lf >= POKE_FROM`
and the first "control" run was thrown away. **Passes 1 and 2 predate that
one-line guard**; it is a no-op for any `POKE_FROM > 0`, so the committed
`w17stage.lua` reproduces them exactly, and the control run below was taken
with the fixed file.

### 6d. Determinism, free

Passes 1 and 2 are the same scenario, pass 2 with eight extra write taps.
**16,000 rows, 43 shared columns, ZERO differing rows.** Replay determinism and
tap non-intrusiveness in one check.

## 7. THE CHEAP RIDERS - five later-wave blockers, closed or bounded

The 16,000-frame session was already paid for, so it carried one tap for each
"one tap, assigned to a later wave" item in `20-plan` §7 item 8 / §3. **Nothing
here is ported by this wave.**

| address | plan | measured over 16,000 lf, whole stage + boss |
|---|---|---|
| `$813098` (the fan gate) | W31, *"the single largest gap in the plan"* | **3 writes, all init (`$15F73E`, `$2603E4` ×2), value 0. Zero on every one of 16,000 frames.** The widest net this project has cast at it; the fans stay listing-only |
| `$812950` (global bullet-speed bias) | W31, writer UNLOCATED | **FOUND: `$252C8E`**, `move.w D0,$812950 / rts`, preceded by a `cmp/bls` clamp. **14,382 writes** - essentially every frame - and the value read **0 on all 16,000 frames**. A port that hardcodes 0 is right for stage 1 and is not *correct*: the writer is a live per-frame clamp |
| `$813160` (global bullet-speed bias) | W31, writer UNLOCATED | **FOUND: `$2608BC`**, one write, at stage init, value 0 |
| `$81B414..$81B41A` (bullet active-window ladder) | W26 | **FOUND both directions.** `$2927D2/$2927DA` (boss code) set `$81B414=1` and `$81B416=1` at **lf8185, clock `$01E8`** - *inside* stage 1, before the lock; `$28D5AC..$28D5BE` clear all four at boss death; `$28132A` clears all four at stage init. `$81B418`/`$81B41A` never left 0 |
| `$803910` (re-aim gate) | W28 | **FOUND: `$23BEB2` and `$23BEBC`**, 15,301 writes each - twice per logic frame, from the frame driver |
| `$80FA7E` (the `$2459D0` A4 identity) | W28 | **FOUND: `$244D7E`** (7,016 writes) plus the `$245Axx` family exactly as the recon predicted: `$245A4A $245AB2 $245A7E $245C1E $245BB6 $245AE6 $245BEA $245B1A $245B82 $245B4E …` |

## 8. WHAT THIS RUN MAY NOT BE USED FOR - the [DIST] list

Every figure here is distribution-sensitive and **needs a run the game could
actually produce before anyone trusts it**. Naming them is the point of §0.

1. **The 3,424-frame boss lock.** That is how long *this* player took to kill
   the stage-1 boss while unkillable and holding the shot. It is not the length
   of the fight, it is not a design figure, and W30 must not size anything by it.
2. **Rank, `$81309E`.** It climbed `$0000 → $0034 → … → $007A` across 57 runs of
   value. An invulnerable player never gives rank back, which is exactly the
   mechanism `docs/knowledge/09` warns about. Rank feeds aim, bullet speed and
   enemy HP: **every W22/W26/W27 number taken from this corpus inherits the
   wrong rank trajectory.** The control run's rank is the honest one and it only
   covers 2,202 frames.
3. **`$81B414/$81B416` going to 1 at lf8185.** The *fact* that the boss arms two
   rungs is coverage and is solid. The *frame* is a function of when this player
   reached the boss.
4. **Spawn timing, bullet density, slot pressure, allocation-failure paths.**
   Nothing died, so nothing was cleared by death; pools accumulate under
   pressure ordinary play does not produce. `$26C24A`'s write volume (§9) and
   the 308-frame stage-clear window are both in this class.
5. **Anything about difficulty or pacing.** The word "stage 1 takes 122 s" is a
   *scroll-program* fact (7,317 frames of script) and is safe; "stage 1 takes
   205 s" (the measured lf1620→12358) is **not** - that is this run's boss.
6. **`$812950 = 0` and `$813160 = 0` on every frame.** Both are clamps fed by
   state this run distorts. The absence is real for these 16,000 frames and is
   not a licence to compile the constant in.

Everything in §2–§5 and §7's *writer identities* is coverage and is not on this
list: a record either executed on frame N or it did not, and an address either
has a writer or it does not.

## 9. FLAGGED, NOT SOLVED - one new finding W15/W16/W18 must not inherit blind

**The BG tilemap has a SECOND writer in stage 1, and it is bigger than the ring
writer.** Census over the 16,000-frame run:

```
CENSUS bgvram writer PCs  26C24A:112194  23C642:24576  13C9AE:16384  240D9A:13320 ...
```

`$240D9A` is the ring writer (`$240D76`'s store; a longword on a 16-bit bus is
two tap fires, so 18 fires = one 9-longword map column - 706 frames wrote
exactly one column). `$26C24A` is something else:

```
26c242: move.l (A1)+, D4
26c244: addi.l #$32A90000, D4      ; a tile base that is NOT any of the five
26c24a: move.l D4, (A2)            ; per-stage bases ($0AA9/$12A9/$1AA9/$1EA9/$26A9)
26c24c: adda.w #$100, A2           ; next row
26c250: dbra D7 ($8 -> 9 rows)
        ... dbra D6 ($16 -> 23 columns), A0 = $9000A4
```

Measured: **414 tap fires per frame (23 columns × 9 longwords × 2 bus cycles)
on exactly 271 contiguous frames, lf4315..4585** - 112,194 of the run's 174,862
BG-videoram writes, i.e. **64 % of all BG map traffic in the stage**. It starts
**one frame after `$26B7D8` set `$8130DA = 1`** (§3b), i.e. it is the midboss's.
A port with only `$240D76` reproduces the map correctly for 10,160 frames and
then shows the wrong background for 271 of them.

I did not open `$26C1xx`. It needs its own read (whose object, what `$32A90000`
indexes, whether the 23 columns are the visible window). **Flagging, not
smoothing** - `20-recon-scroll-engine` §9 item 5's spirit.

**The screen shake is NOT cold any more.** Wave 10 and
`20-recon-scroll-engine` §9 item 7 both record `$813186 == 0` over 7,000 and
13,600 frames and call `$260EC8` unreachable. Measured here:

```
$813186 = 1 on 43 contiguous logic frames, lf11922..11964
$80B054/$80B056 (the shake offset) non-zero on 42 of them, 26 distinct pairs
    (1,1) (1,-2) (1,-1) (2,2) (2,-4) (2,-2) (3,3) (3,-6) (3,-3) (4,4) (6,4) (6,6) ...
```

That window sits inside the boss lock and ends 87 frames before the boss dies
(§4) - it is the boss's shake. So `$260EC8` **has** a reachable window and a
measured output sequence, and `$813188` (which I initially and wrongly called
the scroll speed, §10) is one of its variables: `$260E42 $260E64 $260E86
$260EA8 $260EE2 $260F32`. The shake trigger is still unlocated; what changed is
that it is no longer unreachable. `[DIST]`: *that* it fires is coverage; *when*
it fired is this player's boss.

## 10. WHAT I GOT WRONG ON THE WAY, because the next reader will try it

The first draft of `w17stage.lua` derived **A5 = `$81316C`** from "the
interpreter's `($20,A5)` column accumulator is `$81318C`" and named `$813188`
the scroll speed, `$81318E` the TX speed and `$813174` the freeze flag. All
three are wrong:

* `$813188` is in the **screen-shake** block (six absolute-long sites at
  `$260Exx`/`$260F32`);
* `$81318E` has **no absolute-long reference in the 6 MB image** - the smoke run
  recorded `writes=0` and that is what sent me back to the listing;
* `$813174` is written **every frame** by `$261514` (a scroll-position global
  feeding `$813176`); if it were the freeze flag the freeze could never hold,
  and the freeze demonstrably holds.

`($1C,A5)`, `($22,A5)` and `($8,A5)` live in the background **object's** record,
handed out by the allocator at runtime - **there is no fixed address to tap.**
The right hook is the interpreter's own state block (`$813192` / `$8131AA`,
`lea $813192,A6` at `$262068`), which is statically addressable, fires once per
executed record, and is strictly better evidence than a speed word would have
been. The wrong guess cost one 62-second smoke run and is why the smoke run
exists.

## 11. RUN IT AGAIN

```
cd games/ddpdoj/tools/oracle
python w17run.py 16000 w17-stage1-invuln-p2                 # ~6.5 min, 4.2 MB TSV
python w17run.py  9000 w17-stage1-noinvuln-ctl --no-invuln  # ~2.7 min, the control
python scrollgate.py out/w17-stage1-invuln-p2.tsv 0 1620 0
python scrollgate.py out/w17-stage1-invuln-p2.tsv 0 1620 0 --mutate clock-per-frame
python w17ledger.py  out/w17-stage1-invuln-p2.log
python w17ledger.py  out/w17-stage1-invuln-p2.log --mutate off-by-one
python w17report.py  out/w17-stage1-invuln-p2.tsv
```

Five things that will save the hours they cost me:

1. **Do not background a MAME run and return from the tool call.** The orphan
   kept running and appended to the same TSV *and* log as the next run; the
   files looked like one run with two `DONE` lines. Both were deleted.
2. **`W17_POKE_FROM = 0` must mean "never", not "from frame 0".** §6c.
3. **The log groups HUNTLOG lines per tap, not per frame**, so the two scripts'
   ledgers arrive concatenated. A single forward cursor over both silently skips
   records; compare per script.
4. **A long write on the 16-bit bus is two tap fires**, high word then low. Every
   count in §3 and §9 is bus cycles, not stores, and the pointer taps have to
   pair them back.
5. **`$8130CE` is written backwards** by `$261F76`'s resume and **cleared by a
   `dbra` loop** (`$25FD2E`) at stage end - a "clock returned to 0" is the stage
   ending, not a reset, and `scrollgate.py`'s reset detector treats both the
   same way (correctly, for its purpose: the window ends either way).

## 12. WHAT THE REVIEWER SHOULD LOOK AT HARDEST

1. **§3d's no-op.** The external speed override fired once and pushed the value
   the script had already set. I claim the model stays 0-divergent *because of a
   coincidence*, not because the override does not exist. If that reasoning is
   wrong, the 0 in §2 is load-bearing on an unmodelled path.
2. **§4's claim that `$25FD82`'s caller was `$25FCFA`.** I measured the *write*
   PC (`$25FD82`) and the *frame*; the caller is inferred from (a) lives never
   moving, which excludes `$25FDE0`, and (b) `$28D5D6` being the only
   absolute-long caller of `$25FCFA` and writing `$81B414..$81B41A` on the same
   frame. I did **not** read the return address off the stack. `$288AD0` (the
   banner) is not excluded by measurement.
3. **§5's "slots are never freed".** I measured the `+8` field only. If elements
   signal death in some other field, the live mask is the wrong instrument and
   the "13 births into 5 slots" reading survives but "never freed" does not.
4. **§9.** 64 % of the stage's BG map writes come from a routine nobody has
   read. That is the largest thing this run found and it is the thing most
   likely to be mis-summarised by whoever reads only §2.
5. **`w17ledger.py`'s `predict()` is a second copy of the VM**, deliberately -
   it is the *model* half of the gate and must not import the port. Check it
   against `scrollmap.py cmd_sim` rather than against the listing twice.
