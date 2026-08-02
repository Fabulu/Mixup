// THE ENEMY CODE NOTHING WAS WATCHING.
//
// Wave 3 shipped `games/gradius/src/enemies.js` with a GREEN gate: 110 unit
// tests, 18 oracle scenarios, 5045 compared frames, 0 failures. Two independent
// readers then mutated the source on scratch copies and found that a long list
// of ported routines could be corrupted -- in some cases three ways at once --
// with the entire gate still green. This file is the answer to that list.
//
// The census that explains every one of them. `dispatch()` was instrumented and
// the WHOLE corpus run: over 18 scenarios and 5045 compared frames the handler
// histogram is
//
//     {"$B0AF": 23840, "$B26C": 4053, "$B205": 434}
//
// THREE targets out of the eight that are ported. $AE99, $AEDD and $AEE1 -- the
// explosion player, the power-up capsule and the generic drift -- are reachable
// only from $BE93, the kill routine, which is wave 6. Nothing in stage 1's
// first 1465 frames dies, so nothing in the corpus can see them. They were
// ported (correctly -- both readers walked them against the disassembly
// instruction by instruction) and then left with no check on them at all, which
// per docs/knowledge/03 reads as finished and is not.
//
// The rest of the list is docs/knowledge/03's "it reaches the code but
// interrogates none of its parameters": a constant the scenarios never drive
// across, an arm no measured frame enters, a loop whose direction nothing can
// observe because only one thing was ever in it.
//
// EVERY TEST HERE HAS BEEN SEEN RED. The mutation is named in the comment above
// each one, and the full table -- mutation, site, and the exact test names that
// went red -- is in docs/worklog/gradius/03-test-hardening.md. A test that has
// never been red is decoration.
//
// This file adds NO source changes. Where a break could not be caught it is
// written down in the worklog as an unpinnable constant with the reason, not
// papered over.

import test from 'node:test';
import assert from 'node:assert';

import { createState, ENEMY_BASE } from '../src/state.js';
import { spawnEngine, enemyBullets, updateEnemies } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;

/** A state parked where the cartridge is at game frame 310: engine running. */
function running() {
  const s = createState();
  s.substate = 0x80;                 // $1B, the play sub-state
  s.spawn.z60 = 2;                   // $60 = 2, measured at game frame 310
  s.obj.y[0] = 96;                   // the player, which the fan homes on
  s.obj.x[0] = 80;
  return s;
}

const cursor = (s) => s.spawn.z6A | (s.spawn.z6B << 8);

/**
 * A slot holding a type-2 explosion sitting on the LAST byte of script 0.
 *
 * MEASURED off the cartridge, not assumed: the six pointers at $AE71 are
 * $AE7D $AE81 $AE8C $AE86 $AE8B $AE92, and the stream at $AE7D is
 * `26 27 28 00`. So $042C,X = 3 is the frame the terminator is read on.
 */
function explosionAtTerminator(s, j, carrier) {
  const i = j + ENEMY_BASE;
  s.obj.type[i] = 0x82;              // entry 2 of $AE1C -> $AE99 (MEASURED)
  s.obj.status[i] = 0;               // $ADEA BEQ: no auto-animation
  s.obj.timer[i] = 0;                // $AE9C: due this frame
  s.obj.animFrame[i] = 0;            // script 0
  s.obj.xvel[i] = 3;                 // $042C,X -- the script cursor, on the $00
  s.obj.carrier[i] = carrier;        // $03AC,X
  s.obj.x[i] = 0x80;
}

// ===================== $AE99, THE EXPLOSION SCRIPT PLAYER ===================
// Dispatched ZERO times in all 18 scenarios. The reviewer corrupted it three
// ways SIMULTANEOUSLY (timer 5 -> 99, the gold mask $0F -> $03, the cursor
// frozen at 0) and got 0 corpus failures and 14/14 unit passes.

test('$AE99 plays one metasprite per FIVE frames and frees a non-carrier at the $00', () => {
  // The whole routine, end to end, against the cartridge's own script 0
  // (`26 27 28 00` at $AE7D, read out of assets/enemies/tables.json). Five
  // frames per byte, because $AE9E stores 5 and $AEDA decrements it on the same
  // pass: the reload frame ends at 4, then 3, 2, 1, 0, and the next frame is due.
  // RED WHEN: $AE9E's #$05 changes; the script bytes are read in the wrong
  // order; $AEBA's BNE is inverted; $AEBC frees a carrier or keeps a non-carrier.
  const s = running();
  explosionAtTerminator(s, 9, 0);
  s.obj.xvel[21] = 0;                // start at the beginning of the script
  const anim = [];
  for (let f = 0; f < 16; f++) { updateEnemies(s, res); anim.push(s.obj.anim[21]); }
  assert.deepStrictEqual(anim, [
    0x26, 0x26, 0x26, 0x26, 0x26,
    0x27, 0x27, 0x27, 0x27, 0x27,
    0x28, 0x28, 0x28, 0x28, 0x28,
    0x00,
  ], '$AE71 script 0 is 26 27 28 00, five frames a byte');
  assert.strictEqual(s.obj.type[21], 0, '$AEBC with $03AC = 0 must free the slot');
  assert.strictEqual(s.obj.timer[21], 0, '$AEF8 clears $014C too');
});

test('$AEB2/$AEB5: the script cursor is $042C,X and it advances once per script byte', () => {
  // The cursor lives in the X-VELOCITY byte -- an explosion does not move under
  // its own velocity, so the ROM reuses it. A port that kept a separate cursor,
  // or that read it without INCrementing, plays byte 0 forever and never frees
  // the slot; the corpus cannot see either.
  // RED WHEN: $AEB5 INC $042C,X is deleted (the loop below never terminates and
  // the last assertion fires), or the cursor is read from a different byte.
  const s = running();
  explosionAtTerminator(s, 9, 0);
  s.obj.xvel[21] = 0;
  const seen = [];
  for (let f = 0; f < 16; f++) {
    updateEnemies(s, res);
    if (s.obj.type[21] === 0) break;
    seen.push(s.obj.xvel[21]);
  }
  assert.deepStrictEqual([...new Set(seen)], [1, 2, 3],
    '$042C,X must step 1, 2, 3 as the three metasprites are consumed');
  assert.strictEqual(s.obj.type[21], 0, 'the script must reach its terminator');
});

test('$AEA3: the script is picked by $016C,X * 2 through the pointer PAIR at $AE71', () => {
  // `LDA $016C,X / ASL / TAY / LDA $AE71,Y / LDA $AE72,Y`. Drop the ASL and
  // animFrame 1 reads the pointer at $AE72 -- the high byte of one pointer and
  // the low byte of the next -- which on the cartridge is $81AE, a garbage
  // pointer into the audio bank.
  // MEASURED: $AE71 -> $AE7D `26 27 28 00`, $AE73 -> $AE81 `29 2A 2B 2C 00`.
  // RED WHEN: the ASL is dropped (the reads leave the exported ranges and the
  // asset loader throws), or the pointer is read little-endian backwards.
  const s = running();
  explosionAtTerminator(s, 9, 0);
  s.obj.animFrame[21] = 1;           // $016C,X = 1 -> Y = 2 -> $AE81
  s.obj.xvel[21] = 0;
  const seen = [];
  for (let f = 0; f < 25 && s.obj.type[21] !== 0; f++) {
    updateEnemies(s, res);
    seen.push(s.obj.anim[21]);
  }
  assert.deepStrictEqual([...new Set(seen)], [0x29, 0x2A, 0x2B, 0x2C, 0x00],
    'script 1 at $AE81 is 29 2A 2B 2C 00 -- four metasprites, not three');
});

