// The object allocator, the enemy driver and the player-shot driver, against
// the LISTING.  Every assertion names the instruction it is checking.
//
// These are unit tests and not a frame-exact comparison, and that distinction
// is the honest one: the fly-around scenario spawns and kills NOTHING (measured:
// `objlive` constant at 8 over its whole 2,200-frame window, and the port now
// prints `ALLOC events ... none`), so the allocator's failure paths cannot be
// exercised by the corpus that exists.  Wave 2 read those paths out of the ROM;
// this file pins the translation of what wave 2 read, so that a later wave that
// DOES reach them starts from something checked rather than something plausible.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram, u16 } from '../src/ram.js';
import {
  ALLOC, ALLOC_RESULT, stageCreate, commitCreates, killById, queueKill,
  commitKills,
} from '../src/objalloc.js';
import { ENEMY, ENEMY_ALLOC, allocEnemy, runEnemyDriver } from '../src/enemies.js';
import { SHOT, SHOT_HANDLERS, runShotDriver } from '../src/weapons.js';
import { Unreached } from '../src/unported.js';

const slot = (i) => ALLOC.table + i * ALLOC.stride;
/** `assert.throws` returns undefined, so the thrown object has to be caught to
 *  be inspected -- and inspecting it is the point: the ROM address in the
 *  message is what makes an honest gap diagnosable. */
const grab = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const pri = () => 0x10;   // a fixed dispatch priority, so tests state their own

test('$241182 stages a create with the dispatch priority and a fresh ID', () => {
  const r = new Ram();
  const a = stageCreate(r, 7, () => 0x1e);
  assert.equal(a.ok, true);
  assert.equal(a.addr, ALLOC.createStage);
  assert.equal(r.u16(a.addr), 0x8007);            // $2411A8 ori.w #$8000,D0
  assert.equal(r.u16(a.addr + ALLOC.priOff), 0x1e);   // $2411B2
  assert.equal(r.u32(a.addr + ALLOC.idOff), 1);   // $2411BE addq BEFORE the store
  assert.equal(r.u16(ALLOC.createSp), ALLOC.stride);  // $2411B6
});

test('$2411D4: a full pending-CREATE queue returns the DUMMY and drops silently',
  () => {
    const r = new Ram();
    r.setU16(ALLOC.createSp, ALLOC.createCap);    // 20 records already staged
    const a = stageCreate(r, 4, pri);
    assert.equal(a.ok, false);
    assert.equal(a.result, ALLOC_RESULT.QUEUE_FULL);
    assert.equal(a.addr, ALLOC.createDummy);      // $80D51C, one shared dummy
    // nothing was evicted and the queue pointer did not move
    assert.equal(r.u16(ALLOC.createSp), ALLOC.createCap);
  });

test('$24111E inserts in DESCENDING priority and memmoves the tail DOWN', () => {
  const r = new Ram();
  // three live slots, priorities 30, 20, 10
  for (const [i, p] of [[0, 30], [1, 20], [2, 10]]) {
    r.setU16(slot(i), 0x8000 | (i + 1));
    r.setU16(slot(i) + ALLOC.priOff, p);
    r.setU32(slot(i) + ALLOC.idOff, 100 + i);
  }
  const st = stageCreate(r, 9, () => 25);        // between 30 and 20
  assert.equal(st.ok, true);
  const res = commitCreates(r);
  assert.deepEqual(res, [ALLOC_RESULT.OK]);
  assert.equal(r.u16(slot(0) + ALLOC.priOff), 30);
  assert.equal(r.u16(slot(1) + ALLOC.priOff), 25);   // inserted here
  assert.equal(r.u16(slot(1)), 0x8009);
  assert.equal(r.u16(slot(2) + ALLOC.priOff), 20);   // pushed down
  assert.equal(r.u16(slot(3) + ALLOC.priOff), 10);
  assert.equal(r.u16(ALLOC.createSp), 0);            // $241176 drained
});

