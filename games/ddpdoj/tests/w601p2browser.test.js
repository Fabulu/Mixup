// W601: explicit browser P2 selection stays separate from mods and arms cartridge creation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { MACHINE, BIT, RAM, P, OPT } from '../src/machine.js';
import { portWordFromPlayerBits } from '../src/input.js';
import { Game } from '../src/main.js';
import { ALLOC } from '../src/objalloc.js';
import { TALLY } from '../src/tally.js';
import { SHOT } from '../src/weapons.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import {
  normalizeAuthenticSelection, authenticSelectionFromParams,
  authenticSelectionQuery, applyAuthenticSelection,
} from '../src/authentic.js';

function parsed(query) {
  return authenticSelectionFromParams(new URLSearchParams(query));
}

const DEFAULT_TWO_PLAYER = Object.freeze({
  ship: 0,
  style: 2,
  p2: Object.freeze({ ship: 0, style: 2 }),
});

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

function liveRecords(ram, table) {
  const out = [];
  for (let slot = 0; slot < SHOT.slots; slot++) {
    const rec = table + slot * SHOT.stride;
    if ((ram.u16(rec) & 0x8000) !== 0) out.push(rec);
  }
  return out;
}

function objectById(ram, id) {
  for (let slot = 0; slot < ALLOC.slots; slot++) {
    const rec = ALLOC.table + slot * ALLOC.stride;
    if ((ram.u16(rec) & 0x8000) !== 0 && ram.u32(rec + ALLOC.idOff) === id) return rec;
  }
  return null;
}

test('W601 explicit P2 normalization preserves default pairs and rejects invalid nesting', () => {
  assert.deepEqual(normalizeAuthenticSelection(DEFAULT_TWO_PLAYER), DEFAULT_TWO_PLAYER);
  assert.deepEqual(normalizeAuthenticSelection({ ship: 2, style: 4, p2: {} }), {
    ship: 2, style: 4, p2: { ship: 0, style: 2 },
  });
  for (const value of [
    { ship: 0, style: 2, p2: null },
    { ship: 0, style: 2, p2: 1 },
    { ship: 0, style: 2, p2: { ship: '0', style: 2 } },
    { ship: 0, style: 2, p2: { ship: 0, style: 8 } },
  ]) {
    assert.equal(normalizeAuthenticSelection(value), null);
  }
});

test('W601 P2 query parsing requires the join flag and round-trips both pairs', () => {
  assert.deepEqual(parsed('p2=1'), DEFAULT_TWO_PLAYER,
    'an explicit default P2 pair must not normalize away');
  assert.deepEqual(parsed('ship=2&style=6&p2=1&p2ship=2&p2style=4'), {
    ship: 2, style: 6, p2: { ship: 2, style: 4 },
  });
  assert.deepEqual(parsed('p2=1&p2ship=2'), {
    ship: 0, style: 2, p2: { ship: 2, style: 2 },
  });
  assert.deepEqual(parsed('p2=1&p2style=6'), {
    ship: 0, style: 2, p2: { ship: 0, style: 6 },
  });

  for (const query of [
    'p2=0', 'p2=', 'p2=true', 'p2ship=2', 'p2style=4',
    'p2=1&p2ship=1', 'p2=1&p2style=3', 'p2=1&p2ship=02',
  ]) {
    assert.equal(parsed(query), null, `${query} must not launch P2`);
  }

  assert.equal(authenticSelectionQuery(DEFAULT_TWO_PLAYER),
    '?ship=0&style=2&p2=1&p2ship=0&p2style=2');
  assert.equal(authenticSelectionQuery({
    ship: 2, style: 6, p2: { ship: 2, style: 4 },
  }), '?ship=2&style=6&p2=1&p2ship=2&p2style=4');
});

