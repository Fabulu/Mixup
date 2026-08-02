// FIRING, THE TWO MOVEMENT LOOPS, AND THE KILL CHAIN -- the facts the five
// autofire scenarios cannot isolate, and the ones they cannot reach at all.
//
// The corpus comparison is the primary evidence for this wave: `autofire-normal`
// (599 frames, $44 = 0, 11 kills), `autofire-laser` (539, $44 = 1, 18 kills and
// three capsules), `autofire-double` (339, $44 = 2), `autofire-die` (239, the
// death with shots in the air) and `autofire-missile` (299, $41 = 1 into the
// floor) all compare 0 divergent frames over 551 fields. What that leaves for
// this file is what a per-frame diff cannot do:
//
//   1. ATTRIBUTION. A red w_0123 says a shot slot is wrong, not that $A12F's
//      cross-reload went to the wrong slot or that $A159's fall-through DEC was
//      dropped. Each test below names the mutation it was SEEN RED against.
//   2. BOUNDARIES. The corpus's shots die where they happen to die; the two X
//      kill thresholds ($F8 for subtypes 0/2, $F0 for the laser, and the extra
//      carry test in front of the second) need $F7/$F8 and $EF/$F0 driven
//      exactly.
//   3. ARITHMETIC. $84A9's BCD adder has three carries in it and the corpus
//      only ever adds $10 to a small score. Nine-to-ten and the wrap are here.
//   4. WHAT THE CARTRIDGE NEVER DID: the squadron counter UNDERFLOWING to 255,
//      the missile crawl throw, the armoured throw.
//
// EVERY TEST HERE WAS SEEN RED. The mutation is named at the assertion.

import test from 'node:test';
import assert from 'node:assert';

import { createState, ENEMY_BASE } from '../src/state.js';
import { fireWeapons, shotLoop, missileLoop, weaponUpdate, SLOT_A, SLOT_B, SLOT_M }
  from '../src/weapons.js';
import { shotSweep, collision } from '../src/collision.js';
import { killEnemy } from '../src/enemies.js';
import { bcdByte, scoreKill, addScore } from '../src/score.js';
import { updatePlayer } from '../src/player.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const A = 0x80;

/** A live stage-1 play state: the ship at the start position, nothing else. */
function ship({ weapon = 0, options = 0, missile = 0, held = 0, edge = 0 } = {}) {
  const s = createState();
  s.substate = 0x80;
  s.obj.status[0] = 1;                 // $0100 -- alive
  s.obj.x[0] = 80; s.obj.y[0] = 96;    // $0360 / $0320, the measured start
  s.zp.weapon = weapon;                // $44
  s.zp.options = options;              // $45
  s.zp.missile = missile;              // $41
  s.zp.autofire = 20;                  // $35, MEASURED $14 in stage 1
  s.input.held = held; s.input.pressed = edge;
  return s;
}

// ----------------------------------------------------- $A0E0, the three tables

test('$A0E0/$A0E3/$A0E6: $44 picks the two types and the sfx, and 1 is the LASER', () => {
  // MEASURED on the cartridge by forcing $44 and reading the slots at $80B5
  // (the three autofire scenarios' own artifacts):
  //   $44 = 0  slot A type $06 sub 0   slot B type $06 sub 0
  //   $44 = 1  slot A type $07 sub 1   slot B type $07 sub 1
  //   $44 = 2  slot A type $06 sub 0   slot B type $24 sub 2
  // NOTES-player.md 9 had 1 and 2 the wrong way round for the port's whole
  // life; wave 1 corrected the note and this is what holds it.
  // RED WHEN: $A0E3 and $A0E6 are swapped (the sfx id $01/$02/$01 is a
  // PLAUSIBLE type and a plausible subtype, which is why this is a table test
  // and not an eyeball).
  for (const [w, tA, tB, subA, subB] of [[0, 6, 6, 0, 0], [1, 7, 7, 1, 1],
                                         [2, 6, 0x24, 0, 2]]) {
    const s = ship({ weapon: w, held: A, edge: A });
    fireWeapons(s, res);
    assert.strictEqual(s.obj.anim[SLOT_A], tA, `$44 = ${w}: slot A type`);
    assert.strictEqual(s.obj.animFrame[SLOT_A], subA, `$44 = ${w}: slot A sub`);
    if (w === 2) {
      assert.strictEqual(s.obj.anim[SLOT_B], tB, 'DOUBLE fires slot B the SAME frame');
      assert.strictEqual(s.obj.animFrame[SLOT_B], subB, '$A261 STA $0166,X = $44');
    } else {
      assert.strictEqual(s.obj.anim[SLOT_B], 0,
        '$A12F BNE $A15C: at $44 != 2 the A-edge frame fires slot A ONLY');
    }
    // $A0E6 = 01 02 01, so the LASER's request is $02 and the other two are
    // $01 -- and DOUBLE makes the SAME request twice in one frame.
    assert.deepStrictEqual(s.sfx, [[1], [2], [1, 1]][w],
      '$A266 is the shared tail of both spawns');
  }
});

