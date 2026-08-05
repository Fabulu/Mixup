// WAVE 79 -- `$2497AA`, THE AUTO-SHOT.
//
// Every expected value here is DERIVED FROM THE LISTING, never from running the
// port and writing down what came out (`docs/knowledge/10`: a green test over a
// wrong transcription is the seventh time this project has been fooled).  The
// listing, in full, is 30 bytes:
//
//   2497AA: 4a390080380f  tst.b   $80380F        the AUTO-SHOT operator setting
//   2497B0: 674c          beq.b   $2497FE
//   2497B2: 082e00060018  btst.b  #$6,$18(A6)    RAW mirror bit 6 = Button 3
//   2497B8: 6744          beq.b   $2497FE
//   2497BA: 4a2e003c      tst.b   $3C(A6)
//   2497BE: 663e          bne.b   $2497FE
//   2497C0: 41f9008104aa  lea.l   $8104AA,A0
//   2497C6: 4a2d0007      tst.b   $7(A5)
//   2497CA: 6706          beq.b   $2497D2
//   2497CC: 41f90081050e  lea.l   $81050E,A0
//   2497D2: 08ae00040019  bclr.b  #$4,$19(A6)
//   2497D8: 08ae00030001  bclr.b  #$3,$1(A6)
//   2497DE: 08a800030001  bclr.b  #$3,$1(A0)
//   2497E4: 086e00040001  bchg.b  #$4,$1(A6)
//   2497EA: 6612          bne.b   $2497FE
//   2497EC: 08ee00030001  bset.b  #$3,$1(A6)
//   2497F2: 08e800030001  bset.b  #$3,$1(A0)
//   2497F8: 08ee00040019  bset.b  #$4,$19(A6)
//
// and then it FALLS THROUGH to `$2497FE`.  Half of these tests are about the
// fall-through rather than the block, because that is where the wave's real bug
// was: the port cached `($19,A6)` before the block ran, so the edge the block
// synthesises was invisible to `$249B48`, which reads it eight instructions
// later.  See `AUTOSHOT_MUTATE['autoshot-edge-cached']`.
//
// WHY A UNIT TEST AND NOT ONLY THE LADDER.  `seedcmp.mjs --break` DOES see
// every one of these mutations go red on `stage1-sweep` (worklog 79 has the
// table), and that is the stronger evidence.  What it cannot do is separate
// them: on a ladder that holds Button 3 for 17,500 frames, six different wrong
// ports are all "red on pf1 at the first compared frame".  These tests say
// WHICH instruction each one falsifies.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import { UnportedLog } from '../src/unported.js';
import {
  autoShot2497AA, bombAndShotGuards, AUTOSHOT_MUTATE,
} from '../src/player.js';

const REC = RAM.player1;                 // $8103E6
const OPTF = RAM.p1Options + OPT.flags1; // $8104AB
const SET = 0x80380f;                    // the operator byte

/** Every read `$249BFC` makes returns 0, which makes the scan length 0 and the
 *  spawn a no-op.  These tests are about the bits `$249B48..$249BDE` writes on
 *  the way there, not about the record; `tests/shots.test.js` owns the record.
 *  Same device as `fire.test.js`'s ZERO_ROM and for the same reason. */
const ZERO_ROM = { u8: () => 0, u16: () => 0, u32: () => 0, i16: () => 0 };

/** A player record in the state `stage1-sweep` seeds at lf2000, reduced to the
 *  fields these two routines read.  MEASURED there: `pf1`=0, `p3c`=0,
 *  `oflg1`=$03, ship type 0, formation 2, `$8130CE` past 4. */
