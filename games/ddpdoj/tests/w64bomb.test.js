// WAVE 64 (B2) -- THE BOMB.
//
// Every test here drives `src/bomb.js` against a bare `Ram` with the fields the
// cartridge's own instructions read, and every assertion cites the instruction
// it is about.  The gate (`tools/w64bombgate.mjs`) drives the shipped bundle;
// these are the branches a 2,600-frame scenario does not reach.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { RAM, P } from '../src/machine.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import {
  BOMB, BOMBRAM, BOMB_TEMPLATES, armBombCancel243DA0, bombCooldownExpiry2564BA,
  bombDamage24560A, bombDriver255DD8, bombScript255E3E, bombTeardown2564F0,
  fireBomb2498E2, flushPendingGrants2875B4, resetChain2877D0,
} from '../src/bomb.js';

const ctx = (extra = {}) => ({ unportedLog: new UnportedLog(), ...extra });

/** A player record with the seed's own shape: LIVE, 3 bombs, $FF invulnerable. */
function player(ram, { stock = 3, dead = 0, hyper = 0 } = {}) {
  ram.setU16(RAM.player1, 0x8000);
  ram.setU8(RAM.player1 + BOMBRAM.stockOffset, stock);
  ram.setU8(RAM.player1 + P.invuln, 0xff);
  ram.setU8(RAM.player1 + P.dead, dead);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  ram.setU16(BOMBRAM.hyperActiveP1, hyper);
  return RAM.player1;
}

// ===========================================================================
// $2498E2 -- THE THREE REFUSALS, each on its own
// ===========================================================================
test('$2498E2: no stock refuses, and the stock is NOT consumed', () => {
  const ram = new Ram();
  const rec = player(ram, { stock: 0 });
  assert.equal(fireBomb2498E2(ram, ctx(), rec, 0), 'no-stock');
  assert.equal(ram.u16(BOMBRAM.rec), 0, '$2498E6 beq $249B2C, before $249916');
  assert.equal(ram.u16(BOMBRAM.queue), 0, '...and before $24990E too');
});

test('$2498FC: the HYPER FLASH word refuses -- and recon 38 §1.2 names it wrong',
  () => {
    // The recon calls `$81B6FE` "a bomb is ALREADY RUNNING".  Its only two
    // absolute writers in $230000..$2B0000 are `$28732E move.w #$1` and
    // `$2873A4 clr.w`, inside `$287324`/`$287340` -- the HYPER's flash record,
    // whose only callers are `$285A38` and `$285A96`.  The test pins the
    // BEHAVIOUR (it refuses) and the file's header pins the name.
    const ram = new Ram();
    const rec = player(ram);
    ram.setU16(BOMBRAM.flashP1, 1);
    assert.equal(fireBomb2498E2(ram, ctx(), rec, 0), 'hyper-flash-up');
    assert.equal(ram.u8(rec + BOMBRAM.stockOffset), 3, 'stock untouched');
    // ...and it is P1's word, not P2's: $2498F6 lea $81B700,A1 on the other arm
    ram.setU16(BOMBRAM.flashP1, 0);
    ram.setU16(BOMBRAM.flashP2, 1);
    assert.equal(fireBomb2498E2(ram, ctx(), rec, 0), 'fired',
      'P2\'s flash word does not veto P1\'s bomb');
  });

test('$249908: a bomb ALREADY UP refuses -- and it is THIS routine\'s record',
  () => {
    const ram = new Ram();
    const rec = player(ram);
    ram.setU16(BOMBRAM.rec, 0x8000);         // $249908 tst.w (A1) / bmi
    assert.equal(fireBomb2498E2(ram, ctx(), rec, 0), 'bomb-already-up');
    assert.equal(ram.u8(rec + BOMBRAM.stockOffset), 3);
    // POSITIVE is not a refusal -- `bmi`, not `bne`.
    ram.setU16(BOMBRAM.rec, 0x7fff);
    assert.equal(fireBomb2498E2(ram, ctx(), rec, 0), 'fired');
  });

