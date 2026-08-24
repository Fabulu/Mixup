// W569: inclusive loop-2 chain-meter cap and exact progression through stages 1 to 4.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HUD, HUDRAM, chainBar2859DC } from '../src/hud.js';
import { RAM, P } from '../src/machine.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS } from '../src/spritequeue.js';
import { UnportedLog } from '../src/unported.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, overlappingPairs, tableBeforeW569, tableBeforeW570,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const EXPORTER = here('../tools/export-tables.py');
const ASSETS = here('../assets');
const MIGRATED = here('../probes/checkpoints/ship0-style4-lf00077631.json');
const FRONTIER = here('../probes/checkpoints/ship0-style4-lf00144631.json');
const PRIOR_HASH = 'a972deffd954503fe4752e93bbc4d3cc5205472c352dc05a0416bd948af944c7';
const TABLE_HASH = '3c480c86d79e63da7149fbf1ada5a454d4217cb2dffa6e0aab63ecebc94e9717';
const POST_W569_HASH = '9c9a021c431dce64e533d2678e955743401453abc3404ee514842fa1bd678221';
const required = [TABLES, IMAGE, EXPORTER, MIGRATED, FRONTIER,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')];
const SKIP = required.every(existsSync) ? false
  : 'exact W569 tables, image, assets, or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const LIVE_TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const TABLE_JSON = SKIP ? null : tableBeforeW570(LIVE_TABLE_JSON);
const WINDOW_INDEX = SKIP ? -1
  : TABLE_JSON.rom.windows.findIndex((w) => w.base === '$28809E');
const WINDOW = SKIP ? null : TABLE_JSON.rom.windows[WINDOW_INDEX];
const PRIOR_TABLE = SKIP ? null : tableBeforeW569(TABLE_JSON);
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const bundle = async () => {
  const live = await loadBundle(
    async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
  return { ...live, tables: TABLE_JSON };
};
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

test('W569 widens only the inclusive loop-2 meter word and preserves W568 exactly',
  { skip: SKIP }, () => {
    assert.notEqual(WINDOW_INDEX, -1);
    assert.deepEqual(WINDOW, {
      base: '$28809E',
      len: 0x0132,
      why: 'W113+W569: chain-bar stage pointers $28809E (2 longs to $2880A6/$28811A) '
        + '+ inclusive per-loop meter data (loop 0: 57 words, loop 1: 91 words), '
        + 'far end $2881D0 before the panel tile table $2881F2',
      hex: IMG.subarray(0x28809e, 0x2881d0).toString('hex'),
    });
    assert.equal(WINDOW.hex.slice(-4), '0000');
    assert.equal(IMG.readUInt16BE(0x2881ce), 0x0000);
    assert.equal(TABLE_JSON.rom.windows.length, 839);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 451951);
    assert.equal(canonicalHash(TABLE_JSON), TABLE_HASH);
    assert.equal(PRIOR_TABLE.rom.windows.length, 839);
    assert.equal(PRIOR_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 451949);
    assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH,
      'removing only the final word and restoring prior metadata reconstructs W568 exactly');
    assert.equal(overlappingPairs(TABLE_JSON.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), 77);
    assert.equal(ROM_OVERLAP_PAIRS, 77);

    const cap0 = IMG.readUInt16BE(0x287df0);
    const cap1 = IMG.readUInt16BE(0x287df2);
    const p0 = IMG.readUInt32BE(0x28809e);
    const p1 = IMG.readUInt32BE(0x2880a2);
    assert.deepEqual([cap0, cap1, p0, p1], [0x38, 0x5a, 0x2880a6, 0x28811a]);
    assert.equal(p0 + (cap0 + 1) * 2, 0x288118);
    assert.ok(p0 + (cap0 + 1) * 2 <= p1);
    assert.equal(p1 + (cap1 + 1) * 2, 0x2881d0);

    const rom = new RomWindows(TABLE_JSON.rom);
    const priorRom = new RomWindows(PRIOR_TABLE.rom);
    assert.equal(rom.u16(p1 + cap1 * 2), 0);
    assert.equal(caught(() => priorRom.u16(p1 + cap1 * 2))?.romAddress, 0x2881ce);
    const ram = new Ram();
    ram.setU16(HUDRAM.loop, 1);
    const before = ram.u16(BUCKETS[25].counter);
    chainBar2859DC(ram, rom, { unportedLog: new UnportedLog() }, 0x5bc00000, 9, cap1);
    assert.equal(ram.u16(BUCKETS[25].counter), before + 12,
      'the inclusive cap now emits the cartridge zero-word frame instead of faulting');
    assert.equal(HUD.chainBarTable, 0x28809e);

    const exporter = readFileSync(EXPORTER, 'utf8');
    assert.match(exporter, /\(0x28809E, 0x0132, "W113\+W569:/);
    assert.match(exporter, /end0 = p0 \+ \(cap0 \+ 1\) \* 2/);
    assert.match(exporter, /end1 = p1 \+ \(cap1 \+ 1\) \* 2/);
  });

test('W569 migrates the exact frontier, clears loop-2 stages 1 to 4, and reaches main gun 0',
  { skip: SKIP }, async () => {
    const exact = await bundle();
    assert.equal(canonicalHash(exact.tables), TABLE_HASH);

    const migrated = JSON.parse(readFileSync(MIGRATED, 'utf8'));
    assert.deepEqual([
      migrated.tablesSha256, migrated.frame.logic, migrated.frame.video,
      migrated.raw.stage, migrated.raw.stageX2, migrated.raw.stageX4, migrated.raw.loop,
      migrated.ramSha256, migrated.gameSha256,
    ], [
      TABLE_HASH, 77631, 81690, 0, 0, 0, 1,
      'b428d44c8c4a50453856297ccf4ca2991f0eeefd653e14de697c65aae5a038e7',
      '27439f74298a6171da242bc5ec5b378bcb5baafeeafe3ba2cd740b964f71ef13',
    ]);
    restoreCheckpoint(migrated, exact, migrated.selection);
    const historical = { ...exact, tables: PRIOR_TABLE };
    restoreCheckpoint({ ...migrated, tablesSha256: PRIOR_HASH }, historical, migrated.selection);

    const frontier = JSON.parse(readFileSync(FRONTIER, 'utf8'));
    assert.deepEqual([
      frontier.tablesSha256, frontier.frame.logic, frontier.frame.video,
      frontier.raw.stage, frontier.raw.stageX2, frontier.raw.stageX4, frontier.raw.loop,
      frontier.ramSha256, frontier.gameSha256,
    ], [
      POST_W569_HASH, 144631, 155220, 4, 8, 16, 1,
      'cb290e6ee0d50a296233a76a7be1a1fc1dea4a10e1c995770a2d3b7a63ba3b15',
      '9340889f30fe7ceaf774fd1c6c5ca2133ab4c5569929d4456aeb73dc479ac6e1',
    ]);
    const restored = restoreCheckpoint(
      { ...frontier, tablesSha256: TABLE_HASH }, exact, frontier.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 500; attempted++) {
      try {
        restored.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        restored.game.step(restored.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    assert.equal(attempted, 359);
    assert.equal(restored.game.logicFrame, 144989);
    assert.equal(restored.game.videoFrame, 155579);
    assert.equal(restored.game.ram.u16(0x813092), 4);
    assert.equal(restored.game.ram.u16(0x813098), 1);
    assert.equal(error?.romAddress, 0x2a733c);
    assert.match(error?.message ?? '', /word at \$2A733C/,
      'the later gun-0 port reaches its first W570-only template word at the same frontier');
  });
