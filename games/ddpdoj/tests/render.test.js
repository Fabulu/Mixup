// UNIT TESTS FOR THE PORT'S RENDERER  (wave 6).
//
// These run on SYNTHETIC regions, never on the cartridge: `node --test
// games/ddpdoj/tests/` is the cheap stage that must work on a tree with no
// ROMs extracted, and a test that skips when `rip/` is missing would be a test
// that never runs (`docs/knowledge/03`: a skip is not a pass).
//
// The ROM-backed evidence is elsewhere and is the real gate:
//   pgm.py pixslice                136 frame pairs, 13,647,872/13,647,872 px
//   pgm.py pixslice --mutate all   nine mutations, all RED
//   tools/demogate.mjs             the port drives the ship, 159 frames, exact
//
// What these tests pin is the set of RULES those numbers depend on, one at a
// time, so that a regression says WHICH rule broke instead of "97 %".

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertLittleEndianHost, assemble, RomRegionError,
  IGS023_LAYOUT, IGS023_SIZE,
  bgTile, bgTileReversedPlanes, txTile, flipTile, TileCache, buildBgMap,
  buildTxMap, BGMAP_W, TRANSPARENT,
  parseSpriteList, RAM_STRIDE, BUFFER_STRIDE,
  zoomWord, effectiveZoom, SpriteDrawer,
  Renderer, paletteRgb, resolveRgb, mamePixelsToRgb, rotateCCW,
  SCREEN_W, SCREEN_H, FILL_PEN, beWords, parseRegs,
} from '../src/render/index.js';
import { Capture } from '../src/render/capture.js';
import { portWordFromBits, mirrorsFromPort } from '../src/input.js';
import { BIT } from '../src/machine.js';

// --------------------------------------------------------------- regions

test('the host is little-endian, as the REGION16_LE views require', () => {
  assertLittleEndianHost();
});

test('pgm.cpp:5361-5386: u19 loads at 0x180000 and SHADOWS the top of '
  + 'pgm_t01s.rom -- it does not follow it', () => {
  const files = new Map([
    ['pgm_t01s.rom', new Uint8Array(0x200000).fill(0xaa)],
    ['cave_t04401w064.u19', new Uint8Array(0x800000).fill(0x55)],
  ]);
  const r = assemble((n) => files.get(n), IGS023_LAYOUT, IGS023_SIZE);
  assert.equal(r[0x17ffff], 0xaa, 'below the overlap, t01s survives');
  assert.equal(r[0x180000], 0x55, 'at 0x180000 u19 begins');
  assert.equal(r[0x1fffff], 0x55, 'the top 0x80000 of t01s is OVERWRITTEN');
  assert.equal(r[0x97ffff], 0x55, 'u19 ends at 0x180000 + 0x800000');
});

test('assemble refuses a file of the wrong length rather than coping', () => {
  const files = new Map([
    ['pgm_t01s.rom', new Uint8Array(0x100000)],
    ['cave_t04401w064.u19', new Uint8Array(0x800000)],
  ]);
  assert.throws(() => assemble((n) => files.get(n), IGS023_LAYOUT, IGS023_SIZE),
    RomRegionError);
});

// ------------------------------------------------------------------ tiles

test('BG 5bpp: LSB-first bitstream, planeoffset {4,3,2,1,0} -- the FIRST bit '
  + 'of a pixel is its LSB', () => {
  // pixel 0 = bits 0..4, pixel 1 = bits 5..9.  Set pixel 0 = 1 (bit 0 only),
  // pixel 1 = 16 (its bit 4, i.e. absolute bit 9).
  const rom = { igs023: new Uint8Array(0xa00000) };
  rom.igs023[0] = 0b00000001;             // bit 0
  rom.igs023[1] = 0b00000010;             // bit 9
  const t = bgTile(rom, 0);
  assert.equal(t[0], 1);
  assert.equal(t[1], 16);
  // the mutation twin must disagree on exactly this
  const bad = bgTileReversedPlanes(rom, 0);
  assert.equal(bad[0], 16);
  assert.equal(bad[1], 1);
});

