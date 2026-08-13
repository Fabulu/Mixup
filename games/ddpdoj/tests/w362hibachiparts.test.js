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

test('W372 the boss body is an HP-PHASE machine over a 32-bit pool', { skip: SKIP }, () => {
  // $2A6BE0 cmpi.l #$EB33,($16,A5) -- a LONG compare against a 32-bit health pool, the same shape as
  // type $4C's ($1A,A5). Below the threshold (and with $8130CA clear) it writes ONE value into FOUR
  // adjacent bytes $E6..$E9; the branch above it writes a different quad, $10/$11/$12/$16, one byte at
  // a time. So ($E6..$E9) is a four-part sprite or animation quad selected by HP phase, and the two
  // paths differ in whether the four bytes share a value.
  assert.equal(IMG.readUInt16BE(0x2a6be0), 0x0cad, '$2A6BE0 cmpi.l #imm,(d16,A5)');
  assert.equal(IMG.readUInt32BE(0x2a6be2), 0x0000eb33, '  ...#$EB33, an HP threshold');
  assert.equal(IMG.readUInt16BE(0x2a6be6), 0x0016, '  ...($16,A5) -- the 32-bit pool');
  assert.equal(IMG.readUInt16BE(0x2a6bec), 0x4a79, '$2A6BEC tst.w abs.l');
  assert.equal(IMG.readUInt32BE(0x2a6bee), 0x008130ca, '  ...$8130CA gates the phase change');
  assert.equal(IMG.readUInt16BE(0x2a6bf6), 0x7019, '$2A6BF6 moveq #$19,D0 -- ONE value...');
  const quad = [0x2a6bf8, 0x2a6bfc, 0x2a6c00, 0x2a6c04];
  quad.forEach((at, i) => {
    assert.equal(IMG.readUInt16BE(at), 0x1d40, `$${at.toString(16)} move.b D0,(d16,A6)`);
    assert.equal(IMG.readUInt16BE(at + 2), 0xe6 + i, `  ...($${(0xe6 + i).toString(16)},A6)`);
  });
  // The other path writes FOUR DIFFERENT values to the same four bytes.
  const other = [0x10, 0x11, 0x12, 0x16];
  other.forEach((v, i) => {
    assert.equal(IMG.readUInt16BE(0x2a6bc8 + i * 6), 0x1d7c, 'the other phase: move.b #imm');
    assert.equal(IMG.readUInt16BE(0x2a6bca + i * 6), v, `  ...#$${v.toString(16)}, all four differ`);
  });
});

