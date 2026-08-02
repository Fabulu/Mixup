// WAVE 5'S UNWITNESSED ARMS.
//
// tests/collision.test.js covers the wave's SHAPES -- the box at its measured
// boundary, the death's six stores, the explosion walk, the terrain route. This
// file covers the branches the recorded corpus cannot reach at all, because the
// byte that selects them never changes value in it:
//
//   $19  the stage number. 0 on every one of the 7047 compared frames, so
//        $C2A5's `CMP #$02` (stage 3: probe the terrain on odd frames only) and
//        `CMP #$04` (stage 5: no terrain collision at all) are both fall-through
//        on every frame that has ever been recorded.
//   $1A  saved beside it by $97BD. 0 everywhere, like $19 -- so `$26,X := $19`
//        and `$28,X := $1A` are two stores of 0 into two bytes that are already
//        0, and SWAPPING THEM OR DELETING BOTH is green on the whole corpus AND
//        on the whole unit suite. That is what wave 5's QA measured.
//   $0A  the bitfield of players still in the game. 1 on every compared frame,
//        so $97C5-$97DB (the two-player switch) is a no-op everywhere.
//   $036C,Y  every enemy the corpus overlaps is to the LEFT of the ship, so
//        $C125's `BCC $C136` -- the branch that stops an 8-bit subtract from
//        wrapping into a false hit -- has never been taken on a recorded frame.
//
// Each test names the mutation it was SEEN RED against. Where a mutation is also
// caught by the oracle corpus that is said too, because "the unit suite catches
// it" and "only the unit suite catches it" are different facts.

import test from 'node:test';
import assert from 'node:assert';

import { ENEMY_BASE } from '../src/state.js';
import { collision, playerVsEnemies, shotSweep } from '../src/collision.js';
import { respawn, introReset } from '../src/flow.js';
import { bootState } from '../src/main.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);

/** A state on the frame after $C1D6: dying, and $4C already counted out. */
function readyToRespawn() {
  const s = bootState(res.manifest);
  s.substate = 0xA0;                     // $1B, set by $C1F3
  s.obj.status[0] = 2;                   // $0100, set by $C1E6
  s.zp4C = 0;                            // $96F6 has counted it to 0
  return s;
}

/** A live stage-1 play state with one enemy in slot 12 + j. */
function withEnemy(j, { type = 0x85, x = 100, y = 100, cls = 0 } = {}) {
  const s = bootState(res.manifest);
  const i = j + ENEMY_BASE;
  s.obj.type[i] = type;                  // $030C,Y -- bit 7 = initialised
  s.obj.x[i] = x;                        // $036C,Y
  s.obj.y[i] = y;                        // $032C,Y
  s.obj.s0460[j] = cls;                  // $0460,Y -- the box class
  return s;
}

// ----------------------------------------------- $97AD/$97BD, the two saves --

test('$97AF/$97BF: $26,X takes $19 and $28,X takes $1A -- two DIFFERENT bytes', () => {
  // MEASURED BY INTERVENTION ON THE CARTRIDGE, this commit. The corpus dies with
  // $19 = $1A = 0, so the recorded frames cannot tell the two stores apart; a
  // poke can. flowprobe.lua writes at $80B5, i.e. after the sample, so a value
  // poked on frames 610-620 is what $979D reads when it runs on 621:
  //
  //   python games/gradius/tools/oracle/flowprobe.py --frames 660 \
  //     --script "200:,10:S,450:" --hooks 979D \
  //     --poke "001B=160@500-500,004C=120@500-500,0100=2@500-500,\
  //             0019=2@610-620,001A=5@610-620" \
  //     --fields st24,st26,st28,stage,f1A,camHi
  //     hook.979D = total 1 firstGameFrame 621
  //       f611  stage  0 -> 2      f611  f1A  0 -> 5      <- the poke
  //       f621  st26   0 -> 2      f621  st28 0 -> 5      <- $97AF / $97BF
  //
  // so $26 = 2 and $28 = 5, NOT 5 and 2. (The three pokes at frame 500 are
  // $C1D6's own stores -- $1B = $A0, $4C = 120, $0100 = 2 -- applied by hand so
  // that the death happens at a known frame; the formula under test reads
  // neither of them.)
  //
  // RED WHEN: the two stores are swapped, or either one is deleted. Both
  // mutations were measured GREEN on all 23 scenarios and on the rest of the
  // unit suite before this test existed.
  const s = readyToRespawn();
  s.zp19 = 2;                            // $19, the stage
  s.zp1A = 5;                            // $1A
  respawn(s, res);
  assert.strictEqual(s.save26[0], 2, '$97AD LDA $19 / $97AF STA $26,X');
  assert.strictEqual(s.save28[0], 5, '$97BD LDA $1A / $97BF STA $28,X');
  // ...and the other half of the round trip, $9B6E/$9B72, which reads them back
  // four instructions later in the same frame.
  assert.strictEqual(s.zp19, 2, '$9B6E LDA $26,X / STA $19');
  assert.strictEqual(s.zp1A, 5, '$9B72 LDA $28,X / STA $1A');
});

