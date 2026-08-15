// W384 -- WHY STAGE 1 REACHES A FIXED POINT AND NEVER PROGRESSES. THE MEASUREMENT.
//
// ===============================================================================================
// THE ANSWER IN ONE LINE
// ===============================================================================================
//
// **THERE IS NO PLAYER.** A cold boot reaches gameplay, draws a background, spawns enemies, runs
// the midboss and arrives at the stage-1 boss -- with object dispatch types **2 and 3 never once
// created**. `$8103E6` (`RAM.player1`) stays `$0000` for the whole run, so `$2428A6`
// (`livePlayers2428A6`) returns 0 forever, so `$294F44/$294F4A` re-floors the boss's 10,800-frame
// timeout to `$78` every 120 frames at `$294F50` and the stage can never end.
//
// The odometer stopping at 836 is NOT the bug. It is the cartridge's own stage-1 BOSS LOCK and it
// is exactly on time (SECTION 1).
//
// ===============================================================================================
// THREE PLACES THE BRIEF THAT SET THIS WAVE IS WRONG, ALL PINNED BELOW
// ===============================================================================================
//
// 1. **"RAM is byte-identical at +10,000 and +120,000."** IT IS NOT. 3,481 bytes across 57
//    256-byte blocks differ between +10,000 and +14,000 alone (SECTION 2); at +120,000 the figure
//    is 3,728 bytes across the same 57 blocks. `w383coldboot.test.js` compares FOUR WORDS and
//    calls the result a fixed point. The machine is still running -- enemies spawn, the boss
//    fires, the RNG turns. What is frozen is the SCROLL, on purpose.
//
// 2. **"Something upstream of the odometer stalls."** Nothing upstream stalls. `$26214C` (op $0C
//    FREEZE) latches `($8,A5)` at scroll-record time `t = $0344` = 836, and its op-$04 partner
//    armed `loops = $FFFF`, so `$261FA8` always takes the rewind branch and the VM can never
//    release its own freeze. `$261324` is the ONLY reader of that flag and it guards exactly one
//    instruction, `$26132C addq.w #$1,$8130CE`. The odometer is the only thing that stops
//    (SECTION 1). `background.js:61-70` already says so; this file measures the frame.
//
// 3. **"It will most likely be a counted `note()` on the path."** It is -- but not the one the
//    brief's own leading candidate (`$261142`, the external unfreeze) points at, and the note text
//    for that one is a red herring for stage 1: its two callers `$26C7F4`/`$26D254` are the
//    STAGE-3 carrier (`src/stage3carrier.js`, ROM closure `$26C266..$26D6EE`), which cannot run in
//    stage 1. Stage 1 does not need the scroll released at all -- it needs the BOSS TO DIE, and
//    `boss.js`'s own header says "STAGE 1 ENDS EVEN IF THE BOSS IS NEVER SHOT" via the
//    `$294F3C subq.w #$1,$22(a5)` timeout. The timeout is what is blocked, and the blocker is the
//    missing player (SECTIONS 3-5).
//
// ===============================================================================================
// THE CALL GRAPH THAT IS BROKEN, EVERY LINK BY ADDRESS
// ===============================================================================================
//
//   $2605C8   the rank object's state-0 INIT (object type $A)
//     $260700   bsr.w $25FE42                                   <-- **DEFERRAL 1, counted 1x**
//       $25FE42..$25FEDE, 156 bytes / 29 instructions, table at $25FE22..$25FE41 (32 bytes).
//       Fills BOTH $24-byte dispatcher entries $8130FA (P1) and $81311E (P2) with
//         ($C,$E)/($10,$12) = the spawn position ($1000,$0E00 / $1000,$2A00)
//         ($14)            = THE OBJECT TYPE, 2 for P1 and 3 for P2
//         ($16)            = the side, 0 / 1
//         ($8)             = the LIVES POINTER, $8130BE / $8130C0
//       then $25FEA6/$25FEB6/$25FECC create dispatch types 0, 4 and 4 (the HUD and the two
//       announcement objects). Its ONLY callee is $241182, which this port has as
//       `objalloc.js stageCreate`.
//
//   $25D560   the select screen's state-7 handler (`objslot17.js phase7_25D560`)
//     $25D73E   jsr $2603FE, behind the `$812F80` one-shot latch     <-- **DEFERRAL 2, counted 1x**
//       (`$260558 bsr.w $2603FE` from `$26051A` is a SECOND call site and it does NOT fire on a
//       cold boot: it is gated on `$813080`, which the handoff leaves 0. The census carries
//       objslot17.js's text -- "D0 = record 0's ($56) anchor $117914C0" -- and not rank.js's.)
//       $2603FE..$2604A8, 171 bytes / 40 instructions. For each side whose $813084/$813086 is
//       not $FF it runs `$260434 jsr $25FF38` with D1 = **4** -- i.e. it ARMS BONUS-LINE REQUEST 4
//       -- and creates a type-$B object. Its callees: $25FF38 (ported, `player.js
//       armRequest25FF38`), $241182 (ported), $287084 and $2870E6 (25 instructions each, pure RAM
//       writes to $81B4xx), $287A5E (unread).
//
//   $25FF7A   the bonus-line dispatcher, walking $8130FA and $81311E at stride $24
//     request 4 -> $2601F4 (`tally.js bonusLine42601F4`, PORTED since W292)
//       $260204   move.w (A1,D0.w),(A0)     seeds the LIVES COUNTER from the $80380E dip
//       $26022A   move.w ($14,A6),D0 / jsr $241182   **CREATES THE PLAYER OBJECT**
//     -> $2491C0 (`player.js playerObject2491C0`, PORTED)
//       $2492E4   or.w (the $24915E template word),(A6)  sets $8103E6 bit 15
//     -> $2428A6 `livePlayers2428A6` finally non-zero
//     -> $294F32's re-floor is skipped, $294F60 jmp $294DD4, D-script 6, $242952, stage advance.
//
// **AND THE DISPATCHER ITSELF IS BROKEN INDEPENDENTLY OF THE TWO DEFERRALS.** `tally.js` ports all
// nine bonus lines and exports `tallyDriver25FF7A`, and NOTHING IN `src/` CALLS IT. `rank.js` runs
// `$25FF7A` at two sites ($2607A4 and $26059E) through its own `computedDispatch`, whose
// `DISP_25FF7A_TARGETS` maps only requests 1 and 9 and `unreached()`s the rest with the text
// "a per-player hyper/palette/sound servicer ... the unported hyper subsystem (Wave B)".
// **THAT TEXT IS STALE AND FALSE**: `$25FF52` is the bonus-line table and every line 1..9 has been
// ported (W289..W296). SECTION 6 pins both halves. It is also a LIVE CRASH, not a latent one:
// `$25FFA8` (request 1, the respawn) arms request **2** at `$260004` when a side runs out of
// lives, so any real death sequence walks straight into the throw.
//
// ===============================================================================================
// WHAT IS **NOT** CLAIMED HERE
// ===============================================================================================
//
// Nothing in `src/` is changed by this wave. Porting `$25FE42` + `$2603FE` + wiring `$25FF7A`
// touches `rank.js`, needs `$287084`/`$2870E6`/`$287A5E`, turns object type $B ($240F62[11],
// $25DBB4) on for the first time, and immediately runs into a FOURTH gap that is nothing to do
// with the stall: `sound.js postWrapper` THROWS (it does not `note()`) on `$28C170`, reached from
// `boss.js bossClear242922` inside `$294DD4`. Measured by driving the whole chain from a harness
// (see the wave report). That is a wave, not a bounded fix, so this file measures and does not
// patch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { Ram } from '../src/ram.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { portWordFromBits } from '../src/input.js';
import { BIT, RAM } from '../src/machine.js';
import { SCREEN8 } from '../src/objslot8.js';
import { ALLOC } from '../src/objalloc.js';
import { ENEMY } from '../src/enemies.js';
import { BGRAM } from '../src/background.js';
import { BOSS, livePlayers2428A6, bossTimeout294F32 } from '../src/boss.js';
import { TALLY, tallyDriver25FF7A } from '../src/tally.js';
import { RANK } from '../src/rank.js';
import { Unreached } from '../src/unported.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const tablesJson = JSON.parse(readFileSync(here('../rip/port/player.tables.json'), 'utf8'));
const seed = new Uint8Array(readFileSync(here('../rip/web/seed.bin')));

