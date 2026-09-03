import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BEAM_REC, BOMBRAM } from '../src/bomb.js';
import {
  DMG, runBuildAType5CollisionBeforeBombDamage18A1AC,
} from '../src/damage.js';
import { P, RAM } from '../src/machine.js';
import { PaletteState } from '../src/palette.js';
import { BLACK_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_RUNTIME_BINDING } from '../src/runtime-profile.js';
import { LEDGER } from '../src/score.js';
import {
  WHITE_BOMB_RESOURCES, preflightWhiteBombCartridge,
  runWhiteBombDamage144CE8, runWhiteBombDriver155394,
} from '../src/white-bomb.js';
import {
  WHITE_BUTTON2_RESOURCES, flushWhitePendingHyper,
  installWhiteButton2Callbacks, whiteButton2Held148EC8,
} from '../src/white-button2.js';
import { redrawWhiteHyperStock185A14 } from '../src/white-hyper-hud.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
assert.ok(existsSync(TABLES),
  `${TABLES} missing; run: python games/ddpdoj/tools/export-tables.py`);
const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
const rom = new RomWindows(tables.rom);
const R = WHITE_BUTTON2_RESOURCES;
const BR = WHITE_BOMB_RESOURCES;

function runtimeContext(extra = {}) {
  const ctx = {
    rom,
    palette: new PaletteState(),
    unportedLog: { note() {} },
    soundPost() {},
    ...extra,
  };
  return installWhiteButton2Callbacks(ctx, rom, undefined, redrawWhiteHyperStock185A14);
}

function owner(ram, ownerIndex, {
  bombStock = 0, hyperStock = 0, selector = 0, laser = false,
} = {}) {
  const side = R.sides[ownerIndex];
  ram.setU16(side.player, 0x8000);
  ram.setU16(side.player + P.posY, 0x2000);
  ram.setU16(side.player + P.posX, ownerIndex === 0 ? 0x1800 : 0x2800);
  ram.setU8(side.player + P.baseSpeed, 22);
  ram.setU8(side.player + P.speedIdx, 22);
  ram.setU8(side.player + P.invuln, 0);
  ram.setU8(side.player + P.dead, laser ? 1 : 0);
  ram.setU8(side.player + 0x24, bombStock);
  ram.setU16(side.player + P.shipSel, selector);
  ram.setU16(side.stock, hyperStock);
  return side.player;
}

function enemy(ram, slot, { hp = 0x2000, y = 0x2000, x = 0x2000 } = {}) {
  const rec = BOMBRAM.poolA + slot * BOMBRAM.poolAStride;
  ram.setU16(rec, 0xa000);
  ram.setU16(rec + 0x02, y);
  ram.setU16(rec + 0x04, x);
  ram.setU16(rec + 0x10, 0x40);
  ram.setU16(rec + 0x12, 0x40);
  ram.setU16(rec + 0x14, 0x40);
  ram.setU16(rec + 0x16, 0x40);
  ram.setU16(rec + 0x18, hp);
  return rec;
}

