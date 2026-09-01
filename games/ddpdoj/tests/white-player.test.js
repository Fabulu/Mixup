import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WorkBudget } from '../src/budget.js';
import { OBJ, ObjOrder, runObjectDriver } from '../src/objdriver.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram, i16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import {
  WHITE_PLAYER, whiteAutoShot148E5E, whiteShotCadence1491D0,
  whitePlayerP1Tick14889E, whitePlayerP2Tick14891E,
} from '../src/white-player.js';
import { createWhiteStage1PlayerHandlers } from '../src/white-runtime.js';
import { WHITE_SHOT_PRODUCER_RESOURCES } from '../src/white-shots.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const IMAGE = fileURLToPath(new URL('../tools/oracle/out/maincpu.bin', import.meta.url));
const RAM = WHITE_LABEL_PROFILE.ramLayout.addresses;
const P = WHITE_LABEL_PROFILE.ramLayout.playerFields;
const CLAMP = WHITE_LABEL_PROFILE.selectorProfile.clamp;

assert.ok(existsSync(TABLES),
  `${TABLES} missing; run: python games/ddpdoj/tools/export-tables.py`);
const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
const rom = new RomWindows(tables.rom);

function slot(ram, index, marker, { y = 0x2000, x = 0x1800, fresh = true } = {}) {
  const address = OBJ.base + index * OBJ.stride;
  ram.setU8(address + 0x03, fresh ? 0 : 1);
  ram.setU8(address + 0x06, fresh ? 0 : 1);
  ram.setU8(address + 0x07, marker);
  ram.setU16(address + 0x08, y);
  ram.setU16(address + 0x0a, x);
  return address;
}

function configureOwner(ram, side, { ship = 0, style = 2 } = {}) {
  ram.setU16(side === 0 ? WHITE_PLAYER.p1.ship : WHITE_PLAYER.p2.ship, ship);
  ram.setU16(side === 0 ? WHITE_PLAYER.p1.style : WHITE_PLAYER.p2.style, style);
}

function initializedPair() {
  const ram = new Ram();
  configureOwner(ram, 0, { ship: 0, style: 2 });
  configureOwner(ram, 1, { ship: 2, style: 2 });
  const p1slot = slot(ram, 0, 0, { x: 0x1800 });
  const p2slot = slot(ram, 1, 1, { x: 0x2800 });
  whitePlayerP1Tick14889E(ram, rom, p1slot);
  whitePlayerP2Tick14891E(ram, rom, p2slot);
  return { ram, p1slot, p2slot };
}

function movingOwner({
  y, x, direction, side = 0, speed = 22, edge = 0, autoShot = 0, button2Gate = 0,
}) {
  const ram = new Ram();
  const address = slot(ram, 0, side, { y, x, fresh: false });
  const rec = side === 0 ? WHITE_PLAYER.p1.rec : WHITE_PLAYER.p2.rec;
  ram.setU16(rec + P.posY, y);
  ram.setU16(rec + P.posX, x);
  ram.setU8(rec + P.speedIdx, speed);
  ram.setU8(rec + P.baseSpeed, speed);
  ram.setU8(rec + P.invuln, 0xff);
  ram.setU8(WHITE_PLAYER.autoShotSetting, autoShot);
  ram.setU16(WHITE_PLAYER.button2Gate, button2Gate);
  ram.setU16(side === 0 ? RAM.p1raw : RAM.p2raw, direction);
  ram.setU16(side === 0 ? RAM.p1edge : RAM.p2edge, edge);
  const result = side === 0
    ? whitePlayerP1Tick14889E(ram, rom, address)
    : whitePlayerP2Tick14891E(ram, rom, address);
  return { ram, rec, result };
}

