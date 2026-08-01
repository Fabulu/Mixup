# Wave 14 review — input granularity and frame cost
status: DONE
wave: 14   role: review   started: 2026-08-01

Reviewed commit `25b8ce6` (13 files). READER only — no edit to `src/` survives
this session; every deliberate break was restored and sha256-verified, and the
gradius worktree was confirmed byte-identical to HEAD at the end
(`git diff HEAD -- games/gradius` empty, through a PRIVATE index in the
scratchpad; the shared `.git/index` was never touched).

Verdict: **DEFECTS FOUND.** The wave's two headline claims are real and I
reproduced both. But the input fix does not hold under the one condition the
cap=2 number was chosen for, and one deliberate break of mine PASSED the whole
368-test suite.

## The task, as I understood it

1. Is the cost measurement honest — headless timing of `nmi()` itself, not of a
   loop that includes rendering or I/O?
2. Does the new cost check actually FAIL when the port gets slower? Make it.
3. Did the 42 scenarios regress? The display list is watched now — look.
4. Break at least two new checks, watch red, restore, verify byte-identical.

## What I MEASURED

### 0. Provenance

```
git rev-parse HEAD                          25b8ce6c6bcf...
git diff HEAD --stat -- games/gradius       (empty)  worktree == the commit
git show 25b8ce6 --name-only | grep -Ei "assets/|rip/|dist/|\.nes|\.bin"   none
```

### 1. The gate, re-run from scratch

```
node --test games/gradius/tests/
  # tests 368  # pass 368  # fail 0  # skipped 0

node games/gradius/tools/test-all.mjs
  42 scenarios, 14098 of 14098 frames compared (0 truncated), 0 failures,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED (pre-existing, each with a reason)
  neuter lead1 249 / seed-x+1 167 / laginject=450 983 / seed-nt+1 1
       / seed-pal+1 6 / seed-coll0 105 / bullet-nosub 71  -- all RED
  GREEN -- 9 passed, 0 failed, 0 SKIPPED
```

**No scenario regression.** The display-list and video-coverage sections are
0 failures; the only `[STILL BROKEN]` line is the pre-existing `$8871`
`fullScreenLoad` knownFail, unchanged in count (9 of 12 windows, 1165 bytes).

`scen.py` freshness re-checked rather than assumed: `out/scen/*.json` are
08-01 12:56-12:57, newer than `objloop.lua` 01:56, `probe.lua` 06:33,
`scenarios.json` 12:42. The implementer's claim holds.

### 2. Is the cost measurement honest? YES — checked, not read

`onePass()` brackets `nmi(state, b, res, false)` with
`process.hrtime.bigint()` and nothing else is inside those brackets; audio and
video are separately bracketed; there is no file or console I/O in the loop.

The harness state is not a fiction. `framecost.mjs` drives
`introEntryState(res.manifest)` — **the same function `boot()` calls at
`src/main.js:248`** — with `audiohash.mjs`'s fixed button script. I probed what
those 600 frames actually do:

```
ran 600   bailed 0                  (no frame takes the $80B7 lag bail)
enemyslot iterations total 5730
max live obj slots 8
apu log entries total 1954
modes  mode5/sub1..4 (26), mode5/sub128 (465), mode5/sub160 (109)
final cam 284    lagFrames 0
```

Real gameplay, enemies iterating, the driver writing, the camera moving. The
`nmi()` number is a real frame's number.

Reproduced on my run of the machine:

```
node games/gradius/tools/framecost.mjs
  logic  nmi()        median 0.048 ms   0.29%   0.12 / 1.0 ref
  audio  apu+drain    median 0.883 ms   5.30%   2.18 / 8.0 ref
  video  renderFrame  median 2.643 ms  15.89%   6.54 / 9.5 ref
  ref    kernel       median 0.404 ms
```

within 2% of the implementer's table. The stated caveat (node, so no
`putImageData`/compositor; a LOWER bound) is printed on every run and is
correct.

### 3. Does the cost check fail when the port gets slower? YES for video — and
     I made it fail. For logic it needs ~11x.

Four breaks, each one exact substring substitution, each restored and
sha256-verified byte-identical.

| break | measured | verdict |
|---|---|---|
| **R1** `src/render/ppu.js`: the pre-fix per-pixel `tileRow()` restored | video **13.50** / 9.5 ref, sum 15.89 / 15.0 | **RED, exit 1** |
| **R2** `src/nmi.js`: +10,000 LCG iterations (nmi 3.5x slower, 0.048 → 0.169 ms) | logic 0.43 / 1.0 ref | **GREEN, no WARN** |
| **R3** the same, 30,000 (nmi **7.4x** slower, 0.048 → 0.356 ms) | logic 0.94 / 1.0 ref | **GREEN**, WARN only |
| **R4** the same, 50,000 (nmi **11.5x** slower, 0.554 ms) | logic 1.51 / 1.0 ref | **RED, exit 1** |

