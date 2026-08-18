// ===============================================================================================
// W398 -- STAGE 5'S MAP COLUMN STREAM, AND THE FIRST RUN THAT EVER SPAWNED ONE OF ITS ELEMENTS.
// ===============================================================================================
//
// UNIT. `$22D770`. Four of the five background column streams have been exported since W13/W133/
// W192/W211; this one never was, so `backgroundInit`'s 15-column pre-fill threw BY ADDRESS on the
// first frame and the internal stage-4 background VM had never run at all. W397 said so in
// `assertStage5VmCannotStart` and left it as the next wave's unit. This is that wave.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "Find how those four got their bounds and whether the same statement bounds `$22D770`."
//      The four were NOT bounded by one statement, and the sentence written next to two of them
//      is a CONSEQUENCE rather than a bound. W192 and W211 each say "ending exactly at Stage N+1's
//      column stream" -- true, and useless here, because `$261266` holds exactly FIVE longwords
//      and this is the fifth. Repeating that rule would be proving an extent by asserting an
//      absence (TRAP 8). What actually ends every one of the five, including the first four, is
//      the SIBLING pointer table `$261252`, read at the same `$813096` index by the same shape of
//      code, plus a palette block whose length is COUNTED twice over. SECTION 1 decodes both
//      `lea`s and shows the rule reproducing all four earlier declarations before applying it to
//      the fifth.
//   2. "**A column count is what you need.** Look for the `dbra`, the `cmpi`, or the next stream's
//      base." **THERE IS NO `dbra` AND NO `cmpi` ANYWHERE THAT COUNTS COLUMNS.** `$2611E0..
//      $2611F2` turns the clock into `(clock >> 2) * 36` and adds it to the base with NO bound
//      check of any kind, and `$26134E..$261368` walks the cursor forward nine longs a column
//      forever. The count is a division, not a loop bound: `$22FAE0 - $22D770 = $2370` over the
//      36-byte stride the shifts at `$2611EA..$2611EE` build = 252. Asserted as that division,
//      with the stride read out of the instructions.
//   3. "The four existing windows... say what [the shared rule] is." The shared rule is the span
//      `[$261266[i], $261252[i] + $800)`, and the four existing declarations do NOT have a shared
//      SHAPE: stages 1 and 2 split that span into two windows each (W13 + W92, W133 + W124) and
//      stages 3 and 4 declare it as one (W192, W211). SECTION 1 checks the UNION per stage, which
//      is the only form of the statement that is true of all four.
//   4. "drive the internal stage-4 background VM far enough to witness at least one of its four
//      elements actually spawning via op `$10`." **ALL FOUR SPAWN**, at frames 1,185 / 1,665 /
//      2,305 / 6,769 of a cold `backgroundInit` at entry clock 0. SECTION 2.
//   5. What the brief does not mention, and what a short run would have got wrong (TRAP 16 and
//      TRAP 23): **the scroll PARKS at clock $0346, on the script's own `SPEED $0000` record**,
//      and the clock is driven by the scroll, so it never advances again. A free-running port
//      stops at column 224 of 252 no matter how many frames it is given -- 120,000 frames get no
//      further than 40,000 do. The last 28 columns are only reachable through `$261100`, the
//      external speed push whose callers are ENEMY state machines. SECTION 3 pushes it exactly
//      the way `$26B73A` does and the cursor then lands on `$22FAE0` -- the stream's last byte,
//      the address `$261252[4]` names -- and the op-$04 REPEAT rewinds it there. **The window was
//      NOT sized from that run; the run confirms the size the code states.**
//
// SECTION 1  THE BOUND: both `lea`s decoded, the stride, the counted $800, and the declaration
// SECTION 2  **THE DELIVERABLE**: four op-$10 spawns out of a cold init, by frame
// SECTION 3  THE FAR END: the cursor reaches $22FAE0 exactly and never one byte further
// SECTION 4  ABLATED FROM THE EXPORTED TABLES -- three shapes, three throws, each named
// SECTION 5  the overlap count, the abutments, and the gap above
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { PaletteState } from '../src/palette.js';
import { resetSpriteQueueCounters } from '../src/displaylist.js';
import {
  BGELEM_HANDLERS, BGRAM, BGTAB, BgVram, ESLOT,
  backgroundFrame, backgroundInit, pushExternalSpeed,
} from '../src/background.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');

