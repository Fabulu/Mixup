// WAVE 375 -- THE COIN DEBOUNCE `$13CEC8`, AND THE COIN PORT `$C08004`.
//
// WHAT THIS FIXES.  Before this wave coin-port bits 0 and 1 could not reach the game AT ALL.  The
// only ported coin routine is `$13CFBA`, which lives on IRQ6 and masks the port with
// `$13CFD8 andi.w #$E0` -- bits 5, 6 and 7 only.  Bits 0 and 1 arrive somewhere else entirely:
// through `$13CEC8`, an IRQ4 routine that debounces the two coin switches and writes `$803968` /
// `$80396E`, the two words `$13CF86` consumes.  Nothing in the port called it.
//
// STEP 1 OF 3, AND IT PUTS NOTHING ON SCREEN.  The credit GATE at `$25A770` is still unported and
// is a separate unit, and the `main.js` wiring that would drive the debounce belongs to another
// agent.  What these tests prove is that the plumbing from a key to `$80395A` (the credit count)
// is now correct end to end when someone does drive it.
//
// THE THINGS THAT ARE EASY TO GET WRONG, one test each:
//   * `$13CEC8` is a TAP detector with an upper bound.  3..$26 calls credits; $27 credits NOTHING,
//     SILENTLY, and that is the case a real player hits by leaning on the key.
//   * state 2 is "released but not believed yet", and resuming from it PRESERVES the count.
//   * the `ror.w #1,D0` at `$13CF76` is what makes record 1 watch port bit 1.
//   * the port is ACTIVE LOW.
//   * `$C08004` is NOT `$C08000` and must not go through `portWordFromBits`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import {
  COIN, coinDebounce13CEC8, coinRead13CFBA, drainTicks13CC50,
} from '../src/isr.js';
import { portWordFromBits } from '../src/input.js';
import {
  COIN_BITS, COIN_KEYMAP, COIN_PULSE_CALLS,
  currentCoinWord, currentPortWord, setCoinKey, tickCoinPulse, clearCoin,
} from '../src/web/input.js';

// ------------------------------------------------------------------ helpers

/** A raw `$C08004` word with the named switch bits HELD.  ACTIVE LOW. */
const port = (...bits) => bits.reduce((w, b) => w & ~(1 << b), 0xffff) & 0xffff;
const IDLE = 0xffff;

/** Run the debounce for `n` calls with `word` on the port. */
function hold(ram, word, n) {
  for (let i = 0; i < n; i++) coinDebounce13CEC8(ram, word);
}

/** Release: TWO idle calls, because state 1 -> 2 does not finalise and 2 -> 0 does. */
function release(ram) { hold(ram, IDLE, 2); }

/** A RAM with the coinage DIP set to one coin one credit ($00..$08 band, multiplier from
 *  `$803957`).  `$803808 = 0` and `$803957 = 1`. */
function coinRam() {
  const ram = new Ram();
  ram.setU8(COIN.dipCoinage, 0x00);        // $803808 -- the $00..$08 multiplier band
  ram.setU8(COIN.creditsPerCoin, 0x01);    // $803957 -- one credit per coin
  ram.setU8(COIN.dipSlot2, 0x00);          // $80380B -- slots SHARE slot 1's block
  return ram;
}

const CREDITS_A = COIN.creditA + 2;        // $80395A -- ($2,A0) of the slot-1 block

// A ctx that CAPTURES the mechanical-counter ticks.
//
// You cannot read `$80394C` after `coinRead13CFBA` and expect to see the bump: `$13D068` runs at
// the tail of the SAME call, unconditionally, and its `bsr $13CC50` drains one tick off every
// non-zero byte in `$80394C..$80394F`.  So a coin bumps `$80394C` to 1 at `$13D026` and the drain
// takes it straight back to 0 four instructions later.  That is not a bug and it is not a
// shortcut -- the drain is the queue that feeds the six-frame solenoid pulse.  The tick is
// therefore observed where the cartridge observes it: in D0, the drain's answer.
function tickSpy() {
  const seen = { d0: null };
  return [seen, { counterTrigger13CC50: (ram) => (seen.d0 = drainTicks13CC50(ram)) }];
}