test('$97C5-$97DB: the two-player switch, and the saves that happen BEFORE it', () => {
  // `LDX $18 / LDA $0A / CPX #$01 / BNE $97D5 / LSR A / BCC $97DB / LDX #$00 ...
  //  $97D5: AND #$02 / BEQ $97DB / LDX #$01 / $97DB STX $18`, i.e.
  //
  //     $18 = 1 and $0A bit 0 set  ->  $18 := 0
  //     $18 = 0 and $0A bit 1 set  ->  $18 := 1
  //     otherwise                  ->  $18 unchanged
  //
  // $0A is 1 on every compared frame of all 23 scenarios (one player, player 2
  // out), so every recorded frame takes the "unchanged" arm and DELETING
  // `STX $18` is green on the whole corpus.
  //
  // THE ORDER IS THE OTHER HALF OF THIS TEST. All four saves ($22/$24/$26/$28)
  // are written at $97A5-$97BF, BEFORE the switch at $97C5, so they land in the
  // slot of the player who just died -- and $9B3E, running in the same frame,
  // restores from the slot of the player who is about to play. With $3F = 3 the
  // dying player's checkpoint is saved as 2 and the ship comes back at player
  // 2's checkpoint of 0.
  // RED WHEN: `state.zp.player = x` is dropped, either arm's condition is
  // inverted, or the switch is moved in front of the saves.
  const at = (player, a0A, camHi) => {
    const s = readyToRespawn();
    s.zp.player = player;                // $18
    s.zp0A = a0A;                        // $0A
    s.cam.hi = camHi;                    // $3F, the checkpoint's input
    s.lives[1] = 3;
    respawn(s, res);
    return s;
  };
  assert.strictEqual(at(0, 1, 3).zp.player, 0, '$0A = 1: bit 1 clear, no switch');
  assert.strictEqual(at(0, 2, 3).zp.player, 1, '$0A = 2: bit 1 set, 0 -> 1');
  assert.strictEqual(at(0, 3, 3).zp.player, 1, '$0A = 3: both still in, 0 -> 1');
  assert.strictEqual(at(1, 2, 3).zp.player, 1, '$0A = 2: bit 0 clear, no switch');
  assert.strictEqual(at(1, 1, 3).zp.player, 0, '$0A = 1: bit 0 set, 1 -> 0');
  assert.strictEqual(at(1, 3, 3).zp.player, 0, '$0A = 3: 1 -> 0');

  const s = at(0, 3, 3);
  assert.strictEqual(s.save24[0], 2, 'the checkpoint was saved for player 1...');
  assert.strictEqual(s.save24[1], 0, '...and NOT for the player switched to');
  assert.strictEqual(s.cam.hi, 0, '$9B68 restores $3F from $24,X with the NEW $18');
});

// -------------------------------------------------- $C125, the 8-bit borrow --

