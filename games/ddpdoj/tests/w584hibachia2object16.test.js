// W584: canonical Hibachi A2 object 16 and the next exact frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAM, P } from '../src/machine.js';
import { ENEMY } from '../src/enemies.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import {
  SCHED, a2Run2598E6, a3Start259962, installScripts,
  runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';
import {
  HIBACHI_A0, HIBACHI_A2, HIBACHI_A3,
  a2Object16_2A4CFC,
} from '../src/hibachiend.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_BYTES, ROM_WINDOW_COUNT,
  tableBeforeW584, tableBeforeW588, tableBeforeW627,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const START = here('../probes/checkpoints/ship0-style4-lf00150131.json');
const PERIODIC = here('../probes/checkpoints/ship0-style4-lf00150631.json');
const required = [TABLES, IMAGE];
const SKIP = required.every(existsSync) ? false
  : 'exact W584 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [START, PERIODIC,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W584 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const PRE_W627_TABLE = SKIP ? null : tableBeforeW627(TABLE_JSON);
const W584_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const W583_TABLE = SKIP ? null : tableBeforeW584(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(W584_TABLE.rom);
const MT = SKIP ? null : new MoveTables(W584_TABLE, ROM);
const LIVE_TABLE_HASH = '8b1a0f893ee8ebf7a2033fbd90e70dfd0b3e125b0298c0fb073106f503c50995';
const PRE_W627_TABLE_HASH = '02c3aea71c84407cdb17bfa454ddc3abac4a62171ec59c627f4d99f3cb9f439e';
const TABLE_HASH = 'ba6dfc5a6d50f7f5303452fa8341c6139fe99d4cc6a944e23182144a9c7a8741';
const STORED_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const W583_TABLE_HASH = '86d0344a005779abefbb12f51c8f627b65bde0cd8a8438a346e8801741c4310a';
const REC = 0x810c00;
const SUB = 0x814800;
const RNG_STATE = 0x803916;
const PRIMARY = BUCKETS[1];
const PHASE = BUCKETS[24];
const ART = Object.freeze([
  0x00117c10, 0x00117d64, 0x00117eb8, 0x0011800c,
  0x00118160, 0x001182b4, 0x00118408, 0x0011855c,
]);
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (ram, base, length) =>
  Array.from({ length }, (_, offset) => ram.u8(base + offset));
const hex = (values) => values.map((value) => value.toString(16).padStart(2, '0')).join('');
const faultAt = (address) => (error) => error?.romAddress === address;
const slotWords = (ram, base, count, stride) => Array.from({ length: count },
  (_, index) => ram.u16(base + index * stride));

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function bench(tables = null) {
  const ram = new Ram();
  const sounds = [];
  ram.setU32(REC + 0x06, SUB);
  const ctx = {
    bossRec: REC, bossSubRec: SUB, tables: MT,
    soundPost: (site) => sounds.push(site),
  };
  if (tables) installScripts(ram, ROM, tables);
  return { ram, sounds, ctx };
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

function encodedPosition(position) {
  const d1 = (position + 0xf400f900) >>> 0;
  return (((d1 | 0) >> 6 & 0x07ff03ff) | 0x80008000) >>> 0;
}

function expectedRecord(position, art, palette) {
  const encoded = encodedPosition(position);
  return [
    encoded >>> 24, encoded >>> 16 & 0xff, encoded >>> 8 & 0xff, encoded & 0xff,
    art >>> 24, art >>> 16 & 0xff, art >>> 8 & 0xff, art & 0xff,
    0x0c, 0x38, 0, palette,
  ];
}

function setExpectedU16(array, address, value) {
  const offset = address - 0x800000;
  array[offset] = value >>> 8 & 0xff;
  array[offset + 1] = value & 0xff;
}

function setExpectedBytes(array, address, values) {
  array.set(values, address - 0x800000);
}

test('W584 pins raw pointer, routine, helper, art, and exact window boundaries',
  { skip: SKIP }, () => {
    assert.deepEqual([
      HIBACHI_A2.object16, HIBACHI_A2.object16CodeEnd,
      HIBACHI_A2.object16Art, HIBACHI_A2.object16ArtFrames,
      HIBACHI_A2.object17,
    ], [0x2a4cfc, 0x2a4d3c, 0x2a4d3e, 8, 0x2a4d5e]);
    assert.deepEqual([
      binaryHash(IMG.subarray(HIBACHI_A2.table, HIBACHI_A2.table + 0x50)),
      binaryHash(IMG.subarray(HIBACHI_A2.object16, HIBACHI_A2.object16CodeEnd)),
      binaryHash(IMG.subarray(0x23fe5c, 0x23fe92)),
      binaryHash(IMG.subarray(HIBACHI_A2.object16Art, HIBACHI_A2.object17)),
    ], [
      '9011c3baa5e0180bc715cb19cb9073407b904984cb7a915219d87a3a43fcca9b',
      '2a253fb61822c009fb146ea904e98e6bd74f9e1ff246bc3efb393912470c1bdf',
      '066dda8c718c103c61d0b08f5f57f45bcaa3f1d5262b50dad3e1144deb21628c',
      'd9b4c92b77309ae397e02e3ad17324bb60d7d03c544d9a72f7898b4aae962fe2',
    ]);
    assert.equal(ROM.u32(HIBACHI_A2.table + 16 * 4), HIBACHI_A2.object16);
    assert.equal(IMG.readUInt16BE(HIBACHI_A2.object16CodeEnd), 0x4e71);
    assert.deepEqual(ART.map((_, index) => ROM.u32(HIBACHI_A2.object16Art + index * 4)), ART);
    assert.deepEqual(ROM.bytes(0x23fe5c, 0x36),
      Array.from(IMG.subarray(0x23fe5c, 0x23fe92)));
    assert.deepEqual(ROM.bytes(HIBACHI_A2.object16Art, 0x20),
      Array.from(IMG.subarray(HIBACHI_A2.object16Art, HIBACHI_A2.object17)));

    const added = W584_TABLE.rom.windows.filter((window) => window.why.startsWith('W584:'));
    assert.deepEqual(added.map(({ base, len }) => [base, len]), [
      ['$23FE5C', 0x0036], ['$2A4D3E', 0x0020],
    ]);
    assert.throws(() => ROM.u8(HIBACHI_A2.object16), faultAt(HIBACHI_A2.object16),
      'transcribed executable bytes are not exported as runtime data');
    assert.throws(() => ROM.u32(HIBACHI_A2.object16Art + 0x1e),
      faultAt(HIBACHI_A2.object16Art + 0x1e), 'a long read cannot cross into object 17 code');
  });

test('W584 table migration is strict, additive, ordered, and identity-pinned',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM_WINDOW_COUNT, ROM_WINDOW_BYTES, ROM_OVERLAP_PAIRS,
      TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((sum, window) => sum + window.len, 0),
      canonicalHash(TABLE_JSON),
    ], [1643, 640376, 79, 1643, 640376, LIVE_TABLE_HASH]);
    assert.deepEqual([
      PRE_W627_TABLE.rom.windows.length,
      PRE_W627_TABLE.rom.windows.reduce((sum, window) => sum + window.len, 0),
      canonicalHash(PRE_W627_TABLE),
    ], [942, 457067, PRE_W627_TABLE_HASH]);
    assert.deepEqual([
      W584_TABLE.rom.windows.length,
      W584_TABLE.rom.windows.reduce((sum, window) => sum + window.len, 0),
      canonicalHash(W584_TABLE),
    ], [852, 452697, TABLE_HASH]);
    assert.deepEqual([
      W583_TABLE.rom.windows.length,
      W583_TABLE.rom.windows.reduce((sum, window) => sum + window.len, 0),
      canonicalHash(W583_TABLE),
    ], [850, 452611, W583_TABLE_HASH]);

    const withoutAdded = W584_TABLE.rom.windows.filter((window) =>
      window.base !== '$23FE5C' && window.base !== '$2A4D3E');
    assert.deepEqual(W583_TABLE.rom.windows, withoutAdded,
      'removing exactly W584 preserves every prior window byte and its order');
    assert.deepEqual(tableBeforeW584(W583_TABLE), W583_TABLE,
      'the reconstruction is idempotent on the exact W583 table');

    const partial = clone(W584_TABLE);
    partial.rom.windows = partial.rom.windows.filter((window) => window.base !== '$2A4D3E');
    assert.throws(() => tableBeforeW584(partial), /only partially present/);
    const malformed = clone(W584_TABLE);
    malformed.rom.windows.find((window) => window.base === '$23FE5C').len++;
    assert.throws(() => tableBeforeW584(malformed), /not the exact W584 additive shape/);
  });

