// WAVE 131 -- LIVE-PAGE REC + the browser digest module, gated.
//
// What is pinned here:
//   * THE CROSS-CHECK (the load-bearing one): the browser module's
//     ACCUMULATE-then-`crypto.subtle.digest` path produces a BYTE-IDENTICAL
//     `digest.cumulative` and every `periods[k].sha256` to Node's incremental
//     `createHash('sha256').update(line)`.  This is the proof that hashing the
//     whole feed in one shot == the incremental hash, which is the one real
//     subtlety of doing the digest in the browser (SubtleCrypto has no
//     `update()`).  Runs HEADLESS under `node --test` (Node 20 has
//     `crypto.subtle`), NO ROM needed.
//   * the recorder captures portin: armed + `input()` -> the words appear;
//     never `input()`-ed -> the buffer is empty (the page's null-guard is the
//     same invariant at the Demo level).
//   * a `.replay` built by the BROWSER module on the live Game, driving the
//     SAME frames as the trace, VERIFIES GREEN through the Node headless player
//     (`tools/replay.mjs verifyReplay`).  This is the real-data cross-check: a
//     fresh Game is booted from the browser object's seed, walked with its
//     portin, and reproduces its cumulative + every period.
//   * the seedcmp --break RED precedent, differential: flip one portin bit at
//     a known-active frame (A), flip one seed byte at a CLAIMED player address
//     (B); each must turn a green baseline RED, and restoring must go green.
//     A check that has never been seen to fail is not a check
//     (docs/knowledge/03).
//
// The ROM-gated tests use the fly-around ladder (128 KiB of main RAM off the
// cartridge), so the ladder under tools/oracle/out/ is gitignored and those
// tests SKIP when it is absent (CI), the way `w129replay.test.js` skips.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  armRecorder, stopRecorder, feedLine, sha256Hex, b64, unb64, beBytesFromWords,
  FORMAT, BUILD, PERIOD_FRAMES,
} from '../src/web/replay.js';
import { stateVector, CLAIMED } from '../src/state.js';
import { Game } from '../src/main.js';
import { readTrace } from '../tools/portdiff.mjs';
import { verifyReplay } from '../tools/replay.mjs';
import { AUTOSHOT_MUTATE, CLAMP_ORDER } from '../src/player.js';
import { W82_MUTATE } from '../src/boss.js';
import { B2_MUTATE } from '../src/background.js';
import { W94_MUTATE } from '../src/bossscripts.js';
import { W95_MUTATE } from '../src/bossphase.js';
import { W95G_MUTATE } from '../src/bossguns.js';
import { W96_MUTATE } from '../src/bossarrival.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const LADDER = path.join(ROOT, 'tools/oracle/out/w69/fly-around');
const TRACE = path.join(LADDER, 'trace.tsv');
const SEED = path.join(LADDER, 'ckpt/c002000.ram.bin');
const BG = path.join(LADDER, 'ckpt/c002000.bg.bin');
const TABLES = path.join(ROOT, 'rip/port/player.tables.json');

const HAVE = fs.existsSync(TRACE) && fs.existsSync(SEED)
  && fs.existsSync(BG) && fs.existsSync(TABLES);

// The fly-around script holds DOWN at lf2130 (manifest.json `2130=D`): a
// KNOWN-ACTIVE, non-neutral-stick frame (same anchor `w129replay.test.js`
// uses).  py (player Y) lives at $8103E8 = offset $103E8 in the 128 KiB main
// RAM -- the W129 finding-B address: PERSISTENT simulation state that step()
// integrates, never overwrites, so a seed flip propagates (unlike p1raw, which
// the step rewrites from the portin before the first feed).
const ACTIVE_LF = 2130;
const SEED_LF = 2000;
const TO_LF = 2250;
const PY_OFF = 0x103E8;             // $8103E8 - $800000 (main RAM base)
const POKE = '810424=FF';

/** Reset the eight module mutation switches the way `replay.mjs:77` and
 *  `portdiff.mjs:137-144` do, so a prior `--break` run does not leak into the
 *  recorder's walk.  The page never sets these; a test that ran a mutated walk
 *  earlier in the same process would carry it. */
function resetSwitches() {
  CLAMP_ORDER.value = 'rom';
  AUTOSHOT_MUTATE.value = null;
  W82_MUTATE.value = null;
  B2_MUTATE.value = null;
  W94_MUTATE.value = null;
  W95_MUTATE.value = null;
  W95G_MUTATE.value = null;
  W96_MUTATE.value = null;
}

