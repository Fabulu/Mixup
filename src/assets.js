// Loads the data extracted from the ROM by tools/export_assets.py.

const BASE = '../assets/';

let manifest = null;
const levelCache = new Map();
let playerTiles = null;

export async function loadManifest() {
  if (!manifest) {
    const r = await fetch(BASE + 'manifest.json');
    if (!r.ok) throw new Error(`assets/manifest.json missing (${r.status}) - run: python tools/export_assets.py`);
    manifest = await r.json();
  }
  return manifest;
}

export async function loadPlayerTiles() {
  if (!playerTiles) {
    const r = await fetch(BASE + 'player.tiles.bin');
    playerTiles = new Uint8Array(await r.arrayBuffer());
  }
  return playerTiles;
}

/**
 * @returns {{info:object, cells:Uint8Array, vram:Uint8Array}}
 *   cells = the $D000 image (2 B/cell, column-major, 16 rows per column)
 *   vram  = the $8000-$9FFF image after the level's resource loads
 */
export async function loadLevel(n) {
  if (levelCache.has(n)) return levelCache.get(n);
  const m = await loadManifest();
  const pad = String(n).padStart(2, '0');

  const [cellsBuf, vramBuf] = await Promise.all([
    fetch(`${BASE}levels/${pad}.map.bin`).then((r) => r.arrayBuffer()),
    fetch(`${BASE}levels/${pad}.vram.bin`).then((r) => r.arrayBuffer()),
  ]);

  const out = {
    info: m.levels[n - 1],
    cells: new Uint8Array(cellsBuf),
    vram: new Uint8Array(vramBuf),
  };
  levelCache.set(n, out);
  return out;
}

/**
 * Decode one 2bpp tile into 64 palette indices (0-3).
 * BG/window tiles use the SIGNED $8800 region because the game writes
 * rLCDC = $E7 at every site (master reference §7.1).
 */
export function decodeTile(vram, addr) {
  const out = new Uint8Array(64);
  const base = addr - 0x8000;
  for (let y = 0; y < 8; y++) {
    const lo = vram[base + y * 2];
    const hi = vram[base + y * 2 + 1];
    for (let x = 0; x < 8; x++) {
      const b = 7 - x;
      out[y * 8 + x] = ((lo >> b) & 1) | (((hi >> b) & 1) << 1);
    }
  }
  return out;
}

/** Decode a 2bpp tile straight out of a raw buffer at a byte offset. */
export function decodeTileBuf(buf, offset) {
  const out = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    const lo = buf[offset + y * 2];
    const hi = buf[offset + y * 2 + 1];
    for (let x = 0; x < 8; x++) {
      const b = 7 - x;
      out[y * 8 + x] = ((lo >> b) & 1) | (((hi >> b) & 1) << 1);
    }
  }
  return out;
}

export const bgTileAddr = (id) => (id < 0x80 ? 0x9000 + id * 16 : 0x8800 + (id - 0x80) * 16);
export const objTileAddr = (id) => 0x8000 + id * 16;

/** Pre-decode every BG and OBJ tile once per level: 384 + 256 tiles. */
export function buildTileCache(vram) {
  const bg = new Array(256);
  for (let i = 0; i < 256; i++) bg[i] = decodeTile(vram, bgTileAddr(i));
  const obj = new Array(256);
  for (let i = 0; i < 256; i++) obj[i] = decodeTile(vram, objTileAddr(i));
  return { bg, obj };
}
