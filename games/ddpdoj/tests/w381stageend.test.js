// W381 -- THE FOUR STALE COUNTED NOTES IN `$25FD38`.
//
// `rebuildWorld25FD38` had carried four `note()` deferrals since W62:
//
//   $289AE0  pool C        ported W380 (poolclear.js clearPoolC289AE0)
//   $28AC3A  the cue pool  ported W380 (poolclear.js clearCuePool28AC3A)
//   $289F3A  pool E        ported W53  (spark.js   clearPool)
//   $28131E  the bullets   ported earlier (bullets.js poolClear + poolPark)
//
// A counted note goes stale the moment somebody else ports its subject, and
// nothing in the tree notices, because a `note()` is a legal call that returns.
// The consequence here was live: from W53 onward a stage advance left the shot
// spark pool and the bullet pool full of the PREVIOUS stage's records while
// `$25FD24` zeroed the clock those records were timed against.
//
// SHAPE (following W62/W380): every extent, every immediate and every call
// order below is decoded from `maincpu.bin` through `rip/port/player.tables.json`.
// Nothing writes a constant and reads it back through the same constant.  The
// pool assertions DIRTY THE POOL FIRST with a recognisable pattern and then
// prove the words came out zero -- "the function was called" is not the claim,
// "the pool is clean" is -- and every one of them also pins a guard word
// OUTSIDE the cleared span, so an over-long clear fails the same test.
//
// The tests SKIP LOUDLY when the export is absent.  A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { rebuildWorld25FD38, banner28E7F8, SE } from '../src/stageend.js';
import { HYPER } from '../src/hyper.js';
import { SPAWN } from '../src/spawn.js';
import { ITEM } from '../src/items.js';
import { BUL, REC } from '../src/bullets.js';
import { SPARK } from '../src/spark.js';
import { POOL_B, POOL_D, POOL_C } from '../src/effects.js';
import { CUE } from '../src/cues.js';
import { POOL_C_CLEAR_WORDS, CUE_CLEAR_WORDS } from '../src/poolclear.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const IMGPATH = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const HAVE = fs.existsSync(TABLES) && fs.existsSync(IMGPATH);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json or rip/sound/maincpu.bin missing -- '
    + '`python tools/export-tables.py`';

// The six bodies these tests decode ($288E0C $289084 $289AE0 $289F3A $27E98A
// $28131E) are OUTSIDE every window `tools/export-tables.py` exports, so
// `RomWindows` throws on them by design.  W380 read them out of the image and
// so does this file: `maincpu.bin` is indexed by RAW FILE OFFSET, which for
// this board is the ROM address itself.
const IMG = HAVE ? fs.readFileSync(IMGPATH) : null;
const w = (a) => IMG.readUInt16BE(a);
const iw = (a) => IMG.readInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

/** The eight `jsr`s of `$25FD38`, in ROM order, with the port's extent for each. */
const EIGHT = [
  ['$26331E', 0x26331e, SPAWN.RESET_BASE, SPAWN.RESET_WORDS],
  ['$288E0C', 0x288e0c, POOL_B.base, POOL_B.clearWords],
  ['$289084', 0x289084, POOL_D.base, POOL_D.clearWords],
  ['$289AE0', 0x289ae0, POOL_C.base, POOL_C_CLEAR_WORDS],
  ['$28AC3A', 0x28ac3a, CUE.base, CUE_CLEAR_WORDS],
  ['$289F3A', 0x289f3a, SPARK.p1Base, SPARK.clearWords],
  ['$27E98A', 0x27e98a, ITEM.base, ITEM.clearWords],
  ['$28131E', 0x28131e, BUL.pool, 0x1a4a],
];

function ctxOf(ram) {
  const u = new UnportedLog();
  const ev = [];
  return {
    ctx: {
      rom: ROM,
      unportedLog: u,
      stageEndEvent: (k, v) => ev.push([k, v]),
    },
    notes: u,
    ev,
  };
}

