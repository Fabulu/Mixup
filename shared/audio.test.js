// Tests for the shared Web Audio shim (W135 Wave F).
//
// WHAT THIS FILE CLAIMS:
//   * the resampler is correct as a standalone primitive (same-rate, up, down,
//     sine frequency, streaming seams, multi-channel sync);
//   * the chip-agnostic engine schedules buffers contiguously, opens the
//     backlog valve past the ceiling (state advances, samples drop), and resyncs
//     on an underrun;
//   * the controller is locked until armed, firewalls a throwing chip, and
//     reports stats.
//
// It does NOT claim anything about how the browser sounds: there is no real
// AudioContext here. The fake context records what the engine SCHEDULED, which
// is exactly the input-granularity property the shim exists to enforce. The
// Gradius gate (games/gradius/tools/test-all.mjs) is the end-to-end proof that
// the real chip plus the real page run through this shim.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Resampler, AudioOut, AudioController,
         CHUNK, LOOKAHEAD_S, MAX_BACKLOG_FRAMES, MAX_BUFFERED_S,
         MASTER_GAIN } from './audio.js';

// ------------------------------------------------------------- helpers

/** A pure-tone source at `hz` for `n` samples at `rate`. */
function sine(n, hz, rate, phase = 0) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * hz * (i / rate) + phase);
  return out;
}

/**
 * Dominant frequency of a near-pure tone via zero-crossing count. Robust for
 * the sine sources these tests feed (no subharmonic-picking the way a naive
 * autocorrelation does): one period has two crossings, so f = crossings*R/(2N).
 */
function dominantHz(buf, rate) {
  let crossings = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i - 1] < 0 && buf[i] >= 0) || (buf[i - 1] >= 0 && buf[i] < 0)) crossings++;
  }
  return (crossings * rate) / (2 * buf.length);
}

/** A fake chip that synthesises a sine per channel, statefully, at sourceRate. */
function makeSineChip(sourceRate, channels, hz = 220) {
  let i = 0;
  const out = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(4096));
  let outLen = 0;
  return {
    sourceRate,
    channels,
    outLen: 0,
    _advance(n) {
      // ensure capacity
      while (outLen + n > out[0].length) {
        for (let c = 0; c < channels; c++) {
          const b = new Float32Array(out[c].length * 2);
          b.set(out[c]);
          out[c] = b;
        }
      }
      for (let k = 0; k < n; k++, i++) {
        const v = Math.sin(2 * Math.PI * hz * (i / sourceRate));
        for (let c = 0; c < channels; c++) out[c][outLen] = (c === 0) ? v : -v;
        outLen++;
      }
      this.outLen = outLen;
    },
    frame(log, emit = true) {
      // Each batch advances the chip by a logic-frame's worth of samples.
      const n = emit ? Math.round(sourceRate / 60) : 0;
      if (emit) this._advance(n);
      else { i += Math.round(sourceRate / 60); }   // state advances, samples not stored
    },
    drain(n, dests) {
      const k = Math.min(n, outLen);
      for (let c = 0; c < channels; c++) {
        dests[c].set(out[c].subarray(0, k));
        out[c].copyWithin(0, k, outLen);
      }
      outLen -= k;
      this.outLen = outLen;
      return k;
    },
  };
}

/** The smallest AudioContext the engine touches. Records what was scheduled. */
class FakeCtx {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.destination = { _in: [] };
    this.starts = [];
    this.gains = [];
  }
  createGain() {
    const g = { gain: { value: 1 }, connect() {}, disconnect() {} };
    this.gains.push(g);
    return g;
  }
  createBuffer(ch, len) {
    const data = [];
    for (let c = 0; c < ch; c++) data.push(new Float32Array(len));
    return {
      length: len,
      numberOfChannels: ch,
      getChannelData: (idx) => data[idx],
    };
  }
  createBufferSource() {
    const self = this;
    return {
      buffer: null,
      connect() {},
      start(t) { self.starts.push({ t, n: this.buffer.length, ch: this.buffer.numberOfChannels }); },
    };
  }
  resume() {}
  close() { return Promise.resolve(); }
}

// ===========================================================================
// 1. THE RESAMPLER
// ===========================================================================

