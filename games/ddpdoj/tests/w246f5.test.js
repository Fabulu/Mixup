// W246: Stage-4 boss A4/F5 $2A0CF6/$2A0D16, the second-phase conductor.
//
// F5 is a BIT machine, not a state index: seven arms on the bits of $2(A4) plus a
// four-gate chain on $3(A4), all reached in one call. The assertions below care most
// about the two things a bit machine gets wrong -- an arm that hands its bit on and so
// runs its successor on the SAME frame, and a gate that forgets to check whether the
// script it would start is already running.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, i16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { f5Init2A0CF6, f5Step2A0D16 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a4Base;                 // F5 is an A4 script, so A4 is an A4 slot

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A6 + 0x02, 0x2000);
  ram.setU16(A6 + 0x04, 0x1800);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log, soundPost() {}, bulletSpawn() {},
    effectSpawn() {} };
  return { ram, log, ctx };
}

const init = (f) => f5Init2A0CF6(f.ram, ROM, f.ctx, SLOT);
const step = (f) => f5Step2A0D16(f.ram, ROM, f.ctx, SLOT);

/** Which script id, if any, each A1 / A3 slot currently carries. */
const carried = (ram, base, slots, stride) => {
  const out = [];
  for (let i = 0; i < slots; i++) {
    const s = ram.u16(base + i * stride);
    if (s !== 0) out.push(s & 0xff);
  }
  return out.sort((a, b) => a - b);
};
const a1Ids = (ram) => carried(ram, SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride);
const a3Ids = (ram) => carried(ram, SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride);

test('W246 F5 is registered and its STEP ends exactly where A4 id6 begins',
  { skip: SKIP }, () => {
    for (const a of [0x2a0cf6, 0x2a0d16])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(0x2a0088 + 5 * 8), ROM.u32(0x2a0088 + 5 * 8 + 4)],
      [0x2a0cf6, 0x2a0d16], 'A4 id5 is the pair we registered');
    // $2A11D2 is the STEP's `rts`, so the body is $2A0D16..$2A11D3 and id6's own
    // INIT begins on the very next word. The extent is pinned by CODE, not a length.
    assert.equal(ROM.u32(0x2a0088 + 6 * 8), 0x2a11d4,
      'A4 id6 starts at $2A11D4, one word past the STEP\'s rts');
  });

test('W246 INIT falls through, so the arming frame already spends a spread step',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    assert.equal(f.ram.u8(SLOT + 0x02), 1, '$2A0CFE -- bit 0, the pods opening');
    assert.equal(f.ram.u8(SLOT + 0x03), 0, '$2A0D04');
    // The fall-through: $2A0D10 wrote $6(a4) = 0 and $2A0D2A immediately added 4.
    assert.equal(f.ram.u16(SLOT + 0x06), 4, '$6(a4) is 4 and not 0');
    assert.equal(f.ram.u16(A6 + 0x192), 4, '$2A0D38 add.w');
    assert.equal(f.ram.u16(A6 + 0x18e), 0xfffc, '$2A0D34 sub.w, wrapped');
    // $2A0CF8 arms MAIN4 for the next walk rather than calling it.
    assert.deepEqual([f.ram.u16(SCHED.seqRestart), f.ram.u16(SCHED.seqPending)],
      [1, 4], 'seqStart(4) -- MAIN4');
    assert.deepEqual(f.log.report(), [], 'and it reaches no unported path');
  });

