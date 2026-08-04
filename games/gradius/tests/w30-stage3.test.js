// Wave 30 tests -- stage 3 ($19 = 2): the inline-5 ROUTE (the stride change),
// the moai $C906 with its $C77C continuation, the chaser $B7A1, the shared pair
// $B402/$B434 and $B4FD.
//
// EVERY CHECK BELOW WAS WATCHED TO GO RED under the named mutant on its
// `RED WHEN` line, and the file hash was compared byte-for-byte before and
// after each restore. The mutation table is in
// docs/worklog/gradius/30-impl-stage3.md.
//
// The stride checks are the ones that matter most: a wrong stride does NOT
// throw. It desynchronises the whole remaining wave stream and spawns plausible
// wrong enemies, which is why the first test asserts a SEQUENCE and not a
// single record.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { updateEnemies, spawnEngine } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;
const stage3res = { ...res, stage: res.stages[2], stages: res.stages };

/** A state parked in the running wave engine on stage 3, cursor at `ptr`. */
function engineAt(ptr, chunkHi) {
  const s = createState();
  s.substate = 0x80;                 // not $81 / $82
  s.zp19 = 2;                        // $19 = 2 -> in-game stage 3
  s.spawn.z60 = 2;                   // $A2CC DEX / BNE $A2F0 -- the running state
  s.spawn.z61 = chunkHi & 0x0E;      // $61, the 512-px chunk base
  s.spawn.z6A = ptr & 0xFF;
  s.spawn.z6B = ptr >>> 8;
  s.cam.hi = chunkHi;
  s.cam.lo = 0;
  s.obj.x[0] = 0x50; s.obj.y[0] = 0x60;
  return s;
}

/** Scroll to `(hi,lo)` and run one engine tick. */
function tick(s, hi, lo) {
  s.cam.hi = hi; s.cam.lo = lo;
  spawnEngine(s, stage3res);
}

const cursor = (s) => s.spawn.z6A | (s.spawn.z6B << 8);

/** Every live enemy slot as [type, x, y]. */
function live(s) {
  const out = [];
  for (let j = 0; j <= 9; j++) {
    const i = j + ENEMY_BASE;
    if (s.obj.type[i] !== 0) out.push([s.obj.type[i], s.obj.x[i], s.obj.y[i]]);
  }
  return out;
}

// ==================== THE STRIDE, $A34B / $A386 =============================

test('$A386: an inline-5 record advances the cursor by FIVE, not two', () => {
  // $A34B CMP #$F0 / BCS $A37A, then $A386 LDA #$05 / LDX #$6A / JSR $8402.
  // The record at $A9E6 is `92 F0 38 21 23`; the next REAL record is $A9EB.
  // RED WHEN: the 5 is a 2 or a 4, or the split test is `>` instead of `>=`.
  const s = engineAt(0xA9E6, 2);
  assert.strictEqual(rom.read(0xA9E6), 0x92, 'fixture: trigger byte');
  assert.strictEqual(rom.read(0xA9E7), 0xF0, 'fixture: cmd $F0 (an inline-5)');
  tick(s, 3, 0x40);                  // scroll $0340 > the record's $0324
  assert.strictEqual(cursor(s), 0xA9EB,
    'the cursor must land on $A9EB, the next record -- not $A9E8, which is the '
    + 'inline record\'s own third byte and decodes as trigger $21 / cmd $23');
});

test('the stride change does not desynchronise the tail: chunk 1 spawns in order', () => {
  // THE WHOLE POINT OF THE WAVE. Stage 3's chunk 1 ($A9E0) is
  //   $A9E4  2-byte  cmd $2B  single, type $17 -> $B7A1
  //   $A9E6  5-byte  92 F0 38 21 23   -> the moai, type $96
  //   $A9EB  5-byte  94 F0 B8 23 23   -> the moai, type $96
  //   $A9F0  2-byte  cmd $2C  single, type $12
  //   $A9F2  5-byte  D4 F0 58 21 B3   -> the moai, type $96
  //   $A9F7  2-byte  cmd $2D  single, type $12
  //   $A9F9  $FF     end
  // A 2-byte stride on the first inline record reads $A9E8 (`21 23`) as the
  // next one and every record after it is garbage. RED WHEN: the stride, the
  // $F0 threshold, or the $A466 arm selection is wrong.
  const s = engineAt(0xA9E4, 2);
  const seen = [];
  for (let hi = 2; hi <= 3; hi++) {
    for (let lo = 0; lo <= 0xF0; lo += 4) {
      const before = live(s).length;
      tick(s, hi, lo);
      const now = live(s);
      if (now.length > before) seen.push(now[now.length - 1][0]);
      // free everything so each spawn is visible on its own
      for (let j = 0; j <= 9; j++) s.obj.type[j + ENEMY_BASE] = 0;
    }
  }
  assert.deepStrictEqual(seen, [0x17, 0x96, 0x96, 0x12, 0x96, 0x12],
    'the six spawns of stage 3 chunk 1, in stream order');
  assert.strictEqual(cursor(s), 0xA9F9, 'the cursor ends on the $FF terminator');
});

