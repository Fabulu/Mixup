// W250: Stage-4 boss A1 6 and A1 7, the pair F5's arm 4 starts and stops together.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { REC } from '../src/bullets.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { RAM, P } from '../src/machine.js';
import { a1_6Init2A2D70, a1_6Step2A2D8E,
  a1_7Init2A2E8C, a1_7Step2A2E9E } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A1_TABLE = 0x2a1608;
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const LOOP = 0x813098;
const A1_7_SITES = [0x2a2eda, 0x2a2ee4, 0x2a2eee, 0x2a2ef8, 0x2a2f02];

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  const bullets = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x82, 0x30001c00);
  ram.setU32(A6 + 0xa2, 0x34002000);
  ram.setU16(SLOT, 0x8006);
  ram.setU16(RAM.player1, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log,
    bulletSpawn(site, result) { bullets.push({ site, result }); } };
  return { ram, log, ctx, bullets };
}

const flat = (f) => f.bullets
  .flatMap((b) => (Array.isArray(b.result) ? b.result : [b.result]))
  .filter((r) => r && r.addr !== null);
const dirs = (f) => flat(f).map((r) => f.ram.u8(r.addr + REC.dir));

test('W250 both are registered and sit where the A1 table says', { skip: SKIP }, () => {
  for (const a of [0x2a2d70, 0x2a2d8e, 0x2a2e8c, 0x2a2e9e])
    assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
  assert.deepEqual([ROM.u32(A1_TABLE + 6 * 8), ROM.u32(A1_TABLE + 6 * 8 + 4)],
    [0x2a2d70, 0x2a2d8e]);
  assert.deepEqual([ROM.u32(A1_TABLE + 7 * 8), ROM.u32(A1_TABLE + 7 * 8 + 4)],
    [0x2a2e8c, 0x2a2e9e]);
  // A1 6's body ends where A1 7's INIT begins, and A1 7's where A1 8's does.
  assert.equal(ROM.u32(A1_TABLE + 8 * 8), 0x2a2f1e);
});

test('W250 A1 6 holds off three frames, then fires both pods', { skip: SKIP }, () => {
  const f = fixture();
  a1_6Init2A2D70(f.ram, ROM, f.ctx, SLOT);
  assert.equal(f.ram.u8(SLOT + 0x04), 2, '$4(a4) arrived at 3 and the frame spent one');
  assert.deepEqual(f.bullets, [], 'so the arming frame does NOT fire');
  for (let n = 0; n < 2; n++) {
    a1_6Step2A2D8E(f.ram, ROM, f.ctx, SLOT);
    assert.deepEqual(f.bullets, []);
  }
  a1_6Step2A2D8E(f.ram, ROM, f.ctx, SLOT);
  assert.equal(f.bullets.length, 6, 'three per pod in loop 1');
  assert.deepEqual(f.bullets.map((b) => b.site),
    [0x2a2dbe, 0x2a2dc8, 0x2a2dd2, 0x2a2e22, 0x2a2e2c, 0x2a2e36]);
  assert.deepEqual(dirs(f), [0x00, 0x55, 0xaa, 0x00, 0x55, 0xaa],
    '$55 apart, and both pods start from zero');
  // $2A2E64 -- and now they counter-rotate.
  assert.deepEqual([f.ram.u8(SLOT + 0x10), f.ram.u8(SLOT + 0x11)], [0xfc, 0x04],
    'one down by 4, the other up by 4');
});

test('W250 loop 2 changes the count AND the generator', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU16(LOOP, 1);                       // $2A2DB4 tst.w $813098
  a1_6Init2A2D70(f.ram, ROM, f.ctx, SLOT);
  for (let n = 0; n < 3; n++) a1_6Step2A2D8E(f.ram, ROM, f.ctx, SLOT);
  assert.equal(f.bullets.length, 8, 'FOUR per pod in loop 2, not three');
  assert.deepEqual(f.bullets.map((b) => b.site),
    [0x2a2ddc, 0x2a2de6, 0x2a2df0, 0x2a2dfa,
      0x2a2e40, 0x2a2e4a, 0x2a2e54, 0x2a2e5e],
    'and through $281708, whose call sites are the other four');
  assert.deepEqual(dirs(f), [0x00, 0x40, 0x80, 0xc0, 0x00, 0x40, 0x80, 0xc0],
    '$40 apart -- a full ring rather than a wide three-way');
});

