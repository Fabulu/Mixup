// THE AUDIO OUTPUT PATH -- now a thin wrapper over the shared Web Audio shim.
//
// Wave F (docs/worklog/ddpdoj/135-sound-architect-plan.md section 2): the chip-
// agnostic core of this file (the queue, the pump, the backlog valve, the
// underrun resync, autoplay/unlock, mute-keeps-running, the try/catch firewall,
// stats) was lifted into shared/audio.js so the Dai-Ou-Jou ICS2115 port can
// adopt it without rewriting host plumbing. What stays HERE is the one thing
// that is Gradius-specific: the NES APU chip, built and presented through the
// shared `makeChip(rate)` contract.
//
// ================== AUDIO TIMING IS THE INPUT-GRANULARITY PROBLEM ============
//
// That problem and its solution are unchanged and live in shared/audio.js now:
// the frame loop hands this shim one batch of register writes per LOGIC FRAME,
// those batches go into a queue, and `pump()` turns them into samples scheduled
// contiguously on the AudioContext's own clock. A burst of eight frames becomes
// eight queued batches and 133 ms of audio played over 133 ms. Nothing here
// ever calls back into game logic, and no game-visible value depends on the
// audio clock or on the sample rate.
//
// ============================== WHY THIS IS THIN ============================
//
// `sourceRate` is set to `ctx.sampleRate`, so the shared shim's resampler (the
// one new primitive, there for DOJ's ~33.8 kHz chip) is a complete no-op for
// Gradius: the engine takes its same-rate fast path and drains straight into
// each AudioBuffer, exactly as it did before the lift. `channels` is 1: Gradius
// is mono end-to-end. The Gradius audio path is functionally UNCHANGED; it just
// goes through shared/audio.js instead of its own private copy.

import { NesApu } from './apu.js';
import { AudioController } from '../../../../shared/audio.js';

/**
 * Build the NES APU chip and present it through the shared interface:
 *   frame(log, emit)   apply one logic frame's [off,val,...] writes; emit=false
 *                      discards samples but still advances state (the valve)
 *   drain(n, dests)    move n mono samples into dests[0]
 *   outLen             samples currently buffered
 *   sourceRate         === ctx.sampleRate, so the resampler is bypassed
 *   channels           1 (mono)
 *
 * The raw `apu` is carried alongside for tests and debug (the gate's audio test
 * reaches into the chip's own `outLen` and `p1.length`, which is fine: that
 * test is Gradius-specific and knows its chip is a NesApu).
 */
function makeChip(rate) {
  const apu = new NesApu(rate);
  return {
    apu,
    sourceRate: rate,
    channels: 1,
    frame: (log, emit) => apu.frame(log, emit),
    drain: (n, dests) => apu.drain(n, dests[0]),
    get outLen() { return apu.outLen; },
  };
}

/**
 * The controller the page holds. A direct subclass of the shared
 * AudioController; only the chip factory is Gradius-specific.
 *
 * ============================ AUTOPLAY POLICY ===============================
 *
 * Inherited verbatim from shared/audio.js: this object starts `locked` and the
 * AudioContext IS NOT CREATED AT ALL until `arm()` is called from inside a
 * gesture handler. Until then `frame()` drops its batches rather than queueing
 * them. The page says so in words (index.html: "Sound starts on your first key
 * or tap") and the status line reads `locked` until it happens. THE GAME RUNS
 * REGARDLESS -- audio never gates the simulation.
 */
export class GradiusAudio extends AudioController {
  /** @param {(e:Error)=>void} [onError] */
  constructor(onError) {
    super(makeChip, onError);
  }
}
