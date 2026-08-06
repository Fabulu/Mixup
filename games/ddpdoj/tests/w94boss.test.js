// W94 -- THE STAGE-1 BOSS'S MOVEMENT LAYER, and the four scheduler accessors
// W62 did not ship.
//
// WHAT THESE EXIST FOR.  43 of `stage1-sweep`'s 71 segments are BLOCKED on the
// boss's own scripts.  [M] this wave resolved all 72 rungs' slots through the
// real tables in `$2596C6`'s walk order and found the 43 are TWO populations:
// 28 rungs (lf12,000..18,750) whose whole union is TWELVE entry points, and 15
// (the arrival) needing 22 more.  MAIN 6 and MAIN 7 are two of the twelve, and
// `$29314C` -- the tail every MAIN entry ends in -- is shared by all nine.
//
// SHAPE, following W62's, W79's and W82's.  **Every expected value below is
// derived from the LISTING quoted in `src/bossscripts.js`, never from running
// the port.**  Nothing here writes a constant and reads it back through the same
// constant (`docs/knowledge/03`).  Throw assertions pin `e.romAddress`, never
// the text.
//
// THE RED HALF drives the SHIPPED seam (`W94_MUTATE`, W79's device), so it
// needs no source edit and cannot rot away from the green half.  Every mutation
// `tools/breakage.mjs` declares for this wave is driven red HERE, because
// [M] none of them can bite on any ladder this repo holds -- MAIN 6 and 7 run
// only while the boss is alive, and every such rung is still blocked on the
// other ten of the twelve.  That is stated in the worklog rather than reported
// as a green.
//
// The tests SKIP LOUDLY when the export is absent.  A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import {
  W94, W94_MUTATE, BS, LIMB_RING, dist242494, bodyTail29314C,
  pickWaypoint2933DE, rampSpeed293400, main6Init2935DE, main6Step2935E8,
  main7Init293634, main7Step293642,
} from '../src/bossscripts.js';
import {
  SCHED, scriptAddresses, a1Start259A18, a1Running259A4A, seqCurrent2598C8,
  spread2595F2,
} from '../src/scheduler.js';
import { bossA5, bossA6 } from '../src/boss.js';
import { MUTATIONS, W94_EXPECTED_GREEN } from '../tools/breakage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const A5 = 0x81378c;                    // the boss's RECORD, as W82's gate derives it
const A6 = 0x81523c;                    // ...and its sub-record
const A4 = SCHED.seqDst;                // $81298C -- the MAIN sequencer's block

function fresh() {
  const ram = new Ram();
  ram.setU32(A5 + 0x06, A6);            // ($6,A5) -> the sub-record, for $2417DE
  const ctx = {
    rom: ROM, tables: MT, unportedLog: new UnportedLog(),
    bossSubRec: A6, bossRec: A5,
  };
  return { ram, ctx };
}

test.afterEach(() => { W94_MUTATE.value = null; });

// ======================================================= $242494, THE DISTANCE

test('$242494 is max + min/2 with the Y axis scaled to THREE QUARTERS', () => {
  // Derived from the listing: `lsr.w #$2 / sub.w` is `d - d/4`; there is no
  // matching pair on X.  A pure-X separation is therefore unscaled...
  assert.equal(dist242494(0, 0x100, 0, 0), 0x100);
  // ...and a pure-Y separation of the same size is three quarters of it.
  assert.equal(dist242494(0x100, 0, 0, 0), 0x100 - (0x100 >>> 2));
  // Mixed: dy=$100 -> $C0, dx=$40 -> the minor axis, halved.
  assert.equal(dist242494(0x100, 0x40, 0, 0), 0xc0 + 0x20);
  // ...and the same the other way round, to pin the max/min choice itself.
  assert.equal(dist242494(0x40, 0x100, 0, 0), 0x100 + (0x30 >>> 1));
});

test('$242494 takes the ABSOLUTE value on both axes ($24249E/$2424AA neg.w)', () => {
  assert.equal(dist242494(0, 0, 0, 0x100), dist242494(0, 0x100, 0, 0));
  assert.equal(dist242494(0, 0, 0x100, 0), dist242494(0x100, 0, 0, 0));
});

