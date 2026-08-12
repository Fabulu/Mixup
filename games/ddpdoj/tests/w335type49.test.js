// W335 -- stage 5's type `$49`, the sweeping fan emplacement.
//
// THE FOUR THINGS THIS FILE EXISTS FOR, each of which is a way to get `$49` wrong:
//   * its sub prototype is `$20` bytes from `$271624` and therefore OVERLAPS its handler at
//     `$271640` -- the record's `+$1E`/`+$1F` really do receive `and.b (A6),D1`;
//   * `$2716D8 tst.w $271774.l` reads this routine's own `lea` opcode as data and `subq.b`
//     overwrites the flags before the `bcc`, so it is DEAD and the port omits it;
//   * `$27172C neg.w D3` negates only the LOW word of a `move.l`-loaded long;
//   * `($20,A5)` holds a POINTER to a formation flag and both exits clear it through that pointer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

test('W335 the type table names $27159E/$271640 and the body is init + 8', { skip: SKIP }, () => {
  // `$267824 + $49 * 8`. The body address is NOT a fall-through -- `$2715A4` is an `rts` and nothing
  // branches to `$2715A6`; `spawn.js` computes it as `init + 8` (`$26361A addq.w #8,A1`).
  const e = 0x267824 + 0x49 * 8;
  assert.equal(e, 0x267a6c);
  assert.equal(IMG.readUInt32BE(e), 0x0027159e, 'init');
  assert.equal(IMG.readUInt32BE(e + 4), 0x00271640, 'handler');
  assert.equal(IMG.readUInt32BE(0x27159e), 0x3b7c0000, '$27159E move.w #$0,($4,A5) -- ONE sub-record');
  assert.equal(IMG.readUInt16BE(0x2715a4), 0x4e75, 'and $2715A4 is the rts, so nothing falls through');
  assert.equal(0x27159e + 8, 0x2715a6, 'the body is init + 8');
});

test('W335 the $20-byte sub prototype OVERLAPS the handler at $271640', { skip: SKIP }, () => {
  // Not an off-by-one: the cartridge overlaps data with code. `loadSubProto` copies $20 bytes from
  // $271624, so $271624..$271643, and $271640 is the handler's first instruction.
  assert.equal(0x271624 + 0x20, 0x271644, 'the prototype ends PAST the handler start');
  assert.equal(IMG.readUInt16BE(0x271640), 0x725c, '$271640 moveq #$5C,D1');
  assert.equal(IMG.readUInt16BE(0x271642), 0xc216, '$271642 and.b (A6),D1');
  // So the record's +$1C..+$1F receive $72 $5C $C2 $16 -- and the init overwrites +$1C and +$1D
  // immediately, at $2715D2 and $2715DE, leaving only +$1E/+$1F holding code bytes.
  assert.equal(IMG.readUInt32BE(0x2715d2), 0x1d7c0040, '$2715D2 move.b #$40,($1C,A6)');
  assert.equal(IMG.readUInt16BE(0x2715de), 0x1d6d, '$2715DE move.b ($18,A5),($1D,A6)');
});

test('W335 $2716D8 tests this routine\'s OWN lea opcode and the flags are then discarded',
  { skip: SKIP }, () => {
    // The reason the port omits it rather than modelling it.
    assert.equal(IMG.readUInt16BE(0x2716d8), 0x4a79, '$2716D8 tst.w <abs.l>');
    assert.equal(IMG.readUInt32BE(0x2716da), 0x00271774, '... of $271774');
    assert.equal(IMG.readUInt16BE(0x271774), 0x41fa, 'and $271774 is `lea (d16,PC),A0` -- CODE');
    // `subq.b` sets X/N/Z/V/C, so every flag the `tst.w` set is gone before the `bcc` reads carry.
    assert.equal(IMG.readUInt32BE(0x2716de), 0x532d001a, '$2716DE subq.b #1,($1A,A5)');
    assert.equal(IMG.readUInt16BE(0x2716e2), 0x6400, '$2716E2 bcc -- reads the subq\'s carry');
  });

