// Private palette metadata follows virtual requests through the display list.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildDisplayList } from '../src/displaylist.js';
import { DMG, playerBox } from '../src/damage.js';
import { Game } from '../src/main.js';
import { MACHINE, P, RAM } from '../src/machine.js';
import { resolveLoadout } from '../src/mods.js';
import {
  armPlayableHibachiLaunchPresentation,
  beginPlayableHibachiCreditedRun, bindPlayableHibachiGame,
  capturePlayableHibachiLaunch, collectPlayableHibachiSpriteRequests,
  createPlayableHibachiState, projectPlayableHibachiTelemetry,
  PLAYABLE_HIBACHI_SMALL_FORM,
} from '../src/playablehibachi.js';
import { SCREEN17 } from '../src/objslot17.js';
import { PS } from '../src/shots.js';
import { DRAW_25E4D0, draw25E4D0 } from '../src/objslot9.js';
import { Ram } from '../src/ram.js';
import { Renderer, FILL_PEN } from '../src/render/igs023.js';
import { BUFFER_STRIDE, RAM_STRIDE } from '../src/render/spritelist.js';
import { drawShip, drawShipAlt, drawShipShadow } from '../src/shipsprite.js';
import { loadBundle } from '../src/web/assets.js';
import {
  Demo, PRIVATE_SPRITE_PALETTE_BASE, portSpriteList, romToPackedMap,
} from '../src/web/app.js';
import { BUCKETS, encodeRegisterRequest, enqueueRegisters } from '../src/spritequeue.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
let exactBundlePromise;
function exactBundle() {
  exactBundlePromise ??= loadBundle(async (name) => new Uint8Array(readFileSync(
    new URL(`../assets/${name}`, import.meta.url),
  )));
  return exactBundlePromise;
}

function fakeCanvas() {
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {},
  };
  return { width: 0, height: 0, getContext: () => context };
}

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

test('HUD telemetry is frozen, detached, read-only, and bank-specific', () => {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const state = createPlayableHibachiState();
  assert.equal(projectPlayableHibachiTelemetry(null, game.ram), null);
  bindPlayableHibachiGame(state, game);
  assert.equal(projectPlayableHibachiTelemetry(state, game.ram), null,
    'an inactive Playable state is never visible to the HUD');
  beginPlayableHibachiCreditedRun(state, game, {});
  state.ordinaryPatternCursors.set([20, 19]);
  state.hyperPatternCursors.set([3, 4]);
  game.ram.setU16(DMG.hyper1, 0);
  game.ram.setU16(DMG.hyper2, 1);
  game.ram.setU16(RAM.player1 + PS.power, 8);
  game.ram.setU16(RAM.player2 + PS.power, 2);
  const ramBefore = new Uint8Array(game.ram.b);
  const ordinaryBefore = new Uint8Array(state.ordinaryPatternCursors);
  const hyperBefore = new Uint8Array(state.hyperPatternCursors);

  const telemetry = projectPlayableHibachiTelemetry(state, game.ram);

  assert.deepEqual(telemetry, {
    active: true,
    p1: { player: 1, bank: 'N', pattern: 20, powerRung: 4 },
    p2: { player: 2, bank: 'H', pattern: 4, powerRung: 1 },
  });
  assert.equal(Object.isFrozen(telemetry), true);
  assert.equal(Object.isFrozen(telemetry.p1), true);
  assert.equal(Object.isFrozen(telemetry.p2), true);
  for (const player of [telemetry.p1, telemetry.p2]) {
    assert.ok(Object.values(player).every((value) =>
      value === null || ['string', 'number', 'boolean'].includes(typeof value)));
  }
  assert.throws(() => { telemetry.p1.pattern = 1; }, TypeError);
  assert.deepEqual(game.ram.b, ramBefore, 'projection never writes cartridge RAM');
  assert.deepEqual(state.ordinaryPatternCursors, ordinaryBefore);
  assert.deepEqual(state.hyperPatternCursors, hyperBefore);

  game.ram.setU16(RAM.player1 + PS.power, 1);
  assert.throws(() => projectPlayableHibachiTelemetry(state, game.ram),
    /HUD power must be exactly 0, 2, 4, 6, or 8/);
});

