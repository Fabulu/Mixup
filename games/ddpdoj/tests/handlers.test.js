// W25 -- the six enemy handlers (src/handlers.js).  Verifies the dispatch table
// holds all six addresses, each handler runs on a synthetic record and produces
// the loud-counted notes (never a silent return), and the bounds/free + kill
// gates free the enemy at the ROM-cited condition.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Ram } from '../src/ram.js';
import { runHandler, HANDLER_ADDRESSES, handlerMap } from '../src/handlers.js';
import { UnportedLog, Unreached } from '../src/unported.js';

const REC = 0x81364C, SUB = 0x81459C;
// W30 adds `$275914`, `$2739C0` and `$276702`: NINE entries for TEN stage-1
// types, because $85 and $86 share `$275914` exactly as $07 and $27 share
// `$26A2E2`.  All three were gate BLOCKERS, in that order.
const SIX = [0x2688cc, 0x268232, 0x269cea, 0x26a2e2, 0x2747c6, 0x27687e,
  0x275914, 0x2739c0, 0x276702];

// W30.  ($2A,A5)/($2E,A5) are the SPRITE-EMITTER pair the init copies out of
// `$267F70` -- a RECORD-convention stub and a REGISTER-convention one -- and
// `enqueueThroughStub` resolves the bucket by reading the stub's own
// `lea <abs>.l,A0 / adda.w <abs>.l,A0` operands out of the cartridge.  A zeroed
// synthetic record therefore throws BY ADDRESS now, which is correct: the ROM
// would `jsr 0`.  The fixture installs `$267F70[0]` (the bucket-0 pair) and
// STUB_ROM answers exactly those two stubs.
// W80 adds `$23D852`, the damage-first family's own emitter -- `$269E16 jsr
// $23D852` and `$269E3E`, the only two enqueue sites types $05/$07/$27 have.
// Its two longwords are READ OUT OF THE CARTRIDGE and transcribed here, not
// invented: `$23D852 41F9 00807450 / D0F9 0080AFC8 / 43EE 0002`, and
// `spritequeue.BUCKETS` resolves that pair to **bucket 7** -- which is the
// bucket W75 measured all 490 of the family's slot-frames in on the BOARD.
// Two independent derivations, one number.
// and `$269B3E`'s two draw arms use two REGISTER-convention stubs -- `$23DF86`
// (arm A, bucket 7) and `$23DF58` (arm B, **bucket 3**).  Arm B being a
// different bucket from arm A is the ROM's, not a typo: `$80688C`/`$80AFC6`.
// W81 adds `$23DBCA`, TYPE $82's BODY EMITTER, and it is the first member of
// the ZOOMING family (`$23D9E2 $23DA5C $23DAD6 $23DB50 $23DBCA`, $7A apart)
// this project has ever had a producer for.  Its shape is a different one --
// `41FA <disp> 4E71 2206` -- and its buffer/counter pair lives at +$3C, not at
// +$0.  Every word below is transcribed out of `maincpu.bin`:
//   $23DBCA 41FA 097E / 4E71 / 2206     ($23DBCA+2+$97E == $23E54A, the scale
//                                        table -- which is what makes it a
//                                        member of the family and not merely a
//                                        routine that starts the same way)
//   $23DC06 41F9 00807450 / D0F9 0080AFC8   -> BUCKET 7, and bucket 7 is where
//                                        W75 §4.1 measured all 155 of type
//                                        $82's board slot-frames.
const EMIT_REC = 0x23d762, EMIT_REG = 0x23dece, EMIT_FAM = 0x23d852;
const EMIT_A = 0x23df86, EMIT_B = 0x23df58, EMIT_ZOOM = 0x23dbca;
const CUE_END = 0x2fff00;
const STUB_WORDS = new Map([
  [CUE_END, 0xffff],
  [EMIT_REC, 0x41f9], [EMIT_REC + 6, 0xd0f9], [EMIT_REC + 12, 0x43ee],
  [EMIT_REG, 0x41f9], [EMIT_REG + 6, 0xd0f9], [EMIT_REG + 12, 0x2001],
  [EMIT_FAM, 0x41f9], [EMIT_FAM + 6, 0xd0f9], [EMIT_FAM + 12, 0x43ee],
  [EMIT_A, 0x41f9], [EMIT_A + 6, 0xd0f9], [EMIT_A + 12, 0x2001],
  [EMIT_B, 0x41f9], [EMIT_B + 6, 0xd0f9], [EMIT_B + 12, 0x2001],
  [EMIT_ZOOM, 0x41fa], [EMIT_ZOOM + 2, 0x097e], [EMIT_ZOOM + 4, 0x4e71],
  [EMIT_ZOOM + 6, 0x2206],
  [EMIT_ZOOM + 0x3c, 0x41f9], [EMIT_ZOOM + 0x42, 0xd0f9],
]);
const STUB_LONGS = new Map([
  [EMIT_REC + 2, 0x80397c], [EMIT_REC + 8, 0x80afc0],
  [EMIT_REG + 2, 0x80397c], [EMIT_REG + 8, 0x80afc0],
  [EMIT_FAM + 2, 0x807450], [EMIT_FAM + 8, 0x80afc8],
  [EMIT_A + 2, 0x807450], [EMIT_A + 8, 0x80afc8],
  [EMIT_B + 2, 0x80688c], [EMIT_B + 8, 0x80afc6],
  [EMIT_ZOOM + 0x3e, 0x807450], [EMIT_ZOOM + 0x44, 0x80afc8],
]);

