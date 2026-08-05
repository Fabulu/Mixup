#!/usr/bin/env node
// WAVE 69 -- THE SEGMENT SWEEP.  Compare the port against the board at ANY
// depth in a stage, from a checkpoint ladder, WITH NO EMULATOR IN THE LOOP.
//
//   node games/ddpdoj/tools/seedcmp.mjs --manifest <dir>/manifest.json
//        [--from LF] [--to LF] [--segment LF] [--every N]
//        [--no-bg] [--break NAME] [--json out.json] [--quiet]
//
// WHAT THIS IS FOR, in the owner's words: *"We need to oracle through the whole
// stages. Ideally with saved states so we don't have to run everything fully
// all the time."*
//
// THE COST INVERSION.  A cartridge run does ~23 logic frames per wall second
// (MEASURED, wave 69, MAME 0.288 `-video none -nothrottle`), so reaching
// lf19,000 costs ~14 minutes EVERY TIME anybody wants to look at it.  The port
// does thousands.  `pgm.py ckpt` pays the emulator once and leaves a ladder;
// this tool reads the ladder.  Nothing here launches MAME.
//
// WHY SEGMENTS AND NOT ONE LONG RUN.  Each segment is re-seeded from the
// BOARD's own state at its lower rung and compared only to its upper rung.  A
// single seeded run to lf19,000 reports the FIRST divergence and then nothing:
// after the port and the board disagree once, every later frame is a blast
// radius rather than evidence (docs/knowledge/01).  Re-seeding per segment asks
// a different and much more useful question -- *given the board's own state at
// frame N, does the port reproduce frames N+1..N+250?* -- separately for every
// rung of the stage.  That is what produces a per-segment coverage table
// instead of one number, and it is the same device `firegate.mjs` calls
// `reseed`, applied at ladder scale rather than frame scale.
//
// WHAT A GREEN SEGMENT DOES AND DOES NOT MEAN.  It means the CODE is faithful
// over those frames from that state.  It does NOT mean the port can REACH that
// state by playing: seeding inverts the usual trap, because a wrong port value
// gets overwritten by real board state at the next rung before anything reads
// it.  `porttrace.mjs` in the Gradius tree says the same thing about the same
// mechanism.  So a seeded result is labelled as one, always, and the run's own
// intervention (if the ladder was poked) is carried out of the manifest and
// reprinted here rather than being left in a file nobody opens.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as portdiff, readTrace } from './portdiff.mjs';

