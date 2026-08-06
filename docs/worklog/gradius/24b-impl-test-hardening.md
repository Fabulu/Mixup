# Wave 24b IMPLEMENTER (test hardening) - close W24 NEEDS-FIX so it ships

status: IN PROGRESS
implementer (sole writer this wave), 2026-08-02

Subject: the six open MODERATE-or-higher findings from `24-synthesis.md`. All
test-quality or tooling; NONE a src/ correctness defect (three independent W24
roles converged on SOUND). The W24 src/ port stays as committed; this wave
rewrites tests and one tooling file so every check can be SEEN TO FAIL (RULE 4).

Read in full first: `24-synthesis.md` (verdict + mustFix), `24-test-hardening.md`
(the per-finding detail + exact replacement code), `24-review.md` (F1-F4),
`24-qa-adversarial.md` (findings 2-3). Source under test: `src/nmi.js`
(`stagePlay`/`playArm`/`st99E9`/`st997E`), `src/enemies.js` (`dispatch` default
throw).

## The six findings, with the mutant each rewritten check must catch

| # | finding | file:line | mutant that must go RED |
|---|---|---|---|
| C | `$9658` `$5B` clear unguarded (masks the dead-branch proof) | tests line 348 | delete `state.zp5B = 0;` at nmi.js:293 |
| R-F1 | `$82` zero-test half unpinned | tests (new) | `(zp4C\|zp4D)!==0` -> `(zp4C)!==0` at nmi.js:478 |
| T-A | line-47 "16-entry table" is a tautology, never calls nmi() | tests line 47 | `& 0x0F` -> `& 0x07` at nmi.js:351 |
| T-B | line-245 boss regex matches any throw | tests line 253 | boss type `0x98` -> `0x99` at nmi.js:541 |
| T-D | line-337 samples 5 frames; RED WHEN overclaims the wrap | tests line 337 | (comment rewrite + boundary loop) |
| Q-2 | compare.mjs MODELLED_1B excludes `$81-$85,$C0` | compare.mjs:83 | (tooling; verified by gate staying GREEN) |

## Baseline (measured before any edit)
```
node --test games/gradius/tests/   445 pass, 0 fail, 0 skipped
```

Findings + mutation table appended below as each fix lands and is seen RED then
restored. A SKIP IS NOT A PASS. NOTHING ROM-DERIVED IS COMMITTED.

## The edits (all test/tooling; NO src/ game logic changed)

- **C** (tests, the `$85/$9658` test): pre-set `s.zp5B = 0xFF`, assert `=== 1`.
  A residue ONLY `$9658` can clear; delete the clear and `$FF` INC-wraps to `$00`.
- **R-F1** (tests, NEW): `$82 zero-test reads BOTH $4C and $4D` -- pre-set
  `$4C:$4D = $01:$01`, run one frame, assert substate stays `$82` (and
  `$4C=0,$4D=1`). Pins the `| $4D` half the borrow test does not.
- **T-A** (tests, the line-47 tautology): replaced with `the dispatch separates
  arms: $88 routes to $9BED, not $80's body` -- drives the dispatch through nmi(),
  asserts `$88` throws at `$9BED` while `$80` still advances to `$81`.
- **T-B** (tests, line-245 regex): `/undefined|handler|\$|Error/` -> `/B914/`,
  the boss handler's actual address (enemies.js default throw renders `$B914`).
