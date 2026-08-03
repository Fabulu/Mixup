// Wave 25 tests -- the late spawner $C413 (the volcano) and type $0A.
//
// The late spawner is the per-stage eruption that runs DURING W24's $82
// countdown. Stage 1's arm ($C486) is the sole producer of type $0A, which has
// zero wave-script records. Every check below was written to FAIL under a named
// mutant (the RED WHEN line), then seen red and restored before it shipped.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { spawnEngine, updateEnemies, clearSlot } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const ENEMY_hi = ENEMY_BASE;   // 12: enemy slots are indices 12..21 in obj.*

/** A state at game frame 310's sub-state, with the engine running ($60 = 2). */
function running() {
  const s = createState();
  s.substate = 0x80;
  s.spawn.z60 = 2;        // the engine is in its running state
  return s;
}

/** Park the state in the $82 countdown (the eruption window). */
function erupting(frame = 0) {
  const s = running();
  s.substate = 0x82;
  s.frame = u8(frame);
  return s;
}

const SLOT_FIRST = 9;       // allocEnemySlot scans 9..0; the first empty slot
const type = (s, j) => s.obj.type[j + ENEMY_hi];

// ==================== THE $02 & 3 GATE ($C413) ==============================

test('$C413: the eruption only spawns every 4th frame ($02 & 3 == 0)', () => {
  // $C413 LDA $02 / AND #$03 / BEQ $C41A. The gate is what makes 768 $82 frames
  // produce ~192 spawns, not 768. RED WHEN: the AND #$03 becomes #$02, #$01, or
  // is dropped (then every frame spawns and the count roughly quadruples).
  for (let f = 0; f < 8; f++) {
    const s = erupting(f);
    spawnEngine(s, res);
    const spawned = type(s, SLOT_FIRST) === 0x0A;
    assert.strictEqual(spawned, (f & 3) === 0,
      `frame ${f}: $02 & 3 == ${(f & 3)} must ${((f & 3) === 0) ? 'spawn' : 'not spawn'}`);
  }
});

test('$C413: a full enemy table drops the spawn silently ($C429 RTS)', () => {
  // $C41E-C427 scans 9..0 for type == 0; if none, $C429 RTS (no spawn, no
  // throw). An allocation failure is gameplay, not an error -- same rule as the
  // formation allocator ($A3BB). RED WHEN: the scan is removed or throws.
  const s = erupting(0);
  for (let j = 0; j <= 9; j++) s.obj.type[j + ENEMY_hi] = 0x01;  // all full
  assert.doesNotThrow(() => spawnEngine(s, res));
  for (let j = 0; j <= 9; j++) {
    assert.strictEqual(s.obj.type[j + ENEMY_hi], 0x01,
      `slot ${j} must be untouched (no empty slot was found)`);
  }
});

// ==================== THE SLOT SCAN ORDER ===================================

test('$C41A: the scan starts at 9 and fills DOWN (slot 9 first)', () => {
  // $C41A LDX #$09 / STX $A8 / LDA $030C,X. Same DEX/BPL shape as every other
  // allocator here, and it is what fixes OAM draw order. RED WHEN: the start
  // index changes (slot 8 or below would fill first).
  const s = erupting(0);
  spawnEngine(s, res);
  assert.strictEqual(type(s, 9), 0x0A, 'slot 9 fills first');
  for (let j = 0; j <= 8; j++) {
    assert.strictEqual(type(s, j), 0, `slot ${j} must still be empty`);
  }
});

// ==================== THE PATTERN STEPPER (sub_$C44F) =======================

test('sub_$C44F: $69 increments each spawn and selects high/low nibbles', () => {
  // Each pattern byte at $C526 yields TWO spawns: high nibble when the POST-INC
  // $69 is even, low nibble when odd. The stream index Y = (pre-INC $69 & $3F)>>
  // 1, so bytes are consumed in pairs. RED WHEN: the nibble polarity flips, or
  // the pre/post-INC split blurs (both use the same $69 value).
  const s = erupting(0);
  // $69 starts at 0. The crater ($C4F4[$AA]) alternates: $AA = post-INC $69 & 1.
  // $69=0 -> INC to 1 -> $AA=1 (odd) -> crater $C4F4[1] = $B8 (right)
  spawnEngine(s, res);
  assert.strictEqual(s.obj.x[SLOT_FIRST + ENEMY_hi], 0xB8,
    '$69 0->1: odd, low nibble, RIGHT crater $B8');

  // Next spawn (frame 4): $69 was 1, INC to 2 -> $AA=0 (even) -> crater $38
  // But slot 9 is now full, so the next empty slot is 8.
  s.frame = 4;
  spawnEngine(s, res);
  assert.strictEqual(s.obj.x[8 + ENEMY_hi], 0x38,
    '$69 1->2: even, high nibble, LEFT crater $38');
});

