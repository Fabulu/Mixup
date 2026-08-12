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
import { Unreached } from '../src/unported.js';
import { tallyBonusDispatch25FF7A, BONUS_LINES } from '../src/tallyscreen.js';
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

// --- $25FF7A, the bonus-line dispatcher: the missing link between the mailbox and the flag.

test('W343 the table has TEN entries and is bounded by the dispatcher\'s own lea', { skip: SKIP }, () => {
  const want = [0, 0x25ffa8, 0x260056, 0x26010e, 0x2601f4,
    0x2602b6, 0x260348, 0x26035a, 0x26037c, 0x2603b0];
  want.forEach((v, i) => assert.equal(IMG.readUInt32BE(0x25ff52 + i * 4), v, `entry ${i}`));
  assert.deepEqual([...BONUS_LINES], want, 'and the port carries all ten -- an earlier note said NINE');
  assert.equal(0x25ff52 + 10 * 4, 0x25ff7a, 'entry 10 would be the dispatcher itself');
  assert.equal(IMG.readUInt16BE(0x25ff7a), 0x4df9, '... which is `lea $8130FA,A6` -- CODE');
  // And the ROM does NOT mask the request, which is why the port guards it.
  assert.equal(IMG.readUInt16BE(0x25ff8c), 0xd040, '$25FF8C add.w D0,D0');
  assert.equal(IMG.readUInt16BE(0x25ff8e), 0xd040, '$25FF8E add.w D0,D0 -- two bare adds, no andi');
});

test('W343 the dispatcher walks TWO sides at a $24 stride', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x25ff80), 0x7e01, '$25FF80 moveq #$1,D7 -- plus dbra = TWO');
  assert.equal(IMG.readUInt16BE(0x25ff82), 0x3016, '$25FF82 move.w (A6),D0 -- the posted request');
  assert.equal(IMG.readUInt32BE(0x25ff9e), 0x4dee0024, '$25FF9E lea ($24,A6),A6');
  assert.equal(0x81311e - 0x8130fa, 0x24, 'and $24 is exactly the two records\' separation');
  assert.equal(IMG.readUInt16BE(0x25ffa2), 0x51cf, '$25FFA2 dbra D7');
});

test('W343 a request on side 0 dispatches and, for entries 2/3/4, sets the ONE-PLAYER flag', () => {
  for (const req of [2, 3, 4]) {
    const ram = new Ram();
    const notes = [];
    const ctx = { unported: { note: (a, m) => notes.push([a, m]) } };
    ram.setU32(RAM.inPlay1 + 0x18, 1);                     // one player in play
    ram.setU16(0x8130fa, req);                             // side 0 posts the request
    assert.equal(tallyBonusDispatch25FF7A(ram, null, ctx), 1, `request ${req} dispatched once`);
    assert.equal(ram.u16(RAM.onePlayerFlag), 1,
      `entry ${req} calls $25FD94, so $81308C becomes 1 -- the laser impact gate opens`);
    assert.equal(notes.length, 1, 'and the body is noted, not invented');
  }
});

test('W343 an entry OUTSIDE 2/3/4 dispatches without touching the flag', () => {
  const ram = new Ram();
  const ctx = { unported: { note: () => {} } };
  ram.setU32(RAM.inPlay1 + 0x18, 1);
  ram.setU16(0x8130fa, 7);                                 // entry 7 = $26035A, no $25FD94 call
  assert.equal(tallyBonusDispatch25FF7A(ram, null, ctx), 1);
  assert.equal(ram.u16(RAM.onePlayerFlag), 0, 'entry 7 does not call $25FD94, so the flag stays 0');
});

test('W343 request 0 dispatches nothing, and BOTH sides are walked', () => {
  const ram = new Ram();
  const ctx = { unported: { note: () => {} } };
  assert.equal(tallyBonusDispatch25FF7A(ram, null, ctx), 0, 'two zero requests -> nothing');
  ram.setU16(0x81311e, 2);                                 // only SIDE 1 posts
  assert.equal(tallyBonusDispatch25FF7A(ram, null, ctx), 1,
    'side 1 is reached, so the $24 stride and the two-iteration loop both work');
});

test('W343 a request past the table THROWS rather than jumping into the dispatcher', () => {
  const ram = new Ram();
  const ctx = { unported: { note: () => {} } };
  ram.setU16(0x8130fa, 10);                                // one past the last entry
  assert.throws(() => tallyBonusDispatch25FF7A(ram, null, ctx),
    (e) => e instanceof Unreached && e.romAddress === 0x25ff92);
});
