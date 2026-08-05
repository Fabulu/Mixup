// WAVE 61 (I2) -- THE ITEM: `$27E812`, `$27E99E`, the six bodies, the ten
// collect routines (`src/items.js`).
//
// SHAPE OF THESE TESTS, and the two failures this project keeps re-finding:
//
//  * **NO ASSERTION MAY SEED ITS OWN ANSWER.**  W60's M13 placed records at
//    `slot * DMG.itemStride` and then asserted on a record found through the
//    same constant, so it agreed with itself whatever the constant held.  Every
//    fixture here writes at LITERAL byte offsets -- `0x816b7a + 0x40` spelled
//    out -- and the assertions that matter read values THE CARTRIDGE decides:
//    the half-extents out of the ROM template, the power counts out of the
//    `$25523C` lists, the sprite address out of `$27EA1A`.
//  * **NO FIXTURE MAY SIT WHERE TWO READINGS AGREE.**  The pools have SIX
//    different bases and FOUR different slot counts, so a fixture that used one
//    pool would let a port that ignored `d0` pass; the allocator tests walk all
//    six.  The dispatch mask is `$3C`, so the kind fixtures carry collect bits
//    and the initialised bit as well, where a `$FF` mask and a `$3C` mask give
//    different answers.
//
// Every throw assertion pins `e.romAddress`, never the message text.  Tests
// that need the cartridge SKIP LOUDLY when the export is absent, and A SKIP IS
// NOT A PASS.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { BUCKETS } from '../src/spritequeue.js';
import {
  ITEM, I, POOLS, DISPATCH, TEMPLATES, ANIM4, ANIM_LISTS, ANIM_END, POWER,
  REFUSED_KINDS, RNG_242B3C,
  clearItemPool, spawnItem, fill27F6AE, freeItem, runItemDriver, itemCensus,
  collect27F54C, collectMax27F582, collectedStep27F5F4,
  collect252C96, collect252D24, collect252DAC, collect252E26,
  collect25310E, collect253126, beamReset25270C, bcd242AC6, drawByte242B3C,
} from '../src/items.js';
import { TYPE5, TYPE5_PORTED } from '../src/type5.js';
import { SPAWN } from '../src/spawn.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- run tools/export-tables.py. THIS IS '
    + 'A SKIP, NOT A PASS.';

/** `assert.throws` does not hand back the error, and a test that writes
 *  `assert.throws(f).romAddress` throws inside itself and reports the WRONG
 *  reason.  This returns it. */
function throwsAt(fn, addr, what) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  assert.ok(caught instanceof Unreached, `${what}: expected a LOUD NAMED THROW`);
  assert.equal(caught.romAddress, addr, what);
  return caught;
}

function ctxOf() {
  const log = new UnportedLog();
  return { ctx: { unportedLog: log, unported: log, tables: MT, rom: ROM }, log };
}
/** A player-ish record the fill can take a position out of ($27F6C4). */
function dying(ram, y = 0x2000, x = 0x1800, at = 0x8103e6) {
  ram.setU32(at + 0x02, ((y << 16) | x) >>> 0);
  return at;
}

// ===========================================================================
// 1. THE GEOMETRY.  Six pools, and every landmark comes from something that is
//    not this file's own arithmetic.
// ===========================================================================

test('the six item pools abut EXACTLY and close on $8171BA, the live count', () => {
  // Walked in $27E812's own order, each pool sized by its own `move.w #n,D2`.
  let at = ITEM.base;
  for (const p of POOLS) {
    assert.equal(at, p.base,
      `kind $${p.d0.toString(16)} should start at $${at.toString(16)}`);
    assert.equal(p.slots, p.d2 + 1, '`dbra D2` runs D2+1 times');
    at += p.slots * ITEM.stride;
  }
  assert.equal(at, ITEM.count,
    '$27F6DC addq.w #1,$8171BA -- the live count sits ONE PAST the 25 slots');
  assert.equal(at - ITEM.base, 25 * 0x40);
  assert.equal(POOLS.reduce((n, p) => n + p.slots, 0), ITEM.slots);
  // AND THE FAMILY'S LOWER NEIGHBOUR CLOSES ON IT TOO, which nothing has
  // written down: `src/spawn.js`'s DEFQ_DUMMY -- `$2636CA lea $816B2A,A0`, the
  // record the deferred spawn queue drops into when it is full -- is $50 bytes
  // ($2634BA addi.w #$50,D2) and $816B2A + $50 == $816B7A EXACTLY. So the
  // silent-drop record ends where item slot 0 begins, and a wave that widened
  // either would corrupt the other.
  assert.equal(SPAWN.DEFQ_DUMMY + SPAWN.DEFQ_STRIDE, ITEM.base,
    'the deferred spawn queue drop record abuts item slot 0');
});

test('$27E98A clears the 25 slots AND both counters, and lands on impact pool '
  + 'A\'s base', () => {
  // $27E990 move.w #$321,D0 + the dbra's own pass.  If it covered only the
  // slots it would be 58 bytes short and leave a live count behind.
  assert.equal(ITEM.clearWords * 2, 25 * 0x40 + 4);
  assert.equal(ITEM.base + ITEM.clearWords * 2, 0x8171be,
    '$8171BE is IMPACT POOL A\'s base (50-recon-effects §1.1) -- the item '
    + 'family and the five effect pools are one contiguous region');
  const ram = new Ram();
  for (let i = 0; i < 25 * 0x20 + 2; i++) ram.setU16(ITEM.base + i * 2, 0xbeef);
  ram.setU16(0x8171be, 0xcafe);
  clearItemPool(ram);
  assert.equal(ram.u16(0x8171ba), 0);
  assert.equal(ram.u16(0x8171bc), 0);
  assert.equal(ram.u16(0x8171be), 0xcafe,
    'and it must NOT reach into impact pool A');
});

// ===========================================================================
// 2. THE ALLOCATOR.  All six arms, the refusal, and the pool-full return.
// ===========================================================================

