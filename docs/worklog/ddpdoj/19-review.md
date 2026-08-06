# W19 REVIEW - score/chain/rank ledger + FREEZE diagnosis

status: DONE
verdict: DEFECTS FOUND - none blocking. The two headline claims survive; one is
provably stronger than the implementer proved it. Six defects, all in the
LEDGER's completeness and labelling, plus one undeclared page-behaviour change.
started: 2026-08-02
role: reviewer (DAIOUJOU wave 19)
commit under review: `4766bae`
mode: READER. No edits left in src/. No commits.

Findings written as they are learned.

---

## VERDICT SO FAR: the two headline claims SURVIVE, and one of them is now
## stronger than the implementer proved. Four defects, none blocking.

---

## A. RE-RUN, INDEPENDENTLY - what I confirmed with my own tools

### A.1 JOB 2's core claim is TRUE, and it is BOARD-measured, not port-measured

I disassembled `$2612A0..$2613AA` myself. `$261324 tst.w ($8,A5) / bne $261332`
guards exactly one instruction, `$26132C addq.w #1,$8130CE`. `$261314
jsr $240B94` (BG camera) is BEFORE the gate; `$26133C..$261376` (column writer)
and `$26138A jsr $240C22` (TX camera) are AFTER it. Confirmed.

**Census of `($8,A5)` - two independent methods, agreeing.** A raw byte scan
for EA mode-5/reg-5 with displacement `$0008` over `$260000..$263000`
(alignment-independent, so it cannot be fooled by a mis-synced disassembly)
plus a full disassembly of the same range. Every `($8,A5)` in the BG object's
own code: writes `$2612F0`, `$2612F8`, `$261FC0`, `$26204A`, `$26214C`; read
`$261324` and nothing else. I also checked all eight routines the handler
calls with A5 = the BG object (`$240B94`, `$240C22`, `$240D76`, `$261F76`,
`$262062`, `$26233A`, `$260EC8`, `$26146C`): only `$261F76` touches `($8,A5)`
at all, and its two touches are the two already censused.
(The `($8,A5)` hits at `$260BBE`/`$260CAA`/`$260D8C` etc. are a DIFFERENT
object - `move.l #$dc0100,($8,A5)`.)

**THE IMPLEMENTER UNDERSOLD ITS OWN EVIDENCE.** §2.3 proves the claim with a
13,000-frame free-run of the PORT. That is the weaker of the two proofs
available and the worklog does not make the stronger one. The board corpus
already carries it. From `tools/oracle/out/w17-stage1-invuln.tsv`, inside the
compared window:

```
$8130CE (clock)  parked at $0344 from lf8936 to lf12051 -- 3,115 frames
$80B012 (BG cam) $00084880 -> $00147380     delta $C2B00
$81318A (ring)   $0018 -> $001D  (kept cycling)
$81318C          $0080 -> $0380
```

That is the BOARD, not the port, holding the freeze latched for 3,115 frames
while the camera advances 798,976 sixty-fourths. And `scrollportgate.mjs`
re-run by me reports `RESULT 0 DIVERGENT FRAMES on 12 columns over 10431
logic frames` across exactly that window - so the port matches the board
frame-for-frame THROUGH the boss lock. JOB 2 is measured, on-board, and true.

### A.2 `$261142` has exactly two callers - CONFIRMED, and more strongly

The implementer's scan was an absolute-long scan restricted to
`$230000..$2A0000` plus a PC-relative `bsr`/`bra` scan. I ran three:

* longword `$00261142` **anywhere in the whole 6 MB decrypted image**: exactly
  **2** occurrences, at `$26C7F6` and `$26D256` - i.e. the operands of the two
  `jsr $261142.l`. **No pointer table anywhere contains this address**, which
  is what closes the `jsr (An)` hole the implementer flagged as its own risk.
* PC-relative `bsr.b/.w/.l`, `bra`, `jsr (d16,PC)`, `jmp (d16,PC)` over
  `$230000..$2A0000`: **0** hits.
* `$261138` (freeze ON): **0** longword occurrences image-wide, **0** PC-rel.