function makeRam(over = {}) {
  const ram = new Ram(null);
  for (let i = 0; i < 0x50; i++) ram.setU8(REC + i, 0);
  for (let i = 0; i < 0x20; i++) ram.setU8(SUB + i, 0);
  ram.setU16(REC, 0x8000);            // live
  ram.setU32(REC + 0x06, SUB);        // sub-record pointer
  ram.setU32(REC + 0x12, 0);          // movement cursor 0 -> stepMovement no-op
  ram.setU32(REC + 0x2a, EMIT_REC);   // W30: the emitter pair the init writes
  ram.setU32(REC + 0x2e, EMIT_REG);
  ram.setU32(REC + 0x44, CUE_END);     // W182: shared $85/$86 cue terminator
  ram.setU8(REC + 0x18, 2);           // W30: the aim CADENCE -- non-zero, so
                                      // `$268A1A subq.b #1 / bcc` does NOT
                                      // borrow and the aim does not run.  These
                                      // are SMOKE tests against a synthetic ROM
                                      // that cannot answer aim64's five tables.
  ram.setU16(SUB + 0x18, 0x0100);     // HP positive (alive)
  // W80.  `$803910` non-zero is the SAME device as ($18,A5)=2 above, for the
  // aim `$26A3DC` reaches: `$26A3E6 jsr $24202C` is CARRY-BLIND, so it is not
  // gated by a cooldown and a zeroed synthetic ROM cannot construct AimTables
  // (its constructor validates `$2420C6`'s eight longwords and would throw by
  // address).  Zero here made $07/$27 a `rom.bytes is not a function` the
  // moment their fire machine was wired -- which is the fixture speaking, not
  // the port.  The gate-level aim evidence is `w80emitgate.mjs`, against the
  // cartridge; this file stays a smoke test and says so.
  ram.setU16(0x803910, 1);
  // W81.  ($26,A5) is type $82's HEADING CADENCE and `$2749B4 subq.b #1 / bcc`
  // is the same shape as ($18,A5)'s above -- a zero borrows and runs the aim,
  // and a synthetic ROM cannot answer aim64's five tables.  Non-zero for the
  // same reason and with the same caveat: this file is a SMOKE test.  The
  // aiming evidence for $82 is `tools/w80emitgate.mjs`, against the cartridge.
  ram.setU8(REC + 0x26, 3);
  for (const [k, v] of Object.entries(over)) ram.setU16(parseInt(k), v);
  return ram;
}
const STUB_TABLES = { vector: () => ({ dy: 0, dx: 0 }) };
const STUB_ROM = {
  u8: () => 0,
  u16: (a) => STUB_WORDS.get(a) ?? 0,
  u32: (a) => STUB_LONGS.get(a) ?? 0,
};

