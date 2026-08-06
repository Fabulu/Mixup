# Wave 15 - the input queue lost the press it existed to keep
status: DONE
wave: 15   role: impl   started: 2026-08-01 (date given in-session)

## The task, as I understood it

Wave 14's review (`14-review.md` §5, §6) found two BLOCKING defects in the
wave-14 input queue. They are the same defect twice - **a queue that is never
empty destroys taps** - approached from opposite ends.

1. **A sub-frame tap is destroyed whenever the queue is at its cap.** The rule at
   the cap was "the newest state overwrites the tail", so a press AND its release
   both arriving while full wrote the tail twice (`A`, then `0`) and the press
   never occupied a slot. A finger sliding on the touch d-pad holds the queue at
   the cap permanently - `src/input.js`'s own comment says several pointermoves
   per animation frame is the ordinary case - so on a phone this is "I press
   fire and nothing happens".
2. **Deleting `noteInput()`'s idempotence guard passed all 368 tests.** Every
   queue test handed the setters a DIFFERENT mask each time, so the guard whose
   own docstring calls it load-bearing was never executed.

Plus: the wave-14 commit message, `games/gradius/README.md`, `src/input.js`'s
comments, `14-impl-input-granularity.md` and
`13-FINDING-input-granularity-under-load.md` (moved to SETTLED) all said the
dropped-tap defect was FIXED. It was true only for an isolated tap from a
drained queue.

## What I MEASURED

### 1. THE REPRODUCTION, FIRST, EXACTLY - before a line of `src/` was changed

`node scratchpad/repro.mjs` (a throwaway that imports the real
`src/input.js` and the real `readJoypad()`; not committed, and every rig in it is
now a test in `tests/loop.test.js`). k = 1 - one logic frame per animation-frame
callback - and **no host load at all**. The reviewer's numbers reproduce:

```
--- A. minimal repro, k=1, taps only ---
callback 0:  press A, release A   ->  word 128   depth 1  coalesced 0
callback 1:  press A, release A   ->  word 0     depth 1  coalesced 1
callback 2:  press A, release A   ->  word 0     depth 1  coalesced 2

A2. 60 sub-frame taps, k=1        taps 60   A-edges 1   depth 1  coalesced 59
A3. drained in between            words [128, 0, 128]

--- B. sliding finger + fire, 120 callbacks (2 s), 2 pointermoves each ---
slide + SUB-FRAME fire taps       taps 20   A-edges  0   depth 1  coalesced 159
slide + one-callback fire taps    taps 20   A-edges 20   depth 1  coalesced 159
B2 (20 callbacks, 1 move + 1 tap) taps 20   A-edges  0   depth 1  coalesced 39
```

**ZERO OF TWENTY SHOTS FIRED.** The first tap survives (it lands on a drained
queue) and leaves the queue one deep; from then on every sub-frame tap is
destroyed, and one event-free callback (A3) drains it so the next tap works -
which is exactly why this never showed up on a keyboard in a quiet test.

B2 is the variant whose `coalesced 39` matches the review's "coalesced 40" to
within the one transition its rig started with, i.e. I am reproducing the same
condition and not a lookalike.

### 2. Defect 2, measured before and after deleting the guard

```
                                                  guard present   guard DELETED
HELD KEY (60 auto-repeat keydowns)                depth 1  co 0   depth 2  co 59
SAME DIR (2 pointermoves/frame, same direction)   depth 0  co 0   depth 1  co 29
SAME BTN (60 identical setTouchButton presses)    depth 1  co 0   depth 2  co 58
```

A queue that never drains - and §1 is what a never-draining queue does to taps.
`node --test games/gradius/tests/` with the guard deleted, on wave-14's tree:
**368 pass, 0 fail.** Nothing in the repo executed it.

## THE DESIGN DECISION, and why it comes from the board

### What the queue is FOR

`readJoypad()` is `$81BF` at `$80A4`, and `$8206` is `pressed = now & ~prev`.
So:

> **A bit produces an edge if and only if it appears SET in some word a logic
> frame is actually handed.**

A press that never occupies a delivered word can never produce an edge, whatever
`src/nmi.js` does with it. That single sentence decides the whole design:

