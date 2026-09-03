// WAVE 111 -- THE BEE (yellow medal), pool A's reserved ten.
//
// EVERY EXPECTED VALUE HERE IS DERIVED FROM THE ROM LISTING or from the
// arithmetic the port transcribes, never from running the port and writing
// down what came out.  The four must-fail checks from the brief, each seen RED
// then GREEN:
//
//   1. Spawn + drive + draw: allocBee27F92A bumps $817F7E 0->1, slot holds
//      $8004; the driver sets sprite $1BCA34 and emits; 3 frames later $1BCA80.
//   2. Collect + score: block 3 flags the bee (idx < 80 fix), the driver's
//      collect arm reads the bit and awards base x hits via $286128.
//   3. Off-screen free: a bee past the playfield boundary is freed and the
//      live count decrements.
//   4. Refusal: a non-bee kind in the pool THROWS by address, does not no-op.

import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import {
  POOL_A, B, KIND, allocBee27F92A, runPoolADriver, clearPoolA,
} from '../src/bee.js';
import { DMG, impactCollisionBlock } from '../src/damage.js';
import { LEDGER } from '../src/score.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TABLE_JSON = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TABLE_JSON.rom) : null;
const MT = HAVE ? new MoveTables(TABLE_JSON, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const u16 = (v) => v & 0xffff;

/** Zero the bee pool and all trailing words, then return the ram. */
function freshRam() {
  const ram = new Ram();
  for (let i = 0; i < POOL_A.clearWords * 2; i++) {       // zero all 80 slots + trailing
    ram.setU8(POOL_A.base + i, 0);
  }
  ram.setU16(POOL_A.scrollShort, 0);                      // $813176 = 0 (no X scroll)
  ram.setU16(0x813172, 0);                                // Y scroll = 0
  ram.setU16(POOL_A.freeze, 0);                           // not frozen
  ram.setU8(POOL_A.twoPlayer, 0);                         // 1P mode
  ram.setU16(POOL_A.noMissP1, 0);                         // no-miss (P1 not hit)
  ram.setU16(POOL_A.noMissP2, 0);
  ram.setU16(POOL_A.cursor, 0);                           // fresh cursor
  ram.setU16(POOL_A.beeCount, 0);                         // fresh count
  return ram;
}

/** A minimal context with an unported log that swallows notes. */
function ctxOf(ram) {
  return { ram, rom: ROM, tables: MT, unportedLog: new UnportedLog() };
}

/** Write a bee record directly into a reserved-ten slot, bypassing the
 *  allocator (for tests that need a pre-seeded bee). */
function seedBee(ram, slotIdx, over = {}) {
  const a6 = POOL_A.reservedBase + slotIdx * POOL_A.stride;
  const o = {
    status: KIND.bee | 0x8000,                            // allocated | kind 1
    pos: 0x40002000,                                      // on-screen Y=$4000 X=$2000
    sprite: 0x001bca34,
    blinkTimer: 0,
    layerEmitter: 0x23d762,
    hitLongA: 0x0980, hitLongB: 0x0980,
    hitShortA: 0x0780, hitShortB: 0x0780,
    hitCount: 0x9601,
    ...over,
  };
  ram.setU16(a6 + B.status, o.status);
  ram.setU32(a6 + B.pos, o.pos);
  ram.setU32(a6 + B.sprite, o.sprite);
  ram.setU16(a6 + B.blinkTimer, o.blinkTimer);
  ram.setU32(a6 + B.layerEmitter, o.layerEmitter);
  ram.setU16(a6 + B.hitLongA, o.hitLongA);
  ram.setU16(a6 + B.hitLongB, o.hitLongB);
  ram.setU16(a6 + B.hitShortA, o.hitShortA);
  ram.setU16(a6 + B.hitShortB, o.hitShortB);
  ram.setU16(a6 + B.hitCount, o.hitCount);
  ram.setU16(POOL_A.liveCount, ram.u16(POOL_A.liveCount) + 1);
  return a6;
}

// ============================================================ MUST-FAIL 1
// Spawn + drive + draw.  RED: before the port, $817F7E was always 0 (the
// allocator and driver were counted notes).  GREEN: the allocator bumps the
// count, the driver emits the sprite.

test('MUST-FAIL 1: spawn bumps $817F7E 0->1 and slot holds $8004', { skip: SKIP }, () => {
  const ram = freshRam();
  const ctx = ctxOf(ram);
  // Carrier sub-record at an on-screen position.
  const carrierA6 = 0x815000;
  ram.setU32(carrierA6 + B.pos, 0x40002000);              // Y=$4000 X=$2000 (on-screen)
  ram.setU8(carrierA6 + 0x1f, 0);                         // layer byte 0 -> bucket 0
  assert.equal(ram.u16(POOL_A.liveCount), 0);
  const slot = allocBee27F92A(ram, ROM, ctx, KIND.bee, 0, carrierA6);
  assert.ok(slot, 'the allocator returned a slot');
  assert.equal(slot, POOL_A.reservedBase, 'the first reserved-ten slot');
  assert.equal(ram.u16(POOL_A.liveCount), 1, '$817F7E bumped 0 -> 1');
  assert.equal(ram.u16(slot + B.status), 0x8004,
    'status = allocated ($8000) | kind 1 ($0004)');
  assert.equal(ram.u32(slot + B.sprite), 0x001bca34,
    'sprite descriptor from template');
});

test('MUST-FAIL 1b: driver sets sprite $1BCA34 and emits; blink at frame 3',
  { skip: SKIP }, () => {
  const ram = freshRam();
  const ctx = ctxOf(ram);
  const a6 = seedBee(ram, 0);
  // Frame 1: the driver runs the idle step.  blinkTimer starts at 0, so it
  // underflows on the FIRST subq -> BLINK ($1BCA80) immediately, reload 2.
  // Wait -- template init is $0000, so: subq $0000 -> $FFFF (borrow) -> blink.
  // So frame 1 shows the BLINK frame, not frame A.  Frame 2: timer 2->1, A.
  // Frame 3: timer 1->0, A.  Frame 4: timer 0->underflow, BLINK.  But the
  // idle step ALWAYS sets sprite A first, then conditionally B.  So:
  //   F1: A then B (blink). F2: A. F3: A. F4: A then B.
  const t1 = runPoolADriver(ram, ROM, ctx);
  assert.equal(t1.emitted, 1, 'the bee emitted through the layer stub');
  // After frame 1: timer underflowed from 0 -> blink happened.
  assert.equal(ram.u16(a6 + B.blinkTimer), 2, 'blink timer reloaded to 2');
  assert.equal(ram.u32(a6 + B.sprite), 0x001bca80, 'frame B on the blink');

  // Frame 2: timer 2->1, no blink.
  runPoolADriver(ram, ROM, ctx);
  assert.equal(ram.u32(a6 + B.sprite), 0x001bca34, 'frame A (no blink)');

  // Frame 3: timer 1->0, no blink.
  runPoolADriver(ram, ROM, ctx);
  assert.equal(ram.u32(a6 + B.sprite), 0x001bca34, 'still frame A');

  // Frame 4: timer 0->underflow -> BLINK again.
  runPoolADriver(ram, ROM, ctx);
  assert.equal(ram.u32(a6 + B.sprite), 0x001bca80, 'frame B blink again (20 Hz)');
});

// ============================================================ MUST-FAIL 2
// Collect + score.  RED: block 3 was capped at idx < 70, so bees in the
// reserved ten (slots 70-79) were INVISIBLE to collision.  GREEN: the cap is
// 80, block 3 flags the bee, the driver's collect arm scores through $286128.

test('MUST-FAIL 2a: block 3 (idx<80 fix) flags a bee in the reserved ten',
  { skip: SKIP }, () => {
  const ram = freshRam();
  // Seed a bee in slot 70 (the FIRST reserved-ten slot = $817DC6).
  const a6 = seedBee(ram, 0);
  assert.equal(a6, POOL_A.reservedBase, 'slot is at $817DC6 = slot 70 of 80');
  // Set the player mask for P1 ($1000 = bit 12).
  ram.setU16(DMG.fa72, 0x1000);
  // Build a player box that overlaps the bee at Y=$4000 X=$2000 with hitbox
  // extents $0980/$0980 (long) and $0780/$0780 (short).  D7 = $2800 (the
  // collision pass's bias).  From playerBox: d0=Y+hitYPlus (bottom/max),
  // d1=Y-hitYMinus (top/min), d2=X+hitXPlus (right/max), d3=X-hitXMinus (left).
  // Bee Y edges with d7: top=$4000+$2800-$0980=$5E80, bottom=$7100.
  // Bee X edges with d7: left=$2000+$2800-$0780=$4080, right=$4F80.
  // Player at same coords with $1000 half-extents (biased by d7):
  const d7 = 0x2800;
  const box = {
    d0: u16(0x4000 + d7 + 0x1000),                        // Y bottom (>= $5E80)
    d1: u16(0x4000 + d7 - 0x1000),                        // Y top (<= $7100)
    d2: u16(0x2000 + d7 + 0x1000),                        // X right (>= $4080)
    d3: u16(0x2000 + d7 - 0x1000),                        // X left (<= $4F80)
  };
  const flagged = impactCollisionBlock(ram, box, d7);
  assert.equal(flagged, 1, 'block 3 flagged exactly one bee');
  assert.equal(ram.u16(a6 + B.status) & 0x1000, 0x1000,
    'P1 touch bit (12) set by block 3');
});

test('MUST-FAIL 2b: collect arm awards base x hits via $286128 (5 hits -> 500)',
  { skip: SKIP }, () => {
  const ram = freshRam();
  const ctx = ctxOf(ram);
  // Seed a bee that P1 has ALREADY touched (bit 12 set by block 3 on frame N).
  const a6 = seedBee(ram, 0, { status: KIND.bee | 0x8000 | 0x1000 });
  // Set chain meter non-zero and chain hits = 5 for the digit-multiply path.
  ram.setU16(POOL_A.chainMeterP1, 0x0100);               // non-zero -> chain path
  ram.setU16(POOL_A.chainHitsP1, 5);                      // 5 hits
  // P1 pending score starts at 0.  The accumulator is 4 bytes at
  // $81B4C0..$81B4C3 (pendingEnd = $81B4C4 = one past).
  ram.setU32(LEDGER.p1.pendingEnd - 4, 0);               // clear the accumulator
  const before = ram.u32(LEDGER.p1.pendingEnd - 4);
  assert.equal(before, 0);
  // Run the driver: the body reads bit 12, runs the P1 collect arm.
  const t = runPoolADriver(ram, ROM, ctx);
  assert.equal(t.collected, 1, 'one bee collected');
  // The award: base $100 x 5 hits = 5 calls to scoreByMask with $100 each.
  // After 5 BCD additions of $00000100: pendingEnd = $00000500 (BCD 500).
  const after = ram.u32(LEDGER.p1.pendingEnd - 4);
  assert.equal(after, 0x00000500,
    `P1 pending = BCD $0500 = 500 (was $${after.toString(16).toUpperCase()})`);
  // The "already collected" bit is set.
  assert.equal(ram.u8(a6 + 0x01) & 0x01, 0x01, 'bit 0 set (collected)');
});

test('MUST-FAIL 2c: flat award when no chain active (base x 1 = 100)',
  { skip: SKIP }, () => {
  const ram = freshRam();
  const ctx = ctxOf(ram);
  const a6 = seedBee(ram, 0, { status: KIND.bee | 0x8000 | 0x1000 });
  ram.setU16(POOL_A.chainMeterP1, 0);                    // no chain -> flat path
  ram.setU16(POOL_A.chainHitsP1, 0);
  ram.setU32(LEDGER.p1.pendingEnd - 4, 0);
  runPoolADriver(ram, ROM, ctx);
  // Flat: base $100 x 1 = one call to scoreByMask.  pendingEnd = $00000100.
  assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x00000100,
    'flat award = BCD $0100 = 100');
});

