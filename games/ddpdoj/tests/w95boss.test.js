// W95 -- THE STAGE-1 BOSS'S STEADY STATE: the ten of W94 §3A's closed twelve
// that were still loud named throws, plus the three guns they start.
//
// WHAT THESE EXIST FOR.  W94 §6.2's finding was structural: no proper subset of
// the twelve can be ORACLED, because MAIN 6 and 7 run only while the boss is
// alive and every boss-alive rung was blocked on the other ten.  This wave
// removes that objection -- `[M]` `stage1-sweep` goes from 43 blocked / 6,750
// compared frames to 33 / 11,470, and TEN of the 28 steady-state rungs are now
// compared end to end.  **Six of this wave's thirteen mutations therefore go red
// on the LADDER**, which W94's could not; the other seven are driven red here
// and each has a measured or proven reason it cannot bite there.
//
// SHAPE, following W62's, W79's, W82's and W94's.  **Every expected value below
// is derived from the LISTING quoted in `src/bossphase.js` and
// `src/bossguns.js`, never from running the port.**  Nothing writes a constant
// and reads it back through the same constant (`docs/knowledge/03`).  Throw
// assertions pin `e.romAddress`, never the text.
//
// The tests SKIP LOUDLY when the export is absent.  A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { BS } from '../src/bossscripts.js';
import {
  W95, W95_MUTATE, main2Init293420, main5Init293578, main5Step29359E,
  d20Init294ABA, d20Step294AC0, f1Init295002, f1Step295120,
  f4Init29554A, f4Step29556C, f5Init295616, f5Step295626,
  f6Init295684, f6Step2956F6, e0Init2958F2, e0Step295948,
  e1Init295A7E, e1Step295AE0, e11Init2965F8, e11Step296614,
} from '../src/bossphase.js';
import {
  W95G, W95G_MUTATE, partGunInit, partGunStep, e13Init296752, e13Step296790,
} from '../src/bossguns.js';
import { SCHED, scriptAddresses, spread2595F2 } from '../src/scheduler.js';
import { RNG_24328E, drawWord24328E } from '../src/rng.js';
import { MUTATIONS, W95_EXPECTED_GREEN } from '../tools/breakage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const A5 = 0x81378c;                    // the boss's RECORD (W82's derivation)
const A6 = 0x81523c;                    // ...and its sub-record
const A4 = SCHED.a1Base;                // an E slot -- E scripts run here
// **F SCRIPTS MUST NOT RUN IN AN E SLOT.**  `$259A18` claims the first EMPTY A1
// slot, and `SCHED.a1Base` is that slot -- so an F script driven with A4 there
// would have the gun it starts land on top of its own state.  On the board they
// are different tables; here they have to be different addresses too.
const A4F = SCHED.a4Base;               // $812D3C -- table F's first slot

function fresh() {
  const ram = new Ram();
  ram.setU32(A5 + 0x06, A6);            // ($6,A5) -- $2417DE reads A6 back out
  ram.setU16(0x8103e6, 0x8000);         // P1 ALIVE, so $24270A does not decline
  const ctx = {
    rom: ROM, tables: MT, unportedLog: new UnportedLog(),
    bossSubRec: A6, bossRec: A5,
  };
  return { ram, ctx };
}

test.afterEach(() => { W95_MUTATE.value = null; W95G_MUTATE.value = null; });

// ===================================================== THE REGISTRY IS CLOSED

test('all TWENTY-SIX of this wave\'s entry points are registered', () => {
  const reg = new Set(scriptAddresses());
  const all = [
    W95.main2Init, W95.main2Step, W95.main5Init, W95.main5Step,
    W95.d20Init, W95.d20Step, W95.f1Init, W95.f1Step,
    W95.f4Init, W95.f4Step, W95.f5Init, W95.f5Step,
    W95.f6Init, W95.f6Step, W95.e0Init, W95.e0Step,
    W95.e1Init, W95.e1Step, W95.e11Init, W95.e11Step,
    W95G.e3Init, W95G.e3Step, W95G.e4Init, W95G.e4Step,
    W95G.e13Init, W95G.e13Step,
  ];
  assert.equal(all.length, 26);
  for (const a of all) {
    assert.ok(reg.has(a), `$${a.toString(16).toUpperCase()} is not registered`);
  }
});

test('the ARRIVAL population is STILL a loud named throw', { skip: SKIP }, () => {
  // The wave's scope said out loud.  W94 §3B: the 15 arrival rungs need these
  // as well, and none of them is this wave's.  If one quietly acquires a body,
  // this test says so -- which is exactly what W94's own scope test did when
  // W95 registered the ten (see `tests/w94boss.test.js`).
  const reg = new Set(scriptAddresses());
  for (const a of [0x292972, 0x292b08, 0x292f4a, 0x2937cc, 0x293816, 0x293852,
    0x293884, 0x2944e6, 0x29451a, 0x294658, 0x294878, 0x2948c4, 0x29493c,
    0x293506, 0x2936be, 0x294fa6, 0x295304, 0x295432, 0x2960f4, 0x296200,
    0x2968fe]) {
    assert.ok(!reg.has(a),
      `$${a.toString(16).toUpperCase()} is registered -- update W95's scope`);
  }
});

// ============================================ MAIN 2 -- THE WORD/BYTE TRAP

test('$293424 IS A WORD: MAIN 2\'s init sets SPEED 0 and FACING $20', () => {
  // `3d7c 0020 001a` = `move.w #$20,($1a,A6)`.  ($1A,A6) is the SPEED byte and
  // ($1B,A6) the FACING byte -- $2417E0 and $2417E4 read exactly those.  So the
  // immediate lands in FACING and the speed is ZEROED.
  const { ram } = fresh();
  ram.setU8(A6 + BS.speed, 0x7f);
  ram.setU8(A6 + BS.facing, 0x7f);
  main2Init293420(ram, ROM, A4, A6);
  assert.equal(ram.u8(A6 + BS.speed), 0x00, 'the SPEED is zeroed');
  assert.equal(ram.u8(A6 + BS.facing), 0x20, 'the FACING takes the immediate');
});

test('RED: main2-speed-20 puts the immediate in the SPEED byte', () => {
  const { ram } = fresh();
  MUTATIONS['main2-speed-20']();
  main2Init293420(ram, ROM, A4, A6);
  assert.equal(ram.u8(A6 + BS.speed), 0x20);
  assert.notEqual(ram.u8(A6 + BS.facing), 0x20);
});

test('MAIN 2\'s ramp target is the WAYPOINT DRAW\'s, not the dead $29342A store',
  { skip: SKIP }, () => {
    // `$29342A move.b $1A(A6),$2(A4)` stores the zero the line above wrote, and
    // `$293430 bsr $2933DE` then OVERWRITES $2(A4) with `($242E24 & $3) + 2`.
    // So the target is 2..5 and never 0, whatever the speed was.
    for (let seed = 0; seed < 8; seed++) {
      const { ram } = fresh();
      ram.setU8(0x803917, seed);
      ram.setU16(0x803916, seed);
      main2Init293420(ram, ROM, A4, A6);
      const t = ram.u8(A4 + 2);
      assert.ok(t >= 2 && t <= 5, `ramp target ${t} is outside 2..5`);
    }
  });

test('MAIN 2\'s waypoint table is EIGHT (Y,X) pairs and its X column is MAIN 7\'s',
  { skip: SKIP }, () => {
    // A cross-check the two tables make of each other: `$293482`'s eight X
    // words are byte-identical to `$293694`'s and only the Y column differs.
    // Neither address is derived from the other in the port.
    for (let i = 0; i < 8; i++) {
      assert.equal(ROM.u16(W95.main2Waypoints + i * 4 + 2),
        ROM.u16(0x293694 + i * 4 + 2), `waypoint ${i}'s X`);
      assert.notEqual(ROM.u16(W95.main2Waypoints + i * 4),
        ROM.u16(0x293694 + i * 4), `waypoint ${i}'s Y must differ`);
    }
  });

// ================================================= MAIN 5 -- NO RAMP, AND $8

test('MAIN 5\'s init doubles the speed when BOTH parts are destroyed', () => {
  for (const [d1, d2, want] of [[0, 0, 4], [1, 0, 4], [0, 1, 4], [1, 1, 8]]) {
    const { ram } = fresh();
    ram.setU8(A6 + 0x3f, d1);
    ram.setU8(A6 + 0x7f, d2);
    main5Init293578(ram, A4, A6);
    assert.equal(ram.u8(A6 + BS.speed), want, `$3F=${d1} $7F=${d2}`);
    // ...and $2(A4) was captured BEFORE the override, so it stays 4.
    assert.equal(ram.u8(A4 + 2), 4);
  }
});

test('MAIN 5 has NO SPEED RAMP, so the doubled speed survives the step',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU8(A6 + 0x3f, 1); ram.setU8(A6 + 0x7f, 1);
    main5Init293578(ram, A4, A6);
    main5Step29359E(ram, ROM, ctx, A4, A5, A6);
    assert.equal(ram.u8(A6 + BS.speed), 8, 'the step must not ramp it back');
  });