const NEED = [IMAGE, TABLES];
const MISSING = NEED.filter((p) => !existsSync(p));
const SKIP = MISSING.length === 0 ? false
  : `${MISSING.map((p) => path.basename(p)).join(', ')} absent -- run `
    + 'tools/export-tables.py. THIS IS A SKIP, NOT A PASS.';

const IMG = MISSING.length === 0 ? readFileSync(IMAGE) : null;
const tables = MISSING.length === 0 ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);
const disp16 = (a) => (w(a) >= 0x8000 ? w(a) - 0x10000 : w(a));

/** `$80E240`, object slot 0 -- `$2410C4 lea $80E240,A5`, the same A5 every other
 *  background test uses. */
const A5 = 0x80e240;
const BGO_ENTRYCLOCK = 0x06;
const BGO_COLPTR = 0x0a;
const BGO_SPEEDBG = 0x1c;
const STAGE5_X4 = 16;                 // internal stage index 4, human Stage 5

const COL_STREAM_LEA = 0x2611d6;      // 43FA d16   lea (d16,PC),A1
const PAL_BLOCK_LEA = 0x2611b2;       // 41FA d16   lea (d16,PC),A0
const STAGE5_COLS = 0x22d770;         // ...what $261266[4] reads
const STAGE5_PAL = 0x22fae0;          // ...and what $261252[4] reads
const WINDOW_LEN = 0x2b70;

const WINDOWS = () => tables.rom.windows.map(
  (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]);

const S5 = BGELEM_HANDLERS.filter((h) => h.stage === 4);

// ===============================================================================================
// SECTION 1 -- THE BOUND. Every number in the declaration comes out of an instruction here.
// ===============================================================================================

/** The two sibling pointer tables, each decoded from ITS OWN `lea` rather than compared against a
 *  constant. TRAP 4 on both: the target is the EXTENSION WORD's address plus the displacement. */
function decodeTables() {
  assert.equal(w(COL_STREAM_LEA), 0x43fa,
    '$2611D6 is `43FA` `lea (d16,PC),A1` -- the column-stream pointer table');
  assert.equal(w(PAL_BLOCK_LEA), 0x41fa,
    '$2611B2 is `41FA` `lea (d16,PC),A0` -- the palette-block pointer table');
  const cols = COL_STREAM_LEA + 2 + disp16(COL_STREAM_LEA + 2);
  const pal = PAL_BLOCK_LEA + 2 + disp16(PAL_BLOCK_LEA + 2);
  assert.equal(cols, BGTAB.colStream,
    'TRAP 4: $2611D8 + $8E = $261266, NOT $2611D6 + $8E');
  assert.equal(pal, BGTAB.palette, 'TRAP 4 again: $2611B4 + $9E = $261252');
  // ...and both are indexed by the SAME word, which is the whole reason one can bound the other.
  assert.equal(w(0x2611d0), 0x3039, '$2611D0 `move.w (xxx).l,D0`');
  assert.equal(l(0x2611d2), 0x813096, '  ...of $813096, the stage index x 4');
  assert.equal(w(0x2611b8), 0xd0f9, '$2611B8 `adda.w (xxx).l,A0`');
  assert.equal(l(0x2611ba), 0x813096, '  ...of the SAME $813096');
  assert.equal(w(0x2611de), 0x2251, '$2611DE `movea.l (A1),A1` -- pointers, not data');
  assert.equal(w(0x2611be), 0x2050, '$2611BE `movea.l (A0),A0` -- likewise');
  return { cols, pal };
}