test('W335 $27172C is neg.w on a register loaded by move.l', { skip: SKIP }, () => {
  // Word negate, no borrow into the high word: the mirror flips Y and keeps X. Then `add.l` does
  // let a low-word carry reach X, which is why the port adds as one longword.
  assert.equal(IMG.readUInt16BE(0x27171e), 0x2611, '$27171E move.l (A1),D3 -- a LONG load');
  assert.equal(IMG.readUInt16BE(0x27172c), 0x4443, '$27172C neg.w D3 -- a WORD negate');
  assert.equal(IMG.readUInt16BE(0x27172e), 0xd483, '$27172E add.l D3,D2 -- a LONG add');
  // The offsets really are packed pairs: high word X, low word Y.
  assert.equal(IMG.readUInt32BE(0x271814), 0x0080fd00, 'entry 0 = X $80, Y -$300');
});

test('W335 ($20,A5) is a POINTER, and both exits clear the flag through it', { skip: SKIP }, () => {
  // $2715F4..$271610 -- `bcs` is unsigned lower and the "below" side KEEPS the first `lea`.
  assert.equal(IMG.readUInt32BE(0x2715f6), 0x008130e0, '$2715F4 lea $8130E0,A0');
  assert.equal(IMG.readUInt16BE(0x2715fa), 0x0c79, '$2715FA cmpi.w');
  assert.equal(IMG.readUInt16BE(0x2715fc), 0x0260, '... #$260');
  assert.equal(IMG.readUInt32BE(0x271608), 0x008130e4, '$271606 lea $8130E4,A0 -- the other flag');
  assert.equal(IMG.readUInt32BE(0x27160c), 0x2b480020, '$27160C move.l A0,($20,A5) -- the ADDRESS');
  assert.equal(IMG.readUInt32BE(0x271610), 0x30bc0001, '$271610 move.w #$1,(A0)');
  // The death arm and the off-screen free both go through the pointer.
  assert.equal(IMG.readUInt32BE(0x27168a), 0x206d0020, '$27168A movea.l ($20,A5),A0 -- death arm');
  assert.equal(IMG.readUInt16BE(0x27168e), 0x4250, '$27168E clr.w (A0)');
  assert.equal(IMG.readUInt32BE(0x2716be), 0x206d0020, '$2716BE the same, on the off-screen free');
  assert.equal(IMG.readUInt16BE(0x2716c2), 0x4250, '$2716C2 clr.w (A0)');
});

test('W335 the $1F3 gate is an EQUALITY and is the sole writer of ($17,A5)', { skip: SKIP }, () => {
  // Read as a threshold it would arm every later record instead of exactly one.
  assert.equal(IMG.readUInt16BE(0x2715c6), 0x0c79, '$2715C6 cmpi.w');
  assert.equal(IMG.readUInt16BE(0x2715c8), 0x01f3, '... #$1F3');
  assert.equal(IMG.readUInt32BE(0x2715ca), 0x008130ce, '... against the scroll clock $8130CE');
  assert.equal(IMG.readUInt16BE(0x2715ce), 0x6600, '$2715CE bne -- so ONLY equality arms it');
  assert.equal(IMG.readUInt32BE(0x2715d8), 0x1b7c0001, '$2715D8 move.b #$1,($17,A5)');
});

test('W335 the damage arm is the SIMPLE $5C member: no hpFull, no palette decision',
  { skip: SKIP }, () => {
    // Why it is written inline instead of through `damageArm5C`, which would invent both.
    assert.equal(IMG.readUInt16BE(0x271640), 0x725c, 'the $5C mask the family is named for');
    assert.equal(IMG.readUInt32BE(0x271648), 0x103c00a3, '$271648 move.b #$A3,D0 -- clears those bits');
    assert.equal(IMG.readUInt32BE(0x27164e), 0x4eb90028, '$27164E jsr $286096 -- scoreHit');
    assert.equal(IMG.readUInt16BE(0x27165c), 0xb500, '$27165C eor.b D2,D0 -- base XOR mask, no choice');
    assert.equal(IMG.readUInt32BE(0x271662), 0x4a6e0018, '$271662 tst.w ($18,A6)');
    assert.equal(IMG.readUInt16BE(0x271666), 0x6a00, '$271666 bpl -- SIGNED, so alive while >= 0');
    // The not-hit path restores the base palette from ($18,A5) and falls into the alive path.
    assert.equal(IMG.readUInt16BE(0x271698), 0x1d6d, '$271698 move.b ($18,A5),($1D,A6)');
  });

