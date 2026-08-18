// WAVE 413 -- DOCKET D43 AS THE OWNER CORRECTED IT: "if you use laser while
// firing bomb, a stronger laser comes out instead of a bomb.  That one does not
// hit first boss and maybe other stuff."
//
// THE LASER BOMB'S AABB WAS SIGNED AND THE CARTRIDGE'S IS UNSIGNED.
//
// `$2456A6`'s three record walks share one box test, `recordHitsBox`, and its
// four comparisons are `$2457A0`/`$2457A8`/`$2457B8`/`$2457C0` -- `65 xx`,
// `bcs`, the CARRY, i.e. UNSIGNED LOWER.  Their twins at
// `$2458B6`/`$2458BE`/`$2458CE`/`$2458D6` (pool A) and
// `$245990`/`$245998`/`$2459A8`/`$2459B0` (the bullets) are the same twelve
// bytes.  The port wrote all four as `i16(...)` SIGNED compares **while quoting
// `bcs` in the comment beside them** -- W411's shape exactly: a wrong reading
// with the right citation next to it.
//
// IT IS NOT A CORNER CASE, IT IS THE TOP OF THE SCREEN.  Every coordinate in
// this routine carries D6's `$2800` bias (`$24518A move.w #$2800,D6`, and it is
// the ONLY write to D6 anywhere on the path to `$24560A`), so a raw Y of `$5800`
// and up biases past `$8000` and reads NEGATIVE as `i16`.
//
// MEASURED, against the BOARD's own stage-1 boss sub-record and the PORT's own
// beam (the shipped seed, fire held, Button 2 at step 380):
//
//   | 131 damage frames                    | signed (HEAD) | unsigned |
//   | intersecting beam segments found     |             0 |       10 |
//   | pool-B hits (`$2457FA`)              |             0 |       64 |
//   | boss HP `($18,$81523C)`              |  $7FFF (none) |    $FDFF |
//
// `$7FFF - 64 * $208 = -$201 = $FDFF`, which is the arithmetic and not a
// tolerance.  Nine of the ten segments were rejected at comparison 1
// (`$24579E cmp.w D1,D4 / bcs`) and one at comparison 2.
//
// WHICH HALF THE BOSS IS IN, AND WHY IT MATTERS.  `$81459C + 100 * $20 =
// `$81521C` and `100 + 50 = 150`: pool A and pool B are the same contiguous 150
// slots the ORDINARY bomb walks, split in two.  The stage-1 boss's sub-record is
// `$81523C` -- pool B index 1, the **101st** of the 150 -- so the laser bomb can
// hit it at most ONCE per frame, and only when it is the NEAREST intersecting
// record.  That rule is the cartridge's and this wave did not touch it.  What
// was broken is that the boss never even reached the nearest test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RAM, P } from '../src/machine.js';
import { BOMBRAM, BEAM_REC, bombDamageAlt2456A6 } from '../src/bomb.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROMBIN = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const CKPT = path.join(HERE, '..', 'tools', 'oracle', 'out', 'w69',
  'stage1-sweep', 'ckpt');

const haveRom = existsSync(ROMBIN);
const rom = haveRom ? readFileSync(ROMBIN) : null;
const ROM_SKIP = haveRom ? false : 'rip/sound/maincpu.bin is not present';

const u16 = (v) => v & 0xffff;
/** The cartridge is read at RAW FILE OFFSET.  `$200000` is NOT subtracted. */
const romBytes = (a, n) => [...rom.subarray(a, a + n)];

// ---------------------------------------------------------------------------
// 1.  THE LISTING.  Twelve `bcs` bytes, and the two reads the brief asks about.
// ---------------------------------------------------------------------------

