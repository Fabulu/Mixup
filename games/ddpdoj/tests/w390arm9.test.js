// ===============================================================================================
// W390 -- ARM 9'S SCREEN, THE LAST TWO `queueKill` DEFECTS, AND TWO STALE NOTES.
// ===============================================================================================
//
// UNIT A. Slot [8] arm 9's screen, `$25C3E8` (init) and `$25C424` (body). SECTIONS 1-3.
//
// **THE BRIEF SAID "structurally arm 12 on a different triple of words" AND THAT IS TRUE OF THE
// STATE MACHINE AND FALSE OF THE DRAW.** Confirmed identical: the four-word clear, the `#$F0`
// timer, the `$24641A` init chain, the `$25BB6C` TX block, the `$246710` state-1 chain, the two
// exits, and the absence of `$28CAE2`. NOT identical: `$25C4A8 bsr.w` lands on `$25C4D0`, which
// is TWO register-convention enqueues (`jsr $23DECE` twice, not arm 12's single `jmp`), each
// preceded by an `addi.l` arm 12's `$25C39C` does not have. SECTION 2 reads all of it off the
// image; a port that copied `$25C39C`'s shape would emit half the sprites.
//
// And the brief asked which chain the exit waits on, because last wave the same question was got
// wrong. **It is the SECOND chain, the `$246710` one state 1 loads** -- `$25C474` overwrites
// `$812E7E` before `$25C482` ever compares, so state 2's `$24681A` cannot be looking at the init
// handle. Measured, not asserted: on a real cold boot the init chain drains at +911 and the
// screen keeps running for another 271 frames. SECTION 3.
//
// UNIT B. `objslot17.js:194` (`$25CEB0`) and `objslot9.js:512` (`$25CAC2`) handed `queueKill` the
// TYPE WORD at `($0,A5)` where `$241292 lea ($4C,A5),A0` takes the ID LONG. These are the last two
// of the six W389 found; SECTION 4 drives both and ablates both. **The census is closed at six:**
// SECTION 4 scans the whole image for every `$241292` reference and accounts for each one.
//
// UNIT C. Two pieces of stale text left behind on purpose (trap 14). SECTION 5.
//
// SECTION 6 is the three ROM windows.
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Game } from '../src/main.js';
import { ALLOC, killById, queueKill, commitKills } from '../src/objalloc.js';
import {
  ARM9SCREEN, SCREEN12, SCREEN8, screen9Init25C3E8, screen9Body25C424,
} from '../src/objslot8.js';
import { objSlot17, SCREEN17 } from '../src/objslot17.js';
import { objSlot9, SCREEN9 } from '../src/objslot9.js';
import { BUCKETS, ENQUEUE_MASK, NO_ZOOM_OR, RECORD_BYTES } from '../src/spritequeue.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false : 'no rip';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const TABLES = here('../rip/port/player.tables.json');
const SKIP_T = existsSync(TABLES) ? SKIP : 'generated ROM tables absent; skip, not pass';
const tablesJson = existsSync(TABLES) ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

/** The raw image as a `rom` face, so these tests drive the real routines rather than a windowed
 *  subset of them. Same helper `w389chainloader.test.js` uses. */
const rawRom = () => ({
  u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a),
  i16: (a) => IMG.readInt16BE(a), u8: (a) => IMG[a],
  bytes: (a, n) => IMG.subarray(a, a + n),
});

const noteCtx = () => {
  const notes = [];
  return { notes,
    ctx: {
      unported: { note: (a, t) => notes.push(`${a}:${t}`) },
      unportedLog: { note: (a, t) => notes.push(`${a}:${t}`) },
      soundPost: () => {},
    } };
};

/** Bucket 0's records as words, then the flush the real main loop does once a frame. */
const EMIT = BUCKETS[0];
function emitted(ram) {
  const n = ram.u16(EMIT.counter) / RECORD_BYTES;
  const out = [];
  for (let i = 0; i < n; i++) {
    const at = EMIT.buffer + i * RECORD_BYTES;
    out.push([0, 2, 4, 6, 8, 10].map((o) => ram.u16(at + o)));
  }
  return out;
}
const flush = (ram) => { for (const b of BUCKETS) ram.setU16(b.counter, 0); };

/** What `$23EFD6 asr.l #6 / $23D77E andi.l / $23D784 ori.l` makes of a D1. */
const packD1 = (d1) => (((((d1 | 0) >> 6) & ENQUEUE_MASK) | NO_ZOOM_OR) >>> 0);

// ===============================================================================================
// SECTION 1 -- THE INIT, `$25C3E8..$25C422`, AND THE TRIPLE IT REALLY USES.
// ===============================================================================================

