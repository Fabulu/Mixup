// W251: Stage-4 boss MAIN7 $29F9B4/$29F9CC, MAIN4's twin with a speed ramp.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { main4Init29F8CC, main4Step29F8F0,
  main7Init29F9B4, main7Step29F9CC } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A0_TABLE = 0x29f498;
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.seqDst;

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A6 + 0x02, 0x2000);
  ram.setU16(A6 + 0x04, 0x1800);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log, soundPost() {}, bulletSpawn() {},
    effectSpawn() {} };
  return { ram, log, ctx };
}

const step = (f) => main7Step29F9CC(f.ram, ROM, f.ctx, SLOT);

test('W251 MAIN7 is registered and its waypoints end at MAIN8\'s A0 entry',
  { skip: SKIP }, () => {
    for (const a of [0x29f9b4, 0x29f9cc])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(A0_TABLE + 7 * 8), ROM.u32(A0_TABLE + 7 * 8 + 4)],
      [0x29f9b4, 0x29f9cc]);
    assert.equal(ROM.u32(A0_TABLE + 8 * 8), 0x29fa8a, 'MAIN8 begins at $29FA8A');
    assert.deepEqual(Array.from({ length: 4 }, (_, i) =>
      [ROM.u16(0x29fa7a + i * 4), ROM.u16(0x29fa7a + i * 4 + 2)]),
    [[0x6800, 0x1a00], [0x6600, 0x1e00], [0x6400, 0x1800], [0x6200, 0x2000]],
    'four waypoints, weaving at descending Y, and lower down than MAIN4\'s');
    assert.throws(() => ROM.u16(0x29fa7a + 0x10), (e) => e.name === 'Unreached',
      'and the window stops where MAIN8 starts');
  });

test('W251 the ramp takes one off the speed every ninth frame and floors at 2',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU8(A6 + 0x3a, 6);                  // what MAIN4's INIT leaves behind
    main7Init29F9B4(f.ram, ROM, f.ctx, SLOT);
    assert.equal(f.ram.u8(A6 + 0x3a), 6,
      '$29F9C6 left 8 and `bcc` borrows only out of zero, so no ramp yet');
    assert.equal(f.ram.u8(SLOT + 0x08), 7, 'and the arming frame spent one');
    // Walk the whole ramp and record which frames it moved on.
    const drops = [];
    let prev = 6;
    for (let n = 1; n <= 60; n++) {
      step(f);
      if (f.ram.u8(A6 + 0x3a) !== prev) { drops.push(n); prev = f.ram.u8(A6 + 0x3a); }
    }
    assert.deepEqual(drops, [8, 17, 26, 35],
      'every ninth frame, four times, and then it stops');
    assert.equal(f.ram.u8(A6 + 0x3a), 2, '$29F9F2 -- the FLOOR');
  });

test('W251 an already-floored speed costs nothing, and an odd one is pinned',
  { skip: SKIP }, () => {
    // $29F9DA's `beq` is checked BEFORE the decrement, so a speed of 2 is left alone
    // rather than taken to 1 and pinned back.
    const f = fixture();
    f.ram.setU8(A6 + 0x3a, 2);
    main7Init29F9B4(f.ram, ROM, f.ctx, SLOT);
    for (let n = 0; n < 20; n++) step(f);
    assert.equal(f.ram.u8(A6 + 0x3a), 2, 'it never dips below and never wraps');

    // And $29F9E8's `bgt` pins rather than compares for equality: 3 -> 2 stays 2.
    const g = fixture();
    g.ram.setU8(A6 + 0x3a, 3);
    main7Init29F9B4(g.ram, ROM, g.ctx, SLOT);
    for (let n = 0; n < 20; n++) step(g);
    assert.equal(g.ram.u8(A6 + 0x3a), 2);
  });

