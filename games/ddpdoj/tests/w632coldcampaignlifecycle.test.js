// W632: one cold production cabinet earns and completes both Black Label loops,
// returns through the complete ending/name lifecycle, then starts a second run.
// Boss Rush skips ordinary stage sections, so this proves every sprite remap and
// BG/TX request encountered by that lifecycle, plus rasterization at each landmark,
// rather than claiming full-stage art coverage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOSS } from '../src/boss.js';
import { DMG } from '../src/damage.js';
import { ENEMY } from '../src/enemies.js';
import { NAME_REC } from '../src/hiscorename.js';
import { HUDRAM } from '../src/hud.js';
import { COIN } from '../src/isr.js';
import { MACHINE, RAM, P } from '../src/machine.js';
import { MOD_RAM, resolveLoadout } from '../src/mods.js';
import { ALLOC } from '../src/objalloc.js';
import { SLOT12 } from '../src/objslot12.js';
import { SCREEN17 } from '../src/objslot17.js';
import { SCREEN8 } from '../src/objslot8.js';
import { RAM_STRIDE, SPRITE_LIMIT } from '../src/render/index.js';
import { SCHED } from '../src/scheduler.js';
import { SPAWN, stageTableEntry } from '../src/spawn.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  CONTROLS, clearCoin, clearTouch, setCoinKey, setTouchButton, setTouchDirections,
} from '../src/web/input.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ASSETS = path.join(ROOT, 'assets');
const MANIFEST_FILE = path.join(ASSETS, 'manifest.json');
const MANIFEST = existsSync(MANIFEST_FILE)
  ? JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) : null;

function requiredAssetNames(manifest) {
  if (!manifest) return ['manifest.json'];
  const bgShards = Array.isArray(manifest.gfx?.bg?.shards) ? manifest.gfx.bg.shards : [];
  const sprShards = Array.isArray(manifest.spr?.shards) ? manifest.spr.shards : [];
  return [...new Set([
    'manifest.json',
    'gfx/tx.tiles.u8.gz', 'gfx/tx.tileno.u16.gz',
    'gfx/bg.tileno.u16.gz', 'gfx/bg.pal.u16.gz', 'gfx/bg.smap.u16.gz',
    ...bgShards.map(({ i }) => `gfx/bg.shard${i}.tiles.u8.gz`),
    manifest.spr?.streamsFile ?? 'spr/streams.u32.gz',
    ...sprShards.flatMap(({ i }) => [
      `spr/mask.shard${i}.u16.gz`, `spr/col.shard${i}.u16.gz`,
    ]),
    'capture.json.gz', 'capture.bin.gz', 'seed.bin.gz', 'player.tables.json.gz',
  ])];
}

const ASSET_NAMES = Object.freeze(requiredAssetNames(MANIFEST));
const REQUIRED_FILES = Object.freeze(ASSET_NAMES.map((name) => path.join(ASSETS, name)));
const SHARDS_PRESENT = Array.isArray(MANIFEST?.gfx?.bg?.shards)
  && Array.isArray(MANIFEST?.spr?.shards);
const MISSING_FILES = Object.freeze(REQUIRED_FILES.filter((file) => !existsSync(file)));
const SKIP = SHARDS_PRESENT && MISSING_FILES.length === 0 ? false
  : `complete exact production bundle absent: ${MISSING_FILES.join(', ')}`;

const RAW = Object.freeze({
  stage: 0x813092, stageX2: 0x813094, stageX4: 0x813096, loop: 0x813098,
});
const HIBACHI_PARTS = Object.freeze([0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0]);
const ROUND2_MENU = Object.freeze({
  work: 0x81e0dc, innerAt: 0x08, substateAt: 0x06, selection: 0x81e112,
});
const EXPECTED_FRONTIERS = Object.freeze([
  Object.freeze([0, 0, 0, 0]),
  Object.freeze([1, 2, 4, 0]),
  Object.freeze([2, 4, 8, 0]),
  Object.freeze([3, 6, 12, 0]),
  Object.freeze([4, 8, 16, 0]),
  Object.freeze([4, 8, 16, 1]),
  Object.freeze([0, 0, 0, 1]),
  Object.freeze([1, 2, 4, 1]),
  Object.freeze([2, 4, 8, 1]),
  Object.freeze([3, 6, 12, 1]),
  Object.freeze([4, 8, 16, 1]),
  Object.freeze([0, 0, 0, 0]),
]);
const RELEASE = Object.freeze({ directions: 0, shot: false, start: false });
const DOWN_SHOT = Object.freeze({
  directions: 1 << CONTROLS.DOWN, shot: true, start: false,
});
const LEFT = Object.freeze({ directions: 1 << CONTROLS.LEFT, shot: false, start: false });
const RIGHT = Object.freeze({ directions: 1 << CONTROLS.RIGHT, shot: false, start: false });
const SHOT = Object.freeze({ directions: 0, shot: true, start: false });
const START = Object.freeze({ directions: 0, shot: false, start: true });
const CAMPAIGN_LIMIT = 200_000;

