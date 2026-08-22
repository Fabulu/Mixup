// W498: authentic slot-14 Game Over art and P1 entry controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { Ram } from '../src/ram.js';
import { objSlot14, SLOT14 } from '../src/objslot14.js';
import { buildDisplayList, resetSpriteQueueCounters } from '../src/displaylist.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';
import {
  attachCoinKeys, attachInput, attachPad, clearCoin, clearTouch, currentCoinWord,
  currentPortWord, GAMEPAD_MAP, pollInput, tickCoinPulse,
} from '../src/web/input.js';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_ROM = IMG ? false : 'no decrypted ROM';
const u16 = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32 = (a) => (u16(a) * 0x10000 + u16(a + 2)) >>> 0;
const ROM = IMG ? Object.freeze({
  u8: (a) => IMG[a],
  u16,
  u32,
}) : null;

function shipped() {
  const manifestPath = path.join(GAME, 'assets', 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  const man = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const streamsPath = path.join(GAME, 'assets', man.spr.streamsFile);
  if (!existsSync(streamsPath)) return null;
  const raw = gunzipSync(readFileSync(streamsPath));
  const words = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >>> 2);
  const n = man.spr.streamCount;
  assert.equal(words.length, n * 3, 'streams.u32 is streamCount x 3');
  let rom = 0;
  let base = 0;
  const triples = [];
  for (let i = 0; i < n; i++) {
    rom = (rom + words[i]) >>> 0;
    base = (base + words[n + i]) >>> 0;
    triples.push([rom, base, words[2 * n + i]]);
  }
  const shardOfBase = (packedBase) => {
    for (const shard of man.spr.shards) {
      if (packedBase >= shard.maskFrom && packedBase < shard.maskFrom + shard.maskLen) {
        return shard.i;
      }
    }
    return -1;
  };
  return {
    byRom: new Map(triples.map((row) => [row[0], row])),
    shardOfBase,
    map: romToPackedMap({ spr: { streams: triples } }, shardOfBase),
  };
}
const SHIPPED = shipped();
const SKIP_SHEET = SHIPPED ? false
  : 'assets have not been regenerated with tools/export-web.mjs';

class FakeElement {
  constructor(dataset = {}) {
    this.dataset = { ...dataset };
    this.listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 90, height: 90 }; }
  fire(type, init = {}) {
    const e = { pointerId: 7, clientX: 45, clientY: 45, preventDefault() {}, ...init };
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
}

function spendCoinPulse() {
  for (let i = 0; i < 12; i++) tickCoinPulse();
}

function slot14Streams() {
  const rows = [];
  for (const base of [SLOT14.tableA, SLOT14.tableB]) {
    rows.push(Array.from({ length: SLOT14.tableEntries }, (_, i) => u32(base + i * 4)));
  }
  return rows;
}

test('W498 both authentic slot-14 tables resolve to nine packed boot streams',
  { skip: SKIP_ROM || SKIP_SHEET }, () => {
    const rows = slot14Streams();
    assert.deepEqual(rows.map((row) => row.length), [8, 8]);
    assert.deepEqual(rows.map((row) => new Set(row).size), [8, 8]);
    const streams = new Set(rows.flat());
    assert.equal(streams.size, 9, 'the tables overlap in seven of their eight descriptors');
    for (const offs of streams) {
      const packed = SHIPPED.byRom.get(offs);
      assert.ok(packed, `$${offs.toString(16).toUpperCase()} is missing from streams.u32`);
      assert.equal(SHIPPED.shardOfBase(packed[1]), 0,
        `$${offs.toString(16).toUpperCase()} must be available in the boot shard`);
    }
  });

test('W498 slot 14 reaches the display list through both cartridge sprite tables',
  { skip: SKIP_ROM || SKIP_SHEET }, () => {
    for (const [table, rankByte] of [[SLOT14.tableA, 8], [SLOT14.tableB, 0]]) {
      for (let i = 0; i < SLOT14.tableEntries; i++) {
        const ram = new Ram();
        const a5 = 0x800100;
        resetSpriteQueueCounters(ram);
        ram.setU8(a5 + SLOT14.stateAt, 1);
        ram.setU16(a5 + 0x04, 300);
        ram.setU32(a5 + 0x08, 0x44001c00);
        ram.setU16(a5 + 0x10, 0);
        ram.setU16(a5 + 0x12, i * 4);
        if (table === SLOT14.tableB) ram.setU8(a5 + 0x17, 2);

        objSlot14(ram, ROM, a5, { rankByte: () => rankByte });
        const descriptor = u32(table + i * 4);
        assert.equal(ram.u32(a5 + 0x0c), descriptor,
          `$${table.toString(16).toUpperCase()} entry ${i} reaches the enqueue`);
        buildDisplayList(ram);
        const list = portSpriteList(ram, SHIPPED.map);
        assert.deepEqual([list.records, list.drawn, list.skipped], [1, 1, 0],
          `$${descriptor.toString(16).toUpperCase()} reaches the browser display list`);
        assert.deepEqual([...list.missing.keys()], []);
      }
    }
  });

