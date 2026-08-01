// THE FRAME LOOP'S TWO CLOCKS, and the seam between them.
//
// docs/worklog/gradius/13-FINDING-input-granularity-under-load.md made a claim
// from READING src/main.js and said so: "currentButtons() is called INSIDE the
// catch-up loop ... when the host falls behind and the loop runs k logic frames
// in one callback, all k frames consume the SAME input word."
//
// This file is the executable version of that claim and of its fix. It drives
// FramePacer with a FAKE CLOCK (so k is chosen, not hoped for) and the real
// src/input.js queue, and asserts the two properties the port needs:
//
//   1. the host clock decides only HOW MANY logic frames are due -- never what
//      any of them reads (games/ddpdoj/NOTES-replay.md constraint 1);
//   2. a press and its release that both land between two animation frames are
//      still delivered, to two different logic frames, in order.
//
// SEEN TO FAIL, every assertion in here, by the breaks listed in
// docs/worklog/gradius/14-impl-input-granularity.md -- including the one that
// matters most: putting `currentButtons()` back in place of `nextInputWord()`
// leaves 'a tap between two callbacks reaches a logic frame' red and the rest
// green, which is exactly how the defect survived thirteen waves.

import test from 'node:test';
import assert from 'node:assert/strict';

import { FramePacer, MAX_CATCHUP_FRAMES } from '../src/main.js';
import {
  nextInputWord, inputQueueStats, resetInput, currentButtons, attachInput,
  setTouchButton, setTouchDirections, clearTouchButtons, TOUCH_BUTTONS, DPAD_MASK,
} from '../src/input.js';
import { readJoypad } from '../src/input.js';
import { createState, BTN } from '../src/state.js';

/** 60.098814 Hz. Spelled here as the reciprocal so the test is not circular. */
const PERIOD = 1000 / 60.098814;

// ===========================================================================
// PART 1 -- the pacer. k is a number now, not a closure variable.
// ===========================================================================

test('at the nominal frame rate the loop runs one logic frame per callback', () => {
  // NOT "k is always 1", and the difference is measured rather than tidied away.
  // A delta of exactly `period` cannot be represented, so `acc` lands a few
  // ULPs either side of the threshold and the sequence reads 1,1,0,2,1,... The
  // property that matters is CONSERVATION -- 600 callbacks at the nominal rate
  // owe 600 logic frames -- plus a bound on the burst. Asserting k === 1 would
  // be asserting something about IEEE-754, not about the loop, and it would
  // have to be relaxed the first time a browser handed over 16.7 instead of
  // 16.639 (which is every browser).
  const p = new FramePacer(PERIOD);
  const t0 = 1000;
  assert.equal(p.due(t0), 0, 'the first callback has no delta and must run nothing');
  for (let i = 1; i <= 600; i++) p.due(t0 + i * PERIOD);
  assert.ok(p.logicFrames >= 599 && p.logicFrames <= 600,
    `600 nominal callbacks owe 600 logic frames, got ${p.logicFrames} -- the `
    + 'accumulator is losing or gaining time');
  assert.ok(p.maxK <= 2, `maxK ${p.maxK} at the nominal rate`);
  assert.equal(p.clamped, 0);
});

test('a 60.000 Hz display is SLOWER than the game and catches up ~6 times a minute', () => {
  // The game is 60.098814 Hz; a display is 60.000. The display's callback is
  // 16.6667 ms and a game frame is 16.6393, so the host hands over a SURPLUS of
  // 27.4 us per callback -- 0.0988 logic frames a second. Over 60 s that is
  // about 6 callbacks that run k=2. This is the port's ordinary steady state on
  // real hardware and it is worth pinning: k>1 is NOT by itself evidence that
  // anything is wrong, which is the trap the k readout on the page could
  // otherwise walk somebody into.
  const p = new FramePacer(PERIOD);
  const t0 = 0;
  p.due(t0);
  let zeros = 0, twos = 0, more = 0;
  const N = 3606;                     // 60.1 seconds at 60.000 Hz
  for (let i = 1; i <= N; i++) {
    const k = p.due(t0 + (i * 1000) / 60);
    if (k === 0) zeros++; else if (k === 2) twos++; else if (k > 2) more++;
  }
  assert.equal(more, 0, 'a host this close to the rate must never burst past 2');
  assert.equal(zeros, 0, 'and must never skip: it is slower than the game, not faster');
  assert.ok(twos >= 5 && twos <= 7,
    `expected ~6 catch-up callbacks in 60 s of 60.000 Hz against 60.0988 Hz, got ${twos}`);
});

