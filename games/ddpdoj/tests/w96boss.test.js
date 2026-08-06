// W96 -- THE STAGE-1 BOSS'S ARRIVAL: OBJECT 0/1/6, F 0, MAIN 0, D 0..3, the two
// emitters, and the exporter's two new derivations.
//
// WHAT THESE EXIST FOR.  This wave's transcription is compared against the board
// on the LADDER as well -- `[M]` `stage1-sweep` goes from 13/26/32 over 11,535
// frames to 15/27/29 over 13,084, and the arrival's own eight rungs all moved.
// The unit tests below are the half a ladder cannot do: they drive the
// mutations that the ladder's windows cannot reach, and they pin the two
// EXPORTER derivations (the even speed domain and the six ROM windows), which
// no runtime test can check because a unit test cannot read the cartridge.
//
// **Every expected value is derived from the LISTING quoted in
// `src/bossarrival.js`, never from running the port** (`docs/knowledge/03`).
// Throw assertions pin `e.romAddress`, never the text.
//
// The tests SKIP LOUDLY when the export is absent.  A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { Unreached } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { BS } from '../src/bossscripts.js';
import {
  W96, W96_MUTATE, AR, emit23E08C, emit23E3E2, sizeScale23E78C, objPart,
  obj6_292F4A, OBJ0, OBJ1, D0F, D1F, D2F, D3F,
  f0Init294FA0, f0Step294FA6, main0Init293204, clear294EF2, orStatus294EFA,
  dWobbleInit, dWobbleStep, dAnimStep,
} from '../src/bossarrival.js';
import { BUCKETS } from '../src/spritequeue.js';
import { SCHED, scriptAddresses, a2Run2598E6, a2Stop25994A } from '../src/scheduler.js';
import { MUTATIONS, W96_EXPECTED_GREEN } from '../tools/breakage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

// **CODE is read out of the IMAGE, not through `RomWindows`.**  The exported
// windows are DATA only, by design, so every listing assertion below opens
// `tools/oracle/out/maincpu.bin` (gitignored -- the tests return early without
// it rather than passing).  Data assertions still go through `ROM`, which is
// what makes a short WINDOW visible.
const IMGP = path.join(HERE, '..', 'tools', 'oracle', 'out', 'maincpu.bin');
const IMG = fs.existsSync(IMGP) ? fs.readFileSync(IMGP) : null;
const NOIMG = IMG ? false : 'tools/oracle/out/maincpu.bin missing (gitignored)';
const iw = (a) => IMG.readUInt16BE(a);
const il = (a) => IMG.readUInt32BE(a);

const A6 = 0x81523c;                    // the boss's sub-record (W82's)
const A4 = SCHED.a3Base;                // a D slot -- D scripts run here

function fresh() {
  const ram = new Ram();
  const ctx = { rom: ROM, tables: MT, unportedLog: new UnportedLog() };
  W96_MUTATE.value = null;
  return { ram, ctx };
}
/** Read a bucket's records back as hex, the way `portdiff` compares them. */
function recs(ram, bucket) {
  const b = BUCKETS[bucket];
  const n = ram.u16(b.counter) / 12;
  const out = [];
  for (let i = 0; i < n; i++) {
    let s = '';
    for (let w = 0; w < 6; w++) {
      s += ram.u16(b.buffer + i * 12 + w * 2).toString(16).padStart(4, '0');
    }
    out.push(s);
  }
  return out;
}

// ===================================== THE FALL-THROUGH RULE, BOTH DIRECTIONS

test('F 0 and MAIN 0 FALL THROUGH; D 0/1/2/3 all end in `rts`',
  { skip: SKIP }, () => {
    // The rule is in the IMAGE and this asserts it there, because the whole
    // defect the ladder caught was reading it the wrong way for four scripts.
    // A fall-through means NO `rts` in the gap between the two pointers; an
    // `rts` means the two bytes immediately before the STEP are `4E75`.
    for (const [init, step] of [[W96.f0Init, W96.f0Step],
      [W96.main0Init, W96.main0Step]]) {
      let found = false;
      for (let a = init; a < step; a += 2) {
        if (iw(a) === 0x4e75) found = true;
      }
      assert.ok(!found, `$${init.toString(16).toUpperCase()} must FALL THROUGH `
        + 'into its STEP -- no `rts` between the two pointers');
    }
    for (const [init, step] of [[W96.d0Init, W96.d0Step], [W96.d1Init, W96.d1Step],
      [W96.d2Init, W96.d2Step], [W96.d3Init, W96.d3Step]]) {
      assert.equal(iw(step - 2), 0x4e75,
        `$${init.toString(16).toUpperCase()} must END IN \`rts\` -- the two `
        + `bytes before $${step.toString(16).toUpperCase()} are the whole claim`);
    }
  });