const NO_PLAYER = 0xffff;
const STATE = SCREEN8.state;          // $812E56
const ODO = BGRAM.clock;              // $8130CE
const P1REC = RAM.player1;            // $8103E6
const P2REC = RAM.player2;            // $810448
const LIVEBITS = 0x813090;            // $2491CC ori.w #$1,$813090
const LIVES1 = 0x8130BE;              // the P1 lives counter $25FE42 points ($8,A6) at
const BOSS1 = 0x292902;               // the stage-1 boss's per-frame handler

const coinWord = () => (0xffff & ~(1 << COIN_BITS.COIN1)) & 0xffff;

/** `w383coldboot.test.js`'s chain, unchanged, and its milestone asserted so this file cannot
 *  silently measure a run that never started. The two traps that file documents are load-bearing
 *  here too: the coin word is `$FFFE` from a BIT INDEX, and START is `portWordFromBits`, not
 *  `~(1 << BIT.start)`. */
function bootToGameplay() {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);                       // the coinage dip, the one hand-written byte
  const run = (n, coin = COIN.idle, player = NO_PLAYER) => {
    g.coinPort = coin;
    for (let i = 0; i < n; i++) g.step(player);
  };
  run(20);
  run(380);
  run(20, coinWord());
  run(10);
  run(20, COIN.idle, portWordFromBits([BIT.start]));
  assert.equal(g.ram.u16(STATE), 0x000e, 'the harness must reach gameplay before measuring');
  return g;
}

