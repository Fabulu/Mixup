// `$24107C` -- THE OBJECT-TABLE INIT, against the listing.  W375.
//
// This is the teardown the front-end sequencer calls ($25A7C0, $25A9B2,
// $25AC92, $23BF4A, $256DAA, $288A4E, $28D600).  Before this wave it existed
// only as `machine.js`'s `objTableInit` constant and an `unported.note()` in
// `objslot13.js:211`, so there was nothing to test and nothing the front end
// could tear down.
//
// The routine is $24107C..$2410BB -- 64 bytes, not the 62 the brief carried:
// straight-line clearing, a `dbra` and an `rts`.  EVERY
// interesting way to get it wrong is a size or a bound:
//
//   * `moveq #$13` + `dbra` is TWENTY passes, not 19 and not 21.  A 21st pass
//     would run straight into the two globals that live at $80E880..$80E885 and
//     the port would still LOOK right, because those globals get cleared anyway.
//     So the off-by-one is checked from the far side: the bytes past slot 19
//     that the loop must not reach are watched byte by byte.
//   * $80E882 is a LONG and the other three are WORDS.  A `clr.w` on the ID
//     counter leaves the top half set and IDs resume in the millions.
//   * three fields per slot are cleared, not the record.  A port that wiped the
//     whole $50 bytes would pass every liveness check and lose every object's
//     state.
//
// The main test is therefore an EXACT BYTE DIFF over the table and past its end,
// not a spot check: fill the region with $FF, run, and demand that the set of
// bytes that changed is exactly the set the listing names.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import {
  ALLOC, ALLOC_RESULT, OBJ_TABLE_END_WORD, objTableInit24107C,
  stageCreate, commitCreates, killById,
} from '../src/objalloc.js';

const slot = (i) => ALLOC.table + i * ALLOC.stride;
const pri = () => 0x10;   // a fixed dispatch priority, so the test states its own

/** Every byte address in [lo,hi) whose value differs between two snapshots. */
const changed = (before, after, lo, hi) => {
  const out = [];
  for (let a = lo; a < hi; a++) if (before.u8(a) !== after.u8(a)) out.push(a);
  return out;
};

/** A copy of [lo,hi) taken before the call, so the diff is against real bytes
 *  and not against an assumption about what was there. */
const snap = (ram, lo, hi) => {
  const s = new Ram();
  for (let a = lo; a < hi; a++) s.setU8(a, ram.u8(a));
  return s;
};

test('$24107C exists, takes exactly (ram), and returns nothing', () => {
  assert.equal(typeof objTableInit24107C, 'function');
  assert.equal(objTableInit24107C.length, 1);          // arity, not shape
  assert.equal(objTableInit24107C(new Ram()), undefined);
});

// ---------------------------------------------------------------------------
// 1 + 3.  Exactly which bytes move.
// ---------------------------------------------------------------------------

test('$2410A0..$2410B6 clears THREE fields in each of 20 slots and nothing else',
  () => {
    const r = new Ram();
    // Dirty every byte of the whole table AND a full record's worth past its
    // end, so an over-run has somewhere to show up.
    const LO = ALLOC.table;                       // $80E240
    const HI = ALLOC.table + 21 * ALLOC.stride;   // $80E8D0 -- slot 20's end
    for (let a = LO; a < HI; a++) r.setU8(a, 0xff);

    const before = snap(r, LO, HI);
    objTableInit24107C(r);

    // What the listing says: per slot, (A0) and ($4A,A0) are words and
    // ($4C,A0) is a longword.  Plus the two globals at $80E880/$80E882, which
    // are cleared by $241086/$24107C and happen to sit inside this window.
    const want = [];
    for (let i = 0; i < 20; i++) {
      const b = slot(i);
      want.push(b, b + 1);                                  // $2410A0 move.w
      want.push(b + 0x4a, b + 0x4b);                        // $2410A4 move.w
      want.push(b + 0x4c, b + 0x4d, b + 0x4e, b + 0x4f);    // $2410AA move.l
    }
    want.push(0x80e880, 0x80e881);                          // $241086 clr.w
    want.push(0x80e882, 0x80e883, 0x80e884, 0x80e885);      // $24107C move.l
    want.sort((a, b) => a - b);

    assert.deepEqual(changed(before, r, LO, HI), want);
    // 20 * 8 fields + 6 global bytes.  Stated as a number so a silent change to
    // `want` cannot make this test agree with itself.
    assert.equal(want.length, 20 * 8 + 6);
  });

