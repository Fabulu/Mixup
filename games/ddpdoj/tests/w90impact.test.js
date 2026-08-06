// WAVE 90 -- THE LASER'S IMPACT EFFECT: `$289FC0` (P1) and `$289FDA` (P2),
// their shared template `$28A506`, and the arm of `$28A252` that `$289FF4` can
// never take.
//
// EVERY EXPECTED VALUE HERE IS DERIVED FROM THE LISTING, never from running the
// port and writing down what came out (`docs/knowledge/03`).  The ROM side is a
// HAND-BUILT window: a test that agrees with the port because both read the
// same wrong table is impossible.
//
// THE ONE TRAP THIS FILE EXISTS FOR.  `src/laser.js`'s `BEAM[].d7` is the
// SEGMENT RECORD's player word and is **1 for P1**.  `$289FC0`'s D7 is **0 for
// P1**.  The two conventions are inverted, they meet at one call site, and D7
// is used TWICE -- once for the pool half at the head and once for the POWER
// WORD at `$28A28C`.  A port that got it backwards would put P1's sparks in
// P2's thirty slots and give P1's beam P2's power step, and no count of records
// would show it.  Test 1 asserts the pool half and the power word TOGETHER, on
// both heads, with the two power words set to DIFFERENT values.
//
// NO FIXTURE SITS WHERE TWO READINGS AGREE: the template's two position offsets
// differ, the five speed-table words differ, the two power words differ, and
// the fake `$241812` returns a different pair on every call.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import {
  SPARK, E, BEAM_IMPACT, spawnBeamImpact289FC0, spawnSpark,
  spawnBeamBombSpark289FF4, BEAM_SPARK_TEMPLATES,
} from '../src/spark.js';
import {
  RNG_242E24, RNG_242FDE, RNG_242EC2, RNG_28AB86, RNG_24311A,
} from '../src/rng.js';

// ---------------------------------------------------------------- THE FIXTURE

/** A ROM window built by hand.  A read of an address nothing put there THROWS,
 *  the same contract `src/rom.js` has, so a port that read outside cannot pass
 *  quietly. */
