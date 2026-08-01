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

  // ---------------------------------------------------------------- WAVE 8
  // THE SHOT SUBSYSTEM.  Named scalars first, because a digest tells you THAT
  // something moved and a first-divergence report has to say WHAT.
  ['nshot', 0x81295c],                 // $253A7C/$253AA0, and the frame-sync
                                       // governor $23C272 sums it: not stats
  ['rng', 0x803916],                   // $2433AE's whole state, one word
  ['q6', 0x80afd6],                    // the shot bucket's byte count.  0 at
                                       // every sample point ($23D70C clears it)
                                       // -- compared so a port that forgets the
                                       // reset is caught on frame 2, not never
  ['scroll', 0x813176],                // $253A76 -> $253AA6, and $2496EE.  The
                                       // port NEVER WRITES THIS: it is produced
                                       // by $26151E inside the unported
                                       // background object.  Comparing it makes
                                       // the failure point at the cause
  ['p2a', RAM.player1 + 0x2a, 'b'],    // the cadence delay ($249BAC/$249BDE)
  ['p2b', RAM.player1 + 0x2b, 'b'],    // the cadence counter, and $249CB0's
                                       // clear is the shot table's feedback
  ['p3a', RAM.player1 + 0x3a, 'b'],    // $249D0C's fire-sound gate
  ['p3c', RAM.player1 + 0x3c, 'b'],    // $249B50 / $249B96
  ['p42', RAM.player1 + 0x42],         // $24A238/$24A26E: the 8,4,0 phase the
                                       // spawn reads AND writes
  ['p44', RAM.player1 + 0x44],         // -> the new shot's ($24,A6)
  // Slot 14 (the first PRIMARY slot) and slot 21 (the first SECONDARY slot),
  // by name.  $810572 + $2A0 and + $3F0, the two bases $249C5C/$249C60 use.
  ['s14t', 0x810812], ['s14y', 0x810814], ['s14x', 0x810816],
  ['s14a', 0x81081c], ['s14v', 0x81083e],
  ['s21t', 0x810962], ['s21y', 0x810964], ['s21x', 0x810966],

  // --------------------------------------------------------------- WAVE 11
  // MAIN-LOOP CALL #4 ($23D2AE) IS NOW PORTED WHOLE, so every word it writes
  // enters the compared set in the same commit -- wave 5's rule 7.  The split
  // between CLAIMED and DISPLAYLIST_REPORTED below is not tidiness: three of
  // these are functions of ALL THIRTY buckets, and the port has a producer for
  // exactly one of them, so claiming them in a scenario like `fly-around` would
  // be claiming the enemies.
  ['b002', 0x80b002],       // $23D3BC -- "bucket 20 was dropped this frame"
  ['b004', 0x80b004],       // $23D3D8 -- "buckets 6 and 9 were dropped"
  ['b054', 0x80b054, 'l'],  // THE STANDING WATCH.  $00000000 on every frame
                            // anyone has ever sampled (1,901 here, 5,000 in
                            // 10-recon-display-list). Six writers, none read.
                            // If it ever moves, the emit's `add.l` carries
                            // between the coordinate fields and the $3FFF
                            // re-mask can pollute the ZOOM nibble -- so it is a
                            // compared column from the wave that first depends
                            // on it, not from the wave that first sees it move.
  ['affc', 0x80affc],       // $23D62A -- the PREVIOUS frame's queue length, and
                            // the one word $23D70C's thirty-word clear does NOT
                            // reach.  Function of all 30 buckets: REPORTED.
  ['affe', 0x80affe],       // $23D38C -- records over budget (SIGNED: negative
                            // on a normal frame).  Function of all 30: REPORTED
  ['b000', 0x80b000],       // $23D382 -- bytes over budget, and $23D3C4
                            // subtracts bucket 20's count from it in place
];