test('White Button 2 dependencies and generated manifest pin the Build A closure', () => {
  assert.equal(WHITE_RUNTIME_BINDING.capabilities.stage1Button2, undefined);
  assert.equal(
    WHITE_RUNTIME_BINDING.capabilities.stage1Players,
    'ddpdoj.runtime.white-label-a.stage1-players.v1',
  );
  assert.equal(
    WHITE_RUNTIME_BINDING.capabilities.stage1Options,
    'ddpdoj.runtime.white-label-a.stage1-options.v1',
  );
  assert.equal(
    WHITE_RUNTIME_BINDING.capabilities.stage1HyperHud,
    'ddpdoj.runtime.white-label-a.stage1-hyper-hud.v1',
  );
  const manifest = tables.editions.whiteLabel;
  assert.deepEqual(manifest.button2RuntimeWindows, [
    { base: '$1548E2', len: 0x0014 },
    { base: '$122A78', len: 0x0080 },
    { base: '$155AD2', len: 0x0126 },
    { base: '$155BF8', len: 0x0648 },
    { base: '$156240', len: 0x009e },
    { base: '$1562DE', len: 0x0012 },
    { base: '$1434C4', len: 0x0080 },
    { base: '$188B6C', len: 0x000c },
    { base: '$188FA0', len: 0x00a2 },
    { base: '$17E866', len: 0x001a },
  ]);
  assert.equal(
    manifest.button2RuntimeWindows.reduce((sum, window) => sum + window.len, 0),
    2554,
  );
  assert.ok(manifest.button2RuntimeWindows.every((window) =>
    Number.parseInt(window.base.slice(1), 16) + window.len <= 0x200000));
  assert.deepEqual(manifest.button2, {
    button2: {
      start: '$148EB2', end: '$1491D0',
      sha256: '7c639e93295598065fdcf29ba6516ee9b6d2d3b112554d8b6f6d5c20811b6870',
    },
    driver: {
      start: '$155394', end: '$155AD2',
      sha256: '527d2daa1f6b94649f314133c732f39efcb628caee18b421f9693705c10b540b',
    },
    damage: {
      start: '$144CE8', end: '$1450AE',
      sha256: '8179a8c70658e0d45888f28dbe9ece35462a5795c719f8ee904690907f559f3a',
    },
    conversion: {
      start: '$15286C', end: '$1528C4',
      sha256: '2035c1bfdbdc86ea8a367b9b0963114f32d3099dd55e756107e98fccb3ceb72c',
    },
    bombRedraw: {
      start: '$1528F8', end: '$1529A4',
      sha256: 'febcacdbc7576a951cd4f86facbb9e25c52affac4362a022b5c4e431ddb532fb',
    },
    pendingFlush: {
      start: '$1860F2', end: '$1861B6',
      sha256: '46226722d7ca01f9ad5e4ff276404b362ab184426c43d80f0451828194df1282',
    },
    itemAllocator: {
      start: '$17D9C4', end: '$17DA3C',
      sha256: '087bad79b8d43aec96229fa091a9d7a0e33100f3653bfe0619fe483f8d9de7c4',
    },
    itemFill: {
      start: '$17E796', end: '$17E7F8',
      sha256: '29a94d13118f0585864aa6ef5b8d7634b37f843a9e1c0c07e691ecf7d1ecda20',
    },
    hyperRedraw: ['$185A14', '$185A7C'],
    deadUnderflowLookup: {
      start: '$1521F6', end: '$1521F8',
      sha256: '1ceeabf0c6a5a30bad12cdac0e3ab015a7188a42e6aebb556aad00bb9cd693ad',
    },
    deadCodeRead: {
      start: '$149AB4', end: '$149AC0',
      sha256: '7202564bd3b766e7a388947a520b9b5e13cd23a523798524b91749eb5923b505',
    },
    chainResetP1: {
      start: '$18630E', end: '$18633C',
      sha256: '973c866ae6f9fe39a48a7b245a04d2ea7e2041b0950211b2572fcc22cc9b577b',
    },
    chainResetP2: {
      start: '$18633C', end: '$18636A',
      sha256: '0b0c583a6ce259c528bc0a0fceec8305acb2d6ab9238c65bbaadb063b8f75ab6',
    },
  });
});

test('Button 2 executable identities stay outside every global ROM window', () => {
  for (const address of [
    0x1553ea, 0x149ab4, 0x144ce8, 0x1528f8, 0x18630e, 0x18633c, 0x1521f6,
  ]) {
    assert.ok(
      rom.windows.every(window => address < window.base || address >= window.base + window.len),
      `$${address.toString(16).toUpperCase()} must remain executable identity, not readable data`,
    );
  }
});

test('White Button 2 and bomb boundaries reject Black before reading inputs', () => {
  let reads = 0;
  const protectedInput = new Proxy({}, {
    get() {
      reads++;
      throw new Error('protected input was touched');
    },
  });
  assert.throws(
    () => whiteButton2Held148EC8(
      protectedInput, protectedInput, 0, null, 0, BLACK_LABEL_PROFILE,
    ),
    /White Label held Button 2 is unavailable/,
  );
  assert.throws(
    () => runWhiteBombDriver155394(
      protectedInput, protectedInput, null, BLACK_LABEL_PROFILE,
    ),
    /White Label bomb driver is unavailable/,
  );
  assert.equal(reads, 0);
});

