// W622: a natural final-life death accepts a real credited continue and returns to gameplay.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { ALLOC, resolveHandle241298 } from '../src/objalloc.js';
import { TALLY } from '../src/tally.js';
import { SCREEN11 } from '../src/tallyscreen.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const SKIP = existsSync(TABLES) ? false : 'the production cartridge tables are absent; skip, not pass';
const NO_PLAYER = 0xffff;
const COIN1 = (0xffff & ~(1 << COIN_BITS.COIN1)) & 0xffff;
const START = portWordFromBits([BIT.start]);
const BUTTON1 = portWordFromBits([BIT.b1]);
const MASH = portWordFromBits([
  BIT.up, BIT.down, BIT.left, BIT.right, BIT.b1, BIT.b2, BIT.b3, BIT.start,
]);

function active(game) {
  const out = [];
  for (let i = 0; i < ALLOC.slots; i++) {
    const rec = ALLOC.table + i * ALLOC.stride;
    const type = game.ram.u16(rec) & 0x7fff;
    if (type !== 0) out.push({ rec, type });
  }
  return out;
}

function run(game, frames, coin = COIN.idle, player = NO_PLAYER) {
  game.coinPort = coin;
  for (let i = 0; i < frames; i++) game.step(player);
}

function bootToGameplay() {
  const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
  const game = new Game(new Uint8Array(0x20000), tables, { palCatchUp: false });
  game.boot();
  game.ram.setU8(0x803957, 1);                     // one coin advances the configured credit meter
  game.ram.setU8(0x803809, 1);                     // operator DIP enables the continue countdown
  run(game, 20);
  run(game, 380);
  run(game, 20, COIN1);
  run(game, 10);
  run(game, 20, COIN.idle, START);
  assert.equal(game.ram.u16(0x812e56), 0x000e, 'the real coin and START gate reached gameplay');
  assert.equal(game.ram.u8(0x80395a), 0, 'the opening START spent the first credit');
  return game;
}

test('W622 natural death accepts a credited continue and resumes the same run', { skip: SKIP }, () => {
  const game = bootToGameplay();

  let deathFrame = 0;
  for (let frame = 1; frame <= 5000; frame++) {
    game.step(NO_PLAYER);
    if (active(game).some((o) => o.type === 0x0d)) {
      deathFrame = frame;
      break;
    }
  }
  assert.ok(deathFrame > 0, 'natural hits exhausted every reserve life and created type $D');

  const screenId = game.ram.u32(TALLY.side0 + 0x1c);
  let screen = resolveHandle241298(game.ram, screenId);
  assert.equal(screen.found, true, 'bonus line 2 stored a resolvable allocator ID for type $B');
  assert.equal(game.ram.u16(screen.rec) & 0x7fff, 0x0b, 'the resolved object is the tally screen');
  assert.equal(game.ram.u8(screen.rec + SCREEN11.phase), 0, 'the continue choice starts in phase 0');

  run(game, 20, COIN1);
  run(game, 10);
  assert.equal(game.ram.u8(0x80395a), 1, 'the real coin debounce credited P1 during countdown');

  run(game, 1, COIN.idle, START);
  run(game, 1);
  screen = resolveHandle241298(game.ram, screenId);
  assert.equal(screen.found, true, 'the accepted screen remains live for the two cartridge cursors');
  assert.equal(game.ram.u8(0x80395a), 0, 'START spent exactly one continue credit');
  assert.equal(game.ram.u8(screen.rec + SCREEN11.phase), 1, 'START reached the X cursor');

  run(game, 1, COIN.idle, BUTTON1);
  run(game, 1);
  screen = resolveHandle241298(game.ram, screenId);
  assert.equal(game.ram.u8(screen.rec + SCREEN11.phase), 2, 'button 1 confirmed X and reached Y');

  run(game, 1, COIN.idle, BUTTON1);
  run(game, 2);
  assert.equal(resolveHandle241298(game.ram, screenId).found, false,
    'Y confirmation retired the exact continue screen by allocator ID');
  assert.equal(active(game).some((o) => o.type === 0x0d), false, 'type $D retired with it');
  assert.ok(active(game).some((o) => o.type === 0x02), 'the cartridge respawned P1 into gameplay');
  assert.notEqual(game.ram.u16(0x8130be), 0xffff, 'the continued run owns a live reserve counter');
});

test('W622 button mashing cannot skip an uncredited timeout, Game Over, or cabinet restart',
  { skip: SKIP }, () => {
    const game = bootToGameplay();

    let countdownFrame = 0;
    for (let frame = 1; frame <= 5000; frame++) {
      game.step(NO_PLAYER);
      if (active(game).some((o) => o.type === 0x0d)) {
        countdownFrame = frame;
        break;
      }
    }
    assert.ok(countdownFrame > 0, 'natural final-life death reached the continue countdown');
    assert.equal(game.ram.u8(0x80395a), 0, 'the first run has no credit left to accept START');

    const screenId = game.ram.u32(TALLY.side0 + 0x1c);
    let firstE = 0;
    let firstC = 0;
    let firstEight = 0;
    let mashFrames = 0;
    for (let frame = 1; frame <= 2000; frame++) {
      const player = (frame & 1) === 0 ? MASH : NO_PLAYER;
      run(game, 1, COIN.idle, player);
      mashFrames++;
      const live = active(game);
      const types = new Set(live.map((o) => o.type));
      const screen = resolveHandle241298(game.ram, screenId);
      if (screen.found) {
        assert.equal(game.ram.u8(screen.rec + SCREEN11.phase), 0,
          'direction, three fire buttons, and START cannot advance an uncredited choice');
      }
      if (!firstE && types.has(0x0e)) firstE = frame;
      if (!firstC && types.has(0x0c)) firstC = frame;
      if (firstC && !firstEight && types.has(0x08)) {
        firstEight = frame;
        break;
      }
    }

    assert.ok(mashFrames >= 300,
      `${mashFrames} alternating press/release frames exercised every direction, fire, and START`);
    assert.ok(firstE > 0, 'the nine-second continue choice ran out into visible Game Over');
    assert.ok(firstC > firstE, 'Game Over handed to the score/name-entry object');
    assert.ok(firstC - firstE >= 300,
      'button mashing did not shorten the cartridge Game Over screen timer');
    assert.ok(firstEight > firstC, 'name-entry skip returned to the cartridge attract sequencer');
    assert.equal(game.ram.u8(0x80395a), 0, 'mashing never invented a credit');

    run(game, 20, COIN1);
    run(game, 10);
    assert.equal(game.ram.u8(0x80395a), 1, 'a real post-Game-Over coin credited the cabinet');
    run(game, 20, COIN.idle, START);
    assert.equal(game.ram.u16(0x812e56), 0x000e,
      'START began another playable run on the same Game without a reload');
  });