test('W390 SECTION 1: arm 9\'s init is $25C3E8..$25C423 with the `rts` AT $25C422', { skip: SKIP },
  () => {
    assert.equal(l(0x25c3e8), 0x48e7fffe, '$25C3E8 movem.l D0-D7/A0-A6,-(A7)');
    assert.equal(w(0x25c3ec), 0x41f9, '$25C3EC lea abs.l,A0');
    assert.equal(l(0x25c3ee), ARM9SCREEN.state, '  ...$812E7A -- NOT arm 12\'s $812E72');
    assert.notEqual(ARM9SCREEN.state, SCREEN12.state, 'and the two arms really are different words');
    assert.equal(ARM9SCREEN.state - SCREEN12.state, 8,
      'the two blocks are 8 bytes apart and ABUT: $812E72..$79 and $812E7A..$81');

    assert.equal(w(0x25c3f2), 0x303c, '$25C3F2 move.w #imm,D0');
    assert.equal(w(0x25c3f4), 3, '  ...#$3 -- and TRAP 2: `dbra` runs FOUR times, four words');
    assert.equal(w(0x25c3f6), 0x7200, '$25C3F6 moveq #0,D1');
    assert.equal(w(0x25c3f8), 0x30c1, '$25C3F8 move.w D1,(A0)+');
    assert.equal(w(0x25c3fa), 0x51c8, '$25C3FA dbra D0');
    assert.equal(ARM9SCREEN.clearWords, 4, 'so the port clears FOUR words');
    // And the FOURTH word matters: the handle is a LONG at $812E7E, so words 3 and 4 of the
    // clear are its two halves. Three words would leave the high half of a stale handle behind.
    assert.equal(ARM9SCREEN.handle, ARM9SCREEN.state + 4, 'the handle long starts at word 3...');
    assert.equal(ARM9SCREEN.state + ARM9SCREEN.clearWords * 2, ARM9SCREEN.handle + 4,
      '...and the clear ends exactly at its far end');

    assert.equal(w(0x25c3fe), 0x33fc, '$25C3FE move.w #imm,abs.l');
    assert.equal(w(0x25c400), ARM9SCREEN.timerInit, '  ...#$F0 -- the same $F0 arm 12 uses');
    assert.equal(l(0x25c402), ARM9SCREEN.timer, '  ...into $812E7C');

    // TRAP 4: `lea (d16,PC)` resolves from the EXTENSION WORD's address.
    assert.equal(w(0x25c406), 0x41fa, '$25C406 lea (d16,PC),A0');
    assert.equal(w(0x25c408), 0x010a, '  ...displacement $010A');
    assert.equal(0x25c408 + w(0x25c408), ARM9SCREEN.initScript,
      '  ...$25C408 + $10A = $25C512, the INIT script. From $25C406 it would be $25C510');
    assert.equal(w(0x25c40a), 0x4e71, '$25C40A nop -- arm 12 has the same nop at $25C2D0');
    assert.equal(l(0x25c40c), 0x4eb90024, '$25C40C jsr abs.l...');
    assert.equal(w(0x25c410), 0x641a, '  ...$24641A -- `loadAnimObjects246410` with mode 0');
    assert.equal(l(0x25c414), ARM9SCREEN.handle, '$25C412 move.l D0,$812E7E');
    assert.equal(l(0x25c418), 0x4eb90025, '$25C418 jsr abs.l...');
    assert.equal(w(0x25c41c), 0xbb6c, '  ...$25BB6C -- counted, the same $900000 TX block arm 12 '
      + 'calls from $25C2DE');
    assert.equal(ARM9SCREEN.txBlock, SCREEN12.txBlock, 'literally the same routine');

    // TRAP 5: the `rts` sits AT $25C422, so the routine is $25C3E8..$25C423 -- 60 bytes.
    assert.equal(l(0x25c41e), 0x4cdf7fff, '$25C41E movem.l (A7)+,D0-D7/A0-A6');
    assert.equal(w(0x25c422), 0x4e75, '$25C422 rts -- AT the last address, not after it');
    assert.equal(ARM9SCREEN.initEnd - ARM9SCREEN.init, 60, 'so the init is 60 bytes, arm 12\'s size');
    assert.equal(ARM9SCREEN.initEnd, ARM9SCREEN.body, 'and the body starts where it ends');
  });

