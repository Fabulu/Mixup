// W33 -- the SUB-RECORD REAPER (`$28AD54`, type-5 call #3) and the SCRIPTED
// CARRIER (`$272AAC` + its init body `$272A4A`, types $20/$21/$23).
//
// The reaper is the wave's real defect fix: `$263762` marks a freed sub-record
// with a ONE and only `$28AD54` turns that into the ZERO the allocator
// (`$2635D8 tst.b (A6) / beq`) accepts.  Nothing performed that transition, so
// the 150-slot pool filled permanently -- MEASURED at 100 of 100 common slots
// from lf2906 of the fly-around replay with fifteen enemies alive -- and every
// spawn after that was SILENTLY dropped.  The three states are asserted
// separately here, because the bug was that two of them were conflated.

import { test } from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { reapSubRecords, SUB_REAPER, SPAWN, allocSubRecord } from '../src/spawn.js';
import { runHandler } from '../src/handlers.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { freeEnemy } from '../src/initbody.js';

const REC = 0x81364c, SUB = SPAWN.SUB_COMMON;

// ===========================================================================
// $28AD54 -- the reaper
// ===========================================================================

test('$28AD54 zeroes DYING slots, leaves ALIVE and already-FREE ones alone', () => {
  const ram = new Ram(null);
  // Three slots, one in each state.  The values are DIFFERENT on purpose: a
  // reaper that cleared everything, or nothing, would pass a fixture in which
  // "alive" and "dying" looked the same.
  ram.setU16(SUB + 0 * 0x20, 0x0000);   // already FREE
  ram.setU16(SUB + 1 * 0x20, 0x8123);   // ALIVE (byte 0 negative)
  ram.setU16(SUB + 2 * 0x20, 0x0100);   // DYING -- what $263762 leaves behind
  ram.setU16(SUB + 3 * 0x20, 0x017f);   // DYING, with a non-zero SECOND byte
  const n = reapSubRecords(ram);
  assert.equal(n, 2, 'exactly the two dying slots were reaped');
  assert.equal(ram.u16(SUB + 0 * 0x20), 0x0000);
  assert.equal(ram.u16(SUB + 1 * 0x20), 0x8123, 'an ALIVE slot is untouched');
  assert.equal(ram.u16(SUB + 2 * 0x20), 0x0000);
  // `$28AD66 move.w D1,(A0)` is a WORD write, so byte 1 goes too.  A byte
  // write would leave $007F here and this assertion is the only thing that
  // distinguishes the two.
  assert.equal(ram.u16(SUB + 3 * 0x20), 0x0000,
    '$28AD66 is move.w, not move.b -- the second byte is cleared as well');
});

test('$28AD54 walks 150 slots -- BOTH pools, because they are contiguous', () => {
  // The reaper's `move.w #$95,D0` is 150 and its `lea` is the COMMON pool's
  // base, so it runs off the end of the 100-slot common pool and into the
  // 50-slot special pool.  That is only correct because the two are adjacent,
  // which is asserted here from the two independently-derived constants rather
  // than from the reaper's own count.
  assert.equal(SPAWN.SUB_COMMON + SPAWN.SUB_COMMON_COUNT * SPAWN.SUB_STRIDE,
    SPAWN.SUB_SPECIAL, 'the special pool begins where the common pool ends');
  assert.equal(SUB_REAPER.slots,
    SPAWN.SUB_COMMON_COUNT + SPAWN.SUB_SPECIAL_COUNT,
    '$28AD54 move.w #$95,D0 + dbra == 150 == 100 + 50');
  const ram = new Ram(null);
  const last = SPAWN.SUB_SPECIAL + (SPAWN.SUB_SPECIAL_COUNT - 1) * 0x20;
  const past = SPAWN.SUB_SPECIAL + SPAWN.SUB_SPECIAL_COUNT * 0x20;
  ram.setU16(last, 0x0100);
  ram.setU16(past, 0x0100);
  assert.equal(reapSubRecords(ram), 1);
  assert.equal(ram.u16(last), 0, 'the LAST special slot is inside the walk');
  assert.equal(ram.u16(past), 0x0100, 'and the word past it is NOT');
});