function bench({ setting = 1, held = 0x40, edge = 0x00, p3c = 0 } = {}) {
  const ram = new Ram(null);
  ram.setU8(SET, setting);
  ram.setU8(REC + P.dirByte, held);              // ($18,A6) RAW
  ram.setU8(REC + P.btnByte, edge);              // ($19,A6) EDGE
  ram.setU8(REC + 0x3c, p3c);
  ram.setU8(REC + P.playerIdx, 0);
  ram.setU8(OPTF, 0x03);                         // bits 0,1 -- init + live
  ram.setU16(REC + P.shipSel, 0);                // $249BE2 -> ship 0
  ram.setU16(REC + 0x5a, 2);                     // $249C28 formation 2
  ram.setU16(0x8130ce, 8);                       // $2497FE: past the >= 4 gate
  return { ram, ctx: { unportedLog: new UnportedLog(), rom: ZERO_ROM } };
}

test.afterEach(() => { AUTOSHOT_MUTATE.value = null; });

// ============================================================ 1. THE THREE GATES

test('$2497AA: the operator byte $80380F off makes the whole block inert', () => {
  const { ram } = bench({ setting: 0 });
  autoShot2497AA(ram, REC, ram.u8(REC + P.dirByte), 0);
  assert.equal(ram.u8(REC + P.flags1), 0x00, 'no bit of ($1,A6) may move');
  assert.equal(ram.u8(REC + P.btnByte), 0x00, 'no edge may be synthesised');
  assert.equal(ram.u8(OPTF), 0x03, 'the option record is untouched');
});

test('$2497B2 reads the RAW byte ($18,A6), NOT the edge ($19,A6)', () => {
  // THE DISTINCTION THE WHOLE FEATURE RESTS ON.  A press produces one frame
  // with the edge bit set; a HOLD produces raw=$40 with edge=$00 on every frame
  // after the first.  If this instruction read the edge, auto-shot would fire
  // once per press -- i.e. it would be an ordinary button.
  const { ram } = bench({ held: 0x40, edge: 0x00 });
  autoShot2497AA(ram, REC, ram.u8(REC + P.dirByte), 0);
  assert.equal(ram.u8(REC + P.btnByte) & 0x10, 0x10,
    'held-but-no-edge must still synthesise');
  // ...and the converse: edge without raw must NOT.
  const b = bench({ held: 0x00, edge: 0x40 });
  autoShot2497AA(b.ram, REC, b.ram.u8(REC + P.dirByte), 0);
  assert.equal(b.ram.u8(REC + P.btnByte), 0x40, 'edge-only must not fire');
});

test('$2497BA: a non-zero ($3c,A6) suppresses the block entirely', () => {
  // ($3c,A6) is 1 for exactly as long as the cadence machine saw a real edge
  // last frame ($249B50 sets it, $249B96 clears it), so this is what stops a
  // held Button 1 and a held Button 3 from stacking into a double rate.
  const { ram } = bench({ p3c: 1 });
  autoShot2497AA(ram, REC, ram.u8(REC + P.dirByte), 0);
  assert.equal(ram.u8(REC + P.flags1), 0x00);
  assert.equal(ram.u8(REC + P.btnByte), 0x00);
});

// ================================================== 2. THE DIVIDER AND ITS PHASE

test('$2497E4 bchg + $2497EA bne: fire on the frame bit 4 goes 0 -> 1', () => {
  // `bchg` sets Z from the OLD bit, so `bne` is taken when the bit was ALREADY
  // SET.  Both arms are asserted, because a port that tested the new bit fires
  // on exactly the other frames and is right half the time by construction.
  const on = bench();                       // bit 4 clear -> the FIRE arm
  autoShot2497AA(on.ram, REC, 0x40, 0);
  assert.equal(on.ram.u8(REC + P.flags1), 0x18, 'bits 3 and 4 both set');
  assert.equal(on.ram.u8(REC + P.btnByte), 0x10, '$2497F8 synthesised the edge');
  assert.equal(on.ram.u8(OPTF), 0x0b, '$2497F2 set the option record bit 3');

  const off = bench();
  off.ram.setU8(REC + P.flags1, 0x10);      // bit 4 already set -> the SKIP arm
  autoShot2497AA(off.ram, REC, 0x40, 0);
  assert.equal(off.ram.u8(REC + P.flags1), 0x00,
    'bit 4 toggled off, bit 3 left clear by $2497D8');
  assert.equal(off.ram.u8(REC + P.btnByte), 0x00, 'no edge on the off frame');
  assert.equal(off.ram.u8(OPTF), 0x03, '$2497DE cleared, $2497F2 not reached');
});

