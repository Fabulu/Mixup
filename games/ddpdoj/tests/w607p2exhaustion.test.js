// W607: exhausting genuine P2 hands off only that cooperative side.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { MACHINE, RAM, P } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { DMG } from '../src/damage.js';
import { TALLY } from '../src/tally.js';
import { HUDRAM } from '../src/hud.js';
import { SHOT } from '../src/weapons.js';
import { SCREEN11 } from '../src/tallyscreen.js';
import { SCREEN13 } from '../src/objslot13.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { applyAuthenticSelection } from '../src/authentic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const HAVE = existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz'))
  && existsSync(path.join(ASSETS, 'capture.bin.gz'));
const SKIP = HAVE ? false : 'exact local selector bundle absent; this is a skip, not a pass';
const BULLET_CONTINUATION = 0x282420;

let bundlePromise;
function bundle() {
  bundlePromise ??= loadBundle(async (name) => {
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}

function objectById(ram, id) {
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((ram.u16(rec) & 0x8000) !== 0 && ram.u32(rec + ALLOC.idOff) === id) return rec;
  }
  return null;
}

function playerObjectBySide(ram, side) {
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((ram.u16(rec) & 0xff) === side + 2 && ram.u8(rec + 0x07) === side) return rec;
  }
  return null;
}

function recordsOfType(ram, type) {
  const out = [];
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((ram.u16(rec) & 0x807f) === (0x8000 | type)) out.push(rec);
  }
  for (let offset = 0; offset < ram.u16(ALLOC.createSp); offset += ALLOC.stride) {
    const rec = ALLOC.createStage + offset;
    if ((ram.u16(rec) & 0x807f) === (0x8000 | type)) out.push(rec);
  }
  return out;
}

function bytes(ram, begin, length) {
  const offset = begin - MACHINE.ramBase;
  return ram.b.slice(offset, offset + length);
}