test('W390 SECTION 1: the init writes the triple and NOTHING of arm 12\'s', { skip: SKIP }, () => {
  const ram = new Ram();
  const rom = rawRom();
  const { ctx, notes } = noteCtx();
  // POSITIVE CONTROL: put junk in both triples first, so "cleared" is a measurement.
  // NOTE THE ADJACENCY: arm 12's four words are $812E72..$812E79 and arm 9's start at $812E7A,
  // so "one word past arm 12's block" IS arm 9's state. Only arm 12's own four are checked.
  for (let i = 0; i < 4; i++) ram.setU16(SCREEN12.state + i * 2, 0xbeef);
  for (let i = 0; i < 5; i++) ram.setU16(ARM9SCREEN.state + i * 2, 0xbeef);
  screen9Init25C3E8(ram, rom, ctx);
  assert.equal(ram.u16(ARM9SCREEN.state), 0, '$812E7A cleared');
  assert.equal(ram.u16(ARM9SCREEN.timer), ARM9SCREEN.timerInit, '$812E7C is $F0, not 0');
  assert.notEqual(ram.u32(ARM9SCREEN.handle), 0, '$812E7E holds a real chain handle');
  assert.equal(ram.u16(ARM9SCREEN.state + 8), 0xbeef,
    '$812E82 is UNTOUCHED -- the clear is four words, not five');
  for (let i = 0; i < 4; i++) {
    assert.equal(ram.u16(SCREEN12.state + i * 2), 0xbeef,
      `$${(SCREEN12.state + i * 2).toString(16).toUpperCase()} -- arm 12's triple is untouched`);
  }
  assert.equal(SCREEN12.state + 8, ARM9SCREEN.state,
    'and the two blocks ABUT: $812E72+8 is $812E7A exactly');
  assert.equal(notes.filter((n) => n.startsWith(`${ARM9SCREEN.txBlock}:`)).length, 1,
    '$25BB6C is counted exactly once');
});

// ===============================================================================================
// SECTION 2 -- THE BODY, AND THE ONE PLACE THE BRIEF IS WRONG.
// ===============================================================================================

test('W390 SECTION 2: the exit waits on the SECOND chain, the `$246710` one', { skip: SKIP },
  () => {
    // STATE 0 waits on the INIT chain and FREES it.
    assert.equal(w(0x25c428), 0x0c79, '$25C428 cmpi.w #imm,abs.l');
    assert.equal(w(0x25c42a), 0, '  ...#$0');
    assert.equal(l(0x25c42c), ARM9SCREEN.state, '  ...against $812E7A');
    assert.equal(l(0x25c436), ARM9SCREEN.handle, '$25C434 move.l $812E7E,D0');
    assert.equal(l(0x25c43c), 0x0024681a, '$25C43A jsr $24681A -- the checker, on the INIT chain');
    assert.equal(l(0x25c446), 0x00246800, '$25C444 jsr $246800 -- and state 0 FREES it');
    assert.equal(w(0x25c44a), 0x33fc, '$25C44A move.w #imm,abs.l');
    assert.equal(w(0x25c44c), 1, '  ...#$1 -- the state');

    // **NO `$28CAE2`.** Arm 12 posts a cue on this exact edge, at $25C318. Bound in the CODE
    // (trap 8): the very next word after the state write's operand is state 1's `cmpi`.
    assert.equal(l(0x25c44e), ARM9SCREEN.state, '  ...into $812E7A, ending at $25C451');
    assert.equal(w(0x25c452), 0x0c79, '$25C452 is state 1\'s `cmpi.w` -- NOTHING sits between');
    assert.equal(w(0x25c318), 0x4eb9, 'POSITIVE CONTROL: arm 12 DOES have a jsr there...');
    assert.equal(l(0x25c31a), 0x0028cae2, '  ...$28CAE2, the cue arm 9 has no counterpart for');

    // STATE 1: the timer, then a SECOND script through a SECOND loader.
    assert.equal(w(0x25c45e), 0x5379, '$25C45E subq.w #1,abs.l');
    assert.equal(l(0x25c460), ARM9SCREEN.timer, '  ...$812E7C');
    assert.equal(w(0x25c468), 0x41fa, '$25C468 lea (d16,PC),A0');
    assert.equal(0x25c46a + w(0x25c46a), ARM9SCREEN.loadScript,
      '  ...$25C46A + $C6 = $25C530 -- NOT $25C512, a DIFFERENT script');
    assert.equal(l(0x25c46e), 0x4eb90024, '$25C46E jsr abs.l...');
    assert.equal(w(0x25c472), 0x6710, '  ...**$246710**, the OTHER loader');
    assert.equal(l(0x25c476), ARM9SCREEN.handle,
      '$25C474 move.l D0,$812E7E -- OVERWRITING the init handle, before state 2 ever compares');

    // STATE 2 waits on THAT one, and there is nowhere else for it to look.
    assert.equal(w(0x25c482), 0x0c79, '$25C482 cmpi.w #imm,abs.l');
    assert.equal(w(0x25c484), 2, '  ...#$2');
    assert.equal(l(0x25c490), ARM9SCREEN.handle, '$25C48E move.l $812E7E,D0 -- the ONLY handle');
    assert.equal(l(0x25c496), 0x0024681a, '$25C494 jsr $24681A');
    assert.equal(l(0x25c4a0), 0x00246800, '$25C49E jsr $246800');
    assert.equal(w(0x25c4a4), 0x6000, '$25C4A4 bra.w...');
    assert.equal(0x25c4a6 + w(0x25c4a6), 0x25c4b6, '  ...$25C4A6 + $10 = $25C4B6, the CLEAR exit');
  });

