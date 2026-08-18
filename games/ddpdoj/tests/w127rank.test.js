// W127 (Wave A) -- OBJECT TYPE 10, THE RANK OBJECT `$260794`.
//
// The defect this suite exists for: until W127 the rank output `$81309E` was
// FROZEN at its seed value for the whole run, because object type 10 had no
// handler (W120's verdict).  These tests prove the recompute now ADVANCES it as
// `base[stage] + (clock>>8) + 0` on the no-hyper corpus, matching the board.
//
// Every value asserted here comes out of the cartridge or the seed, not out of
// a constant this wave chose: base[0] = $34 (ROM $260874), the seed's $81309E =
// $35 = base + (seedClock>>8), and the advance to $36 at frame 129 is
// (seedClock + 129) >> 8 = 2.  SEEDED throughout (the corpus is a no-hyper run).
//
// Throw assertions pin `e.romAddress`, never the message text.
//
// The tests SKIP LOUDLY when the export or seed is absent.  A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { RAM } from '../src/machine.js';
import { TxVram } from '../src/background.js';
import {
  RANK, RANK_DEVIATION, recompute2608D2, makeRankObject,
} from '../src/rank.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const SEED = path.join(ROOT, 'rip', 'web', 'seed.bin');
const HAVE = fs.existsSync(TABLES) && fs.existsSync(SEED);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const SEED_BYTES = HAVE ? fs.readFileSync(SEED) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json or rip/web/seed.bin missing';

// The corpus seed, read straight out of the board's own RAM dump.
function seedRam() { return new Ram(SEED_BYTES); }
function ctxOf() {
  return { rom: ROM, unportedLog: new UnportedLog() };
}
// Slot 0 of $80E240 is the type-10 object in the seed (typeWord $800A, state 1).
const SLOT0 = RAM.objTable;
const STAGE1_BASE = 0x34;        // ROM $260874, read through the W127 window
const SEED_RANK = 0x35;          // $81309E = $34 + ($17F >> 8) = $34 + 1
const SEED_CLOCK = 0x17f;        // $8130C6

// ===========================================================================
// 1. THE BASE TABLE, read the way the 68000 reads it (through the RAM pointer)
// ===========================================================================

test('$81315C holds the ROM base-table pointer $260874, and base[0] is $34',
  { skip: SKIP }, () => {
    const ram = seedRam();
    assert.equal(ram.u32(RANK.basePtr), 0x260874,
      'the seed carries the per-stage base-table pointer');
    assert.equal(ROM.u8(0x260874), STAGE1_BASE,
      'stage-1 base = $34 = 52 (W19 cited ~52)');
    assert.equal(ROM.u8(0x260874 + ram.u16(RANK.stageIdx)), STAGE1_BASE,
      'base[seed stage] = $34 via the same dereference the recompute uses');
  });

test('the seed $81309E is EXACTLY base[stage] + (clock>>8): $34 + 1 = $35',
  { skip: SKIP }, () => {
    const ram = seedRam();
    const predicted = STAGE1_BASE + (ram.u32(RANK.clock) >>> 8);
    assert.equal(predicted, SEED_RANK);
    assert.equal(ram.u16(RANK.rankOut), SEED_RANK,
      'the board wrote this value the frame before the seed was taken');
  });

// ===========================================================================
// 2. THE MUST-FAIL CHECK -- red (frozen) -> green (advances)
// ===========================================================================
//
// BEFORE W127: no handler -> $81309E frozen at $35 forever.  AFTER W127: the
// handler advances the clock and recomputes, so $81309E = base + (clock>>8).
// seedClock $17F; after 129 frames clock = $200, clock>>8 = 2, rank = $36.

test('GREEN: with the W127 handler wired, stepping slot 0 advances $81309E to $36',
  { skip: SKIP }, () => {
    const ram = seedRam();
    const rank = makeRankObject(ROM);
    const ctx = ctxOf();
    assert.equal(ram.u16(RANK.rankOut), SEED_RANK, 'starts at the frozen seed $35');
    for (let i = 0; i < 140; i++) rank(ram, SLOT0, 0, ctx);  // 140 > 129
    assert.equal(ram.u32(RANK.clock), SEED_CLOCK + 140,
      'the rank clock advanced 140 ticks ($17F -> $20B)');
    assert.equal(ram.u16(RANK.rankOut), 0x36,
      '$81309E = base + ((clock)>>8) = $34 + 2 = $36 (ADVANCED, not frozen)');
  });

