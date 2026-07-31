// WAVE 7, THE PARTS NOTHING COULD SEE.
//
// Every test in this file was written because a deliberate mutation of
// `games/gradius/src/` passed BOTH layers of the gate -- 256 unit tests and
// all 35 recorded scenarios, 11695 compared frames. Each one names its
// mutation, and each was seen RED against it and green with it restored
// (docs/worklog/gradius/07-test-hardening.md carries the table).
//
// The nine breaks the probe round found, and what happened to them:
//
//   P1  the force field draws but does not ADVANCE the OAM cursor      closed
//   P3  the $46 == 1 flash is ORed into the SHIP's records too         closed
//   P5  the force field drops the ship's own $0180 mask                closed
//   P6  $8969's score and $896C's sfx swapped                          closed
//   P16 the shield is spent once per FRAME, not once per contact       closed
//   P33 the display list is built from $02 AFTER the INC               closed
//   P7  $8971's cursor moved above $8969's score                       ruled out
//   P8  $C1FD (free the capsule) and $894B (the meter) swapped         ruled out
//   P27 a force field on a slot whose $0120 is 0                       ruled out
//
// The last three are at the bottom of this file with the argument for why a
// check on them would be decoration rather than evidence -- two are provably
// commutative in the ROM as well as in the port, and the third is a state the
// cartridge cannot be in. Wave 6 recorded `shotLoop`'s direction the same way;
// the point of writing them down is that the next agent does not re-open them.
//
// WHY THE ORACLE IS BLIND TO THE FIRST FIVE, in one sentence each, because
// "the corpus cannot see it" is a claim and this file is where it gets its
// reason: the sprite comparison is OAM ENTRY 0 (the split's own record, which
// is copied from $8B08 and never allocated) plus four work COUNTS, so anything
// that moves a sprite without changing how many sprites there are is invisible
// (P1, P3, P5, P33); and no frame of any scenario has two enemies touching the
// ship at once, so a per-frame shield and a per-contact shield compute the same
// 11695 frames (P16 -- MEASURED below, not assumed).

import test from 'node:test';
import assert from 'node:assert';

import { ENEMY_BASE } from '../src/state.js';
import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { buildDisplayList, nextSlot } from '../src/oam.js';
import { playerVsEnemies } from '../src/collision.js';
import { pickupCapsule } from '../src/powerup.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);

/** The four force-field metasprites, read out of the export rather than named. */
const FIELD = [0x5A, 0x5B, 0x5C, 0x5D];

/** A live stage-1 frame: the ship drawing at (100, 80), nothing else on. */
function shipAt(x = 100, y = 80) {
  const s = bootState(res.manifest);
  s.obj.anim[0] = 1;                              // $0120 -- tilt code 1, level
  s.obj.x[0] = x; s.obj.y[0] = y;
  return s;
}

/**
 * Where the display list ACTUALLY started, read back after it was built.
 * `$8B39` rotates `$2F` by +$44 and stores it, so `state.oamBase` after the
 * pass is the byte `$8B45 STA $9C` began from -- not the value before it.
 */
function firstSlot(s) { return s.oamBase | 0; }

// =========================================================== $8B86, the slots

