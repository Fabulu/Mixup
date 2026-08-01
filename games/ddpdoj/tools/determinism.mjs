#!/usr/bin/env node
// THE REPLAY PROPERTY, tested at the point it is cheapest to keep.
//
// `PLAN-vertical-slice.md` wave 4: "the same scenario, run twice from the same
// inputs in the same process and in two separate processes, produces
// byte-identical state digests."  Both halves matter and they fail differently:
//
//   SAME PROCESS   catches state that leaked between runs -- a module-level
//                  cache, a mutated table, a `CLAMP_ORDER` left switched.
//   TWO PROCESSES  catches anything that came from OUTSIDE the (initial state,
//                  input sequence) pair: a clock, a host frame rate, a hash
//                  seed, iteration order over a Map keyed by object identity.
//
// A single-process double run cannot see the second class and a two-process run
// cannot see the first, so neither one alone is the test.
//
//   node tools/determinism.mjs <trace.tsv> <seed.bin> [--seed-lf N] [--poke ...]
//   node tools/determinism.mjs ... --once      (one run, print the digest)

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from './portdiff.mjs';

function main() {
  const argv = process.argv.slice(2);
  const pos = argv.filter((a) => !a.startsWith('--'));
  const flag = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? undefined : argv[i + 1]; };
  const tables = flag('tables')
    ?? fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
  const opts = {
    seedLf: flag('seed-lf') !== undefined ? Number(flag('seed-lf')) : undefined,
    poke: flag('poke'),
  };
  if (argv.includes('--once')) {
    process.stdout.write(run(pos[0], pos[1], tables, opts).digest + '\n');
    return 0;
  }
  const a = run(pos[0], pos[1], tables, opts);
  const b = run(pos[0], pos[1], tables, opts);
  console.log(`IN-PROCESS run 1: ${a.digest}`);
  console.log(`IN-PROCESS run 2: ${b.digest}`);
  const child = argv.filter((x) => x !== '--once');
  const c = spawnSync(process.execPath,
    [fileURLToPath(import.meta.url), ...child, '--once'],
    { encoding: 'utf8' });
  const cd = (c.stdout || '').trim();
  console.log(`SUBPROCESS      : ${cd}`);
  const ok = a.digest === b.digest && a.digest === cd;
  console.log(ok
    ? `IDENTICAL -- ${a.compared} logic frames, ${a.cols.length} columns, `
      + `three runs, one digest`
    : `DIVERGED -- the replay property does NOT hold`);
  if (!ok && c.stderr) console.error(c.stderr.slice(-1500));
  return ok ? 0 : 1;
}

process.exit(main());
