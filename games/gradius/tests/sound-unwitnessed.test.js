// WAVE 8, THE PARTS THE ORACLE CANNOT SEE.
//
// Every test in this file exists because a deliberate mutation of
// `games/gradius/src/sound.js` passed the gate -- 280 unit tests AND, for
// eleven of the sixteen, all 35 recorded scenarios, 11,695 compared frames, 0
// failures. Each test names its mutation and was seen RED against it and green
// with the file restored byte-identical (sha256
// 27df2a8f8400f64c432c5bd90f303d85ea1d3ff9d15d5f3ad440aacba169dd1a before and
// after every one; docs/worklog/gradius/08-test-hardening.md carries the
// table). The five the corpus DOES catch are named where they sit, with the
// field and the frame, because "one field of one scenario on one frame" is a
// coverage claim with a number in it and it deserved measuring.
//
// WHY THE CORPUS IS BLIND TO THESE, measured rather than asserted. I patched a
// COPY of src/sound.js with arm counters and ran the 8-scenario / 3,822-frame
// subset (idle long-idle pause enemy-waves terrain-death intro-boot
// intro-respawn autofire-normal):
//
//     COUNTERS {"octle4":745,"loop_bmi":70,"freeze_y0":100,
//               "dA_volTest":194,"loop_sbc":1,"fadeArm":2}
//
// -- `dA_F8` never appears: dialect A's `$F8 vv` volume prefix is executed ZERO
//    times, so $EE0E's constant is free ($EE0E below plays record $2B, whose
//    own bytes at $FE13 are `F8 10 09`, and gets it executed);
// -- `clampBit` never appears: the pulse-2 fade arm runs twice in the whole
//    subset and its $F2 clamp NEVER BITES, so $EEF0's $0B is free;
// -- `freeze_yN` never appears: every one of the 100 freezes has Y = 0;
// -- `octGT4` never appears: no stream reaches an octave above 4.
//
// And three whole ROUTINES are never entered with the argument that matters:
// $8357 is only ever called with $19 = 0 and a camera on page 0, so the area
// table, the boss page and the $1B gate are all read at one index and one
// value.
//
// THE FADE IS NOT UNREACHABLE, and the note this file used to carry saying so
// was wrong. MEASURED, from the cartridge's own recorded rows in
// tools/oracle/out/scen/enemy-waves.json (w_00F0..w_00F3, no poke of any kind):
//
//     f1849  (0,0,0,0)
//     f1850  (1,0,0,0)   <- $8398 INC $F0 fires IN PLAY
//     f1855  (1,5,0,15)  <- the $EEE6 pulse-2 fade arm runs
//     f1865  (1,15,0,15) <- and the compared window ends here
//
// $F1 needs 48 to step $F2 at all, so the corpus sees the first 15 frames of a
// ~530-frame fade and nothing downstream of it. That is why the clamp, the
// release constants and the triangle kill are all pinned here instead.

import test from 'node:test';
import assert from 'node:assert';

import { createState } from '../src/state.js';
import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { soundDriver, soundRequest, bindSoundRom, setBgm, OFF } from '../src/sound.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
bindSoundRom(res.soundTables);

const PULSE1 = 0xB0, PULSE2 = 0xC1, TRIANGLE = 0xD2, NOISE = 0xE3;
const rd = (s, a) => s.snd[a - 0xB0];
const wr = (s, a, v) => { s.snd[a - 0xB0] = v; };
const silent = () => createState();

// ===========================================================================
// $8357 -- THE BGM SELECTOR, READ AT ONE INDEX BY EVERYTHING
//
//   833F  96 59 5B 5D 5F 61 63     the AREA theme, per stage
//   8346  00 00 02 00 02 01 03     the CHR select -> $2D
//   834F  04 04 04 04 04 04 02     the page the area theme starts on
//   9A3D  0C 0C 0C 0C 0B 0B 0C     the boss page
//
// (read out of "Gradius (USA).nes" at those absolute addresses, not through
// src/assets.js -- docs/knowledge/03, "two sides of a comparison must be
// independently derived".)
//
// The port only ever loads stage 0's assets and no scenario's camera leaves
// page 0, so `$19` is 0 and `$3F` is 0 on all 11,695 compared frames: every
// one of those four tables is read at index 0 and compared against nothing.
// ===========================================================================

