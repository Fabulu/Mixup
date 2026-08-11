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
import { TALLY, tally2600D8, bonusLine125FFA8, bonusLine2260056,
  bonusLine326010E, bonusLine42601F4, bonusLine52602B6,
  bonusLine6260348, bonusLine726035A, bonusLine826037C,
  tallyDriver25FF7A } from '../src/tally.js';
import { PaletteState } from '../src/palette.js';
import { ALLOC, resolveHandle241298 } from '../src/objalloc.js';
import { RAM as MACHINE } from '../src/machine.js';
import { setPanelBody2532B6 } from '../src/player.js';
import { HISCORE, HISCORE_SIDES } from '../src/hiscore.js';
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

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const HAVE_IMG = existsSync(IMAGE);
const IMG = HAVE_IMG ? readFileSync(IMAGE) : null;

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

// ======================= 9. W289: THE FIRST BONUS LINE, `$25FFA8`
//
// `$25FF52`'s ten longwords are the tally's bonus lines. Entry 0 is null and guarded by
// `$25FF84`; this is entry 1, the first real one, and it is the routine the score tally
// actually spends its frames in.

const CTR = 0x81f900;      // somewhere for ($8,A6) to point

/** Arm side 0's record with a counter the line can decrement. */
function armLine(f, start) {
  f.ram.setU32(TALLY.side0 + TALLY.ptr, CTR);
  f.ram.setU16(CTR, start);
  f.ram.setU16(TALLY.side0 + TALLY.type, 6);
}

test('W289 the counter is a POINTER, so the line decrements what ($8,A6) points AT',
  { skip: SKIP }, () => {
    // `movea.l ($8,A6),A0 / subq.w #1,(A0)`. A port that decremented ($8,A6) itself
    // would count down the pointer -- and would keep working for a while, because the
    // pointer's low word is a plausible counter.
    const f = world();
    armLine(f, 5);
    const ptrBefore = f.ram.u32(TALLY.side0 + TALLY.ptr);
    bonusLine125FFA8(f.ram, ROM, f.ctx, TALLY.side0);
    assert.equal(f.ram.u16(CTR), 4, 'the pointed-at word went down');
    assert.equal(f.ram.u32(TALLY.side0 + TALLY.ptr), ptrBefore, 'and the pointer did not');
  });

test('W289 the borrow test is bpl, NOT beq -- a counter of 1 runs one more frame',
  { skip: SKIP }, () => {
    // `subq.w #1 / tst.w / bpl` continues while the result is zero OR POSITIVE, so the
    // line finishes at -1 and not at 0. This is the old-zero borrow in its other form,
    // and it is one frame of the tally either way.
    const at1 = world();
    armLine(at1, 1);
    assert.equal(bonusLine125FFA8(at1.ram, ROM, at1.ctx, TALLY.side0), false,
      '1 -> 0 keeps going');
    assert.equal(at1.ram.u16(CTR), 0);

    const at0 = world();
    armLine(at0, 0);
    assert.equal(bonusLine125FFA8(at0.ram, ROM, at0.ctx, TALLY.side0), true,
      '0 -> -1 finishes');
    assert.equal(at0.ram.u16(CTR), 0xffff, 'and it really is $FFFF, not clamped');
  });

test('W289 finishing advances the record to state 2 and posts three words',
  { skip: SKIP }, () => {
    // $25FFD8..$260004 for side 0. The three words are interleaved by side, so the
    // wrong side would write P2's set and leave P1's alone.
    const f = world();
    armLine(f, 0);
    bonusLine125FFA8(f.ram, ROM, f.ctx, TALLY.side0);
    assert.equal(f.ram.u16(TALLY.side0 + 0x00), 2, '$260004 move.w #$2,(A6)');
    assert.equal(f.ram.u16(TALLY.side0 + 0x02), 0, '$26004E');
    assert.deepEqual([f.ram.u16(0x812930), f.ram.u16(0x812934), f.ram.u16(0x812938)],
      [0, 1, 0], 'side 0\'s three words');
    assert.deepEqual([f.ram.u16(0x812932), f.ram.u16(0x812936), f.ram.u16(0x81293a)],
      [0, 0, 0], 'and side 1\'s are untouched');
  });

test('W289 NOT finishing re-posts state 0, so the driver comes back', { skip: SKIP }, () => {
  // `$26004A move.w #$0,(A6)`. The line runs one frame per driver pass and re-arms
  // itself; a port that left the request set would run it twice a frame, and one that
  // cleared it would run it once ever.
  const f = world();
  armLine(f, 3);
  bonusLine125FFA8(f.ram, ROM, f.ctx, TALLY.side0);
  assert.equal(f.ram.u16(TALLY.side0 + 0x00), 0, 'the request is re-posted');
});

test('W289 the line FREEZES the game, every frame it runs', { skip: SKIP }, () => {
  // `$25FFB6 move.w #$78,$8130D4` -- the same freeze word boss2attacks.js, bossf23.js
  // and bossguns.js all name. It is set unconditionally and on every frame, which is
  // what a tally screen does: the game is stopped while the bonus counts.
  for (const start of [3, 0]) {
    const f = world();
    armLine(f, start);
    f.ram.setU16(0x8130d4, 0);
    bonusLine125FFA8(f.ram, ROM, f.ctx, TALLY.side0);
    assert.equal(f.ram.u16(0x8130d4), 0x78, `counter ${start} still freezes`);
  }
});

