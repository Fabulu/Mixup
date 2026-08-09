// W169 -- `$25FD38 -> $26331E -> $263386`, the stage-2 enemy installation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { RomWindows } from '../src/rom.js';
import { SPAWN } from '../src/spawn.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const evidencePath = new URL('../tools/w169-stage2-spawn-evidence.json', import.meta.url);
const coveragePath = new URL('../tools/dojcoverage.py', import.meta.url);
const root = new URL('../../../', import.meta.url);
const HAVE = existsSync(tablesPath) && existsSync(evidencePath);
const SKIP = HAVE ? false : 'ROM export/evidence absent; this is a skip, not a pass';

function ROM() {
  return new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom);
}

test('W169/1 ROM pins the complete rebuild order and exact reset half-open span',
  { skip: SKIP }, () => {
  const rom = ROM();
  assert.equal(rom.u16(0x25fd38), 0x61ea, '$25FD38 BSR.B $25FD24');
  const order = [0x26331e, 0x288e0c, 0x289084, 0x289ae0,
    0x28ac3a, 0x289f3a, 0x27e98a, 0x28131e];
  assert.deepEqual(order.map((_, i) => rom.u32(0x25fd3c + i * 6)), order);
  assert.equal(rom.u16(0x25fd80), 0x4e75, 'caller tail RTS');

  assert.equal(rom.u32(0x263320), SPAWN.RESET_BASE);
  assert.equal(rom.u16(0x263326) + 1, SPAWN.RESET_WORDS);
  assert.equal(SPAWN.RESET_BASE + SPAWN.RESET_WORDS * 2, SPAWN.RESET_END);
  assert.equal(SPAWN.RESET_END, 0x816b7a, 'exclusive end is item-pool base');
  assert.equal(rom.u16(0x263330), 0x6100);
  assert.equal(0x263332 + rom.u16(0x263332), 0x263386);
  assert.equal(rom.u16(0x263334), 0x4e75);
});

test('W169/2 stage table and complete stage-2 script/aux/resource closure are exact',
  { skip: SKIP }, () => {
  const rom = ROM();
  const table = [
    [0x230c6c, 0x23170c, 0x231852],
    [0x2325d0, 0x233038, 0x233194],
    [0x2342ba, 0x234fb2, 0x2350a8],
    [0x2358b0, 0x2364a8, 0x2365e2],
    [0x237978, 0x239190, 0x239396],
  ];
  assert.deepEqual(table.map((_, stage) => [0, 4, 8].map((off) =>
    rom.u32(SPAWN.STAGE_TAB + stage * 0x10 + off))), table);

  const records = [];
  let cursor = table[1][0];
  while (rom.u16(cursor) !== 0xffff) {
    records.push({ record: cursor, trigger: rom.u16(cursor), type: rom.u8(cursor + 4),
      idx: rom.u16(cursor + 6) & 0xfff });
    cursor += 8;
  }
  assert.equal(records.length, 332);
  assert.equal(cursor, 0x233030);
  assert.equal(Math.max(...records.map((r) => r.idx)), 173);
  assert.equal(new Set(records.map((r) => r.idx)).size, 149);
  assert.equal(table[1][1] + 174 * 2, table[1][2]);
  assert.equal(table[1][2] + 0x1126, table[2][0]);
});

test('W169/3 board occurrence order joins every observed record to static ROM',
  { skip: SKIP }, () => {
  const rom = ROM();
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.deepEqual(evidence.install, {
    logic_frame: 12360, stage_x4: 4, clock: 0,
    previous_cursor: 0x231704, cursor: 0x2325d0,
    aux: 0x233038, resource: 0x233194, deferred_count: 0,
  });
  assert.equal(evidence.events.length, 19);
  for (const row of evidence.events) {
    assert.equal(rom.u16(row.record), row.trigger, `trigger at $${row.record.toString(16)}`);
    assert.equal(rom.u8(row.record + 4), row.type, `type at $${row.record.toString(16)}`);
  }
  assert.deepEqual(evidence.events.slice(0, 18).map((x) => x.type),
    [0x8b, 0x8b, 0x8b, 0x8b, 0x8b, 0x8b, 0x8b, 0x8b, 0x8b, 0x8b,
      0x10, 0x09, 0x8a, 0x09, 0x10, 0x09, 0x11, 0x11]);
  const stop = evidence.next_boundary;
  assert.equal(stop.record, 0x232660);
  assert.equal(stop.type, 0x95);
  assert.equal(stop.movement_start, 0x233194 + rom.u16(0x233038 + stop.aux_index * 2));
  assert.equal(stop.movement_end_exclusive - stop.movement_start, 62);
  assert.equal(rom.u32(SPAWN.TYPE_HI + (0x95 & 0x7f) * 8), stop.init_stub);
  assert.equal(stop.init_stub + 8, stop.init_body);
  assert.equal(rom.u32(SPAWN.TYPE_HI + (0x95 & 0x7f) * 8 + 4), stop.handler);
});

test('W169/4 dynamic-minus-static regression goes red and restores', { skip: SKIP }, () => {
  const run = (...args) => spawnSync('python', [fileURLToPath(coveragePath), ...args], {
    cwd: fileURLToPath(root), encoding: 'utf8', windowsHide: true,
  });
  const red = run('--break-stage2-spawn-inventory');
  assert.equal(red.status, 1, red.stdout + red.stderr);
  assert.match(red.stdout, /\$2325C8 outside static inventory/);
  const green = run();
  assert.equal(green.status, 0, green.stdout + green.stderr);
  assert.match(green.stdout, /stage2_spawn_script: 313\/332 ported, 19 unknown, 0 null, dynamic 28/);
});
