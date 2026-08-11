// W260: Stage-4 boss A1 14, the four-muzzle burst emitter A4 id6 alternates.

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
import { a1_14Init2A36EA, a1_14Step2A3714 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A1_TABLE = 0x2a1608;
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const MUZZLES = 0x2a37cc;
const EXPECT_MUZZLES = [0x08000e00, 0x08001400, 0x0800f200, 0x0800ec00];

function fixture({ target = true } = {}) {
  const ram = new Ram();
  const log = new UnportedLog();
  const bullets = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x22, 0x2c001a00);
  ram.setU16(SLOT, 0x800e);
  ram.setU16(SLOT + 0x10, 8);                  // A4 id6's parameter, $2A12F2
  if (target) {
    ram.setU16(RAM.player1, 0x8000);
    ram.setU16(RAM.player1 + P.posY, 0x2000);
    ram.setU16(RAM.player1 + P.posX, 0x1800);
  }
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log,
    bulletSpawn(site, result) { bullets.push({ site, result }); } };
  return { ram, log, ctx, bullets };
}
const init = (f) => a1_14Init2A36EA(f.ram, ROM, f.ctx, SLOT);
const step = (f) => a1_14Step2A3714(f.ram, ROM, f.ctx, SLOT);
const flat = (f) => f.bullets
  .flatMap((b) => (Array.isArray(b.result) ? b.result : [b.result]))
  .filter((r) => r && r.addr !== null);

test('W260 A1 14 is registered and its muzzle table abuts type $41\'s window',
  { skip: SKIP }, () => {
    for (const a of [0x2a36ea, 0x2a3714])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(A1_TABLE + 14 * 8), ROM.u32(A1_TABLE + 14 * 8 + 4)],
      [0x2a36ea, 0x2a3714]);
    // FOUR muzzles, which `$2A373A andi.w #$3` is what bounds it at.
    assert.deepEqual(Array.from({ length: 4 }, (_, i) => ROM.u32(MUZZLES + i * 4)),
      EXPECT_MUZZLES);
    // Two on each side: the short axis is $E00/$1400 then $F200/$EC00.
    assert.deepEqual(EXPECT_MUZZLES.map((v) => (v & 0xffff) >= 0x8000),
      [false, false, true, true], 'two right, then two left');
    assert.equal(MUZZLES + 0x10, 0x2a37dc,
      'and it ends exactly where type $41\'s init stub begins');
    assert.doesNotThrow(() => ROM.u32(0x2a37dc), 'which W223 already exported');
  });

test('W260 INIT falls through and the first burst arms four frames later',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    // $8(a4) arrives as the word $0005: byte $8 is the ZERO the tst sees and byte $9 is
    // the length 5. $4(a4) arrives at 4, and `bcc` borrows only out of an old zero.
    assert.deepEqual([f.ram.u8(SLOT + 0x08), f.ram.u8(SLOT + 0x09)], [0, 5]);
    assert.equal(f.ram.u8(SLOT + 0x04), 3, '$2A36F0 left 4, less the arming tick');
    assert.deepEqual(f.bullets, [], 'and nothing fired');
    // FOUR more, not three: `bcc` borrows on the frame the counter was ALREADY zero, so
    // reaching zero costs three steps and the borrow is the one after.
    for (let n = 0; n < 4; n++) step(f);
    assert.equal(f.ram.u8(SLOT + 0x08), 5, '$2A372A armed the burst');
    assert.equal(f.ram.u8(SLOT + 0x09), 6, '$2A3730 -- and the NEXT one is longer');
    assert.deepEqual(f.log.report(), []);
  });

