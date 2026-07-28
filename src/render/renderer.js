// Scanline compositor.  Not a PPU emulator -- it consumes our own state and
// reproduces the DMG layering rules that the picture depends on.
//
// ROM behaviour reproduced: signed $8800 BG tile addressing, 8x16 OBJ always,
// per-scanline SCX/SCY/BGP/OBP bands (the STAT raster program at $0857), and
// sub_00_0BC6's sprite ordering (OAM order = call order, cap 40, no sorting).

import { squashBands, parallaxBands } from '../raster.js';
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
  const base = {
    from: 0,
    scx: cam.x,
    scy: cam.y,
    bgp: state.video.bgp,
    obp0: state.video.obp0,
    obp1: state.video.obp1,
  };
  // Mode 7 (loc_00_0935) is the OPTIONS squash: one band PER SCANLINE, each
  // scrolled a little further than the last. The loop below already resolves
  // bandFor(bands, y) per scanline, so this needs nothing else -- and the same
  // door is open for modes 1-6 when the level raster bands land.
  if (state.raster && state.raster.mode === 7) {
    const { bands, handoff } = squashBands(state, base, SCREEN_H);
    // $0953: where the squash reaches $44 the window takes over, and the
    // options panel starts on exactly that line.
    if (handoff !== null) {
      state.video.windowY = handoff;
      state.video.windowLatchY = handoff;   // the field drawWindow reads
    }
    return bands;
  }
  if (state.raster && state.raster.mode === 2) return parallaxBands(state, base);
  return [base];
}

export function renderFrame(state, fb) {
  const bands = rasterBands(state);
  drawBackground(state, fb, bands);
  drawWindow(state, fb, bands);
  drawSprites(state, fb, bands);
  toRGBA(fb, state.video);
}

/**
 * The window layer -- which, in this game, IS the water.
 *
 * ROM: rWY/rWX from $FFAC/$FFAB ($080D), tilemap $9C00, enabled by LCDC bit 5
 * -- and LCDC is $E7 at every single write site, so the window is never
 * actually switched off. It is parked off-screen at $90 instead. Level init
 * fills the entire $9C00 map with tile $01 ($04C9 covers $9C40-$9FFF, $0E0C
 * the first two rows) and nothing ever writes another value, so the layer is a
 * flat slab of one tile. Tile $01 is `FF` sixteen times: solid darkest shade.
 *
 * It draws OVER the background and UNDER sprites, which is why Batman stays
 * visible while he is in it.
 *
 * The top two map rows are a textured SURFACE (tiles $E0/$E2 over $E1/$E3,
 * alternating every 8 px) and the rest is the solid fill. The surface tiles
 * are animated, but nothing here has to know that: water.js patches the
 * animated bitmaps straight into the level's tile cache, exactly as the
 * hardware streamer patches VRAM, so this reads them like any other tile.
 *
 * THE 50% DITHER ON THE BODY IS DELIBERATE, and it is the one place this
 * renderer departs from the register stream. sub_00_2CBE only computes the
 * window position on EVEN frames; odd frames park rWY at $90 ($2D65). So the
 * hardware alternates "slab" and "no slab" at 30 Hz, and a DMG's slow LCD
 * integrates that into a translucent wash -- the only transparency the machine
 * can do. A modern display has no such persistence, so reproducing the
 * register stream literally gives a violent 30 Hz strobe over a third of the
 * screen: wrong to look at, and a real problem for photosensitive players. The
 * alternation is reproduced SPATIALLY instead -- a static checkerboard, every
 * frame, from the latched surface position.
 *
 * The animated SURFACE rows are drawn solid, not dithered: they are detailed
 * artwork rather than a flat black slab, and dithering them destroys the
 * texture that makes the water read as water.
 */