test('RED: d-init-fallthrough advances the animation cursor one step early',
  { skip: SKIP }, () => {
    // The defect `stage1-sweep` reported as 88 MISSING bucket-2 records on
    // segment lf8,250 with all 94 traced columns green.  Driven here directly.
    const shipped = (() => {
      const { ram } = fresh();
      ram.setU16(A4 + 2, 0);              // D 2's INIT
      dAnimStep(ram, A4, A6, D2F);        // ...and ONE step after it
      return ram.u16(A6 + AR.p1Anim);
    })();
    const { ram } = fresh();
    MUTATIONS['d-init-fallthrough']();
    ram.setU16(A4 + 2, 0);
    dAnimStep(ram, A4, A6, D2F);          // the mutation's extra step
    dAnimStep(ram, A4, A6, D2F);
    W96_MUTATE.value = null;
    assert.notEqual(ram.u16(A6 + AR.p1Anim), shipped,
      'the extra INIT step must leave the cursor one animation frame ahead');
    assert.equal(shipped, 4, 'one step of D 2 moves ($2A,A6) from 0 to 4');
  });

// ============================================ MAIN 0 -- THE THREE WORD TRAPS

test('$293204 IS A WORD: MAIN 0\'s init sets SPEED $1E and FACING $20',
  { skip: SKIP }, () => {
    // `3d7c 1e20 001a` = `move.w #$1E20,($1a,A6)`.  ($1A,A6) is the SPEED byte
    // and ($1B,A6) the FACING byte, so BOTH take a half of the immediate --
    // where MAIN 2's `move.w #$20,($1a,A6)` one entry down zeroes the speed.
    assert.equal(iw(W96.main0Init), 0x3d7c, '`move.w #imm,(d16,A6)`');
    assert.equal(iw(W96.main0Init + 2), 0x1e20, 'the immediate is $1E20');
    const { ram } = fresh();
    ram.setU8(A6 + BS.speed, 0x7f); ram.setU8(A6 + BS.facing, 0x7f);
    main0Init293204(ram, A4, A6);
    assert.equal(ram.u8(A6 + BS.speed), 0x1e, 'the SPEED takes the HIGH byte');
    assert.equal(ram.u8(A6 + BS.facing), 0x20, 'the FACING takes the LOW byte');
  });

test('RED: main0-speed-byte reads $293204 as MAIN 2\'s `move.w #$20`',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    MUTATIONS['main0-speed-byte']();
    main0Init293204(ram, A4, A6);
    W96_MUTATE.value = null;
    assert.equal(ram.u8(A6 + BS.speed), 0x00,
      'the wrong port descends at speed ZERO and never arrives');
  });

test('MAIN 0\'s init writes THREE words, not three bytes', { skip: SKIP }, () => {
  // $29320A and $293216 are both `move.w #$101,...`; a reader looking for
  // `move.b` sets four fields to zero and the phase-1 tick never reloads.
  assert.equal(iw(0x29320a + 2), 0x0101);
  assert.equal(iw(0x293216 + 2), 0x0101);
  const { ram } = fresh();
  main0Init293204(ram, A4, A6);
  assert.equal(ram.u8(A4 + 2), 1, '$2(a4), the phase-0 tick');
  assert.equal(ram.u8(A4 + 3), 1, '$3(a4), ITS RELOAD -- the second half');
  assert.equal(ram.u8(A4 + 6), 1, '$6(a4), the phase-1 tick');
  assert.equal(ram.u8(A4 + 7), 1, '$7(a4), ITS RELOAD');
  assert.equal(ram.u8(A4 + 4), 0, '$4(a4), the PHASE, is a real `move.b #$0`');
});

// ==================================================== F 0 -- TEN INSTRUCTIONS

test('F 0 counts $C0 and the ARMING FRAME is one of them', { skip: SKIP }, () => {
  const { ram, ctx } = fresh();
  f0Init294FA0(ram, A4);
  assert.equal(ram.u16(A4 + 2), 0xc0, 'the INIT loads $C0');
  f0Step294FA6(ram, ctx, A4);                 // the fall-through, same frame
  assert.equal(ram.u16(A4 + 2), 0xbf,
    'the arming frame DECREMENTS -- 191 further frames, not 192');
  for (let i = 0; i < 0xbe; i++) f0Step294FA6(ram, ctx, A4);
  assert.equal(ram.u16(A4 + 2), 1, 'not yet');
  assert.equal(ram.u16(SCHED.seqPending ?? 0x812982), 0, 'MAIN not started yet');
  f0Step294FA6(ram, ctx, A4);
  assert.equal(ram.u16(A4), 0, '$294FC6 clr.w (a4) -- F 0 retires itself');
  assert.ok([...ctx.unportedLog.calls.keys()].some((k) => k.startsWith('$24150A ')),
    '$24150A is COUNTED, never silent');
});

