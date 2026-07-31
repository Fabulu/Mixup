// $894B, $8974/$8989 and $9C45 -- the power-up loop.
//
// The corpus covers the loop end to end (capsule-pickup, capsule-consume,
// capsule-sweep, capsule-shield, capsule-die: 2035 compared frames, 0 divergent).
// This file is for the parts of it the CORPUS CANNOT REACH, and each test says
// which of the two it is:
//
//   $8960   the ($07E5 & $0F) == 5 score bonus. `capsule-die` takes the OTHER
//           arm of the same test ($8958, rapid fire) and measures $8960 n = 0,
//           so the corpus holds one arm and this file holds the other. Reaching
//           it needs a seventh capsule collected at a score whose hundreds digit
//           is exactly 5, and $07E5 is not a pokeable address.
//   $8974's $0100 gate, $18 != 0, and jt_8989 past entry 6 -- states no measured
//           frame is in.
//   $9C45   at $19 != 0 and $45 > 2, i.e. rank 5 and 6, which 00-recon-powerups
//           established are unreachable in stage 1 at all.
//
// Everything else here is a SECOND witness for something the corpus already
// compares, and is labelled as such rather than presented as coverage.

import test from 'node:test';
import assert from 'node:assert';

import { ENEMY_BASE, BTN } from '../src/state.js';
import { pickupCapsule, applyCapsule, computeRank } from '../src/powerup.js';
import { bootState } from '../src/main.js';
import { respawn } from '../src/flow.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);

/** A live stage-1 play state with B held and the meter at `meter`. */
function ship(meter = 0, held = BTN.B) {
  const s = bootState(res.manifest);
  s.obj.status[0] = 1;                            // $0100 -- alive, exactly 1
  s.zp.meter = meter;                             // $42
  s.input.held = held;                            // $07
  return s;
}

// ------------------------------------------------------------- $894B, the meter

test('$894B: capsules 1-6 just INC $42 and score $0050, and $CE89 never runs', () => {
  // MEASURED (00-recon-powerups.md 2, six pokes): `$8953 JSR $CE89` ran only on
  // the SEVENTH, never on the first six -- the `CMP #$07 / BCC $8969` gate is
  // real. Set $07E5 to the rapid-fire value so a missing gate would be loud.
  // RED WHEN: the CMP is `>= 6`, or the wrap fires early.
  const s = ship(0);
  s.score[5] = 0x00;                              // $07E5 low nibble 0
  for (let n = 1; n <= 6; n++) {
    pickupCapsule(s, res);
    assert.strictEqual(s.zp.meter, n, `capsule ${n}`);
    assert.strictEqual(s.zp.autofire, 0x14, '$35 untouched below the seventh');
  }
  // six capsules at +$0050 = $0300
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x00, 0x03, 0x00]);
});

test('$8965: the SEVENTH capsule wraps $42 to ONE, not to zero', () => {
  // MEASURED twice: the recon's `$42 = 6` poke table, and `capsule-die`, where
  // the artifact shows w_0042 6 -> 1 at f635 and 1 -> 2 at the next pickup.
  // RED WHEN: the wrap is to 0 -- which looks harmless and moves the HUD cursor
  // off the bar for the rest of the life.
  const s = ship(6);
  s.score[4] = 0x00; s.score[5] = 0x07; s.score[6] = 0x00;   // neither arm
  pickupCapsule(s, res);
  assert.strictEqual(s.zp.meter, 1);
  assert.strictEqual(s.zp.autofire, 0x14, 'digit 7: no rapid fire');
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x50, 0x07, 0x00],
    'the +$0050 happens on the seventh too -- $8969 is below both arms');
});

