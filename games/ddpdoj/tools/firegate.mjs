#!/usr/bin/env node
// WAVE 12.5 -- THE $24C476 FIRE HANDSHAKE, COMPARED AGAINST THE BOARD.
//
// 12-review F2: all five exits of option formation 2 (`$24C390`) fall into
// `$24C476`, ~30 instructions that write the option block's handshake bits
// `($1,A6).3/.4` and the player's cadence pair `($34,A4)/($35,A4)`.  The port
// returned.  `shipgate` and `flyaround` are both green over it because the
// block is INERT without a fire edge, which is the same shape as a guard tested
// only on the path that does not exercise it.
//
// ============================================================================
// WHY A TRACE REPLAY AND NOT A LIVE GATE -- the honest limit of this wave
// ============================================================================
// `$24C4F2 bra $24D480` is the PODS' SHOT SPAWN.  It is W20's, it is a named
// throw in `src/options.js`, and THE BOARD REACHES IT ON THE FIRST FIRE FRAME:
// a single-frame tap sets the edge byte, `$24C476` takes the edge arm, `$24C498
// bclr #3` finds bit 3 clear, `$24C4AC bclr #4` finds bit 4 clear, and control
// falls into `$24C4D8` and out through `bra $24D480`.  So there is no window in
// which the whole port runs and this block is exercised -- before this wave
// `pgm.py shotgate` blocked on the first tap at `$24C180`, after it the same
// tap blocks at `$24D480`.  Saying "the gate is green" about a block no gate
// can reach would be exactly the wave-12 mistake again.
//
// So the block is driven DIRECTLY off the board's own columns.  Every number on
// both sides is measured; nothing is seeded from a constant in this file.
//
//   FREE-RUNNING (the headline).  Seed `p34`/`p35`/`oflg1` from the board ONCE,
//   at the first frame of the window, then carry the PORT's own outputs forward
//   and compare against the board every frame.  A port that is right for 200
//   frames and then drifts is caught; nothing re-synchronises it.
//
//   RE-SEEDED (the second reading).  Entry state from the board's sample point
//   at frame N-1, inputs from frame N, outputs compared at frame N.  Every
//   frame is an independent board-verified transition, so a divergence names
//   the frame it started on rather than the frame it became visible on.
//
// ============================================================================
// TWO INSTRUMENTS
// ============================================================================
// The VALUES say what came out.  The ELEVEN `PROBE_EXEC` counters
// (`src/state.js FIRE_EXEC`) say which of the block's write sites THE BOARD
// executed -- CURPC-filtered write taps, the reliable 68000 execution hook --
// and `src/options.js FIRE_ARMS` counts the same eleven in the port under the
// same names.  A port that reaches the right values down the wrong arm is green
// on the first instrument and red on the second.
//
//   node tools/firegate.mjs <tsv> [--break NAME] [--from LF]

import { readFileSync } from 'node:fs';
import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import {
  fireHandshake, FIRE_ARMS, FIRE_MUTATE, resetFireArms, OPTION_BLOCKS,
} from '../src/options.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { FIRE_EXEC } from '../src/state.js';
import { ROM } from '../src/machine.js';

const args = process.argv.slice(2);
const tsvPath = args.find((a) => !a.startsWith('--'));
if (!tsvPath) {
  console.error('usage: firegate.mjs <tsv> [--break NAME] [--from LF]');
  process.exit(2);
}
const brk = args.includes('--break') ? args[args.indexOf('--break') + 1] : null;
const fromLf = args.includes('--from') ? Number(args[args.indexOf('--from') + 1]) : 2001;
FIRE_MUTATE.value = brk;

// ------------------------------------------------------------------- the TSV
const lines = readFileSync(tsvPath, 'utf8').trim().split(/\r?\n/);
const head = lines[0].split('\t');
const rows = lines.slice(1).map((l) => {
  const f = l.split('\t');
  const o = {};
  head.forEach((h, i) => { o[h] = f[i]; });
  return o;
});
const NEED = ['lf', 'oedge', 'ohold', 'oflg1', 'p20', 'p34', 'p35', 'p36', 'p37',
  'pf1', ...FIRE_EXEC];
for (const c of NEED) {
  if (!head.includes(c)) {
    console.error(`FAIL the trace has no column '${c}'. Re-run WITHOUT --reuse: `
      + `the TSV predates src/state.js's WATCH_SPEC/EXEC_SPEC.`);
    process.exit(2);
  }
}
const n = (r, c) => Number(r[c]);
const execSum = (r) => FIRE_EXEC.reduce((a, c) => a + n(r, c), 0);

const win = rows.filter((r) => n(r, 'lf') >= fromLf);
if (win.length < 100) {
  console.error(`FAIL only ${win.length} frames at or after lf${fromLf}`);
  process.exit(2);
}

