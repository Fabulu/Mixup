// W442 (DOCKET D56): **THE HYPER LASER'S BEAM-IMPACT EFFECT IS NOT MISSING.**
//
// The owner, verbatim:
//
//   "I press laser button while I have hyper and keep it pressed. Laser fired.
//    I keep it pressed and hit bomb. I go into hyper. I keep laser pressed:
//    Laser comes out, it hits something, and it just cuts off, it has no hit
//    animation or particles or whatever."
//
// This wave's brief named the cause: `spawnBeamImpact289FC0` <- `runBeamDraw`
// (`src/laser.js` -> `src/spark.js`, pool E), missing under a live hyper. **IT
// IS NOT MISSING.** On the board-verified rung lf9100 the effect fires 44 times
// in 100 frames with the hyper active, allocates 46 pool-E records, and is
// drawn as 1,597 bucket-20 sprite records on 100 frames out of 100. The
// hyper-free control on the same rung fires 50. This file exists so that no
// later wave spends itself re-deriving that, and so that the numbers are
// falsifiable rather than asserted.
//
// ---------------------------------------------------------------------------
// WHY 442 WAVES OF GREEN SAID NOTHING ABOUT D56, AND STILL DO NOT
// ---------------------------------------------------------------------------
// **THERE IS NO HYPER ANYWHERE ON THE LADDER.** `$8103E7` bit 0 (the bit
// `$24989E bset #$0,($1,A6)` sets, the one thing that makes the beam the HYPER
// beam) is ZERO at all nine rungs lf8800..lf9600, and `$81B63E` -- the hyper's
// own active word -- is ZERO at all nine. The band being 210/210 is a fact
// about a scenario in which the weapon under complaint never fires. That is the
// exact shape of the mistake D56 records: closing an item on a bench that could
// not have produced the behaviour. Test 2 pins it so the next wave cannot read
// a green band as evidence about the hyper.
//
// WHAT THE LADDER *DOES* PROVE, and it is the witness from outside the
// structure: with the PLAIN laser, pool E and everything that feeds it are
// BYTE-IDENTICAL to the cartridge at every rung of the band. `$81D394 + $7F8`
// (both 30-slot halves), the count word `$81DB8C`, P1's whole 32-slot segment
// pool, the beam record `$811EF2`, the beam block `$811F32`, the termination
// word `$812964` and bucket 20's 720-byte staging buffer all differ by ZERO
// bytes, while the board carries EIGHTEEN live pool-E records. So the machinery
// the brief accused is exact against the board; only the hyper's use of it was
// never tested.
//
// ---------------------------------------------------------------------------
// THE GATE, FROM THE BYTES, AND BOTH OF ITS `.W` BRANCHES
// ---------------------------------------------------------------------------
// `$25504E..$255066` is three conditions and no fourth. There is no "did it
// hit" term anywhere in it, which is why the effect fires at the beam's leading
// end whether or not the beam terminated on an enemy:
//
//     25504a: 6a 00 00 80   bpl.W $2550CC   <- P1's block not live: go to P2
//     25504e: 4a 79 00 80 39 0c / 67 16      $80390C must be NON-zero (P1)
//     255056: 4a 79 00 81 30 8c / 67 0e      $81308C must be NON-zero
//     25505e: 4a 79 00 81 29 4c / 66 06      $81294C must be ZERO
//     255066: 4e b9 00 28 9f c0              jsr $289FC0
//
// and the P2 half MIRRORS the first condition and has NO `addi.w #$180`:
//
//     2550d4: 6a 00 ff 6a   bpl.W $255040   <- BACKWARDS, onto $254FE6's rts
//     2550d8: 4a 79 00 80 39 0c / 66 16      $80390C must be ZERO (P2)
//
// **BOTH ARE `.W`, AND THE SECOND IS NEGATIVE.** The target is EXTENSION-WORD
// ADDRESS + DISPLACEMENT: `$2550D6 - $96 = $255040`, and `$255040` is `4E 75`,
// the `rts` `$254FE6` ends with and this routine borrows. Read `6a 00` as an
// 8-bit `bpl +0` and it lands on the extension word `$FF6A` itself, which is
// the fifth-wave-running trap this repo carries. Test 1 asserts every byte.
//
// ---------------------------------------------------------------------------
// TWO BENCH TRAPS, BOTH OF WHICH SILENTLY MEASURE ZERO HYPER
// ---------------------------------------------------------------------------
// 1. **THE LADDER'S PORT WORD IS ACTIVE LOW.** `trace.tsv` carries `$FFDB`
//    with the laser already held, and `portWordFromBits([BIT.b2])` is `$FFBF`
//    -- a bit CLEARED is a bit PRESSED. `input | BOMB` RELEASES the button.
//    This wave's own first run did exactly that: it read `hyperActive = 0` on
//    all 100 frames and looked precisely like "the hyper does nothing", while
//    in fact the press had never happened. Pinned as test 6.
// 2. **W427's TRAP, RE-PINNED ON THIS RUNG.** Writing `$81B65C` (the stock)
//    without `$81B642` (the gauge) also measures zero hyper, because `$285A5E`
//    reads the gauge, subtracts 2 and runs `endHyper` on the same frame
//    `$285A12` set it active. Test 7.
//
// **BOTH TRAPS PRODUCE A RUN THAT LOOKS BUSY.** The or-not-and arm still fires
// 34 impacts and still moves 1,578 RAM bytes against the board; the stock-only
// arm fires 43. A wave that measured either would have reported on a hyper it
// never ran.
//
// NO ROM WINDOW IS DECLARED OR WIDENED. This wave adds no cartridge read; it
// reads the 68k image directly, as W441 does, and asserts the window set is
// where W441 left it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTrace } from '../tools/portdiff.mjs';
import { ROM_WINDOW_COUNT, ROM_OVERLAP_PAIRS } from './romwindowset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const LADDER = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold');
const MANIFEST = path.join(LADDER, 'manifest.json');
const TRACE = path.join(LADDER, 'trace.tsv');
const CK = path.join(LADDER, 'ckpt');
const TABLES = path.join(GAME, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');

const RUNGS = [8800, 8900, 9000, 9100, 9200, 9300, 9400, 9500, 9600];
const ckOf = (lf) => path.join(CK, `c0${String(lf).padStart(5, '0')}.ram.bin`);
const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && RUNGS.every((lf) => fs.existsSync(ckOf(lf)));
const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder (rungs lf8800..lf9600) or '
    + 'rip/port/player.tables.json is absent -- rebuild with pgm.py ckpt and '
    + '`python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = fs.existsSync(IMAGE) ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';
const ASSETS = path.join(GAME, 'assets');
const SKIP_BUNDLE = fs.existsSync(path.join(ASSETS, 'manifest.json'))
  && fs.existsSync(path.join(ASSETS, 'spr')) ? false
  : 'games/ddpdoj/assets (the published bundle) is absent -- rebuild with '
    + '`node games/ddpdoj/tools/export-web.mjs`. THIS IS A SKIP, NOT A PASS.';

const RAM_BASE = 0x800000;

// Pool E, and everything that feeds the beam-impact effect.
const E_BASE = 0x81d394;             // $289FCE lea -- P1's 30 slots
const E_STRIDE = 0x22;               // $28A070 lea ($22,A0),A0
const E_SLOTS = 60;                  // $28A098 walks P1 and P2 as ONE array
const E_SPAN = E_SLOTS * E_STRIDE;   // $7F8
const E_COUNT = 0x81db8c;
const SEG_POOL_P1 = 0x8112f2;        // 32 x $30
const BEAM_REC_P1 = 0x811ef2;
const BEAM_BLK_P1 = 0x811f32;        // the jsr's A6 -- the spark's position source
const BEAM_WORD_P1 = 0x812964;       // $24CBD8 move.w D1 -- where the beam ends
const BUCKET20_BUF = 0x808fa4;       // $28A0EC lea

// The hyper, and the ONE bit that makes the beam the hyper beam.
const P1_FLAGS1 = 0x8103e7;          // ($1,A5) at $255000; bit 0 is $24989E's
const HYPER_ACTIVE = 0x81b63e;
const HYPER_GAUGE = 0x81b642;        // $2530BE writes this AND the stock
const HYPER_STOCK = 0x81b65c;

// The two RAM words of the impact gate this file falsifies against.
const W_81308C = 0x81308c;
const W_81294C = 0x81294c;

const hx = (v) => `$${v.toString(16).toUpperCase()}`;

// ===========================================================================
// 1. THE CARTRIDGE. The gate is three conditions, and BOTH halves' first
//    branch is `.W` -- one forwards, one BACKWARDS onto a borrowed `rts`.
// ===========================================================================
test('W442: $255042 and $2550CC decode byte for byte, the impact gate is THREE '
  + 'conditions with no hit term, and both `bpl` are .W computed from their '
  + 'EXTENSION WORD', { skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];

  const INSNS = [
    [0x255042, [0x4d, 0xf9, 0x00, 0x81, 0x1f, 0x32], 'lea $811F32,A6 -- P1 beam block'],
    [0x255048, [0x4a, 0x56], 'tst.w (A6)'],
    [0x25504a, [0x6a, 0x00, 0x00, 0x80], 'bpl.W $2550CC -- not live: go to P2'],
    [0x25504e, [0x4a, 0x79, 0x00, 0x80, 0x39, 0x0c], 'tst.w $80390C'],
    [0x255054, [0x67, 0x16], 'beq.b $25506C -- P1 needs it NON-zero'],
    [0x255056, [0x4a, 0x79, 0x00, 0x81, 0x30, 0x8c], 'tst.w $81308C'],
    [0x25505c, [0x67, 0x0e], 'beq.b $25506C -- needs NON-zero'],
    [0x25505e, [0x4a, 0x79, 0x00, 0x81, 0x29, 0x4c], 'tst.w $81294C'],
    [0x255064, [0x66, 0x06], 'bne.b $25506C -- needs ZERO'],
    [0x255066, [0x4e, 0xb9, 0x00, 0x28, 0x9f, 0xc0], 'jsr $289FC0 -- THE IMPACT'],
    [0x25506c, [0x30, 0x39, 0x00, 0x81, 0x29, 0x64], 'move.w $812964,D0'],
    [0x255072, [0x06, 0x40, 0x01, 0x80], 'addi.w #$180,D0 -- P1 ONLY'],
    [0x2550cc, [0x4d, 0xf9, 0x00, 0x81, 0x1f, 0x52], 'lea $811F52,A6 -- P2'],
    [0x2550d2, [0x4a, 0x56], 'tst.w (A6)'],
    [0x2550d4, [0x6a, 0x00, 0xff, 0x6a], 'bpl.W $255040 -- BACKWARDS, to the rts'],
    [0x2550d8, [0x4a, 0x79, 0x00, 0x80, 0x39, 0x0c], 'tst.w $80390C'],
    [0x2550de, [0x66, 0x16], 'bne.b $2550F6 -- P2 needs it ZERO. MIRRORED'],
    [0x2550f0, [0x4e, 0xb9, 0x00, 0x28, 0x9f, 0xda], 'jsr $289FDA -- P2 head'],
    [0x2550f6, [0x30, 0x39, 0x00, 0x81, 0x29, 0x66], 'move.w $812966,D0'],
    [0x2550fc, [0x32, 0x39, 0x00, 0x81, 0x05, 0x10], 'move.w $810510,D1 -- NO $180'],
  ];
  for (const [a, bytes, why] of INSNS) {
    assert.deepEqual(at(a, bytes.length), bytes, `${hx(a)} ${why}`);
  }

  // The extension-word rule, both directions, on the two wide branches.
  assert.equal(0x25504c + 0x0080, 0x2550cc,
    'P1: target = extension word address + displacement');
  const back = (0xff6a << 16) >> 16;                       // sign extend
  assert.equal(back, -0x96, '$FF6A is -$96, not a forward jump');
  assert.equal(0x2550d6 + back, 0x255040, 'P2 lands on $255040');
  assert.deepEqual(at(0x255040, 2), [0x4e, 0x75],
    '$255040 is `rts` -- the one $254FE6 ends with, borrowed');
  assert.deepEqual(at(0x2550d6, 2), [0xff, 0x6a],
    'an 8-bit `bpl +0` would land on the EXTENSION WORD $FF6A itself');
});

