// Golden-frame visual regression harness for src/render/*.
//
// Renders a fixed set of named scenarios through the REAL port modules and
// stores each captured frame as
//   * a SHA-256 of the 160x144 SHADE buffer (fb.shades) -- never the RGBA, so
//     retheming DMG_PALETTE does not invalidate the whole corpus, and
//   * an 8-bit *indexed* PNG whose palette index IS the shade, so the PNG is
//     both eyeballable and losslessly readable back as shades.
//
// Usage:
//   node tools/golden.mjs                    compare against tests/visual/golden
//   node tools/golden.mjs --update           (re)write the goldens
//   node tools/golden.mjs --diff             compare + write 3-panel diff PNGs
//   node tools/golden.mjs --only walk-jump-walk [--scale 3] [--list]
//
// Exits non-zero on any mismatch or missing golden.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const GOLDEN_DIR = path.join(ROOT, 'tests/visual/golden');
export const DIFF_DIR = path.join(ROOT, 'tests/visual/diff');
const HASH_FILE = path.join(GOLDEN_DIR, 'hashes.json');

// --- make the browser-shaped asset loader work on the filesystem -----------
// (same shim as tools/render-frame.mjs; installed on import so importers of
// this module can pull in src/* too)
if (!globalThis.__goldenFetchShim) {
  globalThis.__goldenFetchShim = true;
  globalThis.fetch = async (url) => {
    const rel = String(url).replace(/^.*?assets\//, 'assets/');
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) {
      return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const buf = fs.readFileSync(file);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  };
}

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const R = await imp('src/render/renderer.js');

export const { SCREEN_W, SCREEN_H, DMG_PALETTE } = R;

// ---------------------------------------------------------------------------
// Scenarios.  The scripts are the oracle regression corpus (tools/oracle/
// regress.mjs), so a golden frame and a physics trace describe the same run.
// `capture` = the frame numbers stored as goldens (1-based, like tick count).
// ---------------------------------------------------------------------------
export const SCENARIOS = [
  { name: 'fall-and-walk', level: 1, frames: 150, script: '20:,130:R',
    capture: [1, 2, 10, 30, 60, 90, 120, 150] },
  { name: 'walk-jump-walk', level: 1, frames: 120, script: '20:,40:R,10:RA,50:R',
    capture: [1, 20, 45, 62, 75, 100, 120] },
  { name: 'walljump-reverse', level: 1, frames: 200,
    script: '15:,25:R,8:RA,20:R,10:A,30:L,12:LA,40:R,40:',
    capture: [1, 30, 55, 80, 110, 150, 200] },
  { name: 'idle-then-left', level: 1, frames: 140, script: '30:,90:L,20:',
    capture: [1, 30, 60, 90, 120, 140] },
  { name: 'jump-spam', level: 1, frames: 180,
    script: '10:,20:RA,10:R,20:RA,10:R,20:RA,90:R',
    capture: [1, 25, 50, 75, 100, 140, 180] },
  // Other levels exercise different tilesets / camera clamps / boss pinning.
  { name: 'level02-walk', level: 2, frames: 120, script: '20:,100:R',
    capture: [1, 30, 60, 90, 120] },
  { name: 'level03-walk', level: 3, frames: 120, script: '20:,100:R',
    capture: [1, 30, 60, 90, 120] },
  { name: 'level06-walk', level: 6, frames: 120, script: '20:,100:R',
    capture: [1, 30, 60, 90, 120] },
  { name: 'level09-walk', level: 9, frames: 120, script: '20:,100:R',
    capture: [1, 30, 60, 90, 120] },
];

// ---------------------------------------------------------------------------
// PNG: 8-bit indexed writer + reader (stdlib zlib only).
// ---------------------------------------------------------------------------
function chunk(tag, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** 8-bit palette PNG; the stored byte per pixel IS the shade index. */
export function writeIndexedPNG(file, w, h, indices, palette = DMG_PALETTE) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    Buffer.from(indices.buffer, indices.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 3;                      // 8-bit, colour type 3 (palette)
  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('PLTE', plte),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

/** Inverse of writeIndexedPNG. @returns {{w,h,indices:Uint8Array}} */
export function readIndexedPNG(file) {
  const buf = fs.readFileSync(file);
  let off = 8, w = 0, h = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const tag = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (tag === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 3) throw new Error(`${file}: not an 8-bit indexed PNG`);
    } else if (tag === 'IDAT') idat.push(Buffer.from(data));
    else if (tag === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(w * h);
  let prev = new Uint8Array(w);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)];
    const line = raw.subarray(y * (w + 1) + 1, y * (w + 1) + 1 + w);
    const cur = out.subarray(y * w, y * w + w);
    for (let x = 0; x < w; x++) {
      const a = x > 0 ? cur[x - 1] : 0, b = prev[x], c = x > 0 ? prev[x - 1] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xFF;
    }
    prev = cur;
  }
  return { w, h, indices: out };
}

