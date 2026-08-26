// W610 Wave 3: exact-bundle formation lifecycle proof.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MACHINE, P, RAM, BIT, OPT } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { DMG } from '../src/damage.js';
import { TALLY } from '../src/tally.js';
import { SHOT } from '../src/weapons.js';
import { BEAM, SEG } from '../src/laser.js';
import { HYPER } from '../src/hyper.js';
import { BOMBRAM } from '../src/bomb.js';
import { HUDRAM } from '../src/hud.js';
import { MOD_IDS } from '../src/mods.js';
import {
  FORMATION_MODE, createFormationState, initializeFormation, prepareFormationFrame,
} from '../src/formation.js';
import { mirrorsFromPort, portWordFromPlayerBits } from '../src/input.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  clearCoin, clearTouch, selectTouchOwner, setTouchButton, setTouchDirections,
} from '../src/web/input.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const REQUIRED_ASSETS = [
  'manifest.json', 'seed.bin.gz', 'player.tables.json.gz', 'capture.bin.gz',
];
const HAVE_ASSETS = REQUIRED_ASSETS.every((name) => existsSync(path.join(ASSETS, name)));
const SKIP_ASSETS = HAVE_ASSETS ? false
  : 'exact browser bundle absent; lifecycle proof is skipped, not passed';
let bundlePromise;
function localBundle() {
  bundlePromise ??= loadBundle(async (name) => {
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}

function fakeCanvas() {
  const context = {
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {},
  };
  return {
    width: 0, height: 0, style: {}, dataset: {},
    getContext() { return context; },
  };
}

function allocatorActors(ram, type) {
  return Array.from({ length: ALLOC.slots }, (_, i) => ALLOC.table + i * ALLOC.stride)
    .filter((slot) => ram.u16(slot) === (0x8000 | type));
}

const P1_LIVES = 0x8130be;
const P2_LIVES = 0x8130c0;
const BULLET_CONTINUATION = 0x282420;

function actorId(ram, slot) {
  return ram.u32(slot + ALLOC.idOff);
}

function objectById(ram, id) {
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((ram.u16(rec) & 0x8000) !== 0 && actorId(ram, rec) === id) return rec;
  }
  return null;
}

function stagedById(ram, id) {
  for (let offset = 0; offset < ram.u16(ALLOC.createSp); offset += ALLOC.stride) {
    const rec = ALLOC.createStage + offset;
    if ((ram.u16(rec) & 0x8000) !== 0 && actorId(ram, rec) === id) return rec;
  }
  return null;
}

function playerActor(ram, side) {
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((ram.u16(rec) & 0xff) === side + 2 && ram.u8(rec + 0x07) === side) return rec;
  }
  return null;
}

function recordsOfType(ram, type) {
  const records = [];
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((ram.u16(rec) & 0x807f) === (0x8000 | type)) records.push(rec);
  }
  for (let offset = 0; offset < ram.u16(ALLOC.createSp); offset += ALLOC.stride) {
    const rec = ALLOC.createStage + offset;
    if ((ram.u16(rec) & 0x807f) === (0x8000 | type)) records.push(rec);
  }
  return records;
}

function bytes(ram, begin, length) {
  const offset = begin - MACHINE.ramBase;
  return ram.b.slice(offset, offset + length);
}

function liveRecords(ram, table, slots, stride) {
  return Array.from({ length: slots }, (_, i) => table + i * stride)
    .filter((rec) => (ram.u16(rec) & 0x8000) !== 0);
}

function bombLedger(ram, p2) {
  return {
    stock: ram.u8((p2 ? RAM.player2 : RAM.player1) + BOMBRAM.stockOffset),
    count: ram.u16(p2 ? BOMBRAM.countP2 : BOMBRAM.countP1),
    used: ram.u16(p2 ? BOMBRAM.usedP2 : BOMBRAM.usedP1),
  };
}

function playerResources(ram, side) {
  const player = side ? RAM.player2 : RAM.player1;
  const hyper = side ? HYPER.p2 : HYPER.p1;
  const score = side ? HUDRAM.totalP2 : HUDRAM.totalP1;
  const pending = side ? HUDRAM.pendingP2 : HUDRAM.pendingP1;
  const lives = side ? P2_LIVES : P1_LIVES;
  const tally = side ? TALLY.side1 : TALLY.side0;
  return {
    state: ram.u16(player + P.state),
    lives: ram.u16(lives),
    tallyResult: ram.u32(tally + TALLY.result),
    bomb: bombLedger(ram, !!side),
    hyper: {
      stock: ram.u16(hyper.stock), req: ram.u16(hyper.req), active: ram.u16(hyper.active),
    },
    score: { total: ram.u32(score), pending: ram.u32(pending) },
  };
}

