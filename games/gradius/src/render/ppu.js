// The renderer. Two raster bands, split at scanline 212 -- NOT a general
// per-scanline model.
//
// This is a transcription of the model in NOTES-render.md, which rebuilds real
// Gradius frames PIXEL FOR PIXEL: 61,440 of 61,440 correct on every natural
// frame measured, with twelve deliberately-wrong variants each watched go red.
// tests/ppu.test.js runs this file against the same captured frames and gets
// the same 0, and carries the same negative controls.
//
// The two-band shape comes from a SPRITE-0 SPLIT at $9AA3, which busy-waits for
// about 57% of the frame and then changes THREE things at once -- scroll,
// nametable select, and the CNROM CHR bank. The mid-frame CHR swap is
// load-bearing: bank 0's pattern table $0000 has the terrain and NO HUD font,
// bank 1's has the entire status bar. Neutralising it corrupts 845-5,024 px.

import { NES_RGBA } from './nespalette.js';

export const W = 256, H = 240;

/**
 * Where band B begins.
 *
 * The split writes $2005 twice at $9AB2/$9AB5 and $2000 at $9ABC. Writes land
 * in the PPU's `t` register, and t's HORIZONTAL half is copied into `v` only at
 * dot 257 of each scanline -- so the scanline the write happens on still
 * renders with the old scroll. The write was measured at scanline 211 on
 * 1,795 of 1,795 gameplay frames, so band B starts at 212.
 */
export const BAND_B = 212;

/**
 * Sprites take band B's CHR one scanline LATER than the background does,
 * because the PPU prefetches sprite patterns for scanline N during dots
 * 257-320 of N-1, before the CNROM latch lands.
 *
 * MEASURED, not reasoned: three 8x16 sprites straddling the boundary, built
 * from a tile pair that differs between banks 0 and 1, cost 26 px at delay 0,
 * **0 px at delay 1**, and 31 px at delay 2 -- on two frames whose latch fell
 * on different scanlines.
 */
export const SPR_BANK_DELAY = 1;

/**
 * Break switches. Each one lies about exactly one rule. They exist so that
 * "the renderer is right" is a number rather than an opinion, and every one of
 * them has been seen to turn a pixel comparison red (tests/ppu.test.js).
 */
export const BREAKS = [
  'band', 'chrbank', 'boundary+1', 'boundary-1', 'chrline+1', 'chrline-1',
  'sprsize', 'prioX', 'scrollx', 'scrolly', 'sprbank0', 'sprlimit', 'backdrop',
];

/**
 * One row of one tile, as 8 values 0..3.
 *
 * `tiles` is assets/chr/tiles.u8: 2048 tiles x 64 bytes, one byte per pixel,
 * already de-planarised by the exporter. Index is
 * `bank*512 + half*256 + n`, half 0 = pattern table $0000.
 */
export function tileRow(tiles, bank, half, tile, row, out) {
  for (let i = 0; i < 8; i++) out[i] = tiles[tileBase(bank, half, tile, row) + i];
}

/**
 * The byte offset of pixel 0 of one tile row. Spelled once so `tileRow` and
 * `tilePixel` cannot drift apart -- tests/ppu.test.js sweeps every bank, half,
 * row and 256 tiles and requires `tilePixel(...i) === tileRow(...)[i]` for all
 * eight columns, which is the only thing keeping the two readings honest.
 */
function tileBase(bank, half, tile, row) {
  return ((bank << 9) | (half << 8) | (tile & 0xFF)) * 64 + row * 8;
}

/**
 * One pixel of one tile row, without materialising the other seven.
 *
 * Exported ONLY so tests/ppu.test.js can hold it against `tileRow`. The two are
 * the same arithmetic and this is the check that keeps them that way, and it is
 * the check that does not need a captured frame -- the pixel comparison against
 * the cartridge is stronger but SKIPS when tools/oracle/out/video/ is absent,
 * and a cost fix that is only guarded by a skippable test is not guarded.
 */
export function tilePixel(tiles, bank, half, tile, row, col) {
  return tiles[tileBase(bank, half, tile, row) + (col & 7)];
}

/**
 * Render one frame into a Uint32Array of RGBA words.
 *
 * @param {object} f  the frame's LATCHED state:
 *   {bandA:{ctrl,mask,scrollX,scrollY,chrBank}, bandB:{ctrl,chrBank,ran},
 *    nt:Uint8Array(4096), pal:Uint8Array(32), oam:Uint8Array(256)}
 *   Note `bandA` and NOT the zero-page shadows: $9A79 reloads $12 mid-frame for
 *   the NEXT frame, so reading $12/$13/$10 at the end of a frame gives you a
 *   renderer that is one frame ahead of the game and looks almost right.
 * @param {Uint8Array} tiles  assets/chr/tiles.u8
 * @param {Uint32Array} out   W*H RGBA words
 * @param {Set<string>} breaks
 */
