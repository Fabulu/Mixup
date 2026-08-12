// W328 -- the stage-clear screen's HEADER and its TWO LABELS, `$25DD80..$25DE18`.
//
// Docket D30. The owner reported "Stage transition looks good but is busted. 0's, some pictures of
// medals" and, earlier, "labels too I think". This is the labels.
//
// THE TRAP THIS FILE EXISTS FOR: the four label descriptors ascend by exactly `$24`
// ($334394, $3343B8, $3343DC, $334400), which reads like ONE ROW OF FOUR until the `bra` at
// `$25DDDE` is accounted for. It is TWO PER SIDE at the same two offsets, and a port that drew all
// four would put the other player's labels on this player's screen. Test 2 asserts the split by
// driving both sides and checking they disagree.
//
// Every expected value is derived from the listing and the ROM IMAGE, never from running the port.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { drawTallyHeader25DD80, tallyCursor25DD0C,
  tallyYCursor25DEAE, SCREEN11,
  drawTallyYRows25DF4C, otherSideEntry25DAC2 } from '../src/tallyscreen.js';
import { BUCKETS, ENQUEUE_MASK, NO_ZOOM_OR, RECORD_BYTES } from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? false : 'the ROM image is absent; skip, not pass';

const B = BUCKETS[26];
const A4 = 0x81a000;          // a scratch descriptor
const PALETTE = 0x1234;       // ($14,A4) -- distinctive, so a wrong source is visible
const SLOT = 0x80e300;        // a scratch object slot
const STORE = 0x81a100;       // where ($10,A4) points -- the cursor's real home

/** Read back the `n`th 12-byte record the emitter wrote. */
function record(ram, n) {
  const at = B.buffer + n * RECORD_BYTES;
  return {
    d0: ((ram.u16(at) << 16) | ram.u16(at + 2)) >>> 0,
    d2: ((ram.u16(at + 4) << 16) | ram.u16(at + 6)) >>> 0,
    d3: ram.u16(at + 8),
    d4: ram.u16(at + 10),
  };
}
/** What the emitter does to a position long: `asr.l #6`, mask, or. */
const packed = (d1) => ((((d1 | 0) >> 6) & ENQUEUE_MASK) | NO_ZOOM_OR) >>> 0;

function world() {
  const ram = new Ram();
  ram.setU16(A4 + 0x14, PALETTE);
  ram.setU16(B.counter, 0);
  return ram;
}

// ==================== 1. THE BUCKET IS THE ONE $24018C NAMES

test('W328 bucket 26 IS $24018C\'s buffer/counter pair', { skip: SKIP_IMG }, () => {
  // `$240190 lea $80AD14,A0 / $240196 adda.w $80AFEE,A0`, read straight out of the image. This is
  // what makes `enqueueRegisters(ram, 26, ...)` the right call rather than a new emitter -- the
  // first pass of D30's analysis called `$24018C` the screen's one missing primitive and it never
  // was: the port has had this routine since W30, transcribed from `$23EFC6`.
  assert.equal(IMG.readUInt32BE(0x240192), 0x0080ad14, '$240190 lea $80AD14');
  assert.equal(IMG.readUInt32BE(0x240198), 0x0080afee, '$240196 adda.w $80AFEE');
  assert.equal(B.buffer, 0x80ad14);
  assert.equal(B.counter, 0x80afee);
  // `$24019C addi.w #$C,$80AFEE` -- one 12-byte record per call.
  assert.equal(IMG.readUInt16BE(0x24019e), 0x000c, 'the counter bumps by twelve');
  assert.equal(RECORD_BYTES, 12);
  // and the packing constants
  assert.equal(IMG.readUInt32BE(0x2401aa), ENQUEUE_MASK, '$2401A8 andi.l');
  assert.equal(IMG.readUInt32BE(0x2401b0), NO_ZOOM_OR, '$2401AE ori.l');
});

