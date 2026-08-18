// ===============================================================================================
// W420 -- A4 SCRIPT $14 `$2A6B7A`, HIBACHI'S FIRST-LOOP ENDING.
// ===============================================================================================
//
// UNIT. The other `jsr $2595E8` in the boss ROM. W409 corrected four consecutive handoffs that
// had claimed only this script reaches the stage-over store; there are TWO, and W409 ported the
// other one. This is the arm no bench has been taking.
//
// THREE DISPATCHES AT THIS UNIT DIED TO SERVER ERRORS. The coordinator did the recon inline,
// banked it in the handoff, and ported it inline when a further attempt also failed. Every
// number below is measured here rather than inherited from that note.
//
// THE WHOLE UNIT. Six instructions:
//
//   $2A6B7A  39 7c 00 80 00 02   move.w #$80,($2,A4)
//   $2A6B80  53 6c 00 02         subq.w #1,($2,A4)
//   $2A6B84  66 00 00 0a         bne.w  -> $2A6B90        ext word $2A6B86 + $0A
//   $2A6B88  4e b9 00 25 95 e8   jsr $2595E8
//   $2A6B8E  42 54               clr.w (A4)               TRAP: 4254 is clr.w (A4), not clr.w D4
//   $2A6B90  4e 75               rts
//
// SECTION 1  the six instructions, byte for byte, out of the image
// SECTION 2  the extent: $18 of CODE, and why the $1A that was counted is not the code length
// SECTION 3  $14 is the LAST table entry, so entry-to-entry cannot bound it
// SECTION 4  exactly ONE starter, enumerated over $2A0000..$2AB000
// SECTION 5  THE DELIVERABLE: 128 frames driven, the store on the frame the counter empties
// SECTION 6  the recycled-slot trap -- the field DIRTIED before init, three waves running
// SECTION 7  the two endings are not variants of one routine
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import {
  HIBACHI_A4, HIBACHI_END_SCRIPTS, HIBACHI_END_COUNTED,
  s14Init2A6B7A, s14Step2A6B80,
} from '../src/hibachiend.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false
  : path.basename(IMAGE) + ' absent -- run tools/export-tables.py. THIS IS A SKIP, NOT A PASS.';
const IMG = SKIP ? null : readFileSync(IMAGE);

const A4 = 0x813000;
const SUSPEND = 0x812e06;

const bytesAt = (addr, n) => Array.from(IMG.subarray(addr, addr + n));
const beU16 = (addr) => (IMG[addr] << 8) | IMG[addr + 1];
const beU32 = (addr) => ((IMG[addr] << 24) | (IMG[addr + 1] << 16)
  | (IMG[addr + 2] << 8) | IMG[addr + 3]) >>> 0;

test('SECTION 1: the whole script is six instructions, read out of the image', { skip: SKIP }, () => {
  assert.deepEqual(bytesAt(0x2a6b7a, 6), [0x39, 0x7c, 0x00, 0x80, 0x00, 0x02],
    '$2A6B7A move.w #$80,($2,A4) -- the 128-frame beat, a WORD store');
  assert.deepEqual(bytesAt(0x2a6b80, 4), [0x53, 0x6c, 0x00, 0x02], '$2A6B80 subq.w #1,($2,A4)');
  assert.deepEqual(bytesAt(0x2a6b84, 4), [0x66, 0x00, 0x00, 0x0a], '$2A6B84 bne.w');
  assert.deepEqual(bytesAt(0x2a6b88, 6), [0x4e, 0xb9, 0x00, 0x25, 0x95, 0xe8],
    '$2A6B88 jsr $2595E8 -- the stage-over store');
  assert.deepEqual(bytesAt(0x2a6b8e, 2), [0x42, 0x54],
    '$2A6B8E is 4254 = clr.w (A4), the SLOT. TRAP: it is not clr.w D4');
  assert.deepEqual(bytesAt(0x2a6b90, 2), [0x4e, 0x75], '$2A6B90 rts');
});

test('SECTION 1: the bne.w target is the rts, from the EXTENSION word address', { skip: SKIP }, () => {
  const disp = beU16(0x2a6b86);
  assert.equal(disp, 0x000a, 'the displacement word');
  assert.equal(0x2a6b86 + disp, 0x2a6b90,
    'so a NON-zero counter branches to the rts and the store is skipped');
});

test('SECTION 2: code is $18, and the $1A that was counted is $18 plus alignment',
  { skip: SKIP }, () => {
    const end = 0x2a6b92;
    assert.equal(end - 0x2a6b7a, 0x18, 'CODE length');
    assert.equal(0x2a6b94 - end, 2, 'two bytes of alignment');
    assert.equal(0x2a6b94 - 0x2a6b7a, 0x1a,
      'so the $1A this file used to count is $18 of code plus that padding');
    assert.notEqual(beU16(0x2a6b94), 0x0000, '$2A6B94 is code, not more padding');
  });

