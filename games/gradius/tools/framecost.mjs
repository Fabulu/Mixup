// framecost.mjs -- WHAT ONE LOGIC FRAME COSTS. The gate's only COST check.
//
//     node games/gradius/tools/framecost.mjs [--frames N] [--passes N]
//                                            [--json] [--csv]
//
// Exit code 1 if any stage is over budget. It is a gate, so it fails by itself;
// there is no --assert flag to forget.
//
// ================== WHY THIS FILE EXISTS =====================================
//
// docs/worklog/gradius/13-FINDING-input-granularity-under-load.md, in as many
// words: "Nobody has ever measured how long one logic frame takes in the
// browser. The gate measures CORRECTNESS, never COST. It is entirely possible
// the port now needs more than 16.6 ms per frame on a loaded machine, and no
// check in this repo would notice."
//
// That is a real hole and it is the same shape as docs/knowledge/02 trap 5 (a
// check outside the gate rots) with the check missing entirely. Fourteen waves
// of subsystems -- terrain, HUD, enemies, flow, death, weapons, power-ups, the
// sound driver, enemy bullets, the synthesiser -- have gone into one function
// and nothing has ever asked what it costs. A port can become unplayable while
// every scenario stays bit-exact.
//
// ================== THE BUDGET ===============================================
//
// 16.639 ms. NOT 16.6 and not 1000/60: game.json spells the frame rate once, as
// 60.098814 Hz, derived from the NTSC PPU clock (5369318.18 / 89341.5, the half
// cycle being the dot skipped on the pre-render line of odd frames). This file
// reads it from game.json rather than restating it, so there is still exactly
// one place the number lives.
//
// ================== WHAT IS TIMED, AND WHAT IS NOT ===========================
//
// Three stages, because they are paid on different clocks and a single number
// would hide which one moved:
//
//   logic   nmi()                      once per LOGIC frame  (k times a callback)
//   audio   NesApu.frame() + drain()   once per LOGIC frame  (wave 13)
//   video   renderFrame() + frameFor() once per ANIMATION frame (only the last
//                                      logic frame of a burst is ever drawn)
//
// `putImageData`, the canvas, the compositor and the browser's own input
// plumbing are NOT here and cannot be: this is node. So the numbers below are a
// LOWER BOUND on what a browser pays, and the honest claim they support is
// "the port's own code is not the thing eating the budget", never "the browser
// is fine". Say it that way round.
//
// ================== HOST LOAD, AND WHY THIS TAKES THE BEST PASS ==============
//
// Wave 13 measured a 2x spread on the same code and the same input depending on
// what else was running on the machine (13-impl-audio-output.md; the reviewer
// reproduced the spread and knocked 15% off the "stable ratio" claim). Several
// agents share this machine and each runs an emulator. A single-pass wall-clock
// number is therefore not reproducible and a gate built on one would flap.
//
// So: N passes, and the verdict is the pass with the LOWEST MEDIAN. The minimum
// over passes is the pass that got the most CPU, which is the closest thing to
// "what the code costs" that a shared machine can produce. Every pass is
// printed, so the spread is visible rather than averaged away.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { introEntryState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { NesApu } from '../src/audio/apu.js';
import { renderFrame, frameFor, W, H } from '../src/render/ppu.js';
import { headlessResources } from '../tests/helpers.js';
import { scriptedButtons } from './audiohash.mjs';

const GAME = dirname(dirname(fileURLToPath(import.meta.url)));

/** 16.639 ms, from game.json's 60.098814 Hz. Spelled once, there. */
export function frameBudgetMs() {
  const g = JSON.parse(readFileSync(join(GAME, 'game.json'), 'utf8'));
  return 1000 / g.display.frameHz;
}

