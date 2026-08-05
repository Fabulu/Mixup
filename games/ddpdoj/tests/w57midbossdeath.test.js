// W57 (M1) -- ENEMY TYPE $1C, WHAT THE MIDBOSS'S DEATH SPAWNS.
//
// The defect these tests exist for: `$26B7E0 moveq #$1C,D0 / $26B7E2 jsr
// $263684` is the only enqueuer of type $1C in build B, W51 made the beam able
// to kill the midboss, and the LIVE PAGE then stopped with `UNPORTED $26C1C4` --
// the run-length word of an init stub outside every exported ROM window. The
// path had been transcribed-and-unexercised for 25 waves behind a green gate.
//
// SHAPE, following W30/W36's. Every test drives a real routine against the REAL
// exported cartridge windows and asserts on a value the ROM decides -- the
// prototype flags word out of `$26C1F0`, 207 map longwords out of `$227AF8`,
// the free clock out of `$26C20C`'s own immediate. Nothing here writes a
// constant and reads it back through the same constant (`docs/knowledge/03`).
//
// Throw assertions pin `e.romAddress`, never the message text (27-review 1A).
//
// The tests SKIP LOUDLY when the export is absent. A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { BgVram } from '../src/background.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

// The type's own four ROM addresses, and the two the handler reads THROUGH.
const T1C = {
  initStub: 0x26c1c2,   // `3B7C 0000 0004 / 4E75`; run length at init+2
  initBody: 0x26c1ca,   // init+8
  recProto: 0x26c1ee,   // $26C1D6 lea, one word ($26C1DC moveq #$0,D0)
  subProto: 0x26c1f0,   // $26C1CA lea
  handler: 0x26c20c,
  src: 0x227af8,        // $26C220 lea -- inside the WAVE 13 column-stream window
  tileBase: 0x32a90000, // $26C244 addi.l
  freeClock: 0x0105,    // $26C20C cmpi.w
};
const CLOCK = 0x8130ce;

const A5 = 0x81364c, A6 = 0x81459c;

/** An enemy record whose sub-record is A6, with the run length the stub wrote. */
function fixture(runLen = 0) {
  const ram = new Ram();
  for (let i = 0; i < 0x60; i++) ram.setU8(A5 + i, 0);
  for (let i = 0; i < 0x40; i++) ram.setU8(A6 + i, 0);
  ram.setU16(A5, 0x8000);                 // live
  ram.setU32(A5 + 0x06, A6);              // ($6,A5) = the sub-record
  ram.setU16(A5 + 0x04, runLen);          // ($4,A5), written by the init STUB
  return ram;
}

// ===================================================================== EXPORT
//
// The window is the whole fix's foundation: without it `initDispatch`'s
// `rom.u16(init + 2)` throws and the page stops. These assert the extent from
// BOTH ENDS out of the exported bytes, not out of this file's numbers.

test('W57: $26C1C4 -- the word that stopped the live page is now readable', {
  skip: SKIP,
}, () => {
  // `initDispatch` reads `rom.u16(init + 2)`; the stub is
  // `3B7C 000N 0004 / 4E75` and N is that word.
  assert.equal(ROM.u16(T1C.initStub), 0x3b7c, '$26C1C2 must be `move.w #N,($4,A5)`');
  assert.equal(ROM.u16(T1C.initStub + 2), 0x0000, 'type $1C\'s run length is 0');
  assert.equal(ROM.u16(T1C.initStub + 4), 0x0004, 'the destination is ($4,A5)');
  assert.equal(ROM.u16(T1C.initStub + 6), 0x4e75, 'and the stub ends `rts`');
});

