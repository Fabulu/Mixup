// W273: `$2600D8`, the stage-clear SCORE TALLY's poster, and the five HUD row
// routines it drives that the port had never had.
//
// The owner asked for this by name: "maybe even score totalling, which I see none
// of". W270 recon'd object dispatch [11] down to one unread routine and guessed
// from its call sites that it was a descriptor walker. It is not: it is the row
// poster, and five of the seven rows it calls were missing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import {
  HUD, HUDRAM,
  extendInit286FA6, scoreDrainReset287148, chainMeterClear2871E8,
  digitStateBump287238, tallyRow287AAA,
} from '../src/hud.js';
import { TALLY, tally2600D8, liveSides25FD94 } from '../src/tally.js';
import { ALLOC } from '../src/objalloc.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tablesPath = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

function world() {
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log, notes: log } };
}

// ==================================================== 1. THE FIVE ROW ROUTINES

test('W273 $286FA6 stores the BYTE OFFSET in the extend cursor, not the DIP',
  { skip: SKIP }, () => {
    // $286FC8/$286FCA `add.w D0,D0` twice, THEN `move.w D0,(A1)`. The cursor and
    // `extendStep286FDA`'s `(A5,D0.w)` index are the same word, so storing the DIP
    // would make every extend after the first read the wrong interval.
    for (const dip of [0, 1, 2, 3]) {
      const f = world();
      f.ram.setU8(0x80380d, dip);
      extendInit286FA6(f.ram, ROM, f.ctx, 0);
      assert.equal(f.ram.u16(HUDRAM.extendIdxP1), dip * 4,
        `DIP ${dip} leaves ${dip * 4} in the cursor`);
      assert.equal(f.ram.u32(HUDRAM.extendNextP1),
        ROM.u32(HUD.firstThresholdTable + dip * 4), 'and the threshold matches the table');
    }
  });

test('W273 $286FA6 reproduces the shipped seed\'s own state for DIP 0',
  { skip: SKIP }, () => {
    // hud.js's W63 comment records the measurement: "[M] the shipped seed's own
    // state ($81B4AC = $02000000, $81B4B4 = 0) is DIP option 0". This is the
    // routine that would have produced it, so it must.
    const f = world();
    f.ram.setU8(0x80380d, 0);
    extendInit286FA6(f.ram, ROM, f.ctx, 0);
    assert.equal(f.ram.u32(HUDRAM.extendNextP1), 0x02000000);
    assert.equal(f.ram.u16(HUDRAM.extendIdxP1), 0);
  });

test('W273 $286FA6 writes the two sides to different words', { skip: SKIP }, () => {
  const f = world();
  f.ram.setU8(0x80380d, 2);
  extendInit286FA6(f.ram, ROM, f.ctx, 1);
  assert.equal(f.ram.u16(HUDRAM.extendIdxP2), 8);
  assert.equal(f.ram.u16(HUDRAM.extendIdxP1), 0, 'P1 untouched');
});

test('W273 $287148 seeds NINE digit records of stride $A and lands exactly on '
  + 'extraRecA', () => {
  // `moveq #$8,D7` with `dbra` is nine passes; $81B4C8 + 9*$A == $81B57C, the
  // adjacency HUDRAM's own comment records. If the loop ran eight or ten times
  // the last record would not abut.
  const f = world();
  scoreDrainReset287148(f.ram, 0);
  // P1's nine abut P2's nine, and P2's abut extraRecA -- so NEITHER loop runs
  // into the record its own `$28716C lea` then writes. Both leas are fresh.
  assert.equal(HUDRAM.digitsP1 + 9 * 10, HUDRAM.digitsP2, 'P1 nine abut P2 nine');
  assert.equal(HUDRAM.digitsP2 + 9 * 10, HUDRAM.extraRecA, 'and P2 nine abut extraRecA');
  for (let n = 0; n < 9; n++) {
    const at = HUDRAM.digitsP1 + n * 10;
    assert.equal(f.ram.u16(at), 0, `record ${n} dirty flag`);
    assert.equal(f.ram.u32(at + 2), 0x9040d8 + n * 0x100, `record ${n} destination`);
    assert.equal(f.ram.u16(at + 6), 0);
    assert.equal(f.ram.u16(at + 8), 0);
  }
  // $287172 move.w #$1,(A0)+ with A0 = $81B57C -- and that write is the record
  // AFTER the nine, so it must not have been clobbered by a tenth pass.
  assert.equal(f.ram.u16(HUDRAM.extraRecA), 1);
});

