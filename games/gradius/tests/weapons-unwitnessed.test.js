// WAVE 6'S UNWITNESSED ARMS -- the twenty-two deliberate breaks that PASSED.
//
// tests/weapons.test.js covers the wave's SHAPES: the three tables, the frozen
// timer, the two X kill thresholds, the BCD adder, the laser surviving its hit.
// This file covers what wave 6's review and QA measured that NOTHING in the tree
// could see. Every entry below was reproduced here as a source mutation on a
// scratch copy, seen RED, and the source restored byte-identical (sha256 before
// == after). The mutation is named at each assertion.
//
// WHY THE ORACLE CORPUS CANNOT SEE ANY OF THIS, measured rather than assumed:
//
//   * THE COLLISION MAP IS ZERO EVERYWHERE THE CORPUS REACHES. Stage 1 pages 0-3
//     hold no solid tiles, so `probeCollision()` returned 0 on every call of all
//     28 scenarios. That kills the missile's whole wall/crawl discrimination
//     ($A18B-$A19C), the shot's terrain absorb ($C2E8) and both of $C3AF's
//     carry-dependent offsets.
//   * THE ENEMY BOX CLASS `$0460,Y` IS 0 ON ALL 9062 COMPARED FRAMES. MEASURED
//     by decoding every artifact's rows: w_0460..w_0469 has exactly one distinct
//     value across the whole corpus. The only writer of `$0460 + j` in the ROM
//     is `$A52E STA $0460,Y` with A = 0 (`$0460 + 12 + j`, the damage counter,
//     is a different index of the same array), so the shot sweep's dy limit
//     `$BFDE,X` is the constant $10 in every recorded frame and three of the
//     table's four rows have never been read.
//   * NOTHING IN THE CORPUS SCORES ENOUGH TO REACH `$84D3` OR `$849A`. The
//     biggest score any scenario reaches is $0110; the extra life needs $01xxxx
//     and the overflow arm needs 999999.
//   * `state.sfx` IS RECORDED AND COMPARED BY NOTHING until wave 8 hooks $EC1E,
//     so every sound id, COUNT and ORDER this wave produces rests here alone.
//
// A note on what is NOT here, because it is not a hole:
//
//   $A1E6's ASCENDING DIRECTION IS UNOBSERVABLE, not untested. QA reported
//   reversing `shotLoop` (0..5 -> 5..0) as a break that passed and called it a
//   plain hole. It is not: every iteration of $A1E6 touches only $0123,X /
//   $0163,X / $0323,X / $0363,X of its own X, there is no shared byte, no early
//   exit and no sound request, and `$A1E6 STX $98` is outside the loop and never
//   read. So the two directions compute the identical final state, on the
//   cartridge as well as in the port, and a test that claimed to catch it would
//   be decoration. `fireWeapons` and `missileLoop` DO have observable order --
//   the sound requests and the crawl throw respectively -- and both are pinned
//   below.

import test from 'node:test';
import assert from 'node:assert';

import { createState, ENEMY_BASE } from '../src/state.js';
import { fireWeapons, missileLoop, SLOT_A, SLOT_B, SLOT_M } from '../src/weapons.js';
import { shotSweep, collision } from '../src/collision.js';
import { killEnemy } from '../src/enemies.js';
import { scoreKill } from '../src/score.js';
import { nmi } from '../src/nmi.js';
import { bootState, introEntryState } from '../src/main.js';
import { headlessResources, knownFail } from './helpers.js';

const res = headlessResources(0);
const A = 0x80;

/** A live stage-1 play state: the ship at the measured start, nothing else. */
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

/** One missile in object slot 3 + x ($A16F visits x = 8, 7, 6). */
function withMissile(s, x, px, py) {
  const i = SLOT_A + x;
  s.obj.anim[i] = 0x0A;                // $0123,X -- the metasprite
  s.obj.animFrame[i] = 3;              // $0163,X -- the SUBTYPE, the liveness
  s.obj.x[i] = px; s.obj.y[i] = py;
  s.obj.xf[i] = 0;
  return i;
}

