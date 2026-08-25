// W575: canonical Hibachi A3 selector scripts 3 and 4 and the exact A2 frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAM, P } from '../src/machine.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import {
  SCHED, a2Run2598E6, a3Start259962, clearDispatched, dumpDispatched,
  installScripts, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import {
  HIBACHI_A2, HIBACHI_A3,
  a3s3Init2A56A2, a3s3Step2A56AE,
  a3s4Init2A56CE, a3s4Step2A56DA,
} from '../src/hibachiend.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import { ROM_WINDOW_COUNT, tableBeforeW576, tableBeforeW588 } from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const ASSETS = here('../assets');
const MIGRATED = here('../probes/checkpoints/w573-migrated-lf00146131.json');
const FRONTIER = here('../probes/checkpoints/ship0-style4-lf00147631.json');
const required = [TABLES, IMAGE];
const SKIP = required.every(existsSync) ? false
  : 'exact W575 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [MIGRATED, FRONTIER,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W575 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W587_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const W575_TABLE = SKIP ? null : tableBeforeW576(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const LIVE_TABLE_HASH = '8854b7ebbc400795e7bcc7cf401e4f4d762220333ccbc6df9e1cf0c4b5ca5f5f';
const W587_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const TABLE_HASH = 'cdce48388d34b89a09ce5d2b8a21ea7dad807bb1fe42468cf8ff3fe44387f30f';
const REC = 0x810c00;
const SUB = 0x814800;
const FRONTIER_A6 = 0x81533c;
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');

function bench(tables) {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(REC + 0x06, SUB);
  const ctx = {
    bossRec: REC, bossSubRec: SUB, tables: MT,
    unported: log, unportedLog: log,
  };
  if (tables) installScripts(ram, ROM, tables);
  return { ram, log, ctx };
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

const bytes = (ram, base, length) =>
  Array.from({ length }, (_, offset) => ram.u8(base + offset));

test('W575 pins both raw A3 pairs, exclusive boundaries, registrations, and no ROM window',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 908);
    assert.equal(TABLE_JSON.rom.windows.length, 908);
    assert.equal(TABLE_JSON.rom.windows.reduce((sum, window) => sum + window.len, 0), 453851);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.equal(canonicalHash(W575_TABLE), TABLE_HASH);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((window) => window.why.startsWith('W575:')), []);

    assert.deepEqual([
      ROM.u32(HIBACHI_A3.table + 3 * 8), ROM.u32(HIBACHI_A3.table + 3 * 8 + 4),
      ROM.u32(HIBACHI_A3.table + 4 * 8), ROM.u32(HIBACHI_A3.table + 4 * 8 + 4),
    ], [
      HIBACHI_A3.s3Init, HIBACHI_A3.s3Step,
      HIBACHI_A3.s4Init, HIBACHI_A3.s4Step,
    ]);
    assert.deepEqual([
      HIBACHI_A3.s3Init, HIBACHI_A3.s3Step, HIBACHI_A3.s3End,
      HIBACHI_A3.s4Init, HIBACHI_A3.s4Step, HIBACHI_A3.s4End,
    ], [0x2a56a2, 0x2a56ae, 0x2a56ce, 0x2a56ce, 0x2a56da, 0x2a56fa]);
    assert.equal(HIBACHI_A3.s3End, HIBACHI_A3.s4Init);
    assert.equal(HIBACHI_A3.s4End, ROM.u32(HIBACHI_A3.table + 5 * 8));
    assert.deepEqual([
      HIBACHI_A3.s3Selector, HIBACHI_A3.s4Selector,
      IMG.readUInt16BE(HIBACHI_A3.s3End - 2),
      IMG.readUInt16BE(HIBACHI_A3.s4End - 2),
    ], [0x012a, 0x012c, 0x4e75, 0x4e75]);

    const registered = new Set(scriptAddresses());
    for (const address of [
      HIBACHI_A3.s3Init, HIBACHI_A3.s3Step,
      HIBACHI_A3.s4Init, HIBACHI_A3.s4Step,
    ]) assert.ok(registered.has(address), `$${address.toString(16)} is registered`);
  });

test('W575 init fallthrough and separate steps preserve the exact two selector cadences',
  { skip: SKIP }, () => {
    const b = bench({ a3: HIBACHI_A3.table });
    assert.equal(a3Start259962(b.ram, 3), true);
    assert.equal(a3Start259962(b.ram, 4), true);
    b.ram.setU16(SCHED.a3Base + 0x02, 0xbeef);
    b.ram.setU16(SCHED.a3Base + SCHED.a3Stride + 0x02, 0xcafe);
    b.ram.setU16(SUB + HIBACHI_A3.s3Selector, 0xdead);
    b.ram.setU16(SUB + HIBACHI_A3.s4Selector, 0xbabe);

    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A3.s3Init, HIBACHI_A3.s4Init]);
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base), b.ram.u16(SCHED.a3Base + SCHED.a3Stride),
      b.ram.u16(SCHED.a3Base + 0x02),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s3Selector),
      b.ram.u16(SUB + HIBACHI_A3.s4Selector),
    ], [0x8103, 0x8104, 0x0000, 0x0101, 0x0004, 0x0006],
    'both init entries fall through; id 4 reloads its low byte on the first dispatch');

    clearDispatched();
    runScheduler25962E(b.ram, ROM, b.ctx);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A3.s3Step, HIBACHI_A3.s4Step]);
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base + 0x02),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s3Selector),
      b.ram.u16(SUB + HIBACHI_A3.s4Selector),
    ], [0x0000, 0x0001, 0x0008, 0x0006]);

    runScheduler25962E(b.ram, ROM, b.ctx);
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base + 0x02),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s3Selector),
      b.ram.u16(SUB + HIBACHI_A3.s4Selector),
    ], [0x0000, 0x0101, 0x0000, 0x000c],
    'id 3 cycles every dispatch while id 4 advances every two dispatches');
  });

