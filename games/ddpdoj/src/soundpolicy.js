// OWNER-APPROVED AUDIBLE SUBSTITUTIONS -- W158.
//
// These are deterministic approximations, not authentic ICS2115 measurements.
// No physical PGM board or serial-DAC capture is available. See
// NOTES-sound.md and W154/W158 for the evidence and replacement experiment.

import { ENDPOINT_POLICY, volumeIndexGain } from './ics2115.js';
import { IRQ_TIMING_POLICY } from './soundruntime.js';

export const AMD_CENTER_POLICY_NAME = 'amd-us5659466-center-approximation';

/**
 * AMD US 5,659,466 InterWave position-7 offsets, applied at W151's exact
 * 12-bit logarithmic volume-index stage. This is cross-chip evidence only.
 */
export const AMD_US5659466_CENTER_APPROXIMATION = Object.freeze({
  name: AMD_CENTER_POLICY_NAME,
  approximation: true,
  source: 'AMD US 5,659,466 position 7 (InterWave/GF1 descendant)',
  centerGains(volAcc) {
    if (!Number.isInteger(volAcc) || volAcc < 0 || volAcc > 0xffff) {
      throw new RangeError(`AMD center approximation VolAcc must be 0..65535, got ${volAcc}`);
    }
    const index = volAcc >>> 4;
    return [volumeIndexGain(Math.max(0, index - 116)),
      volumeIndexGain(Math.max(0, index - 141))];
  },
});

export const APPROVED_SOUND_POLICIES = Object.freeze({
  panPolicy: AMD_US5659466_CENTER_APPROXIMATION,
  endpointPolicy: ENDPOINT_POLICY.STRICT_CROSSING,
  irqTimingPolicy: IRQ_TIMING_POLICY.AFTER_NATIVE_FRAME,
  authenticity: 'two hardware details are owner-approved approximations, not physical-board facts',
});