// ============================================================================
// ORDER. Two loops whose direction IS observable, and the cartridge's own bytes.
//   $A108  A6 45     LDX $45   ... $A16C  CA 10 9B   DEX / BPL   -> $45 down to 0
//   $A16F  A2 08     LDX #$08  ... $A1DE  C6 A8 A5 A8 C9 06 B0 8D -> 8 down to 6
// (read out of `Gradius (USA).nes` at file offset 16 + addr - $8000, this
// commit, not through the exporter.)
// ============================================================================

test('$A108: Option 2 fires FIRST and the player LAST -- the ORDER, not just the set', () => {
  // THE HOLE THIS CLOSES. tests/weapons.test.js's `$A108 LDX $45` test says
  // "RED WHEN: the loop runs 0..$45 instead of $45..0" and it is not: its probe
  // reads `s.spawnOrderProbe`, which exists nowhere in games/gradius/src, so the
  // array it fills is [undefined, undefined, undefined] and is never asserted
  // on. MEASURED by QA: reversing the loop is green on all 222 unit tests and on
  // eight oracle scenarios. Reversing it is RED HERE.
  //
  // The observable is the SOUND REQUEST LIST, which the port already records:
  // `$A266 LDA $99 / JMP $EC1E` is the tail of $A235, so one entry is pushed
  // after each spawn's four stores and the partial fill of $0123-$0125 at that
  // moment IS the order. This is the state the routine itself produces, not
  // state the harness invented (docs/knowledge/02 trap 4 shape 2).
  //
  // RED WHEN: `for (let x = state.zp.options; x >= 0; x--)` becomes
  //           `for (let x = 0; x <= state.zp.options; x++)`.
  const s = ship({ options: 2, held: A, edge: A });
  s.obj.x[1] = 0x77; s.obj.y[1] = 90;         // Option 1, trailing
  s.obj.x[2] = 0x6C; s.obj.y[2] = 84;         // Option 2, trailing further
  const snaps = [];
  const realPush = s.sfx.push.bind(s.sfx);
  s.sfx.push = (id) => {
    snaps.push([s.obj.anim[3], s.obj.anim[4], s.obj.anim[5]]);
    return realPush(id);
  };
  fireWeapons(s, res);
  assert.deepStrictEqual(snaps, [[0, 0, 6], [0, 6, 6], [6, 6, 6]],
    'the slots must fill 5, 4, 3 -- object $45 first, the player last');
  assert.strictEqual(s.sfx.length, 3, 'three spawns, three $EC1E requests');
});

test('$A16F: the missile loop runs slot 11 DOWN to 9, and the throw names which', () => {
  // The missile loop has no sound request, so its order is observable through
  // exactly one thing the port already does: the $A19E crawl throw names the
  // slot it fired for. Two missiles both standing on the floor means two
  // candidates, and WHICH ONE THROWS is the loop direction.
  //
  // RED WHEN: `for (let x = 8; x >= 6; x--)` becomes `for (let x = 6; x <= 8; x++)`
  //           (the message then names missile 9).
  const s = ship();
  withMissile(s, 8, 80, 96);                  // object slot 11
  withMissile(s, 6, 112, 96);                 // object slot  9
  // Slot 11 probes (80, 100) -> cell $055B field 3, and (88, 92) -> $0563,
  // which is empty: the floor, so $A19E. Slot 9 probes (112, 100) -> $057B and
  // (120, 92) -> $0583. Four different cells, two identical situations.
  s.coll[0x5B] = 0x40;
  s.coll[0x7B] = 0x40;
  assert.throws(() => missileLoop(s, res), /missile 11 would start CRAWLING/,
    '$A16F LDX #$08: the HIGHEST slot is evaluated first');
});

