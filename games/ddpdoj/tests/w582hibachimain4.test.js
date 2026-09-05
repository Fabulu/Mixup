// W582: canonical Hibachi A0 main script 4 and the exact A3 id-6 frontier.

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
  HIBACHI_A0, main4Init2A50E4, main4Step2A50F2,
} from '../src/hibachiend.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, tableBeforeW588,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00150131.json');
const required = [TABLES, IMAGE];
const SKIP = required.every(existsSync) ? false
  : 'exact W582 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [CHECKPOINT,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W582 assets or checkpoint absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W587_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const LIVE_TABLE_HASH = '16c1c946669d2565b0a45224618036449cdfa2614508cc44c21097f8e522f5f5';
const W587_TABLE_HASH = 'ba6dfc5a6d50f7f5303452fa8341c6139fe99d4cc6a944e23182144a9c7a8741';
const STORED_W587_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const REC = 0x810c00;
const SUB = 0x814800;
const RNG_STATE = 0x803916;
const FREEZE = 0x8130d2;
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (from, to) => Array.from(IMG.subarray(from, to));

function bench(tables = MT) {
  const ram = new Ram();
  const sounds = [];
  ram.setU32(REC + 0x06, SUB);
  return {
    ram, sounds,
    ctx: {
      bossRec: REC, bossSubRec: SUB, tables,
      soundPost: (site) => sounds.push(site),
    },
  };
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

const slotWords = (ram, base, count, stride) => Array.from({ length: count },
  (_, index) => ram.u16(base + index * stride));
const snapshot = (ram, from, to) => Array.from({ length: to - from },
  (_, index) => ram.u8(from + index));
const fillRam = (ram, from, to, value) => {
  for (let address = from; address < to; address++) ram.setU8(address, value);
};
const attached = (ram, part) => ram.u32(SUB + part + 0x02);
const OFFSET_PARTS = Object.freeze([
  [0x020, 0x14c0, 0xf180], [0x040, 0xfb00, 0xee40],
  [0x060, 0xe880, 0xeec0], [0x080, 0x0740, 0x1040],
  [0x0a0, 0xf780, 0x14c0], [0x0c0, 0xe540, 0x1040],
]);
const ROOT_PARTS = Object.freeze([0x1a0, 0x140, 0x160, 0x180]);

function assertAttachments(ram, y, x) {
  for (const [part, dy, dx] of OFFSET_PARTS) {
    assert.deepEqual([
      ram.u16(SUB + part + 0x02), ram.u16(SUB + part + 0x04),
    ], [u16(y + dy), u16(x + dx)]);
  }
  const root = ((y << 16) | x) >>> 0;
  for (const part of ROOT_PARTS) assert.equal(attached(ram, part), root);
}

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
  main4Step2A50F2(b.ram, ROM, b.ctx, a4);
  return b;
}

