// WAVE 32c -- THE ARM INTERACTIONS: `$BEF3`/`$BF0B` (a shot destroys an arm),
// `$CBD1` (the arm's tip fires), `$A17C` (the missile's stage-5 probe bypass)
// and `$BC44`'s skip arm -- plus the evidence the `$A2F0` scope guard moved on.
//
// WHAT THIS SUITE CANNOT DO, first, so it is not mistaken for coverage: there
// is STILL no cartridge comparison for stage 5. No corpus scenario reaches it
// (W31 measured the endchain trajectory game-overing at f14333 inside stage 2;
// W32a re-confirmed over 47 scenarios). Every number below is the PORT against
// THE LISTING, which is what docs/knowledge/10 says the guarantee has to rest
// on when the behaviour space cannot be sampled. ROM constants are read out of
// assets/prg.bin so a check cannot agree with itself through the port's own
// copies -- docs/knowledge/03's named failure mode, which W32a's spawn-frame
// check and W32b's b10 both walked into.
//
// Mutation table: docs/worklog/gradius/32c-impl-interactions.md. A check with
// no mutant that reddens it is named there rather than counted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS, headlessResources } from './helpers.js';
import { createState, u8, ARM_POOL, ENEMY_BASE } from '../src/state.js';
import { spawnEngine, armDriver, enemyBullets } from '../src/enemies.js';
import { shotSweep, collision } from '../src/collision.js';
import { missileLoop } from '../src/weapons.js';
import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';

const res = headlessResources(0);
const prg = new Uint8Array(readFileSync(join(ASSETS, 'prg.bin')));
const rb = (a) => prg[a - 0x8000];

const SHOT = 3;                    // object slot 3 + x, x = 8..0 ($0123,X)
const BULLET = 22;                 // object slot 22 + k ($0136,X)
const GROUPS = [0x00, 0x30, 0x60, 0x90];

/** A state parked in stage 5, no arms, a player at (px, py). */
function stage5(px = 0x60, py = 0x60) {
  const s = createState();
  s.zp19 = 4;
  s.substate = 0x80;
  s.obj.x[0] = px; s.obj.y[0] = py;
  s.obj.status[0] = 1;
  return s;
}

/** Put one live group at `base`, owned by enemy slot `owner`, all six segments
 *  at (segX, segY) unless `only` names one. */
function arm(s, base, owner, segX, segY, only = null) {
  s.coll[ARM_POOL + base] = owner;
  s.obj.type[owner + ENEMY_BASE] = 0x94;
  s.obj.animFrame[owner + ENEMY_BASE] = 1;         // $016C -- the ARM COUNT
  for (let k = 0; k <= 5; k++) {
    const here = only === null || only === k;
    s.coll[ARM_POOL + base + 0x18 + k] = here ? segX : 0xE8;
    s.coll[ARM_POOL + base + 0x20 + k] = here ? segY : 0xE8;
  }
}

/** One live shot in slot `x` (subtype 0), placed so that `$A0`/`$A1` land on
 *  (hitX, hitY). `$BFF0` adds `$BFCE[sub]` to X and `$C002` adds `$BFD6[sub]`
 *  to Y before either is compared, so the FIXTURE has to undo both. */
function shot(s, x, hitX, hitY, sub = 0) {
  const w = res.weaponTables;
  s.obj.anim[SHOT + x] = 0x0A;
  s.obj.animFrame[SHOT + x] = sub;
  s.obj.x[SHOT + x] = u8(hitX - w.read(0xBFCE + sub));
  s.obj.y[SHOT + x] = u8(hitY - w.read(0xBFD6 + sub));
  s.obj.status[SHOT + x] = 1;
}

const liveGroups = (s) => GROUPS.filter((b) => s.coll[ARM_POOL + b] !== 0);

// =============== 1. $BEEA, AND WHAT INDEXES IT =============================

test('$BEEA: NINE rank rows, 2 to 9 hits, and $BF44 indexes them with $17', () => {
  // The table is nine bytes because $BEE9 is $BE93's RTS and $BEF3 is
  // sub_$BEF3's LDX #$90 -- both ends are code, so nine is the ROM's count and
  // not a guess. A FIXTURE check: no mutation of the port can move it, and it
  // is what checks 5 and 6 reason about. Stated, not dressed up as coverage.
  const rows = [...Array(9).keys()].map((r) => rb(0xBEEA + r));
  assert.deepEqual(rows, [2, 2, 3, 4, 5, 6, 7, 8, 9], '$BEEA out of prg.bin');
  assert.equal(rb(0xBEE9), 0x60, '$BEE9 must be the RTS that ends $BE93');
  assert.equal(rb(0xBEF3), 0xA2, '$BEF3 must be LDX #$90');
  assert.equal(rb(0xBEF4), 0x90);
  // ...and the port must READ it at the rank, not at a constant row. Two ranks
  // with different thresholds, both driven through the real sweep.
  for (const rank of [0, 8]) {
    const need = rb(0xBEEA + rank);
    const s = stage5();
    s.zp17 = rank;
    arm(s, 0x90, 5, 0x50, 0x50, 2);          // ONLY segment 2 is in the box
    for (let n = 0; n < need - 1; n++) {
      shot(s, 0, 0x50, 0x51);
      shotSweep(s, res);
    }
    assert.equal(s.coll[ARM_POOL + 0x90], 5,
      `rank ${rank}: ${need - 1} hits must NOT destroy it`);
    assert.equal(s.coll[ARM_POOL + 0x90 + 5], need - 1, '$0605 counted them');
    shot(s, 0, 0x50, 0x51);
    shotSweep(s, res);
    assert.equal(s.coll[ARM_POOL + 0x90], 0, `rank ${rank}: hit ${need} destroys`);
  }
});

