// THE SHARED WEB AUDIO OUTPUT SHIM.
//
// Lifted from games/gradius/src/audio/output.js (W13, proven), generalised so
// the Dai-Ou-Jou ICS2115 port (W135 Wave E) can adopt it without rewriting the
// host plumbing. Gradius is the proof: its gate stays green through this file.
//
// ============================ WHAT IS CHIP-AGNOSTIC =========================
//
// Everything that solves the INPUT-GRANULARITY PROBLEM is here, and none of it
// knows what a NES APU or an ICS2115 is:
//
//   * the per-logic-frame queue and the AudioContext-clock pump -- a burst of
//     eight logic frames in one rAF callback becomes eight queued batches and
//     ~133 ms of audio played over 133 ms, never eight frames of music delivered
//     at once (games/gradius/docs/worklog/13-FINDING-input-granularity-under-load.md);
//   * the backlog valve -- past MAX_BACKLOG_FRAMES the batch still APPLIES to
//     chip state but its samples are discarded, so the music skips rather than
//     drifts, and a dropped frame costs audio time, never correctness;
//   * the underrun resync, mute-keeps-synth-running, pump-after-the-picture
//     ordering, try/catch firewall, and the numbers-for-the-status-line stats.
//
// AND IT NEVER RUNS THE OTHER WAY. Nothing here calls back into game logic, and
// no game-visible value depends on the audio clock or on the sample rate. That
// is games/ddpdoj/NOTES-replay.md's constraint 1, and it is the same counted-
// not-timed rule the frame loop follows.
//
// ============================ THE CHIP CONTRACT =============================
//
// The chip is INJECTED via a factory and must conform to:
//
//   frame(log, emit)   apply one logic frame's flat [off,val,off,val,...] writes;
//                      emit=false advances state but discards samples (the valve)
//   drain(n, dests)    move up to n samples per channel into dests, an array of
//                      `channels` Float32Arrays (filled in place). Returns the
//                      count moved (same for every channel).
//   outLen             samples currently available, per channel
//   sourceRate         the rate the chip synthesises at (may differ from the
//                      AudioContext rate; the resampler bridges the gap)
//   channels           1 (mono) or 2 (stereo)
//
// Gradius sets sourceRate = ctx.sampleRate (resampler is a no-op) and
// channels = 1. DOJ will set sourceRate ~= 33.8 kHz and channels = 2.

/**
 * How far ahead of the AudioContext's clock we keep audio scheduled. Big enough
 * that an ordinary rAF gap (16.7 ms) or a small GC pause cannot open a hole,
 * small enough that a mute or a pause is not heard three chunks later.
 */
export const LOOKAHEAD_S = 0.12;

/** One scheduled AudioBuffer, in samples. 1024 @ 48 kHz = 21.3 ms. */
export const CHUNK = 1024;

/** The delay between arming and the first sample. One chunk plus a chunk of slack. */
export const START_LATENCY_S = 0.05;

/**
 * The backlog ceiling, in LOGIC FRAMES. 15 frames = 250 ms; anything past that
 * is a real stall (a backgrounded tab, a long GC) rather than rAF jitter.
 */
export const MAX_BACKLOG_FRAMES = 15;

/**
 * Master volume. Gradius's mixer ceiling is 0.63 (see apu.js), so this is
 * headroom. DOJ's 32-voice sum is caught by the limiter before it can clip.
 */
export const MASTER_GAIN = 0.8;

/** One shared empty batch, so an idle frame costs no allocation. */
const EMPTY = new Uint8Array(0);

// ---------------------------------------------------------------------------
// THE CUBIC HERMITE RESAMPLER -- the one primitive Gradius does not have.
//
// DOJ's chip runs at ~33.8 kHz; browsers run at 44.1 or 48 kHz. The synth hands
// the shim samples at sourceRate; the shim must hand the AudioContext samples at
// ctx.sampleRate. This is a streaming resampler: it is fed source samples across
// many pumps and emits dest samples across many CHUNK-sized AudioBuffers, with
// the fractional read position and a 4-sample window carried between calls.
//
// Cubic Hermite is the plan's recommendation ("linear acceptable for a first
// cut"). The 4-point, 3rd-order form below needs samples at i-1, i, i+1, i+2 and
// interpolates between i and i+1 at fraction t in [0,1). At t=0 it returns the
// sample at i exactly, so a same-rate feed is bit-faithful through it too (the
// engine bypasses it entirely when sourceRate === ctx.sampleRate, but the
// property keeps the resampler's own tests honest).
// ---------------------------------------------------------------------------

