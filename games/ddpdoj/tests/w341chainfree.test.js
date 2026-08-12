// W341 -- `$246800`, the multi-part chain free.
//
// Six instructions, TWENTY-ONE callers, and the teardown half of the `$246520` constructor. This file
// exists for three things, each of which is a way to get it wrong:
//   * its prologue is TWO separate `move.l` pushes, not a `movem.l` -- I guessed `movem.l` in prose
//     before displaying the bytes and it is `2F00 2F08`;
//   * it is a DO-WHILE: the head is freed with no entry test, so a null head would clear address 0;
//   * its two writes are exactly the inverse of `$246520`'s claim, which is what confirms that the
//     pool's "occupied" state is a NEGATIVE first word.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached } from '../src/unported.js';
import { freeChain246800, buildParts246520, PARTS } from '../src/spawn.js';
import { octDistance242494 } from '../src/aim.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

const NODE = 0x80fa86;          // the node pool base
const STRIDE = 0x70;            // and its stride

test('W341 the prologue is TWO move.l pushes, not a movem.l', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x246800), 0x2f00, '$246800 move.l D0,-(A7)');
  assert.equal(IMG.readUInt16BE(0x246802), 0x2f08, '$246802 move.l A0,-(A7) -- a SECOND push');
  assert.notEqual(IMG.readUInt16BE(0x246800), 0x48e7, 'and it is NOT movem.l, which is what I guessed');
  assert.equal(IMG.readUInt16BE(0x246804), 0x2040, '$246804 movea.l D0,A0');
  assert.equal(IMG.readUInt16BE(0x246806), 0x4250, '$246806 clr.w (A0)');
  assert.equal(IMG.readUInt32BE(0x246808), 0x317c0000, '$246808 move.w #$0,($4,A0)');
  assert.equal(IMG.readUInt32BE(0x24680e), 0x2028002c, '$24680E move.l ($2C,A0),D0 -- the LINK');
  assert.equal(IMG.readUInt16BE(0x246812), 0x66f0, '$246812 bne $246804 -- back to the release');
});

test('W341 it is a DO-WHILE: there is no entry test before the first release', { skip: SKIP }, () => {
  // $246804 is the loop TARGET and the release follows it immediately, so the head is freed
  // unconditionally. Nothing between the prologue and `clr.w` tests D0.
  assert.equal(0x246804 + 2, 0x246806, 'movea.l is two bytes, so clr.w is the very next instruction');
  assert.equal(IMG.readUInt16BE(0x246806), 0x4250, 'and it IS the clr.w -- no tst, no beq');
});

test('W341 the two writes are the inverse of $246520\'s claim', { skip: SKIP }, () => {
  // This is what confirms the pool convention from both ends: occupied == negative first word.
  assert.equal(IMG.readUInt32BE(0x246540), 0x32bc8000, '$246540 move.w #$8000,(A1) -- the CLAIM');
  assert.equal(IMG.readUInt32BE(0x246544), 0x33460004, '$246544 move.w D6,($4,A1)');
  assert.equal(IMG.readUInt16BE(0x246806), 0x4250, '$246806 clr.w (A0) -- the RELEASE');
  assert.equal(IMG.readUInt16BE(0x24653a), 0x4a51, '$24653A tst.w (A1)');
  assert.equal(IMG.readUInt16BE(0x24653c), 0x6b00, '$24653C bmi -- so NEGATIVE means occupied');
});

test('W341 the pools abut, which is what proves both strides', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x2465de), 0x45ea, '$2465DE lea (d16,A2),A2 -- the node stride');
  assert.equal(IMG.readUInt16BE(0x2465e0), 0x0070, '... and it is $70');
  assert.equal(IMG.readUInt16BE(0x246600), 0x43e9, '$246600 lea (d16,A1),A1 -- the parent stride');
  assert.equal(IMG.readUInt16BE(0x246602), 0x0030, '... and it is $30');
  assert.equal(0x80fa86 + 20 * 0x70, 0x810346, 'node pool ends EXACTLY at the parent pool base');
  assert.equal(0x810346 + 3 * 0x30, 0x8103d6, 'and the parent pool is three $30 slots');
});

