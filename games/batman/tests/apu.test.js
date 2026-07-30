// DMG audio hardware model.
//
// Unlike the rest of the port this is not a translation of ROM code -- it is
// the chip the code writes to. So it is checked against the hardware's
// documented behaviour and against measurable output, not against a trace.

import test from 'node:test';
import assert from 'node:assert/strict';

import { APU, CPU_HZ } from '../src/sound/apu.js';

const RATE = 48000;

function powered() {
  const a = new APU(RATE);
  a.write(0xFF26, 0x80);      // power on
  a.write(0xFF24, 0x77);      // both sides at full
  a.write(0xFF25, 0xFF);      // everything to both sides
  return a;
}

function render(a, samples) {
  const l = new Float32Array(samples);
  const r = new Float32Array(samples);
  a.render(l, r, samples);
  return { l, r };
}

/** Count 0 <-> non-0 transitions, which is 2x the cycle count. */
function transitions(buf) {
  let n = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i - 1] > 1e-6) !== (buf[i] > 1e-6)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// pitch
// ---------------------------------------------------------------------------

test('a square channel plays the frequency its registers ask for', () => {
  // Hardware: 131072 / (2048 - freq) Hz. A wrong divisor here would put the
  // whole soundtrack in the wrong key, which is easy to miss by ear.
  for (const want of [220, 440, 880]) {
    const freq = Math.round(2048 - 131072 / want);
    const a = powered();
    a.write(0xFF16, 0x80);                       // 50% duty
    a.write(0xFF17, 0xF0);                       // full volume, no envelope
    a.write(0xFF18, freq & 0xFF);
    a.write(0xFF19, 0x80 | (freq >> 8));         // trigger

    const { l } = render(a, RATE / 10);          // 0.1 s
    const hz = transitions(l) / 2 / 0.1;
    assert.ok(Math.abs(hz - want) < want * 0.05,
              `wanted ~${want} Hz, measured ${hz.toFixed(1)}`);
  }
});

test('the wave channel runs an octave below a square at the same divisor', () => {
  // Its timer period is (2048 - freq) * 2 rather than * 4.
  const freq = 1750;
  const a = powered();
  for (let i = 0; i < 16; i++) a.write(0xFF30 + i, i < 8 ? 0xFF : 0x00);
  a.write(0xFF1A, 0x80);                         // DAC on
  a.write(0xFF1C, 0x20);                         // full volume
  a.write(0xFF1D, freq & 0xFF);
  a.write(0xFF1E, 0x80 | (freq >> 8));

  // The timer is twice as fast but a full waveform takes 32 steps rather than
  // 8, so the note comes out an octave DOWN: 65536 / (2048 - freq).
  const { l } = render(a, RATE / 10);
  const hz = transitions(l) / 2 / 0.1;
  const want = 65536 / (2048 - freq);
  assert.ok(Math.abs(hz - want) < want * 0.1,
            `wanted ~${want.toFixed(0)} Hz, measured ${hz.toFixed(1)}`);
});

// ---------------------------------------------------------------------------
// gating
// ---------------------------------------------------------------------------

test('a channel is silent until it is triggered', () => {
  const a = powered();
  a.write(0xFF16, 0x80);
  a.write(0xFF17, 0xF0);
  a.write(0xFF18, 0x00);
  a.write(0xFF19, 0x07);                         // frequency set, NO trigger
  const { l } = render(a, 2000);
  assert.equal(Math.max(...l), 0);
});

test('clearing the envelope volume bits kills the DAC', () => {
  // NR12 & $F8 == 0 disables the channel outright -- this is how the driver
  // silences a voice without touching the trigger.
  const a = powered();
  a.write(0xFF16, 0x80);
  a.write(0xFF17, 0xF0);
  a.write(0xFF18, 0x00);
  a.write(0xFF19, 0x87);
  assert.ok(Math.max(...render(a, 2000).l) > 0);

  a.write(0xFF17, 0x00);
  assert.equal(Math.max(...render(a, 2000).l), 0);
});

test('powering the APU down silences and resets everything', () => {
  const a = powered();
  a.write(0xFF16, 0x80);
  a.write(0xFF17, 0xF0);
  a.write(0xFF18, 0x00);
  a.write(0xFF19, 0x87);
  assert.ok(Math.max(...render(a, 2000).l) > 0);

  a.write(0xFF26, 0x00);
  assert.equal(Math.max(...render(a, 2000).l), 0);
  // And control writes are ignored until it comes back up.
  a.write(0xFF25, 0xFF);
  assert.equal(a.panning, 0);
});

// ---------------------------------------------------------------------------
// envelope, length, panning
// ---------------------------------------------------------------------------

