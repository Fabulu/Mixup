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

test('W366 $4C watches ANOTHER type spawn -- $1F0 is not its own clock', { skip: SKIP }, () => {
  // $26F632 cmpi.w #$1F0,$8130CE. The identical instruction in $49's init ($8130CE == $1F3) reads the
  // clock that SPAWNED $49. Assuming that transferred would give a $4C testing a frame it never sees --
  // it spawns at $1B8 -- so the arm would never fire and the loss would be silent and total.
  const STAGE5 = 0x237978;
  const clocksOf = (type) => {
    const out = [];
    for (let cur = STAGE5; IMG.readUInt16BE(cur) !== 0xffff; cur += 8) {
      if (IMG[cur + 4] === type) out.push(IMG.readUInt16BE(cur));
    }
    return out;
  };
  assert.deepEqual(clocksOf(0x4c), [0x1b8],
    '$4C is a SINGLE long-lived record spawned at $1B8 -- and nothing else');
  assert.ok(!clocksOf(0x4c).includes(0x1f0),
    "so $1F0 is NOT $4C's own spawn clock: the test at $26F632 is a CROSS-TYPE cue");
  assert.ok(clocksOf(0x10).includes(0x1f0),
    '$1F0 is when type $10 spawns -- that is the moment $4C is waiting for');
  // The contrast that gives the assertion meaning: $49's identical idiom IS self-referential.
  assert.ok(clocksOf(0x49).includes(0x1f3),
    '$49 spawns at $1F3, which is the clock its own init compares against -- same shape, opposite sense');
  // And the instruction really is there, on the spawn clock.
  assert.equal(IMG.readUInt16BE(0x26f632), 0x0c79, '$26F632 cmpi.w #imm,abs.l');
  assert.equal(IMG.readUInt16BE(0x26f634), 0x01f0, '  ...#$1F0');
  assert.equal(IMG.readUInt32BE(0x26f636), 0x008130ce, '  ...on $8130CE, the spawn clock');
});