test('$C125 BCC $C136: an enemy to the RIGHT of the ship cannot wrap into a hit', () => {
  // `LDA $A0 / SEC / SBC $036C,Y / BCC $C136`. The carry is the BORROW: it is
  // clear exactly when $A0 (playerX + 4) is below the enemy's X, and the branch
  // throws that case away BEFORE the width compare. Without it the subtract
  // wraps and an enemy far to the RIGHT reads as a small positive dx.
  //
  // THE CORPUS CANNOT SEE THIS, and the reason is worth writing down: every
  // enemy it overlaps has box class 0, whose width is $10, and a wrapped
  // difference is at least 256 - 240 = 16 for any pair of on-screen X values
  // (the player's own clamp is [16, 240], $A03A/$A028). So with class 0 the
  // branch is unreachable even on the cartridge. It bites only for a WIDER box:
  // class 1 is $20 wide, and 20 - 250 wraps to 26, which is inside it.
  //
  // LISTING-DERIVED, and labelled as such: $BFDA = 10 20 30 10, and no measured
  // run has ever given an enemy a box class other than 0 (my own census of the
  // 23 scenario seeds: $0460-$0469 is 0 in every one).
  // RED WHEN: the `a0 < o.x[i]` test is dropped from playerVsEnemies().
  const hits = (enemyX, cls) => {
    const s = withEnemy(9, { x: enemyX, y: 100, cls });
    s.obj.x[0] = 16;                     // $A0 = 20, the leftmost the ship can be
    s.obj.y[0] = 96;                     // dy = (96 + 8) - 100 - 1 = 3, inside
    return playerVsEnemies(s, res);
  };
  assert.strictEqual(hits(250, 1), false,
    '20 - 250 wraps to 26, which is INSIDE class 1\'s width of $20 -- the BCC is '
    + 'the only thing that rejects it');
  assert.strictEqual(hits(10, 1), true,
    'the same box, the same width, an enemy actually to the LEFT: 20 - 10 = 10');
  assert.strictEqual(hits(250, 0), false,
    'class 0 rejects it twice over -- 26 >= $10 -- which is why 7047 compared '
    + 'frames cannot tell the two ports apart');
});

// ------------------------------------- who wins when two slots both overlap --

test('$C101/$C136: the sweep runs slot 9 DOWN to 0, and the first contact wins', () => {
  // `LDA #$09 / STA $A8 ... $C136 DEC $A8 / BPL $C115`, and $C1D6 ends
  // `JMP $C2C4` -- it ABANDONS the rest of the sweep. So when two slots overlap
  // the ship on the same frame, the HIGHER slot decides what happens and the
  // lower one is never looked at.
  //
  // The corpus contains exactly ONE contact in 7047 frames (right-wall f493,
  // slot 9), and docs/knowledge/03 says it plainly: a one-element list agrees
  // with every permutation of itself. Descending and ascending are the same
  // program for that frame.
  //
  // The two outcomes are made distinguishable by giving the slots DIFFERENT
  // types: slot 9 is a capsule (type 1, status 6 -> $C1AF, which COLLECTS and
  // then `JMP $C136`s back into the loop) and slot 3 is an ordinary armed enemy
  // (type >= 3 -> $C1BF -> death, which abandons it). Descending, BOTH happen in
  // that order; ascending, the ship dies at slot 3 and the capsule is never
  // reached, so `$42` stays 0.
  //
  // WAVE 7 CHANGED WHAT THIS ASSERTS AND NOT WHAT IT PROVES: until $C1AF was
  // ported the capsule arm was a throw and "descending" meant "the throw wins".
  // Now it means "$42 moves AND the ship still dies", which is strictly more.
  // RED WHEN: the loop counts up instead of down, or $C1D6 returns to the sweep
  // instead of leaving it.
  const both = () => {
    const s = bootState(res.manifest);
    s.obj.x[0] = 100; s.obj.y[0] = 96;
    for (const [j, type] of [[9, 0x81], [3, 0x85]]) {
      const i = j + ENEMY_BASE;
      s.obj.type[i] = type; s.obj.x[i] = 100; s.obj.y[i] = 100;
    }
    s.obj.status[9 + ENEMY_BASE] = 6;    // $010C,Y = 6 -> the capsule arm
    return s;
  };
  const desc = both();
  assert.strictEqual(playerVsEnemies(desc, res), true,
    'slot 9 is reached FIRST and collected, then slot 3 kills the ship');
  assert.strictEqual(desc.zp.meter, 1,
    '...and an ascending sweep would die at slot 3 with $42 still 0');
  assert.strictEqual(desc.substate, 0xA0, '$C1F3 STA $1B');
  const lower = both();
  lower.obj.type[9 + ENEMY_BASE] = 0;    // free the capsule's slot
  assert.strictEqual(playerVsEnemies(lower, res), true,
    '...and with slot 9 empty the sweep goes on down and slot 3 kills the ship');
  assert.strictEqual(lower.substate, 0xA0, '$C1F3 STA $1B');
});

