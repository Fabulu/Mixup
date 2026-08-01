// THE NES APU, AS A SYNTHESISER -- the counterpart of src/render/ppu.js.
//
// ============================ WHAT THIS FILE IS NOT ==========================
//
// It is NOT a port of cartridge code and it carries almost no ROM addresses,
// because there is no cartridge code here to port. Wave 8 ported the DRIVER
// ($EC1E/$ED02): the game logic that decides which value goes into which APU
// register on which frame, and that is verified per frame against the cartridge
// through `apuWrites`/`apuDigest` over the whole corpus. What was missing is the
// other half of the boundary -- the CHIP the driver was writing to. This file is
// that chip, modelled from the NES's published hardware behaviour.
//
// So the claim this file can support is narrow and it is stated here so nobody
// widens it later:
//
//   * the REGISTER STREAM matches the cartridge  -- proved by wave 8, per frame,
//     over 42 scenarios, and this wave does not change it (measured, see the
//     worklog);
//   * this file turns that stream into samples DETERMINISTICALLY -- same stream
//     and same sample rate in, bit-identical samples out, in one process and
//     across processes (tests/audio.test.js + tools/audiohash.mjs);
//   * a handful of STRUCTURAL properties hold (a channel is silent when its
//     length counter is 0, the triangle does not advance with a linear counter
//     of 0, the noise LFSR's two periods are 32767 and 93, the noise period
//     table reproduces the published NTSC frequency table, no NaN, no clip);
//   * and a HUMAN said it sounded right.
//
// There is deliberately NO gate comparing emitted PCM against an emulator's
// audio. That sounds like the strongest claim available and it is the weakest:
// it would inherit whatever that emulator's own APU model guesses at, and it is
// the easy thing to build because diffing two audio buffers is trivial.
// games/ddpdoj/NOTES-sound.md reasons this through for a much harder chip and
// reaches the same place.
//
// =========================== THE CARTRIDGE'S OWN FACTS =======================
//
// Four things about THIS cartridge are ROM facts and they are cited where they
// are used:
//
//   $81AB  A9 1F     LDA #$1F
//   $81AD  8D 15 40  STA $4015     all five channels enabled, DMC included
//   $81B0  A9 C0     LDA #$C0
//   $81B2  8D 17 40  STA $4017     FRAME COUNTER: 5-STEP MODE, IRQ inhibited
//
// Both run once per power-on, at $81AB, which is upstream of every window this
// corpus compares -- so the port never writes them and `reset()` below has to
// install them or the synthesiser starts in the wrong mode. **$4017 = $C0 is
// not a detail.** In 5-step mode the length counters and the sweep units are
// clocked at 96.0 Hz instead of 120.0 Hz and the envelopes at 192 Hz instead of
// 240 Hz; a synthesiser that assumes the 4-step default plays every note 25%
// too short and every envelope 25% too fast. It is the single most audible
// thing in this file that is a cartridge fact rather than a hardware fact.
//
// THE DMC IS NOT USED, and that was measured rather than assumed. A decode of
// every byte offset in the whole 32 KB PRG looking for absolute/absolute,X/
// absolute,Y operands in $4000-$401F finds 44 hits, and the set of bases is
//
//   $4000 $4001 $4002 $4003 $4007 $4008 $4009 $400C $400E $4014 $4015 $4016 $4017
//
// -- no $4010, $4011, $4012 or $4013 anywhere, and several of those hits are
// data bytes inside sequence streams rather than instructions. The only indexed
// writes that could walk into the DMC's registers are the driver's own
// `STA $4000,X` / `STA $4003,X` family, and X there is `$F9`, the APU offset,
// which $ED3E only ever advances 0, 4, 8, $0C -- so $400F is the highest
// address reachable. `write()` below therefore THROWS on $4010-$4013 rather
// than ignoring them: if a future wave makes the port emit a DMC write, that is
// a fact about the port that must not be swallowed by a synthesiser that
// silently does nothing.
//
// ($4015 = $1F does enable the DMC, and on real hardware that starts one
// 1-byte sample fetch from the power-on $4013 = 0. It is a single click at
// power-on, before any window this port models, and it is not reproduced.)