test('free -> reap -> allocate is the whole cycle, and the reap is REQUIRED', () => {
  // The regression in one test.  Fill the common pool, free one enemy, and
  // show that the slot is NOT reusable until the reaper has run.
  const ram = new Ram(null);
  for (let i = 0; i < SPAWN.SUB_COMMON_COUNT; i++) ram.setU16(SUB + i * 0x20, 0x8000);
  assert.equal(allocSubRecord(ram, 0x01, 0), null, 'the pool is full');
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB + 5 * 0x20);
  ram.setU16(REC + 0x04, 0);                   // run length 0 -> one slot
  freeEnemy(ram, REC);                         // $263762
  assert.equal(ram.u8(SUB + 5 * 0x20), 1,
    '$26376C move.b D0,(A6) with D0 = 1 -- DYING, not free');
  assert.equal(allocSubRecord(ram, 0x01, 0), null,
    'and the allocator still refuses it, because $2635D8 tests for ZERO');
  reapSubRecords(ram);                         // $28AD54, type-5 call #3
  assert.equal(allocSubRecord(ram, 0x01, 0), SUB + 5 * 0x20,
    'only after the reaper does the slot come back');
});

// ===========================================================================
// $272A4A -- the carrier's init body
// ===========================================================================

// A synthetic movement stream: position, then three param words whose LOW
// BYTES are the type, the salvo and the cooldown.  The high bytes are junk on
// purpose -- `$272A66 and.w (A0)+,D0` masks with $00FF and a port that took
// the whole word would fail here.
const STREAM = 0x231900;
function streamRom(words) {
  const m = new Map(words.map((w, i) => [STREAM + 4 + i * 2, w]));
  return {
    u8: () => 0,
    u16: (a) => m.get(a) ?? 0,
    u32: (a) => (a === STREAM ? 0x40001c00 : 0),
  };
}
function carrierRam() {
  const ram = new Ram(null);
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(REC + 0x12, STREAM);
  return ram;
}

test('$272A4A reads type/salvo/cooldown out of the movement stream, LOW BYTE only', () => {
  const ram = carrierRam();
  const rom = streamRom([0xff11, 0xaa07, 0xbb30]);
  runInitBodyAddr(0x272A4A, ram, rom, REC, new UnportedLog(), null);
  assert.equal(ram.u32(SUB + 0x02), 0x40001c00, '$272A5A move.l (A0)+,($2,A6)');
  assert.equal(ram.u16(REC + 0x16), 0x0011, 'the TYPE it will spawn');
  assert.equal(ram.u16(REC + 0x18), 0x0007, 'the salvo count');
  assert.equal(ram.u16(REC + 0x1a), 0x0030, 'the cooldown');
  // The three stores are WORDS of byte-sized values, so the HIGH byte of each
  // pair is 0 and the LOW byte carries the value.  The handler reads ($1B,A5)
  // and ($19,A5) -- the low halves -- so this split is load-bearing.
  assert.equal(ram.u8(REC + 0x1a), 0x00, '($1A,A5) is the high half: zero');
  assert.equal(ram.u8(REC + 0x1b), 0x30, '($1B,A5) is the RELOAD the handler uses');
  assert.equal(ram.u32(REC + 0x12), STREAM + 4 + 6,
    '$272A8A move.l A0,($12,A5) -- the stream pointer is CONSUMED');
  assert.equal(ram.u16(SUB + 0x08), 0, 'no escape word, so ($8,A6) stays 0');
});

test('$272A68 the ESCAPE: a param-1 of 2 sets ($8,A6) and the type is the NEXT word', () => {
  const ram = carrierRam();
  const rom = streamRom([0x0002, 0xff10, 0xaa03, 0xbb20]);
  runInitBodyAddr(0x272A4A, ram, rom, REC, new UnportedLog(), null);
  assert.equal(ram.u16(SUB + 0x08), 1,
    '$272A6E move.w #$1,($8,A6) -- the handler will SKIP scrollCompensate');
  assert.equal(ram.u16(REC + 0x16), 0x0010, 'the type came from the SECOND word');
  assert.equal(ram.u16(REC + 0x18), 0x0003);
  assert.equal(ram.u16(REC + 0x1a), 0x0020);
  assert.equal(ram.u32(REC + 0x12), STREAM + 4 + 8, 'FOUR words consumed, not three');
});

// ===========================================================================
// $272AAC -- the carrier's handler
// ===========================================================================

const CTX = { tables: { vector: () => ({ dy: 0, dx: 0 }) }, unported: new UnportedLog() };
const NO_ROM = { u8: () => 0, u16: () => 0, u32: () => 0 };