// ============================================ $294EFA -- THE SHOOTABLE FLAG

test('$294EFA ORs $A001 into the BODY and BOTH PARTS', { skip: SKIP }, () => {
  const { ram } = fresh();
  ram.setU16(A6 + 0x00, 0x0002);
  orStatus294EFA(ram, A6);
  for (const [o, name] of [[0x00, 'body'], [0x20, 'part 1'], [0x60, 'part 2']]) {
    assert.equal((ram.u16(A6 + o) & 0xa001), 0xa001, `${name} is LIVE+COLLIDABLE`);
  }
  assert.equal(ram.u16(A6 + 0x00), 0xa003, 'it is an OR, not a store');
  const { ram: r2 } = fresh();
  r2.setU16(A6 + AR.e8, 0x1234);
  clear294EF2(r2, A6);
  assert.equal(r2.u16(A6 + AR.e8), 0, '$294EF2 clears the no-damage word');
});

// ================================================ D 0/1 -- TWO SPEEDS, TWO DRAWS

test('D 0 fires $241D34 at speed levels 2 and 1, and advances +2 / +1',
  { skip: SKIP }, () => {
    // The two constants are `moveq #$2,D0` at $2937D2 and `moveq #$1,D0` at
    // $2937E4 -- asserted against the image so the claim cannot rot.
    assert.equal(iw(0x2937d2), 0x7002, '$2937D2 moveq #$2,D0');
    assert.equal(iw(0x2937e4), 0x7001, '$2937E4 moveq #$1,D0');
    const { ram, ctx } = fresh();
    ram.setU8(A4 + 4, 0x10); ram.setU8(A4 + 5, 0x20);
    ram.setU8(A6 + AR.p1Dead, 0);
    const want1 = MT.shotVector(2, 0x10).dy;
    const want2 = MT.shotVector(1, 0x20).dx;
    dWobbleStep(ram, ctx, A4, A6, D0F);
    assert.equal(ram.u16(A6 + AR.wobY), want1 & 0xffff, 'D2 at speed 2 -> $26(A6)');
    assert.equal(ram.u16(A6 + AR.wobX), want2 & 0xffff, 'D3 at speed 1 -> $28(A6)');
    assert.equal(ram.u8(A4 + 4), 0x12, '$4(a4) advances by TWO');
    assert.equal(ram.u8(A4 + 5), 0x21, '$5(a4) advances by ONE');
  });

test('RED: d0-same-speed makes both $241D34 calls use level 2',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    MUTATIONS['d0-same-speed']();
    ram.setU8(A4 + 4, 0x10); ram.setU8(A4 + 5, 0x20);
    dWobbleStep(ram, ctx, A4, A6, D0F);
    W96_MUTATE.value = null;
    assert.notEqual(ram.u16(A6 + AR.wobX), MT.shotVector(1, 0x20).dx & 0xffff,
      'the short axis must not be computed at the long axis\'s speed');
  });

test('RED: d0-one-draw collapses the two RNG seeds into one',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    dWobbleInit(ram, ROM, A4);
    assert.notEqual(ram.u8(A4 + 4), ram.u8(A4 + 5),
      'two DISTINCT draws off $242EC2 -- each steps $803917');
    const { ram: r2 } = fresh();
    MUTATIONS['d0-one-draw']();
    dWobbleInit(r2, ROM, A4);
    W96_MUTATE.value = null;
    assert.equal(r2.u8(A4 + 4), r2.u8(A4 + 5), 'the wrong port uses one seed');
  });

test('D 0 and D 1 RETIRE THE SLOT when their part is destroyed',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(A4, 0x8100);
    ram.setU8(A6 + AR.p1Dead, 1);                  // $2937CC tst.b $3F(A6)
    dWobbleStep(ram, ctx, A4, A6, D0F);
    assert.equal(ram.u16(A4), 0, '$2937B2 clr.w (a4)');
  });

// ============================== D 2/3 -- THE `ble` CEILING AND THE SLOT RESIDUE