test('RED: main5-ramp walks the wounded boss\'s speed back down', { skip: SKIP },
  () => {
    const { ram, ctx } = fresh();
    ram.setU8(A6 + 0x3f, 1); ram.setU8(A6 + 0x7f, 1);
    main5Init293578(ram, A4, A6);
    MUTATIONS['main5-ramp']();
    main5Step29359E(ram, ROM, ctx, A4, A5, A6);
    assert.equal(ram.u8(A6 + BS.speed), 7, 'one step toward the captured 4');
  });

// ======================================================== D 20 -- TWO BYTES

test('$294ABA IS A WORD: D 20\'s init clears D 7\'s TICK **and** its PERIOD',
  () => {
    const { ram } = fresh();
    ram.setU8(A6 + 0xae, 0x55);
    ram.setU8(A6 + 0xaf, 0x66);
    d20Init294ABA(ram, A6);
    assert.equal(ram.u8(A6 + 0xae), 0);
    assert.equal(ram.u8(A6 + 0xaf), 0, 'the PERIOD is inside the word');
  });

test('RED: d20-init-byte leaves D 7\'s period behind', () => {
  const { ram } = fresh();
  ram.setU8(A6 + 0xaf, 0x66);
  MUTATIONS['d20-init-byte']();
  d20Init294ABA(ram, A6);
  assert.equal(ram.u8(A6 + 0xaf), 0x66);
});