test('a host at half rate runs k=2, and the accumulator does not drift', () => {
  const p = new FramePacer(PERIOD);
  const t0 = 0;
  p.due(t0);
  for (let i = 1; i <= 300; i++) p.due(t0 + i * PERIOD * 2);
  assert.ok(p.logicFrames >= 599 && p.logicFrames <= 600,
    `two logic frames per callback for 300 callbacks, got ${p.logicFrames}`);
  assert.ok(p.maxK <= 3, `maxK ${p.maxK}`);
  // hist[0] counts the priming callback (no delta yet) and nothing else.
  assert.equal(p.hist[0], 1, 'a host at half rate never runs zero logic frames');
});

test('the catch-up clamp is 8 and a backgrounded tab does not simulate minutes', () => {
  const p = new FramePacer(PERIOD);
  p.due(0);
  p.due(PERIOD);
  const k = p.due(PERIOD + 60_000);            // a minute in one delta
  assert.equal(k, MAX_CATCHUP_FRAMES, 'the clamp caps the burst at 8 logic frames');
  assert.equal(p.clamped, 1, 'and says it clamped');
  // And the accumulator is not left holding the rest: the next ordinary
  // callback must go straight back to k=1, or the clamp would only defer the
  // minute rather than discard it.
  // A step of 1.5 periods, not 1.0: at exactly one period the answer is 0 or 1
  // depending on where the subtraction of 60,000 ms landed in IEEE-754, which
  // is a fact about doubles and not about the clamp. 1.5 is unambiguously one
  // frame's worth and nothing more.
  assert.equal(p.due(PERIOD + 60_000 + PERIOD * 1.5), 1,
    'the clamped time is DISCARDED, not carried -- otherwise every callback '
    + 'after a stall keeps bursting');
});

test('a negative or zero delta runs nothing rather than unwinding the clock', () => {
  // rAF's timestamp is the START of the frame and can be earlier than the
  // performance.now() taken when the loop was armed. The old loop did
  // `acc += now - last` with no floor, so acc went negative and the first
  // callbacks silently ran nothing extra later.
  const p = new FramePacer(PERIOD);
  p.due(1000);
  assert.equal(p.due(900), 0, 'a backwards timestamp is not a frame');
  assert.equal(p.due(900 + PERIOD), 1, 'and it did not poison the accumulator');
});

test('the histogram is the census the FINDING asked for', () => {
  // Deltas well clear of the threshold, so this measures the census and not
  // IEEE-754: ten callbacks a shade over one period, then three of three.
  const p = new FramePacer(PERIOD);
  let t = 0;
  p.due(t);
  for (let i = 0; i < 10; i++) { t += PERIOD * 1.001; p.due(t); }
  for (let i = 0; i < 3; i++) { t += PERIOD * 3.001; p.due(t); }
  const s = p.stats();
  assert.equal(s.k[1], 10, `k=1 census ${s.k}`);
  assert.equal(s.k[3], 3, `k=3 census ${s.k}`);
  assert.equal(s.maxK, 3);
  assert.equal(s.logicFrames, 19);
  assert.equal(s.callbacks, 14, 'the first, no-delta callback counts as a callback');
  assert.equal(s.k.length, MAX_CATCHUP_FRAMES + 1, 'the histogram spans 0..clamp');
});

// ===========================================================================
// PART 2 -- the input queue. ONE WORD PER LOGIC FRAME.
// ===========================================================================

