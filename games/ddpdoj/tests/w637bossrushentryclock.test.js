// W637: keep Boss Rush's stage clock aligned with its accelerated spawn cursor.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import {
  backgroundFrame, backgroundInit, BGO, BGRAM, BgVram,
} from '../src/background.js';
import { rebuildWorld25FD38, SE } from '../src/stageend.js';
import { SPAWN, stageTableEntry } from '../src/spawn.js';
import {
  createModState, modGameOptions, prepareModCabinetBoot, resolveLoadout,
} from '../src/mods.js';

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false
  : 'exact decrypted program image absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const ROM = SKIP ? null : Object.freeze({
  u8: (address) => IMG.readUInt8(address),
  u16: (address) => IMG.readUInt16BE(address),
  i16: (address) => IMG.readInt16BE(address),
  u32: (address) => IMG.readUInt32BE(address),
});
const LOG = Object.freeze({ note() {} });

function stage3Ram() {
  const ram = new Ram();
  ram.setU16(SE.stage, 2);
  ram.setU16(SE.stageX2, 4);
  ram.setU16(SE.stageX4, 8);
  return ram;
}

function bossRushOptions({ pending = false } = {}) {
  const state = createModState(resolveLoadout(['boss-rush']));
  if (pending) prepareModCabinetBoot(state);
  return modGameOptions(state);
}

test('W637 ordinary and pending Boss Rush rebuilds retain cartridge entry clock zero',
  { skip: SKIP }, () => {
    for (const stageScriptInstallHook of [null,
      bossRushOptions({ pending: true }).stageScriptInstallHook]) {
      const ram = stage3Ram();
      ram.setU16(SE.clockBase, 0x7777);
      const result = rebuildWorld25FD38(ram, {
        rom: ROM, unportedLog: LOG, stageScriptInstallHook,
      });
      assert.equal(result.ok, true);
      assert.equal(ram.u16(SE.clockBase), 0,
        'the authentic world wipe clears the prior distance clock');
      assert.equal(ram.u16(result.addr + 0x06), 0,
        'the hook-free background keeps the cartridge entry clock');
      assert.equal(ram.u32(SPAWN.LIVE_CURSOR), stageTableEntry(ROM, 2).script,
        'a pending mod does not accelerate the cabinet route');
    }
  });

test('W637 active Boss Rush seeds Stage 3 background from the accelerated clock',
  { skip: SKIP }, () => {
    const ram = stage3Ram();
    const options = bossRushOptions();
    const result = rebuildWorld25FD38(ram, {
      rom: ROM,
      unportedLog: LOG,
      stageScriptInstallHook: options.stageScriptInstallHook,
    });
    assert.equal(result.ok, true);
    assert.deepEqual([
      ram.u16(SE.stage), ram.u16(SE.stageX2), ram.u16(SE.stageX4),
    ], [2, 4, 8]);
    assert.equal(ram.u16(SE.clockBase), 0x0197,
      'Boss Rush selects the authentic Stage 3 final-approach threshold');
    assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x234f82,
      'Boss Rush retains the first Stage 3 final-approach row');
    assert.deepEqual(Array.from({ length: 5 }, (_, index) => {
      const at = 0x234f82 + index * 8;
      return [at, ROM.u16(at), ROM.u8(at + 4)];
    }), [
      [0x234f82, 0x0197, 0x16],
      [0x234f8a, 0x0197, 0x16],
      [0x234f92, 0x019a, 0x85],
      [0x234f9a, 0x019f, 0x31],
      [0x234fa2, 0x01a7, 0xa0],
    ]);
    assert.equal(ROM.u16(0x234faa), 0xffff,
      'the retained Stage 3 rows close on their exact terminator');
    assert.equal(ram.u16(result.addr) & 0xff, 1,
      'the rebuilt world stages the authentic type-1 background object');
    assert.equal(ram.u16(result.addr + 0x06), 0x0197,
      'background init cannot regress the accelerated distance clock to zero');

    const vram = new BgVram();
    const ctx = { unportedLog: LOG, ...options };
    backgroundInit(ram, ROM, vram, ctx, result.addr);
    const mapStart = 0x22a5f8;
    const mapEnd = 0x22a9e8;
    assert.equal(ram.u16(BGRAM.clock), 0x0197);
    assert.equal(ram.u32(BGRAM.scr0 + 0x0c), mapStart,
      'the accelerated permanent repeat targets Stage 3 map column zero');
    assert.equal(ram.u16(BGRAM.scr0 + 0x10), 0xffff);
    assert.equal(ram.u16(BGRAM.scr0 + 0x12), 28);
    assert.equal(vram.long(0, 0),
      (ROM.u32(mapStart + 4 * 36) + ROM.u32(0x240d62 + 8)) >>> 0,
      'the rebuilt ring starts four columns into the naturally advanced arena');
    assert.equal(ram.u16(BGRAM.scr0 + 0x14), 10,
      'the repeat countdown accounts for the four-column entry phase and fifteen prefills');
    assert.equal(ram.u32(result.addr + BGO.colPtr), mapStart + 19 * 36);

    for (let frame = 0; frame < 2200; frame++) {
      backgroundFrame(ram, ROM, vram, ctx, result.addr);
      if (vram.streamPtr !== 0) {
        assert.ok(vram.streamPtr >= mapStart && vram.streamPtr < mapEnd,
          `column pointer $${vram.streamPtr.toString(16)} stays inside Stage 3's map`);
      }
    }
    assert.ok(vram.columnsWritten > 28,
      'the witness crosses the complete 28-column permanent repeat');
    const tiles = [];
    for (let index = 0; index < vram.w.length; index += 2) {
      if (vram.w[index] !== 0) tiles.push(vram.w[index]);
    }
    assert.ok(tiles.length > 0);
    assert.ok(tiles.every((tile) => tile >= 0x1aaa && tile <= 0x1ba5),
      'accelerated Stage 3 never interprets the following palette block as map columns');
  });
