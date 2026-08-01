// audiohash.mjs -- the CROSS-PROCESS determinism check for src/audio/apu.js.
//
//     node games/gradius/tools/audiohash.mjs [--frames N] [--rate HZ] [--json]
//
// It boots the port headlessly, plays a fixed button script, captures the
// $4000-$400F write stream the sound driver produces on every logic frame, runs
// that stream through the synthesiser, and prints a hash of the samples.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. It does NOT say the audio is correct --
// nothing in this repo can say that, because there is no reference this project
// is willing to treat as ground truth (see the header of src/audio/apu.js and
// games/ddpdoj/NOTES-sound.md). It says the synthesiser is a FUNCTION: the same
// register stream and the same sample rate give the same bits, in this process
// and in any other. tests/audio.test.js runs it twice and compares, and also
// compares it against the same computation done in-process, so a difference
// between "in a test runner" and "on its own" is caught too.
//
// It also re-derives `work.apuDigest` from the captured log on every frame and
// aborts if it ever disagrees. That is the bridge between wave 8's claim and
// this wave's: the digest is a TIER 1 compared field on all 42 scenarios, so
// if the bytes this tool feeds the synthesiser hash to the digest the corpus
// checked, they are the bytes the cartridge was measured writing.

import { createHash } from 'node:crypto';

import { introEntryState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { NesApu } from '../src/audio/apu.js';
import { headlessResources } from '../tests/helpers.js';
import { BTN } from '../src/state.js';

/**
 * A fixed button script: frame -> button mask. Held ranges, chosen so the run
 * makes the driver do more than idle -- firing pushes $EC1E requests through
 * the priority test, and moving keeps the camera advancing so $8369's cadence
 * fires. It is a CONSTANT: determinism means nothing if the input is not.
 */
export function scriptedButtons(f) {
  let b = 0;
  if (f >= 40 && f < 200) b |= BTN.RIGHT;
  if (f >= 90 && f < 260) b |= BTN.A;
  if (f >= 150 && f < 220) b |= BTN.UP;
  if (f >= 300 && f < 420) b |= BTN.A | BTN.DOWN;
  if (f >= 430 && f < 470) b |= BTN.LEFT;
  return b;
}

/**
 * Run the port for `frames` logic frames and render the audio.
 *
 * @returns {{hash:string, samples:number, writes:number, min:number, max:number,
 *            nonFinite:number, frames:number}}
 */
export function renderScript({ frames = 600, rate = 48000, res = null,
                               apuOpts = undefined } = {}) {
  const r = res || headlessResources(0);
  const state = introEntryState(r.manifest);
  const apu = new NesApu(rate, apuOpts);
  const h = createHash('sha256');
  let writes = 0, min = Infinity, max = -Infinity, nonFinite = 0, samples = 0;
  const scratch = new Float32Array(4096);
  const bytes = new Uint8Array(scratch.buffer);

  const drainInto = () => {
    while (apu.outLen > 0) {
      const n = apu.drain(scratch.length, scratch);
      for (let i = 0; i < n; i++) {
        const s = scratch[i];
        if (!Number.isFinite(s)) nonFinite++;
        else { if (s < min) min = s; if (s > max) max = s; }
      }
      // Hash the RAW IEEE-754 bits, not a rounded decimal. A hash of formatted
      // numbers would call two different sample streams equal at the 7th digit,
      // which is exactly the kind of "check that cannot fail" this repo counts.
      h.update(bytes.subarray(0, n * 4));
      samples += n;
    }
  };

  for (let f = 0; f < frames; f++) {
    nmi(state, scriptedButtons(f), r, false);
    const log = state.apuLog;
    // The bridge, re-derived per frame. src/sound.js's apu() computes the same
    // rolling hash over the same pairs; only offsets <= $0F are in it.
    let d = 0;
    for (let i = 0; i + 1 < log.length; i += 2) {
      if (log[i] <= 0x0F) d = (d * 31 + (log[i] << 8) + log[i + 1]) & 0xFFFF;
    }
    if (d !== state.work.apuDigest) {
      throw new Error(`audiohash: frame ${f}: the write log re-derives digest `
        + `${d} but src/sound.js recorded ${state.work.apuDigest}. The log and `
        + `the compared field have come apart -- the synthesiser would be eating `
        + `a stream the corpus never checked.`);
    }
    writes += log.length / 2;
    apu.frame(log);
    drainInto();
  }

  return {
    hash: h.digest('hex'), samples, writes, frames,
    min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max,
    nonFinite, rate,
  };
}

// Run as a script, not when tests/audio.test.js imports renderScript().
if (process.argv[1] && process.argv[1].endsWith('audiohash.mjs')) {
  const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i < 0 ? d : Number(process.argv[i + 1]);
  };
  const out = renderScript({ frames: arg('--frames', 600), rate: arg('--rate', 48000) });
  if (process.argv.includes('--json')) console.log(JSON.stringify(out));
  else {
    console.log(`frames    ${out.frames}`);
    console.log(`rate      ${out.rate} Hz`);
    console.log(`writes    ${out.writes}`);
    console.log(`samples   ${out.samples}`);
    console.log(`range     ${out.min.toFixed(6)} .. ${out.max.toFixed(6)}`);
    console.log(`nonFinite ${out.nonFinite}`);
    console.log(`sha256    ${out.hash}`);
  }
}
