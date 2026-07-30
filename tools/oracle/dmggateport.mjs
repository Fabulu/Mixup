// PORT TWIN of tools/oracle/dmggate.py, run as a DIFFERENTIAL.
//
// The cartridge side plants an enemy the punch cannot miss and shows that the
// damage arms past $26B7/$3C4E never run while $C740 is not $FF. A port has no
// ROM addresses to hook, so the equivalent evidence is the same experiment run
// twice with only the gate byte changed:
//
//   $C740 = $FF   damage must land   (otherwise the harness itself is broken)
//   $C740 = $FE   damage must not
//
// A check that only ever runs the failing half proves nothing -- so this one
// runs both, and reports FAIL if either half comes out the wrong way.
//
//   node tools/oracle/dmggateport.mjs [--level 3] [--frames 200]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';

installFetchShim();

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.indexOf(`--${n}`) >= 0
  ? argv[argv.indexOf(`--${n}`) + 1] : d);
const level = parseInt(arg('level', '3'), 10);
const frames = parseInt(arg('frames', '200'), 10);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();

const u8 = (v) => v & 0xFF;

async function trial(countdown) {
  const state = createState(makeTunables());
  await initLevel(state, level);
  state.flow.ammo = 9;
  state.player.x = (46 << 8) | 0x80;                // the punch scenarios' spot
  state.player.y = (23 << 8);

  let damage = 0;
  let cues19 = 0;
  let moved = new Set();

  for (let f = 1; f <= frames; f++) {
    // $C740, held for the whole run.
    state.effects.countdown = countdown;

    // A slot-3 enemy the scan cannot miss: parked on the player's own screen
    // point with a 63 px box, rewritten every frame so the driver cannot move
    // it, despawn it or animate it out of the window.
    const r = state.enemies[3];
    const psx = u8((((state.player.x - state.camera.x) & 0xFFFF) >> 4) + 8);
    const psy = u8(((((state.player.y & 0x0FFF) - state.camera.y) & 0xFFFF) >> 4)
                   + 0x10);
    r[0] = 0x80; r[2] = 0x01;
    r[7] = psx; r[8] = psy;
    r[0x0B] = 0x40; r[0x0C] = 0x40;
    r[0x16] = 40; r[0x17] = 0;
    const hpBefore = r[0x16];

    const held = ((f >> 2) & 1) ? 0x02 : 0x00;      // B, four on four off
    state.input.pressed = held & ~state.input.prev;
    state.input.held = held;
    state.input.prev = held;
    if (state.flow.ammo < 2) state.flow.ammo = 9;
    tick(state, manifest, playerTiles);

    if (r[0x16] < hpBefore) damage++;
    for (const q of state.sound.queue) if (q.id === 0x19) cues19++;
    state.sound.queue.length = 0;
    moved.add(state.player.x >> 8);
  }
  return { damage, cues19, cols: [...moved].sort((a, b) => a - b) };
}

const idle = await trial(0xFF);
const dead = await trial(0xFE);

console.log(`level ${level}, ${frames} frames, an unmissable slot-3 enemy`);
console.log(`  $C740 = $FF  hits ${idle.damage}  cue $19 x${idle.cues19}`);
console.log(`  $C740 = $FE  hits ${dead.damage}  cue $19 x${dead.cues19}`);
console.log(`  player columns visited while gated: ${dead.cols.join(' ')}`);
const ok = idle.damage > 0 && dead.damage === 0 && dead.cues19 === 0;
console.log(ok ? '  PASS - the gate blocks damage and only the gate does'
                : '  FAIL');
process.exit(ok ? 0 : 1);