test('$27E812 allocates from the RIGHT pool for every kind it accepts, and '
  + 'fills the slot from THE CARTRIDGE\'s template', { skip: SKIP }, () => {
  for (const p of POOLS) {
    if (REFUSED_KINDS.includes(p.d0)) continue;
    const ram = new Ram();
    const { ctx } = ctxOf();
    const a6 = dying(ram, 0x3456, 0x1234);
    // THE SLOT IS DIRTIED FIRST, and it has to be.  [M] words 10 and 11 of all
    // six templates ($27F766..) are `0000`, so a fill that copied FIVE longs
    // instead of six would agree with the cartridge on a zeroed `Ram` and
    // differ on a RE-USED slot -- which is the only kind the game ever has,
    // because `$27F6AE` writes 32 of the record's 64 bytes and nothing clears
    // the rest.
    for (let k = 0; k < 0x40; k += 2) ram.setU16(p.base + k, 0xbeef);
    ram.setU16(p.base, 0);                 // ...but the slot must read as FREE
    const got = spawnItem(ram, ROM, ctx, p.d0, a6, 0x275b06);
    assert.equal(got, p.base, `kind $${p.d0.toString(16)} -> $${p.base.toString(16)}`);
    assert.equal(ram.u16(got), 0x8000 | p.d0, '$27F6B4 ori.w #$8000,D1');
    assert.equal(ram.u16(got + 0x02), 0x3456, '$27F6C4 move.l ($2,A6),(A0)+');
    assert.equal(ram.u16(got + 0x04), 0x1234);
    assert.equal(ram.u16(ITEM.count), 1, '$27F6DC addq.w #1');
    // ALL TWENTY-SIX TEMPLATE BYTES, +$06..+$1F, against the CARTRIDGE's own
    // -- not two words of them.  `$27F6C8` is six `move.l (A2)+,(A0)+` and one
    // `move.w`, and a copy that stopped at five longs would leave +$1A/+$1B
    // (the SPEED and ANGLE) holding the previous item's, which no assertion on
    // the half-extents alone can see.
    const tmpl = TEMPLATES[p.d0 >> 2];
    for (let k = 0; k < 13; k++) {
      assert.equal(ram.u16(got + 0x06 + k * 2), ROM.u16(tmpl + k * 2),
        `template word ${k} (+$${(6 + k * 2).toString(16)})`);
    }
    assert.equal(ram.u16(got + I.hitLong), 0x0600,
      'block 2 reads +$10/+$12 and every kind carries $0600');
  }
});

test('$27E812 walks its OWN pool\'s slots and stops there -- kind $04 has TWO, '
  + 'not eight', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx, log } = ctxOf();
  const a6 = dying(ram);
  // Kind $04's pool is $816D7A and it is TWO slots; the third allocation must
  // be REFUSED rather than spilling into kind $08's $816DFA.
  assert.equal(spawnItem(ram, ROM, ctx, 4, a6), 0x816d7a);
  assert.equal(spawnItem(ram, ROM, ctx, 4, a6), 0x816dba);
  assert.equal(spawnItem(ram, ROM, ctx, 4, a6), null, 'the pool is FULL');
  assert.equal(ram.u16(0x816dfa), 0, 'kind $08\'s pool is untouched');
  assert.equal(ram.u16(ITEM.count), 2, 'and the FULL return does not count');
  assert.ok([...log.calls.keys()].some((k) => k.startsWith('$27E884')),
    'the silent failure is COUNTED -- neither call site tests the carry');
});

test('$27E812 REFUSES the two hyper-stock kinds and counts what it did not '
  + 'grant', { skip: SKIP }, () => {
  // THE LIST IS THE CLAIM.  Iterating `REFUSED_KINDS` alone is vacuous -- an
  // empty list makes the loop body never run and the test pass, which is
  // exactly what emptying it did on the first mutation pass.
  assert.deepEqual([...REFUSED_KINDS], [0x0c, 0x14],
    'kinds $0C and $14 are P1 and P2 HYPER STOCK; recon 59 §5.2 measures one '
    + 'extra stock as +16 RANK PERMANENTLY at the next super');
  for (const d0 of [0x0c, 0x14]) {
    const ram = new Ram();
    const { ctx, log } = ctxOf();
    assert.equal(spawnItem(ram, ROM, ctx, d0, dying(ram)), null);
    assert.equal(ram.u16(ITEM.count), 0, 'nothing was allocated');
    const pool = POOLS.find((p) => p.d0 === d0);
    assert.equal(ram.u16(pool.base), 0, 'and its pool is untouched');
    const k = [...log.calls.keys()].find((x) =>
      x.startsWith(d0 === 0x0c ? '$2530BE' : '$2530E6'));
    assert.ok(k, 'the refusal names the COLLECT routine it prevented');
    assert.ok(/81B65[CE]/.test(k), 'and the stock word it would have raised');
  }
});

test('$27E812 throws by address for a D0 outside the six kinds, instead of '
  + 'silently landing in $81717A\'s ONE slot', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  throwsAt(() => spawnItem(ram, ROM, ctx, 0x18, dying(ram)), 0x27e86c,
    '$27E812\'s ELSE arm -- a wrong D0 changes the POOL and the KIND');
});

test('$27F6AE\'s template index is RANGE-CHECKED: entries [6] and [7] of '
  + '$27F746 are CODE', { skip: SKIP }, () => {
  assert.equal(TEMPLATES[6], 0x27f7e8);
  assert.equal(TEMPLATES[7], 0x27f7e8);
  assert.equal(TEMPLATES[5], TEMPLATES[3], 'entry [5] ALIASES entry [3]');
  const ram = new Ram();
  const { ctx } = ctxOf();
  throwsAt(() => fill27F6AE(ram, ROM, ctx, ITEM.base, 0x18, dying(ram)),
    ITEM.templateTable, '$27F6B8 movea.l ($27F746,A2,D0.w)');
});

