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
  createFramebuffer, renderFrame, rasterBands,
  SCREEN_W, SCREEN_H, MAX_SPRITES, DMG_PALETTE,
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
    video: { scx, scy, bgp, obp0, obp1, sprites },
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

test('KNOWN DEVIATION: behind-BG tests the resolved SHADE, not the BG colour index', () => {
  // Hardware compares the BG COLOUR INDEX; renderer.js line ~162 compares
  // fb.shades, which BGP has already remapped. With an inverted BGP, BG colour
  // 0 becomes shade 3 and wrongly occludes a behind-BG sprite.
  // If the renderer is fixed to track the colour index, flip this to `3`.
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  const bg = [flatTile(0)];
  const fb = render(makeState({
    bg, obj, bgp: 0x1B,                       // colour 0 -> shade 3
    sprites: [{ x: 40, y: 20, tile: 0, attr: 0x80 }],
  }));
  assert.equal(at(fb, 43, 22), 3,
    'current behaviour: BG colour 0 rendered as shade 3 occludes the sprite');
});

test('the 40-sprite cap drops later entries silently', () => {
  const obj = []; obj[0] = flatTile(3); obj[1] = flatTile(3);
  const sprites = [];
  for (let i = 0; i < 45; i++) sprites.push({ x: i * 3, y: 20, tile: 0, attr: 0 });
  const fb = render(makeState({ obj, sprites }));

  assert.equal(MAX_SPRITES, 40);
  assert.equal(at(fb, 39 * 3 + 1, 22), 3, 'entry 39 (the 40th) is drawn');
  assert.equal(at(fb, 44 * 3 + 1, 22), 0, 'entry 44 is dropped');
  // No throw, no log: the ROM's $0BE5 `CP $A0` just stops appending.
  assert.equal(sprites.length, 45, 'the queue itself is not mutated by drawing');
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
    { x: 88, y: 34, tile: 0x00, attr: 0x10 },
    { x: 104, y: 50, tile: 0x0A, attr: 0x00 },
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