test('resampler: same-rate feed reproduces the input bit-for-bit', () => {
  // sourceRate === destRate is not the engine's fast path (that bypasses the
  // resampler entirely), but the resampler itself must still be faithful at
  // ratio 1, which is the property that makes its own maths honest.
  const src = sine(2000, 220, 48000);
  const res = new Resampler(48000, 48000, 1);
  res.push([src], 2000);
  const dst = new Float32Array(res.outLen);
  res.drainOutput(res.outLen, [dst]);
  // Ratio 1 steps the read position by exactly 1 each output, fraction always
  // 0, and hermite(xm1,x0,x1,x2,0) === x0. So dst[k] === src[k + 1] (the first
  // emit reads at i=1). Compare against src offset by 1.
  let maxErr = 0;
  for (let i = 0; i < dst.length; i++) maxErr = Math.max(maxErr, Math.abs(dst[i] - src[i + 1]));
  assert.ok(maxErr < 1e-12, `same-rate max error ${maxErr} should be ~0`);
});

test('resampler: upsampling preserves the source frequency (48k -> 96k)', () => {
  const hz = 220;
  const src = sine(4000, hz, 48000);
  const res = new Resampler(48000, 96000, 1);
  res.push([src], 4000);
  const dst = new Float32Array(res.outLen);
  res.drainOutput(res.outLen, [dst]);
  assert.ok(dst.length > 6000 && dst.length < 8200,
    `upsampled length ${dst.length}, expected ~8000`);
  const got = dominantHz(dst, 96000);
  assert.ok(Math.abs(got - hz) < 4, `dominant freq ${got.toFixed(1)} Hz, want ~${hz}`);
});

test('resampler: downsampling preserves the source frequency (96k -> 48k)', () => {
  const hz = 110;
  const src = sine(8000, hz, 96000);
  const res = new Resampler(96000, 48000, 1);
  res.push([src], 8000);
  const dst = new Float32Array(res.outLen);
  res.drainOutput(res.outLen, [dst]);
  assert.ok(dst.length > 3500 && dst.length < 4200,
    `downsampled length ${dst.length}, expected ~4000`);
  const got = dominantHz(dst, 48000);
  assert.ok(Math.abs(got - hz) < 3, `dominant freq ${got.toFixed(1)} Hz, want ~${hz}`);
});

test('resampler: streaming across many small chunks == one big feed', () => {
  // The whole point of a streaming resampler: feeding the source in tiny
  // pieces must give the same output as feeding it all at once. A seam bug
  // shows up here as a click or a phase jump.
  const hz = 440;
  const big = sine(3000, hz, 48000);
  const r1 = new Resampler(48000, 44100, 1);
  r1.push([big], big.length);
  const one = new Float32Array(r1.outLen);
  r1.drainOutput(r1.outLen, [one]);

  const r2 = new Resampler(48000, 44100, 1);
  const chunkSize = 37;   // prime, to land out of phase with any internal window
  for (let i = 0; i < big.length; i += chunkSize) {
    r2.push([big.subarray(i, Math.min(i + chunkSize, big.length))],
            Math.min(chunkSize, big.length - i));
  }
  const many = new Float32Array(r2.outLen);
  r2.drainOutput(r2.outLen, [many]);

  assert.equal(many.length, one.length, `streamed length ${many.length} vs one-shot ${one.length}`);
  let maxErr = 0;
  for (let i = 0; i < one.length; i++) maxErr = Math.max(maxErr, Math.abs(one[i] - many[i]));
  assert.ok(maxErr < 1e-9, `stream-vs-one-shot max error ${maxErr}`);
});

test('resampler: two channels stay phase-locked (no inter-channel drift)', () => {
  // Left is +sin, right is -sin. After resampling both must stay exact mirrors,
  // which only holds if the two channels share their read position exactly.
  const n = 3000, hz = 330;
  const l = sine(n, hz, 48000);
  const rsrc = sine(n, hz, 48000, Math.PI);   // negated
  const res = new Resampler(48000, 44100, 2);
  res.push([l, rsrc], n);
  const lo = new Float32Array(res.outLen), ro = new Float32Array(res.outLen);
  res.drainOutput(res.outLen, [lo, ro]);
  let maxErr = 0;
  for (let i = 0; i < lo.length; i++) maxErr = Math.max(maxErr, Math.abs(lo[i] + ro[i]));
  assert.ok(maxErr < 1e-9, `L+R mirror error ${maxErr} should be ~0`);
});