// ===========================================================================
// $249916 -- THE STOCK, AND WHAT HAPPENS AT ZERO
// ===========================================================================
test('$249916 subq.b: the stock falls by one per bomb and $24991A gates the '
  + 'LAST one', () => {
  const ram = new Ram();
  const rec = player(ram, { stock: 2 });
  const c = ctx();
  assert.equal(fireBomb2498E2(ram, c, rec, 0), 'fired');
  assert.equal(ram.u8(rec + BOMBRAM.stockOffset), 1);
  // $24991A bne $249930 -- one left, so $2875B4 is NOT called.
  bombTeardown2564F0(ram, c);
  ram.setU16(BOMBRAM.rec, 0);
  assert.equal(fireBomb2498E2(ram, c, rec, 0), 'fired');
  assert.equal(ram.u8(rec + BOMBRAM.stockOffset), 0,
    'the LAST bomb takes it to zero, and only then does $249922 run');
  ram.setU16(BOMBRAM.rec, 0);
  assert.equal(fireBomb2498E2(ram, c, rec, 0), 'no-stock',
    'and the next press is dropped at $2498E6');
});

test('$2875B4 is a PROVEN no-op here, and it THROWS rather than granting', () => {
  const ram = new Ram();
  const c = ctx();
  // The seed: $81B6E4 = 0 and $81B6E0 = 0.
  flushPendingGrants2875B4(ram, c, false);
  assert.equal(ram.u16(BOMBRAM.pending1), 0, '$2875DC beq $287614 -- an rts');
  // ONE pending grant and it must not spawn: $2530BE would become reachable.
  ram.setU16(BOMBRAM.pending1, 1);
  try {
    flushPendingGrants2875B4(ram, c, false);
    assert.fail('a pending hyper-stock grant must not be spawned silently');
  } catch (err) {
    assert.ok(err instanceof Unreached);
    assert.equal(err.romAddress, BOMB.itemSpawner,
      'matched by romAddress, never by message text');
  }
  // $2875DE cmpi.w #$95F -- the meter at exactly $95F adds ONE MORE grant.
  ram.setU16(BOMBRAM.earnP1, 0x95f);
  try { flushPendingGrants2875B4(ram, c, false); } catch { /* expected */ }
  assert.equal(ram.u16(BOMBRAM.earnP1), 0,
    '$2875E8 clr.w runs BEFORE the loop, so the accumulator is spent either way');
});

// ===========================================================================
// $249A4A -- THE RECORD, AND THE RANK DEBIT AT THE CALL SITE
// ===========================================================================
test('$249A4A: the record is $8000 | (player<<7) | ($58,A6), at the ship\'s '
  + 'position', () => {
  const ram = new Ram();
  const rec = player(ram);
  fireBomb2498E2(ram, ctx(), rec, 0);
  assert.equal(ram.u16(BOMBRAM.rec), 0x8000, 'P1, ship 0');
  assert.equal(ram.u16(BOMBRAM.rec + 0x02), 0x2000, '$249A50 move.l ($2,A6)');
  assert.equal(ram.u16(BOMBRAM.rec + 0x04), 0x1800);
  assert.equal(ram.u8(rec + P.invuln), 0xff, '$249A56 move.b #$FF,($3E,A6)');
  assert.ok(ram.btst8(rec, 6), '$249A2E bset #$6,(A6)');
  assert.ok(ram.btst8(rec + 0x01, 6), '$249A32 bset #$6,($1,A6)');
});

test('the P2 arm sets bit 7 of the record\'s LOW byte, which is what $255DD8 '
  + 'and $2564BA read as "which player"', () => {
  const ram = new Ram();
  ram.setU16(RAM.player2, 0x8000);
  ram.setU8(RAM.player2 + BOMBRAM.stockOffset, 1);
  ram.setU8(RAM.player2 + P.invuln, 0xff);
  assert.equal(fireBomb2498E2(ram, ctx(), RAM.player2, 1), 'fired');
  assert.equal(ram.u16(BOMBRAM.rec), 0x8080, '$249A3E lsl.w #$7,D2');
  assert.equal(ram.u16(BOMBRAM.usedP2), 1, '$249986, not $249936');
});