test('W584 object 16 selects all art and routes exact register requests to both buckets',
  { skip: SKIP }, () => {
    assert.equal(scriptAddresses().filter((address) => address === HIBACHI_A2.object16).length, 1);
    const b = bench();
    const position = 0x1234f800;
    b.ram.setU32(SUB + 0x02, position);
    b.ram.setU8(SUB + 0x0ed, 0xff);
    b.ram.setU8(SUB + 0x0ee, 0x7a);

    b.ram.setU8(SUB + 0x15f, 1);
    b.ram.setU16(0x80390e, 2);
    b.ram.setU16(SUB + 0x132, 0);
    a2Object16_2A4CFC(b.ram, ROM, b.ctx);
    assert.deepEqual(bytes(b.ram, PRIMARY.buffer, RECORD_BYTES),
      expectedRecord(position, ART[0], 0xff));
    assert.equal(b.ram.u16(PRIMARY.buffer + 10), 0x00ff,
      'MOVE.B into cleared D4 zero-extends and ignores the adjacent byte');

    b.ram.setU8(SUB + 0x15f, 0);
    b.ram.setU16(0x80390e, 0);
    b.ram.setU16(SUB + 0x132, 4);
    a2Object16_2A4CFC(b.ram, ROM, b.ctx);
    assert.deepEqual(bytes(b.ram, PRIMARY.buffer + RECORD_BYTES, RECORD_BYTES),
      expectedRecord(position, ART[1], 0xff));

    b.ram.setU16(0x80390e, 1);
    b.ram.setU16(SUB + 0x132, 0x1c);
    a2Object16_2A4CFC(b.ram, ROM, b.ctx);
    assert.deepEqual(bytes(b.ram, PHASE.buffer, RECORD_BYTES),
      expectedRecord(position, ART[7], 0xff));
    assert.deepEqual([b.ram.u16(PRIMARY.counter), b.ram.u16(PHASE.counter)],
      [2 * RECORD_BYTES, RECORD_BYTES]);
    assert.equal(b.ram.u32(PRIMARY.buffer), encodedPosition(position),
      'the full 32-bit addition carries from the low position word before packing');

    b.ram.setU32(SUB + 0x02, 0);
    b.ram.setU16(SUB + 0x132, 8);
    a2Object16_2A4CFC(b.ram, ROM, b.ctx);
    assert.equal(b.ram.u32(PHASE.buffer + RECORD_BYTES), encodedPosition(0),
      'ASR.L treats the packed negative long as signed before masking');
  });