test('$242494 works in SIGNED WORDS -- a separation of $F000 is -$1000', () => {
  // `$24249C bpl.b` tests the WORD's sign bit, so a difference of $F000 is
  // negated to $1000 rather than kept as 61,440.  A port that took the absolute
  // value of an unsigned number would report a boss sixteen times further away
  // than it is, and MAIN 6 would never hand over.
  assert.equal(dist242494(0, 0xf000, 0, 0x0000), 0x1000);
  assert.equal(dist242494(0, 0x1000, 0, 0x0000), 0x1000);
});

test('dist-no-aspect goes RED -- it drops the Y three-quarter scaling', () => {
  const clean = dist242494(0x100, 0, 0, 0);
  W94_MUTATE.value = 'dist-no-aspect';
  assert.notEqual(dist242494(0x100, 0, 0, 0), clean);
  assert.equal(dist242494(0x100, 0, 0, 0), 0x100);
});

// ============================================== $29314C, THE RING AND THE LIMBS

test('the ring is FIVE longwords and $81585C is the newest, $81586C the oldest',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU8(A6 + BS.p1Dead, 1);       // both parts dead: isolate the ring
    ram.setU8(A6 + BS.p2Dead, 1);
    // Five distinct positions, five frames.
    const seen = [0x11110000, 0x22220000, 0x33330000, 0x44440000, 0x55550000];
    for (const p of seen) {
      ram.setU32(A6 + BS.pos, p);
      bodyTail29314C(ram, ctx, A6);
    }
    // $81585C holds the LAST one written; $81586C holds the one five frames back.
    assert.equal(ram.u32(LIMB_RING.newest), seen[4]);
    assert.equal(ram.u32(LIMB_RING.oldest), seen[0]);
    assert.equal(ram.u32(LIMB_RING.newest + 4), seen[3]);
    assert.equal(ram.u32(LIMB_RING.oldest - 4), seen[1]);
  });

test('ring-reversed goes RED -- the arms would LEAD the body, not trail it',
  { skip: SKIP }, () => {
    const run = () => {
      const { ram, ctx } = fresh();
      ram.setU8(A6 + BS.p1Dead, 1); ram.setU8(A6 + BS.p2Dead, 1);
      for (const p of [0x11110000, 0x22220000, 0x33330000, 0x44440000, 0x55550000]) {
        ram.setU32(A6 + BS.pos, p);
        bodyTail29314C(ram, ctx, A6);
      }
      return ram.u32(LIMB_RING.oldest);
    };
    const clean = run();
    W94_MUTATE.value = 'ring-reversed';
    assert.notEqual(run(), clean);
  });

test('$29314C computes the SHADOW longword: pos + ($a6,A6) + $E0000000',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU8(A6 + BS.p1Dead, 1); ram.setU8(A6 + BS.p2Dead, 1);
    ram.setU32(A6 + BS.pos, 0x12345678);
    ram.setU32(A6 + BS.shadowSrc, 0x00010001);
    bodyTail29314C(ram, ctx, A6);
    assert.equal(ram.u32(A6 + BS.shadow),
      (0x12345678 + 0x00010001 + 0xe0000000) >>> 0);
  });

test('a DESTROYED part is skipped entirely ($293176 / $2931BC tst.b)',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU8(A6 + BS.p1Dead, 1);
    ram.setU8(A6 + BS.p2Dead, 1);
    ram.setU32(A6 + BS.p1Pos, 0xdeadbeef);
    ram.setU32(A6 + BS.p2Pos, 0xfeedface);
    bodyTail29314C(ram, ctx, A6);
    assert.equal(ram.u32(A6 + BS.p1Pos), 0xdeadbeef);
    assert.equal(ram.u32(A6 + BS.p2Pos), 0xfeedface);
  });

test('the two part blocks are MIRRORED: +$80 on one low word, -$80 on the other',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    // Speed index 0 makes `$241D34` return (0,0), so the ONLY difference left
    // between the two blocks is the `addi.w` constant -- which is the point.
    ram.setU8(A6 + BS.p1Spd, 0); ram.setU8(A6 + BS.p2Spd, 0);
    ram.setU32(A6 + BS.pos, 0x40004000);
    bodyTail29314C(ram, ctx, A6);
    const lo1 = ram.u16(A6 + BS.p1Lo);
    const lo2 = ram.u16(A6 + BS.p2Lo);
    assert.equal((lo1 - lo2) & 0xffff, 0x0100);   // $80 - (-$80)
  });