test('$A466 splits on $19 == 2 EXACTLY; a lower stage throws naming $A4A6', () => {
  // $A466 LDA $19 / CMP #$02 / BEQ $A46F / JMP $A4A6. RED WHEN: the test is a
  // range (`>= 2`) instead of an equality, which would send stage 4's and
  // stage 5's inline records into the moai arm and give them type $96.
  //
  // WHAT THIS CANNOT REACH, and it is the honest half of the check: $19 >= 3
  // cannot get here through spawnEngine, because runEngine's own stage guard
  // ($A2F0, "stage-4+ wave content out of scope") throws one call earlier. So
  // the equality is pinned from BELOW only -- $19 = 0 and 1. The stage-5 side
  // ($19 = 4, the four sun/eye records) is W32's to pin, from the other side.
  for (const st of [0, 1]) {
    const s = engineAt(0xA9E6, 2);
    s.zp19 = st;
    assert.throws(() => tick(s, 3, 0x40),
      (e) => e.message.includes('$A466 -> $A4A6'),
      `$19 = ${st} must route to $A4A6 and throw`);
  }
});

// ==================== $A46F, the moai spawner ==============================

test('$A46F plants the record\'s bytes as status/Y/nametable-address', () => {
  // $A487 $010C := $64 (cmd - $70) / $A48C $032C := $65 / $A491 $03BC := $66
  // / $A496 $03EC := $67 / $A49B type := $96 / $A4A0 X := $F0.
  // Record $A9E6 = `92 F0 38 21 23`. RED WHEN: any field is transposed, or the
  // $A38D `SBC #$70` is dropped (status would be $F0, variant $0 either way --
  // so the check asserts the whole byte, not the nibble).
  const s = engineAt(0xA9E6, 2);
  tick(s, 3, 0x40);
  const i = 9 + ENEMY_BASE;          // the allocator scans 9..0 and takes 9
  assert.strictEqual(s.obj.type[i], 0x96, 'type $96 -> entry 22 -> $C906');
  assert.strictEqual(s.obj.status[i], 0x80, '$010C = cmd $F0 - $70');
  assert.strictEqual(s.obj.y[i], 0x38, '$032C = record byte 2');
  assert.strictEqual(s.obj.yvel[i], 0x21, '$03BC = the nametable address HIGH');
  assert.strictEqual(s.obj.yvelf[i], 0x23, '$03EC = the nametable address LOW');
  assert.strictEqual(s.obj.x[i], 0xF0, '$036C = $F0');
});

test('$A47A stores 1 into $5D (a STORE, not the $A335 INC)', () => {
  // $A47A LDA #$01 / STA $5D pins $5D at 1 even though $A335's INC already ran
  // this frame. RED WHEN: the store becomes an increment, or is dropped.
  const s = engineAt(0xA9E6, 2);
  s.spawn.z5D = 0x40;                // $A335 INCs this to $41 first
  tick(s, 3, 0x40);
  assert.strictEqual(s.spawn.z5D, 0x01, '$5D is STORED to 1, not incremented');
});

// $A485 STA $69 (sub_$A527's exit accumulator, 0) IS PORTED AND IS NOT PINNED
// HERE, and the reason is a measurement, not an oversight: I could not build a
// state in which $69 is non-zero when $A46F runs. `$A2FE LDA $69 / BNE $A32B`
// diverts the engine into emitMember one branch earlier, so every path that
// reaches $A335 -- and therefore $A37A and $A46F -- has $69 == 0 already, and
// the store is unobservable from outside. What I tried: seeding spawn.z69
// before the tick (the engine emits a squadron member and never reads the
// record) and seeding it mid-record (there is no such moment; fireWave is one
// call). If a producer that sets $69 and then reaches $A46F in the same frame
// is ever found, this is the check to write.

