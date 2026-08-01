// THE WORK BUDGET -- built in on wave 4's first commit, exactly as
// `PLAN-vertical-slice.md` §5 and `docs/knowledge/06` rule 3 require, and NOT
// because we found a case (C).  We did not:
//
//   MEASURED, wave 2, forced overrun at 240,012 injected cycles/frame:
//     object_slots_processed == object_slots_live on ALL 696 overrun frames,
//     at 0.5309 logic frames per video frame with 624 over-budget frames.
//     The driver's loop is `moveq #$13,D0 / ... / dbra` -- no budget test, no
//     time test, 20 slots unconditionally.  (Every figure MAME-timed and
//     UNCALIBRATED; mechanism, not magnitude.)
//
// So the budget's calibration constant is set to "never triggers" and the
// truncation path is a LOUD THROW rather than a guess, because nobody has ever
// seen the game truncate and inventing what it would do is the exact failure
// `docs/knowledge/08` names.  What this file buys is the thing that cannot be
// retrofitted: the driver is already written as a budgeted walk in the original
// order, so if a sub-driver is ever measured to truncate (wave 2's open item 3
// -- the 20 per-type handlers' own sub-tables were never disassembled for
// budget tests) the change is one constant, not a rewrite.
//
// COUNTED, NOT TIMED.  NOTES-replay.md constraint 5: deriving slowdown from how
// long the HOST took makes every replay machine-dependent and the simulation
// irreproducible against itself.  Nothing in this file may ever read a clock.
// The unit of account is 68000 cycles per frame -- 337,920 exactly -- because
// that is the number the oracle's `work_cycles` census is measured against.

import { MACHINE } from './machine.js';
import { unreached } from './unported.js';

export const NEVER_TRIGGERS = Number.POSITIVE_INFINITY;

export class WorkBudget {
  /**
   * @param {number} unitsPerFrame  THE ONE CALIBRATION CONSTANT.  Default
   *   NEVER_TRIGGERS.  A finite value is only meaningful once somebody has a
   *   real-hardware reference (`NOTES-slowdown-oracle.md`: MAME is authoritative
   *   for WHAT the game computes and not for WHEN).
   */
  constructor(unitsPerFrame = NEVER_TRIGGERS) {
    this.unitsPerFrame = unitsPerFrame;
    this.budgetOfRecord = MACHINE.cyclesPerFrame;   // 337,920, for the report
    this.spent = 0;
    this.exhaustedFrames = 0;
  }
  beginFrame() { this.spent = 0; }
  /** Charge deterministic work.  Never a duration, never a sample of anything. */
  charge(units) { this.spent += units; }
  get exhausted() { return this.spent >= this.unitsPerFrame; }
  /** The (C) path.  Reached = we are about to invent behaviour nobody measured. */
  truncate(romAddress, what) {
    this.exhaustedFrames++;
    unreached(romAddress,
      `${what} -- the work budget ran out and mechanism (C) is UNMEASURED on `
      + `this board (wave 2: slots processed == slots live on all 696 forced-`
      + `overrun frames). What the game truncates first is not known`);
  }
}
