// GAME OVER lettering: the port's OAM against the cartridge's, byte for byte.
//
// WHAT THE EFFECT IS.  SAVEPOINT item 2 -- "the snaking pseudo-3D game-over
// lettering" -- filed this under the raster program.  tools/oracle/rasterhunt.py
// disproved that (zero STAT fires on every menu screen) and
// tools/oracle/gameoverprobe.py finished the job by LOOKING: the eight
// metasprites 0:$2ACF names are OBJ tiles $1C $1E $20 $22 $24 $26 $28, and read
// out of live VRAM they are the bevelled letters **G A M E   O V E R**.  Slot n
// arms only once slot n-1 has taken 8 steps, so the eight letters trail each
// other along ONE 276-entry path (0:$2AFF) like a snake.  It is not a raster
// effect and it is not animated tiles -- it is eight sprites on a path table,
// and it is the PLAYER DEATH sequence, which src/effects.js already drives
// under the name "the $C1C0 death burst".
//
// WHAT THIS PROVES.  deathscen.py/deathdiff.mjs already pin the $C1C0 records
// and the 452-frame length.  What was never compared is what the sequence
// DRAWS.  This runs the real src/effects.js burst and diffs, for every one of
// the ~452 iterations:
//
//   * the ordered list of 4-byte OAM records the burst wrote that frame
//     (y, x, tile, attr) -- the cartridge's taken at the two CALL sites
//     $2A6A / $2AA8 by reading the $FF9D cursor before each call;
//   * the $C1C0 records themselves;
//   * the arm / park / handoff frames.
//
// and reports separately, without failing on it, the ONE thing the port cannot
// currently match: WHERE in shadow OAM the letters land.  $0567 runs the PAIR
// `CALL sub_00_0F7B` (the energy bar) + `CALL NZ,sub_00_29E7` at $0573/$057A
// when $FFA7 == 0, and the same pair at $05E5/$05EC when it does not -- i.e.
// before the player on one frame and after the player, the enemies and the
// doors on the next.  MEASURED, the burst's first OAM cursor alternates 20 /
// 44 on level 1, 20 / 60 on level 3, 20 / 88 on level 9.  The port draws the
// HUD unconditionally first (src/main.js $0573) and the burst inside
// src/player.js's deathTick, so it always produces the $057A ordering.
// OAM index is DMG sprite priority and the 10-per-line cut, and the letters do
// cross both the energy bar's row and the dying Batman at the left edge, so
// this is a real difference -- measured here rather than asserted away.
//
// Usage:  node tools/oracle/gameoverdiff.mjs [--record] [--level 1] [--show 8]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const PY = process.env.PYTHON || 'python';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const level = parseInt(arg('level', '1'), 10);
const show = parseInt(arg('show', '6'), 10);
const REF = path.join(ROOT, 'rip', 'oracle', `gameover-l${level}.json`);

if (argv.includes('--record') || !fs.existsSync(REF)) {
  execFileSync(PY, ['tools/oracle/gameoverscen.py', '--level', String(level),
    '--out', `rip/oracle/gameover-l${level}.json`], { cwd: ROOT, stdio: 'inherit' });
}
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { createState } = await imp('src/state.js');
const { startDeathBurst, deathBurstTick, effects } = await imp('src/effects.js');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));

const state = createState();
state.tables = manifest.tables;

// sub_00_29E7 seeds $C712 with $78 literally; the tunable is a mod knob and
// defaults to it. Use the ROM value so this compares the cartridge, not a mod.
startDeathBurst(state, 0x78);

// ---------------------------------------------------------------------------
// Replay.  One deathBurstTick == one main-loop iteration == one $0A4F ==
// one recorded row, and the recording starts at the frame $C715 went nonzero.
// ---------------------------------------------------------------------------
const rows = ref.frames;
const seeded = ref.seededFrame;
const port = [];
for (let i = 0; i < rows.length + 8; i++) {
  state.video.sprites.length = 0;
  const landed = deathBurstTick(state, manifest);
  port.push({
    sprites: state.video.sprites.map((s) => [s.y + 16, s.x + 8, s.tile, s.attr]),
    burst: effects(state).burst.map((r) => Array.from(r)),
    ticks: effects(state).deathTicks,
    landed,
  });
  if (landed) break;
}

// ---------------------------------------------------------------------------
// Align.  The cartridge's row `seeded` is the frame sub_00_29E7 ran; the FIRST
// loc_00_2A0D tick is the next iteration, because $29EB's `JR NZ` only takes
// the drive path once $C715 is already set.  MEASURED: the recording shows
// $C715 first nonzero at f41 and slot 0 armed at f42, so cart row (seeded + 1 +
// k) is port tick k.
// ---------------------------------------------------------------------------
const byFrame = new Map(rows.map((r) => [r.f, r]));
const first = seeded + 1;

