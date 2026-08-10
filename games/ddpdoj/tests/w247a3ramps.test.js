// W247: A3 3..8, the Stage-4 boss's six-instance ramp family, which F5 starts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { a3Ramp } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A5 = 0x814000, A6 = 0x81b732;
const A3_TABLE = 0x2a1370;                 // $29EC82's install: a3: $2A1370
const SLOT = SCHED.a3Base;

// id -> the cursor it ramps, its direction and where it stops. Every one of these is
// read back out of the ROM below except the offsets, which are code immediates.
const FAMILY = [
  { id: 3, init: 0x2a14aa, off: 0x106, up: true, limit: 0x3c },
  { id: 4, init: 0x2a14d8, off: 0x106, up: false, limit: 0x00 },
  { id: 5, init: 0x2a1506, off: 0x088, up: true, limit: 0x20 },
  { id: 6, init: 0x2a1534, off: 0x088, up: false, limit: 0x00 },
  { id: 7, init: 0x2a1562, off: 0x0a8, up: true, limit: 0x20 },
  { id: 8, init: 0x2a1590, off: 0x0a8, up: false, limit: 0x00 },
];

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log, soundPost() {}, bulletSpawn() {},
    effectSpawn() {} };
  return { ram, log, ctx };
}

test('W247 the ROM itself says these six are one routine', { skip: SKIP }, () => {
  // A uniform $2E stride between INITs, and the STEP exactly $6 past each -- which is
  // the shared `move.w #$1,$2(a4)` and nothing else.
  for (const f of FAMILY) {
    assert.equal(ROM.u32(A3_TABLE + f.id * 8), f.init, `A3 ${f.id} INIT`);
    assert.equal(ROM.u32(A3_TABLE + f.id * 8 + 4), f.init + 6, `A3 ${f.id} STEP`);
    assert.ok(scriptAddresses().includes(f.init), `$${f.init.toString(16)} registered`);
    assert.ok(scriptAddresses().includes(f.init + 6), 'and its step');
  }
  const strides = FAMILY.slice(1).map((f, i) => f.init - FAMILY[i].init);
  assert.deepEqual(strides, [0x2e, 0x2e, 0x2e, 0x2e, 0x2e],
    'six bodies of identical length is what makes them one routine');
});

test('W247 INIT falls through, so the ramp moves on the arming frame',
  { skip: SKIP }, () => {
    for (const f of FAMILY) {
      const x = fixture();
      x.ram.setU16(A6 + f.off, 0x0010);          // mid-ramp, so neither end fires
      a3Ramp(f.init).init(x.ram, ROM, x.ctx, SLOT);
      // `move.w #$1,$2(a4)` leaves the byte at $2 ZERO, so `subq.b #1 / bcc` borrows
      // out of an old zero on the very first pass.
      assert.equal(x.ram.u16(A6 + f.off), f.up ? 0x14 : 0x0c,
        `A3 ${f.id} stepped on its own INIT frame`);
      assert.equal(x.ram.u8(SLOT + 0x02), 1, '$2A14B8 reloaded the period from $3(a4)');
      // ...and the reload of 1 costs the NEXT frame, which is the half of this the
      // arming frame hides.
      a3Ramp(f.init).step(x.ram, ROM, x.ctx, SLOT);
      assert.equal(x.ram.u16(A6 + f.off), f.up ? 0x14 : 0x0c,
        `A3 ${f.id} did not step again on the very next frame`);
      assert.deepEqual(x.log.report(), [], 'and reached no unported path');
    }
  });

