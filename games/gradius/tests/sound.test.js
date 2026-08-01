// WAVE 8 -- the $EC1E/$ED02 sound driver.
//
// The oracle compares 80 bytes of the driver's zero page plus four work
// counters on every frame of all 35 scenarios, which is a very strong check on
// what the driver DOES from the state it is seeded with. What it cannot do is
// reach anything the stage-1 BGM does not do in a 240-to-1866-frame window: no
// scenario STARTS a track from silence, none reaches the $F0 fade (measured 0
// in eleven scripted runs), none issues an illegal request, and none plays the
// pause jingle for its whole length.
//
// So this file drives the driver directly, from a known state, and every
// assertion is against a number MEASURED on the cartridge by
// 00-recon-sound.md's probes -- never against what this port happens to do.

import test from 'node:test';
import assert from 'node:assert';

import { createState } from '../src/state.js';
import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { soundDriver, soundRequest, bindSoundRom, setBgmCode, stopAllSound,
         pauseSaveChannel, pauseRestoreChannel, OFF } from '../src/sound.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
bindSoundRom(res.soundTables);

const PULSE1 = 0xB0, PULSE2 = 0xC1, TRIANGLE = 0xD2, NOISE = 0xE3;
const OWNER = [PULSE1, PULSE2, TRIANGLE, NOISE].map((b) => b + OFF.OWNER);

/** A silent machine: four free channels, nothing playing. */
function silent() {
  const s = createState();
  return s;
}

const rd = (s, a) => s.snd[a - 0xB0];
const owners = (s) => OWNER.map((a) => rd(s, a));

/** Tick the driver until pulse 1's owner is freed; returns the tick count. */
function ticksUntilFree(s, base = PULSE1, limit = 5000) {
  for (let i = 1; i <= limit; i++) {
    soundDriver(s, res);
    if (rd(s, base + OFF.OWNER) === 0) return i;
  }
  return null;
}

// ===========================================================================
// THE REQUEST PROTOCOL
// ===========================================================================

test('$EC26/$EC2F: the request byte is nnrrrrrr -- index and channel COUNT', () => {
  const s = silent();
  // $93 = the stage-1 BGM. nn = 10 -> THREE records, $13 $14 $15, on pulse 1,
  // pulse 2 and the triangle.
  //
  // BUT ALL THREE OWNER BYTES READ $13, NOT $13/$14/$15, and that is the ROM
  // rather than a shortcut: `$EC91 LDA $DF / STA $02,X` reads $DF, and $DF is
  // written ONCE at $EC2F before the loop and never reloaded per record. So a
  // multi-channel request stamps the FIRST index on every channel it takes --
  // which is also what makes the priority test behave the way it does, since
  // every channel of one piece of music guards itself with the same number.
  //
  // MEASURED both ways: 00-recon-sound.md 6's pause rows read `c0=3B c1=13
  // c2=13` (pulse 2 and the triangle both holding $13 while pulse 1 has the
  // jingle), and this corpus's own `idle` artifact steps
  // (0,0,0,0) -> (16,16,16,0) at game frame 200 -> (0,0,0,0) at 250 ->
  // (19,19,19,0) at 310, i.e. the attract demo's $90 and then the stage's $93,
  // each stamping ONE index on three channels.
  soundRequest(s, 0x93);
  assert.deepStrictEqual(owners(s), [0x13, 0x13, 0x13, 0],
    '$93 takes three channels and gives all three the FIRST index');
  // The RECORDS really are consecutive, even though the owners are not: the
  // three stream pointers must all differ.
  const ptrs = [PULSE1, PULSE2, TRIANGLE].map(
    (b) => rd(s, b + OFF.PTRLO) | (rd(s, b + OFF.PTRHI) << 8));
  assert.strictEqual(new Set(ptrs).size, 3,
    'records $13/$14/$15 are three DIFFERENT streams ($F396/$F3B1/$F426)');
  // $01 is a one-record request. Same low bits, no count.
  const t = silent();
  soundRequest(t, 0x01);
  assert.deepStrictEqual(owners(t), [0x01, 0, 0, 0]);
});

