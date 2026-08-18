// WAVE 411 -- DOCKET D42, "hyper laser still has no hit animation", and the
// ONE REGISTER that caused it.
//
// `$24CBCC` is `08 ae 00 07 00 01`.  `08 ae` is `bclr #imm,(d16,A6)` -- mode 5,
// register 6 -- and `08 ab` would be A3.  Every other instruction in
// `$24CBBE..$24CBE6` is on A3, so the port's helper took `(rec, word)`, looked
// complete, and cleared bit 7 of the BEAM RECORD's `+$1` instead of the OPTION
// BLOCK's.  A whole-image scan of `$240000..$2B0000` finds ZERO
// `bclr #7,($1,A3)`: the byte the port was clearing had no instruction behind it.
//
// WHY IT IS THE WHOLE OF D42.  `$24CBB2 bset #$7,($1,A6) / beq $24CCD0` lays the
// beam HEAD (pool slot 27, `$811802`) on the frame the bit goes UP, so the bit
// means "a head is already out there" and `$24CBCC` is what retires it: a HIT
// (`btst #4,(A3)`, set only by `$2454AC`/`$2455AE ori.w #$1001` in the damage
// pass) or a completed beam (`($c,A3)`) clears it, and the next quiet frame lays
// a NEW head that runs up the beam to whatever was hit.  Clearing the wrong byte
// left the bit up for the entire hold, so the head was laid ONCE PER PRESS.
//
// MEASURED on the lf2000 laser-hold rung, fire held, 5,400 frames:
//
//                                  HEAD (before)   this tree
//   pool slot 27 live frames             24            742
//   block-7 overlaps (`$24518A`)          0             84
//
// and over 900 frames the type-1 BODY segment -- the one whose `($26,A6)`
// divider is the only caller of `$289F96`, docket D24's "missing hit sprites" --
// went from 11 live slot-frames to 166.  W410 measured the 11-frame window and
// asked whether it was authentic; it is not, and this file is the answer.
//
// TWO MORE DECODING FIXES RIDE ALONG, both inside the same unit and both here:
//   * `$28A25E bpl` after `jsr $242EC2` tests **bit 7**, not bit 15 (docket
//     D48).  `src/spark.js` said the `moveq #$28,D3` arm was unreachable; it
//     runs on 60 of the 128 reachable table bytes.
//   * `$2550BE` (`66 06`, bne) and `$255144` (`67 08`, beq) are MIRRORED, and
//     the port shared P1's form with P2.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import { UnportedLog } from '../src/unported.js';
import { ProtLatch } from '../src/protsim.js';
import { MoveTables } from '../src/vectors.js';
import { RomWindows } from '../src/rom.js';
import { runOptionObject } from '../src/options.js';
import { LASER, SEG, BEAM, S, buildBeam, runSegmentDriver, runBeamDraw } from '../src/laser.js';
import { SPARK, E, spawnBeamImpact289FC0 } from '../src/spark.js';
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';
import {
  RNG, drawWord242EC2, drawByte28AB86, drawByte242E24, drawSigned242FFC,
} from '../src/rng.js';

const TABLES = fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url));
const haveTables = existsSync(TABLES);
const tables = haveTables ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const SKIP = haveTables ? false : 'rip/port/player.tables.json is not built';

function bench() {
  const ram = new Ram(null);
  const rom = haveTables ? new RomWindows(tables.rom) : null;
  return {
    ram,
    ctx: {
      rom,
      prot: new ProtLatch(),
      tables: haveTables ? new MoveTables(tables, rom) : null,
      unportedLog: new UnportedLog(),
    },
  };
}

/** The same lf2000 P1 seed `tests/laser.test.js` uses, so the two files arm the
 *  beam out of one state and a divergence is a real divergence. */
