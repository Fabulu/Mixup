// W602: a genuine type-3 player owns its options, laser, score tail, and hyper.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MACHINE, BIT, RAM, P, OPT } from '../src/machine.js';
import { portWordFromPlayerBits } from '../src/input.js';
import { Game } from '../src/main.js';
import { ALLOC } from '../src/objalloc.js';
import { SHOT } from '../src/weapons.js';
import { BEAM, SEG } from '../src/laser.js';
import { DMG } from '../src/damage.js';
import { ITEM, I, spawnHyperItem } from '../src/items.js';
import { HYPER } from '../src/hyper.js';
import { BOMBRAM, BEAM_REC } from '../src/bomb.js';
import { HUDRAM } from '../src/hud.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { applyAuthenticSelection } from '../src/authentic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const HAVE = existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz'))
  && existsSync(path.join(ASSETS, 'capture.bin.gz'));
const SKIP = HAVE ? false : 'exact local selector bundle absent; this is a skip, not a pass';

let bundlePromise;
function bundle() {
  bundlePromise ??= loadBundle(async (name) => {
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}

async function genuineP2() {
  const exact = await bundle();
  const game = new Game(exact.seed, exact.tables, {
    logicFrame: exact.cap.frames[0].lf,
    videoFrame: exact.cap.frames[0].vf,
    bgSeed: exact.cap.part(0, 'bg'),
  });
  const expectedId = (game.ram.u32(ALLOC.idCounter) + 1) >>> 0;
  applyAuthenticSelection(game, {
    ship: 0, style: 2, p2: { ship: 0, style: 2 },
  });
  game.step(0xffff);
  game.step(0xffff);

  let actor = null;
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((game.ram.u16(rec) & 0x8000) !== 0
        && game.ram.u32(rec + ALLOC.idOff) === expectedId) actor = rec;
  }
  assert.notEqual(actor, null, 'normal staging commits the requested type-3 object');
  assert.equal(game.ram.u16(actor), 0x8003);
  assert.equal(game.ram.u8(RAM.player2 + P.playerIdx), 1);
  return game;
}

function bytes(ram, begin, length) {
  const offset = begin - MACHINE.ramBase;
  return ram.b.slice(offset, offset + length);
}

function liveSegments(ram, beam) {
  let count = 0;
  for (let slot = 0; slot < SEG.slots; slot++) {
    if ((ram.u16(beam.pool + slot * SEG.stride) & 0x8000) !== 0) count++;
  }
  return count;
}

function liveObjectSlot(ram, type) {
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const word = ram.u16(ALLOC.table + slot * ALLOC.stride);
    if ((word & 0x8000) !== 0 && (word & 0x7f) === type) return slot;
  }
  return -1;
}

function bombLedger(ram, p2) {
  return {
    stock: ram.u8((p2 ? RAM.player2 : RAM.player1) + BOMBRAM.stockOffset),
    count: ram.u16(p2 ? BOMBRAM.countP2 : BOMBRAM.countP1),
    used: ram.u16(p2 ? BOMBRAM.usedP2 : BOMBRAM.usedP1),
  };
}

function beamState(ram, beam) {
  return {
    control: ram.u16(beam.rec),
    block: ram.u16(beam.blk),
    blockTail: ram.u16(beam.blk + 0x16),
    liveSegments: liveSegments(ram, beam),
  };
}

function naturalTargetState(ram) {
  return Array.from({ length: 7 }, (_, slot) => {
    const rec = BOMBRAM.poolA + slot * BOMBRAM.poolAStride;
    return { status: ram.u16(rec), hp: ram.u16(rec + 0x18) };
  });
}

function stepWithBombEffects(game, input) {
  const { ram } = game;
  const players = [RAM.player1, RAM.player2];
  const wanted = new Set(players.flatMap(player => [player + 0x26, player + 0x28]));
  const firstWrites = new Map();
  const setU16 = ram.setU16.bind(ram);
  ram.setU16 = (address, value) => {
    if (wanted.has(address) && !firstWrites.has(address)) {
      firstWrites.set(address, value & 0xffff);
    }
    setU16(address, value);
  };
  try {
    game.step(input);
  } finally {
    delete ram.setU16;
  }
  return players.map(player => ({
    invuln: ram.u8(player + P.invuln),
    word26: firstWrites.get(player + 0x26),
    word28: firstWrites.get(player + 0x28),
  }));
}