test('$AEBC/$AEC1: a CARRIER explosion becomes a power-up capsule instead of dying', () => {
  // The one place in the game a capsule is created. `LDY $03AC,X / BEQ $AEF8`:
  // zero frees the slot, non-zero promotes it to type 1 with status 6 or 7 --
  // and status 6/7 are the two three-entry animation groups at $ADC1+24 and
  // $ADC1+28 that tests/enemies.test.js already pins.
  // RED WHEN: $AEBF's BEQ is inverted; $AEC1's #$01 changes; the promotion path
  // is given a tail call to $AEDA (the capsule would drift on its birth frame).
  const s = running();
  explosionAtTerminator(s, 9, 1);    // $03AC,X = 1: this one carries a power-up
  s.zp47 = 0;
  const xBefore = s.obj.x[21];
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0x01, '$AEC1: the explosion becomes type 1');
  assert.strictEqual(s.obj.status[21], 6, '$AED0 LDY #$06 -- the ordinary capsule');
  assert.strictEqual(s.obj.x[21], xBefore,
    '$AED2 STA $010C,X is the end of the routine: no fall-through on promotion');
  assert.strictEqual(s.zp47, 1, '$AEC8 INC $47 counts capsules, not kills');
});

test('$AEC6/$AECC: exactly one capsule in SIXTEEN is gold, and it is the sixteenth', () => {
  // `INC $47 / AND #$0F / BEQ $AED2 (with Y = 7) / LDY #$06`. The mask is the
  // whole rule and the corpus never creates a capsule at all, so every value of
  // it is green there. Driven across a full 32-capsule cycle so that TWO golds
  // land, at $47 = $10 and $47 = $20 -- a single-hit test agrees with any mask
  // that happens to fire once.
  // RED WHEN: #$0F becomes #$03 or #$07 or #$1F; #$07/#$06 are swapped; the
  // BEQ is inverted.
  const gold = [];
  for (let start = 0; start < 32; start++) {
    const s = running();
    explosionAtTerminator(s, 9, 1);
    s.zp47 = start;
    updateEnemies(s, res);
    assert.ok(s.obj.status[21] === 6 || s.obj.status[21] === 7,
      `$47 = ${start} produced status ${s.obj.status[21]}, not 6 or 7`);
    if (s.obj.status[21] === 7) gold.push(start + 1);
  }
  assert.deepStrictEqual(gold, [0x10, 0x20],
    'gold is the capsule whose post-INC $47 has a zero low nibble, and only that one');
});

// ============ $ADAB'S DIRECTION, DECIDED BY WHO GETS THE GOLD CAPSULE =======

test('$ADAB runs 9 DOWN TO 0, and the order decides WHICH slot gets the gold capsule', () => {
  // Reversing the update loop to 0..9 leaves the corpus and the whole unit
  // suite green, because `work.enemySlots` counts iterations and not order and
  // nothing else in the corpus is order-sensitive.
  //
  // $47 is. It is a SINGLE counter shared by every slot, so when two carrier
  // explosions reach their terminator on the same frame the loop's direction
  // decides which of the two gets the one gold capsule in sixteen. Seeded at
  // $0E, the SECOND slot the loop reaches is the one whose INC lands on $10.
  // The cartridge walks 9 -> 0, so the LOWER slot index wins it.
  // RED WHEN: the do/while is written as `for (q = 0; q < 10; q++)` -- the two
  // statuses swap, and both assertions fire.
  const s = running();
  explosionAtTerminator(s, 9, 1);    // slot 21, visited FIRST
  explosionAtTerminator(s, 3, 1);    // slot 15, visited LAST
  s.zp47 = 0x0E;
  updateEnemies(s, res);
  assert.strictEqual(s.zp47, 0x10, 'both explosions must promote on the same frame');
  assert.strictEqual(s.obj.status[21], 6,
    'slot 21 is reached FIRST ($ADB3 LDX #$09), so it takes $47 = $0F: no gold');
  assert.strictEqual(s.obj.status[15], 7,
    'slot 15 is reached LAST, so it takes $47 = $10 and the gold capsule');
});

// ================== THE FALL-THROUGH, $AEDA -> $AEDD -> $AEE1 ===============
// docs/knowledge/02 trap 1, nine incidents. Deleting `h_AEE1(state)` from the
// end of h_AEDD left the corpus at 0 failures and the unit suite at 14/14,
// because type $01/$81 is never dispatched anywhere in the corpus and the one
// test named for the fall-through only ever set $5B = 1 -- it exercised the
// FREEZE arm and never asserted that the capsule MOVES. See the strengthened
// test in enemies.test.js; this one covers the other end of the chain.

test('$AEDA falls through into $AEDD and $AEE1: an explosion drifts left while it burns', () => {
  // $AE99's tail is `DEC $014C,X` and then the next instruction is $AEDD. So an
  // explosion that is NOT due this frame still runs handler 1's $5B check and
  // handler 3's mover, and drifts half a pixel left like everything else.
  // Written as a call in the port, which is the only honest way to express a
  // fall-through in a language that has none -- and therefore the only thing
  // that can be deleted by accident.
  // RED WHEN: `h_AEDD(state, j)` is removed from tail(), or tail() is not
  // reached because $AE9C's BNE is inverted.
  const s = running();
  explosionAtTerminator(s, 9, 0);
  s.obj.timer[21] = 3;               // NOT due: $AE9C BNE takes the tail
  s.obj.x[21] = 0x80; s.obj.xf[21] = 0x00;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.timer[21], 2, '$AEDA DEC $014C,X');
  assert.deepStrictEqual([s.obj.x[21], s.obj.xf[21]], [0x7F, 0x80],
    '$AEE3 SEC / SBC #$80 borrows on the first frame -- the tail DID fall through');
  assert.strictEqual(s.obj.anim[21], 0,
    'and the script was not advanced: $AE9E is past the BNE');
});

test('$AEDA respects $5B: a frozen explosion decrements its timer but does not drift', () => {
  // The fall-through goes through $AEDD, so $5B freezes the explosion's DRIFT
  // as well as the capsule's -- but not its script timer, which is upstream.
  // That asymmetry is the evidence the chain is a fall-through and not two
  // independent handlers.
  // RED WHEN: tail() calls $AEE1 directly, skipping $AEDD's $5B test.
  const s = running();
  explosionAtTerminator(s, 9, 0);
  s.obj.timer[21] = 3;
  s.obj.x[21] = 0x80; s.obj.xf[21] = 0x00;
  s.zp5B = 1;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.timer[21], 2, '$AEDA runs BEFORE $AEDD reads $5B');
  assert.deepStrictEqual([s.obj.x[21], s.obj.xf[21]], [0x80, 0x00],
    '$AEDD LDA $5B / BNE $AF09 must stop the drift');
});

// ======================= $ADE8 BMI, THE ARMOURED ARM ========================

test('$ADE8 BMI: bit 7 of $010C,X suppresses the status animator entirely', () => {
  // `LDA $010C,X / BMI $AE14 / BEQ $AE14`. Deleting the bit-7 test leaves all
  // 18 scenarios and the whole unit suite green -- no enemy in any compared
  // window has a status byte with bit 7 set -- while deleting the ZERO test
  // reddens msExpanded at frame 402 immediately. One arm of one instruction
  // was carrying the whole check.
  //
  // The value is chosen so the mutant is not merely different but LOUD: $86 AND
  // $7F is 6, and $ADF6's ASL/ASL is eight bit, so a port that dropped the BMI
  // animates status $86 with status 6's group ($ADC1+24 = `10 11 12 00`) and
  // writes $11 into $012C,X on the very first frame.
  // RED WHEN: `!(status & 0x80)` is dropped from updateSlot's condition.
  const armoured = running();
  armoured.obj.status[21] = 0x86;
  armoured.obj.type[21] = 0x00;      // $AE17 BEQ $AE70: the animator is all there is
  updateEnemies(armoured, res);
  updateEnemies(armoured, res);
  assert.deepStrictEqual(
    [armoured.obj.anim[21], armoured.obj.timer[21], armoured.obj.animFrame[21]],
    [0, 0, 0], 'status $86 must leave $012C/$014C/$016C untouched');

  // ...and the control, which proves the harness can see this instruction at all
  const plain = running();
  plain.obj.status[21] = 0x06;
  plain.obj.type[21] = 0x00;
  updateEnemies(plain, res);
  assert.strictEqual(plain.obj.anim[21], 0x11,
    'status $06 must animate: $ADC1 + 6*4 + 1 = $11');
  assert.strictEqual(plain.obj.timer[21], 5, '$ADF1 stores 6, $AE11 decrements it');
});