test('W498 shared mobile cluster sends COIN1 and START to different ports', () => {
  clearCoin();
  clearTouch();
  const dpad = new FakeElement();
  const coin = new FakeElement({ coin: 'COIN1' });
  const start = new FakeElement({ btn: 'START' });
  const backstop = attachPad(dpad, [coin, start]);

  coin.fire('pointerdown');
  assert.equal(currentCoinWord(), 0xfffe, 'P1 coin clears raw $C08004 bit 0');
  assert.equal(currentPortWord(), 0xffff, 'coin never enters the player port');
  coin.fire('pointerup');
  assert.equal(currentCoinWord(), 0xfffe, 'a tap keeps the fixed coin pulse alive');
  spendCoinPulse();
  assert.equal(currentCoinWord(), 0xffff, 'the existing 12-call pulse returns idle');

  start.fire('pointerdown');
  assert.equal(currentPortWord(), 0xfffe, 'START keeps the measured $C08000 word');
  assert.equal(currentCoinWord(), 0xffff, 'START never enters the coin port');
  start.fire('pointerup');
  assert.equal(currentPortWord(), 0xffff);
  backstop();
  clearCoin();
});

test('W498 Standard controller coin edges survive lifecycle boundaries correctly', (t) => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const pad = { id: 'W498 Standard pad', mapping: 'standard', axes: [0, 0], buttons };
  let pads = [pad];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => pads },
  });
  t.after(() => {
    clearCoin();
    clearTouch();
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  });

  const windowTarget = new FakeElement();
  const documentTarget = new FakeElement();
  attachInput(windowTarget);
  attachCoinKeys(windowTarget, documentTarget);
  clearCoin();

  assert.deepEqual(GAMEPAD_MAP,
    { a: 'A1', b: 'A2', x: 'A3', back: 'SELECT', start: 'START' });
  buttons[8].pressed = true;
  buttons[9].pressed = true;
  pollInput();
  assert.equal(currentCoinWord(), 0xfffe, 'a first discovered button-8 press is genuine');
  assert.equal(currentPortWord(), 0xfffe, 'Standard button 9 presses P1 START');
  spendCoinPulse();
  pollInput();
  assert.equal(currentCoinWord(), 0xffff, 'held SELECT does not rearm an expired pulse');
  buttons[9].pressed = false;
  buttons[8].pressed = false;
  pollInput();
  assert.equal(currentPortWord(), 0xffff, 'START releases normally');
  buttons[8].pressed = true;
  pollInput();
  assert.equal(currentCoinWord(), 0xfffe, 'release followed by a new press rearms');

  const boundary = (name, clear) => {
    clear();
    assert.equal(currentCoinWord(), 0xffff, `${name} clears the active pulse`);
    pollInput();
    assert.equal(currentCoinWord(), 0xffff, `${name} blocks the still-held SELECT`);
    buttons[8].pressed = false;
    pollInput();
    buttons[8].pressed = true;
    pollInput();
    assert.equal(currentCoinWord(), 0xfffe, `${name} preserves a later genuine press`);
  };

  boundary('replay entry', clearCoin);
  boundary('replay exit', clearCoin);
  boundary('window blur', () => windowTarget.fire('blur'));
  boundary('window pagehide', () => windowTarget.fire('pagehide'));
  boundary('document visibilitychange', () => documentTarget.fire('visibilitychange'));
  assert.equal(windowTarget.listeners.has('visibilitychange'), false,
    'visibilitychange is not incorrectly registered on window');

  pads = [];
  windowTarget.fire('gamepaddisconnected', { gamepad: pad });
  assert.equal(currentCoinWord(), 0xffff, 'disconnect clears the active pulse immediately');
  pads = [pad];
  pollInput();
  assert.equal(currentCoinWord(), 0xffff, 'held SELECT on reconnect remains blocked');
  buttons[8].pressed = false;
  pollInput();
  buttons[8].pressed = true;
  pollInput();
  assert.equal(currentCoinWord(), 0xfffe, 'release after reconnect enables a new press');
});
