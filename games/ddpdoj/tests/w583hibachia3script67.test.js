// W583: canonical Hibachi A3 selector-cadence scripts 6 and 7.

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
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';
import {
  SCHED, a2Run2598E6, a3Start259962, clearDispatched, dumpDispatched,
  installScripts, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import {
  HIBACHI_A2, HIBACHI_A3,
  a3s6Init2A5758, a3s6Step2A5764,
  a3s7Init2A5784, a3s7Step2A5790,
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
  : 'exact W583 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [CHECKPOINT,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W583 assets or checkpoint absent. This is a skip, not a pass.';
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
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');
const rawBytes = (from, to) => Array.from(IMG.subarray(from, to));
const slotWords = (ram, base, count, stride) => Array.from({ length: count },
  (_, index) => ram.u16(base + index * stride));

function bench(tables) {
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

function armFamilyAndRenderer(b) {
  b.ram.setU8(SUB + 0x15f, 1);
  assert.equal(a3Start259962(b.ram, 6), true);
  assert.equal(a3Start259962(b.ram, 7), true);
  a2Run2598E6(b.ram, 16);
  assert.equal(b.ram.u16(SCHED.a2Base + 16 * SCHED.a2Stride), 0x8001);
}

test('W583 pins the exact raw family, table identity, registrations, and no ROM window',
  { skip: SKIP }, () => {
    assert.deepEqual(rawBytes(HIBACHI_A3.s6Row, HIBACHI_A3.s6Row + 8),
      [0x00, 0x2a, 0x57, 0x58, 0x00, 0x2a, 0x57, 0x64]);
    assert.deepEqual(rawBytes(HIBACHI_A3.s7Row, HIBACHI_A3.s7Row + 8),
      [0x00, 0x2a, 0x57, 0x84, 0x00, 0x2a, 0x57, 0x90]);
    assert.deepEqual([
      binaryHash(IMG.subarray(HIBACHI_A3.s6Row, HIBACHI_A3.s6Row + 8)),
      binaryHash(IMG.subarray(HIBACHI_A3.s6Init, HIBACHI_A3.s6Step)),
      binaryHash(IMG.subarray(HIBACHI_A3.s6Step, HIBACHI_A3.s6End)),
      binaryHash(IMG.subarray(HIBACHI_A3.s6Init, HIBACHI_A3.s6End)),
      binaryHash(IMG.subarray(HIBACHI_A3.s7Row, HIBACHI_A3.s7Row + 8)),
      binaryHash(IMG.subarray(HIBACHI_A3.s7Init, HIBACHI_A3.s7Step)),
      binaryHash(IMG.subarray(HIBACHI_A3.s7Step, HIBACHI_A3.s7End)),
      binaryHash(IMG.subarray(HIBACHI_A3.s7Init, HIBACHI_A3.s7End)),
      binaryHash(IMG.subarray(HIBACHI_A3.s6Init, HIBACHI_A3.s7End)),
    ], [
      'fa609cca93047ca07a717f955661b6eabd11935f272dd929eb0d9793698bc0ba',
      'bb0fb022b0f2522af040c1b020f28c3cc7afafd7eeb70ccd780dca50e45f4b9e',
      'db0bdb1a8c066441925877ac5a51afa615d38896bd597fba72385bb1a54943e7',
      '61c0f93b5aad661772cc68e6ac5acddb14ba7cba197c525d1347afd61cb0f96f',
      '873c2317071e0a07776b954d0257a3799fe1583cbc2f452932006f621e719080',
      'ae1c713da9a8aa773b8b973cc280e70da2b13c3b6ead29d8ca4d759d8ae41c02',
      'b72eaba6e624016f05f571989d1688f8aac6f9bb8ca8690d8108c956b5892e59',
      '00722b7c42029a821043bcc0e53931b664877c2f0f6eca207878c36fd8061b9c',
      'b697906c0ae4e5fc37a207d20f66bfb6b5f311fc1c7ac90f98894cfbb0ed2ca0',
    ]);
    assert.deepEqual([
      HIBACHI_A3.s6Row, HIBACHI_A3.s6Init, HIBACHI_A3.s6Step, HIBACHI_A3.s6End,
      HIBACHI_A3.s7Row, HIBACHI_A3.s7Init, HIBACHI_A3.s7Step, HIBACHI_A3.s7End,
      HIBACHI_A3.s6Step - HIBACHI_A3.s6Init,
      HIBACHI_A3.s6End - HIBACHI_A3.s6Step,
      HIBACHI_A3.s7Step - HIBACHI_A3.s7Init,
      HIBACHI_A3.s7End - HIBACHI_A3.s7Step,
      HIBACHI_A3.s6Selector, HIBACHI_A3.s7Selector,
    ], [
      0x2a54c2, 0x2a5758, 0x2a5764, 0x2a5784,
      0x2a54ca, 0x2a5784, 0x2a5790, 0x2a57b0,
      12, 32, 12, 32, 0x0132, 0x0138,
    ]);
    assert.equal(HIBACHI_A3.s6End, HIBACHI_A3.s7Init);
    assert.deepEqual([
      ROM.u32(HIBACHI_A3.table + 6 * 8), ROM.u32(HIBACHI_A3.table + 6 * 8 + 4),
      ROM.u32(HIBACHI_A3.table + 7 * 8), ROM.u32(HIBACHI_A3.table + 7 * 8 + 4),
      IMG.readUInt16BE(HIBACHI_A3.s6End - 2),
      IMG.readUInt16BE(HIBACHI_A3.s7End - 2),
    ], [
      HIBACHI_A3.s6Init, HIBACHI_A3.s6Step,
      HIBACHI_A3.s7Init, HIBACHI_A3.s7Step,
      0x4e75, 0x4e75,
    ]);

    const registered = scriptAddresses();
    for (const address of [
      HIBACHI_A3.s6Init, HIBACHI_A3.s6Step,
      HIBACHI_A3.s7Init, HIBACHI_A3.s7Step,
    ]) assert.equal(registered.filter((entry) => entry === address).length, 1);

    assert.equal(ROM_WINDOW_COUNT, 1686);
    assert.equal(ROM_OVERLAP_PAIRS, 79);
    assert.equal(TABLE_JSON.rom.windows.length, 1686);
    assert.equal(TABLE_JSON.rom.windows.reduce((total, window) => total + window.len, 0), 651517);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((window) => window.why.startsWith('W583:')), []);
  });

test('W583 paired init fallthrough and later dispatches keep the exact cadence',
  { skip: SKIP }, () => {
    const b = bench({ a3: HIBACHI_A3.table });
    assert.equal(a3Start259962(b.ram, 6), true);
    assert.equal(a3Start259962(b.ram, 7), true);
    const s6 = SCHED.a3Base;
    const s7 = SCHED.a3Base + SCHED.a3Stride;
    b.ram.setU16(s6 + 0x02, 0xbeef);
    b.ram.setU16(s7 + 0x02, 0xcafe);
    b.ram.setU16(SUB + HIBACHI_A3.s6Selector, 0xdead);
    b.ram.setU16(SUB + HIBACHI_A3.s7Selector, 0xbabe);

    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A3.s6Init, HIBACHI_A3.s7Init]);
    assert.deepEqual([
      b.ram.u16(s6), b.ram.u16(s7),
      b.ram.u16(s6 + 0x02), b.ram.u16(s7 + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s6Selector),
      b.ram.u16(SUB + HIBACHI_A3.s7Selector),
    ], [0x8106, 0x8107, 0x0101, 0x0101, 4, 4]);

    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(dumpDispatched(), [HIBACHI_A3.s6Step, HIBACHI_A3.s7Step]);
    assert.deepEqual([
      b.ram.u16(s6 + 0x02), b.ram.u16(s7 + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s6Selector),
      b.ram.u16(SUB + HIBACHI_A3.s7Selector),
    ], [0x0001, 0x0001, 4, 4]);

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual([
      b.ram.u16(s6 + 0x02), b.ram.u16(s7 + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s6Selector),
      b.ram.u16(SUB + HIBACHI_A3.s7Selector),
    ], [0x0101, 0x0101, 8, 8]);
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual([
      b.ram.u16(s6 + 0x02), b.ram.u16(s7 + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s6Selector),
      b.ram.u16(SUB + HIBACHI_A3.s7Selector),
    ], [0x0001, 0x0001, 8, 8]);
  });

