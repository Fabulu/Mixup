// W605: one exact Game run carries genuine P2 from collision through respawn.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { MACHINE, BIT, RAM, P } from '../src/machine.js';
import { portWordFromPlayerBits } from '../src/input.js';
import { ALLOC } from '../src/objalloc.js';
import { DMG } from '../src/damage.js';
import { TALLY } from '../src/tally.js';
import { SHOT } from '../src/weapons.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { applyAuthenticSelection } from '../src/authentic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const HAVE = existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz'))
  && existsSync(path.join(ASSETS, 'capture.bin.gz'));
const SKIP = HAVE ? false : 'exact local selector bundle absent; this is a skip, not a pass';

const P1_LIVES = 0x8130be;
const P2_LIVES = 0x8130c0;
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

function stagedById(ram, id) {
  for (let offset = 0; offset < ram.u16(ALLOC.createSp); offset += ALLOC.stride) {
    const rec = ALLOC.createStage + offset;
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

function bytes(ram, begin, length) {
  const offset = begin - MACHINE.ramBase;
  return ram.b.slice(offset, offset + length);
}

function liveShots(ram, table) {
  const out = [];
  for (let slot = 0; slot < SHOT.slots; slot++) {
    const rec = table + slot * SHOT.stride;
    if ((ram.u16(rec) & 0x8000) !== 0) out.push(rec);
  }
  return out;
}

test('W605 genuine P2 collision retires and respawns a distinct playable type-3 actor',
  { skip: SKIP }, async () => {
    const exact = await bundle();
    const game = new Game(exact.seed, exact.tables, {
      logicFrame: exact.cap.frames[0].lf,
      videoFrame: exact.cap.frames[0].vf,
      bgSeed: exact.cap.part(0, 'bg'),
    });
    const { ram } = game;
    const p1Object = playerObjectBySide(ram, 0);
    assert.notEqual(p1Object, null, 'the exact seed carries its genuine type-2 P1 actor');
    const p1Id = ram.u32(p1Object + ALLOC.idOff);
    const p1Before = {
      y: ram.u16(RAM.player1 + P.posY),
      x: ram.u16(RAM.player1 + P.posX),
      lives: ram.u16(P1_LIVES),
      shots: bytes(ram, SHOT.p1Table, SHOT.slots * SHOT.stride),
    };

    const originalId = (ram.u32(ALLOC.idCounter) + 1) >>> 0;
    applyAuthenticSelection(game, {
      ship: 0, style: 2, p2: { ship: 0, style: 2 },
    });
    assert.equal(ram.u16(TALLY.side1), 4, 'the browser join starts at request 4');

    game.step(0xffff);                                      // call 1: request 4 stages P2
    assert.equal(ram.u16(TALLY.side1), 0);
    assert.equal(ram.u32(TALLY.side1 + TALLY.ptr), P2_LIVES,
      'the authentic P2 tally points at the P2 reserve-life word');
    assert.equal(ram.u16(P2_LIVES), 2, 'request 4 installs the DIP reserve count');
    assert.equal(ram.u32(TALLY.side1 + TALLY.result), originalId);
    assert.equal(ram.u16(ALLOC.createStage), 0x8003);
    assert.equal(ram.u8(ALLOC.createStage + 0x07), 1);
    assert.equal(objectById(ram, originalId), null, 'the first frame only stages the actor');

    game.step(0xffff);                                      // call 2: commit and initialise P2
    const originalActor = objectById(ram, originalId);
    assert.notEqual(originalActor, null);
    assert.equal(ram.u16(originalActor), 0x8003);
    assert.equal(ram.u8(originalActor + 0x07), 1);
    assert.equal(ram.u8(RAM.player2 + P.playerIdx), 1);
    assert.equal(ram.u16(RAM.player2 + P.state), 0x8000);

    // Type 5's ordinary enemy-bullet driver runs before its collision tail. Give
    // slot 0 a valid plain-path continuation and zero velocity, then put it on P2.
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
    ram.setU16(DMG.mirror2, 0); // main-loop call 0 toggles this to the P2 arm

    game.step(0xffff);                                      // call 3: normal collision hits P2
    assert.equal(game.damageFrame?.player?.hitPlayer, true);
    assert.equal(ram.u16(DMG.fa72), DMG.maskP2,
      'the reached collision pass carries P2 ownership');
    assert.ok(ram.btst8(RAM.player2 + P.state, 4), 'the ordinary pass sets P2 hit bit 4');
    assert.equal(ram.btst8(RAM.player1 + P.state, 4), 0,
      'the same collision does not mark P1');
    assert.ok((ram.u8(bullet) & 0x10) !== 0, 'the colliding bullet receives its hit flag');

    game.step(0xffff);                                      // call 4: P2 consumes the lethal hit
    assert.ok(ram.btst8(RAM.player2 + P.state, 0), 'P2 enters the death-animation arm');
    assert.equal(ram.btst8(RAM.player1 + P.state, 0), 0);
    assert.equal(ram.u16(P2_LIVES), 2, 'death entry does not spend a life early');

    for (let call = 5; call <= 73; call++) game.step(0xffff);
    assert.equal(ram.u16(TALLY.side1), 0, 'the first 69 death-handler frames do not respawn');
    assert.equal(ram.u16(ALLOC.killSp), 0);
    assert.equal(objectById(ram, originalId), originalActor);
    assert.equal(ram.u16(P2_LIVES), 2);

    game.step(0xffff);                                      // call 74: reset posts request 1
    assert.equal(ram.u16(TALLY.side1), 1);
    assert.equal(ram.u16(TALLY.side0), 0, 'P1 tally remains idle');
    assert.equal(ram.u16(ALLOC.killSp), ALLOC.stride);
    assert.equal(ram.u32(ALLOC.killQueue), originalId,
      'the death reset queues the original allocator ID');
    assert.equal(objectById(ram, originalId), originalActor,
      'the old actor remains until the next commit pass');
    assert.equal(ram.u16(P2_LIVES), 2);

    game.step(0xffff);                                      // call 75: kill, debit, stage replacement
    const replacementId = ram.u32(TALLY.side1 + TALLY.result);
    assert.equal(ram.u16(TALLY.side1), 0);
    assert.equal(ram.u16(P2_LIVES), 1, 'request 1 spends exactly one P2 reserve life');
    assert.equal(ram.u16(P1_LIVES), p1Before.lives, 'P1 reserve lives remain untouched');
    assert.equal(ram.u16(ALLOC.killSp), 0);
    assert.equal(objectById(ram, originalId), null, 'the old allocator ID is retired first');
    assert.notEqual(replacementId, originalId, 'the replacement receives a distinct ID');
    assert.notEqual(replacementId, 0);
    assert.equal(objectById(ram, replacementId), null, 'the replacement is staged, not fabricated live');
    const staged = stagedById(ram, replacementId);
    assert.notEqual(staged, null);
    assert.equal(ram.u16(staged), 0x8003);
    assert.equal(ram.u8(staged + 0x07), 1);
    assert.deepEqual([ram.u16(staged + 0x08), ram.u16(staged + 0x0a)],
      [ram.u16(TALLY.side1 + 0x0c), ram.u16(TALLY.side1 + 0x0e)]);

    game.step(0xffff);                                      // call 76: commit and initialise replacement
    const replacementActor = objectById(ram, replacementId);
    assert.notEqual(replacementActor, null);
    assert.equal(ram.u16(replacementActor), 0x8003);
    assert.equal(ram.u32(replacementActor + ALLOC.idOff), replacementId);
    assert.equal(ram.u8(replacementActor + 0x07), 1);
    assert.equal(ram.u16(RAM.player2 + P.state), 0x8000);
    assert.equal(ram.u8(RAM.player2 + P.playerIdx), 1);
    assert.equal(ram.u8(RAM.player2 + P.invuln), 0xf0);
    assert.deepEqual([ram.u16(RAM.player2 + P.posY), ram.u16(RAM.player2 + P.posX)],
      [ram.u16(TALLY.side1 + 0x0c), ram.u16(TALLY.side1 + 0x0e)]);

    const respawnX = ram.u16(RAM.player2 + P.posX);
    const input = portWordFromPlayerBits([], [BIT.right, BIT.b1]);
    assert.equal(input, 0xcfff);
    game.step(input);                                       // call 77: resumed P2 movement and fire
    assert.equal(ram.u8(RAM.player1 + P.dirByte), 0);
    assert.equal(ram.u8(RAM.player1 + P.btnByte), 0);
    assert.equal(ram.u8(RAM.player2 + P.dirByte), 0x98);
    assert.equal(ram.u8(RAM.player2 + P.btnByte), 0x18);
    assert.equal(ram.u16(RAM.player2 + P.posX),
      (respawnX + ram.u16(RAM.player2 + P.velX)) & 0xffff);
    assert.notEqual(ram.u16(RAM.player2 + P.posX), respawnX,
      'the replacement answers P2-only Right input');
    assert.equal(liveShots(ram, SHOT.p1Table).length, 0);
    assert.equal(liveShots(ram, SHOT.p2Table).length, 2,
      'the replacement fires two authentic P2 muzzle records');

    assert.equal(playerObjectBySide(ram, 0), p1Object,
      'the genuine P1 allocator record survives the complete P2 lifecycle');
    assert.equal(ram.u32(p1Object + ALLOC.idOff), p1Id);
    assert.deepEqual([ram.u16(RAM.player1 + P.posY), ram.u16(RAM.player1 + P.posX)],
      [p1Before.y, p1Before.x]);
    assert.equal(ram.u16(P1_LIVES), p1Before.lives);
    assert.equal(ram.u16(TALLY.side0), 0);
    assert.deepEqual(bytes(ram, SHOT.p1Table, SHOT.slots * SHOT.stride), p1Before.shots,
      'P2 death, respawn, movement, and fire leave the P1 shot pool byte-exact');
  });
