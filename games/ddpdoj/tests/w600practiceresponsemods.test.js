// W600: practice and response mods expose real collision geometry and narrow
// presentation/input timing seams without changing an ordinary launch.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { RAM } from '../src/machine.js';
import { DMG } from '../src/damage.js';
import { BOMBRAM } from '../src/bomb.js';
import { Demo } from '../src/web/app.js';
import {
  MODS, MOD_IDS, HITBOX_COLORS, resolveLoadout, createModState,
  loadoutToHash, replayPolicy, applyHitboxOverlay,
} from '../src/mods.js';

const stateOf = (...ids) => createModState(resolveLoadout(ids));
const W = 448, H = 224;

function pixel(rgb, longAxis, shortAxis) {
  const at = (shortAxis * W + longAxis) * 3;
  return [...rgb.subarray(at, at + 3)];
}

function setOrdinaryBox(ram, rec, longAxis, shortAxis, extents = [64, 64, 64, 64]) {
  ram.setU16(rec, 0x8000);
  ram.setU16(rec + 0x02, longAxis * 64);
  ram.setU16(rec + 0x04, shortAxis * 64);
  for (let i = 0; i < 4; i++) ram.setU16(rec + 0x10 + i * 2, extents[i]);
}

test('W600 practice mods are deterministic presentation-only catalogue state', () => {
  for (const id of ['drop-sprite-hold', 'show-hitboxes']) {
    assert.equal(MODS[id].category, 'presentation');
    assert.equal(MODS[id].replaySafe, true);
    assert.ok(MODS[id].effects.length);
  }
  const state = stateOf('show-hitboxes', 'drop-sprite-hold');
  assert.equal(state.loadout.presentation.dropSpriteHold, true);
  assert.equal(state.loadout.presentation.hitboxes, true);
  assert.equal(loadoutToHash(['show-hitboxes', 'drop-sprite-hold']),
    'mods=drop-sprite-hold+show-hitboxes');
  assert.deepEqual(replayPolicy(state), { compatible: true, blocking: [] });
  assert.ok(MOD_IDS.includes('drop-sprite-hold'));
  assert.ok(MOD_IDS.includes('show-hitboxes'));
});

test('W600 Show Hitboxes draws the collision pass geometry before board rotation', () => {
  const ram = new Ram();
  const rgb = new Uint8Array(W * H * 3);

  setOrdinaryBox(ram, DMG.p1rec, 20, 10);

  setOrdinaryBox(ram, DMG.poolA, 40, 30);
  ram.setU16(DMG.poolA, 0xa000);

  const shot = DMG.p1shots;
  setOrdinaryBox(ram, shot, 50, 70, [64, 128, 128, 64]);

  const bullet = DMG.bulletPool;
  ram.setU16(bullet, 0x0000);
  ram.setU16(bullet + 0x02, 60 * 64);
  ram.setU16(bullet + 0x04, 80 * 64);

  assert.equal(applyHitboxOverlay(stateOf('show-hitboxes'), ram, rgb), rgb);

  assert.deepEqual(pixel(rgb, 19, 9), HITBOX_COLORS.p1);
  assert.deepEqual(pixel(rgb, 21, 11), HITBOX_COLORS.p1);
  assert.deepEqual(pixel(rgb, 20, 10), [0, 0, 0], 'box interiors remain transparent');

  assert.deepEqual(pixel(rgb, 39, 29), HITBOX_COLORS.enemy);
  assert.deepEqual(pixel(rgb, 41, 31), HITBOX_COLORS.enemy);

  // The shot pass really uses maxY-minusY and maxX-(2*minusX), not a tidied
  // symmetric rectangle. These endpoints pin that cartridge geometry.
  assert.deepEqual(pixel(rgb, 49, 70), HITBOX_COLORS.shot);
  assert.deepEqual(pixel(rgb, 51, 72), HITBOX_COLORS.shot);
  assert.deepEqual(pixel(rgb, 50, 71), [0, 0, 0]);

  assert.deepEqual(pixel(rgb, 60, 80), HITBOX_COLORS.bullet,
    'the real pass still tests a free, mask-clear slot at its stale position');
  assert.deepEqual(pixel(rgb, 59, 80), HITBOX_COLORS.bullet);
  assert.deepEqual(pixel(rgb, 60, 79), HITBOX_COLORS.bullet);
});

