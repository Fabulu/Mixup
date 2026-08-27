// W383 -- THE COLD-BOOT SOAK, PINNED.
//
// ===============================================================================================
// WHY THIS FILE EXISTS
// ===============================================================================================
//
// The project's headline claim -- "a cold boot reaches gameplay and survives" -- was, until this
// wave, proved by NOTHING IN THE TREE. Two waves reported a 120,000-frame soak in prose and
// neither persisted it. The longest committed loop was `i < 10799` in `w62stageend.test.js`, and
// that one starts from `rip/web/seed.bin` -- a board that was ALREADY mid-stage-1 when it was
// ripped. It cannot fail for a cold-boot reason because it never performs a cold boot.
//
// This file drives the real `Game` from a ZEROED 128 KiB of main RAM to gameplay and asserts the
// MILESTONES on the way, not merely the absence of a throw. A soak that only asserted "no throw"
// would pass on a run that did nothing at all -- e.g. one where the coin never credited and the
// machine sat on the credit screen for two minutes.
//
// ===============================================================================================
// HOW THE LONG SOAK IS GATED -- AND WHY THERE IS NO `skip`
// ===============================================================================================
//
// `DDPDOJ_SOAK=1 node --test games/ddpdoj/tests/w383coldboot.test.js` runs the full
// 120,000-frame soak (SECTION 5). It takes about two minutes of wall clock, which is why it is
// not in the default suite.
//
// It is gated by a plain `if (SOAK)` around the `test(...)` CALL, so when the variable is absent
// the file simply DEFINES FEWER TESTS. It is NOT `{ skip: ... }`: this tree's standing property
// is zero skips, and a skipped test still prints as one. `node --test` reports 0 skipped either
// way here.
//
// The DEFAULT run (SECTION 4) is 3,000 frames past the START press, which is chosen and not
// guessed: `$81315C` -- the last milestone on the boot chain -- is installed at frame +2,045
// past START (measured; SECTION 4 asserts the window). 3,000 clears it with room and costs a few
// seconds rather than two minutes.
//
// ===============================================================================================
// THE THREE TRAPS IN THE INPUT WORDS. ALL THREE ARE ASSERTED BELOW (SECTION 1) SO THEY CANNOT ROT.
// ===============================================================================================
//
// 1. `COIN_BITS.COIN1` IS `0`, A BIT INDEX, NOT A MASK. Writing `~COIN_BITS.COIN1` gives `$FFFF`
//    -- which is IDLE -- and the coin silently never registers, leaving the machine on the
//    warning screen forever while every "no throw" assertion still passes. The word is `$FFFE`.
//
// 2. `$13CEC8` CREDITS ONLY ON RELEASE, AND ONLY AFTER 3..`$26` OF ITS OWN CALLS. It runs once
//    per TWO video frames, so the switch must be held for 6..76 frames. A one-frame poke does
//    nothing at all.
//
// 3. **THE PLAYER PORT IS NOT INDEXED LIKE THE COIN PORT, AND THE BRIEF THAT SET THIS WAVE
//    IMPLIED IT WAS.** `$FFFE` really is P1 START -- but not because START is bit 0. `BIT.start`
//    is **15**; `mirrorsFromPort` puts a `ror.w #1` between the port and `$803970`, so a held
//    mirror bit `b` clears PORT bit `(b+1)&15` (input.js:27-48). Building the word the obvious
//    way, `~(1 << BIT.start)`, gives `$7FFF` -- which is a different, real button, so the run
//    looks like it has input and the machine sits on state 3 forever. MEASURED: `$FFFE` ->
//    `$803970` = `$8000` -> state $E; `$7FFF` -> `$803970` = `$4000` -> still state 3.
//    `portWordFromBits` is the port's own inverse and is what this file uses.
//
// ===============================================================================================
// WHAT THE MILESTONES ARE, AND WHERE EACH ONE COMES FROM
// ===============================================================================================
//
//   frame     20   the warning screen is up: 784 non-zero TX cells (14 lines x 28 chars x 2)
//   frame    301   `$25ABE8`'s `$12C` timeout expires -- `$812E56` 13 -> 2
//   frame    303   the credit line draws: `CREDITS:0` on map column 3
//   frame  ~420   the coin credits on RELEASE: `$80395A` 0 -> 1, `$25A7C0` restages at state 3
//   frame  ~440   P1 START (`$FFFE` on the PLAYER port) -- `$812E56` -> $E, GAMEPLAY
//   +1            `$813082` = 1 -- the rank object's per-frame gate is UP, its body is skipped
//   +2045         `$813082` -> 0, the gate comes down, `$2608D2` recomputes and
//                 `$2608CA move.l (A0),$81315C` installs `$26086E` (rank.js RANKBASE)
//   +2045..       `$8130CE`, the scroll odometer, starts advancing
//
// `$81315C = $26086E` IS THE COLD BOARD'S VALUE AND NOT THE SEED'S. `$26089E` indexes four
// pointers by `$80380C`, the config byte. Nothing in this port writes `$80380C` (the settings
// block is a counted deferral in `frontend.js`), so a cold board picks index 0 -> `$26086E`;
// `rip/web/seed.bin` carries index 1 -> `$260874`. An assertion of `$26086E` therefore also
// proves the run really was COLD -- see rank.js's `installRankBase26089E` header.
//
// ===============================================================================================
// TWO CORRECTIONS TO THE BRIEF THIS WAVE WAS GIVEN
// ===============================================================================================
//
// * `{ logicFrame: 0, videoFrame: 0 }` in the brief's boot recipe are NO-OPS. `main.js:323-324`
//   is `opts.logicFrame ?? 0` / `opts.videoFrame ?? 0`, so passing 0 is passing the default.
//   They are omitted here and SECTION 1 pins that omitting them changes nothing.
//
// * `$8130CE = 836` is NOT a 120,000-frame number. The odometer reaches 836 at frame +9,364 past
//   START and then STOPS DEAD -- it is byte-identical at +10,000 and at +120,000. That is a real,
//   measured stall and it is asserted as such (SECTION 5), because pinning it as "the state after
//   120,000 frames" would hide the fact that 110,000 of those frames moved nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { RANK, RANKBASE } from '../src/rank.js';
import { SCREEN8 } from '../src/objslot8.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const tablesJson = JSON.parse(readFileSync(TABLES, 'utf8'));