test('$A108 LDX $45: the Options fire on the same frame, each from its own $0360,X', () => {
  // MEASURED with $45 forced to 2: three shots on frame 400 at x = $82, $77,
  // $6C -- one per object, each from its own $0360,X -- and three timer pairs
  // all loaded with $14 on the same frame.
  // RED WHEN: the shot's X or Y is taken from the ship instead of from $0360,X /
  // $0320,X, or the timer is written to one shared byte.
  //
  // THE ORDER IS NOT TESTED HERE AND THIS TEST USED TO CLAIM IT WAS. Its
  // "RED WHEN: the loop runs 0..$45 instead of $45..0" was measurably false:
  // the probe it relied on read `s.spawnOrderProbe`, which exists nowhere in
  // games/gradius/src, so the array it filled was [undefined, undefined,
  // undefined] and was never asserted on either. Reversing the loop was green
  // here, on all 222 unit tests and on eight oracle scenarios (wave 6 QA).
  // Corrected in the same commit as the test that DOES catch it:
  // tests/weapons-unwitnessed.test.js, "$A108: Option 2 fires FIRST and the
  // player LAST", which snapshots $0123-$0125 at each $EC1E request and was
  // seen RED against exactly that reversal.
  const s = ship({ options: 2, held: A, edge: A });
  s.obj.x[1] = 0x77; s.obj.y[1] = 90;         // Option 1, trailing
  s.obj.x[2] = 0x6C; s.obj.y[2] = 84;         // Option 2, trailing further
  fireWeapons(s, res);
  assert.deepStrictEqual([s.obj.x[3], s.obj.x[4], s.obj.x[5]], [80, 0x77, 0x6C],
    'each shot starts at ITS OWN owner\'s $0360,X');
  assert.deepStrictEqual([s.obj.y[3], s.obj.y[4], s.obj.y[5]], [96, 90, 84]);
  assert.deepStrictEqual([s.obj.carrier[3], s.obj.carrier[4], s.obj.carrier[5]],
    [20, 20, 20], '$A11F STA $03A3,X -- three separate timers, same $35');
  assert.strictEqual(s.sfx.length, 3, 'three spawns, three $EC1E requests');
});

// ------------------------------------------- $A10A-$A159, the timer semantics

test('$A10A: the timer is FROZEN while the slot is occupied -- cadence = life + $35', () => {
  // THE WAVE'S HEADLINE RULE. `$A10A LDA $0123,X / BNE $A134` leaves $03A3,X
  // alone, so a shot in flight does not tick its own reload. MEASURED over 300
  // frames of held A: spawns at 400, 444, 488, 530, 574, 618, 660 -- gaps of
  // 44 per slot, i.e. 24 frames of flight (80 -> $F8 at 7 px) plus $14.
  // RED WHEN: the port DECs the timer regardless of occupancy (a fixed 21-frame
  // cadence), which is the recon's own negative control.
  const s = ship({ held: A, edge: A });
  fireWeapons(s, res);                        // frame 0: fires, timer := 20
  assert.strictEqual(s.obj.carrier[SLOT_A], 20);
  s.input.pressed = 0;                        // $05 is an EDGE: one frame only
  s.obj.anim[SLOT_B] = 6;                     // slot B busy, so its cross-reload
                                              // cannot hide slot A's timer
  for (let f = 0; f < 10; f++) { fireWeapons(s, res); }
  assert.strictEqual(s.obj.carrier[SLOT_A], 20,
    'ten frames with the slot occupied and the timer has not moved');
  s.obj.anim[SLOT_A] = 0;                     // the shot dies (x >= $F8)
  fireWeapons(s, res);
  assert.strictEqual(s.obj.anim[SLOT_A], 0,
    'the frame the slot frees, the timer is still 20 -- no refire yet');
  assert.strictEqual(s.obj.carrier[SLOT_A], 19, '$A131 DEC $03A3,X');
});

test('$A159: slot B\'s spawn frame reads $35 - 1, and slot A\'s reads $35', () => {
  // The asymmetry is a FALL-THROUGH: $A154 cross-reloads slot A's timer and then
  // runs into $A159 `DEC $03A6,X`, while $A12F's BNE jumps slot A over its own
  // DEC. MEASURED on the cartridge at f421, the slot-B spawn frame:
  //     tm[3] = $14   tm[6] = $13     on the same row.
  // RED WHEN: the DEC is moved above the cross-reload, or given to both slots.
  const s = ship({ held: A });
  s.obj.carrier[SLOT_B] = 0;                  // slot B's timer has run out
  s.obj.carrier[SLOT_A] = 5;                  // slot A is mid-count, slot free
  fireWeapons(s, res);
  assert.strictEqual(s.obj.anim[SLOT_B], 6, 'slot B fired ($A146 JSR $A250)');
  assert.strictEqual(s.obj.carrier[SLOT_B], 19, '$A149 STA $35 then $A159 DEC');
  assert.strictEqual(s.obj.carrier[SLOT_A], 20, '$A154 STA $03A3,X -- NOT DECd');
});

test('$A131 is a FALL-THROUGH: a ticking slot A still lets slot B be evaluated', () => {
  // `$A113 LDA $03A3,X / BNE $A131` DECs and then runs INTO $A134. That is how
  // the two slots alternate at $44 != 2 -- and a port that `continue`d here
  // would fire slot A only, at half the rate, with slot B never used.
  // RED WHEN: $A131 returns instead of falling through.
  const s = ship({ held: A });
  s.obj.carrier[SLOT_A] = 3;                  // ticking
  s.obj.carrier[SLOT_B] = 0;                  // ready
  fireWeapons(s, res);
  assert.strictEqual(s.obj.carrier[SLOT_A], 20,
    'slot A ticked to 2 and then B\'s cross-reload put it back to $35');
  assert.strictEqual(s.obj.anim[SLOT_B], 6, 'slot B fired on the same frame');
});