// ============================================================ MUST-FAIL 3
// Off-screen free.  RED: the driver was not ported, so nothing freed anything.
// GREEN: the idle step detects off-screen and frees the slot.

test('MUST-FAIL 3: a bee past the Y boundary is freed and count decrements',
  { skip: SKIP }, () => {
  const ram = freshRam();
  const ctx = ctxOf(ram);
  // Seed a bee at Y=$F000 (past the bottom boundary).  X=$2000 (on-screen).
  // The idle step's off-screen test: X + $1C00 + $9000 (no carry at X=$2000),
  // then swap to Y: Y + $800 + $7800 = Y + $8000.  $F000 + $8000 = $17000
  // -> wraps to $7000 < $7800 -> CARRY -> off-screen -> free.
  const a6 = seedBee(ram, 0, { pos: 0xF0002000 });       // Y=$F000 (off-screen)
  assert.equal(ram.u16(POOL_A.liveCount), 1);
  const t = runPoolADriver(ram, ROM, ctx);
  assert.equal(t.freed, 1, 'the bee was freed');
  assert.equal(ram.u16(a6 + B.status), 0, 'slot cleared');
  assert.equal(ram.u16(POOL_A.liveCount), 0, 'live count decremented');
});

// ============================================================ MUST-FAIL 4
// W411 TURNS THIS ONE ROUND. RED (W110): no driver, so a kind-2 record silently
// no-oped. GREEN (W111): the driver dispatched and THREW by address, naming
// $27FE0E. GREEN (W411, docket D49): $27FE0E is ported, so the same record now
// RUNS -- and the thing worth asserting is that it runs kind 2's body and not the
// bee's, which is a difference the throw used to carry and an assertion must now.

