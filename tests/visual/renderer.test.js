// Exact, golden-free checks on the scanline compositor.
//
// Everything here is verified against a synthetic state whose expected output
// can be written down by hand, so these tests say WHY a golden frame moved.
// Run: node --test tests/visual/
//
// Rules under test come from docs/00-MASTER-REFERENCE.md 7.1-7.3.

import test from 'node:test';
import assert from 'node:assert/strict';

import { bgTileAddr, objTileAddr, decodeTile, buildTileCache } from '../../src/assets.js';
import {
  createFramebuffer, renderFrame, rasterBands, bgArtFor, bgTileIdAt,
  SCREEN_W, SCREEN_H, MAX_SPRITES, MAX_SPRITES_PER_LINE, DMG_PALETTE,
} from '../../src/render/renderer.js';
import { drawMetasprite } from '../../src/render/metasprite.js';

// ---------------------------------------------------------------------------
// synthetic-state helpers
// ---------------------------------------------------------------------------

/** an 8x8 tile whose every pixel is colour index `ci` */
const flatTile = (ci) => new Uint8Array(64).fill(ci);

/** an 8x8 tile whose colour index is a function of (x, y) */
function tileFn(fn) {
  const t = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) t[y * 8 + x] = fn(x, y);
  return t;
}

/**
 * Minimal state that renderFrame accepts.
 *
 * Camera: cameraPixels() is (x >> 4, (y >> 4) - 0x100), so scy 0 needs
 * camera.y = 0x1000. `scx`/`scy` here are PIXELS and are converted for you.
 */
function makeState({
  width = 24, scx = 0, scy = 0, bgp = 0xE4, obp0 = 0xE4, obp1 = 0xE4,
  metatiles = [[0, 0, 0, 0]], mapId = 0, bg = [], obj = [], sprites = [],
  windowLatchY = 0x90, windowX = 0x07, windowTile = 0x01,
  windowDither = false,
} = {}) {
  const cells = new Uint8Array(width * 16 * 2);
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < 16; r++) cells[(c * 16 + r) * 2] = mapId;
  }
  const bgTiles = new Array(256).fill(null);
  bg.forEach((t, i) => { if (t) bgTiles[i] = t; });
  const objTiles = new Array(256).fill(null);
  obj.forEach((t, i) => { if (t) objTiles[i] = t; });

  return {
    camera: { x: scx << 4, y: (scy + 0x100) << 4 },
    level: { number: 3, width, height: 16, cells, metatiles, tiles: { bg: bgTiles, obj: objTiles } },
    video: { scx, scy, bgp, obp0, obp1, sprites,
             windowLatchY, windowX, windowTile, windowDither },
  };
}

const render = (state) => {
  const fb = createFramebuffer();
  renderFrame(state, fb);
  return fb;
};
const at = (fb, x, y) => fb.shades[y * SCREEN_W + x];

// ---------------------------------------------------------------------------
// 7.1 signed $8800 BG tile addressing
// ---------------------------------------------------------------------------

test('BG tile addressing is the signed $8800 region', () => {
  assert.equal(bgTileAddr(0x00), 0x9000);
  assert.equal(bgTileAddr(0x01), 0x9010);
  assert.equal(bgTileAddr(0x7F), 0x9000 + 0x7F * 16);
  assert.equal(bgTileAddr(0x80), 0x8800);
  assert.equal(bgTileAddr(0x81), 0x8810);
  assert.equal(bgTileAddr(0xFF), 0x8800 + 0x7F * 16);
  // id < $80 lives ABOVE id >= $80 -- the whole point of the signed region.
  assert.ok(bgTileAddr(0x00) > bgTileAddr(0xFF));
});

test('OBJ tile addressing is the unsigned $8000 region', () => {
  assert.equal(objTileAddr(0x00), 0x8000);
  assert.equal(objTileAddr(0xFF), 0x8000 + 0xFF * 16);
  // BG id 0 and OBJ id 0 are different memory: a renderer that shared them
  // would silently draw OBJ graphics as background.
  assert.notEqual(bgTileAddr(0x00), objTileAddr(0x00));
});

test('buildTileCache decodes BG ids through the signed map, OBJ through $8000', () => {
  const vram = new Uint8Array(0x2000);
  const stamp = (addr, lo, hi) => {
    for (let y = 0; y < 8; y++) { vram[addr - 0x8000 + y * 2] = lo; vram[addr - 0x8000 + y * 2 + 1] = hi; }
  };
  stamp(0x9000, 0xFF, 0x00);   // BG id $00 -> colour 1 everywhere
  stamp(0x8800, 0x00, 0xFF);   // BG id $80 -> colour 2 everywhere
  stamp(0x8000, 0xFF, 0xFF);   // OBJ id $00 -> colour 3 everywhere

  const cache = buildTileCache(vram);
  assert.deepEqual([...cache.bg[0x00]], [...flatTile(1)]);
  assert.deepEqual([...cache.bg[0x80]], [...flatTile(2)]);
  assert.deepEqual([...cache.obj[0x00]], [...flatTile(3)]);
});