test('a held button is one word per logic frame with no queue traffic', () => {
  resetInput();
  setTouchButton(TOUCH_BUTTONS.A, true);
  assert.equal(nextInputWord(), BTN.A, 'the transition is delivered');
  for (let i = 0; i < 100; i++) assert.equal(nextInputWord(), BTN.A);
  assert.equal(inputQueueStats().depth, 0, 'holding a key queues nothing');
});

test('THE DEFECT: a tap between two callbacks reaches a logic frame', () => {
  // This is the whole finding. Both events land while the frame loop is not
  // running; the LIVE mask is 0 before and 0 after, so a loop that reads the
  // live mask sees nothing at all and the shot is never fired.
  resetInput();
  setTouchButton(TOUCH_BUTTONS.A, true);
  setTouchButton(TOUCH_BUTTONS.A, false);
  assert.equal(currentButtons(), 0,
    'the live mask is back to 0 -- this is what the old loop would have read');
  assert.equal(nextInputWord(), BTN.A, 'logic frame 1 gets the press');
  assert.equal(nextInputWord(), 0, 'logic frame 2 gets the release');
  assert.equal(nextInputWord(), 0, 'and it stays released');
});

test('THE SAME DEFECT ON THE KEYBOARD PATH -- a keyup queues its transition too', () => {
  // FOUND BY A DELIBERATE BREAK THAT PASSED. The first version of this file
  // tested the tap through setTouchButton() only, and deleting `noteInput()`
  // from src/input.js's KEYUP handler left every check in the repo GREEN --
  // i.e. on a desktop keyboard, releasing a key would have stopped being a
  // queued transition and the release would have been delivered only when some
  // OTHER event happened to push one. Two masks and two DOM handlers means two
  // ways to lose an edge, and the touch path was the only one covered.
  resetInput();
  const handlers = {};
  const target = {
    addEventListener(t, fn) { (handlers[t] ||= []).push(fn); },
    fire(t, ev) { for (const fn of handlers[t] || []) fn({ preventDefault() {}, ...ev }); },
  };
  attachInput(target);
  target.fire('keydown', { code: 'KeyX' });      // A
  target.fire('keyup', { code: 'KeyX' });
  assert.equal(currentButtons(), 0, 'the live mask is back to 0');
  assert.equal(nextInputWord(), BTN.A, 'the keydown is a queued transition');
  assert.equal(nextInputWord(), 0, 'and so is the KEYUP');
  assert.equal(nextInputWord(), 0);

  // The blur backstop is the third way the keyboard mask can change, and it
  // must go through the queue for the same reason clearTouchButtons() does.
  target.fire('keydown', { code: 'ArrowRight' });
  assert.equal(nextInputWord(), BTN.RIGHT);
  target.fire('blur', {});
  assert.equal(nextInputWord(), 0, 'blur clears through the queue');
});

test('the tap becomes exactly one $0005 edge through the cartridge edge rule', () => {
  // A press delivered on its own frame is worth nothing unless $81BF turns it
  // into an edge, so the chain is checked end to end rather than at the queue.
  resetInput();
  const s = createState();
  setTouchButton(TOUCH_BUTTONS.A, true);
  setTouchButton(TOUCH_BUTTONS.A, false);
  const edges = [];
  for (let f = 0; f < 5; f++) {
    readJoypad(s, nextInputWord());
    edges.push([s.input.pressed, s.input.held]);
  }
  assert.deepEqual(edges, [[BTN.A, BTN.A], [0, 0], [0, 0], [0, 0], [0, 0]],
    'exactly one rising edge, on the frame that owns the press');
});

