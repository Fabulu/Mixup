// Port-side counterpart to tools/oracle/econgameover.py.
//
// flowdiff.mjs's `game-over-wipes-progress` scenario compares
// screen/level/routeMask/continueAvailable/lives/hp. It does NOT sample
// $C754 (the +2-max-HP latch) or $C756 (difficulty), so whatever the port
// does with those on a game over has never been checked against anything.
//
// This drives the real port through the same event and prints them.
//
// Usage: node tools/oracle/econport.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';

installFetchShim();

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick, afterDeath } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');
const { MAX_HP_CELL, MAX_HP_BIT } = await imp('src/collision.js');
const { mapCollision, mapTile } = await imp('src/state.js');

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const loadout = resolveLoadout([]);

const show = (tag, s) => console.log(
  `  ${tag.padEnd(26)} routeMask=${s.flow.routeMask.toString(16).padStart(2, '0').toUpperCase()}` +
  `  maxHpTaken=${s.flow.maxHpTaken.toString(16).padStart(2, '0').toUpperCase()}` +
  `  difficulty=${s.flow.difficulty}` +
  `  lives=${s.flow.lives}  hpMax=${s.player.hpMax}  ammo=${s.flow.ammo}`);

// --- 1. drive a game over with a full run's worth of progress latched -------
const state = createState(makeTunables());
state.loadout = loadout;
await initLevel(state, 3);
state.flow.routeMask = 0x03;
state.flow.maxHpTaken = 0x07;   // all three +2 pickups taken
state.flow.difficulty = 2;
state.flow.lives = 1;           // this death is the game over
state.player.hpMax = 16;

show('before the last death', state);

const before = state.flow.gameOver || 0;
state.player.hp = 0;
let guard = 0;
while (!state.flow.respawnPending && guard++ < 4000) tick(state, manifest, playerTiles);
if (!state.flow.respawnPending) throw new Error('port never died');
state.flow.respawnPending = false;
const wasGameOver = (state.flow.gameOver || 0) !== before;
const route = afterDeath(state, wasGameOver);
await initLevel(state, 1);      // what main.js does on 'gameover'
console.log(`  (afterDeath -> ${route})`);
show('after the game over', state);

// --- 2. what that costs the next run ----------------------------------------
console.log('\n  the +2-max-HP pickup cells on the fresh run:');
for (const lvl of [3, 5, 0x0D]) {
  await initLevel(state, lvl);
  const c = MAX_HP_CELL[lvl];
  const coll = mapCollision(state, c.col, c.row);
  const tile = mapTile(state, c.col, c.row);
  console.log(`    level ${String(lvl).padStart(2)}  bit ${MAX_HP_BIT[lvl]}  cell (${c.col},${c.row})` +
              `  graphic=$${tile.toString(16).padStart(2, '0').toUpperCase()}` +
              ` collision=$${coll.toString(16).padStart(2, '0').toUpperCase()}` +
              `  ${coll === 0 && tile === 0 ? 'ERASED -- unobtainable' : 'present'}`);
}

// --- 3. control: the same three cells on a genuinely fresh state ------------
console.log('\n  control, maxHpTaken = 0:');
const fresh = createState(makeTunables());
fresh.loadout = loadout;
for (const lvl of [3, 5, 0x0D]) {
  await initLevel(fresh, lvl);
  const c = MAX_HP_CELL[lvl];
  const coll = mapCollision(fresh, c.col, c.row);
  const tile = mapTile(fresh, c.col, c.row);
  console.log(`    level ${String(lvl).padStart(2)}  cell (${c.col},${c.row})` +
              `  graphic=$${tile.toString(16).padStart(2, '0').toUpperCase()}` +
              ` collision=$${coll.toString(16).padStart(2, '0').toUpperCase()}`);
}
