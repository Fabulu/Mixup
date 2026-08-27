// WAVE 11 -- main-loop call #4 and the enqueue API, pinned against the LISTING.
//
// These run on SYNTHETIC RAM, so `node --test games/ddpdoj/tests/` still works
// on a tree with no cartridge extracted.  What they CANNOT do is prove the
// translation matches the board -- that is `pgm.py dlgate`, whose twelve
// mutations over three scenarios are what prove IT can fail.
//
// What they exist for is the two kinds of case the board cannot supply:
//   * paths whose input the game can never hold (a queue pointer off the
//     12-byte grid, so `beq` and `bge` become distinguishable), and
//   * paths whose input the game had never been SEEN to hold ($80B054 non-zero,
//     measured $00000000 on every frame this project had ever sampled).
// Both are labelled as listing-derived, here and in the worklog, and neither is
// allowed to masquerade as a measurement.
//
// W432 CLOSED THE SECOND ONE.  $80B054 is $260EC8's SCREEN SHAKE and the board's
// own trace column moves it on exactly 42 frames per boss death
// (out/w69/stage2-laser-hold lf21819..21860, every value equal to the port's).
// The three W432 tests below are still written on synthetic RAM, but what they
// assert is no longer listing-derived -- it is what the board does.

import test from 'node:test';
import assert from 'node:assert';

import { Ram } from '../src/ram.js';
import { Unreached } from '../src/unported.js';
import {
  BUCKETS, NAMED_BUCKETS, RECORD_BYTES, COUNTER_BASE, COUNTER_COUNT,
  enqueueRequest, enqueueShotSprite, enqueueZoomedRequest, encodeZoomedRecordRequest, bulkWrite,
  NO_ZOOM_OR, ENQUEUE_MASK, SCALE_TABLE, SCALE_TABLE_ROM, STAGING_LO, STAGING_HI,
} from '../src/spritequeue.js';
import {
  buildDisplayList, resetSpriteQueueCounters, DL, FILLER, SUM_ORDER, MUTATIONS,
} from '../src/displaylist.js';
import {
  ZOOM_TABLE, ZOOM_TABLE_ROM, ZOOM_TABLE_SITES, zoomRamWords, assertZoomTable,
  popcounts,
} from '../src/zoomtable.js';
import { zoomWord } from '../src/render/sprites.js';