test('$2456A6 -- all TWELVE box comparisons are `bcs`, i.e. UNSIGNED',
  { skip: ROM_SKIP }, () => {
    // pool B `$245788`, pool A `$24589E`, the bullets `$245978` -- four each.
    const sites = [
      [0x2457a0, 'B/1 $24579E cmp.w D1,D4'], [0x2457a8, 'B/2 $2457A6 cmp.w D5,D0'],
      [0x2457b8, 'B/3 $2457B6 cmp.w D3,D4'], [0x2457c0, 'B/4 $2457BE cmp.w D5,D2'],
      [0x2458b6, 'A/1 $2458B4 cmp.w D1,D4'], [0x2458be, 'A/2 $2458BC cmp.w D5,D0'],
      [0x2458ce, 'A/3 $2458CC cmp.w D3,D4'], [0x2458d6, 'A/4 $2458D4 cmp.w D5,D2'],
      [0x245990, 'X/1 $24598E cmp.w D0,D4'], [0x245998, 'X/2 $245996 cmp.w D5,D0'],
      [0x2459a8, 'X/3 $2459A6 cmp.w D2,D4'], [0x2459b0, 'X/4 $2459AE cmp.w D5,D2'],
    ];
    for (const [a, name] of sites) {
      assert.equal(rom[a], 0x65,
        `${name}: $${a.toString(16)} is $${rom[a].toString(16)}, not $65 (bcs)`);
    }
    // and NONE of them is `6D` (blt) or `6F` (ble), the signed forms a port that
    // "meant" signed would have had to read there.
    assert.equal(sites.filter(([a]) => rom[a] === 0x6d || rom[a] === 0x6f).length, 0);
  });

test('D6 on the $2456A6 arm is the $2800 COORDINATE BIAS, never the hit mask',
  { skip: ROM_SKIP }, () => {
    // `$245636 66 6e` -- bne, and $245636 + 2 + $6E = $2456A6.
    assert.deepEqual(romBytes(0x245636, 2), [0x66, 0x6e]);
    assert.equal(0x245636 + 2 + 0x6e, 0x2456a6);
    // `$24563E 3c 39 00 80 fa 72` -- move.w $80FA72,D6, the HIT MASK, and it is
    // PAST that bne, so the laser-bomb arm never executes it.
    assert.deepEqual(romBytes(0x24563e, 6), [0x3c, 0x39, 0x00, 0x80, 0xfa, 0x72]);
    assert.ok(0x24563e > 0x245636, 'the mask read is on the OTHER arm');
    assert.equal(BOMBRAM.hitMask, 0x80fa72);
    // `$24518A 3c 3c 28 00` -- move.w #$2800,D6, block 7's.
    assert.deepEqual(romBytes(0x24518a, 4), [0x3c, 0x3c, 0x28, 0x00]);
    // ...and $24560A is reached by FALLING OUT of block 8, in that same
    // register context: `$245310 60 00 02 f8` is bra, and $245310+2+$2F8 is
    // $24560A.  `$24530C 61 00 00 9E` is the bsr just before it, to $2453AC.
    assert.deepEqual(romBytes(0x245310, 4), [0x60, 0x00, 0x02, 0xf8]);
    assert.equal(0x245310 + 2 + 0x2f8, 0x24560a);
    assert.deepEqual(romBytes(0x24530c, 4), [0x61, 0x00, 0x00, 0x9e]);
    assert.equal(0x24530c + 2 + 0x9e, 0x2453ac);
    // Neither span writes D6 -- not `move.[bwl] <ea>,D6`, not `moveq`, not
    // `clr.w D6`, not `swap D6`.  ($2453AC's routine runs to the `4E75` at
    // $245608, the one immediately before $24560A.)
    const writesD6 = (w) => (w >= 0x3c00 && w <= 0x3c3f)
      || (w >= 0x7c00 && w <= 0x7cff) || (w >= 0x1c00 && w <= 0x1c3f)
      || (w >= 0x2c00 && w <= 0x2c3f) || w === 0x4246 || w === 0x4846;
    for (const [from, to] of [[0x24518c, 0x245310], [0x2453ac, 0x24560a]]) {
      const writers = [];
      for (let a = from; a < to; a += 2) {
        if (writesD6((rom[a] << 8) | rom[a + 1])) writers.push('$' + a.toString(16));
      }
      assert.deepEqual(writers, [], `D6 is rewritten in $${from.toString(16)}..`);
    }
    // THE ONE THAT LOOKS LIKE A COUNTER-EXAMPLE AND IS NOT.  `$24535A` is a
    // SECOND `move.w #$2800,D6`, but it sits inside $245314..$24536C, a
    // subroutine that opens `48 e7 ff fe` (movem.l D0-D7/A0-A6,-(A7)) and
    // closes `4c df 7f ff` / `4e 75` -- it saves and restores D6, and it is not
    // on the fall-through either.  A narrower scan would have "found" it.
    assert.deepEqual(romBytes(0x24535a, 4), [0x3c, 0x3c, 0x28, 0x00]);
    assert.deepEqual(romBytes(0x245314, 4), [0x48, 0xe7, 0xff, 0xfe]);
    assert.deepEqual(romBytes(0x245368, 6), [0x4c, 0xdf, 0x7f, 0xff, 0x4e, 0x75]);
  });