/** The 36-byte column stride, built by shifts, and the 9 longs a column is made of. */
function decodeStride() {
  assert.equal(w(0x2611e6), 0xe448, '$2611E6 `lsr.w #$2,D0` -- clock >> 2 is the COLUMN');
  assert.equal(w(0x2611e8), 0x3200, '$2611E8 `move.w D0,D1`');
  assert.equal(w(0x2611ea), 0xd241, '$2611EA `add.w D1,D1`');
  assert.equal(w(0x2611ec), 0xd241, '$2611EC `add.w D1,D1`   -> D1 = col * 4');
  assert.equal(w(0x2611ee), 0xeb48, '$2611EE `lsl.w #$5,D0`  -> D0 = col * 32');
  assert.equal(w(0x2611f0), 0xd041, '$2611F0 `add.w D1,D0`   -> col * 36');
  // ...and the same 36 from the other end: the per-column writer moves NINE longs.
  assert.equal(w(0x261358), 0x7c08,
    '$261358 `moveq #$8,D6` -- TRAP 2, the `dbra` at $261364 runs it NINE times');
  assert.equal(w(0x261364), 0x51ce, '  ...and $261364 really is that `dbra D6`');
  return (4 + 32);
}

/** The palette block's length, counted at both ends. TRAP 2 twice over. */
function decodePaletteLen() {
  assert.equal(w(0x2611c2), 0x721f, '$2611C2 `moveq #$1F,D1` -- banks MINUS ONE');
  assert.equal(w(0x2415f6), 0x700f, '$2415F6 `moveq #$F,D0` -- longs per bank MINUS ONE');
  assert.equal(w(0x2415f8), 0x22d8, '$2415F8 `move.l (A0)+,(A1)+`');
  assert.equal(w(0x2415fa), 0x51c8, '$2415FA `dbra D0` -- the inner loop, 16 longs');
  assert.equal(w(0x2415fc), 0xfffc, '  ...back to $2415F8');
  assert.equal(w(0x2415fe), 0x51c9, '$2415FE `dbra D1` -- the outer loop, 32 banks');
  const banks = w(0x2611c2) & 0xff;
  const longs = w(0x2415f6) & 0xff;
  return (banks + 1) * (longs + 1) * 4;
}

test('W398 SECTION 1: the window $22D770 + $2B70, and every number in it stated by an instruction',
  { skip: SKIP }, () => {
    const { cols, pal } = decodeTables();
    const stride = decodeStride();
    const palLen = decodePaletteLen();
    assert.equal(stride, 36, '4 + 32 -- the two shifts, added');
    assert.equal(palLen, 0x800, '32 banks x 16 longs x 4 = $800');

    // THE FIFTH ENTRY, read THROUGH the decoded table bases rather than typed.
    const base = l(cols + 4 * 4);
    const end = l(pal + 4 * 4);
    assert.equal(base, STAGE5_COLS, '$261266[4] is $22D770');
    assert.equal(end, STAGE5_PAL, '$261252[4] is $22FAE0 -- and THAT is the bound');
    assert.equal((end - base) % stride, 0,
      '$22FAE0 - $22D770 is a whole number of 36-byte columns');
    assert.equal((end - base) / stride, 252, '...252 of them');
    assert.equal(end - base, 0x2370, '  = $2370');

    // **AND NOTHING ABOVE PROVED AN EXTENT BY ASSERTING AN ABSENCE** (TRAP 8). There is no fifth
    // longword in either table to compare against -- $261266 + $14 is $26127A, object type 1's
    // dispatch entry -- and this arm never reads one.
    assert.equal(cols + 5 * 4, 0x26127a,
      '$261266 + $14 is $26127A, the type-1 dispatch entry, NOT a sixth pointer');
    assert.equal(w(0x26127a), 0x082d, '  ...and it really is code: `btst #$3,($3,A5)`');

    // THE DECLARATION. Red without this wave: there is no such window before it.
    const mine = WINDOWS().filter(([a]) => a === STAGE5_COLS);
    assert.deepEqual(mine, [[STAGE5_COLS, end + palLen - base]],
      'tools/export-tables.py declares $22D770 + $2B70 exactly once');
    assert.equal(base + WINDOW_LEN, 0x2302e0, 'and it ends at $2302E0');

    // THE SHARED RULE, applied to the four that were already declared. Their SHAPES differ --
    // stages 1 and 2 are two windows each, stages 3 and 4 are one -- so the statement that is
    // true of all four is about the UNION, and this is it.
    const ws = WINDOWS();
    const counts = [];
    for (let i = 0; i < 4; i++) {
      const c = l(cols + i * 4);
      const p = l(pal + i * 4);
      assert.equal((p - c) % stride, 0, `stage ${i}: a whole number of columns`);
      counts.push((p - c) / stride);
      const span = ws.filter(([a]) => a >= c && a < p + palLen).sort((x, y) => x[0] - y[0]);
      assert.equal(span[0][0], c, `stage ${i}: a window starts AT $261266[${i}]`);
      let reach = c;
      for (const [a, len] of span) {
        assert.ok(a <= reach, `stage ${i}: no hole at $${reach.toString(16).toUpperCase()}`);
        reach = Math.max(reach, a + len);
      }
      assert.equal(reach, p + palLen,
        `stage ${i}: the declared union ends at $261252[${i}] + $800`);
    }
    assert.deepEqual(counts, [248, 168, 28, 210],
      'the four earlier streams, re-derived by the same division: 248/168/28/210 columns');
  });

