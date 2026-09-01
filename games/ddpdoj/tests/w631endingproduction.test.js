// W631: bounded six-route ending proof through the production Demo and renderer.
//
// This is intentionally an endpoint presentation proof. It patches ship/style fields in one late
// checkpoint before slot [7] exists, then runs every real emitter and production mapping through
// returned attract. It does not claim five-stage fighter provenance or replace the separate
// cold-cabinet campaign proof.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NAME_REC } from '../src/hiscorename.js';
import { MACHINE, RAM, P } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { SLOT12 } from '../src/objslot12.js';
import { SCREEN8 } from '../src/objslot8.js';
import { SLOT7 } from '../src/objslot7pool.js';
import { Ram } from '../src/ram.js';
import { RAM_STRIDE, SPRITE_LIMIT } from '../src/render/index.js';
import { RomWindows } from '../src/rom.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo, romToPackedMap } from '../src/web/app.js';
import {
  CONTROLS, clearCoin, clearTouch, currentPortWord,
  setTouchButton, setTouchDirections,
} from '../src/web/input.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ASSETS = path.join(ROOT, 'assets');
const TABLES = path.join(ROOT, 'rip/port/player.tables.json');
const IMAGE = path.join(ROOT, 'rip/sound/maincpu.bin');
const CHECKPOINT = path.join(ROOT, 'probes/checkpoints/ship0-style4-lf00151631.json');
const MANIFEST_FILE = path.join(ASSETS, 'manifest.json');
const ASSET_MANIFEST = existsSync(MANIFEST_FILE)
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

const ASSET_NAMES = Object.freeze(requiredAssetNames(ASSET_MANIFEST));
const SHARD_TOPOLOGY_PRESENT = Array.isArray(ASSET_MANIFEST?.gfx?.bg?.shards)
  && Array.isArray(ASSET_MANIFEST?.spr?.shards);
const REQUIRED_FILES = Object.freeze([
  IMAGE, TABLES, CHECKPOINT, ...ASSET_NAMES.map((name) => path.join(ASSETS, name)),
]);
const MISSING_FILES = Object.freeze(REQUIRED_FILES.filter((file) => !existsSync(file)));
const HAVE = SHARD_TOPOLOGY_PRESENT && MISSING_FILES.length === 0;
const SKIP = HAVE ? false
  : `exact checkpoint, ROM tables, or complete production bundle absent: ${MISSING_FILES.join(', ')}`;
const TABLE_JSON = HAVE ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const BASE_CHECKPOINT = HAVE ? JSON.parse(readFileSync(CHECKPOINT, 'utf8')) : null;
const PROGRAM_IMAGE = HAVE ? readFileSync(IMAGE) : null;
const TABLE_HASH = '322e5598740b7a497313c8c80978869e6e2701275cd1899a7423e00b0ae8ed60';
const CHECKPOINT_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const PAIRS = Object.freeze([
  Object.freeze([0, 2]), Object.freeze([0, 4]), Object.freeze([0, 6]),
  Object.freeze([2, 2]), Object.freeze([2, 4]), Object.freeze([2, 6]),
]);
const FAMILIES = Object.freeze([
  Object.freeze({ style: 2, selector: 0, list: 0x2914c8, intro: 0x290f1e }),
  Object.freeze({ style: 4, selector: 1, list: 0x291816, intro: 0x290f36 }),
  Object.freeze({ style: 6, selector: 2, list: 0x291b92, intro: 0x290f4e }),
]);
const OPCODE_WIDTHS = new Map([
  [0x8000, 4], [0x8001, 6], [0x8002, 4], [0x8003, 4], [0x8005, 6],
]);
const VISUAL_DELTA = 224 * 448 / 100;
const QUALIFY_FRAMES = 3;
const SUBSTANTIAL_RECORDS = 12;
const ATTRACT_SUBSTANTIAL_RECORDS = 7;

const hashJson = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashBytes = (value) => createHash('sha256').update(value).digest('hex');

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
    return { colored, colors: colors.size };
  };
  const snapshot = () => {
    assert.ok(image, 'Demo.draw() did not present a canvas image');
    const rgba = Uint8Array.from(image.data);
    return {
      rgba, ...metrics(),
      sha256: hashBytes(rgba), width: image.width, height: image.height, puts,
    };
  };
  return { canvas, metrics, snapshot, puts: () => puts };
}

