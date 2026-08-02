// THE AUDIO OUTPUT PATH -- host plumbing, exactly like src/main.js's frame loop.
//
// src/audio/apu.js is the chip and knows nothing about browsers; this file is
// the only thing in the port that touches Web Audio, and it exists to solve one
// problem:
//
// ================== AUDIO TIMING IS THE INPUT-GRANULARITY PROBLEM ============
//
// docs/worklog/gradius/13-FINDING-input-granularity-under-load.md wrote down
// what the frame loop does when the host falls behind: it runs up to EIGHT
// logic frames inside one animation-frame callback. For the picture that is
// invisible -- only the last frame is drawn. For the SOUND DRIVER it is not:
// eight ticks of $ED02 in one burst is an eighth of a second of music delivered
// at once, and if the samples were generated at the rate the callback produced
// them the music would stutter in a way the picture never does.
//
// So this file NEVER renders on the game's schedule. The frame loop hands it
// one batch of register writes per LOGIC FRAME -- `frame()` -- and those batches
// go into a queue. `pump()` turns queued batches into samples and schedules
// them contiguously on the AudioContext's own clock. A burst of eight frames
// becomes eight queued batches and 133 ms of audio played over 133 ms.
//
// AND IT NEVER RUNS THE OTHER WAY. Nothing here calls back into game logic, and
// no game-visible value depends on the audio clock or on the sample rate. That
// is games/ddpdoj/NOTES-replay.md's constraint 1 -- "the host clock drives when
// a frame is presented, never what the frame contains" -- and it is the same
// counted-not-timed rule the work budget follows. A port whose simulation
// depended on the sound card could not produce a deterministic replay, and this
// project's oracle IS a replay.
//
// WHAT HAPPENS WHEN THE HOST STALLS ANYWAY. The queue has a ceiling
// (`MAX_BACKLOG_FRAMES`). Past it, batches are still APPLIED to the chip -- so
// envelopes, length counters and the LFSR all advance and the chip's state stays
// correct -- but their samples are thrown away. The audible result is that the
// music skips forward; the alternative is a permanently growing delay between
// what is on screen and what is in the speakers. Dropped frames are counted and
// shown on the page, because a silent quality loss is how this repo has been
// bitten before.

import { NesApu } from './apu.js';

/**
 * How far ahead of the AudioContext's clock we keep audio scheduled. Big enough
 * that an ordinary rAF gap (16.7 ms) or a small GC pause cannot open a hole,
 * small enough that a mute or a pause is not heard three chunks later.
 */
const LOOKAHEAD_S = 0.12;

/** One scheduled AudioBuffer, in samples. 1024 @ 48 kHz = 21.3 ms. */
const CHUNK = 1024;

/** The delay between arming and the first sample. One chunk plus a chunk of slack. */
const START_LATENCY_S = 0.05;

/**
 * The backlog ceiling, in LOGIC FRAMES. 15 frames = 250 ms; anything past that
 * is a real stall (a backgrounded tab, a long GC) rather than rAF jitter, and
 * src/main.js's own catch-up clamps at 8 frames per callback, so a healthy loop
 * never comes near this.
 */
const MAX_BACKLOG_FRAMES = 15;

/** Master volume. The mixer's own ceiling is 0.63 (see apu.js), so this is headroom. */
const MASTER_GAIN = 0.8;

/** One shared empty batch, so an idle frame costs no allocation. */
const EMPTY = new Uint8Array(0);

class AudioOut {
  constructor(ctx) {
    this.ctx = ctx;
    this.apu = new NesApu(ctx.sampleRate);
    this.gain = ctx.createGain();
    this.gain.gain.value = MASTER_GAIN;
    this.gain.connect(ctx.destination);
    /** Queued logic frames, oldest first. One entry per frame, empty ones too. */
    this.queue = [];
    this.nextTime = -1;          // -1 = nothing scheduled yet
    this.underruns = 0;
    this.dropped = 0;
    this.frames = 0;
  }

  /**
   * One logic frame's register writes. Copied, because `state.apuLog` is reused
   * by the very next call to `nmi()`.
   *
   * Both fields fit in a byte -- the offset is 0..$17 and the value is 0..$FF --
   * so a Uint8Array is exact, not a truncation.
   */
  frame(log) {
    this.queue.push(log.length ? Uint8Array.from(log) : EMPTY);
    this.frames++;
  }

  /** Called once per animation frame, after the catch-up loop has run. */
  pump() {
    const ctx = this.ctx;
    // ---- 1. queued logic frames -> samples ---------------------------------
    while (this.queue.length) {
      // THE BACKLOG VALVE. Past the ceiling the batch is still applied (the
      // chip's state must not be allowed to diverge from the driver's) but its
      // samples are discarded.
      const emit = this.queue.length <= MAX_BACKLOG_FRAMES;
      if (!emit) this.dropped++;
      this.apu.frame(this.queue.shift(), emit);
    }

    // ---- 2. samples -> scheduled AudioBuffers ------------------------------
    if (this.nextTime < 0) this.nextTime = ctx.currentTime + START_LATENCY_S;
    else if (this.nextTime < ctx.currentTime) {
      // We ran dry: the main thread did not get back here before the last
      // scheduled chunk finished. Resync rather than schedule in the past,
      // where start() would play the chunk immediately and overlap the next.
      this.underruns++;
      this.nextTime = ctx.currentTime + START_LATENCY_S;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S && this.apu.outLen >= CHUNK) {
      const buf = ctx.createBuffer(1, CHUNK, ctx.sampleRate);
      this.apu.drain(CHUNK, buf.getChannelData(0));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gain);
      src.start(this.nextTime);
      this.nextTime += CHUNK / ctx.sampleRate;
    }
  }

  setMuted(m) {
    // The gain goes to 0 and the synthesiser KEEPS RUNNING. Muting must not
    // change the chip's state, or unmuting would resume a note whose envelope
    // and length counter had stood still -- i.e. mute would be a game-visible
    // event. It costs the CPU of a muted synth; that is the right trade.
    this.gain.gain.value = m ? 0 : MASTER_GAIN;
  }

  close() {
    try { this.gain.disconnect(); } catch { /* already torn down */ }
    return this.ctx.close();
  }
}

/**
 * The controller the page holds.
 *
 * ============================ AUTOPLAY POLICY ================================
 *
 * Browsers refuse to start audio before a user gesture, and a page that ignores
 * that ends up with a permanently suspended AudioContext and silence nobody can
 * explain. So this object starts in `locked` and the AudioContext IS NOT
 * CREATED AT ALL until `arm()` is called from inside a gesture handler. Until
 * then `frame()` throws its batches away rather than queueing them, so nothing
 * accumulates while the page waits.
 *
 * The page says so in words (index.html: "Sound starts on your first key or
 * tap") and the status line reads `locked` until it happens. THE GAME RUNS
 * REGARDLESS -- audio never gates the simulation.
 */
export class GradiusAudio {
  /** @param {(e:Error)=>void} [onError] */
  constructor(onError) {
    this.out = null;
    this.muted = false;
    this.status = 'locked';
    this.onError = onError;
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
      this.out = new AudioOut(ctx);
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
   * Once per animation frame. WRAPPED, and deliberately: src/audio/apu.js throws
   * on a DMC register write, and an audio failure must not take the picture with
   * it. src/main.js's frame loop stops on a throw because a wrong simulation is
   * worse than none; a wrong SOUND is not in that category.
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