test('all three bomb refusals precede optional callback, palette, and option dependencies', () => {
  for (const refusal of ['no-stock', 'hyper-flash-up', 'bomb-already-up']) {
    const ram = new Ram();
    const rec = owner(ram, 0, { bombStock: refusal === 'no-stock' ? 0 : 2 });
    if (refusal === 'hyper-flash-up') ram.setU16(R.sides[0].flash, 1);
    if (refusal === 'bomb-already-up') ram.setU16(R.ram.bombRecord, 0x8000);
    const before = {
      stock: ram.u8(rec + 0x24), queue: ram.u16(R.ram.queue),
      record: ram.u16(R.ram.bombRecord),
    };
    const result = whiteButton2Held148EC8(ram, rom, rec, {}, 0);
    assert.equal(result.phase, refusal);
    assert.equal(result.skipCadence, false);
    assert.deepEqual({
      stock: ram.u8(rec + 0x24), queue: ram.u16(R.ram.queue),
      record: ram.u16(R.ram.bombRecord),
    }, before);
  }
});

test('malformed palette rejects a bomb before any board RAM mutation', () => {
  const ram = new Ram();
  const rec = owner(ram, 0, { bombStock: 1 });
  const before = Uint8Array.from(ram.b);

  assert.throws(
    () => whiteButton2Held148EC8(ram, rom, rec, { palette: {} }, 0),
    /complete palette state before RAM mutation/,
  );
  assert.deepEqual(ram.b, before);
});

test('callback installation preserves valid hooks and separates bomb from hyper redraw', () => {
  const ram = new Ram();
  const calls = [];
  const ctx = runtimeContext({
    whiteHyperHudCallbacks: {
      conversion() {}, endReset() {}, pendingFlush() {}, postHudTail() {},
      redrawStock() { calls.push('hyper'); },
    },
    whiteBombCallbacks: {
      redrawStock() { calls.push('bomb'); }, resetOptions() {},
    },
  });
  ctx.whiteHyperHudCallbacks.redrawStock(ram, rom, 0);
  ctx.whiteBombCallbacks.redrawStock(ram, rom, 0);
  assert.deepEqual(calls, ['hyper', 'bomb']);
  assert.ok(Object.isFrozen(ctx.whiteHyperHudCallbacks));
  assert.ok(Object.isFrozen(ctx.whiteBombCallbacks));
});

test('P1 and P2 hyper requests use held-owner stock rows and continue shot cadence', () => {
  for (const ownerIndex of [0, 1]) {
    const ram = new Ram();
    const rec = owner(ram, ownerIndex, { hyperStock: 3 });
    const redraws = [];
    const sounds = [];
    const ctx = runtimeContext({
      soundPost(address) { sounds.push(address); },
      whiteBombCallbacks: {
        redrawStock(_ram, _rom, who) { redraws.push(who); },
        resetOptions() {},
      },
    });
    const result = whiteButton2Held148EC8(ram, rom, rec, ctx, ownerIndex);
    assert.deepEqual(result, { phase: 'hyper-request', skipCadence: false });
    assert.equal(ram.u16(R.ram.arm), 8);
    assert.equal(ram.u16(R.ram.mode), R.hyperModes[ownerIndex][2]);
    assert.equal(ram.u16(R.sides[ownerIndex].request), 1);
    assert.equal(ram.btst8(rec + P.flags1, 0), 1);
    assert.equal(ram.u8(rec + P.invuln), 2);
    assert.equal(sounds.at(-1), 0x28c8da);
    assert.ok(!sounds.includes(R.entries.hyperSound));
    assert.deepEqual(redraws, [ownerIndex], '$148F7C redraws the bomb panel');
  }
});