test('decodeTile unpacks 2bpp planes low-plane-first, MSB leftmost', () => {
  const vram = new Uint8Array(0x2000);
  vram[0x1000] = 0b10010000;   // $9000 low plane
  vram[0x1001] = 0b11000000;   // $9000 high plane
  const t = decodeTile(vram, 0x9000);
  assert.deepEqual([...t.slice(0, 8)], [3, 2, 0, 1, 0, 0, 0, 0]);
});

// ---------------------------------------------------------------------------
// 7.1 8x16 OBJ pairing
// ---------------------------------------------------------------------------

test('an OBJ entry draws tile&$FE on top of tile|$01', () => {
  const obj = [];
  obj[0x04] = flatTile(1);
  obj[0x05] = flatTile(2);
  obj[0x06] = flatTile(3);

  for (const tile of [0x04, 0x05]) {          // odd id must pair identically
    const fb = render(makeState({ obj, sprites: [{ x: 40, y: 20, tile, attr: 0 }] }));
    for (let py = 0; py < 8; py++) assert.equal(at(fb, 43, 20 + py), 1, `top row ${py}`);
    for (let py = 8; py < 16; py++) assert.equal(at(fb, 43, 20 + py), 2, `bottom row ${py}`);
  }
  // and the neighbouring even pair is untouched by the $04/$05 sprite
  const fb = render(makeState({ obj, sprites: [{ x: 40, y: 20, tile: 0x06, attr: 0 }] }));
  assert.equal(at(fb, 43, 20), 3);
});

test('OBJ flips apply within the 16-pixel pair, not per tile', () => {
  const obj = [];
  obj[0x00] = tileFn((x, y) => (y === 0 ? 1 : 0));    // marker on the TOP row
  obj[0x01] = tileFn((x, y) => (y === 7 ? 2 : 0));    // marker on the BOTTOM row

  const plain = render(makeState({ obj, sprites: [{ x: 40, y: 20, tile: 0, attr: 0 }] }));
  assert.equal(at(plain, 43, 20), 1);
  assert.equal(at(plain, 43, 35), 2);

  const flipY = render(makeState({ obj, sprites: [{ x: 40, y: 20, tile: 0, attr: 0x40 }] }));
  assert.equal(at(flipY, 43, 20), 2, 'bottom tile ends up on the first line');
  assert.equal(at(flipY, 43, 35), 1, 'top tile ends up on the last line');

  const obj2 = [];
  obj2[0x00] = tileFn((x) => (x === 0 ? 1 : 0));
  obj2[0x01] = flatTile(0);
  const flipX = render(makeState({ obj: obj2, sprites: [{ x: 40, y: 20, tile: 0, attr: 0x20 }] }));
  assert.equal(at(flipX, 47, 20), 1, 'left column mirrors to the right edge');
  assert.equal(at(flipX, 40, 20), 0);
});

// ---------------------------------------------------------------------------
// palette registers
// ---------------------------------------------------------------------------

test('BGP maps 2-bit colour indices to shades', () => {
  const bg = [tileFn((x) => x & 3)];
  const mk = (bgp) => render(makeState({ bg, metatiles: [[0, 0, 0, 0]], bgp }));

  const ident = mk(0xE4);                     // 11 10 01 00 -> 0,1,2,3
  for (let i = 0; i < 4; i++) assert.equal(at(ident, i, 0), i);

  const inverted = mk(0x1B);                  // 00 01 10 11 -> 3,2,1,0
  for (let i = 0; i < 4; i++) assert.equal(at(inverted, i, 0), 3 - i);

  const flat = mk(0x00);                      // every index -> shade 0
  for (let i = 0; i < 4; i++) assert.equal(at(flat, i, 0), 0);

  const swap = mk(0xB1);                      // 10 11 00 01 -> 1,0,3,2
  assert.deepEqual([0, 1, 2, 3].map((i) => at(swap, i, 0)), [1, 0, 3, 2]);
});

test('BG colour 0 is opaque (unlike OBJ) and goes through BGP', () => {
  const bg = [flatTile(0)];
  const fb = render(makeState({ bg, bgp: 0x1B }));   // index 0 -> shade 3
  assert.equal(at(fb, 5, 5), 3);
});

test('attr bit 4 selects OBP1, otherwise OBP0', () => {
  const obj = []; obj[0] = flatTile(1); obj[1] = flatTile(1);
  const st = (attr) => makeState({
    obj, obp0: 0xE4 /* 1 -> 1 */, obp1: 0x1B /* 1 -> 2 */,
    sprites: [{ x: 40, y: 20, tile: 0, attr }],
  });
  assert.equal(at(render(st(0x00)), 43, 22), 1);
  assert.equal(at(render(st(0x10)), 43, 22), 2);
});

