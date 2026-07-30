// Retire assets/water.json: rebuild both halves of it from ROM data and diff
// them against the cartridge's live VRAM, byte for byte.
//
// water.json carried two things, neither of them in the exported level VRAM:
//
//   `map`     the WINDOW tilemap at $9C00-$9FFF. Built here by buildWindowMap()
//             from manifest.window -- the $04C9 fill plus the 0:$32A3 script.
//             NOT the $0E24 script the old notes named: `$0DD9 CP $0E / JP NZ`
//             makes that one level 14's alone, and waterbuild.py aborts if it
//             ever fires elsewhere.
//   `frames`  the animated tile bitmaps. Built here by replayTileAnim() from
//             manifest.tileAnim -- loc_00_3127's own tables, its own cursors.
//
// Both are compared against a live snapshot: the window map at the first
// $0567, and the animated tile bytes after N gameplay frames, which pins the
// CADENCE as well as the data.
//
// Usage:  node tools/oracle/waterdiff.mjs [--record] [--levels 1,2,...]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildWindowMap, replayTileAnim } from '../../games/batman/src/water.js';
import { ROOT, gamePath } from './_env.mjs';

const PY = process.env.PYTHON || 'python';

// Every level whose 0:$31EE entry is a real pointer, plus three that have no
// animation at all (4, 9, 14) so the window map is checked on a level that is
// not just "the water levels", and 14 so the $0E24 override is exercised.
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const LEVELS = arg('--levels', '1,2,3,4,5,6,7,9,12,13,14')
  .split(',').map(Number);
const FRAMES = Number(arg('--frames', 120));

const manifest = JSON.parse(
  fs.readFileSync(gamePath('assets/manifest.json'), 'utf8'));
if (!manifest.window || !manifest.tileAnim) {
  console.error('manifest has no window/tileAnim section - re-run '
    + 'python tools/export_assets.py');
  process.exit(1);
}

const record = process.argv.includes('--record');
let fail = 0;
let totalBytes = 0;
let totalBad = 0;

for (const lvl of LEVELS) {
  const ref = path.join(ROOT, 'rip', `waterbuild-${String(lvl).padStart(2, '0')}.json`);
  // waterbuild.py caps at --frames gameplay frames counted from the first
  // $0567. Every recording below is short enough that no lag frame is reached
  // on levels 1/3/4/5/6/9/12/14; where one IS hit (2, 7, 13) it does not
  // matter, because $05C9 runs unconditionally -- $C757 only gates the actor
  // and enemy drivers ($424D/$4E39), never sub_00_2C13.
  if (record || !fs.existsSync(ref)) {
    execFileSync(PY, ['tools/oracle/waterbuild.py', '--level', String(lvl),
      '--frames', String(FRAMES)], { cwd: ROOT, stdio: 'ignore' });
  }
  const rec = JSON.parse(fs.readFileSync(ref, 'utf8'));
  const vram0 = Uint8Array.from(rec.vram0);
  const vram1 = Uint8Array.from(rec.vram1);

  // ---- the window tilemap, all 1024 bytes -------------------------------
  const built = buildWindowMap(manifest.window, lvl);
  let mapBad = 0;
  let mapFirst = -1;
  for (let i = 0; i < 0x400; i++) {
    if (built[i] !== vram0[0x1C00 + i]) {
      mapBad++;
      if (mapFirst < 0) mapFirst = i;
    }
  }
  // The tilemap never changes once built -- assert that rather than assume it,
  // because it is the whole reason a static build can replace a capture.
  let drift = 0;
  for (let i = 0; i < 0x400; i++) {
    if (vram0[0x1C00 + i] !== vram1[0x1C00 + i]) drift++;
  }

  // ---- the animated tiles, after `frames` frames -------------------------
  const spec = lvl === 6 && rec.ffc9 === 1 ? manifest.tileAnim['6alt']
    : manifest.tileAnim[String(lvl)];
  const anim = new Uint8Array(vram0);          // the level as loaded
  let animBad = 0;
  let animBytes = 0;
  let animFirst = -1;
  const nWrites = rec.events.anim.length;
  // The cadence is part of the claim, not a free parameter: loc_00_3127 stages
  // exactly one block per frame, so every recorded gap must be 1. If the
  // $FF9B queue ever failed to drain ($312C's RET NZ) or the $C61B/$C130
  // queues pre-empted the drain ($0714/$0727), a gap of 2 would appear here
  // and the port -- which has no VBlank -- would be wrong by that much.
  const gaps = new Set(rec.events.anim.slice(1)
    .map((e, i) => e.f - rec.events.anim[i].f));
  if (nWrites && (gaps.size !== 1 || !gaps.has(1))) {
    console.log(`level ${lvl}: animation frame gaps are ${[...gaps]}, not [1] `
      + '- the write queue stalled and the port does not model that');
    fail++;
  }
  if (rec.events.busy.length || rec.events.stall.length) {
    console.log(`level ${lvl}: ${rec.events.busy.length} busy / `
      + `${rec.events.stall.length} pre-empted frames`);
    fail++;
  }
  if (spec) {
    replayTileAnim(anim, spec, nWrites);
    // Only the streamer's own destinations are claimed. Everything else in the
    // tile area moves for reasons that are not this subsystem (the player's
    // OBJ stream, the column streamer), and claiming it would be dishonest.
    for (const dest of new Set(spec.dests)) {
      for (let i = 0; i < 32; i++) {
        const at = dest - 0x8000 + i;
        animBytes++;
        if (anim[at] !== vram1[at]) {
          animBad++;
          if (animFirst < 0) animFirst = at;
        }
      }
    }
  } else if (nWrites) {
    console.log(`level ${lvl}: manifest says no animation but the cartridge `
      + `made ${nWrites} writes`);
    fail++;
  }

  totalBytes += 0x400 + animBytes;
  totalBad += mapBad + animBad;
  const ok = !mapBad && !animBad && !drift;
  if (!ok) fail++;
  const tiles = spec ? `${new Set(spec.dests).size * 2} tiles` : 'no animation';
  console.log(
    `level ${String(lvl).padStart(2)}  window ${0x400 - mapBad}/1024`
    + (mapBad ? ` (first $${(0x9C00 + mapFirst).toString(16)})` : '')
    + `  anim ${animBytes - animBad}/${animBytes} over ${nWrites} frames`
    + (animBad ? ` (first $${(0x8000 + animFirst).toString(16)})` : '')
    + `  ${tiles}`
    + (drift ? `  MAP DRIFTED ${drift} B` : ''));
}

console.log(`\n${totalBytes - totalBad}/${totalBytes} bytes match`);
if (fail) {
  console.log('WATER REGRESSION');
  process.exit(1);
}
console.log('EXACT MATCH -- the window map and the animated tiles are built '
  + 'from ROM data, not captured.');