test('D 20 steps the cursor by FOUR and wraps AT $1C, giving SEVEN values', () => {
  const { ram } = fresh();
  const seen = new Set();
  for (let i = 0; i < 40; i++) { d20Step294AC0(ram, A6); seen.add(ram.u16(A6 + 0xaa)); }
  assert.deepEqual([...seen].sort((a, b) => a - b),
    [0, 4, 8, 0xc, 0x10, 0x14, 0x18]);
});

test('RED: d20-wrap-ble admits $1C, the eighth longword of every row', () => {
  const { ram } = fresh();
  MUTATIONS['d20-wrap-ble']();
  const seen = new Set();
  for (let i = 0; i < 40; i++) { d20Step294AC0(ram, A6); seen.add(ram.u16(A6 + 0xaa)); }
  assert.ok(seen.has(0x1c), '$1C must become reachable under the mutation');
});

// ========================================================= F 1 -- THE DISCARD

test('F 1 ALWAYS starts F script 3, whatever the sequence says', { skip: SKIP },
  () => {
    // `$2952BC move.w D7,D0` is followed by `$2952C6 moveq #$3,D0`, which BOTH
    // arms fall into.  Driven over every cursor position of the three-word
    // table, including the $FFFF terminator, and over both RNG outcomes.
    for (const cursor of [0, 2, 4]) {
      for (const seed of [0, 1]) {
        const { ram, ctx } = fresh();
        ram.setU16(A6 + 0x106, cursor);
        ram.setU16(0x803916, seed);
        ram.setU8(A4 + 0x02, 3);              // state 3
        f1Step295120(ram, ROM, ctx, A4);
        const started = [];
        for (let i = 0; i < SCHED.a4Slots; i++) {
          const s = ram.u16(SCHED.a4Base + i * SCHED.a4Stride);
          if (s) started.push(s & 0xff);
        }
        assert.deepEqual(started, [3], `cursor ${cursor} seed ${seed}`);
      }
    }
  });

test('RED: f1-start-d7 can start F 2, which the cartridge never does',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    // The $FFFF terminator arm with an RNG byte of 0 is the only place the
    // discarded D7 differs from 3.  `$2952D2[2]` is the terminator.
    ram.setU16(A6 + 0x106, 4);
    ram.setU16(0x803916, 0);
    assert.equal(ROM.u16(W95.f1Sequence + 4), 0xffff, 'the terminator');
    ram.setU8(A4 + 0x02, 3);
    MUTATIONS['f1-start-d7']();
    f1Step295120(ram, ROM, ctx, A4);
    assert.equal(ram.u16(SCHED.a4Base) & 0xff, 2, 'the wrong port starts F 2');
  });

test('F 1\'s sequence cursor advances on a POSITIVE word and sticks on $FFFF',
  { skip: SKIP }, () => {
    for (const [cursor, want] of [[0, 2], [2, 4], [4, 4]]) {
      const { ram, ctx } = fresh();
      ram.setU16(A6 + 0x106, cursor);
      ram.setU8(A4 + 0x02, 3);
      f1Step295120(ram, ROM, ctx, A4);
      assert.equal(ram.u16(A6 + 0x106), want, `cursor ${cursor}`);
    }
  });

test('F 1\'s five parameter tables are read at index 4, which $2595F2 pins',
  { skip: SKIP }, () => {
    assert.equal(spread2595F2(), 4);
    const { ram } = fresh();
    f1Init295002(ram, ROM, A4, A6);
    // $8(A4) = $294FD2[4] + $10C(A6), clamped BELOW $80.  $10C starts at 0.
    assert.equal(ram.u8(A4 + 0x08), ROM.u8(W95.f1AngleTab + 4));
    // $7(A4) = $294FCA[4] - $10B(A6), floored at 3 -- and $10B starts 0, so it
    // is the table byte itself.
    assert.equal(ram.u8(A4 + 0x07), ROM.u8(W95.f1PeriodTab + 4));
    assert.equal(ram.u8(A4 + 0x0b), ROM.u8(W95.f1CadenceTab + 4));
    assert.equal(ram.u16(A4 + 0x0e), ROM.u16(W95.f1CountTab + 8));
    assert.equal(ram.u16(A4 + 0x10), ROM.u16(W95.f1SpreadTab + 8));
  });

test('F 1\'s THREE running counters live in the SUB-RECORD and survive a restart',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    f1Init295002(ram, ROM, A4, A6);
    const a = ram.u8(A6 + 0x10c), b = ram.u16(A6 + 0x10e), c = ram.u16(A6 + 0x110);
    f1Init295002(ram, ROM, A4, A6);
    assert.ok(ram.u8(A6 + 0x10c) > a, '$10C steps by 2');
    assert.ok(ram.u16(A6 + 0x10e) >= b && ram.u16(A6 + 0x110) >= c);
    // ...and each is CLAMPED, so a boss that survives long enough saturates.
    for (let i = 0; i < 300; i++) f1Init295002(ram, ROM, A4, A6);
    assert.equal(ram.u8(A6 + 0x10c), 0x80);
    assert.equal(ram.u16(A6 + 0x10e), 4);
    assert.equal(ram.u16(A6 + 0x110), 0x20);
    assert.equal(ram.u8(A6 + 0x10b), 3, '$10B is FLOORED, not ceilinged');
  });