test('W411 a kind-2 record in the pool runs $27FE0E, not the bee body',
  { skip: SKIP }, () => {
  const ram = freshRam();
  const ctx = ctxOf(ram);
  // Poke kind 2 directly into slot 70 (bypass the allocator's REFUSAL).
  // Kind index 2 = $08 in bits 6..2; status = $8008.
  const a6 = POOL_A.reservedBase;
  ram.setU16(a6 + B.status, 0x8008);                      // allocated | kind 2
  ram.setU16(a6 + B.pos, 0x2000);                         // on screen on both axes
  ram.setU16(a6 + B.posX, 0x2000);
  ram.setU32(a6 + B.layerEmitter, 0x0023d762);            // layer row 0
  ram.setU16(POOL_A.liveCount, 1);
  ram.setU8(a6 + B.blinkTimer, 0);                        // due, so the step is visible
  ram.setU8(a6 + B.blinkTimer + 1, 1);
  ram.setU32(a6 + B.sprite, 0x001be2cc);
  const t = runPoolADriver(ram, ROM, ctx);
  assert.equal(t.live, 1);
  assert.equal(ram.u32(a6 + B.sprite), 0x001be300,
    '$27FEB0 addi.l #$34 -- kind 2 steps $34, where the bee body would blink $1BCA34');
  assert.deepEqual(ctx.unportedLog.report(), [], 'and nothing was refused');
});

