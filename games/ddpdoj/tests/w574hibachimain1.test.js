// W574: canonical Hibachi A0 main script 1 and the next exact loop-2 frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAM, P } from '../src/machine.js';
import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import {
  SCHED, clearDispatched, dumpDispatched, installScripts, runScheduler25962E,
  scriptAddresses, seqStart2598D0,
} from '../src/scheduler.js';
import {
  HIBACHI_A0, HIBACHI_A3, main1Init2A4F90, main1Step2A4FAE,
} from '../src/hibachiend.js';
import { HIBACHI_A1_COUNTED } from '../src/hibachiguns.js';
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
  : 'exact W574 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [MIGRATED, FRONTIER,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W574 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W587_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);
const W575_TABLE = SKIP ? null : tableBeforeW576(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const LIVE_TABLE_HASH = 'de89564cd0e61927e5780855f4a3ebc42c13086aedf71114ce345d63e9326ee1';
const W587_TABLE_HASH = 'ba6dfc5a6d50f7f5303452fa8341c6139fe99d4cc6a944e23182144a9c7a8741';
const TABLE_HASH = 'bdf8d655d3ba484166eadbe73ba29ad59bed36507695dd6a79db8a09b4b4def0';
const STORED_TABLE_HASH = 'cdce48388d34b89a09ce5d2b8a21ea7dad807bb1fe42468cf8ff3fe44387f30f';
const REC = 0x810c00;
const SUB = 0x814800;
const FRONTIER_A6 = 0x81533c;
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

test('W574 pins the exact A0 id-1 pair and adds no ROM window', { skip: SKIP }, () => {
  assert.equal(ROM_WINDOW_COUNT, 1014);
  assert.equal(TABLE_JSON.rom.windows.length, 1014);
  assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 478681);
  assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
  assert.equal(canonicalHash(W575_TABLE), TABLE_HASH);
  assert.deepEqual(TABLE_JSON.rom.windows.filter((w) => w.why.startsWith('W574:')), []);

  assert.deepEqual([
    ROM.u32(HIBACHI_A0.table + 8), ROM.u32(HIBACHI_A0.table + 12),
  ], [HIBACHI_A0.s1Init, HIBACHI_A0.s1Step]);
  assert.deepEqual([
    HIBACHI_A0.s1Init, HIBACHI_A0.s1Step, HIBACHI_A0.s1End,
  ], [0x2a4f90, 0x2a4fae, 0x2a5054]);
  assert.equal(HIBACHI_A0.s1End, HIBACHI_A0.s2Init);
  assert.equal(HIBACHI_A0.s1End, ROM.u32(HIBACHI_A0.table + 16),
    'the exact extent ends at A0 id 2 init');
  assert.equal(HIBACHI_A0.s1Step - HIBACHI_A0.s1Init, 0x1e);
  assert.equal(HIBACHI_A0.s1End - HIBACHI_A0.s1Step, 0xa6);
  assert.equal(IMG.readUInt16BE(0x2a5050), 0x6000);
  assert.equal(IMG.readInt16BE(0x2a5052), -0x019c,
    'the last instruction branches to the shared part-position body');
  assert.equal(IMG.readUInt16BE(HIBACHI_A0.s1End), 0x7000,
    'A0 id 2 starts immediately at the exclusive end');

  const registered = new Set(scriptAddresses());
  assert.ok(registered.has(HIBACHI_A0.s1Init));
  assert.ok(registered.has(HIBACHI_A0.s1Step));
  assert.equal(HIBACHI_A1_COUNTED[4].init, 0x2a805a);
  assert.ok(!registered.has(0x2a805a), 'noncanonical main A1 gun 4 stays unported');
});