/**
 * CPU clock, EXACTLY, as a rational. NTSC master = 236250000/11 Hz and the CPU
 * is master/12, so CPU = 19687500/11 Hz = 1789772.7272... Kept as a fraction so
 * the sample-emission accumulator below can be integer arithmetic and therefore
 * bit-reproducible, rather than a float that drifts differently on every host.
 */
export const CPU_NUM = 19687500;
export const CPU_DEN = 11;
/** 1789772.727... Hz, for the places that want a number and not a ratio. */
export const CPU_HZ = CPU_NUM / CPU_DEN;

/**
 * PPU cycles per frame. game.json's `frameHzNote` spells the same fact from the
 * other end: "frames alternate 89342/89341 -- one cycle is skipped on the
 * pre-render line of odd frames", giving 60.098814 Hz. Accumulating PPU cycles
 * and taking CPU = floor(ppu/3) reproduces the alternation exactly in integers;
 * the average is 29780.5 CPU cycles per frame, which is 1789772.727/60.098814.
 */
const PPU_FRAME_EVEN = 89342;
const PPU_FRAME_ODD = 89341;

/**
 * The frame sequencer, 5-STEP MODE ($4017 bit 7 = 1, written at $81B2).
 *
 * Step points in CPU cycles, and the period. The NESdev tables are in APU
 * cycles (CPU/2) -- 3728.5, 7456.5, 11185.5, 14914.5, 18640.5, wrapping at
 * 18641 -- and these are those numbers doubled, which is what a CPU-cycle loop
 * wants. Step 4 (29829) clocks nothing at all; it is in the table because the
 * divider still has to reach it.
 *
 *   quarter frame -> envelopes + the triangle's linear counter
 *   half frame    -> length counters + the sweep units
 *
 * 1789772.727 / 37282 = 48.0 Hz for the whole sequence, so half frames land at
 * 96.0 Hz and quarter frames at 192.0 Hz. In 4-step mode (the power-on default
 * this cartridge overwrites) they would be 120.0 and 240.0.
 */
const FC_STEPS = new Int32Array([7457, 14913, 22371, 29829, 37281]);
const FC_QUARTER = new Uint8Array([1, 1, 1, 0, 1]);
const FC_HALF = new Uint8Array([0, 1, 0, 0, 1]);
const FC_PERIOD = 37282;

/**
 * The four duty cycles, 8 steps each: 12.5%, 25%, 50%, 25% negated. Flat, and
 * indexed `(duty << 3) | phase`, because this is read once per CPU cycle per
 * pulse channel -- 3.6 million times a second of audio -- and a nested array is
 * two loads and a bounds check instead of one.
 */
export const DUTY = new Uint8Array([
  0, 1, 0, 0, 0, 0, 0, 0,
  0, 1, 1, 0, 0, 0, 0, 0,
  0, 1, 1, 1, 1, 0, 0, 0,
  1, 0, 0, 1, 1, 1, 1, 1,
]);

/** The 32-step triangle sequence: 15 down to 0, then 0 up to 15. */
const TRI_SEQ = new Uint8Array(32);
for (let i = 0; i < 16; i++) { TRI_SEQ[i] = 15 - i; TRI_SEQ[16 + i] = i; }

/** Length counter table, indexed by the top 5 bits of $4003/$4007/$400B/$400F. */
export const LENGTH_TABLE = new Uint8Array([
  10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
  12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30,
]);

/**
 * The noise channel's timer period table (NTSC), IN CPU CYCLES -- the LFSR is
 * clocked once every `NOISE_PERIODS[p]` CPU cycles.
 *
 * THAT THE UNIT IS CPU CYCLES IS THE THING TO GET RIGHT, and it is checkable
 * against a second, independently published table rather than taken on trust.
 * The classic NTSC "noise frequency" table quotes 4811.2 Hz for period index 0,
 * and that number is the fundamental of the SHORT ($400E bit 7 = 1) LFSR, whose
 * sequence repeats after 93 steps:
 *
 *     1789772.727 / 4 / 93 = 4811.2 Hz          <- matches, index 0
 *     1789772.727 / 4068 / 93 = 4.73 Hz         <- matches, index $F
 *
 * Had the table been in APU cycles (CPU/2) every one of those would come out an
 * octave low and index 0 would read 2405.6, which is the published index-1
 * value. tests/audio.test.js checks all sixteen against the published
 * frequencies, which is two derivations of one number (docs/knowledge/03) and
 * not a restatement of this comment.
 */