// ==================== 2. TWO LABELS PER SIDE, NOT FOUR IN A ROW

test('W328 each side draws the HEADER and its OWN two labels', { skip: SKIP_IMG }, () => {
  // The immediates, quoted from the image so the test's idea of them is the listing's.
  // THE HEADER POSITION IS PER-SIDE and the side-0 constant lives TWO INSTRUCTIONS ABOVE the one
  // that looks like "the" header position. W328 shipped $5BC02C00 for both sides before reading
  // $25DD72, so this asserts both and the branch between them.
  assert.equal(IMG.readUInt32BE(0x25dd74), 0x5bc00000, '$25DD72 -- SIDE 0 keeps this');
  // no `+2` here: `tst.b ($7,A5)` IS the instruction at $25DD78, whereas the `move.l #imm`
  // assertions above skip their two opcode bytes.
  assert.equal(IMG.readUInt32BE(0x25dd78), 0x4a2d0007, '$25DD78 tst.b ($7,A5)');
  assert.equal(IMG.readUInt32BE(0x25dd82), 0x5bc02c00, '$25DD80 -- side 1 only');
  assert.equal(IMG.readUInt32BE(0x25dd8a), 0x00334300, '$25DD88 the header descriptor');
  assert.equal(IMG.readUInt16BE(0x25dd90), 0x0630, '$25DD8E the header D3');
  assert.equal(IMG.readUInt32BE(0x25dda8), 0x04000100, '$25DDA6 the first label offset');
  assert.equal(IMG.readUInt32BE(0x25ddc4), 0x00000600, '$25DDC2 the step to the second');
  assert.equal(IMG.readUInt32BE(0x25ddae), 0x00334394, 'side 0 label A');
  assert.equal(IMG.readUInt32BE(0x25ddca), 0x003343b8, 'side 0 label B');
  assert.equal(IMG.readUInt32BE(0x25dde4), 0x04000100, '$25DDE2 -- the SAME offset for side 1');
  assert.equal(IMG.readUInt32BE(0x25ddea), 0x003343dc, 'side 1 label A');
  assert.equal(IMG.readUInt32BE(0x25de06), 0x00334400, 'side 1 label B');

  for (const [side, a, b, hdr] of [[0, 0x00334394, 0x003343b8, 0x5bc00000],
    [1, 0x003343dc, 0x00334400, 0x5bc02c00]]) {
    const ram = world();
    assert.equal(drawTallyHeader25DD80(ram, A4, side), 4, 'FOUR records: header, two labels, cursor');
    assert.equal(ram.u16(B.counter), 4 * RECORD_BYTES, 'and the counter moved by four');

    // The header position differs by side; the DESCRIPTOR and D3 do not.
    const h = record(ram, 0);
    assert.equal(h.d0, packed(hdr), `side ${side}'s own header position, packed`);
    assert.equal(h.d2, 0x00334300);
    assert.equal(h.d3, 0x0630);
    assert.equal(h.d4, PALETTE, 'and D4 comes from ($14,A4), the DESCRIPTOR');

    // The labels are NOT.
    const l1 = record(ram, 1), l2 = record(ram, 2);
    assert.equal(l1.d2, a, `side ${side} label A`);
    assert.equal(l2.d2, b, `side ${side} label B`);
    assert.equal(l1.d3, 0x0410);
    assert.equal(l2.d3, 0x0410);
    assert.equal(l1.d0, packed(hdr + 0x04000100), 'label A is THIS side header + $04000100');
    assert.equal(l2.d0, packed(hdr + 0x04000100 + 0x600), 'and label B is +$600 past it');
  }
});

