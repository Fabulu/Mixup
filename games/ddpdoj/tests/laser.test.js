// WAVE 45 -- THE BEAM.  `$24C164`'s gate, its 17-frame arm-up, the two-stage
// bootstrap through `$254680`, and the release teardown.
//
// Every expected value here is DERIVED FROM THE LISTING or from a ROM table
// read in `docs/worklog/ddpdoj/45-impl-laser-beam.md`, never from running the
// port and writing down what came out.  `11-review` F1 and `12-review` F1 are
// both cases of a unit test written from the port locking a real defect in.
//
// WHAT THE OTHER FILES COVER, so this one does not repeat them:
//   tests/ship.test.js   the 9 + 8 = 17 arm-up frame by frame, the RAW-vs-EDGE
//                        gate, and `$24C282`'s write to the player's ($3f,A4)
//   tests/fire.test.js   `$24C476`'s five arms and `$24D480`'s record

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { ProtLatch } from '../src/protsim.js';
import { MoveTables } from '../src/vectors.js';
import { RomWindows } from '../src/rom.js';
import { runOptionObject } from '../src/options.js';
import {
  LASER, SEG, BEAM, S, builder2, buildBeam, runSegmentDriver, runBeamDraw,
  stepTemplate, rampDown, laserRamp60, seedPositionHistory,
} from '../src/laser.js';

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

/** The P1 option block and player as MEASURED in the shipped bundle seed at
 *  logic frame 2000, so a test that arms the laser arms it from a state the
 *  board has actually held. */
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
  ram.setU8(RAM.player1 + 0x5b, 0x02);      // bit 2 CLEAR -> $24CAAE's family
  ram.setU32(0x8127e8, 0x255278);           // $24D48A's ROM pointer, MEASURED
}

/** One logic frame of `$24C096` with fire held or released. */
function frame(g, held) {
  g.ram.setU8(RAM.player1 + P.dirByte, held ? 0x10 : 0x00);
  runOptionObject(g.ram, g.ctx);
  runSegmentDriver(g.ram, g.ctx);           // type-5 call #10, three later
  runBeamDraw(g.ram, g.ctx);                // ...and #11
}

function liveSlots(ram, pool) {
  const out = [];
  for (let s = 0; s < SEG.slots; s++) {
    const t = ram.u16(pool + s * SEG.stride);
    if (t !== 0) out.push([s, t]);
  }
  return out;
}

// ===================================================== 1. THE POOL ARITHMETIC

test('the two pools are 32 x $30 and they BUTT against the control records', () => {
  // $8112F2 + 32*$30 = $8118F2 and $8118F2 + 32*$30 = $811EF2.  This is the
  // whole reason the recon could say the pools are exactly 32 slots.
  assert.equal(BEAM[0].pool + SEG.slots * SEG.stride, BEAM[1].pool);
  assert.equal(BEAM[1].pool + SEG.slots * SEG.stride, BEAM[0].rec);
  assert.equal(BEAM[0].rec + 0x20, BEAM[1].rec);
  // $24CCD0 lea ($510,A1),A1 -- $510 = 27 * $30, so the HEAD is slot 27, which
  // is $811802: the address `src/damage.js` calls "the A2 weapon object".
  assert.equal(SEG.headOffset, 27 * SEG.stride);
  assert.equal(BEAM[0].pool + SEG.headOffset, 0x811802);
  // $24CAAE lea $811832,A1 -- the LATCH's seed is slot 28.
  assert.equal(0x811832, BEAM[0].pool + 28 * SEG.stride);
  // $254C28 lea $811892,A3 -- $254C1E's pair is slot 30.
  assert.equal(BEAM[0].pair, BEAM[0].pool + 30 * SEG.stride);
  assert.equal(BEAM[1].pair, BEAM[1].pool + 30 * SEG.stride);
});

// ================================== 2. THE DISPATCH IS 20 + 20, NOT ONE 32

