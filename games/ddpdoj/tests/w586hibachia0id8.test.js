// W586: canonical Hibachi A0 main script 8 and the next exact frontier.

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
  HIBACHI_A0, main8Init2A52C6, main8Step2A52D4,
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
const PERIODIC_CHECKPOINTS = Object.freeze([
  here('../probes/checkpoints/ship0-style4-lf00151131.json'),
  here('../probes/checkpoints/ship0-style4-lf00151631.json'),
]);
const required = [TABLES, IMAGE];
const SKIP = required.every(existsSync) ? false
  : 'exact W586 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [...PERIODIC_CHECKPOINTS,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W586 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W584_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(W584_TABLE.rom);
const MT = SKIP ? null : new MoveTables(W584_TABLE, ROM);
const LIVE_TABLE_HASH = 'af3dee2f75818bcbb32d5c024b50b0816837d319595bb71eaade5d136fcd2a69';
const TABLE_HASH = 'ba6dfc5a6d50f7f5303452fa8341c6139fe99d4cc6a944e23182144a9c7a8741';
const STORED_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const REC = 0x810c00;
const SUB = 0x814800;
const RNG_STATE = 0x803916;
const FREEZE = 0x8130d2;
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');

const OFFSET_PARTS = Object.freeze([
  [0x020, 0x14c0, 0xf180], [0x040, 0xfb00, 0xee40],
  [0x060, 0xe880, 0xeec0], [0x080, 0x0740, 0x1040],
  [0x0a0, 0xf780, 0x14c0], [0x0c0, 0xe540, 0x1040],
]);
const ROOT_PARTS = Object.freeze([0x1a0, 0x140, 0x160, 0x180]);

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
  main8Step2A52D4(b.ram, ROM, b.ctx, a4);
  return b;
}

function maskRange(bytes, address, length) {
  bytes.fill(0, address - 0x800000, address - 0x800000 + length);
}

test('W586 pins the raw id-8 row, code hashes, id-9 boundary, and registration',
  { skip: SKIP }, () => {
    assert.deepEqual([
      HIBACHI_A0.s8Row, ROM.u32(HIBACHI_A0.s8Row), ROM.u32(HIBACHI_A0.s8Row + 4),
      ROM.u32(HIBACHI_A0.s8Row + 8),
      HIBACHI_A0.s8Init, HIBACHI_A0.s8Step, HIBACHI_A0.s8End,
    ], [
      0x2a4e96, 0x2a52c6, 0x2a52d4, 0x2a5338,
      0x2a52c6, 0x2a52d4, 0x2a5338,
    ]);
    assert.deepEqual([
      binaryHash(IMG.subarray(HIBACHI_A0.s8Row, HIBACHI_A0.s8Row + 8)),
      binaryHash(IMG.subarray(HIBACHI_A0.s8Init, HIBACHI_A0.s8Step)),
      binaryHash(IMG.subarray(HIBACHI_A0.s8Step, HIBACHI_A0.s8End)),
      binaryHash(IMG.subarray(HIBACHI_A0.s8Init, HIBACHI_A0.s8End)),
    ], [
      '3c6ef7baaf58164dcccaa7fd896ab917a3f103228b0173002cc74ed60b07ee08',
      '44aac3a9ee32ba5cf2e4e29957d5cfb36a87df04c8bcfa8cea4bb9419c9a8dc2',
      'b718cbb158442614fae8b29d27ba1ef4a7a247c8144c72a8c48bab2a1bf76d77',
      '3e7846852d3ee610ffd32ed0db480f67eb50c32e567ca2f73b50744cb8b14982',
    ]);
    assert.equal(HIBACHI_A0.s8Step - HIBACHI_A0.s8Init, 0x0e);
    assert.equal(HIBACHI_A0.s8End - HIBACHI_A0.s8Step, 0x64);
    assert.equal(IMG.readUInt16BE(0x2a5334), 0x6000);
    assert.equal(0x2a5336 + IMG.readInt16BE(0x2a5336), 0x2a4eb6);
    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A0.s8Init));
    assert.ok(registered.has(HIBACHI_A0.s8Step));
  });