test('packaged stats retain projected Hibachi telemetry before live restoration', async () => {
  const demo = new Demo(fakeCanvas(), await exactBundle(), MACHINE.refreshHz,
    undefined, null, null, resolveLoadout(['playable-hibachi', 'runahead-2']));
  const state = demo.mods.playableHibachi;
  beginPlayableHibachiCreditedRun(state, demo.game, {});
  state.ordinaryPatternCursors.set([18, 19]);
  state.hyperPatternCursors.set([3, 2]);
  demo.game.ram.setU16(DMG.hyper1, 1);
  demo.game.ram.setU16(DMG.hyper2, 0);
  demo.game.ram.setU16(RAM.player1 + PS.power, 4);
  demo.game.ram.setU16(RAM.player2 + PS.power, 8);

  const projected = demo._captureRunaheadView(10, 2, {});
  assert.deepEqual(projected.playableHibachi, {
    active: true,
    p1: { player: 1, bank: 'H', pattern: 3, powerRung: 2 },
    p2: { player: 2, bank: 'N', pattern: 19, powerRung: 4 },
  });

  state.hyperPatternCursors[0] = 1;
  state.ordinaryPatternCursors[1] = 5;
  demo.game.ram.setU16(DMG.hyper1, 0);
  demo.game.ram.setU16(RAM.player1 + PS.power, 0);
  demo.game.ram.setU16(RAM.player2 + PS.power, 2);
  demo.runaheadView = projected;
  assert.strictEqual(demo.stats().playableHibachi, projected.playableHibachi,
    'stats use the detached projected view instead of restored live state');
  assert.deepEqual(projected.playableHibachi.p1,
    { player: 1, bank: 'H', pattern: 3, powerRung: 2 });

  demo.runaheadView = { ...projected, playableHibachi: null };
  assert.equal(demo.stats().playableHibachi, null,
    'an inactive projected frame remains hidden after live state restoration');

  demo.runaheadView = null;
  assert.deepEqual(demo.stats().playableHibachi, {
    active: true,
    p1: { player: 1, bank: 'N', pattern: 18, powerRung: 0 },
    p2: { player: 2, bank: 'N', pattern: 5, powerRung: 1 },
  });
});

