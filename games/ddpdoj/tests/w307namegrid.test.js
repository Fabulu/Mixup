// W307: the name-entry grid's furniture, and four emitter stubs in one screen.
//
// Straight-line draws built from immediates, so most of this is a transcription check. The two
// things that are NOT are the bucket resolution -- W303 assumed two stubs meant two layers and
// was wrong; here three stubs really do mean three buckets -- and the work-list test, which
// leaves before either `btst` when both sides owe a name.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { BUCKETS, resolveEmitStub, enqueueRegistersThroughStub } from '../src/spritequeue.js';
import { ANIM_OBJECT } from '../src/animobjects.js';
import { hiscoreDefaults28841E } from '../src/hiscore.js';
import {
  NAME_REC, NAME_OBJ, drawGrid28FCAA, drawSoleSide, drawGridFrame28F4C4, nameArmGrid28F4A6,
} from '../src/hiscorename.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const A4 = 0x81f200;
const A5 = 0x81f280;

const factory = () => {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  return ram;
};
const world = () => {
  const log = new UnportedLog();
  return { log, ctx: { rom: ROM, unported: log, unportedLog: log, notes: log } };
};
/** Every record in every bucket this screen can reach, tagged with its bucket. */
function allEmitted(ram) {
  const out = [];
  for (const b of [0, 2, 3]) {
    const n = ram.u16(BUCKETS[b].counter) / 12;
    for (let i = 0; i < n; i++) {
      out.push({
        bucket: b,
        pos: ram.u32(BUCKETS[b].buffer + i * 12),
        art: ram.u32(BUCKETS[b].buffer + i * 12 + 4),
        d3: ram.u16(BUCKETS[b].buffer + i * 12 + 8),
        d4: ram.u16(BUCKETS[b].buffer + i * 12 + 10),
      });
    }
  }
  return out;
}

// ==================== 1. THREE STUBS, THREE BUCKETS

test('W307 the four stubs resolve to THREE different buckets', { skip: SKIP }, () => {
  // W303 assumed `$23DECE` and `$23DFB4` were two draw layers, measured it, and found one
  // bucket behind both. The same measurement here gives the opposite answer, so the rule is
  // neither "stub implies layer" nor "stub implies nothing" -- it has to be resolved every time.
  assert.equal(resolveEmitStub(ROM, 0x23dece).bucket, 0);
  assert.equal(resolveEmitStub(ROM, 0x23df2a).bucket, 2);
  assert.equal(resolveEmitStub(ROM, 0x23df58).bucket, 3);
  assert.equal(resolveEmitStub(ROM, 0x23dfb4).bucket, 0, 'the same bucket as $23DECE');
  for (const s of [0x23dece, 0x23df2a, 0x23df58]) {
    assert.equal(resolveEmitStub(ROM, s).conv, 'register', 'and all register-convention');
  }
});

test('W307 `$28FCAA` puts its four draws in three buckets', { skip: SKIP }, () => {
  const ram = factory();
  drawGrid28FCAA(ram, ROM);
  const recs = allEmitted(ram);
  assert.equal(recs.length, 4);
  assert.deepEqual(recs.map((r) => r.bucket), [0, 2, 3, 3], 'one, one, and two');
  assert.deepEqual(recs.map((r) => r.art), [0x322f78, 0x31fe3c, 0x323c60, 0x31f9b8]);
  assert.deepEqual(recs.map((r) => r.d3), [0x12b0, 0x38e0, 0x38e0, 0x06b0]);
  assert.deepEqual(recs.map((r) => r.d4), [4, 2, 3, 4]);
});