// ===================== $B154, THE 16-BIT X ACCUMULATOR ======================

test('$B154 is a REAL 16-bit add: the X fraction\'s carry reaches the integer X', () => {
  // `LDA $044C,X / CLC / ADC $038C,X / STA $038C,X / LDA $042C,X / JMP $B165`,
  // and $B165 is `ADC $036C,X` WITHOUT a CLC -- so the fraction's carry
  // propagates. Both the fraction add and the carry can be deleted with the
  // whole gate green, because the only writer of $044C,X in the corpus is
  // $B1B9, which stores 0. It is dead in the corpus and live on the cartridge.
  //
  // Reached through handler 4 ($B205, dispatch entry 4 -- MEASURED from the
  // 42-entry table at $AE1C) in its $B21A arm with $046C,X = 0 and a positive
  // Y velocity, which is $B1DF arcRightUp.
  // RED WHEN: `+ o.xvelf[i]` is dropped from the fraction sum, or the
  // `(f > 0xFF ? 1 : 0)` carry term is dropped from the integer add.
  const carry = running();
  carry.obj.type[21] = 0x84;         // already initialised: $B205 BMI $B21A
  carry.obj.s0460[21] = 0x00;        // $046C,X = 0 -> the $B21F arm
  carry.obj.yvel[21] = 0x02;         // positive -> $B228 arcRightUp
  carry.obj.s0480[21] = 0x20;        // $048C,X, the Y acceleration
  carry.obj.x[21] = 0x50; carry.obj.xf[21] = 0x80;
  carry.obj.xvel[21] = 0xFE; carry.obj.xvelf[21] = 0x90;
  carry.obj.y[21] = 0x60;
  updateEnemies(carry, res);
  assert.strictEqual(carry.obj.xf[21], 0x10, '$80 + $90 = $110: the fraction wraps to $10');
  assert.strictEqual(carry.obj.x[21], 0x4F,
    '$50 + $FE + CARRY = $4F. Without the carry it is $4E and the enemy is one '
    + 'pixel left of the cartridge for the rest of its life');

  // the same slot one unit of fraction lower: no carry, one pixel further left
  const noCarry = running();
  noCarry.obj.type[21] = 0x84;
  noCarry.obj.s0460[21] = 0x00;
  noCarry.obj.yvel[21] = 0x02;
  noCarry.obj.s0480[21] = 0x20;
  noCarry.obj.x[21] = 0x50; noCarry.obj.xf[21] = 0x40;
  noCarry.obj.xvel[21] = 0xFE; noCarry.obj.xvelf[21] = 0x10;
  noCarry.obj.y[21] = 0x60;
  updateEnemies(noCarry, res);
  assert.strictEqual(noCarry.obj.xf[21], 0x50, '$40 + $10 = $50, no wrap');
  assert.strictEqual(noCarry.obj.x[21], 0x4E, '$50 + $FE = $4E, no carry in');
});

// ================ $BBB7 / $BC44, THE ENEMY-BULLET ENGINE ===================
// Ported in wave 3 and reached by the corpus on every frame -- and with NO unit
// test at all. Three of its parameters were free: the type filter, the reload
// gate and the fire boundary could each be changed with 18 scenarios green.

test('$BBF4: only an enemy of type AND $7F >= 3 counts down toward a shot', () => {
  // `LDA $030C,X / AND #$7F / CMP #$03 / BCC $BC15`. Free slots (0), power-up
  // capsules (1) and explosions (2) do not shoot. The corpus contains no type
  // 1 and no type 2 object ANYWHERE -- no kills, no capsules -- so CMP #$03 and
  // CMP #$02 are the same function on every frame it has ever run.
  // All ten slots are driven in one call: with $040C,X = 5 nothing borrows, so
  // $BC0F never fires and the loop runs to the end.
  // RED WHEN: #$03 moves; the AND #$7F is dropped (the $8x types stop counting).
  const s = running();
  const types = [0x00, 0x01, 0x02, 0x03, 0x80, 0x81, 0x82, 0x83, 0x04, 0x85];
  for (let j = 9; j >= 0; j--) {
    const i = j + ENEMY_BASE;
    s.obj.type[i] = types[9 - j];
    s.obj.style[i] = 5;              // $040C,X
    s.obj.s04E0[i] = 0xC8;           // $04EC,X
  }
  enemyBullets(s, res);
  const got = [];
  for (let j = 9; j >= 0; j--) got.push(s.obj.style[j + ENEMY_BASE]);
  assert.deepStrictEqual(got, [5, 5, 5, 4, 5, 5, 5, 4, 4, 4],
    'types $00 $01 $02 $80 $81 $82 must be skipped; $03 $83 $04 $85 must count down');
});

test('$BC02: the shot countdown reloads on BORROW at 0, not on reaching 0', () => {
  // `LDA $040C,X / SBC $98` with the carry left SET by the CMP above, so it is
  // a plain subtract of 1. $040C,X = 1 lands on 0 and CONTINUES; $040C,X = 0
  // borrows and is the frame the enemy shoots on. One off here and every
  // stage-1 enemy fires a frame early for its whole life.
  // RED WHEN: the borrow test becomes `v <= 0`, or the SBC is written with a
  // borrow-in (both slots then reload on the same frame and the first assertion
  // fires).
  const s = running();
  s.obj.type[21] = 0x83; s.obj.style[21] = 1; s.obj.s04E0[21] = 0xC8;
  s.obj.x[21] = 0x28;                // left of the player: $BC56 does not fire
  s.obj.type[20] = 0x83; s.obj.style[20] = 0; s.obj.s04E0[20] = 0xC8;
  s.obj.x[20] = 0x28;
  enemyBullets(s, res);
  assert.strictEqual(s.obj.style[21], 0, '1 - 1 = 0 must be STORED, not reloaded');
  assert.strictEqual(s.obj.style[20], 0xC8, '0 - 1 borrows: $BC09 reloads from $04EC,X');
});

test('$BC04: a zero $04EC does not reload and does NOT leave the loop', () => {
  // `LDA $04EC,X / BEQ $BC15` -- an enemy whose squadron style byte is zero has
  // no shot period, so it borrows every frame forever and never fires, and the
  // loop moves on to the next slot. Removing the gate makes the FIRST such
  // enemy consume the frame's single shot slot and silence everything below it.
  // On stage 1 $04EC,X is $C8 for every live enemy, so the corpus never sees a
  // zero and the gate is free.
  // RED WHEN: the `if (o.s04E0[i] === 0) continue` is removed -- slot 20 is then
  // never reached and the second assertion fires.
  const s = running();
  s.obj.type[21] = 0x83; s.obj.style[21] = 0; s.obj.s04E0[21] = 0x00;
  s.obj.x[21] = 0x28;
  s.obj.type[20] = 0x83; s.obj.style[20] = 0; s.obj.s04E0[20] = 0xC8;
  s.obj.x[20] = 0x28;
  enemyBullets(s, res);
  assert.strictEqual(s.obj.style[21], 0, 'a zero $04EC must leave $040C,X alone');
  assert.strictEqual(s.obj.style[20], 0xC8,
    'the loop must CONTINUE past it -- $BC04\'s BEQ goes to $BC15, not to $BC19');
});