// ===========================================================================
// 1. THE CROSS-CHECK -- browser accumulate-then-hash == Node incremental.
// Always runs (no ROM).  THE proof the brief gates on.
// ===========================================================================

test('cross-check: browser sha256Hex(accumulate) == Node createHash(incremental)', async () => {
  // N frames over CLAIMED: two full 250-frame periods + a 100-frame partial,
  // so both the mid-run boundary and the trailing-partial close are exercised.
  const N = 600;
  const pf = PERIOD_FRAMES;
  const columns = CLAIMED;

  // Synthesize state vectors with all CLAIMED keys mapped to varying numbers,
  // so every feed line is different (a constant feed would not catch a
  // period-slice offset bug).  `stateVector` always populates every claimed
  // key on the live page, so this shape is faithful.
  const makeV = (i) => {
    const v = {};
    for (let k = 0; k < columns.length; k++) {
      v[columns[k]] = (i * 7919 + k * 31) % 100000;
    }
    return v;
  };

  // --- browser path: ACCUMULATE the feed, hash once per period + once whole --
  let browserFeed = '';
  const browserBounds = [0];
  for (let i = 0; i < N; i++) {
    browserFeed += feedLine(columns, makeV(i));
    if ((i + 1) % pf === 0) browserBounds.push(browserFeed.length);
  }
  if (browserBounds[browserBounds.length - 1] !== browserFeed.length) {
    browserBounds.push(browserFeed.length);
  }
  const browserCumulative = await sha256Hex(browserFeed);
  const browserPeriods = [];
  for (let k = 0; k < browserBounds.length - 1; k++) {
    const slice = browserFeed.slice(browserBounds[k], browserBounds[k + 1]);
    browserPeriods.push(await sha256Hex(slice));
  }

  // --- Node path: INCREMENTAL createHash, the way `replay.mjs:142` does it --
  const nodeCumulative = createHash('sha256');
  let nodePeriod = createHash('sha256');
  const nodePeriods = [];
  for (let i = 0; i < N; i++) {
    const line = feedLine(columns, makeV(i));
    nodeCumulative.update(line);
    nodePeriod.update(line);
    if ((i + 1) % pf === 0 || i === N - 1) {
      nodePeriods.push(nodePeriod.digest('hex'));
      nodePeriod = createHash('sha256');
    }
  }

  // THE ASSERTION: byte-identical cumulative + every period slice.
  assert.equal(browserCumulative, nodeCumulative.digest('hex'),
    'cumulative: browser accumulate-then-hash must equal Node incremental');
  assert.equal(browserPeriods.length, nodePeriods.length,
    `period count: browser ${browserPeriods.length} vs Node ${nodePeriods.length}`);
  for (let k = 0; k < nodePeriods.length; k++) {
    assert.equal(browserPeriods[k], nodePeriods[k],
      `period ${k}: browser ${browserPeriods[k]} != Node ${nodePeriods[k]}`);
  }
  // 600 frames = 2 full periods + 100 partial = 3 periods.
  assert.equal(nodePeriods.length, 3);
});

test('cross-check: feedLine is the verbatim shape replay.mjs hashes', () => {
  // Pin the EXACT format (tab-separated, trailing newline) so a future edit to
  // feedLine cannot silently drift from `replay.mjs:141` / `portdiff.mjs:276`.
  const v = { a: 1, b: 2, c: 30 };
  assert.equal(feedLine(['a', 'b', 'c'], v), '1\t2\t30\n');
});

// ===========================================================================
// 2. THE RECORDER CAPTURES PORTIN (must-fail, always runs).
// ===========================================================================

test('recorder: input() tees portin words verbatim; never input()-ed is empty', () => {
  // The "not armed -> buffer empty" invariant at module level: a recorder that
  // is never fed input has an empty portin.  (The page's `if (this.recorder)`
  // guard in `Demo.step()` is the same invariant at the Demo level -- when
  // recorder is null, nothing is pushed.)
  const fakeGame = {};
  const rec = armRecorder(fakeGame, {
    seed: { lf: 0, vf: 0, ramB64: '', bgB64: '', tablesB64: '' },
  });
  assert.deepEqual(rec.portin, []);
  assert.equal(rec.n, 0);

  // Armed + input -> the words appear in order, masked to 32 bits.
  rec.input(0x1234);
  rec.input(0xffff);
  rec.input(0x0001);
  assert.deepEqual(rec.portin, [0x1234, 0xffff, 0x0001]);

  // A fresh recorder is empty again (the restore half of the differential).
  const rec2 = armRecorder(fakeGame, {
    seed: { lf: 0, vf: 0, ramB64: '', bgB64: '', tablesB64: '' },
  });
  assert.deepEqual(rec2.portin, []);
});