test('$254680 has TWO 20-entry dispatches, $50 apart -- not one of 32', {
  skip: SKIP,
}, () => {
  // 37-recon-laser §3.2/§6 gives "$254712 ... a 32-entry dispatch" resolving to
  // "17 distinct handlers".  $2546BA reads $254712 for P1 and $2546FA reads
  // $254762 for P2, and $254762 - $254712 = $50 = TWENTY longwords.  $2547B2 --
  // W37's "first handler" -- is $254762 + 20*4, the byte after P2's table.
  assert.equal(LASER.dispatchP2 - LASER.dispatchP1, 20 * 4);
  assert.equal(BEAM[0].dispatch, LASER.dispatchP1);
  assert.equal(BEAM[1].dispatch, LASER.dispatchP2);
  const rom = new RomWindows(tables.rom);
  assert.equal(LASER.dispatchP2 + 20 * 4, 0x2547b2,
    'P2\'s table ENDS where $2547B2 begins');
  assert.equal(rom.u32(0x2547b2), 0x30390081,
    'and what is there is `move.w $810416,D0` -- CODE, not a 21st entry');
  // The ten distinct P1 bodies, read out of the image.
  const p1 = [];
  for (let i = 0; i < 20; i++) p1.push(rom.u32(LASER.dispatchP1 + i * 4));
  assert.deepEqual(p1, [
    0x2547b2, 0x2547e6, 0x2548c4, 0x254a60, 0x254abe,
    0x2547b2, 0x2547e6, 0x2548da, 0x254a60, 0x254abe,
    0x254b68, 0x2547e6, 0x254986, 0x254a60, 0x254abe,
    0x254b9e, 0x2547e6, 0x2549a8, 0x254a60, 0x254abe,
  ]);
  assert.equal(new Set(p1).size, 10, 'ten distinct bodies, not seventeen');
});

test('every template family\'s type word lands INSIDE its own 20-entry table', {
  skip: SKIP,
}, () => {
  // `moveq #$1F,D1 / and.w D0,D1` runs to 31 and the tables are 20 long, so an
  // index of 20..31 reads the OTHER player's table (or past it).  That overrun
  // is the ROM's and the port keeps it; this test is the evidence that no
  // template in the five families produces one.
  const rom = new RomWindows(tables.rom);
  const seen = new Set();
  const fams = [
    [0x24a932, 0x26, 25], [0x24af68, 0x0e, 16],
    [0x24b0a0, 0x20, 10], [0x24b1e0, 0x20, 10], [0x24b320, 0x20, 5],
  ];
  for (const [base, stride, n] of fams) {
    for (let i = 0; i < n; i++) {
      const t = rom.u16(base + stride * i);
      assert.equal(t & 0x8000, 0x8000, `$${(base + stride * i).toString(16)}`);
      seen.add(t & 0x1f);
    }
  }
  assert.deepEqual([...seen].sort((a, b) => a - b),
    [0, 1, 2, 5, 6, 7, 10, 11, 12, 15, 16, 17]);
  for (const idx of seen) assert.ok(idx < 20, `type & $1F = ${idx} is in range`);
});

// ======================================= 3. THE TWO-STAGE BOOTSTRAP

