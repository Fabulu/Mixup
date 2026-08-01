# Wave 14 — Input granularity, and what a logic frame costs
status: DONE, with §4 SUPERSEDED — see the correction below
wave: 14   role: impl   started: 2026-08-01 (date given in-session)

> **CORRECTION, added by wave 15 (2026-08-01).** §4 and item 2 of "the three
> things a reviewer should look at hardest" claimed a fix that was measured, by
> wave 14's own reviewer, to work only for an isolated tap from a drained queue.
> **The overwrite-the-tail rule destroyed every sub-frame tap while any other
> control was moving** — on the touch d-pad, always. Measured, k=1, no host
> load: a sliding finger plus FIRE tapped ten times a second fired **0 of 20**
> shots. Wave 15 replaced the rule (`tail := w | (tail & ~prev)`, so a press
> survives its own release) and the same rig now fires **20 of 20**. §4 below is
> left as written, because what it got wrong is the point; read
> `14-review.md` §6 and `15-impl-input-queue-fix.md` for what is true now.
>
> The same correction applies to this wave's commit message (`25b8ce6`, "taps
> were being dropped"), to `games/gradius/README.md` and to `src/input.js`'s own
> comment block. All three have been corrected in wave 15's commit; a commit
> message cannot be, so it is corrected here.
>
> Two other numbers in this file are wrong and the reviewer measured them: there
> are **nine** captured frames in `tests/ppu.test.js`, not ten (§2), and the new
> capture-free `tilePixel`/`tileRow` test cannot see an error in `tileBase`
> because both sides call it (`14-review.md` §7). Neither is fixed here.

## The task, as I understood it

`13-FINDING-input-granularity-under-load.md` said, from READING and not from
measurement, that `src/main.js` calls `currentButtons()` inside the catch-up
loop, so k logic frames in one animation-frame callback all consume the same
input word. Settle it by measurement, in this order:

1. what one logic frame COSTS (min / median / p99 against 16.639 ms),
2. what k actually is,
3. only then attribute anything to host contention;

then fix the input path (one word per LOGIC frame, from a queue) and add a COST
check to the gate so it cannot silently regress.

## THE ANSWER, IN FOUR LINES

1. **`nmi()` is not the problem.** Median **0.039 ms**, p99 0.138 ms, against a
   16.639 ms budget: **0.24% of a frame**. The FINDING's candidate 2 ("waves
   6-11 added firing, the kill chain, power-ups, sound and enemy bullets ... it
   is entirely possible the port now needs more than 16.6 ms per frame") is
   FALSE, and it is measured false.
2. **`renderFrame()` was.** Median **6.074 ms — 36% of the whole frame budget**,
   more than `nmi()` and the wave-13 synthesiser put together. Its background
   loop called `tileRow()` once per PIXEL, filling an 8-byte scratch array to
   read one byte of it, 61,440 times a frame. One line, bit-identical by
   construction: **2.481 ms**, a 2.45x cut. Nobody had ever looked, because
   nothing in this repo has ever measured cost.
3. **The input mechanism was real and the FINDING understated it.** k frames
   sharing one word is the mild version. The severe version is that a press and
   its release that BOTH land between two animation frames were **never seen at
   all** — the live mask went 0 → A → 0 with nothing looking, so the shot was
   never fired. Fixed by queueing transitions in the DOM handlers and handing
   out one word per logic frame.
4. **k itself is still unmeasured and I could not measure it.** It needs a
   browser. The port now counts it and the page prints it. See "What I could not
   do".

## Correction to the brief, before anything else

The brief says "THERE IS NO AUDIO OUTPUT AT ALL: no AudioContext anywhere in the
port." That was true when wave 13 was commissioned and is not true now: wave 13
landed `src/audio/apu.js`, `src/audio/output.js`, `tools/audiohash.mjs` and the
page wiring (`237250a`, `2b35269`). The loop this wave edits is the one wave 13
already put an audio batch into, and the synthesiser is the second most
expensive thing in the frame. Recorded because a stale brief is exactly the kind
of claim this repo keeps being bitten by.