// ==================== $C906, the moai ======================================

/**
 * A moai in slot 21 with the record-$A9E6 fields already planted, and the ship
 * placed INSIDE variant 0's open box: `$C98D` needs shipX + $0A >= moaiX and
 * `$C994` needs shipY - $0A < moaiY, so (moai $60,$60) and (ship $60,$60) open.
 */
function moai(variant = 0, ntHi = 0x21, ntLo = 0x23) {
  const s = createState();
  s.substate = 0x80;
  s.zp19 = 2;
  s.obj.x[0] = 0x60; s.obj.y[0] = 0x60;
  const i = 9 + ENEMY_BASE;
  s.obj.type[i] = 0x96;
  s.obj.status[i] = u8(0x80 + variant);
  s.obj.x[i] = 0x60; s.obj.y[i] = 0x60;
  s.obj.yvel[i] = ntHi; s.obj.yvelf[i] = ntLo;
  return s;
}

test('$C920: the moai will not open while the VRAM queue holds >= 4 bytes', () => {
  // $C920 LDA $0E / CMP #$04 / BCS $C935 -- the SAME four-byte gate $9D87 and
  // $889A use, on the SAME page ($0700 is the queue, not a second buffer).
  // RED WHEN: the gate compares packets instead of bytes, or the threshold moves.
  const s = moai(0);
  s.vram.cursor = 4;
  updateEnemies(s, stage3res);
  assert.strictEqual(s.obj.s0480[9 + ENEMY_BASE], 0, 'still closed');
  assert.strictEqual(s.vram.cursor, 4, 'and it queued nothing');

  const t = moai(0);
  t.vram.cursor = 3;
  updateEnemies(t, stage3res);
  assert.strictEqual(t.obj.s0480[9 + ENEMY_BASE], 0x14, '$048C := $14 -- OPEN');
  assert.ok(t.vram.cursor > 3, 'and it queued a packet');
});

test('$C91C: a wave record firing this frame ($5D != 0) also blocks it', () => {
  // $C91C LDA $5D / BNE $C935. RED WHEN: the $5D gate is dropped -- the moai
  // would then queue on the same frame the spawn engine does.
  const s = moai(0);
  s.spawn.z5D = 1;
  updateEnemies(s, stage3res);
  assert.strictEqual(s.obj.s0480[9 + ENEMY_BASE], 0, 'blocked by $5D');
});

test('$C9B0: the OPEN reopen timer is $C936 indexed by the RANK $17', () => {
  // $C936 = 50 4B 46 41 3C 28 1E, seven rows. RED WHEN: the table address is
  // wrong, or the index is something other than $17.
  const rows = [0x50, 0x4B, 0x46, 0x41, 0x3C, 0x28, 0x1E];
  for (let rank = 0; rank < 7; rank++) {
    const s = moai(0);
    s.zp17 = rank;
    updateEnemies(s, stage3res);
    assert.strictEqual(s.obj.s04A0[9 + ENEMY_BASE], rows[rank],
      `rank ${rank}: $04AC := $C936[${rank}]`);
  }
});

test('$C948: the CLOSE arm reloads the SAME rank-indexed timer', () => {
  // A SEPARATE CHECK ON PURPOSE. $C948 and $C9B0 are two `LDY $17 / LDA $C936,Y`
  // pairs in two different arms, and the first mutation run proved the point:
  // dropping the rank index from the CLOSE arm alone reddened NOTHING, because
  // the only timer test went through the OPEN arm. RED WHEN: the close arm's
  // index is dropped, or it reloads a constant.
  const rows = [0x50, 0x4B, 0x46, 0x41, 0x3C, 0x28, 0x1E];
  for (let rank = 0; rank < 7; rank++) {
    const s = moai(0);
    s.zp17 = rank;
    s.obj.s0480[9 + ENEMY_BASE] = 0x14;      // already open -> $C93D closes it
    updateEnemies(s, stage3res);
    assert.strictEqual(s.obj.s04A0[9 + ENEMY_BASE], rows[rank],
      `rank ${rank}: $C948 $04AC := $C936[${rank}]`);
  }
});

