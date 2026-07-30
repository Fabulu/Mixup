// Diff the port's VRAM-script write stream against the cartridge's.
//
// tools/oracle/vramscript.py records every (address, value) the real
// sub_00_0A0E writes, in order, plus the raw bytes of each script it ran. This
// feeds those same bytes through src/vramscript.js and compares write for
// write -- ORDER included, because a correct final image can still come from a
// wrong order, and a wrong order means the routine is not what we think it is.
//
// Comparing the resulting VRAM image instead would be weaker twice over: it
// would accept a wrong order, and it would drag in the tile bitmaps, which
// arrive by block copy and have nothing to do with this routine.
//
// Usage:
//   node tools/oracle/vramdiff.mjs                  # diff existing recordings
//   node tools/oracle/vramdiff.mjs --record         # re-record first [PyBoy]
//   node tools/oracle/vramdiff.mjs rip/vs_l9.json   # one specific recording

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runVramScript, vramScriptLength } from '../../games/batman/src/vramscript.js';
import { ROOT } from './_env.mjs';

const PY = process.env.PYTHON || 'python';

const argv = process.argv.slice(2);
const record = argv.includes('--record');
const explicit = argv.filter((a) => !a.startsWith('--'));

// The title path exercises copy-horizontal; a level init adds RLE-horizontal
// and copy-vertical, plus the per-frame scripts the game builds in WRAM.
const RUNS = [
  { out: 'rip/vramscript.json', args: [], what: 'title build' },
  { out: 'rip/vramscript_l1.json', args: ['--level', '1', '--until', '3000'],
    what: 'level 1 init' },
];

if (record) {
  for (const r of RUNS) {
    execFileSync(PY, ['tools/oracle/vramscript.py', '--out', r.out, ...r.args],
      { cwd: ROOT, stdio: 'ignore' });
  }
}

const refs = explicit.length ? explicit : RUNS.map((r) => r.out);
let failed = 0;
const modesSeen = new Set();

for (const rel of refs) {
  const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.error(`no recording at ${rel} -- run with --record`);
    process.exit(1);
  }

  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  const vram = new Uint8Array(0x2000);          // $8000-$9FFF
  const got = [];

  for (const sc of ref.scripts) {
    const bytes = Uint8Array.from(sc.bytes);

    // The walker and the interpreter must agree on where a script ends; if
    // they do not, one of them is mis-sizing a record.
    const len = vramScriptLength(bytes);
    if (len !== bytes.length) {
      console.error(`${rel}: ${sc.bank.toString(16)}:$${sc.addr.toString(16)} `
        + `length ${len} but the recorder captured ${bytes.length}`);
      failed++;
      continue;
    }
    runVramScript(vram, bytes, { onWrite: (a, v) => got.push([a, v]) });
  }

  const want = ref.writes;
  for (const w of want) modesSeen.add(w[2]);

  let bad = 0;
  let first = null;
  const n = Math.max(want.length, got.length);
  for (let i = 0; i < n; i++) {
    const w = want[i];
    const g = got[i];
    if (w && g && w[0] === g[0] && w[1] === g[1]) continue;
    bad++;
    if (!first) {
      const f = (p) => (p ? `$${p[0].toString(16)}=$${p[1].toString(16)}` : '(none)');
      first = `#${i}: oracle ${f(w)}, port ${f(g)}`;
    }
  }

  const label = rel.padEnd(26);
  if (bad === 0) {
    console.log(`${label} ${String(want.length).padStart(5)} writes over `
      + `${String(ref.scripts.length).padStart(3)} scripts   ok`);
  } else {
    console.log(`${label} MISMATCH ${bad}/${want.length}   ${first}`);
    failed++;
  }
}

const MODE_NAMES = ['copy-h', 'rle-h', 'copy-v', 'rle-v'];
console.log('\nmodes exercised: '
  + [...modesSeen].sort().map((m) => MODE_NAMES[m]).join(', '));
// Mode 3 has never appeared in any recorded path -- title, or any of the 14
// level inits. Saying so keeps it from looking verified when it is only
// unit-tested from the instructions.
if (!modesSeen.has(3)) {
  console.log('note: rle-v (mode 3) is not reached by any recorded path; '
    + 'it is covered by tests/vramscript.test.js only');
}

if (failed) {
  console.log('\nVRAM SCRIPT REGRESSION');
  process.exit(1);
}
console.log('\nPASS - every write matches the ROM, in order');