test('RED (the pre-wave state): without the handler, $81309E stays frozen at $35',
  { skip: SKIP }, () => {
    const ram = seedRam();
    // Step NOTHING: this is exactly the pre-W127 port, where type 10 had no
    // handler and the object driver merely logged the dispatch.  The clock does
    // not advance and the output is never written.
    assert.equal(ram.u32(RANK.clock), SEED_CLOCK, 'clock unchanged');
    assert.equal(ram.u16(RANK.rankOut), SEED_RANK, '$81309E frozen at $35');
  });

test('BREAK: the freeze gate $8130D2 skips the clock advance, so $81309E is frozen',
  { skip: SKIP }, () => {
    // The must-fail "break the recompute" variant.  $8130D2 (shared with
    // stageend.js SE.pauseFlag) sends the clock-advance `bne` to the recompute,
    // skipping ONLY the `addq.l #1,$8130C6`.  The recompute still runs every
    // frame, but on a frozen clock it writes the same value forever.  That is
    // the frozen-rank failure mode, exercised through the cartridge's own gate.
    const ram = seedRam();
    ram.setU16(RANK.freezeD2, 1);                  // bgPause25FD82's lever
    const rank = makeRankObject(ROM);
    const ctx = ctxOf();
    for (let i = 0; i < 140; i++) rank(ram, SLOT0, 0, ctx);
    assert.equal(ram.u32(RANK.clock), SEED_CLOCK,
      'frozen: the clock did NOT advance (the bne skipped addq.l #1)');
    assert.equal(ram.u16(RANK.rankOut), SEED_RANK,
      'frozen: $81309E stays $35 (clock>>8 stays 1). RESTORE: clear $8130D2 -> '
      + 'the GREEN test above advances to $36');
  });

// ===========================================================================
// 3. THE RECOMPUTE FUNCTION, in isolation
// ===========================================================================

test('recompute2608D2 writes base + (clock>>8) and is a pure function of the clock',
  { skip: SKIP }, () => {
    const ram = seedRam();
    recompute2608D2(ram, ROM);
    assert.equal(ram.u16(RANK.rankOut), SEED_RANK,
      'at the seed clock, recompute reproduces the seed $35');
    // advance the clock past the $200 boundary and recompute -> $36
    ram.setU32(RANK.clock, 0x200);
    recompute2608D2(ram, ROM);
    assert.equal(ram.u16(RANK.rankOut), 0x36,
      'at clock $200 (>>8 = 2), rank = $34 + 2 = $36');
    ram.setU32(RANK.clock, 0x300);
    recompute2608D2(ram, ROM);
    assert.equal(ram.u16(RANK.rankOut), 0x37, 'at clock $300, rank = $37');
  });

test('recompute2608D2 clamps loop-1 rank to $F0 (no hyper) and never reads score',
  { skip: SKIP }, () => {
    const ram = seedRam();
    // crank the clock so base + clock>>8 exceeds $F0, no hyper
    ram.setU32(RANK.clock, 0x100 * 0xC0);  // clock>>8 = $C0; $34+$C0 = $F4 > $F0
    recompute2608D2(ram, ROM);
    assert.equal(ram.u16(RANK.rankOut), 0xF0,
      'clamped to $F0 (the no-hyper loop-1 cap at $260958/$260964)');
    // the hyper term is 0: $81B63E/$81B640 are 0 in the seed, and the power
    // words $81B646/$81B648 are 0 too, so the cap is $F0 not $FF.
    assert.equal(ram.u16(RANK.hyperP1) | ram.u16(RANK.hyperP2), 0);
    assert.equal(ram.u16(0x81B646) | ram.u16(0x81B648), 0,
      'power words are 0 on the corpus (the 16*max term is 0)');
  });

// ===========================================================================
// 4. THE 15-BYTE FAN-OUT, exact against the seed
// ===========================================================================

test('the fan-out reproduces all 15 seed bytes for rank $35', { skip: SKIP }, () => {
  const expected = { 0x8130A1: 0x30, 0x8130A3: 0x2d, 0x8130A5: 0x2a, 0x8130A7: 0x27,
    0x8130A9: 0x24, 0x8130AB: 0x21, 0x8130AD: 0x1d, 0x8130AF: 0x1a, 0x8130B1: 0x16,
    0x8130B3: 0x13, 0x8130B5: 0x10, 0x8130B7: 0x0d, 0x8130B9: 0x0a, 0x8130BB: 0x07,
    0x8130BD: 0x03 };
  const ram = seedRam();
  recompute2608D2(ram, ROM);  // writes $81309E then fans out
  for (const [a, v] of Object.entries(expected)) {
    assert.equal(ram.u8(Number(a)), v,
      `fan-out byte $${Number(a).toString(16)} = ${v.toString(16)}`);
  }
});

// ===========================================================================
// 5. THE COMPUTED-CALL DISPATCHERS are corpus no-ops (all index words 0)
// ===========================================================================

