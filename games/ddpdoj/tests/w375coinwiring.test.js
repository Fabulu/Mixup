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
import { COIN, coinRead13CFBA } from '../src/isr.js';
import {
  COIN_BITS, setCoinKey, clearCoin, createCoinProjection, currentCoinWord, tickCoinPulse,
} from '../src/web/input.js';
import { SOUND_WRAPPERS, postWrapperWithRuntime, SoundState } from '../src/sound.js';
import { UnportedLog } from '../src/unported.js';
import { OBJ } from '../src/objdriver.js';
import { Demo } from '../src/web/app.js';

const SEED = fileURLToPath(new URL('../rip/web/seed.bin', import.meta.url));
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const APP = fileURLToPath(new URL('../src/web/app.js', import.meta.url));

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

test('runahead coin projection advances a detached copy at IRQ4 cadence', () => {
  clearCoin();
  try {
    setCoinKey('COIN1', true);
    for (let call = 1; call < 12; call++) tickCoinPulse();
    const projection = createCoinProjection();

    assert.notEqual(projection.currentWord(), COIN.idle);
    projection.advanceVblanks(1, 1);
    assert.equal(projection.currentWord(), COIN.idle,
      'a calling speculative vblank spends the detached pulse');
    assert.notEqual(currentCoinWord(), COIN.idle,
      'speculation cannot spend the canonical browser pulse');
  } finally {
    clearCoin();
  }
});

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

// ---------------------------------------------------------------------------------------------
// 6 -- `$18B0D6`, THE COIN/SERVICE SOUND HOOK. THE DEFECT THE WIRING EXPOSED.
//
// All three of `$13CFBA`'s arms call `jsr $18B0D6` BEFORE `coinage13CE22`. The port routed that
// through `ctx.soundPost`, and `sound.js` maps only the `$28Cxxx` `WRAPPERS` (plus
// `STREAMING_LEAVES`) -- everything else THROWS, deliberately ("an unmapped wrapper is a loud
// gap, not a silent drop", sound.js:366). So from the moment the coin chain was connected, the
// FIRST CREDITED COIN would have thrown out of the ISR instead of crediting. Nothing could reach
// it before this wave, which is why no test was red.
//
// `$18B0D6` is now COUNTED where `$18ACC0` already was -- `isr.js`'s `coinHook18B0D6` calls
// `unported.note()` under the hook's own ROM address. Read out of the ROM (raw offset $18B0D6,
// 26 bytes) it is `movem.l D0-D7/A0-A6,-(A7) / move.w #$17,D0 / move.w #$FF,D1 / move.w #$0,D2 /
// jsr $18AB50 / movem.l (A7)+ / rts`: the shape of a sound post, into a callee nobody has read.
//
// The two tests below are the pair that matters. The first is the one that would have caught the
// original defect; the second proves the fix NARROWED nothing -- every other unmapped address
// still throws exactly as loudly as before.
// ---------------------------------------------------------------------------------------------

/** A dispatch type `defaultHandlers` does not claim, so a spy on it displaces nothing. The same
 *  technique `w375ctxkeys.test.js` uses: `Game#ctx()` is private and the object driver's own
 *  `h(ram, slot, slotIndex, ctx)` call is the only way to the REAL ctx. */
const SPY_TYPE = 0x33;

function captureCtx() {
  const g = game();
  assert.equal(g.handlers.has(SPY_TYPE), false,
    `type $${SPY_TYPE.toString(16)} is a REAL handler now -- pick another spy type`);
  let slotIndex = -1;
  for (let i = 0; i < OBJ.slots; i++) {
    if (g.ram.u16(OBJ.base + i * OBJ.stride + OBJ.typeOff) === 0) { slotIndex = i; break; }
  }
  assert.ok(slotIndex >= 0, 'the seed has no empty object slot -- this test cannot plant a record');
  const a5 = OBJ.base + slotIndex * OBJ.stride;
  for (let i = 0; i < OBJ.stride; i++) g.ram.setU8(a5 + i, 0);
  g.ram.setU16(a5 + OBJ.typeOff, SPY_TYPE);
  let ctx = null, calls = 0;
  g.handlers.set(SPY_TYPE, (_ram, _slot, _i, c) => { calls++; ctx = c; });
  g.coinPort = COIN.idle;
  g.step(NO_PLAYER);
  assert.equal(calls > 0, true, 'the spy handler never ran, so nothing below tests anything');
  return { g, ctx };
}

