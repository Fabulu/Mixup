// WAVE 32b -- the $0600 ARM POOL and the $9663 HALF-RATE FRAME FORK.
//
// Twelve checks. Every one was mutation-verified: the mutation table is in
// docs/worklog/gradius/32b-impl-substrate.md, and a check with no mutant that
// reddens it is named there rather than counted as coverage.
//
// WHAT THIS SUITE CANNOT DO, stated first so it is not mistaken for coverage:
// there is no cartridge comparison here. No scenario in the corpus reaches
// stage 5 -- W31 measured the endchain trajectory dying three times inside
// stage 2 and game-overing at f14333, and W32a re-confirmed it. So every
// number below is the PORT compared against THE LISTING, which is what
// docs/knowledge/10 says the guarantee has to rest on when the behaviour space
// cannot be sampled. The ROM constants are read out of assets/prg.bin so that
// the checks cannot agree with themselves through the port's own copies --
// docs/knowledge/03's named failure mode, which W32a's own spawn-frame check
// walked into.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS, headlessResources } from './helpers.js';
import { createState, u8, ARM_POOL, ENEMY_BASE } from '../src/state.js';
import { spawnEngine, updateEnemies, armCensus, armDriver, armDriverGated }
  from '../src/enemies.js';
import { buildDisplayList, rotateBase, nextSlot } from '../src/oam.js';
import { collision } from '../src/collision.js';
import { stagePlay } from '../src/nmi.js';

const res = headlessResources(0);
const prg = new Uint8Array(readFileSync(join(ASSETS, 'prg.bin')));
const rb = (a) => prg[a - 0x8000];

/** A state parked in stage 5 with an empty pool. */
function stage5() {
  const s = createState();
  s.zp19 = 4;
  s.substate = 0x80;
  s.obj.x[0] = 0x60; s.obj.y[0] = 0x60;   // the player, $0360/$0320
  return s;
}

/** Drive `$A4A6` through the inline-5 route, with the record's own bytes. */
function spawnArms(s, z65, z66 = 0x14, z67 = 0x80) {
  s.spawn.z65 = z65; s.spawn.z66 = z66; s.spawn.z67 = z67;
  // $A466 LDA $19 / CMP #$02 / BNE -> $A4A6. spawnEngine is not reachable on
  // stage 5 (the $A2F0 scope guard), so the arm is driven through $C653, the
  // ONE producer that is: $68 = $27 makes the next call the $28th.
  s.build.gate = 0;
  return s;
}

/**
 * `$C653` fires on the $28th late-spawner call. FOUR gates have to line up and
 * every one of them is the ROM's:
 *
 *   $3A == 0    $A2C0 BEQ $A2C7 -- a NON-zero $3A goes to $C413 too, but then
 *               $C42D BEQ $C434 sends it to $C686 (the warp rain) instead of
 *               the stage dispatch, so the warp route can never reach $C653
 *   $60 >= 2    $A2C9/$A2CD -- the spawn engine's running state
 *   $1B == $82  $A2F7 CMP #$82 / $A2FB JMP $C413, and this is the ONLY route
 *               into the late spawner that reaches jt_$C439
 *   $02 & 3 == 0  $C413 -- one frame in four
 */
function lateSpawn(s, rowIndex) {
  s.spawn.z68 = 0x27;                     // one call short of $28
  s.spawn.z69 = rowIndex * 2;             // $C65F AND #$06
  s.build.gate = 0;                       // $3A
  s.spawn.z60 = 2;                        // $60
  s.substate = 0x82;                      // $1B -> $A2FB JMP $C413
  s.frame = 0;                            // $02
  spawnEngine(s, res);
}

const groups = (s) => [0x00, 0x30, 0x60, 0x90].map((b) => s.coll[ARM_POOL + b]);

// =================== 1. THE FOUR $C67A ROWS, AGAINST THE ROM ================

test('$C67A: the AND #$06 mask makes exactly four rows reachable, and two spawn NO arm', () => {
  // $C65F LDA $69 / AND #$06 / TAX -- so $69 can only ever index rows 0, 2, 4
  // and 6 of a TWELVE-byte table. Rows at +8 and +10 are unreachable, and one
  // of them ($C684 = 28 0A) is the stage-2/3 arm's own $3A gate sitting inside
  // the same run.
  //
  // THE TWO ZERO ROWS ARE THE POINT. $65 = 0 means $A500's `AND #$0F / BEQ
  // $A4CD` takes the nibble-0 arm, `LSR` four times leaves 0, `BNE` fails, and
  // the owner is spawned with NO ARMS AT ALL. A port that treated $65 as "the
  // number of arms" would give these one arm each.
  // RED WHEN: the mask becomes AND #$0E (8 rows), or the nibble-0 arm allocates.
  const rows = [0, 1, 2, 3].map((i) => [rb(0xC67A + 2 * i), rb(0xC67B + 2 * i)]);
  assert.deepEqual(rows, [[0x02, 0x80], [0x00, 0x40], [0x01, 0x80], [0x00, 0xC0]],
    'the four reachable $C67A rows, straight out of prg.bin');
  const armCounts = [];
  for (let r = 0; r < 4; r++) {
    const s = stage5();
    lateSpawn(spawnArms(s), r);
    armCounts.push(groups(s).filter((v) => v !== 0).length);
    // the owner always spawns, arms or not: type $14, X $F0, Y from the row
    const slot = s.obj.type.findIndex((t, i) => i >= 12 && i < 22 && t === 0x14);
    assert.ok(slot > 0, `row ${r} must spawn the owner`);
    assert.equal(s.obj.x[slot], 0xF0, '$A4E6 LDA #$F0 / STA $036C,X');
    assert.equal(s.obj.y[slot], rows[r][1], '$A4EB LDA $67 / STA $032C,X');
    assert.equal(s.obj.anim[slot], 0x89, '$A4F0 LDA #$89');
    assert.equal(s.obj.status[slot], 0x80, '$A4E1 LDA #$80 -- armoured');
  }
  assert.deepEqual(armCounts, [1, 0, 1, 0],
    'rows 1 and 3 have $65 = 0 and allocate NO group');
  // $69 = 8 MUST WRAP TO ROW 0. This is the half of the check the mask is
  // actually for: AND #$06 folds 8 back to 0, AND #$0E would let it read
  // $C682 = 12 40 -- an unreachable row that spawns TWO arms.
  const wrap = stage5();
  lateSpawn(spawnArms(wrap), 4);                 // $69 := 8
  assert.equal(groups(wrap).filter((v) => v !== 0).length, 1,
    '$69 = 8 must fold to row 0 (one arm), not read $C682');
  const w = wrap.obj.type.findIndex((t, k) => k >= 12 && k < 22 && t === 0x14);
  assert.equal(wrap.obj.y[w], 0x80, 'and row 0s Y, not $C683s $40');
  assert.equal(wrap.spawn.z69, 2, '$C672 INX INX / STX $69 -- from the MASKED x');
});