function seedP1(ram) {
  ram.setU16(RAM.p1Options + OPT.state, 0x8003);
  ram.setU16(RAM.p1Options + OPT.pod + OPT.state, 0x8000);
  ram.setU8(RAM.p1Options + OPT.angle, 0x10);
  ram.setU8(RAM.p1Options + OPT.pod + OPT.angle, 0x30);
  ram.setU8(RAM.p1Options + OPT.speedIdx, 0xe0);
  ram.setU8(RAM.p1Options + OPT.pod + OPT.speedIdx, 0xe0);
  ram.setU16(RAM.p1Options + 0x42, 0x0101);
  ram.setU16(RAM.p1Options + OPT.animIdx, 0x0038);
  ram.setU32(RAM.p1Options + OPT.animTable, 0x0024bbba);
  ram.setU16(RAM.p1Options + OPT.animIdxReload, 0x007c);
  ram.setU32(RAM.p1Options + OPT.shadowTable, 0x0024bcfe);
  ram.setU8(RAM.p1Options + 0x3b, 0x30);
  ram.setU8(RAM.p1Options + 0x3e, 0x02);
  ram.setU8(RAM.p1Options + 0x3f, 0x0a);
  ram.setU8(RAM.p1Options + 0x4b, 0x04);
  ram.setU32(RAM.p1Options + 0x30, 0x0024bf4a);
  ram.setU8(RAM.p1Options + 0x36, 0x10);
  ram.setU8(RAM.p1Options + 0x37, 0x30);
  ram.setU16(RAM.p1Options + 0x10, 2);
  ram.setU16(RAM.player1 + P.state, 0x8000);
  ram.setU16(RAM.player1 + P.optFormation, 2);
  ram.setU16(RAM.player1 + P.posY, 0x1179);
  ram.setU16(RAM.player1 + P.posX, 0x14c0);
  ram.setU8(RAM.player1 + P.speedIdx, 22);
  ram.setU8(RAM.player1 + P.baseSpeed, 22);
  ram.setU8(RAM.player1 + P.laserFloor, 12);
  ram.setU8(RAM.player1 + 0x5b, 0x02);
  ram.setU32(0x8127e8, 0x255278);
}

function frame(g, held) {
  g.ram.setU8(RAM.player1 + P.dirByte, held ? 0x10 : 0x00);
  runOptionObject(g.ram, g.ctx);
  runSegmentDriver(g.ram, g.ctx);
  runBeamDraw(g.ram, g.ctx);
}

/** `$2454AC`/`$2455AE ori.w #$1001,(A1)` -- the damage pass's HIT flags, the
 *  only thing in build B that sets bit 4 of the beam record's high byte.  Poked
 *  by name because `laserDamagePass` needs a populated enemy pool and this file
 *  is about what the BUILDER does with the flag, not about how it gets set. */
function pokeHit(ram, rec) {
  ram.setU16(rec, (ram.u16(rec) | 0x1001) & 0xffff);
}

const HEAD = BEAM[0].pool + SEG.headOffset;              // $811802, pool slot 27

// ===========================================================================
// 1.  $24CBCC WRITES THE OPTION BLOCK AND NOT THE BEAM RECORD
// ===========================================================================

test('$24CBCC bclr #7 lands on ($1,A6) -- $8104AB -- and never on the record', {
  skip: SKIP,
}, () => {
  const g = bench();
  seedP1(g.ram);
  for (let i = 0; i <= 24; i++) frame(g, true);
  const opt = RAM.p1Options, rec = BEAM[0].rec;

  // The head has been laid, so `$24CBB2 bset #$7,($1,A6)` has run and the bit
  // it set is UP.  That is the precondition, asserted rather than assumed.
  assert.equal(g.ram.u8(opt + OPT.flags1) & 0x80, 0x80,
    '$24CBB2 bset #$7,($1,A6) left $8104AB bit 7 set');

  // Mark the record's +$1 bit 7 by hand.  If the port were still writing A3,
  // this is the byte that would move and $8104AB is the byte that would not.
  g.ram.setU8(rec + 0x01, g.ram.u8(rec + 0x01) | 0x80);
  const recByteBefore = g.ram.u8(rec + 0x01);

  pokeHit(g.ram, rec);                            // -> $24CB94 btst #4 arm
  buildBeam(g.ram, g.ctx, BEAM[0]);               // $24C374 bsr $24CB3A

  assert.equal(g.ram.u8(opt + OPT.flags1) & 0x80, 0,
    '$24CBCC cleared bit 7 of the OPTION BLOCK ($8104AB)');
  assert.equal(g.ram.u8(rec + 0x01), recByteBefore,
    'and left $811EF3 -- the beam record -- byte-for-byte alone');
  // The five instructions around it are on A3 and must still be, so the fix is
  // one register and not a rewrite.  `$24CBD8 move.w D1,(A0)` and `$24CBDA
  // move.w D1,($12,A3)` both take `($10,A3)`.
  assert.equal(g.ram.u16(BEAM[0].word), g.ram.u16(rec + 0x10),
    '$24CBD8 move.w D1,(A0) -- $812964 still takes ($10,A3)');
  assert.equal(g.ram.u16(rec + 0x12), g.ram.u16(rec + 0x10),
    '$24CBDA move.w D1,($12,A3)');
  assert.equal(g.ram.u16(rec + 0x0c), 0, '$24CBC8 clr.w ($c,A3)');
  assert.equal(g.ram.u16(RAM.p1Options + 0x4e), 0, '$24CBBE clr.w ($4e,A6)');
});

