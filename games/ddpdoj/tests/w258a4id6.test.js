// W258: Stage-4 boss A4 id6 $2A11D4/$2A1274, the third-phase conductor.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { a4id6Init2A11D4, a4id6Step2A1274 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a4Base;
const F0 = 0x8130f0, F2 = 0x8130f2, F4 = 0x8130f4;
const LOOP = 0x813098;

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(SLOT, 0x8106);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log, soundPost() {} };
  return { ram, log, ctx };
}
const init = (f) => a4id6Init2A11D4(f.ram, ROM, f.ctx, SLOT);
const step = (f) => a4id6Step2A1274(f.ram, ROM, f.ctx, SLOT);

const ids = (base, slots, stride) => (ram) => {
  const out = [];
  for (let i = 0; i < slots; i++) {
    const s = ram.u16(base + i * stride);
    if (s !== 0) out.push(s & 0xff);
  }
  return out.sort((a, b) => a - b);
};
const a1Ids = ids(SCHED.a1Base, SCHED.a1Slots, SCHED.a1Stride);
const a3Ids = ids(SCHED.a3Base, SCHED.a3Slots, SCHED.a3Stride);
const a1SlotOf = (ram, id) => Array.from({ length: SCHED.a1Slots },
  (_, i) => SCHED.a1Base + i * SCHED.a1Stride)
  .find((a) => ram.u16(a) !== 0 && (ram.u16(a) & 0xff) === id);

const clearA3 = (ram, id) => {
  for (let i = 0; i < SCHED.a3Slots; i++) {
    const a = SCHED.a3Base + i * SCHED.a3Stride;
    if ((ram.u16(a) & 0xff) === id) ram.setU16(a, 0);
  }
};
/** INIT, then let A3 3 finish so state 0 can latch. `$2A1208` starts A3 3 and
 *  `$2A127E` waits on it, so the phase opens with its animation and only then
 *  brings A1 11 in. */
function reachState1(f) {
  init(f);
  clearA3(f.ram, 3);
  step(f);
}

test('W258 A4 id6 is registered and sits where the A4 table says', { skip: SKIP }, () => {
  for (const a of [0x2a11d4, 0x2a1274])
    assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
  assert.deepEqual([ROM.u32(0x2a0088 + 6 * 8), ROM.u32(0x2a0088 + 6 * 8 + 4)],
    [0x2a11d4, 0x2a1274]);
});

test('W258 the INIT IS the phase change: it raises $8130F4 to 2', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU16(F4, 1);                         // whatever A1 9 left behind
  f.ram.setU16(F0, 1);
  init(f);
  // This one word is what re-routes every type $42 child already in the air.
  assert.equal(f.ram.u16(F4), 2, '$2A11D4 -- THE phase change');
  assert.equal(f.ram.u16(F0), 0, '$2A11DC');
  assert.deepEqual([f.ram.u16(0x8130ec), f.ram.u16(0x8130ee)], [0xffff, 0xffff],
    '$2A11E2/$2A11EA');
  assert.deepEqual([f.ram.u16(SCHED.seqRestart), f.ram.u16(SCHED.seqPending)],
    [1, 8], '$2A11F2 seqStart(8) -- MAIN8');
  assert.deepEqual(f.log.report(), [], 'and no unported path');
});

test('W258 it retires F5\'s WHOLE attack set and starts its own', { skip: SKIP }, () => {
  const f = fixture();
  // Everything F5 could have running, plus A3 4 which its arm 7 starts.
  for (const [i, id] of [6, 7, 8, 9, 0x0a].entries()) {
    f.ram.setU16(SCHED.a1Base + i * SCHED.a1Stride, 0x8000 | id);
  }
  f.ram.setU16(SCHED.a3Base, 0x8004);
  f.ram.setU16(SCHED.a3Base + SCHED.a3Stride, 0x8005);   // A3 5 is NOT stopped
  init(f);
  // A1 11 is NOT among them yet: `$2A1208` started A3 3 and `$2A127E` waits on it,
  // so the arming frame retires five scripts and starts none of its own A1s.
  assert.deepEqual(a1Ids(f.ram), [],
    '$2A1210..$2A1232 stop A1 6, 7, 8, 9 and 10');
  assert.deepEqual(a3Ids(f.ram), [3, 5],
    '$2A1200 stops A3 4 ONLY, and $2A1208 starts A3 3');
  clearA3(f.ram, 3);
  step(f);
  assert.deepEqual(a1Ids(f.ram), [11], '$2A128A -- once A3 3 is done');
});

