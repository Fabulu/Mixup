// ===============================================================================================
// W392 -- ARM 5'S SCREEN, AND THE FRAME THE ATTRACT LOOP CLOSED.
// ===============================================================================================
//
// UNIT. Slot [8] arm 5's `$25C592` (init) and `$25C6D4` (body) -- the LAST counted screen in the
// sequencer, and the one `$25A9AE bcs` reads the carry from.
//
// **THE BRIEF WAS WRONG IN FOUR PLACES, AND THE FIRST ONE WAS ITS CENTRAL QUESTION.** Each is
// asserted here from the bytes rather than argued:
//
//   1. "WHICH CHAIN DOES THE EXIT WAIT ON? Arms 12, 9 and 1 all wait on the SECOND chain."
//      **ARM 5 HAS NO CHAIN.** `$25C592` calls neither `$24641A` nor `$246710`, `$25C6D4` calls
//      neither `$24681A` nor `$246800`, and no `$812E76`-shaped handle exists anywhere in the
//      pair. The exit is two `subq.w #1` down-counters, `$10` then `$960`. SECTION 5a.
//   2. "How wide is the clear, and are its last words a handle?" FIFTEEN words, and the last
//      four are two POINTER longs -- a ROM stream and a RAM buffer, not an object handle. Arm 12
//      cleared four, arm 1 six. SECTION 1.
//   3. "What does the draw actually emit, and through which enqueue? COUNT THE SPRITES."
//      **ZERO.** Arm 5's draw does not go near the sprite queue: `$25C6F8 jsr $240DC2` is the TX
//      printer, and it lays down 168 TX cells a frame. SECTION 3.
//   4. "`$25C592` (init) and `$25C6D4` (body) are the last counted arm sub-machine" -- true, but
//      not "a screen". It is the DEMO: `$25C596` raises `$803926` and `$25C7DE`/`$25C7E4` rotate
//      `$803928` 0 -> 1 -> 2 so three consecutive attract laps play three different demos.
//      SECTION 5b.
//
// AND THE DELIVERABLE. **THE LOOP CYCLES.** SECTION 4 drives a real cold boot for 12,000 frames
// and sees arm 2 three times: +302, +4,334 and +8,366, a lap of exactly 4,032 frames.
//
// SECTION 1  the init `$25C592..$25C60B`, the FIFTEEN-word clear and the two timers
// SECTION 2  the body `$25C6D4..$25C807`, the FALL-THROUGH counters, both carries, two dead stores
// SECTION 3  the draw: 168 TX cells through `$240DC2` and ZERO sprite-queue records
// SECTION 4  DRIVEN: THE ATTRACT LOOP CYCLES, three laps, no coin
// SECTION 5  where the brief is wrong, and the one deferral that is left
// SECTION 6  the four ROM windows, re-derived from the cartridge
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Game } from '../src/main.js';
import {
  ARM1SCREEN, ARM5SCREEN, ARM9SCREEN, SCREEN12, SCREEN8,
  screen5Init25C592, screen5Body25C6D4,
} from '../src/objslot8.js';
import { BUCKETS } from '../src/spritequeue.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false : 'no rip';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);
const s16 = (v) => (v << 16) >> 16;

const TABLES = here('../rip/port/player.tables.json');
const SKIP_T = existsSync(TABLES) ? SKIP : 'generated ROM tables absent; skip, not pass';
const tablesJson = existsSync(TABLES) ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

/** The raw image as a `rom` face -- the same helper W390 and W391 use. */
const rawRom = () => ({
  u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a),
  i16: (a) => IMG.readInt16BE(a), u8: (a) => IMG[a],
  bytes: (a, n) => IMG.subarray(a, a + n),
});

/** The TX DEFER buffer `$240DC2` appends to -- `background.js`'s head/cursor pair. Arm 5's whole
 *  visible output goes through here and NOT through `spritequeue.js`, which is the point of
 *  SECTION 3. */
const TXDEFER = { head: 0x80b058, cursor: 0x80c8d8 };
const txCells = (ram) => (ram.u32(TXDEFER.cursor) - TXDEFER.head) / 8;

/** A bare context: enough for the init and for the first fifteen body frames. `$28E7F8`'s
 *  slide-out arm needs `ctx.rom` and `ctx.tables`, which only arrive on frame 16 when `$25C77A`
 *  sets `$81DFF6` -- so `unitCtx()` below is what the longer runs use. */
const noteCtx = () => {
  const notes = [];
  return { notes,
    ctx: {
      rom: rawRom(),
      unported: { note: (a, t) => notes.push([a, t]) },
      unportedLog: { note: (a, t) => notes.push([a, t]) },
      soundPost: () => {},
    } };
};

/** A context with the real `tables`, `palette`, `vram` and `videoRegs` a `Game` builds, so the
 *  body can be stepped past frame 16 in isolation. */
function unitCtx() {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  const notes = [];
  return { g, notes,
    ctx: {
      rom: g.rom, tables: g.tables, palette: g.palette,
      tx: g.txvram, txvram: g.txvram, vram: g.vram, bgVram: g.vram, videoRegs: g.video,
      unported: { note: (a, t) => notes.push([a, t]) },
      unportedLog: { note: (a, t) => notes.push([a, t]) },
      soundPost: () => {},
    } };
}

// ===============================================================================================
// SECTION 1 -- THE INIT, `$25C592..$25C60B`, AND THE FIFTEEN-WORD CLEAR.
// ===============================================================================================

test('W392 SECTION 1: the init is $25C592..$25C60B with the `rts` AT $25C60A (trap 5)',
  { skip: SKIP }, () => {
    assert.equal(l(0x25c592), 0x48e7fffe, '$25C592 movem.l D0-D7/A0-A6,-(A7)');
    assert.equal(w(0x25c606), 0x4cdf, '$25C606 movem.l (A7)+...');
    assert.equal(w(0x25c608), 0x7fff, '  ...D0-D7/A0-A6 -- TRAP 9, register-transparent');
    assert.equal(w(0x25c60a), 0x4e75, '$25C60A rts, AT the last address, not after it');
    assert.equal(ARM5SCREEN.initEnd, 0x25c60c, 'so the routine ends at $25C60C');
    assert.equal(ARM5SCREEN.initEnd - ARM5SCREEN.init, ARM5SCREEN.initBytes, '...122 bytes');
    // ...and the bound is stated by what FOLLOWS (trap 8): the next routine's own prologue.
    assert.equal(w(0x25c60c), 0x48e7, '$25C60C is `48E7`, the movem opening the NEXT routine');
    assert.equal(w(0x25c60e), 0x03c0, '  ...D6-D7/A0-A1 -- a different save mask, so a different '
      + 'routine. That is $25C60C, the demo INPUT CODEC, and it is not arm 5\'s');
  });