test('$BFE6/$C2C8/$C303: every slot loop starts at its TOP slot, not its bottom', () => {
  // $BFE2 is `LDX #$08 ... DEC $A8 / BPL`, $C2C4 is `LDX #$05` and $C2FF is
  // `LDX #$09` -- all descending. Until wave 6 the only observable was the slot
  // number in a throw; the bodies exist now, so the direction is witnessed by
  // WHICH SHOT WINS instead.
  //
  // RED WHEN: any of the three loops counts up. For $BFE2 that swaps which of
  // two overlapping shots is consumed by the same enemy, which is exactly the
  // difference OAM order and the kill chain would show on a real frame.
  const swept = withEnemy(4, { x: 100, y: 100 });
  swept.obj.anim[3 + 8] = 0x0A;          // $012B -- object 11, a missile
  swept.obj.animFrame[3 + 8] = 3;
  // The missile's own box is the FOURTH entry of each $BFCE table (subtype 3):
  // x offset $08, width $10, y offset $00 -- so it has to sit BELOW the enemy to
  // overlap it, where a subtype-0 shot's y offset of $08 puts it above.
  swept.obj.x[3 + 8] = 100; swept.obj.y[3 + 8] = 105;
  swept.obj.anim[3 + 0] = 0x06;          // $0123 -- object 3, an ordinary shot
  swept.obj.animFrame[3 + 0] = 0;
  swept.obj.x[3 + 0] = 100; swept.obj.y[3 + 0] = 100;
  shotSweep(swept, res);
  assert.strictEqual(swept.obj.anim[3 + 8], 0, 'slot 11 was resolved FIRST and '
    + 'was consumed by the enemy ($C0BD STA $0123,X)');
  assert.strictEqual(swept.obj.anim[3 + 0], 0x06, '...and slot 3 met an enemy '
    + 'that $BE93 had already turned into type 2, whose bit 7 is clear, so '
    + '$C011 BPL skipped it and the shot flew on');
  assert.strictEqual(swept.obj.type[4 + ENEMY_BASE], 2, '$BED3 STA $030C,Y');

  // $C2C4: two shots at the SAME position over a poked BREAKABLE cell (field
  // value 2), which is a loud throw naming the slot it resolved first.
  const terrain = bootState(res.manifest);
  for (const x of [5, 0]) {
    terrain.obj.anim[3 + x] = 6; terrain.obj.animFrame[3 + x] = 0;
    terrain.obj.x[3 + x] = 80; terrain.obj.y[3 + x] = 96;
  }
  terrain.coll[0x5B] = 0x20;             // $055B, the cell under (80, 96): the
                                         // 2-bit field at shift 4 reads 2
  assert.throws(() => collision(terrain, res), /\$C2DC: shot slot 8 /,
    '$C2C4: LDX #$05, so object slot 3+5 = 8 first. collision() rather than '
    + 'shotSweep() because $BFE2 sweeps the same slots one loop earlier');

  // $C20A: LDX #$09, so bullet slot 22+9 = 31 is swept before 22+0 = 22. Until
  // wave 11 the only observable was the slot number inside a throw. Now it is
  // WHICH BULLET THE SHIELD EATS: two bullets on the ship with `$46` = 1, so
  // the first one found is absorbed ($C24E frees it) and the second kills.
  // RED WHEN: the loop counts up -- then slot 22 is the one that vanishes.
  const bullet = bootState(res.manifest);
  bullet.zp.shield = 1;                  // $46
  for (const j of [9, 0]) {
    bullet.obj.anim[22 + j] = 0x25;      // $0136,Y -- a live kind-0 bullet
    bullet.obj.animFrame[22 + j] = 0;    // $0176,Y -- box class 0
    bullet.obj.x[22 + j] = bullet.obj.x[0];        // dx = 0
    bullet.obj.y[22 + j] = bullet.obj.y[0] - 3;   // dy = 3, once $C23F's -1 is in
  }
  collision(bullet, res);
  assert.strictEqual(bullet.obj.anim[22 + 9], 0,
    '$C20A: LDX #$09, so slot 31 is reached FIRST and $C24E frees it');
  assert.strictEqual(bullet.obj.anim[22 + 0], 0x25,
    '...and slot 22 is the one that got through and killed the ship');
  assert.strictEqual(bullet.substate, 0xA0, '$C1F3 STA $1B -- $C24B fired');
  assert.strictEqual(bullet.zp.shield, 0, '$C250 DEC $46, exactly once');

  // $C2FF: LDX #$09 as well, and the same trick -- one solid cell under the
  // higher slot only, so the direction decides which bullet the ground eats.
  const dying = bootState(res.manifest);
  dying.obj.status[0] = 2;               // the explosion arm -> $C2FF, not $C20A
  for (const j of [9, 0]) {
    dying.obj.anim[22 + j] = 0x25;
    dying.obj.type[22 + j] = 0;          // $0316,X = 0 -> $C312 probes Y + 8
    dying.obj.y[22 + j] = 96;
  }
  dying.obj.x[22 + 9] = 80;              // over the poked cell
  dying.obj.x[22 + 0] = 200;             // and clear of it
  dying.coll[0x5B] = 0x40;               // $055B: the cell under (80, 96+8)
  collision(dying, res);
  assert.strictEqual(dying.obj.anim[22 + 9], 0, '$C327 freed the higher slot');
  assert.strictEqual(dying.obj.anim[22 + 0], 0x25, '...and only that one');
});