test('THE BEAM CANNOT START ITSELF: bit 5 of (A6) comes from $254C1E', {
  skip: SKIP,
}, () => {
  // Both builders open `btst #5,(A6) / beq <the pod tail>` and the option
  // block's state word is $8003 -- bit 5 of the HIGH byte is CLEAR.  The only
  // writer in build B is $254C1E bset #5,(A4), inside a segment handler.  So
  // the frame order is forced: +17 seeds, +18 the driver sets the bit, +19 the
  // builder lays segments.  A port that armed the builders directly would put
  // the beam two frames early and no gate would see it.
  const g = bench();
  seedP1(g.ram);
  const opt = RAM.p1Options;
  for (let i = 0; i <= 16; i++) frame(g, true);
  assert.equal(g.ram.u16(opt) & 0x2000, 0, '+16: bit 5 still clear');
  assert.equal(g.ram.u16(0x811832), 0, '+16: nothing seeded');
  frame(g, true);                                   // +17
  assert.equal(g.ram.u8(opt + OPT.flags1) & 0x04, 0x04, '+17: $24C1A8 latched');
  assert.equal(g.ram.u16(0x811832), 0x8002,
    '+17: $24CAAE seeded slot 28 from family 1 entry 0 ($24A932)');
  assert.equal(g.ram.u16(opt) & 0x2000, 0,
    '+17: the driver ran, but the muzzle\'s SCRIPT word is still positive');
  // $25491E move.w (A0)+,($22,A6) / $254922 bpl $254952 -- `$254C1E` is behind
  // a NEGATIVE script word, so the muzzle walks ordinary entries first.
  frame(g, true);                                   // +18
  frame(g, true);                                   // +19
  assert.equal(g.ram.u16(opt) & 0x2000, 0, '+19: still shut');
  frame(g, true);                                   // +20
  assert.equal(g.ram.u16(opt) & 0x2000, 0x2000,
    '+20: $2548C4 reached the command word and ran $254C1E bset #5,(A4)');
  assert.equal(g.ram.u16(BEAM[0].rec) & 0x8000, 0x8000,
    '$254C5C move.w (A1)+,(A2) -- $811EF2 goes live from the ($2c,A6) template');
  // 10-recon-combat §2 measured on the BOARD, 600 held frames: "$8104AB bit 2
  // latches at +17, the laser record $811EF2 goes live at +20".  BOTH numbers
  // reproduce here, and the three frames between them -- which
  // 37-recon-laser §3.3 leaves UNRESOLVED, guessing at ($42,A6)/($43,A6)/
  // ($4e,A6) -- are the muzzle script's leading positive entries.
});

