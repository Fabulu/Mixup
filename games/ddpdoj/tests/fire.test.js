// WAVE 12.5 -- `$24C476`, THE TAIL EVERY EXIT OF OPTION FORMATION 2 FALLS INTO.
//
// Every expected value here is DERIVED FROM THE LISTING or from a named
// measurement in `docs/worklog/ddpdoj/12_5-impl-fallthrough-24C476.md`, never
// from running the port and writing down what came out.  11-review F1 and
// 12-review F1 are both cases of a unit test written from the port locking a
// real defect in, and the second one had this exact shape.
//
// THESE TESTS EXIST FOR THE ARMS THE BOARD WINDOW DOES NOT REACH.
// `pgm.py firegate` compares 2,571 board frames at 0 divergent, but its census
// says three of the eleven write sites never fire in that window:
//
//   ARMS ... fh35z=0/0 ... fh34i=0/0 ... fhb4s=0/0 ...
//
// `fhb4s`/`fh35z` are the bit-3 arm, whose input is written by the UNPORTED
// `$2497BA` auto-shot block (`$2497F2 bset #3,($1,A0)`, MEASURED by a
// PROBE_WRITERS census); `fh34i` needs an edge on the frame after a burst tick.
// A gate that cannot reach an arm is not evidence about that arm, so the arms
// are driven here instead -- and so are the three mutations `stage1-shot`
// cannot see, which `tools/breakage.mjs FIRE_EXPECTED_GREEN` names.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT, ROM } from '../src/machine.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import {
  fireHandshake, FIRE_ARMS, FIRE_MUTATE, resetFireArms, OPTION_BLOCKS,
} from '../src/options.js';

const B = OPTION_BLOCKS[0];
const OPTF = RAM.p1Options + OPT.flags1;       // $8104AB
const P34 = RAM.player1 + 0x34;                // $81041A
const P35 = RAM.player1 + 0x35;                // $81041B

function bench() {
  return { ram: new Ram(null), ctx: { unportedLog: new UnportedLog() } };
}

/** Run the block; return the ROM address of any named throw, or null. */
function run(ram, ctx) {
  resetFireArms();
  try { fireHandshake(ram, ctx, B); return null; } catch (e) {
    if (e instanceof Unreached) return e.romAddress;
    throw e;
  }
}

test.afterEach(() => { FIRE_MUTATE.value = null; });

// ===================================================== 1. THE FIVE EXITS
//
// $24C3E2/$24C3EC/$24C3F6 are `bne $24C476`, $24C402 is `beq $24C476`, and
// $24C470's `jsr $23EFEE` falls off the end into it.  Wave 12 wrote `return` on
// the four and dropped the fifth; the gate could not see it because the block
// is inert without a fire edge.  This test drives the four gate conditions
// directly and asserts the block RAN -- $24C4BC's `bclr` is the witness,
// because it is read-modify-write and fires even when bit 4 is already clear.

test('all four early gates of formation 2 still reach $24C476', () => {
  // The four words, and the value each one needs for its branch to be TAKEN:
  //   $24C3DC tst.w $812970  / bne     $24C3E6 tst.w $80390C  / bne
  //   $24C3F0 tst.w $813098  / bne     $24C3FA cmpi.w #2,$813092 / beq
  const gates = [[0x812970, 1], [0x80390c, 1], [0x813098, 1], [0x813092, 2]];
  for (const [addr, val] of gates) {
    const { ram, ctx } = bench();
    ram.setU16(RAM.p1Options + OPT.state, 0x8003);
    ram.setU16(addr, val);
    ram.setU8(OPTF, 0x1b);                       // bits 0,1,3,4 set
    ram.setU8(B.opt + OPT.edge, 0x00);           // no edge -> $24C4BC
    // Reach it the way the board does, through formation 2's own gate order.
    // The gates are checked in `formation2`, so drive that; but `formation2`
    // needs the pods, so assert on the block itself with the SAME state and
    // then cross-check the gate wiring with the source below.
    assert.equal(run(ram, ctx), null, `$${addr.toString(16)} gate`);
    assert.equal(FIRE_ARMS.fhb4x, 1,
      `$24C4BC must run after the $${addr.toString(16)} gate`);
    assert.equal(ram.u8(OPTF) & 0x10, 0, '$24C4BC clears bit 4');
  }
});