test('W289 the running arm paints the LIVES ROW and allocates from ($C,A6)/($E,A6)',
  { skip: SKIP }, () => {
    // $260014/$26001E is `livesRow2878CC`, ported W116. And the fill takes ($C,A6) and
    // ($E,A6) -- NOT $2600D8's ($10,A6)/($12,A6), which is why the two are not one
    // shared helper however similar they look.
    const f = world();
    armLine(f, 3);
    f.ram.setU16(TALLY.side0 + 0x0c, 0x3333);
    f.ram.setU16(TALLY.side0 + 0x0e, 0x4444);
    f.ram.setU16(TALLY.side0 + TALLY.argA, 0xaaaa);   // ($10,A6) must NOT be used
    f.ram.setU16(TALLY.side0 + TALLY.argB, 0xbbbb);   // ($12,A6) likewise
    const before = cells(f.ram);
    bonusLine125FFA8(f.ram, ROM, f.ctx, TALLY.side0);
    assert.ok(cells(f.ram) > before, 'the lives row drew');
    assert.equal(f.ram.u16(ALLOC.createStage + 0x08), 0x3333, '($C,A6) -> ($8,A0)');
    assert.equal(f.ram.u16(ALLOC.createStage + 0x0a), 0x4444, '($E,A6) -> ($a,A0)');
  });

test('W289 the line counts $23C668 and nothing else', { skip: SKIP }, () => {
  // The 256-longword clear is the same subsystem player.js and tally.js already note.
  const f = world();
  armLine(f, 3);
  bonusLine125FFA8(f.ram, ROM, f.ctx, TALLY.side0);
  const addrs = f.log.report().map((r) => r.replace(/^\s*\d+ x (\$[0-9A-F]+) .*$/s, '$1'));
  assert.deepEqual(addrs, ['$23C668']);
});

// ====================== 10. W290: BONUS LINE 2, `$260056`
//
// The line that CREATES the display objects, and one of them is object dispatch [11] --
// the stage-clear screen W276 ported. So the creator and the created are both in the
// tree now, which closes D9's old note that "type $B is the same unported $25DBB4 that
// D11 is about".

test('W290 line 2 creates BOTH objects, and the handles land in DIFFERENT fields',
  { skip: SKIP }, () => {
    // $26009A type $D -> ($20,A6); $2600AE type $B -> ($1C,A6). Line 1 keeps its one
    // handle at ($18,A6). Three fields for three objects, so reusing one silently drops
    // a handle -- and nothing would throw.
    const f = world();
    f.ram.setU16(0x803926, 0);
    const r = bonusLine2260056(f.ram, ROM, f.ctx, TALLY.side0);
    assert.ok(r, 'the line ran');
    assert.notEqual(r.objA, 0, 'type $D allocated');
    assert.notEqual(r.objB, 0, 'type $B allocated');
    assert.notEqual(r.objA, r.objB, 'and they are different records');
    assert.equal(f.ram.u32(TALLY.side0 + 0x20), r.objA, 'the $D handle is at ($20,A6)');
    assert.equal(f.ram.u32(TALLY.side0 + 0x1c), r.objB, 'the $B handle is at ($1C,A6)');
    assert.equal(f.ram.u32(TALLY.side0 + TALLY.result), 0, 'and ($18,A6) is untouched');
  });

test('W290 type $B is object dispatch [11], the screen W276 ported', { skip: SKIP }, () => {
  // Worth an assertion rather than a comment: it is the fact that makes this line the
  // thing that brings the tally screen into existence.
  const src = readFileSync(path.join(R, 'src', 'main.js'), 'utf8');
  assert.match(src, /\[11, tallyScreen25DBB4\]/, '[11] is registered');
  // And the object the line creates carries the SIDE, which is what [11] reads at +$7.
  const f = world();
  f.ram.setU16(0x803926, 0);
  f.ram.setU8(TALLY.side0 + TALLY.row, 1);
  const r = bonusLine2260056(f.ram, ROM, f.ctx, TALLY.side0);
  assert.equal(f.ram.u8(r.objB + 0x07), 1, '($7,A0) carries the side into [11]');
});

test('W290 the $803926 gate does nothing but re-post', { skip: SKIP }, () => {
  // $260060 tst.w / bne $2600C2 -- straight to the tail. No objects, no high-score
  // check, and the request still goes back so the driver returns.
  const f = world();
  f.ram.setU16(0x803926, 1);
  const r = bonusLine2260056(f.ram, ROM, f.ctx, TALLY.side0);
  assert.equal(r, null, 'the line did nothing');
  assert.equal(f.ram.u32(TALLY.side0 + 0x20), 0, 'no $D handle');
  assert.equal(f.ram.u32(TALLY.side0 + 0x1c), 0, 'no $B handle');
  assert.equal(f.ram.u16(TALLY.side0 + 0x00), 0, 'but it re-posted');
});

test('W290/W300 the HIGH-SCORE check RUNS, and the right side gets the bit', { skip: SKIP }, () => {
  // This was a counted gap from W290 until W300 built the subsystem. `$287BD2`/`$287C08`
  // now run for real, so what this asserts is the wiring: the ROW byte picks the side, and
  // the side's own bit of `$8130CC` is set. Bit 0 is P1 and bit 1 is P2, from two separate
  // `ori.b` instructions, so a boolean would have lost one of them.
  for (const [side, bit] of [[0, 0x01], [1, 0x02]]) {
    const f = world();
    f.ram.setU16(0x803926, 0);
    f.ram.setU8(TALLY.side0 + TALLY.row, side);
    f.ram.setU8(0x8130cc, 0);
    f.ram.setU32(HISCORE_SIDES[side].total, 0x00123456);   // beats an empty table
    bonusLine2260056(f.ram, ROM, f.ctx, TALLY.side0);
    assert.equal(f.ram.u8(0x8130cc), bit, `side ${side} sets bit ${bit}`);
    assert.equal(f.ram.u32(HISCORE.scoresBase), 0x00123456, 'and the score went in at 0');
  }
});

