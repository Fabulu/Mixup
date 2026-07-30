// THE ENEMY DRIVER'S ORDER.  ROM: sub_01_4E0C, $4E0C-$4F1E.
//
// Two orders live in this one loop and BOTH are semantics:
//
//   THE SLOT DIRECTION.  $4E13 reads $FFA7 and walks slots 0->7 on even frames
//   and 7->0 on odd ones. That decides which enemy wins when two would act on
//   the same thing in one frame, whether a projectile spawned into slot 6 runs
//   on its own spawn frame, and -- because 1:$5CA8 appends to shadow OAM from
//   inside the loop -- the OAM order of every enemy on screen, which is DMG
//   sprite priority and the ten-sprites-per-line cut.
//
//   THE ARM LADDER.  $4E27..$4F1E is a straight-line ladder of nine tests, and
//   the ONLY thing that says which of two simultaneously-true conditions wins is
//   the order they are written in.
//
// MEASURED BEFORE THIS FILE EXISTED: deleting the parity reversal outright,
// hoisting the lag gate above tryActivate and swapping the stun and hit arms ALL
// PASSED 691/691. Nothing in the unit suite could see any of them.
//
// A NOTE ON HOW THESE ARE BUILT. Several tests make a record satisfy TWO arms at
// once and then assert that the EARLIER one ran. That is the only way to test a
// ladder: a record that satisfies one arm proves nothing about the order, and a
// draw list can be reordered harmlessly where a contended resource cannot -- so
// the slot-order test comes in two versions, one on the draw list and one on a
// pool with exactly one free slot left.
//
// tests/doors.test.js already does the parity-direction test correctly for the
// $C693 effect pool; this file is that shape applied to the enemy driver.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SLOTS, updateEnemies, drawEnemies,
} from '../src/enemies.js';
import { EFFECT_SLOTS } from '../src/doors.js';
import { effects, COUNTDOWN_IDLE } from '../src/effects.js';
import { makeState, corridor, placePlayer, SYNTHETIC_TABLES } from './helpers.js';

/**
 * A projectile template with an ACTIVE state-$0B record in it. The suite's
 * shared fixture is all zeros, and an all-zero record is an INACTIVE enemy --
 * which would make the spawn-frame question unaskable.  ROM: 1:$6CEA, 5 x 32 B.
 */
function projectileTemplates() {
  return Array.from({ length: 5 }, () => {
    const t = new Array(32).fill(0);
    t[0] = 0x80;        // active
    t[2] = 0x0B;        // state $0B, the projectile
    t[0x12] = 0x10;     // +$12 flight speed
    t[0x14] = 0x00;     // +$14 == 0 is projHoming ($59E8)
    t[0x16] = 1;        // +$16 HP, so the driver does not take the $4E75 arm
    return t;
  });
}

function world(level = 3, opts = {}) {
  const s = makeState(corridor(48, 14), {
    level,
    tables: { ...SYNTHETIC_TABLES, projectileTemplates: projectileTemplates() },
    ...opts,
  });
  placePlayer(s, 8, 13);
  s.camera.x = 0;
  s.camera.y = 0x1000;
  s.sound = { queue: [] };
  s.frame = 1;
  s.parity = 0;
  effects(s).countdown = COUNTDOWN_IDLE;   // $C740 idle: no boss has died
  return s;
}

/**
 * A record that reaches loc_01_5CA8 and queues ONE draw with no physics at all.
 *
 * State $0C (dormant) with r[1] bit 5 set takes $5BA0 straight to the screen
 * tail, and animTick's $5E90 arm returns r[6] verbatim once the +$19 timer is
 * 0 -- so the queued pose is the byte written here and the enemy's own animation
 * machine stays out of the way. `dx` is a camera-relative world offset, so the
 * queued screen X is (dx >> 4) + 8.
 */