function activeDemo(bundle) {
  return new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
    undefined, null, null, null, null, FORMATION_MODE);
}

function stepUntil(demo, predicate, limit, message) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return i;
    demo.step();
  }
  assert.fail(`${message} within ${limit} logic frames`);
}

test('W610 exact formation launch allocates distinct authentic P1 and P2 actors',
  { skip: SKIP_ASSETS }, async () => {
    const demo = activeDemo(await localBundle());
    const ram = demo.game.ram;
    assert.deepEqual(demo.authentic, {
      ship: 0, style: 2, p2: { ship: 2, style: 2 },
    });
    assert.equal(ram.u16(TALLY.side1), 4, 'formation posts genuine P2 request 4');

    stepUntil(demo, () => allocatorActors(ram, 3).length === 1, 4,
      'request 4 must commit one type-3 actor');
    const [p1Actor] = allocatorActors(ram, 2);
    const [p2Actor] = allocatorActors(ram, 3);
    assert.ok(p1Actor, 'the exact seed retains its allocator-backed type-2 P1');
    assert.ok(p2Actor, 'request 4 commits an allocator-backed type-3 P2');
    const p1Id = actorId(ram, p1Actor);
    const p2Id = actorId(ram, p2Actor);
    assert.notEqual(p1Id, p2Id);
    assert.equal(ram.u32(TALLY.side0 + TALLY.result), p1Id);
    assert.equal(ram.u32(TALLY.side1 + TALLY.result), p2Id);
    assert.equal(ram.u8(p1Actor + 0x07), 0);
    assert.equal(ram.u8(p2Actor + 0x07), 1);
    assert.equal(ram.u16(RAM.player1 + P.state), 0x8000);
    assert.equal(ram.u16(RAM.player2 + P.state), 0x8000);
    assert.deepEqual([
      ram.u16(RAM.player1 + P.shipSel), ram.u16(RAM.player1 + P.optFormation),
      ram.u16(RAM.player2 + P.shipSel), ram.u16(RAM.player2 + P.optFormation),
    ], [0, 2, 2, 2]);
    assert.equal(RAM.player1 + P.stride, RAM.player2);
    assert.equal(RAM.p1Options + OPT.stride, RAM.p2Options);
    assert.deepEqual([
      ram.u16(RAM.p1Options + OPT.state), ram.u16(RAM.p2Options + OPT.state),
    ], [0x8003, 0x8001]);
    assert.notEqual(SHOT.p1Table, SHOT.p2Table);
    assert.notEqual(BEAM[0].rec, BEAM[1].rec);
    assert.notEqual(BEAM[0].pool, BEAM[1].pool);
    assert.notEqual(HYPER.p1.stock, HYPER.p2.stock);
    assert.notEqual(HUDRAM.totalP1, HUDRAM.totalP2);
    assert.notEqual(BOMBRAM.countP1, BOMBRAM.countP2);
    assert.notEqual(P1_LIVES, P2_LIVES);
    assert.deepEqual(playerResources(ram, 0), {
      state: 0x8000, lives: 2, tallyResult: p1Id,
      bomb: { stock: 3, count: 0, used: 0 },
      hyper: { stock: 0, req: 0, active: 0 },
      score: { total: 0, pending: 0 },
    });
    assert.deepEqual(playerResources(ram, 1), {
      state: 0x8000, lives: 2, tallyResult: p2Id,
      bomb: { stock: 3, count: 0, used: 0 },
      hyper: { stock: 0, req: 0, active: 0 },
      score: { total: 0, pending: 0 },
    });
  });