## What I built

| file | what |
|---|---|
| `games/gradius/tools/framecost.mjs` | **NEW.** The cost measurement and the gate's cost check. Times `nmi()`, the synthesiser and `renderFrame()` separately, N passes, best pass wins; gates on a ratio to a reference kernel timed in the same loop iteration. |
| `games/gradius/src/input.js` | the transition queue: `noteInput()` in every handler, `nextInputWord()`, `inputQueueStats()`, `resetInput()`. `currentButtons()` stays and its docstring now says the loop does not call it. |
| `games/gradius/src/main.js` | `FramePacer` (the accumulator, the clamp, and the **k census**) and `stepLogicFrames()` (the loop body, extracted so it can be tested at all). |
| `games/gradius/src/render/ppu.js` | `tileBase()` / `tilePixel()`; the background loop reads one byte instead of eight. **Cost only** — 0 pixels differ. |
| `games/gradius/index.html` | `k <avg>avg/<max>max/<n>clamped` and `inq <depth>/<n>lost` on the stats line. |
| `games/gradius/tests/loop.test.js` | **NEW**, 17 checks: the pacer with a fake clock, the queue, and `stepLogicFrames` driving the real `nmi()`. |
| `games/gradius/tests/ppu.test.js` | `tilePixel` vs `tileRow` over the whole 131,072-byte tile pool — the guard that does not need a capture. |
| `games/gradius/tests/page-wiring.test.js` | the stats line is now executed and asserted, not just built. |
| `games/gradius/tools/test-all.mjs` | stage 1d, `framecost.mjs`. |
| `docs/worklog/gradius/13-FINDING-...md` | status NOT INVESTIGATED → SETTLED, with the measurements (rule 5, same commit). |

## What I MEASURED

### 1. The cost of a frame — the thing nobody had ever measured

`node games/gradius/tools/framecost.mjs`, best of five passes of 600 frames of
`audiohash.mjs`'s scripted run (a CONSTANT: firing, moving, the driver busy):

```
BEST PASS                min   median      p99      max  of budget
  logic  nmi()        0.007  0.039  0.138  2.576     0.24%
  audio  apu+drain    0.509  0.782  1.722  2.473     4.70%
  video  renderFrame  1.154  2.481  4.829  6.055    14.91%     <- AFTER the fix
  ---- medians sum 3.303 ms = 19.8% of the 16.639 ms budget
```

and the same run **before** the one-line renderer fix:

```
  logic  nmi()        0.014  0.087  0.239  2.139     1.44%
  audio  apu+drain    0.608  1.006  2.507  3.197    15.07%
  video  renderFrame  1.509  6.074 12.475 14.021    74.98% p99  <- BEFORE
  ---- p99 sum 15.221 ms = 91.5% of budget
```

**`renderFrame()` was 36% of the frame budget at the median and 75% at p99, in
node, before `putImageData` and before the compositor.** That is the number the
owner's "really unresponsive" report was about, and it is not `nmi()`.

### 1b. "Why when it starts" — candidate 1 is also FALSE for `nmi()`

The FINDING's other candidate was that the first second is the most expensive
second (the blanked 27-frame intro, the terrain streamer filling a screen it has
not filled before). `framecost.mjs --csv` gives the per-frame series; split
three ways:

```
frames 0-59     min 0.0098  med 0.0741  p99 0.1164  max 0.2013  mean 0.0645
frames 60-299   min 0.0702  med 0.0903  p99 0.2384  max 2.4007  mean 0.1074
frames 300-899  min 0.0094  med 0.0729  p99 0.2413  max 9.6994  mean 0.1041
```

