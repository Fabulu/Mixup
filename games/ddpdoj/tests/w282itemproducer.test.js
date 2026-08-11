// W282 (DOCKET D16, D17): the item ALLOCATOR is complete, so the gap is the
// PRODUCER -- and the producer is now something this repo counts rather than reasons
// about (`tools/w282itemcensus.mjs`).
//
// The chain, settled across two waves:
//
//   the DISPLAY     W281  complete. One icon per unit of $81B6E0, guarded by
//                         $81B6E4, measured at 1/2/3/5.
//   the ALLOCATOR   here  complete. All six kinds {0,4,8,$C,$10,$14} return a
//                         record and mark a slot live, with zero counted notes.
//   the PRODUCER    here  fires, but rarely: ONE item in 5400 frames from the
//                         laser-hold rung, kind $0, first live at frame 2576.
//                         **Kind $C -- the hyper stock -- never spawns.**
//
// THE FINDING THAT MATTERS MOST is the smallest one: **900 frames is too short to
// see a single item.** Every other gate in this repo runs 900, which is why D16 read
// as a missing draw for two waves.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { ITEM, spawnItem, REFUSED_KINDS } from '../src/items.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const tablesPath = path.join(GAME, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

/** `$27E9F8`'s six real kinds, as `src/items.js` enumerates them. */
const KINDS = [0x00, 0x04, 0x08, 0x0c, 0x10, 0x14];

function world() {
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log, notes: log } };
}
const liveSlots = (ram) => {
  let n = 0;
  for (let i = 0; i < ITEM.slots; i++) if (ram.u16(ITEM.base + i * ITEM.stride) & 0x8000) n++;
  return n;
};

// ================================================ 1. THE ALLOCATOR IS COMPLETE

test('W282 spawnItem allocates EVERY one of the six kinds, silently', { skip: SKIP }, () => {
  // If any kind had failed here, D16 and D17 would both be allocator defects. None
  // does -- which is what moves both of them into the producer.
  for (const kind of KINDS) {
    const f = world();
    const a6 = 0x814000;                       // a scratch "dying enemy" record
    f.ram.setU16(a6 + 0x02, 0x1000);
    f.ram.setU16(a6 + 0x04, 0x1800);
    const rec = spawnItem(f.ram, ROM, f.ctx, kind, a6, 0x275b06);
    assert.notEqual(rec, null, `kind $${kind.toString(16)} returned a record`);
    assert.equal(liveSlots(f.ram), 1, `kind $${kind.toString(16)} marked a slot live`);
    assert.deepEqual(f.log.report(), [],
      `kind $${kind.toString(16)} counted nothing -- no hidden gap in the path`);
  }
});

test('W282 the HYPER kind is allocated like any other', { skip: SKIP }, () => {
  // Kind $C is the one D16 needs, and `spawnItem` still carries a `REFUSED_KINDS`
  // branch whose note is specifically about refusing it. That branch is DEAD (W163),
  // and this is the assertion that says so in behaviour rather than in a list.
  assert.deepEqual([...REFUSED_KINDS], [], 'nothing is refused');
  const f = world();
  const rec = spawnItem(f.ram, ROM, f.ctx, 0x0c, 0x814000, 0x275b06);
  assert.notEqual(rec, null, 'the hyper stock item allocates');
  assert.equal(liveSlots(f.ram), 1);
});

test('W282 an unlisted kind is a NAMED throw, not a silent wrong item', { skip: SKIP }, () => {
  // `$27E812`'s ELSE arm puts anything unlisted in the same one-slot pool and then
  // dispatches it as `d0 & $3C` -- a different item entirely. The port refuses.
  const f = world();
  assert.throws(() => spawnItem(f.ram, ROM, f.ctx, 0x06, 0x814000, 0x275b06),
    (e) => e.name === 'Unreached' && e.romAddress === 0x27e86c,
    'an unlisted D0 throws at $27E86C');
});

// ============================================= 2. THE POOL'S SHAPE IS THE ROM'S

test('W282 the pool geometry is what the census walks', { skip: SKIP }, () => {
  // The instrument reads `status & $8000` per slot at `base + i * stride`, so if any
  // of the three moved the census would silently report zero for ever.
  assert.equal(ITEM.stride, 0x40, '$40 bytes per record');
  assert.equal(ITEM.slots, 25);
  assert.equal(ITEM.base, 0x816b7a, 'the pool base the census prints');
});

test('W282 a live slot is distinguishable from a dead one', { skip: SKIP }, () => {
  // The census counts SPAWNS as "live this frame and not live last frame", which only
  // works if bit 15 is the liveness bit and it starts clear.
  const f = world();
  assert.equal(liveSlots(f.ram), 0, 'a fresh pool is empty');
  spawnItem(f.ram, ROM, f.ctx, 0x00, 0x814000, 0x275b06);
  assert.equal(liveSlots(f.ram), 1);
});

// ================================== 3. THE INSTRUMENT EXISTS AND SAYS WHAT IT SAW

test('W282 the census tool is present and records what it measured', () => {
  // The D5 pattern: when "does the game emit X" has been answered wrongly by reading
  // code, the answer becomes an instrument. This asserts the tool ships WITH its
  // measurement written down, because a census whose baseline lives only in a worklog
  // is one refactor away from meaning nothing.
  const src = readFileSync(path.join(GAME, 'tools', 'w282itemcensus.mjs'), 'utf8');
  assert.match(src, /900 frames   ZERO items/, 'the 900-frame result is recorded');
  assert.match(src, /5400 frames  ONE item, kind \$0/, 'and the 5400-frame one');
  assert.ok(src.includes('KIND $C -- THE HYPER STOCK ITEM -- NEVER SPAWNS'),
    'and the fact that D16 turns on');
  // It must count SPAWNS (edges), not live slots (levels), or a single long-lived
  // item reads as hundreds.
  assert.match(src, /if \(prev\.has\(i\)\) continue;/, 'it counts edges, not levels');
});

test('W282 the 900-frame window every other gate uses cannot see an item', () => {
  // The smallest finding and the one that cost two waves. Written into the tool's
  // header so the next person to point a 900-frame probe at an item question reads it
  // first.
  const src = readFileSync(path.join(GAME, 'tools', 'w282itemcensus.mjs'), 'utf8');
  assert.match(src, /too short to\n\/\/ see an item at all/,
    'the tool says so in as many words');
});
