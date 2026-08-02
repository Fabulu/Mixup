// Derive the ROM's animation-id mapping from an oracle trace, so the port
// stops guessing. The hitbox is looked up per animation (0:$27A8), so wrong
// ids give wrong collision, not just wrong pixels.
//
// Usage: node tools/oracle/animmap.mjs [--level 1]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, gamePath } from './_env.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const lvl = String(parseInt(arg('level', '1'), 10)).padStart(2, '0');

const trace = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'rip/oracle/trace_L' + lvl + '.json'), 'utf8')).frames;
const manifest = JSON.parse(fs.readFileSync(
  gamePath('assets/manifest.json'), 'utf8'));

const AIR = ['grounded', 'rising', 'falling'];
const buckets = new Map();

for (const r of trace) {
  const dir = r.vx === 0 ? 'still' : (r.vx > 0 ? 'moving' : 'moving-');
  const key = AIR[r.air] + ' / ' + dir + (r.turn ? ' / turning' : '');
  if (!buckets.has(key)) buckets.set(key, new Map());
  const b = buckets.get(key);
  b.set(r.anim, (b.get(r.anim) || 0) + 1);
}

console.log('state -> animation ids observed (frame counts)\n');
for (const [k, b] of buckets) {
  const ids = [...b.entries()].sort((a, c) => c[1] - a[1])
    .map(([id, n]) => '$' + id.toString(16).toUpperCase().padStart(2, '0') +
                      ' (' + id + ') x' + n);
  console.log('  ' + k.padEnd(28) + ids.join('   '));
}

const used = [...new Set(trace.map((r) => r.anim))].sort((a, b) => a - b);
console.log('\nhitboxes for the ids this trace used (0:$27A8):');
for (const id of used) {
  const h = manifest.player.hitboxes[id];
  console.log('  anim ' + String(id).padStart(3) +
              '  halfW=' + String(h[0]).padStart(3) +
              '  halfH=' + String(h[1]).padStart(3));
}