test('W584 selector addressing is signed and exact counters wrap without a capacity check',
  { skip: SKIP }, () => {
    const b = bench();
    b.ram.setU8(SUB + 0x15f, 0);
    b.ram.setU16(0x80390e, 1);
    b.ram.setU16(SUB + 0x132, 0xfffc);
    assert.throws(() => a2Object16_2A4CFC(b.ram, ROM, b.ctx),
      faultAt(HIBACHI_A2.object16Art - 4));
    b.ram.setU16(SUB + 0x132, 0x20);
    assert.throws(() => a2Object16_2A4CFC(b.ram, ROM, b.ctx),
      faultAt(HIBACHI_A2.object17));
    assert.equal(b.ram.u16(PHASE.counter), 0, 'both data faults happen before enqueue');

    b.ram.setU16(SUB + 0x132, 0);
    b.ram.setU16(PHASE.counter, 0xfffc);
    a2Object16_2A4CFC(b.ram, ROM, b.ctx);
    assert.equal(b.ram.u16(PHASE.counter), 8);
    assert.deepEqual(bytes(b.ram, PHASE.buffer + 0xfffc, RECORD_BYTES),
      expectedRecord(0, ART[0], 0));
  });

test('W584 renderer mutates exactly one request and its selected counter',
  { skip: SKIP }, () => {
    const b = bench();
    const position = 0x7654fedc;
    b.ram.setU32(SUB + 0x02, position);
    b.ram.setU16(SUB + 0x132, 0x10);
    b.ram.setU8(SUB + 0x0ed, 0x7b);
    b.ram.setU8(SUB + 0x15f, 1);
    b.ram.setU16(0x80390e, 2);
    for (let offset = 0; offset < RECORD_BYTES; offset++)
      b.ram.setU8(PRIMARY.buffer + offset, 0x5a);
    const expected = Uint8Array.from(b.ram.b);
    setExpectedU16(expected, PRIMARY.counter, RECORD_BYTES);
    setExpectedBytes(expected, PRIMARY.buffer, expectedRecord(position, ART[4], 0x7b));

    a2Object16_2A4CFC(b.ram, ROM, b.ctx);
    assert.deepEqual(b.ram.b, expected);
    assert.equal(b.sounds.length, 0);
    assert.equal(b.ram.u16(PHASE.counter), 0, 'the unrelated bucket remains untouched');
  });

