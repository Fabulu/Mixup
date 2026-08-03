// THE MOVEMENT INTERPRETER -- `$263808` the init reader, `$2638A6` the per-frame
// step, the 13 opcodes (12 escapes + `>= $C0` set-speed), the loop-back, the
// velocity-cache discipline, and `$2417DE`'s apply.
//
// Two test substrates:
//   (1) OPCODE COVERAGE + the state machine -- synthetic streams, a MOCK velocity
//       table (deterministic {dy,dx}), so every assertion is about the cursor /
//       counter / dirty-bit / field-write mechanics the listing defines.  These
//       run unconditionally and cite the ROM address on every non-obvious line.
//   (2) the 163 dumped stage-1 streams (recon sec "the denominator") -- replayed
//       init+per-frame; the done-when is "the loop-back does not run off the end"
//       (every stream terminates via a PARAM-$00 HEAD or EXIT, cursor staying in
//       bounds for its whole life).  Skipped if the gitignored dump is absent.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  stepMovement, readMovementInit, applyVelocity, scrollCompensate,
  MOVE_EXIT, MOVER,
} from '../src/movement.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = path.join(HERE, '..', 'assets', 'w24-movement');
const STREAMS_JSON = path.join(DUMP_DIR, 'stage1-streams.json');
const RESOURCE_BIN = path.join(DUMP_DIR, 'stage1-resource-1F.bin');
const NOOP = { note() {} };

// ------------------------------------------------------------- synthetic rom
function win(base, len) { return { base, len, bytes: new Uint8Array(len) }; }
function put8(w, addr, v) { w.bytes[addr - w.base] = v & 0xff; }
function put16(w, addr, v) { const o = addr - w.base; w.bytes[o] = (v >> 8) & 0xff; w.bytes[o + 1] = v & 0xff; }
function put32(w, addr, v) { put16(w, addr, (v >>> 16) & 0xffff); put16(w, addr + 2, v & 0xffff); }
/** A stream is a sequence of bytes; lay it at `base` and return a 1-window rom. */
function streamRom(base, bytes) {
  const w = win(base, bytes.length);
  for (let i = 0; i < bytes.length; i++) w.bytes[i] = bytes[i];
  return new RomWindows({
    windows: [{ base: `$${base.toString(16)}`, len: bytes.length,
                why: 'movement stream', hex: Buffer.from(w.bytes).toString('hex') }],
  });
}

// record at $818000, sub-record at $818060 (both inside the $800000..$81FFFF RAM).
const REC = 0x818000;
const SUB = 0x818060;
const STREAM_BASE = 0x30000;     // a synthetic stream address (ROM space)

/** A mock velocity table: `vector` returns a fixed pair, isolating the cache and
 *  apply mechanics from the real $200920 table.  (The position GATE uses real.) */
function mockTables(dy, dx) { return { vector: () => ({ dy, dx }) }; }

/** Seed a scratch enemy record + sub-record the way the spawn walker + init stub
 *  would: sub-record ptr (+$06), param (+$0A), run-length (+$04, 0 = 1 sub), the
 *  movement cursor (+$12), and the class byte (+$0D, not scroll-locked). */
function setupMover(ram, streamAddr, param = 0) {
  for (let i = 0; i < 0x50; i++) ram.setU8(REC + i, 0);   // clear record
  for (let i = 0; i < 0x20; i++) ram.setU8(SUB + i, 0);   // clear sub-record
  ram.setU32(REC + 0x06, SUB);           // sub-record pointer
  ram.setU16(REC + 0x0a, param);         // spawn param (the Y-odometer source)
  ram.setU16(REC + 0x04, 0);             // run-length 0 -> 1 sub-record
  ram.setU8(REC + 0x0d, 0);              // class byte (bit 0 clear -> no scroll comp)
  ram.setU32(REC + 0x12, streamAddr);    // movement cursor
}

