# W21b IMPL — CLEARING THE PATTERN REVIEW'S OPEN FINDINGS

status: **DONE**
wave: 21b   role: implementer (DAIOUJOU)   started/finished: 2026-08-02
target of review: `21-review-patterns.md` findings F1, F3, F5, F2.
target: `ddpdojblk` VERSION-B.  Every address is build B unless the line says
otherwise.  No build-A address introduced.

Four open MODERATE findings from the wave-21 review, all cleared.  The
transcription itself was right — the review confirmed it instruction for
instruction — so this wave changes no ported behaviour.  It fixes four CHECKS
and one PROOF so they say what they mean.

---

## 1. F1 — the coverage denominator (w21patterngate.mjs)

**The defect.** `w21patterngate.mjs` printed `BODIES reached ${size}/8` over a
13-entry map.  The hardcoded `/8` made the coverage fraction wrong in every
corpus: the play corpus prints `0/13` (honest) but the old gate printed it as
`0/8`; the faninvuln corpus reaches `7/13` bodies and the old gate called it
`7/8`.

**The fix.** The denominator is now `BODIES.size` (13), with a comment naming
the map's composition: the 8 SHARED fan bodies (`$28134E/$281366/$2813A6/$2813D4`
bank A + `$281668/$281680/$2816C0/$2816DE` bank B) plus the 5 inline / single-
shot arms (`$281402/$281450/$281708/$281726/$281776`).

**The honest sentence, before and after:**

| corpus | old (wrong) | new (honest) |
|---|---|---|
| play | `BODIES reached 0/8` | `BODIES reached 0/13` |
| fanplay | `BODIES reached 2/8` | `BODIES reached 2/13` |
| faninvuln | `BODIES reached 7/8` | `BODIES reached 7/13` |

The union across all three corpora is **7 of 13** rank!=0 bodies/arms
board-executed (`$2813A6 $2813D4 $281402 $281668 $2816C0 $2816DE $281708`).
Measured against the file's own 8 shared bodies the number is 5 of 8; the gate
now prints the real map size.

---

## 2. F3 — the self-agreeing $284190 fixture (tests/bullets.test.js)

**The defect.** `mathRom()` seeded the synthetic fold window at `VEC.fold`, the
pointer table at `VEC.speedPtrs`, and the rows at `VEC.quadStride`.
`velocity()` read back through the SAME constants.  Fixture and subject shared
the constant, so they agreed whatever it held — proven: with `VEC.fold` moved
from `$283F50` to `$283F60` AND the real-cartridge tables moved aside, the suite
was fully green reading the fold table from the wrong address.

**The fix.** `mathRom()` now seeds at LITERAL addresses:

```
const FOLD = 0x283f50;    // the fold table       ($2841A2 lea ($283F50,PC),A2)
const PTRS = 0x200920;    // the per-speed ptrs   ($284194 lea $200920,A3)
const STRIDE = 65 * 8;    //                      (0..64 quarter-angles INCLUSIVE)
const BASE = 0x200d20;    // quadrant table 0     (entry 0 of the progression)
```

The subject `velocity()` still reads through `VEC.fold` / `VEC.speedPtrs`.  If
either constant is wrong, the fixture (at the literal) and the subject (through
the constant) DISAGREE and the test goes RED.  This mirrors the record-layout
half of the suite, which already seeded at literal offsets and asserted on a
write log of literal addresses.

**The mutation, seen RED.** `VEC.fold` `$283F50` -> `$283F60`:

```
  node --test games/ddpdoj/tests/  ->  305 pass, 3 FAIL, 0 skipped
  not ok 106 - the four quadrants negate exactly $2841C2/.../$284282
  not ok 107 - `asr.l #4` is ARITHMETIC -- it rounds a negative entry ...
  not ok 114 - the exported velocity field carries the 1.5:1 ellipse ...
```

Before the fix the same mutation left the suite fully green (the fixture moved
with the subject).  Restored, SHA-verified: `675664e4...` for `bulletmath.js`.

---

## 3. F5 — the register contract (src/bullets.js)

**The defect.** Twelve rank!=0 arms (`pair06`, `triple05`, `spread2A/3A`,
`spread2B/3B`, `adaptive`, the two inlined arms) left `regs.d0` / `regs.d1`
mutated.  The ROM wraps each in `movem.l D0-D1/A0,-(A7)` / `(A7)+,D0-D1/A0`, so
on return D0, D1 and A0 are the CALLER'S ORIGINALS.  `spawnCore` models its own
register writeback correctly; the restore was missing ONE LEVEL UP.

**The fix.** A `restoreFan(regs, body)` wrapper saves D0/D1/(A0) before the body
runs and restores them after, exactly as `movem.l` does.  All twelve entries
call through it; the four single/inline-bias entries (`$281402 $281708 $281726`)
do NOT wrap — they restore D0 themselves with an `addi.l`/`subi.l` pair and no
`movem`.

**The test, seen RED before the fix.** A new test fires all twelve entries under
rank!=0 and asserts D0/D1 are the caller's originals on return.  Without
`restoreFan`:

```
  8 of 12 entries fail: "D0 not restored by the movem frame"
  4 of 12 fail: "D1 not restored by the movem frame"
