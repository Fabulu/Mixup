// W281 (DOCKET D16): "hyper bar shows you how much hyper you have even when not
// hypering."
//
// THE DISPLAY IS COMPLETE. This file proves it, so that nobody spends another wave
// looking for a missing draw -- which is what D7 and D8 both turned out not to be.
//
// What is missing is UPSTREAM: `$81B65C` (the stock), `$81B6E0` (the icon count) and
// `$81B6E4` (the gate) are ZERO for every frame of a 900-frame run on both seeds, so
// the row that would show the level has nothing to show. See the worklog: the cause is
// the item PRODUCER, and it is very likely the same cause as D17.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { BUCKETS } from '../src/spritequeue.js';
import { HUDRAM, scoreRow285C62, hyperStock286ED6 } from '../src/hud.js';
import { REFUSED_KINDS } from '../src/items.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tablesPath = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

// $285D8A/$285F04 -- the non-hyper arm's guard, and $285D34/$285D92 its loop count.
const GATE = HUDRAM.hyperStockFlag;      // $81B6E4
const COUNT = HUDRAM.hyperStockP1;       // $81B6E0
const PANEL = BUCKETS[25];

function world() {
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log, notes: log } };
}
const icons = (ram) => ram.u16(PANEL.counter) / 12;

// ============================ 1. THE NON-HYPER ARM DOES DRAW A HYPER INDICATOR

test('W281 the NON-hyper arm draws one icon per unit of stock', { skip: SKIP }, () => {
  // This is the answer to "even when not hypering". `$285D74` -- the arm taken when
  // `$81B63E` is zero -- draws `$81B6E0` icons from tile `$1CA008`, guarded by
  // `$81B6E4`. So there IS an always-visible hyper indicator and the port draws it.
  for (const n of [1, 2, 3, 5]) {
    const f = world();
    f.ram.setU16(GATE, 1);
    f.ram.setU16(COUNT, n);
    scoreRow285C62(f.ram, ROM, f.ctx, 0, 0, 0);
    assert.equal(icons(f.ram), n, `${n} units -> ${n} icons, with NO hyper running`);
  }
});

test('W281 the guard is real: no gate, no icons', { skip: SKIP }, () => {
  // `$285D8A tst.w $81B6E4 / beq`. A port that dropped the guard would draw a row of
  // icons before the player had earned anything.
  const f = world();
  f.ram.setU16(GATE, 0);
  f.ram.setU16(COUNT, 4);
  scoreRow285C62(f.ram, ROM, f.ctx, 0, 0, 0);
  assert.equal(icons(f.ram), 0);
});

test('W281 the count is what varies, not the picture', { skip: SKIP }, () => {
  // Each record is the same tile at a stepped position, so the row LENGTH is the
  // reading. Asserted because a port that changed the tile per unit would look right
  // in a screenshot and be wrong.
  const f = world();
  f.ram.setU16(GATE, 1);
  f.ram.setU16(COUNT, 3);
  scoreRow285C62(f.ram, ROM, f.ctx, 0, 0, 0);
  const descs = new Set();
  const positions = new Set();
  for (let i = 0; i < 3; i++) {
    descs.add(f.ram.u32(PANEL.buffer + i * 12 + 4) >>> 0);
    positions.add(f.ram.u32(PANEL.buffer + i * 12) >>> 0);
  }
  assert.equal(descs.size, 1, 'one tile');
  assert.equal(descs.values().next().value, 0x001ca008, '$285D9C move.l #$1CA008,D2');
  assert.equal(positions.size, 3, 'three different positions');
});

// ================================ 2. THE HYPERING ARM IS A DIFFERENT RECORD