test('W600 Show Hitboxes draws count-driven collectibles and beam-only enemies', () => {
  const ram = new Ram();
  const rgb = new Uint8Array(W * H * 3);

  ram.setU16(DMG.itemCount, 2);
  const item = DMG.itemPool + DMG.itemStride;
  ram.setU16(item + 0x02, 100 * 64);
  ram.setU16(item + 0x04, 40 * 64);
  ram.setU16(item + 0x10, 64);
  ram.setU16(item + 0x12, 128);
  ram.setU16(item + 0x14, 5 * 64);
  ram.setU16(item + 0x16, 6 * 64);
  const rejectedItem = item + DMG.itemStride;
  ram.setU16(rejectedItem, 0x00c0);
  ram.setU16(rejectedItem + 0x02, 110 * 64);
  ram.setU16(rejectedItem + 0x04, 40 * 64);
  ram.setU16(rejectedItem + 0x10, 64);
  ram.setU16(rejectedItem + 0x12, 64);

  ram.setU16(DMG.impactCount, 2);
  const rejectedImpact = DMG.impactPool;
  setOrdinaryBox(ram, rejectedImpact, 120, 40);
  ram.setU16(rejectedImpact, 0x8080);
  const bee = DMG.impactPool + 79 * DMG.impactStride;
  setOrdinaryBox(ram, bee, 130, 40, [64, 128, 192, 256]);

  const beamOnlyEnemy = DMG.poolA;
  setOrdinaryBox(ram, beamOnlyEnemy, 150, 40);
  ram.setU16(beamOnlyEnemy, 0x8100);

  applyHitboxOverlay(stateOf('show-hitboxes'), ram, rgb);

  assert.deepEqual(pixel(rgb, 99, 38), HITBOX_COLORS.collectible);
  assert.deepEqual(pixel(rgb, 101, 42), HITBOX_COLORS.collectible);
  assert.deepEqual(pixel(rgb, 100, 34), [0, 0, 0],
    'item collision ignores the two ordinary-record short-axis extent words');
  assert.deepEqual(pixel(rgb, 109, 39), [0, 0, 0], 'the $00C0 item is rejected');
  assert.deepEqual(pixel(rgb, 119, 39), [0, 0, 0], 'low-byte bit 7 rejects an impact record');
  assert.deepEqual(pixel(rgb, 128, 36), HITBOX_COLORS.collectible,
    'the count-driven impact walk reaches reserved bee slot 79');
  assert.deepEqual(pixel(rgb, 151, 41), HITBOX_COLORS.enemy,
    'word bit $0100 alone exposes a fixed-beam target');
});

test('W600 Show Hitboxes draws fixed and continuous beam damage geometry', () => {
  const ram = new Ram();
  const rgb = new Uint8Array(W * H * 3);
  for (const player of [DMG.p1rec, DMG.p2rec]) {
    ram.setU16(player, 0x8000);
    ram.setU8(player + DMG.laserByte, 1);
  }

  setOrdinaryBox(ram, DMG.laserSlot27, 120, 30);
  setOrdinaryBox(ram, DMG.laserSlot30, 130, 30);
  setOrdinaryBox(ram, DMG.laserSlot27P2, 0x7000 / 64, 40);
  setOrdinaryBox(ram, DMG.laserSlot30P2, 200, 40);
  setOrdinaryBox(ram, DMG.laserSlot27 + DMG.shotStride, 220, 40);

  const beam = DMG.beamRecP1;
  ram.setU16(beam, 0x8200);
  ram.setU16(beam + 0x02, 150 * 64);
  ram.setU16(beam + 0x04, 100 * 64);
  ram.setU16(beam + 0x06, 0x8400 - 150 * 64 - 0x0400);
  ram.setU16(beam + 0x08, 2 * 64);
  ram.setU16(beam + 0x0a, 3 * 64);
  ram.setU16(beam + 0x10, 165 * 64);
  const unarmed = DMG.beamRecP2;
  ram.setU16(unarmed, 0x8000);
  ram.setU16(unarmed + 0x02, 230 * 64);
  ram.setU16(unarmed + 0x04, 100 * 64);
  ram.setU16(unarmed + 0x06, 10 * 64);
  ram.setU16(unarmed + 0x08, 2 * 64);
  ram.setU16(unarmed + 0x0a, 3 * 64);
  ram.setU16(unarmed + 0x10, 245 * 64);

  applyHitboxOverlay(stateOf('show-hitboxes'), ram, rgb);

  assert.deepEqual(pixel(rgb, 119, 29), HITBOX_COLORS.weapon);
  assert.deepEqual(pixel(rgb, 131, 31), HITBOX_COLORS.weapon);
  assert.deepEqual(pixel(rgb, 447, 39), [0, 0, 0], 'slot 27 rejects long axis $7000');
  assert.deepEqual(pixel(rgb, 201, 41), HITBOX_COLORS.weapon);
  assert.deepEqual(pixel(rgb, 219, 39), [0, 0, 0], 'ordinary segment slot 28 is visual only');
  assert.deepEqual(pixel(rgb, 150, 97), HITBOX_COLORS.weapon,
    'unsigned clipping retains the beam when its raw maximum crosses $8000');
  assert.deepEqual(pixel(rgb, 165, 102), HITBOX_COLORS.weapon,
    'the continuous beam uses its shortened live reach');
  assert.deepEqual(pixel(rgb, 176, 97), [0, 0, 0], 'raw reach beyond +$10 is clipped');
  assert.deepEqual(pixel(rgb, 230, 97), [0, 0, 0], 'the first-call $8000 control is not armed');
});

