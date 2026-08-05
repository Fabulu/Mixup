# 79 — IMPL: `$2497AA`, THE AUTO-SHOT (not the hyper)

*(the brief calls it "the hyper button". `[M]` the listing says it is the
**AUTO-SHOT**, 30 bytes, and the hyper is 16 instructions further on — §1.)*

status: **DONE.** `[M]` **`stage1-sweep` went from `0 green / 0 red / 71
blocked / 1 logic frame compared` to `9 green / 17 red / 45 blocked / 6,250
logic frames compared`.** `$2497AA` is gone from the blocked census entirely —
all 26 rungs it used to block now RUN. **`playgate.mjs`, a new gate, loads the
page's own bundle and holds Button 3 for 600 frames with no throw**, and goes
red under `--break autoshot-unported` with exactly the message the owner pasted.
961 unit tests (was 934), 0 failing; `pgm.py check` 72/2, and **neither
failure is mine** (§6.5, proven three ways). **BOTH bar conditions met for this
routine — and the reds the unblocking revealed are reported in §6, not buried.**

started: 2026-08-05
wave: 79. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

brief: port `$2497AA` (and `$2497BA`) from the ROM listing. It is the owner's
reported crash AND the thing blocking 69 of `stage1-sweep`'s 71 rungs
(`78-diag-oracle-blindness.md`).

`[M]` = measured by me, this session, on this tree.

inputs read in full: `78-diag-oracle-blindness.md`,
`39-OWNER-visible-play-before-sound.md`, `docs/knowledge/09`, `docs/knowledge/10`.

---

## 1. THE PREMISE, CHECKED — one claim false, one claim true, one collapsed

The brief asked me to doubt three things. Here is what each one actually was.

### 1.1 "`$2497AA` is the hyper" — **FALSE**, and the brief already suspected it

It is the **AUTO-SHOT**, and the whole routine is 30 bytes. `[M]` from
`maincpu.bin` via capstone:

```
2497AA: 4a390080380f  tst.b   $80380F        the AUTO-SHOT operator setting
2497B0: 674c          beq.b   $2497FE
2497B2: 082e00060018  btst.b  #$6,$18(A6)    the RAW mirror, bit 6 = Button 3
2497B8: 6744          beq.b   $2497FE
2497BA: 4a2e003c      tst.b   $3C(A6)
2497BE: 663e          bne.b   $2497FE
2497C0: 41f9008104aa  lea.l   $8104AA,A0     P1's OPTION record
2497C6: 4a2d0007      tst.b   $7(A5)
2497CA: 6706          beq.b   $2497D2
2497CC: 41f90081050e  lea.l   $81050E,A0     ...or P2's
2497D2: 08ae00040019  bclr.b  #$4,$19(A6)
2497D8: 08ae00030001  bclr.b  #$3,$1(A6)
2497DE: 08a800030001  bclr.b  #$3,$1(A0)
2497E4: 086e00040001  bchg.b  #$4,$1(A6)     THE DIVIDER
2497EA: 6612          bne.b   $2497FE
2497EC: 08ee00030001  bset.b  #$3,$1(A6)
2497F2: 08e800030001  bset.b  #$3,$1(A0)
2497F8: 08ee00040019  bset.b  #$4,$19(A6)    SYNTHESISE THE BUTTON-1 EDGE
```

**The hyper is `$249868`**, sixteen instructions further on, behind Button 2 and
a non-zero `$81B65C`. `src/player.js` has thrown it under its own correct name
since W64 and this wave does not touch it. So the queue's "hyper button" and the
owner's "hyper button still goes ████" are the same button doing a **different
thing**: Button 3 is not a third weapon, it is Button 1 emitted by the machine
on alternate frames.

`$80380F` is an **operator dip, on/off**. `[M]` `$25707A cmpi.b #$2,$80380F /
bge $257090` is the settings validator, and it rejects anything `>= 2`; it sits
in the `$803808..$80380F` operator block next to `$80380C` = rank.
`FROZEN_GLOBALS` has called it *"operator setting gating the `$2497AA`
bomb/hyper block"* since W4; the entry is renamed in this commit. **It stays
frozen — the name was wrong, the treatment was right.**

### 1.2 "`$2497AA` and `$2497BA` are one job" — **TRUE, and trivially so**

`$2497BA` is the **third instruction** of `$2497AA`. They are not two routines
that happen to pair; they are one straight-line block with no branch between
them. The queue note that paired them was right for the wrong reason.