/** `DDPDOJ_SOAK=1` adds SECTION 5. Absent, this file DEFINES ONE FEWER TEST -- it does not
 *  define a skipped one. See the header. */
const SOAK = process.env.DDPDOJ_SOAK === '1';

// --------------------------------------------------------------------------------------------
// ADDRESSES. Every one is taken from the module that owns it rather than retyped, so a rename
// in `rank.js` or `objslot8.js` breaks this file loudly instead of silently pinning a stale
// address that happens to still read 0.
// --------------------------------------------------------------------------------------------
const STATE = SCREEN8.state;              // $812E56 -- slot [8]'s arm
const CREDITS = COIN.creditA + 2;         // $80395A -- the credit count
const COINAGE = 0x803957;                 // credits-per-coin set by cartridge reset
const RANKGATE = RANK.gate813082;         // $813082 -- set = skip the rank body
const RANKPTR = RANKBASE.ptrOut;          // $81315C -- the per-stage base table pointer
const SCROLLODO = 0x8130ce;               // the scroll distance odometer (background.js BGRAM.clock)
const CONFIG = RANKBASE.cfg;              // $80380C -- the config byte $26089E indexes by

const NO_PLAYER = 0xffff;

/** ACTIVE LOW `$C08004`. Built from `COIN_BITS` so a bit renumbering in `web/input.js` is caught
 *  here rather than credited to the wrong slot. */
const coinWord = (...names) => {
  let w = 0xffff;
  for (const n of names) w &= ~(1 << COIN_BITS[n]) & 0xffff;
  return w;
};