test('W582 pins the exact raw id-4, registration, and unchanged table contract',
  { skip: SKIP }, () => {
    assert.deepEqual(bytes(HIBACHI_A0.s4Row, HIBACHI_A0.s4Row + 8),
      [0x00, 0x2a, 0x50, 0xe4, 0x00, 0x2a, 0x50, 0xf2]);
    assert.deepEqual(bytes(HIBACHI_A0.s4Init, HIBACHI_A0.s4Step),
      [0x70, 0x00, 0x18, 0x80, 0x19, 0x40, 0x00, 0x01,
        0x1d, 0x7c, 0x00, 0x06, 0x00, 0x1a]);
    assert.deepEqual([
      binaryHash(IMG.subarray(HIBACHI_A0.s4Row, HIBACHI_A0.s4Row + 8)),
      binaryHash(IMG.subarray(HIBACHI_A0.s4Init, HIBACHI_A0.s4Step)),
      binaryHash(IMG.subarray(HIBACHI_A0.s4Step, HIBACHI_A0.s4End)),
      binaryHash(IMG.subarray(HIBACHI_A0.s4Init, HIBACHI_A0.s4End)),
    ], [
      '043aa3721ecc33e7c5748d9211a4e808c5f90d6ce6e2a20f98a8de97b0b02e62',
      '93943df801d92495c0f66bb3feba25db85626bd3c84723581d81efdeea85d9da',
      'c9ce0ab459a71f04949043e38ee4f319e7793f409fe817126e28f3c45f86dddc',
      'ca682f80119fa3935aa3f0590aea19933ec768a010217dc28053026e17bd2e85',
    ]);
    assert.deepEqual([
      HIBACHI_A0.s4Row, ROM.u32(HIBACHI_A0.s4Row), ROM.u32(HIBACHI_A0.s4Row + 4),
      HIBACHI_A0.s4Init, HIBACHI_A0.s4Step, HIBACHI_A0.s4End,
      HIBACHI_A0.s4Step - HIBACHI_A0.s4Init,
      HIBACHI_A0.s4End - HIBACHI_A0.s4Step,
      main4Init2A50E4.length, main4Step2A50F2.length,
    ], [
      0x2a4e76, 0x2a50e4, 0x2a50f2, 0x2a50e4, 0x2a50f2, 0x2a5156,
      0x0e, 0x64, 3, 4,
    ]);
    assert.equal(ROM.u32(HIBACHI_A0.s4Row + 8), HIBACHI_A0.s5Init,
      'the next row begins with the id-5 init at the exclusive end');
    assert.equal(IMG.readUInt16BE(HIBACHI_A0.s4End), 0x7000,
      'id-5 init starts at the exclusive end');
    assert.equal(IMG.readUInt16BE(0x2a5152), 0x6000);
    assert.equal(0x2a5154 + IMG.readInt16BE(0x2a5154), 0x2a4eb6);

    const registered = scriptAddresses();
    assert.equal(registered.filter((address) => address === HIBACHI_A0.s4Init).length, 1);
    assert.equal(registered.filter((address) => address === HIBACHI_A0.s4Step).length, 1);
    assert.equal(ROM_WINDOW_COUNT, 1706);
    assert.equal(ROM_OVERLAP_PAIRS, 79);
    assert.equal(TABLE_JSON.rom.windows.length, 1706);
    assert.equal(TABLE_JSON.rom.windows.reduce((total, window) => total + window.len, 0), 652639);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((window) => window.why.startsWith('W582:')), []);
  });

test('W582 init falls through, moves first, slews literally, and draws exactly once',
  { skip: SKIP }, () => {
    const direct = bench();
    const a4 = SCHED.seqDst;
    direct.ram.setU8(a4, 0xaa);
    direct.ram.setU8(a4 + 1, 0xbb);
    direct.ram.setU8(a4 + 2, 0xcc);
    direct.ram.setU8(SUB + 0x1a, 0x7d);
    direct.ram.setU8(SUB + 0x1b, 0xe5);
    direct.ram.setU16(RNG_STATE, 0x1234);
    main4Init2A50E4(direct.ram, direct.ctx, a4);
    assert.deepEqual([
      direct.ram.u8(a4), direct.ram.u8(a4 + 1), direct.ram.u8(a4 + 2),
      direct.ram.u8(SUB + 0x1a), direct.ram.u8(SUB + 0x1b),
      direct.ram.u16(RNG_STATE),
    ], [0, 0, 0xcc, 6, 0xe5, 0x1234]);

    const calls = [];
    const tables = {
      vector: (speed, heading) => {
        calls.push([speed, heading]);
        return MT.vector(speed, heading);
      },
    };
    const b = bench(tables);
    b.ram.setU32(SUB + 0x02, 0x4a6020d8);
    b.ram.setU8(SUB + 0x1a, 0xee);
    b.ram.setU8(SUB + 0x1b, 0x20);
    b.ram.setU16(RNG_STATE, 0x00b8);
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 4);
    fillRam(b.ram, SCHED.seqSrc, SCHED.seqSrc + 0x20, 0xcc);
    const vector = MT.vector(6, 0x20);
    const firstTarget = IMG.readUInt8(0x242bac + 0x00b9) & 0x3f;

    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s4Init]);
    assert.deepEqual(calls, [[6, 0x20]]);
    assert.deepEqual([
      b.ram.u16(SUB + 0x02), b.ram.u16(SUB + 0x04),
      b.ram.u8(SUB + 0x1a), b.ram.u8(SUB + 0x1b), b.ram.u16(RNG_STATE),
      b.ram.u8(a4), b.ram.u8(a4 + 1),
    ], [u16(0x4a60 + vector.dy), u16(0x20d8 + vector.dx),
      6, 0x20, 0x00b9, firstTarget, 1]);
    assert.deepEqual(snapshot(b.ram, a4 + 2, a4 + 0x20), Array(0x1e).fill(0xcc));
    assertAttachments(b.ram, u16(0x4a60 + vector.dy), u16(0x20d8 + vector.dx));

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s4Init, HIBACHI_A0.s4Step]);
    assert.deepEqual(calls, [[6, 0x20], [6, 0x20]],
      'the second movement uses the heading from before its slew');
    assert.equal(b.ram.u16(RNG_STATE), 0x00ba);
    assert.equal(b.ram.u8(SUB + 0x1b), 0x1f);

    const reached = classify({
      x: 0x1000, y: 0x5f00, desired: 8, active: 1, heading: 7,
    });
    assert.deepEqual([
      reached.ram.u8(SUB + 0x1b), reached.ram.u8(a4),
      reached.ram.u8(a4 + 1), reached.ram.u16(RNG_STATE),
    ], [8, 8, 0, 1]);
    const literal = classify({
      x: 0x1000, y: 0x5f00, desired: 0x40, active: 7, heading: 1,
    });
    assert.deepEqual([
      literal.ram.u8(SUB + 0x1b), literal.ram.u8(a4), literal.ram.u8(a4 + 1),
    ], [0, 0x40, 7], 'masked heading zero is not literal target byte $40');

    const wrappedRng = classify({
      x: 0x1000, y: 0x5f00, desired: 0x2a, active: 0, state: 0x00ff,
    });
    assert.deepEqual([
      wrappedRng.ram.u8(a4), wrappedRng.ram.u8(a4 + 1),
      wrappedRng.ram.u16(RNG_STATE),
    ], [0x2a, 0, 0x0000], 'the draw increments only the RNG state low byte');

    const wrappedMove = bench();
    wrappedMove.ram.setU32(SUB + 0x02, 0x0010ffff);
    wrappedMove.ram.setU8(SUB + 0x1a, 6);
    wrappedMove.ram.setU8(SUB + 0x1b, 0x20);
    main4Step2A50F2(wrappedMove.ram, ROM, wrappedMove.ctx, a4);
    assert.deepEqual([
      wrappedMove.ram.u16(SUB + 0x02), wrappedMove.ram.u16(SUB + 0x04),
    ], [u16(0x0010 + vector.dy), u16(0xffff + vector.dx)]);
  });