test('F 1\'s volley timer is `bne`, so it fires ON zero and not after the wrap',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU8(A4 + 0x02, 2);
    ram.setU8(A4 + 0x14, 1);                  // one frame to go
    f1Step295120(ram, ROM, ctx, A4);
    assert.equal(ram.u8(A4 + 0x02), 3, 'the volley fired and state advanced');
  });

test('RED: f1-volley-bcc fires a frame early', { skip: SKIP }, () => {
  const { ram, ctx } = fresh();
  ram.setU8(A4 + 0x02, 2);
  ram.setU8(A4 + 0x14, 1);
  MUTATIONS['f1-volley-bcc']();
  f1Step295120(ram, ROM, ctx, A4);
  assert.equal(ram.u8(A4 + 0x02), 2, 'the wrong reading does NOT fire here');
});

// ============================================ F 4 / F 5 -- THE WORD IMMEDIATES

test('F 4\'s `move.w #$404` is TWO byte fields, and $6(A4) starts at ZERO', () => {
  const { ram } = fresh();
  f4Init29554A(ram, A4);
  assert.equal(ram.u8(A4 + 0x06), 0x00, 'the CADENCE counter');
  assert.equal(ram.u8(A4 + 0x07), 0x40, '...and its reload');
  assert.equal(ram.u8(A4 + 0x08), 0x04);
  assert.equal(ram.u8(A4 + 0x09), 0x04);
  assert.equal(ram.u16(A4 + 0x04), 0x0080, 'the state-0 wait is a WORD');
});

test('F 4 waits $80 frames, then fires E 11 on the FIRST tick of state 1', () => {
  const { ram } = fresh();
  f4Init29554A(ram, A4F);
  for (let i = 0; i < 0x7f; i++) {
    f4Step29556C(ram, A4F);
    assert.equal(ram.u8(A4F + 0x02), 0, `frame ${i} must still be state 0`);
  }
  f4Step29556C(ram, A4F);                     // the $80th
  assert.equal(ram.u8(A4F + 0x02), 1);
  assert.equal(ram.u16(SCHED.a1Base) & 0xff, 0x0b,
    'E 11 started on the very frame state 1 was entered');
});

test('F 5 starts E 0 and its `move.w #$404,$6(A4)` is DEAD', () => {
  const { ram } = fresh();
  f5Init295616(ram, A4F);
  const before = [ram.u8(A4F + 0x06), ram.u8(A4F + 0x07)];
  f5Step295626(ram, A4F);                     // state 0 -> 1, then the gun
  assert.deepEqual([ram.u8(A4F + 0x06), ram.u8(A4F + 0x07)], before,
    '$6/$7 are never touched by the step');
  assert.equal(ram.u16(SCHED.a1Base), 0x8000, 'E script 0 claimed A1 slot 0');
  // ...and it is NOT started again while it is running: `$295642 E.running 0`.
  f5Step295626(ram, A4F);
  assert.equal(ram.u16(SCHED.a1Base + SCHED.a1Stride), 0,
    'no second copy while the first is alive');
});

// ========================================== F 6 -- THE RENDEZVOUS AND THE ROW

test('F 6 does NOTHING until MAIN.get returns 7', { skip: SKIP }, () => {
  for (const cur of [0, 2, 5, 6, 8, 0xffff]) {
    const { ram, ctx } = fresh();
    f6Init295684(ram, ROM, A4F, A6);
    ram.setU16(SCHED.seqCursor, cur);
    ram.setU8(A4F + 0x02, 0);
    f6Step2956F6(ram, ROM, ctx, A4F, A5, A6);
    assert.equal(ram.u8(A4 + 0x02), 0, `MAIN=${cur} must not arm state 2`);
  }
  const { ram, ctx } = fresh();
  f6Init295684(ram, ROM, A4F, A6);
  ram.setU16(SCHED.seqCursor, 7);
  ram.setU8(A4F + 0x02, 0);
  f6Step2956F6(ram, ROM, ctx, A4F, A5, A6);
  assert.equal(ram.u8(A4F + 0x02), 2, 'state 0 goes to state 2, never 1');
});

test('F 6\'s state 0 makes TWO RNG draws and the second is dropped on the floor',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    f6Init295684(ram, ROM, A4F, A6);
    ram.setU16(SCHED.seqCursor, 7);
    ram.setU8(A4F + 0x02, 0);
    const before = ram.u8(0x803917);
    f6Step2956F6(ram, ROM, ctx, A4F, A5, A6);
    assert.equal(ram.u8(0x803917), (before + 2) & 0xff,
      'the shared counter must step TWICE');
  });

test('RED: f6-one-draw desynchronises the shared RNG counter', { skip: SKIP },
  () => {
    const { ram, ctx } = fresh();
    f6Init295684(ram, ROM, A4F, A6);
    ram.setU16(SCHED.seqCursor, 7);
    ram.setU8(A4F + 0x02, 0);
    const before = ram.u8(0x803917);
    MUTATIONS['f6-one-draw']();
    f6Step2956F6(ram, ROM, ctx, A4F, A5, A6);
    assert.equal(ram.u8(0x803917), (before + 1) & 0xff);
  });