test('W586 adds no ROM window and W588 preserves the exact W584 table identity',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 1653);
    assert.equal(ROM_OVERLAP_PAIRS, 79);
    assert.equal(TABLE_JSON.rom.windows.length, 1653);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 642930);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.deepEqual([
      W584_TABLE.rom.windows.length,
      W584_TABLE.rom.windows.reduce((n, w) => n + w.len, 0),
      canonicalHash(W584_TABLE),
    ], [852, 452697, TABLE_HASH]);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((w) => w.why.startsWith('W586:')), []);
  });

test('W586 init forces speed two and registered fallthrough moves at inherited heading',
  { skip: SKIP }, () => {
    const direct = bench();
    const a4 = SCHED.seqDst;
    direct.ram.setU8(a4, 0xaa);
    direct.ram.setU8(a4 + 1, 0xbb);
    direct.ram.setU8(SUB + 0x1a, 6);
    direct.ram.setU8(SUB + 0x1b, 7);
    direct.ram.setU16(RNG_STATE, 0x3456);
    main8Init2A52C6(direct.ram, direct.ctx, a4);
    assert.deepEqual([
      direct.ram.u8(a4), direct.ram.u8(a4 + 1), direct.ram.u8(SUB + 0x1a),
      direct.ram.u8(SUB + 0x1b), direct.ram.u16(RNG_STATE),
    ], [0, 0, 2, 7, 0x3456]);

    const b = bench();
    b.ram.setU32(SUB + 0x02, 0x50001000);
    b.ram.setU8(SUB + 0x1a, 6);
    b.ram.setU8(SUB + 0x1b, 7);
    b.ram.setU8(a4, 0xaa);
    b.ram.setU8(a4 + 1, 0xbb);
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 8);
    const vector = MT.vector(2, 7);
    const draw = IMG.readUInt8(0x242bac + 1);
    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s8Init]);
    assert.deepEqual([
      b.ram.u16(SUB + 0x02), b.ram.u16(SUB + 0x04),
      b.ram.u8(SUB + 0x1a), b.ram.u8(SUB + 0x1b), b.ram.u16(RNG_STATE),
      b.ram.u8(a4), b.ram.u8(a4 + 1),
    ], [
      u16(0x5000 + vector.dy), u16(0x1000 + vector.dx),
      2, 7, 1, (draw + 0x10) & 0x3f, 1,
    ]);
  });

test('W586 moves before slew and pins every unsigned classifier boundary',
  { skip: SKIP }, () => {
    const moving = bench();
    const a4 = SCHED.seqDst;
    moving.ram.setU32(SUB + 0x02, 0x50001000);
    moving.ram.setU8(SUB + 0x1a, 6);
    moving.ram.setU8(SUB + 0x1b, 7);
    moving.ram.setU8(a4, 8);
    moving.ram.setU8(a4 + 1, 1);
    const vector = MT.vector(6, 7);
    main8Step2A52D4(moving.ram, ROM, moving.ctx, a4);
    assert.deepEqual([
      moving.ram.u16(SUB + 0x02), moving.ram.u16(SUB + 0x04),
      moving.ram.u8(SUB + 0x1b),
    ], [u16(0x5000 + vector.dy), u16(0x1000 + vector.dx), 8]);

    const inactive = classify({ x: 0x1c00, y: 0x5200, desired: 10, active: 0, heading: 7 });
    const arrived = classify({ x: 0x1c00, y: 0x5200, desired: 8, active: 1, heading: 7 });
    const partial = classify({ x: 0x1c00, y: 0x5200, desired: 10, active: 1, heading: 7 });
    assert.deepEqual([
      inactive.ram.u8(SUB + 0x1b), inactive.ram.u8(a4 + 1),
      arrived.ram.u8(SUB + 0x1b), arrived.ram.u8(a4 + 1),
      partial.ram.u8(SUB + 0x1b), partial.ram.u8(a4 + 1),
    ], [7, 0, 8, 0, 8, 1]);

    const draw = IMG.readUInt8(0x242bac + 1);
    const cases = [
      [0x17ff, 0x0000, 0x10], [0x1800, 0x51ff, 0x00],
      [0x1fff, 0x51ff, 0x00], [0x2000, 0x0000, 0x30],
      [0xd7ff, 0x0000, 0x30], [0xd800, 0x0000, 0x10],
      [0x1c00, 0x51ff, 0x00], [0x1c00, 0x5600, 0x20],
      [0x1c00, 0xffff, 0x20],
    ];
    for (const [x, y, bias] of cases) {
      const b = classify({ x, y });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [((draw + bias) & 0xff) & 0x3f, 1, 1],
      `classifier mismatch at X $${x.toString(16)} Y $${y.toString(16)}`);
    }
    for (const y of [0x5200, 0x55ff]) {
      const b = classify({ x: 0x1c00, y, desired: 0x2a, active: 0 });
      assert.deepEqual([
        b.ram.u8(SCHED.seqDst), b.ram.u8(SCHED.seqDst + 1), b.ram.u16(RNG_STATE),
      ], [0x2a, 0, 1], 'suppression consumes one draw and preserves both target bytes');
    }
    const wrap = classify({ x: 0x17ff, y: 0, state: 0x0004 });
    assert.deepEqual([
      IMG.readUInt8(0x242bac + 5), wrap.ram.u16(RNG_STATE), wrap.ram.u8(SCHED.seqDst),
    ], [0xfd, 5, 0x0d]);
  });