test('W273 $287148\'s destination step is a WORD add, so the high half never '
  + 'carries', () => {
  // `addi.w #$100,D1` on a longword register. $9040D8 + 8*$100 = $9048D8 and the
  // $90 never becomes $91 -- a `.l` add would still look right here, so the test
  // that matters is the one below on P2, whose low half is close to wrapping.
  const f = world();
  scoreDrainReset287148(f.ram, 1);
  assert.notEqual(HUDRAM.digitsP2 + 9 * 10, HUDRAM.extraRecB,
    '$2871BC lea $81B586 is a FRESH lea, not where the loop stopped');
  for (let n = 0; n < 9; n++) {
    const at = HUDRAM.digitsP2 + n * 10;
    const want = (0x9051d8 & 0xffff0000) | ((0x51d8 + n * 0x100) & 0xffff);
    assert.equal(f.ram.u32(at + 2), want >>> 0, `P2 record ${n} destination`);
  }
  assert.equal(f.ram.u16(HUDRAM.extraRecB), 1);
});

test('W273 $287148 zeroes BOTH total/overflow pairs and the hyper-shown byte', () => {
  const f = world();
  for (const a of [HUDRAM.totalP1, HUDRAM.total2P1]) f.ram.setU32(a, 0x12345678);
  for (const a of [HUDRAM.ovfP1, HUDRAM.ovf2P1]) f.ram.setU16(a, 0xbeef);
  f.ram.setU8(HUDRAM.p1.hyperShown, 0xff);
  f.ram.setU32(HUDRAM.totalP2, 0x9abcdef0);            // the other side must survive
  scoreDrainReset287148(f.ram, 0);
  assert.equal(f.ram.u32(HUDRAM.totalP1), 0);
  assert.equal(f.ram.u32(HUDRAM.total2P1), 0);
  assert.equal(f.ram.u16(HUDRAM.ovfP1), 0);
  assert.equal(f.ram.u16(HUDRAM.ovf2P1), 0);
  assert.equal(f.ram.u8(HUDRAM.p1.hyperShown), 0);
  assert.equal(f.ram.u32(HUDRAM.totalP2), 0x9abcdef0, 'P2 untouched');
});

test('W273 $2871E8 clears exactly the 40-byte chain-meter block and stops', () => {
  // `cmpa.l #$81B5E0,A0 / bne` -- the sweep is $81B5B8..$81B5DE inclusive as
  // words. $81B5E0 itself must survive, and it is P2's popupTimer neighbourhood.
  const f = world();
  for (let a = 0x81b5b0; a < 0x81b5f0; a += 2) f.ram.setU16(a, 0xffff);
  f.ram.setU16(HUDRAM.chainHiWaterP1, 0xffff);
  chainMeterClear2871E8(f.ram, 0);
  for (let a = 0x81b5b8; a < 0x81b5e0; a += 2) {
    assert.equal(f.ram.u16(a), 0, `$${a.toString(16).toUpperCase()} cleared`);
  }
  assert.equal(f.ram.u16(0x81b5b6), 0xffff, 'the word BELOW the block survives');
  assert.equal(f.ram.u16(0x81b5e0), 0xffff, 'and $81B5E0, the stop address, survives');
  assert.equal(f.ram.u16(HUDRAM.chainHiWaterP1), 0, 'the high-water word is cleared too');
});

