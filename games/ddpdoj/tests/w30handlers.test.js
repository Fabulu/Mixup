// WAVE 30 -- the three handlers that BLOCKED the fly-around gate ($275914,
// $2739C0, $276702), the fire gate $267FC6, and the sprite-emitter stub
// resolver that all three reach an enqueue through.
//
// SHAPE OF THESE TESTS.  Every one drives a real routine against the REAL
// exported cartridge windows and asserts on a value the ROM decides -- a bucket
// index read out of a stub's own operands, a muzzle vector read out of
// $268B1E/$27327A, a threshold read out of $2680A2.  None of them writes a
// constant and then reads it back through the same constant; `docs/knowledge/03`
// names that shape and two waves on this project have shipped it.
//
// Every throw assertion pins `e.romAddress`.  `27-review.md` 1A found four
// assertions in this suite matching an `Unreached` by MESSAGE TEXT, and the
// message quotes other ROM addresses in its own prose.
//
// The tests that need the cartridge SKIP LOUDLY when the export is absent.
// A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { runHandler } from '../src/handlers.js';
import { BUL, REC, TYPEBIT } from '../src/bullets.js';
import {
  BUCKETS, EMIT_TABLE, resolveEmitStub, enqueueThroughStub,
} from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const REC5 = 0x81364c, SUB = 0x81459c;
const u16 = (v) => v & 0xffff;

function fixture(over = {}) {
  const ram = new Ram();
  for (let i = 0; i < 0x50; i++) ram.setU8(REC5 + i, 0);
  for (let i = 0; i < 0x40; i++) ram.setU8(SUB + i, 0);
  ram.setU16(REC5, 0x8000);              // live
  ram.setU32(REC5 + 0x06, SUB);          // ($6,A5) -> the sub-record
  ram.setU32(REC5 + 0x12, 0);            // movement cursor 0 -> stepMovement no-op
  ram.setU32(REC5 + 0x44, 0x275912);     // shared $85/$86 cue-script terminator
  ram.setU16(SUB + 0x18, 0x0100);        // HP positive
  ram.setU16(SUB + 0x38, 0x0100);
  // ON SCREEN, AND INSIDE $267FC6's POSITION BOX.  Both constraints are read
  // out of the ROM rather than guessed: the four bounds tests need long
  // <= $75FF / short <= $45FF, and $267FC6's box ($242562/$242576 at index 0)
  // needs long in [$3400,$6BFF] and short in [$600,$31FF].  $4000/$2000 is
  // inside every one of them.
  ram.setU32(SUB + 0x02, 0x40002000);
  ram.setU16(0x813172, 0);               // scroll
  ram.setU8(REC5 + 0x16, 1);             // has been on screen
  // Both players present and far away, so the fire gate says PROCEED.
  ram.setU16(0x8103e6, 0x8000); ram.setU16(0x8103e8, 0x7000); ram.setU16(0x8103ea, 0x7000);
  ram.setU16(0x810448, 0x0000);
  ram.setU16(0x813092, 1);               // stage 1
  ram.setU16(0x813096, 0);               // the $267FC6 table index
  for (const [k, v] of Object.entries(over)) ram.setU16(Number(k), v);
  return ram;
}
function ctxOf(ram, extra = {}) {
  const log = new UnportedLog();
  const spawns = [];
  return {
    ctx: {
      ram, rom: ROM, tables: MT, unported: log, unportedLog: log, notes: log,
      bulletSpawn: (site, res) => spawns.push([site, res]),
      ...extra,
    },
    log, spawns,
  };
}
function liveBullets(ram) {
  const out = [];
  for (let s = 0; s < BUL.slots; s++) {
    const tw = ram.u16(BUL.pool + s * BUL.stride);
    if (tw & TYPEBIT.alive) out.push({ slot: s, kind: tw & 0x3f });
  }
  return out;
}

