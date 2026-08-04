// Wave 31 tests -- stage 4 ($19 = 3): the CEILING VOLCANO.
//
// Stage 4's late-spawner arm ($C5AD) is stage 1's ($C486) turned upside down,
// and "it is the same routine" is exactly the assumption that would ship it
// wrong: THREE fields differ (the yvel ramp has one arm not two, the accel
// jitter is live where stage 1's is identically zero, and the crater is on the
// ceiling). Most of this file exists to pin those three apart, so a future
// refactor cannot quietly merge the two arms.
//
// EVERY CHECK BELOW WAS WATCHED TO GO RED under the named mutant on its
// `RED WHEN` line, and src/enemies.js was sha256'd before and after every
// restore. The mutation table is in docs/worklog/gradius/31-impl-stage4.md.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { spawnEngine, updateEnemies } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;
const ENEMY_hi = ENEMY_BASE;
const SLOT_FIRST = 9;              // allocEnemySlot scans 9..0

/** A state parked in stage 4's `$82` countdown -- the eruption window. */
function erupting(frame = 0, stage = 3) {
  const s = createState();
  s.substate = 0x82;               // $A2F7 CMP #$82 -> $A2FB JMP $C413
  s.spawn.z60 = 2;                 // $A2CC DEX / BNE $A2F0 -- the running state
  s.zp19 = stage;                  // $19 -> jt_$C439[$19]
  s.frame = u8(frame);
  return s;
}

const slot = (s, j = SLOT_FIRST) => j + ENEMY_hi;

/** Re-derive one spawn's stepper outputs the way `sub_$C44F` does. */
function stepper(z69, streamPtr) {
  const cursor = z69 === 0xFF ? 0x7F : z69;
  const postInc = u8(cursor + 1);
  const pb = rom.read(streamPtr + ((cursor & 0x3F) >>> 1));
  const aa = postInc & 1;
  const nib = aa !== 0 ? (pb & 0x0F) : ((pb >>> 4) & 0x0F);
  const a9 = u8(nib << 1);
  return { postInc, aa, a9, y: u8((a9 >>> 1) + a9) };
}

// ==================== 1. THE DISPATCH ARM, jt_$C439[3] ======================

test('jt_$C439[3] routes stage 4 to $C5AD, and it no longer throws', () => {
  // $C434 LDA $19 / JSR $83E4 with the inline table at $C439. Entry 3 is the
  // word $C5AD. Before this wave that case was a loud named throw.
  // RED WHEN: the case label is removed, or the table index loses its *2.
  assert.strictEqual(rom.word(0xC439 + 2 * 3), 0xC5AD,
    'fixture: jt_$C439[3] must be $C5AD in the cartridge');
  const s = erupting(0);
  assert.doesNotThrow(() => spawnEngine(s, res));
  assert.strictEqual(s.obj.type[slot(s)], 0x15,
    'stage 4 late spawner must produce a type $15');
});

test('$A2F0: the scope guard admits stage 4, and W32c moved it past stage 5', () => {
  // runEngine's scope guard -- the wall a wave moves forward one stage at a
  // time. THIS IS THE GATE stageledger.py could not see: stage $19=3 read 98/98
  // records for a whole wave while `>= 3` still threw on its first.
  //
  // W32c MOVED IT TO `>= 5`. This check keeps its stage-4 half unchanged (that
  // is what it was written for) and follows the guard forward one stage; the
  // evidence the move rests on is in tests/w32c-interactions.test.js, which
  // owns the assertion about stage 5.
  // RED WHEN: the bound goes back to 4 or 3, or forward to 6.
  // Both states are parked on their stage's chunk-0 stream at scroll $0000,
  // which is a record whose trigger has ALREADY been reached -- so the engine
  // does not merely survive the guard, it fires a real wave record.
  const wave = (stage) => {
    const tbl = rom.word(0xA7D0 + 2 * stage);   // $A2D5 LDA $A7D0,Y
    const ptr = rom.read(tbl) | (rom.read(tbl + 1) << 8);
    const s = createState();
    s.substate = 0x80;                    // the RUNNING state, not $82
    s.spawn.z60 = 2;
    s.zp19 = stage;
    s.spawn.z61 = 0;
    s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
    s.cam.hi = 0; s.cam.lo = 0;
    return s;
  };
  const s3 = wave(3);
  assert.doesNotThrow(() => spawnEngine(s3, res),
    'stage 4 ($19=3) must reach the wave engine');
  assert.strictEqual(s3.obj.type[slot(s3)], 0x05,
    'stage 4\'s first record (@$AAEC, cmd $89) must actually spawn its type $05');
  const s4 = wave(4);
  assert.doesNotThrow(() => spawnEngine(s4, res),
    'stage 5 ($19=4) must reach the wave engine too (W32c)');
  assert.strictEqual(s4.obj.type[slot(s4)], 0x1D,
    'stage 5\'s first record (@$ABB6) must spawn its type $1D -- W32a\'s $B559');
  // W35 MOVED IT TO `>= 6`. Same shape as the two moves before it: the stage
  // this check used to watch throw is now the stage it watches RUN, and the
  // wall is one further on. Stage 6's own evidence lives in
  // tests/w35-stage6.test.js.
  const s5 = wave(5);
  assert.doesNotThrow(() => spawnEngine(s5, res),
    'stage 6 ($19=5) must reach the wave engine now (W35)');
  // W36 MOVED IT TO `>= 7`, past the last stage `$A7D0` has. Stage 7's evidence
  // lives in tests/w36-stage7.test.js. RED WHEN: the bound goes back to 6.
  const s6 = wave(6);
  assert.doesNotThrow(() => spawnEngine(s6, res),
    'stage 7 ($19=6) must reach the wave engine now (W36)');
  assert.strictEqual(s6.obj.type[slot(s6)], 0x05,
    'stage 7\'s first record (@$ACC7, cmd $89) must actually spawn its type $05');
  // ...and $19 = 7 is not a stage: $A7D0 holds SEVEN words, so the guard is
  // still the thing that says so, loudly.
  assert.throws(() => spawnEngine(wave(7), res), /\$A2F0 runEngine/,
    '$19 = 7 is a wrong $19, not a missing port');
});

