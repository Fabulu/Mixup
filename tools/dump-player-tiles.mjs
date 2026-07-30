// Debug: assemble one player animation from the extracted tiles and write it
// as a PNG, so sprite-sheet problems can be told apart from placement bugs.
//   node tools/dump-player-tiles.mjs [animId]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT, gamePath } from './oracle/_env.mjs';

const manifest = JSON.parse(fs.readFileSync(gamePath('assets/manifest.json'), 'utf8'));
const pool = fs.readFileSync(gamePath('assets/player.tiles.bin'));
const animId = parseInt(process.argv[2] ?? '1', 10);

const SHADES = [[0xE0, 0xF8, 0xD0], [0x88, 0xC0, 0x70], [0x34, 0x68, 0x56], [0x08, 0x18, 0x20]];

function decodeTile(buf, off) {
  const t = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    const lo = buf[off + y * 2], hi = buf[off + y * 2 + 1];
    for (let x = 0; x < 8; x++) {
      const b = 7 - x;
      t[y * 8 + x] = ((lo >> b) & 1) | (((hi >> b) & 1) << 1);
    }
  }
  return t;
}

// Load the animation's 3 columns into OBJ tiles 0-11, exactly as the game does.
const obj = new Array(12);
const anim = manifest.player.anims[animId];
for (let col = 0; col < 3; col++) {
  for (let t = 0; t < 4; t++) obj[col * 4 + t] = decodeTile(pool, anim[col][t]);
}

// Compose using metasprite table1[1] (facing right).
const ms = manifest.metasprites.table1[1].sprites;
const W = 48, H = 64, OX = 24, OY = 32;
const px = new Uint8Array(W * H).fill(0);

for (const [dy, dx, tile, attr] of ms) {
  const flipX = (attr & 0x20) !== 0;
  for (let y = 0; y < 16; y++) {
    const src = y < 8 ? obj[tile & 0xFE] : obj[(tile | 1) & 0x0F];
    if (!src) continue;
    for (let x = 0; x < 8; x++) {
      const sx = flipX ? 7 - x : x;
      const ci = src[(y & 7) * 8 + sx];
      if (ci === 0) continue;
      const X = OX + dx + x, Y = OY + dy + y;
      if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      px[Y * W + X] = ci;
    }
  }
}

// Scale up so the result is actually inspectable by eye.
const S = 6;
const SW = W * S, SH = H * S;
const raw = Buffer.alloc((SW * 3 + 1) * SH);
for (let y = 0; y < SH; y++) {
  raw[y * (SW * 3 + 1)] = 0;
  for (let x = 0; x < SW; x++) {
    const c = SHADES[px[((y / S) | 0) * W + ((x / S) | 0)]];
    const o = y * (SW * 3 + 1) + 1 + x * 3;
    raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
  }
}
const chunk = (tag, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const body = Buffer.concat([Buffer.from(tag), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([l, body, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4); ihdr[8] = 8; ihdr[9] = 2;
const out = path.join(ROOT, `rip/port/playeranim${animId}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log('wrote', out);
console.log('tile offsets:', JSON.stringify(anim));