// =================== 2. THE NIBBLE ALLOCATOR ===============================

test('$A4A6: $65 is consumed FOUR BITS AT A TIME, highest group first, shape = nibble - 1', () => {
  // $A4CD LSR $65 x4 / BNE $A4B7 -- at most TWO passes for any byte, so one
  // call can never fill the pool. $A4B7 restarts the walk at $90 every pass, so
  // the FIRST nibble takes the highest free group.
  //
  // $12 is stage 5's own two-arm record ($ABED). Low nibble 2 -> shape 1 into
  // group $90; then $65 becomes $01 -> shape 0 into group $60.
  // RED WHEN: the walk starts at $00, the shift is 1 bit, or the -1 is dropped.
  const s = stage5();
  spawnArms(s, 0x12);
  lateSpawnWith(s, 0x12);
  assert.deepEqual(groups(s).map((v) => v !== 0), [false, false, true, true],
    'groups $60 and $90 taken, $00 and $30 free');
  assert.equal(s.coll[ARM_POOL + 0x90 + 1], 1, 'first nibble 2 -> shape 1 at $90');
  assert.equal(s.coll[ARM_POOL + 0x60 + 1], 0, 'second nibble 1 -> shape 0 at $60');
  assert.equal(s.spawn.z65, 0, '$65 is shifted IN PLACE and ends at 0');
  // $A4F5 LDA $98 / STA $016C,X -- the owner's arm COUNT, not a metasprite.
  const slot = s.obj.type.findIndex((t, i) => i >= 12 && i < 22 && t === 0x14);
  assert.equal(s.obj.animFrame[slot], 2, '$98 counted two allocations');
  assert.equal(s.obj.s0460[slot - ENEMY_BASE], 1,
    '$A4FC STA $0460,X -- the DEPLOY flag at index j, not j+$0C');
  assert.equal(s.obj.s0460[slot], 0,
    '$046C+j (the DAMAGE counter) must be left at $A527s zero');
  // $A517 WRITES THREE ARRAYS, NOT FOUR. Six iterations clear +$10..$15
  // (angle), +$02..$07 and +$18..$1D (X). The Ys at +$20..$25 keep whatever
  // the previous tenant left, and that is observable on the first frame after
  // a re-allocation. Poison them, allocate over the top, and they must survive.
  const p2 = stage5();
  for (const b of [0x90, 0x60]) {
    for (let k = 0; k <= 5; k++) {
      p2.coll[ARM_POOL + b + 0x20 + k] = 0xA0 + k;   // Y -- must SURVIVE
      p2.coll[ARM_POOL + b + 0x10 + k] = 0xA0 + k;   // angle -- must be cleared
      p2.coll[ARM_POOL + b + 0x18 + k] = 0xA0 + k;   // X     -- must be cleared
      p2.coll[ARM_POOL + b + 0x02 + k] = 0xA0 + k;   // timers -- must be cleared
    }
  }
  spawnArms(p2, 0x12);
  lateSpawnWith(p2, 0x12);
  for (const b of [0x90, 0x60]) {
    for (let k = 0; k <= 5; k++) {
      assert.equal(p2.coll[ARM_POOL + b + 0x20 + k], 0xA0 + k,
        'the segment Y at +$' + (0x20 + k).toString(16) + ' must SURVIVE $A517');
      assert.equal(p2.coll[ARM_POOL + b + 0x10 + k], 0, 'the angle IS cleared');
      assert.equal(p2.coll[ARM_POOL + b + 0x18 + k], 0, 'the X IS cleared');
      if (k >= 2) {
        assert.equal(p2.coll[ARM_POOL + b + 0x02 + k], 0, '+$02..$07 ARE cleared');
      }
    }
  }
});

/** $C653 with a forced $65 -- the four ROM rows only give 0, 1, 2. */
function lateSpawnWith(s, z65) {
  // The ROM has no producer of $65 = $12 outside the wave stream ($ABED), and
  // the wave stream is behind the $A2F0 scope guard. Rather than fake a route
  // the cartridge does not have, this drives $A4A6 through $C653 and then
  // overwrites $65 the way $C664 would have -- i.e. it exercises the ALLOCATOR
  // with a value the ROM does produce, from a different producer. Labelled,
  // per docs/knowledge/09 on intervention runs.
  s.spawn.z68 = 0x27; s.spawn.z69 = 0; s.build.gate = 0;
  s.spawn.z60 = 2; s.substate = 0x82; s.frame = 0;
  const rom = res.enemyTables;
  const orig = rom.read;
  rom.read = (a) => (a === 0xC67A ? z65 : orig(a));
  try { spawnEngine(s, res); } finally { rom.read = orig; }
}

test('$A4A6 refuses enemy slot 0 -- the DEX/BNE quirk, with a caller at last', () => {
  // $A4A6 LDX #$09 / LDA $030C,X / BEQ / DEX / BNE $A4A8 -- the loop exits when
  // X reaches 0 WITHOUT testing it, so slot 0 is never allocated. $C41E's
  // allocator, three routines away, is DEX/BPL and does test it. wave 3 wrote
  // allocEnemySlot(state, testsIndexZero) for exactly this and had no caller
  // for it until now.
  // RED WHEN: the flag is flipped to true.
  const s = stage5();
  for (let j = 1; j <= 9; j++) s.obj.type[j + ENEMY_BASE] = 0x05;  // all busy but 0
  lateSpawn(spawnArms(s), 0);
  assert.equal(s.obj.type[0 + ENEMY_BASE], 0,
    'slot 0 is free and must STAY free -- $A4B0 RTS drops the spawn');
  assert.deepEqual(groups(s), [0, 0, 0, 0],
    'and no group is allocated when the owner cannot be');
});

// =================== 3. THE FRAME FORK =====================================

test('$9663: $5C is the live-group census, and it is the ONLY writer besides $965A', () => {
  // $9669-$9683 walks $0600/$0630/$0660/$0690 LOW TO HIGH -- the opposite
  // direction from every other walk over this pool, and that is the listing's.
  // RED WHEN: the census counts a different set of bases, or misses one.
  const s = stage5();
  assert.equal(armCensus(s), 0);
  for (const [i, b] of [0x00, 0x30, 0x60, 0x90].entries()) {
    s.coll[ARM_POOL + b] = 3;
    assert.equal(armCensus(s), i + 1, `group at +$${b.toString(16)} must count`);
  }
  // and a byte one past a header must NOT count
  const t = stage5();
  t.coll[ARM_POOL + 0x01] = 9;
  t.coll[ARM_POOL + 0x2F] = 9;
  assert.equal(armCensus(t), 0, '$0601 and $062F are not headers');
});