export function renderFrame(f, tiles, out, breaks = new Set()) {
  const { nt, pal, oam } = f;
  const ctrlA = breaks.has('sprsize') ? (f.bandA.ctrl & ~0x20) : f.bandA.ctrl;
  const mask = f.bandA.mask;
  const scxA = breaks.has('scrollx') ? 0 : f.bandA.scrollX;
  const scyA = breaks.has('scrolly') ? 0 : f.bandA.scrollY;

  const split = f.bandB.ran && !breaks.has('band');
  const ctrlB = split
    ? (breaks.has('sprsize') ? (f.bandB.ctrl & ~0x20) : f.bandB.ctrl)
    : ctrlA;

  let bandBFrom = split ? BAND_B : H;
  if (breaks.has('boundary+1')) bandBFrom += 1;
  if (breaks.has('boundary-1')) bandBFrom -= 1;

  const bankA = f.bandA.chrBank;
  let bankB = split ? f.bandB.chrBank : bankA;
  let bankSl = split ? BAND_B : H;
  if (breaks.has('chrbank')) { bankB = bankA; bankSl = H; }
  if (breaks.has('chrline+1')) bankSl += 1;
  if (breaks.has('chrline-1')) bankSl -= 1;
  const sprDelay = breaks.has('sprbank0') ? 0 : SPR_BANK_DELAY;

  const bgShowLeft = (mask & 0x02) !== 0;   // $2001 bit 1
  const sprShowLeft = (mask & 0x04) !== 0;  // bit 2
  const bgOn = (mask & 0x08) !== 0;         // bit 3
  const sprOn = (mask & 0x10) !== 0;        // bit 4
  const sprLimit = breaks.has('sprlimit') ? 64 : 8;

  const px = new Uint8Array(8);
  const bgpix = new Uint8Array(W), bgpal = new Uint8Array(W);
  const sprpix = new Uint8Array(W), sprpal = new Uint8Array(W);
  const sprprio = new Uint8Array(W); const sprfirst = new Int16Array(W);
  const chosen = new Int32Array(64);

  for (let sl = 0; sl < H; sl++) {
    const ctrl = sl >= bandBFrom ? ctrlB : ctrlA;
    const bgBank = sl >= bankSl ? bankB : bankA;
    const sprBank = sl >= bankSl + sprDelay ? bankB : bankA;
    const bgHalf = (ctrl & 0x10) ? 1 : 0;      // PPUCTRL bit 4: bg pattern table
    const sprHalf8 = (ctrl & 0x08) ? 1 : 0;    // bit 3 -- IGNORED when 8x16
    const tall = (ctrl & 0x20) !== 0;          // bit 5

    // ---- horizontal. $9AB0: LDX #$00 / STX $2005 twice, so band B is
    // unscrolled. Its nametable-X bit comes from the $2000 write at $9ABC,
    // which lands AFTER dot 257 (measured 255-287) and therefore bites one
    // scanline later than the scroll does. In stage 1 both bits are 0 so it
    // never shows -- but a port that sets the bit must not assume they move
    // together.
    let scx, ntx;
    if (sl >= bandBFrom) {
      scx = 0;
      ntx = sl >= bandBFrom + 1 ? (ctrlB & 1) : (ctrlA & 1);
    } else {
      scx = scxA;
      ntx = ctrlA & 1;
    }

    // ---- vertical. `v` advances one scanline at a time from the vblank load;
    // coarse Y wraps 29 -> 0 and TOGGLES the nametable-Y bit. The split's
    // second $2005 write does NOT touch it -- only the horizontal half of t is
    // copied into v during rendering -- which is why $13 = 12 makes screen
    // scanlines 228-239 show nametable rows 0-1 instead of the status bar. A
    // renderer that clamps instead of wrapping loses the bottom 12 scanlines.
    let total = scyA + sl;
    let nty = (ctrl >> 1) & 1;
    if (total >= 240) { total -= 240; nty ^= 1; }
    const coarseY = total >> 3, fineY = total & 7;

    // ---- background
    bgpix.fill(0);
    if (bgOn) {
      for (let x = 0; x < W; x++) {
        const fx = scx + x;
        const ntxE = ntx ^ ((fx >> 8) & 1);
        const fxb = fx & 0xFF;
        const base = (((nty << 1) | ntxE) & 3) * 0x400;
        const cx = fxb >> 3;
        const tile = nt[base + coarseY * 32 + cx];
        const at = nt[base + 0x3C0 + (coarseY >> 2) * 8 + (cx >> 2)];
        const shift = ((coarseY & 2) << 1) | (cx & 2);
        bgpal[x] = (at >> shift) & 3;
        // WAVE 14, AND IT IS A COST FIX AND NOTHING ELSE. This line used to be
        // `tileRow(...); bgpix[x] = px[fxb & 7]` -- eight bytes copied into a
        // scratch array to read one of them, 61,440 times a frame, i.e. 7/8 of
        // the reads thrown away. tilePixel() computes the SAME index by the SAME
        // arithmetic (tileBase, shared with tileRow) and is bit-identical by
        // construction, not by hope: MEASURED 0 of 12,288,000 pixels different
        // over 200 consecutive frames, and the whole pixel gate (tests/ppu.test.js
        // + tools/oracle/rendergate.py, 61,440 px x 7 captured frames) re-run.
        //
        // WHY IT MATTERS, since a renderer is not the cartridge: MEASURED
        // 6.07 -> 2.09 ms median per frame, 36% -> 13% of the 16.639 ms budget
        // (tools/framecost.mjs). renderFrame() was the single most expensive
        // thing in the frame loop by an order of magnitude -- more than nmi()
        // and the synthesiser put together -- and nothing in this repo had ever
        // looked, which is the hole tools/framecost.mjs now fills.
        bgpix[x] = tilePixel(tiles, bgBank, bgHalf, tile, fineY, fxb);
      }
    }

    // ---- sprite evaluation: OAM ORDER, first 8 that cover this scanline.
    // OAM Y is TOP MINUS ONE, so a sprite with y covers y+1 .. y+height.
    // 8 per scanline, and the 9th and 10th are DROPPED, not flickered -- ten
    // injected sprites on one line produced exactly 64 lit pixels spanning
    // x = 8..183, the first eight, with indices 28 and 29 absent.
    const height = tall ? 16 : 8;
    let n = 0;
    if (sprOn) {
      for (let i = 0; i < 64 && n < sprLimit; i++) {
        const y = oam[i * 4];
        if (sl - 1 >= y && sl - 1 < y + height) chosen[n++] = i;
      }
    }

    sprpix.fill(0); sprfirst.fill(-1);
    for (let k = 0; k < n; k++) {
      const i = chosen[k];
      const y = oam[i * 4], tb = oam[i * 4 + 1];
      const attr = oam[i * 4 + 2], sx = oam[i * 4 + 3];
      let row = sl - 1 - y;
      if (attr & 0x80) row = height - 1 - row;    // vertical flip
      let half, t, r;
      if (tall) {
        // 8x16: bit 0 of the TILE byte picks the pattern table and the pair is
        // (tile & $FE, +1). PPUCTRL bit 3 is ignored. Read off the byte the ROM
        // actually stored in $2000 ($A8), not deduced.
        half = (tb & 1) ? 1 : 0;
        t = (tb & 0xFE) + (row >= 8 ? 1 : 0);
        r = row & 7;
      } else {
        half = sprHalf8; t = tb; r = row;
      }
      tileRow(tiles, sprBank, half, t, r, px);
      if (attr & 0x40) { for (let a = 0, b = 7; a < b; a++, b--) { const v = px[a]; px[a] = px[b]; px[b] = v; } }
      for (let c = 0; c < 8; c++) {
        const x = sx + c;
        if (x >= W) break;                        // NO horizontal wrap: a
                                                  // sprite at x=252 drew 4
                                                  // columns and stopped
        if (px[c] === 0) continue;
        if (sprfirst[x] >= 0) {
          // PRIORITY IS BY OAM INDEX ONLY. This is the OPPOSITE of the Game
          // Boy rule and it was proved HERE by injection, not by citation: two
          // overlapping sprites with the HIGHER OAM index at the SMALLER X, so
          // the two rules predict different colours. Lowest index won.
          if (breaks.has('prioX')) {
            if (sx >= oam[sprfirst[x] * 4 + 3]) continue;
          } else continue;
        }
        sprfirst[x] = i;
        sprpix[x] = px[c];
        sprpal[x] = attr & 3;
        sprprio[x] = (attr >> 5) & 1;             // 1 = behind opaque bg
      }
    }

    // ---- multiplex
    const o = sl * W;
    for (let x = 0; x < W; x++) {
      const b = (bgShowLeft || x >= 8) ? bgpix[x] : 0;
      const s = (sprShowLeft || x >= 8) ? sprpix[x] : 0;
      let ci;
      if (s && (sprprio[x] === 0 || b === 0)) ci = pal[0x10 + sprpal[x] * 4 + s];
      else if (b) ci = pal[bgpal[x] * 4 + b];
      // $3F00 is the UNIVERSAL BACKDROP: every transparent pixel takes it, not
      // the colour-0 entry of its own palette. Invisible on stage 1, where all
      // eight entry-0 slots read $0F -- which is exactly why it is written down
      // rather than discovered later on a screen where it is not.
      else ci = breaks.has('backdrop') ? pal[bgpal[x] * 4] : pal[0];
      out[o + x] = NES_RGBA[ci & 0x3F];
    }
  }
  return out;
}

/**
 * Assemble the frame record the renderer wants from the port's state.
 *
 * $8AA8 = `30 32 31 33`, bank = byte & 3, so the CNROM selector $2D maps
 * 0 -> bank 0, 1 -> bank 2, 2 -> bank 1, 3 -> bank 3. Band A uses $2D ($8A9C:
 * LDY $2D); band B is always `LDY #$02` at $9ABF, i.e. bank 1.
 */
export const CHR_LATCH_TABLE = [0x30, 0x32, 0x31, 0x33];   // $8AA8
export const chrBank = (sel) => CHR_LATCH_TABLE[sel & 3] & 3;

export function frameFor(state) {
  return {
    bandA: state.bandA,
    bandB: state.bandB,
    nt: state.vram.nt,
    pal: state.vram.pal,
    oam: state.hwOam,
  };
}
