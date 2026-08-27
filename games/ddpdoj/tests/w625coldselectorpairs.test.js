// W625: all six Black Label choices through the production cold-cabinet selector.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALLOC } from '../src/objalloc.js';
import { COIN } from '../src/isr.js';
import { MACHINE, RAM, P, OPT } from '../src/machine.js';
import { SCREEN17 } from '../src/objslot17.js';
import { SCREEN8 } from '../src/objslot8.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  CONTROLS, clearCoin, clearTouch, setCoinKey, setTouchButton, setTouchDirections,
} from '../src/web/input.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ASSETS = path.join(ROOT, 'assets');
const ORACLE = path.join(ROOT, 'tools/oracle');
const REQUIRED_FILES = [
  path.join(ROOT, 'rip/sound/maincpu.bin'),
  path.join(ROOT, 'rip/port/player.tables.json'),
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'capture.bin.gz'),
  path.join(ASSETS, 'seed.bin.gz'),
];
const HAVE = REQUIRED_FILES.every(existsSync);
const SKIP = HAVE ? false : 'exact local Black Label production bundle absent; this is a skip, not a pass';
const W592 = JSON.parse(readFileSync(path.join(ORACLE, 'w592selectorpairgate.board.json'), 'utf8'));
const W593 = JSON.parse(readFileSync(path.join(ORACLE, 'w593-selector-effects.json'), 'utf8'));
const W594 = JSON.parse(readFileSync(path.join(ORACLE, 'w594-selector-causality.json'), 'utf8'));
const PAIRS = [[0, 2], [0, 4], [0, 6], [2, 2], [2, 4], [2, 6]];
const W593_PAIRS = new Map(W593.pairs.map((pair) => [pair.key, pair]));
const W594_PAIRS = new Map(W594.pairs.map((pair) => [pair.key, pair]));