test('$8B86: the force field CLAIMS its OAM slots -- the next object starts AFTER it', () => {
  // THE SCARCE THING IN THIS FRAME IS OAM. `$8AF3`'s -15-slot walk hands out
  // 64 slots to everything on screen, and `$8AAC` advances the cursor ONLY for
  // records it actually stored. The force field is a second `$8AAC` on slot 0
  // ($8B86), so it takes a slot out of the middle of that queue and everybody
  // after it moves down one.
  //
  // MEASURED (probe P1): a port that draws the field at the cursor but returns
  // the cursor UNADVANCED is green on all 256 unit tests and green on all 35
  // scenarios / 11695 frames -- because `spritesStored`, `spriteRecords` and
  // `msExpanded` are all unchanged by it, and those four counters plus OAM
  // entry 0 are the whole of what the oracle reads about sprites. The visible
  // consequence is that THE NEXT OBJECT OVERWRITES THE FORCE FIELD: one shield
  // sprite silently disappears the moment an Option exists.
  //
  // The state is an ordinary one: a shield and one Option, which is `$45 = 1`
  // and `$46 != 0` -- rank 2 in `$9C45`'s own arithmetic, and `capsule-sweep`
  // reaches rank 4.
  // RED WHEN: the field does not advance the cursor, is expanded before the
  // ship instead of after ($8B86 is below $8B5F), or is drawn for any slot but
  // 0 ($8B67 LDA $9D / BNE $8B89).
  const s = shipAt();
  s.obj.anim[1] = 4;                              // $0121 -- Option 1, $A0D0
  s.obj.x[1] = 60; s.obj.y[1] = 80;
  s.zp.shield = 3;                                // no flash: $46 != 1
  s.frame = 0;                                    // $02 -> field id $5A
  buildDisplayList(s, res.metasprites);

  const ship = res.metasprites[1], field = res.metasprites[0x5A],
        option = res.metasprites[4];
  assert.strictEqual(field.length, 1, 'the force field is ONE record');
  assert.strictEqual(s.work.msExpanded, 3,
    'three $8AAC calls: the ship, its ONE force field, and the Option');
  // Walk the cursor by hand: four ship records, then the field, then the
  // Option's two. The walk is $8AF3's, spelled out here rather than taken from
  // the port, so a wrong stride is a failure and not a shared assumption.
  let cur = firstSlot(s);
  for (let i = 0; i < ship.length; i++) cur = nextSlot(cur);
  const fieldSlot = cur;
  assert.strictEqual(s.shadowOam[fieldSlot + 1], field[0][1],
    'the force field is not at the slot after the ship');
  cur = nextSlot(cur);
  assert.strictEqual(s.shadowOam[cur + 1], option[0][1],
    'the Option did not start AFTER the force field -- the field lost its slot');
  assert.notStrictEqual(option[0][1], field[0][1],
    'this test would prove nothing if the two tiles were equal');

  // ...and the same page with no shield: the Option moves UP one slot, which is
  // the same claim from the other side.
  const bare = shipAt();
  bare.obj.anim[1] = 4; bare.obj.x[1] = 60; bare.obj.y[1] = 80; bare.frame = 0;
  buildDisplayList(bare, res.metasprites);
  assert.strictEqual(firstSlot(bare), firstSlot(s), 'same $2F, same walk');
  assert.strictEqual(bare.shadowOam[fieldSlot + 1], option[0][1],
    'without the shield the Option takes the slot the field was using');
});

test('$8B79/$8B52: the flash is the FIELD\'s own $9E, and the ship keeps its own', () => {
  // `$8B52 LDA $0180,X / STA $9E` runs ONCE, before the ship's own $8AAC, and
  // `$8B79 LDA #$03 / STA $9E` overwrites it AFTERWARDS -- so the last-hit
  // flash cannot reach the ship's four records, whose attribute bytes were
  // already stored. A port that computes the mask before the first expansion
  // recolours the ship as well, which is a two-line edit and (probe P3) green
  // on 256 unit tests and 11695 compared frames: the attribute bytes of every
  // sprite except OAM entry 0 are read by nothing in the gate.
  // RED WHEN: the flash is applied to the ship's expansion as well as the
  // field's.
  const s = shipAt();
  s.zp.shield = 1;                                // $46 == 1: the flash frame
  s.frame = 0;
  buildDisplayList(s, res.metasprites);

  const ship = res.metasprites[1];
  let cur = firstSlot(s);
  for (const [, , attr] of ship) {                // the ship's own four records
    assert.strictEqual(s.shadowOam[cur + 2], attr,
      'the $46 == 1 flash reached the SHIP -- $9E is written after $8B5F, '
      + 'not before it');
    cur = nextSlot(cur);
  }
  assert.strictEqual(s.shadowOam[cur + 2], res.metasprites[0x5A][0][2] | 3,
    'the field itself did not flash');
});

test('$8B52 -> $9E -> $8AE0: the field inherits $0180, and the flash REPLACES it', () => {
  // A TRANSCRIPTION CHECK, and it is labelled one because the parameter is a
  // constant in every measured frame: `$0180` (slot 0's attribute mask) reads 0
  // in all 35 seeds, so nothing in the corpus can tell "the field ORs $9E in"
  // from "the field ORs zero in". What the ROM says is stronger than what the
  // corpus can witness, and the ROM is the authority:
  //
  //   8B52  BD 80 01  LDA $0180,X / 85 9E STA $9E     ... survives the JSR ...
  //   8B79  A9 03     LDA #$03    / 85 9E STA $9E     STA, not ORA
  //   8AE0  05 9E     ORA $9E                         per record, both times
  //
  // so at `$46 != 1` the field carries the ship's mask, and at `$46 == 1` the
  // mask is GONE, replaced by 3. Both halves are asserted; a port that ORed the
  // 3 into the existing mask would pass the first and fail the second.
  // RED WHEN: the field is expanded with a hardcoded 0 (probe P5 -- green on
  // the whole gate), or the flash ORs instead of replacing.
  const at = (shield, mask) => {
    const s = shipAt();
    s.obj.attrMask[0] = mask;                     // $0180
    s.zp.shield = shield; s.frame = 0;
    buildDisplayList(s, res.metasprites);
    let cur = firstSlot(s);
    for (let i = 0; i < res.metasprites[1].length; i++) cur = nextSlot(cur);
    return s.shadowOam[cur + 2];
  };
  const own = res.metasprites[0x5A][0][2];        // $21, the record's own attr
  assert.strictEqual(at(3, 0x40), own | 0x40, '$9E carried $0180 across $8B5F');
  assert.strictEqual(at(1, 0x40), own | 0x03,
    '$8B79 STA $9E -- the mask is REPLACED by 3, not ORed with it');
  assert.strictEqual(at(3, 0x00), own, 'and the measured seed value changes nothing');
});

