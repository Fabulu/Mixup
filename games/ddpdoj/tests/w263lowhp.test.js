// W263: the Stage-4 boss's low-HP transition, which STARTS the third phase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { SCHED } from '../src/scheduler.js';
import { POOL_B } from '../src/effects.js';
import { handlerBoss29EF0A } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

// A6 is NOT the 0x81b732 the other boss4 tests use, and that matters: POOL_B.base IS
// 0x81b732, so a fixture that spawns effects there has the pool scribble straight over
// the sub-record it is asserting about. The boss's real sub-record comes out of the
// common pool, so this uses an address in that range instead.
const A5 = 0x814000, A6 = 0x814600;
const F0 = 0x8130f0;
const TABLE_L = 0x29ff6e, TABLE_R = 0x29ffee;

/** The boss, already past its first transition and one frame from the low-HP one. */
function boss() {
  const ram = new Ram();
  const log = new UnportedLog();
  const events = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x16, 0x0000c300);           // BELOW $C400
  ram.setU16(A5 + 0x1a, 0x40);
  ram.setU16(A5 + 0x1c, 0x40);
  ram.setU8(A6 + 0x16c, 1);                    // the first transition already fired
  ram.setU32(A6 + 0x82, 0x30001c00);           // the two pods
  ram.setU32(A6 + 0xa2, 0x34002000);
  ram.setU8(A6 + 0x1a, 0x22);
  ram.setU8(A6 + 0x1b, 0x11);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log, soundPost() {},
    bossEvent(name, at) { events.push({ name, at }); },
    bulletSpawn() {} };
  return { ram, log, ctx, events };
}
const run = (f) => handlerBoss29EF0A(f.ram, ROM, A5, f.ctx);

const a4Ids = (ram) => {
  const out = [];
  for (let i = 0; i < SCHED.a4Slots; i++) {
    const s = ram.u16(SCHED.a4Base + i * SCHED.a4Stride);
    if (s !== 0) out.push(s & 0xff);
  }
  return out.sort((a, b) => a - b);
};

test('W263 the low-HP transition STARTS the third phase', { skip: SKIP }, () => {
  const f = boss();
  // W219 left this a loud throw; every script it arms now exists.
  run(f);
  assert.deepEqual(a4Ids(f.ram), [6], '$29FE6C a4Start(6) -- A4 id6, the third phase');
  assert.equal(f.ram.u8(A6 + 0x16d), 1, '$29FE52 -- and it is a one-shot');
  assert.deepEqual(f.events.map((e) => e.name), ['phase-3']);
  // The unported paths it DOES touch are counted, not silent: only the hit-stop.
  assert.deepEqual(f.log.report().map((l) => l.split(' x ')[1].split(' ')[0]),
    ['$243DD0'], 'the hit-stop is the only counted gap');
});

test('W263 it raises $8130F0, which is what clears the second phase children',
  { skip: SKIP }, () => {
    const f = boss();
    assert.equal(f.ram.u16(F0), 0);
    run(f);
    // stage4type42.js frees every child outright when this word is non-zero, so this
    // one store is the whole second-phase cleanup.
    assert.equal(f.ram.u16(F0), 1, '$29FE58');
  });

test('W263 both pods blow up, and the left one retires A1 7 as it goes',
  { skip: SKIP }, () => {
    const f = boss();
    run(f);
    // $9F(a6) is exactly the kill switch A1 7 tests first ($2A2E9E), so this is one
    // store doing two jobs.
    assert.equal(f.ram.u8(A6 + 0x9f), 1, '$29FF22 -- the left latch AND A1 7 kill');
    assert.equal(f.ram.u8(A6 + 0xbf), 1, '$29FFA2 -- the right latch');
    assert.deepEqual([f.ram.u16(A6 + 0x98), f.ram.u16(A6 + 0xb8)], [0xffff, 0xffff]);
    assert.deepEqual([f.ram.u16(A6 + 0x80), f.ram.u16(A6 + 0xa0)], [0x8000, 0x8000]);
    assert.deepEqual([f.ram.u8(A6 + 0x14c), f.ram.u8(A6 + 0x14d)], [0x13, 0x13]);
    // ...and each stops its OWN A2 object, 7 then 8.
    assert.equal(f.ram.u16(SCHED.a2Base + 7 * SCHED.a2Stride) & 1, 0);
    assert.equal(f.ram.u16(SCHED.a2Base + 8 * SCHED.a2Stride) & 1, 0);
  });

