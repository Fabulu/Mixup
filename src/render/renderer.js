// Scanline compositor.  Not a PPU emulator -- it consumes our own state and
// reproduces the DMG layering rules that the picture depends on.
//
// ROM behaviour reproduced: signed $8800 BG tile addressing, 8x16 OBJ always,
// per-scanline SCX/SCY/BGP/OBP bands (the STAT raster program at $0857), and
// sub_00_0BC6's sprite ordering (OAM order = call order, cap 40, no sorting).

import { squashBands, parallaxBands, trackBands, waterBands,
         rasterModeForLevel, RASTER_TRACK, RASTER_PARALLAX, RASTER_WINDOW_OFF,
         RASTER_WATER, RASTER_SQUASH } from '../raster.js';
import { cameraPixels } from '../camera.js';
import { metatileTile } from '../level.js';
import { mapTile } from '../state.js';
import { bgArtForLevel } from '../assets.js';

export const SCREEN_W = 160;
export const SCREEN_H = 144;
export const MAX_SPRITES = 40;
/**
 * DMG OAM scan: at most TEN sprites are fetched per scanline, in OAM order,
 * and everything after the tenth is DROPPED for that line only.  The selection
 * is made on Y alone -- an entry parked off the left edge or drawing nothing
 * but colour 0 still spends a slot.
 */
export const MAX_SPRITES_PER_LINE = 10;

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
    // The BG/window COLOUR INDEX (0-3) before BGP was applied.  OBJ attr bit 7
    // compares against this, not against the resolved shade -- see drawSprites.
    bgIndex: new Uint8Array(SCREEN_W * SCREEN_H),
    // Per-scanline OAM budget, for the hardware ten-sprite cut.
    lineCount: new Uint8Array(SCREEN_H),
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
  // $0857's eight-way dispatch.  Every arm resolves to a band list; the loop
  // below already resolves bandFor(bands, y) per scanline, so even the
  // 144-band arms need no renderer change.
  //
  // WHERE THE MODE COMES FROM, and why it is two places.  Modes 5 and 7 belong
  // to SCREENS (the stage-clear picture, the options transition) and are
  // written by those screens, so they are read from state.raster.mode.  Modes
  // 0, 2 and 6 belong to LEVELS, and on the cartridge they are a pure function
  // of $FFB0 decided once at $0E74 -- so they are derived from the level
  // number here, which is the same rule and cannot be got half-right by a
  // frame loop that has not been taught about them.
  const mode = state.raster ? state.raster.mode : RASTER_TRACK;

  if (mode === RASTER_SQUASH) {
    const { bands, handoff } = squashBands(state, base, SCREEN_H);
    // $0953: where the squash reaches $44 the window takes over, and the
    // options panel starts on exactly that line.
    if (handoff !== null) {
      state.video.windowY = handoff;
      state.video.windowLatchY = handoff;   // the field drawWindow reads
    }
    return bands;
  }
  // The menus are not levels; $0E74 never ran for them and $FFB0 still holds
  // whatever the last level was. The stage-intro card counts: $3386 writes
  // rIE = $05, masking the STAT vector off, and it runs BEFORE level init --
  // so without it here the card inherits the previous level's arm and tries
  // to run, say, the levels-1/2 water band over a menu screen.
  if (state.copyright || state.title || state.options || state.roundSelect
      || state.stageIntro || state.ending) {
    return [base];
  }

  switch (rasterModeForLevel(state.level ? state.level.number : 0)) {
    case RASTER_PARALLAX: return parallaxBands(state, base);
    case RASTER_TRACK: return trackBands(state, base);
    case RASTER_WATER: return waterBands(state, base, SCREEN_H);
    default: return [base];          // $0F1F: rIE = $05, STAT masked off
  }
}

/**
 * MODE 5 (loc_00_08EA) is the whole of one arm: `rWX = $A8`, and it never
 * re-arms rLYC.  Its rLYC is $90 ($35BA), i.e. VBlank -- and the VBlank ISR
 * pushes $FFAB to rWX first ($080A), so the STAT write always wins and holds
 * for the entire visible frame.  The net effect is not per-scanline at all:
 * it is "the window is off, whatever $FFAB says".
 *
 * That is the stage-clear picture's arm.  The picture itself (loc_00_34D0's
 * bank-6 VRAM blocks) is not ported, so this is here to keep the arm honest
 * rather than because anything reaches it yet.
 */