test('W372 the boss damage arm scores once and REMAPS the quad on read', { skip: SKIP }, () => {
  // After ORing the parts' hit bits it clears them across the parts with `and.b D0,(part,A6)`, stores
  // the mask into ($10A,A6), and calls $286096 -- scoreHit -- ONCE for the whole boss, not per part.
  assert.equal(IMG.readUInt16BE(0x2a6c2a), 0xc12e, '$2A6C2A and.b D0,(d16,A6) -- clearing a part');
  assert.equal(IMG.readUInt16BE(0x2a6c2c), 0x01a0, '  ...($1A0,A6), the out-of-sequence one again');
  assert.equal(IMG.readUInt16BE(0x2a6c2e), 0x3d41, '$2A6C2E move.w D1,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x2a6c30), 0x010a, '  ...($10A,A6), the hit mask');
  assert.equal(IMG.readUInt32BE(0x2a6c34), 0x00286096, '$2A6C32 jsr $286096 -- scoreHit, ONCE');
  // Then the quad is read back into four separate registers and $19 is remapped to $10.
  const regs = [[0x2a6c38, 0x102e], [0x2a6c3c, 0x142e], [0x2a6c40, 0x162e], [0x2a6c44, 0x182e]];
  regs.forEach(([at, op], i) => {
    assert.equal(IMG.readUInt16BE(at), op, `$${at.toString(16)} move.b (d16,A6),D -- quad byte ${i}`);
    assert.equal(IMG.readUInt16BE(at + 2), 0xe6 + i, `  ...($${(0xe6 + i).toString(16)},A6)`);
  });
  assert.equal(IMG.readUInt16BE(0x2a6c48), 0x0c00, '$2A6C48 cmpi.b #imm,D0');
  assert.equal(IMG.readUInt16BE(0x2a6c4a), 0x0019, '  ...#$19 -- the low-HP phase value');
  assert.equal(IMG.readUInt16BE(0x2a6c4e), 0x103c, '$2A6C4E move.b #imm,D0');
  assert.equal(IMG.readUInt16BE(0x2a6c50), 0x0010, '  ...remapped to #$10 on the way out');
});

test('W372 the boss takes the MINIMUM of the parts $18 fields, not a sum', { skip: SKIP }, () => {
  // `move.w ($18,A6),D4` then repeated `cmp.w (part+$18,A6),D4 / ble skip / move.w that,D4`. `ble`
  // KEEPS D4 when it is already the smaller, so the reduce is a MINIMUM. A sum or a first-part read
  // would both be plausible from one line of it and both wrong, and the parts step by $20 -- the part
  // stride -- so the fields being reduced are one per part.
  assert.equal(IMG.readUInt16BE(0x2a6c7e), 0x382e, '$2A6C7E move.w (d16,A6),D4 -- the seed');
  assert.equal(IMG.readUInt16BE(0x2a6c80), 0x0018, '  ...($18,A6), part 0s field');
  for (const [at, off] of [[0x2a6c82, 0x38], [0x2a6c8c, 0x58]]) {
    assert.equal(IMG.readUInt16BE(at), 0xb86e, `$${at.toString(16)} cmp.w (d16,A6),D4`);
    assert.equal(IMG.readUInt16BE(at + 2), off, `  ...($${off.toString(16)},A6) -- +$20 each time`);
    assert.equal(IMG[at + 4], 0x6f, '  ...ble -- so D4 KEEPS the smaller, making this a MINIMUM');
    assert.equal(IMG.readUInt16BE(at + 6), 0x382e, '  ...else move.w that field into D4');
  }
  assert.equal(0x38 - 0x18, 0x20, 'the stride is the PART stride, so one field per part');
  // The quad writeback just above it XORs one byte, which is why the four are not interchangeable.
  assert.equal(IMG.readUInt16BE(0x2a6c76), 0x0a04, '$2A6C76 eori.b #imm,D4');
  assert.equal(IMG.readUInt16BE(0x2a6c78), 0x0009, '  ...#$9 -- applied to D4s byte ALONE');
});

test('W372 $4C s fan reads the PLAYER records inline, not through targetSelect', { skip: SKIP }, () => {
  // $26FACA..$26FAE2: `moveq #0,D0 / tst.w $8103E6 / bpl / move.w $8103E8,D0` and the same shape for
  // P2 at $810448. Those are AIM.selP1 and AIM.selP2 -- the player records targetSelect also uses --
  // read here DIRECTLY, so the fan aims at the players without the shared selector's side preference.
  assert.equal(IMG.readUInt16BE(0x26faca), 0x7000, '$26FACA moveq #$0,D0');
  assert.equal(IMG.readUInt16BE(0x26facc), 0x4a79, '$26FACC tst.w abs.l');
  assert.equal(IMG.readUInt32BE(0x26face), 0x008103e6, "  ...$8103E6, P1's record");
  assert.equal(IMG[0x26fad2], 0x6a, '$26FAD2 bpl -- a live player has the sign clear');
  assert.equal(IMG.readUInt16BE(0x26fad6), 0x3039, '$26FAD6 move.w abs.l,D0');
  assert.equal(IMG.readUInt32BE(0x26fad8), 0x008103e8, "  ...$8103E8, P1's coordinate");
  assert.equal(IMG.readUInt16BE(0x26fadc), 0x7200, '$26FADC moveq #$0,D1 -- then the same for P2');
  assert.equal(IMG.readUInt32BE(0x26fae0), 0x00810448, "  ...$810448, P2's record");
});

test('W372 the player reads only GATE the fan -- the fire registers are constants', { skip: SKIP }, () => {
  // The block takes the LARGER of the two player coordinates, compares it against (self - $400), and
  // skips the whole fan when the player is short of that line. Then it OVERWRITES D0 and D1 with
  // literals. So the players decide WHETHER it fires, not where it aims -- and a port that fed the
  // player coordinate into the fire would aim a 37-shot fan at the wrong thing while gating correctly.
  assert.equal(IMG.readUInt16BE(0x26faee), 0xb240, '$26FAEE cmp.w D0,D1 -- the two players');
  assert.equal(IMG.readUInt16BE(0x26faf4), 0x3001, '$26FAF4 move.w D1,D0 -- keep the LARGER');
  assert.equal(IMG.readUInt16BE(0x26faf6), 0x322e, '$26FAF6 move.w (d16,A6),D1 -- self position');
  assert.equal(IMG.readUInt16BE(0x26fafa), 0x0441, '$26FAFA subi.w #imm,D1');
  assert.equal(IMG.readUInt16BE(0x26fafc), 0x0400, '  ...#$400, the engagement line');
  assert.equal(IMG.readUInt16BE(0x26fb00), 0x6500, '$26FB00 bcs -- short of it, NO fan at all');
  // And the fire registers, which are literals and do not depend on the players.
  assert.equal(IMG.readUInt16BE(0x26fb08), 0x203c, '$26FB08 move.l #imm,D0');
  assert.equal(IMG.readUInt32BE(0x26fb0a), 0x00010007, '  ...#$10007 -- OVERWRITES the player coord');
  assert.equal(IMG.readUInt16BE(0x26fb0e), 0x323c, '$26FB0E move.w #imm,D1');
  assert.equal(IMG.readUInt16BE(0x26fb10), 0x002e, '  ...#$2E, the entry heading -- also a literal');
});
