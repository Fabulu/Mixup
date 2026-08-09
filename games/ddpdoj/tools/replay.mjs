#!/usr/bin/env node
// WAVE 129 -- THE PACKAGED REPLAY ARTIFACT + ITS HEADLESS PLAYER.
//
// The replay PROPERTY is older than this wave: `portdiff.mjs`'s step loop and
// sha256 digest (line 276), `determinism.mjs` (two in-process runs + one
// subprocess), `seedcmp.mjs`'s seed-anywhere sweep, and the boot-from-rung
// construction (portdiff.mjs:128) together already prove "same initial state +
// same input sequence => same state, every frame" (NOTES-replay.md).  This file
// is the packaging: a single self-describing `.replay` artifact and a headless
// player that GREEN-prints it.  A green `.replay` is provably the SAME property
// the oracle checks, because the player reuses portdiff's EXACT digest feed --
// `columns.map((c) => String(v[c])).join('\t') + '\n'` -- so `digest.cumulative`
// equals `run.digest` byte-for-byte.
//
// IMPORTS ONLY.  `Game`, `stateVector`, `CLAIMED`, `readTrace`, `run` and the
// mutation switches come from existing modules; no game logic is duplicated or
// changed here.  Two modes:
//
//   VERIFY   replay.mjs <file.replay>
//            Parse, boot Game, reset the mutation switches, step with the
//            recorded portin, compare per-period then cumulative.  GREEN or the
//            first divergent 250-frame window; never "N frames differ"
//            (docs/knowledge/01).
//
//   RECORD   replay.mjs --mk <trace.tsv> <seed.bin> <bg.bin> [--seed-lf N]
//                       [--to N] [--poke A=V] [--scenario S] [--intervention T]
//                       -o <file.replay>
//            `readTrace` + `run` for the authoritative cumulative, one own walk
//            for the per-period window hashes (asserted to concatenate to
//            `run.digest`), extract portin from the TSV's `portin` column.
//            Thin wrapper over `run`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

import { Game } from '../src/main.js';
import { stateVector, CLAIMED } from '../src/state.js';
import { readTrace, run } from './portdiff.mjs';
import { AUTOSHOT_MUTATE, CLAMP_ORDER } from '../src/player.js';
import { W82_MUTATE } from '../src/boss.js';
import { B2_MUTATE } from '../src/background.js';
import { W94_MUTATE } from '../src/bossscripts.js';
import { W95_MUTATE } from '../src/bossphase.js';
import { W95G_MUTATE } from '../src/bossguns.js';
import { W96_MUTATE } from '../src/bossarrival.js';

export const PERIOD_FRAMES = 250;   // the checkpoint cadence (manifest.json `every`)
export const FORMAT = 'ddpdoj.replay/v1';
export const BUILD = 'B';

const DEFAULT_TABLES = fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url));

/** big-endian u16 words out of a raw dump -- the layout `BgVram` stores, and the
 *  shape `Game`'s `bgSeed` opt expects.  Mirrors seedcmp.mjs:74 verbatim. */
function beWords(bytes) {
  const w = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < w.length; i++) w[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return w;
}

