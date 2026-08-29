// W596: authentic ship-0/style-6 variant-2 third slot-[7] script frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAnimObjects24683E } from '../src/animobjects.js';
import { applyAuthenticSelection } from '../src/authentic.js';
import { portWordFromBits } from '../src/input.js';
import { RAM, P } from '../src/machine.js';
import { Game } from '../src/main.js';
import {
  POOL7, SCRIPT7, SLOT7, scriptStep2909AA, sequenceDriver291470,
} from '../src/objslot7pool.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { loadBundle } from '../src/web/assets.js';
import { CONTROLS } from '../src/web/input.js';
import {
  CHECKPOINT_SCHEMA, checkpointDocument, restoreCheckpoint,
} from '../tools/progression-checkpoint.mjs';
import { round2Input } from '../tools/progression-probe.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_BYTES, ROM_WINDOW_COUNT,
  overlappingPairs, tableBeforeW596, tableBeforeW598,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const EXPORTER = here('../tools/export-tables.py');
const ASSETS = here('../assets');
const WITNESS = here('./w596slot7variant2.hashes.json');
const required = [
  TABLES, IMAGE, EXPORTER, WITNESS,
  path.join(ASSETS, 'manifest.json'), path.join(ASSETS, 'seed.bin.gz'),
  path.join(ASSETS, 'player.tables.json.gz'),
];
const SKIP = required.every(existsSync) ? false
  : 'exact W596 image, tables, fixture, or web bundle absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const EXPECTED = JSON.parse(readFileSync(WITNESS, 'utf8'));