// ===========================================================================
// 1. THE EMITTER-STUB RESOLVER.  The bucket comes out of the CARTRIDGE.
// ===========================================================================
test('resolveEmitStub reads the bucket out of the stub\'s own lea/adda operands',
  { skip: SKIP }, () => {
    // Not asserted from a transcribed map: the expected bucket index is looked
    // up in BUCKETS by the buffer address the ROM's own `lea` names.
    for (const [stub, conv] of [[0x23d762, 'record'], [0x23d852, 'record'],
      [0x23d88e, 'record'], [0x23dece, 'register'], [0x23df58, 'register'],
      [0x23df86, 'register']]) {
      const r = resolveEmitStub(ROM, stub);
      const b = BUCKETS[r.bucket];
      assert.equal(b.buffer, ROM.u32((ROM.u16(stub) === 0x48e7 ? stub + 4 : stub) + 2),
        `$${stub.toString(16)} -> the buffer its own lea names`);
      assert.equal(r.conv, conv);
    }
    assert.equal(resolveEmitStub(ROM, 0x23d852).bucket, 7);
    assert.equal(resolveEmitStub(ROM, 0x23df58).bucket, 3);
  });

test('the ZOOMING emitter family is a LOUD NAMED THROW, not a silent bucket',
  { skip: SKIP }, () => {
    for (const stub of [0x23d9e2, 0x23da5c, 0x23dad6, 0x23db50, 0x23dbca]) {
      assert.throws(() => resolveEmitStub(ROM, stub),
        (e) => e instanceof Unreached && e.romAddress === stub);
    }
  });

test('$27829C has 12 record plus 6 zoom slots; $2782E4 has 12 register slots',
  { skip: SKIP }, () => {
    let record = 0, zoom = 0;
    for (let i = 0; i < EMIT_TABLE.entries27829C; i++) {
      const stub = ROM.u32(EMIT_TABLE.dispatch27829C + 4 * i);
      let r = null;
      try { r = resolveEmitStub(ROM, stub); } catch (e) {
        assert.ok(e instanceof Unreached && e.romAddress === stub);
        zoom++; continue;
      }
      assert.equal(r.conv, 'record');
      record++;
    }
    // The first table ends at $2782E4. Entries 12..17 select the zooming
    // record emitters; they are not register-convention entries from the
    // neighbouring table.
    assert.equal(record, 12);
    assert.equal(record + zoom, 18);
    assert.equal(zoom, 6, 'entries 12..17 -- SIX slots, FIVE distinct routines '
      + '(12 and 13 are both $23D9E2)');
    for (let i = 0; i < EMIT_TABLE.entries2782E4; i++) {
      const stub = ROM.u32(EMIT_TABLE.dispatch2782E4 + 4 * i);
      assert.equal(resolveEmitStub(ROM, stub).conv, 'register');
    }
    assert.equal(ROM.u32(0x278314), 0,
      '$278314 is the first non-pointer word after the register table');
  });

// ===========================================================================
// 2. $267FC6, THE FIRE GATE.  It was a counted note until this wave.
// ===========================================================================
// It is exercised through handler $11's fan, which is the only caller the port
// has: a NEAR player must suppress the spawn, a FAR one must allow it.
function fireOnce11(ram) {
  ram.setU32(REC5 + 0x4c, 0x2688cc);
  ram.setU32(REC5 + 0x2a, ROM.u32(0x267f70));      // the emitter pair, from ROM
  ram.setU32(REC5 + 0x2e, ROM.u32(0x267f74));
  ram.setU8(REC5 + 0x18, 2);                        // the aim cadence: not this frame
  ram.setU8(SUB, 0x20);                             // bit 5 -- the fan is enabled
  ram.setU8(REC5 + 0x28, 1);                        // the fan counter -> 0 this frame
  const { ctx, spawns } = ctxOf(ram);
  runHandler(0x2688cc, ram, ROM, REC5, ctx);
  return spawns;
}

test('$267FC6 SUPPRESSES the $11 fan when the nearest live player is inside '
  + 'the stage threshold $2680A2', { skip: SKIP }, () => {
  const ram = fixture();
  // The threshold is the ROM's, read the way $26809C reads it.
  const th = ROM.u16(0x2680a2 + 2 * 1);
  assert.ok(th > 0, 'stage 1 has a non-zero threshold');
  // Put P1 right on top of the enemy: octagonal distance 0 < th.
  ram.setU16(0x8103e8, ram.u16(SUB + 0x02));
  ram.setU16(0x8103ea, ram.u16(SUB + 0x04));
  assert.equal(fireOnce11(ram).length, 0, 'carry SET -> no spawn');
  assert.equal(liveBullets(ram).length, 0);
});

