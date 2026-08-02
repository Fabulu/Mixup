#!/usr/bin/env node
// w25-eruption-probe.mjs -- count the eruption's spawns and handler executions
// on the PORT side, for spawn-for-spawn comparison against the cartridge's
// throwaudit-endchain.json ($C413 = 768 entries, $B36F = 6,365 executions, ~192
// spawns from the 1-in-4 $02 & 3 gate).
//
// Drives the port through the $82 countdown the way the game does: spawnEngine
// (which routes $82 to the late spawner) + updateEnemies (the type $0A handler)
// every frame, with the frame counter $02 free-running as on the cartridge.
//
// Run:  node games/gradius/tools/w25-eruption-probe.mjs
import { createState } from '../src/state.js';
import { spawnEngine, updateEnemies } from '../src/enemies.js';
import { headlessResources } from '../tests/helpers.js';

const res = headlessResources(0);
const s = createState();
// Park the state at the start of the $82 countdown, the way $81 ($9A0E) left
// it: substate $82, engine running ($60 = 2), $69 at 0 (the wave engine's last
// formation counted it down). The cartridge's endchain run enters $82 at game
// frame 1339; the $02 counter's phase matters for the gate, so start at 0
// (the gate is $02 & 3, and the cartridge's first $82 frame is 1339 -> $02 =
// 1339 & 0xFF = 0x5B -> 0x5B & 3 = 3, which does NOT spawn -- the first spawn
// is the next frame where $02 & 3 == 0, i.e. $02 = 0x5C). We model $02 from 0
// for a clean cycle and report the gated count, which is what the denominator
// (192) is.
s.substate = 0x82;
s.spawn.z60 = 2;
s.spawn.z69 = 0;

const DURATION = 768;        // the measured $82 duration at rank 1
let spawns = 0;
let handlerExecs = 0;
const spawnLog = [];         // {frame, slot, x, y, xvel, yvel} per spawn

for (let f = 0; f < DURATION; f++) {
  s.frame = f & 0xFF;
  const before = countType0A(s);
  spawnEngine(s, res);       // $82 -> lateSpawner (every 4th frame: spawn)
  const after = countType0A(s);
  if (after > before) {
    spawns += (after - before);
    for (let j = 0; j <= 9; j++) {
      const i = j + 12;
      if (s.obj.type[i] === 0x0A && !spawnLog.find(e => e.slot === j && e.frame === f)) {
        // a fresh spawn this frame (type just written, bit 7 still clear)
        spawnLog.push({ frame: f, slot: j, x: s.obj.x[i], y: s.obj.y[i],
                        xvel: s.obj.xvel[i], yvel: s.obj.yvel[i] });
      }
    }
  }
  // count handler executions BEFORE update: the cartridge's $B36F hook fires on
  // entry, so an enemy freed by offScreenCheck during this update still ran.
  handlerExecs += countType0A(s);
  updateEnemies(s, res);     // the type $0A handler runs here
}

function countType0A(s) {
  // handler executions this frame = slots holding type $0A or $8A (entry 10
  // runs for both: $83E4's ASL consumes bit 7). The cartridge's $B36F hook
  // fires on entry, once per such slot per frame.
  let n = 0;
  for (let j = 0; j <= 9; j++) {
    const t = s.obj.type[j + 12];
    if (t === 0x0A || t === 0x8A) n++;
  }
  return n;
}

console.log('=== W25 eruption probe (port-side, $82 countdown) ===');
console.log(`frames simulated: ${DURATION}`);
console.log(`$02 & 3 gate passed: ${Math.floor(DURATION / 4)} times (768/4 = 192)`);
console.log(`spawns (slot transitions to $0A): ${spawns}`);
console.log(`handler executions (type $0A/$8A slots per frame): ${handlerExecs}`);
console.log(`first 8 spawns:`);
for (const e of spawnLog.slice(0, 8)) {
  console.log(`  f${e.frame} slot${e.slot} x=$${e.x.toString(16)} y=$${e.y.toString(16)} xvel=$${e.xvel.toString(16)} yvel=$${e.yvel.toString(16)}`);
}
console.log(``);
console.log(`cartridge (throwaudit-endchain.json):`);
console.log(`  $C413 entries: 768  ($02 & 3 gate -> ~192 spawn-frames)`);
console.log(`  $B36F executions: 6,365`);
console.log(`  spawn frames: 192 (768/4), pattern cycles: ${(spawns/64).toFixed(2)}`);