test('W392 SECTION 1: the FIRST thing it does is raise $803926, and the clear comes AFTER',
  { skip: SKIP }, () => {
    assert.equal(w(0x25c596), 0x33fc, '$25C596 move.w #imm,abs.l');
    assert.equal(w(0x25c598), 1, '  ...#$1');
    assert.equal(l(0x25c59a), ARM5SCREEN.demoFlag, '  ...$803926, the DEMO flag');
    // $61DE -- a bsr.s with a NEGATIVE byte displacement. TRAP 6: `61xx` is bsr, and this is
    // the SHORT form, so the target is the address AFTER the opcode word plus the displacement.
    assert.equal(w(0x25c59e) & 0xff00, 0x6100, '$25C59E is `61xx` -- bsr.s');
    assert.equal(0x25c5a0 + ((w(0x25c59e) & 0xff) - 0x100), ARM5SCREEN.clear,
      '  ...$25C5A0 - $22 = $25C57E, the clear');
    // ORDER MATTERS: the two timers are written AFTER the clear, so hoisting it would re-zero
    // them. $812E84 and $812E86 are words 2 and 3 of the very block $25C57E wipes.
    assert.ok(0x25c59e < 0x25c5a0, 'the bsr precedes both timer stores in ROM order');
    assert.equal(w(0x25c5a0), 0x33fc, '$25C5A0 move.w #imm,abs.l');
    assert.equal(w(0x25c5a2), ARM5SCREEN.timerAInit, '  ...#$10');
    assert.equal(l(0x25c5a4), ARM5SCREEN.timerA, '  ...$812E84');
    assert.equal(w(0x25c5a8), 0x33fc, '$25C5A8 move.w #imm,abs.l');
    assert.equal(w(0x25c5aa), ARM5SCREEN.timerBInit, '  ...#$960 -- 2,400 frames');
    assert.equal(l(0x25c5ac), ARM5SCREEN.timerB, '  ...$812E86');
    assert.ok(ARM5SCREEN.timerA > ARM5SCREEN.clearBase
      && ARM5SCREEN.timerB < ARM5SCREEN.clearBase + ARM5SCREEN.clearWords * 2,
      'and BOTH timers are inside the block the clear wipes -- which is why the order is load-'
      + 'bearing and not a style choice');
  });

test('W392 SECTION 1: the clear is FIFTEEN words and its last four are TWO POINTER LONGS',
  { skip: SKIP }, () => {
    assert.equal(w(0x25c57e), 0x41f9, '$25C57E lea abs.l,A0');
    assert.equal(l(0x25c580), ARM5SCREEN.clearBase, '  ...$812E82');
    assert.equal(w(0x25c584), 0x303c, '$25C584 move.w #imm,D0');
    assert.equal(w(0x25c586), 0x000e, '  ...#$E');
    assert.equal(w(0x25c588), 0x7200, '$25C588 moveq #0,D1');
    assert.equal(w(0x25c58a), 0x30c1, '$25C58A move.w D1,(A0)+');
    assert.equal(w(0x25c58c), 0x51c8, '$25C58C dbra D0');
    // TRAP 2, and it is the answer to the brief's second question.
    assert.equal(ARM5SCREEN.clearWords, 15, '`dbra` runs N+1 = FIFTEEN words, $812E82..$812E9F');
    assert.equal(SCREEN12.clearWords, 4, 'arm 12 clears four...');
    assert.equal(ARM1SCREEN.clearWords, 6, '...arm 1 six...');
    assert.equal(ARM9SCREEN.clearWords, 4, '...arm 9 four. No template matched, again');
    // THE LAST FOUR WORDS ARE TWO LONGS, and neither is an object handle: one is a ROM pointer
    // and one is a RAM buffer. Arm 9's and arm 1's last two words WERE a $24641A handle; this
    // is the same SHAPE and a different meaning, which is exactly why the brief's question is
    // worth asking every wave.
    assert.equal(ARM5SCREEN.script, ARM5SCREEN.clearBase + 11 * 2, '$812E98 is words 12-13');
    assert.equal(ARM5SCREEN.recBuf, ARM5SCREEN.clearBase + 13 * 2, '$812E9C is words 14-15');
    assert.equal(l(0x25c5d6) >>> 16, 0x23d8, '$25C5D6 move.l (A0)+,abs.l -- a LONG, not two words');
    assert.equal(l(0x25c5d8), ARM5SCREEN.script, '  ...$812E98');
    assert.equal(l(0x25c5dc) >>> 16, 0x23d8, '$25C5DC move.l (A0)+,abs.l');
    assert.equal(l(0x25c5de), ARM5SCREEN.recBuf, '  ...$812E9C');
  });

test('W392 SECTION 1: the pointer table is `lea (d16,PC)` with a NEGATIVE displacement (trap 4)',
  { skip: SKIP }, () => {
    assert.equal(w(0x25c5b0), 0x41fa, '$25C5B0 lea (d16,PC),A0');
    // The EA is the EXTENSION WORD's address plus the displacement, NOT the opcode's.
    assert.equal(0x25c5b2 + s16(w(0x25c5b2)), ARM5SCREEN.ptrTable,
      '$25C5B2 - $70 = $25C542. Reading it from $25C5B0 would give $25C540, two bytes early, '
      + 'and every pointer in the table would be read half a longword out');
    assert.equal(l(0x25c5b4) >>> 16, 0x3439, '$25C5B4 move.w abs.l,D2');
    assert.equal(l(0x25c5b6), ARM5SCREEN.demoIndex, '  ...$803928, the demo index');
    assert.equal(w(0x25c5ba), 0xd442, '$25C5BA add.w D2,D2');
    assert.equal(w(0x25c5bc), 0xd442, '$25C5BC add.w D2,D2 -- index * 4, as a WORD');
    assert.equal(l(0x25c5be), 0x20702000, '$25C5BE movea.l (A0,D2.w),A0');
    for (let i = 0; i < ARM5SCREEN.ptrEntries; i++) {
      assert.equal(l(ARM5SCREEN.ptrTable + i * 4), ARM5SCREEN.blocks[i],
        `entry [${i}] points at $${ARM5SCREEN.blocks[i].toString(16).toUpperCase()}`);
    }
    // ...and the blocks are the table's OWN far end, the same shape W391 found at $25F868.
    assert.equal(ARM5SCREEN.blocks[0], ARM5SCREEN.ptrTable + 12,
      'the first block follows the three pointers, so the window is one contiguous $3C');
  });

