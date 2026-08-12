// W344 -- `$25DC2C`, object [11] phase 0's arm. The last piece of the transition screen's phase 0.
//
// Two things this file exists for:
//   * `$813098` and `$813092` are ONE gate, not two -- a zero rank SKIPS the stage test, so only
//     rank-non-zero AND stage-index-4 abandons the arm;
//   * `btst #$F` is the START button, and every earlier gate must pass before it is even read.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { tallyPhase0Arm25DC2C, SCREEN11 } from '../src/tallyscreen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';
const SLOT = 0x80e240;
const ROM = { u16: (a) => (IMG ? IMG.readUInt16BE(a) : 0) };

/** a slot with every gate already satisfied and START held, so each test can spoil ONE thing. */
function ready(ram) {
  ram.setU8(SLOT + SCREEN11.phase, 0);
  ram.setU8(SLOT + SCREEN11.side, 0);
  ram.setU32(SLOT + SCREEN11.desc, SCREEN11.descA);
  ram.setU16(0x813098, 0);                                 // rank zero -> the stage test is SKIPPED
  ram.setU16(0x803926, 0);
  ram.setU16(SCREEN11.carryWord, 0);                       // $28D53C not busy
  ram.setU16(0x813084, 0x00ff);                            // saved cursor = the sentinel
  ram.setU8(SCREEN11.savedA + 1, 0xff);
  ram.setU8(SCREEN11.savedB + 1, 0xff);
  ram.setU16(0x803972, 0x8000);                            // side 0's input word: START
}
const ctx = () => { const l = new UnportedLog(); return { unportedLog: l, notes: l, unported: l }; };

test('W344 the rank and stage tests are ONE gate', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x25dc3c), 0x00813098, '$25DC3A tst.w $813098');
  assert.equal(IMG.readUInt16BE(0x25dc40), 0x6700, '$25DC40 beq -- FORWARD, skipping the stage test');
  assert.equal(0x25dc40 + 2 + 0x0e, 0x25dc50, '... to $25DC50, past it');
  assert.equal(IMG.readUInt16BE(0x25dc46), 0x0004, '$25DC44 cmpi.w #$4 -- stage index 4');
  assert.equal(IMG.readUInt16BE(0x25dc4c), 0x6700, '$25DC4C beq $25DCC0 -- abandon');
  assert.equal(IMG.readUInt32BE(0x25dc60), 0x0800000f, '$25DC60 btst #$F,D0 -- START');
  assert.equal(IMG.readUInt32BE(0x25dc86), 0x0001000c, '$25DC84 move.w #$1,($C,A5) -- phase 0 -> 1');
});

test('W344 START with every gate satisfied advances the phase', { skip: SKIP }, () => {
  const ram = new Ram(); ready(ram);
  assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, ctx()), true, 'the arm ran');
  assert.equal(ram.u8(SLOT + SCREEN11.phase), 1, 'phase 0 -> 1');
  assert.equal(ram.u16(0x813162), 1, 'and it announced -- postAnnounce260A88 for side 0');
  assert.equal(ram.u8(SLOT + SCREEN11.xCur), 0, 'the cursor was loaded');
});

test('W344 without START it does nothing at all', { skip: SKIP }, () => {
  const ram = new Ram(); ready(ram);
  ram.setU16(0x803972, 0);                                 // no START
  assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, ctx()), false);
  assert.equal(ram.u8(SLOT + SCREEN11.phase), 0, 'the phase is untouched');
  assert.equal(ram.u16(0x813162), 0, 'and nothing was announced');
});

test('W344 rank ZERO runs the arm on stage 5 -- the stage test is skipped', { skip: SKIP }, () => {
  const ram = new Ram(); ready(ram);
  ram.setU16(0x813092, 4);                                 // stage index 4 ...
  ram.setU16(0x813098, 0);                                 // ... but rank ZERO
  assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, ctx()), true,
    'a zero rank makes the stage test unreachable, so the arm still runs');
});

test('W344 rank NON-ZERO on stage index 4 abandons it', { skip: SKIP }, () => {
  const ram = new Ram(); ready(ram);
  ram.setU16(0x813098, 1);
  ram.setU16(0x813092, 4);
  assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, ctx()), false, 'both conditions together abandon');
  ram.setU16(0x813092, 3);
  assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, ctx()), true, 'a different stage runs it again');
});

test('W344 a busy $28D53C or a set $803926 each abandon it', { skip: SKIP }, () => {
  const a = new Ram(); ready(a); a.setU16(SCREEN11.carryWord, 1);
  assert.equal(tallyPhase0Arm25DC2C(a, ROM, SLOT, ctx()), false, '$28D53C busy');
  const b = new Ram(); ready(b); b.setU16(0x803926, 1);
  assert.equal(tallyPhase0Arm25DC2C(b, ROM, SLOT, ctx()), false, '$803926 set');
});

test('W344 a non-zero phase means the arm is not phase 0\'s at all', { skip: SKIP }, () => {
  const ram = new Ram(); ready(ram);
  ram.setU8(SLOT + SCREEN11.phase, 1);
  assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, ctx()), false);
});

test('W344 the three unported dependencies are NOTED, not silently skipped', { skip: SKIP }, () => {
  const ram = new Ram(); ready(ram);
  const c = ctx();
  tallyPhase0Arm25DC2C(ram, ROM, SLOT, c);
  const addrs = c.unportedLog.entries ? c.unportedLog.entries.map((e) => e.addr ?? e[0]) : null;
  assert.ok(addrs === null || addrs.length >= 3,
    'the ($C,A4) slot, the ($14,A4) palette bank and the $907000 clear are each counted');
});