test('$245776 rejects a biased near edge >= $9800, unsigned (`bcc`)',
  { skip: ROM_SKIP }, () => {
    // `0c 41 98 00` cmpi.w #$9800,D1 / `64 a8` bcc -- BCC, not BGE.
    assert.deepEqual(romBytes(0x245776, 6), [0x0c, 0x41, 0x98, 0x00, 0x64, 0xa8]);
    assert.equal(0x24577a + 2 - 0x58, 0x245724, 'the bcc goes to the slot bump');
  });

// ---------------------------------------------------------------------------
// 2.  WHICH HALF.  The boss's slot index, derived and not asserted as a name.
// ---------------------------------------------------------------------------

test('pool A and pool B are ONE 150-slot array, and the boss is the 101st',
  () => {
    assert.equal(BOMBRAM.poolA + 100 * BOMBRAM.poolAStride, BOMBRAM.poolB);
    assert.equal(100 + 50, 150);
    // `$81523C` is the boss's sub-record.  It is NOT written here as a
    // constant: the check below reads it out of the board's own RAM.
    const boss = 0x81523c;
    const slot = (boss - BOMBRAM.poolA) / BOMBRAM.poolAStride;
    assert.equal(slot, 101, 'the boss is slot 101 of 150');
    assert.ok(slot >= 100, 'and 101 >= 100 puts it in the LAST FIFTY, pool B');
    assert.equal((boss - BOMBRAM.poolB) / BOMBRAM.poolBStride, 1);
  });

test('THE BOARD says so: $81B62A - $16 -> ($6) is $81523C, and its biased far '
  + 'edge is >= $8000 on every checkpoint of the fight', () => {
  if (!existsSync(CKPT)) {
    assert.fail('tools/oracle/out/w69/stage1-sweep/ckpt is missing -- this row '
      + 'is the only direct board evidence in the file and a skip is not a pass');
  }
  const files = readdirSync(CKPT).filter((f) => f.endsWith('.ram.bin')).sort();
  assert.ok(files.length >= 70, `${files.length} checkpoints`);
  const BASE = 0x800000;
  let alive = 0, farHigh = 0, nearHigh = 0;
  const seen = new Set();
  for (const f of files) {
    const b = readFileSync(path.join(CKPT, f));
    const rd16 = (a) => b.readUInt16BE(a - BASE);
    const rd32 = (a) => b.readUInt32BE(a - BASE);
    // `$2927B6 lea $16(a5),a0 / move.l a0,$81B62A` is the boss init publishing
    // its own record, so a5 and its sub-record come out of an instruction.
    const ptr = rd32(0x81b62a);
    if (ptr === 0) continue;
    const a5 = ptr - 0x16;
    const a6 = rd32(a5 + 0x06);
    seen.add(a6);
    if ((rd16(a6) & 0x8000) === 0) continue;
    alive++;
    const d0 = u16(u16(rd16(a6 + 0x02) + 0x2800) + rd16(a6 + 0x10));
    const d1 = u16(u16(rd16(a6 + 0x02) + 0x2800) - rd16(a6 + 0x12));
    if (d0 >= 0x8000) farHigh++;
    if (d1 >= 0x8000) nearHigh++;
  }
  assert.deepEqual([...seen], [0x81523c], 'the board names ONE sub-record');
  assert.ok(alive >= 40, `${alive} checkpoints with the boss live`);
  assert.equal(farHigh, alive,
    `the biased FAR edge is >= $8000 on ${farHigh} of ${alive} -- i16 reads it `
    + 'NEGATIVE on every single one');
  assert.ok(nearHigh < alive, 'the NEAR edge is not, on at least one, which is '
    + 'what makes comparison 1 disagree rather than agree by accident');
});

// ---------------------------------------------------------------------------
// 3.  THE BEHAVIOUR.  A bench whose numbers are all derived above.
// ---------------------------------------------------------------------------
//
// FOUR beam segments at raw Y $6000/$5700/$4000/$3000, X $1CB5, half-extents
// $200 on Y and $100 on X.  Biased, the box is
//   maxX $45B5  minX $43B5  maxY $8A00  minY $5600
// and the two upper segments' own far edges ($8A00, $8100) are past $8000,
// which is the whole point: the beam is as negative-when-signed as the target.