> **A BIT MAY NEVER LEAVE THE QUEUE WHILE IT IS STILL AN UNDELIVERED PRESS.**

Everything else in a queued word is a LEVEL. A level may be merged away - the
finger is still on the pad and will say what it means next frame, and the cost is
at most one logic frame of steering fidelity. A press is not a level: it happens
once and nothing repeats it.

**This is not only about the A button.** `$9775` (`src/flow.js codeMatch`, run on
every paused frame) compares `$0005` against a table of DIRECTION bits, so a
direction's rising edge is load-bearing cartridge state too. The rule is about
every bit, which rules out "protect A and START, coalesce the d-pad freely".

### The rule I chose

At the cap, the newest state is **merged into** the tail rather than overwriting
it, carrying the tail's still-undelivered presses:

```
tail := w | (tail & ~prev)
```

`prev` is the word before the tail in the delivery order (the head of the queue,
or the last word `nextInputWord()` handed out). `tail & ~prev` is exactly the set
of rising edges the queue owes and has not delivered. OR-ing them into `w` means
**a press survives its own release** - it is released one to two logic frames
later instead of never.

### Why NOT the other options

* **A deeper or growable queue** - the option that looks obvious and is wrong.
  The queue drains at ONE word per LOGIC frame while a sliding finger fills it at
  several per ANIMATION frame, so *any* depth the queue is allowed to reach is
  steering LAG the player feels: the ship keeps turning `depth` logic frames
  after the finger did. At 2 that is 33 ms; at 8, 133 ms and unflyable; growable
  is unbounded. Wave 14's cap argument was right - **the cap was never the
  defect, the merge rule was.** Mutation M4 below makes the queue growable and
  goes red on six checks including the memory bound, so this is not an opinion.
* **Coalescing only same-value or non-edge-bearing transitions** (i.e. push
  instead of merge when the merge would lose an edge). Correct on edges, but it
  makes the queue grow exactly when the player is most active, which is the
  steering-lag failure above with extra steps. I measured what it would cost on
  the reviewer's rig before discarding it: a finger crossing thirds fast enough
  produces a fresh rising edge per callback, so the queue reaches whatever hard
  bound it is given and sits there.
* **Protecting only the buttons the port currently reads edges from.** Fragile -
  it encodes today's `src/` rather than the cartridge, and `$9775` already needs
  direction edges.

### THE MEMORY BOUND, and what happens at it

**Two words. For ever.** `pending.push()` is reachable only under
`pending.length < MAX_PENDING`; the merge branch writes in place and never grows
the array. There is no growth path in the module at all. A page left running for
an hour holds the same two numbers it held at boot, whatever the event rate.
Executed, not argued: `THE MEMORY BOUND: 200,000 transitions with nothing
draining hold two words` drives 200,000 transitions (~28 minutes of a finger at
two pointermoves per animation frame with the frame loop stopped dead) and
asserts the depth never exceeds the cap.

**What is hit when the bound bites** is intermediate LEVELS - counted as
`coalesced`, and normal - plus one thing that is a real loss and is now counted
rather than left in a comment: **a bit pressed, released and pressed AGAIN before
the first press has reached a logic frame cannot produce two edges**, because the
first press is still set in the word ahead and `now & ~prev` cannot rise from a
bit that never fell. That is a second tap of the same button within one or two
frames, above 30 Hz on one finger - and it is the **frame quantum the cartridge
itself has**: `$81BF` runs once per NMI, so real hardware cannot express it
either.

That number is `lostEdges`, and **the books balance**:

```
presses in the event stream  ==  $0005 edges produced  +  lostEdges
```

asserted over 40,000 random single-bit transitions at a deliberately hostile
0/1/2 logic frames per event (`THE BOOKS BALANCE`, `tests/loop.test.js`). It is
the strongest claim this design can make and precisely the claim wave 14's rule
broke SILENTLY: under `pending[last] = w` a press evaporated with no counter
moving, so the page could show a healthy `inq 1` while every shot was destroyed.

## The measurement AFTER the fix - same rig, same script