// -------------------------------------------------------------------------------------------
// ONE 14,000-FRAME RUN, SHARED. It costs about seven seconds, and every section below reads a
// different fact out of the SAME run rather than paying for it again -- so the sections cannot
// disagree with each other about what the machine did.
// -------------------------------------------------------------------------------------------
const RUN = (() => {
  const g = bootToGameplay();

  const typesLive = () => {
    const out = new Set();
    for (let i = 0; i < ALLOC.slots; i++) {
      const t = g.ram.u16(ALLOC.table + i * ALLOC.stride);
      if (t !== 0) out.add(t & 0x7fff);
    }
    return out;
  };
  const bossRec = () => {
    for (let i = 0; i < ENEMY.slots; i++) {
      const rec = ENEMY.table + i * ENEMY.stride;
      if (g.ram.u16(rec) !== 0 && (g.ram.u32(rec + ENEMY.handlerOff) & 0xffffff) === BOSS1) {
        return rec;
      }
    }
    return 0;
  };

  const everLive = new Set();
  let odo = 0, odoLastFrame = 0, bossFirstFrame = 0;
  let at10k = null;

  for (let f = 1; f <= 14000; f++) {
    g.step(NO_PLAYER);
    for (const t of typesLive()) everLive.add(t);
    const o = g.ram.u16(ODO);
    if (o !== odo) { odo = o; odoLastFrame = f; }
    if (!bossFirstFrame && bossRec()) bossFirstFrame = f;
    if (f === 10000) at10k = Uint8Array.from(g.ram.b);
  }

  let diffBytes = 0;
  const diffBlocks = new Set();
  for (let i = 0; i < at10k.length; i++) {
    if (at10k[i] !== g.ram.b[i]) { diffBytes++; diffBlocks.add((0x800000 + i) & ~0xff); }
  }

  return {
    g, everLive, odo, odoLastFrame, bossFirstFrame, bossRec: bossRec(),
    diffBytes, diffBlocks: diffBlocks.size,
    notes: g.unportedLog.report(),
  };
})();

