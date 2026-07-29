// The two DMG SPRITE-PIPELINE rules, measured against the cartridge's own OAM.
//
// pixeldiff.mjs compares whole frames, so a compositor rule and a wrong sprite
// LIST are indistinguishable in its output.  This one removes that ambiguity:
// it runs the port to frame N for the background, then throws the port's sprite
// list away and feeds the renderer the 40 OAM entries the cartridge actually
// had.  Whatever is left is a compositing difference and nothing else.
//
// It settles two things the port used to get wrong:
//
//   1. TEN SPRITES PER SCANLINE.  The DMG's OAM scan keeps the first ten
//      entries whose Y covers the line, in OAM order, and drops the rest for
//      that line.  MEASURED: level 12 around f119 puts 21 sprites on lines
//      78-94 -- eleven of them are dropped by hardware, every frame, and the
//      drop set moves as $FFA7 flips the queue order, which is the flicker.
//
//   2. ATTR BIT 7 COMPARES THE BG COLOUR INDEX, not the resolved shade.  With
//      BGP = $E4 the two agree, which is why nothing caught it; the moment a
//      screen writes another BGP they do not.
//
// Both are checked by MAKING THEM FAIL: every scenario is rendered twice, once
// with the rule and once with `spritesPerLine: 40`, and the run is only
// meaningful if the second is worse.  A limit that costs nothing is a limit
// that is not being exercised, and the tool says so.
//
// Usage:
//   python tools/oracle/pixelscen.py --level 12 --frames 130 \
//       --script "20:,180:R" --capture 118,119,120,121,122,123 \
//       --out rip/oracle/pix/l12-crowd.json
//   node tools/oracle/spritelimit.mjs
//   node tools/oracle/spritelimit.mjs --record      # re-record first

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIR = path.join(ROOT, 'rip', 'oracle', 'pix');

globalThis.fetch = async (u) => {
  const file = path.join(ROOT, String(u).replace(/^.*?(assets)/, '$1'));
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, json: async () => ({}),
             arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const buf = fs.readFileSync(file);
  return { ok: true, status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset,
                                              buf.byteOffset + buf.byteLength) };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const R = await imp('src/render/renderer.js');

const W = R.SCREEN_W, H = R.SCREEN_H, TOTAL = W * H;

// TWO DIFFERENT LAGS, and they are not the same number -- getting this wrong
// costs ~1300 px a frame and looks exactly like a compositor bug.
//
//   SCREEN_LAG = 1: the panel shows iteration N's picture during tick N+1, so
//     the port's frame N is compared against the recording's frame N+1.  This
//     is pixeldiff.mjs's rule and it is unchanged.
//   OAM_LAG = 0: the recorder reads $FE00 at the END of a tick, and the shadow
//     OAM is DMA'd during that same tick's VBlank -- so tick N's OAM is
//     already iteration N's list, the one the panel will draw during N+1.
//
// MEASURED rather than reasoned: sweeping the OAM offset over 0/1/2 on level
// 12 f119-122 gives 0 / ~1300 / ~1100 wrong pixels.  Offset 0 is exact.
const SCREEN_LAG = 1;
const OAM_LAG = 0;

// The crowded frames are the point: level 12's mid-level pack puts 21 entries
// on one line for a solid ten-frame stretch.  The quiet ones are the control --
// they must stay exactly as good as they were before the cut existed.
const SCEN = [
  { name: 'l12-crowd', level: 12, frames: 130, script: '20:,180:R',
    capture: [118, 119, 120, 121, 122, 123] },
  { name: 'l10-sky',   level: 10, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
  { name: 'l13-walk',  level: 13, frames: 200, script: '20:,180:R',
    capture: [40, 80, 120, 160, 200] },
];

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);

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

/**
 * Shadow OAM -> the renderer's sprite records.  The hardware offsets are the
 * whole conversion: OAM Y is screen Y + 16 and OAM X is screen X + 8, and an
 * entry is OFF only when Y is 0 or >= 160.  An entry parked at X = 0 is still
 * scanned and still spends one of the ten slots, so it must survive into the
 * list rather than being filtered out here.
 */
