// W577: canonical Hibachi A0 main script 2, its periodic checkpoint, and next frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAM, P } from '../src/machine.js';
import { ENEMY } from '../src/enemies.js';
import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import {
  SCHED, clearDispatched, dumpDispatched, installScripts, runScheduler25962E,
  scriptAddresses, seqStart2598D0,
} from '../src/scheduler.js';
import {
  HIBACHI_A0, main2Init2A5054, main2Step2A506C,
} from '../src/hibachiend.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import { ROM_WINDOW_COUNT, tableBeforeW576 } from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00148131.json');
const required = [TABLES, IMAGE];
const SKIP = required.every(existsSync) ? false
  : 'exact W577 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [CHECKPOINT,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W577 assets or checkpoint absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const PRIOR_TABLE = SKIP ? null : tableBeforeW576(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const LIVE_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const TABLE_HASH = '3197bb23300fac664979cb898e81e1a68c89b3386e3d393fb789c77a0b04b41f';
const PRIOR_HASH = 'cdce48388d34b89a09ce5d2b8a21ea7dad807bb1fe42468cf8ff3fe44387f30f';
const REC = 0x810c00;
const SUB = 0x814800;
const RNG_STATE = 0x803916;
const FREEZE = 0x8130d2;
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');

function bench() {
  const ram = new Ram();
  const sounds = [];
  ram.setU32(REC + 0x06, SUB);
  return {
    ram, sounds,
    ctx: {
      bossRec: REC, bossSubRec: SUB, tables: MT,
      soundPost: (site) => sounds.push(site),
    },
  };
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

const attached = (ram, part) => ram.u32(SUB + part + 0x02);
const OFFSET_PARTS = Object.freeze([
  [0x020, 0x14c0, 0xf180], [0x040, 0xfb00, 0xee40],
  [0x060, 0xe880, 0xeec0], [0x080, 0x0740, 0x1040],
  [0x0a0, 0xf780, 0x14c0], [0x0c0, 0xe540, 0x1040],
]);
const ROOT_PARTS = Object.freeze([0x1a0, 0x140, 0x160, 0x180]);

function classify({ x, y, desired = 0, active = 0, heading = 0, state = 0 }) {
  const b = bench();
  const a4 = SCHED.seqDst;
  b.ram.setU16(FREEZE, 1);
  b.ram.setU32(SUB + 0x02, ((y << 16) | x) >>> 0);
  b.ram.setU8(SUB + 0x1a, 4);
  b.ram.setU8(SUB + 0x1b, heading);
  b.ram.setU8(a4, desired);
  b.ram.setU8(a4 + 1, active);
  b.ram.setU16(RNG_STATE, state);
  main2Step2A506C(b.ram, ROM, b.ctx, a4);
  return b;
}

test('W577 pins the exact id-2 pair, boundary, registrations, and unchanged table set',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A0.table + 16), ROM.u32(HIBACHI_A0.table + 20),
      HIBACHI_A0.s1End, HIBACHI_A0.s2Init, HIBACHI_A0.s2Step, HIBACHI_A0.s2End,
    ], [0x2a5054, 0x2a506c, 0x2a5054, 0x2a5054, 0x2a506c, 0x2a50d0]);
    assert.equal(HIBACHI_A0.s2Step - HIBACHI_A0.s2Init, 0x18);
    assert.equal(HIBACHI_A0.s2End - HIBACHI_A0.s2Step, 0x64);
    assert.equal(IMG.readUInt16BE(0x2a50cc), 0x6000);
    assert.equal(IMG.readInt16BE(0x2a50ce), -0x0218);
    assert.equal(0x2a50ce + IMG.readInt16BE(0x2a50ce), 0x2a4eb6,
      'the extension-word displacement enters the attachment body');
    assert.equal(IMG.readUInt16BE(HIBACHI_A0.s2End), 0x1d7c,
      'A0 id 3 starts at the exclusive end');
    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A0.s2Init));
    assert.ok(registered.has(HIBACHI_A0.s2Step));

    assert.equal(ROM_WINDOW_COUNT, 851);
    assert.equal(TABLE_JSON.rom.windows.length, 851);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 452689);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((w) => w.why.startsWith('W577:')), []);
  });

