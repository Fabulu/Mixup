// ===============================================================================================
// W400 -- TYPE $44, THE LAST TWO $261100 PUSHES, AND THE RUN THAT SHOWS WHAT THEY DO.
// ===============================================================================================
//
// UNIT. `$26E02A`, the handler at `$267824 + $44*8 + 4`, and the `$BBE`-byte family around it.
// W399 named `$26E04C` and `$26E152` as the two remaining unclaimed callers of `$261100` and did
// not port them. This wave does.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "`$26E04C` and `$26E152` push `$0020` (NOT `$0010`)" -- true but not distinguishing, and it
//      is the reason the brief expected this to be the closest analogue of `$26B73A`. SEVEN of the
//      nine callers push `$0020`: `$26B73A`, `$26D802`, `$26D864`, `$26E04C`, `$26E152`, `$26F614`
//      and `$26F6C6`. Only HIBACHI's two A4 scripts push anything else. `handlers.js` T4C has said
//      `pushSpeed: 0x261100, // pushExternalSpeed, D0 = D1 = $20` since W372. SECTION 2.
//   2. "**ESTABLISH WHICH KIND OF STOP YOU HIT.** W398's was a CARTRIDGE stop, W399's a PORT stop."
//      **NEITHER, BECAUSE THERE IS NO STOP.** Stage 5's scroll script `$261DA8` holds no
//      `SPEED $0000` at all before `t=$0346`, which is HIBACHI's park 358 clocks later. What
//      surrounds type $44 is `t=$00B0 SPEED $0010` and `t=$00E0 SPEED $0020` -- a SLOWDOWN, and the
//      push cancels it EARLY. A frame counter would have shown a moving scroll on both sides and
//      told you nothing. SECTION 3 decodes every record; SECTION 4 runs both outcomes.
//   3. "the two it ported were not the closest analogue of `$26B73A`". The closest analogue is
//      `$26B73A` itself, and this is closer than the brief knew for a reason it does not mention:
//      both pushes ALSO clear `$8130DA`, which `background.js` has called BGRAM.elemGate since W18
//      and which type $44's own init body SETS. The push is half of the pair. SECTION 5.
//   4. "**Measured handler extent: `$BBE`**". Correct, and both of its bounds are stated by the
//      cartridge: `$267824 + $53*8` is `$26EBE8`, and the six 28-byte sub-record prototypes that
//      `($4,A5) = 5` asks for end at `$26E029`, the byte before the handler. SECTION 1.
//   5. What the brief does not mention: `$26E2B6`, a $62-byte threshold table in the middle of the
//      family that NOTHING in the 6 MB image reads (trap 20), and `$26EBDA`, whose fourteen bytes
//      are byte for byte type `$4C`'s `$2701C8` -- W341 declared that copy and this wave declares
//      this one. SECTION 6 and SECTION 7.
//
// SECTION 1  THE BOUNDS: the type table's two, the prototype arithmetic, the piece list
// SECTION 2  $261100's nine callers and the SEVEN that push $0020
// SECTION 3  stage 5's scroll script: no SPEED $0000 before $0346
// SECTION 4  **THE DELIVERABLE**: the same object, killed and not killed, and the scroll each way
// SECTION 5  the element gate, and the second thing both pushes do
// SECTION 6  what is COUNTED, with measured byte extents, and the sum
// SECTION 7  ABLATED FROM THE EXPORTED TABLES -- eight shapes, eight throws
// SECTION 8  the window set: 585 (583 when this wave landed), the overlap count, the neighbours
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { PaletteState } from '../src/palette.js';
import { resetSpriteQueueCounters } from '../src/displaylist.js';
import { BGRAM, BGO, BgVram, backgroundFrame, backgroundInit } from '../src/background.js';
import { enqueueDeferred, DEFQ_D1, processDeferred } from '../src/spawn.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler } from '../src/handlers.js';
import { T44, handler44 } from '../src/stage5type44.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
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

const WINDOWS = () => tables.rom.windows.map(
  (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]);

const A5BG = 0x80e240;                 // $80E240, object slot 0 -- the background's own A5
const STAGE5_X4 = 16;                  // internal stage index 4, human Stage 5
const ENEMY_TABLE = 0x81332c;          // enemies.js ENEMY.table
const ENEMY_SLOTS = 58;
const ENEMY_STRIDE = 0x50;
const SPAWN_POS = 0x30001c00;          // what type $43's $26DECC hands the child in ($16,A5)

// ===============================================================================================
// SECTION 1 -- THE BOUNDS. Every number below comes out of an instruction or the type table.
// ===============================================================================================

test('W400 SECTION 1: the type table states BOTH ends of the $BBE family', { skip: SKIP }, () => {
  assert.equal(l(0x267824 + 0x44 * 8), T44.init, '$267824 + $44*8 is $26DF40, the init stub');
  assert.equal(l(0x267824 + 0x44 * 8 + 4), T44.handler, '  ...and +4 is $26E02A, the handler');
  // THE UPPER BOUND IS NOT AN ABSENCE. $26EBE8 is another type's init, and the table names it.
  assert.equal(l(0x267824 + 0x53 * 8), T44.familyEnd,
    '$267824 + $53*8 is $26EBE8 -- type $53\'s init, and the byte AFTER type $44\'s last data');
  assert.equal(l(0x267824 + 0x53 * 8 + 4), 0x26ec52, '  ...whose own handler is $26EC52');
  assert.equal(T44.familyEnd - T44.handler, T44.familyBytes, 'so the handler extent IS $BBE');
  assert.equal(w(T44.familyEnd), 0x3b7c,
    '$26EBE8 opens `move.w #N,($4,A5)`, the 8-byte init stub every one of the 256 types has');

  // THE LOWER BOUND: ($4,A5) = 5 -> SIX long-form sub prototypes of 28 bytes, ending at the handler.
  assert.equal(w(T44.init), 0x3b7c, '$26DF40 is `move.w`');
  assert.equal(w(T44.init + 2), T44.subRecords - 1, '  ...#$5 into ($4,A5), so SIX sub records');
  assert.equal(w(0x26df60), 0x303c, '$26DF60 is `move.w #imm,D0`');
  assert.equal(w(0x26df62), T44.recordWords - 1, '  ...#$2, so THREE record-prototype words');
  let at = T44.subProto;
  for (let i = 0; i < T44.subRecords; i++) {
    assert.ok((w(at) & 0x8000) !== 0,
      `sub prototype [${i}] at $${at.toString(16)} has bit 15 set -- $2637A2's LONG form, 28 bytes`);
    at += 28;
  }
  assert.equal(at, T44.handler,
    '$26DF82 + 6*28 IS $26E02A: the prototypes end where the handler begins, ZERO overlap');
  assert.equal(T44.subProto - T44.recordProto, T44.recordWords * 2,
    'and the three record words sit immediately before them, so ONE window covers both');

  // The record prototype is the HP pool, and its value is asserted because $26E11A subtracts a
  // LONG from it and the test in SECTION 4 counts frames against exactly this number.
  assert.equal(l(T44.recordProto), 0x00000001, '($16,A5) = $0000 and ($18,A5).hi = $0001');
  assert.equal(w(T44.recordProto + 4), 0x5000, '  ...($1A,A5) = $5000, so the pool long is $15000');
});