test('$A10F: the A EDGE fires through a running timer; A HELD does not', () => {
  // Two different gates on two different bytes ($05 and $07). A single TAP must
  // fire even mid-cooldown -- that is what makes tapping faster than holding.
  // RED WHEN: the edge test is dropped, or read from $07.
  const held = ship({ held: A });
  held.obj.carrier[SLOT_A] = 9;
  held.obj.anim[SLOT_B] = 6;                  // busy: $A154's cross-reload would
                                              // otherwise put $35 back into
                                              // $03A3,X on the same frame
  fireWeapons(held, res);
  assert.strictEqual(held.obj.anim[SLOT_A], 0, 'A HELD waits for the timer');
  assert.strictEqual(held.obj.carrier[SLOT_A], 8, '...and ticks it');

  const tap = ship({ held: A, edge: A });
  tap.obj.carrier[SLOT_A] = 9;
  fireWeapons(tap, res);
  assert.strictEqual(tap.obj.anim[SLOT_A], 6, 'the EDGE ignores the timer');
});

test('$A15C: the missile needs $41, a free slot and A HELD -- and has NO timer', () => {
  // MEASURED: the missile's only rate limit is the flight time of the one live
  // missile per object, and a single tap of A fires a shot and no missile.
  // RED WHEN: the missile is gated on the edge, or given a timer of its own.
  const tap = ship({ missile: 1, edge: A });   // pressed but not held
  fireWeapons(tap, res);
  assert.strictEqual(tap.obj.anim[SLOT_M], 0, '$A165 LDA $9B: HELD, not the edge');
  assert.strictEqual(tap.obj.anim[SLOT_A], 6, '...and the shot fired anyway');

  const hold = ship({ missile: 1, held: A });
  fireWeapons(hold, res);
  assert.strictEqual(hold.obj.anim[SLOT_M], 0x0A, '$A27A LDA #$0A');
  assert.strictEqual(hold.obj.animFrame[SLOT_M], 3, '$A27F LDA #$03');
  assert.strictEqual(hold.obj.y[SLOT_M], 96 + 6, '$A275 ADC #$06');
  assert.deepStrictEqual(hold.sfx, [1],
    'ONE request: the shot\'s. $A26B has no JMP $EC1E -- the missile is silent');

  const off = ship({ missile: 0, held: A });
  fireWeapons(off, res);
  assert.strictEqual(off.obj.anim[SLOT_M], 0, '$A15E BEQ $A16C');
});

// ------------------------------------------------- $A16F/$A1E6, the two loops

test('$A1FD/$A22B: subtypes 0 and 2 die at x >= $F8, the LASER at x >= $F0', () => {
  // Two different thresholds, and the laser's has a carry test in front of it
  // because $0C can carry out of the add where 7 and 4 cannot. Driven at the
  // exact boundary rather than at whatever the corpus's shots reached.
  // RED WHEN: either threshold is used for the other subtype, or the CMP is
  // made `>` instead of `>=`.
  const fly = (sub, x0) => {
    const s = ship();
    s.obj.anim[SLOT_A] = 6; s.obj.animFrame[SLOT_A] = sub;
    s.obj.x[SLOT_A] = x0; s.obj.y[SLOT_A] = 96;
    shotLoop(s);
    return s.obj.anim[SLOT_A] === 0 ? 'dead' : s.obj.x[SLOT_A];
  };
  assert.strictEqual(fly(0, 0xF0), 0xF7, 'subtype 0: $F0 + 7 = $F7, still alive');
  assert.strictEqual(fly(0, 0xF1), 'dead', '...and $F8 is the first dead value');
  assert.strictEqual(fly(1, 0xE3), 0xEF, 'the laser: $E3 + $0C = $EF, alive');
  assert.strictEqual(fly(1, 0xE4), 'dead', '...and $F0 kills it');
  assert.strictEqual(fly(1, 0xFA), 'dead', '$A229 BCS: the add carried');
  assert.strictEqual(fly(2, 0xF0), 0xF4, 'subtype 2 steps 4, not 7');
});

test('$A218: the DOUBLE\'s diagonal dies at the TOP before it moves in X', () => {
  // `$A20F SBC #$04 / $A218 CMP #$10 / BCC $A201` -- the Y test is FIRST, and
  // the arm then re-enters the subtype-0 code at $A1F6 with A = 4. So a shot
  // that leaves the top of the screen never takes its X step that frame.
  // RED WHEN: the two halves are reordered, or subtype 2 gets its own X kill.
  const s = ship();
  s.obj.anim[SLOT_B] = 0x24; s.obj.animFrame[SLOT_B] = 2;
  s.obj.x[SLOT_B] = 100; s.obj.y[SLOT_B] = 0x13;
  shotLoop(s);
  assert.strictEqual(s.obj.y[SLOT_B], 0x0F, '$A213 SBC #$04');
  assert.strictEqual(s.obj.anim[SLOT_B], 0, 'y < $10 -> $A201 frees it');
  assert.strictEqual(s.obj.x[SLOT_B], 100, '...and X never moved');
});

