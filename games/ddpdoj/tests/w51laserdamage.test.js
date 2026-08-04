// WAVE 51 -- the BEAM'S DAMAGE: `$24518A`'s blocks 7 and 8, `$2453AC`, the
// ninth block `$24560A`, and the `$400`-bit score arm `$286876`/`$286774`.
//
// EVERY EXPECTED VALUE HERE IS DERIVED FROM THE LISTING, not from running the
// port and writing down what came out (`docs/knowledge/03`; W11 §F1 and W12 §F1
// are both cases of a test written from the port locking a defect in).  The
// arithmetic each one checks is quoted as the instruction that does it.
//
// Two shapes are avoided deliberately, because this project keeps re-finding
// them:
//  * NO FIXTURE SITS WHERE TWO READINGS AGREE.  The half-extents are four
//    DIFFERENT numbers, so a Y/X or plus/minus swap reddens; the damage values
//    are chosen where `lsr #1` and `lsr #2` give different HP.
//  * NO ASSERTION SEEDS ITS OWN ANSWER.  The reach, the hit bits and the HP are
//    computed by hand from the constants in the comment above each.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { DMG, laserDamagePass, runType5Tail } from '../src/damage.js';
import { SCORE, LEDGER, bombHitChain } from '../src/score.js';
import { UnportedLog, Unreached } from '../src/unported.js';

const POOLA = DMG.poolA;                 // $81459C, 100 slots of $20
const POOLB = DMG.poolB;                 // $81521C, 50 slots
const REC = DMG.beamRecP1;               // $811EF2
const D6 = 0x2800;                       // $24518A move.w #$2800,D6

function ctx() { return { unportedLog: new UnportedLog() }; }

/** One enemy record.  The four half-extents are DIFFERENT on purpose. */
function putEnemy(ram, pool, slot, o = {}) {
  const r = pool + slot * DMG.enemyStride;
  ram.setU16(r, o.tw ?? 0xa000);         // bit 15 live, bit 13 ($2000), bit 5 of
  ram.setU16(r + 0x02, o.y ?? 0x1000);   //   the high byte = $20 -> `btst #5`
  ram.setU16(r + 0x04, o.x ?? 0x1000);
  ram.setU16(r + 0x10, o.yp ?? 0x200);   // $245462 add.w ($10,A5),D5
  ram.setU16(r + 0x12, o.ym ?? 0x180);   // $24545A sub.w ($12,A5),D4
  ram.setU16(r + 0x14, o.xp ?? 0x140);   // $245444 add.w ($14,A5),D4
  ram.setU16(r + 0x16, o.xm ?? 0x100);   // $24544C sub.w ($16,A5),D5
  ram.setU16(r + 0x18, o.hp ?? 0x1000);
  return r;
}

/** The beam control record, wide enough in both axes to cover `putEnemy`'s
 *  default position, with `($e,A1)` -- the damage word `$254C1E` writes from
 *  `$24A824` -- set to a value where `lsr #1` and `lsr #2` differ. */
function putBeam(ram, o = {}) {
  ram.setU16(REC + 0x00, o.type ?? 0x8000);
  ram.setU16(REC + 0x02, o.y ?? 0x0c00);   // $2453D4
  ram.setU16(REC + 0x04, o.x ?? 0x1000);   // $2453D6
  ram.setU16(REC + 0x06, o.h ?? 0x1000);   // $2453E0 add.w (A0)+,D0
  ram.setU16(REC + 0x08, o.xp ?? 0x400);   // $2453E6
  ram.setU16(REC + 0x0a, o.xm ?? 0x400);   // $2453E8
  ram.setU16(REC + 0x0e, o.dmg ?? 0x0400); // the per-hit damage
  ram.setU16(REC + 0x1a, o.w1a ?? 0);      // $245494 tst.w ($1a,A1)
  ram.setU16(REC + 0x1c, o.w1c ?? 0x0400);
}