// ===========================================================================
// 2. THE BENCH FACT THAT MAKES 442 WAVES OF GREEN IRRELEVANT TO D56.
// ===========================================================================
test('W442: the stage1-laser-hold ladder carries NO HYPER on any of its nine '
  + 'rungs, so the 210/210 band cannot speak for D56 -- while its pool E is '
  + 'genuinely live', { skip: SKIP_LADDER }, () => {
  const u16 = (b, a) => (b[a - RAM_BASE] << 8) | b[a - RAM_BASE + 1];
  const liveByRung = [];
  for (const lf of RUNGS) {
    const b = new Uint8Array(fs.readFileSync(ckOf(lf)));
    assert.equal(b[P1_FLAGS1 - RAM_BASE] & 0x01, 0,
      `lf${lf}: $8103E7 bit 0 -- $24989E's HYPER bit -- is CLEAR`);
    assert.equal(u16(b, HYPER_ACTIVE), 0, `lf${lf}: $81B63E is 0`);
    assert.equal(u16(b, HYPER_STOCK), 0, `lf${lf}: there is no stock to spend`);
    let live = 0;
    for (let i = 0; i < E_SLOTS; i++) if (u16(b, E_BASE + i * E_STRIDE)) live++;
    assert.equal(live, u16(b, E_COUNT), `lf${lf}: $81DB8C agrees with the slots`);
    liveByRung.push(live);
  }
  // A zero measured over an empty pool measures the pool. This one is not empty.
  assert.deepEqual(liveByRung, [18, 18, 18, 18, 18, 18, 15, 18, 0],
    'the board really is running pool E through the band');
});