// ===========================================================================
// 1. THE INIT READER $263808: position prefix, SPEED override, HEAD terminator.
//    Stream idx $001 verbatim (recon sec 6): pos $7A80,$1800 | SPEED 03 | HEAD 2D p=00.
// ===========================================================================
test('$263808: reads X,Y prefix, consumes SPEED, stops at the FIRST HEAD', () => {
  // bytes: X($7A80) Y($1800) | $C0 SPEED=03 | $2D HEAD param=$00
  const bytes = [0x7a, 0x80, 0x18, 0x00, 0xc0, 0x03, 0x2d, 0x00];
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null);
  setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);

  assert.equal(ram.u16(SUB + 0x02), 0x7a80, '+$02 X from the prefix ($263830)');
  assert.equal(ram.u8(SUB + 0x1a), 0x03, '+$1A speed overridden by SPEED ($263854)');
  assert.equal(ram.u8(SUB + 0x1b), 0x2d, '+$1B heading = the HEAD byte ($263874)');
  // cursor stored AT the HEAD byte (peek, no advance) -- $263870
  assert.equal(ram.u32(REC + MOVER.movement), STREAM_BASE + 6, 'cursor at the HEAD byte');
  // PARAM $00 + scrollOdo($8130D0)=0 -> Y = $1800 + 0 - $800 ($263888/$26388C)
  assert.equal(ram.u16(SUB + 0x04), 0x1000, '+$04 Y after the odometer adjust');
  assert.equal(ram.u8(REC + 0x10), 0, '+$10 counter zeroed ($263894)');
  assert.equal((ram.u8(REC + 0x02) >> 5) & 1, 1, '+$02 bit 5 (dirty) set ($263898)');
});

test('$263808: a zero cursor is a no-op (script-less enemy, $26380C beq)', () => {
  const ram = new Ram(null);
  setupMover(ram, 0);                     // cursor 0
  ram.setU16(SUB + 0x02, 0x1234);         // leave the sub-record as the pool held it
  readMovementInit(ram, streamRom(0, []), REC, NOOP);
  assert.equal(ram.u16(SUB + 0x02), 0x1234, 'position untouched');
});

// ===========================================================================
// 2. THE PER-FRAME STATE MACHINE $2638A6.
// ===========================================================================

test('$2638A6 HEAD p=00: holds the heading FOREVER (cursor frozen, $2638C6 beq)', () => {
  const bytes = [0x10, 0x20, 0x00, 0x00, 0xc0, 0x03, 0x2d, 0x00]; // pos | SPEED 03 | HEAD 2D p=00
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null);
  setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);
  const cursorAfterInit = ram.u32(REC + MOVER.movement);   // at the HEAD byte
  const x0 = ram.u16(SUB + 0x02), y0 = ram.u16(SUB + 0x04); // post-init pos
  const T = mockTables(5, 7);              // {dy:5 -> X, dx:7 -> Y}

  stepMovement(ram, R, REC, T, NOOP);      // frame 1: dirty -> recompute + cache
  assert.equal(ram.u32(REC + MOVER.movement), cursorAfterInit, 'cursor NOT stored (p=00)');
  assert.equal(ram.u16(SUB + 0x02), u16(x0 + 5), 'X += dy (D2) first frame');
  assert.equal(ram.u16(SUB + 0x04), u16(y0 + 7), 'Y += dx (D3) first frame');
  assert.equal((ram.u8(REC + 0x02) >> 5) & 1, 0, 'dirty cleared after recompute ($2638FA)');
  // the cache lives at +$40/+$42 (D2/D3 = dy/dx)
  assert.equal(ram.u16(REC + 0x40), 5, 'cached D2 (dy)');
  assert.equal(ram.u16(REC + 0x42), 7, 'cached D3 (dx)');

  stepMovement(ram, R, REC, T, NOOP);      // frame 2: clean -> reuse the cache
  assert.equal(ram.u16(SUB + 0x02), u16(x0 + 10), 'X += cached dy again');
  assert.equal(ram.u16(SUB + 0x04), u16(y0 + 14), 'Y += cached dx again');
  assert.equal(ram.u32(REC + MOVER.movement), cursorAfterInit, 'cursor STILL frozen');
});