test('$EC49/$EC4B: a request is accepted iff index >= the channel owner', () => {
  // MEASURED (00-recon-sound.md 1, a 1200-frame autofire run): 83 shot-SFX
  // requests, 73 of them issued while pulse 1's owner byte was > 1 and
  // REJECTED. The stage-1 BGM's pulse-1 part owns $B2 = $13 from game frame 310
  // to 822, so every shot fired in that 513-frame window makes no sound at all.
  const s = silent();
  soundRequest(s, 0x93);                          // the BGM: $B2 = $13
  const before = s.snd.slice();
  soundRequest(s, 0x01);                          // a shot: index 1 < $13
  assert.strictEqual(rd(s, PULSE1 + OFF.OWNER), 0x13,
    'the shot must NOT take the channel -- 1 < $13');
  // ...and nothing else may move either: a rejected request re-points no
  // pointer and resets no counter.
  for (let a = 0xB0; a <= 0xC0; a++) {
    assert.strictEqual(s.snd[a - 0xB0], before[a - 0xB0],
      `$${a.toString(16)} moved on a REJECTED request`);
  }
  // Equal is accepted: $EC4B is BCC, not BCC-or-BEQ.
  const t = silent();
  soundRequest(t, 0x06);
  const ptr = rd(t, PULSE1 + OFF.PTRLO);
  soundRequest(t, 0x06);
  assert.strictEqual(rd(t, PULSE1 + OFF.OWNER), 0x06);
  assert.strictEqual(rd(t, PULSE1 + OFF.PTRLO), ptr,
    'index == owner is ACCEPTED and re-seeds the channel');
});

test('$EC74: a STOP record leaves the owner at 0 and never parses a byte', () => {
  const s = silent();
  soundRequest(s, 0x93);
  assert.deepStrictEqual(owners(s), [0x13, 0x13, 0x13, 0]);
  // $FC -> records $3C $3D $3E $3F, all pointing at $F08F, whose first byte is
  // $00. $EC74 sees the 0, forces $DF to 0, and $EC93 stores THAT -- so the
  // channels come out FREE rather than playing a silence track.
  stopAllSound(s);
  assert.deepStrictEqual(owners(s), [0, 0, 0, 0],
    '$FC must FREE all four channels, not give them a stream to play');
  // ...and the driver must then do nothing at all with them. $F8/$F9 are
  // excluded because $ED06 stores the struct base and the APU offset into them
  // on every iteration of the four-channel loop, owned or not -- they are the
  // loop's cursor, not a channel's state.
  const before = s.snd.slice();
  soundDriver(s, res);
  for (let a = 0xB0; a <= 0xFF; a++) {
    if (a === 0xF8 || a === 0xF9) continue;
    assert.strictEqual(s.snd[a - 0xB0], before[a - 0xB0],
      `$${a.toString(16)} moved on a tick where all four owners are 0`);
  }
  assert.strictEqual(s.work.audioChannels, 0, '$ED46 must not run at all');
});

test('$EC42: a request whose low 6 bits are 0 is a LOUD THROW, not silence', () => {
  // $EFCD-$EFCF is the PITCH table's last two entries ($03C0's low byte and the
  // whole of $038A), so record 0 does not exist: $EC3A reads $C0 as an APU
  // offset and $EC42 indexes a FOUR-byte table with 48. MEASURED: every request
  // the cartridge issued in eleven scripted runs was $01 $06 $0D $3B $7D $90
  // $93 $F7 or $FC, none with low 6 bits 0 -- so this is a crash the game never
  // triggers and a throw is the only honest port of it.
  for (const req of [0x00, 0x40, 0x80, 0xC0]) {
    assert.throws(() => soundRequest(silent(), req), /\$EC42/,
      `request $${req.toString(16)} must throw`);
  }
  // The very next index does not throw, so the guard is on the record and not
  // on "anything unusual".
  assert.doesNotThrow(() => soundRequest(silent(), 0x01));
});

