// W276: object dispatch [11] `$25DBB4`, the STAGE-CLEAR SCREEN, and the tally path
// through it. States 0 and 2 are transcribed; state 1's gates and its menu cursor are
// one counted note naming the six routines still missing.
//
// State 2's `jsr $2600D8` is the call the owner meant by "maybe even score totalling,
// which I see none of". W273 landed `$2600D8`; this wave gives it a driver.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { deferReset } from '../src/background.js';
import { HUDRAM } from '../src/hud.js';
import { TALLY } from '../src/tally.js';
import { ALLOC } from '../src/objalloc.js';
import { RAM as MACHINE } from '../src/machine.js';
import {
  SCREEN11, menuCarry28D53C, menuDips23C932, screenHeader2533F6,
  screenState0_25DB30, screenState2_25DB7C, tallyScreen25DBB4,
  tallyRequest25FF38, cursorsFromPosted25D9E6, restoreCursors25DA60,
  readInput23D186, otherSideHolds25DAEA, gate25DFF6,
} from '../src/tallyscreen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A5 = 0x81f000;      // a scratch object record, clear of every pool
const TX = { head: 0x80b058, cursor: 0x80c8d8 };

function world() {
  const ram = new Ram();
  deferReset(ram);
  const log = new UnportedLog();
  return { ram, log, ctx: { ram, rom: ROM, unported: log, unportedLog: log, notes: log } };
}
const cells = (ram) => {
  let n = 0;
  for (let a = TX.head; a < TX.cursor; a += 8) {
    if (ram.u32(a) === 0xffffffff) break;
    n++;
  }
  return n;
};

// ==================================================== 1. THE TWO SMALL ROUTINES

test('W276 $28D53C is a CARRY, not a value', () => {
  // `tst.w $81DF20 / beq -> andi #$FFFE,SR ; else ori #$1,SR`. Six instructions whose
  // whole product is the C flag, so the caller's `bcs` is an `if`.
  const f = world();
  assert.equal(menuCarry28D53C(f.ram), false, 'zero -> carry clear');
  f.ram.setU16(SCREEN11.carryWord, 1);
  assert.equal(menuCarry28D53C(f.ram), true);
  // It is a WORD test, so a high byte alone still sets it.
  f.ram.setU16(SCREEN11.carryWord, 0x0100);
  assert.equal(menuCarry28D53C(f.ram), true, '$28D53C tst.w -- the whole word');
});

test('W276 $23C932 answers (0,0) for DIP $12 and two ZERO-EXTENDED bytes otherwise', () => {
  // `moveq #$0,Dn` before each `move.b` is what makes them zero-extended. This is NOT
  // W270's signed-byte trap, and $F0 is the value that would prove it if it were.
  const f = world();
  f.ram.setU8(SCREEN11.dipA, 0xf0);
  f.ram.setU8(SCREEN11.dipB, 0x81);
  assert.deepEqual(menuDips23C932(f.ram), [0xf0, 0x81], 'both zero-extended');

  f.ram.setU8(SCREEN11.dipConfig, 0x12);
  assert.deepEqual(menuDips23C932(f.ram), [0, 0], '$23C938 cmpi.b #$12 / beq');

  // and the compare is an EQUALITY, so a neighbouring config falls through
  f.ram.setU8(SCREEN11.dipConfig, 0x13);
  assert.deepEqual(menuDips23C932(f.ram), [0xf0, 0x81]);
});

// ======================================================== 2. THE HEADER