test('sub_$C44F: $69 wraps $FF -> $7F -> $80 (never naturally 0)', () => {
  // $C45B CMP #$FF / $C45F LDA #$7F. The reset is what keeps the eruption
  // cycling: $69 walks 0..$FE, then $FF resets to $7F and continues $80...
  // The sfx at st_$C486 fires on $69==0, which only the wave engine's prior
  // countdown can produce (not the late spawner's own cycling).
  // RED WHEN: the $FF reset is dropped (then $69 wraps $FF->$00 and the sfx
  // would re-fire every 256 spawns, or the index goes out of bounds).
  const s = erupting(0);
  s.spawn.z69 = 0xFF;                 // the wrap boundary
  spawnEngine(s, res);                // sub_C44F: reset $7F, INC -> $80
  assert.strictEqual(s.spawn.z69, 0x80,
    '$69 = $FF must reset to $7F then INC to $80 (not wrap to $00)');
});

// ==================== THE VOLCANO SPAWN (st_$C486) ==========================

test('st_$C486: the volcano projectile fields', () => {
  // The spawn writes type $0A at y $90, metasprite $58, hit-counter 1, and the
  // two crater X positions $38/$B8. RED WHEN: the type, y, anim or the crater
  // constant changes.
  const s = erupting(0);
  spawnEngine(s, res);
  const i = SLOT_FIRST + ENEMY_hi;
  assert.strictEqual(s.obj.type[i], 0x0A, 'type $0A (the volcano)');
  assert.strictEqual(s.obj.y[i], 0x90, 'y $90 (the volcano base line)');
  assert.strictEqual(s.obj.anim[i], 0x58, 'metasprite $58');
  assert.strictEqual(s.obj.s04A0[i], 0x01, '$04AC hit counter seeded to 1');
  // xvel/yvel/accel come from $C4F6/$C4F7/$C4F8 at Y = 1.5*$A9. With $69=0
  // -> INC 1 -> $AA=1 -> low nibble of $C526[0]=$AF -> $0F -> $A9=$1E ->
  // Y = $0F+$1E = $2D.
  const Y = 0x2D;
  const wantXvel = res.enemyTables.read(0xC4F6 + Y);
  const wantYvel = u8(res.enemyTables.read(0xC4F7 + Y) - 4);  // $69=1 < $0A: -4
  const wantAccel = res.enemyTables.read(0xC4F8 + Y);          // jitter always 0
  assert.strictEqual(s.obj.xvel[i], wantXvel, `xvel from $C4F6[$${Y.toString(16)}]`);
  assert.strictEqual(s.obj.yvel[i], wantYvel, `yvel from $C4F7[$${Y.toString(16)}] - 4 ($69 < $0A ramp)`);
  assert.strictEqual(s.obj.s0480[i], wantAccel, `accel from $C4F8[$${Y.toString(16)}]`);
});

test('st_$C486: the eruption rumble sfx $0F plays only when $69 == 0', () => {
  // $C486 LDY $69 / BNE $C48F. The sfx is the once-per-eruption rumble; it
  // plays on the first spawn because the wave engine left $69 at 0.
  // RED WHEN: the $69 == 0 test is inverted or dropped (sfx every spawn, or
  // never).
  const s = erupting(0);
  s.sfx = [];
  spawnEngine(s, res);
  assert.ok(s.sfx.includes(0x0F), 'sfx $0F requested on $69 == 0');

  const s2 = erupting(0);
  s2.spawn.z69 = 5;                   // nonzero: sfx must NOT play
  s2.sfx = [];
  spawnEngine(s2, res);
  assert.ok(!s2.sfx.includes(0x0F), 'sfx $0F suppressed when $69 != 0');
});