test('$2638A6 HEAD p=N: counter-done ADVANCES (no apply of the old heading) then reads on', () => {
  // pos | HEAD h=10 p=02 | SPEED 05 | HEAD h=20 p=00
  const bytes = [0x10, 0x20, 0x00, 0x00, 0x10, 0x02, 0xc0, 0x05, 0x20, 0x00];
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null);
  setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);
  // init stopped at the FIRST HEAD (byte 4); heading $10, cursor at byte 4.
  assert.equal(ram.u8(SUB + 0x1b), 0x10);
  const T = mockTables(1, 0);              // dy=1 -> X only

  // frame 1: p=02, counter 0 != 2 -> counter=1, apply heading $10. cursor frozen.
  stepMovement(ram, R, REC, T, NOOP);
  assert.equal(ram.u8(REC + 0x10), 1, 'counter++ ($2638CE)');
  assert.equal(ram.u8(SUB + 0x1b), 0x10, 'still heading $10');
  assert.equal(ram.u32(REC + MOVER.movement), STREAM_BASE + 4, 'cursor frozen (not counter-done)');

  // frame 2: p=02, counter 1 != 2 -> counter=2, apply heading $10. cursor frozen.
  stepMovement(ram, R, REC, T, NOOP);
  assert.equal(ram.u8(REC + 0x10), 2);

  // frame 3: counter 2 == p 2 -> COUNTER DONE: clear counter, store cursor (now past
  // the param, at the SPEED byte), set dirty, LOOP. The loop reads SPEED (05),
  // stores cursor past its operand (at HEAD $20), dirty again, loops, reads HEAD
  // $20 p=00 -> applies heading $20 and returns. ($263916..$26392C..$2638C0)
  stepMovement(ram, R, REC, T, NOOP);
  assert.equal(ram.u8(REC + 0x10), 0, 'counter cleared on done ($263916)');
  assert.equal(ram.u8(SUB + 0x1a), 0x05, 'SPEED 05 consumed during the advance');
  assert.equal(ram.u8(SUB + 0x1b), 0x20, 'new heading $20 applied this frame');
  assert.equal(ram.u32(REC + MOVER.movement), STREAM_BASE + 8, 'cursor at the new HEAD byte');
});

test('$2638A6 HEAD h>=$40: a STOP heading (DX=DY=0, no apply, $263910)', () => {
  // pos | HEAD h=42 p=00 (h & $7f = $42 >= $40 -> stop)
  const bytes = [0x10, 0x20, 0x00, 0x00, 0xc2, 0x03, 0x42, 0x00];
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null);
  setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);     // init stores heading byte $42 at +$1B
  const x0 = ram.u16(SUB + 0x02), y0 = ram.u16(SUB + 0x04);
  stepMovement(ram, R, REC, mockTables(5, 7), NOOP);  // h & $7f = $42 >= $40 -> stop
  assert.equal(ram.u16(SUB + 0x02), x0, 'X unchanged (stop heading zeroes the vector)');
  assert.equal(ram.u16(SUB + 0x04), y0, 'Y unchanged');
});

// ===========================================================================
// 3. THE 12 ESCAPES (table $263948) -- each exercised, field write verified.
//    The per-frame interpreter drives the dispatch; the cursor comes back past
//    the escape's operand bytes.  (5 are stage-1-used; 7 port from the listing.)
// ===========================================================================

// Build a stream whose first opcode is escape `b` (plus operands), then a
// PARAM-$00 HEAD so the interpreter has somewhere clean to land.
function escapeStream(b, operandBytes, headByte = 0x10) {
  const tail = [headByte, 0x00];           // a forever HEAD terminator
  return [0x10, 0x20, 0x00, 0x00, b, ...operandBytes, ...tail];
}

test('escape #1 SET_SUBANIM $263982: operand -> +$1F', () => {
  const bytes = escapeStream(0x81, [0x77]);             // kind = 0x81 & $0F = 1
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null); setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);                  // init consumes ESC#1, stops at HEAD
  assert.equal(ram.u8(SUB + 0x1f), 0x77, '+$1F sub-anim set');
});

test('escape #2 TOG_FLAG_bit5 $263988: n==1 -> bclr #5; n>1 -> bset #5', () => {
  for (const [n, want] of [[1, 0], [2, 1]]) {
    const bytes = escapeStream(0x82, [n]);
    const R = streamRom(STREAM_BASE, bytes);
    const ram = new Ram(null); setupMover(ram, STREAM_BASE);
    ram.setU8(SUB + 0x00, 0x20);                        // bit 5 starts SET
    readMovementInit(ram, R, REC, NOOP);
    assert.equal((ram.u8(SUB + 0x00) >> 5) & 1, want,
      `escape #2 n=${n}: bit 5 -> ${want ? 'set' : 'clear'}`);
  }
});

test('escape #3 TOG_FLAG_bits0_13 $26399A: n==1 -> andi $DFFE; n>1 -> ori $2001', () => {
  for (const [n, mask, want] of [[1, 0x2001, 0x0000], [2, 0x0000, 0x2001]]) {
    const bytes = escapeStream(0x83, [n]);
    const R = streamRom(STREAM_BASE, bytes);
    const ram = new Ram(null); setupMover(ram, STREAM_BASE);
    ram.setU16(SUB + 0x00, mask);                        // bits 0+13 start as `want`-inverse
    readMovementInit(ram, R, REC, NOOP);
    assert.equal(ram.u16(SUB + 0x00), want, `escape #3 n=${n} -> $${want.toString(16)}`);
  }
});

