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
//
// W265 (DOCKET D4): this used to run only the shipped seed, which never leaves stage 1.
// The owner reported the STAGE-2 mid boss mostly invisible, and "assume it shares stage
// 1's cause" is exactly the guess this instrument exists to replace. So it takes a
// checkpoint rung and a frame count:
//
//   node tools/w230descriptorsweep.mjs                      the shipped seed, 900 frames
//   node tools/w230descriptorsweep.mjs --lf 19500 --frames 9000
//
// The rung form boots from `tools/oracle/out/w69/stage1-sweep`, the same ladder
// `w133stage2boot.test.js` uses, and lf19500 is past the stage-1 boss timeout -- so a
// long enough run from it crosses into stage 2. It also REPORTS which stages it visited
// and stops cleanly on a throw, because a sweep that dies silently answers nothing.
const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : dflt;
};
const LF = argOf('--lf', 0);
const FRAMES = argOf('--frames', 900);

let g;
if (LF === 0) {
  g = new Game(new Uint8Array(readFileSync(R + 'rip/web/seed.bin')), tables,
    { palCatchUp: false });
} else {
  const LADDER = R + 'tools/oracle/out/w69/stage1-sweep/';
  const man = JSON.parse(readFileSync(LADDER + 'manifest.json', 'utf8'));
  const rung = man.rungs.find((r) => r.lf === LF);
  if (!rung) {
    console.error(`no lf${LF} rung in stage1-sweep; have `
      + man.rungs.map((r) => r.lf).join(' '));
    process.exit(2);
  }
  const bgBytes = new Uint8Array(readFileSync(LADDER + 'ckpt/' + rung.bg));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  g = new Game(new Uint8Array(readFileSync(LADDER + 'ckpt/' + rung.ram)), tables,
    { logicFrame: LF, videoFrame: rung.vf, bgSeed, palCatchUp: false });
  console.log(`booted from lf${LF} (vf${rung.vf})`);
}
const shot = portWordFromBits([BIT.b1]);
const seen = new Map();          // descriptor -> frames drawn
const stageSeen = new Set();     // which stage indices the run actually reached
const q = BUCKETS[0];
let threw = null;
for (let f = 1; f <= FRAMES; f++) {
  try {
    g.step(shot);
  } catch (e) {
    threw = { frame: f, name: e.name, romAddress: e.romAddress, message: e.message };
    break;
  }
  stageSeen.add(g.ram.u16(0x813096) >> 2);
  const n = g.displayList.records;
  for (let i = 0; i < n; i++) {
    const d = g.ram.u32(q.buffer + i * 12 + 4) >>> 0;
    if (d === 0) continue;
    seen.set(d, (seen.get(d) ?? 0) + 1);
  }
}
const missing = [...seen.entries()].filter(([d]) => !harvested.has(d))
  .sort((a, b) => b[1] - a[1]);
console.log(`distinct descriptors drawn over ${FRAMES} frames:`, seen.size);
console.log('stage indices visited:',
  [...stageSeen].sort((a, b) => a - b).join(' ') || '(none)');
if (threw) {
  console.log(`STOPPED at frame ${threw.frame}: ${threw.name}`
    + (threw.romAddress ? ' ' + hx(threw.romAddress) : ''));
  console.log('  ' + threw.message.split('. ')[0]);
}
console.log('NOT in the bundle:', missing.length,
  'accounting for', missing.reduce((a, [, n]) => a + n, 0), 'draws');
for (const [d, n] of missing.slice(0, 30)) console.log('  ', hx(d), 'drawn', n);

console.log('\n=== display-list drops on the last frame ===');
for (const k of ['droppedBucket20', 'dropped6and9', 'overBudgetBytes',
  'pendingRecords', 'capFired', 'capBucket', 'bucketsAbandoned', 'records'])
  console.log(' ', k, g.displayList[k]);
console.log('\n=== counted gaps over the run (top 25) ===');
for (const l of g.unportedLog.report().slice(0, 25)) console.log(l.slice(0, 150));