export const NOISE_PERIODS = new Uint16Array([
  4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068,
]);
// ...AND IT IS `period`, NOT `period + 1`. The pulse and triangle timers count
// t+1 (that is why an NES pitch table entry is CPU/(16*f) - 1); the noise table
// is not a register value, it is the period itself. The same cross-check
// settles it: with a +1 the index-0 shift rate would be CPU/5 = 357,955 and the
// mode-1 fundamental 357955/93 = 3848.9 Hz, against a published 4811.2. Without
// it, CPU/4/93 = 4811.2 Hz to four figures. The first draft of Noise.clockTimer
// used the pulse's convention and tests/audio.test.js caught it -- 40,000
// shifts in 200,000 cycles where 50,000 were wanted.

/**
 * THE MIXER, and a wrong one is audible as balance rather than as a wrong note.
 *
 * The NES sums its channels through two resistor ladders whose response is
 * NON-linear, and the published closed forms are
 *
 *   pulse_out = 95.88 / (8128 / (pulse1 + pulse2) + 100)
 *   tnd_out   = 159.79 / (1 / (triangle/8227 + noise/12241 + dmc/22638) + 100)
 *
 * both 0 when their inputs are all 0. The widely copied lookup approximation
 * folds the tnd group into one index `3*tri + 2*noise + dmc`; this file does
 * NOT use it. `dmc` is 0 on this cartridge (measured -- see the header), so the
 * triangle/noise pair has only 16 x 16 = 256 states and the EXACT formula can
 * be tabulated in full. Same cost, no approximation.
 *
 * Peak output: pulse_out maxes at 95.88/(8128/30 + 100) = 0.2585 and tnd_out at
 * 159.79/(1/(15/8227 + 15/12241) + 100) = 0.3733, so the mixer's ceiling is
 * 0.6318 and nothing here can clip on its own.
 */
export const PULSE_MIX = new Float64Array(31);
for (let i = 1; i <= 30; i++) PULSE_MIX[i] = 95.88 / (8128 / i + 100);
export const TND_MIX = new Float64Array(256);
for (let t = 0; t < 16; t++) {
  for (let n = 0; n < 16; n++) {
    const s = t / 8227 + n / 12241;
    TND_MIX[(t << 4) | n] = s === 0 ? 0 : 159.79 / (1 / s + 100);
  }
}

/**
 * The NES's output filters, as published: two first-order high-passes at 90 Hz
 * and 440 Hz and a first-order low-pass at 14 kHz.
 *
 * Coefficients are the RC one-pole approximation `a = RC/(RC + dt)`, which uses
 * nothing but +, *, / and the double literal Math.PI. THAT IS ON PURPOSE:
 * `Math.exp` is not required by ECMA-262 to return the same bits on every
 * engine, and this file's whole gate is that it returns the same bits.
 */
function hpCoef(fc, sampleRate) {
  const rc = 1 / (2 * Math.PI * fc);
  const dt = 1 / sampleRate;
  return rc / (rc + dt);
}
function lpCoef(fc, sampleRate) {
  const rc = 1 / (2 * Math.PI * fc);
  const dt = 1 / sampleRate;
  return dt / (rc + dt);
}

/** One pulse channel. $4000-$4003 (pulse 1) and $4004-$4007 (pulse 2). */
class Pulse {
  /** @param {boolean} isPulse1 the sweep's negate mode differs between them. */
  constructor(isPulse1) {
    this.isPulse1 = isPulse1;
    this.enabled = false;
    this.duty = 0; this.phase = 0;
    this.halt = false; this.constVol = false; this.vol = 0;
    this.timer = 0; this.period = 0;
    this.length = 0;
    this.envStart = false; this.envDivider = 0; this.envDecay = 0;
    this.swEnabled = false; this.swPeriod = 0; this.swNegate = false;
    this.swShift = 0; this.swDivider = 0; this.swReload = false;
    this.mute = true;
  }