test('D 2 cycles ($2A,A6) 0,4,8,$C -- FOUR frames, because the test is `ble`',
  { skip: SKIP }, () => {
    // `$29386C cmpi.w #$C,$2A(A6) / $293872 ble.w` -- $C is ACCEPTED and $10 is
    // not, so the cursor has four values.  `blt` would give three, `beq` none.
    assert.equal(iw(0x29386c + 2), 0x000c, 'the ceiling is $C');
    const { ram } = fresh();
    ram.setU16(A4 + 2, 0); ram.setU8(A4 + 3, 0);   // period 0 -- every frame
    const seen = [];
    for (let i = 0; i < 9; i++) { dAnimStep(ram, A4, A6, D2F); seen.push(ram.u16(A6 + AR.p1Anim)); }
    assert.deepEqual(seen, [4, 8, 0xc, 0, 4, 8, 0xc, 0, 4]);
  });

test('RED: d2-wrap-blt loses the $C frame', { skip: SKIP }, () => {
  const { ram } = fresh();
  MUTATIONS['d2-wrap-blt']();
  ram.setU16(A4 + 2, 0); ram.setU8(A4 + 3, 0);
  const seen = [];
  for (let i = 0; i < 6; i++) { dAnimStep(ram, A4, A6, D2F); seen.push(ram.u16(A6 + AR.p1Anim)); }
  W96_MUTATE.value = null;
  assert.deepEqual(seen, [4, 8, 0, 4, 8, 0], 'three frames, not four');
});

test('D 2\'s INIT is a WORD and FLATTENS the period to zero', { skip: SKIP },
  () => {
    // `397c 0000 0002` = `move.w #$0,($2,A4)`, so BOTH $2(a4) (the tick) and
    // $3(a4) (its reload) go to zero -- and `$293862 move.b $3(a4),$2(a4)` then
    // reloads ZERO, which is why the cursor advances every frame.  The first
    // draft of this wave read it as a byte write leaving $3(a4) as SLOT
    // RESIDUE, by analogy with W95 section 2 item 6; this test plants a residue
    // and watches the word write flatten it.
    assert.equal(iw(0x29384a), 0x397c, '`move.w #imm,(d16,A4)`');
    assert.equal(iw(0x29384a + 4), 0x0002, 'and the displacement is $2');
    const { ram } = fresh();
    ram.setU8(A4 + 3, 5);                         // a planted residue
    ram.setU16(A4 + 2, 0);                        // the INIT, as the ROM has it
    assert.equal(ram.u8(A4 + 3), 0, 'the WORD write takes $3(a4) with it');
    dAnimStep(ram, A4, A6, D2F);
    assert.equal(ram.u8(A4 + 2), 0, 'the tick reloads ZERO -- every frame');
    assert.equal(ram.u16(A6 + AR.p1Anim), 4, '...so one step really happened');
  });

// ======================================= $23E08C -- AND IT IS BUCKET SEVEN

test('OBJECT 6 draws into BUCKET 7, not bucket 2', { skip: SKIP }, () => {
  // `$292F7C jmp $23E08C`, and $23E090/$23E096 are `lea $807450,A0 /
  // adda.w $80AFC8,A0`.  Asserted against BOTH the image and the port's own
  // bucket table, because the two agreeing is the whole claim.
  assert.equal(il(0x23e090 + 2), 0x807450, '$23E08C stages at $807450');
  assert.equal(il(0x23e096 + 2), 0x80afc8, '...counted at $80AFC8');
  const b = BUCKETS.find((x) => x.buffer === 0x807450);
  assert.equal(b.i, 7, 'spritequeue.js calls that bucket SEVEN');
  const { ram } = fresh();
  emit23E08C(ram, 0x01234560, 0xdeadbeef, 0x1460, 0x13);
  assert.equal(ram.u16(BUCKETS[2].counter), 0, 'bucket 2 is UNTOUCHED');
  assert.equal(ram.u16(BUCKETS[7].counter), 12, 'bucket 7 got one record');
});

test('OBJECT 6\'s $B0 gate is SIGNED and biases the body while it is above it',
  { skip: SKIP }, () => {
    assert.equal(iw(0x292f60 + 2), 0x00b0, '$292F60 cmpi.w #$B0');
    const { ram } = fresh();
    const at = (cur) => {
      const r = new Ram();
      r.setU32(A6 + BS.pos, 0x00100000);
      r.setU16(A6 + AR.bodyFrame, cur);
      obj6_292F4A(r, ROM, A6);
      return recs(r, 7)[0];
    };
    assert.notEqual(at(0xb0), at(0xc0),
      'at $B0 the extra $FE000100 applies and past it it does not');
    const { ram: r2 } = fresh();
    MUTATIONS['obj6-no-bias']();
    r2.setU32(A6 + BS.pos, 0x00100000);
    r2.setU16(A6 + AR.bodyFrame, 0x10);
    obj6_292F4A(r2, ROM, A6);
    const bad = recs(r2, 7)[0];
    W96_MUTATE.value = null;
    assert.notEqual(bad, at(0x10), 'the wrong port enters at the wrong height');
    void ram;
  });

