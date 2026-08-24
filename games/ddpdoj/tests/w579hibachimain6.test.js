// W579: canonical Hibachi A0 main script 6, its periodic checkpoint, and next frontier.

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
  HIBACHI_A0, main6Init2A51D2, main6Step2A51EA,
} from '../src/hibachiend.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import { ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT } from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00149131.json');
const required = [TABLES, IMAGE];
const SKIP = required.every(existsSync) ? false
  : 'exact W579 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [CHECKPOINT,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W579 assets or checkpoint absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const LIVE_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const TABLE_HASH = '3197bb23300fac664979cb898e81e1a68c89b3386e3d393fb789c77a0b04b41f';
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
  b.ram.setU8(SUB + 0x1a, 6);
  b.ram.setU8(SUB + 0x1b, heading);
  b.ram.setU8(a4, desired);
  b.ram.setU8(a4 + 1, active);
  b.ram.setU16(RNG_STATE, state);
  main6Step2A51EA(b.ram, ROM, b.ctx, a4);
  return b;
}

test('W579 pins the raw id-6 pair, all span hashes, id-7 boundary, and branch tail',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A0.table + 48), ROM.u32(HIBACHI_A0.table + 52),
      ROM.u32(HIBACHI_A0.table + 56),
      HIBACHI_A0.s6Init, HIBACHI_A0.s6Step, HIBACHI_A0.s6End,
    ], [0x2a51d2, 0x2a51ea, 0x2a524e, 0x2a51d2, 0x2a51ea, 0x2a524e]);
    assert.equal(HIBACHI_A0.s6Step - HIBACHI_A0.s6Init, 0x18);
    assert.equal(HIBACHI_A0.s6End - HIBACHI_A0.s6Step, 0x64);
    assert.deepEqual([
      binaryHash(IMG.subarray(HIBACHI_A0.s6Init, HIBACHI_A0.s6Step)),
      binaryHash(IMG.subarray(HIBACHI_A0.s6Step, HIBACHI_A0.s6End)),
      binaryHash(IMG.subarray(HIBACHI_A0.s6Init, HIBACHI_A0.s6End)),
    ], [
      '2d33576d369bb1f343bcf403a26ec585183454d33df5d15d2384b39e3a91d5ef',
      '3325857147ba9fbf0a5ac3fd30a3cf1ffaf1ede5bb1a2efd00b5038f4fe387a0',
      'f7a71d57578448e11074da0d398e476d85bc5b064a4baf34c1f923047ed8a66d',
    ]);
    assert.equal(IMG.readUInt16BE(HIBACHI_A0.s6End), 0x7000,
      'A0 id 7 starts at the exclusive end');
    assert.equal(IMG.readUInt16BE(0x2a524a), 0x6000);
    assert.equal(0x2a524c + IMG.readInt16BE(0x2a524c), 0x2a4eb6);
    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A0.s6Init));
    assert.ok(registered.has(HIBACHI_A0.s6Step));
  });

test('W579 adds no ROM window and preserves the exact table identity',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 851);
    assert.equal(ROM_OVERLAP_PAIRS, 77);
    assert.equal(TABLE_JSON.rom.windows.length, 851);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 452689);
    let overlaps = 0;
    for (let i = 0; i < TABLE_JSON.rom.windows.length; i++) {
      const a = TABLE_JSON.rom.windows[i];
      const aBase = Number.parseInt(String(a.base).replace('$', ''), 16);
      for (let j = i + 1; j < TABLE_JSON.rom.windows.length; j++) {
        const b = TABLE_JSON.rom.windows[j];
        const bBase = Number.parseInt(String(b.base).replace('$', ''), 16);
        if (aBase < bBase + b.len && bBase < aBase + a.len) overlaps++;
      }
    }
    assert.equal(overlaps, 77);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((w) => w.why.startsWith('W579:')), []);
  });

test('W579 init falls through, consumes two draws, and moves at speed six',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.seqDst;
    b.ram.setU32(SUB + 0x02, 0x50001000);
    b.ram.setU16(RNG_STATE, 0);
    b.ram.setU8(a4, 0xff);
    b.ram.setU8(a4 + 1, 0xff);
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 6);

    const seeded = IMG.readUInt8(0x242e42 + 1);
    const vector = MT.vector(6, seeded & 0x3f);
    const target = (IMG.readUInt8(0x242bac + 2) + 0x10) & 0x3f;
    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s6Init]);
    assert.deepEqual([
      b.ram.u8(SUB + 0x1a), b.ram.u8(SUB + 0x1b), b.ram.u16(RNG_STATE),
      b.ram.u16(SUB + 0x02), b.ram.u16(SUB + 0x04),
      b.ram.u8(a4), b.ram.u8(a4 + 1),
    ], [6, seeded, 2, u16(0x5000 + vector.dy), u16(0x1000 + vector.dx), target, 1]);
    assert.equal(attached(b.ram, 0x180), b.ram.u32(SUB + 0x02));
  });