// ------------------------------------------------- 1. a valid tap credits, END TO END

test('W375: a tap of 12 calls credits, all the way to $80395A', () => {
  const ram = coinRam();
  assert.equal(ram.u8(CREDITS_A), 0, 'seeded with no credits');

  hold(ram, port(COIN_BITS.COIN1), 12);    // inside [3, $26]
  assert.equal(ram.u16(COIN.recA + 2), 12, 'the hold count is one per call');
  assert.equal(ram.u16(COIN.pendA), 0, 'nothing is pending until the RELEASE');

  release(ram);
  assert.equal(ram.u16(COIN.pendA), COIN.pendValue, '$803968 = $0080 -- $13CF5A, THE TAP');

  // ...and now the already-ported IRQ6 side, which is what turns $0080 into a credit.
  const [seen, ctx] = tickSpy();
  const d1 = coinRead13CFBA(ram, IDLE, ctx);
  assert.equal(d1 & (1 << COIN.pendBitCoin1), 1 << COIN.pendBitCoin1,
    '$13CF86 ORs bit 0 into D1');
  assert.equal(ram.u8(CREDITS_A), 1, '$80395A -- A CREDIT, end to end');
  assert.equal(ram.u16(COIN.pendA), 0, '$13CF98 CONSUMED the pending word');
  assert.equal(seen.d0, 0b01, '$13D026 bumped $80394C, and $13CC50 drained it as bit 0');
  assert.equal(ram.u8(COIN.pulseState), 1, '$13D09E armed the solenoid pulse');
});

test('W375: both ends of [3, $26] are INCLUSIVE and both credit', () => {
  for (const n of [COIN.tapMin, COIN.tapMax]) {
    const ram = coinRam();
    hold(ram, port(COIN_BITS.COIN1), n);
    release(ram);
    assert.equal(ram.u16(COIN.pendA), COIN.pendValue, `${n} calls is a tap`);
    coinRead13CFBA(ram, IDLE, {});
    assert.equal(ram.u8(CREDITS_A), 1, `${n} calls credits`);
  }
});

// --------------------------------------- 2. too short and TOO LONG both credit nothing

test('W375: 2 calls is TOO SHORT -- $0001, and no credit', () => {
  const ram = coinRam();
  hold(ram, port(COIN_BITS.COIN1), COIN.tapMin - 1);
  release(ram);
  assert.equal(ram.u16(COIN.pendA), 0x0001, '$13CF64 move.w #$1 -- seen and REJECTED');
  coinRead13CFBA(ram, IDLE, {});
  assert.equal(ram.u8(CREDITS_A), 0, 'no credit');
  assert.equal(ram.u8(COIN.counterA), 0, 'and no mechanical tick either');
});

test('W375: $27 calls is TOO LONG -- $0001, no credit, and SILENT.  THE PLAYER CASE.', () => {
  const ram = coinRam();
  hold(ram, port(COIN_BITS.COIN1), COIN.tapMax + 1);
  release(ram);
  assert.equal(ram.u16(COIN.pendA), 0x0001, '$0001, not $0080 -- one call past the window');
  const d1 = coinRead13CFBA(ram, IDLE, {});
  assert.equal(d1, 0, '$13CF88 cmpi.w #$80 rejects $0001, so D1 is EMPTY');
  assert.equal(ram.u8(CREDITS_A), 0, 'CREDITS NOTHING');
  assert.equal(ram.u8(COIN.counterA), 0, 'no counter tick -- nothing to see at all');
});

test('W375: a key held forever SATURATES at $FFFF and still credits nothing', () => {
  const ram = coinRam();
  ram.setU8(COIN.recA, 1);                       // state 1, mid-hold
  ram.setU16(COIN.recA + 2, 0xffff);             // $13CF12 cmpi.w #$FFFF -- already at the top
  hold(ram, port(COIN_BITS.COIN1), 5);
  assert.equal(ram.u16(COIN.recA + 2), 0xffff, 'it saturates, it does NOT wrap to a valid tap');
  release(ram);
  assert.equal(ram.u16(COIN.pendA), 0x0001, 'still rejected');
});

