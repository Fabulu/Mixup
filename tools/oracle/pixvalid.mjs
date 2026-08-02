// Validity check for pixeldiff: did the port and the cartridge stay on the
// same frame at all?  A camera or player-position divergence (a lag frame, a
// physics drift) makes every pixel number meaningless, so it has to be ruled
// out before any pixel delta is called a rendering bug.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

installFetchShim();
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');

const BTN = { A: 1, B: 2, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const dir = path.join(ROOT, 'rip/oracle/pix');

console.log('scenario      frame  romCam(px)   portCam(px)  match');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const ref = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const timeline = [];
  for (const seg of ref.script.split(',')) {
    const [n, keys = ''] = seg.split(':');
    let m = 0; for (const c of keys.trim()) m |= BTN[c.toUpperCase()] || 0;
    for (let i = 0; i < parseInt(n, 10); i++) timeline.push(m);
  }
  const state = createState(makeTunables());
  await initLevel(state, ref.level);
  if (ref.ammo != null) state.flow.ammo = ref.ammo & 0xFF;
  const cap = new Set(ref.capture);
  const maxF = Math.max(...ref.capture);
  for (let n = 1; n <= maxF; n++) {
    const held = timeline[Math.min(n - 1, timeline.length - 1)] ?? 0;
    state.input.pressed = held & ~state.input.prev;
    state.input.held = held; state.input.prev = held;
    tick(state, manifest, playerTiles);
    if (n === 1 && ref.warp) {
      const [c, r] = ref.warp.split(',').map((v) => parseInt(v, 10));
      state.player.x = ((c & 0xFF) << 8) | 0x80;
      if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
    }
    if (!cap.has(n)) continue;
    const m = ref.frames[String(n + 1)];
    if (!m) continue;
    const rcx = ((m.regs.camXhi << 8) | m.regs.camXlo) >> 4;
    const rcy = ((m.regs.camYhi << 8) | m.regs.camYlo) >> 4;
    const pcx = state.camera.x >> 4, pcy = state.camera.y >> 4;
    console.log(`${f.replace('.json', '').padEnd(12)}${String(n).padStart(6)}`
      + `${`${rcx},${rcy}`.padStart(12)}${`${pcx},${pcy}`.padStart(14)}`
      + `  ${rcx === pcx && rcy === pcy ? 'ok' : 'DIVERGED'}`);
  }
}
