// WAVE 53 (E5a) -- THE SHOT'S IMPACT SPARK: pool E's allocator `$289F54`, its
// record fill `$28A1DA` + kind-$14 tail `$28A39E`, and its driver `$28A098`.
//
// EVERY EXPECTED VALUE HERE IS DERIVED FROM THE LISTING, never from running the
// port and writing down what came out (`docs/knowledge/03`).  The ROM side is a
// HAND-BUILT window, not the cartridge: every byte of it is quoted from the
// disassembly in the comment above it, so a test that agrees with the port
// because both read the same wrong table is impossible here.
//
// Two shapes are avoided deliberately:
//  * NO FIXTURE SITS WHERE TWO READINGS AGREE.  The template's two position
//    offsets are different, its two delay bytes are different, and the fake
//    vector routine returns dy != dx -- so a long/short axis swap reddens.
//  * NO ASSERTION SEEDS ITS OWN ANSWER.  Every number below is computed by hand
//    from the instructions quoted beside it.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { BUCKETS } from '../src/spritequeue.js';
import { SPARK, E, EMIT_ENTRY, spawnSpark, runSparkDriver, clearPool } from '../src/spark.js';
import { RNG, RNG_242E24, RNG_242FDE, RNG_28ABE0 } from '../src/rng.js';

const B20 = BUCKETS[SPARK.bucket];

/** A ROM window built by hand.  `u8`/`u16`/`u32` big-endian, and a read of an
 *  address nothing put there THROWS -- the same contract `src/rom.js` has, so a
 *  port that read outside the window cannot pass quietly. */
class FakeRom {
  constructor() { this.b = new Map(); }
  put(a, ...bytes) { bytes.forEach((v, i) => this.b.set(a + i, v & 0xff)); }
  putW(a, v) { this.put(a, (v >> 8) & 0xff, v & 0xff); }
  putL(a, v) { this.put(a, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); }
  u8(a) {
    if (!this.b.has(a)) throw new Error(`FakeRom: nothing at $${a.toString(16)}`);
    return this.b.get(a);
  }
  u16(a) { return (this.u8(a) << 8) | this.u8(a + 1); }
  u32(a) { return ((this.u16(a) * 0x10000) + this.u16(a + 2)) >>> 0; }
}

// The addresses the port reads, all quoted in `src/spark.js`:
//   $28A786 + $803916*4   the 256-entry pointer table
//   the template it names, 22 bytes
//   ($10,template)        the descriptor list
//   $242E42[state & $7F]  the speed byte      ($28A3A2 jsr $242E24)
//   $28ABFA[state & $3F]  the angle byte      ($28A3B2 bsr $28ABE0)
//   $24301A[state]        the flip draw       ($28A204 jsr $242FFC)
const TPL = 0x28a5ac;          // the first of the 15, and template 0's own base
const LIST = 0x28a5c2;         // [M] all 15 name this one and nothing else

/** The template, EXACTLY the 22 bytes at `$28A5AC` in the cartridge:
 *    000c fe00 ff00 0208 001e 1e1d 0000008c 0028a5c2 0e06
 *  ...except that the fixture below overrides individual words where a test
 *  needs two readings to differ; each override says which. */
function putTemplate(rom, o = {}) {
  rom.putW(TPL + 0x00, o.sel ?? 0x000c);       // -> rec+$02, the emitter selector
  rom.putW(TPL + 0x02, o.dLong ?? 0xfe00);     // -> added to the spawner's ($2,A6)
  rom.putW(TPL + 0x04, o.dShort ?? 0xff00);    // -> added to the spawner's ($4,A6)
  rom.putW(TPL + 0x06, o.size ?? 0x0208);      // -> rec+$0C, display word 4
  rom.putW(TPL + 0x08, o.attr ?? 0x001e);      // -> rec+$0E, display word 5
  rom.putW(TPL + 0x0a, 0x1e1d);                // $28A212 addq.w #2,A2 -- SKIPPED
  rom.putL(TPL + 0x0c, o.delayAndCursor ?? 0x0000008c);   // -> rec+$12..$15
  rom.putL(TPL + 0x10, o.list ?? LIST);        // -> rec+$16, the descriptor list
  rom.putW(TPL + 0x14, o.delayB ?? 0x0e06);    // -> rec+$1A/$1B, counter B + reload
}

/** The 36-longword descriptor list.  Entry k is a DISTINCT recognisable value
 *  so "which frame drew" is readable off the record. */
function putList(rom, base = LIST) {
  for (let k = 0; k < 36; k++) rom.putL(base + k * 4, 0x220000 + k);
}

/** The three RNG tables the fill reads.
 *
 *  FLAT by default -- most tests here are about the fill and the driver and want
 *  the drawn values to be a constant.  `byIndex` makes every byte a function of
 *  its index instead, which is what the MASK test needs: with a flat table a
 *  wrong mask reads a different index and gets the same byte, and a mutation
 *  that changes `& $7F` to `& $3F` survives.  (It did -- see §4 of the worklog.)
 *
 *  The tables are written 128 entries wide even where the ROM's is 64, so a
 *  mutant that widens the mask reads a REAL byte rather than falling off the
 *  FakeRom and dying with the wrong message. */