// ======================================================= $2453BA, THE ARM
test('$2453BA bset #$1,(A1) is a BYTE op ($0200) and the pass ARMS on its '
  + 'first run and damages on its second', () => {
  const ram = new Ram();
  putBeam(ram);
  const e = putEnemy(ram, POOLA, 0, {});
  ram.setU16(DMG.gate308c, 1);              // no reduction, so the maths is bare

  // FIRST call: `bset` finds bit 1 CLEAR, so Z is set and `$2453BE beq $245608`
  // returns before `$2453C2`.  Nothing but the bit may move.
  assert.equal(laserDamagePass(ram, REC, D6), 0, 'the first pass does not damage');
  assert.equal(ram.u16(REC), 0x8200,
    '$0200 is bit 1 of the HIGH byte -- the value 10-recon-combat measured on '
    + 'the board as $8200, which W45 §0.4 could not account for');
  assert.equal(ram.u16(e + 0x18), 0x1000, 'the enemy is untouched on the arm');
  assert.equal(ram.u16(REC + 0x10), 0,
    '$2453C6 move.w #$7400,($10,A1) is PAST the beq and must not have run');

  // SECOND call: the bit is already set, so `bset` leaves Z clear and the body
  // runs.  $2453C6/$2453CC seed the reach to $7400 + $2800 = $9C00 and the
  // enemy at Y $1000 pulls it down to $1000 + $2800 - $180 = $3680; $245604
  // then subtracts D6, leaving $0E80.
  assert.equal(laserDamagePass(ram, REC, D6), 1, 'the second pass damages');
  assert.equal(ram.u16(REC + 0x10), 0x0e80,
    '$2454BE writes the reach BIASED and $245604 sub.w D6,($10,A1) un-biases it');
  assert.equal(ram.u16(e + 0x18), 0x1000 - 0x400, '$2454EE sub.w D5,($18,A5)');
});

test('$2454AC ori.w #$1001,(A1) is what lights the drawn column, and only a '
  + 'HIT sets it', () => {
  const ram = new Ram();
  putBeam(ram);
  ram.setU16(DMG.gate308c, 1);
  laserDamagePass(ram, REC, D6);            // arm, with NO enemy in the pool
  assert.equal(laserDamagePass(ram, REC, D6), 0, 'nothing to hit');
  // A HITLESS pass is the ONLY thing that shows the seed, because any hit
  // overwrites it.  $7400 + $2800 in, $2800 out again -- so this one assertion
  // covers both $2453C6's immediate and $245604's un-bias, and mutating either
  // reddens it.  (My first version of this test asserted only the post-hit
  // reach and a `#$7000` seed survived it; `docs/knowledge/03`.)
  assert.equal(ram.u16(REC + 0x10), 0x7400,
    '$2453C6 move.w #$7400,($10,A1) / $2453CC add.w D6 / $245604 sub.w D6');
  assert.equal(ram.u16(REC) & 0x1000, 0,
    'bit 4 of the high byte is CLEAR -- $254F48 btst #4,(A2) does not fire');
  putEnemy(ram, POOLA, 3, {});
  assert.equal(laserDamagePass(ram, REC, D6), 1);
  assert.equal(ram.u16(REC), 0x9201,
    '$8201 | $1001 = $9201, the exact value 10-recon-combat read off the board '
    + 'and 37-recon-laser §3.3 called "the beam hit something"');
  assert.equal(ram.u16(REC + 0x0c), 0, '$2454B0 clr.w ($c,A1)');
  // and `$2453C2 bclr #$4,(A1)` takes it away again at the top of the next pass
  ram.setU16(POOLA + 3 * DMG.enemyStride, 0);   // kill the enemy record (slot 3)
  laserDamagePass(ram, REC, D6);
  assert.equal(ram.u16(REC), 0x8201, '$2453C2 bclr #$4,(A1) clears it each pass');
});

// ======================================================= the ENEMY's hit bits
test('$2454E0 ori.w #$400,D4 puts D1 bit 2 in the enemy type word -- the bit '
  + '$286096 forks on', () => {
  const ram = new Ram();
  putBeam(ram);
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.fa72, DMG.maskP1);         // $80FA72 = $1000, the P1 hit mask
  const e = putEnemy(ram, POOLA, 0, {});
  laserDamagePass(ram, REC, D6);
  laserDamagePass(ram, REC, D6);
  const tw = ram.u16(e);
  assert.equal(tw & 0x1400, 0x1400,
    '$80FA72 | $400 -- and `moveq #$5C,D1 / and.b (A6),D1` keeps BOTH, so '
    + '$2860EC btst #$2,D1 takes $2860F2 bsr $286876');
  assert.equal(tw & 0x4000, 0,
    '$4000 is BLOCK 8\'s bit ($2452F2 ori.w #$4400) and $2453AC never sets it');
});

