// Private palette metadata follows virtual requests through the display list.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDisplayList } from '../src/displaylist.js';
import { playerBox } from '../src/damage.js';
import { Game } from '../src/main.js';
import { P, RAM } from '../src/machine.js';
import {
  beginPlayableHibachiCreditedRun, bindPlayableHibachiGame,
  collectPlayableHibachiSpriteRequests, createPlayableHibachiState,
  PLAYABLE_HIBACHI_SMALL_FORM,
} from '../src/playablehibachi.js';
import { Ram } from '../src/ram.js';
import { Renderer, FILL_PEN } from '../src/render/igs023.js';
import { BUFFER_STRIDE, RAM_STRIDE } from '../src/render/spritelist.js';
import { drawShip, drawShipAlt, drawShipShadow } from '../src/shipsprite.js';
import { loadBundle } from '../src/web/assets.js';
import {
  PRIVATE_SPRITE_PALETTE_BASE, portSpriteList, romToPackedMap,
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

function request(offs, privatePaletteBank) {
  return {
    bucket: 19,
    bytes: encodeRegisterRequest(0x80008000, offs, 0x0220, 0),
    privatePaletteBank,
  };
}

test('Playable Hibachi uses only the authentic small sphere from the first live frame', () => {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const state = createPlayableHibachiState();
  bindPlayableHibachiGame(state, game);
  beginPlayableHibachiCreditedRun(state, game, {});
  const form = PLAYABLE_HIBACHI_SMALL_FORM;
  const rec = RAM.player1;
  const y = 0x7000;
  const x = 0x2000;
  game.ram.setU16(rec, 0x8000);
  game.ram.setU16(rec + P.posY, y);
  game.ram.setU16(rec + P.posX, x);

  let requests = collectPlayableHibachiSpriteRequests(state, game);

  assert.strictEqual(requests, state.virtualRequests);
  assert.equal(requests.length, 1,
    'the first live frame has one sphere and no multipart boss or ordinary ship');
  assert.equal(requests[0].bucket, 19);
  assert.equal(requests[0].bytes.length, 12);
  assert.equal(requests[0].privatePaletteBank, 7);
  assert.deepEqual(requests[0].bytes, encodeRegisterRequest(
    packD1(u16(y - 0x0c00), u16(x - 0x0700)),
    0x00117c10, 0x0c38, 0x6017,
  ));
  assert.equal(long(requests[0].bytes, 4), 0x00117c10);
  assert.equal(word(requests[0].bytes, 8), 0x0c38);
  assert.equal(word(requests[0].bytes, 10), 0x6017);

  state.players[0].runtime.presentationFrames = 0;
  state.players[0].runtime.presentationStarted = false;
  const presentations = [];
  for (let index = 0; index < form.frames * form.framePeriod; index++) {
    requests = collectPlayableHibachiSpriteRequests(state, game);
    assert.equal(requests.length, 1);
    presentations.push(long(requests[0].bytes, 4));
  }
  const art = presentations.filter((_, index) => index % form.framePeriod === 0);
  assert.deepEqual(presentations, art.flatMap((address) =>
    Array(form.framePeriod).fill(address)),
  'each sphere frame holds for exactly two presented frames');
  assert.deepEqual(art, [
    0x00117c10, 0x00117d64, 0x00117eb8, 0x0011800c,
    0x00118160, 0x001182b4, 0x00118408, 0x0011855c,
  ]);

  game.ram.setU16(rec, 0x0100);
  assert.deepEqual(collectPlayableHibachiSpriteRequests(state, game), [],
    'native death cannot expose a boss-form Hibachi');
  game.ram.setU16(rec, 0x8000);
  game.ram.setU16(rec + P.posY, 0x6800);
  game.ram.setU16(rec + P.posX, 0x2800);
  requests = collectPlayableHibachiSpriteRequests(state, game);
  assert.equal(requests.length, 1);
  assert.equal(word(requests[0].bytes, 8), 0x0c38,
    'respawn returns as the same small form');

  game.ram.setU16(rec, 0);
  game.ram.setU16(RAM.player2, 0x8000);
  game.ram.setU16(RAM.player2 + P.posY, 0x6400);
  game.ram.setU16(RAM.player2 + P.posX, 0x2400);
  requests = collectPlayableHibachiSpriteRequests(state, game);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].bytes, encodeRegisterRequest(
    packD1(0x5800, 0x1d00), long(requests[0].bytes, 4), 0x0c38, 0x6017,
  ));
  assert.equal(word(requests[0].bytes, 10), 0x6017,
    'P2 owns the identical centered upside-down sphere');
});