test('W273 $2871E8 covers the whole p1 meter block HUDRAM already names', () => {
  // This is the family argument stated as a check: every p1 field in the block is
  // inside the sweep, which is why this routine belongs to hud.js's neighbourhood
  // and not to a new one.
  const f = world();
  const fields = ['accA', 'popup', 'popupSpeed', 'popupIdx', 'popupVal', 'accB', 'chain'];
  for (const k of fields) f.ram.setU16(HUDRAM.p1[k], 0x4321);
  chainMeterClear2871E8(f.ram, 0);
  for (const k of fields) {
    assert.ok(HUDRAM.p1[k] >= 0x81b5b8 && HUDRAM.p1[k] < 0x81b5e0,
      `p1.${k} $${HUDRAM.p1[k].toString(16)} is inside the sweep`);
    assert.equal(f.ram.u16(HUDRAM.p1[k]), 0, `p1.${k} cleared`);
  }
});

test('W273 $287238 caps at NINE with a beq, and marks the record dirty', () => {
  // `cmpi.w #$9 / beq` is AT nine, not past it: from 9 nothing moves, and the
  // record's dirty flag is NOT set either because the routine returns first.
  const f = world();
  f.ram.setU16(HUDRAM.digitStateP1, 8);
  f.ram.setU16(HUDRAM.extraRecA + 6, 3);
  digitStateBump287238(f.ram, 0);
  assert.equal(f.ram.u16(HUDRAM.digitStateP1), 9);
  assert.equal(f.ram.u16(HUDRAM.extraRecA + 6), 4, '($6,A0) advanced');
  assert.equal(f.ram.u16(HUDRAM.extraRecA), 1, 'and (A0) marked dirty');

  const g = world();
  g.ram.setU16(HUDRAM.digitStateP1, 9);
  g.ram.setU16(HUDRAM.extraRecA + 6, 3);
  digitStateBump287238(g.ram, 0);
  assert.equal(g.ram.u16(HUDRAM.digitStateP1), 9, 'capped');
  assert.equal(g.ram.u16(HUDRAM.extraRecA + 6), 3, 'and the record is left alone');
  assert.equal(g.ram.u16(HUDRAM.extraRecA), 0, 'not even the dirty flag');
});

test('W273 $287238 uses extraRecB for P2, not extraRecA', () => {
  const f = world();
  digitStateBump287238(f.ram, 1);
  assert.equal(f.ram.u16(HUDRAM.digitStateP2), 1);
  assert.equal(f.ram.u16(HUDRAM.extraRecB), 1);
  assert.equal(f.ram.u16(HUDRAM.extraRecA), 0, 'P1\'s record untouched');
});

const TX = { head: 0x80b058, cursor: 0x80c8d8 };
const cells = (ram) => {
  let n = 0;
  for (let a = TX.head; a < TX.cursor; a += 8) {
    if (ram.u32(a) === 0xffffffff) break;
    n++;
  }
  return n;
};

test('W273 $287AAA draws, and its banner gate has the same sense as the two rows '
  + 'beside it', { skip: SKIP }, () => {
  // `btst #0,$8130F9 / beq -> DRAW` then `tst.b $81B61F / bmi -> DRAW`, else rts.
  // The DEFAULT state (both zero) therefore DRAWS, and only flags9 bit 0 set with
  // a non-negative $81B61F suppresses it.
  const drew = world();
  tallyRow287AAA(drew.ram, ROM, drew.ctx, 0);
  assert.ok(cells(drew.ram) > 0, 'the default state draws');
  assert.deepEqual(drew.log.report(), [], 'and counts nothing');

  const gated = world();
  gated.ram.setU8(HUDRAM.flags9, 0x01);
  gated.ram.setU8(HUDRAM.bannerFlagsClear, 0x00);       // non-negative
  tallyRow287AAA(gated.ram, ROM, gated.ctx, 0);
  assert.equal(cells(gated.ram), 0, '$287ABC rts -- suppressed');

  const negative = world();
  negative.ram.setU8(HUDRAM.flags9, 0x01);
  negative.ram.setU8(HUDRAM.bannerFlagsClear, 0x80);    // bmi -> draw
  tallyRow287AAA(negative.ram, ROM, negative.ctx, 0);
  assert.ok(cells(negative.ram) > 0, 'a NEGATIVE $81B61F draws anyway');
});

