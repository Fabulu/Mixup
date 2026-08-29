// W578: canonical Hibachi A0 main script 5, its periodic checkpoint, and next frontier.

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
  HIBACHI_A0, main5Init2A5156, main5Step2A516E,
} from '../src/hibachiend.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import { ROM_WINDOW_COUNT, tableBeforeW588 } from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00148631.json');
const required = [TABLES, IMAGE];
const SKIP = required.every(existsSync) ? false
  : 'exact W578 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [CHECKPOINT,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W578 assets or checkpoint absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W587_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const LIVE_TABLE_HASH = 'dbffbc266495d330397680b012a61ed3c2141e8c3fc9d979f1d752b835fe6914';
const W587_TABLE_HASH = 'ba6dfc5a6d50f7f5303452fa8341c6139fe99d4cc6a944e23182144a9c7a8741';
const STORED_CHECKPOINT_TABLE_HASH = '3197bb23300fac664979cb898e81e1a68c89b3386e3d393fb789c77a0b04b41f';
const REC = 0x810c00;
const SUB = 0x814800;
const RNG_STATE = 0x803916;
const FREEZE = 0x8130d2;
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');

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
  b.ram.setU8(SUB + 0x1a, 8);
  b.ram.setU8(SUB + 0x1b, heading);
  b.ram.setU8(a4, desired);
  b.ram.setU8(a4 + 1, active);
  b.ram.setU16(RNG_STATE, state);
  main5Step2A516E(b.ram, ROM, b.ctx, a4);
  return b;
}

test('W578 pins the exact id-5 pair, raw span, registrations, and unchanged table set',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A0.table + 40), ROM.u32(HIBACHI_A0.table + 44),
      ROM.u32(HIBACHI_A0.table + 48),
      HIBACHI_A0.s5Init, HIBACHI_A0.s5Step, HIBACHI_A0.s5End,
    ], [0x2a5156, 0x2a516e, 0x2a51d2, 0x2a5156, 0x2a516e, 0x2a51d2]);
    assert.equal(HIBACHI_A0.s5Step - HIBACHI_A0.s5Init, 0x18);
    assert.equal(HIBACHI_A0.s5End - HIBACHI_A0.s5Step, 0x64);
    assert.deepEqual([
      binaryHash(IMG.subarray(HIBACHI_A0.s5Init, HIBACHI_A0.s5Step)),
      binaryHash(IMG.subarray(HIBACHI_A0.s5Step, HIBACHI_A0.s5End)),
      binaryHash(IMG.subarray(HIBACHI_A0.s5Init, HIBACHI_A0.s5End)),
    ], [
      '91b4899409e225a00e8453f425d8baffbec34a40c68b26906573ebcee2289f8f',
      '67af514debdea9033adac0d26e02f7955bf4c0c6d9123044b27a6e0036b8ecf4',
      'a796c17654d2f689ad29ec15933d4cf9c522732f575443112c9dfbe60e1bacaa',
    ]);
    assert.equal(IMG.readUInt16BE(0x2a51ce), 0x6000);
    assert.equal(0x2a51d0 + IMG.readInt16BE(0x2a51d0), 0x2a4eb6);
    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A0.s5Init));
    assert.ok(registered.has(HIBACHI_A0.s5Step));

    assert.equal(ROM_WINDOW_COUNT, 944);
    assert.equal(TABLE_JSON.rom.windows.length, 944);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 457163);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((w) => w.why.startsWith('W578:')), []);
  });

test('W578 init falls through, consumes two draws, and moves at speed eight',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.seqDst;
    b.ram.setU32(SUB + 0x02, 0x50000000);
    b.ram.setU16(RNG_STATE, 0);
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 5);

    const seeded = IMG.readUInt8(0x242e42 + 1);
    const vector = MT.vector(8, seeded & 0x3f);
    const target = (IMG.readUInt8(0x242bac + 2) + 0x10) & 0x3f;
    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s5Init]);
    assert.deepEqual([
      b.ram.u8(SUB + 0x1a), b.ram.u8(SUB + 0x1b), b.ram.u16(RNG_STATE),
      b.ram.u16(SUB + 0x02), b.ram.u16(SUB + 0x04),
      b.ram.u8(a4), b.ram.u8(a4 + 1),
    ], [8, seeded, 2, u16(0x5000 + vector.dy), u16(vector.dx), target, 1]);
    assert.equal(attached(b.ram, 0x180), b.ram.u32(SUB + 0x02));
  });