test('W577 init falls through, consumes two draws, and moves on the seeded heading',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.seqDst;
    b.ram.setU32(SUB + 0x02, 0x50001000);
    b.ram.setU16(RNG_STATE, 0);
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 2);

    const seeded = IMG.readUInt8(0x242e42 + 1);
    const vector = MT.vector(4, seeded & 0x3f);
    const target = (IMG.readUInt8(0x242bac + 2) + 0x10) & 0x3f;
    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s2Init]);
    assert.deepEqual([
      b.ram.u8(SUB + 0x1a), b.ram.u8(SUB + 0x1b), b.ram.u16(RNG_STATE),
      b.ram.u16(SUB + 0x02), b.ram.u16(SUB + 0x04),
      b.ram.u8(a4), b.ram.u8(a4 + 1),
    ], [4, seeded, 2, u16(0x5000 + vector.dy), u16(0x1000 + vector.dx), target, 1]);
    assert.equal(attached(b.ram, 0x180), b.ram.u32(SUB + 0x02));
  });

test('W577 moves before slew and handles reached, wrapped, and half-turn targets literally',
  { skip: SKIP }, () => {
    const moving = bench();
    const a4 = SCHED.seqDst;
    moving.ram.setU32(SUB + 0x02, 0x40001400);
    moving.ram.setU8(SUB + 0x1a, 4);
    moving.ram.setU8(SUB + 0x1b, 7);
    moving.ram.setU8(a4, 8);
    moving.ram.setU8(a4 + 1, 1);
    const vector = MT.vector(4, 7);
    main2Step2A506C(moving.ram, ROM, moving.ctx, a4);
    assert.deepEqual([
      moving.ram.u16(SUB + 0x02), moving.ram.u16(SUB + 0x04), moving.ram.u8(SUB + 0x1b),
    ], [u16(0x4000 + vector.dy), u16(0x1400 + vector.dx), 8],
    'movement uses heading 7 before the slew stores heading 8');

    const reached = classify({ x: 0x1800, y: 0x6400, desired: 0, active: 1, heading: 1 });
    assert.deepEqual([
      reached.ram.u8(SUB + 0x1b), reached.ram.u8(SCHED.seqDst),
      reached.ram.u8(SCHED.seqDst + 1), reached.ram.u16(RNG_STATE),
    ], [0, 0, 0, 1], 'suppression preserves the reached target and cleared active byte');

    const wrapped = classify({ x: 0x1800, y: 0x6400, desired: 0, active: 1, heading: 0x3f });
    assert.equal(wrapped.ram.u8(SUB + 0x1b), 0);
    assert.equal(wrapped.ram.u8(SCHED.seqDst + 1), 0);

    const half = classify({ x: 0x1800, y: 0x6400, desired: 0x20, active: 7, heading: 0 });
    assert.deepEqual([
      half.ram.u8(SUB + 0x1b), half.ram.u8(SCHED.seqDst), half.ram.u8(SCHED.seqDst + 1),
    ], [0x3f, 0x20, 7], 'difference $20 takes the decrement direction and preserves nonzero active');
  });

test('W577 target classifier pins every unsigned X and Y boundary and byte bias',
  { skip: SKIP }, () => {
    const draw = IMG.readUInt8(0x242bac + 1);
    const cases = [
      [0x13ff, 0x0000, 0x10], [0x1400, 0x5fff, 0x00],
      [0x23ff, 0x5fff, 0x00], [0x2400, 0x0000, 0x30],
      [0xe000, 0x0000, 0x10], [0x1800, 0x5fff, 0x00],
      [0x1800, 0x6800, 0x20], [0x1800, 0xffff, 0x20],
    ];
    for (const [x, y, bias] of cases) {
      const b = classify({ x, y });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [((draw + bias) & 0xff) & 0x3f, 1, 1],
      `classifier mismatch at X $${x.toString(16)} Y $${y.toString(16)}`);
    }

    for (const y of [0x6000, 0x67ff]) {
      const b = classify({ x: 0x1800, y, desired: 0x2a, active: 0 });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [0x2a, 0, 1], 'suppression consumes the draw but writes neither target byte');
    }

    const wrap = classify({ x: 0x13ff, y: 0, state: 0x00ff });
    const wrappedDraw = IMG.readUInt8(0x242bac);
    assert.deepEqual([
      wrap.ram.u16(RNG_STATE), wrap.ram.u8(SCHED.seqDst),
    ], [0x0000, (wrappedDraw + 0x10) & 0x3f],
    'the RNG counter wraps as a byte without carrying into the high byte');
  });

test('W577 freeze still turns, draws, and refreshes all ten wrapped attachments',
  { skip: SKIP }, () => {
    const b = classify({ x: 0xf900, y: 0xf400, desired: 0x12, active: 0 });
    const root = 0xf400f900;
    assert.equal(b.ram.u32(SUB + 0x02), root);
    for (const [part, dy, dx] of OFFSET_PARTS) {
      assert.deepEqual([
        b.ram.u16(SUB + part + 0x02), b.ram.u16(SUB + part + 0x04),
      ], [u16(0xf400 + dy), u16(0xf900 + dx)]);
    }
    for (const part of ROOT_PARTS) assert.equal(attached(b.ram, part), root);
    assert.equal(b.ram.u16(RNG_STATE), 1);
    assert.deepEqual(b.sounds, []);
  });

