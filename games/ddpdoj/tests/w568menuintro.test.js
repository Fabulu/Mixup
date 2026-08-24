// W568: slot-7 menu cursor word width, exact intro export, and loop-2 transition.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANIM_OBJECT } from '../src/animobjects.js';
import { RAM, P } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { MENU2911B0, SLOT7 } from '../src/objslot7pool.js';
import { RomWindows } from '../src/rom.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import { ROM_OVERLAP_PAIRS, overlappingPairs } from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const EXPORTER = here('../tools/export-tables.py');
const SLOT7_SOURCE = here('../src/objslot7pool.js');
const ASSETS = here('../assets');
const START = here('../probes/checkpoints/ship0-style4-lf00076719.json');
const PERIODIC = here('../probes/checkpoints/ship0-style4-lf00077219.json');
const FINAL = here('../probes/checkpoints/ship0-style4-lf00077631.json');
const PRIOR_HASH = '145945830be69de56a76312f0d44aaedd47519083d0da70fce2361ea06dba289';
const TABLE_HASH = 'a972deffd954503fe4752e93bbc4d3cc5205472c352dc05a0416bd948af944c7';
const INTRO_HASH = '6bce608701378f07dc56b0f0bc9b0ad5e663cbe99bec2537bf91b29e7fd0c3f2';
const RELEASE = 0xffff;
const LEFT = 0xfff7;
const SHOT = 0xffdf;