function packedBcd(value) {
  let decimal = 0;
  for (let shift = 28; shift >= 0; shift -= 4) {
    const digit = (value >>> shift) & 0x0f;
    assert.ok(digit <= 9, `$${value.toString(16)} is not packed BCD`);
    decimal = decimal * 10 + digit;
  }
  return decimal;
}

function p1Score(ram) {
  return packedBcd(ram.u32(HUDRAM.totalP1)) + packedBcd(ram.u32(HUDRAM.pendingP1));
}

function p2Score(ram) {
  return packedBcd(ram.u32(HUDRAM.totalP2)) + packedBcd(ram.u32(HUDRAM.pendingP2));
}

test('W602 genuine P2 options build a P2 laser and credit only P2',
  { skip: SKIP }, async () => {
    const game = await genuineP2();
    const p1Shots = bytes(game.ram, SHOT.p1Table, SHOT.slots * SHOT.stride);
    const p1Segments = bytes(game.ram, BEAM[0].pool, SEG.slots * SEG.stride);
    const p1Beam = bytes(game.ram, BEAM[0].rec, 0x20);
    const p1Score = game.ram.u32(HUDRAM.totalP1);
    const p2ScoreBefore = game.ram.u32(HUDRAM.totalP2);

    const held = portWordFromPlayerBits([], [BIT.b1]);
    for (let frame = 0; frame < 120; frame++) game.step(held);

    assert.ok((game.ram.u16(RAM.p2Options + OPT.state) & 0x8000) !== 0,
      'the authentic option object remains live');
    assert.ok((game.ram.u16(BEAM[1].rec) & 0x8000) !== 0,
      'the P2 beam control reaches its live state');
    assert.ok(liveSegments(game.ram, BEAM[1]) > 0,
      'the P2 segment driver retains live beam records');
    assert.deepEqual(bytes(game.ram, SHOT.p1Table, SHOT.slots * SHOT.stride), p1Shots,
      'P2 fire never takes a P1 shot slot');
    assert.deepEqual(bytes(game.ram, BEAM[0].pool, SEG.slots * SEG.stride), p1Segments,
      'P2 laser never takes a P1 segment slot');
    assert.deepEqual(bytes(game.ram, BEAM[0].rec, 0x20), p1Beam,
      'P2 laser never arms the P1 beam control');
    assert.equal(game.ram.u32(HUDRAM.totalP1), p1Score,
      'P2 weapon hits do not credit P1');
    assert.ok(game.ram.u32(HUDRAM.totalP2) > p2ScoreBefore,
      'P2 weapon hits reach the visible P2 score');
    assert.equal(game.unportedLog.report().some(line => line.includes('$249EE8')), false,
      'the implemented player tail is no longer counted as unported');
  });

test('W602 genuine P2 tail stages packed-BCD score with every cartridge gate',
  { skip: SKIP }, async () => {
    const game = await genuineP2();
    const { ram } = game;
    const source = 0x812904;
    const timer = 0x812918;

    function oneFrame({
      loop = 0, timerValue = 0, bossGate = 0, pause = 0,
      flagGate = false, stateGate = false,
    } = {}) {
      ram.setU16(0x80392c, pause);
      if (flagGate) ram.bset8(0x8130f8, 0);
      else ram.bclr8(0x8130f8, 0);
      ram.setU16(0x81309c, bossGate);
      if (stateGate) ram.bset8(RAM.player2 + P.state, 6);
      else ram.bclr8(RAM.player2 + P.state, 6);
      ram.setU16(0x813098, loop);
      ram.setU16(timer, timerValue);
      ram.setU32(source, 0x00000011);
      const before = p2Score(ram);
      game.step(0xffff);
      const delta = p2Score(ram) - before;
      ram.setU32(source, 0);
      ram.setU16(0x80392c, 0);
      ram.bclr8(0x8130f8, 0);
      ram.setU16(0x81309c, 0);
      ram.bclr8(RAM.player2 + P.state, 6);
      ram.setU16(0x813098, 0);
      return delta;
    }

    ram.setU32(HUDRAM.pendingP2, 0x00000089);
    assert.equal(oneFrame(), 11, 'loop 1 carries packed BCD $89 + $11 to $100');
    assert.equal(oneFrame({ loop: 1 }), 22, 'loop 2 performs the cartridge second pass');
    assert.equal(oneFrame({ timerValue: 2 }), 0, 'the P2 tail timer blocks the add');
    assert.equal(oneFrame({ bossGate: 1 }), 0, 'the shared stage-clear gate blocks the add');
    assert.equal(oneFrame({ pause: 1 }), 0, 'the shared pause gate blocks the add');
    assert.equal(oneFrame({ flagGate: true }), 0, 'the shared flag gate blocks the add');
    assert.equal(oneFrame({ stateGate: true }), 0, 'player state bit 6 blocks the add');
  });