test('W601 browser preparation arms request 4 without fabricating P2 live records', () => {
  const ram = new Ram();
  const selected = { ship: 0, style: 2, p2: { ship: 2, style: 6 } };
  ram.setU16(TALLY.side1, 9);
  ram.setU16(TALLY.side1 + 0x02, 0xabcd);
  ram.setU32(TALLY.side1 + TALLY.result, 0x12345678);
  ram.setU16(0x813084, 0x1357);
  ram.setU16(0x813088, 0x2468);
  ram.setU16(RAM.player1 + P.state, 0xaaaa);
  ram.setU16(RAM.player2 + P.state, 0xbbbb);
  ram.setU16(RAM.p2Options + OPT.state, 0xcccc);

  const p1Before = ram.b.slice(
    RAM.player1 - MACHINE.ramBase,
    RAM.player1 - MACHINE.ramBase + P.stride,
  );
  const p2Before = ram.b.slice(
    RAM.player2 - MACHINE.ramBase,
    RAM.player2 - MACHINE.ramBase + P.stride,
  );
  const optionsBefore = ram.b.slice(
    RAM.p2Options - MACHINE.ramBase,
    RAM.p2Options - MACHINE.ramBase + OPT.stride,
  );

  assert.deepEqual(applyAuthenticSelection({ ram, rom: {} }, selected), selected);
  assert.equal(ram.u16(0x813084), 0x1357, 'default P1 selector stays seed-exact');
  assert.equal(ram.u16(0x813088), 0x2468, 'default P1 style stays seed-exact');
  assert.equal(ram.u16(0x813086), 2);
  assert.equal(ram.u16(0x81308a), 6);
  assert.equal(ram.u8(0x813018), 1);
  assert.equal(ram.u8(0x813019), 2);
  assert.equal(ram.u16(TALLY.side1), 4);
  assert.equal(ram.u16(TALLY.side1 + 0x02), 0);
  assert.equal(ram.u32(TALLY.side1 + TALLY.result), 0x12345678,
    'arming does not invent or clear a tally handle');
  assert.deepEqual(ram.b.slice(
    RAM.player1 - MACHINE.ramBase,
    RAM.player1 - MACHINE.ramBase + P.stride,
  ), p1Before);
  assert.deepEqual(ram.b.slice(
    RAM.player2 - MACHINE.ramBase,
    RAM.player2 - MACHINE.ramBase + P.stride,
  ), p2Before);
  assert.deepEqual(ram.b.slice(
    RAM.p2Options - MACHINE.ramBase,
    RAM.p2Options - MACHINE.ramBase + OPT.stride,
  ), optionsBefore);
});

