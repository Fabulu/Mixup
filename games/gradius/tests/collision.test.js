// $C0C7 -- collision, death, the explosion walk, and $979D's respawn.
//
// Everything asserted here was measured on the cartridge before it was written;
// the measurement is quoted at each test. The corpus comparison covers the ONE
// death it contains (right-wall f493, an enemy) and the two POKED terrain deaths
// this wave added, and it cannot cover the rest: `$0460,Y` is 0 on every frame
// so only box class 0 is ever used, `$3F` is 0 at every death so the checkpoint
// formula always yields 0, and nothing in the corpus collects a power-up so the
// respawn wipe has nothing to wipe. Those three are what this file is for.

import test from 'node:test';
import assert from 'node:assert';
import { createState, u8, ENEMY_BASE } from '../src/state.js';
import { nmi } from '../src/nmi.js';
import { collision, die, explosionWalk, playerVsEnemies, shotSweep } from '../src/collision.js';
import { respawn } from '../src/flow.js';
import { bootState } from '../src/main.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);

/** A live stage-1 play state with one enemy in slot 12 + j. */
function withEnemy(j, { type = 0x85, x = 100, y = 100, cls = 0 } = {}) {
  const s = bootState(res.manifest);
  const i = j + ENEMY_BASE;
  s.obj.type[i] = type;            // $030C,Y -- bit 7 = initialised = collidable
  s.obj.x[i] = x;                  // $036C,Y
  s.obj.y[i] = y;                  // $032C,Y
  s.obj.s0460[j] = cls;            // $0460,Y -- the box class, indexed by j
  return s;
}

// ------------------------------------------------- the box, at its boundary --

test('$C127/$C131: box class 0 is 16 x 16, and the corpus hits BOTH sides of it', () => {
  // MEASURED, right-wall, the one death in the whole corpus:
  //   f492  player (173,96) enemy (161,98)  dx = (173+4)-161 = 16  REJECTED
  //   f493  player (174,96) enemy (164,98)  dx = (174+4)-164 = 14  ACCEPTED
  // and $C16E's arghook on the accepting frame reports `a=05 x=00 y=09`, i.e.
  // box class $0460,Y = 0 and dy = 5. Replayed here with those exact numbers.
  // RED WHEN: the width comes from $BFDE instead of $BFDA, the class index is
  // taken from $0460[j+12] instead of $0460[j], or the CMP is made `>` .
  const near = () => {
    const s = withEnemy(9, { x: 161, y: 98 });
    s.obj.x[0] = 173; s.obj.y[0] = 96;
    return s;
  };
  const miss = near();
  assert.strictEqual(playerVsEnemies(miss, res), false,
    'dx = 16 is exactly $BFDA[0]; $C12A BCS rejects it');
  assert.strictEqual(miss.substate, 0x80, 'and so the ship is still playing');

  const hit = near();
  hit.obj.x[0] = 174; hit.obj.x[9 + ENEMY_BASE] = 164;
  assert.strictEqual(playerVsEnemies(hit, res), true, 'dx = 14 is inside the box');
  assert.strictEqual(hit.substate, 0xA0, '$C1F3 STA $1B');
});

test('$C12C SBC: the dy is one SMALLER than the difference, because of the carry', () => {
  // `$C127 CMP $BFDA,X` leaves carry CLEAR exactly when it falls through, and
  // `$C12E SBC $032C,Y` is subtract-WITH-BORROW. MEASURED: at right-wall f493
  // the player is at Y 96 and the enemy at Y 98, so (96+8)-98 = 6, and the
  // arghook on $C16E reports A = 5.
  // RED WHEN: the port writes `a1 - enemyY` (an off-by-one box that kills one
  // pixel early at the bottom edge and one pixel late at the top).
  //
  // The witness is the BOTTOM edge: dy must be < $10, so the largest accepted
  // difference is 16, not 15.
  const at = (playerY, enemyY) => {
    const s = withEnemy(9, { x: 100, y: enemyY });
    s.obj.x[0] = 100; s.obj.y[0] = playerY;      // dx = (100+4)-100 = 4, inside
    return playerVsEnemies(s, res);
  };
  // difference = (playerY + 8) - enemyY
  assert.strictEqual(at(108, 100), true,  'difference 16 -> dy 15, inside');
  assert.strictEqual(at(109, 100), false, 'difference 17 -> dy 16, outside');
  assert.strictEqual(at(92, 100), false,  'difference 0 -> dy $FF, outside');
});

