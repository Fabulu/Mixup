// Diff the ported sound driver's NR write stream against the cartridge's.
//
// The recorder (tools/oracle/sound.py) hooks the real driver's store
// instructions, so both sides are "what this tick wrote". Registers are
// compared as a per-tick STATE, not as a write sequence: the two drivers may
// legitimately write the same register a different number of times inside one
// tick, and only the value the tick leaves behind is audible.
//
//   node tools/oracle/sounddiff.mjs --id 2
//   node tools/oracle/sounddiff.mjs --id 2 --show 24

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
globalThis.fetch = async (url) => {
  const buf = fs.readFileSync(path.join(ROOT, String(url).replace(/^.*?assets\//, 'assets/')));
  return { ok: true, json: async () => JSON.parse(buf.toString('utf8')),
           arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { loadSoundData, createDriver, request, tick } = await imp('src/sound/driver.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const id = parseInt(arg('id', '2'), 0);
const mask = parseInt(arg('mask', '3'), 0);
const show = parseInt(arg('show', '0'), 10);

// The registers that decide what you hear. NR52/NR50/NR51 are excluded: the
// real driver rewrites them constantly and they never change value.
const WATCH = [
  ['ch1', [0xFF11, 0xFF12, 0xFF13, 0xFF14]],
  ['ch2', [0xFF16, 0xFF17, 0xFF18, 0xFF19]],
  ['ch3', [0xFF1A, 0xFF1C, 0xFF1D, 0xFF1E]],
  ['ch4', [0xFF21, 0xFF22, 0xFF23]],
];
const ALL = WATCH.flatMap(([, r]) => r);

const file = path.join(ROOT, `rip/oracle/sound_${id.toString(16).padStart(2, '0').toUpperCase()}.json`);
if (!fs.existsSync(file)) {
  console.error(`no recording at ${file}\n  run: python tools/oracle/sound.py --id ${id} --mask ${mask}`);
  process.exit(2);
}
const rec = JSON.parse(fs.readFileSync(file, 'utf8'));

const data = await loadSoundData();
const drv = createDriver(data);
request(drv, id, mask);

/** Fold a tick's writes into a register snapshot. */
function applyInto(state, writes) {
  for (const [a, v] of writes) state[a] = v;
  return state;
}

const oracle = {};
const port = {};
const bad = new Map();          // register -> first differing tick
let firstBad = null;
const n = rec.ticks.length;

for (let i = 0; i < n; i++) {
  applyInto(oracle, rec.ticks[i]);
  applyInto(port, tick(drv));
  for (const r of ALL) {
    if ((oracle[r] ?? 0) === (port[r] ?? 0)) continue;
    if (!bad.has(r)) bad.set(r, { tick: i, oracle: oracle[r], port: port[r] });
    if (firstBad === null) firstBad = i;
  }
  if (show && i < show) {
    const row = ALL.map((r) => {
      const o = oracle[r] ?? 0, p = port[r] ?? 0;
      const s = o === p ? o.toString(16).padStart(2, '0')
        : `${o.toString(16).padStart(2, '0')}/${p.toString(16).padStart(2, '0')}`;
      return s.padStart(6);
    }).join('');
    console.log(String(i).padStart(3) + row);
  }
}

if (show) console.log('    ' + ALL.map((r) => ('$' + r.toString(16)).padStart(6)).join(''));

console.log(`\nsong $${id.toString(16)}: ${n} ticks compared`);
for (const [name, regs] of WATCH) {
  const broke = regs.filter((r) => bad.has(r));
  console.log(`  ${name}: ${broke.length ? 'DIFF at ' + broke.map((r) => {
    const b = bad.get(r);
    return `$${r.toString(16)} t${b.tick} (${b.oracle}!=${b.port})`;
  }).join(', ') : 'match'}`);
}
console.log(firstBad === null
  ? '\nMATCH - the ported driver reproduces the cartridge'
  : `\nfirst divergence at tick ${firstBad} of ${n}`);
process.exit(firstBad === null ? 0 : 1);