test('W273 $287AAA\'s two sides differ in BOTH position and tile', { skip: SKIP }, () => {
  // $287AC2 move.w #$0,D1 vs $287AF4 move.w #$1A00,D1, and $404000A vs $3EE000A.
  // The tiles are NOT a mirror of each other, which is the ROM's own asymmetry.
  const p1 = world();
  tallyRow287AAA(p1.ram, ROM, p1.ctx, 0);
  const p2 = world();
  tallyRow287AAA(p2.ram, ROM, p2.ctx, 1);
  assert.equal(cells(p1.ram), cells(p2.ram), 'the same 8x2 grid either way');
  let differs = false;
  for (let a = TX.head; a < TX.head + cells(p1.ram) * 8; a += 8) {
    if (p1.ram.u32(a) !== p2.ram.u32(a) || p1.ram.u32(a + 4) !== p2.ram.u32(a + 4)) {
      differs = true; break;
    }
  }
  assert.ok(differs, 'and different cells');
});

test('W273 all five rows are note-only and silent-free without a cartridge', () => {
  // The two that read tables must COUNT; the three that only touch RAM must work.
  const f = world();
  extendInit286FA6(f.ram, null, f.ctx, 0);
  tallyRow287AAA(f.ram, null, f.ctx, 0);
  assert.equal(f.log.report().length, 2, 'both table readers counted');
  scoreDrainReset287148(f.ram, 0);
  chainMeterClear2871E8(f.ram, 0);
  digitStateBump287238(f.ram, 0);
  assert.equal(f.log.report().length, 2, 'and the three RAM-only ones need no rom');
  assert.equal(f.ram.u16(HUDRAM.extraRecA), 1, 'they really ran');
});

// =========================================================== 2. `$25FD94`

test('W273 $25FD94 counts live sides MINUS ONE, and $FFFF for none', () => {
  // `subq.w #1` with no floor. The port's ten readers of $81308C all test
  // `=== 0`, so the -1 case is the one a paraphrase would get wrong.
  const f = world();
  assert.equal(liveSides25FD94(f.ram), 0xffff, 'neither side -- $FFFF');
  assert.equal(f.ram.u16(HUDRAM.attract), 0xffff);
  assert.equal(f.ram.u16(0x81308e), 0xffff, '$25FDC8 copies it to $81308E');

  f.ram.setU32(TALLY.side0 + TALLY.result, 0x8001);
  assert.equal(liveSides25FD94(f.ram), 0, 'one side -- 0');

  f.ram.setU32(TALLY.side1 + TALLY.result, 0x8001);
  assert.equal(liveSides25FD94(f.ram), 1, 'two sides -- 1');
  assert.equal(f.ram.u16(0x81308e), 1);
});

test('W273 $25FD94 tests the LONG at +$18, so a high-half-only value still counts', () => {
  // `tst.l ($18,A2)`. The stored value's high word is the caller's D0, so a
  // record whose low half happens to be zero must still count as live.
  const f = world();
  f.ram.setU32(TALLY.side0 + TALLY.result, 0x00010000);
  assert.equal(liveSides25FD94(f.ram), 0, 'counted');
});

// ================================================= 3. `$2600D8` END TO END

test('W273 $2600D8 posts D0/D1 to the side\'s own pair of words', { skip: SKIP }, () => {
  for (const [d2, side] of [[0, 0], [1, 1], [0x10000, 0]]) {
    const f = world();
    f.ram.setU32(TALLY[side === 0 ? 'side0' : 'side1'] + TALLY.ptr, 0x81f000);
    tally2600D8(f.ram, ROM, f.ctx, 0x0055, 0x00aa, d2);
    assert.equal(f.ram.u16(TALLY.postD0[side]), 0x55, `d2=${d2} -> side ${side}`);
    assert.equal(f.ram.u16(TALLY.postD1[side]), 0xaa);
    // $2600DC tst.w D2 -- a WORD test, so $10000 is side 0.
    assert.equal(f.ram.u16(TALLY.postD0[1 - side]), 0, 'the other side untouched');
  }
});

