// W373 -- $2911B0, the two-option countdown menu, DRIVEN. Every one of the five defects that got
// past static review last session was caught by executing the code, so this file runs the routine
// rather than asserting about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

async function fixture() {
  const { menu2911B0, MENU2911B0 } = await import('../src/objslot7pool.js');
  const { Ram } = await import('../src/ram.js');
  const IMG = readFileSync(ROM);
  const rom = {
    u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n),
  };
  const ram = new Ram();
  const sounds = [];
  const ctx = {
    soundPost: (a) => sounds.push(a),
    unported: { note: () => {} }, unportedLog: { note: () => {} },
  };
  // $23D186 is two instructions -- `move.w $803972,D0 / rts` -- so the fixture drives the pad by
  // writing that edge word, not by stubbing the reader out.
  const P1EDGE = 0x803972;
  return { menu2911B0, MENU2911B0, ram, rom, ctx, sounds, P1EDGE };
}

/** State 1 runs the list's ONE script to completion before it reaches the terminator, so reaching
 *  the menu proper takes as many frames as that script takes. Pump, with a bound. */
function pumpTo(fn, ram, rom, a5, a6, ctx, state, max = 4000) {
  for (let i = 0; i < max; i++) {
    if (ram.u16(a6 + 0x06) === state) return i;
    fn(ram, rom, a5, a6, ctx);
  }
  throw new Error(`never reached state ${state} in ${max} frames`);
}

test('W373 $2911B0 state 0 arms the counters and defaults the choice to 1', { skip: SKIP }, async () => {
  const { menu2911B0, MENU2911B0, ram, rom, ctx } = await fixture();
  const a5 = 0x812000, a6 = 0x812100;
  menu2911B0(ram, rom, a5, a6, ctx);
  assert.equal(ram.u16(a6 + 0x06), 1, 'state 0 arms and hands straight to the intro script');
  assert.equal(ram.u16(MENU2911B0.timer), MENU2911B0.timeout, 'the countdown is armed to 600');
  assert.equal(ram.u16(MENU2911B0.sel), 1, 'the DEFAULT choice is 1, not 0');
  assert.equal(ram.u16(MENU2911B0.flag), 1);
});

test('W373 the state-1 list is one entry and its terminator picks the reader', { skip: SKIP }, async () => {
  const { menu2911B0, MENU2911B0, ram, rom, ctx } = await fixture();
  const a5 = 0x812000, a6 = 0x812100;
  // P1 active: the record's sign bit is set, so $23D186 is chosen.
  ram.setU32(0x8103e6, 0x80000000);
  pumpTo(menu2911B0, ram, rom, a5, a6, ctx, 2);
  assert.equal(ram.u32(a6 + 0x18), 0x23d186, 'P1 active -> side 0 reader');

  const b = await fixture();
  b.ram.setU32(0x8103e6, 0x00000000);
  pumpTo(b.menu2911B0, b.ram, b.rom, a5, a6, b.ctx, 2);
  assert.equal(b.ram.u32(a6 + 0x18), 0x23d18e, 'P1 inactive -> side 1 reader');
});

test('W373 the countdown times out into the SAME exit the button takes', { skip: SKIP }, async () => {
  const { menu2911B0, MENU2911B0, ram, rom, ctx, sounds } = await fixture();
  const a5 = 0x812000, a6 = 0x812100;
  ram.setU32(0x8103e6, 0x80000000);
  pumpTo(menu2911B0, ram, rom, a5, a6, ctx, 2);
  sounds.length = 0;

  // 600 frames with no input at all. The clock alone must confirm.
  for (let i = 0; i < MENU2911B0.timeout; i++) {
    if (ram.u16(a6 + 0x06) !== 2) break;
    menu2911B0(ram, rom, a5, a6, ctx);
  }
  assert.equal(ram.u16(MENU2911B0.timer), 0, 'the counter ran all the way out');
  assert.equal(ram.u16(a6 + 0x06), 3, 'and the timeout advanced the state exactly as a button would');
  assert.ok(sounds.includes(0x28c6e0), 'the CONFIRM sound played on the timeout, not the cursor sound');
  assert.equal(ram.u16(MENU2911B0.sel), 1, 'and it confirmed the default choice, untouched');
});

test('W373 the digit index never leaves the ten-entry table', { skip: SKIP }, async () => {
  const { menu2911B0, MENU2911B0, ram, rom, ctx } = await fixture();
  const a5 = 0x812000, a6 = 0x812100;
  ram.setU32(0x8103e6, 0x80000000);
  pumpTo(menu2911B0, ram, rom, a5, a6, ctx, 2);
  // The largest index the counter can produce, over every frame it is alive. If the decrement ran
  // AFTER the draw this would reach 10 and read the list table at $291396 as sprite art.
  let worst = -1;
  for (let i = 0; i < MENU2911B0.timeout + 4; i++) {
    if (ram.u16(a6 + 0x06) !== 2) break;
    menu2911B0(ram, rom, a5, a6, ctx);
    worst = Math.max(worst, Math.floor(ram.u16(MENU2911B0.timer) / MENU2911B0.seconds));
  }
  assert.equal(worst, 9, 'the largest whole-second index is 9, so ten entries is the exact bound');
});