test('W582 pins wrapped unsigned classifier boundaries, suppression, and attachments',
  { skip: SKIP }, () => {
    const draw = IMG.readUInt8(0x242bac + 1);
    const cases = [
      [0x0dff, 0x0000, 0x10], [0x0e00, 0x5dff, 0x00],
      [0x29ff, 0x5dff, 0x00], [0x2a00, 0x0000, 0x30],
      [0xd7ff, 0x0000, 0x30], [0xd800, 0x0000, 0x10],
      [0x1c00, 0x5dff, 0x00], [0x1c00, 0x6200, 0x20],
      [0x1c00, 0xffff, 0x20],
    ];
    for (const [x, y, bias] of cases) {
      const b = classify({ x, y });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [((draw + bias) & 0xff) & 0x3f, 1, 1],
      `classifier mismatch at X $${x.toString(16)} Y $${y.toString(16)}`);
      assertAttachments(b.ram, y, x);
    }
    for (const y of [0x5e00, 0x61ff]) {
      const b = classify({ x: 0x1c00, y, desired: 0x2a, active: 0 });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [0x2a, 0, 1], 'suppression consumes the draw but preserves both target bytes');
      assertAttachments(b.ram, y, 0x1c00);
    }
    const wrap = classify({ x: 0x2a00, y: 0, state: 0x0004 });
    assert.deepEqual([
      IMG.readUInt8(0x242bac + 5), wrap.ram.u16(RNG_STATE), wrap.ram.u8(SCHED.seqDst),
    ], [0xfd, 5, 0x2d], 'bias addition wraps byte-wide before the $3F mask');
  });