const PRIOR_TABLE = SKIP ? null : tableBeforeW596(TABLE_JSON);
const W597_TABLE = SKIP ? null : tableBeforeW598(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const PRIOR_ROM = SKIP ? null : new RomWindows(PRIOR_TABLE.rom);

const SCRIPT = 0x29109c;
const SCRIPT_END = 0x2910f6;
const VARIANT_2_LIST = 0x290f4e;
const TABLE_HASH = 'dbffbc266495d330397680b012a61ed3c2141e8c3fc9d979f1d752b835fe6914';
const W597_TABLE_HASH = '46064f29e4cde17e95d86b1a823e82d852346ca80325ed5ea9fbcbb6ddbda4c9';
const PRIOR_TABLE_HASH = '706201adef09d00737f1fafc687e52d12ab81f437bc842690af229afab258445';
const STORED_TABLE_HASH = '1b5e97385bc33328b5ce9b3e253b91f61576f4ffe2dd6311ef80542edfb1a6e9';
const STORED_PRIOR_TABLE_HASH = '18fd1b8ac5c4b066e1d310d10da39d363f8a848e2a40b1894a040a0cd12a82c8';
const SCRIPT_HASH = '16c0eea9d901d6fd6bc9a7fcaf19673282402c73fc70ef21e843a568f5597163';
const SEED_HASH = '6886bc97b999e3dc0263b8e2d2cdf1df701be09b3039d9de46cdfbe870f9c0fb';
const CHECKPOINT_RAM_HASH = 'a1868acf2e7836a6e2d7a0eb89bb0c7e69727f6e529b1613570fe084b21f6a7f';
const CHECKPOINT_GAME_HASH = '22fec617983a27c0af7cd576775210b3d37bd4365daba00f75a5cfff8113f04b';
const PAIR = Object.freeze({ ship: 0, style: 6 });
const RAW = Object.freeze({
  stage: 0x813092, stageX2: 0x813094, stageX4: 0x813096, loop: 0x813098,
});
const POSITIONS = Object.freeze([
  ...Array.from({ length: 9 }, (_, index) => 0x48000200 + index * 0x400),
  ...Array.from({ length: 12 }, (_, index) => 0x40000200 + index * 0x400),
  ...Array.from({ length: 8 }, (_, index) => 0x38000200 + index * 0x400),
]);
const WINDOW_SPECS = Object.freeze([
  Object.freeze([0x29109c, 0x005a]), Object.freeze([0x2904ae, 0x0004]),
]);
const word = (...names) => portWordFromBits(names.map((name) => CONTROLS[name]));
const DOWN_SHOT = word('DOWN', 'SHOT');
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const binaryHash = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const faultAt = (address) => (error) => error?.romAddress === address;
function captureFault(action, address) {
  try {
    action();
  } catch (error) {
    assert.equal(error?.romAddress, address);
    return error;
  }
  assert.fail(`expected ROM fault at $${address.toString(16).toUpperCase()}`);
}
const windowShape = (tables) => tables.rom.windows.map((window) => [
  Number.parseInt(window.base.slice(1), 16), window.len,
]);
const rawPosition = (game) => ({
  stage: game.ram.u16(RAW.stage), stageX2: game.ram.u16(RAW.stageX2),
  stageX4: game.ram.u16(RAW.stageX4), loop: game.ram.u16(RAW.loop),
});
const livePoolRecords = (ram) => Array.from({ length: POOL7.entries }, (_, index) => {
  const at = POOL7.base + index * POOL7.stride;
  return { art: ram.u32(at), position: ram.u32(at + 4), kind: ram.u16(at + 8) };
}).filter(({ art }) => art !== 0);

function parseScriptShape(rom, start, end) {
  const commands = [];
  const groups = [];
  let at = start;
  while (at < end) {
    const opcodeAt = at;
    const opcode = rom.u16(at);
    at += 2;
    commands.push(opcode);
    if (opcode === 0xffff) break;
    if (opcode === 0x8001) {
      at += 4;
      const group = [];
      while (at < end && rom.u16(at) < 0x8000) {
        group.push({ at, value: rom.u16(at) });
        at += 2;
      }
      groups.push(group);
    } else if (opcode === 0x8000 || opcode === 0x8002 || opcode === 0x8003) {
      at += 2;
    } else {
      throw new Error(`unexpected script opcode $${opcode.toString(16)} at $${opcodeAt.toString(16)}`);
    }
  }
  return { commands, groups, end: at };
}

function identity(game, bundle, inputWord, stepped) {
  const state = checkpointDocument(game, bundle, {
    ...PAIR, inputWord, invulnerable: true,
  });
  return [
    stepped, state.frame.logic, state.frame.video,
    state.raw.stage, state.raw.stageX2, state.raw.stageX4, state.raw.loop,
    state.inputWord, state.ramSha256, state.gameSha256,
  ];
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W596 exports only the exact variant-2 script and sole missing dependency',
  { skip: SKIP }, () => {
    assert.deepEqual([
      canonicalHash(TABLE_JSON), TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(TABLE_JSON)),
    ], [TABLE_HASH, ROM_WINDOW_COUNT, ROM_WINDOW_BYTES, ROM_OVERLAP_PAIRS]);
    assert.deepEqual([
      canonicalHash(PRIOR_TABLE), PRIOR_TABLE.rom.windows.length,
      PRIOR_TABLE.rom.windows.reduce((sum, window) => sum + window.len, 0),
      overlappingPairs(windowShape(PRIOR_TABLE)),
    ], [PRIOR_TABLE_HASH, 907, 453765, 77]);

    const windows = TABLE_JSON.rom.windows.filter((window) => window.why.startsWith('W596:'));
    assert.deepEqual(windows.map(({ base, len }) => [base, len]), [
      ['$29109C', 0x005a], ['$2904AE', 0x0004],
    ]);
    for (let index = 0; index < WINDOW_SPECS.length; index++) {
      const [base, len] = WINDOW_SPECS[index];
      assert.equal(windows[index].hex, IMG.subarray(base, base + len).toString('hex'));
    }
    assert.equal(binaryHash(IMG.subarray(SCRIPT, SCRIPT_END)), SCRIPT_HASH);
    const shape = parseScriptShape(ROM, SCRIPT, SCRIPT_END);
    const indices = shape.groups.flat();
    assert.deepEqual(shape.commands, [
      0x8000, 0x8001, 0x8001, 0x8001, 0x8002, 0x8003, 0xffff,
    ]);
    assert.equal(shape.end, SCRIPT_END);
    assert.deepEqual(shape.groups.map((group) => group.length), [9, 12, 8]);
    assert.equal(indices.length, 29);
    assert.equal(new Set(indices.map(({ value }) => value)).size, 24);
    assert.deepEqual(indices.filter(({ value }) => value === 0x7b), [{
      at: SCRIPT + 0x0c, value: 0x7b,
    }], 'index $7B occurs only as the second plain word in the first group');

    assert.equal(PRIOR_ROM.u16(SCRIPT - 2), 0xffff,
      'W588 ends exactly below W596');
    assert.throws(() => PRIOR_ROM.u16(SCRIPT), faultAt(SCRIPT));
    assert.equal(ROM.u16(SCRIPT_END - 2), 0xffff);
    assert.equal(ROM.u16(SCRIPT_END), 0x8000,
      'W507 begins exactly above W596');
    assert.deepEqual([
      ROM.u32(0x290f56),
      TABLE_JSON.rom.windows.find((window) => window.base === '$291040').base,
      TABLE_JSON.rom.windows.find((window) => window.base === '$2910F6').base,
      TABLE_JSON.rom.windows.find((window) => window.base === '$2904AA').base,
      TABLE_JSON.rom.windows.find((window) => window.base === '$2904B2').base,
    ], [SCRIPT, '$291040', '$2910F6', '$2904AA', '$2904B2']);

    const uniqueIndices = new Set(indices.map(({ value }) => value));
    const missing = [];
    for (const index of uniqueIndices) {
      try {
        PRIOR_ROM.u32(SCRIPT7.spawnTable + index * 4);
      } catch (error) {
        if (!faultAt(SCRIPT7.spawnTable + index * 4)(error)) throw error;
        missing.push(index);
      }
    }
    assert.deepEqual(missing, [0x7b], 'the other 23 unique dependencies pre-exist W596');
    for (const index of uniqueIndices) {
      const at = SCRIPT7.spawnTable + index * 4;
      assert.equal(ROM.u32(at), IMG.readUInt32BE(at));
    }
    assert.notEqual(ROM.u32(0x2904ae), 0,
      'the interpreter stores this cartridge longword directly as art identity');

    const exporter = readFileSync(EXPORTER, 'utf8');
    for (const [base, len] of WINDOW_SPECS) {
      const row = `(0x${base.toString(16).toUpperCase()}, 0x${len.toString(16)
        .toUpperCase().padStart(4, '0')},`;
      assert.equal(exporter.split(row).length - 1, 1, `${row} is declared exactly once`);
    }
    assert.deepEqual(tableBeforeW596(PRIOR_TABLE), PRIOR_TABLE,
      'the exact W595 reconstruction remains idempotent');
    const partial = clone(TABLE_JSON);
    partial.rom.windows = partial.rom.windows.filter((window) => window.base !== '$2904AE');
    assert.throws(() => tableBeforeW596(partial), /only partially present/);
    const malformed = clone(TABLE_JSON);
    malformed.rom.windows.find((window) => window.base === '$29109C').len--;
    assert.throws(() => tableBeforeW596(malformed), /not the exact W596 additive shape/);
    const duplicate = clone(TABLE_JSON);
    duplicate.rom.windows.push(clone(windows[0]));
    assert.throws(() => tableBeforeW596(duplicate), /only partially present/);
  });

