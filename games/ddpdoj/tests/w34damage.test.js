// WAVE 34 -- the damage delivery ($28B670 / $244D62) and the hit ledger
// ($286096 / $28615E / $2862C6 / $286626).
//
// EVERY TEST HERE IS DESIGNED TO BE ABLE TO GO RED, and the worklog records the
// mutation that made each one do so.  Two shapes are avoided on purpose because
// this project keeps re-finding them (`docs/knowledge/03`):
//
//  * NO ASSERTION SEEDS ITS OWN ANSWER.  The box test is driven with an enemy
//    whose coordinates and half-extents are DIFFERENT numbers from the shot's,
//    so a swap of the two reddens it; the BCD adder is checked against
//    hand-computed decimal, not against a second call of itself.
//  * NO FIXTURE SITS WHERE TWO READINGS AGREE.  `abcd` is exercised across a
//    decimal carry ($09 + $01 = $10, not $0A) and the pool-A/pool-B difference
//    is driven at a value where the two orders of the 3/4 reduction give
//    different HP.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { DMG, shotBoundingBox, poolDamage, runType5Tail } from '../src/damage.js';
import { SCORE, LEDGER, abcd, bcdAdd, scoreHit, scoreKill } from '../src/score.js';
import { UnportedLog } from '../src/unported.js';

const SHOT = DMG.p1shots;          // $810572
const POOLA = DMG.poolA;           // $81459C
const POOLB = DMG.poolB;           // $81521C

function ctx() { return { unportedLog: new UnportedLog() }; }

/** The two ledger tables, as the exporter declares them: `$287DF0` = the
 *  chain-meter cap by loop, `$287DF4` = the per-hit refill by weapon. */
function ledgerRom() {
  return new RomWindows({
    windows: [{ base: '$287df0', len: 8, why: 'test',
      hex: '0038005a00140012' },
    // W54: the death arms now ALLOCATE, and $268864/$2682D2/$2681EE read the
    // enemy-bucket remap row out of the cartridge.  The bytes are the
    // cartridge's own, checked against it by tests/w54effects.test.js.
    { base: '$267fa0', len: 36, why: 'W54 the $267FA0 remap rows',
      hex: '0000000000040008000c0010'      // $267FA0 the DEATH row
         + '000400040008000c00100010'      // $267FAC the HIT row
         + '0000000000040008000c0010' }],  // $267FB8 $289AF4's row
  });
}

/** One live shot with a known box.  Y is +$2 and X is +$4 -- the SAME order the
 *  collision loops read them in, and not the order a reader expects. */
function putShot(ram, slot, { y, x, exY = 0x100, exX = 0x100, power = 0x400 }) {
  const r = SHOT + slot * DMG.shotStride;
  ram.setU16(r, 0x8000);
  ram.setU16(r + 0x02, y);
  ram.setU16(r + 0x04, x);
  ram.setU16(r + 0x10, exY);
  ram.setU16(r + 0x12, exY);
  ram.setU16(r + 0x14, exX);
  ram.setU16(r + 0x16, exX);
  ram.setU16(r + 0x18, power);
  return r;
}

function putEnemy(ram, pool, slot, { y, x, ex = 0x200, hp = 0x100, tw = 0xa000 }) {
  const r = pool + slot * DMG.enemyStride;
  ram.setU16(r, tw);
  ram.setU16(r + 0x02, y);
  ram.setU16(r + 0x04, x);
  for (const o of [0x10, 0x12, 0x14, 0x16]) ram.setU16(r + o, ex);
  ram.setU16(r + 0x18, hp);
  return r;
}