test('**BOMBING WHILE HYPERING THROWS AT $285AF2** -- and the -3 is at the '
  + 'CALL SITE, not inside the hyper end', () => {
  const ram = new Ram();
  const rec = player(ram, { hyper: 1 });
  ram.setU16(BOMBRAM.rankPowerP1, 10);
  try {
    fireBomb2498E2(ram, ctx(), rec, 0);
    assert.fail('$249970/$249976 must not be skipped silently');
  } catch (err) {
    assert.ok(err instanceof Unreached);
    assert.equal(err.romAddress, BOMB.hyperEnd);
  }
  assert.equal(ram.u16(BOMBRAM.rankPowerP1), 10,
    'nothing was debited: the throw is in FRONT of $249976, so a run that '
    + 'hits it has not silently moved the rank power word');
  assert.equal(ram.u16(BOMBRAM.rec), 0,
    '...and the record was not allocated either -- $249968 is before $249A4A');
});

test('$2499D8: the chain LATCH is set only when the meter was non-zero', () => {
  const ram = new Ram();
  const rec = player(ram);
  ram.setU16(BOMBRAM.meterP1, 0);
  fireBomb2498E2(ram, ctx(), rec, 0);
  assert.equal(ram.u16(BOMBRAM.chainLatchP1), 0, '$2499D4 tst.w D0 / beq');
  ram.setU16(BOMBRAM.rec, 0);
  ram.setU16(BOMBRAM.meterP1, 20);
  fireBomb2498E2(ram, ctx(), rec, 0);
  assert.equal(ram.u16(BOMBRAM.chainLatchP1), 1,
    '$2499D8 move.w #$1,(A3) -- and $2564F0 cashes it in for $2877D0 LATER');
});

test('$249B10: a bomb hands its invulnerability to the OTHER player, and A2 '
  + 'really is the other one', () => {
  const ram = new Ram();
  const rec = player(ram);
  ram.setU16(RAM.player2, 0x8000);                   // P2 is LIVE
  assert.equal(fireBomb2498E2(ram, ctx(), rec, 0), 'fired+partner');
  assert.equal(ram.u8(RAM.player2 + P.invuln), 0xff, '$249B16');
  assert.equal(ram.u16(RAM.player2 + 0x28), 0x3c, '$249B1C move.w ($28,A6)');
  assert.equal(ram.u16(RAM.player2 + 0x26), 0, '$249B22');
  // A dead P2 gets nothing: $249B12 bpl.w $249E4E.
  const ram2 = new Ram();
  const rec2 = player(ram2);
  ram2.setU16(RAM.player2, 0x0000);
  assert.equal(fireBomb2498E2(ram2, ctx(), rec2, 0), 'fired');
  assert.equal(ram2.u8(RAM.player2 + P.invuln), 0);
});

test('**THE LASER BOMB THROWS** -- ($3f,A6) picks a different weapon', () => {
  const ram = new Ram();
  const rec = player(ram, { dead: 1 });
  try {
    fireBomb2498E2(ram, ctx(), rec, 0);
    assert.fail('$249A80 must not be run as if it were $249A62');
  } catch (err) {
    assert.ok(err instanceof Unreached);
    assert.equal(err.romAddress, BOMB.deathArm);
  }
  assert.equal(ram.u16(rec + 0x28), 0,
    'the throw is at the arm\'s FIRST instruction, so no partial state');
});

// ===========================================================================
// $243DA0 -- ARM ONLY, and NOT the midboss's entry
// ===========================================================================
test('$243DA0 arms $81B412 := $FFFF (the TRANSFORM arm), where $243E7C arms 0',
  () => {
    const ram = new Ram();
    assert.equal(armBombCancel243DA0(ram), true);
    assert.equal(ram.u16(BOMBRAM.armWord), 1, '$243DBE');
    assert.equal(ram.u16(BOMBRAM.modeWord), 0xffff,
      '$243DC6 -- NEGATIVE, so src/bulletdriver.js takes $281D48 and not the '
      + '$27F8F8 arm the midboss\'s $243E7C takes');
    // A class $20..$3C cancel already running is refused.
    ram.setU16(BOMBRAM.modeWord, 0x30);
    assert.equal(armBombCancel243DA0(ram), false, '$243DBC rts');
    assert.equal(ram.u16(BOMBRAM.modeWord), 0x30);
    // ...but $1F and $3D are both outside the window.
    ram.setU16(BOMBRAM.modeWord, 0x1f);
    assert.equal(armBombCancel243DA0(ram), true, '$243DB0 bcs <arm>');
    ram.setU16(BOMBRAM.armWord, 1); ram.setU16(BOMBRAM.modeWord, 0x3d);
    assert.equal(armBombCancel243DA0(ram), true, '$243DBA bhi <arm>');
  });

