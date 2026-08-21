// W344 -- `$25DA94`, the UPWARD Y-row search. Phase 0's last dependency.
//
// It is NOT a duplicate of `tallyYCursor25DEAE` ($25DEAE), which loops on the same predicate in the
// OPPOSITE direction: $25DEBC/$25DEE6 walk DOWN with `subq.b` wrapping 0 -> 2, while $25DAA2 walks UP
// with `addq.b` wrapping 2 -> 0. Two routines, one predicate, opposite directions -- worth a test so
// nobody "unifies" them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { pickFreeYRow25DA94, SCREEN11 } from '../src/tallyscreen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';
const ROM = {
  u32(at) {
    if (IMG) return IMG.readUInt32BE(at);
    return at === SCREEN11.descA + 0x10 ? SCREEN11.savedA : SCREEN11.savedB;
  },
};

/** a real object-record slot -- $80E240 is the one W93's witness uses. */
const SLOT = 0x80e240;

test('W344 it walks UP where $25DEAE walks DOWN', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x25daa2), 0x5207, '$25DAA2 addq.b #1,D7 -- UPWARD');
  assert.equal(IMG.readUInt32BE(0x25daa4), 0x0c070002, '$25DAA4 cmpi.b #$2,D7');
  assert.equal(IMG.readUInt16BE(0x25daaa), 0x7e00, '$25DAAA moveq #$0,D7 -- wraps 2 -> 0');
  // The other routine, for contrast.
  assert.equal(IMG.readUInt16BE(0x25debc), 0x5307, '$25DEBC subq.b #1,D7 -- DOWNWARD, wrapping 0 -> 2');
});

test('W344 the moveq before the move.b is a ZERO-EXTEND, not redundancy', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x25da94), 0x7e00, '$25DA94 moveq #$0,D7');
  assert.equal(IMG.readUInt32BE(0x25da96), 0x1e2d000f, '$25DA96 move.b ($F,A5),D7 -- LOW BYTE only');
  // Three genuinely dead instructions were found elsewhere this session; this one is not one of them,
  // because $25DAEA is reached with D7 as a whole register.
  assert.notEqual(IMG.readUInt16BE(0x25da9a), 0x4e75, 'and $25DA9A is the bsr, not an rts');
});

test('W344 it accepts the current row when the other side does not hold it', () => {
  const ram = new Ram();
  ram.setU8(SCREEN11.savedA + 1, 0xff);                    // "nothing saved" -> not held
  ram.setU8(SCREEN11.savedB + 1, 0xff);
  ram.setU32(SLOT + SCREEN11.desc, SCREEN11.descA);
  ram.setU8(SLOT + SCREEN11.yCur, 1);
  const got = pickFreeYRow25DA94(ram, ROM, SLOT, {});
  assert.equal(got, 1, 'the current cursor is kept when it is free');
  assert.equal(ram.u8(SLOT + SCREEN11.yCur), 1, 'and written back');
  assert.equal(ram.u8(SCREEN11.savedA + 1), 1, 'the complete body publishes it through descriptor +$10');
});

test('W344 it starts from the CURRENT cursor, not from zero', () => {
  const ram = new Ram();
  ram.setU8(SCREEN11.savedA + 1, 0xff);
  ram.setU8(SCREEN11.savedB + 1, 0xff);
  ram.setU32(SLOT + SCREEN11.desc, SCREEN11.descA);
  ram.setU8(SLOT + SCREEN11.yCur, 2);
  assert.equal(pickFreeYRow25DA94(ram, ROM, SLOT, {}), 2,
    'a free row 2 is kept -- a from-zero search would have returned 0');
  assert.equal(ram.u8(SCREEN11.savedA + 1), 2, 'the accepted current row reaches the saved record');
});