// ===============================================================================================
// SECTION 2 -- THE DELIVERABLE. A cold `backgroundInit` at internal stage 4, and the four op-$10
// records the stage script carries. **NO RUN HAD EVER GOT PAST THE FIRST INSTRUCTION OF THIS.**
// ===============================================================================================

/** The scroll subsystem on its own, with the two inputs the board supplies and this file does
 *  not model:
 *    - `resetSpriteQueueCounters` ($23D70C, call #4's tail) drains the sprite buckets once a
 *      frame. WITHOUT IT the elements' 12-byte records pile up in bucket 1 forever, run off its
 *      3,012-byte buffer and eventually overwrite A5 itself -- which is exactly the "a bucket
 *      that overran its own buffer would quietly write into the next one" that
 *      `src/spritequeue.js` documents, reproduced here by accident at frame 2,487 before the
 *      drain was added. It is NOT a port bug and NOT a mutation; it is the drain.
 *    - no player records, so the cross axis stays 0 and `scrollPrev` stays 0.
 */
function bench({ entryClock = 0, romSpec = null, palette = false } = {}) {
  const ROM = new RomWindows(romSpec ?? tables.rom);
  const ram = new Ram();
  const vram = new BgVram();
  const ctx = { unportedLog: new UnportedLog(), soundPost() {} };
  if (palette) ctx.palette = new PaletteState();
  ram.setU16(BGRAM.stageX4, STAGE5_X4);                  // $813096
  ram.setU16(A5 + BGO_ENTRYCLOCK, entryClock);           // ($6,A5) -> $26114C
  return { ROM, ram, vram, ctx };
}