// ============================================================================
// THE MISSILE'S WALL-VERSUS-CRAWL DISCRIMINATION. $A18B-$A19C, from the ROM:
//   A18B  A5 A5 38 E9 08 85 A5     $A5 (the probe Y) -= 8
//   A192  A5 A4 18 69 08 85 A4     $A4 (the probe X) += 8
//   A199  20 D3 C3  JSR $C3D3 / D0 38 BNE $A1D6      non-zero -> a WALL, free it
// Zero -> the crawl. NOTHING in the tree made the second probe non-zero, so the
// freeMissile() the port wrote had never executed and neither of its two
// constants had ever been read.
// ============================================================================

test('$A199: a missile against a WALL is freed; the offsets are +8 in X and -8 in Y', () => {
  // The four one-axis mutations are separated deliberately, and the cells are
  // chosen so each lands in a DIFFERENT 2-BIT FIELD, not merely a different
  // byte -- an offset test that only moves between bytes misses the shift.
  //
  //   probe 1  (80, 100)  -> byte $055B, field 3 (shift 6)
  //   probe 2  (88,  92)  -> byte $0563, field 2 (shift 4)   the ROM's +8/-8
  //   (72, 108)           -> byte $0554, field 0    the swapped offsets
  //   (88, 100)           -> byte $0563, field 3    -8 dropped from Y
  //   (80,  92)           -> byte $055B, field 2    +8 dropped from X
  //
  // RED WHEN: `probeCollision(state, u8(px + 8), u8(py - 8))` becomes any of
  //           (px - 8, py + 8) / (px + 8, py) / (px, py - 8) -- each then reads
  //           a zero field and takes the $A19E CRAWL throw instead;
  //       OR: `freeMissile(state, i)` is deleted from the wall arm.
  const s = ship();
  const i = withMissile(s, 6, 80, 96);
  s.coll[0x5B] = 0x40;                        // probe 1: field 3 = 1
  s.coll[0x63] = 0x10;                        // probe 2: field 2 = 1  -> a WALL
  assert.doesNotThrow(() => missileLoop(s, res),
    'the second probe is non-zero, so this is $A1D6 and not the $A19E crawl');
  assert.strictEqual(s.obj.anim[i], 0, '$A1D8 STA $0123,X');
  assert.strictEqual(s.obj.animFrame[i], 0, '$A1DB STA $0163,X');
  assert.strictEqual(s.obj.y[i], 96, 'freed BEFORE $A1AF, so it never took its step');

  // ...and the same map with the second probe's field empty is the crawl. This
  // row is what proves the row above is not passing for the wrong reason.
  const crawl = ship();
  withMissile(crawl, 6, 80, 96);
  crawl.coll[0x5B] = 0x40;
  assert.throws(() => missileLoop(crawl, res), /\$A19E/,
    'field 2 of $0563 empty -> the floor, not a wall');
});

test('$C3BB: the missile probes the terrain at Y + 4, pinned from BOTH sides', () => {
  // `E0 06 90 02 69 03` -- CPX #$06 / BCC +2 / ADC #$03. The only route to the
  // ADC is X >= 6, which is exactly when CPX SETS the carry, so it adds four.
  // Wave 5's note in src/collision.js said +3 and wave 6 corrected it; the
  // corpus cannot tell $03 from $04 from $05 because its map is all zeroes, so
  // this is the only check on the correction.
  //
  // Each row is a byte whose ONE non-zero 2-bit field sits where exactly one of
  // +3 / +4 / +5 lands:
  //   y0 = 96: +4 -> row 15 (shift 6), +3 -> row 14 (shift 4). $40 answers only
  //            the first, $10 only the second.
  //   y0 = 95: +4 -> row 14 (shift 4), +5 -> row 15 (shift 6). $10 answers only
  //            the first, $40 only the second.
  //
  // RED WHEN: `u8(o.y[i] + 4)` becomes + 3 (rows 1 and 3 flip) or + 5 (row 2).
  const probes = (y0, cell) => {
    const s = ship();
    withMissile(s, 6, 80, y0);
    s.coll[0x5B] = cell;
    try { missileLoop(s, res); } catch (e) {
      if (/\$A19E/.test(e.message)) return true;   // probe 1 was non-zero
      throw e;
    }
    return false;
  };
  assert.strictEqual(probes(96, 0x40), true, 'y + 4 reads field 3 of $055B');
  assert.strictEqual(probes(95, 0x10), true, 'y + 4 reads field 2 of $055B');
  assert.strictEqual(probes(96, 0x10), false, 'and NOT field 2 -- that is + 3');
  assert.strictEqual(probes(95, 0x40), false, 'and NOT field 3 -- that is + 5');
});