function autoShotOwner({
  side = 0, setting = 1, held = 0x40, edge = 0, p3c = 0,
  flags1 = 0, optionFlags = 0x03,
} = {}) {
  const ram = new Ram();
  const address = slot(ram, 0, side, { fresh: false });
  const c = side === 0 ? WHITE_PLAYER.p1 : WHITE_PLAYER.p2;
  ram.setU8(WHITE_PLAYER.autoShotSetting, setting);
  ram.setU8(c.rec + P.dirByte, held);
  ram.setU8(c.rec + P.btnByte, edge);
  ram.setU8(c.rec + 0x3c, p3c);
  ram.setU8(c.rec + P.flags1, flags1);
  ram.setU16(c.rec + 0x20, 0x1357);
  ram.setU16(c.rec + 0x22, 0x2468);
  ram.setU32(c.powerList, 0x10203040);
  ram.setU32(c.powerList + 4, 0x50607080);
  ram.setU8(WHITE_PLAYER.p1.option + P.flags1, optionFlags);
  ram.setU8(WHITE_PLAYER.p2.option + P.flags1, optionFlags);
  const result = whiteAutoShot148E5E(ram, c.rec, address);
  return { ram, rec: c.rec, option: c.option, powerList: c.powerList, result };
}

function cadenceOwner({
  side = 0, state = 0, flags1 = 0, edge = 0, burstSource = 0,
  bias = 0, countdown = 0, remaining = 0, reload = 5, laser = 0,
  ship = 0, style = 2, power = 0, normal = 0x12, hyper = 0x34, p3c = 0,
} = {}) {
  const ram = new Ram();
  const resources = WHITE_SHOT_PRODUCER_RESOURCES[side];
  const rec = resources.player;
  const rowOffset = (((style - 2) * 2 + ship) * 4) & 0xffff;
  ram.setU32(resources.countPointer, rom.u32(WHITE_PLAYER.powerRows + rowOffset));
  ram.setU16(resources.gate308c, 1);
  ram.setU16(rec + P.posY, 0x2000);
  ram.setU16(rec + P.posX, side === 0 ? 0x1800 : 0x2800);
  ram.setU8(rec + P.state, state);
  ram.setU8(rec + P.flags1, flags1);
  ram.setU8(rec + P.btnByte, edge);
  ram.setU16(rec + 0x20, power);
  ram.setU8(rec + 0x21, burstSource);
  ram.setU8(rec + 0x2a, countdown);
  ram.setU8(rec + 0x2b, remaining);
  ram.setU8(rec + 0x2c, reload);
  ram.setU8(rec + 0x2d, bias);
  ram.setU8(rec + 0x3c, p3c);
  ram.setU8(rec + 0x3f, laser);
  ram.setU8(rec + 0x54, normal);
  ram.setU8(rec + 0x55, hyper);
  ram.setU16(rec + 0x58, ship);
  ram.setU16(rec + 0x5a, style);
  return {
    ram,
    rec,
    resources,
    run: () => whiteShotCadence1491D0(ram, rom, rec, {}, side),
  };
}

function activeShotCount(ram, resources) {
  let count = 0;
  for (let i = 0; i < resources.slots; i++) {
    if (ram.u16(resources.pool + i * resources.stride) !== 0) count++;
  }
  return count;
}

function assertUnreachedAt(run, address) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof Unreached);
    assert.equal(error.romAddress, address);
    return true;
  });
}

test('private player entry rejects Black before touching RAM or cartridge input', () => {
  let reads = 0;
  const untouched = new Proxy({}, {
    get() {
      reads++;
      throw new Error('protected input was touched');
    },
  });
  assert.throws(
    () => whitePlayerP1Tick14889E(untouched, untouched, 0, null, BLACK_LABEL_PROFILE),
    /White Label Stage 1 player tick is unavailable/,
  );
  assert.equal(reads, 0);
  assert.throws(
    () => whiteAutoShot148E5E(untouched, 0, 0, BLACK_LABEL_PROFILE),
    /White Label Stage 1 auto-shot is unavailable/,
  );
  assert.equal(reads, 0);
  assert.throws(
    () => whiteShotCadence1491D0(
      untouched, untouched, 0, null, 0, BLACK_LABEL_PROFILE,
    ),
    /White Label Stage 1 shot cadence is unavailable/,
  );
  assert.equal(reads, 0);
  assert.throws(
    () => createWhiteStage1PlayerHandlers(untouched, BLACK_LABEL_PROFILE),
    /White Label Stage 1 player handler map is unavailable/,
  );
  assert.equal(reads, 0);
});