// ===========================================================================
// 3. REC SELF-VERIFY + RED A/B (ROM-gated; skip when the ladder is absent).
// Boots the live Game from the fly-around seed, records with the BROWSER
// module over the SAME portin the trace carries, and asserts the Node headless
// player GREEN-prints the result.
// ===========================================================================

/**
 * Boot the Game from the fly-around seed, arm the BROWSER recorder, drive it
 * over the trace's portin for lf in (SEED_LF, TO_LF], and package a `.replay`.
 * Mirrors what `Demo.step()` does each frame (input, poke, step, feed) and what
 * `Demo.armRecording()` captures at arm time.  Returns the v1 object.
 */
async function recordFlyAround() {
  const parsed = readTrace(TRACE);
  const byLf = parsed.byLf;
  const start = byLf.get(SEED_LF);
  const seedBytes = new Uint8Array(fs.readFileSync(SEED));
  const tablesBytes = fs.readFileSync(TABLES);
  const tables = JSON.parse(tablesBytes.toString('utf8'));

  // Rebuild bgSeed the way `loadRung`/`seedcmp` do (BE words out of the dump).
  const bgBytes = new Uint8Array(fs.readFileSync(BG));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }

  const game = new Game(seedBytes, tables, {
    logicFrame: SEED_LF,
    videoFrame: Number(start.vf),
    bgSeed,
  });
  resetSwitches();

  // Seed capture at arm time (before any step): detached RAM copy, BG as BE
  // bytes, lf/vf, tables.  This is exactly what `Demo.armRecording()` does.
  const seed = {
    lf: game.logicFrame,
    vf: game.videoFrame,
    ramB64: b64(game.ram.b.slice()),
    bgB64: b64(beBytesFromWords(game.vram.w)),
    tablesB64: b64(new Uint8Array(tablesBytes)),
  };

  const rec = armRecorder(game, {
    columns: CLAIMED,
    periodFrames: PERIOD_FRAMES,
    seed,
    version: { git: 'test', tablesSha256: await sha256Hex(tablesBytes), buildId: 'ddpdoj-live' },
    scenario: 'fly-around',
    intervention: '$810424 held at $FF -- INVULNERABLE',
    poke: POKE,
  });

  // Drive the recorder the way the page does: input, poke, step, feed.
  for (let lf = SEED_LF + 1; lf <= TO_LF; lf++) {
    const row = byLf.get(lf);
    if (!row) break;
    const pw = Number(row.portin);
    rec.input(pw);
    game.ram.setU8(0x810424, 0xff);
    game.step(pw);
    rec.feed();
  }

  return stopRecorder(rec);
}

test('rec: a browser-built .replay VERIFIES GREEN through the Node player',
  { skip: !HAVE && 'fly-around ladder absent (CI)' }, async () => {
    const o = await recordFlyAround();

    // Self-describing header.
    assert.equal(o.format, FORMAT);
    assert.equal(o.build, BUILD);
    assert.equal(o.digest.algo, 'sha256');
    assert.equal(o.digest.periodFrames, PERIOD_FRAMES);
    assert.equal(o.portin.encoding, 'u16be');
    assert.equal(o.portin.count, TO_LF - SEED_LF);
    // A live recording freezes ALL of CLAIMED (stateVector always populates
    // every claimed name on the live page), unlike a trace-based replay.
    assert.deepEqual(o.digest.columns, CLAIMED);
    assert.ok(o.digest.columns.length > 30);
    assert.equal(o.digest.periods.length, 1, 'one 250-frame segment = one period');
    assert.equal(o.digest.periods[0].lf, TO_LF);
    assert.match(o.digest.cumulative, /^[0-9a-f]{64}$/);
    assert.equal(o.poke, POKE);

    // THE REAL-DATA CROSS-CHECK: the Node headless player boots a FRESH Game
    // from the browser object's seed, walks it with the browser object's
    // portin, and reproduces the browser object's cumulative + every period.
    const r = verifyReplay(o);
    assert.equal(r.green, true, 'browser-built .replay must verify GREEN');
    assert.equal(r.cumulativeMatch, true);
    assert.equal(r.divergentPeriod, null);
    assert.equal(r.compared.length, TO_LF - SEED_LF);
    assert.equal(r.cumulative, o.digest.cumulative);
  });

