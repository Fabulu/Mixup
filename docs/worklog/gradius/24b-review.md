# Wave 24b REVIEW - did the test-hardening fix actually harden?

status: DONE
reviewer (READ-ONLY on src/ and on tests; ran everything), 2026-08-02

Subject: commit `0a6d122` "Gradius W24b: harden the W24 sub-state tests (close
NEEDS-FIX)". The six open MODERATE-or-higher findings from `24-synthesis.md`.
My job, per RULE 4: for each of the six, confirm the finding is genuinely
closed AND that the new/rewritten test can actually FAIL -- break it, watch
red, restore, SHA-verify both ways. Plus the no-regression gates.

Read first: `24-synthesis.md` (verdict + mustFix), `24-test-hardening.md`
(A/B/C/D + exact code), `24-review.md` (F1-F4), `24-qa-adversarial.md`
(findings 2-3), `24b-impl-test-hardening.md` (the fix under review).

## VERDICT: APPROVE. Ship bar met.

All six W24 findings are genuinely closed. Every rewritten/new test was SEEN
RED under its named mutant and restored SHA-clean (table below -- I re-ran
every mutant myself this pass, not quoted from the implementer). No src/ game
logic was touched (the W24b commit moves exactly three files: this worklog, the
test file, and `compare.mjs`). The load-bearing `$9658` clear that the
`$997E` dead-branch proof rests on is now guarded by a check that can see it
fail -- RULE 4, in its exact shape, retired.

One new INFORMATIONAL finding (F1 below): a single inline comment in the new
`$5B`-wrap-boundary test underclaims what that test catches (the inverse of the
original T-D overclaim; the test itself is sound). Not blocking.

## The gates (re-run myself, 2026-08-02 -- not quoted)

```
node --test games/gradius/tests/        447 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs   GREEN -- 10 passed, 0 failed, 0 SKIPPED
                                        44 scenarios, 17416/17416 frames
                                        compared (0 truncated: none), 0 failures
                                        self-check: 7 deliberate breaks all RED
python games/gradius/tools/census.py dispatch
    entries ported 19 / 42 ; throwing 23 ; distinct 16 / 34   (UNCHANGED)
git show --stat 0a6d122
    docs/worklog/gradius/24b-impl-test-hardening.md | 121 ++++++++++
    games/gradius/tests/w24-substate.test.js        | 109 +++++++--
    games/gradius/tools/oracle/compare.mjs          |  16 +-
    (NO src/ file touched)
```

The `0 truncated: none` line is the Q-2 evidence: no corpus scenario reaches
`$81+` (the deepest, `deep-powered`, holds `$1B=$80` for all 3099 frames), so
adding `$81-$85,$C0` to `MODELLED_1B` changed zero existing comparisons -- it
only stops the gate truncating FUTURE endchain/game-over runs. The 6 "fields
SKIPPED" (pad2/oamBudget/spriteOverflow/scanline/cpuCycle/splitSpins) are
documented NOT_PRODUCED field-skips inside compare.mjs, NOT gate-level skips;
the gate-level SKIPPED count is 0.

## Mutation table -- every rewritten/new check SEEN RED then restored this pass

Baseline `src/nmi.js` SHA256 (recorded before any mutant, re-read after each
restore): `0f1efde101dba16aafa66dfed127406f0b81bb03ddd6c5fbb0e0d89037b6bb72`.
After each mutant the file was `cp`'d back from `/tmp/nmi.baseline.js` and the
SHA re-read; it matched every time. `grep -c MUTANT` was 0 after the final
restore. `git diff --stat games/gradius/src/nmi.js` is empty (nmi.js is clean
at HEAD).

| # | finding | mutant I applied to src/nmi.js | RED? (the specific test) | restored SHA == baseline? |
|---|---|---|---|---|
| 1 | C (load-bearing) | delete `state.zp5B = 0;` (the `$9658` clear, line 293) | RED -- `$85 is safe because $9658...`: expected 1, actual 0 (`$FF` carried into the INC and wrapped to `$00`) | YES |
| 2 | R-F1 | `(zp4C \| zp4D) !== 0` -> `(zp4C) !== 0` (line 478) | RED -- `$82 zero-test reads BOTH $4C and $4D`: substate advanced to `$83` early | YES |
| 3 | T-A | `switch (substate & 0x0F)` -> `& 0x07` (line 351) | RED -- `the dispatch separates arms`: `$88` misrouted to `$80`'s body, no `$9BED` throw | YES |
| 4 | T-B | boss type `0x98` -> `0x99` (line 541) | RED -- `$84 advance path spawns the boss`: the `/B914/` regex refused to match (the OLD regex would have passed) | YES |
| 5 | T-D | add `state.substate = u8(state.substate+1)` to `st997E` (direct `INC $1B`) | RED -- BOTH `$85 is INC $5B only` (5-frame) AND `$85 does not fall through across the $5B wrap boundary` (4-frame loop): substate advanced | YES |

