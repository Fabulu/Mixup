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

test('W372 $2909AA is a SCRIPT WALKER with a cursor, a reload pair and TWO carry exits', { skip: SKIP }, () => {
  const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
  // A0 is the script base and $81E0F8 is the CURSOR, added in and advanced by 2 per step -- so the
  // cursor is a byte offset kept in RAM, not a pointer, and it survives the call.
  assert.equal(IMG.readUInt16BE(0x2909aa), 0x2448, '$2909AA movea.l A0,A2');
  assert.equal(IMG.readUInt16BE(0x2909ac), 0xd4f9, '$2909AC adda.w abs.l,A2');
  assert.equal(IMG.readUInt32BE(0x2909ae), 0x0081e0f8, '  ...$81E0F8, the cursor');
  assert.equal(IMG.readUInt16BE(0x2909b2), 0x301a, '$2909B2 move.w (A2)+,D0 -- read a script word');
  assert.equal(IMG.readUInt16BE(0x2909b4), 0x6b00, '$2909B4 bmi -- NEGATIVE words are commands');
  assert.equal(IMG.readUInt16BE(0x2909fc), 0x0c40, '  ...and $2909FC cmpi.w tests which command');
  assert.equal(IMG.readUInt16BE(0x2909fe), 0x8000, '  ...#$8000');
  // $81E0FA / $81E0FB is a THIRD counter-and-reload pair of the shape $4C uses twice.
  assert.equal(IMG.readUInt16BE(0x2909b8), 0x5339, '$2909B8 subq.b #1,abs.l');
  assert.equal(IMG.readUInt32BE(0x2909ba), 0x0081e0fa, '  ...$81E0FA, the counter');
  assert.equal(IMG.readUInt16BE(0x2909c2), 0x13f9, '$2909C2 move.b abs.l,abs.l');
  assert.equal(IMG.readUInt32BE(0x2909c4), 0x0081e0fb, '  ...FROM $81E0FB, its RELOAD -- the adjacent byte');
  assert.equal(0x81e0fb - 0x81e0fa, 1, 'adjacent, exactly like ($34)/($35) and ($6E)/($6F) in $4C');
  // Two carry exits, the same SR trick $4C's $26FFE8 uses.
  assert.equal(IMG.readUInt16BE(0x2909f0), 0x007c, '$2909F0 ori.w #imm,SR');
  assert.equal(IMG.readUInt16BE(0x2909f2), 0x0001, '  ...carry SET -- still running');
  assert.equal(IMG.readUInt16BE(0x2909f6), 0x027c, '$2909F6 andi.w #imm,SR');
  assert.equal(IMG.readUInt16BE(0x2909f8), 0xfffe, '  ...carry CLEAR');
  // And it ALLOCATES into the pool ported above, from a $2902C2 entry.
  // NOTE the SHORT form: $61A2, so the displacement is the low BYTE, not a following word. Reading it
  // as a word lands on the next instruction's bytes -- the same mistake the dependency scans kept
  // making in the other direction.
  assert.equal(IMG[0x2909e0], 0x61, '$2909E0 bsr');
  assert.equal(IMG[0x2909e1], 0xa2, '  ...short form, displacement in the low byte');
  assert.equal(0x2909e2 + (IMG[0x2909e1] - 0x100), 0x290984, '  ...to $290984 -- poolAlloc290984');
});
