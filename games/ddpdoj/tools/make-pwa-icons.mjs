// ORIGINAL PWA icons for the DaiOuJou page -- DOCKET D14.
//
//   node games/ddpdoj/tools/make-pwa-icons.mjs
//
// WHY A GENERATOR AND NOT THREE CHECKED-IN PNGs. Two reasons, and the second is
// the one that matters.
//
//   1. A binary blob in the tree has no provenance. Six months from now nobody
//      can tell whether a 512x512 PNG was drawn, downloaded, or cut out of a
//      screenshot. This file IS the provenance: every pixel below comes from the
//      constants in it.
//   2. `tools/build-dist.mjs` refuses to publish any file that appears verbatim
//      inside a ROM, and `tools/make-placeholder-tiles.mjs` exists because the
//      player's tile pool used to be lifted from bank 2 of the cartridge. An
//      icon cut from the running game would be cartridge graphics with extra
//      steps. **This generator never opens a ROM, never opens `assets/`, and
//      never reads a frame of the game.**
//
// WHAT IT DRAWS. A dark plate with a rounded border, a bright chevron reading as
// a ship nose-up, and a small three-dot burst under it. It is deliberately
// abstract and deliberately not the cabinet's artwork.
//
// THE PNG ENCODER IS HERE ON PURPOSE. It is about sixty lines -- signature,
// IHDR, one IDAT of zlib-deflated filter-0 rows, IEND, and a CRC32 -- and that
// is cheaper and far more auditable than a dependency. Node's own `zlib` does
// the compression, so the only thing hand-rolled is the chunk framing.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..');

// ------------------------------------------------------------------ the palette
// Picked to match the page's own CSS so the installed icon and the page agree:
// #0b0f14 is the page background, #cfe0ef its foreground, and the accent is the
// blue the bar's buttons use.
const PLATE = [0x0b, 0x0f, 0x14];
const EDGE = [0x2a, 0x34, 0x3d];
const INK = [0xcf, 0xe0, 0xef];
const ACCENT = [0x4d, 0xa3, 0xe8];

// --------------------------------------------------------------- the PNG encoder
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {Uint8Array} rgba  w*h*4, row-major */
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;            // bit depth
  ihdr[9] = 6;            // colour type 6 = RGBA
  // 10..12 stay 0: deflate, adaptive filtering, no interlace.
  // Filter byte 0 per row -- "None". A real encoder would try the other four to
  // save bytes; at these sizes the whole file is under 3 KB either way and an
  // unfiltered image is one fewer thing to get wrong.
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const dst = y * (1 + w * 4);
    raw[dst] = 0;
    rgba.subarray(y * w * 4, (y + 1) * w * 4).forEach((v, i) => { raw[dst + 1 + i] = v; });
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ the drawing
/**
 * @param size  square edge in pixels
 * @param bleed 0 for a normal icon; a fraction for MASKABLE, whose art must stay
 *   inside the safe zone because the platform may crop it to a circle. The spec's
 *   safe area is the middle 80%, so the glyph is drawn at 1 - 2*bleed and the
 *   plate fills the whole square.
 */
function draw(size, bleed = 0) {
  const px = new Uint8Array(size * size * 4);
  const put = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  // the plate, opaque everywhere -- a maskable icon must have no transparent
  // corners or the platform's crop shows the launcher through them
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, PLATE);

  const inset = Math.round(size * (0.06 + bleed));
  const edge = Math.max(1, Math.round(size / 64));

  // a rounded border, drawn as four runs plus four quarter arcs
  const r = Math.round(size * 0.14);
  const lo = inset, hi = size - 1 - inset;
  for (let t = 0; t < edge; t++) {
    for (let x = lo + r; x <= hi - r; x++) { put(x, lo + t, EDGE); put(x, hi - t, EDGE); }
    for (let y = lo + r; y <= hi - r; y++) { put(lo + t, y, EDGE); put(hi - t, y, EDGE); }
    for (let a = 0; a <= 90; a++) {
      const rad = (a * Math.PI) / 180;
      const dx = Math.cos(rad) * (r - t), dy = Math.sin(rad) * (r - t);
      put(Math.round(hi - r + dx), Math.round(lo + r - dy), EDGE);
      put(Math.round(lo + r - dx), Math.round(lo + r - dy), EDGE);
      put(Math.round(hi - r + dx), Math.round(hi - r + dy), EDGE);
      put(Math.round(lo + r - dx), Math.round(hi - r + dy), EDGE);
    }
  }

  // THE SHIP: a solid chevron pointing up, filled row by row so it needs no
  // polygon rasteriser. Proportions are in fractions of the size so every
  // resolution draws the same picture.
  const cx = (size - 1) / 2;
  const noseY = Math.round(size * (0.24 + bleed));
  const tailY = Math.round(size * (0.66 - bleed));
  const halfW = size * (0.20 - bleed * 0.6);
  for (let y = noseY; y <= tailY; y++) {
    const t = (y - noseY) / Math.max(1, tailY - noseY);
    const w = halfW * t;
    // a notch in the tail, so it reads as a ship and not a triangle
    const notch = t > 0.72 ? halfW * (t - 0.72) * 2.4 : 0;
    for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
      if (notch > 0 && Math.abs(x - cx) < notch) continue;
      put(x, y, INK);
    }
  }

  // THE BURST: three accent squares under the tail, the middle one larger.
  const bY = Math.round(size * (0.74 - bleed));
  const s = Math.max(1, Math.round(size * 0.045));
  const gap = Math.round(size * 0.10);
  for (const [ox, k] of [[-gap, 1], [0, 1.6], [gap, 1]]) {
    const half = Math.max(1, Math.round((s * k) / 2));
    for (let y = bY - half; y <= bY + half; y++) {
      for (let x = Math.round(cx + ox) - half; x <= Math.round(cx + ox) + half; x++) {
        put(x, y, ACCENT);
      }
    }
  }
  return png(size, size, px);
}

// ------------------------------------------------------------------------ write
mkdirSync(OUT, { recursive: true });
const FILES = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  // The maskable variant. Same drawing, art pulled into the middle 80% because
  // the platform may crop it to a circle or a squircle.
  ['icon-maskable-512.png', 512, 0.10],
];
for (const [name, size, bleed] of FILES) {
  const buf = draw(size, bleed);
  writeFileSync(path.join(OUT, name), buf);
  console.log(`wrote ${name}  ${size}x${size}  ${buf.length} bytes`);
}
console.log('\nNo ROM, no assets/, no frame of the game was read. Every pixel is '
  + 'from the constants in this file.');