test('TX 4bpp packed_lsb: the LOW nibble is the LEFT pixel', () => {
  const rom = { igs023: new Uint8Array(0x1000) };
  rom.igs023[0] = 0x3c;                   // low 0xc, high 0x3
  const t = txTile(rom, 0);
  assert.equal(t[0], 0xc);
  assert.equal(t[1], 0x3);
  const msb = txTile(rom, 0, undefined, false);
  assert.equal(msb[0], 0x3);
  assert.equal(msb[1], 0xc);
});

test('TILE_FLIPYX: bit0 flips x, bit1 flips y', () => {
  const src = new Uint8Array([1, 2, 3, 4]);       // 2x2
  assert.deepEqual([...flipTile(src, 2, 2, 0)], [1, 2, 3, 4]);
  assert.deepEqual([...flipTile(src, 2, 2, 1)], [2, 1, 4, 3]);
  assert.deepEqual([...flipTile(src, 2, 2, 2)], [3, 4, 1, 2]);
  assert.deepEqual([...flipTile(src, 2, 2, 3)], [4, 3, 2, 1]);
});

test('the tile maps apply the colour base and the transparent pen', () => {
  const rom = { igs023: new Uint8Array(0xa00000) };
  // BG tile 0, all pixels 31 -> every pixel transparent (set_transparent_pen(31))
  for (let i = 0; i < 640; i++) rom.igs023[i] = 0xff;
  const cache = new TileCache(rom);
  const bgram = new Uint16Array(64 * 16 * 2);
  bgram[0] = 0;               // tile 0
  bgram[1] = 0x06;            // colour = (0x06 & 0x3e) >> 1 = 3
  const map = buildBgMap(cache, bgram);
  assert.equal(map[0], TRANSPARENT, 'pen 31 is transparent');
  // BG tile 1, all pixels 0 -> palette 0x400 + colour*32 + 0
  const map2 = buildBgMap(new TileCache({ igs023: new Uint8Array(0xa00000) }), bgram);
  assert.equal(map2[0], 0x400 + 3 * 32);
  // TX: pen 15 transparent, base 0x800 + colour*16
  const txrom = { igs023: new Uint8Array(0x1000) };
  const txram = new Uint16Array(64 * 32 * 2);
  txram[1] = 0x04;            // colour 2
  const tmap = buildTxMap(new TileCache(txrom), txram);
  assert.equal(tmap[0], 0x800 + 2 * 16);
  txrom.igs023.fill(0xff);
  const tmap2 = buildTxMap(new TileCache(txrom), txram);
  assert.equal(tmap2[0], TRANSPARENT);
});

// ------------------------------------------------------------ sprite list

function listWords(entries, stride) {
  const w = new Uint16Array((entries.length + 1) * stride);
  entries.forEach((e, i) => { e.forEach((v, k) => { w[i * stride + k] = v; }); });
  return w;
}

test('the display list: field layout, sign extension and the terminator', () => {
  const e = [
    0x8000 | (0xa << 11) | (0x7ff & -3),      // xgrow, xzom=a, x = -3
    0x8000 | (0x3 << 11) | (0x3ff & -2),      // ygrow, yzom=3, y = -2
    (0x2 << 13) | (0x1f << 8) | 0x80 | 0x7f,  // flip=2, color=0x1f, pri=1, offshi
    0x1234,
    (0x05 << 9) | 0x40,                       // width 5, height 0x40
  ];
  const [s] = parseSpriteList(listWords([e], BUFFER_STRIDE), BUFFER_STRIDE);
  assert.equal(s.xgrow, true);
  assert.equal(s.xzom, 0xa);
  assert.equal(s.x, -3);
  assert.equal(s.ygrow, true);
  assert.equal(s.yzom, 3);
  assert.equal(s.y, -2);
  assert.equal(s.flip, 2);
  assert.equal(s.color, 0x1f);
  assert.equal(s.pri, 1);
  assert.equal(s.offs, (0x7f << 16) | 0x1234);
  assert.equal(s.width, 5);
  assert.equal(s.height, 0x40);
});

test('the DMA word masks: bit 10 of word 1 and bit 15 of word 2 are dropped', () => {
  const e = [0, 0x0400, 0x8000 | 0x0100, 0, 1];
  const [s] = parseSpriteList(listWords([e], BUFFER_STRIDE), BUFFER_STRIDE);
  assert.equal(s.y, 0, 'word1 bit 10 is masked out by 0xfbff');
  assert.equal(s.color, 1, 'word2 bit 15 is masked out by 0x7fff');
});