test('W582 freeze blocks only movement and persistence has no unrelated side effects',
  { skip: SKIP }, () => {
    const frozen = classify({
      x: 0xf900, y: 0xf400, desired: 0x12, active: 1, heading: 0x11,
    });
    assert.equal(frozen.ram.u32(SUB + 0x02), 0xf400f900);
    assert.equal(frozen.ram.u8(SUB + 0x1b), 0x12);
    assert.equal(frozen.ram.u16(RNG_STATE), 1);
    assertAttachments(frozen.ram, 0xf400, 0xf900);
    assert.deepEqual(frozen.sounds, []);

    const b = bench();
    const a4 = SCHED.seqDst;
    b.ram.setU16(REC, 0x1357);
    b.ram.setU32(SUB + 0x02, 0x50001800);
    b.ram.setU8(SUB + 0x1b, 0x20);
    const p1 = snapshot(b.ram, RAM.player1, RAM.player1 + 0x62);
    const p2 = snapshot(b.ram, RAM.player2, RAM.player2 + 0x62);
    const objects = snapshot(b.ram, RAM.objTable, RAM.objTableEnd);
    const bullets = snapshot(b.ram, 0x817f8c, 0x81b40c);

    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 4);
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    for (let index = 0; index < 200; index++) {
      assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    }

    assert.deepEqual([
      b.ram.u16(REC), b.ram.u8(SUB + 0x1a), b.ram.u16(RNG_STATE),
      b.ram.u16(SCHED.seqCursor), b.ram.u16(SCHED.seqSub),
      b.ram.u16(SCHED.seqPending), b.ram.u16(SCHED.seqRestart), b.sounds.length,
    ], [0x1357, 6, 0x00c9, 4, 4, 4, 0, 0]);
    assert.equal(b.ram.u8(a4) <= 0x3f, true);
    assert.equal(b.ram.u8(a4 + 1) <= 1, true);
    assert.deepEqual(snapshot(b.ram, RAM.player1, RAM.player1 + 0x62), p1);
    assert.deepEqual(snapshot(b.ram, RAM.player2, RAM.player2 + 0x62), p2);
    assert.deepEqual(snapshot(b.ram, RAM.objTable, RAM.objTableEnd), objects);
    assert.deepEqual(snapshot(b.ram, 0x817f8c, 0x81b40c), bullets);
    assert.deepEqual(slotWords(b.ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride),
      Array(SCHED.a4Slots).fill(0));
    assert.deepEqual(slotWords(b.ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride),
      Array(SCHED.a3Slots).fill(0));
    assert.deepEqual(slotWords(b.ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride),
      Array(SCHED.a1Slots).fill(0));
  });

test('W582 restores exact lf150131 and reaches the exact W587 $291040 frontier',
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
      checkpoint.selection.ship, checkpoint.selection.style,
      checkpoint.inputWord, checkpoint.probeOnly.invulnerable,
    ], [
      STORED_W587_TABLE_HASH, 150131, 160744, 4, 8, 16, 1,
      '1003233dd2baeb59bb1af2208f56cd62bfdaf4752458c0d7769ca55429829a07',
      '7f9e1c02322b112168d630483e8c2d6d43ca1d70d4c691886ee036c8a7437f88',
      0, 4, 65499, true,
    ]);
    const adoptedCheckpoint = { ...checkpoint, tablesSha256: W587_TABLE_HASH };
    assert.deepEqual({ ...adoptedCheckpoint, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
      'W623 adoption changes only the stored checkpoint table identity');
    const resumed = restoreCheckpoint(adoptedCheckpoint, assets, { ship: 0, style: 4 });
    const restored = checkpointDocument(resumed.game, assets, {
      ...checkpoint.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    });
    assert.deepEqual([
      resumed.game.logicFrame, resumed.game.videoFrame,
      restored.ramSha256, restored.gameSha256,
    ], [150131, 160744, checkpoint.ramSha256, checkpoint.gameSha256]);

    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 3900; attempted++) {
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
      a5, a6, resumed.game.ram.u16(a6 + 0x02), resumed.game.ram.u16(a6 + 0x04),
      resumed.game.ram.u8(a6 + 0x1a), resumed.game.ram.u8(a6 + 0x1b),
      resumed.game.ram.u16(RNG_STATE),
    ], [
      3667, 153797, 164459, 0x291040, 4, 8, 16, 1,
      0x81378c, 0x81533c, 0x5418, 0x19ac, 2, 0x1b, 0x00fb,
    ]);
    assert.match(error?.message ?? '', /word at \$291040 is outside every ROM window/);
    assert.deepEqual([
      resumed.game.ram.u16(SCHED.seqCursor), resumed.game.ram.u16(SCHED.seqSub),
      resumed.game.ram.u16(SCHED.seqPending), resumed.game.ram.u16(SCHED.seqRestart),
    ], [8, 4, 8, 0]);
    assert.deepEqual(slotWords(resumed.game.ram,
      SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride), Array(SCHED.a4Slots).fill(0));
    assert.deepEqual(slotWords(resumed.game.ram,
      SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride), Array(SCHED.a1Slots).fill(0));
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      '7c8e4f3ae55f00a473926624977d95a04734ccd5866e4d5c95a2a0b7ba9c3663',
      'a65ac16f7a925430faa57965b6423c042f622224bc051f04354d9b3c58c1c582',
    ]);
  });