test('W601 normal frame path creates, moves, and fires the genuine P2 actor',
  { skip: SKIP }, async () => {
    const exact = await bundle();
    const game = new Game(exact.seed, exact.tables, {
      logicFrame: exact.cap.frames[0].lf,
      videoFrame: exact.cap.frames[0].vf,
      bgSeed: exact.cap.part(0, 'bg'),
    });
    const selected = parsed('p2=1&p2ship=2&p2style=6');
    const p2Seed = game.ram.b.slice(
      RAM.player2 - MACHINE.ramBase,
      RAM.player2 - MACHINE.ramBase + P.stride,
    );
    const expectedId = (game.ram.u32(ALLOC.idCounter) + 1) >>> 0;
    assert.equal(expectedId, 10, 'the exact LF2000 browser seed starts at allocator ID 9');

    applyAuthenticSelection(game, selected);
    assert.equal(game.ram.u16(0x813086), 2);
    assert.equal(game.ram.u16(0x81308a), 6);
    assert.equal(game.ram.u8(0x813018), 1);
    assert.equal(game.ram.u8(0x813019), 2);
    assert.ok(game.palette.sourcedBanks().includes(0x18),
      'P2 style presentation is installed into sprite palette bank $18');
    assert.equal(game.ram.u16(TALLY.side1), 4);
    assert.equal(game.ram.u16(TALLY.side1 + 0x02), 0);
    assert.deepEqual(game.ram.b.slice(
      RAM.player2 - MACHINE.ramBase,
      RAM.player2 - MACHINE.ramBase + P.stride,
    ), p2Seed, 'browser preparation does not fabricate the live P2 record');

    game.step(0xffff);
    assert.equal(game.ram.u16(TALLY.side1), 0,
      'the normal tally driver consumes request 4');
    assert.equal(game.ram.u32(TALLY.side1 + TALLY.result), expectedId);
    assert.equal(game.ram.u16(ALLOC.createSp), ALLOC.stride);
    assert.equal(game.ram.u16(ALLOC.createStage), 0x8003);
    assert.equal(game.ram.u8(ALLOC.createStage + 0x07), 1);
    assert.equal(game.ram.u16(ALLOC.createStage + 0x08), 0x1000);
    assert.equal(game.ram.u16(ALLOC.createStage + 0x0a), 0x2a00);
    assert.equal(game.ram.u32(ALLOC.createStage + ALLOC.idOff), expectedId);
    assert.equal(objectById(game.ram, expectedId), null,
      'request 4 stages the object before the next commit pass');

    game.step(0xffff);
    assert.equal(game.ram.u16(ALLOC.createSp), 0);
    const actor = objectById(game.ram, expectedId);
    assert.notEqual(actor, null);
    assert.equal(game.ram.u16(actor), 0x8003);
    assert.equal(game.ram.u8(actor + 0x03), 1);
    assert.equal(game.ram.u8(actor + 0x07), 1);
    assert.equal(game.ram.u16(RAM.player2 + P.state), 0x8000);
    assert.equal(game.ram.u16(RAM.player2 + P.posY), 0x1000);
    assert.equal(game.ram.u16(RAM.player2 + P.posX), 0x2a00);
    assert.equal(game.ram.u8(RAM.player2 + P.speedIdx), 19);
    assert.equal(game.ram.u8(RAM.player2 + P.laserFloor), 15);
    assert.equal(game.ram.u8(RAM.player2 + P.baseSpeed), 19);
    assert.equal(game.ram.u8(RAM.player2 + P.invuln), 0xf0);
    assert.equal(game.ram.u8(RAM.player2 + P.playerIdx), 1);
    assert.equal(game.ram.u16(RAM.player2 + P.shipSel), 2);
    assert.equal(game.ram.u16(RAM.player2 + P.optFormation), 6);

    const p1PoolBefore = game.ram.b.slice(
      SHOT.p1Table - MACHINE.ramBase,
      SHOT.p1Table - MACHINE.ramBase + SHOT.slots * SHOT.stride,
    );
    const input = portWordFromPlayerBits([], [BIT.right, BIT.b1]);
    assert.equal(input, 0xcfff);
    game.step(input);

    assert.equal(game.ram.u16(RAM.p1raw), 0x1800);
    assert.equal(game.ram.u16(RAM.p1edge), 0x1800);
    assert.equal(game.ram.u16(RAM.p1prev), 0x1800);
    assert.equal(game.ram.u16(RAM.p2raw), 0x7f98);
    assert.equal(game.ram.u16(RAM.p2edge), 0x0018);
    assert.equal(game.ram.u16(RAM.p2prev), 0x7f98);
    assert.equal(game.ram.u8(RAM.player1 + P.dirByte), 0);
    assert.equal(game.ram.u8(RAM.player1 + P.btnByte), 0);
    assert.equal(game.ram.u8(RAM.player2 + P.dirByte), 0x98);
    assert.equal(game.ram.u8(RAM.player2 + P.btnByte), 0x18);
    assert.equal(game.ram.u16(RAM.player1 + P.posY), 0x1179);
    assert.equal(game.ram.u16(RAM.player1 + P.posX), 0x14c0);
    assert.equal(game.ram.u16(RAM.player2 + P.posY), 0x1000);
    assert.equal(game.ram.u16(RAM.player2 + P.posX), 0x2a8d);
    assert.equal(game.ram.u16(RAM.player2 + P.velY), 0);
    assert.equal(game.ram.u16(RAM.player2 + P.velX), 0x008d);

    assert.deepEqual(game.ram.b.slice(
      SHOT.p1Table - MACHINE.ramBase,
      SHOT.p1Table - MACHINE.ramBase + SHOT.slots * SHOT.stride,
    ), p1PoolBefore, 'P2 firing leaves the complete P1 shot pool byte-exact');
    assert.deepEqual(liveRecords(game.ram, SHOT.p1Table), []);
    assert.deepEqual(liveRecords(game.ram, SHOT.p2Table), [0x810ed2, 0x810f02]);
  });

test('W601 start page restores, scopes, preserves, and serializes explicit P2 selection', () => {
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  assert.match(start, /id="join-p2"/);
  assert.match(start, /data-auth-p2-ship="0"/);
  assert.match(start, /data-auth-p2-ship="2"/);
  assert.match(start, /data-auth-p2-style="2"/);
  assert.match(start, /data-auth-p2-style="4"/);
  assert.match(start, /data-auth-p2-style="6"/);
  assert.match(start, /explicitP2Joined = hasOwn\(overrides, 'p2'\)/,
    'the query restores explicit P2 separately from derived formation state');
  assert.match(start,
    /\.\.\.\(explicitP2Joined\s*\? \{ p2: \{ ship: authenticP2Ship, style: authenticP2Style \} \}\s*: \{\}\)/,
    'ordinary launches serialize the complete explicit P2 pair');
  const clear = start.slice(start.indexOf("document.getElementById('clear').addEventListener"),
    start.indexOf("document.getElementById('games').addEventListener"));
  assert.match(clear, /formationActive = false/);
  assert.doesNotMatch(clear, /explicitP2Joined\s*=/,
    'CLEAR drops any formation-derived P2 without erasing an explicit join');
});