test('W57: the window ENDS where $26C20C begins -- $4A, not $50', {
  skip: SKIP,
}, () => {
  // $26C1F0's flags word is $8000 -> $2637A2 takes the LONG form: 2 + 6*4 + 2
  // = 28 table bytes for the one sub-record `($4,A5) = 0` asks for. So the
  // prototype ends at $26C1F0 + 28, and that address must be the HANDLER.
  assert.equal(ROM.u16(T1C.subProto) & 0x8000, 0x8000,
    '$26C1F0 must be the LONG prototype form, or the extent below is wrong');
  assert.equal(T1C.subProto + 28, T1C.handler);
  // The last byte the port may read is $26C20B. $26C20C is code
  // (`cmpi.w #$105,$8130CE` = 0C79 0105 0081 30CE) and must be OUTSIDE.
  assert.doesNotThrow(() => ROM.u32(T1C.handler - 4));
  assert.throws(() => ROM.u16(T1C.handler), (e) => {
    assert.ok(e instanceof Unreached);
    assert.equal(e.romAddress, T1C.handler);
    return true;
  }, 'a $50-wide window would swallow six bytes of the handler as data');
});

// ================================================================= THE BODY
test('W57: $26C1CA loads BOTH prototypes and writes $38001C00 over ($2,A6)', {
  skip: SKIP,
}, () => {
  const ram = fixture(0);
  assert.ok(INIT_BODY_ADDRESSES.includes(T1C.initBody),
    'the body must be in the dispatch, or spawn.js throws by address');
  runInitBodyAddr(T1C.initBody, ram, ROM, A5, new UnportedLog());
  // $2637A2's LONG form: flags word, a 4-byte hole, six longwords, a word.
  assert.equal(ram.u16(A6 + 0x00), ROM.u16(T1C.subProto),
    'the sub-record flags word comes from $26C1F0');
  assert.equal(ram.u32(A6 + 0x06), ROM.u32(T1C.subProto + 2),
    'the first prototype longword lands past the 4-byte hole');
  assert.equal(ram.u16(A6 + 0x1e), ROM.u16(T1C.subProto + 26),
    'and the trailing word is the 28th table byte');
  // $26377A with D0 = 0 copies ONE word into ($16,A5) and no more.
  assert.equal(ram.u16(A5 + 0x16), ROM.u16(T1C.recProto));
  assert.equal(ram.u16(A5 + 0x18), 0, 'D0 = 0 means ONE word, not two');
  // $26C1E4 -- one longword over BOTH position words, AFTER the loaders.
  assert.equal(ram.u32(A6 + 0x02) >>> 0, 0x38001c00);
});

test('W57: $26C1CA does NOT read the movement stream', { skip: SKIP }, () => {
  // Every other stage-1 body calls `$263808`. This one does not: the position
  // is a literal. Driving it with a movement pointer that would throw proves
  // the call is absent -- the strong form, since only the listing proves
  // absence and this is the port's side of it.
  const ram = fixture(0);
  ram.setU32(A5 + 0x12, 0xdeadbee0);       // a stream the reader cannot follow
  assert.doesNotThrow(() =>
    runInitBodyAddr(T1C.initBody, ram, ROM, A5, new UnportedLog()));
  assert.equal(ram.u32(A6 + 0x02) >>> 0, 0x38001c00);
});

// ================================================================ THE HANDLER
/** ctx as `src/main.js #ctx()` builds it, minus everything type $1C ignores. */
const ctx = (vram) => ({ vram, unported: new UnportedLog() });

test('W57: $26C20C is in the dispatch, so the driver does not throw', {
  skip: SKIP,
}, () => {
  assert.ok(HANDLER_ADDRESSES.includes(T1C.handler));
});