test('W583 byte borrow, equality-only reset, and word wrapping are literal',
  { skip: SKIP }, () => {
    const b = bench();
    const a4 = SCHED.a3Base;

    b.ram.setU16(a4 + 0x02, 0x0107);
    b.ram.setU16(SUB + HIBACHI_A3.s6Selector, 4);
    a3s6Step2A5764(b.ram, b.ctx, a4);
    assert.deepEqual([
      b.ram.u16(a4 + 0x02), b.ram.u16(SUB + HIBACHI_A3.s6Selector),
    ], [0x0007, 4]);
    a3s6Step2A5764(b.ram, b.ctx, a4);
    assert.deepEqual([
      b.ram.u16(a4 + 0x02), b.ram.u16(SUB + HIBACHI_A3.s6Selector),
    ], [0x0707, 8]);

    for (const [step, selector, reset, exactStart, offStart] of [
      [a3s6Step2A5764, HIBACHI_A3.s6Selector, 0x0020, 0x001c, 0x001d],
      [a3s7Step2A5790, HIBACHI_A3.s7Selector, 0x0040, 0x003c, 0x003d],
    ]) {
      b.ram.setU16(a4 + 0x02, 0x0001);
      b.ram.setU16(SUB + selector, exactStart);
      step(b.ram, b.ctx, a4);
      assert.deepEqual([
        b.ram.u16(a4 + 0x02), b.ram.u16(SUB + selector),
      ], [0x0101, 0], `exact $${reset.toString(16)} equality resets`);

      b.ram.setU16(a4 + 0x02, 0x0001);
      b.ram.setU16(SUB + selector, offStart);
      step(b.ram, b.ctx, a4);
      assert.equal(b.ram.u16(SUB + selector), reset + 1,
        'an off-sequence value is not range-canonicalized');

      b.ram.setU16(a4 + 0x02, 0x0001);
      b.ram.setU16(SUB + selector, 0xfffe);
      step(b.ram, b.ctx, a4);
      assert.equal(b.ram.u16(SUB + selector), 0x0002,
        'selector addition wraps as a 16-bit word');
    }
  });