test('$836F LDX $833F,Y: the area theme is $833F[$19], NOT $833F[$19+1]', () => {
  // MUTATION SEEN RED: `t.read(0x833F + stage + 1)`. All 35 scenarios stayed at
  // 0 failures over 11,695 frames, because $8375's BEQ arm -- the only reader
  // of the value -- needs `$3F == $834F[$19]`, i.e. camera page 4, and every
  // compared window is on page 0.
  const s = silent();
  s.zp19 = 0; s.zp09 = 0; s.substate = 0x80;
  s.cam.lo = 0; s.cam.hi = 4;                    // $834F[0] = 4 exactly
  setBgm(s, res);
  assert.strictEqual(s.zp1C, 0x96,
    '$3F == $834F[0] takes $8375 BEQ $839B with X still holding $833F[0] = $96; '
    + '$833F[1] is $59, which is what a stride error plays');
  assert.deepStrictEqual(s.sfx, [0x7D, 0x96],
    '$83A1/$83A6: the $7D stop and then the area theme itself');
  // ...and the ARM below it is a different byte, so the two cannot be confused:
  // one page earlier is the FADE, not a theme.
  const t = silent();
  t.zp19 = 0; t.zp09 = 0; t.substate = 0x80;
  t.cam.lo = 0; t.cam.hi = 3;                    // $3F + 1 == $834F[0]
  setBgm(t, res);
  assert.deepStrictEqual(t.sfx, [], '$837D BEQ $838E requests NOTHING');
  assert.strictEqual(rd(t, 0xF0), 1, '...it arms the fade instead');
});

test('$8383 CMP $9A3D,Y: the boss page is $9A3D[$19] and the arms straddle it', () => {
  // MUTATION SEEN RED: `res.stage.bossPage + 1`. 0 failures on 11,695 frames --
  // $3F never approaches page $0C in any compared window.
  assert.strictEqual(res.stage.bossPage, 0x0C,
    'stage 1\'s boss page is $9A3D[0] = $0C');
  const at = (hi) => {
    const s = silent();
    s.zp19 = 0; s.zp09 = 0; s.substate = 0x80;
    s.cam.lo = 0; s.cam.hi = hi;
    setBgm(s, res);
    return { code: s.zp1C, sfx: s.sfx.slice(), f0: rd(s, 0xF0) };
  };
  // ONE PAGE SHORT of the boss: $8386 BEQ $838E -- the fade, no request at all.
  const before = at(0x0B);
  assert.deepStrictEqual(before, { code: 0, sfx: [], f0: 1 },
    '$3F + 1 == the boss page arms the fade and plays nothing');
  // ON it: $8388 BCC is not taken, $838A LDX #$A5 -- the boss BGM.
  const on = at(0x0C);
  assert.strictEqual(on.code, 0xA5, '$3F + 1 > the boss page plays $A5');
  assert.deepStrictEqual(on.sfx, [0x7D, 0xA5]);
  assert.strictEqual(on.f0, 0, '...and does NOT arm the fade');
  // And below both thresholds it is the ordinary stage BGM, which is the arm
  // every scenario in the corpus takes.
  assert.strictEqual(at(0).code, 0x93, '$8381 LDX #$93 on page 0');
});

test('$8390 CMP #$82: the fade is armed only while $1B is BELOW $82', () => {
  // MUTATION SEEN RED: `CMP #$92` (i.e. `state.substate >= 0x92`). 0 failures on
  // 11,695 frames -- $1B is $80 on every compared play frame, and $80 is below
  // both constants.
  const arm = (sub) => {
    const s = silent();
    s.zp19 = 0; s.zp09 = 0; s.substate = sub;
    s.cam.lo = 0; s.cam.hi = 0x0B;               // the $8386 fade arm
    setBgm(s, res);
    return rd(s, 0xF0);
  };
  assert.strictEqual(arm(0x81), 1, '$1B = $81 is below $82: the fade arms');
  assert.strictEqual(arm(0x82), 0, '$1B = $82 is not: $8392 BCS $839A returns');
  assert.strictEqual(arm(0x80), 1, 'the value every play frame actually has');
});