/** 4-point, 3rd-order Hermite interpolation. t in [0,1); returns the value at i. */
function hermite(xm1, x0, x1, x2, t) {
  const c1 = 0.5 * (x1 - xm1);
  const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
  const c3 = 1.5 * (x0 - x1) + 0.5 * (x2 - xm1);
  return ((c3 * t + c2) * t + c1) * t + x0;
}

/**
 * A streaming cubic resampler for `channels` independent channels sharing one
 * source/dest rate pair. Feed it source samples with `push`; pull dest samples
 * with `drainOutput`. State (the input window, the fractional read position, and
 * the output accumulator) carries across calls, so audio scheduled in fixed
 * CHUNK buffers stays seamless at the seams.
 */
export class Resampler {
  /**
   * @param {number} sourceRate
   * @param {number} destRate
   * @param {number} channels  1 or 2
   */
  constructor(sourceRate, destRate, channels) {
    if (!(sourceRate > 0)) throw new Error(`Resampler: bad sourceRate ${sourceRate}`);
    if (!(destRate > 0)) throw new Error(`Resampler: bad destRate ${destRate}`);
    if (!(channels === 1 || channels === 2)) throw new Error(`Resampler: bad channels ${channels}`);
    this.sourceRate = sourceRate;
    this.destRate = destRate;
    this.channels = channels;
    this.ratio = sourceRate / destRate;   // source samples advanced per dest sample
    // Per-channel input window. For cubic we read win[i-1..i+2], so the first
    // emit needs 4 samples in the window and a read position of 1 (so i-1 = 0).
    this._win = [];
    this._out = [];
    for (let c = 0; c < channels; c++) {
      this._win.push(new Float32Array(32));
      this._out.push(new Float32Array(4096));
    }
    this._winLen = 0;     // samples held in every window (shared across channels)
    this._pos = 0;        // fractional read position; valid reads start at _pos >= 1
    this._ready = false;  // becomes true once 4 source samples are in hand
    this.outLen = 0;      // dest samples available in every output buffer
  }

  /** Append `nIn` source samples per channel, emit as many dest samples as fit. */
  push(inBufs, nIn) {
    if (nIn <= 0) return;
    // Grow the windows if needed.
    const need = this._winLen + nIn;
    if (need > this._win[0].length) {
      for (let c = 0; c < this.channels; c++) {
        let cap = this._win[c].length;
        while (cap < need) cap *= 2;
        if (cap !== this._win[c].length) {
          const b = new Float32Array(cap);
          b.set(this._win[c].subarray(0, this._winLen));
          this._win[c] = b;
        }
      }
    }
    for (let c = 0; c < this.channels; c++) {
      this._win[c].set(inBufs[c].subarray(0, nIn), this._winLen);
    }
    this._winLen += nIn;

    if (!this._ready) {
      if (this._winLen < 4) return;     // not enough to interpolate yet
      this._pos = 1;                    // first read at i=1 so win[i-1]=win[0] is valid
      this._ready = true;
    }

    const r = this.ratio;
    let pos = this._pos;
    let written = 0;
    for (;;) {
      const i = pos | 0;                // floor
      if (i + 2 >= this._winLen) break; // need win[i+2] in bounds; otherwise wait
      const f = pos - i;
      // Ensure output capacity for the next write (index outLen + written).
      const writeIdx = this.outLen + written;
      if (writeIdx >= this._out[0].length) {
        for (let c = 0; c < this.channels; c++) {
          const b = new Float32Array(this._out[c].length * 2);
          b.set(this._out[c].subarray(0, writeIdx));
          this._out[c] = b;
        }
      }
      for (let c = 0; c < this.channels; c++) {
        const w = this._win[c];
        this._out[c][writeIdx] = hermite(w[i - 1], w[i], w[i + 1], w[i + 2], f);
      }
      written++;
      pos += r;
    }
    this.outLen += written;
    this._pos = pos;

    // Consume from the front: keep win[floor(pos)-1 .. winLen-1] so the next
    // read (at floor(pos), needing floor(pos)-1) stays valid after the shift.
    const consume = (this._pos | 0) - 1;
    if (consume > 0) {
      for (let c = 0; c < this.channels; c++) {
        this._win[c].copyWithin(0, consume, this._winLen);
      }
      this._winLen -= consume;
      this._pos -= consume;
    }
  }

  /**
   * Move up to `n` dest samples per channel into `dests` (an array of
   * `channels` Float32Arrays). Returns the count moved.
   */
  drainOutput(n, dests) {
    const k = Math.min(n, this.outLen);
    if (k <= 0) return 0;
    for (let c = 0; c < this.channels; c++) {
      dests[c].set(this._out[c].subarray(0, k));
      this._out[c].copyWithin(0, k, this.outLen);
    }
    this.outLen -= k;
    return k;
  }
}