### 1.3 "porting it unblocks the ladder" — **TRUE, but not on the first try**

It did not throw two instructions later. It threw nowhere — and produced the
**wrong answer on the first compared frame of every rung**. See §3.

### 1.4 A fourth thing the brief did not ask about: **the dead block above it**

`[M]` `$249712..$2497A0` is a **SECOND Button-3 path** — `btst #6,($19,A6)`, the
EDGE rather than the held bit, stepping `($20,A6)`/`($22,A6)` and two pointers at
`$8127E4` through a four-entry `$2497A2(pc)` table. It is **UNREACHABLE in build
B**: `$24970E bra.w $2497AA` jumps over it unconditionally, and a scan of
`$240000..$2A0000` for **every** `Bcc.b`/`Bcc.w` landing on `$249712` finds
**zero**. It is not ported, and `tests/w79autoshot.test.js` asserts it stays
unported so the next reader who finds it is told rather than having to re-derive
it. This is what "read BOTH ends" caught: the fall-through into `$2497AA` comes
from `$24970E`, sixteen instructions of dead code above the label.

---

## 2. WHAT THE ROUTINE DOES, and where its effects go

Nothing in `$2497AA` is self-contained. Every one of the four bits it writes is
read by code the port already had, and **the two-frame period is a consequence
of three instructions in two routines, not a constant on any line**:

| written at | read at | by |
|---|---|---|
| `($19,A6)` bit 4 (`$2497F8`) | `$249B48 btst #4,($19,A6)` | the ship's cadence machine, 8 instructions later |
| `($1,A6)` bit 3 (`$2497EC`) | `$249B74 bclr #3,($1,A6)` | ...whose arm clears `($2b,A6)` and spawns at once |
| `($1,A6)` bit 4 (`$2497E4`) | `$249B9E bclr #4,($1,A6)` | the cadence machine's no-edge arm CLEARS IT |
| `$8104AB` bit 3 (`$2497F2`) | `$24C498 bclr #3,($1,A6)` | the PODS' handshake (`options.js fireHandshake`) |

`bchg` sets Z from the OLD bit, so `$2497EA bne` is taken when bit 4 was
**already** set. Traced with Button 3 held and Button 1 idle:

```
frame N    ($3c,A6)=0, bit4 0->1, edge synthesised, $249B48 takes the shot arm,
           $249B50 sets ($3c,A6)=1, $249B74 finds bit 3 set -> ($2b,A6)=0, SPAWN
frame N+1  ($3c,A6)=1 so $2497BE skips the block; no real edge, so $249B96
           clears ($3c,A6) and $249B9E clears bit 4 again
frame N+2  = frame N
```

`[M]` and that is exactly what the board does — port and board agree digit for
digit on `pst pf1 pdir pbtn p2a p2b p3a p3c p34 p35 oflg1 oedge ohold nshot p42
p44` for lf2001..2012 on the `stage1-sweep` seed at lf2000, including the live
shot count `nshot`.

### 2.1 The finding: `$2497BA` and `$2497E4` are REDUNDANT for a plain hold

`[M]` Both enforce the same alternation, so **dropping either one alone changes
nothing** while Button 3 is simply held. They come apart only where one stops
running:

* `$249B40 bne $249E4E` returns **before** `$249B50` while the LASER holds
  `($3f,A6)` non-zero, freezing `($3c,A6)`. Then only the bchg divides.
* A real Button-1 edge sets `($3c,A6)` with the block inert. Then only
  `$2497BA` divides.

This is why two of my seven mutations are **declared EXPECTED-GREEN on the
ladder** (`breakage.mjs AUTOSHOT_EXPECTED_GREEN`) and are red only under the
two scenarios above, which `tests/w79autoshot.test.js` drives by name. A
mutation quietly deleted because it would not go red is the failure mode
`docs/knowledge/03` exists for; declaring it with its measurement is not.

---

## 3. THE BUG THIS WAVE ACTUALLY HAD — a cached byte, not a missing routine

The first port of the block was instruction-for-instruction correct and the
ladder went `0 green, 26 red, 45 blocked`. **Every red was on the FIRST compared
frame**, on `pst`/`pf1`/`p3c`/`oflg1`.

`[M]` lf2001..2010, port against board:

```
        pst pf1 pbtn p3c oflg1
port   8008   8   16   0    19     ...on EVERY frame
board  8010  16   16   1    19     odd frames
board  8000   0    0   0     3     even frames
```

