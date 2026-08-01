// THE SPRITE DRAWER -- `draw_sprite_new_basic` / `draw_sprite_new_zoomed`,
// `igs023_video.cpp:349-582` (tag mame0289), transcribed instruction-shape for
// instruction-shape.  The Python twin is `tools/framerender.py`'s SpriteDrawer,
// which scores 100.0000 % against MAME's own framebuffer on 16 frame pairs.
//
// THE ENCODING, because none of it is guessable:
//   * a record carries a 23-bit WORD offset into `sprmask`.  The first TWO u16
//     there are a header, not mask data:
//         a = ((mask[o+1] << 16) | mask[o]) >> 2      -- a WORD index into sprcol
//     and the mask stream begins at o+2.
//   * per line, `wide` mask words are consumed, LSB first.  A SET bit is
//     TRANSPARENT; a CLEAR bit consumes the next 5-bit pixel out of the sprcol
//     stream (3 pixels per u16: bits 0-4, 5-9, 10-14; bit 15 unused).
//     `pixgate.mjs --mutate spr-mask` inverts that polarity; wave 3 measured
//     the inverted decoder at 51.1631 %.
//   * ZOOM is a 32-bit MASK per axis out of the 16-entry zoom table, not a
//     ratio.  Bit set = this source pixel is doubled (grow) or dropped
//     (shrink).  `zoomWord` returns 0 for z >= 0x10 and 1 for z == 0xf.
//
// AND THE ENCODING TRAP `NOTES-assets.md` §2 pays for in full: "no zoom on this
// axis" is NOT `zom=0`.  It is `zom=0` WITH `grow=1`, because grow flips the
// index to `0x10 - z` and only `z >= 0x10` yields a zero mask.  `zom=0,
// grow=0` selects zoom-table entry 0, which is a real zoom.

/** igs023_video.cpp:689 -- the zoom table entry as a 32-bit mask. */
export function zoomWord(zoomram, z) {
  if (z >= 0x10) return 0;
  if (z === 0xf) return 1;
  return ((zoomram[z * 2] << 16) | zoomram[z * 2 + 1]) >>> 0;
}

/** The effective (xzoom, yzoom) masks for one record, grow-flip applied. */
export function effectiveZoom(s, zoomram, zw = zoomWord) {
  let xz = s.xzom, yz = s.yzom;
  if (s.xgrow) xz = 0x10 - xz;
  if (s.ygrow) yz = 0x10 - yz;
  return [zw(zoomram, xz), zw(zoomram, yz)];
}

export class SpriteDrawer {
  /**
   * @param {{sprcol: Uint16Array, sprmask: Uint16Array}} roms
   * @param {Uint16Array} bitmap  H*W palette indexes
   * @param {Uint8Array} pri      H*W: bit0 = a sprite owns this pixel,
   *                              bit1 = the BG layer wrote it
   */
  constructor(roms, bitmap, priBitmap, W, H,
    { maskBitOpaque = false, ignoreBgPriority = false } = {}) {
    this.mask = roms.sprmask;
    this.col = roms.sprcol;
    this.mlen = this.mask.length;
    this.clen = this.col.length;
    this.bm = bitmap;
    this.pri = priBitmap;
    this.W = W; this.H = H;
    // Red validation only (`--mutate spr-mask`): the polarity of the
    // transparency bit.  The hardware's is "set = transparent".
    this.maskBitOpaque = maskBitOpaque;
    // Red validation only (`--mutate pri-ignore`): drop the sprite-vs-BG
    // priority test, so a pri=0 sprite draws over a BG pixel it should lose to.
    this.ignoreBgPriority = ignoreBgPriority;
    this.a = 0; this.abit = 0; this.b = 0;
  }

  _pix() {
    const v = (this.col[this.a & (this.clen - 1)] >> this.abit) & 0x1f;
    this.abit += 5;
    if (this.abit >= 15) { this.a++; this.abit = 0; }
    return v;
  }

  _drawPix(x, pri, y, val) {
    if (x >= 0 && x < this.W) {
      const o = y * this.W + x;
      const p = this.pri[o];
      if (!(p & 1)) {
        // `pgm_draw_pix`, transcribed: the record's `pri` bit means "BEHIND the
        // BG".  pri==0 -> draw unconditionally; pri==1 -> only where the BG did
        // not already write (pri bitmap bit 1).  Not the other way round.
        if (this.ignoreBgPriority || !pri || !(p & 2)) this.bm[o] = val;
      }
      this.pri[o] |= 1;
    }
  }

  /** One line of an UNZOOMED sprite.  `draw` false = consume the stream only. */
  _lineBasic(wide, y, flip, xpos, pri, realxsize, palt, draw) {
    let xcntDraw = 0;
    const opaque = this.maskBitOpaque;
    for (let w = 0; w < wide; w++) {
      let m = this.mask[this.b & (this.mlen - 1)];
      this.b++;
      for (let k = 0; k < 16; k++) {
        const clear = opaque ? (m & 1) : !(m & 1);
        if (clear) {
          const val = this._pix() + palt * 32;
          if (draw) {
            const x = !(flip & 1) ? xpos + xcntDraw : xpos + realxsize - xcntDraw;
            this._drawPix(x, pri, y, val);
          }
          xcntDraw++;
        } else {
          xcntDraw++;
        }
        m >>= 1;
      }
    }
  }