test('W398 SECTION 2: a cold init at internal stage 4, and ALL FOUR elements spawn via op $10',
  { skip: SKIP }, () => {
    const b = bench();
    const spawns = [];
    let frame = 0;
    // `$262372` fills the FIRST FREE slot, and by frame 6,769 the first three have already died
    // ($2631F2's `bge` at the despawn edge), so the fourth element does NOT land in slot 3. Find
    // the slot that went live THIS frame instead of assuming the index.
    let preActive = [];
    const activeMask = () => Array.from({ length: 8 },
      (_, s) => b.ram.u8(BGRAM.elemSlots + s * 0x20 + ESLOT.active));
    b.ctx.scrollEvent = (e) => {
      if (e.kind !== 'bgelem') return;
      // Read the SLOT back, right after `elemSpawn` filled it: `$262178 jsr $262366` runs before
      // the hook. This is the constructor's own output, not the registry row echoed back.
      const now = activeMask();
      const s = now.findIndex((v, i) => v !== 0 && preActive[i] === 0);
      assert.notEqual(s, -1, 'exactly one slot went live on the spawn frame');
      const slot = BGRAM.elemSlots + s * 0x20;
      spawns.push({
        frame,
        slot: s,
        id: e.id,
        t: e.recTime,
        handler: e.handler,
        arg: e.arg,
        active: b.ram.u8(slot + ESLOT.active),
        data: b.ram.u32(slot + ESLOT.data),
        yPos: b.ram.u16(slot + ESLOT.yPos),
        upd: b.ram.u32(slot + ESLOT.update),
        kind: b.ram.u16(slot + ESLOT.kind),
      });
    };
    // $26114C..$261236 -- the whole init, including the 15-column pre-fill that reads $22D770.
    backgroundInit(b.ram, b.ROM, b.vram, b.ctx, A5);
    assert.equal(b.vram.columnsWritten, 15,
      'the pre-fill wrote FIFTEEN columns (TRAP 2: `moveq #$e,D7` + `dbra`)');
    assert.equal(b.ram.u32(A5 + BGO_COLPTR), STAGE5_COLS + 15 * 36,
      '  ...and left the cursor at $22D770 + 15*36');
    assert.equal(b.ram.u32(BGRAM.elemTable), 0x2622f2,
      '$262332 installed $2622F2, internal stage 4\'s own handler table');

    for (frame = 1; frame <= 7000; frame++) {
      resetSpriteQueueCounters(b.ram);
      preActive = activeMask();
      backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5);
    }

    // **THE THING NO RUN HAD EVER DONE.** Four records, four ids, four frames.
    assert.equal(spawns.length, 4, 'FOUR op-$10 spawns in 7,000 frames');
    assert.deepEqual(spawns.map((s) => [s.id, s.t, s.frame]), [
      [0, 0x004a, 1185],
      [1, 0x0068, 1665],
      [2, 0x0090, 2305],
      [3, 0x0177, 6769],
    ], 'ids 0..3 at clocks $4A/$68/$90/$177, which is frames 1,185/1,665/2,305/6,769 at the '
      + 'speeds the script sets');
    // Each one really ran the constructor W397 transcribed, and the SLOT proves it.
    for (const [i, s] of spawns.entries()) {
      const h = S5[i];
      assert.equal(s.handler, h.ctor, `spawn ${i}: $2622F2[${i}] is $${h.ctor.toString(16)
        .toUpperCase()}`);
      assert.equal(s.active, 0x80, `  ...$262378 marked the slot live`);
      assert.equal(s.data, h.data, `  ...$2623A4 wrote data $${h.data.toString(16).toUpperCase()}`);
      assert.equal(s.yPos, h.yPos, `  ...$2623AC wrote yPos $${h.yPos.toString(16).toUpperCase()}`);
      assert.equal(s.upd, h.upd, `  ...$2623B2 wrote the updater`);
      assert.equal(s.kind, h.kind, `  ...and the BYTE kind $${h.kind.toString(16).toUpperCase()}`);
      // The op-$10 arg arithmetic: `subi.w #$800` then `sub.w $813170`, LOW WORD ONLY.
      assert.equal(s.arg >>> 16, 0x7000, `  ...arg high word untouched at $7000`);
      assert.equal(s.arg & 0xffff, 0xf800,
        `  ...low word $0000 - $800 - scrollPrev($0000) = $F800`);
    }
    assert.equal(new Set(spawns.map((s) => s.data)).size, 4, 'four DISTINCT descriptors');
    assert.deepEqual(spawns.map((s) => s.slot), [0, 1, 2, 0],
      'and the fourth reuses slot 0, because the first three are long dead by clock $0177');
  });

// ===============================================================================================
// SECTION 3 -- THE FAR END. TRAP 23, and the reason the window is not sized from a run.
// ===============================================================================================

