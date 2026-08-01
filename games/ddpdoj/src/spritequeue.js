// THE SPRITE-REQUEST ENQUEUE API -- the producer half of main-loop call #4.
//
// A producer does not write the display list.  It appends a 12-byte REQUEST to
// one of THIRTY buckets, and call #4 ($23D2AE, src/displaylist.js) concatenates
// the buckets in a fixed hand-written order and emits 10-byte hardware entries.
// **THE DRAIN ORDER IS THE DEPTH ORDER**: bucket 0 is furthest back, bucket 29
// furthest front (10-recon-display-list §3, and igs023.js walks the list
// backwards with first-drawn-wins, so a higher list index draws in front).
//
// THERE ARE THREE ENQUEUE CONVENTIONS, not one (10-recon-display-list §2a):
//
//   1. THE PER-RECORD STUB, ~130 copies of the same fourteen instructions,
//      differing only in (buffer, counter).  `$23D762` is the one that appends
//      straight to the queue; `$23F3AE` is the shot handlers'; `$23D79E`,
//      `$23D7DA`, ... are the rest.  ONE parameterised function here
//      (`enqueueRequest`) covers all of them, and `tests/displaylist.test.js`
//      pins it against the disassembly of three different stubs.
//   2. THE ZOOMING VARIANT `$23D9E2` -- a different routine, not a parameter.
//      See `enqueueZoomedRequest` below.
//   3. THE BULK WRITERS -- a loop writing `(A4)+` that sets the counter AT THE
//      END from a pointer difference (`suba.l (A7)+,A4 / move.w A4,$80AFxx`).
//      `$28A098`->`$28A198` feeds bucket 20, `$281D9A`->`$281DCE/$281DD6` feeds
//      buckets 22 and 23.  `bulkWrite` below is that convention.  **Bucket 23's
//      counter $80AFE2 has NO `addi` stub at all**, so a scan that only looks
//      for the common shape reports it as unfed while the census measures 11
//      records a frame.
//
// THE SEVEN-FIELD OBJECT-RECORD SPEC, fixed by the ROM.  A producer does not
// get to choose its layout; every stub reads exactly these offsets from A6:
//
//   (A6+$2)  word  LONG-axis position, 1/64 px   -- hardware word 0 (11 bits)
//   (A6+$4)  word  SHORT-axis position, 1/64 px  -- hardware word 1 (10 bits)
//   (A6+$6)  word  LONG-axis offset, added before the shift
//   (A6+$8)  word  SHORT-axis offset
//   (A6+$A)  long  hardware words 2 and 3 (pri bit 7, offs bits 22..16 / 15..0)
//   (A6+$E)  word  hardware word 4: width bits 14..9, height bits 8..0
//   (A6+$1C) word  its TWO BYTES ARE OR-ED TOGETHER at emit time into hardware
//                  word 2's HIGH byte = flip (bits 14,13) + colour (bits 12..8)
//
// The game's "long axis" is its vertical; on the TATE glass it is the bitmap's
// X.  Naming it long/short rather than x/y is deliberate: calling it "y" here is
// how a later wave transposes a coordinate.

import { RAM } from './machine.js';
import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';

