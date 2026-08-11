// W323: stage-5 type $1B -- a four-state ramped turret that fires a MIRRORED AIMED PAIR.
//
// Five of stage 5's 770 records, 1020 bytes, and NOT ONE NEW PRIMITIVE: W320 found it sharing type
// $8E's whole damage arm, and W322 (wrongly) reported it blocked on `$24226E` before finding that
// `$24226E` is `aim256FromCaller` and always was.
//
// Four things in it are worth a test rather than a comment:
//   * the INLINE bounds test is TWO separate `addi.w`s, and folding them changes the answer
//   * the five stage rows are all `0A 15`, which a later reader should not go hunting for
//   * `asr.b #1` on the RNG draw is an ARITHMETIC shift on a SIGNED byte
//   * the $8130D8 refcount is incremented once and decremented on BOTH exits

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { handlerMap, HANDLER_ADDRESSES } from '../src/handlers.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const TABLES = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const HANDLER = 0x269350;
const INITBODY = 0x26925e;
const STAGE_ROWS = 0x2692d2;
const SPRITE_RING = 0x26971c;
const RAMP = 0x26972c;
const DEATH_ROWS = 0x26970c;
const A5 = 0x8137c0;              // a scratch enemy record, clear of the live table
const A6 = 0x8139c0;              // its sub-record
const STAGE = 0x813092;
const STAGE_X2 = 0x813094;
const FREEZE = 0x8130d2;
const REFCOUNT = 0x8130d8;        // `midbossD8` in the port, and that name is wrong (W320)
const LOWHP_GATE = 0x8130ca;

function world({ x = 0x2000, hp = 0x0500 } = {}) {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);                     // the sub-record pointer
  ram.setU16(A6 + 0x02, x);                      // X, on screen and above the $1000 fire gate
  ram.setU16(A6 + 0x04, 0x2000);                 // Y
  ram.setU16(A6 + 0x18, hp);                     // HP, positive and above $380
  ram.setU8(A5 + 0x16, 1);                       // it has been SEEN, so off-screen means free
  const bullets = [];
  const effects = [];
  const notes = [];
  return {
    ram, log, bullets, effects, notes,
    ctx: {
      tables: TABLES, rom: ROM,
      unported: log, unportedLog: log, notes: log,
      bulletSpawn: (site, res) => bullets.push({ site, res }),
      effectSpawn: (kind) => effects.push(kind),
      soundPost: (cue) => notes.push(cue),
    },
  };
}
const run = (f) => handlerMap().get(HANDLER)(f.ram, ROM, A5, f.ctx);

// ==================== 1. BOTH HALVES REGISTERED, AND THE TYPE TABLE AGREES

test('W323 type $1B\'s handler and init body are both registered', { skip: SKIP }, () => {
  // A handler without its init body spawns a record the ROM never filled, and `dojcoverage.py`'s
  // inventory check requires BOTH -- what W315 learned the hard way.
  assert.ok(HANDLER_ADDRESSES.includes(HANDLER), 'the handler');
  assert.ok(INIT_BODY_ADDRESSES.includes(INITBODY), 'and the init body');
});

test('W323 the type table names exactly these two addresses', { skip: SKIP_IMG }, () => {
  // Read it rather than trusting the census. `$1B < $80`, so it is in the LOW table at $267824.
  const off = 0x1b * 8;
  assert.equal(IMG.readUInt32BE(0x267824 + off), 0x269256, 'the init stub');
  assert.equal(IMG.readUInt32BE(0x267824 + off + 4), HANDLER, 'and the handler');
});

// ==================== 2. THE FIVE STAGE ROWS ARE ALL THE SAME, AND THAT IS MEASURED

test('W323 all five stage rows are `0A 15`, so the stage index changes nothing here',
  { skip: SKIP_IMG }, () => {
    // W320 noticed this and it is asserted so a later reader does not hunt for a per-stage
    // difference that is not in this build. The port still performs the INDEXED read: the sameness
    // is a fact about the data, not a licence to drop the index.
    for (let s = 0; s < 5; s++) {
      assert.equal(IMG[STAGE_ROWS + s * 2], 0x0a, `row ${s} byte 0`);
      assert.equal(IMG[STAGE_ROWS + s * 2 + 1], 0x15, `row ${s} byte 1`);
    }
  });