test('W398 SECTION 3: free-running, the scroll PARKS at clock $0346 and stops at column 224',
  { skip: SKIP }, () => {
    // The script's own record: `$261E88 t=$0346 op $08 SPEED $0000`. The clock is driven BY the
    // scroll ($26131A `cmpi.w #$200` on an accumulator fed by ($1c,A5)), so a speed of zero
    // freezes the clock as well and no later record can ever match. **A run that stopped here
    // and reported "the stream is 224 columns" would be TRAP 23 exactly.**
    const b = bench();
    backgroundInit(b.ram, b.ROM, b.vram, b.ctx, A5);
    for (let f = 1; f <= 20000; f++) {
      resetSpriteQueueCounters(b.ram);
      backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5);
    }
    assert.equal(b.ram.u16(BGRAM.clock), 0x0346, 'the clock is parked at $0346');
    assert.equal(b.ram.u16(A5 + BGO_SPEEDBG), 0, '  ...because ($1c,A5) is $0000');
    assert.equal(b.vram.columnsWritten, 224, '  ...and 224 of the 252 columns have been read');
    assert.equal(b.ram.u32(A5 + BGO_COLPTR), STAGE5_COLS + 224 * 36, '  ...cursor at $22F6F0');
    assert.equal(w(0x261e88), 0x0346, '$261E88 is the record: time word $0346');
    assert.equal(w(0x261e8c), 0x0008, '  ...op $08 SPEED');
    assert.equal(w(0x261e8e), 0x0000, '  ...value $0000. It is the SCRIPT that stops, not the port');
  });

test('W398 SECTION 3: released by $261100, the cursor lands on $22FAE0 and never passes it',
  { skip: SKIP }, () => {
    // `$261100` is the ported external speed push. Its callers are ENEMY state machines (W17
    // censused nine, `$26B73A` among them); this test IS that caller, and says so. Nothing here
    // is a mutation: `backgroundFrame` consumes $813180 at `$2612AA` exactly as shipped.
    //
    // Entry clock $0344 is the ROM's own mid-stage entry ($26114C reads ($6,A5) and $26200E
    // fast-forwards the script to it), the same door the attract demo uses with $0038. Op $10 is
    // SKIPPED during that replay ($262164 `tst.w $813190`), which is why this test is about the
    // stream and SECTION 2 is about the elements.
    const b = bench({ entryClock: 0x0344 });
    backgroundInit(b.ram, b.ROM, b.vram, b.ctx, A5);
    assert.equal(b.ram.u16(BGRAM.clock), 0x0344, 'the init took the entry clock');
    assert.equal(b.ram.u32(A5 + BGO_COLPTR), STAGE5_COLS + 224 * 36,
      'the pre-fill started at column $0344 >> 2 = 209 and left the cursor at 224');

    let maxPtr = 0;
    let released = 0;
    let rewound = 0;
    let rewoundFrom = 0;
    let rewoundTo = 0;
    for (let f = 1; f <= 3000; f++) {
      resetSpriteQueueCounters(b.ram);
      if (b.ram.u16(BGRAM.clock) === 0x0346 && b.ram.u16(A5 + BGO_SPEEDBG) === 0) {
        pushExternalSpeed(b.ram, 0x20, 0x20);            // $261100, the enemy's release
        released ||= f;
      }
      const before = b.ram.u32(A5 + BGO_COLPTR);
      backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5);
      const after = b.ram.u32(A5 + BGO_COLPTR);
      if (after > maxPtr) maxPtr = after;
      if (after < before && !rewound) {
        rewound = f; rewoundFrom = before; rewoundTo = after;
      }
    }
    assert.equal(released, 59, 'the push happens on frame 59, the frame the script parks');
    // **THE MEASUREMENT.** The cursor's high-water mark is EXACTLY $261252[4]: the last column
    // read starts at $22FABC (column 251) and ends one byte before the palette block.
    assert.equal(maxPtr, STAGE5_PAL,
      'the cursor reaches $22FAE0 -- the address $261252[4] states -- and stops there');
    assert.equal((maxPtr - STAGE5_COLS) / 36, 252, '  = 252 columns, the declared count');
    assert.equal(rewound, 377, 'and frame 377 is where op $04 rewinds it');
    assert.equal(rewoundFrom, STAGE5_PAL, '  ...rewinding FROM $22FAE0, the stream\'s far end');
    assert.equal(rewoundTo, STAGE5_COLS + 224 * 36,
      '  ...back to column 224: `$261EC8 t=$03B4 op $04 rewind -28` = $22FAE0 - 28*36 = $22F6F0');
    assert.ok(b.ram.u32(A5 + BGO_COLPTR) < STAGE5_PAL,
      'and it stays inside the stream for the rest of the run');
    assert.equal(w(0x261ec8), 0x03b4, '$261EC8 is the REPEAT record at time $03B4');
    assert.equal(w(0x261ecc), 0x0004, '  ...op $04');
    assert.equal(w(0x261ece), 0xffe4, '  ...rewind -28 columns');
    assert.equal(w(0x261ed2), 0xffff, '  ...loops $FFFF, which is why it never leaves');
  });