Denominators I re-derived and that match the worklog exactly: `$8130D2`
**122** sites in build B; `$8130C6` **3**; `$81317E` **4**; `$8130F4` **10**.
`$8130D2`'s writes are **exactly two**, `$25FD82` (`move.w #$1`) and `$25FD8C`
(`clr.w`) - the other 120 are reads (I classified all 122 by opcode).
`$261100`: 9 absolute occurrences, one of which is `$26B73C` = the operand of
`$26B73A jsr $261100.l` inside the midboss. Confirmed.

### A.3 The rank trajectory and the `w17stage.lua` label correction - CONFIRMED

Re-derived from the corpus myself. **The implementer's column indices were
right and mine were wrong first** (the Lua comment's numbers are 0-based within
a sub-list); the true TSV indices are 34=`$813092`, 35=`$813094`,
36=`$813096`, 37=`$813098`, 38=`$81309E`.

```
$813092  0 -> 1  at lf12359          <- the STAGE INDEX
$813096  0 -> 4  at lf12359          <- stage x 4
$813098  0 for all 16,000 frames     <- THE LOOP
$81309E  57 changes; 52 gaps of EXACTLY 256
         the 4 exceptions: 1617 (stage start, rank 0->52), 255, 503
         (12360, rank 92->108, the +16 stage base step), 61
control run w17-stage1-noinvuln-ctl: rank 60 -> 0 at lf4637 (the death reset)
```

Every number in §1.4's trajectory table reproduces. The label correction to
`w17stage.lua` is right.

### A.4 The `abcd -(A0)` predecrement - CONFIRMED from the listing, not argued

This is the thing the implementer said to look hardest at, and it holds:

* `$286626` = `lea $81B5AA,A1 / move.l D0,(A1)+ / sub.w D2,D2 / abcd -(A1),-(A0)` x4.
* `$2860F8 lea $81B4C4,A0` on the **bit-4 (P1)** path, `$28611C lea $81B4C8,A0`
  on the **bit-3 (P2)** path -> accumulators `$81B4C0` and `$81B4C4`. The
  worklog's player assignment is right.
* Independent corroboration from `$2842B0`: pass 1 is
  `lea $81B444,A0 / lea $81B4C0,A1 / tst.l (A1)+` (A1 -> `$81B4C4`), so
  `$81B4C0 -> $81B440`; pass 2 `lea $81B448,A0 / lea $81B4C4,A1` gives
  `$81B4C4 -> $81B444`, and that leaves `$81B448` free for the high score,
  which is exactly what `$28439A move.l D4,$81B448` writes. Three readings
  agree. The predecrement reading is correct.

### A.5 `$286096` computes `1 + $81B63E` - CONFIRMED

`$2860E4 moveq #1,D0 / $2860E6 add.w $81B63E,D0`. Confirmed. See D.3 for the
mislabel that rides on it.

### A.6 The `$28615E` kill amounts - 4 independent spot-checks, all pass

`$263DA0` `moveq #$13` = 13 (list has `13x3`); `$26B7F2` `move.l #$353` = 353
(list has `353`); `$27E334` `moveq #$10` = 10 (`10x7`); `$2985D2`
`move.l #$800` = 800 (`800x4`). 90 longword occurrences image-wide, 87 in
build B - the denominator is right.

### A.7 `$249EF0`'s second-loop double-add - CONFIRMED, including the pointer maths

After the first four `abcd`, A0 = `$81B4C0` and A1 = `$81B5AA`; `$249F3C/3E
addq.l #4` restores them to `$81B4C4`/`$81B5AE` and the next four `abcd` add
the *unchanged* scratch bytes into the *same* long again. "The second loop
scores double, in four instructions" is exact.

### A.8 The tests, the gates, the suite

* `node --test games/ddpdoj/tests/` -> **210 pass, 0 fail**. (207 + 3.)
* `scrollportgate.mjs` clean -> `RESULT 0 DIVERGENT FRAMES on 12 columns over
  10431 logic frames`, and the new `$261142` note fires **exactly once**, at
  `t=$0344`, the record the recon predicted.
* `--break freeze-stops-the-scroll` -> `RED on 12 column(s) ... first
  d18c@lf1673`. Reproduced.

**THREE BREAKS, EACH SEEN RED, EACH RESTORED BYTE-IDENTICAL**
(`sha256 23b62324c3db9fa419488a774965228ed5d66400475068a2bb9b8132e7e191b1`
before and after all three; `git show HEAD:...| sha256sum` matches):