/**
 * ACTIVE LOW `$C00000`, the PLAYER port -- AND IT IS NOT THE SAME CONSTRUCTION AS `coinWord`.
 *
 * `machine.js BIT` numbers `$803970`'s MIRROR bits, not the port's, and the two are one `ror.w`
 * apart: `p1raw` bit `b` is NOT of port bit `(b+1)&15` (input.js:44). So `BIT.start` is **15**
 * and the port bit it clears is **0**. Building the word by hand as `~(1 << BIT.start)` would
 * give `$7FFF`, which is a held BUTTON 3 as far as the board is concerned and never starts
 * anything -- measured, see SECTION 1.
 *
 * `portWordFromBits` is the port's own inverse and is used here so this trap cannot be
 * re-introduced by a reader who assumes the two ports index the same way.
 */
const playerWord = (...bits) => portWordFromBits(bits);

/** A COLD board: no seed image at all, so main RAM is zeroed and every value the run depends on
 *  must be produced by `boot()` and the frames after it. Strictly harsher than `rip/web/seed.bin`,
 *  which arrives with credits, dips and a config byte already set. */
const coldGame = (opts = {}) =>
  new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false, ...opts });

/** Non-zero cells in the `$904000` TX tilemap -- what "something is on screen" means here. */
const txNonZero = (tx) => {
  let n = 0;
  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 64; c++) if (tx.long(0x904000 + (r * 64 + c) * 4) !== 0) n++;
  }
  return n;
};

/** One map column read back as text, `w376attract.test.js`'s helper unchanged. `$25A14C` /
 *  `$240CF0` put the character BYTE straight in the tile's high word, so the credit line reads
 *  back as ASCII with no font table. Trailing empties are trimmed; a non-printable cell is `?`
 *  rather than a control character, so a wrong glyph shows up as a visible diff. */
const txColumn = (tx, col) => {
  let s = '';
  for (let r = 0; r < 32; r++) {
    const v = tx.long(0x904000 + (r * 64 + col) * 4);
    const t = (v >>> 16) & 0x3fff;
    s += v === 0 ? '.' : (t >= 0x20 && t < 0x7f ? String.fromCharCode(t) : '?');
  }
  return s.replace(/\.+$/, '');
};

/** Run `n` logic frames with `coin` on `$C08004` and `player` on `$C00000`. */
function run(g, n, { coin = COIN.idle, player = NO_PLAYER } = {}) {
  g.coinPort = coin;
  for (let i = 0; i < n; i++) g.step(player);
}

/**
 * THE COLD-BOOT CHAIN, AS ONE FUNCTION, WITH ITS MILESTONES CHECKED AS IT GOES.
 *
 * Every `assert` in here is a MILESTONE, not scaffolding: if the warning screen never drew, or
 * the coin never credited, or START was never seen, this throws AT THE STEP THAT FAILED instead
 * of letting a soak run 120,000 frames of nothing and report success.
 *
 * Returns the `Game`, parked at state $E with the START press released.
 */
