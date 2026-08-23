// W522: first authentic-pair progression blocker, Stage-3 type $3D.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { initDispatch, SPAWN } from '../src/spawn.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { ENEMY } from '../src/enemies.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = ENEMY.bandCommon;

function sha(addr, length) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(addr, length))).digest('hex');
}

test('W522 type-$3D dispatch crosses the former $26725C blocker and runs one live frame',
  { skip: SKIP }, () => {
    assert.ok(INIT_BODY_ADDRESSES.includes(0x267262));
    assert.ok(HANDLER_ADDRESSES.includes(0x2673fa));
    assert.equal(sha(0x26725a, 8),
      'ee4a0dc1480f4bc134b0d62e87bd8aac25a9b6b5a7e3b15b04291aa7b27af0b8');
    assert.equal(sha(0x267366, 0x46),
      'f27bc211834436e1bd6099883dfc90ffadf7458c3e2127937f76cbba5a7c3fc7');

    const ram = new Ram();
    ram.setU16(A5, 0x803d);
    ram.setU8(A5 + 0x0c, 0x3d);
    ram.setU8(A5 + 0x0d, 0);
    ram.setU16(0x813092, 2);
    ram.setU16(0x813094, 4);
    ram.setU16(SPAWN.DISTANCE_CLOCK, 0);
    const unported = new UnportedLog();
    const result = initDispatch(ram, ROM, A5, unported, undefined, MT);

    assert.deepEqual(result,
      { init: 0x26725a, initBody: 0x267262, runLen: 0, failed: false });
    assert.equal(ram.u32(A5 + ENEMY.handlerOff), 0x2673fa);
    assert.equal(ram.u32(A5 + 0x2a), 0x23d79e);
    assert.equal(ram.u32(A5 + 0x2e), 0x23defc);

    const a6 = ram.u32(A5 + 6);
    assert.equal(ram.u16(a6), 0xa200);
    assert.doesNotThrow(() => runHandler(0x2673fa, ram, ROM, A5,
      { tables: MT, unported }));
    assert.equal(ram.u16(A5 + 0x16), 1, 'the first in-bounds frame arms despawn');
    assert.ok(BUCKETS.some((bucket) => ram.u16(bucket.counter) !== 0),
      'the live handler reaches its cartridge-selected sprite emitter');
  });