  /** The sweep unit's target period -- muting depends on it, not just the sweep. */
  target() {
    const change = this.period >> this.swShift;
    if (!this.swNegate) return this.period + change;
    // Pulse 1 negates with the ONE's complement (-c - 1), pulse 2 with the
    // two's complement (-c). This is the only behavioural difference between
    // the two channels and it is why they are one class with a flag.
    return this.period - change - (this.isPulse1 ? 1 : 0);
  }

  /**
   * `mute` is CACHED rather than recomputed inside `output()`, which is on
   * `run()`'s hot path: it depends only on `period` and the sweep registers,
   * and those change at most 96 times a second. Every writer of either calls
   * this; if one ever does not, the "silent below period 8" structural test is
   * what notices.
   */
  updateMute() {
    this.mute = this.period < 8 || this.target() > 0x7FF;
  }

  clockEnvelope() {
    if (this.envStart) {
      this.envStart = false;
      this.envDecay = 15;
      this.envDivider = this.vol;
      return;
    }
    if (this.envDivider === 0) {
      this.envDivider = this.vol;
      if (this.envDecay > 0) this.envDecay--;
      else if (this.halt) this.envDecay = 15;   // halt doubles as the env loop
    } else this.envDivider--;
  }

  clockLength() {
    if (!this.halt && this.length > 0) this.length--;
  }

  applySweep() {
    if (this.swShift > 0 && this.swEnabled && !this.mute) {
      // Masked rather than clamped: a negative target (period 8, shift 0,
      // pulse 1 negating) is not a muting condition, and the hardware writes
      // the low 11 bits of whatever the adder produced.
      this.period = this.target() & 0x7FF;
    }
  }

  clockSweep() {
    if (this.swReload) {
      if (this.swDivider === 0) this.applySweep();
      this.swDivider = this.swPeriod;
      this.swReload = false;
    } else if (this.swDivider > 0) this.swDivider--;
    else { this.applySweep(); this.swDivider = this.swPeriod; }
    this.updateMute();
  }

  /**
   * Clocked once per APU cycle, i.e. every second CPU cycle.
   * @returns {boolean} true when the sequencer stepped, i.e. when `output()`
   *   may have changed. `run()` uses it to skip recomputing the mixer on the
   *   ~99% of cycles where nothing moved; see the note there.
   */
  clockTimer() {
    if (this.timer === 0) {
      this.timer = this.period;
      this.phase = (this.phase + 7) & 7;   // the sequencer counts DOWN
      return true;
    }
    this.timer--;
    return false;
  }

  output() {
    if (this.length === 0 || this.mute || DUTY[(this.duty << 3) | this.phase] === 0) return 0;
    return this.constVol ? this.vol : this.envDecay;
  }
}

/** The triangle. $4008-$400B. No envelope, no volume: it is 4-bit or nothing. */
class Triangle {
  constructor() {
    this.enabled = false;
    this.control = false; this.linReload = 0; this.linCounter = 0;
    this.linReloadFlag = false;
    this.timer = 0; this.period = 0; this.phase = 0;
    this.length = 0;
  }

  clockLinear() {
    if (this.linReloadFlag) this.linCounter = this.linReload;
    else if (this.linCounter > 0) this.linCounter--;
    if (!this.control) this.linReloadFlag = false;
  }

  clockLength() {
    if (!this.control && this.length > 0) this.length--;
  }

  /** Clocked once per CPU cycle -- the triangle is the only channel that is. */
  clockTimer() {
    if (this.timer === 0) {
      this.timer = this.period;
      // The sequencer advances only while BOTH counters are non-zero; when
      // either is 0 the output HOLDS its current step rather than going to
      // zero, which is what the hardware does and why $ED36's `$4008 := 0`
      // silences the triangle by starving the linear counter.
      //
      // `period < 2` is an EMULATION CONVENTION, not a hardware fact: at those
      // periods the sequencer runs at ~450 kHz and a point-sampled model turns
      // it into broadband alias noise. Real hardware emits an inaudible
      // ultrasonic tone. Holding the phase is what the common models do and it
      // is flagged here so nobody reads it as translated behaviour.
      if (this.linCounter > 0 && this.length > 0 && this.period >= 2) {
        this.phase = (this.phase + 1) & 31;
        return true;
      }
      return false;
    }
    this.timer--;
    return false;
  }

  output() { return TRI_SEQ[this.phase]; }
}

