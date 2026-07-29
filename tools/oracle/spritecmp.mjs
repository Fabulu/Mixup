// Compare the port's sprite QUEUE against the cartridge's shadow OAM, entry by
// entry, on the golden frames that tools/compare_visual.mjs flags.
//
// compare_visual attributes a pixel delta to "player metasprite" but cannot say
// which entry moved. This prints both lists side by side.
//
// Usage: node tools/oracle/spritecmp.mjs [--only fall-and-walk] [--frame 30]

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SCENARIOS, renderScenario } from '../golden.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const frameSel = arg('frame', null);
const LAG_OF = (f) => (f === 1 ? 2 : 1);

for (const sc of SCENARIOS.filter((s) => s.level === 1 && (!only || s.name === only))) {
  const meta = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'rip/real', sc.name, 'meta.json'), 'utf8'));
  const ours = await renderScenario(sc);
  for (const f of sc.capture) {
    if (frameSel !== null && String(f) !== frameSel) continue;
    const m = meta.frames[String(f + LAG_OF(f))];
    if (!m) continue;
    const o = ours.get(f);
    // shadow OAM -> screen coords; y == 0 means the slot is unused
    const rom = m.oam.map((e, i) => ({ i, y: e[0] - 16, x: e[1] - 8, tile: e[2], attr: e[3] }))
                     .filter((e) => e.y !== -16);
    console.log(`\n=== ${sc.name} f${f} (rom frame ${f + LAG_OF(f)}) ===`);
    console.log(`  rom entries ${rom.length}   port entries ${o.sprites.length}`);
    const n = Math.max(rom.length, o.sprites.length);
    for (let i = 0; i < n; i++) {
      const r = rom[i], p = o.sprites[i];
      const rs = r ? `y=${String(r.y).padStart(4)} x=${String(r.x).padStart(4)} t=$${r.tile.toString(16).padStart(2, '0')} a=$${r.attr.toString(16).padStart(2, '0')}` : '   --';
      const ps = p ? `y=${String(p.y).padStart(4)} x=${String(p.x).padStart(4)} t=$${p.tile.toString(16).padStart(2, '0')} a=$${p.attr.toString(16).padStart(2, '0')}` : '   --';
      const same = r && p && r.y === p.y && r.x === p.x && r.tile === p.tile
                   && (r.attr & 0xF0) === (p.attr & 0xF0);
      console.log(`  ${String(i).padStart(2)}  rom ${rs}   port ${ps}  ${same ? '' : '  <<<'}`);
    }
  }
}