test('W392 SECTION 1: TRAP 11 -- `$241182` leaves the STAGED record in A0, so `$25C5EC` writes '
  + 'the demo index into the NEW record and not into arm 5\'s own', { skip: SKIP }, () => {
  assert.equal(w(0x25c5e2), 0x303c, '$25C5E2 move.w #imm,D0');
  assert.equal(w(0x25c5e4), ARM5SCREEN.rankType, '  ...#$A -- dispatch type TEN');
  assert.equal(w(0x25c5e6), 0x4eb9, '$25C5E6 jsr abs.l');
  assert.equal(l(0x25c5e8), 0x00241182, '  ...$241182');
  assert.equal(l(0x25c5ec), 0x31470004, '$25C5EC move.w D7,($4,A0) -- A0, not A5');
  // Dispatch type $A is $260794, the rank object, and its state-0 init is what sets $813082 --
  // the one-shot gate the BODY's $26070C would consume sixteen frames later.
  assert.equal(l(0x240f62 + 10 * 8), 0x00260794, '$240F62[10] is $260794');
  assert.equal(w(0x260794), 0x4a2d, '$260794 tst.b (d8,A5)...');
  assert.equal(w(0x260796), 0x0002, '  ...($2,A5) -- the constructed flag arm 0 uses too');
});

test('W392 SECTION 1: running the init clears fifteen words, arms both timers and loads block 0',
  { skip: SKIP }, () => {
    const ram = new Ram(new Uint8Array(0x20000));
    // Dirty EVERY word the clear must reach, including both pointer longs. A four- or six-word
    // clear -- either template -- leaves nine or eleven of these standing.
    for (let i = 0; i < 15; i++) ram.setU16(ARM5SCREEN.clearBase + i * 2, 0xbeef);
    const { notes, ctx } = noteCtx();
    const made = screen5Init25C592(ram, rawRom(), ctx);

    assert.equal(ram.u16(ARM5SCREEN.demoFlag), 1, '$803926 raised');
    assert.equal(ram.u16(ARM5SCREEN.state), 0, '$812E82 the state, cleared');
    assert.equal(ram.u16(ARM5SCREEN.timerA), ARM5SCREEN.timerAInit, '$812E84 = $10');
    assert.equal(ram.u16(ARM5SCREEN.timerB), ARM5SCREEN.timerBInit, '$812E86 = $960');
    assert.equal(ram.u16(ARM5SCREEN.anim), 0, '$812E88 the animation cursor, cleared');
    assert.equal(ram.u16(ARM5SCREEN.codecMode), 0, '$812E90, cleared');
    assert.equal(ram.u16(ARM5SCREEN.codecRun), 0, '$812E94, cleared');
    assert.equal(ram.u16(ARM5SCREEN.codecOff), 0, '$812E96, cleared -- and it is the offset the '
      + 'body then indexes the replay stream with, so a stale one reads the wrong pair');
    // Block 0's payload, straight out of the cartridge.
    assert.equal(ram.u16(ARM5SCREEN.x), 2, '$812E8A = 2');
    assert.equal(ram.u16(ARM5SCREEN.y), 2, '$812E8C = 2');
    assert.equal(ram.u16(ARM5SCREEN.w8e), 0, '$812E8E = 0');
    assert.equal(ram.u32(ARM5SCREEN.script), ARM5SCREEN.demoScripts[0], '$812E98 = $239FB8');
    assert.equal(ram.u32(ARM5SCREEN.recBuf), 0x300000, '$812E9C = $300000, the record buffer');
    // ...and the staged type-$A record carries D7, block 0's FIRST word.
    assert.equal(ram.u16(made.addr + SCREEN8.param), 0, 'the staged record\'s ($4,A0) is 0');
    // Only ONE deferral, and it is the palette install refusing a chain with no PaletteState.
    assert.deepEqual(notes.map((n) => n[0]), [0x2414be],
      'no other note: everything else in $25C592 is a real call');
  });

test('W392 SECTION 1: the palette is TX bank TWELVE, not the bank 0 every other arm installs',
  { skip: SKIP_T }, () => {
    assert.equal(w(0x25c5f6), 0x41f9, '$25C5F6 lea abs.l,A0');
    assert.equal(l(0x25c5f8), ARM5SCREEN.palSrc, '  ...$2227F8');
    assert.equal(w(0x25c5fc), 0x303c, '$25C5FC move.w #imm,D0');
    assert.equal(w(0x25c5fe), ARM5SCREEN.palBank, '  ...#$C. Arms 1, 3 and 5\'s WRAPPER all use '
      + '`moveq #0,D0`; this one does not, and `installTxBank` hard-codes bank 0');
    const { ctx } = unitCtx();
    const ram = new Ram(new Uint8Array(0x20000));
    screen5Init25C592(ram, rawRom(), ctx);
    assert.ok(ctx.palette.installs.has('$25C600 TX bank 12 <- slot [8] arm 5 demo-play TX palette'),
      'the install is attributed to $25C600 and lands on bank 12');
  });

// ===============================================================================================
// SECTION 2 -- THE BODY, `$25C6D4..$25C807`: TWO FALL-THROUGH COUNTERS AND BOTH CARRIES.
// ===============================================================================================

test('W392 SECTION 2: the body is $25C6D4..$25C807 with the `rts` AT $25C806', { skip: SKIP },
  () => {
    assert.equal(l(0x25c6d4), 0x48e7fffe, '$25C6D4 movem.l D0-D7/A0-A6,-(A7)');
    assert.equal(w(0x25c806), 0x4e75, '$25C806 rts, AT the last address');
    assert.equal(ARM5SCREEN.bodyEnd, 0x25c808, 'so the routine ends at $25C808');
    assert.equal(ARM5SCREEN.bodyEnd - ARM5SCREEN.body, ARM5SCREEN.bodyBytes, '...308 bytes');
    // TWO exits, and both restore the FULL register set first -- so neither carries a value out.
    assert.equal(w(0x25c7cc), 0x4cdf, '$25C7CC movem.l (A7)+,...');
    assert.equal(w(0x25c7ce), 0x7fff, '  ...D0-D7/A0-A6');
    assert.equal(w(0x25c7f8), 0x4cdf, '$25C7F8 movem.l (A7)+,...');
    assert.equal(w(0x25c7fa), 0x7fff, '  ...the same mask on the other exit');
  });

test('W392 SECTION 2: both carries, and they are the SAME two instructions arms 1, 9 and 12 use',
  { skip: SKIP }, () => {
    // STILL RUNNING -- `ori #$1,SR` sets C, and $25A9AE `bcs` then skips the teardown.
    assert.equal(w(0x25c7d0), 0x007c, '$25C7D0 ori #imm,SR');
    assert.equal(w(0x25c7d2), 0x0001, '  ...#$1 -- bit 0 of the CCR is CARRY');
    assert.equal(w(0x25c7d4), 0x4e75, '$25C7D4 rts');
    // FINISHED -- `move.w D0,D0` is `3000`, which the 68000 defines as clearing C.
    assert.equal(w(0x25c804), 0x3000, '$25C804 move.w D0,D0 -- NOT a `nop`, and not an `andi`');
    assert.equal(w(0x25c806), 0x4e75, '$25C806 rts');
    // ...and the reader.
    assert.equal(w(0x25a9a8), 0x4eb9, '$25A9A8 jsr abs.l');
    assert.equal(l(0x25a9aa), ARM5SCREEN.body, '  ...$25C6D4');
    assert.equal(w(0x25a9ae), 0x6500, '$25A9AE is `6500` -- bcs.w, NOT the `6100` bsr trap 6 '
      + 'caught on arm 3');
    assert.equal(0x25a9b0 + w(0x25a9b0), 0x25a9e0, '  ...to the `rts` at $25A9E0');
    assert.equal(w(0x25a9b2), 0x4eb9, '$25A9B2 -- and CARRY CLEAR falls into the teardown');
    assert.equal(l(0x25a9b4), 0x0024107c, '  ...`jsr $24107C`, teardown25A9B2\'s first call');
  });