| break | edit | result |
|---|---|---|
| A | put `($8,A5)` into the column-writer condition at `$26133C` | new tests 6 AND 7 red (plus pre-existing 3, 4) |
| B | `SB.loops === 0xffff` -> `!== 0xffff` | new test 8 red |
| C | `if (false && mut === 'freeze-stops-the-scroll' ...)` | new test 7 red |

All three new tests are capable of failing on the semantics they name. This is
not the eighth defective check.

---

## B. DEFECTS

### B.1 MODERATE - the ledger is NOT complete: an entire score path is missing,
### and §1.2's own denominator is mis-stated

§1.2: "`$286626` ZERO absolute callers, **28 PC-RELATIVE callers -- all in
`$286xxx`**" and "Four thin wrappers stand in front of it, **and they are what
the rest of the game calls**."

My PC-relative scan reproduces the count 28 - and **6 of the 28 are not in
`$286xxx`**:

```
$2853FC $2854EE $2854F8 $285502 $28550C $285516   bsr $286626
```

They are real code, and they are a **fifth score path with its own
accumulator**:

```
2853f6: lea $81b61a.l,A0 / 2853fc: bsr $286626       ; acc = $81B616
2854e0: move.l $81b61a.l,D0 / lsr.l #8
2854e8: lea $81b61a.l,A0 / bsr $286626   (x5, dbra D7 at $28551A)
...
285550: bsr $28614a   ; drain the bonus into P1 pending
28555c: bsr $286154   ; ...and P2
285562: move.l D0,$81b616.l   ; clear it
```

So `$81B616` is a bonus accumulator that is added to by direct `$286626` calls
and drained into both players' pending scores through the wrappers. **None of
`$81B60E`, `$81B610`, `$81B614`, `$81B616`, `$81B61A` appears anywhere in the
worklog.** For a wave whose deliverable is "the ledger, with denominators", and
whose binding requirement is `20-OWNER-scoring-must-be-exact.md`, a whole
subsystem that adds score and then adds it AGAIN into the player total is a
real hole. It is a sample dressed as a list at exactly the point the brief
warned about.

**THE STATIC MISS AND THE DYNAMIC MISS COINCIDE.** `w19-play.log`'s tap
regions are `$81B5B0..$81B60F` and then `$81B630..$81B65F`. `$81B610`,
`$81B614`, `$81B616`, `$81B61A` fall **exactly in the untapped gap**. So the
subsystem is invisible in both halves of the wave, and nothing in the run
would have contradicted §1.2. Corroborating arithmetic from the same log:
`$28662C` fired **1,423** times but the `$81B4C0` accumulator saw only **989**
of them (`286630+2:989`), so 434 score adds landed somewhere else.

