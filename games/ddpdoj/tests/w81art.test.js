// WAVE 81 -- THE FIGHTER ($82), THE GOLD MECH ($10) AND THE TWIN TURRET ($88).
//
// W80 §5 filed all three as ART waves and left three claims behind it, and this
// file is what refuses each one with the cartridge:
//
//   1. *"`$82` emits 0 of 57 -- 57 of 57 descriptors have NO PICTURE"*.  The 57
//      are SLOT-FRAMES of ONE stream.  Type $82's body descriptor is the
//      CONSTANT `$1735FC` in the prototype at `$274770+6`; its heading table
//      `$272DFA` is the `$151E10` family the bundle has shipped since W58; and
//      its third record is the immediate `$173810`.  TWO new streams.
//   2. *"`$10` ... 25 of 27 descriptors have no picture, AND it needs `$267FC6`,
//      an unported rank test nobody has costed"*.  `$267FC6` HAS BEEN PORTED
//      SINCE W30 (`fireGate267FC6`); its cost to this wave is zero lines.  And
//      `$268594` is TWO tables -- 64 by heading and 32 by facing at +$100 --
//      which is type $11's hull/turret pair exactly.
//   3. *"type `$88` already emits 12/12 records with art for none"*.  True, and
//      it needs 37 streams, not 1: the body plus `$2763D8`'s four plus the
//      32-entry `$272D7A` both barrels index.
//
// EVERY TEST BELOW WAS SEEN TO FAIL, and the three runs are recorded because
// the difference between them is the point:
//
//   [M] `src/handlers.js` at HEAD, this file's spritequeue:  9 of 11 RED
//       (1..8 on an empty bucket counter or an unwritten table entry, and
//       W81/8 on the word write).  9 and 10 stay green -- they are about
//       `src/spritequeue.js`, which HEAD's handlers never reach.
//   [M] MUTATION `SCALE_TABLE[(widthByte & 0x3e) >> 1]` -- the line as it stood
//       in this repo until W81:  **W81/10 RED ALONE**, 10 of 11 green.  A port
//       that emits the right record at the wrong coordinate.
//   [M] MUTATION `const b = BUCKETS[0]` in `enqueueZoomedRequest` -- and THIS
//       ONE IS NOT HYPOTHETICAL, it is the defect W81 shipped for an hour:
//       the `bucket` parameter was added to the signature and not used in the
//       body.  **W81/5, /6, /7 and /10 RED.**  `tools/w80emitgate.mjs` was
//       GREEN 57/57 the whole time it was there, because a record in the wrong
//       bucket still reaches `$800000` -- it is at the wrong DEPTH, and no
//       instrument in this repo compares depth.  That is what these four exist
//       for.

import { test } from 'node:test';
import assert from 'node:assert';
import { Ram, u16 } from '../src/ram.js';
import { runHandler } from '../src/handlers.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { resolveZoomStub, enqueueZoomedRequest, BUCKETS } from '../src/spritequeue.js';
import { RomWindows } from '../src/rom.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TABLES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)),
  '..', 'rip', 'port', 'player.tables.json');

const REC = 0x81364c, SUB = 0x81459c;
const B0_COUNT = 0x80afc0, B0_BUF = 0x80397c;   // $23D9E2 / the record stub
const B3_COUNT = 0x80afc6, B3_BUF = 0x80688c;   // $23DF58
const B7_COUNT = 0x80afc8, B7_BUF = 0x807450;   // $23DF86 and $23DBCA

// ---- the cartridge, answered only where these paths read it ---------------
// The four emitter stubs' TWELVE OPERAND WORDS are transcribed out of
// `maincpu.bin` and nothing else is: the sprite tables answer with MARKERS, so
// "the port indexes THIS table with THIS index" is a number and not a
// coincidence with the real art.
const EMIT_REC = 0x23d762, EMIT_REG = 0x23dece;
const EMIT_A = 0x23df86, EMIT_B = 0x23df58, EMIT_ZOOM = 0x23dbca;
const H10_MAIN = 0x268594, H10_FIRE = 0x268694, H82_HEAD = 0x272dfa;
const SCALE_ROM = 0x23e54a;

