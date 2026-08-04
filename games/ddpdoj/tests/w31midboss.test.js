// WAVE 31 -- the stage-1 MIDBOSS `$26B6FA` (src/midboss.js), the two RNG-family
// draws it uses, the scroll-speed push `$261100` that RELEASES the stage, the
// screen-clear arming `$243E7C`, and the fourth sprite-emitter stub shape.
//
// SHAPE OF THESE TESTS.  Every one drives a real routine against the REAL
// exported cartridge windows and asserts on a value THE ROM decides -- a bucket
// index read out of a stub's own operands, a sprite pointer read out of
// `$26BE90`/`$26BF42`/`$26BFE8`, a draw byte read out of `$24324E`/`$24301A`.
// None writes a constant and reads it back through the same constant;
// `docs/knowledge/03` names that shape and this project has shipped it twice.
//
// Every throw assertion pins `e.romAddress` (never the message text --
// `27-review.md` 1A).  Tests that need the cartridge SKIP LOUDLY when the
// export is absent, and a skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { runHandler } from '../src/handlers.js';
import { BUL, TYPEBIT } from '../src/bullets.js';
import { BULLET_DRIVER } from '../src/bulletdriver.js';
import { resolveEmitStub, BUCKETS, NAMED_BUCKETS } from '../src/spritequeue.js';
import { drawByte2431F4, drawSigned242FDE, RNG_2431F4, RNG_242FDE } from '../src/rng.js';
import { pushExternalSpeed, BGRAM } from '../src/background.js';
import { MIDBOSS, armScreenClear, initArms, rollSwing, stepArms } from '../src/midboss.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const REC = 0x81364c, SUB = 0x81459c;
const { R, S, A } = MIDBOSS;
const arm = (n) => SUB + MIDBOSS.armBase + n * MIDBOSS.armStride;

/** A live midboss: record, sub-record and eight arms, all zeroed, positioned
 *  on screen with positive HP.  Nothing here is a value the routines read back
 *  through the same constant they were written with. */
function fixture() {
  const ram = new Ram();
  for (let i = 0; i < 0x50; i++) ram.setU8(REC + i, 0);
  for (let i = 0; i < 0x240; i++) ram.setU8(SUB + i, 0);
  ram.setU16(REC, 0x800d);                 // live, type $0D
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(SUB + S.posX, 0x40002000);    // on screen, long axis >= $1000
  ram.setU16(SUB + S.hp, 0x0100);
  ram.setU8(REC + R.onScreen, 1);
  ram.setU16(0x813172, 0);                 // scroll
  ram.setU16(0x813092, 1);                 // stage 1
  ram.setU16(0x813096, 0);
  ram.setU16(0x8103e6, 0x8000); ram.setU16(0x8103e8, 0x7000); ram.setU16(0x8103ea, 0x7000);
  ram.setU16(0x810448, 0x0000);
  for (let n = 0; n < 8; n++) ram.setU16(arm(n) + A.flags, 0x8000);  // all dead
  return ram;
}
function ctxOf(ram) {
  const log = new UnportedLog();
  const spawns = [];
  return {
    ctx: { ram, rom: ROM, tables: MT, unported: log, unportedLog: log, notes: log,
      bulletSpawn: (site, res) => spawns.push([site, res]) },
    log, spawns,
  };
}
function liveBullets(ram) {
  const out = [];
  for (let s = 0; s < BUL.slots; s++) {
    const tw = ram.u16(BUL.pool + s * BUL.stride);
    if (tw & TYPEBIT.alive) out.push({ slot: s, kind: tw & 0x3f });
  }
  return out;
}
/** Every bucket-3 request the queue holds, as (d1word0, d1word1, d2, d3, d4). */
function bucket3(ram) {
  const b = BUCKETS[3];
  const n = ram.u16(b.counter) / 12;
  return Array.from({ length: n }, (_, i) => {
    const at = b.buffer + i * 12;
    return [ram.u16(at), ram.u16(at + 2), (ram.u16(at + 4) << 16 >>> 0) + ram.u16(at + 6),
      ram.u16(at + 8), ram.u16(at + 10)];
  });
}