test('$80A7 before $80BE: the display list is built from the OLD $02', () => {
  // The force field's animation is `$8B7D LDA $02 / LSR / LSR / AND #$03 /
  // ADC #$5A`, and `$02` is INC'd at `$80BE` -- inside `$80AA JSR $80BE`,
  // which is the instruction AFTER `$80A7 JSR $8B10`. So the field drawn in a
  // frame uses the counter as it stood at the START of that NMI.
  //
  // Probe P33 moved the INC above `buildDisplayList`: green on 256 unit tests
  // and on all 35 scenarios, because the id picks a metasprite and the oracle
  // compares no sprite but entry 0. It is a one-frame animation phase error in
  // the only sprite wave 7 added.
  // RED WHEN: $02 is incremented before the display list is built, or the
  // field's phase is read from anything but $02.
  for (const [frame, want] of [[3, 0x5A], [4, 0x5B], [7, 0x5B], [8, 0x5C]]) {
    const s = shipAt();
    s.zp.shield = 5;
    s.frame = frame;
    const x0 = s.obj.x[0], y0 = s.obj.y[0], anim0 = s.obj.anim[0];
    nmi(s, 0x00, res);                            // a whole frame, no buttons
    assert.strictEqual(s.frame, (frame + 1) & 0xFF, '$80BE INC $02 did not run');

    let cur = firstSlot(s);
    for (let i = 0; i < res.metasprites[anim0].length; i++) cur = nextSlot(cur);
    assert.strictEqual(s.shadowOam[cur + 1], res.metasprites[want][0][1],
      `$02 = ${frame}: the field should be metasprite $${want.toString(16)}`);
    // ...and the record is at the position the ship had BEFORE the state
    // machine moved it, which is the same ordering seen from the other end.
    assert.strictEqual(s.shadowOam[cur], (y0 + res.metasprites[want][0][0]) & 0xFF);
    assert.strictEqual(s.shadowOam[cur + 3], (x0 + res.metasprites[want][0][3]) & 0xFF);
  }
  // the four ids really are four different metasprites
  assert.strictEqual(new Set(FIELD.map((i) => res.metasprites[i][0][1])).size, 4);
});

// ==================================================== $C1C1, the last shield

test('$C1C1: the shield is spent ONCE PER CONTACT, and the last point goes to slot 9', () => {
  // THE SCARCE THING HERE IS A HIT POINT. `$C1C1 DEC $46` sits inside the arm
  // that runs per TOUCHING ENEMY, and `$C1D3 JMP $C136` goes back into the
  // sweep -- so two enemies inside the ship's box on the same frame cost two
  // points, and if only one is left the HIGHER slot spends it and the lower one
  // kills the ship.
  //
  // MEASURED, because "the corpus cannot see this" is otherwise just a claim:
  // instrumenting `$C1BD` in the port and running all 35 recorded scenarios
  // through porttrace gives 10063 swept frames with ZERO contacts, 9 frames
  // with exactly ONE, and none with two (capsule-shield 6, capsule-die 1,
  // diag-ru-ld 1, lr-both 1). A port that spent one hit point per FRAME rather
  // than per contact (probe P16) is therefore green on every one of the 11695
  // compared frames, and green on the 256 unit tests as well.
  // RED WHEN: the DEC moves out of the per-enemy arm, the zero test moves
  // BELOW the DEC (which would make the fifth hit kill), or the sweep stops
  // after an absorbed hit.
  const two = (shield) => {
    const s = bootState(res.manifest);
    s.obj.x[0] = 100; s.obj.y[0] = 96;
    for (const j of [9, 3]) {                     // both inside the 16x16 box
      const i = j + ENEMY_BASE;
      s.obj.type[i] = 0x85;                       // armed, initialised
      s.obj.x[i] = 100; s.obj.y[i] = 100;
    }
    s.zp.shield = shield;
    return s;
  };
  const both = two(2);
  assert.strictEqual(playerVsEnemies(both, res), false, 'two hits, two points');
  assert.strictEqual(both.zp.shield, 0, '$C1C1 ran TWICE in one frame');
  assert.strictEqual(both.obj.type[9 + ENEMY_BASE], 2, 'slot 9 destroyed');
  assert.strictEqual(both.obj.type[3 + ENEMY_BASE], 2, 'slot 3 destroyed too');
  assert.strictEqual(both.substate, 0x80, 'and the ship is alive');

  const last = two(1);
  assert.strictEqual(playerVsEnemies(last, res), true, 'the second hit kills');
  assert.strictEqual(last.zp.shield, 0);
  assert.strictEqual(last.obj.type[9 + ENEMY_BASE], 2,
    'the LAST point went to slot 9 -- the sweep descends');
  assert.strictEqual(last.obj.type[3 + ENEMY_BASE], 0x85,
    '$C1D6 abandons the sweep, so slot 3 is never destroyed');
  assert.strictEqual(last.substate, 0xA0, '$C1F1 STA $1B');
  assert.strictEqual(last.spawn.zA8, 3, '$A8 is left where the death happened');
});