test('W600 Show Hitboxes distinguishes laser-bomb records from ordinary bomb sprites', () => {
  const ram = new Ram();
  const rgb = new Uint8Array(W * H * 3);
  ram.setU16(DMG.p1rec, 0x8040);
  setOrdinaryBox(ram, BOMBRAM.rec, 250, 50);
  ram.setU16(BOMBRAM.rec, 0x8001);
  setOrdinaryBox(ram, BOMBRAM.rec + BOMBRAM.stride, 260, 60);
  setOrdinaryBox(ram, BOMBRAM.rec + 2 * BOMBRAM.stride, 270, 70);
  ram.setU16(BOMBRAM.rec + 2 * BOMBRAM.stride, 0x8200);
  setOrdinaryBox(ram, BOMBRAM.rec + 42 * BOMBRAM.stride, 280, 80);

  applyHitboxOverlay(stateOf('show-hitboxes'), ram, rgb);
  assert.deepEqual(pixel(rgb, 249, 49), HITBOX_COLORS.weapon, 'laser-bomb head');
  assert.deepEqual(pixel(rgb, 259, 59), HITBOX_COLORS.weapon, 'laser-bomb segment');
  assert.deepEqual(pixel(rgb, 269, 69), [0, 0, 0], 'parked segment');
  assert.deepEqual(pixel(rgb, 279, 79), HITBOX_COLORS.weapon, 'laser-bomb tail');

  const ordinary = new Ram();
  const ordinaryRgb = new Uint8Array(W * H * 3);
  ordinary.setU16(DMG.p1rec, 0x8040);
  setOrdinaryBox(ordinary, BOMBRAM.rec, 300, 50);
  ordinary.setU16(BOMBRAM.rec, 0x8000);
  setOrdinaryBox(ordinary, BOMBRAM.rec + BOMBRAM.stride, 310, 60);
  applyHitboxOverlay(stateOf('show-hitboxes'), ordinary, ordinaryRgb);
  assert.deepEqual(pixel(ordinaryRgb, 299, 49), [0, 0, 0]);
  assert.deepEqual(pixel(ordinaryRgb, 309, 59), [0, 0, 0],
    'ordinary-bomb sprite records are not spatial damage boxes');
});

function spriteHoldDemo(...ids) {
  const ram = new Ram();
  ram.setU16(RAM.spriteList, 0x1111);
  return {
    game: {
      ram, logicFrame: 0, coinPort: 0xffff,
      step() {
        this.ram.setU16(RAM.spriteList, 0x2222);
        this.logicFrame++;
      },
    },
    mods: ids.length ? stateOf(...ids) : null,
    progressionPokes: [], playback: null, recorder: null,
    romToPacked: new Map(), listOpts: {}, portList: null,
    prevPos: null, prevTilt: 0, stepsRun: 0, bundle: {},
    inPlayback: Demo.prototype.inPlayback,
  };
}

test('W600 Drop the Sprite Hold selects only the just-built presentation list', () => {
  const vanilla = spriteHoldDemo();
  Demo.prototype.step.call(vanilla);
  assert.equal(vanilla.portList.words[0], 0x1111,
    'ordinary play keeps the measured hardware list hold');
  assert.equal(vanilla.game.ram.u16(RAM.spriteList), 0x2222);

  const dropped = spriteHoldDemo('drop-sprite-hold');
  Demo.prototype.step.call(dropped);
  assert.equal(dropped.portList.words[0], 0x2222,
    'the selected mod displays the list this logic frame built');
  assert.equal(dropped.game.ram.u16(RAM.spriteList), 0x2222,
    'the mod changes no cartridge RAM');
});