test('W577 persists without player, object, bullet, sound, or sequencer transitions',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.seqDst;
    b.ram.setU32(SUB + 0x02, 0x64001800);
    b.ram.setU8(SUB + 0x1a, 4);
    b.ram.setU8(SUB + 0x1b, 0x10);
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 2);
    runScheduler25962E(b.ram, ROM, b.ctx);
    const p1 = Array.from(b.ram.b.slice(RAM.player1, RAM.player1 + 0x62));
    const p2 = Array.from(b.ram.b.slice(RAM.player2, RAM.player2 + 0x62));
    const objects = Array.from(b.ram.b.slice(RAM.objTable, RAM.objTableEnd));
    const bullets = Array.from(b.ram.b.slice(0x817f8c, 0x81b40c));
    for (let i = 0; i < 200; i++) runScheduler25962E(b.ram, ROM, b.ctx);
    assert.deepEqual([
      b.ram.u16(SCHED.seqCursor), b.ram.u16(SCHED.seqRestart),
      b.ram.u16(SCHED.seqPending), b.sounds.length,
    ], [2, 0, 2, 0]);
    assert.deepEqual(Array.from(b.ram.b.slice(RAM.player1, RAM.player1 + 0x62)), p1);
    assert.deepEqual(Array.from(b.ram.b.slice(RAM.player2, RAM.player2 + 0x62)), p2);
    assert.deepEqual(Array.from(b.ram.b.slice(RAM.objTable, RAM.objTableEnd)), objects);
    assert.deepEqual(Array.from(b.ram.b.slice(0x817f8c, 0x81b40c)), bullets);
    assert.notEqual(b.ram.u16(a4), 0, 'the target state remains live without clearing the A0 slot');
  });

test('W577 restores exact lf148131 and reaches the W587 $291040 frontier',
  { skip: SKIP_CHECKPOINT }, async () => {
    const live = await bundle();
    assert.equal(canonicalHash(live.tables), LIVE_TABLE_HASH);
    assert.deepEqual(live.tables, TABLE_JSON);
    const assets = { ...live, tables: PRIOR_TABLE };
    assert.equal(canonicalHash(assets.tables), PRIOR_HASH);
    assert.deepEqual(assets.tables, PRIOR_TABLE);
    const exact = live;

    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.deepEqual([
      checkpoint.tablesSha256, checkpoint.frame.logic, checkpoint.frame.video,
      checkpoint.raw.stage, checkpoint.raw.stageX2, checkpoint.raw.stageX4, checkpoint.raw.loop,
      checkpoint.ramSha256, checkpoint.gameSha256,
    ], [
      TABLE_HASH, 148131, 158744, 4, 8, 16, 1,
      '4b10c9936658b340e8deb501c4924a1ff7ce4dcbba6b38ffcd155582333c3e71',
      '079c70c717faacc08c5ff1fdbea27d42c359bdace0f276f8c4306ed324a7b4e5',
    ]);
    const currentCheckpoint = { ...checkpoint, tablesSha256: LIVE_TABLE_HASH };
    assert.deepEqual({ ...currentCheckpoint, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
      'W584 compatibility changes only the proven additive table identity');
    const resumed = restoreCheckpoint(currentCheckpoint, exact, { ship: 0, style: 4 });
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 5900; attempted++) {
      try {
        resumed.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        resumed.game.step(resumed.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    const state = checkpointDocument(resumed.game, exact, {
      ...checkpoint.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    });
    const liveBoss = Array.from({ length: ENEMY.slots }, (_, index) =>
      ENEMY.table + index * ENEMY.stride).find((a5) =>
      resumed.game.ram.u32(a5 + 0x4c) === 0x2a4606);
    const a6 = resumed.game.ram.u32(liveBoss + 0x06);
    assert.deepEqual([
      attempted, resumed.game.logicFrame, resumed.game.videoFrame, error?.romAddress,
      state.raw.stage, state.raw.loop, a6, resumed.game.ram.u8(a6 + 0x1a),
    ], [5667, 153797, 164459, 0x291040, 4, 1, 0x81533c, 2]);
    assert.match(error?.message ?? '', /word at \$291040 is outside every ROM window/);
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      'e37340e127fade24b6bb4b1db8de479c66a8aed883c53a3c5b3bc10d6a45e30b',
      'ad99045f00e36a8a2343880bd4a7e14c3aaac1e7bbecc6f104603f6f7044d85a',
    ]);
  });