// ------------------------------------------- 3. state 2 resumes with the count PRESERVED

test('W375: the state-2 resume PRESERVES the count across a one-call bounce', () => {
  const ram = coinRam();
  hold(ram, port(COIN_BITS.COIN1), 5);           // count 5, state 1
  assert.equal(ram.u16(COIN.recA + 2), 5);

  hold(ram, IDLE, 1);                            // $13CF24 -- state 2, NO finalise
  assert.equal(ram.u8(COIN.recA), 2, 'state 2 = released but not believed yet');
  assert.equal(ram.u16(COIN.recA + 2), 5, 'and the count is untouched by the release');
  assert.equal(ram.u16(COIN.pendA), 0, 'nothing finalised');

  hold(ram, port(COIN_BITS.COIN1), 4);           // $13CF6E -- resume, count CARRIES
  assert.equal(ram.u8(COIN.recA), 1, 'back to state 1');
  // 8, NOT 9 and NOT 1.  $13CF6E does `move.b #$1,(A0)` and then `bra $13CF76` -- THE RESUME CALL
  // ITSELF DOES NOT INCREMENT.  So the 4 pressed calls contribute 3: one to leave state 2 and
  // three to count.  The count carries (that is the point) but the bounce costs a call.
  assert.equal(ram.u16(COIN.recA + 2), 8, '5 + 3, not restarted at 1');

  release(ram);
  assert.equal(ram.u16(COIN.pendA), COIN.pendValue, '8 is inside the window');
});

test('W375: a bounce that carries the count PAST $26 kills the tap', () => {
  const ram = coinRam();
  hold(ram, port(COIN_BITS.COIN1), 0x20);
  hold(ram, IDLE, 1);                            // bounce
  hold(ram, port(COIN_BITS.COIN1), 0x08);        // $20 + $08 = $28 > $26
  release(ram);
  assert.equal(ram.u16(COIN.recA + 2), 0, 'the count is cleared by the finalise either way');
  assert.equal(ram.u16(COIN.pendA), 0x0001, 'the resume is why a bouncy switch can overrun');
});

// ------------------------------- 4. record N watches port bit N, via the `ror.w #1,D0`

test('W375: record 0 watches port bit 0 and leaves record 1 alone', () => {
  const ram = coinRam();
  hold(ram, port(COIN_BITS.COIN1), 10);
  release(ram);
  assert.equal(ram.u16(COIN.pendA), COIN.pendValue, '$803968 tapped');
  assert.equal(ram.u16(COIN.pendB), 0, '$80396E UNTOUCHED');
  assert.equal(ram.u8(COIN.recB), 0, 'record 1 never left state 0');
  assert.equal(ram.u16(COIN.recB + 2), 0, 'and never counted');
});

test('W375: record 1 watches port bit 1 -- the ror.w #1,D0 at $13CF76', () => {
  const ram = coinRam();
  hold(ram, port(COIN_BITS.COIN2), 10);
  release(ram);
  assert.equal(ram.u16(COIN.pendB), COIN.pendValue, '$80396E tapped');
  assert.equal(ram.u16(COIN.pendA), 0, '$803968 UNTOUCHED');
  assert.equal(ram.u8(COIN.recA), 0, 'record 0 never left state 0');

  // ...and it drives the OTHER arm of $13CFBA: slot 2, counter $80394D.
  const [seen, ctx] = tickSpy();
  const d1 = coinRead13CFBA(ram, IDLE, ctx);
  assert.equal(d1 & (1 << COIN.pendBitCoin2), 1 << COIN.pendBitCoin2, 'D1 bit 1');
  assert.equal(seen.d0, 0b10, '$13D062 bumped $80394D -> bit 1, and NOT $80394C');
});

test('W375: the two records lay out at recA and recA + recStride, and recA + 4 IS pendA', () => {
  assert.equal(COIN.recB, COIN.recA + COIN.recStride, '$13CF78 lea ($6,A0),A0');
  assert.equal(COIN.recA + 4, COIN.pendA, '$803964 + 4 = $803968');
  assert.equal(COIN.recB + 4, COIN.pendB, '$80396A + 4 = $80396E');
});