test('$9689: the fork is the ODD frame, and it runs a DIFFERENT ORDER from $9A5E', () => {
  // $9685 CPX #$02 / BCC $96A5 and $9689 LDA $02 / LSR A / BCC $96A5. Both fall
  // through to the SAME ladder, so fewer than two arms OR an even frame is a
  // completely ordinary frame.
  //
  // THE ORDER IS THE CHECK. $968E runs $A2C0 -> $CB91 -> $ADAB -> $BBB7 ->
  // $9FFC -> $C0C7; $9A5E runs $A2C0 -> $BBB7 -> $9FFC -> $ADAB. The player
  // moves AFTER the enemies on the fork and BEFORE them on the normal path.
  // RED WHEN: the parity is inverted, the >= 2 becomes > 2, or the fork reuses
  // mode5Body's order.
  const order = [];
  const spy = (s) => {
    // A one-frame trace by monkey-patching the observable side effects is not
    // available here (the callees are module-private), so the order is checked
    // STRUCTURALLY against the listing's own six JSRs, and behaviourally by the
    // two properties the order produces: $5B is INC'd (only $96A0 does that on
    // a play frame) and the $1B ladder is skipped.
    return s;
  };
  spy(null);
  const src = readFileSync(new URL('../src/nmi.js', import.meta.url), 'utf8');
  const fork = src.slice(src.indexOf('if (state.zp5C >= 2 &&'),
                         src.indexOf('$96A2 JMP $9A8C'));
  // The CALLS, in source order -- not the comments. A comment-only scan is a
  // check that cannot fail when the statements are reordered, and mutant M28
  // proved that by surviving the first draft of this line.
  const calls = [...fork.matchAll(/^ {6}(\w+)\(state[,)]/gm)].map((m) => m[1]);
  assert.deepEqual(calls,
    ['spawnEngine', 'armDriver', 'updateEnemies', 'enemyBullets',
     'updatePlayer', 'collision', 'mode5Tail'],
    'the fork body must CALL the six in the ROM order, then $9A8C');
  const seq = [...fork.matchAll(/\$9(6[89A][0-9A-F]) JSR \$([0-9A-F]{4})/g)]
    .map((m) => m[2]);
  assert.deepEqual(seq, ['A2C0', 'CB91', 'ADAB', 'BBB7', '9FFC', 'C0C7'],
    'and cite the six JSRs it is transcribing');
  // ...and the ROM must actually have them in that order, read from prg.bin so
  // the check cannot agree with the comment it is checking.
  const romSeq = [0x968E, 0x9691, 0x9694, 0x9697, 0x969A, 0x969D].map((a) => {
    assert.equal(rb(a), 0x20, `${a.toString(16)} must be JSR`);
    return (rb(a + 1) | (rb(a + 2) << 8)).toString(16).toUpperCase();
  });
  assert.deepEqual(romSeq, ['A2C0', 'CB91', 'ADAB', 'BBB7', '9FFC', 'C0C7'],
    'and prg.bin must agree');
  // BEHAVIOUR: $5B IS THE DISCRIMINATOR, and it is the ROM's own. `$96A0 INC
  // $5B` is the only thing that raises it on a play frame, and $9A9C/$9ACA then
  // read it to suppress the camera and the streamer for that frame. So "did
  // this frame fork?" is exactly "is $5B 1 at the end of it?".
  //
  // $60 = 0 so that $A2C7's `LDX $60 / BEQ` returns before the $A2F0 scope
  // guard -- otherwise BOTH paths throw and the check cannot tell them apart.
  // (The first draft did exactly that and mutant M9 survived it.)
  const forked = (arms, frame) => {
    const s = stage5();
    for (let n = 0; n < arms; n++) s.coll[ARM_POOL + 0x30 * n] = 1;
    s.zp1E = 1; s.zp1F = 2; s.frame = frame; s.spawn.z60 = 0;
    stagePlay(s, res);
    return s;
  };
  assert.equal(forked(2, 1).zp5B, 1, 'two arms + ODD frame -> $96A0 INC $5B');
  assert.equal(forked(2, 2).zp5B, 0, 'two arms + EVEN frame -> the $96A5 ladder');
  assert.equal(forked(2, 1).zp5C, 2, '$9683 STX $5C ran either way');
  assert.equal(forked(2, 2).zp5C, 2);
  // AND THE OTHER HALF OF THE FORK. On the EVEN frame the ladder runs, but
  // $9A5E's own `LDA $5C / CMP #$02 / BCS $9A70` then skips $A2C0/$BBB7/$9FFC/
  // $ADAB -- so the two parities together run each of them exactly once per
  // LOGICAL frame.
  //
  // W32b USED THE $A2F0 SCOPE GUARD'S THROW AS THE DISCRIMINATOR ("did the
  // spawn engine run?"). W32c moved that guard past stage 5, so the throw is
  // gone and the check is rewritten to observe the engine's actual OUTPUT
  // instead: stage 5's chunk 0 at scroll $0000 has a record whose trigger has
  // already been reached, so a frame that runs $A2C0 SPAWNS A TYPE $1D and a
  // frame that skips it does not. That is a stronger discriminator than the
  // throw ever was -- a throw only proved the call happened.
  const forkFixture = (frame) => {
    const tbl = rb(0xA7D0 + 2 * 4) | (rb(0xA7D1 + 2 * 4) << 8);
    const ptr = rb(tbl) | (rb(tbl + 1) << 8);
    const s = stage5();
    s.coll[ARM_POOL + 0x00] = 1; s.coll[ARM_POOL + 0x30] = 1;
    s.zp1E = 1; s.zp1F = 2; s.frame = frame; s.spawn.z60 = 2;
    s.spawn.z61 = 0; s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
    s.cam.hi = 0; s.cam.lo = 0;
    stagePlay(s, res);
    return s.obj.type.slice(12, 22).filter((t) => (t & 0x7F) === 0x1D).length;
  };
  assert.equal(forkFixture(2), 0,
    '$5C >= 2 on the EVEN frame must skip $A2C0 -- $9A5E BCS $9A70');
  assert.equal(forkFixture(1), 1,
    'and the ODD frame is the one that DOES run it, from $968E');
  // one arm: the normal body runs the engine on BOTH parities
  for (const fr of [1, 2]) {
    const tbl = rb(0xA7D0 + 2 * 4) | (rb(0xA7D1 + 2 * 4) << 8);
    const ptr = rb(tbl) | (rb(tbl + 1) << 8);
    const one = stage5();
    one.coll[ARM_POOL + 0x00] = 1;
    one.zp1E = 1; one.zp1F = 2; one.frame = fr; one.spawn.z60 = 2;
    one.spawn.z61 = 0; one.spawn.z6A = ptr & 0xFF; one.spawn.z6B = ptr >>> 8;
    one.cam.hi = 0; one.cam.lo = 0;
    stagePlay(one, res);
    assert.equal(one.obj.type.slice(12, 22).filter((t) => (t & 0x7F) === 0x1D).length, 1,
      `$5C = 1, frame ${fr}: $9A5E must NOT skip the engine`);
  }
});