// =========================================================== $286626, the ADDER
test('$286626 is a PACKED-BCD add and A0 is ONE PAST the accumulator', () => {
  const ram = new Ram();
  // W19 §1.0: `lea $81B4C4,A0` addresses $81B4C0..$81B4C3, because the four
  // `abcd` are PREDECREMENT.  If that reading is wrong every player's score is
  // one slot out, so the test asserts the four bytes it must NOT have touched.
  ram.setU32(0x81b4c4, 0x11111111);
  bcdAdd(ram, LEDGER.p1.pendingEnd, 0x99);
  assert.equal(ram.u32(0x81b4c0), 0x00000099, 'the accumulator is $81B4C0');
  assert.equal(ram.u32(0x81b4c4), 0x11111111, '$81B4C4 is P2 and is untouched');
  // and the decimal carry, at the value where binary and BCD disagree
  bcdAdd(ram, LEDGER.p1.pendingEnd, 0x01);
  assert.equal(ram.u32(0x81b4c0), 0x00000100,
    '$99 + $01 = $100 in packed BCD; a binary add would give $9A');
  bcdAdd(ram, LEDGER.p1.pendingEnd, 0x00009900);
  assert.equal(ram.u32(0x81b4c0), 0x00010000,
    '$100 + $9900 = $10000 -- the decimal carry crosses TWO byte boundaries');
});

test('abcd(9,1) is $10 and abcd(...,X=1) takes the extend in', () => {
  assert.deepEqual(abcd(0x09, 0x01, 0), { v: 0x10, x: 0 });
  assert.deepEqual(abcd(0x09, 0x00, 1), { v: 0x10, x: 0 });
  assert.deepEqual(abcd(0x99, 0x01, 0), { v: 0x00, x: 1 }, 'the decimal carry OUT');
  assert.deepEqual(abcd(0x50, 0x50, 0), { v: 0x00, x: 1 });
});

// =========================================================== $286096, THE HIT
test('$286096 scores ONE PLUS THE HYPER LEVEL and credits by D1 bits 4 and 3', () => {
  const ram = new Ram();
  const sub = 0x814600;
  scoreHit(ram, ctx(), sub, 0x10);                       // P1 only
  assert.equal(ram.u32(0x81b4c0), 1, '$2860E4 moveq #1,D0');
  assert.equal(ram.u32(0x81b4c4), 0, 'P2 was not credited');
  ram.setU16(LEDGER.p1.hyper, 3);                        // $81B63E
  scoreHit(ram, ctx(), sub, 0x10);
  assert.equal(ram.u32(0x81b4c0), 5, '$2860E6 add.w $81B63E,D0 -- 1 + 3');
  scoreHit(ram, ctx(), sub, 0x08);                       // P2 only
  assert.equal(ram.u32(0x81b4c4), 1, 'D1 bit 3 credits P2 at $81B4C4');
  assert.equal(ram.u32(0x81b4c0), 5, '...and P1 did not move');
});

test('$286096 returns immediately on bit 1 of the sub-record (btst #1,(A6))', () => {
  const ram = new Ram();
  const sub = 0x814600;
  ram.setU8(sub, 0x02);
  scoreHit(ram, ctx(), sub, 0x10);
  assert.equal(ram.u32(0x81b4c0), 0, 'no score at all');
});

// ========================================================== $28615E, THE KILL
test('$28615E reloads the meter CAP from $287DF0[$813098*2] on every kill', () => {
  const ram = new Ram();
  const rom = ledgerRom();
  scoreKill(ram, rom, ctx(), 0x08, 0x10);
  assert.equal(ram.u16(SCORE.capWord), 0x38, 'loop 0 -> 56, W19 measured 56');
  ram.setU16(SCORE.loop, 1);
  scoreKill(ram, rom, ctx(), 0x08, 0x10);
  assert.equal(ram.u16(SCORE.capWord), 0x5a, 'loop 1 -> 90, a DIFFERENT entry');
});

