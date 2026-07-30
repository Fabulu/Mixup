// DMG audio hardware.
//
// This is the one part of the sound stack that is NOT a translation of ROM
// code, because it is not code -- it is the chip the code talks to. The ported
// driver writes NR registers exactly as the cartridge does; this turns those
// writes into samples.
//
// Deliberately free of Web Audio: it is a pure function of register writes and
// elapsed cycles, so it runs and can be tested under node.
//
// Clock rates, all derived from the 4194304 Hz CPU clock:
//   square   period (2048 - freq) * 4      -> 131072 / (2048 - freq) Hz
//   wave     period (2048 - freq) * 2      ->  65536 / (2048 - freq) Hz
//   noise    period divisor << shift
//   frame sequencer 512 Hz: length at 256, sweep at 128, envelope at 64

export const CPU_HZ = 4194304;

/** Duty patterns for NR11/NR21 bits 6-7. Bit order is MSB-first per step. */
const DUTY = [
  [0, 0, 0, 0, 0, 0, 0, 1],   // 12.5%
  [1, 0, 0, 0, 0, 0, 0, 1],   // 25%
  [1, 0, 0, 0, 0, 1, 1, 1],   // 50%
  [0, 1, 1, 1, 1, 1, 1, 0],   // 75%
];

/** NR43 low 3 bits. Index 0 is a half-step, not 0 -- hence 8 rather than 4. */
const NOISE_DIVISOR = [8, 16, 32, 48, 64, 80, 96, 112];

/** NR32 bits 5-6: how far the wave sample is shifted down. 0 means silence. */
const WAVE_SHIFT = [4, 0, 1, 2];

class Square {
  constructor(hasSweep) {
    this.hasSweep = hasSweep;
    this.reset();
  }

  reset() {
    this.enabled = false;
    this.dacOn = false;
    this.duty = 2;
    this.step = 0;
    this.timer = 0;
    this.freq = 0;
    this.lengthCounter = 0;
    this.lengthEnable = false;
    this.envInit = 0;
    this.envAdd = false;
    this.envPeriod = 0;
    this.envTimer = 0;
    this.volume = 0;
    this.sweepPeriod = 0;
    this.sweepNeg = false;
    this.sweepShift = 0;
    this.sweepTimer = 0;
    this.sweepShadow = 0;
    this.sweepOn = false;
  }

  get period() { return (2048 - this.freq) * 4; }

  tick(cycles) {
    if (this.period <= 0) return;
    this.timer -= cycles;
    while (this.timer <= 0) {
      this.timer += this.period;
      this.step = (this.step + 1) & 7;
    }
  }

  sample() {
    if (!this.enabled || !this.dacOn) return 0;
    return DUTY[this.duty][this.step] ? this.volume : 0;
  }

  trigger() {
    this.enabled = true;
    if (this.lengthCounter === 0) this.lengthCounter = 64;
    this.timer = this.period;
    this.envTimer = this.envPeriod;
    this.volume = this.envInit;
    if (this.hasSweep) {
      this.sweepShadow = this.freq;
      this.sweepTimer = this.sweepPeriod || 8;
      this.sweepOn = this.sweepPeriod > 0 || this.sweepShift > 0;
      // A trigger with a non-zero shift computes once immediately, and can
      // disable the channel on the spot if that overflows.
      if (this.sweepShift > 0) this.sweepCalc();
    }
    if (!this.dacOn) this.enabled = false;
  }

  sweepCalc() {
    let next = this.sweepShadow >> this.sweepShift;
    next = this.sweepNeg ? this.sweepShadow - next : this.sweepShadow + next;
    if (next > 2047) { this.enabled = false; return -1; }
    return next;
  }

  clockLength() {
    if (this.lengthEnable && this.lengthCounter > 0 && --this.lengthCounter === 0) {
      this.enabled = false;
    }
  }

  clockEnvelope() {
    if (this.envPeriod === 0) return;
    if (--this.envTimer > 0) return;
    this.envTimer = this.envPeriod;
    if (this.envAdd && this.volume < 15) this.volume++;
    else if (!this.envAdd && this.volume > 0) this.volume--;
  }

  clockSweep() {
    if (!this.hasSweep || !this.sweepOn) return;
    if (--this.sweepTimer > 0) return;
    this.sweepTimer = this.sweepPeriod || 8;
    if (this.sweepPeriod === 0) return;
    const next = this.sweepCalc();
    if (next < 0 || this.sweepShift === 0) return;
    this.sweepShadow = next;
    this.freq = next;
    this.sweepCalc();          // the second calculation is check-only
  }
}

class Wave {
  constructor() { this.table = new Uint8Array(32); this.reset(); }

  reset() {
    this.enabled = false;
    this.dacOn = false;
    this.freq = 0;
    this.timer = 0;
    this.pos = 0;
    this.lengthCounter = 0;
    this.lengthEnable = false;
    this.shift = 4;
  }

  get period() { return (2048 - this.freq) * 2; }

  tick(cycles) {
    if (this.period <= 0) return;
    this.timer -= cycles;
    while (this.timer <= 0) {
      this.timer += this.period;
      this.pos = (this.pos + 1) & 31;
    }
  }