test('W263 each pod is a one-shot, so a second frame adds nothing', { skip: SKIP }, () => {
  const f = boss();
  run(f);
  const effects = f.ram.u16(POOL_B.count);
  f.ram.setU8(A6 + 0x16d, 0);                  // re-arm the OUTER latch only
  run(f);
  assert.equal(f.ram.u16(POOL_B.count), effects,
    '$29FF18/$29FF98 -- the pod latches held, so no second set of effects');
});

test('W263 the effect rows are three each, mirrored, and terminated in the ROM',
  { skip: SKIP }, () => {
    for (const [base, name] of [[TABLE_L, 'left'], [TABLE_R, 'right']]) {
      const kinds = [];
      let a = base;
      for (let n = 0; n < 6; n++) {
        const d1 = ROM.u16(a);
        if (d1 === 0xffff) break;
        assert.equal(d1, n * 2, `${name} row ${n}: D1 is the row index`);
        kinds.push(ROM.u16(a + 2));
        a += 12;                               // TWELVE, because $2A0108 skips two
      }
      assert.deepEqual(kinds, [0x84, 0x87, 0x0d], `${name}: three rows`);
      assert.equal(a, base + 36, 'and the terminator is where the stride says');
    }
    // The two tables differ only in the short half of their position biases, which is
    // what makes the two explosions mirror rather than overlap.
    assert.notEqual(ROM.u32(TABLE_L + 6), ROM.u32(TABLE_R + 6));
    assert.equal(ROM.u32(TABLE_L + 6) >>> 16, ROM.u32(TABLE_R + 6) >>> 16,
      'same long axis, different short');
  });

test('W263 the walker writes the boss heading times FOUR into each effect',
  { skip: SKIP }, () => {
    const f = boss();
    f.ram.setU8(A6 + 0x1b, 0x11);
    run(f);
    // $2A00FC..$2A0104 doubles $1B(a6) twice, BYTE-wide, so $11 becomes $44. Walked over
    // the real pool rather than a guessed stride.
    const slots = Array.from({ length: POOL_B.slots },
      (_, i) => POOL_B.base + i * POOL_B.stride);
    const hits = slots.filter((sl) => f.ram.u8(sl + 0x1b) === 0x44
      && f.ram.u8(sl + 0x1a) === 0x22);
    assert.ok(hits.length >= 6,
      `$2A0104 -- $11 doubled twice is $44, found ${hits.length} effects carrying it`);
    // Three rows per pod, and each row's D1 is its own index.
    const rows = hits.map((sl) => f.ram.u16(sl + 0x18)).sort((a, b) => a - b);
    assert.deepEqual(rows.slice(0, 6), [0, 0, 2, 2, 4, 4],
      '$2A00D8 -- two pods, three rows each, D1 straight from the table');
  });

test('W263 above $C400 nothing happens at all', { skip: SKIP }, () => {
  const f = boss();
  f.ram.setU32(A5 + 0x16, 0x0000c400);         // $29FE4E bge -- exactly on the edge
  run(f);
  assert.deepEqual(a4Ids(f.ram), [], 'no phase change');
  assert.equal(f.ram.u8(A6 + 0x16d), 0);
  assert.equal(f.ram.u16(F0), 0);
  assert.equal(f.ram.u8(A6 + 0x9f), 0, 'and the pods are intact');
});