function grab(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** An object record (the stubs' A6) with the seven fields the ROM reads. */
function writeRecord(ram, at, f) {
  ram.setU16(at + 0x02, f.long & 0xffff);
  ram.setU16(at + 0x04, f.short & 0xffff);
  ram.setU16(at + 0x06, (f.longOff ?? 0) & 0xffff);
  ram.setU16(at + 0x08, (f.shortOff ?? 0) & 0xffff);
  ram.setU32(at + 0x0a, (f.offs ?? 0) >>> 0);
  ram.setU16(at + 0x0e, f.size ?? 0);
  ram.setU16(at + 0x1c, f.flipColour ?? 0);
}
const REC = 0x812000;      // scratch, well clear of the staging region

// ---------------------------------------------------------------- the buckets
test('the thirty buckets are contiguous, in drain order, and cover $80397C..$80AFFB', () => {
  const sorted = [...BUCKETS].sort((a, b) => a.buffer - b.buffer);
  assert.equal(sorted[0].buffer, STAGING_LO);
  for (let i = 1; i < sorted.length; i++) {
    // capBytes is DERIVED from the next buffer's address, which is only
    // meaningful if the buffers really do tile the region with no gaps.
    assert.equal(sorted[i - 1].buffer + sorted[i - 1].capBytes, sorted[i].buffer,
      `buffer $${sorted[i - 1].buffer.toString(16)} + cap does not reach `
      + `$${sorted[i].buffer.toString(16)}`);
  }
  const last = sorted[sorted.length - 1];
  assert.equal(last.buffer + last.capBytes, COUNTER_BASE);
  assert.equal(COUNTER_BASE + COUNTER_COUNT * 2, STAGING_HI);
});

test('every counter appears exactly once in the drain order and once in the sum', () => {
  const drain = BUCKETS.map((b) => b.counter);
  assert.equal(new Set(drain).size, 30);
  assert.deepEqual([...SUM_ORDER].sort(), [...drain].sort());
  // The SUM's order is a THIRD hand-written order and is NOT the drain order:
  // saying so here stops a future reader "tidying" one into the other.
  assert.notDeepEqual(SUM_ORDER, drain);
});

test('the named buckets are the ones two instruments agree on', () => {
  assert.equal(BUCKETS[NAMED_BUCKETS.shots].counter, 0x80afd6);   // $23F3AE
  assert.equal(BUCKETS[NAMED_BUCKETS.options].counter, 0x80afda); // $23F2CA
  assert.equal(BUCKETS[NAMED_BUCKETS.options].capBytes / 12, 4);  // two pods
  assert.equal(BUCKETS[NAMED_BUCKETS.player].counter, 0x80afdc);  // $23F104
  assert.equal(BUCKETS[NAMED_BUCKETS.bulk20].counter, 0x80afde);  // sacrificed 1st
  assert.deepEqual(NAMED_BUCKETS.sacrificedSecond.map((i) => BUCKETS[i].counter),
    [0x80afd2, 0x80afd4]);                                        // sacrificed 2nd
});

// ---------------------------------------------------------------- the enqueue
test('$23D762: the seven-field record spec, and the same body for every bucket', () => {
  for (const bi of [0, 1, 14, 29]) {
    const ram = new Ram(null);
    writeRecord(ram, REC, {
      long: 0x1000, short: 0x0800, longOff: 0x40, shortOff: 0x80,
      offs: 0x00812345, size: 0x0410, flipColour: 0x2003,
    });
    const off = enqueueRequest(ram, bi, REC);
    const b = BUCKETS[bi];
    assert.equal(off, 0);
    assert.equal(ram.u16(b.counter), RECORD_BYTES);       // $23D794 addi.w #$c
    // (long+longOff) >> 6 = $1040>>6 = $41 ; (short+shortOff) >> 6 = $880>>6 = $22
    assert.equal(ram.u16(b.buffer + 0), 0x8000 | 0x41);
    assert.equal(ram.u16(b.buffer + 2), 0x8000 | 0x22);
    assert.equal(ram.u32(b.buffer + 4), 0x00812345);      // (A6+$A) long
    assert.equal(ram.u16(b.buffer + 8), 0x0410);          // (A6+$E) word
    assert.equal(ram.u16(b.buffer + 10), 0x2003);         // (A6+$1C) word
  }
});

test('$23D77C: `asr.l #6` is ONE 32-bit shift across BOTH coordinate fields', () => {
  // The long axis's low six bits land in the top six of the short axis and are
  // then removed by $03FF.  Two independent 16-bit shifts agree here only
  // because of that mask; this pins the long form by choosing a long axis whose
  // low bits are all set.
  const ram = new Ram(null);
  writeRecord(ram, REC, { long: 0x103f, short: 0x0000, offs: 0, size: 0 });
  enqueueRequest(ram, 0, REC);
  const packed = ((0x103f << 16) | 0x0000) >> 6;
  assert.equal((packed >>> 16) & 0x07ff, 0x40);
  // the bleed: bits 15..10 of the low half are 0x3F << 10, and $03FF kills them
  assert.equal(packed & 0xffff, 0xfc00);
  assert.equal(ram.u16(BUCKETS[0].buffer + 2), 0x8000 | ((packed & 0x03ff)));
  assert.equal(ram.u16(BUCKETS[0].buffer + 2), 0x8000);
});

test('$23D77C: the shift is ARITHMETIC -- a negative long axis stays negative', () => {
  const ram = new Ram(null);
  writeRecord(ram, REC, { long: 0xffc0, short: 0x0040, offs: 0, size: 0 });
  enqueueRequest(ram, 0, REC);
  // ($FFC00040 | 0) >> 6 = $FFFF0001 ; & $07FF03FF = $07FF0001
  assert.equal(ram.u16(BUCKETS[0].buffer + 0), 0x8000 | 0x07ff);
  assert.equal(ram.u16(BUCKETS[0].buffer + 2), 0x8000 | 0x0001);
});

test('$23D784: NO ZOOM is grow=1 with zoom=0, not zoom=0', () => {
  assert.equal(NO_ZOOM_OR, 0x80008000);
  assert.equal(ENQUEUE_MASK, 0x07ff03ff);
  // grow flips the index to $10-z, and only >= $10 yields a zero mask.
  assert.equal(zoomWord(zoomRamWords(), 0x10 - 0), 0);           // grow=1,zom=0
  assert.notEqual(zoomWord(zoomRamWords(), 0), 0);               // grow=0,zom=0
});

test('$23F3AE is $23D762 on bucket 14', () => {
  const a = new Ram(null), b = new Ram(null);
  writeRecord(a, REC, { long: 0x2222, short: 0x1111, offs: 7, size: 9,
    flipColour: 0x0102 });
  writeRecord(b, REC, { long: 0x2222, short: 0x1111, offs: 7, size: 9,
    flipColour: 0x0102 });
  enqueueShotSprite(a, REC);
  enqueueRequest(b, NAMED_BUCKETS.shots, REC);
  assert.deepEqual([...a.b], [...b.b]);
});

test('the BULK convention OVERWRITES the counter, it does not advance it', () => {
  const ram = new Ram(null);
  ram.setU16(BUCKETS[22].counter, 0x999);        // whatever was there
  const n = bulkWrite(ram, 22, [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]);
  assert.equal(n, 24);
  assert.equal(ram.u16(BUCKETS[22].counter), 24);
  assert.equal(ram.u16(BUCKETS[22].buffer + 0), 1);
  assert.equal(ram.u16(BUCKETS[22].buffer + 12), 7);
});

// ---------------------------------------------------------------- $23D9E2
test('$23E54A is 64 entries of multiply-by-index, and entry 25 multiplies by 21', () => {
  assert.equal(SCALE_TABLE.length, 64);
  assert.equal(SCALE_TABLE_ROM, 0x23e54a);
  assert.equal(SCALE_TABLE[0], 1);              // index 0 and 1 share $23E64A
  for (let i = 1; i < 32; i++) {
    if (i === 25) continue;
    assert.equal(SCALE_TABLE[i], i, `entry ${i}`);
  }
  // $23E730: move.w D1,D0 / add / add / add.w D0,D1 / add / add / add.w D0,D1
  assert.equal(SCALE_TABLE[25], 21, 'entry 25 IS x21 -- translated as written');
  for (let i = 32; i < 64; i++) assert.equal(SCALE_TABLE[i], 1);
});

test('$23D9E2 with the NO-ZOOM flags is the plain stub, offset zero', () => {
  const a = new Ram(null), b = new Ram(null);
  const f = { long: 0x1040, short: 0x0880, offs: 0x00112233, size: 0x0410,
    flipColour: 0x0033 };
  writeRecord(a, REC, f); writeRecord(b, REC, f);
  enqueueRequest(a, 0, REC);
  enqueueZoomedRequest(b, REC, 0x80008000);   // grow=1, zoom=0 on both axes
  assert.deepEqual([...a.b], [...b.b],
    'with the no-zoom flags the $80-flagsByte term is exactly 0 on both axes');
});

test('$23D9E2 scales the recentring offset by the sprite extent / 8', () => {
  const ram = new Ram(null);
  // height $20 = 32 -> table index (32>>1)>>2 = 4 -> x4
  // width  2 (in 16px columns) -> byte ($e,A6)>>8 = 4 -> ($3E & 4)>>1 = 2 -> x2
  writeRecord(ram, REC, { long: 0, short: 0, offs: 0, size: (2 << 9) | 0x20 });
  const flags = 0x90009000;    // grow=1, zoom=2 on both axes
  enqueueZoomedRequest(ram, REC, flags);
  // short: $80 - ((flags>>8) & $FFFF) = $80 - $9090 ... word arithmetic
  const shortAdj = (((0x80 - ((flags >>> 8) & 0xffff)) & 0xffff) * 4) & 0xffff;
  const longAdj = (((0x80 - ((flags >>> 24) & 0xff)) & 0xffff) * 2) & 0xffff;
  const packed = ((((longAdj << 16) | (shortAdj & 0xffff)) | 0) >> 6);
  const want = ((packed & ENQUEUE_MASK) | flags) >>> 0;
  assert.equal(ram.u16(BUCKETS[0].buffer + 0), (want >>> 16) & 0xffff);
  assert.equal(ram.u16(BUCKETS[0].buffer + 2), want & 0xffff);
});

test('$23D9E2 pure encoding is byte-identical to physical queue output', () => {
  const ram = new Ram(null);
  writeRecord(ram, REC, {
    long: 0x9123, short: 0x4567, longOff: 0xfedc, shortOff: 0x1234,
    offs: 0x0087abcd, size: (3 << 9) | 0x28, flipColour: 0xa05c,
  });
  const flags = 0xa4009800;
  const request = encodeZoomedRecordRequest(ram, REC, flags);

  const bucket = 14;
  const offset = enqueueZoomedRequest(ram, REC, flags, bucket);
  assert.equal(offset, 0);
  assert.deepEqual(
    [...request],
    Array.from({ length: RECORD_BYTES }, (_, i) => ram.u8(BUCKETS[bucket].buffer + i)),
  );
});

test('$23D9FA throws by ADDRESS on a height that is not a multiple of 8', () => {
  const ram = new Ram(null);
  writeRecord(ram, REC, { long: 0, short: 0, offs: 0, size: 0x0412 });  // h=18
  const e = grab(() => enqueueZoomedRequest(ram, REC, 0x80008000));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x23d9fa);
  assert.match(e.message, /not a multiple of 8/);
});

// ---------------------------------------------------------------- call #4
/** Put `n` requests into `bucket`, each carrying its index so order is visible. */
function fill(ram, bucket, n, tag = 0) {
  for (let i = 0; i < n; i++) {
    writeRecord(ram, REC, {
      long: (i + 1) << 6, short: (tag + 1) << 6, offs: (bucket << 16) | i,
      size: 0x0410, flipColour: 0x0100 | bucket,
    });
    enqueueRequest(ram, bucket, REC);
  }
}

test('call #4 emits the buckets in DRAIN order, which is the DEPTH order', () => {
  const ram = new Ram(null);
  fill(ram, 19, 2);     // the player -- drains 19th, draws in FRONT
  fill(ram, 0, 2);      // the queue  -- drains first, draws BEHIND
  fill(ram, 14, 2);     // the shots  -- drains 14th, between them
  const t = buildDisplayList(ram);
  assert.equal(t.records, 6);
  // `fill` puts the bucket index in the record's (A6+$A) high word, which
  // becomes hardware word 2's LOW byte -- the byte the flip/colour patch does
  // NOT overwrite.
  const bucketOf = (i) => ram.u16(DL.list + i * 10 + 4) & 0x7f;
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(bucketOf), [0, 0, 14, 14, 19, 19]);
});