/** The `$18B0D6` lines of an `UnportedLog` report, as `[count, line]`. */
function hookNotes(log) {
  return log.report()
    .filter((l) => /\$18B0D6/.test(l))
    .map((l) => [Number(l.trim().split(' ')[0]), l]);
}

test('W375: a credited coin does NOT throw, and $18B0D6 is COUNTED', () => {
  // END TO END through the REAL `Game`, whose `ctx.soundPost` is `main.js`'s -- i.e. the real
  // `postWrapperWithRuntime`, which throws on an unmapped address. Before the fix this test threw
  // `sound.postWrapper: no wrapper at $18B0D6` out of `$13D008`, one instruction short of the
  // credit.
  const g = game();
  const before = credits(g);
  run(g, coinWord('COIN1'), 12);
  run(g, COIN.idle, 6);

  assert.equal(credits(g), before + 1, 'the coin must credit -- a throw here IS the defect');
  const notes = hookNotes(g.unportedLog);
  assert.equal(notes.length, 1,
    `exactly one $18B0D6 note line, got ${JSON.stringify(g.unportedLog.report())}`);
  assert.equal(notes[0][0], 1, 'one credited coin is one counted hook call, not zero and not two');
  assert.match(notes[0][1], /jsr \$18AB50/,
    'the note must say what the unported routine IS, or it is an address with no meaning');
});

test('W375: all three arms count the hook, with a ctx whose soundPost THROWS', () => {
  // THE UNIT, driven directly, with the real sound layer as `soundPost`: `postWrapperWithRuntime`
  // throws for anything outside `WRAPPERS`/`STREAMING_LEAVES`, which is exactly the behaviour the
  // driver has. If `coinRead13CFBA` ever goes back to posting `$18B0D6`, every one of these
  // throws instead of crediting.
  const arms = [
    // [the arm, what arms it]. SERVICE takes an EDGE rather than a RAM word, so its `arm` is
    // empty and the two-call sequence below is what raises it.
    ['SERVICE ($13CFF0)', () => {}],
    ['COIN 1 ($13D008)', (ram) => ram.setU16(COIN.pendA, COIN.pendValue)],
    ['COIN 2 ($13D032)', (ram) => ram.setU16(COIN.pendB, COIN.pendValue)],
  ];

  for (const [name, arm] of arms) {
    const g = game();
    const log = new UnportedLog();
    const sound = new SoundState();
    const ctx = {
      unported: log,
      unportedLog: log,
      soundPost: (addr) => postWrapperWithRuntime(g.ram, sound, null, addr),
    };
    const before = credits(g);

    arm(g.ram);
    if (name.startsWith('SERVICE')) {
      // `$13CFD6 and.w / andi.w #$E0` is `prev & now & $E0`: a RISING edge needs the previous RAW
      // word to have the bit SET (not pressed) and the current one pressed.
      coinRead13CFBA(g.ram, COIN.idle, ctx);
      coinRead13CFBA(g.ram, coinWord('SERVICE'), ctx);
    } else {
      coinRead13CFBA(g.ram, COIN.idle, ctx);
    }

    assert.equal(credits(g), before + 1, `${name}: the credit must land`);
    const notes = hookNotes(log);
    assert.equal(notes.length, 1, `${name}: the hook must be COUNTED, not posted and not dropped`);
    assert.equal(notes[0][0], 1, `${name}: one arm taken is one hook call`);
  }
});