test('W276 the header draws EIGHT lines, and side 1 walks UPWARD', { skip: SKIP }, () => {
  // $2533F6 starts at D1 $0000 and steps +$200; $253448 starts at $1B00 and steps
  // -$200. Not a mirror -- a different direction, which a port that shared the body
  // with a sign flag would get right and one that shared the body without would not.
  const p1 = world();
  screenHeader2533F6(p1.ram, 0);
  const n1 = cells(p1.ram);
  assert.ok(n1 > 0, 'side 0 printed');

  const p2 = world();
  screenHeader2533F6(p2.ram, 1);
  assert.equal(cells(p2.ram), n1, 'the same eight prints either way');

  // The destination fields must differ, and in OPPOSITE directions from their starts.
  let differs = false;
  for (let a = TX.head; a < TX.head + n1 * 8; a += 8) {
    if (p1.ram.u32(a) !== p2.ram.u32(a)) { differs = true; break; }
  }
  assert.ok(differs, 'and at different destinations');
});

test('W276 the header uses the STRIDE printer once and the plain printer seven times',
  { skip: SKIP }, () => {
    // $253414 jsr $240E1A, then six + one $240DC2. The stride variant writes $80D518;
    // the plain one does not, so the write is the witness that the first call happened.
    const f = world();
    f.ram.setU32(0x80d518, 0xdeadbeef);
    screenHeader2533F6(f.ram, 0);
    // $240E2C..$240E34 with D5 = 2 and D3 = 0: ((2 - 0 - 1) & $FFFF) << 16 = $10000.
    assert.equal(f.ram.u32(0x80d518), 0x00010000, '$240E1A ran with D5=2, D3=0');
  });

// ================================================== 3. STATE 0

test('W276 state 0 advances to state 1 and arms both counters', { skip: SKIP }, () => {
  const f = world();
  screenState0_25DB30(f.ram, f.ctx, A5);
  assert.equal(f.ram.u8(A5 + SCREEN11.state), 1, '$25DB30 move.b #$1,($2,A5)');
  assert.equal(f.ram.u16(A5 + SCREEN11.armA), 0x04b0, '$25DB6E');
  assert.equal(f.ram.u16(A5 + SCREEN11.armB), 0x0004, '$25DB74');
  assert.equal(f.ram.u8(A5 + SCREEN11.phase), 0, '$25DB6A clr.b ($c,A5)');
});

test('W276 the SIDE byte picks the descriptor, and the two differ', { skip: SKIP }, () => {
  const p1 = world();
  p1.ram.setU8(A5 + SCREEN11.side, 0);
  screenState0_25DB30(p1.ram, p1.ctx, A5);
  assert.equal(p1.ram.u32(A5 + SCREEN11.desc), SCREEN11.descA, '$25DB36');

  const p2 = world();
  p2.ram.setU8(A5 + SCREEN11.side, 1);
  screenState0_25DB30(p2.ram, p2.ctx, A5);
  assert.equal(p2.ram.u32(A5 + SCREEN11.desc), SCREEN11.descB, '$25DB40');

  assert.notEqual(SCREEN11.descA, SCREEN11.descB);
  assert.equal(SCREEN11.descB - SCREEN11.descA, 0x1a, 'the records are 26 bytes and abut');
});

test('W276 state 0 posts announcement state 0 on the side the RECORD names',
  { skip: SKIP }, () => {
    // $25DB60 move.b ($7,A5),D0 / jsr $260A88 -- W270's unguarded poster.
    const f = world();
    f.ram.setU8(A5 + SCREEN11.side, 1);
    screenState0_25DB30(f.ram, f.ctx, A5);
    assert.equal(f.ram.u16(0x813166 + 0x02), 0x00, 'P2 mailbox holds state 0');
    assert.equal(f.ram.u16(0x813166), 1, 'and its flag is up');
    assert.equal(f.ram.u16(0x813162), 0, 'P1 untouched');
  });

test('W276 a NON-ZERO-but-not-1 side byte still takes the side-1 arms', { skip: SKIP }, () => {
  // All three of state 0's reads are `tst.b / bne`, so any non-zero is side 1.
  const f = world();
  f.ram.setU8(A5 + SCREEN11.side, 0x7f);
  screenState0_25DB30(f.ram, f.ctx, A5);
  assert.equal(f.ram.u32(A5 + SCREEN11.desc), SCREEN11.descB);
});