test('$EC95: a request that TARGETS pulse 2 resets the fade, even when rejected', () => {
  const s = silent();
  soundRequest(s, 0x93);                          // pulse 2 owner = $14
  s.snd[0xF0 - 0xB0] = 1; s.snd[0xF1 - 0xB0] = 9; s.snd[0xF2 - 0xB0] = 3;
  // $7D = records $3D $3E: a STOP for pulse 2 and the triangle. It is INDEX $3D,
  // which is >= $14, so it is accepted -- but the point is $EC95, which runs on
  // the rejected path too.
  soundRequest(s, 0x1D);                          // index $1D < $14? no: accepted
  assert.deepStrictEqual([rd(s, 0xF0), rd(s, 0xF1), rd(s, 0xF2)], [0, 0, 0],
    '$EC99-$EC9F must zero $F0/$F1/$F2 whenever X == $C1');
  // Now the rejected case: put a high owner on pulse 2 and send a low index.
  s.snd[0xF0 - 0xB0] = 1; s.snd[0xF1 - 0xB0] = 9; s.snd[0xF2 - 0xB0] = 3;
  s.snd[PULSE2 + OFF.OWNER - 0xB0] = 0x30;
  soundRequest(s, 0x19);                          // index $19 < $30 -> REJECTED
  assert.strictEqual(rd(s, PULSE2 + OFF.OWNER), 0x30, 'must have been rejected');
  assert.deepStrictEqual([rd(s, 0xF0), rd(s, 0xF1), rd(s, 0xF2)], [0, 0, 0],
    '$EC95 is BELOW the $EC4B reject branch: the fade is reset either way');
});

// ===========================================================================
// THE FRAME LOOP AND THE TICK COUNT
// ===========================================================================

test('$EECE-$EED5: duration = base * (dddd + 1), and 513 frames is the proof', () => {
  // THE SINGLE MOST FALSIFIABLE NUMBER IN THIS SUBSYSTEM. Two independent
  // derivations of one figure (docs/knowledge/03):
  //
  //   the CARTRIDGE   $B2 held $13 from game frame 310 to 822 inclusive and
  //                   read 0 at 823 -- 513 frames of ownership
  //   snddata.py      decoding index $13 from the ROM bytes alone gives 512
  //                   ticks; the missing one is $EC63's `STY $00,X` with Y = 1,
  //                   so the first command is parsed on the NEXT driver call
  //
  // and the recon watched the decoder fail both ways: `base << exp` gives 768
  // ticks and `loop while c == cnt + 1` gives 640. This test is the same check
  // pointed at the PORT, which computes the duration and the loop rather than
  // decoding them.
  const s = silent();
  soundRequest(s, 0x13);                          // ONE record: pulse 1 only
  assert.strictEqual(rd(s, PULSE1 + OFF.OWNER), 0x13);
  assert.strictEqual(rd(s, PULSE1 + OFF.DUR), 1, '$EC63 seeds the counter with 1');
  const n = ticksUntilFree(s, PULSE1, 4000);
  assert.strictEqual(n, 513,
    'the stage-1 pulse-1 part must own its channel for exactly 513 driver '
    + 'ticks -- 1 setup + snddata.py\'s 512. `base << dddd` gives 769 and a '
    + 'loop count of cnt+1 gives 641.');
});

test('$ED02: four structs, stride $11, and a free channel is skipped', () => {
  const s = silent();
  soundRequest(s, 0x93);                          // three channels owned
  // The snapshot is taken AFTER the request, not before: $EC1E's own scratch
  // ($DF/$E0/$E1 on the triangle's +$D..+$F and $E8 on the noise's +$5) has
  // already written into two of the four structs, and that is the ROM.
  const before = s.snd.slice();
  soundDriver(s, res);
  assert.strictEqual(s.work.audioTicks, 1, 'one $ED02 per call');
  assert.ok(s.work.audioChannels >= 3,
    `$ED46 must run for each of the three OWNED channels (got `
    + `${s.work.audioChannels})`);
  // $ED0A LDA $02,X / BEQ $ED11: the noise channel's owner is 0, so nothing
  // inside its struct may move THIS tick.
  for (let i = 0; i <= 0x0C; i++) {
    assert.strictEqual(rd(s, NOISE + i), before[NOISE + i - 0xB0],
      `$${(NOISE + i).toString(16)} moved on a channel whose owner is 0`);
  }
});