test('$A1AF: the missile flies y += 2 and x += 0.5, and dies at y >= $C8', () => {
  // MEASURED with $41 = 1 and the ship at Y $60: the missile spawns at
  // ($50, $68) and thereafter $0329 goes up by 2 a frame with $0389
  // alternating $80/$00 -- exactly the $A1A4 fly row.
  // RED WHEN: the 16-bit X add drops its carry (the missile then never moves in
  // X at all), or the $C8 test is `>`.
  const s = ship();
  s.obj.anim[SLOT_M] = 0x0A; s.obj.animFrame[SLOT_M] = 3;
  s.obj.x[SLOT_M] = 0x50; s.obj.y[SLOT_M] = 0x68; s.obj.xf[SLOT_M] = 0;
  missileLoop(s, res);
  assert.deepStrictEqual([s.obj.y[SLOT_M], s.obj.x[SLOT_M], s.obj.xf[SLOT_M]],
    [0x6A, 0x50, 0x80], 'y += 2, x += $0080');
  missileLoop(s, res);
  assert.deepStrictEqual([s.obj.y[SLOT_M], s.obj.x[SLOT_M], s.obj.xf[SLOT_M]],
    [0x6C, 0x51, 0x00], '...and the second frame carries into the integer');
});

test('$A1B9: a missile fired at the floor is BORN DEAD, silently, every frame', () => {
  // The ship's Y clamp is $C0 ($A052), the missile is born at $C6 ($A275 ADC
  // #$06) and the fly step makes it $C8 on the SAME frame, which is the first
  // value `CMP #$C8 / BCS` rejects. So the slot is free again next frame and
  // $A26B runs AGAIN -- for as long as A is held, with no sound at all.
  // `autofire-missile` is the corpus scenario that holds this; here it is
  // driven through updatePlayer() so the spawn and the loop are the same frame.
  // RED WHEN: the missile is modelled as "one every N frames", or the loop runs
  // before the firing block.
  const s = ship({ missile: 1, held: A });
  s.obj.y[0] = 0xC0;                          // parked on the floor
  for (let f = 0; f < 5; f++) {
    s.sfx.length = 0;
    updatePlayer(s, res);
    assert.strictEqual(s.obj.anim[SLOT_M], 0,
      `frame ${f}: the missile was born at $C6, stepped to $C8 and died`);
    assert.ok(!s.sfx.includes(0x0A), 'and made no sound of its own');
  }
});

test('$9FFC JMP $A16F: a DYING ship still flies its shots, and still fires none', () => {
  // The dead gate lands PAST the firing block and INSIDE the movement loops.
  // MEASURED on the cartridge by forcing $0100 = 3: zero writes to $0360 from
  // either of its writers -- and `autofire-die` compares 120 such frames.
  // RED WHEN: the whole of $9FFC is gated on $0100 (the shots freeze in the air
  // for 120 frames), or the firing block runs while dead (a dead ship shoots).
  const s = ship({ held: A, edge: A });
  s.obj.anim[SLOT_A] = 6; s.obj.animFrame[SLOT_A] = 0;
  s.obj.x[SLOT_A] = 100; s.obj.y[SLOT_A] = 96;
  s.obj.status[0] = 2;                        // $0100 -- exploding
  s.obj.anim[SLOT_B] = 0;
  updatePlayer(s, res);
  assert.strictEqual(s.obj.x[SLOT_A], 107, 'the shot in the air kept flying');
  assert.strictEqual(s.obj.anim[SLOT_B], 0, 'and nothing new was fired');
  assert.strictEqual(s.sfx.length, 0, '$EC1E was not called');
});

test('the three loops are fixed-shape: 6 shots, 3 missiles, $45 + 1 objects', () => {
  // docs/knowledge/06 mechanism (C) -- an object loop that only partly completes
  // -- answered NO in the wave that introduces the loops. Each loop asserts its
  // own count in src/weapons.js; this drives them full and empty.
  // RED WHEN: any loop is given an early exit.
  for (const opts of [0, 1, 2]) {
    const s = ship({ options: opts, held: A, edge: A, missile: 1 });
    assert.doesNotThrow(() => weaponUpdate(s, res, true));
    const fired = [3, 4, 5].filter((i) => s.obj.anim[i] !== 0).length;
    assert.strictEqual(fired, opts + 1, `$45 = ${opts}: ${opts + 1} shot A slots`);
  }
  const full = ship({ held: A, edge: A });
  for (let i = 3; i <= 11; i++) { full.obj.anim[i] = 6; full.obj.animFrame[i] = 0;
    full.obj.x[i] = 0x10; full.obj.y[i] = 96; }
  assert.doesNotThrow(() => weaponUpdate(full, res, true),
    'every slot occupied is still exactly six and three iterations');
});

// ------------------------------------------------------------ the kill chain

/** A state with one shot over one enemy, both at (100, 100). */
function shotOnEnemy({ sub = 0, x = 0, type = 0x85, status = 0, carrier = 0 } = {}) {
  const s = ship();
  const i = ENEMY_BASE + 4;
  s.obj.type[i] = type; s.obj.status[i] = status; s.obj.carrier[i] = carrier;
  s.obj.x[i] = 100; s.obj.y[i] = 100;
  s.obj.anim[3 + x] = 6; s.obj.animFrame[3 + x] = sub;
  s.obj.x[3 + x] = 100; s.obj.y[3 + x] = 100;
  return s;
}