// ===========================================================================
// THE FADE, PAST THE 15 FRAMES THE CORPUS SEES
// ===========================================================================

test('$EEF0 CMP #$0B: $F2 is clamped at $0B, and it is clamped every time', () => {
  // MUTATIONS SEEN RED: the constant (and the value stored with it) as $0C, and
  // as $0A. Both left all 35 scenarios at 0 failures over 11,695 frames: the
  // arm runs twice in the whole corpus (measured, header) and the clamp does
  // not bite either time.
  //
  // The shape is not "$F2 stops at $0B". $ED26 INCs it every 48 ticks WITHOUT a
  // bound, and only pulse 2's next note parse pulls it back -- so the settled
  // behaviour is an oscillation, and the oscillation is what pins the constant:
  //
  //   48:0->1 ... 528:10->11 576:11->12 585:12->11 624:11->12 625:12->11 ...
  //
  // $0C would make that 12<->13 and $0A would make it 10<->11.
  const s = silent();
  soundRequest(s, 0x93);                          // the BGM owns pulse 2
  wr(s, 0xF0, 1);                                 // $8398 INC $F0
  const seen = new Set();
  const trans = [];
  let prev = 0;
  for (let f = 1; f <= 900; f++) {
    soundDriver(s, res);
    const v = rd(s, 0xF2);
    seen.add(v);
    if (v !== prev) { trans.push(`${prev}->${v}`); prev = v; }
  }
  assert.strictEqual(Math.max(...seen), 0x0C,
    '$F2 is INCed to $0C and never gets past it -- the clamp is `>= $0B -> $0B`, '
    + `so $0D is unreachable (saw ${[...seen].sort((a, b) => a - b).join(',')})`);
  assert.ok(trans.includes('12->11'),
    'and every excursion to $0C is pulled back to $0B by $EEF4 -- a clamp that '
    + `never fires is not a clamp (transitions: ${trans.join(' ')})`);
  assert.strictEqual(rd(s, 0xF2), 0x0B, 'the value it keeps returning to');
  // The steps below the clamp are the 48-frame ladder, unchanged.
  assert.strictEqual(trans.slice(0, 12).join(' '),
    '0->1 1->2 2->3 3->4 4->5 5->6 6->7 7->8 8->9 9->10 10->11 11->12');
});

test('$ED2C CMP #$07: the triangle dies while $F3 is 0..6 and SURVIVES at 7', () => {
  // MUTATION SEEN RED: `u8(z(state, G.F3) - 8)`, i.e. the threshold as 8. 0
  // failures on 11,695 frames -- the corpus never gets $F1 to $30 even once,
  // so $ED26 and everything below it is never executed with the fade armed.
  //
  // `LDA $F3 / CMP #$07 / BPL $ED3C` branches on the SIGN of ($F3 - 7), so it
  // is a strict `$F3 < 7`, and the boundary is the only thing worth pinning.
  const at = (f3) => {
    const s = silent();
    soundRequest(s, 0x15);                        // record $15: the triangle
    while (rd(s, TRIANGLE + OFF.DUR) < 3) soundDriver(s, res);
    wr(s, 0xF0, 1);
    wr(s, 0xF1, 0x2F);                            // one tick short of $30
    wr(s, 0xF3, f3);
    s.apu[0x08] = 0x55; s.apu[0x09] = 0x55;       // must be OVERWRITTEN, not left
    s.work.apuWrites = 0;
    soundDriver(s, res);
    return { owner: rd(s, TRIANGLE + OFF.OWNER), d4: rd(s, 0xD4),
             r8: s.apu[0x08], r9: s.apu[0x09], writes: s.work.apuWrites,
             f1: rd(s, 0xF1), f2: rd(s, 0xF2) };
  };
  const alive = at(7);
  assert.strictEqual(alive.owner, 0x15, '$F3 = 7: $ED30 BPL $ED3C, nothing happens');
  assert.deepStrictEqual([alive.r8, alive.r9], [0x55, 0x55],
    '...and $4008/$4009 are not touched at all');
  assert.strictEqual(alive.writes, 0, 'no APU write on that tick');
  assert.strictEqual(alive.f1, 0, '$ED28: $F1 wrapped either way');
  assert.strictEqual(alive.f2, 1, '$ED26: and $F2 stepped either way');

  const dead = at(6);
  assert.strictEqual(dead.owner, 0,
    '$F3 = 6: $ED32 STA $D4 frees the triangle -- $D4 IS $D2 + 2, its owner byte');
  assert.strictEqual(dead.d4, 0);
  assert.deepStrictEqual([dead.r8, dead.r9], [0, 0],
    '$ED36/$ED39 write $4008 and $4009 with the same A, which is 0');
  assert.strictEqual(dead.writes, 2, 'exactly two APU writes, no more');
});