function pixelDelta(a, b) {
  assert.equal(a.rgba.length, b.rgba.length);
  let changed = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    if (a.rgba[i] !== b.rgba[i] || a.rgba[i + 1] !== b.rgba[i + 1]
        || a.rgba[i + 2] !== b.rgba[i + 2]) changed++;
  }
  return changed;
}

function decodeStreams(rom, listBase) {
  const streams = new Set();
  for (let index = 0;; index++) {
    const script = rom.u32(listBase + index * 4);
    if (script === 0xffffffff) break;
    for (let at = script;;) {
      const word = rom.u16(at);
      if (word === 0xffff) break;
      if ((word & 0x8000) === 0) {
        streams.add(rom.u32(0x2902c2 + word * 4) & 0x7fffff);
        at += 2;
        continue;
      }
      const width = OPCODE_WIDTHS.get(word);
      assert.notEqual(width, undefined,
        `script at $${script.toString(16)} has known cartridge bytecode`);
      if (word === 0x8005) {
        const selector = rom.u16(at + 2);
        if (selector !== 0) {
          streams.add(rom.u32(0x290c72 + selector * 4) & 0x7fffff);
        }
      }
      at += width;
    }
  }
  return streams;
}

function readSpriteRecords(ram) {
  const records = [];
  for (let record = 0; record < SPRITE_LIMIT; record++) {
    const base = RAM.spriteList + record * RAM_STRIDE * 2;
    const w4 = ram.u16(base + 8);
    if ((w4 & 0x7fff) === 0) break;
    const w2 = ram.u16(base + 4);
    records.push({
      record,
      offset: ((w2 & 0x007f) << 16) | ram.u16(base + 6),
      width: (w4 & 0x7e00) >> 9,
      height: w4 & 0x01ff,
    });
  }
  return records;
}

function collectStreams(records, expected, seen) {
  const current = [];
  for (const record of records) {
    if (expected.has(record.offset)) {
      current.push(record);
      seen.add(record.offset);
    }
  }
  return current;
}

function derivedNameStreams(image) {
  const furniture = Array.from({ length: 24 }, (_, i) =>
    image.readUInt32BE(0x28f9ac + i * 4) & 0x7fffff);
  const panel = Array.from({ length: 29 }, (_, i) =>
    image.readUInt32BE(0x28fa24 + i * 4) & 0x7fffff);
  const scoreOffsets = Array.from({ length: 16 }, (_, i) =>
    image.readUInt16BE(0x28fc16 + i * 2));
  assert.deepEqual(scoreOffsets, [
    0x00, 0x0c, 0x18, 0x24, 0x30, 0x3c, 0x48, 0x54,
    0x60, 0x6c, 0, 0, 0, 0, 0, 0,
  ], 'the raw score table has ten digit offsets followed by six zero aliases');
  const score = scoreOffsets.slice(0, 10).map((offset) => 0x323be8 + offset);
  const header = [
    0x31f348, 0x31f374,
    ...Array.from({ length: 5 }, (_, i) =>
      image.readUInt32BE(0x28fc96 + i * 4) & 0x7fffff),
  ];
  assert.deepEqual(
    [furniture.length, panel.length, score.length, header.length],
    [24, 29, 10, 7],
    'the four cartridge structures have the exact W631 family breakdown',
  );
  const families = new Map([
    ['furniture', new Set(furniture)], ['panel', new Set(panel)],
    ['score', new Set(score)], ['header', new Set(header)],
  ]);
  const all = [...new Set([...families.values()].flatMap((set) => [...set]))];
  assert.equal(all.length, 70, 'the four structures resolve to 70 distinct type-$800C streams');
  return { families, all };
}

function assertBootMappings(bundle, structural) {
  const packed = romToPackedMap(bundle.manifest, bundle.spr.shardOfBase.bind(bundle.spr));
  assert.ok(bundle.spr.boot.includes(0), 'sprite shard 0 is a production boot shard');
  assert.equal(bundle.spr.state[0], 'ready', 'sprite shard 0 is resident before route simulation');
  for (const [family, streams] of structural.families) {
    for (const stream of streams) {
      const hit = packed.get(stream);
      const label = `${family} stream $${stream.toString(16).toUpperCase()}`;
      assert.ok(hit, `${label} has a production packed mapping`);
      assert.equal(hit[2], 0, `${label} maps to boot shard 0`);
      assert.equal(bundle.spr.shardOfBase(hit[0]), 0, `${label} is physically owned by shard 0`);
    }
  }
}

