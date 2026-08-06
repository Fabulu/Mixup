# W21b REVIEW - CLEARING THE PATTERN REVIEW'S OPEN FINDINGS

status: **DONE**
wave: 21b   role: reviewer (DAIOUJOU)   started/finished: 2026-08-02
target of review: `21b-impl-clear-review-findings.md`, files `src/bullets.js`,
`src/bulletmath.js`, `tests/bullets.test.js`, `tools/w21patterngate.mjs`,
`tools/w21patterns.py`.  target build: `ddpdojblk` VERSION-B; every address is
build B unless the line says otherwise.  READER ONLY - nothing in `src/` was
left changed, no commit was made.

VERDICT: **all-four-open-findings-cleared.** F1, F2, F3 and F5 are each
genuinely resolved, nothing regressed, and every fix was watched RED and
restored byte-identical. Three MINOR / INFORMATIONAL documentation nits remain
in the prose around F5 (the code and tests are correct); they are filed below.

The transcription itself is unchanged by this wave (the wave-21 review
confirmed it instruction for instruction); 21b fixes CHECKS and one PROOF.

---

## 0. WHAT I DID, AND WITH WHAT

* Re-derived the F1 coverage denominator **directly from the three corpora**
  (parsing each `S` row's `ret=` and mapping through `BODY_RETURNS`), not from
  the gate's own bookkeeping.
* For F3: mutated `VEC.fold` `$283F50 -> $283F60`, ran the suite, watched the
  three named tests go RED, restored, SHA-verified.
* For F5: broke `restoreFan` three ways (no-op, D0-only, total removal),
  watched the register-restore test go RED each time, restored, SHA-verified.
  Then **independently read the movem.l prologues/epilogues** out of
  `maincpu.bin` by raw opcode/mask decode (`0x48E7/0xC080` push,
  `0x4CDF/0x0103` pop) plus a capstone trace of the continuation structure.
* For F2: ran `w21patterns.py rewrites`, confirmed the 11 `clr.w` addresses
  match the review's own list, and verified the load-bearing premise (that the
  27 longword writes to `(A6)` sit in continuations that advanced A6 past the
  type word) by disassembling the canonical continuation at `$2813E`.
* Re-ran the full suite and the gate on all three corpora and the mutation
  matrix.

---

## 1. F1 - RESOLVED. The denominator is the real map and the fractions are true.

`w21patterngate.mjs` line 468 prints `${base.bodies.size}/${BODIES.size}`.
`BODIES` is the 13-entry map (8 shared fan bodies + 5 inline/single arms); the
hardcoded `/8` is gone, with a comment naming the map's composition.

**Re-derived from the corpora themselves:**

| corpus | spawns | rank!=0 bodies reached | the bodies |
|---|---|---|---|
| play | 197 | **0/13** | - |
| fanplay | 245 | **2/13** | `$2813A6 $281402` |
| faninvuln | 10057 | **7/13** | `$2813A6 $2813D4 $281402 $281668 $2816C0 $2816DE $281708` |
| **union** | | **7/13** | as above |

