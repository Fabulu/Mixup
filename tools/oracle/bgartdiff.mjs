// Does the RENDERER's background model cover the cartridge's $9800 tilemap?
//
// bgmodel.mjs asks the same question but re-implements the port's sampler
// inline, so it can only ever measure the copy.  This one calls
// renderer.js's own bgTileIdAt() -- the exact function drawBackground uses --
// so a cell the picture gets wrong is a cell this reports wrong, and there is
// no second implementation to drift.
//
// What it exists to catch: renderer.js samples the level MAP through the
// metatile table instead of modelling the column streamer.  That is equivalent
// for every $9800 cell the streamer wrote, and blind to every cell it did not.
// Two level-init VRAM scripts write cells it did not:
//
//   7:$7A5E  ($0E94, $FFB0 in {9, $0A, $0B})  256 cells, tilemap rows 0-7
//   7:$7B77  ($0EF8, $FFB0 == 6)              105 cells, tilemap rows 19-27
//
// Before those were exported, this reported 168/378 visible cells wrong on each
// of levels 9/10/11 and 103/378 on level 6 -- ~8000 and ~3000 wrong pixels a
// frame, the largest deltas anywhere in the sweep.
//
// SAMPLE POINT (this used to cost two levels of coverage). The reference is
// read inside the $0A4F hook, and the scroll comes from $FFA9/$FFAA, not from
// rSCX/rSCY. Reading at the PyBoy tick boundary instead returned the NEXT
// iteration's camera -- level 5 f80 gave 16,288 against the port's 16,284 and
// level 2 f80 gave 17,326 against 16,325 -- so both reported CAMERA MISMATCH
// and were SKIPPED. Reading rSCX instead of $FFA9 mis-placed the window on
// level 6, whose last raster arm leaves $C0 in rSCX against $FFA9 = $10, and
// invented 80 wrong cells. Neither was a port fault. All fourteen levels now
// measure; 2 and 5 come out 380 visible cells, 0 wrong.
//
// Usage:
//   node tools/oracle/bgartdiff.mjs
//   node tools/oracle/bgartdiff.mjs --levels 6,9,10,11 --record
//   node tools/oracle/bgartdiff.mjs --level 9 --show      # per-cell dump

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
globalThis.fetch = async (u) => {
  const f = path.join(ROOT, String(u).replace(/^.*?(assets)/, '$1'));
  const b = fs.readFileSync(f);
  return { ok: true, status: 200, json: async () => JSON.parse(b.toString('utf8')),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { bgArtFor, bgTileIdAt, SCREEN_W, SCREEN_H } = await imp('src/render/renderer.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const levels = arg('level', arg('levels', '1,2,3,4,5,6,7,8,9,10,11,12,13,14'))
  .split(',').map(Number);
const FRAMES = parseInt(arg('frames', '80'), 10);
const record = argv.includes('--record');
const show = argv.includes('--show');

// A 160x144 screen shows ceil((160 + (SCX & 7)) / 8) columns and
// ceil((144 + (SCY & 7)) / 8) rows, so the 21st column and the 19th row only
// exist when the scroll is not tile-aligned. bgmodel.mjs walks a fixed 18x21
// grid instead, which counts an off-screen cell as visible whenever SCX is a
// multiple of 8 -- that is the whole of its 18 "level 14" and 2 "level 12"
// findings, and neither is a pixel anyone can see. Nothing is `allowed` here;
// cells that are not on the screen are simply not compared.
const ALLOWED = {};

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();

let failed = false;
console.log('lvl   visible cells   wrong  allow   rows (row: wrong cells)');
for (const level of levels) {
  const file = path.join(ROOT, 'rip/oracle', `tm-l${level}.json`);
  if (record || !fs.existsSync(file)) {
    execFileSync('python', ['tools/oracle/tilemapdump.py', '--level', String(level),
      '--frames', String(FRAMES), '--out', path.relative(ROOT, file)],
      { cwd: ROOT, stdio: 'pipe' });
  }
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  const state = createState(makeTunables());
  await initLevel(state, level);
  for (let f = 1; f <= FRAMES; f++) {
    const held = f > 20 ? 0x10 : 0;
    state.input.pressed = held & ~state.input.prev;
    state.input.held = held; state.input.prev = held;
    tick(state, manifest, playerTiles);
  }
  const camX = state.camera.x >> 4, camY = state.camera.y >> 4;
  const romX = (ref.regs.camXhi << 8 | ref.regs.camXlo) >> 4;
  const romY = (ref.regs.camYhi << 8 | ref.regs.camYlo) >> 4;
  if (camX !== romX || camY !== romY) {
    // Not a background fault: a scenario whose camera has diverged is
    // comparing two different views and proves nothing either way.
    console.log(`${String(level).padStart(3)}   CAMERA MISMATCH port ${camX},${camY} `
      + `rom ${romX},${romY} -- skipped`);
    continue;
  }
  // Rebuild the hardware scroll into world space the way raster.js regToWorld
  // does, so the cell indices below are the ones the PPU would have used.
  const wrap = (base, reg) => { let d = (reg - base) & 0xFF; if (d > 0x7F) d -= 0x100; return base + d; };
  // $FFA9/$FFAA, not rSCX/rSCY. The hardware registers hold whatever the LAST
  // raster arm of the previous frame left in them; on level 6 that is the
  // $FFCC track band, so rSCX reads $C0 at the sample point while the top of
  // the screen is drawn at $FFA9 = $10. Using rSCX there mis-places the whole
  // sampling window by 22 tile columns and reports 80 phantom wrong cells.
  const sx = ref.regs.scxBase ?? ref.regs.SCX;
  const sy = ref.regs.scyBase ?? ref.regs.SCY;
  const wx0 = wrap(camX, sx), wy0 = wrap(camY, sy);
  // --no-art is the make-it-fail switch: it renders the same comparison with
  // the overlay withheld, which is what the port did before it was exported.
  // A check nobody has watched go red is a decoration.
  const art = argv.includes('--no-art') ? null : bgArtFor(state);

  const perRow = new Map();
  const fx = wx0 & 7, fy = wy0 & 7;      // sub-tile scroll: the partial edges
  let cells = 0, wrong = 0;
  for (let ty = 0; ty * 8 - fy < SCREEN_H; ty++) {
    for (let tx = 0; tx * 8 - fx < SCREEN_W; tx++) {
      const worldX = (wx0 - fx) + tx * 8, worldY = (wy0 - fy) + ty * 8;
      const tr = (worldY >> 3) & 31, tc = (worldX >> 3) & 31;
      const romTile = ref.bg[tr * 32 + tc];
      const id = bgTileIdAt(state, worldX, worldY, art);
      const portTile = id < 0 ? 0 : id;
      cells++;
      if (romTile !== portTile) {
        wrong++;
        perRow.set(tr, (perRow.get(tr) || 0) + 1);
        if (show) {
          console.log(`      cell r${tr} c${tc}  rom $${romTile.toString(16)} `
            + `port $${portTile.toString(16)}`);
        }
      }
    }
  }
  const allow = ALLOWED[level] || 0;
  if (wrong > allow) failed = true;
  const worst = [...perRow.entries()].sort((a, b) => a[0] - b[0])
    .map(([r, n]) => `${r}:${n}`).join(' ');
  console.log(`${String(level).padStart(3)}${String(cells).padStart(16)}`
    + `${String(wrong).padStart(8)}${String(allow).padStart(7)}  `
    + `${wrong > allow ? 'FAIL' : 'ok  '} ${worst}`);
}
process.exit(failed ? 1 : 0);