// ===========================================================================
// 3. THE WITNESS FROM OUTSIDE. With the PLAIN laser the port's pool E and
//    everything feeding it are the cartridge's, to the byte, at every rung.
// ===========================================================================
test('W442: pool E, its count word, the segment pool, the beam record, the beam '
  + 'block, $812964 and bucket 20 differ from the BOARD by ZERO bytes on all '
  + 'eight 100-frame segments of lf8800..lf9600',
{ skip: SKIP_LADDER }, async () => {
  const STRUCTS = [
    ['pool E $81D394', E_BASE, E_SPAN],
    ['$81DB8C count', E_COUNT, 4],
    ['P1 segment pool $8112F2', SEG_POOL_P1, 32 * 0x30],
    ['beam record $811EF2', BEAM_REC_P1, 0x20],
    ['beam block $811F32', BEAM_BLK_P1, 0x20],
    ['$812964 termination', BEAM_WORD_P1, 4],
    ['bucket 20 staging $808FA4', BUCKET20_BUF, 720],
  ];
  for (let i = 0; i + 1 < RUNGS.length; i++) {
    const s = RUNGS[i];
    const c = RUNGS[i + 1];
    const r = await replay(s, c, {});
    const board = new Uint8Array(fs.readFileSync(ckOf(c)));
    for (const [name, base, len] of STRUCTS) {
      let d = 0;
      for (let k = 0; k < len; k++) {
        if (board[base - RAM_BASE + k] !== r.ram.b[base - RAM_BASE + k]) d++;
      }
      assert.equal(d, 0, `lf${s}->${c}: ${name} differs by ${d} bytes`);
    }
  }
});