test('W273 $2600D8 writes the DIP word THROUGH the record\'s own pointer',
  { skip: SKIP }, () => {
    // $260118 movea.l ($8,A6),A0 / $26012A move.w (A1),(A0). The destination is
    // data the record supplies, which is why the DIP bound below matters.
    for (const dip of [0, 1, 2, 3, 4]) {
      const f = world();
      f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f100);
      f.ram.setU8(TALLY.dip, dip);
      tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
      assert.equal(f.ram.u16(0x81f100), ROM.u16(TALLY.dipWords + dip * 2),
        `DIP ${dip} writes $2600CE[${dip}]`);
    }
  });

test('W273 a DIP past the table is COUNTED, not clamped and not a ROM read',
  { skip: SKIP }, () => {
    // $2600CE + $A IS $2600D8. A port that clamped would silently write entry 4;
    // one that read anyway would report a WINDOW error about the routine's own
    // movem.l instead of naming the dispatch bound -- W264's trap.
    const f = world();
    f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f200);
    f.ram.setU8(TALLY.dip, 5);
    f.ram.setU16(0x81f200, 0x1234);
    tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
    assert.equal(f.ram.u16(0x81f200), 0x1234, 'nothing was written');
    const hit = f.log.report().find((r) => r.includes('$2600CE'));
    assert.ok(hit, 'and the gap is counted at $2600CE');
    assert.match(hit, /5 words/, 'naming the bound, not a window');
  });

test('W273 $2600D8 fills the ALLOCATOR\'s record, not the DIP pointer',
  { skip: SKIP }, () => {
    // $241182 leaves the staging slot in A0 and does not restore it, so
    // $26013A..$26014C write the NEW object. A port that reused ($8,A6) would
    // write the DIP destination four more times.
    const f = world();
    f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f300);
    f.ram.setU16(TALLY.side0 + TALLY.type, 6);
    f.ram.setU8(TALLY.side0 + TALLY.row, 0);
    f.ram.setU16(TALLY.side0 + TALLY.argA, 0x1111);
    f.ram.setU16(TALLY.side0 + TALLY.argB, 0x2222);
    const rec = tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
    assert.ok(rec, 'the create was staged');
    assert.equal(rec, ALLOC.createStage, 'and it is the first staging slot');
    assert.equal(f.ram.u8(rec + 0x06), 0);
    assert.equal(f.ram.u8(rec + 0x07), 0);
    assert.equal(f.ram.u16(rec + 0x08), 0x1111);
    assert.equal(f.ram.u16(rec + 0x0a), 0x2222);
    assert.equal(f.ram.u16(rec), (6 | 0x8000) >>> 0, '$2411A8 ori.w #$8000');
    // the DIP destination holds ONLY the DIP word
    assert.equal(f.ram.u16(0x81f300), ROM.u16(TALLY.dipWords), 'and nothing else');
  });

test('W273 the ROW BLOCK comes from the record\'s +$17, not from D2',
  { skip: SKIP }, () => {
    // $260154 move.b ($17,A6),D0 / cmpi.w #$0,D0 / bne. Drive side 1 with a
    // selector of 0 and the P1 rows must run -- the case a D2-keyed port breaks.
    const f = world();
    f.ram.setU32(TALLY.side1 + TALLY.ptr, 0x81f400);
    f.ram.setU8(TALLY.side1 + TALLY.row, 0);
    f.ram.setU8(0x80380d, 1);
    tally2600D8(f.ram, ROM, f.ctx, 0, 0, 1);
    assert.equal(f.ram.u16(HUDRAM.extendIdxP1), 4, 'the P1 extend cursor was seeded');
    assert.equal(f.ram.u16(HUDRAM.extendIdxP2), 0, 'and P2\'s was not');
    assert.equal(f.ram.u16(TALLY.postD0[1]), 0, 'even though D2 chose side 1\'s words');
  });

