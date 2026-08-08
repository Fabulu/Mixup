// WAVE 86 -- `$274AF0`, TYPE $82's DEATH ARM.  "no splosions", for the one
// type it was still true of.
//
// W68 §9 signal 5: *"$274AF0, type $82's death arm, is an unported note reached
// 213 times in 7,000 frames -- a $82 never dies, so it never explodes."*  W81
// gave the fighter its picture and left this standing (§9.2), so between W81 and
// this wave the owner could SEE a 96x88 fighter, hit it, drive its HP negative
// and watch nothing happen.
//
// SHAPE.  These drive the REAL `handlerMap().get(0x2747c6)` through the REAL
// `$274822` clamp into the REAL `$274AF0`, and assert on values the CARTRIDGE
// decides wherever one exists:
//   * `$267FA0`'s remap rows and `$288FF0`'s five emit stubs come out of
//     `src/effects.js`'s own tables, which `tools/w10/buckets.py` read off the
//     image -- so "bucket $10" is checked by resolving it to `$23D852`, not by
//     comparing it with the same $10 this file wrote;
//   * the two effect KINDS are resolved through `$221520`/`$221630`, the
//     cartridge's own 34-entry script tables, so "the fighter explodes" is
//     "both kinds name a real descriptor list the driver can walk", not "two
//     slots were allocated";
//   * the POSITION is asserted against a value seeded ONLY at `($2,A6)`, with a
//     DIFFERENT decoy at `($2,A5)` -- W30's own defect in this same handler was
//     a `($2,A5)`/`($2,A6)` swap, and a test seeded with one value cannot see it.
//
// EVERY TEST HERE WAS SEEN TO FAIL.  Each was run against `src/handlers.js` as
// it stood at HEAD, and against five mutations:
//   [M] src/handlers.js at HEAD ($274AF0 a counted note)   W86/1..5 RED, /6 green
//   [M] MUTATION  ram.setU8(e2 + B.speed, 0x680)           W86/4 RED ALONE
//                 -- the byte/word shape W81 §1.6 found in this same handler
//   [M] MUTATION  ram.setU16(e2 + B.f1c, 0x40)             W86/4 RED ALONE
//                 -- the other direction: it clobbers ($1D,A0), which $289004
//                    set to $1E and NOTHING here writes
//   [M] MUTATION  ram.setU32(e1 + B.pos, ram.u32(a5 + 2))  W86/3 RED ALONE
//                 -- W30's ($2,A5)/($2,A6) swap, in the arm below it
//   [M] MUTATION  scoreKill(..., 0x25, d1)                 W86/2 RED ALONE
//                 -- type $85's value pasted onto the fighter's
//   [M] MUTATION  first allocation kind $08 instead of $0D  W86/3 and /5 RED
//                 -- the two arms are two different explosions, in an order
//
// W86/6 STAYING GREEN AT HEAD IS THE POINT OF IT: it is the control, and a
// change that freed a fighter on every hit would satisfy W86/1 and redden /6.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { POOL_B, B, EMIT_STUB } from '../src/effects.js';
import { handlerMap } from '../src/handlers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const CART = HAVE ? new RomWindows(TJ.rom) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- run tools/export-tables.py. THIS IS '
    + 'A SKIP, NOT A PASS.';

/** The two windows `$28615E` reads.  Same fixture `tests/w34damage.test.js`
 *  uses, and the bytes are the cartridge's own. */
function ledgerRom() {
  return new RomWindows({
    windows: [
      { base: '$287df0', len: 8, why: 'the chain cap by loop', hex: '0038005a00140012' },
      { base: '$267fa0', len: 36, why: 'the $267FA0 remap rows',
        hex: '0000000000040008000c0010'
           + '000400040008000c00100010'
           + '0000000000040008000c0010' },
    ],
  });
}

const SUB = 0x81459c;
const REC = 0x81332c;
const slot = (n) => POOL_B.base + n * POOL_B.stride;

/** A type $82 whose HP is about to go NEGATIVE through `$274822`'s clamp.
 *
 *  `($2,A6)` -- the SUB-RECORD's position -- is the value the death arm copies.
 *  `($2,A5)` carries a DIFFERENT longword so a transcription that reads the
 *  record instead of the sub-record is visible; W30 found exactly that swap
 *  eight instructions above this arm. */
function dyingFighter({ hp = 0xff00, f38 = 0x7fff } = {}) {
  const ram = new Ram();
  ram.setU16(REC, 0x8000);                    // the record is LIVE
  ram.setU32(REC + 0x06, SUB);                // ($6,A5) -> the sub-record
  // THE DECOY at ($2,A5).  Only the HIGH word is set: ($4,A5) is `runLen`, which
  // `$263768` reads, so a longword decoy would make the free loop walk 8,738
  // sub-records off the end of RAM.  $11110000 is still nothing like $33334444.
  ram.setU16(REC + 0x02, 0x1111);
  ram.setU16(SUB, 0x9000);                    // live + the P1 hit bit ($1000)
  ram.setU32(SUB + 0x02, 0x33334444);         // the position the arm must copy
  ram.setU16(SUB + 0x18, hp);
  ram.setU16(SUB + 0x38, f38);
  return ram;
}