test('W390 SECTION 2: the two exits, and the DRAW that is NOT arm 12\'s', { skip: SKIP }, () => {
  // Carry SET at $25C4B0, carry CLEAR at $25C4BA -- the same pair arm 12 and arm 2 have.
  assert.equal(w(0x25c4a8), 0x6100, '$25C4A8 bsr.w -- the draw');
  assert.equal(0x25c4aa + w(0x25c4aa), ARM9SCREEN.draw, '  ...$25C4AA + $26 = $25C4D0');
  assert.equal(l(0x25c4ac), 0x4cdf7fff, '$25C4AC movem.l (A7)+');
  assert.equal(l(0x25c4b0), 0x007c0001, '$25C4B0 ori.w #$1,SR -- CARRY SET, still running');
  assert.equal(w(0x25c4b4), 0x4e75, '$25C4B4 rts');
  assert.equal(l(0x25c4b6), 0x4cdf7fff, '$25C4B6 movem.l (A7)+');
  assert.equal(w(0x25c4ba), 0x3000, '$25C4BA move.w D0,D0 -- CARRY CLEAR, finished');
  assert.equal(w(0x25c4bc), 0x4e75, '$25C4BC rts -- AT the last address (trap 5)');
  assert.equal(ARM9SCREEN.bodyEnd, 0x25c4be, 'so the body is $25C424..$25C4BD');

  // **THE DRAW IS A DIFFERENT SHAPE.** Two enqueues, `jsr` not `jmp`, and an `addi.l` each.
  const D = ARM9SCREEN.draws;
  assert.equal(D.length, 2, 'the port models TWO enqueues');
  assert.equal(w(0x25c4d0), 0x223c, '$25C4D0 move.l #imm,D1');
  assert.equal(l(0x25c4d2), D[0].d1, '  ...#$3C001C00');
  assert.equal(w(0x25c4d6), 0x0681, '$25C4D6 addi.l #imm,D1 -- arm 12 has NO addi at all');
  assert.equal(l(0x25c4d8), D[0].d1Add, '  ...#$F800F000');
  assert.equal(l(0x25c4de), D[0].d2, '$25C4DC move.l #$003366A8,D2');
  assert.equal(w(0x25c4e4), D[0].d3, '$25C4E2 move.w #$0880,D3');
  assert.equal(w(0x25c4e8), D[0].d4, '$25C4E6 move.w #$0,D4');
  assert.equal(l(0x25c4ea), 0x4eb90023, '$25C4EA jsr abs.l -- **jsr**, and arm 12\'s is `4EF9` jmp');
  assert.equal(w(0x25c4ee), 0xdece, '  ...$23DECE');
  assert.equal(l(0x25c3b0), 0x4ef90023, 'POSITIVE CONTROL: arm 12\'s $25C3B0 IS the `4EF9` tail');

  assert.equal(w(0x25c4f0), 0x223c, '$25C4F0 move.l #imm,D1 -- a SECOND sprite');
  assert.equal(l(0x25c4f2), D[1].d1, '  ...#$30001E00');
  assert.equal(l(0x25c4f8), D[1].d1Add, '$25C4F6 addi.l #$FC00F200,D1');
  assert.equal(l(0x25c4fe), D[1].d2, '$25C4FC move.l #$003368AC,D2');
  assert.equal(w(0x25c504), D[1].d3, '$25C502 move.w #$0470,D3');
  assert.equal(l(0x25c50a), 0x4eb90023, '$25C50A jsr abs.l...');
  assert.equal(w(0x25c50e), 0xdece, '  ...$23DECE, the SECOND call');
  assert.equal(w(0x25c510), 0x4e75, '$25C510 rts -- so the stub is $25C4D0..$25C511');
  // Nothing arm 12 has is reusable here: every immediate differs.
  assert.notEqual(D[0].d2, SCREEN12.drawD2, 'and not one immediate is shared with $25C39C');
  assert.notEqual(D[1].d2, SCREEN12.drawD2);
  assert.notEqual(D[0].d3, SCREEN12.drawD3);
});

test('W390 SECTION 2: the `addi.l` carry crosses bit 15 -- and `$23D77E` then MASKS IT OUT',
  { skip: SKIP }, () => {
    // The port does the add as the 68000 does it, a single 32-bit add. This test says exactly
    // what that is worth, rather than claiming a difference that is not there.
    const [a, b] = ARM9SCREEN.draws;
    const trueAdd = (x, y) => (x + y) >>> 0;
    const wordWise = (x, y) => (((((x >>> 16) + (y >>> 16)) & 0xffff) << 16)
      | (((x & 0xffff) + (y & 0xffff)) & 0xffff)) >>> 0;
    assert.equal(trueAdd(a.d1, a.d1Add), 0x34010c00, '$3C001C00 + $F800F000 = $34010C00');
    assert.equal(wordWise(a.d1, a.d1Add), 0x34000c00, '...word-wise it would be $34000C00');
    assert.notEqual(trueAdd(a.d1, a.d1Add), wordWise(a.d1, a.d1Add), 'so the carry is REAL');
    assert.equal(trueAdd(b.d1, b.d1Add), 0x2c011000, 'and the second one carries too');
    // BUT: `asr.l #6` puts pre-shift bit 16 at post-shift bit 10, and `$23D77E andi.l
    // #$07FF03FF` clears bits 10..15 of the low word. The carry is masked off before it can
    // reach the queue. Stated here so nobody "fixes" the fold later believing it matters.
    for (const [i, d] of [a, b].entries()) {
      assert.equal(packD1(trueAdd(d.d1, d.d1Add)), packD1(wordWise(d.d1, d.d1Add)),
        `draw ${i}: $23D77E's #$07FF03FF eats the carry, so the queued record is the same`);
    }
    assert.equal(ENQUEUE_MASK & 0x0400, 0, 'bit 10 of the low word -- exactly where the carry lands');
  });