test('$EEF8/$EEFC: the fade\'s release offset is 6 and its RATE depends on $C3', () => {
  // MUTATIONS SEEN RED: `RELOFF := 0`; `RELRATE := $05` always; `RELRATE := $0D`
  // always. All three left every unit test green before this one existed, and
  // their corpus coverage is ONE FRAME OF ONE SCENARIO or nothing at all --
  // measured over all 35 scenarios:
  //
  //     RELOFF := 0            2 failures   enemy-waves w_00CE@1855 w_00CF@1855
  //     RELRATE := $05 always  1 failure    enemy-waves w_00D0@1855
  //     RELRATE := $0D always  0 failures   NOTHING SEES IT
  //
  // frame 1855 being the fifth frame of the only fade the corpus reaches. The
  // third is invisible because no scenario ever has pulse 2 owned by anything
  // other than $13 WHILE the fade is armed.
  //
  // $EEFC reads $C3, which with X = $C1 is pulse 2's OWN owner byte, so the
  // test is "is the stage-1 music what is playing on pulse 2". Both arms are
  // reachable from ordinary requests:
  const rates = (req) => {
    const s = silent();
    soundRequest(s, req);
    wr(s, 0xF0, 1);
    const ro = new Set(), rr = new Set();
    for (let f = 1; f <= 200; f++) {
      soundDriver(s, res);
      ro.add(rd(s, PULSE2 + OFF.RELOFF));
      rr.add(rd(s, PULSE2 + OFF.RELRATE));
    }
    return { owner: rd(s, PULSE2 + OFF.OWNER), ro: [...ro], rr: [...rr] };
  };
  // $93 stamps $13 on all three of its channels, so pulse 2 reads $13.
  const bgm = rates(0x93);
  assert.strictEqual(bgm.owner, 0x13);
  assert.deepStrictEqual(bgm.rr, [0x0D], '$EFFE CMP #$13 matches -> $EF02 LDA #$0D');
  assert.deepStrictEqual(bgm.ro, [6], '$EEF8 LDA #$06 / STA $0E,X');
  // $19 is a pulse-2 record in its own right ($F49B), so the same arm runs with
  // a different owner and takes the OTHER branch.
  const other = rates(0x19);
  assert.strictEqual(other.owner, 0x19);
  assert.deepStrictEqual(other.rr, [0x05], '$EF06 LDA #$05 for anything else');
  assert.deepStrictEqual(other.ro, [6], '...but the offset is unconditional');
});

// ===========================================================================
// DIALECT A -- THE SFX PARSER, WHICH THE CORPUS BARELY RUNS
// ===========================================================================