```

With `restoreFan`: 308 pass, 0 fail.

---

## 4. F2 — the partial absence proof (tools/w21patterns.py rewrites)

**The defect.** The `rewrites` scan used a partial opcode allowlist (ori/andi/
eori .b/.w, move.b/w #imm and Dn, and the bit ops) with NO clr, neg, not, addi
or move.l form.  It HID 11 `clr.w (A6)`, 14 `move.l (A6)` and 12 `addi.l (A6)`
sites, and its header falsely claimed "A6 = the record base for the whole of
the mover" (it is not — continuation tails advance it).

A capstone linear disassembly was tried first but found only 20 of the ~80
sites: $282104..$283BAF is 6.7 KB of mixed code and continuation data, and a
linear pass loses sync at the first data island.

**The fix.** The byte-pattern scan (which checks EVERY word boundary — it is
alignment-independent) is kept, and the allowlist is widened to cover every
68000 instruction class that can write through (A6) or (d16,A6):

  * ori/andi/subi/addi/eori #imm — byte/word/LONG, both EAs
  * clr/neg/not — byte/word/long, both EAs
  * move.b/w/l — any source, dest (A6)/(d16,A6)
  * btst/bchg/bclr/bset — static #n and Dn forms

The false premise is corrected.  Each match is classified by WHERE it lands and
WHAT it writes.

**The result.**

```
  LOW byte ($1,A6) = KIND bits 0..5 writers:        0
  WHOLE WORD LIVE writers to (A6):                 0
  LONGWORD writers to (A6):                        27  (sprite-descriptor in tails)
  clr.w/l (A6) -> 0 (FREE SLOT / death):           11
  HIGH byte (A6) bit ops (bits 8..15):             48
```

Zero kind-bit writers, zero whole-word live writers.  The CONCLUSION (no
in-flight kind rewrite) survives; the PROOF is now exhaustive.  The 11 `clr.w`
sites match the review's own capstone multi-start sweep; the 27 longword sites
are the move.l (15) and addi.l (12) the review named, filed as sprite-descriptor
writes because A6 is advanced in the tails.

---

## 5. THE MUTATION TABLE — every changed check seen RED

| # | finding | the mutation | result |
|---|---|---|---|
| 1 | F3 | `VEC.fold` `$283F50` -> `$283F60` | **3 RED** (quadrants, asr.l, ellipse).  Before the fix: 0 RED. |
| 2 | F5 | remove `restoreFan` from the 12 entries | **12 assertions RED** (D0/D1 not restored). |
| 3 | F1 | restore the hardcoded `/8` denominator | gate prints `0/8` — numerically wrong vs the real `0/13`. |
| 4 | F2 | restore the partial allowlist | scan reports 0 clr.w, 0 move.l — HIDES the 11+27 real sites. |

All restored, SHA-verified:

```
675664e4d3fba497765359898428ca0cccfbfd42de6cc2744f3198738700688b  src/bulletmath.js
e9ab3792dfdf8a3c5d0463ef3f8119c61b7a6a7b2dfacdd63bac7fa9e5f8e53f  tests/bullets.test.js
```

---

## 6. THE MEASURED NUMBERS

```
node --test games/ddpdoj/tests/
  308 pass, 0 fail, 0 skipped    (was 307; +1 for the F5 register-restore test)

node games/ddpdoj/tools/w21patterngate.mjs                            # play
  divergent=0 of 197 spawns  -> 100.0000 %
  COVERAGE rank!=0 BODIES reached 0/13

node games/ddpdoj/tools/w21patterngate.mjs --corpus .../fanplay.tsv   # poked
  divergent=0 of 245 spawns  -> 100.0000 %
  COVERAGE rank!=0 BODIES reached 2/13 -> $2813A6 $281402

node games/ddpdoj/tools/w21patterngate.mjs --corpus .../faninvuln.tsv # invuln+poked
  divergent=0 of 10057 spawns  -> 100.0000 %
  COVERAGE rank!=0 BODIES reached 7/13 -> $2813A6 $2813D4 $281402
                                      $281668 $2816C0 $2816DE $281708

node games/ddpdoj/tools/w21patterngate.mjs --matrix play,fanplay,faninvuln
  every mutation RED in at least one corpus
  NOT ATTEMPTED: window-constant (gate-blind by construction; covered by unit test)

python games/ddpdoj/tools/w21patterns.py rewrites
  0 kind-bit writers, 0 whole-word live writers (exhaustive byte-pattern scan)
```

## 7. THE COVERAGE SENTENCE, RESTATED HONEST

> **8 of 19 rank-0 entry arms** and **7 of 13 rank!=0 bodies/arms** have been
> executed by a board run; six rank!=0 arms have not, and **four of those six
> have live fire sites** (`$28134E`/4, `$281450`/10, `$281726`/4, `$281776`/1).
> The `$284190` half has **0 of 6** branches board-executed — the mover is
> unported — but is exhaustively compared as a function over its entire
> 65,536-point domain, and its fixture now disagrees with the subject when the
> fold table constant is wrong (F3).

---

## 8. COMMIT

Via the private index `.git/doj.index`; `read-tree HEAD` immediately before
staging; staged BY NAME (never `git add -A`):
`src/bullets.js`, `tests/bullets.test.js`, `tools/w21patterngate.mjs`,
`tools/w21patterns.py`.  No ROM-derived data committed.