test('W579 moves before slew and clears active only when the target is reached',
  { skip: SKIP }, () => {
    const moving = bench();
    const a4 = SCHED.seqDst;
    moving.ram.setU32(SUB + 0x02, 0x40001400);
    moving.ram.setU8(SUB + 0x1a, 6);
    moving.ram.setU8(SUB + 0x1b, 7);
    moving.ram.setU8(a4, 8);
    moving.ram.setU8(a4 + 1, 1);
    const vector = MT.vector(6, 7);
    main6Step2A51EA(moving.ram, ROM, moving.ctx, a4);
    assert.deepEqual([
      moving.ram.u16(SUB + 0x02), moving.ram.u16(SUB + 0x04), moving.ram.u8(SUB + 0x1b),
    ], [u16(0x4000 + vector.dy), u16(0x1400 + vector.dx), 8]);

    const reached = classify({ x: 0x1c00, y: 0x5400, desired: 0, active: 1, heading: 1 });
    assert.deepEqual([
      reached.ram.u8(SUB + 0x1b), reached.ram.u8(a4),
      reached.ram.u8(a4 + 1), reached.ram.u16(RNG_STATE),
    ], [0, 0, 0, 1]);
    const half = classify({ x: 0x1c00, y: 0x5400, desired: 0x20, active: 7, heading: 0 });
    assert.deepEqual([
      half.ram.u8(SUB + 0x1b), half.ram.u8(a4), half.ram.u8(a4 + 1),
    ], [0x3f, 0x20, 7]);
  });

test('W579 pins every unsigned X and Y boundary, suppression, and byte RNG wrap',
  { skip: SKIP }, () => {
    const draw = IMG.readUInt8(0x242bac + 1);
    const cases = [
      [0x17ff, 0x0000, 0x10], [0x1800, 0x53ff, 0x00],
      [0x1fff, 0x53ff, 0x00], [0x2000, 0x0000, 0x30],
      [0xd7ff, 0x0000, 0x30], [0xd800, 0x0000, 0x10],
      [0x1c00, 0x53ff, 0x00], [0x1c00, 0x5c00, 0x20],
      [0x1c00, 0xffff, 0x20],
    ];
    for (const [x, y, bias] of cases) {
      const b = classify({ x, y });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [((draw + bias) & 0xff) & 0x3f, 1, 1],
      `classifier mismatch at X $${x.toString(16)} Y $${y.toString(16)}`);
    }
    for (const y of [0x5400, 0x5bff]) {
      const b = classify({ x: 0x1c00, y, desired: 0x2a, active: 0 });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [0x2a, 0, 1], 'suppression consumes the draw but preserves both target bytes');
    }
    const wrap = classify({ x: 0x17ff, y: 0, state: 0x00ff });
    assert.deepEqual([
      wrap.ram.u16(RNG_STATE), wrap.ram.u8(SCHED.seqDst),
    ], [0, (IMG.readUInt8(0x242bac) + 0x10) & 0x3f]);
  });

test('W579 freeze blocks only movement while all ten attachments refresh',
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

test('W579 persists without retirement, sound, bullets, or scheduler transition',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.seqDst;
    b.ram.setU32(SUB + 0x02, 0x50001800);
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 6);
    runScheduler25962E(b.ram, ROM, b.ctx);
    const p1 = Array.from(b.ram.b.slice(RAM.player1, RAM.player1 + 0x62));
    const p2 = Array.from(b.ram.b.slice(RAM.player2, RAM.player2 + 0x62));
    const objects = Array.from(b.ram.b.slice(RAM.objTable, RAM.objTableEnd));
    const bullets = Array.from(b.ram.b.slice(0x817f8c, 0x81b40c));
    for (let i = 0; i < 200; i++) runScheduler25962E(b.ram, ROM, b.ctx);
    assert.deepEqual([
      b.ram.u16(SCHED.seqCursor), b.ram.u16(SCHED.seqRestart),
      b.ram.u16(SCHED.seqPending), b.sounds.length,
    ], [6, 0, 6, 0]);
    assert.deepEqual(Array.from(b.ram.b.slice(RAM.player1, RAM.player1 + 0x62)), p1);
    assert.deepEqual(Array.from(b.ram.b.slice(RAM.player2, RAM.player2 + 0x62)), p2);
    assert.deepEqual(Array.from(b.ram.b.slice(RAM.objTable, RAM.objTableEnd)), objects);
    assert.deepEqual(Array.from(b.ram.b.slice(0x817f8c, 0x81b40c)), bullets);
    assert.notEqual(b.ram.u16(a4), 0);
  });

