// W375 -- THE COIN WIRING, i.e. the frames between a key press and `$80395A`.
//
// Everything below `main.js` was already ported and unit-tested before this wave and NONE OF IT
// WAS CONNECTED TO ANYTHING:
//
//   * `isr.js:51` read `ctx.coinPort ?? COIN.idle` and nothing anywhere set `coinPort`, so the
//     coin port was idle forever;
//   * `coinDebounce13CEC8` ($13CEC8) was exported, tested, and DRIVEN FROM NOWHERE -- and it is
//     the ONLY route coin-port bits 0 and 1 have into the game, because `$13CFBA`'s
//     `andi.w #$E0` throws every bit but 5, 6 and 7 away;
//   * `src/web/input.js`'s coin keys produced a word no one read.
//
// So the interesting assertions here are not about any one routine. They are about the JOINS, and
// each of the five below fails if a different join is removed:
//
//   1  END TO END -- a coin word held for a tap raises `$80395A` by exactly one. This is the test
//      that proves the whole chain, and it goes red if ANY link is unwired.
//   2  THE IRQ4 PHASE -- `$13CEC8` runs on every OTHER video frame, not every one. Driving it per
//      frame HALVES the hold the ROM counts, which moves the whole `[3, $26]` window; nothing else
//      in the port would notice.
//   3  HELD TOO LONG CREDITS NOTHING -- the case a real player hits by leaning on the key.
//   4  `ctx.coinPort` REACHES `isr.js`.
//   5  THE PLAYER PORT IS UNAFFECTED -- `$C08000` and `$C08004` are DIFFERENT PORTS and conflating
//      them credits a coin whenever a player holds a button in the `$E0` mask (isr.js:48).
//
// FRAME ARITHMETIC, so the counts below are readable rather than magic. IRQ4 fires ONCE PER VIDEO
// FRAME (measured on this build: `MARK IRQ4 n=2617` against `MARK IRQ6 n=2617` over 1,901 logic
// frames) and `$1453BC andi.w #$1` halves it, so `$13CEC8` runs once every TWO video frames. At
// this seed's `armedVblanks` of 1 that is once every two `step()`s, and a hold of H video frames
// is counted as about H/2 by the debounce. The ROM's tap window is `[3, $26]` INCLUSIVE **in
// debounce calls**, i.e. 6 to 76 video frames.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';

const SEED = fileURLToPath(new URL('../rip/web/seed.bin', import.meta.url));
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));

const seedBytes = new Uint8Array(readFileSync(SEED));
const tablesJson = JSON.parse(readFileSync(TABLES, 'utf8'));
const game = () => new Game(seedBytes.slice(), tablesJson, { palCatchUp: false });

/** The neutral `$C08000` word -- ACTIVE LOW, nothing held. Every test below feeds this as the
 *  PLAYER input so that anything that moves came from the COIN port. */
const NO_PLAYER = 0xffff;

/** A raw `$C08004` word with `names` held. ACTIVE LOW: idle is $FFFF, a held switch CLEARS its
 *  bit. Built from `COIN_BITS` rather than a literal so a bit renumbering in `web/input.js` is
 *  caught here instead of quietly credited to the wrong slot. */
const coinWord = (...names) => {
  let w = 0xffff;
  for (const n of names) w &= ~(1 << COIN_BITS[n]) & 0xffff;
  return w;
};

/** `$80395A` -- creditA + 2, the CREDIT COUNT. `$803958` is the same block's COIN count and the
 *  two are not interchangeable: the `$11` coinage band bumps the coin byte and not this one. */
const CREDITS = COIN.creditA + 2;
const credits = (g) => g.ram.u8(CREDITS);

/** Step `n` logic frames with the coin port held at `word` and no player input. */
function run(g, word, n) {
  g.coinPort = word;
  for (let i = 0; i < n; i++) g.step(NO_PLAYER);
}

// ---------------------------------------------------------------------------------------------
// 1 -- END TO END. THE TEST THAT PROVES THE CHAIN.
//
// The links, in order, and every one of them is required for this to pass:
//   Demo/test writes `g.coinPort`
//     -> `Game#step`'s vblank loop toggles `$80FA84` and, on the pass that lands on 0,
//     -> `coinDebounce13CEC8(ram, this.coinPort)` counts the hold on record 0 and, on release,
//        writes `$803968 = $0080`
//     -> `irq6` -> `coinRead13CFBA(ram, ctx.coinPort, ctx)` -> `coinPending13CF86` CONSUMES it
//        into D1 bit 0
//     -> `$13D002 btst #$0` -> `coinage13CE22(ram, $803958)` -> `$80395A`.
//
// Remove the `coinPort` field, the `ctx` key, the phase toggle or the debounce call and this goes
// red. The seed's coinage DIP `$803808` is $00 (the multiplier band) with `$803957` = 1, so one
// coin is one credit; the assertion is "+1 exactly", never ">= 1", because a debounce that
// finalises repeatedly is the failure this whole routine exists to prevent.
// ---------------------------------------------------------------------------------------------