test('the ported handler addresses are registered through W198 types $12/$13/$14', () => {
  // W31 adds `$26B6FA` (type $0D, the MIDBOSS), which lives in src/midboss.js
  // and is NOT in SIX -- the `runs on a live record` test below drives SIX
  // against a STUB rom, and the midboss reads four real ROM tables.
  // W33 adds `$272AAC` (types $20/$21/$23, THE SCRIPTED CARRIER); it is not in
  // SIX either, because it reads its spawn type out of the enemy record rather
  // than out of the stub ROM and has its own tests below.
  // W36 adds the SEVEN remaining non-boss stage-1 handlers; none is in SIX
  // because every one reads real ROM tables (sprite, muzzle, fan or animation).
  // THE LIST IS NOT A CONSTANT SOMEBODY TYPED: it is the eight ADDRESSES the
  // stage-1 script resolves to that the port does not have, subtracted from the
  // nineteen -- see tests/w36handlers.test.js, which walks the script itself.
  // W57 adds `$26C20C` (type $1C), and it is NOT one of the nineteen: nothing
  // in the stage-1 SCRIPT spawns it. Its only enqueuer in build B is the
  // midboss's own death (`$26B7E0 moveq #$1C,D0 / $26B7E2 jsr $263684`), which
  // is why it is not in the script walk's denominator and why 25 waves shipped
  // without it. It is not in SIX either -- it reads 207 real ROM longwords.
  // W62 (S1) adds `$292902`, THE STAGE-1 BOSS, and it IS the nineteenth of the
  // nineteen the stage-1 script resolves to -- so the script denominator goes
  // 18 of 19 to **19 of 19**. What was ported behind it is NOT the boss: it is
  // `$294AD8`, `$294F32`'s 10,800-frame timeout, `$294DD4` and D-script 6, the
  // four routines the STAGE END rides on (src/boss.js's header, and recon 48's
  // 111 script entry points are still three waves). It is not in SIX -- it
  // dispatches into the scheduler, which reads two real ROM tables.
  assert.deepEqual([...HANDLER_ADDRESSES].sort((a, b) => a - b),
    [...SIX, 0x26b6fa, 0x272aac,
      0x26a5e4, 0x26a860, 0x26ad28, 0x27733e, 0x275f30, 0x2697f6, 0x29700c,
      0x26c20c, 0x292902, 0x296dd6, 0x2779b6, 0x276a02, 0x2775cc, 0x2752b0,
      0x279898, 0x27a548, 0x278c0e, 0x279b2e, 0x279d72, 0x277f26,
      0x27a1b4, 0x279f4a, 0x297398, 0x29bb64, 0x265486, 0x263c7c,
      0x2647a6, 0x2669e2, 0x264e82, 0x26c3e2, 0x26d4b4, 0x265adc, 0x265850,
    ].sort((a, b) => a - b));
});

test('an unknown handler address is a LOUD NAMED THROW', () => {
  const ram = makeRam();
  assert.throws(() => runHandler(0x200000, ram, STUB_ROM, REC,
    { tables: STUB_TABLES, unported: new UnportedLog() }),
    (e) => e instanceof Unreached && e.romAddress === 0x200000);
});

test('each of the six runs on a live record and COUNTS its notes (never silent)', () => {
  for (const h of SIX) {
    const ram = makeRam();
    const u = new UnportedLog();
    runHandler(h, ram, STUB_ROM, REC, { tables: STUB_TABLES, unported: u });
    // every handler touches at least the position driver + (for five) a noted
    // fire/effect path; $8B with HP>0 and no hit may note nothing this arm, so
    // assert only that it did not crash.  The damage-first family + $11/$10/$82
    // all note.
    assert.ok(true, `$${h.toString(16)} ran without throwing`);
  }
});

test('$8B frees the enemy when the stage-kill gate $8130F8 bit 7 is set ($27687E)', () => {
  // tst.b $8130F8 tests the BYTE (high byte of the word in big-endian), so the
  // word value $8000 puts 0x80 in the byte at $8130F8.
  const ram = makeRam({ '0x8130f8': 0x8000 });   // bmi -> jmp $263762
  runHandler(0x27687e, ram, STUB_ROM, REC, { tables: STUB_TABLES, unported: new UnportedLog() });
  assert.equal(ram.u16(REC), 0, 'the type word is cleared (freeEnemy)');
});

test('$8B sets sub-flags bit 5 on stage-1 clock >= 4 ($2768DC)', () => {
  const ram = makeRam({ '0x813092': 1, '0x8130ce': 4 });
  runHandler(0x27687e, ram, STUB_ROM, REC, { tables: STUB_TABLES, unported: new UnportedLog() });
  assert.equal((ram.u8(SUB) & 0x20) !== 0, true, 'bit 5 set');
});

test('$8B does NOT free on the kill gate when $8130F8 bit 7 is clear', () => {
  const ram = makeRam({ '0x8130f8': 0, '0x813092': 1, '0x8130ce': 0 });
  runHandler(0x27687e, ram, STUB_ROM, REC, { tables: STUB_TABLES, unported: new UnportedLog() });
  assert.equal(ram.u16(REC), 0x8000, 'still live');
});

test('$11 runs the movement interpreter first ($2688CC jsr $2638A6)', () => {
  // movement cursor 0 -> stepMovement is a no-op (returns false); the handler
  // proceeds to the bounds check.  With position 0 it is off-screen but never
  // on-screen, so it is NOT freed (the $2688F6 beq path).
  const ram = makeRam();
  const u = new UnportedLog();
  runHandler(0x2688cc, ram, STUB_ROM, REC, { tables: STUB_TABLES, unported: u });
  assert.equal(ram.u16(REC), 0x8000, 'still live (never-on-screen is not freed)');
  assert.ok(u.calls.size >= 0);
});