test('W258 INIT falls through, and what it finds is its OWN A3 3 running',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    // The fall-through IS visible, but as a REFUSAL: state 0 ran on the arming frame
    // and found A3 3 running, because the same INIT started it eleven instructions
    // earlier. So the phase opens with A3 3's animation and nothing else.
    assert.equal(f.ram.u8(SLOT + 0x02), 0, '$2A1286 bcs on the INIT frame itself');
    assert.equal(f.ram.u16(SLOT + 0x04), 0x0180, 'state 1 was never entered');
    clearA3(f.ram, 3);
    step(f);
    assert.equal(f.ram.u8(SLOT + 0x02), 1, '$2A1292');
    // ...and NOW state 1 runs on the same frame, spending the pulse timer's first tick.
    assert.equal(f.ram.u16(SLOT + 0x04), 0x017f, '$2A1238 less state 1 own tick');
    assert.equal(f.ram.u16(F2), 0, '$2A12A2 holds the pulse down');
  });

test('W258 state 0 WAITS while A3 3 is still running', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU16(SCHED.a3Base, 0x8003);          // A3 3 already live
  init(f);
  assert.equal(f.ram.u8(SLOT + 0x02), 0, '$2A1286 bcs -- it did not latch');
  assert.ok(!a1Ids(f.ram).includes(11), 'and A1 11 was not started');
  // Retire A3 3 and it proceeds.
  f.ram.setU16(SCHED.a3Base, 0);
  step(f);
  assert.equal(f.ram.u8(SLOT + 0x02), 1);
  assert.ok(a1Ids(f.ram).includes(11));
});

test('W258 $8130F2 is a ONE-FRAME pulse, and the next interval is drawn',
  { skip: SKIP }, () => {
    const f = fixture();
    reachState1(f);
    f.ram.setU16(SLOT + 0x04, 1);              // one frame from the pulse
    step(f);
    assert.equal(f.ram.u16(F2), 1, '$2A12B2 -- UP');
    const interval = f.ram.u16(SLOT + 0x04);
    assert.ok(interval >= 0x01c0 && interval <= 0x023f,
      `$2A12C4 -- $1C0 plus a 7-bit draw, got $${interval.toString(16)}`);
    // The very next frame puts it down again, which is what makes it a pulse: type
    // $42's sweep ($2A3F2A) only sees it on that one frame.
    step(f);
    assert.equal(f.ram.u16(F2), 0, '$2A12A2 -- and DOWN');
  });

test('W258 the drawn interval actually varies', { skip: SKIP }, () => {
  const seen = new Set();
  for (let t = 0; t < 16; t++) {
    const f = fixture();
    f.ram.setU8(0x803917, (t * 13) & 0xff);
    reachState1(f);
    f.ram.setU16(SLOT + 0x04, 1);
    step(f);
    seen.add(f.ram.u16(SLOT + 0x04));
  }
  assert.ok(seen.size > 1, `$242EC2 is a real draw, saw ${seen.size} intervals`);
});

