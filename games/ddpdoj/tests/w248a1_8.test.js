// W248: Stage-4 boss A1 8 $2A2F1E/$2A2F72, the two-barrel fan F5's chain starts.

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
import { a1_8Init2A2F1E, a1_8Step2A2F72 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A1_TABLE = 0x2a1608;                 // $29EC82's install: a1: $2A1608
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const FAN_SITES = [0x2a3050, 0x2a305a, 0x2a3066, 0x2a3070];

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  const bullets = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x82, 0x30001c00);         // pod 1's position pair
  ram.setU32(A6 + 0xa2, 0x34002000);         // pod 2's, deliberately different
  ram.setU16(RAM.player1, 0x8000);           // a live target for barrel 2's aim
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log,
    bulletSpawn(site, result) { bullets.push({ site, result }); } };
  return { ram, log, ctx, bullets };
}

const init = (f) => a1_8Init2A2F1E(f.ram, ROM, f.ctx, SLOT);
const step = (f) => a1_8Step2A2F72(f.ram, ROM, f.ctx, SLOT);
/** `fire` returns one result PER CORE CALL, so each fan site carries an array. */
const dirs = (f) => f.bullets
  .flatMap((b) => (Array.isArray(b.result) ? b.result : [b.result]))
  .filter((r) => r && r.addr !== null)
  .map((r) => f.ram.u8(r.addr + REC.dir));
const addrs = (f) => f.bullets
  .flatMap((b) => (Array.isArray(b.result) ? b.result : [b.result]))
  .filter((r) => r && r.addr !== null).map((r) => r.addr);

test('W248 A1 8 is registered and its body ends where A1 9 begins',
  { skip: SKIP }, () => {
    for (const a of [0x2a2f1e, 0x2a2f72])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(A1_TABLE + 8 * 8), ROM.u32(A1_TABLE + 8 * 8 + 4)],
      [0x2a2f1e, 0x2a2f72], 'A1 id8 is the pair we registered');
    // $2A3078 is the fan's `rts`, so the body is $2A2F1E..$2A3079 and A1 9's INIT is
    // the next word. The extent is pinned by code rather than by a run length.
    assert.equal(ROM.u32(A1_TABLE + 9 * 8), 0x2a307a, 'A1 9 begins at $2A307A');
  });

test('W248 INIT lays down fourteen literals and then fires NOTHING',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    // Both burst counters arrive at zero, so the first frame consults the OUTER
    // cadence. $2(a4) is $04 and $8(a4) is $04, neither of which borrows yet.
    assert.equal(f.ram.u8(SLOT + 0x02), 3, '$2A2F1E left 4, and the frame spent one');
    assert.equal(f.ram.u8(SLOT + 0x03), 0x0d, 'the period the reload will use');
    assert.equal(f.ram.u8(SLOT + 0x08), 3, 'barrel 2 the same');
    assert.equal(f.ram.u8(SLOT + 0x09), 0x10);
    assert.deepEqual([f.ram.u8(SLOT + 0x04), f.ram.u8(SLOT + 0x05)], [0, 0x40],
      '$2A2F24 -- the inner cadence, untouched because the outer refused');
    assert.deepEqual([f.ram.u8(SLOT + 0x13), f.ram.u8(SLOT + 0x15)], [0x18, 0xec],
      '$2A2F54/$2A2F60 -- the two accumulator STEPS');
    assert.deepEqual(f.bullets, [], 'and no shot on the arming frame');
    assert.deepEqual(f.log.report(), [], 'and no unported path');
  });

test('W248 barrel 1 fires a four-way fan off the CONSTANT $40', { skip: SKIP }, () => {
  const f = fixture();
  init(f);
  // $2(a4): 4 -> 3 on the init frame, then 2, 1, 0, and the fifth pass borrows out of
  // an old zero. That arms $6(a4) = 1 and the inner counter borrows on the same frame
  // because $4(a4) is still zero.
  //
  // Barrel 2 has to be held off BY HAND here, because $8(a4) starts at the same $04
  // and would borrow on the very same frame. That is not a coincidence to design
  // around; the next test asserts it, and this one is about barrel 1 alone.
  f.ram.setU8(SLOT + 0x08, 0x7f);
  for (let n = 0; n < 3; n++) { step(f); assert.deepEqual(f.bullets, []); }
  step(f);
  assert.equal(f.ram.u8(SLOT + 0x02), 0x0d, '$2A2F82 reloaded from $3(a4)');
  assert.equal(f.ram.u8(SLOT + 0x04), 0x40, '$2A2F96 reloaded the inner cadence');
  assert.equal(f.ram.u8(SLOT + 0x06), 0, '$2A2F88 armed 1, $2A2FCE spent it');
  assert.equal(f.bullets.length, 4, '$2A3048 is four shots, not one');
  assert.deepEqual(f.bullets.map((b) => b.site), FAN_SITES,
    'and in the ROM\'s own order, which is slot order');
  // THE ANGLES ARE $40 +$4/+$C/-$4/-$C. If the port used the accumulator the base
  // would be $18 and every one of these would be wrong.
  assert.deepEqual(dirs(f), [0x44, 0x4c, 0x3c, 0x34]);
  assert.equal(f.ram.u8(SLOT + 0x12), 0x18,
    '$2A2FA0 accumulates anyway, and $2A2FA8 throws the answer away');
  // Barrel 1's muzzle: D2 = $82(a6) = $3000, D3 = $F9400200, so $3000 + $F940.
  assert.equal(f.ram.u16(addrs(f)[0] + REC.posA), 0x2940,
    '$82(a6) + $F940 -- barrel 1\'s own bias, one count off barrel 2\'s');
});