test('$C0AE: the LASER survives its own hit and keeps sweeping; a shot does not', () => {
  // `CMP #$01 / BEQ $C0C6` returns without $C0B7's four stores. MEASURED as a
  // consequence: 18 kills at $44 = 1 against 11 at $44 = 0 in the same 600-frame
  // window, and $C0C6 (the laser's RTS) entered on every one of the 18.
  // RED WHEN: the laser is consumed like every other subtype -- which is red on
  // `autofire-laser` too, at the first kill frame.
  const laser = shotOnEnemy({ sub: 1 });
  const second = ENEMY_BASE + 2;
  laser.obj.type[second] = 0x85; laser.obj.x[second] = 100; laser.obj.y[second] = 100;
  shotSweep(laser, res);
  assert.strictEqual(laser.obj.anim[3], 6, 'the laser is still in its slot');
  assert.strictEqual(laser.obj.type[ENEMY_BASE + 4], 2, 'enemy 4 died ($BED3)');
  assert.strictEqual(laser.obj.type[second], 2, '...and so did enemy 2, same frame');
  assert.deepStrictEqual([...laser.score.slice(4, 7)], [0x20, 0, 0],
    'two kills, $10 each, in BCD');

  const shot = shotOnEnemy({ sub: 0 });
  shot.obj.type[second] = 0x85; shot.obj.x[second] = 100; shot.obj.y[second] = 100;
  shotSweep(shot, res);
  assert.strictEqual(shot.obj.anim[3], 0, '$C0BD STA $0123,X -- consumed');
  assert.strictEqual(shot.obj.type[second], 0x85,
    '$C0BB STA $A9 ended the inner sweep, so enemy 2 was never tested');
});

test('$C011 BPL: an enemy on its spawn frame is skipped, and the shot FLIES ON', () => {
  // Bit 7 of $030C is wave 3's INITIALISED flag, and $C011 skips the enemy
  // before the box is even computed: the shot is not consumed, no score is
  // added, and the sweep carries on to the next slot.
  // RED WHEN: the `o.type[e] & 0x80` filter is dropped -- a shot then kills an
  // enemy on the frame it spawns, one frame before the cartridge lets it.
  //
  // THE TITLE OF THIS TEST USED TO SAY "absorbs the shot without dying", which
  // its own second assertion contradicts, and its comment claimed `$C055`'s own
  // `BPL $C0B7` was the live alternative that DOES consume the shot. IT IS NOT
  // REACHABLE. Full PRG scan for JSR/JMP $C055 over $8000-$FFFF: one hit,
  // `$C02D JSR $C055`, and $C02D is only reached when `$C011 LDA $030C,Y /
  // $C014 BPL $C030` was NOT taken. Y is untouched in between ($C020 loads X),
  // and $C055's first two instructions are `B9 0C 03 / 10 5D` -- the same byte,
  // the same Y, the same test. So the port's first line of hitEnemy() is a
  // faithful transcription of an arm the cartridge cannot enter, and deleting
  // its freeShotSlot() is green on everything (wave 6 QA). Corrected here; the
  // matching claim in src/collision.js's $C011 paragraph is a wave-6 finding
  // that a test writer may not fix.
  const s = shotOnEnemy({ type: 0x05 });      // bit 7 CLEAR: not initialised
  shotSweep(s, res);
  assert.strictEqual(s.obj.type[ENEMY_BASE + 4], 0x05, 'still alive');
  assert.strictEqual(s.obj.anim[3], 6, '$C011 does not even consume the shot');
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0, 0, 0], '...and $8463 never ran');
  assert.deepStrictEqual(s.sfx, [], '...and $BEA2 requested no death sound');
});

test('$BFD2: the laser is $30 wide where a shot is $10 -- the same enemy, twice', () => {
  // The one table entry that makes a laser different before $C0AE. dx is
  // compared against the SHOT's width ($A3), never the enemy's.
  // RED WHEN: the width is read from $BFDA (the ENEMY's table -- whose entry 1
  // is $20, a plausible-looking value that accepts dx 31 and rejects 33).
  const at = (sub, dx) => {
    const s = shotOnEnemy({ sub });
    s.obj.x[3] = 100 - 8 + dx - 0;            // a0 = x + $BFCE[sub]
    if (sub === 1) s.obj.x[3] = 100 - 0x10 + dx;
    shotSweep(s, res);
    return s.obj.type[ENEMY_BASE + 4] === 2;
  };
  assert.strictEqual(at(0, 0x0F), true, 'an ordinary shot reaches 15 px');
  assert.strictEqual(at(0, 0x10), false, '...and not 16');
  assert.strictEqual(at(1, 0x2F), true, 'the laser reaches 47 px');
  assert.strictEqual(at(1, 0x30), false, '...and not 48');
});

test('$BEB1: the squadron counter UNDERFLOWS to 255, and 1 -> 0 makes a CARRIER', () => {
  // `DEC $48,X / BNE $BEB7` branches on the RESULT, with A = 0: non-zero clears
  // the carrier byte, zero falls into `LDA #$01`. Nothing tests for 0 first.
  // The corpus reaches the 1 -> 0 case (autofire-laser drops three capsules);
  // NOTHING reaches the underflow, and it is reproduced because a port that
  // clamped at 0 would hand out a capsule for every later kill of that group.
  // RED WHEN: the DEC is clamped, or the BNE's sense is inverted.
  const s = ship();
  const i = ENEMY_BASE + 4;
  s.obj.type[i] = 0x85; s.obj.carrier[i] = 3;  // group id 3
  s.squad[3] = 2;
  killEnemy(s, res, 4);
  assert.strictEqual(s.squad[3], 1, 'DEC $48,X');
  assert.strictEqual(s.obj.carrier[i], 0, 'not the last member: carrier cleared');

  const last = ship();
  last.obj.type[i] = 0x85; last.obj.carrier[i] = 3;
  last.squad[3] = 1;
  killEnemy(last, res, 4);
  assert.strictEqual(last.squad[3], 0);
  assert.strictEqual(last.obj.carrier[i], 1, '$BEB5 LDA #$01 -- it drops a capsule');

  const under = ship();
  under.obj.type[i] = 0x85; under.obj.carrier[i] = 3;
  under.squad[3] = 0;
  killEnemy(under, res, 4);
  assert.strictEqual(under.squad[3], 255, 'the counter WRAPS, it does not clamp');
  assert.strictEqual(under.obj.carrier[i], 0, 'and this one drops nothing');
});

