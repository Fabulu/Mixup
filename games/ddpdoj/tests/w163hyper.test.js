// W163: chain-earned hyper gameplay, from cap gain through rank-bearing use.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { RAM, P } from '../src/machine.js';
import { UnportedLog } from '../src/unported.js';
import { SCORE, LEDGER, scoreKill } from '../src/score.js';
import { ITEM, runItemDriver } from '../src/items.js';
import { HUDRAM, gates2844A6 } from '../src/hud.js';
import { bombAndShotGuards } from '../src/player.js';
import {
  HYPER, HYPER_MUTATE, bombEndHyper249970, grantHyper287682,
  requestHyper249868, stepHyper285A12,
} from '../src/hyper.js';

const TABLES = JSON.parse(fs.readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);
HYPER_MUTATE.value = process.env.DDPDOJ_W163_MUTATION || null;

function fixture(p2 = false) {
  const ram = new Ram();
  const events = [];
  const ctx = {
    rom: ROM,
    unportedLog: new UnportedLog(),
    hyperEvent: (...v) => events.push(v),
    soundPost: () => {},
  };
  const rec = p2 ? RAM.player2 : RAM.player1;
  const h = p2 ? HYPER.p2 : HYPER.p1;
  ram.setU16(rec, 0x8000);
  ram.setU32(rec + P.posY, 0x20001800);
  return { ram, ctx, rec, events, h };
}

function earnItem(p2 = false) {
  const { ram, ctx, rec, events } = fixture(p2);
  const p = p2 ? LEDGER.p2 : LEDGER.p1;
  const h = p2 ? HYPER.p2 : HYPER.p1;
  ram.setU16(p.meter, 0x30);
  ram.setU16(h.earn, 0x095f);
  scoreKill(ram, ROM, ctx, 0x08, p2 ? 0x08 : 0x10);
  assert.equal(ram.u16(p.chain), 1, '$2863BA raises the packed-BCD chain');
  assert.equal(ram.u16(p.meter), 0x38, '$286664 clamps to the ROM loop-0 cap');
  assert.equal(ram.u16(h.earn), 0, '$2876A0/$287740 spends the threshold');
  const pool = p2 ? 0x816ffa : 0x816e7a;
  assert.equal(ram.u16(pool), 0x8000 | h.kind,
    '$28770C/$2877AC allocates the player-specific hyper item');
  assert.equal(ram.u16(ITEM.count), 1);
  ram.setU16(pool, ram.u16(pool) | (p2 ? 0x0800 : 0x1000));
  runItemDriver(ram, ROM, ctx);
  assert.equal(ram.u16(h.stock), 1, '$2530CA/$2530F2 increments hyper stock');
  assert.equal(ram.u16(h.gauge), 0x095f, '$2530D0/$2530F8 loads the gauge');
  return { ram, ctx, rec, events, h, p, pool };
}

test('P1 chain cap earns, spawns, collects, activates, and feeds rank power', () => {
  const { ram, ctx, rec, h, p } = earnItem(false);
  const stockRedraws = [];
  const redraw = player => stockRedraws.push(player);
  assert.equal(requestHyper249868(ram, ROM, ctx, rec, false), true);
  assert.equal(ram.u16(h.req), 1, '$24989A arms the HUD-frame activation');
  stepHyper285A12(ram, ROM, ctx, false, redraw);
  assert.equal(ram.u16(h.active), 1, '$285A30 activates');
  assert.equal(ram.u16(h.stock), 0, '$285A8A spends the whole stock');
  assert.equal(ram.u16(h.level), 1, '$285A5C records the used level');
  assert.equal(ram.u16(h.power), 1, '$285A62 makes chain-earned stock rank-critical');
  assert.equal(ram.u16(h.gauge), 0x095d, '$285AEA drains two on the activation frame');
  assert.deepEqual(stockRedraws, [0], '$285A3E redraws the spent hyper stock immediately');

  ram.setU16(p.chain, 0x10);
  ram.setU16(p.meter, 0x20);
  stepHyper285A12(ram, ROM, ctx, false, redraw);
  assert.equal(ram.u16(h.chainHold), 0x78, '$285ABA keeps an established chain alive');
  assert.equal(ram.u16(h.chainSaved), 0x20, '$285AC2 snapshots its meter');

  ram.setU16(h.gauge, 1);
  stepHyper285A12(ram, ROM, ctx, false, redraw);
  assert.equal(ram.u16(h.active), 0, '$285AF2 ends on gauge borrow');
  assert.equal(ram.u16(h.gauge), 0);
  assert.equal(ram.btst8(rec + P.flags1, 0), 0, '$25329A clears the hyper flag');
  assert.deepEqual(stockRedraws, [0, 0], '$285B24 redraws the inactive stock at hyper end');
});