test('W390 SECTION 2: the body emits TWO records a frame while it runs, and NONE on the frame it '
  + 'finishes', { skip: SKIP }, () => {
    const ram = new Ram();
    const rom = rawRom();
    const { ctx } = noteCtx();
    screen9Init25C3E8(ram, rom, ctx);
    flush(ram);
    assert.equal(screen9Body25C424(ram, rom, ctx), true, 'frame 1: still running');
    const recs = emitted(ram);
    assert.equal(recs.length, 2, 'TWO records -- a port copying $25C39C would have emitted one');
    const [d0a, d0b] = ARM9SCREEN.draws.map((d) => packD1((d.d1 + d.d1Add) >>> 0));
    assert.deepEqual(recs[0], [d0a >>> 16, d0a & 0xffff, 0x0033, 0x66a8, 0x0880, 0x0000],
      'record 0 is $25C4D0\'s');
    assert.deepEqual(recs[1], [d0b >>> 16, d0b & 0xffff, 0x0033, 0x68ac, 0x0470, 0x0000],
      'record 1 is $25C4F0\'s -- and its D2/D3 are NOT record 0\'s');
    assert.notDeepEqual(recs[0], recs[1], 'the two are genuinely different sprites');
  });

// ===============================================================================================
// SECTION 3 -- DRIVEN. THE REAL COLD BOOT, PAST +878, WITH ARM 9 ADVANCING.
// ===============================================================================================
//
// TRAP 16: a short run misreads a gate as a stall. Arm 9's own longest wait is the `$F0` = 240
// frame timer, but the run below goes to 4,000 frames so that "it parks on arm 1" is a
// measurement and not the end of the window.

async function coldBootTrace(frames) {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);                 // the boot-complete flag every attract test sets
  const arms = [];
  const screen = [];
  let prevArm = -1, prevSt = -1;
  for (let f = 1; f <= frames; f++) {
    g.step(0xffff);
    const a = g.ram.u16(SCREEN8.state);
    if (a !== prevArm) { arms.push([f, a]); prevArm = a; }
    const s = g.ram.u16(ARM9SCREEN.state);
    if (s !== prevSt) { screen.push([f, s]); prevSt = s; }
  }
  return { g, arms, screen };
}

test('W390 SECTION 3: on a real cold boot the sequencer runs 13 -> 2 -> 12 -> 9 -> 1',
  { skip: SKIP_T }, async () => {
    const { g, arms, screen } = await coldBootTrace(4000);
    assert.deepEqual(arms, [[1, 13], [302, 2], [574, 12], [878, 9], [1182, 1]],
      'arm 9 is entered at +878 -- the frame W389 measured -- and LEAVES at +1,182');
    // W389's own cold-boot test measured 13 -> 2 -> 12 -> 9 and arm 9 PARKING. It parks no more.
    assert.equal(g.ram.u16(SCREEN8.state), 1, 'and at +4,000 the machine rests on arm 1');
    // Arm 9's screen, frame by frame, and the numbers are the ROM's own.
    assert.deepEqual(screen, [[1, 0], [911, 1], [1150, 2]],
      'screen state 0 -> 1 at +911, 1 -> 2 at +1,150');
    assert.equal(1150 - 911, ARM9SCREEN.timerInit - 1,
      'and 239 frames is `move.w #$F0` minus the decrement on the frame state 0 falls through');
  });

test('W390 SECTION 3: the exit is 271 frames AFTER the init chain drained, which is what proves '
  + 'it waits on the second chain', { skip: SKIP_T }, async () => {
    const { arms, screen } = await coldBootTrace(1400);
    const drainedInit = screen.find(([, s]) => s === 1)[0];   // state 0 freed the $24641A chain
    const left = arms.find(([, a]) => a === 1)[0];
    assert.equal(drainedInit, 911, 'the INIT chain was checked, found empty and freed at +911');
    assert.equal(left, 1182, 'the screen finished at +1,182');
    assert.equal(left - drainedInit, 271,
      'A PORT THAT WAITED ON THE INIT CHAIN WOULD HAVE EXITED AT +911. It did not: state 1 '
      + 'burned 239 timer frames and state 2 then waited 32 more on a chain $25C474 had '
      + 'installed in the meantime');
    const startedState2 = screen.find(([, s]) => s === 2)[0];
    assert.equal(left - startedState2, 32, 'the $246710 chain took 32 frames of its own to drain');
  });

