// W343 -- `$25FD94`, the ONE-PLAYER flag. Docket D24/D31.
//
// This file exists because the routine's meaning is decided by its LAST NINE BYTES, and four earlier
// readings of it (all mine) stopped before them and concluded the opposite. It counts, subtracts one,
// and then INVERTS the result into a 0/1 flag:
//
//     0 players -> $81308E = $FFFF, FREEZE, $81308C = 0
//     1 player  -> $81308E = $0000,         $81308C = 1     <-- the owner's case
//     2 players -> $81308E = $0001,         $81308C = 0
//
// `laser.js:1029` gates the hyper beam's impact on `$81308C !== 0`, so a port that never wrote this
// field showed no laser impact in one-player play -- which is exactly what was reported.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RAM, playerFlags25FD94, setFreeze25FD82, clearFreeze25FD8C } from '../src/machine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

test('W343 the routine ENDS by inverting the count into a 0/1 flag', { skip: SKIP }, () => {
  // The nine bytes that decide everything. Reading only as far as the subq at $25FDC2 says the
  // laser impact is two-player-only; these say the opposite.
  assert.equal(IMG.readUInt16BE(0x25fdc2), 0x5379, '$25FDC2 subq.w #1 -- where I kept stopping');
  assert.equal(IMG.readUInt16BE(0x25fde2), 0x0c79, '$25FDE2 cmpi.w');
  assert.equal(IMG.readUInt16BE(0x25fde4), 0x0000, '... #$0');
  assert.equal(IMG.readUInt32BE(0x25fde6), 0x0081308c, '... against $81308C');
  assert.equal(IMG.readUInt16BE(0x25fdea), 0x6600, '$25FDEA bne $25FDF8');
  assert.equal(IMG.readUInt16BE(0x25fdee), 0x33fc, '$25FDEE move.w #imm');
  assert.equal(IMG.readUInt16BE(0x25fdf0), 0x0001, '... #$1 -- ONE player sets it to ONE');
  assert.equal(IMG.readUInt16BE(0x25fdf8), 0x4279, '$25FDF8 clr.w -- two or none clears it');
});

test('W343 the two structures are the game-state in-play records, not the object records',
  { skip: SKIP }, () => {
    assert.equal(IMG.readUInt32BE(0x25fd96), 0x008130fa, '$25FD94 lea $8130FA,A2');
    assert.equal(IMG.readUInt32BE(0x25fd9c), 0x0081311e, '$25FD9A lea $81311E,A3');
    assert.equal(RAM.inPlay1, 0x8130fa);
    assert.equal(RAM.inPlay2, 0x81311e);
    assert.notEqual(RAM.inPlay1, RAM.player1, 'NOT the $8103E6 object record -- a wrong guess of mine');
    assert.equal(IMG.readUInt32BE(0x25fda6), 0x202a0018, '$25FDA6 move.l ($18,A2),D0 -- only +$18');
    assert.equal(IMG.readUInt32BE(0x25fdb4), 0x202b0018, '$25FDB4 move.l ($18,A3),D0');
  });

test('W343 the freeze pair is two instructions each', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x25fd82), 0x33fc, '$25FD82 move.w #imm');
  assert.equal(IMG.readUInt16BE(0x25fd84), 0x0001, '... #$1');
  assert.equal(IMG.readUInt32BE(0x25fd86), 0x008130d2, '... to $8130D2 -- SET the freeze');
  assert.equal(IMG.readUInt16BE(0x25fd8c), 0x4279, '$25FD8C clr.w');
  assert.equal(IMG.readUInt32BE(0x25fd8e), 0x008130d2, '... $8130D2 -- CLEAR it');
  const ram = new Ram();
  setFreeze25FD82(ram); assert.equal(ram.u16(RAM.freeze), 1);
  clearFreeze25FD8C(ram); assert.equal(ram.u16(RAM.freeze), 0);
});

test('W343 ONE player sets the flag to 1 -- the case the laser impact needs', () => {
  const ram = new Ram();
  ram.setU32(RAM.inPlay1 + 0x18, 0x00001234);              // P1 in play, P2 not
  const r = playerFlags25FD94(ram);
  assert.deepEqual(r, { count: 1, onePlayer: true, frozen: false });
  assert.equal(ram.u16(RAM.onePlayerFlag), 1, '$81308C = 1, so laser.js:1029 FIRES');
  assert.equal(ram.u16(RAM.playerCountM1), 0, '$81308E = count - 1 = 0');
  assert.equal(ram.u16(RAM.freeze), 0, 'and the game is not frozen');
});

test('W343 TWO players CLEAR the flag', () => {
  const ram = new Ram();
  ram.setU32(RAM.inPlay1 + 0x18, 1);
  ram.setU32(RAM.inPlay2 + 0x18, 1);
  const r = playerFlags25FD94(ram);
  assert.deepEqual(r, { count: 2, onePlayer: false, frozen: false });
  assert.equal(ram.u16(RAM.onePlayerFlag), 0, '$81308C = 0 in two-player play');
  assert.equal(ram.u16(RAM.playerCountM1), 1);
});

test('W343 NO players FREEZE the game and clear the flag', () => {
  const ram = new Ram();
  const r = playerFlags25FD94(ram);
  assert.deepEqual(r, { count: 0, onePlayer: false, frozen: true });
  assert.equal(ram.u16(RAM.playerCountM1), 0xffff, '$81308E = -1');
  assert.equal(ram.u16(RAM.freeze), 1, 'and $8130D2 is SET -- the game-over freeze');
  assert.equal(ram.u16(RAM.onePlayerFlag), 0);
});

test('W343 only the +$18 longword matters, and only its zero-ness', () => {
  const a = new Ram(); a.setU32(RAM.inPlay1 + 0x18, 1);
  const b = new Ram(); b.setU32(RAM.inPlay1 + 0x18, 0xffffffff);
  assert.equal(playerFlags25FD94(a).count, playerFlags25FD94(b).count,
    'any non-zero value counts the same');
  const c = new Ram(); c.setU32(RAM.inPlay1 + 0x14, 0xffffffff);   // the WRONG offset
  assert.equal(playerFlags25FD94(c).count, 0, '+$14 is not read -- the offset is $18');
});

test('W343 the freeze is CLEARED before it may be re-set, so a recovering player unfreezes', () => {
  const ram = new Ram();
  ram.setU16(RAM.freeze, 1);                               // frozen from a previous frame
  ram.setU32(RAM.inPlay1 + 0x18, 1);                       // ... and now a player is in play
  playerFlags25FD94(ram);
  assert.equal(ram.u16(RAM.freeze), 0,
    '$25FDD2 clears unconditionally BEFORE $25FDD4 decides to re-set it');
});