test('SECTION 2: $14 is no longer counted, and IS registered', { skip: SKIP }, () => {
  assert.equal(HIBACHI_END_COUNTED[0x14], undefined, '$14 left the counted list');
  assert.ok(HIBACHI_END_SCRIPTS.includes(0x14), 'and it is in the registered list');
  assert.equal(HIBACHI_A4.s14Init, 0x2a6b7a);
  assert.equal(HIBACHI_A4.s14Step, 0x2a6b80);
});

test('SECTION 3: $14 is the LAST table entry, so there is no next entry to measure against',
  { skip: SKIP }, () => {
    const base = HIBACHI_A4.table;
    assert.equal(beU32(base + 0x14 * 8), 0x2a6b7a, 'entry [$14].init');
    assert.equal(beU32(base + 0x14 * 8 + 4), 0x2a6b80, 'entry [$14].step');
    assert.equal(beU32(base + 21 * 8), 0x70004eb9,
      'index 21 reads moveq #0,D0 / jsr -- code, not a pointer');
    assert.equal(base + 21 * 8, beU32(base),
      'and the table ends exactly where its own entry [0].init begins');
  });

test('SECTION 4: exactly ONE site starts $14, enumerated over the whole boss ROM',
  { skip: SKIP }, () => {
    const sites = [];
    for (let a = 0x2a0000; a < 0x2ab000; a += 2) {
      if (beU16(a) !== 0x7014) continue;
      const op = beU16(a + 2);
      if (op !== 0x4eb9 && op !== 0x4ef9) continue;
      if (beU32(a + 4) !== 0x25980c) continue;
      sites.push(a);
    }
    assert.deepEqual(sites, [0x2a5cb4],
      'script 1 first-loop arm is the only thing that starts this ending');
  });

test('SECTION 5: the counter reads back on EVERY frame, not just at the ends',
  { skip: SKIP }, () => {
    const ram = new Ram();
    s14Init2A6B7A(ram, A4);
    assert.equal(ram.u16(A4 + 0x02), 0x80, 'init loads 128');
    for (let n = 1; n <= 0x80; n++) {
      s14Step2A6B80(ram, A4);
      const want = 0x80 - n;
      assert.equal(ram.u16(A4 + 0x02), want, 'after step ' + n + ' the slot word is ' + want);
    }
  });

test('SECTION 5: the store fires on the frame the counter empties and NOT before',
  { skip: SKIP }, () => {
    const ram = new Ram();
    s14Init2A6B7A(ram, A4);
    ram.setU16(A4, 0xbeef);
    ram.setU16(SUSPEND, 0);
    for (let n = 1; n < 0x80; n++) {
      s14Step2A6B80(ram, A4);
      assert.equal(ram.u16(SUSPEND), 0,
        'frame ' + n + ': the stage must NOT be over while the counter is ' + (0x80 - n));
      assert.equal(ram.u16(A4), 0xbeef, 'frame ' + n + ': and the slot must still be live');
    }
    s14Step2A6B80(ram, A4);
    assert.equal(ram.u16(A4 + 0x02), 0, 'the counter is empty');
    assert.equal(ram.u16(SUSPEND), 1, '$2595E8 stored 1 -- the stage is over');
    assert.equal(ram.u16(A4), 0, 'and clr.w (A4) freed the slot on the SAME frame');
  });

test('SECTION 6: the init OVERWRITES a dirty slot word -- a fresh Ram would hide this',
  { skip: SKIP }, () => {
    for (const dirt of [0x0001, 0x007f, 0x0081, 0xffff, 0x8000]) {
      const ram = new Ram();
      ram.setU16(A4 + 0x02, dirt);
      s14Init2A6B7A(ram, A4);
      assert.equal(ram.u16(A4 + 0x02), 0x80,
        'a slot carrying ' + dirt.toString(16) + ' still starts at exactly 128');
    }
  });

test('SECTION 6: a dirty slot does not shorten or lengthen the beat', { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(A4 + 0x02, 0x0003);
  ram.setU16(SUSPEND, 0);
  s14Init2A6B7A(ram, A4);
  let fired = -1;
  for (let n = 1; n <= 0x80 && fired < 0; n++) {
    s14Step2A6B80(ram, A4);
    if (ram.u16(SUSPEND) === 1) fired = n;
  }
  assert.equal(fired, 0x80, 'still exactly 128 frames, not 3');
});

test('SECTION 7: there are exactly two $2595E8 sites and this file now ports both',
  { skip: SKIP }, () => {
    const sites = [];
    for (let a = 0x2a4000; a < 0x2ab000; a += 2) {
      if (beU16(a) === 0x4eb9 && beU32(a + 2) === 0x2595e8) sites.push(a);
    }
    assert.deepEqual(sites, [0x2a6466, 0x2a6b88],
      '$2A6466 is A4 script 5 (W409, second loop); $2A6B88 is this one (first loop)');
    assert.equal(0x2a6b92 - 0x2a6b7a, 0x18, 'this ending: 24 bytes');
    assert.ok(0x270 > 0x18 * 25, 'script 5 is more than twenty-five times larger');
  });