test('the beam LAYS SEGMENTS, one per frame, into the first free slot', {
  skip: SKIP,
}, () => {
  const g = bench();
  seedP1(g.ram);
  for (let i = 0; i <= 17; i++) frame(g, true);
  const at17 = liveSlots(g.ram, BEAM[0].pool).map(([s]) => s);
  assert.deepEqual(at17, [28], 'only the muzzle exists at +17');
  for (let i = 18; i <= 24; i++) frame(g, true);
  const t = new Map(liveSlots(g.ram, BEAM[0].pool));
  // $24CCD0 writes the HEAD 27 slots on from the cursor -- slot 27, type $8001
  // out of family 3 entry 0 ($24B0A0).  $24CC34 writes ONE body segment per
  // frame from the first free slot -- type $8000 out of family 2 entry 0.
  assert.equal(t.get(28), 0x8002, 'the muzzle is still slot 28');
  assert.equal(t.get(27), 0x8001, 'the HEAD is slot 27 -- $24B0A0, type $8001');
  assert.equal(t.get(0), 0x8000, 'body segments start at slot 0 -- $24AF68');
  assert.ok(t.size >= 4, 'the chain grows one segment a frame');

  // ---- THE RECORD'S FIELDS, from family 2 entry 0 `$24AF68` ---------------
  // Read out of the image: type $8000, ($6,$8) = $FC00FE00, the anim TABLE
  // $24ACE8, size $0410, and the wrap limit $0028.  A port that miscounted
  // `$24CC4C lea ($a,A1),A1` would put every later field two bytes out and the
  // type word alone would never say so.
  // Driven by calling `$24CB3A` ALONE, with no `$254680` behind it, so the
  // record is read in the state the builder left it: the driver's `$2547B2`
  // steps every segment the same frame it is written, and comparing a stepped
  // record against the pod would be comparing two different frames.
  const rom = new RomWindows(tables.rom);
  const free = [...Array(SEG.slots).keys()]
    .find((s) => (g.ram.u16(BEAM[0].pool + s * SEG.stride) & 0x8000) === 0);
  assert.ok(free !== undefined, 'the pool still has a free slot');
  const podY = g.ram.u16(RAM.p1Options + OPT.posY);
  const podX = g.ram.u16(RAM.p1Options + OPT.posX);
  buildBeam(g.ram, g.ctx, BEAM[0]);                  // $24C374 bsr $24CB3A
  const seg = BEAM[0].pool + free * SEG.stride;
  assert.equal(g.ram.u16(seg + S.type), 0x8000, 'the free slot took a segment');
  assert.equal(rom.u16(0x24af68), 0x8000);
  assert.equal(rom.u32(0x24af68 + 2), 0xfc00fe00);
  assert.equal(rom.u16(0x24af68 + 0x0a), 0x0410, 'the SIZE is the 6th field');
  assert.equal(rom.u16(0x24af68 + 0x0c), 0x0028, '...and the wrap LIMIT the 7th');
  assert.equal(g.ram.u32(seg + S.offLong), 0xfc00fe00, '$24CC3E move.l');
  assert.equal(g.ram.u16(seg + S.size), 0x0410, '$24CC4A the SIZE word');
  assert.equal(g.ram.u16(seg + S.player), 1, '$24CC50 move.w D7,(A1)+');
  assert.equal(g.ram.u8(seg + S.flipColour), 0, '$24CC52 clr.b (A1)+');
  assert.equal(g.ram.u8(seg + S.power), g.ram.u8(RAM.player1 + 0x56),
    '$24CC54 move.b ($56,A4),(A1)+');
  // The anim long is `(A2,D1.w)` out of $24ACE8, D1 = ($50,A6), which steps by
  // 4 and wraps at $0028 -- so it is always one of that table's ten entries.
  const anims = [];
  for (let i = 0; i < 10; i++) anims.push(rom.u32(0x24ace8 + i * 4));
  assert.ok(anims.includes(g.ram.u32(seg + S.anim)),
    `$24CC46 move.l (A2,D1.w) -- the anim is one of $24ACE8's ten`);
  // $24CC36 move.l ($2,A6),(A1)+ / $24CC3A sub.w D4,(-$4,A1): the LONG axis is
  // the pod's MINUS D4, and D4 is ($30,A4) + $300 ($24CB5A/$24CB82).  The
  // SHORT axis is the pod's, untouched.  A `+` here would send the beam DOWN.
  const d4 = (g.ram.u16(RAM.player1 + P.velY) + 0x300) & 0xffff;
  assert.equal((g.ram.u16(RAM.p1Options + OPT.posY) - g.ram.u16(seg + S.posY))
    & 0xffff, d4, '$24CC3A sub.w D4 -- the segment is AHEAD of the pod');
  assert.equal(g.ram.u16(seg + S.posX), g.ram.u16(RAM.p1Options + OPT.posX),
    'and the short axis is the pod\'s exactly');
});

