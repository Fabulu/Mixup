// W245: Stage-4 boss MAIN4 $29F8CC/$29F8F0, which F5's INIT starts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { main4Init29F8CC, main4Step29F8F0 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A5 = 0x814000, A6 = 0x81b732;

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A6 + 0x02, 0x2000);          // the boss's own position
  ram.setU16(A6 + 0x04, 0x1800);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log, soundPost() {}, bulletSpawn() {},
    effectSpawn() {} };
  return { ram, log, ctx };
}

/** Exported for this test, the way boss4.js exports F3's pair for W221's. */
const init = (f, slot) => main4Init29F8CC(f.ram, ROM, f.ctx, slot);
const step = (f, slot) => main4Step29F8F0(f.ram, ROM, f.ctx, slot);

test('W245 MAIN4 is registered and its waypoints end at MAIN5\'s A0 entry',
  { skip: SKIP }, () => {
    for (const a of [0x29f8cc, 0x29f8f0])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    // A0 entry 4 must be the pair we registered, and entry 5 must start exactly
    // where the waypoints end -- which is what bounds them at four.
    assert.deepEqual([ROM.u32(0x29f498 + 4 * 8), ROM.u32(0x29f498 + 4 * 8 + 4)],
      [0x29f8cc, 0x29f8f0]);
    assert.equal(ROM.u32(0x29f498 + 5 * 8), 0x29f982, 'MAIN5 begins at $29F982');
    assert.deepEqual(Array.from({ length: 4 }, (_, i) =>
      [ROM.u16(0x29f972 + i * 4), ROM.u16(0x29f972 + i * 4 + 2)]),
    [[0x6000, 0x0c00], [0x5e00, 0x2e00], [0x5c00, 0x0a00], [0x5a00, 0x2c00]],
    'four waypoints, weaving left and right at descending Y');
    assert.throws(() => ROM.u16(0x29f972 + 0x10), (e) => e.name === 'Unreached');
  });

test('W245 INIT seeds the speed and falls through to its own step',
  { skip: SKIP }, () => {
    const f = fixture();
    const slot = SCHED.seqDst;
    init(f, slot);
    assert.equal(f.ram.u8(A6 + 0x3a), 6, '$29F8EA -- the walk SPEED');
    assert.deepEqual([f.ram.u8(A6 + 0x1a), f.ram.u8(A6 + 0x1b)], [0, 0x20]);
    assert.equal(f.ram.u16(slot + 0x06), 0, 'the waypoint cursor starts at zero');
    // The fall-through is visible: the step slews $3B and moves the OFFSETS.
    assert.notEqual(f.ram.u8(A6 + 0x3b), 0, 'it aimed and slewed on the same frame');
    assert.deepEqual(f.log.report(), [], 'and reached no unported path');
  });

test('W245 the vector moves the PART OFFSETS, not the boss position',
  { skip: SKIP }, () => {
    const f = fixture();
    const slot = SCHED.seqDst;
    init(f, slot);
    const pos = [f.ram.u16(A6 + 0x02), f.ram.u16(A6 + 0x04)];
    const off = [f.ram.u16(A6 + 0x194), f.ram.u16(A6 + 0x196)];
    step(f, slot);
    assert.deepEqual([f.ram.u16(A6 + 0x02), f.ram.u16(A6 + 0x04)], pos,
      '$2(A6) is untouched -- F5 opened the pods and MAIN4 moves THEM');
    assert.notDeepEqual([f.ram.u16(A6 + 0x194), f.ram.u16(A6 + 0x196)], off,
      '$29F966/$29F96A add the vector into $194/$196');
  });

test('W245 the cursor advances only within $400 and wraps after four',
  { skip: SKIP }, () => {
    const f = fixture();
    const slot = SCHED.seqDst;
    init(f, slot);
    // Far from waypoint 0, the cursor must not move: $29F942 cmpi.w #$400 / bgt.
    f.ram.setU16(A6 + 0x02, 0x1000);
    f.ram.setU16(A6 + 0x04, 0x0100);
    f.ram.setU16(A6 + 0x194, 0);
    f.ram.setU16(A6 + 0x196, 0);
    f.ram.setU16(slot + 0x06, 0);
    step(f, slot);
    assert.equal(f.ram.u16(slot + 0x06), 0, 'too far, so it stays');

    // Sitting ON each waypoint in turn walks the cursor 0 -> 4 -> 8 -> $C -> 0.
    const seen = [];
    for (let n = 0; n < 5; n++) {
      const c = f.ram.u16(slot + 0x06);
      seen.push(c);
      f.ram.setU16(A6 + 0x02, u16(ROM.u16(0x29f972 + c) - f.ram.u16(A6 + 0x194)));
      f.ram.setU16(A6 + 0x04, u16(ROM.u16(0x29f972 + c + 2) - f.ram.u16(A6 + 0x196)));
      step(f, slot);
    }
    assert.deepEqual(seen, [0, 4, 8, 0x0c, 0], 'four waypoints, then round again');
  });