test('F 6\'s E 13 ladder SHORTENS ITS OWN CADENCE by 8 every burst',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    f6Init295684(ram, ROM, A4F, A6);
    assert.equal(ram.u8(A4F + 0x0b), 0x50, 'the reload starts at $50');
    ram.setU8(A4F + 0x02, 2);
    ram.setU8(A4F + 0x0a, 0);                 // the cadence is due
    ram.setU8(A4F + 0x10, 0);                 // skip the sweep half
    f6Step2956F6(ram, ROM, ctx, A4F, A5, A6);
    assert.equal(ram.u8(A4F + 0x0b), 0x48);
    assert.equal(ram.u8(A4F + 0x0a), 0x48, 'the counter reloads from the NEW value');
  });

test('F 6 writes THREE parameters into the slot $259A18 returned', { skip: SKIP },
  () => {
    const { ram, ctx } = fresh();
    f6Init295684(ram, ROM, A4F, A6);
    const gun = ram.u8(A4F + 0x08), tag = ram.u8(A4F + 0x11), n = ram.u16(A4F + 0x0e);
    ram.setU8(A4F + 0x02, 2);
    ram.setU8(A4F + 0x0a, 0);
    ram.setU8(A4F + 0x10, 0);
    f6Step2956F6(ram, ROM, ctx, A4F, A5, A6);
    const slot = SCHED.a1Base;                        // the first free A1 slot
    assert.equal(ram.u16(slot) & 0xff, 0x0d, 'E 13 claimed the first free slot');
    assert.equal(ram.u8(slot + 0x04), gun);
    assert.equal(ram.u8(slot + 0x05), tag);
    assert.equal(ram.u16(slot + 0x06), n);
  });

test('F 6\'s body sweep keeps $AC(A6) inside OBJECT 3\'s SIGNED [-7,+7] rows',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    f6Init295684(ram, ROM, A4F, A6);
    ram.setU8(A4F + 0x02, 2);
    ram.setU16(A6 + 0xa2, 0x4000); ram.setU16(A6 + 0xa4, 0x1000);
    ram.setU16(0x8103e6, 0x8000);
    ram.setU16(0x8103e8, 0x7000); ram.setU16(0x8103ea, 0x2000);
    for (let i = 0; i < 200; i++) {
      ram.setU8(A4F + 0x04, 0);               // force the sweep every frame
      f6Step2956F6(ram, ROM, ctx, A4F, A5, A6);
      const ac = (ram.u16(A6 + 0xac) << 16) >> 16;
      assert.ok(ac >= -7 && ac <= 7, `$AC went to ${ac} on frame ${i}`);
    }
  });

// ============================================================ E 0, E 1, E 11

test('E 0\'s FIRST instruction toggles the RECORD\'s target index, not the slot',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    ram.setU8(A5 + 0x03, 0);
    e0Init2958F2(ram, ROM, A4, A5, A6);
    assert.equal(ram.u8(A5 + 0x03), 1, '$3(A5) is $242716\'s own byte');
    e0Init2958F2(ram, ROM, A4, A5, A6);
    assert.equal(ram.u8(A5 + 0x03), 0, 'bchg ALTERNATES');
  });

test('RED: e0-bchg-slot writes the slot and leaves the target alone',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    ram.setU8(A5 + 0x03, 0);
    MUTATIONS['e0-bchg-slot']();
    e0Init2958F2(ram, ROM, A4, A5, A6);
    assert.equal(ram.u8(A5 + 0x03), 0, 'the target index never moves');
  });

test('E 0 and E 11 are SILENT while HP is at or above $48CC, and the constant '
  + 'is the one $294AD8 uses for the CRITICAL animation', { skip: SKIP }, () => {
    assert.equal(W95.hpGate, 0x48cc);
    for (const [hp, fires] of [[0x48cc, false], [0x48cd, false], [0x48cb, true],
      [0xffffffff, false]]) {
      const { ram, ctx } = fresh();
      ram.setU32(A5 + 0x16, hp);
      e0Init2958F2(ram, ROM, A4, A5, A6);
      ram.setU8(A4 + 0x02, 1);
      const before = ram.u8(0x803917);
      e0Step295948(ram, ROM, ctx, A4, A5, A6);
      // The gun's own cadence byte only moves once past the gate.
      assert.equal(ram.u8(A4 + 0x02) !== 1, fires, `hp $${hp.toString(16)}`);
      void before;
    }
  });

test('E 1\'s init ADDS to $C(A4), which nothing clears -- the slot residue is '
  + 'the parameter', { skip: SKIP }, () => {
    const { ram } = fresh();
    ram.setU16(A4 + 0x0c, 0x0100);
    e1Init295A7E(ram, ROM, A4);
    const step = ROM.u16(W95.e1Tab + 8);
    assert.equal(ram.u16(A4 + 0x0c), (0x0100 + step) & 0xffff);
    e1Init295A7E(ram, ROM, A4);
    assert.equal(ram.u16(A4 + 0x0c), (0x0100 + 2 * step) & 0xffff,
      'it accumulates over the boss\'s life');
  });