test('W366 ($16,A5) in $4C is a one-shot, NOT the on-screen latch', { skip: SKIP }, () => {
  // In $46, $4B and $1A this byte is the once-on-screen flag, and the handoff called $16 "the one field
  // this band agrees on". It does not: here it is armed once, only at clock $1F0, gated on part 5's $1F.
  assert.equal(IMG.readUInt16BE(0x26f622), 0x4a2d, '$26F622 tst.b (d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f624), 0x0016, '  ...($16,A5) -- skip if ALREADY armed');
  assert.equal(IMG.readUInt16BE(0x26f62a), 0x4a2e, '$26F62A tst.b (d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f62c), 0x009f, '  ...part 5s $1F must be zero');
  assert.equal(IMG.readUInt16BE(0x26f63e), 0x1b7c, '$26F63E move.b #imm,(d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f640), 0x0001, '  ...#$1');
  assert.equal(IMG.readUInt16BE(0x26f642), 0x0016, '  ...into ($16,A5), once and for good');
});

test('W366 the ($9E,A6) arm RELEASES a mutual-exclusion claim and then frees the record', { skip: SKIP }, () => {
  // $8130DE is inside the six-word block $8130DC..$8130E6 that $269C6C uses to free records, so clearing
  // it is cross-type coordination rather than a private flag -- and the arm ends by retiring.
  assert.equal(IMG.readUInt16BE(0x26f604), 0x33fc, '$26F604 move.w #imm,abs.l');
  assert.equal(IMG.readUInt16BE(0x26f606), 0x0000, '  ...#$0');
  assert.equal(IMG.readUInt32BE(0x26f608), 0x008130de, '  ...into $8130DE');
  assert.ok(0x8130de >= 0x8130dc && 0x8130de <= 0x8130e6,
    '$8130DE is inside the six-word mutual-exclusion block $8130DC..$8130E6');
  assert.equal(IMG.readUInt16BE(0x26f61a), 0x4ef9, '$26F61A jmp abs.l');
  assert.equal(IMG.readUInt32BE(0x26f61c), 0x00263762, '  ...to $263762 -- the arm RETIRES the record');
});

test('W366 the shared 32-bit HP pool -- ($18,A6) is a damage ACCUMULATOR, not hp', { skip: SKIP }, () => {
  // $26F674 move.l #$7FFF,D0 / $26F67A sub.w ($18,A6),D0 -- so D0 becomes the damage just taken.
  assert.equal(IMG.readUInt16BE(0x26f674), 0x203c, '$26F674 move.l #imm,D0');
  assert.equal(IMG.readUInt32BE(0x26f676), T4C.hpReset, '  ...#$7FFF');
  assert.equal(IMG.readUInt16BE(0x26f67a), 0x906e, '$26F67A sub.w (d16,A6),D0');
  assert.equal(IMG.readUInt16BE(0x26f67c), T4C.damageAccumAt, '  ...($18,A6)');
  // $26F686 sub.l D0,($1A,A5) -- the pool is a LONG in the RECORD, not a word in the sub-record.
  assert.equal(IMG.readUInt16BE(0x26f686), 0x91ad, '$26F686 sub.l D0,(d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f688), T4C.hpPoolAt, '  ...($1A,A5) -- the 32-bit pool');
  // $26F68A resets the accumulator EVERY hit, which is why it cannot be hp.
  assert.equal(IMG.readUInt16BE(0x26f68a), 0x3d7c, '$26F68A move.w #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f68c), T4C.hpReset, '  ...#$7FFF -- reset unconditionally');
  assert.equal(IMG.readUInt16BE(0x26f68e), T4C.damageAccumAt, '  ...into ($18,A6)');
  // And death is tested on the POOL with tst.l, not on ($18,A6)'s sign the way the siblings do.
  assert.equal(IMG.readUInt16BE(0x26f690), 0x4aad, '$26F690 tst.l (d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f692), T4C.hpPoolAt, '  ...($1A,A5) -- so THIS is the health');
});

test('W366 ($16,A5) gates the damage subtraction -- a scripted INVULNERABILITY window', { skip: SKIP }, () => {
  // $26F67E tst.b ($16,A5) / bne skips the sub.l, so while the latch is UNSET damage is DISCARDED.
  assert.equal(IMG.readUInt16BE(0x26f67e), 0x4a2d, '$26F67E tst.b (d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f680), T4C.invulnGateAt, '  ...($16,A5)');
  assert.equal(IMG[0x26f682], 0x66, '$26F682 bne -- ARMED means SKIP the subtraction');
  // The branch must clear the sub.l at $26F686 and land on the reset at $26F68A: a short displacement
  // of 6 from $26F684. If this ever differs, the invulnerability sense has changed.
  assert.equal(IMG.readUInt16BE(0x26f684), 0x0006, 'bne.w +6 -> $26F68A, clearing the sub.l');
  // So the same byte that arms at clock $1F0 is the one that opens the damage window.
  assert.equal(T4C.invulnGateAt, 0x16, 'and it is the byte armed by the $1F0 cue, not an hp field');
});

test('W366 killScore $700 is the largest in the band', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x26f698), 0x203c, '$26F698 move.l #imm,D0');
  assert.equal(IMG.readUInt32BE(0x26f69a), T4C.killScore, '  ...#$700');
  assert.equal(IMG.readUInt32BE(0x26f6a0), 0x0028615e, '$26F69E jsr $28615E -- scoreKill');
  // For contrast: $1A is $350, $55 is $113. A set-piece is worth more than a turret.
  const T1A = TYPE_SPECS.get(0x1a);
  assert.ok(T4C.killScore > T1A.killScore, '$4C ($700) scores above $1A ($350)');
});

test('W366 the palette XOR is an IMMEDIATE, so there is no palXor field to reuse', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x26f66c), 0x0a00, '$26F66C eori.b #imm,D0');
  assert.equal(IMG.readUInt16BE(0x26f66e), T4C.palXorImmediate, '  ...#$D, baked into the instruction');
  assert.equal(T4C.palXor, undefined,
    'T4C deliberately has NO palXor field: reusing the family pair would read a byte $4C never writes');
  // And the hit mask goes to part 5, which is why part 5 is the control block.
  assert.equal(IMG.readUInt16BE(0x26f65e), 0x3d41, '$26F65E move.w D1,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f660), T4C.hitMaskTo, "  ...($8E,A6) -- part 5's $0E");
});

test('W367 $26F858 is a CHANGE-DETECTING setter -- the beq guard is the function', { skip: SKIP }, () => {
  // Eight callers. If a port stores D0 and clears ($28,A6) unconditionally, the frame counter resets every
  // frame and the animation freezes on frame zero while everything else keeps working.
  assert.equal(IMG.readUInt16BE(0x26f858), 0xb06e, '$26F858 cmp.w (d16,A6),D0 -- the GUARD');
  assert.equal(IMG.readUInt16BE(0x26f85a), 0x0026, '  ...against ($26,A6), the current state');
  assert.equal(IMG.readUInt16BE(0x26f85c), 0x6700, '$26F85C beq.w');
  // The branch must clear BOTH stores and land on the rts.
  const tgt = 0x26f85e + IMG.readInt16BE(0x26f85e);
  assert.equal(tgt, 0x26f868, 'beq -> $26F868, skipping the store AND the clear');
  assert.equal(IMG.readUInt16BE(0x26f868), 0x4e75, '  ...which is the rts');
  assert.equal(IMG.readUInt16BE(0x26f860), 0x3d40, '$26F860 move.w D0,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f862), 0x0026, '  ...($26,A6)');
  assert.equal(IMG.readUInt16BE(0x26f864), 0x426e, '$26F864 clr.w (d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f866), 0x0028, '  ...($28,A6), the frame counter');
});

test('W367 $26FF9E grades DISTANCE into bands, smallest wins by fall-through', { skip: SKIP }, () => {
  // Seven callers. It calls dist242494 -- itself one of the nine duplicate ports removed earlier in this
  // session -- then walks thresholds. Each later store OVERWRITES the earlier, so the SMALLEST matching
  // band wins. Written as else-if it would yield the largest instead.
  assert.equal(IMG.readUInt16BE(0x26ff9e), 0x3039, '$26FF9E move.w abs.l,D0');
  assert.equal(IMG.readUInt32BE(0x26ffa0), 0x00813172, '  ...from $813172');
  assert.equal(IMG.readUInt16BE(0x26ffa4), 0x9640, '$26FFA4 sub.w D0,D3');
  assert.equal(IMG.readUInt16BE(0x26ffa6), 0x4eb9, '$26FFA6 jsr abs.l');
  assert.equal(IMG.readUInt32BE(0x26ffa8), 0x00242494, '  ...dist242494');
  // Band 1: >= $200 leaves ($1A,A6) untouched.
  assert.equal(IMG.readUInt16BE(0x26ffac), 0x0c40, '$26FFAC cmpi.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x26ffae), 0x0200, '  ...#$200');
  assert.equal(IMG[0x26ffb0], 0x6c, '$26FFB0 bge -- so >= $200 skips every store');
  // Band 2: $8.
  assert.equal(IMG.readUInt16BE(0x26ffb2), 0x1d7c, '$26FFB2 move.b #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26ffb4), 0x0008, '  ...#$8');
  assert.equal(IMG.readUInt16BE(0x26ffb6), 0x001a, '  ...into ($1A,A6)');
  // Band 3: $6, written AFTER band 2, which is what makes the smallest band win.
  assert.equal(IMG.readUInt16BE(0x26ffb8), 0x0c40, '$26FFB8 cmpi.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x26ffba), 0x0100, '  ...#$100');
  assert.equal(IMG.readUInt16BE(0x26ffbe), 0x1d7c, '$26FFBE move.b #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26ffc0), 0x0006, '  ...#$6 -- OVERWRITES the $8 above');
  assert.equal(IMG.readUInt16BE(0x26ffc2), 0x001a, '  ...same field, ($1A,A6)');
});

test('W367 the band field is what the main flow branches on', { skip: SKIP }, () => {
  // ($1A,A6) is part 1's $1A, and $26FF6C/$26FF7A compare it against $8 -- so the helper grades proximity
  // and the main flow reacts to the band. That is the loop this type closes.
  for (const at of [0x26ff6c, 0x26ff7a]) {
    assert.equal(IMG.readUInt16BE(at), 0x0c2e, `$${at.toString(16)} cmpi.b #imm,(d16,A6)`);
    assert.equal(IMG[at + 3], 0x08, '  ...#$8 -- the band $26FF9E writes');
    assert.equal(IMG.readUInt16BE(at + 4), 0x001a, '  ...($1A,A6), part 1s $1A');
  }
});

test('W367 T4C records the subroutine inventory, and it matches the bsr scan', { skip: SKIP }, () => {
  // Every entry must actually be a bsr target somewhere in the span, or the inventory has rotted.
  const targets = new Set();
  for (let a = T4C.handler; a < 0x270000; a += 2) {
    if (IMG[a] !== 0x61) continue;
    const lo = IMG[a + 1];
    const off = lo === 0 ? IMG.readInt16BE(a + 2) : (lo > 0x7f ? lo - 0x100 : lo);
    targets.add(a + 2 + off);
  }
  for (const sub of T4C.subroutines) {
    assert.ok(targets.has(sub), `$${sub.toString(16)} is a real bsr target`);
    // W371: being a "target" is not enough, and this test PASSED $26F702 for four waves because the
    // scan above walks every 2-byte boundary -- the same limitation that put $26F702 in the list in
    // the first place. Test and data shared one bug, so agreement proved nothing. An entry must also
    // not BE the displacement word of a preceding bsr.w, which is exactly what $26F702 was.
    assert.notEqual(IMG.readUInt16BE(sub - 2), 0x6100,
      `$${sub.toString(16)} is preceded by bsr.w, so it is that instruction's displacement word`);
  }
  assert.equal(T4C.subroutines.length, 15, 'FIFTEEN internal subroutines -- was 16 with $26F702');
  // The two shared ones are in the list, and the tail's four are a subset of it.
  assert.ok(T4C.subroutines.includes(T4C.stateSetter), 'the state setter is one of them');
  assert.ok(T4C.subroutines.includes(T4C.distBander), 'so is the distance bander');
  for (const t of T4C.tailCalls) {
    assert.ok(T4C.subroutines.includes(t), `tail call $${t.toString(16)} is in the inventory`);
  }
  // And the eight the old handoff note listed as "unported callees" are all real entry points.
  for (const old of [0x26f858, 0x26f86a, 0x26f994, 0x26f9a2, 0x26fa5e, 0x26fa82, 0x26ff9e, 0x26ffe8]) {
    assert.ok(T4C.subroutines.includes(old),
      `$${old.toString(16)} -- one of the old note's eight -- IS a real internal entry point`);
  }
});

test('W367 the draw table matches the cartridge, entry by entry', { skip: SKIP }, () => {
  // Five hand-extracted rows. Every constant is re-read from the bytes here, because a hand-built table is
  // exactly where this session's pins have caught errors.
  // W371: SEVEN, not five. $26F71A is not one routine that draws a sprite -- it is three sprite BLOCKS
  // back to back, each with its own art, biases, D3 and `jsr $26F790`, and only the third is followed
  // by the rts. The old count came from treating the whole routine as one entry.
  assert.equal(T4C.draws.length, 7, 'SEVEN sprite blocks across FIVE tail calls');
  assert.equal(T4C.draws.filter((d) => d.block).length, 3, 'three of them live inside $26F71A');
  for (const dr of T4C.draws) {
    // move.l #art,D2 opens every one.
    assert.equal(IMG.readUInt16BE(dr.at), 0x243c, `$${dr.at.toString(16)} move.l #imm,D2`);
    assert.equal(IMG.readUInt32BE(dr.at + 2), dr.art, `  ...art $${dr.art.toString(16)}`);
    // Each bias is a sequential addi.l on D1 -- and these DO combine, unlike the word-add case.
    let a = dr.at + 6;
    const found = [];
    while (a < dr.at + 0x40 && found.length < dr.biases.length) {
      if (IMG.readUInt16BE(a) === 0x0681) { found.push(IMG.readUInt32BE(a + 2)); a += 6; } else a += 2;
    }
    assert.deepEqual(found, [...dr.biases], `$${dr.at.toString(16)} biases, in order`);
    // The palette offset must land on its part's $1D: part N occupies (N-1)*$20.
    assert.equal(dr.palAt, (dr.part - 1) * 0x20 + 0x1d,
      `palAt $${dr.palAt.toString(16)} is part ${dr.part}'s $1D -- the mapping checks out`);
  }
});

test('W367 the draw pairs share art and palette, and their biases straddle a boundary', { skip: SKIP }, () => {
  // Two pairs, each drawing one part twice as mirrored halves. If a port collapsed a pair to one sprite the
  // object would render half-missing, so the pairing is asserted rather than described.
  const byPart = new Map();
  for (const dr of T4C.draws) {
    if (!byPart.has(dr.part)) byPart.set(dr.part, []);
    byPart.get(dr.part).push(dr);
  }
  assert.deepEqual([...byPart.keys()].sort(), [...T4C.partsDrawn].sort(), 'parts 1, 3 and 4 are drawn');
  for (const part of [3, 4]) {
    const pair = byPart.get(part);
    assert.equal(pair.length, 2, `part ${part} is drawn TWICE`);
    assert.equal(pair[0].art, pair[1].art, `  ...sharing one art long`);
    assert.equal(pair[0].palAt, pair[1].palAt, `  ...and one palette field`);
    assert.equal(pair[0].d3, pair[1].d3, `  ...and one D3`);
    assert.notEqual(pair[0].biases[0], pair[1].biases[0], `  ...but DIFFERENT first biases`);
    assert.equal(pair[0].biases[1], pair[1].biases[1], `  ...and the same second`);
    // The differing halves straddle a boundary: their high words differ by exactly one.
    const hi = pair.map((d) => (d.biases[0] >>> 16) & 0xffff).sort((a, b) => a - b);
    assert.equal(hi[1] - hi[0], 1, `  ...high words $${hi[0].toString(16)}/$${hi[1].toString(16)} -- mirrored`);
  }
  // W371: part 1 is drawn THREE times, not once, and there was never a "four-bias outlier". That count
  // came from reading $26F71A's three blocks as one entry and merging block A's two biases with block
  // B's two. Block C's single bias was never recorded at all.
  const p1 = byPart.get(1);
  assert.equal(p1.length, 3, 'part 1 is drawn THREE times, by the three blocks inside $26F71A');
  assert.deepEqual(p1.map((d) => d.biases.length), [2, 2, 1], 'two, two and ONE -- never four');
  assert.deepEqual(p1.map((d) => d.art), [0x14985c, 0x1494a0, 0x148eec], 'three DIFFERENT art longs');
  assert.equal(new Set(p1.map((d) => d.palAt)).size, 1, 'but one shared palette field, ($1D,A6)');
  // Only block B applies the ramp, and it does so through the swap pair.
  assert.deepEqual(p1.map((d) => d.rampSwapAdd ?? null), [null, 0x1e, null],
    'the RAMP rides on block B alone -- swap D1 / add.w ($1E,A5),D1 / swap D1');
});

test('W371 the part-3 pair mirrors by ADD vs SUBTRACT, the part-4 pair does not', { skip: SKIP }, () => {
  // The spec had `partAdd: null` on $26F7D2 because its extractor looked for add.w ($D26E) only. It is
  // `sub.w ($4A,A6),D1` ($926E) -- so the pair mirrors twice, by bias AND by sign, which is what puts
  // the halves either side of the boundary. The part-4 pair both ADD, from $68 and $6A.
  assert.equal(IMG.readUInt16BE(0x26f7b8), 0xd26e, '$26F7B8 add.w (d16,A6),D1');
  assert.equal(IMG.readUInt16BE(0x26f7ba), 0x0048, '  ...($48,A6)');
  assert.equal(IMG.readUInt16BE(0x26f7e2), 0x926e, '$26F7E2 sub.w (d16,A6),D1 -- SUBTRACT');
  assert.equal(IMG.readUInt16BE(0x26f7e4), 0x004a, '  ...($4A,A6), a DIFFERENT offset too');
  for (const [at, off] of [[0x26f808, 0x68], [0x26f836, 0x6a]]) {
    assert.equal(IMG.readUInt16BE(at), 0xd26e, `$${at.toString(16)} add.w -- part 4 both ADD`);
    assert.equal(IMG.readUInt16BE(at + 2), off, `  ...($${off.toString(16)},A6)`);
  }
  // And every one of them is a WORD op on the LONG D1: low 16 bits only, no carry into the high word,
  // and it sits BETWEEN the two addi.l biases, so those two are not sequential and must not be folded.
  assert.equal(T4C.partOpIsWord, true, 'recorded, because `d1 + v` on the long would be wrong');
  assert.equal(IMG.readUInt16BE(0x26f7b2), 0x0681, '$26F7B2 addi.l -- bias BEFORE the word add');
  assert.equal(IMG.readUInt16BE(0x26f7bc), 0x0681, '$26F7BC addi.l -- and the other AFTER it');
});

test('W367 $4C HAS a jump-table state machine -- eight handlers, bounded by adjacency', { skip: SKIP }, () => {
  // W354 recorded "NO jump table, one jsr (A0) in the whole span" and cited that as evidence against one.
  // That jsr IS the dispatcher. This test exists so the claim cannot be re-dismissed.
  assert.equal(IMG.readUInt16BE(0x26f86a), 0x41fa, '$26F86A lea (d16,PC),A0');
  assert.equal(0x26f86c + IMG.readInt16BE(0x26f86c), T4C.stateTable, '  ...-> the state table $26F886');
  assert.equal(IMG.readUInt16BE(0x26f870), 0x302e, '$26F870 move.w (d16,A6),D0');
  assert.equal(IMG.readUInt16BE(0x26f872), T4C.stateAt, '  ...($26,A6) -- the STATE, as the index');
  assert.equal(IMG.readUInt16BE(0x26f874), 0xd040, '$26F874 add.w D0,D0');
  assert.equal(IMG.readUInt16BE(0x26f876), 0xd040, '$26F876 add.w D0,D0 again -- so x4, FOUR-byte entries');
  assert.equal(IMG.readUInt16BE(0x26f87a), 0x2050, '$26F87A movea.l (A0),A0 -- load the POINTER');
  assert.equal(IMG.readUInt16BE(T4C.stateDispatch), 0x4e90, '$26F87C jsr (A0) -- THE DISPATCH');
  assert.equal(IMG.readUInt16BE(0x26f87e), 0x4ef9, '$26F87E jmp abs.l');
  assert.equal(IMG.readUInt32BE(0x26f880), T4C.stateExit, '  ...$2417DE, applyVelocityA6');

  // Eight handlers, each read back from the table and each inside the type's span.
  assert.equal(T4C.states.length, 8, 'EIGHT state handlers -- the original note was right');
  T4C.states.forEach((h, i) => {
    assert.equal(IMG.readUInt32BE(T4C.stateTable + i * 4), h,
      `state ${i} -> $${h.toString(16)}`);
    assert.ok(h >= T4C.handler && h < T4C.handlerEnd,
      `  ...and it is inside $4C's span $${T4C.handler.toString(16)}..$${T4C.handlerEnd.toString(16)}`);
  });
  // The table ends where state 0's handler begins -- $20 bytes, the cleanest bound available.
  assert.equal(T4C.stateTable + T4C.states.length * 4, T4C.states[0],
    'the table ends exactly at state 0s handler, so its length is self-evident');
});

test('W367 all EIGHT state handlers open with the same frame-0 test', { skip: SKIP }, () => {
  // Two states read by hand both open `cmpi.w #$0,($28,A6)`. If all eight do, the shape is the pattern
  // handler4C is built on, and that is worth checking across the set rather than inferring from two.
  let uniform = 0;
  for (const h of T4C.states) {
    if (IMG.readUInt16BE(h) === 0x0c6e && IMG.readUInt16BE(h + 2) === 0
        && IMG.readUInt16BE(h + 4) === T4C.stepAt) uniform += 1;
  }
  assert.equal(uniform, T4C.states.length,
    `all ${T4C.states.length} states open cmpi.w #$0,($28,A6) -- one shape, eight bodies`);
});

test('W367 ($1A,A6) has FIVE writers, three outside the band range', { skip: SKIP }, () => {
  // T4C used to call this "the distance band". Pinning the writers stops that framing returning.
  // $26F8B0 move.w #$1600 -- a WORD write, so it also zeroes ($1B,A6).
  assert.equal(IMG.readUInt16BE(0x26f8b0), 0x3d7c, '$26F8B0 move.w #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f8b2), 0x1600, '  ...#$1600 -- $16 into ($1A), $00 into ($1B)');
  assert.equal(IMG.readUInt16BE(0x26f8b4), T4C.bandAt, '  ...at ($1A,A6)');
  // $26F91E move.b #$4 -- a BYTE write, state 1.
  assert.equal(IMG.readUInt16BE(0x26f91e), 0x1d7c, '$26F91E move.b #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f920), 0x0004, '  ...#$4');
  assert.equal(IMG.readUInt16BE(0x26f922), T4C.bandAt, '  ...same field');
  // The decrement and the increment.
  assert.equal(IMG.readUInt16BE(0x26f8f4), 0x532e, '$26F8F4 subq.b #1,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f8f6), T4C.bandAt, '  ...($1A,A6) -- DECREMENT');
  assert.equal(IMG.readUInt16BE(0x26ff76), 0x522e, '$26FF76 addq.b #1,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26ff78), T4C.bandAt, '  ...($1A,A6) -- INCREMENT');
  // So the values $16 and $4 are both outside the $8/$6 the distance helper writes.
  const bandVals = T4C.bandThresholds.map(([, v]) => v).filter((v) => v !== null);
  for (const v of [0x16, 0x04]) {
    assert.ok(!bandVals.includes(v),
      `$${v.toString(16)} is NOT one of the distance bands -- so the field is not "the band"`);
  }
});

test('W368 state 4 writes $8 into ($1A,A6) -- COLLIDING with a distance band value', { skip: SKIP }, () => {
  // States 0-4 all write ($1A,A6): $16, $4, $10, $10, and now $8. The first three are outside the band
  // range, which is what the test above uses to show the field is not "the distance band".
  // State 4 is different: $8 IS the band value $26FF9E writes for ">= $100".
  assert.equal(IMG.readUInt16BE(0x26fd76), 0x1d7c, '$26FD76 move.b #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26fd78), 0x0008, '  ...#$8');
  assert.equal(IMG.readUInt16BE(0x26fd7a), T4C.bandAt, '  ...($1A,A6), the same shared byte');
  const bandVals = T4C.bandThresholds.map(([, v]) => v).filter((v) => v !== null);
  assert.ok(bandVals.includes(0x08),
    '$8 IS a band value -- so reading the field cannot tell you WHICH site wrote it');
  // And the main flow branches on exactly $8, so state 4 forces the close-range behaviour outright.
  for (const at of T4C.bandTestSites) {
    assert.equal(IMG[at + 3], 0x08, `$${at.toString(16)} compares against $8 -- state 4 satisfies it`);
  }
});

test('W368 state 4 walks a cmpi.w SCRIPT STEP cascade, not just the frame-0 opening', { skip: SKIP }, () => {
  // The eight states were verified to open cmpi.w #$0,($28,A6). State 4 shows what follows: a SECOND
  // compare against #$1 on the same field, so ($28,A6) really is a step counter walked by successive
  // compares -- each arm advancing it -- rather than a plain frame timer.
  assert.equal(IMG.readUInt16BE(0x26fd66), 0x0c6e, '$26FD66 cmpi.w #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26fd68), 0x0000, '  ...#$0 -- step 0');
  assert.equal(IMG.readUInt16BE(0x26fd6a), T4C.stepAt, '  ...($28,A6)');
  assert.equal(IMG.readUInt16BE(0x26fd82), 0x0c6e, '$26FD82 cmpi.w #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26fd84), 0x0001, '  ...#$1 -- step 1, the SAME field');
  assert.equal(IMG.readUInt16BE(0x26fd86), T4C.stepAt, '  ...($28,A6) again');
  // Step 0 must branch PAST step 0's body and land on step 1's compare.
  assert.equal(0x26fd6e + IMG.readInt16BE(0x26fd6e), 0x26fd82, 'step 0s bne -> step 1s compare');
});

test('W368 the ($1A,A6) writer census is COMPLETE -- rescanned, not accreted', { skip: SKIP }, () => {
  // The point of this test is the CLOSED WORLD. Four earlier revisions of the spec comment said four, five,
  // six and seven writers, each written while reading one more state body. This rescans the whole type and
  // fails if the ROM has a site the census omits -- so the count cannot drift again.
  const found = [];
  for (let i = 0x26f5f2; i < 0x270000; i += 2) {
    const w = IMG.readUInt16BE(i);
    if (w === 0x3d7c || w === 0x1d7c) {            // move.w/move.b #imm,(d16,A6)
      if (IMG.readUInt16BE(i + 4) === T4C.bandAt) found.push(i);
    } else if (w === 0x532e || w === 0x522e) {     // subq.b/addq.b #1,(d16,A6)
      if (IMG.readUInt16BE(i + 2) === T4C.bandAt) found.push(i);
    }
  }
  assert.deepEqual(found, [...T4C.bandWriters],
    'every ROM site writing ($1A,A6), and ONLY those -- census must match the cartridge exactly');
  assert.equal(found.length, 16, 'sixteen, not the four/five/six/seven earlier revisions claimed');
});

test('W368 a state and the distance helper write the SAME band value', { skip: SKIP }, () => {
  // $26FD76 is state 4; $26FFB2 is the distance helper. Both store $8, and the main flow branches on $8.
  // So the field cannot be read back to learn WHY it holds a value.
  assert.equal(IMG.readUInt16BE(0x26fd76), 0x1d7c, '$26FD76 move.b #imm,(d16,A6) -- state 4');
  assert.equal(IMG.readUInt16BE(0x26fd78), 0x0008, '  ...#$8');
  assert.equal(IMG.readUInt16BE(0x26ffb2), 0x1d7c, '$26FFB2 move.b #imm,(d16,A6) -- the distance helper');
  assert.equal(IMG.readUInt16BE(0x26ffb4), 0x0008, '  ...#$8, the SAME value');
  for (const at of T4C.bandTestSites) {
    assert.equal(IMG[at + 3], 0x08, `$${at.toString(16)} branches on $8 -- either writer satisfies it`);
  }
});

test('W368 ($1A) and ($1B) are written as a pair AND separately', { skip: SKIP }, () => {
  // Two word writes cover both bytes, and one byte write hits $1B alone. So the pair is neither a single
  // 16-bit field nor two independent bytes: the width is per-site.
  assert.equal(IMG.readUInt16BE(0x26f8b0), 0x3d7c, '$26F8B0 move.w #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f8b2), 0x1600, '  ...#$1600 -> ($1A)=$16, ($1B)=$00 -- CLEARS $1B');
  assert.equal(IMG.readUInt16BE(0x26ff4e), 0x3d7c, '$26FF4E move.w #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26ff50), 0x0420, '  ...#$420 -> ($1A)=$04, ($1B)=$20 -- SETS $1B');
  assert.equal(IMG.readUInt16BE(0x26ff52), T4C.bandAt, '  ...both at ($1A,A6)');
  assert.equal(IMG.readUInt16BE(0x26ff66), 0x1d7c, '$26FF66 move.b #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26ff6a), 0x001b, '  ...($1B,A6) ALONE -- so it is its own field too');
  assert.deepEqual([...T4C.bandWritersB], [0x26f8b0, 0x26ff4e, 0x26ff66], 'the three $1B sites');
});

test('W371 the tail is FIVE bsr calls, and $26F704 is the one the spec dropped', { skip: SKIP }, () => {
  // The spec listed four, starting at $26F708. $26F704 is a bsr.w that is ALSO the target of two
  // branches ($26F5F8 pause, $26F6EC blocked), and reading it as a label only lost the first draw.
  const got = [];
  for (const at of T4C.tailCallSites) {
    assert.equal(IMG.readUInt16BE(at), 0x6100, `$${at.toString(16)} bsr.w -- the word form`);
    got.push(at + 2 + IMG.readInt16BE(at + 2));
  }
  assert.deepEqual(got, [...T4C.tailCalls], 'five targets, in CALL order');
  assert.equal(IMG.readUInt16BE(0x26f718), 0x4e75, '$26F718 rts closes the chain -- exactly five');
  // Every draw routine appears exactly once, so the tail IS the draw table.
  // W371: the tail calls are the five ENTRY POINTS. `draws` has seven entries because $26F71A holds
  // three blocks, so the tail calls are a SUBSET, not an equality.
  const entries = T4C.draws.filter((d) => !d.block || d.block === 'A').map((d) => d.at);
  assert.deepEqual([...T4C.tailCalls].sort(), entries.sort(),
    'the five tail calls are the five draw ENTRY POINTS, and $26F71A is one of them');
});

test('W371 CALL order is not the array order -- part 1 draws LAST', { skip: SKIP }, () => {
  // `draws` is in ADDRESS order ($26F71A first). The cartridge calls part 1 LAST. Sprite layering
  // follows call order, so iterating `draws` to render puts part 1 underneath instead of on top.
  const callParts = T4C.tailCalls.map((a) => T4C.draws.find((d) => d.at === a).part);
  // (part 1 appears once here because the tail calls $26F71A once; it then draws three sprites.)
  assert.deepEqual(callParts, [4, 4, 3, 3, 1], 'both part-4 halves, then both part-3 halves, then part 1');
  const arrayParts = T4C.draws.filter((d) => !d.block || d.block === 'A').map((d) => d.part);
  assert.deepEqual(arrayParts, [1, 3, 3, 4, 4], 'the array is the REVERSE grouping -- do not render from it');
  assert.notDeepEqual(callParts, arrayParts, 'which is the whole point of keeping both lists');
});

test('W371 the pause path jumps INTO the draw chain, so a paused $4C still draws', { skip: SKIP }, () => {
  // $26F5F2 tst.w $8130D2 / bne $26F704 -- not to the rts. Pausing skips every state and every
  // subroutine but still renders all five sprites, which is why the object does not vanish when frozen.
  assert.equal(IMG.readUInt16BE(0x26f5f2), 0x4a79, '$26F5F2 tst.w abs.l');
  assert.equal(IMG.readUInt32BE(0x26f5f4), 0x008130d2, '  ...$8130D2, the freeze flag');
  assert.equal(IMG.readUInt16BE(0x26f5f8), 0x6600, '$26F5F8 bne.w');
  assert.equal(0x26f5fa + IMG.readInt16BE(0x26f5fa), T4C.pauseEntry, '  ...to $26F704, the FIRST draw');
  // The blocked test lands on the same instruction, so a blocked $4C draws too.
  assert.equal(IMG.readUInt16BE(0x26f6ec), 0x6600, '$26F6EC bne.w -- part 5 $1F blocked');
  assert.equal(0x26f6ee + IMG.readInt16BE(0x26f6ee), T4C.pauseEntry, '  ...also to $26F704');
});

test('W371 death needs the pool NEGATIVE, and the branch is bpl not beq', { skip: SKIP }, () => {
  // $26F690 tst.l ($1A,A5) / $26F694 bpl.w $26F6E4 -- so the object dies only when the 32-bit pool goes
  // NEGATIVE, not when it reaches zero. A `<= 0` port kills it one hit early; `=== 0` may never fire.
  assert.equal(IMG.readUInt16BE(0x26f690), 0x4aad, '$26F690 tst.l (d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f692), T4C.hpPoolAt, '  ...($1A,A5)');
  assert.equal(IMG.readUInt16BE(0x26f694), 0x6a00, '$26F694 bpl.w -- PLUS skips the death block');
  assert.equal(0x26f696 + IMG.readInt16BE(0x26f696), 0x26f6e4, '  ...to $26F6E4, past the kill');
  assert.equal(IMG.readUInt16BE(0x26f698), 0x203c, '$26F698 move.l #imm,D0 -- the kill score');
});

test('W371 an unhit frame REWRITES the palette byte, it does not just skip the XOR', { skip: SKIP }, () => {
  // $26F654 beq $26F6DE when the hit mask is empty, and $26F6DE stores $12 into ($1D,A6) outright.
  // With the $D XOR that gives $12 ^ $D = $1F while hit, so the flash is a two-value alternation and
  // the unhit path is what RESTORES it. Omitting it leaves the object stuck in its flash colour.
  assert.equal(IMG.readUInt16BE(0x26f654), 0x6700, '$26F654 beq.w -- no hit this frame');
  assert.equal(0x26f656 + IMG.readInt16BE(0x26f656), 0x26f6de, '  ...to $26F6DE');
  assert.equal(IMG.readUInt16BE(0x26f6de), 0x1d7c, '$26F6DE move.b #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f6e0), 0x0012, '  ...#$12, the RESTING palette');
  assert.equal(IMG.readUInt16BE(0x26f6e2), 0x001d, '  ...($1D,A6)');
  assert.equal((0x12 ^ T4C.palXorImmediate), 0x1f, 'and $12 XOR $D = $1F, the flash value');
});

test('W371 the handler span is bounded by $4E, not by an rts scan', { skip: SKIP }, () => {
  // handlerEnd was $26FFE8 with the note "the last rts is $26FFE6". $26FFE6 IS an rts -- but $26FFE8
  // is the START of the last subroutine, so the recorded end was the beginning of code. The subroutine
  // list itself contained the disproof: $26FFE8 is in it.
  assert.ok(T4C.subroutines.includes(0x26ffe8), '$26FFE8 is a subroutine, so the span cannot end there');
  assert.equal(IMG.readUInt16BE(0x26ffe8), 0x4a2e, '$26FFE8 tst.b (d16,A6) -- code, not padding');
  assert.equal(IMG.readUInt16BE(0x26ffea), 0x009f, "  ...($9F,A6), part 5's $1F");
  // Its beq reaches past $270000, which no rts-bounded span would have included.
  assert.equal(IMG.readUInt16BE(0x26ffec), 0x6700, '$26FFEC beq.w');
  assert.equal(0x26ffee + IMG.readInt16BE(0x26ffee), 0x270128, '  ...to $270128, past $270000');
  // The real bound is type $4E's init, with $4C's death table immediately below it.
  assert.equal(T4C.handlerEnd, 0x2701d6, "bounded by ADJACENCY to type $4E's init");
  assert.equal(IMG.readUInt16BE(0x26f6d2), 0x41fa, '$26F6D2 lea (d16,PC),A0');
  assert.equal(0x26f6d4 + IMG.readInt16BE(0x26f6d4), T4C.deathEffectTable, '  ...the $2701C8 table');
  assert.ok(T4C.deathEffectTable < T4C.handlerEnd, 'which sits inside the span, just below $4E');
});

test('W371 the retire flag is armed ONE FRAME before the prologue acts on it', { skip: SKIP }, () => {
  // ($9E,A6) is part 5's $1E. Nothing in the frame that writes it acts on it: the prologue tests it at
  // $26F5FC, which is the NEXT frame. So retirement is deliberately deferred by a frame, and a port that
  // retires inline at the write site skips the last frame of the object entirely.
  assert.equal(IMG.readUInt16BE(0x26f5fc), 0x4a2e, '$26F5FC tst.b (d16,A6) -- the prologue');
  assert.equal(IMG.readUInt16BE(0x26f5fe), 0x009e, "  ...($9E,A6), part 5's $1E");
  for (const at of [0x26ff96, 0x27000a]) {
    assert.equal(IMG.readUInt16BE(at), 0x1d7c, `$${at.toString(16)} move.b #imm,(d16,A6)`);
    assert.equal(IMG.readUInt16BE(at + 2), 0x0001, '  ...#$1');
    assert.equal(IMG.readUInt16BE(at + 4), 0x009e, '  ...($9E,A6) -- armed, not acted on');
    assert.ok(at > 0x26f5fc, '  ...and it happens AFTER the prologue read, so it lands next frame');
  }
});

test('W371 $26FFE8 returns a boolean in the CARRY, via two shared SR stubs', { skip: SKIP }, () => {
  // $270128 andi.w #$FFFE,SR / rts  = return carry CLEAR
  // $27012E ori.w  #$1,SR    / rts  = return carry SET
  // Privileged instructions used deliberately as a boolean return. $4C's single caller ($26F6E4)
  // IGNORES the carry -- it reads ($9E,A6) next frame instead -- so do not invent a branch on it here.
  assert.equal(IMG.readUInt16BE(0x270128), 0x027c, '$270128 andi.w #imm,SR');
  assert.equal(IMG.readUInt16BE(0x27012a), 0xfffe, '  ...#$FFFE, clearing the carry');
  assert.equal(IMG.readUInt16BE(0x27012c), 0x4e75, '  ...rts');
  assert.equal(IMG.readUInt16BE(0x27012e), 0x007c, '$27012E ori.w #imm,SR');
  assert.equal(IMG.readUInt16BE(0x270130), 0x0001, '  ...#$1, setting the carry');
  assert.equal(IMG.readUInt16BE(0x270132), 0x4e75, '  ...rts');
  // The one caller, and the instruction after it is NOT a bcc/bcs.
  assert.equal(IMG.readUInt16BE(0x26f6e4), 0x6100, '$26F6E4 bsr.w');
  assert.equal(0x26f6e6 + IMG.readInt16BE(0x26f6e6), 0x26ffe8, '  ...to $26FFE8');
  const after = IMG.readUInt16BE(0x26f6e8) & 0xff00;
  assert.ok(after !== 0x6400 && after !== 0x6500, 'the caller does not branch on the carry it returns');
});

test('W371 $26F702 is NOT a subroutine -- it is a displacement word', { skip: SKIP }, () => {
  // It was in `subroutines`. $26F700 is `bsr.w $26FA82`, so $26F702 is that instruction's displacement,
  // and `03 80` merely looks like an opcode to a scanner walking every 2-byte boundary.
  assert.equal(IMG.readUInt16BE(0x26f700), 0x6100, '$26F700 bsr.w');
  assert.equal(0x26f702 + IMG.readInt16BE(0x26f702), 0x26fa82, '  ...displacement points at $26FA82');
  assert.ok(!T4C.subroutines.includes(0x26f702), 'so it is no longer listed as an entry point');
  assert.equal(T4C.subroutines.length, 15, 'fifteen subroutines, not sixteen');
  // And nothing in the span reaches it, which is what makes the removal safe rather than a guess.
  let reached = 0;
  for (let i = T4C.handler; i < T4C.handlerEnd; i += 2) {
    const w = IMG.readUInt16BE(i);
    const isBr = [0x6100, 0x6000, 0x6600, 0x6700, 0x6a00, 0x6b00, 0x6c00, 0x6d00].includes(w);
    if (isBr && i + 2 + IMG.readInt16BE(i + 2) === 0x26f702) reached++;
  }
  assert.equal(reached, 0, 'no branch or call in $4C targets $26F702');
});

test('W371 the part setters are OFF/ON pairs, and ON is not the inverse of OFF', { skip: SKIP }, () => {
  // Switching a part ON also RESETS companion fields. Modelling these as one boolean setter drops the
  // reset and leaves stale state behind.
  for (const p of T4C.partSetters) {
    assert.equal(IMG.readUInt16BE(p.off), 0x3d7c, `$${p.off.toString(16)} move.w #imm,(d16,A6)`);
    assert.equal(IMG.readUInt16BE(p.off + 2), 0x0000, '  ...#$0');
    assert.equal(IMG.readUInt16BE(p.off + 4), p.flagAt, `  ...($${p.flagAt.toString(16)},A6)`);
    assert.equal(IMG.readUInt16BE(p.off + 6), 0x4e75, '  ...rts -- OFF does nothing else');
    assert.equal(IMG.readUInt16BE(p.on), 0x3d7c, `$${p.on.toString(16)} move.w #imm,(d16,A6)`);
    assert.equal(IMG.readUInt16BE(p.on + 2), 0x0001, '  ...#$1, the same field');
    assert.equal(IMG.readUInt16BE(p.on + 4), p.flagAt, '  ...same offset as OFF');
    assert.equal(IMG.readUInt16BE(p.on + 6), 0x3d7c, '  ...and then a SECOND store, which OFF lacks');
    assert.equal(IMG.readUInt16BE(p.on + 8), 0x0000, '  ...#$0');
    assert.equal(IMG.readUInt16BE(p.on + 10), p.clears[0], '  ...clearing the companion field');
  }
});

test('W371 ($34,A6) is a counter and ($35,A6) is its RELOAD -- the word literal sets both', { skip: SKIP }, () => {
  // This is what the word-literal rule buys, on a field pair whose purpose was unknown until now.
  // State 0 writes `move.w #$202,($34,A6)`, setting the counter to 2 AND the reload to 2. State 2
  // writes `move.b #$10,($34,A6)`, setting ONLY the counter and leaving the reload alone. A port that
  // normalised either write to the other's width would break one of the two states.
  assert.equal(IMG.readUInt16BE(0x26f8e6), 0x532e, '$26F8E6 subq.b #1,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f8e8), 0x0034, '  ...($34,A6), counting DOWN');
  assert.equal(IMG[0x26f8ea], 0x64, '$26F8EA bcc -- no borrow means not expired yet');
  assert.equal(IMG.readUInt16BE(0x26f8ee), 0x1d6e, '$26F8EE move.b (d16,A6),(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f8f0), 0x0035, '  ...FROM ($35,A6), the reload value');
  assert.equal(IMG.readUInt16BE(0x26f8f2), 0x0034, '  ...INTO ($34,A6) -- so $35 is $34s period');
  // And the two writes that set them, at their two different widths.
  assert.equal(IMG.readUInt16BE(0x26f8b6), 0x3d7c, '$26F8B6 move.w #imm,(d16,A6) -- state 0');
  assert.equal(IMG.readUInt16BE(0x26f8b8), 0x0202, '  ...#$202: ($34)=2 AND ($35)=2, both at once');
  assert.equal(IMG.readUInt16BE(0x26fbf6), 0x1d7c, '$26FBF6 move.b #imm,(d16,A6) -- state 2');
  assert.equal(IMG.readUInt16BE(0x26fbf8), 0x0010, '  ...#$10 into ($34) ONLY, reload untouched');
});

test('W371 state 0 ends by switching the DRAW VARIANT, ($17,A5)', { skip: SKIP }, () => {
  // ($17,A5) picks $23DECE or $23DF58 in the draw selector, so this is the object visibly changing
  // form -- and it happens only when BOTH counters expire: ($34,A6) reloading each time it borrows,
  // and ($1A,A6) decrementing once per reload. A two-stage timer, not one.
  assert.equal(IMG.readUInt16BE(0x26f8f4), 0x532e, '$26F8F4 subq.b #1,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f8f6), T4C.bandAt, '  ...($1A,A6) -- the OUTER counter');
  assert.equal(IMG.readUInt16BE(0x26f8fc), 0x1b7c, '$26F8FC move.b #imm,(d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f8fe), 0x0001, '  ...#$1');
  assert.equal(IMG.readUInt16BE(0x26f900), T4C.drawSelectAt, '  ...($17,A5), the draw VARIANT');
  assert.equal(IMG.readUInt16BE(0x26f902), 0x3cbc, '$26F902 move.w #imm,(A6)');
  assert.equal(IMG.readUInt16BE(0x26f904), 0xa001, '  ...#$A001 into part 1s flags word');
  assert.equal(IMG.readUInt16BE(0x26f906), 0x7001, '$26F906 moveq #$1,D0 -- then state 1');
  assert.equal(0x26f90a + IMG.readInt16BE(0x26f90a), T4C.stateSetter, '  ...bsr $26F858');
});

test('W371 state 1 walks the $26F984 target table with a WRAPPING cursor', { skip: SKIP }, () => {
  // W342 declared the window as "state 1's TWO target points" without the mechanism. Here it is:
  // lea $26F984,A0 / adda.w ($2A,A6),A0 / movem.w (A0),D2-D3, then the cursor steps by FOUR and is
  // masked to $7 -- so it takes the values 0 and 4 only, and the table is exactly two 4-byte entries.
  // That is also why a linear sweep desynchronises here: these eight bytes are DATA, not padding.
  assert.equal(IMG.readUInt16BE(0x26f938), 0x41fa, '$26F938 lea (d16,PC),A0');
  assert.equal(0x26f93a + IMG.readInt16BE(0x26f93a), 0x26f984, '  ...the target table');
  assert.equal(IMG.readUInt16BE(0x26f93e), 0xd0ee, '$26F93E adda.w (d16,A0),A0');
  assert.equal(IMG.readUInt16BE(0x26f940), 0x002a, '  ...($2A,A6), the cursor');
  assert.equal(IMG.readUInt16BE(0x26f942), 0x4c90, '$26F942 movem.w (A0),D2-D3 -- a POINT, two words');
  assert.equal(IMG.readUInt16BE(0x26f94e), 0x586e, '$26F94E addq.w #4,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f952), 0x026e, '$26F952 andi.w #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26f954), 0x0007, '  ...#$7, so the cursor is 0 or 4 and never 8');
  // And D2/D3 feed the distance bander, which answers what its target registers hold.
  assert.equal(0x26f948 + IMG.readInt16BE(0x26f948), T4C.distBander, '$26F946 bsr $26FF9E');
  const pts = [0, 4].map((o) => [IMG.readUInt16BE(0x26f984 + o), IMG.readUInt16BE(0x26f986 + o)]);
  assert.deepEqual(pts, [[0x5000, 0x2a00], [0x5000, 0x0e00]],
    'two points sharing an X and differing in Y -- so the cursor picks which one it heads for');
});

test('W371 state 1 ALTERNATES between state 2 and state 4 via a 1-bit toggle', { skip: SKIP }, () => {
  // ($18,A5) is a single bit: tst picks D0 = 2 or 4, then it increments and masks to $1. So the two
  // states run in strict alternation, and a port that hardcodes either one plays half the pattern.
  assert.equal(IMG.readUInt16BE(0x26f960), 0x7002, '$26F960 moveq #$2,D0 -- the default target state');
  assert.equal(IMG.readUInt16BE(0x26f962), 0x4a6d, '$26F962 tst.w (d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f964), 0x0018, '  ...($18,A5), the toggle');
  assert.equal(IMG.readUInt16BE(0x26f96a), 0x7004, '$26F96A moveq #$4,D0 -- the other one');
  assert.equal(0x26f96e + IMG.readInt16BE(0x26f96e), T4C.stateSetter, '$26F96C bsr $26F858');
  assert.equal(IMG.readUInt16BE(0x26f970), 0x526d, '$26F970 addq.w #1,(d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f974), 0x026d, '$26F974 andi.w #imm,(d16,A5)');
  assert.equal(IMG.readUInt16BE(0x26f976), 0x0001, '  ...#$1 -- one bit, so it flips every time');
  // It then arms both OFF setters before returning, which is where partSetters gets used.
  assert.equal(0x26f97c + IMG.readInt16BE(0x26f97c), T4C.partSetters[0].off, '$26F97A bsr the $46 OFF');
  assert.equal(0x26f980 + IMG.readInt16BE(0x26f980), T4C.partSetters[1].off, '$26F97E bsr the $66 OFF');
});

test('W371 state 2 spawns with TWO cursors rotating in OPPOSITE directions', { skip: SKIP }, () => {
  // ($2A,A6) steps +4 and ($2B,A6) steps -4, both masked to $3F -- a 64-step circle walked by 4, one
  // arm clockwise and one anticlockwise. Copying either arm to the other, or masking to $3E as the
  // 32-step sprite fields elsewhere in this port do, collapses the pattern into a single spiral.
  assert.equal(IMG.readUInt16BE(0x26fc90), 0x582e, '$26FC90 addq.b #4,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26fc92), 0x002a, '  ...($2A,A6) FORWARD');
  assert.equal(IMG.readUInt16BE(0x26fcb8), 0x592e, '$26FCB8 subq.b #4,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x26fcba), 0x002b, '  ...($2B,A6) BACKWARD');
  for (const at of [0x26fc94, 0x26fcbc]) {
    assert.equal(IMG.readUInt16BE(at), 0x022e, `$${at.toString(16)} andi.b #imm,(d16,A6)`);
    assert.equal(IMG.readUInt16BE(at + 2), 0x003f, '  ...#$3F -- 64 steps, NOT the 32-step $3E mask');
  }
  // The two bytes are the pair state 2 sets with two separate move.b writes where state 1 used a word.
  assert.equal(IMG.readUInt16BE(0x26fbea), 0x1d7c, '$26FBEA move.b #imm,($2A,A6)');
  assert.equal(IMG.readUInt16BE(0x26fbf0), 0x1d7c, '$26FBF0 move.b #imm,($2B,A6) -- separately');
});

test('W371 state 2 spawns type $52 and writes the child position and heading', { skip: SKIP }, () => {
  // moveq #$52,D0 / jsr $263684, then the returned record gets a biased copy of the parent position
  // and ONE of the two cursors as its heading. So the counter-rotation above is what the bullets ride.
  assert.equal(IMG.readUInt16BE(0x26fc9a), 0x7052, '$26FC9A moveq #$52,D0 -- the child TYPE');
  assert.equal(IMG.readUInt16BE(0x26fc9c), 0x4eb9, '$26FC9C jsr abs.l');
  assert.equal(IMG.readUInt32BE(0x26fc9e), 0x00263684, '  ...$263684, the spawn enqueue');
  assert.equal(IMG.readUInt16BE(0x26fca2), 0x202e, '$26FCA2 move.l (d16,A6),D0 -- parent position');
  assert.equal(IMG.readUInt16BE(0x26fca6), 0x0680, '$26FCA6 addi.l #imm,D0');
  assert.equal(IMG.readUInt32BE(0x26fca8), 0x0c800a00, '  ...#$0C800A00, the muzzle offset');
  assert.equal(IMG.readUInt16BE(0x26fcae), 0x2140, '$26FCAE move.l D0,(d16,A0) -- into the CHILD');
  assert.equal(IMG.readUInt16BE(0x26fcb0), 0x0016, '  ...($16,A0)');
  assert.equal(IMG.readUInt16BE(0x26fcb2), 0x116e, '$26FCB2 move.b (d16,A6),(d16,A0)');
  assert.equal(IMG.readUInt16BE(0x26fcb4), 0x002b, '  ...FROM ($2B,A6), the BACKWARD cursor');
  assert.equal(IMG.readUInt16BE(0x26fcb6), 0x001a, '  ...INTO the child $1A');
});
