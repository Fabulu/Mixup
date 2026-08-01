#!/usr/bin/env node
// WAVE 4's GATE: run the port against an oracle trace, frame for frame.
//
//   node tools/portdiff.mjs <trace.tsv> <seed.bin> [--seed-lf N] [--break X]
//
// The oracle trace comes from `python tools/oracle/pgm.py flyaround`, which
// runs the scenario with PROBE_PORTIN (the hardware input word, one per LOGIC
// frame) and PROBE_WATCH (the player record).  The seed is the whole 128 KiB of
// main RAM at the sample point of `--seed-lf`, dumped by the same run.
//
// SO THE COMPARISON IS: same initial state + same input sequence => same state,
// every logic frame.  That is the oracle property and the replay property at
// the same time (NOTES-replay.md), which is why the determinism check below
// costs one extra run rather than a second mechanism.
//
// FIRST DIVERGENCE PER COLUMN, never "N frames differ": a single wrong constant
// makes every downstream field wrong at once, and the report has to point at
// the cause rather than the blast radius (docs/knowledge/01).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Game } from '../src/main.js';
import { stateVector, CLAIMED, OPTION_COLUMNS, MASKED } from '../src/state.js';
import { breakage } from './breakage.mjs';
import { CLAMP_ORDER } from '../src/player.js';

function readTsv(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => {
    const f = l.split('\t');
    const o = {};
    head.forEach((h, i) => { o[h] = f[i]; });
    return o;
  });
}

