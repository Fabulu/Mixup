// $241812 -- the movement vector lookup.  The whole of the ship's arithmetic.
//
//   $241812 add.w D1,D1 / add.w D1,D1     D1 = angle * 4
//   $241816 add.w D0,D0 / add.w D0,D0     D0 = speedIndex * 4
//   $24181A lea $200920,A3
//   $241820 movea.l (A3,D0.w),A3          A3 = the speed level's table
//   $241824 move.w D1,D3 / add.w D3,D3    D3 = angle * 8
//   $24182A lea ($2418B4,PC),A0
//   $241830 adda.w (A0,D3.w),A3           += fold[word index angle*4]
//   $241836 move.l (A3)+,D2
//   $241838 move.l (A3)+,D3
//   $24183A asr.l #4,D2
//   $24183C asr.l #4,D3
//   $24183E andi.w #$c0,D1 / lsr.w #1,D1  (angle & $30) * 2
//   $241844 lea ($241850,PC),A3 / jmp (A3,D1.w)
//     $241850 rts                          quadrant 0: as read
//     $241870 neg.w D2 / rts               quadrant 1
//     $241890 neg.w D2 / neg.w D3 / rts    quadrant 2
//     $2418B0 neg.w D3 / rts               quadrant 3
//
// The table it lands in is ONE QUADRANT of 65 entries running (r,0) at 0 deg to
// (0,r) at 90 deg; the fold table at $2418B4 is a triangle wave that maps the
// full 64-step circle onto it, which is why the quadrant negation is not a
// double count.  This was the one piece of the addressing that looked wrong on
// paper -- index angle*4 into a 65-entry table overruns by a factor of four --
// and dumping the fold table settled it: word[a*4] for the eight angles the
// stick can produce is 0, $100, $200, $100, 0, $100, $200, $100.
//
// D2 is the Y (long axis) delta and D3 the X delta: $2417F4 adds D2 to ($2,A6)
// and D3 to ($4,A6), and the clamps that answer each stick bit confirm it.
//
// ASR IS ARITHMETIC.  `asr.l #4` on a negative long rounds toward -infinity.
// The negations happen AFTER the shift, so the shift never sees a negative
// value here -- but the rule is written down because a port that shifted after
// negating would be off by one unit per frame on three quadrants out of four.

import { asr, i16 } from './ram.js';
import { unreached } from './unported.js';

export class MoveTables {
  /** @param t the JSON produced by `tools/export-tables.py` (gitignored, ROM-derived). */
  constructor(t) {
    this.dir = t.dirTable.bytes;          // $2552DC
    this.fold = t.foldTable.words;        // $2418B4
    this.quads = t.speed.quads;           // $200920 -> $200D20 + $208*s
    this.entries = t.speed.quadEntries;   // 65
    this.animA = t.anim.a.shipSel0;       // $25533A
    this.animB = t.anim.b.shipSel0;       // $2553CA
    this.tiltMin = t.anim.tiltMin;
    this.tiltStep = t.anim.tiltStep;
    this.imageSha256 = t.image_sha256;
  }

  /** $2495AA/$2495B4: stick nibble -> angle byte.  $FF means "no direction". */
  angleFor(dirNibble) { return this.dir[dirNibble & 0x0f]; }

  /**
   * $241812.  Returns {dy, dx} already narrowed to 16 bits, ready for the
   * `add.w` at $2417F4/$2417F8.
   */
  vector(speedIndex, angleByte) {
    const a = angleByte & 0x3f;                  // $2417E4 moveq #$3f / and.b
    if (speedIndex >= this.quads.length) {
      unreached(0x241820,
        `speed index ${speedIndex} is past the ${this.quads.length} levels `
        + `exported from the $200920 pointer table (the scan cap, not the table `
        + `end -- re-run tools/export-tables.py with a higher SCAN_CAP)`);
    }
    const foldBytes = this.fold[a * 4];          // $241830, word index a*4
    if (foldBytes & 7 || foldBytes > (this.entries - 1) * 8) {
      unreached(0x241830, `fold[${a * 4}] = $${foldBytes.toString(16)} is not an `
        + `8-byte-aligned offset inside the 65-entry quadrant`);
    }
    const e = this.quads[speedIndex][foldBytes >> 3];
    let dy = asr(e[0], 4);                       // $24183A asr.l #4,D2
    let dx = asr(e[1], 4);                       // $24183C asr.l #4,D3
    const q = a & 0x30;                          // $24183E..$24184A
    if (q === 0x10) dy = -dy;                    // $241870 neg.w D2
    else if (q === 0x20) { dy = -dy; dx = -dx; } // $241890
    else if (q === 0x30) dx = -dx;               // $2418B0
    return { dy: i16(dy), dx: i16(dx) };
  }

  /** $249E4E: the two animation longs, indexed by tilt over [-$20,+$20] step 4. */
  anim(tilt) {
    const i = (i16(tilt) - this.tiltMin) / this.tiltStep;
    if (!Number.isInteger(i) || i < 0 || i >= this.animA.length) {
      unreached(0x249e62,
        `tilt ${i16(tilt)} is outside the [-$20,+$20] step-4 range the $25533A `
        + `animation table covers -- the ramp at $2495F6/$24962E can only reach `
        + `those values, so something else moved it`);
    }
    return { a: this.animA[i], b: this.animB[i] };
  }
}