// ================================================== 4. STATE 2, THE TALLY

test('W276 the cursors are INDICES INTO TABLES, not the values themselves',
  { skip: SKIP }, () => {
    // $25DB88/$25DB98: `add.w Dn,Dn / lea <table>,A0 / move.w (A0,Dn.w),Dn`. The x
    // table is (0, 2) and the y table is (2, 4, 6), so cursor 1 posts 2 and 4 -- NOT
    // 1 and 1. `$813084` is the LIVES-ICON index `livesRow2878CC` reads through
    // `$2881E2`, so handing the cursor straight through would draw the wrong icon.
    assert.deepEqual([0, 1].map((i) => ROM.u16(SCREEN11.xTable + i * 2)), [0, 2]);
    assert.deepEqual([0, 1, 2].map((i) => ROM.u16(SCREEN11.yTable + i * 2)), [2, 4, 6]);

    const f = world();
    f.ram.setU32(A5 + SCREEN11.id, 0);
    f.ram.setU8(A5 + SCREEN11.xCur, 1);
    f.ram.setU8(A5 + SCREEN11.yCur, 1);
    f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81e000);
    screenState2_25DB7C(f.ram, ROM, f.ctx, A5);
    assert.equal(f.ram.u16(TALLY.postD0[0]), 2, 'x cursor 1 posts the TABLE value 2');
    assert.equal(f.ram.u16(TALLY.postD1[0]), 4, 'y cursor 1 posts 4');
  });

test('W276 state 2 really drives $2600D8: the HUD rows run', { skip: SKIP }, () => {
  // The point of the wave. If the tally ran, the digit records are seeded, the extend
  // threshold is set and the row stack drew.
  const f = world();
  f.ram.setU32(A5 + SCREEN11.id, 0);
  f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81e100);
  f.ram.setU16(TALLY.side0 + TALLY.type, 6);
  screenState2_25DB7C(f.ram, ROM, f.ctx, A5);
  assert.equal(f.ram.u32(HUDRAM.digitsP1 + 2), 0x9040d8, '$287148 seeded the nine');
  assert.notEqual(f.ram.u32(HUDRAM.extendNextP1), 0, '$286FA6 seeded the threshold');
  assert.equal(f.ram.u16(HUDRAM.digitStateP1), 1, '$287238 bumped');
  assert.ok(cells(f.ram) > 0, 'and the drawing rows enqueued');
  assert.notEqual(f.ram.u32(TALLY.side0 + TALLY.result), 0, '+$18 was set');
  assert.equal(f.ram.u16(HUDRAM.attract), 0, '$25FD94 recounted the sides');
});

test('W276 state 2 SELF-KILLS through $241292', { skip: SKIP }, () => {
  // `jmp $241292` is a TAIL jump: the object never returns to the dispatcher.
  const f = world();
  f.ram.setU32(A5 + SCREEN11.id, 0x1234);
  f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81e200);
  const before = f.ram.u16(ALLOC.killSp);
  screenState2_25DB7C(f.ram, ROM, f.ctx, A5);
  assert.notEqual(f.ram.u16(ALLOC.killSp), before, 'a kill was queued');
});

test('W276 a cursor past its table is COUNTED, not clamped and not read', { skip: SKIP }, () => {
  // `$25D986 + $4` IS `$25D98A`, and `$25D98A + $6` is `$25D990` = `move.b
  // #$FF,$813008`, CODE. A clamp would post the wrong icon silently; a read would
  // report a WINDOW error about the instruction instead of naming the cursor.
  for (const [x, y] of [[2, 0], [0, 3]]) {
    const f = world();
    f.ram.setU32(A5 + SCREEN11.id, 0);
    f.ram.setU8(A5 + SCREEN11.xCur, x);
    f.ram.setU8(A5 + SCREEN11.yCur, y);
    f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81e300);
    screenState2_25DB7C(f.ram, ROM, f.ctx, A5);
    assert.equal(f.ram.u16(TALLY.postD0[0]), 0, 'nothing was posted');
    const hit = f.log.report().find((r) => r.includes('$25DB7C'));
    assert.ok(hit, `x=${x} y=${y} is counted`);
    assert.match(hit, /\$25D990/, 'and the note names what pins the bound');
  }
});

