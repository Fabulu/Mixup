// WAVE 132 -- LIVE-PAGE PLAY + the divergence UI, gated.
//
// What is pinned here:
//   * GREEN: the LIVE verifier (`armPlayback`) on a real fly-around `.replay`
//     returns green with the SAME cumulative the Node headless player
//     (`verifyReplay`) computes -- the visible Game IS the verify target, and a
//     green live verdict is a green headless verdict on the same file.  This is
//     the real-data cross-check that the boot-from-.replay + the playback feed +
//     the digest comparison are faithful.
//   * MUT-A (portin sensitivity): flip one bit in one portin word at an ACTIVE
//     frame -> the verifier reports the divergent 250-frame window (red, not
//     green, not "N frames differ").  Baseline green -> mutation red -> restore.
//   * MUT-B (seed sensitivity): flip one byte in the seed RAM at a CLAIMED
//     player address (py at $8103E8, the W129 finding-B address) -> divergent
//     window.  Differential green -> red -> green.
//   * MUT-C (cumulative MISMATCH): corrupt `digest.cumulative` -> every period
//     window still reproduces BUT the cumulative hash differs -> green is false
//     with divergentPeriod null (a MISMATCH, not a window divergence).
//   * shape (always runs, no ROM): `decodePortinWords` round-trips the u16be
//     encoder, and `armPlayback` guards the format.
//
// The ROM-gated tests use the self-contained fly-around fixture
// `fly-around.lf2000-2250.replay` (seed + portin + digest in one file, regenerated
// by the gate), so they SKIP when it is absent (CI), the way `w131recplay.test.js`
// and `w129replay.test.js` skip.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  armPlayback, decodePortinWords, b64, unb64, FORMAT,
} from '../src/web/replay.js';
import { Game } from '../src/main.js';
import { verifyReplay } from '../tools/replay.mjs';
import { AUTOSHOT_MUTATE, CLAMP_ORDER } from '../src/player.js';
import { W82_MUTATE } from '../src/boss.js';
import { B2_MUTATE } from '../src/background.js';
import { W94_MUTATE } from '../src/bossscripts.js';
import { W95_MUTATE } from '../src/bossphase.js';
import { W95G_MUTATE } from '../src/bossguns.js';
import { W96_MUTATE } from '../src/bossarrival.js';
import { adoptCurrentWindows } from '../src/rom.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const LADDER = path.join(ROOT, 'tools/oracle/out/w69/fly-around');
const FIXTURE = path.join(LADDER, 'fly-around.lf2000-2250.replay');

const TABLES_PATH = path.join(ROOT, 'rip/port/player.tables.json');
const HAVE = fs.existsSync(FIXTURE) && fs.existsSync(TABLES_PATH);
// W269: the LIVE window list, adopted into each fixture's frozen tables after being
// proven a byte-superset of them. See `adoptCurrentWindows`.
const LIVE_TABLES = HAVE
  ? JSON.parse(fs.readFileSync(TABLES_PATH, 'utf8')) : { rom: { windows: [] } };

// The fly-around script holds DOWN at lf 2130 (manifest.json `2130=D`): a
// KNOWN-ACTIVE, non-neutral-stick frame (the same anchor `w129replay.test.js`
// and `w131recplay.test.js` use).  lf 2130 is index 129 in portin
// (lf 2000 + 129 + 1 = 2130).  py (player Y) lives at $8103E8 = offset $103E8 in
// the 128 KiB main RAM -- the W129 finding-B address: PERSISTENT simulation
// state that step() integrates, never overwrites, so a seed flip propagates.
const ACTIVE_LF = 2130;
const SEED_LF = 2000;
const PY_OFF = 0x103E8;             // $8103E8 - $800000 (main RAM base)

/** Reset the eight module mutation switches the way `replay.mjs:77` and
 *  `portdiff.mjs:137-144` do, so a prior `--break` run does not leak into the
 *  playback walk.  The page never sets these; a test that ran a mutated walk
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

/** Parse "803970=FF,810424=FF" into [[addr,val]...], the way `replay.mjs:70
 *  parsePoke` does.  Inlined (not imported) because the headless tool keeps it
 *  private; a replay declares its own poke, and this helper applies that file
 *  policy in the same order as `Demo.step()` and `verifyReplay`. */
function parsePoke(s) {
  return (s ?? '').split(',').filter(Boolean).map((kv) => {
    const [a, v] = kv.split('=');
    return [parseInt(a, 16), parseInt(v, 16)];
  });
}

// ===========================================================================
// 1. SHAPE (always runs, no ROM).
// ===========================================================================

