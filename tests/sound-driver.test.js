// Unit tests for the sequence driver, 7:$412B.
//
// The oracle diff (tools/oracle/sound.py + sounddiff.mjs) proves the driver
// against the cartridge on real songs; these pin the individual RULES in
// isolation, so a regression names the rule it broke instead of pointing at
// tick 417 of song $03. Every fixture is a hand-assembled sequence in a fake
// bank -- nothing here is ROM-derived.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDriver, tick, play } from '../src/sound/driver.js';

const BANK_BASE = 0x4000;

/**
 * Build a driver over a synthetic bank. `blocks` is {address: [bytes]}, and
 * `tracks` is the song header this driver's song $00 will start.
 */
function makeDriver(blocks, tracks) {
  const bank = new Uint8Array(0x4000);
  for (const [addr, bytes] of Object.entries(blocks)) {
    bank.set(bytes, Number(addr) - BANK_BASE);
  }
  // A pitch table where entry n is simply n | ($100 * (n & 3)), so a note
  // index is readable straight off NRx3 once the $80 detune bias is undone.
  const pitch = new Uint16Array(84);
  for (let i = 0; i < 84; i++) pitch[i] = (i - 0x80) & 0xFFFF;
  const data = {
    tickHz: 4096 / 69, pitch, wave: new Uint8Array(16),
    bank, bankBase: BANK_BASE,
    songs: { 0: { tracks } },
  };
  const drv = createDriver(data);
  drv.booted = true;                       // skip the $4000 hardware init
  play(drv, 0);
  return drv;
}

/** Fold a tick's writes into a register snapshot, as sounddiff.mjs does. */
function run(drv, n) {
  const rows = [];
  const state = {};
  for (let i = 0; i < n; i++) {
    for (const [a, v] of tick(drv)) state[a] = v;
    rows.push({ ...state });
  }
  return rows;
}

const SQ1 = { nrx1: 0xFF11, nrx2: 0xFF12, lo: 0xFF13, hi: 0xFF14 };

test('GATE doubles its operand and the gate is a threshold, not a countdown', () => {
  // $4687 reads the operand and ADDs it to itself, so `GATE $05` means ten
  // ticks; $4195 then halves min(dur, that) and subtracts one. dur 7 against
  // a limit of 10 therefore gives a gate of 2, and the key-off fires on the
  // tick where the REMAINING duration is 2 -- five ticks into a seven-tick
  // note, not one tick before the end.
  //
  // Storing the operand undoubled gives a gate of 1 and moves every release
  // one tick late; that one tick is what made song $02's channel-1 envelope
  // drift from tick 5 onwards.
  const drv = makeDriver({
    0x5000: [0xFC, 0x20, 0x50,           // VOLENV_PTR $5020
             0xFA, 0x28, 0x50,           // KEYOFF_VOLENV_PTR $5028
             0xF9, 0x05,                 // GATE $05  -> +$06 = 10
             0x10, 0x07,                 // NOTE $10, dur 7
             0xFF],
    0x5020: [0xA0, 0x03, 0xB0, 0x03, 0xC0, 0x03, 0xFF, 0x20, 0x50],
    0x5028: [0x11, 0x01, 0x22, 0x08, 0xFF, 0x28, 0x50],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }]);

  const r = run(drv, 8);
  const nrx2 = r.map((s) => s[SQ1.nrx2]);
  assert.equal(drv.tracks[0].gateLimit, 10, 'GATE $05 must store 10');
  // $A0 for its full three ticks, $B0 for two -- then the gate cuts in.
  assert.deepEqual(nrx2.slice(0, 5), [0xA0, 0xA0, 0xA0, 0xB0, 0xB0]);
  assert.equal(nrx2[5], 0x11, 'release envelope swaps in at remaining == gate');
  // ...and $C0, the third entry of the main envelope, is never heard at all.
  assert.ok(!nrx2.includes(0xC0));
});

test('GATE_OFF means the gate byte is $FF, so no key-off ever fires', () => {
  // min(dur, 0) is 0, and (0 >> 1) - 1 wraps to $FF. A duration counter
  // counting down from 7 can never equal that. Treating "+$06 == 0" as
  // "gate = (dur >> 1) - 1" instead releases every note halfway through.
  const drv = makeDriver({
    0x5000: [0xFC, 0x20, 0x50, 0xFA, 0x28, 0x50,
             0xE4,                       // GATE_OFF
             0x10, 0x07, 0xFF],
    0x5020: [0xA0, 0x08, 0xFF, 0x20, 0x50],
    0x5028: [0x11, 0x08, 0xFF, 0x28, 0x50],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }]);

  const r = run(drv, 7);
  assert.equal(drv.tracks[0].gate, 0xFF);
  assert.ok(r.every((s) => s[SQ1.nrx2] === 0xA0), 'release must never fire');
});