Consequence, concretely: `$285550`/`$28555C` are 2 of the 13 `$28614A`/
`$286154` sites, and their D0 is **computed** (`$285546 lsr.l #4`), not an
immediate. §1.2's amount column for those two wrappers ("`46 x1, 500000 x2,
3000000 x2, 5000000 x2, 10000000 x1`") therefore lists 8 values for 13 sites
and **gives no denominator at all** - unlike `$28615E` (87/87) and `$286128`
(22/24), which do. A later wave reading that row will believe the wrapper only
ever takes immediates.

### B.2 MODERATE - §1.1's map makes the very predecrement error it warns about

§1.1 row: "`$81B5CE`,`$81B5D2`,`$81B5D6`,`$81B5B8`,`$81B5BC` | long BCD | the
chain's per-hit score accumulators | `$2863D4`..`$2863F8`".

Read with the predecrement rule the same worklog establishes:

```
2863ce: lea $81b5d2,A0 / 2863d4: bsr $286626   -> accumulator $81B5CE
2863de: lea $81b5d6,A0 / 2863e4: bsr $286626   -> accumulator $81B5D2
2863f2: lea $81b4c4,A0 / 2863f8: bsr $286626   -> accumulator $81B4C0
286332/286338: move.l D3,$81b5b8 / $81b5bc     -> direct, not via $286626
```

The accumulators written by `$2863D4..$2863F8` are `$81B5CE`, `$81B5D2` and
`$81B4C0`. **`$81B5D6` is a `lea` target, not an accumulator**, and `$81B4C0`
- the one that actually reaches the player's score - is missing from the row.
`$81B5D6` does exist as a live long (`$28633E tst.l $81B5D6`), which is what
makes the row plausible and wrong: it is a one-slot shift, in the deliverable
map, of exactly the kind §1.0 and §6.1 identify as the trap.

### B.3 MODERATE - an undeclared, untested change to the PUBLISHED PAGE rode in
### on this commit, and its comment misattributes it to wave 14

The diff adds to `src/background.js`:

```js
this.streamPtr = 0;            // BgVram ctor, comment: "WAVE 14 -- DIAGNOSTIC"
vram.streamPtr = a0;           // in the column writer, comment: "W14 diagnostic"
```

`git show HEAD~1:games/ddpdoj/src/background.js | grep streamPtr` is **empty**.
`git show HEAD~1:games/ddpdoj/src/web/app.js` **already read**
`this.game.vram.streamPtr` (line 318) and fed it to `streamColumnOf()` and
`bg.followColumn()`. So before this commit the page's shard scheduler was
reading `undefined` every frame, `streamColumnOf` took its `if (!ptr) return
-1` path forever, and `followColumn(-1)` was a permanent no-op. **This commit
silently switches the published page's background-shard ordering on for the
first time.**

Three problems, in order of importance:

1. It is **not mentioned in the worklog or the commit message**, in a wave
   whose two jobs are the ledger and FREEZE. A page-behaviour change is not a
   free rider.
2. It is **untested end-to-end**. Test 210 exercises `streamColumnOf()` with
   hand-passed pointers; nothing asserts that the producer exists. That is
   precisely the shape of check that "could not fail" - the function was green
   for the whole time its only caller was passing `undefined`.
3. The comment says **"WAVE 14"** for code that wave 14 does not contain. A
   later reader chasing this will look in the wrong commit.

The change itself is almost certainly correct and desirable. It should have
been declared, and the wiring should have a test.

### B.4 MINOR - the LOUD throw is narrower than the condition it claims to cover

Op `$0C` notes `$261142` only when `ram.u16(blk + SB.loops) === 0xffff`. But a
`$0C` latched with **no repeat armed at all** is equally unreleasable from
inside the VM: the only doors are `$261FC0` (needs an armed finite repeat),
`$26204A` (the fast-forward) and `$2612E8` (the external `$81317E`, which has
no producer in the port). In that case `SB.loops` is 0 and the port sits in
the lock **silently** - the "quiet return is a defect in its own right" case.
No stage-1 record does this, so this is a latent hole, not a live one; the
condition should be "no armed repeat that can complete", not "`loops == $FFFF`".

### B.5 MODERATE - the declared on-distribution control was never run

§1.0: "**`--poke 0` is the on-distribution control**." `tools/oracle/out/`
contains only `w19-play.tsv`/`.log` (the invulnerable run) and `w19-smoke.*`.
There is no `--poke 0` artifact and no number from one anywhere in the
worklog. **Every dynamic result in JOB 1 - the intra-frame order, the
1,619/1,621 decrements, the 1,423 `$28662C` fires, the 11,130 chain-region
writes, the 677 drains - comes from a single INVULNERABLE run.**

It is labelled, which is what `20-OWNER-scenarios-must-play.md` demands, and
`docs/knowledge/09` says an invulnerable run is valid for coverage - which is
what §1.0 uses it for ("valid for identifying which word is which"). But §1.5
is not coverage: pacing, chain survival and the drain/decrement interleave are
on-distribution questions, and the sentence in §1.0 reads as though a control
exists. It does not.

I did re-derive the counts that ARE on disk and they reproduce exactly:
`28662C+0:1423`, `284370+0:677`, `28431E+2:677`, `28439A+8:677`.

### B.6 MINOR - two small mislabels in §1.2/§1.5 vs §1.1

* §1.2 and the commit message call `$286096`'s value "one point plus the
  **hyper level**". `$81B63E` is the **hyper ACTIVE flag** - §1.1 says so
  itself, and `$285A30` sets it to literal `1`. The value is 1 or 2, never
  "1 + level". The hyper LEVEL is `$81B65C`/`$81B654`, a different word. In a
  ledger whose whole point is exactness this sentence will be ported wrong.
* §1.3 attributes the reset `$286320` to "the `$8130F9`-bit-0 / `$811F72`
  guard at `$2862EA`". `$2862F2 btst #0,$8130F9 / bne` branches to **`$286326`**
  (skipping the reset); the branch that reaches `$286320` is `$2862F0 beq`,
  off `$2862EA tst.w $81B5AE`. Two different guards, conflated.