test('W390 SECTION 3: arm 9 raises exactly one counted note, and it is NOT its own halves',
  { skip: SKIP_T }, async () => {
    const { g } = await coldBootTrace(1400);
    const report = g.unportedLog.report().join('\n');
    assert.ok(/\$25BB6C/.test(report), '$25BB6C is still counted -- it is a $900000 TX block');
    assert.equal(/\$25C3E8/.test(report), false,
      '$25C3E8 is NOT counted any more; a note beside a live call is a lie about the port');
    assert.equal(/\$25C424/.test(report), false, '...and neither is $25C424');
    // `$28CAE2` IS in the report -- arm 12 ran earlier in this same boot and raised it at
    // $25C318. What matters is that it is attributed to arm 12 and to nothing of arm 9's.
    const cue = report.split('\n').filter((r) => /\$28CAE2/.test(r));
    assert.equal(cue.length, 1, '$28CAE2 is counted once, by arm 12');
    assert.ok(/\$25C318/.test(cue[0]), '...at $25C318, arm 12\'s site');
    assert.equal(/\$25C44A|\$25C452/.test(cue[0]), false,
      'and nothing attributes it to arm 9, which has no cue on that edge at all');
    // Arm 1 is where it rests, and arm 1 IS still counted -- that is the honest state of things.
    assert.ok(/\$25BD7C/.test(report), 'arm 1\'s demo body is counted; that is why the loop parks');
  });

test('W390 SECTION 3 ABLATION: hold the `$F0` timer and the screen never leaves state 1',
  { skip: SKIP_T }, async () => {
    // POSITIVE CONTROL first: the unmodified run reaches state 2 by +1,200.
    const ok = await coldBootTrace(1200);
    assert.equal(ok.g.ram.u16(ARM9SCREEN.state), 2, 'POSITIVE CONTROL: state 2 by +1,200');
    // Now the same run with $812E7C pinned once arm 9 owns it. If the port had read arm 12's
    // $812E74 instead, pinning $812E7C would change nothing and this assertion would fail.
    const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
    g.boot();
    g.ram.setU8(0x803957, 1);
    for (let f = 1; f <= 1200; f++) {
      g.step(0xffff);
      if (g.ram.u16(SCREEN8.state) === 9) g.ram.setU16(ARM9SCREEN.timer, 0x0100);
    }
    assert.equal(g.ram.u16(SCREEN8.state), 9, 'the arm never advances...');
    assert.equal(g.ram.u16(ARM9SCREEN.state), 1, '...because the screen is stuck on state 1');
    assert.equal(g.ram.u16(SCREEN12.state), 2,
      'and arm 12\'s word is untouched at 2, so the two triples really are independent');
  });

// ===============================================================================================
// SECTION 4 -- UNIT B. THE LAST TWO `$241292` SITES, AND THE CENSUS CLOSED.
// ===============================================================================================

test('W390 SECTION 4: the census -- every `$241292` reference in the image, accounted for',
  { skip: SKIP }, () => {
    const found = [];
    for (let a = 0; a + 6 <= IMG.length; a += 2) {
      if ((w(a) === 0x4ef9 || w(a) === 0x4eb9) && l(a + 2) === 0x00241292) found.push(a);
    }
    // W389 said the count went 1 -> 6 once already. It does not go to 7: fourteen sites exist,
    // twelve are ported and use the ID LONG, one ($25DBAC) was already right, and ONE ($249104)
    // is in a routine no file in the port has claimed at all.
    assert.deepEqual(found.map((a) => a.toString(16)),
      ['249104', '24a21a', '25cac2', '25ceb0', '25dbac', '26078c', '288a34', '288c62',
        '28d518', '28d5f2', '28f37a', '290774', '290796', '291f1c'],
      'fourteen call sites, and the two this wave fixes are $25CAC2 and $25CEB0');
    assert.equal(found.length, 14);
    for (const a of found) {
      assert.equal(w(a + 6 - 6), w(a), `$${a.toString(16).toUpperCase()} is a jmp/jsr`);
    }
    // What $241292 does with A5, decoded once for all fourteen.
    assert.equal(l(0x241292), 0x41ed004c, '$241292 lea ($4C,A5),A0 -- the ID field, NOT ($0,A5)');
    assert.equal(w(0x241296), 0x60a0, '$241296 bra.s...');
    assert.equal(0x241298 + (w(0x241296) & 0xff) - 0x100, 0x241238, '  ...to $241238');
    assert.equal(w(0x241252), 0x2290, '$241252 move.l (A0),(A1) -- a LONG read THROUGH A0');
    assert.equal(ALLOC.idOff, 0x4c, 'and $4C is what objalloc.js names as the id offset');
    // The two constants this wave added, so neither file repeats the literal.
    assert.equal(SCREEN17.idAt, 0x4c, 'objslot17.js names it');
    assert.equal(SCREEN9.idAt, 0x4c, 'objslot9.js names it');
  });

