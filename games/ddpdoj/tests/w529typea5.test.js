// W529: the exact W522 matrix reaches deferred Stage-4 enemy type $A5.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { initDispatch } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { runHandler, HANDLER_ADDRESSES, TYPE_SPECS } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const TABLES = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';

function sha(addr, length) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(addr, length))).digest('hex');
}

function seedTypeA5({ discard = false } = {}) {
  const ram = new Ram();
  const log = new UnportedLog();
  const a5 = ENEMY.bandCommon;
  ram.setU16(a5, 0x80a5);
  ram.setU8(a5 + 0x0c, 0xa5);
  ram.setU32(a5 + 0x12, 0);
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(0x813098, 0);
  ram.setU16(0x8130bc, 4);
  ram.setU16(0x8130dc, discard ? 1 : 0);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x4000);
  ram.setU16(0x8103ea, 0x2000);
  return { ram, log, a5 };
}

test('W529 deferred type $A5 crosses $2783F0 and runs its cartridge family',
  { skip: SKIP }, () => {
    assert.equal(sha(0x2783ee, 0x0008),
      'ee4a0dc1480f4bc134b0d62e87bd8aac25a9b6b5a7e3b15b04291aa7b27af0b8');
    assert.equal(sha(0x278490, 0x0038),
      'bc983aca08fbd71f336baa06dbe0f73b393de781855c6e1bc568e75a57f52880');
    assert.equal(sha(0x2786e2, 0x0180),
      '220e91f59f21ef040d59b9fed265f6bf28b99ea5f6983fae7f8fa376eea9e084');
    assert.deepEqual([ROM.u32(0x27e53a), ROM.u32(0x27e53e)],
      [0x2783ee, 0x2784c8]);
    assert.ok(INIT_BODY_ADDRESSES.includes(0x2783f6));
    assert.ok(HANDLER_ADDRESSES.includes(0x2784c8));
    assert.deepEqual(TYPE_SPECS.get(0xa5), {
      init: 0x2783ee, initBody: 0x2783f6, handler: 0x2784c8,
      spriteTable: 0x2786e2, artTable: 0x278762, muzzleTable: 0x2787e2,
    });

    const { ram, log, a5 } = seedTypeA5();
    const init = initDispatch(ram, ROM, a5, log, undefined, TABLES);
    assert.deepEqual(init,
      { init: 0x2783ee, initBody: 0x2783f6, runLen: 0, failed: false });
    const a6 = ram.u32(a5 + 0x06);
    assert.equal(a6, 0x81459c);
    assert.equal(ram.u32(a5 + 0x4c), 0x2784c8);
    assert.deepEqual([
      ram.u8(a5 + 0x18), ram.u8(a5 + 0x19),
      ram.u8(a5 + 0x1a), ram.u8(a5 + 0x1b),
      ram.u32(a5 + 0x22), ram.u16(a5 + 0x26),
      ram.u8(a5 + 0x27), ram.u32(a5 + 0x44),
    ], [0x0d, 0x12, 0x0e, 0x1c, 0x00169820, 0x0007, 0x07, 0x2784c8]);
    assert.deepEqual([
      ram.u16(a6), ram.u32(a6 + 0x0a), ram.u16(a6 + 0x18),
      ram.u8(a6 + 0x1a), ram.u8(a6 + 0x1b),
    ], [0xa201, 0x00168520, 0x0070, 0x10, 0x00]);

    ram.setU32(a6 + 0x02, 0x20002000);
    ram.setU16(a6 + 0x18, 0x0100);
    ram.setU32(0x8130d2, 1);
    runHandler(0x2784c8, ram, ROM, a5,
      { tables: TABLES, unported: log, soundPost() {} });
    assert.equal(ram.u16(a5), 0x80a5);
    assert.equal(ram.u8(a5 + 0x16), 1);
    assert.equal(ram.u8(a6 + 0x1d), 0x0d);
    assert.equal(ram.u16(BUCKETS[7].counter), 12);
    assert.deepEqual(log.report(), []);

    const killed = seedTypeA5({ discard: true });
    const discarded = initDispatch(killed.ram, ROM, killed.a5, killed.log,
      undefined, TABLES);
    assert.deepEqual(discarded,
      { init: 0x2783ee, initBody: 0x2783f6, runLen: 0, failed: false, freed: true });
    assert.equal(killed.ram.u16(killed.a5), 0);
    assert.deepEqual(killed.log.report(), []);
  });