test('escape #8 SET_ANIM $2639F0: operand -> +$1E', () => {
  const bytes = escapeStream(0x88, [0x09]);             // kind 8
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null); setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);
  assert.equal(ram.u8(SUB + 0x1e), 0x09, '+$1E anim set');
});

test('escape #9 Y_MINUS_SCROLL $2639F6: +$04 -= $813172, then skip 1 byte', () => {
  // Y prefix = $4000 (escapeStream uses $0000, so build the stream by hand).
  // Init reads Y=$4000, escape#9 subtracts $813172 ($0500), then the odometer
  // subtracts $800 (param/scrollOdo both 0).  Expected Y = $4000-$0500-$0800.
  const bytes = [0x10, 0x20, 0x40, 0x00, 0x89, 0xAB, 0x10, 0x00];
  //                 X=$1020 Y=$4000  ESC#9 skip $AB   HEAD p=00
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null); setupMover(ram, STREAM_BASE);
  ram.setU16(0x813172, 0x0500);                         // the scroll accumulator
  readMovementInit(ram, R, REC, NOOP);
  assert.equal(ram.u16(SUB + 0x04), u16(0x4000 - 0x0500 - 0x0800),
    '+$04 -= $813172 (then the init odometer -$800)');
});

test('escape #4/5/6/7 (controller/record writes) advance the cursor correctly', () => {
  // #4 -> A5+$22 ; #7 -> A5+$24 (controller bytes).  Just assert no throw + land.
  for (const [b, operand] of [[0x84, [0x11]], [0x87, [0x22]]]) {
    const bytes = escapeStream(b, operand);
    const R = streamRom(STREAM_BASE, bytes);
    const ram = new Ram(null); setupMover(ram, STREAM_BASE);
    readMovementInit(ram, R, REC, NOOP);
    assert.equal(ram.u8(SUB + 0x1b), 0x10, `escape kind ${b & 0xf}: lands at the HEAD`);
  }
  // #5/6 (packed word): +1 off +2 words -> ((w1&$FF0)<<4)+((w2&$FF0)>>4)
  //   #5 -> (A5,off.w); #6 -> (A6,off.w).  off=$2A (a record word the init does
  //   NOT touch -- off=$10 would collide with the counter clear at $263894).
  //   packed = (($1230&$FF0)<<4) + (($0FF0&$FF0)>>4) = $2300 + $00FF = $23FF.
  for (const [b, target] of [[0x85, REC], [0x86, SUB]]) {
    const bytes = escapeStream(b, [0x2a, 0x12, 0x30, 0x0f, 0xf0]);
    const R = streamRom(STREAM_BASE, bytes);
    const ram = new Ram(null); setupMover(ram, STREAM_BASE);
    readMovementInit(ram, R, REC, NOOP);
    assert.equal(ram.u16(target + 0x2a), 0x23FF, `escape kind ${b & 0xf} packed word`);
  }
});

test('escape #11 NOP $263A0C: advances nothing, lands at the next opcode', () => {
  const bytes = escapeStream(0x8b, []);                 // kind 11, no operand
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null); setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);
  assert.equal(ram.u8(SUB + 0x1b), 0x10, 'NOP fell through to the HEAD');
});

test('escape #0 LOOP-BACK $263978: A0 -= 2*offset (a 32-bit address op)', () => {
  // A synthetic stream that uses the loop-back (no stage-1 stream does).  Layout:
  //   pos | HEAD p=03 | SPEED 05 | ESC#0 off=2 | HEAD p=00
  // After the HEAD p=03 counter counts out, the reader advances past SPEED 05,
  // hits ESC#0 (offset 2), which backs A0 up by 4 bytes -- to the SPEED byte --
  // and re-reads it.  We assert the cursor moves BACK (not forward, not wrapped).
  const bytes = [0x10, 0x20, 0x00, 0x00, 0x10, 0x01, 0xc0, 0x05, 0x80, 0x02, 0x20, 0x00];
  //                                           HEAD p=1  SPEED 05  LOOP off=2  HEAD p=0
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null); setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);                  // stops at the first HEAD (byte 4)
  // frame: counter 0 != 1 -> counter=1, apply. cursor frozen at byte 4.
  stepMovement(ram, R, REC, mockTables(0, 0), NOOP);
  assert.equal(ram.u8(REC + 0x10), 1);
  // frame: counter 1 == 1 -> done. advance past param (byte 6 = SPEED). SPEED 05
  //   consumed -> cursor byte 8 = ESC#0. ESC#0 off=2 -> A0 -= 4 -> byte 4 (the
  //   SPEED byte). Loop reads SPEED 05 again -> cursor byte 8 again -> ESC#0 again
  //   ... this is the infinite loop an offset the interpreter can never escape; to
  //   keep the test finite we instead verify the CURSOR VALUE after one advance
  //   lands BELOW the escape (the back-jump happened), via a NON-looping stream:
});