test('W607 exhausted P2 takes the cooperative side-1 handoff while P1 stays live',
  { skip: SKIP }, async () => {
    const exact = await bundle();
    const game = new Game(exact.seed, exact.tables, {
      logicFrame: exact.cap.frames[0].lf,
      videoFrame: exact.cap.frames[0].vf,
      bgSeed: exact.cap.part(0, 'bg'),
    });
    const { ram } = game;
    const p1Object = playerObjectBySide(ram, 0);
    assert.notEqual(p1Object, null);
    const p1Id = ram.u32(p1Object + ALLOC.idOff);
    const tableAnchor = {
      id: ram.u32(ALLOC.table + ALLOC.idOff), type: ram.u16(ALLOC.table),
    };
    const originalP2Id = (ram.u32(ALLOC.idCounter) + 1) >>> 0;

    applyAuthenticSelection(game, {
      ship: 0, style: 2, p2: { ship: 0, style: 2 },
    });
    game.step(0xffff);                                      // request 4 stages P2
    game.step(0xffff);                                      // commit and initialise P2
    const originalP2 = objectById(ram, originalP2Id);
    assert.notEqual(originalP2, null);
    assert.equal(ram.u16(originalP2), 0x8003);
    assert.equal(ram.u32(TALLY.side1 + TALLY.result), originalP2Id);

    const p1Before = {
      tallyResult: ram.u32(TALLY.side0 + TALLY.result),
      lives: ram.u16(HUDRAM.aliveP1),
      y: ram.u16(RAM.player1 + P.posY),
      x: ram.u16(RAM.player1 + P.posX),
      shots: bytes(ram, SHOT.p1Table, SHOT.slots * SHOT.stride),
    };
    ram.setU16(HUDRAM.aliveP2, 0);

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

    game.step(0xffff);                                      // ordinary type-5 collision
    assert.equal(game.damageFrame?.player?.hitPlayer, true);
    assert.equal(ram.u16(DMG.fa72), DMG.maskP2);
    assert.equal(ram.btst8(RAM.player2 + P.state, 4), 1);
    assert.equal(ram.btst8(RAM.player1 + P.state, 4), 0);

    game.step(0xffff);                                      // P2 consumes the lethal hit
    assert.equal(ram.btst8(RAM.player2 + P.state, 0), 1);
    for (let frame = 0; frame < 70; frame++) game.step(0xffff);

    assert.equal(ram.u16(TALLY.side1), 1);
    assert.equal(ram.u16(ALLOC.killSp), ALLOC.stride);
    assert.equal(ram.u32(ALLOC.killQueue), originalP2Id,
      'request 1 queues the original P2 allocator ID');
    assert.equal(objectById(ram, originalP2Id), originalP2);

    game.step(0xffff);                                      // retire P2 and run request 1
    assert.equal(objectById(ram, originalP2Id), null);
    assert.equal(ram.u16(ALLOC.killSp), 0);
    assert.equal(ram.u16(HUDRAM.aliveP2), 0xffff);
    assert.equal(ram.u16(HUDRAM.aliveP1), p1Before.lives,
      'the borrow consumes only P2 reserve lives');
    assert.equal(ram.u32(TALLY.side1 + TALLY.result), 0);
    assert.equal(ram.u16(TALLY.side1), 2);
    assert.equal(ram.u16(ALLOC.createSp), 0,
      'the exhausted request stages no type-3 replacement');
    assert.deepEqual(recordsOfType(ram, 3), []);

    game.step(0xffff);                                      // side-1 request 2
    assert.equal(ram.u16(RAM.playerCountM1), 0,
      'liveSides reports one remaining side as count minus one');
    assert.equal(ram.u16(RAM.onePlayerFlag), 1);
    assert.equal(ram.u16(TALLY.side1), 0);
    assert.equal(ram.u16(ALLOC.createSp), ALLOC.stride * 2);
    const stagedD = ALLOC.createStage;
    const stagedB = ALLOC.createStage + ALLOC.stride;
    assert.equal(ram.u16(stagedD), 0x800d);
    assert.equal(ram.u8(stagedD + SCREEN13.side), 1);
    assert.equal(ram.u16(stagedB), 0x800b);
    assert.equal(ram.u8(stagedB + SCREEN11.side), 1);
    const typeDId = ram.u32(stagedD + ALLOC.idOff);
    const typeBId = ram.u32(stagedB + ALLOC.idOff);

    game.step(0xffff);                                      // commit and initialise both screens
    const typeD = objectById(ram, typeDId);
    const typeB = objectById(ram, typeBId);
    assert.notEqual(typeD, null);
    assert.notEqual(typeB, null);
    assert.equal(ram.u16(typeD), 0x800d);
    assert.equal(ram.u8(typeD + SCREEN13.side), 1);
    assert.equal(ram.u32(typeD + SCREEN13.desc), SCREEN13.descB);
    assert.equal(ram.u16(typeB), 0x800b);
    assert.equal(ram.u8(typeB + SCREEN11.side), 1);
    assert.equal(ram.u32(typeB + SCREEN11.desc), SCREEN11.descB);

    // P1 is still live, so this is a side-specific handoff, not global Game Over art.
    for (let frontier = 0; frontier < 2; frontier++) {
      assert.deepEqual(recordsOfType(ram, 0x0e), []);
      assert.deepEqual(recordsOfType(ram, 0x0c), []);
      game.step(0xffff);
    }
    assert.deepEqual(recordsOfType(ram, 0x0e), []);
    assert.deepEqual(recordsOfType(ram, 0x0c), []);
    assert.deepEqual(recordsOfType(ram, 3), []);
    assert.equal(playerObjectBySide(ram, 1), null,
      'the exhausted side never gains a new type-3 actor');

    assert.equal(objectById(ram, tableAnchor.id), ALLOC.table,
      'the cooperative handoff does not globally wipe the object table');
    assert.equal(ram.u16(ALLOC.table), tableAnchor.type);
    assert.equal(objectById(ram, p1Id), p1Object);
    assert.equal(ram.u16(p1Object), 0x8002);
    assert.deepEqual({
      tallyResult: ram.u32(TALLY.side0 + TALLY.result),
      lives: ram.u16(HUDRAM.aliveP1),
      y: ram.u16(RAM.player1 + P.posY),
      x: ram.u16(RAM.player1 + P.posX),
      shots: bytes(ram, SHOT.p1Table, SHOT.slots * SHOT.stride),
    }, p1Before, 'P2 exhaustion leaves every measured P1 ownership resource unchanged');
  });
