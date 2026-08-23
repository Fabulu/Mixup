import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatmanRomProvider } from '../src/localrom.js';
import { boot } from '../src/main.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const ROM = path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb');
const ASSETS = path.join(ROOT, 'games', 'batman', 'assets');
const PARITY_FILES = [
  ROM,
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'player.tiles.bin'),
  path.join(ASSETS, 'sound.json'),
  path.join(ASSETS, 'levels', '01.map.bin'),
  path.join(ASSETS, 'levels', '01.vram.bin'),
];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function localProvider() {
  return createBatmanRomProvider(new Uint8Array(fs.readFileSync(ROM)));
}

test('exact local ROM extraction matches runtime-critical generated assets', async (t) => {
  const missing = PARITY_FILES.filter((file) => !fs.existsSync(file));
  if (missing.length) {
    t.skip(`ignored parity oracle absent: ${missing.map((file) => path.relative(ROOT, file)).join(', ')}`);
    return;
  }

  const provider = localProvider();
  const manifestBytes = fs.readFileSync(path.join(ASSETS, 'manifest.json'));
  assert.equal(sha256(manifestBytes),
    'd1e7c823d036da88f124a96ec04c0424d1d71ffc19d370dd93e332bf33cb9b0a');
  assert.deepEqual(await provider.loadManifest(), JSON.parse(manifestBytes));

  const player = await provider.loadPlayerTiles();
  assert.equal(sha256(player),
    '1f6881026695fdc611c206fa2519aeab0ae913339563b5b9f7daa053690f754f');
  assert.deepEqual(player, new Uint8Array(fs.readFileSync(path.join(ASSETS, 'player.tiles.bin'))));

  const level = await provider.loadLevel(1);
  assert.deepEqual(level.cells,
    new Uint8Array(fs.readFileSync(path.join(ASSETS, 'levels', '01.map.bin'))));
  assert.deepEqual(level.vram,
    new Uint8Array(fs.readFileSync(path.join(ASSETS, 'levels', '01.vram.bin'))));

  const soundBytes = fs.readFileSync(path.join(ASSETS, 'sound.json'));
  assert.equal(sha256(soundBytes),
    '5c0bc3ded2ffa9d20f5911bf11c29f5114ed3e923add328a168b4180d4e5abf0');
  const expectedSound = JSON.parse(soundBytes);
  assert.equal(provider.soundData.tickHz, expectedSound.tickHz);
  assert.deepEqual(Array.from(provider.soundData.pitch), expectedSound.pitch);
  assert.deepEqual(provider.soundData.songs, expectedSound.songs);
  assert.deepEqual(Array.from(provider.soundData.wave), expectedSound.wave);
  assert.deepEqual(Array.from(provider.soundData.bank), expectedSound.bank);
  assert.equal(provider.soundData.bankBase, expectedSound.bankBase);
});

class EventTargetStub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }
  dispatch(type, extra = {}) {
    const event = { type, repeat: false, preventDefault() {}, ...extra };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function canvasStub() {
  const context = {
    imageSmoothingEnabled: false,
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {},
    drawImage() {},
  };
  return {
    dataset: { scale: '1' }, width: 0, height: 0,
    getContext(kind) { return kind === '2d' ? context : null; },
  };
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  };
}

test('local provider boots level 1 and accepts browser input without fetch', async (t) => {
  if (!fs.existsSync(ROM)) {
    t.skip('ignored exact Batman ROM absent');
    return;
  }

  let clock = 0;
  let nextRequest = 1;
  const frames = [];
  const windowStub = new EventTargetStub();
  const documentStub = new EventTargetStub();
  documentStub.hidden = false;
  documentStub.createElement = (tag) => {
    if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
    return canvasStub();
  };
  const restore = [
    replaceGlobal('window', windowStub),
    replaceGlobal('document', documentStub),
    replaceGlobal('navigator', { getGamepads: () => [] }),
    replaceGlobal('performance', { now: () => clock }),
    replaceGlobal('requestAnimationFrame', (callback) => {
      frames.push(callback);
      return nextRequest++;
    }),
    replaceGlobal('cancelAnimationFrame', () => {}),
    replaceGlobal('fetch', () => { throw new Error('local Batman boot attempted fetch'); }),
  ];
  t.after(() => { for (const undo of restore.reverse()) undo(); });

  const runtime = await boot(canvasStub(), {
    assetProvider: localProvider(),
    title: false,
  });
  t.after(() => runtime.stop());
  assert.equal(runtime.state.level.number, 1);
  assert.equal(runtime.state.player.dead, 0);
  assert.ok(frames.length > 0);

  const runFrame = () => {
    const callback = frames.shift();
    assert.ok(callback, 'frame callback should be scheduled');
    clock += 17;
    callback(clock);
  };
  runFrame();
  windowStub.dispatch('keydown', { code: 'ArrowRight' });
  runFrame();
  assert.equal(runtime.state.input.held & 0x10, 0x10);
  assert.equal(runtime.state.input.pressed & 0x10, 0x10);
  windowStub.dispatch('keyup', { code: 'ArrowRight' });
  runFrame();
  assert.equal(runtime.state.input.held & 0x10, 0);
});
