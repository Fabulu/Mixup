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
  options: 15,   // capacity 4 records, measured max 2, and there are two pods.
                 // WAVE 12: its SEVEN feeders are all `jmp $23F2CA` and all
                 // seven are inside the option object $24C096 -- $24C8B4,
                 // $24CCC6, $24CDB6, $24CFB0, $24D17E, $24D1F8, $24D27A
                 // (`xref.py callers 23F2CA`, re-run this wave)
  beam: 16,      // laser segments and the focused beam, produced by $24C180
  player: 19,    // fed only from $24A5xx/$24A6xx inside the player's own block.
                 // WAVE 12: the feeder census is $24A532 and $24A632 (the
                 // register stub $23F1FA), $24A538 and $24A6C4 (the record stub
                 // $23F104), and $24A700/$24A730/$24A756 (the saved-register
                 // stub $23F294) -- SEVEN, of which fly-around reaches THREE
  shadows: 5,    // WAVE 12 CORRECTS WAVE 11's LABEL. The ablation called this
                 // "the ship's exhaust"; the LISTING says its only two writers
                 // are $23EFC0 and $23EFEE, and the three callers reached in
                 // fly-around are $249EE2 (the SHIP's ground-plane shadow,
                 // $249EA0, D3=$0210) and $24C438/$24C470 (the two POD shadows,
                 // $24C406, D3=$0208). MEASURED: 3 records on 1,116 frames, and
                 // on EXACTLY the frames bucket 19 has only one -- the
                 // alternation is $80390C, the counter word whose low byte
                 // $23BE92 `bchg #0,$80390D` toggles
  trail: 12,     // WAVE 67. THE SHIP'S AFTERIMAGE TRAIL, and bucket 12 has
                 // exactly ONE producer in the whole cartridge: `$2536AA jsr
                 // $23FDB2`, inside `$253604`, reached only from `$24A53E`.
                 // Both halves re-derived this wave with `xref.py`:
                 //   callers 23FDB2 -> $2536AA        (one)
                 //   callers 253604 -> $24A53E        (one)
                 // and bucket 12 has a SECOND stub nobody calls, `$23FDE8` --
                 // the ZOOMING register convention on the same (buffer,
                 // counter) pair, with ZERO absolute-long callers. `xref.py`'s
                 // own rule makes that a lower bound, not a proof of death, so
                 // it is named rather than declared dead. W55 §3.2 counted the
                 // one producer site and did not see the second stub
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
 * Build the twelve record-convention bytes without selecting a bucket.
 *
 * @param {{u16(address: number): number}} memory
 * @param {number} rec the object record's base address
 * @returns {Uint8Array} one encoded 12-byte request
 */
export function encodeRecordRequest(memory, rec) {
  const long = u16(i16(memory.u16(rec + 0x2)) + i16(memory.u16(rec + 0x6)));
  const short = u16(i16(memory.u16(rec + 0x4)) + i16(memory.u16(rec + 0x8)));
  const packed = (((long << 16) | short) | 0) >> 6;          // $23D77C asr.l #6
  const d0 = ((packed & ENQUEUE_MASK) | NO_ZOOM_OR) >>> 0;   // $23D77E / $23D784
  const request = new Uint8Array(RECORD_BYTES);
  const view = new DataView(request.buffer, request.byteOffset, request.byteLength);
  view.setUint16(0, (d0 >>> 16) & 0xffff, false);
  view.setUint16(2, d0 & 0xffff, false);
  view.setUint16(4, memory.u16(rec + 0x0a), false);
  view.setUint16(6, memory.u16(rec + 0x0c), false);
  view.setUint16(8, memory.u16(rec + 0x0e), false);
  view.setUint16(10, memory.u16(rec + 0x1c), false);
  return request;
}

/**
 * One per-record enqueue stub, parameterised over the bucket.
 *
 * @param {import('./ram.js').Ram} ram
 * @param {number} bucket 0..29, the DRAIN position (see BUCKETS)
 * @param {number} rec the object record's base address (the stubs' A6)
 * @returns {number} the byte offset within the bucket the record landed at
 */
export function enqueueRequest(ram, bucket, rec) {
  const b = BUCKETS[bucket];
  if (!b) throw new RangeError(`no sprite bucket ${bucket}`);
  const off = u16(ram.u16(b.counter));                       // $23D768 adda.w
  const at = b.buffer + off;
  ram.setU16(b.counter, u16(off + RECORD_BYTES));            // $23D794 addi.w
  const request = encodeRecordRequest(ram, rec);
  const view = new DataView(request.buffer, request.byteOffset, request.byteLength);
  for (let offset = 0; offset < RECORD_BYTES; offset += 2) {
    ram.setU16(at + offset, view.getUint16(offset, false));
  }
  return off;
}