test('Stage 1 player factory stays separate and keeps native type priorities', () => {
  const handlers = createWhiteStage1PlayerHandlers(rom);
  assert.deepEqual([...handlers.keys()], [0x02, 0x03]);
  assert.equal(handlers.has(0x05), false,
    'type 5 belongs only to the independently gated shot handler map');

  const entries = tables.editions.whiteLabel.dispatch.entries;
  assert.deepEqual([
    entries[2], entries[3], entries[5],
  ], [
    { handler: '$14889E', priority: 0x1c },
    { handler: '$14891E', priority: 0x1b },
    { handler: '$18A11C', priority: 0x18 },
  ]);
  assert.ok(entries[2].priority > entries[3].priority
    && entries[3].priority > entries[5].priority,
  'native dispatch runs P1, then P2, then the shot owner');
});

test('first player frame initializes at the slot position without reading movement input', () => {
  const ram = new Ram();
  configureOwner(ram, 0, { ship: 0, style: 2 });
  const address = slot(ram, 0, 0, { y: 0x2345, x: 0x3456 });
  ram.setU16(RAM.p1raw, 0x0008);

  const first = whitePlayerP1Tick14889E(ram, rom, address);
  assert.deepEqual(first, {
    phase: 'initialized', boundary: WHITE_PLAYER.firstFrameBoundary,
  });
  assert.equal(ram.u16(WHITE_PLAYER.p1.rec + P.posY), 0x2345);
  assert.equal(ram.u16(WHITE_PLAYER.p1.rec + P.posX), 0x3456);
  assert.equal(ram.u16(WHITE_PLAYER.p1.rec + P.velY), 0);
  assert.equal(ram.u16(WHITE_PLAYER.p1.rec + P.velX), 0);
  assert.equal(ram.u8(address + 0x03) & 1, 1);
  assert.equal(ram.u8(WHITE_PLAYER.p1.rec + P.speedIdx), 22);

  const second = whitePlayerP1Tick14889E(ram, rom, address);
  assert.equal(second.boundary, WHITE_PLAYER.drawTail);
  assert.ok(ram.u16(WHITE_PLAYER.p1.rec + P.posX) > 0x3456,
    'the same held input begins movement only on frame two');
});

test('P1 and P2 initialize independent records and move simultaneously from their own ports', () => {
  const { ram, p1slot, p2slot } = initializedPair();
  assert.equal(ram.u16(WHITE_PLAYER.p1.rec + P.posX), 0x1800);
  assert.equal(ram.u16(WHITE_PLAYER.p2.rec + P.posX), 0x2800);
  assert.equal(ram.u8(WHITE_PLAYER.p1.rec + P.speedIdx), 22);
  assert.equal(ram.u8(WHITE_PLAYER.p2.rec + P.speedIdx), 18);
  assert.equal(ram.u16(0x813090) & 3, 3);

  ram.setU16(RAM.p1raw, 0x0008);
  ram.setU16(RAM.p2raw, 0x0004);
  whitePlayerP1Tick14889E(ram, rom, p1slot);
  whitePlayerP2Tick14891E(ram, rom, p2slot);
  assert.ok(ram.u16(WHITE_PLAYER.p1.rec + P.posX) > 0x1800);
  assert.ok(ram.u16(WHITE_PLAYER.p2.rec + P.posX) < 0x2800);
  assert.equal(ram.u8(WHITE_PLAYER.p1.rec + P.playerIdx), 0);
  assert.equal(ram.u8(WHITE_PLAYER.p2.rec + P.playerIdx), 1);
});