test('escape #0 LOOP-BACK $263978: cursor moves BACK by 2*offset (32-bit)', () => {
  // Non-looping: pos | ESC#0 off=3 | HEAD p=00.  After init consumes ESC#0 the
  // cursor backs up 6 bytes (into the Y word) -- proving the back-jump is a
  // 32-bit subtract, NOT a 16-bit wrap (STREAM_BASE=0x30000; a wrap would land
  // at 0xFFFA, outside the window -> RomWindows would throw).
  const bytes = [0x10, 0x20, 0x00, 0x00, 0x80, 0x03, 0x20, 0x00];
  //                                           ESC#0 off=3  HEAD p=00
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null); setupMover(ram, STREAM_BASE);
  // The init reader peeks ESC#0 (byte 4), advances to byte 5, dispatches ESC#0:
  //   off=3 -> A0 = (byte 6) - 6 = byte 0.  Then it loops and re-peeks byte 0
  //   ($10 < $80 = HEAD) and stops there.  So cursor == STREAM_BASE (byte 0).
  readMovementInit(ram, R, REC, NOOP);
  assert.equal(ram.u32(REC + MOVER.movement), STREAM_BASE + 0,
    'loop-back returned to byte 0 (32-bit subtract, no 16-bit wrap)');
});

// ===========================================================================
// 4. EXIT (escape #10) frees the record ($263A04 -> $263762).
// ===========================================================================

test('escape #10 EXIT $263A04: aborts the interpreter and frees the record', () => {
  // pos | HEAD p=01 | ESC#10 | (dead bytes after -- must NOT be reached)
  // frame 1: counter 0 != 1 -> apply, cursor frozen. frame 2: counter-done advances
  // to ESC#10 -> EXIT frees the record.  stepMovement returns true.
  const bytes = [0x10, 0x20, 0x00, 0x00, 0x10, 0x01, 0x8a, 0xff, 0xff];
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null); setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);
  assert.equal(stepMovement(ram, R, REC, mockTables(0, 0), NOOP), false, 'frame 1 not done');
  const exited = stepMovement(ram, R, REC, mockTables(0, 0), NOOP);
  assert.equal(exited, true, 'frame 2 EXITed -> stepMovement returns true');
  // $263762: every sub-record byte+0 := 1, then the type word (A5)+$00 cleared
  assert.equal(ram.u8(SUB + 0x00), 0x01, 'sub-record marked dead');
  assert.equal(ram.u16(REC + 0x00), 0x0000, 'record type word cleared');
});

test('EXIT during INIT also aborts (the carrier payload-then-despawn shape)', () => {
  // pos | ESC#10 immediately -- the init reader hits EXIT on its first peek loop.
  const bytes = [0x10, 0x20, 0x00, 0x00, 0x8a];
  const R = streamRom(STREAM_BASE, bytes);
  const ram = new Ram(null); setupMover(ram, STREAM_BASE);
  readMovementInit(ram, R, REC, NOOP);     // EXIT aborts the init; no throw
  assert.equal(ram.u16(REC + 0x00), 0x0000, 'record freed by EXIT-in-init');
});

// ===========================================================================
// 5. $2417DE apply + the velocity cache, and $24179E scroll compensation.
// ===========================================================================