// ===========================================================================
// $261100 -- THE SCROLL RELEASE.  The OWNER's "minibosses stop the scroll",
// from the writer's end.
// ===========================================================================
test('$261100 writes the three words $2612AA reads, and only those', () => {
  const ram = new Ram();
  pushExternalSpeed(ram, 0x0020, 0x0020);
  assert.equal(ram.u16(BGRAM.extSpeed), 1, '$261100 move.w #$1,$813180');
  assert.equal(ram.u16(BGRAM.extSpeedBg), 0x20, '$261108 move.w D0,$813182');
  assert.equal(ram.u16(BGRAM.extSpeedTx), 0x20, '$26110E move.w D1,$813184');
});

test('the midboss pushes speed $0020 on the frame ($17,A5) passes $30 -- and on NO other',
  { skip: SKIP }, () => {
  // $26B712 subq.b #1,($17,A5); the push is at $26B73A and its guard is
  // $26B722 cmpi.b #$30.  Drive the death countdown from $48 down to $2F and
  // record every frame on which $813180 goes non-zero.
  const pushed = [];
  for (let start = 0x48; start >= 0x2f; start--) {
    const ram = fixture();
    ram.setU8(REC + R.deathCtr, start);
    ram.setU16(BGRAM.extSpeed, 0);
    ram.setU16(0x8130d8, 1);
    runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
    if (ram.u16(BGRAM.extSpeed) !== 0) {
      // BOTH words, because $26B732 and $26B736 load D0 and D1 separately and
      // a check that reads only one cannot see the other go wrong.
      pushed.push([start, ram.u16(BGRAM.extSpeedBg), ram.u16(BGRAM.extSpeedTx)]);
    }
  }
  assert.deepEqual(pushed, [[0x31, 0x20, 0x20]],
    'exactly one frame pushes, and it pushes $0020 on BOTH axes');
});

test('the same frame clears $8130D8, the stage-kill flag the regulars gate on',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU8(REC + R.deathCtr, 0x31);
  ram.setU16(0x8130d8, 1);
  runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
  assert.equal(ram.u16(0x8130d8), 0, '$26B72C clr.w $8130D8');
});

test('($17,A5) reaching 0 FREES the enemy ($26B716 beq / $26B742 jmp $263762)',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU8(REC + R.deathCtr, 1);
  runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
  assert.equal(ram.u16(REC), 0, 'the type word is cleared');
});

// ===========================================================================
// THE $803917 DRAW FAMILY
// ===========================================================================
test('$2431F4 masks its index with $3F and returns the CARTRIDGE byte',
  { skip: SKIP }, () => {
  const ram = new Ram();
  // THE BUMP COMES FIRST ($2431F4 addq.b, THEN $2431FC and.w), so state $0041
  // is read as $42 -- and `moveq #$3f` then masks it to 2, not to $42.
  ram.setU16(0x803916, 0x0041);
  const got = drawByte2431F4(ram, ROM);
  assert.equal(ram.u8(0x803917), 0x42, '$2431F4 addq.b #1,$803917 -- the SHARED counter');
  assert.equal(got, ROM.u8(RNG_2431F4.table + 2), 'the $24324E byte at index $42 & $3F');
  // ...and the fixture is chosen where a wrong index is VISIBLE: entries 2 and
  // 6 of $24324E hold different bytes, so a stride or offset slip shows.
  assert.notEqual(ROM.u8(RNG_2431F4.table + 2), ROM.u8(RNG_2431F4.table + 6),
    'the two candidate entries differ, so this check can fail');
});