test('W392 SECTION 2: the two states FALL THROUGH -- they are NOT an else-if chain (trap 7)',
  { skip: SKIP }, () => {
    assert.equal(w(0x25c71a), 0x0c79, '$25C71A cmpi.w #imm,abs.l');
    assert.equal(w(0x25c71c), 0, '  ...#$0');
    assert.equal(l(0x25c71e), ARM5SCREEN.state, '  ...$812E82');
    assert.equal(w(0x25c722), 0x6600, '$25C722 bne.w');
    assert.equal(0x25c724 + w(0x25c724), 0x25c7a0, '  ...$25C7A0, the state-1 compare');
    assert.equal(w(0x25c72c), 0x6600, '$25C72C bne.w -- the timer-not-expired arm');
    assert.equal(0x25c72e + w(0x25c72e), 0x25c7a0, '  ...the SAME $25C7A0');
    // The state-0 body's LAST instruction is the handoff, and there is no branch after it: the
    // next address IS the state-1 compare. So the frame that arms state 1 also takes the first
    // tick off $812E86.
    assert.equal(w(0x25c79a), 0x4eb9, '$25C79A jsr abs.l');
    assert.equal(l(0x25c79c), ARM5SCREEN.handoff, '  ...$26070C');
    assert.equal(0x25c79a + 6, 0x25c7a0, '  ...and $25C7A0 is the very next instruction');
    assert.equal(w(0x25c7a0), 0x0c79, '$25C7A0 cmpi.w #imm,abs.l');
    assert.equal(w(0x25c7a2), 1, '  ...#$1');
    assert.equal(l(0x25c7a4), ARM5SCREEN.state, '  ...the same $812E82');
    // The two counters.
    assert.equal(w(0x25c726), 0x5379, '$25C726 subq.w #1,abs.l');
    assert.equal(l(0x25c728), ARM5SCREEN.timerA, '  ...$812E84');
    assert.equal(w(0x25c7ac), 0x5379, '$25C7AC subq.w #1,abs.l');
    assert.equal(l(0x25c7ae), ARM5SCREEN.timerB, '  ...$812E86');
  });

test('W392 SECTION 2: driven one frame at a time -- state 0 is sixteen frames and the SIXTEENTH '
  + 'also spends a tick of $812E86', { skip: SKIP_T }, () => {
  const { ctx } = unitCtx();
  const rom = rawRom();
  const ram = new Ram(new Uint8Array(0x20000));
  screen5Init25C592(ram, rom, ctx);

  for (let f = 1; f <= 15; f++) {
    ram.setU32(TXDEFER.cursor, TXDEFER.head);
    assert.equal(screen5Body25C6D4(ram, rom, ctx), true, `frame ${f} is still running`);
    assert.equal(ram.u16(ARM5SCREEN.state), 0, `  ...and still in state 0 on frame ${f}`);
    assert.equal(ram.u16(ARM5SCREEN.timerA), 16 - f, `  ...$812E84 = ${16 - f}`);
    assert.equal(ram.u16(ARM5SCREEN.timerB), ARM5SCREEN.timerBInit,
      '  ...and $812E86 has NOT started: state 0 never reaches $25C7AC');
  }
  // FRAME 16 -- the transition, and the fall-through.
  ram.setU32(TXDEFER.cursor, TXDEFER.head);
  assert.equal(screen5Body25C6D4(ram, rom, ctx), true, 'frame 16 is still running');
  assert.equal(ram.u16(ARM5SCREEN.timerA), 0, '  ...$812E84 reached 0');
  assert.equal(ram.u16(ARM5SCREEN.state), 1, '  ...the state advanced');
  assert.equal(ram.u16(ARM5SCREEN.timerB), ARM5SCREEN.timerBInit - 1,
    '**AND $812E86 IS ALREADY $95F.** An else-if would leave it at $960 and put the exit one '
    + 'frame late. $25C79A has no branch after it and $25C7A0 is the next instruction');
  // The stream is primed from its FIRST pair, and the offset stepped by two.
  assert.equal(ram.u16(ARM5SCREEN.codecRun), IMG[ARM5SCREEN.demoScripts[0]],
    '$812E94 <- the run length at $239FB8, as a WORD ($25C760)');
  assert.equal(ram.u8(ARM5SCREEN.codecVal), IMG[ARM5SCREEN.demoScripts[0] + 1],
    '$812E92 <- the value at $239FB9, as a BYTE ($25C766)');
  assert.equal(ram.u16(ARM5SCREEN.codecOff), 2, '$812E96 stepped by two ($25C76E)');
  assert.equal(ram.u16(ARM5SCREEN.codecMode), 1, '$812E90 = 1, playback');
  // $23BDDA cleared SEVEN words, and the first of them is the frame counter the draw reads.
  for (let i = 0; i < ARM5SCREEN.counterWords; i++) {
    assert.equal(ram.u16(ARM5SCREEN.counterBase + i * 2), 0,
      `$${(ARM5SCREEN.counterBase + i * 2).toString(16).toUpperCase()} cleared by $23BDDA`);
  }
});

test('W392 SECTION 2: the exit is on frame 2,415 and it drops $803926 and rotates $803928',
  { skip: SKIP_T }, () => {
    const { ctx } = unitCtx();
    const rom = rawRom();
    const ram = new Ram(new Uint8Array(0x20000));
    screen5Init25C592(ram, rom, ctx);
    let f = 0, carry = true;
    while (carry && f < 4000) {
      ram.setU32(TXDEFER.cursor, TXDEFER.head);
      carry = screen5Body25C6D4(ram, rom, ctx);
      f++;
    }
    assert.equal(f, 2415, 'sixteen frames of $10 plus 2,400 of $960, MINUS the one they share');
    assert.equal(ARM5SCREEN.timerAInit + ARM5SCREEN.timerBInit - 1, 2415, '  ...$10 + $960 - 1');
    assert.equal(carry, false, 'and the last frame returns CARRY CLEAR -- the teardown runs');
    assert.equal(ram.u16(ARM5SCREEN.demoFlag), 0, '$803926 dropped ($25C7FC)');
    assert.equal(ram.u16(ARM5SCREEN.demoIndex), 1, '$803928 rotated to demo 1 ($25C7DE)');
    assert.equal(ram.u16(ARM5SCREEN.codecMode), 0, '$812E90 back to 0 ($25C7D6)');
    // The wrap. $25C7E4 compares against 3 and $25C7F0 writes zero, so 2 -> 0.
    ram.setU16(ARM5SCREEN.demoIndex, ARM5SCREEN.demoCount - 1);
    ram.setU16(ARM5SCREEN.state, 1);
    ram.setU16(ARM5SCREEN.timerB, 1);
    ram.setU32(TXDEFER.cursor, TXDEFER.head);
    assert.equal(screen5Body25C6D4(ram, rom, ctx), false, 'a $812E86 of 1 exits immediately');
    assert.equal(ram.u16(ARM5SCREEN.demoIndex), 0, '  ...and 2 wraps to 0, not to 3');
  });

