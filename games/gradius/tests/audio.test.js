// WAVE 13 -- the audio output path.
//
// ================== WHAT THIS FILE IS ALLOWED TO CLAIM =======================
//
// There is NO comparison against an emulator's audio here and there must not
// be one. The strong claim this project can make about sound is that the
// REGISTER STREAM matches the cartridge, and wave 8 already proves that per
// frame over 42 scenarios (`apuWrites`, `apuDigest`, TIER 1). Comparing emitted
// PCM against an emulator recording sounds like a stronger claim and is a
// weaker one: it would inherit that emulator's own guesses about the chip, and
// it is the easy thing to build because diffing audio buffers is trivial.
// games/ddpdoj/NOTES-sound.md reasons the same thing through for the ICS2115.
//
// So this file checks four things and says so plainly:
//
//   1. THE BRIDGE -- the bytes the synthesiser eats are the bytes the corpus
//      checked. `state.apuLog` re-derives `work.apuDigest` on every frame.
//   2. DETERMINISM -- same stream + same sample rate => the same bits, twice in
//      this process and twice in separate processes.
//   3. STRUCTURE -- properties assertable with no oracle at all: a channel is
//      silent when its length counter is 0, the triangle does not advance with
//      a linear counter of 0, the noise LFSR's two periods are 32767 and 93,
//      the noise period table reproduces the PUBLISHED NTSC frequency table
//      (two derivations of one number), the frame counter is in the 5-step mode
//      $81B2 selects, the mixer is the exact non-linear form, no NaN, no clip.
//   4. THE REFUSALS -- a DMC register write and a 4-step $4017 write are loud
//      named throws, not silent no-ops.
//
// WHAT IS NOT CHECKED ANYWHERE, and cannot be by anything in this repo: that it
// SOUNDS RIGHT. That took a human with a browser. See
// docs/worklog/gradius/13-impl-audio-output.md.

import test from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { NesApu, LENGTH_TABLE, NOISE_PERIODS, PULSE_MIX, TND_MIX, DUTY,
         CPU_HZ, CPU_NUM, CPU_DEN } from '../src/audio/apu.js';
import { renderScript } from '../tools/audiohash.mjs';
import { headlessResources } from './helpers.js';

const GAME = dirname(dirname(fileURLToPath(import.meta.url)));
const RATE = 48000;

/** A chip with the filters off, so a test can look at one channel's own level. */
const raw = () => new NesApu(RATE, { filters: false });

// ===========================================================================
// 1. THE BRIDGE: what the synthesiser eats is what the corpus checked
// ===========================================================================

test('the frame write log re-derives work.apuDigest -- the field the corpus compares',
  () => {
    // renderScript() throws on the first frame where they disagree, so reaching
    // the end IS the assertion; the counts below are here so a run that quietly
    // stopped producing writes cannot pass.
    const r = renderScript({ frames: 300, rate: RATE, res: headlessResources(0) });
    assert.ok(r.writes > 100, `only ${r.writes} register writes in 300 frames -- `
      + 'the driver produced almost nothing and the bridge proved nothing');
    assert.ok(r.samples > 0.9 * 300 * RATE / 60.098814,
      `${r.samples} samples for 300 frames is not one frame's worth per frame`);
  });

// ===========================================================================
// 2. DETERMINISM
// ===========================================================================

test('same register stream + same rate => bit-identical samples (one process)', () => {
  const res = headlessResources(0);
  const a = renderScript({ frames: 240, rate: RATE, res });
  const b = renderScript({ frames: 240, rate: RATE, res });
  assert.strictEqual(a.hash, b.hash);
  assert.strictEqual(a.samples, b.samples);
  // ...and a different rate is a DIFFERENT (equally correct) answer, so the
  // hash must not be accidentally rate-independent.
  const c = renderScript({ frames: 240, rate: 44100, res });
  assert.notStrictEqual(a.hash, c.hash);
});