test('W57: $26C20C paints 207 map longwords -- 23 columns x 9 rows', {
  skip: SKIP,
}, () => {
  const ram = fixture(0);
  ram.setU16(CLOCK, 0x00f0);              // not the free clock
  ram.setU16(0x803926, 0);                // the $9000BC arm
  const vram = new BgVram();
  const before = Uint16Array.from(vram.w);
  runHandler(T1C.handler, ram, ROM, A5, ctx(vram));
  const rows = new Map();
  let n = 0;
  for (let i = 0; i < 1024; i++) {
    if (before[i * 2] !== vram.w[i * 2] || before[i * 2 + 1] !== vram.w[i * 2 + 1]) {
      n++;
      const col = i & 63;
      rows.set(col, (rows.get(col) ?? 0) + 1);
    }
  }
  assert.equal(n, 207, '23 x 9 == 207 == 828 bytes == 23 columns x 36 B');
  assert.equal(rows.size, 23);
  for (const [, c] of rows) assert.equal(c, 9, '$26C240 moveq #$8 -> NINE rows');
  // THE WRAP. `$26C25A andi.w #$FF` masks the LOW WORD, so A0 walks
  // $9000BC..$9000FC (columns 47..63) and then WRAPS to $900000 (columns 0..5).
  assert.deepEqual([...rows.keys()].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
      61, 62, 63]);
  // ...and the CONTENT is the cartridge's, at both ends of the walk.
  assert.equal(vram.long(0, 47), (ROM.u32(T1C.src) + T1C.tileBase) >>> 0);
  assert.equal(vram.long(8, 5), (ROM.u32(T1C.src + 206 * 4) + T1C.tileBase) >>> 0);
  // The interior, so a mutation that gets only the ends right is caught: the
  // 100th longword is column index 11 (47+11 = 58), row 1.
  assert.equal(vram.long(1, 58), (ROM.u32(T1C.src + 100 * 4) + T1C.tileBase) >>> 0);
});

test('W57: $803926 non-zero moves the block to column 41 ($9000A4)', {
  skip: SKIP,
}, () => {
  // Transcribed and unexercised in play -- [M] $803926's five build-B writers
  // are $23BE6E (:=0), $25A7DE (clr), $25C598 (:=1), $25C7FE (:=0), $25C8BC
  // (:=0) and it is 0 through stage 1. The ARM is still real code and this is
  // the only thing that runs it.
  const ram = fixture(0);
  ram.setU16(CLOCK, 0x00f0);
  ram.setU16(0x803926, 1);
  const vram = new BgVram();
  runHandler(T1C.handler, ram, ROM, A5, ctx(vram));
  // $A4 / 4 == 41, so the block is 41..63 with NO wrap (41 + 23 == 64).
  assert.equal(vram.long(0, 41), (ROM.u32(T1C.src) + T1C.tileBase) >>> 0);
  assert.equal(vram.long(8, 63), (ROM.u32(T1C.src + 206 * 4) + T1C.tileBase) >>> 0);
  assert.equal(vram.long(0, 40), 0, 'column 40 is below the block');
  assert.equal(vram.long(0, 0), 0, 'and NOTHING wraps: 41 + 23 == 64 exactly');
});

test('W57: $26C20C frees the enemy at clock $0105 EXACTLY, and only then', {
  skip: SKIP,
}, () => {
  const vram = new BgVram();
  // Not the free clock: the object survives and paints.
  for (const clk of [0x0104, 0x0106, 0x00f0]) {
    const ram = fixture(0);
    ram.setU16(CLOCK, clk);
    runHandler(T1C.handler, ram, ROM, A5, ctx(vram));
    assert.equal(ram.u16(A5), 0x8000, `clock $${clk.toString(16)} must NOT free`);
  }
  // $0105: `jmp $263762` -- the type word is cleared and the sub-record is
  // marked dead, and NOTHING is painted on that frame.
  const ram = fixture(0);
  ram.setU16(CLOCK, T1C.freeClock);
  const v2 = new BgVram();
  const before = Uint16Array.from(v2.w);
  runHandler(T1C.handler, ram, ROM, A5, ctx(v2));
  assert.equal(ram.u16(A5), 0, '$263762 clr.w (A5)');
  assert.equal(ram.u8(A6), 1, '$263762 move.b #1,(A6) -- the sub-record is dead');
  assert.deepEqual([...v2.w], [...before], 'the free arm does not fall into the blit');
});

test('W57: a ctx with no BgVram is a LOUD NAMED THROW, not 207 lost longwords', {
  skip: SKIP,
}, () => {
  const ram = fixture(0);
  ram.setU16(CLOCK, 0x00f0);
  assert.throws(() => runHandler(T1C.handler, ram, ROM, A5, { unported: new UnportedLog() }),
    (e) => {
      assert.ok(e instanceof Unreached);
      assert.equal(e.romAddress, 0x26c226);
      return true;
    });
});