test('$2497D2/$2497D8/$2497DE run on BOTH arms, before the divider', () => {
  // The three `bclr`s are above `$2497E4`, so they execute even on the frame
  // that skips out at `$2497EA`.  A port that put them inside the fire arm
  // leaves last frame's synthetic edge standing in ($19,A6).
  const { ram } = bench();
  ram.setU8(REC + P.flags1, 0x18);          // bit 4 set -> skip arm; bit 3 set
  ram.setU8(REC + P.btnByte, 0x10);         // ...and a stale synthetic edge
  ram.setU8(OPTF, 0x0b);                    // ...and a stale option bit 3
  autoShot2497AA(ram, REC, 0x40, 0);
  assert.equal(ram.u8(REC + P.btnByte), 0x00, '$2497D2 cleared the stale edge');
  assert.equal(ram.u8(REC + P.flags1), 0x00, '$2497D8 cleared bit 3');
  assert.equal(ram.u8(OPTF), 0x03, '$2497DE cleared the option bit 3');
});

test('$2497C0/$2497CC pick the option record by ($7,A5)', () => {
  const p1 = bench();
  autoShot2497AA(p1.ram, REC, 0x40, 0);
  assert.equal(p1.ram.u8(RAM.p1Options + OPT.flags1) & 0x08, 0x08);
  assert.equal(p1.ram.u8(RAM.p2Options + OPT.flags1) & 0x08, 0x00);

  const p2 = bench();
  p2.ram.setU8(RAM.player2 + P.dirByte, 0x40);
  autoShot2497AA(p2.ram, RAM.player2, 0x40, 1);
  assert.equal(p2.ram.u8(RAM.p2Options + OPT.flags1) & 0x08, 0x08);
  assert.equal(p2.ram.u8(RAM.p1Options + OPT.flags1) & 0x08, 0x00);
});

// ======================================= 3. THE FALL-THROUGH -- WHERE THE BUG WAS

test('the synthesised edge REACHES $249B48 in the SAME frame', () => {
  // **THE REGRESSION TEST FOR THE WAVE-79 BUG.**  `$2497F8` writes ($19,A6);
  // `$249B48` reads it from memory eight instructions later.  A port that
  // cached the byte on entry to the weapon block sees `btst #4` fail, takes the
  // no-edge arm at `$249B96`, and never spawns -- while still looking like it
  // "ported $2497AA".  The witnesses are `$249B50`'s ($3c,A6) = 1 and
  // `$249B7C`'s bit 3 of the state HIGH byte, neither of which the no-edge arm
  // can produce.
  const { ram, ctx } = bench();
  bombAndShotGuards(ram, REC, ctx, 0);
  assert.equal(ram.u8(REC + 0x3c), 1, '$249B50 move.b #$1,($3c,A6)');
  assert.equal(ram.btst8(REC + P.state, 3), 1, '$249B7C bset #3,(A6)');
  assert.equal(ram.u8(REC + 0x2b), 0, '$249B80 clr.b ($2b,A6)');
  assert.equal(ram.u8(REC + P.flags1) & 0x08, 0,
    '$249B74 bclr #3 consumed the synthetic marker');
});

test('held Button 3 spawns on ALTERNATE frames, not every frame', () => {
  // Six frames of a HELD button 3, driving the block and its fall-through the
  // way `$2494FA` does.  ($19,A6) is re-derived per frame by the input read at
  // the top of the player update, which for a hold is `edge = 0`; everything
  // else is carried.  The expected pattern is a CONSEQUENCE of three
  // instructions in two routines -- `$2497E4`'s bchg, `$249B50`/`$249B96`'s
  // ($3c,A6) and `$249B9E`'s `bclr #4,($1,A6)` -- and it is 1,0,1,0,1,0.
  const { ram, ctx } = bench();
  const fired = [];
  for (let f = 0; f < 6; f++) {
    ram.setU8(REC + P.dirByte, 0x40);      // held
    ram.setU8(REC + P.btnByte, 0x00);      // no real edge
    bombAndShotGuards(ram, REC, ctx, 0);
    fired.push(ram.u8(REC + 0x3c));
  }
  assert.deepEqual(fired, [1, 0, 1, 0, 1, 0]);
});