// ---------------------------------------------------------------------------
// THE GATE'S THRESHOLDS, THE UNIT THEY ARE IN, AND THE MARGIN -- all stated.
//
// THE GATE READS THE MEDIAN, NOT p99 OR max. p99 and max here are dominated by
// the OS taking the process away, not by the code: three consecutive runs of
// this tool, byte-identical code and input, best of five passes each, gave
// video medians 2.538 / 3.240 / 3.275 ms and video p99s 5.515 / 6.957 / 6.783.
// The tail measures the host. Both are still PRINTED, because a tail that is
// growing deserves a human's attention -- they are just not what fails a build.
//
// THE GATE READS A RATIO, NOT MILLISECONDS, and that is the part worth arguing
// with. MEASURED, four CPU hogs against an otherwise identical run:
//
//                       quiet(ish)      4 busy cores     inflation
//     ref (kernel)       0.497 ms         1.054 ms          2.12x
//     video              3.402 ms         7.599 ms          2.23x
//     video / ref         6.55 - 6.85      7.19 - 7.34       1.08x
//
// An absolute millisecond limit tight enough to catch a regression is looser
// than the host's own 2x swing, so it either flaps or it is decoration. The
// ratio to a kernel timed in the same loop iteration moves 8% across the same
// load. THAT is a number a gate can hold. The absolute milliseconds and the
// percentage of the 16.639 ms budget are still printed on every run and are
// still what a human should read.
//
// The limits are in REFERENCE FRAMES (see `reference()` -- 61,440 table reads
// and 61,440 word stores, one screen's worth):
//
//   logic <= 1.0 ref    measured 0.12 - 0.14    ~7x margin
//   audio <= 8.0 ref    measured 2.13 - 4.02    ~2x margin
//   video <= 9.5 ref    measured 6.45 - 7.34    ~1.3x margin
//   sum   <= 15.0 ref   measured 8.70 - 11.3    ~1.3x margin
//
// TO CONVERT: one reference frame measured 0.497 ms on this machine at rest, so
// 9.5 ref is about 4.7 ms, about 28% of the frame budget, and the whole 15.0 is
// about 7.5 ms, about 45%. Those are the numbers to argue with; the ratio is
// just the robust way of measuring them.
//
// THE VIDEO AND TOTAL LIMITS ARE CALIBRATED AGAINST THE BROKEN CODE, not the
// fixed code, and sit between the two MEASURED distributions rather than being
// rounded up from the fixed one:
//
//                        wave-14 fix        before the fix
//     video / ref        6.45 - 7.34       12.55 - 13.27     limit 9.5
//     sum   / ref        8.70 - 11.3       16.35 - 17.24     limit 15.0
//
// (Three runs each, best of six passes of 400 frames, on a machine that ranged
// from 0.80x to 2.12x the at-rest reference across those runs.) A budget check
// whose limit sits above the cost of the very thing it was written for is a
// decoration; this one is red on the defect by 1.3x and green on the fix by
// 1.3x, which is as tight as a shared machine allows in either direction.
//
// THE MARGINS ARE THE WEAKNESS AND SAYING SO IS PART OF THE CHECK. 1.3x will
// not notice a 20% regression. It will notice the failure this stage was
// written for -- a stage that starts costing a MULTIPLE of what it did, which
// is exactly what had silently happened to the renderer while fourteen waves of
// bit-exact scenarios went past it.
export const LIMITS = Object.freeze({
  logic: 1.0,
  audio: 8.0,
  video: 9.5,
  total: 15.0,
});

/**
 * One reference frame, in milliseconds, MEASURED on an at-rest machine (node
 * 20.17, best of six passes of 400 frames). Used ONLY to turn the ratios above
 * back into milliseconds for the human-readable line -- never in the pass/fail
 * decision, which is unit-free on purpose.
 */
export const REF_MS_AT_REST = 0.497;