// ---------------------------------------------------------------------------
// THE THIRTY BUCKETS.
//
// Index = DRAIN POSITION = DEPTH.  Index 0 is the shared queue itself (producers
// that use `$23D762` and friends append straight into it and it is "drained"
// first by simply already being there); 1..29 are the copy sites
// $23D3E0..$23D60E, in the order the ROM writes them.
//
// `buffer`/`counter` were read out of the image by `tools/w10/buckets.py` (each
// site is `lea BUF,A0 / lea CTR,A1 / bsr $23D726`), re-run in wave 11.
// `capBytes` is DERIVED from the next staging buffer's address -- it is not a
// number the ROM states anywhere, and NOTHING IN CALL #4 CHECKS IT.  The only
// runtime limit is the 251-record queue cap; a bucket that overran its own
// buffer would quietly write into the next one, which is exactly what the queue
// does today when it passes $805104 (see displaylist.js).
//
// `what` is the ABLATION result where wave 11 measured one, and "unmeasured"
// otherwise -- never a guess from the caller's address range.
export const BUCKETS = Object.freeze([
  // idx  buffer      counter    capBytes  (recs)
  { i: 0, buffer: 0x80397c, counter: 0x80afc0, capBytes: 6024 },  // the queue, 502
  { i: 1, buffer: 0x805104, counter: 0x80afc2, capBytes: 3012, site: 0x23d3e0 },
  { i: 2, buffer: 0x805cc8, counter: 0x80afc4, capBytes: 3012, site: 0x23d3f4 },
  { i: 3, buffer: 0x80688c, counter: 0x80afc6, capBytes: 3012, site: 0x23d408 },
  { i: 4, buffer: 0x8083d4, counter: 0x80afcc, capBytes: 300, site: 0x23d41c },
  { i: 5, buffer: 0x80862c, counter: 0x80afd0, capBytes: 72, site: 0x23d430 },
  { i: 6, buffer: 0x808674, counter: 0x80afd2, capBytes: 240, site: 0x23d444 },
  { i: 7, buffer: 0x807450, counter: 0x80afc8, capBytes: 3012, site: 0x23d458 },
  { i: 8, buffer: 0x808014, counter: 0x80afca, capBytes: 960, site: 0x23d46c },
  { i: 9, buffer: 0x808764, counter: 0x80afd4, capBytes: 240, site: 0x23d480 },
  { i: 10, buffer: 0x80a864, counter: 0x80afe8, capBytes: 120, site: 0x23d494 },
  { i: 11, buffer: 0x80ad8c, counter: 0x80aff0, capBytes: 120, site: 0x23d4a8 },
  { i: 12, buffer: 0x80af24, counter: 0x80afea, capBytes: 120, site: 0x23d4bc },
  { i: 13, buffer: 0x80a8dc, counter: 0x80afec, capBytes: 1080, site: 0x23d4d0 },
  { i: 14, buffer: 0x808854, counter: 0x80afd6, capBytes: 864, site: 0x23d4e4 },
  { i: 15, buffer: 0x808eb4, counter: 0x80afda, capBytes: 48, site: 0x23d4f8 },
  { i: 16, buffer: 0x808bb4, counter: 0x80afd8, capBytes: 768, site: 0x23d50c },
  { i: 17, buffer: 0x808500, counter: 0x80afce, capBytes: 300, site: 0x23d520 },
  { i: 18, buffer: 0x80aeac, counter: 0x80aff8, capBytes: 120, site: 0x23d534 },
  { i: 19, buffer: 0x808ee4, counter: 0x80afdc, capBytes: 192, site: 0x23d548 },
  { i: 20, buffer: 0x808fa4, counter: 0x80afde, capBytes: 720, site: 0x23d55c },
  { i: 21, buffer: 0x80a624, counter: 0x80afe4, capBytes: 192, site: 0x23d570 },
  { i: 22, buffer: 0x809274, counter: 0x80afe0, capBytes: 2520, site: 0x23d584 },
  { i: 23, buffer: 0x809c4c, counter: 0x80afe2, capBytes: 2520, site: 0x23d598 },
  { i: 24, buffer: 0x80af9c, counter: 0x80affa, capBytes: 36, site: 0x23d5ac },
  { i: 25, buffer: 0x80a6e4, counter: 0x80afe6, capBytes: 384, site: 0x23d5c0 },
  { i: 26, buffer: 0x80ad14, counter: 0x80afee, capBytes: 120, site: 0x23d5d4 },
  { i: 27, buffer: 0x80ae04, counter: 0x80aff2, capBytes: 120, site: 0x23d5e6 },
  { i: 28, buffer: 0x80ae7c, counter: 0x80aff4, capBytes: 24, site: 0x23d5fa },
  { i: 29, buffer: 0x80ae94, counter: 0x80aff6, capBytes: 24, site: 0x23d60e },
]);