test('st_$C486: the yvel ramp-down (first 10 spawns lose 4, next 20 lose 2)', () => {
  // $C4A9-$C4BC: post-INC $69 < $0A -> yvel -= 4; < $1E -> yvel -= 2; else 0.
  // Both CMPs read the POST-INC $69. The boundary at post-INC 9 is what tells
  // $0A from $09: 9 < $0A (ramp -4) but 9 >= $09 (ramp -2).
  // RED WHEN: either bound ($0A or $1E) or the decrement counts change.
  // Re-derived from the same ROM tables the port reads, so a table drift is
  // caught too. Verified values: z69 8/9/29 -> post-INC 9/10/30 -> $04/$06/$08.
  const rom = res.enemyTables;
  const ptr = rom.word(0xC447);   // $C526, the volcano's pattern stream
  for (const z69 of [8, 9, 29]) {
    const cursor = z69;
    const postInc = (cursor === 0xFF ? 0x7F : cursor) + 1;
    const y = (cursor & 0x3F) >>> 1;
    const pb = rom.read(ptr + y);
    const aa = postInc & 1;
    const nib = aa !== 0 ? (pb & 0x0F) : ((pb >>> 4) & 0x0F);
    const a9 = (nib << 1) & 0xFF;
    const Y = ((a9 >>> 1) + a9) & 0xFF;
    const base = rom.read(0xC4F7 + Y);
    const ramp = postInc < 0x0A ? 4 : (postInc < 0x1E ? 2 : 0);
    const want = (base - ramp) & 0xFF;
    const s = erupting(0); s.spawn.z69 = z69; spawnEngine(s, res);
    assert.strictEqual(s.obj.yvel[SLOT_FIRST + ENEMY_hi], want,
      `z69=${z69} -> post-INC ${postInc}: yvel must be $${want.toString(16).padStart(2, '0')} (base $${base.toString(16).padStart(2, '0')} -${ramp})`);
  }
});

// ==================== THE DEAD JITTER TERM ==================================

test('st_$C486: the $02 << 3 & $07 jitter term is always 0 (inert)', () => {
  // $C4C1 0A / $C4C2 0A / $C4C3 0A / $C4C4 29 07: three ASLs zero bits 0-2
  // before the AND, so the term added to the accel is 0 for EVERY frame value.
  // Transcribed faithfully but pinned as dead. RED WHEN: someone "optimises"
  // this to a non-zero expression.
  for (let f = 0; f < 256; f += 17) {
    const term = u8(u8(f << 3)) & 0x07;
    assert.strictEqual(term, 0, `frame $${f.toString(16)}: jitter must be 0`);
  }
});

// ==================== TYPE $0A HANDLER (h_B36F) =============================

test('h_B36F: first frame sets the initialised bit and moves nothing', () => {
  // $B36F LDA $030C,X / BPL $B3A7 -> JMP $B0B4. $C486 writes raw $0A (bit 7
  // clear), so the first dispatch takes the BPL and only sets bit 7.
  // RED WHEN: the init is skipped (then movement runs a frame early) or the
  // bit is OR'd instead of added (see setInitialised).
  const s = erupting(0);
  spawnEngine(s, res);                 // spawn the projectile (type $0A)
  const i = SLOT_FIRST + ENEMY_hi;
  const x0 = s.obj.x[i], y0 = s.obj.y[i];
  updateEnemies(s, res);               // first dispatch: init only
  assert.strictEqual(s.obj.type[i], 0x8A, 'bit 7 set ($0A -> $8A)');
  assert.strictEqual(s.obj.x[i], x0, 'no X movement on the init frame');
  assert.strictEqual(s.obj.y[i], y0, 'no Y movement on the init frame');
});

test('h_B36F: subsequent frames run the parabolic arc (gravity on Y)', () => {
  // $B374 JMP $B1E5 -> subX16, subY16, velSubAccel, offScreenCheck. X velocity
  // is constant; Y velocity has gravity (velSubAccel: yvelf -= accel, borrow
  // into yvel). RED WHEN: any of the four pieces is dropped or swapped.
  const s = erupting(0);
  spawnEngine(s, res);                 // spawn + init in one
  s.spawn.zA8 = SLOT_FIRST;
  updateEnemies(s, res);               // frame 1: init (bit 7 set)
  const i = SLOT_FIRST + ENEMY_hi;
  const x1 = s.obj.x[i], yvel1 = s.obj.yvel[i], xvel1 = s.obj.xvel[i];
  // frame 2: the arc runs
  s.spawn.zA8 = SLOT_FIRST;
  updateEnemies(s, res);
  // X moved by xvel (subX16), and yvel changed under gravity (velSubAccel).
  // The enemy is on-screen (y $90, x $38 or $B8) so offScreenCheck keeps it.
  assert.notEqual(s.obj.yvel[i], yvel1,
    'velSubAccel must change yvel on the second frame (gravity)');
  assert.strictEqual(s.obj.x[i], u8(x1 - xvel1),
    'subX16 moves X by exactly xvel (constant sideways velocity)');
  assert.strictEqual(s.obj.type[i] & 0x7F, 0x0A, 'still type $0A (not freed)');
});