The cause: `bombAndShotGuards` read `($19,A6)` **once** into a local at the top —
harmless for 75 waves because `$2497AA` was a throw — and `$2497AA` **writes**
that byte. So the synthesised edge was invisible to `$249B48`, the cadence
machine took its no-edge arm every frame, `$249B9E` cleared bit 4 every frame,
and the synthesiser fired every frame and **never spawned anything**.

That is a port which "implements `$2497AA`" and produces a plausible wrong
answer, which is `docs/knowledge/10`'s failure exactly. The fix is to read the
byte where the ROM reads it, at `$24980A` and `$249B48`. It is preserved as
`AUTOSHOT_MUTATE['autoshot-edge-cached']` so it can never come back unnoticed.

---

## 4. THE MEASUREMENT — `stage1-sweep`, before and after

`node games/ddpdoj/tools/seedcmp.mjs --manifest
games/ddpdoj/tools/oracle/out/w69/stage1-sweep/manifest.json --quiet`

| | segments | green | red | **blocked** | **logic frames compared** |
|---|---|---|---|---|---|
| **before** (W78) | 71 | 0 | 0 | **71** | **1** |
| **after** (this wave) | 71 | **9** | 17 | **45** | **6,250** |

**26 rungs unblocked; the comparison went from 1 frame to 6,250.** `$2497AA`
does not appear in the blocked census at all any more. `[M]` the census now:

| before | after | address |
|---|---|---|
| 69 | **0** | `$2497AA` |
| 0 | 21 | `$2956F6` |
| 0 | 14 | `$295120` |
| 0 | 5 | `$295304` |
| 0 | 2 | `$295432` |
| 2 | 2 | `$2943B0` (the stage END, unchanged) |
| 0 | 1 | `$294FA6` |

The `$295xxx` family is item 4 on `78-diag`'s NEXT list and is **now the top
blocker on this ladder as well as on `stage1-play`** — 43 of the 45 remaining
blocked rungs.

**HONESTY ABOUT THE NUMBER.** `[M]` immediately after my fix the sweep read
**7 green / 19 red**; the run recorded above reads **9 green / 17 red** on the
same code of mine. The two rungs moved because ANOTHER AGENT was editing
`games/ddpdoj/src/handlers.js` concurrently (its mtime moved mid-session, and
two `handlers.test.js` tests were transiently red in the same window and are
green again). The blocked count — the number this wave is measured on — is 45 in
both runs. Nothing else on the tree is mine.

The other three ladders are **unmoved**, which is the right answer: none of them
holds Button 3, so the block never runs.

| ladder | before (78-diag) | after |
|---|---|---|
| `fly-around` | 8 green, 0 red, 0 blocked, 2,000 frames | identical |
| `stage1-laser-hold` | 14 / 13 / 182, 1,657 frames | identical |
| `stage1-play` | 1 / 25 / 45, 6,250 frames | identical |

---

## 5. THE TWO BAR CONDITIONS — which I delivered

**Both, for this routine.** Stated per `39-OWNER-visible-play-before-sound.md`.

### 5.1 FEATURE COMPLETE — the owner's own test

`tools/playgate.mjs` is new and is the check `39-OWNER` asked for and nobody had
written: *"load the page headless, run frames, press fire, fail on any throw"*.
It loads `assets/` through `src/web/assets.js`'s **own `loadBundle`** — the same
module the browser runs, over the filesystem instead of HTTP — so "the page would
throw" and "this tool throws" are one statement.

```
$ node games/ddpdoj/tools/playgate.mjs --frames 600 --all
  [OK   ] hold=none        600 frames, no throw
  [OK   ] hold=auto        600 frames, no throw      <-- BUTTON 3, the owner's
  [OK   ] hold=shot        600 frames, no throw
  [OK   ] hold=auto+left   600 frames, no throw
  [OK   ] hold=auto+right  600 frames, no throw
  [OK   ] hold=auto+down   600 frames, no throw
VERDICT: PLAYABLE -- 6 holds, 600 frames each, no unported path reached
```

**AND IT IS RED-VALIDATED**, which matters more than the green:
`--break autoshot-unported` restores W78's own code and the gate reports the
owner's exact message, on the FIRST held frame, on the four holds that involve
Button 3 and on neither of the two that do not:

```
  [THROW] hold=auto        lf2000 (frame 0) $2497AA
          UNPORTED $2497AA: the $2497BA hyper/auto block ...
VERDICT: NOT PLAYABLE -- 4 of 6 holds throw
```