test('W574 dispatches the separate init and step pointers with canonical fallthrough',
  { skip: SKIP }, () => {
    const b = bench();
    b.ram.setU32(SUB + 0x02, 0x50004000);
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 1);

    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s1Init]);
    assert.equal(b.ram.u16(SCHED.seqCursor), 1);
    assert.equal(b.ram.u16(SCHED.seqSub), 4);
    assert.deepEqual([
      b.ram.u16(SCHED.seqDst + 0x02), b.ram.u16(SCHED.seqDst + 0x04),
      b.ram.u16(SCHED.seqDst + 0x06), b.ram.u8(SUB + 0x1a), b.ram.u8(SUB + 0x1b),
    ], [0, 0x0808, 0x003f, 0, 0],
    'init falls through and spends the first of exactly $40 opening dispatches');
    assert.equal(attached(b.ram, 0x140), 0x50004000);

    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A0.s1Step]);
    assert.equal(b.ram.u16(SCHED.seqDst + 0x06), 0x003e);
    assert.equal(b.sounds.length, 0);
  });

test('W574 opening expiry performs the one-shot in exact order and starts no A1 gun',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.seqDst;
    main1Init2A4F90(b.ram, b.ctx, a4);
    b.ram.setU16(a4 + 0x06, 2);
    b.ram.setU32(SUB + 0x02, 0x50004000);
    b.ram.setU8(SUB + 0x1a, 8);
    b.ram.setU8(SUB + 0x1b, 0x10);
    b.ram.setU16(SUB + 0x140, 0x1234);
    b.ram.setU16(SUB + 0x160, 0x00f0);
    b.ram.setU16(SUB + 0x106, 0xbeef);
    b.ram.setU16(SCHED.a2Base + 0x0a * SCHED.a2Stride, 0x8000);
    b.ram.setU16(SCHED.a2Base + 0x0e * SCHED.a2Stride, 0x8000);

    main1Step2A4FAE(b.ram, b.ctx, a4);
    assert.equal(b.ram.u16(a4 + 0x06), 1);
    assert.deepEqual(b.sounds, []);
    assert.equal(b.ram.u32(SUB + 0x02), 0x50004000,
      'nonzero opening timer bypasses movement as well as the one-shot');

    const vector = MT.vector(8, 0x10);
    main1Step2A4FAE(b.ram, b.ctx, a4);
    assert.deepEqual(b.sounds, [0x28cb88]);
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base), b.ram.u16(SCHED.a3Base + SCHED.a3Stride),
    ], [0x8003, 0x8004]);
    assert.deepEqual([
      b.ram.u16(SCHED.a2Base + 0x0a * SCHED.a2Stride),
      b.ram.u16(SCHED.a2Base + 0x0e * SCHED.a2Stride),
    ], [0x8001, 0x8001]);
    assert.equal(b.ram.u16(SUB + 0x172), 0x1000);
    assert.equal(b.ram.u16(SUB + 0x140), 0x1234 | 0xa001);
    assert.equal(b.ram.u16(SUB + 0x160), 0x00f0 | 0xa001);
    assert.equal(b.ram.u16(SUB + 0x106), 0);
    assert.deepEqual([
      b.ram.u16(SUB + 0x02), b.ram.u16(SUB + 0x04),
    ], [u16(0x5000 + vector.dy), u16(0x4000 + vector.dx)]);
    assert.equal(attached(b.ram, 0x180), b.ram.u32(SUB + 0x02),
      'the trigger frame moves first and then refreshes every attached root part');
  });