test('REFUSAL: allocBee27F92A rejects a non-bee kind (kind 3)', { skip: SKIP }, () => {
  const ram = freshRam();
  const ctx = ctxOf(ram);
  const carrierA6 = 0x815000;
  ram.setU32(carrierA6 + B.pos, 0x40002000);
  assert.throws(
    () => allocBee27F92A(ram, ROM, ctx, 0x0c, 0, carrierA6),  // kind index 3
    /27F92A/,
    'the allocator REFUSES kind 3 (only kind 1 and 16 are bee)',
  );
  assert.equal(ram.u16(POOL_A.liveCount), 0, 'nothing allocated on refusal');
});

// ============================================================ THE CLEAR

test('clearPoolA zeros all 80 slots and the trailing words', () => {
  const ram = freshRam();
  // Dirty some slots.
  for (let i = 0; i < 80; i++) {
    ram.setU16(POOL_A.base + i * POOL_A.stride, 0x8004);
  }
  ram.setU16(POOL_A.liveCount, 42);
  ram.setU16(POOL_A.beeCount, 7);
  ram.setU16(POOL_A.cursor, 12);
  clearPoolA(ram);
  for (let i = 0; i < 80; i++) {
    assert.equal(ram.u16(POOL_A.base + i * POOL_A.stride), 0,
      `slot ${i} cleared`);
  }
  assert.equal(ram.u16(POOL_A.liveCount), 0, 'live count cleared');
  assert.equal(ram.u16(POOL_A.beeCount), 0, 'bee count cleared');
  assert.equal(ram.u16(POOL_A.cursor), 0, 'cursor cleared');
});

