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
import { stateVector, CLAIMED, OPTION_COLUMNS, MASKED, RAWDUMP_SPEC,
  REPORTED_COLUMNS } from '../src/state.js';
import { breakage } from './breakage.mjs';
import { AUTOSHOT_MUTATE, CLAMP_ORDER } from '../src/player.js';
import { W82_MUTATE } from '../src/boss.js';
import { B2_MUTATE } from '../src/background.js';
import { W94_MUTATE } from '../src/bossscripts.js';
import { W95_MUTATE } from '../src/bossphase.js';
import { W95G_MUTATE } from '../src/bossguns.js';
import { W96_MUTATE } from '../src/bossarrival.js';

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

/** Parse a trace once so a caller comparing many windows of it can hand the
 *  same rows back.  WAVE 69: `seedcmp.mjs` runs up to 78 segments over ONE
 *  19,500-row x 136-column trace, and re-reading it per segment made the sweep
 *  quadratic -- it spent all its time in the parser and none in the port. */
export function readTrace(tsvPath) {
  const rows = readTsv(tsvPath);
  return { rows, byLf: new Map(rows.map((r) => [Number(r.lf), r])) };
}

/**
 * WAVE 85 -- ONE FRAME OF THE BUCKET-2 CONTAINMENT CHECK, as a pure function so
 * `tests/w85bucket2.test.js` can drive it with records it wrote itself and see
 * it REPORT A MISS.  A containment check that has only ever been run against a
 * port that agrees is not a check (`docs/knowledge/03`).
 *
 * @param {string} boardHex  the board's dumped bucket-2 prefix, lower-case hex
 * @param {string} portHex   the port's, same address, same length
 * @param {number} portBytes $80AFC4 at the sample point: the port's own records
 *                           are exactly [0, portBytes), because call #4's tail
 *                           ($23D70C) zeroed the counter at the top of the frame
 * @param {number} dumpLen   how many BYTES of the bucket the dump covers
 * @returns {{records:number, past:number, missing:{off:number,rec:string}[],
 *            ordered:boolean}}
 */
export function bucketContainment(boardHex, portHex, portBytes, dumpLen) {
  // The board's dump split on the ROM's own 12-byte record boundary -- never as
  // a substring.  Every bucket-2 producer appends exactly $C bytes from a
  // counter that starts at 0, and bucket 2 has no BULK writer (those are 20, 22
  // and 23), so the alignment is a property of the cartridge.
  //
  // EVERY offset each distinct record occupies is kept, not just the first: a
  // sprite that legitimately appears twice in one frame (two identical body
  // parts, two elements at the same place) would otherwise fail the ORDER
  // report for a reason that is not a defect.
  const board = new Map();
  for (let o = 0; o * 2 + 24 <= boardHex.length; o += 12) {
    const k = boardHex.slice(o * 2, o * 2 + 24);
    const l = board.get(k);
    if (l) l.push(o); else board.set(k, [o]);
  }
  const r = { records: 0, past: 0, missing: [], ordered: true };
  let cursor = -1;
  for (let o = 0; o < portBytes; o += 12) {
    if (o + 12 > dumpLen) { r.past++; r.ordered = false; continue; }
    const rec = portHex.slice(o * 2, o * 2 + 24);
    r.records++;
    const at = board.get(rec);
    if (at === undefined) { r.missing.push({ off: o, rec }); r.ordered = false; continue; }
    const next = at.find((x) => x >= cursor);
    if (next === undefined) r.ordered = false; else cursor = next;
  }
  return r;
}