/** The census line for a ROM address, or `null`. `UnportedLog` keys are `$ADDR what`, so a prefix
 *  match on the address plus a space is exact and survives an edit to the note's prose. */
const noteFor = (addr) => {
  const key = `$${addr.toString(16).toUpperCase()} `;
  return RUN.notes.find((l) => l.includes(` x ${key}`)) ?? null;
};
const noteCount = (addr) => {
  const l = noteFor(addr);
  return l === null ? 0 : Number(l.trim().split(' ')[0]);
};

// =============================================================================================
// 1 -- WHAT STOPS FIRST: THE ODOMETER, AND IT STOPS BECAUSE THE CARTRIDGE TOLD IT TO.
//
// `$8130CE` is bumped at `$26132C`, one instruction, guarded by `$261324 tst.w ($8,A5)`. Op $0C
// (`$26214C`) sets that flag at scroll-record `t = $0344`, and its op-$04 partner armed
// `loops = $FFFF`, which `background.js:994-1014` already identifies as the stage-1 boss lock.
// The gate the brief warned about looking for IS HERE, and the hold IS intended.
// =============================================================================================

test('W384 the odometer stops at 836 = $0344, the frame the scroll VM latches the boss lock', () => {
  assert.equal(RUN.odo, 836, 'the odometer parks at 836 and 836 is $0344, the record time');
  assert.equal(RUN.odo, 0x0344, '...spelled the way the scroll record spells it');
  assert.ok(RUN.odoLastFrame > 9300 && RUN.odoLastFrame < 9400,
    `and its LAST movement is at +9,364 past START; measured +${RUN.odoLastFrame}`);

  // The freeze is real and it is the op-$0C-with-loops-$FFFF one, counted exactly once.
  assert.equal(noteCount(0x261142), 1,
    '$26214C latched the unreleasable freeze exactly once -- see background.js:1007');
  assert.match(noteFor(0x261142), /t=\$0344/,
    'and it names the record time $0344, which is the odometer value it stopped at');

  // POSITIVE CONTROL: the freeze word is the CLOCK's, not the scroll's. $8130D2 -- the global
  // pause, the only other thing that could stop the whole handler -- is clear.
  assert.equal(RUN.g.ram.u16(BGRAM.bgFreeze), 0,
    'POSITIVE CONTROL: $8130D2 is 0, so $2612A0 ran every frame -- the handler is not paused');
});

// =============================================================================================
// 2 -- THE BRIEF'S "FIXED POINT" IS NOT ONE. THE MACHINE IS STILL RUNNING.
//
// `w383coldboot.test.js` SECTION 5 compares four words and calls +120,000 "byte-identical" to
// +10,000. Four words are identical. The RAM is not.
// =============================================================================================

test('W384 RAM is NOT a fixed point after +10,000 -- thousands of bytes still move', () => {
  assert.ok(RUN.diffBytes > 2000,
    `+10,000 vs +14,000 must differ in thousands of bytes (measured 3,481); got ${RUN.diffBytes}`);
  assert.ok(RUN.diffBlocks > 40,
    `...spread over dozens of 256-byte blocks (measured 57); got ${RUN.diffBlocks}`);

  // ...while the four words w383 watches really are stable, which is why that test passes and
  // this one is not a contradiction of it.
  assert.equal(RUN.g.ram.u16(STATE), 0x000e, 'slot [8] is still on arm $E');
  assert.equal(RUN.g.ram.u16(ODO), 836, 'and the odometer really has not moved');
});

