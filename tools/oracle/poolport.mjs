// PORT TWIN of tools/oracle/poolwatch.py: the $C6CF ballistic pool during
// ordinary play, printed in the same format so the two can be diffed by eye or
// by `diff`.
//
// It exists for the level-6 vehicle's shot (1:$57CB), which is the first
// spawner in the game to pass a non-$FF $C74D -- i.e. the first one whose
// drift byte is not zero, and therefore the first that can tell an ADD from a
// SUB at 0:$14AD. Both facings matter and the tool takes --warp for that
// reason: the vehicle faces by WORLD column, so where the player stands
// decides the sign.
//
//   python tools/oracle/poolwatch.py  --level 6 --frames 400
//   node   tools/oracle/poolport.mjs  --level 6 --frames 400
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';

installFetchShim();

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.indexOf(`--${n}`) >= 0
  ? argv[argv.indexOf(`--${n}`) + 1] : d);
const level = parseInt(arg('level', '6'), 10);
const frames = parseInt(arg('frames', '400'), 10);
const script = arg('script', '');
const warp = arg('warp', null);

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const timeline = [];
for (const seg of script.split(',').filter(Boolean)) {
  const [n, keys = ''] = seg.split(':');
  let mask = 0;
  for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
}

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');

const state = createState(makeTunables());
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
await initLevel(state, level);
// poolwatch.py writes the warp straight after boot, before its first tick.
if (warp) {
  const [c, r] = warp.split(',').map((v) => parseInt(v, 10));
  state.player.x = ((c & 0xFF) << 8) | 0x80;
  if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
}

// --inject HH mirrors tools/oracle/driftsign.py: plant one drop with a chosen
// drift byte and a rising velocity, so the X arithmetic can be read on its own.
const inject = arg('inject', null);
if (inject !== null) {
  const s = state.drops[0];
  s[0] = 0x01; s[1] = 0x05; s[2] = 0x00; s[3] = 0x10; s[4] = 0x00;
  s[5] = parseInt(inject, 16) & 0xFF; s[6] = 0x7F; s[7] = 0x01;
}

const hex = (v, n = 2) => v.toString(16).toUpperCase().padStart(n, '0');
let prev = null;
let spawns = 0;
for (let f = 1; f <= frames; f++) {
  const held = timeline.length
    ? (timeline[Math.min(f - 1, timeline.length - 1)] ?? 0) : 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);

  const live = [];
  for (let i = 0; i < state.drops.length; i++) {
    const s = state.drops[i];
    if (s[0]) live.push([i, s]);
  }
  const sig = inject === null
    ? live.map(([i, s]) => `${i}:${s[0]}:${s[7]}`).join(',')
    : String(f);            // --inject wants every frame, not just the changes
  if (sig === prev) continue;
  const body = live.map(([i, s]) =>
    `#${i} k=${hex(s[0])} x=${hex(s[1])}${hex(s[2])} y=${hex(s[3])}${hex(s[4])} `
    + `vx=${hex(s[5])} vy=${hex(s[6])} sub=${hex(s[7])}`).join('  ');
  console.log(`f${String(f).padStart(4)} hp=${String(state.player.hp).padStart(2)} `
              + `kb=${hex(state.player.iframes & 0xFF)}  ${body || '(empty)'}`);
  if (live.length > (prev === null ? 0 : prev.split(',').filter(Boolean).length)) {
    spawns++;
  }
  prev = sig;
}
console.log(`-- pool spawn events: ${spawns}, final hp ${state.player.hp}`);