function args(argv) {
  const a = {
    manifest: null, from: null, to: null, segment: null, every: null,
    bg: true, break: null, json: null, quiet: false, tables: null,
    maxSegments: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = () => argv[++i];
    switch (argv[i]) {
      case '--manifest': a.manifest = v(); break;
      case '--from': a.from = +v(); break;
      case '--to': a.to = +v(); break;
      case '--segment': a.segment = +v(); break;
      case '--every': a.every = +v(); break;
      case '--max-segments': a.maxSegments = +v(); break;
      case '--no-bg': a.bg = false; break;
      case '--break': a.break = v(); break;
      case '--json': a.json = v(); break;
      case '--tables': a.tables = v(); break;
      case '--quiet': a.quiet = true; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!a.manifest) throw new Error('--manifest is required');
  return a;
}

/** big-endian u16 words out of a raw dump -- the layout `BgVram` stores. */
function beWords(bytes) {
  const w = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < w.length; i++) w[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return w;
}

export function sweep(a) {
  const manDir = path.dirname(path.resolve(a.manifest));
  const man = JSON.parse(fs.readFileSync(a.manifest, 'utf8'));
  const ckDir = path.join(manDir, man.dir ?? 'ckpt');
  const tsv = path.join(manDir, man.trace ?? 'trace.tsv');
  const tables = a.tables ?? fileURLToPath(
    new URL('../rip/port/player.tables.json', import.meta.url));

  let rungs = man.rungs.slice().sort((x, y) => x.lf - y.lf);
  if (a.from !== null) rungs = rungs.filter((r) => r.lf >= a.from);
  if (a.to !== null) rungs = rungs.filter((r) => r.lf <= a.to);
  if (a.every !== null) {
    // Coarsen the ladder without re-running MAME: keep every Nth rung.  The
    // SEGMENTS get longer, which is the knob for "how much drift am I willing
    // to let accumulate before the board corrects me".
    rungs = rungs.filter((_, i) => i % a.every === 0);
  }
  if (a.segment !== null) {
    const i = rungs.findIndex((r) => r.lf === a.segment);
    if (i < 0) throw new Error(`no rung at lf${a.segment}; have `
      + rungs.map((r) => r.lf).join(','));
    rungs = rungs.slice(i, i + 2);
  }
  if (a.maxSegments !== null) rungs = rungs.slice(0, a.maxSegments + 1);
  if (rungs.length < 2) {
    throw new Error(`need at least two rungs to make a segment; have `
      + `${rungs.length}`);
  }

  // ONCE, not once per segment.  A whole-stage trace is ~90 MB of TSV and 78
  // segments; parsing it per segment made the sweep spend its entire runtime in
  // the parser (MEASURED: >120 s and unfinished, against 12 s for the same work
  // afterwards).  The tables JSON is half a megabyte and gets the same treatment.
  const trace = readTrace(tsv);
  const tablesJson = JSON.parse(fs.readFileSync(tables, 'utf8'));

  const results = [];
  for (let i = 0; i + 1 < rungs.length; i++) {
    const lo = rungs[i], hi = rungs[i + 1];
    const seedPath = path.join(ckDir, lo.ram);
    const bgPath = path.join(ckDir, lo.bg);
    const opts = {
      seedLf: lo.lf,
      untilLf: hi.lf,
      poke: man.poke || undefined,
      break: a.break ?? undefined,
      trace,
      tables: tablesJson,
    };
    // THE BG RING IS PART OF THE SEED, and `--no-bg` exists so that claim can
    // be FALSIFIED rather than asserted: drop it and watch whichever columns
    // depend on it move.  If nothing moves, the ring is not load-bearing for
    // the compared set and this tool says so instead of implying otherwise.
    if (a.bg && fs.existsSync(bgPath)) {
      opts.bgSeed = beWords(new Uint8Array(fs.readFileSync(bgPath)));
    }
    let r = null, err = null;
    try {
      r = portdiff(tsv, seedPath, tables, opts);
    } catch (e) {
      err = e;
    }
    const rec = {
      from: lo.lf, to: hi.lf, vf: lo.vf,
      compared: r ? r.compared : 0,
      seedBad: r ? r.seedBad : [],
      cols: r ? r.cols.length : 0,
      diverged: r ? [...r.first].map(([c, d]) => ({
        col: c, lf: d.lf,
        port: String(d.port).slice(0, 48), board: String(d.board).slice(0, 48),
      })).sort((x, y) => x.lf - y.lf) : [],
      blocked: r?.blocked ?? null,
      hitex: r ? r.hitEx.total : 0,
      sprqMissing: r ? r.sprq.missing.length : 0,
      digest: r ? r.digest : null,
      error: err ? `${err.name}: ${err.message}` : null,
    };
    // A segment is GREEN only if the seed itself agreed, nothing diverged,
    // nothing blocked and the wave-8 gates held.  `seedBad` is listed first on
    // purpose: a segment whose SEED already disagrees is not evidence about the
    // port at all, it is evidence about the ladder.
    rec.verdict = rec.error ? 'ERROR'
      : rec.seedBad.length ? 'SEEDBAD'
        : rec.blocked ? 'BLOCKED'
          : (rec.diverged.length || rec.hitex || rec.sprqMissing) ? 'RED'
            : 'GREEN';
    // WHY it is red, separately, because the three reasons are different
    // findings and a single colour hides that.  `hitex` in particular is the
    // board taking the unported shot-vs-enemy damage branch -- which happens on
    // any scenario where the ship actually kills things, i.e. on every scenario
    // the owner cares about -- and a segment that is red ONLY for that reason
    // is saying something about the PORT'S GAPS, not about its arithmetic.
    rec.why = [
      rec.diverged.length ? `${rec.diverged.length} column(s)` : null,
      rec.hitex ? `hitex ${rec.hitex}` : null,
      rec.sprqMissing ? `sprq ${rec.sprqMissing} missing` : null,
    ].filter(Boolean).join(' + ');
    results.push(rec);
    if (!a.quiet) {
      const first = rec.diverged[0];
      process.stdout.write(
        `  [${rec.verdict.padEnd(7)}] lf${String(rec.from).padStart(6)}..`
        + `${String(rec.to).padStart(6)}  ${String(rec.compared).padStart(4)} `
        + `frames x ${rec.cols} cols`
        + (rec.seedBad.length ? `  SEEDBAD ${rec.seedBad.join(',')}` : '')
        + (rec.blocked ? `  BLOCKED lf${rec.blocked.lf} `
          + `$${rec.blocked.addr.toString(16).toUpperCase()}` : '')
        + (first ? `  FIRST ${first.col}@lf${first.lf} `
          + `port=${first.port} board=${first.board}` : '')
        + (rec.diverged.length > 1 ? ` (+${rec.diverged.length - 1} cols)` : '')
        + (!first && rec.why ? `  ${rec.why}` : '')
        + (rec.error ? `  ${rec.error}` : '')
        + '\n');
    }
  }
  return { man, results, rungs };
}

function main() {
  const a = args(process.argv.slice(2));
  const { man, results } = sweep(a);

  console.log(`LADDER  ${a.manifest}`);
  console.log(`        scenario ${man.scenario}, ${man.rungs.length} rungs, `
    + `cadence ${man.every}, last traced lf${man.lastLf}`);
  if (man.intervention) {
    // LABELLED EVERY TIME, at the top, before any number.  docs/knowledge/09:
    // an intervention run gives you STATES, not a picture of the game.
    console.log(`INTERVENTION  ${man.intervention}`);
  }
  console.log(`SEEDED COMPARISON -- each segment starts from the BOARD's own `
    + `state at its lower rung. This validates the CODE from that state, never `
    + `the route to it.`);
  if (a.break) console.log(`MUTATION  --break ${a.break} is active; segments MUST go red.`);
  console.log('');
  // (the per-segment lines were streamed by sweep())

  const n = results.length;
  const by = (v) => results.filter((r) => r.verdict === v);
  const frames = results.reduce((s, r) => s + r.compared, 0);
  console.log('');
  console.log(`SEGMENTS ${n}: ${by('GREEN').length} green, ${by('RED').length} `
    + `red, ${by('BLOCKED').length} blocked, ${by('SEEDBAD').length} seedbad, `
    + `${by('ERROR').length} error -- ${frames} logic frames compared in total`);
  // The three reasons a segment can be red, counted apart.  A segment that is
  // red only because the BOARD took an unported branch is a coverage statement
  // about the port's gaps; a segment with divergent columns is an arithmetic
  // defect.  Reporting one number for both would hide whichever is rarer.
  const redOnlyHit = by('RED').filter((r) => !r.diverged.length);
  console.log(`  of the red: ${by('RED').length - redOnlyHit.length} have `
    + `DIVERGENT COLUMNS; ${redOnlyHit.length} are red ONLY because the board `
    + `took an unported branch (hitex / sprq containment)`);

  // THE FIRST DIVERGENT FIELD PER SEGMENT, with its logic frame.  This is the
  // deliverable: not "N frames differ" but which field went first, and where.
  const bad = results.filter((r) => r.verdict !== 'GREEN');
  if (bad.length) {
    console.log('\nFIRST DIVERGENT FIELD PER NON-GREEN SEGMENT');
    for (const r of bad) {
      const f = r.diverged[0];
      console.log(`  lf${String(r.from).padStart(6)}..${String(r.to).padStart(6)}  `
        + `${r.verdict.padEnd(7)} `
        + (f ? `${f.col} first at lf${f.lf}: port=${f.port} board=${f.board}`
          : r.blocked ? `named throw $${r.blocked.addr.toString(16).toUpperCase()} `
            + `at lf${r.blocked.lf}`
            : r.seedBad.length ? `seed disagrees on ${r.seedBad.join(',')}`
              : r.error ?? '')
        + (r.diverged.length > 1
          ? `\n${' '.repeat(24)}+ ${r.diverged.slice(1, 6)
            .map((d) => `${d.col}@lf${d.lf}`).join(' ')}`
          + (r.diverged.length > 6 ? ` +${r.diverged.length - 6} more` : '')
          : ''));
    }
  }

  // WHICH COLUMNS EVER MOVED, across the whole stage.  Coverage is fields and
  // branches, not frames (docs/knowledge/10) -- so the useful summary of a
  // 19,000-frame sweep is the SET of fields that ever disagreed, ranked by how
  // early each one first did.
  const cols = new Map();
  for (const r of results) {
    for (const d of r.diverged) {
      const e = cols.get(d.col);
      if (!e || d.lf < e.lf) cols.set(d.col, { lf: d.lf, seg: r.from, n: 1 });
      else e.n++;
    }
  }
  if (cols.size) {
    console.log('\nFIELDS THAT EVER DIVERGED, earliest first');
    for (const [c, e] of [...cols].sort((x, y) => x[1].lf - y[1].lf)) {
      console.log(`  ${c.padEnd(10)} first at lf${e.lf} (segment from lf${e.seg})`);
    }
  }

  if (a.json) {
    fs.writeFileSync(a.json, JSON.stringify({ manifest: man, results }, null, 1));
    console.log(`\nwrote ${a.json}`);
  }

  if (a.break) {
    // RED VALIDATION.  Under a mutation, a sweep that stays green is a hole in
    // the comparison and is reported as a FAILURE OF THE TOOL, not a pass.
    const stillGreen = by('GREEN').length;
    if (stillGreen === n) {
      console.log(`FAIL mutation '${a.break}' left ALL ${n} segments green -- `
        + `this sweep cannot see it, so it proves nothing`);
      return 1;
    }
    console.log(`RED OK: mutation '${a.break}' turned ${n - stillGreen} of ${n} `
      + `segments non-green, as it must`);
    return 0;
  }
  return by('GREEN').length === n ? 0 : 1;
}

if (process.argv[1]?.endsWith('seedcmp.mjs')) process.exit(main());