test('W258 A1 13 and A1 14 alternate, each waiting for the other', { skip: SKIP }, () => {
  const f = fixture();
  reachState1(f);
  // $6(a4) is 0, so the A1 14 arm is live. Drive its $100 countdown to the edge.
  f.ram.setU16(SLOT + 0x06, 0);
  f.ram.setU16(SLOT + 0x08, 1);
  step(f);
  assert.ok(a1Ids(f.ram).includes(14), '$2A12EA -- A1 14');
  assert.equal(f.ram.u16(SLOT + 0x06), 1, '$2A12F8 -- and the arm flips');
  assert.equal(f.ram.u16(a1SlotOf(f.ram, 14) + 0x10), 8,
    '$2A12F2 hands it $C(a4) THROUGH the slot $259A18 returned');
  // The $30 it just wrote is spent by the same frame's second arm... except A1 14 is
  // now running, so $2A1316's bcs holds it. That is the alternation.
  assert.equal(f.ram.u16(SLOT + 0x08), 0x0030, '$2A12FE, untouched');

  // A1 14 finishes and A1 13 takes over with its own two parameters.
  for (let i = 0; i < SCHED.a1Slots; i++) {
    const a = SCHED.a1Base + i * SCHED.a1Stride;
    if ((f.ram.u16(a) & 0xff) === 14) f.ram.setU16(a, 0);
  }
  f.ram.setU16(SLOT + 0x08, 1);
  step(f);
  assert.ok(a1Ids(f.ram).includes(13), '$2A1328 -- A1 13');
  assert.equal(f.ram.u16(SLOT + 0x06), 0, '$2A1322 -- and back again');
  const s13 = a1SlotOf(f.ram, 13);
  // The parameters are handed over at $2A1330/$2A1336 and only ratcheted afterwards at
  // $2A135C/$2A136A, so the FIRST A1 13 gets the INIT's values and the ratchet is for
  // the next one. Reversing those two would make the attack open one step too hard.
  assert.equal(f.ram.u16(s13 + 0x10), 1, '$2A1330 -- $A(a4) as the INIT left it');
  assert.equal(f.ram.u16(s13 + 0x12), 8, '$2A1336 -- $E(a4) likewise');
  assert.deepEqual([f.ram.u16(SLOT + 0x0a), f.ram.u16(SLOT + 0x0e)], [2, 9],
    'and THEN both ratchet, for whoever comes next');
  assert.equal(f.ram.u16(SLOT + 0x08), 0x0040, '$2A133C');
});

test('W258 both A1 13 parameters ratchet, each to its OWN cap', { skip: SKIP }, () => {
  const f = fixture();
  reachState1(f);
  const fire = () => {
    f.ram.setU16(SLOT + 0x06, 1);
    f.ram.setU16(SLOT + 0x08, 1);
    for (let i = 0; i < SCHED.a1Slots; i++) {
      const a = SCHED.a1Base + i * SCHED.a1Stride;
      if ([13, 14].includes(f.ram.u16(a) & 0xff)) f.ram.setU16(a, 0);
    }
    step(f);
  };
  for (let n = 0; n < 24; n++) fire();
  // $2A1354 caps $A(a4) at 3 in loop 1, and $2A1360 caps $E(a4) at $10 always.
  assert.equal(f.ram.u16(SLOT + 0x0a), 3, '$2A1350 -- loop 1 caps the first at 3');
  assert.equal(f.ram.u16(SLOT + 0x0e), 0x10, '$2A1360 -- and the second at $10');
});

test('W258 loop 2 starts the first parameter at 3 and caps it at 5', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU16(LOOP, 1);                       // $2A1250 tst.w $813098
  reachState1(f);
  assert.equal(f.ram.u16(SLOT + 0x0a), 3, '$2A125A -- 3 rather than 1');
  const fire = () => {
    f.ram.setU16(SLOT + 0x06, 1);
    f.ram.setU16(SLOT + 0x08, 1);
    for (let i = 0; i < SCHED.a1Slots; i++) {
      const a = SCHED.a1Base + i * SCHED.a1Stride;
      if ([13, 14].includes(f.ram.u16(a) & 0xff)) f.ram.setU16(a, 0);
    }
    step(f);
  };
  for (let n = 0; n < 24; n++) fire();
  assert.equal(f.ram.u16(SLOT + 0x0a), 5,
    '$2A1346 -- and loop 2 lets it reach 5, so the attack ends harder too');
});