```
--- A. minimal repro, k=1, taps only ---
callback 0:  press A, release A   ->  word 128   depth 1  coalesced 0
callback 1:  press A, release A   ->  word 0     depth 1  coalesced 1
callback 2:  press A, release A   ->  word 128   depth 1  coalesced 2

A2. 60 sub-frame taps, k=1        taps 60   A-edges 30  depth 1  coalesced 59
A3. drained in between            words [128, 0, 128]

--- B. sliding finger + fire ---
slide + SUB-FRAME fire taps       taps 20   A-edges 20   depth 1  coalesced 159
slide + one-callback fire taps    taps 20   A-edges 20   depth 1  coalesced 159
B2 (20 callbacks, 1 move + 1 tap) taps 20   A-edges 10   depth 1  coalesced 39
```

| rig | wave 14 | wave 15 |
|---|---|---|
| sliding d-pad + FIRE 10x/s, sub-frame taps | taps 20, **edges 0** | taps 20, **edges 20** |
| sliding d-pad + FIRE 10x/s, taps across two frames | taps 20, edges 20 | taps 20, edges 20 |
| 60 sub-frame taps, nothing else | taps 60, **edges 1** | taps 60, **edges 30** |
| a tap EVERY frame while sliding (B2) | taps 20, **edges 0** | taps 20, **edges 10** |

**30 is not a shortfall and neither is B2's 10.** Two rising edges need a word
with the bit CLEAR between them, so sixty logic frames can carry at most thirty A
edges and twenty can carry at most ten. Asserting 60 and 20 would be asserting
something the NES cannot do. The books balance on the 60-tap rig exactly:
60 presses = 30 edges + 29 `lostEdges` + 1 still in the queue, and the test drains
that last one and checks it produces its edge.

## What I changed

| file | what |
|---|---|
| `games/gradius/src/input.js` | the merge rule (`tail := w \| (tail & ~prev)`), `delivered`, the `carried` and `lostEdges` counters, and the comment block that claimed more than was built |
| `games/gradius/index.html` | the stats line printed `coalesced` as **`lost`**, which is wrong twice over: a merge loses nothing now, and the number that DOES mean a destroyed input had nowhere to appear. Now `inq <depth>/<n>merged/<n>carried/<n>LOST` |
| `games/gradius/tests/loop.test.js` | PART 2a (defect 1, six checks) and PART 2b (defect 2, four checks); `k logic frames ... in order` updated to the new rule |
| `games/gradius/tests/page-wiring.test.js` | the stub and the stats-line assertion follow the three counters |
| `games/gradius/README.md` | says what wave 14 actually delivered and what wave 15 measured |
| `docs/worklog/gradius/14-impl-input-granularity.md` | §4 marked SUPERSEDED, with the correction and the two wrong capture counts the review found |
| `docs/worklog/gradius/13-FINDING-...md` | a dated LEDGER instead of a status that has meant three different things |

## Deliberate breaks - TWELVE, every one RED, every one restored byte-identical

Driver: a throwaway in the session scratchpad - read the file, apply one exact
substring substitution (asserting the anchor occurs exactly once), run
`node --test` on the named test files, write the original back, compare sha256.
Not committed; every substitution below is a one-line edit anyone can repeat.

| # | break | files run | result |
|---|---|---|---|
| **M1** | `noteInput()` loses `if (w === live) return;` - **the review's R5, which passed the whole 368-test suite** | loop, page-wiring, input | **RED, 4** - all four IDEMPOTENCE checks |
| **M2** | wave 14's rule restored: the newest state overwrites the tail | loop, page-wiring, input | **RED, 4** |
| **M3** | `prev` read as the tail itself, so nothing is ever undelivered | loop | **RED, 4** |
| **M4** | the queue is growable again (the "just make it deeper" fix) | loop | **RED, 6** incl. the memory bound |
| **M5** | `lostEdges` not counted on the merge path | loop | **RED, 1** (the books) |
| **M6** | `lostEdges` not counted on the push path | loop | **RED, 2** |
| **M7** | `rising` computed after `live = w`, so it is always 0 | loop | **RED, 2** |
| **M8** | `nextInputWord()` stops remembering what it delivered | loop | **RED, 1** |
| **M9** | the page calls `coalesced` "lost" again | page-wiring | **RED, 1** |
| **M10** | the page stops printing the LOST counter | page-wiring | **RED, 1** |
| **M11** | `MAX_PENDING` 2 → 1 | loop | **RED, 3** |
| **M12** | `MAX_PENDING` 2 → 8 | loop | **RED, 4** |

