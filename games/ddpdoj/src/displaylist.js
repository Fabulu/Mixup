// MAIN-LOOP CALL #4 -- `$23D2AE..$23D724`, THE DISPLAY-LIST BUILD, WHOLE.
//
// This is the keystone: nothing any producer computes is visible until this
// runs.  It is NOT a walk over objects.  It is a 29-BUCKET GATHER with a
// pre-emptive overflow policy, and every byte of it is here because a byte of it
// is on the screen.
//
// The ROM, in execution order (10-recon-display-list §1, every line re-read from
// `xref.py dasm` in wave 11 before it was translated):
//
//   a  $23D2AE  jsr $23C1A2         clear bit 0 of $80393C (a section flag)
//   b  $23D2B4  THE SUM             $80AFC0 + the 29 counters -> D0, in BYTES
//   c  $23D36E  bsr $240ADC         a bare `rts`.  SEVEN of these in call #4:
//                                   a stripped profiling hook.  They cost cycles
//                                   and NOTHING ELSE -- but they SET D1 AND D3,
//                                   and one of those matters (see the terminator)
//   d  $23D372  D0 -= $BD0 -> $80B000; D0/12 -> $80AFFE      the over-budget pair
//   e  $23D39C  THE PRE-EMPTIVE OVERFLOW POLICY               §2 below
//   f  $23D3E0  THE DRAIN, 29 x (lea BUF / lea CTR / bsr $23D726 / bcs $23D624)
//   g  $23D624  THE EMIT, queue -> $800000, 12-byte request -> 10-byte entry
//   h  $23D6E8  the terminator                                §4 below
//   i  $23D70C  clear all thirty counters
//   j  $23D71E  jsr $23C194         set bit 0 of $80393C back
//
// Measured cost, wave 2: 15,594 cycles mean, against the object driver's 77,725.
//
// ===========================================================================
// §1  THE GUARDED COPY `$23D726` COPIES SIXTEEN BYTES PER TWELVE-BYTE RECORD
// ===========================================================================
//   23d726: move.w (A1),D0        D0 = this bucket's pending BYTE count
//   23d728: beq $23D758           nothing -> rts, carry CLEAR
//   23d72a: lea $80397C,A2 / adda.w $80AFC0,A2
//   23d736: move.l (A0)+,(A2)+ x4     <-- SIXTEEN bytes
//   23d73e: addi.w #$c,$80AFC0        <-- TWELVE
//   23d746: cmpi.w #$BC4,$80AFC0
//   23d74e: beq $23D75A           FULL
//   23d750: subi.w #$c,D0
//   23d754: bne $23D736           <-- back to the COPY.  A2 is NOT recomputed
//   23d756: move.w D0,(A1)        D0 is 0 here: clears the bucket
//   23d758: rts
//   23d75a: clr.w (A1) / ori #$1,SR / rts          FULL: carry SET
//
// A2 advances 16 per iteration while the counter advances 12, and A2 is not
// re-derived inside the loop -- so the copy is an IDENTITY map S[j] -> Q[q0+j]
// that simply RUNS 4n BYTES PAST the accounted end.  The accounted region
// Q[q0 .. q0+12n) is exactly S[0 .. 12n), which is what the emit reads; the
// stray tail is overwritten by the next bucket's copy, whose A2 starts at the
// accounted end.  Translated as written anyway (it is four lines), because "it
// works out to a plain copy" is a conclusion and the instruction is the fact.
//
// THE CAP IS `beq`, NOT `bge` -- wave 5's finding, re-read here.  It is only
// safe because the pointer starts at 0 and steps by exactly 12 and $BC4 = 3012
// is a multiple of 12, so it cannot straddle.  A port that writes `>=` is not
// translating this instruction.  All 29 drain sites are `bcs $23D624`, so what
// a full queue abandons is the current bucket's REMAINDER AND EVERY LATER
// BUCKET -- i.e. the FRONT-MOST part of the picture, because the later a bucket
// drains the closer to the viewer it draws.
//
// ===========================================================================
// §2  THE PRE-EMPTIVE POLICY IS GAMEPLAY, NOT AN EDGE CASE
// ===========================================================================
//   23d3a8: tst.w $80B000 / bmi $23D3E0     under budget -> drain everything
//   23d3b0: move.w $80AFDE,D0 / clr.w $80AFDE      DROP BUCKET 20 WHOLE
//   23d3bc: move.w #$1,$80B002                     telemetry
//   23d3c4: sub.w D0,$80B000 / bmi $23D3E0
//   23d3cc: clr.w $80AFD2 / clr.w $80AFD4          DROP BUCKETS 6 AND 9 WHOLE
//   23d3d8: move.w #$1,$80B004
//
// Before a single record is copied, the game decides IN ADVANCE which whole
// CATEGORIES of sprite it is willing to lose, and it is the same categories
// every time.  `bmi` on zero is false, so the test is "total >= $BD0 bytes" =
// 252 records, one record above the 251-record queue cap.  $80B002/$80B004 are
// telemetry: `xref.py abs` finds four absolute-long sites for each and NO
// READER (a lower bound -- absolute-long only).
//
// It never fires in natural stage-1 play (measured: max 120 of 251 records over
// 1,901 build-B frames), which is exactly why the gate FORCES it -- see
// `docs/worklog/ddpdoj/11-impl-display-list-keystone.md` §the cap scenario.
//
// ===========================================================================
// §3  THE EMIT'S THREE ARITHMETIC TRAPS
// ===========================================================================
//   23d696: move.l (A1)+,D3
//   23d69a: andi.l #$F800F800,D3     grow+zoom of BOTH words
//   23d6a0: andi.l #$07FF3FFF,D1     the two POSITION fields
//   23d6a6: add.l  $80B054,D1        A 32-BIT ADD, NOT TWO 16-BIT ADDS
//   23d6ac: andi.l #$07FF3FFF,D1
//   23d6b2: or.l   D3,D1 / move.l D1,(A0)+
//   23d6ba: move.b (A1)+,D3 / or.b (A1)+,D3 / move.b D3,(-$6,A0)
//
//  (i) `add.l` means a carry out of the short axis propagates INTO the long
//      axis.  $80B054 measured $00000000 on all 1,901 build-B frames of
//      `stage1-open`, and on all 647 board RAM dumps in `tools/oracle/out`
//      (W432 scanned every one) -- PRESENCE, NOT COVERAGE, because the value
//      that moves it lives for FORTY-TWO FRAMES and no dump lands inside them.
//      **W432 IDENTIFIED IT: $80B054/$80B056 IS THE SCREEN SHAKE**, written by
//      `$260EC8` out of the 42-pair table at `$260F4C` (`background.js`
//      `screenShake260EC8`), and the count matches the wave-17 corpus's "the 42
//      frames the boss shakes the screen" exactly.  It is a BOSS DEATH, which
//      is why 431 waves of stage-1 benches never saw it.
// (ii) THE SHORT AXIS IS RE-MASKED TO $3FFF HERE -- FOURTEEN BITS -- but the
//      hardware position field is TEN.  **W432, AND THIS IS THE CORRECTION:
//      BIT 10 IS NOT PART OF EITHER FIELD.**  Zoom is bits 14..11
//      (`render/spritelist.js` `yzom = (s[1] & 0x7800) >> 11`) and the sprite
//      DMA DROPS bit 10 on the way into the buffer (`igs023_video.cpp`, word-1
//      mask $FBFF).  The ten-bit position is SIGNED (`sext(s[1] & 0x03ff, 10)`),
//      so a carry out of bit 9 is not an overflow at all -- it is two's
//      complement wrapping, and the DMA's mask completes it.  The board's own
//      display list already carries bit 10 set with $80B054 ZERO
//      (`out/w69/stage1-play/ckpt/c019500.ram.bin` entry 65 = $814D $BFF8,
//      zoom 7, position $3F8), so a set bit 10 is a NORMAL board state.
//      THE REAL HAZARD IS NARROWER: the add can only pollute the zoom if it
//      SETS a bit in 13..11 that the record did not already have, which needs
//      the carry to cross bit 10 -- i.e. bit 10 already set in the staged
//      request.  `assertShortAxis` is the standing assertion and it now tests
//      exactly that; a bit-10 wrap is counted, not thrown.
//(iii) the last two request bytes are OR-ED TOGETHER and written OVER the byte
//      the preceding `move.l` already placed.  A port that copies the request
//      straight through and forgets the patch loses flip and colour entirely.
//
// ===========================================================================
// §4  THE TERMINATOR IS NEVER SKIPPED, AND THE RECON SAID IT WAS
// ===========================================================================
// 10-recon-display-list §2c reads
//
//     23d6e8: cmpi.w #$BC4,D1
//     23d6ec: beq $23D6FE          <-- SKIP THE TERMINATOR
//
// as "if exactly 251 records are emitted, no terminator is written", on the
// assumption that D1 still holds the byte count `$23D678 move.w D0,D1` put
// there.  IT DOES NOT.  D1 is clobbered twice on the way:
//
//   * inside the emit loop, `$23D698 move.l D3,D1` makes D1 the record being
//     emitted, and
//   * four instructions before the test, `$23D6DA move.w #$12,D1` loads it as
//     the tag argument of the SEVENTH dead `bsr $240ADC` -- and $240ADC is a
//     bare `rts`, so D1 is still $12 at $23D6E8.
//
// $0012 is never $0BC4, so **the terminator is written on every frame, at every
// length, in build B**.  Wave 11 translates that, and gates it: the mutation
// `terminator-by-count` implements the recon's reading and MUST go red on the
// forced 251-record scenario.  (The plan's mutation name `always-terminate` is
// therefore an EXPECTED-GREEN no-op -- see the worklog; it is reported, not
// quietly dropped.)
//
// The other entry into the terminator is `$23D654 beq $23D6EE`, taken when the
// queue is EMPTY -- it jumps past the test entirely, so an empty list is always
// terminated too.
//
// ===========================================================================
// §5  THE FILLERS
// ===========================================================================
//   23d676: moveq #$33,D4                 ; 51
//   23d67a: subq.w #1,D4 / bcc $23D696    ; borrow -> insert a filler
//   23d67e: moveq #$32,D4                 ; 50 thereafter
//   23d680: move.l #$FC003800,(A0)+ / move.l #0,(A0)+ / move.w #$201,(A0)+
//   23d690: addi.w #$c,D2 / subq.w #1,D4  ; and fall into the record
//
// So: 51 records, filler, 50 records, filler, 50, ...  At the 251-record cap
// that is 251 + 4 = 255 entries and the terminator makes 256 -- the IGS023's
// exact maximum.  (10-recon-display-list §2c says "251 + 5 fillers = 256"; the
// D4 arithmetic above gives FOUR, and the forced scenario measures it.)