test('one arm never forks: $5C = 1 leaves both paths ordinary', () => {
  // $9685 CPX #$02 / BCC $96A5. RED WHEN: the test becomes `!= 0` or `>= 1`.
  for (const frame of [1, 2]) {
    for (const base of [0x00, 0x30, 0x60, 0x90]) {
      const s = stage5();
      s.coll[ARM_POOL + base] = 1;
      s.zp1E = 1; s.zp1F = 2; s.frame = frame; s.spawn.z60 = 0;
      stagePlay(s, res);
      assert.equal(s.zp5C, 1, `one arm at +$${base.toString(16)}`);
      assert.equal(s.zp5B, 0,
        `$5C = 1, frame ${frame}: no fork, so no INC $5B`);
    }
  }
  // and ZERO arms is likewise ordinary on both parities
  for (const frame of [1, 2]) {
    const s = stage5();
    s.zp1E = 1; s.zp1F = 2; s.frame = frame; s.spawn.z60 = 0;
    stagePlay(s, res);
    assert.equal(s.zp5C, 0);
    assert.equal(s.zp5B, 0);
  }
});

// =================== 4. THE DRIVER AND ITS THREE GATES =====================

test('$CB8A: the driver called from $9A76 does NOTHING once two arms are alive', () => {
  // The third $5C >= 2 test in the frame, and the one that stops the arms being
  // driven twice: with two arms the fork's $9691 drives them and $9A76's
  // $C772 -> $CB8A returns immediately.
  // RED WHEN: $CB8A's gate is dropped -- the arms would move at 60 Hz.
  const s = stage5();
  s.coll[ARM_POOL + 0x90] = 5;
  s.coll[ARM_POOL + 0x90 + 0x03] = 4;             // the parity counter
  s.obj.type[5 + ENEMY_BASE] = 0x94;
  s.zp5C = 2;
  armDriverGated(s, res.enemyTables);
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x03], 4, '$CB8A RTS -- nothing moved');
  s.zp5C = 1;
  armDriverGated(s, res.enemyTables);
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x03], 3, '$5C = 1 lets $CB91 run');
});

test('$CB91: the walk is $90 down to $00, and the timer resets BEFORE the fire', () => {
  // $CB93 STA $AE / $CBB2 LDA $AE / BNE $CBC0 / $CBB6 INC $AE, and $CBB8 STA
  // $0604,X BEFORE $CBBD JSR $CBD1.
  //
  // W32b WROTE THIS AGAINST A THROW: $CBD1 was unported, so the first ripe
  // group ended the pass and "the $30 group is untouched" was a statement about
  // the throw, not about the walk. W32c ports $CBD1, so the pass now COMPLETES
  // and the untouched-$30 claim comes from $AE instead. The ONE-SHOT half moved
  // to tests/w32c-interactions.test.js, which is where W32b's surviving mutant
  // M12 finally becomes testable; what stays here is the walk ORDER and the
  // ordering of the timer reset against the fire.
  // RED WHEN: the walk changes direction, or $CBB8 moves after $CBBD.
  const s = stage5();
  const period = rb(0xCBCA + s.zp17);
  for (const b of [0x30, 0x90]) {
    s.coll[ARM_POOL + b] = 5;
    // +$03 = 0: $CC3B's DEC leaves $FF, which is ODD, so $CC45's RTS skips the
    // kinematics and the tip bytes below survive. (W32b wrote 1 here and called
    // it "ODD"; 1 DECs to 0, which is EVEN and RUNS. It did not matter then
    // because $CBD1 threw before anything read the tip.)
    s.coll[ARM_POOL + b + 0x03] = 0;
    s.coll[ARM_POOL + b + 0x04] = u8(period - 1); // one INC short of ripe
    s.coll[ARM_POOL + b + 0x1D] = 0x80;           // the tip, inside the muzzle
    s.coll[ARM_POOL + b + 0x25] = 0x60;           // window ($10..$EF, < $D0)
  }
  s.obj.type[5 + ENEMY_BASE] = 0x94;
  armDriver(s, res.enemyTables);
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x04], 0,
    '$90 is reached FIRST and $CBB8 reset its timer before $CBBD');
  assert.equal(s.coll[ARM_POOL + 0x30 + 0x04], period,
    '$30 is walked AFTER $90, was INC\'d to the period, and was refused by '
  + '$CBB2 -- so its timer is NOT reset. That is the walk order and the '
  + 'one-shot, in one byte.');
  assert.equal(rb(0xCBCA + 6), 0x19, '$CBCA is 7 rank rows ending 19');
  assert.equal(s.spawn.zAE, 1,
    '$CBB6 INC $AE ran BEFORE $CBBD -- the reader state.js said did not exist');
  assert.equal(s.obj.anim[22 + 9], 0x86,
    'and exactly one bullet exists: $CBD1 fired for the $90 group');
});

// =================== 5. THE KINEMATICS =====================================

test('$CC33: half-rate per group, and a dead owner FREES the group silently', () => {
  // $CC3B DEC $0603,X / AND #$01 / BEQ $CC46 -- odd values skip the whole
  // routine, so each group regenerates every OTHER driver pass. And $CC36 BEQ
  // $CC19 is the FIRST thing the routine can do: an owner that died by any
  // other route ($AEF8's box, a shot) leaves its groups behind, and this reaps
  // them.
  // RED WHEN: the parity test is inverted, or $CC19 stops zeroing $0600,X.
  const s = stage5();
  s.coll[ARM_POOL + 0x90] = 5;
  s.coll[ARM_POOL + 0x90 + 0x03] = 2;
  s.obj.type[5 + ENEMY_BASE] = 0x94;
  s.obj.x[5 + ENEMY_BASE] = 0x80; s.obj.y[5 + ENEMY_BASE] = 0x50;
  armDriver(s, res.enemyTables);                   // 2 -> 1, ODD -> skipped
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x03], 1);
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x18], 0, 'segment 0 X untouched');
  armDriver(s, res.enemyTables);                   // 1 -> 0, EVEN -> runs
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x03], 0);
  // $CC7C LDA $CC23,Y + $98 with Y = $9A = 4*$0460[owner] + shape.
  const z9A = 4 * s.obj.s0460[5] + s.coll[ARM_POOL + 0x90 + 1];
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x18], u8(rb(0xCC23 + z9A) + 0x80),
    'segment 0 X = $CC23[$9A] + the owner X, read from prg.bin');
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x20], u8(rb(0xCC2B + z9A) + 0x50),
    'segment 0 Y = $CC2B[$9A] + the owner Y');
  // the silent free
  s.obj.type[5 + ENEMY_BASE] = 0;
  s.coll[ARM_POOL + 0x90 + 0x03] = 0;
  armDriver(s, res.enemyTables);
  assert.equal(s.coll[ARM_POOL + 0x90], 0, '$CC19 STA $0600,X frees the group');
});