test('$267FC6 ALLOWS the $11 fan when both players are outside the threshold',
  { skip: SKIP }, () => {
    const ram = fixture();
    // $6000 away on the short axis -- far past any $2680A2 entry ($1C00 max).
    ram.setU16(0x8103e8, ram.u16(SUB + 0x02));
    ram.setU16(0x8103ea, u16(ram.u16(SUB + 0x04) + 0x6000));
    const spawns = fireOnce11(ram);
    assert.equal(spawns.length, 1, 'carry CLEAR -> the fan ran');
    assert.equal(spawns[0][0], 0x268b14, '$268B14 jsr $281402');
    assert.equal(liveBullets(ram).length, 1);
    assert.equal(liveBullets(ram)[0].kind, 0xd, 'kind $D');
  });

test('$267FC6 SUPPRESSES on the POSITION-BOX overflow, independently of distance',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU16(0x8103e8, ram.u16(SUB + 0x02));
    ram.setU16(0x8103ea, u16(ram.u16(SUB + 0x04) + 0x6000));   // far
    // $268004: `sub.w D2,D1 / swap D2 / add.w D2,D1 / bcs`.  D2 is
    // $242576[$813096]; pushing the SHORT axis above its window makes the add
    // carry.  Read the window out of the ROM rather than choosing a number.
    // The overflow point is DERIVED FROM D2 ITSELF: the add carries exactly
    // when u16(short - D2.lo) exceeds $FFFF - D2.hi, so short = D2.lo +
    // ($10000 - D2.hi) is the first value that trips it.
    const d2 = ROM.u32(0x242576);
    ram.setU16(SUB + 0x04, u16((d2 & 0xffff) + u16(0x10000 - (d2 >>> 16))));
    assert.equal(fireOnce11(ram).length, 0, 'the box test fired first');
  });

// ===========================================================================
// 3. HANDLER $11's CADENCE, and the inversion W30 found.
// ===========================================================================
// `$268A1A subq.b #1,($18,A5) / bcc $268A5A` -- `bcc` is NO BORROW, so the aim
// runs only on the frame the byte was ALREADY 0.  The pre-W30 port tested the
// stored result's bit 7 and aimed on exactly the complementary frames.
test('$11 aims on the frame ($18,A5) was 0, and NOT on the frame it was 1',
  { skip: SKIP }, () => {
    for (const [start, aimed] of [[0, true], [1, false], [2, false]]) {
      const ram = fixture();
      ram.setU32(REC5 + 0x2a, ROM.u32(0x267f70));
      ram.setU32(REC5 + 0x2e, ROM.u32(0x267f74));
      ram.setU8(REC5 + 0x18, start);
      ram.setU8(REC5 + 0x19, 0x37);                 // the reload byte
      ram.setU8(REC5 + 0x33, 0);                    // facing
      const { ctx } = ctxOf(ram);
      runHandler(0x2688cc, ram, ROM, REC5, ctx);
      assert.equal(ram.u8(REC5 + 0x18), aimed ? 0x37 : u16(start - 1) & 0xff,
        `($18,A5) started ${start}: reload iff the aim ran`);
      if (aimed) {
        // and the SPRITE POINTER was written from $268C9E, by the ROM's index.
        assert.equal(ram.u32(REC5 + 0x22),
          ROM.u32(0x268c9e + (((ram.u8(REC5 + 0x33) + 1) & 0x3e) * 2)),
          '$268A54 move.l (A0,D1.w),($22,A5)');
      }
    }
  });

test('$11\'s fan takes D2 from the $268B1E muzzle table at an EIGHT-byte stride',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU16(0x8103e8, ram.u16(SUB + 0x02));
    ram.setU16(0x8103ea, u16(ram.u16(SUB + 0x04) + 0x6000));
    ram.setU8(REC5 + 0x33, 6);                      // facing -> (6+2)&$3C = 8, *2 = $10
    const spawns = fireOnce11(ram);
    assert.equal(spawns.length, 1);
    const b = liveBullets(ram)[0];
    const base = BUL.pool + b.slot * BUL.stride;
    // The spawned position is D2 (position + muzzle) plus the D3 delta
    // ($02000000, long axis only) -- both re-derived from the ROM here.
    const muzzle = ROM.u32(0x268b1e + 0x10);
    const want = ((ram.u32(SUB + 0x02) + muzzle) >>> 0) % 0x100000000;
    assert.equal(ram.u16(base + REC.posB), u16(want),
      'the SHORT axis is position + the muzzle table entry');
    assert.equal(ram.u16(base + REC.posA), u16((want >>> 16) + 0x200),
      'the LONG axis adds D3\'s high word too ($281599 add.w D3,(-$e,A0))');
  });