test('$241158: a priority insert into a FULL table DESTROYS slot 19', () => {
  const r = new Ram();
  for (let i = 0; i < ALLOC.slots; i++) {
    r.setU16(slot(i), 0x8000 | (i + 1));
    r.setU16(slot(i) + ALLOC.priOff, 40 - i);        // 40 down to 21
    r.setU32(slot(i) + ALLOC.idOff, 500 + i);
  }
  const doomedId = r.u32(slot(19) + ALLOC.idOff);
  stageCreate(r, 3, () => 35);                       // outranks slot 5 onward
  const res = commitCreates(r);
  assert.deepEqual(res, [ALLOC_RESULT.EVICTED_SLOT19]);
  assert.equal(r.u16(slot(5) + ALLOC.priOff), 35);
  // the old slot 19 is gone; slot 19 now holds what slot 18 held
  assert.equal(r.u32(slot(19) + ALLOC.idOff), 500 + 18);
  for (let i = 0; i < ALLOC.slots; i++) {
    assert.notEqual(r.u32(slot(i) + ALLOC.idOff), doomedId,
      'the lowest-priority object was silently destroyed by the memmove');
  }
});

test('$24116E: no slot ranks low enough -> the staged record is DISCARDED', () => {
  const r = new Ram();
  for (let i = 0; i < ALLOC.slots; i++) {
    r.setU16(slot(i), 0x8000 | (i + 1));
    r.setU16(slot(i) + ALLOC.priOff, 0x40);          // everything outranks it
  }
  stageCreate(r, 2, () => 1);
  const res = commitCreates(r);
  assert.deepEqual(res, [ALLOC_RESULT.DROPPED_NO_SLOT]);
  for (let i = 0; i < ALLOC.slots; i++) {
    assert.equal(r.u16(slot(i) + ALLOC.priOff), 0x40);
  }
  assert.equal(r.u16(ALLOC.createSp), 0);
});

test('$2411E2 deletes by ID, memmoves UP and clears the LAST slot', () => {
  const r = new Ram();
  for (let i = 0; i < 4; i++) {
    r.setU16(slot(i), 0x8000 | (i + 1));
    r.setU32(slot(i) + ALLOC.idOff, 700 + i);
  }
  r.setU16(slot(19), 0x8099);                        // something in the tail
  assert.equal(killById(r, 701), true);
  assert.equal(r.u32(slot(1) + ALLOC.idOff), 702);   // shifted up
  assert.equal(r.u16(slot(19)), 0);                  // $241218 clr.w (A2)
  assert.equal(r.u32(slot(19) + ALLOC.idOff), 0);    // $24121E
});

test('$2411FC compares the LONGWORD id as a WORD -- IDs alias every 65536', () => {
  const r = new Ram();
  r.setU16(slot(0), 0x8001);
  r.setU32(slot(0) + ALLOC.idOff, 0x00010005);       // low word 5
  assert.equal(killById(r, 0x00020005), true,
    'a different longword ID with the same low word matches: $2411FC cmp.w');
});

test('$241238/$241262: the kill queue steps by $50, caps at 20, drains LIFO', () => {
  const r = new Ram();
  for (let i = 0; i < 3; i++) {
    r.setU16(slot(i), 0x8000 | (i + 1));
    r.setU32(slot(i) + ALLOC.idOff, 900 + i);
  }
  assert.equal(queueKill(r, 900), ALLOC_RESULT.OK);
  assert.equal(queueKill(r, 902), ALLOC_RESULT.OK);
  assert.equal(r.u16(ALLOC.killSp), 2 * ALLOC.stride);   // $241254 addi.w #$50
  assert.equal(r.u32(ALLOC.killQueue + ALLOC.stride), 902);
  assert.equal(commitKills(r), 2);
  assert.equal(r.u16(ALLOC.killSp), 0);
  // both gone, and 901 shifted to the front
  assert.equal(r.u32(slot(0) + ALLOC.idOff), 901);
  assert.equal(r.u16(slot(1)), 0);
});