test('$BC0F: at most ONE enemy per frame reaches $BC44, and it is the highest slot', () => {
  // `JSR $BC44 / JMP $BC19` -- fired or not, the loop is LEFT. Ten enemies all
  // due on the same frame produce one shot, from slot 21, and the other nine
  // keep their expired counters and try again next frame. A port that let the
  // loop run on would give a squadron a ten-bullet volley.
  // RED WHEN: the `return bulletUpdate(state)` after fireBullet becomes
  // `continue`, or the loop is walked upward from 0.
  const s = running();
  for (let j = 9; j >= 0; j--) {
    const i = j + ENEMY_BASE;
    s.obj.type[i] = 0x83; s.obj.style[i] = 0; s.obj.s04E0[i] = 0xC8;
    s.obj.x[i] = 0x28;               // all left of the player: nothing throws
  }
  enemyBullets(s, res);
  const reloaded = [];
  for (let j = 9; j >= 0; j--) if (s.obj.style[j + ENEMY_BASE] === 0xC8) reloaded.push(j + ENEMY_BASE);
  assert.deepStrictEqual(reloaded, [21],
    'exactly one slot may reload, and $BBEE LDX #$09 makes it slot 21');
  // $A8 IS NOT 9 AFTERWARDS, and the old version of this test asserted that it
  // was. It passed only because the port's $BC19 was a no-op loop that never
  // touched $A8; the CARTRIDGE's $BC1D does `LDX #$09 / STX $A8` and then walks
  // it down to $FF. Corrected in wave 11 with the loop body (rule 6). $A8 is
  // not a watched address, so nothing else could have caught it.
  assert.strictEqual(s.spawn.zA8, 0xFF,
    '$BC0F JMP $BC19, whose own loop leaves $A8 at $FF');
});

test('$BC56: an enemy fires only when the player is STRICTLY to its left', () => {
  // `LDA $0360 / CMP $036C,X / BCC $BC59`. This gate, not enemy lifetime, is
  // why slots 22-31 stay empty in `enemy-waves`: the scenario parks the ship at
  // X = 240 and every stage-1 enemy spawns at $F0 and marches left, so
  // playerX >= enemyX on every call and the branch is never taken. The boundary
  // is therefore never driven by any scenario -- the two frames below are the
  // only place in the project it is compared.
  // RED WHEN: the `>=` becomes `>` (the equal case then throws), or the operands
  // are swapped.
  const equal = running();
  equal.obj.type[21] = 0x83; equal.obj.style[21] = 0; equal.obj.s04E0[21] = 0xC8;
  equal.obj.x[21] = 0x50; equal.obj.y[21] = 0x40; equal.obj.x[0] = 0x50;
  enemyBullets(equal, res);
  assert.strictEqual(equal.obj.style[21], 0xC8,
    'the countdown reloaded, so $BC44 WAS entered');

  const left = running();
  left.obj.type[21] = 0x83; left.obj.style[21] = 0; left.obj.s04E0[21] = 0xC8;
  left.obj.x[21] = 0x50; left.obj.y[21] = 0x40; left.obj.x[0] = 0x4F;
  enemyBullets(left, res);
  assert.strictEqual(left.obj.anim[31], 0x25,
    'one pixel further left reaches $BC59, which allocates slot 31 and puts '
    + '$BC64[0] in its $0136');
  assert.strictEqual(equal.obj.anim[31], 0,
    '...and the equal case reached $BC58 RTS and allocated nothing');
});

test('$BBB7: a non-zero $5D skips the whole countdown', () => {
  // `LDA $5D / BNE $BC19`. $5D is INCremented by $A335 when a wave fires and
  // cleared by $9656 at the top of every mode-5 frame, so this arm is taken on
  // the ~1% of frames a squadron is triggered on: on those frames nothing
  // shoots. Getting it backwards freezes $040C,X on every enemy for ever.
  // RED WHEN: the test is inverted, or dropped.
  const s = running();
  s.spawn.z5D = 1;
  s.obj.type[21] = 0x83; s.obj.style[21] = 5; s.obj.s04E0[21] = 0xC8;
  enemyBullets(s, res);
  assert.strictEqual(s.obj.style[21], 5, '$5D != 0 must jump straight to $BC19');
});

test('$BC23: a live enemy-bullet slot is MOVED, and an empty one is not', () => {
  // Asserted a THROW until wave 11. Inverted rather than deleted (rule 6): the
  // mover that replaced it has to do what the throw's text said was missing.
  // RED WHEN: $BC23's `BEQ $BC2B` is dropped (an empty slot then drifts), or
  // the loop indexes $0136 with the $A9 convention instead of the $A8 one.
  const s = running();
  s.obj.anim[22 + 4] = 0x25;         // $0136,X with X = 4 -- object slot 26
  s.obj.s0460[22 + 4] = 1;           // $047A: bit 1 clear -> X negative,
                                     //        bit 0 set   -> Y positive
  s.obj.x[22 + 4] = 100; s.obj.xf[22 + 4] = 0; s.obj.xvel[22 + 4] = 1;
  s.obj.y[22 + 4] = 100; s.obj.yf[22 + 4] = 0; s.obj.yvelf[22 + 4] = 0x80;
  s.obj.x[22 + 5] = 100; s.obj.y[22 + 5] = 100;    // live position, EMPTY slot
  enemyBullets(s, res);
  assert.strictEqual(s.obj.x[22 + 4], 99, '$BE21-$BE27: X -= $042C:$044C');
  assert.strictEqual(s.obj.y[22 + 4], 100, '$BE39: Y += 0.5, integer unchanged');
  assert.strictEqual(s.obj.yf[22 + 4], 0x80, '...and the fraction carries it');
  assert.strictEqual(s.obj.x[22 + 5], 100, 'the empty slot was skipped entirely');
  assert.strictEqual(s.work.bulletSlots, 10, '$BC19 is ten iterations, always');
});

// ================ $B0AF, THE FAN: THE CONSTANTS NOBODY DROVE ===============

test('$B0DB: the fan splits up from down at exactly Y = $80', () => {
  // `LDA $032C,X / CMP #$80 / BCC $B0E5` -- the extra INC that makes the lower
  // half of a squadron curve UP. Both ARMS are exercised by the corpus (forcing
  // the branch never/always gives 75 and 147 failures), but the CONSTANT is
  // not: no fan enemy in any scenario takes a Y in [$40, $90), so $80 can be
  // moved anywhere in that window with the gate green.
  // RED WHEN: #$80 moves by one in either direction; or $B0D2's CMP #$60 moves
  // (the third case below); or the two INCs are collapsed into one.
  for (const [y, want] of [[0x7F, 1], [0x80, 2]]) {
    const s = running();
    s.obj.type[21] = 0x85;           // already initialised
    s.obj.s0480[21] = 0;             // sub-state 0
    s.obj.x[21] = 0x61;              // $B0CD adds $FE -> $5F, under the $60 gate
    s.obj.y[21] = y;
    updateEnemies(s, res);
    assert.strictEqual(s.obj.x[21], 0x5F, '$B0CD LDA #$FE: 2 px/frame left');
    assert.strictEqual(s.obj.s0460[21], 0x40, '$B0D6 arms the 64-frame curve timer');
    assert.strictEqual(s.obj.s0480[21], want,
      `Y = $${y.toString(16)} must become sub-state ${want}`);
  }
  // ...and one pixel the other side of $B0D2's gate: nothing is armed at all.
  const late = running();
  late.obj.type[21] = 0x85; late.obj.s0480[21] = 0;
  late.obj.x[21] = 0x62; late.obj.y[21] = 0x40;
  updateEnemies(late, res);
  assert.strictEqual(late.obj.x[21], 0x60, 'X = $60 exactly');
  assert.deepStrictEqual([late.obj.s0460[21], late.obj.s0480[21]], [0, 0],
    '$B0D2 CMP #$60 / BCS: X = $60 is NOT yet under the gate');
});

