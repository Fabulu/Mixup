// THE TWO TILE SETS IN THE igs023 REGION.
//
// From `igs023_video.cpp`'s GFXDECODE (tag mame0289) and `pgm.cpp`'s
// `pgm32_charlayout` / `gfx_8x8x4_packed_lsb`:
//
//   gfx0  TX  8x8   4bpp  packed_lsb            32 bytes/tile
//                          palette base 0x800, 32 palettes of 16, pen 15 clear
//   gfx1  BG  32x32 5bpp  GFXDECODE_DEVICE_REVERSEBITS
//                         640 bytes/tile
//                          palette base 0x400, 32 palettes of 32, pen 31 clear
//
// MAME numbers gfx bits MSB-first inside a byte; REVERSEBITS flips that to
// LSB-first, so the BG set is a plain LSB-first bitstream: bit b of the tile
// lives at byte `b>>3`, bit `b&7`.  planeoffset is {4,3,2,1,0}, i.e. the FIRST
// bit of a pixel is its LSB.  `pixgate.mjs --mutate bg-planes` reverses those
// weights and must go red (wave 3 measured that mutation at 72.4030 %).

export const BG_W = 32, BG_H = 32, BG_BPP = 5;
export const BG_TILE_BITS = BG_W * BG_H * BG_BPP;     // 5120 bits = 640 bytes
export const TX_W = 8, TX_H = 8, TX_TILE_BYTES = 32;

/** 32x32 of 5-bit colour indexes (0..31), row-major. */
export function bgTile(roms, index, out = new Uint8Array(BG_W * BG_H)) {
  const rom = roms.igs023;
  const base = index * BG_TILE_BITS;
  if ((base + BG_TILE_BITS) > rom.length * 8) { out.fill(0); return out; }
  for (let p = 0; p < BG_W * BG_H; p++) {
    const bit = base + p * 5;
    const q = bit >> 3, r = bit & 7;
    // 5 bits starting at r<=7 span at most two bytes: read a 16-bit window.
    out[p] = ((rom[q] | (rom[q + 1] << 8)) >> r) & 0x1f;
  }
  return out;
}

/** BG plane weights reversed -- the red-validation twin of `bgTile`. */
export function bgTileReversedPlanes(roms, index, out = new Uint8Array(BG_W * BG_H)) {
  const rom = roms.igs023;
  const base = index * BG_TILE_BITS;
  if ((base + BG_TILE_BITS) > rom.length * 8) { out.fill(0); return out; }
  for (let p = 0; p < BG_W * BG_H; p++) {
    const bit = base + p * 5;
    const q = bit >> 3, r = bit & 7;
    const v = ((rom[q] | (rom[q + 1] << 8)) >> r) & 0x1f;
    out[p] = ((v & 1) << 4) | ((v & 2) << 2) | (v & 4) | ((v & 8) >> 2) | ((v & 16) >> 4);
  }
  return out;
}

/**
 * 8x8 of 4-bit colour indexes, row-major.  packed_lsb = the LOW nibble of each
 * byte is the LEFT pixel.  `nibbleLoFirst=false` is `gfx_8x8x4_packed_msb`,
 * the mutation wave 3 measured at 95.6651 % -- a decoder that is wrong about
 * this still gets 19 pixels in 20 right, which is exactly why it is a gate.
 */
export function txTile(roms, index, out = new Uint8Array(TX_W * TX_H), nibbleLoFirst = true) {
  const rom = roms.igs023;
  const off = index * TX_TILE_BYTES;
  if (off + TX_TILE_BYTES > rom.length) { out.fill(0); return out; }
  for (let k = 0; k < TX_TILE_BYTES; k++) {
    const d = rom[off + k];
    const lo = d & 0x0f, hi = d >> 4;
    out[k * 2] = nibbleLoFirst ? lo : hi;
    out[k * 2 + 1] = nibbleLoFirst ? hi : lo;
  }
  return out;
}