// =============================================================================================
// 3 -- THE STALL ITSELF: OBJECT DISPATCH TYPES 2 AND 3 ARE NEVER CREATED.
//
// `$240F62[2] = $2491C0` (P1) and `[3] = $249246` (P2) are the PLAYER OBJECTS, and `main.js`
// wires both to `playerObject2491C0`. Neither is ever staged, so the handler never runs, so the
// record `$8103E6` is never given the `$24915E` template word that sets its bit 15.
// =============================================================================================

test('W384 THE PLAYER OBJECT IS NEVER CREATED -- dispatch types 2 and 3 never go live', () => {
  assert.ok(RUN.everLive.size > 0, 'POSITIVE CONTROL: some objects did live');
  assert.deepEqual([...RUN.everLive].sort((a, b) => a - b), [0x1, 0x5, 0x9, 0xa],
    'over 14,000 frames the object table holds ONLY $1 (background), $5, $9 (select) and $A (rank)');
  assert.ok(!RUN.everLive.has(2), 'dispatch type 2 -- P1 -- is never staged');
  assert.ok(!RUN.everLive.has(3), 'dispatch type 3 -- P2 -- is never staged');

  assert.equal(RUN.g.ram.u16(P1REC), 0, '$8103E6 is still ZERO: there is no P1 record');
  assert.equal(RUN.g.ram.u16(P2REC), 0, '$810448 is still ZERO: there is no P2 record');
  assert.equal(RUN.g.ram.u16(LIVEBITS), 0, '$813090 is 0 -- $2491CC never ran for either side');
  assert.equal(RUN.g.ram.u16(LIVES1), 0, '$8130BE is 0 -- the lives counter was never seeded');
});

test('W384 and the two dispatcher entries $25FE42 fills are still blank', () => {
  const r = RUN.g.ram;
  for (const [name, e] of [['P1 $8130FA', TALLY.side0], ['P2 $81311E', TALLY.side1]]) {
    assert.equal(r.u32(e + TALLY.ptr), 0, `${name} ($8,A6): the LIVES POINTER is null`);
    assert.equal(r.u16(e + TALLY.type), 0, `${name} ($14,A6): the OBJECT TYPE is 0, not 2/3`);
    assert.equal(r.u16(e + TALLY.argA), 0, `${name} ($10,A6): no spawn X`);
    assert.equal(r.u16(e + TALLY.argB), 0, `${name} ($12,A6): no spawn Y`);
    assert.equal(r.u16(e + 0x00), 0, `${name} (A6): and no bonus-line request is ever armed`);
  }

  // THE POSITIVE CONTROL, AND IT IS THE BOARD'S OWN: `rip/web/seed.bin` was ripped mid-stage-1
  // from a real run, so it carries exactly what $25FE42 writes. Every field this port leaves at
  // zero is non-zero there, with the values the $25FE22 table holds.
  const s = new Ram(seed);
  assert.equal(s.u32(TALLY.side0 + TALLY.ptr), LIVES1, 'SEED: ($8,A6) = $8130BE, the lives ptr');
  assert.equal(s.u32(TALLY.side1 + TALLY.ptr), 0x8130c0, 'SEED: P2 points at $8130C0');
  assert.equal(s.u16(TALLY.side0 + TALLY.type), 2, 'SEED: ($14,A6) = 2, the P1 object type');
  assert.equal(s.u16(TALLY.side1 + TALLY.type), 3, 'SEED: and 3 for P2');
  // ($C,$E) still hold the table's literals; ($10,$12) do NOT, because `$260414 move.l D0,($10,A2)`
  // in `$2603FE` overwrites the pair with the LIVE position the handoff passes. Asserting the
  // literals at ($10,$12) would be asserting a value the board has already moved on from.
  assert.equal(s.u16(TALLY.side0 + 0x0c), 0x1000, 'SEED: ($C,A6) = $1000, the table spawn X');
  assert.equal(s.u16(TALLY.side0 + 0x0e), 0x0e00, 'SEED: ($E,A6) = $0E00, the table spawn Y');
  assert.notEqual(s.u16(TALLY.side0 + TALLY.argA), 0,
    'SEED: and ($10,A6) is non-zero -- $260414 has since written the live position through it');
  assert.equal(s.u16(P1REC) & 0x8000, 0x8000, 'SEED: $8103E6 bit 15 -- the player EXISTS');
  assert.equal(s.u16(LIVEBITS), 1, 'SEED: $813090 = 1, P1 is live');
  assert.equal(s.i16(LIVES1), 2, 'SEED: and $8130BE = 2, two lives in hand');
});