export function run(tsvPath, seedPath, tablesPath, opts = {}) {
  const rows = readTsv(tsvPath);
  const seed = new Uint8Array(readFileSync(seedPath));
  const tables = JSON.parse(readFileSync(tablesPath, 'utf8'));
  const byLf = new Map(rows.map((r) => [Number(r.lf), r]));
  const seedLf = opts.seedLf ?? Number(rows[0].lf);
  const start = byLf.get(seedLf);
  if (!start) throw new Error(`the trace has no logic frame ${seedLf}`);
  if (start.portin === undefined) {
    throw new Error('the trace has no `portin` column -- re-run the oracle with '
      + 'PROBE_PORTIN=1, or the port would be fed its own answer');
  }

  const game = new Game(seed, tables, {
    logicFrame: seedLf,
    videoFrame: Number(start.vf),
    budgetUnits: opts.budgetUnits,
  });
  // `CLAMP_ORDER` is a module-level mutable switch, so an in-process caller that
  // ran `--break clamp-first` and then a clean run would carry the mutation
  // (`04-review.md` 8).  Reset it on EVERY run, not only inside breakage().
  CLAMP_ORDER.value = 'rom';
  if (opts.break) breakage(opts.break, game);

  const pokes = (opts.poke ?? '').split(',').filter(Boolean).map((kv) => {
    const [a, v] = kv.split('=');
    return [parseInt(a, 16), parseInt(v, 16)];
  });
  const seeded = stateVector(game);
  // The seed must already agree ON THE RAM-DERIVED COLUMNS, or the divergence
  // being hunted is a bad dump rather than a bad port.  `irq6`, `rel`, `objn`
  // and `objord` are per-frame bookkeeping the port has not produced yet at the
  // seed and are excluded by name rather than by a blanket "close enough".
  const SEED_SKIP = new Set(['irq6', 'rel', 'objn', 'objord']);
  const seedBad = CLAIMED.filter((c) => start[c] !== undefined
    && !SEED_SKIP.has(c) && String(seeded[c]) !== String(start[c]));
  const cols = CLAIMED.filter((c) => start[c] !== undefined);
  const optCols = OPTION_COLUMNS.filter((c) => start[c] !== undefined);
  const first = new Map();
  const maskHits = new Map(), maskFirst = new Map();
  const digest = createHash('sha256');
  let compared = 0, last = seedLf;
  const dilated = [];
  const vfSkew = [];
  // THE BOARD HAS TWO INDEPENDENT VIDEO-FRAME MEASURES AND THEY DISAGREE.
  // `vf` is MAME's `screen:frame_number()` sampled at the arm write; `irq6` is
  // the interrupt-acknowledge census.  MEASURED on the first fly-around run:
  // they disagree on 6 of 2,200 frames (deltas 0 and 2), because the arm can
  // land either side of the instant MAME advances its screen counter.  The
  // GAME never reads either one, so this is an oracle-side sampling artifact,
  // and it is reported rather than absorbed -- the same treatment wave 1 gave
  // $80FA84.  The port's videoFrame is compared against the board's cumulative
  // vblank COUNT, which is the quantity it actually models.
  let boardVf = Number(start.vf);

  for (let lf = seedLf + 1; ; lf++) {
    const row = byLf.get(lf);
    if (!row) break;
    const prevBoardVf = boardVf;
    boardVf += Number(row.irq6);
    if (Number(row.vf) !== boardVf) {
      vfSkew.push({ lf, screen: Number(row.vf), vblanks: boardVf,
        delta: Number(row.vf) - prevBoardVf, irq6: Number(row.irq6) });
    }
    // NOT resynchronised to MAME's screen counter: `vf` is compared against the
    // cumulative VBLANK COUNT and nothing else, so the column says exactly what
    // the port modelled.  It is therefore a restatement of `irq6` rather than
    // an independent field, and that is stated instead of implied.
    // THE SAME POKE, AT THE SAME POINT.  `frame.lua` writes it after emit(), so
    // the recorded row is always the game's own value and the poke is consumed
    // by the NEXT logic frame.  Applying it anywhere else here would make the
    // two sides different experiments.
    for (const [a, val] of pokes) game.ram.setU8(a, val);
    game.step(Number(row.portin));
    const v = stateVector(game);
    digest.update(cols.map((c) => String(v[c])).join('\t') + '\n');
    for (const c of cols) {
      let board = c === 'vf' ? String(boardVf) : String(row[c]);
      let port = String(v[c]);
      if (MASKED[c] !== undefined) {
        const m = ~MASKED[c];
        if ((Number(board) & MASKED[c]) !== (Number(port) & MASKED[c])) {
          maskHits.set(c, (maskHits.get(c) ?? 0) + 1);
          if (!maskFirst.has(c)) maskFirst.set(c, lf);
        }
        board = String(Number(board) & m);
        port = String(Number(port) & m);
      }
      if (port !== board && !first.has(c)) {
        first.set(c, { lf, port: v[c], board: row[c] });
      }
    }
    if (Number(row.irq6) !== v.irq6) dilated.push(lf);
    compared++; last = lf;
  }

  return {
    seedLf, last, compared, seedBad, cols, optCols, first, dilated, vfSkew, game, pokes, maskHits, maskFirst,
    digest: digest.digest('hex'),
    optionFirst: new Map(optCols.map((c) => {
      for (let lf = seedLf + 1; lf <= last; lf++) {
        // the option columns are read from the SEEDED ram, which the port never
        // writes -- report where the board first left the seed behind
        const row = byLf.get(lf);
        if (row && String(row[c]) !== String(start[c])) return [c, lf];
      }
      return [c, null];
    })),
  };
}