/** A live carrier, on screen, with the cooldown about to borrow. */
function liveCarrier({ cooldown = 0, salvo = 0, salvoCtr = 0 } = {}) {
  const ram = new Ram(null);
  ram.setU16(REC, 0x8000);
  ram.setU32(REC + 0x06, SUB);
  ram.setU8(REC + 0x0d, 0x01);              // the class byte -> the queue's D1
  ram.setU32(REC + 0x12, 0x00231900);       // the (consumed) stream pointer
  ram.setU16(REC + 0x16, 0x0011);           // spawn type $11
  ram.setU16(REC + 0x18, salvo);
  ram.setU8(REC + 0x19, salvoCtr);
  ram.setU8(REC + 0x1a, cooldown);
  ram.setU8(REC + 0x1b, 0x30);              // the reload
  // ($2,A6): axis A (high) inside ($3800,$B800) after +$4000, axis B (low)
  // such that lo + $9000 does not carry.
  ram.setU32(SUB + 0x02, 0x30001000);
  ram.setU16(SUB + 0x06, 1);                // already seen on screen
  ram.setU16(SUB + 0x08, 1);                // do not scroll-compensate
  return ram;
}

test('$272AAC fires NO bullet and enqueues ONE deferred spawn of ($16,A5)', () => {
  const ram = liveCarrier({ cooldown: 0 });
  runHandler(0x272aac, ram, NO_ROM, REC, CTX);
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE, 'exactly one entry');
  const q = SPAWN.DEFQ_BASE;
  assert.equal(ram.u16(q + 0x02) & 0xff, 0x11, 'the queued TYPE is ($16,A5)');
  assert.equal(ram.u8(q + 0x02) & 0x40, 0x40,
    '$272B34 bset.b #$6,($2,A0) -- the HIGH byte of the type word');
  assert.equal(ram.u16(q + 0x04), 0x01,
    '$263690 takes the CALLER\'s D1, which $272B1E loaded from ($D,A5)');
  assert.equal(ram.u32(q + 0x12), 0x00231900, '$272B28 ($12,A5) -> queue +$12');
  assert.equal(ram.u32(q + 0x48), 0x30001000, '$272B2E ($2,A6) -> queue +$48');
  assert.equal(ram.u8(REC + 0x1a), 0x30, '$272B12 reloaded from ($1B,A5)');
});

test('$272B0C is an 8-bit BORROW: a non-zero cooldown spawns NOTHING', () => {
  const ram = liveCarrier({ cooldown: 1 });
  runHandler(0x272aac, ram, NO_ROM, REC, CTX);
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), 0, 'no spawn on the frame it reaches 0');
  assert.equal(ram.u8(REC + 0x1a), 0, 'it decremented to zero');
  runHandler(0x272aac, ram, NO_ROM, REC, CTX);
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE,
    'and spawns on the NEXT frame, when subq.b borrows -- `bcc`, not `bne`');
});

test('$272B44 the salvo counter running out frees the enemy, at $272AF6', () => {
  // ($19,A5) == 1 makes THIS spawn the last one.
  const ram = liveCarrier({ cooldown: 0, salvo: 0, salvoCtr: 1 });
  runHandler(0x272aac, ram, NO_ROM, REC, CTX);
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), SPAWN.DEFQ_STRIDE, 'it still spawned');
  assert.equal(ram.u16(REC), 0, '$263762 cleared the record');
  assert.equal(ram.u8(SUB), 1, 'and marked its sub-record DYING');
});

test('a ZERO salvo word means spawn forever -- and ($18,A5) IS ($19,A5)', () => {
  // `$272B3A tst.w ($18,A5)` reads the WHOLE WORD, and the init wrote that word
  // as `move.w D1,($18,A5)` with D1 masked to a byte -- so ($18,A5) is always 0
  // and the word's value IS the counter byte at ($19,A5).  A port that tested
  // only ($18,A5) as a byte would arm the salvo never; one that tested ($19,A5)
  // alone would behave the same here and differ if anything ever wrote the high
  // byte.  This asserts the aliasing out loud so the next reader does not have
  // to re-derive it.
  const ram = liveCarrier({ cooldown: 0, salvo: 0, salvoCtr: 0 });
  assert.equal(ram.u16(REC + 0x18), 0, 'the fixture really is a zero WORD');
  runHandler(0x272aac, ram, NO_ROM, REC, CTX);
  assert.equal(ram.u16(REC), 0x8000, '$272B3E beq -- still alive');
  assert.equal(ram.u8(REC + 0x19), 0, 'and the counter was never decremented');
  // The other half of the aliasing: a counter of 1 makes the WORD non-zero, so
  // the same fixture with salvoCtr = 1 takes the armed arm and dies.
  const armed = liveCarrier({ cooldown: 0, salvo: 0, salvoCtr: 1 });
  assert.equal(armed.u16(REC + 0x18), 1);
  runHandler(0x272aac, armed, NO_ROM, REC, CTX);
  assert.equal(armed.u16(REC), 0, 'the counter reached zero and $272B44 freed it');
});