let bundlePromise;
const requestedAssets = new Set();
function exactBundle() {
  bundlePromise ??= loadBundle(async (name) => {
    requestedAssets.add(name);
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}

async function waitForQueue(queue, label) {
  queue.prefetchAll();
  const deadline = Date.now() + 30_000;
  while (queue.status().ready !== queue.status().total) {
    const status = queue.status();
    assert.deepEqual(status.failed, [], `${label} deferred assets failed`);
    if (Date.now() >= deadline) assert.fail(`${label} deferred assets did not become ready`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function canvasHarness() {
  let image = null;
  let puts = 0;
  const ctx = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData(next) {
      image = next;
      puts++;
    },
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const metrics = () => {
    assert.ok(image, 'Demo.draw() did not present a canvas image');
    let colored = 0;
    const colors = new Set();
    for (let i = 0; i < image.data.length; i += 4) {
      const rgb = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
      if (rgb !== 0) colored++;
      colors.add(rgb);
    }
    return { colored, colors: colors.size, width: image.width, height: image.height, puts };
  };
  return { canvas, metrics, puts: () => puts };
}

function activeTypes(game) {
  const types = [];
  for (let index = 0; index < ALLOC.slots; index++) {
    const type = game.ram.u16(ALLOC.table + index * ALLOC.stride);
    if (type !== 0) types.push(type & 0xff);
  }
  return types;
}

function activeEnemyTypes(game) {
  const types = [];
  for (let index = 0; index < ENEMY.slots; index++) {
    const record = ENEMY.table + index * ENEMY.stride;
    if (game.ram.u16(record) !== 0) types.push(game.ram.u8(record + 0x0c));
  }
  return types;
}

function enemyRecordByType(game, wanted) {
  for (let index = 0; index < ENEMY.slots; index++) {
    const record = ENEMY.table + index * ENEMY.stride;
    if (game.ram.u16(record) !== 0 && game.ram.u8(record + 0x0c) === wanted) return record;
  }
  return null;
}

function schedulerState(game) {
  const slot = (base, stride, index) => {
    const at = base + index * stride;
    return {
      index,
      at: `$${at.toString(16)}`,
      words: Array.from({ length: stride >>> 1 }, (_, word) =>
        `$${game.ram.u16(at + word * 2).toString(16).padStart(4, '0')}`),
    };
  };
  return {
    suspend: game.ram.u16(SCHED.suspend),
    deathPause: game.ram.u16(SCHED.deathPause),
    pointers: {
      a0: `$${game.ram.u32(SCHED.ptrA0).toString(16)}`,
      a1: `$${game.ram.u32(SCHED.ptrA1).toString(16)}`,
      a2: `$${game.ram.u32(SCHED.ptrA2).toString(16)}`,
      a3: `$${game.ram.u32(SCHED.ptrA3).toString(16)}`,
      a4: `$${game.ram.u32(SCHED.ptrA4).toString(16)}`,
    },
    a4: Array.from({ length: SCHED.a4Slots }, (_, index) =>
      slot(SCHED.a4Base, SCHED.a4Stride, index)),
  };
}

function activeEnemyState(game) {
  const state = [];
  for (let index = 0; index < ENEMY.slots; index++) {
    const record = ENEMY.table + index * ENEMY.stride;
    if (game.ram.u16(record) === 0) continue;
    const type = game.ram.u8(record + 0x0c);
    const entry = {
      index,
      type: `$${type.toString(16).padStart(2, '0')}`,
      status: `$${game.ram.u16(record).toString(16)}`,
      handler: `$${game.ram.u32(record + 0x4c).toString(16)}`,
      genericHp: game.ram.u16(record + 0x18),
      pos: [game.ram.u16(record + 0x02), game.ram.u16(record + 0x04)],
      boss: null,
    };
    if (type === 0xb0) {
      const subRec = game.ram.u32(record + BOSS.subRec);
      entry.boss = {
        hp: game.ram.u32(record + BOSS.hp0),
        subRec: `$${subRec.toString(16)}`,
        bodyOff: subRec === 0 ? null : game.ram.u16(subRec + 0x106),
        invulnerable: subRec === 0 ? null : game.ram.u16(subRec + 0x108),
        hitMask: subRec === 0 ? null : game.ram.u16(subRec + 0x10a),
        phaseLatch: subRec === 0 ? null : game.ram.u8(subRec + 0x10c),
        form: subRec === 0 ? null : game.ram.u8(subRec + 0x10e),
        parts: subRec === 0 ? [] : HIBACHI_PARTS.map((offset) => ({
          offset: `$${offset.toString(16)}`,
          status: `$${game.ram.u16(subRec + offset).toString(16)}`,
          flags: `$${game.ram.u8(subRec + offset).toString(16)}`,
          damage: game.ram.u16(subRec + offset + 0x18),
          pos: [game.ram.u16(subRec + offset + 0x02),
            game.ram.u16(subRec + offset + 0x04)],
          hitbox: [game.ram.u16(subRec + offset + 0x10),
            game.ram.u16(subRec + offset + 0x12),
            game.ram.u16(subRec + offset + 0x14),
            game.ram.u16(subRec + offset + 0x16)],
        })),
      };
    }
    state.push(entry);
  }
  return state;
}

function objectByType(game, wanted) {
  for (let index = 0; index < ALLOC.slots; index++) {
    const at = ALLOC.table + index * ALLOC.stride;
    const type = game.ram.u16(at);
    if (type !== 0 && (type & 0xff) === wanted) return at;
  }
  return null;
}

function rawPosition(game) {
  return [
    game.ram.u16(RAW.stage), game.ram.u16(RAW.stageX2),
    game.ram.u16(RAW.stageX4), game.ram.u16(RAW.loop),
  ];
}

function bossRushTarget(game, stage) {
  const entry = stageTableEntry(game.rom, stage);
  let terminator = entry.script;
  let finalTrigger = null;
  while (game.rom.u16(terminator) !== 0xffff) {
    finalTrigger = game.rom.u16(terminator);
    terminator += 8;
  }
  assert.notEqual(finalTrigger, null, `stage ${stage + 1} has a spawn script`);
  const threshold = Math.max(0, finalTrigger - 0x10);
  let cursor = entry.script;
  while (game.rom.u16(cursor) !== 0xffff
      && game.rom.u16(cursor) < threshold) cursor += 8;
  const approachTypes = new Set();
  for (let at = cursor; at < terminator; at += 8) {
    approachTypes.add(game.rom.u8(at + 4));
  }
  assert.ok(approachTypes.size > 0,
    `stage ${stage + 1} final approach has authentic spawn records`);
  return Object.freeze({
    script: entry.script, cursor, terminator, finalTrigger, threshold,
    approachTypes: Object.freeze([...approachTypes]),
  });
}

function readSpriteRecords(ram) {
  const records = [];
  for (let record = 0; record < SPRITE_LIMIT; record++) {
    const base = RAM.spriteList + record * RAM_STRIDE * 2;
    const w4 = ram.u16(base + 8);
    if ((w4 & 0x7fff) === 0) break;
    records.push(record);
  }
  return records;
}

function auditTiles(demo) {
  const bg = demo.game.vram.w;
  for (let index = 0; index < 64 * 16; index++) {
    demo.renderer.cache.bgGet(bg[index * 2], (bg[index * 2 + 1] & 0xc0) >> 6);
  }
  const tx = demo.game.txvram.w;
  for (let index = 0; index < 64 * 32; index++) {
    demo.renderer.cache.txGet(tx[index * 2], (tx[index * 2 + 1] & 0xc0) >> 6);
  }
}

function rasterizedSpritePixels(demo) {
  const withSprites = demo.renderer.bitmap.slice();
  const game = demo.game;
  const frameCount = demo.cap.length;
  const relative = (game.logicFrame - demo.seedLf) % frameCount;
  const frame = relative < 0 ? relative + frameCount : relative;
  const state = demo.cap.state(frame);
  state.bg = game.vram.w;
  state.tx = game.txvram.w;
  state.spritebuffer = demo.portList.words;
  state.regs = {
    ...state.regs,
    bg_xscroll: game.video.bg_xscroll,
    bg_yscroll: game.video.bg_yscroll,
    tx_xscroll: game.video.tx_xscroll,
    tx_yscroll: game.video.tx_yscroll,
  };
  const withoutSprites = demo.renderer.renderIndexed(state, {
    wantSpr: false, spriteStride: RAM_STRIDE,
  });
  let changed = 0;
  for (let index = 0; index < withSprites.length; index++) {
    if (withSprites[index] !== withoutSprites[index]) changed++;
  }
  return changed;
}

function setControls(control) {
  setTouchDirections(control.directions);
  setTouchButton('SHOT', control.shot);
  setTouchButton('BOMB', false);
  setTouchButton('AUTO', false);
  setTouchButton('START', control.start);
}

function failFrame(demo, message) {
  const raw = rawPosition(demo.game).join('/');
  const types = activeTypes(demo.game)
    .map((type) => `$${type.toString(16).padStart(2, '0')}`).join(',');
  assert.fail(`${message} at LF${demo.game.logicFrame}, raw ${raw}, types ${types}`);
}

function createAuditedStepper(demo, exact, harness) {
  let frames = 0;
  const auditTileRequests = () => {
    auditTiles(demo);
    if (exact.missingTxTiles.size !== 0) failFrame(demo,
      `renderer requested missing TX tiles ${[...exact.missingTxTiles].join(',')}`);
    if (exact.missingBgTiles.size !== 0) failFrame(demo,
      `renderer requested missing BG tiles ${[...exact.missingBgTiles].join(',')}`);
  };
  const drawMetrics = () => {
    demo.draw();
    auditTileRequests();
    return harness.metrics();
  };
  return {
    step(control = RELEASE) {
      setControls(control);
      const raw = readSpriteRecords(demo.game.ram);
      demo.step();
      const port = demo.portList;
      if (port.records !== raw.length) failFrame(demo,
        `renderer remapped ${port.records} of ${raw.length} raw sprite records`);
      if (port.missing.size !== 0) failFrame(demo,
        `renderer reported missing sprite records ${[...port.missing].join(',')}`);
      if (port.pending.size !== 0) failFrame(demo,
        `renderer reported pending sprite records ${[...port.pending].join(',')}`);
      if (port.skipped !== 0) failFrame(demo, `renderer skipped ${port.skipped} sprite records`);
      if (port.records !== port.drawn + port.blank) failFrame(demo,
        `renderer accounted ${port.drawn} drawn and ${port.blank} blank of ${port.records}`);
      if ((demo.game.ram.u16(RAM.p1raw) & (1 << CONTROLS.BOMB)) !== 0) {
        failFrame(demo, 'campaign sampled a prohibited BOMB input');
      }
      auditTileRequests();
      frames++;
      return activeTypes(demo.game);
    },
    frames: () => frames,
    metrics: drawMetrics,
    landmark(label, minimumRecords = 1) {
      const metrics = drawMetrics();
      assert.deepEqual([metrics.width, metrics.height], [224, 448], `${label} canvas shape`);
      assert.ok(metrics.colored > 500, `${label} is visibly nonblank`);
      assert.ok(metrics.colors > 8, `${label} has meaningful color variation`);
      assert.ok(demo.portList.drawn >= minimumRecords,
        `${label} draws ${demo.portList.drawn}, expected at least ${minimumRecords}`);
      const spritePixels = rasterizedSpritePixels(demo);
      assert.ok(spritePixels > 0,
        `${label} rasterizes production sprite pixels beyond the BG and TX layers`);
      return {
        label, logicFrame: demo.game.logicFrame, raw: rawPosition(demo.game),
        records: demo.portList.records, drawn: demo.portList.drawn, spritePixels,
        colored: metrics.colored, colors: metrics.colors,
      };
    },
  };
}

function advanceUntil(stepper, demo, predicate, limit, label, control = RELEASE) {
  if (predicate()) return 0;
  for (let frames = 1; frames <= limit; frames++) {
    stepper.step(control);
    if (predicate()) return frames;
  }
  assert.fail(`${label} did not arrive within ${limit} frames at LF${demo.game.logicFrame}`);
}

function edgePulse(stepper, demo, kind, name, bit) {
  const control = kind === 'button' ? SHOT
    : Object.freeze({ directions: 1 << bit, shot: false, start: false });
  const mirrors = [];
  let sampled = false;
  for (let frames = 0; frames < 4; frames++) {
    stepper.step(control);
    const raw = demo.game.ram.u16(RAM.p1raw);
    const edge = demo.game.ram.u16(RAM.p1edge);
    mirrors.push(`${raw.toString(16)}/${edge.toString(16)}`);
    if ((raw & (1 << bit)) !== 0 && (edge & (1 << bit)) !== 0) {
      sampled = true;
      break;
    }
  }
  assert.equal(sampled, true,
    `${name} press did not reach both cartridge input mailboxes: ${mirrors.join(',')}`);
  advanceUntil(stepper, demo,
    () => (demo.game.ram.u16(RAM.p1raw) & (1 << bit)) === 0,
    4, `${name} release mailbox`, RELEASE);
}

function proveStableRightMovement(stepper, demo) {
  const right = 1 << CONTROLS.RIGHT;
  let stableFrames = 0;
  let previous = demo.game.ram.u16(RAM.player1 + P.posX);
  let stableX = previous;
  for (let frame = 1; frame <= 180; frame++) {
    const types = stepper.step(RELEASE);
    assert.ok(types.includes(0x02) && types.includes(0x0b),
      'second-run stability wait remains in live gameplay');
    assert.equal(demo.game.ram.u16(RAM.p1raw) & right, 0);
    const current = demo.game.ram.u16(RAM.player1 + P.posX);
    if (current === previous) stableFrames++;
    else stableFrames = 0;
    previous = current;
    if (stableFrames >= 8) {
      stableX = current;
      break;
    }
  }
  assert.ok(stableFrames >= 8,
    'the released second-run player reached a stable horizontal position');

  let sampledBefore = null;
  let sampledAt = null;
  const mailbox = [];
  for (let frame = 0; frame < 4; frame++) {
    const before = demo.game.ram.u16(RAM.player1 + P.posX);
    stepper.step(RIGHT);
    const raw = demo.game.ram.u16(RAM.p1raw);
    const edge = demo.game.ram.u16(RAM.p1edge);
    const after = demo.game.ram.u16(RAM.player1 + P.posX);
    mailbox.push(`${before.toString(16)}>${after.toString(16)}:${raw.toString(16)}/${edge.toString(16)}`);
    if ((raw & right) !== 0 && (edge & right) !== 0) {
      sampledBefore = before;
      sampledAt = demo.game.logicFrame;
      break;
    }
    assert.equal(after, before,
      'the stable player does not drift before RIGHT reaches the cartridge mailbox');
  }
  assert.notEqual(sampledBefore, null,
    `RIGHT did not reach raw and edge mailboxes: ${mailbox.join(',')}`);

  let movedX = demo.game.ram.u16(RAM.player1 + P.posX);
  for (let frame = 0; frame < 4 && movedX <= sampledBefore; frame++) {
    stepper.step(RIGHT);
    assert.notEqual(demo.game.ram.u16(RAM.p1raw) & right, 0,
      'RIGHT remains held in the cartridge raw mailbox while movement resolves');
    movedX = demo.game.ram.u16(RAM.player1 + P.posX);
  }
  assert.ok(movedX > sampledBefore,
    'RIGHT causally moves the stable second-run player toward increasing X');
  advanceUntil(stepper, demo,
    () => (demo.game.ram.u16(RAM.p1raw) & right) === 0,
    4, 'second-run RIGHT release mailbox', RELEASE);
  return { stableX, sampledBefore, movedX, sampledAt, mailbox };
}

function openSelector(stepper, demo) {
  advanceUntil(stepper, demo, () => demo.game.logicFrame >= 305,
    305, 'initial cabinet credit point');
  assert.equal(demo.game.ram.u16(SCREEN8.state), 2, 'cold cabinet reached the score screen');
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0);

  setCoinKey('COIN1', true);
  for (let frame = 0; frame < 30; frame++) stepper.step(RELEASE);
  setCoinKey('COIN1', false);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1,
    'the production coin debounce credited P1 exactly once');

  for (let frame = 0; frame < 12; frame++) stepper.step(START);
  stepper.step(RELEASE);
  assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0,
    'START spent exactly one production credit');
  assert.ok(activeTypes(demo.game).includes(0x09),
    'credited START did not open the cartridge type-$09 selector');
}

function chooseShip0Style2(stepper, demo) {
  const record = SCREEN17.recs;
  advanceUntil(stepper, demo, () => demo.game.ram.u8(record) === 1
      && demo.game.ram.u8(record + SCREEN17.phaseAt) === 1,
  30, 'ship cursor phase');
  edgePulse(stepper, demo, 'button', 'SHOT', CONTROLS.SHOT);
  advanceUntil(stepper, demo,
    () => demo.game.ram.u8(record + SCREEN17.phaseAt) === 4,
    30, 'style cursor phase');
  edgePulse(stepper, demo, 'button', 'SHOT', CONTROLS.SHOT);
}

function finishSelector(stepper, demo, label) {
  advanceUntil(stepper, demo, () => activeTypes(demo.game).includes(0x09)
      && demo.game.ram.u16(0x813084) === 0
      && demo.game.ram.u16(0x813088) === 2
      && demo.game.ram.u8(0x813008) === 0
      && demo.game.ram.u8(0x813009) === 0,
  1200, `${label} selector commit`);
  assert.deepEqual([
    demo.game.ram.u16(0x813084), demo.game.ram.u16(0x813088),
  ], [0, 2], `${label} cartridge committed ship 0 and style 2`);

  advanceUntil(stepper, demo,
    () => (demo.game.ram.u16(RAM.player1 + P.state) & 0x8000) !== 0,
    800, `${label} player creation`);
  advanceUntil(stepper, demo, () => {
    const types = activeTypes(demo.game);
    return types.includes(0x02) && types.includes(0x0b) && !types.includes(0x09);
  }, 30, `${label} gameplay handoff`);
  assert.deepEqual([
    demo.game.ram.u16(RAM.player1 + P.shipSel),
    demo.game.ram.u16(RAM.player1 + P.optFormation),
  ], [0, 2], `${label} live P1 inherited the cartridge selection`);
}

function stableCabinetState(game) {
  return [
    game.ram.u32(HUDRAM.totalP1), game.ram.u32(HUDRAM.pendingP1),
    game.ram.u16(DMG.poolACount), game.ram.u16(DMG.poolBCount),
    game.ram.u16(RAW.stage), game.ram.u16(RAW.loop),
  ];
}

test('W632 one cold cabinet completes both loops and starts a second playable run',
  { skip: SKIP, timeout: 600_000 }, async (t) => {
    const exact = await exactBundle();
    await Promise.all([
      waitForQueue(exact.bg, 'BG'),
      waitForQueue(exact.spr, 'sprite'),
    ]);
    assert.deepEqual([...requestedAssets].sort(), [...ASSET_NAMES].sort(),
      'loadBundle and both queues consumed every preflighted production asset');
    assert.equal(exact.bg.status().ready, exact.bg.status().total);
    assert.equal(exact.spr.status().ready, exact.spr.status().total);

    clearCoin();
    clearTouch();
    t.after(() => { clearCoin(); clearTouch(); });

    const harness = canvasHarness();
    const loadout = resolveLoadout([
      'invincibility', 'auto-deathbomb', 'bottomless-bombs', 'boss-rush',
    ]);
    assert.deepEqual(loadout.ids, [
      'invincibility', 'auto-deathbomb', 'bottomless-bombs', 'boss-rush',
    ]);
    const demo = new Demo(harness.canvas, exact, MACHINE.refreshHz,
      undefined, null, null, loadout);
    const sameDemo = demo;
    const sameGame = demo.game;
    const productionCollisionFilter = demo.game.enemyBulletCollisionFilter;
    assert.equal(typeof productionCollisionFilter, 'function');
    const invincibilityWitness = {
      calls: 0, filteredP1: 0, firstFilteredLf: null, lastFilteredLf: null,
      loops: new Set(), stages: new Set(),
    };
    demo.game.enemyBulletCollisionFilter = (ram, event) => {
      const allowed = productionCollisionFilter(ram, event);
      invincibilityWitness.calls++;
      if (!allowed && event.player === MOD_RAM.player1) {
        assert.equal(demo.mods.runtime.cabinetRunActive, true,
          'Invincibility filters P1 only while the credited run policy is active');
        invincibilityWitness.filteredP1++;
        invincibilityWitness.firstFilteredLf ??= demo.game.logicFrame;
        invincibilityWitness.lastFilteredLf = demo.game.logicFrame;
        invincibilityWitness.loops.add(ram.u16(RAW.loop));
        invincibilityWitness.stages.add(ram.u16(RAW.stage));
      }
      return allowed;
    };
    const stepper = createAuditedStepper(demo, exact, harness);

    assert.equal(demo.coldBoot, true);
    assert.equal(demo.seedLf, 0);
    assert.equal(demo.seedVf, 0);
    assert.equal(demo.game.logicFrame, 0);
    assert.equal(demo.game.videoFrame, 0);
    assert.equal(demo.game.armedVblanks, 0);
    assert.ok(demo.game.bootResult, 'zero-RAM construction executed production Game.boot');
    assert.equal(demo.authentic, undefined, 'no direct authentic selection was supplied');
    assert.equal(demo.rung, null, 'no rung, saved seed, or checkpoint was supplied');
    assert.equal(demo.formation, null, 'no formation patched the player selection');
    assert.deepEqual(demo.progressionPokes, [], 'no host progression writes were configured');
    assert.equal(demo.mods.runtime.cabinetBoot, true);
    assert.equal(demo.mods.runtime.cabinetRunActive, false,
      'the selected production policies begin pending at the cabinet');

    demo.draw();
    auditTiles(demo);
    assert.deepEqual([...exact.missingTxTiles], []);
    assert.deepEqual([...exact.missingBgTiles], []);

    openSelector(stepper, demo);
    const firstCabinet = stepper.landmark('first credited cabinet selector', 10);
    assert.equal(demo.mods.runtime.cabinetRunActive, false,
      'mods remain pending through the first selector');
    chooseShip0Style2(stepper, demo);
    finishSelector(stepper, demo, 'first run');
    const firstGameplay = stepper.landmark('first credited gameplay', 5);
    assert.equal(demo.mods.runtime.cabinetRunActive, true,
      'mods activate only after the credited cartridge handoff');
    assert.equal(demo.game, sameGame);

    const frontiers = [rawPosition(demo.game)];
    let previousRaw = frontiers[0];
    let enteredLoop2 = false;
    let menuPhase = 'waiting';
    let round2ObjectSeen = false;
    let round2LeftEdge = false;
    let round2ShotEdge = false;
    let endingStarted = false;
    let finalLoopStageReached = false;
    let finalLoopStageRouteFrame = null;
    let deadHibachiRouteFrame = null;
    let deadHibachiSchedulerProven = false;
    let nameInitialized = false;
    const stageSeen = new Set();
    const stageLandmarks = new Map();
    const bossRushTargets = Array.from({ length: 5 }, (_, stage) =>
      bossRushTarget(demo.game, stage));
    const bossRushProgress = new Map();
    const bossApproachObjects = new Map();
    const typeFrames = new Map();
    const visible = new Map();
    const freezeTransitions = [];
    let previousFreeze = demo.game.ram.u16(RAM.freeze);

    const rememberVisible = (key, label, minimumRecords = 1) => {
      if (visible.has(key) || demo.portList.drawn < minimumRecords) return;
      const metrics = stepper.metrics();
      if (metrics.colored <= 500 || metrics.colors <= 8) return;
      visible.set(key, stepper.landmark(label, minimumRecords));
    };

    for (let routeFrame = 1; routeFrame <= CAMPAIGN_LIMIT; routeFrame++) {
      const before = activeTypes(demo.game);
      let control = endingStarted ? RELEASE : DOWN_SHOT;
      const menuActive = demo.game.ram.u16(ROUND2_MENU.work + ROUND2_MENU.innerAt) === 4;
      const menuState = demo.game.ram.u16(ROUND2_MENU.work + ROUND2_MENU.substateAt);
      if (!endingStarted && menuActive) {
        round2ObjectSeen ||= before.includes(0x11);
        if (menuState < 2) {
          menuPhase = 'intro';
          control = RELEASE;
        } else if (menuPhase === 'waiting' || menuPhase === 'intro') {
          assert.equal(demo.game.ram.u16(ROUND2_MENU.selection), 1,
            'the earned round-2 offer begins on cartridge default decline');
          menuPhase = 'press-left';
          control = LEFT;
        } else if (menuPhase === 'press-left') {
          control = LEFT;
        } else if (menuPhase === 'release-left') {
          control = RELEASE;
        } else if (menuPhase === 'press-shot') {
          control = SHOT;
        } else {
          control = RELEASE;
        }
      }

      const types = stepper.step(control);
      const enemyTypes = activeEnemyTypes(demo.game);
      const freeze = demo.game.ram.u16(RAM.freeze);
      if (freeze !== previousFreeze) {
        freezeTransitions.push({
          routeFrame, logicFrame: demo.game.logicFrame,
          from: previousFreeze, to: freeze,
          raw: rawPosition(demo.game), types,
          inPlay: [demo.game.ram.u32(RAM.inPlay1 + 0x18),
            demo.game.ram.u32(RAM.inPlay2 + 0x18)],
        });
        if (freezeTransitions.length > 20) freezeTransitions.shift();
        previousFreeze = freeze;
      }
      const rawInput = demo.game.ram.u16(RAM.p1raw);
      const edgeInput = demo.game.ram.u16(RAM.p1edge);
      if (menuPhase === 'press-left'
          && (rawInput & (1 << CONTROLS.LEFT)) !== 0
          && (edgeInput & (1 << CONTROLS.LEFT)) !== 0) {
        round2LeftEdge = true;
        menuPhase = 'release-left';
      } else if (menuPhase === 'release-left'
          && (rawInput & (1 << CONTROLS.LEFT)) === 0
          && demo.game.ram.u16(ROUND2_MENU.selection) === 0) {
        menuPhase = 'press-shot';
      } else if (menuPhase === 'press-shot'
          && (rawInput & (1 << CONTROLS.SHOT)) !== 0
          && (edgeInput & (1 << CONTROLS.SHOT)) !== 0) {
        round2ShotEdge = true;
        menuPhase = 'release-shot';
      } else if (menuPhase === 'release-shot'
          && (rawInput & (1 << CONTROLS.SHOT)) === 0) {
        menuPhase = 'confirmed';
      }

      const raw = rawPosition(demo.game);
      if (!raw.every((value, index) => value === previousRaw[index])) {
        frontiers.push(raw);
        previousRaw = raw;
      }
      if (!enteredLoop2 && raw[3] === 1 && raw[0] === 0) enteredLoop2 = true;
      if (!enteredLoop2 && raw[3] === 0 && raw[0] <= 4) {
        stageSeen.add(`1/${raw[0] + 1}`);
      }
      if (enteredLoop2 && raw[3] === 1 && raw[0] <= 4) {
        stageSeen.add(`2/${raw[0] + 1}`);
      }

      const gameplayLive = types.includes(0x02) && types.includes(0x0b);
      if (gameplayLive) {
        assert.equal(demo.mods.runtime.cabinetRunActive, true,
          'the selected run policy remains active on every audited gameplay frame');
        let stageKey = null;
        if (!enteredLoop2 && raw[3] === 0 && raw[0] <= 4) stageKey = `1/${raw[0] + 1}`;
        if (enteredLoop2 && raw[3] === 1 && raw[0] <= 4) stageKey = `2/${raw[0] + 1}`;
        if (stageKey) {
          if (stageKey === '2/5') {
            finalLoopStageReached = true;
            finalLoopStageRouteFrame ??= routeFrame;
          }
          const target = bossRushTargets[raw[0]];
          const clock = demo.game.ram.u16(SPAWN.DISTANCE_CLOCK);
          const cursor = demo.game.ram.u32(SPAWN.LIVE_CURSOR);
          if (!bossRushProgress.has(stageKey)
              && clock >= target.threshold
              && cursor >= target.cursor && cursor <= target.terminator) {
            bossRushProgress.set(stageKey, {
              logicFrame: demo.game.logicFrame, clock, cursor,
              target: target.cursor, threshold: target.threshold,
              finalTrigger: target.finalTrigger, terminator: target.terminator,
            });
          }
          if (bossRushProgress.has(stageKey) && clock < target.threshold) {
            failFrame(demo,
              `Boss Rush clock regressed below $${target.threshold.toString(16)} after acceleration`);
          }
          for (const type of enemyTypes) {
            if (!target.approachTypes.includes(type)) continue;
            if (!bossApproachObjects.has(stageKey)) bossApproachObjects.set(stageKey, new Set());
            bossApproachObjects.get(stageKey).add(type);
          }
        }
        if (stageKey && !stageLandmarks.has(stageKey) && demo.portList.drawn >= 10) {
          const metrics = stepper.metrics();
          if (metrics.colored > 500 && metrics.colors > 8) {
            stageLandmarks.set(stageKey,
              stepper.landmark(`loop ${stageKey.replace('/', ' stage ')}`, 10));
          }
        }
      }

      if (finalLoopStageReached) {
        for (const type of [0x06, 0x13, 0x07, 0x0f, 0x0e, 0x0c, 0x08]) {
          if (types.includes(type) && !typeFrames.has(type)) typeFrames.set(type, routeFrame);
        }
      }
      if (types.includes(0x0d)) {
        assert.fail(`campaign entered a continue countdown at LF${demo.game.logicFrame}`);
      }
      if (types.includes(0x11)) rememberVisible('round2', 'earned round-2 offer', 5);
      if (types.includes(0x07) && finalLoopStageReached) {
        assert.ok(bossRushProgress.has('2/5') && bossApproachObjects.has('2/5'),
          'loop-2 ending begins only after the authentic Stage 5 boss approach');
        endingStarted = true;
        rememberVisible('ending', 'ordinary loop-2 ending', 10);
      }
      const hibachi = enemyRecordByType(demo.game, 0xb0);
      const hibachiSubRec = hibachi === null ? 0 : demo.game.ram.u32(hibachi + BOSS.subRec);
      if (finalLoopStageReached && hibachi !== null && hibachiSubRec !== 0
          && demo.game.ram.u32(hibachi + BOSS.hp0) === 0xffffffff
          && demo.game.ram.u16(hibachiSubRec + 0x106) === 1
          && demo.game.ram.u8(hibachiSubRec + 0x10e) === 2) {
        deadHibachiRouteFrame ??= routeFrame;
      }
      if (!deadHibachiSchedulerProven && deadHibachiRouteFrame !== null
          && routeFrame - deadHibachiRouteFrame >= 600) {
        const scheduler = schedulerState(demo.game);
        assert.equal(scheduler.suspend, 1,
          `dead loop-2 Hibachi reached the cartridge suspend: ${JSON.stringify(scheduler)}`);
        assert.equal(enemyRecordByType(demo.game, 0xb0), null,
          'the dead loop-2 Hibachi root retired after its ending script');
        assert.deepEqual(scheduler.a4.map(({ words }) => words[0]), Array(5).fill('$0000'),
          'the ending script retired every A4 slot');
        deadHibachiSchedulerProven = true;
      }
      if (finalLoopStageRouteFrame !== null && !endingStarted
          && deadHibachiRouteFrame === null
          && routeFrame - finalLoopStageRouteFrame >= 30_000) {
        failFrame(demo, `loop-2 Stage 5 did not reach its ending within 30000 frames: ${
          JSON.stringify({
            routeFrame, types, enemies: activeEnemyState(demo.game),
            spawn: {
              cursor: `$${demo.game.ram.u32(SPAWN.LIVE_CURSOR).toString(16)}`,
              clock: `$${demo.game.ram.u16(SPAWN.DISTANCE_CLOCK).toString(16)}`,
            },
            freeze: {
              value: demo.game.ram.u16(RAM.freeze), transitions: freezeTransitions,
              inPlay: [demo.game.ram.u32(RAM.inPlay1 + 0x18),
                demo.game.ram.u32(RAM.inPlay2 + 0x18)],
            },
            player: {
              status: `$${demo.game.ram.u16(RAM.player1 + P.state).toString(16)}`,
              pos: [demo.game.ram.u16(RAM.player1 + P.posY),
                demo.game.ram.u16(RAM.player1 + P.posX)],
            },
          })}`);
      }
      if (types.includes(0x0f)) rememberVisible('gameover', 'final Game Over presentation', 5);
      if (types.includes(0x0c)) {
        rememberVisible('name', 'name and score presentation', 10);
        const slot12 = objectByType(demo.game, 0x0c);
        const name = SLOT12.records[0];
        if (slot12 != null && demo.game.ram.u8(slot12 + SLOT12.owedAt) !== 0
            && demo.game.ram.u32(name + NAME_REC.entry) !== 0) {
          assert.deepEqual([
            demo.game.ram.u16(name + NAME_REC.ship),
            demo.game.ram.u16(name + NAME_REC.style),
          ], [0, 2], 'name handling inherited the real first-run selection');
          assert.notEqual(demo.game.ram.u32(name + NAME_REC.score), 0,
            'name handling received the naturally earned nonzero score');
          nameInitialized = true;
        }
      }
      if (types.includes(0x08) && nameInitialized) {
        rememberVisible('attract', 'returned cabinet attract', 5);
        if (visible.has('attract')) break;
      }
    }

    if (frontiers.length !== EXPECTED_FRONTIERS.length) {
      failFrame(demo, `campaign exhausted without terminal reset: ${JSON.stringify({
        frontiers, types: activeTypes(demo.game), enemies: activeEnemyState(demo.game),
        typeFrames: Object.fromEntries(typeFrames), visible: [...visible.keys()],
        raw: rawPosition(demo.game), scheduler: schedulerState(demo.game),
        nameInitialized, endingStarted, deadHibachiRouteFrame,
        deadHibachiSchedulerProven,
      })}`);
    }
    assert.deepEqual(frontiers, EXPECTED_FRONTIERS,
      'cold production route traversed all five stages in both loops before terminal reset');
    assert.deepEqual([...stageSeen].sort(), [
      '1/1', '1/2', '1/3', '1/4', '1/5',
      '2/1', '2/2', '2/3', '2/4', '2/5',
    ]);
    assert.deepEqual([...stageLandmarks.keys()].sort(), [...stageSeen].sort(),
      'all ten Boss Rush stage frontiers produced visible production canvases');
    assert.deepEqual([...bossRushProgress.keys()].sort(), [...stageSeen].sort(),
      'all ten stage installs advanced the authentic script to its final approach');
    assert.deepEqual([...bossApproachObjects.keys()].sort(), [...stageSeen].sort(),
      'all ten final approaches created objects named by their authentic spawn records');
    for (const [stageKey, types] of bossApproachObjects) {
      assert.ok(types.size > 0, `${stageKey} created at least one authentic boss-approach object`);
    }
    assert.equal(round2ObjectSeen, true, 'the cartridge earned and created the round-2 offer');
    assert.equal(round2LeftEdge, true, 'LEFT reached both round-2 cartridge input mailboxes');
    assert.equal(round2ShotEdge, true, 'SHOT reached both round-2 cartridge input mailboxes');
    assert.equal(menuPhase, 'confirmed', 'round 2 was actively accepted rather than timed out');
    assert.equal(enteredLoop2, true);
    assert.equal(finalLoopStageReached, true,
      'ending lifecycle evidence was armed only after live loop-2 Stage 5');
    assert.equal(deadHibachiSchedulerProven, true,
      'loop-2 Hibachi completed its authentic A4 suspend and retirement route');
    assert.deepEqual(
      [0x06, 0x13, 0x07, 0x0f, 0x0e, 0x0c, 0x08].map((type) => typeFrames.get(type)),
      [0x06, 0x13, 0x07, 0x0f, 0x0e, 0x0c, 0x08].map((type) => {
        const frame = typeFrames.get(type);
        assert.ok(frame > 0, `type $${type.toString(16).padStart(2, '0')} was observed`);
        return frame;
      }),
    );
    const orderedFrames = [0x06, 0x13, 0x07, 0x0f, 0x0e, 0x0c, 0x08]
      .map((type) => typeFrames.get(type));
    for (let index = 1; index < orderedFrames.length; index++) {
      assert.ok(orderedFrames[index] > orderedFrames[index - 1],
        'ending, Game Over, name, and cabinet objects appear in cartridge order');
    }
    assert.equal(nameInitialized, true);
    assert.deepEqual([...visible.keys()].sort(),
      ['attract', 'ending', 'gameover', 'name', 'round2']);
    assert.deepEqual(rawPosition(demo.game), [0, 0, 0, 0],
      'natural name teardown reset stage and loop state');
    assert.equal(demo.mods.runtime.cabinetRunActive, false,
      'the returned cabinet retired the first run mod policy');
    assert.ok(invincibilityWitness.calls > 0,
      'the live campaign exercised the production enemy-bullet collision seam');
    assert.ok(invincibilityWitness.filteredP1 > 0,
      'the live campaign naturally filtered P1 enemy-bullet collisions');
    assert.deepEqual([...invincibilityWitness.loops].sort(), [0, 1],
      'natural P1 collision filtering remained active in both loops');
    assert.ok(invincibilityWitness.lastFilteredLf > invincibilityWitness.firstFilteredLf,
      'live filtered collisions span more than one gameplay frame');
    const filteredBeforeAttract = invincibilityWitness.filteredP1;
    assert.equal(demo.game.enemyBulletCollisionFilter(demo.game.ram,
      { player: MOD_RAM.player1, bank: 'A' }), true,
    'the same collision seam stops filtering after natural cabinet retirement');
    assert.equal(invincibilityWitness.filteredP1, filteredBeforeAttract);
    assert.equal(demo, sameDemo);
    assert.equal(demo.game, sameGame);

    for (let frame = 0; frame < 20; frame++) stepper.step(RELEASE);
    assert.deepEqual(activeTypes(demo.game), [0x08],
      'gameplay and ending objects retired after cabinet handoff');
    const settled = stableCabinetState(demo.game);
    for (let frame = 0; frame < 300; frame++) stepper.step(RELEASE);
    assert.deepEqual(stableCabinetState(demo.game), settled,
      'score, enemy counts, stage, and loop remain stable in returned attract');
    assert.deepEqual(activeTypes(demo.game), [0x08]);

    setCoinKey('COIN1', true);
    for (let frame = 0; frame < 30; frame++) stepper.step(RELEASE);
    setCoinKey('COIN1', false);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1,
      'the same cabinet accepted exactly one second real credit');
    for (let frame = 0; frame < 12; frame++) stepper.step(START);
    stepper.step(RELEASE);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0,
      'the second START spent exactly one credit');
    assert.ok(activeTypes(demo.game).includes(0x09),
      'the second credit created another authentic selector');
    const secondSelector = stepper.landmark('second credited cabinet selector', 10);
    assert.equal(demo.mods.runtime.cabinetRunActive, false,
      'the completed run policy remains pending through the second selector');

    chooseShip0Style2(stepper, demo);
    finishSelector(stepper, demo, 'second run');
    const secondGameplay = stepper.landmark('second credited gameplay', 5);
    assert.equal(demo.mods.runtime.cabinetRunActive, true,
      'the second credited handoff reactivated the production policies');
    assert.equal(demo, sameDemo);
    assert.equal(demo.game, sameGame);

    const secondMovement = proveStableRightMovement(stepper, demo);
    assert.ok((demo.game.ram.u16(RAM.player1 + P.state) & 0x8000) !== 0,
      'the second run remains a live playable P1 actor');

    const witness = {
      frames: stepper.frames(),
      frontiers,
      typeFrames: Object.fromEntries([...typeFrames].map(([type, frame]) => [
        `$${type.toString(16).padStart(2, '0')}`, frame,
      ])),
      cabinet: firstCabinet,
      firstGameplay,
      stages: Object.fromEntries(stageLandmarks),
      bossRush: Object.fromEntries(bossRushProgress),
      bossApproachObjects: Object.fromEntries([...bossApproachObjects].map(([key, types]) =>
        [key, [...types].map((type) => `$${type.toString(16).padStart(2, '0')}`)])),
      invincibility: {
        calls: invincibilityWitness.calls,
        filteredP1: invincibilityWitness.filteredP1,
        firstFilteredLf: invincibilityWitness.firstFilteredLf,
        lastFilteredLf: invincibilityWitness.lastFilteredLf,
        loops: [...invincibilityWitness.loops].sort(),
        stages: [...invincibilityWitness.stages].sort(),
      },
      lifecycle: Object.fromEntries(visible),
      secondSelector,
      secondGameplay,
      secondMovement,
      renderer: {
        draws: harness.puts(), missingSprite: 0, pendingSprite: 0,
        skippedSprite: 0, missingTx: 0, missingBg: 0,
      },
      coverage: 'production Boss Rush lifecycle only; ordinary stage sections are intentionally skipped',
    };
    console.log(`W632 witness ${JSON.stringify(witness)}`);
  });