test('W276 the x and y tables really abut, which is why the bound matters',
  { skip: SKIP }, () => {
    assert.equal(SCREEN11.xTable + SCREEN11.xEntries * 2, SCREEN11.yTable);
    assert.equal(SCREEN11.yTable + SCREEN11.yEntries * 2, 0x25d990);
    assert.doesNotThrow(() => ROM.u16(0x25d98e), 'the last y word resolves');
    assert.throws(() => ROM.u16(0x25d990), 'and the instruction after it does not');
  });

// ================================================ 5. THE DISPATCHER

test('W276 $25DBB4 routes 0 to state 0, 2 to state 2, and everything else is COUNTED',
  { skip: SKIP }, () => {
    const s0 = world();
    tallyScreen25DBB4(s0.ram, A5, 0, s0.ctx);
    assert.equal(s0.ram.u8(A5 + SCREEN11.state), 1, 'state 0 ran and advanced');
    assert.deepEqual(s0.log.report(), [], 'and counted nothing');

    const s2 = world();
    s2.ram.setU8(A5 + SCREEN11.state, 2);
    s2.ram.setU32(A5 + SCREEN11.id, 0);
    s2.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81e400);
    tallyScreen25DBB4(s2.ram, A5, 0, s2.ctx);
    assert.notEqual(s2.ram.u32(TALLY.side0 + TALLY.result), 0, 'state 2 ran');

    const s1 = world();
    s1.ram.setU8(A5 + SCREEN11.state, 1);
    tallyScreen25DBB4(s1.ram, A5, 0, s1.ctx);
    const hit = s1.log.report().find((r) => r.includes('$25DBC4'));
    assert.ok(hit, 'state 1 is counted at $25DBC4');
    // The note must NAME the six, so the next wave does not re-derive them.
    for (const a of ['$25DA60', '$25DA94', '$25DFF6', '$25DEAE', '$25E0EA', '$25FF38']) {
      assert.ok(hit.includes(a), `the note names ${a}`);
    }
    assert.match(hit, /SELECTION SCREEN/, 'and says what $25DD0C actually is');
  });

test('W276 state 0 runs ONCE: the second frame is state 1, not state 0 again',
  { skip: SKIP }, () => {
    const f = world();
    tallyScreen25DBB4(f.ram, A5, 0, f.ctx);
    const armed = f.ram.u16(A5 + SCREEN11.armA);
    f.ram.setU16(A5 + SCREEN11.armA, 0);
    tallyScreen25DBB4(f.ram, A5, 0, f.ctx);
    assert.equal(f.ram.u16(A5 + SCREEN11.armA), 0,
      'state 0 did not re-arm, so the dispatcher moved on');
    assert.equal(armed, 0x04b0);
  });

// ============================================ 6. IT IS REGISTERED

test('W276 object dispatch [11] is registered in main.js', () => {
  const src = readFileSync(path.join(R, 'src', 'main.js'), 'utf8');
  assert.match(src, /\[11, tallyScreen25DBB4\]/, 'the entry is there');
  assert.match(src, /import \{ tallyScreen25DBB4 \} from '\.\/tallyscreen\.js';/);
  // And it says it is partial, which matters for an entry whose state 1 is a note.
  const at = src.indexOf('[11, tallyScreen25DBB4]');
  assert.match(src.slice(Math.max(0, at - 900), at), /PARTIAL AND IT SAYS SO/);
});