/** The noise channel. $400C-$400F. A 15-bit LFSR with two tap positions. */
class Noise {
  constructor() {
    this.enabled = false;
    this.halt = false; this.constVol = false; this.vol = 0;
    this.mode = false; this.timer = 0; this.period = NOISE_PERIODS[0];
    // Power-on value. A zero shift register would be a fixed point: it can
    // never leave 0, and the channel would be silent for ever.
    this.lfsr = 1;
    this.length = 0;
    this.envStart = false; this.envDivider = 0; this.envDecay = 0;
  }

  clockEnvelope() {
    if (this.envStart) {
      this.envStart = false; this.envDecay = 15; this.envDivider = this.vol; return;
    }
    if (this.envDivider === 0) {
      this.envDivider = this.vol;
      if (this.envDecay > 0) this.envDecay--;
      else if (this.halt) this.envDecay = 15;
    } else this.envDivider--;
  }

  clockLength() { if (!this.halt && this.length > 0) this.length--; }

  /** One LFSR step. Feedback is bit 0 XOR bit 1, or bit 0 XOR bit 6 in mode 1. */
  clockLfsr() {
    const other = this.mode ? (this.lfsr >> 6) & 1 : (this.lfsr >> 1) & 1;
    const fb = (this.lfsr & 1) ^ other;
    this.lfsr = (this.lfsr >> 1) | (fb << 14);
  }

  /**
   * Clocked once per CPU cycle, and it counts `period` cycles between shifts,
   * not `period + 1` -- see the note on NOISE_PERIODS.
   */
  clockTimer() {
    if (--this.timer <= 0) { this.timer = this.period; this.clockLfsr(); return true; }
    return false;
  }

  output() {
    if (this.length === 0 || (this.lfsr & 1) !== 0) return 0;
    return this.constVol ? this.vol : this.envDecay;
  }
}

/**
 * The chip.
 *
 * Usage is one call per LOGIC FRAME, in the port's own frame order:
 *
 *     apu.frame(log)       // log = the flat [off, value, off, value, ...] the
 *                          // frame's $4000-$400F writes produced
 *
 * and the samples pile up in `out`/`outLen` for the caller to drain.
 *
 * ==================== WHERE IN THE FRAME THE WRITES LAND =====================
 *
 * All of them are applied at the frame boundary, before the frame's cycles are
 * run, and that is an approximation with a measured justification: **this
 * cartridge has no main loop.** $806A's NMI handler is the whole game -- it
 * raises the frame lock at $809F, runs the sound driver at $80A1, reads the
 * joypad at $80A4, runs every subsystem, and clears the lock at $80B5 -- so
 * every APU write the machine makes in a frame happens inside one handler,
 * within a few thousand CPU cycles of the frame's start. The spread between
 * $ED02's writes and a $EC1E request made later by game code is well under one
 * output sample at 48 kHz. What is NOT modelled is the ORDER-IN-TIME within
 * that burst; the ORDER ITSELF is preserved exactly, which is what the register
 * writes' meaning depends on.
 */
export class NesApu {
  /**
   * @param {number} sampleRate      the AudioContext's rate, or any rate a test
   *                                 wants. It is an INPUT to determinism, not a
   *                                 constant: the same stream at 44100 and at
   *                                 48000 are two different (correct) answers.
   * @param {object} [opts]
   * @param {boolean} [opts.filters] the 90 Hz / 440 Hz / 14 kHz hardware
   *                                 filters. Default on. Off is for tests that
   *                                 want a channel's raw contribution.
   * @param {boolean} [opts.mixCache] the `dirty` optimisation in `run()`.
   *                                 Default on. Off recomputes the mixer on
   *                                 every CPU cycle, which is what the
   *                                 optimisation is SUPPOSED to be identical
   *                                 to -- tests/audio.test.js renders a real
   *                                 stream both ways and demands the same bits,
   *                                 so a missing `dirty = true` is a red test
   *                                 rather than a silent 0.3 ms of stale audio.
   */
  constructor(sampleRate, opts = {}) {
    if (!(sampleRate > 0)) throw new Error(`NesApu: bad sampleRate ${sampleRate}`);
    this.sampleRate = sampleRate;
    this.useFilters = opts.filters !== false;
    this.mixCache = opts.mixCache !== false;
    this.hp90 = hpCoef(90, sampleRate);
    this.hp440 = hpCoef(440, sampleRate);
    this.lp14k = lpCoef(14000, sampleRate);
    this.out = new Float32Array(4096);
    this.outLen = 0;
    this.reset();
  }