test('tail-both-plus80 goes RED -- it copies block 1 twice', { skip: SKIP }, () => {
  const run = () => {
    const { ram, ctx } = fresh();
    ram.setU8(A6 + BS.p1Spd, 0); ram.setU8(A6 + BS.p2Spd, 0);
    ram.setU32(A6 + BS.pos, 0x40004000);
    bodyTail29314C(ram, ctx, A6);
    return ram.u16(A6 + BS.p2Lo);
  };
  const clean = run();
  W94_MUTATE.value = 'tail-both-plus80';
  assert.notEqual(run(), clean);
});

test('tail-same-shift goes RED -- X is asl #2, not asl #1', { skip: SKIP }, () => {
  const run = () => {
    const { ram, ctx } = fresh();
    // A speed/angle pair whose X component is non-zero, so the shift can show.
    ram.setU8(A6 + BS.p1Spd, 8); ram.setU8(A6 + BS.p1Ang, 0x10);
    ram.setU8(A6 + BS.p2Dead, 1);
    ram.setU32(A6 + BS.pos, 0x40004000);
    bodyTail29314C(ram, ctx, A6);
    return ram.u16(A6 + BS.p1Lo);
  };
  const clean = run();
  W94_MUTATE.value = 'tail-same-shift';
  assert.notEqual(run(), clean);
});

// ================================================ $2933DE, THE WAYPOINT DRAW

test('$2933DE makes TWO RNG draws and both step $803917', { skip: SKIP }, () => {
  const { ram } = fresh();
  const before = ram.u8(0x803917);
  pickWaypoint2933DE(ram, ROM, A4);
  assert.equal(ram.u8(0x803917), (before + 2) & 0xff);
});

test('$2933DE writes (rnd & 7) * 4 -- one of the EIGHT waypoint indices',
  { skip: SKIP }, () => {
    const seen = new Set();
    for (let i = 0; i < 256; i++) {
      const { ram } = fresh();
      ram.setU8(0x803917, i);            // walk the whole RNG cursor
      pickWaypoint2933DE(ram, ROM, A4);
      const idx = ram.u16(A4);
      assert.ok(idx % 4 === 0 && idx <= 0x1c,
        `index $${idx.toString(16)} is outside the $20-byte window`);
      seen.add(idx);
      // ...and the speed target is 2..5 ($2933F4 andi.b #$3 / addq.b #$2)
      const spd = ram.u8(A4 + 2);
      assert.ok(spd >= 2 && spd <= 5, `speed target ${spd}`);
    }
    assert.equal(seen.size, 8, 'all eight waypoint indices must be reachable');
  });

test('pick-one-draw goes RED -- it steps the SHARED RNG once instead of twice',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    W94_MUTATE.value = 'pick-one-draw';
    const before = ram.u8(0x803917);
    pickWaypoint2933DE(ram, ROM, A4);
    assert.equal(ram.u8(0x803917), (before + 1) & 0xff);
  });

test('the $293694 window is $20 bytes and every index it admits is inside it',
  { skip: SKIP }, () => {
    for (let i = 0; i <= 0x1c; i += 4) {
      assert.equal(typeof ROM.u16(W94.waypoints293694 + i), 'number');
      assert.equal(typeof ROM.u16(W94.waypoints293694 + i + 2), 'number');
    }
    // ...and one word past the end is a LOUD NAMED THROW, not a zero.
    assert.throws(() => ROM.u16(W94.waypoints293694 + 0x20),
      (e) => e instanceof Unreached);
  });

test('the eight waypoints cluster around MAIN 6\'s own target', { skip: SKIP }, () => {
  // NOT a value this port chose: it is the arithmetic agreeing with itself.
  // MAIN 6 walks to ($7400,$1C00) and hands over; if the waypoints were
  // anywhere else the two scripts would be about different places.
  for (let i = 0; i <= 0x1c; i += 4) {
    const y = ROM.u16(W94.waypoints293694 + i);
    const x = ROM.u16(W94.waypoints293694 + i + 2);
    assert.ok(Math.abs(y - W94.main6TargetY) <= 0x200, `waypoint Y $${y.toString(16)}`);
    assert.ok(Math.abs(x - W94.main6TargetX) <= 0x800, `waypoint X $${x.toString(16)}`);
  }
});

// ================================================== $293400, THE SPEED RAMP