So the stage is a real gate, not a decoration — R1 is the exact regression it
was written for and it goes red by 1.4x, under my machine's load as well as the
implementer's. But the **logic** limit is 1.0 ref against a measured 0.11-0.12,
and R2/R3 show that is not a "~7x margin" in the reassuring sense: `nmi()` can
get **7.4x slower and the gate stays green**, and the total limit (15.0 vs a
measured 8.7-8.9) does not pick it up either. The stage that was added because
"nobody has ever measured how long one logic frame takes" will not notice the
logic tripling.

### 4. The renderer fix is bit-identical — verified INDEPENDENTLY

Not by re-reading the implementer's claim: I hashed 200 consecutive rendered
frames of the real port (12,288,000 px) with the committed renderer and again
with R1 applied.

```
fixed    PIXHASH 968fd59eb6585b953b4c1d63067dc2e738e23e965e15a57258cb8b8e1a16bc39
pre-fix  PIXHASH 968fd59eb6585b953b4c1d63067dc2e738e23e965e15a57258cb8b8e1a16bc39
```

Identical. The "cost only" claim holds. `tests/ppu.test.js` also re-run: 0 of
61,440 px on every capture present.

**Correction to the report**: it says "all ten captures" and "0 of 61,440 on all
ten captured frames". There are **nine**; `f1200` prints
`SKIP f1200: no capture in tools/oracle/out/video/f1200/` and the test still
passes. `tests/ppu.test.js`'s own new comment says "seven captured frames". Two
numbers, both wrong, in the same wave.

### 5. THE BREAK THAT PASSED — `noteInput()`'s idempotence guard

```
src/input.js:
  function noteInput() {
    const w = u8(held | touchHeld);
    if (w === live) return;          <-- DELETE THIS LINE
```

```
node --test games/gradius/tests/     # tests 368  # pass 368  # fail 0  # skipped 0
```

**The whole suite is green with the guard gone**, including `loop.test.js`'s 17
new checks. The file's own docstring calls the guard load-bearing ("Idempotent:
a handler that fires without changing the mask queues nothing, so holding a key
does not push 60 identical words a second") and nothing executes it. Measured
consequence, with the guard deleted:

```
HELD KEY (60 auto-repeat keydowns)      depth 1  coalesced 0
SAME DIR (2 pointermoves/frame, same direction)  depth 1  coalesced 59
```

i.e. the queue never drains — and a permanently non-empty queue is exactly the
state that destroys taps (section 6). The pattern is the same one the
implementer named for B4: a rule stated in a comment, with the test covering the
path where the rule is not exercised. Every existing queue test hands
`setTouchDirections`/`setTouchButton` a *different* mask each time.

### 6. THE INPUT FIX DOES NOT HOLD WHERE IT MATTERS MOST — a sub-frame tap is
     lost whenever the queue is at its cap, and the phone d-pad holds it there

The rule at the cap is "the NEWEST state overwrites the tail". A press and its
release both arriving while the queue is full therefore write the tail twice —
`A` then `0` — and **the press never occupies a slot at all**.

Minimal repro, k=1, the healthy host, no load, `resetInput()` first:

```
callback 0:  press A, release A   ->  word 128 (A)   depth 1  coalesced 0
callback 1:  press A, release A   ->  word 0         depth 1  coalesced 1
callback 2:  press A, release A   ->  word 0         depth 1  coalesced 2
```

The first tap survives and leaves the queue one deep; from then on **every**
sub-frame tap is destroyed. 60 taps, 1 A-edge. (One event-free callback drains
it and the next tap works again: `[128, 0, 128]`.)

And the condition that keeps the queue full is not exotic — it is the exact case
the cap=2 trade was written for. A finger sliding on the d-pad emits two
`pointermove`s per animation frame; `src/input.js` says so itself. Simulated,
k=1, fire tapped 10 times a second:

```
slide + SUB-FRAME fire taps       taps 20   A-edges  0   depth 1  coalesced 40
slide + one-callback fire taps    taps 20   A-edges 20   depth 1  coalesced 40
```

**Zero of twenty shots fired.** `src/input.js` and the worklog document the loss
as "a press-release-press inside one 16 ms animation frame ... physically
implausible". The actual loss is "any press+release inside one animation frame
while ANY other control is producing at least one transition per frame", which
on a touch pad is the steady state. The wave's headline — "a press and its
release landing between two animation frames were never seen at all ... Fixed"
— is true for an isolated tap from a drained queue and false while steering.

To be fair to the change: the OLD code fired **0 of 60** in the first repro and
0 of 20 in the second, so nothing regressed. But the claim in the commit
message, the worklog, the README and `src/input.js` is stronger than what was
built, and `13-FINDING-...md` has been moved to SETTLED on the strength of it.