/** The buckets whose identity is settled by TWO independent instruments, so a
 *  later wave can plug a producer in without re-deriving it.  Everything else
 *  is named by the wave-11 ablation and carries its measured pixel count in the
 *  worklog -- never by "the callers live in this address range". */
export const NAMED_BUCKETS = Object.freeze({
  shots: 14,     // max 20 records/frame == wave 5's independent shot census
  options: 15,   // capacity 4 records, measured max 2, and there are two pods
  player: 19,    // fed only from $24A5xx/$24A6xx inside the player's own block
  bullets: [22, 23],  // the $281D9A bulk writer; $81B40C counts them
  bulk20: 20,    // $28A098's bulk writer -- THE FIRST PRE-EMPTIVE SACRIFICE
  sacrificedSecond: [6, 9],
});

/** $80397C..$80AFFB -- everything call #4 reads as input, one contiguous span. */
export const STAGING_LO = 0x80397c;
export const STAGING_HI = 0x80affc;      // exclusive: the last counter is $80AFFA

export const RECORD_BYTES = 12;          // `addi.w #$c,$80AFxx`, every stub
export const COUNTER_BASE = 0x80afc0;    // ..$80AFFB, thirty words
export const COUNTER_COUNT = 30;

/** counter address -> bucket index, for reading a probe's telemetry back. */
export const BUCKET_BY_COUNTER = Object.freeze(Object.fromEntries(
  BUCKETS.map((b) => [b.counter, b.i])));

// ---------------------------------------------------------------------------
// 1. THE PER-RECORD STUB, parameterised.  `$23D762` verbatim, with (A0's base,
//    the counter) as the only things ~130 copies differ in:
//
//   23d762: lea $80397C,A0 / adda.w $80AFC0,A0
//   23d76e: lea ($2,A6),A1
//   23d772: move.l (A1)+,D0        D0 = { word@A6+2, word@A6+4 }
//   23d774: swap D0
//   23d776: add.w  (A1)+,D0        D0.lo = word@A6+2 + word@A6+6
//   23d778: swap D0
//   23d77a: add.w  (A1)+,D0        D0.lo = word@A6+4 + word@A6+8
//   23d77c: asr.l  #6,D0           <-- ONE 32-BIT SHIFT ACROSS BOTH FIELDS
//   23d77e: andi.l #$07FF03FF,D0
//   23d784: ori.l  #$80008000,D0   <-- BOTH grow bits set, BOTH zoom fields 0
//   23d78a: move.l D0,(A0)+
//   23d78c: move.l (A1)+,(A0)+     request bytes 4..7  <- (A6+$A) long
//   23d78e: move.w (A1)+,(A0)+     request bytes 8..9  <- (A6+$E) word
//   23d790: move.w ($1c,A6),(A0)+  request bytes 10..11 <- (A6+$1C) word
//   23d794: addi.w #$c,$80AFC0
//
// TRAP 1: `asr.l #6` IS ON THE WHOLE 32-BIT REGISTER.  The long axis's low six
// bits bleed into the top six of the short axis and are then removed by the
// $03FF mask.  Two independent 16-bit shifts agree ONLY because of that mask,
// and the mask changes at emit time (§displaylist.js), so translate the long
// form.
//
// TRAP 2: `ori.l #$80008000` is the NO-ZOOM ENCODING -- grow=1 with zoom=0, so
// the effective index is $10-0 = $10 and `zoomWord` returns 0.  `zom=0,grow=0`
// would select table entry 0, which is a REAL zoom.  201,205 of 205,434
// measured records are exactly this (10-recon-display-list §6b).
//
// TRAP 3: the enqueue masks the short axis to $03FF -- TEN bits.  The EMIT
// re-masks it to $3FFF -- FOURTEEN bits -- AFTER adding $80B054, and bits 13..11
// of that field are the ZOOM field.  See `assertShortAxis` in displaylist.js.
export const NO_ZOOM_OR = 0x80008000;    // $23D784 ori.l
export const ENQUEUE_MASK = 0x07ff03ff;  // $23D77E andi.l