test('$293400 moves the speed byte ONE step per frame, never a jump',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    ram.setU8(A4 + 2, 20);
    ram.setU8(A6 + BS.speed, 0);
    for (let i = 1; i <= 20; i++) {
      rampSpeed293400(ram, A4, A6);
      assert.equal(ram.u8(A6 + BS.speed), i);
    }
    rampSpeed293400(ram, A4, A6);            // ...and then it STAYS
    assert.equal(ram.u8(A6 + BS.speed), 20);
  });

test('$293400 ramps DOWN too, and $29340E bgt is SIGNED', { skip: SKIP }, () => {
  const { ram } = fresh();
  ram.setU8(A4 + 2, 2);
  ram.setU8(A6 + BS.speed, 5);
  rampSpeed293400(ram, A4, A6);
  assert.equal(ram.u8(A6 + BS.speed), 4);
  // $90 is NEGATIVE as a signed byte, so it ramps UP toward a target of 2.
  ram.setU8(A6 + BS.speed, 0x90);
  rampSpeed293400(ram, A4, A6);
  assert.equal(ram.u8(A6 + BS.speed), 0x91);
});

test('ramp-unsigned goes RED on exactly the bytes >= $80', { skip: SKIP }, () => {
  const { ram } = fresh();
  ram.setU8(A4 + 2, 2);
  ram.setU8(A6 + BS.speed, 0x90);
  W94_MUTATE.value = 'ramp-unsigned';
  rampSpeed293400(ram, A4, A6);
  assert.equal(ram.u8(A6 + BS.speed), 0x8f);   // the WRONG way
});

// ======================================================== MAIN 6 AND MAIN 7

test('MAIN 6\'s INIT clears (a4) and seeds the ramp target from the LIVE speed',
  { skip: SKIP }, () => {
    const { ram } = fresh();
    ram.setU16(A4, 0xbeef);
    ram.setU8(A6 + BS.speed, 0x0d);
    main6Init2935DE(ram, A4, A6);
    assert.equal(ram.u16(A4), 0);
    assert.equal(ram.u8(A4 + 2), 0x0d);
  });

test('MAIN 6 snaps the facing (no slew) and starts MAIN 7 only when CLOSE',
  { skip: SKIP }, () => {
    const far = fresh();
    // Far ENOUGH -- but inside the arena.  A distance past $4000 makes
    // `$29360E`'s speed target negative and `$293400` walks the speed byte to
    // $FF, which is an unexported level and an honest throw; the boss cannot be
    // there, and `tests/...` must not pretend it can (see bossscripts.js).
    far.ram.setU16(A6 + BS.posY, W94.main6TargetY - 0x1000);
    far.ram.setU16(A6 + BS.posX, W94.main6TargetX - 0x0800);
    far.ram.setU8(A6 + BS.p1Dead, 1); far.ram.setU8(A6 + BS.p2Dead, 1);
    main6Step2935E8(far.ram, ROM, far.ctx, A4, A5, A6);
    assert.equal(far.ram.u16(SCHED.seqRestart), 0, 'far away: no hand-over');

    const near = fresh();
    near.ram.setU16(A6 + BS.posY, W94.main6TargetY);
    near.ram.setU16(A6 + BS.posX, W94.main6TargetX + 0x40);
    near.ram.setU8(A6 + BS.p1Dead, 1); near.ram.setU8(A6 + BS.p2Dead, 1);
    main6Step2935E8(near.ram, ROM, near.ctx, A4, A5, A6);
    assert.equal(near.ram.u16(SCHED.seqRestart), 1, '$2598D0 armed');
    assert.equal(near.ram.u16(SCHED.seqPending), 7, '...on MAIN script 7');
  });

test('MAIN 6\'s speed TARGET is the distance over 128 ($29360E lsr.w #$7)',
  { skip: SKIP }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(A6 + BS.posY, W94.main6TargetY);
    ram.setU16(A6 + BS.posX, 0x0c00);           // dx = $1000, dy = 0
    ram.setU8(A6 + BS.p1Dead, 1); ram.setU8(A6 + BS.p2Dead, 1);
    const d = dist242494(W94.main6TargetY, 0x0c00, W94.main6TargetY, W94.main6TargetX);
    main6Step2935E8(ram, ROM, ctx, A4, A5, A6);
    assert.equal(ram.u8(A4 + 2), (d >>> 7) & 0xff);
  });