// ------------------------------------------------- the board's own execution
// `sum(FIRE_EXEC) > 0` means THE BOARD RAN THE BLOCK for P1 this frame: every
// path through $24C476 writes at least one of the eleven sites (the edge arm
// always reaches $24C494, the no-edge arm always reaches $24C4BC's read-modify-
// write `bclr`).  It is an execution fact about an UNPORTED neighbour -- the
// pods-not-deployed path $24C934 -- and not a value this block computes, which
// is why it is allowed to choose the window.
let ran = win.filter((r) => execSum(r) > 0);
let idle = win.length - ran.length;

// ------------------------------------------------------- THE BLOCKING RULE
// `$24C476` only ever CLEARS bit 3 of `($1,A6)` ($24C498).  So if the board
// ever takes the bit-3 arm ($24C4A0 `bset #4` / $24C4A6 `clr.b ($35,A4)`),
// SOMETHING OUTSIDE THIS BLOCK SET BIT 3 -- and a `PROBE_WRITERS` census of
// $8104AA-$8104AB over `speedmodes` names it:
//
//   CENSUS writer addr=$8104AA pc=$2497F2 n=60 firstlf=2840
//   CENSUS writer addr=$8104AA pc=$2497DE n=61 firstlf=2840
//
//   2497b2: btst #6,($18,A6) / 2497ba: tst.b ($3c,A6)
//   2497c0: lea $8104AA,A0            <-- THE OPTION BLOCK
//   2497de: bclr #3,($1,A0)
//   2497e4: bchg #4,($1,A6) / bne
//   2497f2: bset #3,($1,A0)
//   2497f8: bset #4,($19,A6)          <-- and it SYNTHESISES the shot edge
//
// i.e. the `$2497BA` AUTO-SHOT block, which `src/player.js` declares with a
// named throw (`ROM.playerBomb`) and does not port.  This instrument drives
// `$24C476` directly, so that throw never fires here and the comparison would
// silently be against a state the port cannot produce.  It BLOCKS instead, the
// way `pgm.py shotgate` blocks on `$24C180`.
const blocker = ran.find((r) => n(r, 'fhb4s') > 0 || n(r, 'fh35z') > 0);
let blockedAt = null;
if (blocker) {
  blockedAt = Number(blocker.lf);
  const before = ran.length;
  ran = ran.filter((r) => Number(r.lf) < blockedAt);
  idle = win.filter((r) => Number(r.lf) < blockedAt).length - ran.length;
  console.log(`BLOCKED at lf${blockedAt}: the board took $24C4A0/$24C4A6, the arm `
    + `whose input -- bit 3 of $8104AB -- is written by $2497F2, inside the `
    + `UNPORTED $2497BA auto-shot block (src/player.js throws on it). `
    + `${before - ran.length} of ${before} in-block frames dropped.`);
}
const ranSet = new Set(ran.map((r) => r.lf));

// ----------------------------------------------------------------- the replay
const ctx = { rom: null, unportedLog: new UnportedLog() };
const B = OPTION_BLOCKS[0];                     // P1; P2's block is all zeros

function step(ram, row) {
  // Inputs the block READS and never writes, from the board at frame N.
  ram.setU8(B.opt + OPT.edge, n(row, 'oedge'));      // $24C13A's copy
  ram.setU8(B.opt + OPT.raw, n(row, 'ohold'));       // $24C134's, for edge-on-raw
  ram.setU16(B.player + 0x20, n(row, 'p20'));        // $24C47E/$24C4E4
  ram.setU8(B.player + 0x36, n(row, 'p36'));         // $24C4D8
  ram.setU8(B.player + 0x37, n(row, 'p37'));         // $24C490
  ram.setU8(B.player + P.flags1, n(row, 'pf1'));     // $24C482/$24C4DC bit 0
  resetFireArms();
  let spawned = 0;
  try {
    fireHandshake(ram, ctx, B);
  } catch (e) {
    if (e instanceof Unreached && e.romAddress === ROM.optionSpawn) spawned = 1;
    else throw e;
  }
  return spawned;
}