const SEG_Y = [0x6000, 0x5700, 0x4000, 0x3000];
const SEG_X = 0x1cb5;
/** the board's own stage-1 boss sub-record, `$81523C` at lf9,000, verbatim. */
const BOSS = { flags: 0xa001, y: 0x697d, x: 0x1cb5, hp: 0x7fff,
  ext: [0x0e00, 0x1780, 0x0800, 0x0800] };

function clearRec(ram, a) {
  for (let k = 0; k < 0x20; k += 2) ram.setU16(a + k, 0);
}
function planted(ram, a, { flags, y, x, hp, ext }) {
  clearRec(ram, a);
  ram.setU16(a + 0x00, flags);
  ram.setU16(a + 0x02, y);
  ram.setU16(a + 0x04, x);
  for (let k = 0; k < 4; k++) ram.setU16(a + 0x10 + k * 2, ext[k]);
  ram.setU16(a + 0x18, hp);
  return a;
}
function bench(segs = SEG_Y) {
  const ram = new Ram(null);
  ram.setU16(RAM.player1 + P.posY, 0x1179);   // $2457CE's ($2,A4)
  ram.setU16(BOMBRAM.hitMask, 0);             // $80FA72, or'd in at $24580E
  segs.forEach((y, i) => {
    const a = BOMBRAM.rec + (i + 1) * BOMBRAM.stride;
    ram.setU16(a + 0x00, 0x8000);             // $245788 move.b (A6),D4 / bpl,
    ram.setU16(a + 0x02, y);                  // and bit 1 CLEAR ($24578C btst)
    ram.setU16(a + 0x04, SEG_X);
    ram.setU16(a + 0x10, 0x0200); ram.setU16(a + 0x12, 0x0200);
    ram.setU16(a + 0x14, 0x0100); ram.setU16(a + 0x16, 0x0100);
  });
  // $245622 / $24562C -- the CALLER's two writes, which $2456A6 does not make.
  ram.setU16(BOMBRAM.g12952, 0x7800);
  ram.setU32(BOMBRAM.g12954, 0);
  return ram;
}

test('the beam box is built over all 45 records and is what the pools are '
  + 'asked about', () => {
  const ram = bench();
  bombDamageAlt2456A6(ram, {}, RAM.player1);
  const box = [0, 1, 2, 3].map((k) => ram.u16(BOMBRAM.box + k * 2));
  // seeds $F800/$4000/$F800/$7C00 taken SIGNED, then all four biased +$2800.
  assert.deepEqual(box, [0x45b5, 0x43b5, 0x8a00, 0x5600]);
  assert.ok(box[2] >= 0x8000, 'the box itself crosses $8000');
});

test('POOL B: the board\'s own boss record takes the ONE $208 hit, and '
  + '$812952/$812954 name it', () => {
  const ram = bench();
  const a5 = planted(ram, 0x81523c, BOSS);
  const r = bombDamageAlt2456A6(ram, {}, RAM.player1);

  // READ THE RECORDS BACK, not the counter.
  assert.equal(ram.u32(BOMBRAM.g12954), a5,
    '$812954 must name the boss; 0 means $2457FA took its `beq` and nothing '
    + 'was hit at all -- that is the D43 symptom');
  // $2457C2: D4 = D1 - D6 = the UN-biased near edge, floored at ($2,A4)+$C00.
  assert.equal(ram.u16(BOMBRAM.g12952), u16(BOSS.y - BOSS.ext[1]));
  assert.equal(ram.u16(BOMBRAM.g12952), 0x51fd);
  assert.ok(0x51fd > 0x1179 + 0xc00, 'and the floor did NOT bite here');
  // $245808/$24580E: the mask OR $400; $245814: subi.w #$208.
  assert.equal(ram.u16(a5), BOSS.flags | 0x400);
  assert.equal(ram.u16(a5 + 0x18), u16(BOSS.hp - 0x208));
  assert.equal(ram.u16(a5 + 0x18), 0x7df7);
  assert.equal(r.hitsB, 1, 'EXACTLY one, and never more -- $2457FA is not a loop');
});

