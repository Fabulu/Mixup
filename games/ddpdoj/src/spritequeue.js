// $23F3AE -- THE SPRITE REQUEST ENQUEUE, and the end of every shot handler.
//
// Wave 5 named this as the reason a shot handler "pulls in the request
// pipeline".  It does not: $23F3AE is fourteen instructions and appends ONE
// 12-byte record to ONE bucket.  What it pulls in is a decision about WHICH
// bucket, and that turned out to be the cheap half.
//
//   23f3ae: lea $808854,A0
//   23f3b4: adda.w $80afd6,A0            <- $80AFD6 is this bucket's BYTE count
//   23f3ba: addi.w #$c,$80afd6
//   23f3c2: lea ($2,A6),A1
//   23f3c6: move.l (A1)+,D0              D0 = { [A6+2], [A6+4] }
//   23f3c8: swap D0
//   23f3ca: add.w (A1)+,D0               low half += [A6+6]
//   23f3cc: swap D0
//   23f3ce: add.w (A1)+,D0               low half += [A6+8]
//   23f3d0: asr.l #6,D0                  ONE shift across BOTH halves
//   23f3d2: andi.l #$07ff03ff,D0
//   23f3d8: ori.l  #$80008000,D0
//   23f3de: move.l D0,(A0)+              words 0,1
//   23f3e0: move.l (A1)+,(A0)+           words 2,3 <- ($a,A6)
//   23f3e2: move.w (A1)+,(A0)+           word  4   <- ($e,A6)
//   23f3e4: move.w ($1c,A6),(A0)+        word  5
//   23f3e8: rts
//
// THE `asr.l #6` IS ACROSS THE PAIR, NOT PER FIELD.  It shifts the packed
// longword once, so the low six bits of the Y word land in the top of the X
// word -- and are then masked off by $03FF.  A port that shifted each field
// separately gets the same answer HERE and a different one the first time the
// masks change; it is translated as one 32-bit shift because that is what the
// instruction is.  ($2,A6)+($6,A6) is the drawn Y and ($4,A6)+($8,A6) the drawn
// X, both 1/64 px, which is where the record's `$FC00/$FE00` template fields
// (-16 px, -8 px) turn into a sprite centred on the shot.
//
// WHICH BUCKET, MEASURED.  $80AFD6 is one of the 29 bucket counters the sprite
// build ($23D2AE, main-loop call #4) sums and then copies into the shared queue
// at $23D4E4 (`lea $808854,A0 / lea $80AFD6,A1 / bsr $23D726`).  A static scan
// of the decrypted image finds $23F3AE reached by exactly 23 `jmp $23F3AE.l`
// sites, EVERY ONE of them inside the player-shot handler block
// ($253B40..$2544FC), and no other absolute-long caller anywhere.  Four sibling
// appenders share the same bucket ($23F3EA, $23F42E, $23F4A4, $23F4D6); of
// those only $23F42E has any absolute-long caller at all ($253D90/$253DA2,
// inside shot handler [9]).  ALL OF THAT IS A LOWER BOUND: a call through a
// register is invisible to that scan, so the claim is "no absolute-long caller
// outside the shot handlers", never "nothing else writes this bucket".
//
// $80AFD6 IS ZERO AT EVERY SAMPLE POINT (measured over 2,600 logic frames of
// `stage1-open`), because the TAIL of main-loop call #4 clears all thirty
// counter words:
//
//   23d70c: lea $80afc0,A0 / moveq #$0,D1 / move.w #$1d,D0
//   23d718: move.w D1,(A0)+ / dbra D0,$23d718        <- $80AFC0..$80AFFB
//
// (There is a second, bigger clear at $23D1F2 that names each counter
// individually; its only absolute-long caller is $23BF44, outside the loop, and
// no `bsr` in $200000-$2A0000 targets it -- so the per-frame reset is the dbra
// loop above, not that one.)  The port models THAT loop and nothing else of
// call #4 -- see resetSpriteQueueCounters().

import { RAM } from './machine.js';
import { u16, i16 } from './ram.js';

export const SPRQ = {
  shotBucket: 0x808854,      // $23F3AE lea $808854,A0
  shotBucketCount: 0x80afd6, // $23F3B4 adda.w $80AFD6,A0
  recordBytes: 12,           // $23F3BA addi.w #$c
  // $808854..$808EB3 -- the next bucket's base is $808EB4 ($23D4F8), so this
  // one holds $660 bytes = 136 records.  The board never checks it here; the
  // cap test lives in $23D726, which this appender is not.
  shotBucketEnd: 0x808eb4,
};

/**
 * $23F3AE.  Appends the record at `rec` to the shot bucket.
 * @returns {number} the byte offset the record was written at.
 */
export function enqueueShotSprite(ram, rec) {
  const off = u16(ram.u16(SPRQ.shotBucketCount));            // $23F3B4
  const at = SPRQ.shotBucket + off;
  ram.setU16(SPRQ.shotBucketCount, u16(off + SPRQ.recordBytes));  // $23F3BA

  // $23F3C6..$23F3D0 -- built as ONE longword, shifted once.
  const y = u16(i16(ram.u16(rec + 2)) + i16(ram.u16(rec + 6)));
  const x = u16(i16(ram.u16(rec + 4)) + i16(ram.u16(rec + 8)));
  const packed = (((y << 16) | x) | 0) >> 6;                 // asr.l #6
  const masked = (packed & 0x07ff03ff) | 0x80008000;         // $23F3D2/$23F3D8

  ram.setU16(at + 0, (masked >>> 16) & 0xffff);              // $23F3DE
  ram.setU16(at + 2, masked & 0xffff);
  ram.setU16(at + 4, ram.u16(rec + 0x0a));                   // $23F3E0
  ram.setU16(at + 6, ram.u16(rec + 0x0c));
  ram.setU16(at + 8, ram.u16(rec + 0x0e));                   // $23F3E2
  ram.setU16(at + 10, ram.u16(rec + 0x1c));                  // $23F3E4
  return off;
}

/**
 * $23D70C..$23D71C -- the ONE loop of main-loop call #4 the port models.
 * Everything else about $23D2AE (the 29-bucket sum, the guarded copy at
 * $23D726, the 251-record cap, the emit at $23D624 and the filler every 52
 * records) is still unported and still COUNTED, not silently skipped.
 */
export function resetSpriteQueueCounters(ram) {
  for (let i = 0; i <= 0x1d; i++) ram.setU16(0x80afc0 + i * 2, 0);  // $23D718
}

export { RAM };