test('the emit ORs the last two request bytes over word 2s HIGH byte', () => {
  const ram = new Ram(null);
  writeRecord(ram, REC, { long: 0, short: 0, offs: 0x007f1234, size: 0x0410,
    flipColour: 0x4021 });          // the two bytes are $40 and $21
  enqueueRequest(ram, 0, REC);
  buildDisplayList(ram);
  // word 2 = ((flip|colour) << 8) | the LOW byte of (A6+$A)'s high word
  assert.equal(ram.u16(DL.list + 4), ((0x40 | 0x21) << 8) | 0x7f);
  assert.equal(ram.u16(DL.list + 6), 0x1234);
});

test('the terminator is written at EVERY length, including exactly 251 records', () => {
  for (const n of [0, 1, 250, 251]) {
    const ram = new Ram(null);
    fill(ram, 0, n);
    const t = buildDisplayList(ram);
    assert.equal(t.records, n);
    assert.ok(t.terminated, `${n} records: $23D6E8 compares D1, which `
      + `$23D6DA loaded with $12 -- it is never $BC4, so the terminator is `
      + `always written`);
  }
  // and the same code with the recon's reading would NOT terminate at 251
  const ram = new Ram(null);
  fill(ram, 0, 251);
  const t = buildDisplayList(ram, { mutate: 'terminator-by-count' });
  assert.equal(t.terminated, false);
});