test('W578 moves before slew and pins every widened unsigned classifier boundary',
  { skip: SKIP }, () => {
    const moving = bench();
    const a4 = SCHED.seqDst;
    moving.ram.setU32(SUB + 0x02, 0x40001400);
    moving.ram.setU8(SUB + 0x1a, 8);
    moving.ram.setU8(SUB + 0x1b, 7);
    moving.ram.setU8(a4, 8);
    moving.ram.setU8(a4 + 1, 1);
    const vector = MT.vector(8, 7);
    main5Step2A516E(moving.ram, ROM, moving.ctx, a4);
    assert.deepEqual([
      moving.ram.u16(SUB + 0x02), moving.ram.u16(SUB + 0x04), moving.ram.u8(SUB + 0x1b),
    ], [u16(0x4000 + vector.dy), u16(0x1400 + vector.dx), 8]);

    const draw = IMG.readUInt8(0x242bac + 1);
    const cases = [
      [0x0fff, 0x0000, 0x10], [0x1000, 0x63ff, 0x00],
      [0x27ff, 0x63ff, 0x00], [0x2800, 0x0000, 0x30],
      [0xd7ff, 0x0000, 0x30], [0xd800, 0x0000, 0x10],
      [0x1800, 0x63ff, 0x00], [0x1800, 0x6c00, 0x20],
    ];
    for (const [x, y, bias] of cases) {
      const b = classify({ x, y });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [((draw + bias) & 0xff) & 0x3f, 1, 1]);
    }
    for (const y of [0x6400, 0x6bff]) {
      const b = classify({ x: 0x1800, y, desired: 0x2a, active: 0 });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [0x2a, 0, 1], 'suppression consumes RNG but preserves both target bytes');
    }
    const wrap = classify({ x: 0x0fff, y: 0, state: 0x00ff });
    assert.deepEqual([
      wrap.ram.u16(RNG_STATE), wrap.ram.u8(SCHED.seqDst),
    ], [0, (IMG.readUInt8(0x242bac) + 0x10) & 0x3f]);
  });

test('W578 freeze preserves the root while refreshing all ten attachments',
  { skip: SKIP }, () => {
    const b = classify({ x: 0xf900, y: 0xf400, desired: 0x12, active: 1, heading: 0x11 });
    const root = 0xf400f900;
    assert.equal(b.ram.u32(SUB + 0x02), root);
    assert.equal(b.ram.u8(SUB + 0x1b), 0x12);
    for (const [part, dy, dx] of OFFSET_PARTS) {
      assert.deepEqual([
        b.ram.u16(SUB + part + 0x02), b.ram.u16(SUB + part + 0x04),
      ], [u16(0xf400 + dy), u16(0xf900 + dx)]);
    }
    for (const part of ROOT_PARTS) assert.equal(attached(b.ram, part), root);
    assert.equal(b.ram.u16(RNG_STATE), 1);
    assert.deepEqual(b.sounds, []);
  });

test('W578 restores lf148631 and reaches the exact W587 $291040 frontier',
  { skip: SKIP_CHECKPOINT }, async () => {
    const live = await bundle();
    assert.equal(canonicalHash(live.tables), LIVE_TABLE_HASH);
    assert.deepEqual(live.tables, TABLE_JSON);
    const assets = { ...live, tables: W587_TABLE };
    assert.equal(canonicalHash(assets.tables), W587_TABLE_HASH);

    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.deepEqual([
      checkpoint.tablesSha256, checkpoint.frame.logic, checkpoint.frame.video,
      checkpoint.raw.stage, checkpoint.raw.stageX2, checkpoint.raw.stageX4, checkpoint.raw.loop,
      checkpoint.ramSha256, checkpoint.gameSha256,
    ], [
      STORED_CHECKPOINT_TABLE_HASH, 148631, 159244, 4, 8, 16, 1,
      '3f03210ccc722ab539cb22d26af1b86443e4d6250cb572f2efecce654449b449',
      '52192c7dcc2b3883442d07776887016cb75a84bcbfa9d98a9d47f23e6d63eeba',
    ]);
    const currentCheckpoint = { ...checkpoint, tablesSha256: W587_TABLE_HASH };
    assert.deepEqual({ ...currentCheckpoint, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
      'W587 compatibility changes only the proven additive table identity');
    const resumed = restoreCheckpoint(currentCheckpoint, assets, { ship: 0, style: 4 });
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 5400; attempted++) {
      try {
        resumed.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        resumed.game.step(resumed.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    const state = checkpointDocument(resumed.game, assets, {
      ...checkpoint.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    });
    const liveBoss = Array.from({ length: ENEMY.slots }, (_, index) =>
      ENEMY.table + index * ENEMY.stride).find((a5) =>
      resumed.game.ram.u32(a5 + 0x4c) === 0x2a4606);
    const a6 = resumed.game.ram.u32(liveBoss + 0x06);
    assert.deepEqual([
      attempted, resumed.game.logicFrame, resumed.game.videoFrame, error?.romAddress,
      state.raw.stage, state.raw.loop, a6, resumed.game.ram.u8(a6 + 0x1a),
    ], [5167, 153797, 164459, 0x291040, 4, 1, 0x81533c, 2]);
    assert.match(error?.message ?? '', /word at \$291040 is outside every ROM window/);
    assert.deepEqual([
      resumed.game.ram.u16(SCHED.seqCursor), resumed.game.ram.u16(SCHED.seqSub),
      resumed.game.ram.u16(SCHED.seqPending), resumed.game.ram.u16(SCHED.seqRestart),
      resumed.game.ram.u16(SCHED.a2Base + 0x0e * SCHED.a2Stride),
    ], [8, 4, 8, 0, 0x8000]);
    assert.deepEqual(Array.from({ length: SCHED.a4Slots }, (_, index) =>
      resumed.game.ram.u16(SCHED.a4Base + index * SCHED.a4Stride)),
    Array(SCHED.a4Slots).fill(0));
    assert.deepEqual(Array.from({ length: SCHED.a1Slots }, (_, index) =>
      resumed.game.ram.u16(SCHED.a1Base + index * SCHED.a1Stride)),
    Array(SCHED.a1Slots).fill(0));
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      'e37340e127fade24b6bb4b1db8de479c66a8aed883c53a3c5b3bc10d6a45e30b',
      '614e030798098ebd7f2ce40905eab521f038258f2efe3377779f724a768dd5be',
    ]);
  });
