// Does the stage-intro card LOOK right?
//
// tools/oracle/introdiff.mjs proves the DATA -- 327680/327680 VRAM bytes. This
// proves the PICTURE, and the two are not the same check. The card was
// byte-exact on VRAM and still rendered wrong: drawEmblem read its metasprite
// table off `state.titleManifest`, a field only the title boot path sets, so
// launching straight into a level silently dropped all 40 of the card's
// sprites and the oval lost its soft dithered edge. 6.8% of pixels were wrong
// and every memory comparison in the suite was green.
//
// Compares the 160x144 shade indices the renderer produces against the ones
// the cartridge actually displayed, recorded by tools/oracle/stageintro.py.
//
// Usage:  node tools/oracle/introscreen.mjs [--record]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

const DIR = path.join(ROOT, 'rip', 'oracle');
const LEVELS = [1, 4, 5, 8, 9, 11, 12, 14];
const record = process.argv.includes('--record');

installFetchShim();

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { loadManifest } = await imp('src/assets.js');
const { resolveLoadout } = await imp('src/mods.js');
const R = await imp('src/render/renderer.js');
const SI = await imp('src/stageintro.js');

const manifest = await loadManifest();
const rows = [];
let failed = false;

for (const level of LEVELS) {
  const file = path.join(DIR, `intro-l${level}.json`);
  if (record || !fs.existsSync(file)) {
    execFileSync('python', ['tools/oracle/stageintro.py', '--level', String(level),
                            '--out', path.relative(ROOT, file)],
                 { cwd: ROOT, stdio: 'inherit' });
  }
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  // 'held' is the settled card; 'fading' is 12 frames into the 33-frame fade.
  // The second one exists because the first cannot see the fade at all, and
  // that is where the ring used to vanish.
  for (const tag of ['held', 'fading']) {
    if (!ref.snaps?.[tag]?.screen) continue;
    rows.push(compare(level, tag, ref.snaps[tag]));
  }
  continue;
}

function compare(level, tag, snap) {
  const want = snap.screen;
  // Drive the card to the same landmark the recorder snapped at.
  const state = createState(makeTunables(resolveLoadout([]).tunables));
  state.loadout = resolveLoadout([]);
  state.tables = manifest.tables;
  SI.showStageIntro(state, SI.loadStageIntro(manifest, level, null));
  for (let i = 0; i < snap.frame; i++) SI.tickStageIntro(state);

  const fb = R.createFramebuffer();
  R.renderFrame(state, fb);

  let bad = 0;
  let first = null;
  for (let i = 0; i < want.length; i++) {
    if (want[i] === fb.shades[i]) continue;
    bad++;
    if (!first) {
      first = { x: i % 160, y: (i / 160) | 0, rom: want[i], port: fb.shades[i] };
    }
  }
  if (bad) failed = true;
  return { level, tag, total: want.length, bad, first };
}

console.log(`\n${'level'.padStart(5)}${'pixels'.padStart(12)}${'verdict'.padStart(9)}`);
for (const r of rows) {
  console.log(`${String(r.level).padStart(5)}${r.tag.padStart(9)}`
    + `${`${r.total - r.bad}/${r.total}`.padStart(12)}`
    + `${(r.bad ? 'FAIL' : 'ok').padStart(9)}`
    + (r.first ? `   first (${r.first.x},${r.first.y}) rom=${r.first.rom} `
               + `port=${r.first.port}` : ''));
}
const shown = rows.reduce((a, r) => a + r.total, 0);
console.log(failed
  ? '\nFAIL - the card does not render as the cartridge displays it'
  : `\nPASS - ${shown} pixels identical across ${rows.length} levels`);
process.exit(failed ? 1 : 0);
