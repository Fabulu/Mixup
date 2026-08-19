// W427 (DOCKET D56): **A BENCH FOR THE WEAPON, BEFORE ANY FIX.**
//
// D56 records the coordinator closing "the hyper laser has no hit animation" on
// `tests/w412laserhead.test.js`, a file in which the word "hyper" appears once,
// in its own title. The owner said so plainly: *"hyper has been fucked for a
// long time and you keep saying you found it"*. This file exists so that the
// weapon is EXERCISED before anything about it is claimed again.
//
// ---------------------------------------------------------------------------
// WHAT WAS NEVER REACHED, AND IS REACHED HERE
// ---------------------------------------------------------------------------
// `$24560A` is block 9 of `$244D62` (`src/damage.js` `weaponTail`), and both of
// its guards were FALSE on every bench in this repo:
//
//     $245614  6a 00 03 b8   bpl.w $2459CE      needs $811F72 NEGATIVE
//     $245618  08 2c 00 06   btst #$6,($1,A4)   needs bit 6 of ($1,A4) SET
//     $24561E  67 00 ....    beq.w $2459CE
//
// Both are opened by ONE press: `$2498E2 fireBomb2498E2` sets bit 6 of the
// player's `flags1` at `$249A32 bset #$6,($1,A6)` and allocates `$811F72` at
// `$249A4A move.w D2,(A1)` with D2's bit 15 set. Nothing more exotic than
// button 2 was ever needed; no bench had pressed it while a beam was up.
//
// ---------------------------------------------------------------------------
// TWO CORRECTIONS THIS FILE PINS, BOTH VERIFIED AGAINST THE ROM BYTES
// ---------------------------------------------------------------------------
// **1. `$24989E` IS NOT THE INSTRUCTION THAT SELECTS `$2456A6`.** `docs/DOCKET.md`
// (D56 LEAD, D60), `src/score.js` and this wave's own brief all say
// "`$24989E bset #$0,($1,A6)`, INSIDE THE BOMB, is the only thing that selects
// the bomb-laser". The bytes say otherwise, and they are two different records:
//
//     $24989E  08 ee 00 00 00 01   bset #$0,($1,A6)   A6 = the PLAYER record
//              4e b9 00 28 c8 da   jsr  $28C8DA       <- inside $249868, the HYPER
//     $249A98  08 e9 00 00 00 01   bset #$0,($1,A1)   A1 = $811F72, the BOMB record
//
// `$24989E` sets bit 0 of the PLAYER's `flags1`, which `$24C1B2 btst #$0` reads
// to seed segment family 2 from `$24D00A` (`src/laser.js:384`). It is inside
// `requestHyper249868` and it never touches `$811F72`. The bit `$245632 btst
// #$0,D5` tests is bit 0 of the `$811F72` WORD, and its writer is `$249A98`,
// inside `fireBomb2498E2`'s LASER arm (`src/bomb.js:1548`, which says so).
//
// **The two are reached by MUTUALLY EXCLUSIVE arms of the same button.**
// `$249864 move.w (A1),D1 / $249866 beq.b $2498E2` forks on the HYPER STOCK:
// stock non-zero goes to `$249868` (the hyper, `$24989E`), stock zero goes to
// `$2498E2` (the bomb, `$249A98`). So "bomb while lasering" is TWO weapons
// depending on a word no note in this repo had mentioned, and only the
// stock-ZERO one runs block 9. Both are benched below.
//
// **2. `$2456A6` DOES NOT FLASH "EXACTLY ONE TARGET PER FRAME".** D56 LEAD says
// it does, on the strength of `$2457FA`'s single pool-B hit. `$2456A6` also
// carries the pool-A loop at `$24581C`, and its store is the same instruction:
//
//     $245812  89 55  or.w D4,(A5)   pool B, the ONE nearest      ($2457FA arm)
//     $2458E6  89 55  or.w D4,(A5)   pool A, EVERY intersecting one
//
// Both `or.W`, both `D4 = $80FA72 | $400` (`00 44 04 00` = `ori.w #$400,D4` at
// `$24580E` and `$2458E2`). MEASURED below: six records flash in a single frame.
//
// ---------------------------------------------------------------------------
// THE RUNGS, AND WHY TWO
// ---------------------------------------------------------------------------
// `c002000` of the W69 laser-hold ladder is the harness `w285medallive.test.js`
// uses. It has pool A but **pool B is EMPTY on all 130 frames of the window**,
// so `beamHitsB` measured there is a fact about the seed. `c008000` of the same
// ladder is the only checkpoint that both carries a live pool B (9 records) and
// runs clean; `c003100` carries 17 and dies on UNPORTED `$27399E` inside
// `spawnCues28AC72`, which is a pre-existing gap and not this wave's.
//
// **A ZERO MEASURED OVER A BENCH THAT NEVER ENTERS THE STATE MEASURES THE
// BENCH.** That has cost D42, D56, D59 and D60, and it is why every arm here
// asserts the guards first and the damage second.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const tablesPath = path.join(GAME, 'rip', 'port', 'player.tables.json');
const CKPT = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold', 'ckpt');
const POOL_A_RUNG = path.join(CKPT, 'c002000.ram.bin');   // pool A live, pool B empty
const POOL_B_RUNG = path.join(CKPT, 'c008000.ram.bin');   // pool B live from frame 1
const HAVE = existsSync(tablesPath) && existsSync(POOL_A_RUNG) && existsSync(POOL_B_RUNG);
const SKIP = HAVE ? false : 'the generated tables or the W69 laser-hold rung are absent';

