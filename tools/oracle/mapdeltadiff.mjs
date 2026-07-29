// Diff two mapdelta recordings (cartridge vs port) and print, per frame, the
// map-cell changes one side made and the other did not.
//
// Usage: node tools/oracle/mapdeltadiff.mjs rip/terrain/rom-l7.json rip/terrain/port-l7.json

import fs from 'node:fs';

const [romPath, portPath] = process.argv.slice(2);
const rom = JSON.parse(fs.readFileSync(romPath, 'utf8'));
const port = JSON.parse(fs.readFileSync(portPath, 'utf8'));

const key = (c) => `${c[0]},${c[1]}=${c[2].toString(16).padStart(2, '0')}/${c[3].toString(16).padStart(2, '0')}`;
const hex = (v) => v.toString(16).padStart(4, '0').toUpperCase();

let romTotal = 0, portTotal = 0, diffFrames = 0;
const n = Math.min(rom.frames.length, port.frames.length);
// Frame 1's delta on the ROM side is measured against the last MENU frame, so
// it contains the whole level load. Skip it; it is not a terrain event.
for (let i = 1; i < n; i++) {
  const a = rom.frames[i], b = port.frames[i];
  romTotal += a.chg.length; portTotal += b.chg.length;
  const A = new Set(a.chg.map(key)), B = new Set(b.chg.map(key));
  const onlyRom = [...A].filter((k) => !B.has(k));
  const onlyPort = [...B].filter((k) => !A.has(k));
  const stateDiff = [];
  for (const f of ['hp', 'hpMax', 'ammo', 'cling']) {
    if (a[f] !== b[f]) stateDiff.push(`${f} rom=${a[f]} port=${b[f]}`);
  }
  if (onlyRom.length || onlyPort.length || stateDiff.length) {
    diffFrames++;
    if (diffFrames <= 60) {
      console.log(`f${a.f}  rom(x=${hex(a.x)},y=${hex(a.y)}) port(x=${hex(b.x)},y=${hex(b.y)})`);
      if (onlyRom.length) console.log(`      ROM ONLY : ${onlyRom.join('  ')}`);
      if (onlyPort.length) console.log(`      PORT ONLY: ${onlyPort.join('  ')}`);
      if (stateDiff.length) console.log(`      STATE    : ${stateDiff.join(' | ')}`);
    }
  }
}
console.log(`\n${n} frames | rom cell-writes ${romTotal}, port ${portTotal} | frames differing ${diffFrames}`);
