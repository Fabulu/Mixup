// Host chronology for the independent PGM display/sound clock and the
// cartridge-governed 68000 logic clock.

const EPSILON_MS = 1e-9;

function nonNegativeFinite(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
  return value;
}

function callback(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`DdpdojCadence ${name} must be a function`);
  }
  return value;
}

export class DdpdojCadence {
  constructor(soundPeriodMs) {
    if (!Number.isFinite(soundPeriodMs) || soundPeriodMs <= 0) {
      throw new RangeError('DdpdojCadence soundPeriodMs must be positive and finite');
    }
    this.soundPeriodMs = soundPeriodMs;
    this.reset();
  }

  reset() {
    this.pendingMs = 0;
    this.logicInMs = null;
    this.soundInMs = this.soundPeriodMs;
  }

  advance(elapsedMs, {
    logicPeriodMs,
    stepLogic,
    stepSound,
    maxLogicSteps = 8,
  }) {
    nonNegativeFinite('DdpdojCadence elapsedMs', elapsedMs);
    callback('logicPeriodMs', logicPeriodMs);
    callback('stepLogic', stepLogic);
    callback('stepSound', stepSound);
    if (!Number.isInteger(maxLogicSteps) || maxLogicSteps <= 0) {
      throw new RangeError('DdpdojCadence maxLogicSteps must be a positive integer');
    }

    this.pendingMs += elapsedMs;
    if (this.logicInMs === null) {
      this.logicInMs = nonNegativeFinite(
        'DdpdojCadence logic period', logicPeriodMs(),
      );
    }

    let logicSteps = 0;
    let soundTicks = 0;
    let blocked = false;

    while (true) {
      const logicDue = this.logicInMs <= EPSILON_MS;
      const soundDue = this.soundInMs <= EPSILON_MS;

      // Canonical logic owns a coincident boundary. It posts score selection and
      // mailbox commands before the sound hardware consumes that same instant.
      if (logicDue) {
        if (logicSteps >= maxLogicSteps) {
          blocked = true;
          break;
        }
        stepLogic();
        logicSteps++;
        this.logicInMs = nonNegativeFinite(
          'DdpdojCadence logic period', logicPeriodMs(),
        );
        continue;
      }
      if (soundDue) {
        stepSound();
        soundTicks++;
        this.soundInMs = this.soundPeriodMs;
        continue;
      }

      const untilBoundary = Math.min(this.logicInMs, this.soundInMs);
      if (untilBoundary > this.pendingMs + EPSILON_MS) {
        this.logicInMs -= this.pendingMs;
        this.soundInMs -= this.pendingMs;
        this.pendingMs = 0;
        break;
      }

      this.logicInMs = Math.max(0, this.logicInMs - untilBoundary);
      this.soundInMs = Math.max(0, this.soundInMs - untilBoundary);
      this.pendingMs = Math.max(0, this.pendingMs - untilBoundary);
    }

    return Object.freeze({ logicSteps, soundTicks, blocked,
      pendingMs: this.pendingMs });
  }
}
