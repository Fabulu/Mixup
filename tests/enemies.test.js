// Enemy AI internals -- the probe layer and shared machinery of 1:$50D3.
// Everything here runs against synthetic ASCII maps; no assets, no ROM.
// Run: node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import { grid, put, fillRow, makeState } from './helpers.js';
import { meleeHitTest, _internals } from '../src/enemies.js';

const {
  probeCore, probeUp, probeDown, probeRight, probeLeft,
  gapLeap, neg16q, spawnProjectile, screenTail,
} = _internals;

/**
 * An enemy record shaped like the level-5 walker+jump blob entries:
 * hitbox 8/9/15/16, HP 6, jump vel $20, speed cap $10.
 */
function makeEnemy(state, { col = 4, row = 6, xlo = 0x80, ylo = 0x00 } = {}) {
  const r = state.enemies[0];
  r.fill(0);
  r[0] = 0x80;
  r[2] = 2;
  r[0x0A] = 0x08; r[0x0B] = 0x09;      // halfW right / left
  r[0x0C] = 0x0F; r[0x0D] = 0x10;      // halfH up / down
  r[0x0E] = col & 0xFF; r[0x0F] = xlo;
  r[0x10] = (0x10 + row) & 0xFF; r[0x11] = ylo;
  r[0x16] = 6;
  r[0x1C] = 0x20;                      // jump velocity
  r[0x1D] = 0x10;                      // walk speed cap
  return r;
}

// ---------------------------------------------------------------------------
// probeCore -- sub_01_6666
// ---------------------------------------------------------------------------

test('horizontal probe: empty edge cell sweeps above and below within the hitbox', () => {
  // ROM: $66EA-$673F. The up test uses halfH-UP - 2, the down test halfH-DOWN
  // - 2, and both read the RECORD Y-lo, not the probe point's.
  const g = grid(8);
  put(g, 5, 5, '#');                           // above the probed cell
  const state = makeState(g);
  const r = makeEnemy(state, { col: 4, row: 6, ylo: 0x00 });
  // subY = 0 < halfHup-2 = 13 -> the above cell is consulted and returned.
  assert.equal(probeCore(state, r, r[0x0A] << 4, 0, 1), 0x01);

  // With the sub-row too low in the metatile the above test is skipped.
  r[0x11] = 0xF0;                              // subY = 15, not < 13
  assert.equal(probeCore(state, r, r[0x0A] << 4, 0, 1), 0);

  // Below: subY + halfHdown-2 >= 16 consults the cell below.
  const g2 = grid(8);
  put(g2, 5, 7, '#');
  const s2 = makeState(g2);
  const r2 = makeEnemy(s2, { col: 4, row: 6, ylo: 0x20 });   // subY 2, 2+14 = 16
  assert.equal(probeCore(s2, r2, r2[0x0A] << 4, 0, 1), 0x01);
  r2[0x11] = 0x10;                             // subY 1, 1+14 = 15 -> skipped
  assert.equal(probeCore(s2, r2, r2[0x0A] << 4, 0, 1), 0);
});

test('vertical probe: empty cell sweeps west/east within the hitbox', () => {
  // ROM: $66AF-$66D7 -- mirrors the horizontal sweep with the halfW pair.
  const g = grid(8);
  put(g, 3, 8, '#');                           // west of the probed cell
  const state = makeState(g);
  const r = makeEnemy(state, { col: 4, row: 7, xlo: 0x00 }); // subX 0 < halfWL-2
  assert.equal(probeCore(state, r, 0, r[0x0D] << 4, 4), 0x01);
  r[0x0F] = 0x80;                              // centred: neither side pokes out
  assert.equal(probeCore(state, r, 0, r[0x0D] << 4, 4), 0);
});

// ---------------------------------------------------------------------------
// Floor / ceiling wrappers -- sub_01_656A / sub_01_64FA
// ---------------------------------------------------------------------------

test('probeDown snaps the feet exactly onto the probed row', () => {
  // ROM: loc_01_65C0 -- Y = row*256 - halfHdown*16.
  const state = makeState(fillRow(grid(8), 8, '#'));
  const r = makeEnemy(state, { col: 4, row: 7, ylo: 0x30 });
  assert.equal(probeDown(state, r), 1);
  assert.equal((r[0x10] << 8) | r[0x11], 0x1800 - 0x100);
});

test('probeDown: enemies stand on spikes unharmed', () => {
  // ROM: $65AA routes $FD into the same floor snap as ordinary ground.
  const state = makeState(fillRow(grid(8), 8, '^'));
  const r = makeEnemy(state, { col: 4, row: 7, ylo: 0x30 });
  assert.equal(probeDown(state, r), 1);
  assert.equal(r[0x16], 6, 'no HP loss');
});

