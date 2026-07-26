// Realistic DMG scanline compositor benchmark.
// 160x144, 8x16 sprites, 32x32 BG map, window layer, per-scanline palettes.
// Measures the pure-JS compositing cost (putImageData itself is a ~92KB memcpy).

const W = 160, H = 144;

// ---- VRAM: 384 tiles x 16 bytes ----
const vram = new Uint8Array(0x2000);
for (let i = 0; i < vram.length; i++) vram[i] = (i * 37 + (i >> 3)) & 0xff;

// Pre-decoded tile cache: 384 tiles * 64 px, 2-bit color index
const tilePix = new Uint8Array(384 * 64);
function decodeAllTiles() {
  for (let t = 0; t < 384; t++) {
    const base = t * 16;
    for (let y = 0; y < 8; y++) {
      const lo = vram[base + y * 2], hi = vram[base + y * 2 + 1];
      const row = t * 64 + y * 8;
      for (let x = 0; x < 8; x++) {
        const b = 7 - x;
        tilePix[row + x] = ((lo >> b) & 1) | (((hi >> b) & 1) << 1);
      }
    }
  }
}
decodeAllTiles();

const bgMap = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) bgMap[i] = (i * 7) & 0xff;
const winMap = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) winMap[i] = (i * 11) & 0xff;

// OAM: 40 sprites x 4 bytes (y, x, tile, flags)
const oam = new Uint8Array(160);
for (let s = 0; s < 40; s++) {
  oam[s * 4 + 0] = 16 + ((s * 13) % 144);
  oam[s * 4 + 1] = 8 + ((s * 29) % 160);
  oam[s * 4 + 2] = (s * 3) & 0xfe;
  oam[s * 4 + 3] = (s & 1) ? 0x10 : 0x00 | ((s % 3 === 0) ? 0x80 : 0);
}

// Per-scanline register snapshots (raster splits)
const scx = new Uint8Array(H), scy = new Uint8Array(H);
const bgp = new Uint8Array(H), obp0 = new Uint8Array(H), obp1 = new Uint8Array(H);
const wy = 80, wxArr = new Uint8Array(H);
for (let y = 0; y < H; y++) {
  scx[y] = (y * 3) & 0xff; scy[y] = (y >> 2) & 0xff;
  bgp[y] = 0xe4; obp0[y] = 0xd0; obp1[y] = 0xe0; wxArr[y] = 7;
}

// DMG shades -> RGBA (little-endian packed)
const SHADE = new Uint32Array([0xff9bbc0f, 0xff8bac0f, 0xff306230, 0xff0f380f]);

const frame = new Uint8ClampedArray(W * H * 4);
const frame32 = new Uint32Array(frame.buffer);

// scratch line buffers
const lineColor = new Uint8Array(W);   // 2-bit BG/win color index (pre-palette)
const lineIsBg0 = new Uint8Array(W);   // for sprite priority (BG color 0 = sprite always on top)

const spriteLine = new Int32Array(10 * 4); // up to 10 sprites/line