// 1b. THE REGISTER CONVENTION -- the same twelve bytes, but the producer has
//     already built them in D1..D4 instead of in a record.  `$23EFC0` verbatim:
//
//   23efc0: lea $80862C,A0 / adda.w $80AFD0,A0 / addi.w #$c,$80AFD0
//   23efd4: move.l D1,D0
//   23efd6: asr.l  #6,D0            <-- the SAME single 32-bit shift
//   23efd8: andi.l #$07FF03FF,D0
//   23efde: ori.l  #$80008000,D0
//   23efe4: move.l D0,(A0)+         words 0,1
//   23efe6: move.l D2,(A0)+         words 2,3  -- the caller's sprite long
//   23efe8: move.w D3,(A0)+         word 4     -- the size
//   23efea: move.w D4,(A0)+         word 5     -- the flip/colour word
//
// `$23EFEE` is the identical routine wrapped in `move.l A0,-(A7) / move.l
// D0,-(A7)` ... `move.l (A7)+,D0 / movea.l (A7)+,A0`, so it differs only in
// which registers survive -- nothing a port can observe.  `$23F1FA` (bucket 19)
// and `$23F34A` (bucket 15) are the same fourteen instructions on a different
// (buffer, counter) pair, exactly as the per-record stub family is.
//
// D1 IS ALREADY PACKED: high word = long axis, low word = short axis, and the
// caller has ALREADY added the position and any offset.  That is the difference
// from `enqueueRequest`, which does the three `add.w`s itself.
/**
 * Build the twelve bytes `$23EFC0` would stage from D1-D4, without selecting a
 * physical bucket or writing cartridge RAM. The display-list virtual merge uses
 * this pure half of the register convention; ordinary producers still call
 * `enqueueRegisters` below.
 */
function encodedRegisterPosition(d1) {
  const packed = (d1 | 0) >> 6;                               // $23EFD6 asr.l #6
  return ((packed & ENQUEUE_MASK) | NO_ZOOM_OR) >>> 0;        // $23EFD8/$23EFDE
}

export function encodeRegisterRequest(d1, d2, d3, d4) {
  const d0 = encodedRegisterPosition(d1);
  const request = new Uint8Array(RECORD_BYTES);
  const view = new DataView(request.buffer, request.byteOffset, request.byteLength);
  view.setUint16(0, (d0 >>> 16) & 0xffff, false);
  view.setUint16(2, d0 & 0xffff, false);
  view.setUint16(4, (d2 >>> 16) & 0xffff, false);              // $23EFE6 move.l D2
  view.setUint16(6, d2 & 0xffff, false);
  view.setUint16(8, d3 & 0xffff, false);                       // $23EFE8 move.w D3
  view.setUint16(10, d4 & 0xffff, false);                      // $23EFEA move.w D4
  return request;
}

export function enqueueRegisters(ram, bucket, d1, d2, d3, d4) {
  const b = BUCKETS[bucket];
  if (!b) throw new RangeError(`no sprite bucket ${bucket}`);
  const off = u16(ram.u16(b.counter));                        // $23EFC6 adda.w
  const at = b.buffer + off;
  ram.setU16(b.counter, u16(off + RECORD_BYTES));             // $23EFCC addi.w

  const d0 = encodedRegisterPosition(d1);
  ram.setU16(at + 0, (d0 >>> 16) & 0xffff);
  ram.setU16(at + 2, d0 & 0xffff);
  ram.setU16(at + 4, (d2 >>> 16) & 0xffff);                   // $23EFE6 move.l D2
  ram.setU16(at + 6, d2 & 0xffff);
  ram.setU16(at + 8, d3 & 0xffff);                            // $23EFE8 move.w D3
  ram.setU16(at + 10, d4 & 0xffff);                           // $23EFEA move.w D4
  return off;
}

// ---------------------------------------------------------------------------
// 1c. THE STUB IS A POINTER IN A TABLE -- resolving one FROM THE ROM.   W30.
//
// The enemy handlers do not `jsr $23D852`.  They do
// `movea.l ($2A,A5),A0 / jsr (A0)` and `movea.l ($2E,A5),A0 / jmp (A0)`, with
// those two longwords written at spawn out of `$267F70` (six 8-byte pairs,
// indexed by the sub-record's `($1F,A6)` << 3), and `$276702` does
// `move.w ($1E,A6),D0 / lsl x2 / lea $27829C(pc),A0 / movea.l (A0,D0.w),A0 /
// jsr (A0)` through an 18-entry primary-emitter table. Its first 12 slots use
// the record convention and its last six select the distinct zoom family. The adjacent
// `$2782E4` table has 12 register-convention entries.
//
// **THIS CORRECTS A LABEL, NOT JUST AN ABSENCE.**  `src/handlers.js` called the
// `($2A,A5)`/`($2E,A5)` calls "indirect fire-actions -> the `$23Dxxx` routines
// -> the `$281xxx` bullet fans".  They are nothing of the kind: read out of the
// ROM, every one of the twelve longwords in `$267F70`, the first 12 in
// `$27829C`,
// and all 12 in `$2782E4`
// is a member of THIS family -- a sprite ENQUEUE stub.  The enemies' draw was
// being counted as their fire.
//
// THE THREE SHAPES, read off all 20 distinct stubs the two tables reference:
//
//   41F9 <buf.l> D0F9 <ctr.l> 43EE 0002 ...   the RECORD convention
//   48E7 80C0 41F9 <buf.l> D0F9 <ctr.l> 43EE  ...the same, registers saved
//   41F9 <buf.l> D0F9 <ctr.l> 2001 ...        the REGISTER convention
//   41FA <disp> 4E71 2206 ...                 the ZOOMING variant ($23D9E2 fam)
//
// and the buffer/counter pairs resolve to exactly FIVE buckets -- 0, 1, 2, 3
// and 7.  The resolver below reads those two longwords out of the cartridge
// rather than carrying a transcribed map, so the bucket a stub feeds is the
// ROM's answer and not a table somebody typed.  A stub whose opcodes do not
// match one of the shapes is a LOUD NAMED THROW carrying the stub's address.
export const EMIT_TABLE = {
  pair267F70: 0x267f70,   // 6 pairs: (record stub, register stub)
  dispatch27829C: 0x27829c, // 18 primary stubs: 12 record, 6 zoom
  entries27829C: 18,
  dispatch2782E4: 0x2782e4, // 12 register stubs, same index
  entries2782E4: 12,
};