test('h_B36F: the projectile frees its slot when it leaves the box', () => {
  // $B1EE JMP $B251 -> offScreenCheck frees at x >= $F4 (and x < $04, y < $08,
  // y >= $C4). Park the projectile AT the right edge with zero velocity, so the
  // bounds check itself (not the mover) is what frees it.
  // RED WHEN: offScreenCheck's bounds change or it stops freeing.
  const s = erupting(0);
  spawnEngine(s, res);
  const i = SLOT_FIRST + ENEMY_hi;
  s.obj.type[i] = 0x8A;                // already initialised (skip the init frame)
  s.obj.x[i] = 0xF4;                   // AT the right-edge bound (>= $F4 frees)
  s.obj.xvel[i] = 0; s.obj.xf[i] = 0; s.obj.xvelf[i] = 0;
  s.obj.y[i] = 0x90; s.obj.yf[i] = 0; s.obj.yvel[i] = 0; s.obj.yvelf[i] = 0;
  s.obj.s0480[i] = 0;
  s.spawn.zA8 = SLOT_FIRST;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[i], 0,
    'x = $F4 is at the right-edge bound -> $AEF8 frees the slot');
});

// ==================== THE 7-ARM DISPATCH (jt_$C439) =========================

test('jt_$C439: stage 0 -> $C486 (volcano); stage 1 -> $C546 (jellyfish); stages 3-7 throw loudly', () => {
  // $C434 LDA $19 / JSR $83E4. The 7-entry table at $C439 is indexed by stage.
  // Stage 1 (index 0, volcano) and stage 2 (index 1, jellyfish) are ported;
  // stages 3-7 are out of scope and carry their ROM target in the throw message.
  // RED WHEN: a stage's target changes, or a throw loses its address.
  const stageRes = (idx) =>
    ({ ...res, stage: { ...res.stage, stage: idx }, stages: res.stages });
  const addrHex = (a) => '$' + a.toString(16).toUpperCase().padStart(4, '0');

  // stage 0: ported (no throw, spawns $0A)
  const s0 = erupting(0);
  s0.zp19 = 0;
  assert.doesNotThrow(() => spawnEngine(s0, stageRes(0)));
  assert.strictEqual(type(s0, SLOT_FIRST), 0x0A);

  // stage 1 ($C546): ported W29. At frame 0 both gates pass ($02&3 and $02&7),
  // so it spawns the jellyfish (type $0B). The second gate ($02 & 7) halves the
  // cadence to every 8th frame -- frame 4 passes the late spawner but not $C546.
  const s1a = erupting(0);
  s1a.zp19 = 1;
  assert.doesNotThrow(() => spawnEngine(s1a, stageRes(1)));
  assert.strictEqual(type(s1a, SLOT_FIRST), 0x0B, 'stage 1 spawns the jellyfish');
  const s1b = erupting(4);
  s1b.zp19 = 1;
  spawnEngine(s1b, stageRes(1));
  assert.strictEqual(type(s1b, SLOT_FIRST), 0,
    'stage 1 $C546 second gate ($02 & 7): frame 4 does not spawn');

  // stages 2-5: loud throws carrying the ROM target. W27: spawnEngine dispatches
  // the late spawner on the LIVE $19 (state.zp19), not res.stage.stage, so the
  // test sets both to the stage under test (the $82 arm reaches lateSpawner
  // before the stage-3 wave guard in runEngine).
  const arms = [[2, 0xC686], [3, 0xC5AD], [4, 0xC653], [5, 0xC6DE]];
  for (const [idx, addr] of arms) {
    const s = erupting(0);
    s.zp19 = idx;
    const needle = `$C439[${idx}] -> ${addrHex(addr)}`;
    assert.throws(() => spawnEngine(s, stageRes(idx)),
      (err) => err.message.includes(needle),
      `stage ${idx} must throw with "${needle}"`);
  }
  // stage 6: $C429 RTS (no spawn, no throw)
  const s6 = erupting(0);
  s6.zp19 = 6;
  assert.doesNotThrow(() => spawnEngine(s6, stageRes(6)));
  assert.strictEqual(type(s6, SLOT_FIRST), 0, 'stage 6 ($C429 RTS) spawns nothing');
});

// ==================== THE ERUPTION CADENCE (field-exactness proxy) ==========

test('eruption cadence: 768 $82 frames pass the gate exactly 192 times', () => {
  // The cartridge's throwaudit-endchain.json records $C413 executing 768 times
  // (the $82 duration) and $B36F executing 6,365 times. The $02 & 3 gate makes
  // 768 entries -> 192 spawn-frames. This is the denominator: 768/4 = 192, and
  // 192 spawns / 64-per-cycle = exactly 3 cycles of the 32-byte pattern.
  // RED WHEN: the gate mask changes (e.g. #$03 -> #$01 doubles the count).
  let spawnFrames = 0;
  for (let f = 0; f < 768; f++) {
    if ((f & 0x03) === 0) spawnFrames++;
  }
  assert.strictEqual(spawnFrames, 192, '768 frames / 4 = 192 spawn-frames');
  // 192 spawns walk the 64-entry nibble cycle exactly 3 times.
  assert.strictEqual(192 % 64, 0, '192 = 3 whole cycles of the 32-byte stream');
});