import { u16, i16 } from './ram.js';
import {
  BUCKETS, COUNTER_BASE, COUNTER_COUNT, RECORD_BYTES, STAGING_LO, STAGING_HI,
} from './spritequeue.js';
import { unreached } from './unported.js';

export const DL = {
  build: 0x23d2ae,
  queue: 0x80397c,
  list: 0x800000, listEnd: 0x800a00,
  sectionFlag: 0x80393c,           // $23C1A2 clears bit 0, $23C194 sets it
  sectionCommit: 0x23c008,         // ...and BOTH tail-jump here -- W375, see below
  ctrlReg: 0x00b0e000,             // $23C008 lea $B0E000,A0 -- the IGS023 control reg
  overBudgetBytes: 0x80b000,       // $23D382
  overBudgetRecords: 0x80affe,     // $23D38C, D0/12
  dropped20Flag: 0x80b002,         // $23D3BC
  dropped69Flag: 0x80b004,         // $23D3D8
  prevQueueBytes: 0x80affc,        // $23D62A -- NOT cleared by the $23D70C loop
  globalOffset: 0x80b054,          // $23D6A6 add.l
  capBytes: 0x0bc4,                // $23D746 cmpi.w -- 3012 = 251 records
  budgetBytes: 0x0bd0,             // $23D372 subi.w -- 3024 = 252 records
  fillerFirst: 0x33,               // $23D676 moveq
  fillerThen: 0x32,                // $23D67E moveq
  terminatorTestValue: 0x12,       // $23D6DA move.w #$12,D1 -- see §4
};