// ---------------------------------------------------------------------------
// sprite priority
// ---------------------------------------------------------------------------

test('OBJ colour 0 is transparent', () => {
  const bg = [flatTile(2)];
  const obj = []; obj[0] = tileFn((x) => (x < 4 ? 0 : 3)); obj[1] = flatTile(0);
  const fb = render(makeState({ bg, obj, sprites: [{ x: 40, y: 20, tile: 0, attr: 0 }] }));
  assert.equal(at(fb, 41, 22), 2, 'index-0 sprite pixel leaves the BG alone');
  assert.equal(at(fb, 45, 22), 3, 'index-3 sprite pixel paints');
});

test('the lower OAM index wins on overlap', () => {
  const obj = []; obj[0] = flatTile(1); obj[1] = flatTile(1);
  obj[2] = flatTile(3); obj[3] = flatTile(3);
  const fb = render(makeState({
    obj,
    sprites: [{ x: 40, y: 20, tile: 0, attr: 0 },     // index 0 -> shade 1
              { x: 40, y: 20, tile: 2, attr: 0 }],    // index 1 -> shade 3
  }));
  assert.equal(at(fb, 43, 22), 1);

  const reversed = render(makeState({
    obj,
    sprites: [{ x: 40, y: 20, tile: 2, attr: 0 },
              { x: 40, y: 20, tile: 0, attr: 0 }],
  }));
  assert.equal(at(reversed, 43, 22), 3);
});

test('attr bit 7 hides the sprite only over non-zero BG pixels', () => {
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  // metatile 0 = tile 0 (BG colour 0) everywhere; metatile 1 = tile 1 (colour 2)
  const bg = [flatTile(0), flatTile(2)];

  const overBlank = render(makeState({
    bg, obj, metatiles: [[0, 0, 0, 0]], mapId: 0,
    sprites: [{ x: 40, y: 20, tile: 0, attr: 0x80 }],
  }));
  assert.equal(at(overBlank, 43, 22), 3, 'behind-BG sprite still shows over BG colour 0');

  const overSolid = render(makeState({
    bg, obj, metatiles: [[1, 1, 1, 1]], mapId: 0,
    sprites: [{ x: 40, y: 20, tile: 0, attr: 0x80 }],
  }));
  assert.equal(at(overSolid, 43, 22), 2, 'behind-BG sprite is hidden over non-zero BG');
});

test('a hidden behind-BG sprite still claims the pixel against later entries', () => {
  // DMG priority is by OAM index, not by what actually got painted: the
  // lower-index sprite occupies the pixel even when the BG covers it.
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  obj[2] = flatTile(1); obj[3] = flatTile(1);
  const bg = [flatTile(0), flatTile(2)];
  const fb = render(makeState({
    bg, obj, metatiles: [[1, 1, 1, 1]],
    sprites: [{ x: 40, y: 20, tile: 0, attr: 0x80 },   // behind BG, hidden
              { x: 40, y: 20, tile: 2, attr: 0x00 }],  // in front, but later
  }));
  assert.equal(at(fb, 43, 22), 2, 'BG shows; the later sprite does not sneak in');
});

test('behind-BG compares the BG COLOUR INDEX, not the shade BGP resolved it to', () => {
  // Hardware compares the BG's 2-bit COLOUR INDEX against 0, BEFORE BGP. The
  // renderer used to compare fb.shades, which BGP has already remapped -- so
  // under an inverted BGP ($1B: colour 0 -> shade 3) a BG pixel that is
  // transparent to the priority rule read as opaque and hid the sprite.
  //
  // createFramebuffer() now carries `bgIndex`, one pre-palette byte per pixel,
  // written by BOTH drawBackground and drawWindow (the window is BG for
  // priority purposes).
  //
  // This test is worth its space only because it is NOT degenerate: with the
  // default $E4 palette, OBJ colour 3 and shade 3 are the same number and both
  // rules give the same answer. bgp $1B is what tells them apart.
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  const bg = [flatTile(0)];
  const fb = render(makeState({
    bg, obj, bgp: 0x1B,                       // BG colour 0 -> shade 3
    sprites: [{ x: 40, y: 20, tile: 0, attr: 0x80 }],
  }));
  // OBJ colour 3 through OBP0 $E4 is shade 3; the sprite must win, because the
  // BG COLOUR under it is 0 however dark BGP paints it.
  assert.equal(at(fb, 43, 22), 3, 'BG colour 0 never occludes, whatever BGP says');

  // ... and the other half, so the check can fail in both directions: a
  // non-zero BG colour still hides it, even when BGP paints that colour white.
  const overSolid = render(makeState({
    bg: [flatTile(0), flatTile(1)], obj, bgp: 0x1B, metatiles: [[1, 1, 1, 1]], mapId: 0,
    sprites: [{ x: 40, y: 20, tile: 0, attr: 0x80 }],
  }));
  assert.equal(at(overSolid, 43, 22), 2, 'BG colour 1 through $1B is shade 2, and it wins');
});