test('...and it is comparison 1 that used to reject it: the boss\'s biased FAR '
  + 'edge is $9F7D and the beam\'s is $8A00', () => {
  const ram = bench();
  planted(ram, 0x81523c, BOSS);
  const d6 = 0x2800;
  const d0 = u16(u16(BOSS.y + d6) + BOSS.ext[0]);
  const d1 = u16(u16(BOSS.y + d6) - BOSS.ext[1]);
  assert.equal(d0, 0x9f7d);
  assert.equal(d1, 0x79fd);
  assert.ok(d0 >= 0x8000 && d1 < 0x8000,
    'the pair STRADDLES $8000, which is why signed and unsigned differ');
  assert.ok(d1 < 0x9800, '$245776 lets it through, so the reject was not there');
  // segment 1's far edge, the value comparison 1 puts against d1.
  const d4y = u16(u16(SEG_Y[0] + d6) + 0x200);
  assert.equal(d4y, 0x8a00);
  assert.ok(d4y >= d1, 'UNSIGNED: the segment reaches the boss');
  assert.ok(((d4y ^ 0x8000) - 0x8000) < ((d1 ^ 0x8000) - 0x8000),
    'SIGNED: it does not -- and that one line was the whole of D43');
});

test('POOL A: EVERY intersecting record is hit for $1E0, and the beam record '
  + 'takes $2458D8\'s bit 4', () => {
  const ram = bench();
  planted(ram, 0x81523c, BOSS);
  // slot 0 -- far edge $8800 (past $8000), near edge $7400 (not), raw Y $5000
  // so it is NEARER than the boss's $51FD and is NOT shadowed by $812952.
  const near = planted(ram, BOMBRAM.poolA, { flags: 0xa000, y: 0x5000,
    x: SEG_X, hp: 0x7fff, ext: [0x1000, 0x0400, 0x0800, 0x0800] });
  // slot 1 -- entirely below $8000.  THE CONTROL: it hits either way, so a
  // green here is not evidence and a red here means the bench is wrong.
  const low = planted(ram, BOMBRAM.poolA + BOMBRAM.poolAStride, { flags: 0xa000,
    y: 0x4000, x: SEG_X, hp: 0x7fff, ext: [0x0400, 0x0400, 0x0800, 0x0800] });

  const r = bombDamageAlt2456A6(ram, {}, RAM.player1);
  assert.equal(ram.u16(near + 0x18), u16(0x7fff - 2 * 0x1e0),
    'segments 1 and 2 both reach it: 2 x $1E0');
  assert.equal(ram.u16(near + 0x18), 0x7c3f);
  assert.equal(ram.u16(near), 0xa000 | 0x400);
  assert.equal(ram.u16(low + 0x18), u16(0x7fff - 0x1e0), 'segment 3 only');
  assert.equal(r.hitsA, 3);
  // $2458D8 bset #$4,(A6) -- on the BEAM record, not the enemy.
  assert.equal(ram.u8(BOMBRAM.rec + 1 * BOMBRAM.stride), 0x90);
  assert.equal(ram.u8(BOMBRAM.rec + 2 * BOMBRAM.stride), 0x90);
  assert.equal(ram.u8(BOMBRAM.rec + 4 * BOMBRAM.stride), 0x80, 'segment 4 hit nothing');
});

test('...and $245886 SHADOWS pool A behind the pool-B target', () => {
  const ram = bench();
  planted(ram, 0x81523c, BOSS);
  // the same record as above but at raw Y $6000, i.e. BEHIND $812952 = $51FD.
  const behind = planted(ram, BOMBRAM.poolA, { flags: 0xa000, y: 0x6000,
    x: SEG_X, hp: 0x7fff, ext: [0x1000, 0x0400, 0x0800, 0x0800] });
  bombDamageAlt2456A6(ram, {}, RAM.player1);
  assert.equal(ram.u32(BOMBRAM.g12954), 0x81523c, 'the boss is still the target');
  assert.equal(ram.u16(behind + 0x18), 0x7fff,
    'nothing behind the nearest pool-B record is damaged -- $245886/$24588E');
  assert.equal(ram.u16(behind), 0xa000, 'and it takes no hit bit either');
});