test('W586 refreshes all parts, owns no unrelated RAM, and obeys scheduler gates',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.seqDst;
    b.ram.setU16(FREEZE, 1);
    b.ram.setU32(SUB + 0x02, 0xf400f900);
    b.ram.setU8(SUB + 0x1a, 6);
    b.ram.setU8(SUB + 0x1b, 0x11);
    b.ram.setU16(RNG_STATE, 0);
    const before = Uint8Array.from(b.ram.b);
    main8Step2A52D4(b.ram, ROM, b.ctx, a4);
    const after = Uint8Array.from(b.ram.b);
    for (const bytes of [before, after]) {
      maskRange(bytes, RNG_STATE, 2);
      maskRange(bytes, a4, 2);
      for (const [part] of OFFSET_PARTS) maskRange(bytes, SUB + part + 0x02, 4);
      for (const part of ROOT_PARTS) maskRange(bytes, SUB + part + 0x02, 4);
    }
    assert.deepEqual(after, before);
    for (const [part, dy, dx] of OFFSET_PARTS) {
      assert.deepEqual([
        b.ram.u16(SUB + part + 0x02), b.ram.u16(SUB + part + 0x04),
      ], [u16(0xf400 + dy), u16(0xf900 + dx)]);
    }
    for (const part of ROOT_PARTS) assert.equal(b.ram.u32(SUB + part + 0x02), 0xf400f900);
    assert.deepEqual(b.sounds, []);

    for (const [gate, expectedReturn] of [[SCHED.suspend, true], [SCHED.deathPause, false]]) {
      const gated = bench();
      gated.ram.setU32(SUB + 0x02, 0x50001800);
      gated.ram.setU8(SUB + 0x1a, 6);
      gated.ram.setU8(SUB + 0x1b, 7);
      installScripts(gated.ram, ROM, { a0: HIBACHI_A0.table });
      seqStart2598D0(gated.ram, 8);
      gated.ram.setU16(gate, 1);
      assert.equal(runScheduler25962E(gated.ram, ROM, gated.ctx), expectedReturn);
      assert.deepEqual([
        gated.ram.u16(SCHED.seqDst), gated.ram.u16(SCHED.seqPending),
        gated.ram.u16(RNG_STATE), gated.ram.u32(SUB + 0x02),
      ], [0, 8, 0, 0x50001800]);
    }
  });

