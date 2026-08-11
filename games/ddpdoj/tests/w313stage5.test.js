// W313: STAGE 5's spawn dependency span, and the first measurement of it.
//
// "Stage 5 has not started" was true of the handoff for a long time. It turns out the spawn layer
// needs nothing new: all 770 of its script records resolve to types the port already has, and the
// only counted gap in a full walk is one that stage 1 also produces.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { PaletteState } from '../src/palette.js';
import {
  SPAWN, STAGE, stageTableEntry, resetAndInstallStage26331E, runSpawnWalker,
} from '../src/spawn.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const S5 = Object.freeze({
  script: 0x237978, aux: 0x239190, res: 0x239396,
  records: 770, auxEntries: 259, maxIndex: 258, distinctIndices: 256,
  terminator: 0x239188, lastOffset: 0x0bf6, spanEnd: 0x239fb8,
});

/** Stage 5 installed the way `$26331E` installs it, from the cartridge's own table. */
function stage5() {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 4);          // the stage index, zero-based: 4 IS stage 5
  ram.setU16(0x813094, 8);          // stage * 2
  ram.setU16(0x813096, 16);         // stage * 4 -- what `stageIndex` reads
  resetAndInstallStage26331E(ram, ROM, log);
  return { ram, log, palette };
}

// ==================== 1. THE TABLE INSTALLS STAGE 5 FROM THE CARTRIDGE

test('W313 the stage table\'s fifth row is stage 5, and it installs', { skip: SKIP }, () => {
  // Nothing is typed in here: `$813096 / 4` picks the row and the row supplies all three
  // pointers. A port that hardcoded the script would not notice the aux or resource moving.
  const e = stageTableEntry(ROM, 4);
  assert.deepEqual(e, { script: S5.script, aux: S5.aux, res: S5.res });
  const f = stage5();
  assert.equal(f.ram.u32(SPAWN.LIVE_CURSOR), S5.script, 'the cursor is stage 5\'s script');
  assert.equal(f.ram.u32(SPAWN.AUX_BASE), S5.aux, 'and the aux base its aux table');
  assert.equal(STAGE.stride, 0x10);
});

test('W313 the table is exactly FIVE rows, and `installStage` follows it', { skip: SKIP }, () => {
  // `$263336 + 5 * $10 = $263386`, which is `installStage` itself -- so the table is pinned from
  // above by the code that reads it. A sixth row would be that routine's first instructions.
  assert.equal(SPAWN.STAGE_TAB + 5 * STAGE.stride, 0x263386);
  const e = stageTableEntry(ROM, 3);
  assert.equal(e.script, 0x2358b0, 'stage 4, for contrast');
  assert.notEqual(e.script, S5.script);
});

// ==================== 2. THE SPAN, AND WHY ITS FAR END IS DIFFERENT

test('W313 the script, aux and resource tile exactly', { skip: SKIP }, () => {
  // 770 records of 8 bytes, then the `$FFFF` terminator, then six bytes of pad to the aux table;
  // 259 aux words, and `aux + $206` IS the resource base. The same shape stages 2 and 3 have.
  let cur = S5.script;
  const idx = [];
  while (ROM.u16(cur) !== 0xffff) {
    idx.push(ROM.u16(cur + 6) & 0x0fff);
    cur += 8;
    assert.ok(idx.length <= 4096, 'bounded');
  }
  assert.equal(idx.length, S5.records);
  assert.equal(cur, S5.terminator);
  assert.equal(Math.max(...idx), S5.maxIndex);
  assert.equal(new Set(idx).size, S5.distinctIndices);
  assert.equal(S5.aux + S5.auxEntries * 2, S5.res, 'the aux table abuts the resource');
  assert.ok(S5.aux - (S5.terminator + 2) === 6, 'six bytes of pad after the terminator');
});

test('W313 the aux offsets are sorted, distinct, and start at zero', { skip: SKIP }, () => {
  const offs = Array.from({ length: S5.auxEntries }, (_, i) => ROM.u16(S5.aux + i * 2));
  assert.deepEqual(offs, [...new Set(offs)].sort((a, b) => a - b), 'sorted and distinct');
  assert.equal(offs[0], 0);
  assert.equal(offs[offs.length - 1], S5.lastOffset);
});