test('$C127 vs $C131: the WIDTH is $BFDA and the HEIGHT is $BFDE, and the index is j', () => {
  // WRITTEN BECAUSE A DELIBERATE BREAK SURVIVED the test above: class 0 is
  // $10 x $10 -- the SAME byte in both tables -- so swapping $BFDA and $BFDE is
  // green on the whole suite and the whole corpus. docs/knowledge/03 shape 3,
  // in miniature.
  //
  // THE SECOND HALF OF THAT NOTE WAS WRONG AND IS CORRECTED HERE (rule 6). It
  // read "`$0460[j]` and `$0460[j+12]` are both 0 on every frame of every
  // scenario", and wave 5's reviewer called it. RE-MEASURED, this commit:
  //   * $0460-$0469 (the box classes) IS 0 in all 23 scenario seeds -- census
  //     over out/scen/*.json seedRam, which is the cartridge's own $0000-$07FF.
  //   * $046C-$0475 is NOT. It is the enemy HANDLER-STATE array (scenarios.json
  //     `_watch`, wave 3), nonzero in intro-respawn's seed
  //     ([0,0,0,0,41,30,36,36,63,52] at $046C) and written to 1..64 during play
  //     by src/enemies.js.
  // So `$0460[j+12]` is not a silent alias, it is an out-of-bounds table index:
  //   node tools/oracle/compare.mjs --only right-wall
  //     Error: collision tables: $C01A is not in any exported range
  //            (boxes $BFDA-$BFE1, explosion $C0FA-$C100)
  //       at playerVsEnemies (src/collision.js:234)
  // -- right-wall and enemy-waves both die that way. The break is CAUGHT, loudly
  // and by design ($BFDA is exported as eight bytes precisely so that a wrong
  // index cannot return a plausible width), and this test is what catches it in
  // the unit suite. What remains genuinely uninterrogated is the CLASS, not the
  // index: no measured run has ever given an enemy a box class other than 0.
  //
  // LISTING-DERIVED, NOT MEASURED, and labelled as such: the tables read
  //     $BFDA  10 20 30 10      widths
  //     $BFDE  10 20 30 02      heights
  // and class 3 is the only one where they differ. No measured run has used any
  // class but 0, so what this test pins is the port's INDEXING, not a behaviour
  // the cartridge has been seen performing.
  // RED WHEN: the width is read from $BFDE, the height from $BFDA, or the class
  // is taken from $0460[j + 12] (which is a DIFFERENT byte -- see state.js).
  const box = (cls, jClass, dyWanted) => {
    const s = withEnemy(9, { x: 100, y: 100, cls });
    s.obj.s0460[9 + ENEMY_BASE] = jClass;      // $0460[j+12]: the WRONG index
    s.obj.x[0] = 100;                          // dx = (100+4)-100 = 4
    s.obj.y[0] = 100 + dyWanted - 8 + 1;       // dy = (y+8) - 100 - 1
    return playerVsEnemies(s, res);
  };
  assert.strictEqual(box(3, 0, 1), true,
    'class 3 is $10 wide and $02 high: dx 4 and dy 1 are inside both');
  assert.strictEqual(box(3, 0, 5), false,
    'dy 5 is outside class 3\'s height of $02 -- and INSIDE class 0\'s $10, '
    + 'which is what a port reading $0460[j+12] would use');
  assert.strictEqual(box(3, 0, 8), false, 'and so is dy 8');
  // ...and the mirror: a class whose WIDTH is small and height is not.
  const wide = (cls, dx) => {
    const s = withEnemy(9, { x: 100, y: 100, cls });
    s.obj.x[0] = 100 + dx - 4;                 // dx = (x+4) - 100
    s.obj.y[0] = 93;                           // dy = (93+8)-100-1 = 0
    return playerVsEnemies(s, res);
  };
  assert.strictEqual(wide(3, 0x0F), true, 'class 3 width $10 accepts dx 15');
  assert.strictEqual(wide(3, 0x10), false, '...and rejects dx 16');
  assert.strictEqual(wide(1, 0x1F), true, 'class 1 width $20 accepts dx 31');
  assert.strictEqual(wide(2, 0x2F), true, 'class 2 width $30 accepts dx 47');
});

test('$C1B8 BPL: an enemy whose $030C bit 7 is clear cannot kill the ship', () => {
  // Wave 3 measured bit 7 of $030C,X as the INITIALISED flag: an enemy's first
  // update only sets it, so the frame it spawns it is motionless AND harmless.
  // RED WHEN: armedEnemy() tests `type != 0` instead of bit 7 -- which is green
  // on the whole corpus, because every enemy the sweep ever overlaps there has
  // been alive for many frames.
  const s = withEnemy(9, { type: 0x05, x: 100, y: 100 });   // $85 with bit 7 off
  s.obj.x[0] = 100; s.obj.y[0] = 96;
  assert.strictEqual(playerVsEnemies(s, res), false);
  assert.strictEqual(s.substate, 0x80);

  s.obj.type[9 + ENEMY_BASE] = 0x85;                        // ...and now it can
  assert.strictEqual(playerVsEnemies(s, res), true);
});

test('$C117: a free slot ($030C = 0) is skipped before the box is even looked at', () => {
  // RED WHEN: the type test is dropped -- slot 12+j then collides at (0,0) with
  // a ship at X < 12, which no scenario in the corpus can reach.
  const s = withEnemy(9, { type: 0, x: 100, y: 100 });
  s.obj.x[0] = 100; s.obj.y[0] = 96;
  assert.strictEqual(playerVsEnemies(s, res), false);
});