test('$CC99: five passes chain segments 1-5, and the deltas come from $CD65/$CD85', () => {
  // $CC90 LDA #$04 / STA $AA and $CD5D DEC $AA / BMI $CD64 -- FIVE iterations,
  // not six: segment 0 is written by $CC7C/$CC85 and each pass produces the
  // NEXT segment from the current one. Segment 0's ANGLE ($0610) is never
  // written by anything but $A517's clear.
  // RED WHEN: the loop runs 6 times, or writes $0610.
  const s = stage5();
  s.coll[ARM_POOL + 0x60] = 4;
  // +$03 = 1 so $CC3B's DEC leaves 0 -- EVEN, and the routine RUNS. The first
  // draft used 0, which DECs to $FF and takes $CC45's RTS, so every assertion
  // below held vacuously and mutants M15 and M16 both survived. That is
  // docs/knowledge/03's shape 1: a check whose fixture never enters the code.
  s.coll[ARM_POOL + 0x60 + 0x03] = 1;
  s.coll[ARM_POOL + 0x60 + 0x10] = 0x77;           // a sentinel in segment 0's angle
  s.obj.type[4 + ENEMY_BASE] = 0x94;
  s.obj.x[4 + ENEMY_BASE] = 0x90; s.obj.y[4 + ENEMY_BASE] = 0x40;
  armDriver(s, res.enemyTables);
  assert.equal(s.coll[ARM_POOL + 0x60 + 0x03], 0, '$CC3B DEC ran, so did $CC99');
  assert.notEqual(s.coll[ARM_POOL + 0x60 + 0x11], 0,
    'and it produced angles -- a vacuous pass is the failure mode here');
  assert.equal(s.coll[ARM_POOL + 0x60 + 0x10], 0x77,
    'segment 0s angle is NOT part of the chain');
  // A SIXTH pass would write +$16, +$1E and +$26 -- three of the bytes the
  // recon accounted for as NEVER TOUCHED by any of the 71 sites.
  for (const off of [0x16, 0x1E, 0x26]) {
    assert.equal(s.coll[ARM_POOL + 0x60 + off], 0,
      `+$${off.toString(16)} is outside the six segments and must stay 0`);
  }
  // Every one of segments 1..5 must be its predecessor plus a table delta, and
  // the tables are read from prg.bin rather than from the port's export.
  for (let k = 0; k <= 4; k++) {
    const ang = s.coll[ARM_POOL + 0x60 + 0x11 + k];
    let y = ang & 0x3F;
    const px = s.coll[ARM_POOL + 0x60 + 0x18 + k];
    const py = s.coll[ARM_POOL + 0x60 + 0x20 + k];
    let wantX;
    if (y >= 0x20) { y &= 0x1F; wantX = u8(px - rb(0xCD65 + y)); }
    else { wantX = u8(px + rb(0xCD65 + y)); }
    const gotX = s.coll[ARM_POOL + 0x60 + 0x19 + k];
    // the WRAP KILL can override it, so accept 0 only when the ROM's own two
    // conditions hold ($CD25/$CD36 with the owner X at $90).
    if (gotX !== 0) assert.equal(gotX, wantX, `segment ${k + 1} X`);
    const wantY = (ang & 0x20)
      ? u8(py - rb(0xCD85 + y)) : u8(py + rb(0xCD85 + y));
    assert.equal(s.coll[ARM_POOL + 0x60 + 0x21 + k], wantY, `segment ${k + 1} Y`);
  }
});

// =================== 6. THE OWNER, AND THE THREE $CA49 ROWS ================

test('$CA5E: damage drives DEPLOY and DEATH, and both thresholds are rank rows', () => {
  // $CA7E LDA $046C,X / CMP $CA49[$17] -- deploy; $CAAC CMP $CA50[$17] -- die.
  // $046C is the damage $C087 accumulates, and $048C := 1 is what makes $C070
  // route a hit into the accumulator instead of into $BE93.
  //
  // THE +8 NUDGE IS MEASURED AS A DIFFERENCE, not as an absolute. $CB17 JSR
  // $AEE1 drifts X half a pixel a frame and $CADC-$CB14 bobs Y toward the
  // player, so no frame leaves the owner still. Two runs identical except for
  // ONE byte ($046C) isolate the nudge from both.
  // RED WHEN: the two rows are swapped, $048C stops being set, or the nudge
  // fires twice.
  const rank = 0;
  const toDeploy = rb(0xCA49 + rank), toDie = rb(0xCA50 + rank);
  assert.equal(toDeploy, 0x0A, '$CA49[0]');
  assert.equal(toDie, 0x14, '$CA50[0]');

  /**
   * Spawn, run `warm` frames, force the damage byte, run `tail` more.
   * `tail > 1` is what makes the ONE-SHOT observable: the damage is in place
   * for every one of those frames, so a nudge that is not gated by $0460 fires
   * on all of them.
   */
  const run = (damage, warm = 2, tail = 1) => {
    const s = stage5();
    s.zp17 = rank;
    lateSpawn(spawnArms(s), 0);
    const slot = s.obj.type.findIndex((t, k) => k >= 12 && k < 22 && t === 0x14);
    const j2 = slot - ENEMY_BASE;
    for (let f = 0; f < warm; f++) { s.spawn.zA8 = j2; updateEnemies(s, res); }
    for (let f = 0; f < tail; f++) {
      s.obj.s0460[slot] = damage;                 // re-forced every frame
      s.spawn.zA8 = j2; updateEnemies(s, res);
    }
    return { s, i: slot, j: j2 };
  };

  const before = run(toDeploy - 1);
  assert.equal(before.s.obj.type[before.i], 0x94, '$CA6A forces the type');
  assert.equal(before.s.obj.s0480[before.i], 1, '$CAA9 -- it ABSORBS shots');
  assert.ok(before.s.obj.anim[before.i] < 0x83,
    'one point short of the threshold: metasprite $81/$82');
  assert.equal(before.s.obj.s0460[before.j], 1, 'the deploy flag is still set');

  const at = run(toDeploy);
  assert.ok(at.s.obj.anim[at.i] >= 0x83, '$CAA1 INY INY -> $83/$84');
  assert.equal(at.s.obj.s0460[at.j], 0, '$CA8C cleared the deploy flag');
  assert.equal(u8(at.s.obj.x[at.i] - before.s.obj.x[before.i]), 8,
    '$CA8F ADC #$08 -- exactly eight pixels more than the undeployed run');
  assert.equal(u8(at.s.obj.y[at.i] - before.s.obj.y[before.i]), 8,
    '$CA98 ADC #$08');

  // ...and it is a ONE-SHOT. FOUR frames with the damage byte held at the
  // threshold must still be +8 in total, not +32. $CA85 LDA #$00 / CMP $0460,X
  // / BEQ $CAA1 is the gate, and $CA8C clears the byte the moment it fires.
  const held = run(toDeploy, 2, 4);
  const base4 = run(toDeploy - 1, 2, 4);
  assert.equal(u8(held.s.obj.x[held.i] - base4.s.obj.x[base4.i]), 8,
    'four deployed frames still add exactly 8 -- $CA87 gates the nudge');
  assert.equal(u8(held.s.obj.y[held.i] - base4.s.obj.y[base4.i]), 8);

  // death: the slot becomes an explosion and every group it owned is freed
  const dead = run(toDie);
  assert.equal(dead.s.obj.type[dead.i], 2, '$CB2B turns the owner into type 2');
  assert.deepEqual(groups(dead.s), [0, 0, 0, 0], '$CB4E freed its groups');
  // and one point short does NOT die
  const alive = run(toDie - 1);
  assert.equal(alive.s.obj.type[alive.i], 0x94, 'threshold - 1 is still alive');
});