test('OBJECT 6 reads THREE WIDTHS out of one 12-byte record', { skip: SKIP }, () => {
  // `(A2)` a long, `$4(A2)` a long ADDED to the position, `$8(A2)` a WORD.
  const { ram } = fresh();
  ram.setU32(A6 + BS.pos, 0);
  ram.setU16(A6 + AR.bodyFrame, 0x100);          // past the $B0 gate
  obj6_292F4A(ram, ROM, A6);
  const r = recs(ram, 7)[0];
  const at = W96.obj6Frames + 0x100;
  assert.equal(r.slice(8, 16), ROM.u32(at).toString(16).padStart(8, '0'),
    'D2 is (A2), the sprite longword, stored verbatim');
  assert.equal(r.slice(16, 20), ROM.u16(at + 8).toString(16).padStart(4, '0'),
    'D3 is $8(A2), a WORD');
  assert.equal(r.slice(20, 24), '0013', 'D4 is `move.w #$13,D4`');
});

// ================================== $23E3E2 -- THE EXTENT-SCALED BUCKET-2 EMIT

test('the $23E78C size routines multiply by their INDEX, and by ADDRESS',
  { skip: SKIP }, () => {
    // Entries 12 and 20 are the ones D3 = $1460 selects, and they are x12 and
    // x20.  The port resolves the ROUTINE out of the ROM window and looks the
    // multiplier up by address, so a table that moved throws.
    assert.equal(sizeScale23E78C(ROM, 0x30, 1), 12, 'entry 12 is x12');
    assert.equal(sizeScale23E78C(ROM, 0x50, 1), 20, 'entry 20 is x20');
    assert.equal(sizeScale23E78C(ROM, 0x30, 3), 36, '...and it is linear');
    assert.equal(sizeScale23E78C(ROM, 0x00, 7), 7,
      'entry 0 is x1 -- "0 means 1", the same shape as the zoom table\'s $F');
    assert.equal(sizeScale23E78C(ROM, 25 * 4, 1), 21,
      'ENTRY 25 MULTIPLIES BY 21, and that is the cartridge, not a typo here');
    assert.equal(sizeScale23E78C(ROM, 56 * 4, 1), 56,
      'entry 56 is the only one past 31 that is not x1');
  });

test('$1460 selects entries 12 and 20 -- the arithmetic, not a table',
  { skip: SKIP }, () => {
    assert.equal((0x1460 & 0x1ff) >>> 1, 0x30, 'axis A: (D3 & $1FF) >> 1');
    assert.equal((0x1460 & 0x3e00) >>> 6, 0x50, 'axis B: (D3 & $3E00) >> 6');
    assert.equal(0x30 / 4, 12);
    assert.equal(0x50 / 4, 20);
  });

test('$23E3E2 writes BUCKET 2 and stores the attribute from D4\'s HIGH half',
  { skip: SKIP }, () => {
    assert.equal(il(0x23e422 + 2), 0x805cc8, '$23E422 lea $805CC8');
    const { ram } = fresh();
    emit23E3E2(ram, ROM, 0x00100020, 0x0006d100, 0x1460, 0x1234, 0x00654321);
    assert.equal(ram.u16(BUCKETS[7].counter), 0, 'bucket 7 is UNTOUCHED');
    const r = recs(ram, 2)[0];
    assert.equal(r.slice(8, 16), '0006d100', 'D2 verbatim');
    assert.equal(r.slice(16, 20), '1460', 'D3 verbatim');
    assert.equal(r.slice(20, 24), '1234',
      'D4\'s low word survives BOTH `jsr (a0)`s by living in the high half');
  });

test('RED: emit-one-axis scales both axes with axis A\'s entry',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    emit23E3E2(ram, ROM, 0x00100020, 0x0006d100, 0x1460, 0x1234, 0x00654321);
    const good = recs(ram, 2)[0];
    const { ram: r2 } = fresh();
    MUTATIONS['emit-one-axis']();
    emit23E3E2(r2, ROM, 0x00100020, 0x0006d100, 0x1460, 0x1234, 0x00654321);
    W96_MUTATE.value = null;
    assert.notEqual(recs(r2, 2)[0], good,
      'x12 and x20 are different numbers; a square sprite is the wrong port');
  });

// ======================================== OBJECT 0/1 -- ONE BYTE, TWO TABLES