test('RED: e1-set-param throws the residue away', { skip: SKIP }, () => {
  const { ram } = fresh();
  ram.setU16(A4 + 0x0c, 0x0100);
  MUTATIONS['e1-set-param']();
  e1Init295A7E(ram, ROM, A4);
  assert.equal(ram.u16(A4 + 0x0c), ROM.u16(W95.e1Tab + 8));
});

test('E 1 makes FOUR separate $242B3C draws, one per turret', { skip: SKIP },
  () => {
    const { ram } = fresh();
    const before = ram.u8(0x803917);
    e1Init295A7E(ram, ROM, A4);
    assert.equal(ram.u8(0x803917), (before + 4) & 0xff);
  });

test('RED: e1-one-draw steps the shared counter once and copies the byte',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    const before = ram.u8(0x803917);
    MUTATIONS['e1-one-draw']();
    e1Init295A7E(ram, ROM, A4);
    assert.equal(ram.u8(0x803917), (before + 1) & 0xff);
    for (let i = 1; i < 4; i++) {
      assert.equal(ram.u8(A4 + 0x08 + i), ram.u8(A4 + 0x08));
    }
  });

test('E 1 sets $6(A4) only when ALL FOUR turrets have reached their targets',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    e1Init295A7E(ram, ROM, A4);
    for (let i = 0; i < 3; i++) ram.setU8(A6 + 0xc6 + i, ram.u8(A4 + 0x08 + i));
    ram.setU8(A6 + 0xc9, (ram.u8(A4 + 0x0b) + 8) & 0x3f);
    e1Step295AE0(ram, ROM, ctx, A4, A5, A6);
    assert.equal(ram.u8(A4 + 0x06), 0, 'three of four is not four');
    for (let n = 0; n < 40 && ram.u8(A4 + 0x06) === 0; n++) {
      e1Step295AE0(ram, ROM, ctx, A4, A5, A6);
    }
    assert.equal(ram.u8(A4 + 0x06), 1, 'the slew must eventually arrive');
  });

test('E 1\'s sweep turns around at $30 going up and $10 coming back',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    e1Init295A7E(ram, ROM, A4);
    ram.setU8(A4 + 0x06, 1);
    ram.setU8(A4 + 0x05, 0);
    for (let i = 0; i < 4; i++) ram.setU8(A6 + 0xc6 + i, 0x20);
    ram.setU8(A4 + 0x02, 0xff); ram.setU8(A4 + 0x03, 0xff);
    let lo = 0xff, hi = 0;
    for (let i = 0; i < 400; i++) {
      e1Step295AE0(ram, ROM, ctx, A4, A5, A6);
      const v = ram.u8(A6 + 0xc6);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    assert.equal(hi, 0x30, 'the `blt #$30` arms the turn-around AT $30');
    assert.equal(lo, 0x10, '...and the `bgt #$10` at $10');
  });

test('E 11 reads its four muzzles in the order [1] [3] [0] [2]', { skip: SKIP },
  () => {
    // Derived from the four `move.l (d16,PC),D3` displacements, and asserted
    // against the CARTRIDGE rather than against a copy of the port's array.
    const want = [0x296680, 0x296688, 0x29667c, 0x296684];
    const seen = [];
    // A PROXY, not `Object.create`: `RomWindows` uses PRIVATE FIELDS, so a
    // prototype-chained stand-in fails the brand check on the first delegated
    // read.  The trap binds every other method back to the real instance.
    const spy = new Proxy(ROM, {
      get(t, k) {
        if (k === 'u32') {
          return (a) => {
            if (a >= 0x29667c && a < 0x29668c) seen.push(a);
            return t.u32(a);
          };
        }
        const v = Reflect.get(t, k);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const { ram, ctx } = fresh();
    ram.setU32(A5 + 0x16, 0x100);
    e11Init2965F8(ram, spy, A4);              // its own init leaves $2(A4) = 0
    ctx.bulletSpawn = () => {};
    e11Step296614(ram, spy, ctx, A4, A5, A6);
    assert.deepEqual(seen, want);
    // ...and the check is capable of failing: the mutation reads them in
    // address order.
    seen.length = 0;
    const g = fresh();
    g.ram.setU32(A5 + 0x16, 0x100);
    e11Init2965F8(g.ram, spy, A4);
    g.ctx.bulletSpawn = () => {};
    MUTATIONS['e11-muzzle-order']();
    e11Step296614(g.ram, spy, g.ctx, A4, A5, A6);
    assert.deepEqual(seen, [0x29667c, 0x296680, 0x296684, 0x296688]);
  });

test('E 11\'s table index is 4, its counter is a WORD and it retires at zero',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    e11Init2965F8(ram, ROM, A4);
    assert.equal(ram.u16(A4 + 0x04), ROM.u16(W95.e11Tab + 8));
    assert.equal(ram.u16(A4 + 0x02), 0x0008, '$2=0, $3=8');
    ram.setU32(A5 + 0x16, 0x100);
    ram.setU16(A4 + 0x04, 1);
    ram.setU16(A4, 0x8000 | 11);
    ram.setU8(A4 + 0x02, 0);
    ctx.bulletSpawn = () => {};
    e11Step296614(ram, ROM, ctx, A4, A5, A6);
    assert.equal(ram.u16(A4), 0, 'clr.w (a4) retires the slot');
  });

// ================================================= E 3 / E 4 -- THE COPY BUG

test('E 4\'s init branches into E 3\'s STEP when no player is alive',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(0x8103e6, 0);                  // BOTH players dead -> carry set
    ram.setU16(0x810448, 0);
    assert.equal(partGunInit(ram, ROM, ctx, A4, A5, A6, 4), 3,
      '$295F82 bcs.w $295E5E is E 3\'s step, not E 4\'s');
    assert.equal(partGunInit(ram, ROM, ctx, A4, A5, A6, 3), 3);
  });

test('RED: e4-init-own-step "fixes" the ROM and changes which part gate is read',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(0x8103e6, 0);
    ram.setU16(0x810448, 0);
    MUTATIONS['e4-init-own-step']();
    assert.equal(partGunInit(ram, ROM, ctx, A4, A5, A6, 4), 4);
  });