test('W250 the counter-rotation gains a second step on every seventh volley',
  { skip: SKIP }, () => {
    const f = fixture();
    a1_6Init2A2D70(f.ram, ROM, f.ctx, SLOT);
    // $6(a4) is 6 with a period of 6, and `bcc` borrows out of an old zero, so the
    // seventh volley takes the extra step. Track $10(a4) across eight volleys.
    const seen = [];
    for (let v = 0; v < 8; v++) {
      for (let n = 0; n < 4 && f.ram.u8(SLOT + 0x10) === (seen.at(-1) ?? 0); n++) {
        a1_6Step2A2D8E(f.ram, ROM, f.ctx, SLOT);
      }
      seen.push(f.ram.u8(SLOT + 0x10));
    }
    // Six volleys of -4, then one of -8, then -4 again.
    const deltas = seen.map((v, i) => ((i ? seen[i - 1] : 0) - v) & 0xff);
    assert.deepEqual(deltas, [4, 4, 4, 4, 4, 4, 8, 4],
      'the seventh is a double step, and the count restarts after it');
  });

test('W250 A1 7 aims its five-shot fan and USES the answer', { skip: SKIP }, () => {
  const f = fixture();
  a1_7Init2A2E8C(f.ram, ROM, f.ctx, SLOT);
  // $2A2E8C writes $1020 and $2A2E92 then adds $40 to the LOW BYTE, so the counter
  // starts at $50 and not $10. Folding the two would fire $40 frames early.
  assert.equal(f.ram.u8(SLOT + 0x04), 0x4f, '$50 less the arming frame\'s own tick');
  assert.equal(f.ram.u8(SLOT + 0x05), 0x20, 'and its reload is the $20 half');
  assert.deepEqual(f.bullets, []);
  // $50 more, not $4F: `bcc` borrows on the frame the counter was ALREADY zero, so
  // reaching zero costs $4F steps and the borrow is the one after.
  for (let n = 0; n < 0x50; n++) a1_7Step2A2E9E(f.ram, ROM, f.ctx, SLOT);
  assert.equal(f.bullets.length, 5, 'five, from one pod only');
  assert.deepEqual(f.bullets.map((b) => b.site), A1_7_SITES);
  const d = dirs(f);
  // base, +6, +$C, -6, -$C, reached by +6 +6 -$12 -6 rather than by absolutes.
  assert.deepEqual(d.map((x) => (x - d[0]) & 0xff), [0, 6, 0x0c, 0xfa, 0xf4]);
  assert.notEqual(d[0], 0, 'and the base is an AIM, not a constant');
  assert.deepEqual(f.log.report(), []);
});

test('W250 A1 7 retires on $9F(a6) before doing anything else', { skip: SKIP }, () => {
  const f = fixture();
  a1_7Init2A2E8C(f.ram, ROM, f.ctx, SLOT);
  f.ram.setU8(SLOT + 0x04, 0);                 // one frame from firing
  f.ram.setU8(A6 + 0x9f, 1);                   // ...and the kill switch is on
  a1_7Step2A2E9E(f.ram, ROM, f.ctx, SLOT);
  assert.equal(f.ram.u16(SLOT), 0, '$2A2EA6 clr.w (a4)');
  assert.deepEqual(f.bullets, [], 'and it fired nothing on the way out');
  assert.equal(f.ram.u8(SLOT + 0x04), 0, 'the cadence counter was not even touched');
});

test('W250 A1 7 slows its own cadence as the burst goes on', { skip: SKIP }, () => {
  const f = fixture();
  a1_7Init2A2E8C(f.ram, ROM, f.ctx, SLOT);
  // $6(a4) is 2 with a period of 2 and uses `bne`, not `bcc`, so the SECOND volley
  // rewrites the cadence from $20 to $40 -- the burst gets slower, not faster.
  f.ram.setU8(SLOT + 0x04, 0);
  a1_7Step2A2E9E(f.ram, ROM, f.ctx, SLOT);
  assert.equal(f.ram.u8(SLOT + 0x04), 0x20, 'volley 1 reloaded the $20 cadence');
  assert.equal(f.ram.u8(SLOT + 0x06), 1);
  f.ram.setU8(SLOT + 0x04, 0);
  a1_7Step2A2E9E(f.ram, ROM, f.ctx, SLOT);
  assert.equal(f.ram.u8(SLOT + 0x04), 0x40, '$2A2F16 -- and volley 2 doubled it');
  assert.equal(f.ram.u8(SLOT + 0x06), 2, '$2A2F10 reloaded the burst count');
});

test('W250 with no live player A1 7 falls back on the biased X, as the ROM does',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU16(RAM.player1, 0);               // no target: $24270A returns carry
    a1_7Init2A2E8C(f.ram, ROM, f.ctx, SLOT);
    f.ram.setU8(SLOT + 0x04, 0);
    a1_7Step2A2E9E(f.ram, ROM, f.ctx, SLOT);
    assert.equal(f.bullets.length, 5, 'it still fires');
    // $2A2EC2 left D1 = $A4(a6) + $FE40 = $2000 + $FE40, low byte $40.
    assert.equal(dirs(f)[0], 0x40, 'the base is the biased X, not zero');
  });