test('W341 it releases every node in the chain and returns the count', () => {
  const ram = new Ram();
  // Three linked nodes, claimed as $246520 claims them.
  for (let i = 0; i < 3; i++) {
    const at = NODE + i * STRIDE;
    ram.setU16(at, 0x8000);
    ram.setU16(at + 0x04, 0x1234);
    ram.setU32(at + 0x2c, i < 2 ? NODE + (i + 1) * STRIDE : 0);
  }
  assert.equal(freeChain246800(ram, NODE), 3, 'three nodes released');
  for (let i = 0; i < 3; i++) {
    const at = NODE + i * STRIDE;
    assert.equal(ram.u16(at), 0, `node ${i} first word cleared`);
    assert.equal(ram.u16(at + 0x04), 0, `node ${i} +$4 cleared`);
  }
});

test('W341 a single unlinked node is released and the walk stops', () => {
  const ram = new Ram();
  ram.setU16(NODE, 0x8000);
  ram.setU32(NODE + 0x2c, 0);
  assert.equal(freeChain246800(ram, NODE), 1);
  assert.equal(ram.u16(NODE), 0);
});

test('W341 a NULL head throws by address rather than clearing address 0', () => {
  const ram = new Ram();
  assert.throws(() => freeChain246800(ram, 0),
    (e) => e instanceof Unreached && e.romAddress === 0x246800);
});

test('W341 a CYCLE throws by address rather than hanging', () => {
  // The node pool holds twenty nodes, so a chain longer than that is a cycle. The ROM would loop
  // forever; a hanging suite is a worse way to learn that than a failing one.
  const ram = new Ram();
  ram.setU16(NODE, 0x8000);
  ram.setU32(NODE + 0x2c, NODE);            // points at itself
  assert.throws(() => freeChain246800(ram, NODE),
    (e) => e instanceof Unreached && e.romAddress === 0x246812);
});

// --- $246520 / $24652A, the constructor the chain-free tears down.

test('W341 the two entry points differ ONLY in D6', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x246520), 0x48e77ff8, '$246520 movem.l D1-D7/A0-A4,-(A7)');
  assert.equal(IMG.readUInt32BE(0x246524), 0x3c3c0001, '$246524 move.w #$1,D6');
  assert.equal(IMG.readUInt16BE(0x246528), 0x6008, '$246528 bra $246532 -- skipping the other seed');
  assert.equal(IMG.readUInt32BE(0x24652a), 0x48e77ff8, '$24652A the SAME prologue');
  assert.equal(IMG.readUInt32BE(0x24652e), 0x3c3c0000, '$24652E move.w #$0,D6 -- the only difference');
  // D6 lands in the parent's ($4,A1), then is REUSED as the node-walk counter eight bytes later.
  assert.equal(IMG.readUInt32BE(0x246544), 0x33460004, '$246544 move.w D6,($4,A1) -- the MODE');
  assert.equal(IMG.readUInt32BE(0x24654e), 0x3c3c0013, '$24654E move.w #$13,D6 -- D6 REUSED as a count');
});

test('W341 $24627A has THREE entries and index 3 is an instruction', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x24627a), 0x0080e886, '[0] first long');
  assert.equal(IMG.readUInt32BE(0x24627e), 0x0080fa66, '[0] second long');
  assert.equal(IMG.readUInt32BE(0x246292), 0x48e77f00, '[3] is movem.l -- CODE, which bounds the table');
});

test('W341 $246B38 is bounded by the ROM\'s own mask, not by a guard', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x2465a2), 0x0243001f, '$2465A2 andi.w #$1F,D3 -- 0..31 only');
  assert.equal(IMG.readUInt16BE(0x2465a6), 0xd643, '$2465A6 add.w D3,D3');
  assert.equal(IMG.readUInt16BE(0x2465a8), 0xd643, '$2465A8 add.w D3,D3 again -- so x4');
  assert.equal(IMG.readUInt32BE(0x246b38), 0x00000004, '[0]');
  assert.equal(IMG.readUInt32BE(0x246b38 + 31 * 4), 0x001c0001, '[31], the last reachable entry');
});