/**
 * One per-record enqueue stub, parameterised over the bucket.
 *
 * @param {import('./ram.js').Ram} ram
 * @param {number} bucket  0..29, the DRAIN position (see BUCKETS)
 * @param {number} rec     the object record's base address (the stubs' A6)
 * @returns {number} the byte offset within the bucket the record landed at
 */
export function enqueueRequest(ram, bucket, rec) {
  const b = BUCKETS[bucket];
  if (!b) throw new RangeError(`no sprite bucket ${bucket}`);
  const off = u16(ram.u16(b.counter));                       // $23D768 adda.w
  const at = b.buffer + off;
  ram.setU16(b.counter, u16(off + RECORD_BYTES));            // $23D794 addi.w

  // $23D772..$23D77A -- built as ONE longword and shifted ONCE.
  const long = u16(i16(ram.u16(rec + 0x2)) + i16(ram.u16(rec + 0x6)));
  const short = u16(i16(ram.u16(rec + 0x4)) + i16(ram.u16(rec + 0x8)));
  const packed = (((long << 16) | short) | 0) >> 6;          // asr.l #6
  const d0 = ((packed & ENQUEUE_MASK) | NO_ZOOM_OR) >>> 0;   // $23D77E / $23D784

  ram.setU16(at + 0, (d0 >>> 16) & 0xffff);                  // $23D78A move.l
  ram.setU16(at + 2, d0 & 0xffff);
  ram.setU16(at + 4, ram.u16(rec + 0x0a));                   // $23D78C move.l
  ram.setU16(at + 6, ram.u16(rec + 0x0c));
  ram.setU16(at + 8, ram.u16(rec + 0x0e));                   // $23D78E move.w
  ram.setU16(at + 10, ram.u16(rec + 0x1c));                  // $23D790 move.w
  return off;
}

/** $23F3AE, the shot handlers' stub: `enqueueRequest` on bucket 14.  Kept as a
 *  named export because src/shots.js and wave 8's gate speak of it by name. */
export function enqueueShotSprite(ram, rec) {
  return enqueueRequest(ram, NAMED_BUCKETS.shots, rec);
}

/** Wave 8's names, unchanged so the shot gate keeps compiling. */
export const SPRQ = Object.freeze({
  shotBucket: BUCKETS[14].buffer,
  shotBucketCount: BUCKETS[14].counter,
  recordBytes: RECORD_BYTES,
  shotBucketEnd: BUCKETS[14].buffer + BUCKETS[14].capBytes,
});