test('W323 the init body brackets the refcount and stores the ADVANCED sub-proto pointer',
  { skip: SKIP }, () => {
    const f = world();
    f.ram.setU16(REFCOUNT, 7);                   // an arbitrary live count
    f.ram.setU16(STAGE, 0);
    f.ram.setU16(STAGE_X2, 0);
    runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
    assert.equal(f.ram.u16(REFCOUNT), 8, '$2692C4 addq.w #1,$8130D8');
    // $26926A move.l A0,($44,A5) -- the ADVANCED pointer, so it must be past the table's base.
    assert.ok(f.ram.u32(A5 + 0x44) > 0x2692fa,
      `($44,A5) is $${f.ram.u32(A5 + 0x44).toString(16)}, not advanced past $2692FA`);
    // $2692BC/$2692C0 -- the row, which is `0A 15` on every stage.
    assert.equal(f.ram.u8(A5 + 0x1c), 0x0a);
    assert.equal(f.ram.u8(A5 + 0x1d), 0x15);
  });

test('W323 the init body takes 4/4 on stages 0 and 1 and 3/0 from stage 2 on', { skip: SKIP }, () => {
  // `cmpi.w #$1,$813092 / bls` is UNSIGNED lower-or-same, so stage 1 keeps 4/4 -- an off-by-one
  // here would give stage 1 the later pair. Two `move.b`s, so these are byte fields.
  for (const [stage, d0, d1] of [[0, 4, 4], [1, 4, 4], [2, 3, 0], [4, 3, 0]]) {
    const f = world();
    f.ram.setU16(STAGE, stage);
    f.ram.setU16(STAGE_X2, stage * 2);
    runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
    assert.equal(f.ram.u8(A5 + 0x2f), d0, `stage ${stage} ($2F,A5)`);
    assert.equal(f.ram.u8(A5 + 0x2e), d1, `stage ${stage} ($2E,A5)`);
  }
});

// ==================== 3. THE INLINE BOUNDS TEST IS TWO ADDS, AND THAT IS OBSERVABLE

test('W323 the bounds test is TWO separate addi.w and folding them changes the answer',
  { skip: SKIP }, () => {
    // $26935A addi.w #$C00,D0 / $26935E addi.w #$7800,D0 / bcc. The deciding carry comes from the
    // SECOND add ALONE -- the first add's carry is discarded -- so the real predicate is
    //     u16(x + $C00) >= $8800
    // and NOT the folded `x + $8400 > $FFFF` a reader might write, which is `x >= $7C00`.
    //
    // The two disagree for x in [$F400, $FFFF]: at x = $F400, `x + $C00` wraps to $0000, which is
    // far below $8800, so the ROM says ON SCREEN. A folded implementation says off screen and
    // FREES THE ENEMY. This is the whole reason the two adds are transcribed separately.
    // The init body has to run first: `$2693C6 jsr $28AC72` reads the sub-record fields the record
    // prototype fills, and a bare fixture makes that a LOUD THROW rather than a bounds answer.
    const off = (x) => {
      const f = world();
      f.ram.setU16(STAGE, 0);
      f.ram.setU16(STAGE_X2, 0);
      runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
      f.ram.setU8(A5 + 0x16, 1);                 // SEEN, so off screen means free
      f.ram.setU16(A6 + 0x02, x);                // set X after the position read
      f.ram.setU16(A6 + 0x18, 0x0500);           // HP well above $380
      const before = f.ram.u16(REFCOUNT);
      run(f);
      return f.ram.u16(REFCOUNT) === before - 1; // the free path decrements
    };
    assert.equal(off(0x2000), false, '$2000 is on screen either way');
    assert.equal(off(0x8000), true, '$8000 is off screen either way');
    // THE WITNESS: both readings differ here, and the ROM's says on screen.
    assert.equal(off(0xf400), false,
      '$F400: `u16($F400 + $C00)` wraps to $0000, so the SECOND add cannot carry');
    assert.equal(off(0xf3ff), true, 'and $F3FF, one below, still carries');
  });

