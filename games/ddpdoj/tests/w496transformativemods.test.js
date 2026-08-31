// W496: Boss Rush and Stage Remix through the authentic install and advance seams.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Game } from '../src/main.js';
import { MACHINE } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { SPAWN, STAGE, walkScriptLoop } from '../src/spawn.js';
import { notStarted28B5A8 } from '../src/type5.js';
import {
  SE, rebuildWorld25FD38, runStageAdvance242952,
} from '../src/stageend.js';
import {
  MODS, MOD_IDS, MOD_RAM, createModState, modGameOptions, replayPolicy,
  resolveLoadout,
} from '../src/mods.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);
const stateOf = (...ids) => createModState(resolveLoadout(ids));

function win(base, len) {
  return { base, len, bytes: new Uint8Array(len) };
}

function put16(window, addr, value) {
  const offset = addr - window.base;
  window.bytes[offset] = value >>> 8;
  window.bytes[offset + 1] = value & 0xff;
}

function put32(window, addr, value) {
  put16(window, addr, value >>> 16);
  put16(window, addr + 2, value);
}

function rom(...windows) {
  return new RomWindows({
    windows: windows.map((window) => ({
      base: `$${window.base.toString(16)}`,
      len: window.len,
      why: 'W496 synthetic stage script',
      hex: Buffer.from(window.bytes).toString('hex'),
    })),
  });
}

const SCRIPT_A = 0x300000;
const SCRIPT_B = 0x300100;

function scriptWindow(base, triggers, afterSentinel) {
  const window = win(base, (triggers.length + 3) * 8);
  for (let i = 0; i < triggers.length; i++) {
    put16(window, base + i * 8, triggers[i]);
    window.bytes[i * 8 + 4] = i + 1;
  }
  put16(window, base + triggers.length * 8, 0xffff);
  put16(window, base + (triggers.length + 1) * 8, afterSentinel);
  put16(window, base + (triggers.length + 2) * 8, 0xffff);
  return window;
}

function syntheticStageRom() {
  const stageTable = win(SPAWN.STAGE_TAB, STAGE.stride * 2);
  for (const [stage, script] of [[0, SCRIPT_A], [1, SCRIPT_B]]) {
    const entry = SPAWN.STAGE_TAB + stage * STAGE.stride;
    put32(stageTable, entry + STAGE.script, script);
    put32(stageTable, entry + STAGE.aux, 0x310000 + stage * 0x100);
    put32(stageTable, entry + STAGE.res, 0x320000 + stage * 0x100);
  }
  const dispatch = win(SE.dispatch, 0x20);
  put16(dispatch, SE.dispatch + 1 * 8 + 4, 0x000a);
  return rom(
    stageTable,
    dispatch,
    scriptWindow(SCRIPT_A, [0x10, 0x80, 0x88, 0x90], 0x500),
    scriptWindow(SCRIPT_B, [0x20, 0x120, 0x128, 0x130], 0x700),
  );
}

function gameWithOptions(options) {
  return new Game(new Uint8Array(MACHINE.ramSize), TABLES, {
    palCatchUp: false,
    ...(options ?? {}),
  });
}

const CALLBACKS = ['stageScriptInstallHook', 'stageAdvanceTransform'];

function assertNoW496Callbacks(game, label) {
  for (const callback of CALLBACKS) {
    assert.equal(Object.hasOwn(game, callback), false, `${label} has no ${callback}`);
  }
}

test('W496 catalogue reaches 37 and selection alone installs replay-blocking callbacks', () => {
  assert.equal(MOD_IDS.length, 37);
  for (const id of ['boss-rush', 'stage-remix']) {
    assert.equal(MODS[id].category, 'challenge');
    assert.equal(MODS[id].replaySafe, false);
    assert.ok(MODS[id].name && MODS[id].blurb && MODS[id].effects.length);
  }

  const state = stateOf('boss-rush', 'stage-remix');
  assert.equal(state.loadout.sim.bossRush, true);
  assert.equal(state.loadout.sim.stageRemix, true);
  assert.deepEqual(replayPolicy(state).blocking, ['boss-rush', 'stage-remix']);
  const options = modGameOptions(state);
  for (const callback of CALLBACKS) assert.equal(typeof options[callback], 'function');

  const selected = gameWithOptions(options);
  for (const callback of CALLBACKS) assert.equal(typeof selected[callback], 'function');
  for (const callback of CALLBACKS) {
    assert.throws(() => gameWithOptions({ [callback]: 1 }),
      new RegExp(`${callback} must be a function`));
  }

  const empty = createModState(resolveLoadout([]));
  const unknown = createModState(resolveLoadout(['unknown-only']));
  assert.equal(empty, null);
  assert.equal(unknown, null);
  assert.equal(modGameOptions(empty), null);
  assert.equal(modGameOptions(unknown), null);
  const invincibility = modGameOptions(stateOf('invincibility'));
  assert.deepEqual(Object.keys(invincibility), ['enemyBulletCollisionFilter']);
  assertNoW496Callbacks(gameWithOptions(invincibility), 'Invincibility Game');

  assertNoW496Callbacks(new Game(new Uint8Array(MACHINE.ramSize), TABLES,
    { palCatchUp: false }), 'direct Game');
  assertNoW496Callbacks(gameWithOptions(modGameOptions(empty)), 'empty loadout');
  assertNoW496Callbacks(gameWithOptions(modGameOptions(unknown)), 'unknown-only loadout');
  assertNoW496Callbacks(gameWithOptions(modGameOptions(
    createModState(resolveLoadout([])))), 'Original Game');
  assertNoW496Callbacks(new Game(new Uint8Array(MACHINE.ramSize), TABLES, {
    palCatchUp: false,
    logicFrame: 100,
    videoFrame: 200,
    ...(modGameOptions(null) ?? {}),
  }), 'replay-created Game');
  assertNoW496Callbacks(gameWithOptions(null), 'later vanilla Game');
});

