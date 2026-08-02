// THE BOSS -- $B914 head + $B913 inert body (entry 24/25, types $18/$98, $19/$99).
//
// The endchain scenario drives the boss through the FIGHT and the TIMEOUT death
// (the player holds RUA, drives to the right wall, and never damages the core;
// the boss self-destructs at $04CC = 6). What no scenario exercises is the
// DAMAGE death -- the score, the per-player kill tally, the script-4 override
// to metasprite $A2, and the $1B $85->$86 advance -- because nothing in the
// corpus kills the boss by dealing 6 damage. Those paths are here, plus the
// morph ladder and the body-sync, each pinned to its ROM constant.
//
// EVERY TEST IN THIS FILE HAS BEEN SEEN RED. The mutation is named in the
// comment above each one.

import test from 'node:test';
import assert from 'node:assert';

import { createState, ENEMY_BASE } from '../src/state.js';
import { updateEnemies } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const H = 9 + ENEMY_BASE;                 // slot 21 -- the head

/** One boss head at slot 21, HP=phase, with the ship at (px,py), rank 4. */
function boss(phase, px = 0x50, py = 0x60) {
  const s = createState();
  s.substate = 0x85;                      // $1B -- the boss-fight sub-state
  s.zp17 = 4;                             // $17 -- the rank row the tables index
  s.zp19 = 1;                             // $19 -- stage 1 (the warp gate)
  s.obj.x[0] = px; s.obj.y[0] = py;       // the ship
  s.obj.type[H] = 0x98;                   // boss head
  s.obj.x[H] = 0xF0; s.obj.y[H] = 0x80;   // spawn position
  s.obj.s0460[H] = phase;                 // $046C,X -- the HP / damage counter
  return s;
}

test('$B8EF morph ladder: anim advances $6C..$71 one step per damage point', () => {
  // $B92F LDY $046C,X / LDA $B8EF,Y. The displayed morph ($012C,X) follows the
  // HP counter exactly. RED WHEN: the table is wrong, or the stepper does not
  // re-read $046C each frame (a cached morph stays on the wrong picture).
  for (let phase = 0; phase <= 5; phase++) {
    const s = boss(phase);
    updateEnemies(s, res);
    assert.strictEqual(s.obj.anim[H], 0x6C + phase,
      `phase ${phase}: morph = $B8EF[${phase}] = $${(0x6C + phase).toString(16)}`);
  }
});

test('morph step (not the initial $6C) scores +$50 and sfx $08', () => {
  // $B943 CMP #$6C / BEQ -- the initial closed core makes no sound. Every later
  // step does JSR $845B (scoreCapsule, +$0050) and sfx $08.
  // RED WHEN: the score is dropped (e.g. +$0010), the sfx id is wrong, or the
  // $6C exemption is missing (the first step would score too).
  const s = boss(1);                      // morph $6D, not $6C -> scores
  updateEnemies(s, res);
  assert.strictEqual(s.score[4], 0x50, '$B947 JSR $845B -> +$0050 in P1 score LSB');
  assert.ok(s.sfx.includes(0x08), '$B94C JSR $EC1E -> sfx $08 queued');
  // The initial $6C (phase 0) scores nothing:
  const s0 = boss(0);
  updateEnemies(s0, res);
  assert.strictEqual(s0.score[4], 0x00, 'phase 0 ($6C) is exempt: no score');
  assert.ok(!s0.sfx.includes(0x08), 'phase 0 ($6C): no morph sfx');
});

test('body-sync: the head creates both inert body slots every frame', () => {
  // sub_B9B7/sub_B9F2 (the $030B,X slot-N-1 trick, run twice) writes type $99 /
  // status $80 into slots 20 and 19, with anim $85 (body 8) and $32 (body 7).
  // RED WHEN: a body byte is wrong, or the double-execution writes only one
  // slot (the fall-through trick lost).
  const s = boss(0);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[8 + ENEMY_BASE], 0x99, 'body slot 8 type $99');
  assert.strictEqual(s.obj.type[7 + ENEMY_BASE], 0x99, 'body slot 7 type $99');
  assert.strictEqual(s.obj.anim[8 + ENEMY_BASE], 0x85, 'body slot 8 anim $85');
  assert.strictEqual(s.obj.anim[7 + ENEMY_BASE], 0x32, 'body slot 7 anim $32');
  assert.strictEqual(s.obj.status[8 + ENEMY_BASE], 0x80, 'body slot 8 status $80');
  assert.strictEqual(s.obj.status[7 + ENEMY_BASE], 0x80, 'body slot 7 status $80');
});