test('a segment that reaches $7800 sets ($c,A3) and the WINDOW recomputes', {
  skip: SKIP,
}, () => {
  // $2547D4 cmpi.w #$7800,D0 / bcc $254E04 -- the top of the playfield.
  // $254E1C bset #0,($1,A0) / $254E22 move.w #$1,($c,A0) then kills the record,
  // and the NEXT frame's $24CB9A tst.w ($c,A3) takes $24CBCC's arm, which
  // recomputes ($6,A3) from ($10,A3) and writes $812964.  That second arm is
  // what makes the drawn beam stop growing; without it the builder keeps
  // pushing ($6,A3) up by $800 for ever.
  const g = bench();
  seedP1(g.ram);
  let sawComplete = -1;
  for (let i = 0; i <= 70; i++) {
    frame(g, true);
    if (sawComplete < 0 && g.ram.u16(BEAM[0].rec + 0x0c) !== 0) sawComplete = i;
  }
  assert.ok(sawComplete > 20,
    `($c,A3) went to 1 at +${sawComplete}, after the beam reached $7800`);
  // AND IT STAYS SET.  `$24CBCC` recomputes the window and does NOT clear the
  // flag; the ONLY `clr.w ($c,A3)` is `$24CBC8`, inside the `btst #4,(A3)` arm,
  // and bit 4 of `$811EF2` is set only by `$2454AC`/`$2455AE ori.w #$1001` --
  // both inside `$2453AC`, THE DAMAGE PASS, which is W37's L3 and is unported.
  // So on this tree a completed beam holds the flag for the rest of the hold.
  assert.equal(g.ram.u16(BEAM[0].rec + 0x0c), 1,
    'only $24CBC8, behind bit 4 of $811EF2, can clear it -- and that is L3');
  assert.equal(g.ram.u16(BEAM[0].rec) & 0x1000, 0,
    'bit 4 of the beam record is the DAMAGE pass\'s, and it has never been set');
  assert.equal(g.ram.u16(BEAM[0].word), g.ram.u16(BEAM[0].rec + 0x12),
    '$24CBD8/$24CBDA -- $812964 and ($12,A3) both take ($10,A3)');
  // THE WITNESS THAT $24CBCC's ARM IS THE ONE RUNNING, and the reason it needs
  // one: `$24CBAC addi.w #$800,($6,A3)` in the OTHER arm grows without limit,
  // whereas `$24CBDE sub.w ($2,A3),D0 / bcc / moveq #0,D0` clamps at 0.  With
  // ($10,A3) still 0 -- it is written by the DAMAGE pass, not by anything here
  // -- the clamped value is exactly 0, and an unclamped one is a multiple of
  // $800 that keeps climbing.
  assert.equal(g.ram.u16(BEAM[0].rec + 0x06), 0,
    '$24CBE6 move.w D0,($6,A3) with D0 clamped to 0');
});

// ================================================ 4. THE RELEASE TEARDOWN

test('RELEASING fire wipes the pool, un-latches and swings the pods back', {
  skip: SKIP,
}, () => {
  const g = bench();
  seedP1(g.ram);
  for (let i = 0; i <= 30; i++) frame(g, true);
  assert.ok(liveSlots(g.ram, BEAM[0].pool).length > 3, 'a beam is running');
  frame(g, false);                                  // the first released frame
  // $24C2F4 andi.w #$DFDB,(A6) clears bit 5 of BOTH bytes and bit 2 of the low
  // one -- the builders' gate AND the latch, in one instruction.
  assert.equal(g.ram.u16(RAM.p1Options) & 0x2000, 0, 'the builders are shut');
  assert.equal(g.ram.u8(RAM.p1Options + OPT.flags1) & 0x04, 0, 'un-latched');
  assert.equal(liveSlots(g.ram, BEAM[0].pool).length, 0,
    '$252714\'s 32-slot wipe ran');
  assert.equal(g.ram.u16(BEAM[0].rec), 0, '$2527A2 clears $811EF2');
  assert.equal(g.ram.u16(BEAM[0].blk), 0, '$2527A4 clears $811F32');
  assert.equal(g.ram.u8(RAM.player1 + P.dead), 0,
    '$24C2D6 clears ($3f,A4), so the ship spawns ordinary shots again');
  // $24C310..$24C338 -- two units a frame back to ($36,A6) = $10.
  assert.equal(g.ram.u8(RAM.p1Options + OPT.angle), 2, 'one swing step back');
  for (let i = 0; i < 8; i++) frame(g, false);
  assert.equal(g.ram.u8(RAM.p1Options + OPT.angle), 0x10, 'back at rest');
  assert.equal(g.ram.u8(RAM.p1Options + 0x3b), 0x30);
  assert.equal(g.ram.u16(RAM.p1Options) & 0x4000, 0,
    '$24C324 andi.b #$B3 cleared the "laser started" bit 6');
});