function kill(ram, opts = {}) {
  const log = new UnportedLog();
  const kills = [];
  const rom = opts.rom ?? ledgerRom();
  const ctx = {
    tables: null, unported: log, unportedLog: log, rom,
    soundPost: (a) => log.note(a, 'WAVE A sound post'),
    killEvent: (d0, d1) => kills.push([d0, d1]),
  };
  const h = handlerMap().get(0x2747c6);
  try { h(ram, rom, REC, ctx); }
  catch (e) { if (e.name !== 'Unreached') throw e; }
  return { log, kills, notes: log.report().join('\n') };
}

// ===========================================================================
// W86/1 -- THE FIGHTER DIES.  This is the whole owner-visible fact.
// ===========================================================================
test('W86/1 $274B64 -- a type $82 whose HP went negative is FREED, and '
  + '$274AF0 is no longer a counted note', () => {
  const ram = dyingFighter();
  const { notes } = kill(ram);
  assert.equal(ram.u16(REC), 0,
    '$274B64 jmp $263762 -- the enemy record is freed. Before this wave the '
    + 'arm was a note that RETURNED, so the fighter sat at negative HP forever');
  assert.ok(!/\$274AF0/.test(notes),
    '$274AF0 must not appear in the unported log any more');
  // and the SOUND is still a declared deferral, not a silent drop
  assert.ok(/\$28C274/.test(notes),
    '$274AF8 jsr $28C274 is one sound request, and 39-OWNER puts sound LAST; '
    + 'it stays COUNTED');
});

// ===========================================================================
// W86/2 -- THE SCORE.  D0 = $42 is the fighter's own value; D1 is the hit mask
//          `$2747EE..$2747F4` built and `$286096` did not clobber.
// ===========================================================================
test('W86/2 $274AF0 moveq #$42 -- the kill is scored with the FIGHTER\'s value '
  + 'and the hit mask that reached it', () => {
  const ram = dyingFighter();
  const { kills } = kill(ram);
  assert.equal(kills.length, 1, 'exactly one $28615E');
  assert.equal(kills[0][0], 0x42,
    '$274AF0 moveq #$42,D0 -- NOT type $85\'s $25 and not type $11\'s');
  // $1000 in the sub-record's type word is bit 4 of the HIGH byte; the handler's
  // `move.b (A6),D1 / or.b $20(A6),D1 / andi.w #$5C,D1` therefore yields $10 --
  // P1 -- and `$286174 btst #4,D1` is what routes the score.
  assert.equal(kills[0][1], 0x10,
    'D1 is the hit mask, still $10 (P1) at $274AF2 -- $286096 works in D2/A0 '
    + 'and does not touch it');
});

// ===========================================================================
// W86/3 -- TWO EXPLOSIONS, IN ORDER, AT THE SUB-RECORD'S POSITION
// ===========================================================================
test('W86/3 $274B00 and $274B2E allocate kinds $0D then $08, both at ($2,A6) '
  + 'and both in bucket 7', () => {
  const ram = dyingFighter();
  kill(ram);
  assert.equal(ram.u16(slot(0)) & 0xff, 0x0d,
    '$274AFE moveq #$D,D0 -- the FIRST allocation');
  assert.equal(ram.u16(slot(1)) & 0xff, 0x08,
    '$274B2A move.w #$8,D0 -- the SECOND, and the ORDER is the ROM\'s');
  assert.equal(ram.u16(slot(0)) & 0x8000, 0x8000, '$28902E ori.w #$8000 -- live');
  assert.equal(ram.u16(slot(1)) & 0x8000, 0x8000);
  for (const n of [0, 1]) {
    assert.equal(ram.u32(slot(n) + B.pos), 0x33334444,
      `$274B06/$274B34 move.l ($2,A6),($2,A0) -- the SUB-RECORD's position. `
      + `slot ${n} carries the record's $11110000 if this reads ($2,A5)`);
    // BUCKET $10 IS NOT ASSERTED AS $10.  It is resolved through $288FF0, the
    // cartridge's own five-entry emit-stub table, which is where the byte
    // offset means anything at all.
    assert.equal(EMIT_STUB[ram.u16(slot(n) + B.bucket)], 0x23d852,
      '$274B0C/$274B3A move.w #$10,($1E,A0) -- $288FF0[4] = $23D852 = BUCKET 7, '
      + 'the layer type $82 itself draws into');
    assert.equal(ram.u16(slot(n) + B.nudge), 0xf600,
      '$274B12/$274B40 move.w #$F600,($26,A0) -- both arms nudge UP');
    assert.equal(ram.u16(slot(n) + B.nudge + 2), 0x0000,
      '$274B18/$274B46 move.w #$0,($28,A0) -- and neither sideways');
    assert.equal(ram.u16(slot(n) + B.sub12), 0x0001,
      '$274B1E/$274B52 move.w #$1,($12,A0) -- the SUB-SPAWN is ARMED. $289004 '
      + 'left it $FFFF (off); both arms turn it on');
    assert.equal(ram.u16(slot(n) + B.sub14), 0x0400,
      '$274B24/$274B58 move.w #$400,($14,A0)');
  }
});