test('W341 the constructor claims a parent, links one node, and copies its payload', () => {
  const ram = new Ram();
  const rom = {
    u16: (a) => (ROMW.has(a) ? ROMW.get(a) : 0),
    u32: (a) => (((ROMW.get(a) ?? 0) * 0x10000) + (ROMW.get(a + 2) ?? 0)) >>> 0,
  };
  const ROMW = new Map();
  const putW = (a, v) => ROMW.set(a, v & 0xffff);
  const putL = (a, v) => { putW(a, v >>> 16); putW(a + 2, v & 0xffff); };
  // $4C's table shape: count word, then one 12-byte node.
  const TBL = 0x2701c8;
  putW(TBL, 1);                                  // count = 1
  putW(TBL + 2, 0x0000);                         // D2 -- dispatch index 0
  putW(TBL + 4, 0x0480);                         // A3 bias
  putL(TBL + 6, 0x00225238);                     // -> ($A,A2)
  putW(TBL + 10, 0x0003);                        // -> ($4,A2): 3 means FOUR payload words
  putW(TBL + 12, 0x0009);                        // -> the $246B38 index
  putL(0x24627a, 0x0080e886);                    // dispatch entry 0
  putL(0x24627e, 0x0080fa66);
  putW(0x246b38 + 9 * 4, 0x1111);
  putW(0x246b38 + 9 * 4 + 2, 0x2222);
  for (let i = 0; i < 4; i++) putW(0x0080e886 + 0x0480 + i * 2, 0xaa00 + i);

  const parent = buildParts246520(ram, rom, TBL, 1);
  assert.equal(parent, PARTS.parentPool, 'the FIRST parent slot was claimed');
  assert.equal(ram.u16(parent) & 0x8000, 0x8000, 'and marked occupied (negative)');
  assert.equal(ram.u16(parent + 0x04), 1, 'D6 = 1 reached ($4,A1) as the mode');
  const node = ram.u32(parent + 0x2c);
  assert.equal(node, PARTS.nodePool, 'one node linked, at the pool base');
  assert.equal(ram.u32(node + 0x2c), 0, 'and its own link is null -- end of chain');
  assert.equal(ram.u32(node + 0x0e), 0x0080e886 + 0x0480, 'the sprite base is entry 0 + the bias');
  assert.equal(ram.u16(node + 0x16), 0x1111, '($16,A2) from $246B38[9]');
  assert.equal(ram.u16(node + 0x14), 0x1111, 'and the SAME word copied to ($14,A2)');
  assert.equal(ram.u16(node + 0x1c), 0x2222, '($1C,A2) from the entry\'s second word');
  assert.equal(ram.u32(node + 0x18), 0xffff0000, '+$18 seeded to $FFFF0000 -- what $24681A sums');
  for (let i = 0; i < 4; i++) {
    assert.equal(ram.u16(node + 0x30 + i * 2), 0xaa00 + i, `payload word ${i} at +$30`);
  }
});

test('W341 an out-of-range dispatch index THROWS rather than reading code', () => {
  const ram = new Ram();
  const ROMW = new Map([[0x2701c8, 1], [0x2701ca, 0x0018]]);   // D2 = $18 -- past the three entries
  const rom = { u16: (a) => ROMW.get(a) ?? 0, u32: () => 0 };
  assert.throws(() => buildParts246520(ram, rom, 0x2701c8, 0),
    (e) => e instanceof Unreached && e.romAddress === 0x246588);
});

