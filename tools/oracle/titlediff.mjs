// Rebuild the non-level screens from their ingredients and diff each against
// what the cartridge actually produced.
//
// Both used to be, or would have been, 8 KB captures. The point of this is to
// show they regenerate from ROM data plus ported code. Mechanisms:
//
//   $01AB-$022C   the boot clear: maps to $2F, tiles to $00
//   sub_00_34A4   stack-based tilemap fill -- SP = $9A3F, 287 x PUSH DE
//   sub_00_09FB   block copies out of bank 6 (the tile bitmaps)
//   sub_00_0A0E   the VRAM scripts
//
// TITLE is three scripts over the boot clear. ROUND SELECT is built ON TOP of
// the finished title -- the cartridge never reclears the tile area between
// them -- and its order differs: fill FIRST, then copies, then one script.
//
// Usage:  node tools/oracle/titlediff.mjs [--record]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runVramScript } from '../../games/batman/src/vramscript.js';
import { ROOT, gamePath } from './_env.mjs';
import { fillTilemap, blockCopy, bootClearVram, buildTitleVram,
  buildRoundSelectVram } from '../../games/batman/src/vram.js';

const REF = path.join(ROOT, 'rip', 'titlebuild.json');
const PY = process.env.PYTHON || 'python';

if (process.argv.includes('--record') || !fs.existsSync(REF)) {
  execFileSync(PY, ['tools/oracle/titlebuild.py'], { cwd: ROOT, stdio: 'ignore' });
  // Round select is the same probe walked one screen further: tap START at the
  // title, then snapshot at the FIRST hit of the loop head, before the loop
  // starts repainting the cursor cell over the build.
  execFileSync(PY, ['tools/oracle/titlebuild.py', '--until-pc', '03DC',
    '--press-start', '--until', '3000', '--out', 'rip/roundselect.json'],
    { cwd: ROOT, stdio: 'ignore' });
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
    fs.readFileSync(gamePath('assets/manifest.json'), 'utf8'));
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

  // Round select, when its recording is present. It is built ON TOP of the
  // title, so passing here also confirms the title image a second way.
  const rsFile = path.join(ROOT, 'rip', 'roundselect.json');
  if (fs.existsSync(rsFile) && manifest.roundSelect) {
    const rs = JSON.parse(fs.readFileSync(rsFile, 'utf8'));
    const rsWant = Uint8Array.from(rs.vram);
    const rsBuilt = buildRoundSelectVram({
      fill: manifest.roundSelect.fill,
      tiles: manifest.roundSelect.tiles.map((t) => ({ dest: t.dest, bytes: b64(t.bytes) })),
      scripts: manifest.roundSelect.scripts.map(b64),
    }, (v, script) => runVramScript(v, script), built);

    // $99CD is the route cursor cell, and it is NOT part of the static build.
    // loc_00_0450 assembles a one-record VRAM script in WRAM every frame --
    // LD HL,$C61B then $99, $CD, $01, <tile>, $00 -- and paints that single
    // tile from $C712. So the builder legitimately does not produce it; the
    // cursor logic will, and gets checked on its own once it lands.
    const CURSOR_CELL = 0x99CD - 0x8000;
    let n = 0;
    let firstBad = -1;
    for (let i = 0; i < rsWant.length; i++) {
      if (i === CURSOR_CELL) continue;
      if (rsBuilt[i] !== rsWant[i]) { n++; if (firstBad < 0) firstBad = i; }
    }
    if (n) {
      console.log(`\nbuildRoundSelectVram() differs in ${n} bytes, first at `
        + `$${(0x8000 + firstBad).toString(16)}`);
      console.log('ROUND SELECT REGRESSION');
      process.exit(1);
    }
    console.log('buildRoundSelectVram() over the title: '
      + `${rsWant.length}/${rsWant.length} bytes match`);
  }

  console.log('\nEXACT MATCH -- screens built from ROM data, not captured.');
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