test('W602 genuine P2 collects and activates its own hyper through packed input',
  { skip: SKIP }, async () => {
    const game = await genuineP2();
    const { ram } = game;
    const p1Before = {
      stock: ram.u16(HYPER.p1.stock),
      req: ram.u16(HYPER.p1.req),
      active: ram.u16(HYPER.p1.active),
    };

    const left = portWordFromPlayerBits([], [BIT.left]);
    for (let frame = 0; frame < 11; frame++) game.step(left);
    const item = spawnHyperItem(ram, game.rom, {}, HYPER.p2.kind,
      ram.u16(RAM.player2 + P.posY));
    assert.notEqual(item, null, 'the cartridge hyper allocator finds a real item slot');
    assert.equal(ram.u16(item + I.status), 0x8014);
    assert.equal(ram.u16(ITEM.count), 1);

    game.step(0xffff);
    game.step(0xffff);
    assert.equal(ram.u16(HYPER.p2.stock), 1,
      'the real item collision and collection bodies grant P2 stock');
    assert.deepEqual({
      stock: ram.u16(HYPER.p1.stock),
      req: ram.u16(HYPER.p1.req),
      active: ram.u16(HYPER.p1.active),
    }, p1Before, 'P2 collection leaves every mirrored P1 hyper word unchanged');

    game.step(portWordFromPlayerBits([], [BIT.b2]));
    assert.equal(ram.u16(HYPER.p2.req), 1, 'P2 Button 2 reaches the request path');
    for (let frame = 0; frame < 40 && ram.u16(HYPER.p2.active) === 0; frame++) {
      game.step(0xffff);
    }
    assert.equal(ram.u16(HYPER.p2.active), 1,
      'the ordinary HUD frame activates P2 after its authentic slide gate');
    assert.equal(ram.u16(HYPER.p2.stock), 0);
    assert.deepEqual({
      stock: ram.u16(HYPER.p1.stock),
      req: ram.u16(HYPER.p1.req),
      active: ram.u16(HYPER.p1.active),
    }, p1Before, 'P2 activation leaves every mirrored P1 hyper word unchanged');
  });