test('W307 parts 2 and 3 have IDENTICAL D1 pairs', { skip: SKIP_IMG }, () => {
  // Each has its own `move.l`/`addi.l` -- at `$28FCCA`/`$28FCD0` and `$28FCEA`/`$28FCF0` -- and
  // the four immediates are the same two values. They differ only in art, D4 and which stub they
  // call, which is what makes them two layers of one glyph position. Read from the image so a
  // copy-paste slip in the port's table is caught.
  assert.equal(IMG.readUInt32BE(0x28fccc), 0x38001c00, 'part 2 base');
  assert.equal(IMG.readUInt32BE(0x28fcd2), 0xc800e400, 'part 2 delta');
  assert.equal(IMG.readUInt32BE(0x28fcec), IMG.readUInt32BE(0x28fccc), 'part 3 shares the base');
  assert.equal(IMG.readUInt32BE(0x28fcf2), IMG.readUInt32BE(0x28fcd2), 'and the delta');
  // And the two stubs really are different, which is the whole reason both calls exist.
  assert.equal(IMG.readUInt32BE(0x28fce6), 0x0023df2a);
  assert.equal(IMG.readUInt32BE(0x28fd06), 0x0023df58);
});

// ==================== 2. THE POSITION IS A LONGWORD ADD

test('W307 all EIGHT D1 pairs carry, and the emitter discards every one', { skip: SKIP }, () => {
  // `addi.l` is a longword add, so the low half carries into the high half -- and in all eight
  // parts across the three routines it does, by exactly bit 16. It makes no difference: the
  // emitter packs `D1 >> 6` and masks, and the mask drops that bit, so the longword result and
  // the per-axis result produce byte-identical records.
  //
  // So the pair is a signed PER-AXIS encoding spelled as one 32-bit add. This test replaces a
  // claim I first wrote the other way round -- that adding the halves independently would be
  // "one unit out in Y" -- which was a warning about a bug the emitter makes impossible.
  const PAIRS = [
    [0x2a001c00, 0xee00ea00], [0x38001c00, 0xc800e400], [0x38001c00, 0xc800e400],
    [0x62801c40, 0xfa00ea00], [0x4e802b80, 0xf600f500], [0x42002b00, 0xfc00f500],
    [0x4e800c80, 0xf600f500], [0x42000d00, 0xfc00f500],
  ];
  for (const [base, delta] of PAIRS) {
    const folded = (base + delta) >>> 0;
    const perAxis = (((((base >>> 16) + (delta >>> 16)) & 0xffff) << 16)
      | (((base & 0xffff) + (delta & 0xffff)) & 0xffff)) >>> 0;
    assert.equal(folded ^ perAxis, 0x00010000, 'they differ by exactly the carry bit');
    const g = new Ram();
    enqueueRegistersThroughStub(g, ROM, 0x23dece, folded, 1, 1, 1);
    const p = new Ram();
    enqueueRegistersThroughStub(p, ROM, 0x23dece, perAxis, 1, 1, 1);
    assert.equal(g.u32(BUCKETS[0].buffer), p.u32(BUCKETS[0].buffer),
      'and the emitter cannot tell them apart');
  }
  // The port still does the longword add, because that is what the ROM does.
  const ram = factory();
  drawGrid28FCAA(ram, ROM);
  const want = new Ram();
  enqueueRegistersThroughStub(want, ROM, 0x23dece,
    (0x2a001c00 + 0xee00ea00) >>> 0, 0x322f78, 0x12b0, 4);
  assert.equal(ram.u32(BUCKETS[0].buffer), want.u32(BUCKETS[0].buffer));
});

// ==================== 3. THE SOLE-SIDE TWINS

test('W307 the two sole-side arms are the same sprites with one D4 bit different',
  { skip: SKIP }, () => {
    // Same two art longs, same two D3s. The differences are the X halves of D1 and D4, where
    // `$43` is `$03 | $40` -- one bit, so the pair is a mirror rather than two layouts.
    const p1 = factory();
    drawSoleSide(p1, ROM, 0);
    const p2 = factory();
    drawSoleSide(p2, ROM, 1);
    const a = allEmitted(p1);
    const b = allEmitted(p2);
    assert.equal(a.length, 2);
    assert.equal(b.length, 2);
    assert.deepEqual(a.map((r) => r.art), b.map((r) => r.art), 'the same art');
    assert.deepEqual(a.map((r) => r.d3), b.map((r) => r.d3), 'the same attributes');
    assert.deepEqual(a.map((r) => r.d4), [0x43, 0x43]);
    assert.deepEqual(b.map((r) => r.d4), [0x03, 0x03]);
    for (const [i, r] of a.entries()) {
      assert.equal(r.d4 ^ b[i].d4, 0x40, 'and exactly the flip bit apart');
      assert.notEqual(r.pos, b[i].pos, 'while the positions differ');
    }
    // Both go through the SAME stub, unlike `$28FCAA`.
    assert.deepEqual(a.map((r) => r.bucket), [3, 3]);
  });