test('$BEBC: the explosion script comes from type AND $1F -- $1A is 3, $05 is 0', () => {
  // AND $1F, not AND $7F: an INITIALISED fan ($85) and a raw one ($05) pick the
  // same script 0. $BE93 also has to leave the slot in the exact shape $AE99
  // expects -- type 2, status 0, timer 3, metasprite 0 and the script cursor
  // $042C zeroed, or the explosion plays from the middle of the last one.
  // RED WHEN: the mask is $7F (an initialised fan then takes the default 1), or
  // any of the six stores at $BEDB-$BEE8 is dropped.
  // $A5 is the case that separates the two masks and NOTHING ELSE DOES: for
  // every type any measured run has produced, AND $1F and AND $7F agree. That
  // is why this row is here -- a deliberate `AND #$7F` was GREEN on the whole
  // corpus AND on this test's first five rows. LISTING-DERIVED: no run has
  // spawned a type with bit 5 or 6 set.
  for (const [type, want] of [[0x85, 0], [0x05, 0], [0x9A, 3], [0x1A, 3],
                              [0x87, 1], [0xA5, 0]]) {
    const s = ship();
    const i = ENEMY_BASE + 4;
    s.obj.type[i] = type; s.obj.status[i] = 5; s.obj.anim[i] = 0x30;
    s.obj.attrMask[i] = 3; s.obj.xvel[i] = 9; s.obj.timer[i] = 4;
    killEnemy(s, res, 4);
    assert.strictEqual(s.obj.animFrame[i], want, `type ${type.toString(16)}`);
    assert.strictEqual(s.obj.type[i], 2, '$BED3 -- handler 2, the explosion');
    assert.strictEqual(s.obj.timer[i], 3, '$BED8');
    assert.deepStrictEqual([s.obj.status[i], s.obj.anim[i], s.obj.attrMask[i],
      s.obj.xvel[i]], [0, 0, 0, 0], '$BEDD-$BEE8');
  }
});

test('$BE9D: the kill sound is $BE6E[type AND $7F], and type 1 is SILENT', () => {
  // The capsule (type 1) has a 0 entry, so $BEA0's BEQ skips $EC1E: shooting a
  // capsule makes no sound. The fan (type 5) is $06.
  // RED WHEN: the 0 entry is requested anyway (wave 8's driver asserts on a
  // request with low 6 bits 0, so this would be a crash later, not a silence).
  const one = (type) => {
    const s = ship();
    s.obj.type[ENEMY_BASE + 4] = type;
    killEnemy(s, res, 4);
    return s.sfx;
  };
  assert.deepStrictEqual(one(0x85), [6], 'the fan');
  assert.deepStrictEqual(one(0x81), [], 'the capsule is silent');
  assert.deepStrictEqual(one(0xA2), [], 'type $22 is past $BE99\'s CPX #$22');
});

// ------------------------------------------------------------------ the score

test('$84A9: the BCD adder carries at 9 -> 10 and at $99 -> $00, in three bytes', () => {
  // `CMP #$0A / ADC #$05` adds SIX, because the CMP leaves the carry set. A port
  // that adds five turns $0A into $0F and every carried digit is wrong.
  // RED WHEN: the +5 is written without the carry, or the $A0 subtract is
  // dropped (the high nibble then reads $A0-$F0 instead of carrying).
  assert.deepStrictEqual(bcdByte(0x09, 0x01, false), { byte: 0x10, carry: false });
  assert.deepStrictEqual(bcdByte(0x99, 0x01, false), { byte: 0x00, carry: true });
  assert.deepStrictEqual(bcdByte(0x50, 0x50, false), { byte: 0x00, carry: true });
  assert.deepStrictEqual(bcdByte(0x00, 0x00, true), { byte: 0x01, carry: false });
  assert.deepStrictEqual(bcdByte(0x45, 0x37, false), { byte: 0x82, carry: false });

  const s = ship();
  s.score[4] = 0x90; s.score[5] = 0x99; s.score[6] = 0x00;   // $07E4-$07E6
  addScore(s, 0x10, 0, 0);                    // $8463's +$0010
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x00, 0x00, 0x01],
    'the carry walks all three bytes');
});

test('$8463: a kill is +$0010, and $846F makes the attract demo score nothing', () => {
  // RED WHEN: $845B's $50 is used for the kill (that one is the capsule's, and
  // src/powerup.js calls it from $8969), or the $09 gate is dropped.
  const s = ship();
  scoreKill(s);
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x10, 0, 0]);
  scoreKill(s);
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x20, 0, 0]);

  const demo = ship();
  demo.zp09 = 1;                              // $09 -- the attract demo
  scoreKill(demo);
  assert.deepStrictEqual([...demo.score.slice(4, 7)], [0, 0, 0], '$8473 RTS');
});