test('White cancel immediately credits $23 packed BCD for every live bullet', () => {
  for (const ownerIndex of [0, 1]) {
    const ram = new Ram();
    const rec = owner(ram, ownerIndex, { hyperStock: 1 });
    ram.setU16(R.cancel.bulletPool, 0x8000);
    ram.setU16(R.cancel.bulletPool + R.cancel.bulletStride, 0x8000);
    ram.setU16(R.cancel.bulletPool + 2 * R.cancel.bulletStride, 0x0000);

    whiteButton2Held148EC8(ram, rom, rec, runtimeContext(), ownerIndex);

    assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), ownerIndex === 0 ? 0x46 : 0);
    assert.equal(ram.u32(LEDGER.p2.pendingEnd - 4), ownerIndex === 1 ? 0x46 : 0);
  }
});

test('White cancel stage gate bit 1 suppresses immediate bullet credit', () => {
  const ram = new Ram();
  const rec = owner(ram, 0, { hyperStock: 1 });
  ram.setU16(R.cancel.bulletPool, 0x8000);
  ram.bset8(R.cancel.stageGate, 1);

  whiteButton2Held148EC8(ram, rom, rec, runtimeContext(), 0);

  assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0);
  assert.equal(ram.u16(R.ram.arm), 1);
  assert.equal(ram.u16(R.ram.mode), 0xffff);
});

test('pending hyper grants keep side ownership, six-slot bound, and $0800 positions', () => {
  const ram = new Ram();
  ram.setU16(R.sides[1].pending, 2);
  assert.equal(flushWhitePendingHyper(ram, rom, {}, 1), 2);
  assert.equal(ram.u16(R.sides[1].pending), 0);
  assert.equal(ram.u16(R.item.p2Pool), 0x8000 | R.sides[1].kind);
  assert.equal(ram.u16(R.item.p2Pool + 0x02), 0x7000);
  assert.equal(ram.u16(R.item.p2Pool + R.item.stride + 0x02), 0x7800);
  assert.equal(ram.u16(R.item.p1Pool), 0);

  const full = new Ram();
  full.setU16(R.sides[0].pending, 6);
  assert.equal(flushWhitePendingHyper(full, rom, {}, 0), 6);
  assert.equal(full.u16(R.item.p1Pool + 5 * R.item.stride + 0x02), 0x9800);

  const earned = new Ram();
  earned.setU16(R.sides[0].pending, 5);
  earned.setU16(R.sides[0].earn, 0x095f);
  assert.equal(flushWhitePendingHyper(earned, rom, {}, 0), 6);
  assert.equal(earned.u16(R.sides[0].earn), 0);
  assert.equal(earned.u16(R.item.p1Pool + 5 * R.item.stride + 0x02), 0x9800);

  const overflow = new Ram();
  overflow.setU16(R.sides[0].pending, 6);
  overflow.setU16(R.sides[0].earn, 0x095f);
  const before = Uint8Array.from(overflow.b);
  assert.throws(
    () => flushWhitePendingHyper(overflow, rom, {}, 0),
    /pending hyper count 7 exceeds its six-slot pool/,
  );
  assert.deepEqual(overflow.b, before);
});

test('ordinary bomb arm owns the shared record, debits $2C, and hands invulnerability to partner', () => {
  const ram = new Ram();
  const rec = owner(ram, 0, { bombStock: 2, selector: 2 });
  const other = owner(ram, 1);
  ram.setU16(R.sides[0].display, 0x0100);
  ram.setU16(R.sides[0].display + 0x0a, 4);
  const result = whiteButton2Held148EC8(ram, rom, rec, runtimeContext(), 0);
  assert.deepEqual(result, { phase: 'fired+partner', skipCadence: true });
  assert.equal(ram.u8(rec + 0x24), 1);
  assert.equal(ram.u16(R.sides[0].used), 1);
  assert.equal(ram.u16(R.sides[0].count), 1);
  assert.equal(ram.u16(R.sides[0].display), 0x00d4);
  assert.equal(ram.u16(R.ram.bombRecord), 0x8002);
  assert.equal(ram.u32(R.ram.bombRecord + 0x02), ram.u32(rec + P.posY));
  assert.equal(ram.u8(rec + P.invuln), 0xff);
  assert.equal(ram.u8(other + P.invuln), 0xff);
  assert.equal(ram.u16(other + 0x28), 0x3c);
  assert.equal(ram.u8(rec + P.speedIdx), 28);
});