test('W603 genuine P2 laser bomb owns its stock, hit mask, and score',
  { skip: SKIP }, async () => {
    const game = await genuineP2();
    const { ram } = game;
    const p1Before = {
      stock: ram.u8(RAM.player1 + 0x24),
      used: ram.u16(BOMBRAM.usedP1),
      count: ram.u16(BOMBRAM.countP1),
      score: p1Score(ram),
    };
    const p2Stock = ram.u8(RAM.player2 + 0x24);
    const p2Count = ram.u16(BOMBRAM.countP2);
    assert.ok(p2Stock > 0, 'the authentic type-3 initializer supplies its bomb stock');
    assert.equal(ram.u16(HYPER.p2.stock), 0,
      'zero hyper stock selects the cartridge bomb arm for Button 2');

    const heldB1 = portWordFromPlayerBits([], [BIT.b1]);
    for (let frame = 0; frame < 120 && ram.u8(RAM.player2 + P.dead) === 0; frame++) {
      game.step(heldB1);
    }
    assert.notEqual(ram.u8(RAM.player2 + P.dead), 0,
      'normal P2 input reaches the live laser state before the bomb press');

    const p2ScoreBefore = p2Score(ram);
    game.step(portWordFromPlayerBits([], [BIT.up, BIT.b1, BIT.b2]));
    assert.equal(ram.u8(RAM.player2 + 0x24), p2Stock - 1,
      'P2 Button 2 consumes exactly one P2 bomb');
    assert.equal(ram.u16(BOMBRAM.usedP2), 1);
    assert.equal(ram.u16(BOMBRAM.countP2), p2Count + 1);
    assert.ok(ram.btst8(RAM.player2 + P.flags1, 6),
      'the firing type-3 record owns the bomb damage guard');
    assert.ok((ram.u16(BOMBRAM.rec) & 0x8000) !== 0);
    assert.ok((ram.u8(BOMBRAM.rec + 1) & 0x80) !== 0,
      'the genuine bomb record carries the P2 owner bit');

    const p1VelY = ram.u16(RAM.player1 + P.velY);
    const p2VelY = ram.u16(RAM.player2 + P.velY);
    assert.notEqual(p2VelY, p1VelY,
      'authentic P2 Up input gives the owning ship an asymmetric long-axis velocity');
    const tailY = ram.u16(BOMBRAM.rec + BEAM_REC.tail + 0x02);
    const p2TailY = (ram.u16(RAM.player2 + P.posY) + 0xfe00 + 0x400 + p2VelY) & 0xffff;
    const p1TailY = (ram.u16(RAM.player2 + P.posY) + 0xfe00 + 0x400 + p1VelY) & 0xffff;
    assert.equal(tailY, p2TailY,
      '$256328 advances record 42 with the owning type-3 player velocity');
    assert.notEqual(tailY, p1TailY,
      '$256328 does not reuse the idle P1 velocity for a P2 laser bomb');

    const targets = () => {
      const records = new Map();
      for (const [pool, slots, kind] of [
        [BOMBRAM.poolA, 100, 'A'], [BOMBRAM.poolB, 50, 'B'],
      ]) {
        for (let slot = 0; slot < slots; slot++) {
          const rec = pool + slot * BOMBRAM.poolAStride;
          if ((ram.u16(rec) & 0x8000) !== 0) {
            records.set(rec, { kind, hp: ram.u16(rec + 0x18) });
          }
        }
      }
      return records;
    };
    let damagedTarget = null;
    for (let frame = 0; frame < 180; frame++) {
      const before = targets();
      const mark = game.bombMarks.length;
      game.step(0xffff);
      const reached400 = game.bombMarks.slice(mark).some(([kind]) => kind === 'beam-400');
      if (reached400) {
        assert.equal(ram.u16(BOMBRAM.hitMask), 0x0800,
          'the live type-5 P2 collision pass supplies the $0800 owner mask');
        for (const [rec, old] of before) {
          const status = ram.u16(rec);
          const damage = (old.hp - ram.u16(rec + 0x18)) & 0xffff;
          const unit = old.kind === 'B' ? 0x208 : 0x1e0;
          if (damage !== 0 && damage % unit === 0 && (status & 0x0c00) === 0x0c00) {
            damagedTarget = { ...old, rec, status, damage };
            break;
          }
        }
      }
      if (damagedTarget && p2Score(ram) > p2ScoreBefore) break;
    }
    assert.ok(game.bombMarks.some(([kind]) => kind === 'beam-400'),
      'P2 laser-bomb damage sets the $400 score branch bit');
    assert.notEqual(damagedTarget, null,
      'a normal staged enemy loses cartridge HP under the P2 $0800 plus $400 mask');
    assert.equal(damagedTarget.status & 0x0c00, 0x0c00,
      'the damaged enemy record carries P2 $0800 and laser-bomb $400 ownership');
    assert.equal(damagedTarget.damage % (damagedTarget.kind === 'B' ? 0x208 : 0x1e0), 0,
      'the actual HP delta is a cartridge laser-bomb damage quantum');
    assert.ok(p2Score(ram) > p2ScoreBefore,
      'the $286B9C branch credits the P2 visible ledger');
    assert.deepEqual({
      stock: ram.u8(RAM.player1 + 0x24),
      used: ram.u16(BOMBRAM.usedP1),
      count: ram.u16(BOMBRAM.countP1),
      score: p1Score(ram),
    }, p1Before, 'P2 bomb resources and scoring leave P1 unchanged');
    assert.equal(game.unportedLog.report().some(line => line.includes('$286B9C')), false,
      'the reached P2 bomb-score branch is no longer reported as unported');
  });