let compared = 0, oamBytes = 0, oamOk = 0, recBytes = 0, recOk = 0;
const bad = [];
const cursorHist = new Map();

for (let k = 0; k < port.length; k++) {
  const cart = byFrame.get(first + k);
  if (!cart) break;
  compared++;
  if (cart.pre !== null && cart.pre !== undefined) {
    cursorHist.set(cart.pre, (cursorHist.get(cart.pre) || 0) + 1);
  }

  const want = cart.draws.map((d) => d.rec);
  const got = port[k].sprites;
  const n = Math.max(want.length, got.length);
  for (let s = 0; s < n; s++) {
    for (let b = 0; b < 4; b++) {
      oamBytes++;
      const a = want[s] ? want[s][b] : null;
      const c = got[s] ? got[s][b] : null;
      if (a === c) oamOk++;
      else if (bad.length < 200) {
        bad.push({ f: first + k, kind: 'oam', slot: s, byte: b, want: a, got: c });
      }
    }
  }
  for (let i = 0; i < 8; i++) {
    for (let b = 0; b < 5; b++) {
      recBytes++;
      const a = cart.burst[i][b], c = port[k].burst[i][b];
      if (a === c) recOk++;
      else if (bad.length < 200) {
        bad.push({ f: first + k, kind: 'rec', slot: i, byte: b, want: a, got: c });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Landmarks.  Derived on both sides, never hardcoded.
// ---------------------------------------------------------------------------
const portArm = Array(8).fill(null), portPark = Array(8).fill(null);
for (let k = 0; k < port.length; k++) {
  for (let i = 0; i < 8; i++) {
    const fl = port[k].burst[i][0];
    if (fl && portArm[i] === null) portArm[i] = first + k;
    if ((fl & 1) && portPark[i] === null) portPark[i] = first + k;
  }
}
const portHandoff = port.length ? first + port.length - 1 : null;

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const armOk = eq(ref.armFrames, portArm);
const parkOk = eq(ref.parkFrames, portPark);
// loc_00_2AAD is reached from inside loc_00_2A0D, during an iteration whose
// $0A4F never fires ($2ACC jumps to loc_00_035B) -- so the cartridge's landing
// frame is one PAST the last recorded row, which is exactly the tick on which
// the port's deathBurstTick returns true. gameoverscen.py already applies that
// +1 when it records `handoffFrame`; applying it again here is a double count.
const handoffOk = ref.handoffFrame === portHandoff;

const pct = (a, b) => (b ? (100 * a / b).toFixed(2) : '--') + '%';
console.log(`level ${level}: ${compared} iterations compared ` +
            `(cartridge ${ref.iterations}, port ${port.length}, lag ${ref.lagFrames})`);
console.log(`  OAM records   ${oamOk}/${oamBytes} bytes  ${pct(oamOk, oamBytes)}`);
console.log(`  $C1C0 records ${recOk}/${recBytes} bytes  ${pct(recOk, recBytes)}`);
console.log(`  arm frames    ${armOk ? 'MATCH' : 'DIFFER'}  ${JSON.stringify(ref.armFrames)}` +
            (armOk ? '' : ` vs ${JSON.stringify(portArm)}`));
console.log(`  park frames   ${parkOk ? 'MATCH' : 'DIFFER'}  ${JSON.stringify(ref.parkFrames)}` +
            (parkOk ? '' : ` vs ${JSON.stringify(portPark)}`));
console.log(`  handoff       ${handoffOk ? 'MATCH' : 'DIFFER'}  cartridge f${ref.handoffFrame}` +
            `, port f${portHandoff}`);
console.log(`  metasprite ids 0:$2ACF = ${ref.ids.map((v) => '$' + v.toString(16)).join(' ')}` +
            '  =  G A M E  O V E R');
console.log('  OAM cursor the burst starts at (order, NOT compared -- see header): ' +
            [...cursorHist.entries()].sort((a, b) => a[0] - b[0])
              .map(([k, v]) => `${k}x${v}`).join(' '));

if (bad.length) {
  console.log(`\nfirst ${Math.min(show, bad.length)} of ${bad.length}+ mismatches:`);
  for (const d of bad.slice(0, show)) console.log('  ', JSON.stringify(d));
}

const ok = oamOk === oamBytes && recOk === recBytes && armOk && parkOk && handoffOk
           && compared > 400;
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