test('W328 the two sides draw DIFFERENT labels, which is the whole trap', { skip: SKIP_IMG }, () => {
  // The four descriptors ascend by exactly $24, so they look like one row of four. If a port drew
  // all four -- or drew side 0's pair for both sides -- these two runs would agree. They must not.
  const runs = [0, 1].map((side) => {
    const ram = world();
    drawTallyHeader25DD80(ram, A4, side);
    return [record(ram, 1).d2, record(ram, 2).d2];
  });
  assert.notDeepEqual(runs[0], runs[1], 'side 0 and side 1 must not draw the same labels');
  // And the four together are the ascending-by-$24 run, which is why they read as one row.
  const all = [...runs[0], ...runs[1]].sort((x, y) => x - y);
  for (let i = 1; i < 4; i++) {
    assert.equal(all[i] - all[i - 1], 0x24, 'the four ascend by exactly $24');
  }
});

test('W328 a non-zero side byte selects side 1, not just the value 1', { skip: SKIP_IMG }, () => {
  // `$25DD9E tst.b ($7,A5) / bne` is a NON-ZERO test, so any non-zero byte takes side 1's arm. A
  // port that compared against 1 would send every other value down side 0's.
  for (const side of [1, 2, 0x80, 0xff]) {
    const ram = world();
    drawTallyHeader25DD80(ram, A4, side);
    assert.equal(record(ram, 1).d2, 0x003343dc, `side byte $${side.toString(16)} is side 1`);
  }
  const ram = world();
  drawTallyHeader25DD80(ram, A4, 0);
  assert.equal(record(ram, 1).d2, 0x00334394, 'and only zero is side 0');
});

test('W328 three records fit bucket 26, which holds ten', { skip: SKIP_IMG }, () => {
  // capBytes 120 = ten records of twelve. Three is well inside it, and saying so here is what
  // stops a later wave adding emit sites past the bucket's end without noticing.
  assert.equal(B.capBytes, 120);
  assert.equal(B.capBytes / RECORD_BYTES, 10);
  const ram = world();
  drawTallyHeader25DD80(ram, A4, 0);
  assert.equal(ram.u16(B.counter), 4 * RECORD_BYTES, 'four of the ten used');
  assert.ok(ram.u16(B.counter) <= B.capBytes, 'the counter stays inside the bucket');
});

// ==================== 3. THE CURSOR, $25DD0C -- FOUR TRAPS

test('W329 LEFT falls THROUGH into the right test, so both bits in one frame net zero',
  { skip: SKIP_IMG }, () => {
    // `$25DD24 jsr $28C6FA` is followed by `$25DD2A btst #$3,D0` with NO branch between them, so a
    // frame carrying both bits applies BOTH steps and fires the cue TWICE. An `else if` would make
    // that frame a single step -- which is why the port has two independent `if`s.
    assert.equal(IMG.readUInt32BE(0x25dd2a), 0x08000003, '$25DD2A btst #$3 follows unconditionally');
    const cues = [];
    const ram = world();
    ram.setU32(A4 + 0x10, STORE);
    ram.setU16(0x803972, (1 << 2) | (1 << 3));       // p1edge: LEFT and RIGHT together
    ram.setU8(SLOT + 0x0e, 1);
    ram.setU16(SLOT + 0x12, 0x100);
    tallyCursor25DD0C(ram, SLOT, A4, 0, { soundPost: (c) => cues.push(c) });
    assert.equal(ram.u8(SLOT + 0x0e), 1, 'minus one then plus one is where it started');
    assert.deepEqual(cues, [0x28c6fa, 0x28c6fa], 'and the step cue fired TWICE');
  });

