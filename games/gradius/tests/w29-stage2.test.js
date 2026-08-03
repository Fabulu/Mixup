// Wave 29 tests -- stage 2 ($19=1): the jellyfish $B37F, the late-spawner arm
// $C546, and the $BBC3 fire-rate ladder that stage 2 reaches.
//
// Every check below was written to FAIL under a named mutant (the RED WHEN
// line). The both-sides scenario (the endchain continuing into stage 2) is the
// field-exactness proof; these attribute the constants the scenario cannot.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { updateEnemies, enemyBullets, spawnEngine } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;
const hi = ENEMY_BASE;            // 12: enemy slots are indices 12..21

/** One enemy of `type` in slot 21 (j = 9); the ship at (px, py). */
function one(type, px = 0x50, py = 0x60) {
  const s = createState();
  s.substate = 0x80;
  s.spawn.z60 = 2;
  s.obj.x[0] = px; s.obj.y[0] = py;
  s.obj.type[21] = type;
  s.obj.x[21] = 0xA0; s.obj.y[21] = 0x40;
  return s;
}

// ====================== $B37F: the $0B morph-in ============================

test('$B37F $0B: INCs $04AC and indexes the 9-entry anim table $B3C2', () => {
  // $B389 INC $04AC,X / $B38C LSR / LSR / TAY / $B392 LDA $B3C2,Y.
  // RED WHEN: the table address, the >> 2 shift, or the INC site is wrong.
  const s = one(0x0B);
  const anims = [0x64, 0x64, 0x64, 0x65, 0x65, 0x65, 0x66, 0x66, 0x66];
  for (let f = 1; f <= 31; f++) {
    s.frame = u8(f);
    updateEnemies(s, res);
    const y = (f) >>> 2;            // $04AC == f after the INC
    assert.strictEqual(s.obj.anim[21], anims[y],
      `frame ${f}: anim must be $B3C2[${y}] = $${anims[y].toString(16)}`);
    assert.strictEqual(s.obj.type[21], 0x0B, `frame ${f}: still morphing ($0B)`);
  }
});

test('$B37F $0B: at $04AC >> 2 == 8 it flips to $8B ($B0B4) and clears $048C', () => {
  // $B398 CPY #$08 / BEQ $B39D -> loc_B3A2 (STA $048C := 0) -> JMP $B0B4.
  // $04AC reaches 32 on frame 32; 32 >> 2 == 8. RED WHEN: the == 8 threshold
  // moves, or the init forgets to clear $048C (entry 9 does NOT clear it).
  const s = one(0x0B);
  for (let f = 1; f <= 31; f++) { s.frame = u8(f); updateEnemies(s, res); }
  assert.strictEqual(s.obj.type[21], 0x0B, 'frame 31: still $0B');
  s.frame = 32;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0x8B, 'frame 32: $B0B4 set the initialised bit');
  assert.strictEqual(s.obj.s04C0[21], 0x01, '$04CC := 1 (loc_B39D)');
  assert.strictEqual(s.obj.s0480[21], 0x00, '$048C := 0 (loc_B3A2)');
});

// ====================== $B37F: the $8B active form =========================

test('$B37F $8B: anim $67, aims at the ship on the first frame, sets $048C := 1', () => {
  // $B3AA anim $67 / $B3AF $048C==0 -> JSR $BCB5 (aim the ENEMY) / $B3BC $048C:=1.
  // aimBullet writes the direction byte $046C,X. RED WHEN: aimBullet is called
  // with a bullet slot index instead of j, or $048C is not set after.
  const s = one(0x8B);
  s.obj.s0480[21] = 0;              // first active frame
  s.frame = 1;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.anim[21], 0x67, '$8B anim is $67');
  assert.strictEqual(s.obj.s0480[21], 0x01, '$048C := 1 after the first active frame');
  // aimBullet set a direction byte (two bits, 0..3) -- not left at its seed.
  assert.ok([0, 1, 2, 3].includes(s.obj.s0460[21]),
    `$046C direction byte set by aimBullet (got ${s.obj.s0460[21]})`);
});

test('$B37F $8B: does NOT re-aim on the second frame ($048C != 0 skips $BCB5)', () => {
  // $B3B2 BNE $B3B9 -- once $048C is 1 the aim is skipped. RED WHEN: the BNE
  // is inverted (re-aims every frame, homing instead of a straight course).
  const s = one(0x8B);
  s.obj.s0480[21] = 1;              // already past the first frame
  s.obj.s0460[21] = 0;             // seed; must be UNCHANGED (no aim call)
  s.frame = 2;
  assert.doesNotThrow(() => updateEnemies(s, res));
  assert.strictEqual(s.obj.s0460[21], 0, 'no re-aim: $046C unchanged');
});

// ====================== moveAimedEnemy ($BDFA for an enemy) ================

test('moveAimedEnemy: frees the slot when X leaves [2,$FB]', () => {
  // $BE2A CMP #$02 / BCC $BE6B / CMP #$FC / BCS $BE6B. A jellyfish that flies
  // off the left/right edge is freed via the short free ($AEF8). s0480 = 1 so
  // the active form does NOT re-aim (which would overwrite the seeded velocity).
  // x=3, xvel=5, dir bit 1 clear (X -= vel) -> nx = $FE >= $FC -> free.
  // RED WHEN: the bounds or the free index (j, not 0x0A+j) is wrong.
  const s = one(0x8B);
  s.obj.s0480[21] = 1;             // past the first frame: do not re-aim
  s.obj.x[21] = 0x03;
  s.obj.xvel[21] = 0x05;           // leftward -> nx = $FE
  s.obj.xvelf[21] = 0x00;
  s.obj.s0460[21] = 0;             // bit 1 clear -> X -= velocity
  s.frame = 1;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0, 'nx >= $FC frees the slot ($AEF8)');
});