export function run(tsvPath, seedPath, tablesPath, opts = {}) {
  const parsed = opts.trace ?? readTrace(tsvPath);
  const { rows, byLf } = parsed;
  const seed = new Uint8Array(readFileSync(seedPath));
  const tables = opts.tables ?? JSON.parse(readFileSync(tablesPath, 'utf8'));
  const seedLf = opts.seedLf ?? Number(rows[0].lf);
  const start = byLf.get(seedLf);
  if (!start) throw new Error(`the trace has no logic frame ${seedLf}`);
  if (start.portin === undefined) {
    throw new Error('the trace has no `portin` column -- re-run the oracle with '
      + 'PROBE_PORTIN=1, or the port would be fed its own answer');
  }

  // WAVE 69, ADDITIVE.  `bgSeed` and `untilLf` are undefined for every caller
  // that existed before this wave, and `new BgVram(undefined)` / "run to the end
  // of the trace" are exactly what those callers already got -- so the wave-4
  // gate's behaviour is unchanged by construction, not by inspection.
  //
  //   bgSeed   $900000, the 64x16 longword tilemap ring, 2,048 big-endian
  //            words.  NOT main RAM, so a 128 KiB seed does not contain it;
  //            without it a port seeded at lf12,000 paints fifteen columns into
  //            an empty ring and the other forty-nine are blank.  This is the
  //            DaiOuJou analogue of the PPU nametable Gradius's wave 10 found
  //            missing from ITS seed.
  //   untilLf  the last logic frame to compare, so ONE trace can be sliced into
  //            independent segments, each re-seeded from the board.  That is
  //            what stops one early divergence from painting every later
  //            segment red and reporting a blast radius as a finding.
  const game = new Game(seed, tables, {
    logicFrame: seedLf,
    videoFrame: Number(start.vf),
    budgetUnits: opts.budgetUnits,
    bgSeed: opts.bgSeed,
  });
  // `CLAMP_ORDER` is a module-level mutable switch, so an in-process caller that
  // ran `--break clamp-first` and then a clean run would carry the mutation
  // (`04-review.md` 8).  Reset it on EVERY run, not only inside breakage().
  CLAMP_ORDER.value = 'rom';
  AUTOSHOT_MUTATE.value = null;      // WAVE 79's seam, same rule
  W82_MUTATE.value = null;           // WAVE 82's seam, same rule
  B2_MUTATE.value = null;            // WAVE 85's seam, same rule
  W94_MUTATE.value = null;           // WAVE 94's seam, same rule
  W95_MUTATE.value = null;           // WAVE 95's seam, same rule
  W95G_MUTATE.value = null;          // WAVE 95's guns, same rule
  W96_MUTATE.value = null;           // WAVE 96's arrival, same rule
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

  // WAVE 8.  THE SPRITE-REQUEST BUCKET IS SHARED, SO IT IS COMPARED BY
  // CONTAINMENT AND NOT BY EQUALITY, and that is a deliberate weakening with a
  // measured reason.  $808854 is appended to by every live player-shot record
  // in slot order, and the OPTION PODS' shots occupy slots 7..12 -- earlier
  // than the player's 14..17/21..24 -- through $24C096, one of the 22 unported
  // subsystem calls in object type 5.  So the board's bucket is the port's
  // records with other records interleaved BEFORE them, and equality would be
  // red for a reason that is not a bug.  The claim this makes instead is
  // falsifiable and worth something: EVERY 12-BYTE RECORD THE PORT EMITTED
  // APPEARS VERBATIM IN THE BOARD'S OWN BUCKET FOR THAT FRAME.
  const sprq = { frames: 0, records: 0, missing: [], other: 0, past: 0 };
  // WAVE 85.  THE SAME INSTRUMENT ON BUCKET 2 ($805CC8/$80AFC4) -- the bucket
  // the stage-1 boss's A2 OBJECT routines emit into, and the reason W82 could
  // claim feature-complete and not oracle-clean for them.
  //
  // WHY THE PORT'S RECORD SET NEEDS NO PER-PRODUCER BOOKKEEPING (bucket 14
  // does): call #4's tail zeroes all thirty counters ($23D70C), so at the top of
  // a logic frame $80AFC4 is 0 and everything the port appended this frame lies
  // in [0, $80AFC4).  `game.bucket2Bytes` is that word, read at the board's own
  // $23D382 instant -- see src/main.js.  Bucket 14 needs the slot-by-slot list
  // because the port carries STALE copies of records for slots it does not
  // model; bucket 2 has no such records, because the port only ever writes it
  // from code the port has ported.
  //
  // CONTAINMENT, NOT EQUALITY, AND FOR A BIGGER REASON THAN BUCKET 14's.  The
  // board's bucket 2 also carries records from producers this port does not
  // have -- W40's census names `$288E4E`/`$289B80` beside the 35 background-
  // element sites -- so equality would be red for a reason that is not a bug.
  // The claim made instead is falsifiable and is exactly the one W82 could not
  // make: EVERY 12-BYTE RECORD THE PORT APPENDED TO BUCKET 2 APPEARS VERBATIM
  // IN THE BOARD'S OWN BUCKET 2 FOR THAT FRAME.
  //
  // TWO WAYS THIS IS STRONGER THAN THE BUCKET-14 CHECK ABOVE, both deliberate:
  //  1. The board's dump is split on 12-BYTE BOUNDARIES and matched as whole
  //     records.  `sprq` uses `String.includes`, which can match a record
  //     straddling two of the board's, i.e. at an offset no producer can write.
  //     Every bucket-2 producer appends exactly $C bytes from a counter that
  //     starts at 0, so alignment is the ROM's own property and not an
  //     assumption (there is no BULK writer on bucket 2 -- those are 20, 22, 23).
  //  2. `order` reports whether the port's records also appear IN ORDER at
  //     non-decreasing offsets.  Both sides run the same producers in the same
  //     object-driver slot order and the port merely SKIPS the ones it lacks, so
  //     the port's records should be an ordered SUBSEQUENCE of the board's, not
  //     merely a subset.  That is REPORTED and not gated, because promoting a
  //     stronger claim to a gate before it has been measured over a whole stage
  //     is how a gate goes red for a reason that is not a defect.
  //
  // THE ONE WEAKENING, NAMED: the board's buffer is not cleared between frames
  // (only the counters are), so the dumped prefix is this frame's records
  // followed by RESIDUE from earlier frames, and a port record could in
  // principle match a stale one further down.  `order` is what would notice --
  // a stale match sits at a higher offset than the live record after it, so the
  // next record's search fails and the frame stops counting as ordered.  [M] on
  // `stage1-sweep` it is clean on 6,750 of 6,750 frames.
  const sprq2 = {
    frames: 0, records: 0, missing: [], past: 0, maxBytes: 0,
    order: 0, orderFrames: 0,
  };
  let blocked = null;
  const reported = REPORTED_COLUMNS.filter((c) => start[c] !== undefined);
  const rep = new Map(reported.map((c) => [c, { n: 0, max: 0, first: null }]));
  const sprqLen = (RAWDUMP_SPEC.find((r) => r[0] === 'sprq') ?? [, , 0])[2];
  const sprq2Len = (RAWDUMP_SPEC.find((r) => r[0] === 'sprq2') ?? [, , 0])[2];
  const hitEx = { frames: 0, total: 0, first: null, any: 0, anyFrames: 0 };

  const untilLf = opts.untilLf ?? Infinity;
  for (let lf = seedLf + 1; lf <= untilLf; lf++) {
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
    // WAVE 12.  A NAMED THROW IS A RESULT, NOT A CRASH.  Since the held-fire
    // gate moved to the board's own `$24C164` (10-recon-combat §2), any scenario
    // that presses Button 1 for even ONE frame reaches `$24C180` -- because the
    // board really does start folding the pods in on that frame ($24C23E
    // `sub.b D0,($1b,A6)`), so the port would be wrong from there on.  Letting
    // that surface as a stack trace would hide WHICH gate stopped and WHERE.
    try {
      game.step(Number(row.portin));
    } catch (e) {
      if (e.name !== 'Unreached') throw e;
      blocked = { lf, addr: e.romAddress, message: e.message };
      break;
    }
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
    // THE SHOT-VS-ENEMY DAMAGE ROUTINE, counted on the BOARD.  $245044 is the
    // only writer of bit 7 of a shot record's low byte, and that bit is the
    // gate into a handler path the port refuses to translate.  If it ever fires
    // inside the compared window the port's shot records are being compared
    // against a board that took a branch the port cannot take, and the run is
    // not evidence of anything.  This is a FAILURE, not a note.
    if (row.hitex !== undefined && Number(row.hitex) > 0) {
      hitEx.frames++;
      hitEx.total += Number(row.hitex);
      if (hitEx.first === null) hitEx.first = lf;
    }
    if (row.hitany !== undefined && Number(row.hitany) > 0) {
      hitEx.anyFrames++;
      hitEx.any += Number(row.hitany);
    }
    // Containment, per 12-byte record, over the records the port actually wrote
    // this frame (its own $80AFD6 before the reset -- carried on the game).
    if (row.sprq !== undefined) {
      sprq.frames++;
      sprq.other += game.frameRequestsOther.length;
      const board = row.sprq;
      for (const o of game.frameRequests) {
        if (o + 12 > sprqLen) { sprq.past++; continue; }
        const rec = v.sprq.slice(o * 2, o * 2 + 24);
        sprq.records++;
        if (!board.includes(rec)) sprq.missing.push({ lf, off: o, rec });
      }
    }
    // WAVE 85 -- BUCKET 2, the layer the boss draws into.  `maxBytes` is tracked even when the
    // trace has no `sprq2` column, because it is what SIZES the dump: a prefix
    // shorter than the port's own high-water mark cannot check every record, and
    // `past` counts the ones it could not.
    sprq2.maxBytes = Math.max(sprq2.maxBytes, game.bucket2Bytes);
    if (row.sprq2 !== undefined) {
      sprq2.frames++;
      const c2 = bucketContainment(row.sprq2, v.sprq2, game.bucket2Bytes, sprq2Len);
      sprq2.records += c2.records;
      sprq2.past += c2.past;
      for (const m of c2.missing) sprq2.missing.push({ lf, ...m });
      sprq2.orderFrames++;
      if (c2.ordered) sprq2.order++;
    }
    // REPORTED-not-claimed columns: traced, printed with their drift.
    for (const c of reported) {
      if (row[c] === undefined) continue;
      if (String(v[c]) !== String(row[c])) {
        rep.get(c).n++;
        if (rep.get(c).first === null) rep.get(c).first = { lf, port: v[c], board: row[c] };
        const d = Math.abs(Number(v[c]) - Number(row[c]));
        if (d > rep.get(c).max) rep.get(c).max = d;
      }
    }
    if (Number(row.irq6) !== v.irq6) dilated.push(lf);
    compared++; last = lf;
  }

  return {
    seedLf, last, compared, seedBad, cols, optCols, first, dilated, vfSkew, game, pokes, maskHits, maskFirst, blocked,
    sprq, sprq2, hitEx, reported, rep,
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
  const sprqLenBytes = (RAWDUMP_SPEC.find((x) => x[0] === 'sprq') ?? [, , 0])[2];
  const r = run(pos[0], pos[1], tables, {
    seedLf: flag('seed-lf') !== undefined ? Number(flag('seed-lf')) : undefined,
    break: flag('break'),
    poke: flag('poke'),
  });

  console.log(`SEED   lf=${r.seedLf}  ${r.compared} logic frames compared `
    + `(lf ${r.seedLf + 1}..${r.last})`);
  console.log(`COLS   ${r.cols.length} compared: ${r.cols.join(' ')}`);
  // WAVE 12: the option columns are now IN `CLAIMED`, because $24C096 is run
  // (src/options.js).  The line below used to say "NOT COMPARED"; it now says
  // where the board first moved them, which is the number that makes "compared"
  // mean something -- a column the board never moves is compared for free.
  if (r.optCols.length) {
    const moved = [...r.optionFirst].filter(([, lf]) => lf !== null);
    const claimed = r.optCols.filter((c) => r.cols.includes(c));
    console.log(`OPTION columns ${claimed.length === r.optCols.length
      ? 'COMPARED (the option object $24C096 is ported, wave 12)'
      : 'PARTIALLY compared'}: ${r.optCols.join(' ')} -- the board first moves `
      + `them at lf ${moved.length ? Math.min(...moved.map(([, lf]) => lf)) : 'never'}`);
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
  // WAVE 8 -- the shot subsystem's three reports.  All three print even when
  // they are empty: a counter that is only shown when it is non-zero cannot be
  // told from a counter nobody installed.
  console.log(`SHOTSPAWN ($249BFC/$24A222): `
    + (r.game.shotSpawns.size
      ? [...r.game.shotSpawns].map(([k, n]) => `${k}=${n}`).join(' ')
      : 'none -- the player never fired in this window'));
  for (const c of r.reported) {
    const d = r.rep.get(c);
    console.log(`REPORTED ${c} (traced, NOT claimed -- see src/state.js `
      + `REPORTED_COLUMNS): differed on ${d.n} of ${r.compared} frames`
      + (d.first ? `, first at lf${d.first.lf} port=${d.first.port} `
        + `board=${d.first.board}, largest gap ${d.max}` : ''));
  }
  if (r.sprq.frames) {
    console.log(`SPRQ CONTAINMENT ($23F3AE -> $808854): ${r.sprq.records} record(s) `
      + `emitted by the port over ${r.sprq.frames} frames, `
      + `${r.sprq.records - r.sprq.missing.length} found verbatim in the board's `
      + `own bucket, ${r.sprq.missing.length} MISSING`
      + (r.sprq.missing.length
        ? ` (first at lf${r.sprq.missing[0].lf} offset ${r.sprq.missing[0].off}: `
          + `${r.sprq.missing[0].rec})` : ''));
    console.log(`  (CONTAINMENT, not equality: the option pods' shots share this `
      + `bucket and are appended BEFORE the player's -- see src/state.js `
      + `RAWDUMP_SPEC.  ${r.sprq.other} further record(s) came from slots the `
      + `port cannot model and are excluded BY NAME; ${r.sprq.past} landed past `
      + `the ${sprqLenBytes}-byte dumped prefix and are not checked.)`);
  }
  // WAVE 85 -- BUCKET 2.  Printed even when the trace has no `sprq2` column, and
  // the line SAYS SO: a check that is silently skipped because the oracle was
  // run before the column existed is indistinguishable from a check that passed,
  // and that confusion is the whole reason this wave exists.
  const sprq2LenBytes = (RAWDUMP_SPEC.find((x) => x[0] === 'sprq2') ?? [, , 0])[2];
  if (r.sprq2.frames) {
    console.log(`SPRQ2 CONTAINMENT ($23DF2A + $23E020 -> $805CC8): `
      + `${r.sprq2.records} record(s) appended by the port over ${r.sprq2.frames} `
      + `frames, ${r.sprq2.records - r.sprq2.missing.length} found verbatim in `
      + `the board's own bucket 2, ${r.sprq2.missing.length} MISSING`
      + (r.sprq2.missing.length
        ? ` (first at lf${r.sprq2.missing[0].lf} offset ${r.sprq2.missing[0].off}: `
          + `${r.sprq2.missing[0].rec})` : ''));
    console.log(`  (CONTAINMENT, not equality: the board's bucket 2 also carries `
      + `records from producers this port does not have. Matched on the ROM's own `
      + `12-byte record boundary, never as a substring. High-water mark `
      + `${r.sprq2.maxBytes} bytes = ${r.sprq2.maxBytes / 12} record(s) against a `
      + `${sprq2LenBytes}-byte dumped prefix; ${r.sprq2.past} record(s) landed `
      + `past it and were NOT checked.)`);
    console.log(`  ORDER (reported, not gated): the port's records were an `
      + `ordered subsequence of the board's on ${r.sprq2.order} of `
      + `${r.sprq2.orderFrames} frames.`);
  } else {
    console.log(`SPRQ2 ($805CC8, the layer the stage-1 boss's A2 OBJECT `
      + `routines emit into) NOT CHECKED: this trace has no \`sprq2\` column, so `
      + `it was recorded before src/state.js RAWDUMP_SPEC carried one. Re-run the `
      + `oracle. The port appended up to ${r.sprq2.maxBytes / 12} record(s) a `
      + `frame into it in this window and NONE of them was compared.`);
  }
  const hitAny = r.hitEx.any - r.hitEx.total;
  if (r.hitEx.first !== null) {
    console.log(`HITEX $245044 fired ${r.hitEx.total} time(s) on ${r.hitEx.frames} `
      + `frame(s) inside the compared window, first at lf${r.hitEx.first}. That `
      + `is the shot-vs-enemy damage routine: the board took a branch the port `
      + `deliberately does not translate, so this window is NOT evidence.`);
  } else {
    console.log(`HITEX $245044 (shot-vs-enemy damage, the only writer of the `
      + `shot HIT bit) fired 0 times on the TEN COMPARED RECORDS in the whole `
      + `window -- so the untranslated hit path was never reached, MEASURED. `
      + `On the rest of the 36-slot table (the OPTION PODS' shots, slots 7..11, `
      + `an unported subsystem) it fired ${hitAny} time(s) on `
      + `${r.hitEx.anyFrames} frame(s); those touch no compared byte.`);
  }
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
  if (r.blocked) {
    // A named throw is a RESULT: it says the port stopped, where, and why, and
    // it is not the same outcome as a divergence.  `pgm.py check` treats both as
    // failures; a reader must be able to tell them apart at a glance.
    console.log(`BLOCKED at lf${r.blocked.lf} by the named throw `
      + `$${r.blocked.addr.toString(16).toUpperCase()} -- the port reached a `
      + `path this wave does not translate. ${r.compared} frames were compared `
      + `before it.\n  ${r.blocked.message}`);
  }
  const gateFail = r.hitEx.first !== null || r.sprq.missing.length > 0
    || r.sprq2.missing.length > 0 || r.blocked !== null;
  if (r.first.size === 0 && r.seedBad.length === 0 && !gateFail) {
    console.log(`RESULT 0 DIVERGENT FRAMES on ${r.cols.length} columns over `
      + `${r.compared} logic frames`);
    return 0;
  }
  for (const [c, d] of [...r.first].sort((a, b) => a[1].lf - b[1].lf)) {
    const p = String(d.port), b = String(d.board);
    console.log(`DIVERGE ${c.padEnd(8)} first at lf=${d.lf}: `
      + (p.length > 40
        ? `port=${p.slice(0, 40)}... board=${b.slice(0, 40)}...  `
          + `(first differing byte ${[...p].findIndex((ch, i) => ch !== b[i]) >> 1})`
        : `port=${p} board=${b}`));
  }
  console.log(`RESULT ${r.first.size} of ${r.cols.length} columns diverged`
    + (r.blocked ? `; and the run was BLOCKED at lf${r.blocked.lf} by `
      + `$${r.blocked.addr.toString(16).toUpperCase()}` : '')
    + (r.hitEx.first !== null || r.sprq.missing.length || r.sprq2.missing.length
      ? `; and a containment gate above (HITEX / SPRQ / SPRQ2) FAILED` : ''));
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('portdiff.mjs')) {
  process.exit(main());
}