test('Version A moves first, clamps all four walls second, and returns overshoot', () => {
  let moved = movingOwner({ y: 0x2000, x: CLAMP.xMax - 100, direction: 0x08 });
  assert.equal(moved.ram.u16(moved.rec + P.posX), CLAMP.xMax);
  assert.equal(i16(moved.ram.u16(moved.rec + P.velX)), 100);

  moved = movingOwner({ y: 0x2000, x: CLAMP.xMin + 100, direction: 0x04 });
  assert.equal(moved.ram.u16(moved.rec + P.posX), CLAMP.xMin);
  assert.equal(i16(moved.ram.u16(moved.rec + P.velX)), -100);

  moved = movingOwner({ y: CLAMP.yMax - 100, x: 0x1800, direction: 0x01 });
  assert.equal(moved.ram.u16(moved.rec + P.posY), CLAMP.yMax);
  assert.equal(i16(moved.ram.u16(moved.rec + P.velY)), 100);

  moved = movingOwner({ y: CLAMP.yMin + 100, x: 0x1800, direction: 0x02 });
  assert.equal(moved.ram.u16(moved.rec + P.posY), CLAMP.yMin);
  assert.equal(i16(moved.ram.u16(moved.rec + P.velY)), -100);
});

test('Version A rejects conflicting direction through $FF without repairing position', () => {
  const moved = movingOwner({
    y: CLAMP.yMax + 500, x: 0x1800, direction: 0x03,
  });
  assert.equal(moved.ram.u8(moved.rec + P.angle), 0xff);
  assert.equal(moved.ram.u16(moved.rec + P.posY), CLAMP.yMax + 500);
  assert.equal(moved.ram.u16(moved.rec + P.velY), 0);
});

test('Version A $148E5E auto-shot is the exact 84-byte Build B twin', {
  skip: existsSync(IMAGE) ? false : `${IMAGE} missing; run the oracle derive step`,
}, () => {
  const image = readFileSync(IMAGE);
  const white = image.subarray(WHITE_PLAYER.autoShot, WHITE_PLAYER.autoShotBoundary);
  const black = image.subarray(0x2497aa, 0x2497fe);
  assert.equal(WHITE_PLAYER.autoShot, WHITE_PLAYER.movementBoundary);
  assert.equal(white.length, 0x54);
  assert.deepEqual(white, black);
});

test('Version A dead Button 3 block remains unreachable', () => {
  const edgeOnly = autoShotOwner({ held: 0, edge: 0x40 });
  assert.equal(edgeOnly.ram.u16(edgeOnly.rec + 0x20), 0x1357);
  assert.equal(edgeOnly.ram.u16(edgeOnly.rec + 0x22), 0x2468);
  assert.equal(edgeOnly.ram.u32(edgeOnly.powerList), 0x10203040);
  assert.equal(edgeOnly.ram.u32(edgeOnly.powerList + 4), 0x50607080);
});

test('Version A auto-shot preserves all three native gates and reads held input', () => {
  const settingOff = autoShotOwner({ setting: 0 });
  assert.equal(settingOff.ram.u8(settingOff.rec + P.flags1), 0);
  assert.equal(settingOff.ram.u8(settingOff.rec + P.btnByte), 0);
  assert.equal(settingOff.ram.u8(settingOff.option + P.flags1), 0x03);

  const edgeOnly = autoShotOwner({ held: 0, edge: 0x40 });
  assert.equal(edgeOnly.ram.u8(edgeOnly.rec + P.flags1), 0);
  assert.equal(edgeOnly.ram.u8(edgeOnly.rec + P.btnByte), 0x40);

  const armed = autoShotOwner({ held: 0x40, edge: 0 });
  assert.equal(armed.ram.u8(armed.rec + P.flags1), 0x18);
  assert.equal(armed.ram.u8(armed.rec + P.btnByte), 0x10);

  const cadenceBusy = autoShotOwner({ p3c: 1 });
  assert.equal(cadenceBusy.ram.u8(cadenceBusy.rec + P.flags1), 0);
  assert.equal(cadenceBusy.ram.u8(cadenceBusy.rec + P.btnByte), 0);
});