test('$EE0E CMP #$F8: the volume prefix, played from record $2B\'s own bytes', () => {
  // MUTATION SEEN RED: `CMP #$F9`. 0 failures on 11,695 frames, and the reason
  // is measured rather than argued: an arm counter on this line reports
  // dA_volTest = 194 and dA_F8 = 0 over the 8-scenario subset. The corpus
  // reaches the test 194 times and NEVER with a $F8.
  //
  // No poke is needed to fix that -- the cartridge has the bytes. Record $2B is
  // the noise channel's engine sound at $FE0F:
  //
  //     FE0F  2F 30 00 00      $2n: length $F, volume $30; period $0000
  //     FE13  F8 10 09         <- the prefix, its operand, and the period
  //     FE16  F8 10 09  F8 20 09 ...
  //
  // so the FIRST note has no prefix and the second does, 15 ticks later.
  const s = silent();
  soundRequest(s, 0x2B);
  assert.strictEqual(rd(s, NOISE + OFF.OWNER), 0x2B, 'record $2B is the NOISE channel');
  for (let i = 0; i < 15; i++) soundDriver(s, res);
  assert.strictEqual(rd(s, NOISE + OFF.SHADOW), 0x30,
    'the first note: $EDD6 stored the $2n operand and $EE1B left it alone '
    + '(its own high nibble is 0)');
  assert.strictEqual(rd(s, 0xF5), 0x00, '...and its period low byte is $00');
  soundDriver(s, res);                            // the 16th tick parses $FE13
  assert.strictEqual(rd(s, NOISE + OFF.SHADOW), 0x31,
    '$EE0E sees $F8, SKIPS it, and takes the volume from the NEXT byte ($10 -> '
    + '$1): $31. Treating the $F8 as the volume byte gives $3F');
  assert.strictEqual(s.apu[0x0C], 0x31, '$EE1F STA $4000,X with X = $0C');
  assert.strictEqual(rd(s, 0xF5), 0x09,
    'and the period is $0009 -- the two bytes AFTER the skipped $F8. Without '
    + 'the skip the cursor is one byte back and the period low reads $10');
  assert.strictEqual(rd(s, 0xF4), 0x08, '$EF7B ORA #$08 over a period high of 0');
  assert.strictEqual(s.apu[0x0E], 0x09, '$EF9E STA $4002,X');
});

test('$EE00 AND #$10: it is BIT 4 of the $4000 shadow, not bit 5', () => {
  // MUTATIONS SEEN RED: `& 0x20` and `& 0x08`, and the pair is the measurement.
  // Every $4000 shadow the corpus ever produces is $3x, so bit 4 and bit 5 are
  // both SET on every one of them and bit 3 is clear on every one of them:
  //
  //     & 0x20   0 failures over 35 scenarios / 11,695 frames   INVISIBLE
  //     & 0x08   57 failures across 15 scenarios (first: pause
  //              apuWrites/apuDigest/w_00B8 @466)              caught
  //
  // The corpus is not blind to this line in general -- it is blind to exactly
  // the 4-versus-5 confusion, which is the one a re-implementation makes.
  //
  // $08,X is ordinary RAM written from stream data ($EDD6 stores the `$2n`
  // operand verbatim), so a shadow of $20 is a byte the format can carry; this
  // constructs it directly and runs the SAME stream both ways.
  const at = (shadow) => {
    const s = silent();
    soundRequest(s, 0x2B);
    for (let i = 0; i < 16; i++) soundDriver(s, res);   // pointer at $FE16
    wr(s, NOISE + OFF.SHADOW, shadow);
    wr(s, NOISE + OFF.DUR, 1);                    // parse on the next tick
    soundDriver(s, res);
    return { shadow: rd(s, NOISE + OFF.SHADOW), f5: rd(s, 0xF5) };
  };
  // Bit 4 SET: the APU is in constant-volume mode, so the parser looks for a
  // volume update, finds $F8, skips it and takes $10 -> $1.
  assert.deepStrictEqual(at(0x10), { shadow: 0x11, f5: 0x09 },
    'bit 4 set -> $EE06 masks to $10 and $EE1B ORs in the new nibble');
  // Bit 5 SET, bit 4 CLEAR: $EE04 BEQ $EE22 -- no volume update at all, and the
  // byte the volume would have come from is read as the PERIOD instead.
  assert.deepStrictEqual(at(0x20), { shadow: 0x20, f5: 0x10 },
    'bit 5 is not the constant-volume flag: the shadow must be untouched and '
    + 'the $F8 must be read as the period high byte');
  assert.deepStrictEqual(at(0x08), { shadow: 0x08, f5: 0x10 },
    'nor is bit 3');
});