test('with the setting OFF, six held frames fire nothing at all', () => {
  const { ram, ctx } = bench({ setting: 0 });
  for (let f = 0; f < 6; f++) {
    ram.setU8(REC + P.dirByte, 0x40);
    ram.setU8(REC + P.btnByte, 0x00);
    bombAndShotGuards(ram, REC, ctx, 0);
    assert.equal(ram.u8(REC + 0x3c), 0, `frame ${f}`);
  }
});

// ============================================ 4. EVERY MUTATION, SEEN TO FAIL
//
// `docs/knowledge/03`: a check never seen red is not a check.  This drives the
// SHIPPED seam (`AUTOSHOT_MUTATE`) rather than a copy, so the red half needs no
// source edit and cannot drift away from the code it guards.
//
// **AND TWO OF THE SEVEN ARE INVISIBLE UNDER A PLAIN HOLD, WHICH IS A FINDING
// ABOUT THE ROM AND NOT ABOUT THE TEST.**  `$2497BA`'s ($3c,A6) gate and
// `$2497E4`'s bchg divider BOTH enforce the same alternation when Button 3 is
// simply held, so either one alone reproduces 1,0,1,0,1,0 and dropping either
// one is a no-op there.  They come apart only where one of them stops running:
//
//   `laser-hold`      ($3f,A6) non-zero -- `$249B40 bne $249E4E` returns BEFORE
//                     `$249B50`, so ($3c,A6) is frozen and `$2497BA` can no
//                     longer divide anything.  Only the bchg does.  This is the
//                     LASER's own state ($24C282 sets the byte, $24C2D6 clears
//                     it), not a contrivance.
//   `after-real-edge` a real Button-1 edge on frame 0 sets ($3c,A6) = 1 with
//                     the block inert, so frame 1 is the one `$2497BA`
//                     suppresses and the bchg would not.
//
// Declaring that here, before the assertions, is the same device as
// `breakage.mjs EXPECTED_GREEN`: an unexplained pass is not evidence, and a
// mutation quietly deleted because it would not go red is the failure mode
// `docs/knowledge/03` was written about.

/** Six held frames of a scenario; one 4-digit word per frame:
 *  ($3c,A6) / bit 4 of ($19,A6) / bit 4 of ($1,A6) / bit 3 of $8104AB. */
function trace({ dead = 0, firstEdge = 0 } = {}) {
  const { ram, ctx } = bench();
  ram.setU8(REC + P.dead, dead);                 // $249B40 tst.b ($3f,A6)
  const out = [];
  for (let f = 0; f < 6; f++) {
    const real = f === 0 && firstEdge;
    ram.setU8(REC + P.dirByte, real ? 0x00 : 0x40);
    ram.setU8(REC + P.btnByte, real ? 0x10 : 0x00);
    bombAndShotGuards(ram, REC, ctx, 0);
    out.push(`${ram.u8(REC + 0x3c)}${(ram.u8(REC + P.btnByte) >> 4) & 1}`
      + `${(ram.u8(REC + P.flags1) >> 4) & 1}${(ram.u8(OPTF) >> 3) & 1}`);
  }
  return out.join(' ');
}

const SCENARIOS = {
  hold: {},                          // Button 3 held, nothing else
  'laser-hold': { dead: 1 },         // ...with ($3f,A6) set by the beam
  'after-real-edge': { firstEdge: 1 },  // ...one real Button-1 edge first
};

