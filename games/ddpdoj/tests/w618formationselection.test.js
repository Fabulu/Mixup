// W618: selectable authentic ship/style roster for every P1-owned formation member.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { P, RAM } from '../src/machine.js';
import { gamepadMenuState } from '../src/web/menu-gamepad.js';
import {
  FORMATION_MODE, FORMATION_THREE_MODE,
  beginFormationCreditedRun, createFormationState, defaultFormationRoster,
  formationRosterToHash, hashToFormationRoster, initializeFormation,
  resolveFormationRoster,
} from '../src/formation.js';

function fakeGame() {
  const ram = new Ram();
  ram.setU16(RAM.player1 + P.state, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  ram.setU8(RAM.player1 + P.speedIdx, 7);
  return {
    ram,
    rom: {
      u8() { return 0; },
      u16() { return 0; },
      u32() { return 0; },
    },
    tables: {
      angleFor() { return 0xff; },
      vector() { return { dy: 0, dx: 0 }; },
    },
  };
}

test('W618 standard D-pad, stick, A, and Start map to setup actions', () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[0] = { pressed: true, value: 1 };
  buttons[9] = { pressed: true, value: 1 };
  buttons[12] = { pressed: true, value: 1 };
  buttons[15] = { pressed: true, value: 1 };
  assert.deepEqual(gamepadMenuState({ axes: [0, 0], buttons }), {
    up: true, down: false, left: false, right: true, accept: true, start: true,
  });
  assert.deepEqual(gamepadMenuState({ axes: [-0.8, 0.9], buttons: [] }), {
    up: false, down: true, left: true, right: false, accept: false, start: false,
  });
  assert.deepEqual(gamepadMenuState(null), {
    up: false, down: false, left: false, right: false, accept: false, start: false,
  });
});

test('W618 defaults preserve the exact shipped two- and three-ship rosters', () => {
  assert.deepEqual(defaultFormationRoster(FORMATION_MODE), [
    { ship: 0, style: 2 },
    { ship: 2, style: 2 },
  ]);
  assert.deepEqual(defaultFormationRoster(FORMATION_THREE_MODE), [
    { ship: 0, style: 2 },
    { ship: 0, style: 6 },
    { ship: 2, style: 4 },
  ]);
  assert.deepEqual(resolveFormationRoster(FORMATION_MODE),
    defaultFormationRoster(FORMATION_MODE));
  assert.equal(defaultFormationRoster(null), null);
  assert.equal(resolveFormationRoster('unknown'), null);
});

test('W618 every member accepts every authentic ship and style pair', () => {
  for (const mode of [FORMATION_MODE, FORMATION_THREE_MODE]) {
    for (let member = 0; member < mode.companions.length + 1; member++) {
      for (const ship of [0, 2]) {
        for (const style of [2, 4, 6]) {
          const roster = defaultFormationRoster(mode).map((entry) => ({ ...entry }));
          roster[member] = { ship, style };
          assert.deepEqual(resolveFormationRoster(mode, roster), roster);
        }
      }
    }
  }
});

test('W618 malformed and partial rosters fail closed', () => {
  for (const roster of [
    [],
    [{ ship: 0, style: 2 }],
    [{ ship: 0, style: 2 }, { ship: 2, style: 2 }, { ship: 0, style: 6 }],
    [{ ship: 1, style: 2 }, { ship: 2, style: 2 }],
    [{ ship: 0, style: 3 }, { ship: 2, style: 2 }],
    [{ ship: 0, style: 2 }, null],
  ]) assert.equal(resolveFormationRoster(FORMATION_MODE, roster), null);
  assert.throws(() => createFormationState(FORMATION_MODE, []), /invalid formation roster/);
});

test('W618 custom roster hashes round-trip and defaults stay byte-compatible', () => {
  const two = [{ ship: 2, style: 6 }, { ship: 0, style: 4 }];
  const three = [
    { ship: 2, style: 4 },
    { ship: 2, style: 2 },
    { ship: 0, style: 6 },
  ];
  assert.equal(formationRosterToHash(FORMATION_MODE, defaultFormationRoster(FORMATION_MODE)), '');
  assert.equal(formationRosterToHash(FORMATION_MODE, two), 'roster=2-6.0-4');
  assert.deepEqual(hashToFormationRoster(
    '#formation=fly-both-ships-side-by-side&roster=2-6.0-4', FORMATION_MODE), two);
  assert.equal(formationRosterToHash(FORMATION_THREE_MODE, three),
    'roster=2-4.2-2.0-6');
  assert.deepEqual(hashToFormationRoster(
    '#formation=all-three-pilots-each-piloting-a-ship&roster=2-4.2-2.0-6',
    FORMATION_THREE_MODE), three);
  assert.deepEqual(hashToFormationRoster(
    '#formation=fly-both-ships-side-by-side', FORMATION_MODE),
  defaultFormationRoster(FORMATION_MODE));
  for (const hash of [
    '#formation=fly-both-ships-side-by-side&roster=',
    '#formation=fly-both-ships-side-by-side&roster=2-6',
    '#formation=fly-both-ships-side-by-side&roster=2-6.0-4.0-2',
    '#formation=fly-both-ships-side-by-side&roster=1-6.0-4',
    '#formation=fly-both-ships-side-by-side&roster=2-6.0-4&roster=0-2.2-2',
  ]) assert.equal(hashToFormationRoster(hash, FORMATION_MODE), null);
});

test('W618 selected companion pairs reach isolated actor bindings', () => {
  const roster = [
    { ship: 2, style: 6 },
    { ship: 2, style: 4 },
    { ship: 0, style: 2 },
  ];
  const state = createFormationState(FORMATION_THREE_MODE, roster);
  const game = fakeGame();
  initializeFormation(state, game);
  assert.deepEqual(state.roster, roster);
  assert.deepEqual(state.foundation.companions.map((companion) =>
    companion.binding.selection), roster.slice(1));
  assert.deepEqual(state.foundation.companions.map((companion) =>
    companion.binding.renderVariant), [1, 0]);
});

test('W618 credited handoff applies the selected lead and retains companion roster', () => {
  const roster = [
    { ship: 2, style: 4 },
    { ship: 0, style: 6 },
  ];
  const state = createFormationState(FORMATION_MODE, roster);
  const game = fakeGame();
  assert.strictEqual(beginFormationCreditedRun(state, game), state);
  assert.equal(game.ram.u16(0x813084), 2);
  assert.equal(game.ram.u16(0x813088), 4);
  assert.equal(game.ram.u16(RAM.player1 + P.shipSel), 2);
  assert.equal(game.ram.u16(RAM.player1 + P.optFormation), 4);
  assert.deepEqual(state.foundation.companions[0].binding.selection,
    { ship: 0, style: 6 });
});