function dormant(s, slot, dx, pose) {
  const r = s.enemies[slot];
  const x = s.camera.x + dx, y = s.camera.y + 0x0200;
  r.fill(0);
  r[0] = 0x80; r[1] = 0x20; r[2] = 0x0C; r[6] = pose;
  r[0x0E] = (x >> 8) & 0xFF; r[0x0F] = x & 0xFF;
  r[0x10] = (y >> 8) & 0xFF; r[0x11] = y & 0xFF;
  r[0x16] = 4; r[0x19] = 0;
  return r;
}

// ---------------------------------------------------------------------------
// (a) THE SLOT VISIT ORDER
// ---------------------------------------------------------------------------

test('$FFA7 walks the eight slots 0->7 on even frames and 7->0 on odd ones', () => {
  // $4E13: `LDH A,[$FFA7] / AND A / JR Z` picks the direction for the whole
  // pass. Each slot gets a distinct pose byte AND a distinct world X, so the
  // draw list records the visit order twice over.
  const visit = (parity) => {
    const s = world();
    s.parity = parity;
    for (let i = 0; i < SLOTS; i++) dormant(s, i, 0x0200 + i * 0x40, 0x70 + i);
    updateEnemies(s);
    return s.enemyDraws.map((d) => d.id);
  };

  const even = visit(0);
  const odd = visit(1);

  assert.equal(even.length, SLOTS, 'all eight slots drew on the even frame');
  assert.deepEqual(even, [0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77],
    'even frames walk slots 0->7');
  assert.deepEqual(odd, [...even].reverse(),
    'odd frames walk the SAME eight slots backwards -- $4E13');

  // And the X ordering agrees, so this is not an artefact of the pose bytes.
  const xs = (parity) => {
    const s = world();
    s.parity = parity;
    for (let i = 0; i < SLOTS; i++) dormant(s, i, 0x0200 + i * 0x40, 0x70 + i);
    updateEnemies(s);
    return s.enemyDraws.map((d) => d.x);
  };
  const ascending = xs(0);
  assert.deepEqual(ascending, [...ascending].sort((p, q) => p - q),
    'the even pass is ascending in screen X');
  assert.deepEqual(xs(1), [...ascending].reverse());
});

test('the flush preserves the visit order -- OAM index is sprite priority', () => {
  // A draw list can be reordered harmlessly right up until something reads its
  // INDEX, and on a DMG two things do: sprite-to-sprite priority and the
  // ten-per-line cut. drawEnemies must not sort, reverse or dedupe.
  const table1 = [];
  for (let i = 0; i <= 0x100; i++) table1[i] = { sprites: [[0, 0, i & 0xFF, 0]] };
  const manifest = { metasprites: { table1, table2: table1 } };

  const s = world();
  s.parity = 0;
  // Slot order, insertion order and X order are three different sequences.
  dormant(s, 0, 0x0500, 0x70);
  dormant(s, 1, 0x0200, 0x71);
  dormant(s, 2, 0x0800, 0x72);
  dormant(s, 3, 0x0300, 0x73);
  updateEnemies(s);
  s.video.sprites.length = 0;
  drawEnemies(s, manifest);
  assert.deepEqual(s.video.sprites.map((q) => q.tile), [0x70, 0x71, 0x72, 0x73]);
  assert.equal(s.enemyDraws.length, 0, 'the flush empties the queue');
});

// ---------------------------------------------------------------------------
// (b) THE SAME ORDER, WITH A CONSEQUENCE THAT CANNOT BE REORDERED HARMLESSLY
// ---------------------------------------------------------------------------