// ==================== 2. THE STREAM, $C5B8 LDX #$04 =========================

test('$C5B8: X=4 selects the stream at $C633, not the volcano\'s $C526', () => {
  // sub_$C44F reads its pointer from $C447+X, so X=4 lands on $C44B -- the
  // tenth word of jt_$C439. Stage 1's arm uses X=0 ($C526) and stage 2's X=2
  // ($C58D); picking the wrong one desynchronises every position and velocity
  // WITHOUT throwing.
  // RED WHEN: the 4 becomes 0, 2 or 6.
  assert.strictEqual(rom.word(0xC44B), 0xC633, 'fixture: $C447+4 -> $C633');
  const ptr = rom.word(0xC44B);
  // Walk four consecutive spawns and require each x to match $C601[aa] AND
  // each xvel to match the $C633-derived row. The $C526 stream disagrees on
  // the very first spawn ($C526[0] = $AF low nibble $F; $C633[0] = $AF too --
  // so the check is carried by the LATER spawns, which is why four are walked.)
  const s = erupting(0);
  for (let n = 0; n < 4; n++) {
    const z69 = s.spawn.z69;
    const { y } = stepper(z69, ptr);
    s.frame = u8(n * 4);
    spawnEngine(s, res);
    const i = slot(s, SLOT_FIRST - n);
    assert.strictEqual(s.obj.xvel[i], rom.read(0xC603 + y),
      `spawn ${n}: xvel must come from $C603[$${y.toString(16)}] via the $C633 stream`);
  }
});

// ==================== 3. THE THREE DIFFERENCES FROM $C486 ===================

test('$C5F9: the crater is on the CEILING (y $2C), not the floor (y $90)', () => {
  // $C5F9 LDA #$2C / STA $032C,X. Stage 1's $C4DF writes #$90. This one
  // constant is the whole stage: stage 4's volcanoes hang from the roof.
  // RED WHEN: the $2C becomes $90 (or anything else).
  const s = erupting(0);
  spawnEngine(s, res);
  assert.strictEqual(s.obj.y[slot(s)], 0x2C,
    'y must be $2C -- the ceiling. $90 is the stage-1 volcano\'s base line.');
});

test('$C5D0: ONE yvel ramp arm ($69 < $1E), not the volcano\'s two', () => {
  // $C5D2 CMP #$1E / $C5D4 BCS $C5DC / two DECs. $C486 has a SECOND inner arm
  // at $C4B5 ($69 < $0A -> another -2). $C5AD does not, so a spawn at post-INC
  // $69 = 9 loses 2 here and 4 there. That is the discriminator.
  // RED WHEN: a `$69 < $0A` arm is added, or the $1E bound moves, or the
  // decrement count changes.
  const ptr = rom.word(0xC44B);
  for (const z69 of [0, 8, 9, 29, 30, 60]) {
    const { postInc, y } = stepper(z69, ptr);
    const base = rom.read(0xC604 + y);
    const want = u8(base - (postInc < 0x1E ? 2 : 0));
    const s = erupting(0);
    s.spawn.z69 = z69;
    spawnEngine(s, res);
    assert.strictEqual(s.obj.yvel[slot(s)], want,
      `z69=${z69} -> post-INC ${postInc}: yvel must be $${want.toString(16)} `
      + `(base $${base.toString(16)} - ${postInc < 0x1E ? 2 : 0}); a $0A arm `
      + 'would take another 2 off the z69=8 and z69=9 rows');
  }
});