const WORDS = new Map([
  [EMIT_REC, 0x41f9], [EMIT_REC + 6, 0xd0f9], [EMIT_REC + 12, 0x43ee],
  [EMIT_REG, 0x41f9], [EMIT_REG + 6, 0xd0f9], [EMIT_REG + 12, 0x2001],
  [EMIT_A, 0x41f9], [EMIT_A + 6, 0xd0f9], [EMIT_A + 12, 0x2001],
  [EMIT_B, 0x41f9], [EMIT_B + 6, 0xd0f9], [EMIT_B + 12, 0x2001],
  // $23DBCA 41FA 097E / 4E71 / 2206 ... $23DC06 41F9 <buf> D0F9 <ctr>
  [EMIT_ZOOM, 0x41fa], [EMIT_ZOOM + 2, SCALE_ROM - (EMIT_ZOOM + 2)],
  [EMIT_ZOOM + 4, 0x4e71], [EMIT_ZOOM + 6, 0x2206],
  [EMIT_ZOOM + 0x3c, 0x41f9], [EMIT_ZOOM + 0x42, 0xd0f9],
]);
const LONGS = new Map([
  [EMIT_REC + 2, B0_BUF], [EMIT_REC + 8, B0_COUNT],
  [EMIT_REG + 2, B0_BUF], [EMIT_REG + 8, B0_COUNT],
  [EMIT_A + 2, B7_BUF], [EMIT_A + 8, B7_COUNT],
  [EMIT_B + 2, B3_BUF], [EMIT_B + 8, B3_COUNT],
  [EMIT_ZOOM + 0x3e, B7_BUF], [EMIT_ZOOM + 0x44, B7_COUNT],
]);
const ROM = {
  u8: () => 0,
  u16: (a) => WORDS.get(a) ?? 0,
  u32: (a) => {
    if (LONGS.has(a)) return LONGS.get(a);
    // markers: entry at byte offset k reads back as $xx0000 + k.
    if (a >= H10_MAIN && a < H10_MAIN + 0x100) return 0x00aa0000 + (a - H10_MAIN);
    if (a >= H10_FIRE && a < H10_FIRE + 0x80) return 0x00bb0000 + (a - H10_FIRE);
    if (a >= H82_HEAD && a < H82_HEAD + 0x80) return 0x00cc0000 + (a - H82_HEAD);
    // the SCALE TABLE: entry k must decode to multiplier k, which is what
    // `SCALE_TABLE` (decoded once in src/spritequeue.js) already asserts.
    return 0;
  },
};
const TABLES = { vector: () => ({ dy: 0, dx: 0 }) };

/** A live record parked on the FROZEN exit, so no aim runs and the synthetic
 *  ROM is never asked for `AimTables`. */
function makeRam(over = {}) {
  const ram = new Ram(null);
  for (let i = 0; i < 0x50; i++) ram.setU8(REC + i, 0);
  for (let i = 0; i < 0x20; i++) ram.setU8(SUB + i, 0);
  ram.setU16(REC, 0x8000);                 // live
  ram.setU32(REC + 0x06, SUB);             // sub-record pointer
  ram.setU16(SUB + 0x18, 0x0100);          // HP positive -> no death arm
  ram.setU32(REC + 0x2a, EMIT_REC);        // the $267F70 pair the init writes
  ram.setU32(REC + 0x2e, EMIT_REG);
  for (const [k, v] of Object.entries(over)) ram.setU16(parseInt(k), v);
  return ram;
}
const run = (h, ram) => runHandler(h, ram, ROM, REC,
  { tables: TABLES, unported: new UnportedLog() });

// ===========================================================================
// TYPE $10 -- THE GOLD MECH
// ===========================================================================

test('W81/1 -- $10 ENQUEUES its body through ($2A,A5) ($26832E jsr (A0))', () => {
  // $8130D2 non-zero freezes: `$2682F8 tst.w / bne $26832A` jumps STRAIGHT to
  // the emit, so exactly one record is produced and the sprite pointer is left
  // alone -- which is what separates "it draws" from "it draws the right art".
  const ram = makeRam({ '0x8130d2': 1 });
  ram.setU32(SUB + 0x0a, 0x0016_c7b4);     // a real-shaped descriptor
  ram.setU16(SUB + 0x0e, (4 << 9) | 48);   // 4 cols x 48 rows -- the mech
  assert.equal(ram.u16(B0_COUNT), 0, 'bucket 0 starts empty');
  run(0x268232, ram);
  // TWO requests: `$26832E` (the body, RECORD convention through ($2A,A5))
  // and, because the freeze gate at `$268376` also short-circuits, `$2683CE`
  // (the turret, REGISTER convention through ($2E,A5)). Both stubs resolve to
  // bucket 0 in this fixture, so the counter is the count.
  assert.equal(ram.u16(B0_COUNT), 24,
    'TWO 12-byte requests. Before W81 this was 0: both of type $10\'s enqueue '
    + 'sites sat inside one counted note');
  assert.equal(ram.u16(B0_BUF + 4), 0x0016, 'descriptor high');
  assert.equal(ram.u16(B0_BUF + 6), 0xc7b4, 'descriptor low');
  assert.equal(ram.u16(B0_BUF + 8), (4 << 9) | 48, 'size');
  // AND THE FREEZE MUST NOT HAVE WRITTEN THE SPRITE POINTER.
  assert.equal(ram.u32(SUB + 0x0a), 0x0016c7b4,
    '$2682F8 branches PAST $268324 when frozen; a port that always writes the '
    + 'pointer would overwrite the descriptor on every frozen frame');
});