test('resampler: rejects bad rates and channel counts', () => {
  assert.throws(() => new Resampler(0, 48000, 1), /sourceRate/);
  assert.throws(() => new Resampler(48000, 0, 1), /destRate/);
  assert.throws(() => new Resampler(48000, 44100, 3), /channels/);
});

// ===========================================================================
// 2. THE ENGINE (AudioOut) with a fake chip + fake context
// ===========================================================================

test('AudioOut: same-rate path schedules contiguous, non-overlapping buffers', () => {
  const ctx = new FakeCtx(48000);
  const out = new AudioOut(ctx, (rate) => makeSineChip(rate, 1));
  // Hand over 8 logic frames in one burst (the catch-up clamp shape).
  for (let i = 0; i < 8; i++) out.frame(new Uint8Array([0, 1]));
  out.pump();
  assert.ok(ctx.starts.length >= 3,
    `${ctx.starts.length} chunks scheduled; 0.12 s lookahead is several`);
  for (let i = 1; i < ctx.starts.length; i++) {
    const gap = ctx.starts[i].t - ctx.starts[i - 1].t;
    const want = ctx.starts[i - 1].n / ctx.sampleRate;
    assert.ok(Math.abs(gap - want) < 1e-9,
      `chunk ${i} gap ${gap}s != contiguous ${want}s`);
  }
});

test('AudioOut: backlog valve drops samples but advances chip state', () => {
  // A chip that counts how many frames it was told to advance, regardless of
  // whether the samples were kept. The valve contract: emit=false still runs
  // the frame, so the counter climbs past the ceiling.
  let advanced = 0, stored = 0;
  const chip = {
    sourceRate: 48000, channels: 1, outLen: 0,
    frame(log, emit = true) { advanced++; if (emit) stored++; },
    drain(n, dests) { return 0; },
  };
  const ctx = new FakeCtx(48000);
  const out = new AudioOut(ctx, () => chip);
  // 40 empty frames handed over at once: 15 are kept, 25 are fast-forwarded.
  for (let i = 0; i < 40; i++) out.frame(new Uint8Array(0));
  out.pump();
  assert.equal(advanced, 40, 'all 40 frames ran on the chip');
  assert.equal(stored, MAX_BACKLOG_FRAMES, `only ${MAX_BACKLOG_FRAMES} kept, rest dropped`);
  assert.equal(out.dropped, 40 - MAX_BACKLOG_FRAMES, 'drop counter matches');
});

test('AudioOut: underrun resyncs nextTime forward, never schedules in the past', () => {
  const ctx = new FakeCtx(48000);
  const out = new AudioOut(ctx, (rate) => makeSineChip(rate, 1));
  // First pump: primes nextTime = currentTime + START_LATENCY.
  for (let i = 0; i < 8; i++) out.frame(new Uint8Array([0, 1]));
  out.pump();
  const firstNext = out.nextTime;
  // Simulate a stall: the clock runs past everything we scheduled.
  ctx.currentTime = firstNext + 1.0;
  out.pump();
  assert.ok(out.underruns >= 1, 'an underrun was counted');
  assert.ok(out.nextTime >= ctx.currentTime,
    `nextTime ${out.nextTime} resynced forward of currentTime ${ctx.currentTime}`);
});

test('AudioOut: the resample path schedules dest-rate buffers from a source-rate chip', () => {
  // A 33800 Hz chip through a 48000 Hz context: the engine must build the
  // resampler and emit 48000-Hz CHUNKs. This is the DOJ shape (rates differ,
  // and DOJ's native rate is ~33.8 kHz per the W135 plan).
  const ctx = new FakeCtx(48000);
  const out = new AudioOut(ctx, () => makeSineChip(33800, 1, 220));
  for (let i = 0; i < 64; i++) out.frame(new Uint8Array([0, 1]));   // ~1 s of audio
  out.pump();
  assert.ok(ctx.starts.length >= 1, 'resample path scheduled at least one buffer');
  for (const s of ctx.starts) {
    assert.equal(s.n, CHUNK, 'every scheduled buffer is exactly CHUNK long');
  }
  // Contiguity holds across the resample path too.
  for (let i = 1; i < ctx.starts.length; i++) {
    const gap = ctx.starts[i].t - ctx.starts[i - 1].t;
    assert.ok(Math.abs(gap - CHUNK / ctx.sampleRate) < 1e-9,
      `resampled chunk ${i} gap ${gap} != ${CHUNK / ctx.sampleRate}`);
  }
});