function bootToGameplay() {
  const g = coldGame();
  g.boot();

  // `$23C6FA` read the zeroed operator DIP through the cartridge tables during reset.
  // This path does not patch the coinage byte after boot.
  assert.equal(g.ram.u8(COINAGE), 1,
    'MILESTONE 0: $23C6FA installed one credit per coin from cartridge data');
  assert.equal(g.ram.u8(CREDITS), 0, 'MILESTONE 0: a cold board starts with no credits');

  // -- MILESTONE 1: THE WARNING SCREEN DRAWS. 14 ROM lines x 28 characters x 2 cells per glyph.
  run(g, 20);
  assert.equal(g.ram.u16(STATE), 0x000d, 'MILESTONE 1: slot [8] is on arm 13, the warning screen');
  assert.equal(txNonZero(g.txvram), 784, 'MILESTONE 1: and all 784 of its cells are on screen');

  // -- MILESTONE 2: THE $12C TIMEOUT EXPIRES AND THE CREDIT LINE REPLACES IT.
  run(g, 380);
  assert.equal(g.ram.u16(STATE), 0x0002, 'MILESTONE 2: $25A764 handed slot [8] to state 2');
  assert.equal(txColumn(g.txvram, 3), '..........CREDITS:0',
    'MILESTONE 2: and $23CFDE drew the credit line, reading zero');

  // -- MILESTONE 3: THE COIN. Held 20 frames -- inside `$13CEC8`'s 6..76 window -- then RELEASED,
  // because the credit lands on the release edge and not on the hold.
  run(g, 20, { coin: coinWord('COIN1') });
  assert.equal(g.ram.u8(CREDITS), 0, 'MILESTONE 3: a HELD coin credits nothing');
  run(g, 10);
  assert.equal(g.ram.u8(CREDITS), 1, 'MILESTONE 3: the RELEASE credited exactly one coin');
  assert.equal(g.ram.u16(STATE), 0x0003, 'MILESTONE 3: $25A7C0 restaged slot [8] at state 3');
  assert.equal(txColumn(g.txvram, 3), '..........CREDITS:1',
    'MILESTONE 3: and the digit on screen changed with it');

  // -- MILESTONE 4: P1 START JOINS. State 3 -> $E is the handover to GAMEPLAY.
  run(g, 20, { player: playerWord(BIT.start) });
  assert.equal(g.ram.u16(STATE), 0x000e, 'MILESTONE 4: P1 START took slot [8] to state $E');
  assert.equal(g.ram.u8(CREDITS), 0, 'MILESTONE 4: and the credit was SPENT, not merely counted');

  return g;
}

// =============================================================================================
// 1 -- THE TWO INPUT TRAPS, PINNED AS VALUES.
//
// Both of these cost real runs. They are asserted as bare numbers so that a renumbering in
// `web/input.js` reds HERE, with a one-line message, rather than 400 frames later as "the
// warning screen never went away".
// =============================================================================================

test('W383 COIN_BITS.COIN1 is a BIT INDEX of 0, so the coin word is $FFFE and NOT $FFFF', () => {
  assert.equal(COIN_BITS.COIN1, 0, 'COIN1 is bit 0');
  assert.equal(coinWord('COIN1'), 0xfffe, 'the held-coin word is $FFFE');

  // THE TRAP ITSELF, spelled out: the natural-looking `~COIN_BITS.COIN1` is IDLE.
  assert.equal((0xffff & ~COIN_BITS.COIN1) >>> 0 & 0xffff, 0xffff,
    '`~COIN_BITS.COIN1` is $FFFF, which is IDLE -- treating the index as a mask credits nothing');
  assert.equal(COIN.idle, 0xffff, 'and $FFFF really is the idle word');
  assert.notEqual(coinWord('COIN1'), COIN.idle, 'so the two must differ, and they do');
});

// **THE BRIEF CALLED `$FFFE` "P1 START" AND WAS RIGHT ABOUT THE WORD FOR THE WRONG REASON.**
// It is NOT `1 << BIT.start`. `BIT.start` is 15; the port bit START clears is 0, because
// `mirrorsFromPort` puts a `ror.w #1` between the port and `$803970` (input.js:27-48). The two
// ports happening to share the word `$FFFE` is a COINCIDENCE of two unrelated tables, and this
// test is what stops someone "simplifying" the two into one helper.
test('W383 the START word is $FFFE from BIT.start = 15, one ror.w away from the naive $7FFF', () => {
  assert.equal(BIT.start, 15, 'START is bit 15 of the $803970 MIRROR');
  assert.equal(playerWord(BIT.start), 0xfffe, 'but the PORT word is $FFFE -- bit 0 clear');

  // THE TRAP: the word a reader would build by hand from BIT.start.
  const naive = (0xffff & ~(1 << BIT.start)) >>> 0 & 0xffff;
  assert.equal(naive, 0x7fff, '`~(1 << BIT.start)` is $7FFF...');
  assert.notEqual(naive, playerWord(BIT.start), '...which is NOT the START word');

  // ...and $7FFF is a real, different button, so a run using it would look like input and do
  // nothing. Port bit 15 maps back to mirror bit $E, which is not START.
  assert.equal(playerWord(BIT.b3), 0xff7f, 'B3 is $FF7F -- the board measurement in input.js:48');
  assert.notEqual(playerWord(BIT.b3), playerWord(BIT.start));
});

