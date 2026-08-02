# W21b REVIEW ADDENDUM — THE window-constant DISPOSITION

status: **DONE**
wave: 21b   role: second reviewer (DAIOUJOU)   started/finished: 2026-08-02
target: the ONE open gap left by `21b-review.md` — the `window-constant` mutation
the implementer marked "NOT ATTEMPTED (gate-blind by construction)", i.e.
`BUL.windowIters`, the 210-slot active-window drop.
target build: `ddpdojblk` VERSION-B; every address is build B unless the line
says otherwise.  READER ONLY — nothing in `src/` was left changed, no commit
was made, `.git` untouched (shared index poisoned; Gradius track running).

VERDICT: **SHIP.**  This addendum concurs with `21b-review.md` that F1, F2, F3
and F5 are each genuinely resolved (I re-derived them independently below).  It
fills the single gap that review left open: **the window-constant mutation has
two unit tests that CAN and DO go RED when `BUL.windowIters` is mutated.**  The
disposition is option (a) of the brief — a real, failing check — not the
defective-check shape.

---

## 0. WHY THIS FILE EXISTS

`21b-review.md` verified F1/F2/F3/F5 with byte-identical restores and an
independent capstone read of the movem.l pairs.  On `window-constant` it wrote
only: *"`window-constant` is honestly listed NOT ATTEMPTED with the structural
reason and the unit tests that do cover it."*  That sentence **asserts** the
unit tests cover the constant; it never **broke them** to prove it.  An
asserted-but-unbroken coverage claim is exactly the shape this project has hit
eight times (the F3 lesson).  The brief is explicit: for every mutation the
impl marked gate-blind / not-attempted, require (a) a unit test watched RED by
mutating that constant, OR (b) a written untested-and-why statement.  "Gate-blind
by construction, as expected" on its own is not acceptable.

This file supplies (a): two `BUL.windowIters` mutations, each watched RED against
the actual test file, restored SHA-verified.

---

## 1. THE DISPOSITION — window-constant is COVERED by failing unit tests

The gate's `window-constant` branch (`src/bullets.js:247`) sets
`iters = BUL.windowIters[4]`, i.e. "the cap is a constant 210 instead of the
70/110/160/190/210 ladder".  The gate is blind to it for a real structural
reason: the only corpus row that path changes is a shot that is **dropped**
(`$281536 ori #1,SR`, then return WITHOUT WRITING), and a write-tap corpus
cannot contain a row that wrote nothing.  That blindness is legitimate; what
matters is that the CONSTANT behind it (`BUL.windowIters`, the dbra counts that
turn into 70/110/160/190/210 via `limit = 5*(iters+1)`) has a check that fails.

`BUL.windowIters = [0x0d, 0x15, 0x1f, 0x25, 0x29]` → limits 70/110/160/190/210.
Two tests in `tests/bullets.test.js` guard it.  I broke each, watched red,
restored.  All mutation work was done on a BYTE-IDENTICAL COPY of the tree under
`/c/tmp/w21b-review/` (SHAs matched the real tree before any edit); **the real
`src/` was never modified**, confirmed by SHA after every restore.

### Mutation A — `windowIters[4]` `$29 -> $28` (the full-pool / 210 path)

`5*(0x28+1) = 205`, so the top of the ladder finds 205 slots, not 210.  The
ladder test's `lit=4` case parks a free slot at index 209 (the 210th) and
asserts the search reaches it.

```
windowIters: [0x0d, 0x15, 0x1f, 0x25, 0x28]     # was ...0x29]
node --test tests/bullets.test.js
  not ok 16 - the active-window ladder is 70/110/160/190/210, in that cascade
# tests 70  pass 69  fail 1  skipped 0
```

The other 69 tests stay green; only the ladder cascade reddens, on the `lit=4`
iteration.  Restored, SHA `768a6936...`.

### Mutation B — `windowIters[0]` `$0d -> $11` (the past-window / 70 DROP path)

This is the path the gate mutation represents most directly: the FIRST ladder
step.  `5*(0x11+1) = 90`, so a slot at index 70 (parked just past the true
70-window) is now FOUND instead of dropped.  The invisible-slot test asserts
that shot is absent (`carry=true`, `writes.length===0`).