test('k logic frames in one callback consume k DIFFERENT words, in order', () => {
  // The finding's headline claim, executed: at the k=8 clamp the old loop
  // sampled input once. Four transitions arrive while the host is stalled and
  // the queue caps at 2, so the two middle levels are merged -- but WAVE 15's
  // merge carries every undelivered press, so UP still reaches a logic frame
  // and still produces its $0005 edge. Under wave 14's "the newest state
  // overwrites the tail" this read [RIGHT, 0, ...] and UP was never seen.
  resetInput();
  setTouchDirections(BTN.RIGHT);
  setTouchDirections(BTN.RIGHT | BTN.UP);
  setTouchDirections(BTN.UP);
  setTouchDirections(0);
  const cap = inputQueueStats().cap;
  assert.equal(cap, 2, 'the queue cap is 2 -- if this changes, so does the trade below');
  assert.equal(inputQueueStats().coalesced, 2, 'two transitions hit the cap');
  assert.equal(inputQueueStats().carried, 1,
    'the release of UP had to carry UP forward -- one merge, not two');
  assert.equal(inputQueueStats().lostEdges, 0, 'and nothing was destroyed');
  const words = [];
  for (let i = 0; i < 8; i++) words.push(nextInputWord());
  assert.deepEqual(words, [BTN.RIGHT, BTN.UP, 0, 0, 0, 0, 0, 0],
    'the first transition, then the merge that still carries UP, then the truth');
  assert.notEqual(words[0], words[1],
    'k frames must NOT all read the same word -- that is the defect');
});

// ===========================================================================
// PART 2a -- WAVE 15, DEFECT 1: A TRANSITION IS NEVER LOST.
//
// 14-review.md section 6: "the input fix does not hold where it matters most".
// The wave-14 rule at the cap was `pending[last] = w`, so a press and its
// release both arriving while the queue was full wrote the tail twice and the
// press never occupied a slot. The touch d-pad holds the queue at the cap
// permanently, so on a phone EVERY sub-frame tap was destroyed: taps 20,
// A-edges 0. These are that measurement, executed.
// ===========================================================================

/** A finger sliding round the d-pad: every step is a real direction change. */
const SLIDE = [
  BTN.RIGHT, BTN.RIGHT | BTN.UP, BTN.UP, BTN.UP | BTN.LEFT,
  BTN.LEFT, BTN.LEFT | BTN.DOWN, BTN.DOWN, BTN.DOWN | BTN.RIGHT,
];

/**
 * The reviewer's rig. `callbacks` animation frames at k=1; a sliding finger
 * emits `movesPerFrame` pointermoves in each; FIRE is tapped every `every`
 * frames, and `subFrame` decides whether the press and its release both land
 * inside one animation frame (the case that was destroyed) or straddle two.
 */
function slideAndFire({ callbacks = 120, movesPerFrame = 2, every = 6, subFrame = true }) {
  resetInput();
  const s = createState();
  let taps = 0, edges = 0, d = 0;
  for (let cb = 0; cb < callbacks; cb++) {
    for (let m = 0; m < movesPerFrame; m++) setTouchDirections(SLIDE[d++ % SLIDE.length]);
    if (cb % every === 0) {
      taps++;
      setTouchButton(BTN.A, true);
      if (subFrame) setTouchButton(BTN.A, false);
    } else if (!subFrame && cb % every === 1) setTouchButton(BTN.A, false);
    readJoypad(s, nextInputWord());              // ONE logic frame per callback
    if (s.input.pressed & BTN.A) edges++;
  }
  return { taps, edges, ...inputQueueStats() };
}

test('THE WAVE-14 DEFECT: a sub-frame tap survives a d-pad that never stops moving', () => {
  // MEASURED before the fix: taps 20, A-edges 0, depth 1, coalesced 159.
  // Zero of twenty shots fired, with no host load at all and k=1.
  const r = slideAndFire({ subFrame: true });
  assert.equal(r.taps, 20, 'the rig drove twenty taps');
  assert.equal(r.edges, 20,
    `${r.edges} of ${r.taps} sub-frame taps produced a $0005 edge while the `
    + 'd-pad was sliding -- a press that never occupies a queue slot can never '
    + 'produce an edge, which is the whole defect');
  assert.equal(r.lostEdges, 0, 'and the queue does not think it lost any either');
  assert.ok(r.carried > 0,
    'the merges must actually have had to carry a press -- if this is 0 the rig '
    + 'is not reproducing the condition and the check above is a decoration');
});