test('the mixer cache is an optimisation and nothing else', () => {
  // `run()` recomputes the mixed level only when a sequencer stepped, an LFSR
  // shifted or the frame counter clocked -- 0.61 ms/frame instead of 1.00. That
  // is only sound if EVERY such point sets `dirty`, and a missing one produces
  // a fraction of a millisecond of stale level that no ear and no structural
  // assertion would ever notice. So the two are rendered against each other.
  const res = headlessResources(0);
  const cached = renderScript({ frames: 400, rate: RATE, res });
  const plain = renderScript({ frames: 400, rate: RATE, res, apuOpts: { mixCache: false } });
  assert.strictEqual(cached.hash, plain.hash,
    'the cached and uncached mixers disagree -- some state change in run() does '
    + 'not set `dirty`');

  // ...AND THE CARTRIDGE'S OWN STREAM IS NOT ENOUGH TO CHECK IT. Deleting the
  // `dirty = true` at the frame-counter clock left the assertion above GREEN,
  // because this cartridge never gives the frame counter anything to change:
  // $EDD1/$EF2C write $4000 with bit 4 (constant volume) set, so no envelope
  // ever decays; $EF9B writes $4003 with the period high bits ORed with $08, so
  // the length index is always 1 = 254 half frames and no length counter
  // expires inside a compared window; and $EDF9's only sweep value is $30, i.e.
  // disabled. A quarter or half frame therefore never alters a channel's level
  // between two timer steps ON THIS DATA, and the break was inert.
  //
  // So the case is constructed: an ENVELOPE (bit 4 clear) on a 50% duty, where
  // the decay level changes 192 times a second and half of those land while the
  // duty output is high. Found by the break surviving, which is the whole
  // reason the break pass exists.
  // $4000 = $A5: duty 2 (50%), loop set, bit 4 CLEAR = envelope, period 5.
  const envStream = [0x00, 0xA5, 0x01, 0x00, 0x02, 0x40, 0x03, 0x09];
  const runBoth = (mixCache) => {
    const a = new NesApu(RATE, { mixCache });
    a.frame(envStream);
    for (let i = 0; i < 200; i++) a.frame([]);
    return Array.from(a.out.subarray(0, a.outLen)).join(',');
  };
  assert.strictEqual(runBoth(true), runBoth(false),
    'with a real envelope running, the cached mixer no longer matches the '
    + 'uncached one -- a frame-counter clock is not setting `dirty`');
});

