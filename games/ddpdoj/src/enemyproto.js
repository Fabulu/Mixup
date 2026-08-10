// THE ENEMY PROTOTYPE LOADERS -- `$26377A` and `$2637A2`, the two routines that
// stand behind 124 of the 126 live enemy types.
//
// WHY THIS IS THE LEVERAGE.  `20-recon-enemy-census.md` §2 resolved **208
// (loader, table) pairs with 0 unresolved**: every enemy's hitbox, HP, speed,
// heading, palette, animation frame, HP reload and display-list bucket is DATA
// that these two routines copy at spawn.  `$2637A2` appears in 124 of the 126
// live init bodies and `$26377A` in 105.  Port two routines and export the
// tables and "per-type stats" stops being work.
//
// EVERY INIT IS A STUB AND THE BODY IS AT init+8.  All 256 entries of the type
// table are exactly `move.w #$N,($4,A5) / rts` -- the sub-record RUN LENGTH and
// nothing else -- verified mechanically over all 256 (census §"THE HEADLINE").
// The second entry point is reached by `$26361A addq.w #8,A1 / $263650 jsr (A1)`.
// A port that translates only the first entry point loses 100 % of every
// enemy's initialisation, not half of it.
//
// ===================== A CORRECTION TO THE RECON, FOUND HERE =================
// `20-recon-enemy-census.md` §2 transcribes `$2637A2` as ONE form:
//
//     move.w (A0)+,(A1)+ / addq.w #4,A1 / move.l (A0)+,(A1)+ x6 /
//     move.w (A0)+,(A1)+ / dbra    -> "exactly $20 bytes per sub-record"
//
// The listing has a branch the recon did not report -- `$2637AA bpl $2637C2` --
// and it is the eleventh-incident shape all over again (READ PAST / READ ROUND
// the apparent end).  The word just copied is TESTED, and its SIGN picks between
// two different prototype layouts:
//
//   bit 15 SET   ($2637AC, the LONG form)   28 table bytes -> $20 record bytes
//   bit 15 CLEAR ($2637C2, the SHORT form)  16 table bytes -> $20 record bytes,
//                and it `bset #$7,(-$2,A1)` -- i.e. it SETS bit 15 of the word
//                it just stored -- then writes THREE ZERO LONGWORDS in the
//                middle of the record before the last longword.
//
// Both forms write $20 bytes and both `dbra D7,$2637A8`, so the form is chosen
// AGAIN for every sub-record.  A port that knows only the long form advances
// its table pointer by 28 where the ROM advances by 16, and every sub-record
// after the first one in such a prototype is read from the wrong offset.  The
// two types this wave validates ($10, $11) both have `$A200` as their flags
// word -- bit 15 set -- so both take the long form, which is why the recon's
// worked example is right and its general statement is not.
//
// `$2637E0` (a third variant, `sign bit picks a shorter form`) and `$26378E`
// (word-offset/longword-value pairs relative to A6) are NOT used by any live
// init (census §2 measured: 0 of 126) and are LOUD NAMED THROWS below.

import { unreached } from './unported.js';

export const PROTO = {
  loadRecord: 0x26377a,     // D0+1 WORDS -> ($16,A5)
  loadSub: 0x2637a2,        // ($4,A5)+1 sub-records of $20 bytes -> (A6)
  loadOffsets: 0x26378e,    // (word offset, longword value) pairs vs A6 -- UNUSED
  loadSubAlt: 0x2637e0,     // a third variant -- UNUSED by any live init
  runLenOff: 0x04,          // ($4,A5), written by the 8-byte init stub
  recordOff: 0x16,          // ($16,A5), where $26377A copies to
  subStride: 0x20,          // both $2637A2 forms write exactly $20 bytes
};

/**
 * `$26377A` -- copy `d0 + 1` WORDS from the ROM prototype at `table` into the
 * enemy record starting at `($16,A5)`.
 *
 *   26377A: movem.l D0/A0-A1,-(A7)
 *   26377E: lea ($16,A5),A1
 *   263782: move.w (A0)+,(A1)+ / dbra D0,$263782
 *
 * `dbra` on D0 runs D0+1 times, which is why callers pass `moveq #$F` for a
 * 16-word block ($26872E for type $11, $2680E0 for type $10).
 */