// -------------------------------------------------------------- $C1D6 --------

test('$C1D6: six stores, and $60 is cleared only for $1B >= $81', () => {
  // MEASURED w_0060 on right-wall: 2 at f492, 2 at f493 (the death frame) and 2
  // on every frame of the 120-frame death; 0 only at f614, where $9B3E's
  // zero-page wipe clears it. $1B is $80 at that death, and $C1DA `BCC $C1E0`
  // skips the store for anything below $81.
  // RED WHEN: `STA $60` is made unconditional -- the spawn engine then stalls
  // for the whole death and every enemy field diverges from f494.
  const s = createState();
  s.substate = 0x80; s.spawn.z60 = 2;
  s.obj.status[0] = 1; s.obj.timer[0] = 7; s.ring.cursor = 21; s.zp4C = 0;
  die(s);
  assert.strictEqual(s.spawn.z60, 2, '$1B = $80 is BELOW $81: $60 is untouched');
  assert.strictEqual(s.zp4C, 0x78, '$C1E0 LDA #$78 / STA $4C');
  assert.strictEqual(s.obj.status[0], 2, '$C1E4 STA $0100');
  assert.strictEqual(s.ring.cursor, 0, '$C1EB STA $0160');
  assert.strictEqual(s.obj.timer[0], 0, '$C1EE STA $0140');
  assert.strictEqual(s.substate, 0xA0, '$C1F3 STA $1B');

  const t = createState();
  t.substate = 0x81; t.spawn.z60 = 2;
  die(t);
  assert.strictEqual(t.spawn.z60, 0, '$1B = $81 takes the $C1DC arm');
});

// ------------------------------------------------------- the explosion walk --

test('$C0CE-$C0F4: the explosion is one metasprite per TEN frames, and $0140 wraps', () => {
  // MEASURED per frame on right-wall (w_0120 / w_0140 / w_0160 at $80B5):
  //   f493  1     0    0      <- $C1D6 has just zeroed the timer and the cursor
  //   f494  $2D   9    1
  //   f504  $2E   9    2      f514 $2F, f524 $30, f534 $30 (entry 4 repeats)
  //   f544  0     255  6      <- $C0F1 STA $0140 falls THROUGH into $C0F4 DEC
  //   f613  0     186  6
  // RED WHEN: the walk returns after the $00 instead of falling into $C0F4 (the
  // last 70 frames of every death then read $0140 = 0), or the table is treated
  // as five entries (the walk finishes ten frames early).
  const s = bootState(res.manifest);
  s.substate = 0xA0; s.obj.status[0] = 2;
  s.obj.anim[0] = 1; s.obj.timer[0] = 0; s.ring.cursor = 0;
  const seen = [];
  for (let f = 494; f <= 545; f++) {
    explosionWalk(s, res);
    seen.push([f, s.obj.anim[0], s.obj.timer[0], s.ring.cursor]);
  }
  const at = (f) => seen.find((r) => r[0] === f);
  assert.deepStrictEqual(at(494), [494, 0x2D, 9, 1]);
  assert.deepStrictEqual(at(504), [504, 0x2E, 9, 2]);
  assert.deepStrictEqual(at(514), [514, 0x2F, 9, 3]);
  assert.deepStrictEqual(at(524), [524, 0x30, 9, 4]);
  assert.deepStrictEqual(at(534), [534, 0x30, 9, 5],
    '$C0FA[4] is $30 again -- the fourth step draws no new picture');
  assert.deepStrictEqual(at(544), [544, 0x00, 255, 6],
    '$C0F1 stores 0 and $C0F4 DECs it to $FF');
  assert.deepStrictEqual(at(545), [545, 0x00, 254, 6]);
});

test('$C0EB: the terminating $00 clears both Option metasprites too', () => {
  // `$C0EB STA $0121 / $C0EE STA $0122` -- with $45 = 0 the corpus cannot see
  // this, because the Options are never drawn. RED WHEN: the two stores are
  // dropped; a player who died with Options keeps two ships on screen forever.
  const s = bootState(res.manifest);
  s.obj.anim[0] = 1; s.obj.timer[0] = 0; s.ring.cursor = 5;   // one step from $00
  s.obj.anim[1] = 4; s.obj.anim[2] = 5;
  explosionWalk(s, res);
  assert.strictEqual(s.obj.anim[0], 0);
  assert.strictEqual(s.obj.anim[1], 0, '$C0EB STA $0121');
  assert.strictEqual(s.obj.anim[2], 0, '$C0EE STA $0122');
});

// ------------------------------------------------ the terrain route, $C2C1 ---