test('word4 & 0x7fff == 0 terminates, and both strides parse', () => {
  for (const stride of [RAM_STRIDE, BUFFER_STRIDE]) {
    const w = listWords([[0, 0, 0, 0, 1], [0, 0, 0, 0, 2], [0, 0, 0, 0, 0x8000]],
      stride);
    assert.equal(parseSpriteList(w, stride).length, 2,
      `stride ${stride}: the third entry's word4 & 0x7fff is 0`);
  }
});

// ----------------------------------------------------------------- zoom

test('zoom_word: >= 0x10 is NO ZOOM, 0xf is hard-coded to 1', () => {
  const zr = new Uint16Array(32);
  zr[0] = 0xdead; zr[1] = 0xbeef;
  assert.equal(zoomWord(zr, 0x10), 0);
  assert.equal(zoomWord(zr, 0xff), 0);
  assert.equal(zoomWord(zr, 0xf), 1);
  assert.equal(zoomWord(zr, 0), 0xdeadbeef);
});

test('THE ENCODING TRAP: "no zoom" is zom=0 AND grow=1, never zom=0 alone', () => {
  const zr = new Uint16Array(32);
  zr[0] = 0xffff; zr[1] = 0xffff;                 // entry 0 is a REAL zoom
  const mk = (zom, grow) => ({ xzom: zom, yzom: zom, xgrow: grow, ygrow: grow });
  assert.deepEqual(effectiveZoom(mk(0, true), zr), [0, 0], 'grow flips 0 -> 0x10');
  assert.deepEqual(effectiveZoom(mk(0, false), zr), [0xffffffff, 0xffffffff]);
});

// -------------------------------------------------------------- sprites

/** A one-pixel sprite: header at word 0, one mask word, one colour word. */
function tinyRoms({ pixel = 7 } = {}) {
  const sprmask = new Uint16Array(1024);
  const sprcol = new Uint16Array(1024);
  sprmask[0] = 0; sprmask[1] = 0;      // a = 0 -> the stream starts at col[0]
  sprmask[2] = 0xfffe;                 // bit 0 CLEAR = opaque, the rest clear
  sprcol[0] = pixel;                   // bits 0..4 of the first colour word
  return { sprmask, sprcol };
}

function blank(W = 8, H = 4) {
  return { bm: new Uint16Array(W * H).fill(FILL_PEN), pri: new Uint8Array(W * H), W, H };
}

test('a SET mask bit is TRANSPARENT; a clear bit consumes a 5-bit pixel', () => {
  const roms = tinyRoms({ pixel: 7 });
  const b = blank();
  const d = new SpriteDrawer(roms, b.bm, b.pri, b.W, b.H);
  d.draw({ width: 1, height: 1, offs: 0, flip: 0, color: 2, pri: 0,
    x: 5, y: 3, xzom: 0, yzom: 0, xgrow: true, ygrow: true },
  new Uint16Array(32));
  assert.equal(b.bm[3 * 8 + 5], 7 + 2 * 32, 'value + colour bank * 32');
  assert.equal(b.bm[3 * 8 + 6], FILL_PEN, 'the transparent bits wrote nothing');
  assert.equal(b.pri[3 * 8 + 5] & 1, 1, 'the sprite claimed the pixel');
});

test('the mask polarity is the RED-VALIDATION knob, and it changes the picture',
  () => {
    const roms = tinyRoms();
    const b = blank();
    const d = new SpriteDrawer(roms, b.bm, b.pri, b.W, b.H, { maskBitOpaque: true });
    d.draw({ width: 1, height: 1, offs: 0, flip: 0, color: 0, pri: 0,
      x: 0, y: 0, xzom: 0, yzom: 0, xgrow: true, ygrow: true },
    new Uint16Array(32));
    assert.equal(b.bm[0], FILL_PEN, 'bit 0 is now "transparent"');
    assert.notEqual(b.bm[1], FILL_PEN, 'and bit 1 is now opaque');
  });