test('a SECOND hold pays the full seventeen frames again', { skip: SKIP }, () => {
  const g = bench();
  seedP1(g.ram);
  for (let i = 0; i <= 30; i++) frame(g, true);
  for (let i = 0; i < 12; i++) frame(g, false);
  for (let i = 0; i <= 16; i++) frame(g, true);
  assert.equal(g.ram.u16(0x811832), 0, '+16 of the second hold: not yet');
  frame(g, true);
  assert.equal(g.ram.u16(0x811832), 0x8002, '+17 of the second hold: seeded');
});

// ============================== 5. THE BOMB-LASER IS A DIFFERENT WEAPON

test('a held BEAM never writes $811F72, the BOMB-LASER\'s record', {
  skip: SKIP,
}, () => {
  // 37-recon-laser §0: "THERE ARE TWO LASERS."  Every laser fork in
  // src/score.js -- $2860A8, $2862DC and the $286A82/$2867B4 machine behind
  // them -- reads $811F72, and that is weapon (A)'s 45 x $30 record, selected
  // by $24989E INSIDE THE BOMB.  This wave ported weapon (B).  If the beam ever
  // touched $811F72 the chain would start breaking on every hit and score.js
  // would silently become wrong, which is exactly what the wave brief
  // predicted would happen -- from the other laser.
  //
  // SIXTY frames here, not the 600 the worklog reports: this bench is the
  // option object alone, with no scroll, no $80390C alternation and a ship that
  // never moves, so a long run walks into states the machine does not produce.
  // The 600-frame figure is measured on the FULL Game from the shipped bundle
  // seed (45-impl-laser-beam.md §2) and this is its unit-level twin.
  const g = bench();
  seedP1(g.ram);
  let worst = 0;
  for (let i = 0; i < 60; i++) {
    frame(g, true);
    worst = Math.max(worst, g.ram.u16(0x811f72));
  }
  assert.equal(worst, 0, '$811F72 stayed 0 for all 60 held frames');
  assert.equal(g.ram.u8(0x8130f9) & 0x04, 0,
    '$8130F8 bit 2 -- $2860A8\'s OTHER gate -- is 0 as well');
});

// ==================================================== 6. THE L3 BOUNDARY

test('$24CDC0 is a LOUD named throw and is NOT called dead code', () => {
  const e = (() => { try { builder2(new Ram(null)); return null; }
    catch (err) { return err; } })();
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, LASER.builder2);
  assert.match(e.message, /\$24C37A/, 'it names the caller nothing reaches');
  assert.match(e.message, /\$24536E/, 'and the damage entry it carries');
});

// ============================= 7. THE FOUR LEAVES, DRIVEN DIRECTLY

test('$2536FA adds 4 to ($60,A4) and stops dead at $80', () => {
  const ram = new Ram(null);
  ram.setU16(RAM.player1 + 0x60, 0x7c);
  laserRamp60(ram, RAM.player1);
  assert.equal(ram.u16(RAM.player1 + 0x60), 0x80);
  laserRamp60(ram, RAM.player1);
  assert.equal(ram.u16(RAM.player1 + 0x60), 0x80, '$2536FA cmpi.w #$80 / beq');
});

test('$24C8BE steps the speed index once per ($4b,A6) frames, down to ($38,A4)', () => {
  const ram = new Ram(null);
  ram.setU8(RAM.player1 + P.speedIdx, 22);
  ram.setU8(RAM.player1 + P.laserFloor, 20);
  ram.setU8(RAM.player1 + 0x5a, 0);
  ram.setU16(RAM.player1 + P.optFormation, 2);
  ram.setU8(RAM.p1Options + OPT.reloadCount, 4);
  for (let i = 0; i < 3; i++) rampDown(ram, RAM.player1, RAM.p1Options);
  assert.equal(ram.u8(RAM.player1 + P.speedIdx), 22, 'three frames move nothing');
  rampDown(ram, RAM.player1, RAM.p1Options);
  assert.equal(ram.u8(RAM.player1 + P.speedIdx), 21, 'the fourth does');
  // $24C8D2..$24C8DE: the reload is ((($5a,A4) - 2) >> 1) + 4 = 4 at formation 2.
  assert.equal(ram.u8(RAM.p1Options + OPT.reloadCount), 4);
  for (let i = 0; i < 8; i++) rampDown(ram, RAM.player1, RAM.p1Options);
  assert.equal(ram.u8(RAM.player1 + P.speedIdx), 20, 'and it STOPS at the floor');
});