/**
 * The cell `$C3D3` computes for the ship at (80, 96) with the camera at 0, hand
 * derived from the ROM bytes rather than from src/terrain.js (which is the thing
 * under test -- docs/knowledge/02 trap 4.4):
 *
 *   C3D3  LDA $A4 (=80) / CLC / ADC #$08         -> 88
 *   C3D8  ADC $3E (=0) / AND #$F8                -> $A0 = $58
 *   C3DE  LDA $3F (=0) / ADC #$00 / AND #$01 / CLC / ADC #$05  -> $A1 = 5
 *   C3E9  LDA $A5 (=96) / CLC / ADC #$14 / LSR x3 -> $A3 = 116 >> 3 = 14
 *   C3F3  LSR / LSR / CLC / ADC $A0              -> $A0 = $58 + 3 = $5B
 *   C402  LDA $A3 / AND #$03 / TAY               -> Y = 2, mask $C40F[2] = $30
 *
 * so the byte is $055B and the field is bits 4-5. That is the same SHAPE the
 * cartridge produced at frame 500 of this scenario's script with the camera at
 * $3E = 93: kill.py reported `page=5 idx=179 shift=4`, and $B3 = ($58 + 93 &
 * $F8) + 3.
 */
const CELL = 0x5B, CELL_VALUE = 0x10;

test('$C2BC/$C2C1: a solid cell under the ship kills it, one row lower does not', () => {
  // MEASURED, kill.py on "200:,10:S,190:,240:" --at 500: poking the computed
  // cell made $C2C1 fire on the next frame and $1B reach $A0; poking the cell
  // one BLOCK ROW lower with $FF did not, and poking nothing did not.
  // RED WHEN: probeCollision() indexes the map any other way -- it then reads a
  // cell that is still 0 and the ship flies on. This is the ONLY check in the
  // suite that makes game code call probeCollision() at all.
  const s = bootState(res.manifest);
  s.coll[CELL] = CELL_VALUE;
  nmi(s, 0, res);                     // $80AA -> $9A70 -> $BFE2 -> $C0C7 -> $C2C1
  assert.strictEqual(s.obj.status[0], 2, '$C1E6 STA $0100');
  assert.strictEqual(s.substate, 0xA0, '$C1F3 STA $1B');
  assert.strictEqual(s.zp4C, 0x78, '$C1E2 STA $4C');

  const t = bootState(res.manifest);
  t.coll[CELL + 1] = 0xFF;            // one block row = 32 px lower
  nmi(t, 0, res);
  assert.strictEqual(t.obj.status[0], 1, 'the miss control must NOT die');
  assert.strictEqual(t.substate, 0x80);

  const u = bootState(res.manifest);
  nmi(u, 0, res);
  assert.strictEqual(u.obj.status[0], 1, 'and neither must an unpoked frame');
});

test('$C2B5: the terrain probe is skipped while the ship is already dying', () => {
  // `LDA $0100 / CMP #$02 / BCS $C2C4`. MEASURED: hook.C2BC = 242 against
  // hook.C2B5 = 362 on the 700-frame run -- exactly the 120 dying frames fewer.
  // RED WHEN: the gate is dropped; $C1D6 then re-fires every frame and reloads
  // $4C to 120, so the death never ends.
  const s = bootState(res.manifest);
  s.coll[CELL] = CELL_VALUE;
  nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0x78);
  for (let i = 0; i < 5; i++) nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0x78 - 5, '$96F6 DEC $4C, and nothing reloaded it');
});

// ------------------------------------------------------- $979D, the respawn --

test('$97B1-$97BB: the checkpoint is min($3F AND $0E, 8) -- MEASURED, all seven rows', () => {
  // RE-MEASURED BY INTERVENTION ON THE CARTRIDGE, wave 5's test pass. This test
  // used to REPLAY 00-recon-flow.md's three rows; four of the seven values below
  // -- the ones that separate the mask from the cap -- had never been put to the
  // hardware at all. They have now:
  //
  //   for v in 0 3 7 8 16 20 31; do
  //     python games/gradius/tools/oracle/flowprobe.py --frames 660 \
  //       --script "200:,10:S,450:" --hooks 979D --fields st24,camHi \
  //       --poke "001B=160@500-500,004C=120@500-500,0100=2@500-500,\
  //               003F=$v@480-620"
  //   done
  //
  // Every run reports `hook.979D = total 1 firstGameFrame 621`, and the $24
  // transition on frame 621 is:
  //
  //     poked $3F |  0 |  3 |  7 |  8 | 16 ($10) | 20 ($14) | 31 ($1F)
  //     read  $24 |  0 |  2 |  6 |  8 |        0 |        4 |        8
  //
  // (0 and 16 show as "no transition", with `camHi 16 -> 0` on the same frame
  // proving $9B6A put a 0 back.) The three pokes at frame 500 are $C1D6's own
  // stores by hand -- $1B = $A0, $4C = 120, $0100 = 2 -- so that the death lands
  // on a known frame; $97B1-$97BB reads none of them.
  //
  // RED WHEN: the mask is $0F (3 -> 3, 7 -> 7), the cap is applied before the
  // mask, or the cap is dropped ($1F AND $0E is 14, and the cartridge says 8).
  // $10 -> 0 is the row where the two pull in opposite directions: the bit the
  // cap would look at is masked away first.
  for (const [cam, want] of [[3, 2], [7, 6], [0x14, 4], [0, 0],
                             [0x10, 0], [0x1F, 8], [8, 8]]) {
    const s = bootState(res.manifest);
    s.substate = 0xA0; s.obj.status[0] = 2; s.zp4C = 0;
    s.cam.hi = cam;
    respawn(s, res);
    assert.strictEqual(s.save24[0], want,
      `$3F = ${cam} should save checkpoint ${want}`);
    assert.strictEqual(s.cam.hi, want,
      '$9B6A puts it straight back into $3F, so the respawn restarts there');
    assert.strictEqual(s.build.hi, want, '$9B6C STA $55 -- the SAME byte');
  }
});