test('a slide starts on the PRESET note, for the preset duration', () => {
  // DEFSLIDE stores {per-tick delta, attack note, attack duration}. $450D
  // plays the preset's own note for the preset's own duration and $4514
  // subtracts that from the written duration; the note byte in the stream is
  // the DESTINATION, replayed by the auto-note path for what is left.
  //
  // Starting from the written note instead ramps from the wrong place and
  // only sounds right once it settles -- which is exactly how the bass line
  // behaved: right target, wrong origin.
  const drv = makeDriver({
    0x5000: [0xDF, 0xFE, 0x30, 0x02,     // DEFSLIDE 0 {-2, note $30, 2 ticks}
             0xE4,                       // GATE_OFF
             0xD9, 0x10, 0x06,           // SLIDE 0, note $10, dur 6
             0xFF],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }]);

  const r = run(drv, 6);
  const lo = r.map((s) => s[SQ1.lo]);
  const base = (n) => ((n - 0x80) + 0x80) & 0xFF;      // table bias + detune
  // Two ticks ramping down from the preset's note $30, then the written
  // note $10 held for the remaining four.
  assert.equal(lo[0], (base(0x30) - 2) & 0xFF);
  assert.equal(lo[1], (base(0x30) - 4) & 0xFF);
  assert.deepEqual(lo.slice(2), [base(0x10), base(0x10), base(0x10), base(0x10)]);
});

test('LOOP takes the jump on the first encounter', () => {
  // $4610 loads the counter AND jumps when the counter is zero; it only
  // decrements on later encounters. `LOOP_A $01` therefore plays its body
  // twice. Decrementing on entry loses one repetition of every loop.
  const drv = makeDriver({
    0x5000: [0xE4,                       // GATE_OFF
             0xFE, 0xA0,                 // VOLUME $A0 (static NRx2)
             0x10, 0x01,                 // NOTE $10, dur 1   <- loop body
             0xF0, 0x01, 0x03, 0x50,     // LOOP_A $01 -> $5003
             0x20, 0x01,                 // NOTE $20, dur 1
             0xFF],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }]);

  const r = run(drv, 3);
  const base = (n) => n & 0xFF;
  assert.deepEqual(r.map((s) => s[SQ1.lo]), [base(0x10), base(0x10), base(0x20)]);
});

test('REST keeps the release envelope top nibble when RELEASE_ENV is set', () => {
  // $4666: REST is not a note-off flag, it writes NRx2 directly. With
  // +$1F == 0 that byte is 0 (silence); otherwise the CURRENT top nibble
  // survives and only the low nibble is replaced, so the note keeps decaying
  // from wherever the envelope had got to.
  const drv = makeDriver({
    0x5000: [0xE4, 0xFE, 0x70,           // GATE_OFF, VOLUME $70
             0xF5, 0x02,                 // RELEASE_ENV $02
             0x10, 0x01,                 // NOTE, dur 1
             0xF6, 0x04,                 // REST dur 4
             0xFF],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }]);
  assert.equal(run(drv, 2)[1][SQ1.nrx2], 0x72);

  const bare = makeDriver({
    0x5000: [0xE4, 0xFE, 0x70, 0x10, 0x01, 0xF6, 0x04, 0xFF],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }]);
  assert.equal(run(bare, 2)[1][SQ1.nrx2], 0x00, 'no RELEASE_ENV -> silence');
});

test('$C9 sets the global sound-disabled bit and blocks later songs', () => {
  // $C8/$C9/$CA are the only writers of $C80A, and $40C6 refuses to start a
  // song while bit 7 is set. This is the engine's global mute.
  const drv = makeDriver({
    0x5000: [0xC9, 0x80, 0xE4, 0xFE, 0xA0, 0x10, 0x08, 0xFF],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }]);
  run(drv, 1);
  assert.equal(drv.chmask & 0x80, 0x80);
  drv.tracks[0].flags = 0;
  play(drv, 0);
  assert.equal(drv.tracks[0].flags, 0, 'song start must be refused');
});

test('DUTY writes the raw operand to NRx1, and noise triggers with $83', () => {
  // $45DB stores the operand byte whole -- it is NRx1, duty in bits 7-6 and
  // length in 5-0, not a 0-3 duty index. And $41C4 forces the noise channel's
  // "frequency HI" to the channel number 3, so NR44 reads $83 on a trigger.
  const drv = makeDriver({
    0x5000: [0xE4, 0xEC, 0x40, 0xFE, 0xA0, 0x10, 0x08, 0xFF],
    0x5100: [0xE4, 0xFE, 0xA0, 0x25, 0x08, 0xFF],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }, { slot: 1, chan: 3, ptr: 0x5100 }]);
  const s = run(drv, 1)[0];
  assert.equal(s[SQ1.nrx1], 0x40);
  assert.equal(s[0xFF22], 0x25, 'the note byte is a raw NR43');
  assert.equal(s[0xFF23], 0x83);
});

test('an unowned channel gets NRx2 = 0 -- silence is emergent', () => {
  // $433F. Nothing in the engine writes NR52 after init and there is no
  // note-off; a channel goes quiet only because nobody owns it. The wave
  // channel's entry in that sweep is NR32 ($FF1C), not NR30.
  const drv = makeDriver({
    0x5000: [0xE4, 0xFE, 0xA0, 0x10, 0x02, 0xFF],
  }, [{ slot: 0, chan: 0, ptr: 0x5000 }]);
  const r = run(drv, 4);
  assert.equal(r[0][SQ1.nrx2], 0xA0);
  assert.equal(r[2][SQ1.nrx2], 0x00, 'END releases the channel the same tick');
  assert.deepEqual(
    [r[3][0xFF17], r[3][0xFF1C], r[3][0xFF21]], [0, 0, 0],
    'every unowned channel, every tick');
});
