// W230 -- THE DESCRIPTOR SWEEP (docket D5).
//
// The question "which sprites are missing?" had been answered four separate ways
// by guessing at subsystems. This answers it once, mechanically: run the port,
// take the display list it actually builds each frame, and check every descriptor
// in it against the bundle's OWN stream table. A descriptor the page cannot
// resolve draws NOTHING and never throws, which is exactly the failure mode that
// survives review -- so it needs an instrument, not an opinion.
//
// The oracle is `assets/spr/streams.u32.gz` column 0, decoded the way
// `src/web/assets.js` decodes it. Not `manifest.spr.harvest`: that lists the
// tables the exporter walked, which is a SUBSET (boot, laser and the shot/bullet
// families arrive by other paths), and using it reports ~393 false positives.
//
//   node games/ddpdoj/tools/w230descriptorsweep.mjs
//
// Needs the generated `rip/` and `assets/`. Prints every descriptor drawn but not
// shipped, most-drawn first, then the display-list drop counters and the counted
// gaps -- because a sprite can also be missing because its PRODUCER never ran.

import { readFileSync } from 'node:fs';
const S = new URL('../src/', import.meta.url).href;
const { Game } = await import(S + 'main.js');
const { RomWindows } = await import(S + 'rom.js');
const { portWordFromBits } = await import(S + 'input.js');
const { BIT } = await import(S + 'machine.js');
const { BUCKETS } = await import(S + 'spritequeue.js');
const R = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const tables = JSON.parse(readFileSync(R + 'rip/port/player.tables.json', 'utf8'));
const manifest = JSON.parse(readFileSync(R + 'assets/manifest.json', 'utf8'));
const ROM = new RomWindows(tables.rom);
const hx = (n) => '$' + (n >>> 0).toString(16).toUpperCase();

// ---- the oracle: the bundle's OWN stream table, column 0 (cartridge address),
// planar and first-differenced exactly as src/web/assets.js decodes it.
import { gunzipSync } from 'node:zlib';
const flat = new Uint32Array(
  (() => { const b = gunzipSync(readFileSync(R + 'assets/spr/streams.u32.gz'));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); })());
const n = manifest.spr.streamCount;
if (flat.length !== n * 3) throw new Error(`${flat.length} u32 for ${n} streams`);
const harvested = new Set();
let acc = 0;
for (let i = 0; i < n; i++) { acc = (acc + flat[i]) >>> 0; harvested.add(acc); }
console.log('streams in the bundle:', harvested.size, 'of', n);

// ---- the run
const g = new Game(new Uint8Array(readFileSync(R + 'rip/web/seed.bin')), tables,
  { palCatchUp: false });
const shot = portWordFromBits([BIT.b1]);
const seen = new Map();          // descriptor -> frames drawn
const q = BUCKETS[0];
for (let f = 1; f <= 900; f++) {
  g.step(shot);
  const n = g.displayList.records;
  for (let i = 0; i < n; i++) {
    const d = g.ram.u32(q.buffer + i * 12 + 4) >>> 0;
    if (d === 0) continue;
    seen.set(d, (seen.get(d) ?? 0) + 1);
  }
}
const missing = [...seen.entries()].filter(([d]) => !harvested.has(d))
  .sort((a, b) => b[1] - a[1]);
console.log('distinct descriptors drawn over 900 frames:', seen.size);
console.log('NOT in the bundle:', missing.length,
  'accounting for', missing.reduce((a, [, n]) => a + n, 0), 'draws');
for (const [d, n] of missing.slice(0, 30)) console.log('  ', hx(d), 'drawn', n);

console.log('\n=== display-list drops on the last frame ===');
for (const k of ['droppedBucket20', 'dropped6and9', 'overBudgetBytes',
  'pendingRecords', 'capFired', 'capBucket', 'bucketsAbandoned', 'records'])
  console.log(' ', k, g.displayList[k]);
console.log('\n=== counted gaps over the run (top 25) ===');
for (const l of g.unportedLog.report().slice(0, 25)) console.log(l.slice(0, 150));