test('$27F2F0 clears a LONGWORD -- +$00 AND +$02 -- which is what lets block 2 '
  + 'test +$02 while the driver tests +$00', () => {
  const ram = new Ram();
  ram.setU16(0x816b7a + 0x00, 0x8004);
  ram.setU16(0x816b7a + 0x02, 0x1111);
  ram.setU16(0x816b7a + 0x04, 0x2222);
  ram.setU16(ITEM.count, 3);
  assert.equal(freeItem(ram, 0x816b7a), true, 'ori #$1,SR -- it returns CARRY');
  assert.equal(ram.u16(0x816b7a + 0x00), 0);
  assert.equal(ram.u16(0x816b7a + 0x02), 0, 'the LONGWORD, not the word');
  assert.equal(ram.u16(0x816b7a + 0x04), 0x2222, '...and no further');
  assert.equal(ram.u16(ITEM.count), 2);
});

// ===========================================================================
// 3. THE DRIVER.  The live count, the skip that does not consume it, and both
//    range checks.
// ===========================================================================

/** Put a live record at a LITERAL byte offset -- never `slot * ITEM.stride`. */
function putItem(ram, byteOff, { kind = 0, y = 0x2000, x = 0x1800,
  hi = 0x80, init = true } = {}) {
  const r = 0x816b7a + byteOff;
  ram.setU16(r + 0x00, ((hi | (init ? 0x20 : 0)) << 8) | kind);
  ram.setU16(r + 0x02, y);
  ram.setU16(r + 0x04, x);
  ram.setU16(r + 0x0c, 0x0202);
  ram.setU16(r + 0x10, 0x0600);
  ram.setU16(r + 0x12, 0x0600);
  return r;
}

test('$27E99E walks $8171BA RECORDS, and the empty-slot skip does NOT consume '
  + 'the dbra', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  // Slots 0, 5 and 20 -- byte offsets 0, $140 and $500, spelled out.
  putItem(ram, 0x000); putItem(ram, 0x140); putItem(ram, 0x500);
  ram.setU16(ITEM.count, 3);
  const t = runItemDriver(ram, ROM, ctx);
  assert.equal(t.walked, 3,
    'the third record is FIFTEEN empty slots past the second; a walk that '
    + 'spent the counter on empties would reach one');
  // ...and the CONTROL that makes it a statement about the COUNTER and not
  // about the layout: the same three records with the count at ONE.
  const ram2 = new Ram();
  putItem(ram2, 0x000); putItem(ram2, 0x140); putItem(ram2, 0x500);
  ram2.setU16(ITEM.count, 1);
  assert.equal(runItemDriver(ram2, ROM, ctxOf().ctx).walked, 1);
});

test('$27E99E throws by address when the count over-reports, instead of walking '
  + 'off the 25 slots into impact pool A', { skip: SKIP }, () => {
  const ram = new Ram();
  putItem(ram, 0x000);
  ram.setU16(ITEM.count, 2);              // one record, the count says two
  throwsAt(() => runItemDriver(ram, ROM, ctxOf().ctx), 0x27e9b0,
    '$27E9B0 lea ($40,A6),A6 -- the empty-slot skip has nothing left to find');
});

test('$27E99E dispatches on the $3C MASK -- bits 2..5 -- so the collect flags '
  + 'and the initialised bit do NOT change the kind', { skip: SKIP }, () => {
  // status $A011: allocated ($8000) + P2 touch ($0800, bit 11) + initialised
  // ($2000) + kind $10 + collected-normally (bit 0).  A port that masked $FF
  // would index 4 past the table; a port that masked $3F would index $10>>2.
  const ram = new Ram();
  const r = putItem(ram, 0x000, { kind: 0x10 });
  ram.setU16(r, 0xa010);
  ram.setU16(ITEM.count, 1);
  const t = runItemDriver(ram, ROM, ctxOf().ctx);
  assert.equal(t.emitted, 1, 'kind $10\'s body ran and emitted');
  assert.equal((0xa010 & ITEM.kindMask) >> 2, 4, 'index 4 == $27F1A6');
  assert.equal(DISPATCH[4], 0x27f1a6);
});

test('$27E9DE moveq #$3C is FOUR ALIGNED BITS -- a $3F mask would form a byte '
  + 'offset that straddles two table entries', { skip: SKIP }, () => {
  assert.equal(ITEM.kindMask, 0x3c);
  // status $8011: kind $10 PLUS collected-normally (bit 0).  `$3C` gives byte
  // offset $10 and `$3F` gives $11 -- and $11 is not a longword boundary, so
  // `$27E9E8 adda.w D0,A0 / movea.l (A0),A0` would read a pointer built from
  // half of entry [4] and half of entry [5].  A port that divides by four
  // before checking cannot tell the two masks apart at all.
  assert.equal((0x8011 & 0x3c) & 3, 0);
  assert.equal((0x8011 & 0x3f) & 3, 1, 'the two masks DIFFER on this fixture');
  const ram = new Ram();
  const r = putItem(ram, 0x000, { kind: 0x10 });
  ram.setU16(r, 0x8011);
  ram.setU32(r + I.list, ANIM_LISTS.a27F300);
  ram.setU16(ITEM.count, 1);
  const t = runItemDriver(ram, ROM, ctxOf().ctx);
  assert.equal(t.collected, 1, 'bit 0 routes it to the stepper, not the body');
  // ...and the same low bit on an UNCOLLECTED record must still dispatch by
  // the aligned offset rather than throwing on the alignment check.
  const ram2 = new Ram();
  const r2 = putItem(ram2, 0x000, { kind: 0x10 });
  ram2.setU16(r2, 0x8012);              // bit 1: $3C -> $10, $3F -> $12
  ram2.setU16(ITEM.count, 1);
  assert.equal(runItemDriver(ram2, ROM, ctxOf().ctx).emitted, 1);
});