// ============================================================ THE x2 BUG

test('the x2 is the BCD overflow bug: count==10 AND no-miss doubles the base',
  { skip: SKIP }, () => {
  const ram = freshRam();
  const ctx = ctxOf(ram);
  // Set up for the x2: bee count = 9 (will bump to 10), no-miss = 0.
  ram.setU16(POOL_A.beeCount, 9);
  ram.setU16(POOL_A.noMissP1, 0);
  ram.setU16(POOL_A.chainMeterP1, 0);                    // flat path (isolate x2)
  // Cursor at index 8 -> base = $00000900 (BCD 900).  After the x2:
  //   BINARY double: $00000900 + $00000900 = $00001200.
  //   The $12 byte is NOT corrected by abcd ($12 is valid packed BCD "12").
  //   Result: $001200 = BCD 1200.
  // A CORRECT BCD double of 900 would be $1800 (1800).  The bug gives 1200.
  // This is the documented BCD overflow (rokulpg / trap15, recon 73 sec 1.3).
  ram.setU16(POOL_A.cursor, 32);                          // cursor = 32 -> ladder idx 8
  const a6 = seedBee(ram, 0, { status: KIND.bee | 0x8000 | 0x1000 });
  ram.setU32(LEDGER.p1.pendingEnd - 4, 0);
  runPoolADriver(ram, ROM, ctx);
  // W234 CORRECTS THIS. $27FC08 is `bset #$5,(A6)`, and `bset` on a MEMORY operand
  // is BYTE-sized, so it sets bit 5 of the byte at +0 -- $2000 of the status WORD,
  // not $0020. Three things agree: $28112C tests `btst #$D,D1` with D1 = the status
  // word, $2811A2 tests `btst #$5,(A6)` on the same byte, and the KIND is
  // `d1 & $7C` (bits 6..2), which bit 5 of the word is inside -- a flag there would
  // corrupt the kind. The port set $0020 and this test asserted it, so the x2
  // popup and its flicker could never have appeared.
  assert.equal(ram.u16(a6 + B.status) & 0x2000, 0x2000, 'x2 flag (bit 13) set');
  // The cursor ratcheted +4.
  assert.equal(ram.u16(POOL_A.cursor), 36, 'cursor ratcheted +4');
  // The award: binary-doubled $1200 -> abcd -> $001200.  Correct would be $1800.
  const after = ram.u32(LEDGER.p1.pendingEnd - 4);
  assert.equal(after, 0x00001200,
    `the x2 bug: BCD $0900 binary-doubled to $1200 (not the correct BCD $${
      (0x1800).toString(16).toUpperCase()}) -- transcribed, not fixed`);
});