test('W392 SECTION 2: TWO DEAD STORES, both transcribed rather than tidied away', { skip: SKIP },
  () => {
    // $812E90 gets #$2 and then #$1 with nothing in between.
    assert.equal(w(0x25c740), 0x33fc, '$25C740 move.w #imm,abs.l');
    assert.equal(w(0x25c742), 2, '  ...#$2');
    assert.equal(l(0x25c744), ARM5SCREEN.codecMode, '  ...$812E90');
    assert.equal(w(0x25c748), 0x33fc, '$25C748 move.w #imm,abs.l');
    assert.equal(w(0x25c74a), 1, '  ...#$1');
    assert.equal(l(0x25c74c), ARM5SCREEN.codecMode, '  ...the SAME $812E90, eight bytes later');
    assert.equal(0x25c740 + 8, 0x25c748, 'and nothing sits between them');
    // $812E94 gets a BYTE and then a WORD over it -- trap 3 from the other direction.
    assert.equal(w(0x25c738), 0x13fc, '$25C738 move.b #imm,abs.l -- a BYTE');
    assert.equal(w(0x25c73a), 1, '  ...#$1');
    assert.equal(l(0x25c73c), ARM5SCREEN.codecRun, '  ...$812E94, the HIGH half of the word');
    assert.equal(l(0x25c760) >>> 16, 0x33c0, '$25C760 move.w D0,abs.l -- the WHOLE word');
    assert.equal(l(0x25c762), ARM5SCREEN.codecRun, '  ...the same $812E94, and D0 is a byte '
      + 'value, so the high half it writes is 0 and the `move.b` above never survives');
  });

// ===============================================================================================
// SECTION 3 -- THE DRAW. **COUNT THE SPRITES: THERE ARE NONE.**
// ===============================================================================================

test('W392 SECTION 3: the draw goes through $240DC2, not through any sprite emitter',
  { skip: SKIP }, () => {
    assert.equal(w(0x25c6de), 0x41fa, '$25C6DE lea (d16,PC),A0');
    assert.equal(0x25c6e0 + s16(w(0x25c6e0)), ARM5SCREEN.animTable, '  ...$25C6E0 + $128 = $25C808');
    assert.equal(w(0x25c6e2), 0x4e71, '$25C6E2 nop -- the same filler arms 9, 12 and 1 carry');
    assert.equal(l(0x25c6e4) >>> 16, 0xd0f9, '$25C6E4 adda.w abs.l,A0');
    assert.equal(l(0x25c6e6), ARM5SCREEN.anim, '  ...$812E88');
    assert.equal(w(0x25c6ea), 0x2810, '$25C6EA move.l (A0),D4 -- a LONG, so four bytes an entry');
    assert.equal(w(0x25c6ec), 0x303c, '$25C6EC move.w #imm,D0');
    assert.equal(w(0x25c6ee), ARM5SCREEN.drawD0, '  ...#$88');
    assert.equal(w(0x25c6f0), 0x323c, '$25C6F0 move.w #imm,D1');
    assert.equal(w(0x25c6f2), ARM5SCREEN.drawD1, '  ...#$0');
    assert.equal(w(0x25c6f4), 0x7405, '$25C6F4 moveq #$5,D2');
    assert.equal(w(0x25c6f6), 0x761b, '$25C6F6 moveq #$1B,D3');
    assert.equal(w(0x25c6f8), 0x4eb9, '$25C6F8 jsr abs.l');
    assert.equal(l(0x25c6fa), ARM5SCREEN.txPrint, '  ...$240DC2, the TX printer W116 ported');
    // TRAP 2, twice: $240DFE's `dbra D2` runs D2+1 = 6 and $240DF8's `dbra D7` runs D3+1 = 28.
    assert.equal((ARM5SCREEN.drawD2 + 1) * (ARM5SCREEN.drawD3 + 1), ARM5SCREEN.drawCells,
      '6 x 28 = 168 cells, and reading either `dbra` as N would give 5 x 27 = 135');
  });

test('W392 SECTION 3: one body frame lays down 168 TX cells and ZERO sprite-queue records',
  { skip: SKIP_T }, () => {
    const { ctx } = unitCtx();
    const rom = rawRom();
    const ram = new Ram(new Uint8Array(0x20000));
    screen5Init25C592(ram, rom, ctx);
    ram.setU32(TXDEFER.cursor, TXDEFER.head);
    assert.equal(screen5Body25C6D4(ram, rom, ctx), true);

    assert.equal(txCells(ram), ARM5SCREEN.drawCells, '168 TX cells');
    // **AND THE SPRITE QUEUE IS UNTOUCHED.** Arm 1 put SEVEN records a frame through two
    // different emitters into bucket 0; arm 5 puts none through any bucket.
    for (let b = 0; b < BUCKETS.length; b++) {
      assert.equal(ram.u16(BUCKETS[b].counter), 0,
        `bucket ${b} is empty -- arm 5 emits no sprites at all`);
    }
    // The cells themselves: the first destination is $904000 + (D1 + D0) and the tile longword
    // is the table entry with $C0000000 added, stepping $10000 a cell.
    assert.equal(ram.u32(TXDEFER.head), 0x904000 + ARM5SCREEN.drawD0, 'cell 0 -> $904088');
    assert.equal(ram.u32(TXDEFER.head + 4), (l(ARM5SCREEN.animTable) + 0xc0000000) >>> 0,
      'cell 0 tile = $07C70018 + $C0000000');
    assert.equal(ram.u32(TXDEFER.head + 8), 0x904000 + ARM5SCREEN.drawD0 + 0x100,
      'cell 1 is one COLUMN on ($100), because the TX map is column-major');
    assert.equal(ram.u32(TXDEFER.head + 12), ((l(ARM5SCREEN.animTable) + 0xc0000000) >>> 0)
      + 0x10000, 'and its tile is one higher');
  });