test('W307 both sole-side arms end in a tail `jmp`, not a `jsr`', { skip: SKIP_IMG }, () => {
  // `$28FD66` and `$28FDA8` are `4EF9` -- a tail jump into the emitter. It is still one call, but
  // it means neither routine has an `rts` of its own and a boundary scan for `4E75` misses them.
  assert.equal(IMG.readUInt16BE(0x28fd66), 0x4ef9, '$28FD2C ends in jmp');
  assert.equal(IMG.readUInt16BE(0x28fda8), 0x4ef9, '$28FD6E too');
  assert.equal(IMG.readUInt32BE(0x28fd68), 0x0023df58, 'both into $23DF58');
  assert.equal(IMG.readUInt32BE(0x28fdaa), 0x0023df58);
  assert.equal(IMG.readUInt16BE(0x28fd6c), 0x4e71, 'and a nop pads between them');
});

test('W307 a side other than 0 or 1 throws', { skip: SKIP }, () => {
  const ram = factory();
  assert.throws(() => drawSoleSide(ram, ROM, 2), /only ever test bits 0 and 1/);
});

// ==================== 4. THE DISPATCH, AND THE BOTH-SIDES SKIP

test('W307 with BOTH sides owing, neither arm draws', { skip: SKIP }, () => {
  // `$28F4D4 cmpi.b #$3,D0 / beq $28F4F4` leaves before either `btst`. Reading this as a two-way
  // choice would draw one side's furniture over a half that is in use, which is the whole point
  // of the furniture existing.
  const ram = factory();
  ram.setU16(A4 + NAME_REC.cursor, 0);
  ram.setU8(A5 + NAME_OBJ.owed, 0x03);
  assert.equal(drawGridFrame28F4C4(ram, ROM, A4, A5), 'both');
  assert.equal(allEmitted(ram).length, 0, 'nothing at all');
});

test('W307 exactly one side owing draws that side\'s furniture', { skip: SKIP }, () => {
  for (const [owed, want, d4] of [[0x01, 'p1', 0x43], [0x02, 'p2', 0x03]]) {
    const ram = factory();
    ram.setU16(A4 + NAME_REC.cursor, 0);
    ram.setU8(A5 + NAME_OBJ.owed, owed);
    assert.equal(drawGridFrame28F4C4(ram, ROM, A4, A5), want);
    const recs = allEmitted(ram);
    assert.equal(recs.length, 2, `${want} draws two`);
    assert.deepEqual(recs.map((r) => r.d4), [d4, d4]);
  }
});

test('W307 an empty work list draws no furniture either', { skip: SKIP }, () => {
  // `$28F4EC beq $28F4F4` -- neither bit set is its own arm, and it is the state the screen is
  // in after `$28F6C8` has dropped the last side.
  const ram = factory();
  ram.setU16(A4 + NAME_REC.cursor, 0);
  ram.setU8(A5 + NAME_OBJ.owed, 0);
  assert.equal(drawGridFrame28F4C4(ram, ROM, A4, A5), 'none');
  assert.equal(allEmitted(ram).length, 0);
});

test('W307 the cursor draw is gated on `($2E,A4)`', { skip: SKIP }, () => {
  // `$28F4C4 tst.w ($2E,A4) / beq $28F4D0`. The arms clear it (W305) and `$28F4A6` sets it, so
  // the grid appears only once the screen has armed itself.
  const off = factory();
  off.setU16(A4 + NAME_REC.cursor, 0);
  off.setU8(A5 + NAME_OBJ.owed, 0x03);
  drawGridFrame28F4C4(off, ROM, A4, A5);
  assert.equal(allEmitted(off).length, 0, 'cursor 0 draws no grid');

  const on = factory();
  on.setU16(A4 + NAME_REC.cursor, 1);
  on.setU8(A5 + NAME_OBJ.owed, 0x03);
  drawGridFrame28F4C4(on, ROM, A4, A5);
  assert.equal(allEmitted(on).length, 4, 'cursor 1 draws the four grid parts');
});