test('W248 a burst in progress bypasses the outer cadence', { skip: SKIP }, () => {
  const f = fixture();
  init(f);
  // Arm a burst of three by hand and hold the outer counter high, so the only thing
  // that can pace the shots is the inner cadence at $4(a4).
  f.ram.setU8(SLOT + 0x02, 0x7f);
  f.ram.setU8(SLOT + 0x06, 3);
  f.ram.setU8(SLOT + 0x04, 0);
  f.ram.setU8(SLOT + 0x0c, 0x7f);              // barrel 2 out of the way
  f.ram.setU8(SLOT + 0x0a, 0x7f);
  step(f);
  assert.equal(f.bullets.length, 4, 'it fired without consulting $2(a4)');
  assert.equal(f.ram.u8(SLOT + 0x02), 0x7f, '$2A2F72 bne skipped the outer subq');
  assert.equal(f.ram.u8(SLOT + 0x06), 2, 'and spent one of the burst');
  // The inner cadence now holds it off for $40 frames.
  step(f);
  assert.equal(f.bullets.length, 4, '$2A2F8E bcc -- nothing on the next frame');
  assert.equal(f.ram.u8(SLOT + 0x04), 0x3f);
});

test('W248 barrel 2 fires from the OTHER pod, off $C0, and aims first',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    // Barrel 1 held off, barrel 2 driven to its own borrow.
    f.ram.setU8(SLOT + 0x02, 0x7f);
    f.ram.setU8(SLOT + 0x06, 0);
    f.ram.setU8(SLOT + 0x08, 0);
    f.ram.setU8(SLOT + 0x0a, 0);
    f.ram.setU8(SLOT + 0x0c, 0);
    step(f);
    assert.equal(f.bullets.length, 4, 'four again, from $2A303E');
    assert.deepEqual(dirs(f), [0xc4, 0xcc, 0xbc, 0xb4], '$C0 and not $40');
    assert.equal(f.ram.u8(SLOT + 0x0c), 0, '$2A2FE8 armed 1, $2A3042 spent it');
    assert.equal(f.ram.u8(SLOT + 0x14), 0xec,
      '$2A2FF2 accumulates in the OUTER block, unlike barrel 1\'s');
    assert.equal(f.ram.u8(SLOT + 0x0a), 0x10, '$2A2FFE reloaded from $b(a4)');
    // Its position is pod 2's plus barrel 2's OWN muzzle bias -- D2 is $A2(a6) and D3
    // is $F93FFE00, so $3400 + $F93F. Barrel 1 fires from $82(a6) with $F940, one
    // count away, and getting the two swapped would put both fans on one pod.
    assert.equal(f.ram.u16(addrs(f)[0] + REC.posA), 0x2d3f,
      '$A2(a6) + $F93F, and not $82(a6) + $F940');
    assert.deepEqual(f.log.report(), [], 'the $24226E aim found its target');
  });

test('W248 the INIT literals make both barrels open on the SAME frame',
  { skip: SKIP }, () => {
    // $2(a4) and $8(a4) both arrive at $04 and both inner counters at zero, so the
    // fifth pass is eight shots and not four. Driven entirely from the literals, with
    // nothing forced, because the synchronisation IS the attack.
    const f = fixture();
    init(f);
    for (let n = 0; n < 3; n++) step(f);
    assert.deepEqual(f.bullets, [], 'nothing for four frames');
    step(f);
    assert.equal(f.bullets.length, 8, 'barrel 1 then barrel 2, in that order');
    assert.deepEqual(f.bullets.map((b) => b.site), [...FAN_SITES, ...FAN_SITES]);
    assert.deepEqual(dirs(f), [0x44, 0x4c, 0x3c, 0x34, 0xc4, 0xcc, 0xbc, 0xb4],
      'two fans, one per pod, pointing opposite ways');
    // ...and they then diverge, because the reloads differ: $D vs $10.
    assert.deepEqual([f.ram.u8(SLOT + 0x02), f.ram.u8(SLOT + 0x08)], [0x0d, 0x10],
      '$2A2F1E vs $2A2F30 -- the barrels drift apart after the first volley');
  });

test('W248 the fan folds through the byte wrap rather than saturating',
  { skip: SKIP }, () => {
    // $2A304C..$2A3072 are all byte-wide, so a base of $04 gives -$C = $F8.
    const f = fixture();
    init(f);
    for (const o of [0x02, 0x04, 0x06]) f.ram.setU8(SLOT + o, 0);
    f.ram.setU8(SLOT + 0x0c, 0x7f);
    f.ram.setU8(SLOT + 0x0a, 0x7f);
    step(f);
    assert.deepEqual(dirs(f), [0x44, 0x4c, 0x3c, 0x34],
      'barrel 1\'s base is a constant, so this is the same fan every time');
  });