// ===========================================================================
// W375 -- `$23C1A2` AND `$23C194` ARE FOUR BYTES LONGER THAN THIS FILE SAID
// ===========================================================================
// Steps (a) and (j) above have been transcribed since wave 11 as the RAM bit
// twiddle alone, on the strength of a comment reading "`move.w #1,D0 / or.w
// D0,$80393C`". Both first halves are right. **NEITHER ROUTINE ENDS THERE.**
// [M] re-decoded from `rip/sound/maincpu.bin` this wave:
//
//   [M] 23C1A2  30 3c 00 01        move.w #$1,D0
//   [M] 23C1A6  46 40              not.w  D0                    -> $FFFE
//   [M] 23C1A8  c1 79 00 80 39 3c  and.w  D0,$80393C
//   [M] 23C1AE  60 00 fe 58        bra.w  $23C008     <- $23C1B0 + $FE58
//
//   [M] 23C194  30 3c 00 01        move.w #$1,D0
//   [M] 23C198  81 79 00 80 39 3c  or.w   D0,$80393C
//   [M] 23C19E  60 00 fe 68        bra.w  $23C008     <- $23C1A0 + $FE68
//
//   [M] 23C008  41 f9 00 b0 e0 00  lea    $B0E000,A0
//   [M] 23C00E  30 b9 00 80 39 3c  move.w $80393C,(A0)
//   [M] 23C014  4e 75              rts
//
// `bra.w`'s base is the EXTENSION WORD's address, not the opcode's (decoding
// trap 4 applied to a branch), and both displacements land on the same target.
// So **CALL #4 WRITES THE IGS023 CONTROL REGISTER TWICE PER FRAME** -- once with
// bit 0 down as it starts building, once with it back up as it finishes -- and
// until this wave the port wrote `$B0E000` exactly never. `background.js:363`
// records the register's measured value ($001F on 16,000 frames) and says of
// this very instruction that "the caller is not on the main loop's seven-call
// path and is NOT identified here". It is on it, and it is identified: it is
// this file, at both ends of its own build, plus `$23BF7A` in the boot block
// (`frontend.js`). Three call sites, one routine.
//
// `videoRegs` is OPTIONAL on purpose. Every caller that does not pass one gets
// exactly the behaviour it had before this wave -- the RAM word moves, the
// register does not -- because `buildDisplayList` is driven by a dozen gates and
// fixtures that construct no `VideoRegs` at all. `Game#step()` passes one.

/** `$23C008` -- mirror the section flag into the IGS023 control register.
 *  @returns the word written, which is `$80393C` AFTER the caller's edit. */
export function sectionCommit23C008(ram, videoRegs) {
  const v = ram.u16(DL.sectionFlag);           // $23C00E move.w $80393C,(A0)
  if (videoRegs) videoRegs.ctrl = v;           // $23C008 lea $B0E000,A0
  return v;
}

/** `$23C1A2` -- clear bit 0 of the section flag, then commit. Step (a). */
export function sectionFlagClear23C1A2(ram, videoRegs) {
  ram.setU16(DL.sectionFlag, u16(ram.u16(DL.sectionFlag) & ~1));
  return sectionCommit23C008(ram, videoRegs);   // $23C1AE bra.w $23C008
}

/** `$23C194` -- set bit 0 of the section flag, then commit. Step (j), and the
 *  boot block's `$23BF7A`. */