test('laser bomb arm installs the laser dispatch bit and private option reset state', () => {
  const ram = new Ram();
  const rec = owner(ram, 1, { bombStock: 2, selector: 2, laser: true });
  const result = whiteButton2Held148EC8(ram, rom, rec, runtimeContext(), 1);
  assert.equal(result.phase, 'fired');
  assert.equal(ram.u16(R.ram.bombRecord), 0x8083);
  assert.equal(ram.btst8(rec + P.flags1, 7), 1);
  assert.equal(ram.u16(rec + 0x26), 0x0101);
  assert.equal(ram.u16(rec + 0x28), 0x000c);
  assert.equal(ram.u16(R.sides[1].option + 0x38), 0x26);
  assert.equal(ram.u16(R.sides[1].option + 0x56), 8);
  assert.equal(ram.u16(R.sides[1].soundQueue), 1);
});

test('laser bomb cancel arms state without immediate bullet credit', () => {
  const ram = new Ram();
  const rec = owner(ram, 1, { bombStock: 2, selector: 2, laser: true });
  ram.setU16(R.cancel.bulletPool, 0x8000);
  ram.setU16(R.cancel.bulletPool + R.cancel.bulletStride, 0x8000);

  whiteButton2Held148EC8(ram, rom, rec, runtimeContext(), 1);

  assert.equal(ram.u16(R.ram.arm), 1);
  assert.equal(ram.u16(R.ram.mode), 0xffff);
  assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0);
  assert.equal(ram.u32(LEDGER.p2.pendingEnd - 4), 0);
});

test('White bomb driver maps all four native sound requests to runtime wrappers', () => {
  for (const [laser, selector, raw, expected] of [
    [false, 0, 0x18b082, 0x28c55c],
    [false, 2, 0x18b09c, 0x28c576],
    [true, 0, 0x18b04e, 0x28c528],
    [true, 2, 0x18b068, 0x28c542],
  ]) {
    const ram = new Ram();
    const rec = owner(ram, 0, { bombStock: 1, selector, laser });
    const sounds = [];
    const ctx = runtimeContext({ soundPost(address) { sounds.push(address); } });
    whiteButton2Held148EC8(ram, rom, rec, ctx, 0);

    runWhiteBombDriver155394(ram, rom, ctx);

    assert.equal(sounds.at(-1), expected, `${laser ? 'laser' : 'ordinary'} selector ${selector}`);
    assert.ok(!sounds.includes(raw));
  }
});

test('bombing out of hyper uses the hyper redraw and White $2C debit order', () => {
  const ram = new Ram();
  const rec = owner(ram, 0, { bombStock: 2 });
  ram.setU16(R.sides[0].active, 1);
  ram.setU16(R.sides[0].power, 8);
  ram.setU16(R.sides[0].display, 0x0100);
  ram.setU16(R.sides[0].display + 0x0a, 4);
  const calls = [];
  const ctx = runtimeContext({
    whiteHyperHudCallbacks: {
      conversion() {}, endReset() { calls.push('end-reset'); },
      pendingFlush() { calls.push('pending'); }, postHudTail() {},
      redrawStock() { calls.push('hyper-redraw'); },
    },
    whiteBombCallbacks: {
      redrawStock() { calls.push('bomb-redraw'); }, resetOptions() {},
    },
  });
  const result = whiteButton2Held148EC8(ram, rom, rec, ctx, 0);
  assert.equal(result.phase, 'fired');
  assert.equal(ram.u16(R.sides[0].power), 5);
  assert.equal(ram.u16(R.sides[0].display), 0x00d4);
  assert.ok(calls.indexOf('hyper-redraw') < calls.lastIndexOf('bomb-redraw'));
  assert.deepEqual(calls.slice(-2), ['pending', 'bomb-redraw']);
});