test('$EF64 CPX #$D2 / BCS: the NOISE channel gets no detune add', () => {
  // MUTATION SEEN RED: `base !== TRIANGLE` in writePeriod, which hands the
  // detune to the noise channel as well. 0 failures on 11,695 frames: noise
  // enters dialect A once in the whole 8-scenario subset and its $0C,X is 0
  // there, so the add is a no-op wherever the corpus can see it.
  //
  // `CPX #$D2 / BCS $EF7B` is a >= test, so it excludes the triangle ($D2) AND
  // the noise ($E3) -- one comparison, two channels, and the second one is the
  // one nothing exercises.
  const periods = (req, base, detune) => {
    const s = silent();
    soundRequest(s, req);
    const out = [];
    for (let i = 0; i < 24; i++) {
      wr(s, base + OFF.DETUNE, detune);           // held: $EDEA would rewrite it
      soundDriver(s, res);
      out.push(rd(s, 0xF5));
    }
    return out.join(',');
  };
  assert.strictEqual(periods(0x2B, NOISE, 0x20), periods(0x2B, NOISE, 0),
    '$0C,X must make no difference at all on the noise channel');
  // The same poke on PULSE 1 must move every period, or the test above is
  // agreeing with a driver that ignores detune everywhere.
  const p0 = periods(0x01, PULSE1, 0);
  const p32 = periods(0x01, PULSE1, 0x20);
  assert.notStrictEqual(p32, p0, 'pulse 1 DOES take the add');
  assert.strictEqual(p32.split(',')[0], String(Number(p0.split(',')[0]) + 0x20),
    '$EF72 CLC / ADC $F5 -- the detune is added to the period LOW byte');
});

// ===========================================================================
// THE SEQUENCER'S TWO OTHER UNWITNESSED ARMS
// ===========================================================================

test('$ECF5/$ECF7: a loop counter PAST its count steps back instead of wrapping', () => {
  // MUTATION SEEN RED: `const stored = a;` (never take the SBC arm).
  //
  // The port's own note said "no measured stream reaches it". THAT IS WRONG and
  // it is corrected in the same commit as this test: an arm counter over the
  // 8-scenario subset reports loop_bmi = 70 and loop_sbc = 1 -- the overshoot
  // arm executes once in 3,822 frames, in enemy-waves. Its whole coverage is
  // one field of one scenario on one frame (the mutation gives `1 failures:
  // enemy-waves w_00D8@1848`, $D2 + 6, the triangle's $FE pass counter), so it
  // is pinned here as well.
  //
  // $F3AC is record $13's own `FE 04 96 F3` -- the stage-1 pulse-1 part's loop,
  // four passes back to $F396.
  const at = (loop) => {
    const s = silent();
    soundRequest(s, 0x13);
    soundDriver(s, res);
    wr(s, PULSE1 + OFF.PTRLO, 0xAC);
    wr(s, PULSE1 + OFF.PTRHI, 0xF3);
    wr(s, PULSE1 + OFF.LOOP, loop);
    wr(s, PULSE1 + OFF.DUR, 1);                   // parse the $FE on the next tick
    soundDriver(s, res);
    return rd(s, PULSE1 + OFF.LOOP);
  };
  assert.strictEqual(at(1), 2,
    '$ECEB: 1 + 1 = 2, which is under the count of 4, so $ECF5 BMI $ECFA stores '
    + 'the INCREMENTED value -- the ordinary pass');
  assert.strictEqual(at(8), 8,
    '8 + 1 = 9 is PAST the count of 4, so $ECF7 SEC / SBC #$01 puts it back to '
    + '8: the counter does not advance and does not wrap. Storing A instead '
    + 'gives 9 and the loop runs for ever');
});