// ======================================================= the REDUCTION LADDER
test('$2454D4 lsr.w #2 is a QUARTER and block 7 $245236 lsr.w #1 is a HALF', () => {
  const ram = new Ram();
  putBeam(ram, { dmg: 0x400 });
  ram.setU16(DMG.gate308c, 0);              // $2454CC tst.w / bne -- 0 REDUCES
  const e = putEnemy(ram, POOLA, 0, {});
  laserDamagePass(ram, REC, D6);
  laserDamagePass(ram, REC, D6);
  assert.equal(ram.u16(e + 0x18), 0x1000 - (0x400 - (0x400 >>> 2)),
    '$2454D4/$2454D6/$2454D8: D5 - (D5>>2) = $300, three quarters');
  // Block 7 halves instead.  $811802 is pool slot 27 and its ($18,A2) is the
  // power; the same enemy, the same reduction gate, a DIFFERENT shift.
  const ram2 = new Ram();
  ram2.setU16(DMG.gate308c, 0);
  ram2.setU16(DMG.p1rec, 0x8000);           // $24518E move.w (A4),D0 / bpl
  ram2.setU8(DMG.p1rec + DMG.laserByte, 1); // $24519A tst.b ($3f,A4)
  ram2.setU16(DMG.laserSlot27, 0x8000);
  ram2.setU16(DMG.laserSlot27 + 0x02, 0x0c00);
  ram2.setU16(DMG.laserSlot27 + 0x04, 0x1000);
  for (const o of [0x10, 0x12, 0x14, 0x16]) ram2.setU16(DMG.laserSlot27 + o, 0x800);
  ram2.setU16(DMG.laserSlot27 + 0x18, 0x400);
  const e2 = putEnemy(ram2, POOLA, 0, {});
  runType5Tail(ram2, ctx());
  assert.equal(ram2.u16(e2 + 0x18), 0x1000 - (0x400 - (0x400 >>> 1)),
    '$245236/$245238/$24523A: D5 - (D5>>1) = $200, a HALF -- not the quarter '
    + 'blocks 6a/6b and $2453AC use');
});

// ======================================================= THE GATE
test('$24519A tst.b ($3f,A4) gates blocks 7, 8 AND $2453AC -- with the laser '
  + 'byte clear nothing in the tail runs', () => {
  const ram = new Ram();
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.p1rec, 0x8000);
  ram.setU16(DMG.laserSlot27, 0x8000);      // a live slot-27 object...
  ram.setU16(DMG.laserSlot27 + 0x18, 0x400);
  for (const o of [0x10, 0x12, 0x14, 0x16]) ram.setU16(DMG.laserSlot27 + o, 0x800);
  ram.setU16(DMG.laserSlot27 + 0x02, 0x0c00);
  ram.setU16(DMG.laserSlot27 + 0x04, 0x1000);
  putBeam(ram);                             // ...and a live beam record
  const e = putEnemy(ram, POOLA, 0, {});
  ram.setU8(DMG.p1rec + DMG.laserByte, 0);  // but the LASER BYTE is clear
  runType5Tail(ram, ctx());
  assert.equal(ram.u16(e + 0x18), 0x1000, 'no damage while ($3f,A4) is 0');
  assert.equal(ram.u16(REC), 0x8000, '$2453BA never ran, so $0200 is clear');
  ram.setU8(DMG.p1rec + DMG.laserByte, 1);
  runType5Tail(ram, ctx());
  assert.notEqual(ram.u16(e + 0x18), 0x1000, 'and damage the moment it is 1');
});

// ======================================================= the 150-SLOT WALK
test('blocks 7 and 8 walk 150 slots as CAPACITY, which is pool A\'s 100 plus '
  + 'pool B\'s 50 contiguously', () => {
  // $81459C + 100*$20 = $81521C, and `moveq #$95,D7` is 150.  An enemy in pool
  // B's slot 0 is therefore slot 100 of block 7's walk, and it must be damaged
  // even though $815EA0 (pool B's LIVE COUNT, which blocks 6a/6b consume) is 0.
  assert.equal(POOLA + 100 * DMG.enemyStride, POOLB,
    'the two pools are contiguous -- this is why the 150 is not a third pool');
  const ram = new Ram();
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.p1rec, 0x8000);
  ram.setU8(DMG.p1rec + DMG.laserByte, 1);
  ram.setU16(DMG.laserSlot27, 0x8000);
  ram.setU16(DMG.laserSlot27 + 0x02, 0x0c00);
  ram.setU16(DMG.laserSlot27 + 0x04, 0x1000);
  for (const o of [0x10, 0x12, 0x14, 0x16]) ram.setU16(DMG.laserSlot27 + o, 0x800);
  ram.setU16(DMG.laserSlot27 + 0x18, 0x400);
  const e = putEnemy(ram, POOLB, 0, {});
  ram.setU16(DMG.poolBCount, 0);            // deliberately: the count is 0
  runType5Tail(ram, ctx());
  assert.equal(ram.u16(e + 0x18), 0x1000 - 0x400,
    'block 7 damaged a pool-B record with the live count at 0 -- it walks '
    + 'slots, not counters');
});