test('W341 a full parent pool returns 0 without touching the node pool', () => {
  const ram = new Ram();
  for (let s = 0; s < PARTS.parentSlots; s++) {
    ram.setU16(PARTS.parentPool + s * PARTS.parentStride, 0x8000);
  }
  const rom = { u16: () => 0, u32: () => 0 };
  assert.equal(buildParts246520(ram, rom, 0x2701c8, 0), 0, '$246608 moveq #-$1,D0');
  assert.equal(ram.u16(PARTS.nodePool), 0, 'and no node was claimed');
});

// --- type $4C's state machine: $26F858 sets, $26F86A dispatches. Two entries, not one routine.

test('W341 $26F858 is a SETTER with a load-bearing early-out', { skip: SKIP }, () => {
  // The first `dasm` of this address started mid-routine and made the setter and the dispatcher look
  // like one thing. Displayed from $26F858, they are separate, and the early-out matters: re-entering
  // the same state must NOT reset the sub-timer at ($28,A6).
  assert.equal(IMG.readUInt32BE(0x26f858), 0xb06e0026, '$26F858 cmp.w ($26,A6),D0');
  assert.equal(IMG.readUInt16BE(0x26f85c), 0x6700, '$26F85C beq -- already in that state, do nothing');
  assert.equal(IMG.readUInt16BE(0x26f85e), 0x000a, '... displacement $A');
  assert.equal(0x26f85c + 2 + 0x0a, 0x26f868, 'which lands on the rts, not on the dispatcher');
  assert.equal(IMG.readUInt32BE(0x26f860), 0x3d400026, '$26F860 move.w D0,($26,A6)');
  assert.equal(IMG.readUInt32BE(0x26f864), 0x426e0028, '$26F864 clr.w ($28,A6) -- ONLY on a change');
  assert.equal(IMG.readUInt16BE(0x26f868), 0x4e75, '$26F868 rts -- the setter ends HERE');
});

test('W341 $26F86A is a separate entry that dispatches and tail-jumps', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x26f86a), 0x41fa, '$26F86A lea (d16,PC),A0 -- a NEW entry point');
  assert.equal(IMG.readUInt16BE(0x26f86c), 0x001a, '... displacement $1A');
  assert.equal(0x26f86a + 4 + 0x1a - 2, 0x26f886, 'which resolves to the jump table at $26F886');
  assert.equal(IMG.readUInt32BE(0x26f870), 0x302e0026, '$26F870 move.w ($26,A6),D0 -- the state');
  assert.equal(IMG.readUInt16BE(0x26f874), 0xd040, '$26F874 add.w D0,D0');
  assert.equal(IMG.readUInt16BE(0x26f876), 0xd040, '$26F876 add.w D0,D0 -- so index * 4');
  assert.equal(IMG.readUInt16BE(0x26f87a), 0x2050, '$26F87A movea.l (A0),A0');
  assert.equal(IMG.readUInt16BE(0x26f87c), 0x4e90, '$26F87C jsr (A0) -- the indirect call');
  assert.equal(IMG.readUInt32BE(0x26f880), 0x002417de, '$26F87E jmp $2417DE -- applyVelocityA6, tail');
});

test('W341 the jump table has EIGHT entries and abuts its own first handler', { skip: SKIP }, () => {
  const want = [0x26f8a6, 0x26f90e, 0x26fbd4, 0x26fcf2, 0x26fd66, 0x26feca, 0x26ff3e, 0x26ff56];
  want.forEach((h, i) => {
    assert.equal(IMG.readUInt32BE(0x26f886 + i * 4), h, `state ${i} -> $${h.toString(16)}`);
  });
  assert.equal(0x26f886 + 8 * 4, 0x26f8a6, 'the table ends exactly at the FIRST handler it names');
  assert.equal(want[0], 0x26f8a6, 'which is what pins its extent -- no count word, no terminator');
  assert.notEqual(IMG.readUInt32BE(0x26f8a6), 0x0026f8a6, 'and entry 8 is code, not an address');
});

// --- $242494, the octagonal distance. TWENTY-ONE callers, and one axis is scaled.