test('pgm_draw_pix priority: pri==1 loses to a BG pixel, pri==0 does not', () => {
  for (const [pri, expect] of [[0, 'sprite'], [1, 'bg']]) {
    const roms = tinyRoms({ pixel: 9 });
    const b = blank();
    b.bm[0] = 0x123; b.pri[0] = 2;             // the BG wrote this pixel
    const d = new SpriteDrawer(roms, b.bm, b.pri, b.W, b.H);
    d.draw({ width: 1, height: 1, offs: 0, flip: 0, color: 0, pri,
      x: 0, y: 0, xzom: 0, yzom: 0, xgrow: true, ygrow: true },
    new Uint16Array(32));
    assert.equal(b.bm[0], expect === 'bg' ? 0x123 : 9,
      `pri=${pri} should leave the ${expect} pixel`);
  }
});

test('first-drawn-wins: a second sprite cannot take a claimed pixel', () => {
  const roms = tinyRoms({ pixel: 9 });
  const b = blank();
  const d = new SpriteDrawer(roms, b.bm, b.pri, b.W, b.H);
  const s = { width: 1, height: 1, offs: 0, flip: 0, color: 0, pri: 0,
    x: 0, y: 0, xzom: 0, yzom: 0, xgrow: true, ygrow: true };
  d.draw(s, new Uint16Array(32));
  d.draw({ ...s, color: 1 }, new Uint16Array(32));
  assert.equal(b.bm[0], 9, 'the FIRST draw owns it -- which is why the list is '
    + 'walked backwards and a HIGHER index draws in front');
});

test('three 5-bit pixels per colour word, then the stream advances', () => {
  const sprmask = new Uint16Array(1024);
  const sprcol = new Uint16Array(1024);
  sprmask[2] = 0xfff0;                       // four opaque pixels
  sprcol[0] = 1 | (2 << 5) | (3 << 10);      // bits 0-4, 5-9, 10-14
  sprcol[1] = 4;
  const b = blank();
  const d = new SpriteDrawer({ sprmask, sprcol }, b.bm, b.pri, b.W, b.H);
  d.draw({ width: 1, height: 1, offs: 0, flip: 0, color: 0, pri: 0,
    x: 0, y: 0, xzom: 0, yzom: 0, xgrow: true, ygrow: true },
  new Uint16Array(32));
  assert.deepEqual([...b.bm.slice(0, 4)], [1, 2, 3, 4],
    'bit 15 of a colour word is unused, so the 4th pixel comes from col[1]');
});

// ------------------------------------------------------------- the frame

function emptyState(over = {}) {
  return {
    palette: new Uint16Array(0x1000),
    spritebuffer: new Uint16Array(8 * 256),
    bg: new Uint16Array(64 * 16 * 2),
    tx: new Uint16Array(64 * 32 * 2),
    rowscroll: new Uint16Array(2048),
    zoomram: new Uint16Array(32),
    regs: { bg_xscroll: 0, bg_yscroll: 0, tx_xscroll: 0, tx_yscroll: 0,
      ctrl: 0, bg_scale: 0x210 },
    ...over,
  };
}

function fakeRoms() {
  return {
    igs023: new Uint8Array(0xa00000),
    sprcol: new Uint16Array(1024),
    sprmask: new Uint16Array(1024),
  };
}

test('ctrl bit 12 disables the BG layer and bit 11 disables TX', () => {
  const roms = fakeRoms();
  // BG tile 0 pixel 0 = 1, TX tile 0 pixel 0 = 2
  roms.igs023[0] = 1;
  const r = new Renderer(roms);
  const st = emptyState();
  // TX is drawn LAST and over everything, so it has to be off to see the BG.
  st.regs.ctrl = 1 << 11;
  const on = r.renderIndexed(st)[0];
  assert.equal(on, 0x400 + 1, 'BG drew');
  const off = r.renderIndexed(emptyState({
    regs: { ...st.regs, ctrl: (1 << 12) } }))[0];
  // 0x800 + 1, not 0x800 + 0: the TWO GFX SETS SHARE the igs023 region, so the
  // byte that gave BG tile 0 its pixel 0 is also TX tile 0's first nibble pair.
  assert.equal(off, 0x800 + 1, 'BG gone; TX still draws over the fill');
  const both = r.renderIndexed(emptyState({
    regs: { ...st.regs, ctrl: (1 << 12) | (1 << 11) } }))[0];
  assert.equal(both, FILL_PEN, 'both layers off leaves igs023_video.cpp:772\'s '
    + 'fill pen 0x3ff');
});

