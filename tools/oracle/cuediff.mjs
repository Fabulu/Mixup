// Port side of the cue-stream oracle: run the real port modules for N frames
// with the same script cuetrace.py used, and record every sub_00_0AE1
// request the game code makes -- id, mask and frame -- then diff.
//
//   python tools/oracle/cuetrace.py --frames 300 --script "..." --level 1 --name foo
//   node   tools/oracle/cuediff.mjs --name foo
//
// The port's mailbox is state.sound.queue. Nothing drains it headlessly
// (main.js calls sound.pump only when the browser Sound object exists), so it
// would saturate at 4 and silently swallow everything after; we drain it here
// once per frame, exactly as pump() does.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

installFetchShim();

const { createState } = await imp('src/state.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const name = arg('name', null);
const recPath = path.join(ROOT, 'rip/cue', `cue_${name}.json`);
const rec = JSON.parse(fs.readFileSync(recPath, 'utf8'));
const frames = rec.frames;
const level = rec.level;
const script = rec.script;

const timeline = [];
for (const seg of script.split(',')) {
  const [n, keys = ''] = seg.split(':');
  let mask = 0;
  for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
}

const state = createState();
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
await initLevel(state, level);
if (rec.ammo !== null && rec.ammo !== undefined) state.flow.ammo = rec.ammo & 0xFF;
if (rec.hp !== null && rec.hp !== undefined) state.player.hp = rec.hp & 0xFF;

function applyWarp() {
  if (!rec.warp) return;
  const [c, r] = String(rec.warp).split(',').map((v) => parseInt(v, 10));
  state.player.x = ((c & 0xFF) << 8) | 0x80;
  if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
}

const got = [];
for (let f = 1; f <= frames; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);
  if (f === 1) applyWarp();
  const q = state.sound.queue;
  while (q.length) { const r = q.shift(); got.push({ f, id: r.id, mask: r.mask ?? 1 }); }
}

// --- diff -----------------------------------------------------------------
const want = rec.cues.filter((c) => !c.dropped)
  .map((c) => ({ f: c.f, id: c.id, mask: c.mask, site: c.site }));

const key = (c) => `$${c.id.toString(16).padStart(2, '0').toUpperCase()}/$${c.mask.toString(16).padStart(2, '0').toUpperCase()}`;

console.log(`scenario ${name}  level ${level}  ${frames} frames  script "${script}"`);
console.log(`  ROM : ${want.length} cues   PORT: ${got.length} cues`);

// Multiset compare, ignoring exact frame (SFX timing can slip a frame on a
// lag frame); then a frame-aligned compare that is allowed to be noisier.
const bag = (arr) => {
  const m = new Map();
  for (const c of arr) m.set(key(c), (m.get(key(c)) || 0) + 1);
  return m;
};
const A = bag(want), B = bag(got);
const keys = [...new Set([...A.keys(), ...B.keys()])].sort();
let bad = 0;
console.log(`  ${'cue'.padEnd(10)} ${'ROM'.padStart(4)} ${'PORT'.padStart(4)}   sites`);
for (const k of keys) {
  const a = A.get(k) || 0, b = B.get(k) || 0;
  const sites = [...new Set(want.filter((c) => key(c) === k).map((c) => c.site))].join(' ');
  const flag = a === b ? '   ' : ' **';
  if (a !== b) bad++;
  console.log(`  ${k.padEnd(10)} ${String(a).padStart(4)} ${String(b).padStart(4)}${flag} ${sites}`);
}

// frame alignment
const lines = [];
const maxN = Math.max(want.length, got.length);
for (let i = 0; i < maxN; i++) {
  const a = want[i], b = got[i];
  const as = a ? `f${a.f} ${key(a)} ${a.site}` : '--';
  const bs = b ? `f${b.f} ${key(b)}` : '--';
  const ok = a && b && a.id === b.id && a.mask === b.mask && Math.abs(a.f - b.f) <= 2;
  lines.push(`  ${ok ? ' ' : '!'} ${as.padEnd(34)} ${bs}`);
}
if (arg('show', null) !== null || bad) {
  console.log('  --- in order (ROM | PORT) ---');
  for (const l of lines) console.log(l);
}
const dropped = rec.cues.filter((c) => c.dropped);
if (dropped.length) {
  console.log(`  NOTE: the cartridge itself DROPPED ${dropped.length} request(s) (mailbox full):`);
  for (const c of dropped) console.log(`    f${c.f} ${c.site} id=$${c.id.toString(16)} mask=$${c.mask.toString(16)}`);
}
console.log(bad ? `  FAIL: ${bad} cue class(es) differ` : '  PASS');