test('W400 SECTION 1: the piece list is contiguous and sums to $BBE', { skip: SKIP }, () => {
  // Every row is (start, length, ported?). The claim is not "these add up" -- it is that each piece
  // BEGINS WHERE THE LAST ENDED, with no unaccounted byte anywhere in the family.
  const PIECES = [
    [0x26e02a, 0x1be, true, 'the handler spine'],
    [0x26e1e8, 0x08c, true, 'the three draws'],
    [0x26e274, 0x012, true, 'setAnimState $26E274'],
    [0x26e286, 0x01c, true, 'the anim dispatch'],
    [0x26e2a2, 0x014, true, 'the FIVE-entry anim table'],
    [0x26e2b6, 0x062, false, 'a threshold table NOTHING reads'],
    [0x26e318, 0x0c2, true, 'anim state 0'],
    [0x26e3da, 0x024, true, 'its NINE waypoints'],
    [0x26e3fe, 0x062, true, 'its threshold table'],
    [0x26e460, 0x0c6, false, 'anim state 1'],
    [0x26e526, 0x062, false, 'its threshold table'],
    [0x26e588, 0x1da, false, 'anim state 2'],
    [0x26e762, 0x062, false, 'its threshold table'],
    [0x26e7c4, 0x012, true, 'anim state 3'],
    [0x26e7d6, 0x042, true, 'anim state 4'],
    [0x26e818, 0x00c, true, 'disable fire'],
    [0x26e824, 0x00a, true, 'set fire mode'],
    [0x26e82e, 0x022, false, 'the fire dispatch'],
    [0x26e850, 0x008, false, 'its two entries'],
    [0x26e858, 0x14e, false, 'fire mode 0'],
    [0x26e9a6, 0x05a, false, 'fire mode 1, which spawns type $53'],
    [0x26ea00, 0x146, true, 'the death sequence'],
    [0x26eb46, 0x04a, true, 'its explosion list'],
    [0x26eb90, 0x04a, true, 'the $26C74E list'],
    [0x26ebda, 0x00e, true, 'the $246520 script'],
  ];
  let cursor = T44.handler;
  let ported = 0;
  let counted = 0;
  for (const [start, len, isPorted, what] of PIECES) {
    assert.equal(start, cursor,
      `${what} starts at $${start.toString(16).toUpperCase()} and the previous piece ended at `
      + `$${cursor.toString(16).toUpperCase()} -- the family has no unaccounted bytes`);
    cursor += len;
    if (isPorted) ported += len; else counted += len;
  }
  assert.equal(cursor, T44.familyEnd, 'the last piece ends at $26EBE8, type $53\'s init');
  assert.equal(ported, 0x626, 'PORTED is $626 bytes');
  assert.equal(counted, 0x598, 'COUNTED is $598 bytes');
  assert.equal(ported + counted, T44.familyBytes, '$626 + $598 = $BBE');

  // Four of the rows are jump-table entries, so they are checked against the table itself rather
  // than against a reading of the code.
  const states = [0x26e318, 0x26e460, 0x26e588, 0x26e7c4, 0x26e7d6];
  states.forEach((v, i) => assert.equal(l(T44.animTable + i * 4), v,
    `$26E2A2[${i}] is $${v.toString(16).toUpperCase()}`));
  assert.equal(l(T44.animTable + 5 * 4), 0x00400001,
    'entry [5] is $00400001, the first pair of $26E2B6 -- which is what makes it FIVE entries');
  assert.deepEqual([l(0x26e850), l(0x26e850 + 4)], [0x26e858, 0x26e9a6],
    '$26E850 holds the fire driver\'s two entries, and its far end IS its own [0]');
});

test('W400 SECTION 1: type $43 spawns it, and $43 has ONE stage-5 record', { skip: SKIP }, () => {
  assert.equal(w(0x26dec4), 0x7044, '$26DEC4 moveq #$44,D0 -- $43\'s ramp-$3C spawn');
  assert.equal(w(0x26deba), 0x0c6d, '$26DEBA cmpi.w');
  assert.equal(w(0x26debc), 0x003c, '  ...#$3C against ($1A,A5), the ramp');
  // Stage 5's spawn script, walked the way tests/w314stage5scope.test.js walks it.
  const hits = [];
  for (let cur = 0x237978; w(cur) !== 0xffff; cur += 8) {
    if (IMG[cur + 4] === 0x43) hits.push([cur, w(cur)]);
    assert.notEqual(IMG[cur + 4], 0x44, 'no stage-5 record spawns type $44 directly');
  }
  assert.deepEqual(hits, [[0x237ed0, 0x009e]],
    'exactly ONE type-$43 record, at $237ED0, trigger clock $009E');
  // And no OTHER stage has one either, so "stage 5" is a measurement and not an inference.
  for (const [stage, base] of [[1, 0x230c6c], [2, 0x2325d0], [3, 0x2342ba], [4, 0x2358b0]]) {
    for (let cur = base; w(cur) !== 0xffff; cur += 8) {
      assert.ok(IMG[cur + 4] !== 0x43 && IMG[cur + 4] !== 0x44,
        `stage ${stage} has no type $43 or $44 record`);
    }
  }
});

// ===============================================================================================
// SECTION 2 -- $261100'S NINE CALLERS. The brief's "$0020 not $0010" is not a discriminator.
// ===============================================================================================