function putRngTables(rom, o = {}) {
  const f = (dflt) => (i) => (o.byIndex ? dflt + (i >> 4) : dflt);
  const sp = f(0x10), an = f(0x20);
  for (let i = 0; i < 128; i++) rom.put(RNG_242E24.table + i, o.speed ?? sp(i));
  for (let i = 0; i < 128; i++) rom.put(RNG_28ABE0.table + i, o.angle ?? an(i));
  for (let i = 0; i < RNG_242FDE.entries; i++) rom.put(RNG_242FDE.table + i, o.flip ?? 1);
}

function fullRom(o = {}) {
  const rom = new FakeRom();
  // The 256-entry pointer table.  Every entry names TPL unless a test overrides
  // one, which is how the "unmasked $803916 * 4" indexing is checked.
  for (let i = 0; i < 256; i++) rom.putL(SPARK.ptrTable + i * 4, o.ptr?.[i] ?? TPL);
  putTemplate(rom, o.tpl);
  putList(rom);
  putRngTables(rom, o.rng);
  return rom;
}

/** dy != dx and both non-zero, so a long/short swap or a dropped half reddens. */
function tables(seen = []) {
  return { shotVector: (speedIdx, angle) => { seen.push([speedIdx, angle]); return { dy: 0x0030, dx: 0x0007 }; } };
}

function fresh() {
  const ram = new Ram();
  ram.setU16(SPARK.gateWidth, 1);      // $81308C -- 1 on every tree this project has run
  ram.setU16(SPARK.gateAlloc, 0);      // $813098 -- 0 on every frame ever measured
  ram.setU16(0x803916, 0);
  return ram;
}

/** A shot record: `($2,A6)` `($4,A6)` the position, `($1b,A6)` the ANGLE. */
function putShot(ram, at = 0x810572, o = {}) {
  ram.setU16(at + 2, o.long ?? 0x4000);
  ram.setU16(at + 4, o.short ?? 0x2000);
  ram.setU8(at + 0x1b, o.angle ?? 0x03);
  ram.setU8(at + 0x1d, o.b1d ?? 0x77);
  return at;
}

const ctx = (seen = []) => ({ unportedLog: new UnportedLog(), tables: tables(seen) });

// ===================================================== THE GEOMETRY, ASSERTED

test('pool E closes EXACTLY on P2 and on its count word', () => {
  // $289F7C lea $81D394 / $289F8C lea $81D790 / $28A0B0 move.w $81DB8C,D7
  assert.equal(SPARK.p1Base + SPARK.perPlayer * SPARK.stride, SPARK.p2Base);
  assert.equal(SPARK.p2Base + SPARK.perPlayer * SPARK.stride, SPARK.count);
  assert.equal(SPARK.count + 2, SPARK.budget);
  // $289F40 move.w #$3FD,D0 + the dbra's own pass = $3FE words = 2,044 B, which
  // is both halves PLUS both count words and not one byte more.
  assert.equal(SPARK.clearWords * 2,
    SPARK.slots * SPARK.stride + 4, '$289F3A clears both halves and both counts');
  // [M] AND THE BOARD SIZED BUCKET 20's BUFFER AT THE POOL'S OWN CAPACITY.
  assert.equal(B20.capBytes / 12, SPARK.slots, 'bucket 20 holds exactly 60 records');
  assert.equal(B20.buffer, 0x808fa4);              // $28A0EC lea $808FA4,A4
  assert.equal(B20.counter, 0x80afde);             // $28A1B4 move.w A4,$80AFDE
});

test('$28A140 is FOUR entries, three distinct, and entry [3] repeats [1]', () => {
  assert.deepEqual(Object.keys(EMIT_ENTRY).map(Number), [0, 4, 8, 12]);
  assert.equal(EMIT_ENTRY[0x4], EMIT_ENTRY[0xc], '$28A140[1] and [3] are both $28A150');
  assert.equal(new Set(Object.values(EMIT_ENTRY)).size, 3);
});

// ================================================ $28A060 -- THE SCAN LENGTH
//
// `50-recon-effects` §1.7 reads this branch BACKWARDS ("30 slots, or 15 when
// $81308C is set").  `$28A068 bne $28A06C` SKIPS the `moveq #$E,D2`, so:

test('$28A062 gives THIRTY slots when $81308C is NON-ZERO and fifteen when it is 0', () => {
  // Slots 0..14 occupied, 15..29 free.  A 30-slot scan reaches slot 15; a
  // 15-slot scan ($28A06A moveq #$E,D2, i.e. D2+1 = 15) stops one short of it.
  for (const [gate, want] of [[1, true], [0, false]]) {
    const ram = fresh(); const rom = fullRom(); const c = ctx();
    ram.setU16(SPARK.gateWidth, gate);
    for (let s = 0; s < 15; s++) ram.setU16(SPARK.p1Base + s * SPARK.stride, 0x8014);
    putShot(ram);
    assert.equal(spawnSpark(ram, rom, c, 0x810572, SPARK.p1PlayerRec), want,
      `with $81308C = ${gate} the scan covers ${gate ? 30 : 15} slots, so the `
      + `free slot 15 is ${want ? 'reached' : 'PAST THE END'}`);
    assert.equal(ram.u16(SPARK.p1Base + 15 * SPARK.stride), want ? 0x8014 : 0);
  }
});