// ===========================================================================
// $255DD8 / $255E3E -- THE DRIVER
// ===========================================================================
/** The cartridge's own bytes for the three templates and the two scripts. */
function bombRom() {
  const base = BOMB_TEMPLATES.window, len = BOMB_TEMPLATES.windowLen;
  const bytes = new Uint8Array(len);
  const put = (off, ...ws) => ws.forEach((w, i) => {
    bytes[off + i * 2] = w >>> 8; bytes[off + i * 2 + 1] = w & 0xff;
  });
  // $25653C, the INIT template (15 words), with the script pointer at +$10.
  put(0x00, 0x4400, 0x1800, 0x1800, 0x1800, 0x1800, 0x0002, 0x0000, 0x0006,
    0x0025, 0x6558, 0x0001, 0x0000, 0x0000, 0x0000, 0xdc00);
  // $256558, FOUR 12-byte script entries and the $FFFF terminator.
  for (let k = 0; k < 4; k++) {
    put(0x1c + k * 12, 0xdc00, 0xe800, 0x0002, 0x467c + k, 0x24c0, 0x0006);
  }
  put(0x1c + 48, 0xffff);
  // $2565BC, the FADE template (17 words): +$14 -> $2565DE, +$1A -> $1C.
  put(0x80, 0xe000, 0xe800, 0x22c0, 0x1e00, 0x1e00, 0x1e00, 0x1e00, 0x0100,
    0x0000, 0x0006, 0x0025, 0x65de, 0x0001, 0x001c, 0x0001, 0x0001, 0x0006);
  // $2565DE, EIGHT longwords.
  for (let k = 0; k < 8; k++) put(0xa2 + k * 4, 0x0002, 0xd5e8 - k * 0x100);
  // $25661E, the BLINK template (14 words): +$14 -> $25663A.
  put(0xe2, 0xe000, 0xe800, 0x22c0, 0x1400, 0x1400, 0x1400, 0x1400, 0x0010,
    0x0000, 0x0006, 0x0025, 0x663a, 0x0001, 0x0002);
  // $25663A, FOUR longwords and $FFFFFFFF.
  for (let k = 0; k < 4; k++) put(0xfe + k * 4, 0x0002, 0xe2ac + k * 0x100);
  put(0xfe + 16, 0xffff, 0xffff);
  const at = (a) => a - base;
  return {
    u8: (a) => bytes[at(a)],
    u16: (a) => (bytes[at(a)] << 8) | bytes[at(a) + 1],
    u32: (a) => (((bytes[at(a)] << 24) | (bytes[at(a) + 1] << 16)
      | (bytes[at(a) + 2] << 8) | bytes[at(a) + 3]) >>> 0),
  };
}

test('$255DD8: a POSITIVE record runs the $81296C cooldown, not the script',
  () => {
    const ram = new Ram();
    const c = ctx();
    assert.equal(bombDriver255DD8(ram, bombRom(), c), false,
      '$255DE2 tst.w $81296C / beq $255DF4 -- an rts on every ordinary frame');
    ram.setU16(BOMBRAM.cooldown, 2);
    ram.setU8(RAM.player1 + P.invuln, 0xff);
    bombDriver255DD8(ram, bombRom(), c);
    assert.equal(ram.u16(BOMBRAM.cooldown), 1);
    assert.equal(ram.u8(RAM.player1 + P.invuln), 0xff, 'not yet');
    bombDriver255DD8(ram, bombRom(), c);
    assert.equal(ram.u16(BOMBRAM.cooldown), 0);
    assert.equal(ram.u8(RAM.player1 + P.invuln), 0,
      '$255DF0 beq.w $2564BA -- the FIRST thing in this port that has ever '
      + 'cleared the seed\'s ($3e,A6) = $FF');
  });

