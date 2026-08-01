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
  /**
   * @param t   the JSON produced by `tools/export-tables.py` (gitignored, ROM-derived)
   * @param rom a RomWindows over `t.rom` -- $241AF4 is read through it rather
   *            than exported a second time, so the two cannot disagree.
   */
  constructor(t, rom) {
    this.rom = rom;
    // $241AF4, 256 words.  Read out of the ROM window at construction so a
    // missing window fails at boot rather than on the first shot.
    this.shotFold = rom
      ? Array.from({ length: 256 }, (_, i) => rom.u16(0x241af4 + i * 2))
      : null;
    this.dir = t.dirTable.bytes;          // $2552DC
    this.fold = t.foldTable.words;        // $2418B4
    // WAVE 8: the $200920 table is 256 levels (re-measured; wave 4's "64" was
    // its own scan cap).  Exporting all 256 quadrant tables would be 133 KiB of
    // JSON for levels nothing reads, so the exporter exports a DERIVED SET --
    // the player's 0..31 plus every ($1a,A6) byte in a reachable spawn template
    // -- and `quads` is keyed by level with a hole everywhere else.  The hole is
    // a LOUD NAMED THROW, never `undefined`.
    this.quads = t.speed.quads;           // $200920 -> $200D20 + $208*s
    this.speedLevels = t.speed.levels;    // 256, the table's measured END
    this.exportedLevels = t.speed.exported;
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
  /** The quadrant table for one speed level, or a LOUD NAMED THROW. */
  quad(speedIndex, site) {
    const q = this.quads[String(speedIndex)];
    if (!q) {
      unreached(site,
        `speed index ${speedIndex} was not exported. The $200920 table has `
        + `${this.speedLevels} levels (measured, not a cap); `
        + `tools/export-tables.py exports ${this.exportedLevels.length} of them `
        + `-- the player's 0..31 plus every speed byte in a reachable spawn `
        + `template. A level outside that set means the game reached a template `
        + `or a ramp this wave never measured`);
    }
    return q;
  }

  vector(speedIndex, angleByte) {
    const a = angleByte & 0x3f;                  // $2417E4 moveq #$3f / and.b
    const foldBytes = this.fold[a * 4];          // $241830, word index a*4
    if (foldBytes & 7 || foldBytes > (this.entries - 1) * 8) {
      unreached(0x241830, `fold[${a * 4}] = $${foldBytes.toString(16)} is not an `
        + `8-byte-aligned offset inside the 65-entry quadrant`);
    }
    const e = this.quad(speedIndex, 0x241820)[foldBytes >> 3];
    let dy = asr(e[0], 4);                       // $24183A asr.l #4,D2
    let dx = asr(e[1], 4);                       // $24183C asr.l #4,D3
    const q = a & 0x30;                          // $24183E..$24184A
    if (q === 0x10) dy = -dy;                    // $241870 neg.w D2
    else if (q === 0x20) { dy = -dy; dx = -dx; } // $241890
    else if (q === 0x30) dx = -dx;               // $2418B0
    return { dy: i16(dy), dx: i16(dx) };
  }

  /**
   * $241D34 -- THE SHOT'S vector routine, and it is NOT $241812.
   *
   *   241d34: add.w D0,D0 / add.w D0,D0        D0 = speedIndex * 4
   *   241d38: lea $200920,A3 / movea.l (A3,D0.w),A3      the SAME speed tables
   *   241d42: move.w D1,D3 / add.w D3,D3       D3 = angle * 2   <- NOT angle*8
   *   241d46: lea ($241af4,PC),A2              a DIFFERENT fold table
   *   241d4a: adda.w (A2,D3.w),A3              word index = the WHOLE angle byte
   *   241d4e: move.l (A3)+,D2 / move.l (A3)+,D3
   *   241d52: asr.l #4,D2 / asr.l #4,D3
   *   241d56: andi.w #$c0,D1                   quadrant from bits 7..6
   *   241d5a: lea ($241d66,PC),A3 / jmp (A3,D1.w)
   *     $241D66 rts   $241DA6 neg.w D2   $241DE6 neg.w D2/D3   $241E26 neg.w D3
   *
   * Two differences from $241812 that a port MUST NOT collapse: the fold table
   * is indexed by the FULL angle byte (0..255) at word stride 1, not by
   * (angle & $3f) at word stride 4; and the quadrant comes from `angle & $C0`
   * used as a RAW byte offset into a table of $40-byte slots, so it is
   * angle bits 7..6 and not bits 5..4.  The shot templates carry angles like
   * $FF and $01, which $241812's `& $3f` would map to entirely different
   * quadrants.
   *
   * @returns {{dy:number,dx:number}} D2 (long axis) and D3 (short axis).
   */
  shotVector(speedIndex, angleByte) {
    const a = angleByte & 0xff;
    const foldBytes = this.shotFold[a];          // $241D4A, word index = angle
    if (foldBytes & 7 || foldBytes > (this.entries - 1) * 8) {
      unreached(0x241d4a, `shotFold[${a}] = $${foldBytes.toString(16)} is not an `
        + `8-byte-aligned offset inside the 65-entry quadrant`);
    }
    const e = this.quad(speedIndex, 0x241d3e)[foldBytes >> 3];
    let dy = asr(e[0], 4);                       // $241D52 asr.l #4,D2
    let dx = asr(e[1], 4);                       // $241D54 asr.l #4,D3
    const q = a & 0xc0;                          // $241D56 andi.w #$c0,D1
    if (q === 0x40) dy = -dy;                    // $241DA6
    else if (q === 0x80) { dy = -dy; dx = -dx; } // $241DE6
    else if (q === 0xc0) dx = -dx;               // $241E26
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