test('W392 SECTION 3: the animation is four entries, two frames each, on the frame-counter parity',
  { skip: SKIP_T }, () => {
    assert.equal(l(0x25c6fe) >>> 16, 0x3039, '$25C6FE move.w abs.l,D0');
    assert.equal(l(0x25c700), ARM5SCREEN.frameCounter, '  ...$80390A');
    assert.equal(w(0x25c704), 0x0240, '$25C704 andi.w #imm,D0');
    assert.equal(w(0x25c706), 1, '  ...#$1 -- ODD frames SKIP the advance');
    assert.equal(w(0x25c70c), 0x5879, '$25C70C addq.w #4,abs.l');
    assert.equal(w(0x25c712), 0x0279, '$25C712 andi.w #imm,abs.l');
    assert.equal(w(0x25c714), ARM5SCREEN.animMask, '  ...#$F, so four four-byte entries');

    const { ctx } = unitCtx();
    const rom = rawRom();
    const ram = new Ram(new Uint8Array(0x20000));
    screen5Init25C592(ram, rom, ctx);
    const seen = [];
    for (let f = 0; f < 10; f++) {
      ram.setU16(ARM5SCREEN.frameCounter, f);      // the counter main.js's #counters() bumps
      ram.setU32(TXDEFER.cursor, TXDEFER.head);
      screen5Body25C6D4(ram, rom, ctx);
      seen.push(ram.u16(ARM5SCREEN.anim));
    }
    assert.deepEqual(seen, [4, 4, 8, 8, 12, 12, 0, 0, 4, 4],
      'four entries, two frames each -- an eight-frame cycle, and the mask wraps 12 back to 0');
  });

// ===============================================================================================
// SECTION 4 -- **THE DELIVERABLE. THE ATTRACT LOOP CYCLES.**
// ===============================================================================================

/** A real cold boot, the same helper W390 and W391 use. */
function coldBootTrace(frames) {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);                 // the boot-complete flag every attract test sets
  const arms = [];
  let prev = -1;
  for (let f = 1; f <= frames; f++) {
    g.step(0xffff);
    const a = g.ram.u16(SCREEN8.state);
    if (a !== prev) { arms.push([f, a]); prev = a; }
  }
  return { g, arms };
}

test('W392 SECTION 4: THE LOOP CYCLES. Arm 2 runs a SECOND time at +4,334 and a THIRD at +8,366',
  { skip: SKIP_T }, () => {
    const { g, arms } = coldBootTrace(12000);
    assert.deepEqual(arms, [
      [1, 13], [302, 2], [574, 12], [878, 9], [1182, 1], [1918, 5],
      [4334, 2], [4606, 12], [4910, 9], [5214, 1], [5950, 5],
      [8366, 2], [8638, 12], [8942, 9], [9246, 1], [9982, 5],
    ], 'W391 measured 13 -> 2 -> 12 -> 9 -> 1 -> 5 and arm 5 PARKING at +1,918. It parks no '
      + 'more: $25C6D4 hands back a CLEAR carry, $25A9AE falls into teardown25A9B2, and the '
      + 'restaged record comes back at state 2. **THAT IS THE ATTRACT LOOP, CLOSED**');

    // The lap is exact, which is what says the loop is periodic and not merely repeating once.
    const twos = arms.filter(([, a]) => a === 2).map(([f]) => f);
    assert.deepEqual(twos, [302, 4334, 8366], 'arm 2 three times');
    assert.equal(twos[1] - twos[0], 4032, 'lap 1 -> lap 2 is 4,032 frames');
    assert.equal(twos[2] - twos[1], 4032, 'lap 2 -> lap 3 is the SAME 4,032 frames');
    // Of those 4,032, arm 5 is 2,415 -- sixty per cent of the whole attract cycle.
    assert.equal(4032 - 2415, 1617, 'and 1,617 of them are arms 2, 12, 9 and 1 together');
    assert.equal(g.ram.u16(SCREEN8.state), 5, 'at +12,000 the machine is mid-demo on lap 3');
  });

test('W392 SECTION 4: $803926 is up for exactly the 2,415 frames of arm 5, and $803928 rotates',
  { skip: SKIP_T }, () => {
    const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
    g.boot();
    g.ram.setU8(0x803957, 1);
    const flag = [], index = [], phase = [];
    let pf = -1, pi = -1, pp = -1;
    for (let f = 1; f <= 12000; f++) {
      g.step(0xffff);
      const x = g.ram.u16(ARM5SCREEN.demoFlag); if (x !== pf) { flag.push([f, x]); pf = x; }
      const i = g.ram.u16(ARM5SCREEN.demoIndex); if (i !== pi) { index.push([f, i]); pi = i; }
      const s = g.ram.u16(ARM5SCREEN.state); if (s !== pp) { phase.push([f, s]); pp = s; }
    }
    assert.deepEqual(flag, [[1, 0], [1919, 1], [4333, 0], [5951, 1], [8365, 0], [9983, 1]],
      '$803926 rises on arm 5\'s FIRST body frame and drops on its last, three times');
    assert.equal(4333 - 1919 + 1, 2415, 'lap 1\'s arm 5 is 2,415 frames...');
    assert.equal(8365 - 5951 + 1, 2415, '...and so is lap 2\'s. The counters are deterministic');
    assert.deepEqual(index, [[1, 0], [4333, 1], [8365, 2]],
      '$803928 rotates 0 -> 1 -> 2, so three consecutive laps play three DIFFERENT demos');
    assert.deepEqual(phase.slice(0, 4), [[1, 0], [1934, 1], [4333, 0], [5966, 1]],
      '$812E82 goes 0 -> 1 on frame 16 of each pass (1,919 + 15) and the teardown\'s '
      + '$25C57E puts it back to 0 on the way out');
    assert.equal(1934 - 1919, 15, 'sixteen frames of state 0, counted from its first');
    assert.equal(5966 - 5951, 15, '  ...and the same sixteen on lap 2');
  });

test('W392 SECTION 4: the demo really does pick a DIFFERENT block each lap', { skip: SKIP_T },
  () => {
    const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
    g.boot();
    g.ram.setU8(0x803957, 1);
    const picked = [];
    for (let f = 1; f <= 12000; f++) {
      g.step(0xffff);
      // Sample DURING each demo: the teardown's $25C57E wipes $812E98 on the way out, so a
      // sample taken after the exit would read zero every lap and prove nothing (trap 16).
      if (f === 2000 || f === 6000 || f === 10000) {
        picked.push([g.ram.u32(ARM5SCREEN.script), g.ram.u16(ARM5SCREEN.x),
          g.ram.u16(ARM5SCREEN.y), g.ram.u32(ARM5SCREEN.recBuf)]);
      }
    }
    assert.deepEqual(picked, [
      [0x239fb8, 2, 2, 0x300000],
      [0x23a7b8, 0, 4, 0x300800],
      [0x23afb8, 2, 6, 0x301000],
    ], 'three laps, three replay streams $800 apart and three different (style, ship) pairs');
  });

// ===============================================================================================
// SECTION 5 -- WHERE THE BRIEF IS WRONG, AND THE ONE DEFERRAL LEFT.
// ===============================================================================================