// ===============================================================================================
// SECTION 4 -- ABLATED FROM THE EXPORTED TABLES. Three shapes of wrong window, three throws.
// ===============================================================================================

/** The window removed (`len === null`) or TRUNCATED, in the exported table set itself -- stronger
 *  than a unit ablation, and what the last four waves used. */
const reshaped = (len) => ({
  ...tables.rom,
  windows: tables.rom.windows.flatMap((x) => {
    if (parseInt(String(x.base).replace('$', ''), 16) !== STAGE5_COLS) return [x];
    return len === null ? [] : [{ ...x, len, hex: x.hex.slice(0, len * 2) }];
  }),
});

const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

test('W398 SECTION 4: window removed -- the pre-fill throws at $22D770 on the init itself',
  { skip: SKIP }, () => {
    const b = bench({ romSpec: reshaped(null) });
    const e = caught(() => backgroundInit(b.ram, b.ROM, b.vram, b.ctx, A5));
    assert.ok(e, 'the init must refuse, not complete');
    assert.equal(e.romAddress, STAGE5_COLS, 'and it names $22D770, the first pre-fill read');
    assert.match(e.message, /outside every\s+ROM window/, 'a window throw, named');
    // POSITIVE CONTROL, and the whole of W397's `assertStage5VmCannotStart`, now inverted.
    const ok = bench();
    assert.doesNotThrow(() => backgroundInit(ok.ram, ok.ROM, ok.vram, ok.ctx, A5));
  });

test('W398 SECTION 4: truncated to the pre-fill -- A SHORT WINDOW IS NOT CAUGHT BY A SHORT RUN',
  { skip: SKIP }, () => {
    // 15 columns is every byte `backgroundInit` touches. A window that stopped there would have
    // passed an init-only test and thrown on the board 64 frames later. TRAP 23, made into a run.
    const b = bench({ romSpec: reshaped(15 * 36) });
    assert.doesNotThrow(() => backgroundInit(b.ram, b.ROM, b.vram, b.ctx, A5),
      'the init itself is happy with 15 columns -- that is the trap');
    const e = caught(() => {
      for (let f = 1; f <= 200; f++) {
        resetSpriteQueueCounters(b.ram);
        backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5);
      }
    });
    assert.ok(e, 'the first per-frame column does not fit');
    assert.equal(e.romAddress, STAGE5_COLS + 15 * 36,
      '$26135A throws at $22D98C, column 15');
  });