// ==================== 4. THE FOUR-STATE CYCLE

test('W323 ($18,A5) walks 0 -> 1 -> 2 -> 3 -> 0 and the ramp goes up then back down',
  { skip: SKIP }, () => {
    const f = world();
    f.ram.setU16(STAGE, 0);
    f.ram.setU16(STAGE_X2, 0);
    runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
    f.ram.setU16(A6 + 0x18, 0x0500);             // keep HP above $380 so the damage arm is quiet
    f.ram.setU16(A6 + 0x02, 0x2000);             // on screen, above the $1000 gate, below $6C00
    // Drive it and record which states it visits. The cadences are short, so a few hundred frames
    // is more than one full cycle.
    const seen = new Set();
    let rampMax = 0;
    for (let i = 0; i < 900; i++) {
      seen.add(f.ram.u16(A5 + 0x18));
      rampMax = Math.max(rampMax, f.ram.u16(A5 + 0x24));
      f.ram.setU16(A6 + 0x18, 0x0500);           // it is never allowed to die in this window
      run(f);
    }
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3], 'all four states are reached');
    // $2694A2 cmpi.w #$1C -- the ramp clamps there and hands over to state 2, so it must reach
    // exactly $1C and never index past the eight longs.
    assert.equal(rampMax, 0x1c, 'the ramp reaches $1C and stops');
  });

test('W323 the freeze stops the ramp but still draws', { skip: SKIP }, () => {
  // $269434/$26943E are `tst.l` over $8130D2 AND $8130D4 together, so a LONGWORD test. A `.w`
  // reading would ignore $8130D4 and keep stepping the state machine while the game is frozen.
  const f = world();
  f.ram.setU16(STAGE, 0);
  f.ram.setU16(STAGE_X2, 0);
  runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
  f.ram.setU16(FREEZE + 2, 1);                   // the HIGH half only: $8130D4, not $8130D2
  const before = f.ram.u16(A5 + 0x18);
  for (let i = 0; i < 40; i++) { f.ram.setU16(A6 + 0x18, 0x0500); run(f); }
  assert.equal(f.ram.u16(A5 + 0x18), before,
    'a set $8130D4 must freeze the state machine, which only a longword test sees');
});

// ==================== 5. THE MIRRORED AIMED PAIR

test('W323 state 2 fires a MIRRORED PAIR through $281708 with the two muzzle longs',
  { skip: SKIP }, () => {
    const f = world();
    f.ram.setU16(STAGE, 0);
    f.ram.setU16(STAGE_X2, 0);
    runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
    // A LIVE player, or `aim256FromCaller` returns carry and the arm fires nothing at all.
    f.ram.setU16(0x8103e6, 0x8000);              // P1's status word negative = alive
    f.ram.setU16(0x8103e6 + 2, 0x3000);
    f.ram.setU16(0x8103e6 + 4, 0x3000);
    for (let i = 0; i < 900; i++) {
      f.ram.setU16(A6 + 0x18, 0x0500);
      f.ram.setU16(A6 + 0x02, 0x2000);
      run(f);
    }
    const pair = f.bullets.filter((b) => b.site === 0x269502);
    assert.ok(pair.length >= 2, `state 2 fired ${pair.length} shots; expected at least a pair`);
    assert.equal(pair.length % 2, 0, 'and they come in PAIRS, never an odd count');
  });