// ---------------------------------------------------------------------------
// THE REFERENCE KERNEL, and why a wall-clock gate needed one.
//
// A gate that flaps gets deleted. The first version of this file gated on
// wall-clock milliseconds and was MEASURED flapping: with the rest of
// tools/test-all.mjs running Mesen in another process, the video stage's median
// went from 2.481 ms to 4.603 ms -- 1.85x, for byte-identical code and
// byte-identical input, which is the same 2x host spread wave 13 recorded and
// the wave-13 reviewer reproduced. On a machine several agents share, an
// absolute millisecond threshold tight enough to catch a regression is loose
// enough to fail at random.
//
// So the gate is on a RATIO. `reference()` is a fixed, deterministic kernel with
// the same character as the renderer's inner loop -- a byte fetch out of a
// 128 KB table per output word, one frame's worth -- timed in the SAME pass, a
// few microseconds away from the stage it normalises. When the OS takes the CPU
// away it takes it away from both.
//
// The kernel must not be optimised into nothing, so it consumes its own output
// (`sink`) and its addresses depend on the previous iteration.
const REF_TABLE = (() => {
  const t = new Uint8Array(1 << 17);            // 128 KB, like assets/chr/tiles.u8
  let x = 0x1234567;
  for (let i = 0; i < t.length; i++) { x = (x * 1103515245 + 12345) | 0; t[i] = (x >>> 16) & 0xFF; }
  return t;
})();
const REF_OUT = new Uint32Array(W * H);

/**
 * One "reference frame" of work. 61,440 iterations, one table byte and one
 * 32-bit store each -- the shape of renderFrame()'s multiplex, without any of
 * its rules. Returns a checksum so nothing can be folded away.
 */
export function reference() {
  let a = 12345, sum = 0;
  for (let i = 0; i < W * H; i++) {
    a = (a + 40503) & 0x1FFFF;
    const v = REF_TABLE[a];
    REF_OUT[i] = v * 0x01010101;
    sum += v;
  }
  return sum;
}