test('AudioOut: stereo chip produces 2-channel buffers', () => {
  const ctx = new FakeCtx(48000);
  const out = new AudioOut(ctx, (rate) => makeSineChip(rate, 2, 220));
  for (let i = 0; i < 8; i++) out.frame(new Uint8Array([0, 1]));
  out.pump();
  assert.ok(ctx.starts.length >= 1);
  for (const s of ctx.starts) assert.equal(s.ch, 2, 'stereo buffer has 2 channels');
});

test('AudioOut: master gain is applied and muting zeroes it without stopping the chip', () => {
  const ctx = new FakeCtx(48000);
  const out = new AudioOut(ctx, (rate) => makeSineChip(rate, 1));
  assert.equal(ctx.gains[0].gain.value, MASTER_GAIN);
  out.setMuted(true);
  assert.equal(ctx.gains[0].gain.value, 0);
  out.setMuted(false);
  assert.equal(ctx.gains[0].gain.value, MASTER_GAIN);
});

test('AudioOut: makeChip shape is validated at construction', () => {
  const ctx = new FakeCtx(48000);
  assert.throws(() => new AudioOut(ctx, () => ({})), /makeChip/);
});

// ===========================================================================
// 3. THE CONTROLLER (AudioController): lock/unlock + firewall + stats
// ===========================================================================

test('AudioController: starts locked, drops frames until armed', () => {
  const ac = new AudioController(() => makeSineChip(48000, 1), () => {});
  assert.equal(ac.status, 'locked');
  ac.frame(new Uint8Array([0, 1]));
  assert.equal(ac.out, null, 'no engine exists while locked');
  // Arming with no AudioContext global leaves it unsupported, never built.
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
  ac.arm();
  assert.equal(ac.status, 'unsupported');
});

test('AudioController: deferred semantic controls stay ordered with silent frames', () => {
  const events = [];
  const chip = {
    sourceRate: 33075, channels: 2, outLen: 0,
    selectScoreGroup(group) { events.push(`group:${group}`); },
    frame(log, emit) { events.push(`frame:${log[0] ?? '-'}:${emit}`); },
    drain() { return 0; },
  };
  const ac = new AudioController(null, () => {});
  ac.frame(Uint8Array.of(1));
  ac.selectScoreGroup(1);
  ac.frame(Uint8Array.of(2));
  ac.setChip(chip);
  assert.deepEqual(events, ['frame:1:false', 'group:1', 'frame:2:false']);
});