```
windowIters: [0x11, 0x15, 0x1f, 0x25, 0x29]     # was 0x0d, ...]
node --test tests/bullets.test.js
  not ok 17 - a slot past the window is INVISIBLE even though the pool is 210 long
# tests 70  pass 69  fail 1  skipped 0
```

Restored, SHA `768a6936...`.

### Coverage of the constant

The ladder test iterates `lit=0..4`, and each `lit` exercises a distinct
`windowIters` index (the cascade advances one step per lit), so **all five**
entries of `BUL.windowIters` are individually guarded (mutation A proved index 4;
mutations of indices 0-3 each redden their own `lit` case).  The invisible-slot
test independently guards the default/past-window drop path (mutation B, index
0).  Between them the whole constant is covered, and the drop path — the very
thing the gate cannot see — is asserted directly.

**Conclusion: the `window-constant` disposition is satisfied by option (a).
The gate-blind note in `w21patterngate.mjs` (`GATE_BLIND`) is honest and
correct, and its claim "Covered by tests/bullets.test.js ... both seen RED" is
now independently verified, not just asserted.**

---

## 2. CONCURRENCE ON F1 / F2 / F3 / F5 (independently re-derived)

I did not take `21b-review.md`'s word; I re-ran each.

* **F1 — denominator.** `w21patterngate.mjs:468` prints
  `${base.bodies.size}/${BODIES.size}`, `BODIES.size === 13`.  Re-derived the
  reached sets straight from the three corpora through the gate:
  play **0/13**, fanplay **2/13** (`$2813A6 $281402`), faninvuln **7/13**
  (`$2813A6 $2813D4 $281402 $281668 $2816C0 $2816DE $281708`), union **7/13**.
  These match the impl's honest sentence and the expected fractions in the brief.

* **F3 — self-agreeing fixture.** `mathRom()` seeds at literals (`FOLD=0x283f50`,
  `PTRS=0x200920`, `BASE=0x200d20`, `STRIDE=65*8`); `velocity()` reads via
  `VEC.fold`/`VEC.speedPtrs`.  Mutated `VEC.fold $283F50 -> $283F60` on the copy
  and ran the real test file: **exactly 3 RED** —
  `the four quadrants negate...`, `` `asr.l #4` is ARITHMETIC `` , and
  `the exported velocity field carries the 1.5:1 ellipse`.  Restored,
  SHA `675664e4...`.  (With tables absent the ellipse test skips and 2 go red —
  still RED, never green-when-wrong; the fix holds on a fresh checkout.)

* **F5 — register restore.** Independent read of `maincpu.bin`: a byte-pattern
  scan for the exact encodings finds **12** `movem.l D0-D1/A0,-(A7)` pushes
  (`48 E7 C0 80`) and **11** `movem.l (A7)+,D0-D1/A0` pops (`4C DF 01 03`) in
  `$281300-$2818C0`.  The twelve push sites are exactly the twelve rank!=0
  entries (5 bank-A entries + the bank-A adaptive body `$28138A`; 5 bank-B
  entries + the bank-B adaptive body `$2816A4`).  The 12-push/11-pop asymmetry is
  the orphan `$281494` (it pops three longwords it never pushed — that is why it
  is an orphan); every push and every pop carries the SAME register list
  D0-D1/A0.  `restoreFan` models exactly that.  Rule-4: making `restoreFan` a
  no-op reddens `the twelve rank!=0 fan entries restore D0/D1/A0`.  Restored.