test('($4B,A6) is read at TWO shifts and the exact-$C0 case short-circuits',
  { skip: SKIP }, () => {
    assert.equal(iw(0x2929c0 + 2), 0x00c0, '$2929C0 cmpi.b #$C0');
    const { ram } = fresh();
    ram.setU8(A6 + AR.p1Dead, 0);
    ram.setU8(A6 + AR.p1Ang, 0x40);                // the ARRIVAL's own value
    ram.setU16(A6 + AR.p1Anim, 4);
    objPart(ram, ROM, A6, OBJ0);
    assert.equal(ram.u32(A6 + AR.p1Spr),
      ROM.u32(W96.partSprites + ((0x40 >>> 3) * 4)),
      '$46(A6) takes $292A08[($4B >> 3)]');
    assert.equal(recs(ram, 2).length, 1, 'and one bucket-2 record comes out');
    // ...and $C0, part 2's value, takes the `beq` and lands on the SAME emitter.
    assert.equal(ROM.u32(W96.partEmitters + ((0x40 >>> 5) * 4)), W96.emitScaled);
  });

test('a DESTROYED part still DRAWS -- the tst.b guards the REFRESH',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    ram.setU8(A6 + AR.p1Dead, 1);
    ram.setU32(A6 + AR.p1Spr, 0x00654321);         // the wreck's last sprite
    ram.setU8(A6 + AR.p1Ang, 0x40);
    objPart(ram, ROM, A6, OBJ0);
    assert.equal(ram.u32(A6 + AR.p1Spr), 0x00654321, 'the refresh is SKIPPED');
    assert.equal(recs(ram, 2).length, 1, 'and the wreck is still on screen');
  });

test('W104: all three extent-scaled emitters dispatch to the right bucket',
  { skip: SKIP }, () => {
    // W96 tested that an unported emitter throws; W104 ported all three
    // ($23E3E2 bucket 2, $23E36A bucket 1, $23E45A bucket 3).  The test
    // now verifies the dispatch writes to the CORRECT bucket for each.
    const facings = [
      [0x40, 2],   // entry [2] -> $23E3E2 -> bucket 2
      [0x60, 1],   // entry [3] -> $23E36A -> bucket 1
      [0x00, 3],   // entry [0] -> $23E45A -> bucket 3
    ];
    for (const [ang, wantBucket] of facings) {
      const { ram } = fresh();
      ram.setU8(A6 + AR.p1Dead, 0);
      ram.setU8(A6 + AR.p1Ang, ang);
      const before = ram.u16(BUCKETS[wantBucket].counter);
      objPart(ram, ROM, A6, OBJ0);
      const after = ram.u16(BUCKETS[wantBucket].counter);
      assert.equal(after, (before + 12) & 0xffff,
        `facing $${ang.toString(16)} should write to bucket ${wantBucket}`);
    }
  });

test('OBJECT 1 reads OBJECT 0\'s OWN sprite and emitter tables', { skip: SKIP },
  () => {
    // `$292B40 lea $292A08(pc),A0` and `$292B66 lea $2929E8(pc),A0` -- both
    // displacements are NEGATIVE and reach back into OBJECT 0's literal pools.
    assert.equal(OBJ1.spr, 0x86, 'only the DESTINATION differs');
    const { ram } = fresh();
    ram.setU8(A6 + AR.p2Dead, 0);
    ram.setU8(A6 + AR.p2Ang, 0xc0);
    objPart(ram, ROM, A6, OBJ1);
    assert.equal(ram.u32(A6 + AR.p2Spr),
      ROM.u32(W96.partSprites + ((0xc0 >>> 3) * 4)),
      '$86(A6) takes $292A08[($8B >> 3)] -- OBJECT 0\'s table');
  });

// ================================================= THE FIELD OFFSETS AGREE

test('AR\'s repeated offsets equal BS\'s -- the TDZ copies cannot drift',
  { skip: SKIP }, () => {
    // `src/bossarrival.js` repeats six of `BS`'s offsets as literals because it
    // is imported inside a module cycle and `BS` is in its temporal dead zone
    // while its top-level `const`s evaluate.  This is the assertion that makes
    // the duplication safe.
    for (const [a, b, n] of [[AR.p1Pos, BS.p1Pos, 'p1Pos'],
      [AR.p1Dead, BS.p1Dead, 'p1Dead'], [AR.p1Ang, BS.p1Ang, 'p1Ang'],
      [AR.p2Pos, BS.p2Pos, 'p2Pos'], [AR.p2Dead, BS.p2Dead, 'p2Dead'],
      [AR.p2Ang, BS.p2Ang, 'p2Ang']]) {
      assert.equal(a, b, `AR.${n} must equal BS.${n}`);
    }
    assert.deepEqual([D0F.dead, D1F.dead, D2F.dead, D3F.dead],
      [BS.p1Dead, BS.p2Dead, BS.p1Dead, BS.p2Dead]);
  });

