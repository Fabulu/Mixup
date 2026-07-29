// Do the MENU screens LOOK right?
//
// titlediff.mjs proves the title's 8192 VRAM bytes and roundseldiff.mjs proves
// the cursor logic. Neither can see a palette, a sprite nobody draws, or a fade
// that is missing. This compares the 160x144 shade indices our renderer
// produces against the ones the cartridge actually displayed, recorded by
// tools/oracle/menushot.py.
//
// Usage:  node tools/oracle/menuscreen.mjs [--record] [--dump tag]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const REF = path.join(ROOT, 'rip', 'oracle', 'menus.json');

globalThis.fetch = async (u) => {
  const file = path.join(ROOT, String(u).replace(/^.*?(assets)/, '$1'));
  const buf = fs.readFileSync(file);
  return {
    ok: true, status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset,
                                              buf.byteOffset + buf.byteLength),
  };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

if (process.argv.includes('--record') || !fs.existsSync(REF)) {
  execFileSync('python', ['tools/oracle/menushot.py', '--out',
                          path.relative(ROOT, REF)],
               { cwd: ROOT, stdio: 'inherit' });
}
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { loadManifest } = await imp('src/assets.js');
const { resolveLoadout } = await imp('src/mods.js');
const R = await imp('src/render/renderer.js');
const T = await imp('src/title.js');
const RS = await imp('src/roundselect.js');
const O = await imp('src/options.js');
const RA = await imp('src/raster.js');

const manifest = await loadManifest();
const titleArt = await T.loadTitle();
const rsArt = await RS.loadRoundSelect(manifest, titleArt.vram);

function fresh() {
  const state = createState(makeTunables(resolveLoadout([]).tunables));
  state.loadout = resolveLoadout([]);
  state.tables = manifest.tables;
  state.titleManifest = manifest;
  return state;
}

function noInput(state) { state.input.pressed = 0; state.input.held = 0; }

/** Drive the port to each landmark the recorder snapped. */
const CASES = {
  title(state) {
    T.showTitle(state, titleArt);
    for (let i = 0; i < 60; i++) { noInput(state); T.tickTitle(state); }
  },
  'title-option'(state) {
    T.showTitle(state, titleArt);
    for (let i = 0; i < 40; i++) { noInput(state); T.tickTitle(state); }
    state.title.cursor = 1;
    // The cursor's 4-tile blink is ($FFB1 & $18) >> 3 and $FFB1 free-runs, so
    // the recorder's phase is not reproducible (§27). Pin ours to the one the
    // snapshot caught -- OAM tile $AA, i.e. phase 3 -- rather than reporting a
    // phase difference as a pixel failure.
    state.frame = 24;
    noInput(state);
    T.tickTitle(state);
  },
  options(state) {
    T.showTitle(state, titleArt);
    for (let i = 0; i < 40; i++) { noInput(state); T.tickTitle(state); }
    state.title = null;
    state.raster.mode = 7; state.raster.closing = 0; state.raster.delta = 0;
    O.showOptions(state, titleArt.windowMap);
    // Ramp the squash all the way out: DELTA_MAX is 11, one step per 8 frames.
    for (let i = 0; i < 200; i++) { noInput(state); RA.tickRaster(state); O.tickOptions(state); }
  },
  roundselect(state) {
    RS.showRoundSelect(state, rsArt);
    for (let i = 0; i < 40; i++) { noInput(state); RS.tickRoundSelect(state); }
  },
};

const rows = [];
let failed = false;
const dump = process.argv.includes('--dump')
  ? process.argv[process.argv.indexOf('--dump') + 1] : null;

for (const [tag, drive] of Object.entries(CASES)) {
  const snap = ref.snaps[tag];
  if (!snap) { console.log(`(no recording for ${tag})`); continue; }
  const state = fresh();
  drive(state);
  const fb = R.createFramebuffer();
  R.renderFrame(state, fb);

  let bad = 0; let first = null;
  for (let i = 0; i < snap.screen.length; i++) {
    if (snap.screen[i] === fb.shades[i]) continue;
    bad++;
    if (!first) first = { x: i % 160, y: (i / 160) | 0,
                          rom: snap.screen[i], port: fb.shades[i] };
  }
  if (bad) failed = true;
  rows.push({ tag, total: snap.screen.length, bad, first,
              romRegs: snap.regs,
              portRegs: { bgp: state.video.bgp, obp0: state.video.obp0,
                          obp1: state.video.obp1, scx: state.video.scx,
                          scy: state.video.scy, wy: state.video.windowLatchY },
              romOam: snap.oam.length, portOam: state.video.sprites.length });

  if (dump === tag) {
    const art = (buf) => {
      const g = ' .:#';
      const out = [];
      for (let y = 0; y < 144; y += 2) {
        let s = '';
        for (let x = 0; x < 160; x += 2) s += g[buf[y * 160 + x]];
        out.push(s);
      }
      return out.join('\n');
    };
    console.log('--- ROM ---\n' + art(snap.screen));
    console.log('--- PORT ---\n' + art(fb.shades));
  }
}

for (const r of rows) {
  console.log(`${r.tag.padEnd(16)} ${`${r.total - r.bad}/${r.total}`.padStart(12)} `
    + `${(r.bad ? 'FAIL' : 'ok').padStart(6)}  `
    + `rom bgp/obp0/obp1/wy=${[r.romRegs.bgp, r.romRegs.obp0, r.romRegs.obp1,
                               r.romRegs.wy].map((v) => v.toString(16)).join('/')} `
    + `port=${[r.portRegs.bgp, r.portRegs.obp0, r.portRegs.obp1,
               r.portRegs.wy].map((v) => (v ?? 0).toString(16)).join('/')} `
    + `oam rom=${r.romOam} port=${r.portOam}`
    + (r.first ? `   first (${r.first.x},${r.first.y}) rom=${r.first.rom} `
               + `port=${r.first.port}` : ''));
}
process.exit(failed ? 1 : 0);
