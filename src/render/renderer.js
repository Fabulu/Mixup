// Scanline compositor.  Not a PPU emulator -- it consumes our own state and
// reproduces the DMG layering rules that the picture depends on.
//
// ROM behaviour reproduced: signed $8800 BG tile addressing, 8x16 OBJ always,
// per-scanline SCX/SCY/BGP/OBP bands (the STAT raster program at $0857), and
// sub_00_0BC6's sprite ordering (OAM order = call order, cap 40, no sorting).

import { cameraPixels } from '../camera.js';
import { metatileTile } from '../level.js';
import { mapTile } from '../state.js';

export const SCREEN_W = 160;
export const SCREEN_H = 144;
export const MAX_SPRITES = 40;

// Classic DMG green, as RGBA. Shade 0 is lightest.
export const DMG_PALETTE = [
  [0xE0, 0xF8, 0xD0, 0xFF],
  [0x88, 0xC0, 0x70, 0xFF],
  [0x34, 0x68, 0x56, 0xFF],
  [0x08, 0x18, 0x20, 0xFF],
];

/** BGP/OBP register byte -> [shade0..3] */
const palMap = (reg) => [reg & 3, (reg >> 2) & 3, (reg >> 4) & 3, (reg >> 6) & 3];

export function createFramebuffer() {
  return {
    // One byte per pixel: the resolved SHADE (0-3), not the colour index.
    shades: new Uint8Array(SCREEN_W * SCREEN_H),
    rgba: new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4),
    // Scratch for sprite priority; hoisted so the frame loop allocates nothing.
    claimed: new Uint8Array(SCREEN_W * SCREEN_H),
  };
}

/**
 * The raster program: one band per scanline range.  P1 emits a single band;
 * the STAT modes (water wobble, parallax) will emit many (P4).
 * ROM: sub_00_0857 state machine on $FFC7.
 */
export function rasterBands(state) {
  const cam = cameraPixels(state);
  return [{
    from: 0,
    scx: cam.x,
    scy: cam.y,
    bgp: state.video.bgp,
    obp0: state.video.obp0,
    obp1: state.video.obp1,
  }];
}

export function renderFrame(state, fb) {
  const bands = rasterBands(state);
  drawBackground(state, fb, bands);
  drawSprites(state, fb, bands);
  toRGBA(fb);
}

function bandFor(bands, line) {
  let b = bands[0];
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].from <= line) b = bands[i]; else break;
  }
  return b;
}

/**
 * Background.  Reads the level map directly rather than a 32x32 VRAM tilemap:
 * the game streams metatile columns into VRAM as the camera moves, and
 * sampling the map is the same picture without the streaming bookkeeping.
 * (The VRAM tilemap path returns in P4 for the menu/VRAM-script screens.)
 */
function drawBackground(state, fb, bands) {
  const { tiles, width } = state.level;
  const shades = fb.shades;

  for (let y = 0; y < SCREEN_H; y++) {
    const band = bandFor(bands, y);
    const bgp = palMap(band.bgp);
    const worldY = band.scy + y;
    const row = (worldY >> 4) & 0x0F;
    const subRow = (worldY >> 3) & 1;
    const tileY = worldY & 7;
    let x = 0;

    while (x < SCREEN_W) {
      const worldX = band.scx + x;
      const col = worldX >> 4;
      const subCol = (worldX >> 3) & 1;
      const tileX = worldX & 7;

      let tile;
      if (col < 0 || col >= width) {
        tile = null;
      } else {
        const mid = mapTile(state, col, row);
        tile = tiles.bg[metatileTile(state, mid, subCol, subRow) & 0xFF];
      }

      // Emit the rest of this 8-pixel tile run in one go.
      const run = Math.min(8 - tileX, SCREEN_W - x);
      const base = y * SCREEN_W + x;
      if (tile) {
        const rowBase = tileY * 8 + tileX;
        for (let i = 0; i < run; i++) shades[base + i] = bgp[tile[rowBase + i]];
      } else {
        for (let i = 0; i < run; i++) shades[base + i] = bgp[0];
      }
      x += run;
    }
  }
}

/**
 * Sprites.  ROM: sub_00_0BC6 appends to shadow OAM in call order and caps at
 * 40; DMG priority is lowest-OAM-index-wins, and attr bit 7 puts the sprite
 * behind non-zero BG pixels.  OBJ is 8x16 at every LCDC write site, so each
 * entry draws tile&$FE on top of tile|$01.
 */
function drawSprites(state, fb, bands) {
  const { tiles } = state.level;
  const shades = fb.shades;
  const list = state.video.sprites;
  const n = Math.min(list.length, MAX_SPRITES);

  // Track which pixels a sprite has already claimed, so the earlier OAM entry
  // wins on overlap (DMG priority).
  const claimed = fb.claimed;
  claimed.fill(0);

  for (let i = 0; i < n; i++) {
    const s = list[i];
    const flipX = (s.attr & 0x20) !== 0;
    const flipY = (s.attr & 0x40) !== 0;
    const behind = (s.attr & 0x80) !== 0;
    const topTile = tiles.obj[s.tile & 0xFE];
    const botTile = tiles.obj[s.tile | 0x01];

    for (let py = 0; py < 16; py++) {
      const sy = s.y + py;
      if (sy < 0 || sy >= SCREEN_H) continue;

      const band = bandFor(bands, sy);
      const pal = palMap((s.attr & 0x10) ? band.obp1 : band.obp0);
      const srcY = flipY ? 15 - py : py;
      const tile = srcY < 8 ? topTile : botTile;
      const ty = srcY & 7;
      if (!tile) continue;

      for (let px = 0; px < 8; px++) {
        const sx = s.x + px;
        if (sx < 0 || sx >= SCREEN_W) continue;
        const idx = sy * SCREEN_W + sx;
        if (claimed[idx]) continue;

        const srcX = flipX ? 7 - px : px;
        const ci = tile[ty * 8 + srcX];
        if (ci === 0) continue;              // colour 0 is transparent for OBJ
        claimed[idx] = 1;
        if (behind && shades[idx] !== 0) continue;
        shades[idx] = pal[ci];
      }
    }
  }
}

function toRGBA(fb) {
  const { shades, rgba } = fb;
  for (let i = 0; i < shades.length; i++) {
    const c = DMG_PALETTE[shades[i]];
    const o = i * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
  }
}