test('the 40-sprite cap drops later entries silently', () => {
  // The cap is a QUEUE limit ($0BE5: `CP $A0`), not a scanline one, so this
  // has to be isolated from the ten-per-line scan below or the two rules test
  // each other. The first 39 entries are parked at y = -20: they spend an OAM
  // slot and reach no scanline at all, which is exactly how the hardware
  // counts them.
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  const sprites = [];
  for (let i = 0; i < 39; i++) sprites.push({ x: 0, y: -20, tile: 0, attr: 0 });
  for (let i = 39; i < 45; i++) sprites.push({ x: i * 3, y: 20, tile: 0, attr: 0 });
  const fb = render(makeState({ obj, sprites }));

  assert.equal(MAX_SPRITES, 40);
  assert.equal(at(fb, 39 * 3 + 1, 22), 3, 'entry 39 (the 40th) is drawn');
  assert.equal(at(fb, 44 * 3 + 1, 22), 0, 'entry 44 is dropped');
  // No throw, no log: the ROM's $0BE5 `CP $A0` just stops appending.
  assert.equal(sprites.length, 45, 'the queue itself is not mutated by drawing');
});

test('only TEN sprites are drawn per scanline, in OAM order', () => {
  // DMG hardware: the OAM scan admits ten objects per line and drops the rest,
  // and it decides on Y ALONE -- before any tile fetch, so a fully transparent
  // sprite still spends one of the ten.
  //
  // MEASURED (tools/oracle/spritelimit.mjs, rip/oracle/pix/l12-crowd.json):
  // the cartridge has 21 sprites covering lines 78-94 on every frame from f117
  // to f125, i.e. 11 hardware-dropped, and feeding the renderer that OAM gives
  // 0 wrong pixels out of 23,040 on f119-f122 against 344/384/253/385 with the
  // rule switched off.
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  const sprites = [];
  for (let i = 0; i < 14; i++) sprites.push({ x: i * 10, y: 20, tile: 0, attr: 0 });
  const fb = render(makeState({ obj, sprites }));

  assert.equal(MAX_SPRITES_PER_LINE, 10);
  assert.equal(at(fb, 9 * 10 + 1, 22), 3, 'the tenth is drawn');
  assert.equal(at(fb, 10 * 10 + 1, 22), 0, 'the eleventh is dropped');
  assert.equal(at(fb, 13 * 10 + 1, 22), 0, 'and so is the fourteenth');
});

test('the ten-per-line budget is spent on Y alone, before the tile is looked at', () => {
  // The hardware scan never sees pixels. Ten fully TRANSPARENT sprites on a
  // line therefore consume the whole budget and the eleventh -- opaque -- is
  // still dropped. A cut applied at the "did this pixel paint" test instead
  // would draw it.
  const obj = []; obj[0] = flatTile(0); obj[1] = flatTile(0);   // colour 0
  obj[2] = flatTile(3); obj[3] = flatTile(3);
  const sprites = [];
  for (let i = 0; i < 10; i++) sprites.push({ x: 120, y: 20, tile: 0, attr: 0 });
  sprites.push({ x: 40, y: 20, tile: 2, attr: 0 });
  const fb = render(makeState({ obj, sprites }));
  assert.equal(at(fb, 43, 22), 0, 'the eleventh entry never reaches the line');

  // Nine transparent ones leave room, which is what makes the above a rule and
  // not an accident of the fixture.
  const nine = sprites.slice(1);
  const fb2 = render(makeState({ obj, sprites: nine }));
  assert.equal(at(fb2, 43, 22), 3);
});

test('the per-line cut is per LINE: a sprite pair 8 rows apart both draw', () => {
  // Two ten-strong rows, offset vertically so they share no scanline. Both
  // must survive -- a per-FRAME counter would drop the second row.
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  const sprites = [];
  for (let i = 0; i < 10; i++) sprites.push({ x: i * 8, y: 20, tile: 0, attr: 0 });
  for (let i = 0; i < 10; i++) sprites.push({ x: i * 8, y: 40, tile: 0, attr: 0 });
  const fb = render(makeState({ obj, sprites }));
  assert.equal(at(fb, 9 * 8 + 1, 22), 3, 'row 1, tenth sprite');
  assert.equal(at(fb, 9 * 8 + 1, 42), 3, 'row 2, tenth sprite');
});