test('W575 byte borrow, reload, exact equality, and wrapped word arithmetic are literal',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.a3Base;

    b.ram.setU16(a4 + 0x02, 0x0107);
    b.ram.setU16(SUB + HIBACHI_A3.s3Selector, 4);
    a3s3Step2A56AE(b.ram, b.ctx, a4);
    assert.deepEqual([
      b.ram.u16(a4 + 0x02), b.ram.u16(SUB + HIBACHI_A3.s3Selector),
    ], [0x0007, 4], 'old high byte 1 decrements without firing');
    a3s3Step2A56AE(b.ram, b.ctx, a4);
    assert.deepEqual([
      b.ram.u16(a4 + 0x02), b.ram.u16(SUB + HIBACHI_A3.s3Selector),
    ], [0x0707, 8], 'old high byte 0 borrows and reloads from the low byte');

    b.ram.setU16(a4 + 0x02, 0x0000);
    b.ram.setU16(SUB + HIBACHI_A3.s3Selector, 8);
    a3s3Step2A56AE(b.ram, b.ctx, a4);
    assert.equal(b.ram.u16(SUB + HIBACHI_A3.s3Selector), 0,
      'id 3 resets only when addition produces exactly $000C');
    b.ram.setU16(SUB + HIBACHI_A3.s3Selector, 9);
    a3s3Step2A56AE(b.ram, b.ctx, a4);
    assert.equal(b.ram.u16(SUB + HIBACHI_A3.s3Selector), 0x000d);
    b.ram.setU16(SUB + HIBACHI_A3.s3Selector, 0xfffe);
    a3s3Step2A56AE(b.ram, b.ctx, a4);
    assert.equal(b.ram.u16(SUB + HIBACHI_A3.s3Selector), 0x0002,
      'id 3 addition wraps as a word without modulo canonicalization');

    b.ram.setU16(a4 + 0x02, 0x0001);
    b.ram.setU16(SUB + HIBACHI_A3.s4Selector, 0x008a);
    a3s4Step2A56DA(b.ram, b.ctx, a4);
    assert.deepEqual([
      b.ram.u16(a4 + 0x02), b.ram.u16(SUB + HIBACHI_A3.s4Selector),
    ], [0x0101, 0x005a], '$8A plus 6 reaches exact $90 and resets to $5A');
    b.ram.setU16(a4 + 0x02, 0x0001);
    b.ram.setU16(SUB + HIBACHI_A3.s4Selector, 0x008b);
    a3s4Step2A56DA(b.ram, b.ctx, a4);
    assert.equal(b.ram.u16(SUB + HIBACHI_A3.s4Selector), 0x0091,
      'noncanonical $91 is preserved because the compare is equality only');
    b.ram.setU16(a4 + 0x02, 0x0001);
    b.ram.setU16(SUB + HIBACHI_A3.s4Selector, 0xfffc);
    a3s4Step2A56DA(b.ram, b.ctx, a4);
    assert.equal(b.ram.u16(SUB + HIBACHI_A3.s4Selector), 0x0002);
  });

test('W575 both scripts persist without RNG, player, target, helper, or self-clear effects',
  { skip: SKIP }, () => {
    const b = bench();
    const a3 = SCHED.a3Base;
    const a4 = SCHED.a3Base + SCHED.a3Stride;
    for (let offset = 0; offset < 0x62; offset++) {
      b.ram.setU8(RAM.player1 + offset, (offset * 3 + 1) & 0xff);
      b.ram.setU8(RAM.player2 + offset, (offset * 5 + 2) & 0xff);
    }
    b.ram.setU16(0x803916, 0x5aa5);
    const p1 = bytes(b.ram, RAM.player1, 0x62);
    const p2 = bytes(b.ram, RAM.player2, 0x62);
    b.ram.setU16(a3, 0x8103);
    b.ram.setU16(a4, 0x8104);
    const objects = bytes(b.ram, RAM.objTable, RAM.objTableEnd - RAM.objTable);
    const bulletBase = 0x817f8c;
    const bullets = bytes(b.ram, bulletBase, 0x81b40c - bulletBase);

    a3s3Init2A56A2(b.ram, b.ctx, a3);
    a3s4Init2A56CE(b.ram, b.ctx, a4);
    for (let dispatch = 0; dispatch < 400; dispatch++) {
      a3s3Step2A56AE(b.ram, b.ctx, a3);
      a3s4Step2A56DA(b.ram, b.ctx, a4);
    }
    assert.deepEqual([
      b.ram.u16(a3), b.ram.u16(a4), b.ram.u16(0x803916),
    ], [0x8103, 0x8104, 0x5aa5]);
    assert.deepEqual(bytes(b.ram, RAM.player1, 0x62), p1);
    assert.deepEqual(bytes(b.ram, RAM.player2, 0x62), p2);
    assert.equal(b.ram.u8(RAM.player1 + P.state), p1[P.state]);
    assert.equal(b.ram.u8(RAM.player2 + P.state), p2[P.state]);
    assert.deepEqual(bytes(b.ram, RAM.objTable, RAM.objTableEnd - RAM.objTable), objects,
      'neither selector script produces an object-helper side effect');
    assert.deepEqual(bytes(b.ram, bulletBase, 0x81b40c - bulletBase), bullets,
      'neither selector script produces a bullet-helper side effect');
  });