test('W610 formation control packing reaches both actors but leaves Button 2 with P1',
  { skip: SKIP_ASSETS }, async () => {
    clearCoin();
    clearTouch();
    const demo = activeDemo(await localBundle());
    stepUntil(demo, () => allocatorActors(demo.game.ram, 3).length === 1, 4,
      'formation P2 must become live');
    assert.equal(selectTouchOwner('P1'), true);
    const anchorBefore = {
      x: demo.formation.runtime.anchorX,
      y: demo.formation.runtime.anchorY,
    };
    const angle = demo.game.tables.angleFor(1 << BIT.right);
    const vector = demo.game.tables.vector(demo.formation.runtime.lastP1Speed, angle);
    const p1BombBefore = bombLedger(demo.game.ram, false);
    const p2BombBefore = bombLedger(demo.game.ram, true);
    setTouchDirections(1 << BIT.right);
    setTouchButton('SHOT', true);
    setTouchButton('BOMB', true);
    setTouchButton('AUTO', true);
    let packedWord = null;
    const realStep = demo.game.step.bind(demo.game);
    demo.game.step = (word) => {
      packedWord = word;
      return realStep(word);
    };
    try {
      demo.step();
      const packed = mirrorsFromPort(packedWord);
      for (const bit of [BIT.right, BIT.b1, BIT.b3]) {
        assert.notEqual(packed.p1 & (1 << bit), 0);
        assert.notEqual(packed.p2 & (1 << bit), 0);
      }
      assert.notEqual(packed.p1 & (1 << BIT.b2), 0);
      assert.equal(packed.p2 & (1 << BIT.b2), 0);
      const expectedAnchor = {
        x: Math.max(0x0700, Math.min(0x3100, anchorBefore.x + vector.dx)),
        y: Math.max(0x0800, Math.min(0x6500, anchorBefore.y + vector.dy)),
      };
      assert.deepEqual({
        x: demo.formation.runtime.anchorX,
        y: demo.formation.runtime.anchorY,
      }, expectedAnchor, 'P1 Right advances one shared anchor by the cartridge vector');
      assert.deepEqual([
        demo.game.ram.u16(RAM.player1 + P.posY),
        demo.game.ram.u16(RAM.player1 + P.posX),
        demo.game.ram.u16(RAM.player2 + P.posY),
        demo.game.ram.u16(RAM.player2 + P.posX),
      ], [expectedAnchor.y, expectedAnchor.x - 0x0400,
        expectedAnchor.y, expectedAnchor.x + 0x0400]);
      assert.equal(demo.game.ram.u16(RAM.player2 + P.posX)
        - demo.game.ram.u16(RAM.player1 + P.posX), 0x0800);

      assert.deepEqual(p1BombBefore, { stock: 3, count: 0, used: 0 });
      assert.deepEqual(p2BombBefore, { stock: 3, count: 0, used: 0 });
      assert.deepEqual(bombLedger(demo.game.ram, false), { stock: 2, count: 1, used: 1 },
        'the real P1 Button 2 press spends exactly one P1 bomb');
      assert.deepEqual(bombLedger(demo.game.ram, true), p2BombBefore,
        'formation never debits the P2 bomb ledger');
      assert.equal(demo.game.ram.u16(RAM.p1edge) & (1 << BIT.b2), 1 << BIT.b2);
      assert.equal(demo.game.ram.u16(RAM.p2edge) & (1 << BIT.b2), 0);
      assert.equal(demo.game.ram.u16(BOMBRAM.rec), 0x8100);
      assert.equal(demo.game.ram.btst8(RAM.player1 + P.flags1, 6), 1);
      assert.equal(demo.game.ram.btst8(RAM.player2 + P.flags1, 6), 0);
    } finally {
      clearTouch();
      clearCoin();
    }
  });

test('W610 exact Game clamps the shared formation at all four walls',
  { skip: SKIP_ASSETS }, async () => {
    const demo = activeDemo(await localBundle());
    const { game } = demo;
    const { ram } = game;
    stepUntil(demo, () => allocatorActors(ram, 3).length === 1, 4,
      'formation P2 must become live');
    const addresses = [
      RAM.player1 + P.posY, RAM.player1 + P.posX,
      RAM.player2 + P.posY, RAM.player2 + P.posX,
    ];
    const cases = [
      { name: 'left', bit: BIT.left, anchor: [0x2000, 0x0700],
        positions: [0x2000, 0x0300, 0x2000, 0x0b00] },
      { name: 'right', bit: BIT.right, anchor: [0x2000, 0x3100],
        positions: [0x2000, 0x2d00, 0x2000, 0x3500] },
      { name: 'bottom', bit: BIT.down, anchor: [0x0800, 0x1400],
        positions: [0x0800, 0x1000, 0x0800, 0x1800] },
      { name: 'top', bit: BIT.up, anchor: [0x6500, 0x1400],
        positions: [0x6500, 0x1000, 0x6500, 0x1800] },
    ];

    for (const entry of cases) {
      addresses.forEach((address, i) => ram.setU16(address, entry.positions[i]));
      const state = createFormationState(FORMATION_MODE);
      initializeFormation(state, game);
      const word = prepareFormationFrame(state, game,
        portWordFromPlayerBits([entry.bit], []));
      assert.deepEqual([state.runtime.anchorY, state.runtime.anchorX], entry.anchor,
        `${entry.name} anchor clamps exactly`);
      assert.deepEqual(addresses.map((address) => ram.u16(address)), entry.positions,
        `${entry.name} targets remain exactly eight horizontal units apart`);
      const packed = mirrorsFromPort(word);
      assert.notEqual(packed.p1 & (1 << entry.bit), 0);
      assert.notEqual(packed.p2 & (1 << entry.bit), 0);
    }
  });