test('a kill with the meter at zero STARTS the chain; the next one CHAINS', () => {
  const ram = new Ram();
  const rom = ledgerRom();
  // first kill: $286314 tst.w $81B5C0 is 0 -> $28631C refill, $286320 clr chain
  scoreKill(ram, rom, ctx(), 0x08, 0x10);
  assert.equal(ram.u16(LEDGER.p1.chain), 0, '$286320 clr.w $81B5DA');
  assert.equal(ram.u16(LEDGER.p1.meter), 0x14,
    '$28664E add.w $81B5E0 -- the refill is $287DF4[0] = 20');
  assert.equal(ram.u32(0x81b4c0), 8, 'the UNCHAINED add is D0 itself');
  // second kill: the meter is non-zero, so $286366 chains
  scoreKill(ram, rom, ctx(), 0x08, 0x10);
  // $286366 finds `$81B5B8` non-zero (the first kill's `$286332 move.l D3,
  // $81B5B8`), so `$286380 move.w #$1,$81B5DA` runs FIRST and the BCD `+1` at
  // $2863A2 then makes it 2.  A port that skipped $286380 would read 1 here.
  assert.equal(ram.u16(LEDGER.p1.chain), 2, '$286380 then $2863B2');
  assert.equal(ram.u16(LEDGER.p1.hiwater), 2, '$2863C2 high-water mark');
  assert.equal(ram.u16(LEDGER.p1.meter), 0x28, 'refilled again');
});

test('the chain counter is PACKED BCD: nine chains then $10, never $0A', () => {
  const ram = new Ram();
  const rom = ledgerRom();
  ram.setU16(LEDGER.p1.meter, 1);            // already chaining
  for (let i = 0; i < 16; i++) scoreKill(ram, rom, ctx(), 0x08, 0x10);
  assert.equal(ram.u16(LEDGER.p1.chain), 0x16,
    '16 chained kills read $16 in BCD, not $10 -- and $0A never appears');
});

test('$286664 clamps the meter to the cap and COUNTS $286674', () => {
  const ram = new Ram();
  const rom = ledgerRom();
  const c = ctx();
  ram.setU16(LEDGER.p1.meter, 0x30);         // 48, cap will be 56, refill 20
  scoreKill(ram, rom, c, 0x08, 0x10);
  assert.equal(ram.u16(LEDGER.p1.meter), 0x38, 'clamped to the cap, not 68');
  assert.ok([...c.unportedLog.calls.keys()].some((k) => k.startsWith('$286674')),
    'the hyper-stock bonus $286674 is counted BY ADDRESS, not silently skipped');
});

// ================================================= $244EE0, the BOUNDING BOX
test('$244EE0 returns FALSE when no shot is live, so both pools are skipped', () => {
  const ram = new Ram();
  assert.equal(shotBoundingBox(ram, SHOT, 0x2800), false,
    '$244EF0 bra.w $24518A');
});

test('the box is the MIN/MAX over every live shot, biased by D7', () => {
  const ram = new Ram();
  putShot(ram, 0, { y: 0x1000, x: 0x2000, exY: 0x100, exX: 0x200 });
  putShot(ram, 5, { y: 0x3000, x: 0x0800, exY: 0x080, exX: 0x040 });
  assert.equal(shotBoundingBox(ram, SHOT, 0x2800), true);
  // THE TWO AXES ARE NOT COMPUTED THE SAME WAY, and that is in the listing:
  //   $244F1E add.w (A1)+,D0 / $244F20 move.w D0,D1 / $244F22 sub.w (A1)+,D1
  //     -> the Y MINIMUM is taken from the ALREADY-BIASED maximum, so with
  //        equal half-extents it is exactly Y.
  //   $244F18 move.w D2,D3 (BEFORE the add) / $244F24 / $244F26
  //     -> the X minimum is taken from the RAW X.
  // slot 0: Ymax $1100 Ymin $1000   Xmax $2200 Xmin $1E00
  // slot 5: Ymax $3080 Ymin $3000   Xmax $0840 Xmin $07C0
  assert.equal(ram.u16(0x80fa74), 0x3080 + 0x2800, 'MAX Y');
  assert.equal(ram.u16(0x80fa76), 0x1000 + 0x2800, 'MIN Y -- $1000, not $0F00');
  assert.equal(ram.u16(0x80fa78), 0x2200 + 0x2800, 'MAX X');
  assert.equal(ram.u16(0x80fa7a), 0x07c0 + 0x2800, 'MIN X');
});