// ======================================================= D0 CARRIES
test('pool A\'s reach shadows D0, which is why a beam stops at the FIRST thing '
  + 'it hits -- and why $2454C2\'s carry into pool B is unobservable', () => {
  // `$2454C2 move.w D4,D0` overwrites the box's upper Y bound with the reach,
  // and `$2454FA` hands both into pool B.  The port carries D0 because the
  // registers carry it; THIS TEST IS HONEST ABOUT WHAT IT CAN PROVE.
  //
  // MUTATION M12 -- "do not carry D0 into pool B" -- SURVIVED, and it is
  // provably uncatchable rather than a defective check.  The argument, from
  // the two instructions:
  //     $245580 cmp.w D4,D0        / bcs   skip if D0 < yMinus
  //     $2455A8 cmp.w ($10,A1),D4  / bcc   skip if yMinus >= ($10,A1)
  // Every write that changes D0 ($2454C2, $2455C4) writes ($10,A1) with the
  // SAME value two instructions earlier ($2454BE, $2455C0), and pool B has no
  // arm that skips the second test (pool A's $2454A2 `bra $2454C4` is pool A's
  // alone).  So whenever the carry could matter -- i.e. after a pool-A hit --
  // D0 and ($10,A1) are equal and the reach test is at least as strict.  When
  // no pool-A hit happened, the mutation has nothing to drop.
  //
  // What IS observable, and is what this test asserts, is the shadowing itself
  // and its consequence: a SECOND enemy further along the beam is not damaged.
  const ram = new Ram();
  putBeam(ram);
  ram.setU16(DMG.gate308c, 1);
  laserDamagePass(ram, REC, D6);            // arm
  const near = putEnemy(ram, POOLA, 0, { y: 0x1000 });      // yMinus $3680
  const far = putEnemy(ram, POOLA, 1, { y: 0x1180, ym: 0 }); // yMinus $3980
  assert.equal(laserDamagePass(ram, REC, D6), 1, 'ONE of the two is damaged');
  assert.equal(ram.u16(near + 0x18), 0x1000 - 0x400, 'the near one');
  assert.equal(ram.u16(far + 0x18), 0x1000,
    'the far one is past the reach the near one set, so $2454A6 bcc skips it');
  assert.equal(ram.u16(REC + 0x10), 0x1000 + 0x2800 - 0x180 - D6,
    'and ($10,A1) holds exactly that reach, un-biased by $245604');
  const b = putEnemy(ram, POOLB, 0, { y: 0x1180, ym: 0 });
  laserDamagePass(ram, REC, D6);
  assert.equal(ram.u16(b + 0x18), 0x1000,
    'pool B is rejected by the same reach -- $245580 and $2455A8 agree');
});

// ======================================================= $24560A
test('$24560A is transcribed only as far as its two guards, and throws by '
  + 'address when both go true', () => {
  const ram = new Ram();
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.p1rec, 0x8000);
  ram.setU8(DMG.p1rec + DMG.laserByte, 0);  // -> $24519E beq.w $24560A
  ram.setU16(DMG.laserRec, 0x0000);         // $245614 bpl.w $2459CE
  assert.doesNotThrow(() => runType5Tail(ram, ctx()),
    '$811F72 positive returns without touching the 966 bytes');
  ram.setU16(DMG.laserRec, 0x8000);         // negative now
  ram.setU8(DMG.p1rec + 0x01, 0x00);        // ...but ($1,A4) bit 6 is clear
  assert.doesNotThrow(() => runType5Tail(ram, ctx()), '$245618 btst #$6 / beq');
  ram.setU8(DMG.p1rec + 0x01, 0x40);        // both guards TRUE
  try {
    runType5Tail(ram, ctx());
    assert.fail('the ninth block must not be skipped silently');
  } catch (err) {
    assert.ok(err instanceof Unreached, 'it is an Unreached, not any Error');
    assert.equal(err.romAddress, DMG.bombLaserBody,
      'matched by romAddress, never by message text');
  }
});