test('main6-unsigned-arrive goes RED on a distance that reads NEGATIVE',
  { skip: SKIP }, () => {
    // $242494 truncates to a word, so a separation past $8000 arrives NEGATIVE
    // and the ROM's signed `bgt` takes the ARRIVED arm.
    const mk = () => {
      const f = fresh();
      f.ram.setU16(A6 + BS.posY, W94.main6TargetY);
      // dx = $9000 reads as -$7000 through `$2424AA neg.w`, and $7000 * 1 is
      // still under $8000 -- so the DISTANCE itself must be pushed past $8000
      // on the Y axis, where the three-quarter scaling still leaves it negative.
      f.ram.setU16(A6 + BS.posX, (W94.main6TargetX + 0x7000) & 0xffff);
      f.ram.setU16(A6 + BS.posY, (W94.main6TargetY + 0x7ff0) & 0xffff);
      f.ram.setU8(A6 + BS.p1Dead, 1); f.ram.setU8(A6 + BS.p2Dead, 1);
      return f;
    };
    const a = mk();
    main6Step2935E8(a.ram, ROM, a.ctx, A4, A5, A6);
    const clean = a.ram.u16(SCHED.seqRestart);
    W94_MUTATE.value = 'main6-unsigned-arrive';
    const b = mk();
    main6Step2935E8(b.ram, ROM, b.ctx, A4, A5, A6);
    assert.notEqual(b.ram.u16(SCHED.seqRestart), clean);
  });

test('MAIN 7\'s INIT draws a waypoint -- $29363E bsr $2933DE', { skip: SKIP }, () => {
  const { ram } = fresh();
  const before = ram.u8(0x803917);
  main7Init293634(ram, ROM, A4, A6);
  assert.equal(ram.u16(A4) % 4, 0);
  assert.equal(ram.u8(0x803917), (before + 2) & 0xff);
});

test('MAIN 7 SLEWS the facing one step; MAIN 6 snaps it', { skip: SKIP }, () => {
  // The two scripts differ by exactly `$29365E jsr $242190`, and this is that
  // difference expressed as behaviour rather than as an address.
  const seven = fresh();
  seven.ram.setU16(A4, 0);                       // waypoint [0]
  seven.ram.setU16(A6 + BS.posY, W94.main6TargetY - 0x1000);
  seven.ram.setU16(A6 + BS.posX, W94.main6TargetX - 0x0800);
  seven.ram.setU8(A6 + BS.facing, 0);
  seven.ram.setU8(A6 + BS.p1Dead, 1); seven.ram.setU8(A6 + BS.p2Dead, 1);
  main7Step293642(seven.ram, ROM, seven.ctx, A4, A5, A6);
  const slewed = seven.ram.u8(A6 + BS.facing);

  const six = fresh();
  six.ram.setU16(A6 + BS.posY, W94.main6TargetY - 0x1000);
  six.ram.setU16(A6 + BS.posX, W94.main6TargetX - 0x0800);
  six.ram.setU8(A6 + BS.facing, 0);
  six.ram.setU8(A6 + BS.p1Dead, 1); six.ram.setU8(A6 + BS.p2Dead, 1);
  main6Step2935E8(six.ram, ROM, six.ctx, A4, A5, A6);
  const snapped = six.ram.u8(A6 + BS.facing);

  // One slew step is at most 1 away from where it started; the snap is not.
  assert.ok(Math.abs(((slewed - 0) << 24 >> 24)) <= 1, `slew went to ${slewed}`);
  assert.notEqual(snapped, slewed);
});

test('main7-stale-target is EXPECTED GREEN, and its output is BYTE-IDENTICAL',
  { skip: SKIP }, () => {
    // W82's `obj3-unsigned-ac` precedent.  This wave's first draft claimed the
    // re-read at `$293672` mattered; [M] it does not -- `(A4)` is only ever READ
    // inside `$293642..$293690` (`$293648` and `$293678`, both `adda.w`), and
    // none of the four callees writes it.  So the mutation is declared
    // expected-green in `tools/breakage.mjs` WITH the measurement, and the
    // assertion here is EQUALITY over every byte the step touches -- which is a
    // much stronger statement than "the gate stayed green".
    assert.ok(W94_EXPECTED_GREEN['main7-stale-target'],
      'the expected-green declaration must exist BEFORE the run');
    const run = (mut) => {
      W94_MUTATE.value = mut;
      const f = fresh();
      f.ram.setU16(A4, 0x0c);                    // waypoint [3]
      f.ram.setU16(A6 + BS.posY, W94.main6TargetY - 0x0300);
      f.ram.setU16(A6 + BS.posX, W94.main6TargetX + 0x0180);
      f.ram.setU8(A6 + BS.speed, 0x20);
      f.ram.setU8(A6 + BS.facing, 0x30);
      main7Step293642(f.ram, ROM, f.ctx, A4, A5, A6);
      W94_MUTATE.value = null;
      // Everything the step can have written: the block, the sub-record, the
      // ring, and the RNG cursor.
      const out = [];
      for (let o = 0; o < 0x20; o++) out.push(f.ram.u8(A4 + o));
      for (let o = 0; o < 0x120; o++) out.push(f.ram.u8(A6 + o));
      for (let a = LIMB_RING.newest; a <= LIMB_RING.oldest; a += 4) {
        out.push(f.ram.u32(a));
      }
      out.push(f.ram.u16(0x803916));
      return out.join(',');
    };
    assert.equal(run('main7-stale-target'), run(null));
  });