test('decodePortinWords: u16be round-trips (mirror of stopRecorder encode)', () => {
  // The W131 recorder encodes each portin word as two big-endian bytes; this is
  // the inverse `Demo.playFrom` uses to feed the visible Game.  Pin the exact
  // byte order so a future edit cannot drift from `replay.mjs:179 decodePortin`.
  const obj = { portin: { encoding: 'u16be', count: 3, b64: b64(new Uint8Array([
    0x12, 0x34, 0x00, 0x01, 0xff, 0xff,
  ])) } };
  const w = decodePortinWords(obj);
  assert.ok(w instanceof Uint16Array);
  assert.equal(w.length, 3);
  assert.deepEqual(Array.from(w), [0x1234, 0x0001, 0xffff]);
});

test('decodePortinWords: rejects an unsupported encoding', () => {
  assert.throws(() => decodePortinWords({ portin: { encoding: 'u8', b64: '' } }),
    /unsupported portin encoding/);
});

test('armPlayback: guards the v1 format', () => {
  assert.throws(() => armPlayback({}, { format: 'something.else/v2' }),
    /not a ddpdoj\.replay\/v1 artifact/);
});

// ===========================================================================
// 2. THE LIVE VERIFIER ON THE REAL FIXTURE (ROM-gated; skip when absent).
// Boots a Game from the fixture's own seed, feeds its portin one word per logic
// frame (poke + step + feed, the exact order the live page runs), and finalises
// the verifier.  Cross-checks every verdict against the Node headless player.
// ===========================================================================

/**
 * Play a parsed `.replay` object through the LIVE verifier the way the page
 * does.  Boots a fresh Game from `obj.seed` (mirror of `replay.mjs:118` and
 * `Demo.playFrom`), resets the mutation switches, then for each portin word:
 * apply the file's poke, `game.step(word)`, `verifier.feed()`.  Returns the
 * finalised verdict (`verifyReplay`'s shape).
 */
async function playObj(obj) {
  const ram = unb64(obj.seed.ramB64);
  const bgBytes = unb64(obj.seed.bgB64);
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  // W269: the fixture's tables are frozen -- correctly, except for the ROM WINDOW
  // LIST, which is a port artifact and not game state. `adoptCurrentWindows` proves
  // the current list is a byte-superset and then substitutes it, so a subsystem
  // translated after the recording can run inside it. See src/rom.js.
  const tables = JSON.parse(new TextDecoder().decode(unb64(obj.seed.tablesB64)));
  tables.rom = adoptCurrentWindows(tables.rom, LIVE_TABLES.rom);
  const game = new Game(ram, tables, {
    logicFrame: obj.seed.lf,
    videoFrame: obj.seed.vf,
    bgSeed,
  });
  resetSwitches();

  const words = decodePortinWords(obj);
  const pokes = parsePoke(obj.poke);
  const ver = armPlayback(game, obj);
  for (let i = 0; i < words.length; i++) {
    for (const [a, val] of pokes) game.ram.setU8(a, val);
    game.step(words[i]);
    ver.feed();
  }
  return ver.finalize();
}

/** Read + parse the fixture once per call (tests mutate the object). */
function readFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

test('play: GREEN -- the live verifier agrees with the headless player',
  { skip: !HAVE && 'fly-around fixture absent (CI)' }, async () => {
    const o = readFixture();

    const r = await playObj(o);
    assert.equal(r.green, true, 'live verifier must be GREEN on a known-good fixture');
    assert.equal(r.cumulativeMatch, true);
    assert.equal(r.divergentPeriod, null);
    assert.equal(r.compared, o.portin.count, 'compared every portin frame');
    assert.equal(r.periodCount, o.digest.periods.length);

    // THE CROSS-CHECK: the Node headless player on the SAME object must reach
    // the SAME verdict -- green, same cumulative, no divergence.  The live
    // verdict and the headless verdict are one property.
    const v = verifyReplay(o);
    assert.equal(v.green, true, 'headless player must also be GREEN');
    assert.equal(v.cumulative, r.cumulative,
      'live and headless cumulative must be byte-identical');
    assert.equal(v.divergentPeriod, null);
  });

test('play: MUT-A portin sensitivity -> divergent window (red)',
  { skip: !HAVE && 'fly-around fixture absent (CI)' }, async () => {
    const o = readFixture();
    assert.equal((await playObj(o)).green, true, 'baseline green before mutation');
    assert.equal(verifyReplay(o).green, true, 'headless baseline green too');

    // Flip bit 0 of the down-held portin word at lf 2130 (index 129).
    const m = JSON.parse(JSON.stringify(o));
    const bytes = unb64(m.portin.b64);
    const i = ACTIVE_LF - SEED_LF - 1;
    assert.equal(i, 129);
    bytes[i * 2 + 1] ^= 0x01;
    m.portin.b64 = b64(bytes);

    const r = await playObj(m);
    assert.equal(r.green, false, 'mutation A must go red');
    assert.notEqual(r.divergentPeriod, null, 'a period window must diverge');
    assert.equal(r.divergentPeriod.from <= ACTIVE_LF
      && r.divergentPeriod.to >= ACTIVE_LF, true,
      'the divergent window must contain the mutated frame');

    // The headless player agrees: same red, same divergent window index.
    const v = verifyReplay(m);
    assert.equal(v.green, false);
    assert.notEqual(v.divergentPeriod, null);
    assert.equal(v.divergentPeriod.index, r.divergentPeriod.index);

    assert.equal((await playObj(o)).green, true, 'baseline green after restore');
  });