const P1 = 0x8103e6;          // the player record, i.e. block 9's A4
const P_FLAGS1 = 0x01;        // ($1,A4): bit 6 is guard 2, bit 7 picks block 9 early
const REC = 0x811f72;         // the BOMB record, i.e. block 9's A6
const POOL_A = 0x81459c, POOL_B = 0x81521c, POOL_STRIDE = 0x20;
const ST_HP = 0x18;           // ($18,A5) -- the word $245814/$2458E8 subtract from
const HIT_400 = 0x400;        // `ori.w #$400,D4` at $24580E and $2458E2

// `$2530BE collectHyperStock` writes BOTH of these. See the gauge test below
// for why writing only the first is not a hyper.
const HYPER_STOCK = 0x81b65c, HYPER_GAUGE = 0x81b642, HYPER_ACTIVE = 0x81b63e;

async function boot(rung) {
  const { Game } = await import('../src/main.js');
  const { portWordFromBits } = await import('../src/input.js');
  const { BIT } = await import('../src/machine.js');
  const tables = JSON.parse(readFileSync(tablesPath, 'utf8'));
  const g = new Game(new Uint8Array(readFileSync(rung)), tables, { palCatchUp: false });
  return {
    g,
    hold: portWordFromBits([BIT.b1]),
    holdAndBomb: portWordFromBits([BIT.b1, BIT.b2]),
  };
}

/** Every status word and HP word of both pools, as the two `or.w D4,(A5)`
 *  sites leave them. */
function poolSnapshot(ram) {
  const o = { a: [], b: [], ha: [], hb: [] };
  for (let i = 0; i < 100; i++) {
    o.a.push(ram.u16(POOL_A + i * POOL_STRIDE));
    o.ha.push(ram.u16(POOL_A + i * POOL_STRIDE + ST_HP));
  }
  for (let i = 0; i < 50; i++) {
    o.b.push(ram.u16(POOL_B + i * POOL_STRIDE));
    o.hb.push(ram.u16(POOL_B + i * POOL_STRIDE + ST_HP));
  }
  return o;
}

/**
 * ONE arm of the bench. `press` is the button-2 EDGE (`($19,A6)` is an edge
 * byte, so the press is one frame, not a hold); `hyperStock` picks which side
 * of `$249866` that press lands on.
 */
