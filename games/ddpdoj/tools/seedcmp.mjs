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
      // WAVE 85 -- bucket 2, the layer the boss draws into.  `sprq2Frames` is
      // carried beside the miss count on purpose: 0 missing out of 0 frames
      // means the trace has no `sprq2` column and NOTHING was checked, which is
      // a different result from 0 missing out of 250 and must not print alike.
      sprq2Missing: r ? r.sprq2.missing.length : 0,
      sprq2Frames: r ? r.sprq2.frames : 0,
      sprq2Records: r ? r.sprq2.records : 0,
      sprq2Order: r ? r.sprq2.order : 0,
      sprq2OrderFrames: r ? r.sprq2.orderFrames : 0,
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
          : (rec.diverged.length || rec.hitex || rec.sprqMissing
             || rec.sprq2Missing) ? 'RED'
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
      rec.sprq2Missing ? `sprq2 ${rec.sprq2Missing} missing` : null,
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
    + `took an unported branch (hitex / sprq / sprq2 containment)`);
  // WAVE 85 -- SAY WHETHER BUCKET 2 WAS LOOKED AT AT ALL.  W82's OBJECT
  // routines emit into $805CC8 and nothing compared it; a sweep that is silent
  // about a bucket it did not trace reads exactly like one that traced it and
  // found nothing.  This line is the difference.
  const s2f = results.reduce((s, r) => s + (r.sprq2Frames ?? 0), 0);
  const s2r = results.reduce((s, r) => s + (r.sprq2Records ?? 0), 0);
  const s2m = results.reduce((s, r) => s + (r.sprq2Missing ?? 0), 0);
  const s2o = results.reduce((s, r) => s + (r.sprq2Order ?? 0), 0);
  console.log(s2f
    ? `  BUCKET 2 ($805CC8, the layer the stage-1 boss draws into): ${s2r} record(s) the port appended `
      + `over ${s2f} frames were checked for containment in the board's, `
      + `${s2m} MISSING; and they were an ordered SUBSEQUENCE of the board's on `
      + `${s2o} of ${s2f} frames (reported, not gated)`
    : `  BUCKET 2 ($805CC8, the layer the stage-1 boss draws into): NOT CHECKED -- this ladder's trace `
      + `has no \`sprq2\` column. Re-run \`pgm.py ckpt\` (src/state.js `
      + `RAWDUMP_SPEC carries it now).`);

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
    // RED VALIDATION, AGAINST THE BASELINE AND NOT AGAINST "ALL GREEN".
    //
    // THE FIRST VERSION OF THIS CHECK COULD NOT FAIL, and it was caught by
    // running it: it passed when `70 of 71` segments were non-green under the
    // mutation, on a ladder where 70 of 71 were ALREADY non-green without it.
    // The mutation had changed the verdict of ZERO segments and the check said
    // "RED OK". docs/knowledge/03, exactly: a check that has never been seen to
    // fail is not a check, and this one was incapable of failing on any ladder
    // whose segments were mostly blocked -- which is every deep ladder.
    //
    // The correct question is DIFFERENTIAL: does the mutation change at least
    // one segment's verdict, or make at least one segment's first divergence
    // arrive earlier?  Anything less is agreeing with itself.
    const base = sweep({ ...a, break: null, quiet: true });
    let moved = 0;
    const detail = [];
    for (let i = 0; i < results.length; i++) {
      const b = base.results[i], m = results[i];
      if (!b || b.from !== m.from) continue;
      const bl = b.diverged[0]?.lf ?? Infinity;
      const ml = m.diverged[0]?.lf ?? Infinity;
      // WAVE 85 -- AND THE CONTAINMENT COUNTS, or this check has the SAME hole
      // it was rewritten to close.  A mutation whose whole effect is on the
      // sprite buckets moves no COLUMN and no VERDICT on a segment that was
      // already red for something else -- which is exactly the case for every
      // W82 mutation on `stage1-sweep`'s lf19,000 rung, red since the ladder was
      // built for the pre-existing `vf`/`irq6` slowdown.  Judging only by
      // verdict and column would have reported "changed NOTHING" for the very
      // mutations this wave exists to make visible.
      const moreMisses = (m.sprq2Missing ?? 0) > (b.sprq2Missing ?? 0)
        || (m.sprqMissing ?? 0) > (b.sprqMissing ?? 0);
      if (b.verdict !== m.verdict || ml < bl
          || m.diverged.length > b.diverged.length || moreMisses) {
        moved++;
        if (detail.length < 6) {
          detail.push(`lf${m.from}: ${b.verdict}->${m.verdict}`
            + (ml < bl ? ` first divergence ${bl === Infinity ? 'none' : `lf${bl}`}`
              + ` -> lf${ml}` : '')
            + (m.diverged.length > b.diverged.length
              ? ` cols ${b.diverged.length}->${m.diverged.length}` : '')
            + ((m.sprq2Missing ?? 0) > (b.sprq2Missing ?? 0)
              ? ` sprq2 missing ${b.sprq2Missing}->${m.sprq2Missing}` : '')
            + ((m.sprqMissing ?? 0) > (b.sprqMissing ?? 0)
              ? ` sprq missing ${b.sprqMissing}->${m.sprqMissing}` : ''));
        }
      }
    }
    if (moved === 0) {
      console.log(`FAIL mutation '${a.break}' changed NOTHING on any of the ${n} `
        + `segments -- same verdicts, same first divergences. This sweep cannot `
        + `see it, so it proves nothing about this ladder.`);
      return 1;
    }
    console.log(`RED OK: mutation '${a.break}' moved ${moved} of ${n} segments `
      + `RELATIVE TO THE UNMUTATED BASELINE. ${detail.join('; ')}`);
    return 0;
  }
  return by('GREEN').length === n ? 0 : 1;
}

if (process.argv[1]?.endsWith('seedcmp.mjs')) process.exit(main());
