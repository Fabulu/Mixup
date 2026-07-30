// Replay the cartridge's round-select input stream through the port.
//
// tools/oracle/roundsel.py records, for every loop iteration, the $FFE2 the
// cartridge acted on and the $C712/$C713 it ended up with. This drives
// tickRoundSelect() with the same presses in the same order and compares the
// resulting cursor and mode -- so a wrap that goes the wrong way, or a press
// that should have been swallowed, shows up as a divergence rather than as a
// unit test that agrees with a misreading of the listing.
//
// Usage:  node tools/oracle/roundseldiff.mjs [--record]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createState } from '../../games/batman/src/state.js';
// The CONTINUE line is drawn by running 0:$3328 through sub_00_0A0E, so this
// harness needs the real manifest tables rather than a bare createState --
// and it SHOULD, because it is diffing against the cartridge.
const MANIFEST = JSON.parse(fs.readFileSync(gamePath('assets/manifest.json'), 'utf8'));
import { makeTunables } from '../../games/batman/src/tunables.js';
import { showRoundSelect, tickRoundSelect } from '../../games/batman/src/roundselect.js';
import { ROOT, gamePath } from './_env.mjs';

const PY = process.env.PYTHON || 'python';

// Three runs, because a fresh boot leaves $C753 = 0 and $FFB5 = 0 -- so the
// default recording never reaches CONTINUE and never skips a cleared route,
// and those are the two branches most likely to be transcribed wrong.
const RUNS = [
  { out: 'rip/roundsel.json', args: [], what: 'fresh boot' },
  { out: 'rip/roundsel_cont.json', args: ['--continue-available'],
    what: 'CONTINUE available' },
  { out: 'rip/roundsel_mask.json', args: ['--mask', '02'],
    what: 'route 1 already cleared' },
];

const missing = RUNS.some((r) => !fs.existsSync(path.join(ROOT, r.out)));
if (process.argv.includes('--record') || missing) {
  for (const r of RUNS) {
    execFileSync(PY, ['tools/oracle/roundsel.py', '--out', r.out, ...r.args],
      { cwd: ROOT, stdio: 'ignore' });
  }
}

let failed = 0;

for (const run of RUNS) {
  const ref = JSON.parse(fs.readFileSync(path.join(ROOT, run.out), 'utf8'));

  const state = createState(makeTunables());
  state.tables = MANIFEST.tables;
  state.flow.routeMask = ref.routeMask;
  state.flow.continueAvailable = ref.continueAvailable;
  state.titleManifest = null;                     // the sprite is not the point
  showRoundSelect(state, {
    bgMap: new Uint8Array(0x400), tiles: {}, vram: new Uint8Array(0x2000),
  });

  let bad = 0;
  let first = null;
  for (let i = 0; i < ref.rows.length; i++) {
    const row = ref.rows[i];
    state.input.pressed = row.pressed;
    state.input.held = row.pressed;
    tickRoundSelect(state);

    const got = { cursor: state.roundSelect.cursor, mode: state.roundSelect.mode };
    if (got.cursor !== row.cursor || got.mode !== row.mode) {
      bad++;
      if (!first) {
        first = `#${i} pressed=$${row.pressed.toString(16)}: `
          + `oracle route ${row.cursor} mode ${row.mode}, `
          + `port route ${got.cursor} mode ${got.mode}`;
      }
    }
  }

  const states = [...new Set(ref.rows.map((r) => `${r.cursor}/${r.mode}`))].sort();
  console.log(`${run.what.padEnd(24)} ${String(ref.rows.length).padStart(3)} iters  `
    + `$C753=$${ref.routeMask.toString(16).padStart(2, '0')} `
    + `$FFB5=${ref.continueAvailable}  seen ${states.join(' ')}   `
    + (bad ? 'MISMATCH' : 'ok'));
  if (bad) {
    console.log(`   first ${first}`);
    failed++;
  }
}

if (failed) {
  console.log('\nROUND SELECT REGRESSION');
  process.exit(1);
}
console.log('\nPASS - route and mode match the ROM on every iteration');