function compare(mode) {
  const ram = new Ram();
  let seeded = false;
  const bad = [];
  const armBad = [];
  let compared = 0, spawns = 0, edges = 0, nonzero = 0;
  const armTotalPort = Object.fromEntries(FIRE_EXEC.map((k) => [k, 0]));
  const armTotalBoard = Object.fromEntries(FIRE_EXEC.map((k) => [k, 0]));
  for (let i = 0; i < win.length; i++) {
    const row = win[i];
    // the board did not run the block, or the run is blocked from here on
    if (!ranSet.has(row.lf)) continue;
    if (!seeded || mode === 'reseed') {
      const src = mode === 'reseed' ? (win[i - 1] ?? row) : row;
      ram.setU8(B.player + 0x34, n(src, 'p34'));
      ram.setU8(B.player + 0x35, n(src, 'p35'));
      ram.setU8(B.opt + OPT.flags1, n(src, 'oflg1'));
      seeded = true;
      if (mode === 'free') continue;           // frame 0 is the seed, not a test
    }
    const spawned = step(ram, row);
    compared++;
    spawns += spawned;
    if (n(row, 'oedge') & 0x10) edges++;
    const got = {
      p34: ram.u8(B.player + 0x34),
      p35: ram.u8(B.player + 0x35),
      oflg1: ram.u8(B.opt + OPT.flags1),
    };
    if (got.p34 || got.p35) nonzero++;
    for (const c of ['p34', 'p35', 'oflg1']) {
      if (got[c] !== n(row, c) && bad.length < 8) {
        bad.push(`  ${mode} DIVERGE ${c} lf=${row.lf} port=${got[c]} board=${n(row, c)}`);
      }
    }
    for (const k of FIRE_EXEC) {
      armTotalPort[k] += FIRE_ARMS[k];
      armTotalBoard[k] += n(row, k);
      if (FIRE_ARMS[k] !== n(row, k) && armBad.length < 8) {
        armBad.push(`  ${mode} DIVERGE arm ${k} lf=${row.lf} `
          + `port=${FIRE_ARMS[k]} board=${n(row, k)}`);
      }
    }
    if (mode === 'reseed') {
      // resync so a single bad frame does not cascade
      ram.setU8(B.player + 0x34, n(row, 'p34'));
      ram.setU8(B.player + 0x35, n(row, 'p35'));
      ram.setU8(B.opt + OPT.flags1, n(row, 'oflg1'));
    }
  }
  return { bad, armBad, compared, spawns, edges, nonzero, armTotalPort, armTotalBoard };
}

// -------------------------------------------------------------------- report
console.log(`TSV ${tsvPath}`);
console.log(`WINDOW lf${fromLf}..${win[win.length - 1].lf}: ${win.length} frames, `
  + `${ran.length} with the board IN $24C476, ${idle} without `
  + `(the pods-not-deployed path $24C934, unported)`);
if (brk) console.log(`MUTATION ${brk}`);

const free = compare('free');
const re = compare('reseed');

// THE DONE-WHEN THIS WAVE WAS GIVEN: the bytes must be SEEN NON-ZERO in-window.
console.log(`SEEN  fire edges (oedge bit 4) on ${free.edges} frames; `
  + `the cadence pair non-zero on ${free.nonzero} frames; `
  + `$24D480 (the pod spawn) signalled on ${free.spawns} frames`);
const boardNonZero = ran.filter((r) => n(r, 'p34') || n(r, 'p35')).length;
const boardMax35 = Math.max(...ran.map((r) => n(r, 'p35')));
console.log(`BOARD ($34,A4)/($35,A4) non-zero on ${boardNonZero} of ${ran.length} `
  + `frames; max ($35,A4) = ${boardMax35}`);
console.log('ARMS  ' + FIRE_EXEC.map((k) =>
  `${k}=${free.armTotalPort[k]}/${free.armTotalBoard[k]}`).join(' ') + '   (port/board)');
for (const l of [...free.bad, ...free.armBad, ...re.bad, ...re.armBad]) console.log(l);

const freeBad = free.bad.length + free.armBad.length;
const reBad = re.bad.length + re.armBad.length;
console.log(`RESULT free-running: ${free.compared} frames compared, `
  + `${freeBad === 0 ? '0 DIVERGENT' : freeBad + ' DIVERGENCES (first 8 shown)'}`);
console.log(`RESULT re-seeded:    ${re.compared} frames compared, `
  + `${reBad === 0 ? '0 DIVERGENT' : reBad + ' DIVERGENCES (first 8 shown)'}`);

// A gate that cannot see a fire edge is not a gate on a fire handshake.
if (!brk && free.edges === 0) {
  console.log('FAIL the window contains NO fire edge -- this instrument would be '
    + 'green on a port that deleted the block. Choose a firing scenario.');
  process.exit(1);
}
if (!brk && boardNonZero === 0) {
  console.log('FAIL the board never left ($34,A4)/($35,A4) non-zero in this '
    + 'window; the comparison is all-zeros-vs-all-zeros.');
  process.exit(1);
}
if (blockedAt !== null) {
  console.log(`RESULT the run was BLOCKED at lf${blockedAt} -- disclosed, and a `
    + `non-zero exit even with 0 divergent frames, because a gate that stops `
    + `early and says PASS is the thing this project keeps being bitten by.`);
  process.exit(1);
}
process.exit(freeBad + reBad === 0 ? 0 : 1);