test('the same taps with the d-pad still: 20 of 20, as they always were', () => {
  // The control. This case passed in wave 14 too; it is here so a regression
  // that breaks the ORDINARY path cannot hide behind the interesting one.
  const r = slideAndFire({ subFrame: true, movesPerFrame: 0 });
  assert.equal(r.edges, 20);
  assert.equal(r.coalesced, 0, 'a still d-pad never reaches the cap');
});

test('a press that straddles two animation frames is unaffected by the fix', () => {
  const r = slideAndFire({ subFrame: false });
  assert.equal(r.edges, 20, 'this was already 20 of 20 in wave 14 and must stay so');
});

test('sub-frame taps every single frame produce the ARITHMETIC MAXIMUM of edges', () => {
  // MEASURED before the fix: 60 taps, 1 A-edge (the first, from a drained
  // queue; every one after it was destroyed).
  //
  // 30, not 60, and 30 is not a shortfall: `$8206` is `pressed = now & ~prev`,
  // so two rising edges need a word with the bit CLEAR between them. Sixty
  // logic frames can therefore hold at most thirty A edges however perfect the
  // queue is, and asserting 60 would be asserting something impossible.
  resetInput();
  const s = createState();
  let edges = 0;
  for (let cb = 0; cb < 60; cb++) {
    setTouchButton(BTN.A, true);
    setTouchButton(BTN.A, false);
    readJoypad(s, nextInputWord());
    if (s.input.pressed & BTN.A) edges++;
  }
  assert.equal(edges, 30,
    `60 sub-frame taps produced ${edges} edges; 30 is the maximum a 60-frame `
    + 'word sequence can carry and anything less is the queue dropping presses');
  // AND THE BOOKS BALANCE, which is the part that makes the 30 a result rather
  // than a hope: 60 presses = 30 edges delivered + 29 counted as unrepresentable
  // + the 1 still sitting in the queue, which produces its edge when drained.
  const st = inputQueueStats();
  assert.equal(st.lostEdges, 29,
    'a second tap inside one merge window is unrepresentable and must be COUNTED');
  assert.equal(st.depth, 1);
  readJoypad(s, nextInputWord());
  assert.ok(s.input.pressed & BTN.A, 'the last tap is still in the queue, not lost');
  assert.equal(edges + st.lostEdges + 1, 60, 'every one of the 60 presses is accounted for');
});

test('THE MEMORY BOUND: 200,000 transitions with nothing draining hold two words', () => {
  // "a page left running for an hour must not accumulate." The bound is the
  // cap itself: `pending.push` is reachable only below MAX_PENDING and the
  // merge branch writes in place, so there is no growth path at all. 200,000
  // transitions is about 28 minutes of a finger emitting two pointermoves per
  // animation frame with the frame loop stopped dead.
  resetInput();
  const cap = inputQueueStats().cap;
  let worst = 0;
  for (let i = 0; i < 200_000; i++) {
    setTouchDirections(SLIDE[i % SLIDE.length]);
    if (i % 3 === 0) setTouchButton(BTN.A, (i & 1) === 0);
    const d = inputQueueStats().depth;
    if (d > worst) worst = d;
  }
  assert.equal(worst, cap, `queue depth reached ${worst}, cap ${cap}`);
  assert.equal(inputQueueStats().depth, cap, 'and it is still exactly the cap at the end');
});