function oamToSprites(raw) {
  const out = [];
  for (const [y, x, tile, attr] of raw) {
    if (y === 0 || y >= 160) continue;
    out.push({ y: y - 16, x: x - 8, tile, attr });
  }
  return out;
}

const rows = [];
let failed = false;

for (const sc of SCEN) {
  if (only && sc.name !== only) continue;
  const file = path.join(DIR, `${sc.name}.json`);
  if (has('record') || !fs.existsSync(file)) {
    execFileSync('python', ['tools/oracle/pixelscen.py',
      '--level', String(sc.level), '--frames', String(sc.frames),
      '--script', sc.script, '--capture', sc.capture.join(','),
      '--out', path.relative(ROOT, file)], { cwd: ROOT, stdio: 'inherit' });
  }
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));

  // The port has to be re-walked per capture frame, because the render has to
  // happen at the tick that produced the state.  Cheap enough at these lengths.
  const manifest = await loadManifest();
  const playerTiles = await loadPlayerTiles();
  const state = createState(makeTunables());
  await initLevel(state, sc.level);
  const fb = R.createFramebuffer();
  const timeline = expand(sc.script);
  const want = new Set(sc.capture);

  for (let f = 1; f <= sc.frames; f++) {
    const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
    state.input.pressed = held & ~state.input.prev;
    state.input.held = held;
    state.input.prev = held;
    tick(state, manifest, playerTiles);
    if (!want.has(f)) continue;
    const m = ref.frames[String(f + SCREEN_LAG)];
    const src = ref.frames[String(f + OAM_LAG)];
    if (!m || !src) continue;

    const sprites = oamToSprites(src.oam);
    // How crowded is this frame, on the cartridge's own OAM?
    const perLine = new Int32Array(H);
    for (const s of sprites) {
      for (let p = 0; p < 16; p++) {
        const y = s.y + p;
        if (y >= 0 && y < H) perLine[y]++;
      }
    }
    const worstLine = Math.max(...perLine);

    const saved = state.video.sprites;
    state.video.sprites = sprites;
    R.renderFrame(state, fb);
    let bad = 0;
    for (let i = 0; i < TOTAL; i++) if (m.screen[i] !== fb.shades[i]) bad++;
    // The same frame with the rule switched off -- the failure the check needs
    // in order to be a check.
    R.renderFrame(state, fb, { spritesPerLine: R.MAX_SPRITES });
    let badOff = 0;
    for (let i = 0; i < TOTAL; i++) if (m.screen[i] !== fb.shades[i]) badOff++;
    state.video.sprites = saved;

    rows.push({ sc: sc.name, f, oam: sprites.length, worstLine, bad, badOff });
    if (bad > badOff) failed = true;
  }
}

console.log('\nscenario     frame  romOAM  max/line   bad px   bad px (rule OFF)  '
            + 'rule worth');
for (const r of rows) {
  const worth = r.badOff - r.bad;
  console.log(`${r.sc.padEnd(12)}${String(r.f).padStart(6)}`
    + `${String(r.oam).padStart(8)}${String(r.worstLine).padStart(10)}`
    + `${String(r.bad).padStart(9)}${String(r.badOff).padStart(20)}`
    + `${(worth > 0 ? '+' : '') + worth}`.padStart(12)
    + (r.worstLine > R.MAX_SPRITES_PER_LINE && worth <= 0
        ? '   <-- CROWDED BUT THE RULE COSTS NOTHING: check the check' : ''));
}
const exercised = rows.filter((r) => r.worstLine > R.MAX_SPRITES_PER_LINE);
console.log(`\n${rows.length} frames, ${exercised.length} of them over the `
  + `ten-per-line limit (max ${Math.max(0, ...rows.map((r) => r.worstLine))} `
  + `sprites on one line).`);
console.log(`total wrong px: ${rows.reduce((a, r) => a + r.bad, 0)} with the `
  + `rule, ${rows.reduce((a, r) => a + r.badOff, 0)} without it.`);
if (!exercised.length) {
  console.log('NOTHING EXERCISED THE LIMIT -- this run proves nothing.');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
