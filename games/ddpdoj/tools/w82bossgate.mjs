#!/usr/bin/env node
// WAVE 82 -- D-SCRIPT 7 AGAINST THE BOARD'S OWN RAM.
//
//   node games/ddpdoj/tools/w82bossgate.mjs [--break NAME] [--quiet]
//
// WHY THIS EXISTS, AND WHAT IT ADMITS.
//
// `seedcmp.mjs` compares 94 columns and **not one of them can see this wave's
// code.**  `src/state.js` traces sprite bucket `$808854` (the shots) under the
// name `sprq`; the boss's OBJECT routines emit into bucket `$805CC8`, which
// nothing in this repo traces.  D-script 7's three fields live in the boss's
// SUB-RECORD, which is not a compared column either.  [M] all eleven of W82's
// mutations leave `--segment 19000` reporting the identical first divergence
// (`vf@lf19160`, the pre-existing slowdown), so the segment sweep is a gate for
// "does it still throw" and is NOT a gate for "is it right".
//
// That is the honest position, and this file is the smallest thing that can be
// a real oracle in spite of it.  The checkpoint ladder does not only hold the
// 94 columns -- **it holds the board's whole 128 KiB of RAM at every rung**, so
// the boss's own animation state at lf19,250 is on disk and was measured by
// MAME.  This gate seeds the port at lf19,000, runs 250 logic frames, and
// compares D-script 7's four fields against that dump.
//
// WHAT IT DOES NOT DO.  It does not oracle the four OBJECT routines: their only
// output is bucket 2, which is drained and rebuilt within a frame and which the
// checkpoint captures at a point in the frame this gate cannot place.  They are
// transcribed from the listing and unit-tested against it, and that is a WEAKER
// claim than this one.  It is stated in the worklog rather than blurred.
//
// A6 IS DERIVED, NOT HARDCODED.  `$2927B6 lea $16(a5),a0 / move.l a0,$81B62A`
// is the boss init publishing its own record for the HP bar, so
// `a5 = $81B62A - $16` and `a6 = (a5+6).l` come out of the board's RAM by an
// instruction.  [M] both dumps agree on $81378C / $81523C.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as portdiff, readTrace } from './portdiff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LADDER = path.join(HERE, 'oracle', 'out', 'w69', 'stage1-sweep');
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const RAM_BASE = 0x800000;

// The window: the boss is dead, D-script 7 and D-script 6 are the only A3
// scripts running, and neither `$812E06` (the scheduler suspend) nor `$8130D2`
// (the death pause) is set at EITHER end -- so the walk runs on all 250 frames.
//
// THE PAIR THIS GATE DELIBERATELY EXCLUDES, with its reason:
// lf19,250 -> lf19,500 has `$812E06 = 1` and `$8130D2 = 1` at the upper rung.
// `$25962E` returns at its FIRST instruction once `$812E06` is set, so D-script
// 7 stops stepping partway through that window at a frame this gate would have
// to model.  [M] it is 83 steps by arithmetic and the board took 82.  Excluding
// it is not tuning: the window is not a window in which the script runs.
const SEG = { from: 19000, to: 19250 };

// MUTATIONS DECLARED EXPECTED-GREEN **ON THIS GATE**, before the run, with the
// reason -- `docs/knowledge/03`: an unexplained pass is not evidence.  Three of
// W82's eleven bite here; the rest are green and every one of them is green for
// a stated reason, not for want of trying.
//
//   d7-no-ramp        [M] the board's `$AF(A6)` is ALREADY 2 at lf19,000, so
//   d7-unsigned-per   both arms of `$2943BE`'s compare are dead for the whole
//                     window, and 2 is positive either way.  Seen RED by
//                     tests/w82stageend.test.js's `d7-period-ramp` (period 5)
//                     and `d7-period-signed` (period $FF) probes.
//   obj2-* obj3-*     the OBJECT routines' only output is sprite bucket 2.
//   obj4-* obj5-*     Nothing in this repo traces it; see the header.  Seen RED
//                     by the unit tests' probes against the listing.
const PERIOD_ALREADY_2 = "the board's $AF(A6) is already 2 at lf19,000, so "
  + "$2943BE's two arms never run in this window and 2 is positive under "
  + 'either reading. Seen red in tests/w82stageend.test.js';
export const EXPECTED_GREEN = {
  'd7-no-ramp': `${PERIOD_ALREADY_2} by the \`d7-period-ramp\` probe`,
  'd7-unsigned-per': `${PERIOD_ALREADY_2} by the \`d7-period-signed\` probe`,
};