test('W329 the clamp is `andi.b #$1`, so stepping off either end WRAPS', { skip: SKIP_IMG }, () => {
  // Two entries means one bit. `subq.b` on 0 gives $FF and the mask turns it into 1, so LEFT from 0
  // lands on 1 rather than sticking at 0. A range check would stick, and would be wrong.
  assert.equal(IMG.readUInt32BE(0x25dd42), 0x022d0001, '$25DD42 andi.b #$1,($E,A5)');
  for (const [from, bit, want] of [[0, 2, 1], [1, 3, 0], [1, 2, 0], [0, 3, 1]]) {
    const ram = world();
    ram.setU32(A4 + 0x10, STORE);
    ram.setU8(SLOT + 0x0e, from);
    ram.setU16(SLOT + 0x12, 0x100);
    ram.setU16(0x803972, 1 << bit);
    tallyCursor25DD0C(ram, SLOT, A4, 0, {});
    assert.equal(ram.u8(SLOT + 0x0e), want, `from ${from} on bit ${bit} -> ${want}`);
  }
});

test('W329 the cursor is stored THROUGH the descriptor\'s ($10,A4)', { skip: SKIP_IMG }, () => {
  // `$25DD48 movea.l ($10,A4),A0 / move.b ($E,A5),(A0)` -- the chosen entry leaves the record, and
  // a port that kept it only in the record would lose it the moment the screen self-killed.
  const ram = world();
  ram.setU32(A4 + 0x10, STORE);
  ram.setU8(SLOT + 0x0e, 1);
  ram.setU16(SLOT + 0x12, 0x100);
  ram.setU16(0x803972, 0);
  tallyCursor25DD0C(ram, SLOT, A4, 0, {});
  assert.equal(ram.u8(STORE), 1, 'the clamped cursor reached the descriptor\'s target');
});

test('W329 confirm fires on the TIMEOUT reaching zero OR a $70 button, and RE-ARMS',
  { skip: SKIP_IMG }, () => {
    // `$25DD50 subq.w #1,($12,A5) / beq` is a REACHES-zero test, not the `bcc` old-zero borrow the
    // enemy cadences use -- so it fires on the frame the word hits 0 and never wraps through $FFFF.
    // And `$25DD66 move.w #$4B0,($12,A5)` re-arms on the way OUT, so a confirmed screen leaves a
    // fresh timer rather than a zero.
    assert.equal(IMG.readUInt16BE(0x25dd68), 0x04b0, '$25DD66 re-arms to $4B0');

    const byTimeout = world();
    byTimeout.setU32(A4 + 0x10, STORE);
    byTimeout.setU16(SLOT + 0x12, 1);            // one frame left
    byTimeout.setU16(0x803972, 0);               // nothing pressed
    assert.equal(tallyCursor25DD0C(byTimeout, SLOT, A4, 0, {}), true, 'the timeout confirms');
    assert.equal(byTimeout.u16(SLOT + 0x12), 0x04b0, 'and it re-armed');

    const byButton = world();
    byButton.setU32(A4 + 0x10, STORE);
    byButton.setU16(SLOT + 0x12, 0x100);         // plenty of time left
    byButton.setU16(0x803972, 0x10);             // a bit inside the $70 mask
    assert.equal(tallyCursor25DD0C(byButton, SLOT, A4, 0, {}), true, 'a button confirms too');

    const neither = world();
    neither.setU32(A4 + 0x10, STORE);
    neither.setU16(SLOT + 0x12, 0x100);
    neither.setU16(0x803972, 0x80);              // OUTSIDE the $70 mask
    assert.equal(tallyCursor25DD0C(neither, SLOT, A4, 0, {}), false, 'and $80 is not a confirm');
    assert.equal(neither.u16(SLOT + 0x12), 0xff, 'the timer just decremented');
  });

test('W329 not confirming DRAWS, and confirming does not', { skip: SKIP_IMG }, () => {
  // `$25DD72` is the fall-through, so the draw is what happens when the cursor does NOT confirm.
  const drew = world();
  drew.setU32(A4 + 0x10, STORE);
  drew.setU16(SLOT + 0x12, 0x100);
  drew.setU16(0x803972, 0);
  tallyCursor25DD0C(drew, SLOT, A4, 0, {});
  assert.equal(drew.u16(B.counter), 4 * RECORD_BYTES, 'four records drawn');

  const confirmed = world();
  confirmed.setU32(A4 + 0x10, STORE);
  confirmed.setU16(SLOT + 0x12, 1);
  confirmed.setU16(0x803972, 0);
  tallyCursor25DD0C(confirmed, SLOT, A4, 0, {});
  assert.equal(confirmed.u16(B.counter), 0, 'and a confirming frame draws NOTHING');
});