test('W375: both switches held together tap BOTH records in one pass', () => {
  const ram = coinRam();
  hold(ram, port(COIN_BITS.COIN1, COIN_BITS.COIN2), 10);
  release(ram);
  assert.equal(ram.u16(COIN.pendA), COIN.pendValue);
  assert.equal(ram.u16(COIN.pendB), COIN.pendValue);
  // But $13CFBA's arms are NOT independent -- only bit 5 short-circuits, and bits 0 and 1 both
  // run when bit 5 is clear, so this frame credits twice.  Transcribed, not corrected.
  coinRead13CFBA(ram, IDLE, {});
  assert.equal(ram.u8(CREDITS_A), 2, 'slot 2 shares slot 1s block when $80380B is not 1');
});

// ---------------------------------------------------------------- 5. ACTIVE LOW

test('W375: ACTIVE LOW -- $FFFF presses nothing, clearing bit 0 presses COIN 1', () => {
  const ram = coinRam();
  hold(ram, 0xffff, 50);                         // an idle port, for a long time
  assert.equal(ram.u8(COIN.recA), 0, 'still state 0');
  assert.equal(ram.u8(COIN.recB), 0);
  assert.equal(ram.u16(COIN.pendA), 0, 'and nothing pending -- a harness with no coin port');
  assert.equal(COIN.idle, 0xffff);

  coinDebounce13CEC8(ram, 0xfffe);               // bit 0 CLEAR = COIN 1 pressed
  assert.equal(ram.u8(COIN.recA), 1, 'one call armed it');
  assert.equal(ram.u16(COIN.recA + 2), 1, '$13CEF8 move.w #$1,($2,A0)');
  assert.equal(ram.u16(COIN.recA + 4), 0, '$13CEF2 ARMED the result word to zero');
});

// ------------------------- 6. currentCoinWord() is NOT portWordFromBits, and is its own port

test('W375: currentCoinWord starts at $FFFF and CLEARS the held bit', () => {
  clearCoin();
  assert.equal(currentCoinWord(), 0xffff, 'idle');

  setCoinKey('COIN1', true);
  const w = currentCoinWord();
  assert.equal(w & (1 << COIN_BITS.COIN1), 0, 'bit 0 CLEARED');
  assert.equal(w, 0xfffe, 'and ONLY bit 0');
  clearCoin();
});

test('W375: currentCoinWord is NOT portWordFromBits -- the shuffle would clear bit 1', () => {
  clearCoin();
  setCoinKey('COIN1', true);
  const coin = currentCoinWord();
  const shuffled = portWordFromBits([COIN_BITS.COIN1]);

  assert.equal(shuffled, 0xfffd, '$13D464s inverse clears bit (b+1)&15, i.e. bit 1');
  assert.equal(coin, 0xfffe, 'the coin port has NO shuffle: bit N is switch N');
  assert.notEqual(coin, shuffled, 'THE WHOLE POINT -- they are different ports');

  // Running COIN1 through the player shuffle would land on the coin port's bit 1, i.e. COIN 2.
  assert.equal((shuffled >> COIN_BITS.COIN2) & 1, 0, 'and it would credit the WRONG SLOT');
  clearCoin();
});

test('W375: a held coin key does NOT disturb the player port word', () => {
  clearCoin();
  const before = currentPortWord();
  setCoinKey('COIN1', true);
  setCoinKey('SERVICE', true);
  assert.equal(currentPortWord(), before, '$C08000 is untouched by $C08004 keys');
  assert.equal(before, 0xffff, 'and headless with nothing held it is idle');
  clearCoin();
});

test('W375: SERVICE and TEST are their own bits, 5 and 4, not pulsed', () => {
  clearCoin();
  setCoinKey('SERVICE', true);
  assert.equal(currentCoinWord(), 0xffff & ~(1 << 5), 'bit 5 -- $156BF2');
  setCoinKey('TEST', true);
  assert.equal(currentCoinWord(), 0xffff & ~(1 << 5) & ~(1 << 4), 'bit 4 -- $156C10');
  // SERVICE rides $13CFBA's EDGE word, which is already a rising edge, so it reports the raw key
  // for as long as it is down.
  for (let i = 0; i < 200; i++) tickCoinPulse();
  assert.equal(currentCoinWord(), 0xffff & ~(1 << 5) & ~(1 << 4), 'ticks do not release it');
  setCoinKey('SERVICE', false);
  setCoinKey('TEST', false);
  assert.equal(currentCoinWord(), 0xffff);
  clearCoin();
});