  sample() {
    if (!this.enabled || !this.dacOn) return 0;
    return this.table[this.pos] >> this.shift;
  }

  trigger() {
    this.enabled = true;
    if (this.lengthCounter === 0) this.lengthCounter = 256;
    this.timer = this.period;
    this.pos = 0;
    if (!this.dacOn) this.enabled = false;
  }

  clockLength() {
    if (this.lengthEnable && this.lengthCounter > 0 && --this.lengthCounter === 0) {
      this.enabled = false;
    }
  }
}

class Noise {
  constructor() { this.reset(); }

  reset() {
    this.enabled = false;
    this.dacOn = false;
    this.lfsr = 0x7FFF;
    this.timer = 0;
    this.divisorCode = 0;
    this.clockShift = 0;
    this.widthMode = false;
    this.lengthCounter = 0;
    this.lengthEnable = false;
    this.envInit = 0;
    this.envAdd = false;
    this.envPeriod = 0;
    this.envTimer = 0;
    this.volume = 0;
  }

  get period() { return NOISE_DIVISOR[this.divisorCode] << this.clockShift; }

  tick(cycles) {
    // Shifts above 13 are documented as not producing output at all; without
    // this guard they also make the while-loop below run for a very long time.
    if (this.clockShift > 13) return;
    this.timer -= cycles;
    while (this.timer <= 0) {
      this.timer += this.period;
      const bit = (this.lfsr ^ (this.lfsr >> 1)) & 1;
      this.lfsr = (this.lfsr >> 1) | (bit << 14);
      // Width mode also feeds bit 6, which shortens the period to 127 steps
      // and gives the metallic tone the ROM uses for its higher-pitched hits.
      if (this.widthMode) this.lfsr = (this.lfsr & ~0x40) | (bit << 6);
    }
  }

  sample() {
    if (!this.enabled || !this.dacOn) return 0;
    return (this.lfsr & 1) ? 0 : this.volume;
  }

  trigger() {
    this.enabled = true;
    if (this.lengthCounter === 0) this.lengthCounter = 64;
    this.timer = this.period;
    this.envTimer = this.envPeriod;
    this.volume = this.envInit;
    this.lfsr = 0x7FFF;
    if (!this.dacOn) this.enabled = false;
  }

  clockLength() {
    if (this.lengthEnable && this.lengthCounter > 0 && --this.lengthCounter === 0) {
      this.enabled = false;
    }
  }

  clockEnvelope() {
    if (this.envPeriod === 0) return;
    if (--this.envTimer > 0) return;
    this.envTimer = this.envPeriod;
    if (this.envAdd && this.volume < 15) this.volume++;
    else if (!this.envAdd && this.volume > 0) this.volume--;
  }
}

