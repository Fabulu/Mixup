// The two death sequences.
// ROM: sub_00_29E7 / loc_00_2A0D (the $C1C0 burst), 1:$78CC / 1:$7936 (the
//      $C740 countdown) and loc_00_34D0 (the victory fanfare).
//
// The frame-exact proof lives in tools/oracle/deathdiff.mjs, which drives both
// sequences on the real cartridge and diffs memory: six scenarios, three
// bosses and three levels' player deaths, all bit-exact. What is here is the
// arithmetic those scenarios cannot isolate -- the staggered arm, the $113
// parking index, the nibble sign extension, the per-boss dispatch and the
// refusal to run without a manifest.
//
// Every table below is a STAND-IN, not the cartridge's: nothing ROM-derived is
// committed, and none of these tests is about what the sparks look like.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  effects, resetEffects, startDeathBurst, deathBurstTick,
  bossCountdownTick, victoryStep, updateVictoryHold,
  COUNTDOWN_IDLE, COUNTDOWN_START, BURST_SLOTS,
} from '../src/effects.js';
import { makeState, grid } from './helpers.js';

// ---------------------------------------------------------------------------
// Stand-in tables. Shapes and indices are the ROM's; values are not.
//
// deathBurstInit  8 x {flags, ctrLo, ctrHi, X, Y}, every slot DORMANT (flags 0)
//                 -- that is the real 0:$2AD7's shape and the whole reason the
//                 sequence takes 452 frames rather than 121.
// deathBurstPath  $114 entries so that index $113, the parking index, exists.
//                 $21 packs dy = +2, dx = +1, so a slot's X is its own step
//                 count and the sums stay checkable by hand.
// ---------------------------------------------------------------------------
const BURST_TABLES = {
  deathBurstSprites: [1, 2, 3, 4, 5, 6, 7, 8],
  deathBurstInit: Array.from({ length: 40 }, (_, i) =>
    (i % 5 === 3 ? 0x10 * (i / 5 | 0) : i % 5 === 4 ? 0x38 : 0)),
  deathBurstPath: new Array(0x114).fill(0x21),
};

const BOSS_TABLES = {
  // 1:$7A73 -- 16 packed offsets, high nibble X, low nibble Y, both signed.
  bossExplosionOffsets: [0x00, 0xFF, 0x0F, 0xF1, 0x10, 0x1F, 0xF0, 0x00,
                         0x0F, 0x10, 0xFF, 0x01, 0x1E, 0xFE, 0x0F, 0x00],
  bossDeathPose1: [10, 11, 12, 13, 14, 15, 16, 17,
                   20, 21, 22, 23, 24, 25, 26, 27],
  bossDeathPose2: [30, 31, 32, 33, 34, 35, 36, 37,
                   40, 41, 42, 43, 44, 45, 46, 47],
  bossDeathPoseWalk: [50, 51],
  bossDeathPoseB4: [60, 61],
  // src/doors.js's $C693 pool needs its own table to draw with; the boss
  // explosions never reach it (they spawn with bit 7 CLEAR), but the pool
  // driver reads it for any animated effect that happens to be alive.
  effectSprites: [[0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2], [3, 3, 3, 3],
                  [4, 4, 4, 4]],
};

const bare = (opts = {}) => makeState(grid(16),
  { tables: { ...BURST_TABLES, ...BOSS_TABLES }, ...opts });

// ---------------------------------------------------------------------------
// $C1C0 -- Batman's death
// ---------------------------------------------------------------------------

test('the burst seeds dormant and $C712 is untouched for 332 frames', () => {
  // ROM: sub_00_29E7 copies 0:$2AD7 verbatim and writes $C712 = $78. Nothing
  // in that copy arms a slot, and loc_00_2A0D only decrements $C712 from the
  // $2A89 (parked) arm and only for slot 7 ($2A93: CP $07). MEASURED on the
  // cartridge: 452 frames from the seed to loc_00_2AAD, on levels 1, 3 and 4.
  const state = bare();
  startDeathBurst(state);
  const e = effects(state);
  e.deathTicks = 0x78;
  assert.deepEqual(Array.from(e.burst[0]), [0, 0, 0, 0x00, 0x38]);
  assert.deepEqual(Array.from(e.burst[7]), [0, 0, 0, 0x70, 0x38]);

  let landed = 0;
  for (let n = 1; n <= 500 && !landed; n++) {
    if (deathBurstTick(state, null)) landed = n;
    if (n === 331) assert.equal(e.deathTicks, 0x78, 'still not counting at 331');
  }
  assert.equal(landed, 452, 'loc_00_2AAD lands on tick 452');
});