// =============== 2. THE WALK, AND $C0B7's WRITE TO $A9 =====================

test('$BEF3: the walk is $A9 itself, and a consumed shot ENDS it', () => {
  // $BF01 LDA $A9 / SEC / SBC #$30 / BPL $BEF7 -- and $C0B7's `STA $A9` with
  // A = 0 (inside freeShotSlot) makes the very next subtract produce $D0. So a
  // shot that hits ANY segment of the $90 group never reaches the $30 group.
  //
  // THE FIXTURE PUTS A SEGMENT-2 HIT IN *BOTH* GROUPS. If the walk carried on,
  // both hit counters would rise; the ROM raises exactly one.
  // RED WHEN: the walk uses ARM_BASES (a plain for..of), or the free stops
  // writing $A9, or the walk runs low-to-high.
  const s = stage5();
  arm(s, 0x90, 5, 0x50, 0x50, 2);
  arm(s, 0x30, 6, 0x50, 0x50, 2);
  shot(s, 0, 0x50, 0x51);
  shotSweep(s, res);
  assert.equal(s.coll[ARM_POOL + 0x90 + 5], 1, '$90 is walked FIRST and was hit');
  assert.equal(s.coll[ARM_POOL + 0x30 + 5], 0,
    '$30 must be UNTOUCHED -- $C0BB STA $A9 ended the walk at $BF08');
  assert.equal(s.obj.anim[SHOT + 0], 0, 'and the shot was consumed');
  // A MISS WALKS ALL FOUR. Same fixture, the shot placed outside every box:
  // both counters stay 0 and the shot survives, which is the other half of the
  // claim (a walk that always stopped after one group would also pass above).
  const m = stage5();
  arm(m, 0x90, 5, 0x50, 0x50, 2);
  arm(m, 0x30, 6, 0x50, 0x50, 2);
  shot(m, 0, 0xA0, 0xA0);
  shotSweep(m, res);
  assert.equal(m.obj.anim[SHOT + 0], 0x0A, 'a miss does not consume the shot');
  assert.deepEqual([m.coll[ARM_POOL + 0x90 + 5], m.coll[ARM_POOL + 0x30 + 5]], [0, 0]);
  // ...and the low group really is reachable: hit ONLY $30 and it must count.
  const lo = stage5();
  lo.coll[ARM_POOL + 0x90] = 0;
  arm(lo, 0x30, 6, 0x50, 0x50, 2);
  shot(lo, 0, 0x50, 0x51);
  shotSweep(lo, res);
  assert.equal(lo.coll[ARM_POOL + 0x30 + 5], 1, 'the $30 group IS walked');
});

// =============== 3. ONLY SEGMENT 2, BUT ALL SIX EAT THE SHOT ===============

test('$BF31: segment 2 is the only vulnerable one -- the other five are armour', () => {
  // $BF31 LDA $AB / CMP #$02 / BEQ $BF3A, else $BF37 JMP $C0B7. The else-arm
  // is reached only AFTER a hit was detected, so the shot dies against every
  // segment and only one of them takes damage. That is what makes the arm a
  // shield with one weak link, and it is the opposite of $C267 (W32b), which
  // has no exemption at all -- the arm is LETHAL along its whole length.
  // RED WHEN: the CMP #$02 becomes another segment, or the else stops freeing.
  for (let seg = 0; seg <= 5; seg++) {
    const s = stage5();
    arm(s, 0x90, 5, 0x50, 0x50, seg);
    shot(s, 0, 0x50, 0x51);
    shotSweep(s, res);
    assert.equal(s.obj.anim[SHOT + 0], 0,
      `segment ${seg} must consume the shot`);
    assert.equal(s.coll[ARM_POOL + 0x90 + 5], seg === 2 ? 1 : 0,
      `only segment 2 may raise $0605 (segment ${seg})`);
  }
  // THE SEGMENTS ARE WALKED 5 DOWN TO 0 and the FIRST hit wins. Put segment 5
  // and segment 2 both in the box: segment 5 is tested first, so the shot dies
  // on it and $0605 stays 0. A 0..5 walk would damage the arm instead.
  const order = stage5();
  order.coll[ARM_POOL + 0x90] = 5;
  order.obj.type[5 + ENEMY_BASE] = 0x94;
  order.obj.animFrame[5 + ENEMY_BASE] = 1;
  for (let k = 0; k <= 5; k++) {
    order.coll[ARM_POOL + 0x90 + 0x18 + k] = (k === 5 || k === 2) ? 0x50 : 0xE8;
    order.coll[ARM_POOL + 0x90 + 0x20 + k] = (k === 5 || k === 2) ? 0x50 : 0xE8;
  }
  shot(order, 0, 0x50, 0x51);
  shotSweep(order, res);
  assert.equal(order.coll[ARM_POOL + 0x90 + 5], 0,
    'segment 5 is tested BEFORE segment 2 and eats the shot');
});

// =============== 4. THE BOX, AND THE MISSING SEC ===========================