test('probeUp into spikes stuns and costs 1 HP, once', () => {
  // ROM: $6542 -> loc_01_6552.
  const state = makeState(put(grid(8), 4, 5, '^'));
  const r = makeEnemy(state, { col: 4, row: 6, ylo: 0x00 });
  assert.equal(probeUp(state, r), 0);
  assert.equal(r[0] & 0x04, 0x04);
  assert.equal(r[0x17], 0x3C);
  assert.equal(r[0x16], 5);
  probeUp(state, r);                           // bit 2 already set: no re-hit
  assert.equal(r[0x16], 5);
});

// ---------------------------------------------------------------------------
// The wall-ahead jump assist -- loc_01_6415 via the horizontal probes
// ---------------------------------------------------------------------------

test('wall one column past an empty edge cell makes the walker JUMP, alternating', () => {
  // ROM: $640C reads $FFBE (the beside-cell the empty path stored) and 6415
  // launches with the +$1C velocity -- but only on alternate encounters,
  // gated by the r[1] bit-7 latch.
  const g = grid(8);
  put(g, 6, 6, '#');                           // one column past the right edge
  const state = makeState(g);
  const r = makeEnemy(state, { col: 4, row: 6, xlo: 0x80 });

  assert.equal(probeRight(state, r), 0, 'reported as no wall');
  assert.equal(r[0] & 0x01, 0x01, 'rising');
  assert.equal(r[0x13], 0x20, 'jump velocity from +$1C');
  assert.equal(r[0x12], 0x0C, 'launch speed +$0C');
  assert.equal(r[1] & 0x80, 0x80, 'latch set');

  r[0] = 0x80;                                 // grounded again
  assert.equal(probeRight(state, r), 0);
  assert.equal(r[0] & 0x01, 0, 'second encounter does not jump');
  assert.equal(r[1] & 0x80, 0, 'latch cleared');
});

test('the beside-cell index is a stale global when the probe bails early', () => {
  // ROM: $FFBE is HRAM -- a probe that returns before the empty path keeps
  // whatever an earlier probe stored there.
  const g = grid(8);
  put(g, 6, 6, '#');
  const state = makeState(g);
  const r = makeEnemy(state, { col: 4, row: 6 });
  probeRight(state, r);                        // stores besideIdx = (6,6)
  const stale = state.enemyBesideIdx;
  r[0x10] = 0x21;                              // off the bottom: probe bails at $6680
  probeLeft(state, r);
  assert.equal(state.enemyBesideIdx, stale);
});

// ---------------------------------------------------------------------------
// Gap leaps -- sub_01_7D09
// ---------------------------------------------------------------------------

// The real 1:$7E3F table and the fourteen velocity stubs now live in the
// manifest, and this suite deliberately never touches assets/ -- it has to run
// without the ROM. So the fixture below is SYNTHETIC, chosen so every field is
// distinguishable: whether the exported bytes are the right ROM bytes is a
// separate question, answered by `check_tables` in tools/verify_assets.py,
// which re-reads them from the cartridge without going through the exporter.
//
// Level 5's base is $78 into the table, so byte $78+$13 = $8B is the one Xhi
// $26/$27 selects. Leap ids 14 and 10 give the two velocity pairs.
const GAP_FIXTURE = {
  gapTable: (() => {
    const t = new Array(0xEA).fill(0);
    t[0x78 + 0x13] = 0xEA;                     // high nibble 14, low nibble 10
    return t;
  })(),
  gapLeaps: [
    [0x10, 0x12], [0x18, 0x13], [0x20, 0x13], [0x23, 0x1C], [0x12, 0x0C],
    [0x23, 0x0F], [0x20, 0x13], [0x23, 0x16], [0x24, 0x20], [0x08, 0x04],
    [0x08, 0x02], [0x10, 0x15], [0x10, 0x10], [0x18, 0x10],
  ],
};