test('THE BOOKS BALANCE: every press is an edge or is counted, over 40,000 events', () => {
  // The rule stated as an accounting identity rather than as a set of cases:
  //
  //     presses in the event stream  ==  $0005 edges + lostEdges
  //
  // once the queue has been drained. That is the strongest thing this design
  // can claim and it is the thing the wave-14 rule broke silently -- under
  // `pending[last] = w` a press could simply evaporate with no counter moving,
  // which is why the page could show a healthy `inq 1` while every shot was
  // being destroyed.
  //
  // ONE BIT PER TRANSITION, so the accounting is exact per press. The host is
  // driven at a deliberately hostile ratio: 0, 1 or 2 logic frames per event,
  // so the queue spends most of its life at the cap.
  resetInput();
  let seed = 0x1234567;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >>> 11;
  const BITS = [BTN.RIGHT, BTN.LEFT, BTN.DOWN, BTN.UP, BTN.START, BTN.SELECT, BTN.B, BTN.A];
  let mask = 0, presses = 0, edges = 0, prevWord = 0;
  const drain = (n) => {
    for (let i = 0; i < n; i++) {
      const w = nextInputWord();
      for (let b = 0; b < 8; b++) if ((w & (1 << b)) && !(prevWord & (1 << b))) edges++;
      prevWord = w;
    }
  };
  for (let i = 0; i < 40_000; i++) {
    const bit = BITS[rnd() % 8];
    const down = (mask & bit) === 0;
    if (down) presses++;
    mask = down ? (mask | bit) : (mask & ~bit);
    if (bit & DPAD_MASK) setTouchDirections(mask & DPAD_MASK);
    else setTouchButton(bit, down);
    drain(rnd() % 3);
  }
  drain(inputQueueStats().depth + 1);          // hand out everything still queued
  const st = inputQueueStats();
  assert.ok(st.coalesced > 1000,
    `only ${st.coalesced} merges -- the stream is not reaching the cap, so this `
    + 'proves nothing about the merge rule');
  assert.ok(st.carried > 100,
    `only ${st.carried} carries -- the press-survives-its-release path is barely `
    + 'exercised');
  assert.equal(edges + st.lostEdges, presses,
    `${presses} presses produced ${edges} edges with ${st.lostEdges} counted as `
    + 'unrepresentable -- a press that is neither is one this module destroyed '
    + 'without saying so, which is exactly the wave-14 defect');
});

// ===========================================================================
// PART 2b -- WAVE 15, DEFECT 2: THE IDEMPOTENCE GUARD IS EXECUTED.
//
// 14-review.md section 5: deleting `if (w === live) return;` from noteInput()
// left `node --test games/gradius/tests/` at 368 pass / 0 fail, because EVERY
// queue test above hands the setters a DIFFERENT mask each time. These hand
// them the SAME mask, which is what an auto-repeat keydown and a finger resting
// in one third of the d-pad actually do, and assert the queue does not grow.
// A permanently non-empty queue is the state that destroys taps, so this is the
// same defect class as PART 2a and not a tidiness check.
// ===========================================================================

test('IDEMPOTENCE: 200 identical setTouchButton calls queue nothing at all', () => {
  resetInput();
  setTouchButton(TOUCH_BUTTONS.A, true);
  assert.equal(nextInputWord(), BTN.A);
  assert.equal(inputQueueStats().depth, 0, 'the queue is drained before the storm');
  for (let i = 0; i < 200; i++) setTouchButton(TOUCH_BUTTONS.A, true);
  const st = inputQueueStats();
  assert.equal(st.depth, 0,
    `200 no-op presses left the queue ${st.depth} deep -- noteInput()'s `
    + 'idempotence guard is gone, and a queue that never drains destroys taps');
  assert.equal(st.coalesced, 0, 'and nothing reached the cap, because nothing was queued');
  assert.equal(nextInputWord(), BTN.A, 'the word is still simply what is held');
});

test('IDEMPOTENCE: a finger resting in one third emits pointermoves and queues nothing', () => {
  // The d-pad is hit-tested as a 3x3 grid, so a finger that moves a few pixels
  // inside one third fires pointermove after pointermove with the SAME mask.
  // At 60 Hz with two moves a frame that is 120 identical calls a second.
  resetInput();
  setTouchDirections(BTN.RIGHT);
  assert.equal(nextInputWord(), BTN.RIGHT);
  let worst = 0;
  for (let cb = 0; cb < 60; cb++) {
    setTouchDirections(BTN.RIGHT);
    setTouchDirections(BTN.RIGHT);
    const d = inputQueueStats().depth;
    if (d > worst) worst = d;
    assert.equal(nextInputWord(), BTN.RIGHT, `frame ${cb} read the wrong word`);
  }
  assert.equal(worst, 0,
    `a resting finger pushed the queue to ${worst} -- 60 seconds of this is a `
    + 'queue that is never empty and a d-pad that steers a frame late for ever');
  assert.equal(inputQueueStats().coalesced, 0);
});

