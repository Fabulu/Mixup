// THE FRAME.  `igs023_video.cpp::screen_update` (tag mame0289), in the port.
//
// THE TWO SAMPLE-POINT OFFSETS, measured in `00-recon-assets.md` §4 and NOT to
// be re-derived.  They are properties of WHEN the oracle reads the machine, so
// they belong to every comparison this renderer is ever put into:
//
//   1. `emu.add_machine_frame_notifier` fires AFTER the game's vblank IRQ has
//      already written the next frame's video state, so the tilemaps, scroll
//      registers and sprite buffer dumped at video frame N are what MAME DRAWS
//      in frame N+1.
//   2. The PALETTE is different.  `screen:pixels()` resolves the indexed bitmap
//      to RGB at the END of the frame, so the palette that applies to the
//      picture is frame N+1's, not N's.  Measured: state f5500 with palette
//      f5500 -> 17.836 % of pixels correct; with palette f5501 -> 100.000 %.
//      ONLY A PALETTE-FADE FRAME EXPOSES THE DIFFERENCE, which is why the wave-6
//      gate is required to contain one.
//
// And one thing MAME does NOT do, which bounds what any comparison here can
// mean: `bg_scale` ($B04000) is unimplemented (`igs023_video.cpp:193`, "TODO:
// not implemented, unknown algorithm").  Wave 3 measured the PGM BIOS writing
// 0x0610 during boot.  A frame drawn with bg_scale != 0x210 is a frame MAME
// rendered without a feature the hardware has, so 100 % there would be
// agreement between two wrong pictures.  `pixgate.mjs` FAILS such a pair
// instead of scoring it.

import { TileCache, buildBgMap, buildTxMap, BGMAP_W, TXMAP_W, TRANSPARENT } from './tiles.js';
import { parseSpriteList, BUFFER_STRIDE, SPRITE_LIMIT } from './spritelist.js';
import { SpriteDrawer, zoomWord } from './sprites.js';

export const SCREEN_W = 448, SCREEN_H = 224;   // MAME's visible area; the
// cabinet is TATE, so the game's "vertical" axis is this bitmap's X.
export const FILL_PEN = 0x3ff;                 // igs023_video.cpp:772

export class Renderer {
  /**
   * @param {{igs023:Uint8Array, sprcol:Uint16Array, sprmask:Uint16Array}} roms
   * @param {object} opts  decoder overrides.  EVERY one of these exists so that
   *   `tools/pixgate.mjs`'s red validation can break exactly one rule and watch
   *   the gate fail (`docs/knowledge/03`: a check that has never been seen fail
   *   is not evidence).  Nothing in the port may pass a non-default value.
   */
  constructor(roms, opts = {}) {
    this.roms = roms;
    this.opts = opts;
    this.cache = new TileCache(roms, opts);
    this.bgmap = null;
    this.txmap = null;
    this.bitmap = new Uint16Array(SCREEN_W * SCREEN_H);
    this.pri = new Uint8Array(SCREEN_W * SCREEN_H);
    // Rebuild the tile MAPS only when their videoram changed.  A pure cache:
    // it can make the renderer faster and cannot make it disagree, because the
    // key is the videoram bytes themselves.
    this._bgKey = -1;
    this._txKey = -1;
  }

