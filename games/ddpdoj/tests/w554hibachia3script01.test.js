// W554: HIBACHI A3 SCRIPTS 0 AND 1, `$2A54D6..$2A552D`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import {
  SCHED, installScripts, a2Run2598E6, a3Start259962,
  a4Start25980C, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { HIBACHI_A0, HIBACHI_A3, HIBACHI_A4 } from '../src/hibachiend.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);

const beU16 = (addr) => IMG.readUInt16BE(addr);
const beU32 = (addr) => IMG.readUInt32BE(addr);
const REC = 0x810c00;
const SUB = 0x814800;
const PAIRS = Object.freeze([
  [0x2a54d6, 0x2a54e2],
  [0x2a5502, 0x2a550e],
  [0x2a552e, 0x2a5534],
  [0x2a56a2, 0x2a56ae],
  [0x2a56ce, 0x2a56da],
  [0x2a56fa, 0x2a5700],
  [0x2a5758, 0x2a5764],
  [0x2a5784, 0x2a5790],
]);

function bench(tables = { a3: HIBACHI_A3.table }) {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { bossRec: REC, bossSubRec: SUB, tables: MT,
    unported: log, unportedLog: log };
  ram.setU32(REC + 0x06, SUB);
  installScripts(ram, ROM, tables);
  return { ram, log, ctx };
}

const frame = (b) => runScheduler25962E(b.ram, ROM, b.ctx);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

test('W554 the loader names the exact eight-pair Hibachi A3 table', { skip: SKIP }, () => {
  assert.equal(beU16(0x2a4312), 0x47f9, '$2A4312 loads A3 with lea abs.l');
  assert.equal(beU32(0x2a4314), HIBACHI_A3.table);
  assert.equal(HIBACHI_A3.pairs, 8);
  assert.deepEqual(PAIRS.map((_, id) => [
    beU32(HIBACHI_A3.table + id * 8),
    beU32(HIBACHI_A3.table + id * 8 + 4),
  ]), PAIRS);
  assert.deepEqual(PAIRS.slice(0, 2), [
    [HIBACHI_A3.s0Init, HIBACHI_A3.s0Step],
    [HIBACHI_A3.s1Init, HIBACHI_A3.s1Step],
  ]);

  const window = TABLE_JSON.rom.windows.find((w) => w.base === '$2A5492');
  assert.equal(window?.len, 0x40);
  assert.equal(HIBACHI_A3.table + HIBACHI_A3.pairs * 8, 0x2a54d2);
  assert.equal(beU16(0x2a54d2), 0x4254);
  assert.equal(beU16(0x2a54d4), 0x4e75);
  PAIRS.forEach(([init, step], id) => {
    assert.equal(ROM.u32(HIBACHI_A3.table + id * 8), init);
    assert.equal(ROM.u32(HIBACHI_A3.table + id * 8 + 4), step);
  });
});

test('W554 only live A3 ids 0 and 1 have both exact entries registered',
  { skip: SKIP }, () => {
    const registered = new Set(scriptAddresses());
    for (const address of PAIRS[0]) assert.ok(registered.has(address));
    for (const address of PAIRS[1]) assert.ok(registered.has(address));
    assert.ok(!registered.has(HIBACHI_A3.table), 'the table base is data, not a script entry');
  });

test('W554 ids 0 and 1 keep their exact byte-underflow cadence and selector cycle',
  { skip: SKIP }, () => {
    const b = bench();
    assert.equal(a3Start259962(b.ram, 0), true);
    assert.equal(a3Start259962(b.ram, 1), true);

    assert.equal(frame(b), false);
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride),
    ], [0x8100, 0x8101]);
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base + 0x02),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride + 0x02),
    ], [0x0101, 0x0202]);
    assert.deepEqual([
      b.ram.u16(SUB + HIBACHI_A3.s0Selector),
      b.ram.u16(SUB + HIBACHI_A3.s1Selector),
    ], [4, 4]);

    frame(b);
    assert.deepEqual([
      b.ram.u16(SUB + HIBACHI_A3.s0Selector),
      b.ram.u16(SUB + HIBACHI_A3.s1Selector),
    ], [4, 4], 'id 0 waits two dispatches and id 1 waits three');
    frame(b);
    assert.deepEqual([
      b.ram.u16(SUB + HIBACHI_A3.s0Selector),
      b.ram.u16(SUB + HIBACHI_A3.s1Selector),
    ], [8, 4]);
    frame(b);
    assert.deepEqual([
      b.ram.u16(SUB + HIBACHI_A3.s0Selector),
      b.ram.u16(SUB + HIBACHI_A3.s1Selector),
    ], [8, 8]);

    const cycleBench = bench();
    a3Start259962(cycleBench.ram, 0);
    frame(cycleBench);
    const cycle = [cycleBench.ram.u16(SUB + HIBACHI_A3.s0Selector)];
    for (let i = 1; i < 6; i++) {
      frame(cycleBench);
      frame(cycleBench);
      cycle.push(cycleBench.ram.u16(SUB + HIBACHI_A3.s0Selector));
    }
    assert.deepEqual(cycle, [0x04, 0x08, 0x0c, 0x10, 0x14, 0x00]);
    assert.equal(cycleBench.ram.u16(SCHED.a3Base), 0x8100,
      'the script remains live after wrapping its selector');
  });

test('W554 the live five-table dispatch reaches the next measured blocker',
  { skip: SKIP }, () => {
    const b = bench({
      a0: HIBACHI_A0.table,
      a1: 0x2a92a8,
      a2: 0x2a46b2,
      a3: HIBACHI_A3.table,
      a4: HIBACHI_A4.table,
    });
    for (const id of [0, 1, 2, 5, 4, 3, 8, 7, 6, 9]) a2Run2598E6(b.ram, id);
    assert.equal(a4Start25980C(b.ram, 0), true);

    const error = caught(() => frame(b));
    assert.equal(error?.romAddress, 0x2a478c);
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride),
    ], [0x8100, 0x8101]);
    assert.deepEqual([
      b.ram.u16(SCHED.a3Base + 0x02),
      b.ram.u16(SCHED.a3Base + SCHED.a3Stride + 0x02),
    ], [0x0101, 0x0202]);
    assert.deepEqual([
      b.ram.u16(SUB + HIBACHI_A3.s0Selector),
      b.ram.u16(SUB + HIBACHI_A3.s1Selector),
    ], [4, 4]);
  });
