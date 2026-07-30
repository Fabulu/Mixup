// State fields that are written and never read, or read and never written.
//
// Scans src/ for `<obj>.<field>` uses of the state tree's own sub-objects and
// classifies each as read / written. Crude but it only has to be good enough
// to raise a hand -- every hit is then checked by eye.
//
// Usage: node tools/oracle/econfields.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, gamePath } from './_env.mjs';

const { createState } = await imp('src/state.js');

const state = createState();

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const srcs = files(gamePath('src'))
  .map((f) => [path.relative(ROOT, f).replace(/\\/g, '/'), fs.readFileSync(f, 'utf8')]);

// Strip line and block comments so a citation in prose is not a "read".
const code = srcs.map(([f, s]) => [f,
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')]);

// The sub-objects worth auditing, and how they are usually spelled.
const GROUPS = {
  flow: ['state.flow', 'f.', 'flow.'],
  player: ['state.player', 'p.'],
  level: ['state.level', 'lvl.'],
  camera: ['state.camera', 'cam.'],
  video: ['state.video', 'v.'],
};

for (const [group, prefixes] of Object.entries(GROUPS)) {
  const obj = state[group];
  if (!obj || typeof obj !== 'object') continue;
  const rows = [];
  for (const key of Object.keys(obj)) {
    let reads = 0, writes = 0;
    const where = new Set();
    for (const [file, text] of code) {
      for (const pre of prefixes) {
        const esc = pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(esc + key + '\\b\\s*(=(?!=)|\\+=|-=|\\|=|&=|\\^=|\\+\\+|--)?', 'g');
        let m;
        while ((m = re.exec(text))) {
          if (m[1]) writes++; else reads++;
          where.add(file);
        }
      }
    }
    rows.push([key, reads, writes, [...where].join(' ')]);
  }
  console.log(`\n=== state.${group} ===`);
  for (const [key, r, w, f] of rows) {
    const flag = r === 0 ? '  WRITTEN, NEVER READ' : (w === 0 ? '  READ, NEVER WRITTEN' : '');
    if (flag) console.log(`  ${key.padEnd(20)} r=${r} w=${w}${flag}   [${f}]`);
  }
  console.log(`  (${rows.length} fields checked)`);
}