test('$27E99E range-checks the dispatch: the $3C mask admits SIXTEEN indices '
  + 'and the table has EIGHT', { skip: SKIP }, () => {
  assert.equal(DISPATCH.length, ITEM.dispatchEntries);
  assert.equal(DISPATCH[6], ITEM.free, 'entry [6] is THE FREE');
  assert.equal(DISPATCH[7], 0x27ea18, 'entry [7] is the `rts` itself');
  const ram = new Ram();
  const r = putItem(ram, 0x000);
  ram.setU16(r, 0x8020);                  // kind bits = $20 -> index 8
  ram.setU16(ITEM.count, 1);
  throwsAt(() => runItemDriver(ram, ROM, ctxOf().ctx), ITEM.dispatch,
    '$27E9E2 -- index 8 lands in the sprite table at $27EA1A');
});

test('$27E99E REFUSES a hyper-kind record loudly, because $27E812 says one '
  + 'cannot exist', { skip: SKIP }, () => {
  for (const [idx, d0] of [[3, 0x0c], [5, 0x14]]) {
    const ram = new Ram();
    const r = putItem(ram, 0x000, { kind: d0 });
    void r;
    ram.setU16(ITEM.count, 1);
    throwsAt(() => runItemDriver(ram, ROM, ctxOf().ctx), DISPATCH[idx],
      `kind $${d0.toString(16)} is REFUSED at the allocator, so a record of it `
      + 'means something wrote a status word behind $27E812');
  }
});

test('$27E99E subtracts $813176 from the SHORT axis of every record, before '
  + 'anything else', { skip: SKIP }, () => {
  const ram = new Ram();
  const r = putItem(ram, 0x000, { x: 0x1800 });
  ram.setU16(ITEM.count, 1);
  ram.setU16(ITEM.scroll, 0x0040);
  runItemDriver(ram, ROM, ctxOf().ctx);
  // The body then adds its own velocity, so this asserts the SCROLL is in the
  // sum rather than asserting the sum: with the scroll at 0 the same fixture
  // must land $40 higher.
  const x1 = ram.u16(r + I.posX);
  const ram2 = new Ram();
  const r2 = putItem(ram2, 0x000, { x: 0x1800 });
  ram2.setU16(ITEM.count, 1);
  ram2.setU16(ITEM.scroll, 0x0000);
  runItemDriver(ram2, ROM, ctxOf().ctx);
  assert.equal(ram2.u16(r2 + I.posX) - x1, 0x40, '$27E9BE sub.w D0,($4,A6)');
});

test('a COLLECTED record goes to the animation stepper, not to its body -- and '
  + 'BOTH bit 7 and bit 0 route there', { skip: SKIP }, () => {
  for (const bit of [0x01, 0x80]) {
    const ram = new Ram();
    const r = putItem(ram, 0x000);
    ram.setU16(r, 0x8000 | bit);          // the LOW byte carries both flags
    ram.setU32(r + I.list, bit === 0x80 ? ANIM_LISTS.max27F500 : ANIM_LISTS.a27F300);
    ram.setU16(r + I.cursor, 0);
    ram.setU16(r + I.frame, 0x0202);
    ram.setU16(ITEM.count, 1);
    const t = runItemDriver(ram, ROM, ctxOf().ctx);
    assert.equal(t.collected, 1);
    assert.equal(t.emitted, 0, 'the body did not run');
  }
});

test('$27EA32 bset #5,(A6) is a BYTE op on the HIGH byte -- $8000 becomes '
  + '$A000, and reading it as a WORD bit puts it inside THE KIND',
{ skip: SKIP }, () => {
  const ram = new Ram();
  const r = putItem(ram, 0x000, { kind: 0, init: false });
  ram.setU16(r, 0x8000);                 // allocated, NOT yet initialised
  ram.setU16(ITEM.count, 1);
  runItemDriver(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u16(r) & 0x2000, 0x2000, 'bit 13 of the WORD');
  assert.equal(ram.u16(r) & 0x00ff, 0x0000,
    'and THE KIND is untouched -- bit 5 of the word would make it $20, which '
    + 'is dispatch index 8 and not a table entry at all');
  // ...and the init must not run a SECOND time.  `$27EACE` draws from the RNG,
  // so a re-init is visible as an extra counter bump as well as a new angle.
  const rng0 = ram.u8(0x803917);
  const ang0 = ram.u8(r + I.angle);
  ram.setU8(r + I.angle, (ang0 ^ 0x3f) & 0xff);
  runItemDriver(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u8(0x803917), rng0,
    '$27EA2A btst #$D,D1 / bne -- the init is ONCE');
});

test('the P2 arm of a body is reached by bit 11 -- $27EA46 andi.w #$1800 is '
  + 'BOTH players, not just P1\'s $1000', { skip: SKIP }, () => {
  const ram = new Ram();
  powerSeed(ram);
  const r = putItem(ram, 0x000, { kind: 0 });
  ram.setU16(r, 0xa800);                 // allocated + initialised + P2 TOUCH
  ram.setU16(ITEM.count, 1);
  runItemDriver(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u16(POWER.p2Shot), 2, '$252D24 ran');
  assert.equal(ram.u16(POWER.p1Shot), 0, 'and P1 did not');
  assert.equal(ram.u8(r + 1) & 0x01, 0x01, 'and it took the collect tail');
});

test('the four-frame cursor wraps 0/4/8/$C and NEVER leaves the four entries',
{ skip: SKIP }, () => {
  const ram = new Ram();
  const r = putItem(ram, 0x000, { kind: 0 });
  ram.setU16(ITEM.count, 1);
  // `$27EA8A subq.b #1,($c,A6) / bcc` advances on the BORROW, so a counter of
  // ZERO steps the cursor on every frame -- 2/2 (the body's own `#$202`) would
  // step it every third and hide the wrap behind the run length.
  const seen = [];
  for (let f = 0; f < 10; f++) {
    seen.push(ram.u16(r + I.anim));
    ram.setU16(r + I.frame, 0x0000);
    runItemDriver(ram, ROM, ctxOf().ctx);
  }
  assert.deepEqual(seen, [0, 4, 8, 0xc, 0, 4, 8, 0xc, 0, 4],
    '$27EA96 addq.w #4 / $27EA9A andi.w #$F -- without the mask the fifth step '
    + 'is $10, which is one longword PAST the four-entry table');
});

