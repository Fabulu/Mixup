// Render the ENDING through src/render/renderer.js and diff the PIXELS against
// the cartridge's own screen.
//
// endingdiff.mjs already proves the DATA: 115712/115712 VRAM bytes across the
// six screens and the whole crawl. That is not the same as proving the SCREEN.
// The stage-intro card was byte-exact at 327680/327680 and still rendered
// wrong, because rasterBands()' menu guard did not know about it -- a fault no
// amount of VRAM comparison can see. So this renders real frames and counts
// wrong pixels.
//
//   python tools/oracle/ending.py --no-vram --shots crawl \
//       --out rip/oracle/ending-shots.json
//   node tools/oracle/endingshot.mjs [--write]
//
// `--shots crawl` is the standing list: every 30th frame from f1500 to f4110,
// 88 frames, 2,027,520 pixels, all 100%. The old `landmarks` list was eight
// frames, and that was fairly called out as nothing -- the sequence runs 4137
// frames (~69 s) and the credit circles do not start until ~f1500, so eight
// samples could not support any claim about them. They do now: the circle's
// dithered edge is bit-for-bit the cartridge's on all 88 frames.
//
// The render LAG is pinned, not assumed. The port's tick N leaves the state the
// VBlank at the end of frame N pushes to rBGP and OAM, and the recorder grabs
// pyboy.screen after its own tick returns -- so the shot for counter N shows
// something the port produced a fixed number of ticks earlier. Rather than
// argue about how many, every lag in LAGS is tried and ONE of them has to be
// exact on every frame; the run fails if none is, or if two frames need
// different ones. MEASURED: lag 2, on all eight.
//
// Two of the eight shots are deliberately taken INSIDE a sub_00_0A7F fade,
// where consecutive frames differ. Without those the whole thing is unfalsifi-
// able: during a 432-frame hold every lag matches.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readIndexedPNG, writeIndexedPNG, DMG_PALETTE } from '../golden.mjs';
import { createState } from '../../src/state.js';
import { renderFrame, createFramebuffer } from '../../src/render/renderer.js';
import { loadEnding, showEnding, tickEnding } from '../../src/ending.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SHOTS = path.join(ROOT, 'rip', 'oracle', 'endingshots');
const REF = path.join(ROOT, 'rip', 'oracle', 'ending-shots.json');
const OUT = path.join(ROOT, 'rip', 'endingvis');
const W = 160;
const H = 144;
const LAGS = [0, 1, 2, 3];
const write = process.argv.includes('--write');

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'));
const r = JSON.parse(fs.readFileSync(REF, 'utf8'));

const frames = (r.shotFrames || []).slice().sort((a, b) => a - b);
if (!frames.length) {
  console.error(`${path.relative(ROOT, REF)} lists no shotFrames -- re-run
`
    + '  python tools/oracle/ending.py --no-vram --shots "..." '
    + '--out rip/oracle/ending-shots.json');
  process.exit(1);
}
const want = Math.max(...frames);
const keep = new Set();
for (const f of frames) for (const l of LAGS) keep.add(f - l);

// --- drive the port once and keep every frame we have a screenshot for ------
const state = createState();
state.titleManifest = manifest;
state.sound = { queue: [] };
state.video.obp1 = r.snaps.before.regs.FFAF;    // inherited; see endingdiff.mjs
// Level 14 is what state.level.number holds when the ending is entered, and
// rasterBands() derives the raster arm from it: level $0E is RASTER_OFF, so the
// band list is a single full-screen band. That is right, but it is right by
// coincidence -- see the note at the bottom.
state.level.number = 0x0E;
const art = loadEnding(manifest, null);
showEnding(state, art);

const fb = createFramebuffer();

const shots = new Map();
for (let f = 1; f <= want + 2; f++) {
  state.input.pressed = 0;
  tickEnding(state);
  if (keep.has(f)) {
    renderFrame(state, fb);
    shots.set(f, Uint8Array.from(fb.shades));
  }
}

// --- pin the lag, then report ----------------------------------------------
let failed = 0;
const totals = new Map(LAGS.map((l) => [l, { bad: 0, n: 0 }]));

console.log('frame   best-lag   wrong px   %');
const rows = [];
for (const f of frames) {
  const real = readIndexedPNG(path.join(SHOTS, `f${String(f).padStart(4, '0')}.png`));
  if (real.w !== W || real.h !== H) throw new Error(`f${f}: ${real.w}x${real.h}`);
  let best = null;
  for (const lag of LAGS) {
    const got = shots.get(f - lag);
    if (!got) continue;
    let bad = 0;
    for (let i = 0; i < W * H; i++) if (got[i] !== real.indices[i]) bad++;
    const t = totals.get(lag);
    t.bad += bad; t.n += W * H;
    if (best === null || bad < best.bad) best = { lag, bad };
  }
  rows.push({ f, ...best });
  console.log(`${String(f).padStart(5)}   ${String(best.lag).padStart(8)}   `
    + `${String(best.bad).padStart(8)}   `
    + `${(100 - best.bad * 100 / (W * H)).toFixed(2)}`);
  if (write) {
    const side = new Uint8Array(W * 2 * H);
    const mine = shots.get(f - best.lag);
    for (let y = 0; y < H; y++) {
      side.set(mine.subarray(y * W, y * W + W), y * W * 2);
      side.set(real.indices.subarray(y * W, y * W + W), y * W * 2 + W);
    }
    writeIndexedPNG(path.join(OUT, `f${f}.png`), W * 2, H, side, DMG_PALETTE);
  }
}

console.log('\nper-lag totals (the lag must be the SAME on every frame):');
for (const [lag, t] of totals) {
  console.log(`  lag ${String(lag).padStart(2)}  ${t.bad}/${t.n} wrong  `
    + `${(100 - t.bad * 100 / t.n).toFixed(3)}%`);
}

// One lag has to be exact on EVERY frame. A per-frame "best lag" proves
// nothing on its own: during a 432-frame hold the port's output does not change
// from frame to frame, so every lag scores zero there.
const full = rows.length * W * H;
const exact = LAGS.filter((l) => totals.get(l).bad === 0 && totals.get(l).n === full);
const wrong = rows.filter((x) => x.bad > 0);
if (wrong.length) {
  console.log(`\n${wrong.length} of ${rows.length} frame(s) are NOT pixel-exact at `
    + `any lag: ${wrong.map((x) => `f${x.f} (${x.bad})`).join(', ')}`);
  failed = 1;
} else if (!exact.length) {
  console.log('\nevery frame is exact at SOME lag but no single lag is exact on '
    + `all of them: ${rows.map((x) => `f${x.f}=${x.lag}`).join(' ')}`);
  failed = 1;
} else {
  console.log(`\nPIXEL-EXACT -- ${rows.length} frames, ${full} pixels, `
    + `at render lag ${exact.join('/')}`);
}
if (write) console.log(`side-by-side sheets in ${path.relative(ROOT, OUT)}`);
process.exit(failed);
