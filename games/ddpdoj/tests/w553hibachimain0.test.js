// W553: HIBACHI A0 MAIN SCRIPT 0, `$2A4F56` init and `$2A4F86` step.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { RNG } from '../src/rng.js';
import { UnportedLog } from '../src/unported.js';
import {
  SCHED, installScripts, seqStart2598D0, a2Run2598E6, a4Start25980C,
  runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { HIBACHI_A0, HIBACHI_A4 } from '../src/hibachiend.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);

const beU16 = (addr) => IMG.readUInt16BE(addr);
const beU32 = (addr) => IMG.readUInt32BE(addr);
const REC = 0x810c00;
const SUB = 0x814800;

function bench() {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { bossRec: REC, bossSubRec: SUB, unported: log, unportedLog: log };
  ram.setU32(REC + 0x06, SUB);
  ram.setU16(0x813172, 0x0100);
  ram.setU32(0x80b03c, 0x00200000);
  return { ram, log, ctx };
}

const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

test('W553 the cartridge and generated window map main id 0 to its exact pair',
  { skip: SKIP }, () => {
    assert.equal(beU16(0x2a4300), 0x41f9, '$2A4300 loads the A0 table with lea abs.l');
    assert.equal(beU32(0x2a4302), HIBACHI_A0.table);
    assert.equal(HIBACHI_A0.pairs, 12);
    assert.equal(beU32(HIBACHI_A0.table), HIBACHI_A0.s0Init);
    assert.equal(beU32(HIBACHI_A0.table + 4), HIBACHI_A0.s0Step);
    assert.deepEqual([HIBACHI_A0.s0Init, HIBACHI_A0.s0Step], [0x2a4f56, 0x2a4f86]);

    const window = TABLE_JSON.rom.windows.find((w) => w.base === '$2A4E56');
    assert.equal(window?.len, HIBACHI_A0.pairs * 8);
    assert.equal(HIBACHI_A0.table + window.len, 0x2a4eb6,
      'the exact table span ends at the shared part-position body');
    assert.equal(beU16(0x2a4eb6), 0x4cae, '$2A4EB6 begins movem.w, not a thirteenth pair');
    assert.equal(ROM.u32(HIBACHI_A0.table), HIBACHI_A0.s0Init,
      'the generated RomWindows path serves the active init pointer');
    assert.equal(ROM.u32(HIBACHI_A0.table + 4), HIBACHI_A0.s0Step,
      'the generated RomWindows path serves the active step pointer');
    assert.ok(new Set(scriptAddresses()).has(HIBACHI_A0.s0Init));
    assert.ok(new Set(scriptAddresses()).has(HIBACHI_A0.s0Step));
  });

test('W553 main id 0 runs init fallthrough and keeps Hibachi parts attached',
  { skip: SKIP }, () => {
    const b = bench();
    installScripts(b.ram, ROM, { a0: HIBACHI_A0.table });
    seqStart2598D0(b.ram, 0);

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u16(SCHED.seqCursor), 0);
    assert.equal(b.ram.u16(SCHED.seqSub), 4, 'the init entry advanced to the step half');
    assert.equal(b.ram.u8(RNG.counter), 1, '$242EC2 advances the shared counter once');
    const heading = IMG[0x242edf];
    assert.equal(b.ram.u8(SUB + 0x01b), heading);
    assert.equal(b.ram.u8(SUB + 0x131), (heading + 0x10) & 0xff);
    assert.equal(b.ram.u8(SUB + 0x13d), (heading + 0x40) & 0xff);

    assert.equal(b.ram.u16(SUB + 0x02), 0xb020,
      '$24179E applies the high word of $80B03C on the init frame');
    assert.equal(b.ram.u16(SUB + 0x04), 0x1b00,
      'the init subtracts the live $813172 scroll word');
    assert.equal(b.ram.u32(SUB + 0x142), b.ram.u32(SUB + 0x02));
    assert.equal(b.ram.u32(SUB + 0x1a2), b.ram.u32(SUB + 0x02));
    assert.equal(b.ram.u16(SUB + 0x22), 0xc4e0);
    assert.equal(b.ram.u16(SUB + 0x24), 0x0c80);

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u16(SUB + 0x02), 0xb040);
    assert.equal(b.ram.u16(SUB + 0x22), 0xc500,
      'the step refreshes attached positions after the next scroll delta');
    assert.equal(b.ram.u8(RNG.counter), 1, 'the step does not draw again');
  });

test('W553 the live five-table install runs main id 0 before the later blocker',
  { skip: SKIP }, () => {
    const b = bench();
    installScripts(b.ram, ROM, {
      a0: HIBACHI_A0.table,
      a1: 0x2a92a8,
      a2: 0x2a46b2,
      a3: 0x2a5492,
      a4: HIBACHI_A4.table,
    });
    for (const id of [0, 1, 2, 5, 4, 3, 8, 7, 6, 9]) a2Run2598E6(b.ram, id);
    assert.equal(b.ram.u32(SCHED.a2Base + 0x02), 0x2a4702,
      'the generated A2 prefill remains a single-pointer object slot, not an init/step pair');
    assert.equal(a4Start25980C(b.ram, 0), true);

    const error = caught(() => runScheduler25962E(b.ram, ROM, b.ctx));
    assert.equal(error?.romAddress, 0x2a4702,
      'main id 0 and the live A3 pair complete before the later A2 blocker');
    assert.equal(b.ram.u16(SCHED.seqSub), 4);
    assert.equal(b.ram.u16(SCHED.a4Base + 0x02), HIBACHI_A4.s0Frames - 1,
      'A4 script 0 made its first timer step before the later stop');
    assert.equal(b.ram.u16(SUB + 0x02), 0xb020,
      'the main init and first step executed before the new blocker');
  });