**What playgate is NOT:** an oracle. It compares nothing against the board. A
green here says only *"no unported path was reached"*, and it says so in its own
banner. It is a much weaker claim than §4's and it is deliberately the claim
nothing else in this tree makes.

### 5.2 ORACLES PERFECTLY — against the board, shown capable of failing

`[M]` Four **fully green 250-frame segments** of `stage1-sweep` — lf3250, lf4000,
lf6000, lf7000 — every one of which **goes red under the wrong port**:

```
seg 3250 clean                        1 green, 0 red
seg 3250 --break autoshot-edge-cached 0 green, 1 red
seg 4000 clean / broken               1 green / 1 red
seg 6000 clean / broken               1 green / 1 red
seg 7000 clean / broken               1 green / 1 red
```

The full mutation table, `--segment 3250`:

| mutation | verdict | first divergence |
|---|---|---|
| *(clean)* | **1 green** | — |
| `autoshot-unported` | BLOCKED | `$2497AA` at lf3251 |
| `autoshot-dropped` | RED | `pst` lf3251 port=32800 board=34864 |
| `autoshot-edge-cached` | RED | `pst` lf3251 port=32808 board=34864 |
| `autoshot-inverted` | RED | `pst` lf3251 port=32800 board=34864 |
| `autoshot-on-edge` | RED | `pst` lf3251 port=32800 board=34864 |
| `autoshot-no-optbit` | RED | `p35` lf3251 port=2 board=0 |
| `autoshot-every-frame` | **GREEN — declared** | §2.1 |
| `autoshot-no-3c-gate` | **GREEN — declared** | §2.1 |

The two greens are the §2.1 finding, declared in `breakage.mjs
AUTOSHOT_EXPECTED_GREEN` with the measurement, and **both are seen red by
`tests/w79autoshot.test.js`** under the `laser-hold` and `after-real-edge`
scenarios respectively. So all seven mutations are red somewhere, and the two
that the ladder cannot separate are named rather than hidden.

### 5.3 The unit tests, and the one thing they cannot do

`tests/w79autoshot.test.js`, 22 tests. Every expected value is derived from the
listing in §1.1, not from running the port. They pin the three gates, both arms
of the divider, the three `bclr`s that run above it, the P1/P2 record pick, the
fall-through into `$249B48`, the 1,0,1,0,1,0 pattern, and the dead block. They
drive the **shipped** seam, so the red half needs no source edit.

What they cannot do is prove the transcription is *complete* — only the listing
can, and §1.1 is the whole listing.

---

## 6. THE REDS THE UNBLOCKING REVEALED — reported, not buried

17 red segments. **They are one pre-existing defect, not seventeen**, and it is
not one this wave created.

First-divergence column census over the 17: `shot1` ×10, `shot2` ×3, `s21y` ×2,
`s14y` ×1, `vf` ×1.

* **`vf`/`irq6` at lf8227** is the already-known slowdown divergence (W69,
  `76-recon-mister-timing.md`). Not new, not mine.
* **The other 16 are the SHOT-SLOT cluster** that `78-diag` §"WHAT IS ACTUALLY
  RED" already reports on `stage1-play` at lf2016, with the identical column
  set: `s14y s14x s14v s21y s21x shot1 shot2`. **`stage1-play`'s numbers are
  byte-for-byte unchanged by this wave** (1 green / 25 red / 45 blocked before
  and after), which is the evidence that the defect pre-exists rather than being
  something the auto-shot introduced. What changed is that a second ladder can
  now see it.

`[M]` characterised on segment lf2000, first divergence lf2030 — **30 frames in,
not on the first frame**, so it is downstream arithmetic and not the block's
bits:

```
shot1 @lf2030  first differing BYTE 146 -> slot 3, offset +$02 (the Y word)
s14y  @lf2054  port=25410 board=25666   delta  256 = $100
s14x  @lf2054  port=4385  board=4705    delta  320 = $140
s14v  @lf2054  port=236   board=287
s21y  @lf2054  port=25026 board=25219
p3a   @lf2151  port=2 board=0    ($249D0C's fire-sound gate -- blast radius)
```

The ship's own `py`/`px` do **not** diverge, so the ship agrees and the **spawn
origin or the slot's initial velocity** is what differs. `78-diag` guessed "a
wrap or a spawn-origin offset rather than accumulated drift" from a $180 delta;
$100 and $140 here support that reading. **This is now the top item this ladder
can see**, and it has two independent ladders reproducing it.

---

## 6.5 `pgm.py check` — 72 passed, 2 failed, and NEITHER is mine

