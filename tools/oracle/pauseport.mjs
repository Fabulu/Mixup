// Port-side counterpart to tools/oracle/pauseoam.py and econpause.py.
//
// Drives the real tick() with START newly pressed, and prints per frame:
// flow.paused ($C716), state.parity ($FFA7), the player's X, the shadow-OAM
// entry count and its head. Also drains the $C6FB cue queue so the pause cue
// ($0B mask $01, queued at $062E on the PAUSE half only) is counted once.
//
//   node tools/oracle/pauseport.mjs --level 9 --hold 20

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';

installFetchShim();

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');
const { BTN } = await imp('src/input.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const level = parseInt(arg('level', '9'), 10);
const hold = parseInt(arg('hold', '20'), 10);
const settle = parseInt(arg('settle', '30'), 10);

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
state.loadout = resolveLoadout([]);
await initLevel(state, level);

const cues = [];
let prev = 0;
/** The VBlank joypad read: $FFE1 held, $FFE2 = newly pressed. */
function press(now) {
  state.input.pressed = now & ~prev;
  state.input.held = now;
  prev = now;
}

const rows = [];
function step(buttons) {
  press(buttons);
  tick(state, manifest, playerTiles);
  // sound.pump() drains $C6FB every frame in the real loop.
  while (state.sound.queue.length) cues.push(state.sound.queue.shift());
  const s = state.video.sprites;
  rows.push({
    paused: state.flow.paused ? 1 : 0,
    // tick() flips at the tail, so the frame's own $FFA7 is the other one.
    par: state.parity ^ 1,
    x: state.player.x,
    n: s.length,
    head: s.slice(0, 8).map((e) => `${e.x},${e.y}#${(e.tile & 0xFF)
      .toString(16).toUpperCase().padStart(2, '0')}`).join(' '),
    cues: cues.length,
  });
}

for (let i = 0; i < settle; i++) step(BTN.RIGHT);
const base = rows.length;
step(BTN.RIGHT | BTN.START);                     // START newly pressed
step(BTN.RIGHT);
for (let i = 0; i < hold; i++) step(BTN.RIGHT);
step(BTN.RIGHT | BTN.START);                     // and again
for (let i = 0; i < 20; i++) step(BTN.RIGHT);

console.log('   f C716 FFA7 playerX nOAM cues  head (x,y#tile)');
let last = null;
rows.slice(base).forEach((r, i) => {
  const key = `${r.paused}|${r.n}|${r.head}|${r.cues}`;
  if (key === last) return;
  last = key;
  console.log(`${String(i).padStart(4)} ${String(r.paused).padStart(4)}`
    + ` ${String(r.par).padStart(4)} ${String(r.x).padStart(7)}`
    + ` ${String(r.n).padStart(4)} ${String(r.cues).padStart(4)}  ${r.head}`);
});
console.log('\ncues queued: ' + JSON.stringify(cues));