test('$C9BA: OPEN queues $CA29[variant*4]; CLOSE queues the same row + $10', () => {
  // $C9B6 ASL / ASL (open) against $C950 ASL / ASL / ADC #$10 (close), then
  // $C9E3 LDA $CA29,X / $C9EA LDA $CA2A,X. The variant-0 open row is
  // $CA29 = 00 8F 00 90 -- third byte zero, so a SECOND packet follows.
  // RED WHEN: the +$10 is missing (open and close would draw the same tiles),
  // or the third-byte test is inverted.
  const open = moai(0);
  updateEnemies(open, stage3res);
  assert.deepStrictEqual(Array.from(open.vram.q.slice(0, open.vram.cursor)),
    [0x01, 0x21, 0x23, 0x00, 0x8F, 0xFF,          // packet 1: the two tiles
     0x01, 0x21, 0x43, 0x90, 0xFF],               // packet 2: +$20, one tile
    'the OPEN packets for variant 0');

  const close = moai(0);
  close.obj.s0480[9 + ENEMY_BASE] = 0x14;   // already open
  updateEnemies(close, stage3res);
  assert.strictEqual(close.vram.q[3], rom.read(0xCA29 + 0x10),
    'the CLOSE tile is $CA29[$10], not $CA29[0]');
  assert.strictEqual(close.obj.s0480[9 + ENEMY_BASE], 0, '$048C := 0');
  assert.strictEqual(close.obj.s0460[9 + ENEMY_BASE], 0, '$046C (hits) := 0');
});

test('$C9CB: variant 2 draws ONE COLUMN LEFT (address low byte - 1)', () => {
  // $C9CB LDA $A9 / CMP #$02 / BNE $C9DA / $C9D1 SBC #$01. Only variant 2.
  // RED WHEN: the -1 is applied to every variant, or to none.
  const v2 = moai(2, 0x23, 0x2C);
  // Variant 2's box is the MIRROR of variant 0's: $C97B needs shipX - $0A >=
  // moaiX, so the ship has to be to the RIGHT. moai X is $60.
  v2.obj.x[0] = 0x80;
  updateEnemies(v2, stage3res);
  assert.strictEqual(v2.vram.q[2], 0x2B, 'variant 2: low byte $2C - 1');
  const v0 = moai(0, 0x23, 0x2C);
  updateEnemies(v0, stage3res);
  assert.strictEqual(v0.vram.q[2], 0x2C, 'variant 0: the low byte unchanged');
});

test('$C90F: three hits routes to $C77C -- score, sound, explosion, $5F', () => {
  // $C90F LDA $046C,X / CMP #$03 / BCS $C916 -> JMP $C77C, and $C77C ends by
  // turning the slot into explosion type $02 via $CB2B. RED WHEN: the threshold
  // is not 3, or $C77C is not reached (the moai would sit at 3 hits forever).
  const s = moai(0);
  s.obj.s0460[9 + ENEMY_BASE] = 3;
  updateEnemies(s, stage3res);
  const i = 9 + ENEMY_BASE;
  assert.strictEqual(s.obj.type[i], 0x02, '$CB45: the slot becomes explosion 2');
  assert.strictEqual(s.obj.animFrame[i], 0x02, '$CB4A: explosion script 2');
  assert.strictEqual(s.zp5F, 1, '$C77C INC $5F');
  assert.ok(s.vram.cursor > 0, 'and the rubble packets were queued');
});

test('$C784: the TENTH moai destroyed sets $39 -- the stage-3 warp', () => {
  // $C77E LDA $5F / CMP #$0A / BCC $C788 / $C784 LDA #$01 / STA $39.
  // It is a STORE of 1, not the `INC $39` the hatches and the boss use.
  // RED WHEN: the threshold is not $0A, or the compare is inverted.
  const nine = moai(0);
  nine.zp5F = 8;                    // -> 9 after the INC
  nine.obj.s0460[9 + ENEMY_BASE] = 3;
  updateEnemies(nine, stage3res);
  assert.strictEqual(nine.zp39, 0, 'nine moai do not open the warp');

  const ten = moai(0);
  ten.zp5F = 9;                     // -> 10
  ten.obj.s0460[9 + ENEMY_BASE] = 3;
  updateEnemies(ten, stage3res);
  assert.strictEqual(ten.zp39, 1, 'the tenth sets $39 := 1');
});