test('IDEMPOTENCE: 200 auto-repeat keydowns of a held key queue nothing', () => {
  // The keyboard half of the same rule. B4 of wave 14 was a break that passed
  // because the tests covered one of src/input.js's two masks; this file's
  // rule since then is that every input claim is checked on BOTH paths.
  resetInput();
  const handlers = {};
  const target = {
    addEventListener(t, fn) { (handlers[t] ||= []).push(fn); },
    fire(t, ev) { for (const fn of handlers[t] || []) fn({ preventDefault() {}, ...ev }); },
  };
  attachInput(target);
  target.fire('keydown', { code: 'ArrowRight' });
  assert.equal(nextInputWord(), BTN.RIGHT, 'the real keydown is a transition');
  assert.equal(inputQueueStats().depth, 0);
  for (let i = 0; i < 200; i++) target.fire('keydown', { code: 'ArrowRight', repeat: true });
  const st = inputQueueStats();
  assert.equal(st.depth, 0,
    `200 auto-repeat keydowns left the queue ${st.depth} deep -- holding a key `
    + 'must not push 60 identical words a second');
  assert.equal(st.coalesced, 0);
  target.fire('blur', {});
  assert.equal(nextInputWord(), 0);
});

test('IDEMPOTENCE: the backstop fired repeatedly queues exactly one zero', () => {
  // index.html binds blur, visibilitychange AND pagehide to clearTouchButtons,
  // so leaving the page fires it three times in a row with nothing changing.
  resetInput();
  setTouchDirections(BTN.LEFT);
  assert.equal(nextInputWord(), BTN.LEFT);
  clearTouchButtons();
  clearTouchButtons();
  clearTouchButtons();
  assert.equal(inputQueueStats().depth, 1,
    'three identical clears are one transition, not three');
  assert.equal(nextInputWord(), 0);
  assert.equal(inputQueueStats().depth, 0);
});

test('the cap bounds steering lag: a sliding finger is never more than 2 frames stale', () => {
  // The other half of the trade. A finger crossing the d-pad emits a
  // pointermove per direction; the game must not follow it 133 ms later.
  resetInput();
  const directions = [BTN.LEFT, BTN.LEFT | BTN.UP, BTN.UP, BTN.UP | BTN.RIGHT, BTN.RIGHT];
  let worst = 0;
  for (const d of directions) {
    setTouchDirections(d);
    // One logic frame per animation frame, the healthy case.
    let lag = 0;
    while (nextInputWord() !== d) {
      lag++;
      assert.ok(lag <= 4, 'the queue never drains -- steering lag is unbounded');
    }
    if (lag > worst) worst = lag;
  }
  assert.ok(worst <= 2, `worst steering lag ${worst} logic frames > the cap ${2}`);
});

test('the backstop clears through the queue, so a stuck direction cannot survive', () => {
  resetInput();
  setTouchDirections(DPAD_MASK & BTN.RIGHT);
  nextInputWord();
  clearTouchButtons();                       // blur / pagehide / visibilitychange
  assert.equal(nextInputWord(), 0, 'the clear is a queued transition like any other');
  assert.equal(nextInputWord(), 0);
});

// ===========================================================================
// PART 3 -- the two together, which is what src/main.js does.
// ===========================================================================

