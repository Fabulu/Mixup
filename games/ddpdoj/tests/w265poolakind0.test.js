// W265: pool-A kind 0's body $27FA30 -- the screen clear's own effect, and the
// second half of DOCKET D3. W264 wired the allocator; without this the driver threw.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { allocPoolA27F8F0, runPoolADriver, POOL_A } from '../src/bee.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const CARRIER = 0x814600;
const PAUSE = 0x803912, FREEZE = 0x8130d2, PARITY = 0x80390c;

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(CARRIER + 0x02, 0x30001c00);
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    notes: log };
  return { ram, log, ctx };
}
/** One live kind-0 record, allocated the way the screen clear allocates it. */
function kind0(f) {
  const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, 0x00, 0, 0, CARRIER);
  assert.ok(slot !== null);
  return slot;
}
const drive = (f) => runPoolADriver(f.ram, ROM, f.ctx);

test('W265 the driver runs a kind-0 record instead of throwing', { skip: SKIP }, () => {
  const f = world();
  const slot = kind0(f);
  const t = drive(f);
  assert.equal(t.live, 1, 'the walk found it');
  assert.deepEqual(f.log.report(), [], 'and reached no unported path');
  assert.notEqual(f.ram.u16(slot), 0, 'it is still live');
});

test('W265 the sprite steps $24 and WRAPS at an exact value', { skip: SKIP }, () => {
  const f = world();
  const slot = kind0(f);
  // $27FA46 addi.l #$24 / $27FA4C cmpi.l #$1BCD0C / $27FA54 move.l #$1BCACC -- add,
  // compare, replace, all in ONE pass. So the frame that STEPS ONTO the wrap value is
  // the frame that wraps; $1BCD0C is never a value the record holds.
  f.ram.setU32(slot + 0x0a, 0x001bcce8);
  f.ram.setU8(slot + 0x18, 0);                 // the anim timer, ready to borrow
  drive(f);
  assert.equal(f.ram.u32(slot + 0x0a), 0x001bcacc,
    '$1BCCE8 + $24 is $1BCD0C, so the same pass replaced it with $1BCACC');

  // ...and a step that does NOT reach the wrap simply advances.
  const g = world();
  const s2 = kind0(g);
  g.ram.setU32(s2 + 0x0a, 0x001bcacc);
  g.ram.setU8(s2 + 0x18, 0);
  drive(g);
  assert.equal(g.ram.u32(s2 + 0x0a), 0x001bcaf0, '$1BCACC + $24');
  // Sixteen frames of stride $24 fit between $1BCACC and the wrap, which is exactly the
  // run the descriptor sweep reports as drawn.
  assert.equal((0x001bcd0c - 0x001bcacc) / 0x24, 16);
});

test('W265 the animation is on the old-zero borrow, not every frame',
  { skip: SKIP }, () => {
    const f = world();
    const slot = kind0(f);
    f.ram.setU32(slot + 0x0a, 0x001bcacc);
    f.ram.setU8(slot + 0x18, 2);
    f.ram.setU8(slot + 0x19, 2);
    const steps = [];
    for (let n = 0; n < 8; n++) {
      const before = f.ram.u32(slot + 0x0a);
      drive(f);
      steps.push(f.ram.u32(slot + 0x0a) !== before);
    }
    // 2 -> 1 -> 0 -> borrow, then the reload of 2 costs two more frames each time.
    assert.deepEqual(steps, [false, false, true, false, false, true, false, false],
      '$27FA36 subq.b/bcc -- one step every third frame at a period of 2');
  });

test('W265 the speed ramps every unfrozen frame and the pause holds the velocity',
  { skip: SKIP }, () => {
    const f = world();
    const slot = kind0(f);
    f.ram.setU8(slot + 0x1a, 4);
    drive(f);
    assert.equal(f.ram.u8(slot + 0x1a), 5, '$27FA6A addq.b #$1');

    // $27FA62 -- the FREEZE stops the ramp but still recomputes and moves.
    const g = world();
    const s2 = kind0(g);
    g.ram.setU8(s2 + 0x1a, 4);
    g.ram.setU16(FREEZE, 1);
    drive(g);
    assert.equal(g.ram.u8(s2 + 0x1a), 4, 'the speed did not ramp');
    assert.notEqual(g.ram.u16(s2 + 0x20), 0, 'but the velocity was still recomputed');

    // $27FA5A -- the PAUSE skips the recompute entirely and keeps the cached pair.
    const h = world();
    const s3 = kind0(h);
    h.ram.setU8(s3 + 0x1a, 4);
    h.ram.setU16(s3 + 0x20, 0x0111);
    h.ram.setU16(s3 + 0x22, 0x0222);
    h.ram.setU16(PAUSE, 1);
    drive(h);
    assert.equal(h.ram.u8(s3 + 0x1a), 4, 'no ramp');
    assert.deepEqual([h.ram.u16(s3 + 0x20), h.ram.u16(s3 + 0x22)], [0x0111, 0x0222],
      '$27FA60 bne -- the cached velocity is what keeps moving it');
  });