test('W335 the off-screen test is a SIGNED LONG compare, not the two-addi.w word idiom',
  { skip: SKIP }, () => {
    // `$1B` and `$81` do the same job with two `addi.w`s; this one sign-extends first, so a negative
    // Y reaches the high half before the bias is added.
    assert.equal(IMG.readUInt16BE(0x2716a4), 0x48c0, '$2716A4 ext.l D0');
    assert.equal(IMG.readUInt32BE(0x2716a8), 0x00004000, '$2716A6 addi.l #$4000');
    assert.equal(IMG.readUInt32BE(0x2716ae), 0x00002000, '$2716AC cmpi.l #$2000');
    assert.equal(IMG.readUInt16BE(0x2716b2), 0x6e00, '$2716B2 bgt -- SIGNED');
  });

test('W335 the sweep is 30 steps and ONE counter feeds TWO index conventions',
  { skip: SKIP }, () => {
    assert.equal(IMG.readUInt16BE(0x271760), 0x586d, '$271760 addq.w #4,($1C,A5)');
    assert.equal(IMG.readUInt16BE(0x271766), 0x0078, '$271764 cmpi.w #$78 -- so 30 steps of 4');
    assert.equal(0x78 / 4, 30);
    assert.equal(IMG.readUInt16BE(0x27170e), 0xe240, '$27170E asr.w #1,D0 -- HALVED for the words');
    assert.equal(IMG.readUInt16BE(0x27171a), 0xd2ed, '$27171A adda.w ($1C,A5),A1 -- RAW for the longs');
    assert.equal(IMG.readUInt16BE(0x27177a), 0xd0ed, '$27177A adda.w ($1C,A5),A0 -- RAW for the draw');
    // The two word tables sweep out and come back, which is what makes it a fan rather than a spiral.
    assert.equal(IMG.readUInt16BE(0x27188c), 0x0066, '($17,A5) SET starts at $66 and ascends by 6');
    assert.equal(IMG.readUInt16BE(0x27188e), 0x006c);
    assert.equal(IMG.readUInt16BE(0x271904), 0x009a, '($17,A5) CLEAR starts at $9A and descends by 6');
    assert.equal(IMG.readUInt16BE(0x271906), 0x0094);
  });

test('W335 the counter advances even when $8130D4 freezes the volley', { skip: SKIP }, () => {
  // `$2716EC tst.w $8130D4 / bne $271760` jumps PAST the fire and INTO the counter step, so a freeze
  // silences the fan without stalling its sweep. A port that returned early would desynchronise it.
  assert.equal(IMG.readUInt32BE(0x2716ee), 0x008130d4, '$2716EC tst.w $8130D4');
  assert.equal(IMG.readUInt16BE(0x2716f2), 0x6600, '$2716F2 bne');
  assert.equal(IMG.readUInt16BE(0x2716f4), 0x006c, '... displacement $6C, so $2716F2 + 2 + $6C');
  assert.equal(0x2716f2 + 2 + 0x6c, 0x271760, 'which is the counter step, NOT the rts');
});

test('W335 the death list is FOUR entries and the draw is reached on every path',
  { skip: SKIP }, () => {
    assert.equal(IMG.readUInt32BE(0x27167a), 0x43fa0300, '$27167A lea ($27197C,PC),A1');
    assert.equal(0x27167a + 4 + 0x300, 0x27197e, 'PC-relative, so the list is at $27197C + 2');
    // Four 12-byte entries then $FFFF.
    for (let n = 0; n < 4; n++) {
      assert.notEqual(IMG.readUInt16BE(0x27197c + n * 12), 0xffff, `entry ${n} is present`);
    }
    assert.equal(IMG.readUInt16BE(0x27197c + 4 * 12), 0xffff, 'and the fifth word is the terminator');
    assert.equal(IMG.readUInt16BE(0x27179a), 0x4e75, '$27179A is the rts, right after the draw');
  });