export class APU {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.ch1 = new Square(true);
    this.ch2 = new Square(false);
    this.ch3 = new Wave();
    this.ch4 = new Noise();
    this.powered = false;
    this.leftVol = 7;
    this.rightVol = 7;
    this.panning = 0xFF;
    this.frameTimer = 0;
    this.frameStep = 0;
    this.cycleRemainder = 0;
  }

  /**
   * Register write. `addr` is the raw hardware address ($FF10-$FF3F) so the
   * driver can pass ROM constants through unchanged.
   */
  write(addr, value) {
    const v = value & 0xFF;

    // $FF26 bit 7 gates everything; clearing it zeroes every other register.
    if (addr === 0xFF26) {
      const on = (v & 0x80) !== 0;
      if (!on && this.powered) {
        this.ch1.reset(); this.ch2.reset(); this.ch3.reset(); this.ch4.reset();
        this.leftVol = this.rightVol = 0;
        this.panning = 0;
      }
      this.powered = on;
      return;
    }
    // Wave RAM stays writable with the APU off; the control registers do not.
    if (!this.powered && addr < 0xFF30) return;

    switch (addr) {
      // --- channel 1: square with sweep ---
      case 0xFF10:
        this.ch1.sweepPeriod = (v >> 4) & 7;
        this.ch1.sweepNeg = (v & 0x08) !== 0;
        this.ch1.sweepShift = v & 7;
        break;
      case 0xFF11:
        this.ch1.duty = (v >> 6) & 3;
        this.ch1.lengthCounter = 64 - (v & 0x3F);
        break;
      case 0xFF12:
        this.ch1.envInit = (v >> 4) & 0x0F;
        this.ch1.envAdd = (v & 0x08) !== 0;
        this.ch1.envPeriod = v & 7;
        this.ch1.dacOn = (v & 0xF8) !== 0;
        if (!this.ch1.dacOn) this.ch1.enabled = false;
        break;
      case 0xFF13:
        this.ch1.freq = (this.ch1.freq & 0x700) | v;
        break;
      case 0xFF14:
        this.ch1.freq = (this.ch1.freq & 0xFF) | ((v & 7) << 8);
        this.ch1.lengthEnable = (v & 0x40) !== 0;
        if (v & 0x80) this.ch1.trigger();
        break;

      // --- channel 2: square ---
      case 0xFF16:
        this.ch2.duty = (v >> 6) & 3;
        this.ch2.lengthCounter = 64 - (v & 0x3F);
        break;
      case 0xFF17:
        this.ch2.envInit = (v >> 4) & 0x0F;
        this.ch2.envAdd = (v & 0x08) !== 0;
        this.ch2.envPeriod = v & 7;
        this.ch2.dacOn = (v & 0xF8) !== 0;
        if (!this.ch2.dacOn) this.ch2.enabled = false;
        break;
      case 0xFF18:
        this.ch2.freq = (this.ch2.freq & 0x700) | v;
        break;
      case 0xFF19:
        this.ch2.freq = (this.ch2.freq & 0xFF) | ((v & 7) << 8);
        this.ch2.lengthEnable = (v & 0x40) !== 0;
        if (v & 0x80) this.ch2.trigger();
        break;

      // --- channel 3: wave ---
      case 0xFF1A:
        this.ch3.dacOn = (v & 0x80) !== 0;
        if (!this.ch3.dacOn) this.ch3.enabled = false;
        break;
      case 0xFF1B:
        this.ch3.lengthCounter = 256 - v;
        break;
      case 0xFF1C:
        this.ch3.shift = WAVE_SHIFT[(v >> 5) & 3];
        break;
      case 0xFF1D:
        this.ch3.freq = (this.ch3.freq & 0x700) | v;
        break;
      case 0xFF1E:
        this.ch3.freq = (this.ch3.freq & 0xFF) | ((v & 7) << 8);
        this.ch3.lengthEnable = (v & 0x40) !== 0;
        if (v & 0x80) this.ch3.trigger();
        break;

      // --- channel 4: noise ---
      case 0xFF20:
        this.ch4.lengthCounter = 64 - (v & 0x3F);
        break;
      case 0xFF21:
        this.ch4.envInit = (v >> 4) & 0x0F;
        this.ch4.envAdd = (v & 0x08) !== 0;
        this.ch4.envPeriod = v & 7;
        this.ch4.dacOn = (v & 0xF8) !== 0;
        if (!this.ch4.dacOn) this.ch4.enabled = false;
        break;
      case 0xFF22:
        this.ch4.clockShift = (v >> 4) & 0x0F;
        this.ch4.widthMode = (v & 0x08) !== 0;
        this.ch4.divisorCode = v & 7;
        break;
      case 0xFF23:
        this.ch4.lengthEnable = (v & 0x40) !== 0;
        if (v & 0x80) this.ch4.trigger();
        break;

      // --- control ---
      case 0xFF24:
        this.rightVol = v & 7;
        this.leftVol = (v >> 4) & 7;
        break;
      case 0xFF25:
        this.panning = v;
        break;

      default:
        // Wave RAM: one byte is two 4-bit samples, high nibble first.
        if (addr >= 0xFF30 && addr <= 0xFF3F) {
          const i = (addr - 0xFF30) * 2;
          this.ch3.table[i] = (v >> 4) & 0x0F;
          this.ch3.table[i + 1] = v & 0x0F;
        }
        break;
    }
  }

  /** The 512 Hz frame sequencer: length, sweep and envelope clocks. */
  stepFrameSequencer() {
    const s = this.frameStep;
    if ((s & 1) === 0) {
      this.ch1.clockLength(); this.ch2.clockLength();
      this.ch3.clockLength(); this.ch4.clockLength();
    }
    if (s === 2 || s === 6) this.ch1.clockSweep();
    if (s === 7) {
      this.ch1.clockEnvelope(); this.ch2.clockEnvelope(); this.ch4.clockEnvelope();
    }
    this.frameStep = (s + 1) & 7;
  }

  /**
   * Render `count` stereo frames into interleaved float buffers.
   *
   * Cycles are accumulated as a fraction so the sample rate never has to
   * divide the CPU clock evenly.
   */
  render(left, right, count) {
    const perSample = CPU_HZ / this.sampleRate;
    const FRAME_SEQ = CPU_HZ / 512;

    for (let i = 0; i < count; i++) {
      this.cycleRemainder += perSample;
      const cycles = Math.floor(this.cycleRemainder);
      this.cycleRemainder -= cycles;

      this.frameTimer += cycles;
      while (this.frameTimer >= FRAME_SEQ) {
        this.frameTimer -= FRAME_SEQ;
        this.stepFrameSequencer();
      }

      this.ch1.tick(cycles);
      this.ch2.tick(cycles);
      this.ch3.tick(cycles);
      this.ch4.tick(cycles);

      const s = [this.ch1.sample(), this.ch2.sample(),
                 this.ch3.sample(), this.ch4.sample()];

      let l = 0, r = 0;
      for (let c = 0; c < 4; c++) {
        if (this.panning & (0x10 << c)) l += s[c];
        if (this.panning & (1 << c)) r += s[c];
      }

      // Four channels at 15 each, scaled by a 0-7 master volume. The /4 keeps
      // a full mix inside +-1 without any limiting.
      left[i] = (l / 60) * ((this.leftVol + 1) / 8) * 0.5;
      right[i] = (r / 60) * ((this.rightVol + 1) / 8) * 0.5;
    }
  }
}