test('gapLeap: table entry, nibble select and facing sign', () => {
  // Xhi $26 = even -> HIGH nibble of the byte = leap 14 {yv $18, xv $10};
  // Xhi $27 = odd -> LOW nibble = leap 10 {yv 8, xv 4}.
  const state = makeState(grid(8), { level: 5, tables: GAP_FIXTURE });
  const r = makeEnemy(state, { col: 0x26 });
  assert.equal(gapLeap(state, r), true);
  assert.equal(r[0x13], 0x18);
  assert.equal(r[0x12], 0x10);
  assert.equal(r[0] & 0x01, 0x01, 'launches immediately');

  const r2 = makeEnemy(state, { col: 0x27 });
  r2[5] = 1;                                   // facing left negates X
  assert.equal(gapLeap(state, r2), true);
  assert.equal(r2[0x13], 0x08);
  assert.equal(r2[0x12], 0xFC);

  const r3 = makeEnemy(state, { col: 0x4A });  // $7D44: past the level-5 bound
  assert.equal(gapLeap(state, r3), false);
});

test('gapLeap: the column guard is per level, and 7 and 13 share it', () => {
  // $7D2E-$7D5F. Levels 1 and 2 have no guard at all; 3 stops at $43, 5 at
  // $4A, and BOTH 7 and 13 at $4C -- they jump to the same arm ($7D4E has two
  // xrefs). The unused sixth arm at $7D59 (guard $4E) has none, so no level
  // may reach it.
  const at = (level, col) => {
    const state = makeState(grid(8), { level, tables: GAP_FIXTURE });
    return gapLeap(state, makeEnemy(state, { col }));
  };
  assert.equal(at(3, 0x42), false, 'in range, but the fixture byte is zero');
  assert.equal(at(3, 0x43), false, 'past the level-3 bound');
  for (const lvl of [7, 0x0D]) {
    const state = makeState(grid(8), { level: lvl, tables: GAP_FIXTURE });
    // $9D + ($4B >> 1) = $C0, inside the table; make it leap so the guard,
    // not an empty entry, is what the $4C case is proving.
    state.tables.gapTable[0x9D + (0x4B >> 1)] = 0x0A;
    assert.equal(gapLeap(state, makeEnemy(state, { col: 0x4B })), true);
    assert.equal(gapLeap(state, makeEnemy(state, { col: 0x4C })), false);
  }
  assert.equal(at(4, 0x10), false, 'level 4 has no table at all -- $7D2B');
});

test('gapLeap: a missing manifest table throws rather than never leaping', () => {
  const state = makeState(grid(8), { level: 5 });
  assert.throws(() => gapLeap(state, makeEnemy(state, { col: 0x26 })),
                /gapTable/);
});

// ---------------------------------------------------------------------------
// Odds and ends
// ---------------------------------------------------------------------------

test('neg16q reproduces the CPL/CPL/+1 idiom, including the lo=$FF short-by-$100', () => {
  // ROM: $6639 / $6C68 / $5B30 -- the +1 is skipped when the complemented low
  // byte is already zero, so -(x) comes out $100 short for lo = $FF.
  assert.equal(neg16q(0x0100), 0xFF00);
  assert.equal(neg16q(0x0060), 0xFFA0);
  assert.equal(neg16q(0x12FF), 0xED00, 'quirk: true negation would be $ED01');
});

test('walk cycle advances the r[3]/r[4] nibble counters like $5FE6', () => {
  const state = makeState(fillRow(grid(8), 8, '#'), { level: 5 });
  const r = makeEnemy(state, { col: 4, row: 6 });
  r[3] = 0x80;                                 // period 8, subtimer 0
  r[4] = 0x30;                                 // 4 frames, frame 0
  state.camera.y = 0x1000;                     // keep the vertical window open
  screenTail(state, r);
  assert.equal(r[3], 0x81, 'subtimer ticks');
  assert.equal(r[4], 0x30, 'frame holds until the period wraps');
  for (let i = 0; i < 7; i++) screenTail(state, r);
  assert.equal(r[3], 0x80, 'subtimer wrapped');
  assert.equal(r[4], 0x31, 'frame advanced');
});

// The two tests below are the only ones that care what a prefab CONTAINS, so
// they bring their own. Synthetic on purpose (the suite never reads assets/):
// only the fields each test asserts are set, and they are set to values that
// could not be mistaken for a default. Whether the shipped bytes are the right
// ROM bytes is settled by check_tables in tools/verify_assets.py.
function projectileFixture() {
  const t = Array.from({ length: 5 }, () => new Array(32).fill(0));
  for (const r of t) {
    r[0] = 0x80;          // +0  active
    r[2] = 0x0B;          // +2  state 11, the projectile
    r[0x16] = 0xFF;       // +$16 HP
  }
  return { projectileTemplates: t };
}