test('W383 logicFrame/videoFrame default to 0, so the brief\'s explicit zeros are no-ops', () => {
  const a = coldGame();
  const b = coldGame({ logicFrame: 0, videoFrame: 0 });
  assert.equal(a.logicFrame, 0);
  assert.equal(a.videoFrame, 0);
  assert.equal(b.logicFrame, a.logicFrame);
  assert.equal(b.videoFrame, a.videoFrame);
});

// =============================================================================================
// 2 -- THE CHAIN ITSELF. Warning screen -> credit line -> coin -> START.
//
// `bootToGameplay()` asserts all four milestones internally; this test names them again at the
// end so a reader of the output can see WHICH ONE the machine reached.
// =============================================================================================

test('W383 A COLD BOOT REACHES GAMEPLAY: warning screen, credit line, coin, START', () => {
  const g = bootToGameplay();
  assert.equal(g.ram.u16(STATE), 0x000e, 'slot [8] is on arm $E -- gameplay');
  assert.equal(g.ram.u16(RANKGATE), 1, 'and the rank object exists with its gate UP');
});

// =============================================================================================
// 3 -- THE RANK GATE COMES DOWN, AND `$81315C` IS INSTALLED WITH THE **COLD** POINTER.
//
// This is the milestone that separates "the front end handed over" from "the game is running".
// `$813082` is set on the handover frame, which makes `$2607A8 tst.w` skip the rank body every
// frame; when it clears, `$2608D2` recomputes and `$2608CA` writes `$81315C`.
//
// The value asserted, `$26086E`, is INDEX 0 of `$260886` -- what a board with `$80380C` = 0
// picks. The seed board carries index 1, `$260874`. So this assertion is simultaneously a
// milestone AND a proof the run was cold.
// =============================================================================================

test('W383 the rank gate comes down and $81315C gets the COLD pointer $26086E', () => {
  const g = bootToGameplay();

  assert.equal(g.ram.u32(RANKPTR), 0, 'POSITIVE CONTROL: $81315C is still zero at handover');
  assert.equal(g.ram.u8(CONFIG), 0, 'and $80380C is 0 -- nothing in this port writes it');

  // Find the frame it lands on rather than asserting a hard-coded one: the exact frame depends
  // on how many frames the coin was held, and pinning it would make this test brittle for a
  // reason that is not a defect. The WINDOW is what matters.
  let at = -1;
  for (let i = 0; i < 3000; i++) {
    g.step(NO_PLAYER);
    if (at < 0 && g.ram.u32(RANKPTR) !== 0) at = i + 1;
  }
  assert.ok(at > 0, `$81315C must be installed within 3000 frames of START (never was)`);
  assert.ok(at > 1500 && at < 2500,
    `and it lands at +2045 in the measured run; got +${at}. A big move here is a real change`);

  assert.equal(g.ram.u32(RANKPTR), RANKBASE.baseTables[0],
    '$2608CA installed base table 0 -- $26086E, the COLD board\'s pointer');
  assert.notEqual(g.ram.u32(RANKPTR), RANKBASE.baseTables[1],
    'and NOT $260874, which is what rip/web/seed.bin\'s configured board carries');
  assert.equal(g.ram.u16(RANKGATE), 0, 'the gate is DOWN -- the rank body runs every frame now');
});