test('$241246: a full kill queue drops the request -- the object stays alive', () => {
  const r = new Ram();
  r.setU16(ALLOC.killSp, ALLOC.killCap);
  assert.equal(queueKill(r, 1234), ALLOC_RESULT.KILL_QUEUE_FULL);
  assert.equal(r.u16(ALLOC.killSp), ALLOC.killCap);
});

// ---------------------------------------------------------------- enemies
test('$2636D6 picks the band from D0/D1 and fills the record', () => {
  const r = new Ram();
  const a = allocEnemy(r, 0x10, 0x0000);            // not $20..$23, D1 >= 0
  assert.equal(a.carry, false);
  assert.equal(a.addr, ENEMY.bandCommon);           // $263708, 48 slots
  assert.equal(r.u16(a.addr), 0x8000);              // index 0 | $8000
  assert.equal(r.u8(a.addr + 0x0c), 0x10);          // $263728 move.b D0
  const b = allocEnemy(r, 0x21, 0x0000);            // $20 <= D0 <= $23
  assert.equal(b.addr, ENEMY.bandBoss);             // $2636EA, 8 slots
  const c = allocEnemy(r, 0x10, 0x8000);            // D1 < 0
  assert.equal(c.addr, ENEMY.bandSpecial);          // $2636FC, 2 slots
});

test('$263744: a full enemy band returns the dummy $81454C and SETS CARRY', () => {
  const r = new Ram();
  for (let i = 0; i < 2; i++) r.setU16(ENEMY.bandSpecial + i * ENEMY.stride, 0x8001);
  const a = allocEnemy(r, 0x10, 0x8000);
  assert.equal(a.carry, true, '$26374E ori #$1,SR');
  assert.equal(a.result, ENEMY_ALLOC.BAND_FULL);
  assert.equal(a.addr, ENEMY.dummy);
  assert.equal(a.addr, ENEMY.table + ENEMY.slots * ENEMY.stride,
    'the dummy is the byte immediately AFTER the 58-slot table');
});

test('$263502 walks 58 slots, compensates the scroll and throws by handler', () => {
  const r = new Ram();
  r.setU16(ENEMY.scrollDelta, 7);
  const rec = ENEMY.bandCommon;
  const sub = 0x816000;
  r.setU16(rec, 0x8000);
  r.setU32(rec + ENEMY.subRecOff, sub);
  r.setU32(rec + ENEMY.handlerOff, 0x2688cc);
  r.setU16(sub + 4, 1000);
  const e = grab(() => runEnemyDriver(r, new Map(), {}));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x2688cc);
  // the scroll compensation at $26352E happens BEFORE the dispatch, so it is
  // already applied when the throw lands
  assert.equal(r.u16(sub + 4), 993);
  assert.match(e.message, /FIVE distinct handlers/);
});

test('W549 $263502 executes both cartridge NULL handlers as $263762', () => {
  for (const handler of [0x26781c, 0x27e40a]) {
    const r = new Ram();
    const rec = ENEMY.bandCommon;
    const sub = 0x816000;
    r.setU16(rec, 0x8000);
    r.setU32(rec + ENEMY.subRecOff, sub);
    r.setU32(rec + ENEMY.handlerOff, handler);
    r.setU16(rec + ENEMY.seqOff, 0);

    assert.equal(runEnemyDriver(r, new Map(), {}), 1);
    assert.equal(r.u16(rec), 0, `$${handler.toString(16)} clears the record`);
    assert.equal(r.u8(sub), 1, `$${handler.toString(16)} marks its sub-record dead`);
    assert.equal(r.u16(ENEMY.liveCount), 0);
  }
});

