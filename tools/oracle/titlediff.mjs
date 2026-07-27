// Rebuild the title screen's VRAM from its ingredients and diff it against
// what the cartridge actually produced.
//
// assets/title.vram.bin is a CAPTURE. The point of this is to show the capture
// can be regenerated from ROM data plus ported code, at which point it can be
// deleted. Three mechanisms build it, and all three are replayed here:
//
//   $01AB-$022C   the boot clear: maps to $2F, tiles to $00
//   sub_00_34A4   stack-based tilemap fill -- SP = $9A3F, 287 x PUSH DE
//   sub_00_09FB   two block copies out of bank 6 (the tile bitmaps)
//   sub_00_0A0E   three VRAM scripts (copyright, title, title text)
//
// Usage:  node tools/oracle/titlediff.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runVramScript } from '../../src/vramscript.js';
import { fillTilemap, blockCopy, bootClearVram, buildTitleVram } from '../../src/vram.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const REF = path.join(ROOT, 'rip', 'titlebuild.json');
const PY = process.env.PYTHON || 'python';

if (process.argv.includes('--record') || !fs.existsSync(REF)) {
  execFileSync(PY, ['tools/oracle/titlebuild.py'], { cwd: ROOT, stdio: 'ignore' });
}

const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
const vram = new Uint8Array(0x2000);          // $8000-$9FFF
bootClearVram(vram);                          // $01AB-$022C, before any screen

for (const e of ref.events) {
  if (e.kind === 'fill') {
    fillTilemap(vram, e.value);
  } else if (e.kind === 'copy') {
    if (!e.bytes) continue;                   // non-VRAM destination
    blockCopy(vram, e.dest, Uint8Array.from(e.bytes));
  } else if (e.kind === 'script') {
    runVramScript(vram, Uint8Array.from(e.bytes));
  }
}

const want = Uint8Array.from(ref.vram);
let bad = 0;
let first = -1;
const ranges = [];
let runStart = -1;
for (let i = 0; i < want.length; i++) {
  const differs = vram[i] !== want[i];
  if (differs) {
    bad++;
    if (first < 0) first = i;
    if (runStart < 0) runStart = i;
  } else if (runStart >= 0) {
    ranges.push([runStart, i - 1]);
    runStart = -1;
  }
}
if (runStart >= 0) ranges.push([runStart, want.length - 1]);

console.log(`replay of ${ref.events.length} recorded events: `
  + `${want.length - bad}/${want.length} bytes match`);

if (bad === 0) {
  // The replay proves the mechanisms. Now prove the SHIPPED path -- the one
  // that reads assets/manifest.json at load time -- lands in the same place,
  // because that is what the game actually runs. Without this the replay could
  // pass while the exported ingredients were wrong.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'));
  if (!manifest.title) {
    console.error('manifest has no title section - re-run export_assets.py');
    process.exit(1);
  }
  const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
  const built = buildTitleVram({
    tiles: manifest.title.tiles.map((t) => ({ dest: t.dest, bytes: b64(t.bytes) })),
    scripts: manifest.title.scripts.map(b64),
    fill: manifest.title.fill,
  }, (v, script) => runVramScript(v, script));

  let shipBad = 0;
  let shipFirst = -1;
  for (let i = 0; i < want.length; i++) {
    if (built[i] !== want[i]) { shipBad++; if (shipFirst < 0) shipFirst = i; }
  }
  if (shipBad) {
    console.log(`\nbuildTitleVram() from the manifest differs in ${shipBad} `
      + `bytes, first at $${(0x8000 + shipFirst).toString(16)}`);
    console.log('TITLE REGRESSION');
    process.exit(1);
  }
  console.log('buildTitleVram() from assets/manifest.json: '
    + `${want.length}/${want.length} bytes match`);
  console.log('\nEXACT MATCH -- the title is built from ROM data, not captured.');
  process.exit(0);
}

console.log(`\n${bad} bytes differ, in ${ranges.length} run(s):`);
for (const [a, b] of ranges.slice(0, 12)) {
  console.log(`  $${(0x8000 + a).toString(16)}-$${(0x8000 + b).toString(16)}`
    + `  ${b - a + 1} B   built=$${vram[a].toString(16).padStart(2, '0')} `
    + `real=$${want[a].toString(16).padStart(2, '0')}`);
}
if (ranges.length > 12) console.log(`  ... and ${ranges.length - 12} more`);
process.exit(1);