The first second is the CHEAPEST of the three by mean and by max. The ten most
expensive frames are 516, 581, 221, 698, 407, 602, 246, 556, 225, 676 — spread
across the run and not clustered at the start, and the top three (9.70, 4.76,
2.40 ms) are two orders of magnitude above the median, which is a scheduler
steal, not a workload. **So neither of the FINDING's two "why at the start"
candidates survives for `nmi()`.** What IS true at the start is that the browser
has just been handed a fresh page — JIT warm-up is real and this tool measures
it (pass 0 costs 1.5-3x pass 4 for the same work) — and that is the frame loop's
first second in a browser, not the game's.

### 2. The renderer defect, and why it is a translation-free fix

`src/render/ppu.js`'s background loop, per PIXEL:

```js
tileRow(tiles, bgBank, bgHalf, tile, fineY, px);   // copies EIGHT bytes
bgpix[x] = px[fxb & 7];                            // reads ONE of them
```

61,440 times a frame — 491,520 byte copies where 61,440 reads would do, plus a
function call per pixel. The fix indexes the same byte by the same arithmetic
(`tileBase()`, now shared with `tileRow()`), so it is bit-identical by
construction and not by hope. Verified three ways:

* a standalone A/B over 200 consecutive frames: **0 of 12,288,000 pixels differ**;
* `tests/ppu.test.js`: all ten captured frames still **0 of 61,440 px** against
  Mesen's framebuffer, and all thirteen break switches still seen;
* `tools/oracle/rendergate.py` in the gate: PASS.

Measured effect, isolated benchmark, best of five passes each:
`current 7.047 ms/frame -> hoisted 2.411 ms/frame, 2.92x`.

Where the remaining time goes, measured by isolating pieces (200 frames each,
best of six): full 3.581, background loop 1.144, multiplex 0.562, so ~1.9 ms is
sprite evaluation and the per-scanline `fill()`s. **Not pursued** — see
"What I could not do".

### 3. The gate's cost check, and why it is a RATIO

The first version gated on wall-clock milliseconds and I measured it flapping.
Same code, same input, best of five passes, three consecutive runs while other
agents' emulators came and went:

```
video  median 2.538 / 3.240 / 3.275 ms      p99 5.515 / 6.957 / 6.783 ms
audio  median 0.801 / 1.092 / 1.073 ms      p99 1.882 / 2.494 / 2.311 ms
logic  median 0.053 / 0.080 / 0.064 ms      p99 0.176 / 0.289 / 0.183 ms
```

and with four deliberate CPU hogs running:

```
                    quiet(ish)     4 busy cores    inflation
  ref (kernel)       0.497 ms        1.054 ms        2.12x
  video              3.402 ms        7.599 ms        2.23x
  video / ref         6.55-6.85       7.19-7.34       1.08x
```