test('a decreasing envelope fades the channel to nothing', () => {
  // The envelope clock is 64 Hz, so period 1 takes 15/64 s to reach zero.
  const a = powered();
  a.write(0xFF16, 0x80);
  a.write(0xFF17, 0xF1);                         // volume 15, decrease, period 1
  a.write(0xFF18, 0x00);
  a.write(0xFF19, 0x87);

  const early = Math.max(...render(a, RATE / 100).l);
  render(a, RATE / 2);                           // well past 15/64 s
  const late = Math.max(...render(a, RATE / 100).l);
  assert.ok(early > 0);
  assert.equal(late, 0, 'faded out');
});

test('the length counter stops the channel when enabled', () => {
  // Length ticks at 256 Hz, so a counter of 1 lasts about 4 ms.
  const a = powered();
  a.write(0xFF16, 0xBF);                         // duty 50%, length 63 -> 1 step
  a.write(0xFF17, 0xF0);
  a.write(0xFF18, 0x00);
  a.write(0xFF19, 0xC7);                         // trigger WITH length enable
  render(a, RATE / 20);
  assert.equal(Math.max(...render(a, 2000).l), 0);
});

test('panning routes a channel to one side only', () => {
  const a = powered();
  a.write(0xFF25, 0x02);                         // channel 2: right only
  a.write(0xFF16, 0x80);
  a.write(0xFF17, 0xF0);
  a.write(0xFF18, 0x00);
  a.write(0xFF19, 0x87);
  const { l, r } = render(a, 4000);
  assert.equal(Math.max(...l), 0);
  assert.ok(Math.max(...r) > 0);
});

// ---------------------------------------------------------------------------
// noise
// ---------------------------------------------------------------------------

test('the noise channel is pseudo-random, and width mode shortens the period', () => {
  const run = (nr43) => {
    const a = powered();
    a.write(0xFF20, 0x00);
    a.write(0xFF21, 0xF0);
    a.write(0xFF22, nr43);
    a.write(0xFF23, 0x80);
    return render(a, 8000).l;
  };

  const wide = run(0x30);
  let high = 0;
  for (const v of wide) if (v > 0) high++;
  assert.ok(high > 2000 && high < 6000, `expected a rough coin flip, got ${high}/8000`);

  // Width mode feeds bit 6 as well, giving a 127-step loop instead of 32767 --
  // audibly a tone rather than a hiss.
  const narrow = run(0x38);
  assert.notDeepEqual(Array.from(narrow.slice(0, 200)),
                      Array.from(wide.slice(0, 200)));
});

// ---------------------------------------------------------------------------
// housekeeping
// ---------------------------------------------------------------------------

test('output stays inside the float range with everything at full', () => {
  const a = powered();
  a.write(0xFF11, 0x80); a.write(0xFF12, 0xF0);
  a.write(0xFF13, 0x00); a.write(0xFF14, 0x87);
  a.write(0xFF16, 0x80); a.write(0xFF17, 0xF0);
  a.write(0xFF18, 0x00); a.write(0xFF19, 0x87);
  for (let i = 0; i < 16; i++) a.write(0xFF30 + i, 0xFF);
  a.write(0xFF1A, 0x80); a.write(0xFF1C, 0x20);
  a.write(0xFF1D, 0x00); a.write(0xFF1E, 0x87);
  a.write(0xFF20, 0x00); a.write(0xFF21, 0xF0);
  a.write(0xFF22, 0x00); a.write(0xFF23, 0x80);

  const { l, r } = render(a, 8000);
  for (const buf of [l, r]) {
    for (const v of buf) assert.ok(v >= -1 && v <= 1, `sample out of range: ${v}`);
  }
});

test('the sample rate does not change the pitch', () => {
  const freq = 1750;
  const hzAt = (rate) => {
    const a = new APU(rate);
    a.write(0xFF26, 0x80); a.write(0xFF24, 0x77); a.write(0xFF25, 0xFF);
    a.write(0xFF16, 0x80); a.write(0xFF17, 0xF0);
    a.write(0xFF18, freq & 0xFF); a.write(0xFF19, 0x80 | (freq >> 8));
    const l = new Float32Array(rate / 10);
    a.render(l, new Float32Array(rate / 10), rate / 10);
    return transitions(l) / 2 / 0.1;
  };
  const a = hzAt(48000), b = hzAt(44100);
  assert.ok(Math.abs(a - b) < a * 0.05, `${a} vs ${b}`);
});

test('CPU_HZ is the real Game Boy clock', () => {
  assert.equal(CPU_HZ, 4194304);
});