test('W610 copied fire drives independent option, shot, beam, and score resources',
  { skip: SKIP_ASSETS }, async () => {
    clearCoin();
    clearTouch();
    const demo = activeDemo(await localBundle());
    const { ram } = demo.game;
    stepUntil(demo, () => allocatorActors(ram, 3).length === 1, 4,
      'formation P2 must become live');
    assert.equal(selectTouchOwner('P1'), true);
    setTouchButton('SHOT', true);
    try {
      demo.step();
      assert.equal(liveRecords(ram, SHOT.p1Table, SHOT.slots, SHOT.stride).length, 4);
      assert.equal(liveRecords(ram, SHOT.p2Table, SHOT.slots, SHOT.stride).length, 2);
      assert.notDeepEqual(bytes(ram, SHOT.p1Table, SHOT.slots * SHOT.stride),
        bytes(ram, SHOT.p2Table, SHOT.slots * SHOT.stride),
        'genuine muzzle writers fill separate shot pools');

      for (let frame = 1; frame < 120; frame++) demo.step();
      assert.deepEqual([
        ram.u16(RAM.p1Options + OPT.state), ram.u16(RAM.p2Options + OPT.state),
      ], [0xf007, 0xf007], 'both independent option records reach live laser state');
      assert.deepEqual([ram.u16(BEAM[0].rec), ram.u16(BEAM[1].rec)], [0x9201, 0x8201]);
      assert.deepEqual([
        liveRecords(ram, BEAM[0].pool, SEG.slots, SEG.stride).length,
        liveRecords(ram, BEAM[1].pool, SEG.slots, SEG.stride).length,
      ], [12, 10], 'both independent beam pools retain exact live segment counts');
      assert.deepEqual([
        ram.u32(HUDRAM.totalP1), ram.u32(HUDRAM.totalP2),
      ], [0x00000384, 0x00000410],
      'real weapon hits credit the two independent visible score ledgers');
      assert.deepEqual({
        p1: {
          stock: ram.u16(HYPER.p1.stock), req: ram.u16(HYPER.p1.req),
          active: ram.u16(HYPER.p1.active),
        },
        p2: {
          stock: ram.u16(HYPER.p2.stock), req: ram.u16(HYPER.p2.req),
          active: ram.u16(HYPER.p2.active),
        },
      }, {
        p1: { stock: 0, req: 0, active: 0 },
        p2: { stock: 0, req: 0, active: 0 },
      }, 'copied fire cannot merge the independent hyper ledgers');
      assert.deepEqual(bombLedger(ram, false), { stock: 3, count: 0, used: 0 });
      assert.deepEqual(bombLedger(ram, true), { stock: 3, count: 0, used: 0 });
    } finally {
      clearTouch();
      clearCoin();
    }
  });