test('W398 SECTION 4: truncated to the columns -- the palette half of the window throws at $22FAE0',
  { skip: SKIP }, () => {
    // The span is ONE dependency: `$2611C4 jsr $2415E8` reads 32 banks out of $261252[4] on the
    // same init that pre-fills the map. With a PaletteState on the ctx that read is live, and a
    // columns-only window is short by exactly $800.
    const b = bench({ romSpec: reshaped(0x2370), palette: true });
    const e = caught(() => backgroundInit(b.ram, b.ROM, b.vram, b.ctx, A5));
    assert.ok(e, 'the palette upload needs the other half');
    assert.equal(e.romAddress, STAGE5_PAL, 'and it throws at $22FAE0');
    assert.match(e.message, /2048 bytes/, '  ...asking for all $800 of it');
    // POSITIVE CONTROL: the full window, with the same live palette, installs the whole third.
    const ok = bench({ palette: true });
    backgroundInit(ok.ram, ok.ROM, ok.vram, ok.ctx, A5);
    assert.equal(ok.ctx.palette.installCount, 1, 'ONE $2415E8 upload on the init');
    assert.deepEqual([...ok.ctx.palette.installs.keys()],
      ['$2611C4 BG banks 0..31 <- $22FAE0 ($261252[$10])'],
      '  ...banks 0..31 out of $22FAE0, the block this window\'s second half holds');
    assert.equal(ok.ctx.palette.stageSourced.bg.reduce((a, v) => a + v, 0), 1024,
      '  ...and all 1,024 background staging words are cartridge-sourced');
  });

// ===============================================================================================
// SECTION 5 -- THE SET. Overlap counted with and without, and both abutments.
// ===============================================================================================

test('W398 SECTION 5: the window set, the overlap count still 71, and the span abuts W211 exactly',
  { skip: SKIP }, () => {
    const ws = WINDOWS();
    // W399 and then W400 moved this ONE number and nothing else in this file: W399 declared
    // HIBACHI's A4 script table and the four data blocks its ending scripts read, and W400
    // declared type $44's eight, so the set is 583. Everything below -- the overlap count, both
    // abutments, the five column streams -- is untouched, and neither wave's windows are anywhere
    // near this wave's span ($2A5xxx/$2A6xxx for W399, $26Dxxx/$26Exxx for W400).
    assert.equal(ws.length, 600, '569 windows at W394, 570 after W398, 575 after W399, 583 '
      + 'after W400, 585 after W402, 590 after W404, 593 after W405, 594 after W406, 595 '
      + 'after W407, 596 after W408, 599 since W409'
      + ' W411 declares $280F34, the collected-impact transform table, so 600.');
    assert.equal(ws.filter(([a]) => a === STAGE5_COLS).length, 1, '$22D770 is declared once');

    const pairs = (list) => {
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          const [a, la] = list[i]; const [b2, lb] = list[k];
          if (a < b2 + lb && b2 < a + la) n++;
        }
      }
      return n;
    };
    assert.equal(pairs(ws), 71, '71 overlapping pairs WITH this window');
    assert.equal(pairs(ws.filter(([a]) => a !== STAGE5_COLS)), 71,
      '...and 71 without it: it overlaps nothing, the same number the last five waves counted');

    // Both ends. W211's stage-4 span ends exactly where this one begins -- abutting is not
    // overlapping -- and above it there is a genuine GAP up to the stage-1 spawn script.
    const w211 = ws.find(([a]) => a === 0x22b1e8);
    assert.deepEqual(w211, [0x22b1e8, 0x2588], 'W211 declared $22B1E8 + $2588');
    assert.equal(w211[0] + w211[1], STAGE5_COLS, '  ...which ends AT $22D770');
    const above = Math.min(...ws.filter(([a]) => a >= STAGE5_COLS + WINDOW_LEN).map(([a]) => a));
    assert.equal(above, 0x23046c,
      'the next declared window above $2302E0 is W391\'s arm-1 fade target $23046C, $18C bytes '
      + 'clear of it -- the span ends in a GAP, not against a neighbour');

    // The five column streams, as the set now holds them.
    for (const [i, a] of [0x225b78, 0x228658, 0x22a5f8, 0x22b1e8, 0x22d770].entries()) {
      assert.equal(ws.filter(([b2]) => b2 === a).length, 1,
        `stage ${i}'s column stream $${a.toString(16).toUpperCase()} has a window of its own`);
    }
  });