test('$23D676/$23D67E: a filler after 51 records, then after every 50', () => {
  const ram = new Ram(null);
  fill(ram, 0, 251);
  const t = buildDisplayList(ram);
  assert.equal(t.records, 251);
  assert.equal(t.fillers, 4);
  assert.equal(t.entries, 251 + 4 + 1);        // + the terminator = 256 exactly
  const isFiller = (i) => FILLER.every((w, k) => ram.u16(DL.list + i * 10 + k * 2) === w);
  assert.deepEqual([51, 102, 153, 204].map(isFiller), [true, true, true, true]);
  assert.equal(isFiller(52), false);
});

test('the pre-emptive policy drops bucket 20 WHOLE, then buckets 6 and 9 WHOLE', () => {
  // 250 + 2 + 2 + 2 = 256 records = 3072 bytes >= $BD0 (3024), and the 24 bytes
  // bucket 20 gives back are not enough, so BOTH drops fire.
  const mk = () => {
    const r = new Ram(null);
    fill(r, 0, 250); fill(r, 20, 2); fill(r, 6, 2); fill(r, 9, 2);
    return r;
  };
  const ram = mk();
  const t = buildDisplayList(ram);
  assert.equal(ram.u16(DL.dropped20Flag), 1);
  assert.equal(ram.u16(DL.dropped69Flag), 1);
  assert.equal(t.droppedBucket20, 2);
  assert.equal(t.dropped6and9, 4);
  assert.equal(t.records, 250, 'buckets 20, 6 and 9 vanished; nothing else did');
  assert.deepEqual([6, 9, 20].map((i) => t.perBucketRecords[i]), [0, 0, 0]);
  // ...and WITHOUT the policy the same frame does not keep them: it hits the
  // RUNTIME cap instead.  That is not an accident of these numbers, it is why
  // the policy exists -- the pre-emptive budget $BD0 (3024 bytes) is ABOVE the
  // runtime cap $BC4 (3012), so any frame the policy fires on is a frame the
  // drain would otherwise have run into the cap on.  The difference is WHICH
  // sprites are lost: a hand-picked category, or whatever happened to be at the
  // front of the picture.
  const t2 = buildDisplayList(mk(), { mutate: 'no-preemptive-drop' });
  assert.equal(t2.droppedBucket20, 0);
  assert.ok(t2.capFired, 'the runtime cap catches what the policy would have');
  assert.equal(t2.capBucket, 6);
  assert.equal(t2.records, 251);
});

