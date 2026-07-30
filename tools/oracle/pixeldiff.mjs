// PIXELS, on any level.  The gameplay counterpart to introscreen.mjs.
//
// tools/compare_visual.mjs does this for level 1 only and buckets the delta
// against an attribution model that predates the enemy/HUD port.  This one is
// deliberately dumb: run the same scenario through src/*, diff the 160x144
// shade buffer against what the cartridge actually displayed, and report where
// the wrong pixels are -- per scanline, and per sprite rectangle -- so a
// compositor fault can be told apart from a scroll fault.
//
// Usage:
//   node tools/oracle/pixeldiff.mjs                  every scenario, record if needed
//   node tools/oracle/pixeldiff.mjs --only l9-sky --record
//   node tools/oracle/pixeldiff.mjs --only l6-track
//
// WHAT THE REMAINING NUMBERS ARE. Most of what is left is not a defect, and
// reading this table without that is how "we are close to perfect" turns into
// chasing ghosts. Two families cover nearly all of it:
//
//   1. THE WATER DITHER -- l1-water and l2-water (~94.5% from f120) and
//      l1-spouts (50-70%, worst in the suite). Deliberate, and documented at
//      drawWindow: on hardware the window is opaque and the ROM alternates the
//      water slab at 30 Hz, which a DMG's slow LCD integrates into
//      translucency. A modern display turns that into a violent strobe over a
//      third of the screen, so the port approximates it SPATIALLY -- every
//      other pixel -- instead. Against a single captured frame that is ~half
//      the water rows "wrong" by construction. l1-spouts is warped to column 95
//      where the water column is far taller, which is the whole reason its
//      number is the biggest here. DO NOT "fix" this; see drawWindow.
//
//   2. THE PARALLAX FEEDER RACE -- l9-sky and l10-sky (~87% from f120) and
//      l11-sky f80. One pixel of SCX on the far sky band, which on a detailed
//      band mismatches most of the pixels in its rows. Instruction-level
//      timing, measured both ways, out of scope by docs/03 §28 and §36.
//
// What that leaves genuinely open is small: l5-walk f80 (315 px) and l9-sky f80
// (14 px). Everything else in the suite is 100%.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIR = path.join(ROOT, 'rip', 'oracle', 'pix');