test('W375: every OTHER unmapped sound address still throws, from the REAL ctx', () => {
  // THE NARROWING, PROVED. `main.js`'s `#ctx().soundPost` carried a `$18B0D6` guard while the fix
  // lived in the wrong file; it is gone, and nothing replaced it. So the hook address itself
  // throws again if anyone posts it -- which is safe precisely because `isr.js` no longer does --
  // and so does its build-A neighbour `$18ACC0`.
  const { ctx } = captureCtx();
  assert.equal(typeof ctx.soundPost, 'function', 'Game#ctx() must still carry soundPost');

  assert.throws(() => ctx.soundPost(COIN.arms.hook), /no wrapper at \$18B0D6/,
    'the workaround in main.js must be GONE -- an unmapped address is a loud gap');
  assert.throws(() => ctx.soundPost(0x18acc0), /no wrapper at \$18ACC0/,
    'ISR6 jsr #3 is unmapped too, and must throw for anyone who posts it');

  // ...and the throw is about being UNMAPPED, not about everything: a real wrapper still posts.
  const mapped = Number(Object.keys(SOUND_WRAPPERS)[0]);
  assert.ok(Number.isFinite(mapped) && mapped > 0, 'sound.js WRAPPERS is empty -- read that first');
  assert.doesNotThrow(() => ctx.soundPost(mapped),
    `$${mapped.toString(16).toUpperCase()} IS in WRAPPERS and must still post`);
});

// ---------------------------------------------------------------------------------------------
// 7 -- COIN INPUT IS DEAD DURING `.replay` PLAYBACK.
//
// `NOTES-replay.md` constraint 1: a run derives from (initial state, input words) and NOTHING
// ELSE. The coin word is a SECOND per-frame input and the v1 `.replay` format cannot carry it
// (`portin.encoding === 'u16be'`, one word per logic frame, and `decodePortinWords` throws on
// anything else) -- which is exactly why it must not be live while a recording plays back. A
// coin key pressed by whoever is watching would move `$80395A` inside the state the W132 verifier
// hashes and turn a green verify red, with nothing in the file to explain it.
//
// THE MECHANISM, verified rather than assumed. `Demo.playback` is null until `playFrom()` builds
// the descriptor, and `endPlayback()` does NOT null it -- it sets `playback.ended` and leaves the
// descriptor in place so the banner and the verdict survive. From that instant `step()` is back
// on live input. So the gate is `playback && !playback.ended`, which is what `Demo#inPlayback()`
// is, and gating on `this.playback` alone would freeze the coin port for the rest of the session
// after one replay.
//
// These drive the REAL `Demo.prototype.step` on a stub `this`. A real `Demo` needs a bundle, a
// capture and a canvas, none of which exist in `node --test`; the prototype call is the closest
// honest thing, and it runs the actual gate rather than a copy of it.
// ---------------------------------------------------------------------------------------------

/** A `this` for `Demo.prototype.step` carrying only the fields that method reads. The `Game` is
 *  built with the SAME `coinTick` wiring the `Demo` constructor uses. */
function stubDemo(playback = null) {
  const stub = {
    game: null,
    playback,
    recorder: null,
    romToPacked: new Map(),     // every sprite misses; `portSpriteList` writes no RAM
    listOpts: {},
    portList: null,
    prevPos: null,
    prevTilt: 0,
    stepsRun: 0,
    bundle: {},                 // `bundle.bg?.followColumn(..)` short-circuits, argument included
    inPlayback: Demo.prototype.inPlayback,
    coinTick: Demo.prototype.coinTick,
    step: Demo.prototype.step,
    _emitPlayback() {},
    endPlayback() { throw new Error('endPlayback reached -- give the fixture more words'); },
  };
  stub.game = new Game(seedBytes.slice(), tablesJson, {
    palCatchUp: false,
    coinTick: () => stub.coinTick(),
  });
  return stub;
}

/** A playback descriptor with everything `step()` touches and nothing else. `count` is far past
 *  any frame these tests drive, so `endPlayback()` is never reached. */
const fakePlayback = (frames) => ({
  obj: { seed: { lf: 0 } },
  ended: false,
  i: 0,
  count: 1e9,
  words: new Array(frames + 8).fill(NO_PLAYER),
  pokes: [],
  verifier: {
    periodBounds: [],
    feed() {},
    finalize: () => Promise.resolve({ green: true }),
  },
});

test('W375: Demo#inPlayback() is playback AND NOT ended, not merely playback', () => {
  const call = (playback) => Demo.prototype.inPlayback.call({ playback });
  assert.equal(call(null), false, 'no descriptor, no playback');
  assert.equal(call({ ended: false }), true, 'a live descriptor IS playback');
  assert.equal(call({ ended: true }), false,
    'endPlayback() leaves the descriptor in place; live input resumes and so must the coin port');
});