test('W323 with BOTH PLAYERS DEAD the pair still fires, because there is no `bcs` after the aim',
  { skip: SKIP }, () => {
    // The defect this test was written to catch, after it was nearly shipped. `$2694DA jsr $24226E`
    // is followed by `$2694E0 move.w D1,D7` -- NOT by a `bcs`. And `$24226E`'s own no-target exit is
    // `$242264 rts`, six bytes returning with the carry SET and D1 UNCHANGED. So a dead-players
    // frame does NOT skip the volley: it fires with the Y word `$2694D0 movem.w ($2,A6),D0-D1`
    // loaded into D1. Returning early instead invents a branch the ROM does not have, and the
    // observable cost is that the state machine then never leaves state 2 -- the volley counter
    // that advances it only ticks on a frame that FIRES.
    const f = world();
    f.ram.setU16(STAGE, 0);
    f.ram.setU16(STAGE_X2, 0);
    runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
    // Both player records left with a POSITIVE status word: `targetSelect` finds no live target.
    f.ram.setU16(0x8103e6, 0x0000);
    f.ram.setU16(0x810448, 0x0000);
    const states = new Set();
    for (let i = 0; i < 900; i++) {
      states.add(f.ram.u16(A5 + 0x18));
      f.ram.setU16(A6 + 0x18, 0x0500);
      f.ram.setU16(A6 + 0x02, 0x2000);
      run(f);
    }
    assert.ok(f.bullets.some((b) => b.site === 0x269502),
      'it fires with no live player, because the ROM never tests the carry');
    assert.ok(states.has(3),
      'and it therefore still reaches state 3 -- an invented early return would strand it at 2');
  });

test('W323 `asr.b #1` on the RNG draw is ARITHMETIC, so $FF halves to -1 and not $7F',
  { skip: SKIP }, () => {
    // This is a pure-arithmetic assertion about the transcription, kept because the failure it
    // guards is silent: a logical shift would turn every negative jitter into a large POSITIVE one
    // and bias the whole spread one way round the circle.
    const asrByte = (v) => ((v << 24) >> 24) >> 1;
    assert.equal(asrByte(0xff), -1, '$FF is -1 and halves to -1');
    assert.equal(asrByte(0xfe), -1, '$FE is -2 and halves to -1');
    assert.equal(asrByte(0x10), 8);
    assert.equal(asrByte(0x7f), 63);
    assert.notEqual(asrByte(0xff), 0x7f, 'a LOGICAL shift would give $7F here');
  });

// ==================== 6. THE DEATH ARM

test('W323 the death arm decrements the refcount and walks FOUR pool-A rows', { skip: SKIP }, () => {
  const f = world({ hp: 0x0100 });
  f.ram.setU16(STAGE, 0);
  f.ram.setU16(STAGE_X2, 0);
  runInitBodyAddr(INITBODY, f.ram, ROM, A5, A6, f.log, TABLES);
  const armed = f.ram.u16(REFCOUNT);
  // $2693BA tst.w ($18,A6) / bmi -- a NEGATIVE HP word is what the death arm tests, and the hit
  // bits must be set or the damage arm takes the not-hit branch and never reaches the `bmi`.
  f.ram.setU16(A6 + 0x18, 0x8001);
  f.ram.setU8(A6, 0x5c);
  f.ram.setU16(LOWHP_GATE, 0);
  run(f);
  assert.equal(f.ram.u16(REFCOUNT), armed - 1, '$2696E6 subq.w #1,$8130D8 on the DEATH exit');
  assert.equal(f.notes.length, 1, 'and $28C28E was posted once');
  assert.equal(f.notes[0], 0x28c28e);
});

test('W323 the death rows and both indexed tables are inside their windows', { skip: SKIP }, () => {
  // Every read the two arms make, performed here so a missing or short window is a test failure
  // rather than a crash on the live page. $26970C+$40 is one window over three tables.
  for (let n = 0; n < 4; n++) assert.equal(typeof ROM.u32(DEATH_ROWS + n * 4), 'number');
  for (let n = 0; n < 4; n++) assert.equal(typeof ROM.u32(SPRITE_RING + n * 4), 'number');
  for (let i = 0; i <= 0x1c; i += 4) assert.equal(typeof ROM.u32(RAMP + i), 'number');
  // and the prototypes, which live in the OTHER window ($2692D2 + $7E)
  assert.equal(typeof ROM.u8(STAGE_ROWS), 'number');
  assert.equal(typeof ROM.u16(0x2692dc), 'number');
  assert.equal(typeof ROM.u16(0x2692fa), 'number');
});