test('W341 $242494 scales ONE axis to three quarters, between two symmetric abs blocks',
  { skip: SKIP }, () => {
    // The whole reason this needs a test: $2424A0..$2424A4 sits between two absolute-value blocks that
    // look symmetric, and it touches only D0. A symmetric max+min/2 would be wrong on the Y axis.
    assert.equal(IMG.readUInt32BE(0x242494), 0x4cae0003, '$242494 movem.w ($2,A6),D0-D1 -- SIGN-EXTENDS');
    assert.equal(IMG.readUInt16BE(0x24249a), 0x9042, '$24249A sub.w D2,D0');
    assert.equal(IMG.readUInt16BE(0x24249c), 0x6a02, '$24249C bpl -- skip the neg');
    assert.equal(IMG.readUInt16BE(0x24249e), 0x4440, '$24249E neg.w D0');
    assert.equal(IMG.readUInt16BE(0x2424a0), 0x3800, '$2424A0 move.w D0,D4');
    assert.equal(IMG.readUInt16BE(0x2424a2), 0xe44c, '$2424A2 lsr.w #2,D4 -- a QUARTER');
    assert.equal(IMG.readUInt16BE(0x2424a4), 0x9044, '$2424A4 sub.w D4,D0 -- so D0 is three quarters');
    assert.equal(IMG.readUInt16BE(0x2424a6), 0x9243, '$2424A6 sub.w D3,D1 -- and D1 is NOT scaled');
    assert.equal(IMG.readUInt16BE(0x2424aa), 0x4441, '$2424AA neg.w D1');
    assert.equal(IMG.readUInt16BE(0x2424ac), 0xb041, '$2424AC cmp.w D1,D0');
    assert.equal(IMG.readUInt16BE(0x2424b0), 0xc340, '$2424B0 exg D1,D0 -- so D0 ends up the LARGER');
    assert.equal(IMG.readUInt16BE(0x2424b2), 0xe249, '$2424B2 lsr.w #1,D1 -- HALF the smaller');
    assert.equal(IMG.readUInt16BE(0x2424b4), 0xd041, '$2424B4 add.w D1,D0');
    assert.equal(IMG.readUInt16BE(0x2424b8), 0x4e75, '$2424B8 rts');
  });

test('W341 the distance is max(a,b) + min(a,b)/2 with a = |dy| * 3/4', () => {
  // 0x100 -> 0xC0 after the quarter subtraction; 0x80 stays. max 0xC0 + min 0x80 / 2 = 0x100.
  assert.equal(octDistance242494(0x100, 0x80, 0, 0), 0x100, 'the worked case');
  // Swap the axes: now the SCALED one is the smaller, which is where a symmetric port diverges.
  // a = 0x80 - 0x20 = 0x60; b = 0x100. max 0x100 + 0x60/2 = 0x130.
  assert.equal(octDistance242494(0x80, 0x100, 0, 0), 0x130, 'scaling one axis is NOT symmetric');
  assert.notEqual(octDistance242494(0x80, 0x100, 0, 0), octDistance242494(0x100, 0x80, 0, 0),
    'and that asymmetry is the point -- swapping dx and dy changes the answer');
  // Pure axes.
  assert.equal(octDistance242494(0x40, 0, 0, 0), 0x30, '|dy| alone loses its quarter');
  assert.equal(octDistance242494(0, 0x40, 0, 0), 0x40, '|dx| alone does not');
  assert.equal(octDistance242494(0, 0, 0, 0), 0, 'zero');
});

test('W341 both deltas are made absolute before the shifts', () => {
  // `lsr.w` is a LOGICAL shift, so it is only safe because the negs ran first.
  assert.equal(octDistance242494(0, 0, 0x40, 0), 0x30, 'a NEGATIVE dy is absolute-valued, then scaled');
  assert.equal(octDistance242494(0, 0, 0, 0x40), 0x40, 'and a negative dx likewise');
  assert.equal(octDistance242494(0x100, 0x80, 0, 0), octDistance242494(0, 0, 0x100, 0x80),
    'so the sign of each delta cannot change the result');
});