/** Fill `[lo,hi)` with a pattern nothing in the port would ever write. */
function dirty(ram, lo, hi, seed) {
  for (let a = lo, i = 0; a < hi; a += 2, i++) {
    ram.setU16(a, ((seed + i * 0x1111) & 0xffff) | 0x8001);
  }
}

/** The first address in `[lo,hi)` that is NOT zero, or -1. */
function firstNonZero(ram, lo, hi) {
  for (let a = lo; a < hi; a += 2) if (ram.u16(a) !== 0) return a;
  return -1;
}

// ===========================================================================
// 1. THE ROM SAYS WHICH EIGHT, IN WHICH ORDER, AND HOW LONG EACH ONE IS
// ===========================================================================

test('W381/1 $25FD38 is bsr + eight jsr + the create, and the ROM names the eight',
  { skip: SKIP }, () => {
    assert.equal(w(0x25fd38), 0x61ea, '$25FD38 bsr.b $25FD24');
    assert.equal(0x25fd3a + (0xea - 0x100), 0x25fd24, '...and it lands on $25FD24');
    EIGHT.forEach(([label, addr], i) => {
      const at = 0x25fd3a + i * 6;
      assert.equal(w(at), 0x4eb9, `$${at.toString(16).toUpperCase()} jsr.l`);
      assert.equal(l(at + 2), addr, `call ${i + 1} of 8 is ${label}`);
    });
    assert.equal(w(0x25fd6a), 0x303c, '$25FD6A move.w #imm,D0');
    assert.equal(w(0x25fd6c), 1, '...#$1 -- a type-1 background object');
    assert.equal(l(0x25fd70), 0x241182, '$25FD6E jsr $241182');
    assert.equal(l(0x25fd76), SE.bgHandle, '$25FD74 move.l D0,$813144');
    assert.equal(w(0x25fd7e), 0x0006, '$25FD7A move.w #$0,($6,A0)');
    assert.equal(w(0x25fd7c), 0x0000, '...the ENTRY CLOCK is the immediate 0');
    assert.equal(w(0x25fd80), 0x4e75, '$25FD80 rts');
  });

test('W381/2 every one of the eight is lea/move.w-imm/dbra with the port\'s extent',
  { skip: SKIP }, () => {
    for (const [label, addr, base, words] of EIGHT) {
      assert.equal(w(addr), 0x41f9, `${label} lea abs.l,A0`);
      assert.equal(l(addr + 2), base, `${label} clears from $${base.toString(16)}`);
      assert.equal(w(addr + 6), 0x303c, `${label} move.w #imm,D0`);
      // TRAP 2: `dbra` runs N+1 times, so the ROM immediate is one LESS.
      assert.equal(w(addr + 8) + 1, words,
        `${label} immediate $${w(addr + 8).toString(16)} + 1 == $${words.toString(16)} words`);
    }
  });

test('W381/3 $28131E is TWO loops -- the clear AND the 210 parks at $FFFF',
  { skip: SKIP }, () => {
    // The clear.
    assert.equal(l(0x281320), BUL.pool);
    assert.equal(w(0x281324), 0x303c);
    assert.equal(w(0x281326) + 1, 0x1a4a, '$1A49 + 1 = 6,730 words');
    assert.equal(w(0x281328), 0x7200, 'moveq #0,D1');
    assert.equal(w(0x28132a), 0x30c1, 'move.w D1,(A0)+');
    assert.equal(w(0x28132c), 0x51c8, 'dbra D0,...');
    assert.equal(0x28132e + iw(0x28132e), 0x28132a, '...back to the store');
    // THE SECOND LOOP -- and it starts at pool+2, not pool.
    assert.equal(w(0x281330), 0x41f9, '$281330 lea abs.l,A0');
    assert.equal(l(0x281332), BUL.pool + REC.posA,
      'the park loop starts at $817F8E == pool + REC.posA');
    assert.equal(w(0x281336), 0x303c);
    assert.equal(w(0x281338) + 1, BUL.slots, '$D1 + 1 = 210 slots');
    assert.equal(w(0x28133a), 0x30bc, 'move.w #imm,(A0)');
    assert.equal(w(0x28133c), 0xffff, '...#$FFFF -- the PARK value');
    assert.equal(w(0x28133e), 0x41e8, 'lea (d16,A0),A0');
    assert.equal(w(0x281340), BUL.stride, '...stride $40');
    assert.equal(0x281344 + iw(0x281344), 0x28133a, 'dbra back to the park store');
    assert.equal(w(0x281346), 0x4e75, '$281346 rts -- and only then');
  });