export function sectionFlagSet23C194(ram, videoRegs) {
  ram.setU16(DL.sectionFlag, u16(ram.u16(DL.sectionFlag) | 1));
  return sectionCommit23C008(ram, videoRegs);   // $23C19E bra.w $23C008
}

/** $23D680 -- the filler entry, five words, verbatim. */
export const FILLER = Object.freeze([0xfc00, 0x3800, 0x0000, 0x0000, 0x0201]);

/** The SUM's order, $23D2B4..$23D362, read out of the image.  It is neither
 *  ascending address order nor drain order -- it is a THIRD hand-written order,
 *  and it does not matter to the value because `add.w` is commutative mod 2^16.
 *  Kept as written so a reviewer can check it against the listing, and so that
 *  "the sum order is irrelevant" stays a stated conclusion, not an assumption. */
export const SUM_ORDER = Object.freeze([
  0x80afc0, 0x80afc2, 0x80afc4, 0x80afc6, 0x80afd2, 0x80afc8, 0x80afd4,
  0x80afd0, 0x80afca, 0x80afcc, 0x80afce, 0x80afd6, 0x80afd8, 0x80afda,
  0x80afdc, 0x80afde, 0x80afe0, 0x80afe2, 0x80afe4, 0x80afe6, 0x80afe8,
  0x80afea, 0x80afec, 0x80afee, 0x80aff0, 0x80aff2, 0x80aff4, 0x80aff6,
  0x80aff8, 0x80affa,
]);

/** Every mutation this module can be broken with, and what it breaks.  Declared
 *  here so `tools/dlgate.mjs --break` cannot invent one and so a reviewer can
 *  see the whole red-validation surface in one place. */
export const MUTATIONS = {
  'cap-as-ge': 'the runtime cap tests >= $BC4 instead of == $BC4 ($23D746/$23D74E)',
  'terminator-by-count': "10-recon-display-list's reading: skip the terminator "
    + 'when exactly 251 records were emitted, instead of comparing D1 ($23D6E8)',
  'always-terminate': 'force the terminator write. EXPECTED GREEN: the board '
    + 'already always terminates (§4), so this mutation cannot move a byte',
  'no-preemptive-drop': 'skip $23D3B0..$23D3D8 -- keep buckets 20, 6 and 9',
  'drain-order-reversed': 'drain the 29 buckets 29..1 instead of 1..29',
  'no-filler': 'never insert the $23D680 filler entry',
  'filler-every-52-flat': 'a filler every 52 records throughout, instead of 51 '
    + 'then 50 ($23D676 moveq #$33 vs $23D67E moveq #$32)',
  'b054-two-16bit-adds': 'add $80B054 as two independent 16-bit adds instead of '
    + 'one add.l ($23D6A6) -- no carry from the short axis into the long',
  'emit-mask-03ff': 're-mask the short axis to $03FF at emit instead of $3FFF '
    + '($23D6AC) -- hides the zoom-field pollution hazard',
  'no-flip-patch': 'skip the OR-ed flip/colour byte written over word 2 '
    + '($23D6BA..$23D6BE)',
  'sum-without-queue': 'omit $80AFC0 from the budget sum ($23D2B4)',
  'no-counter-clear': 'skip the $23D70C..$23D71C thirty-counter reset',
};

function mutating(opts, name) {
  if (!opts.mutate) return false;
  if (!(opts.mutate in MUTATIONS)) {
    throw new Error(`unknown display-list mutation '${opts.mutate}'; have `
      + Object.keys(MUTATIONS).join(', '));
  }
  return opts.mutate === name;
}

/** Validate and snapshot optional host-owned requests before call #4 mutates RAM. */
function virtualBucketsFrom(requests) {
  if (requests == null) return null;
  if (!Array.isArray(requests)) {
    throw new TypeError('virtual sprite requests must be an array');
  }
  if (requests.length === 0) return null;
  const buckets = new Array(BUCKETS.length);
  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];
    const bucket = request?.bucket;
    if (!Number.isInteger(bucket) || bucket < 0 || bucket >= BUCKETS.length) {
      throw new RangeError(`virtual sprite request ${i} has no bucket 0..${BUCKETS.length - 1}`);
    }
    if (!(request.bytes instanceof Uint8Array)
        || request.bytes.byteLength !== RECORD_BYTES) {
      throw new RangeError(`virtual sprite request ${i} must contain ${RECORD_BYTES} bytes`);
    }
    (buckets[bucket] ??= []).push(request.bytes.slice());
  }
  return buckets;
}

/** Append one already-encoded virtual request to the shared gather queue. */
function appendVirtualRequest(ram, bytes) {
  const off = u16(ram.u16(COUNTER_BASE));
  const at = DL.queue + off;
  for (let k = 0; k < RECORD_BYTES; k++) ram.setU8(at + k, bytes[k]);
  const next = u16(off + RECORD_BYTES);
  ram.setU16(COUNTER_BASE, next);
  return next;
}

/** Append one bucket after its physical records and report whether the cap fired. */
function appendVirtualBucket(ram, buckets, bucket, capGe, telemetry) {
  const requests = buckets?.[bucket];
  if (!requests) return false;
  for (const bytes of requests) {
    const counter = appendVirtualRequest(ram, bytes);
    telemetry.perBucketRecords[bucket]++;
    telemetry.perBucketVirtualRecords[bucket]++;
    if (capGe ? counter >= DL.capBytes : counter === DL.capBytes) return true;
  }
  return false;
}