test('$2564BA: $FF is cleared on the BOMBER and anything is cleared on the '
  + 'other player', () => {
  const ram = new Ram();
  ram.setU8(RAM.player1 + P.invuln, 0x40);           // NOT $FF
  ram.setU8(RAM.player2 + P.invuln, 0x40);
  bombCooldownExpiry2564BA(ram);
  assert.equal(ram.u8(RAM.player1 + P.invuln), 0x40,
    '$2564DC cmpi.b #$FF / bne $2564EA -- A0 keeps a non-$FF timer');
  assert.equal(ram.u8(RAM.player2 + P.invuln), 0, '$2564EA clr.b, unguarded');
});

test('$255E16: the dispatch index is the record AND $7, and entry 1 THROWS',
  () => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);                 // the LASER bomb's bit 0
    try {
      bombDriver255DD8(ram, bombRom(), ctx());
      assert.fail('$255E2E[1] = $255FE2 must not be run as if it were $255E3E');
    } catch (err) {
      assert.ok(err instanceof Unreached);
      assert.equal(err.romAddress, BOMB.driverAlt);
    }
  });

test('$255E3E: the INIT install lands the script pointer on ($1E,A6) and the '
  + 'record drifts with $813176, not with the player', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8000);
  ram.setU16(BOMBRAM.rec + 0x04, 0x1800);
  ram.setU16(BOMBRAM.scrollX, 0x0040);
  const c = ctx();
  bombScript255E3E(ram, bombRom(), c);
  assert.equal(ram.u16(BOMBRAM.rec + 0x04), 0x17c0 - 0x0000 + 0x0000,
    '$255E44 sub.w D1,($4,A6) runs BEFORE the install and is not undone');
  assert.equal(ram.u16(BOMBRAM.rec + 0x02), 0x4400,
    '$255E5C move.w (A0)+,(A1)+ OVERWRITES the Y $249A50 just copied');
  assert.equal(ram.u32(BOMBRAM.rec + 0x1e), 0x00256558 + 12,
    'the SCRIPT POINTER -- the install writes $00256558 and the SAME frame '
    + 'walks entry 0 and advances, because ($22,A6) arrives as 0 and the '
    + 'subq BORROWS on its first use (see the next test)');
  assert.equal(ram.u16(BOMBRAM.rec + 0x28), 0, 'phase 0');
  assert.ok(ram.btst8(BOMBRAM.rec, 0), '$255E4E bset #$0,(A6) -- the latch');
  assert.equal(c.unportedLog.calls.size, 1, 'the $28C55C cue is COUNTED');
});

test('$255EBA: the script advances on the BORROW, i.e. every other frame with '
  + 'the reload of 1', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8000);
  const rom = bombRom();
  const c = ctx();
  bombScript255E3E(ram, rom, c);                     // frame 1: install + walk
  assert.equal(ram.u32(BOMBRAM.rec + 0x1e), 0x00256558 + 12,
    'tick was 0, so the subq BORROWED and the pointer moved');
  bombScript255E3E(ram, rom, c);                     // frame 2
  assert.equal(ram.u32(BOMBRAM.rec + 0x1e), 0x00256558 + 12,
    'tick was 1 -> 0, NO borrow, $255EBE bcc $255ED0');
  bombScript255E3E(ram, rom, c);                     // frame 3
  assert.equal(ram.u32(BOMBRAM.rec + 0x1e), 0x00256558 + 24);
});

test('$255ED2: the FOURTH terminator installs the FADE and $255F02 runs in the '
  + 'SAME frame', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8000);
  const rom = bombRom();
  const c = ctx();
  const phases = [];
  const cc = { ...c, bombEvent: (k, v) => { if (k === 'phase') phases.push(v); } };
  for (let f = 0; f < 7; f++) bombScript255E3E(ram, rom, cc);
  assert.deepEqual(phases, [1],
    'four 12-byte entries, one per BORROW, and the borrow is every other '
    + 'frame after the first -- so the terminator is reached on frame 7');
  assert.equal(ram.u32(BOMBRAM.rec + 0x1e), 0x002565de, 'the FADE table');
  assert.equal(ram.u16(BOMBRAM.rec + 0x28), 1, 'phase 1');
  assert.equal(ram.u16(BOMBRAM.rec + 0x24), 0x18,
    '**($24,A6) IS ALREADY 24, NOT 28.**  $255EF8 beq $255F02 falls into the '
    + 'phase test IN THE SAME FRAME, so the install writes $1C and $255F32 '
    + 'subq.w #$4 spends the first step before the frame ends. A port that '
    + 'returned after the install would run the fade one frame long');
});