// D-script 7's four fields, by the offset the ROM uses.  `$AC` is included
// although `$2943B0` never writes it, because `$292BFA` INDEXES with it and a
// gate that let it drift would be checking half the animation.
const FIELDS = [
  ['$AA (the cursor, $2943D8)', 0xaa, 2],
  ['$AC (the row, $2948A6/$2957AC)', 0xac, 2],
  ['$AE (the tick, $2943B0)', 0xae, 1],
  ['$AF (the period, $2943BE)', 0xaf, 1],
];

function boardRam(lf) {
  return new Uint8Array(readFileSync(
    path.join(LADDER, 'ckpt', `c${String(lf).padStart(6, '0')}.ram.bin`)));
}
/** `$900000`'s 2,048-word tilemap ring, the way `seedcmp.mjs` hands it over. */
function beWords(bytes) {
  const w = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < w.length; i++) w[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return w;
}
const rd = (b, a, n) => (n === 1 ? b[a - RAM_BASE]
  : (b[a - RAM_BASE] << 8) | b[a - RAM_BASE + 1]);

function main(argv) {
  let brk = null, quiet = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--break') brk = argv[++i];
    else if (argv[i] === '--quiet') quiet = true;
  }

  const manifest = JSON.parse(readFileSync(path.join(LADDER, 'manifest.json')));
  const rung = (lf) => manifest.rungs.find((r) => r.lf === lf);
  const lo = rung(SEG.from), hi = rung(SEG.to);
  if (!lo || !hi) throw new Error(`the ladder has no rung ${SEG.from}/${SEG.to}`);

  const board = boardRam(SEG.to);
  const seedBoard = boardRam(SEG.from);
  // $2927B6's derivation, out of the board's own RAM.
  const a5 = (((seedBoard[0x81b62a - RAM_BASE] << 24)
    | (seedBoard[0x81b62b - RAM_BASE] << 16)
    | (seedBoard[0x81b62c - RAM_BASE] << 8)
    | seedBoard[0x81b62d - RAM_BASE]) >>> 0) - 0x16;
  const a6 = (((seedBoard[a5 + 6 - RAM_BASE] << 24)
    | (seedBoard[a5 + 7 - RAM_BASE] << 16)
    | (seedBoard[a5 + 8 - RAM_BASE] << 8)
    | seedBoard[a5 + 9 - RAM_BASE]) >>> 0);

  const trace = readTrace(path.join(LADDER, 'trace.tsv'));
  const r = portdiff(null, path.join(LADDER, 'ckpt', lo.ram), TABLES, {
    trace,
    tables: JSON.parse(readFileSync(TABLES, 'utf8')),
    seedLf: SEG.from,
    untilLf: SEG.to,
    bgSeed: beWords(new Uint8Array(
      readFileSync(path.join(LADDER, 'ckpt', lo.bg)))),
    break: brk,
  });
  if (r.blocked) {
    console.log(`VERDICT: BLOCKED -- ${r.blocked.message ?? r.blocked}`);
    return 2;
  }

  if (!quiet) {
    console.log(`W82 BOSS GATE -- D-script 7 ($2943B0) vs the BOARD's own RAM`);
    console.log(`  ladder  ${path.relative(process.cwd(), LADDER)}`);
    console.log(`  window  lf${SEG.from} -> lf${SEG.to}, ${r.compared} logic `
      + `frames, seeded from the board`);
    console.log(`  A6      $${a6.toString(16).toUpperCase()} (derived: `
      + `$81B62A - $16 -> A5 $${a5.toString(16).toUpperCase()}, then (A5+6).l)`);
    if (brk) console.log(`  BREAK   ${brk}`);
  }

  let bad = 0;
  for (const [name, off, n] of FIELDS) {
    const port = n === 1 ? r.game.ram.u8(a6 + off) : r.game.ram.u16(a6 + off);
    const want = rd(board, a6 + off, n);
    const ok = port === want;
    if (!ok) bad++;
    if (!quiet || !ok) {
      console.log(`  [${ok ? 'OK  ' : 'DIFF'}] ${name.padEnd(34)} `
        + `port=$${port.toString(16).toUpperCase().padStart(n * 2, '0')} `
        + `board=$${want.toString(16).toUpperCase().padStart(n * 2, '0')}`);
    }
  }
  const verdict = bad === 0 ? 'FAITHFUL' : `WRONG -- ${bad} of ${FIELDS.length} fields`;
  console.log(`VERDICT: ${verdict}`);
  return bad === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