/**
 * THE STANDING ASSERTION §3(ii), AND W432 ANSWERED THE QUESTION IT ASKED.
 *
 * It asked: what happens the day `$80B054` moves?  The answer, measured, is
 * that the CARTRIDGE ITSELF pollutes the zoom nibble, so this can no longer be
 * a throw.  What follows is the whole chain, because every step of it is a
 * number somebody can re-measure.
 *
 * 1. `$80B054`/`$80B056` IS THE SCREEN SHAKE.  `$260EC8` walks the 42-pair
 *    table at `$260F4C` (`background.js screenShake260EC8`) and writes the two
 *    words; the emit reads them as ONE longword.  The BOARD's own trace column
 *    `b054` is non-zero on exactly lf21819..21860 of `out/w69/stage2-laser-hold`
 *    -- FORTY-TWO frames, the stage-2 boss's death -- and every one of those 42
 *    board values equals the port's, frame for frame ($FFE80000, $FFF80010,
 *    $FFF8000C, $FFF80008, $00100008, ...).  That is why 647 board RAM dumps
 *    all show `$80B054` = 0: 42 frames per boss death, and no dump lands in one.
 *
 * 2. BIT 10 IS IN NEITHER FIELD.  Zoom is bits 14..11
 *    (`render/spritelist.js` `yzom = (s[1] & 0x7800) >> 11`) and the sprite DMA
 *    DROPS bit 10 (igs023_video.cpp's word-1 mask $FBFF).  The position under it
 *    is a SIGNED ten-bit field, `sext(s[1] & 0x03ff, 10)`, so a carry out of
 *    bit 9 is not an overflow -- it is the two's complement wrap, and the DMA's
 *    mask is what completes it: short axis $3F8 (= -8) plus a shake of +8 is 0
 *    on the board and 0 here.  The board's own list already carries bit 10 set
 *    with `$80B054` ZERO (`out/w69/stage1-play/ckpt/c019500.ram.bin` entry 65 =
 *    $814D $BFF8, zoom 7, position $3F8).  So bit 10 is COUNTED, not thrown.
 *
 * 3. THE ZOOM REALLY IS POLLUTED, AND THE BOARD DOES IT.  `$23D6B2 or.l D3,D1`
 *    restores bits 15..11 from the record, so a carry that CLEARS zoom bits
 *    changes nothing and only bits the add SETS can survive -- the test is
 *    `(after & ~before) & $3800`, not a delta.  Setting them needs a BORROW past
 *    bit 10, i.e. a zoom-0 record whose short axis is 0..7 while `$80B056` is
 *    negative.  Both halves are measured: 14 of the table's 42 pairs have a
 *    negative short-axis term, and **2,330 of 64,239 board display-list entries
 *    across 610 of 647 dumps are zoom-0, bit-10-clear, short axis 0..7**.  A
 *    zoom-0 record at short axis 0 with `$80B056` = -8 becomes $3FF8 after
 *    `andi.l`, and the OR gives zoom bits 111.  That is what the listing says
 *    and the port already writes exactly those bytes.
 *
 * SO THIS IS NOT AN UNPORTED PATH.  `unreached()` means "a branch the port does
 * not implement" (`unported.js`); the emit implements all of it.  D63 was this
 * assertion stopping the live build on the cartridge's own arithmetic.  It is
 * now a COUNTED, WARNED event with a STABLE message (`UnportedLog.note` keys on
 * the text, so a per-record message would blow the map up).
 */
export function assertShortAxis(before, after, entry, telemetry, warn) {
  // The wrap: the shake carried a sprite around the signed ten-bit position
  // field.  Invisible on the board -- the DMA drops bit 10 -- so it is counted
  // only, and the count is what says how often the shake reaches an edge.
  if ((before & 0x0400) !== (after & 0x0400)) telemetry.shortAxisWrap++;
  const polluted = (after & ~before) & 0x3800;
  if (!polluted) return;
  telemetry.shortAxisOverflow++;
  if (telemetry.shortAxisFirst === null) {
    telemetry.shortAxisFirst = { entry, before, after, polluted };
  }
  if (warn) {
    warn("$23D6AC: the screen shake borrowed out of the short axis's signed "
      + "ten-bit position field and INTO the zoom field (bits 13..11), which "
      + "$23D6B2 recombines by OR -- so those records draw at the right place "
      + "and the wrong SIZE. This is the CARTRIDGE's arithmetic, not a gap: "
      + "it needs a zoom-0 record at short axis 0..7 while $80B056 is negative, "
      + "and 14 of $260F4C's 42 pairs are. See displaylist.js assertShortAxis.");
  }
}

/**
 * $23D2AE -- main-loop call #4, whole.
 *
 * Reads the thirty bucket counters and their staging buffers out of `ram`,
 * writes the hardware display list to $800000..$8009FF, and clears the counters.
 *
 * @param {import('./ram.js').Ram} ram
 * @param {{mutate?: string, warn?: (msg: string) => void, videoRegs?: {ctrl:number},
 *   virtualRequests?: Array<{bucket:number, bytes:Uint8Array}>}} opts
 * @returns telemetry -- what the frame did, for the gate and the runner to print
 */