test('W575 A3 ids 3 and 4 still run earlier in the same scheduler pass than A2 id 10',
  { skip: SKIP }, () => {
    const b = bench({ a2: HIBACHI_A2.table, a3: HIBACHI_A3.table });
    assert.equal(a3Start259962(b.ram, 3), true);
    assert.equal(a3Start259962(b.ram, 4), true);
    a2Run2598E6(b.ram, 10);
    assert.equal(b.ram.u16(SCHED.a2Base + 10 * SCHED.a2Stride), 0x8001);

    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [
      HIBACHI_A2.object10, HIBACHI_A3.s3Init, HIBACHI_A3.s4Init,
    ].sort((a, z) => a - z));
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base + 0x02),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s3Selector),
      b.ram.u16(SUB + HIBACHI_A3.s4Selector),
    ], [0x0000, 0x0101, 0x0004, 0x0006],
    'both A3 init fallthroughs complete before the A2 walk dispatches id 10');
  });

test('W575 exact progression crosses lf151631 and reaches the W587 $291040 frontier',
  { skip: SKIP_CHECKPOINT }, async () => {
    const live = await bundle();
    assert.equal(canonicalHash(live.tables), LIVE_TABLE_HASH);
    assert.deepEqual(live.tables, TABLE_JSON);
    const assets = { ...live, tables: W575_TABLE };
    assert.equal(canonicalHash(assets.tables), TABLE_HASH);
    assert.deepEqual(assets.tables, W575_TABLE);
    const exact = { ...live, tables: W587_TABLE };
    assert.equal(canonicalHash(exact.tables), W587_TABLE_HASH);

    const frontier = JSON.parse(readFileSync(FRONTIER, 'utf8'));
    assert.deepEqual([
      frontier.tablesSha256, frontier.frame.logic, frontier.frame.video,
      frontier.raw.stage, frontier.raw.stageX2, frontier.raw.stageX4, frontier.raw.loop,
      frontier.ramSha256, frontier.gameSha256,
    ], [
      TABLE_HASH, 147631, 158220, 4, 8, 16, 1,
      'c63fba57effb9490ed814c76f12d791c3862f11ec912368960ca8654e5e7c528',
      '1472ca7c0f85a8ddbe2e7e56bfe43c1096f17cf2ec7065d7edf3915ddf78e0d9',
    ]);
    restoreCheckpoint(frontier, assets, { ship: 0, style: 4 });

    const migrated = JSON.parse(readFileSync(MIGRATED, 'utf8'));
    restoreCheckpoint(migrated, assets, migrated.selection);
    const currentMigrated = { ...migrated, tablesSha256: W587_TABLE_HASH };
    assert.deepEqual({ ...currentMigrated, tablesSha256: migrated.tablesSha256 }, migrated);
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
    assert.deepEqual([
      attempted, resumed.game.logicFrame, resumed.game.videoFrame,
      error?.romAddress, state.raw.stage, state.raw.stageX2, state.raw.stageX4, state.raw.loop,
    ], [7667, 153797, 164459, 0x291040, 4, 8, 16, 1]);
    assert.match(error?.message ?? '', /word at \$291040 is outside every ROM window/);
    assert.deepEqual([
      resumed.game.ram.u16(FRONTIER_A6 + HIBACHI_A3.s3Selector),
      resumed.game.ram.u16(FRONTIER_A6 + HIBACHI_A3.s4Selector),
      state.ramSha256, state.gameSha256,
    ], [
      0, 0x008a,
      'e37340e127fade24b6bb4b1db8de479c66a8aed883c53a3c5b3bc10d6a45e30b',
      '5cd13dcbdcbb8a69a59dbac2244a4a6daeafd8b48ff4c38a6d2ae50e0a55b507',
    ]);
    assert.equal(frontier.frame.logic + 1500, 149131);
    assert.ok(resumed.game.logicFrame > frontier.frame.logic + 2500,
      'W587 crosses every periodic boundary through LF151631 before the next loud frontier');
  });
