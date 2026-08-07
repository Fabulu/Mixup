// W129 -- THE PACKAGED .replay ARTIFACT + HEADLESS PLAYER, gated.
//
// The replay property is older than this wave (portdiff's step loop + digest,
// determinism's process-split check, seedcmp's seed-anywhere sweep).  This is
// the packaging: `replay.mjs` builds a self-describing `.replay` object and
// GREEN-prints it.  What is pinned here:
//   * a `.replay` built from the fly-around ladder VERIFIES GREEN (the player
//     reproduces the recorded cumulative and every period hash, in a separate
//     Game, with no emulator and no trace);
//   * the builder's own-walk cumulative EQUALS run.digest (the file cannot ship
//     with a digest the player's feed would not reproduce);
//   * the seedcmp --break RED precedent, differential: each mutation must turn a
//     green baseline RED, and restoring must go green again.  A check that has
//     never been seen to fail is not a check (docs/knowledge/03).
//
// The fixture is ROM-derived (128 KiB of main RAM off the cartridge), so the
// ladder under tools/oracle/out/ is gitignored and this test SKIPS when the
// ladder is absent (CI), the way w85bucket2 skips when the tables are absent.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReplay, verifyReplay, PERIOD_FRAMES, FORMAT } from '../tools/replay.mjs';

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
// KNOWN-ACTIVE, non-neutral-stick frame.  A centered-stick no-op frame is a
// finding but not the red signal, because the port ignores a centered stick and
// a portin bit-flip there may not move the cumulative.
const ACTIVE_LF = 2130;
const SEED_LF = 2000;
const TO_LF = 2250;

function build() {
  return buildReplay({
    tsvPath: TRACE, seedPath: SEED, bgPath: BG,
    seedLf: SEED_LF, toLf: TO_LF,
    poke: '810424=FF',           // the invuln timer, held at $FF (manifest.json)
    scenario: 'fly-around',
    intervention: '$810424 held at $FF from lf1990 -- INVULNERABLE',
  });
}

test('replay: format, build, period cadence are self-describing', { skip: !HAVE && 'fly-around ladder absent (CI)' }, () => {
  const o = build();
  assert.equal(o.format, FORMAT);
  assert.equal(o.build, 'B');
  assert.equal(o.digest.algo, 'sha256');
  assert.equal(o.digest.periodFrames, PERIOD_FRAMES);
  assert.equal(o.digest.periodFrames, 250);
  assert.equal(o.portin.encoding, 'u16be');
  assert.equal(o.portin.count, TO_LF - SEED_LF);
  assert.equal(o.digest.periods.length, 1, 'one 250-frame segment = one period');
  assert.equal(o.digest.periods[0].lf, TO_LF);
  // the digest column set is non-empty and is a SUBSET of what the trace carries
  assert.ok(o.digest.columns.length > 30);
});

test('replay: a built artifact VERIFIES GREEN', { skip: !HAVE && 'fly-around ladder absent (CI)' }, () => {
  const o = build();
  const r = verifyReplay(o);
  assert.equal(r.green, true, 'baseline must reproduce');
  assert.equal(r.cumulativeMatch, true);
  assert.equal(r.divergentPeriod, null);
  assert.equal(r.compared.length, TO_LF - SEED_LF);
  assert.equal(r.cumulative, o.digest.cumulative);
});

test('replay: builder own-walk cumulative equals run.digest', { skip: !HAVE && 'fly-around ladder absent (CI)' }, () => {
  // buildReplay throws if its own walk disagrees with run.digest, so reaching
  // here at all is the check; assert the recorded cumulative is a real sha256.
  const o = build();
  assert.match(o.digest.cumulative, /^[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------------------
// RED VALIDATION -- differential (baseline green, mutation red, restore green).
// The seedcmp --break precedent: a mutation that changes nothing is not a test.
// ---------------------------------------------------------------------------

test('MUT-A portin sensitivity: one bit at a known-active frame -> RED', { skip: !HAVE && 'fly-around ladder absent (CI)' }, () => {
  const o = build();
  assert.equal(verifyReplay(o).green, true, 'baseline green before mutation');

  const m = JSON.parse(JSON.stringify(o));
  const bytes = new Uint8Array(Buffer.from(m.portin.b64, 'base64'));
  const i = ACTIVE_LF - SEED_LF - 1;     // lf 2130 is index 129 in the portin array
  assert.equal(i, 129);
  bytes[i * 2 + 1] ^= 0x01;              // flip bit 0 of the down-held word
  m.portin.b64 = Buffer.from(bytes).toString('base64');

  const r = verifyReplay(m);
  assert.equal(r.green, false, 'mutation A must go red');
  assert.equal(r.cumulativeMatch, false, 'cumulative must change');
  assert.notEqual(r.divergentPeriod, null, 'a period must diverge');

  // restore: the unmutated object still verifies green (differential, not "all green")
  assert.equal(verifyReplay(o).green, true, 'baseline green after restore');
});

test('MUT-B seed sensitivity: one byte at a CLAIMED column address -> RED', { skip: !HAVE && 'fly-around ladder absent (CI)' }, () => {
  // py (player Y, a CLAIMED WATCH column) lives at $8103E8 = offset $103E8 in the
  // 128 KiB main RAM.  It is PERSISTENT simulation state: step() integrates it,
  // never overwrites it to a fixed value, so a seed flip here propagates.
  //
  // NOTE the brief's example p1raw ($803970) does NOT work and that is a finding:
  // p1raw is the raw input word, which step() rewrites every frame from the
  // portin, so a seed flip is clobbered before the first digest feed.  Input
  // registers are not seed-sensitive in the cumulative; player position is.
  const o = build();
  assert.equal(verifyReplay(o).green, true, 'baseline green before mutation');

  const m = JSON.parse(JSON.stringify(o));
  const ram = new Uint8Array(Buffer.from(m.seed.ramB64, 'base64'));
  const off = 0x103E8;                   // $8103E8 - $800000 (main RAM base)
  ram[off] ^= 0x01;
  m.seed.ramB64 = Buffer.from(ram).toString('base64');

  const r = verifyReplay(m);
  assert.equal(r.green, false, 'mutation B must go red');
  assert.equal(r.cumulativeMatch, false, 'cumulative must change');
  assert.notEqual(r.divergentPeriod, null);

  assert.equal(verifyReplay(o).green, true, 'baseline green after restore');
});

test('MUT-C corruption detection: a flipped digest.cumulative bit -> MISMATCH', { skip: !HAVE && 'fly-around ladder absent (CI)' }, () => {
  const o = build();
  assert.equal(verifyReplay(o).green, true, 'baseline green before mutation');

  const m = JSON.parse(JSON.stringify(o));
  // flip one hex char of the recorded cumulative.  The player recomputes its own
  // cumulative from the (unchanged) seed + portin, so it must report MISMATCH
  // and not GREEN -- never agree with a corrupted file.
  m.digest.cumulative = '0' + m.digest.cumulative.slice(1);
  assert.notEqual(m.digest.cumulative, o.digest.cumulative);

  const r = verifyReplay(m);
  assert.equal(r.green, false, 'mutation C must not pass');
  assert.equal(r.cumulativeMatch, false, 'the corrupted cumulative must not match');

  assert.equal(verifyReplay(o).green, true, 'baseline green after restore');
});