`[M]` `python games/ddpdoj/tools/oracle/pgm.py check`, run to completion on this
tree after the commit: **`VERDICT: FAILURES -- 72 passed, 2 failed, 0 SKIPPED`.**

1. **`segment sweep`** — expected, and it is the row this wave IMPROVED. The
   stage exits non-zero while any segment is red or blocked, and 45 still are
   (§4). `fly-around:PASS stage1-laser-hold:FAIL stage1-play:FAIL
   stage1-sweep:FAIL`, unchanged in shape from `78-diag`. `segment sweep RED
   [clamp-first]` passes, so the stage is still capable of failing for the right
   reason.
2. **`THE LASER BOMB: $249A80, $255FE2 and $2456A6`** — **NEW, and it is a
   CONCURRENT WAVE'S, proven three ways.**
   * `[M]` The scenario never presses Button 3. `w65beamgate.mjs` builds exactly
     three port words, `portWordFromBits([])`, `[BIT.b1]` and `[BIT.b1,BIT.b2]`,
     whose P1 raw mirrors are `$00`, `$10` and `$30`. **Bit 6 is clear in all
     three** (only `[BIT.b3]` gives `$40`), so `$2497B2 btst #6,($18,A6)` fails
     on every frame and `autoShot2497AA` returns at its second line. With the
     block inert, nothing writes `($19,A6)` inside the weapon block, so `btn()`
     is byte-identical to the cached read it replaced. **My change cannot reach
     this scenario.**
   * `[M]` The gate's own stop line is `frames 563 stop: UNPORTED $249F8A: the
     player was HIT` — the hit/death path, reached 563 frames in. A player who
     starts being HIT is the signature of collidable content appearing, not of
     a button-3 synthesiser.
   * `[M]` Timeline. The FIRST full `check` of this session finished at 21:28:16
     with **`[PASS] THE LASER BOMB ... exit 0`**, and my `($19,A6)` fix was on
     disk at 21:23:10 — i.e. that PASS was measured WITH my change in. What
     changed afterwards was `src/handlers.js` at 21:37:54 and a new
     `tools/w80emitgate.mjs` at 21:36:29, both another agent's, both the SPRITE
     EMISSION wave. Two `handlers.test.js` tests were transiently red in the
     same window and are green again.

   I have not touched it, per the brief's rule about other agents' work.

---

## 7. WHAT I TOUCHED

* `games/ddpdoj/src/player.js` — `autoShot2497AA` (new, `$2497AA..$2497F8`), the
  `($19,A6)` re-read at `$24980A`/`$249B48`, `AUTOSHOT_MUTATE` (8 named wrong
  ports), the `FROZEN_GLOBALS` rename, and the two functions exported for tests.
* `games/ddpdoj/tools/breakage.mjs` — the 8 mutations, `AUTOSHOT_EXPECTED_GREEN`,
  and the reset so a mutation never leaks between in-process runs.
* `games/ddpdoj/tools/portdiff.mjs` — one line: reset `AUTOSHOT_MUTATE` per run,
  next to the `CLAMP_ORDER` reset that already had the comment explaining why.
* `games/ddpdoj/tools/playgate.mjs` — **new**, the playability gate.
* `games/ddpdoj/tests/w79autoshot.test.js` — **new**, 22 tests.

Not touched: `boarddl.mjs`, `dlcrop.py`, `NOTICE.md`, `CONTRIBUTING.md`,
`SAVEPOINT.md`, `docs/knowledge/02-traps.md`, `docs/03-VERIFICATION.md`,
`games/gradius/`, `src/` (the Game Boy tree).

---

## 8. NEXT

1. **`$295120`/`$2956F6`/`$295304`/`$295432`/`$294FA6`** — 43 of the 45 rungs
   `stage1-sweep` still cannot run, and 45 of `stage1-play`'s. It is the same
   family on both ladders. Read the dispatch before the leaves: `$295120` and
   `$295304` are $1E4 apart and `$2956F6` is another $3F2 on, which is the
   spacing of a table, not of three unrelated routines.
2. **The shot-slot cluster** (§6). Two ladders reproduce it; the ship agrees; it
   is 30 frames in, on the Y word of a spawned record.
3. **`$28A520`–`$28A5A0`** and **`$2627xx`–`$2629xx`** — unchanged from
   `78-diag`, still the laser-hold ladder's 182.
4. **Wire `playgate.mjs` into `pgm.py check`.** It is a gate that is not in the
   gate yet, which is the thing `39-OWNER` complained about one level up.