---

## C. NOT RE-RUN, AND SAID SO

* **§1.5's intra-frame order (40 frames of one PLAYING run).** I did not
  re-drive MAME. I verified every sub-ordering that is decidable from the
  listing and they all hold: `$2607E4` (rank clock) immediately precedes
  `$2607EA jsr $2608D2` (recompute); `$2863B2` (chain counter +1) precedes
  `$2863D4` (score add); `$2863E4` (score) precedes `$2863E8 bsr $28663A`
  (meter refill).

  **AND THE LOAD-BEARING ONE IS DECIDABLE TOO - §6.2 undersells it.** The
  drain and the decrement are in the SAME object handler, in that order:

  ```
  $28D520  tst.b ($2,A5)          <- an object handler, same shape as $260794
  $28D52E  jsr $2842B0            <- THE PENDING DRAIN
  $28D534  jsr $28444E
             $284460 bsr $285A12  (the hyper activation of §1.4)
             ... falls through $2844C4 / $2844DC / $2845CA beq $284614
  $284614  move.w $81B5C0,D6      <- and $284636 subq.w #1 -- THE DECREMENT
  ```

  So "drain before decrement, both once per frame, decrement last" is a
  **listing fact**, not a 40-frame observation. What remains a measurement is
  only the position of the HITS (`$286096`/`$28615E`, called from enemy and
  bullet objects) relative to `$28D520` - that one really is object-slot
  order. §1.5 items 2 and 4 are stronger than the worklog claims for them, and
  should be re-stated as such so a later wave does not re-measure them.
* **The 1,619/1,621 decrement measurement** and the 1,423 `$28662C` fires: the
  run's raw log is not in `tools/oracle/out/`, so I could not re-derive them.
* **§1.4's rank credits** are listing-only, as the implementer says. I confirmed
  the arithmetic from the listing (`$285A62 add.w D0,$81B646` with
  D0 = `$81B65C`, cap `$23` at `$285A68`; `$260916 lsl.w #4` = x16) but no run
  has `$81B646 != 0`. Named gap, correctly named.

## D. NON-FINDINGS I CHECKED AND CLEARED

* **Build split.** No build-A address is introduced anywhere in the diff. The
  `$13C7E6`/`$140FFE`/`$141018..$14101E` occurrences in `background.js` are
  pre-existing (present at HEAD~1) and are the ISR/BIOS exception
  `NOTES-build-split.md` licenses.
* **Fall-through.** I read past the apparent end of `$261F76` (ends `$261FD8
  rts`; `$261FDA` is a separate routine), `$2842B0` (pass 2 is a FALL-THROUGH
  from `$2842FC` into `$2842FE` - the worklog has this right), `$2862C6`
  (`$28631C bsr $28663A` falls through into `$286320` - right), `$284636`
  (`$28463C bne` -> the expire clears `$81B5B8`/`$81B5CE` and does NOT clear
  the counter `$81B5DA` - the worklog is consistent with this), `$249EF0`
  (`$249F4A rts`, then the P2 body at `$249F4C` reached by branch, not
  fall-through), `$260794` (`$260808 rts`; `$26080A` is separate). No
  undiscovered fall-through found in the routines W19 names.
  One curiosity, not a defect in the port: **`$2860CE..$2860DC` in `$286096`
  looks unreachable** - `$2860CC bra $2860DE` jumps over it and `$2860BC
  btst #4,D1 / beq` goes to `$286102`, not to `$2860CE`. The P2 `$286DA8`
  call therefore appears dead on that path. Board behaviour, not ours.
* **The op-`$0C` note firing spuriously.** Once in 10,431 board frames, at
  the predicted record. Break B proves the condition is live.
* **Environment note (not W19's doing):** the repo's main `.git/index` is
  stale (mtime 02:37, before the 08:07 commit) and shows
  `games/ddpdoj/src/background.js` as staged-DELETED + untracked. The working
  file is byte-identical to HEAD. Anyone committing from the main index would
  delete the file. Worth someone running `git read-tree HEAD`.

status: DONE