test('a coin key press raises $80395A by exactly one', () => {
  const g = game();
  const before = credits(g);
  assert.ok(before < 0x09, 'the seed must not already be at the nine-credit clamp');

  run(g, coinWord('COIN1'), 12);          // ~6 debounce calls -- inside [3, $26]
  assert.equal(credits(g), before,
    'a HELD coin must credit NOTHING -- the credit is on the RELEASE ($13CF3C), not the press');
  assert.equal(g.ram.u8(COIN.recA), 1, 'record 0 must be in state 1 (pressed) while held');
  assert.equal(g.ram.u16(COIN.recA + 2), 6, '12 video frames must be counted as 6 debounce calls');

  run(g, COIN.idle, 6);                   // state 1 -> 2 -> 0, finalise, and IRQ6 consumes it
  assert.equal(credits(g), before + 1, 'the release must credit exactly one coin');
  assert.equal(g.ram.u16(COIN.pendA), 0, '$803968 must have been CONSUMED by $13CF86');

  // ...and it must not keep crediting. A pending word that is read but not cleared, or a record
  // that re-finalises, both look like "the credit counter running away" (isr.js:118).
  run(g, COIN.idle, 60);
  assert.equal(credits(g), before + 1, 'one press must credit once, not once per frame');
});

test('COIN2 credits through record 1, one debounce away from port bit 1', () => {
  const g = game();
  const before = credits(g);
  run(g, coinWord('COIN2'), 12);
  assert.equal(g.ram.u16(COIN.recB + 2), 6, 'record 1 counts port bit 1 (the $13CF76 ror)');
  assert.equal(g.ram.u16(COIN.recA + 2), 0, 'record 0 must not have seen COIN2');
  run(g, COIN.idle, 6);
  assert.equal(credits(g), before + 1, 'slot 2 shares slot 1s block unless $80380B is exactly 1');
});

// ---------------------------------------------------------------------------------------------
// 2 -- THE IRQ4 PHASE. `$13CEC8` runs on every OTHER video frame.
//
// `$803966` (recA + 2) is the hold count, and it is incremented by ONE PER CALL while the switch
// is down -- so it IS a call counter, read straight out of the RAM the ROM keeps it in. No spy is
// needed and none would be as faithful.
//
// `$80FA84` is set explicitly so the parity is STATED rather than inherited from the seed: with
// the word at 1, `addq.w #$1` then `andi.w #$1` lands on 0 on the very first vblank, so vblanks
// 1, 3, 5 ... call and 2, 4, 6 ... skip.
// ---------------------------------------------------------------------------------------------

test('$13CEC8 runs on every OTHER vblank, not every one', () => {
  const g = game();
  g.ram.setU16(COIN.irq4Phase, 1);              // so vblank 1 is a CALLING vblank
  const vf0 = g.videoFrame;

  run(g, coinWord('COIN1'), 21);
  const vblanks = g.videoFrame - vf0;
  const calls = g.ram.u16(COIN.recA + 2);

  assert.equal(calls, Math.ceil(vblanks / 2),
    `${vblanks} vblanks must produce ${Math.ceil(vblanks / 2)} debounce calls`);
  assert.ok(calls < vblanks,
    'a per-vblank call would halve the hold the ROM counts and move the whole [3, $26] window');
  assert.ok(g.ram.u16(COIN.irq4Phase) === 0 || g.ram.u16(COIN.irq4Phase) === 1,
    '$80FA84 is andi.w #$1 masked in place, so it only ever holds 0 or 1');
});

test('the phase toggle advances even with the coin port idle', () => {
  // The toggle is the cartridge`s, not the coin code`s: `$1453B6` runs before the branch, so it
  // advances on every IRQ4 whether or not the body is reached. A port that toggled only while a
  // coin was held would drift the parity and change which vblanks call.
  const g = game();
  g.ram.setU16(COIN.irq4Phase, 0);
  run(g, COIN.idle, 1);
  assert.equal(g.ram.u16(COIN.irq4Phase), 1, 'one vblank must advance $80FA84');
  run(g, COIN.idle, 1);
  assert.equal(g.ram.u16(COIN.irq4Phase), 0, 'two vblanks must bring it back to 0');
});

// ---------------------------------------------------------------------------------------------
// 3 -- HELD TOO LONG CREDITS NOTHING, SILENTLY. The player-facing cliff.
//
// `$13CF52 cmpi.w #$26,D1 / bgt $13CF64` writes `$0001` instead of `$0080`, and `$13CF86` compares
// against `$0080` with `cmpi.w` -- so `$0001` reads as nothing pending, credits nothing, makes no
// sound and leaves the word behind UNCONSUMED. A player leaning on the key gets nothing and has no
// way to tell why, which is exactly why `web/input.js` pulses the key rather than passing the hold
// through.
// ---------------------------------------------------------------------------------------------