test('W329 the cursor HIGHLIGHT blinks on FOUR phases, every OTHER frame', { skip: SKIP_IMG }, () => {
  // `$25DE42 move.w $80390A,D0 / asr.w #1,D0 / andi.w #$3,D0` -- the shift is BEFORE the mask, so
  // the phase changes every second frame rather than every frame. Masking first would give a
  // four-frame cycle of one frame each, which is a visibly faster blink.
  assert.equal(IMG.readUInt16BE(0x25de48), 0xe240, '$25DE48 asr.w #1,D0');
  assert.equal(IMG.readUInt32BE(0x25de4a), 0x02400003, '$25DE4A andi.w #$3,D0');
  const S0 = [0x00333fc4, 0x00334010, 0x0033405c, 0x003340a8];
  const S1 = [0x003340f4, 0x00334140, 0x0033418c, 0x003341d8];
  for (let i = 0; i < 4; i++) {
    assert.equal(IMG.readUInt32BE(0x25de8e + i * 4), S0[i], `side 0 blink ${i}`);
    assert.equal(IMG.readUInt32BE(0x25de9e + i * 4), S1[i], `side 1 blink ${i}`);
  }
  // Two consecutive frame words share a phase; the third moves on.
  for (const [word, phase] of [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [6, 3], [8, 0]]) {
    const ram = world();
    ram.setU16(0x80390a, word);
    drawTallyHeader25DD80(ram, A4, 0, 0);
    assert.equal(record(ram, 3).d2, S0[phase], `$80390A = ${word} -> phase ${phase}`);
  }
  // and the SIDE picks the table
  const s1 = world();
  s1.setU16(0x80390a, 0);
  drawTallyHeader25DD80(s1, A4, 1, 0);
  assert.equal(record(s1, 3).d2, S1[0], 'side 1 blinks from its OWN table');
});

test('W329 the highlight sits on the row the cursor is on', { skip: SKIP_IMG }, () => {
  // `$25DE8A` is two WORDS, $0000 and $0600 -- and $600 is exactly the step between the two labels,
  // which is what puts the highlight on a label row rather than between them.
  assert.equal(IMG.readUInt16BE(0x25de8a), 0x0000, 'row offset 0');
  assert.equal(IMG.readUInt16BE(0x25de8c), 0x0600, 'row offset 1 == the label step');
  for (const [cursor, off] of [[0, 0x0000], [1, 0x0600]]) {
    const ram = world();
    ram.setU16(0x80390a, 0);
    drawTallyHeader25DD80(ram, A4, 0, cursor);
    assert.equal(record(ram, 3).d0, packed(0x5bc00000 + off),
      `cursor ${cursor} highlights its own row`);
  }
});

// ==================== 4. THE Y CURSOR, $25DEAE -- THREE ENTRIES, SO NO MASK

/** The attract word must be non-zero or `otherSideHolds25DAEA` answers "nobody holds anything". */
function yWorld({ held = 0xff, attract = 0 } = {}) {
  const ram = world();
  // ATTRACT DEFAULTS OFF, and that is deliberate. The ROM's two readers of the saved-selection byte
  // DISAGREE about the $FF sentinel: `$25DAEA` checks for it and answers "nobody holds anything",
  // while `$25DAC2` returns it raw and its caller only rejects the attract-off $FFFF. So attract
  // LIVE plus a $FF byte is a state the board relies on not happening, and a fixture that set both
  // would be testing an unreachable combination. Tests that need the hold behaviour pass attract: 1
  // together with a REAL entry.
  ram.setU16(0x81308c, attract);           // HUDRAM.attract
  ram.setU8(SCREEN11.savedB + 0x01, held); // side 0 reads savedB for "the OTHER side"
  ram.setU8(SLOT + SCREEN11.side, 0);
  ram.setU32(A4 + 0x10, STORE);
  ram.setU16(SLOT + 0x12, 0x100);
  return ram;
}

