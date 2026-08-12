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
import { freeChain246800 } from '../src/spawn.js';

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