// =============================================================================================
// 4 -- THE CONSEQUENCE: `$2428A6` RETURNS 0, SO THE BOSS TIMEOUT RE-FLOORS FOREVER.
//
// `boss.js`'s own header: "STAGE 1 ENDS EVEN IF THE BOSS IS NEVER SHOT" -- `$22(a5)` is $2A30 =
// 10,800 and `$294F3C` spends one per frame. `$294F50 move.w #$78,$22(a5)` is the arm that makes
// that untrue with no live player, and `boss.js:214-216` says it is "unexercised in every run
// this wave measured (a player is alive throughout)". ON A COLD BOOT IT IS THE ONLY ARM THERE IS.
// =============================================================================================

test('W384 the stage-1 boss is alive and stays alive, with $2428A6 reading zero', () => {
  assert.ok(RUN.bossFirstFrame > 8000 && RUN.bossFirstFrame < 9000,
    `the boss arrives around +8,614; got +${RUN.bossFirstFrame}`);
  assert.notEqual(RUN.bossRec, 0, 'and it is STILL in the enemy table at +14,000');
  assert.equal(RUN.g.ram.u32(RUN.bossRec + ENEMY.handlerOff) & 0xffffff, BOSS1,
    'the record dispatches $292902, the stage-1 boss handler');
  assert.equal(livePlayers2428A6(RUN.g.ram), 0,
    '$2428A6 reports NO live player, which is what re-floors the timeout');
  assert.equal(RUN.g.ram.u16(BOSS.deathPause), 0,
    'POSITIVE CONTROL: $8130D2 is clear, so $294F32 is not being skipped at its first line');
});

test('W384 $294F50 re-floors the timeout to $78 with no player, and does NOT with one', () => {
  // A bare RAM, so the ONLY thing that differs between the two halves is $8103E6's bit 15.
  const a5 = 0x813700, a6 = 0x815200;

  const noPlayer = new Ram(null);
  noPlayer.setU16(a5 + BOSS.timeout, 1);              // one frame from expiry
  assert.equal(livePlayers2428A6(noPlayer), 0, 'POSITIVE CONTROL: no player in this RAM');
  bossTimeout294F32(noPlayer, null, {}, a5, a6);      // $294F3C -> 0 -> $294F44 -> $294F50
  assert.equal(noPlayer.u16(a5 + BOSS.timeout), 0x78,
    '$294F50 RE-FLOORS to 120 -- the boss cannot time out over a dead player, forever');

  // THE ABLATION. Same RAM, same timeout, one bit set: `$2428AE tst.w / bpl` needs bit 15, and
  // `$2428B0 btst #0` needs the HIGH byte's bit 0 clear.
  const withPlayer = new Ram(null);
  withPlayer.setU16(a5 + BOSS.timeout, 1);
  withPlayer.setU16(RAM.player1, 0x8000);            // $2492E4's template word, bit 15
  assert.equal(livePlayers2428A6(withPlayer), 0x10, 'P1 now counts as live -- $2428AE gives $10');
  // `$294F60 jmp $294DD4` needs a rom and a ctx this unit test does not have, so the death is
  // allowed to throw; what is asserted is that the RE-FLOOR did not happen, which is the whole
  // difference the missing player makes.
  try { bossTimeout294F32(withPlayer, null, {}, a5, a6); } catch { /* $294DD4 needs a rom */ }
  assert.notEqual(withPlayer.u16(a5 + BOSS.timeout), 0x78,
    'with a live player the counter is NOT re-floored -- $294F44 falls through to the death');
  assert.equal(withPlayer.u16(a5 + BOSS.timeout), 0,
    '...it is left at 0 and $294F5A/$294F60 take over');
});