test('opts.spritesPerLine lets the oracle render the same frame with the rule off', () => {
  // tools/oracle/spritelimit.mjs renders every frame twice and FAILS if the
  // rule is never exercised, so the escape hatch is part of the check rather
  // than a debug leftover.
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  const sprites = [];
  for (let i = 0; i < 14; i++) sprites.push({ x: i * 10, y: 20, tile: 0, attr: 0 });
  const state = makeState({ obj, sprites });
  const fb = createFramebuffer();
  renderFrame(state, fb, { spritesPerLine: 40 });
  assert.equal(fb.shades[22 * SCREEN_W + 13 * 10 + 1], 3,
    'with the cut lifted the fourteenth draws');
});

// ---------------------------------------------------------------------------
// The $9800 BG-ART OVERLAY.  ROM: the init-time VRAM scripts 7:$7A5E (levels
// 9/$0A/$0B, the skyline) and 7:$7B77 (level 6, the track band).
//
// These cells survive scrolling because the column streamer skips them:
// loc_00_0664's $0688 forces `H = $99` and drops the first eight of its 32
// unrolled writes when $FFB0 is 9 or $0A, and $066B sends level 6 to
// loc_00_0714, which never runs the column flush at all.  So the tilemap cell
// is genuinely what is on the hardware and the level map has nothing to say
// about it.
//
// Nothing here reads assets/: `state.level.bgArt` is the documented override
// hook and an Int16Array(1024) with -1 = "no cell" is exactly what
// bgArtForLevel() produces.
// ---------------------------------------------------------------------------

/** An empty overlay; set cells with `art[row * 32 + col] = tileId`. */
function emptyArt() {
  const a = new Int16Array(1024);
  a.fill(-1);
  return a;
}

test('the overlay is indexed in TILEMAP space, the same cell the PPU reads $9800 with', () => {
  // ((worldY >> 3) & 31) * 32 + ((worldX >> 3) & 31) -- NOT a world-space
  // lookup. On level 6 that distinction is the whole fix: the track band is
  // displayed through the mode-0/1 arm at SCX = $FFCC, so a world-space index
  // would slide the artwork sideways relative to the cells the hardware reads.
  const art = emptyArt();
  art[3 * 32 + 5] = 0x77;
  const s = makeState();
  s.level.bgArt = art;

  assert.equal(bgTileIdAt(s, 5 * 8, 3 * 8, art), 0x77);
  assert.equal(bgTileIdAt(s, 5 * 8 + 7, 3 * 8 + 7, art), 0x77, 'the whole 8x8 cell');
  // The tilemap is 32x32 and WRAPS, exactly as the hardware's does.
  assert.equal(bgTileIdAt(s, (32 + 5) * 8, (32 + 3) * 8, art), 0x77,
    'cell 261 aliases onto cell 5 -- 32 cells, not the level width');
  assert.notEqual(bgTileIdAt(s, 6 * 8, 3 * 8, art), 0x77, 'and the next cell is not it');
});

test('a cell the script writes WINS over the streamed metatile', () => {
  // The overlay is what is physically in $9800; the map is only a model of
  // what the streamer would have put there. Where they disagree, the cartridge
  // shows the overlay.
  const art = emptyArt();
  art[0] = 0x55;
  const s = makeState({ metatiles: [[0x11, 0x11, 0x11, 0x11]], mapId: 0 });
  s.level.bgArt = art;
  assert.equal(bgTileIdAt(s, 0, 0, art), 0x55, 'the script cell');
  assert.equal(bgTileIdAt(s, 0, 8 * 8, art), 0x11, 'a cell it does not write');
});

test('an overlay cell of -1 means "no cell", not tile $FF', () => {
  // fill(-1) is the sentinel; a signed Int16Array is used precisely so 0 stays
  // a legal tile id. Reading it as unsigned would paint tile $FF over the
  // whole screen.
  const art = emptyArt();
  const s = makeState({ metatiles: [[0x22, 0x22, 0x22, 0x22]], mapId: 0 });
  s.level.bgArt = art;
  assert.equal(bgTileIdAt(s, 0, 0, art), 0x22);
});

test('bgArtFor refuses to follow $FFB0 into a menu', () => {
  // Menus and title screens carry their own whole 32x32 tilemap in bgMap, and
  // $FFB0 still holds whatever level was last loaded -- boot() runs
  // initLevel(1) before the title is even shown. Inheriting the overlay there
  // would stamp skyline tiles across the round-select screen.
  const s = makeState();
  s.level.number = 9;
  s.video.bgMap = new Uint8Array(0x400);
  assert.equal(bgArtFor(s), null);

  // An explicitly attached overlay is how a mod overrides it, and an explicit
  // null is how a mod switches it off -- both distinguishable from "not set".
  const art = emptyArt();
  const t = makeState();
  t.level.bgArt = art;
  assert.equal(bgArtFor(t), art);
  const u = makeState();
  u.level.bgArt = null;
  assert.equal(bgArtFor(u), null);
});