M1 in full, since it is the break that made this wave necessary:

```
M1  noteInput loses `if (w === live) return;` (the review's R5)
  src/input.js: fail 4   restored byte-identical
    RED  IDEMPOTENCE: 200 identical setTouchButton calls queue nothing at all
    RED  IDEMPOTENCE: a finger resting in one third emits pointermoves and queues nothing
    RED  IDEMPOTENCE: 200 auto-repeat keydowns of a held key queue nothing
    RED  IDEMPOTENCE: the backstop fired repeatedly queues exactly one zero
```

and M2, the defect itself:

```
M2  wave 14's rule restored: the newest state overwrites the tail
  src/input.js: fail 4   restored byte-identical
    RED  k logic frames in one callback consume k DIFFERENT words, in order
    RED  THE WAVE-14 DEFECT: a sub-frame tap survives a d-pad that never stops moving
    RED  sub-frame taps every single frame produce the ARITHMETIC MAXIMUM of edges
    RED  THE BOOKS BALANCE: every press is an edge or is counted, over 40,000 events
```

**Both new test groups were seen to fail before they were believed.** The
IDEMPOTENCE group exists only because M1 was green for a whole wave, and PART 2a
exists only because M2's behaviour shipped.

## THE GATE

```
node --test games/gradius/tests/
  # tests 378  # pass 378  # fail 0  # skipped 0      (was 368 -- +10)
```

The ten are six in PART 2a (defect 1) and four in PART 2b (defect 2). No check
was deleted; one (`k logic frames in one callback consume k DIFFERENT words`)
was rewritten to the new rule, and it asserts MORE than it did: the middle
transition it used to throw away now reaches a logic frame.

```
node games/gradius/tools/test-all.mjs

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

**The 42 scenarios did not regress, and I looked at the display list rather than
at the summary line:**

```
  42 scenarios, 14098 of 14098 frames compared (0 truncated: none), 0 failures,
  0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
  0 display-list coverage failures, 0 video-coverage failures,
  0 deep-reach failures, 6 fields SKIPPED (pre-existing, each with a reason)

  VIDEO COVERAGE: 42/42 scenarios compared their screen
    [PASS] TERRAIN MAP: 0 of 512 bytes differ
    [PASS] 0 nametable (30 strictly graded scenarios), 0 palette,
           0 hardware-OAM bytes differ

  neuter lead1 249 / seed-x+1 167 / laginject=450 983 / seed-nt+1 1
       / seed-pal+1 6 / seed-coll0 105 / bullet-nosub 71  -- all RED