test('a coin held past $26 debounce calls credits NOTHING', () => {
  const g = game();
  const before = credits(g);

  run(g, coinWord('COIN1'), 90);                // ~45 calls, past the $26 (38) ceiling
  assert.ok(g.ram.u16(COIN.recA + 2) > COIN.tapMax,
    'this test is only meaningful if the hold count actually passed $26');

  run(g, COIN.idle, 6);
  assert.equal(credits(g), before, 'a hold past the window must credit nothing at all');
  assert.equal(g.ram.u16(COIN.pendA), 0x0001,
    '$13CF64 writes $0001 -- a distinct "seen and rejected" value, NOT zero and NOT $0080');

  // And it is not consumed, because `$13CF88 cmpi.w #$0080` never matches it.
  run(g, COIN.idle, 20);
  assert.equal(g.ram.u16(COIN.pendA), 0x0001, '$0001 is left in place by $13CF86');
  assert.equal(credits(g), before, 'and it never turns into a late credit');
});

// ---------------------------------------------------------------------------------------------
// 4 -- `ctx.coinPort` REACHES `isr.js`.
//
// `$13CFC8 move.w D0,$803952` stores the RAW word the read was handed, so `$803952` is a direct
// readout of what `irq6` -> `coinRead13CFBA` was given. If `#ctx()` did not carry `coinPort`, the
// `?? COIN.idle` fallback at isr.js:51 would park it at $FFFF and this would be $FFFF forever --
// which is precisely the state the port was in before this wave.
// ---------------------------------------------------------------------------------------------

test('ctx.coinPort is what $13CFBA reads', () => {
  const g = game();
  const w = coinWord('COIN1', 'SERVICE');
  run(g, w, 1);
  assert.equal(g.ram.u16(COIN.prev), w,
    '$803952 must hold the word ctx.coinPort carried, not the COIN.idle fallback');
  assert.equal(g.ram.u16(COIN.raw), (~w) & 0xffff, '$803950 is the same word INVERTED');
});

test('an idle coin port never credits, however many frames pass', () => {
  const g = game();
  const before = credits(g);
  run(g, COIN.idle, 200);
  assert.equal(credits(g), before, 'no coin word, no credit');
  assert.equal(g.ram.u16(COIN.pendA), 0, 'and no record ever leaves state 0');
  assert.equal(g.ram.u16(COIN.pendB), 0);
  assert.equal(g.ram.u8(COIN.recA), 0);
  assert.equal(g.ram.u8(COIN.recB), 0);
});

// ---------------------------------------------------------------------------------------------
// 5 -- THE PLAYER PORT IS UNAFFECTED.
//
// `$C08000` (player) and `$C08004` (coin) are DIFFERENT PORTS and this port has already been
// burned by conflating them once: handing `$13CFBA` the player word credits a coin whenever a
// player holds a button whose bit falls in the `$E0` mask (isr.js:48). The check is a DIFFERENTIAL
// one -- two Games from the same seed fed the same player words, one coining and one not -- so it
// covers every player-visible mirror at once rather than a list somebody has to keep current.
//
// The six words are `$13D464`'s two mirrors and `$23D12A`'s four derived ones.
// ---------------------------------------------------------------------------------------------

const PLAYER_WORDS = [0x803970, 0x803972, 0x803974, 0x803976, 0x803978, 0x80397a];

test('driving the coin port changes no player input', () => {
  // The same player sequence for both: a few neutral frames, then Button 3 held (port $FF7F,
  // measured on the board -- machine.js:270) so the mirrors carry a real value rather than zero.
  const words = [];
  for (let i = 0; i < 40; i++) words.push(i < 8 ? 0xffff : 0xff7f);

  const control = game();
  const coined = game();
  for (let i = 0; i < words.length; i++) {
    control.coinPort = COIN.idle;
    // A tap inside the window on the coined run: down for 12 frames, then released.
    coined.coinPort = (i >= 4 && i < 16) ? coinWord('COIN1') : COIN.idle;
    control.step(words[i]);
    coined.step(words[i]);
  }

  for (const a of PLAYER_WORDS) {
    assert.equal(coined.ram.u16(a), control.ram.u16(a),
      `$${a.toString(16).toUpperCase()} must not depend on the coin port`);
  }
  // The ship itself, since a mirror could match while something downstream did not.
  assert.equal(coined.ram.u16(0x8103e6 + 0x0a), control.ram.u16(0x8103e6 + 0x0a),
    'the P1 record must be identical');

  // ...and the run must actually have coined, or the four assertions above are vacuous.
  assert.equal(credits(coined), credits(control) + 1,
    'the coined run must really have credited -- otherwise this test proves nothing');
});

test('a player button in the $E0 mask does not credit', () => {
  // The regression isr.js:48 names. Every player word is fed to `step()` while the coin port stays
  // idle; if the two ports were ever conflated, bits 5/6/7 of a player word would edge through
  // `$803954` and take the SERVICE arm.
  const g = game();
  const before = credits(g);
  for (let i = 0; i < 60; i++) {
    g.coinPort = COIN.idle;
    // Walk the whole low byte, so every bit in the $E0 mask is pressed and released repeatedly.
    g.step(0xffff & ~(1 << (i % 8)));
  }
  assert.equal(credits(g), before, 'no player button may ever produce a credit');
});