test('W331 the Y cursor STEPS AND RETRIES over three entries instead of masking',
  { skip: SKIP_IMG }, () => {
    // Two entries is one bit, so the X cursor can `andi.b #$1`. THREE is not a power of two, so this
    // one wraps by compare: down goes to 2 ($25DEE6 subq.b / bge / else 2) and up goes to 0
    // ($25DF04 addq.b / cmpi.b #$2 / ble / else 0).
    assert.equal(IMG.readUInt32BE(0x25df06), 0x0c070002, '$25DF04 cmpi.b #$2,D7 -- a COMPARE, not a mask');
    for (const [from, bit, want] of [[0, 2, 2], [1, 2, 0], [2, 2, 1],
      [2, 3, 0], [0, 3, 1], [1, 3, 2]]) {
      const ram = yWorld();
      ram.setU8(SLOT + SCREEN11.yCur, from);
      ram.setU16(0x803972, 1 << bit);
      tallyYCursor25DEAE(ram, SLOT, A4, 0, {});
      assert.equal(ram.u8(SLOT + SCREEN11.yCur), want, `${from} on bit ${bit} -> ${want}`);
    }
  });

test('W331 it SKIPS an entry the other side is holding', { skip: SKIP_IMG }, () => {
  // `$25DEF0 bsr $25DAEA / $25DEF4 bcs $25DEE6` retries the step while the candidate is held. That
  // retry is the whole reason a picker exists instead of a mask.
  const ram = yWorld({ held: 1, attract: 1 });   // the other side sits on entry 1
  ram.setU8(SLOT + SCREEN11.yCur, 2);
  ram.setU16(0x803972, 1 << 2);             // step DOWN: 2 -> 1 is held, so it must go on to 0
  tallyYCursor25DEAE(ram, SLOT, A4, 0, {});
  assert.equal(ram.u8(SLOT + SCREEN11.yCur), 0, 'it stepped PAST the held entry');
});

test('W331 the cue fires only if the cursor actually MOVED', { skip: SKIP_IMG }, () => {
  // `$25DF18 cmp.b D6,D7 / beq $25DF24` compares against the value saved BEFORE the steps. The X
  // cursor has no such test because masking always moves.
  assert.equal(IMG.readUInt16BE(0x25df18), 0xbe06, '$25DF18 cmp.b D6,D7');
  const moved = [];
  const m = yWorld();
  m.setU8(SLOT + SCREEN11.yCur, 0);
  m.setU16(0x803972, 1 << 3);
  tallyYCursor25DEAE(m, SLOT, A4, 0, { soundPost: (c) => moved.push(c) });
  assert.deepEqual(moved, [0x28c6fa], 'a real move cues');

  const still = [];
  const s = yWorld();
  s.setU8(SLOT + SCREEN11.yCur, 1);
  s.setU16(0x803972, 0);                    // no direction at all
  tallyYCursor25DEAE(s, SLOT, A4, 0, { soundPost: (c) => still.push(c) });
  assert.deepEqual(still, [], 'and no move is SILENT');
});