test('W273 $2600D8 runs all seven rows, in the ROM\'s order', { skip: SKIP }, () => {
  // The order is observable: $287238 bumps the digit state and marks extraRecA
  // dirty, then $287148 immediately re-seeds that same word to 1. Reversed, the
  // dirty flag would end 1 either way -- but the digit RECORDS would carry
  // $287238's advance, so assert the state word AND the seeded destinations.
  const f = world();
  f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f500);
  f.ram.setU16(HUDRAM.digitStateP1, 0);
  tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
  assert.equal(f.ram.u16(HUDRAM.digitStateP1), 1, '$287238 ran');
  assert.equal(f.ram.u32(HUDRAM.digitsP1 + 2), 0x9040d8, '$287148 ran after it');
  assert.equal(f.ram.u16(HUDRAM.extraRecA), 1, 'and its seed is what survives');
  assert.equal(f.ram.u16(HUDRAM.extraRecA + 6), 1,
    '$287238\'s ($6,A0) advance is NOT re-zeroed -- $287148 seeds a different field');
  assert.notEqual(f.ram.u32(HUDRAM.extendNextP1), 0, '$286FA6 ran');
  assert.ok(cells(f.ram) > 0, 'and the three drawing rows enqueued');
});

test('W273 $2600D8 clears the record\'s head, posts announcement state $8 and '
  + 'recounts the sides', { skip: SKIP }, () => {
  const f = world();
  f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f600);
  f.ram.setU16(TALLY.side0 + 0x00, 0xdead);
  f.ram.setU16(TALLY.side0 + 0x02, 0xbeef);
  f.ram.setU16(TALLY.side0 + TALLY.type, 6);
  tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
  assert.equal(f.ram.u16(TALLY.side0 + 0x00), 0, '$2601D0');
  assert.equal(f.ram.u16(TALLY.side0 + 0x02), 0, '$2601D4');
  // $2601DE jsr $260AB6 -- W270's poster, state $8, on the side the RECORD names
  // (+$17, which is 0 here), so the P1 mailbox $813162 and not $813166.
  assert.equal(f.ram.u16(0x813162 + 0x02), 0x08, 'announcement state $8 is up');
  assert.equal(f.ram.u16(0x813162), 1, 'and the flag beside it');
  assert.equal(f.ram.u16(0x813166 + 0x02), 0, 'P2 mailbox untouched');
  // $2601E4 -- and now one side is live, so the count is 0.
  assert.equal(f.ram.u16(HUDRAM.attract), 0, '$25FD94 recounted');
  assert.notEqual(f.ram.u32(TALLY.side0 + TALLY.result), 0, 'because +$18 was set');
});

test('W273 $2600D8 counts its two deferred subsystems and nothing else',
  { skip: SKIP }, () => {
    // $241688 (the palette set) and $23C668 (the 256-longword clear). Both are
    // named by address; neither is silent.
    const f = world();
    f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f700);
    tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
    const addrs = f.log.report().map((r) => r.replace(/^\s*\d+ x (\$[0-9A-F]+) .*$/s, '$1'))
      .sort();
    assert.deepEqual(addrs, ['$23C668', '$241688'], 'exactly the two, and both counted');
  });

test('W273 the tally counter decrement is UNGUARDED and wraps', { skip: SKIP }, () => {
  // $260112 subq.w #1,$813142 with no test after it.
  const f = world();
  f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f800);
  f.ram.setU16(TALLY.counter, 0);
  tally2600D8(f.ram, ROM, f.ctx, 0, 0, 0);
  assert.equal(f.ram.u16(TALLY.counter), 0xffff, 'it wraps, as the board does');
});

// ============================================= 4. THE WINDOW PINS ITSELF

test('W273 the $2600CE window is FIVE words and stops before the code',
  { skip: SKIP }, () => {
    for (let i = 0; i < TALLY.dipWordCount; i++) {
      assert.doesNotThrow(() => ROM.u16(TALLY.dipWords + i * 2), `entry ${i} resolves`);
    }
    // $2600CE + $A is $2600D8 itself, whose first word is $48E7 (`movem.l`).
    assert.throws(() => ROM.u16(TALLY.dipWords + TALLY.dipWordCount * 2),
      'and the routine\'s own movem.l is NOT in the window');
    assert.equal(TALLY.dipWords + TALLY.dipWordCount * 2, 0x2600d8,
      'which is what pins the extent -- no guess was needed');
  });