test('$B109/$B117: the fan gives up at Y >= the player\'s, and at Y < it, exactly', () => {
  // `CMP $0320 / BCC $B116` and its mirror. Changing homeDown's `>=` to `>` is
  // green over 5045 frames because no enemy Y in the corpus is ever EXACTLY
  // equal to the player's -- the one input that separates the two.
  // The player sits at Y = 96 in this fixture, so 96 and 95 are the boundary.
  // RED WHEN: either comparison loses or gains its equal case, or the two are
  // swapped.
  const cases = [
    // sub-state, enemy Y, expected sub-state after the frame
    [1, 96, 3], [1, 95, 1],
    [2, 95, 3], [2, 96, 2],
  ];
  for (const [sub, y, want] of cases) {
    const s = running();
    s.obj.type[21] = 0x85;
    s.obj.s0480[21] = sub;
    s.obj.s0460[21] = 0x40;          // far from the curve timer's expiry
    s.obj.x[21] = 0x40; s.obj.y[21] = y;
    updateEnemies(s, res);
    assert.strictEqual(s.obj.s0480[21], want,
      `sub-state ${sub} at Y = ${y} (player Y = 96) must end at sub-state ${want}`);
  }
});

test('$B0F7: the 64-frame curve timer hands over to sub-state 3 at exactly 0', () => {
  // `DEC $046C,X / BEQ $B111` -- the OTHER way out of the curve, and the one no
  // scenario reaches on a boundary. The enemy Y is put far above the player's
  // so $B109 cannot be the thing that ends the curve.
  // RED WHEN: the BEQ becomes a BPL/BMI, or $B0D6's #$40 changes.
  const last = running();
  last.obj.type[21] = 0x85; last.obj.s0480[21] = 1;
  last.obj.s0460[21] = 1; last.obj.x[21] = 0x40; last.obj.y[21] = 0x10;
  updateEnemies(last, res);
  assert.strictEqual(last.obj.s0460[21], 0, 'the timer must reach 0');
  assert.strictEqual(last.obj.s0480[21], 3, 'and hand over on that frame');

  const notYet = running();
  notYet.obj.type[21] = 0x85; notYet.obj.s0480[21] = 1;
  notYet.obj.s0460[21] = 2; notYet.obj.x[21] = 0x40; notYet.obj.y[21] = 0x10;
  updateEnemies(notYet, res);
  assert.deepStrictEqual([notYet.obj.s0460[21], notYet.obj.s0480[21]], [1, 1],
    'one frame earlier the curve must still be running');
  assert.strictEqual(notYet.obj.y[21], 0x12, '$B0EE JSR $B17C: Y += 2 while curving');
  assert.strictEqual(notYet.obj.x[21], 0x41, '$B0F1 INC $036C,X: and X += 1');
});

test('$B0CC: a fan sub-state of 4 or more is a bare RTS, not sub-state 0', () => {
  // `LDY $048C,X / DEY / BMI / DEY / BMI / DEY / BMI / BEQ / RTS`. The RTS is
  // reproduced, and nothing reaches it: no fan enemy in the corpus ever holds a
  // sub-state above 3, so a `default:` that fell into sub-state 0's body would
  // be green everywhere. It would also make a stuck enemy silently fly left.
  // RED WHEN: the `default: return` is given sub-state 0's or 3's body.
  const s = running();
  s.obj.type[21] = 0x85;
  s.obj.s0480[21] = 4;
  s.obj.x[21] = 0x40; s.obj.y[21] = 0x40; s.obj.s0460[21] = 0x11;
  updateEnemies(s, res);
  assert.deepStrictEqual(
    [s.obj.x[21], s.obj.y[21], s.obj.s0460[21], s.obj.s0480[21], s.obj.type[21]],
    [0x40, 0x40, 0x11, 4, 0x85],
    'sub-state 4 must touch nothing at all -- not even the off-screen box');
});

test('$B2A5/$B2CB: the phase counters are ALWAYS left at zero', () => {
  // `DEC $046C,X / BEQ $B2AF / LDA #$00 / STA $046C,X` -- it stores ZERO
  // whenever the decrement did NOT reach zero, which looks like an inverted
  // branch in the original and means the $1E seeds at $B298/$B2BB are inert and
  // the Y comparison is re-run every frame. The literal reading is what the
  // measured metasprite histograms support ($38, $39 and $3A all appear), so it
  // is transcribed literally -- and a "tidied" version that let the counter run
  // would change the enemy's path.
  // The corpus catches the tidied version; nothing states the invariant, which
  // is the thing a future reader will want before they touch it.
  // RED WHEN: `if (o.s0460[i] !== 0) o.s0460[i] = 0;` is removed, or inverted
  // into a real countdown.
  for (const seed of [0, 1, 2, 0x1E, 0xFF]) {
    const down = running();
    down.obj.type[21] = 0x88;          // dispatch entry 8 -> $B26C (MEASURED)
    down.obj.s0460[21] = seed;
    down.obj.x[21] = 0x80; down.obj.y[21] = 0x60;
    updateEnemies(down, res);
    assert.strictEqual(down.obj.s0460[21], 0,
      `$046C,X seeded ${seed} must end the frame at 0, never counting`);

    const up = running();
    up.obj.type[21] = 0x88;
    up.obj.s0460[21] = 0; up.obj.s04A0[21] = seed || 1;
    up.obj.x[21] = 0x80; up.obj.y[21] = 0x60;
    updateEnemies(up, res);
    assert.strictEqual(up.obj.s04A0[21], 0,
      `$04AC,X seeded ${seed || 1} must end the frame at 0 too`);
  }
});

test('$B26C picks one of THREE metasprites from the sign of (enemy Y - player Y)', () => {
  // $38 closing down, $39 closing up, $3A Y-aligned -- and the aligned arm also
  // switches the enemy from 1 px/frame to 2 and runs the off-screen box. All
  // three appear in the measured cartridge histograms (slot 14 read 57 for 72
  // frames and 58 for 82), and the corpus does redden if $3A is changed; this
  // pins WHICH comparison chooses WHICH, which the comparison cannot attribute.
  // RED WHEN: $B296's BCC is inverted (the $38 and $39 rows swap), $B294's BEQ
  // is dropped, or any of the three constants moves.
  const drive = (y) => {
    const s = running();               // player Y = 96, player X = 80
    s.obj.type[21] = 0x88;             // dispatch entry 8 -> $B26C (MEASURED)
    s.obj.x[21] = 0x80; s.obj.y[21] = y;
    updateEnemies(s, res);
    return [s.obj.anim[21], s.obj.x[21]];
  };
  assert.deepStrictEqual(drive(97), [0x38, 0x7F],
    'below the player: $B298 seeds $046C and $B29D draws $38, moving 1 px left');
  assert.deepStrictEqual(drive(95), [0x39, 0x7F],
    'above the player: $B2BB seeds $04AC and $B2C0 draws $39, moving 1 px left');
  assert.deepStrictEqual(drive(96), [0x3A, 0x7E],
    'exactly aligned: $B289 draws $3A and $B2DB flies left at 2 px/frame');
});

test('$B0B4 is an ADD, not an OR: $B23C re-initialises by WRAPPING bit 7 OFF', () => {
  // `LDA #$80 / CLC / ADC $030C,X / STA $030C,X`. On a type that already has
  // bit 7 set that WRAPS and CLEARS it, and $B205's $B23C arm depends on
  // exactly that to re-run its own init on the following frame -- the enemy
  // loses a frame and starts its arc again. An OR would leave the type at $84
  // and the enemy would never re-init.
  // RED WHEN: setInitialised uses `| 0x80`, or drops the u8().
  const s = running();
  s.obj.type[21] = 0x84;
  s.obj.s0460[21] = 1;               // $B21A BNE $B233 -- the second arm
  s.obj.yvel[21] = 0xF0;             // negative and below $FE -> $B23C BCC $B20A
  s.obj.x[21] = 0x80; s.obj.y[21] = 0x60;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0x04,
    '$80 + $84 = $04: bit 7 must come back OFF');
  assert.deepStrictEqual([s.obj.s0460[21], s.obj.s0480[21]], [0, 0x20],
    '$B20A/$B212: the init block really did run again');
  assert.deepStrictEqual([s.obj.yvel[21], s.obj.xvel[21], s.obj.xvelf[21]],
    [0x02, 0xFE, 0x00], '$B22E -> $B1B1 re-seeded the arc velocities');
});