test('spawnProjectile copies the mode-1 template into slot 6 and offsets it', () => {
  // ROM: sub_01_6BDC + template 1:$6CEA. X +$100 toward the facing, Y +$20.
  const state = makeState(grid(8), { level: 5, tables: projectileFixture() });
  const spawner = makeEnemy(state, { col: 4, row: 6 });
  assert.equal(spawnProjectile(state, spawner, 1), 0);
  const t = state.enemies[6];
  assert.equal(t[0], 0x80);
  assert.equal(t[2], 0x0B, 'state 11');
  assert.equal(t[0x16], 0xFF, 'HP $FF');
  assert.equal((t[0x0E] << 8) | t[0x0F], 0x0580);
  assert.equal((t[0x10] << 8) | t[0x11], 0x1620);

  spawner[5] = 1;                              // facing left: slot 7, X negated
  assert.equal(spawnProjectile(state, spawner, 1), 0);
  assert.equal((state.enemies[7][0x0E] << 8) | state.enemies[7][0x0F], 0x0380);

  assert.equal(spawnProjectile(state, spawner, 1), 1, 'both slots busy');
});

// ---------------------------------------------------------------------------
// The punch's enemy scan -- loc_00_2643-$272B.
//
// This is the tail of the mode-5 probe: $2423 falls into $2426, which converts
// the probe point to SCREEN space at $2430 and, for mode 5 only, jumps here
// instead of scanning the map objects.  The dispatch around it -- which cells
// let the fist through, and the recoil -- is pinned in player.test.js.
// ---------------------------------------------------------------------------

// Camera at the origin, so sub_00_1172 reduces to (world >> 4) + 8 for X and
// ((world & $0FFF) >> 4) + $10 for Y.  These are the probe point handed to
// meleeHitTest and the screen pair $2687 compares against.
const PROBE_X = 0x0600, PROBE_Y = 0x1500;
const PROBE_SX = 0x68, PROBE_SY = 0x60;        // 104, 96

/**
 * One enemy whose CACHED +7/+8 sit (dsx, dsy) screen pixels from the probe
 * point.  Box bytes 7/15 are the level-3 walker's, the pair the cartridge
 * measurements below were taken with.
 *
 * critWindow 0 disables the crit arm on purpose: $26D0 reads rLY mid-frame, so
 * the port models it and can never agree punch-for-punch (docs/03 par.28).
 * Everything here is the ordinary damage arm at loc_00_26EA.
 */
function melee({
  dsx = 0, dsy = 0, facing = 0, st = 1, flags = 0x80, box = [7, 15], hp = 6,
} = {}) {
  const state = makeState(grid(8), { tunables: { critWindow: 0 } });
  state.player.facing = facing;
  const r = state.enemies[0];
  r[0] = flags;
  r[2] = st;
  r[7] = (PROBE_SX + dsx) & 0xFF;
  r[8] = (PROBE_SY + dsy) & 0xFF;
  r[0x0B] = box[0];
  r[0x0C] = box[1];
  r[0x0E] = 0x40; r[0x10] = 0x18;              // world position, deliberately elsewhere
  r[0x16] = hp;
  return state;
}

const punch = (state) => meleeHitTest(state, PROBE_X, PROBE_Y);

test('the punch scan compares CACHED screen bytes, not live world coordinates', () => {
  // ROM: $2677-$2684 reads +7/+8 -- what loc_01_5CA8 wrote at the END of last
  // frame's enemy driver, one frame stale by design -- and $2687 reads the
  // probe point $2430 already converted. The world bytes at +$0E-+$11 are not
  // read by this routine at all.
  assert.equal(punch(melee()), 0xFF);

  // Same enemy parked exactly on the probe point in WORLD space, with screen
  // bytes from somewhere else: the fist goes straight through it.
  const stale = melee({ dsx: 40 });
  const r = stale.enemies[0];
  r[0x0E] = PROBE_X >> 8; r[0x0F] = PROBE_X & 0xFF;
  r[0x10] = PROBE_Y >> 8; r[0x11] = PROBE_Y & 0xFF;
  assert.equal(punch(stale), 0);
  assert.equal(r[0x16], 6, 'untouched');
});

test('the X window is the ENEMY box byte +$0B MINUS ONE, compared strictly', () => {
  // ROM: $2685 `DEC A` then $2693 `CP H / JR C`. Box byte 7 admits 6 px of
  // separation EXCLUSIVE: 5 hits, 6 misses. Losing the DEC, or relaxing the
  // compare to <=, widens every enemy's punchable box by a pixel a side --
  // and the batarang's box next door really is inclusive, so "consistency" is
  // exactly the wrong instinct here.
  assert.equal(punch(melee({ dsx: 5 })), 0xFF);
  assert.equal(punch(melee({ dsx: 6 })), 0);
});