test('$BF1A/$BF23: dx uses the SHOT\'s width with a SEC, dy is 10 px with a BORROW', () => {
  // $BF19 SEC / SBC $0618,X / CMP $A3 -- dx against $BFD2[subtype], so a LASER
  // ($30 wide) reaches an arm from much further left than a bullet ($10).
  // $BF21 LDA $A1 / SBC $0620,X has NO SEC: the carry is the one $BF1D's CMP
  // left, and the only way here is the BCS NOT taken, i.e. carry CLEAR. So dy
  // is one MORE than the true difference and the band sits 1 px high.
  // RED WHEN: the -1 is dropped, dx gains one, or dx is compared against a
  // constant instead of $A3.
  const hit = (dx, dy, sub = 0) => {
    const s = stage5();
    arm(s, 0x90, 5, 0x50, 0x50, 2);
    shot(s, 0, u8(0x50 + dx), u8(0x50 + dy), sub);
    shotSweep(s, res);
    return s.coll[ARM_POOL + 0x90 + 5] === 1;
  };
  const width0 = res.weaponTables.read(0xBFD2 + 0);
  const width1 = res.weaponTables.read(0xBFD2 + 1);
  assert.equal(width0, 0x10, 'fixture: $BFD2[0], the ordinary shot');
  assert.equal(width1, 0x30, 'fixture: $BFD2[1], the LASER');
  // dy: `a1 - segY - 1` must be in 0..9, so dy runs +1 .. +10 (not 0 .. +9).
  assert.equal(hit(0, 0), false, 'dy = 0 gives $FF -- OUTSIDE, the borrow');
  assert.equal(hit(0, 1), true, 'dy = +1 is the near edge');
  assert.equal(hit(0, 10), true, 'dy = +10 is the far edge');
  assert.equal(hit(0, 11), false, 'dy = +11 is outside');
  // dx: `a0 - segX` in 0..$A3-1, so dx runs 0 .. width-1 with NO borrow.
  assert.equal(hit(0, 5), true, 'dx = 0 hits -- $BF19 SEC, no borrow here');
  assert.equal(hit(width0 - 1, 5), true, 'dx = width-1 is the far edge');
  assert.equal(hit(width0, 5), false, 'dx = width is outside');
  assert.equal(hit(-1, 5), false, 'a segment to the RIGHT wraps -- one-sided');
  // and the LASER's wider box is the same code with a different $A3
  assert.equal(hit(width0, 5, 1), true, 'the laser reaches where the shot does not');
  assert.equal(hit(width1 - 1, 5, 1), true);
  assert.equal(hit(width1, 5, 1), false);
});

// =============== 5. THE DESTRUCTION ========================================

test('$BF49: score, the owner\'s ARM COUNT, the header, and the explosion in SLOT 0', () => {
  // $BF49 JSR $8453 (+$000100) / $BF52 LDX $0600,Y / $BF55 DEC $016C,X /
  // $BF5A STA $0600,Y / $BF5D LDX #$00 / segment 2's X,Y -> $036C,$032C /
  // $BF6B LDA #$0C / JSR $CB28 (sfx then FALL-THROUGH into $CB2B).
  //
  // SLOT 0 IS NOT A DEFAULT. $A4A6's allocator is the DEX/BNE shape and never
  // allocates enemy slot 0, so the cartridge is reusing the one slot the arm
  // owner can never occupy -- and it clobbers whatever else is there.
  // RED WHEN: the explosion goes into a free slot, the arm count is not DEC'd,
  // the coordinates come from a different segment, or the score is wrong.
  const s = stage5();
  s.zp17 = 0;                                  // $BEEA[0] = 2 hits
  arm(s, 0x90, 5, 0x50, 0x50, 2);
  s.obj.animFrame[5 + ENEMY_BASE] = 2;         // TWO arms on this owner
  s.coll[ARM_POOL + 0x90 + 0x1A] = 0x77;       // segment 2's real X...
  s.coll[ARM_POOL + 0x90 + 0x22] = 0x33;       // ...and Y, for the explosion
  s.coll[ARM_POOL + 0x90 + 0x18 + 2] = 0x50;   // (the hit box uses the same
  s.coll[ARM_POOL + 0x90 + 0x20 + 2] = 0x50;   //  bytes -- +$1A IS +$18+2)
  s.coll[ARM_POOL + 0x90 + 0x1A] = 0x50;
  s.coll[ARM_POOL + 0x90 + 0x22] = 0x50;
  s.obj.type[0 + ENEMY_BASE] = 0x77;           // an OCCUPANT of slot 0
  const before = [...s.score];
  shot(s, 0, 0x50, 0x51); shotSweep(s, res);   // hit 1 of 2
  assert.deepEqual([...s.score], before, 'a non-fatal hit scores NOTHING');
  shot(s, 0, 0x50, 0x51); shotSweep(s, res);   // hit 2 -- destruction
  assert.equal(s.coll[ARM_POOL + 0x90], 0, '$BF5A freed the group');
  assert.equal(s.obj.animFrame[5 + ENEMY_BASE], 1,
    '$BF55 DEC $016C,X -- the OWNER\'s arm count, 2 -> 1');
  assert.equal(s.obj.type[0 + ENEMY_BASE], 2,
    '$CB2B turned ENEMY SLOT 0 into an explosion, over its occupant');
  assert.equal(s.obj.x[0 + ENEMY_BASE], 0x50, '$BF5F LDA $061A,Y -- segment 2 X');
  assert.equal(s.obj.y[0 + ENEMY_BASE], 0x50, '$BF65 LDA $0622,Y -- segment 2 Y');
  assert.equal(s.obj.animFrame[0 + ENEMY_BASE], 2, '$CB4A -- explosion script 2');
  assert.ok(s.sfx.includes(0x0C), '$BF6B LDA #$0C -- the explosion sound');
  // $8453 is +$000100: $9A = 1, $99 = $9B = 0, so the MIDDLE score byte moves.
  assert.equal(s.score[5], 1, '$8453 added 1 to the middle BCD byte');
  assert.equal(s.score[4], before[4], 'and nothing to the low one');
  // the arm count reaching 0 is what $CAB3 reads; one more arm, one more shot
  const two = stage5();
  two.zp17 = 0;
  arm(two, 0x90, 5, 0x50, 0x50, 2);
  arm(two, 0x30, 5, 0x50, 0x50, 2);
  two.obj.animFrame[5 + ENEMY_BASE] = 2;
  for (const n of [0, 1]) {
    for (let h = 0; h < 2; h++) { shot(two, 0, 0x50, 0x51); shotSweep(two, res); }
    assert.equal(two.obj.animFrame[5 + ENEMY_BASE], 1 - n,
      `arm ${n + 1} destroyed -> count ${1 - n}`);
  }
  assert.deepEqual(liveGroups(two), [], 'both groups freed, one shot each pair');
});