test('a full pool is a COUNTED failure, not a silent discard', () => {
  const ram = fresh(); const rom = fullRom(); const c = ctx();
  for (let s = 0; s < SPARK.perPlayer; s++) ram.setU16(SPARK.p1Base + s * SPARK.stride, 0x8014);
  ram.setU16(SPARK.count, SPARK.perPlayer);
  putShot(ram);
  assert.equal(spawnSpark(ram, rom, c, 0x810572, SPARK.p1PlayerRec), false);
  assert.equal(ram.u16(SPARK.count), SPARK.perPlayer, 'nothing was allocated');
  assert.ok(c.unportedLog.report().some((l) => /\$28A078/.test(l)),
    'W33 §4: a failed allocation is an EVENT, counted with its address');
});

test('$289F54 tst.w $813098 is a FAILURE RETURN and it is counted', () => {
  const ram = fresh(); const rom = fullRom(); const c = ctx();
  ram.setU16(SPARK.gateAlloc, 1);                       // $289F5A bne $289F4E
  putShot(ram);
  assert.equal(spawnSpark(ram, rom, c, 0x810572, SPARK.p1PlayerRec), false);
  assert.equal(ram.u16(SPARK.count), 0);
  assert.equal(ram.u8(RNG.counter), 0, '$289F62 is BEHIND the gate, so no draw happened');
  assert.ok(c.unportedLog.report().some((l) => /\$289F4E/.test(l)));
});

// ====================================================== $289F54's OWN READS

test('$289F62 bumps the SHARED RNG counter, and $289F68 indexes the pointer '
  + 'table with the WHOLE $803916 word', () => {
  // Entry 3 of the 256 names a DIFFERENT template, so the index is observable.
  const alt = 0x28a900;
  const rom = fullRom({ ptr: { 3: alt } });
  rom.putW(alt + 0x00, 0x0004);                  // a DIFFERENT selector
  rom.putW(alt + 0x02, 0x0100); rom.putW(alt + 0x04, 0x0200);
  rom.putW(alt + 0x06, 0x0111); rom.putW(alt + 0x08, 0x0022);
  rom.putW(alt + 0x0a, 0); rom.putL(alt + 0x0c, 0x0000_0020);
  rom.putL(alt + 0x10, LIST); rom.putW(alt + 0x14, 0x0102);
  const ram = fresh(); const c = ctx();
  ram.setU16(0x803916, 2);                       // $289F62 makes it 3 BEFORE the read
  putShot(ram);
  assert.ok(spawnSpark(ram, rom, c, 0x810572, SPARK.p1PlayerRec));
  // FOUR family members draw inside ONE spawn -- $289F62 itself, then $242FFC
  // in the fill and $242E24 + $28ABE0 in the tail -- so the counter ends at
  // 2 + 4 = 6.  That the POINTER came from entry 3 is what proves $289F62 ran
  // FIRST and that the index is the state AFTER its bump.
  assert.equal(ram.u8(RNG.counter), 6,
    '$289F62 + $242FFC + $242E24 + $28ABE0 = four bumps of the shared counter');
  assert.equal(ram.u16(SPARK.p1Base + E.selector), 0x0004,
    '$28A786[3] was taken, i.e. the index is $803916*4 with NO mask');
});

test('$289F6E/$289F70 are WORD doublings and $289F78 SIGN-EXTENDS the result', () => {
  // Both `add.w D5,D5` truncate to a word, and `movea.l (A2,D5.w),A2` then
  // sign-extends -- so a state of $3FFF gives D5 = $FFFC = -4 and the read is
  // FOUR BYTES BELOW the table.  A port that computed `state * 4` in 32 bits
  // would read $28B782 instead.  $803916 cannot reach $3FFF today ($23BE36
  // `clr.w` zeroes the high byte and `addq.b` never carries), so this is a
  // transcription assertion, and it is here because the alternative is a
  // comment claiming the same thing with nothing checking it.
  const below = 0x28a930;
  const rom = fullRom();
  // $242FFC's own read is unmasked too, and at this state it lands far outside
  // the 256-byte table -- which in the real port is a `src/rom.js` throw BY
  // ADDRESS, the correct answer.  The fixture covers it so this test can reach
  // the thing it is actually about.
  for (let i = 0x3f00; i < 0x4200; i++) rom.put(RNG_242FDE.table + i, 1);
  rom.putL(SPARK.ptrTable - 4, below);
  rom.putW(below + 0x00, 0x0008); rom.putW(below + 0x02, 0); rom.putW(below + 0x04, 0);
  rom.putW(below + 0x06, 0x0208); rom.putW(below + 0x08, 0x001e); rom.putW(below + 0x0a, 0);
  rom.putL(below + 0x0c, 0x0000008c); rom.putL(below + 0x10, LIST);
  rom.putW(below + 0x14, 0x0e06);
  const ram = fresh();
  ram.setU16(0x803916, 0x3ffe);                  // $289F62 makes it $3FFF
  putShot(ram);
  assert.ok(spawnSpark(ram, rom, ctx(), 0x810572, SPARK.p1PlayerRec));
  assert.equal(ram.u16(SPARK.p1Base + E.selector), 0x0008,
    'D5 = $FFFC, sign-extended to -4: the template BELOW $28A786 was taken');
});