// ===========================================================================
// 2.  THE HEAD IS LAID AGAIN -- AND THE RECORD IS READ BACK, NOT A COUNTER
// ===========================================================================

test('with bit 7 down the builder lays a NEW head into slot 27; with it up it '
  + 'does not', { skip: SKIP }, () => {
  const g = bench();
  seedP1(g.ram);
  for (let i = 0; i <= 24; i++) frame(g, true);
  const opt = RAM.p1Options, rec = BEAM[0].rec;

  // The quiet arm: no hit, no completed beam, and the `($16,A2)` timer already
  // expired -- which is the ONLY path that reaches `$24CBB2`.
  const quiet = () => {
    g.ram.setU16(rec, g.ram.u16(rec) & ~0x1000);
    g.ram.setU16(rec + 0x0c, 0);
    g.ram.setU16(BEAM[0].blk + 0x16, 0);
  };

  // ---- (a) bit 7 UP: nothing is written into slot 27 ----------------------
  g.ram.setU8(opt + OPT.flags1, g.ram.u8(opt + OPT.flags1) | 0x80);
  for (let k = 0; k < SEG.stride; k++) g.ram.setU8(HEAD + k, 0);
  quiet();
  buildBeam(g.ram, g.ctx, BEAM[0]);
  assert.equal(g.ram.u16(HEAD + S.type), 0,
    '$24CBB8 beq is NOT taken when the bit was already set');

  // ---- (b) bit 7 DOWN: the head record appears, field by field ------------
  // `$24CD36 bset #$0,($1,A3)` has already run once (the first head), so this
  // is the RE-LAY arm: `$24CD3E bset #$7,(-$27,A1)` puts bit 7 into the type
  // word's LOW byte and `$24CD4E move.w D0,(-$26,A1)` overwrites the long axis
  // with `($12,A3) + D1 + $400` -- i.e. the new head starts at the beam's
  // CURRENT REACH and not at the ship.  That is the pulse the owner is missing.
  assert.equal(g.ram.u8(rec + 0x01) & 0x01, 0x01,
    '$24CD36 bset #$0,($1,A3) is already up from the first head');
  g.ram.setU8(opt + OPT.flags1, g.ram.u8(opt + OPT.flags1) & ~0x80);
  quiet();
  const podX = g.ram.u16(opt + OPT.posX);
  // D1 is the template's LAST word, read at `$24CD34` after a 30-byte walk of
  // the same two pointer tables `$24CCDC`/`$24CCF0` and `$24CD0A` index.
  const rom = new RomWindows(tables.rom);
  const d3i = g.ram.u16(RAM.player1 + P.shipSel) * 2;
  const head0 = rom.u32(LASER.ptrHead + d3i);
  const tpl = rom.u32(head0 + g.ram.u16(RAM.player1 + 0x22) * 2);
  const d1 = rom.u16(tpl + 30);
  const reach = g.ram.u16(rec + 0x12);
  buildBeam(g.ram, g.ctx, BEAM[0]);

  assert.equal(g.ram.u16(HEAD + S.type), 0x8081,
    '$24CD0E gives type $8001 and $24CD3E ORs bit 7 into its low byte');
  assert.equal(g.ram.u16(HEAD + S.posY), (reach + d1 + 0x400) & 0xffff,
    '$24CD44..$24CD4E -- the head starts at ($12,A3) + D1 + $400');
  assert.equal(g.ram.u16(HEAD + S.posX), podX,
    '$24CD10 move.l ($2,A6),(A1)+ -- the short axis is the pod\'s exactly');
  assert.equal(g.ram.u16(HEAD + S.player), 1, '$24CD24 move.w D7,(A1)+');
  assert.equal(g.ram.u8(HEAD + S.power), g.ram.u8(RAM.player1 + 0x56),
    '$24CD28 move.b ($56,A4),(A1)+');
  assert.equal(g.ram.u8(opt + OPT.flags1) & 0x80, 0x80,
    '$24CBB2 bset #$7 re-armed it, so the next frame lays nothing');
});