function windowSuppressed(state) {
  return !!state.raster && state.raster.mode === RASTER_WINDOW_OFF;
}

/**
 * @param opts.spritesPerLine  overrides the DMG ten-per-line cut.  It exists so
 *   tools/oracle/spritelimit.mjs can render the SAME frame with the rule off
 *   and watch the comparison go red -- a check nobody has made fail is a
 *   decoration.  Nothing in the game passes it.
 */
export function renderFrame(state, fb, opts) {
  const bands = rasterBands(state);
  drawBackground(state, fb, bands);
  drawWindow(state, fb, bands);
  drawSprites(state, fb, bands, opts);
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
  if (windowSuppressed(state)) return;                 // $08EA: rWX = $A8

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

  // $FFC7 = 5 is loc_00_08EA, whose whole body is `rWX = $A8` -- the LYC
  // interrupt switches the window OFF partway down rather than moving it. So
  // rWY is the TOP of a band and rLYC is its BOTTOM, and the STAGE CLEAR
  // banner is a band, not a slab. null/undefined means "no cut": the water
  // surface and the options panel both run to the bottom of the screen, and
  // without that distinction they would be clipped to nothing.
  const end = v.windowEndY == null
    ? SCREEN_H
    : Math.min(SCREEN_H, v.windowEndY);

  const shades = fb.shades;
  const bgIndex = fb.bgIndex;
  for (let y = Math.max(0, wy); y < end; y++) {
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
      // The window IS background as far as OBJ priority is concerned, so the
      // colour index it leaves behind is what attr bit 7 compares against.
      const ci = tile[tileY * 8 + (wx & 7)];
      bgIndex[rowBase + x] = ci;
      shades[rowBase + x] = bgp[ci];
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
 * The overlay a level's init-time VRAM scripts leave in the $9800 tilemap, or
 * null.  Menus and title screens carry their own whole tilemap in `bgMap`, so
 * the overlay is a LEVEL-only thing and must not follow $FFB0's leftovers into
 * one of them.  `state.level.bgArt`, if something upstream has attached it,
 * wins -- including an explicit null, which is how a mod switches it off.
 */
export function bgArtFor(state) {
  if (state.video.bgMap) return null;
  if (state.level.bgArt !== undefined) return state.level.bgArt;
  return bgArtForLevel(state.level.number);
}

/**
 * WHICH TILE ID a screen pixel's 8x8 cell comes from -- the single place that
 * decision is made, so tools/oracle/bgartdiff.mjs can compare the real one
 * against the cartridge's $9800 rather than against a second copy of this rule.
 * Returns -1 for "off the map, draw colour 0".
 */
export function bgTileIdAt(state, worldX, worldY, art) {
  // The overlay is a TILEMAP cell, so it is looked up in tilemap space -- the
  // same ((worldY >> 3) & 31, (worldX >> 3) & 31) the hardware indexes $9800
  // with -- and it wins over the streamed column, because on the cartridge it
  // is what is physically in that cell.  On level 6 that distinction is the
  // whole fix: the track band is displayed through the mode-0/1 arm at
  // SCX = $FFCC, so a world-space lookup would slide it sideways.
  const cell = ((worldY >> 3) & 31) * 32 + ((worldX >> 3) & 31);
  if (art) {
    const t = art[cell];
    if (t >= 0) return t;
  }
  // Menu/title screens have no level map -- they are a plain 32x32 VRAM
  // tilemap at $9800, wrapping in both axes exactly as the hardware does.
  const bgMap = state.video.bgMap;
  if (bgMap) return bgMap[cell];

  const col = worldX >> 4;
  if (col < 0 || col >= state.level.width) return -1;
  const mid = mapTile(state, col, (worldY >> 4) & 0x0F);
  return metatileTile(state, mid, (worldX >> 3) & 1, (worldY >> 3) & 1) & 0xFF;
}

/**
 * Background.  Reads the level map directly rather than a 32x32 VRAM tilemap:
 * the game streams metatile columns into VRAM as the camera moves, and
 * sampling the map is the same picture without the streaming bookkeeping.
 * (The VRAM tilemap path serves the menu/VRAM-script screens.)
 *
 * The one place that equivalence breaks is a cell the streamer never wrote,
 * which is what bgArtFor() supplies -- see bgTileIdAt.
 */
function drawBackground(state, fb, bands) {
  const { tiles } = state.level;
  const shades = fb.shades;
  const bgIndex = fb.bgIndex;
  const art = bgArtFor(state);

  for (let y = 0; y < SCREEN_H; y++) {
    const band = bandFor(bands, y);
    const bgp = palMap(band.bgp);
    const worldY = band.scy + y;
    const tileY = worldY & 7;
    let x = 0;

    while (x < SCREEN_W) {
      const worldX = band.scx + x;
      const tileX = worldX & 7;

      const id = bgTileIdAt(state, worldX, worldY, art);
      const tile = id < 0 ? null : tiles.bg[id];

      // Emit the rest of this 8-pixel tile run in one go.
      const run = Math.min(8 - tileX, SCREEN_W - x);
      const base = y * SCREEN_W + x;
      if (tile) {
        const rowBase = tileY * 8 + tileX;
        for (let i = 0; i < run; i++) {
          const ci = tile[rowBase + i];
          bgIndex[base + i] = ci;
          shades[base + i] = bgp[ci];
        }
      } else {
        for (let i = 0; i < run; i++) {
          bgIndex[base + i] = 0;
          shades[base + i] = bgp[0];
        }
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
 *
 * TWO HARDWARE RULES THE OBVIOUS COMPOSITOR GETS WRONG:
 *
 * 1. **Attr bit 7 compares the BG COLOUR INDEX, not the resolved shade.** The
 *    PPU's priority mux runs before the palette: the sprite loses only where
 *    the BG pixel's index is non-zero.  `shades[idx] !== 0` agrees with that
 *    for as long as BGP maps index 0 to shade 0 -- which BGP = $E4 does, and
 *    $E4 is what every level runs.  It stops agreeing the moment a screen
 *    changes BGP: level 14's blackout writes BGP = $FF, every index resolves
 *    to shade 3, and a shade-based test hides every behind-BG sprite on the
 *    screen.
 *
 *    Be honest about what is PROVEN here, because no pixel comparison in the
 *    tree can tell the two rules apart today: across every rip/oracle/pix
 *    recording, BGP only ever takes $E4 or $FF, 180 of 5508 OAM entries carry
 *    bit 7 -- and all 180 are level 10, where BGP is $E4.  The two frames that
 *    do run BGP = $FF (level 14, blacked out) contain six OAM entries and not
 *    one of them has bit 7 set.  So this change is measured to COST nothing
 *    and is a hardware fact rather than a measured difference.  It is here
 *    because the coincidence propping the old test up is one BGP write away
 *    from ending.
 *
 * 2. **Ten sprites per scanline, in OAM order.** The DMG's OAM scan takes the
 *    first ten entries whose Y covers the line and drops the rest FOR THAT
 *    LINE.  It is not a frame-level cap and it is not a rendering nicety: the
 *    dropped set changes as OAM order changes, which is exactly the flicker
 *    the cartridge shows when a line is crowded (measured: level 12 f119-122
 *    puts 21 sprites on one line, 11 of them dropped, and the drop set
 *    alternates with $FFA7 because $0567 alternates the queue order).
 */
function drawSprites(state, fb, bands, opts) {
  const perLine = (opts && opts.spritesPerLine) || MAX_SPRITES_PER_LINE;
  const { tiles } = state.level;
  const shades = fb.shades;
  const bgIndex = fb.bgIndex;
  const list = state.video.sprites;
  const n = Math.min(list.length, MAX_SPRITES);

  // Track which pixels a sprite has already claimed, so the earlier OAM entry
  // wins on overlap (DMG priority).
  const claimed = fb.claimed;
  claimed.fill(0);
  const lineCount = fb.lineCount;
  lineCount.fill(0);

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

      // The ten-per-line cut, taken BEFORE anything about the tile is known:
      // hardware spends the slot on Y alone, so a fully transparent row and a
      // missing tile both still cost one.
      if (lineCount[sy] >= perLine) continue;
      lineCount[sy]++;

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
        // Rule 1 above: the INDEX, pre-palette.
        if (behind && bgIndex[idx] !== 0) continue;
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
