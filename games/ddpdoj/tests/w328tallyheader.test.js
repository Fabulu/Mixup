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
import { drawTallyHeader25DD80 } from '../src/tallyscreen.js';
import { BUCKETS, ENQUEUE_MASK, NO_ZOOM_OR, RECORD_BYTES } from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? false : 'the ROM image is absent; skip, not pass';

const B = BUCKETS[26];
const A4 = 0x81a000;          // a scratch descriptor
const PALETTE = 0x1234;       // ($14,A4) -- distinctive, so a wrong source is visible

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
  assert.equal(IMG.readUInt32BE(0x25dd82), 0x5bc02c00, '$25DD80 the header position');
  assert.equal(IMG.readUInt32BE(0x25dd8a), 0x00334300, '$25DD88 the header descriptor');
  assert.equal(IMG.readUInt16BE(0x25dd90), 0x0630, '$25DD8E the header D3');
  assert.equal(IMG.readUInt32BE(0x25dda8), 0x04000100, '$25DDA6 the first label offset');
  assert.equal(IMG.readUInt32BE(0x25ddc4), 0x00000600, '$25DDC2 the step to the second');
  assert.equal(IMG.readUInt32BE(0x25ddae), 0x00334394, 'side 0 label A');
  assert.equal(IMG.readUInt32BE(0x25ddca), 0x003343b8, 'side 0 label B');
  assert.equal(IMG.readUInt32BE(0x25dde4), 0x04000100, '$25DDE2 -- the SAME offset for side 1');
  assert.equal(IMG.readUInt32BE(0x25ddea), 0x003343dc, 'side 1 label A');
  assert.equal(IMG.readUInt32BE(0x25de06), 0x00334400, 'side 1 label B');

  for (const [side, a, b] of [[0, 0x00334394, 0x003343b8], [1, 0x003343dc, 0x00334400]]) {
    const ram = world();
    assert.equal(drawTallyHeader25DD80(ram, A4, side), 3, 'THREE records, always');
    assert.equal(ram.u16(B.counter), 3 * RECORD_BYTES, 'and the counter moved by three');

    // The header is common to both sides.
    const h = record(ram, 0);
    assert.equal(h.d0, packed(0x5bc02c00), 'the header position, packed');
    assert.equal(h.d2, 0x00334300);
    assert.equal(h.d3, 0x0630);
    assert.equal(h.d4, PALETTE, 'and D4 comes from ($14,A4), the DESCRIPTOR');

    // The labels are NOT.
    const l1 = record(ram, 1), l2 = record(ram, 2);
    assert.equal(l1.d2, a, `side ${side} label A`);
    assert.equal(l2.d2, b, `side ${side} label B`);
    assert.equal(l1.d3, 0x0410);
    assert.equal(l2.d3, 0x0410);
    assert.equal(l1.d0, packed(0x5bc02c00 + 0x04000100), 'label A is header + $04000100');
    assert.equal(l2.d0, packed(0x5bc02c00 + 0x04000100 + 0x600), 'and label B is +$600 past it');
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
  assert.ok(ram.u16(B.counter) <= B.capBytes, 'the counter stays inside the bucket');
});