test('drawBackground actually PAINTS the overlay cell', () => {
  // The lookup being right is not the same as the picture being right -- twice
  // in this project's history a byte-exact screen rendered wrong. This is the
  // pixel half: level 6 went from 88.47/85.73/85.47/86.02/85.73% to 100.00% on
  // all five pixeldiff frames when this landed.
  const bg = [];
  bg[0x40] = flatTile(1);          // the map's tile
  bg[0x50] = flatTile(2);          // the script's tile
  const art = emptyArt();
  art[0] = 0x50;
  const s = makeState({ bg, metatiles: [[0x40, 0x40, 0x40, 0x40]], mapId: 0 });
  s.level.bgArt = art;
  const fb = createFramebuffer();
  renderFrame(s, fb);
  assert.equal(at(fb, 3, 3), 2, 'cell (0,0) shows the script tile');
  assert.equal(at(fb, 3, 8 * 8 + 3), 1, 'a cell below it still shows the map');
  // ... and the priority buffer agrees, so a behind-BG sprite is occluded by
  // the overlay exactly as it is by the map.
  assert.equal(fb.bgIndex[3 * SCREEN_W + 3], 2);
});

// ---------------------------------------------------------------------------
// scrolling / raster bands
// ---------------------------------------------------------------------------

test('rasterBands emits ordered bands starting at line 0 with the camera scroll', () => {
  const state = makeState({ scx: 37, scy: 11, bgp: 0x1B, obp0: 0x12, obp1: 0x34 });
  const bands = rasterBands(state);
  assert.ok(bands.length >= 1);
  assert.equal(bands[0].from, 0);
  for (let i = 1; i < bands.length; i++) assert.ok(bands[i].from >= bands[i - 1].from);
  assert.equal(bands[0].scx, 37);
  assert.equal(bands[0].scy, 11);
  assert.equal(bands[0].bgp, 0x1B);
  assert.equal(bands[0].obp0, 0x12);
  assert.equal(bands[0].obp1, 0x34);
});

test('SCX/SCY shift the sampled background', () => {
  const bg = [tileFn((x, y) => ((x + y) & 1 ? 1 : 0)), flatTile(3)];
  const opts = { bg, metatiles: [[0, 0, 0, 0]] };
  const a = render(makeState({ ...opts, scx: 0, scy: 0 }));
  const b = render(makeState({ ...opts, scx: 3, scy: 0 }));
  for (let x = 0; x < 100; x++) assert.equal(at(b, x, 0), at(a, x + 3, 0), `x=${x}`);
  const c = render(makeState({ ...opts, scx: 0, scy: 5 }));
  for (let y = 0; y < 100; y++) assert.equal(at(c, 4, y), at(a, 4, y + 5), `y=${y}`);
});

test('metatile sub-cell order is column-major (TL, BL, TR, BR)', () => {
  // metatile 0 = [TL=1, BL=2, TR=3, BR=4]; each tile id is a distinct flat shade.
  const bg = [flatTile(0), flatTile(1), flatTile(2), flatTile(3), flatTile(1)];
  const fb = render(makeState({ bg, metatiles: [[1, 2, 3, 4]], mapId: 0 }));
  assert.equal(at(fb, 2, 2), 1, 'top-left 8x8');
  assert.equal(at(fb, 2, 10), 2, 'bottom-left 8x8');
  assert.equal(at(fb, 10, 2), 3, 'top-right 8x8');
  assert.equal(at(fb, 10, 10), 1, 'bottom-right 8x8 (tile id 4 -> shade 1)');
});

test('off-map columns fill with BGP colour 0, not garbage', () => {
  const bg = [flatTile(3)];
  const state = makeState({ width: 4, bg, metatiles: [[0, 0, 0, 0]], bgp: 0x1B });
  const fb = render(state);              // 4 metatiles = 64 px of map
  // BGP $1B maps [0,1,2,3] -> [3,2,1,0], so the tile's colour 3 lands on shade 0
  assert.equal(at(fb, 10, 10), 0, 'inside the map');
  assert.equal(at(fb, 100, 10), 3, 'past the map edge -> bgp[0], i.e. shade 3 here');
});

test('toRGBA expands every shade through DMG_PALETTE', () => {
  const bg = [tileFn((x) => x & 3)];
  const fb = render(makeState({ bg, bgp: 0xE4 }));
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    assert.deepEqual([fb.rgba[o], fb.rgba[o + 1], fb.rgba[o + 2], fb.rgba[o + 3]],
                     DMG_PALETTE[i]);
  }
  assert.equal(fb.shades.length, SCREEN_W * SCREEN_H);
  assert.equal(fb.rgba.length, SCREEN_W * SCREEN_H * 4);
});

// ---------------------------------------------------------------------------
// 7.3 metasprite records
// ---------------------------------------------------------------------------