export function buildDisplayList(ram, opts = {}) {
  const warn = opts.warn ?? (() => {});
  const virtualBuckets = virtualBucketsFrom(opts.virtualRequests);
  const virtualRequestCount = virtualBuckets
    ? virtualBuckets.reduce((sum, requests) => sum + requests.length, 0) : 0;
  const t = {
    pendingBytes: 0, pendingRecords: 0, overBudgetBytes: 0,
    droppedBucket20: 0, dropped6and9: 0,
    queueBytes: 0, records: 0, fillers: 0, entries: 0, terminated: false,
    capFired: false, capBucket: -1, bucketsDrained: 0, bucketsAbandoned: 0,
    perBucketRecords: new Array(BUCKETS.length).fill(0),
    b054: 0, b054Values: new Set(), shortAxisOverflow: 0, shortAxisWrap: 0,
    shortAxisFirst: null,
    // W375 -- what `$23C008` mirrored into $B0E000 at each end of the build.
    ctrlAtStart: 0, ctrlAtEnd: 0,
  };
  if (opts.virtualRequests != null) {
    t.virtualRecords = 0;
    t.virtualDropped = 0;
    t.perBucketVirtualRecords = new Array(BUCKETS.length).fill(0);
  }

  // (a) $23D2AE jsr $23C1A2 -- `move.w #1,D0 / not.w D0 / and.w D0,$80393C`,
  //     AND `bra.w $23C008`, which mirrors the word into $B0E000. See the block
  //     comment above `sectionCommit23C008` for why that half was missing.
  t.ctrlAtStart = sectionFlagClear23C1A2(ram, opts.videoRegs);

  // (b) THE SUM, $23D2B4..$23D362.  `move.w` then 29 x `add.w`: WORD arithmetic,
  //     so it wraps at $10000 and the port must too.
  let d0 = 0;
  const sumWithoutQueue = mutating(opts, 'sum-without-queue');
  for (const a of SUM_ORDER) {
    if (sumWithoutQueue && a === COUNTER_BASE) continue;
    d0 = u16(d0 + ram.u16(a));
  }
  if (virtualBuckets) {
    const virtualQueueCount = virtualBuckets[0]?.length ?? 0;
    const summedVirtualCount = virtualRequestCount - (sumWithoutQueue ? virtualQueueCount : 0);
    d0 = u16(d0 + summedVirtualCount * RECORD_BYTES);
  }
  t.pendingBytes = d0;
  t.pendingRecords = Math.floor(d0 / RECORD_BYTES);

  // (d) $23D372..$23D38C.  `subi.w` then `ext.l` then `divs.w #$C`: the stored
  //     word is SIGNED, and the division is signed, so an under-budget frame
  //     writes a negative record count into $80AFFE.  Both are telemetry with
  //     no reader found; both are written because the board writes them.
  const over = i16(u16(d0 - DL.budgetBytes));            // $23D372 / $23D380
  ram.setU16(DL.overBudgetBytes, u16(over));             // $23D382
  ram.setU16(DL.overBudgetRecords,                       // $23D388 divs.w #$C
    u16(over < 0 ? -Math.floor(-over / RECORD_BYTES) : Math.floor(over / RECORD_BYTES)));
  t.overBudgetBytes = over;

  // (e) THE PRE-EMPTIVE POLICY, $23D39C..$23D3DE.
  ram.setU16(DL.dropped20Flag, 0);                       // $23D39C clr.w
  ram.setU16(DL.dropped69Flag, 0);                       // $23D3A2 clr.w
  if (!mutating(opts, 'no-preemptive-drop')) {
    let rem = i16(ram.u16(DL.overBudgetBytes));
    if (rem >= 0) {                                      // $23D3A8 tst / bmi
      const b20Physical = ram.u16(BUCKETS[20].counter);  // $23D3B0
      const b20Virtual = (virtualBuckets?.[20]?.length ?? 0) * RECORD_BYTES;
      const b20 = u16(b20Physical + b20Virtual);
      ram.setU16(BUCKETS[20].counter, 0);                // $23D3B6 DROP IT WHOLE
      if (virtualBuckets?.[20]) virtualBuckets[20].length = 0;
      ram.setU16(DL.dropped20Flag, 1);                   // $23D3BC
      t.droppedBucket20 = Math.floor(b20 / RECORD_BYTES);
      rem = i16(u16(rem - b20));                         // $23D3C4 sub.w
      ram.setU16(DL.overBudgetBytes, u16(rem));
      if (rem >= 0) {                                    // $23D3CA bmi
        const virtual6 = virtualBuckets?.[6]?.length ?? 0;
        const virtual9 = virtualBuckets?.[9]?.length ?? 0;
        t.dropped6and9 = Math.floor(ram.u16(BUCKETS[6].counter) / RECORD_BYTES)
          + Math.floor(ram.u16(BUCKETS[9].counter) / RECORD_BYTES)
          + virtual6 + virtual9;
        if (virtualBuckets?.[6]) virtualBuckets[6].length = 0;
        if (virtualBuckets?.[9]) virtualBuckets[9].length = 0;
        ram.setU16(BUCKETS[6].counter, 0);               // $23D3CC
        ram.setU16(BUCKETS[9].counter, 0);               // $23D3D2
        ram.setU16(DL.dropped69Flag, 1);                 // $23D3D8
      }
    }
  }

  // (f) THE DRAIN, $23D3E0..$23D622: 29 buckets in the ROM's hand-written order.
  //     Bucket 0 is not drained -- its producers appended STRAIGHT INTO the
  //     queue, so it is already the queue's first $80AFC0 bytes.
  const order = [];
  for (let i = 1; i < BUCKETS.length; i++) order.push(i);
  if (mutating(opts, 'drain-order-reversed')) order.reverse();
  t.perBucketRecords[0] = Math.floor(ram.u16(COUNTER_BASE) / RECORD_BYTES);

  const capGe = mutating(opts, 'cap-as-ge');
  let abandoned = false;
  if (virtualBuckets && appendVirtualBucket(ram, virtualBuckets, 0, capGe, t)) {
    t.capFired = true;
    t.capBucket = 0;
    abandoned = true;
  }

  for (const bi of order) {
    if (abandoned) {
      t.bucketsAbandoned++;
      continue;
    }                                                       // `bcs $23D624`
    const b = BUCKETS[bi];
    let d0b = ram.u16(b.counter);                           // $23D726 move.w (A1),D0
    const virtualCount = virtualBuckets?.[bi]?.length ?? 0;
    if (d0b === 0 && virtualCount === 0) continue;          // $23D728 beq -> rts
    let full = false;

    if (d0b !== 0) {
      let a2 = DL.queue + u16(ram.u16(COUNTER_BASE));       // $23D72A / $23D730
      let a0 = b.buffer;
      for (;;) {
        // $23D736 -- FOUR `move.l (A0)+,(A2)+`: sixteen bytes, see §1.
        for (let k = 0; k < 16; k += 2) {
          ram.setU16(a2 + k, ram.u16(a0 + k));
        }
        a0 += 16; a2 += 16;
        const ctr = u16(ram.u16(COUNTER_BASE) + RECORD_BYTES);
        ram.setU16(COUNTER_BASE, ctr);                     // $23D73E addi.w #$c
        t.perBucketRecords[bi]++;
        if (capGe ? ctr >= DL.capBytes : ctr === DL.capBytes) {   // $23D746/$23D74E
          full = true;
          break;
        }
        d0b = u16(d0b - RECORD_BYTES);                    // $23D750 subi.w
        if (d0b === 0) break;                             // $23D754 bne
        // `subi.w #$c / bne` only terminates if the count is a multiple of 4
        // (gcd(12, $10000)); the board would spin here too, but a tool that hangs
        // is worse than one that says WHERE. This can only fire on a counter the
        // game cannot produce -- every producer steps by exactly 12 from 0.
        if (t.perBucketRecords[bi] > 0x4000) {
          unreached(0x23d754, `bucket ${bi}'s count $${ram.u16(b.counter).toString(16)
            } is not a multiple of 12, so \`subi.w #$c,D0 / bne\` never reaches 0 `
            + `and the drain does not terminate`);
        }
      }
      ram.setU16(b.counter, 0);                            // $23D756/$23D75A
    }

    if (!full && virtualBuckets) {
      full = appendVirtualBucket(ram, virtualBuckets, bi, capGe, t);
    }

    if (full) {
      t.capFired = true;
      t.capBucket = bi;
      abandoned = true;                                   // ori #1,SR -> bcs
    } else {
      t.bucketsDrained++;
    }
  }

  // (g) THE EMIT, $23D624..$23D6CC.
  ram.setU16(DL.prevQueueBytes, ram.u16(COUNTER_BASE));  // $23D62A (D7 is dead)
  let a0 = DL.list;
  let n = ram.u16(COUNTER_BASE);                         // $23D64E move.w
  t.queueBytes = n;
  const b054 = ram.u32(DL.globalOffset);
  t.b054 = b054;
  t.b054Values.add(b054);
  if (b054 !== 0) {
    // THE LOUD WATCH.  W432 named what moves it: `$260EC8`'s SCREEN SHAKE, 42
    // frames per boss death out of the table at $260F4C.  It stays loud because
    // these are the only frames on which the emit's 32-bit add and the $3FFF
    // short-axis re-mask are anything but identities.
    warn(`$80B054 = $${b054.toString(16).padStart(8, '0')} -- the global sprite `
      + `offset is NON-ZERO: this is $260EC8's screen shake (shakeX $80B054, `
      + `shakeY $80B056, 42 pairs from $260F4C). The emit's add.l ($23D6A6) `
      + `carries between the coordinate fields on these frames and the $3FFF `
      + `re-mask ($23D6AC) is live. See 10-recon-display-list §7.3.`);
  }

  if (n === 0) {                                         // $23D654 beq $23D6EE
    writeTerminator(ram, a0, t);
  } else {
    if (n > DL.capBytes) n = DL.capBytes;                // $23D65E cmpi/bls/move
    let a1 = DL.queue;
    let d4 = DL.fillerFirst;                             // $23D676 moveq #$33
    const noFiller = mutating(opts, 'no-filler');
    const flatFiller = mutating(opts, 'filler-every-52-flat');
    for (;;) {
      d4 = u16(d4 - 1);                                  // $23D67A subq.w #1
      if (d4 === 0xffff) {                               // the borrow -> filler
        d4 = flatFiller ? DL.fillerFirst : DL.fillerThen; // $23D67E moveq #$32
        if (!noFiller) {
          for (let k = 0; k < 5; k++) ram.setU16(a0 + k * 2, FILLER[k]);
          a0 += 10;
          t.fillers++; t.entries++;
        }
        d4 = u16(d4 - 1);                                // $23D694 subq.w #1
      }
      // $23D696..$23D6BE -- one 12-byte request -> one 10-byte entry.
      const w01 = (ram.u16(a1) << 16 | ram.u16(a1 + 2)) >>> 0;
      const d3 = (w01 & 0xf800f800) >>> 0;               // $23D69A grow+zoom
      let d1 = (w01 & 0x07ff3fff) >>> 0;                 // $23D6A0 positions
      const beforeAdd = d1 & 0xffff;
      if (mutating(opts, 'b054-two-16bit-adds')) {
        d1 = ((u16((d1 >>> 16) + (b054 >>> 16)) << 16) | u16(d1 + b054)) >>> 0;
      } else {
        d1 = ((d1 + b054) >>> 0);                        // $23D6A6 add.l -- 32 BIT
      }
      d1 = (d1 & (mutating(opts, 'emit-mask-03ff') ? 0x07ff03ff : 0x07ff3fff)) >>> 0;
      assertShortAxis(beforeAdd, d1 & 0xffff, t.entries, t, warn);  // §3(ii)
      d1 = (d1 | d3) >>> 0;                              // $23D6B2 or.l
      ram.setU16(a0 + 0, (d1 >>> 16) & 0xffff);          // $23D6B4 move.l
      ram.setU16(a0 + 2, d1 & 0xffff);
      ram.setU16(a0 + 4, ram.u16(a1 + 4));               // $23D6B6 move.l
      ram.setU16(a0 + 6, ram.u16(a1 + 6));
      ram.setU16(a0 + 8, ram.u16(a1 + 8));               // $23D6B8 move.w
      if (!mutating(opts, 'no-flip-patch')) {
        // $23D6BA move.b (A1)+,D3 / or.b (A1)+,D3 / move.b D3,(-$6,A0):
        // the two bytes of the request's last word, OR-ED, over word 2's HIGH
        // byte -- which the `move.l` above has already written.
        const patched = (ram.u8(a1 + 10) | ram.u8(a1 + 11)) & 0xff;
        ram.setU16(a0 + 4, ((patched << 8) | (ram.u16(a0 + 4) & 0xff)) & 0xffff);
      }
      a1 += RECORD_BYTES;
      a0 += 10;
      t.records++; t.entries++;                          // $23D6C2 addq.w #1,D5
      n = u16(n - RECORD_BYTES);                         // $23D6C8 subi.w
      if (n === 0) break;                                // $23D6CC bne
      if (t.records > 0x4000) {                          // see the drain's twin
        unreached(0x23d6cc, `the emit's byte count is not a multiple of 12, so `
          + `\`subi.w #$c,D0 / bne\` never reaches 0 and the emit runs away past `
          + `$8009FF`);
      }
    }
    ram.setU16(COUNTER_BASE, 0);                         // $23D6E2 move.w D0 (==0)

    // (h) $23D6E8 cmpi.w #$BC4,D1 / beq -- see §4.  D1 is $12 here, ALWAYS.
    let skip = DL.terminatorTestValue === DL.capBytes;
    if (mutating(opts, 'terminator-by-count')) skip = (t.records === 251);
    if (mutating(opts, 'always-terminate')) skip = false;
    if (!skip) writeTerminator(ram, a0, t);
  }

  // (i) $23D70C..$23D71C -- `moveq #0,D1 / move.w #$1D,D0 / move.w D1,(A0)+ /
  //     dbra`: THIRTY words, $80AFC0..$80AFFB.  $80AFFC (the previous frame's
  //     queue length) is one word past the end and SURVIVES.
  if (!mutating(opts, 'no-counter-clear')) {
    for (let i = 0; i < COUNTER_COUNT; i++) ram.setU16(COUNTER_BASE + i * 2, 0);
  }

  // (j) $23D71E jsr $23C194 -- `move.w #1,D0 / or.w D0,$80393C`, and the same
  //     `bra.w $23C008` commit step (a) takes.
  t.ctrlAtEnd = sectionFlagSet23C194(ram, opts.videoRegs);
  if (virtualBuckets) {
    t.virtualRecords = t.perBucketVirtualRecords.reduce((sum, count) => sum + count, 0);
    t.virtualDropped = virtualRequestCount - t.virtualRecords;
  }
  return t;
}

/** $23D6EE..$23D6FA -- ten zero bytes. `word4 & $7FFF == 0` is what stops the
 *  hardware's DMA parse. */
function writeTerminator(ram, a0, t) {
  for (let k = 0; k < 5; k++) ram.setU16(a0 + k * 2, 0);
  t.terminated = true;
  t.entries++;
}

/** $23D70C..$23D71C on its own.  Kept exported because src/main.js used to call
 *  it as the ONLY part of call #4 the port modelled; it is now what call #4's
 *  tail does, and the name stays so the wave-8 gate keeps reading. */
export function resetSpriteQueueCounters(ram) {
  for (let i = 0; i < COUNTER_COUNT; i++) ram.setU16(COUNTER_BASE + i * 2, 0);
}

export { BUCKETS, STAGING_LO, STAGING_HI };
