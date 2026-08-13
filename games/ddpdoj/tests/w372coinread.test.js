// W372: D35's anchor -- $13CFBA, IRQ6's coin/service read, noted UNPORTED in isr.js since wave 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = !existsSync(ROM) && 'no decrypted ROM';
const IMG = SKIP ? null : readFileSync(ROM);

test('W372 the coin read is EDGE detection over THREE words, not a level read', { skip: SKIP }, () => {
  // $13CFBA lea $C08004,A0 / move.w (A0),D0 -- the same hardware port main-loop call #1 reads.
  assert.equal(IMG.readUInt16BE(0x13cfba), 0x41f9, '$13CFBA lea abs.l,A0');
  assert.equal(IMG.readUInt32BE(0x13cfbc), 0x00c08004, '  ...$C08004, the switch port');
  assert.equal(IMG.readUInt16BE(0x13cfc0), 0x3010, '$13CFC0 move.w (A0),D0 -- this frame s switches');
  // D1 takes the PREVIOUS raw word before the new one overwrites it. That is the edge state, and it
  // is a THIRD word -- $803952 -- separate from the raw $803950 and the masked $803954.
  assert.equal(IMG.readUInt16BE(0x13cfc2), 0x3239, '$13CFC2 move.w abs.l,D1');
  assert.equal(IMG.readUInt32BE(0x13cfc4), 0x00803952, '  ...$803952, LAST frame s word');
  assert.equal(IMG.readUInt32BE(0x13cfca), 0x00803952, '$13CFC8 stores this frame s word back to it');
  // not.w makes the ACTIVE-LOW switches read as 1 = pressed.
  assert.equal(IMG.readUInt16BE(0x13cfce), 0x4640, '$13CFCE not.w D0 -- the switches are ACTIVE LOW');
  assert.equal(IMG.readUInt32BE(0x13cfd2), 0x00803950, '$13CFD0 stores it raw to $803950');
  // and.w D0,D1 with D0 = pressed-now and D1 = NOT-pressed-before gives NEWLY PRESSED.
  assert.equal(IMG.readUInt16BE(0x13cfd6), 0xc240, '$13CFD6 and.w D0,D1 -- pressed NOW and not before');
  assert.equal(IMG.readUInt16BE(0x13cfd8), 0x0241, '$13CFD8 andi.w #imm,D1');
  assert.equal(IMG.readUInt16BE(0x13cfda), 0x00e0, '  ...#$E0 -- bits 5, 6 and 7 only');
  assert.equal(IMG.readUInt32BE(0x13cfde), 0x00803954, '$13CFDC stores the EDGES to $803954');
  // So a port storing the level rather than the edge coins up once per FRAME held, not once per press.
  assert.equal(IMG.readUInt16BE(0x13cfea), 0x0801, '$13CFEA btst #imm,D1 -- and bit 5 is tested first');
});