test('...and the re-read really is only READS: (A4) is never written in the step',
  { skip: SKIP }, () => {
    // The measurement behind the declaration, asserted against the CARTRIDGE so
    // it cannot rot: every `move`/`clr` with `(A4)` as a DESTINATION inside
    // `$293642..$293690` would be a word write to $81298C.  There are none, and
    // the two `adda.w (A4),A0` are `D0 D4`.
    const img = path.join(HERE, '..', 'tools', 'oracle', 'out', 'maincpu.bin');
    if (!fs.existsSync(img)) return;               // the image is gitignored
    const fd = fs.openSync(img, 'r');
    const b = Buffer.alloc(W94.main7Step - 0x293642 + 0x50);
    fs.readSync(fd, b, 0, b.length, 0x293642);
    fs.closeSync(fd);
    let adda = 0;
    for (let i = 0; i + 1 < b.length; i += 2) {
      const w = (b[i] << 8) | b[i + 1];
      if (w === 0xd0d4) adda++;                    // adda.w (A4),A0
      // `move.w Dn,(A4)` is $3884..$3887, `clr.w (A4)` is $4254 -- the two
      // shapes a write to the block's first word can take.
      assert.notEqual(w, 0x4254, `clr.w (a4) at $${(0x293642 + i).toString(16)}`);
      assert.ok(w < 0x3884 || w > 0x3887,
        `move.w Dn,(a4) at $${(0x293642 + i).toString(16)}`);
    }
    assert.equal(adda, 2, 'exactly two `adda.w (A4),A0` -- the two READS');
  });

// ================================== THE REGISTRY, AND THE THROWS THAT REMAIN

test('all four MAIN 6/7 entry points are registered', { skip: SKIP }, () => {
  const reg = new Set(scriptAddresses());
  for (const a of [W94.main6Init, W94.main6Step, W94.main7Init, W94.main7Step]) {
    assert.ok(reg.has(a), `$${a.toString(16).toUpperCase()} is not registered`);
  }
});

test('the steady state\'s CLOSED SET OF TWELVE is now COMPLETE (W95)', () => {
    // W94 wrote this as "the OTHER ten are STILL LOUD NAMED THROWS", to say the
    // wave's scope out loud rather than describe it.  **IT WENT RED THE MOMENT
    // W95 REGISTERED THEM, which is the test working**, and the claim it makes
    // is now the opposite one and worth keeping: the twelve are a CLOSED SET,
    // so either all of them are registered or the set is not closed.  The set
    // itself is unchanged -- it is W94 §3A's table, address for address.
    const reg = new Set(scriptAddresses());
    for (const a of [0x29556c, 0x295626, 0x2956f6, 0x295120, 0x293432,
      0x29359e, 0x294ac0, 0x295948, 0x295ae0, 0x296614,
      W94.main6Step, W94.main7Step]) {
      assert.ok(reg.has(a),
        `$${a.toString(16).toUpperCase()} is one of the twelve and is NOT `
        + 'registered -- the steady state cannot be oracled as a subset');
    }
  });

test('a MAIN script dispatched with no A5/A6 published throws BY ADDRESS',
  { skip: SKIP }, () => {
    assert.throws(() => bossA5({}, 0x2935e8),
      (e) => e instanceof Unreached && e.romAddress === 0x2935e8);
    assert.throws(() => bossA6({}, 0x293642),
      (e) => e instanceof Unreached && e.romAddress === 0x293642);
  });