test('holding fire through repeated HITS lays the head over and over', {
  skip: SKIP,
}, () => {
  // END TO END, and it is the shape of the owner's report: the head is what
  // runs up the beam when something is hit.  The damage pass is modelled by its
  // two instructions on this record and nothing else -- `$2453C2 bclr #$4,(A1)`
  // at the top of EVERY pass and `$2454AC ori.w #$1001,(A1)` on a hit -- because
  // a populated enemy pool is `tests/w51laserdamage.test.js`'s subject and the
  // flag's LIFETIME is what this test is about.
  const g = bench();
  seedP1(g.ram);
  let layings = 0;
  let wasLive = false;
  for (let i = 0; i <= 120; i++) {
    g.ram.setU16(BEAM[0].rec, g.ram.u16(BEAM[0].rec) & ~0x1000);  // $2453C2
    if (i > 24 && i % 12 === 0) pokeHit(g.ram, BEAM[0].rec);      // $2454AC
    frame(g, true);
    const live = (g.ram.u16(HEAD + S.type) & 0x8000) !== 0;
    if (live && !wasLive) layings++;
    wasLive = live;
  }
  assert.ok(layings >= 3,
    `the head was laid ${layings} times in 120 held frames (>= 3 expected; `
    + 'reading $24CBCC as A3 gives exactly 1, for any length of hold)');
});

// ===========================================================================
// 3.  $28A25E TESTS BIT 7 (DOCKET D48), AND THE VELOCITY SAYS SO
// ===========================================================================

/** Replay `$28A1FA..$28A272`'s draw order on a scratch RAM and return the
 *  velocity the ROM would write for a given angle base D3.  Written from the
 *  listing, not from `src/spark.js`, so agreeing with it is evidence. */
function replayTail(rom, moveTables, state, d3) {
  const scratch = new Ram(null);
  scratch.setU16(RNG.state, state);
  drawSigned242FFC(scratch, rom);                  // $28A204, inside the fill
  const draw = drawWord242EC2(scratch, rom);       // $28A258 -- the word D3 tests
  const a = drawByte28AB86(scratch, rom);          // $28A262 bsr $28AB86
  const d1 = ((a + d3) & 0xff) & 0x3f;             // $28A266 add.b / $28A268 andi.b
  const d0 = (drawByte242E24(scratch, rom) + 4) & 0xff;   // $28A26C / $28A272
  return { draw, v: moveTables.vector(d0, d1) };   // $28A276 jsr $241812
}

test('$28A25E bpl reads bit 7 of the $242EDE byte, not bit 15 of the word', {
  skip: SKIP,
}, () => {
  const rom = new RomWindows(tables.rom);
  const mt = new MoveTables(tables, rom);
  // `$28A1DA`'s own `$28A204 jsr $242FFC` draws FIRST, so the byte `$242EC2`
  // lands on is two `addq.b #1,$803917` past the seeded state.  The replay
  // below is the model of that order; it hands back the very word the ROM
  // would return, and the assertion names the two bits that disagree.
  const state = 1;
  const set = replayTail(rom, mt, state, 0x28);
  assert.equal(set.draw & 0x80, 0x80,
    `$242EC2 returned $${set.draw.toString(16).toUpperCase()} -- bit 7 SET`);
  assert.equal(set.draw & 0x8000, 0,
    'and bit 15 CLEAR, so the two readings give different angles');
  const clr = replayTail(rom, mt, state, 0x18);
  assert.notDeepEqual([set.v.dy, set.v.dx], [clr.v.dy, clr.v.dx],
    'the two angle bases really do produce different velocities here');

  const g = bench();
  const block = 0x811f32;
  g.ram.setU16(block + 0x02, 0x2000);
  g.ram.setU16(block + 0x04, 0x1400);
  g.ram.setU8(block + 0x1d, 0x02);
  g.ram.setU16(SPARK.p1Power, 0);                  // $28A296, a legal power word
  g.ram.setU16(RNG.state, state);
  assert.equal(
    spawnBeamImpact289FC0(g.ram, rom, g.ctx, block, 0x289fc0), true);

  const slot = SPARK.p1Base;
  assert.equal(g.ram.u16(slot + E.vel), set.v.dy & 0xffff,
    '$28A27C move.w D2,(A0)+ -- the $28A260 arm RAN, so D3 was $28');
  assert.equal(g.ram.u16(slot + E.vel + 2), set.v.dx & 0xffff,
    '$28A27E move.w D3,(A0)+');
  // $28A280 add.w D2,(-$1c,A0): the long axis is nudged by the SAME D2.
  assert.equal(g.ram.u16(slot + E.pos),
    (0x2000 + 0xfe00 + set.v.dy) & 0xffff,
    '$28A280 add.w D2,(-$1c,A0) on top of $28A1E6\'s template offset');
});