function presentationStreams(records, structural, seen) {
  const current = new Set();
  for (const record of records) {
    for (const [family, streams] of structural.families) {
      if (!streams.has(record.offset)) continue;
      current.add(family);
      seen.get(family).add(record.offset);
      break;
    }
  }
  return current;
}

function assertRemapAccounted(raw, port, key, logicFrame) {
  const label = `${key} LF${logicFrame}`;
  assert.equal(port.records, raw.length, `${label} remapper consumed every raw cartridge record`);
  assert.equal(port.missing.size, 0, `${label} has zero missing remap records`);
  assert.equal(port.pending.size, 0, `${label} has zero pending remap records`);
  assert.equal(port.skipped, 0, `${label} has zero skipped remap records`);
  assert.equal(port.records, port.drawn + port.blank,
    `${label} accounts for every record as drawn or legitimately blank`);
}

function objects(game) {
  const out = new Map();
  for (let index = 0; index < ALLOC.slots; index++) {
    const at = ALLOC.table + index * ALLOC.stride;
    const type = game.ram.u16(at);
    if (type !== 0) out.set(type & 0x7fff, at);
  }
  return out;
}

function selectedCheckpoint(ship, style) {
  const doc = structuredClone(BASE_CHECKPOINT);
  assert.deepEqual([
    doc.tablesSha256, doc.frame.logic, doc.frame.video,
    doc.raw.stage, doc.raw.loop, doc.selection.ship, doc.selection.style,
  ], [CHECKPOINT_HASH, 151631, 162268, 4, 1, 0, 4]);

  const ram = new Ram(Buffer.from(doc.ram, 'base64'));
  ram.setU16(0x813084, ship);
  ram.setU16(0x813088, style);
  ram.setU8(0x813008, ship / 2);
  ram.setU8(0x813009, (style - 2) / 2);
  ram.setU16(RAM.player1 + P.shipSel, ship);
  ram.setU16(RAM.player1 + P.optFormation, style);

  doc.tablesSha256 = TABLE_HASH;
  doc.selection = { ship, style };
  doc.ram = Buffer.from(ram.b).toString('base64');
  doc.ramSha256 = hashBytes(ram.b);
  return doc;
}

function adoptBoundedGame(demo, game) {
  demo.game = game;
  demo.seedLf = game.logicFrame;
  demo.rung = null;
  demo.progressionPokes = [];
  demo.progressionPoke = '';
  demo.prevTilt = game.ram.u16(RAM.player1 + P.tilt) << 16 >> 16;
  demo.prevShipSel = game.ram.u16(RAM.player1 + P.shipSel);
  demo.prevPos = [game.ram.u16(RAM.player1 + P.posY), game.ram.u16(RAM.player1 + P.posX)];
  demo.authenticLaunchPending = false;
  demo.dirty = true;
}

function mark(frame, kind, harness, extra = {}) {
  const image = harness.snapshot();
  assert.deepEqual([image.width, image.height], [224, 448], `${kind} canvas shape`);
  assert.ok(image.colored > 500, `${kind} canvas is visibly nonblank`);
  assert.ok(image.colors > 8, `${kind} canvas has meaningful color variation`);
  return { kind, frame, image, ...extra };
}

function auditTiles(demo) {
  const bg = demo.game.vram.w;
  for (let index = 0; index < 64 * 16; index++) {
    const tile = bg[index * 2];
    const flip = (bg[index * 2 + 1] & 0xc0) >> 6;
    demo.renderer.cache.bgGet(tile, flip);
  }
  const tx = demo.game.txvram.w;
  for (let index = 0; index < 64 * 32; index++) {
    const tile = tx[index * 2];
    const flip = (tx[index * 2 + 1] & 0xc0) >> 6;
    demo.renderer.cache.txGet(tile, flip);
  }
}

function renderLandmark(demo, harness, exact, frame, kind, qualification, extra = {}) {
  assert.equal(qualification.length, QUALIFY_FRAMES,
    `${kind} is backed by three consecutive simulation frames`);
  assert.deepEqual(qualification, [frame - 2, frame - 1, frame],
    `${kind} qualification frames are consecutive`);
  demo.draw();
  auditTiles(demo);
  assert.deepEqual([...exact.missingTxTiles], [], `${kind} requested no missing TX art`);
  assert.deepEqual([...exact.missingBgTiles], [], `${kind} requested no missing BG art`);
  return mark(demo.game.logicFrame, kind, harness, {
    qualification: [...qualification], routeFrame: frame, ...extra,
  });
}