// ---------------------------------------------------------------------------
// 2. THE ZOOMING VARIANT, `$23D9E2`.  It is the ONLY enqueue that can put a
//    non-zero zoom field into a request, so it is the only path that can reach
//    an effective zoom index other than $10.
//
//   23d9e2: lea ($23E54A,PC),A0        the SCALE table, 64 longwords
//   23d9e8: move.l D6,D1               D6 = the flags longword, from the CALLER
//   23d9ea: lsr.l #8,D1
//   23d9ec: neg.w D1
//   23d9ee: addi.w #$80,D1             D1.w = $80 - ((D6>>8) & $FFFF)
//   23d9f2: move.w ($e,A6),D0
//   23d9f6: andi.w #$1ff,D0            D0 = HEIGHT
//   23d9fa: lsr.w #1,D0                a BYTE offset into a 4-byte table
//   23d9fc: adda.w D0,A0
//   23d9fe: movea.l (A0),A0 / jsr (A0)     D1.w *= (height/8)
//   23da02: lea ($23E54A,PC),A0
//   23da08: swap D1                    the short-axis result to the high half
//   23da0a: neg.w D1 / addi.w #$80,D1  D1.w = $80 - ((D6>>24) & $FF)
//   23da10: moveq #$3e,D0
//   23da12: and.b ($e,A6),D0           the HIGH byte: (width<<1)|(height>>8)
//   23da16: lsl.w #2,D0                -> entry index = width*2
//   23da1a: movea.l (A0),A0 / jsr (A0)     D1.w *= width*2
//   23da1e: lea $80397C,A0 / adda.w $80AFC0,A0     <-- DIRECT TO THE QUEUE
//   23da2e: add.w (A1)+,D1 / add.w ($2,A1),D1      long axis  + pos + offset
//   23da34: swap D1
//   23da36: add.w (A1)+,D1 / add.w ($2,A1),D1      short axis + pos + offset
//   23da3c: asr.l #6,D1 / andi.l #$07FF03FF,D1
//   23da44: or.l D6,D1                 <-- the caller's flags, not $80008000
//   23da46: move.l D1,(A0)+ / ... / addi.w #$c,$80AFC0
//
// So the scale is `(0x80 - flagsByte) * (extentPixels / 8)` per axis, in 1/64
// px, added to the position BEFORE the shift -- the recentring a zoomed sprite
// needs.  For the no-zoom encoding (grow=1, zom=0) the flags byte is $80 and
// the offset is exactly 0, which is why the plain stub can skip all of this.
//
// TWO THINGS ARE TRANSLATED AS WRITTEN AND BOTH LOOK LIKE MISTAKES:
//
//  (a) THE SCALE TABLE'S ENTRY 25 MULTIPLIES BY 21, NOT 25.  Decoded from the
//      ROM by executing all 64 routines symbolically (wave 11; the decoder is
//      in the worklog): $23E730 is `move.w D1,D0 / add.w D1,D1 / add.w D1,D1 /
//      add.w D0,D1 / add.w D1,D1 / add.w D1,D1 / add.w D0,D1 / rts` = x21.
//      Every other entry 0..31 is x(index) (entry 0 is x1), and entries 32..63
//      are 128 bytes of the literal $0023E64A, i.e. x1 -- a deliberate guard for
//      the out-of-range indices the second dispatch can produce.
//  (b) THE FIRST DISPATCH'S INDEX IS `height/2` USED AS A BYTE OFFSET into a
//      4-byte table.  It only lands on an entry boundary when height is a
//      multiple of 8; at height ≡ 2 or 3 (mod 4) the `movea.l (A0),A0` is an
//      ODD-ADDRESS LONG READ, which on a 68000 is an ADDRESS ERROR.  NO
//      SCENARIO IN THE CORPUS REACHES THIS ROUTINE AT ALL -- wave 11 has no
//      producer for it -- so the port does not invent an answer: it throws,
//      naming $23D9FA.
export const SCALE_TABLE_ROM = 0x23e54a;
/** $23E54A, 64 longwords, decoded to their multipliers. Entry 25 IS 21. */
export const SCALE_TABLE = Object.freeze([
  1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 21, 26, 27, 28, 29, 30, 31,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
]);

/**
 * $23D9E2 -- the zooming enqueue.  Appends to the QUEUE (bucket 0).
 *
 * @param {import('./ram.js').Ram} ram
 * @param {number} rec    the object record (A6)
 * @param {number} flags  D6: the flags longword, high word = long axis
 *                        (grow bit 15, zoom bits 14..11), low word = short axis
 */