test('W574 byte borrow, reload, state reversal, and id-2 handoff are exact',
  { skip: SKIP }, () => {
    const outward = bench();
    const a4 = SCHED.seqDst;
    outward.ram.setU16(0x8130d2, 1);
    outward.ram.setU16(a4 + 0x02, 0);
    outward.ram.setU16(a4 + 0x04, 0x0108);
    outward.ram.setU16(a4 + 0x06, 0);
    outward.ram.setU8(SUB + 0x1a, 7);

    main1Step2A4FAE(outward.ram, outward.ctx, a4);
    assert.deepEqual([
      outward.ram.u8(a4 + 0x04), outward.ram.u8(a4 + 0x05),
      outward.ram.u8(SUB + 0x1a), outward.ram.u16(a4 + 0x02),
    ], [0, 8, 7, 0], 'old byte 1 only decrements and does not fire');
    main1Step2A4FAE(outward.ram, outward.ctx, a4);
    assert.deepEqual([
      outward.ram.u16(a4 + 0x04), outward.ram.u8(SUB + 0x1a),
      outward.ram.u16(a4 + 0x02),
    ], [0x0303, 8, 1], 'old byte 0 borrows, reaches frame 8, and reverses state');

    const inward = bench();
    inward.ram.setU16(0x8130d2, 1);
    inward.ram.setU16(a4, 0xbeef);
    inward.ram.setU16(a4 + 0x02, 1);
    inward.ram.setU16(a4 + 0x04, 0x0003);
    inward.ram.setU16(a4 + 0x06, 0);
    inward.ram.setU8(SUB + 0x1a, 5);
    main1Step2A4FAE(inward.ram, inward.ctx, a4);
    assert.deepEqual([
      inward.ram.u8(a4 + 0x04), inward.ram.u8(a4 + 0x05),
      inward.ram.u8(SUB + 0x1a), inward.ram.u16(a4),
      inward.ram.u16(SCHED.seqRestart), inward.ram.u16(SCHED.seqPending),
    ], [3, 3, 4, 0, 1, 2]);

    const lifetime = bench();
    lifetime.ram.setU16(0x8130d2, 1);
    lifetime.ram.setU16(a4, 0xbeef);
    main1Init2A4F90(lifetime.ram, lifetime.ctx, a4);
    main1Step2A4FAE(lifetime.ram, lifetime.ctx, a4);
    let dispatches = 1;
    while (lifetime.ram.u16(SCHED.seqRestart) === 0 && dispatches < 1000) {
      main1Step2A4FAE(lifetime.ram, lifetime.ctx, a4);
      dispatches++;
    }
    assert.deepEqual([
      dispatches, lifetime.ram.u16(SCHED.seqPending), lifetime.ram.u8(SUB + 0x1a),
      lifetime.ram.u16(a4), lifetime.sounds,
    ], [130, 2, 4, 0, [0x28cb88]], 'canonical script lifetime is exactly 130 dispatches');
  });

test('W574 resumes the migrated W573 state and reaches the W587 $291040 frontier',
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
      STORED_TABLE_HASH, 147631, 158220, 4, 8, 16, 1,
      'c63fba57effb9490ed814c76f12d791c3862f11ec912368960ca8654e5e7c528',
      '1472ca7c0f85a8ddbe2e7e56bfe43c1096f17cf2ec7065d7edf3915ddf78e0d9',
    ]);
    const adoptedFrontier = { ...frontier, tablesSha256: TABLE_HASH };
    assert.deepEqual({ ...adoptedFrontier, tablesSha256: frontier.tablesSha256 }, frontier,
      'W623 adoption changes only the stored checkpoint table identity');
    restoreCheckpoint(adoptedFrontier, assets, { ship: 0, style: 4 });

    const migrated = JSON.parse(readFileSync(MIGRATED, 'utf8'));
    assert.equal(migrated.tablesSha256, STORED_TABLE_HASH);
    const adoptedMigrated = { ...migrated, tablesSha256: TABLE_HASH };
    assert.deepEqual({ ...adoptedMigrated, tablesSha256: migrated.tablesSha256 }, migrated,
      'W623 adoption changes only the stored migrated table identity');
    restoreCheckpoint(adoptedMigrated, assets, adoptedMigrated.selection);
    const currentMigrated = { ...adoptedMigrated, tablesSha256: W587_TABLE_HASH };
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
      ROM.u32(HIBACHI_A3.table + 3 * 8), ROM.u32(HIBACHI_A3.table + 4 * 8),
      resumed.game.ram.u16(FRONTIER_A6 + HIBACHI_A3.s3Selector),
      resumed.game.ram.u16(FRONTIER_A6 + HIBACHI_A3.s4Selector),
    ], [0x2a56a2, 0x2a56ce, 0, 0x008a]);
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      'e37340e127fade24b6bb4b1db8de479c66a8aed883c53a3c5b3bc10d6a45e30b',
      'b68ce097514518437deed8c58fbe069137af4fc5ab2e413f95424fd97e4c74c3',
    ]);
  });