test('$249868 requests hyper and rejoins shot cadence at $249B2C', () => {
  const { ram, ctx, rec, h } = fixture(false);
  ram.setU16(0x8130ce, 4);
  ram.setU8(rec + P.btnByte, 1 << 5);
  ram.setU8(rec + 0x54, 0x11);
  ram.setU8(rec + 0x55, 0x22);
  ram.setU16(h.stock, 1);
  bombAndShotGuards(ram, rec, ctx, 0);
  assert.equal(ram.u16(h.req), 1);
  assert.equal(ram.u8(rec + 0x56), 0x22,
    '$2498DE branches to cadence, where the new hyper flag selects ($55,A6)');
});

test('the existing HUD gate decays an unmaintained chain to a real break', () => {
  const { ram, ctx } = fixture(false);
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.dfFlags, 0);
  ram.setU16(HUDRAM.p1.meter, 2);
  ram.setU16(HUDRAM.p1.chain, 0x12);
  ram.setU32(HUDRAM.p1.accA, 0x1234);
  ram.setU32(HUDRAM.p1.accB, 0x5678);
  gates2844A6(ram, ctx, ROM);
  assert.equal(ram.u16(HUDRAM.p1.meter), 1);
  gates2844A6(ram, ctx, ROM);
  assert.equal(ram.u16(HUDRAM.p1.meter), 0, '$284636 reaches zero');
  assert.equal(ram.u32(HUDRAM.p1.accA), 0, '$284640 clears chain accumulation');
  assert.equal(ram.u32(HUDRAM.p1.accB), 0, '$284646 completes the break');
});

test('P2 owns a complete, isolated mirror of earn, collect, and activation', () => {
  const { ram, ctx, rec, h } = earnItem(true);
  ram.setU8(HYPER.flags, 0x04);
  assert.equal(requestHyper249868(ram, ROM, ctx, rec, true), true);
  stepHyper285A12(ram, ROM, ctx, true);
  assert.equal(ram.u16(HYPER.p2.active), 1);
  assert.equal(ram.u16(HYPER.p2.power), 1);
  assert.equal(ram.u16(HYPER.p1.active), 0);
  assert.equal(ram.u16(HYPER.p1.power), 0);
  assert.equal(ram.u16(HYPER.p1.stock), 0);
  assert.equal(ram.u16(h.gauge), 0x095d);
  assert.equal(ram.u8(rec + P.invuln), 0x50,
    '$253290 overwrites P2 with $50 even when $8130F8 bit 2 selected $78');
});

test('active grants bank, end flushes them, and bombing applies the rank sink', () => {
  const { ram, ctx, h } = fixture(false);
  ram.setU16(h.active, 1);
  ram.setU16(h.earn, 0x0960);
  assert.equal(grantHyper287682(ram, ROM, ctx, false), 'pending');
  assert.equal(ram.u16(h.pending), 1);
  ram.setU16(h.gauge, 0x100);
  ram.setU16(h.power, 5);
  assert.equal(bombEndHyper249970(ram, ROM, ctx, false), true);
  assert.equal(ram.u16(h.active), 0);
  assert.equal(ram.u16(h.power), 2, '$249976 permanently debits three, floored at zero');
  assert.equal(ram.u16(h.pending), 0, '$2875B4 drains the pending bank');
  assert.equal(ram.u16(0x816e7a), 0x800c, '$2875FC respawns the banked item');
});
