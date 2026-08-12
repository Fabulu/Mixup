// W344 -- `$260A20` and `$260A88`: the announce mailbox's side selector and its poster.
//
// Two things worth a test: the selector uses `tst.b`, so only D0's LOW BYTE chooses a side; and the poster
// uses the same (request, state) shape as `tallyRequest25FF38`, which makes that a house pattern rather
// than one routine's habit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { announceMailbox260A20, postAnnounce260A88 } from '../src/rank.js';
import { tallyRequest25FF38 } from '../src/tallyscreen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

test('W344 the selector is tst.b, so only D0\'s LOW BYTE picks the side', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x260a22), 0x00813162, '$260A20 lea $813162,A4 -- side 0');
  assert.equal(IMG.readUInt16BE(0x260a26), 0x4a00, '$260A26 tst.b D0 -- a BYTE test');
  assert.equal(IMG.readUInt32BE(0x260a2e), 0x00813166, '$260A2C lea $813166,A4 -- side 1');
  assert.equal(0x813166 - 0x813162, 4, 'and the two mailboxes are one word pair apart');
  assert.equal(announceMailbox260A20(0), 0x813162);
  assert.equal(announceMailbox260A20(1), 0x813166);
  assert.equal(announceMailbox260A20(0x0100), 0x813162,
    'a caller passing $0100 gets side 0 -- tst.b ignores the high byte');
  assert.equal(announceMailbox260A20(0x01ff), 0x813166, 'and $01FF gets side 1');
});

test('W344 the poster writes request 1 and clears the state', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x260a88), 0x2f0c, '$260A88 move.l A4,-(A7)');
  assert.equal(IMG.readUInt32BE(0x260a8c), 0x38bc0001, '$260A8C move.w #$1,(A4)');
  assert.equal(IMG.readUInt32BE(0x260a90), 0x397c0000, '$260A90 move.w #$0,($2,A4)');
  assert.equal(IMG.readUInt16BE(0x260a96), 0x285f, '$260A96 movea.l (A7)+,A4');
  const ram = new Ram();
  assert.equal(postAnnounce260A88(ram, 0), 0x813162);
  assert.equal(ram.u16(0x813162), 1, 'request := 1');
  assert.equal(ram.u16(0x813164), 0, 'state := 0');
  ram.setU16(0x813168, 0xbeef);
  assert.equal(postAnnounce260A88(ram, 1), 0x813166);
  assert.equal(ram.u16(0x813166), 1);
  assert.equal(ram.u16(0x813168), 0, 'side 1\'s state is cleared too');
});

test('W344 it is the SAME mailbox shape as tallyRequest25FF38', () => {
  // Two independent mailboxes, one convention: word 0 is the request, word 1 is the state, and posting
  // clears the state. That makes it a house pattern rather than one routine's habit.
  const a = new Ram();
  postAnnounce260A88(a, 0);
  const b = new Ram();
  b.setU16(0x8130fc, 0xffff);                              // dirty state word
  const rec = tallyRequest25FF38(b, 0, 7);
  assert.equal(rec, 0x8130fa);
  assert.equal(b.u16(rec + 0), 7, 'the tally poster writes ITS request at word 0');
  assert.equal(b.u16(rec + 2), 0, '... and clears word 1, exactly as $260A88 does');
  assert.equal(a.u16(0x813162 + 2), 0, 'both clear the state on post');
});

test('W344 phase 0 announces on the same frame it advances', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x25dc86), 0x0001000c, '$25DC84 move.w #$1,($C,A5) -- phase 0 -> 1');
  assert.equal(IMG.readUInt32BE(0x25dc8a), 0x102d0007, '$25DC8A move.b ($7,A5),D0 -- the SIDE');
  assert.equal(IMG.readUInt32BE(0x25dc90), 0x00260a88, '$25DC8E jsr $260A88 -- immediately after');
});