test('$289F82 cmpa.l #$8103E6,A4 is the ONLY thing that picks P1 over P2', () => {
  for (const [player, base] of [[SPARK.p1PlayerRec, SPARK.p1Base], [0x810448, SPARK.p2Base]]) {
    const ram = fresh(); const rom = fullRom(); putShot(ram);
    assert.ok(spawnSpark(ram, rom, ctx(), 0x810572, player));
    assert.equal(ram.u16(base + E.status), 0x8000 | SPARK.kindSpark);
    assert.equal(ram.u16(base === SPARK.p1Base ? SPARK.p2Base : SPARK.p1Base), 0,
      'the other half is untouched');
  }
});

// ============================================= $28A1DA -- THE RECORD FILL
//
// The fill is checked field by field because the ROM SKIPS TWO of them
// ($28A1F6 addq.w #4,A0 and $28A214 addq.w #2,A0) and a port that wrote them
// contiguously would put the descriptor where the size word goes.

test('$28A1DA fills the record from the template and the SPAWNER, field by field', () => {
  const ram = fresh(); const rom = fullRom(); const seen = [];
  const c = ctx(seen);
  // Fill +$08..+$0B and +$10 with a sentinel: the fill must NOT write either.
  ram.setU32(SPARK.p1Base + E.descriptor, 0xdeadbeef);
  ram.setU16(SPARK.p1Base + 0x10, 0xcafe);
  putShot(ram, 0x810572, { long: 0x4000, short: 0x2000, angle: 0x03 });
  assert.ok(spawnSpark(ram, rom, c, 0x810572, SPARK.p1PlayerRec));
  const r = SPARK.p1Base;
  assert.equal(ram.u16(r + E.status), 0x8014, '$28A1DE ori.w #$8000,D3 with D0 = $14');
  assert.equal(ram.u16(r + E.selector), 0x000c);
  // $28A1E6/$28A1EE: the spawner's own position PLUS the template's offsets, and
  // the two offsets are DIFFERENT so an axis swap reddens.  $4000 + $FE00 =
  // $3E00 (u16); $2000 + $FF00 = $1F00.  Then $28A3CC/$28A3D0 add 4*dy and 4*dx
  // on top: $3E00 + 4*$30 = $3EC0, $1F00 + 4*7 = $1F1C.
  assert.equal(ram.u16(r + E.pos), 0x3ec0);
  assert.equal(ram.u16(r + E.pos + 2), 0x1f1c);
  assert.equal(ram.u32(r + E.descriptor), 0xdeadbeef, '$28A1F6 addq.w #4,A0 SKIPS +$08');
  assert.equal(ram.u16(r + E.size), 0x0208);
  assert.equal(ram.u16(r + 0x10), 0xcafe, '$28A214 addq.w #2,A0 SKIPS +$10');
  assert.equal(ram.u32(r + E.delayA), 0x0000008c, '$28A216 is ONE longword: +$12..+$15');
  assert.equal(ram.u16(r + E.cursor), 0x008c, '...so the CURSOR comes out of its low word');
  assert.equal(ram.u32(r + E.list), LIST);
  assert.equal(ram.u8(r + E.delayB), 0x0e);
  assert.equal(ram.u8(r + E.delayBReload), 0x06);
  assert.equal(ram.u16(SPARK.count), 1, '$28A21C addq.w #1,$81DB8C');
});

test('$28A1FA: a POSITIVE template attribute is taken as-is and a NEGATIVE one '
  + 'comes from the spawner ($1d,A6)', () => {
  for (const [attr, spawnerByte, want] of [[0x001e, 0x77, 0x001e], [0x8000, 0x77, 0x0077]]) {
    const ram = fresh(); const rom = fullRom({ tpl: { attr }, rng: { flip: 1 } });
    putShot(ram, 0x810572, { b1d: spawnerByte });
    assert.ok(spawnSpark(ram, rom, ctx(), 0x810572, SPARK.p1PlayerRec));
    assert.equal(ram.u16(SPARK.p1Base + E.attr), want);
  }
});

test('$28A20C ORs $2000 into the attribute exactly when $242FFC draws a ZERO', () => {
  for (const [flip, want] of [[0, 0x201e], [1, 0x001e], [0xff, 0x001e]]) {
    const ram = fresh(); const rom = fullRom({ rng: { flip } }); putShot(ram);
    assert.ok(spawnSpark(ram, rom, ctx(), 0x810572, SPARK.p1PlayerRec));
    assert.equal(ram.u16(SPARK.p1Base + E.attr), want,
      `$242FFC's ext.w sets Z only for 0, and $28A20A bne SKIPS the ori`);
  }
});

// ================================================ $28A39E -- THE FILL TAIL