test('$84D3/$84F7: the extra life and the TOP copy, neither of which the corpus reaches', () => {
  // $2A is $02 in every scenario's seed and TOP is 00 50 00, so both arms are
  // fall-through on all 7047 compared frames. Driven here at their boundaries.
  // RED WHEN: the compare at $84D9 is `>` instead of `>=`, the threshold is not
  // incremented (every later kill then grants another life), or the TOP copy
  // runs when TOP is BIGGER.
  const s = ship();
  s.extraLife[0] = 0x02; s.lives[0] = 3;
  s.score[4] = 0x90; s.score[5] = 0x99; s.score[6] = 0x01;   // one kill short
  scoreKill(s);                                              // -> $02 00 00
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x00, 0x00, 0x02]);
  assert.strictEqual(s.lives[0], 4, '$84F0 INC $20,X');
  assert.strictEqual(s.extraLife[0], 0x03, '$84E5 -- the threshold moves up');
  assert.ok(s.sfx.includes(0x36), '$84F2 LDA #$36');
  assert.deepStrictEqual([...s.score.slice(0, 3)], [0x00, 0x00, 0x02],
    '$8505: TOP was 0 here, so the player\'s score is copied into it');

  const lower = ship();
  lower.score[0] = 0x00; lower.score[1] = 0x50; lower.score[2] = 0x00;  // 50000
  lower.extraLife[0] = 0x02;
  scoreKill(lower);
  assert.deepStrictEqual([...lower.score.slice(0, 3)], [0x00, 0x50, 0x00],
    'TOP is bigger: $8500 BNE $850F leaves it alone');
  assert.strictEqual(lower.lives[0], 0, '...and no extra life');
});

// ------------------------------------------------- what the cartridge never did

test('$C3C6: the LASER probes the terrain at x + $0B, because the CMP set the carry', () => {
  // `$C3BF CMP #$01 / $C3C4 BNE $C3CE` -- the laser arm is the EQUAL arm, so
  // `$C3C9 ADC #$0A` is entered with the carry SET and adds ELEVEN. src/
  // collision.js said "+$0A X offset" from wave 5 until this commit.
  // LISTING-DERIVED: the collision map is 0 everywhere the corpus reaches, so
  // no recorded frame can tell $0A from $0B -- a deliberate +$0A was GREEN on
  // all 28 scenarios. This is what closes it.
  // RED WHEN: the carry is dropped from either of $C3AF's two ADCs.
  const at = (sub, x0) => {
    const s = ship();
    s.obj.anim[3] = 6; s.obj.animFrame[3] = sub;
    s.obj.x[3] = x0; s.obj.y[3] = 96;
    // x0 = $55: the laser's probe point ($60) is in cell $066B and an $0A
    // offset ($5F) is in $0663 -- the two straddle an 8-px column boundary.
    s.coll[0x6B] = 0x10;                      // field 1 at tile row 14: solid
    collision(s, res);
    return s.obj.anim[3];
  };
  assert.strictEqual(at(1, 0x55), 0, 'the laser reached the cell and was absorbed');
  assert.strictEqual(at(0, 0x55), 6, 'an ordinary shot probes at its own x and misses');
});

// $BF7D asserted a THROW in the test above until wave 11. Inverted rather than
// deleted (rule 6): what replaced it is held to what the throw's text promised.

test('$BF7D: a shot destroys an enemy bullet -- INC $5D, +$0010, sfx $09', () => {
  // `$C030 JSR $BF75` runs on EVERY iteration of the inner sweep, hit or miss.
  // The bullet is put at index 9, the FIRST the sweep visits, because the enemy
  // at index 4 consumes the shot and ends the sweep ($C0BB STA $A9) before a
  // lower index is reached.
  //
  // The shot's own hit point for subtype 0 is (x + $BFCE[0], y + $BFD6[0]) =
  // (108, 108) with width $BFD2[0] = $10; $BF7D tests Y first against the
  // CONSTANT $10 and only then X against that width, with `$BF87 SBC` taking a
  // clear carry -- so the bullet has to sit inside (91, 107] x (92, 107].
  //
  // RED WHEN: the axes are swapped, the constant $10 becomes the width, the -1
  // is dropped, $5D is not INCremented, or the score/sfx are missing.
  const put = (type, ms = 0x25) => {
    const s = shotOnEnemy();
    s.obj.type[22 + 9] = type;                // $0316,Y
    s.obj.anim[22 + 9] = ms;                  // $0136,Y
    s.obj.animFrame[22 + 9] = 0;              // $0176,Y
    s.obj.x[22 + 9] = 100; s.obj.y[22 + 9] = 100;
    s.sfx.length = 0;
    shotSweep(s, res);
    return s;
  };
  const hit = put(1);
  assert.strictEqual(hit.obj.anim[22 + 9], 0, '$BFA8 STA $0136,Y');
  assert.strictEqual(hit.obj.animFrame[22 + 9], 0, '$BFAB STA $0176,Y');
  assert.strictEqual(hit.obj.type[22 + 9], 0, '$BFAE STA $0316,Y');
  assert.strictEqual(hit.spawn.z5D, 1, '$BF9F INC $5D -- a WATCHED byte');
  assert.deepStrictEqual([...hit.score.slice(4, 7)], [0x10, 0, 0], '$BFB1 JSR $8463');
  assert.ok(hit.sfx.includes(0x09), '$BFB4 LDA #$09 / JSR $EC1E');
  assert.strictEqual(hit.obj.anim[3], 0, '$C0AE falls into $C0B7: the shot goes');
  assert.strictEqual(hit.obj.type[ENEMY_BASE + 4], 0x85,
    'and the sweep ENDED there -- the enemy behind the bullet is untouched');

  // Type 2 is the other way round: the SHOT is the casualty, sfx $05, and the
  // bullet lives. Nothing scores.
  const clink = put(2);
  assert.strictEqual(clink.obj.type[22 + 9], 2, '$BF95 BNE not taken -> $BF97');
  assert.deepStrictEqual(clink.sfx, [0x05], '$BF97 LDA #$05, and no $09');
  assert.strictEqual(clink.obj.anim[3], 0, '$BF9C JMP $C0B7');
  assert.deepStrictEqual([...clink.score.slice(4, 7)], [0, 0, 0], 'no $8463');
  assert.strictEqual(clink.spawn.z5D, 0, 'and no INC $5D');

  // A miss on Y: one pixel past the constant $10, with X still inside.
  const miss = shotOnEnemy();
  miss.obj.type[22 + 9] = 1; miss.obj.anim[22 + 9] = 0x25;
  miss.obj.animFrame[22 + 9] = 0;
  miss.obj.x[22 + 9] = 100; miss.obj.y[22 + 9] = 92;   // dy = 108 - 92 = $10
  shotSweep(miss, res);
  assert.strictEqual(miss.obj.type[22 + 9], 1, '$BF85 BCS $BF7C at dy == $10');
});