test('a $242EDE byte with bit 7 CLEAR leaves the angle base at $18', {
  skip: SKIP,
}, () => {
  const rom = new RomWindows(tables.rom);
  const mt = new MoveTables(tables, rom);
  const state = 2;
  const clr = replayTail(rom, mt, state, 0x18);
  assert.equal(clr.draw & 0x80, 0, 'this draw has bit 7 CLEAR');
  const g = bench();
  const block = 0x811f32;
  g.ram.setU16(block + 0x02, 0x2000);
  g.ram.setU16(block + 0x04, 0x1400);
  g.ram.setU16(SPARK.p1Power, 0);
  g.ram.setU16(RNG.state, state);
  assert.equal(
    spawnBeamImpact289FC0(g.ram, rom, g.ctx, block, 0x289fc0), true);
  assert.equal(g.ram.u16(SPARK.p1Base + E.vel), clr.v.dy & 0xffff,
    '$28A256 moveq #$18,D3 stands -- $28A25E bpl branched over $28A260');
});

// ===========================================================================
// 4.  $2550BE AND $255144 ARE MIRRORED
// ===========================================================================

test('$2550BE is `bne` and $255144 is `beq` -- the two beams alternate when '
  + '$81308C is zero', { skip: SKIP }, () => {
  const g = bench();
  seedP1(g.ram);
  // `$254FE6` is what populates the block, and it is only reached once the beam
  // has a REACH -- i.e. after a hit.  Run until `($12,A6)`, the ROM pointer the
  // draw dereferences, is real, so this test never asks the port to invent one.
  for (let i = 0; i <= 60; i++) {
    g.ram.setU16(BEAM[0].rec, g.ram.u16(BEAM[0].rec) & ~0x1000);   // $2453C2
    if (i > 24 && i % 12 === 0) pokeHit(g.ram, BEAM[0].rec);       // $2454AC
    frame(g, true);
  }
  assert.notEqual(g.ram.u32(BEAM[0].blk + 0x12), 0,
    '$255032 move.l -- the block carries a real $24BB0A pointer');
  // A populated P1 block, copied onto P2's so both draws have real fields.
  for (let k = 0; k < 0x20; k++) {
    g.ram.setU8(BEAM[1].blk + k, g.ram.u8(BEAM[0].blk + k));
  }
  g.ram.setU16(BEAM[1].word, g.ram.u16(BEAM[0].word));
  g.ram.setU16(RAM.p2Options + OPT.posY, g.ram.u16(RAM.p1Options + OPT.posY));
  g.ram.setU16(RAM.player2 + P.posX, g.ram.u16(RAM.player1 + P.posX));
  g.ram.setU16(BEAM[0].blk, 0x8000);
  g.ram.setU16(BEAM[1].blk, 0x8000);
  g.ram.setU16(0x81294c, 0);
  g.ram.setU16(0x81294e, 0);
  g.ram.setU16(0x81308c, 0);                       // TWO-player play

  const counters = BUCKETS.map((b) => b.counter);
  const snap = () => counters.map((c) => g.ram.u16(c));
  const delta = (a, b) => a.map((v, i) => b[i] - v);

  g.ram.setU16(0x80390c, 0);
  let before = snap();
  runBeamDraw(g.ram, g.ctx);
  const atZero = delta(before, snap());

  g.ram.setU16(0x80390c, 1);
  before = snap();
  runBeamDraw(g.ram, g.ctx);
  const atOne = delta(before, snap());

  const bucket = atZero.findIndex((d) => d !== 0);
  assert.ok(bucket >= 0, '$23F508 appended somewhere on the $80390C == 0 frame');
  assert.equal(atZero[bucket], RECORD_BYTES,
    `$80390C == 0: exactly ONE record (bucket ${bucket}) -- P1's, `
    + 'because $2550BE `66 06` skips P1 when the word is NON-zero');
  assert.equal(atOne[bucket], RECORD_BYTES,
    `$80390C != 0: exactly ONE record -- P2's, because $255144 \`67 08\` skips `
    + 'P2 when the word is ZERO. Sharing P1\'s form gives 2 and 0.');
  // AND THE RECORDS ARE DIFFERENT ONES: P1's request carries the P1 player X
  // and P2's the P2 one, so a run that emitted P1 twice would fail here even if
  // the counts happened to match.
});