let bundlePromise;
function exactBundle() {
  bundlePromise ??= loadBundle(async (name) => {
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}

function fakeCanvas() {
  const ctx = {
    createImageData: (width, height) => ({
      data: new Uint8ClampedArray(width * height * 4), width, height,
    }),
    putImageData() {},
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

function activeTypes(game) {
  const types = [];
  for (let i = 0; i < ALLOC.slots; i++) {
    const word = game.ram.u16(ALLOC.table + i * ALLOC.stride);
    if (word !== 0) types.push(word & 0xff);
  }
  return types;
}

function step(demo, frames = 1) {
  for (let i = 0; i < frames; i++) demo.step();
}

function until(demo, predicate, limit, label) {
  for (let frames = 1; frames <= limit; frames++) {
    demo.step();
    if (predicate()) return frames;
  }
  assert.fail(`${label} did not arrive within ${limit} frames at LF${demo.game.logicFrame}`);
}

function edgePulse(demo, kind, name, bit) {
  if (kind === 'button') setTouchButton(name, true);
  else setTouchDirections(1 << bit);
  let sampled = false;
  const mirrors = [];
  for (let frames = 0; frames < 4; frames++) {
    demo.step();
    const raw = demo.game.ram.u16(RAM.p1raw);
    const edge = demo.game.ram.u16(RAM.p1edge);
    mirrors.push(`${raw.toString(16)}/${edge.toString(16)}`);
    if ((raw & (1 << bit)) !== 0 && (edge & (1 << bit)) !== 0) {
      sampled = true;
      break;
    }
  }
  assert.equal(sampled, true,
    `${name} press did not reach both cartridge input mailboxes: ${mirrors.join(',')}`);
  if (kind === 'button') setTouchButton(name, false);
  else setTouchDirections(0);
  until(demo, () => (demo.game.ram.u16(RAM.p1raw) & (1 << bit)) === 0,
    4, `${name} release mailbox`);
}

function selectorFacts(game) {
  const { ram } = game;
  return {
    mailboxShip: ram.u16(0x813084),
    mailboxStyle: ram.u16(0x813088),
    savedShipCursor: ram.u8(0x813008),
    savedStyleCursor: ram.u8(0x813009),
    cachedShip: ram.u16(RAM.player1 + P.shipSel),
    cachedStyle: ram.u16(RAM.player1 + P.optFormation),
    bombPlus24: ram.u8(RAM.player1 + 0x24),
    bombPlus25: ram.u8(RAM.player1 + 0x25),
    initialImageHighWord: ram.u16(RAM.player1 + P.animA),
    hitboxHighWord: ram.u16(RAM.player1 + P.hitYPlus),
    speedIndex: ram.u8(RAM.player1 + P.speedIdx),
    laserFloor: ram.u8(RAM.player1 + P.laserFloor),
    baseSpeed: ram.u8(RAM.player1 + P.baseSpeed),
    powerCursorE4: ram.u32(0x8127e4),
    powerCursorE8: ram.u32(0x8127e8),
    p1State: ram.u16(RAM.player1 + P.state),
  };
}

function hashRam(ram, start, length) {
  const bytes = Uint8Array.from({ length }, (_, i) => ram.u8(start + i));
  return createHash('sha256').update(bytes).digest('hex');
}

function directShipRead(pair) {
  const reads = pair.selectorReads.filter((fact) => fact.ancestry.length > 0);
  assert.equal(reads.length, 1, `${pair.key} W594 direct selector reader count`);
  return Number.parseInt(reads[0].value, 16);
}

function openSelector(demo) {
  step(demo, 305);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0);
  assert.equal(demo.game.ram.u16(SCREEN8.state), 2);

  setCoinKey('COIN1', true);
  step(demo, 30);
  setCoinKey('COIN1', false);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1,
    'the production coin debounce did not credit P1');

  setTouchButton('START', true);
  step(demo, 12);
  setTouchButton('START', false);
  step(demo, 2);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0,
    'START did not spend exactly one credit');
  assert.ok(activeTypes(demo.game).includes(0x09),
    'credited START did not open the cartridge type-$9 selector');
}

function choosePair(demo, ship, style) {
  const record = SCREEN17.recs;
  until(demo, () => demo.game.ram.u8(record) === 1
    && demo.game.ram.u8(record + SCREEN17.phaseAt) === 1,
  30, 'ship cursor phase');

  if (ship === 2) edgePulse(demo, 'direction', 'RIGHT', CONTROLS.RIGHT);
  edgePulse(demo, 'button', 'SHOT', CONTROLS.SHOT);

  until(demo, () => demo.game.ram.u8(record + SCREEN17.phaseAt) === 4,
    30, 'style cursor phase');
  for (let cursor = 0; cursor < (style - 2) / 2; cursor++) {
    edgePulse(demo, 'direction', 'RIGHT', CONTROLS.RIGHT);
  }
  edgePulse(demo, 'button', 'SHOT', CONTROLS.SHOT);
}

test('W625 all six production cold-cabinet choices reach matching live gameplay',
  { skip: SKIP, timeout: 240_000 }, async (t) => {
    const exact = await exactBundle();
    clearCoin();
    clearTouch();
    t.after(() => { clearCoin(); clearTouch(); });

    const observed = [];
    for (const [ship, style] of PAIRS) {
      clearCoin();
      clearTouch();
      const demo = new Demo(fakeCanvas(), exact, MACHINE.refreshHz);
      const { game } = demo;
      const commaKey = `${ship},${style}`;
      const slashKey = `${ship}/${style}`;
      const board = W592.pairs[commaKey];
      const effects = W593_PAIRS.get(slashKey);
      const causality = W594_PAIRS.get(slashKey);

      assert.ok(board && effects && causality, `${slashKey} is missing an existing oracle row`);
      assert.equal(MACHINE.set, 'ddpdojblk');
      assert.equal(MACHINE.build, 'B');
      assert.equal(demo.coldBoot, true);
      assert.equal(demo.seedLf, 0);
      assert.equal(game.logicFrame, 0);
      assert.equal(demo.authentic, undefined, 'applyAuthenticSelection was not used');
      assert.equal(demo.rung, null, 'no LF2000 seed or checkpoint was used');
      assert.equal(demo.formation, null);

      openSelector(demo);
      choosePair(demo, ship, style);

      until(demo, () => activeTypes(game).includes(0x09)
        && game.ram.u16(0x813084) === ship
        && game.ram.u16(0x813088) === style
        && game.ram.u8(0x813008) === ship / 2
        && game.ram.u8(0x813009) === (style - 2) / 2,
      1200, `${slashKey} selector commit`);
      const selectorCommitLf = game.logicFrame;
      assert.deepEqual(selectorFacts(game), board.selectorCommit,
        `${slashKey} real type-$9 commit`);

      until(demo, () => (game.ram.u16(RAM.player1 + P.state) & 0x8000) !== 0,
        800, `${slashKey} player creation`);
      const playerCreatedLf = game.logicFrame;
      assert.deepEqual(selectorFacts(game), board.playerCreated,
        `${slashKey} player creation facts`);
      assert.equal(game.ram.u16(RAM.player1 + P.shipSel), directShipRead(causality),
        `${slashKey} cached ship differs from W594's direct reader value`);

      until(demo, () => {
        const live = activeTypes(game);
        return live.includes(0x02) && live.includes(0x0b) && !live.includes(0x09);
      }, 30, `${slashKey} gameplay handoff`);
      const types = activeTypes(game);
      const handoffLf = game.logicFrame;
      assert.ok(types.includes(0x02), `${slashKey} did not create the P1 gameplay object`);
      assert.ok(types.includes(0x0b), `${slashKey} did not create the stage object`);
      assert.equal(types.includes(0x09), false, `${slashKey} left the selector alive`);

      assert.ok(game.logicFrame <= playerCreatedLf + 32,
        `${slashKey} selector retirement exceeded the W592 snapshot interval`);
      step(demo, playerCreatedLf + 32 - game.logicFrame);
      assert.deepEqual(selectorFacts(game), board.liveLf2000,
        `${slashKey} live player facts after the W592 creation-to-snapshot interval`);
      assert.equal(game.ram.u8(RAM.player1 + P.invuln), effects.initial.p1Invulnerability,
        `${slashKey} natural invulnerability countdown`);
      assert.equal(hashRam(game.ram, RAM.p1Options, OPT.stride), effects.initial.optionSha256,
        `${slashKey} W593 option and weapon history`);

      demo.step();
      setTouchDirections(1 << CONTROLS.RIGHT);
      demo.step();
      setTouchDirections(0);
      const movement = effects.events[2002].movement;
      assert.deepEqual([
        game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX),
        game.ram.i16(RAM.player1 + P.velY), game.ram.i16(RAM.player1 + P.velX),
        game.ram.u32(RAM.player1 + P.animA),
      ], [
        movement.posLong, movement.posShort, movement.velLong, movement.velShort,
        Number(movement.image),
      ], `${slashKey} W593 first live movement and fighter art`);

      observed.push({
        pair: slashKey,
        selectorCommitLf,
        playerCreatedLf,
        handoffLf,
        observedLf: game.logicFrame,
        mailboxes: `${game.ram.u16(0x813084)}/${game.ram.u16(0x813088)}`,
        cached: `${game.ram.u16(RAM.player1 + P.shipSel)}/${game.ram.u16(RAM.player1 + P.optFormation)}`,
        art: `$${game.ram.u32(RAM.player1 + P.animA).toString(16).padStart(8, '0')}`,
        bomb: `${game.ram.u8(RAM.player1 + 0x24)}/${game.ram.u8(RAM.player1 + 0x25)}`,
        speedLaser: `${game.ram.u8(RAM.player1 + P.speedIdx)}/${game.ram.u8(RAM.player1 + P.laserFloor)}`,
      });
      clearTouch();
    }

    assert.equal(observed.length, 6);
    for (const state of observed) console.log(`W625 state ${JSON.stringify(state)}`);
  });