test('$8953/$8958/$8960: the seventh capsule reads a DIGIT OF THE SCORE', () => {
  // The whole four-row table 00-recon-powerups.md 2 measured on the cartridge by
  // poking $07E5, with $42 forced to 6 so the INC lands on 7:
  //
  //   $07E5      $8958 rapid fire   $8960 bonus   result
  //   $00              yes               no       $35 20 -> 4
  //   $10              yes               no       $35 20 -> 4   (LOW NIBBLE)
  //   $07              no                no       $35 stays 20
  //   $05              no                yes      $35 stays 20, +$001000
  //
  // $8960's row is the one the corpus cannot reach; `capsule-die` holds the
  // $00 row and measures $8960 n = 0 on the cartridge.
  // RED WHEN: the test is on the whole byte rather than the low nibble (the $10
  // row separates those), the two arms are swapped, or the bonus is +$0010.
  const run = (digit) => {
    const s = ship(6);
    s.score[4] = 0x00; s.score[5] = digit; s.score[6] = 0x00;
    pickupCapsule(s, res);
    return { autofire: s.zp.autofire, score: [...s.score.slice(4, 7)] };
  };
  assert.strictEqual(run(0x00).autofire, 4, '$07E5 = $00 -> $35 = 4');
  assert.strictEqual(run(0x10).autofire, 4, '$07E5 = $10 -> $35 = 4: LOW NIBBLE');
  assert.strictEqual(run(0x07).autofire, 0x14, '$07E5 = $07 -> neither arm');
  const five = run(0x05);
  assert.strictEqual(five.autofire, 0x14, '$07E5 = $05 -> NOT rapid fire');
  // $8960 is `LDA #$10 / JSR $8455`, and $8455 puts A in $9A -- the MIDDLE byte,
  // so the bonus is +$001000 and not +$0010. Starting from $07E5 = $05, i.e.
  // score $000500: + $001000 = $001500, + the capsule's own $0050 = $001550.
  assert.deepStrictEqual(five.score, [0x50, 0x15, 0x00],
    '$8455 stores A into $9A: the bonus is a hundred capsules, not one kill');
});

test('$894B appends the $8A30 cursor packet, on every capsule', () => {
  // `$8971 JMP $8A30` -- the pickup redraws the meter cursor OUT OF PHASE with
  // $8898's rotation, which is why the cartridge's $8A30 count is 97 where
  // $89E3's is 96 over the same window. RED WHEN: the JMP is dropped (nothing
  // is queued until the next $89E3 phase, 8 frames later).
  const s = ship(0);
  const before = s.vram.cursor;
  pickupCapsule(s, res);
  assert.ok(s.vram.cursor > before, '$8A32 JSR $85E8 appended packet $1A');
  // ...and $8A48 patched one of its bytes, because $42 is now 1.
  assert.ok([...s.vram.q].includes(0x55), '$8A46 LDA #$55 / STA $0700,X');
});

// ------------------------------------------------------- $8974, the six arms

test('$8974: the ship must be EXACTLY alive, and B must be HELD', () => {
  // `CMP #$01 / BNE $8983` and `LDA $07,X / AND #$40`. RED WHEN: the status test
  // becomes `>= 1` (a dying ship spends its meter) or the button read moves to
  // $05, the edge byte -- which is what `capsule-consume` catches in the corpus.
  for (const status of [0, 2, 3]) {
    const s = ship(1);
    s.obj.status[0] = status;
    applyCapsule(s, res);
    assert.strictEqual(s.zp.speed, 0, `$0100 = ${status} spends nothing`);
    assert.strictEqual(s.zp.meter, 1, '...and keeps the capsule');
  }
  const noB = ship(1, BTN.A | BTN.RIGHT);
  applyCapsule(noB, res);
  assert.strictEqual(noB.zp.speed, 0, 'A and RIGHT are not B');
  const yesB = ship(1, BTN.B | BTN.A);
  applyCapsule(yesB, res);
  assert.strictEqual(yesB.zp.speed, 1, 'B alongside A still applies');
});