// =============================================================================================
// 5 -- THE TWO DEFERRALS ON THE PATH, BY ADDRESS AND BY COUNT.
//
// Both are counted `note()`s that this run HITS. Neither is stale: `claimed.py` and the files
// agree that nothing in `src/` implements either address.
// =============================================================================================

test('W384 DEFERRAL 1: $25FE42 -- the routine that fills both dispatcher entries', () => {
  assert.equal(noteCount(0x25fe42), 1,
    '$260700 bsr.w $25FE42 is reached exactly once, inside the $2605C8 state-0 INIT');
  assert.match(noteFor(0x25fe42), /\$260700/, 'and the note names its one call site');
});

test('W384 DEFERRAL 2: $2603FE -- the routine that ARMS BONUS-LINE REQUEST 4', () => {
  assert.equal(noteCount(0x2603fe), 1, '$2603FE is reached exactly once on a cold boot');
  // AND THE SITE MATTERS, because $2603FE has TWO callers. The one that fires is
  // `$25D73E jsr $2603FE` in `objslot17.js phase7_25D560`, behind the $812F80 one-shot latch --
  // NOT `$260558 bsr.w $2603FE` in `rank.js stageInstall26051A`, which is gated on $813080 and
  // stays shut. The two notes have different prose, so the census names which one ran.
  assert.match(noteFor(0x2603fe), /record 0's \(\$56\) anchor/,
    'the note that fired is objslot17.js:920 ($25D73E), the select screen\'s state-7 handler');
  assert.doesNotMatch(noteFor(0x2603fe), /\$260558/,
    'and NOT rank.js:333 ($260558), whose $813080 gate never opens on a cold boot');
  // The two are INDEPENDENT: even with $25FE42 run, nothing would arm a request without this one.
  assert.equal(RUN.g.ram.u16(TALLY.side0 + 0x00), 0, 'so $8130FA never carries a request');
  assert.equal(RUN.g.ram.u16(TALLY.side1 + 0x00), 0, 'and neither does $81311E');
});

// =============================================================================================
// 6 -- THE THIRD BLOCKER, AND IT IS A STALE STUB WITH A FALSE NOTE.
//
// `rank.js` runs `$25FF7A` through its own `computedDispatch`, whose `DISP_25FF7A_TARGETS` maps
// requests 1 and 9 only, and `unreached()`s everything else claiming the targets belong to "the
// unported hyper subsystem (Wave B)". `tally.js` ports ALL NINE lines and exports
// `tallyDriver25FF7A` -- **which nothing in `src/` calls.** Both halves are asserted, and the
// second half is the ABLATION: the same request, the same RAM, one routine throws and the other
// creates the player object.
//
// **THIS TEST PINS THE BUG, NOT THE FIX.** When a later wave routes `$2607A4`/`$26059E` at
// `rank.js:717`/`rank.js:395` to `tallyDriver25FF7A`, half (a) SHOULD go red -- that is the
// signal that the wiring landed. Half (b) is the part that must stay green forever.
// =============================================================================================