test('W579 restores exact lf149131 and reaches the exact W584 A0 id-9 frontier',
  { skip: SKIP_CHECKPOINT }, async () => {
    const assets = await bundle();
    assert.equal(canonicalHash(assets.tables), LIVE_TABLE_HASH);
    assert.deepEqual(assets.tables, TABLE_JSON);

    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.deepEqual([
      checkpoint.tablesSha256, checkpoint.frame.logic, checkpoint.frame.video,
      checkpoint.raw.stage, checkpoint.raw.stageX2, checkpoint.raw.stageX4, checkpoint.raw.loop,
      checkpoint.ramSha256, checkpoint.gameSha256,
      checkpoint.selection.ship, checkpoint.selection.style,
      checkpoint.inputWord, checkpoint.probeOnly.invulnerable,
    ], [
      TABLE_HASH, 149131, 159744, 4, 8, 16, 1,
      '7d623105d9054771b76378fb62051785a08587205333daffaa155958535f9386',
      '8f62e99da81abae4193aaeddddd4487124ba7d893836b106c1323a2f5b30e4d1',
      0, 4, 65499, true,
    ]);
    const currentCheckpoint = { ...checkpoint, tablesSha256: LIVE_TABLE_HASH };
    assert.deepEqual({ ...currentCheckpoint, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
      'W584 compatibility changes only the proven additive table identity');
    const resumed = restoreCheckpoint(currentCheckpoint, assets, { ship: 0, style: 4 });
    const restored = checkpointDocument(resumed.game, assets, {
      ...checkpoint.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    });
    assert.deepEqual([
      resumed.game.logicFrame, resumed.game.videoFrame,
      restored.ramSha256, restored.gameSha256,
    ], [149131, 159744, checkpoint.ramSha256, checkpoint.gameSha256]);

    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 2100; attempted++) {
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
    const a5 = Array.from({ length: ENEMY.slots }, (_, index) =>
      ENEMY.table + index * ENEMY.stride).find((record) =>
      resumed.game.ram.u32(record + 0x4c) === 0x2a4606);
    const a6 = resumed.game.ram.u32(a5 + 0x06);
    assert.deepEqual([
      attempted, resumed.game.logicFrame, resumed.game.videoFrame, error?.romAddress,
      state.raw.stage, state.raw.stageX2, state.raw.stageX4, state.raw.loop,
      a5, a6, resumed.game.ram.u8(a6 + 0x1a), resumed.game.ram.u8(a6 + 0x1b),
      resumed.game.ram.u16(RNG_STATE),
    ], [
      1975, 151105, 161743, 0x2a5338, 4, 8, 16, 1,
      0x81378c, 0x81533c, 6, 0x09, 0x00bf,
    ]);
    assert.match(error?.message ?? '', /boss SCRIPT at \$2A5338/);
    assert.deepEqual([
      resumed.game.ram.u16(SCHED.seqCursor), resumed.game.ram.u16(SCHED.seqSub),
      resumed.game.ram.u16(SCHED.seqPending), resumed.game.ram.u16(SCHED.seqRestart),
    ], [9, 0, 9, 0]);
    assert.deepEqual(Array.from({ length: SCHED.a4Slots }, (_, index) =>
      resumed.game.ram.u16(SCHED.a4Base + index * SCHED.a4Stride)),
    [0, 0x8111, 0, 0, 0]);
    assert.deepEqual(Array.from({ length: SCHED.a1Slots }, (_, index) =>
      resumed.game.ram.u16(SCHED.a1Base + index * SCHED.a1Stride)),
    Array(SCHED.a1Slots).fill(0));
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      '69e51e37e3e90c00f30d8e15990f318b366b802a9b9e0aa229e34663d7053b53',
      '5c4bf88fe422542636a99de6b4801bc63c196020ba7a14dba63a0f2fe74089d6',
    ]);
  });