test('W373 state 3 sets the OUTER dispatch state, on A5 and not A6', { skip: SKIP }, async () => {
  const { menu2911B0, MENU2911B0, ram, rom, ctx } = await fixture();
  const a5 = 0x812000, a6 = 0x812100;
  ram.setU32(0x8103e6, 0x80000000);
  pumpTo(menu2911B0, ram, rom, a5, a6, ctx, 2);
  pumpTo(menu2911B0, ram, rom, a5, a6, ctx, 3, MENU2911B0.timeout + 4);
  const before = ram.u8(a5 + 0x02);
  // Point the handle at an already-finished chain so $24681A reports zero.
  ram.setU32(a6 + 0x14, 0x813000);
  ram.setU32(0x813000 + 0x2c, 0);
  menu2911B0(ram, rom, a5, a6, ctx);
  assert.equal(ram.u8(a5 + 0x02), 2, 'the outer slot advanced');
  assert.notEqual(before, 2, '  ...and it was not already 2, so the store is what moved it');
  assert.notEqual(ram.u8(a6 + 0x02), 2, 'and NOTHING was written at ($2,A6) -- the store is on A5');
});

test('W373 states 0 and 1 draw nothing at all', { skip: SKIP }, async () => {
  const { menu2911B0, ram, rom, ctx } = await fixture();
  const { BUCKETS } = await import('../src/spritequeue.js');
  const a5 = 0x812000, a6 = 0x812100;
  // BUCKETS[i].counter is the counter's ADDRESS in RAM, not a running count. Reading it is safe;
  // WRITING it rewrites the bucket descriptor and breaks resolveEmitStub for the whole process,
  // which is exactly how this test first went wrong.
  const total = () => BUCKETS.reduce((n, b) => n + ram.u16(b.counter), 0);

  const t0 = total();
  menu2911B0(ram, rom, a5, a6, ctx);                    // state 0 -> 1
  assert.equal(ram.u16(a6 + 0x06), 1);
  assert.equal(total(), t0, 'state 0 enqueued no sprites');

  menu2911B0(ram, rom, a5, a6, ctx);                    // a frame of the intro script
  assert.equal(ram.u16(a6 + 0x06), 1, 'still in the intro');
  assert.equal(total(), t0, 'and state 1 enqueued none either -- the blt gate is at #$2');
});

test('W373 LEFT and RIGHT both TOGGLE, and pressing both is a no-op', { skip: SKIP }, async () => {
  const { menu2911B0, MENU2911B0, ram, rom, ctx, sounds, P1EDGE } = await fixture();
  const a5 = 0x812000, a6 = 0x812100;
  ram.setU32(0x8103e6, 0x80000000);
  pumpTo(menu2911B0, ram, rom, a5, a6, ctx, 2);
  assert.equal(ram.u16(MENU2911B0.sel), 1);

  // LEFT alone: 1 -> 0.
  ram.setU16(P1EDGE, 0x04);
  menu2911B0(ram, rom, a5, a6, ctx);
  assert.equal(ram.u16(MENU2911B0.sel), 0, 'LEFT toggled 1 -> 0');

  // LEFT AGAIN: 0 -> 1. It toggles; it does not "select left".
  menu2911B0(ram, rom, a5, a6, ctx);
  assert.equal(ram.u16(MENU2911B0.sel), 1, 'LEFT again toggled 0 -> 1, it does not stick to 0');

  // RIGHT alone toggles the same way.
  ram.setU16(P1EDGE, 0x08);
  menu2911B0(ram, rom, a5, a6, ctx);
  assert.equal(ram.u16(MENU2911B0.sel), 0, 'RIGHT toggles too');

  // BOTH on one frame: two addq #1 then the #$1 mask, so it lands back where it started -- and it
  // plays the cursor sound TWICE while doing it.
  sounds.length = 0;
  ram.setU16(P1EDGE, 0x0c);
  menu2911B0(ram, rom, a5, a6, ctx);
  assert.equal(ram.u16(MENU2911B0.sel), 0, 'both directions on one frame cancel out');
  assert.deepEqual(sounds, [0x28c6fa, 0x28c6fa], '  ...but the cursor sound still played twice');
});

test('W373 a button confirms early and stops the clock', { skip: SKIP }, async () => {
  const { menu2911B0, MENU2911B0, ram, rom, ctx, sounds, P1EDGE } = await fixture();
  const a5 = 0x812000, a6 = 0x812100;
  ram.setU32(0x8103e6, 0x80000000);
  pumpTo(menu2911B0, ram, rom, a5, a6, ctx, 2);
  // 101, not 100: $291212 sets state 2 and then FALLS THROUGH to $291244 in the same frame, so the
  // frame that ends the intro is also the menu's first frame and ticks the clock once.
  assert.equal(ram.u16(MENU2911B0.timer), MENU2911B0.timeout - 1,
    'the frame that left state 1 already ran a frame of state 2');
  for (let i = 0; i < 100; i++) menu2911B0(ram, rom, a5, a6, ctx);
  const left = ram.u16(MENU2911B0.timer);
  assert.equal(left, MENU2911B0.timeout - 101, 'the clock ran while nothing was pressed');

  sounds.length = 0;
  ram.setU16(P1EDGE, 0x10);                       // any of $70 -- the three buttons
  menu2911B0(ram, rom, a5, a6, ctx);
  assert.equal(ram.u16(a6 + 0x06), 3, 'the button advanced the state');
  assert.deepEqual(sounds, [0x28c6e0], 'the confirm sound, once');
  assert.equal(ram.u16(MENU2911B0.timer), left,
    'and the clock did NOT tick on the confirming frame -- the decrement is the ELSE arm');
});
