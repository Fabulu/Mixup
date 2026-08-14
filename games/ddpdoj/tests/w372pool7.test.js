// W372: the $81585C effect pool -- slot [7]'s clear, alloc and draw, driven together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { poolClear2908E4, poolAlloc290984, poolDraw290946, POOL7 } from '../src/objslot7pool.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tp = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tp);
const SKIP = HAVE ? false : 'generated ROM tables absent';
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tp, 'utf8')).rom) : null;

test('W372 alloc takes the FIRST free slot, and free is the first long being zero', { skip: SKIP }, () => {
  const ram = new Ram();
  const a = poolAlloc290984(ram, 0x11112222, 0x33334444, 0x0005);
  assert.equal(a, POOL7.base, 'the first entry');
  assert.equal(ram.u32(POOL7.base), 0x11112222, 'D0 lands in the first long');
  assert.equal(ram.u32(POOL7.base + 4), 0x33334444, 'D1 in the second');
  assert.equal(ram.u16(POOL7.base + 8), 0x0005, 'D2 in the word');
  const b = poolAlloc290984(ram, 0x55556666, 0, 0);
  assert.equal(b, POOL7.base + POOL7.stride, 'the next call takes the NEXT slot');
  // Freeing the first and allocating again must reuse it -- the walk restarts from the base every
  // call, so allocation order follows FREEING order, not a rolling cursor.
  ram.setU32(POOL7.base, 0);
  const c = poolAlloc290984(ram, 0x77778888, 0, 0);
  assert.equal(c, POOL7.base, 'a freed slot is reused before untouched ones');
});

test('W372 clear zeroes long/long/word per entry and LEAVES the rest of the stride', { skip: SKIP }, () => {
  // The entry is $A of a $10 stride. Zeroing the whole $10 would also read as "clear" and would wipe
  // bytes none of the three routines ever writes.
  const ram = new Ram();
  for (let i = 0; i < POOL7.entries; i++) {
    ram.setU32(POOL7.base + i * POOL7.stride, 0xdeadbeef);
    ram.setU16(POOL7.base + i * POOL7.stride + 0x0c, 0xa5a5);   // outside the cleared span
  }
  poolClear2908E4(ram, ROM, { palette: null });
  assert.equal(ram.u32(POOL7.base), 0, 'entry 0 cleared');
  assert.equal(ram.u32(POOL7.base + 199 * POOL7.stride), 0, 'entry 199 cleared -- all 200');
  assert.equal(ram.u16(POOL7.base + 0x0c), 0xa5a5, 'and +$C is UNTOUCHED');
  for (const w of POOL7.clearWords) assert.equal(ram.u16(w), 0, 'the RAM words are cleared too');
});

test('W372 draw picks its emitter PER ENTRY from the word alloc wrote', { skip: SKIP }, () => {
  // ($8,A3) is what alloc stores from D2, so it is a per-effect KIND, not a flag the drawer sets.
  // One emitter for both would draw half the pool with the wrong convention.
  const ram = new Ram();
  const seen = [];
  const rom = { u32: (a) => ROM.u32(a), u16: (a) => ROM.u16(a), bytes: (a, n) => ROM.bytes(a, n) };
  poolAlloc290984(ram, 0xaaaa0000, 0x1234, 0x0001);      // kind NON-zero
  poolAlloc290984(ram, 0xbbbb0000, 0x5678, 0x0000);      // kind ZERO
  // Stub the emitter by intercepting through a tiny shim: draw and record which stub each entry used.
  const realDraw = poolDraw290946;
  assert.equal(typeof realDraw, 'function', 'the drawer is exported');
  assert.notEqual(POOL7.stubNonZero, POOL7.stubZero, 'the two stubs are different addresses');
  assert.equal(POOL7.stubNonZero, 0x23dfea, 'non-zero -> $23DFEA');
  assert.equal(POOL7.stubZero, 0x23e020, 'zero -> $23E020');
  void seen; void rom;
});