test('$263502 counts survivors into $815E9C and splits by ($D,A5) bit 7 / bit 5',
  () => {
    const r = new Ram();
    const mk = (i, cls) => {
      const rec = ENEMY.bandCommon + i * ENEMY.stride;
      r.setU16(rec, 0x8000);
      r.setU32(rec + ENEMY.subRecOff, 0x816000 + i * 0x20);
      r.setU32(rec + ENEMY.handlerOff, 0x111111);
      r.setU16(rec + ENEMY.seqOff, 4);
      r.setU8(rec + ENEMY.classOff, cls);
    };
    mk(0, 0x00); mk(1, 0x20); mk(2, 0x80);
    const h = new Map([[0x111111, () => {}]]);
    assert.equal(runEnemyDriver(r, h, {}), 3);
    assert.equal(r.u16(ENEMY.liveCount), 3);        // $263546
    assert.equal(r.u16(ENEMY.sumA), 5);             // $26355A, one enemy, D0=4+1
    assert.equal(r.u16(ENEMY.sumB), 10);            // $263562, two enemies
  });

// ---------------------------------------------------------------- shots
test('$253ADE has 16 entries and the driver indexes it with (A6) & $F', () => {
  assert.equal(SHOT_HANDLERS.length, 16);
  const r = new Ram();
  r.setU16(SHOT.scrollDelta, 3);
  r.setU16(SHOT.p1Table, 0x814a);                   // low nibble $A -> entry 10
  r.setU16(SHOT.p1Table + 4, 500);
  const e = grab(() => runShotDriver(r, null, new Map(), {}));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, SHOT_HANDLERS[0xa]);
  assert.equal(e.romAddress, 0x253ec6);
  assert.equal(r.u16(SHOT.p1Table + 4), 497, '$253AA6 sub.w D6,($4,A6)');
  assert.equal(r.u16(SHOT.liveCount), 1, '$253AA0 addq.w #1,$81295C');
});

test('the shot driver covers BOTH players: 36 slots each, P2 straight after P1',
  () => {
    assert.equal(SHOT.p1Table + SHOT.slots * SHOT.stride, SHOT.p2Table);
    const r = new Ram();
    const seen = [];
    const h = new Map(SHOT_HANDLERS.map((a) => [a,
      (ram, rom, rec, ctx, prec) => seen.push([prec === SHOT.p1Rec ? 0 : 1,
        (rec - (prec === SHOT.p1Rec ? SHOT.p1Table : SHOT.p2Table)) / SHOT.stride])]));
    r.setU16(SHOT.p1Table + 2 * SHOT.stride, 0x8000);
    r.setU16(SHOT.p2Table + 5 * SHOT.stride, 0x8000);
    assert.equal(runShotDriver(r, null, h, {}), 2);
    assert.deepEqual(seen, [[0, 2], [1, 5]]);
    assert.equal(r.u16(SHOT.liveCount), 2);
  });

test('$253A70 snapshots scroll once before driving P1 then P2', () => {
  const r = new Ram();
  r.setU16(SHOT.scrollDelta, 3);
  r.setU16(SHOT.p1Table, 0x8000);
  r.setU16(SHOT.p1Table + 4, 500);
  r.setU16(SHOT.p2Table, 0x8000);
  r.setU16(SHOT.p2Table + 4, 500);
  const h = new Map(SHOT_HANDLERS.map((address) => [address,
    (ram, rom, rec, ctx, prec) => {
      if (prec === SHOT.p1Rec) ram.setU16(SHOT.scrollDelta, 100);
    }]));

  assert.equal(runShotDriver(r, null, h, {}), 2);
  assert.equal(r.u16(SHOT.p1Table + 4), 497);
  assert.equal(r.u16(SHOT.p2Table + 4), 497,
    'P2 uses the D6 value captured before P1 handlers run');
  assert.equal(r.u16(SHOT.scrollDelta), 100,
    'the witness mutates live RAM so a second read would disagree');
});

test('the shot live count $81295C is what the FRAME SYNC governor reads', () => {
  // $23C272 sums $81B40C + $81295C + 2*$81295E. A port that leaves $81295C at
  // zero while shots are on screen changes WHEN the frame is armed. Pinned here
  // so the coupling is not lost when someone "simplifies" the driver.
  assert.equal(SHOT.liveCount, 0x81295c);
});

test('u16 wraps the way the 68000 does, which every counter above relies on',
  () => {
    assert.equal(u16(0x10000), 0);
    assert.equal(u16(-1), 0xffff);
  });