// ---------------------------------------------------------------------------
// THE ENGINE -- chip-agnostic host plumbing.
// ---------------------------------------------------------------------------

/**
 * @param {AudioContext} ctx
 * @param {(rate:number)=>object} makeChip  builds the chip at ctx.sampleRate
 */
export class AudioOut {
  constructor(ctx, makeChip) {
    this.ctx = ctx;
    this.chip = makeChip(ctx.sampleRate);
    if (!this.chip || typeof this.chip.frame !== 'function'
        || typeof this.chip.drain !== 'function') {
      throw new Error('AudioOut: makeChip must return { frame, drain, outLen, '
        + 'sourceRate, channels }');
    }

    this.gain = ctx.createGain();
    this.gain.gain.value = MASTER_GAIN;

    // FINAL LIMITITER. Transparent below 0 dBFS: with a hard knee and threshold
    // at 0 dB, the compressor applies zero gain reduction to anything under
    // 1.0, so Gradius (peaks at 0.5) is bit-identical through it and its
    // deterministic hash is unaffected regardless. It exists for the
    // many-voice case: DOJ's 32-voice sum can exceed [-1,1], and a near-brick-
    // wall at 0 dB is the gentlest thing that keeps that from clipping hard.
    // Created ONLY when the host supports it, so a minimal fake context (and the
    // unit tests) wire gain -> destination exactly as Gradius did before.
    this.limiter = null;
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = 0;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.003;
      lim.release.value = 0.25;
      this.limiter = lim;
      this.gain.connect(lim);
      lim.connect(ctx.destination);
    } else {
      this.gain.connect(ctx.destination);
    }

    /** Queued logic frames, oldest first. One entry per frame, empty ones too. */
    this.queue = [];
    this.nextTime = -1;          // -1 = nothing scheduled yet
    this.underruns = 0;
    this.dropped = 0;
    this.frames = 0;
    /** Lazily built, only when sourceRate !== ctx.sampleRate. */
    this.resampler = null;
    /** Reused source-side temp buffers for the resample path. */
    this._src = null;
  }

  /**
   * One logic frame's register writes. Copied, because the caller's log buffer
   * (e.g. `state.apuLog`) is reused by the very next frame.
   */
  frame(log) {
    this.queue.push(log && log.length ? Uint8Array.from(log) : EMPTY);
    this.frames++;
  }

  /** Called once per animation frame, after the catch-up loop has run. */
  pump() {
    const ctx = this.ctx;
    const chip = this.chip;

    // ---- 1. queued logic frames -> chip ------------------------------------
    while (this.queue.length) {
      // THE BACKLOG VALVE. Past the ceiling the batch is still applied (the
      // chip's state must not be allowed to diverge from the driver's) but its
      // samples are discarded.
      const emit = this.queue.length <= MAX_BACKLOG_FRAMES;
      if (!emit) this.dropped++;
      chip.frame(this.queue.shift(), emit);
    }

    // ---- 2. resync against the AudioContext clock --------------------------
    if (this.nextTime < 0) this.nextTime = ctx.currentTime + START_LATENCY_S;
    else if (this.nextTime < ctx.currentTime) {
      // We ran dry: the main thread did not get back here before the last
      // scheduled chunk finished. Resync rather than schedule in the past,
      // where start() would play the chunk immediately and overlap the next.
      this.underruns++;
      this.nextTime = ctx.currentTime + START_LATENCY_S;
    }

    // ---- 3. drain -> (resample) -> schedule --------------------------------
    if (chip.sourceRate === ctx.sampleRate) {
      this._pumpDirect();
    } else {
      this._pumpResampled();
    }
  }

  /** Same-rate fast path: drain straight into each AudioBuffer, no resampler. */
  _pumpDirect() {
    const ctx = this.ctx;
    const chip = this.chip;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S && chip.outLen >= CHUNK) {
      const buf = ctx.createBuffer(chip.channels, CHUNK, ctx.sampleRate);
      const dests = new Array(chip.channels);
      for (let c = 0; c < chip.channels; c++) dests[c] = buf.getChannelData(c);
      chip.drain(CHUNK, dests);
      this._schedule(buf);
    }
  }

  /** Different-rate path: drain source samples, resample, schedule CHUNKs. */
  _pumpResampled() {
    const ctx = this.ctx;
    const chip = this.chip;
    if (!this.resampler) {
      this.resampler = new Resampler(chip.sourceRate, ctx.sampleRate, chip.channels);
    }
    const res = this.resampler;

    // Drain ALL available source samples into reused temp buffers and feed the
    // resampler, which accumulates output across pumps. This sidesteps the
    // "produce exactly CHUNK per chunk" problem: the resampler owns the output
    // count and we just schedule whole CHUNKs from whatever it has ready.
    const nSrc = chip.outLen;
    if (nSrc > 0) {
      if (!this._src || this._src[0].length < nSrc) {
        this._src = new Array(chip.channels);
        for (let c = 0; c < chip.channels; c++) this._src[c] = new Float32Array(nSrc);
      }
      chip.drain(nSrc, this._src);
      res.push(this._src, nSrc);
    }

    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S && res.outLen >= CHUNK) {
      const buf = ctx.createBuffer(chip.channels, CHUNK, ctx.sampleRate);
      const dests = new Array(chip.channels);
      for (let c = 0; c < chip.channels; c++) dests[c] = buf.getChannelData(c);
      res.drainOutput(CHUNK, dests);
      this._schedule(buf);
    }
  }

  /** Schedule one filled buffer at nextTime and advance the clock. */
  _schedule(buf) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    src.start(this.nextTime);
    this.nextTime += buf.length / this.ctx.sampleRate;
  }

  setMuted(m) {
    // The gain goes to 0 and the synthesiser KEEPS RUNNING. Muting must not
    // change the chip's state, or unmuting would resume a note whose envelope
    // and length counter had stood still: mute would be a game-visible event.
    // It costs the CPU of a muted synth; that is the right trade.
    this.gain.gain.value = m ? 0 : MASTER_GAIN;
  }

  close() {
    try { this.gain.disconnect(); } catch { /* already torn down */ }
    if (this.limiter) { try { this.limiter.disconnect(); } catch { /* ditto */ } }
    return this.ctx.close();
  }
}