test('$ADAB\'s $AE/$AF preamble is written, and no watched address can see it', () => {
  // `LDA #$80 / STA $AF / LDA #$00 / STA $AE` before the loop. Neither byte is
  // in the 324-address watch list and neither has a peek() case, so the
  // comparison is structurally blind to both: setting $AF to 0 instead of $80
  // is green across all 18 scenarios. The port reproduces them because the
  // cartridge does; this is the only check that says so.
  // RED WHEN: either store is dropped or its constant changes.
  const s = running();
  s.spawn.zAE = 0x11; s.spawn.zAF = 0x22;
  updateEnemies(s, res);
  assert.strictEqual(s.spawn.zAF, 0x80, '$ADAB LDA #$80 / STA $AF');
  assert.strictEqual(s.spawn.zAE, 0x00, '$ADAF LDA #$00 / STA $AE');
  assert.strictEqual(s.spawn.zA8, 0xFF,
    '$ADBC DEC $A8 / $ADBE BPL leaves $A8 at $FF, one past the last slot');
});

// ============ $A411 / $A427, THE EMIT PATH'S UNDRIVEN PARAMETERS ===========

test('$A44A/$A450: type $0B and squadrons under four members get NO capsule id', () => {
  // `LDA $65 / CMP #$0B / BEQ $A45B` and `LDA $6F / CMP #$04 / BCC $A45B`. Both
  // decide whether $03AC,X carries the squadron group id (2 or 3) that wave 6's
  // $BE93 uses to find the kill counter at $0048+$49. Deleting the CMP #$0B is
  // green over the whole corpus -- stage 1's first 1465 frames spawn types $05,
  // $08 and $04 and never type $0B.
  // Driven through $A411 directly by parking the engine mid-squadron ($69 != 0,
  // $6C == 0), which is the $A32F arm.
  // RED WHEN: either test is removed or its constant moves.
  const emit = (type, members) => {
    const s = running();
    s.spawn.z69 = 1; s.spawn.z6C = 0;
    s.spawn.z64 = 0x11; s.spawn.z65 = type;
    s.spawn.z67 = 0;                 // pattern 0: style byte $C8, so bit 0 is CLEAR
    s.spawn.z6D = 0xF0; s.spawn.z6E = 0x40; s.spawn.z6F = members;
    s.zp49 = 2;
    spawnEngine(s, res);
    assert.strictEqual(s.obj.type[21], type, 'the member must have been emitted');
    assert.strictEqual(s.obj.status[21], 0x11, '$A45B LDA $64 / STA $010C,X');
    return s.obj.carrier[21];
  };
  assert.strictEqual(emit(0x0C, 4), 2, 'a four-member squadron of type $0C carries $49');
  assert.strictEqual(emit(0x0B, 4), 0, '$A44A: type $0B never carries a capsule');
  assert.strictEqual(emit(0x0C, 3), 0, '$A450: fewer than four members, no counter');
});

test('$A427: the pattern index is ($67 * 4 - $67) in EIGHT bits', () => {
  // `LDA $67 / ASL / ASL / SEC / SBC $67 / TAY`. Everything is 8-bit, so $67 =
  // $80 indexes $A5BC + $80 -- the ASL wraps to 0 and the SBC then BORROWS --
  // and not $A5BC + $180. Writing it as a 32-bit `* 3` is green over the whole
  // corpus because stage 1's descriptors only ever hold $67 <= 5.
  // MEASURED off the cartridge: $A5BC+$80 is `12 15 08` and $A5BC+$180 is
  // `6C B0 00`, so all three of the bytes the emit path reads differ.
  // RED WHEN: `u8(u8(z67 << 2) - z67)` loses either u8().
  const s = running();
  s.spawn.z69 = 1; s.spawn.z6C = 0;
  s.spawn.z64 = 0x11; s.spawn.z65 = 0x0C;
  s.spawn.z67 = 0x80;
  s.spawn.z6D = 0xF0; s.spawn.z6E = 0x40; s.spawn.z6F = 0;
  spawnEngine(s, res);
  assert.strictEqual(s.spawn.z6C, 0x12, '$A42F: the delay at $A5BC + $80 is $12');
  assert.strictEqual(s.obj.y[21], 0x55, '$A434: $40 + the dY $15 at $A5BC + $81');
  assert.strictEqual(s.obj.s04E0[21], 0x08, '$A444: the style at $A5BC + $82 is $08');
});

// ================== $8402, THE WAVE CURSOR IS A REAL POINTER ================

test('$8409: the wave cursor carries across a ROM page boundary', () => {
  // `$A34F LDA #$02 / LDX #$6A / JSR $8402`, and $8402 is the house 16-bit add:
  // `CLC / ADC $00,X / STA $00,X / BCC / INC $01,X`. Stage 0's chunk-0 list runs
  // $A844 -> $A858 and chunk 1's from $A859, so NO wave list in this corpus
  // crosses a page and the INC is free: deleting it is green everywhere.
  // The record at $ABFF is one that does. MEASURED off the cartridge: trigger
  // $20, cmd $8A -- a real formation record, so the whole fire path runs.
  // RED WHEN: `if (lo > 0xFF) sp.z6B = ...` is dropped, or the cursor is kept
  // as a single number and masked to 8 bits.
  const s = running();
  s.spawn.z61 = 0; s.cam.hi = 0; s.cam.lo = 0x40;   // trigger $20 * 2 = $40
  s.spawn.z6A = 0xFF; s.spawn.z6B = 0xAB;
  spawnEngine(s, res);
  assert.strictEqual(cursor(s), 0xAC01,
    '$ABFF + 2 = $AC01: the high byte must carry');
  assert.strictEqual(s.spawn.z6A, 0x01, '$8405 STA $6A');
  assert.strictEqual(s.spawn.z6B, 0xAC, '$8409 INC $6B');
  assert.strictEqual(s.obj.type[21], 0x05, 'and the record it read really did spawn');
});

// ===================== THE ENGINE'S OWN STATE MACHINE ======================

test('$A2DF AND #$0E: the chunk index drops bit 0 of the scroll page', () => {
  // `LDA $3F / AND #$0E / STA $61`, and $61 is then used BOTH as the byte offset
  // into the stage's chunk table AND as the high byte a trigger is compared
  // against. A mask of $0F would make every odd scroll page load a chunk
  // pointer from the middle of two entries. The corpus never sees it because
  // $3F is even on every frame a chunk is loaded on.
  // MEASURED: stage 0's chunk table is $A7DE and its first three chunks are
  // $A844, $A859, $A87A.
  // RED WHEN: #$0E becomes #$0F or #$FE.
  for (const [scrollHi, wantZ61, wantCursor] of [[1, 0, 0xA844], [3, 2, 0xA859], [5, 4, 0xA87A]]) {
    const s = running();
    s.spawn.z60 = 1;                 // $A2CC: the LOAD entry
    s.cam.hi = scrollHi;
    spawnEngine(s, res);
    assert.strictEqual(s.spawn.z60, 2, '$A2CF INC $60 runs on this entry only');
    assert.strictEqual(s.spawn.z61, wantZ61,
      `$3F = ${scrollHi} must give $61 = ${wantZ61}`);
    assert.strictEqual(cursor(s), wantCursor,
      `$61 = ${wantZ61} must select chunk ${wantZ61 / 2}`);
  }
});