// ===========================================================================
// W86/4 -- THE TWO ARMS ARE NOT THE SAME BLOCK, and two of the differences are
//          the BYTE/WORD shape W81 §1.6 found in this very handler.
// ===========================================================================
test('W86/4 only the SECOND arm writes ($1A,A0) and ($1C,A0) -- one a WORD, '
  + 'one a BYTE', () => {
  const ram = dyingFighter();
  kill(ram);
  // $274B4C `317c 0680 001a` is move.w. Reading it as a byte write of $80 would
  // leave ($1A,A0) = 0 and ($1B,A0) = $80.
  assert.equal(ram.u8(slot(1) + B.speed), 0x06,
    '$274B4C move.w #$680,($1A,A0) -- the HIGH byte is $06');
  assert.equal(ram.u8(slot(1) + B.angle), 0x80,
    'and ($1B,A0), the angle, is $80. A byte write of $680 leaves this 0');
  // $274B5E `117c 0040 001c` is move.b. A word write of $40 would put 0 into
  // ($1D,A0), which $289052 set to $1E and which NOTHING in this arm writes.
  assert.equal(ram.u8(slot(1) + B.f1c), 0x40, '$274B5E move.b #$40,($1C,A0)');
  assert.equal(ram.u8(slot(1) + B.f1d), 0x1e,
    '$289052 move.b #$1E,($1D,A0) SURVIVES -- a word write at ($1C,A0) '
    + 'would zero it, and nothing else in $274AF0..$274B64 touches it');
  // and the FIRST arm has neither
  assert.equal(ram.u16(slot(0) + B.speed), 0x0000,
    '$274AFE..$274B24 has no ($1A,A0) write -- $289004 left it 0');
  assert.equal(ram.u8(slot(0) + B.f1c), 0x00,
    'and no ($1C,A0) write either. The two arms are six and eight fields');
});

// ===========================================================================
// W86/5 -- AND THE EXPLOSION HAS A PICTURE.  Both kinds resolve, in the
//          CARTRIDGE's own script tables, to a real descriptor list.
// ===========================================================================
test('W86/5 kinds $0D and $08 are inside pool B\'s 34 script entries and each '
  + 'names a descriptor list the driver can walk', { skip: SKIP }, () => {
  const ram = dyingFighter();
  kill(ram, { rom: CART });
  for (const [n, kind] of [[0, 0x0d], [1, 0x08]]) {
    assert.equal(ram.u16(slot(n)) & 0xff, kind);
    assert.ok(kind <= POOL_B.kindMax,
      `$289016 cmpi.w #$21,D1 -- kind $${kind.toString(16)} is INSIDE the 34 `
      + 'script entries, so $289004 returned a real slot and not $81C8B2');
    // bit 7 of the kind is clear for both, so both index table A.
    const desc = CART.u32(POOL_B.tableA + kind * 8);
    const durs = CART.u32(POOL_B.tableA + kind * 8 + 4);
    assert.ok(desc >= 0x221740 && desc < 0x222618,
      `$221520[$${kind.toString(16)}] descriptor list $${desc.toString(16)} is `
      + 'inside the cartridge\'s own $221740..$222617 block');
    assert.ok(durs >= 0x221740 && durs < 0x222618,
      `and its duration list $${durs.toString(16)} is too`);
    assert.notEqual(CART.u32(desc), 0,
      'and the list\'s first entry is a real stream, not a terminator -- an '
      + 'explosion with an empty script is an invisible death');
  }
  // The two are DIFFERENT animations, which is why the arm allocates twice.
  assert.notEqual(CART.u32(POOL_B.tableA + 0x0d * 8),
    CART.u32(POOL_B.tableA + 0x08 * 8),
    'kinds $0D and $08 are two different explosions');
});

// ===========================================================================
// W86/6 -- AND IT ONLY HAPPENS WHEN THE HP IS ACTUALLY NEGATIVE.  The control:
//          a fighter that is hit and survives must NOT be freed and must NOT
//          allocate. Without this, W86/1 is satisfied by a handler that frees
//          on every hit.
// ===========================================================================
test('W86/6 a hit that leaves HP POSITIVE walks on into $274854 -- no free, '
  + 'no allocation, no kill', () => {
  const ram = dyingFighter({ hp: 0x0300, f38: 0x0500 });
  const { kills } = kill(ram);
  assert.equal(ram.u16(SUB + 0x18), 0x0300,
    '$27483A ble -- the clamp keeps the HP, which is below the floor');
  assert.equal(ram.u16(REC), 0x8000, 'and the record is STILL LIVE');
  assert.equal(ram.u16(slot(0)), 0, 'nothing was allocated');
  assert.equal(kills.length, 0, 'and nothing was scored as a KILL');
});