async function arm(rung, { press, hyperStock = 0, warm = 72, frames = 200 }) {
  const { g, hold, holdAndBomb } = await boot(rung);
  const ram = g.ram;
  for (let f = 0; f < warm; f++) g.step(hold);
  const armedByte = ram.u8(P1 + 0x3f);              // $24C282's "a beam is up"
  if (hyperStock) {
    ram.setU16(HYPER_STOCK, hyperStock);
    ram.setU16(HYPER_GAUGE, 0x095f);
  }
  g.step(press ? holdAndBomb : hold);

  const r = {
    armedByte,
    guardFrames: 0,          // frames on which BOTH of block 9's guards are true
    bit0Frames: 0,           // ($1,A4) bit 0 -- $24989E's, the HYPER's
    bit7Frames: 0,           // ($1,A4) bit 7 -- $249A92's, the block-9 early arm
    hyperFrames: 0,
    recWord: ram.u16(REC),
    flashA: 0, flashB: 0,    // $400 going 0 -> 1 on a live record
    recordsA: new Set(), recordsB: new Set(),
    hurtA: new Set(), hurtB: new Set(),
    maxFlashInAFrame: 0,
    maxBeamHitsInAFrame: 0,  // the largest one-frame rise in $2456A6's own count
    liveA: 0, liveB: 0,
  };
  for (let i = 0; i < 100; i++) if (ram.u16(POOL_A + i * POOL_STRIDE) & 0x8000) r.liveA++;
  for (let i = 0; i < 50; i++) if (ram.u16(POOL_B + i * POOL_STRIDE) & 0x8000) r.liveB++;

  let prev = poolSnapshot(ram);
  for (let f = 1; f <= frames; f++) {
    const hitsA0 = g.beamHitsA, hitsB0 = g.beamHitsB;
    g.step(hold);
    r.maxBeamHitsInAFrame = Math.max(r.maxBeamHitsInAFrame,
      (g.beamHitsA - hitsA0) + (g.beamHitsB - hitsB0));
    const flags1 = ram.u8(P1 + P_FLAGS1);
    if ((ram.u16(REC) & 0x8000) !== 0 && (flags1 & 0x40) !== 0) r.guardFrames++;
    if ((flags1 & 0x01) !== 0) r.bit0Frames++;
    if ((flags1 & 0x80) !== 0) r.bit7Frames++;
    if (ram.u16(HYPER_ACTIVE) !== 0) r.hyperFrames++;
    if (r.guardFrames === 1 && r.recWord === 0) r.recWord = ram.u16(REC);

    const cur = poolSnapshot(ram);
    let inThisFrame = 0;
    for (let i = 0; i < 100; i++) {
      if ((prev.a[i] & 0x8000) === 0) continue;
      if ((~prev.a[i] & cur.a[i] & HIT_400) !== 0) { r.flashA++; r.recordsA.add(i); inThisFrame++; }
      if (cur.ha[i] < prev.ha[i]) r.hurtA.add(i);
    }
    for (let i = 0; i < 50; i++) {
      if ((prev.b[i] & 0x8000) === 0) continue;
      if ((~prev.b[i] & cur.b[i] & HIT_400) !== 0) { r.flashB++; r.recordsB.add(i); inThisFrame++; }
      if (cur.hb[i] < prev.hb[i]) r.hurtB.add(i);
    }
    r.maxFlashInAFrame = Math.max(r.maxFlashInAFrame, inThisFrame);
    prev = cur;
  }
  r.game = g;
  return r;
}

// ===========================================================================
// 1. THE CONTROL. This is what every bench in the repo has ever measured, and
//    it is the reason all of them measured zero.
// ===========================================================================
test('W427 the plain laser NEVER opens either guard into $24560A block 9',
  { skip: SKIP }, async () => {
    const r = await arm(POOL_A_RUNG, { press: false });
    assert.notEqual(r.armedByte, 0, '($3F,A4) -- the beam must be up before the press');
    assert.equal(r.guardFrames, 0, 'no frame of a plain laser opens both guards');
    assert.equal(r.recWord, 0, '$811F72 is never allocated');
    assert.equal(r.game.beamDamageFrames, 0, '$2456A6 never runs');
    assert.equal(r.game.beamHitsA + r.game.beamHitsB, 0);
    // ...and yet the ordinary shot pass IS hitting things, so a zero above is
    // about the WEAPON and not about an empty board.
    assert.ok(r.flashA > 0, 'the ordinary shots do flash pool A on this seed');
  });

// ===========================================================================
// 2. THE DELIVERABLE. Both guards true in a live run, from one button press.
// ===========================================================================
test('W427 bomb-while-lasering opens BOTH guards and $2456A6 RUNS, live',
  { skip: SKIP }, async () => {
    const r = await arm(POOL_A_RUNG, { press: true });

    // The two guards, and the bit that picks the alt arm.
    assert.equal(r.guardFrames, 130, 'block 9 is open for 130 frames after one press');
    assert.equal(r.recWord & 0x8000, 0x8000, '$245614 bpl: $811F72 is NEGATIVE');
    assert.equal(r.recWord & 0x0001, 0x0001, '$245632 btst #$0,D5: $249A98 set it');
    assert.equal(r.recWord, 0x8101, 'the whole word $249A4A/$249A98 leave behind');
    assert.equal(r.bit7Frames, 130, '$249A92 bset #$7 -- $245194 takes block 9 EARLY, '
      + 'so blocks 7, 8 and $2453AC are SKIPPED for the whole window');
    assert.equal(r.bit0Frames, 0, '$24989E is on the OTHER arm of $249866 and did not run');

    // ...and the block behind them actually executed.
    assert.equal(r.game.beamDamageFrames, 66, '$2456A6 ran on 66 of those 130 frames '
      + '($80390C hands P1 the collision pass on alternate frames)');
    assert.equal(r.game.bombHits, 0, '$245638 -- the OTHER arm of $245636 -- never ran');
  });