test('W251 it walks the same four waypoints on a TIGHTER threshold than MAIN4',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU8(A6 + 0x3a, 6);
    // Start the heading deliberately wrong. Asserting it becomes non-zero would be
    // wrong here: waypoint 0 is $6800/$1A00 and self is $2000/$1800, which is very
    // nearly straight down, so a settled heading of 0 is the CORRECT answer.
    f.ram.setU8(A6 + 0x3b, 0x20);
    main7Init29F9B4(f.ram, ROM, f.ctx, SLOT);
    assert.notEqual(f.ram.u8(A6 + 0x3b), 0x20,
      '$29F9FE aimed and $242190 took one step off it on the INIT frame');

    // Park exactly $300 away on the long axis: inside MAIN4's $400 and OUTSIDE
    // MAIN7's $200, so the cursor must NOT advance. Getting the threshold from the
    // sibling would move it here.
    f.ram.setU16(SLOT + 0x06, 0);
    f.ram.setU16(A6 + 0x194, 0);
    f.ram.setU16(A6 + 0x196, 0);
    f.ram.setU16(A6 + 0x02, u16(0x6800 - 0x300));
    f.ram.setU16(A6 + 0x04, 0x1a00);
    step(f);
    assert.equal(f.ram.u16(SLOT + 0x06), 0, '$300 is too far for $29FA4A\'s #$200');

    // Sitting on each waypoint walks the cursor 0 -> 4 -> 8 -> $C -> 0.
    const seen = [];
    for (let n = 0; n < 5; n++) {
      const c = f.ram.u16(SLOT + 0x06);
      seen.push(c);
      f.ram.setU16(A6 + 0x02, u16(ROM.u16(0x29fa7a + c) - f.ram.u16(A6 + 0x194)));
      f.ram.setU16(A6 + 0x04, u16(ROM.u16(0x29fa7a + c + 2) - f.ram.u16(A6 + 0x196)));
      step(f);
    }
    assert.deepEqual(seen, [0, 4, 8, 0x0c, 0], 'four waypoints, then round again');
  });

test('W251 the vector moves the PART OFFSETS, exactly as MAIN4 does', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU8(A6 + 0x3a, 6);
  main7Init29F9B4(f.ram, ROM, f.ctx, SLOT);
  const pos = [f.ram.u16(A6 + 0x02), f.ram.u16(A6 + 0x04)];
  const off = [f.ram.u16(A6 + 0x194), f.ram.u16(A6 + 0x196)];
  step(f);
  assert.deepEqual([f.ram.u16(A6 + 0x02), f.ram.u16(A6 + 0x04)], pos,
    '$2(A6) is untouched -- what walks is the opened pods');
  assert.notDeepEqual([f.ram.u16(A6 + 0x194), f.ram.u16(A6 + 0x196)], off);
  assert.deepEqual(f.log.report(), []);
});

test('W251 MAIN4 keeps its OWN threshold now that the walker is shared',
  { skip: SKIP }, () => {
    // The two bodies differ in exactly one operand, so the shared walker has to be
    // told which. $300 away is OUTSIDE MAIN7's $200 (asserted above) and INSIDE
    // MAIN4's $400 -- the mirror case, and the one a collapsed threshold would break.
    const f = fixture();
    main4Init29F8CC(f.ram, ROM, f.ctx, SLOT);
    f.ram.setU16(SLOT + 0x06, 0);
    f.ram.setU16(A6 + 0x194, 0);
    f.ram.setU16(A6 + 0x196, 0);
    f.ram.setU16(A6 + 0x02, u16(0x6000 - 0x300));      // waypoint 0 is $6000/$0C00
    f.ram.setU16(A6 + 0x04, 0x0c00);
    main4Step29F8F0(f.ram, ROM, f.ctx, SLOT);
    assert.equal(f.ram.u16(SLOT + 0x06), 4,
      '$300 is inside $29F942\'s #$400, so MAIN4 advances where MAIN7 does not');
  });