// ===========================================================================
// 4. THE DELIVERABLE. A LIVE HYPER on a board-verified rung, and the impact
//    effect IS created, IS allocated a record, and IS drawn.
// ===========================================================================
test('W442: with the hyper ACTIVE for 99 of 100 frames the beam impact fires 44 '
  + 'times, allocates 46 pool-E records and is drawn as 1597 bucket-20 records '
  + '-- the effect the brief called missing', { skip: SKIP_LADDER }, async () => {
  const control = await replay(9100, 9200, {});
  assert.equal(control.hyperFrames, 0, 'the control has no hyper at all');
  assert.equal(control.bit0Frames, 0, '$24989E never ran');
  assert.equal(control.impacts, 50, 'the PLAIN laser fires $289FC0 50 times');
  assert.equal(control.created, 50, '...and every one of them took a slot');
  assert.equal(control.wholeRam, 608,
    'and this run is W441\'s number against the board, to the byte');

  const r = await replay(9100, 9200, { hyper: true });
  assert.equal(r.hyperFrames, 99, 'the hyper is ACTIVE for 99 of the 100 frames');
  assert.equal(r.bit0Frames, 99, '$8103E7 bit 0 -- $24989E bset #$0,($1,A6) -- '
    + 'is set for the same 99, so this IS the $249868 arm and not the bomb');
  assert.equal(r.impacts, 44, '$255066 jsr $289FC0 ran 44 times');
  assert.equal(r.created, 46, '46 pool-E slots went from FREE to LIVE');
  assert.equal(r.emitFrames, 100, 'bucket 20 was non-empty on every frame');
  assert.equal(r.emitRecs, 1597, 'and drained 1597 twelve-byte sprite records');
  // Count records, not overlaps: the hyper is not producing FEWER effects than
  // the plain laser by any margin that could read as "missing".
  assert.ok(r.impacts > 0.8 * control.impacts,
    `${r.impacts} against the control's ${control.impacts}`);
});

// ===========================================================================
// 5. RED: the counter is wired to the CARTRIDGE'S gate, not to a constant.
//    Kill either RAM word the gate reads and the effect stops dead.
// ===========================================================================
test('W442 RED: forcing $81308C to 0, or $81294C non-zero, takes the impact to '
  + 'ZERO with the hyper still active -- so the 44 are the gate\'s and not the '
  + 'harness\'s', { skip: SKIP_LADDER }, async () => {
  const a = await replay(9100, 9200, { hyper: true, poke: [W_81308C, 0] });
  assert.equal(a.hyperFrames, 99, 'the hyper still runs...');
  assert.equal(a.impacts, 0, '...and $255056 beq skips the jsr on every frame');
  assert.equal(a.created, 0, 'not one pool-E slot is taken');

  const b = await replay(9100, 9200, { hyper: true, poke: [W_81294C, 1] });
  assert.equal(b.hyperFrames, 99);
  assert.equal(b.impacts, 0, '$255064 bne skips it on every frame');
  assert.ok(b.created <= 2, `${b.created} slots, from the OTHER producers only`);

  // And the same kill on the plain laser, so the arm is not hyper-specific.
  const c = await replay(9100, 9200, { poke: [W_81294C, 1] });
  assert.equal(c.impacts, 0);
  assert.equal(c.created, 0);
});