test('**$255F7E bchg SETS Z FROM THE OLD BIT** -- the blink draws on the frame '
  + 'it CLEARS the bit, not the frame it sets it', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8100);                   // already initialised
  ram.setU16(BOMBRAM.rec + 0x28, 2);                 // phase 2
  ram.setU32(BOMBRAM.rec + 0x1e, 0x0025663a);
  const rom = bombRom();
  const c = ctx();
  bombScript255E3E(ram, rom, c);
  assert.equal(ram.u32(BOMBRAM.rec + 0x1e), 0x0025663a,
    'frame 1: the bit went 0->1, Z was set, $255F82 bne NOT taken -> rts');
  assert.ok(ram.btst8(BOMBRAM.rec, 1));
  bombScript255E3E(ram, rom, c);
  assert.equal(ram.u32(BOMBRAM.rec + 0x1e), 0x0025663a + 4,
    'frame 2: the bit went 1->0, Z clear, the draw and the advance ran');
  assert.ok(!ram.btst8(BOMBRAM.rec, 1));
});

// ===========================================================================
// $2564F0 -- THE TEARDOWN
// ===========================================================================
test('$2564F0 resets ONLY the chains whose latch is set, and drains all 45 '
  + 'records', () => {
  const ram = new Ram();
  for (let k = 0; k < BOMBRAM.slots; k++) {
    ram.setU16(BOMBRAM.rec + k * BOMBRAM.stride, 0x8000 + k);
  }
  ram.setU16(0x81b5c0, 40); ram.setU16(0x81b5ea, 40);
  ram.setU16(BOMBRAM.chainLatchP1, 1);               // P1 latched, P2 not
  ram.bset8(RAM.player1 + 0x01, 6);
  ram.bset8(RAM.player2 + 0x01, 6);
  ram.setU32(BOMBRAM.soundQueue, 0x00010001);
  assert.equal(bombTeardown2564F0(ram, ctx()), 1);
  assert.equal(ram.u16(0x81b5c0), 0, '$2877D0 ran');
  assert.equal(ram.u16(0x81b5ea), 40, '$2877FE did NOT -- $256500 tst.w / beq');
  assert.ok(!ram.btst8(RAM.player1 + 0x01, 6), '$256516 bclr #$6,$8103E7');
  assert.ok(!ram.btst8(RAM.player2 + 0x01, 6), '$25651E bclr #$6,$810449');
  assert.equal(ram.u32(BOMBRAM.soundQueue), 0, '$256510 move.l D0 -- BOTH words');
  let dirty = 0;
  for (let k = 0; k < BOMBRAM.slots; k++) {
    if (ram.u16(BOMBRAM.rec + k * BOMBRAM.stride) !== 0) dirty++;
  }
  assert.equal(dirty, 0, '$256526 moveq #$2C,D7 is FORTY-FIVE records');
  assert.equal(ram.u16(BOMBRAM.rec + 45 * BOMBRAM.stride), 0,
    'and the 46th was never written -- an off-by-one would be invisible above');
});

test('$2877D0 and $2877FE write SEVEN different addresses each, and they are '
  + 'not one routine with a parameter', () => {
  const ram = new Ram();
  const p1 = [0x81b5b8, 0x81b5bc, 0x81b5c0, 0x81b5ca, 0x81b5ce, 0x81b5d2, 0x81b5da];
  const p2 = [0x81b5e2, 0x81b5e6, 0x81b5ea, 0x81b5f4, 0x81b5f8, 0x81b5fc, 0x81b604];
  for (const a of [...p1, ...p2]) ram.setU32(a, 0x11111111);
  resetChain2877D0(ram, false);
  for (const a of p1) assert.equal(ram.u16(a), 0, `$${a.toString(16)} cleared`);
  assert.notEqual(ram.u16(p2[2]), 0, 'P2 untouched');
  resetChain2877D0(ram, true);
  for (const a of p2) assert.equal(ram.u16(a), 0);
  // The two blocks ARE $2A apart, entry for entry -- checked here because a
  // reader who assumes that is right, and a reader who assumes the STRIDE
  // WITHIN each block is uniform is not: $81B5C0 -> $81B5CA is $A while
  // $81B5B8 -> $81B5BC is 4.  Both are transcribed as seven separate stores.
  assert.deepEqual(p1.map((a, i) => p2[i] - a), p1.map(() => 0x2a));
  assert.deepEqual(p1.slice(1).map((a, i) => a - p1[i]), [4, 4, 0xa, 4, 4, 8]);
});