test('Version A auto-shot pins divider phase and clears stale synthetic state', () => {
  const fired = autoShotOwner();
  assert.deepEqual(fired.result, {
    phase: 'auto-shot', boundary: WHITE_PLAYER.autoShotBoundary, ownerIndex: 0,
  });
  assert.equal(fired.ram.u8(fired.option + P.flags1), 0x0b);

  const skipped = autoShotOwner({ flags1: 0x18, edge: 0x10, optionFlags: 0x0b });
  assert.equal(skipped.ram.u8(skipped.rec + P.flags1), 0);
  assert.equal(skipped.ram.u8(skipped.rec + P.btnByte), 0);
  assert.equal(skipped.ram.u8(skipped.option + P.flags1), 0x03);
});

test('Version A auto-shot mutates only the option record selected by the slot owner', () => {
  const p1 = autoShotOwner({ side: 0 });
  assert.equal(p1.ram.u8(WHITE_PLAYER.p1.option + P.flags1), 0x0b);
  assert.equal(p1.ram.u8(WHITE_PLAYER.p2.option + P.flags1), 0x03);

  const p2 = autoShotOwner({ side: 1 });
  assert.deepEqual(p2.result, {
    phase: 'auto-shot', boundary: WHITE_PLAYER.autoShotBoundary, ownerIndex: 1,
  });
  assert.equal(p2.ram.u8(WHITE_PLAYER.p1.option + P.flags1), 0x03);
  assert.equal(p2.ram.u8(WHITE_PLAYER.p2.option + P.flags1), 0x0b);

  const invalid = new Ram();
  const invalidSlot = slot(invalid, 0, 2, { fresh: false });
  assert.throws(
    () => whiteAutoShot148E5E(invalid, WHITE_PLAYER.p1.rec, invalidSlot),
    /owner marker 2 is outside \{0, 1\}/,
  );
});