test('...and bit-identical across processes', () => {
  const run = () => {
    const r = spawnSync(process.execPath,
      [join(GAME, 'tools', 'audiohash.mjs'), '--frames', '240', '--json'],
      { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const a = run();
  const b = run();
  assert.strictEqual(a.hash, b.hash, 'two separate node processes disagreed');
  // And the separate process must agree with the in-process computation, or
  // "deterministic" would only mean "deterministic inside a test runner".
  const here = renderScript({ frames: 240, rate: 48000, res: headlessResources(0) });
  assert.strictEqual(a.hash, here.hash);
});

// ===========================================================================
// 3a. THE FRAME COUNTER -- 5-step, because $81B2 writes $C0
// ===========================================================================

test('$81AB-$81B2: reset() leaves all four channels enabled and the 5-step sequence',
  () => {
    const a = raw();
    // $81AB LDA #$1F / $81AD STA $4015 -- pulse 1, pulse 2, triangle, noise, DMC.
    assert.ok(a.p1.enabled && a.p2.enabled && a.tri.enabled && a.noise.enabled);
  });

test('the frame counter clocks 96 half frames and 192 quarter frames per second',
  () => {
    // $81B0 LDA #$C0 / $81B2 STA $4017 -- bit 7 set, so the 5-step sequence.
    // In the 4-step default these would be 120 and 240, every note would be a
    // quarter shorter and every envelope a quarter faster. It is the most
    // audible cartridge fact in the synthesiser.
    const a = raw();
    let half = 0, quarter = 0;
    const H = NesApu.prototype.halfFrame, Q = NesApu.prototype.quarterFrame;
    a.halfFrame = function () { half++; H.call(this); };
    a.quarterFrame = function () { quarter++; Q.call(this); };
    a.run(Math.round(CPU_HZ), false);          // exactly one second of CPU
    assert.ok(half === 96 || half === 97, `half frames per second = ${half}, want 96`);
    assert.ok(quarter === 192 || quarter === 193,
      `quarter frames per second = ${quarter}, want 192`);
  });

// ===========================================================================
// 3b. LENGTH COUNTERS -- a channel with 0 is silent
// ===========================================================================

/** Start pulse 1 on a period the sweep unit does not mute, at full volume. */
function startPulse1(a, { period = 0x100, lenIdx = 1 } = {}) {
  a.write(0x00, 0xBF);                 // duty 2 (50%), halt, const vol 15
  a.write(0x01, 0x00);                 // sweep off
  a.write(0x02, period & 0xFF);
  a.write(0x03, ((lenIdx & 0x1F) << 3) | ((period >> 8) & 7));
}

test('a pulse channel is silent when its length counter is 0', () => {
  const a = raw();
  startPulse1(a);
  assert.strictEqual(a.p1.length, LENGTH_TABLE[1]);
  let loud = 0;
  for (let i = 0; i < 4000; i++) { a.run(1, false); if (a.p1.output() !== 0) loud++; }
  assert.ok(loud > 500, `pulse 1 never went loud (${loud}/4000) -- the rest of `
    + 'this test would prove nothing');

  // $4015 bit 0 cleared: the length counter is zeroed and held there.
  a.write(0x15, 0x1E);
  assert.strictEqual(a.p1.length, 0);
  for (let i = 0; i < 4000; i++) {
    a.run(1, false);
    assert.strictEqual(a.p1.output(), 0, `pulse 1 sounded at cycle ${i} with length 0`);
  }
});

test('a pulse channel is silent below period 8 and above a $7FF sweep target', () => {
  const a = raw();
  startPulse1(a, { period: 7 });
  assert.ok(a.p1.mute, 'period 7 must mute: the hardware silences period < 8');
  for (let i = 0; i < 2000; i++) { a.run(1, false); assert.strictEqual(a.p1.output(), 0); }

  // Sweep shift 1, adding: target = period + period/2. At $600 that is $900,
  // past $7FF, so the channel mutes even though nothing has swept yet.
  const b = raw();
  startPulse1(b, { period: 0x600 });
  b.write(0x01, 0x81);                 // enabled, shift 1, add
  assert.ok(b.p1.mute, 'a sweep target above $7FF must mute');
  for (let i = 0; i < 2000; i++) { b.run(1, false); assert.strictEqual(b.p1.output(), 0); }
});

test('the noise channel is silent when its length counter is 0', () => {
  const a = raw();
  a.write(0x0C, 0x3F);                 // halt, const vol 15
  a.write(0x0E, 0x04);                 // period index 4
  a.write(0x0F, 0x08);                 // length index 1 = 254
  let loud = 0;
  for (let i = 0; i < 4000; i++) { a.run(1, false); if (a.noise.output() !== 0) loud++; }
  assert.ok(loud > 500, `noise never went loud (${loud}/4000)`);
  a.write(0x15, 0x17);                 // clear bit 3
  for (let i = 0; i < 4000; i++) {
    a.run(1, false);
    assert.strictEqual(a.noise.output(), 0);
  }
});

test('the length counter runs for exactly LENGTH_TABLE[i] half frames', () => {
  for (const idx of [0, 1, 5, 16, 31]) {
    const a = raw();
    a.write(0x00, 0x1F);               // NOT halted -- bit 5 clear
    a.write(0x01, 0x00);
    a.write(0x02, 0x00);
    a.write(0x03, (idx << 3) | 1);     // period $100, length index idx
    assert.strictEqual(a.p1.length, LENGTH_TABLE[idx]);
    let clocks = 0;
    while (a.p1.length > 0) { a.halfFrame(); clocks++; assert.ok(clocks < 400); }
    assert.strictEqual(clocks, LENGTH_TABLE[idx], `length index ${idx}`);
  }
});

// ===========================================================================
// 3c. THE TRIANGLE -- it does not run without a linear counter
// ===========================================================================

test('the triangle does not advance while its linear counter is 0', () => {
  const a = raw();
  a.write(0x08, 0xFF);                 // control set, linear reload $7F
  a.write(0x0A, 0x40);
  a.write(0x0B, 0x08);                 // length index 1, period high 0
  a.quarterFrame();                    // load the linear counter
  assert.ok(a.tri.linCounter > 0);
  const before = a.tri.phase;
  a.run(5000, false);
  assert.notStrictEqual(a.tri.phase, before, 'the triangle never moved at all');

  // $ED36's silencing write: $4008 := 0. Control clear and reload 0, so the
  // next quarter frame takes the linear counter to 0 and it stays there.
  a.write(0x08, 0x00);
  a.quarterFrame();
  assert.strictEqual(a.tri.linCounter, 0);
  const frozen = a.tri.phase;
  for (let i = 0; i < 5000; i++) {
    a.run(1, false);
    assert.strictEqual(a.tri.phase, frozen, `the triangle stepped at cycle ${i} `
      + 'with a linear counter of 0');
  }
});

test('the triangle does not advance while its length counter is 0', () => {
  const a = raw();
  a.write(0x08, 0xFF);
  a.write(0x0A, 0x40);
  a.write(0x0B, 0x08);
  a.quarterFrame();
  a.run(3000, false);
  a.write(0x15, 0x1B);                 // clear bit 2 -> length 0
  assert.strictEqual(a.tri.length, 0);
  const frozen = a.tri.phase;
  a.run(5000, false);
  assert.strictEqual(a.tri.phase, frozen);
});

test('the triangle sequence is 15..0,0..15 and its period is CPU/(32*(t+1))', () => {
  const a = raw();
  const t = 0x100;
  a.write(0x08, 0xFF);
  a.write(0x0A, t & 0xFF);
  a.write(0x0B, 0x08 | (t >> 8));
  a.quarterFrame();
  // Count full 32-step cycles over a second of CPU time.
  let steps = 0;
  let last = a.tri.phase;
  const cycles = Math.round(CPU_HZ);
  for (let i = 0; i < cycles; i++) {
    a.run(1, false);
    if (a.tri.phase !== last) { steps++; last = a.tri.phase; }
    if (i % 20000 === 0) a.quarterFrame();     // keep the linear counter alive
  }
  const want = CPU_HZ / (t + 1);
  assert.ok(Math.abs(steps - want) / want < 0.01,
    `triangle stepped ${steps} times/s, want ${want.toFixed(0)}`);
});

// ===========================================================================
// 3d. THE NOISE LFSR -- two periods, and a period table with a second source
// ===========================================================================

test('the noise LFSR repeats after 32767 steps in mode 0 and 93 in mode 1', () => {
  for (const [mode, want] of [[0, 32767], [1, 93]]) {
    const a = raw();
    a.write(0x0E, mode << 7);
    a.noise.lfsr = 1;
    let n = 0;
    do { a.noise.clockLfsr(); n++; assert.ok(n <= 40000); } while (a.noise.lfsr !== 1);
    assert.strictEqual(n, want, `mode ${mode}`);
  }
});

test('NOISE_PERIODS reproduces the published NTSC noise frequency table', () => {
  // THE SECOND DERIVATION. The published table is the fundamental of the SHORT
  // (mode 1) LFSR, whose sequence repeats after 93 steps -- so the shift rate
  // it implies is `published * 93`, and that must equal CPU / period. If the
  // table were in APU cycles instead of CPU cycles every entry would come out
  // an octave low and index 0 would read 2405.6, which is the published index-1
  // value: the two tables are only consistent for one reading of the unit.
  const PUBLISHED = [4811.2, 2405.6, 1202.8, 601.4, 300.7, 200.5, 150.4, 120.3,
                     95.3, 75.8, 50.7, 37.9, 25.3, 18.9, 9.4, 4.7];
  assert.strictEqual(NOISE_PERIODS.length, PUBLISHED.length);
  for (let i = 0; i < 16; i++) {
    const got = CPU_HZ / (93 * NOISE_PERIODS[i]);
    assert.ok(Math.abs(got - PUBLISHED[i]) <= 0.1,
      `index ${i}: period ${NOISE_PERIODS[i]} gives ${got.toFixed(2)} Hz, `
      + `published ${PUBLISHED[i]} Hz`);
  }
});

test('the noise timer clocks the LFSR every NOISE_PERIODS[p] CPU cycles', () => {
  // Not a restatement of the table: this drives the whole chip and counts the
  // shifts that actually happened, so it fails if the timer is clocked at the
  // APU rate (every second CPU cycle) rather than the CPU rate.
  for (const p of [0, 4, 8, 12, 15]) {
    const a = raw();
    a.write(0x0E, p);
    let shifts = 0;
    const orig = a.noise.clockLfsr.bind(a.noise);
    a.noise.clockLfsr = () => { shifts++; orig(); };
    const cycles = 200000;
    a.run(cycles, false);
    const want = cycles / NOISE_PERIODS[p];
    assert.ok(Math.abs(shifts - want) <= 2,
      `index ${p}: ${shifts} shifts in ${cycles} cycles, want ${want.toFixed(1)}`);
  }
});

// ===========================================================================
// 3e. THE PULSE PERIOD
// ===========================================================================

test('a pulse channel sounds at CPU/(16*(t+1))', () => {
  for (const t of [0x40, 0x100, 0x2A0]) {
    const a = raw();
    startPulse1(a, { period: t });
    let edges = 0, last = a.p1.output() !== 0;
    const cycles = Math.round(CPU_HZ);
    a.p1.halt = true;                  // do not let the length counter expire
    for (let i = 0; i < cycles; i++) {
      a.run(1, false);
      const on = a.p1.output() !== 0;
      if (on && !last) edges++;
      last = on;
    }
    const want = CPU_HZ / (16 * (t + 1));
    assert.ok(Math.abs(edges - want) / want < 0.01,
      `period ${t}: ${edges} Hz measured, ${want.toFixed(1)} Hz wanted`);
  }
});

test('the four duty cycles are 12.5%, 25%, 50% and 25% inverted', () => {
  const ones = [];
  for (let d = 0; d < 4; d++) {
    let n = 0;
    for (let p = 0; p < 8; p++) n += DUTY[(d << 3) | p];
    ones.push(n);
  }
  assert.deepStrictEqual(ones, [1, 2, 4, 6]);
});

// ===========================================================================
// 3f. THE ENVELOPE
// ===========================================================================

test('the envelope reloads to 15 and steps down every (V+1) quarter frames', () => {
  const a = raw();
  a.write(0x00, 0x25);                 // duty 0, halt/loop set, ENVELOPE, V = 5
  a.write(0x01, 0x00);
  a.write(0x02, 0x00);
  a.write(0x03, 0x09);                 // period $100, length index 1
  assert.ok(a.p1.envStart);
  a.quarterFrame();
  assert.strictEqual(a.p1.envDecay, 15);
  for (let step = 15; step > 0; step--) {
    for (let i = 0; i < 6; i++) a.quarterFrame();     // V + 1 = 6
    assert.strictEqual(a.p1.envDecay, step - 1, `after ${16 - step} steps`);
  }
  // Loop flag set ($4000 bit 5), so it wraps back to 15 rather than staying 0.
  for (let i = 0; i < 6; i++) a.quarterFrame();
  assert.strictEqual(a.p1.envDecay, 15);
});

// ===========================================================================
// 3g. THE MIXER
// ===========================================================================

test('the mixer is the EXACT non-linear form, not the folded approximation', () => {
  assert.strictEqual(PULSE_MIX[0], 0);
  assert.strictEqual(TND_MIX[0], 0);
  for (let i = 1; i <= 30; i++) {
    assert.ok(PULSE_MIX[i] > PULSE_MIX[i - 1], `PULSE_MIX not monotonic at ${i}`);
  }
  // The two published closed forms, at their extremes, spelled as decimals so a
  // change to any constant is red. The triangle-only entry is the one that
  // separates the exact form from the widely copied lookup approximation: the
  // approximation folds the group into `3*tri + 2*noise` and gives
  // 163.67/(24329/45 + 100) = 0.255477 for triangle 15, noise 0, where the
  // exact form gives 0.246412. That is a 3.7% error on the loudest thing the
  // triangle ever does, which is audible as balance and not as a wrong note.
  assert.ok(Math.abs(PULSE_MIX[30] - 0.2584831) < 1e-6, `${PULSE_MIX[30]}`);
  assert.ok(Math.abs(TND_MIX[(15 << 4) | 15] - 0.3733293) < 1e-6);
  assert.ok(Math.abs(TND_MIX[(15 << 4) | 0] - 0.2464120) < 1e-6);
  assert.ok(Math.abs(TND_MIX[(0 << 4) | 15] - 0.1744305) < 1e-6);
  assert.ok(Math.abs(TND_MIX[(15 << 4) | 0] - 0.2554771) > 1e-3,
    'TND_MIX has become the folded 3*tri + 2*noise approximation');
  const peak = PULSE_MIX[30] + TND_MIX[(15 << 4) | 15];
  assert.ok(Math.abs(peak - 0.6318124) < 1e-6,
    `the mixer's ceiling is ${peak}, not the 0.6318124 the closed forms give`);
});

// ===========================================================================
// 3h. THE WHOLE STREAM -- no NaN, no clipping
// ===========================================================================

test('the real register stream produces no NaN and never clips', () => {
  const r = renderScript({ frames: 400, rate: RATE, res: headlessResources(0) });
  assert.strictEqual(r.nonFinite, 0);
  assert.ok(r.max <= 1 && r.min >= -1,
    `samples reached ${r.min} .. ${r.max}; the mixer's own ceiling is 0.632 and `
    + 'the output filters cannot double it');
  // ...and it is not silence, which would satisfy every assertion above.
  assert.ok(r.max > 0.02, `peak amplitude ${r.max} -- this is silence, not audio`);
});

// ===========================================================================
// 4. THE REFUSALS
// ===========================================================================

test('a DMC register write is a loud named throw, not a silent no-op', () => {
  for (const off of [0x10, 0x11, 0x12, 0x13]) {
    assert.throws(() => raw().write(off, 0x42), (e) => {
      assert.match(e.message, /DMC/);
      assert.match(e.message, /\$4015 = \$1F/);
      assert.match(e.message, new RegExp(`\\$40${off.toString(16).toUpperCase().padStart(2, '0')}`));
      return true;
    }, `$40${off.toString(16)} did not throw`);
  }
});

test('a 4-step $4017 write is a loud named throw', () => {
  assert.throws(() => raw().write(0x17, 0x00), /4-step/);
  assert.throws(() => raw().write(0x17, 0x40), /\$81B2/);
});

test('an offset outside $4000-$4017 is a throw', () => {
  assert.throws(() => raw().write(0x18, 0), /not an APU register/);
});

// ===========================================================================
// 5. THE OUTPUT PATH -- a burst of logic frames is not a burst of audio
// ===========================================================================

/** The smallest AudioContext src/audio/output.js touches. */
class FakeCtx {
  // The real constructor takes an options bag ({ latencyHint }), not a rate.
  constructor() {
    this.sampleRate = 48000; this.currentTime = 0;
    this.destination = {}; this.starts = []; this.gains = [];
  }
  createGain() { const g = { gain: { value: 1 }, connect() {}, disconnect() {} };
    this.gains.push(g); return g; }
  createBuffer(ch, len) { const d = new Float32Array(len);
    return { length: len, getChannelData: () => d }; }
  createBufferSource() {
    const self = this;
    return { buffer: null, connect() {}, start(t) { self.starts.push({ t, n: this.buffer.length }); } };
  }
  resume() {} close() { return Promise.resolve(); }
}

async function makeOut(rate = 48000) {
  const mod = await import('../src/audio/output.js');
  const a = new mod.GradiusAudio(() => {});
  globalThis.AudioContext = FakeCtx;
  a.arm();
  return { a, ctx: a.out.ctx };
}

test('eight logic frames in one callback become eight frames of CONTIGUOUS audio',
  async () => {
    const { a, ctx } = await makeOut();
    // The catch-up clamp in src/main.js is exactly this: up to 8 logic frames
    // in one animation-frame callback. If the audio path rendered on the game's
    // schedule they would all be scheduled at the same instant and overlap.
    for (let i = 0; i < 8; i++) a.frame([0x00, 0xBF, 0x02, 0x00, 0x03, 0x09]);
    a.pump();
    // Only as many chunks as the 0.12 s lookahead covers are scheduled now;
    // the rest stay in the synthesiser's buffer for the next pump. That is the
    // point -- the scheduler is paced by the AudioContext's clock, not by how
    // much the game handed over.
    assert.ok(ctx.starts.length >= 3 && ctx.starts.length <= 6,
      `${ctx.starts.length} chunks scheduled; 0.12 s of lookahead is 4 of them`);
    for (let i = 1; i < ctx.starts.length; i++) {
      const gap = ctx.starts[i].t - ctx.starts[i - 1].t;
      const want = ctx.starts[i - 1].n / ctx.sampleRate;
      assert.ok(Math.abs(gap - want) < 1e-9,
        `chunk ${i} starts ${gap}s after the previous one, not ${want}s -- the `
        + 'buffers overlap or leave a hole');
    }
    // 8 logic frames is 8/60.098814 s of audio, and that is what was queued.
    const scheduled = ctx.starts.reduce((n, s) => n + s.n, 0) + a.out.apu.outLen;
    const want = 8 * ctx.sampleRate / 60.098814;
    assert.ok(Math.abs(scheduled - want) < 4,
      `${scheduled} samples for 8 frames, want ${want.toFixed(0)}`);
  });

test('past the backlog ceiling the chip still advances -- only the samples go',
  async () => {
    const { a } = await makeOut();
    // Load a length counter that is NOT halted, so it counts down on the
    // hardware's own half frames -- i.e. it measures how much TIME the chip
    // thinks has passed, independently of how many samples came out.
    a.frame([0x00, 0x1F, 0x01, 0x00, 0x02, 0x00, 0x03, 0x09]);   // length 254
    a.pump();
    const startLen = a.out.apu.p1.length;
    assert.ok(startLen > 200);

    // 40 frames handed over at once: 15 are rendered, 25 are fast-forwarded.
    for (let i = 0; i < 40; i++) a.frame([]);
    a.pump();
    assert.ok(a.out.dropped > 0, 'nothing was dropped -- the valve did not open');
    // 41 frames at 96 half frames/s and 60.0988 frames/s = 65.5 half frames.
    const spent = startLen - a.out.apu.p1.length;
    assert.ok(spent >= 60 && spent <= 70,
      `the length counter moved ${spent} steps over 41 logic frames, want ~65 -- `
      + 'a dropped frame must cost audio time, never chip state');
  });

test('a throw inside the synthesiser stops the sound, not the game', async () => {
  const errs = [];
  const mod = await import('../src/audio/output.js');
  const a = new mod.GradiusAudio((e) => errs.push(e));
  globalThis.AudioContext = FakeCtx;
  a.arm();
  a.frame([0x10, 0x00]);                 // a DMC write: src/audio/apu.js throws
  a.pump();                              // must NOT throw out of here
  assert.equal(a.status, 'failed');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /DMC/);
  a.frame([0x00, 0xBF]);                 // and it is inert afterwards
  a.pump();
});