test('$28A3A8 addq.b #8 / $28A3AA clamp to $24, and $28A3B6 adds the SHOT ANGLE', () => {
  // $242E42 byte $20 -> +8 = $28, which is >= $24, so the speed CLAMPS to $24.
  // $28ABFA byte $20 + the shot's ($1b,A6) = $03 -> angle $23.
  const seen = []; const ram = fresh();
  const rom = fullRom({ rng: { speed: 0x20, angle: 0x20 } });
  putShot(ram, 0x810572, { angle: 0x03 });
  assert.ok(spawnSpark(ram, rom, ctx(seen), 0x810572, SPARK.p1PlayerRec));
  assert.deepEqual(seen, [[0x24, 0x23]], '$241D34 got the CLAMPED speed and the summed angle');

  // ...and a byte BELOW the clamp passes through: $10 + 8 = $18.
  const seen2 = []; const ram2 = fresh();
  const rom2 = fullRom({ rng: { speed: 0x10, angle: 0xfe } });
  putShot(ram2, 0x810572, { angle: 0x05 });
  assert.ok(spawnSpark(ram2, rom2, ctx(seen2), 0x810572, SPARK.p1PlayerRec));
  assert.deepEqual(seen2, [[0x18, 0x03]],
    '$28A3B6 add.b is a BYTE add: $FE + $05 wraps to $03, it does not become $103');
});

test('$28A3C0 stores the velocity and $28A3CC nudges the position by FOUR TIMES it', () => {
  const ram = fresh(); const rom = fullRom(); putShot(ram);
  assert.ok(spawnSpark(ram, rom, ctx(), 0x810572, SPARK.p1PlayerRec));
  const r = SPARK.p1Base;
  assert.equal(ram.u16(r + E.vel), 0x0030, 'D2, the LONG axis');
  assert.equal(ram.u16(r + E.vel + 2), 0x0007, 'D3, the SHORT axis');
  // $28A3C4 asl.w #2,D2 and $28A3C6/$28A3C8 add.w D3,D3 twice -- two DIFFERENT
  // instructions, both x4, and the port is checked against both.
  assert.equal(ram.u16(r + E.pos), 0x3e00 + 4 * 0x30);
  assert.equal(ram.u16(r + E.pos + 2), 0x1f00 + 4 * 0x07);
});

test('the fill tail leaves A0 on the NEXT slot, which is what lets D1 > 0 work', () => {
  // Two consecutive allocations must land in slots 0 and 1 and nowhere else.
  const ram = fresh(); const rom = fullRom(); putShot(ram);
  assert.ok(spawnSpark(ram, rom, ctx(), 0x810572, SPARK.p1PlayerRec));
  assert.ok(spawnSpark(ram, rom, ctx(), 0x810572, SPARK.p1PlayerRec));
  assert.equal(ram.u16(SPARK.p1Base + E.status), 0x8014);
  assert.equal(ram.u16(SPARK.p1Base + SPARK.stride + E.status), 0x8014);
  assert.equal(ram.u16(SPARK.p1Base + 2 * SPARK.stride + E.status), 0);
  assert.equal(ram.u16(SPARK.count), 2);
});

test('a kind other than $14 is a LOUD NAMED THROW, not a silent fill', () => {
  const ram = fresh(); const rom = fullRom(); putShot(ram);
  assert.throws(() => spawnSpark(ram, rom, ctx(), 0x810572, SPARK.p1PlayerRec, 0x10),
    (e) => e instanceof Unreached && e.romAddress === SPARK.fillTable + 0x10);
});

// ================================================== $28A098 -- THE DRIVER

/** One live spark, straight out of the allocator, ready for the driver. */
function oneSpark(ram, rom, o = {}) {
  putShot(ram, 0x810572, o.shot);
  assert.ok(spawnSpark(ram, rom, ctx(), 0x810572, SPARK.p1PlayerRec));
  return SPARK.p1Base;
}

test('$28A09A reloads the budget to $D0 every frame and $28A0B6 returns on an '
  + 'empty pool without touching the bucket', () => {
  const ram = fresh(); const rom = fullRom();
  ram.setU16(SPARK.budget, 7);
  ram.setU16(B20.counter, 0x1234);
  const t = runSparkDriver(ram, rom, ctx());
  assert.equal(ram.u16(SPARK.budget), SPARK.budgetReload);
  assert.deepEqual(t, { records: 0, live: 0, freed: 0 });
  assert.equal(ram.u16(B20.counter), 0x1234, '$28A0B6 beq $28A096 is a bare rts');
});