test('W290/W300 the carry sense: a losing score sets NO bit', { skip: SKIP }, () => {
  // `$260078 bcs $26009A` SKIPS the `ori`, and `$287CE8 ori #$1,SR` is the failure exit.
  // Reading that backwards flags the losing side, which is why it gets its own test rather
  // than riding along with the case above.
  const f = world();
  f.ram.setU16(0x803926, 0);
  f.ram.setU8(TALLY.side0 + TALLY.row, 0);
  f.ram.setU8(0x8130cc, 0);
  // An empty table plus a zero score: the tie at the last entry exits with the borrow.
  f.ram.setU32(HISCORE_SIDES[0].total, 0);
  bonusLine2260056(f.ram, ROM, f.ctx, TALLY.side0);
  assert.equal(f.ram.u8(0x8130cc), 0, 'no bit for a score that did not get in');
});

test('W290/W300 line 2 still creates both objects when the score loses', { skip: SKIP }, () => {
  // `$260078 bcs $26009A` lands on the object creation, not on the tail, so the high-score
  // outcome must not gate the tally screen coming into existence.
  const f = world();
  f.ram.setU16(0x803926, 0);
  f.ram.setU8(TALLY.side0 + TALLY.row, 0);
  f.ram.setU32(HISCORE_SIDES[0].total, 0);
  const r = bonusLine2260056(f.ram, ROM, f.ctx, TALLY.side0);
  assert.ok(r.objA, 'the type $D object exists');
  assert.ok(r.objB, 'and object [11], the tally screen');
});

test('W290 line 2 recounts the live sides on the way in', { skip: SKIP }, () => {
  // $26005C jsr $25FD94 -- W277's routine, and it runs BEFORE the gate, so it happens
  // even on the do-nothing path.
  for (const gate of [0, 1]) {
    const f = world();
    f.ram.setU16(0x803926, gate);
    f.ram.setU16(HUDRAM.attract, 0x1234);
    bonusLine2260056(f.ram, ROM, f.ctx, TALLY.side0);
    assert.equal(f.ram.u16(HUDRAM.attract), 0xffff,
      `gate ${gate}: no side is live, so the count is $FFFF`);
  }
});

// ============ 11. W291: BONUS LINE 3 IS $2600D8'S SECOND ENTRY POINT
//
// `$26010E: movem.l D0-D7/A0-A6,-(A7)` and then it FALLS INTO `$260112`. W273 read that
// and wrote it down without knowing what used it; `$25FF52[3]` is what uses it. So bonus
// line 3 is the same body with the side selection skipped, because `$25FF7A`'s driver has
// already put the record in A6 and walks both itself.

test('W291 line 3 takes the DRIVER\'s record, not one it picks itself', { skip: SKIP }, () => {
  // The whole difference between the two entry points. `$2600D8` chooses from D2; this
  // one is handed A6. Driving side 1's record proves the choice is the caller's.
  const f = world();
  f.ram.setU32(TALLY.side1 + TALLY.ptr, 0x81f600);
  f.ram.setU16(TALLY.side1 + TALLY.type, 6);
  bonusLine326010E(f.ram, ROM, f.ctx, TALLY.side1);
  assert.notEqual(f.ram.u32(TALLY.side1 + TALLY.result), 0, 'side 1\'s record ran');
  assert.equal(f.ram.u32(TALLY.side0 + TALLY.result), 0, 'and side 0\'s did not');
  // And it does NOT post the two $81308x words, because $2600E2/$2600F8 are above the
  // entry point -- that is exactly what the second entry skips.
  assert.equal(f.ram.u16(TALLY.postD0[0]), 0, 'no D0 posted for side 0');
  assert.equal(f.ram.u16(TALLY.postD0[1]), 0, 'nor for side 1');
});

test('W291 line 3 runs the SAME body as $2600D8 -- same rows, same counter, same posts',
  { skip: SKIP }, () => {
    // If the split had changed behaviour, the two entries would diverge. Drive them
    // against the same record and compare the observable effects.
    const viaFull = world();
    viaFull.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f700);
    viaFull.ram.setU16(TALLY.side0 + TALLY.type, 6);
    tally2600D8(viaFull.ram, ROM, viaFull.ctx, 0, 0, 0);

    const viaEntry = world();
    viaEntry.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81f700);
    viaEntry.ram.setU16(TALLY.side0 + TALLY.type, 6);
    bonusLine326010E(viaEntry.ram, ROM, viaEntry.ctx, TALLY.side0);

    for (const [what, a] of [['the digit records', HUDRAM.digitsP1 + 2],
      ['the extend threshold', HUDRAM.extendNextP1]]) {
      assert.equal(viaEntry.ram.u32(a), viaFull.ram.u32(a), `${what} match`);
    }
    assert.equal(viaEntry.ram.u16(HUDRAM.digitStateP1),
      viaFull.ram.u16(HUDRAM.digitStateP1), 'the digit state matches');
    assert.equal(viaEntry.ram.u16(TALLY.counter),
      viaFull.ram.u16(TALLY.counter), 'and the $813142 decrement matches');
    assert.equal(cells(viaEntry.ram), cells(viaFull.ram), 'and the same rows drew');
  });