/** Truecolour PNG, for the diff sheets (they are not 4-colour). */
export function writeRGBAPNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// ---------------------------------------------------------------------------
// Running a scenario through the real modules.
// ---------------------------------------------------------------------------
const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };

export function expandScript(script) {
  const timeline = [];
  for (const seg of script.split(',')) {
    const [n, keys = ''] = seg.split(':');
    let mask = 0;
    for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
    for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
  }
  return timeline;
}

/**
 * @param {object} sc scenario
 * @param {{noSprites?:boolean}} [opts] noSprites renders the BG layer alone,
 *        which is what isolates background fidelity from sprite fidelity.
 * @returns {Promise<Map<number, {shades:Uint8Array, sprites:object[]}>>}
 * Deterministic: no clocks, no RNG, fresh state per call.
 */
export async function renderScenario(sc, opts = {}) {
  const state = createState(makeTunables());
  const manifest = await loadManifest();
  const playerTiles = await loadPlayerTiles();
  await initLevel(state, sc.level);

  const fb = R.createFramebuffer();
  const timeline = expandScript(sc.script);
  const want = new Set(sc.capture);
  const out = new Map();

  for (let f = 1; f <= sc.frames; f++) {
    const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
    state.input.pressed = held & ~state.input.prev;
    state.input.held = held;
    state.input.prev = held;

    tick(state, manifest, playerTiles);

    if (want.has(f)) {
      const sprites = state.video.sprites.map((s) => ({ ...s }));
      if (opts.noSprites) state.video.sprites.length = 0;
      R.renderFrame(state, fb);
      out.set(f, { shades: Uint8Array.from(fb.shades), sprites });
    }
  }
  return out;
}

export const shadeHash = (shades) =>
  crypto.createHash('sha256').update(shades).digest('hex').slice(0, 16);

export const goldenPNGPath = (name, frame) =>
  path.join(GOLDEN_DIR, name, `f${String(frame).padStart(4, '0')}.png`);

