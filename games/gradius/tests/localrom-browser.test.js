import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '../src/main.js';
import { gameplayPalette } from '../src/assets.js';
import { resetInput } from '../src/input.js';
import { createGradiusLocalResources, GRADIUS_LOCAL_GAME } from '../src/localrom.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const ROM = path.join(ROOT, 'Gradius (USA).nes');
const ASSETS = path.join(ROOT, 'games', 'gradius', 'assets');
const PARITY_FILES = [
  ROM,
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'chr', 'tiles.u8'),
  path.join(ASSETS, 'terrain', 'stages.json'),
  path.join(ASSETS, 'metasprites.json'),
  path.join(ASSETS, 'hud', 'packets.json'),
  path.join(ASSETS, 'screens', 'nametables.json'),
];

function localResources() {
  return createGradiusLocalResources(new Uint8Array(fs.readFileSync(ROM)));
}

function json(relative) {
  return JSON.parse(fs.readFileSync(path.join(ASSETS, relative), 'utf8'));
}

test('exact local ROM extraction matches runtime-critical generated assets', (t) => {
  const missing = PARITY_FILES.filter((file) => !fs.existsSync(file));
  if (missing.length) {
    t.skip(`ignored parity oracle absent: ${missing.map((file) => path.relative(ROOT, file)).join(', ')}`);
    return;
  }

  const resources = localResources();
  assert.deepEqual(resources.tiles,
    new Uint8Array(fs.readFileSync(path.join(ASSETS, 'chr', 'tiles.u8'))));
  assert.deepEqual(resources.stages, json(path.join('terrain', 'stages.json')).stages);
  assert.deepEqual(resources.metasprites, json('metasprites.json').records);

  const packets = json(path.join('hud', 'packets.json')).packets
    .map((packet) => Uint8Array.from(packet.bytes));
  assert.deepEqual(resources.hudPackets, packets);

  const screens = json(path.join('screens', 'nametables.json'));
  assert.deepEqual(resources.screenImages.playfield, Uint8Array.from(screens.playfield.bytes));
  assert.deepEqual(resources.screenImages.title, Uint8Array.from(screens.title.bytes));

  const manifest = json('manifest.json');
  assert.deepEqual(gameplayPalette(resources.manifest), gameplayPalette(manifest));

  for (const [field, relative] of [
    ['enemyTables', path.join('enemies', 'tables.json')],
    ['flowTables', path.join('flow', 'tables.json')],
    ['collisionTables', path.join('collision', 'tables.json')],
    ['weaponTables', path.join('weapons', 'tables.json')],
    ['soundTables', path.join('sound', 'tables.json')],
  ]) {
    for (const block of json(relative).blocks) {
      const base = Number.parseInt(block.rom.slice(1), 16);
      assert.deepEqual(
        Uint8Array.from(block.bytes, (_, index) => resources[field].read(base + index)),
        Uint8Array.from(block.bytes),
        `${field} ${block.name}`,
      );
    }
  }
});

class EventTargetStub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type, extra = {}) {
    const event = { type, repeat: false, preventDefault() {}, ...extra };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function canvasStub() {
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {},
  };
  return { getContext: (kind) => kind === '2d' ? context : null };
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  };
}

test('local resources boot stage 1 and accept browser input without fetch', async (t) => {
  if (!fs.existsSync(ROM)) {
    t.skip('ignored exact Gradius ROM absent');
    return;
  }

  resetInput();
  let clock = 0;
  const frames = [];
  const target = new EventTargetStub();
  const restore = [
    replaceGlobal('requestAnimationFrame', (callback) => { frames.push(callback); return frames.length; }),
    replaceGlobal('fetch', () => { throw new Error('local Gradius boot attempted fetch'); }),
  ];
  t.after(() => {
    resetInput();
    for (const undo of restore.reverse()) undo();
  });

  const runtime = await boot(canvasStub(), {
    resources: localResources(),
    game: GRADIUS_LOCAL_GAME,
    target,
    title: false,
  });
  t.after(() => runtime.stop());
  assert.equal(runtime.state.mode, 5);
  assert.ok(frames.length > 0);

  const runFrame = () => {
    const callback = frames.shift();
    assert.ok(callback, 'frame callback should be scheduled');
    clock += 17;
    callback(clock);
  };
  runFrame();
  target.dispatch('keydown', { code: 'ArrowRight' });
  runFrame();
  assert.equal(runtime.state.input.held & 0x01, 0x01);
  assert.equal(runtime.state.input.pressed & 0x01, 0x01);
  target.dispatch('keyup', { code: 'ArrowRight' });
  runFrame();
  assert.equal(runtime.state.input.held & 0x01, 0);
});