test('W307 the cursor and the furniture add up, and share no bucket record', { skip: SKIP }, () => {
  const ram = factory();
  ram.setU16(A4 + NAME_REC.cursor, 1);
  ram.setU8(A5 + NAME_OBJ.owed, 0x01);
  assert.equal(drawGridFrame28F4C4(ram, ROM, A4, A5), 'p1');
  const recs = allEmitted(ram);
  assert.equal(recs.length, 6, 'four grid plus two furniture');
  assert.equal(recs.filter((r) => r.bucket === 3).length, 4, 'two grid parts and both furniture');
});

// ==================== 5. THE ARM AND LIVE ANIMATION LOAD

test('W307 `$28F4A6` arms the cursor and loads four animation nodes', { skip: SKIP }, () => {
  // W390 CORRECTION: W389 folded $246710's seeding into chainLoaderBody.
  // W303 still counted $246410, the separate animation-node body used below.
  const ram = factory();
  nameArmGrid28F4A6(ram, ROM, A4);
  assert.equal(ram.u16(A4 + NAME_REC.cursor), 1);
  assert.equal(ram.u16(0x81e0d6), 1, 'and the global active flag');

  const root = ANIM_OBJECT.roots;
  assert.equal(ram.u16(root), 0x8000, 'the first animation root is claimed');
  assert.equal(ram.u16(root + 0x04), 1, 'the cartridge entry mode is 1');
  let node = ram.u32(root + 0x2c);
  const linked = [];
  while (node !== 0) {
    linked.push(node);
    assert.equal(ram.u16(node), 0x8000, 'each linked node is claimed');
    node = ram.u32(node + 0x2c);
  }
  assert.equal(linked.length, 4, 'the count word builds exactly four linked nodes');

  const expected = [
    { current: 0x80e906, target: 0x2254b8 },
    { current: 0x80e946, target: 0x2254f8 },
    { current: 0x80e986, target: 0x225538 },
    { current: 0x80e9c6, target: 0x225478 },
  ];
  for (const [index, nodeAt] of linked.entries()) {
    const script = 0x28fa9a + index * 14;
    assert.deepEqual([
      ROM.u16(script), ROM.u16(script + 2), ROM.i16(script + 4), ROM.u32(script + 6),
      ROM.u16(script + 10), ROM.u16(script + 12),
    ], [0, 0, 0x80 + index * 0x40, expected[index].target, 0x1f, 3],
    `script row ${index} is the pinned fill/family/current/target/length/timing tuple`);
    assert.deepEqual({
      writer: ram.u32(nodeAt + 0x06),
      target: ram.u32(nodeAt + 0x0a),
      current: ram.u32(nodeAt + 0x0e),
      fill: ram.u16(nodeAt + 0x12),
      countdown: ram.u16(nodeAt + 0x14),
      reload: ram.u16(nodeAt + 0x16),
      active: ram.u32(nodeAt + 0x18),
      step: ram.u16(nodeAt + 0x1c),
      wordsMinusOne: ram.u16(nodeAt + 0x04),
    }, {
      writer: 0x80fa66,
      target: expected[index].target,
      current: expected[index].current,
      fill: 0,
      countdown: 0,
      reload: 0,
      active: 0xffff0000,
      step: 1,
      wordsMinusOne: 0x1f,
    }, `node ${index} carries the decoded script fields and timing`);
  }
});

test('W307 arming then drawing produces the grid', { skip: SKIP }, () => {
  // The two halves in sequence, because `$28F4A6` and `$28F4C4` are one frame apart in the ROM
  // and the cursor field is the only thing connecting them.
  const ram = factory();
  const w = world();
  ram.setU8(A5 + NAME_OBJ.owed, 0x02);
  nameArmGrid28F4A6(ram, ROM, A4);
  assert.equal(drawGridFrame28F4C4(ram, ROM, A4, A5), 'p2');
  assert.equal(allEmitted(ram).length, 6);
});