test('W247 each one runs to its OWN limit and then retires itself', { skip: SKIP }, () => {
  for (const f of FAMILY) {
    const x = fixture();
    const start = f.up ? 0 : f.id === 4 ? 0x3c : 0x20;
    x.ram.setU16(A6 + f.off, start);
    x.ram.setU16(SLOT, 0x8000 | f.id);           // the live slot the script sits in
    const { init, step } = a3Ramp(f.init);
    init(x.ram, ROM, x.ctx, SLOT);
    let frames = 1;
    while (x.ram.u16(SLOT) !== 0 && frames < 80) { step(x.ram, ROM, x.ctx, SLOT); frames++; }
    assert.equal(x.ram.u16(A6 + f.off), f.limit, `A3 ${f.id} settled on its limit`);
    assert.equal(x.ram.u16(SLOT), 0, '$2A13C8 clr.w (a4) -- it retires ITSELF');
    // 2n-1, not n. The reload writes ONE, so the frame after a step is spent bringing
    // the counter to zero and only the frame after THAT borrows. The arming frame is
    // the exception, because `move.w #$1` leaves the counter already at zero.
    const steps = Math.abs(f.limit - start) / 4;
    assert.equal(frames, 2 * steps - 1,
      `A3 ${f.id} ramps on every second frame after its first`);
  }
});

test('W247 the limit is PINNED, not compared for equality', { skip: SKIP }, () => {
  // A descending cursor that is not a multiple of 4 overshoots: 2 - 4 is -2, and
  // `cmpi.w #$0 / bgt` is SIGNED, so the arm fires and `move.w #$0` cleans up. A port
  // that tested `next === 0` instead would leave $FFFE in an animation cursor and the
  // next descriptor read would be $29F356 - 2.
  const f = FAMILY.find((e) => e.id === 6);
  const x = fixture();
  x.ram.setU16(A6 + f.off, 2);
  x.ram.setU16(SLOT, 0x8006);
  a3Ramp(f.init).init(x.ram, ROM, x.ctx, SLOT);
  assert.equal(x.ram.u16(A6 + f.off), 0, '$2A1556 move.w #$0 pins it');
  assert.equal(x.ram.u16(SLOT), 0, 'and it retires on the same frame');

  // The ascending mirror: $1E + 4 is $22, past $20, so it pins DOWN to $20.
  const g = FAMILY.find((e) => e.id === 5);
  const y = fixture();
  y.ram.setU16(A6 + g.off, 0x1e);
  y.ram.setU16(SLOT, 0x8005);
  a3Ramp(g.init).init(y.ram, ROM, y.ctx, SLOT);
  assert.equal(y.ram.u16(A6 + g.off), 0x20, '$2A1528 move.w #$20 pins it');
  assert.equal(y.ram.u16(SLOT), 0);
});

test('W247 every frame of every ramp is a descriptor the port can actually draw',
  { skip: SKIP }, () => {
    // The cursors are byte offsets into longword descriptor lists, which the object
    // code at objects 7, 8, 9 and 0 already reads. If a ramp could reach past its
    // list, `RomWindows` would throw on the frame it did.
    for (const [base, limit, who] of [
      [0x29f356, 0x20, 'the pods, $88 and $A8'],
      [0x29f002, 0x3c, 'object 9, $106'],
      [0x29f096, 0x3c, 'object 0, $106'],
    ]) {
      for (let o = 0; o <= limit; o += 4) {
        assert.doesNotThrow(() => ROM.u32(base + o),
          `${who}: $${(base + o).toString(16)} resolves`);
      }
    }
  });

test('W247 the two pods ramp independently, which is why there are two of them',
  { skip: SKIP }, () => {
    const x = fixture();
    const pod1 = a3Ramp(0x2a1506), pod2 = a3Ramp(0x2a1562);
    const S1 = SCHED.a3Base, S2 = SCHED.a3Base + SCHED.a3Stride;
    pod1.init(x.ram, ROM, x.ctx, S1);
    assert.equal(x.ram.u16(A6 + 0x88), 4, 'pod 1 moved');
    assert.equal(x.ram.u16(A6 + 0xa8), 0, 'and pod 2 did not');
    pod2.init(x.ram, ROM, x.ctx, S2);
    assert.deepEqual([x.ram.u16(A6 + 0x88), x.ram.u16(A6 + 0xa8)], [4, 4],
      'F5 arm 2 starts A3 5 and A3 7 together, one cursor each');
  });