// ============================================================================
// THE MISSILE LOOP'S PER-FRAME STORES. $A177, $A1AC and $A1D0.
// ============================================================================

test('$A177: liveness is the SUBTYPE $0163,X, not the metasprite $0123,X', () => {
  // `BD 63 01 F0 62` -- LDA $0163,X / BEQ $A1DE. The two bytes are set and
  // cleared together everywhere the port can currently reach, so reading the
  // wrong one is invisible; it stops being invisible the moment anything sets a
  // metasprite without a subtype, which is exactly what $A1AA/$A1AC does every
  // frame and what the CRAWL arm ($A19E LDA #$08) would do.
  // RED WHEN: `if (o.animFrame[i] === 0) continue;` reads o.anim[i] instead.
  const s = ship();
  const i = withMissile(s, 6, 80, 0x60);
  s.obj.anim[i] = 0;                          // metasprite cleared, subtype alive
  missileLoop(s, res);
  assert.strictEqual(s.obj.y[i], 0x62, 'it flew: $A177 read the SUBTYPE');
  assert.strictEqual(s.obj.anim[i], 0x0A, '$A1AC re-stored the metasprite');
});

test('$A1AC: the metasprite is re-stored EVERY frame, over whatever was there', () => {
  // `A9 0A 9D 23 01` sits after the probe, inside the loop -- it is not a spawn
  // store. It is what puts a crawling missile ($08) back to $0A the frame it
  // leaves the floor, and it runs on every ordinary frame too.
  // RED WHEN: `o.anim[i] = 0x0A;` is deleted (nothing else writes it once the
  // slot is live, so $0123 keeps a stale value for the missile's whole flight).
  const s = ship();
  const i = withMissile(s, 6, 80, 0x60);
  s.obj.anim[i] = 0x08;                       // as if the crawl had set it
  missileLoop(s, res);
  assert.strictEqual(s.obj.anim[i], 0x0A, '$A1AA LDA #$0A / $A1AC STA $0123,X');
});

test('$A1D0 BCS: the missile dies on the CARRY out of 255, before the $F8 test', () => {
  // `9D 63 03 / B0 04 BCS $A1D6 / C9 F8 CMP #$F8 / 90 08 BCC $A1DE` -- two
  // separate kills, and the first one is the only reason $0363 cannot wrap. The
  // half-pixel carry is what makes it reachable at all: $A1A6[0] is 0, so the
  // integer step is 0 or 1 and only the frame the fraction carries can push
  // $FF over the top.
  // Row 1 is the only one that separates the two: $0363 has ALREADY been stored
  // wrapped ($A1CD) by the time $A1D0 reads the carry, so a port without the
  // carry test sees $00, sails past `CMP #$F8`, and flies the missile on from
  // the LEFT edge of the screen.
  // RED WHEN: the `nx > 0xFF ||` half of the test is dropped.
  const fly = (x0, xf) => {
    const s = ship();
    const i = withMissile(s, 6, x0, 0x60);
    s.obj.xf[i] = xf;
    missileLoop(s, res);
    return { alive: s.obj.anim[i] !== 0, x: s.obj.x[i] };
  };
  assert.deepStrictEqual(fly(0xFF, 0x80), { alive: false, x: 0x00 },
    '$FF + the half-pixel carry stored $00 -- and $A1D0 BCS killed it anyway');
  assert.deepStrictEqual(fly(0xF7, 0x80), { alive: false, x: 0xF8 },
    '$F8 is the first value $A1D2 CMP #$F8 rejects');
  assert.deepStrictEqual(fly(0xF6, 0x80), { alive: true, x: 0xF7 },
    '...and $F7 is the last it accepts');
  assert.deepStrictEqual(fly(0xF6, 0x00), { alive: true, x: 0xF6 },
    'with no carry out of $0383 the integer does not move at all');
});