test('the BG row is a ROTATION of a 2048-wide map, per row, wrapping at 0x7ff',
  () => {
    const roms = fakeRoms();
    const r = new Renderer(roms);
    const st = emptyState();
    roms.igs023[640] = 3;                        // BG tile 1, its pixel 0 = 3
    st.bg[2] = 1;                                // map cell (row 0, col 1)
    st.regs.ctrl = 1 << 11;                      // TX off so the BG is visible
    assert.equal(r.renderIndexed(st)[32], 0x400 + 3, 'cell 1 begins at x=32');
    // Scroll by 32: the marked pixel arrives at x=0.
    st.regs.bg_xscroll = 32;
    assert.equal(r.renderIndexed(st)[0], 0x400 + 3);
    // Scroll by 32 + 2048: identical, because the map is 2048 wide and the
    // index is masked with 0x7ff.
    st.regs.bg_xscroll = (32 + 0x800) & 0xffff;
    assert.equal(r.renderIndexed(st)[0], 0x400 + 3, 'the x index wraps at 0x7ff');
    // ROWSCROLL adds per row: row 3 shifted by a further 32 puts it at x=-32,
    // i.e. the marked pixel is gone from x=0 on that row only.
    st.regs.bg_xscroll = 32;
    st.rowscroll[3] = 32;
    const out = r.renderIndexed(st);
    assert.equal(out[0], 0x400 + 3, 'row 0 unaffected');
    assert.notEqual(out[3 * SCREEN_W], 0x400 + 3, 'row 3 has its own scroll');
  });

test('pal5bit: (v<<3)|(v>>2), and the resolver clamps like numpy\'s clip', () => {
  const pal = new Uint16Array([0x7fff, 0x0000, (1 << 10) | (2 << 5) | 3]);
  const rgb = paletteRgb(pal);
  assert.deepEqual([...rgb.slice(0, 3)], [255, 255, 255]);
  assert.deepEqual([...rgb.slice(3, 6)], [0, 0, 0]);
  assert.deepEqual([...rgb.slice(6, 9)], [(1 << 3) | 0, (2 << 3) | 0, (3 << 3) | 0]);
  const out = resolveRgb(new Uint16Array([99]), rgb);
  assert.deepEqual([...out], [...rgb.slice(6, 9)], 'index past the end clamps');
});

test('screen:pixels() is ARGB32 little-endian -- B,G,R,A in memory', () => {
  const raw = new Uint8Array([0x11, 0x22, 0x33, 0xff]);
  assert.deepEqual([...mamePixelsToRgb(raw, 1, 1)], [0x33, 0x22, 0x11]);
});

test('rotateCCW is np.rot90(img, 1): out[y][x] = src[x][W-1-y]', () => {
  // 2x2 source, distinct channels: src[r][c] = r*10+c
  const W = 2, H = 2;
  const src = new Uint8Array(W * H * 3);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) src[(r * W + c) * 3] = r * 10 + c;
  }
  const out = rotateCCW(src, W, H);
  // out is (W rows) x (H cols)
  const at = (y, x) => out[(y * H + x) * 3];
  assert.equal(at(0, 0), src[(0 * W + 1) * 3]);   // src[0][W-1-0] = src[0][1]
  assert.equal(at(1, 0), src[(0 * W + 0) * 3]);   // src[0][W-1-1] = src[0][0]
  assert.equal(at(0, 1), src[(1 * W + 1) * 3]);
});

test('beWords reads the oracle\'s dumps big-endian; parseRegs insists on all '
  + 'six registers', () => {
  assert.deepEqual([...beWords(new Uint8Array([0x12, 0x34, 0xff, 0x00]))],
    [0x1234, 0xff00]);
  const ok = 'bg_scale=0210\nbg_xscroll=0001\nbg_yscroll=0002\nctrl=001f\n'
    + 'tx_xscroll=0003\ntx_yscroll=0004\n';
  assert.equal(parseRegs(ok).ctrl, 0x1f);
  assert.throws(() => parseRegs('ctrl=001f\n'), /missing/);
});

// --------------------------------------------------------- input + splice