// ======================================================= $286876 and $286774
test('$286876\'s chain step is ONE or TWO, chosen by $286966 btst #$6,D1', () => {
  const ram = new Ram();
  const p = LEDGER.p1;
  ram.setU16(p.meter, 40);                  // non-zero -> the $2868EE arm
  ram.setU16(p.w1e, 0);                     // so `subq.w #1` BORROWS
  ram.setU16(p.chain, 0x0008);
  ram.setU16(p.power, 0);
  ram.setU16(p.formation, 2);
  bombHitChain(ram, ctx(), 0x10, 0x14);     // D1 = $14: bits 4 and 2, NOT 6
  assert.equal(ram.u16(p.chain), 0x0009, 'one packed-BCD increment');
  ram.setU16(p.w1e, 0);
  bombHitChain(ram, ctx(), 0x10, 0x54);     // D1 = $54: bit 6 as well
  assert.equal(ram.u16(p.chain), 0x0011,
    'TWO increments, and $09 + 1 + 1 = $11 in packed BCD -- a binary add would '
    + 'give $0B. $4000 is block 8\'s own hit bit ($2452F2 ori.w #$4400)');
});

test('$286876\'s cold start seeds the meter to 10 and the RANK DIVIDER from '
  + 'the player\'s power word', () => {
  const ram = new Ram();
  const p = LEDGER.p1;
  ram.setU16(SCORE.laserRec, 0);            // $286884 tst.w $811F72 / bpl
  ram.setU16(p.meter, 0);                   // $28688C tst.w $81B5C0 / beq
  ram.setU16(p.power, 2);                   // ($22,A4)
  ram.setU32(p.acc1, 0x11111111);
  ram.setU16(p.chain, 0x0044);
  bombHitChain(ram, ctx(), 0x10, 0x14);
  assert.equal(ram.u16(p.meter), 0x0a, '$2868BA move.w #$A,$81B5C0');
  assert.equal(ram.u32(p.acc1), 0, '$286896 move.l D0,$81B5B8 with D0 = 0');
  assert.equal(ram.u16(p.chain), 0, '$2868AE');
  // D2 = 8 - 2 = 6; 6 + (6>>1) = 9; 9 + $12 = $1B.
  assert.equal(ram.u16(SCORE.laserRankDivider), 0x1b,
    '$2868C2..$2868D4: (8 - power) * 1.5 + $12');
  assert.equal(ram.u16(p.w1e), 0x1b, '$2868E6, with no hyper subtracting $C');
});

test('$286774 adds $18 to $81B64A on its divider BORROW and nineteen bytes of '
  + 'it are unreachable', () => {
  const ram = new Ram();
  const p = LEDGER.p1;
  ram.setU16(p.meter, 40);
  ram.setU16(p.w1e, 5);                     // no borrow -> the feeder is all
  ram.setU16(SCORE.laserRankDivider, 2);
  ram.setU16(SCORE.rankAccum, 0);
  bombHitChain(ram, ctx(), 0x10, 0x14);
  assert.equal(ram.u16(SCORE.laserRankDivider), 1, '$286774 subq.w #1');
  assert.equal(ram.u16(SCORE.rankAccum), 0, '$28677A bcc -- no borrow, no feed');
  ram.setU16(SCORE.laserRankDivider, 0);
  bombHitChain(ram, ctx(), 0x10, 0x14);
  assert.equal(ram.u16(SCORE.rankAccum), 0x18,
    'D2 is ALWAYS $18: $286782\'s `beq $28679E` and $28678C\'s `bra $28679E` '
    + 'have the same target, so $28678E..$28679C cannot be reached');
  assert.equal(ram.u16(SCORE.laserRankDivider), 8, '$2867AA/$2867AC reload');
  // and the bomb stock, which $286782 tests, changes NOTHING
  ram.setU16(SCORE.bombStock, 5);
  ram.setU16(SCORE.laserRankDivider, 0);
  ram.setU16(SCORE.rankAccum, 0);
  bombHitChain(ram, ctx(), 0x10, 0x14);
  assert.equal(ram.u16(SCORE.rankAccum), 0x18,
    '$81B65C == 5 takes the `beq` and lands on the SAME instruction');
});

test('$286876 refuses to invent $286A82\'s tail: $8130F8 bit 2 throws by '
  + 'address', () => {
  const ram = new Ram();
  ram.setU8(SCORE.g30f8, 0x04);             // $286876 btst #$2,$8130F8
  try {
    bombHitChain(ram, ctx(), 0x10, 0x14);
    assert.fail('$28687E bne $286AAA must not be skipped');
  } catch (err) {
    assert.ok(err instanceof Unreached);
    assert.equal(err.romAddress, SCORE.altBombShared);
  }
});
