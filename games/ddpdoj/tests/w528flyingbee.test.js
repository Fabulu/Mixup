// W528: the exact W522 six-pair matrix reaches kind-16's flying-bee arm.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { POOL_A, B, KIND, clearPoolA, runPoolADriver } from '../src/bee.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const ROM = HAVE
  ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom)
  : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';

function sha(addr, length) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(addr, length))).digest('hex');
}

test('W528 kind-16 reloads its cartridge waypoint and crosses $27FCEA',
  { skip: SKIP }, () => {
    assert.equal(sha(0x27fd72, 0x009c),
      '8b1477a6088b230a24dba5335f999469c21703f7494dd8b22b2db1be1309996c');

    const ram = new Ram();
    clearPoolA(ram);
    ram.setU16(POOL_A.scrollShort, 0);
    ram.setU16(0x813172, 0);
    ram.setU16(POOL_A.freeze, 0);

    const a6 = POOL_A.reservedBase;
    ram.setU16(a6 + B.status, 0x8000 | KIND.beeFlying);
    ram.setU32(a6 + B.pos, 0x40002000);
    ram.setU32(a6 + B.sprite, 0x001bca34);
    ram.setU16(a6 + B.blinkTimer, 0);
    ram.setU16(a6 + B.hitCount, 0x9601);
    ram.setU32(a6 + B.waypoint, 0xdeadbeef);
    ram.setU32(a6 + B.layerEmitter, 0xdeadbeef);
    ram.setU16(POOL_A.liveCount, 1);

    const ctx = { ram, rom: ROM, unportedLog: new UnportedLog() };
    const first = runPoolADriver(ram, ROM, ctx);
    assert.equal(first.emitted, 1);
    assert.equal(ram.u16(a6 + B.hitCount), 0x9004,
      'offset $96 loads the final row and its next cursor/timer word');
    assert.equal(ram.u32(a6 + B.waypoint), 0x00000020,
      'the final cartridge row supplies dy=0 and dx=$20');
    assert.equal(ram.u32(a6 + B.pos), 0x3fa02020,
      'the arm subtracts $60, then applies the loaded velocity pair');

    const second = runPoolADriver(ram, ROM, ctx);
    assert.equal(second.emitted, 1);
    assert.equal(ram.u16(a6 + B.hitCount), 0x9003,
      'a non-zero timer keeps the cached row and decrements only its low byte');
    assert.equal(ram.u32(a6 + B.pos), 0x3f402040,
      'the following frame repeats the fixed rise and cached dx');
    assert.deepEqual(ctx.unportedLog.report(), []);
  });