test('portWordFromBits is the exact inverse of the board\'s measured mirror '
  + 'derivation', () => {
  // MEASURED on the board (`input.js`): 1P Start alone -> portin $FFFE ->
  // p1raw $8000; P1 Button 3 held -> portin $FF7F -> p1raw $0040.
  assert.equal(portWordFromBits([BIT.start]), 0xfffe);
  assert.equal(mirrorsFromPort(0xfffe).p1, 0x8000);
  assert.equal(portWordFromBits([BIT.b3]), 0xff7f);
  assert.equal(mirrorsFromPort(0xff7f).p1, 0x0040);
  assert.equal(portWordFromBits([]), 0xffff);
  assert.equal(mirrorsFromPort(0xffff).p1, 0x0000);
  for (const b of Object.values(BIT)) {
    assert.equal(mirrorsFromPort(portWordFromBits([b])).p1, 1 << b,
      `bit ${b} round-trips`);
  }
});

test('the splice moves ONLY the position fields of a display-list record', () => {
  const frameBytes = 16;
  const json = {
    layout: [['spritebuffer', 16]], frameBytes,
    frameList: [{ lf: 1, vf: 1, regs: {}, player: [[0, -24, -16]] }],
    shipCorrelation: { accepted: [{ off: '-24,-16', hits: 1 }], lag: 1 },
  };
  // one record: word0 = grow+zoom bits + x, word1 = grow+zoom bits + y
  const words = new Uint16Array(8);
  words[0] = 0x8000 | (0xa << 11) | 100;
  words[1] = 0x8000 | (0x3 << 11) | 50;
  const bin = new Uint8Array(frameBytes);
  for (let i = 0; i < 8; i++) {
    bin[i * 2] = words[i] >> 8; bin[i * 2 + 1] = words[i] & 0xff;
  }
  const cap = new Capture(json, bin);
  const st = { spritebuffer: cap.part(0, 'spritebuffer') };
  cap.splice(st, 0, 64 * 200, 64 * 90);       // py = 200 px, px = 90 px
  assert.equal(st.spritebuffer[0] & 0xf800, 0x8000 | (0xa << 11),
    'the grow bit and the zoom index survive');
  assert.equal(st.spritebuffer[0] & 0x7ff, 200 - 24);
  assert.equal(st.spritebuffer[1] & 0xfc00, 0x8000 | (0x3 << 11));
  assert.equal(st.spritebuffer[1] & 0x3ff, 90 - 16);
});

test('the capture splice selects the packed ship row by cartridge selector', () => {
  const frameBytes = 16;
  const json = {
    layout: [['spritebuffer', 16]], frameBytes,
    frameList: [{ lf: 1, vf: 1, regs: {}, player: [[0, 0, 0]] }],
    shipCorrelation: { accepted: [{ off: '0,0', hits: 1 }], lag: 1 },
  };
  const words = new Uint16Array(8);
  words[2] = 0xab80;
  words[3] = 0x9999;
  words[4] = 0x0620;
  const bin = new Uint8Array(frameBytes);
  for (let i = 0; i < words.length; i++) {
    bin[i * 2] = words[i] >> 8; bin[i * 2 + 1] = words[i] & 0xff;
  }
  const rowA = Array.from({ length: 17 }, () => [0x12, 0x3456]);
  const rowB = Array.from({ length: 17 }, () => [0x34, 0x5678]);
  const ship = {
    tiltMin: -0x20, tiltStep: 4, wide: 3, high: 0x20,
    pairs: rowA,
    pairsBySelector: { 0: rowA, 2: rowB },
  };
  const cap = new Capture(json, bin);

  const defaultState = { spritebuffer: cap.part(0, 'spritebuffer') };
  cap.splice(defaultState, 0, 0, 0, { tilt: 0, ship });
  assert.equal(defaultState.spritebuffer[2], 0xab92,
    'an omitted selector preserves the selector-zero row');
  assert.equal(defaultState.spritebuffer[3], 0x3456);

  const typeBState = { spritebuffer: cap.part(0, 'spritebuffer') };
  cap.splice(typeBState, 0, 0, 0, { tilt: 0, ship, shipSel: 2 });
  assert.equal(typeBState.spritebuffer[2], 0xabb4,
    'selector 2 preserves attributes and installs its own packed high bits');
  assert.equal(typeBState.spritebuffer[3], 0x5678);
  assert.equal(cap.lastBanked, true);
});

test('Capture refuses a bin whose length disagrees with its manifest', () => {
  assert.throws(() => new Capture({
    layout: [['spritebuffer', 16]], frameBytes: 16,
    frameList: [{}, {}], shipCorrelation: { accepted: [], lag: 1 },
  }, new Uint8Array(16)), /capture.bin is/);
});
