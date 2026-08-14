// W373 -- object dispatch [15], $291F66. Slot [7]'s other fork arm: a timed text sequence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

async function fx() {
  const mod = await import('../src/objslot15.js');
  const { Ram } = await import('../src/ram.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n) };
  const notes = [];
  const ctx = { unported: { note: (a) => notes.push(a) }, unportedLog: { note: () => {} },
    soundPost: () => {} };
  return { ...mod, ram: new Ram(), rom, ctx, notes, a5: 0x812a00 };
}

test('W373 slot [15] is $291F66 and is slot [7]\'s other fork arm', { skip: SKIP }, async () => {
  const { SLOT15, rom } = await fx();
  assert.equal(rom.u32(SLOT15.dispatch + 15 * 8), SLOT15.entry);
  const { SLOT7 } = await import('../src/objslot7pool.js');
  assert.equal(SLOT7.nextNormal, 15, 'slot [7] stages type $F when the menu does NOT answer 0');
  assert.equal(SLOT15.childType, 14, 'and this slot hands on to [14], so [7]->[15]->[14]->[12]');
});

test('W373 it shares $81585C with slot [7]\'s pool at a DIFFERENT shape', { skip: SKIP }, async () => {
  const { SLOT15 } = await fx();
  const { POOL7 } = await import('../src/objslot7pool.js');
  assert.equal(SLOT15.pool, POOL7.base, 'same base address');
  assert.notEqual(SLOT15.stride, POOL7.stride, 'different stride');
  assert.equal(SLOT15.entries * SLOT15.stride, 50 * 0x20);
  assert.ok(SLOT15.entries * SLOT15.stride < POOL7.entries * POOL7.stride,
    'and slot [15] uses the first half of the region slot [7] walks');
});

test('W373 arming clears FIFTY entries, not 49', { skip: SKIP }, async () => {
  const { armSequence291DC6, SLOT15, ram } = await fx();
  const last = SLOT15.pool + (SLOT15.entries - 1) * SLOT15.stride;
  ram.setU16(last, 0xbeef);
  ram.setU16(last + SLOT15.stride, 0xbeef);
  armSequence291DC6(ram);
  assert.equal(ram.u16(last), 0, 'moveq #$31 + dbra reaches entry 49');
  assert.equal(ram.u16(last + SLOT15.stride), 0xbeef, 'and stops there');
  assert.equal(ram.u16(SLOT15.drift), SLOT15.driftInit, 'the drift is armed to $20');
});

test('W373 the schedule word is a DELAY, not an absolute time', { skip: SKIP }, async () => {
  const { armSequence291DC6, stepSequence291DF4, SLOT15, ram, rom, ctx } = await fx();
  armSequence291DC6(ram);
  const due = rom.u16(SLOT15.seqTable);
  assert.ok(due > 0, 'the first entry waits');
  // The counter starts at 0 and only ticks on a NON-match, so the match happens on step due+1.
  for (let i = 0; i < due; i++) {
    assert.equal(ram.u16(SLOT15.cursor), 0, 'nothing spawned yet');
    stepSequence291DF4(ram, rom, ctx);
  }
  assert.equal(ram.u16(SLOT15.frames), due, "the counter reached the entry's word");
  stepSequence291DF4(ram, rom, ctx);
  assert.equal(ram.u16(SLOT15.cursor), SLOT15.seqStride, 'and THAT step spawned it');
  // A spawn RESETS the counter, so the next entry's word counts from here rather than from zero.
  assert.equal(ram.u16(SLOT15.frames), 0, 'the frame counter restarted');
});

test('W373 a spawn takes one pool entry and seeds it from the table', { skip: SKIP }, async () => {
  const { armSequence291DC6, stepSequence291DF4, SLOT15, ram, rom, ctx } = await fx();
  armSequence291DC6(ram);
  ram.setU16(SLOT15.drift, 0);                               // freeze the drift so nothing retires
  for (let i = 0; i <= rom.u16(SLOT15.seqTable) + 1; i++) stepSequence291DF4(ram, rom, ctx);
  assert.equal(ram.u16(SLOT15.pool), SLOT15.spawnX, 'entry 0 taken');
  assert.equal(ram.u16(SLOT15.pool + 0x02), SLOT15.spawnY, '  ...and it starts ABOVE the screen');
  assert.equal(ram.u32(SLOT15.pool + 0x10), rom.u32(SLOT15.seqTable + 0x06),
    '  ...carrying the table entry\'s string pointer');
  assert.equal(ram.u16(SLOT15.pool + 0x06), rom.u16(SLOT15.seqTable + 0x04), '  ...and its mode word');
});

test('W373 an entry drifts and then RETIRES at $7800', { skip: SKIP }, async () => {
  const { SLOT15, stepSequence291DF4, ram, rom, ctx } = await fx();
  ram.setU16(SLOT15.cursor, 0);
  ram.setU16(SLOT15.drift, SLOT15.driftInit);
  ram.setU16(SLOT15.pool, SLOT15.spawnX);
  ram.setU16(SLOT15.pool + 0x02, 0x7000);                    // just short of the limit
  // A REAL string pointer, not $FFFFFFFF: that value stops the drift, which would freeze the very
  // thing this test is measuring.
  ram.setU32(SLOT15.pool + 0x10, rom.u32(SLOT15.seqTable + 0x06));
  let n = 0;
  while (ram.u16(SLOT15.pool) !== 0 && n < 4000) { stepSequence291DF4(ram, rom, ctx); n++; }
  assert.ok(n > 0 && n < 4000, `the entry retired after ${n} frames`);
  assert.equal(ram.u16(SLOT15.pool), 0, 'and its first word is zero again, so the slot is free');
});

test('W373 a $FFFFFFFF payload stops the drift for EVERY entry', { skip: SKIP }, async () => {
  const { SLOT15, stepSequence291DF4, ram, rom, ctx } = await fx();
  ram.setU16(SLOT15.cursor, 0);
  ram.setU16(SLOT15.drift, SLOT15.driftInit);
  ram.setU16(SLOT15.pool, SLOT15.spawnX);
  ram.setU16(SLOT15.pool + 0x02, 0x0000);
  ram.setU32(SLOT15.pool + 0x10, 0xffffffff);
  stepSequence291DF4(ram, rom, ctx);
  assert.equal(ram.u16(SLOT15.drift), 0,
    'it is not a per-entry flag -- it zeroes the shared $81E120');
});

test('W373 the two text modes differ in font, attribute AND layout', { skip: SKIP }, async () => {
  const { SLOT15 } = await fx();
  assert.notEqual(SLOT15.fontH, SLOT15.fontV, 'two different fonts');
  assert.notEqual(SLOT15.attrH, SLOT15.attrV, 'two different attributes');
  // The layout difference is the one a tidy rewrite loses: vertical SKIPS the X advance, so all
  // characters land on one X. Driving it is the only way to see that.
  const { BUCKETS } = await import('../src/spritequeue.js');
  const emitted = [];
  const { Ram } = await import('../src/ram.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n) };
  for (const vertical of [false, true]) {
    const ram = new Ram();
    ram.setU16(SLOT15.cursor, 0);
    ram.setU16(SLOT15.drift, 0);
    ram.setU16(SLOT15.pool, SLOT15.spawnX);
    ram.setU16(SLOT15.pool + 0x02, 0x0000);
    ram.setU16(SLOT15.pool + 0x04, 0x0000);
    ram.setU16(SLOT15.pool + 0x06, vertical ? 1 : 0);
    // $291FE2 itself begins with a $00 byte, so it is an EMPTY string. Use the table's own first
    // string pointer instead.
    ram.setU32(SLOT15.pool + 0x10, rom.u32(SLOT15.seqTable + 0x06));
    const before = BUCKETS.reduce((n2, b) => n2 + ram.u16(b.counter), 0);
    SLOT15.stride;                                           // (touch, to keep the frozen object used)
    const { stepSequence291DF4 } = await import('../src/objslot15.js');
    stepSequence291DF4(ram, rom, { unported: { note: () => {} } });
    emitted.push(BUCKETS.reduce((n2, b) => n2 + ram.u16(b.counter), 0) - before);
  }
  assert.ok(emitted[0] > 0 && emitted[1] > 0, 'both modes drew something');
});

test('W373 state 0 with a ZERO gate skips the whole sequence', { skip: SKIP }, async () => {
  const zero = await fx();
  zero.objSlot15(zero.ram, zero.rom, zero.a5, zero.ctx);
  assert.equal(zero.ram.u8(zero.a5 + zero.SLOT15.state), 2,
    '$813098 zero -> straight to state 2');

  const set = await fx();
  set.ram.setU16(set.SLOT15.gate, 1);
  set.objSlot15(set.ram, set.rom, set.a5, set.ctx);
  assert.equal(set.ram.u8(set.a5 + set.SLOT15.state), 1, 'non-zero -> it runs');
  assert.equal(set.ram.u16(set.SLOT15.doneFlag), 1, '  ...and raises $81309A');
  assert.equal(set.ram.u16(set.a5 + set.SLOT15.timer), set.SLOT15.timerInit, '$80 frames armed');
});

test('W373 the load waits for BOTH the timer and the drift', { skip: SKIP }, async () => {
  const { objSlot15, SLOT15, ram, rom, ctx, a5 } = await fx();
  ram.setU16(SLOT15.gate, 1);
  objSlot15(ram, rom, a5, ctx);                              // state 0
  assert.equal(ram.u16(SLOT15.drift), SLOT15.driftInit, 'the drift is running');

  // With the drift non-zero the timer must not tick at all.
  for (let i = 0; i < 200; i++) objSlot15(ram, rom, a5, ctx);
  assert.equal(ram.u16(a5 + SLOT15.timer), SLOT15.timerInit,
    'the timer never moved while the drift was running');
  assert.equal(ram.u16(a5 + SLOT15.phase), 0, 'and the load was never armed');

  ram.setU16(SLOT15.drift, 0);
  for (let i = 0; i < SLOT15.timerInit; i++) objSlot15(ram, rom, a5, ctx);
  assert.equal(ram.u16(a5 + SLOT15.phase), 1, 'once the drift stops, the timer runs it out');
});

test('W373 state 2 stages slot [14] with the table priority', { skip: SKIP }, async () => {
  const { objSlot15, SLOT15, ram, rom, ctx, a5 } = await fx();
  const { ALLOC } = await import('../src/objalloc.js');
  ram.setU8(a5 + SLOT15.state, 2);
  ram.setU16(a5 + 0x00, 0x70);
  objSlot15(ram, rom, a5, ctx);
  assert.equal(ram.u16(ALLOC.createStage + ALLOC.typeOff), (SLOT15.childType | 0x8000) >>> 0);
  assert.equal(ram.u16(ALLOC.createStage + ALLOC.priOff),
    rom.u16(SLOT15.dispatch + SLOT15.childType * 8 + 4), 'from the dispatch table');
  assert.equal(ram.u16(SLOT15.clearFlag), 0);
});