export function loadRecordProto(ram, rom, a5, table, d0) {
  for (let i = 0; i <= d0; i++) {                    // $263784 dbra D0
    ram.setU16(a5 + PROTO.recordOff + 2 * i, rom.u16(table + 2 * i));
  }
  return table + 2 * (d0 + 1);                       // A0 after the walk
}

/**
 * `$2637A2` -- copy the SUB-RECORD prototype(s).  `($4,A5)` (the run length
 * minus one, written by the type's 8-byte init stub) says how many.
 *
 * Returns the ROM pointer A0 ends on, because the callers that chain a second
 * `lea` off it depend on the table advance and the two forms advance by
 * DIFFERENT amounts -- see the header.
 *
 * @param a6 the sub-record base (the record's `($6,A5)`).
 */
export function loadSubProto(ram, rom, a5, a6, table, runLen = undefined) {
  const d7 = runLen === undefined
    ? ram.u16(a5 + PROTO.runLenOff)                  // $2637A2 move.w ($4,A5),D7
    : runLen;                                        // callers entering at $2637A6
  let a0 = table;
  let a1 = a6;                                       // $2637A6 movea.l A6,A1
  for (let n = 0; n <= (d7 & 0xffff); n++) {         // $2637BC dbra D7
    const flags = rom.u16(a0);                       // $2637A8 move.w (A0)+,(A1)+
    ram.setU16(a1, flags);
    a0 += 2; a1 += 2;
    if (flags & 0x8000) {
      // $2637AC -- THE LONG FORM. 6 longwords + 1 word after the 4-byte skip.
      a1 += 4;                                       // $2637AC addq.w #4,A1
      for (let i = 0; i < 6; i++) {                  // $2637AE..$2637B8
        ram.setU32(a1, rom.u32(a0)); a0 += 4; a1 += 4;
      }
      ram.setU16(a1, rom.u16(a0)); a0 += 2; a1 += 2; // $2637BA
    } else {
      // $2637C2 -- THE SHORT FORM.  It first turns the stored word NEGATIVE
      // (`bset #$7,(-$2,A1)` on the word's HIGH byte = bit 15), then copies
      // 2 longs + 1 word, writes THREE ZERO LONGWORDS, and copies one last
      // long.  16 table bytes, $20 record bytes.
      ram.setU8(a1 - 2, ram.u8(a1 - 2) | 0x80);      // $2637C2
      a1 += 4;                                       // $2637C8 addq.w #4,A1
      ram.setU32(a1, rom.u32(a0)); a0 += 4; a1 += 4; // $2637CA
      ram.setU32(a1, rom.u32(a0)); a0 += 4; a1 += 4; // $2637CC
      ram.setU16(a1, rom.u16(a0)); a0 += 2; a1 += 2; // $2637CE
      ram.setU32(a1, 0); a1 += 4;                    // $2637D2 moveq #0,D0
      ram.setU32(a1, 0); a1 += 4;                    // $2637D4
      ram.setU32(a1, 0); a1 += 4;                    // $2637D6
      ram.setU32(a1, rom.u32(a0)); a0 += 4; a1 += 4; // $2637D8
    }
  }
  return a0;
}

/** `$26378E` -- (word offset, longword value) pairs applied relative to A6.
 *  Used by NO live init body (census §2: 0 of 126). */
export function loadOffsetPairs() {
  unreached(PROTO.loadOffsets, 'the (offset,longword) prototype loader $26378E '
    + '-- 20-recon-enemy-census §2 measured it used by 0 of the 126 live init '
    + 'bodies. It is unported on purpose; reaching it means the census missed a '
    + 'caller');
}

/** `$2637E0` -- the third sub-record loader variant. Also used by no live init. */
export function loadSubProtoAlt() {
  unreached(PROTO.loadSubAlt, 'the alternate sub-record prototype loader $2637E0 '
    + '-- used by 0 of the 126 live init bodies (census §2)');
}