// ===========================================================================
// 6. THE TRAP THIS WAVE WALKED INTO. The ladder's port word is ACTIVE LOW.
// ===========================================================================
test('W442: `input | BOMB` RELEASES the button -- the port word is ACTIVE LOW, '
  + 'and the OR arm silently measures a run with no hyper in it at all',
{ skip: SKIP_LADDER }, async () => {
  const { portWordFromBits } = await import('../src/input.js');
  const { BIT } = await import('../src/machine.js');
  const bomb = portWordFromBits([BIT.b2]);
  const trace = readTrace(TRACE);
  const held = Number(trace.byLf.get(9103).portin);
  assert.equal(held, 0xffdb, 'the ladder holds button 1 by CLEARING its bit');
  assert.equal(bomb, 0xffbf, 'and button 2 is the CLEARED $40');
  assert.equal(held | bomb, 0xffff, 'so OR-ing releases EVERY button, the '
    + 'laser included -- it is strictly worse than doing nothing');
  assert.equal(held & bomb, 0xff9b, '...and AND-ing is the press');

  const wrong = await replay(9100, 9200, { hyper: true, orNotAnd: true });
  assert.equal(wrong.hyperFrames, 0, 'the OR arm never activates the hyper');
  assert.equal(wrong.bit0Frames, 0, '$24989E never runs');
  // AND IT DOES NOT LOOK LIKE NOTHING HAPPENED, which is the whole danger.
  assert.equal(wrong.impacts, 34, 'it still fires 34 impacts...');
  assert.equal(wrong.wholeRam, 1914,
    '...and still moves 1,914 RAM bytes after W479 adds its bonus follower');
});

// ===========================================================================
// 7. W427's TRAP, RE-PINNED ON THIS RUNG. Stock without gauge is not a hyper.
// ===========================================================================
test('W442: granting $81B65C WITHOUT $81B642 measures zero hyper on the ladder '
  + 'too, and the run still fires 43 impacts', { skip: SKIP_LADDER }, async () => {
  const r = await replay(9100, 9200, { hyper: true, stockOnly: true });
  assert.equal(r.hyperFrames, 0, '$285A5E reads the gauge, subtracts 2, and '
    + '`before < 2` ends the hyper on the frame $285A12 started it');
  assert.equal(r.bit0Frames, 0);
  assert.equal(r.impacts, 43, 'and the run looks busy while measuring nothing');
});

// ===========================================================================
// 8. **THE ANSWER, AND IT IS NOT IN THE SIMULATION AT ALL.**
//
// The owner asked for the hyper beam's hits to be checked VISUALLY against the
// oracle. There is no oracle frame to check against -- test 2 -- so this asks
// the next question down: does what the port draws REACH PIXELS in the browser?
//
// **AT W442 IT DID NOT, AND THE GAP WAS HYPER-ONLY.** With every sprite shard
// resident, the port's own $800000 display list named EIGHTEEN sprite streams
// that were in no shard of the shipped bundle at all -- 197 records over 100
// frames -- while the hyper-free control on the same rung named NONE of them.
// `portSpriteList` skips a record whose stream it cannot resolve, so those 197
// were simply not drawn, permanently, in every browser.
//
// **FOUR OF THEM WERE THE BEAM ITSELF.** `$022084 $022268 $02244C $022630`,
// stride exactly `$1E4` -- a four-frame animation -- appeared in bucket 16, the
// beam's own bucket, 22 times each, 88 records in 100 frames. And the reason
// was one address:
//
//     $255026 lea $24BB0A,A1 / adda.w D3,A1 / move.l (A1)+,(A0)+
//     $255000 btst #$0,($1,A5) / $255008 addi.w #$78,D3   <- THE HYPER'S SLOT
//
// so the plain laser's art pointer is `$24B7EA` and the HYPER's is `$24BAE2`.
// The bundle's only beam harvest was `manifest.spr.shards[10]` = "$24BB0A's
// 4-frame animation for all five POWER steps", walking pair entries 0..4 only.
// `$24BAE2` is the block pair entries 15..19 -- the `+$78` group -- share, and
// nothing walked them.
//
// THAT IS WHY 442 WAVES OF RAM COMPARISON FOUND NOTHING: the simulation was
// right, the records were created, the display list carried them, and the
// PICTURE did not exist in the shipped assets. Same shape as W58's own note on
// shard 10 -- "[M] 29 of the beam's 33 descriptors had no picture: the owner's
// flicker" -- one power step further along.
//
// ---------------------------------------------------------------------------
// **W443 SHIPPED THE ART AND THIS TEST IS REWRITTEN, NOT DELETED.**
// ---------------------------------------------------------------------------
// It was PINNING THE DEFECT: every assertion in it was true only while the four
// frames were absent, so the fix turned it red. What it measured is kept as the
// W442 column below and the post-fix column is asserted beside it, with a RED
// ARM (`drop`) that takes those same four streams back out of the resolved map
// and shows the 88 return. Without that arm "bucket 16 is clean" would also be
// what a broken counter says.
//
//     bucket 16 (THE BEAM)      W442: 4 streams, 88 records  ->  current: 0, 0
//     bucket 25 (the HUD)       W442: 14 streams, 109 records -> current: 0, 0
//     total missing streams     W442: 18, 197 records         ->  current: 0, 0
//
// Later complete-cabinet harvests resolved the fourteen HUD frames and W479's
// bonus-follower stream. The RED arm below still removes only the beam frames.
// ===========================================================================
/** the four frames of the hyper beam's animation, W442's own measurement. */
const BEAM_FOUR = [0x022084, 0x022268, 0x02244c, 0x022630];