// ============================================================================
// THE ENEMY BOX CLASS. `$0460,Y` is 0 on all 9062 compared frames, so
// `$C028 CMP $BFDE,X` has only ever read entry 0 and the index has never been
// exercised at all. $BFDA = 10 20 30 10 and $BFDE = 10 20 30 02 (read out of the
// .nes this commit): the two tables AGREE except at entry 3.
// ============================================================================

test('$C028: the dy limit is $BFDE[class], all four rows, at their boundaries', () => {
  // dy = ($0323,X + $BFD6[sub]) - $032C,Y - 1, and the -1 is $C023's borrow.
  // With the shot at y = 100 and subtype 0 that is dy = 107 - enemyY, so each
  // row below is one pixel either side of the table entry.
  //
  // RED WHEN: `box.read(0xBFDE + cls)` reads $BFDA (the enemy WIDTH table) --
  //           only the class-3 rows separate them, which is why class 3 is here;
  //       OR: the class is dropped and the limit is the constant $10 -- classes
  //           1 and 2 catch that;
  //       OR: the class is indexed by the OBJECT slot (`o.s0460[e]`, i.e.
  //           $046C + j, the damage counter) instead of by the enemy index j --
  //           every class then reads 0 and rows 1-3 all miss.
  const hit = (cls, enemyY) => {
    const s = ship();
    const j = 4, e = j + ENEMY_BASE;
    s.obj.type[e] = 0x85;                     // $030C,Y bit 7 -- initialised
    s.obj.x[e] = 108; s.obj.y[e] = enemyY;
    s.obj.s0460[j] = cls;                     // $0460,Y -- the box CLASS
    s.obj.anim[SLOT_A] = 6; s.obj.animFrame[SLOT_A] = 0;
    s.obj.x[SLOT_A] = 100; s.obj.y[SLOT_A] = 100;   // a0 = 108, a1 = 108
    shotSweep(s, res);
    return s.obj.type[e] === 2;               // $BED3 -- it exploded
  };
  for (const [cls, h] of [[0, 0x10], [1, 0x20], [2, 0x30], [3, 0x02]]) {
    assert.strictEqual(hit(cls, 107 - (h - 1)), true,
      `class ${cls}: dy = ${h - 1} is inside a ${h}-tall box`);
    assert.strictEqual(hit(cls, 107 - h), false,
      `class ${cls}: dy = ${h} is outside it`);
  }
});

// ============================================================================
// THE KILL CHAIN'S ORDER AND ITS LAST THREE STORES.
// ============================================================================

test('$C0A6 then $C0A9: the SCORE is added BEFORE the kill, and the sfx list proves it', () => {
  // `20 63 84  JSR $8463 / A4 A9 20 93 BE  LDY $A9 / JSR $BE93` -- two calls,
  // and swapping them changes no RAM byte in any state the corpus can reach,
  // because $8463 reads no object byte and $BE93 writes no score byte. The one
  // place the order IS visible is the per-frame sound request LIST, and it is
  // only visible when BOTH calls make a request: the score has to cross the
  // extra-life threshold on the same frame as the kill.
  //
  // This is the shape this project has shipped five times (an order mutation a
  // 691-test suite passed clean), on a resource that is genuinely ordered.
  //
  // RED WHEN: the two lines in hitEnemy() are swapped -> [6, $36].
  const s = ship();
  const j = 4, e = j + ENEMY_BASE;
  s.obj.type[e] = 0x85;                       // $BE6E[5] = $06, the fan's death
  s.obj.x[e] = 108; s.obj.y[e] = 100;
  s.obj.anim[SLOT_A] = 6; s.obj.animFrame[SLOT_A] = 0;
  s.obj.x[SLOT_A] = 100; s.obj.y[SLOT_A] = 100;
  s.score[4] = 0x90; s.score[5] = 0x99; s.score[6] = 0x01;   // one kill short
  s.extraLife[0] = 0x02; s.lives[0] = 3;
  shotSweep(s, res);
  assert.strictEqual(s.obj.type[e], 2, 'the enemy died');
  assert.strictEqual(s.lives[0], 4, '$84F0 INC $20,X -- the threshold was crossed');
  assert.deepStrictEqual(s.sfx, [0x36, 0x06],
    '$84F2\'s extra life comes first, then $BEA2\'s death sound');
});