// ===========================================================================
// 2. ORDER
// ===========================================================================

test('W381/4 the eight ranges are pairwise DISJOINT, so the call order cannot matter',
  { skip: SKIP }, () => {
    // Extents taken from the ROM, not from the port's constants.
    const spans = EIGHT.map(([label, addr]) => {
      const base = l(addr + 2);
      const words = w(addr + 8) + 1;
      return { label, lo: base, hi: base + words * 2 };
    }).sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < spans.length; i++) {
      assert.ok(spans[i - 1].hi <= spans[i].lo,
        `${spans[i - 1].label} ends $${spans[i - 1].hi.toString(16)} <= `
        + `${spans[i].label} base $${spans[i].lo.toString(16)}`);
    }
    // ...and the ONE non-clearing side effect among the eight, `$263386`'s
    // install, writes three words that no OTHER reset covers.  That is the
    // whole reason `$25FD38` may install FIRST and `$28B5A8` install LAST.
    const others = spans.filter((s) => s.label !== '$26331E');
    for (const a of [SPAWN.LIVE_CURSOR, SPAWN.LIVE_CURSOR + 2,
      SPAWN.AUX_BASE, SPAWN.AUX_BASE + 2]) {
      for (const s of spans) {
        assert.ok(a < s.lo || a >= s.hi,
          `$${a.toString(16)} (the install's cursor) is outside ${s.label}`);
      }
    }
    for (const s of others) {
      assert.ok(SPAWN.DEFQ_COUNT < s.lo || SPAWN.DEFQ_COUNT >= s.hi,
        `$815EA8 is outside ${s.label} -- only $26331E's OWN range covers it`);
    }
    const own = spans.find((s) => s.label === '$26331E');
    assert.ok(SPAWN.DEFQ_COUNT >= own.lo && SPAWN.DEFQ_COUNT < own.hi,
      '$815EA8 IS inside $26331E, and $263386 rewrites it after the dbra');
  });

test('W381/5 the install SURVIVES the seven clears that run after it',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx, ev } = ctxOf(ram);
    ram.setU16(SE.stageX4, 4);                    // stage 1 -> $813096 / 4
    rebuildWorld25FD38(ram, ctx);
    const script = ROM.u32(SPAWN.STAGE_TAB + 1 * 0x10);
    assert.equal(ev[0][0], 'spawn-install');
    assert.notEqual(script, 0, 'the stage table gives a real script pointer');
    assert.equal(ram.u32(SPAWN.LIVE_CURSOR), script,
      '$8132CC still holds $26339C\'s cursor AFTER all seven later clears');
    assert.equal(ram.u32(SPAWN.AUX_BASE), ROM.u32(SPAWN.STAGE_TAB + 1 * 0x10 + 4),
      '$8132D0 still holds $26339E\'s aux base');
  });

// ===========================================================================
// 3. THE POOLS ARE CLEAN.  NOT "THE FUNCTION WAS CALLED" -- CLEAN.
// ===========================================================================