test('THE BULLETS: $2459B2/$2459B6 erase one whose biased point is below '
  + '$8000 while the segment\'s far edge is above it', () => {
  // no pool-B target, so `$245942 tst.w $812954 / beq` skips the shadow.
  const ram = bench([0x5700]);
  const a = BOMBRAM.rec + BOMBRAM.stride;
  ram.setU16(a + 0x10, 0x0400); ram.setU16(a + 0x12, 0x0400);
  const b = BOMBRAM.bulletPool + 2;             // $245902 lea $817F8E
  ram.setU16(BOMBRAM.bulletPool, 0x1234);       // the word $2459B2 clears
  ram.setU16(b + 0x00, 0x5700);                 // raw Y; bit 15 clear or bmi skips
  ram.setU16(b + 0x02, SEG_X);
  const r = bombDamageAlt2456A6(ram, {}, RAM.player1);
  const d0 = u16(0x5700 + 0x2800);
  const d4y = u16(u16(0x5700 + 0x2800) + 0x400);
  assert.equal(d0, 0x7f00);
  assert.equal(d4y, 0x8300);
  assert.ok(d4y >= d0 && ((d4y ^ 0x8000) - 0x8000) < d0,
    'the pair straddles $8000 the same way pool B\'s does');
  assert.equal(r.erased, 1);
  assert.equal(ram.u16(BOMBRAM.bulletPool), 0, '$2459B2 clr.w (-$2,A5)');
  assert.equal(ram.u16(b), 0xffff, '$2459B6 move.w #$FFFF,(A5)');
});

test('the arming test is the record\'s OWN bit 7 and bit 1, and a PARKED head '
  + 'does no damage', () => {
  const ram = bench();
  const a5 = planted(ram, 0x81523c, BOSS);
  // $24578C btst #$1,D4 / bne -- $2562FC/$256348's park bit.
  for (let i = 0; i < SEG_Y.length; i++) {
    const a = BOMBRAM.rec + (i + 1) * BOMBRAM.stride;
    ram.setU16(a, u16(ram.u16(a) | 0x0200));
  }
  const r = bombDamageAlt2456A6(ram, {}, RAM.player1);
  assert.equal(r.hitsB, 0);
  assert.equal(ram.u32(BOMBRAM.g12954), 0);
  assert.equal(ram.u16(a5 + 0x18), BOSS.hp, 'parked: the boss takes nothing');
  // ...but the BOX is still built from them ($2456C6 tests bit 15 only), which
  // is why "the box is empty" and "no record is armed" are different faults.
  assert.equal(ram.u16(BOMBRAM.box + 4), 0x8a00);
  assert.equal(r.boxLive, SEG_Y.length);
});

test('the segment walk is records 1..41, never record 0 and never 42..44',
  () => {
    assert.equal(BEAM_REC.segs, 41);
    // $245780 lea ($30,A6),A6 off the record base, then move.w #$28,D7 -> 41.
    const ram = bench([]);
    // record 0 alone, armed and exactly where the boss is: pool B must still
    // find nothing, because $245780 starts at record 1.
    ram.setU16(BOMBRAM.rec, 0x8000);
    ram.setU16(BOMBRAM.rec + 0x02, 0x6000);
    ram.setU16(BOMBRAM.rec + 0x04, SEG_X);
    ram.setU16(BOMBRAM.rec + 0x10, 0x0200); ram.setU16(BOMBRAM.rec + 0x12, 0x0200);
    ram.setU16(BOMBRAM.rec + 0x14, 0x0100); ram.setU16(BOMBRAM.rec + 0x16, 0x0100);
    const a5 = planted(ram, 0x81523c, BOSS);
    const r = bombDamageAlt2456A6(ram, {}, RAM.player1);
    assert.equal(r.hitsB, 0);
    assert.equal(ram.u16(a5 + 0x18), BOSS.hp);
    // and pool A DOES walk record 0 ($245898 starts at the base), so the two
    // walks really are different and this is not a bench artefact.
    const p = planted(ram, BOMBRAM.poolA, { flags: 0xa000, y: 0x5000,
      x: SEG_X, hp: 0x7fff, ext: [0x1000, 0x0400, 0x0800, 0x0800] });
    ram.setU16(BOMBRAM.g12952, 0x7800);
    ram.setU32(BOMBRAM.g12954, 0);
    bombDamageAlt2456A6(ram, {}, RAM.player1);
    assert.equal(ram.u16(p + 0x18), u16(0x7fff - 0x1e0));
  });