test('$97A5-$97AB: $22,X is a FLAG, not the meter cursor', () => {
  // `LDY $42 / BEQ / LDA #$01` -- a meter cursor of 6 is saved as 1. That is why
  // $9B66's restore can never give a real cursor position back.
  // RED WHEN: respawn() writes $42 itself; a player who died on meter cell 6
  // would then come back with the cursor still on SHIELD.
  for (const [meter, want] of [[0, 0], [1, 1], [6, 1]]) {
    const s = bootState(res.manifest);
    s.substate = 0xA0; s.obj.status[0] = 2; s.zp4C = 0;
    s.zp.meter = meter;
    respawn(s, res);
    assert.strictEqual(s.save22[0], want);
    assert.strictEqual(s.zp.meter, want, '$9B66 restores it from $22,X');
  }
});

test('$9B3E: a respawn LOSES every power-up, and $42 comes back as 0 or 1', () => {
  // 00-recon-weapons.md 8, measured: $40=5 $41=1 $44=2 $45=2 $46=1 forced at
  // frame 400, death at 2053, and at frame 2174 all of $40 $41 $42 $44 $45 $46
  // went to 0 in ONE frame with $1B restarting at 1. The single writer is
  // $9B3E's `LDX #$5A / STA $3D,X`.
  // RED WHEN: the wipe preserves any one of them -- the plan's own test focus.
  const s = bootState(res.manifest);
  s.substate = 0xA0; s.obj.status[0] = 2; s.zp4C = 0;
  s.zp.speed = 5; s.zp.missile = 1; s.zp.weapon = 2; s.zp.options = 2;
  s.zp.shield = 1; s.zp.meter = 6; s.zp.autofire = 4;   // $35 = 4 = rapid fire
  respawn(s, res);
  assert.strictEqual(s.zp.speed, 0, '$40');
  assert.strictEqual(s.zp.missile, 0, '$41');
  assert.strictEqual(s.zp.weapon, 0, '$44');
  assert.strictEqual(s.zp.options, 0, '$45');
  assert.strictEqual(s.zp.shield, 0, '$46');
  assert.strictEqual(s.zp.meter, 1, '$42 comes back from $22,X as the FLAG');
  assert.strictEqual(s.zp.autofire, 0x14, '$9B5E puts $35 back to 20: the rapid '
    + 'fire the seventh capsule granted is gone too');
});

test('$97C1: lives going negative is the game-over arm, and it is a loud throw', () => {
  // `LDA $20,X / BMI $97F1`. $96FD gates the whole continue on $B0, a sound byte
  // measured non-zero for 277 frames and uncharacterised -- the wave plan
  // excludes it until wave 8.
  // RED WHEN: the BMI is dropped; the port would then silently respawn a player
  // with 255 lives.
  const s = bootState(res.manifest);
  s.lives[0] = 0;
  assert.throws(() => respawn(s, res), /\$97F1/);
});

test('$97DD: the respawn clears $3A/$5D/$33/$1B and $9C09 clears $57', () => {
  // RED WHEN: $3A, $33 or $1B's store is dropped -- all three are BELOW $3D and
  // so are NOT covered by $9B3E's `LDX #$5A / STA $3D,X` wipe.
  //
  // $5D IS DIFFERENT AND THIS TEST CANNOT HOLD IT. Deleting `$97E3 STA $5D` was
  // measured GREEN on the whole suite and the whole corpus, because $5D is
  // inside $3D-$97 and $9B3E clears it again four instructions later. The store
  // is genuinely dead on this path. It is ported anyway -- leaving out a store
  // on the grounds that something else repeats it is how a port acquires a
  // difference nobody can find later -- and the fact that nothing can falsify
  // it is written down here rather than left for the next agent to rediscover.
  const s = bootState(res.manifest);
  s.substate = 0xA0; s.obj.status[0] = 2; s.zp4C = 0;
  s.build.gate = 1; s.spawn.z5D = 3; s.zp33 = 4; s.build.ahead = 1;
  respawn(s, res);
  assert.strictEqual(s.build.gate, 0, '$97E1 STA $3A');
  assert.strictEqual(s.spawn.z5D, 0, '$97E3 STA $5D');
  assert.strictEqual(s.zp33, 0, '$97E5 STA $33');
  assert.strictEqual(s.build.ahead, 0, '$97EB JSR $9C09 -- STA $57');
  assert.strictEqual(s.substate, 1, '$97E7 STA $1B, then $9B76 INC $1B');
});

