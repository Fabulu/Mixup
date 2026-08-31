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
  WHITE_PLAYER, whitePlayerP1Tick14889E, whitePlayerP2Tick14891E,
} from '../src/white-player.js';
import { createWhiteStage1PlayerHandlers } from '../src/white-runtime.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
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

function movingOwner({ y, x, direction, side = 0, speed = 22 }) {
  const ram = new Ram();
  const address = slot(ram, 0, side, { y, x, fresh: false });
  const rec = side === 0 ? WHITE_PLAYER.p1.rec : WHITE_PLAYER.p2.rec;
  ram.setU16(rec + P.posY, y);
  ram.setU16(rec + P.posX, x);
  ram.setU8(rec + P.speedIdx, speed);
  ram.setU8(rec + P.baseSpeed, speed);
  ram.setU8(rec + P.invuln, 0xff);
  ram.setU16(side === 0 ? RAM.p1raw : RAM.p2raw, direction);
  const result = side === 0
    ? whitePlayerP1Tick14889E(ram, rom, address)
    : whitePlayerP2Tick14891E(ram, rom, address);
  return { ram, rec, result };
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
    () => createWhiteStage1PlayerHandlers(untouched, BLACK_LABEL_PROFILE),
    /White Label Stage 1 player handler map is unavailable/,
  );
  assert.equal(reads, 0);
});

test('Stage 1 factory is separate and keeps native type priorities and type 5 absent', () => {
  const handlers = createWhiteStage1PlayerHandlers(rom);
  assert.deepEqual([...handlers.keys()], [0x02, 0x03]);
  assert.equal(handlers.has(0x05), false,
    'the option owner is not registered before its complete duties are ported');

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
  'native dispatch runs P1, then P2, then the future option owner');
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
  assert.equal(second.boundary, WHITE_PLAYER.movementBoundary);
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