test('every native hitbox pixel stays inside opaque small-form art', async () => {
  const bundle = await loadBundle(async (name) => new Uint8Array(readFileSync(
    new URL(`../assets/${name}`, import.meta.url),
  )));
  const game = new Game(null, bundle.tables, { palCatchUp: false });
  const state = createPlayableHibachiState();
  bindPlayableHibachiGame(state, game);
  beginPlayableHibachiCreditedRun(state, game, {});
  const form = PLAYABLE_HIBACHI_SMALL_FORM;
  const packed = romToPackedMap(
    bundle.manifest, (base) => bundle.spr.shardOfBase(base),
  );
  const art = Array.from({ length: form.frames }, (_, frame) =>
    game.rom.u32(form.artTable + frame * 4));
  for (const address of art) {
    const stream = packed.get(address);
    assert.ok(stream, `small-form stream $${address.toString(16)} is exported`);
    await bundle.spr.fetch(stream[2]);
    assert.equal(bundle.spr.state[stream[2]], 'ready');
  }
  const renderer = new Renderer(bundle.roms, bundle.tileFns);
  const nativeY = 0x5000;
  const nativeX = 0x1c00;

  for (let playerIdx = 0; playerIdx < 2; playerIdx++) {
    const rec = playerIdx === 0 ? RAM.player1 : RAM.player2;
    const other = playerIdx === 0 ? RAM.player2 : RAM.player1;
    game.ram.setU16(other, 0);
    game.ram.setU16(rec, 0x8000);
    game.ram.setU16(rec + P.posY, nativeY);
    game.ram.setU16(rec + P.posX, nativeX);
    game.ram.setU16(rec + P.hitYPlus, 0x0080);
    game.ram.setU16(rec + P.hitYMinus, 0x0100);
    game.ram.setU16(rec + P.hitXPlus, 0x0080);
    game.ram.setU16(rec + P.hitXMinus, 0x0080);
    const box = playerBox(game.ram, rec);
    const left = box.d1 >>> 6;
    const right = box.d0 >>> 6;
    const top = box.d3 >>> 6;
    const bottom = box.d2 >>> 6;

    for (let frame = 0; frame < form.frames; frame++) {
      state.players[playerIdx].runtime.presentationFrames = frame * form.framePeriod;
      state.players[playerIdx].runtime.presentationStarted = false;
      const listRam = new Ram();
      const built = buildDisplayList(listRam, {
        virtualRequests: collectPlayableHibachiSpriteRequests(state, game),
      });
      const port = portSpriteList(listRam, packed, {
        privatePaletteBanks: built.privatePaletteBanks,
        shardReady: (shard) => bundle.spr.state[shard] === 'ready',
      });
      assert.equal(port.drawn, 1);
      assert.equal(port.skipped, 0);
      const indexed = renderer.renderIndexed({
        spritebuffer: port.words,
        spritePrivatePaletteBanks: port.privatePaletteBanks,
        spritePrivatePaletteBase: PRIVATE_SPRITE_PALETTE_BASE,
        bg: new Uint16Array(0),
        tx: new Uint16Array(0),
        rowscroll: new Uint16Array(224),
        zoomram: new Uint16Array(32),
        regs: { ctrl: 0 },
      }, { wantBg: false, wantTx: false, spriteStride: RAM_STRIDE });
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          assert.notEqual(indexed[y * 448 + x], FILL_PEN,
            `P${playerIdx + 1} frame ${frame} leaves hitbox pixel (${x},${y}) transparent`);
        }
      }
    }
  }
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