test('$EE82 LDA $15: dialect B tests the pause BEFORE it parses anything', () => {
  // MUTATION SEEN RED: moving the `state.zp15` test below the `$Dn` block, so
  // the freeze is entered with Y past the operands. 0 failures on 11,695
  // frames.
  //
  // THIS IS WHY `freezeAndSilence`'s `y` IS ALWAYS 0, and the argument is worth
  // writing down because a break that passes the gate is otherwise indefensible
  // (measured: freeze_y0 = 100, freeze_yN = 0 over the 8-scenario subset). Y is
  // 0 at $ED5E because $ED46 opens with `LDY #$00`, and it is 0 at $EE86
  // because the ONLY way into dialect B with a non-zero Y is $EEA1 -- the
  // triangle's `$Dn` re-dispatch -- which is BELOW this test and so cannot run
  // on a paused tick at all. Move the test down and the two operand bytes leak
  // into $07,X and into three APU registers.
  //
  // The stream is the cartridge's own $F74E (`D3 B3 FF`, inside index $30),
  // pointed at the TRIANGLE, which is the one place `$Dn` is two bytes.
  const at = (paused) => {
    const s = silent();
    soundRequest(s, 0x15);
    wr(s, TRIANGLE + OFF.PTRLO, 0x4E);
    wr(s, TRIANGLE + OFF.PTRHI, 0xF7);
    wr(s, TRIANGLE + OFF.FLAG, 1);                // dialect B
    wr(s, TRIANGLE + OFF.DUR, 1);
    s.zp15 = paused;
    s.apu[0x0A] = 0x55; s.apu[0x0B] = 0x55; s.apu[0x08] = 0x55; s.apu[0x0C] = 0x55;
    soundDriver(s, res);
    return { owner: rd(s, TRIANGLE + OFF.OWNER), last3: rd(s, TRIANGLE + OFF.LAST3),
             dur: rd(s, TRIANGLE + OFF.DUR),
             a: s.apu[0x0A], b: s.apu[0x0B], t: s.apu[0x08], n: s.apu[0x0C] };
  };
  // Not paused: the $Dn is consumed and the $FF behind it ends the stream with
  // Y = 2 (that is tests/sound.test.js's $ECB6 case, and it is here to prove
  // the stream really does advance Y past 0).
  assert.strictEqual(at(0).owner, 2, '$EEA1 re-dispatches at $ED77 with Y = 2');
  // Paused: NOTHING of that happens. The channel is still owned, its duration
  // is put back, and every value written is the ZERO Y holds at $ED46.
  const p = at(1);
  assert.strictEqual(p.owner, 0x15, 'the channel keeps its owner');
  assert.strictEqual(p.dur, 1, '$ED5E INC $00,X undoes the DEC');
  assert.strictEqual(p.last3, 0,
    '$ED60 TYA / STA $07,X with Y = 0 -- a 2 here means the pause test ran too '
    + 'late');
  assert.deepStrictEqual([p.a, p.b, p.t], [0, 0, 0],
    '$4002/$4003/$4008 all get that same 0');
  assert.strictEqual(p.n, 0x30, '$ED6E LDA #$30 / STA $400C is the one literal');
});

// ===========================================================================
// THE WORK COUNTERS
// ===========================================================================

test('the four audio counters are RESET each frame, not accumulated', () => {
  // MUTATION SEEN RED: deleting `state.work.apuWrites = 0` from src/nmi.js.
  //
  // THIS ONE THE CORPUS DOES CATCH -- 35 failures, every scenario, first at
  // intro-boot apuWrites@284 -- and it is here anyway, because the UNIT layer's
  // only check on the four counters was `assert.ok(s.work.apuWrites < 1000)`.
  // That is true of a running total for the first fifty frames and true of
  // anything at all for a single frame: a check of the shape docs/knowledge/03
  // calls decoration, sitting in a test whose NAME says it covers the reset.
  //
  // Two machines, same inputs, one with the counters poisoned first: after the
  // frame they must agree EXACTLY.
  const run = (poison) => {
    const s = bootState(res.manifest);
    soundRequest(s, 0x93);
    nmi(s, 0, res, false);
    if (poison) {
      s.work.audioTicks = 77; s.work.audioChannels = 88;
      s.work.apuWrites = 999; s.work.apuDigest = 0xBEEF;
    }
    nmi(s, 0, res, false);
    return { t: s.work.audioTicks, c: s.work.audioChannels,
             w: s.work.apuWrites, d: s.work.apuDigest };
  };
  const clean = run(false), poisoned = run(true);
  assert.deepStrictEqual(poisoned, clean,
    'every one of the four is "this frame", so last frame\'s value cannot '
    + 'survive into it');
  assert.strictEqual(clean.t, 1, 'and one frame is exactly one $ED02');
  assert.ok(clean.w > 0 && clean.c > 0,
    `the frame must actually do audio work for this to mean anything `
    + `(writes ${clean.w}, channels ${clean.c})`);
});