test('$272ABA the bounds test frees only an enemy that HAS been on screen', () => {
  // Axis A below the $3800 floor: `cmpi.l #$3800,D1 / ble` -> off screen.
  const seen = liveCarrier({ cooldown: 0 });
  seen.setU32(SUB + 0x02, 0x00001000);          // +$4000 = $4000... still inside
  seen.setU32(SUB + 0x02, 0xF0001000);          // ext.l of $F000 is negative
  runHandler(0x272aac, seen, NO_ROM, REC, CTX);
  assert.equal(seen.u16(REC), 0, 'off screen AND ($6,A6) != 0 -> freed');

  const unseen = liveCarrier({ cooldown: 0 });
  unseen.setU32(SUB + 0x02, 0xF0001000);
  unseen.setU16(SUB + 0x06, 0);                 // never been on screen
  runHandler(0x272aac, unseen, NO_ROM, REC, CTX);
  assert.equal(unseen.u16(REC), 0x8000, 'off screen but ($6,A6) == 0 -> lives');
  assert.equal(unseen.u16(SUB + 0x06), 0, 'and $272AFE was NOT reached');
});

test('$272AAC tst.w ($8,A6) / bne -- ($8,A6) == 0 is the arm that COMPENSATES', () => {
  // The first mutation of this handler that my own checks could not catch: the
  // sense of `$272AAC tst.w ($8,A6) / bne $272ABA`.  Every other test drives it
  // with a zero scroll accumulator, so `scrollCompensate` moved nothing and
  // running it or not looked identical.  `$2417A8 move.l $80B03C,D0 / swap /
  // add.w D0,($2,A6)` adds the HIGH word of $80B03C to the sub-record's axis-A
  // position, so a non-zero $80B03C makes the two arms observable.
  for (const [flag, expect] of [[0, 0x3040], [1, 0x3000]]) {
    const ram = liveCarrier({ cooldown: 0x7f });   // no spawn; isolate the head
    ram.setU16(SUB + 0x08, flag);
    ram.setU32(0x80b03c, 0x00400000);              // high word $0040
    runHandler(0x272aac, ram, NO_ROM, REC, CTX);
    assert.equal(ram.u16(SUB + 0x02), expect,
      `($8,A6) = ${flag}: scrollCompensate ${flag === 0 ? 'RAN' : 'did NOT run'}`);
  }
});

test('$272AD2 `ext.l` is SIGNED, and it changes the answer for 2,047 half-words', () => {
  // A check of mine that could not fail on the first pass, and WHY, because the
  // reason generalises: my off-screen fixture used $F000, and $F000 is off
  // screen under BOTH readings.  The two disagree only on a narrow band, and a
  // bounds test has to be driven inside the band it is about.
  //
  //   signed   ($272AD2 ext.l): i16(h) + $4000, on screen iff in ($3800,$B800)
  //   unsigned (the mutation):       h + $4000
  //
  // For h < $8000 they are identical.  For h >= $8000 the signed sum is
  // h - $C000, which re-enters the window at h = $F801 -- so the ONE band that
  // distinguishes them is $F801..$FFFF, where the ROM says ON SCREEN and the
  // unsigned reading says off.  Counted exhaustively so that a later wave which
  // moves either bound is told at once that the band has moved with it.
  const band = [];
  for (let h = 0; h < 0x10000; h++) {
    const s = ((h & 0x8000) ? h - 0x10000 : h) + 0x4000;
    const onS = s > 0x3800 && s < 0xb800;
    const onU = h + 0x4000 > 0x3800 && h + 0x4000 < 0xb800;
    if (onS !== onU) band.push(h);
  }
  assert.equal(band.length, 2047);
  assert.equal(band[0], 0xf801);
  assert.equal(band[band.length - 1], 0xffff);
  // ...and now DRIVE the handler inside that band.  $FC00 is on screen only
  // because `ext.l` made it negative.
  const ram = liveCarrier({ cooldown: 0x7f });
  ram.setU32(SUB + 0x02, 0xfc001000);
  ram.setU16(SUB + 0x06, 1);                 // has been on screen -> off = free
  runHandler(0x272aac, ram, NO_ROM, REC, CTX);
  assert.equal(ram.u16(REC), 0x8000,
    '$FC00 is INSIDE the window under ext.l, so the carrier survives');
});

test('$272B04 the freeze gate stops the spawn without touching the cooldown', () => {
  const ram = liveCarrier({ cooldown: 0 });
  ram.setU16(0x8130d2, 1);
  runHandler(0x272aac, ram, NO_ROM, REC, CTX);
  assert.equal(ram.u16(SPAWN.DEFQ_COUNT), 0, 'no spawn while frozen');
  assert.equal(ram.u8(REC + 0x1a), 0, 'and the cooldown did not move either');
});