test('sub_$C822: variant 0 punches $0F and $00 into the $0500 collision map', () => {
  // $C838-$C847 derive the map pointer from the nametable address; $C87B holds
  // the two five-entry offset runs. For NT $2123: page 5, $9A = $1A, so $0F
  // lands at $051A/$0522/$052A/$0532/$053A and $00 at +7 of each.
  // RED WHEN: the <<3, the ROL's carried bits, or the page bit ($03BC AND $04)
  // is wrong -- the moai would erase somebody else's terrain.
  const s = moai(0, 0x21, 0x23);
  s.coll.fill(0xAA);
  s.obj.s0460[9 + ENEMY_BASE] = 3;
  updateEnemies(s, stage3res);
  for (const off of [0x00, 0x08, 0x10, 0x18, 0x20]) {
    assert.strictEqual(s.coll[0x1A + off], 0x0F, `$051A+$${off.toString(16)} = $0F`);
  }
  for (const off of [0x07, 0x0F, 0x17, 0x1F, 0x27]) {
    assert.strictEqual(s.coll[0x1A + off], 0x00, `$051A+$${off.toString(16)} = $00`);
  }
  assert.strictEqual(s.coll[0x19], 0xAA, 'and nothing outside the two runs moved');
});

test('sub_$C822: variants 1 and 3 write NOTHING ($C853 RTS)', () => {
  // $C84B LDA $A9 / BEQ $C854 / CMP #$02 / BEQ $C86F / $C853 RTS. The odd
  // variants are the moai's other halves and share the even one's cells.
  // RED WHEN: the RTS becomes a fall-through into $C854.
  for (const v of [1, 3]) {
    const s = moai(v, 0x21, 0x23);
    s.coll.fill(0xAA);
    s.obj.s0460[9 + ENEMY_BASE] = 3;
    updateEnemies(s, stage3res);
    assert.ok(s.coll.every((b) => b === 0xAA),
      `variant ${v} must not touch the collision map`);
  }
});

// ==================== $B7A1, the chaser ====================================

/** A type-$97 chaser in slot 21. */
function chaser(px = 0x20, py = 0x60) {
  const s = createState();
  s.substate = 0x80;
  s.zp19 = 2;
  // $84D9 compares the score's HIGH byte against $2A,X, and createState leaves
  // that threshold at 0 -- so ANY score awards an extra life and pushes sfx $36
  // ahead of the one under test. state.js records $02 as the measured seed of
  // every scenario; using it keeps the sfx log to the death sound alone.
  s.extraLife[0] = 0x02;
  s.obj.x[0] = px; s.obj.y[0] = py;
  const i = 9 + ENEMY_BASE;
  s.obj.type[i] = 0x97;
  s.obj.x[i] = 0xC0; s.obj.y[i] = 0x60;
  return s;
}

test('$B7A8 writes $0460 at the RAW slot index; $B836 reads $046C at +$0C', () => {
  // THE ALIAS TRAP. `$B7A8 STA $0460,X` with X = $A8 is s0460[j] -- the
  // COLLISION BOX CLASS -- while `$B836 LDA $046C,X` with the same X is
  // s0460[j + $0C], the HIT ACCUMULATOR. Getting them confused makes the
  // chaser either unhittable or invincible and nothing throws.
  // RED WHEN: $B7A8 is written to s0460[i] instead of s0460[j].
  const s = chaser();
  s.obj.s0460[9] = 0;                       // the box class
  s.obj.s0460[9 + ENEMY_BASE] = 0;          // the hit accumulator
  updateEnemies(s, stage3res);
  assert.strictEqual(s.obj.s0460[9], 0x01, '$0460,X (raw index) = the box class');
  assert.strictEqual(s.obj.s0460[9 + ENEMY_BASE], 0x00,
    '$046C,X (index + $0C) is the hit count and $B7A1 must not touch it');
});

test('$B846: the charge advances by 1, or by 2 while the mouth is open', () => {
  // $B846 INC $03BC,X / $B849 LDA $048C,X / BEQ $B851 / $B84E INC $03BC,X.
  // RED WHEN: the second INC is unconditional or missing.
  const shut = chaser();
  updateEnemies(shut, stage3res);
  assert.strictEqual(shut.obj.yvel[9 + ENEMY_BASE], 1, 'closed: +1');
  const open = chaser();
  open.obj.s0480[9 + ENEMY_BASE] = 1;
  updateEnemies(open, stage3res);
  assert.strictEqual(open.obj.yvel[9 + ENEMY_BASE], 2, 'open: +2');
});

