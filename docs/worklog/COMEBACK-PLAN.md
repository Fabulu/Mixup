# COMEBACK PLAN — written 2026-08-03 evening, for the 03:01 resumption

Diagnostic session, READ-ONLY on the tree (one file written: this one).
HEAD at time of writing: `c0df477` "SALVAGE: DOJ W27 behaviour bodies +
Gradius W29 stage 2, both caught mid-wave". Working tree CLEAN (measured:
`git status --short` prints nothing).

Every number below was measured in this session unless it explicitly says
"per the worklog" / "per the plan". Provenance is labeled line by line.

---

## FIRST ACTION

Restore the one sabotaged line in `games/gradius/src/terrain.js` (line 143)
to its HEAD~1 state:

```js
      effStage = 0;                                // $9E54 LDX #$00 -> stage 0
```

replacing the committed mutant:

```js
      effStage = stage.stage;                      // *** RED MUTANT: was 0 ***
```

Safest form (tree is clean, so nothing uncommitted can be destroyed):

```
git restore --source=HEAD~1 -- games/gradius/src/terrain.js
git hash-object games/gradius/src/terrain.js   # MUST print a4821316044705c8c38ebae983f27b9fc13ca5b2
```

Then run the gate:

```
node games/gradius/tools/test-all.mjs
```

**What a good result looks like:** the compare stage prints
`47 scenarios, 29657 of 29657 frames compared (1 truncated: gameover@4364),
0 failures`, and the runner ends GREEN with **0 SKIPPED**. This exact
outcome was VERIFIED IN THIS SESSION on a scratchpad copy of the tree (see
"THE RED GATE" below for the proof), so if you get anything else, something
moved overnight — stop and diff against this file's numbers.

