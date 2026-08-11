#!/usr/bin/env node
// WAVE 282 -- HOW MANY ITEMS DOES A RUN ACTUALLY PRODUCE, AND OF WHICH KINDS?
//
//   node games/ddpdoj/tools/w282itemcensus.mjs [--lf N] [--frames N]
//
// WHY THIS EXISTS. D16 ("the hyper bar shows how much hyper you have even when not
// hypering") and D17 ("the in-stage medals are missing") both looked like missing
// draws and neither is:
//
//   * W281 proved the DISPLAY is complete -- `$285D74` draws one icon per unit of
//     `$81B6E0` guarded by `$81B6E4`, measured at 1/2/3/5.
//   * W282 proved the ALLOCATOR is complete -- `spawnItem` returns a record and
//     marks a slot live for every one of the six kinds {0,4,8,$C,$10,$14}, with
//     zero counted notes.
//
// So both items live in the PRODUCER, and a producer is a thing you count rather
// than reason about. This is the instrument for that count, and it exists for the
// same reason `w230descriptorsweep.mjs` does: the question "does the game emit X"
// was being answered by reading code, and reading code had already been wrong twice.
//
// WHAT IT MEASURED ON THE TREE THAT ADDED IT, from the laser-hold rung at lf2000:
//
//   900 frames   ZERO items.        <- which is why every earlier probe saw nothing
//   5400 frames  ONE item, kind $0, first live at frame 2575.
//
// **The 900-frame window that every other gate in this repo uses is too short to
// see an item at all.** That single fact is why D16 read as a missing draw for two
// waves: the words the display reads are zero because nothing has dropped yet, not
// because anything is broken.
//
// AND KIND $C -- THE HYPER STOCK ITEM -- NEVER SPAWNS in 5400 frames. So the hyper
// display having nothing to show is, so far as this instrument can tell, CORRECT for
// this window. Whether it is correct for the whole stage is the open question, and
// it is the one to point a longer run at.
//
// THE NUMBERS THIS PRINTS ARE THE PORT'S, NOT THE BOARD'S. It says what the
// translation produces. A drop rate that looks low is a lead, not a verdict --
// `deathSeq85`'s own comment says the type-$85 drop is GUARANTEED with no RNG, so
// one drop means one type-$85 death, and the next question is how many the stage
// actually sends.

import { readFileSync, existsSync } from 'node:fs';

const S = new URL('../src/', import.meta.url).href;
const { Game } = await import(S + 'main.js');
const { portWordFromBits } = await import(S + 'input.js');
const { BIT } = await import(S + 'machine.js');
const { ITEM } = await import(S + 'items.js');
const R = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : dflt;
};
const FRAMES = arg('--frames', 5400);
const LF = arg('--lf', null);

const tables = JSON.parse(readFileSync(R + 'rip/port/player.tables.json', 'utf8'));

let g;
if (LF === null) {
  g = new Game(new Uint8Array(readFileSync(R + 'rip/web/seed.bin')), tables,
    { palCatchUp: false });
  console.log('booted from the shipped seed');
} else {
  // The same ladder `w230descriptorsweep.mjs` boots from, for the same reason: a
  // rung is a known state and the shipped seed is only one of them.
  const LADDER = R + 'tools/oracle/out/w69/stage1-laser-hold/ckpt/';
  const f = `${LADDER}c00${String(LF).padStart(4, '0')}.ram.bin`;
  if (!existsSync(f)) {
    console.error(`no lf${LF} rung at ${f}`);
    process.exit(1);
  }
  g = new Game(new Uint8Array(readFileSync(f)), tables, { palCatchUp: false });
  console.log(`booted from lf${LF}`);
}

// Fire held, which is what the laser-hold ladder's own script does and what makes
// the trail and the beam live. An item census with no shooting would measure a run
// in which nothing dies.
const shot = portWordFromBits([BIT.b1]);

// The KIND is `status & $3C` -- `$27E9DE moveq #$3C,D0 / and.w D1,D0`, four bits
// against an eight-entry dispatch, which `src/items.js` records in full.
const KIND_MASK = 0x3c;
const KIND_NAME = {
  0x00: 'power-up',
  0x04: 'bomb/spare',
  0x08: 'spiral',
  0x0c: 'HYPER STOCK  <- what D16 needs',
  0x10: 'the ELSE arm',
  0x14: 'kind $14',
};

const spawnsByKind = new Map();
let spawns = 0;
let firstLive = -1;
let framesWithAny = 0;
let maxConcurrent = 0;
let threw = null;
let prev = new Set();
const stagesSeen = new Set();

for (let f = 1; f <= FRAMES; f++) {
  try {
    g.step(shot);
  } catch (e) {
    threw = { frame: f, name: e.name, addr: e.romAddress };
    break;
  }
  stagesSeen.add(g.ram.u16(0x813096) >> 2);
  const live = new Set();
  for (let i = 0; i < ITEM.slots; i++) {
    const st = g.ram.u16(ITEM.base + i * ITEM.stride);
    if ((st & 0x8000) === 0) continue;
    live.add(i);
    if (prev.has(i)) continue;          // already counted on the frame it appeared
    spawns++;
    if (firstLive < 0) firstLive = f;
    const k = st & KIND_MASK;
    spawnsByKind.set(k, (spawnsByKind.get(k) ?? 0) + 1);
  }
  if (live.size) framesWithAny++;
  if (live.size > maxConcurrent) maxConcurrent = live.size;
  prev = live;
}

const hx = (n) => '$' + (n >>> 0).toString(16).toUpperCase();

console.log(`\nitem pool ${hx(ITEM.base)}, stride ${hx(ITEM.stride)}, ${ITEM.slots} slots`);
console.log(`frames run                 ${threw ? threw.frame - 1 : FRAMES}`);
console.log(`stage indices visited      ${[...stagesSeen].sort((a, b) => a - b).join(' ')}`);
console.log(`ITEMS SPAWNED              ${spawns}`);
console.log(`first one live at frame    ${firstLive < 0 ? '(never)' : firstLive}`);
console.log(`frames with any item live  ${framesWithAny}`);
console.log(`max concurrent             ${maxConcurrent}`);

console.log('\nby kind:');
if (!spawnsByKind.size) console.log('  (none)');
for (const [k, n] of [...spawnsByKind.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${hx(k).padEnd(6)} ${String(n).padStart(4)}  ${KIND_NAME[k] ?? '(not a listed kind)'}`);
}
for (const k of Object.keys(KIND_NAME).map(Number)) {
  if (!spawnsByKind.has(k)) console.log(`  ${hx(k).padEnd(6)}    0  ${KIND_NAME[k]}`);
}

// The four words every hyper display reads. Zero here and a non-zero spawn count
// above would mean the COLLECT path is the gap; zero in both means the producer is.
console.log('\nthe words the hyper displays read:');
for (const [name, a] of [['$81B65C stock', 0x81b65c], ['$81B6E0 icon count', 0x81b6e0],
  ['$81B6E4 gate', 0x81b6e4], ['$81B642 gauge', 0x81b642]]) {
  console.log(`  ${name.padEnd(20)} ${g.ram.u16(a)}`);
}

if (threw) {
  console.log(`\nSTOPPED at frame ${threw.frame}: ${threw.name}`
    + (threw.addr ? ` ${hx(threw.addr)}` : ''));
}