  /** One line of a ZOOMED sprite. */
  _lineZoom(wide, y, xzoom, xgrow, flip, xpos, pri, realxsize, palt, draw) {
    let xoffset = 0, xcntDraw = 0;
    for (let w = 0; w < wide; w++) {
      let m = this.mask[this.b & (this.mlen - 1)];
      this.b++;
      for (let k = 0; k < 16; k++) {
        const zb = (xzoom >>> (xoffset & 0x1f)) & 1;
        xoffset++;
        if (!(m & 1)) {
          const val = this._pix() + palt * 32;
          if (draw && (xgrow || !zb)) {
            const n = zb ? 2 : 1;
            for (let r = 0; r < n; r++) {
              const x = !(flip & 1) ? xpos + xcntDraw : xpos + realxsize - xcntDraw;
              this._drawPix(x, pri, y, val);
              xcntDraw++;
            }
          }
        } else if (xgrow || !zb) {
          xcntDraw += zb ? 2 : 1;
        }
        m >>= 1;
      }
    }
  }

  /** @param {object} s a record from `parseSpriteList` */
  draw(s, zoomram, zw = zoomWord) {
    const wide = s.width, high = s.height;
    if (wide === 0 || high === 0) return;

    this.b = s.offs;
    this.a = (((this.mask[(this.b + 1) & (this.mlen - 1)] << 16)
      | this.mask[this.b & (this.mlen - 1)]) >>> 2);
    this.abit = 0;
    this.b += 2;

    const flip = s.flip, palt = s.color, pri = s.pri;
    const xpos = s.x, ypos = s.y;
    let xzom = s.xzom, yzom = s.yzom;
    const xgrow = s.xgrow, ygrow = s.ygrow;
    if (xgrow) xzom = 0x10 - xzom;
    if (ygrow) yzom = 0x10 - yzom;
    const xzoom = zw(zoomram, xzom);
    const yzoom = zw(zoomram, yzom);

    if (!xzoom && !yzoom) {
      const realysize = high - 1;
      const realxsize = wide * 16 - 1;
      let ycntdraw = 0;
      for (let ycnt = 0; ycnt < high; ycnt++) {
        const y = !(flip & 2) ? ypos + ycntdraw : ypos + realysize - ycntdraw;
        if (y >= 0 && y < this.H) {
          this._lineBasic(wide, y, flip, xpos, pri, realxsize, palt, true);
        } else {
          this._lineBasic(wide, 0, flip, xpos, pri, realxsize, palt, false);
          // MAME's early-out: once the sprite has walked off the far edge the
          // remaining lines cannot land.  Transcribed, not optimised.
          if (!(flip & 2)) { if (y >= this.H - 1) return; }
          else if (y < 0) return;
        }
        ycntdraw++;
      }
      return;
    }

    // --- zoomed.  realxsize/realysize are the DRAWN extents, counted first.
    let realysize = 0;
    for (let ycnt = 0; ycnt < high; ycnt++) {
      const zb = (yzoom >>> (ycnt & 0x1f)) & 1;
      if (ygrow || !zb) realysize += zb ? 2 : 1;
    }
    realysize -= 1;
    let realxsize = 0;
    for (let xcnt = 0; xcnt < wide * 16; xcnt++) {
      const zb = (xzoom >>> (xcnt & 0x1f)) & 1;
      if (xgrow || !zb) realxsize += zb ? 2 : 1;
    }
    realxsize -= 1;

    let ycntdraw = 0;
    for (let ycnt = 0; ycnt < high; ycnt++) {
      const zb = (yzoom >>> (ycnt & 0x1f)) & 1;
      if (zb && ygrow) {
        // A doubled source line: the stream position is REWOUND and replayed.
        const ta = this.a, tb = this.abit, tbo = this.b;
        for (let rep = 0; rep < 2; rep++) {
          if (rep === 1) { this.a = ta; this.abit = tb; this.b = tbo; }
          const y = !(flip & 2) ? ypos + ycntdraw : ypos + realysize - ycntdraw;
          if (y >= 0 && y < this.H) {
            this._lineZoom(wide, y, xzoom, xgrow, flip, xpos, pri, realxsize, palt, true);
          } else {
            this._lineZoom(wide, 0, xzoom, xgrow, flip, xpos, pri, realxsize, palt, false);
          }
          ycntdraw++;
        }
      } else if (zb && !ygrow) {
        // A dropped source line: consumed, never drawn, ycntdraw NOT advanced.
        this._lineZoom(wide, 0, xzoom, xgrow, flip, xpos, pri, realxsize, palt, false);
      } else {
        const y = !(flip & 2) ? ypos + ycntdraw : ypos + realysize - ycntdraw;
        if (y >= 0 && y < this.H) {
          this._lineZoom(wide, y, xzoom, xgrow, flip, xpos, pri, realxsize, palt, true);
        } else {
          this._lineZoom(wide, 0, xzoom, xgrow, flip, xpos, pri, realxsize, palt, false);
        }
        ycntdraw++;
      }
    }
  }
}