Do NOT touch `games/gradius/tools/oracle/scenarios.json`. It is correct as
committed. Reverting it is the trap (measured — see TRAPS #1).

---

## THE RED GATE — root cause FOUND (measured, not hypothesized)

### What is red

`node games/gradius/tools/oracle/compare.mjs` on HEAD, this session:
exit 1 — **47 scenarios, 29657 of 29657 frames compared, 190 failures.**

**Every failure is in ONE scenario: `endchain`.** The other 46 scenarios all
pass TIER 1 at 0 divergent. Inside `endchain` (align 6160, 5839 compared
frames, window ends f11999):

- TIER 1: 800 fields, **185 divergent**
- earliest FIRST divergence, per the first-divergence rule:
  **f11527, field `w_0703`** (terrain-queue byte 3, the first stage-2
  block's ATTRIBUTE): **rom 76 ($4C), port 16 ($10)**. Fields
  `w_0711/w_071A/w_0720` also first-diverge at f11527; the whole rest of
  the 185 (sprite counters from f11601, audio from f11781/f11866, etc.)
  is consequence.
- plus DISPLAY LIST (2431 Y + 1883 content mismatches), VIDEO at f11999
  (401 nametable + 91 OAM bytes), TERRAIN MAP 98/512 (first at $502).

f11527 is the first normal stage-2 frame. rom $4C / port $10 at `$0703` is
**byte-for-byte the divergence W29's own worklog documented as "THE TERRAIN
FALLBACK BUG (found + fixed)"** (`docs/worklog/gradius/29-impl-stage2.md`).

### The cause

`git diff HEAD~1` for the salvage commit touches exactly two gradius files:

1. `games/gradius/src/terrain.js` — ONE line inside `emitBlock`'s `$9E4C`
   stage/screen fallback, self-labeled `*** RED MUTANT: was 0 ***`. It
   un-does the W29 fix (committed in `d3b0b28`): with the mutant, stage 2's
   screen-0 fallback reads block `1:0` (attr $10) instead of `0:51`
   (attr $4C) — producing exactly the measured rom-$4C/port-$10 divergence.
2. `games/gradius/tools/oracle/scenarios.json` — removes `endchain`'s
   `compareUntilThrow: "A2F0"` and updates its prose, because stage 2 is now
   ported and the comparison legitimately runs to the dump's end (f11999).
   The `endchain.json` oracle dump was re-recorded to 12000 game frames
   today (file mtime Aug 3 19:25; `gameFrames: 12000`, `align: 6160` read
   from the dump) and pairs with HEAD.

### The proof (the revert experiment, on a copy — real tree untouched)

Copied `games/gradius` (minus `tools/oracle/out`, junctioned read-through)
to the session scratchpad, then:

- **terrain.js reverted to HEAD~1, scenarios.json kept at HEAD** →
  full `compare.mjs`: **exit 0, 0 failures, 47 scenarios,
  29657/29657 frames.** The one-line revert is sufficient.
- **BOTH files reverted to HEAD~1**, `--only endchain` →
  `[FAIL] THREW at A2F0: did NOT throw over 5839 compared frames`.
  So reverting scenarios.json BREAKS a working configuration.

Real-tree hashes verified identical before and after the experiment
(`git hash-object`: terrain.js `744e4b8...`, scenarios.json `be2ed8d...`;
`git status` clean both times). The scratchpad copy and its junction were
deleted at the end of the session (junction unlinked first, real `out/`
verified intact); the only thing this session left on disk is this file.

### Why the mutant exists (labeled INFERENCE, not measurement)

The comment style matches the project's rule-4 discipline ("every check must
be seen to fail: break, watch red, restore, hash-verify"). The wave
evidently injected the break to watch the gate go red — the 190-failure red
run IS that red — and was killed before the restore step. The salvage
commit then faithfully committed the break. The 190 failures are the
deliberate-break demonstration, frozen mid-proof. (High confidence, but the
wave's worklog does not say it, so it stays an inference.)

### Gate-wide status measured this session (real tree, HEAD)

- Gradius unit tests: **486 pass, 0 fail, 0 skipped.** GREEN OVER THE
  MUTANT — see TRAPS #2.
- DaiOuJou unit tests: **381 pass, 0 fail, 0 skipped.**
- Full `test-all.mjs` red run and `pgm.py check`: results appended at the
  bottom of this file (they were still running when this section was
  written; the appendix states what completed and what did not).

---

## THE TWO PARTIAL WAVES

### Gradius W29 — stage 2 (`docs/worklog/gradius/29-impl-stage2.md`, IN PROGRESS)

**Where it stopped:** essentially DONE except bookkeeping. The substantive
work is already committed in `7779b33` ($B37F jellyfish, $C546 late-spawner
arm, per-stage terrain loading, the $BBC3 fire-rate ladder,
`tests/w29-stage2.test.js`) and `d3b0b28` (the $9E4C terrain fallback fix).
The endchain dump was re-recorded through mid-stage-2 (f11999). The wave
died mid-red-proof, leaving the mutant in `terrain.js` (see above).

**Half-edited files:** `games/gradius/src/terrain.js` (the mutant — the
only defective line). `scenarios.json` is finished, not half-edited.

**What remains:**
1. The one-line restore (FIRST ACTION).
2. The worklog's measurement line is literally unfilled:
   "The endchain ... compares [GREEN/RED -- fill in]". Fill it with this
   session's measured result (GREEN, 5839/5839, 0 failures, once the
   mutant is reverted), set status DONE, commit.
3. Note the scope gap honestly: the endchain dump ends mid-stage-2 at
   f11999, BEFORE `$B37F`/`$C546` fire (per the scenario's own prose);
   they are unit-tested but oracle-unexercised. The plan's W29 done-when
   (`29-plan-whole-game.md`: a stage-2 scenario reaching the stage-2
   BigCore death, TIER-1 0 divergent) is therefore NOT yet met — the
   salvaged scenario prose defers the stage-2-surviving input recording
   to the reaching-method generalisation (W37). Decide (or ask the owner)
   whether W29 closes with that deferral recorded, or whether recording
   the stage-2 boss run happens now. Do not silently mark the done-when
   as met.

### DaiOuJou W27 — the 31 bullet behaviour bodies (`docs/worklog/ddpdoj/27-impl-behaviours.md`, IN PROGRESS)

**Where it stopped:** recon done, ZERO bodies ported. Measured on HEAD:
`src/mover.js` still has exactly **8 `INIT_BODIES.set` entries** (W26's
kinds 3/4/5/6/7/12/13/19). The salvage commit added **+105 lines: seven
shared helper functions only** (`byteUnderflow`, `tick19`,
`velRecomputeStore`, `epi2822AE`, `epi283C8C`, `cont283CE4`, `trailEmit`),
each citing its ROM address — and grep confirms **none of the seven is
referenced anywhere** yet. Dead code, harmless, invisible to gates
(DOJ units 381/381 green, measured).

**What the worklog already contains (its claims, not my measurements):**
the re-derived `$282030` behaviour table (39 kinds → 37 distinct bodies,
kinds 14/15 alias 10; 8 ported ⇒ 29 distinct bodies over 31 kind indices
remain), the field-layout note (the `animateRenderOffsWrap` misnomer:
offset +$0A is the DESCRIPTOR and is correct), and the structural family
grouping A–L of all 29 bodies.

**Next concrete step (the worklog's own plan, steps 1–5):** wire the 29
init + 28 continuation bodies into `INIT_BODIES`/`CONTINUATIONS` using the
now-present helpers; add the ROM windows (`$2821FA`, `$2822EC`, `$282C8E`,
`$2830EA`, `$283704`, `$1BF000..$1C2C00`) to `tools/export-tables.py` and
regenerate `rip/port/player.tables.json`; unit-test each continuation's
net A6 delta (+$40) and per-kind writes; validate the bit-7 RECOMPUTE and
bit-14 TRANSFORM paths by forcing the type word; red-proof kind 17's
heading write — **and this time restore + SHA-verify before stopping**.
Update the FINDINGS section as you go, not at the end.

---

## PRIORITY ORDER

1. **Make the Gradius gate green** (FIRST ACTION: the one-line terrain.js
   restore, then the full gate). Reason: a red gate blocks publishing and
   invalidates every other Gradius claim; the fix is one measured line.
2. **Commit the fix + close the W29 worklog.** Stage BY NAME with a
   private index (`GIT_INDEX_FILE=.git/mine.index`, `read-tree HEAD`
   immediately before committing — HANDOVER §10), commit terrain.js, the
   filled-in `29-impl-stage2.md` (status DONE + the deferral note), and
   `27-impl-behaviours.md` if you update its status line. Never
   `git add -A`.
3. **Push, then publish** (`git push origin HEAD:main`, then
   `node tools/publish.mjs`). Publishing was the blocked step; publish.mjs
   re-gates everything itself and refuses on red or SKIP, so it is its own
   final check. Confirm the deploy poll completes (three consecutive
   sightings of the new build id).
4. **Resume DOJ W27** (the bigger open wave: 29 bodies, helpers already in
   place, recon table written). This is Phase B work the owner ordered,
   and the mover gate at 0 divergent through the midboss is waiting to
   arbitrate it.
5. **Then Gradius W30** (stage 3: the inline-5 route + the moai, per
   `29-plan-whole-game.md` — the stride-change trap wave; heaviest stage,
   read its section before starting). The owner's standing loop says start
   the next recon → architect → implement round unattended.

Gate-green before new porting, in both games: new code on a red gate is
unattributable.

---

## TRAPS SPECIFIC TO THIS RESUMPTION

1. **Do NOT revert `scenarios.json` to HEAD~1.** It looks like "the other
   half of the mid-flight edit" but it is FINISHED work. Measured: with
   both files reverted, endchain fails `THREW at A2F0: did NOT throw over
   5839 compared frames` — the old `compareUntilThrow: "A2F0"` demands a
   throw that stage-2-ported code correctly no longer makes.
2. **A green unit suite proves nothing about this bug.** Measured: all 486
   Gradius unit tests pass WITH the mutant in place. Only the oracle
   comparison sees it. Similarly, DOJ's 381 green units prove W27's
   helpers didn't break anything — they do not prove any of the 29 bodies
   ported, because none is.
3. **`compare.mjs --only <subset>` is not the gate.** The self-check's
   6-scenario subset does not include endchain, and subset runs emit
   expected clamp-coverage noise (measured: `--only endchain` printed
   "2 clamps uncovered" even on a correct tree). Only the FULL compare
   (and then the full runner) is the verdict.
4. **The salvaged pieces pair asymmetrically with HEAD.** The re-recorded
   `endchain.json` dump (12000 frames, Aug 3 19:25) + HEAD's
   scenarios.json + HEAD's src (minus the mutant) form the consistent set.
   Re-recording the corpus (`scen.py`) or restoring an older dump would
   desynchronize it again. If endchain fails at anything OTHER than the
   f11527/w_0703 signature, suspect dump/scenario pairing before code.
5. **The worklogs both still say IN PROGRESS.** Whoever finishes a piece
   must update the file on disk — what is on disk is what survives.
   W29's "[GREEN/RED -- fill in]" is exactly the kind of line the next
   reader will misquote as a result.
6. **W29's done-when is not met even when the gate is green.** Green =
   no-regression through mid-stage-2 f11999. `$B37F`/`$C546` remain
   oracle-unexercised, and the stage-2 boss-death scenario does not exist
   yet. Do not report stage 2 as verified end-to-end.
7. **The DOJ W27 helpers are UNCALLED.** If you port a body and its
   helper was subtly wrong, no existing test constrains it — the helpers
   arrived without their red-proofs. Treat each as untested transcription
   until a body exercises it under the mover gate.
8. **If `git status` claims deletions/untracked files you can see on
   disk**, the shared index is poisoned (four prior occurrences —
   HANDOVER §10): `git reset` clears it without touching the worktree.

---

## APPENDIX — full-runner results (real tree, HEAD, this session)

### Gradius `node games/gradius/tools/test-all.mjs` — measured, completed

```
PASS  inputs
PASS  unit tests (node --test games/gradius/tests/)      486 pass, 0 fail, 0 skip
PASS  assets == the cartridge (verify_assets.py --self-test)
PASS  every indexed table is exported (tablecoverage.py)
PASS  per-stage coverage ledger (stageledger.py)
PASS  sound data == the measured ownership window (snddata.py --selfcheck)
PASS  one frame fits in the budget (framecost.mjs)
PASS  port trace shape == probe.lua state vector
PASS  the renderer rebuilds the cartridge pixel-exactly (rendergate.py)
FAIL  port vs cartridge (compare.mjs)                    <-- the 190 failures
PASS  self-check: the comparison goes red when the port is broken
RED -- 10 passed, 1 failed, 0 SKIPPED
```

All 7 self-check neuters went red (lead1 249, seed-x+1 167,
laginject=450 983, seed-nt+1 1, seed-pal+1 6, seed-coll0 105,
bullet-nosub 71 TIER-1 failures) — the comparison is capable of failing,
so the endchain red is a real regression, and its cause is the terrain.js
mutant (proof in "THE RED GATE" above).

### DaiOuJou `python games/ddpdoj/tools/oracle/pgm.py check` — DID NOT COMPLETE

I could not reach a full DOJ verdict. What I tried: ran the check runner
for ~9 minutes, then stopped it (it was still inside its emulator-driven
stages, with more to come; MAME had already exited cleanly). What the
captured output shows for the stages that DID run: DOJ unit tests inside
the runner 381 pass / 0 fail; the assets-integrity gate plus its 4
deliberate mutations (all expected-red, all red); the gfx gate plus its
red mutations; the scroll-program, turret and pattern gates with their
red-mutation sweeps all reporting RED-as-required; the objdriver/zoom
pixel stages printing 100.0000% matches; scroll determinism IDENTICAL over
three runs. **No unexpected failure appeared in any completed stage** —
but the runner's final PASS/FAIL ledger was never printed (killed before
the verdict, and Python's buffered stage lines were lost with it), so this
is NOT a green verdict. The 3 AM agent should run
`python games/ddpdoj/tools/oracle/pgm.py check` to completion once before
starting DOJ W27 work. The only DOJ delta on HEAD is the seven uncalled
mover helpers, so a red result there would be surprising — but that is a
hypothesis, not a finding.