test('ordinary driver validates live pointers, completes teardown, and expires cooldown', () => {
  const ram = new Ram();
  const rec = owner(ram, 0, { bombStock: 2 });
  const ctx = runtimeContext();
  whiteButton2Held148EC8(ram, rom, rec, ctx, 0);
  let frames = 0;
  while ((ram.u16(BR.ram.record) & 0x8000) !== 0 && frames < 300) {
    ram.setU16(BR.ram.bucket13Counter ?? BOMBRAM.bucket13Counter, 0);
    runWhiteBombDriver155394(ram, rom, ctx);
    frames++;
  }
  assert.ok(frames > 0 && frames < 300);
  assert.equal(ram.u16(BR.ram.record), 0);
  assert.equal(ram.u16(BR.ram.cooldown), 0x28);
  for (let frame = 0; frame < 0x28; frame++) {
    runWhiteBombDriver155394(ram, rom, ctx);
  }
  assert.equal(ram.u16(BR.ram.cooldown), 0);
  assert.equal(ram.u8(RAM.player1 + P.invuln), 0);
  assert.equal(ram.u8(RAM.player2 + P.invuln), 0);
});

test('laser tail expiry sets its hidden bit and suppresses the same-frame draw', () => {
  const ram = new Ram();
  const rec = owner(ram, 0, { bombStock: 2, laser: true });
  let draws = 0;
  const ctx = runtimeContext({ bombEvent(kind) {
    if (kind === 'draw') draws++;
  } });
  whiteButton2Held148EC8(ram, rom, rec, ctx, 0);
  runWhiteBombDriver155394(ram, rom, ctx);

  const bomb = BR.ram.record;
  const tail = bomb + BEAM_REC.tail;
  const tip = bomb + BEAM_REC.tip;
  ram.setU16(tail + 0x02, 0x7a00);
  ram.setU16(tail + 0x28, 0);
  ram.setU16(tip + 0x28, 0);
  ram.bset8(tip, 1);
  ram.setU32(BR.ram.nearestRecord, 0);
  ram.setU16(BOMBRAM.bucket13Counter, 0);
  draws = 0;

  const result = runWhiteBombDriver155394(ram, rom, ctx);
  assert.equal(ram.u16(tail + 0x02), 0x7e00);
  assert.equal(ram.u16(tail + 0x28), 1);
  assert.equal(ram.btst8(tail, 1), 1);
  assert.equal(
    draws,
    result.frame.frame.segments.drawn + 2,
    'only beam segments, the main head, and the middle draw after tail expiry',
  );
});

test('laser driver walks 120 plus 12 frames, emits White sparks, and resets options', () => {
  const ram = new Ram();
  const rec = owner(ram, 0, { bombStock: 2, laser: true });
  let sparkDraws = 0;
  const ctx = runtimeContext({ bombEvent(kind) {
    if (kind === 'draw') sparkDraws++;
  } });
  whiteButton2Held148EC8(ram, rom, rec, ctx, 0);
  let frames = 0;
  while ((ram.u16(BR.ram.record) & 0x8000) !== 0 && frames < 150) {
    ram.setU16(BOMBRAM.bucket13Counter, 0);
    runWhiteBombDriver155394(ram, rom, ctx);
    frames++;
  }
  assert.equal(frames, 132, 'the laser graph runs 120 phase-one and twelve phase-two frames');
  assert.equal(ram.u16(BR.ram.record), 0);
  assert.equal(ram.btst8(rec + P.flags1, 6), 0);
  assert.equal(ram.btst8(rec + P.flags1, 7), 0);
  assert.equal(ram.u32(BR.ram.nearestRecord), 0);
  assert.ok(sparkDraws > 0);
});