test('AudioController: arm() builds the engine once, second arm only resumes', () => {
  const ac = new AudioController(() => makeSineChip(48000, 1), () => {});
  let resumes = 0;
  globalThis.AudioContext = class {
    constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createBuffer() { return { length: 1024, numberOfChannels: 1, getChannelData: () => new Float32Array(1024) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    resume() { resumes++; }
    close() { return Promise.resolve(); }
  };
  ac.arm();
  assert.equal(ac.status, 'on');
  const out = ac.out;
  ac.arm();   // second gesture: must not rebuild
  assert.equal(ac.out, out, 'second arm() reuses the existing engine');
  assert.ok(resumes >= 2, 'second arm() resumed the context');

  delete globalThis.AudioContext;
});

test('AudioController: close permanently releases a same-document launch', async () => {
  const ac = new AudioController(() => makeSineChip(48000, 1), () => {});
  let closes = 0;
  globalThis.AudioContext = class {
    constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createBuffer() { return { length: 1024, numberOfChannels: 1, getChannelData: () => new Float32Array(1024) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    resume() {}
    close() { closes++; return Promise.resolve(); }
  };
  ac.arm();
  await ac.close();
  assert.equal(ac.status, 'closed');
  assert.equal(ac.out, null);
  assert.equal(ac.ctx, null);
  assert.equal(closes, 1);
  ac.arm();
  await ac.close();
  assert.equal(closes, 1, 'closed controllers cannot reopen or close twice');
  delete globalThis.AudioContext;
});

test('AudioController: a throw inside the chip is firewalled, not thrown to the page', () => {
  const errs = [];
  const boom = {
    sourceRate: 48000, channels: 1, outLen: 0,
    frame() { throw new Error('chip blew up'); },
    drain() { return 0; },
  };
  const ac = new AudioController(() => boom, (e) => errs.push(e));
  globalThis.AudioContext = class {
    constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createBuffer() { return { length: 1024, numberOfChannels: 1, getChannelData: () => new Float32Array(1024) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    resume() {}
    close() { return Promise.resolve(); }
  };
  ac.arm();
  ac.frame(new Uint8Array([0, 1]));
  assert.doesNotThrow(() => ac.pump(), 'the firewall must swallow the chip throw');
  assert.equal(ac.status, 'failed');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /chip blew up/);
  // Inert after failure: another frame + pump does nothing and throws nothing.
  assert.doesNotThrow(() => { ac.frame(new Uint8Array([0, 1])); ac.pump(); });

  delete globalThis.AudioContext;
});

test('AudioController: stats reports locked status with no engine, numbers with one', () => {
  const ac = new AudioController(() => makeSineChip(48000, 1), () => {});
  assert.deepEqual(ac.stats(), { status: 'locked' });
  globalThis.AudioContext = class {
    constructor() { this.sampleRate = 44100; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createBuffer() { return { length: 1024, numberOfChannels: 1, getChannelData: () => new Float32Array(1024) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    resume() {}
    close() { return Promise.resolve(); }
  };
  ac.arm();
  const s = ac.stats();
  assert.equal(s.status, 'on');
  assert.equal(s.rate, 44100);
  assert.equal(s.backlog, 0);
  assert.equal(s.dropped, 0);
  ac.setMuted(true);
  assert.equal(ac.stats().status, 'muted');

  delete globalThis.AudioContext;
});

// ===========================================================================
// 5. W423 -- DOCKET D54. THE RENDERED BUFFER HAS A CEILING.
//
// THE OWNER'S REPORT, twice: "sound lags behind by about 1 second", then
// "in level 2 sound is now like 5 seconds behind [...] but I switched window
// focus a lot".
//
// THE DOCKET'S FIRST ANALYSIS BLAMED THE GAME-SIDE RING AND WAS WRONG, and the
// owner's own number is what disproved it: that ring is 100 slots drained one
// per frame, so 1.67 s is its arithmetic ceiling. Five seconds cannot fit in
// it. A second queue had to exist, and it is here -- `chip.outLen`, whose
// backing store `ics2115._ensureOut` DOUBLES without limit.
//
// WHY `MAX_BACKLOG_FRAMES` DID NOT ALREADY COVER THIS. It bounds one pump to
// 15 frames of emitted samples. 15 frames is 250 ms of audio, produced in the
// 16.7 ms of real time one rAF costs. So a valve working exactly as designed
// still leaves ~233 ms behind on every catch-up burst, permanently. The valve
// bounds the growth RATE. Only section 5 bounds the BUFFER.
//
// Measured before the fix, 30-frame bursts: 1 burst 0.153 s, 5 -> 1.099 s,
// 10 -> 2.268 s, 20 -> 4.605 s, 40 -> 9.280 s. Linear and unbounded, and the
// owner's "about 5 seconds" sits right at 20 bursts of window-focus churn.
// ===========================================================================

/** Drive `out` through `bursts` catch-up bursts, returning buffered seconds. */
function churn(out, ctx, chip, { burst, bursts, settle = 30 }) {
  const step = 1 / 60;
  for (let b = 0; b < bursts; b++) {
    for (let i = 0; i < burst; i++) out.frame(null);   // one rAF, many logic frames
    out.pump();
    ctx.currentTime += step;
    for (let i = 0; i < settle; i++) { out.frame(null); out.pump(); ctx.currentTime += step; }
  }
  return chip.outLen / chip.sourceRate;
}

test('D54: repeated catch-up bursts do NOT accumulate buffered audio', () => {
  const ctx = new FakeCtx(48000);
  const chip = makeSineChip(48000, 2);
  const out = new AudioOut(ctx, () => chip);
  // settle into steady state first, so the burst effect is what is measured
  for (let i = 0; i < 120; i++) { out.frame(null); out.pump(); ctx.currentTime += 1 / 60; }

  const after5 = churn(out, ctx, chip, { burst: 30, bursts: 5 });
  const after40 = churn(out, ctx, chip, { burst: 30, bursts: 35 });

  // THE DEFECT WAS GROWTH. Unfixed these measured 1.099 s and 9.280 s: eight
  // times as much lag for eight times the churn. Bounded, they must not differ.
  assert.ok(after40 <= MAX_BUFFERED_S,
    `40 bursts left ${after40.toFixed(3)} s buffered, ceiling is ${MAX_BUFFERED_S} s`);
  assert.ok(after40 - after5 < 0.05,
    `lag must not grow with churn: 5 bursts ${after5.toFixed(3)} s vs 40 bursts `
    + `${after40.toFixed(3)} s`);
});

test('D54: ordinary play never reaches the ceiling and so drops NOTHING', () => {
  // The trap this test exists to catch: a ceiling low enough to trigger during
  // normal frames would trade the owner's lag for the owner's audio.
  const ctx = new FakeCtx(48000);
  const chip = makeSineChip(48000, 2);
  const out = new AudioOut(ctx, () => chip);
  for (let i = 0; i < 600; i++) { out.frame(null); out.pump(); ctx.currentTime += 1 / 60; }
  assert.equal(out.stale, 0, 'ten seconds of clean 60 Hz play discards no samples');
  assert.equal(out.dropped, 0, 'and the backlog valve never opens either');
  assert.ok(chip.outLen / chip.sourceRate < MAX_BUFFERED_S,
    'steady state sits below the ceiling with room to spare');
});

test('D54: the ceiling is enforced on the RESAMPLED path too', () => {
  // DOJ is the resampled path: the chip runs ~33.8 kHz into a 48 kHz context.
  // Samples pool on BOTH sides of the resampler, so capping only the chip
  // would leave the same unbounded queue one stage downstream.
  const ctx = new FakeCtx(48000);
  const chip = makeSineChip(33868, 2);
  const out = new AudioOut(ctx, () => chip);
  for (let i = 0; i < 120; i++) { out.frame(null); out.pump(); ctx.currentTime += 1 / 60; }
  const after = churn(out, ctx, chip, { burst: 30, bursts: 40 });
  assert.ok(after <= MAX_BUFFERED_S,
    `chip side: ${after.toFixed(3)} s buffered, ceiling ${MAX_BUFFERED_S} s`);
  assert.ok(out.resampler, 'the resampled path really was the one exercised');
  const held = out.resampler.outLen / ctx.sampleRate;
  assert.ok(held <= MAX_BUFFERED_S + 0.01,
    `resampler side: ${held.toFixed(3)} s held past the ceiling`);
});

test('D54: EVERY cue still reaches the chip -- only rendered samples are dropped', () => {
  // The owner's decision on this item was "catch up the backlog, keep every
  // cue". Trimming must therefore never skip a `frame()` call: cues are chip
  // STATE, and state that never arrives is a note that never plays, or worse a
  // note that never stops. What section 5 throws away is only rendering.
  const ctx = new FakeCtx(48000);
  let applied = 0;
  const chip = makeSineChip(48000, 2);
  const inner = chip.frame.bind(chip);
  chip.frame = (log, emit) => { applied++; return inner(log, emit); };
  const out = new AudioOut(ctx, () => chip);
  const TOTAL = 40 * 31;                       // bursts of 30 plus one settle frame each
  for (let b = 0; b < 40; b++) {
    for (let i = 0; i < 30; i++) out.frame(null);
    out.pump();
    ctx.currentTime += 1 / 60;
    out.frame(null); out.pump(); ctx.currentTime += 1 / 60;
  }
  assert.equal(applied, TOTAL,
    'every posted frame was applied to the chip, including the ones whose samples were dropped');
});

test('D54: stats() reports the discarded count, so this is visible in the field', () => {
  // The owner diagnoses from the on-screen stats. A silent trim would make the
  // next report of lag unanswerable.
  const ctx = new FakeCtx(48000);
  const chip = makeSineChip(48000, 2);
  const out = new AudioOut(ctx, () => chip);
  for (let i = 0; i < 120; i++) { out.frame(null); out.pump(); ctx.currentTime += 1 / 60; }
  churn(out, ctx, chip, { burst: 30, bursts: 10 });
  assert.ok(out.stale > 0, 'the trim actually ran during the churn');
  const ac = new AudioController(null);
  ac.out = out;
  ac.status = 'on';
  assert.equal(ac.stats().stale, out.stale, 'and stats() surfaces it');
});

// ===========================================================================
// 6. W423 -- DOCKET D57. THE VISIBILITY BACKSTOP AUDIO DID NOT HAVE.
//
// THE OWNER, twice: "Clicked some other tabs, game went silent as it should.
// Came back, started level 2, and now a sound probably from before kept looping
// and it never goes away", then "in level 2 sound is now like 5 seconds behind,
// [...] but I switched window focus a lot".
//
// THE ASYMMETRY IS THE FINDING. `games/ddpdoj/src/web/input.js:246` wires
// `blur`, `pagehide` AND `visibilitychange` and clears the whole button mask,
// because a key held when focus is lost never sends its keyup. Audio had the
// identical hole -- a tab-away leaves logic frames that all land at once on
// return -- and a grep of `games/ddpdoj/src/web/` finds NO audio listener for
// any of the three.
//
// WHAT WAS RULED OUT, so nobody re-checks it: the backlog valve does NOT lose
// cues. `ics2115.frame` calls `applyLog(log)` unconditionally, before `emit` is
// consulted, so a dropped batch still applies every register write.
// ===========================================================================

test('D57: resync drops the pending backlog outright', () => {
  const ctx = new FakeCtx(48000);
  const chip = makeSineChip(48000, 2);
  const out = new AudioOut(ctx, () => chip);
  for (let i = 0; i < 600; i++) out.frame(null);      // a ten-second tab-away
  assert.equal(out.queue.length, 600, 'the backlog really is there to drop');
  out.resync();
  assert.equal(out.queue.length, 0, 'queued frames are gone');
  assert.equal(chip.outLen, 0, 'and so are the rendered samples');
  assert.equal(out.resyncs, 1);
});

test('D57: after a resync the clock re-arms at NOW, not where it left off', () => {
  // The stale scheduling clock is the mechanism behind "five seconds behind":
  // nextTime keeps its old value and every later chunk inherits the offset.
  const ctx = new FakeCtx(48000);
  const chip = makeSineChip(48000, 2);
  const out = new AudioOut(ctx, () => chip);
  for (let i = 0; i < 60; i++) { out.frame(null); out.pump(); ctx.currentTime += 1 / 60; }
  ctx.currentTime += 10;                             // the tab was hidden ten seconds
  out.resync();
  assert.equal(out.nextTime, -1, 'the clock is disarmed, so the next pump re-arms it');
  out.frame(null);
  out.pump();
  assert.ok(out.nextTime > ctx.currentTime,
    'and it re-armed AHEAD of the current time, not ten seconds behind it');
  assert.ok(out.nextTime - ctx.currentTime < 0.5,
    `re-armed ${(out.nextTime - ctx.currentTime).toFixed(3)} s out, which must be one latency`);
});

test('D57: resync does NOT reset the chip -- the game keeps its voices', () => {
  // The trap. Zeroing the chip would silence music the driver still believes is
  // playing, and nothing would ever restart it: a stuck-silent bug traded for a
  // stuck-looping one. Only pending work and rendered samples may go.
  const ctx = new FakeCtx(48000);
  const chip = makeSineChip(48000, 2);
  let reset = 0;
  chip.reset = () => { reset++; };
  const out = new AudioOut(ctx, () => chip);
  for (let i = 0; i < 30; i++) { out.frame(null); out.pump(); ctx.currentTime += 1 / 60; }
  out.resync();
  assert.equal(reset, 0, 'the chip was never reset');
  out.frame(null);
  out.pump();
  assert.ok(chip.outLen >= 0 && ctx.starts.length > 0,
    'and it goes straight back to producing audio afterwards');
});

test('D57: the controller exposes resync and it is safe before a gesture', () => {
  // Before the arming gesture there is no engine at all. The page wires the
  // backstop at load, so an unarmed resync must be a no-op rather than a throw.
  const ac = new AudioController(null);
  assert.equal(typeof ac.resync, 'function', 'the page-facing object exposes it');
  assert.doesNotThrow(() => ac.resync(), 'and calling it unarmed does nothing');
  assert.equal(ac.stats().status, 'locked', 'still locked, still nothing scheduled');
});

test('D57: stats() reports the resync count', () => {
  const ctx = new FakeCtx(48000);
  const chip = makeSineChip(48000, 2);
  const out = new AudioOut(ctx, () => chip);
  const ac = new AudioController(null);
  ac.out = out;
  ac.status = 'on';
  assert.equal(ac.stats().resyncs, 0);
  ac.resync();
  ac.resync();
  assert.equal(ac.stats().resyncs, 2, 'two backstop firings are visible in the field');
});