test('$B834: at $03BC >= $B787[rank] it FIRES, alternating open and shut', () => {
  // $B82E LDA $03BC,X / CMP $B787,Y / BCS $B85A, then $B85A picks: mouth
  // already open -> just close; shut -> open and emit up to three bullets from
  // $B8E6/$B8E9/$B8EC. RED WHEN: the rank row, the >= test, or the open/shut
  // arm selection is inverted.
  const s = chaser();
  s.zp17 = 0;                                // $B787[0] = $3C
  s.obj.yvel[9 + ENEMY_BASE] = 0x3C;
  s.obj.s0480[9 + ENEMY_BASE] = 0;           // shut -> fire
  updateEnemies(s, stage3res);
  assert.strictEqual(s.obj.s0480[9 + ENEMY_BASE], 1, '$048C := 1 (opened)');
  const bullets = [];
  for (let k = 22; k <= 31; k++) if (s.obj.anim[k] !== 0) bullets.push(k);
  assert.strictEqual(bullets.length, 3, 'three bullet slots filled');
  for (const k of bullets) {
    assert.strictEqual(s.obj.anim[k], 0x7A, '$B8CD metasprite $7A');
    assert.strictEqual(s.obj.type[k], 0x02, '$B8C8 type 2');
    assert.strictEqual(s.obj.xvel[k], 0x01, '$BD2F xvel := 1');
    assert.strictEqual(s.obj.xvelf[k], 0x40, '$BD2C stored the caller\'s A = $40');
  }
  // The three muzzle rows: $B8E6 = 00 A0 A0 is the Y-velocity FRACTION and
  // $B8EC = 00 01 00 the direction, so the middle bullet differs from the two
  // outer ones. The scan runs Y = 9..0 and takes the first three, i.e. slots
  // 9, 8, 7 -> port indices 31, 30, 29, filled in the loop order Y = 2, 1, 0.
  assert.deepStrictEqual(bullets.map((k) => s.obj.yvelf[k]), [0xA0, 0xA0, 0x00]);
  assert.deepStrictEqual(bullets.map((k) => s.obj.s0460[k]), [0x00, 0x01, 0x00]);

  // and the very next fire frame only CLOSES it
  const shut = chaser();
  shut.zp17 = 0;
  shut.obj.yvel[9 + ENEMY_BASE] = 0x3C;
  shut.obj.s0480[9 + ENEMY_BASE] = 1;        // already open
  updateEnemies(shut, stage3res);
  assert.strictEqual(shut.obj.s0480[9 + ENEMY_BASE], 0, '$B85F $048C := 0');
  assert.strictEqual(shut.obj.yvel[9 + ENEMY_BASE], 0, '$B864 $03BC := 0');
  assert.ok(shut.obj.anim.slice(22, 32).every((v) => v === 0), 'no bullets');
});

test('$B836: at $046C >= $B852[rank] the chaser dies for +$0300 and sfx $0C', () => {
  // $B852 = 02 03 04 05 06 07 08 08. RED WHEN: the rank row is wrong, the test
  // is `>` instead of `>=`, or the score/sound pair is dropped.
  const s = chaser();
  s.zp17 = 0;                                // needs 2 hits
  s.obj.s0460[9 + ENEMY_BASE] = 2;
  updateEnemies(s, stage3res);
  const i = 9 + ENEMY_BASE;
  assert.strictEqual(s.obj.type[i], 0x02, 'it became explosion type 2');
  assert.deepStrictEqual(s.sfx, [0x0C], '$CB28 JSR $EC1E with A = $0C');
  // $844F is `LDA #$03 / BNE $8455`, i.e. $9A := 3 and A := 0 -> +$0300 BCD on
  // the 3-byte score. RED WHEN: $845B (+$0050) is called instead.
  assert.strictEqual(s.score[1], 0x03, 'the middle score byte carries the $03');

  const alive = chaser();
  alive.zp17 = 0;
  alive.obj.s0460[9 + ENEMY_BASE] = 1;
  updateEnemies(alive, stage3res);
  assert.strictEqual(alive.obj.type[9 + ENEMY_BASE], 0x97, 'one hit is not enough');
});