test('W390 SECTION 4: slot [17] state 2 really kills its own record', { skip: SKIP }, () => {
  // DRIVEN, on a RAM where A5 IS a live allocator slot -- the only arrangement in which the
  // difference between ($0,A5) and ($4C,A5) can show at all.
  const ram = new Ram();
  const rom = rawRom();
  const { ctx } = noteCtx();
  const a5 = ALLOC.table;                            // slot 0 of the twenty
  ram.setU16(a5 + 0x00, 0x8011);                     // the type word, as $241182 wrote it
  ram.setU32(a5 + ALLOC.idOff, 0x00000021);          // and an id that is NOT $8011
  ram.setU16(SCREEN17.killFlag, 0x1234);             // $25CEAA clears this on the way past
  ram.setU8(a5 + SCREEN17.state, 2);
  objSlot17(ram, rom, a5, ctx);
  assert.equal(ram.u16(SCREEN17.killFlag), 0, '$25CEAA clr.w $80392C ran');
  assert.equal(commitKills(ram), 1, '$241262 drained exactly one queued kill');
  assert.equal(ram.u16(ALLOC.table + 0x00), 0,
    'and the record is GONE -- $2411FC matched the queued id\'s low word against $0021');
});

test('W390 SECTION 4: slot [9] state 2 really kills its own record', { skip: SKIP }, () => {
  const ram = new Ram();
  const rom = rawRom();
  const { ctx } = noteCtx();
  const a5 = ALLOC.table;
  ram.setU16(a5 + 0x00, 0x8009);
  ram.setU32(a5 + ALLOC.idOff, 0x00000042);
  ram.setU8(a5 + SCREEN9.state, 2);
  objSlot9(ram, rom, a5, ctx);
  assert.equal(commitKills(ram), 1, '$241262 drained exactly one queued kill');
  assert.equal(ram.u16(ALLOC.table + 0x00), 0, 'and the record is GONE');
});

test('W390 SECTION 4 ABLATION: the type word is accepted and does nothing', { skip: SKIP }, () => {
  const mk = (type, id) => {
    const ram = new Ram();
    ram.setU16(ALLOC.table, type);
    ram.setU32(ALLOC.table + ALLOC.idOff, id);
    return ram;
  };
  for (const [type, id, name] of [[0x8011, 0x21, 'slot [17]'], [0x8009, 0x42, 'slot [9]']]) {
    const good = mk(type, id);
    queueKill(good, good.u32(ALLOC.table + ALLOC.idOff));     // WITH THE FIX
    assert.equal(commitKills(good), 1, `${name}: one kill drained`);
    assert.equal(good.u16(ALLOC.table), 0, `${name}: the record dies when the ID is queued`);

    const bad = mk(type, id);
    queueKill(bad, bad.u16(ALLOC.table));                     // ABLATED: the type word
    assert.equal(commitKills(bad), 1, `${name}: the bad kill drains too -- it is NOT dropped`);
    assert.equal(bad.u16(ALLOC.table), type,
      `${name}: and the record SURVIVES. TRAP 18 exactly -- killById walked all twenty slots, `
      + 'returned false, the queue reported OK and nothing anywhere was told');
    assert.equal(killById(mk(type, id), type), false, `${name}: stated directly`);
    assert.equal(killById(mk(type, id), id), true, `${name}: ...and the id matches`);
  }
});

// ===============================================================================================
// SECTION 5 -- UNIT C. THE TWO STALE TEXTS (TRAP 14).
// ===============================================================================================

test('W390 SECTION 5: no source file still calls a PORTED routine a counted note', { skip: SKIP },
  () => {
    const main = readFileSync(here('../src/main.js'), 'utf8');
    // The list in `defaultHandlers` used to name $25C2AE/$25C2EA (ported W389) and
    // $25C3E8/$25C424 (ported here) among slot [8]'s counted notes.
    const block = main.slice(main.indexOf('$240F62[8] = $25A770'),
      main.indexOf('W387. $240F62[12]'));
    assert.ok(block.length > 200, 'POSITIVE CONTROL: the slot [8] comment block was found');
    for (const a of ['$25C2AE', '$25C2EA', '$25C3E8', '$25C424']) {
      assert.equal(new RegExp(`\\${a}[^\\n]*counted note`).test(block), false,
        `main.js no longer calls ${a} a counted note`);
    }
    assert.ok(/W390 CORRECTION/.test(block), 'and it says WHY the list changed');
    assert.ok(/\$25BD7C/.test(block) && /\$25C6D4/.test(block),
      'the ones that ARE still counted are named: arms 1/3 and arm 5');
    assert.equal(/\$25C2AE, \$25C2EA, \$25C3E8, \$25C424/.test(block), false,
      'and the old four-in-a-row list is gone');

    // objslot8.js's own header made the same claim in two places.
    const src = readFileSync(here('../src/objslot8.js'), 'utf8');
    const header = src.slice(0, src.indexOf('import {'));
    assert.equal(/arms 1, 5, 9 and 12 hold/.test(header), false,
      'objslot8.js no longer says arms 9 and 12 hold');
    assert.ok(/arms 1 and 5\*\* hold/.test(header), '...it says arms 1 and 5 do');
    assert.ok(/13 -> 2 -> 12 -> 9 -> 1/.test(header), 'and names the path that is live today');
  });