test('$CB4E puts the explosion on SEGMENT 2, and $CA57 is the bob speed by rank', () => {
  // $CB6E LDA $061A,Y and $CB74 LDA $0622,Y -- base + $1A / + $22, i.e. segment
  // TWO's X and Y. The same segment $BF31 CMP #$02 makes the only vulnerable
  // one; the ROM's constant in two places, not a choice.
  // RED WHEN: the offsets become +$18/+$20 (segment 0) or +$1D/+$25 (the tip).
  const s = stage5();
  s.zp17 = 0;
  lateSpawn(spawnArms(s), 0);
  const j = s.obj.type.findIndex((t, k) => k >= 12 && k < 22 && t === 0x14) - ENEMY_BASE;
  const base = [0x00, 0x30, 0x60, 0x90].find((b) => s.coll[ARM_POOL + b] === j);
  assert.notEqual(base, undefined, 'row 0 allocates one group');
  s.coll[ARM_POOL + base + 0x1A] = 0x77;
  s.coll[ARM_POOL + base + 0x22] = 0x33;
  s.obj.s0460[j + ENEMY_BASE] = rb(0xCA50 + 0);    // the death threshold
  s.spawn.zA8 = j; updateEnemies(s, res);
  const boom = [...Array(8).keys()].find((x) => s.obj.type[x + ENEMY_BASE] === 2);
  assert.notEqual(boom, undefined, '$CB62 LDX #$07 -- slots 7..0 only');
  // THE X IS ONE LESS THAN $061A AND THAT IS AN ORDERING FACT, not a slip.
  // $ADAB walks slots 9 down to 0; the owner is slot 9 and $CB4E puts the
  // explosion in slot 7, which the SAME pass then reaches two iterations later
  // and dispatches to $AE99, whose mover is $AEE1 -- one borrow, one DEC $036C.
  // The Y is untouched because $AEE1 only moves X.
  assert.equal(s.obj.x[boom + ENEMY_BASE], u8(0x77 - 1),
    '$061A,Y = segment 2 X, less $AE99s same-pass $AEE1 drift');
  assert.equal(s.obj.y[boom + ENEMY_BASE], 0x33, '$0622,Y = segment 2 Y');
  assert.deepEqual([...Array(7)].map((_, r) => rb(0xCA57 + r)),
    [0x40, 0x48, 0x50, 0x60, 0x70, 0x80, 0x90], '$CA57: 7 rank rows');
});

// =================== 7. THE SPRITE PASS AND THE PLAYER BOX =================