// ------------------------------------------------- $C2A5, the per-stage arms --

test('$C2B0: stage 3 probes the terrain on ODD $02 frames, and skips the shot loop', () => {
  // `C2A5 LDA $19 / CMP #$02 / BEQ $C2B0` then
  // `C2B0 LDA $02 / LSR A / BCC $C2FF`: bit 0 of the frame counter into the
  // carry, and BCC jumps PAST $C2B5-$C2FE -- not just past the probe. So on an
  // even frame stage 3 runs neither the terrain probe NOR the six-slot
  // shot-vs-terrain loop at $C2C4; it goes straight to the enemy bullets.
  //
  // $19 is 0 on every one of the 7047 compared frames, so neither arm has ever
  // executed. RED WHEN: the parity is inverted, the gate is dropped, or the
  // branch is modelled as "skip the probe" instead of "jump to $C2FF".
  const CELL = 0x5B, CELL_VALUE = 0x10;  // the cell under a ship at (80, 96)
  const probed = (frame) => {
    const s = bootState(res.manifest);
    s.zp19 = 2;                          // stage 3
    s.frame = frame;                     // $02
    s.coll[CELL] = CELL_VALUE;
    collision(s, res);
    return s.substate === 0xA0;          // $C1F3 -- it died, so it probed
  };
  assert.strictEqual(probed(11), true, 'odd $02: the LSR sets carry, no branch');
  assert.strictEqual(probed(10), false, 'even $02: $C2B0 BCC jumps to $C2FF');

  // The branch TARGET, witnessed separately: $C2C4's loop absorbs a shot that
  // is standing on a solid cell, and on the even frame it must never run.
  const withShot = (frame) => {
    const s = bootState(res.manifest);
    s.zp19 = 2; s.frame = frame;
    s.coll[CELL] = CELL_VALUE;
    s.obj.anim[5] = 6;                   // $0125 -- object slot 5, a shot
    s.obj.animFrame[5] = 0;
    s.obj.x[5] = 80; s.obj.y[5] = 96;    // the same cell the ship is over
    collision(s, res);
    return s.obj.anim[5];
  };
  assert.strictEqual(withShot(11), 0,
    'the odd frame falls through $C2B5 into $C2C4 and the shot is absorbed');
  assert.strictEqual(withShot(10), 6,
    '$C2B0 BCC $C2FF jumps over the whole shot loop, not just the probe');
});