test('$288610 and $25FF7A walk tables whose index words are ALL 0 on the seed',
  { skip: SKIP }, () => {
    const ram = seedRam();
    assert.equal(ram.u16(RANK.disp288610Table), 0);
    assert.equal(ram.u16(RANK.disp288610Table + RANK.disp288610Stride), 0);
    assert.equal(ram.u16(RANK.disp25FF7ATable), 0);
    assert.equal(ram.u16(RANK.disp25FF7ATable + RANK.disp25FF7AStride), 0);
    // so stepping the handler does NOT throw: both dispatchers skip every entry
    const rank = makeRankObject(ROM);
    rank(ram, SLOT0, 0, ctxOf());  // would throw Unreached if any index != 0
    assert.equal(ram.u16(RANK.rankOut), SEED_RANK);
  });

test('an index OUTSIDE 1..4 throws Unreached at the jsr site (loud, by address)',
  { skip: SKIP }, () => {
    // **W418 CHANGED WHAT "NONZERO" MEANS HERE.** `$288638` holds FIVE longs and the four
    // non-zero ones are the continue panel's prompt, wipe, count and clear, ported this wave as
    // `src/continuescreen.js DISP_288610_TARGETS`. Indices 1..4 therefore RUN now (the next
    // assertion drives all four), and the throw this test exists for is the one that still
    // matters: an index the jump table does not have.
    const ram = seedRam();
    ram.setU16(RANK.disp288610Table, 5);   // past the end of $288638's five longs
    const rank = makeRankObject(ROM);
    assert.throws(() => rank(ram, SLOT0, 0, ctxOf()),
      (e) => e.romAddress === RANK.callee288610,
      'an out-of-table index must throw carrying the $288610 jsr site');
  });

test('W418 indices 1..4 dispatch into the continue panel instead of throwing',
  { skip: SKIP }, () => {
    for (const idx of [1, 2, 3, 4]) {
      const ram = seedRam();
      // The panel draws through the TX defer buffer and through TxVram, so the ctx needs both
      // armed -- exactly what `Game#ctx()` supplies on the real driver.
      ram.setU32(0x80b058, 0xffffffff);
      ram.setU32(0x80c8d8, 0x80b058);
      ram.setU16(RANK.disp288610Table, idx);
      const ctx = { ...ctxOf(), tx: new TxVram(), soundPost: () => true };
      const rank = makeRankObject(ROM);
      rank(ram, SLOT0, 0, ctx);            // no throw
      // Each body writes something a reader can see: 1 and 3 advance the state word, 2 and 4
      // retire by clearing the index. Reading a RECORD back, not counting a call.
      if (idx === 1 || idx === 3) {
        assert.equal(ram.u16(RANK.disp288610Table + 2), 1, `index ${idx} advanced the state`);
      } else {
        assert.equal(ram.u16(RANK.disp288610Table), 0, `index ${idx} retired itself`);
      }
    }
  });

// ===========================================================================
// 6. THE DISPATCH ENTRY is wired into main.js defaultHandlers
// ===========================================================================

test('defaultHandlers[10] is the rank object (priority $001F, runs first)',
  { skip: SKIP }, async () => {
    const { defaultHandlers } = await import('../src/main.js');
    const hs = defaultHandlers(ROM);
    assert.ok(hs.has(10), 'type 10 is wired into the dispatch');
    assert.equal(typeof hs.get(10), 'function');
    const ram = seedRam();
    const before = ram.u16(RANK.rankOut);
    hs.get(10)(ram, SLOT0, 0, ctxOf());
    assert.equal(ram.u16(RANK.rankOut), before,
      'one frame keeps $81309E at $35 (clock $17F>>8 = 1 still)');
  });

// ===========================================================================
// 7. THE DECLARED DEVIATION is state-0 INIT $2605C8 (deferred)
// ===========================================================================

test('RANK_DEVIATION names $2605C8 (state-0 INIT) and the handler notes + advances',
  { skip: SKIP }, () => {
    assert.ok(RANK_DEVIATION[0x2605c8], 'the deferred INIT is declared');
    const ram = seedRam();
    ram.setU8(SLOT0 + RANK.stateOff, 0);  // force state 0 (cold boot)
    const ctx = ctxOf();
    const rank = makeRankObject(ROM);
    rank(ram, SLOT0, 0, ctx);
    assert.equal(ram.u8(SLOT0 + RANK.stateOff), 1,
      'state 0 -> 1 so the object cannot spin (the INIT body is deferred)');
    assert.ok(ctx.unportedLog.report().some((l) => l.includes('2605C8')),
      'the deviation was noted, not silent');
  });