// ===========================================================================
// 4. THE DRAW.  Bucket 17, and the sprite address out of the cartridge.
// ===========================================================================

test('an item\'s body emits into BUCKET 17 with the sprite address the '
  + 'CARTRIDGE\'s $27EA1A holds', { skip: SKIP }, () => {
  const ram = new Ram();
  putItem(ram, 0x000, { kind: 0 });
  ram.setU16(ITEM.count, 1);
  const B17 = BUCKETS[17];
  ram.setU16(B17.counter, 0);
  runItemDriver(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u16(B17.counter), 12, 'ONE 12-byte record');
  const w2 = ram.u16(B17.buffer + 4), w3 = ram.u16(B17.buffer + 6);
  assert.equal(((w2 << 16) | w3) >>> 0, ROM.u32(ANIM4[0x00]),
    '$27EAB6 adda.w ($e,A6),A0 / move.l (A0),D2 at cursor 0');
  assert.equal(ram.u16(B17.buffer + 8), 0x0618, '$27EABC move.w #$618,D3');
  assert.equal(ram.u16(B17.buffer + 10), 0x001b, '$27EAC0 move.w #$1B,D4');
});

test('kind $10 emits $1C in D4 where the other three emit $1B, and $420 where '
  + 'kind $0 emits $618', { skip: SKIP }, () => {
  const ram = new Ram();
  putItem(ram, 0x000, { kind: 0x10 });
  ram.setU16(ITEM.count, 1);
  const B17 = BUCKETS[17];
  ram.setU16(B17.counter, 0);
  runItemDriver(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u16(B17.buffer + 8), 0x0420, '$27F22C');
  assert.equal(ram.u16(B17.buffer + 10), 0x001c, '$27F230 -- $1C, NOT $1B');
});

test('the four-frame animation cursor is masked $F and the table read is '
  + 'RANGE-CHECKED', { skip: SKIP }, () => {
  const ram = new Ram();
  const r = putItem(ram, 0x000, { kind: 0 });
  ram.setU16(r + I.anim, 0x0002);          // an ODD longword index
  ram.setU16(ITEM.count, 1);
  throwsAt(() => runItemDriver(ram, ROM, ctxOf().ctx), 0x27eab6,
    'an odd cursor reads a longword straddling two entries');
});

// ===========================================================================
// 5. THE COLLECT TAILS -- and the $1000-vs-$10 fork, which is the whole point
//    of the refusal path.
// ===========================================================================

const PENDING_END = 0x81b4c4;            // $28614A lea $81B4C4,A0 -- ONE PAST

test('$27F54C scores $10 and $27F582 scores $1000, through the SAME $286128, '
  + 'and the mask comes from the STATUS WORD\'S HIGH BYTE', { skip: SKIP }, () => {
  for (const [fn, want] of [[collect27F54C, 0x10], [collectMax27F582, 0x1000]]) {
    const ram = new Ram();
    const { ctx } = ctxOf();
    const r = putItem(ram, 0x000);
    ram.setU16(r, 0x9000);                // allocated + P1 TOUCH (bit 12)
    ram.setU16(ITEM.count, 1);
    fn(ram, ROM, ctx, r, ANIM_LISTS.d27F480);
    // The accumulator is packed BCD and `$286626`'s A0 is ONE PAST its last
    // byte, so $10 lands as $10 and $1000 as $1000.
    assert.equal(ram.u32(PENDING_END - 4), want,
      'bit 4 of the status HIGH byte is P1 -- $286128 btst #4,D1');
    // ...and the P2 control, which is what makes the mask a claim.
    const ram2 = new Ram();
    const r2 = putItem(ram2, 0x000);
    ram2.setU16(r2, 0x8800);              // P2 TOUCH (bit 11)
    ram2.setU16(ITEM.count, 1);
    fn(ram2, ROM, ctxOf().ctx, r2, ANIM_LISTS.d27F480);
    assert.equal(ram2.u32(PENDING_END - 4), 0, 'P1\'s accumulator stays 0');
    assert.equal(ram2.u32(0x81b52c - 4 + 4), ram2.u32(0x81b52c),
      'sanity: P2\'s is a different word');
  }
});

test('$27F54C clears the collect flags out of the HIGH byte and sets bit 0, '
  + 'while $27F582 sets bit 7', { skip: SKIP }, () => {
  const ram = new Ram();
  const r = putItem(ram, 0x000);
  ram.setU16(r, 0xb000);
  ram.setU16(ITEM.count, 1);
  collect27F54C(ram, ROM, ctxOf().ctx, r, ANIM_LISTS.a27F300);
  assert.equal(ram.u8(r), 0x80, '$27F55E move.b #$80,(A6)');
  assert.equal(ram.u8(r + 1) & 0x01, 0x01, '$27F562 bset #$0,($1,A6)');
  assert.equal(ram.u32(r + I.list), ANIM_LISTS.a27F300);

  const ram2 = new Ram();
  const r2 = putItem(ram2, 0x000);
  ram2.setU16(r2, 0xb000);
  ram2.setU16(ITEM.count, 1);
  collectMax27F582(ram2, ROM, ctxOf().ctx, r2);
  assert.equal(ram2.u8(r2 + 1) & 0x80, 0x80, '$27F5A2 bset #$7,($1,A6)');
  assert.equal(ram2.u32(r2 + I.list), ANIM_LISTS.max27F500,
    'the AT-MAX animation is a DIFFERENT list, 17 frames not 30');
});