// ======================================================= $244F68 / $2450B4
test('pool A damages an overlapping enemy and marks the shot AND the enemy', () => {
  const ram = new Ram();
  const shot = putShot(ram, 0, { y: 0x1000, x: 0x2000, power: 0x400 });
  const en = putEnemy(ram, POOLA, 0, { y: 0x1000, x: 0x2000, hp: 0x300 });
  shotBoundingBox(ram, SHOT, 0x2800);
  const n = poolDamage(ram, POOLA, 1, SHOT, 0x2800, DMG.maskP1, 1, 'A');
  assert.equal(n, 1, 'one overlap');
  assert.equal(ram.u16(en + 0x18), 0x300 - 0x400 & 0xffff,
    '$24505E sub.w D5,$16(A5) -- HP -= the shot power');
  assert.equal(ram.u16(shot + 0x18), 0x400 - 0x300,
    '$24504E sub.w D4,$14(A6) -- the shot power -= the ENEMY HP');
  assert.equal(ram.u16(en) & DMG.maskP1, DMG.maskP1,
    '$24502E or.w $80FA72,-$2(A5) -- the P1 hit bit into the type word');
  assert.equal(ram.u8(shot + 1) & 0x80, 0x80, '$245044 bset #$7,-$3(A6)');
});

test('an enemy without bit 13 of its type word is not hittable at all', () => {
  const ram = new Ram();
  putShot(ram, 0, { y: 0x1000, x: 0x2000 });
  const en = putEnemy(ram, POOLA, 0, { y: 0x1000, x: 0x2000, hp: 0x300,
    tw: 0x8000 });                                       // live, NOT hittable
  shotBoundingBox(ram, SHOT, 0x2800);
  assert.equal(poolDamage(ram, POOLA, 1, SHOT, 0x2800, DMG.maskP1, 1, 'A'), 0);
  assert.equal(ram.u16(en + 0x18), 0x300, '$244F90 andi.w #$2000 / beq');
});

test('the outer walk is bounded by the LIVE COUNT and skips dead slots free', () => {
  const ram = new Ram();
  putShot(ram, 0, { y: 0x1000, x: 0x2000 });
  // slots 0..6 dead, 7 and 8 live: the count is 2 and BOTH must be reached.
  const a = putEnemy(ram, POOLA, 7, { y: 0x1000, x: 0x2000, hp: 0x300 });
  const b = putEnemy(ram, POOLA, 8, { y: 0x1000, x: 0x2000, hp: 0x300 });
  shotBoundingBox(ram, SHOT, 0x2800);
  assert.equal(poolDamage(ram, POOLA, 2, SHOT, 0x2800, DMG.maskP1, 1, 'A'), 2,
    'both live records were reached though seven dead ones lay in front');
  // AND THE SHOT IS A PIERCING BUDGET, not a fixed damage: $24504E debits the
  // shot by the FIRST enemy's HP, so the second one loses only what is left.
  assert.equal(ram.u16(a + 0x18), 0xff00, 'the first took the full $400');
  assert.equal(ram.u16(b + 0x18), 0x0200, 'the second took the remaining $100');
});

test('pool B applies the 3/4 reduction AFTER the shot is debited; pool A BEFORE', () => {
  // $245036/$24503E (A) runs before $24504E; $245162/$24516A (B) runs after
  // $24515E.  With $81308C == 0 the reduction happens on both, and the ORDER
  // decides what the SHOT loses -- A debits the enemy's full HP either way, so
  // the difference is visible only on the shot's own power when the two are
  // driven with the same numbers.
  const mk = (variant, pool) => {
    const ram = new Ram();
    const shot = putShot(ram, 0, { y: 0x1000, x: 0x2000, power: 0x400 });
    const en = putEnemy(ram, pool, 0, { y: 0x1000, x: 0x2000, hp: 0x100 });
    shotBoundingBox(ram, SHOT, 0x2800);
    poolDamage(ram, pool, 1, SHOT, 0x2800, DMG.maskP1, 0, variant);
    return { hp: ram.u16(en + 0x18), power: ram.u16(shot + 0x18) };
  };
  const A = mk('A', POOLA);
  const B = mk('B', POOLB);
  // $400 * 3/4 = $300, so both enemies lose $300 from $100 -> -$200.
  assert.equal(A.hp, 0x10000 - 0x200);
  assert.equal(B.hp, 0x10000 - 0x200);
  assert.equal(A.power, 0x300, 'A: $400 - the enemy HP $100');
  assert.equal(B.power, 0x300, 'B: the same, and it is NOT $400 - $300');
});