function drawWindow(state, fb, bands) {
  const v = state.video;
  // The LATCH, not the register: the register is $90 on odd frames and the
  // surface must not jump about between them.
  const wy = v.windowLatchY;
  if (wy === undefined || wy >= SCREEN_H) return;      // parked off-screen

  // rWX is offset by 7: WX = 7 puts the window's left edge at screen x 0, and
  // anything below 7 still starts at 0 rather than wrapping.
  const left = Math.max(0, (v.windowX | 0) - 7);
  const map = v.windowMap;
  const bgTiles = state.level.tiles.bg;
  const fallback = bgTiles[v.windowTile & 0xFF];
  // No captured tilemap means no water art. Painting the flat fill tile
  // anyway gives an opaque black slab -- worse than drawing nothing, and it
  // hides the real problem. Bail instead.
  if (!map || !fallback) return;

  const shades = fb.shades;
  for (let y = Math.max(0, wy); y < SCREEN_H; y++) {
    // The window runs its own line counter from 0 at its first visible line;
    // it does NOT follow SCY.
    const wline = y - wy;
    const mapRow = (wline >> 3) & 31;
    const tileY = wline & 7;
    const bgp = palMap(bandFor(bands, y).bgp);
    const rowBase = y * SCREEN_W;

    // The dither is a WATER approximation, not a property of the window: on
    // hardware the window is always opaque. Rows 0-1 are the water's artwork
    // surface and stay solid; the body below is drawn on alternating pixels so
    // the background reads through it.
    //
    // Any other window user -- the OPTIONS panel -- must NOT get it, or the
    // background stripes straight through the menu.
    const solid = !v.windowDither || mapRow < 2;
    const step = solid ? 1 : 2;
    const start = solid ? left : left + ((y ^ left) & 1);

    for (let x = start; x < SCREEN_W; x += step) {
      const wx = x - left;
      let tile = fallback;
      if (map) tile = bgTiles[map[mapRow * 32 + ((wx >> 3) & 31)]] || fallback;
      if (!tile) continue;
      shades[rowBase + x] = bgp[tile[tileY * 8 + (wx & 7)]];
    }
  }
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
  const bgMap = state.video.bgMap;

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
      if (bgMap) {
        // Menu/title screens have no level map -- they are a plain 32x32 VRAM
        // tilemap at $9800, wrapping in both axes exactly as the hardware does.
        const t = bgMap[((worldY >> 3) & 31) * 32 + ((worldX >> 3) & 31)];
        tile = tiles.bg[t];
      } else if (col < 0 || col >= width) {
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

    // Sprites are 8x16 on hardware; `scale` is a mod-only magnification that
    // plots each source pixel as a scale x scale block.
    const sc = s.scale || 1;
    const H = 16 * sc, W = 8 * sc;

    for (let py = 0; py < H; py++) {
      const sy = s.y + py;
      if (sy < 0 || sy >= SCREEN_H) continue;

      const band = bandFor(bands, sy);
      const pal = palMap((s.attr & 0x10) ? band.obp1 : band.obp0);
      const srcYs = ((flipY ? H - 1 - py : py) / sc) | 0;
      const tile = srcYs < 8 ? topTile : botTile;
      const ty = srcYs & 7;
      if (!tile) continue;

      for (let px = 0; px < W; px++) {
        const sx = s.x + px;
        if (sx < 0 || sx >= SCREEN_W) continue;
        const idx = sy * SCREEN_W + sx;
        if (claimed[idx]) continue;

        const srcX = ((flipX ? W - 1 - px : px) / sc) | 0;
        const ci = tile[ty * 8 + srcX];
        if (ci === 0) continue;              // colour 0 is transparent for OBJ
        claimed[idx] = 1;
        if (behind && shades[idx] !== 0) continue;
        shades[idx] = pal[ci];
      }
    }
  }
}

/**
 * Shade -> RGBA. Mods hook in here rather than at pixel-compose time, so
 * `invert` and `paletteRotate` cost one LUT rebuild per frame instead of a
 * branch per pixel.
 */
function toRGBA(fb, video) {
  const { shades, rgba } = fb;

  let lut = DMG_PALETTE;
  const rot = (video && video.paletteRotate) | 0;
  const inv = video && video.invert;
  if (inv || rot) {
    lut = [0, 1, 2, 3].map((s) => {
      const t = (inv ? 3 - s : s);
      return DMG_PALETTE[(t + rot) & 3];
    });
  }

  for (let i = 0; i < shades.length; i++) {
    const c = lut[shades[i]];
    const o = i * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
  }
}