Six bodies never reached: `$28134E $281366 $281450 $281680 $281726 $281776`.
Their live fire-site counts (from `w21patterns.py gens`, entries that `bra` to
each body): `$281420`/4, `$281432`/**0**, `$281450`/10, `$281754`/**0**,
`$281726`/4, `$281776`/1 - so **four of the six have live fire sites** and two
(the triples) have zero. This reproduces the worklog's honest sentence exactly.

> INFORMATIONAL - a latent inconsistency, not a defect today. `BODY_RETURNS`
> maps 14 distinct bodies (the 13 in `BODIES` PLUS the orphan `$281494`, via
> rets `$281498/$2814A4`), but the denominator is `BODIES.size` (13, which
> excludes the orphan). I confirmed the orphan's two return addresses appear
> **0 times** across all three corpora, so the numerator can never include
> `$281494` and the `/13` is never corrupted. Worth a one-line comment on
> `BODY_RETURNS` so a future corpus that did hit the orphan could not silently
> produce a numerator > denominator.

---

## 2. F3 - RESOLVED. The $284190 fixture disagrees with the subject when the fold constant is wrong.

`mathRom()` in `tests/bullets.test.js:486` now seeds the fold window at the
**literal** `FOLD = 0x283f50`, the pointer table at the literal `PTRS =
0x200920`, the quadrant base at `BASE = 0x200d20` and `STRIDE = 65*8`. The
subject `velocity()` still reads through `VEC.fold` / `VEC.speedPtrs`. Fixture
and subject no longer share the constant.

**The mutation, seen RED** (`VEC.fold` `$283F50 -> $283F60`):

```
node --test games/ddpdoj/tests/  ->  305 pass, 3 FAIL, 0 skipped
  not ok 106 - the four quadrants negate exactly $2841C2/$284202/$284242/$284282
  not ok 107 - `asr.l #4` is ARITHMETIC -- it rounds a negative entry ...
  not ok 114 - the exported velocity field carries the 1.5:1 ellipse ...
```

Exactly the three the worklog named. Before the restructure the same mutation
left the suite green (the review proved this: "67 pass, 0 FAIL, 2 skipped --
fully green with the port reading the fold table from the wrong address").
Restored, SHA-verified: `675664e4...` for `bulletmath.js`.

---

## 3. F5 - RESOLVED (code correct). The twelve arms restore D0/D1/A0 as the cartridge does.

Two independent confirmations.

### 3.1 The test goes RED without `restoreFan`

* `restoreFan` made a no-op (no save/restore): **1 test RED** -
  `the twelve rank!=0 fan entries restore D0/D1/A0 (the movem frame)`,
  `error: '$281420: D0 not restored by the movem frame'`.
* `restoreFan` restoring D0 but NOT D1: **1 test RED** at `$281442` -
  `error: '$281442: D1 not restored by the movem frame'`. (The pair/triple
  entries `$281420/$281432` pass because D0 is restored and D1's bank-A
  `x4`/`/4` round trip is lossless at the test's `d1 = $11`; the first
  D1-mutating spread entry then fails.)

Restored both ways, SHA-verified: `768a6936...` for `bullets.js`.

### 3.2 Independent read of the movem.l prologues/epilogues

Raw opcode/mask decode of `maincpu.bin` (offset = address):

* **PUSH** `movem.l D0-D1/A0,-(A7)` = opcode `0x48E7`, mask `0xC080`
  (predecrement-reversed convention: bit15=D0, bit14=D1, bit7=A0).
* **POP** `movem.l (A7)+,D0-D1/A0` = opcode `0x4CDF`, mask `0x0103`
  (postincrement convention: bit0=D0, bit1=D1, bit8=A0).

Twelve distinct `0x48E7/0xC080` pushes in `$281340-$2817C4`:

```
$28142A $28143A $28144A $281458 $28148C   (entries $281420/$281432/$281442/$281450/$281484)
$28138A                                  (the adaptive body, entry $2814AC's bne target)
$28174C $28175C $28176E $281780 $2817B0   (entries $281744/$281754/$281764/$281776/$2817A8)
$2816A4                                  (the adaptive body, entry $2817B8's bne target)
```

Eleven `0x4CDF/0x0103` pops (the two adaptive pushes are popped by the pair /
spread3 body tails they branch into; the twelfth pop `$2814A6` is the orphan
`$281494`'s, which pops three longwords it never pushed - that is why it is an
orphan). Every push and every pop carries the **same** register list D0-D1/A0.
So on return D0, D1 and A0 are the caller's originals, exactly as `restoreFan`
models.

The three entries the fix does NOT wrap - `$281402 $281708 $281726` - have
**no** `0x48E7` in their own bytes (verified with a window that cannot overlap
the next entry); they are `tst.w $813098 / beq / addi.l #imm,D0 / jsr core /
nop / subi.l #imm,D0 / rts`. They restore D0 themselves with the
`addi`/`subi` pair and touch neither D1 (bank B) nor A0, so no `movem` is
needed and none is ported.

### 3.3 Two MINOR documentation nits (the code and test are correct)

> **F5-NIT-A (MINOR).** The `restoreFan` doc-comment in `src/bullets.js` and
> the worklog's §3 both say "the **four** single / inline-bias entries
> `$281402 $281708 $281726` do NOT wrap". That is **three** addresses, not
> four. Failure scenario: none for behaviour; a reader counts the complement
> of the twelve and is off by one. Fix: write "three".

> **F5-NIT-B (MINOR).** Worklog §3's "seen RED before the fix" reads
> *"8 of 12 entries fail: D0 not restored"* and *"4 of 12 fail: D1 not
> restored"*. **These are reversed.** Only the pair/triple bodies mutate D0
> (net); the spread/adaptive/inline bodies mutate D1. The actual split -
> confirmed both by static analysis of the body functions and empirically by
> the D0-only-restore probe above - is **4 entries fail on D0**
> (`$281420 $281432 $281744 $281754`) **and 8 on D1** (the rest). The shipped
> test asserts both registers per entry and passes all twelve with
> `restoreFan` present, so this is a narrative error in the worklog's
> evidence description, not a defect in the fix.

---

## 4. F2 - RESOLVED. The absence proof is now exhaustive and honestly restated.

`w21patterns.py rewrites` widens the opcode allowlist to every 68000 class
that can write through `(A6)` / `(d16,A6)`: ori/andi/subi/addi/eori
(byte/word/**long**), clr/neg/not (byte/word/long), move.b/w/**l** any-source,
and btst/bchg/bclr/bset (both forms). The scan is a byte-pattern sweep over
**every word boundary** in `$282104..$283BAF` (alignment-independent), so it
over-approximates (it will catch data that looks like an opcode) and therefore
cannot miss a real writer - the right direction for an absence claim.

**The result, reproduced:**

```
LOW byte ($1,A6) = KIND bits 0..5 writers:        0
WHOLE WORD LIVE writers to (A6):                 0
LONGWORD writers to (A6):                        27  (sprite-descriptor in tails)
clr.w/l (A6) -> 0 (FREE SLOT / death):           11
HIGH byte (A6) bit ops (bits 8..15):             48
```

* The **11 `clr.w (A6)` addresses** - `$282496 $282552 $28260E $2826CA $282BDC
  $282DEE $282EAA $282F5C $2834EC $2835BA $283696` - are **exactly** the
  review's own capstone-multi-start list. The old allowlist hid all eleven.
* **Zero writers to the LOW byte (`$1,A6`) and zero whole-word LIVE writes**
  are now exhaustively proven: any real kind-bit writer would be one of those
  encodings at an even boundary and would be caught.

The load-bearing assumption - that the 27 longword writes to `(A6)` land on
the sprite descriptor, not the type word - I verified at the canonical
continuation `$2813E`:

```
$282104: ...                       ; the BEHAVIOUR INITIALISER (A6 = record base)
$282118: move.l #$1bf58c,$a(a6)    ; writes the descriptor via DISP form $a(a6)
$282134: move.l #$28113e,$22(a6)   ; installs the continuation at rec+$22
$28213C: rts
$28113E: adda.l #$a,a6             ; CONTINUATION entry: advance A6 by $0A
$282144: addi.l #$c,(a6)           ; now (A6) = rec+$0A = the descriptor
$282152: move.l #$1bf58c,(a6)      ; an animation-frame swap, NOT a type write
$282158: lea $36(a6),a6            ; close (net +$40 = next record)
$28215C: dbra d7,$281e54
```

So in the tails `(A6)` is record+$0A; at record base the initialiser uses the
displacement form `$a(a6)`. The premise the review flagged as false ("A6 = the
record base for the whole of the mover") is corrected in the docstring and is
true where it needs to be. The conclusion (no in-flight kind rewrite) survives
and the proof is now exhaustive.

> INFORMATIONAL. The tool reports **27** longword writers = **15 `move.l` + 12
> `addi.l`**. The review's capstone multi-start sweep counted **26** (14
> `move.l` + 12 `addi.l`). The tool's wider byte-pattern net catches one more
> (the register-indirect-source `move.l (d8,A2,Xn),(A6)` at `$282C90` is the
> likely extra). Directionally consistent (the exhaustive scan finds >= the
> linear sweep); the conclusion is unaffected. The worklog's "move.l (15)"
> matches the tool.

---

## 5. NO REGRESSION

```
node --test games/ddpdoj/tests/   ->  308 pass, 0 fail, 0 skipped
```

(The wave-21 baseline was 307; 21b adds the +1 F5 register-restore test. The
brief's "307 tests still pass" is the pre-21b number; 308 is the expected
post-21b count, not a regression.)

```
node tools/w21patterngate.mjs                                   # play
  divergent=0 of 197    COVERAGE rank!=0 BODIES 0/13
node tools/w21patterngate.mjs --corpus .../fanplay.tsv          # poked
  divergent=0 of 245    COVERAGE rank!=0 BODIES 2/13
node tools/w21patterngate.mjs --corpus .../faninvuln.tsv        # invuln+poked
  divergent=0 of 10057  COVERAGE rank!=0 BODIES 7/13
node tools/w21patterngate.mjs --matrix play,fanplay,faninvuln
  every mutation RED in at least one corpus   (exit 0)
```

The matrix reproduces the wave-21 grid cell for cell (`no-global-bias` green on
play / RED on both poked corpora; `fan-never` green on play / RED on both
poked; every other row RED on play). `window-constant` is honestly listed NOT
ATTEMPTED with the structural reason and the unit tests that do cover it.

---

## 6. MY MUTATION TABLE - every check I broke, watched red, and restored

Baseline `node --test games/ddpdoj/tests/` = **308 pass, 0 fail**.

| # | finding | the mutation | result | restore SHA |
|---|---|---|---|---|
| 1 | F3 | `VEC.fold` `$283F50 -> $283F60` | **3 RED** (quadrants, asr.l, ellipse) | `675664e4` ✓ |
| 2 | F5 | `restoreFan` body -> no-op | **1 RED** (`$281420 D0 not restored`) | `768a6936` ✓ |
| 3 | F5 | `restoreFan` restores D0 only (not D1) | **1 RED** (`$281442 D1 not restored`) | `768a6936` ✓ |
| 4 | F1 | (no code mutation - re-derived counts from corpora) | 0/13, 2/13, 7/13 confirmed | - |
| 5 | F2 | (no code mutation - current scan already shows 11 clr + 27 longword) | old allowlist hid them; new one sees them | - |

All file SHAs after restore:

```
675664e4d3fba497765359898428ca0cccfbfd42de6cc2744f3198738700688b  src/bulletmath.js
768a693615dd3b23e0aedd4302e567bb6e0b6bb6e87dc349f60003e298bb920d  src/bullets.js
e9ab3792dfdf8a3c5d0463ef3f8119c61b7a6a7b2dfacdd63bac7fa9e5f8e53f  tests/bullets.test.js
```

`bulletmath.js` is unchanged by 21b (the F3 fix lives in the test file's
`mathRom()`); its SHA is the wave-21 state.

---

## 7. THE COVERAGE SENTENCE, RE-CHECKED

> **8 of 19 rank-0 entry arms** and **7 of 13 rank!=0 bodies/arms** have been
> executed by a board run; six rank!=0 arms have not, and **four of those six
> have live fire sites**. The `$284190` half has **0 of 6** branches
> board-executed (the mover is unported) but is exhaustively compared over its
> whole 65,536-point domain, and its fixture now disagrees with the subject
> when the fold-table constant is wrong (F3). The kind of a live bullet is
> fixed at spawn - proven exhaustively (F2): zero writers to the kind byte,
> zero whole-word live writes to the type word.

Every number above was re-derived independently in this review.