test('W384 rank.js THROWS on bonus-line request 4, which tally.js has ported since W292', () => {
  assert.equal(RANK.disp25FF7ATable, TALLY.side0,
    'rank.js and tally.js walk the SAME table -- $8130FA, stride $24');
  assert.equal(RANK.disp25FF7AStride, TALLY.stride, '...and the same stride');
  assert.equal(RANK.disp25FF7AJump, 0x25ff52, '...and index the SAME jump table $25FF52');

  const g = bootToGameplay();
  for (let i = 0; i < 2100; i++) g.step(NO_PLAYER);       // past the handoff, rank state 1

  // $25FE42's two entries, from the ROM table at $25FE22 (proved against the seed in SECTION 3).
  g.ram.setU32(TALLY.side0 + TALLY.ptr, LIVES1);          // $25FE70 move.l ($C,A0),($8,A6)
  g.ram.setU16(TALLY.side0 + TALLY.argA, 0x1000);         // $25FE58
  g.ram.setU16(TALLY.side0 + TALLY.argB, 0x0e00);         // $25FE5E
  g.ram.setU16(TALLY.side0 + TALLY.type, 2);              // $25FE64 -- the P1 object type
  g.ram.setU16(TALLY.side0 + 0x16, 0);                    // $25FE6A -- side 0
  // ...and $2603FE's `$260434 jsr $25FF38` with D0 = 0, D1 = 4.
  g.ram.setU16(TALLY.side0 + 0x00, 4);

  // (a) THE STUB. The rank object's own $2607A4 refuses request 4 by address.
  let err = null;
  try { g.step(NO_PLAYER); } catch (e) { err = e; }
  assert.ok(err instanceof Unreached, 'the frame must stop with a NAMED Unreached, not survive');
  assert.equal(err.romAddress, RANK.disp25FF7A, 'it throws at $25FF7A, rank.js:627');
  assert.match(err.message, /hyper subsystem/,
    'with the STALE text -- $25FF52 is the BONUS-LINE table, not a hyper servicer');

  // (b) THE ABLATION. The request word survived the throw; hand the SAME state to tally.js's
  // driver and the player object is staged, the lives counter is seeded off the $80380E dip, and
  // $2428A6 stops reading zero.
  assert.equal(g.ram.u16(TALLY.side0 + 0x00), 4, 'the request is still armed after the throw');
  assert.equal(g.ram.u16(P1REC), 0, 'POSITIVE CONTROL: still no player record');

  const rankSlot = (() => {
    for (let i = 0; i < ALLOC.slots; i++) {
      const a = ALLOC.table + i * ALLOC.stride;
      if ((g.ram.u16(a) & 0x7fff) === 0x0a) return a;
    }
    return 0;
  })();
  assert.notEqual(rankSlot, 0, 'POSITIVE CONTROL: the rank object is in the table');

  // `Game#ctx()` is private, so the four fields `$2601F4`'s chain actually reads are handed over
  // by name off the Game's OWN objects -- not re-created -- so this is the real ROM, the real
  // palette state and the real census, and only the plumbing is local to the test.
  const ctx = { unportedLog: g.unportedLog, unported: g.unportedLog, rom: g.rom,
    palette: g.palette };
  tallyDriver25FF7A(g.ram, g.rom, ctx, rankSlot);          // $25FF7A, the driver nothing calls

  assert.equal(g.ram.u16(TALLY.side0 + 0x00), 0, '$2602A6 consumed the request');
  // `$26011C move.b $80380E,D0 / add.w D0,D0 / lea ($2600CE,PC),A1 / $260204 move.w (A1,D0.w),(A0)`.
  // $2600CE is `$0002 $0003 $0004 $0000 $0001`, and a cold board's $80380E is 0, so the counter
  // gets 2 -- which is exactly what `rip/web/seed.bin` carries at $8130BE (SECTION 3).
  assert.equal(g.ram.u8(0x80380e), 0, 'a cold board has the $80380E lives dip at index 0');
  assert.equal(g.ram.i16(LIVES1), 2,
    '$260204 seeded the lives counter through ($8,A6) from $2600CE[0] = 2');
  const staged = (() => {
    for (let i = 0; i < ALLOC.slots; i++) {
      if ((g.ram.u16(ALLOC.createStage + i * ALLOC.stride) & 0x7fff) === 2) return true;
    }
    return false;
  })();
  assert.ok(staged, '$26022E jsr $241182 STAGED DISPATCH TYPE 2 -- the P1 player object');
});