test('with ONE effect slot left, parity decides WHICH dying enemy gets it', () => {
  // $4E75's arm calls sub_00_0CC2, and the allocator takes the FIRST FREE slot
  // and drops the request when the pool is full ($0CDD). So with nine of the ten
  // $C693 slots taken and two enemies dying in the same frame, exactly one of
  // them leaves a mark -- and which one is a pure consequence of $4E13.
  //
  // This is the version of the slot-order test that a "harmless" reordering
  // cannot survive: a draw list can be permuted and still look right, a
  // contended allocation cannot.
  const winner = (parity) => {
    const s = world();
    s.parity = parity;
    for (let i = 0; i < EFFECT_SLOTS - 1; i++) {
      s.doors.effects[i].set([0x40, 0xEE, 0, 0x14, 0, 0]);   // occupied
    }
    s.doors.effects[EFFECT_SLOTS - 1].fill(0);                // the last one free

    // Slots 1 and 5, distinguishable by their world X high byte.
    for (const [slot, xhi] of [[1, 0x03], [5, 0x06]]) {
      const r = dormant(s, slot, 0x0200, 0x70 + slot);
      r[0x0E] = xhi; r[0x0F] = 0x00;
      r[0x16] = 0;                                            // $4E75: HP gone
    }
    updateEnemies(s);
    return s.doors.effects[EFFECT_SLOTS - 1][1];              // the record's X hi
  };

  assert.equal(winner(0), 0x03, 'even frame: slot 1 is reached first and wins');
  assert.equal(winner(1), 0x06, 'odd frame: slot 5 is reached first and wins');
});

// ---------------------------------------------------------------------------
// (c) THE SPAWN FRAME
// ---------------------------------------------------------------------------

test('a projectile spawned into slot 6 runs on its own spawn frame ONLY on an even frame', () => {
  // sub_01_6BDC scans slots 6 and 7 ASCENDING and takes the first inactive one.
  // The spawner sits in slot 0. On an even frame the loop is already below the
  // slot it wrote, so the fresh record is dispatched in the same pass; on an odd
  // frame slot 6 was visited before slot 0 and the projectile waits a frame.
  //
  // Observed on the record itself: projHoming ($5A92) does `+$13 = min(+$13+1,8)`
  // and then adds that to the 12.4 Y, so a projectile that ran has +$13 == 1 and
  // a moved +$11.
  const spawn = (parity) => {
    const s = world(7);                 // state 2 is levels 5, 7 and $0D
    s.parity = parity;

    // Slot 0: a grounded state-2 walker in its FAR band ($53E3 fails, ad >= $30)
    // and on the player's EXACT screen row ($53EC), which is the arm that fires.
    const r = s.enemies[0];
    r.fill(0);
    const x = s.camera.x + 0x0300, y = s.camera.y + 0x0200;
    r[0] = 0x80; r[2] = 0x02;
    r[0x0E] = (x >> 8) & 0xFF; r[0x0F] = x & 0xFF;
    r[0x10] = (y >> 8) & 0xFF; r[0x11] = y & 0xFF;
    r[0x16] = 4;
    // The handler reads the CACHED screen bytes, one frame stale by design.
    r[7] = 0x10;
    r[8] = ((((s.player.y & 0x0FFF) - s.camera.y) & 0xFFFF) >> 4) + 0x10 & 0xFF;

    updateEnemies(s);
    return s.enemies[6];
  };

  const even = spawn(0);
  const odd = spawn(1);
  assert.ok(even[0] & 0x80, 'even: something was spawned into slot 6');
  assert.ok(odd[0] & 0x80, 'odd: something was spawned into slot 6');

  assert.equal(even[0x13], 1,
    'even frame: the fresh projectile ran projHoming on its own spawn frame');
  assert.equal(odd[0x13], 0,
    'odd frame: slot 6 was already behind the cursor, so it waits a frame');
  assert.notEqual(even[0x11], odd[0x11],
    'and the two differ in the 12.4 Y the sink rate was added to');
});

// ---------------------------------------------------------------------------
// (d) THE ARM LADDER, one adjacent pair at a time
// ---------------------------------------------------------------------------

/**
 * Each case builds ONE record that satisfies BOTH of two adjacent arms and
 * asserts the EARLIER arm ran. `setup` returns the record; `check` says what
 * the earlier arm did that the later one would not have done.
 */
