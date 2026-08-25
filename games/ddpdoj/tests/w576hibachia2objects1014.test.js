// W576: canonical Hibachi A2 object renderers 10 and 14 and the next exact frontier.

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
  SCHED, a2Run2598E6, a2Stop25994A, a3Start259962, installScripts,
  runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';
import {
  HIBACHI_A2, HIBACHI_A3, a2Object10_2A4C42, a2Object14_2A4C08,
} from '../src/hibachiend.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_WINDOW_COUNT, tableBeforeW576, tableBeforeW584, tableBeforeW588,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const MIGRATED = here('../probes/checkpoints/w573-migrated-lf00146131.json');
const FRONTIER = here('../probes/checkpoints/ship0-style4-lf00147631.json');
const required = [TABLES, IMAGE];
const SKIP = required.every(existsSync) ? false
  : 'exact W576 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [MIGRATED, FRONTIER,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W576 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W575_TABLE = SKIP ? null : tableBeforeW576(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const LIVE_TABLE_HASH = 'b062e45b4c4ca0488a0c4660a83a9d868feaf8b6d00b670d1de9948481f3f7c3';
const W587_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const W575_TABLE_HASH = 'cdce48388d34b89a09ce5d2b8a21ea7dad807bb1fe42468cf8ff3fe44387f30f';
const REC = 0x810c00;
const SUB = 0x814800;
const OUT = BUCKETS[1];
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');

function bench(tables = null) {
  const ram = new Ram();
  ram.setU32(REC + 0x06, SUB);
  const ctx = { bossRec: REC, bossSubRec: SUB, tables: MT };
  if (tables) installScripts(ram, ROM, tables);
  return { ram, ctx };
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

const bytes = (ram, base, length) =>
  Array.from({ length }, (_, offset) => ram.u8(base + offset));
const record = (ram, index) => bytes(ram, OUT.buffer + index * RECORD_BYTES, RECORD_BYTES);
const hex = (values) => values.map((value) => value.toString(16).padStart(2, '0')).join('');
const faultAt = (address) => (error) => error?.romAddress === address;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

test('W576 pins both raw code, NOP, and data boundaries with exactly two windows',
  { skip: SKIP }, () => {
    assert.deepEqual([
      HIBACHI_A2.object14, HIBACHI_A2.object14CodeEnd,
      HIBACHI_A2.object14Art, HIBACHI_A2.object10,
      HIBACHI_A2.object10CodeEnd, HIBACHI_A2.object10Table,
      HIBACHI_A2.object10Table + HIBACHI_A2.object10Rows * HIBACHI_A2.object10Stride,
    ], [0x2a4c08, 0x2a4c34, 0x2a4c36, 0x2a4c42, 0x2a4c6a, 0x2a4c6c, 0x2a4cfc]);
    assert.deepEqual([
      IMG.readUInt32BE(HIBACHI_A2.object14),
      IMG.readUInt16BE(HIBACHI_A2.object14CodeEnd - 6),
      IMG.readUInt32BE(HIBACHI_A2.object14CodeEnd - 4),
      IMG.readUInt16BE(HIBACHI_A2.object14CodeEnd),
      IMG.readUInt32BE(HIBACHI_A2.object10),
      IMG.readUInt16BE(HIBACHI_A2.object10CodeEnd - 6),
      IMG.readUInt32BE(HIBACHI_A2.object10CodeEnd - 4),
      IMG.readUInt16BE(HIBACHI_A2.object10CodeEnd),
    ], [0x41fa002c, 0x4ef9, 0x0023dfea, 0x4e71,
      0x41fa0028, 0x4ef9, 0x0023dfea, 0x4e71]);

    const added = TABLE_JSON.rom.windows.filter((window) => window.why.startsWith('W576:'));
    assert.deepEqual(added.map(({ base, len }) => [base, len]), [
      ['$2A4C36', 0x000c], ['$2A4C6C', 0x0090],
    ]);
    assert.deepEqual(ROM.bytes(HIBACHI_A2.object14Art, 0x0c),
      Array.from(IMG.subarray(HIBACHI_A2.object14Art, HIBACHI_A2.object14Art + 0x0c)));
    assert.deepEqual(ROM.bytes(HIBACHI_A2.object10Table, 0x90),
      Array.from(IMG.subarray(HIBACHI_A2.object10Table, HIBACHI_A2.object10Table + 0x90)));

    for (const address of [
      HIBACHI_A2.object14, HIBACHI_A2.object14CodeEnd,
      HIBACHI_A2.object10, HIBACHI_A2.object10CodeEnd,
      HIBACHI_A2.object10Table + 0x90,
    ]) assert.throws(() => ROM.u8(address), faultAt(address));
    assert.throws(() => ROM.u32(HIBACHI_A2.object14Art + 0x0a),
      faultAt(HIBACHI_A2.object14Art + 0x0a), 'a read cannot cross from data into id 10 code');
    assert.throws(() => ROM.u32(HIBACHI_A2.object10Table + 0x8e),
      faultAt(HIBACHI_A2.object10Table + 0x8e), 'a read cannot cross into id 16 code');
  });

test('W576 table migration is strict, additive, identity-pinned, and composed for history',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 906);
    assert.deepEqual([
      TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((sum, window) => sum + window.len, 0),
      canonicalHash(TABLE_JSON),
    ], [906, 453741, LIVE_TABLE_HASH]);
    assert.deepEqual([
      W575_TABLE.rom.windows.length,
      W575_TABLE.rom.windows.reduce((sum, window) => sum + window.len, 0),
      canonicalHash(W575_TABLE),
    ], [847, 452447, W575_TABLE_HASH]);

    const withoutAdded = tableBeforeW584(TABLE_JSON).rom.windows.filter((window) =>
      !window.why.startsWith('W576:'));
    assert.deepEqual(W575_TABLE.rom.windows, withoutAdded,
      'removing W576 preserves every older window byte and its order');
    assert.deepEqual(tableBeforeW576(W575_TABLE), W575_TABLE,
      'the reconstruction is idempotent on a historical table');

    const partial = clone(TABLE_JSON);
    partial.rom.windows = partial.rom.windows.filter((window) => window.base !== '$2A4C6C');
    assert.throws(() => tableBeforeW576(partial), /only partially present/);
    const malformed = clone(TABLE_JSON);
    malformed.rom.windows.find((window) => window.base === '$2A4C36').len++;
    assert.throws(() => tableBeforeW576(malformed), /not the exact W576 additive shape/);
  });