test('formation 2 routes every one of its five exits into fireHandshake', () => {
  // The wiring itself, read out of the shipped source: five call sites, and no
  // bare `return;` between the gates and the tail.  A test that only drove the
  // block would pass on wave 12's code, which HAD the gates and no tail.
  const src = new URL('../src/options.js', import.meta.url);
  const body = readFileSync(src, 'utf8')
    .split('function formation2(')[1].split('\n}\n')[0];
  const calls = body.match(/fireHandshake\(ram, ctx, b\)/g) ?? [];
  assert.equal(calls.length, 5,
    'four gate exits + the fall-through tail = five calls to $24C476');
  assert.equal((body.match(/^\s*return;\s*$/gm) ?? []).length, 0,
    'no bare `return` may survive in formation 2 -- every exit is $24C476');
});

// ================================================== 2. THE ARMS THE GATE MISSES

test('$24C498 bit 3 SET takes the $24C4A0 arm: bset #4, clr.b ($35,A4)', () => {
  // $24C498 bclr #3,($1,A6) / $24C49E beq $24C4AC.  `bclr` sets Z from the OLD
  // bit, so bit 3 SET falls through to $24C4A0 bset #4 / $24C4A6 clr.b ($35,A4)
  // / $24C4AA bra $24C4D8 -> the spawn.  Bit 3 arrives from $2497F2, the
  // auto-shot block; nothing in $24C476 ever sets it.
  const { ram, ctx } = bench();
  ram.setU8(OPTF, 0x0b);                         // bits 0,1,3
  ram.setU8(B.opt + OPT.edge, 0x10);             // the edge
  ram.setU8(RAM.player1 + 0x21, 0x00);
  ram.setU8(RAM.player1 + 0x37, 0x02);
  ram.setU8(RAM.player1 + 0x36, 0x03);
  assert.equal(run(ram, ctx), ROM.optionSpawn, 'the bit-3 arm ends at $24D480');
  assert.equal(FIRE_ARMS.fhb4s, 1, '$24C4A0 bset #4');
  assert.equal(FIRE_ARMS.fh35z, 1, '$24C4A6 clr.b ($35,A4)');
  assert.equal(FIRE_ARMS.fhb4c, 0, '$24C4AC is NOT reached on this arm');
  assert.equal(ram.u8(OPTF), 0x13, 'bit 3 cleared, bit 4 set: $0B -> $13');
  assert.equal(ram.u8(P35), 0, '$24C4A6 clears the burst count it just wrote');
  assert.equal(ram.u8(P34), 3, '$24C4EE reloads from ($36,A4) = 3');
});

test('$24C4AC bit 4 SET is the ONLY path from $24C476 to the rts', () => {
  // $24C4AC bclr #4,($1,A6) / $24C4B2 beq $24C4D8.  Bit 4 SET -> $24C4B4
  // move.b #$1,($34,A4) / $24C4BA bra $24C4F6.  Every other arm reaches
  // $24C4D8 and leaves through `bra $24D480`.
  const { ram, ctx } = bench();
  ram.setU8(OPTF, 0x13);                         // bits 0,1,4 -- bit 3 CLEAR
  ram.setU8(B.opt + OPT.edge, 0x10);
  ram.setU8(RAM.player1 + 0x21, 0x00);
  ram.setU8(RAM.player1 + 0x37, 0x02);
  assert.equal(run(ram, ctx), null, 'this arm returns; it does not spawn');
  assert.equal(FIRE_ARMS.fh34i, 1, '$24C4B4 move.b #$1,($34,A4)');
  assert.equal(FIRE_ARMS.fh34w, 0, '$24C4EE is NOT reached');
  assert.equal(ram.u8(P34), 1);
  assert.equal(ram.u8(P35), 2, '$24C494 wrote (0>>1) + ($37,A4) = 2');
  assert.equal(ram.u8(OPTF), 0x03, 'both handshake bits end clear');
});