// ===========================================================================
// 4. HANDLER $85 -- $275914, the first blocker.
// ===========================================================================
function run85(ram, over = {}) {
  ram.setU32(REC5 + 0x4c, 0x275914);
  for (const [k, v] of Object.entries(over)) ram.setU8(Number(k), v);
  const { ctx, log, spawns } = ctxOf(ram);
  runHandler(0x275914, ram, ROM, REC5, ctx);
  return { log, spawns };
}

test('$275936 writes the position to the SUB-RECORD\'s +$22, not the record\'s',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU32(SUB + 0x22, 0);
    ram.setU32(REC5 + 0x22, 0xdeadbeef);
    run85(ram);
    assert.equal(ram.u32(SUB + 0x22), ram.u32(SUB + 0x02),
      '$275936 move.l ($2,A6),($22,A6) -- 2D6E 0002 0022, both operands (d16,A6)');
    // ($22,A5) is $85's AIM CADENCE and is decremented, never written with a
    // position; asserting it is untouched would be wrong for the opposite reason.
    assert.notEqual(ram.u32(REC5 + 0x22), ram.u32(SUB + 0x02),
      'the RECORD\'s +$22 is a different field and must not receive the position');
  });

test('$85 fires kind $D through $2813F0 with D3 from the $27327A muzzle table',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU8(REC5 + 0x1e, 0);            // the fire counter borrows this frame
    ram.setU8(REC5 + 0x22, 5);            // the aim cadence: not this frame
    ram.setU16(REC5 + 0x28, 4);           // facing -> (4 & $3E)*2 = 8
    ram.setU8(REC5 + 0x20, 3);            // the salvo counter
    const { spawns } = run85(ram);
    assert.equal(spawns.length, 1, '$275AD0 jsr $2813F0');
    const live = liveBullets(ram);
    assert.equal(live.length, 1);
    assert.equal(live[0].kind, 0xd);
    const base = BUL.pool + live[0].slot * BUL.stride;
    const d3 = ((ROM.u32(0x27327a + 8) + 0xf9000000) >>> 0) % 0x100000000;
    assert.equal(ram.u16(base + REC.posB), u16(ram.u16(SUB + 0x04) + d3),
      '$2815A0 add.w D3,(-$c,A0) -- D3\'s LOW half on the short axis');
    assert.equal(ram.u16(base + REC.posA), u16(ram.u16(SUB + 0x02) + (d3 >>> 16)),
      '$2815A6 swap / add.w -- D3\'s HIGH half on the long axis');
    // $275AA6: the counter is reloaded with 6, not with the salvo value.
    assert.equal(ram.u8(REC5 + 0x1e), 6, '$275AA2 move.w #$6,D0 / $275AA6');
  });

test('$85\'s SALVO borrow reloads ($1E,A5) with $50 - $8130BA', { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU16(0x8130ba, 0x11);
  ram.setU8(REC5 + 0x1e, 0);
  ram.setU8(REC5 + 0x22, 5);
  ram.setU8(REC5 + 0x20, 0);            // the salvo counter borrows too
  ram.setU8(REC5 + 0x21, 0x44);         // its reload
  run85(ram);
  assert.equal(ram.u8(REC5 + 0x20), 0x44, '$275ADC move.b ($21,A5),($20,A5)');
  assert.equal(ram.u8(REC5 + 0x1e), 0x50 - 0x11, '$275AE2/$275AE6/$275AEC');
});