test('the pre-emptive test is >= $BD0: 252 records fires it, 251 does not', () => {
  for (const [n, want] of [[251, 0], [252, 1]]) {
    const ram = new Ram(null);
    fill(ram, 20, 1);
    fill(ram, 0, n - 1);
    buildDisplayList(ram);
    assert.equal(ram.u16(DL.dropped20Flag), want, `${n} records`);
  }
});

test('the runtime cap ABANDONS the current bucket AND every later one', () => {
  const ram = new Ram(null);
  fill(ram, 1, 251);          // bucket 1 alone can fill the queue
  fill(ram, 14, 5);           // ...and bucket 14 drains after it
  fill(ram, 19, 5);
  const t = buildDisplayList(ram);
  assert.equal(t.records, 251);
  assert.ok(t.capFired);
  assert.equal(t.capBucket, 1);
  assert.equal(t.perBucketRecords[14], 0, 'the whole TAIL is abandoned');
  assert.equal(t.perBucketRecords[19], 0);
});

test('LISTING-DERIVED, NOT BOARD-DERIVED: the cap is `beq`, and only a queue '
  + 'pointer off the 12-byte grid can tell that from `bge`', () => {
  // $80AFC0 = 6 is a value THE GAME CANNOT HOLD: every producer advances the
  // pointer by exactly 12 from 0.  The board therefore cannot be asked this
  // question at all (see the worklog), so the oracle here is the instruction.
  const mk = () => {
    const r = new Ram(null);
    fill(r, 1, 300);
    r.setU16(COUNTER_BASE, 6);
    return r;
  };
  const faithful = buildDisplayList(mk());
  assert.equal(faithful.capFired, false, '`beq $23D75A` can never match: '
    + '6 + 12k is never $BC4');
  assert.equal(faithful.perBucketRecords[1], 300, 'the whole bucket drains');
  const ge = buildDisplayList(mk(), { mutate: 'cap-as-ge' });
  assert.ok(ge.capFired);
  assert.equal(ge.perBucketRecords[1], 251);
  // The EMIT clamps to $BC4 either way ($23D65E), so both frames put 251
  // records on screen -- which is exactly why the board cannot see the
  // difference in the display list and $80AFFC is what `pgm.py dlgate --cap0`
  // catches it with.
  assert.equal(faithful.records, 251);
  assert.equal(ge.records, 251);
});