test('W576 registers both persistent A2 entries and decodes every requested id 14 frame',
  { skip: SKIP }, () => {
    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A2.object14));
    assert.ok(registered.has(HIBACHI_A2.object10));
    assert.deepEqual([
      ROM.u32(HIBACHI_A2.object14Art),
      ROM.u32(HIBACHI_A2.object14Art + 4),
      ROM.u32(HIBACHI_A2.object14Art + 8),
    ], [0x0010187c, 0x00102100, 0x00102984]);

    const b = bench();
    b.ram.setU32(SUB + 0x02, 0x1234f300);
    for (const [selector, palette, expectedArt] of [
      [0, 0x7a, 0x0010187c], [4, 0xab, 0x00102100], [8, 0xff, 0x00102984],
    ]) {
      b.ram.setU16(SUB + 0x12a, selector);
      b.ram.setU8(SUB + 0x0ea, palette);
      a2Object14_2A4C08(b.ram, ROM, b.ctx);
      const index = selector / 4;
      assert.equal(hex(record(b.ram, index)),
        `87d88344${expectedArt.toString(16).padStart(8, '0')}1110${palette
          .toString(16).padStart(4, '0')}`);
    }
    assert.equal(b.ram.u16(OUT.counter), 3 * RECORD_BYTES);
    assert.equal(b.ram.u32(OUT.buffer), 0x87d88344,
      'separate wrapped long additions preserve the low-word carry into the queued position');
  });

test('W576 id 10 decodes both palette regions and preserves full long carry',
  { skip: SKIP }, () => {
    const b = bench();
    b.ram.setU32(SUB + 0x02, 0x89abf100);
    const cases = [
      [0x00, 0x00103208, 0x0014],
      [0x5a, 0x00109b44, 0x0014],
      [0x60, 0x0010a248, 0x0015],
      [0x8a, 0x0010d364, 0x0015],
    ];
    for (let index = 0; index < cases.length; index++) {
      const [selector, expectedArt, expectedPalette] = cases[index];
      b.ram.setU16(SUB + 0x12c, selector);
      a2Object10_2A4C42(b.ram, ROM, b.ctx);
      assert.equal(hex(record(b.ram, index)),
        `861e8344${expectedArt.toString(16).padStart(8, '0')}0f00${expectedPalette
          .toString(16).padStart(4, '0')}`);
    }
    assert.equal(b.ram.u16(OUT.counter), 4 * RECORD_BYTES);
    assert.deepEqual(cases.map(([selector]) => ROM.u16(HIBACHI_A2.object10Table
      + selector + 4)), [0x0014, 0x0014, 0x0015, 0x0015]);
    assert.equal(b.ram.u32(OUT.buffer), 0x861e8344,
      'the low-word carry is retained through both additions and the emitter packing');
  });