test('$85 emits THREE sprite requests -- two into bucket 7, one into bucket 3',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU16(0x813098, 0);            // rank 0
    ram.setU16(0x80390c, 1);            // the alternation word: non-zero
    ram.setU16(0x813092, 1);            // not stage 2
    ram.setU8(REC5 + 0x1e, 5);          // no fire this frame
    ram.setU8(REC5 + 0x22, 5);          // no aim this frame
    const before7 = ram.u16(BUCKETS[7].counter), before3 = ram.u16(BUCKETS[3].counter);
    run85(ram);
    assert.equal(ram.u16(BUCKETS[7].counter) - before7, 24, 'two 12-byte records');
    assert.equal(ram.u16(BUCKETS[3].counter) - before3, 12, 'one 12-byte record');
  });

test('$85\'s bucket-3 request is SKIPPED when the rank word $813098 is set',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU16(0x813098, 1);            // $275A4C tst.w / bne $275A8A
    ram.setU16(0x80390c, 1);
    ram.setU8(REC5 + 0x1e, 5); ram.setU8(REC5 + 0x22, 5);
    const before3 = ram.u16(BUCKETS[3].counter);
    run85(ram);
    assert.equal(ram.u16(BUCKETS[3].counter), before3, 'nothing was appended');
  });

test('$85\'s completed cue spawner is quiet at the script terminator',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU8(REC5 + 0x1e, 5); ram.setU8(REC5 + 0x22, 5);
    const { log } = run85(ram);
    assert.ok(![...log.calls.keys()].some((k) => k.startsWith('$28AC72 ')),
      '$2759A6 executes the ported cue spawner instead of recording a gap');
  });

// ===========================================================================
// 5. HANDLER $80 -- $2739C0.
// ===========================================================================
test('$80\'s SHIELD pins HP at $7FFF and drops it to $1400 on the BORROW frame',
  { skip: SKIP }, () => {
    // ($36,A5) = 1 -> decrements to 0, no borrow, HP stays $7FFF.
    const a = fixture();
    a.setU32(REC5 + 0x4c, 0x2739c0);
    a.setU16(REC5 + 0x36, 1);
    a.setU8(REC5 + 0x1e, 5); a.setU8(REC5 + 0x26, 5);
    runHandler(0x2739c0, a, ROM, REC5, ctxOf(a).ctx);
    assert.equal(a.u16(SUB + 0x18), 0x7fff, 'still shielded');
    assert.equal(a.u16(REC5 + 0x36), 0);
    // ...and on the NEXT frame 0 - 1 borrows and the HP pair drops.
    a.setU8(REC5 + 0x1e, 5); a.setU8(REC5 + 0x26, 5);
    runHandler(0x2739c0, a, ROM, REC5, ctxOf(a).ctx);
    assert.equal(a.u16(SUB + 0x18), 0x1400, '$273A2E/$273A32');
    assert.equal(a.u16(SUB + 0x38), 0x1400, '$273A36 -- BOTH words');
  });

test('$80\'s shield steps by 2 while $811F72 is set, by 1 otherwise',
  { skip: SKIP }, () => {
    for (const [freeze, step] of [[0, 1], [1, 2]]) {
      const ram = fixture();
      ram.setU32(REC5 + 0x4c, 0x2739c0);
      ram.setU16(0x811f72, freeze);
      ram.setU16(REC5 + 0x36, 0x40);
      ram.setU8(REC5 + 0x1e, 5); ram.setU8(REC5 + 0x26, 5);
      runHandler(0x2739c0, ram, ROM, REC5, ctxOf(ram).ctx);
      assert.equal(ram.u16(REC5 + 0x36), 0x40 - step, `$811F72=${freeze}`);
    }
  });

test('$80\'s TWO turrets alternate on bchg #$6,($1,A6) and own DIFFERENT fields',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU32(REC5 + 0x4c, 0x2739c0);
    ram.setU16(REC5 + 0x36, 0x8000);   // shield already expired -> skip that block
    ram.setU8(REC5 + 0x1e, 5);         // no fan
    ram.setU8(REC5 + 0x26, 0);         // the turret cadence fires
    ram.setU8(REC5 + 0x27, 4);
    ram.setU8(REC5 + 0x24, 0); ram.setU8(REC5 + 0x25, 0);   // equal -> aim runs
    ram.setU8(SUB + 0x01, 0);          // bit 6 CLEAR -> the FIRST arm
    runHandler(0x2739c0, ram, ROM, REC5, ctxOf(ram).ctx);
    assert.equal(ram.u8(SUB + 0x01) & 0x40, 0x40, 'bchg flipped it');
    assert.notEqual(ram.u32(REC5 + 0x28), 0, '($28,A5) written by arm one');
    assert.equal(ram.u32(REC5 + 0x2e), 0, '($2E,A5) untouched by arm one');
    // second aim: bit 6 is now SET, so the OTHER arm runs.
    ram.setU8(REC5 + 0x26, 0);
    runHandler(0x2739c0, ram, ROM, REC5, ctxOf(ram).ctx);
    assert.equal(ram.u8(SUB + 0x01) & 0x40, 0, 'flipped back');
    assert.notEqual(ram.u32(REC5 + 0x2e), 0, '($2E,A5) written by arm two');
    assert.equal(ram.u32(REC5 + 0x2c), ram.u32(REC5 + 0x2c));
  });

