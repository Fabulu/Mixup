// Render a song through the ported driver + APU to a WAV, headless.
//
// This is how the driver gets judged by ear without a browser, and how its
// register stream gets compared with tools/oracle/sound.py's recording of the
// real one.
//
//   node tools/rendersong.mjs --id 2 --seconds 20
//   node tools/rendersong.mjs --id 0x10 --seconds 3 --out rip/sfx10.wav
//   node tools/rendersong.mjs --id 2 --dump 40        # first 40 ticks of writes

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
globalThis.fetch = async (url) => {
  const file = path.join(ROOT, String(url).replace(/^.*?assets\//, 'assets/'));
  const buf = fs.readFileSync(file);
  return { ok: true, json: async () => JSON.parse(buf.toString('utf8')),
           arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { APU, CPU_HZ } = await imp('src/sound/apu.js');
const { loadSoundData, createDriver, request, tick } = await imp('src/sound/driver.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const id = parseInt(arg('id', '2'), 0);
const seconds = parseFloat(arg('seconds', '15'));
const dump = parseInt(arg('dump', '0'), 10);
const RATE = 44100;
const out = path.join(ROOT, arg('out', `rip/song_${id.toString(16).padStart(2, '0')}.wav`));

const data = await loadSoundData();
const drv = createDriver(data);
const apu = new APU(RATE);
request(drv, id, 0x03);

if (dump) {
  for (let i = 0; i < dump; i++) {
    const w = tick(drv);
    const live = drv.tracks.map((t, n) => (t.active ? n : null)).filter((v) => v !== null);
    console.log(String(i).padStart(3), 'tracks[' + live.join(',') + ']',
      w.map(([a, v]) => '$' + a.toString(16) + '=' + v.toString(16).padStart(2, '0')).join(' '));
  }
  process.exit(0);
}

const total = Math.floor(RATE * seconds);
const L = new Float32Array(total), R = new Float32Array(total);
const perSample = CPU_HZ / RATE;
const cyclesPerTick = CPU_HZ / data.tickHz;

let cursor = 0, budget = 0;
while (cursor < total) {
  if (budget <= 0) {
    budget += cyclesPerTick;
    for (const [a, v] of tick(drv)) apu.write(a, v);
  }
  const n = Math.min(Math.max(1, Math.ceil(budget / perSample)), total - cursor);
  apu.render(L.subarray(cursor, cursor + n), R.subarray(cursor, cursor + n), n);
  budget -= n * perSample;
  cursor += n;
}

// 16-bit stereo WAV
const pcm = Buffer.alloc(total * 4);
let peak = 0;
for (let i = 0; i < total; i++) {
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, L[i] * 32767)), i * 4);
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, R[i] * 32767)), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(RATE, 24);
hdr.writeUInt32LE(RATE * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([hdr, pcm]));

let silent = 0;
for (let i = 0; i < total; i++) if (Math.abs(L[i]) < 1e-6 && Math.abs(R[i]) < 1e-6) silent++;
console.log(`song $${id.toString(16)}: ${seconds}s -> ${out}`);
console.log(`  peak ${peak.toFixed(3)}, silent ${(silent / total * 100).toFixed(1)}%`);