// =============== 6. $C037's RE-READ ========================================

test('$C037: a shot the ENEMY sweep already consumed does not sweep the arms', () => {
  // $C03D LDX $A8 / $C03F LDA $0123,X / F0 BEQ $C047 -- the SHOT's own anim
  // byte, re-read after the ten-enemy loop. Easy to lose: $C011's loop tested
  // the ENEMY's byte. Fixture: an ordinary enemy on top of segment 2, so
  // $C055 frees the shot first; the arm must be untouched.
  // RED WHEN: the re-read is dropped, or it reads the wrong array.
  const s = stage5();
  arm(s, 0x90, 5, 0x50, 0x50, 2);
  s.obj.type[7 + ENEMY_BASE] = 0x80 | 0x05;    // INITIALISED, ordinary
  s.obj.x[7 + ENEMY_BASE] = 0x50;
  s.obj.y[7 + ENEMY_BASE] = 0x50;
  s.obj.s0460[7] = 0;
  shot(s, 0, 0x50, 0x51);
  shotSweep(s, res);
  assert.equal(s.obj.anim[SHOT + 0], 0, 'the enemy consumed the shot');
  assert.equal(s.coll[ARM_POOL + 0x90 + 5], 0,
    '$C03F BEQ $C047 -- a dead shot must not reach $BEF3');
  // and with no enemy in the way the same shot DOES reach it
  const t = stage5();
  arm(t, 0x90, 5, 0x50, 0x50, 2);
  shot(t, 0, 0x50, 0x51);
  shotSweep(t, res);
  assert.equal(t.coll[ARM_POOL + 0x90 + 5], 1);
});

// =============== 7. $CBD1, THE ARM'S SHOT ==================================

test('$CBD1: the tip fires metasprite $86 at (tip - 8, tip - 8), TYPE 0', () => {
  // $CBD1 LDX #$09 / LDA $0136,X / BEQ -- the HIGHEST free bullet slot, the
  // same downward scan $BC59 has. $CBF2 LDA #$86, then $0316/$0116/$0176 all
  // zero, then $061D/$0625 (SEGMENT 5, THE TIP) less 8 in both axes.
  // RED WHEN: the muzzle becomes another segment, the -8 is dropped, the scan
  // goes upward, or the metasprite changes.
  const period = rb(0xCBCA + 0);
  assert.equal(period, 0x28, 'fixture: $CBCA[0] = 40 frames');
  const s = stage5();
  arm(s, 0x90, 5, 0x40, 0x40);
  // +$03 = 0, so $CC3B's DEC leaves $FF -- ODD, and $CC45's RTS skips the
  // kinematics, leaving the tip bytes this fixture wrote. (W32b's own $CB91
  // check used 1 and its comment says "ODD"; 1 DECs to 0, which is EVEN and
  // RUNS -- harmless there because $CBD1 threw first, wrong now.)
  s.coll[ARM_POOL + 0x90 + 0x03] = 0;
  s.coll[ARM_POOL + 0x90 + 0x1D] = 0x80;       // the TIP's X
  s.coll[ARM_POOL + 0x90 + 0x25] = 0x60;       // the TIP's Y
  s.coll[ARM_POOL + 0x90 + 0x04] = u8(period - 1);
  armDriver(s, res.enemyTables);
  assert.equal(s.obj.anim[BULLET + 9], 0x86, 'slot 9 first -- $CBD1 LDX #$09');
  assert.equal(s.obj.x[BULLET + 9], 0x78, '$CC08 SBC #$08 on the tip X');
  assert.equal(s.obj.y[BULLET + 9], 0x58, '$CC11 SBC #$08 on the tip Y');
  assert.equal(s.obj.type[BULLET + 9], 0, '$CBF9 STA $0316,X -- TYPE ZERO');
  assert.equal(s.obj.animFrame[BULLET + 9], 0, '$CBFF -- box class 0');
  assert.equal(s.obj.status[BULLET + 9], 0, '$CBFC STA $0116,X');
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x04], 0, '$CBB8 reset the timer FIRST');
  // $CC16 JMP $BCB1 -> $BCB5 -- the bullet is AIMED, so $046C carries direction
  // bits and $5D was INC'd by the divide at $83B5. Both are $BCB5's, and their
  // absence is what a missing JMP would look like.
  assert.notEqual(s.spawn.z5D, 0, '$83B5 INC $5D -- the aim ran');
  assert.equal(s.spawn.zA9, u8(9 + 0x0A), '$BCB5 STA $A9 = slot + $0A');
  // the scan is DOWNWARD: occupy 9 and 8 and the next fire takes 7.
  const d = stage5();
  arm(d, 0x90, 5, 0x40, 0x40);
  d.coll[ARM_POOL + 0x90 + 0x03] = 0;
  d.coll[ARM_POOL + 0x90 + 0x1D] = 0x80;
  d.coll[ARM_POOL + 0x90 + 0x25] = 0x60;
  d.coll[ARM_POOL + 0x90 + 0x04] = u8(period - 1);
  d.obj.anim[BULLET + 9] = 1; d.obj.anim[BULLET + 8] = 1;
  armDriver(d, res.enemyTables);
  assert.equal(d.obj.anim[BULLET + 7], 0x86, 'slots 9 and 8 busy -> slot 7');
});

