// Is a residual mapdelta difference a real disagreement, or the harness's
// known warp skew?
//
// mapdelta.py writes the warp mid-iteration (so the cartridge's first sample
// is taken one gravity step in) while mapdeltaport.mjs writes it after frame
// 1's tick, and neither seeds VelY. Any scenario that starts in mid-air is
// therefore free to sit a frame apart for reasons that have nothing to do with
// the port. This re-diffs the cell writes at a range of offsets and reports the
// best one, so "0 differing frames at shift +1" can be stated as a measurement
// instead of asserted as an excuse. A shift that fixes NOTHING is a real bug.
//
//   node tools/oracle/mapdeltashift.mjs rip/terrain/rom-l7ledge.json \
//                                       rip/terrain/port-l7ledge.json

import fs from 'node:fs';

const [romPath, portPath] = process.argv.slice(2);
const rom = JSON.parse(fs.readFileSync(romPath, 'utf8'));
const port = JSON.parse(fs.readFileSync(portPath, 'utf8'));
const key = (c) => `${c[0]},${c[1]}=${c[2].toString(16)}/${c[3].toString(16)}`;

for (let k = -2; k <= 2; k++) {
  let diff = 0, cmp = 0;
  for (let i = 1; i < rom.frames.length; i++) {
    const j = i + k;
    if (j < 1 || j >= port.frames.length) continue;
    cmp++;
    const A = new Set(rom.frames[i].chg.map(key));
    const B = new Set(port.frames[j].chg.map(key));
    if ([...A].some((x) => !B.has(x)) || [...B].some((x) => !A.has(x))) diff++;
  }
  console.log(`shift ${k >= 0 ? '+' : ''}${k}: ${diff} of ${cmp} frames differ`);
}