test('the driver emits TWELVE BYTES and OVERWRITES bucket 20\'s counter', () => {
  const ram = fresh(); const rom = fullRom();
  const r = oneSpark(ram, rom);
  ram.setU16(B20.counter, 0x9999);          // a bulk writer does not append
  const t = runSparkDriver(ram, rom, ctx());
  assert.equal(t.records, 1);
  assert.equal(ram.u16(B20.counter), 12, '$28A1B4 move.w A4,$80AFDE -- the DIFFERENCE');
  // $28A180 asr.l D4 / and.l #$07FF03FF / or.l #$80008000, ON THE WHOLE LONG --
  // which is `src/spritequeue.js` TRAP 1: the long axis's low six bits bleed
  // into the top of the short axis and are removed only by the $03FF mask.
  // pos after the driver's own `add.l` is ($3EC0 + $30) : ($1F1C + 7) =
  // $3EF01F23.  asr.l #6 -> $00FBC07C -- and the $C0 in bits 15..14 of the low
  // word IS the bleed.  & $07FF03FF -> $00FB007C; | $80008000 -> $80FB807C.
  assert.equal(ram.u16(B20.buffer + 0), 0x80fb);
  assert.equal(ram.u16(B20.buffer + 2), 0x807c);
  assert.equal(ram.u32(B20.buffer + 4), ram.u32(r + E.descriptor));
  assert.equal(ram.u16(B20.buffer + 8), 0x0208);
  assert.equal(ram.u16(B20.buffer + 10), ram.u16(r + E.attr));
});

test('$28A132/$28A150: EITHER delay counter borrowing advances the animation', () => {
  // Counter A = 0 (the cartridge's own value in all 15 templates), so it borrows
  // every frame and the animation advances every frame regardless of counter B.
  const ram = fresh(); const rom = fullRom();
  const r = oneSpark(ram, rom);
  assert.equal(ram.u8(r + E.delayB), 0x0e);
  runSparkDriver(ram, rom, ctx());
  assert.equal(ram.u16(r + E.cursor), 0x88, '$28A160 subq.w #4');
  assert.equal(ram.u32(r + E.descriptor), 0x220000 + 0x8c / 4, 'list[35] -- the cursor BEFORE the decrement');
  assert.equal(ram.u8(r + E.delayB), 0x0d, '...and counter B still stepped');

  // With counter A NON-ZERO and counter B non-zero, NEITHER borrows and the
  // animation stands still.
  const ram2 = fresh();
  const rom2 = fullRom({ tpl: { delayAndCursor: 0x0505_008c } });
  const r2 = oneSpark(ram2, rom2);
  ram2.setU32(r2 + E.descriptor, 0);
  runSparkDriver(ram2, rom2, ctx());
  assert.equal(ram2.u16(r2 + E.cursor), 0x8c, 'the cursor did NOT move');
  assert.equal(ram2.u32(r2 + E.descriptor), 0, 'and nothing was re-pointed');
  assert.equal(ram2.u8(r2 + E.delayA), 4);
});

test('counter B borrowing advances the animation on its own, and RELOADS', () => {
  // counter A = 5 (never borrows this frame), counter B = 0 -> borrows.
  const ram = fresh();
  const rom = fullRom({ tpl: { delayAndCursor: 0x0505_008c, delayB: 0x0006 } });
  const r = oneSpark(ram, rom);
  runSparkDriver(ram, rom, ctx());
  assert.equal(ram.u16(r + E.cursor), 0x88, 'counter B alone advanced it');
  assert.equal(ram.u8(r + E.delayB), 0x06, '$28A156 move.b ($17,A6),($16,A6)');
});

test('$28A164 FREES the slot when the cursor borrows -- the pool\'s main drain, '
  + 'and it is why entry 0 of the list is never drawn', () => {
  const ram = fresh(); const rom = fullRom({ tpl: { delayAndCursor: 0x00000004 } });
  const r = oneSpark(ram, rom);
  ram.setU32(r + E.descriptor, 0);
  runSparkDriver(ram, rom, ctx());                 // cursor 4 -> list[1], then 0
  assert.equal(ram.u32(r + E.descriptor), 0x220000 + 1, 'list[1] drew');
  assert.equal(ram.u16(r + E.status), 0x8014, 'still alive');
  const t = runSparkDriver(ram, rom, ctx());       // cursor 0 -> borrow -> FREE
  assert.equal(ram.u16(r + E.status), 0, '$28A1A0 clr.w');
  assert.equal(ram.u16(SPARK.count), 0, '$28A1A4 subq.w #1,$81DB8C');
  assert.equal(t.records, 0, 'a freed record emits NOTHING that frame');
  assert.equal(ram.u32(r + E.descriptor), 0x220000 + 1,
    'list[0] was NEVER read: $28A15C samples the cursor BEFORE $28A160 decrements it');
});

test('$28A17C culls a record that has passed $7000 on the long axis, and frees it', () => {
  const ram = fresh(); const rom = fullRom();
  const r = oneSpark(ram, rom);
  ram.setU32(r + E.pos, 0x71000100); ram.setU32(r + E.vel, 0);
  ram.setU16(0x80390c, 0);                         // $28A178 tst.w D6 -- positive
  const t = runSparkDriver(ram, rom, ctx());
  assert.equal(ram.u16(r + E.status), 0, '$28A1BC clr.w');
  assert.equal(ram.u16(SPARK.count), 0);
  assert.equal(t.records, 0);
  assert.equal(ram.u16(B20.counter), 0, 'and the bucket counter is still written');

  // ...and `$28A178 bmi $28A180` SKIPS the cull when $80390C is negative.
  const ram2 = fresh(); const rom2 = fullRom();
  const r2 = oneSpark(ram2, rom2);
  ram2.setU32(r2 + E.pos, 0x71000100); ram2.setU32(r2 + E.vel, 0);
  ram2.setU16(0x80390c, 0x8000);
  assert.equal(runSparkDriver(ram2, rom2, ctx()).records, 1);
  assert.equal(ram2.u16(r2 + E.status), 0x8014);
});