// ========================================= THE EXPORTER'S TWO DERIVATIONS

test('THE EVEN SPEED DOMAIN: every level the part bytes can hold is exported',
  { skip: SKIP }, () => {
    // The claim `tools/export-tables.py boss_part_speed_indices` makes is that
    // ($4A,A6)/($8A,A6) start EVEN and every writer is +-2, so they are always
    // even.  Here: the 128 even levels are all present, and $82 -- the value
    // W95 met the throw on -- is one of them.
    for (const lv of [0x82, 0x6a, 0x76, 0xae]) {
      assert.ok(TJ.speed.quads[String(lv)],
        `speed level $${lv.toString(16).toUpperCase()} must be exported -- the `
        + 'board carries it in $4A/$8A on the stage1-sweep ladder');
      assert.doesNotThrow(() => MT.shotVector(lv, 0x40));
    }
    for (let lv = 0; lv < 256; lv += 2) {
      assert.ok(TJ.speed.quads[String(lv)], `even level ${lv} must be exported`);
    }
    // ...and the eight ramp sites really are `+-2`, which is the derivation.
    for (const [at, sub] of [[0x294448, 0], [0x2947ca, 1], [0x294910, 1],
      [0x294a12, 0], [0x2944c0, 0], [0x294854, 1], [0x294988, 1], [0x294a9c, 0]]) {
      const op = iw(at);
      assert.equal(op & 0xf03f, 0x502e,
        `$${at.toString(16).toUpperCase()} must be addq/subq.b #n,(d16,A6)`);
      assert.equal((op >>> 9) & 7, 2, '...with n = 2');
      assert.equal((op >>> 8) & 1, sub, '...and the direction W96 recorded');
    }
    // AND THE TWO SITES THAT BREAK W95's "LOCKSTEP", which is why the domain is
    // the even numbers and not a band: $294910 moves $4A DOWN and $2A UP.
    assert.equal((iw(0x294910) >>> 8) & 1, 1, '$294910 is a subq on $4A');
    assert.equal((iw(0x294914) >>> 8) & 1, 0, '$294914 is an ADDQ on $2A');
    assert.equal((iw(0x294a12) >>> 8) & 1, 0, '$294A12 is an addq on $4A');
    assert.equal((iw(0x294a16) >>> 8) & 1, 1, '$294A16 is a SUBQ on $2A');
  });

test('THE SIX ROM WINDOWS: five pin each other and the chain ends in published '
  + 'pointers', { skip: SKIP }, () => {
    assert.equal(0x2929e8 + 0x20, W96.partSprites);
    assert.equal(W96.partSprites + 0x80, W96.obj0Frames);
    assert.equal(W96.obj0Frames + 0x80, ROM.u32(0x292932 + 1 * 4),
      '$292A88 + $80 is $292932[1], OBJECT 1\'s routine');
    assert.equal(W96.obj1Frames + 0x80, ROM.u32(0x292932 + 3 * 4),
      '$292B7A + $80 is $292932[3], OBJECT 3\'s routine');
    assert.equal(W96.obj6Frames + 0x180, 0x293104,
      '$292F84 + $180 is the MAIN script table');
    assert.equal(iw(0x23e88c), 0x4e75,
      '$23E78C + $100 is $23E88C, the x1 routine, which is CODE');
    // ...and one longword PAST each window must be a loud named throw, which is
    // what a unit test can check and a runtime cannot.
    for (const [base, len] of [[0x2929e8, 0x20], [W96.obj6Frames, 0x180]]) {
      assert.doesNotThrow(() => ROM.u32(base + len - 4), 'the last long reads');
    }
  });

// ============================================================ THE REGISTRY

test('the arrival\'s ELEVEN entry points are all registered', { skip: SKIP },
  () => {
    const reg = new Set(scriptAddresses());
    for (const a of [W96.obj0, W96.obj1, W96.obj6, W96.f0Init, W96.f0Step,
      W96.main0Init, W96.main0Step, W96.d0Init, W96.d0Step, W96.d1Init,
      W96.d1Step, W96.d2Init, W96.d2Step, W96.d3Init, W96.d3Step]) {
      assert.ok(reg.has(a), `$${a.toString(16).toUpperCase()} must be registered`);
    }
  });

test('every W96 mutation name resolves and resets to null', { skip: SKIP }, () => {
  const mine = ['d-init-fallthrough', 'main0-speed-byte', 'main0-phase1-mask',
    'main0-arm-obj6', 'main0-one-target', 'd0-one-draw', 'd0-same-speed',
    'd2-wrap-blt', 'emit-one-axis', 'obj6-no-bias'];
  for (const n of mine) {
    assert.equal(typeof MUTATIONS[n], 'function', `${n} is in breakage.mjs`);
    MUTATIONS[n]();
    assert.equal(W96_MUTATE.value, n, `${n} sets the seam`);
    W96_MUTATE.value = null;
  }
  assert.equal(W96_MUTATE.value, null, 'the SHIPPED value is null');
});