test('W596 has independent script and dependency red controls', { skip: SKIP }, () => {
  const noScriptRam = new Ram();
  assert.throws(() => scriptStep2909AA(noScriptRam, PRIOR_ROM, {}, SCRIPT), faultAt(SCRIPT),
    'the exact post-W595 table faults on the first script word');

  const scriptOnlyTable = clone(PRIOR_TABLE);
  scriptOnlyTable.rom.windows.push(clone(TABLE_JSON.rom.windows.find((window) =>
    window.base === '$29109C')));
  const scriptOnlyRom = new RomWindows(scriptOnlyTable.rom);
  const missingPointerRam = new Ram();
  assert.equal(scriptStep2909AA(missingPointerRam, scriptOnlyRom, {}, SCRIPT), true);
  assert.deepEqual(livePoolRecords(missingPointerRam), [{
    art: scriptOnlyRom.u32(SCRIPT7.spawnTable + 0x7a * 4),
    position: 0x48000200,
    kind: 0,
  }], 'the first spawn succeeds with only the script window');
  assert.throws(() => scriptStep2909AA(missingPointerRam, scriptOnlyRom, {}, SCRIPT),
    faultAt(0x2904ae), 'the second spawn independently faults on index $7B');
});

test('W596 spawns 9/12/8 groups, completes resource 0, rejects truncation, and clears',
  { skip: SKIP }, () => {
    const shape = parseScriptShape(ROM, SCRIPT, SCRIPT_END);
    const indices = shape.groups.flat().map(({ value }) => value);
    const ram = new Ram();
    for (let index = 0; index < indices.length; index++) {
      assert.equal(scriptStep2909AA(ram, ROM, {}, SCRIPT), true);
      assert.equal(livePoolRecords(ram).length, index + 1);
    }
    assert.deepEqual(livePoolRecords(ram), indices.map((pictureIndex, index) => ({
      art: ROM.u32(SCRIPT7.spawnTable + pictureIndex * 4),
      position: POSITIONS[index] >>> 0,
      kind: 0,
    })));
    assert.deepEqual([
      ram.u16(SCRIPT7.cursor), ram.u16(SCRIPT7.loopCount),
    ], [0x50, 0]);

    for (let wait = 1; wait <= 192; wait++) {
      assert.equal(scriptStep2909AA(ram, ROM, {}, SCRIPT), true);
      assert.deepEqual([
        ram.u16(SCRIPT7.cursor), ram.u16(SCRIPT7.loopCount), ram.u32(SCRIPT7.resource),
      ], [0x50, wait, 0]);
    }
    assert.equal(scriptStep2909AA(ram, ROM, {}, SCRIPT), true);
    assert.equal(ram.u16(SCRIPT7.cursor), 0x54);
    assert.equal(ram.u16(SCRIPT7.loopCount), 0);
    assert.equal(ROM.u32(SCRIPT7.resTable), 0x290e58);
    const handle = ram.u32(SCRIPT7.resource);
    const node = ram.u32(handle + 0x2c);
    assert.notEqual(handle, 0);
    assert.notEqual(node, 0);
    assert.notEqual(ram.u16(handle) & 0x8000, 0);
    assert.notEqual(ram.u16(node) & 0x8000, 0);

    let resourceFrames = 0;
    let running = true;
    while (running && resourceFrames < 1000) {
      runAnimObjects24683E(ram, ROM);
      running = scriptStep2909AA(ram, ROM, {}, SCRIPT);
      resourceFrames++;
    }
    assert.equal(running, false, 'resource completion reaches the script terminator');
    assert.ok(resourceFrames > 0 && resourceFrames < 1000);
    assert.equal(ram.u32(SCRIPT7.resource), 0);
    assert.equal(ram.u16(handle) & 0x8000, 0);
    assert.equal(ram.u16(node) & 0x8000, 0);
    assert.equal(ram.u16(SCRIPT7.cursor), 0x58,
      'the cursor advances past $8003 and stops on $FFFF');

    const a5 = 0x80e300;
    const a6 = SLOT7.work;
    ram.setU16(a6 + 0x06, 1);
    ram.setU16(a6 + 0x0c, 8);
    sequenceDriver291470(ram, ROM, { palette: null }, a5, a6, VARIANT_2_LIST);
    assert.equal(ram.u16(a6 + 0x0c), 12);
    assert.deepEqual(livePoolRecords(ram), []);
    assert.deepEqual([
      ram.u16(SCRIPT7.cursor), ram.u16(SCRIPT7.counter), ram.u16(SCRIPT7.loopCount),
      ram.u32(SCRIPT7.resource), ram.u32(SCRIPT7.scriptPtr),
    ], [0, 0, 0, 0, 0]);

    const shortTable = clone(TABLE_JSON);
    const shortWindow = shortTable.rom.windows.find((window) => window.base === '$29109C');
    shortWindow.len = 0x0058;
    shortWindow.hex = shortWindow.hex.slice(0, 0x0058 * 2);
    const shortRom = new RomWindows(shortTable.rom);
    assert.throws(() => shortRom.u16(SCRIPT_END - 2), faultAt(SCRIPT_END - 2),
      'a script window clipped before its terminator is rejected');
  });