test('damage death at HP=6: score +$001000, INC $3B, script 4, body clear, $1B->$86', () => {
  // HP reaches the $00 terminator at $B8EF[6] -> the $B962 death gate -> $B97A.
  // RED WHEN: any step is dropped -- e.g. the score is +$0010 (scoreKill) not
  // +$001000 ($8455), the script override is missing (animFrame stays $02), or
  // the INC $1B is lost ($1B stays $85, the boss never dies).
  const s = boss(6);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[H], 0x02, '$CB47 type -> $02 (explosion handler)');
  assert.strictEqual(s.obj.animFrame[H], 0x04, '$B98A script override -> 4 ($A2)');
  assert.strictEqual(s.substate, 0x86, '$B9A5 INC $1B -> $86');
  assert.strictEqual(s.cheat[0], 1, '$B981 INC $3B,X (per-player kill tally)');
  // $B97A LDA #$10 / JSR $8455: +$001000 (middle byte $10), NOT scoreKill's +$10.
  assert.strictEqual(s.score[5], 0x10, '$8455 adds $10 to the MIDDLE score byte');
  assert.strictEqual(s.score[4], 0x00, '$8455 leaves the LSB at $00');
  // body slots cleared ($B991 loop via the $030B,X trick):
  assert.strictEqual(s.obj.type[8 + ENEMY_BASE], 0x00, 'body slot 8 cleared');
  assert.strictEqual(s.obj.type[7 + ENEMY_BASE], 0x00, 'body slot 7 cleared');
  assert.strictEqual(s.sfx.includes(0xAC), true, '$CB28 sfx $AC queued');
});

test('HP >= 7 also reaches the death gate (the safety bound)', () => {
  // $B932 CPY #$07 / BCS $B962. RED WHEN: the bound is #$06 (a 7-damage hit
  // would loop the morph table past the terminator).
  const s = boss(7);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[H], 0x02, 'phase 7 -> death (CPY #$07, not #$06)');
  assert.strictEqual(s.substate, 0x86, '$1B -> $86');
});

test('the $0100>=2 guard skips the $1B advance during a ship death', () => {
  // $B99E LDA $0100 / CMP #$02 / BCS $B9A7. status[0] is $0100; a dying ship
  // ($0100 >= 2) must NOT advance $1B. RED WHEN: the guard is inverted or gone
  // ($1B would advance during the player's own death explosion).
  const s = boss(6);
  s.obj.status[0] = 2;                    // $0100 >= 2 -- a transition in progress
  updateEnemies(s, res);
  assert.strictEqual(s.substate, 0x85, '$0100>=2 skips INC $1B (stays $85)');
  assert.strictEqual(s.obj.type[H], 0x02, 'the explosion still ran');
});

test('stage-1 warp arm: INC $39 fires only in the $04CC==1, $04AC<$78 window', () => {
  // $B962-$B978. On stage 1, the warp flag sets when the kill lands during the
  // first volley with charge under $78. RED WHEN: the gate is widened (any
  // volley/charge sets $39) or narrowed (the on-window misses it). $39's effect
  // is W27; its FIRING must be correct here.
  const on = boss(6);
  on.obj.s04C0[H] = 1;                    // $04CC == 1
  on.obj.s04A0[H] = 0x10;                 // $04AC < $78
  updateEnemies(on, res);
  assert.strictEqual(on.zp39, 1, '$04CC==1 && $04AC<$78 -> INC $39');
  // Out of window (volley 2): no warp flag.
  const off = boss(6);
  off.obj.s04C0[H] = 2;
  off.obj.s04A0[H] = 0x10;
  updateEnemies(off, res);
  assert.strictEqual(off.zp39, 0, 'volley 2: warp arm does not fire');
});