const LADDER = [
  {
    name: '$4E27 tryActivate beats $4E2C/$4E39, the pause / lag gate',
    why: 'An inactive record is activated even on a lagging frame. The gate '
       + 'sits BELOW the activation test, so hoisting it stops enemies '
       + 'appearing at all whenever the frame is long.',
    setup: (s) => {
      // state.lagFrame is never set by the port today, so poke it directly.
      s.lagFrame = 1;
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0] = 0x00;                                  // bit 7 clear: not active
      r[1] = 0x00;                                  // subtype 0: no column gate
      return r;
    },
    check: (r) => assert.ok(r[0] & 0x80, '$60C5 SET 7 ran'),
  },
  {
    name: '$4E27 tryActivate beats the PAUSED half of the same gate',
    why: 'The other half of $4E2C, and it is the one a player can actually '
       + 'reach: START during a scroll must not stop enemies waking up.',
    setup: (s) => {
      s.flow.paused = true;
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0] = 0x00;
      r[1] = 0x00;
      return r;
    },
    check: (r) => assert.ok(r[0] & 0x80, '$60C5 SET 7 ran'),
  },
  {
    name: '$4E2C the lag gate beats $4E4D despawn',
    why: 'A lagging frame draws the enemy where it is and does nothing else. '
       + 'If despawn ran first, a long frame during a scroll would silently '
       + 'deactivate everything that had drifted out of the window.',
    setup: (s) => {
      s.lagFrame = 1;
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0x0E] = 0x40;                               // far outside DESPAWN_RANGE
      return r;
    },
    check: (r) => assert.ok(r[0] & 0x80, 'still ACTIVE -- $4E55 did not run'),
  },
  {
    name: '$4E4D despawn beats $4E69 fell-out-of-the-world',
    why: 'The two arms differ in what they leave behind: despawn does RES 7 '
       + 'ONLY ($4E55), the fell-out arm goes through loc_01_4EB8 and sets bit '
       + '6, which marks the enemy permanently dead. An enemy that scrolled '
       + 'off must be able to come back.',
    setup: (s) => {
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0x0E] = 0x40;                               // out of the despawn window
      r[0x10] = 0x21;                               // AND below DEATH_ROW
      return r;
    },
    check: (r) => {
      assert.equal(r[0] & 0x80, 0, 'deactivated');
      assert.equal(r[0] & 0x40, 0, 'and NOT marked permanently dead');
    },
  },
  {
    name: '$4E69 fell-out beats $4E75 HP-gone, and spawns NOTHING',
    why: 'The fell-out arm jumps straight past the spawners. An enemy that '
       + 'falls out of the world with 0 HP must not leave a heart and an '
       + 'explosion hanging in mid-air.',
    setup: (s) => {
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0x10] = 0x21;                               // >= DEATH_ROW
      r[0x16] = 0;                                  // AND HP gone
      return r;
    },
    check: (r, s) => {
      assert.ok(r[0] & 0x40, 'loc_01_4EB8 ran');
      assert.ok(s.doors.effects.every((e) => e[0] === 0), 'no $C693 effect');
      assert.ok(s.drops.every((d) => d[0] === 0), 'no $1444 drop');
    },
  },
  {
    name: '$4E75 HP-gone beats $4F11 the disabled arm, and DOES spawn',
    why: 'Both end in the same killTail, so the only difference is the pair of '
       + 'spawners in between -- the explosion and the heart every kill makes.',
    setup: (s) => {
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0] = 0x80 | 0x40;                           // active AND disabled
      r[0x16] = 0;                                  // AND HP gone
      return r;
    },
    check: (r, s) => {
      assert.ok(s.doors.effects.some((e) => e[0] !== 0), '$4EA9 spawned $97/$03');
      assert.ok(s.drops.some((d) => d[0] !== 0), '$4EAC spawned the drop');
    },
  },
  {
    name: '$4F11 the disabled arm beats $4F15 the stun tick',
    why: 'Flags $44 -- disabled AND hit-flashing -- is reachable the frame a '
       + 'stunned enemy is finished off. It must die, not blink.',
    setup: (s) => {
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0] = 0x80 | 0x40 | 0x04;                    // active, disabled, stunned
      r[0x17] = 0x3C;                               // a full stun timer
      return r;
    },
    check: (r) => {
      assert.equal(r[0x17], 0x3C, 'the stun timer was NOT decremented');
      assert.equal(r[0], 0x40, '$4EC0: flags = (f & $43) | $40');
    },
  },
  {
    name: '$4F15 the stun tick beats $4F19 the hit dispatch',
    why: 'Bit 2 and bits 3/4 are both set for the whole knockback, which is '
       + 'most of a stun. Running the attack tick instead skips the knockback '
       + 'entirely and the enemy walks through the punch.',
    setup: (s) => {
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0] = 0x80 | 0x04 | 0x08;                    // active, stunned, attacking
      r[0x17] = 0x3C;
      r[0x14] = 0x05;                               // the attack tick's counter
      return r;
    },
    check: (r) => {
      assert.equal(r[0x17], 0x3B, '$4F2E decremented the stun timer');
      assert.equal(r[0x14], 0x05, 'and jt_01_637F did NOT run');
    },
  },
  {
    name: '$4F19 the hit dispatch beats $4F1E the type dispatch',
    why: 'Bits 3/4 mean an attack is in progress; the type handler would start '
       + 'the enemy walking again mid-swing.',
    setup: (s) => {
      const r = dormant(s, 0, 0x0200, 0x70);
      r[0] = 0x80 | 0x08;                           // active, attacking
      r[0x14] = 0x05;
      return r;
    },
    check: (r) => assert.equal(r[0x14], 0x04, 'jt_01_637F decremented +$14'),
  },
];