test('jt_8989: the six arms, then the six already-owned refusals', () => {
  // The corpus's `capsule-sweep` is the primary witness (thirteen one-frame
  // pokes, every transition measured on the cartridge first). This is the same
  // table as a unit, so that a break shows up as one named row rather than as
  // twenty frames of w_0042. RED WHEN: any arm writes the wrong byte, or a
  // refusal consumes the capsule.
  //
  // SPEED UP IS NOT IN THIS TABLE and that is the finding, not an omission: it
  // is the one arm with no owned test at all. It has its own test below.
  const arms = [
    [1, 'SPEED UP', null,                         (s) => s.zp.speed, 1, null],
    [2, 'MISSILE',  (s) => { s.zp.missile = 1; }, (s) => s.zp.missile, 1, 1],
    [3, 'DOUBLE',   (s) => { s.zp.weapon = 2; },  (s) => s.zp.weapon, 2, 2],
    [4, 'LASER',    (s) => { s.zp.weapon = 1; },  (s) => s.zp.weapon, 1, 1],
    [5, 'OPTION',   (s) => { s.zp.options = 2; }, (s) => s.zp.options, 1, 2],
    [6, 'SHIELD',   (s) => { s.zp.shield = 5; },  (s) => s.zp.shield, 5, 5],
  ];
  for (const [meter, name, own, read, applied, kept] of arms) {
    const fresh = ship(meter);
    applyCapsule(fresh, res);
    assert.strictEqual(read(fresh), applied, `${name} applies`);
    assert.strictEqual(fresh.zp.meter, 0, `${name} consumes the capsule`);
    assert.deepStrictEqual(fresh.sfx, [0x0E], `${name} requests sfx $0E`);
    if (own === null) continue;                   // $89A1 has no refusal arm

    const owned = ship(meter);
    own(owned);
    applyCapsule(owned, res);
    assert.strictEqual(read(owned), kept, `${name} already owned: no change`);
    assert.strictEqual(owned.zp.meter, meter,
      `${name} already owned: THE CAPSULE IS KEPT`);
    assert.deepStrictEqual(owned.sfx, [], `${name} refused: no sound either`);
  }
});

test('$89A1: SPEED UP has no cap, no owned test, and wraps at 255', () => {
  // MEASURED: $42 poked to 1 on every frame with B held gave 22 increments in 21
  // frames and $40 = 22, with no clamp anywhere (00-recon-powerups.md 3), and
  // `capsule-sweep` applies it twice from $40 = 0 and 1. The saturation a PLAYER
  // feels is $A006's `min(($40+2) & $FF, $10)` -- and it is that AND that makes
  // $40 = 254 freeze the ship, so a port that clamps $40 here breaks the ship.
  // RED WHEN: this arm clamps, or gains an "already owned" test.
  const s = ship(1);
  s.zp.speed = 0xFF;
  applyCapsule(s, res);
  assert.strictEqual(s.zp.speed, 0, '$89A1 INC $40 is an 8-bit INC');
  // ...and only SPEED UP redraws the cursor: $89AC JMP $8A30, where arms 2-6 end
  // at $89DD. The other five leave the old cursor on the bar until $8898 comes
  // round to $89E3 again.
  const speedUp = ship(1);
  const before = speedUp.vram.cursor;
  applyCapsule(speedUp, res);
  assert.ok(speedUp.vram.cursor > before, '$89AC JMP $8A30');
  const shield = ship(6);
  const b2 = shield.vram.cursor;
  applyCapsule(shield, res);
  assert.strictEqual(shield.vram.cursor, b2, '$8997 ends at $89DD, no redraw');
});

test('$89D3: OPTION is capped at 2 by the arm, and 1 still applies', () => {
  // `CMP #$02 / BCS $8983` -- the refusal is `>= 2`, not `!= 0`, which is why
  // `capsule-sweep` gets TWO Options out of two consecutive OPTION cells.
  // RED WHEN: the compare becomes `BNE`/`!= 0` (one Option refuses the second).
  const one = ship(5); one.zp.options = 1;
  applyCapsule(one, res);
  assert.strictEqual(one.zp.options, 2, '1 -> 2 applies');
  assert.strictEqual(one.zp.meter, 0);
  const two = ship(5); two.zp.options = 2;
  applyCapsule(two, res);
  assert.strictEqual(two.zp.options, 2, '2 refuses');
  assert.strictEqual(two.zp.meter, 5, '...and keeps the capsule');
});

test('$8984: a $42 outside 0..6 is loud, because jt_8989 has seven entries', () => {
  // $894B's wrap makes this unreachable, and $42 is pokeable -- so a scenario
  // could ask for it. $83E4 would dispatch through the bytes after the table.
  const s = ship(7);
  assert.throws(() => applyCapsule(s, res), /\$8984/);
});

test('$897D: $18 outside 0..1 is loud rather than reading the wrong pad', () => {
  const s = ship(1);
  s.zp.player = 2;
  assert.throws(() => applyCapsule(s, res), /\$897D/);
});

// ---------------------------------------------------------------- $9C45, rank