test('W443 (was W442 test 8): bucket 16 -- THE LASER BEAM -- now has ZERO '
  + 'missing art with the hyper up, the 88 records are drawn, and the RED arm '
  + 'that puts the four streams back out of the map measures the 88 again',
{ skip: SKIP_BUNDLE || SKIP_LADDER }, async () => {
  const plain = await drawn(9100, 9200, {});
  const hyper = await drawn(9100, 9200, { hyper: true });

  // The impact spark itself was fine at W442 too, and that is half the answer:
  // the record is created AND drawn, so this was never "the effect was never
  // made". These three numbers are UNMOVED by W443.
  assert.equal(hyper.sparkSkipped, 0, 'every pool-E impact record resolves');
  assert.equal(hyper.sparkDrawn, 1597, 'and 1597 of them are DRAWN');
  assert.equal(plain.sparkDrawn, 1739, 'against the plain laser\'s 1739');

  // **DOCKET D56.** 88 -> 0.
  assert.equal(hyper.missingBucket.has(16), false,
    'bucket 16 carries NO missing art with the hyper active. At W442 it '
    + 'carried exactly BEAM_FOUR, 22 records each, 88 in 100 frames -- the '
    + 'owner\'s "it just cuts off"');
  for (const o of BEAM_FOUR) {
    assert.equal(hyper.missing.has(o), false,
      `${hx(o)} resolves to a shard now; it did not at W442`);
  }
  assert.equal(plain.missingBucket.has(16), false,
    'and the PLAIN laser still has none -- it never did, which is what made '
    + 'this the hyper\'s power slot and only the hyper\'s');

  // The complete sprite bundle now resolves the later HUD harvest as well.
  const only = [...hyper.missing.keys()].filter((o) => !plain.missing.has(o));
  const records = only.reduce((n, o) => n + hyper.missing.get(o), 0);
  assert.equal(only.length, 0,
    'the hyper adds no unresolved stream after the complete-cabinet harvest');
  assert.equal(records, 0,
    'the hyper adds no unresolved record after the complete-cabinet harvest');
  assert.equal(hyper.missingBucket.has(25), false,
    'the complete-cabinet harvest resolves the historical HUD gap');

  // ---- RED. Take the four back OUT of the resolved map and the defect
  // returns, to the record. A zero measured by a counter that stopped counting
  // would not move here.
  const red = await drawn(9100, 9200, { hyper: true, drop: BEAM_FOUR });
  const b16 = red.missingBucket.get(16);
  assert.ok(b16, 'with the four removed bucket 16 carries missing art again');
  assert.deepEqual([...b16.keys()].sort((a, b) => a - b), BEAM_FOUR,
    'exactly those four, nothing else');
  assert.equal([...b16.values()].reduce((a, b) => a + b, 0), 88,
    'and exactly 88 records -- W442\'s number, reproduced on demand');
  for (const o of BEAM_FOUR) {
    assert.equal(red.missing.get(o), 22, `${hx(o)} on 22 of 100 frames`);
  }
  const redOnly = [...red.missing.keys()].filter((o) => !plain.missing.has(o));
  assert.equal(redOnly.length, 4,
    'only the four deliberately removed beam streams are unresolved');
  assert.equal(redOnly.reduce((n, o) => n + red.missing.get(o), 0), 88,
    'only the restored 88-record beam defect remains unresolved');
  // The stride, which is what says these are four frames of one animation.
  for (let i = 1; i < BEAM_FOUR.length; i++) {
    assert.equal(BEAM_FOUR[i] - BEAM_FOUR[i - 1], 0x1e4,
      'four frames at a constant stride -- an ANIMATION, not four strays');
  }
});

