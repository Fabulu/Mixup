# FINDING (hypothesis) — why a slow host makes the port feel UNRESPONSIVE, not just slow

status: SETTLED by wave 14 — the mechanism was REAL and is fixed; the CAUSE was
        not the one this page suspected. See
        `docs/worklog/gradius/14-impl-input-granularity.md`.
role: bug report from play   raised: 2026-08-01   settled: 2026-08-01

## WHAT WAVE 14 MEASURED (read this before the hypothesis below)

1. **The input mechanism was real, and worse than described.** The page below
   says k frames share one input word. They did — but the sharper defect is
   that a press and its release that BOTH land between two animation frames were
   never seen at all: the live mask went 0 -> A -> 0 with nothing looking.
   Fixed: `src/input.js` queues every transition as it arrives and
   `nextInputWord()` hands out one word per LOGIC frame
   (`src/main.js stepLogicFrames`). `tests/loop.test.js` executes both claims.
2. **`nmi()` was NOT the cost.** Measured over 600 frames, best of five passes,
   `tools/framecost.mjs`: **median 0.039 ms, p99 0.138 ms** against a 16.639 ms
   budget — 0.24% of a frame. Candidate 2 on this page ("waves 6-11 added
   firing, the kill chain, power-ups, sound and enemy bullets ... it is entirely
   possible the port now needs more than 16.6 ms") is **FALSE**, and measured
   false rather than argued away.
3. **`renderFrame()` WAS the cost, and nobody had ever looked.** Median
   **6.074 ms, 36% of the whole frame budget**, more than `nmi()` and the wave-13
   synthesiser put together. Its background loop called `tileRow()` once per
   PIXEL — filling an 8-byte scratch array to read one byte of it, 61,440 times
   a frame — and threw seven eighths of every read away. One line, bit-identical
   by construction, took it to **2.481 ms**. The pixel gate (`tests/ppu.test.js`,
   61,440 px x 10 captured frames) is 0 px different before and after.
4. **k itself is still unmeasured** and cannot be measured from node. The port
   now counts it (`FramePacer`) and index.html prints it as
   `k <avg>avg/<max>max/<n>clamped` next to the lag counter, so the owner can
   read it off a real browser. That is the one part of this page wave 14 could
   not close; see its worklog's "What I could not do".
5. `tools/framecost.mjs` is now a stage of `tools/test-all.mjs`, with limits
   calibrated so that the 6.074 ms renderer would have FAILED it.

The hypothesis as it was written on the day, unedited, follows.

---

## The report

Owner, playing the live Gradius build: **"when it starts is really unresponsive
... might be my browser being slowed down by all the agents running around, but
might be worth a look into."**

Host contention is very plausible — five MAME recons, an architect and a wave
implementer were running emulators on the same machine. **But "unresponsive" is
a different symptom from "slow", and the difference points at something real.**

## The mechanism, read out of src/main.js (NOT measured)

```js
acc = Math.min(acc + (now - last), period * 8);
...
while (acc >= period) { acc -= period; nmi(state, currentButtons(), res); }
```

`currentButtons()` is called INSIDE the catch-up loop, but the browser only
updates the key/touch masks between animation frames. So when the host falls
behind and the loop runs k logic frames in one callback, **all k frames consume
the SAME input word.**

At k=1 the port samples input 60 times a second. At k=8 — the clamp — it samples
it **7.5 times a second** while still advancing the game at full speed. That is
not the game running slowly; that is the game running at full speed while
listening 8x less often. A tap shorter than 8 logic frames can be seen once,
stretched to 8 frames, or missed entirely depending on where it lands.

**That matches the word the owner used.** A uniformly slow game feels sluggish;
this feels unresponsive, because the ship keeps moving normally and the controls
stop landing.

## Why "when it starts" specifically

Unverified, but two candidates worth measuring before assuming host load:

1. The stage intro plays the cartridge's own 27 frames with the screen blanked
   (`$9B3E`, `$9BF0`, `$9C12`, `$9C1E`, `$9C24`'s 84 blocks) and the terrain
   streamer is filling a screen it has not filled before. If the first second
   is the most expensive second, that is exactly when catch-up engages.
2. Waves 6-11 added firing, the kill chain, power-ups, sound and enemy bullets.
   **Nobody has ever measured how long one logic frame takes in the browser.**
   The gate measures CORRECTNESS, never COST. It is entirely possible the port
   now needs more than 16.6 ms per frame on a loaded machine, and no check in
   this repo would notice.

## How to settle it — cheap, and in this order

1. **Measure the cost.** Time `nmi()` over a few thousand frames headlessly and
   report min/median/p99 in ms against the 16.64 ms budget (59.7 Hz... note
   Gradius is 60.0988 Hz, so 16.6 ms). If p99 is anywhere near budget, this is
   real and not the host.
2. **Log k.** Instrument how many logic frames run per animation frame in the
   browser. If k > 1 happens at all on an idle machine, the loop is already
   behind.
3. Only then blame contention — and confirm by playing with no agents running.

## If it is real, the fix is NOT to make the loop faster first

Sample input ONCE PER LOGIC FRAME from a queue of input states, rather than
reading the live mask k times inside the catch-up. That decouples input
granularity from host jitter, and it is the same discipline
`games/ddpdoj/NOTES-replay.md` already requires for determinism: **input belongs
to a logic frame, not to a wall-clock moment.** A port that samples the live
mask inside a catch-up loop cannot produce a deterministic replay either, so
this is one fix serving two requirements — the same shape as the counted-not-
timed work budget.

Note the DaiOuJou page was written later and states the constraint correctly in
its header ("the host clock decides only HOW MANY logic frames have come due,
never what any of them computes"). Whether its input path actually honours that
under catch-up is ALSO unverified.

## Status

Not investigated. Recorded because "probably my machine" is exactly how a real
performance bug survives — and because the mechanism above would produce this
symptom whether or not the host was loaded.