// --------------------------------------------- the loops, and what is absent --

test('$BFE8: an EMPTY shot slot is skipped without touching an enemy', () => {
  // Wave 5 asserted here that a live shot slot THREW, because the inner sweep
  // was unported. Wave 6 ported it, so the assertion is inverted rather than
  // deleted (rule 6): the empty slot must still be skipped at $BFE8, and the
  // sweep must not resolve a hit for a slot whose $0123,X is 0 even when its
  // POSITION arrays still hold the last shot's coordinates -- which is exactly
  // the state $A201's free leaves ($0363,X is not cleared).
  // RED WHEN: $BFE8's `BEQ $C047` is dropped.
  const s = bootState(res.manifest);
  const i = 4 + ENEMY_BASE;
  s.obj.type[i] = 0x85; s.obj.x[i] = 100; s.obj.y[i] = 100;   // a live fan
  s.obj.anim[3] = 0;                            // $0123 -- FREE
  s.obj.animFrame[3] = 0;
  s.obj.x[3] = 100; s.obj.y[3] = 100;           // ...but still on top of it
  shotSweep(s, res);
  assert.strictEqual(s.obj.type[i], 0x85, 'the enemy survived an empty slot');
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0, 0, 0], 'and scored 0');
});

// This asserted a THROW until wave 11 ("slots 22-31 are excluded by the wave
// plan"). Inverted rather than deleted, so the arm that replaced the throw is
// held to what the throw's text promised (rule 6).

test('$C24B: an enemy bullet on the ship is the fourth route into $C1D6', () => {
  // $C20A's sweep, box class 0 ($C202[0] / $C206[0]), no shield. MEASURED on
  // the cartridge (bulletprobe.py, `$040C,X` poked so ten enemies fire):
  // $C24B fired once, at frame 500, with the bullet at dx = 0 and dy = 3 from
  // the ship -- and on the 12 frames before it, dx was 252..255 and nothing
  // happened. RED WHEN: the sweep skips live slots, tests the wrong table, or
  // routes to $C136 instead of $C1D6.
  const s = bootState(res.manifest);
  s.obj.anim[22 + 4] = 0x25;                    // $013A -- a live kind-0 bullet
  s.obj.animFrame[22 + 4] = 0;                  // $017A -- its box class
  s.obj.x[22 + 4] = s.obj.x[0];                 // dx = 0
  s.obj.y[22 + 4] = u8(s.obj.y[0] - 3);         // dy = 3 once $C23F's -1 is in
  collision(s, res);
  assert.strictEqual(s.substate, 0xA0, '$C1F3 STA $1B');
  assert.strictEqual(s.obj.status[0], 2, '$C1E6 STA $0100');
  assert.strictEqual(s.zp4C, 0x78, '$C1E2 STA $4C');
  assert.strictEqual(s.obj.anim[22 + 4], 0x25,
    '$C24B does NOT free the bullet -- only the shield arm at $C24E does');

  // One pixel further away on X than the measured accept, and the same state is
  // survivable: the cartridge rejected dx = 255 at frame 499 and killed at
  // dx = 0 at 500.
  const miss = bootState(res.manifest);
  miss.obj.anim[22 + 4] = 0x25;
  miss.obj.animFrame[22 + 4] = 0;
  miss.obj.x[22 + 4] = u8(miss.obj.x[0] + 1);   // dx wraps to 255
  miss.obj.y[22 + 4] = u8(miss.obj.y[0] - 3);
  collision(miss, res);
  assert.strictEqual(miss.substate, 0x80, 'dx = 255 >= $C202[0] -> $C259');

  // ...and the SECOND loop, $C2FF, which a dying ship reaches instead.
  const t = bootState(res.manifest);
  t.obj.status[0] = 2;                          // $C0CC -> the explosion arm
  t.obj.anim[22 + 4] = 0x25;
  t.obj.type[22 + 4] = 0;                       // $C310 BNE -> $C312 CLC/ADC #$08
  t.obj.x[22 + 4] = 80; t.obj.y[22 + 4] = 96;
  t.coll[0x5B] = 0x40;                          // the cell under (80, 96 + 8)
  collision(t, res);
  assert.strictEqual(t.obj.anim[22 + 4], 0, '$C327 -> $AEF8 STA $012C,X');
  assert.strictEqual(t.obj.x[22 + 4], 80,
    '$AEF8 is the SHORT free: the position bytes survive it');
});

// These two asserted a THROW until wave 7 ("$C1AF ... is wave 7, and says so").
// Inverted rather than deleted, so the arm that replaced the throw is held to
// what the throw's text promised (rule 6).

