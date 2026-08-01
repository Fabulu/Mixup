// DELIBERATE BREAKAGE -- the red half of the gate.
//
// `docs/knowledge/03`: a check that has never been seen red is not a check.
// The wave brief names the one to try: "Red-validate by breaking the clamp
// order and watching the scenario fail."  Breaking it from OUTSIDE the port,
// through a named switch, keeps the shipped code honest -- there is no
// `if (TESTING)` inside player.js -- and makes the red run reproducible by
// anyone, from the command line, without editing a source file.
//
// Each mutation names the ROM address it falsifies and what a reader should
// expect to see move.  A mutation that does NOT go red is a finding.

import { RAM, P } from '../src/machine.js';
import { CLAMP_ORDER, updatePlayer } from '../src/player.js';

export const MUTATIONS = {
  // THE ONE THE BRIEF ASKS FOR.  $2495CA moves first ($2417F4 adds the vector
  // straight into the record) and $249608/$249648/$24966E/$24968A clamp
  // afterwards, subtracting the overshoot from the velocity accumulator.  A
  // port that clamps the position BEFORE the move is identical everywhere
  // except at a wall -- which is exactly why the scenario pins all four.
  'clamp-first': () => { CLAMP_ORDER.value = 'clamp-first'; },
  // The other order trap in the same routine: $23D12A reads $803974 BEFORE
  // overwriting it, so `edge` is against the PREVIOUS frame's raw.  Deriving
  // the edge after the store makes it permanently zero.
  'edge-after-store': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a === RAM.p1edge) return orig(a, 0);
      return orig(a, v);
    };
  },
  // $24A42A: the bank decays by 4 toward zero.  Removing it leaves the ship
  // banked forever and moves the two animation longs at $8103F0/$8103FA.
  'no-tilt-decay': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a === RAM.player1 + P.tilt) return orig(a, 0);
      return orig(a, v);
    };
  },
  // RENAMED IN WAVE 5, because the wave-4 name was a claim this check cannot
  // support.  `04-review.md` 5 measured it: the $200D20 quadrant tables hold
  // ZERO negative values in 64 levels x 65 entries, and $24183A's `asr.l #4`
  // runs BEFORE the quadrant negation at $241870/$241890/$2418B0 -- so a
  // faithful `lsr.l #4` swap is a provable NO-OP on every value the table can
  // supply, and this mutation never implemented one anyway (it adds
  // sign(dy)).  What it DOES validate is real and worth keeping: that `dy` is
  // compared to the unit, so one unit of movement per frame cannot hide.
  'dy-off-by-one': (game) => {
    const t = game.tables;
    const orig = t.vector.bind(t);
    t.vector = (s, a) => {
      const v = orig(s, a);
      return { dy: v.dy === 0 ? 0 : v.dy + Math.sign(v.dy), dx: v.dx };
    };
  },
  // WAVE 5.  $23BEBC/$23BECE/$23BEE0 mask the three copies of $80390A to
  // mod 4 / mod 8 / mod 16.  Wave 4 ported the copies without the masks and
  // nothing could see it, because those addresses were not compared columns.
  // This mutation restores wave 4's behaviour exactly, so the fix has a
  // permanent red half: it must move c3910/c3912/c3914 on the FIRST compared
  // frame.
  'no-phase-mask': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    const masked = new Set([RAM.frameCounterMod4, RAM.frameCounterMod8,
      RAM.frameCounterMod16]);
    r.setU16 = (a, v) => {
      if (masked.has(a)) return orig(a, r.u16(RAM.frameCounter));
      return orig(a, v);
    };
  },
};

export function breakage(name, game) {
  CLAMP_ORDER.value = 'rom';   // never leak a mutation between runs
  const m = MUTATIONS[name];
  if (!m) {
    throw new Error(`unknown mutation "${name}"; have: ${Object.keys(MUTATIONS).join(', ')}`);
  }
  m(game);
  return name;
}

export { updatePlayer };