/** MEASURED from the shipped port, and each digit is derivable from the listing
 *  above: on `hold` the fire frame leaves ($3c,A6)=1, a synthesised edge, bit 4
 *  set and the option bit set, and the off frame leaves only the option bit
 *  standing because `$2497BA` skips the block that would have cleared it. */
const ROM_TRACE = {
  hold: '1111 0001 1111 0001 1111 0001',
  'laser-hold': '0111 0000 0111 0000 0111 0000',
  'after-real-edge': '1100 0000 1111 0001 1111 0001',
};

/** Which scenario each mutation is SEPARATED by, and the scenarios in which it
 *  is a declared no-op.  A mutation with no separating scenario would be a
 *  finding to report, not a test to delete. */
const SEPARATED_BY = {
  'autoshot-dropped': 'hold',
  'autoshot-edge-cached': 'hold',
  'autoshot-every-frame': 'laser-hold',
  'autoshot-inverted': 'hold',
  'autoshot-on-edge': 'hold',
  'autoshot-no-3c-gate': 'after-real-edge',
  'autoshot-no-optbit': 'hold',
};

/** The pairs that are PROVABLY INDISTINGUISHABLE, with the reason.  Asserted,
 *  not just commented: if a later change makes `$2497E4` observable under a
 *  plain hold, that is a behaviour change and this test must say so. */
const DECLARED_NO_OP = [
  ['autoshot-every-frame', 'hold',
    '$2497BA already suppresses the frame after a fire, so dropping $2497E4 '
    + 'changes nothing while the cadence machine is running'],
  ['autoshot-every-frame', 'after-real-edge', 'same reason'],
];

for (const [name, expected] of Object.entries(ROM_TRACE)) {
  test(`the shipped port's ${name} trace is the ROM's`, () => {
    assert.equal(trace(SCENARIOS[name]), expected);
  });
}

for (const [name, scen] of Object.entries(SEPARATED_BY)) {
  test(`RED-VALIDATION: ${name} is caught by ${scen}`, () => {
    AUTOSHOT_MUTATE.value = name;
    const got = trace(SCENARIOS[scen]);
    assert.notEqual(got, ROM_TRACE[scen],
      `${name} did NOT diverge from the ROM under ${scen}: ${got}. A mutation `
      + `that cannot be seen is a finding, not a pass -- report it rather than `
      + `deleting it (docs/knowledge/03)`);
  });
}

for (const [name, scen, why] of DECLARED_NO_OP) {
  test(`DECLARED NO-OP: ${name} under ${scen} -- ${why}`, () => {
    AUTOSHOT_MUTATE.value = name;
    assert.equal(trace(SCENARIOS[scen]), ROM_TRACE[scen],
      'this pair is declared indistinguishable; if it now differs, the '
      + 'declaration is stale and the reason above needs re-deriving');
  });
}

// ================================================== 5. THE DEAD BLOCK ABOVE IT
//
// `$249712..$2497A0` is a SECOND Button-3 path in the same routine -- the EDGE
// bit rather than the held bit, stepping ($20,A6)/($22,A6) and two pointers at
// $8127E4 through a four-entry `$2497A2(pc)` table.  `$24970E bra.w $2497AA`
// jumps over it unconditionally and NOTHING branches into it: a scan of
// $240000..$2A0000 for every Bcc.b/Bcc.w landing on $249712 finds zero.  It is
// therefore not part of the port, and this test exists so that a future reader
// who finds it while grepping for "the other button-3 handler" is told that in
// the tree rather than having to re-derive it from the ROM.

test('the port does NOT implement the dead $249712 block', () => {
  const { ram } = bench({ held: 0x00, edge: 0x40 });   // Button 3 EDGE only
  const before = [ram.u16(REC + 0x20), ram.u16(REC + 0x22)];
  autoShot2497AA(ram, REC, ram.u8(REC + P.dirByte), 0);
  assert.deepEqual([ram.u16(REC + 0x20), ram.u16(REC + 0x22)], before,
    '$249712 is unreachable in build B and must stay unported');
});