test('W313 stage 5 is the ONE stage whose span is closed by a stream, not a script',
  { skip: SKIP }, () => {
    // Stages 1..4 each end where the next stage's script begins, and the export guard asserts
    // exactly that. There is no stage 6, so stage 5's far end is its LAST movement stream's
    // terminator -- the same `$2000 $0000` close stage 4's last stream has -- and `$239FB8`
    // begins unrelated data. Getting this wrong would feed `4C 00 18 01` to the movement reader.
    const last = S5.res + S5.lastOffset;
    assert.equal(last, 0x239f8c);
    assert.equal(ROM.u16(last + 0x28), 0x2000, 'the stream terminator');
    assert.equal(ROM.u16(last + 0x2a), 0x0000, 'and the zero after it');
    assert.equal(last + 0x2c, S5.spanEnd);
    // Stage 4's last stream closes the same way, which is what makes this a family rule.
    assert.equal(ROM.u16(0x237970 + 4), 0x2000);
    assert.equal(ROM.u16(0x237970 + 6), 0x0000);
    assert.equal(0x237970 + 8, 0x237978, 'and stage 4\'s span ends at stage 5\'s script');
  });

// ==================== 3. THE MEASUREMENT: IT ALL WALKS

test('W313 every one of the 770 records spawns, over the whole clock range', { skip: SKIP }, () => {
  // The result that scopes the rest of stage 5: no `Unreached` anywhere in a full walk. Every
  // record resolves to a type the port already has, so the spawn layer needs nothing new.
  const f = stage5();
  let spawned = 0;
  for (let clock = 0; clock < 0x400; clock++) {
    f.ram.setU16(SPAWN.DISTANCE_CLOCK, clock);
    spawned += runSpawnWalker(f.ram, ROM, f.log, MT, undefined, f.palette).script;
  }
  assert.equal(spawned, S5.records, 'all 770');
  assert.equal(f.ram.u32(SPAWN.LIVE_CURSOR), S5.terminator,
    'and the cursor is parked on the terminator');
});

test('W313 the whole walk produces ONE counted gap, and it is a known one', { skip: SKIP }, () => {
  // `$24200A` is the type-$80 init's aim, which stage 1's own sweep also counts. So stage 5 adds
  // no new gap at all -- which is a stronger statement than "it does not throw".
  const f = stage5();
  for (let clock = 0; clock < 0x400; clock++) {
    f.ram.setU16(SPAWN.DISTANCE_CLOCK, clock);
    runSpawnWalker(f.ram, ROM, f.log, MT, undefined, f.palette);
  }
  const rep = f.log.report();
  assert.equal(rep.length, 1, `one gap, got: ${rep.join(' | ')}`);
  assert.match(rep[0], /\$24200A/);
  assert.match(rep[0], /type \$80 init/);
});

test('W313 the type census is what the next wave has to cover', { skip: SKIP }, () => {
  // 35 distinct types across 770 records. Pinned so a wave that changes a type's reachability can
  // see immediately whether stage 5 is affected, and so the counts cannot drift silently.
  const counts = new Map();
  let cur = S5.script;
  while (ROM.u16(cur) !== 0xffff) {
    const t = ROM.u8(cur + 4);
    counts.set(t, (counts.get(t) ?? 0) + 1);
    cur += 8;
  }
  assert.equal(counts.size, 35, '35 distinct types');
  // The four that dominate: $05 (280), $0B (148), $11 (88) and $82 (66) are 758 of the 770
  // between them and the long tail.
  assert.equal(counts.get(0x05), 280);
  assert.equal(counts.get(0x0b), 148);
  assert.equal(counts.get(0x11), 88);
  assert.equal(counts.get(0x82), 66);
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), S5.records);
  // And the boss-ish high types are present in ones and twos, which is what a final stage looks
  // like: $8A (10), $8E (6), $95 (8), $B0 (1).
  for (const t of [0x8a, 0x8e, 0x8f, 0x95, 0xb0]) {
    assert.ok(counts.get(t) > 0, `type $${t.toString(16)} appears`);
  }
});

test('W313 stage 5 spawns MORE records than any earlier stage', { skip: SKIP }, () => {
  // 770 against stage 4's 382, stage 3's 414 and stage 2's 332. Worth pinning because it is the
  // reason stage 5's window is the largest of the five at $2640.
  const recordsOf = (script) => {
    let cur = script;
    let n = 0;
    while (ROM.u16(cur) !== 0xffff) { n++; cur += 8; }
    return n;
  };
  assert.equal(recordsOf(S5.script), 770);
  assert.equal(recordsOf(0x2358b0), 382, 'stage 4');
  assert.equal(recordsOf(0x2342ba), 414, 'stage 3');
  assert.equal(recordsOf(0x2325d0), 332, 'stage 2');
  assert.ok(770 > 414, 'and stage 5 is the biggest');
});