test('$C0C3: freeing a shot clears $0103,X too -- all THREE bytes, not two', () => {
  // `9D 23 01 / 9D 63 01 / 9D 03 01` -- $C0BD, $C0C0 and $C0C3. $0103-$010B is 0
  // on every frame of every scenario (nothing in the port ever sets a shot
  // slot's status), so the third store has never had anything to clear and
  // deleting it is green on the whole corpus.
  // RED WHEN: `o.status[3 + x] = 0;` is deleted from freeShotSlot().
  const s = ship();
  const j = 4, e = j + ENEMY_BASE;
  s.obj.type[e] = 0x85; s.obj.x[e] = 108; s.obj.y[e] = 100;
  s.obj.anim[SLOT_A] = 6; s.obj.animFrame[SLOT_A] = 0;
  s.obj.x[SLOT_A] = 100; s.obj.y[SLOT_A] = 100;
  s.obj.status[SLOT_A] = 5;                   // $0103 -- whatever was there
  shotSweep(s, res);
  assert.deepStrictEqual(
    [s.obj.anim[SLOT_A], s.obj.animFrame[SLOT_A], s.obj.status[SLOT_A]], [0, 0, 0],
    '$C0BD/$C0C0/$C0C3');
});

test('$C2E8 JSR $C0BD: the terrain absorb clears the same three bytes', () => {
  // A SEPARATE SITE from the one above -- the ROM enters $C0BD as a subroutine
  // here, so the $A9 store at $C0B7 is skipped and only the three stores run.
  // The port inlines them, and this is the only check on the third.
  // RED WHEN: `o.status[3 + x] = 0;` is deleted from shotsVsTerrain().
  const s = ship();
  s.obj.y[0] = 0x40;                          // the ship OFF the solid cell
  s.obj.anim[SLOT_A] = 6; s.obj.animFrame[SLOT_A] = 0;
  s.obj.x[SLOT_A] = 0x55; s.obj.y[SLOT_A] = 96;
  s.obj.status[SLOT_A] = 7;
  s.coll[0x5B] = 0x10;                        // (85, 96) -> $055B field 2 = 1
  collision(s, res);
  assert.deepStrictEqual(
    [s.obj.anim[SLOT_A], s.obj.animFrame[SLOT_A], s.obj.status[SLOT_A]], [0, 0, 0],
    'a shot absorbed by solid terrain leaves an entirely empty slot');
  assert.strictEqual(s.obj.status[0], 1, '...and the ship, one row up, is alive');
});

test('$BEAA: an enemy that is ALREADY the carrier does not touch $0048,X', () => {
  // `C9 01 F0 07` -- CMP #$01 / BEQ $BEB5, jumping OVER the `DEC $48,X`. So the
  // squadron counter is decremented once per member killed, and killing the
  // member that is already flagged as the capsule carrier does not decrement it
  // a second time. $03AC,Y is 1 for at most one enemy at a time, which is why
  // the corpus can reach the arm at all but cannot separate it from the
  // "not a member" arm: both leave $03AC,Y at its old value.
  // RED WHEN: the `carrier === 1` branch is removed (the DEC then runs and
  //           $0048,X walks down twice for one squadron).
  const s = ship();
  const e = ENEMY_BASE + 4;
  s.obj.type[e] = 0x85;
  s.obj.carrier[e] = 1;                       // $03AC,Y -- already the carrier
  s.squad[1] = 7;                             // $0049 -- must not move
  killEnemy(s, res, 4);
  assert.strictEqual(s.obj.carrier[e], 1, '$BEB5 LDA #$01 / $BEB7 STA $03AC,Y');
  assert.deepStrictEqual([...s.squad], [0, 7, 0, 0], '$BEB1 DEC $48,X was SKIPPED');
});