// ===========================================================================
// $24560A -- THE DAMAGE
// ===========================================================================
function enemy(ram, slot, { hp = 0x2000, y = 0x2000, x = 0x2000 } = {}) {
  const a5 = BOMBRAM.poolA + slot * BOMBRAM.poolAStride;
  ram.setU16(a5, 0xa000);                            // live + bit 13
  ram.setU16(a5 + 0x02, y); ram.setU16(a5 + 0x04, x);
  ram.setU16(a5 + 0x10, 0x40); ram.setU16(a5 + 0x12, 0x40);
  ram.setU16(a5 + 0x14, 0x40); ram.setU16(a5 + 0x16, 0x40);
  ram.setU16(a5 + 0x18, hp);
  return a5;
}

test('$24560A: $50 off every live on-screen slot, and $245644 is 150 slots '
  + 'and not pool A\'s 100', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8000);
  ram.setU32(BOMBRAM.rec + 0x1e, 0x00256558);        // $24564A tst.w -> $50
  ram.bset8(RAM.player1 + 0x01, 6);
  ram.setU16(BOMBRAM.hitMask, 0x1000);
  const first = enemy(ram, 0);
  const last = enemy(ram, 149);                      // the 150th slot
  const past = enemy(ram, 150);                      // one past the dbra
  const r = bombDamage24560A(ram, ctx(), RAM.player1);
  assert.equal(r.hp, 0x50, '$245648 moveq #$50,D5');
  assert.equal(r.hits, 2);
  assert.equal(ram.u16(first + 0x18), 0x2000 - 0x50, '$245696 sub.w D5');
  assert.equal(ram.u16(last + 0x18), 0x2000 - 0x50,
    'slot 149 IS hit -- $245644 move.w #$95,D7 is 149, so the dbra runs 150 '
    + 'times, which runs off pool A (100 slots) and into pool B');
  assert.equal(ram.u16(past + 0x18), 0x2000, 'slot 150 is NOT');
  assert.equal(ram.u16(first) & 0x1000, 0x1000, '$24569A or.w D6,(A5)');
  assert.equal(ram.u16(BOMBRAM.g12952), 0x7800, '$245622');
});

test('$24564A: ONE point of damage while the script pointer is still 0', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8000);
  ram.setU32(BOMBRAM.rec + 0x1e, 0);                 // the frame between
  ram.bset8(RAM.player1 + 0x01, 6);                  //   $249A4A and $255E52
  const e = enemy(ram, 3);
  assert.equal(bombDamage24560A(ram, ctx(), RAM.player1).hp, 1,
    '$245650 moveq #$1,D5 -- not zero and not $50');
  assert.equal(ram.u16(e + 0x18), 0x2000 - 1);
});

test('$24560A\'s four box rejections are four DIFFERENT comparisons', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8000);
  ram.setU32(BOMBRAM.rec + 0x1e, 0x00256558);
  ram.bset8(RAM.player1 + 0x01, 6);
  const cases = [
    ['$245672 bcs -- the WORD carry out of +$2800', { y: 0xe000 }],
    ['$24567A cmpi.w #$9800 / bhi', { y: 0x7800 }],
    ['$245688 bmi -- the X sum went negative', { x: 0x7fd0 }],
    ['$245690 cmpi.w #$6000 / bhi', { x: 0x4000 }],
  ];
  for (const [why, over] of cases) {
    for (let k = 0; k < 150; k++) ram.setU16(BOMBRAM.poolA + k * 0x20, 0);
    enemy(ram, 0, over);
    assert.equal(bombDamage24560A(ram, ctx(), RAM.player1).hits, 0, why);
  }
  // ...and a slot inside all four IS hit, so the four are not vacuous.
  for (let k = 0; k < 150; k++) ram.setU16(BOMBRAM.poolA + k * 0x20, 0);
  enemy(ram, 0);
  assert.equal(bombDamage24560A(ram, ctx(), RAM.player1).hits, 1);
});