test('W81/2 -- $10 indexes $268594 with (heading & $3E) * FOUR, +4 on the mirror', () => {
  // The index is what says the table is 64 entries and not 32. `(d & $3E) * 2`
  // -- type $89's shape -- reaches only $7C and would ship half the art.
  const ram = makeRam();
  ram.setU16(SUB + 0x1a, 0x0016);          // heading $16 -> ($16 & $3E) * 4 = $58
  ram.setU8(REC + 0x18, 2);                // aim cadence non-zero: no aim
  run(0x268232, ram);
  assert.equal(ram.u32(SUB + 0x0a), 0x00aa0000 + 0x58,
    'byte offset $58 = entry 22. With `<< 1` it would be $2C = entry 11, and '
    + 'the mech would face the wrong way on 32 of its 64 headings');
  // the MIRROR arm: bit 6 clear in the heading AND $80390B bit 2 set -> +4.
  const ram2 = makeRam();
  ram2.setU8(0x80390b, 0x04);              // `$268312 btst.b #$2,$80390B`
  ram2.setU16(SUB + 0x1a, 0x0016);
  ram2.setU8(REC + 0x18, 2);
  run(0x268232, ram2);
  assert.equal(ram2.u32(SUB + 0x0a), 0x00aa0000 + 0x5c,
    '$26831C addq.w #$4,D1 -- the odd entries are the mirrored halves, and '
    + 'they are the reason the table is 64 and not 32');
});

test('W81/3 -- $10 draws its TURRET from $268694 into the register stub', () => {
  // Not frozen, cadence borrows -> the aim runs -> `$2683BC` stores the turret
  // sprite -> `$2683CE` emits it through ($2E,A5).  `targetSelect` returns
  // CARRY when neither player record has bit 15 set, so the aim short-circuits
  // to the draw and the synthetic ROM is never asked for AimTables.
  const ram = makeRam();
  ram.setU8(REC + 0x18, 2);                // aim cadence non-zero: no aim, so
                                           // the synthetic ROM is never asked
                                           // for AimTables (handlers.test.js's
                                           // own device, and it says why)
  ram.setU32(REC + 0x22, 0x00bb0044);      // the $268694 entry the aim stored
  ram.setU16(SUB + 0x1c, 0x1234);          // the colour word
  run(0x268232, ram);
  assert.equal(ram.u16(B0_COUNT), 24,
    'TWO requests: the body through ($2A,A5) and the turret through ($2E,A5). '
    + 'Both stubs resolve to bucket 0 in this fixture, so the counter is the '
    + 'count');
  assert.equal(ram.u16(B0_BUF + 12 + 4), 0x00bb, 'turret descriptor high');
  assert.equal(ram.u16(B0_BUF + 12 + 6), 0x0044, 'turret descriptor low');
  assert.equal(ram.u16(B0_BUF + 12 + 8), 0x0830,
    '$2683DC move.w #$830,D3 -- type $11 uses $620 here and using one for the '
    + 'other draws the mech at the tank\'s size');
  assert.equal(ram.u16(B0_BUF + 12 + 10), 0x1234, '($1C,A6) is D4');
});