test('W265 a NEGATIVE long axis frees the record', { skip: SKIP }, () => {
  const f = world();
  const slot = kind0(f);
  const before = f.ram.u16(POOL_A.liveCount);
  // $27FA96 bmi -- the SIGN of the long axis after the step, not an off-screen box.
  f.ram.setU16(slot + 0x02, 0xff00);
  f.ram.setU16(PAUSE, 1);                      // keep the cached velocity at 0
  f.ram.setU16(slot + 0x20, 0);
  drive(f);
  assert.equal(f.ram.u16(slot), 0, '$27FABC clr.w (a6)');
  assert.equal(f.ram.u16(POOL_A.liveCount), before - 1, '$27FAC4 subq.w');
});

test('W265 a BUSY pool thins the draw by parity instead of dropping records',
  { skip: SKIP }, () => {
    // $27FA98 cmpi.w #$3C,$817F7E -- under $3C live it always draws. At or over it, the
    // record's own WALK INDEX parity against $80390C decides, so a busy pool halves its
    // draw rate rather than losing records. The pool has to be genuinely full for this:
    // forcing the count makes the driver's own count-vs-slots check fire, correctly.
    const q = BUCKETS[8];

    // Under the threshold: every record draws.
    const few = world();
    few.ram.setU16(PAUSE, 1);
    for (let i = 0; i < 8; i++) kind0(few);
    const b0 = few.ram.u16(q.counter);
    drive(few);
    const drewFew = few.ram.u16(q.counter) - b0;

    // At the threshold: half of them do, and which half is $80390C.
    const busy = world();
    busy.ram.setU16(PAUSE, 1);
    for (let i = 0; i < 0x3c; i++) kind0(busy);
    assert.equal(busy.ram.u16(POOL_A.liveCount), 0x3c, 'a genuinely full-enough pool');
    busy.ram.setU16(PARITY, 0);
    const b1 = busy.ram.u16(q.counter);
    drive(busy);
    const drewA = busy.ram.u16(q.counter) - b1;

    const busy2 = world();
    busy2.ram.setU16(PAUSE, 1);
    for (let i = 0; i < 0x3c; i++) kind0(busy2);
    busy2.ram.setU16(PARITY, 1);
    const b2 = busy2.ram.u16(q.counter);
    drive(busy2);
    const drewB = busy2.ram.u16(q.counter) - b2;

    const per = drewFew / 8;                   // records-per-draw-record, whatever it is
    assert.ok(drewFew > 0, 'the small pool drew');
    assert.ok(drewA > 0 && drewB > 0, 'both parities draw SOMETHING');
    assert.ok(drewA < per * 0x3c && drewB < per * 0x3c,
      `$27FAAE beq -- a busy pool thins: ${drewA} and ${drewB} against ${per * 0x3c}`);
    assert.equal(drewA + drewB, per * 0x3c,
      'and the two parities partition the pool exactly, so nothing is lost');
    assert.equal(busy.ram.u16(POOL_A.liveCount), 0x3c,
      'no record was freed to achieve it');
  });

test('W265 bits 11 or 12 in the status make the body do NOTHING', { skip: SKIP }, () => {
  // $27FA30 andi.w #$1800,D1 / bne -- it returns to the walk without touching anything.
  for (const bit of [0x0800, 0x1000]) {
    const f = world();
    const slot = kind0(f);
    f.ram.setU16(slot, f.ram.u16(slot) | bit);
    f.ram.setU8(slot + 0x1a, 7);
    const pos = f.ram.u32(slot + 0x02);
    drive(f);
    assert.equal(f.ram.u8(slot + 0x1a), 7, `bit $${bit.toString(16)}: no ramp`);
    assert.equal(f.ram.u32(slot + 0x02), pos, 'and no movement');
  }
});
