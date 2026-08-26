// W601: genuine P2 creation keeps allocator identity and uses the cartridge P2 shot pool.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RAM, P } from '../src/machine.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { ALLOC } from '../src/objalloc.js';
import {
  TALLY, bonusLine326010E, bonusLine42601F4,
} from '../src/tally.js';
import { SHOT } from '../src/weapons.js';
import { SPAWN, PS, spawnShot, spawnShotTypeB } from '../src/shots.js';

const TABLES_URL = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(TABLES_URL);
const TABLES = HAVE ? JSON.parse(readFileSync(TABLES_URL, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(TABLES.rom) : null;
const SKIP = HAVE ? false : 'rip/port/player.tables.json is not built';

function world() {
  const ram = new Ram();
  deferReset(ram);
  const unportedLog = new UnportedLog();
  return { ram, ctx: { ram, rom: ROM, unportedLog } };
}

function seedTally(ram, rec, type, row) {
  ram.setU32(rec + TALLY.ptr, 0x81f000 + row * 2);
  ram.setU16(rec + TALLY.type, type);
  ram.setU8(rec + TALLY.row, row);
  ram.setU16(rec + TALLY.argA, 0x2345);
  ram.setU16(rec + TALLY.argB, 0x3456);
}

function assertDummyFill(ram, loopByte, row) {
  assert.equal(ram.u8(ALLOC.createDummy + 0x06), loopByte);
  assert.equal(ram.u8(ALLOC.createDummy + 0x07), row);
  assert.equal(ram.u16(ALLOC.createDummy + 0x08), 0x2345);
  assert.equal(ram.u16(ALLOC.createDummy + 0x0a), 0x3456);
}

test('W601 tally requests 3 and 4 store allocator IDs and zero a refused handle',
  { skip: SKIP }, () => {
    for (const [request, rec, type, row] of [
      [bonusLine326010E, TALLY.side0, 2, 0],
      [bonusLine42601F4, TALLY.side1, 3, 1],
    ]) {
      const made = world();
      seedTally(made.ram, rec, type, row);
      made.ram.setU32(ALLOC.idCounter, 0x12345670 + row);
      const staged = request(made.ram, ROM, made.ctx, rec);
      assert.equal(staged, ALLOC.createStage);
      assert.equal(made.ram.u32(rec + TALLY.result), 0x12345671 + row,
        'the tally stores the unique allocator ID, not type | $8000');
      assert.equal(made.ram.u32(staged + ALLOC.idOff), 0x12345671 + row);

      const refused = world();
      seedTally(refused.ram, rec, type, row);
      refused.ram.setU16(ALLOC.createSp, ALLOC.createCap);
      refused.ram.setU8(0x813099, 2);
      refused.ram.setU32(rec + TALLY.result, 0xffffffff);
      assert.equal(request(refused.ram, ROM, refused.ctx, rec), null);
      assert.equal(refused.ram.u32(rec + TALLY.result), 0,
        'the cartridge full-queue arm stores D0 = 0');
      assertDummyFill(refused.ram, request === bonusLine42601F4 ? 2 : 0, row);
    }
  });

function seedPlayerShot(ram, player, style) {
  ram.setU16(player + P.state, 0);
  ram.setU16(player + P.posY, 0x1179);
  ram.setU16(player + P.posX, 0x14c0);
  ram.setU16(player + PS.power, 0);
  ram.setU16(player + PS.animPhase, 8);
  ram.setU16(player + PS.animIdx, 4);
  ram.setU8(player + PS.powerByte, 2);
  ram.setU16(player + PS.formation, style);
  ram.setU32(SPAWN.countPtrP1, 0xdeadbeef);
  ram.setU32(SPAWN.countPtrP2, 0x255278);
  ram.setU16(SPAWN.gate308c, 1);
}

function liveRecords(ram, table) {
  const out = [];
  for (let slot = 0; slot < SHOT.slots; slot++) {
    const rec = table + slot * SHOT.stride;
    if ((ram.u16(rec) & 0x8000) !== 0) out.push(rec);
  }
  return out;
}

test('W601 native owner 1 uses only P2 shots and logical owner 2 never aliases it',
  { skip: SKIP }, () => {
    for (const [ship, spawn] of [[0, spawnShot], [2, spawnShotTypeB]]) {
      const ram = new Ram();
      seedPlayerShot(ram, RAM.player2, 2);
      spawn(ram, ROM, RAM.player2, { soundPost() {} }, { player: 1 });
      assert.equal(liveRecords(ram, SHOT.p1Table).length, 0,
        `ship ${ship}, owner 1 leaves every P1 shot slot untouched`);
      assert.equal(liveRecords(ram, SHOT.p2Table).length, 2,
        `ship ${ship}, owner 1 allocates both authentic muzzles in the P2 table`);

      const rejected = new Ram();
      seedPlayerShot(rejected, RAM.player2, 2);
      assert.throws(
        () => spawn(rejected, ROM, RAM.player2, { soundPost() {} }, { player: 2 }),
        /native shot owner 2 is outside \{0, 1\}/,
      );
      assert.equal(liveRecords(rejected, SHOT.p1Table).length, 0);
      assert.equal(liveRecords(rejected, SHOT.p2Table).length, 0);
    }
  });
