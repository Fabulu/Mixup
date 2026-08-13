// W369: HIBACHI $B0's init body $2A42DC, checked against the cartridge.
//
// The body landed because the type was UNSPAWNABLE: TB0 carried `ported: false` after W363 registered
// handler2A4606, which made w346's registry tests skip the type, so nobody noticed no init body existed.
// `runInitBodyAddr` throws by address, so every boss spawn threw and stage 5 could not be completed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = !existsSync(ROM) && 'no decrypted ROM';
const IMG = SKIP ? null : readFileSync(ROM);

test('W369 the body is REGISTERED -- the whole point of the wave', () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x2a42dc),
    'a BODY.set below `INIT_BODY_ADDRESSES = [...BODY.keys()]` registers nothing (the $55 trap)');
});

test('W369 the ten scheduler slots are NOT sequential', { skip: SKIP }, () => {
  // $2A4334..$2A4382: ten `moveq #N,D0 / jsr $2598E6`. Read N from each moveq. A loop 0..9 would
  // visit the same ten slots in the wrong order, and these set RUN bits, so order is script order.
  const got = [];
  for (let i = 0; i < 10; i++) {
    const at = 0x2a4334 + i * 8;
    assert.equal(IMG[at], 0x70, `$${at.toString(16)} moveq #N,D0`);
    got.push(IMG[at + 1]);
    assert.equal(IMG.readUInt16BE(at + 2), 0x4eb9, '  ...jsr abs.l');
    assert.equal(IMG.readUInt32BE(at + 4), 0x002598e6, '  ...$2598E6, the A2 RUN-bit set');
  }
  assert.deepEqual(got, [0, 1, 2, 5, 4, 3, 8, 7, 6, 9],
    'two descending runs inside an ascending one -- transcribe, do not loop');
});

test('W369 the nine palette banks end with $0F, out of order', { skip: SKIP }, () => {
  // $2A438C..$2A441A: nine `move.w #bank,D0 / lea block,A0 / jsr $24150A`, blocks stepping +$40.
  const banks = [];
  for (let i = 0; i < 9; i++) {
    const at = 0x2a438c + i * 0x10;
    assert.equal(IMG.readUInt16BE(at), 0x303c, `$${at.toString(16)} move.w #imm,D0`);
    banks.push(IMG.readUInt16BE(at + 2));
    assert.equal(IMG.readUInt16BE(at + 4), 0x41f9, '  ...lea abs.l,A0');
    assert.equal(IMG.readUInt32BE(at + 6), 0x223038 + i * 0x40, '  ...block stepping by $40');
    assert.equal(IMG.readUInt32BE(at + 12), 0x0024150a, '  ...jsr $24150A');
  }
  assert.deepEqual(banks, [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x0f],
    'bank $0F takes the NINTH block -- sorting the banks pairs it with the wrong one');
});

test('W369 $2A6E74 arms EIGHT parts, and $1A0 is the eighth', { skip: SKIP }, () => {
  // This is the same out-of-sequence position TB0's eleven-offset handler list gives $1A0, and it is
  // why that list is three arming routines concatenated rather than a range.
  assert.equal(IMG.readUInt16BE(0x2a6e74), 0x303c, '$2A6E74 move.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x2a6e76), 0x8000, '  ...#$8000');
  assert.equal(IMG.readUInt16BE(0x2a6e78), 0x3c80, '$2A6E78 move.w D0,(A6) -- part 0, no displacement');
  const offs = [0x00];
  for (let at = 0x2a6e7a; at < 0x2a6e96; at += 4) {
    assert.equal(IMG.readUInt16BE(at), 0x3d40, `$${at.toString(16)} move.w D0,(d16,A6)`);
    offs.push(IMG.readUInt16BE(at + 2));
  }
  assert.equal(IMG.readUInt16BE(0x2a6e96), 0x4e75, '$2A6E96 rts -- eight stores, then done');
  assert.deepEqual(offs, [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0],
    '$1A0 EIGHTH: $E0/$100/$120 are armed by nobody, which is why the handler skips them');
  // The other three of the handler's eleven come from two SEPARATE entry points.
  assert.equal(IMG.readUInt16BE(0x2a6e9c), 0x3d40, '$2A6E9C move.w D0,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x2a6e9e), 0x0140, '  ...$140, armed by $2A6E98');
  assert.equal(IMG.readUInt16BE(0x2a6ea2), 0x0160, '  ...$160, same routine');
  assert.equal(IMG.readUInt16BE(0x2a6eaa), 0x3d40, '$2A6EAA move.w D0,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x2a6eac), 0x0180, '  ...$180, armed by $2A6EA6 alone');
  assert.equal(IMG.readUInt16BE(0x2a6eae), 0x4e75, '  ...then rts -- one store, its own entry point');
});

test('W369 the loop counter picks A1, and the branch skips the RELOAD', { skip: SKIP }, () => {
  // `tst.w $813098 / bne` skips `lea $2A92A8,A1`, so the reload happens when the counter is ZERO:
  // the FIRST loop gets $2A92A8 and later loops keep $2A72C8. Reading it the other way swaps the
  // boss's whole A1 script set between loops.
  assert.equal(IMG.readUInt16BE(0x2a4306), 0x43f9, '$2A4306 lea abs.l,A1');
  assert.equal(IMG.readUInt32BE(0x2a4308), 0x002a72c8, '  ...$2A72C8 -- the DEFAULT');
  assert.equal(IMG.readUInt16BE(0x2a431e), 0x4a79, '$2A431E tst.w abs.l');
  assert.equal(IMG.readUInt32BE(0x2a4320), 0x00813098, '  ...$813098, the loop counter');
  assert.equal(IMG.readUInt16BE(0x2a4324), 0x6600, '$2A4324 bne.w -- the word form');
  assert.equal(0x2a4326 + IMG.readInt16BE(0x2a4326), 0x2a432e, '  ...past the reload, to the jsr');
  assert.equal(IMG.readUInt16BE(0x2a4328), 0x43f9, '$2A4328 lea abs.l,A1 -- reached only when ZERO');
  assert.equal(IMG.readUInt32BE(0x2a432a), 0x002a92a8, '  ...$2A92A8, the FIRST-loop set');
});

test('W369 all sixteen sub-prototypes are the LONG form, ending AT the handler', { skip: SKIP }, () => {
  // The window size was walked, not assumed: the short form is 16 table bytes and the long form 28,
  // so guessing would have mis-sized it by 192 bytes.
  assert.equal(IMG.readUInt16BE(0x2a42d4), 0x3b7c, '$2A42D4 move.w #imm,($4,A5) -- the init stub');
  assert.equal(IMG.readUInt16BE(0x2a42d6), 0x000f, '  ...#$F, so 15 + 1 = SIXTEEN sub-records');
  let a0 = 0x2a4446;
  for (let n = 0; n < 16; n++) {
    assert.ok((IMG.readUInt16BE(a0) & 0x8000) !== 0, `sub-proto ${n} is the LONG form`);
    a0 += 2 + 26;
  }
  assert.equal(a0, 0x2a4606, 'the sixteen end exactly AT the handler $2A4606, which bounds the window');
});
