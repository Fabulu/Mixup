// W628: Invincibility filters ordinary P1 bullets without owning the cartridge's
// protection byte or preventing the no-loop ending and cabinet handoff.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DMG } from '../src/damage.js';
import { NAME_REC } from '../src/hiscorename.js';
import { HUDRAM } from '../src/hud.js';
import { ALLOC } from '../src/objalloc.js';
import { SLOT12 } from '../src/objslot12.js';
import { MOD_RAM, applyPostFrameMods, applyPreFrameMods,
  createModState, modGameOptions, resolveLoadout } from '../src/mods.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';

const here = (value) => fileURLToPath(new URL(value, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00076211.json');
const ASSETS = here('../assets');
const REQUIRED = [
  TABLES, CHECKPOINT, path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz'),
];
const SKIP = REQUIRED.every(existsSync) ? false
  : 'exact Stage 5 checkpoint, current tables, or browser bundle absent; this is a skip, not a pass';
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const BASE_CHECKPOINT = SKIP ? null : JSON.parse(readFileSync(CHECKPOINT, 'utf8'));

const TABLE_HASH = '322e5598740b7a497313c8c80978869e6e2701275cd1899a7423e00b0ae8ed60';
const CHECKPOINT_TABLE_HASH = '145945830be69de56a76312f0d44aaedd47519083d0da70fce2361ea06dba289';

const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');

async function bundle() {
  return loadBundle(async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

function objectByType(ram, wanted) {
  for (let index = 0; index < ALLOC.slots; index++) {
    const at = ALLOC.table + index * ALLOC.stride;
    if ((ram.u16(at) & 0x7fff) === wanted && ram.u16(at) !== 0) return at;
  }
  return null;
}

function liveObjectTypes(ram) {
  const types = [];
  for (let index = 0; index < ALLOC.slots; index++) {
    const at = ALLOC.table + index * ALLOC.stride;
    const type = ram.u16(at);
    if (type !== 0) types.push(type & 0x7fff);
  }
  return types.sort((a, b) => a - b);
}

test('W628 Invincibility reaches no-loop name handling and stable attract',
  { skip: SKIP, timeout: 180_000 }, async () => {
    assert.equal(canonicalHash(TABLE_JSON), TABLE_HASH,
      'the regression uses the current exact cartridge table set');
    assert.deepEqual([
      BASE_CHECKPOINT.tablesSha256,
      BASE_CHECKPOINT.frame.logic, BASE_CHECKPOINT.frame.video,
      BASE_CHECKPOINT.raw.stage, BASE_CHECKPOINT.raw.loop,
      BASE_CHECKPOINT.selection.ship, BASE_CHECKPOINT.selection.style,
      BASE_CHECKPOINT.probeOnly.invulnerable,
    ], [CHECKPOINT_TABLE_HASH, 76211, 80246, 4, 0, 0, 4, true]);

    const currentBundle = await bundle();
    assert.deepEqual(currentBundle.tables, TABLE_JSON,
      'the production browser bundle contains the current tables');
    const adopted = { ...BASE_CHECKPOINT, tablesSha256: TABLE_HASH };
    const { game, probe } = restoreCheckpoint(adopted, currentBundle, { ship: 0, style: 4 });
    const mods = createModState(resolveLoadout(['invincibility']));
    const options = modGameOptions(mods);
    assert.deepEqual(Object.keys(options), ['enemyBulletCollisionFilter']);
    game.enemyBulletCollisionFilter = options.enemyBulletCollisionFilter;

    assert.deepEqual([
      game.ram.u16(0x813092), game.ram.u16(0x813094),
      game.ram.u16(0x813096), game.ram.u16(0x813098),
    ], [4, 8, 16, 0], 'the route begins at Stage 5 in the first loop');
    const protection = game.ram.u8(MOD_RAM.invulnP1);
    assert.equal(protection, 0xff, 'the exact boss-clear checkpoint owns its protection state');
    applyPreFrameMods(mods, game.ram);
    applyPostFrameMods(mods, game.ram);
    assert.equal(game.ram.u8(MOD_RAM.invulnP1), protection,
      'Invincibility frame policy does not replace cartridge protection state');

    let frames = 0;
    const step = () => {
      applyPreFrameMods(mods, game.ram);
      game.step(probe.inputWord);
      applyPostFrameMods(mods, game.ram);
      frames++;
    };
    const reach = (label, limit, predicate) => {
      const start = frames;
      while (frames - start < limit) {
        step();
        const witness = predicate();
        if (witness) return witness;
      }
      assert.fail(`${label} did not occur within ${limit} logic frames`);
    };

    reach('stage-clear arm', 160, () => game.ram.u16(0x812972) !== 0);
    reach('type $06 stage-clear object', 3, () => objectByType(game.ram, 6));
    reach('type $13 ending tally', 300, () => objectByType(game.ram, 0x13));
    reach('type $07 ordinary ending', 200, () => objectByType(game.ram, 7));
    reach('type $0F Game Over presentation', 4_600, () => objectByType(game.ram, 0x0f));
    reach('type $0E handoff', 5, () => objectByType(game.ram, 0x0e));
    const slot12 = reach('type $0C name handling', 400, () => objectByType(game.ram, 0x0c));
    reach('initialized P1 name record', 20, () => {
      const slot = objectByType(game.ram, 0x0c);
      return slot != null && game.ram.u8(slot + SLOT12.owedAt) !== 0 ? slot : null;
    });

    const name = SLOT12.records[0];
    assert.equal(slot12, objectByType(game.ram, 0x0c));
    assert.deepEqual([
      game.ram.u8(slot12 + SLOT12.owedAt),
      game.ram.u16(name + NAME_REC.ship), game.ram.u16(name + NAME_REC.style),
    ], [1, 0, 4], 'P1 reaches its matching cartridge name-entry record');
    assert.notEqual(game.ram.u32(name + NAME_REC.score), 0,
      'name handling receives the completed nonzero run score');

    reach('type $08 attract handoff', 2_200, () => objectByType(game.ram, 8));
    assert.ok(frames <= 7_700, `bounded ending used ${frames} frames`);
    assert.deepEqual([
      game.ram.u16(0x813092), game.ram.u16(0x813094),
      game.ram.u16(0x813096), game.ram.u16(0x813098),
    ], [0, 0, 0, 0], 'name teardown resets stage and loop before attract');

    for (let n = 0; n < 20; n++) step();
    assert.deepEqual(liveObjectTypes(game.ram), [8],
      'the gameplay and ending objects have retired after cabinet handoff');
    const settled = [
      game.ram.u32(HUDRAM.totalP1), game.ram.u32(HUDRAM.pendingP1),
      game.ram.u16(DMG.poolACount), game.ram.u16(DMG.poolBCount),
      game.ram.u16(0x813092), game.ram.u16(0x813098),
    ];
    for (let n = 0; n < 300; n++) step();
    assert.deepEqual([
      game.ram.u32(HUDRAM.totalP1), game.ram.u32(HUDRAM.pendingP1),
      game.ram.u16(DMG.poolACount), game.ram.u16(DMG.poolBCount),
      game.ram.u16(0x813092), game.ram.u16(0x813098),
    ], settled, 'score, enemy counts, stage, and loop stay settled in attract');
    assert.deepEqual(liveObjectTypes(game.ram), [8]);
  });
