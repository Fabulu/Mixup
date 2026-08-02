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
import { SHIP_MUTATE } from '../src/shipsprite.js';

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

  // ------------------------------------------------------------------ WAVE 8
  // Four mutations over the shot subsystem.  Each names the instruction it
  // falsifies and the column that must move, because a mutation whose name is
  // broader than what it breaks is the defect `05-review.md` filed against
  // `clamp-first`.

  // $24A32E, the four instructions that make $24A2D6 different from $24A222:
  // `subq.w #4,($44,A6) / bcc / move.w #$4,($44,A6)`, run ONCE PER SECONDARY
  // SPAWN.  This mutation is the port as it stood before the difference was
  // measured -- treat the three fillers as one routine and leave ($44,A6)
  // alone.  It must move `p44` on the first spawn and then `shot1`/`shot2` at
  // byte 181 (the fourth record's ($24,A6)), and it must break the sprite-
  // request containment, because ($24,A6) picks the record's ($a,A6).
  'no-secondary-tail': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a === RAM.player1 + 0x44) return orig(a, r.u16(a));
      return orig(a, v);
    };
  },

  // $23F3DE `move.l D0,(A0)+` -- the FIRST longword of the 12-byte sprite
  // request, i.e. the drawn (y,x) the enqueue packs at $23F3C6..$23F3D8.
  // Adding one to the Y word falsifies exactly the enqueue's output and
  // nothing else in the port, so it must break SPRQ CONTAINMENT and leave the
  // 52 compared columns green.  That separation is the point: it proves the
  // containment check is a check and not decoration.
  'enqueue-off-by-one': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a >= 0x808854 && a < 0x808eb4 && ((a - 0x808854) % 12) === 0) {
        return orig(a, (v + 1) & 0xffff);
      }
      return orig(a, v);
    };
  },

  // $253BC6 `subq.w #4,($24,A6) / bcc / move.w #$4,($24,A6)` -- the animation
  // index the handler steps every frame, which picks the record's ($a,A6) at
  // $253BC0.  Freezing it must move `shot1`/`shot2` AND break containment.
  'no-anim-step': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      const inShots = a >= 0x810572 && a < 0x810c32;
      if (inShots && ((a - 0x810572) % 0x30) === 0x24) return orig(a, r.u16(a));
      return orig(a, v);
    };
  },

  // $253A7C/$253AA0 -- the LIVE SHOT COUNT $81295C.  It is a REPORTED column,
  // not a claimed one (the option pods make the two sides differ by
  // construction), so this mutation exists to prove the REPORTED channel is
  // real rather than decorative: it must change the printed drift and it must
  // NOT change the RESULT line.  A mutation expected to stay green is still a
  // measurement, as long as the expectation is written down first -- and the
  // runner reports it as EXPECTED-GREEN rather than as a pass.
  'no-live-count': (game) => {
    const r = game.ram;
    const orig = r.setU16.bind(r);
    r.setU16 = (a, v) => {
      if (a === 0x81295c) return orig(a, 0);
      return orig(a, v);
    };
  },

  // ----------------------------------------------------------------- WAVE 12
  // $249E78 `move.l (A0,D0.w),($14,A6)` writes the ship's X HALF-EXTENTS from
  // $2553F2, indexed by the tilt.  Wave 4 called that long `animB`, believed it
  // was animation, and never compared it; the hitbox has been BLOCKED since
  // wave 2 partly because of that.  This mutation banks the SPRITE correctly
  // and freezes the HITBOX at the tilt-0 entry -- a port that looks perfect on
  // screen and is wrong about every collision.  It must move `animb0`/`animb1`
  // during the L/R sweeps of fly-around (lf2320-2420 and lf2440-2540) and it
  // must leave every bucket-19 byte alone.
  'hitx-frozen': () => { SHIP_MUTATE.value = 'hitx-frozen'; },
  // $24C096 is RUN from wave 12 on.  Not running it is wave 11's behaviour, and
  // it must move the four option columns and both bucket-15 records.
  'no-option-object': () => { SHIP_MUTATE.value = 'no-option-object'; },
  // $24D12E moves each pod off the ship by one frame of its own velocity.
  // Skipping the move is EXACTLY WHAT THE PAGE'S SPLICE DID -- a rigid offset
  // from the ship -- so this mutation is the old behaviour, and if it stayed
  // green the gate would not be able to tell the two apart.
  'pods-rigid': () => { SHIP_MUTATE.value = 'pods-rigid'; },
  // $24D160/$24D164 `move.w D3,D0 / asr.w #2,D0`.  Rounding toward zero instead
  // of toward -infinity moves pod 1 by ONE unit of 1/64 px -- MEASURED $0C9E
  // against the board's $0C9D -- and the sprite enqueue's `asr.l #6` throws that
  // unit away, so NO PICTURE CAN EVER SEE IT.  It is red on `o1x` here and
  // declared EXPECTED-GREEN on `pgm.py shipgate`.  A real arithmetic difference
  // that the framebuffer cannot show is the argument for compared columns in
  // one line.
  'pod-asr-toward-zero': () => { SHIP_MUTATE.value = 'pod-asr-toward-zero'; },
};