test('W81/4 -- $10 reaches $267FC6, THE FIRE GATE, and it is not a stand-in', () => {
  // W80 §5 called `$267FC6` "a second unported routine nobody has costed".
  // `fireGate267FC6` has existed since W30. The proof it is REACHED and that
  // its RANK inputs are real: `$2680A2[$813092]` is the stage threshold, and
  // moving $813092 alone must move whether the mech fires.
  //
  // Neither player alive -> `playerDist268018` leaves $7FFF, which is >= every
  // threshold, so the gate says FIRE. The fan then runs and $2683EC's own
  // `moveq #$18 / sub.w $8130BC,D0` must have written ($28,A5).
  // $2680A2 is the gate's own threshold table, indexed by $813092. This
  // fixture answers entry 0 with $8000 -- larger than the $7FFF a dead player
  // yields -- so the gate says DO NOT FIRE and the machine returns to the draw
  // before the second aim. Entry 1 is 0, so moving $813092 by one flips it.
  const rom = { ...ROM, u16: (a) => (a === 0x2680a2 ? 0x8000 : ROM.u16(a)) };
  const ram = makeRam({ '0x8130bc': 5 });
  ram.setU8(REC + 0x18, 2);                // no aim before the fan
  ram.setU8(SUB + 0x00, 0x20);             // bit 5 -- the fan gate $2683C2
  ram.setU8(REC + 0x28, 1);                // fire counter -> 0 this frame
  runHandler(0x268232, ram, rom, REC, { tables: TABLES, unported: new UnportedLog() });
  assert.equal(ram.u8(REC + 0x28), (0x18 - 5) & 0xff,
    '$2683EC moveq #$18 / sub.w $8130BC,D0 / move.b D0,($28,A5) -- the RANK '
    + 'word $8130BC is read out of RAM, not invented');
  assert.equal(ram.u16(B0_COUNT), 24, 'it drew and did not fire');
  // AND THE THRESHOLD IS REALLY READ: with $813092 = 1 the gate reads
  // $2680A4, which this fixture answers 0, the gate passes, and the machine
  // walks on into the second aim -- which a synthetic ROM cannot answer. The
  // throw IS the evidence that the branch went the other way.
  const ram2 = makeRam({ '0x8130bc': 5, '0x813092': 1 });
  ram2.setU8(REC + 0x18, 2);
  ram2.setU8(SUB + 0x00, 0x20);
  ram2.setU8(REC + 0x28, 1);
  assert.throws(() => runHandler(0x268232, ram2, rom, REC,
    { tables: TABLES, unported: new UnportedLog() }),
  /rom\.bytes is not a function/,
  '$26808C move.w $813092,D4 / add.w D4,D4 / lea ($2680A2,PC),A0 -- one word '
    + 'of RAM decides whether this enemy fires, and it is the board\'s word');
});

// ===========================================================================
// TYPE $82 -- THE FIGHTER
// ===========================================================================

test('W81/5 -- $82 emits THREE records through THREE DIFFERENT stubs', () => {
  // $8130D2 is tested as a LONG here ($27485E tst.l), and non-zero jumps to
  // $274A22 -- the draw -- past the aim and past the heading block.
  const ram = makeRam({ '0x813098': 0, '0x80390c': 1 });
  ram.setU32(0x8130d2, 1);
  ram.setU32(SUB + 0x0a, 0x0017_35fc);     // the body: $1735FC
  ram.setU16(SUB + 0x0e, (6 << 9) | 88);   // 96 x 88 -- and 88 % 8 == 0
  ram.setU32(REC + 0x28, 0x00151e10);      // the $272DFA entry the init wrote
  run(0x2747c6, ram);
  assert.equal(ram.u16(B7_COUNT), 24,
    'TWO records in BUCKET 7 -- $274A28 jsr $23DBCA (the ZOOMING stub, which '
    + 'resolves to bucket 7 out of the cartridge) and $274A4A jsr $23DF86');
  assert.equal(ram.u16(B3_COUNT), 12,
    'ONE record in the THIRD bucket -- $274A7E jsr $23DF58. Three enqueue '
    + 'sites, three stubs, two buckets: W68 §2.3 named all three and no port '
    + 'had ever made one of the calls');
  assert.equal(ram.u16(B7_BUF + 4), 0x0017, 'body descriptor high ($1735FC)');
  assert.equal(ram.u16(B7_BUF + 6), 0x35fc, 'body descriptor low');
  assert.equal(ram.u16(B7_BUF + 12 + 4), 0x0015, 'heading record high');
  assert.equal(ram.u16(B7_BUF + 12 + 6), 0x1e10, 'heading record low');
  assert.equal(ram.u16(B3_BUF + 4), 0x0017, 'third record is $173810, high');
  assert.equal(ram.u16(B3_BUF + 6), 0x3810, 'third record low');
  assert.equal(ram.u16(B3_BUF + 8), 0x628, '$274A76 move.w #$628,D3');
  assert.equal(ram.u16(B3_BUF + 10), 0x18, '$274A7A move.w #$18,D4');
});