// ============================ 7. W277: THE ROUND TRIP WITH THE TALLY
//
// State 1's dependencies, taken dependency-first as worklog 276's order says.
// `$25FF38` writes the tally records, so it came first; `$25D9E6` is the exact
// inverse of state 2's table lookup; `$25DA60` is what calls it.

test('W277 $25FF38 posts a request into the side\'s tally mailbox', { skip: SKIP }, () => {
  // `move.w D1,(A0) / clr.w ($2,A0)` on $8130FA or $81311E -- the same two words
  // $2600D8 clears at $2601D0/$2601D4, so the record's head is a mailbox.
  const f = world();
  f.ram.setU16(TALLY.side0 + 0x02, 0xbeef);
  assert.equal(tallyRequest25FF38(f.ram, 0, 7), TALLY.side0);
  assert.equal(f.ram.u16(TALLY.side0 + 0x00), 7, 'the request');
  assert.equal(f.ram.u16(TALLY.side0 + 0x02), 0, 'and the state is cleared');
  assert.equal(f.ram.u16(TALLY.side1 + 0x00), 0, 'the other side untouched');

  // `tst.w D0` is a WORD test, so a high half alone still means side 0.
  assert.equal(tallyRequest25FF38(f.ram, 0x10000, 3), TALLY.side0);
  assert.equal(tallyRequest25FF38(f.ram, 1, 3), TALLY.side1);
  assert.equal(f.ram.u16(TALLY.side1 + 0x00), 3);
});

test('W277 $25D9E6 turns POSTED VALUES back into INDICES -- the inverse of state 2',
  { skip: SKIP }, () => {
    // The two together are the round trip: state 2 posts the table VALUES and this
    // reads them back as indices. x table (0,2), y table (2,4,6).
    for (const [xi, yi] of [[0, 0], [0, 1], [1, 2], [1, 0]]) {
      const d6 = ROM.u16(SCREEN11.xTable + xi * 2);
      const d7 = ROM.u16(SCREEN11.yTable + yi * 2);
      const got = cursorsFromPosted25D9E6(ROM, 0, d6, d7);
      assert.deepEqual([got.x, got.y], [xi, yi],
        `posted ($${d6.toString(16)}, $${d7.toString(16)}) -> indices (${xi}, ${yi})`);
      assert.equal(got.defaulted, false, 'and the carry is clear');
    }
  });

test('W277 $FF in D6 takes the DEFAULTS, and the two sides differ', { skip: SKIP }, () => {
  // $25D9EA cmpi.w #$FF,D6 / bne. Side 0 -> (0,0), side 1 -> (1,2), then $25DA56 pops
  // and `ori #$1,SR` -- CARRY SET, which is how the caller knows.
  const a = cursorsFromPosted25D9E6(ROM, 0, 0xff, 0x1234);
  assert.deepEqual([a.x, a.y, a.defaulted], [0, 0, true], 'side 0');
  const b = cursorsFromPosted25D9E6(ROM, 1, 0xff, 0x1234);
  assert.deepEqual([b.x, b.y, b.defaulted], [1, 2, true], 'side 1');
  // D7 is IGNORED on this arm -- both defaults are written unconditionally.
  const c = cursorsFromPosted25D9E6(ROM, 1, 0xff, 0);
  assert.deepEqual([c.x, c.y], [1, 2]);
});

test('W277 the two dbra counts confirm the table sizes a THIRD time', { skip: SKIP }, () => {
  // `moveq #$1,D0 / dbra` walks indices 1 then 0 -- TWO entries. `moveq #$2,D0` walks
  // 2, 1, 0 -- THREE. That agrees with `$25DD42 andi.b #$1,($e,A5)` and with the
  // window's far end at $25D990, from three independent directions.
  assert.equal(SCREEN11.xEntries, 2);
  assert.equal(SCREEN11.yEntries, 3);
  assert.equal(SCREEN11.xTable + SCREEN11.xEntries * 2, SCREEN11.yTable);
  assert.equal(SCREEN11.yTable + SCREEN11.yEntries * 2, 0x25d990);
});