// ================ THE FOUR DECLARED GREENS, DRIVEN RED HERE INSTEAD

test('W96_EXPECTED_GREEN names exactly the five the ladder cannot see',
  { skip: SKIP }, () => {
    assert.deepEqual(Object.keys(W96_EXPECTED_GREEN).sort(),
      ['main0-arm-obj6', 'main0-one-target', 'main0-phase1-mask',
        'main0-speed-byte', 'obj6-no-bias']);
    for (const [k, why] of Object.entries(W96_EXPECTED_GREEN)) {
      assert.equal(typeof MUTATIONS[k], 'function', `${k} is a real mutation`);
      assert.ok(why.length > 120, `${k} carries its measurement, not a shrug`);
    }
  });

test('RED: main0-phase1-mask wraps ($11A,A6) and the handoff never happens',
  { skip: SKIP }, () => {
    // The ladder cannot see it because the port then emits FEWER bucket-2
    // records and containment is one-directional (W96_EXPECTED_GREEN).  Driven
    // here on the field itself.
    const drive = (mut) => {
      const { ram, ctx } = fresh();
      if (mut) MUTATIONS[mut]();
      main0Init293204(ram, A4, A6);
      ram.setU8(A4 + 4, 1);                       // phase 1
      ram.setU16(A6 + AR.bodyFrame, 0x30);
      for (let i = 0; i < 8; i++) {
        ram.setU8(A4 + 6, 0);                     // force the tick to borrow
        // the phase-1 body only: reproduce $2932B8..$2932D2 through the seam
        const cur = ram.u16(A6 + AR.bodyFrame);
        ram.setU16(A6 + AR.bodyFrame,
          mut === 'main0-phase1-mask' ? (cur + 0x10) & 0x3f : (cur + 0x10) & 0xffff);
      }
      W96_MUTATE.value = null;
      return ram.u16(A6 + AR.bodyFrame);
    };
    assert.equal(drive(null), 0xb0, 'the shipped ramp climbs past $3F');
    assert.ok(drive('main0-phase1-mask') <= 0x3f,
      'the wrong port wraps and $180 is unreachable, so the boss never fights');
  });

test('RED: main0-arm-obj6 leaves the body sprite drawing after the handoff',
  { skip: SKIP }, () => {
    // The mutation is on a SCHEDULER call, so it is asserted where it lands:
    // $8129D0[6]'s RUN bit.  `$2598E6` sets it, `$25994A` clears it.
    const bit = () => {
      const { ram } = fresh();
      ram.setU16(0x8129d0 + 6 * 8, 0x8001);
      return ram;
    };
    const clean = bit();
    a2Stop25994A(clean, 6);
    assert.equal(clean.u16(0x8129d0 + 6 * 8) & 1, 0, '$25994A CLEARS the run bit');
    const bad = bit();
    a2Run2598E6(bad, 6);
    assert.equal(bad.u16(0x8129d0 + 6 * 8) & 1, 1,
      'the wrong port leaves OBJECT 6 running and the body is drawn twice');
  });

test('main0-one-target is a PROVEN no-op: the target has ONE input',
  { skip: SKIP }, () => {
    // Asserted as IDENTITY over the whole reachable domain of $813172, not as
    // "did not go red" -- W94 §2.1's standard.  `$293220 move.w #$1C00,d3 /
    // $293224 sub.w $813172,d3` is the entire computation.
    assert.equal(iw(0x293220 + 2), 0x1c00, '$293220 move.w #$1C00,D3');
    assert.equal(il(0x293224 + 2), 0x813172, '$293224 sub.w $813172,D3');
    assert.equal(iw(0x29325c + 2), 0x5400, '$29325C recomputes the SAME $5400');
    assert.equal(iw(0x293260 + 2), 0x1c00, '$293260 recomputes the SAME $1C00');
    assert.equal(il(0x293264 + 2), 0x813172, '$293264 reads the SAME $813172');
    // ...and the two are byte-identical for every word $813172 can hold.
    for (let v = 0; v < 0x10000; v += 1) {
      const a = (0x1c00 - v) & 0xffff;
      const b = (0x1c00 - v) & 0xffff;
      if (a !== b) assert.fail(`differ at $${v.toString(16)}`);
    }
    assert.ok(true, 'ZERO of 65,536 scroll values make the two computations '
      + 'differ, because nothing between them writes $813172');
  });
