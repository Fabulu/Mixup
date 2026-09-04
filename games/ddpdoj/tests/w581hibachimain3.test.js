// W581: canonical Hibachi A0 main script 3 and the exact id-4 frontier.

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
  HIBACHI_A0, main3Init2A50D0, main3Step2A50DC,
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
  : 'exact W581 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [CHECKPOINT,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W581 assets or checkpoint absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W587_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const LIVE_TABLE_HASH = 'a262d979e0a369afba14cec7858efdf6932ca4ce7b3f6aab13d433c87f0860cc';
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

test('W581 pins the raw id-3 contract, registration, and unchanged table identity',
  { skip: SKIP }, () => {
    assert.deepEqual(bytes(HIBACHI_A0.s3Row, HIBACHI_A0.s3Row + 8),
      [0x00, 0x2a, 0x50, 0xd0, 0x00, 0x2a, 0x50, 0xdc]);
    assert.deepEqual(bytes(HIBACHI_A0.s3Init, HIBACHI_A0.s3Step),
      [0x1d, 0x7c, 0x00, 0x03, 0x00, 0x1a, 0x1d, 0x7c, 0x00, 0x20, 0x00, 0x1b]);
    assert.deepEqual(bytes(HIBACHI_A0.s3Step, HIBACHI_A0.s3End),
      [0x4e, 0xb9, 0x00, 0x24, 0x17, 0xde, 0x4e, 0x75]);
    assert.deepEqual([
      binaryHash(IMG.subarray(HIBACHI_A0.s3Row, HIBACHI_A0.s3Row + 8)),
      binaryHash(IMG.subarray(HIBACHI_A0.s3Init, HIBACHI_A0.s3Step)),
      binaryHash(IMG.subarray(HIBACHI_A0.s3Step, HIBACHI_A0.s3End)),
      binaryHash(IMG.subarray(HIBACHI_A0.s3Init, HIBACHI_A0.s3End)),
    ], [
      '41c35ed082b91359d7aa3e18c904cd3744307d9cf375a302250f0355f8474568',
      'e83990558c002eeab2e3f44f80a1947f99d75b3d39532c06152ca5bd0f97ae09',
      'ed65dcc99fd66d3d4cab251df49dc5bb10866b0930410610d97ac956b23e4a43',
      'd9675b4c9e555807f121f5341d399c0e281da09aa1ca4b358d6e90323ef4a326',
    ]);
    assert.deepEqual([
      ROM.u32(HIBACHI_A0.s3Row), ROM.u32(HIBACHI_A0.s3Row + 4),
      ROM.u32(HIBACHI_A0.table + 4 * 8),
      HIBACHI_A0.s3Init, HIBACHI_A0.s3Step, HIBACHI_A0.s3End,
      main3Init2A50D0.length, main3Step2A50DC.length,
    ], [0x2a50d0, 0x2a50dc, 0x2a50e4, 0x2a50d0, 0x2a50dc, 0x2a50e4, 2, 2]);
    const registered = scriptAddresses();
    assert.equal(registered.filter((address) => address === HIBACHI_A0.s3Init).length, 1);
    assert.equal(registered.filter((address) => address === HIBACHI_A0.s3Step).length, 1);

    assert.equal(ROM_WINDOW_COUNT, 1686);
    assert.equal(ROM_OVERLAP_PAIRS, 79);
    assert.equal(TABLE_JSON.rom.windows.length, 1686);
    assert.equal(TABLE_JSON.rom.windows.reduce((total, window) => total + window.len, 0), 651517);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((window) => window.why.startsWith('W581:')), []);
  });

