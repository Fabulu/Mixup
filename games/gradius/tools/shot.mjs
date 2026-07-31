// shot.mjs -- dump frames as PNG so a human/agent can LOOK at what the emulator drew.
import fs from "node:fs";
import zlib from "node:zlib";
import { NES, Controller } from "jsnes";

const romPath = process.argv[2];
const at = process.argv[3].split(",").map(Number);
const outDir = process.argv[4] ?? ".";
const rom = fs.readFileSync(romPath);
let fb = null;
const nes = new NES({ onFrame: (b) => { fb = b; }, onAudioSample: () => {} });
nes.loadROM(Array.from(rom, (b) => String.fromCharCode(b)).join(""));

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const v = rgba[y * w + x];
      raw[p++] = v & 255; raw[p++] = (v >> 8) & 255; raw[p++] = (v >> 16) & 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) : crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  function crc32(buf) {
    let c, t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let crc = 0xffffffff;
    for (const b of buf) crc = t[(crc ^ b) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const want = new Set(at);
for (let f = 0; f <= Math.max(...at); f++) {
  if (f >= 200 && f <= 210) nes.buttonDown(1, Controller.BUTTON_START);
  else nes.buttonUp(1, Controller.BUTTON_START);
  nes.frame();
  if (want.has(f)) {
    fs.writeFileSync(`${outDir}/frame${f}.png`, png(256, 240, fb));
    console.log(`wrote frame${f}.png  scrollX=$${nes.cpu.mem[0x12].toString(16)} chr=$${nes.cpu.mem[0x2d].toString(16)}`);
  }
}
