#!/usr/bin/env node
// WAVE 33 -- THE BULLET-BEHAVIOUR KIND CENSUS.
//
//   node tools/w33kindgate.mjs <trace.tsv> <seed.bin> --seed-lf N [--frames N]
//
// W27 review finding F1, restated as a measurement problem:
//
//   "517,445 live-slot rows across every recorded mover corpus contain the
//    behaviour kinds {3,4,5,6,7,12,13,19} and nothing else.  Not one of W27's
//    29 bodies has ever appeared in a board recording."
//
// That number is about the BOARD's corpora.  Nothing in this repo has ever
// reported the same number for THE PORT, and "N fire sites executed" is not it:
// a fire site is a `jsr $281xxx` and a KIND is `D0 & $3F` at that site, and one
// site can be the only site of a kind while forty share another.  W31 reported
// its kind set by a scratch script that was never committed, so the number
// could not be reproduced or regressed.
//
// This tool reports, for one replayed scenario:
//
//   * THE KIND SET -- every `$282030[kind]` the mover dispatched, by kind index
//     and by the ROM address of the body, with an execution count.  The hook is
//     `ctx.bulletKind` in `src/mover.js` at `$281F0E jsr (A1)`, the single
//     instant a behaviour body runs.
//   * which of those are W26 bodies and which are W27's, so "did F1 move" is
//     answered by the tool and not by the reader.
//   * the fire sites, by ROM address, folded from `Game.bulletSpawns` -- so a
//     kind that was FIRED but never reached a behaviour body (dropped by the
//     pool cap, declined by the freeze gate) is distinguishable from one that
//     never fired.
//
// It is a CENSUS, not a comparison: it makes no claim that the port agrees with
// the board about any of it.  `tools/w26movergate.mjs` is the comparison and it
// compares six fields; this answers a question that one cannot see at all.

import { readFileSync } from 'node:fs';
import { Game } from '../src/main.js';

// `27-review-behaviours.md` PRIORITY 4: the eight kinds every recorded corpus
// contains, all W26 bodies.  Everything else is one of W27's 29.
const W26_KINDS = new Set([3, 4, 5, 6, 7, 12, 13, 19]);

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

export function census(tsvPath, seedPath, tablesPath, opts = {}) {
  const rows = readTsv(tsvPath);
  const seed = new Uint8Array(readFileSync(seedPath));
  const tables = JSON.parse(readFileSync(tablesPath, 'utf8'));
  const byLf = new Map(rows.map((r) => [Number(r.lf), r]));
  const seedLf = opts.seedLf ?? Number(rows[0].lf);
  const start = byLf.get(seedLf);
  if (!start) throw new Error(`the trace has no logic frame ${seedLf}`);
  if (start.portin === undefined) {
    throw new Error('the trace has no `portin` column -- the port would be '
      + 'driven by nothing');
  }
  const game = new Game(seed, tables, {
    logicFrame: seedLf, videoFrame: Number(start.vf),
  });
  const pokes = (opts.poke ?? '').split(',').filter(Boolean).map((kv) => {
    const [a, v] = kv.split('=');
    return [parseInt(a, 16), parseInt(v, 16)];
  });
  let ran = 0, blocked = null, lf = seedLf;
  for (lf = seedLf + 1; ; lf++) {
    const row = byLf.get(lf);
    if (!row) break;
    if (opts.frames && ran >= opts.frames) break;
    for (const [a, val] of pokes) game.ram.setU8(a, val);
    try {
      game.step(Number(row.portin));
    } catch (e) {
      if (e.name !== 'Unreached') throw e;
      blocked = { lf, addr: e.romAddress, message: e.message };
      break;
    }
    ran++;
  }
  return { game, ran, blocked, from: seedLf + 1, to: lf - 1 };
}

function main(argv) {
  const [tsv, seedBin] = argv;
  const seedLf = argv.includes('--seed-lf')
    ? Number(argv[argv.indexOf('--seed-lf') + 1]) : undefined;
  const frames = argv.includes('--frames')
    ? Number(argv[argv.indexOf('--frames') + 1]) : 0;
  const poke = argv.includes('--poke') ? argv[argv.indexOf('--poke') + 1] : '';
  const tables = argv.includes('--tables')
    ? argv[argv.indexOf('--tables') + 1]
    : new URL('../rip/port/player.tables.json', import.meta.url).pathname
      .replace(/^\/([A-Za-z]:)/, '$1');
  const r = census(tsv, seedBin, tables, { seedLf, frames, poke });

  console.log(`FRAMES ${r.ran} stepped (lf${r.from}..lf${r.to})`);
  if (r.blocked) {
    console.log(`BLOCKED at lf${r.blocked.lf} by $${
      (r.blocked.addr ?? 0).toString(16).toUpperCase()}`);
    console.log(`        ${r.blocked.message.split('\n')[0]}`);
  }
  const kinds = [...r.game.bulletKinds.entries()].sort((a, b) => a[0] - b[0]);
  const set = kinds.map(([k]) => k);
  console.log(`KINDSET {${set.join(',')}}  -- ${set.length} of 39 kind indices`);
  const w27 = set.filter((k) => !W26_KINDS.has(k));
  console.log(`W27 BODIES EXECUTED: ${w27.length === 0 ? 'NONE'
    : `{${w27.join(',')}}`}   (the W26 eight are {3,4,5,6,7,12,13,19})`);
  for (const [k, e] of kinds) {
    console.log(`  kind ${String(k).padStart(2)}  $${
      e.addr.toString(16).toUpperCase()}  ${String(e.n).padStart(7)} dispatches`
      + `  ${W26_KINDS.has(k) ? 'W26' : 'W27 <<<'}`);
  }
  const sites = [...r.game.bulletSpawns.entries()].sort();
  console.log(`FIRE SITES ${sites.length}`);
  for (const [site, e] of sites) {
    console.log(`  ${site.padEnd(9)} fired ${String(e.fired).padStart(5)}`
      + `  spawned ${String(e.spawned).padStart(5)}`
      + `  declined ${String(e.declined).padStart(4)}`
      + `  dropped ${String(e.dropped).padStart(4)}`);
  }
  return r.blocked ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  process.exit(main(process.argv.slice(2)));
}