test('W581 init falls through and each dispatch applies one exact wrapped velocity',
  { skip: SKIP }, () => {
    assert.deepEqual(MT.vector(3, 0x20), { dy: -0x21, dx: 0 });
    const cases = [
      [0x0010, 0xffff, 0xffef, 0xffff, 0x11],
      [0x0000, 0x1234, 0xffdf, 0x1234, 0xa6],
    ];
    for (const [startY, startX, endY, endX, fill] of cases) {
      const calls = [];
      const tables = {
        vector: (speed, heading) => {
          calls.push([speed, heading]);
          return MT.vector(speed, heading);
        },
      };
      const b = bench(tables);
      b.ram.setU32(SUB + 0x02, ((startY << 16) | startX) >>> 0);
      b.ram.setU16(RNG_STATE, 0x5aa5);
      installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
      seqStart2598D0(b.ram, 3);
      fillRam(b.ram, SCHED.seqSrc, SCHED.seqSrc + 0x20, fill);

      clearDispatched();
      assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
      assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s3Init]);
      assert.deepEqual(calls, [[3, 0x20]]);
      assert.deepEqual([
        b.ram.u8(SUB + 0x1a), b.ram.u8(SUB + 0x1b),
        b.ram.u16(SUB + 0x02), b.ram.u16(SUB + 0x04), b.ram.u16(RNG_STATE),
      ], [3, 0x20, endY, endX, 0x5aa5]);
      assert.deepEqual(snapshot(b.ram, SCHED.seqDst, SCHED.seqDst + 0x20),
        Array(0x20).fill(fill));

      assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
      assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s3Init, HIBACHI_A0.s3Step]);
      assert.deepEqual(calls, [[3, 0x20], [3, 0x20]]);
      assert.deepEqual([
        b.ram.u16(SUB + 0x02), b.ram.u16(SUB + 0x04), b.ram.u16(RNG_STATE),
      ], [u16(endY - 0x21), endX, 0x5aa5]);
    }
  });

test('W581 freeze and persistence leave A4, attachments, RNG, and unrelated pools untouched',
  { skip: SKIP }, () => {
    const b = bench();
    b.ram.setU16(REC, 0x1357);
    b.ram.setU32(SUB + 0x02, 0x4a6020d8);
    b.ram.setU16(RNG_STATE, 0x00b8);
    for (let offset = 0x20; offset < 0x200; offset++) {
      b.ram.setU8(SUB + offset, (offset * 13 + 7) & 0xff);
    }

    const attachments = snapshot(b.ram, SUB + 0x20, SUB + 0x200);
    const p1 = snapshot(b.ram, RAM.player1, RAM.player1 + 0x62);
    const p2 = snapshot(b.ram, RAM.player2, RAM.player2 + 0x62);
    const objects = snapshot(b.ram, RAM.objTable, RAM.objTableEnd);
    const bullets = snapshot(b.ram, 0x817f8c, 0x81b40c);

    b.ram.setU16(FREEZE, 1);
    main3Init2A50D0(b.ram, b.ctx);
    main3Step2A50DC(b.ram, b.ctx);
    assert.equal(b.ram.u32(SUB + 0x02), 0x4a6020d8);
    b.ram.setU16(FREEZE, 0);

    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 3);
    fillRam(b.ram, SCHED.seqSrc, SCHED.seqSrc + 0x20, 0x6d);
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    for (let index = 0; index < 200; index++) {
      assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    }

    assert.deepEqual([
      b.ram.u16(REC), b.ram.u32(SUB + 0x02),
      b.ram.u8(SUB + 0x1a), b.ram.u8(SUB + 0x1b), b.ram.u16(RNG_STATE),
      b.ram.u16(SCHED.seqCursor), b.ram.u16(SCHED.seqSub),
      b.ram.u16(SCHED.seqPending), b.ram.u16(SCHED.seqRestart), b.sounds.length,
    ], [0x1357, 0x307720d8, 3, 0x20, 0x00b8, 3, 4, 3, 0, 0]);
    assert.deepEqual(snapshot(b.ram, SCHED.seqDst, SCHED.seqDst + 0x20),
      Array(0x20).fill(0x6d));
    assert.deepEqual(snapshot(b.ram, SUB + 0x20, SUB + 0x200), attachments);
    assert.deepEqual(snapshot(b.ram, RAM.player1, RAM.player1 + 0x62), p1);
    assert.deepEqual(snapshot(b.ram, RAM.player2, RAM.player2 + 0x62), p2);
    assert.deepEqual(snapshot(b.ram, RAM.objTable, RAM.objTableEnd), objects);
    assert.deepEqual(snapshot(b.ram, 0x817f8c, 0x81b40c), bullets);
    assert.deepEqual(slotWords(b.ram, SCHED.a4Base, SCHED.a4Slots, SCHED.a4Stride),
      Array(SCHED.a4Slots).fill(0));
    assert.deepEqual(slotWords(b.ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride),
      Array(SCHED.a1Slots).fill(0));
  });

test('W581 restores exact lf150131 and reaches the W587 $291040 frontier',
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