  /**
   * Power-on, plus the two register writes the cartridge makes at $81AB-$81B2
   * and never repeats. The port's compared windows all start long after them,
   * so the seed has to come from here or the frame counter is in the wrong mode.
   */
  reset() {
    this.p1 = new Pulse(true);
    this.p2 = new Pulse(false);
    this.tri = new Triangle();
    this.noise = new Noise();
    this.frameIdx = 0;
    this.ppuAcc = 0;
    this.cpuDone = 0;
    this.apuPhase = 0;           // the APU clock is the CPU clock halved
    this.fcCycle = 0;
    this.fcStep = 0;
    this.sampleAcc = 0;
    this.sum = 0;
    this.sumCount = 0;
    this.mix = 0;                // the cached mixer level; see run()
    this.f1 = 0; this.f2 = 0; this.f3 = 0;   // filter states
    this.x1 = 0; this.x2 = 0;
    this.outLen = 0;
    // $81AD STA $4015 with A = $1F -- all five channels enabled.
    this.write(0x15, 0x1F);
    // $81B2 STA $4017 with A = $C0 -- 5-step sequence, IRQ inhibited. Setting
    // bit 7 also clocks a quarter and a half frame immediately and resets the
    // divider, which is why this is a `write()` and not a field assignment.
    this.write(0x17, 0xC0);
  }

  /** One APU register write. `off` is the offset from $4000. */
  write(off, v) {
    v &= 0xFF;
    switch (off) {
      case 0x00: case 0x04: {
        const c = off === 0 ? this.p1 : this.p2;
        c.duty = v >> 6;
        c.halt = (v & 0x20) !== 0;
        c.constVol = (v & 0x10) !== 0;
        c.vol = v & 0x0F;
        break;
      }
      case 0x01: case 0x05: {
        const c = off === 1 ? this.p1 : this.p2;
        c.swEnabled = (v & 0x80) !== 0;
        c.swPeriod = (v >> 4) & 7;
        c.swNegate = (v & 0x08) !== 0;
        c.swShift = v & 7;
        c.swReload = true;
        c.updateMute();
        break;
      }
      case 0x02: case 0x06: {
        const c = off === 2 ? this.p1 : this.p2;
        c.period = (c.period & 0x700) | v;
        c.updateMute();
        break;
      }
      case 0x03: case 0x07: {
        const c = off === 3 ? this.p1 : this.p2;
        c.period = (c.period & 0xFF) | ((v & 7) << 8);
        if (c.enabled) c.length = LENGTH_TABLE[v >> 3];
        c.phase = 0;              // the sequencer restarts
        c.envStart = true;        // and so does the envelope
        c.updateMute();
        break;
      }
      case 0x08:
        this.tri.control = (v & 0x80) !== 0;
        this.tri.linReload = v & 0x7F;
        break;
      case 0x09: break;           // $4009 is unused on the hardware
      case 0x0A:
        this.tri.period = (this.tri.period & 0x700) | v;
        break;
      case 0x0B:
        this.tri.period = (this.tri.period & 0xFF) | ((v & 7) << 8);
        if (this.tri.enabled) this.tri.length = LENGTH_TABLE[v >> 3];
        this.tri.linReloadFlag = true;
        break;
      case 0x0C:
        this.noise.halt = (v & 0x20) !== 0;
        this.noise.constVol = (v & 0x10) !== 0;
        this.noise.vol = v & 0x0F;
        break;
      case 0x0D: break;           // $400D is unused on the hardware
      case 0x0E:
        this.noise.mode = (v & 0x80) !== 0;
        this.noise.period = NOISE_PERIODS[v & 0x0F];
        break;
      case 0x0F:
        if (this.noise.enabled) this.noise.length = LENGTH_TABLE[v >> 3];
        this.noise.envStart = true;
        break;
      case 0x10: case 0x11: case 0x12: case 0x13:
        // NOT AN OVERSIGHT. See the header: a decode of every byte offset in
        // the whole 32 KB PRG finds no instruction naming $4010-$4013, and the
        // driver's indexed writes reach $400F at the most ($ED3E advances the
        // APU offset 0, 4, 8, $0C only). If this ever fires, the port has grown
        // a DMC write and somebody has to decide what it means -- which is a
        // decision, not a default.
        throw new Error(`NesApu: $40${off.toString(16).toUpperCase().padStart(2, '0')}`
          + ' is a DMC register and this cartridge never writes one. Measured:'
          + ' a decode of every byte offset in the 32 KB PRG for absolute'
          + ' operands in $4000-$401F finds bases $4000-$4003, $4007-$4009,'
          + ' $400C, $400E, $4014-$4017 and no DMC register at all. $4015 = $1F'
          + ' at $81AD does ENABLE the channel, but nothing ever feeds it.');
      case 0x14: break;           // OAM DMA -- src/oam.js, not audio
      case 0x15: {
        this.p1.enabled = (v & 1) !== 0;
        this.p2.enabled = (v & 2) !== 0;
        this.tri.enabled = (v & 4) !== 0;
        this.noise.enabled = (v & 8) !== 0;
        // Clearing an enable bit clears that channel's length counter and it
        // stays clear while the bit is 0.
        if (!this.p1.enabled) this.p1.length = 0;
        if (!this.p2.enabled) this.p2.length = 0;
        if (!this.tri.enabled) this.tri.length = 0;
        if (!this.noise.enabled) this.noise.length = 0;
        break;
      }
      case 0x16: break;           // JOY1 -- src/input.js
      case 0x17:
        // Only $C0 is ever written here ($81B2) and only the 5-step arm is
        // modelled. A 4-step write would silently change every length and
        // envelope rate, so it is a throw rather than a branch nobody has
        // exercised: the port has no code that can produce one.
        if ((v & 0x80) === 0) {
          throw new Error('NesApu: $4017 written with bit 7 clear (4-step frame'
            + ' counter). This cartridge writes $C0 once, at $81B2, and nothing'
            + ' else -- the 4-step sequence is not modelled because no code path'
            + ' in this port can reach it.');
        }
        this.fcCycle = 0;
        this.fcStep = 0;
        // Setting bit 7 clocks a quarter and a half frame immediately.
        this.quarterFrame();
        this.halfFrame();
        break;
      default:
        throw new Error(`NesApu: $4000+${off} is not an APU register`);
    }
  }