test('W246 the spread ACCELERATES and the latch arms two arms at once',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);                                   // frame 1 of the spread
    // $6(a4) grows by 4 before it is applied, so $192 after n frames is
    // 4+8+...+4n = 2n(n+1). 2n(n+1) >= $E00 (3584) first holds at n = 42.
    let n = 1;
    while ((f.ram.u8(SLOT + 0x02) & 0x01) !== 0) { step(f); n++; }
    assert.equal(n, 42, 'an accelerating spread, not a constant rate');
    assert.equal(f.ram.u16(A6 + 0x192), 0x0e00, '$2A0D46 pins it');
    assert.equal(f.ram.u16(A6 + 0x18e), 0xf200, '$2A0D4C pins its mirror');
    assert.equal(f.ram.u8(SLOT + 0x02), 0x06,
      '$2A0D52..$2A0D5E -- bit 0 traded for bits 1 AND 2');

    // The tail wrote $4 = $10 and $c = $10, and then arms 3 and 4 ran on the SAME
    // frame because each arm re-reads $2(a4). Both counters are therefore one lower
    // than the tail's literal. An assertion of $10 here would be asserting a bug.
    assert.equal(f.ram.u16(SLOT + 0x04), 0x000f, '$2A0E66 less arm 3\'s own tick');
    assert.equal(f.ram.u16(SLOT + 0x0c), 0x000f, '$2A0E6C less arm 4\'s own tick');
    assert.equal(f.ram.u16(SLOT + 0x10), 0x0808, '$2A0E72 -- value and period');
    assert.equal(f.ram.u16(SLOT + 0x14), 0x0004, '$2A0E7E -- counter 0, period 4');
    // $2A0D20's refusal: once $18E is $F000 the arm is inert. Re-arm bit 0 to prove
    // the guard is the offset and not the bit.
    f.ram.setU16(A6 + 0x18e, 0xf000);
    f.ram.setU8(SLOT + 0x02, 0x01);
    f.ram.setU16(SLOT + 0x06, 0);
    step(f);
    assert.equal(f.ram.u16(SLOT + 0x06), 0, '$2A0D20 beq -- nothing moved');
  });

test('W246 the pod aim holds its heading until its OWN side\'s limit',
  { skip: SKIP }, () => {
    // Arm 3 alone, so the only writes are the aim's and its integration.
    const only3 = (f) => { f.ram.setU8(SLOT + 0x02, 0x02); f.ram.setU8(SLOT + 0x03, 0); };

    // Moving up ($198 negative) keeps going while $82 is still above $5A00.
    let f = fixture();
    only3(f);
    f.ram.setU16(A6 + 0x198, 0xffff);
    f.ram.setU16(A6 + 0x82, 0x6000);
    step(f);
    assert.equal(f.ram.u16(A6 + 0x198), 0xffff, '$2A0D82 bgt -- no re-aim');

    // ...and turns around once it is not: heading $00, whose dy is never negative.
    f = fixture();
    only3(f);
    f.ram.setU16(A6 + 0x198, 0xffff);
    f.ram.setU16(A6 + 0x82, 0x5000);
    step(f);
    assert.ok(i16(f.ram.u16(A6 + 0x198)) >= 0,
      `heading $00 turned it around, got ${i16(f.ram.u16(A6 + 0x198))}`);

    // The mirror, on the OTHER limit, and it is $82 that gates $198 -- not $A2.
    f = fixture();
    only3(f);
    f.ram.setU16(A6 + 0x198, 0x0001);
    f.ram.setU16(A6 + 0x82, 0x6000);
    f.ram.setU16(A6 + 0xa2, 0x6500);            // the other pod's, which must not count
    step(f);
    assert.equal(f.ram.u16(A6 + 0x198), 0x0001, '$2A0DA0 blt -- no re-aim');

    f = fixture();
    only3(f);
    f.ram.setU16(A6 + 0x198, 0x0001);
    f.ram.setU16(A6 + 0x82, 0x6500);
    step(f);
    assert.ok(i16(f.ram.u16(A6 + 0x198)) <= 0,
      `heading $80 turned it around, got ${i16(f.ram.u16(A6 + 0x198))}`);
  });

test('W246 arm 3 integrates into the LONG-axis offsets, not arm 1\'s',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU8(SLOT + 0x02, 0x02);
    f.ram.setU16(A6 + 0x198, 0x0010);
    f.ram.setU16(A6 + 0x19a, 0x0020);
    f.ram.setU16(A6 + 0x82, 0x6000);            // both gates refuse, so the
    f.ram.setU16(A6 + 0xa2, 0x6000);            // velocities survive the frame
    f.ram.setU16(A6 + 0x18e, 0x1111);
    f.ram.setU16(A6 + 0x192, 0x2222);
    f.ram.setU16(SLOT + 0x04, 3);
    step(f);
    // $2A1062/$2A106A -- $18C and $190, which the placer adds into $82/$A2. Arm 1's
    // $18E/$192 go into $84/$A4, the SHORT axis, and must be untouched here.
    assert.equal(f.ram.u16(A6 + 0x18c), 0x0010, '$2A1062 add.w d0,$18c(a6)');
    assert.equal(f.ram.u16(A6 + 0x190), 0x0020, '$2A106A add.w d0,$190(a6)');
    assert.equal(f.ram.u16(A6 + 0x18e), 0x1111, 'the short axis is arm 1\'s alone');
    assert.equal(f.ram.u16(A6 + 0x192), 0x2222);
    assert.equal(f.ram.u16(SLOT + 0x04), 2, '$2A0F6A -- it counts, and gates nothing');
  });