test('$27F5C2 picks the flight angle from the SHORT axis and the speed from '
  + '$242B3C -- 7, 9, 11 or 13, never even', { skip: SKIP }, () => {
  const seen = new Set();
  for (let st = 0; st < 32; st++) {
    const ram = new Ram();
    const r = putItem(ram, 0x000);
    ram.setU16(r, 0x9000);
    ram.setU16(ITEM.count, 1);
    ram.setU16(0x803916, st);
    ram.setU16(r + I.posX, 0x0100);
    ram.setU16(ITEM.scroll, 0);
    collect27F54C(ram, ROM, ctxOf().ctx, r, ANIM_LISTS.a27F300);
    assert.equal(ram.u8(r + I.angle), 0x10,
      '$27F5D2 cmpi.w #$1C00 -- below it the angle is $10');
    seen.add(ram.u8(r + I.speed));
  }
  for (const v of seen) assert.ok([7, 9, 11, 13].includes(v), `speed ${v}`);
  assert.ok(seen.size > 1, 'the RNG actually varies it');
  // ...and the OTHER arm of the same `bcc`.
  const ram = new Ram();
  const r = putItem(ram, 0x000);
  ram.setU16(r, 0x9000);
  ram.setU16(ITEM.count, 1);
  ram.setU16(r + I.posX, 0x2000);
  collect27F54C(ram, ROM, ctxOf().ctx, r, ANIM_LISTS.a27F300);
  assert.equal(ram.u8(r + I.angle), 0x30, '$27F5CC move.b #$30');
});

test('the collected animations end where their OWN cmpi.w says: 30 frames and '
  + '17, and $27F508 + 8 + 17*4 IS the collect tail', { skip: SKIP }, () => {
  assert.equal(ANIM_LISTS.max27F500 + 8 + 17 * 4, ITEM.collectTail);
  assert.equal(ANIM_LISTS.a27F300 + 8 + 30 * 4, ANIM_LISTS.b27F380);
  for (const [list, end] of [[ANIM_LISTS.a27F300, ANIM_END.normal],
    [ANIM_LISTS.max27F500, ANIM_END.atMax]]) {
    const ram = new Ram();
    const r = putItem(ram, 0x000);
    ram.setU16(r, 0x8000 | (end === ANIM_END.atMax ? 0x80 : 0x01));
    ram.setU32(r + I.list, list);
    ram.setU16(r + I.cursor, end - 4);      // the LAST frame
    ram.setU16(r + I.frame, 0x0101);        // ...and its last tick
    ram.setU16(ITEM.count, 1);
    assert.equal(collectedStep27F5F4(ram, ROM, ctxOf().ctx, r), true,
      `the ${end === 0x78 ? 30 : 17}-frame list frees on the frame past its end`);
    assert.equal(ram.u16(ITEM.count), 0);
    assert.equal(ram.u16(r), 0, '$27F2F0');
  }
});

test('the collected animation adds the list\'s 8-byte HEADER to the position '
  + 'as ONE 32-bit add', { skip: SKIP }, () => {
  const ram = new Ram();
  const r = putItem(ram, 0x000);
  ram.setU16(r, 0x8001);
  ram.setU32(r + I.list, ANIM_LISTS.a27F300);
  ram.setU16(r + I.cursor, 0);
  ram.setU16(r + I.frame, 0x0202);
  // THE LOW HALF MUST CARRY **AND THE CARRY MUST SURVIVE THE EMITTER**, and
  // the second half is the part that took two tries.  `$23EB1C asr.l #6` and
  // `$23EB1E andi.l #$07FF03FF` throw away bit 10 of the low word, which is
  // exactly where a one-unit difference in the HIGH word lands -- so for most
  // positions `add.l` and two `add.w`s produce the SAME twelve bytes and no
  // assertion on them can tell.  This position is chosen so the shifted value
  // BORROWS out of bit 16: pos + header == $0000C000, whose `>>6` low word is
  // $0300, and $0300 - $0400 borrows.
  const HDR = ROM.u32(ANIM_LISTS.a27F300);
  const POS = ((0x0000c000 - HDR) >>> 0);
  ram.setU32(r + I.pos, POS);
  ram.setU16(ITEM.count, 1);
  assert.equal(((POS & 0xffff) + (HDR & 0xffff)) > 0xffff, true,
    'the fixture is only a test if the SHORT axis carries into the LONG');
  assert.equal((((0x0000c000 | 0) >> 6) & 0xffff) < 0x400, true,
    '...and only a test of the CARRY if the borrow reaches word 0');
  const B17 = BUCKETS[17];
  ram.setU16(B17.counter, 0);
  collectedStep27F5F4(ram, ROM, ctxOf().ctx, r);
  const want = 0x0000c000;
  const packed = (want | 0) >> 6;
  assert.equal(ram.u16(B17.buffer + 0), ((packed >>> 16) & 0x07ff) | 0x8000,
    'two 16-bit adds would not carry -$A00 out of the short axis');
  assert.equal(ram.u16(B17.buffer + 8), ROM.u16(ANIM_LISTS.a27F300 + 4),
    'D3 is the header\'s SIZE word, $0450');
});

// ===========================================================================
// 6. THE TEN COLLECT ROUTINES.  The power ladder is the owner's question.
// ===========================================================================

/** The player words the power-up reads, at their shipped-seed values. */
function powerSeed(ram, { ship = 2, weapon = 0 } = {}) {
  ram.setU16(POWER.p1Ship, ship);         // $810440
  ram.setU16(POWER.p1Weapon, weapon);     // $81043E
  ram.setU16(POWER.p2Ship, ship);
  ram.setU16(POWER.p2Weapon, weapon);
  ram.setU32(POWER.p1Cursor, 0x25523c);   // MEASURED in the shipped seed
  ram.setU32(POWER.p1PodCursor, 0x255278);
  ram.setU32(POWER.p2Cursor, 0x25523c);
  ram.setU32(POWER.p2PodCursor, 0x255278);
}

