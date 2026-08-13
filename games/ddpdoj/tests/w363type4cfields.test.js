// W363: pin T4C's structure against the cartridge.
//
// $4C's layout was established from FOUR independent directions in W354/W356, and every one of them is a
// byte-level fact rather than a judgement, so all four are pinned here. That matters because the old handoff
// note for this type -- "eight state handlers (~2300 bytes)" with eight unported callees -- was wrong in both
// halves, and nothing in the suite would have caught it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TYPE_SPECS } from '../src/handlers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';
const T4C = TYPE_SPECS.get(0x4c);

test('W363 T4C exists and is still marked unwritten', { skip: SKIP }, () => {
  assert.ok(T4C, 'T4C is registered');
  assert.equal(T4C.ported, false, 'handler4C is not written');
});

test('W363 confirmation 1 -- ($4,A5) = 4, so FIVE sub-records', { skip: SKIP }, () => {
  // $26F4DA move.w #$4,($4,A5). The convention is run length + 1, so 4 means five.
  assert.equal(IMG.readUInt16BE(0x26f4da), 0x3b7c, '$26F4DA move.w #imm,(d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f4dc), T4C.subRecords - 1, '  ...#$4 -- run length + 1 = five');
  assert.equal(IMG.readUInt16BE(0x26f4de), 0x0004, '  ...into ($4,A5), the run-length field');
  assert.equal(IMG.readUInt16BE(0x26f4e0), 0x4e75, '$26F4E0 rts -- the init proper ends here');
});

test('W363 confirmation 2 -- the window length decomposes as $C + $A0 = $AC', { skip: SKIP }, () => {
  // $26F4F4 move.w #$5,D0 for loadRecordProto, so D0 + 1 = SIX words = $C bytes.
  assert.equal(IMG.readUInt16BE(0x26f4f4), 0x303c, '$26F4F4 move.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x26f4f6) + 1, T4C.recordWords, '  ...D0 + 1 = six words');
  const recBytes = T4C.recordWords * 2;
  const subBytes = T4C.subRecords * T4C.subStride;
  assert.equal(recBytes, 0x0c, 'six words is $C bytes');
  assert.equal(subBytes, 0xa0, 'five sub prototypes at $20 is $A0 bytes');
  assert.equal(T4C.recordProto + recBytes, T4C.subProto,
    'the record prototype ends exactly where the sub prototypes begin');
  assert.equal(recBytes + subBytes, 0xac,
    'so W342 declaring $26F55A + $AC decomposes exactly -- two arguments agreeing to the byte');
});

test('W363 confirmation 3 -- the depth formula gives the TWENTY-byte overlap', { skip: SKIP }, () => {
  const depth = T4C.subRecords * T4C.subStride - (T4C.handler - T4C.subProto);
  assert.equal(depth, T4C.overlapBytes, 'subRecords * $20 - (handler - subProto) = $14');
  assert.equal(depth, 0x14, 'twenty bytes, matching W342s directly-read figure');
});

test('W363 confirmation 4 -- part 5s prototype tail IS the handlers opcodes', { skip: SKIP }, () => {
  // The fifth $20 block starts $8C past subProto, and the handler is $14 into it.
  const part5 = T4C.subProto + 4 * T4C.subStride;
  assert.equal(part5 + 0x0c, T4C.handler, 'the handler begins $C into part 5s block');
  // And what part 5 receives at its +$0C is executable: tst.w $8130D2.
  assert.equal(IMG.readUInt16BE(T4C.handler), 0x4a79, 'the handler opens tst.w abs.l');
  assert.equal(IMG.readUInt32BE(T4C.handler + 2), 0x008130d2,
    '  ...on $8130D2 -- so part 5s $0C..$0F receive 4a79 0081, not designed values');
});

test('W363 ($17,A5) is a DRAW-STUB SELECTOR here, not a mode', { skip: SKIP }, () => {
  // $26F790 tst.b ($17,A5) / bne, then two tail-JUMPS to different emit stubs.
  assert.equal(IMG.readUInt16BE(0x26f790), 0x4a2d, '$26F790 tst.b (d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f792), T4C.drawSelectAt, '  ...($17,A5)');
  assert.equal(IMG.readUInt16BE(0x26f798), 0x4ef9, '$26F798 jmp abs.l -- a TAIL JUMP, not a call');
  assert.equal(IMG.readUInt32BE(0x26f79a), T4C.drawStubs[0], '  ...zero -> $23DECE');
  assert.equal(IMG.readUInt16BE(0x26f7a0), 0x4ef9, '$26F7A0 jmp abs.l');
  assert.equal(IMG.readUInt32BE(0x26f7a2), T4C.drawStubs[1], '  ...non-zero -> $23DF58');
  // The whole point: $55 gives this byte four cascade values and $46 five modes. Here it picks a DRAW.
  assert.equal(T4C.drawStubs.length, 2, 'two stubs, so the byte is a boolean here');
});

test('W363 all three word comparisons in the span are the SAME ramp test', { skip: SKIP }, () => {
  for (const at of T4C.rampSites) {
    assert.equal(IMG.readUInt16BE(at), 0x0c6d, `$${at.toString(16)} cmpi.w #imm,(d16,A5)`);
    assert.equal(IMG.readUInt16BE(at + 2), T4C.rampCap, `  ...#$${T4C.rampCap.toString(16)}`);
    assert.equal(IMG.readUInt16BE(at + 4), T4C.rampAt, `  ...on ($${T4C.rampAt.toString(16)},A5)`);
  }
  assert.equal(T4C.rampSites.length, 3, 'three sites, one test -- so the ramp gates three arms');
});