test('W576 both selectors use signed ADDA.W offsets and fault outside exact data',
  { skip: SKIP }, () => {
    const b = bench();
    b.ram.setU16(SUB + 0x12a, 0xfffc);
    assert.throws(() => a2Object14_2A4C08(b.ram, ROM, b.ctx),
      faultAt(HIBACHI_A2.object14Art - 4));
    b.ram.setU16(SUB + 0x12c, 0xfffa);
    assert.throws(() => a2Object10_2A4C42(b.ram, ROM, b.ctx),
      faultAt(HIBACHI_A2.object10Table - 6));
    assert.equal(b.ram.u16(OUT.counter), 0, 'faults happen before either enqueue');
  });

test('W576 scheduler runs A3 before A2 and A2 slots in ascending order',
  { skip: SKIP }, () => {
    const samePass = bench({ a2: HIBACHI_A2.table, a3: HIBACHI_A3.table });
    samePass.ram.setU32(SUB + 0x02, 0x30002000);
    samePass.ram.setU16(SUB + HIBACHI_A3.s3Selector, 8);
    assert.equal(a3Start259962(samePass.ram, 3), true);
    a2Run2598E6(samePass.ram, 14);
    assert.equal(runScheduler25962E(samePass.ram, ROM, samePass.ctx), false);
    assert.equal(samePass.ram.u16(SUB + HIBACHI_A3.s3Selector), 4);
    assert.equal(samePass.ram.u32(OUT.buffer + 4), 0x00102100,
      'A3 id 3 initializes and advances the selector before A2 id 14 reads it');

    const ascending = bench({ a2: HIBACHI_A2.table });
    ascending.ram.setU32(SUB + 0x02, 0x30002000);
    ascending.ram.setU16(SUB + 0x12a, 0);
    ascending.ram.setU16(SUB + 0x12c, 0);
    a2Run2598E6(ascending.ram, 14);
    a2Run2598E6(ascending.ram, 10);
    runScheduler25962E(ascending.ram, ROM, ascending.ctx);
    assert.deepEqual([
      ascending.ram.u16(OUT.buffer + 8),
      ascending.ram.u16(OUT.buffer + RECORD_BYTES + 8),
    ], [0x0f00, 0x1110], 'slot 10 emits before slot 14 regardless of arm order');
  });

test('W576 A2 entries persist across explicit stop and restart lifecycle',
  { skip: SKIP }, () => {
    const b = bench({ a2: HIBACHI_A2.table });
    b.ram.setU32(SUB + 0x02, 0x30002000);
    const slot10 = SCHED.a2Base + 10 * SCHED.a2Stride;
    const slot14 = SCHED.a2Base + 14 * SCHED.a2Stride;
    assert.deepEqual([b.ram.u16(slot10), b.ram.u16(slot14)], [0x8000, 0x8000]);
    a2Run2598E6(b.ram, 10);
    a2Run2598E6(b.ram, 14);
    runScheduler25962E(b.ram, ROM, b.ctx);
    assert.deepEqual([
      b.ram.u16(slot10), b.ram.u16(slot14), b.ram.u16(OUT.counter),
    ], [0x8001, 0x8001, 2 * RECORD_BYTES], 'neither handler self-clears');

    a2Stop25994A(b.ram, 10);
    a2Stop25994A(b.ram, 14);
    runScheduler25962E(b.ram, ROM, b.ctx);
    assert.deepEqual([
      b.ram.u16(slot10), b.ram.u16(slot14), b.ram.u16(OUT.counter),
    ], [0x8000, 0x8000, 2 * RECORD_BYTES]);

    a2Run2598E6(b.ram, 10);
    a2Run2598E6(b.ram, 14);
    runScheduler25962E(b.ram, ROM, b.ctx);
    assert.deepEqual([
      b.ram.u16(slot10), b.ram.u16(slot14), b.ram.u16(OUT.counter),
    ], [0x8001, 0x8001, 4 * RECORD_BYTES]);
  });