test('$252C96: FIVE power levels, and the cursor stops at WORD[4] of a '
  + 'five-word list', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  powerSeed(ram);
  const shotList = ROM.u32(POWER.lists);            // $25520C[0]
  const podList = ROM.u32(POWER.lists + 4);         // $25520C[1] -- INTERLEAVED
  const words = [];
  for (let n = 0; n < 8; n++) {
    words.push([ram.u16(POWER.p1Shot), ROM.u16(ram.u32(POWER.p1Cursor)),
      ROM.u16(ram.u32(POWER.p1PodCursor))]);
    assert.equal(collect252C96(ram, ROM, ctx), n >= 4,
      'the FIFTH collection is refused: $810406 + $810408 == $10');
  }
  assert.deepEqual(words.map((w) => w[0]), [0, 2, 4, 6, 8, 8, 8, 8],
    '$810406 steps by 2 and refuses at 8 -- five states');
  // ...and every count read is the CARTRIDGE's, not this file's.
  assert.deepEqual(words.slice(0, 5).map((w) => w[1]),
    [0, 1, 2, 3, 4].map((i) => ROM.u16(shotList + i * 2)));
  assert.deepEqual(words.slice(0, 5).map((w) => w[2]),
    [0, 1, 2, 3, 4].map((i) => ROM.u16(podList + i * 2)));
  // **AND THE STOP IS "the word EQUALS word[4]", NOT "index 4".**  [M] the
  // shipped row's shot list is `0004 0004 0005 0006 0006`, so the cursor stops
  // at index 3 -- the FIRST word equal to word[4] -- and a fifth power-up
  // cannot move it.  A port that counted to four would be one word further on
  // every list whose last two words repeat, which is [M] all twelve.
  const stopAt = (list) => {
    const last = ROM.u16(list + 8);
    for (let i = 0; i < 5; i++) if (ROM.u16(list + i * 2) === last) return list + i * 2;
    throw new Error('unreachable: word[4] equals itself');
  };
  assert.equal(ram.u32(POWER.p1Cursor), stopAt(shotList),
    'the cursor stops on the first word EQUAL to word[4]');
  assert.equal(ram.u32(POWER.p1PodCursor), stopAt(podList));
  assert.equal(ram.u32(POWER.p1Cursor), shotList + 6,
    '...which for the shipped row is index 3, not index 4');
});

test('$252C96 advances a cursor ONLY when the word it points at differs from '
  + 'word[4] -- so a list whose word[0] IS word[4] never moves',
{ skip: SKIP }, () => {
  const ram = new Ram();
  powerSeed(ram);
  const shotList = ROM.u32(POWER.lists);
  // Point the cursor at a word that EQUALS word[4] and collect: `cmp.w (A0),D0
  // / beq` must leave it exactly where it is.
  assert.equal(ROM.u16(shotList + 6), ROM.u16(shotList + 8),
    'the shipped row repeats its last word -- that is what makes this a test');
  ram.setU32(POWER.p1Cursor, shotList + 6);
  collect252C96(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u32(POWER.p1Cursor), shotList + 6);
  // THE CONTROL, at a word that DIFFERS -- otherwise "it did not move" is a
  // statement about nothing.
  ram.setU16(POWER.p1Shot, 0); ram.setU16(POWER.p1Laser, 0);
  ram.setU32(POWER.p1Cursor, shotList + 4);
  assert.notEqual(ROM.u16(shotList + 4), ROM.u16(shotList + 8));
  collect252C96(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u32(POWER.p1Cursor), shotList + 6);
});

test('the cursor stops on word[4] and not on word[3] -- measured on a row '
  + 'where the two DIFFER', { skip: SKIP }, () => {
  // [M] row 0's shot list ($25523C) is `0004 0004 0005 0006 0006`, so its
  // word[3] and word[4] are the SAME and it cannot separate the two readings.
  // Row 2's ($255246) is `0004 0004 0005 0005 0006`, and it can.
  const list = ROM.u32(POWER.lists + 2 * 4);
  assert.notEqual(ROM.u16(list + 6), ROM.u16(list + 8),
    'the fixture is only a test if word[3] and word[4] differ');
  const ram = new Ram();
  powerSeed(ram, { ship: 3, weapon: 0 });          // (3-2)*2 + 0 == row 2
  ram.setU32(POWER.p1Cursor, list);
  ram.setU32(POWER.p1PodCursor, ROM.u32(POWER.lists + 3 * 4));
  const podList = ROM.u32(POWER.lists + 3 * 4);
  assert.notEqual(ROM.u16(podList + 6), ROM.u16(podList + 8),
    'and the LASER row must separate them too -- $252CF0 reads ($8,A1), a '
    + 'DIFFERENT instruction from $252CF8 ($8,A0), and a mutation of one is '
    + 'invisible to an assertion on the other');
  for (let n = 0; n < 4; n++) collect252C96(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u32(POWER.p1Cursor), list + 8,
    'a port comparing against word[3] would have stopped at list+4');
  assert.equal(ram.u32(POWER.p1PodCursor), podList + 8);
});

test('$252DAC FULL POWER assigns 8 and writes both cursors with addq.l #8, not '
  + '#2', { skip: SKIP }, () => {
  const ram = new Ram();
  powerSeed(ram);
  ram.setU32(POWER.p1Cursor, 0);            // deliberately WRONG: it is written
  ram.setU32(POWER.p1PodCursor, 0);         // outright, not stepped
  assert.equal(collect252DAC(ram, ROM, ctxOf().ctx), false);
  assert.equal(ram.u16(POWER.p1Shot), 8);
  assert.equal(ram.u16(POWER.p1Laser), 8);
  assert.equal(ram.u32(POWER.p1Cursor), ROM.u32(POWER.lists) + 8);
  assert.equal(ram.u32(POWER.p1PodCursor), ROM.u32(POWER.lists + 4) + 8);
  assert.equal(collect252DAC(ram, ROM, ctxOf().ctx), true, 'and then it refuses');
});

test('the P2 collect routines are on the P2 words and touch NONE of P1\'s',
{ skip: SKIP }, () => {
  const ram = new Ram();
  powerSeed(ram);
  collect252D24(ram, ROM, ctxOf().ctx);
  assert.equal(ram.u16(POWER.p2Shot), 2);
  assert.equal(ram.u16(POWER.p1Shot), 0, 'P1 is untouched');
  const ram2 = new Ram();
  powerSeed(ram2);
  collect252E26(ram2, ROM, ctxOf().ctx);
  assert.equal(ram2.u16(POWER.p2Shot), 8);
  assert.equal(ram2.u16(POWER.p1Shot), 0);
});