  quarterFrame() {
    this.p1.clockEnvelope();
    this.p2.clockEnvelope();
    this.tri.clockLinear();
    this.noise.clockEnvelope();
  }

  halfFrame() {
    this.p1.clockLength(); this.p1.clockSweep();
    this.p2.clockLength(); this.p2.clockSweep();
    this.tri.clockLength();
    this.noise.clockLength();
  }

  /** The four channels' raw 4-bit levels, for structural tests. */
  levels() {
    return [this.p1.output(), this.p2.output(), this.tri.output(), this.noise.output()];
  }

  /**
   * Apply one logic frame's register writes, then run that frame's cycles.
   *
   * @param {ArrayLike<number>} log  flat [off, value, off, value, ...] -- the
   *        order is load-bearing and it is the order src/sound.js's `apu()`
   *        made the writes in, which is the order objloop.lua measured on the
   *        cartridge and `apuDigest` compares.
   * @param {boolean} [emit=true]  false runs the frame but throws its samples
   *        away. The BACKLOG VALVE: see src/audio/output.js. The chip's state
   *        still advances, so a dropped frame costs audio time and never
   *        correctness.
   */
  frame(log, emit = true) {
    for (let i = 0; i + 1 < log.length; i += 2) this.write(log[i], log[i + 1]);
    this.ppuAcc += (this.frameIdx & 1) ? PPU_FRAME_ODD : PPU_FRAME_EVEN;
    this.frameIdx++;
    const target = Math.floor(this.ppuAcc / 3);
    const n = target - this.cpuDone;
    this.cpuDone = target;
    this.run(n, emit);
  }