test('W496 Boss Rush scans each installed synthetic script and never rewinds on ordinary walks', () => {
  const cartridge = syntheticStageRom();
  const selectedHook = modGameOptions(stateOf('boss-rush')).stageScriptInstallHook;
  let installations = 0;
  const ctx = {
    rom: cartridge,
    unportedLog: { note() {} },
    stageScriptInstallHook(...args) {
      installations++;
      selectedHook(...args);
    },
  };
  const ram = new Ram();
  ram.setU16(SE.stageX4, 0);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x4444);

  notStarted28B5A8(ram, cartridge, ctx);
  assert.equal(installations, 1, 'the initial type-5 reset applies once');
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), SCRIPT_A + 8);
  assert.equal(ram.u16(SPAWN.DISTANCE_CLOCK), 0x80,
    'the post-sentinel $500 record cannot influence the threshold');

  const retainedA = [];
  for (const clock of [0x80, 0x88, 0x90]) {
    ram.setU16(SPAWN.DISTANCE_CLOCK, clock);
    walkScriptLoop(ram, cartridge, (cursor) => retainedA.push(cursor));
  }
  assert.deepEqual(retainedA, [SCRIPT_A + 8, SCRIPT_A + 16, SCRIPT_A + 24]);
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), SCRIPT_A + 32, 'the cursor stops at $FFFF');
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0xa0);
  walkScriptLoop(ram, cartridge, () => assert.fail('sentinel walk dispatched'));
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), SCRIPT_A + 32);
  assert.equal(installations, 1, 'ordinary script walks do not reapply or rewind');

  ram.setU16(SE.stageX4, 4);
  rebuildWorld25FD38(ram, ctx);
  assert.equal(installations, 2, 'the later authentic rebuild applies once again');
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), SCRIPT_B + 8);
  assert.equal(ram.u16(SPAWN.DISTANCE_CLOCK), 0x120,
    'the second script derives its own final-trigger threshold');

  const retainedB = [];
  for (const clock of [0x120, 0x128, 0x130]) {
    ram.setU16(SPAWN.DISTANCE_CLOCK, clock);
    walkScriptLoop(ram, cartridge, (cursor) => retainedB.push(cursor));
  }
  assert.deepEqual(retainedB, [SCRIPT_B + 8, SCRIPT_B + 16, SCRIPT_B + 24]);
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), SCRIPT_B + 32);
  assert.equal(installations, 2);
});

test('W496 vanilla type-5 and rebuild installs retain exact authentic cursor and clock values', () => {
  const cartridge = syntheticStageRom();
  const ctx = { rom: cartridge, unportedLog: { note() {} } };
  const ram = new Ram();
  ram.setU16(SE.stageX4, 0);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x4567);
  notStarted28B5A8(ram, cartridge, ctx);
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), SCRIPT_A);
  assert.equal(ram.u16(SPAWN.DISTANCE_CLOCK), 0x4567,
    'the authentic initial install does not write the distance clock');

  ram.setU16(SE.stageX4, 4);
  rebuildWorld25FD38(ram, ctx);
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), SCRIPT_B);
  assert.equal(ram.u16(SPAWN.DISTANCE_CLOCK), 0,
    'the authentic rebuild leaves the preceding $25FD24 clock wipe exact');
});

function advance(input, transform = null, loop = 0) {
  const ram = new Ram();
  ram.setU16(SE.stage, input - 1);
  ram.setU16(MOD_RAM.loopCounter, loop);
  const ctx = transform ? { stageAdvanceTransform: transform } : {};
  const result = runStageAdvance242952(ram, ROM, ctx);
  return {
    d7: result.d7,
    staged: ram.u16(ALLOC.createStage + 0x04),
    current: ram.u16(SE.stage),
  };
}

test('W496 Stage Remix transforms the complete authentic type-6 mapping and preserves vanilla', () => {
  const transform = modGameOptions(stateOf('stage-remix')).stageAdvanceTransform;
  const mapping = [[1, 2], [3, 1], [2, 3], [4, 4], [5, 5]];
  for (const [input, expected] of mapping) {
    const remixed = advance(input, transform);
    assert.deepEqual([remixed.d7, remixed.staged], [expected, expected],
      `remixed type-6 value ${input}`);
    assert.equal(remixed.current, input - 1, 'the advance tail does not rewrite the current stage');

    const vanilla = advance(input);
    assert.deepEqual([vanilla.d7, vanilla.staged], [input, input],
      `vanilla type-6 value ${input}`);
  }

  assert.deepEqual(advance(5, transform), { d7: 5, staged: 5, current: 4 },
    'stage 5 still enters the authentic ending selector');
  assert.equal(advance(1, transform, 1).d7, 2,
    'the same Stage 1 to Stage 3 route begins naturally in loop 2');
});