test('W81/6 -- $82\'s THIRD record is RANK-gated, and the art ships anyway', () => {
  // `$274A50 tst.w $813098 / bne $274A84`. A rank-0 single-player run NEVER
  // asks for $173810, which is exactly why harvesting it off a run would miss
  // it and why `tools/export-web.mjs` carries it as an IMMEDIATE.
  const ram = makeRam({ '0x813098': 1, '0x80390c': 1 });
  ram.setU32(0x8130d2, 1);
  ram.setU16(SUB + 0x0e, (6 << 9) | 88);
  run(0x2747c6, ram);
  assert.equal(ram.u16(B7_COUNT), 24, 'the first two records are unconditional');
  assert.equal(ram.u16(B3_COUNT), 0,
    'rank non-zero suppresses the third record entirely');
  // and $80390C is the OTHER gate, independently.
  const ram2 = makeRam({ '0x813098': 0, '0x80390c': 0 });
  ram2.setU32(0x8130d2, 1);
  ram2.setU16(SUB + 0x0e, (6 << 9) | 88);
  run(0x2747c6, ram2);
  assert.equal(ram2.u16(B3_COUNT), 0, '$274A58 tst.w $80390C / beq $274A84');
});

test('W81/7 -- $2749E8 bpl $274A22: no live player means NO re-index, and it still draws', () => {
  // Not frozen and ($26,A5) == 0 so `$2749B4 subq.b / bcc` borrows into the
  // heading block, whose FIRST act is `$24270A` inlined. Neither player record
  // has bit 15 set, so the ROM branches OUT OF THE BLOCK to the draw -- and
  // the port must not have built AimTables or touched ($28,A5) on the way.
  // (W80 §1.1's fall-through trap in the sibling family, read from this side.)
  const ram = makeRam({ '0x813098': 1 });
  ram.setU16(0x8103e6, 0); ram.setU16(0x810448, 0);
  ram.setU32(REC + 0x28, 0xdeadbeef);
  ram.setU16(SUB + 0x02, 0x2000);          // >= $1000, so $274868 does not skip
  run(0x2747c6, ram);
  assert.equal(ram.u32(REC + 0x28) >>> 0, 0xdeadbeef,
    '$2749E8 bpl $274A22 -- with neither player alive the fighter draws with '
    + 'the record it already has and does not re-index the table');
  assert.equal(ram.u16(B7_COUNT), 24, 'and it still DRAWS both bucket-7 records');
});

test('W81/7b -- with a LIVE player, $82 stores $272DFA[(facing & $3E) * 2]', () => {
  // This one needs the CARTRIDGE, because `aim64` is a real computation over
  // five real tables and a synthetic ROM cannot answer it. So: the aim tables
  // come from `player.tables.json`, and ONLY `$272DFA` is answered with the
  // marker -- which is what makes "byte offset = (facing & $3E) * 2" a number
  // instead of a coincidence with the real art.
  const j = JSON.parse(fs.readFileSync(TABLES_FILE, 'utf8'));
  const real = new RomWindows(j.rom);
  const rom = {
    bytes: (a, n) => real.bytes(a, n),
    u8: (a) => (a >= 0x242000 && a < 0x243000 ? real.u8(a) : 0),
    u16: (a) => (WORDS.has(a) ? WORDS.get(a)
      : (a >= 0x242000 && a < 0x243000 ? real.u16(a) : 0)),
    u32: (a) => (a >= H82_HEAD && a < H82_HEAD + 0x80 ? 0x00cc0000 + (a - H82_HEAD)
      : (LONGS.has(a) ? LONGS.get(a)
        : (a >= 0x242000 && a < 0x243000 ? real.u32(a) : 0))),
  };
  const ram = makeRam({ '0x813098': 1 });
  ram.setU16(0x8103e6, 0x8000);            // P1 ALIVE
  ram.setU16(0x8103e8, 0x2000);            // and directly "below" the fighter
  ram.setU16(0x8103ea, 0x0000);
  ram.setU16(SUB + 0x02, 0x2000); ram.setU16(SUB + 0x04, 0x0000);
  ram.setU16(REC + 0x2c, 0);               // stored facing 0
  runHandler(0x2747c6, ram, rom, REC, { tables: TABLES, unported: new UnportedLog() });
  const nf = ram.u16(REC + 0x2c);
  assert.equal(ram.u32(REC + 0x28) >>> 0, 0x00cc0000 + ((nf & 0x3e) * 2),
    '$274A10 andi.w #$3E,D1 / add.w D1,D1 -- 32 entries of 4 bytes, byte '
    + 'offsets 0..$7C. This is the SAME index type $85 uses at $275A18, which '
    + 'is why $272DFA is 32 and why re-harvesting it would duplicate shard 11');
  assert.ok(nf > 0, 'the slew actually moved the facing (0 would prove nothing)');
});