test('W400 SECTION 2: SEVEN of the nine callers push $0020, not two', { skip: SKIP }, () => {
  const callers = [];
  for (let a = 0; a + 6 <= IMG.length; a += 2) {
    if ((w(a) === 0x4eb9 || w(a) === 0x4ef9) && l(a + 2) === 0x261100) callers.push(a);
  }
  assert.deepEqual(callers.map((a) => a.toString(16).toUpperCase()),
    ['26B73A', '26D802', '26D864', '26E04C', '26E152', '26F614', '26F6C6', '2A5D28', '2A61E0'],
    'still the nine W17 counted');
  const speeds = callers.map((a) => (w(a - 8) === 0x303c ? w(a - 6) : null));
  assert.deepEqual(speeds, [0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x0010, 0x0200],
    'SEVEN push $0020. "$0020 and not $0010" separates this type from HIBACHI and from nothing else');
  assert.equal(speeds[3], T44.scrollPush, '$26E04C pushes what the port pushes');
  assert.equal(speeds[4], T44.scrollPush, '$26E152 likewise');
  // Each of the seven $26xxxx callers writes a DIFFERENT word of the $8130D8.. block in the same
  // breath, and THAT is the real discriminator -- one word per scroll-affecting set piece. The
  // order differs: type $44 clears its word BEFORE the push and type $47's retire ($26D874) clears
  // its AFTER, so the scan is symmetric on purpose rather than asserting an order it does not have.
  for (const [call, flag] of [[0x26b73a, 0x8130d8], [0x26d802, 0x8130dc], [0x26d864, 0x8130dc],
    [0x26e04c, 0x8130da], [0x26e152, 0x8130da], [0x26f614, 0x8130de], [0x26f6c6, 0x8130e0]]) {
    const found = [];
    for (let a = call - 0x20; a < call + 0x20; a += 2) if (l(a) === flag) found.push(a);
    assert.ok(found.length > 0,
      `$${call.toString(16).toUpperCase()} names $${flag.toString(16).toUpperCase()} within `
      + '$20 bytes of the push -- one word per set piece, and no two share one');
  }
  // ...and type $44's two are BOTH before the push, four instructions apart from each other.
  assert.deepEqual([l(0x26e040), l(0x26e146)], [T44.elemGate, T44.elemGate],
    '$26E03C and $26E142 both `move.w #$0,$8130DA`, each immediately before its own push');
  assert.equal(T44.elemGate, 0x8130da, 'and type $44\'s is $8130DA');
  assert.equal(BGRAM.elemGate, T44.elemGate,
    '...which background.js has called the ELEMENT GATE since W18, not a presence flag at all');
});

// ===============================================================================================
// SECTION 3 -- STAGE 5'S SCROLL SCRIPT. There is no SPEED $0000 anywhere near this object.
// ===============================================================================================

/** `$262062`'s record shape: `time:u16, UNUSED:u16, op:u16, payload`. */
function scrollRecords(script) {
  const out = [];
  let a = script + 8;                                     // $262004 -- the first record
  for (let n = 0; n < 4000 && w(a) !== 0xffff; n++) {
    const op = w(a + 4);
    const size = { 0x00: 2, 0x04: 6, 0x08: 2, 0x0c: 0, 0x10: 6, 0x14: 2, 0x18: 2 }[op];
    assert.notEqual(size, undefined, `unknown scroll opcode $${op.toString(16)} at $${a.toString(16)}`);
    out.push({ at: a, t: w(a), op, arg: size >= 2 ? w(a + 6) : null });
    a += 6 + size;
  }
  return out;
}

test('W400 SECTION 3: type $44 lives inside a SLOWDOWN, and the first SPEED $0000 is at $0346',
  { skip: SKIP }, () => {
    const pair = l(0x26153e + STAGE5_X4);                 // $26152C lea ($26153E,PC),A0
    assert.equal(pair, 0x261572, 'stage 5\'s script PAIR pointer');
    const script0 = l(pair);
    const script1 = l(pair + 4);
    assert.deepEqual([script0, script1], [0x261da8, 0x261edc], 'and its two scripts');

    for (const [name, script] of [['script0', script0], ['script1', script1]]) {
      const recs = scrollRecords(script);
      const speeds = recs.filter((r) => r.op === 0x08);
      // The two records that bracket type $44's life.
      assert.ok(speeds.some((r) => r.t === 0x00b0 && r.arg === 0x0010),
        `${name} has t=$00B0 SPEED $0010 -- the SLOWDOWN`);
      assert.ok(speeds.some((r) => r.t === T44.retireClock && r.arg === T44.scrollPush),
        `${name} has t=$00E0 SPEED $0020 -- the exact clock $26E06A tests, and the exact value `
        + 'both pushes carry');
      // THE CLAIM THE BRIEF'S QUESTION NEEDED. Not "no stop was observed": no stop EXISTS.
      const parks = speeds.filter((r) => r.arg === 0x0000);
      assert.deepEqual(parks.map((r) => r.t), [0x0346],
        `${name}'s ONLY SPEED $0000 is at t=$0346 -- HIBACHI's park, 358 clocks past $44's whole `
        + 'life. This is neither a cartridge stop nor a port stop; it is a slowdown');
      assert.equal(recs.filter((r) => r.op === 0x0c).length, name === 'script0' ? 1 : 0,
        `${name}'s FREEZE count -- and script0's one is at t=$03B4, past everything here`);
    }
    // The two records are eight bytes apart in the ROM, which is what makes them ONE decision.
    assert.equal(l(0x261dfc), 0x00b0ffff, '$261DFC: t=$00B0 with the skipped second word');
    assert.equal(w(0x261e00), 0x0008, '  ...op $08');
    assert.equal(w(0x261e02), 0x0010, '  ...SPEED $0010');
    assert.equal(l(0x261e14), 0x00e0ffff, '$261E14: t=$00E0');
    assert.equal(w(0x261e1a), 0x0020, '  ...SPEED $0020');
  });

// ===============================================================================================
// SECTION 4 -- THE DELIVERABLE. One object, two outcomes, and the scroll on each side.
// ===============================================================================================

/** The bench: stage 5's background at an entry clock, plus ONE type $44 spawned the way type $43
 *  spawns it -- `enqueueDeferred($44, FIXED80)` with the parent's position in `($16,A5)`, then the
 *  real `$263446` drain, the real `$2635F6` dispatch and the real init body. Nothing is hand-built.
 *
 *  `resetSpriteQueueCounters` is called every frame because the ISR does it and this bench has no
 *  ISR: without it the bucket-0 counter runs past its buffer after ~440 frames and the overflow
 *  lands in the sub-record pool. (Found the hard way -- it looked exactly like a port bug.) */
function bench({ romSpec = null, entryClock = 0x00b0 } = {}) {
  const ROM = new RomWindows(romSpec ?? tables.rom);
  const MT = new MoveTables(tables, ROM);
  const ram = new Ram();
  const vram = new BgVram();
  const log = new UnportedLog();
  const ctx = { unported: log, unportedLog: log, tables: MT, soundPost() {},
    palette: new PaletteState() };

  ram.setU16(BGRAM.stageX4, STAGE5_X4);                   // $813096
  ram.setU16(A5BG + BGO.entryClock, entryClock);          // ($6,A5) -> $8130CE
  backgroundInit(ram, ROM, vram, ctx, A5BG);

  const q = enqueueDeferred(ram, 0x44, DEFQ_D1.FIXED80);  // $26DEC6 jsr $263678
  ram.setU32(q.addr + 0x16, SPAWN_POS);                   // $26DECC move.l ($2,A6),($16,A0)
  processDeferred(ram, ROM, log, MT, null, ctx.palette, ctx.soundPost);

  let a5 = 0;
  for (let s = 0; s < ENEMY_SLOTS; s++) {
    const at = ENEMY_TABLE + s * ENEMY_STRIDE;
    if (ram.u16(at) !== 0 && ram.u32(at + 0x4c) === T44.handler) { a5 = at; break; }
  }
  return { ROM, MT, ram, vram, log, ctx, a5, a6: a5 ? ram.u32(a5 + 0x06) : 0 };
}