test('packaged HUD stays inside the game frame with accessible static bank chips', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html,
    /id="game-frame"><canvas[^>]+><\/canvas><div id="hibachi-hud"[^>]+hidden>/);
  assert.match(html, /id="hibachi-hud" role="status" aria-live="polite"/);
  assert.match(html, /aria-label="Playable Hibachi weapon status"/);
  assert.match(html, /#hibachi-hud \{[^}]*position: absolute;[^}]*justify-content: space-between;/s);
  assert.match(html, /\.hibachi-chip \{[^}]*color: #70d9ff;/s);
  assert.match(html, /\.hibachi-chip\[data-bank="H"\] \{[^}]*color: #ffbd4a;/s);
  assert.doesNotMatch(html, /(?:#hibachi-hud|\.hibachi-chip)[^{]*\{[^}]*animation\s*:/s);
  assert.match(html, /paintHibachiHud\(s\.playableHibachi\)/);
  assert.match(html, /String\(player\.pattern\)\.padStart\(2, '0'\)/);
  assert.match(html, /power rung \$\{player\.powerRung\}/);
});

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

test('selector descent presents Hibachi at every launch anchor without stock fighter emits', () => {
  const game = new Game(null, TABLES, { palCatchUp: false });
  const state = createPlayableHibachiState();
  bindPlayableHibachiGame(state, game);
  armPlayableHibachiLaunchPresentation(state);
  const a6 = SCREEN17.recs;
  const D = DRAW_25E4D0;
  game.ram.setU16(a6 + D.sideAt, 0);
  game.ram.setU16(a6 + D.cursorAt, 0);
  const launchEvents = [];
  const ctx = {
    playerSpriteFilter: (_ram, event) => {
      launchEvents.push(event);
      return !capturePlayableHibachiLaunch(state, event);
    },
  };
  const travel = [0];
  let speed = 0;
  while (travel.at(-1) < 0x1800) {
    speed++;
    travel.push(travel.at(-1) + speed);
  }
  while (speed > 0) {
    travel.push(travel.at(-1) + speed);
    speed = Math.max(0, speed - 2);
  }

  for (const z of travel) {
    game.ram.setU16(a6 + D.zAt, z);
    draw25E4D0(game.ram, game.rom, ctx, a6, 1);
    const anchor = packD1(u16(0x3600 - z), 0x14c0);
    assert.equal(game.ram.u32(a6 + D.channelAt), anchor,
      'native selector channel still receives each launch anchor');
    assert.ok(Object.values(BUCKETS).every((bucket) => game.ram.u16(bucket.counter) === 0),
      'all three stock selected-fighter records stay suppressed');
    const requests = collectPlayableHibachiSpriteRequests(state, game);
    assert.equal(requests.length, 1, 'each pending descent frame has one small sphere');
    assert.deepEqual(requests[0].bytes, encodeRegisterRequest(
      packD1(u16(0x2a00 - z), 0x0dc0), long(requests[0].bytes, 4), 0x0c38, 0x6017),
    'the sphere stays centered on every descending native anchor');
    assert.equal(word(requests[0].bytes, 8), 0x0c38);
    assert.deepEqual(state.lifecycle, {
      bound: true, pending: true, launchEligible: true,
      active: false, credited: false, generation: 0,
    });
  }
  assert.deepEqual(launchEvents.map(({ phase, playerIdx, anchor, demo }) =>
    ({ phase, playerIdx, anchor, demo })), travel.map((z) => ({
    phase: 'launch', playerIdx: 0,
    anchor: packD1(u16(0x3600 - z), 0x14c0), demo: false,
  })));

  const beforeHandoff = { ...state.players[0].runtime };
  assert.equal(beginPlayableHibachiCreditedRun(state, game, { demo: false }), true);
  assert.equal(state.lifecycle.pending, false);
  assert.equal(state.lifecycle.active, true);
  assert.deepEqual({
    presentationFrames: state.players[0].runtime.presentationFrames,
    presentationStarted: state.players[0].runtime.presentationStarted,
    launchActive: state.players[0].runtime.launchActive,
    launchY: state.players[0].runtime.launchY,
    launchX: state.players[0].runtime.launchX,
  }, {
    presentationFrames: beforeHandoff.presentationFrames,
    presentationStarted: beforeHandoff.presentationStarted,
    launchActive: beforeHandoff.launchActive,
    launchY: beforeHandoff.launchY,
    launchX: beforeHandoff.launchX,
  }, 'credited handoff preserves launch position and animation continuity');
  let requests = collectPlayableHibachiSpriteRequests(state, game);
  assert.deepEqual(requests[0].bytes, encodeRegisterRequest(
    packD1(u16(beforeHandoff.launchY - 0x0c00), u16(beforeHandoff.launchX - 0x0700)),
    long(requests[0].bytes, 4), 0x0c38, 0x6017));
  assert.equal(state.players[0].runtime.presentationFrames,
    beforeHandoff.presentationFrames + 1);

  game.ram.setU16(RAM.player1, 0x8000);
  game.ram.setU16(RAM.player1 + P.posY, 0x1179);
  game.ram.setU16(RAM.player1 + P.posX, 0x14c0);
  requests = collectPlayableHibachiSpriteRequests(state, game);
  assert.deepEqual(requests[0].bytes, encodeRegisterRequest(
    packD1(0x0579, 0x0dc0), long(requests[0].bytes, 4), 0x0c38, 0x6017),
    'the first live frame hands presentation to the native player position');
  assert.equal(state.players[0].runtime.launchActive, false);
  game.ram.setU16(RAM.player1, 0);
  assert.deepEqual(collectPlayableHibachiSpriteRequests(state, game), [],
    'a later death cannot revive the stale launch sphere');
});

test('every native hitbox pixel stays inside opaque small-form art', async () => {
  const bundle = await exactBundle();
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