test('W392 SECTION 5a: **THERE IS NO CHAIN.** Not one chain primitive is called from either half',
  { skip: SKIP }, () => {
    // An exhaustive scan of every `jsr abs.l` and `jmp abs.l` in the pair. This is not proving
    // an EXTENT by absence (trap 8) -- the extent is `$25C592..$25C60B` and `$25C6D4..$25C807`,
    // both pinned by their own `rts` and by the code that follows. It is enumerating what a
    // bounded span calls.
    const CHAIN = new Set([0x24641a, 0x246710, 0x246704, 0x24652a, 0x24681a, 0x246800, 0x246410]);
    const calls = [];
    for (const [lo, hi] of [[ARM5SCREEN.init, ARM5SCREEN.initEnd],
      [ARM5SCREEN.body, ARM5SCREEN.bodyEnd]]) {
      for (let a = lo; a < hi - 4; a += 2) {
        if (w(a) === 0x4eb9 || w(a) === 0x4ef9) calls.push(l(a + 2));
      }
    }
    assert.deepEqual(calls.filter((c) => CHAIN.has(c)), [],
      'arms 12, 9 and 1 all build a chain in the init and wait on a SECOND one in the body. '
      + 'Arm 5 calls $24641A, $246710, $24681A and $246800 exactly ZERO times');
    // ...and there is no handle word either. $812E76 / $812E60 / $812E6E are the three the
    // other arms use; arm 5's fifteen-word block does not overlap any of them.
    for (const handle of [0x812e60, 0x812e6e, 0x812e76]) {
      assert.ok(handle < ARM5SCREEN.clearBase,
        `$${handle.toString(16).toUpperCase()} is BELOW arm 5's block, so it is not arm 5's`);
    }
    // What IS called, in ROM order, and every one of them is named.
    assert.deepEqual(calls, [
      0x241182, 0x28e7a2, 0x2414be,                              // the init
      0x28e7f8, 0x240dc2, 0x23bdda, 0x28e7dc, 0x26070c,          // the body
      0x23c608, 0x23c638, 0x240b0e,
    ], 'eleven absolute calls, and the ONE that is a counted deferral is $26070C');
  });

test('W392 SECTION 5b: arm 5 is the DEMO, and $803926 is the flag the coin gate already reads',
  { skip: SKIP }, () => {
    assert.equal(SCREEN8.dualGate, ARM5SCREEN.demoFlag,
      '$803926 is the word `SCREEN8.dualGate` already names -- W375 read it from the coin '
      + 'gate\'s end and called it a dual-play gate. It is the DEMO-RUNNING flag');
    assert.equal(l(0x25a7d4), ARM5SCREEN.demoFlag, '$25A7D2 tst.w $803926 -- the coin teardown');
    assert.equal(l(0x260760), ARM5SCREEN.demoFlag, '$26075E tst.w $803926 -- inside $26070C, '
      + 'and it is what makes the demo hand $260580 a D7 of $38 where a human hands 0');
    // The rotation.
    assert.equal(w(0x25c7de), 0x5279, '$25C7DE addq.w #1,abs.l');
    assert.equal(l(0x25c7e0), ARM5SCREEN.demoIndex, '  ...$803928');
    assert.equal(w(0x25c7e4), 0x0c79, '$25C7E4 cmpi.w #imm,abs.l');
    assert.equal(w(0x25c7e6), ARM5SCREEN.demoCount, '  ...#$3');
    assert.equal(w(0x25c7ec), 0x6d00, '$25C7EC blt.w -- SIGNED, and the reset writes zero');
    assert.equal(0x25c7ee + w(0x25c7ee), 0x25c7f8, '  ...past the reset at $25C7F0');
  });

test('W392 SECTION 5c: $26070C is the ONLY deferral, and it is counted with a measured reason',
  { skip: SKIP_T }, () => {
    const { g } = coldBootTrace(4400);
    const report = g.unportedLog.report().join('\n');
    // The two the brief named are GONE.
    assert.equal(/\$25C592/.test(report), false, 'arm 5\'s init is no longer counted');
    assert.equal(/\$25C6D4/.test(report), false, 'arm 5\'s body is no longer counted');
    // The five registers the handoff is given, straight out of the cartridge -- so the note's
    // "D0=$2, D1=$2, D2=D3=$FF, D4=1" is a transcription and not a recollection.
    assert.equal(l(0x25c784) >>> 16, 0x3039, '$25C784 move.w abs.l,D0...');
    assert.equal(l(0x25c786), ARM5SCREEN.x, '  ...$812E8A');
    assert.equal(l(0x25c78a) >>> 16, 0x3239, '$25C78A move.w abs.l,D1...');
    assert.equal(l(0x25c78c), ARM5SCREEN.y, '  ...$812E8C');
    assert.equal(w(0x25c790), 0x343c, '$25C790 move.w #imm,D2');
    assert.equal(w(0x25c792), ARM5SCREEN.handoffD2, '  ...#$FF -- P2 "did not join"');
    assert.equal(w(0x25c794), 0x363c, '$25C794 move.w #imm,D3');
    assert.equal(w(0x25c796), ARM5SCREEN.handoffD3, '  ...#$FF');
    assert.equal(w(0x25c798), 0x7801, '$25C798 moveq #$1,D4 -- where a human hands 0');
    assert.equal(ARM5SCREEN.handoffD4, 1);
    // ...and the one that is left names its cost, in frames.
    assert.ok(/\$26070C/.test(report), '$26070C IS counted');
    assert.ok(/\$24C4F8/.test(report), '  ...and the note names WHY: option formation 4');
    assert.ok(/5,996/.test(report), '  ...and the frame it was measured at');
    // A note beside a live call would be a lie (trap 14), so none of arm 5's other callees may
    // be KEYED in the report. Keyed, not merely mentioned: `$240B0E` is named inside
    // `bootFrontEnd23BF74`'s `$23BEEA` note, which lists the twenty-three jsr's the RESET
    // routine runs -- a different call site, and matching on substring would have called that
    // a lie when it is not one.
    const keyed = (a) => new RegExp(`^\\s*\\d+ x \\$${a}\\b`, 'm').test(report);
    for (const live of ['28E7F8', '28E7A2', '28E7DC', '23BDDA', '240DC2', '23C608', '23C638',
      '240B0E', '241182', '25C57E']) {
      assert.equal(keyed(live), false,
        `$${live} is a REAL call from arm 5 and must not be counted as a deferral`);
    }
    assert.equal(keyed('26070C'), true, 'and $26070C is keyed, which is what "counted" means');
    assert.ok(/\$240B0E/.test(report), 'while $240B0E is still MENTIONED, by the reset-prologue '
      + 'note -- which is exactly the distinction the keyed check above draws');
  });