// =============================================================================================
// 4 -- THE DEFAULT SOAK: 3,000 FRAMES PAST START, AND THE SCROLL ODOMETER MOVING.
//
// 3,000 is chosen so the last boot-chain milestone (`$81315C` at +2,045) is inside it. The
// odometer assertion is the one that would catch a run that reached state $E and then FROZE:
// `$8130CE` only advances when `$26132C` runs, which needs the scroll VM alive.
// =============================================================================================

test('W383 3,000 frames of gameplay: no throw, and the SCROLL ODOMETER ADVANCES', () => {
  const g = bootToGameplay();
  assert.equal(g.ram.u16(SCROLLODO), 0, 'POSITIVE CONTROL: the odometer starts at zero');

  run(g, 3000);

  assert.equal(g.ram.u16(STATE), 0x000e, 'still on arm $E after 3,000 frames');
  assert.equal(g.ram.u32(RANKPTR), RANKBASE.baseTables[0], '$81315C is installed and stable');
  assert.equal(g.ram.u16(RANKGATE), 0, 'the rank gate stayed down');
  // NOT `> 0`: the measured run is at 164 here. A port that ticked the odometer once and stalled
  // would pass `> 0` and is exactly the failure this assertion is for.
  assert.ok(g.ram.u16(SCROLLODO) >= 100,
    `the scroll odometer must be well past zero; got ${g.ram.u16(SCROLLODO)}`);
});

// =============================================================================================
// 5 -- THE FULL SOAK. **`DDPDOJ_SOAK=1` ONLY**, because it is about two minutes of wall clock.
//
//     DDPDOJ_SOAK=1 node --test games/ddpdoj/tests/w383coldboot.test.js
//
// There is no `skip` here and there must never be one: when the variable is absent this `if`
// simply does not call `test(...)`, so the file defines four tests instead of five and
// `node --test` reports `skipped 0` either way.
//
// **WHAT 120,000 FRAMES ACTUALLY BUYS, STATED HONESTLY.** The odometer's LAST movement is at
// frame +9,364 past START, to 836. Everything from +9,365 to +120,000 -- 110,636 frames, ninety
// two per cent of the soak -- changes NONE of the four watched words. So this test asserts two
// separate things and labels which is which:
//
//   (a) the machine SURVIVES 120,000 frames without throwing, which is a real claim about the
//       ISR, the object driver and the allocator not accumulating a fault; and
//   (b) the end state is EXACTLY the state at +10,000, which is a real claim that the run has
//       reached a FIXED POINT rather than still drifting.
//
// Claiming (b) as "the state after a long soak" without saying it was already true at +10,000
// would dress a stall up as an endurance result.
// =============================================================================================

if (SOAK) {
  test('W383 SOAK: 120,000 frames past START -- no throw, and a FIXED POINT from +10,000 on',
    () => {
      const g = bootToGameplay();

      run(g, 10000);
      const at10k = {
        state: g.ram.u16(STATE), ptr: g.ram.u32(RANKPTR),
        gate: g.ram.u16(RANKGATE), odo: g.ram.u16(SCROLLODO),
      };
      assert.deepEqual(at10k, {
        state: 0x000e, ptr: RANKBASE.baseTables[0], gate: 0, odo: 836,
      }, 'at +10,000 the odometer has already stopped at 836');

      // 110,000 more. If any of these frames throws, the test fails at that frame.
      run(g, 110000);

      assert.deepEqual({
        state: g.ram.u16(STATE), ptr: g.ram.u32(RANKPTR),
        gate: g.ram.u16(RANKGATE), odo: g.ram.u16(SCROLLODO),
      }, at10k, '(b) +120,000 is byte-identical to +10,000 -- a FIXED POINT, not still moving');

      // (a) restated as its own assertion so the reason for the two minutes is visible: the
      // frame counter really did advance, i.e. `run` was not silently a no-op.
      assert.ok(g.logicFrame >= 120000,
        `the driver really stepped 120,000+ logic frames; got ${g.logicFrame}`);
    });
}