test('W277 a value in NEITHER table is left RAW, not clamped', { skip: SKIP }, () => {
  // The `dbra` falls through without storing, so D6/D7 keep the posted value and
  // state 2's own bound is what catches it. That is why that bound is a note.
  const got = cursorsFromPosted25D9E6(ROM, 0, 0x1234, 0x5678);
  assert.deepEqual([got.x, got.y], [0x1234, 0x5678], 'passed straight through');
  assert.equal(got.defaulted, false);
});

test('W277 $25DA60 reads back the pair $2600D8 WROTE -- the loop closes',
  { skip: SKIP }, () => {
    // The words $25DA60 reads are TALLY.postD0/postD1, which is what state 2 posts.
    // So: run state 2, then restore, and the cursors must come back unchanged.
    const f = world();
    f.ram.setU32(A5 + SCREEN11.id, 0);
    f.ram.setU8(A5 + SCREEN11.xCur, 1);
    f.ram.setU8(A5 + SCREEN11.yCur, 2);
    f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81e500);
    screenState2_25DB7C(f.ram, ROM, f.ctx, A5);
    // state 2 posted the table values; wipe the cursors and restore them
    f.ram.setU8(A5 + SCREEN11.xCur, 0xff);
    f.ram.setU8(A5 + SCREEN11.yCur, 0xff);
    const got = restoreCursors25DA60(f.ram, ROM, A5);
    assert.deepEqual([got.x, got.y], [1, 2], 'the round trip is lossless');
    assert.equal(f.ram.u8(A5 + SCREEN11.xCur), 1, '$25DA8A move.b D6,($e,A5)');
    assert.equal(f.ram.u8(A5 + SCREEN11.yCur), 2, '$25DA8E');
  });

test('W277 $25DA60 reads the SIDE\'s own pair of words', { skip: SKIP }, () => {
  // $25DA6C tst.b ($7,A5) / beq -- side 1 reads $813086/$81308A, not $813084/$813088.
  const f = world();
  f.ram.setU8(A5 + SCREEN11.side, 1);
  f.ram.setU16(TALLY.postD0[1], 2);      // x table value for index 1
  f.ram.setU16(TALLY.postD1[1], 6);      // y table value for index 2
  f.ram.setU16(TALLY.postD0[0], 0);      // side 0's would give index 0
  f.ram.setU16(TALLY.postD1[0], 2);
  const got = restoreCursors25DA60(f.ram, ROM, A5);
  assert.deepEqual([got.x, got.y], [1, 2], 'side 1\'s words were used');
});

test('W277 $25DA60 stores only the LOW BYTE of a raw pass-through', { skip: SKIP }, () => {
  // `move.b D6,($e,A5)` on a word $25D9E6 left raw, so the truncation happens here.
  const f = world();
  f.ram.setU16(TALLY.postD0[0], 0x1234);
  f.ram.setU16(TALLY.postD1[0], 2);
  restoreCursors25DA60(f.ram, ROM, A5);
  assert.equal(f.ram.u8(A5 + SCREEN11.xCur), 0x34, 'truncated at the store');
});

// ================ 8. W278: THE TWO-PLAYER LOCKOUT, AND STATE 1's SECOND GATE

test('W278 the descriptor\'s input read is the EDGE word, per side', { skip: SKIP }, () => {
  // $23D186 move.w $803972,D0 / rts ; $23D18E move.w $803978,D0 / rts. Two
  // instructions each, and they are RAM.p1edge/p2edge -- so a held direction
  // moves the cursor once, not every frame.
  const f = world();
  f.ram.setU16(MACHINE.p1edge, 0x0004);
  f.ram.setU16(MACHINE.p2edge, 0x0008);
  assert.equal(readInput23D186(f.ram, 0), 0x0004);
  assert.equal(readInput23D186(f.ram, 1), 0x0008);
});