  /** @param {number} cycles CPU cycles. */
  run(cycles, emit) {
    const { p1, p2, tri, noise } = this;
    let sum = this.sum, sumCount = this.sumCount, acc = this.sampleAcc;
    const step = this.sampleRate * CPU_DEN;
    let fcCycle = this.fcCycle, fcStep = this.fcStep, apuPhase = this.apuPhase;
    // THE MIXED LEVEL IS CACHED, and `dirty` is the only reason this loop is
    // affordable. It runs 1,789,773 times per second of audio; the four channel
    // outputs can only change when a sequencer steps, an LFSR shifts, or the
    // frame counter clocks an envelope/length/sweep, and at ordinary music
    // periods that is a few thousand times a second, not 1.8 million.
    //
    // MEASURED, tools/audiohash.mjs's 600-frame scripted run, best of five warm
    // passes, against the 16.64 ms frame budget:
    //     with the cache        1.075 ms/frame
    //     `{ mixCache: false }`  1.807 ms/frame
    //     src/nmi.js itself     0.031 ms/frame (same run, for scale)
    // THE ABSOLUTE NUMBERS TRACK HOST LOAD -- an earlier run on a quieter
    // machine read 0.608 / 1.000 / 0.027 -- so the stable measurement is the
    // RATIO, about 1.7x, which came out the same on both. The sample hash is
    // IDENTICAL either way (c75b7ab4d853a454...), which is how the cache is
    // checked rather than assumed; tests/audio.test.js renders both and demands
    // the same bits, on the cartridge's stream AND on a constructed envelope
    // that the cartridge's own data can never produce.
    let dirty = true, mix = this.mix;
    const cache = this.mixCache;

    for (let c = 0; c < cycles; c++) {
      if (tri.clockTimer()) dirty = true;
      apuPhase ^= 1;
      if (apuPhase === 0) {
        if (p1.clockTimer()) dirty = true;
        if (p2.clockTimer()) dirty = true;
      }
      if (noise.clockTimer()) dirty = true;

      fcCycle++;
      if (fcCycle === FC_STEPS[fcStep]) {
        if (FC_QUARTER[fcStep]) this.quarterFrame();
        if (FC_HALF[fcStep]) this.halfFrame();
        fcStep++;
        if (fcStep === 5) { fcStep = 0; }
        dirty = true;
      }
      if (fcCycle === FC_PERIOD) fcCycle = 0;

      if (dirty || !cache) {
        mix = PULSE_MIX[p1.output() + p2.output()]
            + TND_MIX[(tri.output() << 4) | noise.output()];
        dirty = false;
      }
      // The box average over the sample's own window. It is a cheap but real
      // anti-alias: point-sampling a 12.5% duty square at 48 kHz folds its
      // harmonics down audibly, and averaging the analogue level over the
      // sample period is what an ideal converter would do anyway.
      sum += mix;
      sumCount++;

      acc += step;
      if (acc >= CPU_NUM) {
        acc -= CPU_NUM;
        let s = sum / sumCount;
        sum = 0; sumCount = 0;
        if (this.useFilters) s = this.filter(s);
        if (emit) this.push(s);
      }
    }

    this.sum = sum; this.sumCount = sumCount; this.sampleAcc = acc;
    this.fcCycle = fcCycle; this.fcStep = fcStep; this.apuPhase = apuPhase;
    this.mix = mix;
  }

  /** 90 Hz HP, 440 Hz HP, 14 kHz LP -- the console's own output stage. */
  filter(x) {
    const y1 = this.hp90 * (this.f1 + x - this.x1);
    this.x1 = x; this.f1 = y1;
    const y2 = this.hp440 * (this.f2 + y1 - this.x2);
    this.x2 = y1; this.f2 = y2;
    const y3 = this.f3 + this.lp14k * (y2 - this.f3);
    this.f3 = y3;
    return y3;
  }

  push(s) {
    if (this.outLen === this.out.length) {
      const bigger = new Float32Array(this.out.length * 2);
      bigger.set(this.out);
      this.out = bigger;
    }
    this.out[this.outLen++] = s;
  }

  /** Move the first `n` samples out and shift the rest down. */
  drain(n, dest, destOffset = 0) {
    const k = Math.min(n, this.outLen);
    for (let i = 0; i < k; i++) dest[destOffset + i] = this.out[i];
    this.out.copyWithin(0, k, this.outLen);
    this.outLen -= k;
    return k;
  }
}