test('W331 the Y cursor stores at ($1,A0), one byte past the X cursor', { skip: SKIP_IMG }, () => {
  // `$25DD4C move.b ($E,A5),(A0)` for X and `$25DF2C move.b ($F,A5),($1,A0)` for Y -- they share the
  // descriptor's data pointer, so an offset slip would overwrite the other cursor.
  assert.equal(IMG.readUInt32BE(0x25df2c), 0x116d000f, '$25DF2C move.b ($F,A5),($1,A0)');
  const ram = yWorld();
  ram.setU8(SLOT + SCREEN11.yCur, 0);
  ram.setU8(STORE, 0xaa);                   // the X cursor's byte, which must survive
  ram.setU16(0x803972, 1 << 3);
  tallyYCursor25DEAE(ram, SLOT, A4, 0, {});
  assert.equal(ram.u8(STORE + 1), 1, 'the Y cursor landed at +1');
  assert.equal(ram.u8(STORE), 0xaa, 'and the X cursor byte was not touched');
});

test('W331 confirm is the timeout OR a $70 button, and it means RUN STATE 2', { skip: SKIP_IMG }, () => {
  // `$25DF48 bra $25DB7C` -- the ROM TAILS into state 2 rather than returning a flag. The port
  // returns a boolean and lets the caller dispatch, which is the same behaviour.
  assert.equal(IMG.readUInt32BE(0x25df42), 0x4eb90028, '$25DF42 jsr $28C6E0');
  const t = yWorld();
  t.setU16(SLOT + 0x12, 1);
  t.setU16(0x803972, 0);
  assert.equal(tallyYCursor25DEAE(t, SLOT, A4, 0, {}), true, 'the timeout confirms');

  const b = yWorld();
  b.setU16(0x803972, 0x20);
  assert.equal(tallyYCursor25DEAE(b, SLOT, A4, 0, {}), true, 'a $70 button confirms');

  const n = yWorld();
  n.setU16(0x803972, 0x80);
  assert.equal(tallyYCursor25DEAE(n, SLOT, A4, 0, {}), false, '$80 is outside the mask');
});

// ==================== 5. THE VALUE ROWS, $25DF4C -- THE OWNER'S ZEROS

test('W332 the Y draw is PER-SIDE and side 1 is $5BC02600, not the X draw $5BC02C00',
  { skip: SKIP_IMG }, () => {
    // The W328 trap in its own shape: a scan finds $25DF5A's constant, and side 0's sits two
    // instructions ABOVE the branch at $25DF52. The two draws also use DIFFERENT side-1 positions,
    // so copying the X draw's would put these rows 1536 units of packed offset away.
    assert.equal(IMG.readUInt32BE(0x25df4e), 0x5bc00000, '$25DF4C -- side 0 keeps this');
    assert.equal(IMG.readUInt32BE(0x25df52), 0x4a2d0007, '$25DF52 tst.b ($7,A5)');
    assert.equal(IMG.readUInt32BE(0x25df5c), 0x5bc02600, '$25DF5A -- side 1, and NOT $5BC02C00');
    for (const [side, hdr] of [[0, 0x5bc00000], [1, 0x5bc02600]]) {
      const ram = yWorld();
      ram.setU16(0x80390a, 0);
      drawTallyYRows25DF4C(ram, SLOT, A4, side, 0);
      assert.equal(record(ram, 0).d0, packed(hdr), `side ${side}'s own row position`);
      assert.equal(record(ram, 0).d2, 0x00334224);
      assert.equal(record(ram, 0).d3, 0x0648);
    }
  });

test('W332 there are THREE row offsets here, where the X draw has two', { skip: SKIP_IMG }, () => {
  // `$25DFF0` is `0000 0600 0C00` -- the same $600 step with one more row, because the Y cursor has
  // three entries and the X cursor two.
  for (const [i, want] of [[0, 0x0000], [1, 0x0600], [2, 0x0c00]]) {
    assert.equal(IMG.readUInt16BE(0x25dff0 + i * 2), want, `row offset ${i}`);
  }
  for (const cursor of [0, 1, 2]) {
    const ram = yWorld();
    ram.setU16(0x80390a, 0);
    drawTallyYRows25DF4C(ram, SLOT, A4, 0, cursor);
    assert.equal(record(ram, 1).d0, packed(0x5bc00000 + [0, 0x600, 0xc00][cursor]),
      `cursor ${cursor} highlights its own row`);
  }
});