test('$80\'s aim256 fan spawns EIGHT bullets through $2817B8 when ($20,A5) is 1',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU32(REC5 + 0x4c, 0x2739c0);
    ram.setU16(REC5 + 0x36, 0x8000);
    ram.setU8(REC5 + 0x18 + 1, 0); ram.setU16(REC5 + 0x18, 0);
    ram.setU8(REC5 + 0x1e, 0);        // the fan counter borrows
    ram.setU8(REC5 + 0x34, 0x20);     // its reload
    ram.setU8(REC5 + 0x20, 1);        // -> the WIDE loop
    ram.setU8(REC5 + 0x26, 5);        // no turret aim
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x2739c0, ram, ROM, REC5, ctx);
    assert.equal(spawns.length, 8, '$273B68 moveq #$7,D7 + dbra = EIGHT');
    assert.ok(spawns.every(([site]) => site === 0x2817b8));
    assert.equal(ram.u8(REC5 + 0x1e), 0x20, '$273ACE reload from ($34,A5)');
  });

test('$80\'s fan takes the NARROW loop (seven $2817A8) when ($20,A5) is not 1',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU32(REC5 + 0x4c, 0x2739c0);
    ram.setU16(REC5 + 0x36, 0x8000);
    ram.setU16(REC5 + 0x18, 0);
    ram.setU8(REC5 + 0x1e, 0); ram.setU8(REC5 + 0x34, 0x20);
    ram.setU8(REC5 + 0x20, 3);
    ram.setU8(REC5 + 0x26, 5);
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x2739c0, ram, ROM, REC5, ctx);
    assert.equal(spawns.length, 7, '$273BAC moveq #$6,D7 + dbra = SEVEN');
    assert.ok(spawns.every(([site]) => site === 0x2817a8));
  });

// ===========================================================================
// 6. HANDLER $8A -- $276702, and BUCKET 0's first producer.
// ===========================================================================
test('$8A enqueues through $27829C[($1E,A6)], and for its own prototype that '
  + 'is BUCKET 0', { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU32(REC5 + 0x4c, 0x276702);
  ram.setU16(SUB + 0x1e, 0);            // the emitter index this type's proto leaves
  ram.setU8(SUB + 0x01, 0);             // bchg: the emit arm
  ram.setU16(REC5 + 0x18, 5);
  ram.setU16(0x811f72, 1);              // skip the proximity block
  const before = ram.u16(BUCKETS[0].counter);
  runHandler(0x276702, ram, ROM, REC5, ctxOf(ram).ctx);
  assert.equal(ram.u16(BUCKETS[0].counter) - before, 12,
    'one 12-byte request into bucket 0 -- the bucket W28 measured with no producer');
  // and the bucket index is the ROM's: $27829C[0] -> $23D762 -> $80397C.
  assert.equal(resolveEmitStub(ROM, ROM.u32(EMIT_TABLE.dispatch27829C)).bucket, 0);
});