test('$CBE1/$CBE5/$CBEC: three MUZZLE gates on the tip, and the shot is LOST', () => {
  // tip X < $10, tip X >= $F0, tip Y >= $D0 -- each is a bare RTS, and $CBB8
  // has ALREADY zeroed the fire timer, so the arm waits another full period
  // rather than retrying next frame. Same "allocation failure is gameplay"
  // shape $BC63 has.
  // RED WHEN: a bound moves, a comparison flips, or the timer is restored.
  const period = rb(0xCBCA + 0);
  const fire = (tipX, tipY) => {
    const s = stage5();
    arm(s, 0x90, 5, 0x40, 0x40);
    s.coll[ARM_POOL + 0x90 + 0x03] = 0;   // $FF after the DEC -> ODD -> $CC45 RTS
    s.coll[ARM_POOL + 0x90 + 0x1D] = tipX;
    s.coll[ARM_POOL + 0x90 + 0x25] = tipY;
    s.coll[ARM_POOL + 0x90 + 0x04] = u8(period - 1);
    armDriver(s, res.enemyTables);
    return s;
  };
  assert.equal(fire(0x0F, 0x60).obj.anim[BULLET + 9], 0, 'tip X $0F: no fire');
  assert.equal(fire(0x10, 0x60).obj.anim[BULLET + 9], 0x86, 'tip X $10: fires');
  assert.equal(fire(0xEF, 0x60).obj.anim[BULLET + 9], 0x86, 'tip X $EF: fires');
  assert.equal(fire(0xF0, 0x60).obj.anim[BULLET + 9], 0, 'tip X $F0: no fire');
  assert.equal(fire(0x80, 0xCF).obj.anim[BULLET + 9], 0x86, 'tip Y $CF: fires');
  assert.equal(fire(0x80, 0xD0).obj.anim[BULLET + 9], 0, 'tip Y $D0: no fire');
  // THE TIMER IS SPENT EITHER WAY -- that is the half a "return early" rewrite
  // would get wrong, because it is invisible in the bullet count.
  assert.equal(fire(0x0F, 0x60).coll[ARM_POOL + 0x90 + 0x04], 0,
    '$CBB8 STA $0604,X runs BEFORE $CBBD, so a refused shot still costs a period');
  // and the ALLOCATOR's own failure ($CBDB by fall-through from $CBD9's BPL)
  // is counted rather than silent
  const full = stage5();
  arm(full, 0x90, 5, 0x40, 0x40);
  full.coll[ARM_POOL + 0x90 + 0x03] = 0;
  full.coll[ARM_POOL + 0x90 + 0x1D] = 0x80;
  full.coll[ARM_POOL + 0x90 + 0x25] = 0x60;
  full.coll[ARM_POOL + 0x90 + 0x04] = u8(period - 1);
  for (let k = 0; k < 10; k++) full.obj.anim[BULLET + k] = 1;
  armDriver(full, res.enemyTables);
  assert.equal(full.work.armBulletAllocFail, 1, 'ten busy slots -> $CBDB RTS');
});

test('$CBF9 writes a LITERAL 0 type: kind 0 always, and it cannot be shot down', () => {
  // THE CLAIM THIS CHECK HAD TO BE NARROWED TO, and the narrowing is the
  // finding. The first draft asserted "type 0 is the arm bullet's IDENTITY";
  // $BC66 is `00 01`, so the ORDINARY kind-0 enemy bullet is type 0 as well and
  // the identity claim was simply false. What survives is narrower and true:
  //   (a) $CBF9 writes a CONSTANT, so the arm has no counterpart to $BC6E's
  //       status ladder and always fires kind 0;
  //   (b) type 0 makes $BF7A's BNE fail, so the shot-vs-bullet sweep declines
  //       before it looks at the geometry at all.
  // (b) is measured AGAINST a type-1 bullet in exactly the same place, which is
  // what makes it a statement about the byte rather than about the box.
  // RED WHEN: the type is written from $BC66 instead of as 0, or set non-zero.
  assert.deepEqual([rb(0xBC66), rb(0xBC67)], [0x00, 0x01],
    'fixture: $BC66 -- kind 0 is type 0, which is why the claim is narrow');
  const mk = (type) => {
    const s = stage5(0x50, 0x50);
    s.obj.anim[BULLET + 9] = 0x86;
    s.obj.type[BULLET + 9] = type;
    s.obj.animFrame[BULLET + 9] = 0;
    s.obj.x[BULLET + 9] = 0x50;
    // ONE PIXEL ABOVE THE SHIP. $C23F LDA $A4,X / SBC $0336,Y inherits a CLEAR
    // carry from $C238's CMP, so dy is `py - y - 1` and a bullet exactly on the
    // ship is OUTSIDE $C206[0]'s 8 px band. Same borrow as $BF23 and $C285.
    s.obj.y[BULLET + 9] = 0x4F;
    return s;
  };
  // $BF87 LDA $A0 / SBC $0376,Y has a CLEAR carry, so dx is `a0 - x - 1` and a
  // shot exactly on the bullet MISSES. $51 puts dx at 0.
  const arm0 = mk(0);
  shot(arm0, 0, 0x51, 0x50);
  shotSweep(arm0, res);
  assert.equal(arm0.obj.anim[BULLET + 9], 0x86,
    'type 0: $BF7A BNE fails, the arm bullet SURVIVES a direct hit');
  assert.equal(arm0.obj.anim[SHOT + 0], 0x0A, 'and the shot is not consumed');
  const one = mk(1);
  shot(one, 0, 0x51, 0x50);
  shotSweep(one, res);
  assert.equal(one.obj.anim[BULLET + 9], 0,
    'a TYPE-1 bullet in the same place IS destroyed ($BF9F) -- so the byte, '
  + 'and not the geometry, is what declined');
  // ...and the ARM's own fire really is type 0, driven through $CBD1 rather
  // than hand-set, so the two halves of the check are joined.
  const period = rb(0xCBCA + 0);
  const live = stage5();
  arm(live, 0x90, 5, 0x40, 0x40);
  live.coll[ARM_POOL + 0x90 + 0x03] = 0;
  live.coll[ARM_POOL + 0x90 + 0x1D] = 0x80;
  live.coll[ARM_POOL + 0x90 + 0x25] = 0x60;
  live.coll[ARM_POOL + 0x90 + 0x04] = u8(period - 1);
  live.obj.status[5 + ENEMY_BASE] = 0x85;     // $BC6E's kind-1 window, if it applied
  armDriver(live, res.enemyTables);
  assert.equal(live.obj.type[BULLET + 9], 0,
    'a $80-$8F owner status must NOT make the arm fire kind 1 -- $CBD1 has no '
  + '$BC6E ladder');
  // LETHAL EITHER WAY: $C22A reads $0136, which is $86 regardless of the type.
  const kill = mk(0);
  kill.zp.shield = 0;
  collision(kill, res);
  assert.notEqual(kill.substate, 0x80, '$C24B JMP $C1D6 -- the ship dies');
  const shielded = mk(0);
  shielded.zp.shield = 3;
  collision(shielded, res);
  assert.equal(shielded.zp.shield, 2, '$C24E DEC $46 -- it eats a shield point');
});