test('the $25520C row index must be EVEN and inside twelve longwords, or the '
  + 'SHOT list and the LASER list overlap', { skip: SKIP }, () => {
  const ram = new Ram();
  powerSeed(ram, { ship: 2, weapon: 1 });   // an ODD row
  throwsAt(() => collect252C96(ram, ROM, ctxOf().ctx), 0x252ce6,
    'an ODD row pairs a shot list with the NEXT row"s shot list');
  const ram2 = new Ram();
  powerSeed(ram2, { ship: 9, weapon: 0 });  // row 14, past the twelve
  throwsAt(() => collect252C96(ram2, ROM, ctxOf().ctx), 0x252ce6,
    'and row 14 runs off the twelve-longword array into $25523C itself');
});

test('a POWER-UP tears the BEAM down -- $25270C clears all 32 segment slots, '
  + 'the beam record and the drawn column', { skip: SKIP }, () => {
  const ram = new Ram();
  powerSeed(ram);
  for (let n = 0; n < 32; n++) ram.setU16(0x8112f2 + n * 0x30, 0x8000 | n);
  ram.setU16(0x811ef2, 0x8001);
  ram.setU16(0x811f32, 0x8001);
  ram.setU16(0x811f48, 0x8001);
  ram.setU16(0x8104aa, 0xffff);
  ram.setU8(0x8104ab, 0xff);
  const { ctx, log } = ctxOf();
  collect252C96(ram, ROM, ctx);
  for (let n = 0; n < 32; n++) {
    assert.equal(ram.u16(0x8112f2 + n * 0x30), 0, `segment slot ${n}`);
  }
  assert.equal(ram.u16(0x811ef2), 0);
  assert.equal(ram.u16(0x811f32), 0);
  assert.equal(ram.u16(0x811f48), 0, '($16,A1)');
  assert.equal(ram.u16(0x8104aa), 0xdf7b,
    '$FFFF andi.w #$DFFB is $DFFB, and $25279A bclr #$7,($1,A2) then clears '
    + 'bit 7 of the LOW byte -- $DF7B');
  assert.ok([...log.calls.keys()].some((k) => k.startsWith('$2527BE')),
    'and its sound cue is COUNTED');
});

test('$25310E caps at 20 and refuses with CARRY CLEAR -- which is why a 21st '
  + 'item is still collected normally and still scores $10', { skip: SKIP }, () => {
  const ram = new Ram();
  const { ctx } = ctxOf();
  for (let n = 0; n < 25; n++) collect25310E(ram, ctx);
  assert.equal(ram.u16(POWER.counterP1), POWER.counterCap);
  assert.equal(collect25310E(ram, ctx), false,
    '$253116 beq $253124 / rts -- NO carry, unlike kinds $0/$4/$8');
  assert.equal(collect253126(ram, ctx), false);
  assert.equal(ram.u16(POWER.counterP2), 1, 'and P2 has its own word');
  // The consequence, driven through the body: a capped kind $10 collection
  // takes the NORMAL tail and scores $10, not $1000.
  const r = putItem(ram, 0x000, { kind: 0x10 });
  ram.setU16(r, 0x9010);
  ram.setU16(ITEM.count, 1);
  runItemDriver(ram, ROM, ctx);
  assert.equal(ram.u32(PENDING_END - 4), 0x10);
  assert.equal(ram.u8(r + 1) & 0x81, 0x01, 'bit 0, not bit 7');
});

// ===========================================================================
// 7. THE TWO LIBRARY ROUTINES THIS WAVE ADDS.
// ===========================================================================

test('$242AC6 is a DOUBLE DABBLE: binary word -> packed BCD longword', () => {
  for (const [bin, bcd] of [[0, 0], [9, 9], [10, 0x10], [99, 0x99],
    [100, 0x100], [1234, 0x1234], [9999, 0x9999], [65535, 0x65535]]) {
    assert.equal(bcd242AC6(bin), bcd, `${bin}`);
  }
});

test('$242B3C bumps the SHARED counter and reads its 256-byte table UNMASKED',
{ skip: SKIP }, () => {
  const ram = new Ram();
  // $803917 IS the low byte of the word at $803916, so the word is written
  // first and the byte read back -- writing them the other way round is how
  // the first version of this test asserted $42 and measured $08.
  ram.setU16(0x803916, 0x0041);
  const v = drawByte242B3C(ram, ROM);
  assert.equal(ram.u8(0x803917), 0x42, '$242B3C addq.b #1,$803917');
  assert.equal(v, ROM.u8(RNG_242B3C.table + 0x42),
    'there is no `moveq #$3F`/`#$7F` here -- the index is the WHOLE word, and '
    + 'an index of $42 proves it: a $3F mask would read $02');
  assert.notEqual(ROM.u8(RNG_242B3C.table + 0x42), ROM.u8(RNG_242B3C.table + 2),
    'the fixture is only a test if those two table bytes DIFFER');
  assert.equal(RNG_242B3C.entries, 256);
});

// ===========================================================================
// 8. DELIVERY.  The call, the shard and the windows.
// ===========================================================================

test('$27E99E is type-5 call #18 and it is now MADE, not listed', () => {
  assert.equal(TYPE5.calls[17], ITEM.driver);
  assert.ok(TYPE5_PORTED.has(ITEM.driver));
  assert.equal(TYPE5.itemDriver, 0x27e99e);
});

test('the item census is a SECOND instrument: it scans all 25 slots and does '
  + 'not consult $8171BA', () => {
  const ram = new Ram();
  putItem(ram, 0x000); putItem(ram, 0x640 - 0x40);   // slot 0 and slot 24
  ram.setU16(ITEM.count, 99);                        // a deliberately wrong count
  const c = itemCensus(ram);
  assert.equal(c.live, 2, 'the scan disagrees with the count, and says so');
  assert.equal(c.count, 99);
  assert.equal(c.slots, 25);
});