test('W576 renderers mutate only the sprite bucket, not boss, RNG, players, objects, or bullets',
  { skip: SKIP }, () => {
    const b = bench();
    for (let offset = 0; offset < 0x200; offset++)
      b.ram.setU8(SUB + offset, (offset * 11 + 7) & 0xff);
    b.ram.setU32(SUB + 0x02, 0x1234f300);
    b.ram.setU16(SUB + 0x12a, 4);
    b.ram.setU16(SUB + 0x12c, 0x60);
    for (let offset = 0; offset < 0x62; offset++) {
      b.ram.setU8(RAM.player1 + offset, (offset * 3 + 1) & 0xff);
      b.ram.setU8(RAM.player2 + offset, (offset * 5 + 2) & 0xff);
    }
    b.ram.setU16(0x803916, 0x5aa5);
    const boss = bytes(b.ram, SUB, 0x200);
    const p1 = bytes(b.ram, RAM.player1, 0x62);
    const p2 = bytes(b.ram, RAM.player2, 0x62);
    const objects = bytes(b.ram, RAM.objTable, RAM.objTableEnd - RAM.objTable);
    const bulletBase = 0x817f8c;
    const bullets = bytes(b.ram, bulletBase, 0x81b40c - bulletBase);

    a2Object14_2A4C08(b.ram, ROM, b.ctx);
    a2Object10_2A4C42(b.ram, ROM, b.ctx);
    assert.equal(b.ram.u16(OUT.counter), 2 * RECORD_BYTES);
    assert.deepEqual(bytes(b.ram, SUB, 0x200), boss);
    assert.equal(b.ram.u16(0x803916), 0x5aa5);
    assert.deepEqual(bytes(b.ram, RAM.player1, 0x62), p1);
    assert.deepEqual(bytes(b.ram, RAM.player2, 0x62), p2);
    assert.deepEqual(bytes(b.ram, RAM.objTable, RAM.objTableEnd - RAM.objTable), objects);
    assert.deepEqual(bytes(b.ram, bulletBase, 0x81b40c - bulletBase), bullets);
  });

test('W576 migrates table identity only and reaches the exact W587 $291040 frontier',
  { skip: SKIP_CHECKPOINT }, async () => {
    const live = await bundle();
    assert.equal(canonicalHash(live.tables), LIVE_TABLE_HASH);
    assert.deepEqual(live.tables, TABLE_JSON);
    const assets = { ...live, tables: W575_TABLE };
    assert.equal(canonicalHash(assets.tables), W575_TABLE_HASH);
    assert.deepEqual(assets.tables, W575_TABLE);
    const exact = { ...live, tables: tableBeforeW588(TABLE_JSON) };
    assert.equal(canonicalHash(exact.tables), W587_TABLE_HASH);

    const frontier = JSON.parse(readFileSync(FRONTIER, 'utf8'));
    assert.deepEqual([
      frontier.tablesSha256, frontier.frame.logic, frontier.frame.video,
      frontier.raw.stage, frontier.raw.stageX2, frontier.raw.stageX4, frontier.raw.loop,
      frontier.ramSha256, frontier.gameSha256,
    ], [
      W575_TABLE_HASH, 147631, 158220, 4, 8, 16, 1,
      'c63fba57effb9490ed814c76f12d791c3862f11ec912368960ca8654e5e7c528',
      '1472ca7c0f85a8ddbe2e7e56bfe43c1096f17cf2ec7065d7edf3915ddf78e0d9',
    ]);
    restoreCheckpoint(frontier, assets, { ship: 0, style: 4 });

    const migrated = JSON.parse(readFileSync(MIGRATED, 'utf8'));
    restoreCheckpoint(migrated, assets, migrated.selection);
    const currentMigrated = { ...migrated, tablesSha256: W587_TABLE_HASH };
    assert.deepEqual({ ...currentMigrated, tablesSha256: migrated.tablesSha256 }, migrated,
      'the in-memory migration changes table identity and no checkpoint field');
    const resumed = restoreCheckpoint(currentMigrated, exact, currentMigrated.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 7900; attempted++) {
      try {
        resumed.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        resumed.game.step(resumed.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    const state = checkpointDocument(resumed.game, exact, {
      ...migrated.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    });
    const liveBoss = Array.from({ length: ENEMY.slots }, (_, index) =>
      ENEMY.table + index * ENEMY.stride).find((a5) =>
      resumed.game.ram.u32(a5 + 0x4c) === 0x2a4606);
    assert.notEqual(liveBoss, undefined, 'the active Hibachi record remains allocated at the blocker');
    const liveSub = resumed.game.ram.u32(liveBoss + 0x06);
    assert.deepEqual([
      attempted, resumed.game.logicFrame, resumed.game.videoFrame,
      error?.romAddress, state.raw.stage, state.raw.stageX2, state.raw.stageX4, state.raw.loop,
      liveSub, resumed.game.ram.u16(liveSub + 0x12a), resumed.game.ram.u16(liveSub + 0x12c),
    ], [7667, 153797, 164459, 0x291040, 4, 8, 16, 1, 0x81533c, 0, 0x008a]);
    assert.match(error?.message ?? '', /word at \$291040 is outside every ROM window/);
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      'e37340e127fade24b6bb4b1db8de479c66a8aed883c53a3c5b3bc10d6a45e30b',
      '5cd13dcbdcbb8a69a59dbac2244a4a6daeafd8b48ff4c38a6d2ae50e0a55b507',
    ]);
    assert.equal(frontier.frame.logic + 1500, 149131);
    assert.ok(resumed.game.logicFrame > frontier.frame.logic + 2500,
      'W587 crosses three more periodic checkpoints before the next loud frontier');
  });