test('W291 the ROM really does fall through from $26010E into $260112',
  { skip: HAVE_IMG ? false : 'the decrypted image is absent' }, () => {
    // The claim the whole wave rests on, read out of the image: $26010E is a movem.l and
    // the very next instruction is $260112, which is $2600D8's own body. If there were a
    // branch between them, line 3 would be a different routine.
    const u16i = (a) => (IMG[a] << 8) | IMG[a + 1];
    assert.equal(u16i(0x26010e), 0x48e7, '$26010E is movem.l ...,-(A7)');
    assert.equal(u16i(0x260110), 0xfffe, 'saving D0-D7/A0-A6');
    // $260112 is `subq.w #1,$813142` -- 0x5379 then the absolute long.
    assert.equal(u16i(0x260112), 0x5379, 'and $260112 is the body\'s first instruction');
    assert.equal(((u16i(0x260114) << 16) | u16i(0x260116)) >>> 0, 0x00813142,
      'decrementing $813142');
    // The same two words open $2600D8, which is what makes them two entries to one body.
    assert.equal(u16i(0x2600d8), 0x48e7);
  });

// ============ 12. W292: BONUS LINE 4, AND IT CARRIES TWO LOOP-2 RULES
//
// `$2601F4` is `$2600D8`'s shape with two `$813098` gates -- and they are not the same
// test used twice: one is `beq` and the other `bne`.
//
//   loop 1   the pointer gets the DIP word, and `$286FB4` RUNS
//   loop 2   the pointer gets `$8130C2`/`$8130C4`, and `$286FB4` is SKIPPED

function world4() {
  const f = world();
  const palette = new PaletteState();
  f.palette = palette;
  f.ctx.palette = palette;
  f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81fb00);
  f.ram.setU16(TALLY.side0 + TALLY.type, 6);
  return f;
}

test('W292 LOOP GATE ONE: the pointer gets the DIP word in loop 1 and $8130C2 in loop 2',
  { skip: SKIP }, () => {
    const one = world4();
    one.ram.setU16(0x813098, 0);
    one.ram.setU16(0x8130c2, 0xbeef);
    bonusLine42601F4(one.ram, ROM, one.ctx, TALLY.side0);
    assert.equal(one.ram.u16(0x81fb00), ROM.u16(TALLY.dipWords),
      'loop 1 writes $2600CE[dip]');

    const two = world4();
    two.ram.setU16(0x813098, 1);
    two.ram.setU16(0x8130c2, 0xbeef);
    bonusLine42601F4(two.ram, ROM, two.ctx, TALLY.side0);
    assert.equal(two.ram.u16(0x81fb00), 0xbeef, 'loop 2 writes $8130C2 instead');
  });

test('W292 LOOP GATE ONE picks the SIDE\'s word', { skip: SKIP }, () => {
  // $26021A vs $260224 -- $8130C2 for side 0, $8130C4 for side 1.
  const f = world4();
  f.ram.setU8(TALLY.side0 + TALLY.row, 1);
  f.ram.setU16(0x813098, 1);
  f.ram.setU16(0x8130c2, 0x1111);
  f.ram.setU16(0x8130c4, 0x2222);
  bonusLine42601F4(f.ram, ROM, f.ctx, TALLY.side0);
  assert.equal(f.ram.u16(0x81fb00), 0x2222, 'side 1 takes $8130C4');
});

test('W292 LOOP GATE TWO: $286FB4 runs in loop 1 and is SKIPPED in loop 2',
  { skip: SKIP }, () => {
    // `$26028C tst.w $813098 / bne` -- the OPPOSITE sense to gate one, in the same
    // routine, on the same word. A port that shared one flag between them would get one
    // of the two backwards.
    const one = world4();
    one.ram.setU16(0x813098, 0);
    bonusLine42601F4(one.ram, ROM, one.ctx, TALLY.side0);
    assert.notEqual(one.ram.u32(HUDRAM.extendNextP2), 0,
      'loop 1 seeds P2\'s extend threshold');

    const two = world4();
    two.ram.setU16(0x813098, 1);
    bonusLine42601F4(two.ram, ROM, two.ctx, TALLY.side0);
    assert.equal(two.ram.u32(HUDRAM.extendNextP2), 0, 'loop 2 does not');
  });

test('W292 $286FB4 is SIDE 1\'s arm, whatever the record says', { skip: SKIP }, () => {
  // Called unconditionally, not through ($17,A6). Reading it as "the row for this side"
  // would be wrong twice: wrong arm, and conditional on the loop.
  const f = world4();
  f.ram.setU8(TALLY.side0 + TALLY.row, 0);       // a SIDE-0 record
  f.ram.setU16(0x813098, 0);
  bonusLine42601F4(f.ram, ROM, f.ctx, TALLY.side0);
  assert.notEqual(f.ram.u32(HUDRAM.extendNextP2), 0, 'P2\'s threshold was seeded');
  assert.equal(f.ram.u32(HUDRAM.extendNextP1), 0, 'and P1\'s was NOT');
});