test('W443 (was W442 test 8b): the hyper beam still takes its art from $24BAE2 '
  + 'and the plain laser from $24B7EA -- and the shipped manifest now carries a '
  + 'harvest row for BOTH', { skip: SKIP_LADDER || SKIP_BUNDLE }, async () => {
  // THE CARTRIDGE HALF IS UNCHANGED AND IS NOT SUPPOSED TO MOVE. It is what
  // W442 measured live, out of the beam block the port itself writes.
  const plain = await drawn(9100, 9200, {});
  const hyper = await drawn(9100, 9200, { hyper: true });
  assert.deepEqual([...plain.artBases].sort(), [0x24b7ea],
    'the plain laser draws from ONE table');
  assert.deepEqual([...hyper.artBases].sort(), [0x24b7ea, 0x24bae2],
    'the hyper adds $24BAE2 -- $255008 addi.w #$78,D3 indexes $24BB0A there');

  // THE BUNDLE HALF IS WHAT W443 MOVED. At W442 the ledger had ONE beam row,
  // declared from $24BB0A, and $24BAE2 is $28 bytes BELOW that base, so no
  // entry of that harvest could reach it. Now there are TWO rows and the
  // second one is the block the hyper's five power steps share.
  const man = JSON.parse(fs.readFileSync(path.join(GAME, 'assets', 'manifest.json'),
    'utf8'));
  const laser = man.spr.shards.find((s) => s.kind === 'laser');
  assert.ok(laser, 'the bundle has a laser shard');
  const h = man.spr.harvest.filter((x) => x.shard === laser.i);
  assert.ok(h.some((x) => x.at === '$24BB0A'),
    'W58\'s beam harvest is still declared from $24BB0A');
  const hyperRow = h.find((x) => x.at === '$24BAE2');
  assert.ok(hyperRow, 'and W443\'s is declared from $24BAE2, the block the '
    + 'plain harvest could never reach. This assertion is the whole of D56');
  assert.equal(hyperRow.entries, 4, 'four frames');
  assert.equal(hyperRow.added, 4, 'all four NEW to the sheet');
  assert.ok(0x24bae2 < 0x24bb0a,
    'and it is still BELOW $24BB0A -- the fix is a second declared read, not a '
    + 'widened one');
});

// ===========================================================================
// 9. The standing tripwire. This wave declares no window.
// ===========================================================================
test('W442 adds no ROM window and later waves reconcile the exact registry', () => {
  assert.equal(ROM_WINDOW_COUNT, 1792,
    'later gameplay, frontend, player, request, and route data reconcile the registry');
  assert.equal(ROM_OVERLAP_PAIRS, 79,
    'W518 vertical glyph data overlaps W23 slot-[14] init data by ten exact bytes');
});

// ===========================================================================
// The shared runner. One replay of the board's own inputs, with the hyper
// granted on the SECOND frame -- the laser is already held by the ladder, so
// this is the owner's ordering: laser held, bomb pressed while it is held,
// laser still held.
// ===========================================================================
const CACHE = new Map();