function drawHarness(mods, hitboxRam, liveRam, spriteSource = 'port') {
  const paletteWords = new Uint16Array(0x1000);
  const canvasPixels = new Uint8ClampedArray(W * H * 4);
  const emptyState = () => ({
    spritebuffer: new Uint16Array(5),
    bg: new Uint16Array(0x800), tx: new Uint16Array(0x800),
    rowscroll: new Uint16Array(0x400), zoomram: new Uint16Array(0x20), regs: {},
  });
  const demo = {
    mods, hitboxRam, spriteSource, seedLf: 0,
    game: {
      logicFrame: 0, ram: liveRam,
      vram: { w: new Uint16Array(0x800) }, txvram: { w: new Uint16Array(0x800) },
      video: { bg_xscroll: 0, bg_yscroll: 0, tx_xscroll: 0, tx_yscroll: 0 },
      palette: { words: paletteWords, sourced: new Uint8Array(0x1000) },
    },
    cap: {
      length: 1, frames: [{}], state: emptyState,
      splice() { return 0; }, attached() { return [[]]; },
      part() { return paletteWords; },
    },
    bundle: { manifest: {} },
    prevPos: [0, 0], prevTilt: 0, prevShipSel: 0,
    portList: { words: new Uint16Array(0x500) },
    renderer: { renderIndexed() { return new Uint16Array(W * H); } },
    palMerged: null, pal: new Uint8Array(0x1000 * 3),
    rgb: new Uint8Array(W * H * 3), rot: new Uint8Array(W * H * 3),
    mode: 'tate', img: { data: canvasPixels },
    ctx: { putImageData() {} }, dirty: true,
  };
  Demo.prototype.draw.call(demo);
  return canvasPixels;
}

function tatePixel(rgba, sourceLong, sourceShort) {
  const x = sourceShort, y = W - 1 - sourceLong;
  const at = (y * H + x) * 4;
  return [...rgba.subarray(at, at + 3)];
}

test('W600 draw uses held geometry before TATE rotation and suppresses it for capture', () => {
  const held = new Ram(), live = new Ram();
  setOrdinaryBox(held, DMG.p1rec, 20, 10);
  setOrdinaryBox(live, DMG.p1rec, 30, 10);
  const state = stateOf('show-hitboxes');

  const board = drawHarness(state, held, live);
  assert.deepEqual(tatePixel(board, 19, 9), HITBOX_COLORS.p1);
  assert.deepEqual(tatePixel(board, 29, 9), [0, 0, 0],
    'draw does not substitute the live, one-frame-newer RAM');

  const capture = drawHarness(state, held, live, 'capture');
  assert.deepEqual(tatePixel(capture, 19, 9), [0, 0, 0],
    'live geometry is not painted over the unrelated capture diagnostic');

  const dropped = drawHarness(stateOf('drop-sprite-hold', 'show-hitboxes'), live, live);
  assert.deepEqual(tatePixel(dropped, 29, 9), HITBOX_COLORS.p1);
  assert.deepEqual(tatePixel(dropped, 19, 9), [0, 0, 0]);
});

test('W600 hitbox snapshot follows the selected sprite-list sample point', () => {
  const run = (...ids) => {
    const ram = new Ram();
    setOrdinaryBox(ram, DMG.p1rec, 20, 10);
    const game = {
      ram, logicFrame: 0, coinPort: 0xffff,
      step() {
        this.ram.setU16(DMG.p1rec + 0x02, 21 * 64);
        this.logicFrame++;
      },
    };
    const demo = {
      game,
      mods: stateOf(...ids),
      hitboxRam: null,
      progressionPokes: [], playback: null, recorder: null,
      romToPacked: new Map(), listOpts: {}, portList: null,
      prevPos: null, prevTilt: 0, stepsRun: 0, bundle: {},
      inPlayback: Demo.prototype.inPlayback,
    };
    Demo.prototype.step.call(demo);
    return { game, demo };
  };

  const held = run('show-hitboxes');
  assert.equal(held.game.ram.u16(DMG.p1rec + 0x02), 21 * 64);
  assert.equal(held.demo.hitboxRam.u16(DMG.p1rec + 0x02), 20 * 64,
    'ordinary overlay geometry matches the held hardware list');

  const dropped = run('drop-sprite-hold', 'show-hitboxes');
  assert.equal(dropped.demo.hitboxRam.u16(DMG.p1rec + 0x02), 21 * 64,
    'the response mod advances both sprite list and overlay geometry');
});

test('W600 vanilla and unrelated presentation paths do not inspect RAM or alter pixels', () => {
  const rgb = new Uint8Array(W * H * 3).fill(17);
  const before = rgb.slice();
  const trapRam = new Proxy({}, { get() { throw new Error('hitbox overlay touched RAM'); } });

  assert.equal(applyHitboxOverlay(null, trapRam, rgb), rgb);
  assert.deepEqual(rgb, before);
  assert.equal(applyHitboxOverlay(stateOf('monochrome'), trapRam, rgb), rgb);
  assert.deepEqual(rgb, before);
  assert.equal(applyHitboxOverlay(stateOf('show-hitboxes'), null, rgb), rgb);
  assert.deepEqual(rgb, before);
  const wrongSize = new Uint8Array(3).fill(23);
  assert.equal(applyHitboxOverlay(stateOf('show-hitboxes'), trapRam, wrongSize), wrongSize);
  assert.deepEqual([...wrongSize], [23, 23, 23]);
});