test('W610 P2 collision respawns a distinct formation actor without touching P1',
  { skip: SKIP_ASSETS }, async () => {
    clearCoin();
    clearTouch();
    const demo = activeDemo(await localBundle());
    const { game } = demo;
    const { ram } = game;
    const p1Actor = playerActor(ram, 0);
    assert.notEqual(p1Actor, null);
    const p1Id = actorId(ram, p1Actor);
    const originalId = (ram.u32(ALLOC.idCounter) + 1) >>> 0;

    demo.step();                                                // call 1: stage request-4 P2
    assert.equal(ram.u16(TALLY.side1), 0);
    assert.equal(ram.u16(ALLOC.createStage), 0x8003);
    assert.equal(ram.u8(ALLOC.createStage + 0x07), 1);
    assert.equal(ram.u32(TALLY.side1 + TALLY.result), originalId);
    assert.equal(objectById(ram, originalId), null);

    demo.step();                                                // call 2: commit and initialize P2
    const originalActor = objectById(ram, originalId);
    assert.notEqual(originalActor, null);
    assert.equal(ram.u16(originalActor), 0x8003);
    assert.equal(ram.u8(originalActor + 0x07), 1);
    const p1Before = playerResources(ram, 0);
    const p1ShotsBefore = bytes(ram, SHOT.p1Table, SHOT.slots * SHOT.stride);
    const p2LivesBefore = ram.u16(P2_LIVES);
    assert.equal(p2LivesBefore, 2);

    const bullet = DMG.bulletPool;
    ram.setU16(bullet, 0x8000);
    ram.setU16(bullet + 0x02, ram.u16(RAM.player2 + P.posY));
    ram.setU16(bullet + 0x04, ram.u16(RAM.player2 + P.posX));
    ram.setU8(bullet + 0x1a, 0);
    ram.setU8(bullet + 0x1b, 0);
    ram.setU32(bullet + 0x1e, 0);
    ram.setU32(bullet + 0x22, BULLET_CONTINUATION);
    ram.setU8(RAM.player2 + P.invuln, 0);
    ram.setU16(DMG.gate308c, 0);
    ram.setU16(DMG.mirror2, 0);

    demo.step();                                                // call 3: ordinary collision hits P2
    assert.equal(game.damageFrame?.player?.hitPlayer, true);
    assert.equal(ram.u16(DMG.fa72), DMG.maskP2);
    assert.equal(ram.btst8(RAM.player2 + P.state, 4), 1);
    assert.equal(ram.btst8(RAM.player1 + P.state, 4), 0);
    assert.ok((ram.u8(bullet) & 0x10) !== 0);

    demo.step();                                                // call 4: P2 consumes the lethal hit
    assert.equal(ram.btst8(RAM.player2 + P.state, 0), 1);
    assert.equal(ram.btst8(RAM.player1 + P.state, 0), 0);
    assert.equal(ram.u16(P2_LIVES), p2LivesBefore);
    const deathPosition = [
      ram.u16(RAM.player2 + P.posY), ram.u16(RAM.player2 + P.posX),
    ];

    const deathPositions = new Set([deathPosition.join(':')]);
    for (let call = 5; call <= 73; call++) {
      demo.step();
      deathPositions.add([
        ram.u16(RAM.player2 + P.posY), ram.u16(RAM.player2 + P.posX),
      ].join(':'));
    }
    const deathAnimationPosition = [deathPosition[0], 0x1c00];
    assert.deepEqual([...deathPositions], [
      deathPosition.join(':'), deathAnimationPosition.join(':'),
    ], 'only the cartridge death animation moves its own record');
    assert.deepEqual([
      ram.u16(RAM.player2 + P.posY), ram.u16(RAM.player2 + P.posX),
    ], deathAnimationPosition,
    'the cartridge death-animation position remains untouched after its own offset');
    assert.notDeepEqual(deathAnimationPosition,
      [demo.formation.runtime.targets[1].y, demo.formation.runtime.targets[1].x],
      'formation does not snap a death record back to the live target');
    assert.equal(ram.u16(TALLY.side1), 0);
    assert.equal(objectById(ram, originalId), originalActor);
    assert.equal(ram.u16(P2_LIVES), p2LivesBefore);

    demo.step();                                                // call 74: death reset posts request 1
    assert.equal(ram.u16(TALLY.side1), 1);
    assert.equal(ram.u16(TALLY.side0), 0);
    assert.equal(ram.u16(ALLOC.killSp), ALLOC.stride);
    assert.equal(ram.u32(ALLOC.killQueue), originalId);
    assert.equal(objectById(ram, originalId), originalActor);

    demo.step();                                                // call 75: retire, debit, stage replacement
    const replacementId = ram.u32(TALLY.side1 + TALLY.result);
    assert.equal(objectById(ram, originalId), null);
    assert.equal(ram.u16(P2_LIVES), p2LivesBefore - 1);
    assert.equal(ram.u16(P1_LIVES), p1Before.lives);
    assert.notEqual(replacementId, originalId);
    assert.notEqual(replacementId, 0);
    assert.equal(objectById(ram, replacementId), null);
    const staged = stagedById(ram, replacementId);
    assert.notEqual(staged, null);
    assert.equal(ram.u16(staged), 0x8003);
    assert.equal(ram.u8(staged + 0x07), 1);

    demo.step();                                                // call 76: commit and initialize replacement
    const replacementActor = objectById(ram, replacementId);
    assert.notEqual(replacementActor, null);
    assert.equal(ram.u16(replacementActor), 0x8003);
    assert.equal(ram.u8(replacementActor + 0x07), 1);
    assert.equal(ram.u8(RAM.player2 + P.invuln), 0xf0);
    const rightTarget = demo.formation.runtime.targets[1];
    assert.deepEqual([
      ram.u16(RAM.player2 + P.posY), ram.u16(RAM.player2 + P.posX),
    ], [rightTarget.y, rightTarget.x],
    'replacement initialization callback snaps P2 to the live right-hand target');
    assert.equal(ram.u16(RAM.player2 + P.posX) - ram.u16(RAM.player1 + P.posX), 0x0800);
    assert.notDeepEqual(bytes(ram, RAM.player1, P.stride), bytes(ram, RAM.player2, P.stride),
      'replacement initialization does not copy the complete P1 record');
    assert.equal(playerActor(ram, 0), p1Actor);
    assert.equal(actorId(ram, p1Actor), p1Id);
    assert.deepEqual(playerResources(ram, 0), p1Before);
    assert.deepEqual(bytes(ram, SHOT.p1Table, SHOT.slots * SHOT.stride), p1ShotsBefore);
    assert.deepEqual(recordsOfType(ram, 0x0e), []);
    assert.deepEqual(recordsOfType(ram, 0x0c), [],
      'a reserve-life respawn never enters the global Game Over chain');

    assert.equal(selectTouchOwner('P1'), true);
    setTouchDirections(1 << BIT.right);
    setTouchButton('SHOT', true);
    const anchorBefore = demo.formation.runtime.anchorX;
    try {
      demo.step();                                              // call 77: copied movement and fire
      assert.ok(demo.formation.runtime.anchorX > anchorBefore);
      assert.equal(ram.u16(RAM.player2 + P.posX) - ram.u16(RAM.player1 + P.posX), 0x0800);
      assert.equal(ram.u8(RAM.player1 + P.dirByte), 0x18);
      assert.equal(ram.u8(RAM.player2 + P.dirByte), 0x98);
      assert.equal(ram.u8(RAM.player1 + P.btnByte), 0x18);
      assert.equal(ram.u8(RAM.player2 + P.btnByte), 0x18);
      assert.equal(liveRecords(ram, SHOT.p1Table, SHOT.slots, SHOT.stride).length, 4);
      assert.equal(liveRecords(ram, SHOT.p2Table, SHOT.slots, SHOT.stride).length, 2);
      assert.equal(playerActor(ram, 0), p1Actor);
      assert.equal(actorId(ram, p1Actor), p1Id);
      assert.equal(ram.u16(P1_LIVES), p1Before.lives);
      assert.deepEqual(bombLedger(ram, false), p1Before.bomb);
      assert.deepEqual({
        stock: ram.u16(HYPER.p1.stock), req: ram.u16(HYPER.p1.req),
        active: ram.u16(HYPER.p1.active),
      }, p1Before.hyper);
    } finally {
      clearTouch();
      clearCoin();
    }
  });

