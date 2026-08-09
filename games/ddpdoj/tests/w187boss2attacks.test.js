// W187: stage-2 boss A1 attack leaves E6..E11.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { MoveTables } from '../src/vectors.js';
import {
  SCHED, a1Start259A18, installScripts, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import '../src/boss2.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 11);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0x233194);
  ram.setU8(A5 + 0x0c, 0x30);
  ram.setU16(0x813172, 0x0020);
  runInitBodyAddr(0x297120, ram, ROM, A5, new UnportedLog());
  installScripts(ram, ROM, { a1: 0x2998ac });
  return ram;
}

function context(ram, sites = []) {
  return {
    ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unportedLog: new UnportedLog(), bulletSpawn: (site) => sites.push(site),
  };
}

test('W187/1 all six attack pairs and their packed offset table are ROM-pinned',
  { skip: SKIP }, () => {
    assert.deepEqual([6, 7, 8, 9, 10, 11].map((id) => [
      ROM.u32(0x2998ac + id * 8), ROM.u32(0x2998b0 + id * 8),
    ]), [
      [0x299e90, 0x299eda], [0x29a0f6, 0x29a146],
      [0x29a4c4, 0x29a528], [0x29a886, 0x29a8f2],
      [0x29ab50, 0x29ab7e], [0x29ae48, 0x29ae4c],
    ]);
    const registered = new Set(scriptAddresses());
    for (const addr of [
      0x299e90, 0x299eda, 0x29a0f6, 0x29a146,
      0x29a4c4, 0x29a528, 0x29a886, 0x29a8f2,
      0x29ab50, 0x29ab7e, 0x29ae48, 0x29ae4c,
    ]) assert.ok(registered.has(addr), `$${addr.toString(16)} is registered`);
    assert.equal(ROM.bytes(0x2999b0, 0x80).length, 0x80);
  });

test('W187/2 E7 services its secondary guns before its rotating main fans',
  { skip: SKIP }, () => {
    const ram = fixture();
    const sites = [];
    const ctx = context(ram, sites);
    const slot = a1Start259A18(ram, 7);
    ram.setU16(slot + 0x04, 2);
    runScheduler25962E(ram, ROM, ctx);
    ram.setU8(slot + 0x02, 1);
    ram.setU8(slot + 0x06, 0);
    ram.setU8(slot + 0x0c, 0);
    ram.setU8(A6 + 0x9b, 0);
    ram.setU8(A6 + 0xbb, 0);
    ram.setU16(0x813098, 0);
    runScheduler25962E(ram, ROM, ctx);

    assert.deepEqual(sites.slice(0, 2), [0x29a1ea, 0x29a222]);
    assert.deepEqual(sites.slice(2), [
      0x29a2b2, 0x29a2e6, 0x29a31a, 0x29a350, 0x29a384,
      0x29a3e0, 0x29a414, 0x29a448, 0x29a47e, 0x29a4b2,
    ]);
  });

test('W187/3 E10 cross-fires, toggles the boss record, and retires its group',
  { skip: SKIP }, () => {
    const ram = fixture();
    const sites = [];
    const ctx = context(ram, sites);
    const slot = a1Start259A18(ram, 10);
    ram.setU16(slot + 0x04, 1);
    runScheduler25962E(ram, ROM, ctx);
    ram.setU8(slot + 0x06, 0);
    ram.setU8(slot + 0x10, 1);
    ram.setU8(A5 + 0x03, 0);
    runScheduler25962E(ram, ROM, ctx);

    assert.equal(ram.u8(A5 + 0x03) & 1, 1);
    assert.deepEqual(sites, [0x29ac1e, 0x29ac72, 0x29acc2],
      'positive sign aims the right part but fires the left muzzle');
    assert.equal(ram.u16(slot), 0);
    assert.equal(ram.u16(SCHED.suspend), 0);
  });