test('W596 fresh ship-0/style-6 route pins every cadence identity and stops at the next frontier',
  { skip: SKIP }, async () => {
    assert.equal(EXPECTED.schema, 'ddpdoj.w596-route-hashes.v1');
    assert.equal(EXPECTED.checkpointSchema, CHECKPOINT_SCHEMA);
    assert.deepEqual(EXPECTED.identityColumns, [
      'stepped', 'logicFrame', 'videoFrame', 'rawStage', 'rawStageX2',
      'rawStageX4', 'rawLoop', 'inputWord', 'ramSha256', 'gameSha256',
    ]);
    assert.deepEqual(EXPECTED.selection, PAIR);
    assert.deepEqual(EXPECTED.probe, {
      invulnerable: true,
      inputStateMachine: 'tools/progression-probe.mjs round2Input',
      cadence: 500,
      startInputWord: DOWN_SHOT,
    });
    assert.deepEqual(EXPECTED.seed, { bytes: 131072, sha256: SEED_HASH });
    assert.deepEqual(EXPECTED.tables, {
      sha256: STORED_TABLE_HASH, windows: 941, bytes: 457059, overlapPairs: 77,
    });
    assert.deepEqual(EXPECTED.preW596Tables, {
      sha256: STORED_PRIOR_TABLE_HASH, windows: 906, bytes: 453757, overlapPairs: 77,
    });
    assert.equal(EXPECTED.periodic.length, 302);
    assert.equal(EXPECTED.periodic.at(-1)[0], 151000);

    const exact = await bundle();
    assert.deepEqual(exact.tables, TABLE_JSON);
    assert.deepEqual([
      exact.seed.byteLength, binaryHash(exact.seed), canonicalHash(exact.tables),
    ], [131072, SEED_HASH, TABLE_HASH]);

    const game = new Game(exact.seed, exact.tables, {
      logicFrame: exact.cap.frames[0].lf,
      videoFrame: exact.cap.frames[0].vf,
      bgSeed: exact.cap.part(0, 'bg'),
    });
    applyAuthenticSelection(game, PAIR);
    let inputWord = DOWN_SHOT;
    assert.deepEqual(identity(game, exact, inputWord, 0), EXPECTED.start);
    assert.deepEqual([
      game.logicFrame, game.videoFrame, ...Object.values(rawPosition(game)),
    ], [2000, 2036, 0, 0, 0, 0]);

    const periodic = [];
    let firstFrontier = null;
    let nextFrontier = null;
    for (let attempted = 1; attempted <= 151365; attempted++) {
      game.ram.setU8(RAM.player1 + P.invuln, 0xff);
      inputWord = round2Input(game, inputWord);

      if (attempted === 150593) {
        const beforeIdentity = identity(game, exact, inputWord, attempted - 1);
        assert.deepEqual(beforeIdentity, EXPECTED.firstFrontier.beforeIdentity);
        const currentDocument = checkpointDocument(game, exact, {
          ...PAIR, inputWord, invulnerable: true,
        });
        const priorBundle = { ...exact, tables: PRIOR_TABLE };
        const priorDocument = { ...currentDocument, tablesSha256: PRIOR_TABLE_HASH };
        assert.equal(currentDocument.tablesSha256, TABLE_HASH);
        assert.deepEqual([
          priorDocument.ramSha256, priorDocument.gameSha256,
        ], [currentDocument.ramSha256, currentDocument.gameSha256],
        'switching only the table identity preserves exact RAM and serialized Game hashes');
        const reconstructed = restoreCheckpoint(priorDocument, priorBundle, PAIR);
        const error = captureFault(() => reconstructed.game.step(inputWord), SCRIPT);
        firstFrontier = {
          attempted, successful: attempted - 1,
          logicFrame: reconstructed.game.logicFrame,
          videoFrame: reconstructed.game.videoFrame,
          raw: rawPosition(reconstructed.game), inputWord, address: error.romAddress,
          beforeIdentity,
        };
      }

      if (attempted === 151365) {
        const beforeIdentity = identity(game, exact, inputWord, attempted - 1);
        assert.deepEqual(beforeIdentity, EXPECTED.nextFrontier.beforeIdentity);
        const currentDocument = checkpointDocument(game, exact, {
          ...PAIR, inputWord, invulnerable: true,
        });
        const w597Bundle = { ...exact, tables: W597_TABLE };
        const w597Document = { ...currentDocument, tablesSha256: W597_TABLE_HASH };
        assert.equal(currentDocument.tablesSha256, TABLE_HASH);
        const reconstructed = restoreCheckpoint(w597Document, w597Bundle, PAIR);
        const error = captureFault(() => reconstructed.game.step(inputWord), 0x291bae);
        nextFrontier = {
          attempted, successful: attempted - 1,
          logicFrame: reconstructed.game.logicFrame,
          videoFrame: reconstructed.game.videoFrame,
          raw: rawPosition(reconstructed.game), inputWord, address: error.romAddress,
          beforeIdentity,
        };
        break;
      }

      game.step(inputWord);
      if (attempted % 500 === 0 && attempted <= 151000) {
        periodic.push(identity(game, exact, inputWord, attempted));
      }
    }

    assert.deepEqual(firstFrontier, EXPECTED.firstFrontier,
      'the exact post-W595 reconstruction faults at $29109C on attempted step 150593');
    assert.deepEqual(periodic, EXPECTED.periodic,
      'every checkpointDocument identity through successful step 151000 is exact');
    assert.deepEqual(EXPECTED.checkpoint151000, [
      151000, 153000, 163545, 4, 8, 16, 1, DOWN_SHOT,
      CHECKPOINT_RAM_HASH, CHECKPOINT_GAME_HASH,
    ]);
    assert.deepEqual(periodic.at(-1), EXPECTED.checkpoint151000);
    assert.deepEqual(nextFrontier, EXPECTED.nextFrontier,
      'W596 stops at the distinct $291BAE W597 frontier without exporting it');
    assert.deepEqual([
      nextFrontier.attempted, nextFrontier.logicFrame, nextFrontier.videoFrame,
      ...Object.values(nextFrontier.raw), nextFrontier.address,
    ], [151365, 153364, 163910, 4, 8, 16, 1, 0x291bae]);
  });