class FakeRom {
  constructor() { this.b = new Map(); }
  put(a, ...bytes) { bytes.forEach((v, i) => this.b.set(a + i, v & 0xff)); }
  putW(a, v) { this.put(a, (v >> 8) & 0xff, v & 0xff); }
  putL(a, v) {
    this.put(a, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }
  u8(a) {
    if (!this.b.has(a)) throw new Error(`FakeRom: nothing at $${a.toString(16)}`);
    return this.b.get(a);
  }
  u16(a) { return (this.u8(a) << 8) | this.u8(a + 1); }
  u32(a) { return ((this.u16(a) * 0x10000) + this.u16(a + 2)) >>> 0; }
}

/** THE TEMPLATE, EXACTLY the 22 bytes at `$28A506` in the cartridge:
 *    0004 fe00 ff00 0208 ffff 0000 0000008c 0028a51c 0e06
 *  Quoted from the image so the test's idea of the template is the listing's.
 *  NOTE +$08 = $FFFF, i.e. NEGATIVE, so `$28A1FC bpl` FAILS and `$28A1FE`
 *  takes the attribute from the SPAWNER's ($1D,A6) instead. */
const TPL = 0x28a506;
const LIST = 0x28a51c;
function putTemplate(rom, o = {}) {
  rom.putW(TPL + 0x00, o.sel ?? 0x0004);      // -> rec+$02, the emitter selector
  rom.putW(TPL + 0x02, o.dLong ?? 0xfe00);    // -> added to the spawner's ($2,A6)
  rom.putW(TPL + 0x04, o.dShort ?? 0xff00);   // -> added to the spawner's ($4,A6)
  rom.putW(TPL + 0x06, o.size ?? 0x0208);     // -> rec+$0C, display word 4
  rom.putW(TPL + 0x08, o.attr ?? 0xffff);     // -> NEGATIVE: take ($1D,A6)
  rom.putW(TPL + 0x0a, 0x0000);               // $28A212 addq.w #2,A2 -- SKIPPED
  rom.putL(TPL + 0x0c, o.delayAndCursor ?? 0x0000008c);  // -> rec+$12..$15
  rom.putL(TPL + 0x10, o.list ?? LIST);       // -> rec+$16, the descriptor list
  rom.putW(TPL + 0x14, o.delayB ?? 0x0e06);   // -> rec+$1A/$1B, counter B + reload
}

/** THE FIVE SPEED WORDS at `$28A2D6`, exactly the cartridge's:
 *    $0020 $0040 $0060 $0080 $00B0
 *  All different, so a wrong power offset cannot read the right answer. */
const SPEEDS = [0x0020, 0x0040, 0x0060, 0x0080, 0x00b0];
function putSpeedTable(rom, words = SPEEDS) {
  words.forEach((v, i) => rom.putW(SPARK.speedByPower + i * 2, v));
}

/** The 36-longword list.  Entry k is DISTINCT so "which frame" is readable. */
function putList(rom, base = LIST) {
  for (let k = 0; k < 36; k++) rom.putL(base + k * 4, 0x220000 + k);
}

/** The RNG tables the fill and the tail read.  FLAT and non-zero: the flip
 *  table must be non-zero so `$28A20A bne` skips `ori.w #$2000,D3` and the
 *  attribute word stays exactly ($1D,A6) -- which is what test 3 reads. */
function putRng(rom) {
  for (let i = 0; i < RNG_242FDE.entries; i++) rom.put(RNG_242FDE.table + i, 1);
  for (let i = 0; i < RNG_242EC2.entries; i++) rom.put(RNG_242EC2.table + i, 0x11);
  for (let i = 0; i < RNG_28AB86.entries; i++) rom.put(RNG_28AB86.table + i, 0x02);
  for (let i = 0; i < RNG_242E24.entries; i++) rom.put(RNG_242E24.table + i, 0x10);
  for (let i = 0; i < RNG_24311A.entries; i++) rom.put(RNG_24311A.table + i, 0);
}

function fullRom(o = {}) {
  const rom = new FakeRom();
  putTemplate(rom, o.tpl);
  putSpeedTable(rom, o.speeds);
  putList(rom);
  putRng(rom);
  // A DECOY where `$289F54` would look. `$289FC0` names its template as a
  // PC-relative IMMEDIATE and must never index this table; test 6 proves it.
  for (let i = 0; i < 256; i++) rom.putL(SPARK.ptrTable + i * 4, 0x28a5ac);
  return rom;
}

/** `$241812`, faked. Records every (speed, angle) it is handed and returns a
 *  DIFFERENT pair per call, so "which call landed where" is readable and a
 *  port that called it once and reused the result reddens. */
function tables(seen = []) {
  return {
    vector: (speed, angle) => {
      seen.push([speed, angle]);
      return { dy: 0x0100 + seen.length, dx: 0x0010 + seen.length };
    },
    shotVector: (speed, angle) => { seen.push([speed, angle]); return { dy: 3, dx: 5 }; },
  };
}

const ctx = (seen = []) => ({ unportedLog: new UnportedLog(), tables: tables(seen) });

function fresh(o = {}) {
  const ram = new Ram();
  ram.setU16(SPARK.gateWidth, 1);       // $81308C -- 30 slots
  ram.setU16(SPARK.gateAlloc, 0);       // $813098 -- pool E's allocator gate
  ram.setU16(0x803916, 0);
  ram.setU16(SPARK.p1Power, o.p1 ?? 4); // $810408 -- P1's laser power
  ram.setU16(SPARK.p2Power, o.p2 ?? 8); // $81046A -- P2's, DELIBERATELY DIFFERENT
  return ram;
}

/** A BEAM BLOCK: `$811F32` (P1) or `$811F52` (P2). `$28A1E6` reads +$2/+$4 as
 *  the position and `$28A1FE` reads +$1D as the colour. */
function putBlock(ram, at, o = {}) {
  ram.setU16(at + 2, o.long ?? 0x4000);
  ram.setU16(at + 4, o.short ?? 0x2000);
  ram.setU8(at + 0x1d, o.b1d ?? 0x55);
  return at;
}

const P1_BLOCK = 0x811f32, P2_BLOCK = 0x811f52;

// ===========================================================================
// 1. THE TWO HEADS, AND D7 IS THE PLAYER TWICE OVER
// ===========================================================================

test('W90/1 $289FC0 is P1\'s pool half AND P1\'s power word; $289FDA is P2\'s', () => {
  // The two power words are 4 and 8 -- table entries [2] ($0060) and [4]
  // ($00B0). Neither head can pass by reading the other's, and neither can pass
  // by landing in the other's thirty slots.
  for (const head of BEAM_IMPACT) {
    const ram = fresh({ p1: 4, p2: 8 });
    const rom = fullRom();
    const seen = [];
    const c = ctx(seen);
    const block = head.d7 === 0 ? P1_BLOCK : P2_BLOCK;
    putBlock(ram, block);
    assert.equal(spawnBeamImpact289FC0(ram, rom, c, block, head.at), true);

    // THE POOL HALF ($289FCE lea $81D394 / $289FE8 lea $81D790).
    const mine = head.base, theirs = head.d7 === 0 ? SPARK.p2Base : SPARK.p1Base;
    assert.equal(ram.u16(mine + E.status) & 0x8000, 0x8000,
      `$${head.at.toString(16)} must fill its OWN half $${mine.toString(16)}`);
    assert.equal(ram.u16(theirs + E.status), 0,
      `$${head.at.toString(16)} must not touch the other player's half`);

    // THE POWER WORD ($28A28E move.w $81046A / $28A296 move.w $810408).
    // The SECOND $241812 call carries it; the first carries $242E24's byte + 4.
    assert.equal(seen.length, 2, '$28A252 calls $241812 TWICE');
    const wantPower = head.d7 === 0 ? 4 : 8;
    assert.equal(ram.u16(head.power), wantPower);
    assert.equal(seen[1][0], SPEEDS[wantPower / 2],
      `$28A2A4 must hand $241812 the word at $28A2D6 + ${wantPower}, i.e. the `
      + `power step of the player D7 names -- not the other player's`);
    // ...and the FIRST call is a DIFFERENT domain, so a port that made one call
    // and reused it, or that used the table word for both, reddens here.
    assert.equal(seen[0][0], 0x10 + 4, '$28A26C jsr $242E24 / $28A272 addq.b #$4');
    assert.notEqual(seen[0][0], seen[1][0]);
  }
});

// ===========================================================================
// 2. THE SPEED IS $28A2D6[power], ONE PER POWER STEP
// ===========================================================================

test('W90/2 all five power steps index $28A2D6 as a RAW BYTE OFFSET', () => {
  // $810408 is `+= 2, refuse at 8` ($252C96), so 0/2/4/6/8 is its whole domain
  // and the table has exactly five words. Each must reach its OWN entry.
  for (let pw = 0; pw <= 8; pw += 2) {
    const ram = fresh({ p1: pw });
    const rom = fullRom();
    const seen = [];
    putBlock(ram, P1_BLOCK);
    assert.equal(spawnBeamImpact289FC0(ram, rom, ctx(seen), P1_BLOCK, 0x289fc0), true);
    assert.equal(seen[1][0], SPEEDS[pw / 2],
      `power ${pw} is a BYTE offset: $28A2D6 + ${pw} is entry ${pw / 2}`);
  }
  // ...and the five are genuinely five, so the loop above is not five copies of
  // one assertion.
  assert.equal(new Set(SPEEDS).size, SPARK.speedByPowerEntries);
});

test('W90/3 a power outside {0,2,4,6,8} THROWS by address rather than reading code', () => {
  // $28A2A2 `adda.w D1,A2` has NO MASK and NO RANGE CHECK. The next word after
  // the table is $28A2E0 -- fill dispatch $28A232's entry 1, `addq.w #$6,A0 /
  // rts` -- so the board would take an INSTRUCTION as a speed. The port must
  // say so, not clamp: `docs/knowledge/08`.
  for (const bad of [10, 1, 0x100]) {
    const ram = fresh({ p1: bad });
    const rom = fullRom();
    putBlock(ram, P1_BLOCK);
    assert.throws(
      () => spawnBeamImpact289FC0(ram, rom, ctx(), P1_BLOCK, 0x289fc0),
      (e) => {
        assert.ok(e instanceof Unreached, 'must be an Unreached, not a TypeError');
        assert.equal(e.romAddress, 0x28a29c);
        assert.match(String(e.message), /28A2E0|28A232/,
          'the message must name what is really at the far end');
        return true;
      }, `power ${bad} must throw`);
  }
});

// ===========================================================================
// 3. THE IMPACT ARM IS NOT THE BOMB ARM
// ===========================================================================

test('W90/4 $28A2A6 JUMPS $28A2A8..$28A2BC, so rec+$0F keeps the fill\'s byte', () => {
  // The BOMB's arm (D7 = $FFFF) does `$28A2BC move.b D3,(-$11,A0)` -- rec+$0F,
  // the LOW BYTE of the attribute word $28A210 has just written in full. The
  // IMPACT's arm branches straight to $28A2C0 and never reaches it. A port that
  // shared one tail would silently give every impact spark the bomb's 2 or 3.
  const ram = fresh(); const rom = fullRom();
  putBlock(ram, P1_BLOCK, { b1d: 0x55 });
  assert.equal(spawnBeamImpact289FC0(ram, rom, ctx(), P1_BLOCK, 0x289fc0), true);
  // $28A1FE moveq #0 / move.b ($1D,A6),D3 -- the template's attr is NEGATIVE.
  assert.equal(ram.u16(SPARK.p1Base + E.attr), 0x0055,
    'the attribute word is the SPAWNER\'s ($1D,A6), whole and unmodified');

  // ...and the BOMB's own producer, on the same fixture, DOES overwrite it.
  // $28A2A8 moveq #$2 / $28A2AC btst #$7,$811F73 / $28A2B8 moveq #$3.
  const ram2 = fresh(); const rom2 = fullRom();
  rom2.putL(BEAM_SPARK_TEMPLATES.table, TPL);      // $28A030[0] -> this template
  putBlock(ram2, P1_BLOCK, { b1d: 0x55 });
  assert.equal(spawnBeamBombSpark289FF4(ram2, rom2, ctx(), P1_BLOCK), true);
  assert.equal(ram2.u16(SPARK.p1Base + E.attr), 0x0002,
    '$289FF4 sets D7 := $FFFF, takes $28A2A8, and rewrites rec+$0F to 2');
});

// ===========================================================================
// 4. THE HEAD IS NOT $289F54, AND IT IS NOT GATED
// ===========================================================================

test('W90/5 $289FC0 has NO $813098 gate, and $289F54 does', () => {
  // $289F54 opens `tst.w $813098 / bne $289F4E` (a reported failure). $289FC0
  // has no such test at all -- so an impact spark is allocated on loop 2+ where
  // a shot spark is not. This is a DIFFERENCE between the two heads and the
  // control that stops "I called the shot allocator" passing.
  const ram = fresh(); const rom = fullRom();
  ram.setU16(SPARK.gateAlloc, 1);                  // $813098 non-zero
  putBlock(ram, P1_BLOCK);
  assert.equal(spawnSpark(ram, rom, ctx(), P1_BLOCK, SPARK.p1PlayerRec), false,
    '$289F5A bne $289F4E -- the SHOT spark takes its failure return');
  assert.equal(ram.u16(SPARK.p1Base + E.status), 0, '...and fills nothing');

  assert.equal(spawnBeamImpact289FC0(ram, rom, ctx(), P1_BLOCK, 0x289fc0), true,
    'the IMPACT effect has no gate to take');
  assert.equal(ram.u16(SPARK.p1Base + E.status) & 0x8000, 0x8000);
});

test('W90/6 the template is the IMMEDIATE $28A506, never $28A786[$803916*4]', () => {
  // `$289FC6 lea ($28A506,PC),A2` names ONE template. `$289F54` reaches its
  // template through the 256-entry pointer table. The fixture points every
  // entry of that table at a DECOY, and the record must still carry $28A506's
  // own list pointer and its own selector.
  const ram = fresh(); const rom = fullRom();
  putBlock(ram, P1_BLOCK);
  for (let s = 0; s < 4; s++) {
    ram.setU16(0x803916, s * 7);                   // move the RNG state around
    ram.setU16(SPARK.p1Base + s * SPARK.stride, 0);
    assert.equal(spawnBeamImpact289FC0(ram, rom, ctx(), P1_BLOCK, 0x289fc0), true);
    const slot = SPARK.p1Base + s * SPARK.stride;
    assert.equal(ram.u32(slot + E.list), LIST,
      'rec+$16 is the template\'s own +$10 long, $28A51C');
    assert.equal(ram.u16(slot + E.selector), 0x0004,
      'rec+$02 is $28A506\'s selector 4, not $28A5AC\'s $000C');
    assert.equal(ram.u16(slot + E.cursor), 0x008c,
      'rec+$14 is the template\'s cursor seed, which is where 36 comes from');
  }
});

test('W90/7 the head is chosen BY ADDRESS, and a third one is named as unported', () => {
  // `src/laser.js`'s BEAM[].d7 is 1 for P1 and this routine's D7 is 0 for P1.
  // Passing anything that is not one of the two ROM addresses must throw and
  // must name $289F96 -- the beam's SEGMENT producer, the third head, which
  // shares this template and is still unported.
  const ram = fresh(); const rom = fullRom();
  putBlock(ram, P1_BLOCK);
  assert.throws(
    () => spawnBeamImpact289FC0(ram, rom, ctx(), P1_BLOCK, 0x289f96),
    (e) => {
      assert.ok(e instanceof Unreached);
      assert.match(String(e.message), /289F96/i);
      return true;
    });
  // 0 and 1 are the D7 VALUES, and they are not addresses. A caller that passed
  // the flag instead of the address must not quietly get P1.
  for (const notAnAddress of [0, 1]) {
    assert.throws(
      () => spawnBeamImpact289FC0(ram, rom, ctx(), P1_BLOCK, notAnAddress),
      Unreached, `${notAnAddress} is a D7 value, not a head address`);
  }
  assert.deepEqual(BEAM_IMPACT.map((h) => h.at), [0x289fc0, 0x289fda]);
  assert.deepEqual(BEAM_IMPACT.map((h) => h.d7), [0, 1]);
});