test('W583 both scripts persist with only timer and selector writes',
  { skip: SKIP }, () => {
    const b = bench();
    const s6 = SCHED.a3Base;
    const s7 = SCHED.a3Base + SCHED.a3Stride;
    b.ram.setU16(s6, 0x8106);
    b.ram.setU16(s7, 0x8107);
    b.ram.setU16(s6 + 0x02, 0xbeef);
    b.ram.setU16(s7 + 0x02, 0xcafe);
    b.ram.setU16(SUB + HIBACHI_A3.s6Selector, 0xdead);
    b.ram.setU16(SUB + HIBACHI_A3.s7Selector, 0xbabe);
    b.ram.setU16(RNG_STATE, 0x5aa5);
    b.ram.setU16(0x8130d2, 0x1357);
    for (let offset = 0; offset < 0x62; offset++) {
      b.ram.setU8(RAM.player1 + offset, (offset * 3 + 1) & 0xff);
      b.ram.setU8(RAM.player2 + offset, (offset * 5 + 2) & 0xff);
    }
    const before = Uint8Array.from(b.ram.b);

    a3s6Init2A5758(b.ram, b.ctx, s6);
    a3s7Init2A5784(b.ram, b.ctx, s7);
    for (let dispatch = 0; dispatch < 400; dispatch++) {
      a3s6Step2A5764(b.ram, b.ctx, s6);
      a3s7Step2A5790(b.ram, b.ctx, s7);
    }

    const changed = [];
    for (let offset = 0; offset < b.ram.b.length; offset++) {
      if (b.ram.b[offset] !== before[offset]) changed.push(0x800000 + offset);
    }
    assert.deepEqual(changed, [
      s6 + 0x02, s6 + 0x03, s7 + 0x02, s7 + 0x03,
      SUB + HIBACHI_A3.s6Selector, SUB + HIBACHI_A3.s6Selector + 1,
      SUB + HIBACHI_A3.s7Selector, SUB + HIBACHI_A3.s7Selector + 1,
    ].sort((a, z) => a - z));
    assert.deepEqual([
      b.ram.u16(s6), b.ram.u16(s7), b.ram.u16(RNG_STATE), b.ram.u16(0x8130d2),
      b.ram.u8(RAM.player1 + P.state), b.ram.u8(RAM.player2 + P.state),
      b.sounds.length,
    ], [0x8106, 0x8107, 0x5aa5, 0x1357,
      before[RAM.player1 + P.state - 0x800000],
      before[RAM.player2 + P.state - 0x800000], 0]);
  });