test('W586 periodic checkpoints restore exactly and reach the next loud frontier',
  { skip: SKIP_CHECKPOINT }, async () => {
    const loaded = await bundle();
    const assets = { ...loaded, tables: W584_TABLE };
    assert.equal(canonicalHash(assets.tables), TABLE_HASH);
    assert.deepEqual(assets.tables, W584_TABLE);
    const expected = [
      [151131, 161768,
        '91309d06e4b67b8a92de6b4fbdc361d0d38c5d2ce3e84673cc3a2b9798da5909',
        '9b6518cc4d107ce3847ca7f91fb5a5dab42f9018fdf2d993a18961a1d04a65e1',
        'fb2a5d5774f89d15deaef3c5aa8948046be2e5de8c957ecace129a661fb1a994'],
      [151631, 162268,
        '79b1078f95179e6a4ce3289bee1636a9479f197ac552ac3538520aeb77b9bd62',
        '31204f6c3c5028328fd9fde23f9ea01ebbeea2706a60af477f16665fa5534c28',
        '877ec10961450c63b869ce15c9aeb8d760aecc0f094454b529b46230364b61b1'],
    ];
    for (let index = 0; index < PERIODIC_CHECKPOINTS.length; index++) {
      const bytes = readFileSync(PERIODIC_CHECKPOINTS[index]);
      const checkpoint = JSON.parse(bytes);
      const [logic, video, ramSha256, gameSha256, fileSha256] = expected[index];
      assert.deepEqual([
        checkpoint.tablesSha256, checkpoint.frame.logic, checkpoint.frame.video,
        checkpoint.raw.stage, checkpoint.raw.stageX2, checkpoint.raw.stageX4,
        checkpoint.raw.loop, checkpoint.ramSha256, checkpoint.gameSha256,
        checkpoint.selection.ship, checkpoint.selection.style,
        checkpoint.inputWord, checkpoint.probeOnly.invulnerable, binaryHash(bytes),
      ], [
        STORED_TABLE_HASH, logic, video, 4, 8, 16, 1, ramSha256, gameSha256,
        0, 4, 65499, true, fileSha256,
      ]);
      const adoptedCheckpoint = { ...checkpoint, tablesSha256: TABLE_HASH };
      assert.deepEqual({ ...adoptedCheckpoint, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
        'W623 adoption changes only the stored checkpoint table identity');
      const restoredGame = restoreCheckpoint(adoptedCheckpoint, assets, checkpoint.selection);
      const restored = checkpointDocument(restoredGame.game, assets, {
        ...checkpoint.selection, inputWord: restoredGame.probe.inputWord, invulnerable: true,
      });
      assert.deepEqual([
        restoredGame.game.logicFrame, restoredGame.game.videoFrame,
        restored.ramSha256, restored.gameSha256,
      ], [logic, video, ramSha256, gameSha256]);
    }

    const checkpoint = JSON.parse(readFileSync(PERIODIC_CHECKPOINTS[1], 'utf8'));
    assert.equal(checkpoint.tablesSha256, STORED_TABLE_HASH);
    const adoptedCheckpoint = { ...checkpoint, tablesSha256: TABLE_HASH };
    const resumed = restoreCheckpoint(adoptedCheckpoint, assets, checkpoint.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 2400; attempted++) {
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
      a5, a6, resumed.game.ram.u32(a6 + 0x02),
      resumed.game.ram.u8(a6 + 0x1a), resumed.game.ram.u8(a6 + 0x1b),
      resumed.game.ram.u16(a6 + 0x132), resumed.game.ram.u16(a6 + 0x138),
      resumed.game.ram.u16(RNG_STATE), resumed.game.ram.u16(0x80390e),
    ], [
      2167, 153797, 164459, 0x291040, 4, 8, 16, 1,
      0x81378c, 0x81533c, 0x541819ac, 2, 0x1b, 0x0018, 0x0018, 0x00fb, 0,
    ]);
    assert.match(error?.message ?? '', /word at \$291040 is outside every ROM window/);
    assert.deepEqual([
      resumed.game.ram.u16(SCHED.seqCursor), resumed.game.ram.u16(SCHED.seqSub),
      resumed.game.ram.u16(SCHED.seqPending), resumed.game.ram.u16(SCHED.seqRestart),
    ], [8, 4, 8, 0]);
    assert.deepEqual(Array.from({ length: SCHED.a4Slots }, (_, index) =>
      resumed.game.ram.u16(SCHED.a4Base + index * SCHED.a4Stride)),
    Array(SCHED.a4Slots).fill(0));
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      'e37340e127fade24b6bb4b1db8de479c66a8aed883c53a3c5b3bc10d6a45e30b',
      '8630486d00d5484982b6443ceaf2f72b85d22a7794034cdc00127086d304791f',
    ]);
  });