test('play: MUT-B seed sensitivity -> divergent window (red)',
  { skip: !HAVE && 'fly-around fixture absent (CI)' }, async () => {
    // py (player Y, a CLAIMED WATCH column) at $8103E8 -- the W129 finding-B
    // address.  PERSISTENT simulation state: step() integrates it, never
    // overwrites it, so a seed flip propagates (unlike p1raw, which the step
    // rewrites from the portin before the first feed).
    const o = readFixture();
    assert.equal((await playObj(o)).green, true, 'baseline green before mutation');

    const m = JSON.parse(JSON.stringify(o));
    const ram = unb64(m.seed.ramB64);
    ram[PY_OFF] ^= 0x01;
    m.seed.ramB64 = b64(ram);

    const r = await playObj(m);
    assert.equal(r.green, false, 'mutation B must go red');
    assert.notEqual(r.divergentPeriod, null, 'a period window must diverge');

    const v = verifyReplay(m);
    assert.equal(v.green, false);
    assert.equal(v.divergentPeriod.index, r.divergentPeriod.index);

    assert.equal((await playObj(o)).green, true, 'baseline green after restore');
  });

test('play: MUT-C cumulative MISMATCH -> red with NO divergent window',
  { skip: !HAVE && 'fly-around fixture absent (CI)' }, async () => {
    // Corrupting digest.cumulative alone: every period window still reproduces
    // (divergentPeriod stays null) but the cumulative hash differs -> green is
    // false.  This is the MISMATCH path, distinct from a window divergence, and
    // the banner must be able to tell them apart.
    const o = readFixture();
    assert.equal((await playObj(o)).green, true, 'baseline green before mutation');

    const m = JSON.parse(JSON.stringify(o));
    // Flip one hex char of the cumulative hash (keep it a 64-char hex string).
    const c = m.digest.cumulative.split('');
    c[0] = c[0] === '0' ? '1' : '0';
    m.digest.cumulative = c.join('');

    const r = await playObj(m);
    assert.equal(r.green, false, 'mutation C must go red (MISMATCH)');
    assert.equal(r.cumulativeMatch, false, 'cumulative must NOT match');
    assert.equal(r.divergentPeriod, null,
      'no period window diverges -- this is a pure cumulative MISMATCH');

    assert.equal((await playObj(o)).green, true, 'baseline green after restore');
  });

test('play: check() surfaces the first divergence at the boundary (live)',
  { skip: !HAVE && 'fly-around fixture absent (CI)' }, async () => {
    // The page calls `check()` from `loop()` at each crossed period boundary so
    // a divergence shows up at the FIRST window rather than only at
    // end-of-portin.  Drive the verifier frame-by-frame with a mutated portin,
    // call `check()` after the boundary closes, and assert the divergent window
    // is reported BEFORE finalize.
    const o = readFixture();
    const m = JSON.parse(JSON.stringify(o));
    const bytes = unb64(m.portin.b64);
    bytes[(ACTIVE_LF - SEED_LF - 1) * 2 + 1] ^= 0x01;   // flip bit at lf 2130
    m.portin.b64 = b64(bytes);

    const ram = unb64(m.seed.ramB64);
    const bgBytes = unb64(m.seed.bgB64);
    const bgSeed = new Uint16Array(bgBytes.length >> 1);
    for (let i = 0; i < bgSeed.length; i++) {
      bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
    }
    const tables = JSON.parse(new TextDecoder().decode(unb64(m.seed.tablesB64)));
    tables.rom = adoptCurrentWindows(tables.rom, LIVE_TABLES.rom);   // W269
    const game = new Game(ram, tables, {
      logicFrame: m.seed.lf, videoFrame: m.seed.vf, bgSeed,
    });
    resetSwitches();

    const words = decodePortinWords(m);
    const pokes = parsePoke(m.poke);
    const ver = armPlayback(game, m);
    let liveDivergence = null;
    for (let i = 0; i < words.length; i++) {
      const boundsBefore = ver.periodBounds.length;
      for (const [a, val] of pokes) game.ram.setU8(a, val);
      game.step(words[i]);
      ver.feed();
      if (ver.periodBounds.length > boundsBefore) {
        // A window just closed; the page would call check() here.
        liveDivergence = await ver.check();
        if (liveDivergence) break;
      }
    }
    assert.notEqual(liveDivergence, null,
      'check() must surface the divergence at the first boundary, before finalize');
    assert.equal(liveDivergence.from <= ACTIVE_LF
      && liveDivergence.to >= ACTIVE_LF, true);

    // And finalize still reaches the cumulative verdict afterwards.
    const r = await ver.finalize();
    assert.equal(r.green, false);
    assert.equal(r.divergentPeriod.index, liveDivergence.index);
  });