test('the host clock changes HOW MANY frames run, never what they read', () => {
  // The same script of input events, delivered to the same number of logic
  // frames, must produce the SAME sequence of words whether the host ran them
  // one per callback or eight in a burst. That is the replay constraint, and it
  // is the property the old loop did not have.
  const script = [BTN.RIGHT, BTN.RIGHT | BTN.A, BTN.A, 0, BTN.LEFT, 0];

  const run = (framesPerCallback) => {
    resetInput();
    const out = [];
    for (const s of script) {
      setTouchDirections(s & DPAD_MASK);
      setTouchButton(BTN.A, (s & BTN.A) !== 0);
      for (let i = 0; i < framesPerCallback; i++) out.push(nextInputWord());
    }
    return out;
  };

  assert.deepEqual(run(1), run(1), 'trivially, but it pins the harness');
  const slow = run(8);
  assert.equal(slow.length, script.length * 8);
  // Every distinct state in the script reaches at least one logic frame, in
  // order, at k=8 -- which is precisely what the old loop lost.
  const distinct = slow.filter((w, i) => i === 0 || w !== slow[i - 1]);
  assert.deepEqual(distinct, script,
    'at k=8 the burst must still deliver every state in order');
});

test('a logic frame that finds the queue dry reuses the live mask, and says so', () => {
  resetInput();
  setTouchButton(TOUCH_BUTTONS.B, true);
  nextInputWord();
  const before = inputQueueStats().repeats;
  for (let i = 0; i < 5; i++) nextInputWord();
  assert.equal(inputQueueStats().repeats - before, 5,
    'the repeat counter is what tells a reader the queue is idle rather than empty-and-lost');
});

// ===========================================================================
// PART 4 -- src/main.js's ACTUAL loop body, not a re-statement of it.
//
// Parts 1-3 test FramePacer and the queue separately, and a port could pass all
// of them while src/main.js still called currentButtons() inside its catch-up
// loop -- which is precisely the shape of the defect that survived thirteen
// waves. So the loop body is a function now (stepLogicFrames) and this drives
// the real one, with the real nmi() and the real input module.
// ===========================================================================

test('stepLogicFrames feeds k logic frames k words off the queue', async () => {
  const { stepLogicFrames } = await import('../src/main.js');
  const { introEntryState } = await import('../src/main.js');
  const { headlessResources } = await import('./helpers.js');
  const { nmi } = await import('../src/nmi.js');

  const res = headlessResources(0);

  // Settle out of the stage intro so the ship exists and RIGHT actually moves
  // it: the intro blanks the screen and the player is not updated during it.
  const settle = (s) => { for (let i = 0; i < 120; i++) nmi(s, 0, res); };

  // A tap of RIGHT that lands entirely between two animation frames, delivered
  // to a BURST of 8 logic frames. The old loop read the live mask -- 0 -- eight
  // times and the ship never moved.
  resetInput();
  const burst = introEntryState(res.manifest);
  settle(burst);
  const x0 = burst.obj.x[0];
  setTouchDirections(BTN.RIGHT);
  setTouchDirections(0);
  stepLogicFrames(8, burst, res, null);
  const moved = burst.obj.x[0] - x0;
  assert.ok(moved > 0,
    `a tap between callbacks moved the ship 0 px over 8 logic frames -- the `
    + 'input word is not coming from the queue');

  // The control: the SAME 8 logic frames with the live mask never leaving 0.
  resetInput();
  const idle = introEntryState(res.manifest);
  settle(idle);
  const y0 = idle.obj.x[0];
  stepLogicFrames(8, idle, res, null);
  assert.equal(idle.obj.x[0] - y0, 0, 'and with no input at all the ship holds');
});

test('stepLogicFrames hands the audio path exactly k batches', async () => {
  const { stepLogicFrames, introEntryState } = await import('../src/main.js');
  const { headlessResources } = await import('./helpers.js');
  resetInput();
  const res = headlessResources(0);
  const state = introEntryState(res.manifest);
  const batches = [];
  const audio = { frame: (log) => batches.push(log.length) };
  stepLogicFrames(5, state, res, audio);
  assert.equal(batches.length, 5,
    'k logic frames owe k audio batches -- wave 13, and this file is the '
    + 'only place the two seams are checked together');
  stepLogicFrames(0, state, res, audio);
  assert.equal(batches.length, 5, 'k=0 hands over nothing');
});