test('$24560A\'s three per-slot skips: not live, HP already negative, bit 13 '
  + 'clear', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.rec, 0x8000);
  ram.setU32(BOMBRAM.rec + 0x1e, 0x00256558);
  ram.bset8(RAM.player1 + 0x01, 6);
  const a = enemy(ram, 0); ram.setU16(a, 0x2000);           // $245654 bpl
  const b = enemy(ram, 1); ram.setU16(b + 0x18, 0x8001);    // $24565A bmi
  const c = enemy(ram, 2); ram.setU16(c, 0x8000);           // $245660 btst #$D
  const d = enemy(ram, 3);
  assert.equal(bombDamage24560A(ram, ctx(), RAM.player1).hits, 1);
  assert.equal(ram.u16(d + 0x18), 0x2000 - 0x50, 'only the fourth');
});

test('$24560A: bit 0 of the RECORD picks the other 809 bytes, and it throws',
  () => {
    const ram = new Ram();
    ram.setU16(BOMBRAM.rec, 0x8001);
    ram.bset8(RAM.player1 + 0x01, 6);
    try {
      bombDamage24560A(ram, ctx(), RAM.player1);
      assert.fail('$2456A6 must not be skipped silently');
    } catch (err) {
      assert.ok(err instanceof Unreached);
      assert.equal(err.romAddress, BOMB.damageAlt);
    }
  });

test('$24560A\'s two guards are checked BEFORE $245622 writes $812952', () => {
  const ram = new Ram();
  ram.setU16(BOMBRAM.g12952, 0x1234);
  ram.setU16(BOMBRAM.rec, 0x0000);
  ram.bset8(RAM.player1 + 0x01, 6);
  assert.equal(bombDamage24560A(ram, ctx(), RAM.player1), null);
  assert.equal(ram.u16(BOMBRAM.g12952), 0x1234, '$245614 bpl.w $2459CE');
  ram.setU16(BOMBRAM.rec, 0x8000);
  ram.bclr8(RAM.player1 + 0x01, 6);
  assert.equal(bombDamage24560A(ram, ctx(), RAM.player1), null);
  assert.equal(ram.u16(BOMBRAM.g12952), 0x1234, '$245618 btst #$6 / beq');
});

// ===========================================================================
// THE EXPORTER'S OWN CLAIMS
// ===========================================================================
import fs from 'node:fs';
const TOOL = (n) => fs.readFileSync(new URL(`../tools/${n}`, import.meta.url), 'utf8');

test('the exporter DECLARES the bomb window and ASSERTS its six extents', () => {
  const s = TOOL('export-tables.py');
  assert.ok(/def check_bomb_extents/.test(s));
  assert.ok(/check_hud_extents\(d\)[^\n]*\n\s*check_bomb_extents\(d\)/.test(s),
    'and it runs on EVERY export, not behind a flag');
  assert.ok(/\(0x25653C, 0x0112,/.test(s),
    'the window is the UNION of the six extents, $25653C..$25664D');
  for (const pin of [/0x255E54\) != 0x0025653C/, /0x25653C \+ 0x10\) != 0x00256558/,
    /0x256558 \+ 4 \* 12\) != 0xFFFF/, /0x2565BC \+ 0x1A\) != 0x001C/,
    /0x25663A \+ 4 \* 4\) != 0xFFFFFFFF/]) {
    assert.ok(pin.test(s), `check_bomb_extents must pin ${pin}`);
  }
});

test('the port declares the same window the exporter does', () => {
  assert.equal(BOMB_TEMPLATES.window, 0x25653c);
  assert.equal(BOMB_TEMPLATES.windowLen, 0x112);
  assert.equal(BOMB_TEMPLATES.window + BOMB_TEMPLATES.windowLen, 0x25664e);
  assert.equal(BOMB_TEMPLATES.init + BOMB_TEMPLATES.initLen, 0x25655a);
  assert.equal(BOMB_TEMPLATES.fade + BOMB_TEMPLATES.fadeLen, 0x2565de,
    'the FADE template ends exactly where its own anim table begins');
  assert.equal(BOMB_TEMPLATES.blink + BOMB_TEMPLATES.blinkLen, 0x25663a,
    '...and the BLINK template ends exactly where its list begins');
});