test('W381/6 a rebuild ZEROES pool E, the shot spark -- both halves and both counts',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    const end = SPARK.p1Base + SPARK.clearWords * 2;      // $81DB90
    dirty(ram, SPARK.p1Base, end, 0x5a5a);
    ram.setU16(SPARK.count, 0x001e);                      // 30 live records
    ram.setU16(SPARK.budget, SPARK.budgetReload);
    // Guard: the FIRST word past the whole tiled block.  $28AC3A ends at
    // $81DD10, so nothing in the eight may touch it.
    ram.setU16(0x81dd10, 0xbeef);
    ram.setU16(0x81dd12, 0xbeef);
    rebuildWorld25FD38(ram, ctx);
    assert.equal(firstNonZero(ram, SPARK.p1Base, end), -1,
      `$81D394..$${(end - 1).toString(16)} is not all zero`);
    assert.equal(ram.u16(SPARK.p2Base), 0, 'P2\'s half is inside the same clear');
    assert.equal(ram.u16(SPARK.count), 0, '$81DB8C, the ONE live count, is cleared');
    assert.equal(ram.u16(SPARK.budget), 0, '$81DB8E, the per-frame budget, too');
    assert.equal(ram.u16(0x81dd10), 0xbeef, '$81DD10 is PAST the block and intact');
    assert.equal(ram.u16(0x81dd12), 0xbeef, '...and so is $81DD12');
  });

test('W381/7 a rebuild ZEROES the bullet pool AND parks all 210 slots at $FFFF',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    const end = BUL.pool + 0x1a4a * 2;                    // $81B420
    dirty(ram, BUL.pool, end, 0x3c3c);
    ram.setU16(BUL.liveCount, 0x0042);
    for (const w of BUL.window) ram.setU16(w, 0x1234);
    // Guards: the gap BELOW the pool and the gap ABOVE it.  Nothing in the
    // eight covers $8171BE..$817F8B or $81B420..$81B731.
    ram.setU16(0x8171be, 0xcafe);
    ram.setU16(0x817f8a, 0xcafe);
    ram.setU16(end, 0xcafe);
    ram.setU16(POOL_B.base - 2, 0xcafe);                  // $81B730
    rebuildWorld25FD38(ram, ctx);
    // Every word except the parked +$02 of each slot.
    for (let a = BUL.pool; a < end; a += 2) {
      const off = (a - BUL.pool) % BUL.stride;
      const inPool = a < BUL.pool + BUL.slots * BUL.stride;
      if (inPool && off === REC.posA) continue;
      assert.equal(ram.u16(a), 0, `$${a.toString(16)} survived the clear`);
    }
    assert.equal(ram.u16(BUL.liveCount), 0, '$81B40C, the live count');
    for (const w of BUL.window) {
      assert.equal(ram.u16(w), 0, `$${w.toString(16)}, a window word`);
    }
    // ...and the SECOND loop really ran.
    for (let s = 0; s < BUL.slots; s++) {
      assert.equal(ram.u16(BUL.pool + s * BUL.stride + REC.posA), 0xffff,
        `slot ${s} was cleared but never PARKED -- $281330 did not run`);
    }
    assert.equal(ram.u16(0x8171be), 0xcafe, '$8171BE is below the pool, intact');
    assert.equal(ram.u16(0x817f8a), 0xcafe, '$817F8A is the word before it, intact');
    assert.equal(ram.u16(end), 0xcafe, '$81B420 is the word after it, intact');
    assert.equal(ram.u16(POOL_B.base - 2), 0xcafe, '$81B730 is intact too');
  });

test('W381/8 a rebuild ZEROES pool C and the cue pool, and stops on $81DD10',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    const cEnd = POOL_C.base + POOL_C_CLEAR_WORDS * 2;    // $81D394
    const qEnd = CUE.base + CUE_CLEAR_WORDS * 2;          // $81DD10
    dirty(ram, POOL_C.base, cEnd, 0x2b2b);
    dirty(ram, CUE.base, qEnd, 0x6d6d);
    ram.setU16(0x81dd10, 0xbeef);
    ram.setU16(0x81dd1e, 0xbeef);
    rebuildWorld25FD38(ram, ctx);
    assert.equal(firstNonZero(ram, POOL_C.base, cEnd), -1, 'pool C is not all zero');
    assert.equal(firstNonZero(ram, CUE.base, qEnd), -1, 'the cue pool is not all zero');
    assert.equal(ram.u16(0x81dd10), 0xbeef, '$81DD10 is one word past $28AC3A');
    assert.equal(ram.u16(0x81dd1e), 0xbeef, '...and $81DD1E is further past it');
  });