test('Version A cadence selects the shot byte and closes idle and laser-active paths', () => {
  const idle = cadenceOwner({ state: 0x08, flags1: 0x10, p3c: 7 });
  assert.deepEqual(idle.run(), {
    phase: 'cadence', boundary: WHITE_PLAYER.drawTail,
  });
  assert.equal(idle.ram.u8(idle.rec + 0x56), 0x12);
  assert.equal(idle.ram.u8(idle.rec + 0x3c), 0);
  assert.equal(idle.ram.btst8(idle.rec + P.state, 3), 0);
  assert.equal(idle.ram.btst8(idle.rec + P.flags1, 4), 0);

  const laser = cadenceOwner({ flags1: 1, laser: 1, p3c: 7 });
  assert.equal(laser.run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(laser.ram.u8(laser.rec + 0x56), 0x34);
  assert.equal(laser.ram.u8(laser.rec + 0x3c), 7,
    'the laser-active branch skips the cadence state machine');

  const hyperOnly = cadenceOwner({ flags1: 1, p3c: 7 });
  assert.equal(hyperOnly.run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(hyperOnly.ram.u8(hyperOnly.rec + 0x3c), 0,
    'hyper bit 0 selects bytes but does not masquerade as laser-active +$3F');
});

test('Version A cadence consumes real and synthesized edges with exact burst state', () => {
  const real = cadenceOwner({
    edge: 0x10, burstSource: 8, bias: 2, reload: 7, ship: 0, power: 8,
  });
  assert.equal(real.run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(activeShotCount(real.ram, real.resources), 2);
  assert.equal(real.ram.u8(real.rec + 0x2b), 6);
  assert.equal(real.ram.u8(real.rec + 0x2a), 2,
    'ship 0 at power 8 forces the native two-frame reload');
  assert.equal(real.ram.u8(real.rec + 0x3c), 1);

  const synthetic = cadenceOwner({ flags1: 0x08, edge: 0x10, ship: 2, reload: 9 });
  assert.equal(synthetic.run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(activeShotCount(synthetic.ram, synthetic.resources), 2);
  assert.equal(synthetic.ram.u8(synthetic.rec + 0x2b), 0);
  assert.equal(synthetic.ram.u8(synthetic.rec + 0x2a), 9);
  assert.equal(synthetic.ram.btst8(synthetic.rec + P.state, 3), 1);
  assert.equal(synthetic.ram.btst8(synthetic.rec + P.flags1, 3), 0);

  const repeated = cadenceOwner({ state: 0x08, edge: 0x10, burstSource: 8 });
  assert.equal(repeated.run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(activeShotCount(repeated.ram, repeated.resources), 0);
  assert.equal(repeated.ram.u8(repeated.rec + 0x2a), 1);
  assert.equal(repeated.ram.btst8(repeated.rec + P.state, 3), 0);

  const invalid = cadenceOwner({ edge: 0x10, ship: 1 });
  assertUnreachedAt(invalid.run, WHITE_PLAYER.shotInvalid);
});

test('Version A no-edge cadence preserves 8-bit countdown and reload phase', () => {
  const waiting = cadenceOwner({
    state: 0x08, flags1: 0x10, countdown: 2, remaining: 2,
  });
  assert.equal(waiting.run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(waiting.ram.u8(waiting.rec + 0x2a), 1);
  assert.equal(waiting.ram.u8(waiting.rec + 0x2b), 2);
  assert.equal(waiting.ram.btst8(waiting.rec + P.state, 3), 0);
  assert.equal(waiting.ram.btst8(waiting.rec + P.flags1, 4), 0);

  const ready = cadenceOwner({ countdown: 1, remaining: 2, ship: 2, reload: 6 });
  assert.equal(ready.run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(activeShotCount(ready.ram, ready.resources), 2);
  assert.equal(ready.ram.u8(ready.rec + 0x2b), 1);
  assert.equal(ready.ram.u8(ready.rec + 0x2a), 6);
  assert.equal(ready.ram.btst8(ready.rec + P.state, 3), 1);
  assert.equal(ready.ram.btst8(ready.rec + P.flags1, 4), 1);

  const wrapped = cadenceOwner({ countdown: 0, remaining: 2 });
  assert.equal(wrapped.run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(wrapped.ram.u8(wrapped.rec + 0x2a), 0xff);
  assert.equal(wrapped.ram.u8(wrapped.rec + 0x2b), 2);
});

test('Version A recurring tick uses held Button 2 gates before cadence', () => {
  const gatedOff = movingOwner({
    y: 0x2000, x: 0x1800, direction: 0x20, button2Gate: 3,
  });
  assert.equal(gatedOff.result.boundary, WHITE_PLAYER.drawTail);

  const edgeOnly = movingOwner({
    y: 0x2000, x: 0x1800, direction: 0, edge: 0x20, button2Gate: 4,
  });
  assert.equal(edgeOnly.result.boundary, WHITE_PLAYER.drawTail);

  assertUnreachedAt(() => movingOwner({
    y: 0x2000, x: 0x1800, direction: 0x20, button2Gate: 4,
  }), WHITE_PLAYER.button2Boundary);
});

test('Version A recurring tick consumes synthesized auto-shot edges in the same frame', () => {
  const ram = new Ram();
  const address = slot(ram, 0, 0, { fresh: false });
  const rec = WHITE_PLAYER.p1.rec;
  const resources = WHITE_SHOT_PRODUCER_RESOURCES[0];
  ram.setU32(resources.countPointer, rom.u32(WHITE_PLAYER.powerRows));
  ram.setU16(resources.gate308c, 1);
  ram.setU16(rec + P.posY, 0x2000);
  ram.setU16(rec + P.posX, 0x1800);
  ram.setU8(rec + P.speedIdx, 22);
  ram.setU8(rec + P.baseSpeed, 22);
  ram.setU8(rec + P.invuln, 0xff);
  ram.setU8(rec + 0x2c, 5);
  ram.setU16(rec + 0x58, 0);
  ram.setU16(rec + 0x5a, 2);
  ram.setU16(RAM.p1raw, 0x0040);
  ram.setU16(RAM.p1edge, 0);
  ram.setU8(WHITE_PLAYER.autoShotSetting, 1);
  const run = () => whitePlayerP1Tick14889E(ram, rom, address);

  assert.equal(run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(activeShotCount(ram, resources), 2);
  assert.equal(ram.u8(rec + 0x3c), 1);
  assert.equal(ram.u8(rec + 0x2b), 0);

  assert.equal(run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(ram.u8(rec + 0x3c), 0);
  assert.equal(ram.btst8(rec + P.flags1, 4), 0);

  assert.equal(run().boundary, WHITE_PLAYER.drawTail);
  assert.equal(activeShotCount(ram, resources), 4);
});

test('host companion markers 2 and 3 cannot fall through the native type 3 owner', () => {
  const handlers = createWhiteStage1PlayerHandlers(rom);
  for (const marker of [2, 3]) {
    const ram = new Ram();
    const address = OBJ.base;
    ram.setU16(address, 0x8003);
    ram.setU8(address + 0x07, marker);
    assert.throws(() => runObjectDriver(ram, handlers, {
      budget: new WorkBudget(), order: new ObjOrder(), unportedLog: { note() {} },
      profile: WHITE_LABEL_PROFILE,
    }), new RegExp(`marker-${marker} type-3 object in slot 0 was not intercepted`));
  }
});

test('player manifest exposes only the measured five-speed Version A closure', () => {
  assert.deepEqual(WHITE_PLAYER.speeds, [9, 15, 16, 18, 22]);
  const windows = tables.editions.whiteLabel.playerWindows;
  assert.equal(windows.length, 13);
  assert.deepEqual(windows.slice(0, 3), [
    { base: '$14883C', len: 0x0062 },
    { base: '$154796', len: 0x0122 },
    { base: '$141BEE', len: 0x0200 },
  ]);
  const sparse = new Set(windows.slice(3).map((window) =>
    `${parseInt(window.base.slice(1), 16)}:${window.len}`));
  for (const speed of WHITE_PLAYER.speeds) {
    assert.ok(sparse.has(`${WHITE_PLAYER.speedPointers + speed * 4}:4`));
    assert.ok(sparse.has(`${WHITE_PLAYER.speedBase + speed * WHITE_PLAYER.speedStride}:520`));
  }

  assert.throws(
    () => movingOwner({ y: 0x2000, x: 0x1800, direction: 0x08, speed: 23 }),
    (error) => error instanceof Unreached && error.romAddress === 0x141b5a,
  );
});

test('generated RomWindows serves both owners without a Build B cartridge read', () => {
  const reads = [];
  const guarded = new Proxy(rom, {
    get(target, property) {
      const value = target[property];
      if (typeof value !== 'function') return value;
      return (address, ...args) => {
        reads.push(address);
        if (address >= 0x200000 && address <= 0x2fffff) {
          throw new Error(`Build B cartridge read at $${address.toString(16)}`);
        }
        return value.call(target, address, ...args);
      };
    },
  });
  const ram = new Ram();
  configureOwner(ram, 0, { ship: 0, style: 2 });
  configureOwner(ram, 1, { ship: 2, style: 6 });
  const p1slot = slot(ram, 0, 0);
  const p2slot = slot(ram, 1, 1);
  whitePlayerP1Tick14889E(ram, guarded, p1slot);
  whitePlayerP2Tick14891E(ram, guarded, p2slot);
  ram.setU16(RAM.p1raw, 0x0008);
  ram.setU16(RAM.p2raw, 0x0004);
  whitePlayerP1Tick14889E(ram, guarded, p1slot);
  whitePlayerP2Tick14891E(ram, guarded, p2slot);

  assert.ok(reads.length > 100, 'both complete initializers and vectors read cartridge resources');
  assert.ok(reads.every((address) => address < 0x200000),
    'every player cartridge read stays in the independently measured Build A roots');
});