test('rec: the browser cumulative matches a Node incremental walk on the same frames',
  { skip: !HAVE && 'fly-around ladder absent (CI)' }, async () => {
    // A second, independent cross-check on REAL data: re-walk the same Game +
    // portin with Node's incremental createHash over CLAIMED, and assert the
    // browser object's cumulative reproduces.  (verifyReplay above also
    // re-walks, but it reads `obj.digest.columns` from the file; this one
    // builds the feed inline so a column-order or feedLine drift is caught
    // separately from the player's own feed.)
    const o = await recordFlyAround();

    const parsed = readTrace(TRACE);
    const byLf = parsed.byLf;
    const start = byLf.get(SEED_LF);
    const seedBytes = new Uint8Array(fs.readFileSync(SEED));
    const tablesBytes = fs.readFileSync(TABLES);
    const tables = JSON.parse(tablesBytes.toString('utf8'));
    const bgBytes = new Uint8Array(fs.readFileSync(BG));
    const bgSeed = new Uint16Array(bgBytes.length >> 1);
    for (let i = 0; i < bgSeed.length; i++) {
      bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
    }
    const game = new Game(seedBytes, tables, {
      logicFrame: SEED_LF, videoFrame: Number(start.vf), bgSeed,
    });
    resetSwitches();
    const h = createHash('sha256');
    for (let lf = SEED_LF + 1; lf <= TO_LF; lf++) {
      const row = byLf.get(lf);
      if (!row) break;
      game.ram.setU8(0x810424, 0xff);
      game.step(Number(row.portin));
      h.update(feedLine(CLAIMED, stateVector(game)));
    }
    assert.equal(h.digest('hex'), o.digest.cumulative,
      'browser accumulate-then-hash must equal a Node incremental walk on real frames');
  });

// ---------------------------------------------------------------------------
// RED VALIDATION -- differential (baseline green, mutation red, restore green).
// ---------------------------------------------------------------------------

test('MUT-A rec portin sensitivity: one bit at a known-active frame -> RED',
  { skip: !HAVE && 'fly-around ladder absent (CI)' }, async () => {
    const o = await recordFlyAround();
    assert.equal(verifyReplay(o).green, true, 'baseline green before mutation');

    const m = JSON.parse(JSON.stringify(o));
    const bytes = unb64(m.portin.b64);
    const i = ACTIVE_LF - SEED_LF - 1;     // lf 2130 is index 129 in portin
    assert.equal(i, 129);
    bytes[i * 2 + 1] ^= 0x01;              // flip bit 0 of the down-held word
    m.portin.b64 = b64(bytes);

    const r = verifyReplay(m);
    assert.equal(r.green, false, 'mutation A must go red');
    assert.equal(r.cumulativeMatch, false, 'cumulative must change');
    assert.notEqual(r.divergentPeriod, null, 'a period must diverge');

    assert.equal(verifyReplay(o).green, true, 'baseline green after restore');
  });

test('MUT-B rec seed sensitivity: one byte at a CLAIMED player address -> RED',
  { skip: !HAVE && 'fly-around ladder absent (CI)' }, async () => {
    // py (player Y, a CLAIMED WATCH column) at $8103E8 -- the W129 finding-B
    // address.  PERSISTENT simulation state: step() integrates it, never
    // overwrites it, so a seed flip propagates.  (The brief's p1raw example
    // would NOT work: p1raw is the raw input word, rewritten from the portin
    // every frame before the first feed.)
    const o = await recordFlyAround();
    assert.equal(verifyReplay(o).green, true, 'baseline green before mutation');

    const m = JSON.parse(JSON.stringify(o));
    const ram = unb64(m.seed.ramB64);
    ram[PY_OFF] ^= 0x01;
    m.seed.ramB64 = b64(ram);

    const r = verifyReplay(m);
    assert.equal(r.green, false, 'mutation B must go red');
    assert.equal(r.cumulativeMatch, false, 'cumulative must change');
    assert.notEqual(r.divergentPeriod, null);

    assert.equal(verifyReplay(o).green, true, 'baseline green after restore');
  });