const msState = () => ({ video: { sprites: [] } });

test('metasprite records decode as {dy, dx, tile, attr} relative to a screen point', () => {
  const table = [{ sprites: [[-16, -12, 0x00, 0x10], [0, 4, 0x0A, 0x00]] }];
  const s = msState();
  drawMetasprite(s, table, 0, 100, 50, 0x00);
  assert.deepEqual(s.video.sprites, [
    { x: 88, y: 34, tile: 0x00, attr: 0x10, scale: 1 },
    { x: 104, y: 50, tile: 0x0A, attr: 0x00, scale: 1 },
  ]);
});

test('a scale factor magnifies the metasprite about its own origin', () => {
  // Mod-only magnification (Wide Load). Offsets scale with the sprite so the
  // metasprite grows as one piece rather than coming apart; callers that must
  // stay 1:1, such as the HUD, simply omit the argument.
  const table = [{ sprites: [[-16, -12, 0x00, 0x10], [0, 4, 0x0A, 0x00]] }];
  const s = msState();
  drawMetasprite(s, table, 0, 100, 50, 0x00, 2);
  assert.deepEqual(s.video.sprites, [
    { x: 76, y: 18, tile: 0x00, attr: 0x10, scale: 2 },
    { x: 108, y: 50, tile: 0x0A, attr: 0x00, scale: 2 },
  ]);
});

test('the attr mask is OR-ed onto each record ($0BF7, $FF9E)', () => {
  const table = [{ sprites: [[0, 0, 1, 0x10], [0, 8, 2, 0x21]] }];
  const s = msState();
  drawMetasprite(s, table, 0, 0, 0, 0x80);
  assert.deepEqual(s.video.sprites.map((r) => r.attr), [0x90, 0xA1]);
  // OR, not assignment: the record's own bits survive.
  const s2 = msState();
  drawMetasprite(s2, table, 0, 0, 0, 0x00);
  assert.deepEqual(s2.video.sprites.map((r) => r.attr), [0x10, 0x21]);
});

test('a missing metasprite index is a no-op', () => {
  const s = msState();
  drawMetasprite(s, [], 7, 0, 0, 0);
  assert.equal(s.video.sprites.length, 0);
});

test('drawMetasprite stops at the 40-entry cap and drops the rest silently', () => {
  const table = [{ sprites: Array.from({ length: 6 }, (_, i) => [0, i * 8, i, 0]) }];
  const s = msState();
  for (let i = 0; i < 38; i++) s.video.sprites.push({ x: 0, y: 0, tile: 0, attr: 0 });
  drawMetasprite(s, table, 0, 0, 0, 0);
  assert.equal(s.video.sprites.length, 40, 'clamped at 40, no throw');
  assert.equal(s.video.sprites[38].tile, 0);
  assert.equal(s.video.sprites[39].tile, 1);
});

// ---------------------------------------------------------------------------
// the window layer -- which in this game is the water
// ---------------------------------------------------------------------------

/**
 * A world of light BG (index 0) with a solid dark window tile, like tile $01,
 * and a window tilemap of that tile throughout. The map is not optional: with
 * no captured tilemap the layer deliberately draws nothing at all, because
 * painting the flat fill anyway is an opaque slab that hides the failure.
 */
function winState(opts = {}) {
  const s = makeState({
    bg: (() => { const t = new Array(256).fill(null);
                 t[0] = flatTile(0); t[1] = flatTile(3); return t; })(),
    metatiles: [[0, 0, 0, 0]],
    ...opts,
  });
  if (!s.video.windowMap) s.video.windowMap = new Uint8Array(1024).fill(0x01);
  return s;
}

test('an opaque window user gets no dither', () => {
  // The options panel ($3893) drives the same window with windowDither unset.
  // Leaving the water's 50% alternation on stripes the background straight
  // through the menu.
  const fb = render(winState({ windowLatchY: 100 }));
  let dark = 0;
  for (let y = 120; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) if (at(fb, x, y)) dark++;
  }
  assert.equal(dark / ((SCREEN_H - 120) * SCREEN_W), 1, 'fully opaque');
});

test('the window is invisible while parked off-screen', () => {
  // $021B/$0F25 leave rWY at $90 for every level that is not 1 or 2. If this
  // regressed, a flat slab of tile $01 would cover every level in the game.
  const fb = render(winState({ windowLatchY: 0x90 }));
  for (let y = 0; y < SCREEN_H; y++) assert.equal(at(fb, 4, y), 0);
});