test('$C5DE: the accel jitter is LIVE ($02 & $0F), unlike $C4C1\'s dead one', () => {
  // $C5DC LDA $02 / $C5DE AND #$0F -- no shifts, so the term is $02's low
  // nibble, 0..15. $C4C1's three ASLs clear bits 0-2 before its AND #$07, so
  // stage 1's is identically zero (W25 pinned that). Copying $C486's dead
  // expression here would make every stage-4 rock fall at the table rate.
  // RED WHEN: the AND becomes #$07, or ASLs are added, or the term is dropped.
  const ptr = rom.word(0xC44B);
  const seen = new Set();
  for (const f of [0x00, 0x04, 0x08, 0x0C]) {
    // $C415 AND #$03 / BEQ means this arm only runs when $02 & 3 == 0, so the
    // jitter takes exactly FOUR of its sixteen nominal values -- 0, 4, 8, 12.
    // That is the cartridge's own bound, not a gap in this loop: the board
    // produced those four and no others over 270 spawns (stage4poke.py).
    const s = erupting(f);
    s.spawn.z69 = 0;
    const { y } = stepper(0, ptr);
    spawnEngine(s, res);
    const want = u8((f & 0x0F) + rom.read(0xC605 + y));
    assert.strictEqual(s.obj.s0480[slot(s)], want,
      `frame $${f.toString(16)}: accel = $C605[$${y.toString(16)}] + ${f & 0x0F}`);
    seen.add(s.obj.s0480[slot(s)]);
  }
  assert.ok(seen.size > 1,
    'the jitter must actually VARY across frames -- if every accel is equal '
    + 'the term has been made dead like $C4C1\'s and the check is worthless');
});

// ==================== 4. THE REST OF THE SPAWN ==============================

test('$C5EC/$C5E7/$C5F4: crater X by nibble parity, hit counter, type', () => {
  // $C5EC LDY $AA / LDA $C601,Y -> $38 (left) or $B8 (right); $C5E7 seeds the
  // hit counter to 1; $C5F4 writes the RAW type $15 (bit 7 clear, so $B377's
  // BPL takes the init arm on the first dispatch).
  // RED WHEN: $C601 is indexed by $A9 instead of $AA, the hit counter changes,
  // or the type is written pre-initialised as $95.
  assert.strictEqual(rom.read(0xC601), 0x38, 'fixture: $C601[0] = $38');
  assert.strictEqual(rom.read(0xC602), 0xB8, 'fixture: $C601[1] = $B8');
  const s = erupting(0);
  spawnEngine(s, res);            // $69 0 -> post-INC 1 -> $AA = 1 -> $B8
  assert.strictEqual(s.obj.x[slot(s)], 0xB8, '$69 0->1: odd -> RIGHT crater $B8');
  assert.strictEqual(s.obj.s04A0[slot(s)], 0x01, '$04AC hit counter = 1');
  assert.strictEqual(s.obj.type[slot(s)], 0x15, 'type $15 RAW, bit 7 clear');

  s.frame = 4;
  spawnEngine(s, res);            // $69 1 -> post-INC 2 -> $AA = 0 -> $38
  assert.strictEqual(s.obj.x[slot(s, 8)], 0x38, '$69 1->2: even -> LEFT crater $38');
});

test('$C5AF: the rumble sfx $0F plays only on the first spawn ($69 == 0)', () => {
  // $C5AD LDA $69 / $C5AF BNE $C5B6 -- the same once-per-eruption gate as
  // $C488. RED WHEN: the $69 == 0 test is inverted or dropped.
  const s = erupting(0);
  s.sfx = [];
  spawnEngine(s, res);
  assert.ok(s.sfx.includes(0x0F), 'sfx $0F requested on $69 == 0');

  const s2 = erupting(0);
  s2.spawn.z69 = 5;
  s2.sfx = [];
  spawnEngine(s2, res);
  assert.ok(!s2.sfx.includes(0x0F), 'sfx $0F suppressed when $69 != 0');
});

// ==================== 5. THE SHARED TAIL, loc_$C4E4 =========================

