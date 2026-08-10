// W222: Stage-4 boss mirrored A1/E1 and E2 attack families.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler } from '../src/handlers.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { RAM, P } from '../src/machine.js';
import { buildDisplayList } from '../src/displaylist.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

function sha(at, len) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(at, len))).digest('hex');
}

function firstAttackFixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  const bullets = [];
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(0x813096, 12);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x02e8);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x236498);
  runSpawnWalker(ram, ROM, log, MT, undefined, palette);
  const a5 = Array.from({ length: ENEMY.slots }, (_, n) => ENEMY.table + n * ENEMY.stride)
    .find((a) => ram.u16(a) !== 0 && ram.u8(a + 0x0c) === 0x40);
  const a6 = ram.u32(a5 + 0x06);
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    palette, soundPost() {}, effectSpawn() {},
    bulletSpawn(site, result) { bullets.push({ site, result }); } };
  runHandler(0x29ef0a, ram, ROM, a5, ctx);
  ram.setU16(RAM.player1, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  ram.setU8(SCHED.seqDst + 0x06, 1);
  ram.setU8(SCHED.seqDst + 0x0c, 0);
  ram.setU8(SCHED.seqDst + 0x0d, 1);
  ram.setU16(a6 + 0x128, 0x001c);
  ram.setU16(SCHED.a2Base + 10 * SCHED.a2Stride, 0x8000);
  ram.setU16(SCHED.a2Base + 11 * SCHED.a2Stride, 0x8001);
  runHandler(0x29ef0a, ram, ROM, a5, ctx);
  return { ram, a5, a6, ctx, bullets };
}

function stepBossFrame(ram, a5, ctx) {
  runHandler(0x29ef0a, ram, ROM, a5, ctx);
  buildDisplayList(ram);
}

test('W222 pins and registers both complete attack families', { skip: SKIP }, () => {
  for (const addr of [0x2a17e6, 0x2a17f8, 0x2a20a8, 0x2a20ba])
    assert.ok(scriptAddresses().includes(addr), `$${addr.toString(16)} registered`);
  assert.equal(sha(0x2a16a4, 0x7c),
    '2e19f16b94d3ef1419474edc97a9e5b7c11e1293d5dd36a1b0430f1d2e5ceef7');
  assert.equal(sha(0x2a1778, 0x20),
    '2161845c7340cc83ec6b47a5e2a924b392bbd2061af408c045adab3e9afce957');
  assert.equal(sha(0x2a17e6, 0x1026),
    '75349125df47ba688db0566dcb5de06b94e3865db575eb40e2704d221f12fff5');
});

test('W222 natural F3 cadence emits the first mirrored E1 and E2 volleys',
  { skip: SKIP }, () => {
    const { ram, a5, a6, ctx, bullets } = firstAttackFixture();
    for (let frame = 0; frame < 180 && bullets.length < 60; frame++)
      stepBossFrame(ram, a5, ctx);
    assert.equal(bullets.length, 60, 'two 30-shot parameter-zero volleys');
    assert.equal(bullets[0].site, 0x2a1896, 'E1 left fan begins first');
    assert.equal(bullets[30].site, 0x2a2158, 'E2 mirrored fan begins second');
    assert.equal(ram.u16(SCHED.a4Base) & 0xff, 3, 'F3 remains active');
  });

test('W222 all four E1/E2 modes retire F3 at the authentic F4 frontier',
  { skip: SKIP }, () => {
    const { ram, a5, ctx } = firstAttackFixture();
    let reached = false;
    for (let frame = 0; frame < 2400 && !reached; frame++) {
      stepBossFrame(ram, a5, ctx);
      reached = Array.from({ length: SCHED.a4Slots }, (_, n) =>
        ram.u16(SCHED.a4Base + n * SCHED.a4Stride) & 0xff).includes(4);
    }
    assert.ok(reached, 'the natural attack cycle arms F4');
    assert.ok(scriptAddresses().includes(0x2a0bcc), 'the W223 frontier is now registered');
  });