test('W292 ($6,A0) is the LOW byte of the loop word, not a literal 0', { skip: SKIP }, () => {
  // $260238 move.b $813099,($6,A0). 68000 is big-endian, so $813099 is the LOW byte of
  // the word $813098 tst.w reads -- the object is told WHICH LOOP it is in. $2600D8
  // writes a literal 0 in the same field.
  for (const loop of [0, 1, 2]) {
    const f = world4();
    f.ram.setU16(0x813098, loop);
    const rec = bonusLine42601F4(f.ram, ROM, f.ctx, TALLY.side0);
    assert.ok(rec, `loop ${loop} allocated`);
    assert.equal(f.ram.u8(rec + 0x06), loop, `($6,A0) carries the loop (${loop})`);
  }
});

test('W292 line 4 posts announcement state $8 and recounts the sides', { skip: SKIP }, () => {
  const f = world4();
  f.ram.setU16(0x813098, 0);
  f.ram.setU16(HUDRAM.attract, 0x4321);
  bonusLine42601F4(f.ram, ROM, f.ctx, TALLY.side0);
  assert.equal(f.ram.u16(0x813162 + 0x02), 0x08, '$2602A0 jsr $260AB6');
  assert.equal(f.ram.u16(TALLY.side0 + 0x00), 0, 'and it re-posted');
  assert.notEqual(f.ram.u16(HUDRAM.attract), 0x4321, '$2602B0 jsr $25FD94 ran');
});

// ================== 13. W293: BONUS LINE 5 IS THE TEARDOWN
//
// The first line that does not take the record it is handed -- it takes BOTH, because it
// kills what line 2 built for both sides at once.

test('W293 line 5 queues NINE kills, and the first four are line 2\'s handles',
  { skip: SKIP }, () => {
    // ($1C,A2) ($1C,A3) ($20,A2) ($20,A3) then five globals. Line 2 put the type-$B
    // handle at ($1C,A6) and the type-$D handle at ($20,A6), so the pairing is what makes
    // both lines legible -- neither field choice looks meaningful alone.
    const f = world();
    f.ram.setU32(TALLY.side0 + 0x1c, 0x111);
    f.ram.setU32(TALLY.side1 + 0x1c, 0x222);
    f.ram.setU32(TALLY.side0 + 0x20, 0x333);
    f.ram.setU32(TALLY.side1 + 0x20, 0x444);
    for (const [i, g] of [0x813148, 0x813144, 0x81314c, 0x813150, 0x813154].entries()) {
      f.ram.setU32(g, 0x500 + i);
    }
    const before = f.ram.u16(ALLOC.killSp);
    bonusLine52602B6(f.ram, ROM, f.ctx, TALLY.side0);
    const n = (f.ram.u16(ALLOC.killSp) - before) / ALLOC.stride;
    assert.equal(n, 9, 'nine kills');
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(f.ram.u32(ALLOC.killQueue + before + i * ALLOC.stride));
    assert.deepEqual(ids, [0x111, 0x222, 0x333, 0x444, 0x500, 0x501, 0x502, 0x503, 0x504],
      'in the ROM\'s own order: both records per field, then the five globals');
  });

test('W293 the kill takes a POINTER, so the port must DEREFERENCE', { skip: SKIP }, () => {
  // `$241252 move.l (A0),(A1)`. Passing the ADDRESS would queue a kill for a handle equal
  // to a RAM address, which the drain would silently fail to match -- so this asserts the
  // queued value is the HANDLE and not the field's address.
  const f = world();
  f.ram.setU32(TALLY.side0 + 0x1c, 0xabcd);
  const before = f.ram.u16(ALLOC.killSp);
  bonusLine52602B6(f.ram, ROM, f.ctx, TALLY.side0);
  assert.equal(f.ram.u32(ALLOC.killQueue + before), 0xabcd, 'the handle, dereferenced');
  assert.notEqual(f.ram.u32(ALLOC.killQueue + before), TALLY.side0 + 0x1c,
    'and NOT the address of the field');
});

test('W293 line 5 plays BOTH cues and creates ONE type-$E object', { skip: SKIP }, () => {
  const cues = [];
  const f = world();
  f.ctx.soundPost = (id) => cues.push(id);
  const rec = bonusLine52602B6(f.ram, ROM, f.ctx, TALLY.side0);
  assert.deepEqual(cues, [0x28c170, 0x28c0fc], '$260326 then $26032C, in that order');
  assert.notEqual(rec, null, 'type $E allocated');
  assert.equal(f.ram.u16(rec), (0x0e | 0x8000) >>> 0, '$260332 move.w #$E,D0');
});

test('W293 the type-$E handle is DROPPED -- the ROM keeps it nowhere', { skip: SKIP }, () => {
  // Lines 1, 2 and 4 all follow `jsr $241182` with a `move.l D0,(...)`. This one does not:
  // no field of the record changes. So whatever type $E is, it finds its own way out, and
  // a port that "helpfully" stored the handle would invent state.
  const f = world();
  bonusLine52602B6(f.ram, ROM, f.ctx, TALLY.side0);
  for (const off of [0x18, 0x1c, 0x20]) {
    assert.equal(f.ram.u32(TALLY.side0 + off), 0,
      `($${off.toString(16)},A6) was not written`);
  }
});

test('W293 line 5 re-posts, like every other line', { skip: SKIP }, () => {
  const f = world();
  f.ram.setU16(TALLY.side0 + 0x00, 5);
  bonusLine52602B6(f.ram, ROM, f.ctx, TALLY.side0);
  assert.equal(f.ram.u16(TALLY.side0 + 0x00), 0, '$26033C');
  assert.equal(f.ram.u16(TALLY.side0 + 0x02), 0, '$260340');
});