test('$24C906 returns the CARRY on a negative ($12,A6) and does NOT advance', {
  skip: SKIP,
}, () => {
  // This is the instruction 37-recon-laser §3.3's "+17" derivation skips.
  // $24BF4A's first record has ($12,A6) = $FFFF, so the very first call sets
  // the carry, ($16,A6) never moves, and $24C1A4's `bcc` falls into the latch.
  const g = bench();
  g.ram.setU32(RAM.p1Options + 0x16, 0x0024bf4a);
  assert.equal(stepTemplate(g.ram, g.ctx, RAM.p1Options), true);
  assert.equal(g.ram.u32(RAM.p1Options + 0x16), 0x0024bf4a, 'not advanced');
  assert.equal(g.ram.u32(RAM.p1Options + OPT.anim), 0x00065354,
    'and it STILL writes the pod\'s muzzle sprite every frame');
  assert.equal(g.ram.u32(RAM.p1Options + OPT.shadow0), 0x00065388);
  assert.equal(g.ram.u16(RAM.p1Options + 0x1e), 0,
    '($1e,A6) = 0, so $24C36C\'s add.w moves nothing at formation 2');
});

test('$2536B6 fills SIXTEEN copies from ONE source, both buffers', () => {
  const ram = new Ram(null);
  ram.setU32(RAM.player1 + 0x02, 0x11791234);
  ram.setU32(RAM.player1 + 0x0a, 0x0000abcd);
  seedPositionHistory(ram, 1);
  for (let k = 0; k < 16; k++) {
    assert.equal(ram.u32(0x8127f4 + k * 4), 0x11791234, `copy ${k}`);
    assert.equal(ram.u32(0x812874 + k * 4), 0x0000abcd, `anim ${k}`);
  }
  assert.equal(ram.u32(0x812834), 0, 'P2\'s buffer is untouched');
  ram.setU32(RAM.player2 + 0x02, 0x22225555);
  ram.setU32(RAM.player2 + 0x0a, 0x0000beef);
  seedPositionHistory(ram, 0);
  assert.equal(ram.u32(0x812834), 0x22225555, '$2536D0 reads $810448');
  assert.equal(ram.u32(0x8128b4), 0x0000beef);
  assert.equal(ram.u32(0x8127f4), 0x11791234, 'and P1\'s survives');
});

// ================================================= 8. THE SEGMENT FIELDS

test('S names the segment fields the sprite stub reads', () => {
  // enqueueRequest reads +$2/+$4 (position), +$6/+$8 (offsets), +$A/+$C (the
  // sprite long), +$E (size) and +$1C (flip/colour).  A record whose fields are
  // at other offsets would draw somewhere else and nothing would say so.
  assert.equal(S.posY, 0x02); assert.equal(S.posX, 0x04);
  assert.equal(S.offLong, 0x06); assert.equal(S.offShort, 0x08);
  assert.equal(S.anim, 0x0a); assert.equal(S.size, 0x0e);
  assert.equal(S.flipColour, 0x1c);
  assert.equal(S.player, 0x1a, '$24CC50 move.w D7,(A1)+');
  assert.equal(S.power, 0x1d, '$24CC54 move.b ($56,A4),(A1)+');
});

test('$255042 ends at $255158 -- W37 left the extent open', () => {
  assert.equal(LASER.drawEnd, 0x255158);
  assert.equal(LASER.drawEnd - LASER.draw, 278,
    'P1 $255042..$2550CA, P2 $2550CC..$255154, two rts');
});
