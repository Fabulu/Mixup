// W262: Stage-4 boss MAIN8 $29FA8A/$29FAAE, the walker with eight waypoints.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { main4Init29F8CC, main4Step29F8F0,
  main8Init29FA8A, main8Step29FAAE } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A0_TABLE = 0x29f498;
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.seqDst;
const WP = 0x29fb3a;
const EXPECT = [[0x6600, 0x1a00], [0x6400, 0x2000], [0x6200, 0x1800], [0x6000, 0x1e00],
  [0x5e00, 0x1800], [0x6000, 0x2000], [0x6200, 0x1a00], [0x6400, 0x2000]];

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A6 + 0x02, 0x2000);
  ram.setU16(A6 + 0x04, 0x1800);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log, soundPost() {}, bulletSpawn() {} };
  return { ram, log, ctx };
}
const step = (f) => main8Step29FAAE(f.ram, ROM, f.ctx, SLOT);

/** Park exactly on the waypoint the cursor points at, so the next step advances it. */
function sitOnWaypoint(f) {
  const c = f.ram.u16(SLOT + 0x06);
  f.ram.setU16(A6 + 0x02, u16(ROM.u16(WP + c) - f.ram.u16(A6 + 0x194)));
  f.ram.setU16(A6 + 0x04, u16(ROM.u16(WP + c + 2) - f.ram.u16(A6 + 0x196)));
}

test('W262 MAIN8 is registered and its EIGHT waypoints abut the next window',
  { skip: SKIP }, () => {
    for (const a of [0x29fa8a, 0x29faae])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(A0_TABLE + 8 * 8), ROM.u32(A0_TABLE + 8 * 8 + 4)],
      [0x29fa8a, 0x29faae]);
    assert.deepEqual(Array.from({ length: 8 },
      (_, i) => [ROM.u16(WP + i * 4), ROM.u16(WP + i * 4 + 2)]), EXPECT,
    'eight, where MAIN4 and MAIN7 have four apiece');
    assert.equal(WP + 0x20, 0x29fb5a);
    assert.doesNotThrow(() => ROM.u32(0x29fb5a), 'and the next window starts there');
    // It weaves in the middle of the band its two siblings sweep through.
    const ys = EXPECT.map(([y]) => y);
    assert.deepEqual([Math.min(...ys), Math.max(...ys)], [0x5e00, 0x6600]);
  });

test('W262 INIT falls through, sets the speed, and starts on waypoint ONE',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU8(A6 + 0x3a, 2);                 // whatever MAIN7's ramp wore it down to
    main8Init29FA8A(f.ram, ROM, f.ctx, SLOT);
    assert.equal(f.ram.u8(A6 + 0x3a), 4,
      '$29FAA8 -- unlike MAIN7 it DOES reset the walk speed');
    assert.equal(f.ram.u16(SLOT + 0x06), 4,
      '$29FAA2 -- the cursor starts at 4, so waypoint ONE and not zero');
    assert.deepEqual([f.ram.u8(A6 + 0x1a), f.ram.u8(A6 + 0x1b)], [0, 0x20]);
    assert.deepEqual(f.log.report(), [], 'and reached no unported path');
  });

test('W262 the cursor walks ALL EIGHT and then resets', { skip: SKIP }, () => {
  const f = fixture();
  main8Init29FA8A(f.ram, ROM, f.ctx, SLOT);
  f.ram.setU16(SLOT + 0x06, 0);
  f.ram.setU16(A6 + 0x194, 0);
  f.ram.setU16(A6 + 0x196, 0);
  const seen = [];
  for (let n = 0; n < 9; n++) {
    seen.push(f.ram.u16(SLOT + 0x06));
    sitOnWaypoint(f);
    step(f);
  }
  assert.deepEqual(seen, [0, 4, 8, 0x0c, 0x10, 0x14, 0x18, 0x1c, 0],
    '$29FB08/$29FB0C -- eight entries, then round again');
});

test('W262 the bound is a COMPARE, not a mask, and $1C is admitted',
  { skip: SKIP }, () => {
    // `$29FB0C cmpi.w #$1C,$6(a4) / ble` keeps $1C and resets anything past it. An
    // `andi.w #$1F` would look equivalent and would let the cursor reach $20 -- a ninth
    // entry that does not exist and whose read would leave the window.
    const f = fixture();
    main8Init29FA8A(f.ram, ROM, f.ctx, SLOT);
    f.ram.setU16(SLOT + 0x06, 0x18);
    f.ram.setU16(A6 + 0x194, 0);
    f.ram.setU16(A6 + 0x196, 0);
    sitOnWaypoint(f);
    step(f);
    assert.equal(f.ram.u16(SLOT + 0x06), 0x1c, '$1C is the LAST entry, not past the end');
    sitOnWaypoint(f);
    step(f);
    assert.equal(f.ram.u16(SLOT + 0x06), 0, 'and only then does it reset');
    // ...and the eighth entry really is readable, which is what makes $1C legal.
    assert.doesNotThrow(() => ROM.u32(WP + 0x1c));
    // A NINTH read would NOT throw: $29FB5A is the first byte of an already-exported
    // window, so a wrong bound would silently walk the boss to coordinates taken from
    // unrelated data. The `Unreached` guard cannot catch this one, which is exactly why
    // the compare has to be transcribed and not approximated.
    assert.doesNotThrow(() => ROM.u32(WP + 0x20),
      'the adjacent window makes an out-of-range cursor SILENT, not loud');
  });

test('W262 MAIN4 still masks its own cursor at four entries', { skip: SKIP }, () => {
  // The walker is shared now, so the two bounds have to stay apart. MAIN4's cursor must
  // never reach 8 from 4 by the compare path, nor $10 at all.
  const f = fixture();
  main4Init29F8CC(f.ram, ROM, f.ctx, SLOT);
  f.ram.setU16(SLOT + 0x06, 0x0c);
  f.ram.setU16(A6 + 0x194, 0);
  f.ram.setU16(A6 + 0x196, 0);
  f.ram.setU16(A6 + 0x02, u16(ROM.u16(0x29f972 + 0x0c)));
  f.ram.setU16(A6 + 0x04, u16(ROM.u16(0x29f972 + 0x0e)));
  main4Step29F8F0(f.ram, ROM, f.ctx, SLOT);
  assert.equal(f.ram.u16(SLOT + 0x06), 0,
    '$29F94E andi.w #$F -- MAIN4 wraps at four, not eight');
});

test('W262 the vector moves the PART OFFSETS, as all three walkers do',
  { skip: SKIP }, () => {
    const f = fixture();
    main8Init29FA8A(f.ram, ROM, f.ctx, SLOT);
    const pos = [f.ram.u16(A6 + 0x02), f.ram.u16(A6 + 0x04)];
    const off = [f.ram.u16(A6 + 0x194), f.ram.u16(A6 + 0x196)];
    step(f);
    assert.deepEqual([f.ram.u16(A6 + 0x02), f.ram.u16(A6 + 0x04)], pos,
      '$2(A6) untouched');
    assert.notDeepEqual([f.ram.u16(A6 + 0x194), f.ram.u16(A6 + 0x196)], off);
  });

test('W262 it slews the heading towards each waypoint', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU8(A6 + 0x3b, 0x33);                // a deliberately wrong heading
  main8Init29FA8A(f.ram, ROM, f.ctx, SLOT);
  assert.notEqual(f.ram.u8(A6 + 0x3b), 0x33, '$29FACA aimed and $242190 stepped it');
});