function main() {
  const argv = process.argv.slice(2);
  const pos = argv.filter((a) => !a.startsWith('--'));
  const flag = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i < 0 ? d : argv[i + 1];
  };
  if (pos.length < 2) {
    console.error('usage: portdiff.mjs <trace.tsv> <seed.bin> [--tables path] '
      + '[--seed-lf N] [--break NAME]');
    return 2;
  }
  const tables = flag('tables',
    fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url)));
  const r = run(pos[0], pos[1], tables, {
    seedLf: flag('seed-lf') !== undefined ? Number(flag('seed-lf')) : undefined,
    break: flag('break'),
    poke: flag('poke'),
  });

  console.log(`SEED   lf=${r.seedLf}  ${r.compared} logic frames compared `
    + `(lf ${r.seedLf + 1}..${r.last})`);
  console.log(`COLS   ${r.cols.length} compared: ${r.cols.join(' ')}`);
  if (r.optCols.length) {
    const moved = [...r.optionFirst].filter(([, lf]) => lf !== null);
    console.log(`NOT COMPARED (option object $24902A/$24C310 is UNPORTED): `
      + `${r.optCols.join(' ')} -- the board moves them from lf `
      + `${moved.length ? Math.min(...moved.map(([, lf]) => lf)) : 'never'}`);
  }
  for (const s of r.seedBad) {
    console.log(`SEEDBAD ${s}: the port's seeded value already differs`);
  }
  console.log(`UNPORTED calls (counted, never silent):`);
  for (const l of r.game.unportedLog.report()) console.log('  ' + l);
  console.log(`FROZEN globals read but never written by the port:`);
  for (const f of r.game.frozen) {
    console.log(`  $${f.addr.toString(16).toUpperCase()} = `
      + `$${f.value.toString(16).padStart(4, '0')}  ${f.why}`);
  }
  if (r.pokes.length) {
    console.log(`POKED (both sides, at the sample point, after the row is `
      + `recorded): ${r.pokes.map(([a, v]) => `$${a.toString(16).toUpperCase()}`
      + `=$${v.toString(16).toUpperCase()}`).join(' ')}`);
  }
  // ALLOCATION EVENTS. Empty is the expected result on a scenario that spawns
  // nothing, and printing the empty line is the point: a counter that is only
  // shown when it is non-zero cannot be told from a counter nobody installed.
  console.log(`ALLOC events ($24111E/$241182/$2411E2/$241238): `
    + (r.game.allocEvents.size
      ? [...r.game.allocEvents].map(([k, n]) => `${k}=${n}`).join(' ')
      : 'none -- no object was created, evicted or killed in this window'));
  console.log(`WALLHITS ${r.game.wallHits.length} ($261126) `
    + `[${[...new Set(r.game.wallHits.map((w) => w.which))].join(', ')}]`);
  if (r.vfSkew.length) {
    console.log(`VFSKEW ${r.vfSkew.length} frames where the ORACLE's two video-`
      + `frame measures disagree (MAME's screen counter vs the vblank census); `
      + `the game reads neither. ` + r.vfSkew.slice(0, 6)
        .map((s) => `lf${s.lf}:screen+${s.delta}/irq6=${s.irq6}`).join(' '));
  }
  if (r.dilated.length) {
    console.log(`DILATED ${r.dilated.length} logic frames spanned more than one `
      + `video frame on the BOARD: lf ${r.dilated.slice(0, 8).join(',')}`
      + `${r.dilated.length > 8 ? ' ...' : ''} -- MAME-timed, uncalibrated; the `
      + `port's budget never triggers so it cannot predict these`);
  }
  for (const [c, m] of Object.entries(MASKED)) {
    if (!r.cols.includes(c)) continue;
    console.log(`MASKED ${c} bit $${m.toString(16)}: differed on `
      + `${r.maskHits.get(c) ?? 0} of ${r.compared} frames, first at lf`
      + `${r.maskFirst.get(c) ?? '-'} (see src/state.js MASKED for why)`);
  }
  console.log(`DIGEST ${r.digest}`);
  if (r.first.size === 0 && r.seedBad.length === 0) {
    console.log(`RESULT 0 DIVERGENT FRAMES on ${r.cols.length} columns over `
      + `${r.compared} logic frames`);
    return 0;
  }
  for (const [c, d] of [...r.first].sort((a, b) => a[1].lf - b[1].lf)) {
    console.log(`DIVERGE ${c.padEnd(8)} first at lf=${d.lf}: `
      + `port=${d.port} board=${d.board}`);
  }
  console.log(`RESULT ${r.first.size} of ${r.cols.length} columns diverged`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('portdiff.mjs')) {
  process.exit(main());
}