test('$BFBB: metasprite $59 consumes even the LASER; anything else does not', () => {
  // `LDA $AA / CMP #$59 / BEQ $BFC2` -- $BFC2 is JMP $C0B7 (free the shot);
  // $BFBF is JMP $C0AE, where subtype 1 returns before the free. So the KIND-1
  // bullet ($BC64[1] = $59) is the one that stops a laser. Unreachable on the
  // cartridge -- $BC77 needs a firing enemy with status $80-$8F and MEASURED
  // n=0 -- so this is the listing read carefully, and it is labelled as such.
  // RED WHEN: the $59 test is dropped and the laser survives both kinds.
  const laser = (ms) => {
    const s = shotOnEnemy({ sub: 1 });
    s.obj.type[22 + 9] = 1; s.obj.anim[22 + 9] = ms;
    s.obj.animFrame[22 + 9] = 0;
    s.obj.x[22 + 9] = 100; s.obj.y[22 + 9] = 100;
    shotSweep(s, res);
    return s.obj.anim[3];
  };
  assert.strictEqual(laser(0x59), 0, '$BFC2 JMP $C0B7 -- consumed');
  assert.strictEqual(laser(0x25), 6, '$BFBF JMP $C0AE -- the laser flies on');
});

test('$A19E: the missile CRAWL -- metasprite $08, x += 2, Y frozen', () => {
  // WAVE 22 PORTED THIS ARM and this test replaces the `assert.throws(/\$A19E/)`
  // that used to stand in for it. The crawl is `LDY #$01 / LDA #$08 / BNE
  // $A1AC`: row 1 of the same three tables the fly path reads --
  // $A1A5 = $00 (dY), $A1A7 = $02 (dX int), $A1A9 = $00 (dX frac).
  //
  // RED WHEN: `y = 1` becomes `y = 0` (the missile then falls 2 and drifts 0.5,
  //           i.e. exactly the fly row, and x lands on 80 not 82);
  //       OR: `o.anim[i] = 0x08` becomes $0A;
  //       OR: the whole arm is deleted and the wall-free runs instead.
  const crawl = ship();
  crawl.obj.anim[SLOT_M] = 0x0A; crawl.obj.animFrame[SLOT_M] = 3;
  crawl.obj.x[SLOT_M] = 80; crawl.obj.y[SLOT_M] = 96; crawl.obj.xf[SLOT_M] = 0;
  // The missile probes at Y + 4 ($C3BB ADC #$03 with the carry CPX #$06 set),
  // i.e. at (80, 100): cell $055B, 2-bit field 3 -> the value $40. The second
  // probe, 8 up and 8 right, lands in cell $0563, which is empty -- so this is
  // the floor, not a wall, and $A19E selects the CRAWL.
  crawl.coll[0x5B] = 0x40;
  missileLoop(crawl, res);
  assert.strictEqual(crawl.obj.anim[SLOT_M], 0x08, '$A1A0 LDA #$08 / $A1AC STA');
  assert.strictEqual(crawl.obj.y[SLOT_M], 96, '$A1A5 = $00: a crawler does not fall');
  assert.strictEqual(crawl.obj.x[SLOT_M], 82, '$A1A7 = $02: 2 px/frame right');
  assert.strictEqual(crawl.obj.xf[SLOT_M], 0, '$A1A9 = $00, no sub-pixel');
  assert.strictEqual(crawl.obj.animFrame[SLOT_M], 3, 'still alive: no $A1D6');
});

test('the unported arms are loud, and each names its ROM address', () => {
  // docs/knowledge/02: an honest gap beats a guess that looks finished. Each of
  // these is a branch no measured run has ever taken, so its constants are
  // unverified and a reading is not a port.
  //
  // TWO ROWS LEFT THIS TEST IN WAVE 22 and they are named here rather than
  // silently dropped: $A19E (the missile crawl, above) and $C05F (the ARMOURED
  // damage accumulator, tests/collision.test.js). Both had been listed as
  // "unexercised" on the strength of the corpus; both were measured reachable.
  const multi = shotOnEnemy({ type: 0x9A });
  assert.throws(() => shotSweep(multi, res), /\$C099/, 'the type-$9A hit counter');

  const stage5 = ship();
  stage5.zp19 = 4;
  stage5.obj.anim[SLOT_M] = 0x0A; stage5.obj.animFrame[SLOT_M] = 3;
  assert.throws(() => missileLoop(stage5, res), /\$A17C/, 'the stage-5 bypass');
});