test('$C5FE JMP $C4E4: the tail 281 bytes BACK in the ROM still runs', () => {
  // THE FALL-THROUGH TRAP, this wave's instance. $C5AD's last instruction is a
  // JMP to $C4E4, which sits INSIDE st_$C486 -- earlier in the ROM, with
  // nothing returning to it. Stopping at $C5FE ships a rock with no metasprite
  // and uninitialised velocity fractions, and NOTHING throws.
  // RED WHEN: the loc_C4E4 call is dropped from st_C5AD, or the $3F mask
  // changes, or the anim constant moves off $58.
  const s = erupting(0x24);        // $02 = $24: $02 & 3 == 0 passes the gate
  spawnEngine(s, res);
  const i = slot(s);
  assert.strictEqual(s.obj.anim[i], 0x58, '$C4EE anim = metasprite $58');
  assert.strictEqual(s.obj.xvelf[i], 0x24 & 0x3F, '$C4E4 xvelf = $02 & $3F');
  assert.strictEqual(s.obj.yvelf[i], 0x24 & 0x3F, '$C4EB yvelf = the SAME value');
});

test('loc_$C4E4 is SHARED: stage 1\'s volcano still gets the same tail', () => {
  // The extraction must be behaviour-preserving for $C486, which FALLS INTO
  // $C4E4 rather than jumping. RED WHEN: the factoring drops the call from
  // st_C486, or moves the y write ($C4DF #$90) into the shared tail -- where
  // it would overwrite stage 4's $2C.
  const s = erupting(0x24, 0);     // $19 = 0 -> jt_$C439[0] = $C486
  spawnEngine(s, res);
  const i = slot(s);
  assert.strictEqual(s.obj.type[i], 0x0A, 'stage 1 still spawns type $0A');
  assert.strictEqual(s.obj.y[i], 0x90, 'stage 1 keeps y $90, NOT stage 4\'s $2C');
  assert.strictEqual(s.obj.anim[i], 0x58, 'the shared tail still sets anim $58');
  assert.strictEqual(s.obj.xvelf[i], 0x24 & 0x3F, 'the shared tail still sets xvelf');
});

// ==================== 6. THE HANDLER, $B377 (entry 21) ======================

test('$AE1C[21] is $B377 and dispatch no longer throws on type $15', () => {
  // $83E4's ASL is EIGHT BIT, so types $15 and $95 both index entry 21.
  // RED WHEN: the case label is removed.
  assert.strictEqual(rom.word(0xAE1C + 2 * 21), 0xB377,
    'fixture: entry 21 must be $B377');
  for (const t of [0x15, 0x95]) {
    const s = createState();
    s.obj.type[slot(s)] = t;
    s.obj.status[slot(s)] = 1;
    assert.doesNotThrow(() => updateEnemies(s, res),
      `type $${t.toString(16)} must dispatch to $B377`);
  }
});

test('$B377: the first dispatch only sets bit 7 ($15 -> $95), moving nothing', () => {
  // $B377 LDA $030C,X / $B37A BPL $B3A7 -> JMP $B0B4 (type += $80). $C5AD
  // writes the raw $15, so the first frame is the init frame.
  // RED WHEN: the BPL is inverted, or $B0B4 sets rather than adds $80.
  const s = erupting(0);
  spawnEngine(s, res);                    // spawn a raw $15 in slot 9
  const i = slot(s);
  const y0 = s.obj.y[i], x0 = s.obj.x[i];
  s.obj.status[i] = 0;                    // keep $ADC1's animator out of the way
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[i], 0x95, 'type $15 + $80 = $95');
  assert.strictEqual(s.obj.y[i], y0, 'the init frame must not move it');
  assert.strictEqual(s.obj.x[i], x0, 'the init frame must not move it');
});

test('$B37C JMP $B1FA: the rock FALLS -- Y increases, unlike $B36F\'s rise', () => {
  // This is the only difference between entries 10 and 21, and it is one word:
  //   $B36F -> $B1E5 -> $B184 subX16 / $B140 subY16 / $B120 / $B251
  //   $B377 -> $B1FA -> $B184 subX16 / $B16C addY16 / $B120 / $B251
  // A copy-paste of h_B36F compiles, runs, throws nothing, and sends stage 4's
  // ceiling rocks UP through the roof.
  // RED WHEN: loc_B1FA is swapped for the $B1E5 chain (subY16), or the addY16
  // is dropped.
  const s = erupting(0);
  spawnEngine(s, res);
  const i = slot(s);
  s.obj.status[i] = 0;
  s.obj.type[i] = 0x95;                   // already initialised
  s.obj.y[i] = 0x40; s.obj.yvelf[i] = 0;
  s.obj.yvel[i] = 0x02;                   // +2 px/frame downward
  s.obj.s0480[i] = 0;                     // no gravity, so the sign is unambiguous
  updateEnemies(s, res);
  assert.strictEqual(s.obj.y[i], 0x42,
    'Y must INCREASE ($B1F4 JSR $B16C addY16). $B36F\'s $B140 would give $3E.');
});