test('W81/8 -- ($16,A5) is a BYTE for type $82 ($2747E2 move.b #$1)', () => {
  // The port wrote it as a WORD, which puts ($16,A5)=0 and ($17,A5)=1 -- two
  // bytes wrong against the board on every live record, and invisible to every
  // gate because the port also READ the word. W80 §1.2 found and fixed the
  // identical defect in $05/$07/$27 and filed $82's "with its wave".
  const ram = makeRam({ '0x813098': 1 });
  ram.setU32(0x8130d2, 1);
  ram.setU16(SUB + 0x0e, (6 << 9) | 88);
  ram.setU16(SUB + 0x02, 0x0000); ram.setU16(SUB + 0x04, 0x0000);  // on screen
  run(0x2747c6, ram);
  assert.equal(ram.u8(REC + 0x16), 1, '($16,A5) is the byte that gets the 1');
  assert.equal(ram.u8(REC + 0x17), 0,
    '($17,A5) MUST STAY ZERO -- a `setU16` here writes the 1 into the wrong '
    + 'byte and clears the right one');
});

// ===========================================================================
// THE ZOOMING FAMILY -- five members, five buckets, and a defect
// ===========================================================================

test('W81/9 -- resolveZoomStub reads the BUCKET out of the cartridge', () => {
  const r = resolveZoomStub(ROM, EMIT_ZOOM);
  assert.equal(r.bucket, 7,
    '$23DBCA is $807450/$80AFC8 = bucket 7, and bucket 7 is where W75 §4.1 '
    + 'measured all 155 of type $82\'s board slot-frames -- two independent '
    + 'derivations of one number');
  assert.equal(BUCKETS[7].buffer, B7_BUF);
  // A routine that merely OPENS the same four opcodes is not a member: the
  // PC-relative lea must resolve to the scale table.
  const impostor = new Map(WORDS);
  impostor.set(EMIT_ZOOM + 2, 0x0100);
  const rom2 = { ...ROM, u16: (a) => impostor.get(a) ?? 0 };
  assert.throws(() => resolveZoomStub(rom2, EMIT_ZOOM),
    (e) => e instanceof Unreached && e.romAddress === EMIT_ZOOM,
    'a stub whose lea does not reach $23E54A is a LOUD NAMED THROW');
});

test('W81/10 -- the LONG-axis zoom scale is `hi & $3E`, i.e. pixels/8', () => {
  // `$23DA16 lsl.w #$2,D0` makes the BYTE offset `(hi & $3E) * 4` into a
  // FOUR-byte table, so the ENTRY is `hi & $3E`.  This file's own `>> 1` said
  // `pixels/16` and nothing could see it, because W11 found no producer for
  // the zooming family at all.  $274A28 is the first.
  //
  // The check is arithmetic, not a transcription: with D6's two flag bytes at
  // $60 and $50, the recentring offsets are (($80-$60) * width/8) and
  // (($80-$50) * height/8) in 1/64 px, added BEFORE `asr.l #6`.
  const ram = new Ram(null);
  for (let i = 0; i < 0x20; i++) ram.setU8(SUB + i, 0);
  ram.setU16(SUB + 0x0e, (6 << 9) | 88);   // 96 x 88 -> hi byte $0C, height 88
  ram.setU32(SUB + 0x02, 0);               // position 0,0; offsets 0
  enqueueZoomedRequest(ram, SUB, 0x60005000, 7);
  const longAdj = (0x80 - 0x60) * (0x0c);  // hi & $3E == 12 == 96/8
  const shortAdj = (0x80 - 0x50) * (88 / 8);
  const packed = ((((longAdj & 0xffff) << 16) | (shortAdj & 0xffff)) | 0) >> 6;
  const want = ((packed & 0x07ff03ff) | 0x60005000) >>> 0;
  assert.equal(ram.u16(B7_BUF + 0), (want >>> 16) & 0xffff,
    'the LONG axis. With the old `>> 1` this is (0x20 * 6) instead of '
    + '(0x20 * 12) -- a 3-pixel error on a 96x88 sprite');
  assert.equal(ram.u16(B7_BUF + 2), want & 0xffff, 'the SHORT axis, unchanged');
  void u16;
});