test('$C1AF: touching a power-up capsule frees it, INCs $42 and scores $0050', () => {
  // type AND $7F == 1 with status 6. RED WHEN: the arm falls through into
  // $C18C's "destroy everything" branch, forgets $C1FD, or ends the sweep.
  const s = withEnemy(9, { type: 0x81, x: 100, y: 100 });
  s.obj.status[9 + ENEMY_BASE] = 6;             // $010C,Y
  s.obj.anim[9 + ENEMY_BASE] = 0x11;            // $012C,Y, so $AEF8's clear shows
  s.obj.x[0] = 100; s.obj.y[0] = 96;
  assert.strictEqual(playerVsEnemies(s, res), false,
    '$C1B5 is JMP $C136 -- the sweep goes on, unlike $C18C and $C1D6');
  assert.strictEqual(s.zp.meter, 1, '$894B INC $42');
  assert.strictEqual(s.obj.type[9 + ENEMY_BASE], 0, '$C1FD -> $AEF8 STA $030C,X');
  assert.strictEqual(s.obj.anim[9 + ENEMY_BASE], 0, '$AF00 STA $012C,X');
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x50, 0, 0], '$8969 JSR $845B');
  assert.deepStrictEqual(s.sfx, [0x0D], '$896C -- $0D, not $C18C\'s $0B');
  assert.strictEqual(s.substate, 0x80, 'and the ship is very much alive');
});

test('$C1C1: the shield absorbs the hit, DECs $46 and destroys what it hit', () => {
  // MEASURED (00-recon-powerups.md 7, re-run this wave with `--poke 46=5@400`):
  // $C1BD n=6, $C1C1 n=5, $C1D0 n=5, $BE93 n=5, and the sixth contact killed.
  // RED WHEN: the DEC is missing (infinite shield), the kill is missing (the
  // enemy survives and hits again next frame), or the arm dies anyway.
  const s = withEnemy(9, { x: 100, y: 100 });
  s.obj.x[0] = 100; s.obj.y[0] = 96;
  s.zp.shield = 5;
  assert.strictEqual(playerVsEnemies(s, res), false, '$C1D3 JMP $C136');
  assert.strictEqual(s.zp.shield, 4, '$C1C1 DEC $46');
  assert.strictEqual(s.obj.type[9 + ENEMY_BASE], 2, '$C1D0 JSR $BE93 -> $BED1');
  assert.strictEqual(s.substate, 0x80, 'and NOT $A0');

  // The armoured tail instead: bit 7 of $010C,Y sends $C1C6's BPL the other way,
  // so the enemy takes damage into $046C,X and lives. Unexercised on the
  // cartridge -- no stage-1 squadron sets the bit -- and one line either way.
  const t = withEnemy(9, { x: 100, y: 100 });
  t.obj.x[0] = 100; t.obj.y[0] = 96;
  t.zp.shield = 5;
  t.obj.status[9 + ENEMY_BASE] = 0x80;          // $010C,Y bit 7
  assert.strictEqual(playerVsEnemies(t, res), false);
  assert.strictEqual(t.zp.shield, 4, 'the DEC happens on both arms');
  assert.strictEqual(t.obj.type[9 + ENEMY_BASE], 0x85, 'still alive: no $BE93');
  assert.strictEqual(t.obj.s0460[9 + ENEMY_BASE], 1, '$C1CA INC $046C,X');

  // ...and the sixth hit, with no shield left, is the death.
  const u = withEnemy(9, { x: 100, y: 100 });
  u.obj.x[0] = 100; u.obj.y[0] = 96;
  u.zp.shield = 0;
  assert.strictEqual(playerVsEnemies(u, res), true, '$C1BF BEQ $C1D6');
  assert.strictEqual(u.substate, 0xA0);
});