test('$A2F0/$A2F7: sub-state $81 is a bare RTS and $82 is a loud throw', () => {
  // `CMP #$81 / BEQ $A2F6 (RTS)` then `CMP #$82 / BEQ $A2FB (JMP $C413)`. $1B is
  // $80 on every compared frame of every scenario, so both constants are free:
  // changing #$81 to #$83 is green over 5045 frames. $81 is the boss-approach
  // sub-state and it must FREEZE the spawn engine, not fall through into it.
  // RED WHEN: #$81 moves (the first case then fires a wave), or the $82 arm
  // stops throwing.
  const frozen = running();
  frozen.substate = 0x81;
  frozen.spawn.z61 = 0; frozen.cam.hi = 0; frozen.cam.lo = 0x20;
  frozen.spawn.z6A = 0x44; frozen.spawn.z6B = 0xA8;
  spawnEngine(frozen, res);
  assert.strictEqual(cursor(frozen), 0xA844, '$1B = $81 must not consume a record');
  assert.strictEqual(frozen.obj.type[21], 0, 'and must not spawn anything');

  const advancing = running();
  advancing.substate = 0x82;
  assert.throws(() => spawnEngine(advancing, res), /\$1B = \$82.*\$C413/s);

  // the control: the same state at $80 DOES fire, so the freeze above is the
  // sub-state and not the fixture.
  const playing = running();
  playing.spawn.z61 = 0; playing.cam.hi = 0; playing.cam.lo = 0x20;
  playing.spawn.z6A = 0x44; playing.spawn.z6B = 0xA8;
  spawnEngine(playing, res);
  assert.strictEqual(cursor(playing), 0xA846, '$1B = $80 consumes the record');
  assert.strictEqual(playing.obj.type[21], 0x05, 'and spawns the squadron');
});

// ============================ WAVE 12 ========================================
// FOUR DELIBERATE BREAKS SURVIVED `deep-page3`, the 579-frame comparison that
// carries the whole of wave 12's new code (scroll $0319 -> $043B, the first
// window in this project's history to cross $0380). Every one of them is the
// same shape docs/knowledge/03 names: the corpus REACHES the code and
// interrogates none of its parameters.
//
// The measured evidence for each is in the comment above it -- the break, the
// scenario, and the verdict. The three siblings that DID go red are named too,
// because "this constant is unwitnessed" only means something next to "this
// one next to it is witnessed".
//
//   $B033  LDA #$0A   -> #$0B    GREEN   (the guard at $B0AB is RED: 10 fields)
//   $B043  CMP #$30   -> #$31    GREEN   (the muzzle store at $B080 is RED)
//   $B062  CMP #$30   -> #$31    GREEN   ($B083's tail is RED)
//   $B184  drop the borrow       GREEN   ($B1DA's BNE/BEQ is RED)
//
// $B033 itself is pinned in enemies.test.js (it needs a placement, not a
// boundary). The other three are here.

test('$B043/$B048/$B050/$B055: the four X-band boundaries, each side', () => {
  // WRITTEN BECAUSE A DELIBERATE BREAK SURVIVED THE CORPUS: `CMP #$30` ->
  // `#$31` at $B043 is GREEN on deep-page3's 579 frames. The turret in that
  // window sits at dx around $A0 and never walks across a band edge, so a
  // one-unit shift is invisible -- while the SAME routine's muzzle store
  // ($B080) and its $AEDD tail both go red, which is how we know the code runs.
  //
  // The bands, with the enemy's X minus the ship's X taken as an 8-BIT
  // subtraction ($B03A LDA $036C,X / SEC / SBC $0360):
  //     carry set (enemy right of ship)   $00-$2F -> 0, $30-$5F -> 1, $60+ -> 2*
  //     carry clear (enemy left of ship)  $D0-$FF -> 3, $A0-$CF -> 4, else 5*
  // (* refined by Y, held at "no refinement" here by putting the ship far away
  // in Y -- dy = $6E, which is neither < $30 nor >= $D0.)
  // RED WHEN: any of the four CMPs moves by one.
  // THE SUBTRACTION'S CARRY IS THE BAND SELECTOR, not the byte value, so the
  // ship's X has to be placed on the correct side of the enemy for each half:
  // $10 (the low player clamp, $A03A) for the no-borrow bands and $F0 (the high
  // one, $A028) for the borrow bands. A helper that fixed the ship at 0 would
  // make every dx a no-borrow dx and quietly test one half twice.
  const MS = [0x74, 0x73, 0x72, 0x75, 0x76, 0x77];
  const band = (dx) => {
    const s = createState();
    s.substate = 0x80;
    s.obj.type[21] = 0x12;
    const px = dx < 0x80 ? 0x10 : 0xF0;
    s.obj.x[0] = px; s.obj.y[0] = 0x10;
    s.obj.x[21] = (px + dx) & 0xFF;
    s.obj.y[21] = 0x7E;                            // dy = $6E: no refinement
    updateEnemies(s, res);
    return MS.indexOf(s.obj.anim[21]);
  };
  assert.strictEqual(band(0x2F), 0, '$B043 CMP #$30: $2F is still band 0');
  assert.strictEqual(band(0x30), 1, '...and $30 is band 1');
  assert.strictEqual(band(0x5F), 1, '$B048 CMP #$60: $5F is still band 1');
  assert.strictEqual(band(0x60), 1, '...and $60 goes to the refined arm, which '
                                  + 'leaves Y at 1 when dy is out of range');
  assert.strictEqual(band(0xFF), 3, '$B050 CMP #$D0: $FF is band 3');
  assert.strictEqual(band(0xD0), 3, '...and $D0 is the last band-3 value');
  assert.strictEqual(band(0xCF), 4, '...$CF is band 4');
  assert.strictEqual(band(0xA0), 4, '$B055 CMP #$A0: $A0 is still band 4');
  assert.strictEqual(band(0x9F), 4, '...and $9F goes to the refined arm, which '
                                  + 'leaves Y at 4 when dy is out of range');
});

test('$B062/$B068: the Y refinement adds exactly one, at $30 and at $D0', () => {
  // The second break that survived: `CMP #$30` -> `#$31` at $B062 is GREEN on
  // deep-page3. Same reason -- the turret's dy in that window never sits on the
  // boundary.
  //
  // The refinement only runs for the two OUTER X bands ($B04C BCS $B059 and
  // $B055's fall-through), and it is a single INY: band 1 -> 2 and band 4 -> 5.
  //
  // AND THOSE TWO CODES ARE THE ONES THE CARTRIDGE NEVER PRODUCES. MEASURED
  // with an exec hook on $B06D reading Y over 27,400 frames
  // (tools/oracle/throwaudit.py): 8363 executions, Y = 0 (26), 1 (13), 3 (2740)
  // and 4 (5584) -- **never 2 and never 5**. So the refinement's INY has no
  // cartridge witness at all, in either direction, and every metasprite it can
  // pick ($72 and $77) is drawn by no run anybody here has made.
  // RED WHEN: either CMP moves, or the INY is applied to the inner bands too.
  // Same carry discipline as the test above, now in BOTH axes: the ship goes
  // low or high in X and in Y independently, so that dx and dy each land on the
  // side of the subtraction the case is about.
  const MS = [0x74, 0x73, 0x72, 0x75, 0x76, 0x77];
  const band = (dx, dy) => {
    const s = createState();
    s.substate = 0x80;
    s.obj.type[21] = 0x12;
    const px = dx < 0x80 ? 0x10 : 0xF0;
    const py = dy < 0x80 ? 0x10 : 0xC0;
    s.obj.x[0] = px; s.obj.y[0] = py;
    s.obj.x[21] = (px + dx) & 0xFF; s.obj.y[21] = (py + dy) & 0xFF;
    updateEnemies(s, res);
    return MS.indexOf(s.obj.anim[21]);
  };
  assert.strictEqual(band(0x70, 0x2F), 2, '$B062 CMP #$30: dy $2F refines');
  assert.strictEqual(band(0x70, 0x30), 1, '...and dy $30 does not');
  assert.strictEqual(band(0x70, 0xD0), 2, '$B068 CMP #$D0: dy $D0 refines');
  assert.strictEqual(band(0x70, 0xCF), 1, '...and dy $CF does not');
  assert.strictEqual(band(0x90, 0x2F), 5, 'the same on the LEFT-hand band');
  assert.strictEqual(band(0x90, 0x30), 4);
  // and the inner bands are never refined, whatever dy is
  assert.strictEqual(band(0x10, 0x2F), 0, 'band 0 is not refined');
  assert.strictEqual(band(0xF0, 0x2F), 3, 'band 3 is not refined');
});

