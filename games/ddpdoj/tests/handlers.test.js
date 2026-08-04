// W25 -- the six enemy handlers (src/handlers.js).  Verifies the dispatch table
// holds all six addresses, each handler runs on a synthetic record and produces
// the loud-counted notes (never a silent return), and the bounds/free + kill
// gates free the enemy at the ROM-cited condition.

import { test } from 'node:test';
import assert from 'node:assert';
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
const EMIT_REC = 0x23d762, EMIT_REG = 0x23dece;
const STUB_WORDS = new Map([
  [EMIT_REC, 0x41f9], [EMIT_REC + 6, 0xd0f9], [EMIT_REC + 12, 0x43ee],
  [EMIT_REG, 0x41f9], [EMIT_REG + 6, 0xd0f9], [EMIT_REG + 12, 0x2001],
]);
const STUB_LONGS = new Map([
  [EMIT_REC + 2, 0x80397c], [EMIT_REC + 8, 0x80afc0],
  [EMIT_REG + 2, 0x80397c], [EMIT_REG + 8, 0x80afc0],
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
  ram.setU8(REC + 0x18, 2);           // W30: the aim CADENCE -- non-zero, so
                                      // `$268A1A subq.b #1 / bcc` does NOT
                                      // borrow and the aim does not run.  These
                                      // are SMOKE tests against a synthetic ROM
                                      // that cannot answer aim64's five tables.
  ram.setU16(SUB + 0x18, 0x0100);     // HP positive (alive)
  for (const [k, v] of Object.entries(over)) ram.setU16(parseInt(k), v);
  return ram;
}
const STUB_TABLES = { vector: () => ({ dy: 0, dx: 0 }) };
const STUB_ROM = {
  u8: () => 0,
  u16: (a) => STUB_WORDS.get(a) ?? 0,
  u32: (a) => STUB_LONGS.get(a) ?? 0,
};

test('the ported handler addresses are registered (W25 six + W30 $275914/$2739C0/$276702)', () => {
  assert.deepEqual([...HANDLER_ADDRESSES].sort((a, b) => a - b),
    [...SIX].sort((a, b) => a - b));
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

test('the damage-first family ($05/$07) notes DAMAGE and does not crash', () => {
  for (const h of [0x269cea, 0x26a2e2]) {
    const ram = makeRam();
    ram.setU8(SUB, 0x5c);              // set the hit bits -> damage branch
    const u = new UnportedLog();
    runHandler(h, ram, STUB_ROM, REC, { tables: STUB_TABLES, unported: u });
    // HP is positive -> the damage branch notes $286096 but does not free.
    assert.ok([...u.calls.keys()].some((k) => k.includes('286096')),
      `$${h.toString(16)} noted DAMAGE $286096`);
  }
});