## The six findings, each verified

### FINDING C (MODERATE+, load-bearing) -- CLOSED

The `$9658` per-frame `$5B` clear (`state.zp5B = 0;` at nmi.js:293) is the
foundation of the "`$997E` fall-through is dead" absence proof. The old line-348
test pre-set `zp5B=0` -- exactly the value `$9658` produces -- so deleting the
clear left the test GREEN (lesson 38). The rewrite (w24-substate.test.js:399)
pre-sets `s.zp5B = 0xFF` (a residue ONLY `$9658` can clear) and asserts `=== 1`.

I deleted line 293: the test went RED -- `not ok 22`, error "expected 1, actual
0" (`$FF` carried into `st997E`, the INC wrapped `$FF -> $00`). Restored, SHA
matches. This is the RULE 4 retirement the wave exists for. The test's own
comment is honest about RULE 2: it guards the `$9658` clear, NOT the fall-
through itself (the port has no fall-through code in `st997E` to mutate; that
rests on the listing at nmi.js:594-598 plus the absence of the code).

### FINDING R-F1 (MODERATE) -- CLOSED

The `$82` countdown zero-test `(zp4C | zp4D) !== 0` has TWO load-bearing
halves. The borrow half was pinned; the zero-test half (`| $4D`) was not -- a
mutant dropping it ends the timer after 256 frames instead of 768. The new test
(w24-substate.test.js:183) pre-sets `$4C:$4D = $01:$01`, runs one frame, asserts
substate stays `$82` (and `$4C=0,$4D=1`).

I mutated line 478 to `(zp4C) !== 0`: RED -- `not ok 10`, substate advanced to
`$83` (the mutant saw `$4C==0` and exited early despite `$4D==1`). Restored,
SHA matches. The `$4D` half is now pinned.

### FINDING T-A (MODERATE) -- CLOSED

The old line-47 "16-entry table" test was a JavaScript tautology
(`(0x80|n) & 0x0F === n` is true by definition) that NEVER CALLED `nmi()`. It
is GONE. The replacement (w24-substate.test.js:47) drives the dispatch THROUGH
`nmi()`: `$88` with `cam.hi=BOSS_PAGE` must throw at `$9BED`, while `$80` with
`cam.hi=BOSS_PAGE` must still advance to `$81`.

I mutated line 351 to `& 0x07`: RED -- `not ok 1`, `$88 & 0x07 == 0` routed to
`$80`'s body which advanced `$1B`, so no `$9BED` throw fired and
`assert.throws` failed. Restored, SHA matches. The replacement is a real
dispatch-separation assertion, not a decoration.

### FINDING T-B (MODERATE) -- CLOSED

The old line-245 regex `/undefined|handler|\$|Error/` matched EVERY ROM-
addressed throw in the port (`\$` alone matches all of them). It is now `/B914/`
(w24-substate.test.js:282) -- the boss handler's actual target address.

I mutated line 541 to boss type `0x99`: RED -- `not ok 16`, the throw now names
a different entry/target, and `/B914/` correctly refused to match (the error
message is exactly "type $98 must dispatch to $B914...", confirming it was the
REGEX that failed, proving specificity). Restored, SHA matches. The boss-byte
side-effect asserts after the throw (`type[bi] === 0x98` etc.) still pin the
spawn; only the throw-matching line was weak before.

### FINDING T-D (MODERATE) -- CLOSED (one INFORMATIONAL nit, F1 below)

The old line-337 5-frame test's RED WHEN comment OVERclaimed it caught the
256-frame `$5B`-wrap hazard. Five frames cannot reach a 256-frame wrap. The
rewrite splits the concern:
- The 5-frame test (w24-substate.test.js:367) now honestly says it catches a
  DIRECT `INC $1B` added to `st997E`, and explicitly states "It does NOT, on
  its own, catch the 256-frame `$5B`-wrap hazard". No overclaim.
- A NEW 4-frame `$5B=0xFE` boundary loop (w24-substate.test.js:382) parks `$5B`
  near the wrap each frame.