test('W375: a held coin key credits NOTHING while a .replay plays back', () => {
  clearCoin();                                  // module state is global -- start from idle
  const FRAMES = 40;                            // > the 12-call pulse, i.e. long enough to credit
  const stub = stubDemo(fakePlayback(FRAMES));
  const before = credits(stub.game);
  setCoinKey('COIN1', true);                    // the real web/input.js press, pulse armed

  for (let i = 0; i < FRAMES; i++) stub.step();

  assert.equal(stub.game.coinPort, COIN.idle,
    'the coin port must be pinned to $FFFF for every frame of the playback');
  assert.equal(credits(stub.game), before, 'a coin key must not credit during playback');
  assert.equal(stub.game.ram.u16(COIN.pendA), 0, 'and no record may even reach the pending word');
  assert.equal(stub.game.ram.u8(COIN.recA), 0, 'record 0 must never leave state 0');
  // ...and the PULSE did not advance either, which is `Demo#coinTick`'s half of the gate. The key
  // is still down, so the word still shows it: had `coinTick` kept ticking, 40 frames = 20
  // debounce calls would have spent the whole 12-call pulse.
  assert.notEqual(currentCoinWord(), COIN.idle,
    'the coin pulse must be FROZEN during playback, not quietly spent');
  clearCoin();
});

test('W375: the same key credits when NOT playing back', () => {
  // The control for the test above: same fixture, same key, same frame count, `playback` null.
  // Without this, "no credit during playback" could just mean the fixture never credits at all.
  clearCoin();
  const FRAMES = 40;
  const stub = stubDemo(null);
  const before = credits(stub.game);
  setCoinKey('COIN1', true);

  for (let i = 0; i < FRAMES; i++) stub.step();

  assert.equal(credits(stub.game), before + 1, 'outside playback the same key must credit');
  assert.equal(currentCoinWord(), COIN.idle,
    'and the pulse must have been spent by Demo#coinTick, leaving the port idle again');
  clearCoin();
});

test('W375/W498: coin input returns only after a new press when playback ends', async () => {
  // Exercise the REAL replay-exit method. It clears the stale live pulse before
  // `ended` exposes live input again; release plus a new press must still work.
  clearCoin();
  const pb = fakePlayback(8);
  const stub = stubDemo(pb);
  setCoinKey('COIN1', true);
  stub.step();
  assert.equal(stub.game.coinPort, COIN.idle, 'still playing, so the port is pinned');

  Demo.prototype.endPlayback.call(stub);
  assert.equal(pb.ended, true);
  assert.equal(currentCoinWord(), COIN.idle, 'the real replay exit cancels stale live input');
  stub.step();
  assert.equal(stub.game.coinPort, COIN.idle,
    'the next live frame cannot inherit the press held through playback');

  setCoinKey('COIN1', false);
  setCoinKey('COIN1', true);
  stub.step();
  assert.notEqual(stub.game.coinPort, COIN.idle,
    'release followed by a new press reaches the live Game');
  await pb.pending;
  clearCoin();
});

test('W375: both Games the page builds get the GATED coin tick', () => {
  // `Demo#coinTick` is tested for real above, but neither `Demo`'s constructor nor `playFrom()`
  // can run without a bundle and a canvas, so THAT the two `new Game(...)` sites pass the gated
  // method -- rather than the raw `tickCoinPulse` -- is checked in the source text. Both sites
  // matter: the constructor's Game is the live one and `playFrom`'s is the verify target itself.
  const src = readFileSync(APP, 'utf8');
  const gated = src.match(/coinTick: \(\) => this\.coinTick\(\)/g) ?? [];
  assert.equal(gated.length, 2,
    'both new Game(...) sites in web/app.js must pass the playback-gated tick');
  assert.equal(/coinTick:\s*tickCoinPulse/.test(src), false,
    'an ungated tickCoinPulse would advance the coin pulse during playback');

  const playFromAt = src.indexOf('  playFrom(obj) {');
  const endAt = src.indexOf('  endPlayback() {');
  assert.ok(playFromAt >= 0 && endAt > playFromAt, 'the two replay boundaries are present');
  assert.match(src.slice(playFromAt, endAt), /clearCoin\(\)/,
    'replay entry must clear live coin state');
  assert.match(src.slice(endAt, src.indexOf('\n  /**', endAt)), /clearCoin\(\)/,
    'replay exit must clear live coin state before live input resumes');
});