// ============================================================================
// THE SCORE'S UNREACHED ARM.
// ============================================================================

test('$849A: the BCD overflow fills the TOP score with $99 and leaves the player wrapped', () => {
  // `90 39 BCC $84D3 / A2 02 LDX #$02 / A9 99 LDA #$99 / 9D E0 07 STA $07E0,X`
  // -- the arm that runs when the third BCD byte carries writes $07E0, which is
  // TOP, not $07E4, which is the player's. It looks like a cartridge bug and it
  // is what the cartridge does. It also RETURNS, so neither the extra life nor
  // the TOP copy runs on that frame.
  //
  // Unreachable in the corpus by three orders of magnitude (999999 x 10 points
  // against a biggest recorded score of $0110), and unreachable in every other
  // test in the tree.
  // RED WHEN: the arm is deleted and execution falls through to $84D3/$84F7 --
  //           TOP then takes the WRAPPED player score [$09, 0, 0] instead.
  const s = ship();
  s.score[4] = 0x99; s.score[5] = 0x99; s.score[6] = 0x99;
  s.extraLife[0] = 0x02; s.lives[0] = 3;
  scoreKill(s);
  assert.deepStrictEqual([...s.score.slice(0, 3)], [0x99, 0x99, 0x99],
    '$849E STA $07E0,X -- three times, X = 2, 1, 0');
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x09, 0x00, 0x00],
    'the player\'s own score is left wrapped');
  assert.strictEqual(s.lives[0], 3, '$84A4 RTS: $84D3 never runs on this frame');
  assert.deepStrictEqual(s.sfx, [], '...and neither does $84F2');
});

// ============================================================================
// SOUND. `state.sfx` is compared by nothing until wave 8, so the list's
// LIFETIME is only checked here.
// ============================================================================

test('$8073/$80B7: the sfx list is cleared per frame, and NOT on a dropped one', () => {
  // src/nmi.js clears `state.sfx` below the lag/lock gate, which is where the
  // ROM's $80B7 "pull everything and RTI" leaves the frame's work undone. Both
  // halves of that placement are load-bearing and neither is compared: a list
  // that is never cleared grows for the length of the run, and one cleared
  // ABOVE the gate loses a dropped frame's requests that the driver has not
  // consumed yet.
  // RED WHEN: `state.sfx.length = 0;` is deleted (row 1) or moved above the
  //           `if (lag || state.lock !== 0)` return (row 2).
  const s = bootState(res.manifest);
  s.sfx.push(0xEE);
  nmi(s, 0, res);
  assert.ok(!s.sfx.includes(0xEE),
    'last frame\'s requests were carried into this one');

  const dropped = bootState(res.manifest);
  dropped.sfx.push(0xEE);
  assert.strictEqual(nmi(dropped, 0, res, true), false, 'a LAG frame does no work');
  assert.deepStrictEqual([...dropped.sfx], [0xEE],
    '$80B7 returns before $8085 -- a dropped frame clears nothing');
});

// ============================================================================
// TWO THINGS THE PORT'S OWN COMMENTS GET WRONG. Pinned so they cannot rot
// further; both are findings against wave 6, not against the cartridge.
// ============================================================================