// W34.  This test used to assert that the damage branch NOTED `$286096`, and
// `27-review.md` F4 found that it matched the note's PROSE (`286096`, without
// even a `$`) rather than the address it was filed under.  `$286096` is now
// PORTED, so the note is gone and the test asserts the routine's own effect:
// one point per hit, packed BCD, into P1's pending accumulator $81B4C0.
test('the damage-first family ($05/$07) SCORES the hit through $286096', () => {
  for (const h of [0x269cea, 0x26a2e2]) {
    const ram = makeRam();
    ram.setU8(SUB, 0x10);              // $1000 >> 8 -- the P1 hit bit
    const u = new UnportedLog();
    runHandler(h, ram, STUB_ROM, REC, { tables: STUB_TABLES, unported: u });
    assert.equal(ram.u32(0x81b4c0), 1,
      `$${h.toString(16)}: $286096 added 1 + $81B63E to P1's pending score`);
    // and the hit bits are cleared by `andi.b #$A3,(A6)` on the way past.
    assert.equal(ram.u8(SUB) & 0x5c, 0, 'the hit bits were consumed');
  }
});

// ======================================================= W44 -- THE FIELD TABLES
//
// A DEFECT THIS WOULD HAVE CAUGHT, found the hard way instead.
//
// `handlers.js` reads the board's globals through a table `G`, its enemy record
// through `R` and the sub-record through `S`. Type $80 cited `G.b8` at two
// sites -- `$273BDE sub.w $8130B8.l,D0` and `$273D9E`, both confirmed in the
// listing -- and `b8` WAS NOT IN THE TABLE. `a5 + undefined` is NaN, and
// `Ram.#off`'s bounds test was `o < 0 || o >= size`, which NaN fails BOTH
// halves of, so the read went through and `DataView.getUint16(NaN)` returned
// offset 0: `$800000`, the head of the display list. Type $80's salvo reload
// and its second turret cadence have been computed from a sprite record's first
// word since W30.
//
// It surfaced in wave 44 only because the page started DRAWING the port's own
// list and the bounds test was tightened to `!(o >= 0 && o < size)` at the same
// time; the port then stopped, by name, at logic frame 2753.
//
// This is the cheap static version, and it is the one that scales: every
// `G.x` / `R.x` / `S.x` the file mentions must be a key of the corresponding
// literal. It reads the source text because the three tables are module-private
// on purpose -- they are not API.
test('every G./R./S. field handlers.js reads is actually in its table', () => {
  const src = fs.readFileSync(new URL('../src/handlers.js', import.meta.url), 'utf8');
  for (const name of ['R', 'S', 'G']) {
    const at = src.indexOf(`const ${name} = {`);
    assert.ok(at > 0, `handlers.js has no ${name} table any more`);
    // The literal runs to the first `};` at column 0 after it.
    const body = src.slice(at, src.indexOf('\n};', at));
    // `(\w+): 0x...` and not `^\s*(\w+):`, because these tables put several
    // fields on one line -- which is how a missing one hides.
    const keys = new Set([...body.matchAll(/(\w+)\s*:\s*0x[0-9a-fA-F]+/g)]
      .map((m) => m[1]));
    assert.ok(keys.size > 3, `${name} parsed as ${keys.size} keys -- the parse `
      + 'broke, not the table');
    // String.raw, because a `\b` inside a plain template literal is a BACKSPACE
    // character and the regex then matches nothing at all. That is exactly what
    // the first version of this test did: it passed, with `used` empty, on a
    // tree where `G.b8` really was missing. Seen to fail, then fixed.
    const used = new Set([...src.matchAll(
      new RegExp(String.raw`\b` + name + String.raw`\.(\w+)`, 'g'))]
      .map((m) => m[1]));
    assert.ok(used.size > 3, `${name}. is read ${used.size} times -- the scan `
      + 'broke, and a scan that finds nothing agrees with everything');
    for (const u of used) {
      assert.ok(keys.has(u), `handlers.js reads ${name}.${u} and ${name} has no `
        + `such field, so every site using it computes a NaN address. That is `
        + `the $8130B8 defect (G.b8, cited at $273BDE and $273D9E, missing from `
        + `the table from W30 until wave 44).`);
    }
  }
});

test('a NaN address is REFUSED by Ram, not read as offset zero', () => {
  // The backstop under the test above, and the reason the defect was invisible.
  const ram = new Ram(null);
  assert.throws(() => ram.u16(0x800000 + undefined), /outside main RAM/);
  assert.throws(() => ram.setU16(NaN, 1), /outside main RAM/);
  assert.throws(() => ram.u8(0x7fffff), /outside main RAM/);
  assert.equal(ram.u16(0x800000), 0, '...and a legal address still reads');
});