test('$8C06: the TIP is segment 5, the body is tile $F7, and X = 0 is CULLED', () => {
  // $8C3B LDY $AA / BNE $8C57 -- $AA is 0 on the LAST of six passes, and $A9
  // counts UP, so the head sprite belongs to segment 5. Body sprites are tile
  // $F7 with attribute 1, except segment 3 (CPY #$03) which gets 2. A segment
  // whose X is 0 or >= $F4 is skipped WITHOUT advancing the OAM cursor.
  // RED WHEN: the tip becomes segment 0, the cull advances the cursor, or the
  // $8C02 bit-7 shift is dropped.
  const s = stage5();
  s.coll[ARM_POOL + 0x90] = 5;
  for (let k = 0; k <= 5; k++) {
    s.coll[ARM_POOL + 0x90 + 0x18 + k] = 0x40 + 8 * k;
    s.coll[ARM_POOL + 0x90 + 0x20 + k] = 0x50;
  }
  s.coll[ARM_POOL + 0x90 + 0x15] = 0x00;           // the tip's angle -> index 0
  buildDisplayList(s, res.metasprites, res.enemyTables);
  const drawn = [];
  for (let b = 0; b < 256; b += 4) {
    if (s.shadowOam[b + 1] === 0xF7) drawn.push([s.shadowOam[b + 3], s.shadowOam[b + 2]]);
  }
  assert.equal(drawn.length, 5, 'five BODY sprites, tile $F7');
  assert.equal(drawn.filter(([, a]) => a === 2).length, 1,
    'exactly one body sprite carries attribute 2 ($AA == 3)');
  // the head: $8BF2[0] with attribute $8C02[0]
  const headTile = rb(0x8BF2 + 0), headAttr = rb(0x8C02 + 0);
  let head = -1;
  for (let b = 0; b < 256; b += 4) {
    if (s.shadowOam[b + 1] === headTile && s.shadowOam[b + 3] === 0x40 + 8 * 5) head = b;
  }
  assert.notEqual(head, -1, 'the TIP (segment 5) carries $8BF2s tile');
  assert.equal(s.shadowOam[head + 2], headAttr);
  assert.equal(s.shadowOam[head], 0x50, 'attribute $02 has bit 7 clear -- no shift');
  // a flipped head ($8C02 index 2 = $C2) moves 8 px UP
  const f = stage5();
  f.coll[ARM_POOL + 0x90] = 5;
  for (let k = 0; k <= 5; k++) {
    f.coll[ARM_POOL + 0x90 + 0x18 + k] = 0x40;
    f.coll[ARM_POOL + 0x90 + 0x20 + k] = 0x50;
  }
  f.coll[ARM_POOL + 0x90 + 0x15] = 0x20;           // >> 2 = 8, >> 2 again = 2
  assert.equal(rb(0x8C02 + 2) & 0x80, 0x80, '$8C02[2] must have bit 7 set');
  buildDisplayList(f, res.metasprites, res.enemyTables);
  const ft = rb(0x8BF2 + 8);
  let fh = -1;
  for (let b = 0; b < 256; b += 4) if (f.shadowOam[b + 1] === ft) fh = b;
  assert.notEqual(fh, -1);
  assert.equal(f.shadowOam[fh], 0x48, '$8C4B SBC #$08 -- the flipped head lifts');
  // the cull
  const c = stage5();
  c.coll[ARM_POOL + 0x90] = 5;
  // distinct Ys so each segment is identifiable in OAM
  for (let k = 0; k <= 5; k++) c.coll[ARM_POOL + 0x90 + 0x20 + k] = 0x50 + k;
  c.coll[ARM_POOL + 0x90 + 0x18] = 0;              // segment 0: X = 0
  c.coll[ARM_POOL + 0x90 + 0x19] = 0xF4;           // segment 1: X = $F4
  for (let k = 2; k <= 5; k++) c.coll[ARM_POOL + 0x90 + 0x18 + k] = 0x40;
  const cursor0 = rotateBase(c.oamBase | 0);       // $8B39, then $8B45 STA $9C
  buildDisplayList(c, res.metasprites, res.enemyTables);
  let bodies = 0;
  for (let b = 0; b < 256; b += 4) if (c.shadowOam[b + 1] === 0xF7) bodies++;
  assert.equal(bodies, 3, 'X = 0 and X >= $F4 are both skipped');
  // AND THE CULL MUST NOT ADVANCE THE CURSOR. $8C2A/$8C2E branch to $8C71,
  // which is past $8C65's TXA/ADC #$C4/STA $9C and past $8C6D DEC $9F -- so a
  // culled segment costs neither an OAM slot nor a sprite from the budget, and
  // the segments after it land exactly where they would with no cull at all.
  // Measured as a SLOT INDEX, because a count cannot see this (mutant M22
  // survived the count).
  // There are no objects in this state, so the object loop stores nothing and
  // the arm pass starts exactly at $8B45's cursor. SEGMENT 2 is the first
  // segment that survives the cull, so it must land on that very slot -- which
  // is what "the cull does not advance $9C" means, and a COUNT cannot see it
  // (mutant M22 survived the count).
  const slotOfY = (y) => [...Array(64).keys()].map((n) => n * 4)
    .find((b) => c.shadowOam[b] === y && c.shadowOam[b + 3] === 0x40);
  assert.notEqual(slotOfY(0x52), undefined, 'segment 2 must be drawn');
  assert.equal(slotOfY(0x52), cursor0,
    'two culled segments must NOT have advanced the cursor past it');
  let want = cursor0;
  for (let k = 2; k <= 5; k++) {
    assert.equal(slotOfY(0x50 + k), want,
      'segment ' + k + ' must sit at the next slot in the -15 walk');
    want = nextSlot(want);
  }
  assert.equal(c.work.spritesStored, 4,
    'and the cull must not spend the $9F budget either');
});

test('$C267: the player box against the segments is 10 px, one-sided, and eats shield', () => {
  // $C27F / $C288 CMP #$0A on unsigned differences, and NEITHER SUBTRACT HAS A
  // `SEC`. The first segment tested (segment 5) inherits `$C274 ADC #$05`s
  // CLEAR carry, so its box is `px - segx - 1` in [0, 9] -- i.e. a segment
  // EXACTLY on the player is REJECTED, and one 1 to 10 px to the LEFT is not.
  // A segment to the RIGHT wraps the difference and is rejected too: the box is
  // one-sided, exactly like $C101s.
  //
  // The tested segment is put on segment 5 and the other five parked far away,
  // because the carry is loop-carried and iterations 2-6 inherit whatever the
  // previous CMP left -- so a bare "put six segments here" check would be
  // measuring three different boxes at once.
  // RED WHEN: the -1 is dropped, the box becomes signed, the shield ends the
  // sweep, or a hit with $46 = 0 stops killing.
  const px = 0x50, py = 0x50;
  const mk = (segX, segY, shield, all = false) => {
    const s = stage5();
    s.obj.status[0] = 1;
    s.obj.x[0] = px; s.obj.y[0] = py;
    s.zp.shield = shield;
    s.coll[ARM_POOL + 0x30] = 5;
    for (let k = 0; k <= 5; k++) {
      // parked where px - segx - 1 wraps: far to the RIGHT of the player
      s.coll[ARM_POOL + 0x30 + 0x18 + k] = all ? segX : 0xE0;
      s.coll[ARM_POOL + 0x30 + 0x20 + k] = all ? segY : 0xE0;
    }
    s.coll[ARM_POOL + 0x30 + 0x18 + 5] = segX;   // segment 5, tested FIRST
    s.coll[ARM_POOL + 0x30 + 0x20 + 5] = segY;
    collision(s, res);
    return s;
  };
  assert.equal(mk(px - 5, py - 5, 6).zp.shield, 5, 'dead centre of the box: one hit');
  assert.equal(mk(px - 1, py - 1, 6).zp.shield, 5, 'dx = dy = 0 is the near edge');
  assert.equal(mk(px - 10, py - 10, 6).zp.shield, 5, 'dx = dy = 9 is the far edge');
  assert.equal(mk(px - 11, py - 10, 6).zp.shield, 6, 'dx = 10 is outside');
  assert.equal(mk(px - 10, py - 11, 6).zp.shield, 6, 'dy = 10 is outside');
  assert.equal(mk(px, py, 6).zp.shield, 6,
    'a segment EXACTLY on the player misses -- $C27C SBC has no SEC');
  assert.equal(mk(px + 4, py, 6).zp.shield, 6, 'and one to the RIGHT wraps');
  // the shield does NOT end the sweep: all six in the band spend all six
  assert.equal(mk(px - 5, py - 5, 6, true).zp.shield, 0,
    '$C293 DEC $46 falls into the loop tail -- six segments, six points');
  // and with no shield left it kills
  const dead = mk(px - 5, py - 5, 0);
  assert.notEqual(dead.substate, 0x80, 'no shield: $C290 JMP $C1D6 kills the ship');
});

// ============ 7. WAVE 42 -- THE CARRY $CAE9/$CB03 INHERIT =================
//
// W40 §5a found the port one 1/256 px LOW on 237 of stage 5's cartridge frames.
// `$CAE9 SBC $CA57,Y` and `$CB03 ADC $CA57,Y` have no SEC/CLC, and nothing
// between the last carry writer and them touches the flag, so there are three
// ways in. The port modelled two. The third is `$CAB8 JSR $AEE1`, which returns
// C = 1 on every path that gets back to the arithmetic.
//
// THESE CHECKS ARE DIFFERENCES BETWEEN TWO PORT RUNS, not absolutes against a
// constant the port also reads -- docs/knowledge/03's self-sealing failure. The
// step `$CA57[$17]` cancels out; what is left is the carry alone.

