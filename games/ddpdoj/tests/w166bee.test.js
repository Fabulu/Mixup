// W166: the hidden bee's collect arm feeds the chain-earned hyper lifecycle.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { RAM, P } from '../src/machine.js';
import { UnportedLog } from '../src/unported.js';
import {
  BEE_MUTATE, POOL_A, B, KIND, allocBee27F92A, runPoolADriver,
} from '../src/bee.js';
import { ITEM, runItemDriver } from '../src/items.js';
import {
  HYPER, requestHyper249868, stepHyper285A12,
} from '../src/hyper.js';

const TABLES = JSON.parse(fs.readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);
const MT = new MoveTables(TABLES, ROM);
BEE_MUTATE.value = process.env.DDPDOJ_W166_MUTATION || null;

function fixture(p2 = false) {
  const ram = new Ram();
  const events = [];
  const ctx = {
    ram, rom: ROM, tables: MT, unportedLog: new UnportedLog(), soundPost: () => {},
    hyperEvent: (...v) => events.push(v),
  };
  for (let i = 0; i < POOL_A.clearWords * 2; i++) ram.setU8(POOL_A.base + i, 0);
  ram.setU16(POOL_A.scrollShort, 0);
  ram.setU16(0x813172, 0);
  ram.setU16(POOL_A.freeze, 0);
  const rec = p2 ? RAM.player2 : RAM.player1;
  ram.setU16(rec, 0x8000);
  ram.setU32(rec + P.posY, 0x40002000);
  const h = p2 ? HYPER.p2 : HYPER.p1;
  return { ram, ctx, rec, h, events };
}

/** Exercise the authentic `$2767E6 -> $27F92A` drop shape, then the collision
 * handshake's already-established player touch bit. W148 separately proves
 * that only laser-head block 7 can make the type-$8A` carrier reach this drop. */
function dropTouchedBee(ram, ctx, p2 = false) {
  const carrier = 0x815000;
  ram.setU32(carrier + B.pos, 0x40002000);
  const slot = allocBee27F92A(ram, ROM, ctx, KIND.bee, 0, carrier);
  assert.equal(slot, POOL_A.reservedBase);
  ram.setU16(slot + B.status, ram.u16(slot + B.status) | (p2 ? 0x0800 : 0x1000));
  return slot;
}

test('P1 hidden-bee drop and collection crosses threshold into rank-bearing hyper', () => {
  const { ram, ctx, rec, h, events } = fixture(false);
  dropTouchedBee(ram, ctx, false);
  ram.setU16(POOL_A.chainMeterP1, 1);
  ram.setU16(POOL_A.chainHitsP1, 0x0020);               // packed BCD 20
  ram.setU16(h.earn, 0x0930);

  runPoolADriver(ram, ROM, ctx);
  assert.equal(ram.u16(h.earn), 0, '$0930 + floor(20/20)*$48 crosses $095F');
  assert.equal(ram.u16(0x816e7a), 0x800c, '$28770C spawns the P1 kind-$0C item');
  assert.deepEqual(events[0], ['spawn', 1, 0]);

  ram.setU16(0x816e7a, ram.u16(0x816e7a) | 0x1000);
  runItemDriver(ram, ROM, ctx);
  assert.equal(ram.u16(h.stock), 1, '$2530CA collects the chain-earned item');
  assert.equal(requestHyper249868(ram, ROM, ctx, rec, false), true);
  stepHyper285A12(ram, ROM, ctx, false);
  assert.equal(ram.u16(h.power), 1, '$285A62 turns the bee-fed hyper into rank power');
});

test('BCD 100 means five complete groups of 20, not binary 256', () => {
  const { ram, ctx, h } = fixture(false);
  dropTouchedBee(ram, ctx, false);
  ram.setU16(POOL_A.chainMeterP1, 1);
  ram.setU16(POOL_A.chainHitsP1, 0x0100);               // packed BCD 100
  runPoolADriver(ram, ROM, ctx);
  assert.equal(ram.u16(h.earn), 5 * 0x48,
    '$242AF6 converts BCD 100 to binary 100 before division');
});

test('bee earn clamps packed-BCD hits at 200 before conversion', () => {
  const { ram, ctx, h } = fixture(false);
  dropTouchedBee(ram, ctx, false);
  ram.setU16(POOL_A.chainMeterP1, 1);
  ram.setU16(POOL_A.chainHitsP1, 0x0201);               // packed BCD 201
  runPoolADriver(ram, ROM, ctx);
  assert.equal(ram.u16(h.earn), 10 * 0x48,
    '$27FBBA clamps 201 to 200, then awards ten complete groups');
});

test('P2 mirror feeds `$81B64C/$287722` and can bank the threshold', () => {
  const { ram, ctx, h, events } = fixture(true);
  dropTouchedBee(ram, ctx, true);
  ram.setU16(POOL_A.chainMeterP2, 1);
  ram.setU16(POOL_A.chainHitsP2, 0x0020);
  ram.setU16(h.earn, 0x0930);
  ram.setU16(HYPER.gate, 1);                            // grantor's bank arm
  ram.setU16(h.player, 0);                              // not live under the gate
  runPoolADriver(ram, ROM, ctx);
  assert.equal(ram.u16(h.earn), 0);
  assert.equal(ram.u16(h.pending), 1, '$287722 banks P2 rather than spawning');
  assert.equal(ram.u16(ITEM.count), 0);
  assert.deepEqual(events[0], ['pending', 2, 1]);
});

test('2P adjustment converts the shared binary item count before bee gain', () => {
  const { ram, ctx, h } = fixture(false);
  dropTouchedBee(ram, ctx, false);
  ram.setU8(POOL_A.twoPlayer, 0x02);
  ram.setU16(0x81b610, 100);                            // binary, not packed BCD
  ram.setU16(0x81b60c, 1);
  runPoolADriver(ram, ROM, ctx);
  assert.equal(ram.u16(h.earn), 5 * 0x48);
});

test('active hyper, broken chain, and sub-20 hits do not add bee earn', () => {
  for (const [meter, hits, active] of [[0, 0x0020, 0], [1, 0x0019, 0], [1, 0x0020, 1]]) {
    const { ram, ctx, h } = fixture(false);
    dropTouchedBee(ram, ctx, false);
    ram.setU16(POOL_A.chainMeterP1, meter);
    ram.setU16(POOL_A.chainHitsP1, hits);
    ram.setU16(h.active, active);
    runPoolADriver(ram, ROM, ctx);
    assert.equal(ram.u16(h.earn), 0, `meter=${meter} hits=$${hits.toString(16)} active=${active}`);
  }
});