// ============ 14. W294: BONUS LINE 6 -- FOUR INSTRUCTIONS, AND ONE USES A5

test('W294 line 6 advances the CALLER\'s object to its tally state', { skip: SKIP }, () => {
  // `$260348 move.b #$2,($2,A5)`. $2 is exactly SCREEN11.state, and value 2 is
  // screenState2_25DB7C -- the tally call. So the line's whole job is to tell the object
  // that posted this request to advance to its tally state.
  const f = world();
  bonusLine6260348(f.ram, TALLY.side0, A5);
  assert.equal(f.ram.u8(A5 + SCREEN11.state), 2, 'the caller is in state 2');
  assert.equal(f.ram.u16(TALLY.side0 + 0x00), 0, '$26034E');
  assert.equal(f.ram.u16(TALLY.side0 + 0x02), 0, '$260352');
});

test('W294 the offset it writes IS object [11]\'s state field', { skip: SKIP }, () => {
  // Not a coincidence worth leaving implicit: if these two ever diverge, line 6 would be
  // advancing something else and the tally would stall with no error.
  assert.equal(SCREEN11.state, 0x02);
});

test('W294 a MISSING A5 throws by address rather than writing to $0002', { skip: SKIP }, () => {
  // `$25FF7A` never sets A5 -- it sets A6 and D7 and nothing else -- so the caller must
  // supply it. Defaulting to 0 would put a 2 at $0002, which is neither a record nor
  // anything the kill drain or any gate would catch.
  const f = world();
  assert.throws(() => bonusLine6260348(f.ram, TALLY.side0, undefined),
    (e) => e.name === 'Unreached' && e.romAddress === 0x260348,
    'it refuses rather than guessing');
  assert.throws(() => bonusLine6260348(f.ram, TALLY.side0, null));
});

test('W294 the A5 parameter is DELIBERATE, and the source says why', () => {
  // W288 reverted a finished body over an A5/A0 question. This one is not that situation
  // and the difference is the judgement: $280252's A0 fed `movem.w ($2,A0),D2-D3` -- a
  // target POSITION, where a wrong register yields plausible motion silently -- while
  // line 6's A5 feeds one unconditional `move.b #$2` into a known state offset, where a
  // wrong register is loud and nothing is derived from it. Asserted because the next
  // reader will otherwise wonder why one was deferred and the other was not.
  const src = readFileSync(path.join(R, 'src', 'tally.js'), 'utf8');
  const block = src.slice(src.indexOf('W294 -- `$260348`'));
  const head = block.slice(0, block.indexOf('const BONUS6'));
  assert.match(head, /THE DRIVER NEVER SETS A5/);
  assert.match(head, /plausible coordinates and plausible motion, silently/);
  assert.match(head, /loud, and no arithmetic/);
});

// ============ 15. W295: BONUS LINE 7 -- THE COUNTER GOES BACK UP

test('W295 line 7 GIVES BACK the counter $2600D8 spends', { skip: SKIP }, () => {
  // `$26035A addq.w #1,$813142` against `$260112 subq.w #1,$813142`. The pair is a LEASE,
  // not a countdown -- which is why W273 found the decrement unguarded: nothing guards it
  // because something else returns it.
  const f = world();
  f.ram.setU16(TALLY.counter, 5);
  bonusLine726035A(f.ram, TALLY.side0);
  assert.equal(f.ram.u16(TALLY.counter), 6, 'one back');
  // And it is the same word, which is the point.
  assert.equal(TALLY.counter, 0x813142);
});

test('W295 line 7 advances the TYPE-$D object through line 2\'s stored handle',
  { skip: SKIP }, () => {
    // `move.l ($20,A6),D0 / jsr $241298 / move.b #$3,($2,A0)`. ($20,A6) is where line 2
    // put the type-$D handle, so this is the third wave to depend on that field choice --
    // W293 killed those fields and this reads one.
    const f = world();
    const slot = ALLOC.table + 3 * ALLOC.stride;
    f.ram.setU32(slot + ALLOC.idOff, 0x1234);
    f.ram.setU32(TALLY.side0 + 0x20, 0x1234);
    const r = bonusLine726035A(f.ram, TALLY.side0);
    assert.equal(r.found, true, 'the handle resolved');
    assert.equal(r.rec, slot, 'to the right slot');
    assert.equal(f.ram.u8(slot + 0x02), 3, 'and its state is 3');
  });

test('W295 lines 6 and 7 advance DIFFERENT objects to DIFFERENT states',
  { skip: SKIP }, () => {
    // line 6: ($2,A5) = 2, the CALLER, through a register the driver leaves.
    // line 7: ($2,A0) = 3, the TYPE-$D object, through a handle line 2 STORED.
    // Two objects, two states, two routes -- so a port that shared a helper between them
    // would be wrong twice.
    const f = world();
    const slot = ALLOC.table + 4 * ALLOC.stride;
    f.ram.setU32(slot + ALLOC.idOff, 0x77);
    f.ram.setU32(TALLY.side0 + 0x20, 0x77);
    bonusLine6260348(f.ram, TALLY.side0, A5);
    bonusLine726035A(f.ram, TALLY.side0);
    assert.equal(f.ram.u8(A5 + 0x02), 2, 'the caller went to 2');
    assert.equal(f.ram.u8(slot + 0x02), 3, 'and the type-$D object to 3');
    assert.notEqual(A5, slot, 'and they really are different records');
  });

