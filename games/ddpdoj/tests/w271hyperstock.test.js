// W271 (DOCKET D7): the hyper stock row and the lives row were TRANSCRIBED and never
// called. These prove the bodies work and that the stage-clear arm now calls them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { hyperStock286ED6, livesRow2878CC, HUD, HUDRAM } from '../src/hud.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, '..', 'src', 'hud.js'), 'utf8');

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const TX = { head: 0x80b058, cursor: 0x80c8d8 };
const cells = (ram) => {
  let n = 0;
  for (let a = TX.head; a < TX.cursor; a += 8) {
    if (ram.u32(a) === 0xffffffff) break;
    n++;
  }
  return n;
};

function world() {
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log, notes: log } };
}

test('W271 the stage-clear arm CALLS the two bodies instead of noting them', () => {
  // The defect was not a missing routine and not a missing sprite: `hyperStock286ED6`
  // landed in W113 and `livesRow2878CC` in W116, and `slideIn284CF2`'s `flags9` bit-0 arm
  // -- the stage-clear/banner frames -- still called the NOTE for all four addresses.
  const arm = SRC.slice(SRC.indexOf('function slideIn284CF2'));
  const head = arm.slice(0, arm.indexOf('$284D2E'));
  assert.match(head, /hyperStock286ED6\(ram, rom, ctx, 0\)/);
  assert.match(head, /hyperStock286ED6\(ram, rom, ctx, 1\)/);
  assert.match(head, /livesRow2878CC\(ram, rom, ctx, 0\)/);
  assert.match(head, /livesRow2878CC\(ram, rom, ctx, 1\)/);
  for (const a of ['0x286ed6', '0x286f3e', '0x2878cc', '0x28795c']) {
    assert.ok(!head.includes(`draw(ctx, ${a})`), `${a} is no longer noted here`);
  }
});

test('W271 no transcribed draw anywhere in hud.js is left on the note', () => {
  // The generalisation, checked mechanically rather than by eye: a `draw(ctx, $X)` where
  // hud.js also has a body named for `$X` is the same defect -- UNLESS it is the body's
  // own `if (!rom)` fallback, which is correct.
  const impl = new Set([...SRC.matchAll(/export function \w*?([0-9A-F]{6})\s*\(/g)]
    .map((m) => parseInt(m[1], 16)));
  const bad = [];
  for (const m of SRC.matchAll(/draw\(ctx, (0x[0-9a-f]+)\)/g)) {
    const a = parseInt(m[1], 16);
    const before = SRC.slice(Math.max(0, m.index - 90), m.index);
    if (impl.has(a) && !/if \(!rom\)/.test(before)) bad.push(a);
  }
  // $240DC2 and $240EBC survive on purpose: a note at THOSE is a caller whose own
  // register setup is untranscribed ($284970, $284BC4), which is a different gap.
  assert.deepEqual(bad.map((a) => `$${a.toString(16).toUpperCase()}`).sort(),
    ['$240DC2', '$240EBC'], 'only the text primitives, and for a different reason');
});

test('W271 the hyper stock row DRAWS, for both sides', { skip: SKIP }, () => {
  for (const who of [0, 1]) {
    const f = world();
    const before = cells(f.ram);
    hyperStock286ED6(f.ram, ROM, f.ctx, who);
    assert.ok(cells(f.ram) > before, `side ${who} enqueued text cells`);
    assert.deepEqual(f.log.report(), [], 'and counted nothing');
  }
});

test('W271 the icon comes from $2883E6 when NOT hypering and is fixed when hypering',
  { skip: SKIP }, () => {
    // $286F0C tst.w $81B63E / bne -- the two arms pick different tiles, which is the
    // whole content of the row.
    const idle = world();
    idle.ram.setU16(HUDRAM.hyperStockIdxP1, 3);
    hyperStock286ED6(idle.ram, ROM, idle.ctx, 0);
    const idleCells = cells(idle.ram);

    const up = world();
    up.ram.setU16(HUDRAM.hyperActiveP1, 1);
    up.ram.setU16(HUDRAM.hyperStockIdxP1, 3);
    hyperStock286ED6(up.ram, ROM, up.ctx, 0);
    assert.equal(cells(up.ram), idleCells, 'the same 3x6 grid either way');
    // ...but a different tile, and the ROM says which.
    assert.notEqual(ROM.u32(HUD.hyperStockTab + 3 * 4), HUD.hyperStockActiveTile,
      'the stock-3 icon and the active icon really differ');
    let differs = false;
    for (let a = TX.head; a < TX.head + idleCells * 8; a += 8) {
      if (idle.ram.u32(a) !== up.ram.u32(a)
        || idle.ram.u32(a + 4) !== up.ram.u32(a + 4)) { differs = true; break; }
    }
    assert.ok(differs, '$286F30 vs $286F24 -- the two arms draw different cells');
  });

test('W271 the stock INDEX selects the icon, so the row tracks the gauge',
  { skip: SKIP }, () => {
    // $286F14..$286F24: `$2883E6[$81B65C * 4]`. Different stock, different tile -- which
    // is what "the gauge is painted" means for this row.
    const seen = new Set();
    for (const idx of [0, 1, 2, 3]) {
      const f = world();
      f.ram.setU16(HUDRAM.hyperStockIdxP1, idx);
      hyperStock286ED6(f.ram, ROM, f.ctx, 0);
      seen.add(f.ram.u32(TX.head + 4));
      assert.notEqual(ROM.u32(HUD.hyperStockTab + idx * 4), 0,
        `stock ${idx} has a real tile`);
    }
    assert.ok(seen.size > 1, `the row changes with the stock, saw ${seen.size} tiles`);
  });

test('W271 the P2 row is at a different position from P1\'s', { skip: SKIP }, () => {
  // $286EDA move.w #$200,D1 against $286F42 move.w #$1400,D1. A port that shared the
  // position would draw both players' rows on top of each other.
  const p1 = world();
  hyperStock286ED6(p1.ram, ROM, p1.ctx, 0);
  const p2 = world();
  hyperStock286ED6(p2.ram, ROM, p2.ctx, 1);
  let same = true;
  for (let a = TX.head; a < TX.head + 8 * 8; a += 8) {
    if (p1.ram.u32(a) !== p2.ram.u32(a)) { same = false; break; }
  }
  assert.ok(!same, 'the two sides land in different cells');
});

test('W271 the lives row draws too, and both bodies stay note-only without a rom',
  { skip: SKIP }, () => {
    const f = world();
    const before = cells(f.ram);
    livesRow2878CC(f.ram, ROM, f.ctx, 0);
    assert.ok(cells(f.ram) > before, '$2878CC enqueued');

    // The `if (!rom)` guard is the correct fallback and must stay: a tree with no
    // cartridge counts the draw rather than throwing.
    const g = world();
    hyperStock286ED6(g.ram, null, g.ctx, 0);
    livesRow2878CC(g.ram, null, g.ctx, 0);
    assert.equal(cells(g.ram), 0, 'nothing drawn');
    assert.equal(g.log.report().length, 2, 'and both are COUNTED');
  });