test('$ED50/$ED52: the duration counter counts DOWN, one per tick', () => {
  const s = silent();
  soundRequest(s, 0x13);
  soundDriver(s, res);                            // 1 -> 0 -> parse the first event
  const d0 = rd(s, PULSE1 + OFF.DUR);
  assert.ok(d0 > 1, `the first event must set a real duration (got ${d0})`);
  soundDriver(s, res);
  assert.strictEqual(rd(s, PULSE1 + OFF.DUR), d0 - 1);
  soundDriver(s, res);
  assert.strictEqual(rd(s, PULSE1 + OFF.DUR), d0 - 2);
});

// ===========================================================================
// PAUSE
// ===========================================================================

test('$ED54-$ED5E: pause FREEZES every channel except the one owning $3B', () => {
  // MEASURED (00-recon-sound.md 6, START at game frame 500 and again at 560):
  //   f500  $15=1  c0=3B c1=13 c2=13  d1=43
  //   f532  $15=1  c0=00 c1=13 c2=13  d1=43    <- the jingle ended, d1 STILL 43
  //   f560  $15=0  c0=13 c1=13 c2=13  d1=43
  //   f561  $15=0                     d1=42    <- and it resumes on that tick
  const s = silent();
  soundRequest(s, 0x93);
  for (let i = 0; i < 40; i++) soundDriver(s, res);
  // Stop on a frame where pulse 1 is MID-NOTE: at a duration of 1 the next
  // tick parses an event rather than counting down, and the freeze would be
  // indistinguishable from it.
  while (rd(s, PULSE1 + OFF.DUR) < 3) soundDriver(s, res);
  const frozen = s.snd.slice();
  s.zp15 = 1;                                     // $9AEC STA $15
  for (let i = 0; i < 30; i++) soundDriver(s, res);
  for (const base of [PULSE1, PULSE2, TRIANGLE]) {
    assert.strictEqual(rd(s, base + OFF.DUR), frozen[base + OFF.DUR - 0xB0],
      `$${base.toString(16)}'s duration counter must not move while $15 is set`);
    assert.strictEqual(rd(s, base + OFF.PTRLO), frozen[base + OFF.PTRLO - 0xB0],
      `$${base.toString(16)}'s stream pointer must not move either`);
  }
  // ...and it resumes on exactly the tick it stopped on. The counter must be
  // > 1 for that to be observable at all -- at 1 the unfrozen tick parses the
  // next event instead of just counting down -- so this asserts on a channel
  // that is mid-note.
  const d = rd(s, PULSE1 + OFF.DUR);
  assert.ok(d > 1, `pulse 1 must be mid-note for this to mean anything (${d})`);
  s.zp15 = 0;
  soundDriver(s, res);
  assert.strictEqual(rd(s, PULSE1 + OFF.DUR), d - 1,
    'the music resumes on exactly the tick it stopped on');
});

test('$ED58 CMP #$3B: the pause jingle is the ONE sound that plays while paused', () => {
  const s = silent();
  soundRequest(s, 0x93);
  for (let i = 0; i < 40; i++) soundDriver(s, res);
  s.zp15 = 1;
  soundRequest(s, 0x3B);                          // $9AFA -- takes pulse 1
  assert.strictEqual(rd(s, PULSE1 + OFF.OWNER), 0x3B);
  const p2 = rd(s, PULSE2 + OFF.DUR);
  for (let i = 0; i < 20; i++) soundDriver(s, res);
  assert.strictEqual(rd(s, PULSE2 + OFF.DUR), p2, 'pulse 2 stays frozen');
  assert.notStrictEqual(rd(s, PULSE1 + OFF.PTRLO), 0,
    'pulse 1 must have a stream');
  // The jingle advances: its pointer moves while everything else stands still.
  const moved = ticksUntilFree(s, PULSE1, 600);
  assert.ok(moved !== null,
    'the $3B jingle must play to its end and free the channel even though $15 '
    + 'is set -- that is the whole point of $ED58');
  assert.strictEqual(rd(s, PULSE2 + OFF.DUR), p2,
    'and pulse 2 is STILL frozen after the jingle finished');
});