test('$AE: exactly ONE arm fires per driver pass -- W32b\'s M12, now testable', () => {
  // $CB93 STA $AE / $CBB2 LDA $AE / BNE $CBC0 / $CBB6 INC $AE. W32b could not
  // test this: $CBD1 threw, so the FIRST ripe group ended the pass and the
  // one-shot had no observable consequence (its mutant M12 survived and was
  // reported as a survivor rather than dressed up). It is observable now.
  // RED WHEN: the $AE test is deleted -- both groups would fire in one pass.
  const period = rb(0xCBCA + 0);
  const s = stage5();
  for (const b of [0x30, 0x90]) {
    arm(s, b, 5, 0x40, 0x40);
    s.coll[ARM_POOL + b + 0x03] = 0;      // $FF after the DEC -> ODD -> $CC45 RTS
    s.coll[ARM_POOL + b + 0x1D] = 0x80;
    s.coll[ARM_POOL + b + 0x25] = 0x60;
    s.coll[ARM_POOL + b + 0x04] = u8(period - 1);
  }
  armDriver(s, res.enemyTables);
  const bullets = [...Array(10).keys()].filter((k) => s.obj.anim[BULLET + k] !== 0);
  assert.equal(bullets.length, 1, 'two ripe groups, ONE bullet');
  assert.equal(s.spawn.zAE, 1, '$CBB6 INC $AE ran once');
  assert.equal(s.coll[ARM_POOL + 0x90 + 0x04], 0, '$90 fired and reset its timer');
  assert.equal(s.coll[ARM_POOL + 0x30 + 0x04], period,
    '$30 is ripe, was INC\'d to the period, and was REFUSED by $CBB2 -- its '
  + 'timer is NOT reset, so it fires on the very next pass');
  // The next pass is the other one's -- but $CC33's parity byte has stepped to
  // $FF and a second DEC makes it $FE, which is EVEN, so the kinematics would
  // RUN and rewrite the tip out of the muzzle window. Put both back where the
  // fixture had them; the claim under test is $AE's, not $CC33's.
  for (const b of [0x30, 0x90]) {
    s.coll[ARM_POOL + b + 0x03] = 0;
    s.coll[ARM_POOL + b + 0x1D] = 0x80;
    s.coll[ARM_POOL + b + 0x25] = 0x60;
  }
  armDriver(s, res.enemyTables);
  const after = [...Array(10).keys()].filter((k) => s.obj.anim[BULLET + k] !== 0);
  assert.equal(after.length, 2, 'pass two: the $30 group gets its turn');
  // and $A8 is the byte $CBD1 reads -- the walk must leave it at $D0, not $FF
  assert.equal(s.spawn.zA8, 0xD0, '$CBC0-$CBC7 steps $A8 by -$30, ending at $D0');
});

// =============== 8. $A17C, THE SIXTH $19 == 4 SITE =========================

test('$A17C: stage 5 skips the missile terrain probe -- and it is the SIXTH site', () => {
  // `A5 19 C9 04` appears SIX times in the PRG. W32a's wall list had five and
  // $A17C was the missing one; it fires whenever a MISSILE is alive, i.e. for
  // any player past the second power-up. Counted out of prg.bin here so the
  // claim is the cartridge's and not the worklog's.
  // RED WHEN: the arm reverts to a throw, or stage 5 starts probing terrain.
  const sites = [];
  for (let a = 0x8000; a < 0x10000 - 4; a++) {
    if (rb(a) === 0xA5 && rb(a + 1) === 0x19 && rb(a + 2) === 0xC9 && rb(a + 3) === 0x04) {
      sites.push(a);
    }
  }
  assert.deepEqual(sites.map((a) => a.toString(16).toUpperCase()),
    ['8B8D', '9663', 'A17C', 'C037', 'C25D', 'C772'],
    'the complete set of $19 == 4 tests in the PRG');
  assert.equal(rb(0xA180), 0xF0, '$A180 must be BEQ');
  assert.equal(rb(0xA181), 0x28, 'and it must reach $A1AA, the FLY body');
  // BEHAVIOUR: a missile over terrain that is SOLID EVERYWHERE. On stage 1
  // both of $A187's probes hit, so `$A19C BNE $A1D6` FREES the missile; on
  // stage 5 no probe is made at all and it flies on. Solid-everywhere is the
  // discriminator because it needs no hand-computed tile index -- the two
  // outcomes differ in the missile's existence, not in one byte of its motion.
  const mk = (stage) => {
    const s = createState();
    s.zp19 = stage;
    s.obj.anim[SHOT + 8] = 0x0A;
    s.obj.animFrame[SHOT + 8] = 3;
    s.obj.x[SHOT + 8] = 0x40;
    s.obj.y[SHOT + 8] = 0x40;
    s.coll.fill(0xFF, 0, 0x100);           // $0500-$05FF -- solid everywhere
    missileLoop(s, res);
    return s;
  };
  const s1 = mk(0), s5 = mk(4);
  assert.equal(s1.obj.anim[SHOT + 8], 0, 'stage 1: $A199 JSR $C3D3 hit -> $A1D6 FREE');
  assert.equal(s1.obj.animFrame[SHOT + 8], 0, '$A1DB STA $0163,X');
  assert.equal(s5.obj.anim[SHOT + 8], 0x0A, 'stage 5: $A180 BEQ $A1AA -> FLY');
  assert.equal(s5.obj.animFrame[SHOT + 8], 3, 'and it is still a live missile');
  assert.equal(s5.obj.y[SHOT + 8], 0x42, '$A1A4[0] = +2 -- the fly row');
  // ...and stages 2, 3 and 4 must STILL probe. The bypass is $19 == 4 alone,
  // not `$19 >= something`, which is the mistake $BC44's neighbour makes.
  for (const st of [1, 2, 3]) {
    assert.equal(mk(st).obj.anim[SHOT + 8], 0,
      `stage ${st + 1} must still probe and be freed by the wall`);
  }
  assert.equal(mk(5).obj.anim[SHOT + 8], 0, 'stage 6 must still probe too');
});