function renderFrame(signedTiles, winEnabled) {
  for (let y = 0; y < H; y++) {
    // ---------- BACKGROUND ----------
    const sy = (y + scy[y]) & 0xff;
    const tileRow = (sy >> 3) & 31;
    const py = sy & 7;
    let sxBase = scx[y];
    for (let x = 0; x < W; ) {
      const wx = (x + sxBase) & 0xff;
      const tileCol = (wx >> 3) & 31;
      let idx = bgMap[tileRow * 32 + tileCol];
      if (signedTiles) idx = 256 + ((idx << 24) >> 24); // $8800 signed addressing
      const src = idx * 64 + py * 8;
      let px = wx & 7;
      // inner: emit up to 8 px
      const n = Math.min(8 - px, W - x);
      for (let i = 0; i < n; i++) {
        const c = tilePix[src + px + i];
        lineColor[x + i] = c;
        lineIsBg0[x + i] = (c === 0) ? 1 : 0;
      }
      x += n;
    }

    // ---------- WINDOW ----------
    if (winEnabled && y >= wy) {
      const wline = y - wy;
      const wtr = (wline >> 3) & 31, wpy = wline & 7;
      const startX = wxArr[y] - 7;
      for (let x = Math.max(0, startX); x < W; ) {
        const wcol = ((x - startX) >> 3) & 31;
        let idx = winMap[wtr * 32 + wcol];
        if (signedTiles) idx = 256 + ((idx << 24) >> 24);
        const src = idx * 64 + wpy * 8;
        let px = (x - startX) & 7;
        const n = Math.min(8 - px, W - x);
        for (let i = 0; i < n; i++) {
          const c = tilePix[src + px + i];
          lineColor[x + i] = c;
          lineIsBg0[x + i] = (c === 0) ? 1 : 0;
        }
        x += n;
      }
    }

    // ---------- SPRITE SEARCH (8x16, OAM order, max 10) ----------
    let nsp = 0;
    for (let s = 0; s < 40 && nsp < 10; s++) {
      const sy0 = oam[s * 4] - 16;
      if (y >= sy0 && y < sy0 + 16) {
        spriteLine[nsp * 4 + 0] = oam[s * 4 + 1] - 8;   // x
        spriteLine[nsp * 4 + 1] = oam[s * 4 + 2] & 0xfe; // tile
        spriteLine[nsp * 4 + 2] = oam[s * 4 + 3];        // flags
        spriteLine[nsp * 4 + 3] = y - sy0;               // row within sprite
        nsp++;
      }
    }

    // ---------- COMPOSITE ----------
    const p = bgp[y];
    const bgLut0 = p & 3, bgLut1 = (p >> 2) & 3, bgLut2 = (p >> 4) & 3, bgLut3 = (p >> 6) & 3;
    const bgLut = [bgLut0, bgLut1, bgLut2, bgLut3];
    const out = y * W;
    for (let x = 0; x < W; x++) frame32[out + x] = SHADE[bgLut[lineColor[x]]];

    // sprites drawn back-to-front (reverse OAM order so lowest index wins)
    for (let si = nsp - 1; si >= 0; si--) {
      const sx = spriteLine[si * 4 + 0];
      let tile = spriteLine[si * 4 + 1];
      const fl = spriteLine[si * 4 + 2];
      let row = spriteLine[si * 4 + 3];
      if (fl & 0x40) row = 15 - row;         // Y flip
      if (row >= 8) { tile += 1; row -= 8; }
      const src = tile * 64 + row * 8;
      const pal = (fl & 0x10) ? obp1[y] : obp0[y];
      const behind = (fl & 0x80) !== 0;
      const xflip = (fl & 0x20) !== 0;
      for (let i = 0; i < 8; i++) {
        const px = sx + i;
        if (px < 0 || px >= W) continue;
        const c = tilePix[src + (xflip ? 7 - i : i)];
        if (c === 0) continue;
        if (behind && !lineIsBg0[px]) continue;
        frame32[out + px] = SHADE[(pal >> (c * 2)) & 3];
      }
    }
  }
}

// warm up
for (let i = 0; i < 60; i++) renderFrame(true, true);

const N = 600;
let t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) renderFrame(true, true);
let t1 = process.hrtime.bigint();
const msPerFrame = Number(t1 - t0) / 1e6 / N;
console.log(`full frame (BG + window + 40 sprites/10-per-line + per-scanline palettes): ${msPerFrame.toFixed(3)} ms/frame`);
console.log(`  => ${(msPerFrame / 16.67 * 100).toFixed(1)}% of a 60Hz frame budget`);
console.log(`  => headroom: ${(1000 / msPerFrame).toFixed(0)} fps if rendering were the only cost`);

// Also measure tile decode cost (full 384-tile re-decode)
t0 = process.hrtime.bigint();
for (let i = 0; i < 1000; i++) decodeAllTiles();
t1 = process.hrtime.bigint();
console.log(`full VRAM tile re-decode (384 tiles): ${(Number(t1 - t0) / 1e6 / 1000).toFixed(3)} ms`);
