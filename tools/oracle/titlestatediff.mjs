// Retire assets/title.json, and check state 4 against the cartridge.
//
// titlediff.mjs already proves the title's 8 KB of VRAM is BUILT. What was
// still captured was its LCD register state -- 91 bytes of assets/title.json --
// and the reason given was that the palettes are the result of sub_00_0A7F's
// fade rather than an immediate anyone writes. That is true and it is not an
// obstacle: the fade's ramps are two small tables at 0:$0B09 and 0:$0B11, and
// a fade IN ends on entry 0 of each.
//
// This holds three things against tools/oracle/titleflash.py's recording:
//
//   * all eight registers, against the cartridge's own $FFA9-$FFAF shadows and
//     rLCDC at the title loop
//   * sub_00_0A7F's fade-out ramp, frame by frame, from the port's tickFade
//   * loc_00_031B: 120 blink frames then 33 fade frames, and the exact script
//     the loop stages in $C61B on each of them
//
// Usage:  node tools/oracle/titlestatediff.mjs [--record]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createFade, tickFade } from '../../src/title.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const REF = path.join(ROOT, 'rip', 'titleflash.json');
const PY = process.env.PYTHON || 'python';

if (process.argv.includes('--record') || !fs.existsSync(REF)) {
  execFileSync(PY, ['tools/oracle/titleflash.py'], { cwd: ROOT, stdio: 'ignore' });
}

const rec = JSON.parse(fs.readFileSync(REF, 'utf8'));
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'));
const spec = manifest.title;
if (!spec || !spec.lcd) {
  console.error('manifest.title.lcd missing - re-run tools/export_assets.py');
  process.exit(1);
}