test('the window covers everything below its Y and nothing above', () => {
  // windowDither marks this as the WATER's use of the window. The dither is an
  // approximation of the water body, not a property of the window itself, and
  // the options panel needs the window opaque -- so the flag has to be set for
  // the behaviour below to be the one under test.
  const fb = render(winState({ windowLatchY: 100, windowDither: true }));
  for (let y = 0; y < 100; y++) assert.equal(at(fb, 4, y), 0, `row ${y} above`);

  const cover = (from, to) => {
    let dark = 0;
    for (let y = from; y < to; y++) {
      for (let x = 0; x < SCREEN_W; x++) if (at(fb, x, y)) dark++;
    }
    return dark / ((to - from) * SCREEN_W);
  };

  // The first two map rows are the artwork SURFACE and draw solid -- dithering
  // them would destroy the texture that makes the water read as water.
  assert.equal(cover(100, 116), 1, 'the surface rows are solid');

  // Below that is the flat body, at 50%: the alternation the hardware does in
  // TIME is reproduced in SPACE (see drawWindow). Near 100% here would mean
  // the dither was lost and the water became an opaque black slab.
  const body = cover(116, SCREEN_H);
  assert.ok(Math.abs(body - 0.5) < 0.02,
            `expected ~50% body coverage, got ${(body * 100).toFixed(1)}%`);
});

test('the dither is static, so the water does not strobe', () => {
  // The pattern must not depend on the frame counter. A temporal dither would
  // be closer to the register stream and far worse to look at.
  const a = render(winState({ windowLatchY: 100 }));
  const b = render(winState({ windowLatchY: 100 }));
  assert.deepEqual(Array.from(a.shades), Array.from(b.shades));
});

test('sprites draw over the water, background does not', () => {
  // Window sits above BG and below OBJ, which is what keeps Batman visible
  // while he is swimming.
  const s = winState({ windowLatchY: 100 });
  s.level.tiles.obj[0] = flatTile(1);
  s.level.tiles.obj[1] = flatTile(1);
  s.video.sprites.push({ x: 40, y: 110, tile: 0, attr: 0 });
  const fb = render(s);
  for (let x = 40; x < 48; x++) assert.equal(at(fb, x, 112), 1, 'sprite wins');
});

test('the window reads its tilemap rather than assuming one tile', () => {
  // Rows 0-1 of $9C00 are the textured surface ($E0/$E2 over $E1/$E3); the
  // rest is the flat body. Assuming a uniform fill is exactly the bug that
  // made the water a black slab.
  const s = winState({ windowLatchY: 96 });
  s.level.tiles.bg[0xE0] = flatTile(1);
  const map = new Uint8Array(1024);
  map.fill(0x01);
  for (let c = 0; c < 32; c++) map[c] = 0xE0;      // row 0 all $E0
  s.video.windowMap = map;

  const fb = render(s);
  assert.equal(at(fb, 4, 100), 1, 'drew tile $E0 from the map');
  assert.equal(at(fb, 4, 110), 3, 'and the body tile below it');
});

test('the tile animation reaches the window through the tile cache', () => {
  // water.js patches animated bitmaps into level.tiles.bg, the way the
  // hardware streamer patches VRAM -- so the renderer needs no special case,
  // and the falling water in the BACKGROUND animates by the same mechanism.
  const s = winState({ windowLatchY: 96 });
  const map = new Uint8Array(1024);
  map.fill(0x01);
  for (let c = 0; c < 32; c++) map[c] = 0xE0;
  s.video.windowMap = map;

  s.level.tiles.bg[0xE0] = flatTile(1);
  assert.equal(at(render(s), 4, 100), 1);
  s.level.tiles.bg[0xE0] = flatTile(2);
  assert.equal(at(render(s), 4, 100), 2, 'the new frame is picked up');
});

test('WX shifts the window right, and 7 means flush left', () => {
  // rWX is offset by 7 on hardware.
  const flush = render(winState({ windowLatchY: 100, windowX: 0x07 }));
  let leftEdge = 0;
  for (let x = 0; x < 8; x++) if (at(flush, x, 100) || at(flush, x, 101)) leftEdge++;
  assert.ok(leftEdge > 0, 'starts at x 0');

  const shifted = render(winState({ windowLatchY: 100, windowX: 0x07 + 40 }));
  for (let y = 100; y < SCREEN_H; y++) {
    for (let x = 0; x < 40; x++) assert.equal(at(shifted, x, y), 0);
  }
});

test('a missing window tile is a no-op rather than a crash', () => {
  const s = winState({ windowLatchY: 100 });
  s.video.windowTile = 0x42;                    // nothing decoded there
  assert.doesNotThrow(() => render(s));
});

test('no captured tilemap draws nothing at all', () => {
  // The failure mode that shipped: a stale cached water.json left the map
  // undefined, the layer painted its flat fill anyway, and the water came out
  // as opaque black squares. Drawing nothing is the honest fallback.
  const s = winState({ windowLatchY: 100 });
  s.video.windowMap = null;
  const fb = render(s);
  for (let y = 100; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) assert.equal(at(fb, x, y), 0);
  }
});