  /** @param {Uint16Array} a */
  static _key(a) {
    // FNV-1a over the words.  Only used to decide whether to rebuild a cache.
    let h = 0x811c9dc5;
    for (let i = 0; i < a.length; i++) {
      h ^= a[i];
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * One frame -> palette indexes.
   * @param {object} st  { bg, tx, rowscroll, zoomram, spritebuffer, regs }
   *                     -- the state of video frame N.
   * @returns {Uint16Array} SCREEN_H * SCREEN_W palette indexes
   */
  renderIndexed(st, {
    wantBg = true, wantSpr = true, wantTx = true,
    spriteOrderReversed = true, zoomWordFn = zoomWord, maskBitOpaque = false,
    ignoreBgPriority = false, scrollSign = 1, spriteStride = BUFFER_STRIDE,
  } = {}) {
    const regs = st.regs;
    const ctrl = regs.ctrl;
    const bm = this.bitmap, pri = this.pri;
    bm.fill(FILL_PEN);
    pri.fill(0);

    // --- BG: 64x16 tiles of 32x32, per-row scroll.  ctrl bit 12 disables it.
    if (wantBg && !(ctrl & (1 << 12))) {
      const k = Renderer._key(st.bg);
      if (k !== this._bgKey || this.bgmap === null) {
        this.bgmap = buildBgMap(this.cache, st.bg, this.bgmap ?? undefined);
        this._bgKey = k;
      }
      const map = this.bgmap;
      const ys = regs.bg_yscroll, xs = regs.bg_xscroll, rs = st.rowscroll;
      for (let y = 0; y < SCREEN_H; y++) {
        const srcy = (y + ys) & 0x1ff;
        const sx = (xs + rs[y]) & 0x7ff;
        const ro = srcy * BGMAP_W;
        const o = y * SCREEN_W;
        for (let x = 0; x < SCREEN_W; x++) {
          const v = map[ro + ((x + scrollSign * sx) & 0x7ff)];
          if (v !== TRANSPARENT) { bm[o + x] = v; pri[o + x] |= 2; }
        }
      }
    }

    // --- SPRITES.  The list is walked BACKWARDS and first-drawn-wins, so a
    //     HIGHER list index draws IN FRONT (00-recon-assets.md §3).
    //     ctrl bit 13 set = draw only records whose pri bit is set.
    if (wantSpr) {
      const sprites = parseSpriteList(st.spritebuffer, spriteStride);
      const privateBanks = st.spritePrivatePaletteBanks;
      if (privateBanks != null) {
        if (!(privateBanks instanceof Int8Array) || privateBanks.length < SPRITE_LIMIT) {
          throw new TypeError(`spritePrivatePaletteBanks must contain ${SPRITE_LIMIT} signed bytes`);
        }
        const base = st.spritePrivatePaletteBase ?? 0x1000;
        if (!Number.isSafeInteger(base) || base < 0) {
          throw new RangeError('spritePrivatePaletteBase must be a nonnegative integer');
        }
        for (const sprite of sprites) {
          const bank = privateBanks[sprite.i];
          if (bank >= 0) sprite.paletteBase = base + bank * 32;
        }
      }
      const drawer = new SpriteDrawer(this.roms, bm, pri, SCREEN_W, SCREEN_H,
        { maskBitOpaque, ignoreBgPriority });
      const hideLow = ((ctrl >> 13) & 1) !== 0;
      if (spriteOrderReversed) {
        for (let i = sprites.length - 1; i >= 0; i--) {
          if (hideLow && !sprites[i].pri) continue;
          drawer.draw(sprites[i], st.zoomram, zoomWordFn);
        }
      } else {
        for (let i = 0; i < sprites.length; i++) {
          if (hideLow && !sprites[i].pri) continue;
          drawer.draw(sprites[i], st.zoomram, zoomWordFn);
        }
      }
    }

    // --- TX: 64x32 tiles of 8x8, flat scroll, drawn LAST and over everything.
    //     ctrl bit 11 disables it.
    if (wantTx && !(ctrl & (1 << 11))) {
      const k = Renderer._key(st.tx);
      if (k !== this._txKey || this.txmap === null) {
        this.txmap = buildTxMap(this.cache, st.tx, this.txmap ?? undefined);
        this._txKey = k;
      }
      const map = this.txmap;
      const ys = regs.tx_yscroll & 0xff, xs = regs.tx_xscroll & 0x1ff;
      for (let y = 0; y < SCREEN_H; y++) {
        const ro = ((y + ys) & 0xff) * TXMAP_W;
        const o = y * SCREEN_W;
        for (let x = 0; x < SCREEN_W; x++) {
          const v = map[ro + ((x + scrollSign * xs) & 0x1ff)];
          if (v !== TRANSPARENT) bm[o + x] = v;
        }
      }
    }
    return bm;
  }
}

/**
 * xRGB_555 -> RGB triples, MAME's `pal5bit` expansion `(v<<3)|(v>>2)`.
 * @param {Uint16Array} pal
 * @returns {Uint8Array} pal.length * 3
 */
export function paletteRgb(pal, out = new Uint8Array(pal.length * 3)) {
  for (let i = 0; i < pal.length; i++) {
    const v = pal[i];
    const r = (v >> 10) & 0x1f, g = (v >> 5) & 0x1f, b = v & 0x1f;
    out[i * 3] = (r << 3) | (r >> 2);
    out[i * 3 + 1] = (g << 3) | (g >> 2);
    out[i * 3 + 2] = (b << 3) | (b >> 2);
  }
  return out;
}

/** Palette indexes + a palette -> packed RGB, clamped exactly as numpy's
 *  `pal[np.clip(idx, 0, len(pal)-1)]` in `framerender.py`. */
export function resolveRgb(indexed, palRgb, out = new Uint8Array(indexed.length * 3)) {
  const n = (palRgb.length / 3) | 0;
  for (let i = 0; i < indexed.length; i++) {
    let p = indexed[i];
    if (p >= n) p = n - 1;
    out[i * 3] = palRgb[p * 3];
    out[i * 3 + 1] = palRgb[p * 3 + 1];
    out[i * 3 + 2] = palRgb[p * 3 + 2];
  }
  return out;
}

/** MAME's `screen:pixels()` is ARGB32 little-endian: B,G,R,A per pixel. */
export function mamePixelsToRgb(raw, w = SCREEN_W, h = SCREEN_H,
  out = new Uint8Array(w * h * 3)) {
  for (let i = 0; i < w * h; i++) {
    out[i * 3] = raw[i * 4 + 2];
    out[i * 3 + 1] = raw[i * 4 + 1];
    out[i * 3 + 2] = raw[i * 4];
  }
  return out;
}

/**
 * The cabinet is TATE.  `framerender.py` writes its PNGs through
 * `np.rot90(img, 1)`; this is the same rotation, so a browser canvas and a
 * gate PNG show the same picture the right way up.
 * out[y][x] (x in 0..h-1, y in 0..w-1) = src[x][w-1-y].
 */
export function rotateCCW(rgb, w = SCREEN_W, h = SCREEN_H,
  out = new Uint8Array(w * h * 3)) {
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < h; x++) {
      const s = (x * w + (w - 1 - y)) * 3;
      const d = (y * h + x) * 3;
      out[d] = rgb[s]; out[d + 1] = rgb[s + 1]; out[d + 2] = rgb[s + 2];
    }
  }
  return out;
}

/** RGB triples -> RGBA for a canvas ImageData. */
export function rgbToRgba(rgb, out = new Uint8ClampedArray((rgb.length / 3) * 4)) {
  for (let i = 0, n = rgb.length / 3; i < n; i++) {
    out[i * 4] = rgb[i * 3];
    out[i * 4 + 1] = rgb[i * 3 + 1];
    out[i * 4 + 2] = rgb[i * 3 + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}