test('W260 a burst comes from ONE muzzle and its speed bias ramps per shot',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    for (let n = 0; n < 4; n++) step(f);       // arm the first burst
    const muzzle = f.ram.u16(SLOT + 0x0a);
    assert.ok(muzzle <= 3, '$2A373A andi.w #$3');
    const biases = [];
    for (let n = 0; n < 40 && f.ram.u8(SLOT + 0x08) !== 0; n++) {
      f.ram.setU8(SLOT + 0x06, 0);             // force the inner cadence
      const before = f.bullets.length;
      step(f);
      if (f.bullets.length > before) biases.push(f.ram.u16(SLOT + 0x0e));
      assert.equal(f.ram.u16(SLOT + 0x0a), muzzle,
        'the muzzle is drawn once per BURST, not per shot');
    }
    assert.equal(biases.length, 5, 'five shots, the length $9(a4) armed');
    assert.deepEqual(biases, [2, 4, 6, 8, 10], '$2A37AE addq.w #$2 per shot');
    assert.deepEqual(f.bullets.map((b) => b.site), Array(5).fill(0x2a37a8));
  });

test('W260 the muzzle offset reaches the shot as D3', { skip: SKIP }, () => {
  const f = fixture();
  init(f);
  for (let n = 0; n < 4; n++) step(f);
  f.ram.setU16(SLOT + 0x0a, 2);                // force the third muzzle, $0800F200
  f.ram.setU8(SLOT + 0x06, 0);
  step(f);
  assert.equal(f.bullets.length, 1);
  // D2 is the body position and D3 the muzzle, so the spawn lands on their sum.
  assert.equal(f.ram.u16(flat(f)[0].addr + REC.posA), (0x2c00 + 0x0800) & 0xffff,
    '$2A37A2 D2 plus $2A3790 D3, on the long axis');
});

test('W260 the aim is STICKY: no target keeps the previous heading', { skip: SKIP }, () => {
  const f = fixture({ target: false });
  init(f);
  // $2A3708 seeds the WORD $C(a4) as $8000, so the BYTE the heading lives in is $80 --
  // the high half, not the low one -- and $2A376A's bcs skips the store. A port that
  // stored on carry would aim at garbage; one that read the low byte would aim at 0.
  for (let n = 0; n < 4; n++) step(f);
  assert.equal(f.ram.u8(SLOT + 0x0c), 0x80, '$2A376A bcs -- the seed survived');
  f.ram.setU8(SLOT + 0x06, 0);
  step(f);
  assert.deepEqual(flat(f).map((r) => f.ram.u8(r.addr + REC.dir)), [0x80],
    'so a targetless burst fires straight back the way it came');

  // With a target it DOES store, which is the other half of the same branch.
  const g = fixture();
  init(g);
  for (let n = 0; n < 4; n++) step(g);
  assert.notEqual(g.ram.u8(SLOT + 0x0c), 0, '$2A376E move.b d1,$c(a4)');
});

test('W260 bursts get longer, and $10(a4) counts them down to retirement',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU16(SLOT + 0x10, 3);              // three bursts, not eight
    init(f);
    const lengths = [];
    for (let n = 0; n < 400 && f.ram.u16(SLOT) !== 0; n++) {
      f.ram.setU8(SLOT + 0x04, 0);
      f.ram.setU8(SLOT + 0x06, 0);
      const armed = f.ram.u8(SLOT + 0x08);
      step(f);
      if (armed === 0 && f.ram.u8(SLOT + 0x08) !== 0) lengths.push(f.ram.u8(SLOT + 0x08));
    }
    assert.equal(f.ram.u16(SLOT), 0, '$2A37C8 -- it retired');
    assert.equal(f.ram.u16(SLOT + 0x10), 0, 'after exactly its parameter many bursts');
    // 4, 5, 6 and not 5, 6, 7: the loop forces the INNER cadence too, so the frame that
    // arms a burst also spends one of it. The lengths $2A372A writes are 5, 6, 7.
    assert.deepEqual(lengths.slice(0, 3), [4, 5, 6],
      '$2A3730 -- each burst one longer, less the arming frame own shot');
  });

test('W260 it does NOT touch $10(a4), because that is A4 id6\'s parameter',
  { skip: SKIP }, () => {
    // A4 id6 writes it through the slot $259A18 returned, BEFORE the scheduler ever
    // dispatches the INIT. An INIT that zeroed it would make the attack never end.
    const f = fixture();
    f.ram.setU16(SLOT + 0x10, 0x1234);
    init(f);
    assert.equal(f.ram.u16(SLOT + 0x10), 0x1234, 'the INIT left it alone');
  });