test('$BC44: stages 3+ and any loop skip the player-position gate entirely', () => {
  // $BC44 LDA $1A / BNE $BC59 and $BC48 LDA $19 / CMP #$02 / BCS $BC59. This
  // was a LOUD THROW until W32c and it was NEVER a stage-5 gap: the bound is
  // $19 >= 2, so stages 3 and 4 -- both past the scope guard since W30/W31 and
  // both printed RUNNABLE by stageledger.py -- crashed the first time any enemy
  // fired. Found at frame 190 of the first stage-5 run, not by the ledger.
  // RED WHEN: the arm goes back to a throw, or the bound moves off 2.
  assert.deepEqual([rb(0xBC44), rb(0xBC45), rb(0xBC46)], [0xA5, 0x1A, 0xD0],
    'fixture: $BC44 LDA $1A / BNE');
  assert.deepEqual([rb(0xBC48), rb(0xBC49), rb(0xBC4A), rb(0xBC4B)],
    [0xA5, 0x19, 0xC9, 0x02], 'fixture: $BC48 LDA $19 / CMP #$02');
  // An enemy to the LEFT of the ship: the gate would refuse, the skip fires.
  const mk = (stage, loop) => {
    const s = createState();
    s.zp19 = stage; s.zp1A = loop;
    s.spawn.z5D = 0;                         // $BBB7 LDA $5D / BNE $BC19
    s.obj.x[0] = 0xC0;                       // the ship, far RIGHT
    s.obj.type[9 + ENEMY_BASE] = 0x88;
    s.obj.status[9 + ENEMY_BASE] = 0;
    s.obj.x[9 + ENEMY_BASE] = 0x20;          // the enemy, far LEFT
    s.obj.y[9 + ENEMY_BASE] = 0x60;
    s.obj.style[9 + ENEMY_BASE] = 0;         // $040C,X -- the countdown, RIPE
    s.obj.s04E0[9 + ENEMY_BASE] = 0xC8;      // $04EC,X -- the reload ($BC04)
    enemyBullets(s, res);
    return [...Array(10).keys()].filter((k) => s.obj.anim[BULLET + k] !== 0).length;
  };
  assert.equal(mk(0, 0), 0, 'stage 1, loop 0: $BC58 RTS -- no backwards shooting');
  assert.equal(mk(1, 0), 0, 'stage 2, loop 0: the gate still runs');
  assert.equal(mk(2, 0), 1, 'stage 3: $BC4C BCS $BC59 -- it fires anyway');
  assert.equal(mk(4, 0), 1, 'stage 5: likewise');
  assert.equal(mk(0, 1), 1, 'loop 2 on stage 1: $BC46 BNE $BC59');
});

// =============== 9. THE SCOPE GUARD, AND ITS EVIDENCE ======================

test('$A2F0: the guard admits stage 5 and still stops stage 6', () => {
  // The wall W31 moved to `>= 4` and W32a and W32b both REFUSED to move,
  // because it is the LAST of the stage-5 walls and moving it while an
  // ordinary play path still threw would make stageledger.py print RUNNABLE
  // for a stage that cannot survive one shot. The next check is the evidence.
  // RED WHEN: the bound goes back to 4, or forward to 6.
  const rom = res.enemyTables;
  const wave = (stage) => {
    const tbl = rom.word(0xA7D0 + 2 * stage);
    const ptr = rom.read(tbl) | (rom.read(tbl + 1) << 8);
    const s = createState();
    s.substate = 0x80;
    s.spawn.z60 = 2;
    s.zp19 = stage;
    s.spawn.z61 = 0;
    s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
    s.cam.hi = 0; s.cam.lo = 0;
    return s;
  };
  const s4 = wave(4);
  assert.doesNotThrow(() => spawnEngine(s4, res),
    'stage 5 ($19=4) must reach the wave engine');
  assert.equal(s4.obj.type[9 + ENEMY_BASE], 0x1D,
    'and fire a real record: chunk 0 @$ABB6 is a type $1D (W32a\'s $B559)');
  assert.throws(() => spawnEngine(wave(5), res), /\$A2F0 runEngine/,
    'stage 6 ($19=5) must still throw loudly, naming $A2F0');
  // the message must name what is ACTUALLY left, not what W32c shipped. This
  // check exists because that message has now gone stale three times.
  let msg = '';
  try { spawnEngine(wave(5), res); } catch (e) { msg = e.message; }
  // The message may (and does) name W32c's routines as SHIPPED; what it must
  // not do is carry a FORWARD reference to them, which is how it went stale
  // after W32a and again after W32b.
  assert.ok(!/W32c\./.test(msg),
    'the guard must stop deferring to W32c -- W32c is this commit');
  assert.ok(/\$C6DE/.test(msg), 'and name stage 6\'s own unported late spawner');
  assert.ok(/stageledger/.test(msg), 'and point at the tool that lists the rest');
});