/** PROBE_RAWDUMP ranges: byte-for-byte columns, compared as hex strings so a
 *  divergence report can name the record and the field.
 *
 *  `shot1`/`shot2` are the TEN SLOTS THE PLAYER'S OWN SPAWN CAN REACH --
 *  $249C5C's `lea ($2a0,A0),A0` (slots 14..18) and $249C60's `lea ($150,A0),A4`
 *  (slots 21..25).  Five each because the scan length is the ROM word behind
 *  $8127E4 (MEASURED 4) and $249C6C's cap to 3 applies only when $81308C is
 *  zero, which it is not ($81308C = $0001, printed by every run).  The other 26
 *  slots are NOT compared and the reason is measured, not assumed: the OPTION
 *  PODS spawn into the same table at offset $150 ($24D4A0 `move.w #$150,D0`,
 *  i.e. slots 7..11) through $24C096, one of the 22 unported subsystem calls
 *  inside object type 5.
 *
 *  `sprq` is the sprite-request bucket the shot handlers append to. The option
 *  pods' shots land in the SAME bucket and BEFORE the player's (the driver
 *  walks slot 0 upwards), so this column is compared by CONTAINMENT -- every
 *  12-byte record the port emitted must appear verbatim in the board's bucket
 *  -- and never as equality.  Saying which of the two it is, out loud, is the
 *  point: an equality check here would be red for a reason that is not a bug.
 */
export const RAWDUMP_SPEC = [
  ['shot1', 0x810812, 5 * 0x30],
  ['shot2', 0x810962, 5 * 0x30],
  ['sprq', 0x808854, 0x120],           // 24 records; the bucket is $660 long
  // WAVE 11: all THIRTY bucket counters, $80AFC0..$80AFFB.  They are zero at
  // every sample point because call #4's tail clears them ($23D70C), and that
  // is exactly why they are here: a port that forgets the reset is caught on
  // frame two rather than never.  Wave 8 compared one of them (`q6`) for the
  // same reason; this is the other twenty-nine.
  ['sprctr', 0x80afc0, 0x3c],
];

/** PROBE_EXEC: instructions whose per-frame execution count is a column. */
export const EXEC_SPEC = [
  // $245044 `bset #$7,(-$3,A6)` -- the shot-vs-enemy damage routine, and the
  // ONLY writer of bit 7 of a shot record's low byte.  That bit is the gate
  // into the handlers' HIT path, which src/shots.js deliberately does not
  // translate.  MEASURED on stage1-open: 436 executions over 182 of 2,600
  // frames.
  //
  // TWO COLUMNS, and the difference between them is the whole reason the
  // scenario is possible at all.  `hitex` taps only the TEN RECORDS THE GATE
  // COMPARES ($810812..$810A51); `hitany` taps the whole P1 shot table.  A hit
  // on an OPTION POD's shot (slots 7..11, an unported subsystem the port does
  // not model at all) touches no compared byte, so gating on the wide range
  // would refuse windows for a reason that is not a defect.  The gate FAILS on
  // `hitex`; `hitany` is REPORTED, so the narrowing is visible and counted
  // rather than quietly assumed to be harmless.
  ['hitex', 0x245044, 0x810812, 0x810a51],
  ['hitany', 0x245044, 0x810572, 0x810c31],
];

export function watchEnv() {
  return WATCH_SPEC.map(([n, a, sz]) =>
    `${n}=${a.toString(16).toUpperCase()}${sz ? ':' + sz : ''}`).join(',');
}

export function rawdumpEnv() {
  return RAWDUMP_SPEC.map(([n, a, l]) =>
    `${n}=${a.toString(16).toUpperCase()}:${l.toString(16).toUpperCase()}`).join(',');
}

export function execEnv() {
  return EXEC_SPEC.map(([n, pc, lo, hi]) => `${n}=${pc.toString(16).toUpperCase()}`
    + `:${lo.toString(16).toUpperCase()}:${hi.toString(16).toUpperCase()}`).join(',');
}

