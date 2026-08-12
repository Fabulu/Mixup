// W344 -- the `$907000` slot table and `$23C668`, its clear.
//
// Four instructions took three corrections to size, and this file pins the two independent measurements
// that finally agreed:
//   * `$23C668`'s `#$FF` + `dbra` is 256 longwords -> $400 bytes;
//   * `$2593F8`'s `cmpa.l A0,A1` with A1 = $907400 makes that address the EXCLUSIVE end.
// An earlier reading of mine took $907400 for a second buffer and sized the region at $800. The clear
// covering only half of that was the contradiction; the test below encodes the agreement instead.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Unreached } from '../src/unported.js';
import { SlotTable907000, clearSlotTable23C668 } from '../src/background.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

test('W344 two independent measurements of the extent AGREE on $400', { skip: SKIP }, () => {
  // Measurement one: the clear's iteration count.
  assert.equal(IMG.readUInt32BE(0x23c66a), 0x00907000, '$23C668 lea $907000,A0');
  assert.equal(IMG.readUInt16BE(0x23c670), 0x00ff, '$23C66E move.w #$FF,D0 -- 256 with dbra');
  assert.equal(IMG.readUInt16BE(0x23c672), 0x20fc, '$23C672 move.l #imm,(A0)+ -- a LONGWORD store');
  assert.equal(256 * 4, 0x400, 'so 256 longwords is $400 bytes');
  // Measurement two: the consumer's end pointer.
  assert.equal(IMG.readUInt32BE(0x2592d8), 0x00907400, '$2592D6 lea $907400,A1');
  assert.equal(IMG.readUInt16BE(0x25941c), 0xb3c8, '$25941C cmpa.l A0,A1');
  assert.equal(IMG.readUInt16BE(0x25941e), 0x66d8, '$25941E bne -- so A1 is the EXCLUSIVE end');
  assert.equal(0x907400 - 0x907000, 0x400, 'and start-to-end is the same $400');
  // The two agree, which is the check that failed for the "pair of buffers" reading.
  assert.equal(SlotTable907000.END - SlotTable907000.BASE, 256 * 4);
  assert.equal(SlotTable907000.SLOTS, 0x100);
});

test('W344 $2593F8 is a search-and-claim returning success in carry', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x25940a), 0xb090, '$25940A cmp.l (A0),D0 -- compare a slot');
  assert.equal(IMG.readUInt16BE(0x259410), 0x2085, '$259410 move.l D5,(A0) -- claim it');
  assert.equal(IMG.readUInt16BE(0x259418), 0x41e8, '$259418 lea ($4,A0),A0 -- a LONGWORD step');
  assert.equal(IMG.readUInt32BE(0x259420), 0x027cfffe, '$259420 andi #$FFFE,SR -- carry CLEAR = success');
});

test('W344 the clear zeroes every one of the 256 slots', () => {
  const t = new SlotTable907000();
  for (let a = SlotTable907000.BASE; a < SlotTable907000.END; a += 4) t.setLong(a, 0xdeadbeef);
  clearSlotTable23C668(t);
  for (let a = SlotTable907000.BASE; a < SlotTable907000.END; a += 4) {
    assert.equal(t.long(a), 0, `slot at $${a.toString(16)} cleared`);
  }
});

test('W344 the LAST slot is cleared -- the off-by-one #$FF invites', () => {
  const t = new SlotTable907000();
  t.setLong(0x9073fc, 0xffffffff);
  clearSlotTable23C668(t);
  assert.equal(t.long(0x9073fc), 0,
    'a 255-iteration reading would leave this slot claimable by $2593F8');
});

test('W344 an address outside the table, or misaligned, THROWS by address', () => {
  const t = new SlotTable907000();
  assert.throws(() => t.setLong(0x907400, 1),
    (e) => e instanceof Unreached && e.romAddress === 0x2593f8, '$907400 is EXCLUSIVE');
  assert.throws(() => t.setLong(0x906ffc, 1),
    (e) => e instanceof Unreached && e.romAddress === 0x2593f8, 'below the base');
  assert.throws(() => t.setLong(0x907002, 1),
    (e) => e instanceof Unreached && e.romAddress === 0x2593f8, 'misaligned by two');
});

test('W344 it is outside every video object the port already had', () => {
  // TxVram covers $904000..$905FFF (4096 words); $907000 is $1000 past its end. That is why a new
  // object was needed and why writing this through `Ram` threw.
  assert.equal(0x904000 + 64 * 32 * 2 * 2 - 1, 0x905fff, 'TxVram ends at $905FFF');
  assert.ok(SlotTable907000.BASE > 0x905fff, 'and the slot table starts past it');
  assert.equal(SlotTable907000.BASE - (0x905fff + 1), 0x1000, 'by exactly $1000');
});
