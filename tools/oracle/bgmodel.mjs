// Does the port's BACKGROUND MODEL cover the cartridge's BG tilemap?
//
// renderer.js does not model the column streamer: it samples the level map and
// runs it through the metatile table.  That is equivalent ONLY where every
// visible $9800 cell came from the streamer.  Any cell a level-init VRAM
// script painted instead is invisible to the model and renders as tile 0.
//
// This compares, cell for cell over the CURRENTLY VISIBLE window, the real
// $9800 the cartridge holds against what the port's sampler would produce.
//
// Usage:
//   python tools/oracle/tilemapdump.py --level N --frames 80 --out rip/oracle/tm-lN.json
//   node tools/oracle/bgmodel.mjs --level N

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

installFetchShim();
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel, metatileTile } = await imp('src/level.js');
const { mapTile } = await imp('src/state.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const levels = (arg('levels', '1,2,3,4,5,6,7,8,9,10,11,12,13,14')).split(',').map(Number);
const FRAMES = parseInt(arg('frames', '80'), 10);
const record = argv.includes('--record');

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();

console.log('lvl   visible cells   wrong   worst tilemap rows (row: wrong cells)');
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
  if (camX !== ((ref.regs.camXhi << 8 | ref.regs.camXlo) >> 4)
      || camY !== ((ref.regs.camYhi << 8 | ref.regs.camYlo) >> 4)) {
    console.log(`${String(level).padStart(3)}   CAMERA MISMATCH port ${camX},${camY} rom `
      + `${(ref.regs.camXhi << 8 | ref.regs.camXlo) >> 4},${(ref.regs.camYhi << 8 | ref.regs.camYlo) >> 4}`);
    continue;
  }
  // $FFA9/$FFAA, not rSCX/rSCY -- see bgartdiff.mjs. rSCX at the sample point
  // holds the LAST raster arm of the previous frame, which on level 6 is the
  // $FFCC track band ($C0 against $FFA9 = $10).
  const scx = ref.regs.scxBase ?? ref.regs.SCX;
  const scy = ref.regs.scyBase ?? ref.regs.SCY;
  // Rebuild scroll into world space the way raster.js regToWorld does.
  const wrap = (base, reg) => { let d = (reg - base) & 0xFF; if (d > 0x7F) d -= 0x100; return base + d; };
  const wx0 = wrap(camX, scx), wy0 = wrap(camY, scy);
  const perRow = new Map();
  let cells = 0, wrong = 0;
  for (let ty = 0; ty < 18; ty++) {
    for (let tx = 0; tx < 21; tx++) {
      const worldX = wx0 + tx * 8, worldY = wy0 + ty * 8;
      const tr = (worldY >> 3) & 31, tc = (worldX >> 3) & 31;
      const romTile = ref.bg[tr * 32 + tc];
      const col = worldX >> 4, row = (worldY >> 4) & 0x0F;
      let portTile = 0;
      if (col >= 0 && col < state.level.width) {
        const mid = mapTile(state, col, row);
        portTile = metatileTile(state, mid, (worldX >> 3) & 1, (worldY >> 3) & 1) & 0xFF;
      }
      cells++;
      if (romTile !== portTile) {
        wrong++;
        perRow.set(tr, (perRow.get(tr) || 0) + 1);
      }
    }
  }
  const worst = [...perRow.entries()].sort((a, b) => a[0] - b[0])
    .map(([r, n]) => `${r}:${n}`).join(' ');
  console.log(`${String(level).padStart(3)}${String(cells).padStart(16)}`
    + `${String(wrong).padStart(8)}   ${worst}`);
}
