// WAVE 34 -- THE SIX CRASHES THAT WERE LIVE ON THE PUBLIC SITE.
//
// W33's sweep (docs/worklog/gradius/33-qa-shipped-throws.md) drove `nmi()` over
// every chunk of every stage the ledger printed RUNNABLE and found five throws
// besides W32c's `$BC44`. Three of them needed no player input at all. This
// suite is the evidence for the fixes and, more importantly, for the CLAIMS the
// fixes rest on -- every one of which is arithmetic on bytes read out of
// `assets/prg.bin`, not out of the port's own tables (docs/knowledge/03: two
// sides of a comparison must be independently derived).
//
// WHAT THIS SUITE CANNOT DO. There is still no cartridge comparison for any of
// this: no corpus scenario reaches stage 2's breakable walls or stage 3's arc
// enemies. Every number is PORT vs LISTING, which is what docs/knowledge/10
// says the guarantee has to rest on when the behaviour space cannot be sampled.
//
// The end-to-end sweep that FOUND all of this now lives in the gate as its own
// stage (`games/gradius/tools/test-all.mjs`, stage "stage sweep"), not here,
// because a gate stage is what a reader looks at.
//
// Mutation table: docs/worklog/gradius/34-impl-shipped-crashes.md.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS, headlessResources } from './helpers.js';
import { u8, ENEMY_BASE } from '../src/state.js';
import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';

const res = headlessResources(0);
const prg = new Uint8Array(readFileSync(join(ASSETS, 'prg.bin')));
const rb = (a) => prg[a - 0x8000];

/** Seed the engine on stage `st`'s chunk `c`, exactly as the gate sweep does. */
export function seedChunk(st, c) {
  const rom = res.enemyTables;
  const tbl = rom.word(0xA7D0 + 2 * st);
  const ptr = rom.read(tbl + 2 * c) | (rom.read(tbl + 2 * c + 1) << 8);
  const s = bootState(res.manifest);
  s.zp19 = st;
  s.substate = 0x80;
  s.spawn.z60 = 2;
  s.spawn.z61 = 0;
  s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
  s.cam.hi = 0; s.cam.lo = 0;
  return s;
}

// =========================================================================
// #1  $B415 LDA $B42F,Y -- the five-entry schedule the ROM reads past.
//     Stages 3 and 4, frame 314, no input. W33's most severe finding.
// =========================================================================

test('$B42F/$B45C: the two schedules are 00 00 00 01 01, read out of prg.bin', () => {
  // The independent half of the derivation. If these five bytes were anything
  // else the "three left, two right, net one arc left" argument collapses and
  // so does everything built on it.
  // RED WHEN: export_assets.py cites either range at the wrong address.
  for (const base of [0xB42F, 0xB45C]) {
    assert.deepEqual([0, 1, 2, 3, 4].map((k) => rb(base + k)),
      [0x00, 0x00, 0x00, 0x01, 0x01],
      `the schedule at $${base.toString(16).toUpperCase()}`);
  }
  // and $B200's, which is the CONTROL: four left and one right, not three and
  // two. This is the byte-level reason $B1C5 stops at Y = 4 on the cartridge
  // and $B415 does not.
  assert.deepEqual([0, 1, 2, 3, 4].map((k) => rb(0xB200 + k)),
    [0x00, 0x00, 0x01, 0x00, 0x00], '$B200, the schedule that does NOT overrun');
});

test('$B434/$B461: every byte the overrun can reach is NON-ZERO', () => {
  // The whole bound rests on this: past the schedule the direction flag is
  // always "fly RIGHT", so the enemy leaves through $B251's `CMP #$F4` and the
  // index cannot climb. A zero anywhere in here would mean "fly LEFT" and the
  // enemy could turn round and read further.
  // RED WHEN: nothing in src/ -- this is a fact about the cartridge, and it is
  // here so that a future wave that widens the export has to confront it.
  assert.deepEqual([0xB434, 0xB435, 0xB436].map(rb), [0xBD, 0x0C, 0x03],
    '$B434 is st_B434\'s own LDA $030C,X opcode');
  assert.deepEqual([0xB461, 0xB462, 0xB463].map(rb), [0xBD, 0x4C, 0x04],
    '$B461 is the orphaned routine\'s LDA $044C,X');
  for (const a of [0xB434, 0xB435, 0xB436, 0xB461, 0xB462, 0xB463]) {
    assert.notEqual(rb(a), 0, `$${a.toString(16).toUpperCase()} must be non-zero`);
  }
});