test('W631 all six Black Label endings are complete production Demo presentations',
  { skip: SKIP, timeout: 600_000 }, async (t) => {
    assert.equal(hashJson(TABLE_JSON), TABLE_HASH, 'the current tables document has the pinned hash');
    assert.deepEqual([
      TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((bytes, window) => bytes + window.len, 0),
    ], [1151, 512_851], 'the exact 1151-window, 512851-byte ROM table is in use');

    const exact = await exactBundle();
    assert.deepEqual(exact.tables, TABLE_JSON,
      'the production browser payload contains the current cartridge tables');
    await Promise.all([
      waitForQueue(exact.bg, 'BG'),
      waitForQueue(exact.spr, 'sprite'),
    ]);
    assert.deepEqual([...requestedAssets].sort(), [...ASSET_NAMES].sort(),
      'loadBundle and both prefetchAll queues consumed every preflighted asset');
    assert.equal(exact.bg.status().ready, exact.bg.status().total, 'every BG shard is resident');
    assert.equal(exact.spr.status().ready, exact.spr.status().total,
      'every sprite shard is resident');
    assert.deepEqual([...exact.missingBgTiles], []);
    assert.deepEqual([...exact.missingTxTiles], []);

    const structural = derivedNameStreams(PROGRAM_IMAGE);
    assertBootMappings(exact, structural);

    clearCoin();
    clearTouch();
    t.after(() => { clearCoin(); clearTouch(); });
    setTouchDirections(1 << CONTROLS.DOWN);
    setTouchButton('SHOT', true);
    assert.equal(currentPortWord(), BASE_CHECKPOINT.inputWord,
      'production browser input preserves the bounded checkpoint word');

    const rom = new RomWindows(TABLE_JSON.rom);
    const families = new Map(FAMILIES.map((family) => [family.style, {
      ...family,
      ending: decodeStreams(rom, family.list),
      introStreams: decodeStreams(rom, family.intro),
    }]));
    const witnesses = [];

    for (const [ship, style] of PAIRS) {
      const key = ship + '/' + style;
      const doc = selectedCheckpoint(ship, style);
      const { game, probe } = restoreCheckpoint(doc, exact, { ship, style });
      assert.equal(probe.inputWord, currentPortWord());
      assert.equal(objects(game).has(7), false,
        key + ' starts before the ordinary ending object exists');
      assert.deepEqual([
        game.ram.u16(0x813084), game.ram.u16(0x813088),
        game.ram.u16(RAM.player1 + P.shipSel),
        game.ram.u16(RAM.player1 + P.optFormation),
      ], [ship, style, ship, style], key + ' selection is fixed before bounded startup');

      const harness = canvasHarness();
      const demo = new Demo(harness.canvas, exact, MACHINE.refreshHz);
      adoptBoundedGame(demo, game);
      const sameGame = demo.game;
      const family = families.get(style);
      const seenEnding = new Set();
      const seenIntro = new Set();
      const seenTypes = new Set();
      const presentationSeen = new Map(
        [...structural.families.keys()].map((name) => [name, new Set()]),
      );
      const qualification = { ending: [], name: [], attract: [] };
      const advanceQualification = (kind, routeFrame, qualifies) => {
        const frames = qualification[kind];
        if (!qualifies) {
          frames.length = 0;
          return false;
        }
        frames.push(routeFrame);
        if (frames.length > QUALIFY_FRAMES) frames.shift();
        return frames.length === QUALIFY_FRAMES;
      };

      let selectorSeen = false;
      let nameSeen = false;
      let resetSeen = false;
      let endingMark = null;
      let nameMark = null;
      let attractMark = null;
      let spriteRecords = 0;
      let spriteDrawn = 0;
      let spriteBlank = 0;
      let attractState2Seen = false;
      let maxAttractDrawn = 0;
      const attractStates = new Set();
      const attractSamples = [];
      let attractSampleTail = 0;

      for (let routeFrame = 1; routeFrame <= 18_000; routeFrame++) {
        const activeBefore = objects(game);
        for (const type of activeBefore.keys()) seenTypes.add(type);
        const rawSpriteRecords = readSpriteRecords(game.ram);
        const currentEnding = collectStreams(rawSpriteRecords, family.ending, seenEnding);
        const currentIntro = collectStreams(rawSpriteRecords, family.introStreams, seenIntro);
        const type12Before = activeBefore.get(12);
        const currentPresentation = type12Before == null
          ? new Set() : presentationStreams(rawSpriteRecords, structural, presentationSeen);
        const attractBefore = activeBefore.get(8);
        const attractStateBefore = attractBefore == null ? null : game.ram.u16(SCREEN8.state);
        const record = SLOT12.records[0];
        const nameMatchesBefore = type12Before != null
          && game.ram.u16(record + NAME_REC.ship) === ship
          && game.ram.u16(record + NAME_REC.style) === style;
        const nameOwedBefore = type12Before == null
          ? 0 : game.ram.u8(type12Before + SLOT12.owedAt);

        if (activeBefore.has(7) && !selectorSeen) {
          assert.equal(game.ram.u16(SLOT7.work + SLOT7.seqSel), family.selector,
            key + ' selected the style cartridge ending family');
          selectorSeen = true;
        }

        demo.step();
        assert.equal(demo.game, sameGame, key + ' continued in one unreloaded Demo');
        const port = demo.portList;
        assertRemapAccounted(rawSpriteRecords, port, key, game.logicFrame);
        spriteRecords += port.records;
        spriteDrawn += port.drawn;
        spriteBlank += port.blank;

        const live = objects(game);
        for (const type of live.keys()) seenTypes.add(type);
        const type12After = live.get(12);
        if (type12After != null) {
          const matches = game.ram.u16(record + NAME_REC.ship) === ship
            && game.ram.u16(record + NAME_REC.style) === style;
          if (game.ram.u8(type12After + SLOT12.owedAt) !== 0 && matches) nameSeen = true;
        }
        if (nameOwedBefore !== 0 && nameMatchesBefore) nameSeen = true;
        if (nameSeen && game.ram.u16(0x813092) === 0
            && game.ram.u16(0x813094) === 0 && game.ram.u16(0x813096) === 0
            && game.ram.u16(0x813098) === 0) resetSeen = true;

        const endingQualifies = activeBefore.has(7)
          && (currentEnding.length !== 0 || currentIntro.length !== 0)
          && port.drawn >= SUBSTANTIAL_RECORDS;
        if (!endingMark && advanceQualification('ending', routeFrame, endingQualifies)) {
          endingMark = renderLandmark(
            demo, harness, exact, routeFrame, key + ' ending presentation',
            qualification.ending, {
              currentEnding: currentEnding.map(({ offset }) => offset),
              currentIntro: currentIntro.map(({ offset }) => offset),
              records: port.records, drawn: port.drawn,
            },
          );
        }

        const nameQualifies = type12Before != null && nameMatchesBefore
          && nameOwedBefore !== 0
          && currentPresentation.size === structural.families.size
          && port.drawn >= SUBSTANTIAL_RECORDS;
        if (!nameMark && advanceQualification('name', routeFrame, nameQualifies)) {
          nameMark = renderLandmark(
            demo, harness, exact, routeFrame, key + ' name and score presentation',
            qualification.name, {
              emitterFamilies: [...currentPresentation].sort(),
              records: port.records, drawn: port.drawn,
            },
          );
        }

        const attractAfter = live.get(8);
        const attractStateAfter = attractAfter == null ? null : game.ram.u16(SCREEN8.state);
        if (resetSeen && (attractStateBefore === 2 || attractStateAfter === 2)) {
          attractState2Seen = true;
          attractSampleTail = 8;
        }
        if (attractSampleTail > 0) {
          attractSamples.push({ routeFrame, stateBefore: attractStateBefore,
            stateAfter: attractStateAfter, records: port.records, drawn: port.drawn });
          attractSampleTail--;
        }
        if (resetSeen && attractStateBefore != null) attractStates.add(attractStateBefore);
        if (attractState2Seen && attractBefore != null && attractAfter != null) {
          maxAttractDrawn = Math.max(maxAttractDrawn, port.drawn);
        }
        const attractQualifies = resetSeen && nameMark && attractState2Seen
          && attractBefore != null && attractAfter != null
          && port.drawn >= ATTRACT_SUBSTANTIAL_RECORDS;
        if (!attractMark && advanceQualification('attract', routeFrame, attractQualifies)) {
          attractMark = renderLandmark(
            demo, harness, exact, routeFrame, key + ' returned attract after state-2 screen',
            qualification.attract, {
              state2Seen: attractState2Seen,
              stateBefore: attractStateBefore, stateAfter: attractStateAfter,
              records: port.records, drawn: port.drawn,
            },
          );
          break;
        }
      }

      assert.deepEqual(
        [...seenTypes].filter((type) => [7, 8, 12, 14, 15].includes(type))
          .sort((a, b) => a - b),
        [7, 8, 12, 14, 15],
        key + ' traversed ending, handoff, Game Over, name, and attract objects',
      );
      assert.equal(selectorSeen, true, key + ' observed its ending selector');
      assert.equal(nameSeen, true, key + ' executed matching name and score handling');
      assert.equal(resetSeen, true, key + ' reset stage and loop state');
      assert.ok(endingMark, key + ' never held a qualifying ending landmark for three frames');
      assert.ok(nameMark, key + ' never held a qualifying name landmark for three frames');
      assert.ok(attractMark,
        key + ' never held a substantial visible attract landmark after state 2 for three frames; '
          + JSON.stringify({ attractState2Seen, maxAttractDrawn,
            attractStates: [...attractStates], attractSamples }));
      assert.deepEqual([...family.ending].filter((offset) => !seenEnding.has(offset)), [],
        key + ' did not emit every exact original ending stream ID');
      assert.deepEqual([...family.introStreams].filter((offset) => !seenIntro.has(offset)), [],
        key + ' did not emit every exact original intro stream ID');
      for (const [emitterFamily, seen] of presentationSeen) {
        assert.ok(seen.size > 0,
          key + ' did not execute the ' + emitterFamily + ' presentation emitter family');
      }
      assert.ok(spriteRecords > 0 && spriteDrawn > 0);
      assert.ok(pixelDelta(endingMark.image, nameMark.image) > VISUAL_DELTA,
        key + ' ending and name canvases are not meaningfully distinct');
      assert.ok(pixelDelta(nameMark.image, attractMark.image) > VISUAL_DELTA,
        key + ' name and attract canvases are not meaningfully distinct');
      assert.ok(pixelDelta(endingMark.image, attractMark.image) > VISUAL_DELTA,
        key + ' ending and attract canvases are not meaningfully distinct');
      assert.equal(harness.puts(), 3,
        key + ' rendered only the three production landmark frames');

      const row = {
        pair: key,
        family: family.selector,
        frames: {
          ending: endingMark.frame, name: nameMark.frame, attract: attractMark.frame,
        },
        routeFrames: {
          ending: endingMark.qualification,
          name: nameMark.qualification,
          attract: attractMark.qualification,
        },
        ending: {
          sha256: endingMark.image.sha256,
          colored: endingMark.image.colored,
          colors: endingMark.image.colors,
        },
        name: {
          sha256: nameMark.image.sha256,
          colored: nameMark.image.colored,
          colors: nameMark.image.colors,
        },
        attract: {
          sha256: attractMark.image.sha256,
          colored: attractMark.image.colored,
          colors: attractMark.image.colors,
          records: attractMark.records,
          drawn: attractMark.drawn,
        },
        deltaPixels: {
          endingToName: pixelDelta(endingMark.image, nameMark.image),
          nameToAttract: pixelDelta(nameMark.image, attractMark.image),
          endingToAttract: pixelDelta(endingMark.image, attractMark.image),
        },
        streams: {
          ending: seenEnding.size,
          intro: seenIntro.size,
          emitters: Object.fromEntries(
            [...presentationSeen].map(([name, seen]) => [name, seen.size]),
          ),
        },
        sprites: { records: spriteRecords, drawn: spriteDrawn, blank: spriteBlank },
        missing: { sprite: 0, pending: 0, tx: 0, bg: 0 },
        draws: harness.puts(),
      };
      witnesses.push(row);
      console.log('W631 witness ' + JSON.stringify(row));
      clearTouch();
      setTouchDirections(1 << CONTROLS.DOWN);
      setTouchButton('SHOT', true);
    }

    assert.equal(witnesses.length, 6);
    assert.deepEqual(witnesses.map(({ pair, family }) => [pair, family]), [
      ['0/2', 0], ['0/4', 1], ['0/6', 2], ['2/2', 0], ['2/4', 1], ['2/6', 2],
    ]);
  });