test('W332 the OTHER side marker is drawn only when they have one', { skip: SKIP_IMG }, () => {
  // `$25DFC0 jsr $25DAC2 / tst.w D0 / bmi $25DFEE` -- a negative answer SKIPS the third emit
  // entirely. That is why the screen can show both players' choices at once, and why it does not
  // draw a phantom one when the other seat is empty.
  assert.equal(IMG.readUInt16BE(0x25dfc4), 0x4a40, '$25DFC4 tst.w D0');
  const both = yWorld({ held: 2, attract: 1 });       // the other side sits on entry 2
  both.setU16(0x80390a, 0);
  assert.equal(drawTallyYRows25DF4C(both, SLOT, A4, 0, 0), 3, 'THREE records when they have one');
  assert.equal(record(both, 2).d2, 0x00334424, 'and it is the marker descriptor');
  assert.equal(record(both, 2).d0, packed(0x5bc00000 + 0xc00), 'on THEIR row, not mine');

  // THE SKIP IS THE ATTRACT GATE, NOT THE $FF SENTINEL, and the difference is measurable.
  // `move.b ($1,A0),D0` writes only D0's LOW byte, and the caller had just masked D0 to 0..3 for the
  // blink phase, so `tst.w D0` sees $00FF and reads POSITIVE. Only $25DAC2's attract-off $FFFF is
  // negative. So attract OFF skips the marker...
  const alone = yWorld({ held: 0xff });               // attract off -> $25DAC2 answers $FFFF
  alone.setU16(0x80390a, 0);
  assert.equal(drawTallyYRows25DF4C(alone, SLOT, A4, 0, 0), 2, 'TWO records when attract is off');

  // ...and a $FF sentinel with attract LIVE is a state the ROM relies on not happening: entry * 2
  // would read $25DFF0 + $1FE, far past a three-word table, and add whatever is there to a sprite
  // position. The port REFUSES by address rather than inventing a row.
  const bad = yWorld({ held: 0xff, attract: 1 });   // the combination the board avoids
  bad.setU16(0x80390a, 0);
  assert.throws(() => drawTallyYRows25DF4C(bad, SLOT, A4, 0, 0),
    (e) => e.romAddress === 0x25dfd6, 'an out-of-range entry throws BY ADDRESS');
});

test('W332 $25DAC2 answers $FFFF when attract is off, which is what skips the marker',
  { skip: SKIP_IMG }, () => {
    // `$25DADA tst.w $81308C / bne / move.w #$FFFF,D0` -- attract ZERO answers "none". So the third
    // row is a during-a-game element, and a port that ignored the gate would draw it on the
    // attract loop.
    assert.equal(IMG.readUInt32BE(0x25dae4), 0x303cffff, '$25DAE4 move.w #$FFFF,D0');
    const live = yWorld({ held: 1, attract: 1 });
    assert.equal(otherSideEntry25DAC2(live, SLOT), 1, 'attract live: the real entry');
    const off = yWorld({ held: 1 });   // attract off by default
    assert.equal(otherSideEntry25DAC2(off, SLOT), 0xffff, 'attract off: none');
  });

test('W332 the whole screen still fits bucket 26', { skip: SKIP_IMG }, () => {
  // The X draw emits four and this one emits three, and they are alternative phases rather than
  // simultaneous -- but saying the ceiling out loud is what stops a later wave overrunning it.
  const ram = yWorld({ held: 2, attract: 1 });
  ram.setU16(0x80390a, 0);
  drawTallyYRows25DF4C(ram, SLOT, A4, 0, 0);
  assert.ok(ram.u16(B.counter) <= B.capBytes, 'inside the bucket');
  assert.equal(ram.u16(B.counter), 3 * RECORD_BYTES);
});