test('W381/9 ONE rebuild leaves the WHOLE $81B732..$81DD0F block clean',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    dirty(ram, POOL_B.base, 0x81dd10, 0x1357);
    ram.setU16(0x81b730, 0xbeef);
    ram.setU16(0x81dd10, 0xbeef);
    rebuildWorld25FD38(ram, ctx);
    assert.equal(firstNonZero(ram, POOL_B.base, 0x81dd10), -1,
      'the five tiling clears leave a hole in $81B732..$81DD0F');
    assert.equal(ram.u16(0x81b730), 0xbeef, 'the word BEFORE the block');
    assert.equal(ram.u16(0x81dd10), 0xbeef, 'the word AFTER the block');
  });

// ===========================================================================
// 4. AND THE NOTES ARE GONE
// ===========================================================================

test('W381/10 $25FD38 counts NONE of the eight resets as deferred any more',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx, notes } = ctxOf(ram);
    rebuildWorld25FD38(ram, ctx);
    const report = notes.report().join('\n');
    for (const [label] of EIGHT) {
      assert.ok(!report.includes(label),
        `${label} is still a counted note in $25FD38's unported log:\n${report}`);
    }
  });

// ===========================================================================
// 5. THE SECOND STALE NOTE IN THIS FILE -- $28EAB8/$28EACE -> $2875B4/$287616
// ===========================================================================
// The sweep this unit ran found `stageend.js`'s banner teardown counting
// `$2875B4` while `hyper.js flushPendingHyper2875B4` has served both it and
// `$287616` since W163.  The note also swallowed the FOUR GATES around the two
// calls, which is brief trap 7 -- and these compares DO branch away.

test('W381/11 the ROM gates the two flushes on a live player with hyper OVER',
  { skip: SKIP }, () => {
    assert.equal(w(0x28eaa8), 0x4a79, '$28EAA8 tst.w abs.l');
    assert.equal(l(0x28eaaa), SE.p1, '  ...$8103E6, P1\'s record');
    assert.equal(w(0x28eaae), 0x6a0e, '$28EAAE bpl.b +$0E');
    assert.equal(0x28eab0 + 0x0e, 0x28eabe, '  ...to $28EABE, the P2 arm');
    assert.equal(w(0x28eab0), 0x4a79);
    assert.equal(l(0x28eab2), HYPER.p1.active, '  ...$81B63E, P1 hyper-active');
    assert.equal(w(0x28eab6), 0x6606, '$28EAB6 bne.b +$06');
    assert.equal(0x28eab8 + 0x06, 0x28eabe, '  ...to $28EABE as well');
    assert.equal(w(0x28eab8), 0x4eb9);
    assert.equal(l(0x28eaba), 0x2875b4, '$28EAB8 jsr $2875B4');
    // ...and the P2 mirror, byte for byte with the other three addresses.
    assert.equal(l(0x28eac0), SE.p2, '$28EABE tst.w $810448');
    assert.equal(w(0x28eac4), 0x6a0e, '$28EAC4 bpl.b +$0E');
    assert.equal(0x28eac6 + 0x0e, 0x28ead4, '  ...to $28EAD4, past both calls');
    assert.equal(l(0x28eac8), HYPER.p2.active, '$28EAC6 tst.w $81B640');
    assert.equal(w(0x28eacc), 0x6606, '$28EACC bne.b +$06');
    assert.equal(0x28eace + 0x06, 0x28ead4);
    assert.equal(l(0x28ead0), 0x287616, '$28EACE jsr $287616');
    assert.equal(w(0x28ead4), 0x4279, '$28EAD4 clr.w abs.l');
    assert.equal(l(0x28ead6), 0x81dff6, '  ...$81DFF6, THE CLEARER');
  });