test('W295 a DEAD handle resolves to the dummy and does NOT throw', { skip: SKIP }, () => {
  // An object dying between the frame that stored its handle and the frame that uses it is
  // normal. `$2412C4 lea $80D51C,A0` is the cartridge's answer: write to the dummy and
  // carry on. A port that threw here would stop the game on an ordinary event.
  const f = world();
  f.ram.setU32(TALLY.side0 + 0x20, 0x9999);      // matches nothing
  const r = bonusLine726035A(f.ram, TALLY.side0);
  assert.equal(r.found, false);
  assert.equal(r.rec, ALLOC.createDummy, 'the same $80D51C stageCreate uses');
  assert.equal(f.ram.u8(ALLOC.createDummy + 0x02), 3, 'and the 3 landed on the dummy');
});

test('W295 $241298 skips slot-0 ids, so a DROPPED handle reads as gone', { skip: SKIP }, () => {
  // `$2412A4 move.l ($4C,A0),D2 / beq` -- an id of 0 is a FREE slot and is skipped. So a
  // handle of 0 never matches a live object, which is what makes a dropped handle read as
  // "gone" rather than as slot one.
  const f = world();
  const slot0 = ALLOC.table;
  f.ram.setU32(slot0 + ALLOC.idOff, 0);          // free
  assert.equal(resolveHandle241298(f.ram, 0).found, false, 'handle 0 matches nothing');
  assert.equal(resolveHandle241298(f.ram, 0).rec, ALLOC.createDummy);
});

// ======== 16. W296: BONUS LINE 8, AND THE DRIVER -- ALL NINE LINES REACHABLE

test('W296 line 8 clears ($5) on BOTH sides\' type-$D objects', { skip: SKIP }, () => {
  // The FOURTH wave to use line 2's ($20,A6): W290 stored it, W293 killed it, W295 read
  // it, this clears a byte through it.
  const f = world();
  const s3 = ALLOC.table + 3 * ALLOC.stride;
  const s4 = ALLOC.table + 4 * ALLOC.stride;
  f.ram.setU32(s3 + ALLOC.idOff, 0x11);
  f.ram.setU32(s4 + ALLOC.idOff, 0x22);
  f.ram.setU32(TALLY.side0 + 0x20, 0x11);
  f.ram.setU32(TALLY.side1 + 0x20, 0x22);
  f.ram.setU8(s3 + 0x05, 0xff);
  f.ram.setU8(s4 + 0x05, 0xff);
  bonusLine826037C(f.ram, TALLY.side0);
  assert.equal(f.ram.u8(s3 + 0x05), 0, 'side 0\'s object');
  assert.equal(f.ram.u8(s4 + 0x05), 0, 'side 1\'s object');
});

test('W296 the driver runs ALL NINE requests without throwing', { skip: SKIP }, () => {
  // The point of the wave: every entry of `$25FF52` now has a body. Request 0 is idle.
  for (let req = 0; req <= 9; req++) {
    const f = world();
    f.ctx.palette = new PaletteState();
    f.ctx.soundPost = () => {};
    f.ram.setU16(TALLY.side0 + 0x00, req);
    f.ram.setU32(TALLY.side0 + TALLY.ptr, 0x81fc00);
    f.ram.setU16(0x81fc00, 3);
    f.ram.setU16(TALLY.side0 + TALLY.type, 6);
    assert.doesNotThrow(() => tallyDriver25FF7A(f.ram, ROM, f.ctx, A5),
      `request ${req} has a body`);
  }
});

test('W296 request 0 is IDLE, and the guard is the CODE not the table', { skip: SKIP }, () => {
  // `$25FF52[0]` really is $00000000; `$25FF84 cmpi.w #$0,D0 / beq` is what stops a
  // request of 0 jumping to address 0. So the null entry is real data -- W279's window
  // covers it deliberately -- and the port must test the REQUEST.
  assert.equal(ROM.u32(0x25ff52), 0, 'entry 0 is null in the cartridge');
  const f = world();
  f.ram.setU16(TALLY.side0 + 0x00, 0);
  f.ram.setU16(TALLY.counter, 0x1234);
  const ran = tallyDriver25FF7A(f.ram, ROM, f.ctx, A5);
  assert.deepEqual(ran, [0, 0], 'both records idle');
  assert.equal(f.ram.u16(TALLY.counter), 0x1234, 'and nothing ran');
});

test('W296 a request PAST 9 throws by address rather than jumping into code',
  { skip: SKIP }, () => {
    // The table is TEN longwords, so request 10 would read $25FF7A itself -- the driver's
    // own `lea` -- and jump into it.
    const f = world();
    f.ram.setU16(TALLY.side0 + 0x00, 10);
    assert.throws(() => tallyDriver25FF7A(f.ram, ROM, f.ctx, A5),
      (e) => e.name === 'Unreached' && e.romAddress === 0x25ff92);
  });

test('W296 the driver walks BOTH records, at stride $24', { skip: SKIP }, () => {
  // `lea ($24,A6),A6 / dbra D7` with D7 = 1. Two records, and the second is side 1.
  const f = world();
  f.ram.setU16(TALLY.side0 + 0x00, 7);
  f.ram.setU16(TALLY.side1 + 0x00, 7);
  f.ram.setU16(TALLY.counter, 0);
  const ran = tallyDriver25FF7A(f.ram, ROM, f.ctx, A5);
  assert.deepEqual(ran, [7, 7], 'both records ran');
  // Line 7 returns the lease once per record, so two records give two.
  assert.equal(f.ram.u16(TALLY.counter), 2, 'the lease came back twice');
  assert.equal(TALLY.side1 - TALLY.side0, TALLY.stride, 'and the stride is $24');
});