const B64 = (bytes) => Buffer.from(bytes).toString('base64');
const UNB64 = (s) => {
  if (typeof s !== 'string'
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) {
    throw new Error('invalid base64 replay field');
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
};

/** Parse "803970=FF,810424=FF" into [[addr,val]...] the way portdiff.mjs:147
 *  does, so the player applies the SAME poke at the SAME point (every frame at
 *  the top of the loop, before step, after the row is recorded -- portdiff:261). */
export function parsePoke(s) {
  if (s === undefined || s === null || s === '') return [];
  if (typeof s !== 'string') throw new Error('replay poke must be a string');
  return s.split(',').map((kv) => {
    const m = /^([0-9a-f]{6})=([0-9a-f]{1,2})$/i.exec(kv);
    if (!m) throw new Error(`invalid replay poke ${kv}`);
    const address = parseInt(m[1], 16), value = parseInt(m[2], 16);
    if (address < 0x800000 || address >= 0x820000) {
      throw new Error(`replay poke address $${m[1].toUpperCase()} is outside main RAM`);
    }
    return [address, value];
  });
}

function resetMutationSwitches() {
  // portdiff.mjs:137-144.  These are module-level mutable switches; an
  // in-process caller that ran a `--break` mutation and then a clean run would
  // CARRY the mutation (`04-review.md` 8).  Reset on EVERY run.
  CLAMP_ORDER.value = 'rom';
  AUTOSHOT_MUTATE.value = null;
  W82_MUTATE.value = null;
  B2_MUTATE.value = null;
  W94_MUTATE.value = null;
  W95_MUTATE.value = null;
  W95G_MUTATE.value = null;
  W96_MUTATE.value = null;
}

// ---------------------------------------------------------------------------
// THE PLAYER (verify)
// ---------------------------------------------------------------------------

/**
 * Drive a parsed `.replay` object through the port and compare the recorded
 * digests.  Pure: takes the JS object (so a test can mutate a field and re-run),
 * returns { green, cumulative, divergentPeriod, compared, columns }.
 *
 * The feed is portdiff's exact line over `digest.columns` (frozen at record), so
 * a green result means the SAME property the oracle checked at record time held
 * again at verify time, in a separate process, with no emulator and no trace.
 */
export function verifyReplay(obj, opts = {}) {
  const { ramBytes, bgBytes, tables, portinWords, pokes } = validateReplayObject(obj);

  // Same construction as portdiff.mjs:128 and seedcmp.mjs:134.  bgSeed is the
  // 2048-word big-endian tilemap ring, NOT main RAM; without it a seeded port
  // paints columns into an empty ring (portdiff.mjs:118 comment).
  const game = new Game(ramBytes, tables, {
    logicFrame: obj.seed.lf,
    videoFrame: obj.seed.vf,
    bgSeed: beWords(bgBytes),
  });
  resetMutationSwitches();

  const columns = obj.digest.columns;
  const cumulative = createHash('sha256');
  let period = createHash('sha256');      // FRESH per window (resets at boundary)
  const compared = [];
  let periodIdx = 0;
  let divergentPeriod = null;
  const seedLf = obj.seed.lf;
  const count = obj.portin.count;
  const pf = obj.digest.periodFrames;

  for (let i = 0; i < count; i++) {
    const lf = seedLf + i + 1;
    for (const [a, val] of pokes) game.ram.setU8(a, val);
    game.step(portinWords[i]);
    const v = stateVector(game);
    const line = columns.map((c) => String(v[c])).join('\t') + '\n';
    cumulative.update(line);
    period.update(line);
    compared.push(lf);
    // Period boundary: after the (pf)-th frame of the window, compare.  The
    // recorded periods[periodIdx].lf === lf here; a mismatch is the first
    // divergence localised to this 250-frame window.
    if ((i + 1) % pf === 0 || i === count - 1) {
      const got = period.digest('hex');
      const want = obj.digest.periods[periodIdx]?.sha256;
      if (got !== want && divergentPeriod === null) {
        divergentPeriod = {
          index: periodIdx,
          from: seedLf + periodIdx * pf + 1,
          to: lf,
          got, want: want ?? '<missing>',
        };
      }
      periodIdx++;
      period = createHash('sha256');
    }
  }

  const cumulativeHex = cumulative.digest('hex');
  const cumulativeMatch = cumulativeHex === obj.digest.cumulative;
  const green = divergentPeriod === null && cumulativeMatch;
  return {
    green,
    compared,
    columns,
    cumulative: cumulativeHex,
    cumulativeMatch,
    cumulativeWant: obj.digest.cumulative,
    divergentPeriod,
    periodCount: periodIdx,
  };
}

/** Validate the file shape before constructing a Game, matching the browser's
 * `validateReplay` contract so malformed seed/input/frame data cannot become a
 * plausible playback with a different initialization path. */
function validateReplayObject(obj) {
  if (!obj || obj.format !== FORMAT) {
    throw new Error(`not a ${FORMAT} artifact (got ${String(obj?.format)})`);
  }
  if (obj.build !== BUILD) throw new Error(`unsupported replay build ${String(obj.build)}`);
  if (!obj.seed || !Number.isSafeInteger(obj.seed.lf) || obj.seed.lf < 0
      || !Number.isSafeInteger(obj.seed.vf) || obj.seed.vf < 0) {
    throw new Error('replay seed lf/vf must be non-negative integers');
  }
  const ramBytes = UNB64(obj.seed.ramB64);
  const bgBytes = UNB64(obj.seed.bgB64);
  const tablesBytes = UNB64(obj.seed.tablesB64);
  if (ramBytes.length !== 0x20000) {
    throw new Error(`replay RAM seed is ${ramBytes.length} bytes, expected 131072`);
  }
  if (bgBytes.length !== 0x1000) {
    throw new Error(`replay BG seed is ${bgBytes.length} bytes, expected 4096`);
  }
  let tables;
  try { tables = JSON.parse(Buffer.from(tablesBytes).toString('utf8')); }
  catch (e) { throw new Error(`replay tables seed is not JSON: ${e.message}`); }
  if (!obj.portin) throw new Error('replay portin is missing');
  const portinBytes = UNB64(obj.portin.b64);
  const portinWords = decodePortin(portinBytes, obj.portin);
  const pokes = parsePoke(obj.poke);
  if (!obj.digest || !Array.isArray(obj.digest.columns)
      || obj.digest.columns.length === 0
      || obj.digest.columns.some((c) => typeof c !== 'string' || c.length === 0)) {
    throw new Error('replay digest.columns must be a non-empty string array');
  }
  if (!Number.isSafeInteger(obj.digest.periodFrames) || obj.digest.periodFrames < 1) {
    throw new Error('replay digest.periodFrames must be a positive integer');
  }
  const periods = Math.ceil(portinWords.length / obj.digest.periodFrames);
  if (!Array.isArray(obj.digest.periods) || obj.digest.periods.length !== periods) {
    throw new Error(`replay digest has ${obj.digest.periods?.length ?? 0} periods, expected ${periods}`);
  }
  for (let i = 0; i < periods; i++) {
    const p = obj.digest.periods[i];
    const end = obj.seed.lf + Math.min((i + 1) * obj.digest.periodFrames, portinWords.length);
    if (!p || p.lf !== end || !/^[0-9a-f]{64}$/.test(p.sha256 ?? '')) {
      throw new Error(`replay digest period ${i} is malformed`);
    }
  }
  if (!/^[0-9a-f]{64}$/.test(obj.digest.cumulative ?? '')) {
    throw new Error('replay digest.cumulative is not a SHA-256 hex digest');
  }
  return { ramBytes, bgBytes, tables, portinWords, pokes };
}

function decodePortin(bytes, meta) {
  if (meta.encoding !== 'u16be') {
    throw new Error(`unsupported portin encoding ${meta.encoding} (want u16be)`);
  }
  if (!Number.isSafeInteger(meta.count) || meta.count < 1
      || bytes.length % 2 !== 0 || bytes.length / 2 !== meta.count) {
    throw new Error(`replay portin count ${meta.count} does not match its u16be bytes`);
  }
  const w = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < w.length; i++) w[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return w;
}

// ---------------------------------------------------------------------------
// THE BUILDER (record)
// ---------------------------------------------------------------------------

/**
 * Build a `.replay` object from a trace + seed + bg.  `run` (portdiff) is the
 * authority for `digest.cumulative`; the per-period window hashes come from a
 * second walk whose own cumulative is ASSERTED to equal `run.digest`, so the
 * file cannot ship with a digest that the player's own feed would not reproduce.
 */
export function buildReplay(opts) {
  const {
    tsvPath, seedPath, bgPath, tablesPath = DEFAULT_TABLES,
    seedLf, toLf, poke = '', scenario = '', intervention = '',
  } = opts;

  const parsed = readTrace(tsvPath);
  const { byLf } = parsed;
  const lf0 = seedLf ?? Number(parsed.rows[0].lf);
  const start = byLf.get(lf0);
  if (!start) throw new Error(`the trace has no logic frame ${lf0}`);
  if (start.portin === undefined) {
    throw new Error('the trace has no `portin` column -- re-run the oracle with '
      + 'PROBE_PORTIN=1, or the replay would be fed its own answer');
  }
  const bgBytes = new Uint8Array(readFileSync(bgPath));
  const tablesBytes = readFileSync(tablesPath);
  const bgSeed = beWords(bgBytes);

  // The authoritative cumulative + the column set + the last lf.  `cols` is
  // CLAIMED filtered to whatever the trace carries; the file freezes THAT set
  // (see worklog §1 for why the brief's `CLAIMED.map` wording is `cols.map`).
  const r = run(tsvPath, seedPath, tablesPath, {
    seedLf: lf0,
    untilLf: toLf,
    bgSeed,
    poke,
  });
  const columns = r.cols;

  // Second walk for the per-period window hashes.  Fresh Game, fresh switches,
  // the SAME feed as run().  The cumulative built here MUST equal r.digest.
  const seedBytes = new Uint8Array(readFileSync(seedPath));
  const tables = JSON.parse(tablesBytes.toString('utf8'));
  const game = new Game(seedBytes, tables, {
    logicFrame: lf0,
    videoFrame: Number(start.vf),
    bgSeed,
  });
  resetMutationSwitches();
  const pokes = parsePoke(poke);
  const cumulativeCheck = createHash('sha256');
  let period = createHash('sha256');
  const periods = [];
  const portinWords = [];
  let periodIdx = 0;
  let n = 0;
  for (let lf = lf0 + 1; lf <= r.last; lf++) {
    const row = byLf.get(lf);
    if (!row) break;
    for (const [a, val] of pokes) game.ram.setU8(a, val);
    game.step(Number(row.portin));
    portinWords.push(Number(row.portin));
    const v = stateVector(game);
    const line = columns.map((c) => String(v[c])).join('\t') + '\n';
    cumulativeCheck.update(line);
    period.update(line);
    n++;
    if (n % PERIOD_FRAMES === 0 || lf === r.last) {
      periods.push({ lf, sha256: period.digest('hex') });
      periodIdx++;
      period = createHash('sha256');
    }
  }
  const cumulativeCheckHex = cumulativeCheck.digest('hex');
  if (cumulativeCheckHex !== r.digest) {
    throw new Error(`internal: own-walk cumulative ${cumulativeCheckHex} != run.digest `
      + `${r.digest} -- the player would not reproduce this file`);
  }

  // u16be portin bytes: one big-endian word per logic frame, exactly the form
  // `decodePortin` above reads back and `step` consumes.
  const portinBytes = new Uint8Array(portinWords.length * 2);
  for (let i = 0; i < portinWords.length; i++) {
    portinBytes[i * 2] = (portinWords[i] >> 8) & 0xff;
    portinBytes[i * 2 + 1] = portinWords[i] & 0xff;
  }

  const tablesSha256 = createHash('sha256').update(tablesBytes).digest('hex');
  const obj = {
    format: FORMAT,
    build: BUILD,
    version: {
      git: gitShort(),
      tablesSha256,
      buildId: 'ddpdoj-port',
    },
    seed: {
      lf: lf0,
      vf: Number(start.vf),
      ramB64: B64(seedBytes),
      bgB64: B64(bgBytes),
      tablesB64: B64(new Uint8Array(tablesBytes)),
    },
    scenario,
    intervention: intervention || undefined,
    poke: poke || undefined,
    portin: {
      encoding: 'u16be',
      count: portinWords.length,
      b64: B64(portinBytes),
    },
    digest: {
      algo: 'sha256',
      columns,
      cumulative: r.digest,
      periodFrames: PERIOD_FRAMES,
      periods,
    },
  };
  if (r.seedBad.length) {
    obj.seedBad = r.seedBad;   // surfaced, not silenced -- a bad seed is not a replay
  }
  return obj;
}

function gitShort() {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function report(name, res) {
  console.log(`REPLAY   ${name}`);
  console.log(`STEPS    ${res.compared.length} logic frames (lf ${res.compared[0]}..`
    + `${res.compared[res.compared.length - 1]}), ${res.columns.length} digest columns`);
  if (res.divergentPeriod) {
    const d = res.divergentPeriod;
    console.log(`PERIOD   [RED] window lf${d.from}..${d.to} (period ${d.index})`);
    console.log(`           player  ${d.got}`);
    console.log(`           recorded ${d.want}`);
    console.log(`           first divergence is WITHIN this ${d.to - d.from + 1}-frame `
      + `window; re-run with the trace to localise to a single frame`);
  } else {
    console.log(`PERIOD   [GREEN] ${res.periodCount} period(s) match`);
  }
  console.log(`CUMULATIVE ${res.cumulative}`);
  console.log(`           ${res.cumulativeMatch ? 'matches recorded' : 'MISMATCH'} `
    + `${res.cumulativeWant}`);
  if (res.green) {
    console.log(`RESULT  GREEN -- ${res.compared.length} frames, cumulative + all `
      + `${res.periodCount} period(s) reproduce`);
  } else {
    console.log(`RESULT  RED -- replay does not reproduce`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('usage:');
    console.error('  replay.mjs <file.replay>                     (verify)');
    console.error('  replay.mjs --mk <trace.tsv> <seed.bin> <bg.bin> [-o file.replay]');
    return 2;
  }
  if (argv[0] === '--mk') {
    const rest = argv.slice(1);
    const pos = rest.filter((a) => !a.startsWith('-'));
    // Accept both `--name` and `-o` (the brief's usage spells the output flag
    // with a single dash).  Long-form flags use `--`; the only short flag is -o.
    const flag = (n, d) => {
      const i = rest.indexOf(`--${n}`);
      if (i >= 0) return rest[i + 1];
      if (n === 'o' && rest.includes('-o')) return rest[rest.indexOf('-o') + 1];
      return d;
    };
    if (pos.length < 3) {
      console.error('--mk needs <trace.tsv> <seed.bin> <bg.bin>');
      return 2;
    }
    const obj = buildReplay({
      tsvPath: pos[0], seedPath: pos[1], bgPath: pos[2],
      tablesPath: flag('tables', DEFAULT_TABLES),
      seedLf: flag('seed-lf') !== undefined ? Number(flag('seed-lf')) : undefined,
      toLf: flag('to') !== undefined ? Number(flag('to')) : undefined,
      poke: flag('poke', ''),
      scenario: flag('scenario', ''),
      intervention: flag('intervention', ''),
    });
    const out = flag('o', null);
    const json = JSON.stringify(obj, null, 1);
    if (out) {
      writeFileSync(out, json);
      console.log(`wrote ${out} (${(json.length / 1024).toFixed(0)} KB, `
        + `${obj.portin.count} frames, ${obj.digest.periods.length} period(s))`);
    } else {
      process.stdout.write(json + '\n');
    }
    return 0;
  }
  // verify
  const file = argv[0];
  const obj = JSON.parse(readFileSync(file, 'utf8'));
  const res = verifyReplay(obj);
  report(file, res);
  return res.green ? 0 : 1;
}

if (process.argv[1]?.endsWith('replay.mjs')) process.exit(main());