test('W583 scheduler gates and ordering run id 6, then id 7, then A2',
  { skip: SKIP }, () => {
    const primary = BUCKETS[1];
    const b = bench({ a2: HIBACHI_A2.table, a3: HIBACHI_A3.table });
    armFamilyAndRenderer(b);
    const selectorWrites = [];
    const setU16 = b.ram.setU16.bind(b.ram);
    b.ram.setU16 = (address, value) => {
      if (address === SUB + HIBACHI_A3.s6Selector
        || address === SUB + HIBACHI_A3.s7Selector) selectorWrites.push(address);
      setU16(address, value);
    };
    clearDispatched();
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.deepEqual(selectorWrites, [
      SUB + HIBACHI_A3.s6Selector, SUB + HIBACHI_A3.s6Selector,
      SUB + HIBACHI_A3.s7Selector, SUB + HIBACHI_A3.s7Selector,
    ]);
    assert.deepEqual(dumpDispatched(), [
      HIBACHI_A2.object16, HIBACHI_A3.s6Init, HIBACHI_A3.s7Init,
    ].sort((a, z) => a - z));
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base), b.ram.u16(SCHED.a3Base + SCHED.a3Stride),
      b.ram.u16(SCHED.a3Base + 0x02),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride + 0x02),
      b.ram.u16(SUB + HIBACHI_A3.s6Selector),
      b.ram.u16(SUB + HIBACHI_A3.s7Selector),
      b.ram.u16(primary.counter), b.ram.u32(primary.buffer + 4),
    ], [0x8106, 0x8107, 0x0101, 0x0101, 4, 4,
      RECORD_BYTES, ROM.u32(HIBACHI_A2.object16Art + 4)]);

    const suspended = bench({ a2: HIBACHI_A2.table, a3: HIBACHI_A3.table });
    armFamilyAndRenderer(suspended);
    suspended.ram.setU16(SCHED.suspend, 1);
    assert.equal(runScheduler25962E(suspended.ram, ROM, suspended.ctx), true);
    assert.deepEqual([
      suspended.ram.u16(SCHED.a3Base),
      suspended.ram.u16(SCHED.a3Base + SCHED.a3Stride),
      suspended.ram.u16(SUB + HIBACHI_A3.s6Selector),
      suspended.ram.u16(SUB + HIBACHI_A3.s7Selector),
      suspended.ram.u16(primary.counter),
    ], [0x8006, 0x8007, 0, 0, 0]);

    const paused = bench({ a2: HIBACHI_A2.table, a3: HIBACHI_A3.table });
    armFamilyAndRenderer(paused);
    paused.ram.setU16(SCHED.deathPause, 1);
    assert.equal(runScheduler25962E(paused.ram, ROM, paused.ctx), false,
      'death pause gates the A3 walk but the separate A2 walk still runs');
    assert.deepEqual([
      paused.ram.u16(SCHED.a3Base), paused.ram.u16(SCHED.a3Base + SCHED.a3Stride),
      paused.ram.u16(SUB + HIBACHI_A3.s6Selector),
      paused.ram.u16(SUB + HIBACHI_A3.s7Selector),
      paused.ram.u16(primary.counter), paused.ram.u32(primary.buffer + 4),
    ], [0x8006, 0x8007, 0, 0, RECORD_BYTES,
      ROM.u32(HIBACHI_A2.object16Art)]);
  });

test('W583 exact LF150131 progression reaches the W587 $291040 frontier',
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
    assert.deepEqual([
      resumed.game.ram.u16(a6 + HIBACHI_A3.s6Selector),
      resumed.game.ram.u16(a6 + HIBACHI_A3.s7Selector),
    ], [0x0018, 0x0018]);
    assert.deepEqual(slotWords(resumed.game.ram,
      SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride), Array(SCHED.a1Slots).fill(0));
    assert.deepEqual([state.ramSha256, state.gameSha256], [
      '7c8e4f3ae55f00a473926624977d95a04734ccd5866e4d5c95a2a0b7ba9c3663',
      'a65ac16f7a925430faa57965b6423c042f622224bc051f04354d9b3c58c1c582',
    ]);
  });