test('W584 object 16 persists and scheduler gates preserve A3-before-A2 ordering',
  { skip: SKIP }, () => {
    const persistent = bench({ a2: HIBACHI_A2.table });
    persistent.ram.setU8(SUB + 0x15f, 1);
    persistent.ram.setU16(SUB + 0x132, 0);
    a2Run2598E6(persistent.ram, 16);
    const slot16 = SCHED.a2Base + 16 * SCHED.a2Stride;
    runScheduler25962E(persistent.ram, ROM, persistent.ctx);
    runScheduler25962E(persistent.ram, ROM, persistent.ctx);
    assert.deepEqual([
      persistent.ram.u16(slot16), persistent.ram.u16(PRIMARY.counter),
    ], [0x8001, 2 * RECORD_BYTES]);

    const ordered = bench({ a2: HIBACHI_A2.table, a3: HIBACHI_A3.table });
    ordered.ram.setU8(SUB + 0x15f, 1);
    ordered.ram.setU16(SUB + HIBACHI_A3.s6Selector, 0xdead);
    assert.equal(a3Start259962(ordered.ram, 6), true);
    a2Run2598E6(ordered.ram, 16);
    runScheduler25962E(ordered.ram, ROM, ordered.ctx);
    assert.deepEqual([
      ordered.ram.u16(SUB + HIBACHI_A3.s6Selector),
      ordered.ram.u32(PRIMARY.buffer + 4),
    ], [4, ART[1]], 'A3 id 6 advances the selector before A2 id 16 reads it');

    const ascending = bench({ a2: HIBACHI_A2.table });
    ascending.ram.setU8(SUB + 0x15f, 1);
    ascending.ram.setU16(SUB + 0x12a, 0);
    ascending.ram.setU16(SUB + 0x132, 0);
    a2Run2598E6(ascending.ram, 16);
    a2Run2598E6(ascending.ram, 14);
    runScheduler25962E(ascending.ram, ROM, ascending.ctx);
    assert.deepEqual([
      ascending.ram.u16(PRIMARY.buffer + 8),
      ascending.ram.u16(PRIMARY.buffer + RECORD_BYTES + 8),
    ], [0x1110, 0x0c38], 'A2 slot 14 dispatches before slot 16 regardless of arm order');
  });

test('W584 death pause still runs A2, while global suspend returns before it',
  { skip: SKIP }, () => {
    const paused = bench({ a2: HIBACHI_A2.table, a3: HIBACHI_A3.table });
    paused.ram.setU8(SUB + 0x15f, 1);
    assert.equal(a3Start259962(paused.ram, 6), true);
    a2Run2598E6(paused.ram, 16);
    paused.ram.setU16(SCHED.deathPause, 1);
    assert.equal(runScheduler25962E(paused.ram, ROM, paused.ctx), false);
    assert.deepEqual([
      paused.ram.u16(SCHED.a3Base),
      paused.ram.u16(SUB + HIBACHI_A3.s6Selector),
      paused.ram.u16(PRIMARY.counter),
    ], [0x8006, 0, RECORD_BYTES]);

    const suspended = bench({ a2: HIBACHI_A2.table, a3: HIBACHI_A3.table });
    suspended.ram.setU8(SUB + 0x15f, 1);
    assert.equal(a3Start259962(suspended.ram, 6), true);
    a2Run2598E6(suspended.ram, 16);
    suspended.ram.setU16(SCHED.suspend, 1);
    assert.equal(runScheduler25962E(suspended.ram, ROM, suspended.ctx), true);
    assert.deepEqual([
      suspended.ram.u16(SCHED.a3Base),
      suspended.ram.u16(SUB + HIBACHI_A3.s6Selector),
      suspended.ram.u16(PRIMARY.counter),
    ], [0x8006, 0, 0]);
  });

