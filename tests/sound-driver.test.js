// Unit tests for the sequence driver, 7:$412B.
//
// The oracle diff (tools/oracle/sound.py + sounddiff.mjs) proves the driver
// against the cartridge on real songs; these pin the individual RULES in
// isolation, so a regression names the rule it broke instead of pointing at
// tick 417 of song $03. Every fixture is a hand-assembled sequence in a fake
// bank -- nothing here is ROM-derived.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDriver, tick, play, request, REQ_PLAY } from '../src/sound/driver.js';
import { Sound } from '../src/sound/index.js';

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

// ---------------------------------------------------------------------------
// The $C6FB MAILBOX.  ROM: sub_00_0AE1 (post) and $096C-$0988 (consume).
//
// It is NOT a queue, and modelling it as one is audible: a FIFO cannot lose a
// cue the cartridge loses, because it never has four slots occupied at once.
//
// MEASURED (tools/oracle/mailbox.py + mailboxdiff.mjs --all, 4 recordings /
// 884 requests): every request's SLOT and CONSUMING TICK match the cartridge.
// Latency histograms {1:13,2:13,3:15,4:13} mean 2.52 on level 1 and
// {1:39,2:26,3:24,4:46} mean 2.57 on level 12 -- the same round robin at
// different arrival phases, 2.5 being its uniform mean. Replaying the same
// recordings through the OLD FIFO gives {1:54} and {1:135}, mean 1.00, and on
// the level-12 shooter burst it drops ZERO where the cartridge drops one.
// ---------------------------------------------------------------------------

/** A driver with no songs at all: `play()` returns at $40C6 and tick() is cheap. */
function mailDriver() {
  const asked = [];
  const songs = new Proxy({}, {
    get(_, k) { if (k !== 'then') asked.push(Number(k)); return undefined; },
    has() { return false; },
  });
  const drv = createDriver({
    tickHz: 4096 / 69, pitch: new Uint16Array(84), wave: new Uint8Array(16),
    bank: new Uint8Array(0x4000), bankBase: BANK_BASE, songs,
  });
  drv.booted = true;
  drv.asked = asked;
  return drv;
}

test('$0AE1 takes the FIRST FREE slot, and a slot is free only when BOTH bytes are 0', () => {
  // $0AE5-$0B07 scans slots 0..3 in order; $0AEE/$0AF2 test the id AND the
  // mask. That pair test is why cue $00 -- the title theme -- can be requested
  // at all: its mask $03 is what makes the slot read as occupied.
  const drv = mailDriver();
  assert.equal(request(drv, 0x10, 0x01), 0);
  assert.equal(request(drv, 0x11, 0x01), 1);
  assert.equal(request(drv, 0x12, 0x01), 2);
  assert.equal(request(drv, 0x13, 0x01), 3);
  assert.equal(request(drv, 0x14, 0x01), -1, 'the fifth is DROPPED, silently');
  assert.equal(drv.dropped, 1);

  // Free slot 1 by hand and the next request goes THERE, not to the end.
  drv.mail[2] = 0; drv.mail[3] = 0;
  assert.equal(request(drv, 0x15, 0x01), 1);

  const cold = mailDriver();
  assert.equal(request(cold, 0x00, 0x03), 0, 'id $00 with a mask occupies a slot');
  assert.equal(request(cold, 0x01, 0x01), 1);
});

test('the ISR reads ONE slot per tick, round robin, whether or not it is occupied', () => {
  // $096C-$0988: read [$FFA1], add 2, wrap at 7, and clear both bytes --
  // UNCONDITIONALLY. An empty slot costs a tick exactly like a full one, and
  // that is the whole reason a request can wait four ticks.
  const drv = mailDriver();
  request(drv, 0x21, 0x01);                    // slot 0
  request(drv, 0x22, 0x01);                    // slot 1
  assert.equal(drv.mailCursor, 0);

  tick(drv);
  assert.deepEqual(drv.asked, [0x21], 'slot 0 consumed on tick 1');
  assert.equal(drv.mailCursor, 2, 'the cursor is a BYTE offset: 0, 2, 4, 6');
  tick(drv);
  assert.deepEqual(drv.asked, [0x21, 0x22]);
  assert.equal(drv.mailCursor, 4);
  tick(drv); tick(drv);
  assert.equal(drv.mailCursor, 0, '$097F: CP $07 / JR C wraps after slot 3');
  assert.deepEqual(drv.asked, [0x21, 0x22], 'and the two empty slots played nothing');
});