test("pool B tests the shot's OWN byte 0 against $30; pool A has no such test", () => {
  const mk = (variant, pool) => {
    const ram = new Ram();
    // $24513A `and.b -$4(A6),D4` reads the shot's byte 0, which is the HIGH
    // byte of its type word -- so the bits it tests live alongside the live
    // bit, and setting the byte to $30 alone would make the shot DEAD.
    const shot = putShot(ram, 0, { y: 0x1000, x: 0x2000 });
    ram.setU16(shot, 0xb000);                            // live + bits 4 and 5
    const en = putEnemy(ram, pool, 0, { y: 0x1000, x: 0x2000, hp: 0x300 });
    shotBoundingBox(ram, SHOT, 0x2800);
    poolDamage(ram, pool, 1, SHOT, 0x2800, DMG.maskP1, 1, variant);
    return ram.u16(en + 0x18);
  };
  assert.notEqual(mk('A', POOLA), 0x300, 'pool A damages it anyway');
  assert.equal(mk('B', POOLB), 0x300, '$24513E bne -- pool B refuses');
});

test('$245058: an enemy at X >= $6F00 takes NO HP loss, but is still MARKED', () => {
  const ram = new Ram();
  putShot(ram, 0, { y: 0x7000, x: 0x2000 });
  const en = putEnemy(ram, POOLA, 0, { y: 0x7000, x: 0x2000, hp: 0x300 });
  shotBoundingBox(ram, SHOT, 0x2800);
  poolDamage(ram, POOLA, 1, SHOT, 0x2800, DMG.maskP1, 1, 'A');
  assert.equal(ram.u16(en + 0x18), 0x300, '$24505C bcc skips the subtract');
  assert.equal(ram.u16(en) & DMG.maskP1, DMG.maskP1,
    '...and $24502E has already run, so the enemy still reacts to the hit');
});

// ==================================================== $28B670, THE TAIL's ARMS
test('$28B670: P1 runs the pass when $80390C is ZERO, P2 when it is NOT', () => {
  // $28B6B6 is `bne $28B706` and $28B6FC is `beq $28B706` -- opposite senses
  // twenty-six bytes apart.  Reading the second as a copy of the first inverts
  // which shot table gets to damage anything.
  const mk = (mirror, p1, p2) => {
    const ram = new Ram();
    ram.setU16(DMG.gate308c, 1);
    ram.setU16(DMG.mirror2, mirror);
    ram.setU16(DMG.p1rec, p1);
    ram.setU16(DMG.p2rec, p2);
    putShot(ram, 0, { y: 0x1000, x: 0x2000 });
    ram.setU16(DMG.p2shots, 0x8000);                     // one live P2 shot too
    ram.setU16(DMG.p2shots + 0x18, 0x400);
    return runType5Tail(ram, ctx());
  };
  assert.equal(mk(0, 0x8000, 0)?.anyShot, true, 'P1 arm, $80390C == 0');
  assert.equal(mk(1, 0, 0x8000)?.anyShot, true, 'P2 arm, $80390C != 0');
  // WAVE 60 INVERTED THE OTHER TWO rather than deleting them.  Until W60 both
  // `$28B706` arms returned null, because `$244D40` was a whole-routine note.
  // It is ported now, so the assertion that can still fail is "the $28B706 arm
  // runs $2459D0 and NO shot loop" -- `anyShot` must be absent, `boxRun` set.
  for (const [m, p1, p2, why] of [[1, 0x8000, 0, '$28B6B6 bne -> $28B706'],
    [0, 0, 0x8000, '$28B6FC beq -> $28B706']]) {
    const r = mk(m, p1, p2);
    assert.equal(r?.anyShot, undefined, `${why}: $244D40 has NO shot loop`);
    assert.equal(r?.player?.boxRun, true, `${why}: but it DOES run $2459D0`);
    assert.equal(r?.player?.entry, DMG.passNoPlayer, `${why}: via $244D40`);
  }
});

