// W362: pin Hibachi's eleven per-part calls against the cartridge.
//
// `TB0.partOffsets` is currently my transcription of eleven `lea (part,A6),A0 / jsr $26331C` pairs, and the
// ORDER matters: `$1A0` is called EIGHTH, between `$C0` and `$140`, and `$E0`/`$100`/`$120` are never
// called at all. A port that wrote `for (p = 0; p <= 0x1A0; p += 0x20)` would visit three parts the
// cartridge skips AND place `$1A0` last. So the list is data, and data that came out of my hands needs
// checking -- this wave a hand-computed branch target reached both a commit and a frozen spec const wrong.
//
// It also gives the ELEVEN VERIFIED INSTRUCTION BOUNDARIES that an aligned decoder would need as its
// fixture (see the handoff's tooling-gap note). If someone builds that tool, walk $2A4606 and assert it
// reproduces the `lea` addresses this test already pins.

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

const HANDLER = 0x2a4606;
const HANDLER_END = 0x2a46b0;
const STUB = 0x26331c;

/** Every `jsr $26331C` in the handler, with the part offset its preceding `lea` supplies. */
function partCalls() {
  const out = [];
  for (let a = HANDLER; a < HANDLER_END; a += 2) {
    if (IMG.readUInt16BE(a) !== 0x4eb9 || IMG.readUInt32BE(a + 2) !== STUB) continue;
    // `lea (A6),A0` is 41d6 (2 bytes, offset 0); `lea (d16,A6),A0` is 41ee dddd (4 bytes).
    if (IMG.readUInt16BE(a - 2) === 0x41d6) out.push({ jsr: a, lea: a - 2, off: 0 });
    else out.push({ jsr: a, lea: a - 4, off: IMG.readUInt16BE(a - 2) });
  }
  return out;
}

test('W362 Hibachi makes ELEVEN per-part calls, all to the $26331C stub', { skip: SKIP }, () => {
  const calls = partCalls();
  assert.equal(calls.length, 11, 'eleven `lea (part,A6),A0 / jsr $26331C` pairs');
  // And the stub really is a bare rts, which is why the port transcribes these as comments.
  assert.equal(IMG.readUInt16BE(STUB), 0x4e75, '$26331C is a bare rts -- the hooks are disabled');
});

test('W362 the part offsets match TB0 IN ROM ORDER, with $1A0 EIGHTH', { skip: SKIP }, () => {
  const offs = partCalls().map((c) => c.off);
  assert.deepEqual(offs, [0x0, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0, 0x140, 0x160, 0x180],
    'ROM order -- NOT ascending');
  // W362: this assertion caught my own off-by-one. I wrote "seventh" in several commits; counting
  // $0 $20 $40 $60 $80 $A0 $C0 puts $1A0 EIGHTH. The displacement is real, the ordinal was wrong.
  assert.equal(offs.indexOf(0x1a0), 7, '$1A0 is at index 7, i.e. the EIGHTH call, between $C0 and $140');
  const TB0 = TYPE_SPECS.get(0xb0);
  assert.ok(TB0, 'TB0 is registered');
  assert.deepEqual([...TB0.partOffsets], offs, 'TB0.partOffsets is the ROM order, not sorted');
});

test('W362 the offsets are NOT a range -- three multiples of $20 are never called', { skip: SKIP }, () => {
  const offs = new Set(partCalls().map((c) => c.off));
  for (const skipped of [0xe0, 0x100, 0x120]) {
    assert.ok(!offs.has(skipped),
      `$${skipped.toString(16)} is a multiple of $20 inside the span and is NEVER called -- so a loop `
      + 'from 0 to $1A0 by $20 would visit parts the cartridge does not');
  }
  assert.equal(offs.size, 11, 'eleven distinct parts');
  assert.equal(Math.max(...offs), 0x1a0, 'the highest is $1A0');
});

test('W362 the eleven lea sites are verified instruction boundaries', { skip: SKIP }, () => {
  // The fixture an aligned decoder needs. Each `lea` opcode must be 41d6 or 41ee -- if a walk ever
  // disagrees with these addresses, the walk is wrong.
  for (const { lea, jsr, off } of partCalls()) {
    const op = IMG.readUInt16BE(lea);
    assert.ok(op === 0x41d6 || op === 0x41ee,
      `$${lea.toString(16)} is a lea into A0 (41d6 or 41ee), not ${op.toString(16)}`);
    assert.equal(jsr - lea, op === 0x41d6 ? 2 : 4,
      `part $${off.toString(16)}: the lea is ${op === 0x41d6 ? 2 : 4} bytes and the jsr follows it`);
  }
});

test('W372 the boss body ORs every part s damage bits, same eleven offsets again', { skip: SKIP }, () => {
  // $2A6B94 past its guard collects the parts' flag bytes with `or.b (part,A6),D1` and masks the sum
  // with $5C -- the SAME damage mask type $4C and its four siblings use. So the eleven-offset list
  // appears a THIRD time: the init body ARMS eight of them, the handler CALLS all eleven, and the boss
  // body ORs them. Three routines, one hand-written order, and $1A0 sits after $C0 in every one.
  const offs = [];
  for (let a = 0x2a6ba2; a < 0x2a6bc2; a += 4) {
    if (IMG.readUInt16BE(a) !== 0x822e) continue;         // or.b (d16,A6),D1
    offs.push(IMG.readUInt16BE(a + 2));
  }
  assert.ok(offs.includes(0x1a0), '$1A0 is among them');
  assert.deepEqual(offs.slice(-4), [0x80, 0xa0, 0xc0, 0x1a0],
    'ending $80 $A0 $C0 $1A0 -- $1A0 after $C0, exactly as the handler and the init body order it');
  // The mask is the $5C damage family's, which is what makes this a hit test rather than a state read.
  assert.equal(IMG.readUInt16BE(0x2a6bc2), 0x0241, '$2A6BC2 andi.w #imm,D1');
  assert.equal(IMG.readUInt16BE(0x2a6bc4), 0x005c, '  ...#$5C -- the same mask $4C and its band use');
  assert.equal(IMG[0x2a6bc6], 0x66, '$2A6BC6 bne -- any part hit takes the branch');
});