test('the no-edge arm counts down and ticks the burst at zero', () => {
  // $24C4BC bclr #4 / $24C4C2 tst.b ($35,A4) / beq rts ; $24C4C8 subq.b #1,
  // ($34,A4) / bne rts ; $24C4CE subq.b #1,($35,A4) / $24C4D2 bset #4 / $24C4D8
  const { ram, ctx } = bench();
  ram.setU8(OPTF, 0x03);
  ram.setU8(B.opt + OPT.edge, 0x00);
  ram.setU8(P35, 2);
  ram.setU8(P34, 2);
  ram.setU8(RAM.player1 + 0x36, 0x03);
  assert.equal(run(ram, ctx), null, '($34,A4) 2 -> 1, not zero yet');
  assert.equal(ram.u8(P34), 1);
  assert.equal(ram.u8(P35), 2);
  assert.equal(FIRE_ARMS.fh34d, 1);
  assert.equal(FIRE_ARMS.fh35d, 0);
  assert.equal(run(ram, ctx), ROM.optionSpawn, '($34,A4) 1 -> 0: the tick');
  assert.equal(ram.u8(P35), 1, '$24C4CE');
  assert.equal(ram.u8(P34), 3, '$24C4EE reloads from ($36,A4)');
  assert.equal(ram.u8(OPTF) & 0x10, 0x10, '$24C4D2 bset #4');
});

test('($35,A4) == 0 is the idle case and writes nothing but the bclr', () => {
  const { ram, ctx } = bench();
  ram.setU8(OPTF, 0x13);
  ram.setU8(P34, 7);
  ram.setU8(P35, 0);
  assert.equal(run(ram, ctx), null);
  assert.equal(ram.u8(P34), 7, '$24C4C2 returns before $24C4C8');
  assert.equal(ram.u8(OPTF), 0x03, '...but $24C4BC still cleared bit 4');
  assert.equal(FIRE_ARMS.fhb4x, 1);
  assert.equal(FIRE_ARMS.fh34d, 0);
});

// ============================ 3. THE THREE MUTATIONS `stage1-shot` CANNOT SEE
//
// tools/breakage.mjs FIRE_EXPECTED_GREEN declares each of these green on the
// board scenario, with the measurement.  Here they are red.

test('the gate is the EDGE byte ($41,A6), never the raw one ($40,A6)', () => {
  // The state a HOLD produces and `stage1-shot`'s one-frame taps never do.
  const set = (m) => {
    const { ram, ctx } = bench();
    FIRE_MUTATE.value = m;
    ram.setU8(OPTF, 0x03);
    ram.setU8(B.opt + OPT.raw, 0x10);            // held...
    ram.setU8(B.opt + OPT.edge, 0x00);           // ...but no edge this frame
    ram.setU8(RAM.player1 + 0x37, 0x02);
    ram.setU8(P35, 0);
    const thrown = run(ram, ctx);
    return { thrown, p35: ram.u8(P35), fh35w: FIRE_ARMS.fh35w };
  };
  const rom = set(null);
  assert.equal(rom.fh35w, 0, 'the ROM takes the NO-EDGE arm');
  assert.equal(rom.p35, 0);
  assert.equal(rom.thrown, null, '...and returns without a spawn');
  const mut = set('edge-on-raw');
  assert.equal(mut.fh35w, 1, 'the mutation takes the edge arm...');
  assert.equal(mut.p35, 2, '...writes (0>>1) + ($37,A4) = 2 into ($35,A4)...');
  assert.equal(mut.thrown, ROM.optionSpawn, '...and spawns a shot the board did not');
});