// ============================================ $8969 then $896C, the tail order

test('$894B\'s tail: $845B scores BEFORE $896C asks for the sound', () => {
  // `$8969 JSR $845B / $896C LDA #$0D / JSR $EC1E` -- and the score adder can
  // request a sound of its own: `$84F2 LDA #$36 / JSR $EC1E`, the extra life,
  // reached from inside `$845B` when the new score crosses `$2A,X`. So the
  // order of the pickup's two tail steps IS observable, on exactly the frames a
  // capsule takes the player past 200000 points, and the sfx list is `36 0D`.
  //
  // Probe P6 swapped them: green on 256 unit tests and on all 35 scenarios,
  // because no scenario gets past $0164 and `state.sfx` is compared by nothing
  // until wave 8 wires $EC1E. It is a real ordering and this is the only thing
  // in the tree that holds it.
  // RED WHEN: $896C's push happens before $8969's score.
  const s = bootState(res.manifest);
  s.obj.status[0] = 1;
  s.zp.meter = 0;
  s.extraLife[0] = 0x02;                          // $2A -- 200000, the seed
  s.lives[0] = 3;                                 // $20
  s.score[4] = 0x50; s.score[5] = 0x99; s.score[6] = 0x01;   // 199950
  pickupCapsule(s, res);
  assert.deepStrictEqual([...s.score.slice(4, 7)], [0x00, 0x00, 0x02],
    '+$0050 through $84A9: 199950 -> 200000');
  assert.deepStrictEqual(s.sfx, [0x36, 0x0D],
    '$84F2 fires inside $845B, so the extra life is asked for FIRST');
  assert.strictEqual(s.lives[0], 4, '$84F0 INC $20,X');
  assert.strictEqual(s.extraLife[0], 0x03, '$84E5 -- the threshold went up by 1');
});

// ============================================================ RULED OUT ======
//
// Three mutations passed the whole gate and are NOT tested here, on purpose.
// A check on any of them would be a check that cannot fail for a reason, which
// docs/knowledge/03 says is worse than no check at all: it reads as coverage.
//
// P7 -- `$8971 JMP $8A30` (the cursor) moved ABOVE `$8969 JSR $845B` (the
//   score). UNOBSERVABLE IN THE ROM, not merely in the port: $8A30 reads $42
//   and $0E and writes $0700,X; $845B reads and writes $07E0-$07EA, $2A,X,
//   $20,X and the sound queue. The two touch no byte in common, in either
//   direction, and neither can fail. QA reported the same result independently.
//
// P8 -- `$C1FD` (free the touched slot) and `$894B` (the meter) swapped.
//   Same shape: $AEF8 writes $030C,X / $010C,X / $012C,X / $014C,X / $016C,X
//   for one enemy slot and reads nothing else; $894B touches $42, the score,
//   the sound queue and the VRAM queue. Disjoint, so the two orders compute
//   the same state on the cartridge too.
//
// P27 -- a force field drawn for a slot whose `$0120` is 0. The port's
//   `forceField` is called after `$8B50 BEQ $8B89`'s `continue`, which is where
//   the ROM puts it; hoisting it above is green everywhere. The state needed to
//   witness it is `$0120 = 0` with `$46 != 0` and `$1B AND #$70 == 0`, and the
//   game cannot be in it: $9B83 sets $0120 = 1 at every stage entry, $A0BE
//   rewrites it with the tilt code (1..3) every 8 frames, and the only way $46
//   is non-zero after a death is impossible because $9B3E's wipe of $3D-$97
//   clears it. Testing it would mean inventing a state to reach code that
//   cannot run -- docs/knowledge/02 trap 4.