test('W296 line 9 was ALREADY ported, and player.js said so', () => {
  // `setPanel2603B0` describes itself as "jump-table entry 9 of `$25FF7A`" in its own
  // words. The connection was recorded and the table that needed it did not exist yet --
  // the same shape as W291's find, where W273 had noted an entry point nobody used.
  const src = readFileSync(path.join(R, 'src', 'player.js'), 'utf8');
  assert.match(src, /jump-table entry 9 of `\$25FF7A`/);
  assert.match(src, /export function setPanel2603B0/);
});

// ============ 17. W297: `$2532B6` -- THE LAST NOTE IN THE TALLY LINES
//
// `setPanel2603B0` counted `$2532B6` as "the DEFERRED text path" since the wave that wrote
// it. Both printers have been ported since W116, so the only thing missing was the
// arithmetic deciding how many of each row to draw.

test('W297 the panel is ONE bar in three segments, and they always sum to SIX',
  { skip: SKIP }, () => {
    // The runs are ($24,A6), ($25,A6) - ($24,A6) and 5 - ($25,A6) + 1. The SIX is
    // `moveq #$5,D6` with `dbra` -- exactly the fact W276 recorded for $2533F6's own
    // `moveq #$5,D7`. The first draft of this port said five; measuring said six.
    for (const [lo, hi] of [[0, 0], [2, 3], [0, 5], [5, 5], [1, 4], [3, 3]]) {
      for (const who of [0, 1]) {
        const f = world();
        const rec = who === 0 ? MACHINE.player1 : MACHINE.player2;
        f.ram.setU8(rec + 0x24, lo);
        f.ram.setU8(rec + 0x25, hi);
        const r = setPanelBody2532B6(f.ram, who, rec);
        assert.equal(r.runA + r.runB + r.runC, 6,
          `lo=${lo} hi=${hi} side=${who} sums to six`);
        assert.equal(r.runA, lo, 'run A is ($24,A6)');
        assert.equal(r.runB, Math.max(0, hi - lo), 'run B is what is LEFT of ($25,A6)');
      }
    }
  });

test('W297 loop A takes its share off the HIGH half too', { skip: SKIP }, () => {
  // `$25334C subi.l #$10001,D5` decrements BOTH halves in one instruction while
  // `tst.w D5` tests only the low one. So loop B's length is already ($25,A6) - ($24,A6)
  // when it swaps back. Modelling the halves separately is fine; modelling them as one
  // long and forgetting the high half is not -- that would give run B = hi.
  const f = world();
  f.ram.setU8(MACHINE.player1 + 0x24, 4);
  f.ram.setU8(MACHINE.player1 + 0x25, 4);
  const r = setPanelBody2532B6(f.ram, 0, MACHINE.player1);
  assert.equal(r.runA, 4);
  assert.equal(r.runB, 0, 'loop A consumed all of the high half');
});

test('W297 the panel really DRAWS, and both sides land in different cells',
  { skip: SKIP }, () => {
    const p1 = world();
    p1.ram.setU8(MACHINE.player1 + 0x25, 3);
    setPanelBody2532B6(p1.ram, 0, MACHINE.player1);
    const n = cells(p1.ram);
    assert.ok(n > 0, 'side 0 printed');

    const p2 = world();
    p2.ram.setU8(MACHINE.player2 + 0x25, 3);
    setPanelBody2532B6(p2.ram, 1, MACHINE.player2);
    assert.equal(cells(p2.ram), n, 'the same number of cells');
    let differs = false;
    for (let a = TX.head; a < TX.head + n * 8; a += 8) {
      if (p1.ram.u32(a) !== p2.ram.u32(a)) { differs = true; break; }
    }
    assert.ok(differs, 'at different destinations');
  });

test('W297 D7 is LOAD-BEARING here where $2533F6\'s was dead', () => {
  // W276 recorded that `move.w #$100,D7` before $2533F6's `jsr $240E1A` is overwritten at
  // $240E44 and therefore dead. Still true there. HERE the same constant is the ROW STEP:
  // `$253322 add.w D7,D1` uses it AFTER the call, and `$253324`'s `bmi` doubles it only
  // for P1 -- so P1 steps +$200 and P2 -$200. Two routines, the same immediate, one dead
  // and one load-bearing, and the port has to know which is which.
  const src = readFileSync(path.join(R, 'src', 'player.js'), 'utf8');
  const block = src.slice(src.indexOf('W297 -- `$2532B6`'));
  const head = block.slice(0, block.indexOf('const PANEL_SIDES'));
  assert.match(head, /D7 DOUBLES IF NON-NEGATIVE/);
  assert.match(head, /one dead and one load-bearing/);
});

test('W297 setPanel2603B0 no longer counts $2532B6', () => {
  // The last note inside the nine bonus lines, and it is gone: both arms of
  // $2534F8/$253522 reach the body, so it runs either way.
  const src = readFileSync(path.join(R, 'src', 'player.js'), 'utf8');
  const fn = src.slice(src.indexOf('export function setPanel2603B0'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(!/note\(0x2532b6/.test(body), '$2532B6 is not noted any more');
  assert.match(body, /setPanelBody2532B6\(ram, p2 \? 1 : 0, c\.rec\)/, 'it is CALLED');
});