test('W375: the key PULSE lands inside [3, $26] and credits, however long the key is held', () => {
  clearCoin();
  const ram = coinRam();
  setCoinKey('COIN1', true);
  // The key is NEVER released.  The pulse lets go by itself.
  for (let i = 0; i < 400; i++) {
    coinDebounce13CEC8(ram, currentCoinWord());
    tickCoinPulse();
  }
  assert.ok(COIN_PULSE_CALLS >= COIN.tapMin && COIN_PULSE_CALLS <= COIN.tapMax,
    'the pulse length is inside the ROMs window by construction');
  assert.equal(ram.u16(COIN.pendA), COIN.pendValue, 'a held key still credits EXACTLY ONE coin');

  coinRead13CFBA(ram, IDLE, {});
  assert.equal(ram.u8(CREDITS_A), 1, 'one credit');

  // ...and it does not repeat while the key stays down.
  for (let i = 0; i < 400; i++) {
    coinDebounce13CEC8(ram, currentCoinWord());
    tickCoinPulse();
    coinRead13CFBA(ram, IDLE, {});
  }
  assert.equal(ram.u8(CREDITS_A), 1, 'STILL one credit -- one press, one coin');
  clearCoin();
});

test('W375: releasing early does not cancel the pulse, so a one-frame tap still credits', () => {
  clearCoin();
  const ram = coinRam();
  setCoinKey('COIN1', true);
  setCoinKey('COIN1', false);                    // let go immediately
  for (let i = 0; i < 40; i++) {
    coinDebounce13CEC8(ram, currentCoinWord());
    tickCoinPulse();
  }
  assert.equal(ram.u16(COIN.pendA), COIN.pendValue, 'the pulse ran its full length anyway');
  clearCoin();
});

test('W375: currentCoinWord is PURE -- two reads in a frame agree', () => {
  clearCoin();
  setCoinKey('COIN1', true);
  const a = currentCoinWord();
  const b = currentCoinWord();
  const c = currentCoinWord();
  assert.equal(a, b, '$13CFBA and $13CEC8 read the same port at different rates');
  assert.equal(b, c);
  clearCoin();
});

test('W375: clearCoin is the backstop -- it drops the key AND the pulse', () => {
  clearCoin();
  setCoinKey('COIN1', true);
  assert.notEqual(currentCoinWord(), 0xffff);
  clearCoin();
  assert.equal(currentCoinWord(), 0xffff, 'blur / pagehide leaves no coin held');
});

test('W375: the bindings are MAME-conventional and by e.code', () => {
  assert.deepEqual(COIN_KEYMAP, {
    Digit5: 'COIN1', Digit6: 'COIN2', Digit9: 'SERVICE', F2: 'TEST',
  });
  // The QWERTZ rule: nothing here uses KeyZ or KeyY, so nothing here needs pairing.  If that ever
  // changes, BOTH must be bound, the way SHOT is.
  for (const code of Object.keys(COIN_KEYMAP)) {
    assert.ok(code !== 'KeyZ' && code !== 'KeyY', `${code} is layout-invariant`);
  }
});

// -------------------------------- 7. the renamed constants still select the same arms

test('W375: the renamed bit constants hold the SAME numbers the arms tested before', () => {
  assert.equal(COIN.bitService, 5, '$13CFEA btst #$5 -- was mislabelled bitCoin1');
  assert.equal(COIN.pendBitCoin1, 0, '$13D002 btst #$0 -- was mislabelled bitCoin2');
  assert.equal(COIN.pendBitCoin2, 1, '$13D02C btst #$1 -- was mislabelled bitService');
  assert.equal(COIN.mask, 0x00e0, '$13CFD8 andi.w #$E0 -- why bit 5 is the only edge tested');
  // Bit 5 is inside the edge mask; bits 0 and 1 are NOT, which is the whole argument.
  assert.equal(COIN.mask & (1 << COIN.bitService), 1 << COIN.bitService);
  assert.equal(COIN.mask & (1 << COIN.pendBitCoin1), 0, 'bit 0 cannot come from the edge word');
  assert.equal(COIN.mask & (1 << COIN.pendBitCoin2), 0, 'bit 1 cannot come from the edge word');
});