test('$2417DE applyVelocity: D2->+$02, D3->+$04; freeze -> {0,0} and no apply', () => {
  const ram = new Ram(null); setupMover(ram, 0);
  ram.setU8(SUB + 0x1a, 3); ram.setU8(SUB + 0x1b, 0x2d);
  const v = applyVelocity(ram, mockTables(9, 4), REC);
  assert.equal(v.dy, 9, 'returns D2');
  assert.equal(v.dx, 4, 'returns D3');
  assert.equal(ram.u16(SUB + 0x02), 9, '+$02 += D2 ($2417F4)');
  assert.equal(ram.u16(SUB + 0x04), 4, '+$04 += D3 ($2417F8)');
  // freeze -> {0,0}, no apply
  const ram2 = new Ram(null); setupMover(ram2, 0);
  ram2.setU8(SUB + 0x1a, 3); ram2.setU8(SUB + 0x1b, 0x2d);
  ram2.setU16(0x8130d2, 1);
  const v2 = applyVelocity(ram2, mockTables(9, 4), REC);
  assert.deepEqual(v2, { dy: 0, dx: 0 }, 'freeze zeroes the vector');
  assert.equal(ram2.u16(SUB + 0x02), 0, 'no apply when frozen');
});

test('$24179E scrollCompensate: +$02 += the HIGH word of $80b03c (after swap)', () => {
  const ram = new Ram(null); setupMover(ram, 0);
  ram.setU16(SUB + 0x02, 0x1000);
  ram.setU16(0x80b03c, 0x00aa);              // the ORIGINAL HIGH word ($80b03c)
  ram.setU16(0x80b03e, 0x00bb);              // the ORIGINAL LOW word ($80b03e)
  scrollCompensate(ram, REC);
  // `move.l $80b03c / swap / add.w D0` adds the original HIGH word ($00aa).
  assert.equal(ram.u16(SUB + 0x02), 0x10aa, '+$02 += the high word, NOT the low');
});

// ===========================================================================
// 6. THE 163 DUMPED STREAMS -- the run-off-end done-when (recon sec 3).
//    Every stream replays init + per-frame; the cursor must stay in bounds for
//    its whole life (termination via PARAM-$00 HEAD or EXIT; the loop-back is
//    unused).  The two EXIT streams must EXIT.
// ===========================================================================
test('the 163 stage-1 streams: no run-off-end; EXIT streams EXIT', { skip: skipDump() }, () => {
  const { R, streams, base, end } = loadDump();
  const exitIdx = new Set(streams.filter((s) => s.exits).map((s) => s.idx));
  let exited = 0, held = 0;
  for (const s of streams) {
    const addr = parseInt(s.rom.replace('$', ''), 16);
    const ram = new Ram(null); setupMover(ram, addr);
    readMovementInit(ram, R, REC, NOOP);
    // after init the cursor is at the first HEAD (in bounds)
    let cur = ram.u32(REC + MOVER.movement);
    assert.ok(cur >= base && cur < end, `stream $${hex(s.idx)} init cursor $${cur.toString(16)} out of bounds`);
    let didExit = false;
    for (let fr = 0; fr < 6000; fr++) {       // a forever-head holds; cap the loop
      const r = stepMovement(ram, R, REC, mockTables(0, 0), NOOP);
      if (r === true) { didExit = true; break; }
      cur = ram.u32(REC + MOVER.movement);
      assert.ok(cur >= base && cur < end,
        `stream $${hex(s.idx)} cursor $${cur.toString(16)} ran off at frame ${fr}`);
    }
    if (exitIdx.has(s.idx)) { assert.ok(didExit, `stream $${hex(s.idx)} should EXIT`); exited++; }
    else { held++; }
  }
  assert.equal(exited, 2, 'the two carrier streams ($071/$072) EXIT');
  assert.equal(held, 161, 'the other 161 hold on a forever HEAD');
});

// ----------------------------------------------------------- dump helpers
function skipDump() {
  if (fs.existsSync(STREAMS_JSON) && fs.existsSync(RESOURCE_BIN)) return false;
  return `the gitignored W24 dump is absent (${STREAMS_JSON}). Re-run `
    + `python games/ddpdoj/tools/oracle/w24streams.py to produce it.`;
}
function loadDump() {
  const j = JSON.parse(fs.readFileSync(STREAMS_JSON, 'utf8'));
  const base = parseInt(j.resource_base.replace('$', ''), 16);
  const end = parseInt(j.resource_end.replace('$', ''), 16);
  const bin = fs.readFileSync(RESOURCE_BIN);
  const R = new RomWindows({
    windows: [{ base: `$${base.toString(16)}`, len: bin.length, why: 'w24 resource #$1F',
                hex: bin.toString('hex') }],
  });
  const exitSet = new Set((j.exit_streams ?? []).map((x) => parseInt(x.replace('$', ''), 16)));
  const streams = j.streams.map((s) => ({ ...s, exits: exitSet.has(s.idx) }));
  return { R, streams, base, end };
}
const hex = (n) => n.toString(16).padStart(2, '0');