test('W392 SECTION 5d: the codec $25C60C has ONE caller and it is not arm 5', { skip: SKIP },
  () => {
    // $25C60C looks like part of arm 5 -- it sits between the init and the body, it reads
    // $812E90/$812E92/$812E94/$812E96 and it walks $812E98 and $812E9C. It is called from
    // NEITHER. Its single caller in the image is the raw input read.
    assert.equal(w(0x23d116), 0x4eb9, '$23D116 jsr abs.l');
    assert.equal(l(0x23d118), ARM5SCREEN.codec, '  ...$25C60C');
    assert.equal(w(0x23d10c), 0x4a39, '$23D10C tst.b abs.l');
    assert.equal(l(0x23d10e), 0x00803940, '  ...$803940, the vblank semaphore');
    // ...and it is inside $23D0F8, which input.js records as never executing in this port.
    assert.equal(w(0x23d0f8), 0x41f9, '$23D0F8 lea abs.l,A0');
    assert.equal(l(0x23d0fa), 0x00c08000, '  ...$C08000, the raw controller port');
  });

// ===============================================================================================
// SECTION 6 -- THE FOUR ROM WINDOWS, RE-DERIVED FROM THE CARTRIDGE.
// ===============================================================================================

test('W392 SECTION 6: every bound is stated by CODE, never by an absence (trap 8)', { skip: SKIP },
  () => {
    // 1. THE POINTER TABLE + ITS PAYLOAD. Data ends where code begins.
    assert.equal(ARM5SCREEN.ptrTable + ARM5SCREEN.tableBytes, ARM5SCREEN.clear,
      '$25C542 + $3C = $25C57E');
    assert.equal(w(ARM5SCREEN.clear), 0x41f9, '  ...which is `lea abs.l,A0`, the clear routine');
    assert.equal(l(ARM5SCREEN.clear + 2), ARM5SCREEN.clearBase, '  ...on $812E82');
    assert.equal(ARM5SCREEN.blocks[2] + ARM5SCREEN.blockBytes, ARM5SCREEN.clear,
      'the last $10-byte block ends there too, so the $3C is exact and not padded');
    // ...and its low end abuts W390's arm-9 load script. ABUTTING IS NOT OVERLAPPING.
    assert.equal(ARM9SCREEN.loadScript + 0x12, ARM5SCREEN.ptrTable,
      'W390\'s $25C530 + $12 = $25C542, the first byte of this window');

    // 2. THE PALETTE BANK. $2414BE copies eight longwords; W93's block ends where this begins.
    assert.equal(0x222778 + 0x80, ARM5SCREEN.palSrc, 'W93\'s $222778 + $80 = $2227F8');

    // 3. THE ANIMATION TABLE. The MASK is the bound.
    assert.equal(ARM5SCREEN.animMask + 1, ARM5SCREEN.animTableBytes,
      '$25C712 `andi.w #$F` caps the byte offset at $F, so $10 bytes and no more');
    assert.equal((ARM5SCREEN.animEntries - 1) * ARM5SCREEN.animStep + 4,
      ARM5SCREEN.animTableBytes, '  ...and $25C70C\'s addq of 4 only ever reaches 0, 4, 8 and '
      + '$C, where $25C6EA reads a LONG -- $C + 4 = $10, the same bound from the other side');
    assert.equal(ARM5SCREEN.animTable + ARM5SCREEN.animTableBytes, 0x25c818, '$25C808 + $10');
    assert.equal(w(0x25c818), 0x48e7, '  ...= $25C818, the `movem.l` opening the next routine');
    assert.equal(ARM5SCREEN.animEntries * 4, ARM5SCREEN.animTableBytes, 'four four-byte entries');
    // Each entry is a tile base $A8 past the last -- a real run, not four copies of one value.
    for (let i = 1; i < ARM5SCREEN.animEntries; i++) {
      assert.equal((l(ARM5SCREEN.animTable + i * 4) >>> 16)
        - (l(ARM5SCREEN.animTable + (i - 1) * 4) >>> 16), 0xa8,
      `entry [${i}]'s tile base is $A8 past entry [${i - 1}]'s`);
    }

    // 4. THE THREE REPLAY STREAMS. The $800 stride is stated twice.
    for (let i = 0; i < 3; i++) {
      assert.equal(l(ARM5SCREEN.blocks[i] + 8), ARM5SCREEN.demoScripts[i],
        `block [${i}]'s $812E98 pointer`);
      assert.equal(ARM5SCREEN.demoScripts[i],
        ARM5SCREEN.demoScripts[0] + i * ARM5SCREEN.scriptSpan, '  ...and it is $800 on');
    }
    assert.equal(w(0x25c62c), 0x0c47, '$25C62C cmpi.w #imm,D7');
    assert.equal(w(0x25c62e), ARM5SCREEN.scriptSpan, '  ...#$800 -- the codec\'s own end test');
    assert.equal(l(0x25c626) >>> 16, 0x3e39, '$25C626 move.w abs.l,D7...');
    assert.equal(l(0x25c628), ARM5SCREEN.codecOff, '  ...$812E96, so the $800 IS about the '
      + 'stream offset and not some unrelated word');
  });

test('W392 SECTION 6: the exported tables really carry all four windows, and add NO overlap',
  { skip: SKIP_T }, () => {
    const win = tablesJson.rom.windows.map((x) => [parseInt(String(x.base).replace('$', ''), 16),
      x.len]);
    const covers = (a, n) => win.some(([b, ln]) => b <= a && a + n <= b + ln);
    for (const [a, n, why] of [
      [ARM5SCREEN.ptrTable, 0x3c, 'the pointer table and its three blocks'],
      [ARM5SCREEN.palSrc, 0x20, 'TX palette bank 12'],
      [ARM5SCREEN.animTable, 0x10, 'the animation table'],
      [ARM5SCREEN.demoScripts[0], 0x1800, 'the three replay streams'],
    ]) {
      assert.ok(covers(a, n), `$${a.toString(16).toUpperCase()}+$${n.toString(16).toUpperCase()
      } (${why}) is not fully inside a declared window`);
    }
    // NO OVERLAPS ADDED. Counted across the WHOLE set, with and without the four.
    const mine = new Set(['25c542,60', '2227f8,32', '25c808,16', '239fb8,6144']);
    const key = ([a, n]) => `${a.toString(16)},${n}`;
    const pairs = (ws) => {
      let n = 0;
      for (let i = 0; i < ws.length; i++) {
        for (let j = i + 1; j < ws.length; j++) {
          if (ws[i][0] < ws[j][0] + ws[j][1] && ws[j][0] < ws[i][0] + ws[i][1]) n++;
        }
      }
      return n;
    };
    const without = win.filter((x) => !mine.has(key(x)));
    assert.equal(win.length - without.length, 4, 'all four are in the exported list');
    assert.equal(pairs(win), pairs(without),
      'and the overlapping-pair count across the whole window set is IDENTICAL with and without '
      + 'them. Four new windows, zero new overlaps -- never widen, always declare');
  });