/** @returns {{bucket:number, conv:'record'|'register'}} */
export function resolveEmitStub(rom, stub) {
  let at = stub;
  if (rom.u16(at) === 0x48e7) at += 4;                 // movem.l D0/A0-A1,-(A7)
  // W31: a FOURTH prologue shape, found by reading the midboss's two calls
  // `jsr $23E056` ($26BE3A / $26BE60).  `$23E056` is `$23DF58` -- the same
  // bucket-3 register enqueue, instruction for instruction -- with
  // `move.l A0,-(A7) / move.l D0,-(A7)` in front and the matching pops before
  // its `rts`.  Only which registers survive differs, and a port cannot
  // observe that; what matters is that the bucket still comes from the
  // cartridge and not from a map somebody typed.
  else if (rom.u16(at) === 0x2f08 && rom.u16(at + 2) === 0x2f00) at += 4;
  if (rom.u16(at) !== 0x41f9 || rom.u16(at + 6) !== 0xd0f9) {
    unreached(stub, `the sprite-emitter stub $${stub.toString(16).toUpperCase()} `
      + `does not open \`lea <abs>.l,A0 / adda.w <abs>.l,A0\` (it opens $${
        rom.u16(at).toString(16).toUpperCase()}). The ZOOMING family $23D9E2/`
      + `$23DA5C/$23DAD6/$23DB50/$23DBCA opens \`41FA <disp> 4E71 2206\` and is a `
      + `DIFFERENT routine needing the caller's D6 flags -- see enqueueZoomedRequest`);
  }
  const buffer = rom.u32(at + 2);
  const counter = rom.u32(at + 8);
  const b = BUCKETS.find((x) => x.buffer === buffer && x.counter === counter);
  if (!b) {
    unreached(stub, `the sprite-emitter stub $${stub.toString(16).toUpperCase()} `
      + `feeds buffer $${buffer.toString(16).toUpperCase()} counted at $${
        counter.toString(16).toUpperCase()}, which is not one of the thirty `
      + `buckets wave 11 enumerated`);
  }
  let op = rom.u16(at + 12);
  // W36: A FIFTH SHAPE, found the way W31 found the fourth -- by a handler
  // calling a stub the resolver could not read.  `$23F896` (type `$31`'s
  // `$2698C4`/`$2698E2`/`$2698F6`, bucket 21) bumps the counter BEFORE it
  // reads the record:
  //   41F9 <buf> D0F9 <ctr> | 0679 000C <ctr> | 43EE 0002 ...
  //     ^at+0        ^at+6       ^at+$C          ^at+$14
  // The `addi.w #$C,<ctr>.l` is EIGHT bytes the $23D762 family puts at the END
  // instead.  The order is invisible to a port (`enqueueRequest` reads the
  // counter and then adds), but the OPCODE AT +$C is not, and reading it as the
  // convention word is how a bucket-21 request became a throw.  The `#$C` is
  // checked too, because that constant IS `RECORD_BYTES` and a different one
  // would mean a different record stride, not a different prologue.
  if (op === 0x0679 && rom.u16(at + 14) === RECORD_BYTES
      && rom.u32(at + 16) === counter) {
    op = rom.u16(at + 20);
  }
  if (op === 0x43ee) return { bucket: b.i, conv: 'record' };     // lea $2(A6),A1
  if (op === 0x2001) return { bucket: b.i, conv: 'register' };   // move.l D1,D0
  unreached(stub, `the sprite-emitter stub $${stub.toString(16).toUpperCase()} `
    + `continues with $${op.toString(16).toUpperCase()}, which is neither $43EE `
    + `(lea $2(A6),A1 -- the record convention) nor $2001 (move.l D1,D0 -- the `
    + `register convention)`);
  return null;                                          // unreachable
}