test('$9C45: $17 = ($44 != 0) + $45 + ($46 != 0) + ($19 != 0)', () => {
  // MEASURED as the walk 0,1,2,3,4 in `capsule-sweep`, which is the whole of
  // what stage 1 can reach ($45 is capped at 2 and $19 is 0). Rows 5 and 6 need
  // $19 != 0 and are unreachable there; they are here because $AFFC indexes at
  // $17 + ($19 != 0) and the tables have seven entries.
  // RED WHEN: $44 or $46 is ADDED rather than tested for zero (the $44 = 2 and
  // $46 = 5 rows separate those), or $45 is tested rather than added.
  const rank = (weapon, options, shield, stage) => {
    const s = bootState(res.manifest);
    s.zp.weapon = weapon; s.zp.options = options; s.zp.shield = shield;
    s.zp19 = stage;
    computeRank(s);
    return s.zp17;
  };
  assert.strictEqual(rank(0, 0, 0, 0), 0);
  assert.strictEqual(rank(2, 0, 0, 0), 1, '$44 = 2 contributes ONE, not two');
  assert.strictEqual(rank(1, 0, 0, 0), 1);
  assert.strictEqual(rank(0, 2, 0, 0), 2, '$45 is ADDED');
  assert.strictEqual(rank(0, 0, 5, 0), 1, '$46 = 5 contributes ONE, not five');
  assert.strictEqual(rank(1, 2, 5, 0), 4, 'stage 1 maximum');
  assert.strictEqual(rank(1, 2, 5, 1), 5, 'and 5 needs $19');
  assert.strictEqual(rank(1, 3, 5, 1), 6, 'the design maximum');
});

test('$9C45 is the ONLY writer of $17, and $9B3E does not wipe it', () => {
  // $9B3E clears $3D-$97; $17 is below that range. So after a death $17 keeps
  // whatever the last $9AC4 computed, and the intro states never reach $9AC4 --
  // measured in `capsule-shield`, where w_0017 goes 1 -> 0 at f647 (the shield
  // running out, still a played frame) and does NOT move again through the
  // death at f658, the 121 dying frames or the respawn intro.
  // RED WHEN: a port recomputes the rank wherever $44/$45/$46 are written, or
  // inside the respawn, which would zero $17 one frame early.
  //
  // THE WIPE IS THE REAL ONE. This test used to zero $44/$45/$46 by assignment
  // and then assert $17 had not moved, which is true of every possible
  // implementation of computeRank -- docs/knowledge/03's first shape, and QA
  // caught it. `respawn()` is $979D/$9B3E itself, so the assertion below now
  // depends on where the port calls computeRank from and can fail.
  const s = bootState(res.manifest);
  s.zp.weapon = 1; s.zp.options = 2; s.zp.shield = 5;
  computeRank(s);
  assert.strictEqual(s.zp17, 4);
  s.substate = 0xA0; s.obj.status[0] = 2; s.zp4C = 0;   // the death, spent
  respawn(s, res);                                      // $979D -> $9B3E
  assert.strictEqual(s.zp.weapon, 0, "$9B3E cleared $44, an input of $17");
  assert.strictEqual(s.zp.shield, 0, '...and $46');
  assert.strictEqual(s.zp17, 4, '$17 is stale until the next $9AC4, by design');
  computeRank(s);
  assert.strictEqual(s.zp17, 0);
});

// ------------------------------------------------- the same-frame consume

test('$9A70 then $9A73: pickup and apply in ONE frame, in that order', () => {
  // The whole reason $8974 reads the HELD byte. `capsule-consume` is the corpus
  // witness (w_0040 0 -> 1 with w_0042 never leaving 0); this is the same claim
  // as two calls in the ROM's order, so a reordering is caught here too.
  // RED WHEN: apply runs before pickup, which makes the touch frame do nothing
  // and the NEXT frame spend the capsule -- a one-frame skew nothing else sees.
  const s = ship(0);
  const i = 9 + ENEMY_BASE;
  s.obj.type[i] = 0x81; s.obj.status[i] = 6;      // a capsule in slot 21
  pickupCapsule(s, res);                          // $9A70 -> $C1AF -> $894B
  assert.strictEqual(s.zp.meter, 1);
  applyCapsule(s, res);                           // $9A73
  assert.strictEqual(s.zp.meter, 0, 'consumed on the touch frame');
  assert.strictEqual(s.zp.speed, 1, 'SPEED UP applied');
});