test('ordinary bomb damage keeps the authentic 150-record span', () => {
  const ram = new Ram();
  ram.setU16(BR.ram.record, 0x8000);
  ram.setU32(BR.ram.record + 0x1e, 0x155b74);
  ram.bset8(RAM.player1 + P.flags1, 6);
  ram.setU16(BOMBRAM.hitMask, 0x1000);
  const first = enemy(ram, 0);
  const last = enemy(ram, 149);
  const past = enemy(ram, 150);
  const result = runWhiteBombDamage144CE8(ram, {}, RAM.player1);
  assert.equal(result.hits, 2);
  assert.equal(result.hp, 0x50);
  assert.equal(ram.u16(first + 0x18), 0x1fb0);
  assert.equal(ram.u16(last + 0x18), 0x1fb0);
  assert.equal(ram.u16(past + 0x18), 0x2000);
});

test('bomb damage follows the collision-selected player instead of bomb ownership', () => {
  const ram = new Ram();
  ram.setU16(BR.ram.record, 0x8000);
  ram.setU32(BR.ram.record + 0x1e, 0x155b74);
  owner(ram, 1);
  ram.bset8(RAM.player2 + P.flags1, 6);
  ram.setU16(DMG.gate308c, 0);
  ram.setU16(DMG.mirror2, 1);
  const collision = runBuildAType5CollisionBeforeBombDamage18A1AC(ram, {});
  assert.deepEqual(
    [collision.ownerIndex, collision.playerRecord, collision.reachedBombDamage],
    [1, RAM.player2, true],
  );
  assert.equal(ram.u16(BOMBRAM.hitMask), 0x0800);
  const target = enemy(ram, 0);

  const result = runWhiteBombDamage144CE8(ram, {}, collision.playerRecord);
  assert.equal(result.hits, 1);
  assert.equal(result.hp, 0x50);
  assert.equal(ram.u16(target) & 0x0800, 0x0800);
  assert.equal(ram.u16(target + 0x18), 0x1fb0);
  assert.throws(
    () => runWhiteBombDamage144CE8(ram, {}, RAM.player2 + 2),
    /native P1 or P2 player record/,
  );
});

test('malformed live script and dynamic dispatch reject before frame mutation', () => {
  const ram = new Ram();
  const rec = owner(ram, 0, { bombStock: 2 });
  const ctx = runtimeContext();
  whiteButton2Held148EC8(ram, rom, rec, ctx, 0);
  runWhiteBombDriver155394(ram, rom, ctx);
  ram.setU32(BR.ram.record + 0x1e, 0x155aef);
  const x = ram.u16(BR.ram.record + 0x04);
  assert.throws(
    () => runWhiteBombDriver155394(ram, rom, ctx),
    /malformed script/,
  );
  assert.equal(ram.u16(BR.ram.record + 0x04), x);

  const invalid = new Ram();
  invalid.setU16(BR.ram.record, 0x8004);
  assert.throws(
    () => runWhiteBombDriver155394(invalid, rom, ctx),
    /dispatch 4 escapes/,
  );
  assert.equal(invalid.u16(BR.ram.record), 0x8004);
});

test('first-frame bomb preflight rejects malformed callbacks before template mutation', () => {
  const missingReset = new Ram();
  missingReset.setU16(BR.ram.record, 0x8001);
  const beforeReset = Uint8Array.from(missingReset.b);
  assert.throws(
    () => runWhiteBombDriver155394(missingReset, rom, { soundPost() {} }),
    /private option-reset callback/,
  );
  assert.deepEqual(missingReset.b, beforeReset);

  const invalidSound = new Ram();
  invalidSound.setU16(BR.ram.record, 0x8000);
  const beforeSound = Uint8Array.from(invalidSound.b);
  assert.throws(
    () => runWhiteBombDriver155394(invalidSound, rom, { soundPost: true }),
    /sound sink must be a function/,
  );
  assert.deepEqual(invalidSound.b, beforeSound);
});

test('static laser-bomb pointer corruption is rejected by its private cartridge gate', () => {
  const bad = {
    u8: address => rom.u8(address),
    u16: address => rom.u16(address),
    u32: address => address === BR.beam.families[0].initialPointers
      ? 0xdeadbeef : rom.u32(address),
    bytes: (address, length) => rom.bytes(address, length),
  };
  assert.throws(
    () => preflightWhiteBombCartridge(bad),
    /initial pointer changed/,
  );
});