test('W584 migrated checkpoints restore exactly and reach the W587 loud frontier',
  { skip: SKIP_CHECKPOINT }, async () => {
    const loaded = await bundle();
    const assets = { ...loaded, tables: W584_TABLE };
    assert.equal(canonicalHash(assets.tables), TABLE_HASH);
    assert.deepEqual(assets.tables, W584_TABLE);

    const start = JSON.parse(readFileSync(START, 'utf8'));
    assert.deepEqual([
      start.tablesSha256, start.frame.logic, start.frame.video,
      start.ramSha256, start.gameSha256,
      start.selection.ship, start.selection.style,
      start.inputWord, start.probeOnly.invulnerable,
    ], [
      STORED_TABLE_HASH, 150131, 160744,
      '1003233dd2baeb59bb1af2208f56cd62bfdaf4752458c0d7769ca55429829a07',
      '7f9e1c02322b112168d630483e8c2d6d43ca1d70d4c691886ee036c8a7437f88',
      0, 4, 65499, true,
    ]);
    const adoptedStart = { ...start, tablesSha256: TABLE_HASH };
    assert.deepEqual(
      { ...adoptedStart, tablesSha256: start.tablesSha256 }, start,
      'in-memory W623 adoption changes only the checkpoint table identity',
    );
    const fromStart = restoreCheckpoint(adoptedStart, assets, adoptedStart.selection);
    const restoredStart = checkpointDocument(fromStart.game, assets, {
      ...start.selection, inputWord: fromStart.probe.inputWord, invulnerable: true,
    });
    assert.deepEqual([
      restoredStart.ramSha256, restoredStart.gameSha256,
    ], [start.ramSha256, start.gameSha256]);
    for (let frame = 0; frame < 500; frame++) {
      fromStart.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
      fromStart.game.step(fromStart.probe.inputWord);
    }
    const crossed = checkpointDocument(fromStart.game, assets, {
      ...start.selection, inputWord: fromStart.probe.inputWord, invulnerable: true,
    });

    const periodic = JSON.parse(readFileSync(PERIODIC, 'utf8'));
    assert.deepEqual([
      periodic.tablesSha256, periodic.frame.logic, periodic.frame.video,
      periodic.raw.stage, periodic.raw.stageX2, periodic.raw.stageX4, periodic.raw.loop,
      periodic.ramSha256, periodic.gameSha256,
    ], [
      STORED_TABLE_HASH, 150631, 161263, 4, 8, 16, 1,
      'd45cce1b4986b490e766e32316534fee262ce2a627e06e5c375cfcb843506eb2',
      'c304efde086106dc6dded1a9a9a8a765e138d9b288ba6542fdeec14746a5eca3',
    ]);
    assert.deepEqual([
      crossed.frame.logic, crossed.frame.video, crossed.ramSha256, crossed.gameSha256,
    ], [
      periodic.frame.logic, periodic.frame.video, periodic.ramSha256,
      'ee735c5d96e15f6746c218a1b6734d04441340735183f00b42ecf09136f6b92c',
    ], 'W593 selector materialization changes only the freshly replayed Game identity');

    const adoptedPeriodic = { ...periodic, tablesSha256: TABLE_HASH };
    assert.deepEqual(
      { ...adoptedPeriodic, tablesSha256: periodic.tablesSha256 }, periodic,
      'the periodic checkpoint retains its original table provenance',
    );
    const resumed = restoreCheckpoint(adoptedPeriodic, assets, adoptedPeriodic.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 3400; attempted++) {
      try {
        resumed.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        resumed.game.step(resumed.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    const state = checkpointDocument(resumed.game, assets, {
      ...periodic.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    });
    const a5 = Array.from({ length: ENEMY.slots }, (_, index) =>
      ENEMY.table + index * ENEMY.stride).find((record) =>
      resumed.game.ram.u32(record + 0x4c) === 0x2a4606);
    const a6 = resumed.game.ram.u32(a5 + 0x06);
    assert.deepEqual([
      attempted, resumed.game.logicFrame, resumed.game.videoFrame,
      error?.romAddress, state.raw.stage, state.raw.stageX2, state.raw.stageX4, state.raw.loop,
      a5, a6, resumed.game.ram.u32(a6 + 0x02),
      resumed.game.ram.u8(a6 + 0x1a), resumed.game.ram.u8(a6 + 0x1b),
      resumed.game.ram.u16(a6 + 0x132), resumed.game.ram.u16(a6 + 0x138),
      resumed.game.ram.u16(RNG_STATE), resumed.game.ram.u16(0x80390e),
    ], [
      3167, 153797, 164459, 0x291040, 4, 8, 16, 1,
      0x81378c, 0x81533c, 0x541819ac, 2, 0x1b, 0x0018, 0x0018, 0x00fb, 0,
    ]);
    assert.match(error?.message ?? '', /word at \$291040 is outside every ROM window/);
    assert.deepEqual([
      resumed.game.ram.u16(SCHED.seqCursor), resumed.game.ram.u16(SCHED.seqSub),
      resumed.game.ram.u16(SCHED.seqPending), resumed.game.ram.u16(SCHED.seqRestart),
    ], [8, 4, 8, 0]);
    assert.deepEqual(slotWords(resumed.game.ram,
      SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride), Array(SCHED.a4Slots).fill(0));
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      'e37340e127fade24b6bb4b1db8de479c66a8aed883c53a3c5b3bc10d6a45e30b',
      'fd1eec26149f88bedfb3034285dfde7c3c1d89aa09e4a8d35e8127771a98d5cf',
    ]);
    assert.equal(HIBACHI_A0.table + 8 * 8, 0x2a4e96,
      'the table row for A0 id 8 remains pinned after its script is ported');
  });