test('$B184 is a REAL 16-bit subtract: the X fraction\'s borrow reaches X', () => {
  // The third break that survived: dropping the borrow in subX16 is GREEN on
  // deep-page3, while flipping $B1DA's BNE (which CHOOSES $B184 over $B154) is
  // red. MEASURED WHY, and it is structural rather than a sampling accident:
  // the only caller reachable today is handler 6, whose $B1B1 seed writes
  // $044C,X = 0 and nothing on its path ever changes it -- so `$038C,X - 0`
  // can never borrow. The borrow is real 6502 behaviour on a byte the corpus
  // cannot drive, so it is pinned here directly.
  // RED WHEN: `- (f < 0 ? 1 : 0)` is dropped from subX16.
  const s = createState();
  s.substate = 0x80;
  s.obj.type[21] = 0x86;               // handler 6, past its init frame
  s.obj.s04A0[21] = 2;                 // $B200[2] = 1 -> $B1E5 JSR $B184
  s.obj.s0480[21] = 0x20;
  s.obj.x[21] = 0x50; s.obj.xf[21] = 0x00;
  s.obj.xvel[21] = 0xFE; s.obj.xvelf[21] = 0x80;
  s.obj.y[21] = 0x60; s.obj.yvel[21] = 3;
  s.obj.x[0] = 80; s.obj.y[0] = 96;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.xf[21], 0x80, '$B184: $00 - $80 wraps to $80');
  assert.strictEqual(s.obj.x[21], 0x51,
    '$B18E SBC $042C,X with the fraction\'s borrow: $50 - $FE - 1 = $51. '
    + 'Without the borrow it would be $52');
});

test('$B07B: the flipped muzzle row is only DISTINGUISHABLE where it is non-zero', () => {
  // `LDA $B092,Y / BNE $B080` branches on the byte it JUST LOADED, so a zero
  // entry does not reach the store -- execution falls into $B07D and re-loads
  // from $B08C,Y. src/enemies.js transcribes that.
  //
  // AND THIS TEST CANNOT PIN IT, WHICH IS THE POINT AND IS SAID OUT LOUD.
  // MEASURED by trying: rewriting the fall-through as a plain if/else is GREEN
  // on every test in this repo, because the ONLY index where $B092 is zero is
  // 5, and $B08C is zero there too -- so both spellings store 0. There is no
  // input that separates them while the tables hold these bytes. A test that
  // claimed to catch it would be decoration.
  //
  // What IS pinned here is the fact that makes it unobservable, so that an
  // asset edit which changes it is caught by verify_assets.py's row checks and
  // whoever reads this knows why the code is shaped the way it is:
  //   * index 5 is the only zero in either row;
  //   * everywhere else the two rows DIFFER at 0, 1, 3 and 4, so the branch on
  //     $018C bit 7 is very much observable -- see the $B026 test below, where
  //     the same placement gives muzzle $01 unflipped and $03 flipped.
  // RED WHEN: either muzzle row's bytes change.
  const rows = [];
  for (let base of [0xB08C, 0xB092]) {
    rows.push([...Array(6)].map((_, i) => rom.read(base + i)));
  }
  assert.deepStrictEqual(rows[0], [0x01, 0x01, 0x06, 0x05, 0x05, 0x00], '$B08C');
  assert.deepStrictEqual(rows[1], [0x03, 0x03, 0x06, 0x08, 0x08, 0x00], '$B092');
  const zeros = rows[1].map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(zeros, [5],
    '$B07B\'s BNE can only fall through at index 5; if another entry ever '
    + 'becomes 0 the fall-through stops being unobservable');
  assert.strictEqual(rows[0][5], 0,
    '...and $B08C[5] is 0 too, which is why either spelling stores the same');
  // The run through the code, for the record: direction 5, flipped, stores 0.
  const s = createState();
  s.substate = 0x80;
  s.obj.type[21] = 0x12;               // $B098 -> attribute bit 7 set
  s.obj.x[0] = 200; s.obj.y[0] = 90;
  s.obj.x[21] = 90; s.obj.y[21] = 100; // direction code 5
  updateEnemies(s, res);
  assert.strictEqual(s.obj.anim[21], 0x77, 'direction 5');
  assert.strictEqual(s.obj.s0480[22 + 9], 0x00);
});

test('$B1C5: an arc counter past the five-entry table is a LOUD named throw', () => {
  // $B200 is FIVE bytes and $B205 is st_B205's `LDA $030C,X` opcode -- $BD,
  // which reads as a perfectly plausible non-zero "fly right" flag. MEASURED on
  // the cartridge (tools/oracle/throwaudit.py, the `y` histogram on the $B1C5
  // hook, 27,400 frames): 2439 executions, Y = 0, 1, 2, 3 and 4, never 5. The
  // enemy walks the WHOLE table -- a first reading of this routine guessed it
  // would be freed inside its first arc and that was wrong -- and $B251's box
  // frees it one entry before the end. So the cartridge stops exactly one read
  // short of the overrun, which is the least comfortable place for it to stop
  // and the reason this guard exists.
  // RED WHEN: the guard is removed (the reader's own out-of-range throw fires
  // instead, with a message about export_assets.py rather than about $04AC).
  const s = createState();
  s.substate = 0x80;
  s.obj.type[21] = 0x86;
  s.obj.s04A0[21] = 5;
  s.obj.x[21] = 0x80; s.obj.y[21] = 0x60;
  assert.throws(() => updateEnemies(s, res),
    /\$B1C5 LDA \$B200,Y with \$04AC = 5/);
});

test('$B026: the FLOOR turret is $B098 with three bytes different', () => {
  // Entry 17, types $11/$91. REACHED IN PLAY AND BY NO COMPARED WINDOW --
  // MEASURED with tools/oracle/throwaudit.py: 3700 executions across three
  // 6000-frame runs, FIRST AT FRAME 2682, which is 203 frames past the end of
  // `deep-page3`'s window (1900..2479, the deepest comparison in the corpus).
  // So it is ported, it runs on the cartridge, and nothing in the gate watches
  // it -- which is precisely the state this file exists for.
  //
  // It shares $B033/$B038 with $B098 and differs in exactly three bytes.
  // RED WHEN: $B026 writes $92, ORs the attribute, or uses $B098's arm test.
  const s = createState();
  s.substate = 0x80;
  s.obj.type[21] = 0x11;
  s.obj.x[21] = 0x60; s.obj.y[21] = 0x40;
  s.obj.x[0] = 0x50; s.obj.y[0] = 0x41;   // dx = $10 -> direction 0; enemy above
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0x91, '$B026 LDA #$91, not #$92');
  assert.strictEqual(s.obj.attrMask[21], 0x00, 'and no ORA #$80');
  assert.strictEqual(s.obj.style[21], 0x0A, '$B031 BCS skips $B033 only when '
                                          + 'the enemy is at or below the ship');
  assert.strictEqual(s.obj.s0480[22 + 9], 0x01,
    'with bit 7 of $018C CLEAR, $B076 BPL takes $B07D and the muzzle index '
    + 'comes from $B08C ($01), not from $B092 ($03)');
  const other = createState();
  other.substate = 0x80;
  other.obj.type[21] = 0x11;
  other.obj.x[21] = 0x60; other.obj.y[21] = 0x40;
  other.obj.x[0] = 0x50; other.obj.y[0] = 0x40;   // equal: $B031 BCS taken
  other.obj.style[21] = 0x77;
  other.obj.attrMask[21] = 0x80;                  // $B073 LDA $018C,X / BPL
  updateEnemies(other, res);
  assert.strictEqual(other.obj.style[21], 0x77,
    '$B026\'s test is CPY/BCS, i.e. the OPPOSITE sense to $B098\'s');
  assert.strictEqual(other.obj.s0480[22 + 9], 0x03,
    '...and a turret whose $018C already has bit 7 reads $B092 even at $B026');
});