test('W432: a bit-10 carry out of the SIGNED ten-bit position field is a WRAP, '
  + 'not an overflow -- counted, never thrown', () => {
  // D63.  This test asserted the OPPOSITE until W432: it required the standing
  // assertion to THROW here.  It is wrong, and the board says so.  Short axis
  // $3FF is -1 in the signed ten-bit field, +1 puts it at 0, and bit 10 -- which
  // belongs to neither the position nor the zoom -- is dropped by the sprite DMA
  // (igs023_video.cpp's word-1 mask $FBFF, modelled in render/spritelist.js).
  // The board's own display list already carries bit 10 set with $80B054 ZERO:
  // out/w69/stage1-play/ckpt/c019500.ram.bin entry 65 = $814D $BFF8.
  const ram = new Ram(null);
  ram.setU16(DL.queue + 0, 0x8000);         // long axis 0, grow set
  ram.setU16(DL.queue + 2, 0x83ff);         // short axis $3FF = -1, grow set
  ram.setU16(DL.queue + 8, 0x0410);         // a non-zero word 4 so it is a record
  ram.setU16(COUNTER_BASE, 12);
  ram.setU32(DL.globalOffset, 1);
  const warned = [];
  const t = buildDisplayList(ram, { warn: (m) => warned.push(m) });
  assert.equal(t.shortAxisWrap, 1, 'the wrap is COUNTED');
  assert.equal(t.shortAxisOverflow, 0, 'and it is NOT a zoom pollution');
  assert.equal(ram.u16(DL.list + 2), 0x8400, 'bit 10 set, position back to 0');
  assert.equal(warned.filter((m) => m.startsWith('$23D6AC')).length, 0);
});

test('W432: the shake BORROWING past bit 10 really does pollute the zoom, and '
  + 'that is the CARTRIDGE -- warned and counted, never thrown', () => {
  // $80B056 = -8 on 14 of $260F4C's 42 pairs.  A zoom-0 record at short axis 0
  // goes $0000 + $FFF8 = $FFF8, `andi.l #$07FF3FFF` leaves $3FF8, and `$23D6B2
  // or.l D3,D1` puts grow back -- so the entry is $BFF8: position -8, which is
  // right, and zoom index 7, which is not.  The port writes the ROM's bytes.
  const ram = new Ram(null);
  ram.setU16(DL.queue + 0, 0x8000);         // long axis 0, grow set, zoom 0
  ram.setU16(DL.queue + 2, 0x8000);         // short axis 0, grow set, zoom 0
  ram.setU16(DL.queue + 8, 0x0410);
  ram.setU16(COUNTER_BASE, 12);
  ram.setU32(DL.globalOffset, 0x0000fff8); // shakeX 0, shakeY -8
  const warned = [];
  const t = buildDisplayList(ram, { warn: (m) => warned.push(m) });
  assert.equal(t.shortAxisOverflow, 1);
  assert.deepEqual(t.shortAxisFirst,
    { entry: 0, before: 0x0000, after: 0x3ff8, polluted: 0x3800 });
  assert.equal(ram.u16(DL.list + 2), 0xbff8, 'zoom bits 111 OR-ed back in');
  assert.equal(warned.filter((m) => m.startsWith('$23D6AC')).length, 1);
});

test('W432: a borrow that CLEARS zoom bits is not pollution -- the OR restores '
  + 'them from D3', () => {
  // Same shake, but the record already carries zoom 7 (bits 13..11 set).  The
  // borrow takes bits 13..11 from 111 to 011, and `or.l D3,D1` puts all of
  // 15..11 back from the record, so the zoom is unchanged and the entry is
  // $BFF8 -- position -8, zoom still 7.  A `!==` DELTA test, which is what this
  // file asserted before W432, would have called this an overflow and thrown.
  const ram = new Ram(null);
  ram.setU16(DL.queue + 0, 0x8000);
  ram.setU16(DL.queue + 2, 0xb800);         // grow 1, zoom 7, short axis 0
  ram.setU16(DL.queue + 8, 0x0410);
  ram.setU16(COUNTER_BASE, 12);
  ram.setU32(DL.globalOffset, 0x0000fff8);
  const warned = [];
  const t = buildDisplayList(ram, { warn: (m) => warned.push(m) });
  assert.equal(t.shortAxisOverflow, 0, 'no bit 13..11 was SET by the add');
  assert.equal(ram.u16(DL.list + 2), 0xbff8, 'zoom 7 survives, position -8');
  assert.equal(warned.filter((m) => m.startsWith('$23D6AC')).length, 0);
});