test('W375: the SERVICE arm still short-circuits and still skips the mechanical counter', () => {
  const ram = coinRam();
  // A SERVICE edge: pressed this frame, NOT pressed last frame.  $803952 holds last frame's RAW
  // (still active low), so seeding it $FFFF means nothing was held.
  ram.setU16(COIN.prev, 0xffff);
  // ...and a coin-1 tap pending at the same time, to prove the short-circuit.
  ram.setU16(COIN.pendA, COIN.pendValue);

  const [seen, ctx] = tickSpy();
  const d1 = coinRead13CFBA(ram, port(COIN_BITS.SERVICE), ctx);
  assert.equal(d1 & (1 << COIN.bitService), 1 << COIN.bitService, 'edge bit 5 set');
  assert.equal(ram.u8(CREDITS_A), 1, 'SERVICE credited slot 1');
  assert.equal(seen.d0, null,
    '$13D000 rts -- the coin-1 arm was SKIPPED, and $13D068 was never reached either');
  assert.equal(ram.u16(COIN.pendA), 0, 'but $13CF86 already CONSUMED the pending word');
});

test('W375: with bit 5 clear the two pending arms both run', () => {
  const ram = coinRam();
  ram.setU16(COIN.pendA, COIN.pendValue);
  ram.setU16(COIN.pendB, COIN.pendValue);
  const [seen, ctx] = tickSpy();
  coinRead13CFBA(ram, IDLE, ctx);
  assert.equal(seen.d0, 0b11, 'both $80394C and $80394D ticked -- the arms are not exclusive');
  assert.equal(ram.u8(CREDITS_A), 2, 'and both credited slot 1s block');
});

test('W375: $80380B = 1 gives slot 2 its OWN credit block $80395E', () => {
  const ram = coinRam();
  ram.setU8(COIN.dipSlot2, 0x01);                // $13D044 cmpi.b #$1
  ram.setU16(COIN.pendB, COIN.pendValue);
  coinRead13CFBA(ram, IDLE, {});
  assert.equal(ram.u8(COIN.creditB + 2), 1, '$803960 -- slot 2s own credits');
  assert.equal(ram.u8(CREDITS_A), 0, 'and slot 1 untouched');
});

// ------------------------------------------------------- the constants, as transcribed

test('W375: the transcribed constants match the ROM', () => {
  assert.equal(COIN.debounce, 0x13cec8);
  assert.equal(COIN.port, 0xc08004, 'lea $C08004,A0 at $13CECC -- NOT $C08000');
  assert.equal(COIN.recA, 0x803964);
  assert.equal(COIN.recB, 0x80396a);
  assert.equal(COIN.recStride, 0x6);
  assert.equal(COIN.tapMin, 0x3);
  assert.equal(COIN.tapMax, 0x26);
  assert.equal(COIN.irq4Phase, 0x80fa84, '$1453B6 addq.w #$1,$80FA84');
  assert.equal(COIN.irq4Guard, 0x80fa82, '$1453AC -- and it gates NOTHING in this port');
  assert.equal(COIN.pendValue, 0x0080, '$13CF5A, and $13CF88s cmpi.w');
});

test('W375: the UX window in frames -- 3..$26 calls at one call per two video frames', () => {
  // The comment in isr.js says 6 to 76 video frames, roughly 0.1 s to 1.27 s.  If anyone ever
  // changes tapMin/tapMax, this fails and the comment gets fixed with it.
  assert.equal(COIN.tapMin * 2, 6, 'video frames, minimum');
  assert.equal(COIN.tapMax * 2, 76, 'video frames, maximum');
  assert.ok(Math.abs(COIN.tapMax * 2 / 60 - 1.27) < 0.01, 'about 1.27 s at 60 Hz');
});