test('slot n arms only once slot n-1 has counted to 8', () => {
  // ROM: loc_00_2A75. Slot 0 arms unconditionally ($2A78); every other slot
  // reads HL - 4, which is its PREDECESSOR's counter low byte, and needs it
  // >= 8 ($2A7F). Ascending slot order means the predecessor has already been
  // stepped this frame, so the stagger settles at exactly 8.
  const state = bare();
  startDeathBurst(state);
  const e = effects(state);
  const armedAt = new Array(BURST_SLOTS).fill(null);
  for (let n = 1; n <= 120; n++) {
    deathBurstTick(state, null);
    for (let i = 0; i < BURST_SLOTS; i++) {
      if (armedAt[i] === null && e.burst[i][0] !== 0) armedAt[i] = n;
    }
  }
  assert.deepEqual(armedAt, [1, 9, 17, 25, 33, 41, 49, 57]);
});

test('a slot parks at counter $113 and stops moving for good', () => {
  // ROM: $2A31-$2A39 -- hi nonzero AND lo >= $13. Only $113 satisfies both
  // before the flag stops the counter, which is also exactly the length of
  // 0:$2AFF ($2AFF..$2C12 = 276 bytes).
  const state = bare();
  startDeathBurst(state);
  const e = effects(state);
  for (let n = 1; n <= 400; n++) deathBurstTick(state, null);
  const r = e.burst[0];
  assert.equal(r[0] & 0x01, 1, 'parked');
  assert.equal((r[2] << 8) | r[1], 0x113, 'and frozen at the table end');
  // $21 is dy +2, dx +1, applied on steps 1..$113 from X $00 / Y $38.
  assert.equal(r[3], 0x113 & 0xFF);
  assert.equal(r[4], (0x38 + 2 * 0x113) & 0xFF);
});

test('the path nibbles are sign-extended by their own bit 3', () => {
  // ROM: $2A42-$2A48 for X and $2A51-$2A59 for Y -- `BIT 3 / OR $F0`, so $8
  // is -8 and $F is -1. Both halves of one byte, both signed independently.
  const state = bare({ tables: { ...BURST_TABLES, ...BOSS_TABLES,
                                 deathBurstPath: new Array(0x114).fill(0x8F) } });
  startDeathBurst(state);
  const e = effects(state);
  deathBurstTick(state, null);        // arms slot 0
  deathBurstTick(state, null);        // first step
  assert.equal(e.burst[0][3], 0xFF, 'low nibble $F = -1 on X');
  assert.equal(e.burst[0][4], 0x30, 'high nibble $8 = -8 on Y');
});

test('the burst refuses to run without its manifest tables', () => {
  // A missing table has to THROW. Degrading to "a death with no burst" would
  // silently restore the 121-frame sequence the port used to have.
  const state = makeState(grid(16));
  assert.throws(() => startDeathBurst(state), /deathBurstInit missing/);
});

// ---------------------------------------------------------------------------
// $C740 -- the boss countdown
// ---------------------------------------------------------------------------

/** A dead boss's record: state `st`, facing 0, at metatile (Xhi, Yhi). */
function corpse(state, st, xhi = 0x02, yhi = 0x1E) {
  const r = state.enemies[0];
  r.fill(0);
  r[0] = 0x81; r[2] = st; r[0x0E] = xhi; r[0x10] = yhi;
  effects(state).countdown = COUNTDOWN_START;
  return r;
}

test('the first half spawns 16 explosions, one every eighth step', () => {
  // ROM: $78D3-$78DA. The value is decremented FIRST and the test is on the
  // decremented one, so the spawns land on $F8, $F0 ... $80 -- sixteen of
  // them, which is why $C713 ends at $10.
  const state = bare({ bossId: 1 });
  const r = corpse(state, 0x0A);
  const e = effects(state);
  const spawns = [];
  while (e.countdown >= 0x80) {
    const before = e.explosion;
    assert.equal(bossCountdownTick(state, r), 'screen');
    if (e.explosion !== before) spawns.push(e.countdown);
  }
  assert.deepEqual(spawns, [0xF8, 0xF0, 0xE8, 0xE0, 0xD8, 0xD0, 0xC8, 0xC0,
                            0xB8, 0xB0, 0xA8, 0xA0, 0x98, 0x90, 0x88, 0x80]);
  assert.equal(e.explosion, 0x10, '$C713');
  assert.equal(e.countdown, 0x7F, 'and the half ends one step past $80');
});

