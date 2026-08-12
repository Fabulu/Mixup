// W344 -- `$28D53C`, the `$81DF20` busy gate. Five instructions, SIX callers.
//
// It is the transition screen's first real gate after the START press ($25DC68 jsr / bcs), and it is the
// FIFTH routine found to return status by writing SR directly. The polarity is the thing to get right, and
// it must be read at the `ori`/`andi` rather than at any caller's branch -- I got that backwards once on
// $26FFE2 in W343 having read the caller correctly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { busyGate28D53C } from '../src/sound.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

test('W344 all five instructions, and the polarity read AT the SR writes', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x28d53c), 0x4a79, '$28D53C tst.w (abs).l');
  assert.equal(IMG.readUInt32BE(0x28d53e), 0x0081df20, '... $81DF20');
  assert.equal(IMG.readUInt16BE(0x28d542), 0x6700, '$28D542 beq -- ZERO jumps to the success exit');
  assert.equal(IMG.readUInt16BE(0x28d544), 0x0008, '... displacement 8');
  assert.equal(0x28d542 + 2 + 8, 0x28d54c, 'which lands on $28D54C');
  assert.equal(IMG.readUInt32BE(0x28d546), 0x007c0001, '$28D546 ori #$1,SR  -- NON-ZERO sets carry');
  assert.equal(IMG.readUInt32BE(0x28d54c), 0x027cfffe, '$28D54C andi #$FFFE,SR -- ZERO clears it');
  assert.equal(IMG.readUInt16BE(0x28d54a), 0x4e75, 'and each exit is its own rts');
});

test('W344 the transition screen abandons its START press when this is busy', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x25dc6a), 0x0028d53c, '$25DC68 jsr $28D53C');
  assert.equal(IMG.readUInt16BE(0x25dc6e), 0x6500, '$25DC6E bcs -- carry SET abandons');
  assert.equal(IMG.readUInt16BE(0x25dc70), 0x0050, '... to $25DCC0');
  assert.equal(0x25dc6e + 2 + 0x50, 0x25dcc0, 'the phase-0 arm\'s exit');
});

test('W344 zero means proceed, non-zero means not now', () => {
  const ram = new Ram();
  assert.equal(busyGate28D53C(ram), true, '$81DF20 = 0 -> carry CLEAR -> proceed');
  ram.setU16(0x81df20, 1);
  assert.equal(busyGate28D53C(ram), false, 'non-zero -> carry SET -> do not');
  ram.setU16(0x81df20, 0xffff);
  assert.equal(busyGate28D53C(ram), false, 'any non-zero value, not just 1');
});