test('D5 is the budget AND the cull bound, and the low half MOVES as records emit', () => {
  // Two records, both at long axis exactly $7000.  The bound starts at
  // $700000D0 and `$28A102 subq.w #1,D5` takes it to $700000CF before the first
  // record's compare, $700000CE before the second.  A record whose SHORT axis is
  // $00CF is therefore culled on the first pass and one at $00CD is not.
  for (const [short, wantRecords] of [[0xcf, 0], [0xcd, 1]]) {
    const ram = fresh(); const rom = fullRom({ tpl: { dLong: 0, dShort: 0 } });
    // spawn at long $7000 and the given short, then cancel the fill tail's nudge
    const r = oneSpark(ram, rom, { shot: { long: 0x7000, short } });
    ram.setU32(r + E.pos, ((0x7000 << 16) | short) >>> 0);
    ram.setU32(r + E.vel, 0);
    ram.setU16(0x80390c, 0);
    assert.equal(runSparkDriver(ram, rom, ctx()).records, wantRecords,
      `short $${short.toString(16)} against a bound of $700000CF`);
  }
});

test('$28A0FC skips a FREE slot without consuming the dbra', () => {
  const ram = fresh(); const rom = fullRom();
  // three sparks, then free the first two by hand: the driver must still find
  // the third, because a free slot costs no iteration.
  for (let i = 0; i < 3; i++) oneSpark(ram, rom);
  ram.setU16(SPARK.p1Base + 0 * SPARK.stride + E.status, 0);
  ram.setU16(SPARK.p1Base + 1 * SPARK.stride + E.status, 0);
  ram.setU16(SPARK.count, 1);
  assert.equal(runSparkDriver(ram, rom, ctx()).records, 1);
  assert.equal(ram.u16(B20.counter), 12);
});

test('a count word that outruns the pool is a LOUD NAMED THROW, not a read of '
  + 'the bullet driver\'s RAM', () => {
  const ram = fresh(); const rom = fullRom();
  ram.setU16(SPARK.count, 1);                      // ...with every slot free
  assert.throws(() => runSparkDriver(ram, rom, ctx()),
    (e) => e instanceof Unreached && e.romAddress === 0x28a0fa);
});

test('an emitter selector outside 0/4/8/$C is a LOUD NAMED THROW -- $28A140 has '
  + 'FOUR entries and $28A150 is code', () => {
  const ram = fresh(); const rom = fullRom({ tpl: { sel: 0x10 } });
  oneSpark(ram, rom);
  assert.throws(() => runSparkDriver(ram, rom, ctx()),
    (e) => e instanceof Unreached && e.romAddress === SPARK.emitTable);
});

test('$28A0FE frees a record when the per-frame RECORD BUDGET runs out', () => {
  const ram = fresh(); const rom = fullRom();
  for (let i = 0; i < 3; i++) oneSpark(ram, rom);
  // The budget is reloaded to $D0 by the driver itself, so reach the arm by
  // making the pool bigger than the budget is: 3 live, budget 2.
  SPARK_BUDGET_OVERRIDE: {
    const saved = SPARK.budgetReload;
    Object.defineProperty(SPARK, 'budgetReload', { value: 2, configurable: true });
    const t = runSparkDriver(ram, rom, ctx());
    Object.defineProperty(SPARK, 'budgetReload', { value: saved, configurable: true });
    assert.equal(t.records, 2, 'two emitted');
    assert.equal(t.freed, 1, '$28A116 clr.w (-$2,A6) freed the third');
    assert.equal(ram.u16(SPARK.count), 2);
  }
});

test('$289F3A clears both halves AND both count words', () => {
  const ram = fresh(); const rom = fullRom();
  for (let i = 0; i < 3; i++) oneSpark(ram, rom);
  ram.setU16(SPARK.p2Base + 5 * SPARK.stride, 0x8014);
  clearPool(ram);
  for (let s = 0; s < SPARK.slots; s++) assert.equal(ram.u16(SPARK.p1Base + s * SPARK.stride), 0);
  assert.equal(ram.u16(SPARK.count), 0);
  assert.equal(ram.u16(SPARK.budget), 0);
});

// ======================= THE THREE MASKS, EACH SEEN TO MATTER =============
//
// Four members of the `$803917` family draw inside ONE spawn, in this order,
// and each advances the shared counter before its own read:
//
//   $289F62  the pointer index      = $803916,        NO MASK     (256 entries)
//   $242FFC  the flip draw          = $803916,        NO MASK     (256 entries)
//   $242E24  the spark's SPEED      = $803916 & $7F   (128 entries)
//   $28ABE0  the spark's ANGLE      = $803916 & $3F    (64 entries)
//
// Three DIFFERENT masks over one counter, and a flat fixture cannot tell them
// apart: with every table byte the same, a wrong mask reads a different index
// and gets the same answer.  This test is the one that can see the mask, and it
// exists because the mutation pass found the earlier ones could not.