That is wave 13's 2x host spread, reproduced a third time. **An absolute
millisecond limit tight enough to catch a regression is looser than the host's
own swing.** So `framecost.mjs` times a fixed reference kernel (61,440 table
reads + 61,440 word stores — one screen's worth) **in the same loop iteration**
as the stages it normalises, and gates on the ratio. Limits, in reference frames:

```
logic <= 1.0    measured 0.12-0.14    ~7x margin
audio <= 8.0    measured 2.13-4.02    ~2x
video <= 9.5    measured 6.45-7.34    ~1.3x
sum   <= 15.0   measured 8.70-11.3    ~1.3x
```

**Calibrated against the BROKEN code, not the fixed code**, which is the
difference between a gate and a decoration:

```
                 wave-14 fix     before the fix      limit
  video / ref    6.45 - 7.34    12.55 - 13.27         9.5
  sum   / ref    8.70 - 11.3    16.35 - 17.24        15.0
```

Seen red and seen green in both load regimes:

```
BREAK (pre-fix renderer), quiet:   video 13.66 / 9.5 ref -> RED, exit 1
BREAK (pre-fix renderer), 4 hogs:  video 14.37 / 9.5 ref -> RED, exit 1
FIXED, 4 hogs (2.1x loaded):       video  7.26 / 9.5 ref -> GREEN, headroom 1.3x
```

The absolute milliseconds and the % of budget are still printed, and a run whose
three stages exceed 16.639 ms prints a WARN naming how loaded the host is. **The
margins are the weakness and the file says so**: 1.3x will not notice a 20%
regression; it will notice a stage that starts costing a multiple of what it
did, which is the failure that had already happened.

### 4. The input fix — SUPERSEDED BY WAVE 15, see the correction at the top

`src/input.js` now queues every CHANGE to the mask as it happens, inside the DOM
handler, and `nextInputWord()` hands out one word per logic frame.
`src/main.js`'s `stepLogicFrames()` calls it once per `nmi()`.

**The queue is two deep, and the number is a trade with two named cases:**

* a TAP shorter than an animation frame is `[mask, 0]` — two entries. It must
  survive, so the cap cannot be 1.
* a FINGER SLIDING ACROSS THE D-PAD emits a `pointermove` per direction, many
  per animation frame. Whatever the queue cannot drain is steering LAG: at the
  cap the ship turns `cap` logic frames late. At 2 that is 33 ms; at 8 it would
  be 133 ms and unflyable. So the cap cannot be large.

Two is the smallest that keeps the tap and the largest that keeps the slide
honest. At the cap the NEWEST state overwrites the tail, never the head, so the
transient is still delivered and the current truth is always last. What that
loses — a press-release-press inside one 16 ms animation frame — is written down
in the file rather than discovered later. Both halves are tests, and both were
seen red (B2 cap=1, B3 cap=8).

### 5. Deliberate breaks — SIXTEEN, and one of them PASSED

Each break applied to `src/`/`index.html`, the relevant test files re-run, the
file restored, and the restore verified by sha256. Baseline: 0 failures on all
four files. The driver was a throwaway script in the session scratchpad (read
the four files, apply one exact substring substitution, run `node --test` on the
named test files, write the original back, assert the sha256 matches) -- not
committed, but every substitution is the "break" column below and each is a
one-line edit anyone can repeat by hand.

| break | result |
|---|---|
| B1 `stepLogicFrames` reads the live mask again (the wave-13 defect, restored) | RED, 2 |
| B2 the input queue caps at 1 (a tap cannot fit) | RED, 5 |
| B3 the input queue caps at 8 (steering lag unbounded) | RED, 1 |
| B4 keyup no longer queues its transition | **SURVIVED — see below** |
| B5 the touch d-pad no longer queues its transition | RED, 3 |
| B6 the queue drains newest-first (`pop`, not `shift`) | RED, 4 |
| B7 the clear backstop bypasses the queue | RED, 1 |
| B8 the pacer subtracts in a loop again | RED, 1 |
| B9 the pacer accepts a negative delta | RED, 1 |
| B10 the pacer has no clamp | RED, 1 |
| B11 the audio batch moves out of the per-logic-frame loop | RED, 1 |
| B12 `tilePixel` does not mask the column | RED, 2 |
| B13 `tileBase` strides 4 bytes a row | RED, 2 |
| B14 the background reads the tile row above | RED, 3 |
| B15 the page stops reporting k | RED, 1 |
| B16 the page stops reporting the input queue depth | RED, 1 |
| B17 the pre-fix renderer, against `framecost.mjs` | RED (13.66 ref), exit 1 |
| B18 the same, under 4 CPU hogs | RED (14.37 ref), exit 1 |

**B4, THE ONE THAT SURVIVED, AND WHY.** Deleting `noteInput()` from
`src/input.js`'s **keyup** handler left `loop.test.js`, `input.test.js` and
`page-wiring.test.js` **all green**. On a desktop keyboard that means releasing
a key stops being a queued transition, and the release is delivered only when
some other event happens to push one — i.e. exactly the dropped-input defect
this wave exists to fix, on the path most players use.

The reason is structural and worth naming: `src/input.js` deliberately keeps
**two masks** (`held` for the keyboard, `touchHeld` for the pad, with separate
recovery paths — see the file's own note), so there are **two ways to lose an
edge**, and every queue test I had written went through `setTouchButton()`.
Closed by `THE SAME DEFECT ON THE KEYBOARD PATH -- a keyup queues its
transition too`, which drives `attachInput()` with a fake target and covers
keydown, keyup and the blur backstop. B4 re-run afterwards: **RED, 1**.

That is the fifth wave in a row where a deliberate break passed. The pattern
this time was "the test covered one of two symmetric paths".

### 6. Regression: the corpus, the pixels and the audio are untouched

```
node --test games/gradius/tests/     368 pass, 0 fail, 0 skipped   (was 349)
node games/gradius/tools/audiohash.mjs --frames 600
  sha256 c75b7ab4d853a454450b23782de94a2489307a80f4bee67db46d295fecc2022c
  -- byte-identical to wave 13's recorded hash
```

### 7. THE GATE, in full, after everything

```
node games/gradius/tools/test-all.mjs

---- one frame fits in the budget (framecost.mjs) ----     <- NEW, stage 1d
BEST PASS                min   median      p99      max  of budget   cost / limit
  logic  nmi()        0.009  0.047  0.173  0.234    0.28%   0.11 / 1.0 ref  (headroom 9.1x)
  audio  apu+drain    0.604  0.913  1.982  2.209    5.49%   2.14 / 8.0 ref  (headroom 3.7x)
  video  renderFrame  1.248  2.756  5.128  6.146   16.56%   6.45 / 9.5 ref  (headroom 1.5x)
  ref    kernel       0.296  0.427  0.885 12.152          1 reference frame;
                                            0.497 ms at rest -> host 0.86x loaded
  ---- medians sum 3.716 ms = 22.3% of the 16.639 ms budget, = 8.70 / 15.0 ref
  [PASS] one frame fits in the budget (framecost.mjs)

  42 scenarios, 14098 of 14098 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED (pad2 oamBudget spriteOverflow
  scanline cpuCycle splitSpins)

  neuter lead1 249 / seed-x+1 167 / laginject=450 983 / seed-nt+1 1
       / seed-pal+1 6 / seed-coll0 105 / bullet-nosub 71   -- all RED

  PASS  inputs
  PASS  unit tests (node --test games/gradius/tests/)
  PASS  assets == the cartridge (verify_assets.py --self-test)
  PASS  sound data == the measured ownership window (snddata.py --selfcheck)
  PASS  one frame fits in the budget (framecost.mjs)
  PASS  port trace shape == probe.lua state vector
  PASS  the renderer rebuilds the cartridge pixel-exactly (rendergate.py)
  PASS  port vs cartridge (compare.mjs)
  PASS  self-check: the comparison goes red when the port is broken

  GREEN -- 9 passed, 0 failed, 0 SKIPPED
```

The six SKIPPED **fields** are pre-existing and each carries its reason (no port
counterpart); the six SKIPPED **stages** count is 0.

`scen.py` was NOT re-run and does not need to be, and here is the freshness
check rather than the assertion: its output depends on the cartridge,
`scenarios.json` and the two Lua scripts, I changed none of them, and the
recordings (`out/scen/*.json`, 2026-08-01 12:56-12:57) are newer than all three
(`objloop.lua` 01:56, `probe.lua` 06:33, `scenarios.json` 12:42). `compare.mjs`
consumed that recording and was green.

## What I could not do, and why

* **I COULD NOT MEASURE k.** It is a property of a browser's animation-frame
  scheduling and there is no browser in this repo and no headless one available
  (`tools/node_modules` has `jsnes` and nothing else). Everything I can say about
  k is arithmetic, not measurement: `FramePacer` is now exercised with a fake
  clock in `tests/loop.test.js`, including the case a real 60.000 Hz display
  produces (**k=2 about six times a minute, k=0 never** — the display is SLOWER
  than the game's 60.0988 Hz, so it accumulates a surplus, not a deficit; k>1 is
  therefore NOT by itself evidence of a problem and the page's readout must not
  be read that way).
  **What the owner should do**, and it takes ten seconds: open the page, play,
  and read `k` off the stats line. `1.00avg/1max` with no `clamped` means the
  loop is keeping up. An `avg` above ~1.01, a `max` above 2, or any `clamped`
  means catch-up is engaging, and `inq` sitting above 0 means the input queue is
  not draining. Please report those four numbers with what else was running.
* **I have no browser, so I cannot confirm the port is now responsive**, only
  that the mechanism that made it unresponsive is gone and that the port's own
  code costs a fifth of a frame instead of two thirds.
* **`putImageData`, the canvas and the compositor are not measured.** They cannot
  be from node. `framecost.mjs` says so on every run: its numbers are a LOWER
  BOUND on what a browser pays.
* **I did not chase the renderer's remaining ~1.9 ms.** Measured to be sprite
  evaluation plus the three per-scanline `fill()`s. Restructuring the scanline
  loop into tile columns (the next real win, another ~1 ms off the background)
  touches scroll wrap at `fx & 0xFF` and the attribute boundary, i.e. it is a
  change that can go pixel-wrong, and this wave's mandate was measurement and
  input. The cost gate now exists, so the next attempt has a number to beat and
  a guard: `tools/framecost.mjs` plus `tests/ppu.test.js` plus `rendergate.py`.
* **The audio stage's ratio is the least stable of the three** (2.13 quiet vs
  4.02 under four hogs, where the reference only inflated 2.12x). I did not
  chase why; the limit is set at 8.0 to accommodate it and that is stated. A
  reviewer who wants a tighter audio limit needs to find out what makes it
  scale super-linearly with load — allocation and GC are the obvious suspects.
* **The two-deep input queue is a judgement, not a measurement.** The two cases
  that bound it are named and tested, but the right number for a real phone
  under a real finger is something only a phone can say.

## If someone picks this up cold

```
node games/gradius/tools/framecost.mjs           # the cost table + the gate
node games/gradius/tools/framecost.mjs --csv     # per-frame series (is frame 0 dear?)
node --test games/gradius/tests/loop.test.js     # the pacer + the input queue
node --test games/gradius/tests/ppu.test.js      # the renderer fix's guard
node games/gradius/tools/test-all.mjs            # the gate, ~5 min
```

**The three things a reviewer should look at hardest:**

1. **The reference-kernel gate.** It is the load-bearing new idea and it is not
   free of assumptions: it assumes `reference()` degrades under contention the
   way `renderFrame()` does. I measured that it does (1.08x ratio drift across a
   2.12x load) and that the audio stage it does NOT (1.9x ratio drift). If the
   kernel and the renderer ever stop degrading alike — a different machine, a
   different node — the gate becomes wrong in a way that no test will say. The
   raw milliseconds are printed on every run precisely so a human can notice.
2. **The two-deep input queue, and specifically the overwrite-the-tail rule.**
   It throws away a press-release-press inside one animation frame. I argued
   that is physically implausible and preferred it to steering lag; that is a
   judgement about players, not a measurement, and it is the decision most
   likely to be wrong.
   **IT WAS WRONG, and the sentence above understates what it threw away.** The
   rule discarded any press+release inside one animation frame while ANY other
   control was producing a transition — i.e. the whole time a finger is on the
   d-pad. The reviewer measured 0 of 20 shots; wave 15 fixed the rule and
   measured 20 of 20. The instinct to name this as the thing most likely to be
   wrong was right; the analysis of WHY was not, and only the measurement found
   the difference.
3. **B4's shape, not just B4.** A deliberate break passed because the tests
   covered one of two symmetric paths. `src/input.js` has two masks by design;
   anything else in this port with two symmetric paths and one test is in the
   same position. `src/audio/output.js`'s `frame()`-while-locked path and the
   pad's `lostpointercapture` vs `pointerup` pair are the two I would look at
   next.