test('$B7C4: the BACK-OFF arm needs the ship AT OR RIGHT of the chaser', () => {
  // $B7C4 LDA $0360 / CMP $036C,X / BCC $B7DF -- the player being LEFT of the
  // enemy is the CHASE case, so the "slide right 2 px" arm only runs after the
  // enemy has overshot past the ship. It spawns at $F0 ($C6C4), so on a normal
  // approach this arm never runs; it is the back-off.
  // RED WHEN: the comparison is inverted, or either INC at $B7D6/$B7D9 is lost.
  const s = chaser(0xF8);                    // ship RIGHT of it -> back off
  s.obj.x[9 + ENEMY_BASE] = 0xEF;
  updateEnemies(s, stage3res);
  assert.strictEqual(s.obj.x[9 + ENEMY_BASE], 0xF1, '$B7D6/$B7D9: two INCs');
  assert.strictEqual(s.obj.s04C0[9 + ENEMY_BASE], 1, '$B7CC INC $04CC');
  updateEnemies(s, stage3res);
  assert.strictEqual(s.obj.x[9 + ENEMY_BASE], 0xF1,
    '$B7CF CMP #$F0 / BCS $B7F6: at $F0 or past it the slide stops');
  assert.strictEqual(s.obj.s04C0[9 + ENEMY_BASE], 2, 'but $04CC keeps counting');

  // and once $04CC reaches $28 the back-off stops even with the ship right of it
  const done = chaser(0xF8);
  done.obj.x[9 + ENEMY_BASE] = 0x80;
  done.obj.s04C0[9 + ENEMY_BASE] = 0x28;
  updateEnemies(done, stage3res);
  assert.ok(done.obj.x[9 + ENEMY_BASE] < 0x80,
    '$B7BD CMP #$28 / BCS $B7DF: it chases left instead');
});

// ==================== $B402 / $B434, the shared pair ========================

/** One enemy of `type` in slot 21. */
function one(type) {
  const s = createState();
  s.substate = 0x80;
  s.zp19 = 2;
  s.obj.x[0] = 0x50; s.obj.y[0] = 0x60;
  const i = 9 + ENEMY_BASE;
  s.obj.type[i] = type;
  s.obj.x[i] = 0xA0; s.obj.y[i] = 0x40;
  return s;
}

test('loc_$B407: both entries share one init -- $04AC := 0 and $B212\'s arc seed', () => {
  // $B402 BMI $B412 / $B434 BPL $B407 -- opposite branches onto the SAME body.
  // $B212 LDA #$20 / STA $048C then $B22E LDA #$02 / $B1B1 seeds the arc.
  // RED WHEN: either handler grows its own init, or $B212 is not shared.
  for (const t of [0x0D, 0x0E]) {
    const s = one(t);
    updateEnemies(s, stage3res);
    const i = 9 + ENEMY_BASE;
    assert.strictEqual(s.obj.type[i], u8(0x80 + t), '$B0B4 set the initialised bit');
    assert.strictEqual(s.obj.s04A0[i], 0, '$B40A $04AC := 0');
    assert.strictEqual(s.obj.s0480[i], 0x20, '$B212 $048C := $20');
    assert.strictEqual(s.obj.yvel[i], 0x02, '$B1B1 yvel := 2');
    assert.strictEqual(s.obj.xvel[i], 0xFE, '$B1BC xvel := $FE');
  }
});

test('$B402 rises ($B1DA) while $B434 falls ($B1F1) -- the tails are the enemies', () => {
  // $B42C JMP $B1DA does `subY16` (Y decreasing) and $B456 JMP $B1F1 does
  // `addY16` (Y increasing). Same schedule, mirrored vertical.
  // RED WHEN: either tail is pointed at the other's mover.
  const up = one(0x8D);
  up.obj.s0480[9 + ENEMY_BASE] = 0x20;
  up.obj.yvel[9 + ENEMY_BASE] = 0x02;
  updateEnemies(up, stage3res);
  assert.strictEqual(up.obj.y[9 + ENEMY_BASE], 0x3E, '$B402: Y -= 2 (rises)');

  const down = one(0x8E);
  down.obj.s0480[9 + ENEMY_BASE] = 0x20;
  down.obj.yvel[9 + ENEMY_BASE] = 0x02;
  updateEnemies(down, stage3res);
  assert.strictEqual(down.obj.y[9 + ENEMY_BASE], 0x42, '$B434: Y += 2 (falls)');
});