Cheapest fix that keeps the cap: when the queue is full, only overwrite the tail
if the tail is not itself an undelivered transition — or push the press and let
the release coalesce, i.e. never let a *rising* edge be the thing that is
dropped. Whatever is chosen, the test that fails today is "N sub-frame taps
while the d-pad is sliding produce N edges".

### 7. The new capture-free ppu guard does not guard what its comment claims

`tests/ppu.test.js`'s new test exists, in its own words, because the pixel
comparison "SKIPS when tools/oracle/out/video/ is absent, and a cost fix that is
only guarded by a skippable test is not guarded". But `tilePixel` and `tileRow`
both call `tileBase`, so the test cannot see an error in `tileBase`:

```
break: tileBase strides row * 4 instead of row * 8
node --test --test-name-pattern="same arithmetic" games/gradius/tests/ppu.test.js
  # tests 5  # pass 1  # fail 0     -> GREEN
```

(The full file goes red — via the capture comparison, the thing that skips.) So
on a checkout without `tools/oracle/out/video/`, `tileBase` is unguarded, which
is the situation the test was written to fix. It does catch a wrong *column*
mask (B12) and a wrong tile; it does not catch the base address.

### 8. Two smaller things, both real, neither fatal

* **The cost stage has no self-check.** `test-all.mjs` has a whole stage called
  "self-check: the comparison goes red when the port is broken" for
  `compare.mjs`. Nothing anywhere imports `tools/framecost.mjs` — grep over
  `tests/` and `tools/` returns only the `test-all.mjs` invocation. `LIMITS`,
  `checkBudget`, `reference()` and the best-pass rule are all untested code that
  decides a gate. R1 and R4 above are the only evidence they can fail and they
  were run by hand.
* **`measure()` picks the reporting pass by `logic.median`** (`framecost.mjs`
  line 293) but then gates `audio`, `video` and the sum on that same pass. The
  video verdict therefore comes from a pass chosen on an unrelated criterion.
  Measured spread across passes 1-4 on a quiet run: video/ref 6.51-6.70 (3%), so
  it does not flap today at a 1.4x margin — but it is noise the design did not
  intend, and `best = the pass with the lowest video/ref` costs nothing.
* **`tileRow()` now calls `tileBase()` inside its 8-iteration loop** instead of
  computing the offset once. It is still used by the sprite path
  (`ppu.js:234`, ~1,900 calls/frame), so the effect is negligible and the total
  is measured green — noting it only because the commit calls this change "cost
  only" in one direction.

## What I RULED OUT

* **A scenario regression.** 42 scenarios, 14,098/14,098 frames, 0 failures,
  0 display-list-coverage failures. Re-run end to end, not read off the report.
* **A pixel change in the renderer.** Byte-identical sha256 over 200 frames /
  12.288 M px, independently of `tests/ppu.test.js`.
* **A dishonest cost harness.** The timed region contains only `nmi()`; the
  state is `boot()`'s own; the 600 frames are real mode-5 gameplay with 0 lag
  bails.
* **`nmi()` being the "unresponsive" cause.** Reproduced: 0.048 ms median,
  0.29% of budget. The FINDING's candidate 2 is measured false.
* **A stale oracle.** mtimes check reproduced.
* **Anything ROM-derived in the commit.** None.
* **The FramePacer arithmetic.** `loop.test.js`'s clamp/negative-delta/histogram
  cases all go red when broken (I re-broke the cap; see below) and the
  divide-don't-subtract note is correct.

## Breaks I ran, all restored byte-identical (sha256 verified each time)

| # | break | expected | got |
|---|---|---|---|
| R1 | pre-fix per-pixel `tileRow` | RED | **RED** video 13.50/9.5 |
| R2 | `nmi()` 3.5x slower | RED? | GREEN — see §3 |
| R3 | `nmi()` 7.4x slower | RED? | GREEN + WARN — see §3 |
| R4 | `nmi()` 11.5x slower | RED | **RED** logic 1.51/1.0 |
| R5 | `noteInput()` loses `if (w === live) return;` | RED | **GREEN — §5** |
| R6 | `MAX_PENDING` 2 → 3 | RED | **RED**, `loop.test.js` #11 |
| R7 | `tileBase` strides `row * 4`, new test alone | RED | **GREEN — §7** |

## If someone picks this up cold

The three things to fix, in order:

1. `src/input.js`'s cap rule — a rising edge must never be the thing the
   overwrite discards (§6). Add the failing test first: sub-frame taps while
   the d-pad slides.
2. A keyboard/touch test that executes `noteInput()`'s idempotence, i.e. fires
   the SAME mask twice and asserts `depth === 0` (§5).
3. A self-check stage for `framecost.mjs` (§8) — `checkBudget()` fed a synthetic
   `measure()` result must return failures; and tighten `LIMITS.logic` from 1.0
   to something near 0.3 (§3), which is still 2.5x the measured value.