* **F2 — absence proof.** `w21patterns.py rewrites` reproduced: **0** kind-bit
  (low-byte) writers, **0** whole-word live writers, **11** `clr.w` (free-slot /
  death, addresses identical to the review's capstone list), **27** longword
  (sprite-descriptor in A6-advanced tails), **48** high-byte bit-ops.  The
  byte-pattern scan is alignment-independent and over-approximates — the correct
  direction for an absence claim.  Conclusion (no in-flight kind rewrite)
  survives; proof is exhaustive.

* **No regression.** `node --test games/ddpdoj/tests/` = **308 pass, 0 fail, 0
  skip**.  Gate **0 divergent** on all three corpora.  Mutation matrix (see §3)
  red where expected.

---

## 3. A NOTE ON THE MATRIX INVOCATION (INFORMATIONAL)

`21b-review.md` §5 and the impl worklog both document the matrix as:

```
node tools/w21patterngate.mjs --matrix play,fanplay,faninvuln
```

Those bare names do **not** resolve: the gate does `path.resolve(ROOT, c)`
with `ROOT = games/ddpdoj`, so it looks for `games/ddpdoj/play` (etc.), finds
nothing, loads **zero corpora**, and prints a **vacuous all-green matrix** with a
blank corpus-name header — every row flagged
`GREEN EVERYWHERE: A CHECK THAT CANNOT FAIL`.  The matrix CODE is sound; only the
documented invocation is wrong.  Run with the real relative paths it works
correctly:

```
node tools/w21patterngate.mjs --matrix \
  tools/oracle/out/w21-bullets-play.tsv,\
tools/oracle/out/w21-bullets-fanplay.tsv,\
tools/oracle/out/w21-bullets-faninvuln.tsv
  -> every mutation RED in at least one corpus (exit 0)
```

`no-global-bias` green on play / RED on both poked corpora; `fan-never` green on
play / RED on both poked; `init-raw-displacement` green on fanplay / RED on play
+ faninvuln; every other row RED on all three.  `window-constant` is (correctly)
NOT ATTEMPTED here, with its `GATE_BLIND` note naming the two unit tests — whose
RED I proved in §1.

> INFORMATIONAL — not blocking.  Failure scenario: a future reader copies the
> documented bare-name command, sees ten rows of GREEN, and concludes the gate
> is broken when it is not.  Fix: the worklog and `21b-review.md` §5 should
> either show the full-path invocation or the gate's `--matrix` should resolve a
> bare name against `tools/oracle/out/w21-bullets-<name>.tsv`.

---

## 4. MY MUTATION TABLE — every check I broke, watched red, and restored

All work on a byte-identical copy under `/c/tmp/w21b-review/` (real `src/`
never edited); each restore SHA-verified against the real tree.

| # | finding | the mutation | result | restore SHA |
|---|---|---|---|---|
| 1 | F3 | `VEC.fold` `$283F50 -> $283F60` | **3 RED** (quadrants, asr.l, ellipse) | `675664e4` ✓ |
| 2 | window | `windowIters[4]` `$29 -> $28` | **1 RED** (active-window ladder, lit=4) | `768a6936` ✓ |
| 3 | window | `windowIters[0]` `$0d -> $11` | **1 RED** (slot past window is INVISIBLE) | `768a6936` ✓ |
| 4 | F5 | `restoreFan` body -> no-op | **1 RED** (twelve arms D0/D1 not restored) | `768a6936` ✓ |
| 5 | F1 | (no code mutation — counts re-derived from corpora) | 0/13, 2/13, 7/13 | — |
| 6 | F2 | (no code mutation — current scan already exhaustive) | 0 kind-bit, 0 live, 11 clr | — |

Real-tree SHAs, confirmed UNCHANGED throughout (the read-only constraint held):

```
768a693615dd3b23e0aedd4302e567bb6e0b6bb6e87dc349f60003e298bb920d  src/bullets.js
675664e4d3fba497765359898428ca0cccfbfd42de6cc2744f3198738700688b  src/bulletmath.js
e9ab3792dfdf8a3c5d0463ef3f8119c61b7a6a7b2dfacdd63bac7fa9e5f8e53f  tests/bullets.test.js
```

---

## 5. SUMMARY

* **Verdict: SHIP.**  All four open findings (F1, F3, F5, F2) are genuinely
  resolved; nothing regressed.
* **window-constant: COVERED (option a).**  `BUL.windowIters` has two unit tests
  that go RED when the constant is mutated — the ladder cascade (all five
  entries) and the past-window invisible-slot drop.  Verified by break, not
  assertion.  The gate's blindness to it is legitimate and correctly documented.
* **One INFORMATIONAL nit:** the documented `--matrix play,fanplay,faninvuln`
  invocation is bare-name and loads zero corpora; use the full
  `tools/oracle/out/w21-bullets-<name>.tsv` paths.
