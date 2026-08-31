// Private palette metadata follows virtual requests through the display list.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDisplayList } from '../src/displaylist.js';
import { Game } from '../src/main.js';
import { P, RAM } from '../src/machine.js';
import {
  beginPlayableHibachiCreditedRun, bindPlayableHibachiGame,
  collectPlayableHibachiSpriteRequests, createPlayableHibachiState,
} from '../src/playablehibachi.js';
import { Ram } from '../src/ram.js';
import { Renderer, FILL_PEN } from '../src/render/igs023.js';
import { BUFFER_STRIDE } from '../src/render/spritelist.js';
import { drawShip, drawShipAlt, drawShipShadow } from '../src/shipsprite.js';
import {
  PRIVATE_SPRITE_PALETTE_BASE, portSpriteList,
} from '../src/web/app.js';
import { BUCKETS, encodeRegisterRequest, enqueueRegisters } from '../src/spritequeue.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));

function word(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint16(offset, false);
}

function long(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(offset, false);
}

const u16 = (value) => value & 0xffff;
const packD1 = (y, x) => (((y & 0xffff) << 16) | (x & 0xffff)) >>> 0;
const reflectD1 = (ownerY, ownerX, source) => packD1(
  u16(ownerY * 2 - (source >>> 16)),
  u16(ownerX * 2 - (source & 0xffff)),
);

function request(offs, privatePaletteBank) {
  return {
    bucket: 19,
    bytes: encodeRegisterRequest(0x80008000, offs, 0x0220, 0),
    privatePaletteBank,
  };
}

test('Playable Hibachi emits the complete rotated first form for native P1 and P2', () => {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const state = createPlayableHibachiState();
  bindPlayableHibachiGame(state, game);
  beginPlayableHibachiCreditedRun(state, game, {});
  const owners = [
    [RAM.player1, 0x7000, 0x2000],
    [RAM.player2, 0x6800, 0x2800],
  ];
  for (const [rec, y, x] of owners) {
    game.ram.setU16(rec, 0x8000);
    game.ram.setU16(rec + P.posY, y);
    game.ram.setU16(rec + P.posX, x);
  }

  const requests = collectPlayableHibachiSpriteRequests(state, game);

  assert.strictEqual(requests, state.virtualRequests);
  assert.equal(requests.length, 20);
  const palettes = [2, 1, 2, 6, 6, 6, 6, 6, 6, 0];
  assert.deepEqual(requests.map((entry) => entry.privatePaletteBank),
    [...palettes, ...palettes]);
  assert.ok(requests.every((entry) => entry.bucket === 19 && entry.bytes.length === 12));
  assert.deepEqual(requests.slice(0, 10).map((entry) => long(entry.bytes, 4)), [
    game.rom.u32(0x2a4774),
    0x00116768,
    0x00101728,
    0x001120e8, 0x001120e8, 0x001120e8,
    0x001120e8, 0x001120e8, 0x001120e8,
    0x000fd858,
  ]);
  assert.deepEqual(requests.slice(0, 10).map((entry) => word(entry.bytes, 10)), [
    0x6012, 0x6011, 0x6012,
    0x6016, 0x6016, 0x6016, 0x6016, 0x6016, 0x6016,
    0x6010,
  ]);

  const [rec, ownerY, ownerX] = owners[0];
  void rec;
  const dy = game.tables.shotVector(0x1a, 0x40).dy;
  const source = (packD1(u16(ownerY + dy), ownerX)
    + 0xe6000000 + 0xea00f200) >>> 0;
  assert.deepEqual(requests[0].bytes, encodeRegisterRequest(
    reflectD1(ownerY, ownerX, source), game.rom.u32(0x2a4774),
    0x1670, 0x6012,
  ));
});

test('player sprite filter suppresses the native live, death, and shadow records', () => {
  const ram = new Ram();
  const phases = [];
  const ctx = {
    playerSpriteFilter: (_ram, event) => {
      phases.push(event.phase);
      return false;
    },
  };
  ram.setU8(RAM.player1 + P.playerIdx, 0);
  ram.setU16(RAM.player1, 0x8000);
  drawShip(ram, RAM.player1, ctx);
  ram.setU16(RAM.player1, 0x0100);
  drawShipAlt(ram, RAM.player1, ctx);
  assert.equal(drawShipShadow(ram, RAM.player1, ctx), false);

  assert.deepEqual(phases, ['live', 'death', 'shadow']);
  assert.equal(ram.u16(BUCKETS[19].counter), 0);
  assert.equal(ram.u16(BUCKETS[5].counter), 0);
});

test('Playable Hibachi private palette banks follow physical-first list order', () => {
  const ram = new Ram();
  enqueueRegisters(ram, 19, 0x80008000, 0x1111, 0x0220, 0);
  const built = buildDisplayList(ram, {
    virtualRequests: [request(0x2222, 0), request(0x3333, 8)],
  });

  assert.ok(built.privatePaletteBanks instanceof Int8Array);
  assert.equal(built.privatePaletteBanks.length, 256);
  assert.deepEqual([...built.privatePaletteBanks.slice(0, 4)], [-1, 0, 8, -1]);
  assert.equal(built.virtualRecords, 2);

  const map = new Map([0x1111, 0x2222, 0x3333]
    .map((offs) => [offs, [offs, 34, 0]]));
  const port = portSpriteList(ram, map, {
    privatePaletteBanks: built.privatePaletteBanks,
  });
  assert.notStrictEqual(port.privatePaletteBanks, built.privatePaletteBanks);
  assert.deepEqual([...port.privatePaletteBanks.slice(0, 4)], [-1, 0, 8, -1]);
});

test('ordinary lists retain their telemetry shape and empty virtual lists clear metadata', () => {
  const ordinary = buildDisplayList(new Ram());
  assert.equal(Object.hasOwn(ordinary, 'privatePaletteBanks'), false);

  const empty = buildDisplayList(new Ram(), { virtualRequests: [] });
  assert.ok(empty.privatePaletteBanks instanceof Int8Array);
  assert.ok(empty.privatePaletteBanks.every((bank) => bank === -1));
});

test('renderer resolves only tagged records through the private palette namespace', () => {
  const sprmask = new Uint16Array(1024);
  const sprcol = new Uint16Array(1024);
  sprmask[2] = 0xfffe;
  sprcol[0] = 7;
  const renderer = new Renderer({ igs023: new Uint8Array(1), sprmask, sprcol });
  const spritebuffer = new Uint16Array(BUFFER_STRIDE * 256);
  spritebuffer.set([0x8000, 0x8000, 0x0200, 0, 0x0201]);
  const privateBanks = new Int8Array(256).fill(-1);
  privateBanks[0] = 3;
  const indexed = renderer.renderIndexed({
    spritebuffer,
    spritePrivatePaletteBanks: privateBanks,
    spritePrivatePaletteBase: PRIVATE_SPRITE_PALETTE_BASE,
    bg: new Uint16Array(0),
    tx: new Uint16Array(0),
    rowscroll: new Uint16Array(224),
    zoomram: new Uint16Array(32),
    regs: { ctrl: 0 },
  }, { wantBg: false, wantTx: false });

  assert.equal(indexed[0], PRIVATE_SPRITE_PALETTE_BASE + 3 * 32 + 7);
  assert.equal(indexed[1], FILL_PEN);
});

test('virtual private palette bank validation is exact', () => {
  for (const privatePaletteBank of [-2, 128, 1.5]) {
    assert.throws(() => buildDisplayList(new Ram(), {
      virtualRequests: [request(0x2222, privatePaletteBank)],
    }), /private palette bank -1\.\.127/);
  }
});