test('$C2AB: stage 5 has NO terrain collision, and no terrain loops either', () => {
  // `CMP #$04 / BNE $C2B5 / RTS`. The stage-5 arm returns from $C2A5 before the
  // probe, before $C2C4's shot loop and before $C2FF's bullet loop.
  //
  // Reached here through the DYING arm ($C0C7's `$0100 >= 2` -> $C0F7 JMP
  // $C2A5), because the alive path hits src/collision.js's own $C263 throw for
  // $19 = 4 first -- which is the stage-5 destructible-block sweep, a different
  // routine, and the throw is deliberate.
  // RED WHEN: the RTS is dropped; $C2FF's ten-slot loop then runs on stage 5.
  //
  // The tripwire was a live-bullet THROW until wave 11. It is now the bullet
  // itself: one over a solid cell, which $C2FF frees and $C2AF's RTS does not.
  const dying = (stage) => {
    const s = bootState(res.manifest);
    s.zp19 = stage;
    s.obj.status[0] = 2;                 // dying: $C0CC BCS -> the explosion arm
    s.obj.anim[22 + 4] = 0x25;           // $013A -- a live enemy-bullet slot
    s.obj.type[22 + 4] = 0;              // $031A -> $C312's +8 Y offset
    s.obj.x[22 + 4] = 80; s.obj.y[22 + 4] = 96;
    s.coll[0x5B] = 0x40;                 // the cell under (80, 104)
    collision(s, res);
    return s.obj.anim[22 + 4];
  };
  assert.strictEqual(dying(4), 0x25,
    '$19 = 4 returns at $C2AF and never reaches $C2FF, so the bullet lives');
  assert.strictEqual(dying(0), 0,
    'the same state on stage 1 DOES reach it -- so the tripwire works');
});

// ------------------------------------------- $9B3E, and one dead store in it --