```

**0 hardware-OAM bytes and 0 display-list coverage failures**, i.e. no sprite
moved. That is the number this change could plausibly have disturbed and it did
not - expected, because the oracle drives `nmi()` with scripted button words and
never goes through `src/input.js`'s queue at all. Which is worth saying out loud:
**the corpus cannot see this defect and never could.** `tests/loop.test.js` is
the only thing in the repo that can, which is why the two new PARTs are where
they are.

The only `[STILL BROKEN]` line is the pre-existing `$8871` `fullScreenLoad`
knownFail, unchanged at 9 of 12 windows / 1165 bytes.

`framecost.mjs` on this run: logic 0.13 / 1.0 ref, audio 2.22 / 8.0, video
6.53 / 9.5, sum 8.88 / 15.0 - within 2% of wave 14's and its reviewer's numbers,
so nothing in the merge rule costs a measurable amount. It would not: it is two
ANDs and an OR on the path that was already there, taken only at the cap.

`scen.py` was NOT re-run and does not need to be. Its output depends on the
cartridge, `scenarios.json` and the two Lua scripts; I changed none of them, and
this wave touched no file `compare.mjs` reads. `compare.mjs` consumed the
existing recording and was green.

## What I could not do, and why

* **I still have no browser, so this is measured in node.** The rig drives the
  real `src/input.js` and the real `readJoypad()` with the event pattern a
  sliding finger produces, at k=1; it does not prove a phone behaves that way,
  only that the mechanism which destroyed the taps is gone and the accounting
  now balances. **What the owner should do, and it takes ten seconds:** open the
  page, play with a finger on the d-pad, and read `inq` off the stats line. It
  now reads `inq <depth>/<n>merged/<n>carried/<n>LOST`. `merged` in the hundreds
  is NORMAL and means the d-pad is busy; `carried` counting up means taps are
  being rescued, i.e. the wave-14 defect would have been eating them; **`LOST`
  should stay at 0** and a non-zero LOST is the one number worth reporting.
* **`k` is still unmeasured** (wave 14's open item, unchanged). Nothing here
  needed it: the reproduction is at k=1, so the defect never depended on host
  load at all - which is itself the finding, since `13-FINDING` framed the whole
  thing as a load problem.
* **A second edge of the same bit within one or two frames is still not
  representable**, and it cannot be: `$81BF` runs once per NMI, so the cartridge
  has the same quantum. It is counted (`lostEdges`) rather than described.
* **I did not touch the review's third item** - a self-check stage for
  `framecost.mjs` and tightening `LIMITS.logic` from 1.0 to ~0.3
  (`14-review.md` §8, §3). Out of this wave's mandate, still open, and it is the
  next thing a reviewer should ask for. Nor did I fix `tests/ppu.test.js`'s
  `tileBase` blind spot (`14-review.md` §7); the wrong capture counts in wave
  14's report ARE corrected, in that report.
* **Wave 11's, 12's and 13's `NN-review.md` are sitting untracked in the
  worktree** and I did not commit them - they are other agents' files. I DID
  stage `14-review.md`, because this commit exists because of it and a commit
  that cites a path the repo does not contain is the stale-doc failure with the
  arrow pointing the other way. The other three are still untracked; someone
  should adopt them.

## A note on the tree, for whoever is next

**HEAD moved under me while I worked** - from `25b8ce6` (Gradius wave 14) to
`e2043f7` (DDPDOJ W12), because another workflow committed mid-session - and the
SHARED `.git/index` was, throughout, mid-flight for that workflow with dozens of
staged deletions. `git status` and `git diff HEAD` were therefore both lying
about `games/gradius`: they reported `src/audio/apu.js`, `tests/loop.test.js`
and `tools/framecost.mjs` as DELETED when all three are present and passing,
because a file dropped from the index reads as untracked.

The way to get a true answer without touching anything:

```
GIT_INDEX_FILE=.git/scratch.index git read-tree HEAD
GIT_INDEX_FILE=.git/scratch.index git diff --name-only -- games/gradius
rm -f .git/scratch.index
```

which reported exactly the five files this wave edited. The commit went through
a private index (`.git/gradfix.index`) with `git read-tree HEAD` run IMMEDIATELY
before staging, for exactly this reason.

## If someone picks this up cold

```
node --test games/gradius/tests/loop.test.js   # PART 2a defect 1, PART 2b defect 2
node games/gradius/tools/test-all.mjs          # the gate, ~7 min
```

**The three things a reviewer should look at hardest:**

1. **The merge rule's `prev`.** `tail := w | (tail & ~prev)` is only correct if
   `prev` really is the word that will precede the tail in the delivery order.
   At `MAX_PENDING = 2` that is always `pending[0]`; the `delivered` fallback is
   reachable only if the cap ever becomes 1. Mutation M3 (read `prev` as the tail
   itself) and M8 (stop tracking `delivered`) both go red, so it is guarded - but
   it is the line where a wrong answer is quiet.
2. **`lostEdges`' definition, which is subtler than the other counters.** It is
   "presses whose bit is already set in the word ahead of them", counted on both
   the push and merge paths, and the accounting identity in `THE BOOKS BALANCE`
   is the only thing that pins it. If that identity is ever relaxed, the counter
   becomes decoration and the next defect of this shape will be silent again.
3. **The corpus cannot see any of this.** 42 scenarios and 14,098 frames are
   green with the wave-14 defect in place, because the oracle never uses the
   queue. Anything else in this port that sits between the DOM and `nmi()` is in
   the same position, and `tests/page-wiring.test.js` plus `tests/loop.test.js`
   are the whole of its coverage.