/** One frame: the enemy handler, then the background. The order is `$2634F4`'s. */
function frame(b) {
  resetSpriteQueueCounters(b.ram);
  runHandler(T44.handler, b.ram, b.ROM, b.a5, b.ctx);
  backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
}

/** Arm every part's hit bits and empty its sink -- one frame's worth of maximum damage. */
function shoot(b) {
  for (const p of T44.parts) {
    b.ram.setU8(b.a6 + p, b.ram.u8(b.a6 + p) | 0x40);     // a bit inside $26E090's $5C mask
    b.ram.setU16(b.a6 + p + T44.hpAt, 0);                 // ...and $7FFF of damage in the sink
  }
}

test('W400 SECTION 4: it spawns through the real chain, with $43\'s position and a $15000 pool',
  { skip: SKIP }, () => {
    const b = bench();
    assert.ok(b.a5, 'the deferred drain allocated a record and $2635F6 installed $26E02A');
    assert.equal(b.ram.u32(b.a6 + 0x02), SPAWN_POS,
      '($2,A6) is the position $43 stashed -- $26DF54 reads ($16,A5) BEFORE $26DF64 overwrites it');
    assert.equal(b.ram.u32(b.a5 + T44.hpLong), 0x00015000,
      'and ($18,A5) is the record prototype\'s LONG, the pool $26E11A subtracts from');
    assert.equal(b.ram.u16(b.a5 + 0x04), T44.subRecords - 1, '($4,A5) = 5, so six sub records');
    assert.equal(b.ram.u16(T44.elemGate), 1, '$26DF6A set the element gate');
    assert.equal(b.ram.u16(T44.budgetWord), 1, '$26DF72 set the budget word');
    assert.equal(b.ram.u8(b.a6 + T44.palAt), 0x12,
      'the prototype\'s palette byte is $12 -- the same literal $26E164 restores');
    assert.equal(b.ram.u16(b.a6 + T44.hpAt), 0x7fff, '...and each part\'s sink starts full');
    assert.ok(INIT_BODY_ADDRESSES.includes(T44.initBody),
      '$26DF48 is registered, so the type is SPAWNABLE and not merely handled');
  });

test('W400 SECTION 4: LEFT ALONE, the clock reaches $00E0, the script sets $0020, and it flies off',
  { skip: SKIP }, () => {
    const b = bench({ entryClock: 0x00b0 });
    assert.equal(b.ram.u16(A5BG + BGO.speedBg), 0x0020, 'at spawn the scroll is still $0020');
    let armed = -1;
    let freed = -1;
    let slowAt = -1;
    for (let f = 0; f < 2200 && freed < 0; f++) {
      if (b.ram.u16(b.a5) === 0) { freed = f; break; }
      frame(b);
      if (slowAt < 0 && b.ram.u16(A5BG + BGO.speedBg) === 0x0010) slowAt = f;
      if (armed < 0 && b.ram.u16(b.a6 + T44.animAt) === T44.animFly) armed = f;
    }
    assert.equal(slowAt, 0, 'frame 0: the t=$00B0 record drops the scroll to $0010');
    assert.equal(armed, 1536, 'frame 1536: the odometer hits $00E0 and $26E080 arms anim state 4');
    assert.equal(b.ram.u16(BGRAM.clock), 0x00e9, '  ...and the clock kept running throughout');
    assert.equal(freed, 1693, 'frame 1693: the wreck passed a wall, ($BE,A6) armed, $26E052 freed it');
    assert.equal(b.ram.u16(A5BG + BGO.speedBg), T44.scrollPush,
      'the scroll is $0020 -- but the SCRIPT set it at $00E0, and push #1 arrived 157 frames later');
    assert.equal(b.ram.u8(b.a6 + T44.deadFlag), 0, 'it never died: the clock trigger closed $26E112');
    assert.equal(b.ram.u16(T44.elemGate), 0, 'push #1 still cleared the element gate');
  });