/** Run a RECORD-convention emitter stub read out of a ROM pointer. */
export function enqueueThroughStub(ram, rom, stub, rec) {
  const r = resolveEmitStub(rom, stub);
  if (r.conv !== 'record') {
    unreached(stub, `$${stub.toString(16).toUpperCase()} is the REGISTER-`
      + `convention emitter for bucket ${r.bucket}, but the call site passes a `
      + `record. The caller and the table disagree about the convention`);
  }
  return enqueueRequest(ram, r.bucket, rec);
}

/** Run a REGISTER-convention emitter stub read out of a ROM pointer. */
export function enqueueRegistersThroughStub(ram, rom, stub, d1, d2, d3, d4) {
  const r = resolveEmitStub(rom, stub);
  if (r.conv !== 'register') {
    unreached(stub, `$${stub.toString(16).toUpperCase()} is the RECORD-`
      + `convention emitter for bucket ${r.bucket}, but the call site passes `
      + `D1-D4. The caller and the table disagree about the convention`);
  }
  return enqueueRegisters(ram, r.bucket, d1, d2, d3, d4);
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

// ---------------------------------------------------------------------- W81
// THE ZOOMING FAMILY HAS FIVE MEMBERS AND THEY FEED FIVE DIFFERENT BUCKETS.
// `$23D9E2 $23DA5C $23DAD6 $23DB50 $23DBCA`, $7A apart, identical instruction
// for instruction except for the `lea <buffer>.l,A0 / adda.w <counter>.l,A0`
// at +$3C.  `$23D9E2` is bucket 0 and is the one this file has always had;
// type $82's body record goes through `$23DBCA`, which is BUCKET 7 -- and
// bucket 7 is exactly where W75 §4.1 measured all 155 of type $82's board
// slot-frames.
//
// The bucket comes OUT OF THE CARTRIDGE (the two longwords at +$3E and +$44),
// never out of a map somebody typed, which is `resolveEmitStub`'s own rule.
// The `41FA <disp>` is checked to resolve to $23E54A, so a routine that merely
// starts with the same four opcodes cannot pass as a member of the family.
/** @returns {{bucket:number}} */
export function resolveZoomStub(rom, stub, scaleTable = SCALE_TABLE_ROM) {
  const bad = (why) => unreached(stub, `$${stub.toString(16).toUpperCase()} was `
    + `called as a member of the ZOOMING enqueue family $23D9E2/$23DA5C/`
    + `$23DAD6/$23DB50/$23DBCA, and ${why}`);
  if (rom.u16(stub) !== 0x41fa || rom.u16(stub + 4) !== 0x4e71
      || rom.u16(stub + 6) !== 0x2206) {
    bad(`it does not open \`lea (d16,PC),A0 / nop / move.l D6,D1\` (it opens $${
      rom.u16(stub).toString(16).toUpperCase()})`);
  }
  const scale = i16(rom.u16(stub + 2)) + stub + 2;   // 68000 PC-rel: PC = stub+2
  if (scale !== scaleTable) {
    bad(`its PC-relative \`lea\` resolves to $${scale.toString(16).toUpperCase()
    } and not to the edition scale table $${scaleTable.toString(16).toUpperCase()}`);
  }
  const at = stub + 0x3c;
  if (rom.u16(at) !== 0x41f9 || rom.u16(at + 6) !== 0xd0f9) {
    bad(`+$3C is not \`lea <abs>.l,A0 / adda.w <abs>.l,A0\` (it is $${
      rom.u16(at).toString(16).toUpperCase()})`);
  }
  const buffer = rom.u32(at + 2), counter = rom.u32(at + 8);
  const b = BUCKETS.find((x) => x.buffer === buffer && x.counter === counter);
  if (!b) {
    bad(`it feeds buffer $${buffer.toString(16).toUpperCase()} counted at $${
      counter.toString(16).toUpperCase()}, which is not one of the thirty `
      + 'buckets wave 11 enumerated');
  }
  return { bucket: b.i };
}

/** Run a zooming enqueue read out of a ROM address (W81). */
export function enqueueZoomedThroughStub(
  ram, rom, stub, rec, flags, scaleTable = SCALE_TABLE_ROM,
) {
  return enqueueZoomedRequest(ram, rec, flags, resolveZoomStub(rom, stub, scaleTable).bucket);
}

/**
 * $23D9E2 -- the zooming enqueue.  Appends to the QUEUE (bucket 0) unless the
 * caller names another member of the family's bucket (W81).
 *
 * @param {import('./ram.js').Ram} ram
 * @param {number} rec    the object record (A6)
 * @param {number} flags  D6: the flags longword, high word = long axis
 *                        (grow bit 15, zoom bits 14..11), low word = short axis
 * @param {number} bucket which member of the family; 0 is `$23D9E2`'s own
 */
export function encodeZoomedRecordRequest(ram, rec, flags) {
  const d6 = flags >>> 0;
  const sizeWord = ram.u16(rec + 0x0e);
  const height = sizeWord & 0x1ff;
  const widthByte = (sizeWord >> 8) & 0xff;

  if (height & 7) {
    unreached(0x23d9fa, `$23D9E2's first scale dispatch indexes $23E54A with `
      + `height/2 = ${height >> 1} as a BYTE offset into a 4-byte table; height `
      + `${height} is not a multiple of 8, so the 68000 reads a longword at an `
      + `address the table does not start an entry at (and at height mod 4 in `
      + `{2,3} an ODD address, i.e. an address error). No scenario in the corpus `
      + `reaches this routine, so nothing here is measured; port it with a `
      + `producer that can be gated`);
  }
  const scaleShort = SCALE_TABLE[(height >> 1) >> 2];
  const scaleLong = SCALE_TABLE[widthByte & 0x3e];
  const shortAdj = i16(u16(0x80 - u16(d6 >>> 8)) * scaleShort);
  const longAdj = i16(u16(0x80 - ((d6 >>> 24) & 0xff)) * scaleLong);
  const long = u16(longAdj + i16(ram.u16(rec + 0x2)) + i16(ram.u16(rec + 0x6)));
  const short = u16(shortAdj + i16(ram.u16(rec + 0x4)) + i16(ram.u16(rec + 0x8)));
  const packed = (((long << 16) | short) | 0) >> 6;
  const d1 = (((packed & ENQUEUE_MASK) | d6) >>> 0);

  const request = new Uint8Array(RECORD_BYTES);
  const view = new DataView(request.buffer);
  view.setUint16(0, (d1 >>> 16) & 0xffff, false);
  view.setUint16(2, d1 & 0xffff, false);
  view.setUint16(4, ram.u16(rec + 0x0a), false);
  view.setUint16(6, ram.u16(rec + 0x0c), false);
  view.setUint16(8, ram.u16(rec + 0x0e), false);
  view.setUint16(10, ram.u16(rec + 0x1c), false);
  return request;
}

export function enqueueZoomedRequest(ram, rec, flags, bucket = 0) {
  const b = BUCKETS[bucket];
  if (!b) throw new RangeError(`no sprite bucket ${bucket}`);
  const off = u16(ram.u16(b.counter));
  const at = b.buffer + off;
  ram.setU16(b.counter, u16(off + RECORD_BYTES));
  const request = encodeZoomedRecordRequest(ram, rec, flags);
  const view = new DataView(request.buffer, request.byteOffset, request.byteLength);
  for (let offset = 0; offset < RECORD_BYTES; offset += 2) {
    ram.setU16(at + offset, view.getUint16(offset, false));
  }
  return off;
}

// ------------------------------------------------------------------- W374
// 2b. THE ZOOMING ENQUEUE IN **REGISTER** FORM -- `$23E2F2`.
//
// It is `$23D9E2` above with D1/D2/D3/D4 in place of the object record, plus
// one extra input D6 (the flags longword the record form also takes).  So this
// is to `enqueueZoomedRequest` exactly what `enqueueRegisters` is to
// `enqueueRequest`, and it is the routine the comment on NAMED_BUCKETS.trail
// already called "the ZOOMING register convention" for `$23FDE8`.
//
//   23e2f2: movem.l D4/D7/A0,-(SP)   bit 11 = D4, bit 8 = D7, bit 7 = A0
//   23e2f6: lea ($23E78C,PC),A0      <-- NOT $23E54A.  See the trap below.
//   23e2fa: nop
//   23e2fc: move.l D6,D7 / lsr.l #8,D7 / neg.w D7 / addi.w #$80,D7
//                                    D7.w = $80 - ((D6>>8) & $FFFF)
//   23e306: swap D4                  park the caller's palette word in D4 HIGH
//   23e308: move.w D3,D4 / andi.w #$1FF,D4    the HEIGHT field, out of D3
//   23e30e: lsr.w #1,D4              a BYTE offset into a 4-byte table (trap)
//   23e310: adda.w D4,A0 / movea.l (A0),A0 / jsr (A0)    D7.w *= height/8
//   23e316: lea ($23E78C,PC),A0      the SAME table, resolved a second time
//   23e31a: nop
//   23e31c: swap D7                  the short-axis product to the high half
//   23e31e: neg.w D7 / addi.w #$80,D7   D7.w = $80 - ((D6>>24) & $FF)
//   23e324: move.w D3,D4 / andi.w #$3E00,D4   the WIDTH field, out of D3 again
//   23e32a: lsr.w #6,D4              **lsr #6, not #1** -- so the ENTRY index
//                                    is (D3 & $3E00) >> 8 = width*2 = px/8,
//                                    the same reading $23DA16's `lsl.w #2` has
//   23e32c: adda.w D4,A0 / movea.l (A0),A0 / jsr (A0)    D7.w *= width*2
//   23e332: lea $80397C,A0 / adda.w $80AFC0,A0   <-- adda.W, not add.l
//   23e33e: swap D1 / add.w D1,D7 / swap D1      long total  = longAdj + D1 hi
//                                    (D1 is swapped TWICE, so it is unchanged;
//                                    transcribed as written)
//   23e344: swap D7 / add.w D1,D7    short total = shortAdj + D1 lo
//   23e348: asr.l #6,D7 / andi.l #$07FF03FF,D7   ONE 32-bit shift, as always
//   23e350: or.l D6,D7               the caller's flags, exactly like $23DA44
//   23e352: move.l D7,(A0)+ / move.l D2,(A0)+ / move.w D3,(A0)+
//                                    record word 4 is the SIZE WORD AGAIN --
//                                    D3 is used THREE times, twice as an index
//                                    and once verbatim
//   23e358: swap D4 / move.w D4,(A0)+   the parked palette word back down
//   23e35c: addi.w #$C,$80AFC0
//   23e364: movem.l (SP)+,D4/D7/A0   bit 4 = D4, bit 7 = D7, bit 8 = A0
//
// IT PRESERVES EVERY REGISTER, D7 INCLUDED.  The two `movem` masks are the same
// set in the two orders `-(SP)` and `(SP)+` want.  That is load-bearing: the
// select-screen draws that call it ($25E29E, $25E4D0, $25F074) carry a side
// selector in D7 across the call.  A port that returns a value in D7 -- or that
// this function is expected to clobber -- would break them.  This one takes its
// inputs by argument and touches nothing else, so preservation is free.
//
// THE TRAP: **ITS SCALE TABLE IS NOT `SCALE_TABLE`.**  $23E78C is 64 longwords
// and self-bounding ($23E78C[0] = $23E88C = $23E78C + $100), and it agrees with
// $23E54A entry for entry EXCEPT AT INDEX 56:
//
//   $23E54A[56] = $23E64A -- which IS $23E54A[0], the x1 out-of-range GUARD
//   $23E78C[56] = $23E9CE -- `lsl.w #3,D7 / move.w D7,D4 / lsl.w #3,D7 /
//                            sub.w D4,D7` = 64x - 8x = **x56**
//
// and index 56 is exactly what the blocked draws use: `$25E29E`'s third and
// fourth calls pass `D3 = $3840`, whose width index is ($3840 & $3E00) >> 8 =
// 56.  Aliasing the two tables would silently emit x1 where the cartridge emits
// x56, at precisely the index that matters and nowhere else.  So this is a
// SECOND constant, and `tests/w374zoomreg.test.js` pins the difference in both
// directions.  (The two tables are also physically distinct routine blocks --
// $23E64A.. multiplies D1 with D0 as scratch, $23E88C.. multiplies D7 with D4 --
// which is why the register form needed its own copy at all.)
//
// INDEX 25 IS x21 IN BOTH TABLES.  That is the cartridge defect §2(a) already
// names for $23E54A; $23E78C[25] = $23E972 decodes to x21 the same way.
// Transcribed, not corrected.
export const ZOOM_REG_TABLE_ROM = 0x23e78c;
/** $23E78C, 64 longwords, decoded to their multipliers by executing each
 *  routine symbolically (the same decoder that produced SCALE_TABLE).
 *  Entry 25 IS 21 -- the shared defect.  Entry 56 IS 56 -- the difference. */
export const ZOOM_REG_SCALE_TABLE = Object.freeze([
  1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 21, 26, 27, 28, 29, 30, 31,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 56, 1, 1, 1, 1, 1, 1, 1,
  //                      ^ index 56 -- $23E9CE, x56.  $23E54A has x1 here.
]);

// THE FAMILY IS THIRTEEN STUBS, all resolving both their `lea`s to $23E78C and
// differing only in the (buffer, counter) pair at the end:
//
//   $23E2F2 (bucket 0)  $23E36A (1)  $23E3E2 (2)  $23E45A (3)  $23E4D2 (7)
//   $23F090 (5)  $23F9A2 (21)  $23FD3E (10)  $23FDE8 (12)  $23FE92 (24)
//   $24022E (26)  $24072A (11)  $24079E (27)
//
// TWO COSMETIC SUB-SHAPES, and both must resolve:
//
//   A. $23E2F2..$23E4D2, stride $78: a `4E71` after EACH `lea (d16,PC),A0`, and
//      the `addi.w #$C,<ctr>` LAST, at +$6A.  `lea <buf>.l,A0` is at +$40.
//   B. $23F090 onward: no `nop`s, and the `addi.w #$C,<ctr>` FIRST, at +$48,
//      immediately after the `adda.w`.  `lea <buf>.l,A0` is at +$3C.
//
// The counter order is invisible to a port -- this function reads the counter
// and then adds, which is both orders' answer -- but the OFFSET of the `lea` is
// not, which is what W36 learned the hard way on `resolveEmitStub`.
//
// `resolveEmitStub` cannot be used here and MUST NOT BE LOOSENED so that it
// could: it would see the `48E7` prologue, do `at += 4`, land on `41FA` rather
// than `41F9` and throw.  That throw is correct -- these stubs do not open with
// an absolute `lea`, and its message already points the reader at the zooming
// family.
/** @returns {{bucket:number, nops:boolean}} */
export function resolveZoomRegisterStub(rom, stub) {
  const bad = (why) => unreached(stub, `$${stub.toString(16).toUpperCase()} was `
    + `called as a member of the ZOOMING REGISTER enqueue family $23E2F2/`
    + `$23E36A/$23E3E2/$23E45A/$23E4D2/$23F090/$23F9A2/$23FD3E/$23FDE8/$23FE92/`
    + `$24022E/$24072A/$24079E, and ${why}`);
  // $23E2F2 movem.l D4/D7/A0,-(SP) -- the mask is part of the identity, because
  // WHICH registers survive is the whole reason this form exists.
  if (rom.u16(stub) !== 0x48e7 || rom.u16(stub + 2) !== 0x0980) {
    bad(`it does not open \`movem.l D4/D7/A0,-(SP)\` (48E7 0980); it opens $${
      rom.u16(stub).toString(16).toUpperCase()} $${
      rom.u16(stub + 2).toString(16).toUpperCase()}`);
  }
  if (rom.u16(stub + 4) !== 0x41fa) {
    bad(`+$4 is not \`lea (d16,PC),A0\` (it is $${
      rom.u16(stub + 4).toString(16).toUpperCase()})`);
  }
  // 68000 PC-relative: the PC is the EXTENSION WORD's address, which for a
  // `lea` at stub+4 is stub+6 -- not stub+2 as in the record form, where the
  // `lea` is the first instruction.
  const scale = i16(rom.u16(stub + 6)) + stub + 6;
  if (scale !== ZOOM_REG_TABLE_ROM) {
    bad(`its PC-relative \`lea\` resolves to $${scale.toString(16).toUpperCase()
    } and not to the register form's scale table $${
      ZOOM_REG_TABLE_ROM.toString(16).toUpperCase()}. $${
      SCALE_TABLE_ROM.toString(16).toUpperCase()} is the RECORD form's table and `
      + `the two differ at index 56 (x1 there, x56 here)`);
  }
  // Sub-shape A carries `4E71` after each `lea`; sub-shape B carries neither.
  // Four bytes of `nop` is the whole difference in where the buffer `lea` sits.
  const nops = rom.u16(stub + 8) === 0x4e71;
  const at = stub + (nops ? 0x40 : 0x3c);
  // the SECOND `lea (d16,PC),A0` -- $23E316 / $23F0B2 -- must reach the same
  // table.  Checking it is what stops a routine that merely opens the same way.
  const lea2 = nops ? stub + 0x24 : stub + 0x22;
  if (rom.u16(lea2) !== 0x41fa
      || i16(rom.u16(lea2 + 2)) + lea2 + 2 !== ZOOM_REG_TABLE_ROM) {
    bad(`its SECOND \`lea (d16,PC),A0\` at $${lea2.toString(16).toUpperCase()} `
      + `does not resolve to $${ZOOM_REG_TABLE_ROM.toString(16).toUpperCase()}`);
  }
  if (rom.u16(at) !== 0x41f9 || rom.u16(at + 6) !== 0xd0f9) {
    bad(`+$${(at - stub).toString(16).toUpperCase()} is not \`lea <abs>.l,A0 / `
      + `adda.w <abs>.l,A0\` (it is $${rom.u16(at).toString(16).toUpperCase()})`);
  }
  const buffer = rom.u32(at + 2), counter = rom.u32(at + 8);
  const b = BUCKETS.find((x) => x.buffer === buffer && x.counter === counter);
  if (!b) {
    bad(`it feeds buffer $${buffer.toString(16).toUpperCase()} counted at $${
      counter.toString(16).toUpperCase()}, which is not one of the thirty `
      + 'buckets wave 11 enumerated');
  }
  return { bucket: b.i, nops };
}

/** Run a ZOOMING REGISTER enqueue read out of a ROM address (W374).
 *
 *  Deliberately NOT `enqueueRegistersThroughStub`: that one goes through
 *  `resolveEmitStub`, which throws on this prologue, and the throw is right. */
export function enqueueZoomedRegistersThroughStub(ram, rom, stub, d1, d2, d3, d4, d6) {
  const r = resolveZoomRegisterStub(rom, stub);
  return enqueueZoomedRegisters(ram, r.bucket, d1, d2, d3, d4, d6);
}

/**
 * $23E2F2 -- the zooming enqueue, REGISTER convention.
 *
 * @param {import('./ram.js').Ram} ram
 * @param {number} bucket which member of the thirteen; $23E2F2's own is 0
 * @param {number} d1  packed coords, high word = LONG axis, low word = SHORT,
 *                     1/64 px.  THE CALLER HAS ALREADY SUMMED position and
 *                     offset -- that is the difference from the record form
 * @param {number} d2  the art longword, straight into record words 2 and 3
 * @param {number} d3  THE SIZE WORD: width bits 14..9, height bits 8..0.  Used
 *                     three times -- both scale indices and record word 4
 * @param {number} d4  the flip/colour word into record word 5.  Its HIGH half
 *                     is don't-care: $23E306 parks it and $23E358 restores it
 * @param {number} d6  THE FLAGS LONGWORD, high word = long axis (grow bit 15,
 *                     zoom bits 14..11), low = short.  Drives the recentring
 *                     AND is `or.l`-ed whole into the coords
 * @returns {number} the byte offset within the bucket the record landed at
 */
export function enqueueZoomedRegisters(ram, bucket, d1, d2, d3, d4, d6) {
  const flags = d6 >>> 0;
  const sizeWord = d3 & 0xffff;                               // $23E308 move.w D3
  const height = sizeWord & 0x1ff;                            // $23E30A andi.w
  // $23E326 `andi.w #$3E00` then $23E32A `lsr.w #6` is a BYTE offset of
  // (size & $3E00) >> 6, so the ENTRY index is that over four = width*2 = the
  // long extent in pixels / 8.  Written as the byte the record form isolates
  // with `moveq #$3E / and.b`, which is the same number.
  const widthByte = (sizeWord >> 8) & 0xff;

  // $23E30E `lsr.w #1` used as an offset into a 4-byte table -- the SAME defect
  // $23D9FA has.  An entry boundary needs height ≡ 0 (mod 8); at height mod 4
  // in {2,3} the `movea.l (A0),A0` is an ODD-address long read, i.e. a 68000
  // address error.  Nothing invents an answer here.
  if (height & 7) {
    unreached(0x23e30e, `$23E2F2's first scale dispatch indexes $23E78C with `
      + `height/2 = ${height >> 1} as a BYTE offset into a 4-byte table; height `
      + `${height} is not a multiple of 8, so the 68000 reads a longword at an `
      + `address the table does not start an entry at (and at height mod 4 in `
      + `{2,3} an ODD address, i.e. an address error). The caller's D3 is $${
        sizeWord.toString(16).toUpperCase()}; no producer in the corpus passes `
      + `such a size, so nothing here is measured`);
  }
  const scaleShort = ZOOM_REG_SCALE_TABLE[(height >> 1) >> 2];   // $23E30E..$23E314
  const scaleLong = ZOOM_REG_SCALE_TABLE[widthByte & 0x3e];      // $23E32A..$23E330

  // $23E2FC..$23E304, then $23E31C..$23E322 on the swapped half.
  const shortAdj = i16(u16(0x80 - u16(flags >>> 8)) * scaleShort);
  const longAdj = i16(u16(0x80 - ((flags >>> 24) & 0xff)) * scaleLong);

  const b = BUCKETS[bucket];
  if (!b) throw new RangeError(`no sprite bucket ${bucket}`);
  const off = u16(ram.u16(b.counter));                         // $23E338 adda.w
  const at = b.buffer + off;
  // $23E35C addi.w #$C -- sub-shape B bumps it BEFORE the record writes and
  // sub-shape A after, which no port can observe: read, then add.
  ram.setU16(b.counter, u16(off + RECORD_BYTES));

  // $23E33E..$23E346.  D1 is swapped twice (net identity) so the long axis --
  // its HIGH word -- reaches the low half for the first `add.w` and the short
  // axis for the second.
  const long = u16(longAdj + i16((d1 >>> 16) & 0xffff));
  const short = u16(shortAdj + i16(d1 & 0xffff));
  const packed = (((long << 16) | short) | 0) >> 6;            // $23E348 asr.l #6
  const d7 = (((packed & ENQUEUE_MASK) | flags) >>> 0);        // $23E34A / $23E350

  ram.setU16(at + 0, (d7 >>> 16) & 0xffff);                    // $23E352 move.l
  ram.setU16(at + 2, d7 & 0xffff);
  ram.setU16(at + 4, (d2 >>> 16) & 0xffff);                    // $23E354 move.l D2
  ram.setU16(at + 6, d2 & 0xffff);
  ram.setU16(at + 8, sizeWord);                                // $23E356 move.w D3
  ram.setU16(at + 10, d4 & 0xffff);                            // $23E35A move.w D4
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
/**
 * WAVE 12.  One bucket's staged bytes AT THE $23D382 SAMPLE POINT -- i.e. after
 * every producer has run and before call #4 clears the counters.
 *
 * The counter is the length, so the snapshot is exactly what the board's own
 * probe dumps at `$23D382` (`tools/oracle/w11dl.lua` §1), which is what makes
 * `pgm.py shipgate` a comparison of two dumps of the same thing rather than of
 * two different summaries.  It is a DIAGNOSTIC read, not a translation: nothing
 * in the port's own path calls it.
 */
export function snapshotBucket(ram, bucket) {
  const b = BUCKETS[bucket];
  if (!b) throw new RangeError(`no sprite bucket ${bucket}`);
  const n = u16(ram.u16(b.counter));
  const bytes = new Uint8Array(n);
  for (let k = 0; k < n; k++) bytes[k] = ram.u8(b.buffer + k);
  return { i: bucket, buffer: b.buffer, count: n, bytes };
}

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