test('$A108 has NO range guard -- fireWeapons() assertion is a TAUTOLOGY', () => {
  // src/weapons.js says of its closing assertion: "$45 is capped at 2 ... The
  // port asserts the range rather than reading past slot 5 / 8 / 11 in silence."
  // IT DOES NOT. `iters` is incremented once per iteration of a loop that runs
  // `options + 1` times, so `iters !== state.zp.options + 1` is false by
  // construction for every value of $45. MEASURED: $45 = 3 does not throw, and
  // the x = 3 iteration writes object slot 6 -- which is SLOT B of owner 0, the
  // exact aliasing the comment claims to prevent.
  //
  // The port's BEHAVIOUR is right: `$A108 LDX $45` has no guard on the cartridge
  // either, and $45 cannot exceed 2 because `$89D3 CMP #$02 / BCS` clamps it. So
  // this test pins the ROM, and the comment is the defect. The same tautology is
  // in missileLoop (`iters !== 3`), shotLoop (`iters !== 6`) and, from wave 5,
  // shotSweep (`iters !== 9`); only shotVsEnemies' is real, because $A9 is
  // written by $C0BB.
  //
  // RED WHEN: a real guard is added, e.g. `if (state.zp.options > 2) throw`.
  const s = ship({ options: 3, held: A, edge: A });
  assert.doesNotThrow(() => fireWeapons(s, res),
    '$A108 reads $45 and loops; there is no bound on either side');
  assert.strictEqual(s.obj.anim[SLOT_B], 6,
    'x = 3 wrote $0126 -- object slot 6, which is slot B of owner 0');
  assert.deepStrictEqual([...s.obj.anim.slice(7, 12)], [0, 0, 0, 0, 0],
    'and nothing past it, because $A15C\'s missile arm needs $41');
});

knownFail('$8302: the cartridge seeds $2A/$2B (the extra-life score) to $01, not $02',
  'MEASURED TWICE, independently, this commit. (1) Straight out of `Gradius '
  + '(USA).nes` at file offset 16 + addr - $8000, NOT through export_assets.py: '
  + '$82FA A9 03 85 20 85 21 A9 01 85 2A 85 2B 60 -- the same initialiser that '
  + 'sets lives to 3, which the port DOES get right; and the per-player reset '
  + '$9725 A9 01 95 2A. (2) Every one of the 28 recorded oracle artifacts: '
  + 'base64-decoding seedRam from tools/oracle/out/scen/*.json gives $2A = $2B = '
  + '$01 in all 28 (indexing cross-checked on the same blobs by $20 = 3, '
  + '$21 = 3, $35 = $14, and by intro-respawn\'s $20 = 2). '
  + 'THE ORACLE STRUCTURALLY CANNOT SEE THIS: porttrace.mjs seedFromRam does '
  + '`state.extraLife[0] = r(0x2A)`, so the compared path is handed the '
  + 'cartridge\'s own $01, while bootState()/introEntryState() -- the BROWSER '
  + 'boot path, on no compared path at all -- hardcode 0x02. This is exactly '
  + 'what porttrace.mjs\'s own header warns about ("the risk is that seeding '
  + 'HIDES an initialisation bug"). Effect on the shipped game: the first extra '
  + 'life is granted at 200000 points instead of 100000. '
  + 'FIX: src/main.js bootState() and introEntryState() -> 0x01, and the three '
  + 'comments asserting "MEASURED $02 in the seed" in src/main.js, src/state.js '
  + 'and src/score.js. Found by wave 6\'s reviewer; re-measured here. A test '
  + 'writer may not edit src/, so it is pinned rather than fixed.',
  () => {
    const boot = bootState(res.manifest);
    assert.strictEqual(boot.extraLife[0], 0x01, 'bootState(): $2A');
    assert.strictEqual(boot.extraLife[1], 0x01, 'bootState(): $2B');
    const intro = introEntryState(res.manifest);
    assert.strictEqual(intro.extraLife[0], 0x01, 'introEntryState(): $2A');
    assert.strictEqual(intro.extraLife[1], 0x01, 'introEntryState(): $2B');
  });

// ============================================================================
// THE LOUD ARMS WAVE 6 DID NOT PORT, that tests/weapons.test.js does not reach.
// ============================================================================

test('$A0FA LDX $18: two-player firing is a loud throw, not a silent aliasing', () => {
  // `A6 18 B5 05 ... B5 07` -- the whole firing block reads the input through
  // $18, and $18 is 0 in all 28 recorded seeds. A port that ignored it would
  // read player 1's buttons for player 2 and look completely plausible.
  // RED WHEN: the `state.zp.player !== 0` throw is removed.
  const s = ship({ held: A, edge: A });
  s.zp.player = 1;                            // $18
  assert.throws(() => fireWeapons(s, res), /\$A0FA/, 'two-player is unmeasured');
});