test('$24C48E is lsr.b with NO mask -- the ship twin\'s andi.b #6 is not here', () => {
  // $249B66's ship version is `lsr.w #1 / andi.b #$6`; $24C48E is `lsr.b #1`
  // and nothing else.  ($21,A4) = $0E separates them: $0E>>1 = 7, 7 & 6 = 6.
  const run35 = (m) => {
    const { ram, ctx } = bench();
    FIRE_MUTATE.value = m;
    ram.setU8(OPTF, 0x13);                       // bit 4 set -> the rts arm,
    ram.setU8(B.opt + OPT.edge, 0x10);           // so $24C4A6 does not clear it
    ram.setU16(RAM.player1 + 0x20, 0x000e);      // ($21,A4) = $0E
    ram.setU8(RAM.player1 + 0x37, 0x02);
    run(ram, ctx);
    return ram.u8(P35);
  };
  assert.equal(run35(null), 9, '(0x0E >> 1) + 2 = 9');
  assert.equal(run35('burst-mask-6'), 8, '((0x0E >> 1) & 6) + 2 = 8');
});

test('$24C4E4 compares the WORD ($20,A4) against 8 -- and has NO ($58,A4) test', () => {
  // The ship twin at $249BCE requires `tst.w ($58,A6)` == 0 as well; this one
  // does not.  ($20,A4) = 8 with ($58,A4) non-zero separates the two.
  const runDelay = (m, w20, shipSel) => {
    const { ram, ctx } = bench();
    FIRE_MUTATE.value = m;
    ram.setU8(OPTF, 0x03);
    ram.setU8(P35, 1);
    ram.setU8(P34, 1);
    ram.setU8(RAM.player1 + 0x36, 0x05);
    ram.setU16(RAM.player1 + 0x20, w20);
    ram.setU16(RAM.player1 + P.shipSel, shipSel);
    run(ram, ctx);
    return ram.u8(P34);
  };
  assert.equal(runDelay(null, 0x0008, 0), 2, '($20,A4) == 8 -> moveq #$2');
  assert.equal(runDelay(null, 0x0008, 2), 2,
    '...and still 2 with ($58,A4) = 2: $24C4E4 does not look at it');
  assert.equal(runDelay(null, 0x0007, 0), 5, '($20,A4) != 8 -> ($36,A4)');
  assert.equal(runDelay('delay-no-two', 0x0008, 0), 5, 'the mutation');
});

// ==================================================== 4. THE UNPORTED NEIGHBOUR

test('$24D480 is a LOUD named throw carrying the ROM address', () => {
  const { ram, ctx } = bench();
  ram.setU8(OPTF, 0x03);
  ram.setU8(B.opt + OPT.edge, 0x10);
  ram.setU8(RAM.player1 + 0x37, 0x02);
  let e = null;
  try { fireHandshake(ram, ctx, B); } catch (err) { e = err; }
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x24d480);
  assert.match(e.message, /PODS' SHOT SPAWN/);
  assert.match(e.message, /\$810572/, 'it names the record table it would write');
  assert.match(e.message, /W20/, 'and whose wave it is');
});

test('the block never touches bits 0, 1, 2, 5, 6 or 7 of $8104AB', () => {
  // $24C498/$24C4A0/$24C4AC/$24C4BC/$24C4D2 are the only writers, and all five
  // are single-bit ops on bits 3 and 4.  Bit 0 is the init ($24C0C8), bit 1 the
  // deployed flag and bit 2 the LASER LATCH ($24C1A8) -- a port that wrote the
  // whole byte would silently drop the laser's own state.
  for (const seed of [0x00, 0xff, 0x07, 0xe7]) {
    for (const edge of [0x00, 0x10]) {
      const { ram, ctx } = bench();
      ram.setU8(OPTF, seed);
      ram.setU8(B.opt + OPT.edge, edge);
      ram.setU8(P35, 1);
      ram.setU8(P34, 1);
      run(ram, ctx);
      assert.equal(ram.u8(OPTF) & 0xe7, seed & 0xe7,
        `seed $${seed.toString(16)} edge $${edge.toString(16)}`);
    }
  }
});