/** Mutations that are EXPECTED to leave the RESULT line green, with the reason.
 *  Declared here, before the run, so "it passed" cannot be read after the fact
 *  as "the gate is fine". */
export const EXPECTED_GREEN = {
  'no-live-count': 'the live-shot count $81295C is a REPORTED column, not a '
    + 'claimed one -- this mutation must move its printed drift (measured: 106 '
    + 'differing frames -> 124) and must NOT move the RESULT line',
};

/** WAVE 12.5 -- the `pgm.py firegate` mutations that are EXPECTED to leave the
 *  RESULT line green ON `stage1-shot`, each with the MEASUREMENT that says why
 *  and the test that DOES see it fail.  Declared before the run, for the same
 *  reason `EXPECTED_GREEN` is: an unexplained pass is not evidence.
 *
 *  All three numbers below are from `out/w12_5/stage1-shot.fire.tsv`, 2,572
 *  frames, lf2001..4572. */
export const FIRE_EXPECTED_GREEN = {
  'edge-on-raw': 'MEASURED: the raw byte ($40,A6) and the edge byte ($41,A6) '
    + 'agree on bit 4 on ALL 2,572 frames -- `stage1-shot` taps Button 1 for '
    + 'exactly one frame at a time, so every held frame is also an edge frame. '
    + 'Seen red instead by tests/fire.test.js "the gate is the EDGE byte", '
    + 'which supplies raw=$10 with edge=$00 -- the state a HOLD produces',
  'burst-mask-6': 'MEASURED: ($21,A4) is 0 on all 2,572 frames (the whole word '
    + '($20,A4) is 0), so `lsr.b #1` and the ship twin\'s `lsr.w #1 / andi.b '
    + '#6` both yield 0 and the difference cannot appear. Seen red instead by '
    + 'tests/fire.test.js "$24C48E is lsr.b with NO mask", which sets '
    + '($21,A4) = $0E: $0E>>1 = 7, 7 & 6 = 6',
  'delay-no-two': 'MEASURED: bit 0 of ($1,A4) is 0 on all 2,572 frames and '
    + '($20,A4) is never 8, so $24C4EC\'s `moveq #$2,D0` arm is never taken '
    + 'and the reload is always ($36,A4). Seen red instead by '
    + 'tests/fire.test.js "$24C4E4 compares the WORD ($20,A4) against 8"',
};

export function breakage(name, game) {
  CLAMP_ORDER.value = 'rom';   // never leak a mutation between runs
  SHIP_MUTATE.value = null;    // ...and the same for wave 12's seam
  const m = MUTATIONS[name];
  if (!m) {
    throw new Error(`unknown mutation "${name}"; have: ${Object.keys(MUTATIONS).join(', ')}`);
  }
  m(game);
  return name;
}

export { updatePlayer };