test('W281 the HYPER arm draws a panel whose tile tracks the gauge', { skip: SKIP }, () => {
  // `$285C86 lea $2881F2,A0` indexed by `gauge * $16 / $4B0`, so this one really is a
  // fill BAR. It is a different record from the icon row above and the two are not
  // alternatives -- the hyper arm draws the panel AND the icons.
  const seen = new Set();
  for (const gauge of [0x40, 0x200, 0x400]) {
    const f = world();
    f.ram.setU16(HUDRAM.hyperActiveP1, 1);
    f.ram.setU16(HUDRAM.hyperGaugeP1, gauge);
    scoreRow285C62(f.ram, ROM, f.ctx, 0, 0, 0);
    assert.ok(icons(f.ram) >= 1, `gauge $${gauge.toString(16)} drew a panel`);
    seen.add(f.ram.u32(PANEL.buffer + 4) >>> 0);
  }
  assert.equal(seen.size, 3, 'and three different gauge values pick three tiles');
});

test('W281 `$81B63E` really does mean "a hyper is RUNNING"', { skip: SKIP }, () => {
  // The name `hyperActiveP1` was worth checking, because the whole D16 question turns
  // on it -- if it meant "the gauge is armed" the panel would show outside a hyper and
  // the port would already be right. `$285A12 tst.w $81B63E / bne` takes the RUNNING
  // arm, and `$285A30 move.w #$1,$81B63E` is reached only after `$285A1C tst.w
  // $81B658` finds a REQUEST. So it is set when a hyper starts. The name is correct.
  const off = world();
  off.ram.setU16(HUDRAM.hyperActiveP1, 0);
  off.ram.setU16(HUDRAM.hyperGaugeP1, 0x200);
  scoreRow285C62(off.ram, ROM, off.ctx, 0, 0, 0);
  assert.equal(icons(off.ram), 0,
    'a full gauge with no hyper running draws NO panel -- so the panel is not the '
    + 'always-visible indicator, and the icon row is');
});

// ================================ 3. THE STOCK ROW W271 LANDED AGREES

const TX = { head: 0x80b058, cursor: 0x80c8d8 };
const cells = (ram) => {
  let n = 0;
  for (let a = TX.head; a < TX.cursor; a += 8) {
    if (ram.u32(a) === 0xffffffff) break;
    n++;
  }
  return n;
};

test('W281 the stock ROW and the icon ROW are two different displays', { skip: SKIP }, () => {
  // W271's `hyperStock286ED6` paints a 3x6 text grid from `$2883E6[$81B65C * 4]`; the
  // icon row is bucket-25 sprite records. Both read the hyper state and neither is the
  // other, so "the gauge is not painted" could have been either one.
  const f = world();
  f.ram.setU16(HUDRAM.hyperStockIdxP1, 2);
  f.ram.setU16(GATE, 1);
  f.ram.setU16(COUNT, 2);
  scoreRow285C62(f.ram, ROM, f.ctx, 0, 0, 0);
  hyperStock286ED6(f.ram, ROM, f.ctx, 0);
  assert.equal(icons(f.ram), 2, 'the icon row drew');
  assert.ok(cells(f.ram) > 0, 'and the stock row drew too');
});

// ============================ 4. WHAT IS ACTUALLY MISSING, PINNED

test('W281 the refusal that used to block hyper items is DEAD and is not the cause',
  () => {
    // `spawnItem` still carries a `REFUSED_KINDS` branch whose note explains that
    // granting a hyper stock early would plant a permanent +16 rank error. W163 emptied
    // the list, so kind `$C` is NOT refused any more -- worth pinning, because that
    // branch reads like the cause of D16 and is not.
    assert.deepEqual([...REFUSED_KINDS], [],
      'no kind is refused, so the hyper item is allowed to spawn');
  });

test('W281 the three words the display reads all start at ZERO', { skip: SKIP }, () => {
  // Which is the whole of D16: measured over 900 frames on the shipped seed AND on the
  // laser-hold rung, `$81B65C`, `$81B6E0` and `$81B6E4` never leave zero, so the row
  // that would show the level has nothing to show. The DISPLAY is not the gap -- see
  // every test above -- and the next wave belongs in the item producer.
  const f = world();
  for (const a of [HUDRAM.hyperStockIdxP1, COUNT, GATE]) {
    assert.equal(f.ram.u16(a), 0, `$${a.toString(16).toUpperCase()} starts at 0`);
  }
  scoreRow285C62(f.ram, ROM, f.ctx, 0, 0, 0);
  assert.equal(icons(f.ram), 0, 'so nothing draws, correctly');
});