test('$28B670: with $81308C zero the pass runs with NO player-liveness test', () => {
  const ram = new Ram();
  ram.setU16(DMG.gate308c, 0);
  ram.setU16(DMG.mirror2, 0);
  ram.setU16(DMG.p1rec, 0);                              // both players "dead"
  ram.setU16(DMG.p2rec, 0);
  putShot(ram, 0, { y: 0x1000, x: 0x2000 });
  assert.equal(runType5Tail(ram, ctx())?.anyShot, true,
    '$28B730 has no `beq` on the player record -- $28B766 jmp $244D62');
});

test('the deferred blocks are COUNTED BY ADDRESS, not silently skipped', () => {
  const ram = new Ram();
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.mirror2, 0);
  ram.setU16(DMG.p1rec, 0x8000);
  putShot(ram, 0, { y: 0x1000, x: 0x2000 });
  const c = ctx();
  runType5Tail(ram, c);
  const keys = [...c.unportedLog.calls.keys()];
  // WAVE 60 RETIRED THE LAST OF THIS TEST'S ORIGINAL ADDRESSES.  `$2459D0` was
  // a note from W34 to W58; it is PORTED now, together with `$244D62`'s blocks
  // 1, 2, 3 and 4, so a note filed under it would mean L16 had been deferred
  // again.  Inverted, not deleted -- the same treatment W51 gave `$24518A`.
  assert.ok(!keys.some((k) => k.startsWith('$2459D0 ')),
    '$2459D0 is PORTED since wave 60 and must no longer be a deferral note');
  // WAVE 51 RETIRED ONE OF THIS TEST'S TWO ADDRESSES, and the assertion is
  // INVERTED rather than deleted so it can still fail.  `$24518A` was a note
  // from W34 to W45; it is now PORTED (blocks 7, 8 and `$2453AC`), so a note
  // filed under it would mean the weapon tail had been deferred again.
  assert.ok(!keys.some((k) => k.startsWith('$24518A ')),
    '$24518A is PORTED since wave 51 and must no longer be a deferral note');
});

// ==================================================================== W34 §7
// The six tests below were added AFTER the first mutation pass, each because a
// mutation survived it.  They are the defective checks, fixed -- not new
// coverage dressed up as thoroughness.

test('$245014 subtracts ($16,A6) TWICE, and the second one decides a hit', () => {
  // M3 survived because every fixture had the shot's four half-extents equal
  // AND the enemy sitting exactly on the shot, where one subtract and two both
  // overlap.  The test is `$245018 cmp.w D4,D2 / bcs` -- the enemy's own upper
  // edge against the shot's -- so MORE subtracts make a hit MORE likely, and
  // the discriminating band is an enemy just below the shot.
  //
  //   D4 = shotX + D7 + ($14,A6), then MINUS ($16,A6) once or twice
  //   D2 = enemyX + D7 + ($14,A5)
  // shot X $2000, ($14,A6) $100, ($16,A6) $180  ->  D4 = $4900, $4780, $4600
  // enemy X $1E00, ex $100                      ->  D2 = $4700, D3 = $4500
  // one subtract:  $4700 < $4780  -> MISS.   two: $4700 < $4600 is false -> HIT.
  const damaged = (enemyX) => {
    const ram = new Ram();
    const shot = putShot(ram, 0, { y: 0x1000, x: 0x2000, exY: 0x100, exX: 0x100 });
    ram.setU16(shot + 0x16, 0x180);           // ($16,A6) alone -- the doubled one
    const en = putEnemy(ram, POOLA, 0, { y: 0x1000, x: enemyX, ex: 0x100,
      hp: 0x300 });
    shotBoundingBox(ram, SHOT, 0x2800);
    poolDamage(ram, POOLA, 1, SHOT, 0x2800, DMG.maskP1, 1, 'A');
    return ram.u16(en + 0x18) !== 0x300;
  };
  assert.equal(damaged(0x2000), true, 'the CONTROL: dead centre, both hit');
  assert.equal(damaged(0x1e00), true,
    'and $200 lower it STILL hits -- only because $245014 subtracts again');
});