const rows = new Map(rec.rows.map((r) => [r.f, r]));
const f0 = rec.marks.flash[0];          // $031B
const f1 = rec.marks.fadeOut[0];        // $0350
const f2 = rec.marks.rs[0];             // $035B
let fail = 0;
const check = (name, got, want, fmt = (v) => `$${v.toString(16)}`) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(10)} `
    + `built ${fmt(got)}   cartridge ${fmt(want)}`);
};

// ---- 1. the eight registers -----------------------------------------------
// Sampled two frames before $031B, i.e. while the title loop is running and
// the fade IN has long finished. $FFA9-$FFAF are the shadows the VBlank ISR
// pushes at $0806-$0817, so they ARE the registers.
console.log('assets/title.json, derived:');
const at = rows.get(f0 - 2);
check('lcdc', spec.lcd.lcdc, at.lcdc);
check('scx', spec.lcd.scx, at.scx);
check('scy', spec.lcd.scy, at.scy);
check('wx', spec.lcd.wx, at.wx);
check('wy', spec.lcd.wy, at.wy);
check('bgp', spec.lcd.bgp, at.bgp);
check('obp0', spec.lcd.obp0, at.obp0);
check('obp1', spec.lcd.obp1, at.obp1);

// ---- 2. sub_00_0A7F's fade-out, frame by frame ----------------------------
// The recorded shadow lags the port's write by a fixed pipeline: the probe
// samples at $0A4F, which is entered BEFORE the VBlank that pushes the value.
// Find that lag once, then require every frame to agree at it -- a fade that
// merely ended in the right place would pass a single end-state check.
console.log('\nsub_00_0A7F fade out ($0350, C = $00):');
const want = [];
for (let f = f1; f <= f2; f++) {
  const r = rows.get(f);
  if (r) want.push([r.bgp, r.obp0, r.obp1]);
}
const built = [];
{
  const fade = createFade(spec, 0x00);
  const video = { bgp: spec.lcd.bgp, obp0: spec.lcd.obp0, obp1: spec.lcd.obp1 };
  built.push([video.bgp, video.obp0, video.obp1]);
  while (tickFade(fade, video)) built.push([video.bgp, video.obp0, video.obp1]);
  built.push([video.bgp, video.obp0, video.obp1]);
}
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
let lag = -1;
for (let d = 0; d < 6 && lag < 0; d++) {
  let all = true;
  for (let i = 0; i + d < want.length && i < built.length; i++) {
    if (!eq(built[i], want[i + d])) { all = false; break; }
  }
  if (all) lag = d;
}
if (lag < 0) {
  fail++;
  console.log('  FAIL the ramp does not line up at any pipeline lag 0-5');
  console.log('       built    ' + built.slice(0, 30)
    .map((v) => v.map((x) => x.toString(16)).join('/')).join(' '));
  console.log('       cartridge ' + want.slice(0, 30)
    .map((v) => v.map((x) => x.toString(16)).join('/')).join(' '));
} else {
  const steps = [];
  for (let i = 0; i < built.length; i++) {
    if (!i || !eq(built[i], built[i - 1])) steps.push([i, built[i]]);
  }
  console.log(`  ok   ${built.length} frames agree at a ${lag}-frame sample lag`);
  console.log('       steps at frames '
    + steps.map(([i, v]) => `${i}:$${v[0].toString(16)}/$${v[1].toString(16)}`
      + `/$${v[2].toString(16)}`).join(' '));
}
check('length', 0x21, f2 - f1, (v) => `${v} frames`);

// ---- 3. loc_00_031B ------------------------------------------------------
console.log('\nloc_00_031B, the press-start flash:');
check('iterations', 0x78, rec.marks.body.length, (v) => `${v}`);
check('to $0350', 0x78, f1 - f0, (v) => `${v} frames`);

// The port's decision sequence: script = (B & 8) ? the whole 1:$7C44 text
// script : the 1:$7C57 eraser, over B counting $78 down to $01.
const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const ON = b64(spec.scripts[2]);
const OFF = b64(spec.flashOff);
const seq = [];
for (let b = 0x78; b >= 1; b--) seq.push((b & 0x08) ? ON : OFF);

// The cartridge's is whatever it left in $C61B; the probe records five bytes,
// which is the whole eraser and enough of the text script to tell them apart.
let lag2 = -1;
for (let d = 0; d < 6 && lag2 < 0; d++) {
  let all = true;
  for (let i = 0; i < seq.length; i++) {
    const r = rows.get(f0 + i + d);
    if (!r) { all = false; break; }
    for (let k = 0; k < 5; k++) {
      if (r.c61b[k] !== seq[i][k]) { all = false; break; }
    }
    if (!all) break;
  }
  if (all) lag2 = d;
}
if (lag2 < 0) {
  fail++;
  console.log('  FAIL the $C61B script sequence does not line up');
  for (let i = 0; i < 8; i++) {
    const r = rows.get(f0 + i);
    console.log(`       f+${i}  cartridge ${r.c61b.map((v) => v.toString(16))}`
      + `  built ${[...seq[i].slice(0, 5)].map((v) => v.toString(16))}`);
  }
} else {
  const runs = [];
  for (const s of seq) {
    if (runs.length && runs[runs.length - 1][0] === s) runs[runs.length - 1][1]++;
    else runs.push([s, 1]);
  }
  console.log(`  ok   all ${seq.length} staged scripts agree at a ${lag2}-frame `
    + 'sample lag');
  console.log('       blink: '
    + runs.slice(0, 6).map(([s, n]) => `${s === ON ? 'ON' : 'off'} x${n}`)
      .join(' ') + ' ...');
}
check('OPTIONS', 1, new Set(rec.rows.filter((r) => r.f >= f0 && r.f <= f2)
  .map((r) => r.option)).size, (v) => `${v} distinct tile(s)`);

console.log(fail ? '\nTITLE STATE REGRESSION' : '\nEXACT MATCH -- the title\'s '
  + 'LCD state and state 4 are derived, not captured.');
process.exit(fail ? 1 : 0);