test('W246 the $3(A4) chain advances one gate per frame and REFUSES while busy',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU8(SLOT + 0x03, 0x01);              // bit 0, arm 2's entry
    step(f);
    assert.deepEqual(a3Ids(f.ram), [5, 7], '$2A0EA6/$2A0EAE start the limb pair');
    assert.equal(f.ram.u8(SLOT + 0x03), 0x02, '$2A0EB6/$2A0EBC -- bit 0 -> bit 1');
    // Bit 1 ran on the same frame and REFUSED, because A3 5 and A3 7 are what it
    // waits for and bit 0 had just started them. This is the guard the whole chain
    // is built out of; without it A1 8 would start on the arming frame.
    assert.deepEqual(a1Ids(f.ram), [], '$2A0ECC bcs -- A1 8 is NOT started yet');

    // Retire the pair and bit 1 completes.
    for (let i = 0; i < SCHED.a3Slots; i++)
      f.ram.setU16(SCHED.a3Base + i * SCHED.a3Stride, 0);
    step(f);
    assert.deepEqual(a1Ids(f.ram), [8], '$2A0EE4 -- A1 8');
    assert.equal(f.ram.u8(SLOT + 0x03), 0x00, '$2A0EEC clears bit 1 and stops');
  });

test('W246 arm 4 fires its salvo once, then waits for A1 10 before handing on',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU8(SLOT + 0x02, 0x04);
    f.ram.setU16(SLOT + 0x0c, 1);                // one frame from the one-shot
    f.ram.setU16(SCHED.a1Base, 0x8008);          // A1 8 running, which the salvo stops
    step(f);
    assert.deepEqual(a1Ids(f.ram), [6, 0x0a],
      '$2A1094 retires A1 8, $2A109C/$2A10A4 start A1 6 and A1 10');
    assert.equal(f.ram.u8(SLOT + 0x03), 0x04, '$2A10AC bset #$2,$3(a4)');
    assert.equal(f.ram.u8(SLOT + 0x02), 0x04,
      '$2A10B2 bcs -- A1 10 is running, so the hand-off waits');

    // A1 10 finishes. $c(a4) is zero now, so $2A1084's `beq` skips the one-shot
    // entirely and only the rendezvous half runs.
    f.ram.setU8(SLOT + 0x03, 0);                 // arm 2 out of the way, deliberately
    for (let i = 0; i < SCHED.a1Slots; i++)
      f.ram.setU16(SCHED.a1Base + i * SCHED.a1Stride, 0);
    step(f);
    assert.deepEqual(a3Ids(f.ram), [6, 8], '$2A10CE/$2A10D6');
    assert.equal(f.ram.u8(SLOT + 0x02), 0x08, '$2A10DE/$2A10E4 -- bit 2 -> bit 3');
    assert.equal(f.ram.u16(SLOT + 0x0c), 0x003f,
      '$2A10EA wrote $40 and arm 5 spent one on the same frame');
  });

test('W246 arm 5 calls MAIN7 in and its ramp arrives saturated', { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU8(SLOT + 0x02, 0x08);
    f.ram.setU16(SLOT + 0x0c, 1);
    f.ram.setU16(SLOT + 0x10, 0x0808);            // what arm 1's tail leaves behind
    step(f);
    assert.deepEqual([f.ram.u16(SCHED.seqRestart), f.ram.u16(SCHED.seqPending)],
      [1, 7], '$2A1110 seqStart(7) -- MAIN7');
    assert.deepEqual(a3Ids(f.ram), [3], '$2A1108');
    assert.equal(f.ram.u8(SLOT + 0x03) & 0x01, 0x01, '$2A1102 re-enters the chain');
    assert.equal(f.ram.u8(SLOT + 0x02), 0x10, '$2A1118/$2A111E -- bit 3 -> bit 4');
    // $10(a4) takes $11(a4), and $2A112A's `cmpi.b #$8` matches on the first pass,
    // so the ramp never advances from what arm 1 left. Not simplified away: a value
    // below 8 does advance, and that is the only thing the ramp is for.
    assert.deepEqual([f.ram.u8(SLOT + 0x10), f.ram.u8(SLOT + 0x11)], [8, 8],
      'arm 1 leaves it already at its ceiling');

    const g = fixture();
    g.ram.setU8(SLOT + 0x02, 0x08);
    g.ram.setU16(SLOT + 0x0c, 1);
    g.ram.setU16(SLOT + 0x10, 0x0005);
    step(g);
    assert.deepEqual([g.ram.u8(SLOT + 0x10), g.ram.u8(SLOT + 0x11)], [5, 6],
      '$2A1124 copies, then $2A1134 advances');
  });