test('$B415: the export covers the read, and the port throws past the bound', () => {
  // The fix, stated as the two numbers it is: seven entries exported, a throw
  // at seven. W30 exported five and let assets.js say "$B434 is not in any
  // exported range" -- a crash report that names the wrong file for a read the
  // ROM makes on purpose.
  // RED WHEN: either range goes back to five bytes.
  const rom = res.enemyTables;
  const blk = (n) => rom.blocks.find((b) => b.name === n);
  assert.equal(blk('phaseB42F').bytes.length, 8, 'phaseB42F: 7 entries + 1 anchor byte');
  assert.equal(blk('phaseB45C').bytes.length, 8, 'phaseB45C: 7 entries + 1 anchor byte');
  for (let y = 0; y <= 6; y++) {
    assert.equal(rom.read(0xB42F + y), rb(0xB42F + y), `$B42F+${y}`);
    assert.equal(rom.read(0xB45C + y), rb(0xB45C + y), `$B45C+${y}`);
  }
});

test('$B402 END TO END: stage 3 survives its own chunk 0, and READS $B434', () => {
  // THE CHECK THAT WOULD HAVE CAUGHT THE SHIPPED BUG. 400 passive frames from
  // stage 3's chunk 0 -- no forced status, no shield, no input -- which is
  // exactly the run that threw at frame 314 before this wave.
  //
  // AND IT ASSERTS THE READ HAPPENED. A fix that quietly clamped $04AC at 4,
  // or that stopped the enemy before the schedule ran out, would also produce
  // 400 clean frames; what it would NOT produce is $046C holding $BD, which is
  // the byte at $B434 and can come from nowhere else on this path.
  // RED WHEN: arcTurn's bound goes back to 5; the schedule is truncated; the
  // arc length or the off-screen box changes so the enemy leaves sooner.
  const s = seedChunk(2, 0);
  let sawOverrun = 0, maxCounter = 0;
  for (let f = 0; f < 400; f++) {
    s.cam.lo = u8(s.cam.lo + 2);
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    nmi(s, 0x00, res);                       // no buttons at all
    for (let k = 0; k < 10; k++) {
      const i = k + ENEMY_BASE;
      const t = s.obj.type[i] & 0x7F;
      if (t !== 0x0D && t !== 0x0E) continue;
      if (s.obj.s04A0[i] > maxCounter) maxCounter = s.obj.s04A0[i];
      if (s.obj.s04A0[i] >= 5 && s.obj.s0460[i] === rb(0xB42F + s.obj.s04A0[i])) {
        sawOverrun += 1;
      }
    }
  }
  assert.equal(maxCounter, 5, 'the arc counter reaches 5 -- past the five-entry '
    + 'schedule -- and the LISTING bound is 6, so the port is inside it');
  assert.ok(sawOverrun > 0, '$046C,X must hold the byte at $B434 ($BD) on at '
    + 'least one frame: that is the read, not an avoidance of it');
});

test('$B402: the arc is 34 frames and 66 px, which is why the net is one left', () => {
  // The arithmetic the bound is built on, measured through the real handler
  // rather than asserted in a comment. $B212 seeds yvel 2 and accel $20;
  // $B120 subtracts $20/256 a frame, so an integer step is 8 frames and the
  // flip at -3 ($B422 CMP #$FE) is 1 + 4*8 = 33 moving frames. $B1BC re-seeds
  // xvel to $FE every arc, so 33 moves is 66 px.
  // RED WHEN: the seed value, the accel, the flip threshold or the xvel move.
  const s = seedChunk(2, 0);
  const marks = [];       // [frame, x] at each arc boundary of slot 9
  let prev = -1;
  for (let f = 0; f < 400; f++) {
    s.cam.lo = u8(s.cam.lo + 2);
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    nmi(s, 0x00, res);
    const i = 9 + ENEMY_BASE;
    if ((s.obj.type[i] & 0x7F) !== 0x0D) { prev = -1; continue; }
    const c = s.obj.s04A0[i];
    if (c !== prev) { marks.push([f, c, s.obj.x[i]]); prev = c; }
  }
  assert.ok(marks.length >= 4, `arc boundaries seen: ${marks.length}`);
  for (let n = 1; n < marks.length; n++) {
    assert.equal(marks[n][0] - marks[n - 1][0], 34,
      `arc ${marks[n - 1][1]} lasted ${marks[n][0] - marks[n - 1][0]} frames`);
    const dx = ((marks[n][2] - marks[n - 1][2]) << 24) >> 24;
    assert.equal(Math.abs(dx), 66, `arc ${marks[n - 1][1]} moved ${dx} px`);
  }
  // three left then two right: the sign flips exactly once, after entry 2.
  const signs = [];
  for (let n = 1; n < marks.length; n++) {
    signs.push(Math.sign(((marks[n][2] - marks[n - 1][2]) << 24) >> 24));
  }
  assert.deepEqual(signs.slice(0, 5), [-1, -1, -1, 1, 1],
    'LEFT LEFT LEFT RIGHT RIGHT -- the net is ONE arc left, so the enemy is '
    + 'still on screen when the schedule ends. $B200 is four left and one '
    + 'right, which is why $B1C5 stops at 4 on the cartridge.');
});