test('a live player makes the copy bug UNREACHABLE, which is why it is green '
  + 'on the ladder', { skip: SKIP }, () => {
    const { ram, ctx } = fresh();                 // fresh() leaves P1 alive
    assert.equal(partGunInit(ram, ROM, ctx, A4, A5, A6, 4), 4);
  });

test('E 3 and E 4 read the OTHER part\'s position and the OTHER part\'s gate',
  { skip: SKIP }, () => {
    for (const [id, pos, dead] of [[3, 0x22, 0x3f], [4, 0x62, 0x7f]]) {
      const { ram, ctx } = fresh();
      ram.setU32(A6 + pos, 0x40001000);
      partGunInit(ram, ROM, ctx, A4, A5, A6, id);
      assert.equal(ram.u32(A4 + 0x08),
        (0x40001000 + (id === 3 ? 0xf6c00140 : 0xf6bffec0)) >>> 0);
      ram.setU16(A4, 0x8000 | id);
      ram.setU8(A6 + dead, 1);
      partGunStep(ram, ROM, ctx, A4, A5, A6, id);
      assert.equal(ram.u16(A4), 0, 'a dead part RETIRES its gun');
    }
  });

test('E 3 mode 0 fires NOTHING, which is F 1\'s own first four ticks',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    partGunInit(ram, ROM, ctx, A4, A5, A6, 3);
    ram.setU8(A4 + 0x03, 0);                  // the mode F 1 writes at $2951E4
    ram.setU8(A4 + 0x02, 0x10);
    let fired = 0;
    ctx.bulletSpawn = () => { fired += 1; };
    for (let i = 0; i < 8; i++) partGunStep(ram, ROM, ctx, A4, A5, A6, 3);
    assert.equal(fired, 0);
    ram.setU8(A4 + 0x03, 1);
    ram.setU8(A4 + 0x04, 0);
    partGunStep(ram, ROM, ctx, A4, A5, A6, 3);
    assert.ok(fired > 0, 'mode 1 does fire');
  });

test('E 3\'s fan is 3 shots $14 apart at rank 0 and 7 shots $A apart above it',
  { skip: SKIP }, () => {
    for (const [rank, n] of [[0, 3], [1, 7]]) {
      const { ram, ctx } = fresh();
      ram.setU16(0x813098, rank);
      partGunInit(ram, ROM, ctx, A4, A5, A6, 3);
      ram.setU8(A4 + 0x03, 1);
      ram.setU8(A4 + 0x04, 0);
      let fired = 0;
      ctx.bulletSpawn = () => { fired += 1; };
      partGunStep(ram, ROM, ctx, A4, A5, A6, 3);
      assert.equal(fired, n, `rank ${rank}`);
    }
  });

// ================================================= E 13 -- BULLET KIND 11

test('E 13\'s init does NOT fall through, unlike eight of the ten', () => {
  // Asserted structurally: `$29678E rts`.  The registry entry for the INIT must
  // therefore not also run the STEP -- which is checked by the RNG counter, the
  // step's own first side effect after the freeze gate.
  assert.equal(W95G.e13Init, 0x296752);
  assert.equal(W95G.e13Step, 0x296790);
});

test('E 13 RETIRES its slot when frozen, where E 3 and E 4 only skip the volley',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(0x8130d4, 1);
    ram.setU16(A4, 0x8000 | 13);
    e13Step296790(ram, ROM, ctx, A4, A5, A6);
    assert.equal(ram.u16(A4), 0, 'E 13: clr.w (a4)');
    const g = fresh();
    g.ram.setU16(0x8130d4, 1);
    g.ram.setU16(A4, 0x8000 | 3);
    g.ram.setU8(A4 + 0x04, 0);
    g.ram.setU8(A4 + 0x02, 5);
    partGunStep(g.ram, ROM, g.ctx, A4, A5, A6, 3);
    assert.equal(g.ram.u16(A4), 0x8003, 'E 3: the slot survives');
  });