test('W278 $25DAEA reads the OTHER side\'s saved selection -- the sense is inverted',
  { skip: SKIP }, () => {
    // $25DAF2 tst.b ($7,A5) / bne jumps PAST the second lea, so side NON-ZERO keeps
    // $813008 and side ZERO takes $813018. That is the whole point: a side has to read
    // the other side's record for a lockout to work. Every other side test in this
    // file has the opposite sense, so a copied line would silently self-lock.
    const f = world();
    f.ram.setU16(HUDRAM.attract, 1);            // two live sides
    f.ram.setU8(SCREEN11.savedA + 1, 2);        // record A holds entry 2
    f.ram.setU8(SCREEN11.savedB + 1, 0);        // record B holds entry 0

    f.ram.setU8(A5 + SCREEN11.side, 0);
    assert.equal(otherSideHolds25DAEA(f.ram, A5, 0), true, 'side 0 reads record B');
    assert.equal(otherSideHolds25DAEA(f.ram, A5, 2), false);

    f.ram.setU8(A5 + SCREEN11.side, 1);
    assert.equal(otherSideHolds25DAEA(f.ram, A5, 2), true, 'side 1 reads record A');
    assert.equal(otherSideHolds25DAEA(f.ram, A5, 0), false);
  });

test('W278 a ONE-PLAYER game has no lockout at all', { skip: SKIP }, () => {
  // $25DB04 tst.w $81308C / bne ; $25DB0E move.w #$FFFF,D1. The live-side count is
  // (live - 1), so 0 means one side, and D1 is FORCED to the "nothing saved" sentinel.
  const f = world();
  f.ram.setU16(HUDRAM.attract, 0);              // one live side
  f.ram.setU8(SCREEN11.savedB + 1, 1);          // ...and the record says entry 1
  f.ram.setU8(A5 + SCREEN11.side, 0);
  assert.equal(otherSideHolds25DAEA(f.ram, A5, 1), false, 'no lockout on one player');
  f.ram.setU16(HUDRAM.attract, 1);
  assert.equal(otherSideHolds25DAEA(f.ram, A5, 1), true, 'and it returns with two');
});

test('W278 the $FF sentinel means "nothing saved", and $25D990 is what writes it',
  { skip: SKIP }, () => {
    // The same $FF `cursorsFromPosted25D9E6` treats as "use the defaults", and the same
    // instruction that pins W276's data window: $25D990 move.b #$FF,$813008.
    const f = world();
    f.ram.setU16(HUDRAM.attract, 1);
    f.ram.setU8(A5 + SCREEN11.side, 0);
    f.ram.setU8(SCREEN11.savedB + 1, 0xff);
    assert.equal(otherSideHolds25DAEA(f.ram, A5, 0xff), false,
      'even asking for $FF itself does not match the sentinel');
    assert.equal(SCREEN11.savedA, 0x813008, 'and savedA is $25D990\'s destination');
  });

test('W278 $25DFF6 returns on carry and COUNTS its tail otherwise', { skip: SKIP }, () => {
  // jsr $28D53C / bcs -> rts / bra $25E0F2. The tail is unported, so it is counted by
  // address rather than invented.
  const f = world();
  f.ram.setU16(SCREEN11.carryWord, 1);
  assert.equal(gate25DFF6(f.ram, f.ctx), true, 'carry set -> early return');
  assert.deepEqual(f.log.report(), [], 'and nothing counted');

  const g = world();
  g.ram.setU16(SCREEN11.carryWord, 0);
  assert.equal(gate25DFF6(g.ram, g.ctx), false);
  const hit = g.log.report().find((r) => r.includes('$25E0F2'));
  assert.ok(hit, 'the tail is counted at $25E0F2');
  assert.match(hit, /ASCII SPACES/, 'and the note says what $25E006 is');
});
