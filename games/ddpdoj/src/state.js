// THE STATE VECTOR -- the columns the port claims, by the oracle's own names.
//
// A port is only verified for the fields it emits.  Everything the port does
// NOT compute (the sprite-list build, the palette upload, the stage script,
// the sound mailbox) is absent from this list ON PURPOSE, and the runner prints
// the unported-call census next to the comparison so "0 divergent frames" can
// never be read as "the whole game agrees".
//
// Column names match `frame.lua`'s COLS and PROBE_WATCH names exactly, so the
// diff is a name-for-name join and not a positional guess.

import { RAM, P } from './machine.js';

/** The PROBE_WATCH spec the oracle must be run with for these columns to
 *  exist.  Kept HERE, next to the reader, so the two cannot drift. */
export const WATCH_SPEC = [
  // THE THREE DERIVED PHASE COUNTERS, $23BEB2..$23BEE0.  Added in wave 5
  // because wave 4 shipped them wrong and NOTHING COULD SEE IT: `CLAIMED` was
  // 31 named columns and the full-RAM digest `d_ram` is in the oracle's TSV but
  // is not compared, so an unported write to unwatched RAM was invisible by
  // construction (`04-review.md` 4).  They are the phase that stage and enemy
  // scripts key off, so wave 5 compares them directly.
  ['c3910', RAM.frameCounterMod4], ['c3912', RAM.frameCounterMod8],
  ['c3914', RAM.frameCounterMod16],
  ['py', RAM.player1 + P.posY], ['px', RAM.player1 + P.posX],
  ['paccy', RAM.player1 + P.velY], ['paccx', RAM.player1 + P.velX],
  ['ptc', RAM.player1 + P.tiltDelay], ['ptilt', RAM.player1 + P.tilt],
  ['pspd', RAM.player1 + P.speedIdx, 'b'], ['pang', RAM.player1 + P.angle, 'b'],
  ['pst', RAM.player1 + P.state], ['pf1', RAM.player1 + P.flags1, 'b'],
  ['pdir', RAM.player1 + P.dirByte, 'b'], ['pbtn', RAM.player1 + P.btnByte, 'b'],
  ['anima0', RAM.player1 + P.animA], ['anima1', RAM.player1 + P.animA + 2],
  ['animb0', RAM.player1 + P.animB], ['animb1', RAM.player1 + P.animB + 2],
  ['o0y', RAM.p1Options + 2], ['o0x', RAM.p1Options + 4],
  ['o1y', RAM.p1Options + 0x22], ['o1x', RAM.p1Options + 0x24],
];

export function watchEnv() {
  return WATCH_SPEC.map(([n, a, sz]) =>
    `${n}=${a.toString(16).toUpperCase()}${sz ? ':' + sz : ''}`).join(',');
}

/** The compared columns, in report order.  `derived` columns come from the
 *  port's own bookkeeping; the rest are read straight out of RAM at the sample
 *  point, exactly as `frame.lua` reads them. */
export function stateVector(game) {
  const r = game.ram;
  const v = {
    lf: game.logicFrame,
    vf: game.videoFrame,
    irq6: game.irq6Count,
    rel: game.releases,
    objn: game.objn,
    objord: game.order.value.toString(),
    objlive: game.objlive(),
    c390a: r.u16(RAM.frameCounter),
    c390d: r.u16(RAM.altPhase & ~1),
    c390e: r.u16(RAM.mod3Phase),
    p1raw: r.u16(RAM.p1raw), p1edge: r.u16(RAM.p1edge), p1prev: r.u16(RAM.p1prev),
    p2raw: r.u16(RAM.p2raw), p2edge: r.u16(RAM.p2edge),
  };
  for (const [n, a, sz] of WATCH_SPEC) {
    v[n] = sz === 'b' ? r.u8(a) : r.u16(a & ~1);
  }
  return v;
}

// CARVE-OUTS.  The project's own precedent: wave 1 carved the RTC date words out
// of `d_ram` into their own reported column and wave 2 carved the dead stack out
// into `d_top`, in both cases because the bytes are real and measured and belong
// to something the comparison does not claim.  Same rule here, one bit wide.
//
//   pst bit 12  = bit 4 of the byte at $8103E6, set by `bset #4,(A6)` at
//                 $2458D8 -- the COLLISION test ("box overlaps: flag the record
//                 and OR $400 into (A5)").  Collision is not ported in wave 4
//                 (the brief says "the ship's hitbox IF REACHABLE"), and the
//                 fly-around scenario pins the invulnerability timer, so the
//                 board flags hits the ship survives.  The player handler clears
//                 the bit again at $24952A before any ported branch reads it, so
//                 masking it changes nothing the port computes.
// The runner PRINTS how many frames the masked bit actually differed on.  A
// carve-out nobody counts is a carve-out that grows.
export const MASKED = { pst: 0x1000 };

/** Columns the port is entitled to claim.  Anything else in the oracle's TSV
 *  is deliberately NOT compared, and the runner says so out loud. */
export const CLAIMED = [
  'lf', 'vf', 'irq6', 'rel', 'c390a', 'c390d', 'c390e',
  'c3910', 'c3912', 'c3914',
  'p1raw', 'p1edge', 'p1prev', 'p2raw', 'p2edge',
  'objn', 'objord', 'objlive',
  'py', 'px', 'paccy', 'paccx', 'ptc', 'ptilt', 'pspd', 'pang',
  'pst', 'pf1', 'pdir', 'pbtn', 'anima0', 'anima1', 'animb0', 'animb1',
];

/** The option columns.  Separate because the option OBJECT is not ported in
 *  wave 4 -- see the worklog.  Listed here so that adding the handler is a
 *  one-line change to CLAIMED and not a change to the differ. */
export const OPTION_COLUMNS = ['o0y', 'o0x', 'o1y', 'o1x'];