test('slot 19 is the LAST slot: slot 20 survives the dbra', () => {
  const r = new Ram();
  const s20 = slot(20);                     // $80E880 -- see below
  // The three fields the loop would clear on a 21st pass.  Offset 0 of "slot
  // 20" IS $80E880, a real global that $241086 clears on purpose, so the
  // sentinel for the off-by-one has to be the other two fields -- and $80E886
  // onward, which nothing in the routine names.
  r.setU16(s20 + ALLOC.priOff, 0xbeef);     // $80E8CA
  r.setU32(s20 + ALLOC.idOff, 0xdeadbeef);  // $80E8CC
  r.setU16(0x80e886, 0xcafe);
  // $80E8D0 -- the first word PAST slot 20's record.  (Not $80E8CE: that is
  // inside slot 20's own ID longword at $80E8CC..$80E8CF, which the first run
  // of this test overwrote with $1234 and then asserted was $DEADBEEF.)
  r.setU16(0x80e8d0, 0x1234);

  objTableInit24107C(r);

  assert.equal(r.u16(s20 + ALLOC.priOff), 0xbeef,
    '$2410B6 dbra ran a 21st pass -- moveq #$13 is 20, not 21');
  assert.equal(r.u32(s20 + ALLOC.idOff), 0xdeadbeef);
  assert.equal(r.u16(0x80e886), 0xcafe);
  assert.equal(r.u16(0x80e8d0), 0x1234);
  // ...and slot 19 really was reached, so this is not passing by running 19.
  assert.equal(slot(19), 0x80e830);
  const r2 = new Ram();
  r2.setU16(slot(19), 0x8007);
  r2.setU16(slot(19) + ALLOC.priOff, 0x1e);
  r2.setU32(slot(19) + ALLOC.idOff, 0x11223344);
  objTableInit24107C(r2);
  assert.equal(r2.u16(slot(19)), 0, '$2410B6 dbra stopped one slot early');
  assert.equal(r2.u16(slot(19) + ALLOC.priOff), 0);
  assert.equal(r2.u32(slot(19) + ALLOC.idOff), 0);
});

test('the $46 bytes of a record the routine does not name KEEP their contents',
  () => {
    const r = new Ram();
    const b = slot(5);
    for (let o = 0; o < ALLOC.stride; o++) r.setU8(b + o, 0xa5);
    objTableInit24107C(r);
    const touched = new Set([0, 1, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f]);
    for (let o = 0; o < ALLOC.stride; o++) {
      assert.equal(r.u8(b + o), touched.has(o) ? 0x00 : 0xa5,
        `slot 5 byte +$${o.toString(16)}: the ROM clears three fields, not the record`);
    }
  });

// ---------------------------------------------------------------------------
// 2.  The four globals, at the size the opcodes give.
// ---------------------------------------------------------------------------