test('LISTING-DERIVED: two 16-bit adds LOSE the carry the `add.l` propagates', () => {
  // Chosen so the short axis wraps EXACTLY back to itself modulo $4000 -- so
  // the standing assertion does not fire and the ONLY visible difference is the
  // long axis: $0001 + $FFFF = $1_0000, low word 0, carry 1 into the long half.
  const mk = () => {
    const r = new Ram(null);
    r.setU16(DL.queue + 0, 0x8010);        // long axis $10, grow set
    r.setU16(DL.queue + 2, 0x8001);        // short axis $01, grow set
    r.setU16(DL.queue + 8, 0x0410);        // a non-zero word 4 -> a real record
    r.setU16(COUNTER_BASE, 12);
    r.setU32(DL.globalOffset, 0x0000ffff);
    return r;
  };
  const a = mk(); buildDisplayList(a);
  assert.equal(a.u16(DL.list + 0), 0x8011, 'add.l carried into the long axis');
  assert.equal(a.u16(DL.list + 2), 0x8000);
  const b = mk(); buildDisplayList(b, { mutate: 'b054-two-16bit-adds' });
  assert.equal(b.u16(DL.list + 0), 0x8010, 'two 16-bit adds do not');
  assert.equal(b.u16(DL.list + 2), 0x8000);
});

test('$23D70C zeroes THIRTY words and $80AFFC survives it', () => {
  const ram = new Ram(null);
  for (let i = 0; i < COUNTER_COUNT; i++) ram.setU16(COUNTER_BASE + i * 2, 0x1234);
  ram.setU16(DL.prevQueueBytes, 0xbeef);
  resetSpriteQueueCounters(ram);
  for (let i = 0; i < COUNTER_COUNT; i++) assert.equal(ram.u16(COUNTER_BASE + i * 2), 0);
  assert.equal(ram.u16(DL.prevQueueBytes), 0xbeef);
  assert.equal(DL.prevQueueBytes, COUNTER_BASE + COUNTER_COUNT * 2);
});

test('$80AFFC records the PREVIOUS frame queue length, before the emit', () => {
  const ram = new Ram(null);
  fill(ram, 0, 7);
  buildDisplayList(ram);
  assert.equal(ram.u16(DL.prevQueueBytes), 7 * 12);
});

test('$23C1A2/$23C194 clear and set bit 0 of $80393C and touch nothing else', () => {
  const ram = new Ram(null);
  ram.setU16(DL.sectionFlag, 0x1e);
  buildDisplayList(ram);
  assert.equal(ram.u16(DL.sectionFlag), 0x1f);
});

test('every declared mutation is a name buildDisplayList accepts', () => {
  for (const name of Object.keys(MUTATIONS)) {
    const ram = new Ram(null);
    fill(ram, 0, 3);
    assert.doesNotThrow(() => buildDisplayList(ram, { mutate: name }), name);
  }
  const ram = new Ram(null);
  assert.throws(() => buildDisplayList(ram, { mutate: 'no-such-mutation' }),
    /unknown display-list mutation/);
});

// ---------------------------------------------------------------- the zoom table
test('$23C588 is a monotone popcount ramp whose LAST entry breaks it', () => {
  assert.equal(ZOOM_TABLE.length, 16);
  assert.equal(ZOOM_TABLE_ROM, 0x23c588);
  assert.deepEqual(ZOOM_TABLE_SITES, [0x00df2c, 0x13c8f4, 0x23c588]);
  const pc = popcounts();
  for (let z = 0; z < 15; z++) assert.equal(pc[z], 16 - z, `entry ${z}`);
  assert.equal(pc[15], 0, 'entry $F reads 0 where the ramp predicts ONE set bit');
  assert.equal(ZOOM_TABLE[15], 0);
});

test('the port substitutes 1 for entry $F -- the value the ramp predicts', () => {
  const zr = zoomRamWords();
  assert.equal(zoomWord(zr, 0xf), 1);
  assert.equal(zoomWord(zr, 0x10), 0);              // >= $10 = no zoom at all
  assert.notEqual(zoomWord(zr, 0), 0);
  // and the literal reading, which is what `zoom-f-literal` restores
  assert.equal(((zr[0xf * 2] << 16) | zr[0xf * 2 + 1]) >>> 0, 0);
});

test('assertZoomTable rejects a machine whose table has moved, by ENTRY', () => {
  const zr = zoomRamWords();
  assert.ok(assertZoomTable(zr, 'the baked constant'));
  zr[0x0a * 2 + 1] ^= 0x0004;
  const e = grab(() => assertZoomTable(zr, 'a poked machine'));
  assert.ok(e);
  assert.match(e.message, /entry \$A/);
  assert.match(e.message, /ZOOM TABLE MISMATCH \(1\/16\)/);
});