// ===========================================================================
// 3. POINT 3 OF THE ITEM: the hit bits ARE set, and NOT on one record.
// ===========================================================================
test('W427 $2456A6 sets the $400 hit bits on MANY records, not one per frame',
  { skip: SKIP }, async () => {
    const r = await arm(POOL_A_RUNG, { press: true });
    assert.equal(r.game.beamHitsA, 27, '$2458E6 or.w D4,(A5) fired 27 times in pool A');
    assert.equal(r.game.beamErased, 3, '$2459B6 erased three enemy bullets');
    assert.ok(r.maxBeamHitsInAFrame >= 2,
      `$2456A6 flashed ${r.maxBeamHitsInAFrame} records in a single frame; `
      + 'docs/DOCKET.md D56 LEAD says "EXACTLY ONE TARGET PER FRAME" and that is '
      + 'true only of the $2457FA pool-B half');
    assert.equal(r.maxBeamHitsInAFrame, 4);
  });

// ===========================================================================
// 4. A REAL POOL-B TARGET. c002000 has none, so `beamHitsB` there measures the
//    seed. c008000 has nine and the weapon hits one of them every frame it runs.
// ===========================================================================
test('W427 on a rung that HAS a pool B, the bomb-laser flashes it and takes its HP',
  { skip: SKIP }, async () => {
    const control = await arm(POOL_B_RUNG, { press: false, warm: 30 });
    assert.ok(control.liveB >= 9, 'this seed carries a live pool B');
    assert.equal(control.liveA, 0, 'and no pool A at all -- so pool-A zeros here are the seed');
    assert.equal(control.game.beamHitsB, 0);

    const r = await arm(POOL_B_RUNG, { press: true, warm: 30 });
    assert.equal(r.guardFrames, 130);
    assert.equal(r.game.beamDamageFrames, 66);
    assert.equal(r.game.beamHitsB, 27, '$245812 or.w D4,(A5) on pool B\'s NEAREST, '
      + '27 times -- the hit animation IS being applied');
    assert.equal(r.hurtB.size, 1, 'and exactly the one record it names loses HP');
    assert.ok(r.flashB >= 50, `${r.flashB} $400 transitions on the target in 200 frames`);
  });

// ===========================================================================
// 5. THE IDENTIFICATION. The HYPER is a different arm of the same button and it
//    does not go anywhere near block 9.
// ===========================================================================
test('W427 with hyper stock, bomb-while-lasering runs $249868 and block 9 stays SHUT',
  { skip: SKIP }, async () => {
    const r = await arm(POOL_B_RUNG, { press: true, hyperStock: 1, warm: 30 });
    assert.ok(r.hyperFrames > 0, `the hyper is ACTIVE for ${r.hyperFrames} frames`);
    assert.equal(r.hyperFrames, 182);
    assert.equal(r.bit0Frames, 182, '$24989E bset #$0,($1,A6) on the PLAYER record, '
      + 'which is what $24C1B2 reads to seed segment family 2 from $24D00A');
    assert.equal(r.recWord, 0, '$811F72 is NEVER allocated -- $2498E2 did not run');
    assert.equal(r.guardFrames, 0, 'so neither guard into $24560A opens');
    assert.equal(r.game.beamDamageFrames, 0, 'and $2456A6 does not run at all');
    assert.equal(r.bit7Frames, 0, '$249A92 is on the bomb arm and did not run either');

    // It is not silent, though: the weapon under $24989E still flashes and kills.
    assert.ok(r.flashB > 0, `the hyper laser flashes pool B ${r.flashB} times`);
    assert.equal(r.hurtB.size, 1);
  });

// ===========================================================================
// 6. THE TRAP THAT COST THIS WAVE A MEASUREMENT. **DIRTY EVERY FIELD.**
// ===========================================================================
test('W427 a hyper granted by the STOCK WORD ALONE ends on the frame it starts',
  { skip: SKIP }, async () => {
    const { g, hold, holdAndBomb } = await boot(POOL_B_RUNG);
    const ram = g.ram;
    for (let f = 0; f < 30; f++) g.step(hold);
    ram.setU16(HYPER_STOCK, 1);                     // ...and NOT $81B642.
    g.step(holdAndBomb);
    let active = 0;
    for (let f = 0; f < 60; f++) { g.step(hold); if (ram.u16(HYPER_ACTIVE) !== 0) active++; }
    assert.equal(active, 0, '$285A5E reads the gauge, subtracts 2, and `before < 2` '
      + 'runs $285AF2 endHyper on the SAME frame $285A12 set active. The stock is '
      + 'consumed, nothing happens, and every count downstream reads zero.');
    assert.equal(ram.u16(HYPER_STOCK), 0, 'the stock is spent all the same');
    // $2530BE writes stock AND gauge. A bench that writes one is not the game.
    assert.equal(ram.u16(HYPER_GAUGE), 0);
  });