test('$242FDE does NOT mask -- state $003F reads $24301A[$40], and ext.w signs it',
  { skip: SKIP }, () => {
  const ram = new Ram();
  // THE FIXTURE IS CHOSEN SO THE ABSENT MASK IS VISIBLE.  Most of $24301A is
  // 0s and 1s, so at most indices a masked read returns the SAME byte and the
  // check would agree with itself whichever way it was written; index $40 is
  // the first where $24301A[$40] and $24301A[$40 & $3F] differ.
  assert.notEqual(ROM.u8(RNG_242FDE.table + 0x40), ROM.u8(RNG_242FDE.table + 0x00),
    'the fixture index distinguishes a masked read from an unmasked one');
  ram.setU16(0x803916, 0x003f);              // the bump makes it $40
  const raw = ROM.u8(RNG_242FDE.table + 0x40);
  assert.equal(drawSigned242FDE(ram, ROM), raw >= 0x80 ? raw - 0x100 : raw,
    '$242FE4 move.w (NO mask) at index $40 / $242FF6 ext.w');
  assert.equal(ram.u8(0x803917), 0x40, 'the same shared counter byte');
});

test('$26B2AC takes FOUR draws in the ROM\'s order: $2431F4 x2, $242FDE, $2431F4',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU16(0x803916, 0);
  rollSwing(ram, ROM, REC);
  assert.equal(ram.u8(0x803917), 4, 'four bumps of the one shared counter');
  // Each field is the byte the ROM table holds at the index that draw saw,
  // put through that draw's own arithmetic.  The four indices are 1,2,3,4.
  const b = (i) => ROM.u8(RNG_2431F4.table + i);
  assert.equal(ram.u8(REC + R.swingAmp), (((b(1) * 2) & 0xff) + 0x14) & 0xff,
    '$26B2B4 add.b then $26B2B6 addi.w #$14 -> ($1A,A5)');
  assert.equal(ram.u8(REC + R.swingRel), (((b(2) * 2) & 0xff) + 0x10) & 0xff,
    '$26B2D0/$26B2D2 -> ($1D,A5)');
  const third = ROM.u8(RNG_242FDE.table + 3);   // the $242FDE draw, index 3
  assert.equal(ram.u8(REC + R.swingNeg), third !== 0 ? 1 : 0,
    '$26B2E6 beq -> ($19,A5)');
  assert.equal(ram.u8(REC + R.swingTgt), ((((b(4) * 4) & 0xff)) + 0x10) & 0xff,
    '$26B2F6/$26B2F8 TWO add.b then addi.b #$10 -> ($18,A5)');
});

test('$26B286 gives the eight arms facings $20 apart and spreads $8 apart',
  { skip: SKIP }, () => {
  const ram = fixture();
  initArms(ram, ROM, REC, SUB);
  assert.deepEqual(Array.from({ length: 8 }, (_, n) => ram.u8(arm(n) + A.facing)),
    [0, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0], '$26B298 addi.b #$20,D6');
  assert.deepEqual(Array.from({ length: 8 }, (_, n) => ram.u8(arm(n) + A.spread)),
    [0, 8, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38], '$26B29C addq.b #$8,D5');
});

// ===========================================================================
// $23E056 -- the FOURTH stub shape
// ===========================================================================
test('$23E056 resolves out of the CARTRIDGE to bucket 3, register convention',
  { skip: SKIP }, () => {
  const r = resolveEmitStub(ROM, 0x23e056);
  assert.equal(r.conv, 'register', 'it opens move.l D1,D0 after its two pushes');
  assert.equal(r.bucket, resolveEmitStub(ROM, 0x23df58).bucket,
    '$23E056 and $23DF58 name the SAME (buffer, counter) pair in their operands');
  assert.equal(BUCKETS[r.bucket].buffer, 0x80688c, 'the buffer the ROM names');
  assert.notEqual(r.bucket, NAMED_BUCKETS.shots, 'and it is not the shot bucket');
});