test('W390 SECTION 5: w307namegrid.test.js no longer says W303 counted `$246710`\'s seeding',
  { skip: SKIP }, () => {
    const t = readFileSync(here('./w307namegrid.test.js'), 'utf8');
    const at = t.indexOf('W307 `$28F4A6` arms the cursor');
    assert.ok(at > 0, 'POSITIVE CONTROL: the test is where the brief says it is');
    const block = t.slice(at, at + 1200);
    assert.equal(/W303 counted `\$246710`'s\s*\n?\s*\/\/ seeding/.test(block), false,
      'the stale sentence is gone');
    assert.ok(/W390 CORRECTION/.test(block), 'and the correction says which wave folded it');
    assert.ok(/W389 folded/.test(block), '...W389, into chainLoaderBody');
    assert.ok(/\$246410/.test(block), 'while $246410 -- the one really counted -- is still named');
  });

// ===============================================================================================
// SECTION 6 -- THE THREE ROM WINDOWS, RE-DERIVED FROM THE CARTRIDGE.
// ===============================================================================================

test('W390 SECTION 6: both script bounds land on something the DATA states', { skip: SKIP }, () => {
  // The INIT script: count 2, fourteen bytes an entry, ending AT the load script.
  assert.equal(w(ARM9SCREEN.initScript), ARM9SCREEN.scriptNodes, '$25C512 count word is 2');
  assert.equal(ARM9SCREEN.initScript + 2 + 2 * 14, ARM9SCREEN.loadScript,
    '2 + 2*14 = $1E lands EXACTLY on $25C530. The bound is in the data, not an absence (trap 8)');
  // The LOAD script: count 2, eight bytes an entry, ending AT a block of three longword pointers.
  assert.equal(w(ARM9SCREEN.loadScript), ARM9SCREEN.scriptNodes, '$25C530 count word is 2');
  assert.equal(ARM9SCREEN.loadScript + 2 + 2 * 8, 0x25c542, '2 + 2*8 = $12 lands on $25C542');
  for (const [i, p] of [0x25c54e, 0x25c55e, 0x25c56e].entries()) {
    assert.equal(l(0x25c542 + i * 4), p,
      `$${(0x25c542 + i * 4).toString(16).toUpperCase()} is a pointer to $${p.toString(16)
        .toUpperCase()} -- a different table, so the $12 bound is pinned by what FOLLOWS`);
  }
  // The fade target, from entry [0]'s 14-byte record. TRAP 2: $246B2A's dbra runs N+1 times.
  assert.equal(l(ARM9SCREEN.initScript + 2 + 6), ARM9SCREEN.fadeTarget, 'entry [0] fades $225A78');
  assert.equal(w(ARM9SCREEN.initScript + 2 + 10), 0x001f, '  ...words-minus-one $1F');
  assert.equal((0x1f + 1) * 2, 0x40, '  ...so 32 words = $40 bytes');
  assert.equal(l(ARM9SCREEN.initScript + 2 + 14 + 6), 0x246bf8,
    'entry [1] fades $246BF8, already inside W91\'s $246BB8+$80 -- NOT re-declared');
  // ABUTTING IS NOT OVERLAPPING, and this is the pair most likely to be got wrong.
  assert.equal(0x225a38 + 0x40, ARM9SCREEN.fadeTarget,
    'arm 12\'s W389 target ends EXACTLY where arm 9\'s begins');
});

test('W390 SECTION 6: export-tables.py declares the three windows and re-derives all three',
  { skip: SKIP }, () => {
    const py = readFileSync(here('../tools/export-tables.py'), 'utf8');
    for (const [addr, len] of [['0x25C512', '0x001E'], ['0x25C530', '0x0012'],
      ['0x225A78', '0x0040']]) {
      assert.ok(py.includes(`(${addr}, ${len}, "W390`), `${addr}+${len} is declared with a reason`);
    }
    assert.ok(/def check_arm9_chain_scripts/.test(py), 'and a check re-derives them');
    assert.ok(/check_arm9_chain_scripts\(d\)\s+# W390/.test(py), '...which --verify actually runs');
    assert.equal(/NEVER WIDEN|never widen one/.test(py), true,
      'and the check refuses to let the windows overlap a neighbour');
  });