test('W606 simultaneous ordinary bombs give the earlier type-2 P1 ownership',
  { skip: SKIP }, async () => {
    const game = await genuineP2();
    const { ram } = game;
    assert.equal(game.logicFrame, 2002);
    const p1Slot = liveObjectSlot(ram, 2);
    const p2Slot = liveObjectSlot(ram, 3);
    assert.notEqual(p1Slot, -1);
    assert.notEqual(p2Slot, -1);
    assert.ok(p1Slot < p2Slot, 'the authentic table dispatches type-2 P1 before type-3 P2');
    assert.deepEqual(naturalTargetState(ram),
      Array.from({ length: 7 }, () => ({ status: 0xa200, hp: 0x0038 })));

    const pressed = portWordFromPlayerBits([BIT.b2], [BIT.b2]);
    assert.equal(pressed, 0xbfbf);
    const effects = stepWithBombEffects(game, pressed);
    const b2 = 1 << BIT.b2;
    assert.equal(ram.u16(RAM.p1edge) & b2, b2);
    assert.equal(ram.u16(RAM.p2edge) & b2, b2);
    assert.equal(ram.u16(BOMBRAM.rec), 0x8100,
      'the earlier type-2 player owns the shared record');
    assert.equal(game.bombEvents.get('press:fired+partner'), 1);
    assert.equal(game.bombEvents.get('press:bomb-already-up'), 1,
      'P2 reaches the same-frame shared-record refusal');
    assert.deepEqual(bombLedger(ram, false), { stock: 2, count: 1, used: 1 });
    assert.deepEqual(bombLedger(ram, true), { stock: 3, count: 0, used: 0 });
    assert.equal(ram.btst8(RAM.player1 + P.flags1, 6), 1);
    assert.equal(ram.btst8(RAM.player2 + P.flags1, 6), 0);
    assert.deepEqual(effects, [
      { invuln: 0xff, word26: 0, word28: 0x003c },
      { invuln: 0xff, word26: 0, word28: 0x003c },
    ]);
    assert.deepEqual(naturalTargetState(ram),
      Array.from({ length: 7 }, () => ({ status: 0xb200, hp: 0xffe8 })),
      'all seven natural targets carry P1 $1000 ownership and bomb damage');

    game.step(0xffff);
    assert.equal(ram.u32(HUDRAM.totalP1), 0x00000056);
    assert.deepEqual({
      total: ram.u32(HUDRAM.totalP2), pending: ram.u32(HUDRAM.pendingP2),
    }, { total: 0, pending: 0 });
  });

test('W606 a simultaneous bomb press keeps P1 laser-bomb ownership',
  { skip: SKIP }, async () => {
    const game = await genuineP2();
    const { ram } = game;
    const held = portWordFromPlayerBits([BIT.b1], []);
    for (let frame = 0; frame < 18; frame++) game.step(held);
    assert.equal(ram.u8(RAM.player1 + P.dead), 1);
    assert.ok(liveSegments(ram, BEAM[0]) > 0, 'P1 has a live regular beam segment');
    const p2BeamBefore = beamState(ram, BEAM[1]);

    const pressed = portWordFromPlayerBits([BIT.b1, BIT.b2], [BIT.b2]);
    assert.equal(pressed, 0xbf9f);
    const effects = stepWithBombEffects(game, pressed);
    const b2 = 1 << BIT.b2;
    assert.equal(ram.u16(RAM.p1edge) & b2, b2);
    assert.equal(ram.u16(RAM.p2edge) & b2, b2);
    assert.equal(ram.u16(BOMBRAM.rec), 0x8101);
    assert.equal(game.bombEvents.get('press:fired+partner'), 1);
    assert.equal(game.bombEvents.get('press:bomb-already-up'), 1,
      'P2 reaches the same-frame shared-record refusal');
    assert.deepEqual(bombLedger(ram, false), { stock: 2, count: 1, used: 1 });
    assert.deepEqual(bombLedger(ram, true), { stock: 3, count: 0, used: 0 });
    assert.equal(ram.u8(RAM.player1 + P.flags1) & 0xc0, 0xc0,
      'P1 owns both the bomb guard and laser-bomb flag');
    assert.equal(ram.btst8(RAM.player2 + P.flags1, 6), 0);
    assert.deepEqual(effects, [
      { invuln: 0xff, word26: 0x0101, word28: 0x000c },
      { invuln: 0xff, word26: 0x0101, word28: 0x000c },
    ]);
    assert.deepEqual(beamState(ram, BEAM[0]), {
      control: 0, block: 0, blockTail: 0, liveSegments: 0,
    }, 'the laser-bomb arm wipes P1 regular beam pool and controls');
    assert.equal(game.bombEvents.get('beam-arm:armed'), 1);
    assert.deepEqual(beamState(ram, BEAM[1]), p2BeamBefore,
      'the losing P2 edge leaves P2 regular-beam ownership resources untouched');

    for (let frame = 0; frame < 14; frame++) game.step(0xffff);
    assert.equal(game.bombEvents.get('beam-400:A'), 1);
    assert.equal(ram.u16(BOMBRAM.hitMask), DMG.maskP1);
    const status = ram.u16(BOMBRAM.poolA);
    assert.equal(status, 0xb600);
    assert.equal(status & 0x1400, 0x1400,
      'the target carries P1 $1000 plus laser-bomb $400 ownership');
    assert.equal(ram.u32(HUDRAM.totalP1), 0x00000026);
    assert.deepEqual({
      total: ram.u32(HUDRAM.totalP2), pending: ram.u32(HUDRAM.pendingP2),
    }, { total: 0, pending: 0 });
  });