test('the Y window is +$0C, also strict, and gets no second sample', () => {
  // ROM: $26AD-$26B4 `CP L / JR NC`. Box byte 15: 14 hits, 15 misses. Unlike
  // the X axis there is no retry to rescue a near miss.
  assert.equal(punch(melee({ dsy: 14 })), 0xFF);
  assert.equal(punch(melee({ dsy: -14 })), 0xFF);
  assert.equal(punch(melee({ dsy: 15 })), 0);
  assert.equal(punch(melee({ dsy: -15 })), 0);
});

test('the X retry pulls the probe 8 px BACK toward the player, never forward', () => {
  // ROM: $2696-$26A3 -- facing right subtracts 8 from the probe X, facing left
  // adds 8, and the same window is retested from there. The reach is therefore
  // 13 px behind the fist and only 5 px in front of it. MEASURED on the
  // cartridge (level 3, slot-3 walker, box 7/15): probe 102 vs enemy 100 hits;
  // probe 94 vs enemy 86 -- 8 px further along the punch -- misses. That
  // asymmetry is why level-3 walkers cannot be hit until they have closed in:
  // the narrow forward window never sweeps over them in time.
  assert.equal(punch(melee({ facing: 0, dsx: -8 })), 0xFF, 'between fist and player');
  assert.equal(punch(melee({ facing: 0, dsx: 8 })), 0, 'past the fist');
  assert.equal(punch(melee({ facing: 1, dsx: 8 })), 0xFF, 'mirrored by $FF88');
  assert.equal(punch(melee({ facing: 1, dsx: -8 })), 0);

  // The exact edge of the two windows' union, facing right.
  assert.equal(punch(melee({ facing: 0, dsx: -13 })), 0xFF);
  assert.equal(punch(melee({ facing: 0, dsx: -14 })), 0);
});

test('states 4, $0B and $0D are transparent to the fist', () => {
  // ROM: $2667-$2673. $0B is the enemy projectile and $0D a boss part, so a
  // punch cannot swat a shot out of the air. $2660 tests bit 7 only -- the
  // permanently-dead bit 6 is NOT checked here, unlike the batarang's $3C2C.
  for (const st of [0x04, 0x0B, 0x0D]) {
    assert.equal(punch(melee({ st })), 0, `state $${st.toString(16)}`);
  }
  assert.equal(punch(melee({ flags: 0x00 })), 0, 'an inactive slot');
});

test('only the FIRST overlapping slot is hit', () => {
  // ROM: $271F `LD A,$FF / RET` returns from inside the loop. The scan also
  // always walks 0 -> 7 ($2654 / $2724), with none of the enemy driver's
  // frame-parity reversal, so slot order alone decides who takes it.
  const state = melee();
  const second = state.enemies[1];
  second.set(state.enemies[0]);                // same place, same box
  assert.equal(punch(state), 0xFF);
  assert.equal(state.enemies[0][0x16], 4);
  assert.equal(second[0x16], 6, 'the second slot is never reached');
  assert.equal(second[0x17], 0, 'not even stunned');
});

test('a connecting punch: hit-flash, a $3C stun, 2 damage, clamped at zero', () => {
  // ROM: $26C4 SET 2, $26CA $3C, $26F0 B = $02, $26F6 `SUB B / JR NC / XOR A`.
  // Two sounds go out: $19 on contact ($26BE) and $21 from the damage arm.
  const state = melee({ hp: 6 });
  const r = state.enemies[0];
  assert.equal(punch(state), 0xFF);
  assert.equal(r[0] & 0x04, 0x04);
  assert.equal(r[0x17], 0x3C);
  assert.equal(r[0x16], 4);
  assert.deepEqual(state.sound.queue,
                   [{ id: 0x19, mask: 1 }, { id: 0x21, mask: 1 }]);

  const low = melee({ hp: 1 });
  punch(low);
  assert.equal(low.enemies[0][0x16], 0, 'the SUB clamps; it must not wrap to 255');
});

test('an enemy that is ALREADY flashing can be punched again', () => {
  // ROM: the melee damage arm at $26BE has no `BIT 2` guard; the batarang's at
  // $3CF4 does. Two punches inside one $3C stun land twice, two batarangs do
  // not -- see the matching test in batarang.test.js.
  const state = melee({ hp: 6 });
  const r = state.enemies[0];
  punch(state);
  assert.equal(r[0x16], 4);
  assert.equal(punch(state), 0xFF, 'still hittable while stunned');
  assert.equal(r[0x16], 2);
});