const WINDOW_SPECS = Object.freeze([
  Object.freeze([0x29139e, 0x00d2, null, null]),
  Object.freeze([0x2902ca, 0x0004, 0x02, 0x001ea840]),
  Object.freeze([0x2902e2, 0x0004, 0x08, 0x001ea918]),
  Object.freeze([0x2903e6, 0x0004, 0x49, 0x001eb23c]),
  Object.freeze([0x2903f2, 0x0004, 0x4c, 0x001eb2a8]),
  Object.freeze([0x29040a, 0x0004, 0x52, 0x001eb380]),
  Object.freeze([0x29041a, 0x0004, 0x56, 0x001eb410]),
  Object.freeze([0x290442, 0x0004, 0x60, 0x001eb578]),
  Object.freeze([0x290462, 0x0004, 0x68, 0x001eb698]),
  Object.freeze([0x29051a, 0x0004, 0x96, 0x001ebd10]),
  Object.freeze([0x29058e, 0x0004, 0xb3, 0x001ec124]),
  Object.freeze([0x2905a2, 0x0004, 0xb8, 0x001ec1d8]),
  Object.freeze([0x2905ca, 0x0004, 0xc2, 0x001ec340]),
  Object.freeze([0x2906c6, 0x0004, 0x101, 0x001ecc1c]),
]);
const WINDOW_BASES = new Set(WINDOW_SPECS.map(([base]) => `$${base.toString(16).toUpperCase()}`));
const required = [TABLES, IMAGE, EXPORTER, SLOT7_SOURCE, START, PERIODIC, FINAL,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')];
const SKIP = required.every(existsSync) ? false
  : 'exact W568 tables, image, assets, or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const PRIOR_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(TABLE_JSON));
  copy.rom.windows = copy.rom.windows.filter((w) => !WINDOW_BASES.has(w.base));
  return copy;
})();
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bundle = async () => loadBundle(
  async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

function liveObject(ram, type) {
  for (let i = 0; i < ALLOC.slots; i++) {
    const address = ALLOC.table + i * ALLOC.stride;
    if ((ram.u16(address) & 0x7fff) === type) return address;
  }
  return 0;
}

test('W568 keeps cursor and seqSel independent, exports the exact intro, and enters loop 2',
  { skip: SKIP }, async () => {
    const windows = TABLE_JSON.rom.windows.filter((w) => WINDOW_BASES.has(w.base));
    assert.deepEqual(windows.map((w) => [w.base, w.len]), WINDOW_SPECS.map(([base, len]) => [
      `$${base.toString(16).toUpperCase()}`, len,
    ]));
    assert.equal(TABLE_JSON.rom.windows.length, 839);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 451949);
    assert.equal(canonicalHash(TABLE_JSON), TABLE_HASH);
    assert.equal(PRIOR_TABLE.rom.windows.length, 825);
    assert.equal(PRIOR_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 451687);
    assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH,
      'removing exactly the fourteen W568 bases reconstructs W567 byte for byte');
    assert.equal(windows.length, 14);
    assert.equal(windows.reduce((n, w) => n + w.len, 0), 0x106);
    assert.equal(overlappingPairs(TABLE_JSON.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), 77);
    assert.equal(ROM_OVERLAP_PAIRS, 77);

    for (let i = 0; i < WINDOW_SPECS.length; i++) {
      const [base, len, index, payload] = WINDOW_SPECS[i];
      const window = windows[i];
      assert.equal(window.hex, IMG.subarray(base, base + len).toString('hex'));
      assert.match(window.why, /^W568:/);
      if (index !== null) {
        assert.equal(IMG.readUInt32BE(base), payload);
        const label = index.toString(16).toUpperCase().padStart(2, '0');
        assert.match(window.why, new RegExp(`concrete index \\$${label}$`));
      }
    }
    assert.equal(createHash('sha256').update(IMG.subarray(0x29139e, 0x291470))
      .digest('hex'), INTRO_HASH);
    assert.equal(IMG.readUInt16BE(0x29146e), 0xffff,
      'the $D2 intro window includes the terminator and stops before $291470 code');

    const exporter = readFileSync(EXPORTER, 'utf8');
    for (const [base, len] of WINDOW_SPECS) {
      const row = `(0x${base.toString(16).toUpperCase()}, 0x${len.toString(16)
        .toUpperCase().padStart(4, '0')},`;
      assert.equal(exporter.split(row).length - 1, 1, `${row} is declared exactly once`);
    }
    assert.doesNotMatch(exporter, /0x29139EFF/i);
    assert.equal(TABLE_JSON.rom.windows.find((w) => w.base === '$29139EFF'), undefined);

    assert.deepEqual([
      IMG.readUInt16BE(0x2911c4), IMG.readUInt16BE(0x2911c8),
      IMG.readUInt16BE(0x291202), IMG.readUInt16BE(0x291204),
      IMG.readUInt16BE(0x291240), IMG.readUInt16BE(0x291242),
    ], [0x3d7c, 0x000c, 0xd0ee, 0x000c, 0x586e, 0x000c],
    'the cartridge clears, indexes, and increments ($C,A6) as a word');
    const source = readFileSync(SLOT7_SOURCE, 'utf8');
    assert.match(source,
      /const entry = rom\.u32\(MENU2911B0\.list \+ ram\.u16\(a6 \+ 0x0c\)\);/);
    assert.match(source,
      /ram\.setU16\(a6 \+ 0x0c, u16\(ram\.u16\(a6 \+ 0x0c\) \+ 4\)\);/);
    assert.doesNotMatch(source, /ram\.u32\(a6 \+ 0x0c\)|ram\.setU32\(a6 \+ 0x0c/);

    const rom = new RomWindows(TABLE_JSON.rom);
    const historicalRom = new RomWindows(PRIOR_TABLE.rom);
    assert.equal(rom.u32(MENU2911B0.list), 0x29139e);
    assert.equal(rom.u32(MENU2911B0.list + 4), 0xffffffff);
    assert.equal(historicalRom.u32(MENU2911B0.list + 1), 0x29139eff,
      'the old longword-width bug manufactured the synthetic unaligned pointer');
    assert.equal(caught(() => historicalRom.u16(0x29139e))?.romAddress, 0x29139e);

    const exact = await bundle();
    const checkpoint = JSON.parse(readFileSync(START, 'utf8'));
    assert.equal(checkpoint.tablesSha256, TABLE_HASH);
    assert.equal(checkpoint.frame.logic, 76719);
    assert.equal(checkpoint.frame.video, 80778);
    assert.equal(checkpoint.ramSha256,
      'a4865e04a96cee6e21696c07e4009f6c4876d4054b332eced62532060859dfb2');
    assert.equal(checkpoint.gameSha256,
      '54f0cbad98a06616fbe22264beb528b052701254ed3150c756980e50cb6f0d1e');
    assert.equal(checkpoint.raw.loop, 0);
    const { game } = restoreCheckpoint(checkpoint, exact, checkpoint.selection);
    const a6 = SLOT7.work;
    let a5 = liveObject(game.ram, 7);
    assert.notEqual(a5, 0);
    assert.equal(game.ram.u8(a5 + SLOT7.stateAt), 1);
    assert.equal(game.ram.u16(a6 + SLOT7.innerAt), 4);
    assert.equal(game.ram.u16(a6 + 0x06), 0);
    assert.equal(game.ram.u16(a6 + 0x0c), 0);
    assert.equal(game.ram.u16(a6 + SLOT7.seqSel), 1);
    assert.equal(rom.u32(MENU2911B0.list + game.ram.u16(a6 + 0x0c)), 0x29139e);
    assert.deepEqual([RELEASE, LEFT, RELEASE, SHOT], [0xffff, 0xfff7, 0xffff, 0xffdf]);

    const step = (inputWord) => {
      game.ram.setU8(RAM.player1 + P.invuln, 0xff);
      game.step(inputWord);
    };
    let introFrames = 0;
    while (game.ram.u16(a6 + 0x06) !== 2 && introFrames < 1000) {
      step(RELEASE);
      introFrames++;
    }
    assert.equal(introFrames, 354);
    assert.equal(game.logicFrame, 77073);
    assert.equal(game.ram.u16(a6 + 0x0c), 4);
    assert.equal(game.ram.u16(a6 + SLOT7.seqSel), 1);
    assert.equal(rom.u32(MENU2911B0.list + game.ram.u16(a6 + 0x0c)), 0xffffffff);
    assert.equal(game.ram.u16(a6 + 0x06), 2);
    assert.equal(game.ram.u32(a6 + 0x18), 0x23d186);
    assert.equal(game.ram.u16(MENU2911B0.sel), 1);

    step(LEFT);
    assert.equal(game.ram.u16(MENU2911B0.sel), 0, 'LEFT changes selection 1 to 0');
    step(RELEASE);
    assert.equal(game.ram.u16(MENU2911B0.sel), 0, 'release preserves the selected loop option');
    step(SHOT);
    assert.equal(game.logicFrame, 77076);
    assert.equal(game.ram.u16(a6 + 0x06), 3);
    assert.equal(MENU2911B0.confirmRes, 0x291354);
    assert.deepEqual(Array.from({ length: 9 }, (_, i) => rom.u16(0x291354 + i * 2)),
      [2, 0, 0, 0x1f, 4, 0, 0x00c0, 0x1f, 4]);
    const handle = game.ram.u32(a6 + 0x14);
    const node1 = game.ram.u32(handle + 0x2c);
    const node2 = game.ram.u32(node1 + 0x2c);
    assert.deepEqual([handle, node1, node2, game.ram.u32(node2 + 0x2c)],
      [ANIM_OBJECT.roots, ANIM_OBJECT.nodes, ANIM_OBJECT.nodes + ANIM_OBJECT.nodeStride, 0]);
    assert.deepEqual([node1, node2].map((node) => [
      game.ram.u16(node + 0x04), game.ram.u32(node + 0x0a),
      game.ram.u32(node + 0x0e), game.ram.u16(node + 0x1e),
    ]), [[0x1f, 0x246bb8, 0x80e886, 1], [0x1f, 0x246bb8, 0x80e946, 1]],
    'SHOT loads the two-node confirmation resource at $291354');

    let confirmFrames = 0;
    while (game.ram.u8(a5 + SLOT7.stateAt) !== 2 && confirmFrames < 100) {
      step(RELEASE);
      confirmFrames++;
      a5 = liveObject(game.ram, 7);
    }
    assert.equal(confirmFrames, 64);
    assert.equal(game.logicFrame, 77140);
    assert.equal(game.ram.u8(a5 + SLOT7.stateAt), 2);
    assert.equal(game.ram.u16(SLOT7.gate), 0);
    assert.equal(IMG.readUInt16BE(0x290746), 0x4a79,
      '$290746 begins the authentic outer-state-2 flag test');

    step(RELEASE);
    assert.equal(game.logicFrame, 77141);
    assert.equal(game.ram.u16(SLOT7.gate), 1,
      'outer state 2 executes $290746 and changes raw loop $813098 from 0 to 1');
    assert.equal(game.ram.u16(0x80d56c), 0x8011);
    assert.equal(game.ram.u16(0x80d56c) & 0x7fff, 0x0011);
    assert.equal(game.ram.u16(0x80d5b6), 0x000a);
    assert.equal(game.ram.u16(0x80dbac), 0x0050);

    const periodic = JSON.parse(readFileSync(PERIODIC, 'utf8'));
    assert.deepEqual([periodic.frame.logic, periodic.frame.video, periodic.raw.stage,
      periodic.raw.loop, periodic.tablesSha256], [77219, 81278, 0, 1, TABLE_HASH]);
    const final = JSON.parse(readFileSync(FINAL, 'utf8'));
    assert.deepEqual([final.frame.logic, final.frame.video, final.raw.stage,
      final.raw.stageX2, final.raw.stageX4, final.raw.loop, final.tablesSha256],
    [77631, 81690, 0, 0, 0, 1, TABLE_HASH]);
    const restoredFinal = restoreCheckpoint(final, exact, final.selection);
    restoredFinal.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
    const frontier = caught(() => restoredFinal.game.step(restoredFinal.probe.inputWord));
    assert.equal(restoredFinal.game.logicFrame, 77631);
    assert.equal(frontier?.romAddress, 0x2881ce);
    assert.match(frontier?.message ?? '', /word at \$2881CE/);
  });