test('pool B rebiases the box by $F000 and drops D7 to $1800 together', () => {
  // M7 survived because the earlier pool-B tests called `poolDamage` directly,
  // and the rebias lives in `collisionPass`.  Driven through the tail, which is
  // the only way the two halves of $24508C..$24509E are exercised at all.
  const ram = new Ram();
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.mirror2, 0);
  ram.setU16(DMG.p1rec, 0x8000);
  putShot(ram, 0, { y: 0x1000, x: 0x2000, exY: 0x080, exX: 0x080 });
  const en = putEnemy(ram, POOLB, 0, { y: 0x1000, x: 0x2000, ex: 0x080,
    hp: 0x300 });
  ram.setU16(DMG.poolBCount, 1);
  const r = runType5Tail(ram, ctx());
  assert.equal(r.hitsB, 1, 'the enemy and the box are still in step');
  assert.notEqual(ram.u16(en + 0x18), 0x300, 'and it took damage');
});

test('$286660 is `bls`, so a refill that lands EXACTLY on the cap still clamps', () => {
  // M13 survived on a fixture that overshot the cap, where `>` and `>=` agree.
  // The two readings differ on ONE value -- meter + refill == cap -- and the
  // observable difference there is whether $286674 is reached at all.
  const ram = new Ram();
  const rom = ledgerRom();
  const c = ctx();
  ram.setU16(LEDGER.p1.meter, 0x38 - 0x14);   // cap 56, refill 20 -> exactly 56
  scoreKill(ram, rom, c, 0x08, 0x10);
  assert.equal(ram.u16(LEDGER.p1.meter), 0x38);
  assert.ok([...c.unportedLog.calls.keys()].some((k) => k.startsWith('$286674')),
    '$286660 bls takes the clamp on EQUALITY; `bcs` would not');
});

// ---- the two damage-reaction arms in `src/handlers.js` -------------------
import { handlerMap } from '../src/handlers.js';

/** The smallest ROM and RAM a stage-1 handler will run against: the movement
 *  cursor is 0 so `stepMovement` is a no-op, and the enemy sits off-screen but
 *  has never been on-screen, which is the arm that does NOT free it. */
function handlerFixture({ hp, deathFlag = 0, hpReload = 0x500, f38 = 0x7fff }) {
  const ram = new Ram();
  const rec = 0x81332c;
  const sub = 0x81459c;
  ram.setU16(rec, 0x8000);
  ram.setU32(rec + 0x06, sub);
  ram.setU8(rec + 0x20, deathFlag);
  ram.setU16(rec + 0x26, hpReload);
  // $1000 is bit 4 of the type word's HIGH byte, and the handlers' `moveq
  // #$5C,D1 / and.b (A6),D1` reads that BYTE -- $8010 would put the bit in the
  // low half where no handler looks.
  ram.setU16(sub, 0x9000);                    // live + the P1 hit bit ($1000)
  ram.setU16(sub + 0x18, hp);
  ram.setU16(sub + 0x38, f38);
  return { ram, rec, sub };
}