/** The banner one frame from its teardown, with `n` pending grants on each side. */
function teardownFixture(pendingP1, pendingP2) {
  const ram = new Ram();
  const built = ctxOf(ram);
  ram.setU16(0x81dfac, 0x8000);           // BANNER.buf -- already initialised
  ram.setU16(0x81dfec, 0);                // BANNER.dfec == 0 -> the teardown fires
  ram.setU16(0x81dff8, 0);                // not the slide-in arm
  ram.setU16(0x81dff6, 1);                // ...and not the early rts
  ram.setU16(HYPER.p1.pending, pendingP1);
  ram.setU16(HYPER.p2.pending, pendingP2);
  return { ram, ...built };
}

test('W381/12 the teardown FLUSHES both sides, and no longer just counts them',
  { skip: SKIP }, () => {
    const { ram, ctx } = teardownFixture(2, 3);
    const spawned = [];
    ctx.itemSpawn = (kind, site, at) => spawned.push([kind, site, at]);
    ram.setU16(SE.p1, 0x8000);            // P1 live ($28EAAE bpl SKIPS on plus)
    ram.setU16(SE.p2, 0x8000);            // P2 live
    ram.setU16(HYPER.p1.active, 0);       // hyper OVER ($28EAB6 bne SKIPS on set)
    ram.setU16(HYPER.p2.active, 0);
    banner28E7F8(ram, ctx, ROM);
    assert.equal(ram.u16(HYPER.p1.pending), 0, 'P1\'s pending count was flushed');
    assert.equal(ram.u16(HYPER.p2.pending), 0, 'P2\'s pending count was flushed');
    assert.equal(spawned.filter(([k]) => k === HYPER.p1.kind).length, 2,
      '$2875B4 spawned P1\'s two kind-$C items');
    assert.equal(spawned.filter(([k]) => k === HYPER.p2.kind).length, 3,
      '$287616 spawned P2\'s three kind-$14 items');
    assert.equal(ram.u16(0x81dff6), 0, '...and $28EAD4 still ran after both');
  });

test('W381/13 a DEAD player and a LIVE hyper each skip their own flush',
  { skip: SKIP }, () => {
    // $28EAAE bpl -- P1's record is NOT negative, so the P1 arm is skipped.
    {
      const { ram, ctx } = teardownFixture(2, 3);
      ram.setU16(SE.p1, 0x0001);          // plus -> bpl taken
      ram.setU16(SE.p2, 0x8000);
      ram.setU16(HYPER.p1.active, 0);
      ram.setU16(HYPER.p2.active, 0);
      banner28E7F8(ram, ctx, ROM);
      assert.equal(ram.u16(HYPER.p1.pending), 2, '$28EAAE bpl skipped P1\'s flush');
      assert.equal(ram.u16(HYPER.p2.pending), 0, '...and P2\'s still ran');
    }
    // $28EACC bne -- P2's hyper is STILL UP, so the P2 arm is skipped.
    {
      const { ram, ctx } = teardownFixture(2, 3);
      ram.setU16(SE.p1, 0x8000);
      ram.setU16(SE.p2, 0x8000);
      ram.setU16(HYPER.p1.active, 0);
      ram.setU16(HYPER.p2.active, 1);     // non-zero -> bne taken
      banner28E7F8(ram, ctx, ROM);
      assert.equal(ram.u16(HYPER.p1.pending), 0, '...P1\'s flush still ran');
      assert.equal(ram.u16(HYPER.p2.pending), 3, '$28EACC bne skipped P2\'s flush');
    }
  });

test('W381/14 the banner teardown no longer counts $2875B4 as deferred',
  { skip: SKIP }, () => {
    const { ram, ctx, notes } = teardownFixture(0, 0);
    ram.setU16(SE.p1, 0x8000);
    ram.setU16(SE.p2, 0x8000);
    banner28E7F8(ram, ctx, ROM);
    const report = notes.report().join('\n');
    assert.ok(!report.includes('$2875B4'),
      `$2875B4 is still a counted note on the banner teardown:\n${report}`);
  });