for (const c of LADDER) {
  test(`arm ladder: ${c.name}`, () => {
    const s = world();
    const r = c.setup(s);
    updateEnemies(s);
    c.check(r, s);
  });
}

// ---------------------------------------------------------------------------
// (e) killTail's 'stop' ABANDONS the pass
// ---------------------------------------------------------------------------

test('a victory inside killTail abandons the loop -- no later slot is walked', () => {
  // loc_00_34D0 ends in RET, and that RET unwinds past the whole driver: the
  // remaining slots are not visited AT ALL that frame. No test had two records
  // where one dies, so this had never been exercised in either direction.
  //
  // The stopper sits in slot 0 and an ordinary drawing record in slot 3, so the
  // draw list answers both questions at once: whether the pass was abandoned,
  // and which end it started from.
  //
  // Level 6 because loc_00_34D0's level-6 arm ($34E3) skips the fanfare
  // artwork entirely -- every other level reaches stageClearArt, which needs
  // ROM tables this suite deliberately does not carry.
  const drawn = (parity) => {
    const s = world(6);
    s.parity = parity;
    effects(s).countdown = 0;              // $793A: the countdown is finished

    const stopper = dormant(s, 0, 0x0200, 0x70);
    stopper[0] = 0x80 | 0x40;              // $4F11: straight to killTail

    dormant(s, 3, 0x0300, 0x73);           // an ordinary record that draws

    updateEnemies(s);
    return s.enemyDraws.map((d) => d.id);
  };

  assert.deepEqual(drawn(0), [],
    'even frame: slot 0 stops the pass and slot 3 is never visited');
  assert.deepEqual(drawn(1), [0x73],
    'odd frame: slot 3 is reached FIRST and draws, then slot 0 stops the pass');
});

// ---------------------------------------------------------------------------
// The gate on the whole loop
// ---------------------------------------------------------------------------

test('$C750 reroutes the ENTIRE driver to the level-14 entrance', () => {
  // $4E0C: the boss-mode test comes before the loop, not inside it, so no slot
  // is walked at all -- which is why the Joker and the chaser stay parked.
  const s = world(0x0E);
  s.flow.bossMode = 1;
  s.flow.bossHop = 0x78;
  dormant(s, 0, 0x0200, 0x70);
  updateEnemies(s);
  assert.deepEqual(s.enemyDraws.map((d) => d.id), [],
    'the dormant record in slot 0 was never dispatched');
});