test('$B415/$B43C: the direction comes from the five-entry schedule at $B42F/$B45C', () => {
  // Both tables are 00 00 00 01 01 -- three arcs left, two right. RED WHEN: the
  // table address is wrong (the two are byte-identical, so swapping them is
  // invisible; the INDEX being $04AC is what this pins).
  for (const [t, addr] of [[0x8D, 0xB42F], [0x8E, 0xB45C]]) {
    for (let y = 0; y < 5; y++) {
      const s = one(t);
      s.obj.s04A0[9 + ENEMY_BASE] = y;
      s.obj.yvel[9 + ENEMY_BASE] = 0x02;     // positive: no arc advance
      updateEnemies(s, stage3res);
      assert.strictEqual(s.obj.s0460[9 + ENEMY_BASE], rom.read(addr + y),
        `type $${t.toString(16)} arc ${y}`);
    }
  }
});

test('$B420: the arc advances only once yvel is negative AND past $FE', () => {
  // $B420 BPL $B42C / $B422 CMP #$FE / BCS $B42C / $B426 INC $04AC.
  // RED WHEN: the $FE bound moves, or the sign test is dropped.
  const cases = [[0x02, 0], [0xFF, 0], [0xFE, 0], [0xFD, 1]];
  for (const [yv, advanced] of cases) {
    const s = one(0x8D);
    s.obj.yvel[9 + ENEMY_BASE] = yv;
    updateEnemies(s, stage3res);
    assert.strictEqual(s.obj.s04A0[9 + ENEMY_BASE], advanced,
      `yvel $${yv.toString(16)}: $04AC ${advanced ? 'advances' : 'holds'}`);
  }
});

// ==================== $B4FD, entry 28 ======================================

test('loc_$B502: the init is $048C := $80 and $04AC := $14', () => {
  // The body stage 5's $B559 shares ($B55C BPL $B502). RED WHEN: either
  // constant moves -- $B559 would inherit the error in W32.
  const s = one(0x1C);
  updateEnemies(s, stage3res);
  const i = 9 + ENEMY_BASE;
  assert.strictEqual(s.obj.type[i], 0x9C, '$B0B4');
  assert.strictEqual(s.obj.s0480[i], 0x80, '$B505 $048C := $80');
  assert.strictEqual(s.obj.s04A0[i], 0x14, '$B50A $04AC := $14');
});

test('$B51B: the four phases -- countdown, pick, fall, rise', () => {
  // $B51E/$B521/$B524/$B527 -- a DEY ladder, so the phases are 0,1,2,3 and
  // anything >= 4 is the settled state that does nothing.
  // RED WHEN: the ladder is off by one, or phase 1's BCS is inverted.
  const i = 9 + ENEMY_BASE;

  // phase 0: $04AC counts down; at 0 it becomes phase 1
  const p0 = one(0x9C);
  p0.obj.s0460[i] = 0; p0.obj.s04A0[i] = 2;
  updateEnemies(p0, stage3res);
  assert.strictEqual(p0.obj.s04A0[i], 1, '$B52A DEC $04AC');
  assert.strictEqual(p0.obj.s0460[i], 0, 'still phase 0');
  updateEnemies(p0, stage3res);
  assert.strictEqual(p0.obj.s0460[i], 1, '$B532 phase := 1');

  // phase 1: at or below the ship -> 2 (fall); above it -> 3 (rise)
  const below = one(0x9C);
  below.obj.s0460[i] = 1; below.obj.y[i] = 0x80; below.obj.y[0] = 0x40;
  updateEnemies(below, stage3res);
  assert.strictEqual(below.obj.s0460[i], 2, 'enemy Y >= ship Y -> phase 2');
  const above = one(0x9C);
  above.obj.s0460[i] = 1; above.obj.y[i] = 0x20; above.obj.y[0] = 0x40;
  updateEnemies(above, stage3res);
  assert.strictEqual(above.obj.s0460[i], 3, 'enemy Y < ship Y -> phase 3');

  // phase 2 settles to 4 only on an EXACT Y match ($B54F BEQ)
  const settle = one(0x9C);
  settle.obj.s0460[i] = 2; settle.obj.y[i] = 0x40; settle.obj.y[0] = 0x40;
  updateEnemies(settle, stage3res);
  assert.strictEqual(settle.obj.s0460[i], 4, '$B552 phase := 4');

  // phase >= 4: $B529 RTS, nothing changes but the one-pixel walk
  const done = one(0x9C);
  done.obj.s0460[i] = 4; done.obj.x[i] = 0x80;
  updateEnemies(done, stage3res);
  assert.strictEqual(done.obj.x[i], 0x7F, '$B515 DEC $036C still runs');
  assert.strictEqual(done.obj.s0460[i], 4, 'and the phase is final');
});