test('the four family members draw in ROM ORDER, each with ITS OWN mask', () => {
  // state $6C, so the four reads index $6D, $6E, $6F & $7F = $6F, and
  // $70 & $3F = $30.  A $3F mask on the third would read $2F instead of $6F,
  // and a $7F mask on the fourth would read $70 instead of $30 -- and with
  // `byIndex` those are DIFFERENT BYTES.
  const alt = 0x28a920;
  const rom = fullRom({ rng: { byIndex: true }, ptr: { 0x6d: alt } });
  rom.putW(alt + 0x00, 0x0008);                  // a THIRD distinct selector
  rom.putW(alt + 0x02, 0); rom.putW(alt + 0x04, 0);
  rom.putW(alt + 0x06, 0x0208); rom.putW(alt + 0x08, 0x001e);
  rom.putW(alt + 0x0a, 0); rom.putL(alt + 0x0c, 0x0000008c);
  rom.putL(alt + 0x10, LIST); rom.putW(alt + 0x14, 0x0e06);
  const ram = fresh(); const seen = [];
  ram.setU16(0x803916, 0x6c);
  putShot(ram, 0x810572, { angle: 0x03 });
  assert.ok(spawnSpark(ram, rom, ctx(seen), 0x810572, SPARK.p1PlayerRec));
  // $289F68 -- UNMASKED. $6D & $3F would be $2D, which names TPL, not `alt`.
  assert.equal(ram.u16(SPARK.p1Base + E.selector), 0x0008,
    '$28A786[$6D] was taken: the pointer index is the WHOLE $803916 word');
  // $242E42[$6F] = $10 + ($6F >> 4) = $16; +8 = $1E.  A $3F mask gives
  // $242E42[$2F] = $12, i.e. speed $1A.
  // $28ABFA[$30] = $20 + 3 = $23; + the shot's angle $03 = $26.  A $7F mask
  // gives $28ABFA[$70] = $27, i.e. angle $2A.
  assert.deepEqual(seen, [[0x1e, 0x26]],
    '$242E24 masks with $7F and $28ABE0 with $3F -- three different masks, one counter');
  assert.equal(ram.u8(RNG.counter), 0x70, 'four bumps: $6C -> $70');
});

// ============================================= THE EXPORT SIDE, ASSERTED
//
// A unit test can only read the exporter's SOURCE; the run against the real
// cartridge is in the worklog (§4).  These pin the CLAIMS so a later edit that
// widens the window or shortens the list has to say so here too.

import fs from 'node:fs';
const TOOL = (n) => fs.readFileSync(new URL(`../tools/${n}`, import.meta.url), 'utf8');

test('the exporter ASSERTS pool E\'s data block against the cartridge', () => {
  const s = TOOL('export-tables.py');
  assert.ok(/def check_pool_e_extents/.test(s));
  assert.ok(/build\(d: bytes\) -> dict:\n\s*check_pool_e_extents\(d\)/.test(s),
    'and it runs on EVERY export, not behind a flag');
  assert.ok(/0x52, 0x39, 0x00, 0x80, 0x39, 0x17/.test(s),
    '$28AB86 must disassemble to `addq.b #1,$803917` -- that is what pins the '
    + '256-entry pointer table from above, and $289F68 indexes it UNMASKED');
  assert.ok(/0x41, 0xF9, 0x00, 0x81, 0xDB, 0x90/.test(s),
    '$28AC3A must be `lea $81DB90,A0` -- the far end of $28ABE0\'s draw table');
  assert.ok(/\(0x28A5AC, 0x05DA,/.test(s) && /\(0x28ABFA, 0x0040,/.test(s));
});

test('$253C18 SPAWNS the spark now -- it is not a counted note any more', () => {
  // A source assertion, and it is the weakest check in this file BY DESIGN: what
  // actually proves the spark reaches the display list is `webgate`'s W53 stage
  // (8,843 records over 35 images, absolute and port-side), and that mutation is
  // run against the real gate in §4 of the worklog rather than here.  This one
  // exists so the unit suite notices if the call is deleted.
  const s = fs.readFileSync(new URL('../src/shots.js', import.meta.url), 'utf8');
  assert.ok(/lifecycleSpark\(ram, rom, ctx, rec,\s*shotSparkAllocatorPlayer\(ctx, prec\), resources\);/.test(s),
    '$253C1A jsr $289F54 keeps A6 as the shot and selects the exact spark-pool player');
  assert.ok(!/note\(0x289f54/.test(s),
    'and the wave-8 note that called it "the $289xxx effect family, unported" is gone');
  assert.ok(/impact SOUND CUE/.test(s),
    '$28C714 is re-labelled: it is a sound request, not the visual burst');
});

test('the spark art is harvested by ROM ADDRESS, 36 entries, into its OWN shard', () => {
  const s = TOOL('export-web.mjs');
  assert.ok(/\[8, 0x28a5c2, 36, 4, 36, 0x28a652,/.test(s),
    'the list ABUTS template 1 at $28A652, and both ends are checked');
  assert.ok(/\[8, 'spark'/.test(s));
  assert.ok(/SPR_BOOT = \[0\]/.test(s),
    'shard 0 stays the ONLY boot shard, so capture.bin and bundlegate cannot move');
});