I added `state.substate = u8(state.substate+1)` to `st997E`: BOTH tests went RED
(`not ok 20` and `not ok 21`). Restored, SHA matches. The overclaim is gone.

### FINDING Q-2 (MODERATE, tooling) -- CLOSED

`compare.mjs`'s `MODELLED_1B` was `{0,1,2,3,4,$80,$A0}` -- it excluded the W24
sub-states, so the harness TRUNCATED the instant `$1B` left `$80`, making a
field comparison of the W24 sub-states impossible through the standard gate
(QA had to write a one-off `cmp-gameover.mjs`). It is now
`{0,1,2,3,4,0x80,0x81,0x82,0x83,0x84,0x85,0xA0,0xC0}` (compare.mjs:91), and
the stale comment that called them throws is rewritten (lines 79-89).

The truncation logic at compare.mjs:329 (`!MODELLED_1B.has(o.w_001B)`) now
admits `$81-$85` and `$C0`. The full corpus run confirms `0 truncated: none` --
no existing scenario reaches those states, so the change is a pure ENABLE for
future endchain/game-over scenarios. Verified GREEN.

## The scen dump -- DEFERRED, not silently dropped

The task asked: if the `scen/endchain.json` dump was recorded, confirm it
compares green over f310-2620; if deferred, confirm it is flagged as a
follow-up. It was DEFERRED. There is no `scen/endchain.json` and no game-over
scen dump in `tools/oracle/out/scen/` (43 scen files; the deepest is
`deep-powered`, which holds `$1B=$80` for all 3099 frames -- none traverses
`$81+` or `$C0`). The deferral is explicit in `24b-impl-test-hardening.md`
("Done-when #7 (endchain scen) -- DEFERRED, follow-up") with the structural
reason (no boss-page-reaching button script survives; the shield poke does not
prevent terrain `$C2C1` death). It is flagged as a follow-up that does not
block ship, not silently dropped. The Q-2 fix is the stated prerequisite: with
`$81-$85,$C0` in `MODELLED_1B`, a recorded dump can finally be field-compared
through the standard gate once a reaching script exists.

---

## FINDINGS (this review)

### F1 -- INFORMATIONAL: the new boundary-loop comment underclaims what the test catches

`w24-substate.test.js:387-388`:
> "it goes RED only if `$9658` is removed (Finding-C mutant) AND a fall-through
> is then added -- i.e. it pins the COMBINATION"

The implementer's OWN mutation table (mutant #5) and my re-run above both show
this test goes RED when a fall-through (`state.substate++` in `st997E`) is added
ALONE, with `$9658` STILL PRESENT. The "only if `$9658` is removed AND" clause
is too strong -- the `assert.strictEqual(s.substate, 0x85)` catches ANY
substate advance, whether the wrap-induced kind (which does need `$9658`
removed to be reachable) or a direct `INC $1B` (which does not).

This is an UNDERCLAIM -- the inverse of the original T-D overclaim defect, and
strictly less dangerous (the test is sound and stronger than the comment says).
The comment's logic about the wrap-boundary hazard specifically is correct; it
just does not mention that the loop also unconditionally catches a direct
advance. Suggest a one-line comment touch if a future pass is in the file: "it
goes red on ANY `$1B` advance from `st997E`; the wrap-boundary framing
additionally requires `$9658`'s removal." Not blocking; no must-fix.

---

## Things I checked and found CORRECT (so nobody re-derives them)

- **The commit boundary is clean.** `git show --stat 0a6d122` moves exactly
  three files (worklog, test, compare.mjs); NO `src/` file. The W24 src/ port
  (commit `537c8e1`) is byte-identical at HEAD. `git diff --stat
  games/gradius/src/nmi.js` is empty after my mutation restores.
- **The dispatch census is UNCHANGED** (19/42 ported, distinct 16/34) -- W24b
  is test/tooling only, so no coverage moved.
- **The line-78 `$80` exit test and the line-267 boss test still pin their
  transitions** (I drove the full file green under baseline; the +2 count is
  exactly the F1 zero-test and the T-D boundary loop).
- **The `$9658` clear is correctly placed** at nmi.js:293 inside `stagePlay`,
  BEFORE the `$96A5` ladder reaches `$997E` (confirmed by reading lines 280-
  330). The C test's residue (`$FF`) can ONLY be cleared by that line.
- **`/B914/` is the right address.** enemies.js default-branch throw renders
  `hex4(target)` = `B914` for the boss type `$98` -> dispatch entry 24; the
  census agrees (`24 $B914 THROWS`). The regex matches the boss handler and
  nothing else in the port.

status: DONE