test('W400 SECTION 4: KILLED, push #2 cancels the slowdown 1534 frames early', { skip: SKIP }, () => {
  const b = bench({ entryClock: 0x00b0 });
  let died = -1;
  let freed = -1;
  let speedAtDeath = null;
  let pushAtDeath = null;
  for (let f = 0; f < 600 && freed < 0; f++) {
    if (b.ram.u16(b.a5) === 0) { freed = f; break; }
    if (b.ram.u8(b.a6 + T44.deadFlag) === 0) shoot(b);
    const before = b.ram.u16(A5BG + BGO.speedBg);
    resetSpriteQueueCounters(b.ram);
    runHandler(T44.handler, b.ram, b.ROM, b.a5, b.ctx);
    if (died < 0 && b.ram.u8(b.a6 + T44.deadFlag) !== 0) {
      died = f;
      speedAtDeath = before;
      pushAtDeath = [b.ram.u16(BGRAM.extSpeed), b.ram.u16(BGRAM.extSpeedBg),
        b.ram.u16(BGRAM.extSpeedTx)];
    }
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  // THE POOL IS $15000 AND ONE FRAME'S MAXIMUM BILL IS $7FFF, SO IT TAKES THREE FRAMES.
  assert.equal(died, 2, 'the pool $15000 survives two frames of $7FFF and dies on the third');
  assert.equal(speedAtDeath, 0x0010, 'and the scroll was at the script\'s $0010 when it died');
  assert.deepEqual(pushAtDeath, [1, T44.scrollPush, T44.scrollPush],
    '$26E14A/$26E14E/$26E152 wrote $813180 = 1 and $0020 into BOTH speed words');
  assert.equal(b.ram.u16(A5BG + BGO.speedBg), T44.scrollPush,
    '...and $2612AA consumed them on the very next background frame: the scroll is $0020 again');
  assert.equal(b.ram.u16(BGRAM.clock), 0x00b7,
    'the clock is $00B7 -- the script would not have set $0020 until $00E0');
  assert.equal(freed, 128,
    'the three-phase death runs 126 more frames, then ($BE,A6) and $26E052 free the record');
  assert.equal(b.ram.u16(T44.elemGate), 0, 'the gate was cleared by push #2 and again by push #1');
});

test('W400 SECTION 4: the two pushes are ONE death, and ($BE,A6) is the bridge', { skip: SKIP }, () => {
  const b = bench();
  const seen = [];
  for (let f = 0; f < 600; f++) {
    if (b.ram.u16(b.a5) === 0) break;
    if (b.ram.u8(b.a6 + T44.deadFlag) === 0) shoot(b);
    // $813180 is the ARM. `backgroundFrame` clears it at $2612B4 the moment it consumes the pair,
    // so clearing it here and reading it back between the two calls counts PUSHES and not values.
    b.ram.setU16(BGRAM.extSpeed, 0);
    b.ram.setU16(BGRAM.extSpeedBg, 0);
    resetSpriteQueueCounters(b.ram);
    runHandler(T44.handler, b.ram, b.ROM, b.a5, b.ctx);
    if (b.ram.u16(BGRAM.extSpeed) === 1) {
      seen.push({ f, dead: b.ram.u8(b.a6 + T44.deadFlag), retire: b.ram.u8(b.a6 + T44.retireFlag),
        phase: b.ram.u8(b.a6 + T44.deathPhaseAt), anim: b.ram.u16(b.a6 + T44.animAt),
        bg: b.ram.u16(BGRAM.extSpeedBg) });
    }
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  assert.equal(seen.length, 2, 'exactly TWO pushes across the whole death -- no more, no fewer');
  assert.deepEqual(seen.map((s) => s.bg), [T44.scrollPush, T44.scrollPush], 'both carry $0020');
  assert.deepEqual([seen[0].f, seen[0].dead, seen[0].retire, seen[0].anim], [2, 1, 0, T44.animDeath],
    'push #2 fires at the death, with ($BF,A6) set, ($BE,A6) still clear and anim state 3');
  assert.deepEqual([seen[1].f, seen[1].retire, seen[1].phase], [127, 1, 2],
    'push #1 fires 125 frames later, once $26EA1C -- death phase 2 -- has set ($BE,A6)');
});

test('W400 SECTION 4: the clock trigger makes it IMMORTAL, which is why the exits are exclusive',
  { skip: SKIP }, () => {
    // $26E076 writes ($17,A5), and $26E112 reads the SAME byte before touching the pool. That is
    // one byte doing two jobs, and it is what stops both exits ever running for one object.
    const b = bench({ entryClock: 0x00b0 });
    b.ram.setU16(BGRAM.clock, T44.retireClock);           // stand the odometer on $00E0
    frame(b);
    assert.equal(b.ram.u8(b.a5 + T44.stateAt), 1, '$26E076 armed ($17,A5)');
    assert.equal(b.ram.u16(b.a6 + T44.animAt), T44.animFly, '  ...and anim state 4');
    const pool = b.ram.u32(b.a5 + T44.hpLong);
    for (let f = 0; f < 30; f++) { shoot(b); frame(b); }
    assert.equal(b.ram.u32(b.a5 + T44.hpLong), pool,
      '30 frames of maximum damage and the pool has not moved -- $26E112 refuses');
    assert.equal(b.ram.u8(b.a6 + T44.deadFlag), 0, 'so it cannot reach push #2');
  });

test('W400 SECTION 4: the palette flash is the FALL-THROUGH, not a branch', { skip: SKIP }, () => {
  // $26E164 restores $12 on the no-hit path and on the DEATH path, but not on hit-and-alive. A port
  // that made the restore unconditional would flash nothing; one that made it conditional on "no
  // hit" would leave the death frame flashing.
  const b = bench();
  frame(b);
  assert.equal(b.ram.u8(b.a6 + T44.palAt), T44.palRestore, 'no hit: restored to $12');
  shoot(b);
  frame(b);
  assert.equal(b.ram.u8(b.a6 + T44.palAt), T44.palRestore ^ T44.palXor,
    'hit and alive: the eori #$D survives to the draw -- $1F, and that IS the flash');
  for (const p of T44.parts) assert.equal(b.ram.u8(b.a6 + p + T44.palAt), 0x1f, 'on all three parts');
  shoot(b); frame(b);
  shoot(b); frame(b);                                     // the third hit kills it
  assert.equal(b.ram.u8(b.a6 + T44.deadFlag), 1, 'dead');
  assert.equal(b.ram.u8(b.a6 + T44.palAt), T44.palRestore,
    'and the DEATH frame falls out of the block into $26E164, so it does NOT flash');
});

test('W400 SECTION 4: the damage fold is a MAX over the parts, not a sum and not a min',
  { skip: SKIP }, () => {
    // $26E0E8 `cmp.l D3,D2 / bge` SKIPS `move.l D3,D2`, so the survivor is the largest.
    const b = bench();
    b.ram.setU8(b.a6 + T44.parts[1], b.ram.u8(b.a6 + T44.parts[1]) | 0x40);
    b.ram.setU16(b.a6 + T44.parts[0] + T44.hpAt, 0x7000);   // $FFF of damage
    b.ram.setU16(b.a6 + T44.parts[1] + T44.hpAt, 0x0000);   // $7FFF -- the largest
    b.ram.setU16(b.a6 + T44.parts[2] + T44.hpAt, 0x7ffe);   // $1
    const before = b.ram.u32(b.a5 + T44.hpLong);
    frame(b);
    assert.equal(before - b.ram.u32(b.a5 + T44.hpLong), 0x7fff,
      'the bill is the MOST damaged part, $7FFF -- a sum would be $8FFE and a min would be $1');
    for (const p of T44.parts) {
      assert.equal(b.ram.u16(b.a6 + p + T44.hpAt), T44.sinkFull, 'and all three sinks re-arm');
    }
  });

test('W400 SECTION 4: TRAP 3 -- states 3 and 4 write a speed AND a heading from one word literal',
  { skip: SKIP }, () => {
    // ADDED BY THE TRAP-21 AUDIT. Writing `$0C40` as a WORD at +$1A left every other test in this
    // file green, and it is the difference between a wreck that drifts off screen and one that
    // never moves: `movement.js` SUB says +$1A is SPEED and +$1B is HEADING.
    for (const [x, heading, why] of [[0x2000, 0x40, 'right of $1C00'], [0x1000, 0xc0, 'left of it']]) {
      const b = bench();
      b.ram.setU16(b.a6 + 0x04, x);
      b.ram.setU16(BGRAM.clock, T44.retireClock);
      frame(b);
      assert.equal(b.ram.u16(b.a6 + T44.animAt), T44.animFly, `${why}: anim state 4`);
      assert.equal(b.ram.u8(b.a6 + 0x1a), 0x0c, '  ...($1A,A6), the SPEED, is $0C');
      assert.equal(b.ram.u8(b.a6 + 0x1b), heading, `  ...($1B,A6), the HEADING, is $${heading
        .toString(16)}`);
    }
    // ...and state 3's `$0480` the same way.
    const b = bench();
    for (let f = 0; f < 4; f++) { if (b.ram.u8(b.a6 + T44.deadFlag) === 0) shoot(b); frame(b); }
    assert.equal(b.ram.u16(b.a6 + T44.animAt), T44.animDeath, 'the death drift is state 3');
    assert.equal(b.ram.u8(b.a6 + 0x1a), 0x04, '  ...speed $04');
    assert.equal(b.ram.u8(b.a6 + 0x1b), 0x80, '  ...heading $80');
  });

test('W400 SECTION 4: the shadow trail is added to the HIGH half of the long', { skip: SKIP }, () => {
  // ADDED BY THE TRAP-21 AUDIT. `$26E18E add.w D1,($22,A6)` lands on the WORD at +$22, which is the
  // HIGH half of the long `$26E17E move.l D0,($22,A6)` stored one instruction earlier. Adding it to
  // the low half instead reddened NOTHING in this file until this test existed.
  const b = bench();
  b.ram.setU16(b.a6 + T44.animAt, T44.animDeath);        // a state that moves nothing...
  b.ram.setU16(b.a6 + T44.animSub, 1);                   // ...and whose one arm is already done
  b.ram.setU8(b.a6 + 0x1a, 0);                           // speed 0, so $241E34's vector is (0,0)
  b.ram.setU32(b.a6 + 0x02, SPAWN_POS);
  b.ram.setU16(b.a6 + T44.shadowA.trail, 0x0400);
  b.ram.setU16(b.a6 + T44.shadowB.trail, 0x0800);
  frame(b);
  assert.equal(b.ram.u32(b.a6 + 0x02), SPAWN_POS, 'the object did not move this frame');
  assert.equal(b.ram.u32(b.a6 + T44.shadowA.at), 0x2b001400,
    '($22,A6) = ($30001C00 + $F6FFF800) with $0400 added to the HIGH word: $2B001400');
  assert.equal(b.ram.u32(b.a6 + T44.shadowB.at), 0x2f002400,
    '($42,A6) = ($30001C00 + $F7000800) with $0800 added to the HIGH word: $2F002400');
  assert.equal(b.ram.u16(b.a6 + T44.shadowA.trail), 0x0400 - T44.trailStep,
    '...and the trail decays by $40 AFTER the shadow is taken, not before');
  assert.equal(b.ram.u16(b.a6 + T44.shadowB.trail), 0x0800 - T44.trailStep, '...both of them');
});

test('W400 SECTION 4: the threshold walk stores on `bgt`, so a row matches at its own threshold',
  { skip: SKIP }, () => {
    // ADDED BY THE TRAP-21 AUDIT. `$26E3B2 cmp.w D1,D0 / bgt` loops while D0 > D1, so the value is
    // taken from the first row the distance does not EXCEED. Reading it as `bge` moves every
    // boundary by one, and the only rows where that is visible are the ones whose values differ --
    // $26E3FE's ($01C0, 1) and ($0200, 2). `dist242494` with the X halves equal returns
    // `d - (d >> 2)`, so 597 and 598 units of Y are $01C0 and $01C1 exactly.
    for (const [dy, want] of [[597, 1], [598, 2]]) {
      const b = bench();
      b.ram.setU16(b.a6 + T44.animSub, 1);               // skip $26E322's draw: waypoint 0
      b.ram.setU16(b.a6 + 0x6a, 0);
      const tgtY = IMG.readUInt16BE(T44.waypoints);
      const tgtX = (IMG.readUInt16BE(T44.waypoints + 2) - b.ram.u16(T44.scroll)) & 0xffff;
      b.ram.setU16(b.a6 + 0x02, (tgtY + dy) & 0xffff);
      b.ram.setU16(b.a6 + 0x04, tgtX);                   // X halves equal, so the term drops out
      frame(b);
      assert.equal(b.ram.u8(b.a6 + T44.state0SpeedAt), want,
        `distance $${(dy - (dy >> 2)).toString(16)} selects value ${want} from $26E3FE`);
    }
  });

// ===============================================================================================
// SECTION 5 -- THE SECOND THING BOTH PUSHES DO.
// ===============================================================================================

test('W400 SECTION 5: the pushes also release the BACKGROUND ELEMENTS this object froze',
  { skip: SKIP }, () => {
    // $8130DA is not a presence flag like $8130D8/$DC/$DE/$E0. It is the word $2623C2 tests at the
    // head of every element updater, and `background.js` named it elemGate in W18 -- six waves
    // before any of these pushes was read.
    assert.equal(w(0x2623c2), 0x4a79, '$2623C2 is `tst.w`');
    assert.equal(l(0x2623c4), T44.elemGate, '  ...of $8130DA, at the head of an element updater');
    assert.equal(w(0x26df6a), 0x33fc, '$26DF6A is `move.w #imm,abs.l`');
    assert.equal(w(0x26df6c), 1, '  ...#$1');
    assert.equal(l(0x26df6e), T44.elemGate, '  ...into $8130DA. The INIT BODY sets it.');
    for (const at of [0x26e03c, 0x26e142]) {
      assert.equal(w(at), 0x33fc, `$${at.toString(16).toUpperCase()} is \`move.w #imm,abs.l\``);
      assert.equal(w(at + 2), 0, '  ...#$0');
      assert.equal(l(at + 4), T44.elemGate, '  ...into $8130DA, one instruction before the push');
    }
    const b = bench();
    assert.equal(b.ram.u16(T44.elemGate), 1, 'live: the gate is up');
    for (let f = 0; f < 4; f++) { if (b.ram.u8(b.a6 + T44.deadFlag) === 0) shoot(b); frame(b); }
    assert.equal(b.ram.u8(b.a6 + T44.deadFlag), 1, 'dead');
    assert.equal(b.ram.u16(T44.elemGate), 0, '...and the gate is down, on the same instruction pair');
  });

// ===============================================================================================
// SECTION 6 -- WHAT IS COUNTED. Each note names its own byte extent.
// ===============================================================================================

test('W400 SECTION 6: the fire driver is COUNTED and it is the only note a live frame produces',
  { skip: SKIP }, () => {
    const b = bench();
    frame(b);
    const notes = b.log.report();
    assert.equal(notes.length, 1, 'ONE note on a clean frame');
    assert.match(notes[0], /\$26E82E/, 'and it is the fire driver');
    assert.match(notes[0], /\$26E858 \+ \$14E/, 'naming mode 0\'s measured extent');
    assert.match(notes[0], /\$26E9A6 \+ \$5A/, '...and mode 1\'s');
    assert.match(notes[0], /TYPE \$53/, '...and the child it would spawn');
    assert.equal(w(0x26e9e2), 0x7053, '$26E9E2 moveq #$53,D0 -- the spawn the counted half owns');
    assert.equal(w(0x26e9e4), 0x4eb9, '  ...followed by a `jsr`');
    assert.equal(l(0x26e9e6), 0x00263684, '  ...to $263684, the deferred-spawn entry');
  });

test('W400 SECTION 6: $26E2B6 is a $62-byte table NOTHING in the image reads', { skip: SKIP }, () => {
  // TRAP 20, and TRAP 8: this is not "we could not find a reader". The three tables that ARE read
  // ($26E3FE, $26E526, $26E762) each have a `lea (d16,PC),A4` naming them, and a sweep of every
  // PC-relative and absolute reference in the image finds three such leas and no fourth.
  const leas = [];
  for (let a = 0x260000; a < 0x2b0000; a += 2) {
    const op = w(a);
    if ((op & 0xf1ff) !== 0x41fa && op !== 0x487a) continue;
    const disp = w(a + 2) >= 0x8000 ? w(a + 2) - 0x10000 : w(a + 2);
    const t = a + 2 + disp;
    if (t >= T44.handler && t < T44.familyEnd) leas.push([a, t]);
  }
  assert.deepEqual(leas, [[0x26e158, 0x26ebda], [0x26e286, 0x26e2a2], [0x26e33a, 0x26e3da],
    [0x26e35e, 0x26e3da], [0x26e3a0, 0x26e3fe], [0x26e50a, 0x26e526], [0x26e614, 0x26e762],
    [0x26e832, 0x26e850], [0x26ea3c, 0x26eb90], [0x26eac4, 0x26eb46]],
  'every PC-relative reference into the family, and $26E2B6 is not among them');
  for (let a = 0x200000; a + 4 <= IMG.length; a += 2) {
    if (l(a) === T44.unreadTable) assert.fail(`$${a.toString(16)} is an absolute long to $26E2B6`);
  }
  // It has the shape of the three that ARE read, and DIFFERENT constants: its value column climbs
  // by 2 where $26E3FE's climbs by 1. TRAP 19, adjacent tables flipping in opposite directions.
  assert.equal(w(T44.unreadTable + T44.unreadTableBytes - 2), 0xffff, 'it is $FFFF-terminated');
  assert.deepEqual([w(0x26e2b6), w(0x26e2b8), w(0x26e2ba), w(0x26e2bc)], [0x40, 1, 0x80, 2],
    '$26E2B6 pairs step (threshold $40, value +1) then (threshold $80, value +1)...');
  assert.deepEqual([w(0x26e3fe), w(0x26e400), w(0x26e402), w(0x26e404)], [0x40, 1, 0x80, 1],
    '...where $26E3FE, forty-eight bytes of the same shape later, holds value 1 for BOTH');
});

// ===============================================================================================
// SECTION 7 -- ABLATED FROM THE EXPORTED TABLES. Eight shapes, eight throws.
// ===============================================================================================

/** A window removed (`len === null`) or TRUNCATED, in the exported table set itself. */
const reshaped = (base, len) => ({
  ...tables.rom,
  windows: tables.rom.windows.flatMap((x) => {
    if (parseInt(String(x.base).replace('$', ''), 16) !== base) return [x];
    return len === null ? [] : [{ ...x, len, hex: x.hex.slice(0, len * 2) }];
  }),
});

const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

test('W400 SECTION 7: the init STUB window removed -- $2635F6 cannot read the run length',
  { skip: SKIP }, () => {
    const e = caught(() => bench({ romSpec: reshaped(T44.init, null) }));
    assert.ok(e, 'the spawn must refuse');
    assert.equal(e.romAddress, T44.init + 2,
      'and it names $26DF42, the `#N` of `move.w #N,($4,A5)` that initDispatch reads');
    assert.ok(bench().a5, 'POSITIVE CONTROL: with the window the spawn completes');
  });

test('W400 SECTION 7: the prototype window removed -- $2637A2 throws at $26DF82', { skip: SKIP }, () => {
  const e = caught(() => bench({ romSpec: reshaped(T44.recordProto, null) }));
  assert.ok(e, '$26DF50 jsr $2637A2 must refuse');
  assert.equal(e.romAddress, T44.subProto,
    'and it names $26DF82, the FIRST sub prototype -- the body copies those before the record words');
});

test('W400 SECTION 7: the same window TRUNCATED by two bytes -- the throw MOVES to $26E028',
  { skip: SKIP }, () => {
    // A SHORT WINDOW SURVIVES A SHORT COPY. $AC covers five and five sixths entries; the last word
    // of entry [5] falls off the end, and that word is two bytes short of the handler.
    const e = caught(() => bench({ romSpec: reshaped(T44.recordProto, 0xac) }));
    assert.ok(e, 'five and a bit prototypes is still short');
    assert.equal(e.romAddress, 0x26e028,
      'the address moves to $26E028, entry [5]\'s trailing word -- exactly $2 before the handler');
  });

test('W400 SECTION 7: the anim table removed -- frame 1 throws at $26E2A2', { skip: SKIP }, () => {
  const b = bench({ romSpec: reshaped(T44.animTable, null) });
  const e = caught(() => frame(b));
  assert.ok(e, '$26E296 `movea.l (A0),A0` must refuse');
  assert.equal(e.romAddress, T44.animTable, 'and it names entry [0]: anim state 0 is where it starts');
});

test('W400 SECTION 7: the anim table TRUNCATED to FOUR entries -- only the CLOCK TRIGGER falls off',
  { skip: SKIP }, () => {
    // The shape W399 asked for: a truncation the ordinary path survives. States 0..3 all resolve;
    // the object wanders, takes damage, dies, and runs its whole death sequence. Only $26E080's
    // `moveq #$4` reaches the missing longword -- so a test that never advanced the odometer to
    // $00E0 would have passed this. TRAP 23 made into a run.
    const b = bench({ romSpec: reshaped(T44.animTable, 0x10) });
    for (let f = 0; f < 6; f++) { if (b.ram.u8(b.a6 + T44.deadFlag) === 0) shoot(b); frame(b); }
    assert.equal(b.ram.u8(b.a6 + T44.deadFlag), 1, 'the whole death ran on the short window');
    assert.equal(b.ram.u16(BGRAM.extSpeedBg), T44.scrollPush, '...push #2 included');
    const b2 = bench({ romSpec: reshaped(T44.animTable, 0x10) });
    b2.ram.setU16(BGRAM.clock, T44.retireClock);
    const e = caught(() => frame(b2));
    assert.ok(e, 'but the clock trigger does not');
    assert.equal(e.romAddress, T44.animTable + 4 * 4,
      'and it names $26E2B2, entry [4] -- the fly-away, the first longword past the cut');
  });

test('W400 SECTION 7: the waypoint window removed -- anim state 0 throws at $26E3DA',
  { skip: SKIP }, () => {
    const b = bench({ romSpec: reshaped(T44.waypoints, null) });
    b.ram.setU16(b.a6 + T44.animSub, 1);                  // skip $26E322's draw so the cursor is 0
    b.ram.setU16(b.a6 + 0x6a, 0);
    const e = caught(() => frame(b));
    assert.ok(e, '$26E344 `movem.w (A0),D2-D3` must refuse');
    assert.equal(e.romAddress, T44.waypoints, 'and it names row 0');
  });

test('W400 SECTION 7: the threshold window TRUNCATED past its terminator -- the walk runs off',
  { skip: SKIP }, () => {
    // $60 keeps all twenty-four pairs and drops ONLY the $FFFF. The walk's sole exit besides a
    // matching row is that word, so a distance past $0600 walks straight into the missing bytes.
    const b = bench({ romSpec: reshaped(T44.state0Thresh, 0x60) });
    b.ram.setU16(b.a6 + T44.animSub, 1);
    b.ram.setU16(b.a6 + 0x6a, 0);
    b.ram.setU32(b.a6 + 0x02, 0x00000000);                // far from waypoint 0 ($5C00,$0C00)
    const e = caught(() => frame(b));
    assert.ok(e, 'the terminator is load-bearing');
    assert.equal(e.romAddress, T44.state0Thresh + 0x60,
      'and it names $26E45E, the $FFFF itself -- which is why the window is $62 and not $60');
  });

test('W400 SECTION 7: the $246520 script removed -- THE PUSH STILL FIRES, then it throws',
  { skip: SKIP }, () => {
    // $26E152 is the `jsr $261100` and $26E15E is the `jsr $246520`: twelve bytes apart, and the
    // push is FIRST. So this ablation proves the ORDER as well as the window.
    const b = bench({ romSpec: reshaped(T44.animScript, null) });
    let e = null;
    for (let f = 0; f < 6 && !e; f++) {
      if (b.ram.u8(b.a6 + T44.deadFlag) === 0) shoot(b);
      e = caught(() => frame(b));
    }
    assert.ok(e, '$246520 must refuse to read a script it has no window for');
    assert.equal(e.romAddress, T44.animScript, 'and it names $26EBDA, the count word');
    assert.equal(b.ram.u16(BGRAM.extSpeedBg), T44.scrollPush,
      'AND THE PUSH ALREADY HAPPENED: $813182 is $0020 on the frame that threw');
    assert.equal(b.ram.u16(T44.elemGate), 0, '  ...and $8130DA was already cleared');
    assert.equal(b.ram.u8(b.a6 + T44.deadFlag), 1, '  ...and ($BF,A6) was already set');
  });

test('W400 SECTION 7: the death lists removed -- two DIFFERENT throws, two phases apart',
  { skip: SKIP }, () => {
    // Phase 0 walks $26EB46 and phase 1 hands $26EB90 to $26C74E. One ablation cannot cover both,
    // which is exactly the hole W399 found by ablating one of a pair and watching everything stay
    // green.
    const runTo = (romSpec, frames) => {
      const b = bench({ romSpec });
      let e = null;
      for (let f = 0; f < frames && !e; f++) {
        if (b.ram.u8(b.a6 + T44.deadFlag) === 0) shoot(b);
        e = caught(() => frame(b));
      }
      return { b, e };
    };
    const a = runTo(reshaped(T44.deathListA, null), 40);
    assert.ok(a.e, 'phase 0 must refuse');
    assert.equal(a.e.romAddress, T44.deathListA, 'and it names $26EB46 row 0');
    assert.equal(a.b.ram.u8(a.b.a6 + T44.deathPhaseAt), 0, '  ...while still in phase 0');

    const c = runTo(reshaped(T44.deathListB, null), 200);
    assert.ok(c.e, 'phase 1 must refuse too, and much later');
    assert.equal(c.e.romAddress, T44.deathListB, 'and it names $26EB90 -- a DIFFERENT address');
    assert.equal(c.b.ram.u8(c.b.a6 + T44.deathPhaseAt), 1, '  ...from phase 1');
    assert.equal(c.b.ram.u8(c.b.a6 + T44.retireFlag), 0,
      '  ...so ($BE,A6) is still clear and push #1 has NOT happened');
  });

// ===============================================================================================
// SECTION 8 -- THE WINDOW SET.
// ===============================================================================================

test('W400 SECTION 8: 585 windows, the overlap count still 71, and all eight sit in open ground',
  { skip: SKIP }, () => {
    const ws = WINDOWS();
    assert.equal(ws.length, 594, '575 windows before this wave, 583 after; 585 after W402, 590 after W404, 593 after W405 and 594 since W406 added '
      + 'type $4C\'s two retire lists, which is why this number is a running total and not a claim '
      + 'about this wave');
    const mine = [T44.init, T44.recordProto, T44.animTable, T44.waypoints, T44.state0Thresh,
      T44.deathListA, T44.deathListB, T44.animScript];
    for (const a of mine) {
      assert.equal(ws.filter(([b]) => b === a).length, 1,
        `$${a.toString(16).toUpperCase()} is declared exactly once`);
    }
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
    assert.equal(pairs(ws), 71, '71 overlapping pairs WITH the eight new windows');
    assert.equal(pairs(ws.filter(([a]) => !mine.includes(a))), 71,
      '...and 71 without them: none of the eight overlaps anything, the same number the last '
      + 'eight waves counted');
    // The two neighbours the family is wedged between, and the fact that neither moved.
    const byBase = new Map(ws);
    assert.equal(byBase.get(0x26df00), 0x40, 'W341\'s type-$43 draw table is still $26DF00 + $40');
    assert.equal(byBase.get(0x2701c8), 0x0e, 'and W341\'s type-$4C $246520 table is still $2701C8 + $E');
    assert.deepEqual([...IMG.subarray(T44.animScript, T44.familyEnd)],
      [...IMG.subarray(0x2701c8, 0x2701d6)],
      '  ...and this wave\'s $26EBDA + $E is byte for byte that one');
  });

// ===============================================================================================
// A DIRECT CALL, so the module is exercised even if the registry ever changes shape.
// ===============================================================================================

test('W400: handler44 is registered AND callable by name', { skip: SKIP }, () => {
  const b = bench();
  assert.doesNotThrow(() => handler44(b.ram, b.ROM, b.a5, b.ctx), 'the export runs');
  assert.doesNotThrow(() => runHandler(T44.handler, b.ram, b.ROM, b.a5, b.ctx),
    'and so does the dispatch that stage 5 reaches it through');
});
