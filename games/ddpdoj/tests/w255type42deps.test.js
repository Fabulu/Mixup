// W255: the three things type $42's handler needs before it can be written --
// $241E34, its two data tables, and the $23F7C6 draw stub.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, i16, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { resolveEmitStub, BUCKETS } from '../src/spritequeue.js';
import { applyShotVelocity241E34 } from '../src/movement.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A6 = 0x81b732;
const FREEZE = 0x8130d2;
const DESCRIPTORS = 0x2a4252, LADDER = 0x2a4272;

function fixture() {
  const ram = new Ram();
  ram.setU16(A6 + 0x02, 0x3000);
  ram.setU16(A6 + 0x04, 0x1800);
  return ram;
}

test('W255 $241E34 applies the SHOT vector and honours the freeze', { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU8(A6 + 0x1a, 0x10);                  // speed
  ram.setU8(A6 + 0x1b, 0x20);                  // heading
  const expect = MT.shotVector(0x10, 0x20);
  const v = applyShotVelocity241E34(ram, MT, A6);
  assert.deepEqual(v, expect, '$241E48 bsr $241D34');
  assert.equal(ram.u16(A6 + 0x02), u16(0x3000 + expect.dy), '$241E4C add.w D2');
  assert.equal(ram.u16(A6 + 0x04), u16(0x1800 + expect.dx), '$241E50 add.w D3');

  // $241E40 tst.w $8130D2 / bne $241E56 -- {0,0} AND NO APPLY, not a zero apply.
  const g = fixture();
  g.setU8(A6 + 0x1a, 0x10);
  g.setU8(A6 + 0x1b, 0x20);
  g.setU16(FREEZE, 1);
  assert.deepEqual(applyShotVelocity241E34(g, MT, A6), { dy: 0, dx: 0 });
  assert.deepEqual([g.u16(A6 + 0x02), g.u16(A6 + 0x04)], [0x3000, 0x1800],
    'the position is untouched while frozen');
});

test('W255 $241E34 takes the WHOLE heading byte, unlike $2417DE', { skip: SKIP }, () => {
  // `$241E3C move.b ($1b,A6),D1` has no `and.b #$3f`, and `$241D34` folds the whole
  // byte with its own table. Masking here would land the shot in another quadrant, so
  // a heading above $3F must NOT behave like heading & $3F.
  const ram = fixture();
  ram.setU8(A6 + 0x1a, 0x10);
  ram.setU8(A6 + 0x1b, 0xa0);                  // $A0 & $3F is $20
  const whole = applyShotVelocity241E34(ram, MT, A6);
  assert.deepEqual(whole, MT.shotVector(0x10, 0xa0));
  assert.notDeepEqual(whole, MT.shotVector(0x10, 0x20),
    '$A0 and $20 are different quadrants, which is the whole point');
});

test('W255 the eight sprite descriptors step uniformly, which is their own witness',
  { skip: SKIP }, () => {
    const d = Array.from({ length: 8 }, (_, i) => ROM.u32(DESCRIPTORS + i * 4));
    assert.deepEqual(d, [0x000e8458, 0x000e84bc, 0x000e8520, 0x000e8584,
      0x000e85e8, 0x000e864c, 0x000e86b0, 0x000e8714]);
    const steps = d.slice(1).map((v, i) => v - d[i]);
    assert.deepEqual(steps, [0x64, 0x64, 0x64, 0x64, 0x64, 0x64, 0x64],
      'a uniform $64 stride is what says the run is eight and not seven or nine');
    // `$2A41F0 addq.w #$4` with `$2A41F4 andi.w #$1F` is the cursor that bounds it,
    // and $2A4252 + $20 is exactly where the ladder starts.
    assert.equal(DESCRIPTORS + 0x20, LADDER);
  });

test('W255 the distance ladder is a linear ramp, terminated in the ROM',
  { skip: SKIP }, () => {
    const rungs = [];
    for (let a = LADDER; ; a += 4) {
      const dist = ROM.u16(a);
      if (dist === 0xffff) { assert.equal(a, 0x2a42d2, 'the $FFFF is where it is'); break; }
      rungs.push([dist, ROM.u16(a + 2)]);
      assert.ok(rungs.length <= 40, 'terminated, not runaway');
    }
    assert.equal(rungs.length, 24);
    // distance $40*n -> speed 2n, except the first rung which is 1 rather than 2.
    assert.deepEqual(rungs.map(([dd]) => dd),
      Array.from({ length: 24 }, (_, i) => 0x40 * (i + 1)));
    assert.deepEqual(rungs.map(([, s]) => s),
      [1, ...Array.from({ length: 23 }, (_, i) => 2 * (i + 2) - 2)]);
    // The window stops at the terminator's own word and no further.
    assert.throws(() => ROM.u16(0x2a42d4), (e) => e.name === 'Unreached');
  });

test('W255 $23F7C6 needed a window and NOT a line of code', { skip: SKIP }, () => {
  // `resolveEmitStub` decodes an emit stub out of the ROM, so the only thing standing
  // between the port and this one was readability. It is bucket 22 -- the same buffer
  // and cursor ($809274 / $80AFE0) the stage-clear banner's entry picture uses.
  assert.deepEqual(resolveEmitStub(ROM, 0x23f7c6), { bucket: 22, conv: 'register' });
  assert.equal(BUCKETS[22].buffer, 0x809274);
  assert.equal(BUCKETS[22].counter, 0x80afe0);
  // Its sibling, which the port already reaches through stageend.js, is a DIFFERENT
  // bucket -- so the two are not interchangeable.
  assert.equal(resolveEmitStub(ROM, 0x23df2a).bucket, 2);
  assert.throws(() => ROM.u16(0x23f7f4), (e) => e.name === 'Unreached',
    'and the window stops at the next stub prologue');
});

test('W255 the handler\'s own extent is pinned by its rts', { skip: SKIP }, () => {
  // $2A4250 is the handler's `rts` and $2A4252 is the first descriptor, so the code
  // ends exactly one word before the data. Nothing between them.
  assert.throws(() => ROM.u16(0x2a4250), (e) => e.name === 'Unreached',
    '$2A4250 is code, so it is not in the data window');
  assert.doesNotThrow(() => ROM.u32(0x2a4252), 'and $2A4252 is');
});