test('$9AF0/$9B33: the pause save/restore round-trips pulse 1 exactly', () => {
  const s = silent();
  soundRequest(s, 0x93);
  for (let i = 0; i < 40; i++) soundDriver(s, res);
  const before = s.snd.slice(0, 0x11);             // $B0-$C0
  s.zp15 = 1;
  pauseSaveChannel(s);                            // $9AF0-$9AFC
  assert.deepStrictEqual([...s.sndSave], [...before],
    '$9AF0 copies all 17 bytes of $B0-$C0 to $01A0');
  assert.strictEqual(rd(s, PULSE1 + OFF.OWNER), 0x3B,
    '...and then $9AFA overwrites pulse 1 with the jingle');
  for (let i = 0; i < 25; i++) soundDriver(s, res);
  s.zp15 = 0;
  pauseRestoreChannel(s);                         // $9B27-$9B3B
  assert.deepStrictEqual([...s.snd.slice(0, 0x11)], [...before],
    'the restore must put back every one of the 17 bytes -- including $B2, '
    + 'which $9B27 zeroes four instructions earlier and the loop overwrites');
});

// ===========================================================================
// THE FADE ($F0), WHICH NO SCRIPTED RUN REACHES
// ===========================================================================

test('$ED1A-$ED3C: the fade steps every 48 frames and then kills the triangle', () => {
  // MEASURED by intervention only -- SND_POKE="F0=1@400-400", because $F0 was 0
  // in every one of eleven scripted runs:
  //   f400 $F0=1 $F2=0 ... triangleOwner=13
  //   f447 $F0=1 $F2=1   (and every 48 frames: 495 543 591 639 ...)
  //   f879 $F0=1 $F2=10  triangleOwner=00   <- the triangle is killed
  const s = silent();
  soundRequest(s, 0x93);
  s.snd[0xF0 - 0xB0] = 1;                         // $8398 INC $F0
  const steps = [];
  let last = 0;
  for (let f = 1; f <= 200; f++) {
    soundDriver(s, res);
    if (rd(s, 0xF2) !== last) { steps.push(f - (steps.length ? 0 : 0)); last = rd(s, 0xF2); }
  }
  assert.deepStrictEqual(steps, [48, 96, 144, 192],
    '$F1 counts to $30 and only then INCs $F2 -- exactly 48 driver ticks apart');
  // ...and $F2 is clamped at $0B ($EEF0 CMP #$0B).
  const t = silent();
  soundRequest(t, 0x93);
  t.snd[0xF0 - 0xB0] = 1;
  for (let f = 0; f < 48 * 20; f++) soundDriver(t, res);
  assert.ok(rd(t, 0xF2) >= 0x0B, 'the fade runs its full range');
  assert.strictEqual(rd(t, TRIANGLE + OFF.OWNER), 0,
    '$ED32-$ED39: once pulse 2\'s faded volume $F3 drops below 7 the TRIANGLE '
    + 'is zeroed outright -- measured at f879 of the poked run');
});

// ===========================================================================
// THE LAG RULE
// ===========================================================================

test('$80A1 sits BELOW $8073: a dropped NMI drops a music tick', () => {
  // MEASURED (00-recon-sound.md 0, `--tag boot`, 600 game frames):
  //   nmiEntries = 601   lagFrames = 1   driverCalls = 600   gameFrames = 600
  // i.e. driverCalls == nmiEntries - lagFrames.
  const s = bootState(res.manifest);
  soundRequest(s, 0x13);
  // Warm up through nmi(), not soundDriver(), so `audioTicks` is left exactly
  // as a real frame leaves it -- the counters are reset at the TOP of nmi() and
  // a dropped NMI returns before that, so a hand-driven tick would leave a 1
  // sitting there and this test would be asserting on its own setup.
  nmi(s, 0, res, false);                           // past $EC63's setup tick
  while (rd(s, PULSE1 + OFF.DUR) < 3) nmi(s, 0, res, false);
  const dur = rd(s, PULSE1 + OFF.DUR);
  assert.ok(dur > 2, `pulse 1 must be mid-note (${dur})`);
  const ran = nmi(s, 0, res, true);                // forced lag
  assert.strictEqual(ran, false);
  assert.strictEqual(s.work.audioTicks, 0,
    'the driver must not be entered at all on a dropped NMI');
  assert.strictEqual(rd(s, PULSE1 + OFF.DUR), dur,
    'and the duration counter must not move -- a dropped NMI stretches every '
    + 'note by one frame, permanently');
  nmi(s, 0, res, false);
  assert.strictEqual(s.work.audioTicks, 1);
  assert.strictEqual(rd(s, PULSE1 + OFF.DUR), dur - 1,
    'the very next non-dropped NMI ticks it exactly once');
});