/** Percentile of a SORTED array, nearest-rank. p in 0..1. */
export function pct(sorted, p) {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

function summarise(samples) {
  const s = Float64Array.from(samples).sort();
  return {
    n: s.length,
    min: s[0],
    median: pct(s, 0.5),
    p99: pct(s, 0.99),
    max: s[s.length - 1],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

/**
 * One pass: `frames` logic frames, timing each stage separately.
 *
 * `process.hrtime.bigint()` and not `performance.now()`: node's
 * performance.now() is a double of milliseconds and the logic stage is tens of
 * MICROseconds, which is inside the range where the double's resolution starts
 * to matter. hrtime is integer nanoseconds.
 *
 * The video stage is timed once per logic frame here, not once per animation
 * frame, so that its distribution has as many samples as the others. The caller
 * is told which is which; the per-ANIMATION-frame cost is one video sample, not
 * k of them, and the summary line says so.
 */
export function onePass({ frames, res, rate = 48000 }) {
  const state = introEntryState(res.manifest);
  const apu = new NesApu(rate);
  const px = new Uint32Array(W * H);
  const scratch = new Float32Array(4096);
  const logic = new Float64Array(frames);
  const audio = new Float64Array(frames);
  const video = new Float64Array(frames);
  const ref = new Float64Array(frames);
  let sink = 0;

  for (let f = 0; f < frames; f++) {
    const b = scriptedButtons(f);

    // The reference kernel goes FIRST and in the same iteration as the stages
    // it normalises, so a scheduler steal is as likely to land on it as on
    // them. Measured interleaved, not once at the top.
    let r0 = process.hrtime.bigint();
    sink += reference();
    ref[f] = Number(process.hrtime.bigint() - r0) / 1e6;

    let t0 = process.hrtime.bigint();
    nmi(state, b, res, false);
    let t1 = process.hrtime.bigint();
    logic[f] = Number(t1 - t0) / 1e6;

    t0 = process.hrtime.bigint();
    apu.frame(state.apuLog);
    // The drain is part of the cost: output.js copies the rendered samples out
    // on every pump, and a synthesiser whose samples are never removed is not
    // the one the page runs.
    while (apu.outLen > 0) sink += apu.drain(scratch.length, scratch);
    t1 = process.hrtime.bigint();
    audio[f] = Number(t1 - t0) / 1e6;

    t0 = process.hrtime.bigint();
    renderFrame(frameFor(state), res.tiles, px);
    t1 = process.hrtime.bigint();
    video[f] = Number(t1 - t0) / 1e6;
  }

  // Keep the optimiser honest: `px` and the drained samples are otherwise dead
  // stores and a JIT is entitled to notice.
  sink += px[0] | 0;
  return {
    logic: summarise(logic), audio: summarise(audio), video: summarise(video),
    ref: summarise(ref), frames, sink,
  };
}

/**
 * `passes` passes, verdict = the pass with the lowest logic median.
 *
 * The first pass is JIT warm-up and is REPORTED but never chosen (wave 13's
 * table shows pass 0 running 3-6x the cost of pass 4 for the same work). It is
 * printed because "the first second is the most expensive second" is one of the
 * two candidate explanations for the owner's report and hiding warm-up would
 * throw that evidence away.
 */
export function measure({ frames = 600, passes = 5, rate = 48000, res = null } = {}) {
  const r = res || headlessResources(0);
  const all = [];
  for (let p = 0; p < passes; p++) all.push(onePass({ frames, res: r, rate }));
  const usable = all.length > 1 ? all.slice(1) : all;
  let best = usable[0];
  for (const p of usable) if (p.logic.median < best.logic.median) best = p;
  return { passes: all, best, budget: frameBudgetMs(), frames };
}

/**
 * The per-frame time series of the BEST pass's logic stage, for the "is the
 * first second the most expensive second?" question. Returned separately
 * because it is 900 numbers and the summary is six.
 */
export function logicSeries({ frames = 900, res = null } = {}) {
  const r = res || headlessResources(0);
  onePass({ frames: 200, res: r });               // warm up, discard
  const state = introEntryState(r.manifest);
  const out = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const t0 = process.hrtime.bigint();
    nmi(state, scriptedButtons(f), r, false);
    out[f] = Number(process.hrtime.bigint() - t0) / 1e6;
  }
  return out;
}

/**
 * PASS/FAIL against LIMITS, on the BEST pass's MEDIAN expressed in REFERENCE
 * FRAMES. Returns the failures, empty if clean. `warn` is the same test at 80%
 * of each limit -- not a failure, but the line a human should read before it
 * becomes one -- plus one ABSOLUTE warning, because the ratio cannot by itself
 * notice a machine that is simply too slow to run the game.
 */
export function checkBudget(m) {
  const bad = [], warn = [];
  const refMs = m.best.ref.median;
  const ratio = (k) => m.best[k].median / refMs;
  for (const k of ['logic', 'audio', 'video']) {
    const lim = LIMITS[k];
    const v = ratio(k);
    if (!(v <= lim)) {
      bad.push(`${k} costs ${v.toFixed(2)} reference frames > ${lim.toFixed(1)} `
             + `(${m.best[k].median.toFixed(3)} ms measured against a `
             + `${refMs.toFixed(3)} ms reference)`);
    } else if (v > lim * 0.8) {
      warn.push(`${k} costs ${v.toFixed(2)} reference frames, past 80% of its `
              + `${lim.toFixed(1)} limit`);
    }
  }
  const sum = ratio('logic') + ratio('audio') + ratio('video');
  if (!(sum <= LIMITS.total)) {
    bad.push(`logic+audio+video cost ${sum.toFixed(2)} reference frames > `
           + `${LIMITS.total.toFixed(1)}`);
  } else if (sum > LIMITS.total * 0.8) {
    warn.push(`the three stages sum to ${sum.toFixed(2)} reference frames, past `
            + `80% of ${LIMITS.total.toFixed(1)}`);
  }
  // The absolute check, as a WARNING and not a failure: on a machine this loaded
  // the milliseconds are the host's number, not the port's, and failing on them
  // is what made the first version of this gate flap. But a run where the three
  // stages really do not fit in a frame is worth saying out loud, because that
  // is what the player experiences whatever the cause.
  const ms = m.best.logic.median + m.best.audio.median + m.best.video.median;
  if (ms > m.budget) {
    warn.push(`the three stages measured ${ms.toFixed(2)} ms, OVER the `
            + `${m.budget.toFixed(3)} ms frame budget. Not a failure here -- the `
            + `reference kernel also measured ${refMs.toFixed(3)} ms against `
            + `${REF_MS_AT_REST} at rest, so this machine is ~`
            + `${(refMs / REF_MS_AT_REST).toFixed(1)}x loaded -- but if the `
            + `reference is near ${REF_MS_AT_REST}, the port does not fit.`);
  }
  bad.warn = warn;
  return bad;
}

function fmt(s, budget, limit, refMs) {
  const r = s.median / refMs;
  return `${s.min.toFixed(3)}  ${s.median.toFixed(3)}  ${s.p99.toFixed(3)}  `
       + `${s.max.toFixed(3)}  ${(((s.median / budget) * 100).toFixed(2) + '%').padStart(7)}`
       + `   ${r.toFixed(2).padStart(5)} / ${limit.toFixed(1)} ref  `
       + `(headroom ${(limit / r).toFixed(1)}x)`;
}

if (process.argv[1] && process.argv[1].endsWith('framecost.mjs')) {
  const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i < 0 ? d : Number(process.argv[i + 1]);
  };
  const frames = arg('--frames', 600);
  const m = measure({ frames, passes: arg('--passes', 5) });

  if (process.argv.includes('--csv')) {
    const s = logicSeries({ frames });
    console.log('frame,logic_ms');
    for (let i = 0; i < s.length; i++) console.log(`${i},${s[i].toFixed(6)}`);
    process.exit(0);
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ budget: m.budget, frames, best: m.best,
                                 failures: checkBudget(m) }));
    process.exit(checkBudget(m).length ? 1 : 0);
  }

  console.log(`frames per pass   ${frames}`);
  console.log(`budget            ${m.budget.toFixed(3)} ms  `
            + `(game.json display.frameHz)`);
  console.log('');
  console.log('per pass, logic median (pass 0 is JIT warm-up and is never chosen):');
  m.passes.forEach((p, i) => {
    console.log(`  pass ${i}   logic ${p.logic.median.toFixed(4)}   `
              + `audio ${p.audio.median.toFixed(4)}   video ${p.video.median.toFixed(4)}   `
              + `ref ${p.ref.median.toFixed(4)}  ms   `
              + `[video/ref ${(p.video.median / p.ref.median).toFixed(3)}]`);
  });
  console.log('');
  const refMs = m.best.ref.median;
  console.log('BEST PASS                min   median      p99      max  of budget'
            + '     cost / limit');
  console.log(`  logic  nmi()        ${fmt(m.best.logic, m.budget, LIMITS.logic, refMs)}`);
  console.log(`  audio  apu+drain    ${fmt(m.best.audio, m.budget, LIMITS.audio, refMs)}`);
  console.log(`  video  renderFrame  ${fmt(m.best.video, m.budget, LIMITS.video, refMs)}`);
  const sum = m.best.logic.median + m.best.audio.median + m.best.video.median;
  console.log(`  ref    kernel       ${m.best.ref.min.toFixed(3)}  `
            + `${refMs.toFixed(3)}  ${m.best.ref.p99.toFixed(3)}  `
            + `${m.best.ref.max.toFixed(3)}           `
            + `1 reference frame; ${REF_MS_AT_REST} ms at rest `
            + `-> this host is ${(refMs / REF_MS_AT_REST).toFixed(2)}x loaded`);
  console.log(`  ---- medians sum ${sum.toFixed(3)} ms = `
            + `${((sum / m.budget) * 100).toFixed(1)}% of the ${m.budget.toFixed(3)} ms budget, `
            + `= ${(sum / refMs).toFixed(2)} / ${LIMITS.total.toFixed(1)} ref`);
  console.log('  ---- THE GATE READS THE RATIO. Milliseconds on a shared machine');
  console.log('       measure the host: the reference kernel is timed in the same');
  console.log('       loop iteration so a scheduler steal hits both. p99 and max');
  console.log('       are diagnostic only.');
  console.log('');
  const bad = checkBudget(m);
  for (const w of bad.warn) console.log(`  WARN: ${w}`);
  if (bad.length) {
    console.log('OVER BUDGET:');
    for (const b of bad) console.log(`  ${b}`);
  } else {
    console.log(`within budget: logic <= ${LIMITS.logic}, audio <= ${LIMITS.audio}, `
              + `video <= ${LIMITS.video}, sum <= ${LIMITS.total} reference frames`);
  }
  console.log('');
  console.log('This is node, not a browser. putImageData, the compositor and the');
  console.log('browser input plumbing are not here, so these are a LOWER BOUND on');
  console.log('what a browser pays.');
  process.exit(bad.length ? 1 : 0);
}