// ===========================================================================
// $243E7C -- arming the bullet-cancel screen clear
// ===========================================================================
test('$243E7C arms $81B410/$81B412, and REFUSES inside the [$20,$3C] band', () => {
  const ram = new Ram();
  const { ctx } = ctxOf(ram);
  assert.equal(armScreenClear(ram, ctx, 0, 'test'), true, 'not armed -> arms');
  assert.equal(ram.u16(BULLET_DRIVER.armWord), 1);
  assert.equal(ram.u16(BULLET_DRIVER.modeWord), 0);
  // armed, and the mode word inside the band -> the early rts.
  ram.setU16(BULLET_DRIVER.armWord, 7);
  ram.setU16(BULLET_DRIVER.modeWord, 0x2a);
  assert.equal(armScreenClear(ram, ctx, 0, 'test'), false, '$243E98 rts');
  assert.equal(ram.u16(BULLET_DRIVER.armWord), 7, 'and it wrote nothing');
  // ...one past the top of the band re-arms ($243E8E bhi).
  ram.setU16(BULLET_DRIVER.modeWord, 0x3d);
  assert.equal(armScreenClear(ram, ctx, 0, 'test'), true);
  assert.equal(ram.u16(BULLET_DRIVER.armWord), 1);
});

test('the death arm re-arms the screen clear every frame ($26B70C)',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU8(REC + R.deathCtr, 0x60);
  ram.setU16(BULLET_DRIVER.armWord, 0);
  runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
  assert.equal(ram.u16(BULLET_DRIVER.armWord), 1,
    '$81B410 is what $281CD6 (the CANCEL) is gated on');
});