async function replay(seedLf, cmpLf, opts) {
  const key = `${seedLf}->${cmpLf}/${JSON.stringify(opts)}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const { Game } = await import('../src/main.js');
  const { portWordFromBits } = await import('../src/input.js');
  const { BIT } = await import('../src/machine.js');
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const trace = readTrace(TRACE);
  const rung = man.rungs.find((r) => r.lf === seedLf);
  assert.ok(rung, `lf${seedLf} must be a rung`);
  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));
  const game = new Game(seed, tables,
    { logicFrame: seedLf, videoFrame: rung.vf, bgSeed });
  const ram = game.ram;
  const bomb = portWordFromBits([BIT.b2]);

  const snap = () => {
    const a = [];
    for (let i = 0; i < E_SLOTS; i++) a.push(ram.u16(E_BASE + i * E_STRIDE));
    return a;
  };
  let prev = snap();
  const r = { created: 0, impacts: 0, emitRecs: 0, emitFrames: 0,
    hyperFrames: 0, bit0Frames: 0, wholeRam: 0 };
  for (let lf = seedLf + 1; lf <= cmpLf; lf++) {
    const row = trace.byLf.get(lf);
    assert.ok(row, `the trace must carry lf${lf}`);
    for (const [a, v] of pokes) ram.setU8(a, v);
    if (opts.poke) ram.setU16(opts.poke[0], opts.poke[1]);
    let input = Number(row.portin);
    if (opts.hyper && lf === seedLf + 2) {
      ram.setU16(HYPER_STOCK, 1);
      if (!opts.stockOnly) ram.setU16(HYPER_GAUGE, 0x095f);
      input = opts.orNotAnd ? (input | bomb) : (input & bomb);
    }
    game.step(input);
    const cur = snap();
    for (let i = 0; i < E_SLOTS; i++) if (prev[i] === 0 && cur[i] !== 0) r.created++;
    prev = cur;
    r.impacts += game.beamImpacts || 0;
    const recs = game.displayList?.perBucketRecords?.[20] ?? 0;
    r.emitRecs += recs;
    if (recs > 0) r.emitFrames++;
    if (ram.u16(HYPER_ACTIVE) !== 0) r.hyperFrames++;
    if ((ram.u8(P1_FLAGS1) & 0x01) !== 0) r.bit0Frames++;
  }
  const board = new Uint8Array(fs.readFileSync(ckOf(cmpLf)));
  for (let i = 0; i < board.length; i++) if (board[i] !== ram.b[i]) r.wholeRam++;
  r.ram = ram;
  CACHE.set(key, r);
  return r;
}

// ===========================================================================
// THE DRAW-SIDE RUNNER. The same replay, but every frame its $800000 list is
// resolved through the SHIPPED bundle's stream map, exactly as the browser's
// `portSpriteList` does -- with every shard forced RESIDENT, so a miss here is
// a stream that does not exist rather than one that has not arrived yet.
// ===========================================================================
const DRAW_CACHE = new Map();

async function drawn(seedLf, cmpLf, opts) {
  const key = `${seedLf}->${cmpLf}/${JSON.stringify(opts)}`;
  if (DRAW_CACHE.has(key)) return DRAW_CACHE.get(key);
  const { Game } = await import('../src/main.js');
  const { portWordFromBits } = await import('../src/input.js');
  const { BIT } = await import('../src/machine.js');
  const { loadBundle } = await import('../src/web/assets.js');
  const { portSpriteList, romToPackedMap, PORT_LIST_WORDS }
    = await import('../src/web/app.js');
  const { RAM_STRIDE } = await import('../src/render/index.js');

  const bundle = await loadBundle(
    async (n) => new Uint8Array(fs.readFileSync(path.join(ASSETS, n))), {});
  // EVERY shard resident. The page fetches them on demand; forcing them all
  // ready is what turns "has not arrived" into "does not exist".
  for (let i = 0; i < bundle.spr.state.length; i++) bundle.spr.state[i] = 'ready';
  const map = romToPackedMap(bundle.manifest, (b) => bundle.spr.shardOfBase(b));
  // W443's RED ARM. `drop` takes streams back OUT of the resolved map, which is
  // exactly the state the bundle was in before W443 harvested them -- so the
  // "zero missing" this file now asserts is measured against a run that CAN
  // still measure 88, rather than against a counter that stopped counting.
  for (const o of (opts.drop ?? [])) map.delete(o);
  const sparkShard = bundle.manifest.spr.shards.find((s) => s.kind === 'spark').i;

  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const trace = readTrace(TRACE);
  const rung = man.rungs.find((x) => x.lf === seedLf);
  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));
  const game = new Game(seed, tables,
    { logicFrame: seedLf, videoFrame: rung.vf, bgSeed });
  const ram = game.ram;
  const bomb = portWordFromBits([BIT.b2]);
  const out = new Uint16Array(PORT_LIST_WORDS);

  const r = { records: 0, drawnRecs: 0, skipped: 0, sparkDrawn: 0,
    sparkSkipped: 0, missing: new Map(), artBases: new Set(),
    missingBucket: new Map() };
  for (let lf = seedLf + 1; lf <= cmpLf; lf++) {
    const row = trace.byLf.get(lf);
    for (const [a, v] of pokes) ram.setU8(a, v);
    let input = Number(row.portin);
    if (opts.hyper && lf === seedLf + 2) {
      ram.setU16(HYPER_STOCK, 1);
      ram.setU16(HYPER_GAUGE, 0x095f);
      input &= bomb;
    }
    game.step(input);
    // $255086 movea.l ($12,A6),A0 -- the table the DRAWN column comes from.
    if ((ram.u16(BEAM_BLK_P1) & 0x8000) !== 0) {
      r.artBases.add(ram.u32(BEAM_BLK_P1 + 0x12));
    }
    // Classify the port's own list BEFORE portSpriteList rewrites words 2/3.
    // The drain appends bucket by bucket in `perBucketRecords` order, so the
    // cumulative counts say which producer each record came from -- and that is
    // how a missing picture gets attributed to the BEAM rather than guessed at.
    const pb = game.displayList.perBucketRecords;
    let bi = 0, left = pb[0];
    for (let k = 0; k < 256; k++) {
      const b = k * RAM_STRIDE;
      const w4 = ram.u16(0x800000 + (b + 4) * 2);
      if ((w4 & 0x7fff) === 0) break;
      while (left === 0 && bi < pb.length - 1) { bi++; left = pb[bi]; }
      left--;
      if (((w4 & 0x7e00) >> 9) === 0 || (w4 & 0x01ff) === 0) continue;
      const offs = ((ram.u16(0x800000 + (b + 2) * 2) & 0x7f) << 16)
        | ram.u16(0x800000 + (b + 3) * 2);
      const m = map.get(offs);
      if (m === undefined) {
        if (!r.missingBucket.has(bi)) r.missingBucket.set(bi, new Map());
        const mb = r.missingBucket.get(bi);
        mb.set(offs, (mb.get(offs) ?? 0) + 1);
        continue;
      }
      if (m[2] === sparkShard) r.sparkDrawn++;
    }
    const res = portSpriteList(ram, map,
      { out, shardReady: () => true, demand: () => {} });
    r.records += res.records; r.drawnRecs += res.drawn; r.skipped += res.skipped;
    r.sparkSkipped += res.pending.size;
    for (const [o, c] of res.missing) r.missing.set(o, (r.missing.get(o) ?? 0) + c);
  }
  DRAW_CACHE.set(key, r);
  return r;
}