// ---------------------------------------------------------------------------
// Diff sheet: [golden | current | diff], nearest-neighbour scaled.
// ---------------------------------------------------------------------------
const SEP = 4;
function diffSheet(golden, current, scale) {
  const pw = SCREEN_W, ph = SCREEN_H;
  const w0 = pw * 3 + SEP * 2, h0 = ph;
  const src = new Uint8ClampedArray(w0 * h0 * 4);
  const put = (x, y, r, g, b) => {
    const o = (y * w0 + x) * 4;
    src[o] = r; src[o + 1] = g; src[o + 2] = b; src[o + 3] = 255;
  };
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = y * pw + x;
      const a = DMG_PALETTE[golden[i]], b = DMG_PALETTE[current[i]];
      put(x, y, a[0], a[1], a[2]);
      put(pw + SEP + x, y, b[0], b[1], b[2]);
      if (golden[i] === current[i]) {
        const v = 200 - current[i] * 30;                 // washed-out context
        put(pw * 2 + SEP * 2 + x, y, v, v, v);
      } else {
        put(pw * 2 + SEP * 2 + x, y, 255, 0, 220);       // magenta = changed
      }
    }
  }
  for (let y = 0; y < h0; y++) {
    for (let s = 0; s < SEP; s++) { put(pw + s, y, 60, 60, 60); put(pw * 2 + SEP + s, y, 60, 60, 60); }
  }
  if (scale === 1) return { w: w0, h: h0, rgba: src };
  const w = w0 * scale, h = h0 * scale;
  const dst = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = (y / scale) | 0;
    for (let x = 0; x < w; x++) {
      const si = (sy * w0 + ((x / scale) | 0)) * 4, di = (y * w + x) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = 255;
    }
  }
  return { w, h, rgba: dst };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const has = (n) => argv.includes(`--${n}`);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

  const only = arg('only', null);
  const scale = parseInt(arg('scale', '2'), 10);
  const update = has('update');
  const wantDiff = has('diff');
  const list = SCENARIOS.filter((s) => !only || s.name === only);

  if (has('list')) {
    for (const s of SCENARIOS) {
      console.log(`${s.name.padEnd(18)} L${String(s.level).padStart(2, '0')} ` +
                  `${String(s.frames).padStart(4)}f  ${s.capture.length} golden  "${s.script}"`);
    }
    console.log(`\n${SCENARIOS.length} scenarios, ` +
                `${SCENARIOS.reduce((a, s) => a + s.capture.length, 0)} golden frames`);
    return 0;
  }
  if (only && list.length === 0) { console.error(`no scenario named "${only}"`); return 2; }

  let book = { version: 1, note: 'sha256(fb.shades)[0:16] per captured frame', scenarios: {} };
  if (fs.existsSync(HASH_FILE)) book = JSON.parse(fs.readFileSync(HASH_FILE, 'utf8'));
  if (update && !only) book.scenarios = {};

  let fail = 0, checked = 0, written = 0;
  const report = [];

  for (const sc of list) {
    const frames = await renderScenario(sc);
    const rec = { level: sc.level, frames: sc.frames, script: sc.script, hashes: {} };
    const prev = book.scenarios[sc.name];

    if (update) {
      for (const [f, { shades }] of frames) {
        rec.hashes[f] = shadeHash(shades);
        writeIndexedPNG(goldenPNGPath(sc.name, f), SCREEN_W, SCREEN_H, shades);
        written++;
      }
      book.scenarios[sc.name] = rec;
      report.push({ name: sc.name, n: frames.size, status: 'WROTE', bad: [] });
      continue;
    }

    if (!prev) { report.push({ name: sc.name, n: frames.size, status: 'NO GOLDEN', bad: [] }); fail++; continue; }
    const bad = [];
    for (const [f, { shades }] of frames) {
      checked++;
      const want = prev.hashes[String(f)];
      const got = shadeHash(shades);
      if (want === got) continue;
      let px = null;
      const gp = goldenPNGPath(sc.name, f);
      if (want && fs.existsSync(gp)) {
        const g = readIndexedPNG(gp).indices;
        px = 0;
        for (let i = 0; i < shades.length; i++) if (g[i] !== shades[i]) px++;
        if (wantDiff) {
          const sheet = diffSheet(g, shades, scale);
          writeRGBAPNG(path.join(DIFF_DIR, `${sc.name}_f${String(f).padStart(4, '0')}.png`),
                       sheet.w, sheet.h, sheet.rgba);
        }
      }
      bad.push({ f, px, missing: !want });
    }
    if (bad.length) fail++;
    report.push({ name: sc.name, n: frames.size, status: bad.length ? 'FAIL' : 'OK', bad });
  }

  if (update) {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(HASH_FILE, JSON.stringify(book, null, 1) + '\n');
    console.log(`wrote ${written} golden frames + ${path.relative(ROOT, HASH_FILE)}`);
    return 0;
  }

  const total = SCREEN_W * SCREEN_H;
  console.log('scenario'.padEnd(20) + 'frames  status');
  for (const r of report) {
    console.log(r.name.padEnd(20) + String(r.n).padStart(6) + '  ' + r.status);
    for (const b of r.bad) {
      const detail = b.missing ? 'no golden hash for this frame'
        : b.px === null ? 'hash mismatch (golden PNG missing, no pixel count)'
        : `${b.px} px differ (${(b.px / total * 100).toFixed(2)}%)`;
      console.log(`    f${String(b.f).padStart(4, '0')}  ${detail}`);
    }
  }
  console.log(`\n${checked} golden frames checked`);
  if (fail) {
    console.log(`FAIL: ${fail} scenario(s) differ` +
                (wantDiff ? `\ndiff sheets in ${path.relative(ROOT, DIFF_DIR)}` :
                 '\nre-run with --diff to write visual diff sheets'));
  } else console.log('PASS: every golden frame matches');
  return fail ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