test('the work counters are per-FRAME and start from zero every frame', () => {
  const s = bootState(res.manifest);
  soundRequest(s, 0x93);
  nmi(s, 0, res, false);
  const a = { t: s.work.audioTicks, c: s.work.audioChannels,
              w: s.work.apuWrites, d: s.work.apuDigest };
  assert.strictEqual(a.t, 1);
  nmi(s, 0, res, false);
  assert.strictEqual(s.work.audioTicks, 1,
    'audioTicks is "this frame", not a running total');
  assert.ok(s.work.apuWrites < 1000);
});

// ===========================================================================
// THE BGM SELECTOR
// ===========================================================================

test('$839B: setting the SAME BGM code twice requests nothing the second time', () => {
  const s = silent();
  setBgmCode(s, 0x93);
  assert.deepStrictEqual(s.sfx, [0x7D, 0x93],
    '$83A1 sends $7D (stop pulse2 + triangle) and then the code itself');
  assert.strictEqual(s.zp1C, 0x93);
  s.sfx.length = 0;
  setBgmCode(s, 0x93);
  assert.deepStrictEqual(s.sfx, [],
    '$839B CPX $1C / BEQ -- the de-dupe means NO request at all, not a rejected '
    + 'one');
  s.sfx.length = 0;
  setBgmCode(s, 0xA5);
  assert.deepStrictEqual(s.sfx, [0x7D, 0xA5], 'a DIFFERENT code goes through');
});

test('$8369 LDX $3E / BNE: the BGM selector only fires when $3E is 0', () => {
  const s = bootState(res.manifest);
  s.cam.lo = 43;                                  // the corpus's align-frame $3E
  s.zp1C = 0;
  nmi(s, 0, res, false);
  assert.strictEqual(s.zp1C, 0,
    '$8369 returns on every frame whose camera low byte is non-zero, which is '
    + '510 frames out of every 512');
  const t = bootState(res.manifest);
  t.cam.lo = 0;
  t.cam.hi = 0;
  t.zp1C = 0;
  nmi(t, 0, res, false);
  assert.strictEqual(t.zp1C, 0x93,
    '$3E == 0 with $3F == 0 takes the $8381 LDX #$93 arm -- the stage BGM, and '
    + 'the reason the cartridge starts it at game frame 310, the first play '
    + 'frame after $9B3E zeroes $3E');
});

// ===========================================================================
// THE TWO LINES THE CORPUS CANNOT FALSIFY
//
// Both of these were MEASURED unfalsifiable by the oracle: the driver was
// deliberately broken, the whole gate re-run, and the 11695-frame comparison
// stayed at 0 failures. They are here because a line no check can redden is a
// line the next agent is free to "simplify" (docs/knowledge/03).
// ===========================================================================