// ---------------------------------------------------------------------------
// THE CONTROLLER -- the page-facing object. Autoplay/unlock + the firewall.
// ---------------------------------------------------------------------------

/**
 * Autoplay policy, verbatim from Gradius's W13. Browsers refuse to start audio
 * before a user gesture; this object starts `locked` and the AudioContext IS
 * NOT CREATED AT ALL until `arm()` runs inside a gesture handler. Until then
 * `frame()` drops its batches rather than queueing them, so nothing accumulates
 * while the page waits. THE GAME RUNS REGARDLESS: audio never gates the sim.
 */
export class AudioController {
  /**
   * @param {(rate:number)=>object} makeChip
   * @param {(e:Error)=>void} [onError]
   */
  constructor(makeChip, onError) {
    this.makeChip = makeChip;
    this.muted = false;
    this.status = 'locked';   // 'locked' | 'on' | 'unsupported' | 'failed'
    this.onError = onError;
    this.out = null;
  }

  /**
   * Create and start the AudioContext. MUST be called synchronously from a user
   * gesture handler; calling it later (from a promise, a timer, rAF) is exactly
   * the case browsers reject.
   */
  arm() {
    if (this.status === 'unsupported' || this.status === 'failed') return;
    if (this.out) { this.out.ctx.resume?.(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) { this.status = 'unsupported'; return; }
    try {
      const ctx = new AC({ latencyHint: 'interactive' });
      this.out = new AudioOut(ctx, this.makeChip);
      this.out.setMuted(this.muted);
      ctx.resume?.();
      this.status = 'on';
    } catch (e) {
      this.status = 'failed';
      this.onError?.(e);
    }
  }

  /** One logic frame of register writes. Dropped while locked. */
  frame(log) {
    if (this.out) this.out.frame(log);
  }

  /**
   * Once per animation frame. WRAPPED, and deliberately: the chip throws on a
   * register the driver never writes (e.g. a NES DMC write), and an audio
   * failure must not take the picture with it. The frame loop stops on a throw
   * because a wrong simulation is worse than none; a wrong SOUND is not in that
   * category.
   */
  pump() {
    if (!this.out) return;
    try {
      this.out.pump();
    } catch (e) {
      this.status = 'failed';
      const out = this.out;
      this.out = null;
      // Swallowed: the context is being torn down because something already
      // went wrong, and an unhandled rejection here would replace a useful
      // named error with a useless one.
      out.close().catch(() => {});
      this.onError?.(e);
    }
  }

  setMuted(m) {
    this.muted = !!m;
    this.out?.setMuted(this.muted);
  }

  /** For the page's status line. Numbers, not adjectives. */
  stats() {
    if (!this.out) return { status: this.status };
    return {
      status: this.muted ? 'muted' : this.status,
      rate: this.out.ctx.sampleRate,
      backlog: this.out.queue.length,
      dropped: this.out.dropped,
      underruns: this.out.underruns,
    };
  }
}
