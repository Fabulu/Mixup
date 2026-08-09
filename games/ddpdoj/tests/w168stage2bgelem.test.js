// W168. The complete stage-2 background-element family.
//
// Static denominator: the adjacent ROM table $26227E..$26229D, eight entries.
// Dynamic denominator: stage-2 script 0 dispatches all eight once. The board's
// invulnerable W168 run observed them in the same order pinned below. Entry 7
// is not shortened to the apparent common-handler shape: it includes the full
// updater through $262A4A and its adjacent 32-pair animation table.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { BGELEM_HANDLERS, BGRAM, ESLOT } from '../src/background.js';
import { RomWindows } from '../src/rom.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const LADDER = path.join(ROOT, 'tools/oracle/out/w69/stage1-sweep');
const MANIFEST = path.join(LADDER, 'manifest.json');
const TABLES = path.join(ROOT, 'rip/port/player.tables.json');
const ASSET_MANIFEST = path.join(ROOT, 'assets/manifest.json');
const CK = path.join(LADDER, 'ckpt');
const HAVE = fs.existsSync(MANIFEST) && fs.existsSync(TABLES)
  && fs.existsSync(ASSET_MANIFEST)
  && fs.existsSync(path.join(CK, 'c019500.ram.bin'));
const SKIP = HAVE ? false
  : 'stage1-sweep ladder or player.tables.json absent. THIS IS A SKIP, NOT A PASS.';
const STAGE2_TABLE = 0x26227e;
const STAGE1_FFFF = 0x231704;

function tables() {
  return JSON.parse(fs.readFileSync(TABLES, 'utf8'));
}

function seededGame(bgMutate = null) {
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === 19500);
  assert.ok(rung, 'lf19500 stage1-sweep rung');
  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bytes.length >>> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  }
  return new Game(seed, tables(), {
    logicFrame: 19500, videoFrame: rung.vf, bgSeed, bgMutate,
  });
}

function stepUntil(game, done, limit, isolateBackground = false) {
  for (let i = 0; i < limit; i++) {
    // W169's authentic enemy install stops at clock $C, before this family
    // begins at $24. These W168 tests isolate the already-proven background
    // path by parking only its spawn cursor after the real install has run.
    if (isolateBackground && game.ram.u16(0x813096) === 4) {
      game.ram.setU32(0x8132cc, STAGE1_FFFF);
    }
    game.step(0xffff);
    if (done(game)) return;
  }
  assert.fail(`condition not reached in ${limit} logic frames`);
}

function slotWithUpdater(game, upd) {
  for (let s = 0; s < 8; s++) {
    const slot = BGRAM.elemSlots + s * 0x20;
    if (game.ram.u32(slot + ESLOT.update) === upd) return slot;
  }
  return null;
}

test('W168/1 ROM table and every constructor/updater dependency are closed',
  { skip: SKIP }, () => {
  const ROM = new RomWindows(tables().rom);
  const hs = BGELEM_HANDLERS.filter((h) => h.stage === 1);
  assert.equal(hs.length, 8, '$26227E..$26229D is eight adjacent longwords');
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    assert.equal(ROM.u32(STAGE2_TABLE + i * 4), h.ctor,
      `stage-2 BGELEM table entry ${i}`);
    if (i < 7) {
      assert.equal(ROM.u16(h.ctor), 0x2d7c, `entry ${i} move.l immediate`);
      assert.equal(ROM.u32(h.ctor + 2), h.data, `entry ${i} data immediate`);
      assert.equal(ROM.u16(h.ctor + 6), 0x0010, `entry ${i} data -> ($10,A6)`);
      assert.equal(ROM.u32(h.ctor + 0x10), h.upd, `entry ${i} updater immediate`);
    }
  }
  const pair = hs[7];
  assert.equal(pair.complex, 'stage2-pair');
  assert.equal(ROM.u32(pair.ctor + 2), pair.upd, 'entry 7 installs $2629AE');
  assert.equal(ROM.u16(pair.ctor + 0x0a), 0x00f8, 'reverse table offset starts at $F8');
  assert.equal(pair.animPairs, (0xf8 / 8) + 1, 'all 32 pairs, including offset zero');
  const last = pair.animTable + (pair.animPairs - 1) * 8;
  assert.equal(ROM.u32(pair.ctor + 0x10), ROM.u32(last), 'initial first stream');
  assert.equal(ROM.u32(pair.ctor + 0x18), ROM.u32(last + 4), 'initial second stream');
  assert.equal(last + 8, 0x262b4c, 'table ends exactly where stage 3 code begins');
});

test('W168/2 exporter closes all stage-2 element art from ROM structure',
  { skip: SKIP }, () => {
  const manifest = JSON.parse(fs.readFileSync(ASSET_MANIFEST, 'utf8'));
  const row = manifest.spr.harvest.find((h) => h.at === '$26227E');
  assert.ok(row, 'stage-2 BGELEM harvest row');
  assert.equal(row.entries, 8);
  assert.equal(row.runsTo, 8);
  assert.equal(row.endsAt, '$26229E');
  assert.equal(row.distinct, 53, 'seven simple streams plus the 32-pair union');
});

test('W168/3 controlled port run dispatches all eight in board occurrence order '
  + 'and reaches the stage-2 lock', { skip: SKIP }, () => {
  const game = seededGame();
  stepUntil(game, (g) => g.scrollEvents.filter((e) => e.kind === 'bgelem').length === 8,
    10000, true);
  const events = game.scrollEvents.filter((e) => e.kind === 'bgelem');
  const order = [0, 6, 1, 2, 3, 4, 5, 7];
  const hs = BGELEM_HANDLERS.filter((h) => h.stage === 1);
  assert.deepEqual(events.map((e) => e.id), order);
  assert.deepEqual(events.map((e) => e.handler), order.map((i) => hs[i].ctor));
  // This background-only gate explicitly parks the authentic W169 spawn side.
  assert.equal(game.ram.u32(0x8132cc), STAGE1_FFFF);
  stepUntil(game, (g) => g.ram.u16(BGRAM.clock) === 0x0264, 4000, true);
});

test('W168/4 deliberate data-field mutation makes the first-stage-2 gate red',
  { skip: SKIP }, () => {
  const run = (mutate) => {
    const game = seededGame(mutate);
    stepUntil(game, (g) => g.scrollEvents.some((e) => e.kind === 'bgelem'), 1200, true);
    const slot = slotWithUpdater(game, 0x2627ca);
    assert.notEqual(slot, null, '$2627AC installed $2627CA');
    return game.ram.u32(slot + ESLOT.data);
  };
  assert.equal(run(null), 0x27a078);
  assert.throws(() => assert.equal(run('delete-stage2-handler0-data'), 0x27a078));
});