test('$24107C clears the ID counter $80E882 as a LONG (move.l, not clr.w)', () => {
  const r = new Ram();
  r.setU16(OBJ_TABLE_END_WORD, 0xffff);     // $80E880
  r.setU32(ALLOC.idCounter, 0xffffffff);    // $80E882..$80E885
  r.setU16(0x80e886, 0xffff);               // must not be touched

  objTableInit24107C(r);

  assert.equal(r.u32(ALLOC.idCounter), 0,
    '$24107C is `move.l #$00000000,$80E882` -- a word clear leaves $FFFF0000');
  assert.equal(r.u16(ALLOC.idCounter), 0);        // the top half specifically
  assert.equal(r.u16(ALLOC.idCounter + 2), 0);    // and the bottom half
  assert.equal(r.u16(0x80e886), 0xffff, 'the long clear stopped at $80E885');
  assert.equal(ALLOC.idCounter, 0x80e882);
});

test('$241086 clears $80E880 as a WORD, and only that word', () => {
  const r = new Ram();
  r.setU16(OBJ_TABLE_END_WORD, 0xffff);
  // $80E882 is the neighbour above; it is cleared by $24107C, so the byte that
  // proves the WIDTH of $241086 is the one BELOW -- slot 19's ID longword at
  // $80E87C..$80E87F.  That is cleared by the loop too, so what is actually
  // observable about the width here is that the word itself goes to zero and
  // nothing outside $80E880..$80E885 does; the exact-diff test above pins that.
  objTableInit24107C(r);
  assert.equal(r.u16(OBJ_TABLE_END_WORD), 0);
  assert.equal(OBJ_TABLE_END_WORD, ALLOC.table + 20 * ALLOC.stride,
    '$80E880 is exactly one record past slot 19 -- $80E240 + 20 * $50');
});

test('$24108C clears the create cursor $80DBAC as a WORD, not a long', () => {
  const r = new Ram();
  r.setU32(ALLOC.createSp, 0xffffffff);     // $80DBAC..$80DBAF
  objTableInit24107C(r);
  assert.equal(r.u16(ALLOC.createSp), 0, '$24108C clr.w $80DBAC');
  assert.equal(r.u16(ALLOC.createSp + 2), 0xffff,
    '`4279` is clr.w -- a `.l` here would clear $80DBAE too');
  assert.equal(ALLOC.createSp, 0x80dbac);
});

test('$241092 clears the kill cursor $80E23E as a WORD', () => {
  const r = new Ram();
  r.setU16(ALLOC.killSp, 0xffff);
  objTableInit24107C(r);
  assert.equal(r.u16(ALLOC.killSp), 0, '$241092 clr.w $80E23E');
  // A `.l` here would reach $80E240..$80E241, which is slot 0's type word --
  // and the loop clears that two instructions later, so the width of THIS one
  // is not observable from RAM.  The evidence is the opcode: `4279` (size bits
  // 01 = word), not `42B9`.  Stated here so the gap is on the record.
  assert.equal(ALLOC.killSp + 2, ALLOC.table);
  assert.equal(r.u8(ALLOC.killSp), 0);
  assert.equal(r.u8(ALLOC.killSp + 1), 0);
});

test('the four globals are cleared even when the table is already zero', () => {
  const r = new Ram();
  r.setU32(ALLOC.idCounter, 0x12345678);
  r.setU16(OBJ_TABLE_END_WORD, 0x0007);
  r.setU16(ALLOC.createSp, 0x0140);
  r.setU16(ALLOC.killSp, 0x00a0);
  objTableInit24107C(r);
  assert.equal(r.u32(ALLOC.idCounter), 0);
  assert.equal(r.u16(OBJ_TABLE_END_WORD), 0);
  assert.equal(r.u16(ALLOC.createSp), 0);
  assert.equal(r.u16(ALLOC.killSp), 0);
});

// ---------------------------------------------------------------------------
// 4.  It composes with the allocator that was already there.
// ---------------------------------------------------------------------------