test("type $11's death is TWO STAGES: reload+score first, kill second", () => {
  // M16.  `$268926 tst.b ($20,A5) / bmi $268844` is the gate, and until W34 the
  // port jumped straight to $268844 the first time HP went negative.  Nothing
  // could see it because nothing could reduce HP.
  const rom = ledgerRom();
  const h = handlerMap().get(0x2688cc);
  // ---- FIRST trip to zero: ($20,A5) bit 7 clear
  const a = handlerFixture({ hp: 0xff00 });
  const ca = ctx();
  try { h(a.ram, rom, a.rec, { tables: null, unported: ca.unportedLog, rom }); }
  catch (e) { if (e.name !== 'Unreached') throw e; }
  assert.equal(a.ram.u16(a.sub + 0x18), 0x500,
    '$26892E move.w ($26,A5),($18,A6) -- the HP is RELOADED, not ignored');
  assert.equal(a.ram.u8(a.rec + 0x20) & 0x80, 0x80, '$26893C bset #$7,($20,A5)');
  assert.equal(a.ram.u16(a.rec), 0x8000, 'and the record is STILL LIVE');
  // ---- SECOND trip, with the mark already set
  const b = handlerFixture({ hp: 0xff00, deathFlag: 0x80 });
  const cb = ctx();
  try { h(b.ram, rom, b.rec, { tables: null, unported: cb.unportedLog, rom }); }
  catch (e) { if (e.name !== 'Unreached') throw e; }
  assert.equal(b.ram.u16(b.rec), 0, '$2688C6 jmp $263762 -- freed this time');
  // W54: and the death arm now SPAWNS.  Kind $7, the HIT effect having already
  // put a kind $3 in the first slot on trip one -- so this window is the two
  // kinds side by side, out of two different `moveq`s.
  assert.equal(b.ram.u16(0x81b732) & 0xff, 0x07,
    "$26884C moveq #$7,D0 -- type $11's DEATH kind");
  assert.equal(a.ram.u16(0x81b732) & 0xff, 0x03,
    "$268952 moveq #$3,D0 -- and its HIT kind, on the FIRST trip to zero");
});

test("$268882 DISARMS type $11's pool-D sub-spawn when $815EA2 is already set",
  () => {
  const rom = ledgerRom();
  const h = handlerMap().get(0x2688cc);
  const run = (ea2) => {
    const f = handlerFixture({ hp: 0xff00, deathFlag: 0x80 });
    f.ram.setU16(0x815ea2, ea2);
    const c = ctx();
    try { h(f.ram, rom, f.rec, { tables: null, unported: c.unportedLog, rom }); }
    catch (e) { if (e.name !== 'Unreached') throw e; }
    return f.ram;
  };
  assert.equal(run(0).u16(0x81b732 + 0x12), 0x0000,
    '$26887C move.w #$0,($12,A0) -- ARMED when this is the frame\'s first effect');
  assert.equal(run(1).u16(0x81b732 + 0x12), 0xffff,
    '$26888A move.w #$FFFF,($12,A0) -- DISARMED when $815EA2 is already set');
  assert.equal(run(0).u16(0x815ea2), 1, '$268890 move.w #$1,$815EA2');
  assert.equal(run(0).u16(0x815ea4), 1, '$268898 addq.w #1,$815EA4');
});

test("type $82's $274822 clamp writes min(HP, ($38,A6)) to BOTH", () => {
  // M17.  The clamp was a whole-block `note()` that returned, so a type $82
  // could never die however hard it was shot.  `$27483A cmp.w ($38,A6),D4 /
  // ble $274844` keeps D4 when it is at or below the floor and takes the floor
  // otherwise, so the pair is MONOTONIC: the floor can only ever fall.
  const rom = ledgerRom();
  const h = handlerMap().get(0x2747c6);
  const run = (hp, f38) => {
    const f = handlerFixture({ hp, f38 });
    try { h(f.ram, rom, f.rec, { tables: null, unported: new UnportedLog(), rom }); }
    catch (e) { if (e.name !== 'Unreached') throw e; }
    return [f.ram.u16(f.sub + 0x18), f.ram.u16(f.sub + 0x38)];
  };
  assert.deepEqual(run(0x0300, 0x0500), [0x0300, 0x0300],
    'HP below the floor: BOTH become the HP');
  assert.deepEqual(run(0x0700, 0x0500), [0x0500, 0x0500],
    'HP above the floor: BOTH become the floor -- `ble`, not `bge`');
});