test('an explosion sits at the boss cell plus a signed nibble on each axis', () => {
  // ROM: $78F8-$791B. High nibble -> X, low nibble -> Y, each sign-extended by
  // its own bit 3, added to the enemy's Xhi/Yhi, and BOTH low bytes forced to
  // $80. MEASURED on the cartridge (level 4, boss at Xhi $02 / Yhi $1E):
  // offset $00 -> {10 02 80 1E 80 01}, $FF -> {10 01 80 1D 80 01}.
  const state = bare({ bossId: 1 });
  resetEffects(state);                     // attaches src/doors.js's $C693
  const r = corpse(state, 0x0A);
  const e = effects(state);
  const pool = state.doors.effects;
  const spawned = [];
  while (e.countdown >= 0x80) {
    const before = e.explosion;
    bossCountdownTick(state, r);
    if (e.explosion !== before) {
      spawned.push(Array.from(pool.find((q) => q[0] === 0x10)));
    }
    // Keep the pool from filling: the ROM's own loc_00_1391 does this.
    for (const q of pool) if (q[0] !== 0) q[0] -= 1;
  }
  assert.deepEqual(spawned[0], [0x10, 0x02, 0x80, 0x1E, 0x80, 0x01]);
  assert.deepEqual(spawned[1], [0x10, 0x01, 0x80, 0x1D, 0x80, 0x01]);  // $FF
  assert.deepEqual(spawned[2], [0x10, 0x02, 0x80, 0x1D, 0x80, 0x01]);  // $0F
  assert.deepEqual(spawned[3], [0x10, 0x01, 0x80, 0x1F, 0x80, 0x01]);  // $F1
  assert.deepEqual(spawned[4], [0x10, 0x03, 0x80, 0x1E, 0x80, 0x01]);  // $10
  assert.equal(spawned.length, 16);
});

test('every explosion cues sound $17 with mask $01, not the other way up', () => {
  // ROM: $792D `LD BC,$1701` -- B is the id and C the mask
  // (docs/03-VERIFICATION.md 32). Reversed, a cue still plays and no memory
  // comparison ever catches it.
  const state = bare({ bossId: 1 });
  const r = corpse(state, 0x0A);
  const e = effects(state);
  while (e.countdown >= 0x80) bossCountdownTick(state, r);
  assert.equal(state.sound.queue.length, 4, 'the $C6FB ring caps at four');
  for (const c of state.sound.queue) assert.deepEqual(c, { id: 0x17, mask: 0x01 });
});

test('the second half walks a per-boss pose table and never touches the pool', () => {
  // ROM: loc_01_7936. The index is facing * 8 + (($C740 & $70) >> 4), and the
  // arm is chosen by the enemy's STATE byte: 7 and $0A take loc_01_79A2 (and
  // $C73E == 2 alone reads the second table), 9 takes loc_01_7984, everything
  // else the default at $7960.
  const boss1 = bare({ bossId: 1 });
  const r1 = corpse(boss1, 0x0A);
  effects(boss1).countdown = 0x7F;
  assert.equal(bossCountdownTick(boss1, r1), 'tail', '$7981 -> loc_01_60C7');
  assert.equal(r1[6], 17, 'facing 0, step 7');
  assert.equal(effects(boss1).explosion, 0, 'no more explosions');

  const boss2 = bare({ bossId: 2 });
  const r2 = corpse(boss2, 0x07);
  effects(boss2).countdown = 0x7F;
  bossCountdownTick(boss2, r2);
  assert.equal(r2[6], 37, 'the $C73E == 2 table');

  const boss3 = bare({ bossId: 3 });
  const r3 = corpse(boss3, 0x08);
  r3[5] = 1;                                   // facing left
  effects(boss3).countdown = 0x7F;
  bossCountdownTick(boss3, r3);
  assert.equal(r3[6], 51, 'the default arm is indexed by facing alone');

  const boss4 = bare({ bossId: 4 });
  const r4 = corpse(boss4, 0x09);
  effects(boss4).countdown = 0x7F;
  bossCountdownTick(boss4, r4);
  assert.equal(r4[6], 60);
});

test('only the default arm blinks, on $FFB1 bit 3', () => {
  // ROM: $7973 `LDH A,[$FFB1] / AND $08 / JR Z` -- eight frames drawn, eight
  // skipped. loc_01_79A2 and loc_01_7984 have no such test.
  const state = bare({ bossId: 3 });
  const r = corpse(state, 0x08);
  const e = effects(state);
  let drawn = 0, skipped = 0;
  for (let f = 0; f < 16; f++) {
    state.frame = f;
    state.enemyDraws = [];
    e.countdown = 0x7F;
    bossCountdownTick(state, r);
    if (state.enemyDraws.length) drawn++; else skipped++;
  }
  assert.equal(drawn, 8);
  assert.equal(skipped, 8);
});

test('the countdown zeroes $C712 every frame of the second half', () => {
  // ROM: $797E / $799C / $79D5. All three arms do it, which is what leaves
  // loc_00_34D0's phase byte at 0 the first time it runs.
  const state = bare({ bossId: 1 });
  const r = corpse(state, 0x0A);
  const e = effects(state);
  e.countdown = 0x7F;
  e.phase = 3;
  bossCountdownTick(state, r);
  assert.equal(e.phase, 0);
});