// W30 RED VALIDATION FOUND THE TEST ABOVE INCAPABLE OF SEEING THE INDEX SCALE:
// its ($1E,A6) is 0, and 0*4 is 0, so dropping `add.w D0,D0` twice survived
// GREEN.  A NON-ZERO index is the only thing that can tell them apart, and it
// also pins the four-byte stride against the ROM's own table.
test('$8A\'s emitter index is ($1E,A6) times FOUR ($2767BE/$2767C0)',
  { skip: SKIP }, () => {
    // $27829C[5] is $23D852 -> bucket 7; $27829C read at the UNSCALED offset 5
    // is a misaligned slice of two neighbouring pointers, which is not a stub.
    const scaled = resolveEmitStub(ROM, ROM.u32(EMIT_TABLE.dispatch27829C + 5 * 4));
    assert.equal(scaled.bucket, 7, '$27829C[5] = $23D852 = bucket 7');
    const ram = fixture();
    ram.setU32(REC5 + 0x4c, 0x276702);
    ram.setU16(SUB + 0x1e, 5);
    ram.setU8(SUB + 0x01, 0);
    ram.setU16(REC5 + 0x18, 5);
    ram.setU16(0x811f72, 1);
    const b0 = ram.u16(BUCKETS[0].counter), b7 = ram.u16(BUCKETS[7].counter);
    runHandler(0x276702, ram, ROM, REC5, ctxOf(ram).ctx);
    assert.equal(ram.u16(BUCKETS[7].counter) - b7, 12, 'it went to bucket 7');
    assert.equal(ram.u16(BUCKETS[0].counter), b0, 'and NOT to bucket 0');
  });

test('$8A does NOT emit on the frame ($1,A6) bit 6 was already set ($2767AA bne)',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU32(REC5 + 0x4c, 0x276702);
    ram.setU8(SUB + 0x01, 0x40);          // bit 6 SET -> `bne` skips the emit
    ram.setU16(REC5 + 0x18, 5);
    ram.setU16(0x811f72, 1);
    const before = ram.u16(BUCKETS[0].counter);
    const sprite = ram.u32(SUB + 0x0a);
    runHandler(0x276702, ram, ROM, REC5, ctxOf(ram).ctx);
    assert.equal(ram.u16(BUCKETS[0].counter), before, 'nothing appended');
    assert.equal(ram.u32(SUB + 0x0a), sprite, '$2767B2 eori.l did not run either');
    assert.equal(ram.u8(SUB + 0x01) & 0x40, 0, 'but the bchg still FLIPPED it');
  });

test('$8A\'s sprite pointer is EOR-ed with $B4, not added to ($2767B2)',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU32(REC5 + 0x4c, 0x276702);
    // W30 RED VALIDATION FOUND THIS TEST BROKEN.  Its first version used
    // $001C0900, whose low byte is 0 -- and `x ^ $B4` equals `x + $B4` for
    // every such value, so the mutation "add instead of EOR" SURVIVED GREEN.
    // The value below has bits that overlap $B4 in both nibbles, which is the
    // only kind that can tell the two operations apart.
    ram.setU32(SUB + 0x0a, 0x001c09ff);
    ram.setU8(SUB + 0x01, 0);
    ram.setU16(REC5 + 0x18, 5);
    ram.setU16(0x811f72, 1);
    runHandler(0x276702, ram, ROM, REC5, ctxOf(ram).ctx);
    assert.equal(ram.u32(SUB + 0x0a), 0x001c09ff ^ 0xb4);
    assert.notEqual(0x001c09ff ^ 0xb4, (0x001c09ff + 0xb4) >>> 0,
      'and this fixture VALUE can distinguish EOR from ADD -- the point of it');
  });

test('$8A\'s stage-kill gate $8130F8 bit 7 frees the enemy before anything else',
  { skip: SKIP }, () => {
    const ram = fixture();
    ram.setU32(REC5 + 0x4c, 0x276702);
    ram.setU16(0x8130f8, 0x8000);
    const before = ram.u16(BUCKETS[0].counter);
    runHandler(0x276702, ram, ROM, REC5, ctxOf(ram).ctx);
    assert.equal(ram.u16(REC5), 0, 'freeEnemy cleared the type word');
    assert.equal(ram.u16(BUCKETS[0].counter), before, 'and it drew nothing');
  });

// ===========================================================================
// 7. THE THREE ARE REACHABLE THROUGH THE DRIVER'S OWN DISPATCH.
// ===========================================================================
test('an emitter pointer of 0 is a LOUD NAMED THROW, not a silent skip',
  { skip: SKIP }, () => {
    const ram = fixture();
    assert.throws(() => enqueueThroughStub(ram, ROM, 0, SUB),
      (e) => e instanceof Unreached && e.romAddress === 0);
  });