/** The raw dumps, as the oracle prints them: lower-case hex, no separators. */
export function rawdumps(game) {
  const o = {};
  for (const [n, a, len] of RAWDUMP_SPEC) {
    let s = '';
    for (let i = 0; i < len; i++) s += game.ram.u8(a + i).toString(16).padStart(2, '0');
    o[n] = s;
  }
  return o;
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
  Object.assign(v, rawdumps(game));
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
  // WAVE 8.  Present in a trace only when the scenario asked for them, and
  // `portdiff.mjs` compares whatever of CLAIMED the trace actually carries --
  // so `fly-around` keeps its 34 columns and `stage1-shot` gets 55.
  'q6', 'scroll',
  'p2a', 'p2b', 'p3a', 'p3c', 'p42', 'p44',
  's14t', 's14y', 's14x', 's14a', 's14v', 's21t', 's21y', 's21x',
  'shot1', 'shot2',
  // WAVE 11.  Claimed because the port computes them from state it HAS: the
  // two drop flags are cleared every frame and only set on an over-budget frame
  // (which never happens in a natural scenario -- and `pgm.py dlgate --cap`
  // forces one and compares it); $80B054 the port never writes at all, so
  // comparing it is what turns "it was zero" from an assumption into a watch;
  // and the thirty counters are zero on both sides because both clear them.
  'b002', 'b004', 'b054', 'sprctr',
];

/** WAVE 11 -- call #4's BUDGET ARITHMETIC, traced and DELIBERATELY NOT CLAIMED.
 *
 *  `b000`, `affe` and `affc` are functions of ALL THIRTY bucket counters, and
 *  the port has a ported producer for exactly ONE of them (bucket 14, the
 *  shots).  In a scenario like `fly-around` the board's sum includes the
 *  enemies, the options, the bullets and the explosions; the port's does not.
 *  Claiming these columns there would be claiming the enemies.
 *
 *  They ARE compared, byte for byte, on every one of the 1,901 build-B frames
 *  of `stage1-open` -- by `pgm.py dlgate`, which feeds the port the BOARD's
 *  staged bucket bytes so the sum has the same thirty inputs on both sides.
 *  That is the right gate for them, and this note is where the split is
 *  written down instead of being inferred from an absence. */
export const DISPLAYLIST_REPORTED = ['b000', 'affe', 'affc'];

/** The option columns.  Separate because the option OBJECT is not ported in
 *  wave 4 -- see the worklog.  Listed here so that adding the handler is a
 *  one-line change to CLAIMED and not a change to the differ. */
export const OPTION_COLUMNS = ['o0y', 'o0x', 'o1y', 'o1x'];

/** WAVE 8 -- traced, printed with its drift, and DELIBERATELY NOT CLAIMED.
 *
 *  `nshot` is $81295C, and $253A7C/$253AA0 count the WHOLE 36-slot table: the
 *  player's ten records AND the OPTION PODS' shots in slots 0..12.  The pods
 *  fire alongside the ship through $24D484, reached from $24C096 -- one of the
 *  22 subsystem calls inside object type 5 that this wave does not port.  So
 *  the board keeps creating shot records the port cannot create, and the count
 *  drifts apart the first time a pod fires.
 *
 *  This is not a technicality to be filed away: $81295C is READ BY THE FRAME
 *  SYNC GOVERNOR ($23C272 sums $81B40C + $81295C + 2*$81295E against a
 *  threshold), so a wrong count can change WHEN a frame is armed.  The column
 *  that would catch that is `irq6`, which IS claimed -- and the runner prints
 *  nshot's maximum drift next to it, because "it never mattered in this window"
 *  is a measurement and not a get-out. */
export const REPORTED_COLUMNS = ['nshot', 'rng', ...DISPLAYLIST_REPORTED];

// `rng` is $803916, the whole state of $2433AE.  It is TRACED AND REPORTED for
// the same shape of reason as `nshot`, and the reason was measured rather than
// assumed: in the NON-HIT path the four translated shot handlers never draw at
// all, so the port advances the counter on exactly zero frames, while the
// board's other subsystems -- including $289F54, which bumps the same byte at
// $289F62 before it does anything else -- draw whenever they like.  MEASURED on
// stage1-shot: the two sides part company at lf4480 with a gap of 4.
//
// It is here rather than in CLAIMED because a column the port cannot compute is
// not a column the port can claim.  It is TRACED rather than dropped because
// NOTES-replay.md constraint 2 says the board's RNG state belongs in the state
// vector, and because the first thing a future wave that ports a drawing
// subsystem will want is the drift it has to close.