// ============================= THE FOUR SCHEDULER ACCESSORS W62 DID NOT SHIP

test('$259A18 RETURNS THE SLOT ADDRESS -- F6 writes parameters through it', () => {
  const ram = new Ram();
  const at = a1Start259A18(ram, 0x0d);
  assert.equal(at, SCHED.a1Base);
  assert.equal(ram.u16(at), 0x800d);
  // ...and the caller's write lands in that slot, which is the whole reason
  // the return value exists ($2957D8 move.b $8(a4),$4(a0)).
  ram.setU8(at + 4, 0x5a);
  assert.equal(ram.u8(SCHED.a1Base + 4), 0x5a);
});

test('$259A18 does NOT dedupe -- ten copies of one E script can run', () => {
  const ram = new Ram();
  const got = [];
  for (let i = 0; i < 10; i++) got.push(a1Start259A18(ram, 0x0b));
  assert.equal(new Set(got).size, 10);
  // $259962 (the A3 start) DOES dedupe; the two are not interchangeable.
  for (let i = 0; i < 10; i++) {
    assert.equal(ram.u16(SCHED.a1Base + i * SCHED.a1Stride), 0x800b);
  }
});

test('an ELEVENTH start is a SILENT DROP into $812D18, not a grown array', () => {
  const ram = new Ram();
  for (let i = 0; i < 10; i++) a1Start259A18(ram, 0x0b);
  const at = a1Start259A18(ram, 0x0c);
  assert.equal(at, SCHED.a1Overflow);
  assert.equal(at, 0x812d18);
  // The overflow block is NOT a slot: nothing was written into the table.
  for (let i = 0; i < 10; i++) {
    assert.equal(ram.u16(SCHED.a1Base + i * SCHED.a1Stride), 0x800b);
  }
});

test('$259A4A reports running only for a LIVE slot carrying that id', () => {
  const ram = new Ram();
  assert.equal(a1Running259A4A(ram, 0), false);
  a1Start259A18(ram, 0);
  assert.equal(a1Running259A4A(ram, 0), true);
  assert.equal(a1Running259A4A(ram, 1), false);
  // A cleared slot ($259A58 beq) stops counting even though its id byte is 0.
  ram.setU16(SCHED.a1Base, 0);
  assert.equal(a1Running259A4A(ram, 0), false);
});

test('$2598C8 reads the sequencer cursor; $FFFF is IDLE', () => {
  const ram = new Ram();
  ram.setU16(SCHED.seqCursor, 0xffff);
  assert.equal(seqCurrent2598C8(ram), 0xffff);
  ram.setU16(SCHED.seqCursor, 7);
  assert.equal(seqCurrent2598C8(ram), 7);
});

test('$2595F2 ALWAYS RETURNS 4 -- $25962A moveq #$4,D0 and nothing skips it',
  { skip: SKIP }, () => {
    assert.equal(spread2595F2(), 4);
    // ...and the claim is checked against the CARTRIDGE, not against itself:
    // the two bytes at $25962A must be `70 04`.  A test that only asserted the
    // constant would survive the ROM changing under it.
    const img = path.join(HERE, '..', 'tools', 'oracle', 'out', 'maincpu.bin');
    if (!fs.existsSync(img)) return;                 // the image is gitignored
    const fd = fs.openSync(img, 'r');
    const b = Buffer.alloc(4);
    fs.readSync(fd, b, 0, 4, 0x25962a);
    fs.closeSync(fd);
    assert.equal(b[0], 0x70, '$25962A must be moveq');
    assert.equal(b[1], 0x04, '...#$4');
    assert.equal(b[2], 0x4e, '$25962C must be rts');
    assert.equal(b[3], 0x75);
  });

// ========================================== EVERY W94 MUTATION IS REACHABLE

test('breakage.mjs declares all eight W94 mutations and each sets the seam', () => {
  const names = ['ring-reversed', 'tail-both-plus80', 'tail-same-shift',
    'pick-one-draw', 'ramp-unsigned', 'dist-no-aspect', 'main6-unsigned-arrive',
    'main7-stale-target'];
  for (const n of names) {
    assert.ok(MUTATIONS[n], `breakage.mjs has no mutation "${n}"`);
    W94_MUTATE.value = null;
    MUTATIONS[n]();
    assert.equal(W94_MUTATE.value, n);
  }
  W94_MUTATE.value = null;
});