test('$9B3E wipes $3D-$97: every byte in the range the port models, in one store', () => {
  // `LDX #$5A / LDA #$00 / STA $3D,X / DEX / BPL $9B42` -- 91 bytes, $3D to $97
  // inclusive. src/flow.js writes it out field by field rather than as a range,
  // which is right (the port has no $3D-$97 array) but turns ONE instruction
  // into thirty-odd deletable lines. This sweeps all of them at once.
  //
  // The three survivors are the ROM's, not exceptions to it: $42 is put back by
  // $9B66 from $22,X, $3F and $55 by $9B68/$9B6C from $24,X, and $35 is set to
  // $14 by $9B5E -- all AFTER the wipe. They are asserted as restores below.
  // RED WHEN: any one of the field stores in clearZeroPage() is deleted.
  const s = bootState(res.manifest);
  const fields = [
    ['$3D', (v) => { s.cam.sub = v; }, () => s.cam.sub],
    ['$3E', (v) => { s.cam.lo = v; }, () => s.cam.lo],
    ['$40', (v) => { s.zp.speed = v; }, () => s.zp.speed],
    ['$41', (v) => { s.zp.missile = v; }, () => s.zp.missile],
    ['$44', (v) => { s.zp.weapon = v; }, () => s.zp.weapon],
    ['$45', (v) => { s.zp.options = v; }, () => s.zp.options],
    ['$46', (v) => { s.zp.shield = v; }, () => s.zp.shield],
    ['$47', (v) => { s.zp47 = v; }, () => s.zp47],
    ['$48', (v) => { s.zp48 = v; }, () => s.zp48],
    ['$49', (v) => { s.zp49 = v; }, () => s.zp49],
    ['$4A', (v) => { s.squad[0] = v; }, () => s.squad[0]],
    ['$4B', (v) => { s.squad[1] = v; }, () => s.squad[1]],
    ['$4C', (v) => { s.zp4C = v; }, () => s.zp4C],
    ['$54', (v) => { s.build.lo = v; }, () => s.build.lo],
    ['$57', (v) => { s.build.ahead = v; }, () => s.build.ahead],
    ['$58', (v) => { s.build.prog = v; }, () => s.build.prog],
    ['$5B', (v) => { s.zp5B = v; }, () => s.zp5B],
    ['$5C', (v) => { s.zp5C = v; }, () => s.zp5C],
    ['$5D', (v) => { s.spawn.z5D = v; }, () => s.spawn.z5D],
    ['$60', (v) => { s.spawn.z60 = v; }, () => s.spawn.z60],
    ['$61', (v) => { s.spawn.z61 = v; }, () => s.spawn.z61],
    ['$64', (v) => { s.spawn.z64 = v; }, () => s.spawn.z64],
    ['$65', (v) => { s.spawn.z65 = v; }, () => s.spawn.z65],
    ['$66', (v) => { s.spawn.z66 = v; }, () => s.spawn.z66],
    ['$67', (v) => { s.spawn.z67 = v; }, () => s.spawn.z67],
    ['$69', (v) => { s.spawn.z69 = v; }, () => s.spawn.z69],
    ['$6A', (v) => { s.spawn.z6A = v; }, () => s.spawn.z6A],
    ['$6B', (v) => { s.spawn.z6B = v; }, () => s.spawn.z6B],
    ['$6C', (v) => { s.spawn.z6C = v; }, () => s.spawn.z6C],
    ['$6D', (v) => { s.spawn.z6D = v; }, () => s.spawn.z6D],
    ['$6E', (v) => { s.spawn.z6E = v; }, () => s.spawn.z6E],
    ['$6F', (v) => { s.spawn.z6F = v; }, () => s.spawn.z6F],
  ];
  for (const [, set] of fields) set(0x5A);
  s.zp.meter = 3; s.zp.autofire = 9; s.cam.hi = 7; s.build.hi = 7;
  introReset(s, res);
  for (const [name, , get] of fields) {
    assert.strictEqual(get(), 0, `${name} is inside $3D-$97 and must be wiped`);
  }
  assert.strictEqual(s.zp.meter, 0, '$42 restored from $22,X (0 here)');
  assert.strictEqual(s.cam.hi, 0, '$3F restored from $24,X');
  assert.strictEqual(s.build.hi, 0, '$55 restored from the SAME byte');
  assert.strictEqual(s.zp.autofire, 0x14, '$9B5E LDA #$14 / STA $35');
});

test('$97EB JSR $9C09 is a DEAD STORE on the respawn path, and this is the proof', () => {
  // src/flow.js says of $9C09, at clearAhead() and again in respawn()'s header,
  // that "$97EB JSR $9C09 inside the respawn and $980B JMP $9C09 on the game-over
  // arm both enter sub_9C09 on their own, and ON THOSE PATHS THIS STORE IS THE
  // ONLY THING THAT CLEARS $57". For the respawn half that is FALSE, and wave
  // 5's QA measured it: $9B3E's wipe is `LDX #$5A / STA $3D,X` = $3D-$97
  // INCLUSIVE, $57 is inside it, and $97EE JMP $9B3E runs four instructions
  // after $97EB. Deleting the call from respawn() is green on the corpus and
  // green on the unit suite -- exactly like the $97E3 STA $5D that the same
  // commit documents honestly as unfalsifiable.
  //
  // This test pins the fact rather than the claim: introReset() ALONE, with no
  // clearAhead() anywhere in front of it, leaves $57 at 0. The fall-through out
  // of $9BF0 into $9C09 is a different question and IS live -- tests/flow.test.js
  // holds it, and it is the reason the store is ported at all.
  // RED WHEN: `state.build.ahead = 0` is dropped from clearZeroPage().
  const s = bootState(res.manifest);
  s.build.ahead = 1;                     // $57, the streamer's "far enough ahead"
  introReset(s, res);                    // $9B3E only -- no $9C09 on this path
  assert.strictEqual(s.build.ahead, 0,
    '$9B3E\'s own wipe covers $57, so the respawn\'s $97EB cannot be what clears it');
});