test('after $24107C the staging area is reusable FROM THE START', () => {
  const r = new Ram();
  // Three creates: $2411B6 bumps $80DBAC by $50 each time.
  for (let i = 0; i < 3; i++) {
    const a = stageCreate(r, 0x20 + i, pri);
    assert.equal(a.ok, true);
    assert.equal(a.addr, ALLOC.createStage + i * ALLOC.stride);
  }
  assert.equal(r.u16(ALLOC.createSp), 3 * ALLOC.stride);
  assert.equal(r.u32(ALLOC.idCounter), 3);

  objTableInit24107C(r);

  assert.equal(r.u16(ALLOC.createSp), 0, 'the cursor did not go back to 0');
  const a = stageCreate(r, 0x31, pri);
  assert.equal(a.ok, true);
  assert.equal(a.addr, ALLOC.createStage,
    'the next create must land on the FIRST staging record again');
  assert.equal(a.result, ALLOC_RESULT.OK);
  // $2411BE increments before the store, and $24107C zeroed the counter, so the
  // first object after a teardown is ID 1 again -- exactly as at boot.
  assert.equal(r.u32(a.addr + ALLOC.idOff), 1);
  assert.equal(r.u32(ALLOC.idCounter), 1);
});

test('a FULL staging queue is emptied by $24107C, not just trimmed', () => {
  const r = new Ram();
  r.setU16(ALLOC.createSp, ALLOC.createCap);            // 20 staged -> full
  assert.equal(stageCreate(r, 4, pri).result, ALLOC_RESULT.QUEUE_FULL);
  objTableInit24107C(r);
  assert.equal(stageCreate(r, 4, pri).result, ALLOC_RESULT.OK,
    '$24108C must clear $80DBAC or the queue stays full forever');
});

test('$24107C destroys every live object: the driver sees an empty table', () => {
  const r = new Ram();
  // Fill the table the way `commitCreates` would: 20 live records.
  for (let i = 0; i < ALLOC.slots; i++) {
    r.setU16(slot(i), 0x8000 | (i + 1));
    r.setU16(slot(i) + ALLOC.priOff, 0x1f - i);
    r.setU32(slot(i) + ALLOC.idOff, 0x1000 + i);
  }
  objTableInit24107C(r);
  for (let i = 0; i < ALLOC.slots; i++) {
    assert.equal(r.u16(slot(i)), 0, `slot ${i} type word`);
    assert.equal(r.u16(slot(i) + ALLOC.priOff), 0, `slot ${i} priority`);
    assert.equal(r.u32(slot(i) + ALLOC.idOff), 0, `slot ${i} id`);
  }
  // ...and no stale ID can be killed afterwards, because $2411F4 tests the type
  // word first: every slot reads dead.
  assert.equal(killById(r, 0x1005), false);
  // A drain over the now-empty queue is a no-op rather than a walk over stale
  // staging records: $24111E bails on `$80DBAC == 0`.
  assert.deepEqual(commitCreates(r), []);
});

test('teardown then a full restage: 20 creates commit into a clean table', () => {
  const r = new Ram();
  for (let i = 0; i < ALLOC.slots; i++) {          // dirty the table first
    r.setU16(slot(i), 0x8000 | (i + 1));
    r.setU32(slot(i) + ALLOC.idOff, 0x900 + i);
  }
  r.setU32(ALLOC.idCounter, 0x0000ffff);
  objTableInit24107C(r);
  for (let i = 0; i < ALLOC.slots; i++) {
    assert.equal(stageCreate(r, 0x40 + i, pri).ok, true, `restage ${i}`);
  }
  assert.equal(r.u16(ALLOC.createSp), ALLOC.createCap);
  const res = commitCreates(r);
  assert.equal(res.length, ALLOC.slots);
  // Nothing was evicted: the table was empty, so every insert is a plain OK.
  assert.deepEqual([...new Set(res)], [ALLOC_RESULT.OK]);
  assert.equal(r.u16(ALLOC.createSp), 0);
  // The ID counter restarted, so these are 1..20 and not $10000..$10013 -- the
  // difference a `clr.w` on $80E882 would have produced.
  assert.equal(r.u32(ALLOC.idCounter), ALLOC.slots);
});