test('W610 vanilla exact-bundle Demo neither joins nor copies a formation P2',
  { skip: SKIP_ASSETS }, async () => {
    clearCoin();
    clearTouch();
    assert.equal(selectTouchOwner('P1'), true);
    setTouchDirections(1 << BIT.right);
    setTouchButton('SHOT', true);
    const demo = new Demo(fakeCanvas(), await localBundle(), MACHINE.refreshHz);
    let packedWord = null;
    const realStep = demo.game.step.bind(demo.game);
    demo.game.step = (word) => {
      packedWord = word;
      return realStep(word);
    };

    try {
      assert.equal(demo.formation, null);
      assert.equal(Object.hasOwn(demo.game, 'playerPositionTransform'), false);
      assert.equal(demo.game.ram.u16(TALLY.side1), 0);
      demo.step();
      demo.step();
      const packed = mirrorsFromPort(packedWord);
      assert.notEqual(packed.p1 & (1 << BIT.right), 0);
      assert.notEqual(packed.p1 & (1 << BIT.b1), 0);
      assert.equal(packed.p2 & (1 << BIT.right), 0);
      assert.equal(packed.p2 & (1 << BIT.b1), 0,
        'ordinary launches do not copy P1 controls into the P2 panel');
      assert.equal(demo.game.ram.u16(TALLY.side1), 0);
      assert.deepEqual(allocatorActors(demo.game.ram, 3), [],
        'ordinary launches neither post request 4 nor allocate type-3 P2');
      assert.equal(MOD_IDS.length, 32);
      assert.equal(MOD_IDS.includes(FORMATION_MODE.id), false);
    } finally {
      clearTouch();
      clearCoin();
    }
  });
