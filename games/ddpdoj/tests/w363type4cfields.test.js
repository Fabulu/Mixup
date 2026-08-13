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
  }
  assert.equal(T4C.subroutines.length, 16, 'sixteen internal subroutines');
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
  assert.equal(T4C.draws.length, 5, 'FIVE draw routines, not four -- $26F71A exits by rts, not jmp');
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
  assert.equal(byPart.get(1).length, 1, 'part 1 is drawn once, by the four-bias outlier');
  assert.equal(byPart.get(1)[0].biases.length, 4, 'and it takes FOUR biases where the others take two');
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