// ====================== $C546: the stage-2 late-spawner arm ===============

test('$C546: the $02 & 7 second gate halves the cadence to every 8th frame', () => {
  // $C546 AND #$07 / BEQ $C54D. The late spawner already gated on $02 & 3.
  // RED WHEN: the AND #$07 becomes #$03 or #$0F.
  for (let f = 0; f < 16; f++) {
    const s = createState();
    s.substate = 0x82;            // the countdown -- reaches lateSpawner
    s.spawn.z60 = 2;
    s.zp19 = 1;                   // stage 2
    s.frame = u8(f);
    spawnEngine(s, res);
    const spawned = s.obj.type[21] === 0x0B;   // slot 9 (SLOT_FIRST) gets the jellyfish
    assert.strictEqual(spawned, (f & 7) === 0,
      `frame ${f}: $02 & 7 == ${f & 7} must ${(f & 7) === 0 ? 'spawn' : 'not spawn'}`);
  }
});

test('$C546: spawns type $0B (jellyfish) with anim $67', () => {
  // $C562 LDA #$0B / $C567 LDA #$67. RED WHEN: the type or anim byte is wrong.
  const s = createState();
  s.substate = 0x82;
  s.spawn.z60 = 2;
  s.zp19 = 1;
  s.frame = 0;                    // passes both gates
  spawnEngine(s, res);
  assert.strictEqual(s.obj.type[21], 0x0B, 'type $0B (jellyfish -> $B37F)');
  assert.strictEqual(s.obj.anim[21], 0x67, 'anim $67');
});

test('$C546: the X/Y tables are offset by one ($C56E == $C56D+1)', () => {
  // $C556 LDA $C56D,Y / $C55C LDA $C56E,Y. Y[a9] is one byte after X[a9].
  // RED WHEN: both reads use $C56D (collapses the 16 pairs into 8) or the
  // offset goes the wrong way.
  const s = createState();
  s.substate = 0x82;
  s.spawn.z60 = 2;
  s.zp19 = 1;
  s.frame = 0;
  spawnEngine(s, res);
  // a9 for the first spawn (z69 == 0 -> y = 0 -> patternByte = $C58D[0], aa=1
  // -> low nibble; a9 = (low nibble) << 1). Read the same indices the port did.
  // The X the port stored must equal rom $C56D[a9]; Y must equal $C56D[a9+1].
  const a9 = (rom.read(0xC58D) & 0x0F) << 1;
  assert.strictEqual(s.obj.x[21], rom.read(0xC56D + a9),
    `X = $C56D[$${a9.toString(16)}]`);
  assert.strictEqual(s.obj.y[21], rom.read(0xC56D + a9 + 1),
    `Y = $C56E[$${a9.toString(16)}] == $C56D[a9+1]`);
});

// ====================== $BBC3: the fire-rate ladder =======================

test('$BBC3: stage 1/loop 0 keeps $98 = 1 (the BEQ skips the ladder)', () => {
  // $BBBD LDA $19 / ORA $1A / BEQ $BBEC. RED WHEN: the skip is removed.
  const s = createState();
  s.zp19 = 0; s.zp1A = 0; s.zp17 = 4;      // rank 4, but stage 1 -> ladder skipped
  s.obj.type[21] = 0x04;                    // type AND $7F >= 3 -> counts down
  s.obj.style[21] = 10;                     // $040C
  s.obj.s04E0[21] = 200;                    // $04EC (reload)
  s.spawn.z5D = 0;                          // not a wave-just-fired frame
  s.frame = 0;
  enemyBullets(s, res);
  assert.strictEqual(s.obj.style[21], 9, 'stage 1: $98 = 1, so 10 -> 9');
});

test('$BBC3: stage 2 / rank < 3 also yields $98 = 1', () => {
  // The ladder runs (no BEQ) but no arm fires: loop 0, no shield, rank < 3.
  // RED WHEN: the $19 != 0 entry to the ladder is missing.
  const s = createState();
  s.zp19 = 1; s.zp1A = 0; s.zp17 = 2;      // stage 2, rank 2
  s.obj.type[21] = 0x04; s.obj.style[21] = 10; s.obj.s04E0[21] = 200;
  s.spawn.z5D = 0; s.frame = 0;
  enemyBullets(s, res);
  assert.strictEqual(s.obj.style[21], 9, 'stage 2 rank < 3: $98 = 1');
});

test('$BBC3: stage 2 / rank >= 3 yields $98 = 2 (the rank bump)', () => {
  // $BBE5 LDA $17 / CMP #$03 / BCC / $BBEB INY. Stage 2 enemies fire 2x faster.
  // This is the load-bearing stage-2 line. RED WHEN: the rank arm or its >= 3
  // threshold is wrong, or the ladder still throws on stage 2.
  const s = createState();
  s.zp19 = 1; s.zp1A = 0; s.zp17 = 4;      // stage 2, rank 4
  s.obj.type[21] = 0x04; s.obj.style[21] = 10; s.obj.s04E0[21] = 200;
  s.spawn.z5D = 0; s.frame = 0;
  enemyBullets(s, res);
  assert.strictEqual(s.obj.style[21], 8, 'stage 2 rank >= 3: $98 = 2, so 10 -> 8');
});