test('THE MEASUREMENT THE GUARD RESTS ON: 1780 stage-5 nmi() frames, 0 throws', () => {
  // docs/knowledge/10: coverage is BRANCHES, and this is the branch evidence
  // for the whole subsystem, taken through the real frame entry point rather
  // than through the routines directly. The camera is stepped 2 px a frame so
  // the chunk loader crosses all seven of stage 5's 512-px boundaries --
  // including chunk 2 ($ABE8), the four inline-5 records that allocate arms.
  //
  // THREE INTERVENTIONS, LABELLED (docs/knowledge/09): the shield is held at
  // $FF, missiles are re-supplied, and the two shot slots are AIMED at segment
  // 2 of whichever group is live. The last one is necessary and measured: an
  // identical run without it produced 1780 clean frames and ZERO segment-2
  // hits, because the boot player position never intersects the arms. So this
  // run is evidence about the CODE under a forced state, not about how stage 5
  // plays.
  //
  // $0605 IS THE PROOF OBJECT. Exactly one instruction in the whole PRG writes
  // it ($BF3C INC $0605,X) and exactly one reads it ($BF3F), so a rise in it
  // is a shot reaching segment 2 and nothing else can produce one.
  // RED WHEN: any of the four W32c paths throws again, or stops running.
  const rom = res.enemyTables;
  const s = bootState(res.manifest);
  s.zp19 = 4;
  s.substate = 0x80;
  s.spawn.z60 = 2;
  const tbl = rom.word(0xA7D0 + 2 * 4);
  const ptr = rom.read(tbl) | (rom.read(tbl + 1) << 8);
  s.spawn.z61 = 0;
  s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
  s.cam.hi = 0; s.cam.lo = 0;
  s.zp41 = 1;                                   // MISSILES, so $A17C is live

  const st = { groups: 0, seg2Hits: 0, armsShotApart: 0, armBullets: 0, forks: 0 };
  const wt = res.weaponTables;
  for (let f = 0; f < 1780; f++) {
    s.cam.lo = u8(s.cam.lo + 2);
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    s.obj.status[0] = 1;
    s.zp.shield = 0xFF;
    const live = GROUPS.find((b) => s.coll[ARM_POOL + b] !== 0);
    for (const k of [0, 1]) {
      if (s.obj.anim[SHOT + k] === 0) {
        s.obj.anim[SHOT + k] = 0x0A; s.obj.animFrame[SHOT + k] = 0;
      }
      if (live !== undefined) {
        s.obj.x[SHOT + k] = u8(s.coll[ARM_POOL + live + 0x1A] - wt.read(0xBFCE));
        s.obj.y[SHOT + k] = u8(s.coll[ARM_POOL + live + 0x22] - wt.read(0xBFD6) + 1);
      }
    }
    for (const k of [6, 7, 8]) {
      if (s.obj.animFrame[SHOT + k] === 0) {
        s.obj.anim[SHOT + k] = 0x0A; s.obj.animFrame[SHOT + k] = 3;
        s.obj.x[SHOT + k] = s.obj.x[0]; s.obj.y[SHOT + k] = 0x60;
      }
    }
    const gB = liveGroups(s).length;
    const bB = [...Array(10).keys()].filter((k) => s.obj.anim[BULLET + k] !== 0).length;
    const hpB = GROUPS.map((b) => (s.coll[ARM_POOL + b] !== 0 ? s.coll[ARM_POOL + b + 5] : -1));
    nmi(s, (f % 30 < 20) ? 0x01 : 0x00, res);   // A held two frames in three
    const gA = liveGroups(s).length;
    const bA = [...Array(10).keys()].filter((k) => s.obj.anim[BULLET + k] !== 0).length;
    if (gA > gB) st.groups += gA - gB;
    if (bA > bB) st.armBullets += bA - bB;
    if (s.zp5B !== 0) st.forks += 1;
    GROUPS.forEach((b, n) => {
      const now = s.coll[ARM_POOL + b] !== 0 ? s.coll[ARM_POOL + b + 5] : -1;
      if (hpB[n] >= 0 && now > hpB[n]) st.seg2Hits += now - hpB[n];
      if (hpB[n] > 0 && now === -1) st.armsShotApart += 1;
    });
  }
  // The numbers are lower bounds, not equalities: they are a property of a
  // 1780-frame trajectory and would move if any of the fixture's three
  // interventions changed. What must hold is that every path RAN.
  assert.ok(st.groups >= 8, `arm groups allocated by the game's own records: ${st.groups}`);
  assert.ok(st.seg2Hits >= 10, `$BF3C segment-2 hits: ${st.seg2Hits}`);
  assert.ok(st.armsShotApart >= 4, `$BF49 arms shot apart: ${st.armsShotApart}`);
  assert.ok(st.armBullets >= 10, `$CBD1 arm bullets fired: ${st.armBullets}`);
  assert.ok(st.forks >= 100, `$96A0 forked frames: ${st.forks}`);
  assert.ok(s.cam.hi * 256 + s.cam.lo >= 0x0E00,
    'the run must scroll past stage 5\'s own length ($98FD[4] = $0D chunks)');
});