- **T-D** (tests): rewrote the line-337 RED WHEN to claim only a direct `INC $1B`
  added to `st997E`; added `$85 does not fall through across the $5B wrap
  boundary` (4-frame `$5B=0xFE` loop, honest that it goes red only in combination
  with C's mutant + an added fall-through).
- **Q-2** (tooling, compare.mjs): `MODELLED_1B` += `0x81,0x82,0x83,0x84,0x85,0xC0`;
  updated the stale comment that called them throws.

## Mutation table -- every rewritten/new check SEEN RED then restored, SHA-verified

Baseline `src/nmi.js` SHA256 (recorded before any mutant, restored after each):
`0f1efde101dba16aafa66dfed127406f0b81bb03ddd6c5fbb0e0d89037b6bb72`. After every
mutant the file was `cp`'d back from `/tmp/nmi.baseline.js` and the SHA re-read;
it matched the baseline every time (shown below). No MUTANT marker survived
(grep `MUTANT` in nmi.js -> no matches after the final restore).

| # | finding | mutant applied to src/nmi.js | RED? | restored SHA == baseline? |
|---|---|---|---|---|
| 1 | C  | delete `state.zp5B = 0;` (the `$9658` clear, line 293) | RED -- `$85 is safe because $9658...`: expected 1, actual 0 (`$FF` wrapped to `$00`) | YES |
| 2 | F1 | `(zp4C \| zp4D) !== 0` -> `(zp4C) !== 0` (line 478) | RED -- `$82 zero-test reads BOTH`: expected 130 ($82), actual 131 ($83, advanced early) | YES |
| 3 | A  | `switch (substate & 0x0F)` -> `& 0x07` (line 351) | RED -- `dispatch separates arms`: "Missing expected exception" (`$88` misrouted to `$80`'s body, advanced to `$81`, no throw) | YES |
| 4 | B  | boss type `0x98` -> `0x99` (line 541) | RED -- `$84 advance path`: throw rendered `$B913 ... entry 25`; `/B914/` correctly refused to match (the OLD regex would have passed) | YES |
| 5 | D  | add `state.substate = u8(state.substate+1)` to `st997E` (direct `INC $1B`) | RED -- BOTH the rewritten 5-frame test (20) and the new boundary loop (21): `not ok`, substate advanced | YES |

The Q-2 tooling change is verified by the gate staying GREEN (it only stops
premature truncation; no compared scenario in the corpus reaches `$81+`, so it
changes no existing comparison -- it ENABLES the future endchain/game-over
scenarios). The T-A replacement's `$80` half (advance to `$81` at bossPage) is
the same transition the line-78 test already pins.

## RULE 2 note (carried forward from test-hardening C)

Even the rewritten C test pins the `$9658` clear, NOT the `$997E` fall-through
itself: the port has no fall-through code in `st997E` to mutate, so no unit test
can make a "fall-through fires" mutant go red. The honest claim is "`$9658`'s
per-frame clear is guarded"; "$997E cannot fall through" rests on the listing
(nmi.js:594-598 comment) plus the absence of the code, not on this test.

## Done-when #7 (endchain scen) -- DEFERRED, follow-up

Not attempted this wave. Per `24-qa-adversarial.md` finding 3 and `24-synthesis.md`
Q-3, reaching the boss page (`$0C00`) needs either a RUA-hold button script that
survives to scroll `$0C00` (not found; every attempt dies from terrain `$C2C1`,
which the shield poke does not prevent) or a labelled `$0100:=1` invuln poke on
both sides (valid for transition coverage, not spawn timing). The Q-2 fix above
is the prerequisite: with `$81-$85,$C0` in `MODELLED_1B`, a recorded
`scen/endchain.json` can finally be field-compared through the standard gate
once a reaching script exists. Flagged as a follow-up; does not block ship.

## Gates (measured)
```
node --test games/gradius/tests/   447 pass, 0 fail, 0 skipped   (was 445; +2: F1, D-boundary)
node games/gradius/tools/test-all.mjs   GREEN -- 10 passed, 0 failed, 0 SKIPPED
   44 scenarios, 17416/17416 frames compared, 0 truncated (none), 0 failures
   self-check: 7 deliberate breaks all RED
```
The 6 "fields SKIPPED" in compare.mjs (pad2/oamBudget/spriteOverflow/scanline/
cpuCycle/splitSpins) are documented NOT_PRODUCED field-skips, NOT test skips --
the gate-level SKIPPED count is 0. `0 truncated: none` confirms the Q-2
MODELLED_1B change altered NO existing comparison (no corpus scenario reaches
`$81+`); it only stops the gate from truncating future endchain/game-over runs.

## VERDICT

All six W24 findings closed. Every rewritten/new test was SEEN RED under its
mutant then restored and SHA-verified (table above). The W24 src/ port is
unchanged (no game-logic edits); this wave was test-quality + one tooling file.
The load-bearing `$9658` clear that the `$997E` dead-branch proof rests on is now
guarded by a check that can see it fail (Finding C) -- the project's RULE 4 in
its exact shape, retired. Ship bar met: gate green with zero skips, no open
CRITICAL/MODERATE review findings against the W24 port.

status: DONE