globalThis.fetch = async (u) => {
  const file = path.join(ROOT, String(u).replace(/^.*?(assets)/, '$1'));
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = fs.readFileSync(file);
  return { ok: true, status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const R = await imp('src/render/renderer.js');

const W = R.SCREEN_W, H = R.SCREEN_H, TOTAL = W * H;

// Scenarios: chosen to cover every raster arm and both sprite-heavy shapes.
const SCEN = [
  { name: 'l1-water',  level: 1, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l1-spouts', level: 1, frames: 200, script: '20:,180:R', warp: '95',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l2-water',  level: 2, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l3-walk',   level: 3, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l5-walk',   level: 5, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l6-track',  level: 6, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l7-walk',   level: 7, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l9-sky',    level: 9, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l10-sky',   level: 10, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l11-sky',   level: 11, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l12-walk',  level: 12, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l13-walk',  level: 13, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l14-walk',  level: 14, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l4-boss',   level: 4, frames: 260, script: '20:,240:R',
    capture: [60, 120, 180, 240] },
  { name: 'l8-boss',   level: 8, frames: 260, script: '20:,240:R',
    capture: [60, 120, 180, 240] },
];

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const record = has('record');
const LAG = 1;                                    // panel shows iteration N at N+1

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
function expand(script) {
  const t = [];
  for (const seg of script.split(',')) {
    const [n, keys = ''] = seg.split(':');
    let m = 0;
    for (const k of keys.trim()) m |= BTN[k.toUpperCase()] || 0;
    for (let i = 0; i < parseInt(n, 10); i++) t.push(m);
  }
  return t;
}

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();

async function runPort(sc) {
  const state = createState(makeTunables());
  await initLevel(state, sc.level);
  const fb = R.createFramebuffer();
  const timeline = expand(sc.script);
  const want = new Set(sc.capture);
  const out = new Map();
  if (sc.ammo != null) state.flow.ammo = sc.ammo & 0xFF;
  for (let f = 1; f <= sc.frames; f++) {
    const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
    state.input.pressed = held & ~state.input.prev;
    state.input.held = held;
    state.input.prev = held;
    tick(state, manifest, playerTiles);
    if (f === 1 && sc.warp) {                     // applied after frame 1
      const [c, r] = sc.warp.split(',').map((v) => parseInt(v, 10));
      state.player.x = ((c & 0xFF) << 8) | 0x80;
      if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
    }
    if (want.has(f)) {
      const sprites = state.video.sprites.map((s) => ({ ...s }));
      R.renderFrame(state, fb);
      out.set(f, { shades: Uint8Array.from(fb.shades), sprites,
                   frame: state.frame });
    }
  }
  return out;
}

const rows = [];
for (const sc of SCEN) {
  if (only && sc.name !== only) continue;
  const file = path.join(DIR, `${sc.name}.json`);
  if (record || !fs.existsSync(file)) {
    const a = ['tools/oracle/pixelscen.py', '--level', String(sc.level),
      '--frames', String(sc.frames), '--script', sc.script,
      '--capture', sc.capture.join(','), '--out', path.relative(ROOT, file)];
    if (sc.warp) a.push('--warp', sc.warp);
    if (sc.ammo != null) a.push('--ammo', String(sc.ammo));
    execFileSync('python', a, { cwd: ROOT, stdio: 'inherit' });
  }
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ours = await runPort(sc);

  for (const f of sc.capture) {
    const m = ref.frames[String(f + LAG)];
    const o = ours.get(f);
    if (!m || !o) continue;
    const want = m.screen;
    let bad = 0;
    const perRow = new Int32Array(H);
    for (let i = 0; i < TOTAL; i++) {
      if (want[i] !== o.shades[i]) { bad++; perRow[(i / W) | 0]++; }
    }
    // Best whole-frame horizontal shift, to separate "scrolled wrong" from
    // "drawn wrong".
    let best = bad, bestDx = 0;
    for (let dx = -16; dx <= 16; dx++) {
      if (!dx) continue;
      let n = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const sx = x - dx;
          if (sx < 0 || sx >= W) { n++; continue; }
          if (want[y * W + x] !== o.shades[y * W + sx]) n++;
        }
      }
      if (n < best) { best = n; bestDx = dx; }
    }
    const worst = [...perRow].map((v, y) => [y, v]).filter((r) => r[1])
      .sort((a, b) => b[1] - a[1]).slice(0, 6);
    rows.push({ sc: sc.name, f, bad, pct: (TOTAL - bad) / TOTAL,
                best, bestDx, worst,
                romOam: m.oam.filter((e) => e[0] !== 0).length,
                portSpr: o.sprites.length, parity: m.regs.parity,
                lagf: m.regs.lag });
  }
}

console.log('\nscenario      frame   match      bad px   bestShift   romOAM portSPR par lag');
for (const r of rows) {
  console.log(`${r.sc.padEnd(12)}${String(r.f).padStart(6)}  `
    + `${(r.pct * 100).toFixed(2).padStart(7)}%${String(r.bad).padStart(9)}`
    + `   dx=${String(r.bestDx).padStart(3)}:${String(r.best).padStart(6)}`
    + `${String(r.romOam).padStart(8)}${String(r.portSpr).padStart(8)}`
    + `${String(r.parity).padStart(4)}${String(r.lagf).padStart(4)}`
    + (r.worst.length ? `   rows ${r.worst.map((w) => `${w[0]}:${w[1]}`).join(' ')}` : ''));
}
const tot = rows.reduce((a, r) => a + r.bad, 0);
console.log(`\n${rows.length} frames, ${tot} wrong pixels, `
  + `${(rows.reduce((a, r) => a + r.pct, 0) / rows.length * 100).toFixed(3)}% mean match`);