// ===========================================================================
// THE DRAWS -- three sprite requests, all bucket 3, all from ROM tables
// ===========================================================================
test('the BODY sprite reads $26BFE8 by ($24,A5) -- and the addi.l/addi.w question '
  + 'is UNOBSERVABLE downstream, see the comment',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU8(REC + R.deathCtr, 0x60);        // death arm: BODY ONLY, no arms/tail
  ram.setU16(REC + R.bodyFrm, 8);
  ram.setU32(SUB + S.posX, 0x40002000);
  runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
  const q = bucket3(ram);
  assert.equal(q.length, 1, 'the death arm draws the body and nothing else');
  assert.equal(q[0][2], ROM.u32(MIDBOSS.tables.body + 8), 'D2 = $26BFE8[8]');
  assert.equal(q[0][3], 0x24d0, '$26BFD8 move.w #$24D0,D3');
  // $26BFD2 addi.l #$DC00E600 -- ONE 32-bit add; the low half's carry reaches
  // the high half.  ($2,A6) = $40002000 -> $1C000600 with the carry.
  // $26BFD2 addi.l #$DC00E600 is ONE 32-bit add.  **NO CHECK CAN SEE THAT
  // HERE, AND THAT IS MEASURED, NOT ASSUMED.**  The only difference between one
  // `addi.l` and two `addi.w` is a carry that adds 1 to the HIGH word;
  // $23DF66's `asr.l #6` moves that bit to position 10 and `andi.l #$07FF03FF`
  // clears bits 10..15 of the low half -- so the emitted record is identical
  // either way.  W31 mutated it and watched the suite stay GREEN; the
  // transcription of that one instruction rests on the listing alone, and the
  // assertion below deliberately claims only what it can prove.
  const packed = (0x40002000 + 0xdc00e600) >>> 0;
  const packedW = ((((0x4000 + 0xdc00) & 0xffff) << 16) | ((0x2000 + 0xe600) & 0xffff)) >>> 0;
  const enq = (v) => (((((v | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0);
  assert.equal(enq(packed), enq(packedW),
    'the two readings emit the SAME record -- the reason, stated out loud');
  assert.equal(((q[0][0] << 16 >>> 0) + q[0][1]) >>> 0, enq(packed),
    'and the record is the one position + $DC00E600 produces');
});

test('the TAIL sprite reads $26BF42 by ($8,A6) and carries D3 = $1A60',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU16(SUB + S.anim, 0x10);
  // A short axis that WOULD carry if $26BF22/$26BF28 were one addi.l.
  ram.setU32(SUB + S.posX, 0x4000f000);
  runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
  const q = bucket3(ram);
  const tail = q.find((r) => r[3] === 0x1a60);
  assert.ok(tail, '$26BF32 move.w #$1A60,D3 identifies the tail request');
  assert.equal(tail[2], ROM.u32(MIDBOSS.tables.tail + 0x10), 'D2 = $26BF42[$10]');
  // Same caveat as the body request above: $26BF22/$26BF28/$26BF2C straddle a
  // `swap` so neither half carries, and the enqueue's $07FF03FF mask makes
  // that indistinguishable from an `addi.l` in the emitted record.  Checked
  // here for the VALUE, not for the carry rule.
  const lo = (0xf000 + 0xf400) & 0xffff;             // $26BF22
  const hi = ((0x4000 + 0x1600) + 0xe600) & 0xffff;  // $26BF28 then $26BF2C
  const packed = ((hi << 16) | lo) >>> 0;
  assert.equal(((tail[0] << 16 >>> 0) + tail[1]) >>> 0,
    (((((packed | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0),
    'the packed position the two word adds produce');
});

test('a LIVE arm draws twice: $26BE90 by ($30,A0) and $26BE70 by ($A,A0)',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU16(arm(3) + A.flags, 0x0000);   // arm 3 alive
  ram.setU8(arm(3) + A.gfxCad, 5);        // $26B45A does not step ($30,A4) this frame
  ram.setU16(arm(3) + A.gfx, 0x0c);
  ram.setU16(arm(3) + A.anim, 0x08);
  ram.setU32(arm(3) + A.posX, 0x30001000);
  runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
  const q = bucket3(ram);
  const big = q.find((r) => r[3] === 0x620), small = q.find((r) => r[3] === 0x420);
  assert.ok(big && small, '$26BE32 #$620 and $26BE58 #$420 identify the pair');
  assert.equal(big[2], ROM.u32(MIDBOSS.tables.arm + 0x0c), 'D2 = $26BE90[$C]');
  assert.equal(small[2], ROM.u32(MIDBOSS.tables.armAnim + 0x08), 'D2 = $26BE70[8]');
});

// ===========================================================================
// THE FANS
// ===========================================================================
/** Put the body into state 2 with the fan due THIS frame. */
function armFanFrame(ram, fanCtr) {
  ram.setU8(SUB + S.state, 2);
  ram.setU8(SUB + S.fanCtr, fanCtr);
  ram.setU8(SUB + S.fanCad, 0);          // subq.b -> borrow -> fire
  ram.setU8(SUB + S.fanRel, 2);
  ram.setU8(REC + R.hitFlags, 1);        // the aggressive phase
}

test('the big fan is EVEN/ODD on ($D,A6) bit 0 and the two halves fire different KINDS',
  { skip: SKIP }, () => {
  const kindsFor = (fanCtr) => {
    const ram = fixture();
    armFanFrame(ram, fanCtr);
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x26b6fa, ram, ROM, REC, ctx);
    return { kinds: new Set(liveBullets(ram).map((b) => b.kind)),
      sites: new Set(spawns.map(([s]) => s)) };
  };
  const even = kindsFor(2), odd = kindsFor(3);
  // The KIND is D0's low word: $26BA1C move.l #$50003 -> kind 3;
  // $26BA4A move.l #$50004 -> kind 4; $26B9E6 move.l #$30003 -> kind 3.
  assert.deepEqual([...even.kinds].sort(), [3],
    'bit 0 CLEAR -> only the six $2817B8 blocks, D0 = $00050003 -> kind 3');
  assert.deepEqual([...odd.kinds].sort(), [3, 4],
    'bit 0 SET -> the $26B9E6 pre-fan (kind 3) plus the five $281764 blocks (kind 4)');
  assert.ok(even.sites.has(0x26bc0a) && !even.sites.has(0x26ba6c),
    'the even frame fires the LAST $2817B8 block and no $281764 block');
  assert.ok(odd.sites.has(0x26ba04) && odd.sites.has(0x26ba6c) && !odd.sites.has(0x26bc0a),
    'the odd frame fires the pre-fan and the $281764 blocks and no $2817B8 block');
});

test('the $26B9E6 pre-fan reads its D3 out of the PLAYER RECORD, not $2736FA',
  { skip: SKIP }, () => {
  // A0 at $26B9F4 is whatever $24226E left, and $2422A2 saves/restores A0, so
  // it is $24270A's selection.  Changing a longword INSIDE the player record
  // must change the muzzle vector; changing $2736FA (ROM) cannot.
  const run = (patch) => {
    const ram = fixture();
    armFanFrame(ram, 3);
    patch(ram);
    const ram2 = ram;
    runHandler(0x26b6fa, ram2, ROM, REC, ctxOf(ram2).ctx);
    return liveBullets(ram2).map((b) => ram2.u32(BUL.pool + b.slot * BUL.stride + 0x02));
  };
  const base = run(() => {});
  const moved = run((ram) => {
    for (let o = 0; o < 0x100; o += 4) ram.setU32(0x8103e6 + o, 0x11112222);
    ram.setU16(0x8103e6, 0x8000);                 // ...but keep P1 selectable
    ram.setU16(0x8103e8, 0x7000); ram.setU16(0x8103ea, 0x7000);
  });
  assert.notDeepEqual(moved, base,
    'rewriting $8103E6.. changes the pre-fan bullets, which is only possible '
    + 'if A0 is the player record');
});

test('each arm fires only when ($20,A5) & 3 matches its dbra counter, and only '
  + 'with a facing in ($20,$E0)', { skip: SKIP }, () => {
  const fire = (facing, phase) => {
    const ram = fixture();
    ram.setU8(REC + R.hitFlags, 1);
    ram.setU8(REC + R.armsFired, 1);          // $26B304 tst.b / bne -- no launch
    ram.setU8(REC + R.phase, phase);
    for (let n = 0; n < 8; n++) {
      ram.setU16(arm(n) + A.flags, 0);        // alive
      ram.setU8(arm(n) + A.state, 0);
      ram.setU8(arm(n) + A.gateA, 0);
      ram.setU8(arm(n) + A.fireCad, 0);
      ram.setU8(arm(n) + A.gateB, 0);
      ram.setU8(arm(n) + A.facing, facing);
      ram.setU32(arm(n) + A.posX, 0x30001000);
    }
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x26b6fa, ram, ROM, REC, ctx);
    return spawns.filter(([s]) => s === 0x26bce4).length;
  };
  // $26BCA6 move.w D7,D1 / andi.w #3 -- D7 runs 7..0, so exactly TWO of the
  // eight arms match any one phase.  COUNTING THEM CANNOT TELL D7 FROM THE ARM
  // INDEX: both (7-n)&3 and n&3 match exactly two.  So the arms are ALSO named,
  // below, by leaving only two alive.
  assert.equal(fire(0x80, 0), 2, 'two arms share each phase');
  assert.equal(fire(0xe0, 0), 0, '$26BCC0 cmpi.b #$E0 / bcc -- $E0 itself is out');
  assert.equal(fire(0x20, 0), 0, '$26BCCA cmpi.b #$20 / bls -- $20 itself is out');
  assert.equal(fire(0x21, 0), 2, '...but $21 is in');

  // WHICH two.  Only arms 0 and 4 alive: their dbra counters are D7 = 7 and 3,
  // both $3 mod 4, so they fire at phase 3 and at no other -- while their ARM
  // INDICES are 0 and 4, both 0 mod 4.  The two readings pick disjoint phases.
  const named = (phaseSeed) => {
    const ram = fixture();
    ram.setU8(REC + R.hitFlags, 1);
    ram.setU8(REC + R.armsFired, 1);
    ram.setU8(REC + R.phase, phaseSeed);
    for (const n of [0, 4]) {
      ram.setU16(arm(n) + A.flags, 0);
      ram.setU8(arm(n) + A.state, 0);
      ram.setU8(arm(n) + A.gateA, 0); ram.setU8(arm(n) + A.fireCad, 0);
      ram.setU8(arm(n) + A.gateB, 0); ram.setU8(arm(n) + A.facing, 0x80);
      ram.setU32(arm(n) + A.posX, 0x30001000);
    }
    const { ctx, spawns } = ctxOf(ram);
    runHandler(0x26b6fa, ram, ROM, REC, ctx);
    return spawns.filter(([s]) => s === 0x26bce4).length;
  };
  assert.equal(named(2), 2, 'phase 3 (= D7 & 3 for arms 0 and 4) fires both');
  assert.equal(named(7), 0, 'phase 0 (= the ARM INDEX & 3 for those arms) fires neither');
});

// ===========================================================================
// THE EXIT AND THE ARM KINEMATICS
// ===========================================================================
test('the midboss frees itself and clears $8130D8 once ($2,A6) passes $DC00 SIGNED',
  { skip: SKIP }, () => {
  const gone = (pos) => {
    const ram = fixture();
    ram.setU32(SUB + S.posX, ((pos << 16) | 0x2000) >>> 0);
    ram.setU16(0x8130d8, 1);
    runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
    return ram.u16(REC) === 0 && ram.u16(0x8130d8) === 0;
  };
  assert.equal(gone(0xdc00), true, '$26B8D8 bgt -- $DC00 itself frees');
  assert.equal(gone(0xdc01), false, '$DC01 is greater, so it lives');
  assert.equal(gone(0x8000), true, '$8000 is a large NEGATIVE, so it frees');
});

test('$26B304 walks the swing residual down in $10-unit steps, stepping the '
  + 'arm facing by D4 each time', { skip: SKIP }, () => {
  const ram = fixture();
  for (let n = 0; n < 8; n++) ram.setU16(arm(n) + A.flags, 0);
  ram.setU8(REC + R.armsFired, 1);            // -> straight to $26B39C
  ram.setU8(REC + R.swingCur, 0);
  ram.setU8(REC + R.swingNeg, 0);
  ram.setU8(arm(0) + A.facing, 0x40);
  ram.setU8(arm(0) + A.swing, 0x25);          // +37: two whole $10 steps, 5 left
  stepArms(ram, ROM, REC, SUB, MT);
  assert.equal(ram.u8(arm(0) + A.facing), 0x42,
    '$26B444 add.b D4,($1B,A4) ran twice ($25 -> $15 -> $05)');
  assert.equal(ram.u8(arm(0) + A.swing), 0x05,
    '$26B456 stores the RESIDUAL, not the original');
});

test('the death sequence draws the BODY and NOT the arms or the tail ($26BDFC)',
  { skip: SKIP }, () => {
  const ram = fixture();
  for (let n = 0; n < 8; n++) ram.setU16(arm(n) + A.flags, 0);   // all alive
  ram.setU8(REC + R.deathCtr, 0x60);
  runHandler(0x26b6fa, ram, ROM, REC, ctxOf(ram).ctx);
  assert.equal(bucket3(ram).length, 1,
    'one request: $26BFC2. $26BDFC tst.b ($17,A5) / bne stops before $26BE0C');
});

test('$26B184 walks the $26B214 list to its $FFFF and counts every allocation',
  { skip: SKIP }, () => {
  const ram = fixture();
  ram.setU32(SUB + S.posX, 0x40002000);
  ram.setU16(SUB + S.anim, 1);                 // $26B79E bne -> the death path
  ram.setU16(SUB + S.hp, 0x8001);              // negative HP
  ram.setU16(0x8130ce, 0x00f0);                // >= $E7, so the death arm runs
  ram.setU8(REC + R.hitFlags, 1);              // $26B790 bne -- do NOT reset HP
  ram.setU8(SUB, 0x40);                        // a hit flag inside $5C
  const { ctx, log } = ctxOf(ram);
  runHandler(0x26b6fa, ram, ROM, REC, ctx);
  assert.equal(ram.u8(REC + R.deathCtr), 0x70, '$26B184 move.b #$70,($17,A5)');
  const listNotes = [...log.calls.entries()]
    .filter(([k]) => k.startsWith('$289004 ') && k.includes('list entry'));
  assert.equal(listNotes.length, 14,
    '14 records before the $FFFF at $26B284 -- read from the cartridge, not counted here');
  assert.ok([...log.calls.keys()].some((k) => k.startsWith('$246410 ')),
    'the ANIMATION-OBJECT install is counted BY ITS OWN ADDRESS');
});