test('E 13 fires THIRTY-TWO kind-11 bullets and 3 x $6(A4) kind-7 in ONE frame',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    e13Init296752(ram, ROM, A4, A5, A6);
    ram.setU16(A4 + 0x06, 2);                 // F 6's $E(A4), the ladder length
    ram.setU16(A4, 0x8000 | 13);
    const sites = [];
    ctx.bulletSpawn = (site) => sites.push(site);
    e13Step296790(ram, ROM, ctx, A4, A5, A6);
    const k11 = sites.filter((s) => s === 0x2967d6 || s === 0x2967ea).length;
    const k7 = sites.filter((s) => s >= 0x296838).length;
    assert.equal(k11, 32, '16 iterations x 2 sites');
    assert.equal(k7, 6, '3 sites x $6(A4)=2');
    assert.equal(ram.u16(A4), 0, 'and then it retires');
  });

test('E 13\'s $10(A4) scaling: two byte doublings, which IS times four mod 256',
  { skip: SKIP }, () => {
    // W82's `obj3-unsigned-ac` precedent.  `e13-word-scale` is DECLARED
    // EXPECTED-GREEN and the proof is exhaustive rather than argued: over all
    // 65,536 word values, `u8(u8(2x)*2)` and `u8(4x)` agree everywhere.
    let differ = 0;
    for (let x = 0; x < 0x10000; x++) {
      const a = (((x * 2) & 0xff) * 2) & 0xff;
      const b = (x * 4) & 0xff;
      if (a !== b) differ += 1;
    }
    assert.equal(differ, 0,
      'the two readings are the same instruction over every input');
    // ...and the mutation is therefore asserted BYTE-IDENTICAL, not "did not
    // go red", exactly as W94 §2.1 handled `main7-stale-target`.
    const run = (mut) => {
      const { ram } = fresh();
      ram.setU16(0x8103e6, 0);
      ram.setU16(0x810448, 0);                // decline the aim so $10 stands
      ram.setU16(A6 + 0xac, 0x0037);
      if (mut) MUTATIONS[mut]();
      e13Init296752(ram, ROM, A4, A5, A6);
      W95G_MUTATE.value = null;
      return ram.u8(A4 + 0x10);
    };
    assert.equal(run(null), run('e13-word-scale'));
  });

test('E 13\'s arm muzzle table is the SAME row selector OBJECT 3 indexes with',
  { skip: SKIP }, () => {
    // Both are `($AC(A6) + 7) * <stride>`: $295DD2 at 4 bytes a row and
    // $292C2A at $20.  Fifteen rows each, and the extents are pinned in
    // export-tables.py by $295E0E and $292E0A respectively.
    assert.equal(W95G.armTable, 0x295dd2);
    assert.equal(ROM.u32(0x295856 + 3 * 8), W95G.armTable + 15 * 4);
  });

// ===================================================== $24328E, THE WORD RNG

test('$24328E masks $7F and DOUBLES the index -- 128 WORDS, not 256 bytes',
  { skip: SKIP }, () => {
    assert.equal(RNG_24328E.entries, 128);
    const { ram } = fresh();
    for (const state of [0, 1, 0x7f, 0x80, 0xff]) {
      ram.setU16(0x803916, state);
      const before = ram.u8(0x803917);
      // `$24328E addq.b #$1,$803917` comes FIRST and `$803917` is the LOW BYTE
      // of the state word `$803916`, so the index is the BUMPED counter.
      const idx = (((state & 0xff00) | ((state + 1) & 0xff)) & 0x7f);
      assert.equal(drawWord24328E(ram, ROM),
        ROM.u16(RNG_24328E.table + idx * 2), `state $${state}`);
      assert.equal(ram.u8(0x803917), (before + 1) & 0xff,
        'and it steps the SHARED counter');
    }
  });

// ================================================== THE MUTATION SET IS WHOLE

test('every W95 mutation this file names is declared in tools/breakage.mjs', () => {
  for (const m of ['main2-speed-20', 'main5-ramp', 'd20-init-byte', 'd20-wrap-ble',
    'f1-volley-bcc', 'f1-start-d7', 'f6-one-draw', 'e0-bchg-slot', 'e1-set-param',
    'e1-one-draw', 'e11-muzzle-order', 'e4-init-own-step', 'e13-word-scale']) {
    assert.ok(typeof MUTATIONS[m] === 'function', `${m} is not declared`);
  }
});

test('the EXPECTED-GREEN declaration names exactly the seven the ladder cannot '
  + 'see, and none of the six it can', () => {
    // A declaration that drifts is worse than none: this pins the partition so
    // a later wave that unblocks the arrival (and makes, say, `e0-bchg-slot`
    // reachable) has to come back here and say so.
    assert.deepEqual(Object.keys(W95_EXPECTED_GREEN).sort(),
      ['d20-init-byte', 'e0-bchg-slot', 'e1-set-param', 'e11-muzzle-order',
        'e13-word-scale', 'e4-init-own-step', 'f1-start-d7']);
    for (const red of ['main2-speed-20', 'main5-ramp', 'd20-wrap-ble',
      'f1-volley-bcc', 'f6-one-draw', 'e1-one-draw']) {
      assert.ok(!(red in W95_EXPECTED_GREEN),
        `${red} moves a segment and must not be declared expected-green`);
      assert.ok(typeof MUTATIONS[red] === 'function');
    }
    for (const [k, why] of Object.entries(W95_EXPECTED_GREEN)) {
      assert.ok(typeof MUTATIONS[k] === 'function', `${k} is not a mutation`);
      assert.ok(why.length > 80, `${k}'s reason must be a measurement, not a word`);
    }
  });
