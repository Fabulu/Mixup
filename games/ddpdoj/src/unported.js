// THE HONEST GAP.
//
// `docs/knowledge/08` and the wave brief: "If you cannot determine what the
// board does, leave it unported with a LOUD NAMED THROW carrying the ROM
// address."  In the Gradius port that design turned a mystery freeze into a
// one-line diagnosis.
//
// There are two different gaps and they need two different mechanisms, because
// conflating them is how a stub becomes a lie:
//
//   Unreached(addr, what)  -- a BRANCH the port does not implement.  If control
//     ever gets here the simulation is wrong from this instant on, so it stops,
//     loudly, naming the ROM address.  Never "handle" it; never return a
//     plausible value.
//
//   note(addr, what)       -- a SUBSYSTEM deliberately outside this wave (the
//     sprite-list build, the coin handler, three of the four gated ISR
//     routines).  It runs every frame, so it cannot throw; instead every call
//     is COUNTED and printed by the runner, and the fields such a routine would
//     have written are excluded from the compared set BY NAME.  A silent
//     no-op is what this file exists to prevent: an exception that stops being
//     mentioned is how the last one survived unexamined from the first deploy.

export class Unreached extends Error {
  constructor(addr, what) {
    super(`UNPORTED $${addr.toString(16).toUpperCase()}: ${what}. `
      + `The port reached a path wave 4 did not translate; every value after `
      + `this frame would be invented. Port it or narrow the scenario.`);
    this.name = 'Unreached';
    this.romAddress = addr;
  }
}

export function unreached(addr, what) {
  throw new Unreached(addr, what);
}

/** Deliberately-out-of-scope subsystems: counted, never silent. */
export class UnportedLog {
  constructor() { this.calls = new Map(); }
  note(addr, what) {
    const k = `$${addr.toString(16).toUpperCase()} ${what}`;
    this.calls.set(k, (this.calls.get(k) ?? 0) + 1);
  }
  /** Sorted "N x $ADDR what" lines, most-called first. */
  report() {
    return [...this.calls.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${String(n).padStart(7)} x ${k}`);
  }
}