export function enqueueZoomedRequest(ram, rec, flags) {
  const d6 = flags >>> 0;
  const sizeWord = ram.u16(rec + 0x0e);
  const height = sizeWord & 0x1ff;                            // $23D9F6
  const widthByte = (sizeWord >> 8) & 0xff;                   // $23DA12 and.b

  // (b) above.  `lsr.w #1` then `adda.w` -- an entry boundary needs height≡0(8).
  if (height & 7) {
    unreached(0x23d9fa, `$23D9E2's first scale dispatch indexes $23E54A with `
      + `height/2 = ${height >> 1} as a BYTE offset into a 4-byte table; height `
      + `${height} is not a multiple of 8, so the 68000 reads a longword at an `
      + `address the table does not start an entry at (and at height mod 4 in `
      + `{2,3} an ODD address, i.e. an address error). No scenario in the corpus `
      + `reaches this routine, so nothing here is measured; port it with a `
      + `producer that can be gated`);
  }
  const scaleShort = SCALE_TABLE[(height >> 1) >> 2];         // $23D9FA..$23DA00
  const scaleLong = SCALE_TABLE[(widthByte & 0x3e) >> 1];     // $23DA10..$23DA1C

  //  $23D9E8..$23D9EE, then $23DA08..$23DA0C on the swapped half.
  const shortAdj = i16(u16(0x80 - u16(d6 >>> 8)) * scaleShort);
  const longAdj = i16(u16(0x80 - ((d6 >>> 24) & 0xff)) * scaleLong);

  const b = BUCKETS[0];
  const off = u16(ram.u16(b.counter));                        // $23DA24
  const at = b.buffer + off;
  ram.setU16(b.counter, u16(off + RECORD_BYTES));             // $23DA52

  const long = u16(longAdj + i16(ram.u16(rec + 0x2)) + i16(ram.u16(rec + 0x6)));
  const short = u16(shortAdj + i16(ram.u16(rec + 0x4)) + i16(ram.u16(rec + 0x8)));
  const packed = (((long << 16) | short) | 0) >> 6;           // $23DA3C asr.l #6
  const d1 = (((packed & ENQUEUE_MASK) | d6) >>> 0);          // $23DA3E / $23DA44

  ram.setU16(at + 0, (d1 >>> 16) & 0xffff);
  ram.setU16(at + 2, d1 & 0xffff);
  ram.setU16(at + 4, ram.u16(rec + 0x0a));                    // $23DA4A
  ram.setU16(at + 6, ram.u16(rec + 0x0c));
  ram.setU16(at + 8, ram.u16(rec + 0x0e));                    // $23DA4C
  ram.setU16(at + 10, ram.u16(rec + 0x1c));                   // $23DA4E
  return off;
}

// ---------------------------------------------------------------------------
// 3. THE BULK-WRITER CONVENTION.  `$28A098`->`$28A198` (bucket 20) and
//    `$281D9A`->`$281DCE`/`$281DD6` (buckets 22 and 23) walk a source list,
//    write records with `(A4)+`, and THEN set the counter from the pointer
//    difference:  `suba.l (A7)+,A4 / move.w A4,$80AFxx`.
//
//    That is not the same as calling the stub N times: the counter is
//    OVERWRITTEN, not advanced, so a bulk writer cannot share its bucket with a
//    per-record producer inside one frame -- which is exactly why buckets 22 and
//    23 have (almost) no `addi` stubs and bucket 23 has none at all.
export function bulkWrite(ram, bucket, records) {
  const b = BUCKETS[bucket];
  if (!b) throw new RangeError(`no sprite bucket ${bucket}`);
  let a = b.buffer;
  for (const words of records) {
    if (words.length !== 6) {
      throw new RangeError(`a sprite request is 6 words, got ${words.length}`);
    }
    for (let k = 0; k < 6; k++) ram.setU16(a + k * 2, words[k]);
    a += RECORD_BYTES;
  }
  ram.setU16(b.counter, u16(a - b.buffer));   // `suba.l (A7)+,A4 / move.w A4,..`
  return a - b.buffer;
}

export { RAM };