/** flipyx as TILE_FLIPYX: bit0 = flip x, bit1 = flip y. */
export function flipTile(src, w, h, flipyx, out = new Uint8Array(w * h)) {
  if (!flipyx) { out.set(src); return out; }
  for (let y = 0; y < h; y++) {
    const sy = (flipyx & 2) ? (h - 1 - y) : y;
    for (let x = 0; x < w; x++) {
      const sx = (flipyx & 1) ? (w - 1 - x) : x;
      out[y * w + x] = src[sy * w + sx];
    }
  }
  return out;
}

/**
 * Decoded tiles, cached by (index, flip).  The cache is a pure function of the
 * ROM, so it survives every frame; the tile MAPS are rebuilt per frame because
 * the videoram is not.
 */
export class TileCache {
  constructor(roms, { bgTileFn = bgTile, txTileFn = txTile } = {}) {
    this.roms = roms;
    this.bgTileFn = bgTileFn;
    this.txTileFn = txTileFn;
    this.bg = new Map();
    this.tx = new Map();
  }

  bgGet(index, flipyx) {
    const key = index * 4 + flipyx;
    let t = this.bg.get(key);
    if (t === undefined) {
      t = flipTile(this.bgTileFn(this.roms, index), BG_W, BG_H, flipyx);
      this.bg.set(key, t);
    }
    return t;
  }

  txGet(index, flipyx) {
    const key = index * 4 + flipyx;
    let t = this.tx.get(key);
    if (t === undefined) {
      t = flipTile(this.txTileFn(this.roms, index), TX_W, TX_H, flipyx);
      this.tx.set(key, t);
    }
    return t;
  }
}

export const BGMAP_W = 64 * 32, BGMAP_H = 16 * 32;     // 2048 x 512
export const TXMAP_W = 64 * 8, TXMAP_H = 32 * 8;       // 512 x 256
export const TRANSPARENT = 0xffff;

/**
 * 64x16 tiles of 32x32 -> a (512, 2048) u16 map of PALETTE INDEXES.
 * `set_transparent_pen(31)` -> pen 31 becomes TRANSPARENT.
 * Attribute word: colour = (attr & 0x3e) >> 1, flipyx = (attr & 0xc0) >> 6.
 */
export function buildBgMap(cache, bgram, out = new Uint16Array(BGMAP_W * BGMAP_H)) {
  for (let ti = 0; ti < 64 * 16; ti++) {
    const tileno = bgram[ti * 2];
    const attr = bgram[ti * 2 + 1];
    const colour = (attr & 0x3e) >> 1;
    const t = cache.bgGet(tileno, (attr & 0xc0) >> 6);
    const r = (ti / 64) | 0, c = ti % 64;
    const base = 0x400 + colour * 32;
    for (let y = 0; y < 32; y++) {
      let o = (r * 32 + y) * BGMAP_W + c * 32;
      const ro = y * 32;
      for (let x = 0; x < 32; x++) {
        const v = t[ro + x];
        out[o + x] = v === 31 ? TRANSPARENT : (base + v);
      }
    }
  }
  return out;
}

/** 64x32 tiles of 8x8 -> a (256, 512) u16 map.  `set_transparent_pen(15)`. */
export function buildTxMap(cache, txram, out = new Uint16Array(TXMAP_W * TXMAP_H)) {
  for (let ti = 0; ti < 64 * 32; ti++) {
    const tileno = txram[ti * 2];
    const attr = txram[ti * 2 + 1];
    const colour = (attr & 0x3e) >> 1;
    const t = cache.txGet(tileno, (attr & 0xc0) >> 6);
    const r = (ti / 64) | 0, c = ti % 64;
    const base = 0x800 + colour * 16;
    for (let y = 0; y < 8; y++) {
      let o = (r * 8 + y) * TXMAP_W + c * 8;
      const ro = y * 8;
      for (let x = 0; x < 8; x++) {
        const v = t[ro + x];
        out[o + x] = v === 15 ? TRANSPARENT : (base + v);
      }
    }
  }
  return out;
}