test('$EF56: the octave loop wraps Y through 256, it does not clamp', () => {
  // `LDY $10,X / TYA / CMP #$04 / BEQ $EF62 / LSR $F4 / ROR $F5 / INY / BNE`.
  // For an octave ABOVE 4 the loop does not stop -- Y wraps and it shifts ~252
  // times, which zeroes the period outright. 00-recon-sound.md could not close
  // whether any real stream reaches it: octaveLoopIters.max was 13 per frame
  // across everything it could make play, and forcing the suspect stream
  // (index $24) on to the triangle produced no spike.
  //
  // MEASURED HERE, on this port: replacing the loop's `yo === 4` with
  // `yo >= 4` -- the clamp -- left ALL 35 scenarios at 0 failures over 11695
  // compared frames. So the corpus cannot tell the two models apart and this
  // test is the only thing that can.
  const s = silent();
  soundRequest(s, 0x13);
  let sawShift = false;
  for (let i = 0; i < 400; i++) {
    // Forced on EVERY tick, because the stream carries its own $En commands and
    // whichever one runs last wins. The assertion below only fires on a tick
    // where the poke SURVIVED (no $En) and a period was actually written.
    s.snd[PULSE1 + OFF.OCTAVE - 0xB0] = 7;        // $10,X = 7, i.e. 4 - 7 = -3
    const f4 = rd(s, 0xF4), f5 = rd(s, 0xF5);
    soundDriver(s, res);
    const moved = rd(s, 0xF4) !== f4 || rd(s, 0xF5) !== f5;
    if (!moved || rd(s, PULSE1 + OFF.OCTAVE) !== 7) continue;
    // 253 right-shifts of an 11-bit period leave nothing. $EF7B then ORs in the
    // length-counter bits, so $F4 reads $08 and $F5 reads 0. A CLAMPED loop
    // would shift zero times and leave the pitch table's own value (1710..906,
    // i.e. $F5 anywhere from $8A to $AE).
    assert.strictEqual(rd(s, 0xF5), 0,
      `octave 7 left $F5=$${rd(s, 0xF5).toString(16)}; the literal loop shifts `
      + `253 times and leaves nothing of the period`);
    assert.strictEqual(rd(s, 0xF4), 0x08,
      '$EF7B ORA #$08 on a period that has been shifted away');
    sawShift = true;
    break;
  }
  assert.ok(sawShift, 'no note was parsed in 200 ticks -- the test did not run');
});

test('$ECB6 STY $02,X: the freed owner is Y, and Y is not always 0', () => {
  // `TYA / STY $02,X`, not `LDA #$00 / STA $02,X`. Y is 0 on every path the
  // corpus reaches, so replacing both with a literal 0 left all 35 scenarios at
  // 0 failures over 11695 frames -- MEASURED, this wave.
  //
  // The one path that reaches $ECB6 with Y != 0 is the TRIANGLE's `$Dn vv`
  // handler: $EE9D sends it back to the DISPATCHER at $ED77 with Y already at
  // 2, so a triangle stream whose `$Dn vv` is immediately followed by `$FF`
  // ends with owner = 2 and writes 2 to $4008.
  //
  // NO STREAM IN THIS CARTRIDGE DOES THAT, and that is derived rather than
  // assumed: a scan of the whole $EFB8-$FFBF data region finds exactly ONE
  // `$Dx ?? $FF` byte triple, at $F74E, and it sits inside index $30 -- a
  // PULSE 2 stream, where `$Dn` is three bytes and the $FF is its decay
  // operand, not a command. So this test constructs the case from those real
  // ROM bytes rather than waiting for data that does not exist.
  const s = silent();
  soundRequest(s, 0x15);                          // record $15: the triangle
  assert.strictEqual(rd(s, TRIANGLE + OFF.OWNER), 0x15);
  s.snd[TRIANGLE + OFF.PTRLO - 0xB0] = 0x4E;      // $F74E: $Dx ?? $FF
  s.snd[TRIANGLE + OFF.PTRHI - 0xB0] = 0xF7;
  s.snd[TRIANGLE + OFF.FLAG - 0xB0] = 1;          // dialect B
  s.snd[TRIANGLE + OFF.DUR - 0xB0] = 1;           // parse on the next tick
  soundDriver(s, res);
  assert.strictEqual(rd(s, TRIANGLE + OFF.OWNER), 2,
    '$ECB7 STY $02,X with Y = 2 -- the triangle\'s $Dn re-dispatches at $ED77 '
    + 'with Y past its two operand bytes, and the $FF then frees the channel to '
    + 'TWO rather than to zero');
  assert.strictEqual(s.apu[0x08], 2,
    '$ECC1/$ECC3: the triangle skips the `LDA #$30`, so $4008 gets A -- which '
    + 'is still Y');
});