test('level 6 leaves the countdown early, at the state test', () => {
  // ROM: $7957 `CP $05 / JP Z, loc_00_34D0`. The level-6 target never walks a
  // pose table at all.
  const state = bare({ level: 6, bossId: 0 });
  const r = corpse(state, 0x05);
  effects(state).countdown = 0x7F;
  assert.equal(bossCountdownTick(state, r), 'victory');
});

// ---------------------------------------------------------------------------
// loc_00_34D0 -- the fanfare
// ---------------------------------------------------------------------------

/** Run the fanfare from $C740 == 0 and report where each landmark fell. */
function runFanfare(state) {
  const e = effects(state);
  const r = corpse(state, 0x0A);
  e.countdown = 0;
  const marks = {};
  const mark = (k, n) => { if (!(k in marks)) marks[k] = n; };
  for (let n = 1; n <= 1000; n++) {
    if (!updateVictoryHold(state)) {
      if (bossCountdownTick(state, r) === 'victory') victoryStep(state);
    }
    if (e.phase === 1) mark('phase1', n);
    if (e.phase === 2) mark('phase2', n);
    if (e.phase === 3) mark('phase3', n);
    if (e.windowRamp !== 0x90) mark('ramp', n);
    if (e.windowRamp === 0x32) mark('rampEnd', n);
    if (state.flow.levelCleared === 1) { mark('clear', n); break; }
  }
  return marks;
}

test('the fanfare is 23 + 355 frames and raises the clear at the end of it', () => {
  // MEASURED on level 4 (tools/oracle/deathdiff.mjs): $C712 becomes 1 at f341,
  // 2 at f363, 3 at f365, $FFAC leaves $90 at f399 and reaches $32 at f445,
  // and $C753 is written at f719.
  const state = bare({ level: 4, bossId: 1 });
  const m = runFanfare(state);
  assert.deepEqual(m, { phase1: 1, phase2: 23, phase3: 25,
                        ramp: 59, rampEnd: 105, clear: 379 });
  assert.equal(effects(state).countdown, COUNTDOWN_IDLE, '$3631: $C740 = $FF');
});

test('a route-completing clear leaves $C740 at 0 for the next level to rearm', () => {
  // ROM: $361E. `CP $07 / JR NZ` -- the completing arm at $3622 jumps to
  // loc_00_04BB without ever running $3631's `LD A,$FF / LD [$C740],A`.
  // MEASURED: the cartridge arrives at level 12 with $C740 = 0.
  const state = bare({ level: 0x0B, bossId: 3 });
  state.flow.routeMask = 0x03;
  runFanfare(state);
  assert.equal(effects(state).countdown, 0);

  const other = bare({ level: 0x0B, bossId: 3 });
  other.flow.routeMask = 0x00;
  runFanfare(other);
  assert.equal(effects(other).countdown, COUNTDOWN_IDLE, 'the $362A arm does');
});

test('level 6 skips the fanfare and takes one fade', () => {
  // ROM: $34E1-$34F3. $FFB0 == $06 zeroes $C70F and $C712, runs one
  // sub_00_0A7F and jumps straight to loc_00_35E8.
  const state = bare({ level: 6, bossId: 0 });
  const e = effects(state);
  const r = corpse(state, 0x05);
  e.countdown = 0;
  let cleared = 0;
  for (let n = 1; n <= 200 && !cleared; n++) {
    if (!updateVictoryHold(state)) {
      if (bossCountdownTick(state, r) === 'victory') victoryStep(state);
    }
    if (state.flow.levelCleared === 1) cleared = n;
  }
  assert.equal(cleared, 35, '1 entry + 33 fade + the $35E8 frame');
  assert.equal(e.phase, 0, '$34EB never leaves $C712 at 1');
});

// ---------------------------------------------------------------------------
// Level init
// ---------------------------------------------------------------------------

test('resetEffects rearms $C740 and empties both pools', () => {
  // ROM: $0DC8-$0DCA writes $C740 = $FF and sub_00_29A5 wipes $C693. The port
  // hangs both off loadEnemies, which is the level-init hook src/enemies.js
  // already owns.
  const state = bare({ bossId: 1 });
  const e = effects(state);
  startDeathBurst(state);
  e.countdown = 0x40;
  e.explosion = 9;
  e.phase = 2;
  resetEffects(state);
  assert.equal(e.countdown, COUNTDOWN_IDLE);
  assert.equal(e.explosion, 0);
  assert.equal(e.phase, 0);
  assert.equal(e.stage, -1);
  for (const r of e.burst) assert.deepEqual(Array.from(r), [0, 0, 0, 0, 0]);
  for (const r of state.doors.effects) assert.equal(r[0], 0);
});
