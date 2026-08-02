// Port twin + assertion for tools/oracle/carrygate.py.
//
// Runs the same level-5 exit-script scenario, pokes a carry onto the arming
// frame, and ASSERTS the cartridge's measured behaviour: while the script runs
// the inbox is untouched and unmirrored, and it is consumed on the first frame
// after it ends. Exits non-zero if that stops being true, so it can be wired
// into a gate stage as-is.
//
//   node tools/oracle/carryport.mjs
import assert from 'node:assert/strict';
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

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, 5);
state.player.x = (3 << 8) | 0x80;
state.player.y = 20 << 8;

let poked = false;
let armedAt = null, endedAt = null, consumedAt = null;
const pendingWhileScripted = [];
const mirrorWhileScripted = [];

for (let f = 0; f < 200; f++) {
  const held = f >= 4 ? 0x10 : 0;          // RIGHT
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;

  tick(state, manifest, playerTiles);

  const running = state.script.mode !== 0;      // $C737
  if (running && !poked) { state.carry.x = 4; poked = true; armedAt = f; }
  if (running) {
    pendingWhileScripted.push(state.carry.x);
    mirrorWhileScripted.push(state.rope.saveX);
  }
  if (poked && !running && endedAt === null) endedAt = f;
  if (poked && consumedAt === null && state.carry.x === 0 && f > armedAt) consumedAt = f;

}

console.log(`script armed at f${armedAt}, ended at f${endedAt}, carry consumed at f${consumedAt}`);
console.log(`carry.x during the script: ${[...new Set(pendingWhileScripted)].join(',')}`);
console.log(`rope.saveX during the script: ${[...new Set(mirrorWhileScripted)].join(',')}`);

assert.notEqual(armedAt, null, 'the scenario never armed a scripted move');
assert.deepEqual([...new Set(pendingWhileScripted)], [4],
  'ROM $1643: while $C737 is nonzero the carry inbox is never consumed or zeroed');
assert.deepEqual([...new Set(mirrorWhileScripted)], [0],
  'ROM $170E/$1724: the $C723/$C724 mirror is written INSIDE loc_00_170A, so a '
  + 'script frame must leave it alone');
// `endedAt` is the frame whose OWN tick cleared $C737, and $1643 had already
// branched by then -- so the inbox survives that frame too and is consumed by
// the next one. MEASURED identically on the cartridge (carrygate.py): $C737
// reads 0 at f81 with loc_00_164A hit once and loc_00_170A not at all, and
// f82 is where $C723 becomes 4 and $C72F becomes 0.
assert.equal(consumedAt, endedAt + 1,
  'the pending carry must land on the first frame AFTER the script ends');
console.log('PASS - the carry inbox is gated on $C737, matching carrygate.py');