test('$C18C: the every-16th item frees itself, sfx $0B, and clears the screen', () => {
  // MEASURED (00-recon-powerups.md 1, `--poke 47=15@1000-1006`): the promoted
  // object came out as status 7 rather than 6, $C18C ran once, $C1AF and $894B
  // ran ZERO times, and all ten enemy slots went to class 2 in one frame.
  // No scenario reaches this -- $47 must reach 16 promotions in one life and
  // the corpus's best is 2 -- so this test is the only thing holding it.
  //
  // RED WHEN: the arm calls $894B (it must not: this pickup is not the meter),
  // uses the capsule's sfx $0D, keeps sweeping instead of jumping to $C20A, or
  // kills enemies it must skip.
  const s = withEnemy(9, { type: 0x81, x: 100, y: 100 });
  s.obj.status[9 + ENEMY_BASE] = 7;             // $010C,Y = 7, NOT 6
  s.obj.x[0] = 100; s.obj.y[0] = 96;
  // slot 8: an ordinary initialised enemy -> killed. slot 7: NOT initialised
  // ($C19E BPL) -> skipped. slot 6: type 2, an explosion ($C1A4 BCC) -> skipped.
  // slot 5: status bit 7 set ($C199 BMI) -> skipped even though it qualifies.
  for (const [j, type, status] of [[8, 0x85, 0], [7, 0x05, 0],
                                   [6, 0x82, 0], [5, 0x85, 0x80]]) {
    s.obj.type[j + ENEMY_BASE] = type;
    s.obj.status[j + ENEMY_BASE] = status;
  }
  assert.strictEqual(playerVsEnemies(s, res), false, '$C1AC JMP $C20A, not $C1D6');
  assert.strictEqual(s.zp.meter, 0, '$C18C never reaches $894B');
  assert.strictEqual(s.obj.type[9 + ENEMY_BASE], 0, '$C1FD freed the item');
  assert.deepStrictEqual(s.sfx.slice(0, 1), [0x0B], '$C18F, not the capsule\'s $0D');
  assert.strictEqual(s.obj.type[8 + ENEMY_BASE], 2, 'slot 8 killed -> class 2');
  assert.strictEqual(s.obj.type[7 + ENEMY_BASE], 0x05, 'slot 7 not initialised');
  assert.strictEqual(s.obj.type[6 + ENEMY_BASE], 0x82, 'slot 6 is an explosion');
  assert.strictEqual(s.obj.type[5 + ENEMY_BASE], 0x85, 'slot 5 has $010C bit 7');
  // $C1AC leaves $A8 where the touched slot put it, because $C194's loop walks
  // Y. A port that reset it to $FF like $C136's failed DEC would be wrong here.
  assert.strictEqual(s.spawn.zA8, 9, '$A8 is untouched by $C194-$C1A9');
});

test('$C23F: the bullet sweep\'s dy is one SMALLER, because of the carry', () => {
  // `$C238 CMP $C202,X` leaves carry CLEAR exactly when it falls through, and
  // `$C23F SBC $0336,Y` is subtract-WITH-BORROW -- the same idiom $C12C has on
  // the enemy sweep, on the other axis.
  //
  // WRITTEN BECAUSE A DELIBERATE BREAK SURVIVED THE CORPUS: dropping the `- 1`
  // is GREEN on all four enemy-bullet scenarios. The one accepted frame in the
  // whole corpus has dy = 1 against a height of 8, so a one-pixel box error
  // changes nothing there. The witness has to be the BOTTOM EDGE.
  // RED WHEN: the -1 is dropped, or added twice.
  const at = (bulletY) => {
    const s = bootState(res.manifest);
    s.obj.anim[22 + 4] = 0x25;
    s.obj.animFrame[22 + 4] = 0;                 // box class 0: $10 x $08
    s.obj.x[22 + 4] = s.obj.x[0];                // dx = 0, well inside
    s.obj.y[22 + 4] = bulletY;
    collision(s, res);
    return s.substate === 0xA0;
  };
  const py = bootState(res.manifest).obj.y[0];
  assert.strictEqual(at(py - 8), true, 'difference 8 -> dy 7, the last accepted');
  assert.strictEqual(at(py - 9), false, 'difference 9 -> dy 8, outside $C206[0]');
  assert.strictEqual(at(py + 1), false, 'difference -1 -> dy $FE, outside');
});

test('$C238 vs $C242: the WIDTH is $C202 and the HEIGHT is $C206', () => {
  // WRITTEN BECAUSE A DELIBERATE BREAK SURVIVED THE CORPUS: swapping the two
  // reads is GREEN on all four enemy-bullet scenarios. A bullet aimed at the
  // ship arrives head on, so every accepted frame has dx = 0 and dy = 1, which
  // is inside a $10 x $08 box and inside an $08 x $10 one.
  //
  // Class 0 is $10 wide and $08 high -- unlike $BFDA/$BFDE's class 0, which is
  // $10 x $10 and cannot be told apart by a swap at all (tests/collision.test.js
  // says so at $C127). So this pair CAN be separated, in both directions.
  // RED WHEN: the two reads are swapped, or either index is off by four.
  const box = (dx, dy) => {
    const s = bootState(res.manifest);
    s.obj.anim[22 + 4] = 0x25;
    s.obj.animFrame[22 + 4] = 0;
    s.obj.x[22 + 4] = u8(s.obj.x[0] - dx);
    s.obj.y[22 + 4] = u8(s.obj.y[0] - dy - 1);   // $C23F's borrow
    collision(s, res);
    return s.substate === 0xA0;
  };
  assert.strictEqual(box(10, 2), true, 'dx 10 < $10 and dy 2 < $08');
  assert.strictEqual(box(2, 10), false,
    'dx 2 is inside EITHER width, but dy 10 is outside the height $08 -- and '
    + 'inside the WIDTH $10, which is what a swapped port would use');
  assert.strictEqual(box(10, 10), false, 'outside both, whichever way round');
  assert.strictEqual(box(15, 7), true, 'the far corner of the real box');
  assert.strictEqual(box(16, 7), false, 'dx 16 is $C202[0] exactly -- BCS');
  assert.strictEqual(box(15, 8), false, 'dy 8 is $C206[0] exactly -- BCS');
});