test('a request posted just BEHIND the cursor waits four ticks; one ahead waits one', () => {
  // This is the latency the FIFO could not reproduce. Slot 0 is free again
  // straight after tick 1, so a request arriving then sits there for a full
  // lap while a LATER request in a lower-numbered slot is served first.
  const drv = mailDriver();
  request(drv, 0x31, 0x01);                    // slot 0
  tick(drv);                                   // consumes it; cursor -> 2
  assert.deepEqual(drv.asked, [0x31]);

  assert.equal(request(drv, 0x32, 0x01), 0, 'slot 0 is free again');
  assert.equal(request(drv, 0x33, 0x01), 1, 'and this one is straight ahead');
  tick(drv);
  assert.deepEqual(drv.asked, [0x31, 0x33], 'the LATER request goes first');
  tick(drv); tick(drv);
  assert.deepEqual(drv.asked, [0x31, 0x33]);
  tick(drv);
  assert.deepEqual(drv.asked, [0x31, 0x33, 0x32], 'four ticks later');
});

test('a saturated mailbox DROPS, which is the audible half', () => {
  // MEASURED (mailboxdiff.mjs L12FIRE, the shooter's ten-consecutive-frame
  // $17 burst): the cartridge loses one $17 and so does the port, on the same
  // request (#13, tick 28). Under --spam both drop 70 of 666.
  const drv = mailDriver();
  let dropped = 0;
  for (let i = 0; i < 12; i++) if (request(drv, 0x17, 0x01) < 0) dropped++;
  assert.equal(dropped, 8, 'four in, eight on the floor');
  assert.equal(drv.dropped, 8);
});

test('the mask is consumed in $412B order: reset, start, fade in, fade out', () => {
  const drv = mailDriver();
  drv.fadeCount = 5; drv.fadeIn = 5; drv.fadeOut = 5;
  request(drv, 0x07, 0x04);                    // REQ_FADE_OUT alone ($04)
  tick(drv);
  assert.deepEqual(drv.asked, [], 'no play bit, so no song was looked up');
  assert.equal(drv.fadeOut, 0x12, '$40AC');
  assert.equal(drv.fadeIn, 0, '$40AC clears the fade-IN pair');
});

test('an empty slot is a no-op, not a request for song 0', () => {
  // The slot is cleared to {0, 0} and `if (mask)` is what makes that mean
  // nothing. Treating a zero id as a play would restart the title theme four
  // times a second.
  const drv = mailDriver();
  for (let i = 0; i < 8; i++) tick(drv);
  assert.deepEqual(drv.asked, []);
});

// ---------------------------------------------------------------------------
// The per-frame staging list.  src/sound/index.js pump().
// ---------------------------------------------------------------------------

test('pump() DRAINS the frame list unconditionally -- overflow is dropped, not carried', () => {
  // `state.sound.queue` is a staging list, not a buffer: the cartridge calls
  // $0AE1 synchronously wherever a cue is raised, and the port cannot, because
  // game code runs on the display clock and the mailbox is read on the timer's.
  //
  // The port used to run `while (q.length) shift()` into a second 4-deep FIFO
  // inside the driver = EIGHT buffered where the cartridge holds four, so it
  // could never lose a cue the cartridge loses. MEASURED (mailboxdiff.mjs
  // L12FIRE): on the level-12 shooter's ten-consecutive-frame $17 burst the
  // cartridge drops one and, now, so does the port -- on the same request.
  const snd = new Sound();
  snd.drv = mailDriver();
  const state = { sound: { queue: [] } };
  for (let i = 0; i < 6; i++) state.sound.queue.push({ id: 0x17, mask: 0x01 });

  snd.pump(state);
  assert.equal(state.sound.queue.length, 0, 'the frame list is emptied');
  assert.equal(snd.drv.dropped, 2, 'and two requests hit the floor, as $0B07 does');
  assert.equal(snd.drv.mail.filter((b, i) => i % 2 === 0 && b === 0x17).length, 4);

  // The next frame therefore starts clean -- nothing was carried over.
  snd.pump(state);
  assert.equal(snd.drv.dropped, 2);
});

test('a request with no mask defaults to REQ_PLAY', () => {
  const snd = new Sound();
  snd.drv = mailDriver();
  snd.pump({ sound: { queue: [{ id: 0x0F }] } });
  assert.equal(snd.drv.mail[1], REQ_PLAY);
});