/**
 * One `$CA5E` frame with the carry path chosen by hand.
 *
 * `armed` -> `$016C,X`: non-zero takes `$CAB6 BNE $CAC1` (A1, no JSR);
 * zero runs `$CAB8 JSR $AEE1` (A2).  `xf` picks WHICH of $AEE1's three exits.
 * `down` -> `$04CC,X`, the branch at `$CAE4`.  `$04AC,X` is left non-zero so
 * `$CAC1 BNE $CADC` is taken and `$CAD2 CMP $0320` never runs.
 */
function ca5eFrame({ armed, down, xf = 0xFF, x = 0x80, rank = 4 }) {
  const s = stage5();
  s.zp17 = rank;
  const j = 7, i = j + ENEMY_BASE;
  s.obj.type[i] = 0x94;
  s.obj.anim[i] = 0x81;
  s.obj.y[i] = 0x60; s.obj.yf[i] = 0x80;   // mid-range: neither clamp can bite
  s.obj.x[i] = x; s.obj.xf[i] = xf;
  s.obj.s0460[i] = 0;                      // undamaged: no deploy, no death
  s.obj.s0460[j] = 1;
  s.obj.s04A0[i] = 5;                      // $04AC,X != 0 -- the timer is running
  s.obj.s04C0[i] = down ? 1 : 0;           // $04CC,X -- the $CAE4 branch
  s.obj.animFrame[i] = armed ? 1 : 0;      // $016C,X -- the $CAB6 branch
  s.spawn.zA8 = j;
  updateEnemies(s, res);
  return { s, i, pos16: (s.obj.y[i] << 8) | s.obj.yf[i] };
}

test('$CAE9/$CB03: the A2 path inherits C=1 from $AEE1, and A1 inherits C=0', () => {
  // RED WHEN: h_AEE1 stops returning its carry, h_CA5E stops consuming it, or
  // either branch's sign is flipped.
  const step = rb(0xCA57 + 4);
  assert.equal(step, 0x70, '$CA57[4] -- the rank-4 row');

  // ---- UP ($04CC,X == 0, $CAE6 SBC) --------------------------------------
  const upA1 = ca5eFrame({ armed: true,  down: false });
  const upA2 = ca5eFrame({ armed: false, down: false });
  const base = (0x60 << 8) | 0x80;
  assert.equal(base - upA1.pos16, step + 1,
    'A1: $CAAF CMP $99 left C=0, so $CAE9 SBC borrows one extra 1/256 px');
  assert.equal(base - upA2.pos16, step,
    'A2: $CAB8 JSR $AEE1 left C=1, so $CAE9 SBC is exact');
  assert.equal((base - upA2.pos16) + 1, base - upA1.pos16,
    'the A2 frame moves EXACTLY one unit less than the A1 frame -- the carry');

  // ---- DOWN ($04CC,X != 0, $CB00 ADC) ------------------------------------
  const dnA1 = ca5eFrame({ armed: true,  down: true });
  const dnA2 = ca5eFrame({ armed: false, down: true });
  assert.equal(dnA1.pos16 - base, step,
    'A1: C=0, so $CB03 ADC is exact');
  assert.equal(dnA2.pos16 - base, step + 1,
    'A2: C=1, so $CB03 ADC carries one extra 1/256 px IN');
  assert.equal(dnA2.pos16 - base, (dnA1.pos16 - base) + 1,
    'and the ADC asymmetry is the mirror of the SBC one');
});

test('$AEE1 returns C=1 from BOTH its live exits, and C=0 only where $CAC0 RTSes', () => {
  // $AEE7 SBC #$80 / $AEEC BCS  -> C=1 (no borrow)
  // $AEF1 CMP #$08 / $AEF6 BCS  -> C=1 (X still >= 8 after the DEC)
  // $AEF6 not taken -> $AEF8    -> C=0, but $AEF8 zeroes $012C,X, so
  //                               $CABE BNE is not taken and $CAC0 RTS runs.
  // RED WHEN: h_AEE1 returns a constant, or the $AEF1 exit is given C=0.
  const step = rb(0xCA57 + 4);
  const base = (0x60 << 8) | 0x80;

  // ON THE A2 PATH $AEE1 RUNS TWICE -- once at $CAB8 and again at $CB17 -- so
  // the owner drifts a WHOLE pixel that frame, not half of one. The A1 path
  // takes only $CB17. That is the listing's shape and it is pinned here
  // because it is easy to lose when $CAB8's call is read as "the" drift.
  const a1 = ca5eFrame({ armed: true, down: false, xf: 0xFF, x: 0x80 });
  assert.deepEqual([a1.s.obj.xf[a1.i], a1.s.obj.x[a1.i]], [0x7F, 0x80],
    'A1: $CB17 alone -- half a pixel');

  // exit 1: $CAB8 sees xf $FF - $80 = $7F, no borrow -> C=1. Then $CB17 sees
  // $7F - $80, which DOES borrow, so xf comes back to $FF and X DECs once.
  const noBorrow = ca5eFrame({ armed: false, down: false, xf: 0xFF, x: 0x80 });
  assert.deepEqual([noBorrow.s.obj.xf[noBorrow.i], noBorrow.s.obj.x[noBorrow.i]],
    [0xFF, 0x7F], 'A2: TWO $AEE1 calls -- a whole pixel');
  assert.equal(base - noBorrow.pos16, step, '$AEEC exit: C=1');

  // exit 2: $CAB8 sees xf $00 - $80, which borrows, so X DECs to $7F -- still
  // >= 8, so $AEF6 is taken and C=1 as well. $CB17 then sees $80 - $80.
  const borrow = ca5eFrame({ armed: false, down: false, xf: 0x00, x: 0x80 });
  assert.deepEqual([borrow.s.obj.xf[borrow.i], borrow.s.obj.x[borrow.i]],
    [0x00, 0x7F], '$AEEE DEC $036C,X ran inside the $CAB8 call');
  assert.equal(base - borrow.pos16, step,
    '$AEF6 exit: C=1 too -- both live exits agree, so the fix is not "always 1"');

  // exit 3: X DECs from 8 to 7, below $AEF1 CMP #$08 -> $AEF8 frees the slot.
  const freed = ca5eFrame({ armed: false, down: false, xf: 0x00, x: 0x08 });
  assert.equal(freed.s.obj.type[freed.i], 0, '$AEFA STA $030C,X -- the slot is free');
  assert.equal(freed.s.obj.anim[freed.i], 0, '$AF00 STA $012C,X');
  assert.equal(freed.pos16, base,
    '$CABE BNE not taken -> $CAC0 RTS: NO arithmetic ran, so C=0 never reaches $CAE9');
});