test('W246 arm 6 borrows on the frame the counter was ALREADY zero, and alternates',
  { skip: SKIP }, () => {
    const f = fixture();
    f.ram.setU8(SLOT + 0x02, 0x10);
    f.ram.setU16(SLOT + 0x14, 0x0004);           // counter 0, period 4
    f.ram.setU16(SLOT + 0x12, 0);
    step(f);
    // `subq.b #1 / bcc` borrows out of an OLD ZERO, so the very first pass fires.
    assert.deepEqual(a1Ids(f.ram), [9], '$2A1168 -- A1 9 on the first frame');
    assert.equal(f.ram.u8(SLOT + 0x14), 4, '$2A1162 reloads from $15(a4)');
    // The one place F5 writes THROUGH the started slot: $259A18 returns A0.
    assert.equal(f.ram.u16(SCHED.a1Base + 0x06), 0, '$2A1170 move.w $12(a4),$6(a0)');
    assert.equal(f.ram.u16(SLOT + 0x12), 1, '$2A1176/$2A117A toggle it');
    assert.equal(f.ram.u8(SLOT + 0x02), 0x20, '$2A1180/$2A1186 -- bit 4 -> bit 5');
    assert.equal(f.ram.u16(SLOT + 0x0c), 0x00e0,
      '$2A118C, and arm 7 refused on the same frame because A1 9 is running');

    // The next start takes the other side, which is what makes it alternate.
    for (let i = 0; i < SCHED.a1Slots; i++)
      f.ram.setU16(SCHED.a1Base + i * SCHED.a1Stride, 0);
    f.ram.setU8(SLOT + 0x02, 0x10);
    f.ram.setU16(SLOT + 0x14, 0x0004);
    step(f);
    assert.equal(f.ram.u16(SCHED.a1Base + 0x06), 1, 'the other side');
    assert.equal(f.ram.u16(SLOT + 0x12), 0, 'and back to zero -- a 0/1 toggle');
  });

test('W246 arm 7 closes the cycle back onto bit 2', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU8(SLOT + 0x02, 0x20);
  f.ram.setU16(SLOT + 0x0c, 1);
  step(f);
  assert.deepEqual([f.ram.u16(SCHED.seqRestart), f.ram.u16(SCHED.seqPending)],
    [1, 4], '$2A11B0 seqStart(4) -- MAIN4 again');
  assert.deepEqual(a3Ids(f.ram), [4], '$2A11B8');
  assert.equal(f.ram.u8(SLOT + 0x02), 0x04,
    '$2A11C0/$2A11C6 -- bit 5 -> bit 2, so 2 -> 3 -> 4 -> 5 -> 2 is the attack loop');
  assert.equal(f.ram.u16(SLOT + 0x0c), 0x0040,
    '$2A11CC, untouched because arm 4 saw A3 4 running and refused');
});

test('W246 a running A1 9 stalls both of the arms that wait on it', { skip: SKIP }, () => {
  for (const [bit, addr] of [[0x10, '$2A114E'], [0x20, '$2A119C']]) {
    const f = fixture();
    f.ram.setU8(SLOT + 0x02, bit);
    f.ram.setU16(SLOT + 0x14, 0x0004);
    f.ram.setU16(SLOT + 0x0c, 1);
    f.ram.setU16(SCHED.a1Base, 0x8009);          // A1 9 already running
    step(f);
    assert.equal(f.ram.u8(SLOT + 0x02), bit, `${addr} bcs -- the bit did not move`);
    assert.equal(f.ram.u16(SLOT + 0x0c), 1, 'and no counter was spent');
  }
});
