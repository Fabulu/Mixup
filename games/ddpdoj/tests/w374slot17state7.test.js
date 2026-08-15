// W374 -- `$25D560`, THE STATE-7 HANDLER shared by object-dispatch slots [17] and [9]. 732 bytes,
// `$25D560..$25D83B`, one `rts`, ported into `src/objslot17.js` this wave.
//
// Everything here is DRIVEN. The handler is run against a real `Ram` and the assertions read back
// the record fields it wrote and the calls its draw tail made. Two registries are used:
//
//   * a SPY registry, which records the call order and the state byte AS SEEN BY EACH DRAW. That
//     second thing is the point of test 4: `$25D748` falls through, so state 8 is on the record
//     while the sprites for that frame are built.
//   * the REAL `objslot9.js` draws, wired in through `ctx.selectDraws`, for the bucket-delta test.
//     Importing them from `objslot17.js` would close a cycle -- `objslot9.js` already imports
//     `objslot17.js` -- so the tail takes them as an argument or off `ctx`. `fx()` imports BOTH
//     modules, so a broken export in either one fails here rather than silently no-oping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

// Bucket 0, the bucket $23DFB4 resolves to. NOTE: `BUCKETS[i].counter` is the counter's ADDRESS and
// is only ever READ. Writing that field would rewrite the bucket descriptors for the whole process.
const CTR = 0x80afc0;
const REC = 12;

const A5 = 0x812800;

async function fx() {
  const mod = await import('../src/objslot17.js');
  const slot9 = await import('../src/objslot9.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram } = await import('../src/background.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n) };
  const notes = [];
  const sounds = [];
  const ctx = { unported: { note: (addr, what) => notes.push({ addr, what }) },
    unportedLog: { note: () => {} }, tx: new TxVram(), soundPost: (a) => sounds.push(a) };
  return { ...mod, slot9, ram: new Ram(), rom, ctx, notes, sounds, a5: A5 };
}

/** A registry of the seven names the tail calls, each recording its own name and the record's state
 *  byte at the moment it was called. */
function spy() {
  const calls = [];
  const draws = {};
  for (const name of ['draw25E220', 'draw25E29E', 'draw25E4D0', 'draw25E6CE', 'draw25E824',
    'draw25EF30', 'draw25F074']) {
    draws[name] = (ram, rom, ctx, a6, d7) => calls.push({ name, state: ram.u8(a6 + 0x01), d7 });
  }
  return { calls, draws, names: () => calls.map((c) => c.name) };
}

const ORDER = ['draw25E220', 'draw25E29E', 'draw25E4D0', 'draw25E6CE', 'draw25E824',
  'draw25EF30', 'draw25F074'];

const bytesUsed = (ram) => ram.u16(CTR);
const notesAt = (notes, addr) => notes.filter((n) => n.addr === addr);

/** The dispatcher clears `($3,A5)` once per frame at `$25CEC8`; the two `bset` gates in the tail
 *  are meaningless without that, so every driven frame here does it too. */
function frameStart(ram) { ram.setU8(A5 + 0x03, 0); }

// ---------------------------------------------------------------------------------------------
// 1. THE RENDEZVOUS
// ---------------------------------------------------------------------------------------------

test('W374 $25D588 rendezvous: the other record not in state 7 skips the WHOLE body and still draws',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, sounds, a5 } = await fx();
    const a6 = SCREEN17.recs;                                // record 0
    const a0 = a6 + H.otherRec;                              // ...so D7 = 1 and A0 = A6 + $70
    ram.setU8(a0 + H.liveAt, 1);                             // the other record IS live
    ram.setU8(a0 + H.rendezvousAt, 6);                       // ...but it is still in state 6

    const s = spy();
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);

    // $25D58E bne.w $25D800 lands INSIDE the draw tail, so all seven draws still run.
    assert.deepEqual(s.names(), ORDER, 'the draw tail ran in full off the LAST frame values');
    // ...and nothing above it did.
    assert.equal(ram.u16(a6 + H.frameAt), 0, '($32,A6) did NOT advance');
    assert.equal(ram.u16(a6 + H.announceLatch), 0, '($5E,A6) was not latched');
    assert.equal(ram.u16(H.soundLatch), 0, '$812F82 was not latched');
    assert.equal(ram.u16(a6 + H.cursorAt), 0, 'the zoom cursor did not move');
    assert.equal(ram.u16(a6 + H.rampA.at), 0, 'no ramp moved');
    assert.equal(ram.u16(a6 + H.rampA.deltaAt), 0, '  ...nor its delta word');
    assert.deepEqual(sounds, [], '$28CB9C was not posted');

    // With the other record AT 7 the body runs: the frame counter moves and the sound fires.
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);
    assert.equal(ram.u16(a6 + H.frameAt), 1, '($32,A6) advanced once the pair met');
    assert.equal(ram.u16(H.soundLatch), 1, '$812F82 latched');
    assert.deepEqual(sounds, [H.sound], '$28CB9C posted exactly once');
    assert.deepEqual(s.names().slice(7), ORDER, 'and the tail ran again, same order');
  });

test('W374 $25D588 reads the OTHER record, and D7 picks which one', { skip: SKIP }, async () => {
  const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
  const rec0 = SCREEN17.recs;
  const rec1 = SCREEN17.recs + H.otherRec;
  const s = spy();

  // D7 == 0 is record 1, whose partner is at -$70 = record 0. Put record 0 at 7 and record 1's own
  // byte at 6: if the port read its OWN state the body would be skipped.
  ram.setU8(rec0 + H.liveAt, 1);
  ram.setU8(rec0 + H.rendezvousAt, H.rendezvous);
  ram.setU8(rec1 + H.rendezvousAt, 6);
  frameStart(ram);
  phase7_25D560(ram, rom, ctx, a5, rec1, 0, s.draws);
  assert.equal(ram.u16(rec1 + H.frameAt), 1, 'D7 == 0 read A6 - $70, which is record 0');

  // ...and the mirror. D7 != 0 is record 0, partner +$70.
  ram.setU8(rec1 + H.liveAt, 1);
  ram.setU8(rec1 + H.rendezvousAt, H.rendezvous);
  frameStart(ram);
  phase7_25D560(ram, rom, ctx, a5, rec0, 1, s.draws);
  assert.equal(ram.u16(rec0 + H.frameAt), 1, 'D7 != 0 read A6 + $70, which is record 1');
});

// ---------------------------------------------------------------------------------------------
// 2. THE OTHER RECORD INACTIVE
// ---------------------------------------------------------------------------------------------

test('W374 $25D584: an inactive partner skips the announce but still reaches $25D5B0',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, sounds, a5 } = await fx();
    const { announceBox260A20 } = await import('../src/rank.js');
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 0);                             // $25D584 tst.b (A0) -- ZERO
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);            // even though it says state 7

    const s = spy();
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);

    for (const side of [0, 1]) {
      assert.equal(ram.u16(announceBox260A20(side)), 0, `side ${side}'s mailbox was NOT posted`);
    }
    assert.equal(ram.u16(a6 + H.announceLatch), 0, '($5E,A6) was never latched either');
    // ...and $25D5B0 onwards ran anyway: the beq.s at $25D586 targets $25D5B0, not the rts.
    assert.equal(ram.u16(H.soundLatch), 1, '$812F82 latched, so $25D5B0 was reached');
    assert.deepEqual(sounds, [H.sound], '$28CB9C posted');
    assert.equal(ram.u16(a6 + H.frameAt), 1, '($32,A6) advanced');
    assert.deepEqual(s.names(), ORDER, 'and the tail ran');
  });

// ---------------------------------------------------------------------------------------------
// 3. THE LOOP COUNTER
// ---------------------------------------------------------------------------------------------

test('W374 $25D574: a non-zero $813098 skips $25FAA4 and BOTH pair gates, and lands ON $25D5A0',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, notes, a5 } = await fx();
    const { announceBox260A20 } = await import('../src/rank.js');
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU16(H.loopCounter, 1);
    // The two things it skips over: the partner is DEAD and not in state 7, either of which would
    // otherwise send control to $25D800 or to $25D5B0.
    ram.setU8(a0 + H.liveAt, 0);
    ram.setU8(a0 + H.rendezvousAt, 0);

    const s = spy();
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);

    assert.deepEqual(notesAt(notes, H.perFrame), [], '$25FAA4 was NOT called');
    assert.equal(ram.u16(a6 + H.announceLatch), 0, '($5E,A6) was NOT latched -- the gate was jumped');
    // $25D5A0 IS reached, so the announce goes out unlatched. D7 = 1 is side 0, and $25D5A4's
    // addq/andi INVERTS it, so it is side 1's mailbox that moves.
    assert.equal(ram.u16(announceBox260A20(1)), 1, 'the INVERTED side was announced');
    assert.equal(ram.u16(announceBox260A20(0)), 0, '  ...and side 0 was not');
    assert.equal(ram.u16(a6 + H.frameAt), 1, 'and the body ran on');
    assert.deepEqual(s.names(), ORDER);

    // With the counter clear and the same dead partner, $25FAA4 IS called and nothing is announced.
    ram.setU16(H.loopCounter, 0);
    notes.length = 0;
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);
    assert.equal(notesAt(notes, H.perFrame).length, 1, '$25FAA4 is called when $813098 is clear');
  });

test('W374 $25D5A4 INVERTS the side $25D4E4 returned', { skip: SKIP }, async () => {
  const { phase7_25D560, sideFromD7_25D4E4, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
  const { announceBox260A20 } = await import('../src/rank.js');
  assert.equal(sideFromD7_25D4E4(0), 1, 'D7 == 0 is side 1');
  assert.equal(sideFromD7_25D4E4(1), 0, 'D7 != 0 is side 0');
  ram.setU16(H.loopCounter, 1);                              // the unlatched announce path
  frameStart(ram);
  phase7_25D560(ram, rom, ctx, a5, SCREEN17.recs + H.otherRec, 0, spy().draws);
  assert.equal(ram.u16(announceBox260A20(0)), 1, 'D7 == 0 is side 1, so side 0 is announced');
  assert.equal(ram.u16(announceBox260A20(1)), 0);
});

// ---------------------------------------------------------------------------------------------
// 4. STATE 8 -- WRITTEN TO BOTH RECORDS, AND THE DRAWS SEE IT
// ---------------------------------------------------------------------------------------------

/** Put a record where `$25D6E6` will send it straight to `$25D748`: past the slide gate, travel at
 *  its cap so the speed arms fall through, and the done latch already up. */
function armStateEight(ram, H, a6, a0) {
  ram.setU8(a0 + H.liveAt, 1);
  ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
  ram.setU8(a6 + 0x01, H.rendezvous);
  ram.setU16(a6 + H.frameAt, H.gateSlide - 1);               // -> $F0 after the addq
  ram.setU16(a6 + H.speedAt, 0);
  ram.setU16(a6 + H.travelAt, H.travelCap);
  ram.setU16(a6 + H.doneAt, 1);                              // $25D6E6 tst.w ($5A,A6) -> $25D748
}

test('W374 $25D748 writes state 8 into BOTH records and FALLS THROUGH into the draws',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    armStateEight(ram, H, a6, a0);

    const s = spy();
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);

    assert.equal(ram.u8(a6 + SCREEN17.phaseAt), H.nextPhase, '$25D748 -> this record is state 8');
    assert.equal(ram.u8(a0 + SCREEN17.phaseAt), H.nextPhase,
      '$25D74E -> the OTHER record is state 8 too, before the dispatcher ever reached it');
    // The whole point of the fall-through: it is not "advance and return".
    assert.deepEqual(s.names(), ORDER, 'all seven draws ran on the state-8 frame');
    for (const c of s.calls) {
      assert.equal(c.state, H.nextPhase,
        `${c.name} saw ($1,A6) already at 8 -- which is what silences $25E824's blocks E/D/C`);
    }
    // ...and the frame counter advanced, so $25D754 onwards ran too rather than being jumped over.
    assert.equal(ram.u16(a6 + H.frameAt), H.gateSlide);
    assert.equal(ram.u16(a6 + H.tiltAt), H.tiltStep, '$25D754s block ran after the state write');
  });

// ---------------------------------------------------------------------------------------------
// 5. THE THREE FRAME GATES
// ---------------------------------------------------------------------------------------------

test('W374 the three frame gates: $F0 for the slide, $AA for the tilt, $F0 for the step walk',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, rom, ctx, a5 } = await fx();
    const { Ram } = await import('../src/ram.js');
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;

    /** One driven frame from a clean Ram, with ($32,A6) seeded so it lands on `frame`. */
    const at = (frame) => {
      const ram = new Ram();
      ram.setU8(a0 + H.liveAt, 1);
      ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
      ram.setU16(a6 + H.frameAt, frame - 1);
      frameStart(ram);
      phase7_25D560(ram, rom, ctx, a5, a6, 1, spy().draws);
      assert.equal(ram.u16(a6 + H.frameAt), frame, `the counter reached $${frame.toString(16)}`);
      return ram;
    };

    // $25D6A0 cmpi.w #$F0 / bcs.w $25D754 -- the slide block, and ($35,A6) is its first write.
    assert.equal(at(H.gateSlide - 1).u8(a6 + H.slideFlagAt), 0, 'frame $EF: no slide');
    assert.equal(at(H.gateSlide).u8(a6 + H.slideFlagAt), H.slideFlag, 'frame $F0: the slide opens');

    // $25D754 cmpi.w #$AA -- the tilt.
    assert.equal(at(H.gateRamp - 1).u16(a6 + H.tiltAt), 0, 'frame $A9: no tilt');
    assert.equal(at(H.gateRamp).u16(a6 + H.tiltAt), H.tiltStep, 'frame $AA: the tilt steps by $80');

    // $25D7BA cmpi.w #$F0 -- the $25D85C walk. Entry 0 of the table is $0020.
    assert.equal(at(H.gateSlide - 1).u16(a6 + H.stepIntoAt), 0, 'frame $EF: no step');
    assert.equal(at(H.gateSlide).u16(a6 + H.stepIntoAt), rom.u16(H.stepTable),
      'frame $F0: ($4E,A6) took the first table entry');
    assert.equal(rom.u16(H.stepTable), 0x0020, '  ...which is $0020');

    // $25D784 cmpi.w #$1 -- the zoom block. Its own fields gate it further; see the zoom test.
    assert.equal(at(H.gateZoom).u16(a6 + H.delayAt), 0, 'frame 1: the zoom block ran');
  });

// ---------------------------------------------------------------------------------------------
// 6. THE SLIDE'S THREE PHASES
// ---------------------------------------------------------------------------------------------

test('W374 the slide accelerates, then cruises, then decelerates by TWO to a stop',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    const s = spy();
    const step = () => {
      ram.setU16(a6 + H.frameAt, H.gateSlide);               // pinned past the slide gate
      frameStart(ram);
      phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);
    };

    // ACCELERATE. $25D6C0 addq.w #1,($4C,A6) then ($4A,A6) += ($4C,A6): travel is the triangular
    // number of the speed, which is exactly what makes the cruise arm unreachable from a cold
    // start -- travel passes $1800 at speed 111, well below the $80 the cruise arm needs.
    for (let n = 1; n <= 10; n++) {
      step();
      assert.equal(ram.u16(a6 + H.speedAt), n, `frame ${n}: the speed word is ${n}`);
      assert.equal(ram.u16(a6 + H.travelAt), (n * (n + 1)) / 2, `  ...and travel is the sum`);
    }
    assert.equal(ram.u16(a6 + H.doneAt), 0, 'nothing has finished');
    assert.equal(ram.u16(a6 + H.emitGateAt), 0, '($54,A6) is still down');

    // CRUISE. Forced, because the cartridge cannot reach it: speed at its $80 cap with travel
    // still short. $25D6DA loads the speed WITHOUT the addq, so it is a constant per frame.
    ram.setU16(a6 + H.speedAt, H.speedCap);
    ram.setU16(a6 + H.travelAt, 0);
    for (let n = 1; n <= 4; n++) {
      step();
      assert.equal(ram.u16(a6 + H.speedAt), H.speedCap, `cruise ${n}: the speed does NOT grow`);
      assert.equal(ram.u16(a6 + H.travelAt), H.speedCap * n, `  ...travel grows by $80 a frame`);
    }

    // DECELERATE. Travel at its cap sends $25D6B0/$25D6D0 to $25D6E6, and with ($5A,A6) still down
    // that is the finish block: ($54,A6) goes up and the speed comes off by two a frame.
    ram.setU16(a6 + H.travelAt, H.travelCap);
    let speed = ram.u16(a6 + H.speedAt);
    step();
    assert.equal(ram.u16(a6 + H.emitGateAt), 1, '$25D6EE ($54,A6) = 1 -- draw25E4D0s emit 2 gate');
    assert.equal(ram.u16(a6 + H.speedAt), speed - H.speedDecel, 'the speed came off by TWO');
    let frames = 1;
    while (ram.u16(a6 + H.speedAt) !== 0) { step(); frames++; }
    assert.equal(frames, speed / H.speedDecel, `${speed} / 2 = ${speed / 2} frames of decel`);
    assert.equal(ram.u16(a6 + H.doneAt), 1, '$25D716 raised the done latch on the last one');
    assert.equal(ram.u8(a6 + SCREEN17.phaseAt), 0, 'and state 8 is NOT written on that frame');

    // The NEXT frame is the one that finds ($5A,A6) up and goes to $25D748.
    step();
    assert.equal(ram.u8(a6 + SCREEN17.phaseAt), H.nextPhase, 'the frame AFTER the latch: state 8');
    assert.equal(ram.u8(a0 + SCREEN17.phaseAt), H.nextPhase, '  ...on both records');
  });

test('W374 $25D706 subq.w #2 catches the BORROW as well as the zero', { skip: SKIP }, async () => {
  const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
  const a6 = SCREEN17.recs;
  const a0 = a6 + H.otherRec;
  ram.setU8(a0 + H.liveAt, 1);
  ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
  ram.setU16(a6 + H.frameAt, H.gateSlide);
  ram.setU16(a6 + H.travelAt, H.travelCap);
  ram.setU16(a6 + H.speedAt, 1);                             // an ODD speed: 1 - 2 borrows
  frameStart(ram);
  phase7_25D560(ram, rom, ctx, a5, a6, 1, spy().draws);
  assert.equal(ram.u16(a6 + H.speedAt), 0, '$25D712 clr.w -- the borrow is caught, not left at $FFFF');
  assert.equal(ram.u16(a6 + H.doneAt), 1, 'and the done latch went up on the same frame');
});

test('W374 $25D72A exg normalises D0 to record 0 and D1 to record 1, whichever record runs',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, rom, ctx, a5 } = await fx();
    const { Ram } = await import('../src/ram.js');
    const rec0 = SCREEN17.recs;
    const rec1 = SCREEN17.recs + H.otherRec;

    // **W385 CHANGED HOW THIS IS OBSERVED, AND FOR THE BETTER.** The note `$2603FE` used to file
    // carried D0 and D1 in its prose, and this test pattern-matched that string. `$2603FE` is a
    // CALL now (`rank.js stagePair2603FE`), so the two registers are watched where the cartridge
    // actually puts them: `$260414 move.l D0,($10,A2)` and `$26041E move.l D1,($10,A3)`, the two
    // `$25FF7A` records at $8130FA and $81311E. That observes the value ARRIVING somewhere
    // instead of a string this port composed about it -- the same upgrade `w375state7callees`
    // made when `$260580` stopped being a note.
    const run = (a6, d7) => {
      const ram = new Ram();
      const notes = [];
      const c = { ...ctx, unported: { note: (addr, what) => notes.push({ addr, what }) } };
      ram.setU8(rec0 + H.liveAt, 1);
      ram.setU8(rec1 + H.liveAt, 1);
      ram.setU8(rec0 + H.rendezvousAt, H.rendezvous);
      ram.setU8(rec1 + H.rendezvousAt, H.rendezvous);
      ram.setU32(rec0 + H.anchorAt, 0x11110000);             // record 0's anchor
      ram.setU32(rec1 + H.anchorAt, 0x22220000);             // record 1's
      ram.setU16(a6 + H.frameAt, H.gateSlide);
      ram.setU16(a6 + H.travelAt, H.travelCap);
      ram.setU16(a6 + H.speedAt, 2);                         // one decel step and it is done
      frameStart(ram);
      assert.equal(ram.u16(H.pairLatch), 0, 'POSITIVE CONTROL: $812F80 starts clear');
      phase7_25D560(ram, rom, c, a5, a6, d7, spy().draws);
      assert.equal(ram.u16(H.pairLatch), 1, '$25D736 latched, so $25D73E jsr $2603FE fired');
      assert.deepEqual(notes.filter((x) => x.addr === H.pairSite), [],
        '...and it is a CALL now, so nothing is noted at $2603FE');
      return [ram.u32(0x8130fa + 0x10) >>> 0, ram.u32(0x81311e + 0x10) >>> 0];
    };

    const fromRec0 = run(rec0, 1);
    assert.equal(fromRec0[0], 0x11110000, 'run from record 0: D0 is record 0\'s anchor, no exg');
    assert.equal(fromRec0[1], 0x22220000, '  ...and D1 is record 1\'s');
    const fromRec1 = run(rec1, 0);
    assert.equal(fromRec1[0], 0x11110000,
      'run from record 1: the exg puts record 0\'s anchor back in D0');
    assert.equal(fromRec1[1], 0x22220000, '  ...and record 1\'s in D1');
    assert.deepEqual(fromRec1, fromRec0,
      'which is the whole claim: the pair is NORMALISED, so which record runs cannot be seen '
      + 'downstream of $25D72A');
  });

// ---------------------------------------------------------------------------------------------
// 7. THE ZOOM CURSOR
// ---------------------------------------------------------------------------------------------

test('W374 the zoom cursor steps IMMEDIATELY and then every THREE frames, and caps at $3C',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    // $25C922 move.w #$2,($6A,A0) is ONE word over TWO byte fields: ($6A) = 0 and ($6B) = 2.
    ram.setU8(a6 + H.tickAt, 0);
    ram.setU8(a6 + H.reloadAt, 2);
    ram.setU16(a6 + H.delayAt, 0);                           // the $140 delay already spent
    const s = spy();
    // ($32,A6) is pinned to 0 so it lands on 1: past $25D784's gate and short of the other two.
    const step = () => {
      ram.setU16(a6 + H.frameAt, 0);
      frameStart(ram);
      phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);
      return ram.u16(a6 + H.cursorAt);
    };

    assert.equal(step(), H.cursorStep, 'subq.b #1 on a ZERO tick borrows, so step ONE is immediate');
    assert.equal(ram.u8(a6 + H.tickAt), 2, '  ...and $25D7A6 reloaded from ($6B,A6)');
    assert.equal(step(), H.cursorStep, 'frame 2: no step');
    assert.equal(step(), H.cursorStep, 'frame 3: no step');
    assert.equal(step(), H.cursorStep * 2, 'frame 4: step TWO -- a three-frame period');
    for (let i = 0; i < 3; i++) step();
    assert.equal(ram.u16(a6 + H.cursorAt), H.cursorStep * 3, 'and three more frames is step THREE');

    // The cap. $25D7AC cmpi.w #$3C / beq -- an EQUALITY test, and the cursor only ever arrives on
    // multiples of 4, so $3C is where it parks.
    while (ram.u16(a6 + H.cursorAt) < H.cursorCap) step();
    assert.equal(ram.u16(a6 + H.cursorAt), H.cursorCap);
    for (let i = 0; i < 12; i++) step();
    assert.equal(ram.u16(a6 + H.cursorAt), H.cursorCap, '$3C is the cap and it stays there');
  });

test('W374 the $140 delay runs FIRST: the full ramp is 320 + 3 * 14 = 362 frames of state 7',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    // Exactly what state 0 seeds at $25CCAC and $25CCB2.
    ram.setU16(a6 + 0x6a, 2);                                // ($6A) = 0, ($6B) = 2 as ONE word
    ram.setU16(a6 + H.delayAt, 0x140);
    const s = spy();
    const step = () => {
      ram.setU16(a6 + H.frameAt, 0);
      frameStart(ram);
      phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);
    };

    assert.equal(ram.u8(a6 + H.tickAt), 0, 'the word write left ($6A,A6) at ZERO');
    assert.equal(ram.u8(a6 + H.reloadAt), 2, '  ...and ($6B,A6) at TWO');

    for (let i = 1; i < 0x140; i++) {
      step();
      assert.equal(ram.u16(a6 + H.cursorAt), 0, `frame ${i}: still inside the $140 delay`);
    }
    step();                                                  // frame 320: the delay hits zero AND
    assert.equal(ram.u16(a6 + H.delayAt), 0, 'the delay is spent');
    assert.equal(ram.u16(a6 + H.cursorAt), H.cursorStep,
      '$25D79A bne falls THROUGH on the frame the delay reaches zero, so step one is that frame');

    let n = 0x140;
    while (ram.u16(a6 + H.cursorAt) < H.cursorCap) { step(); n++; }
    assert.equal(n, 0x140 + 3 * 14, '320 + 3 * 14 = 362 frames for the fifteen-step ramp');
    assert.equal(n, 362);
  });

// ---------------------------------------------------------------------------------------------
// 8 AND 9. THE $25D85C WALK
// ---------------------------------------------------------------------------------------------

test('W374 the $25D85C table is 122 entries plus the $FFFF sentinel, 246 bytes', { skip: SKIP },
  async () => {
    const { HANDLER7: H, rom } = await fx();
    assert.equal(H.stepTable, 0x25d85c);
    assert.equal(H.stepBytes, H.stepEntries * 2 + 2, '122 words plus the sentinel word');
    assert.equal(H.stepBytes, 246);
    // $25D7CE lea ($8C,PC),A1 -- the extension word at $25D7D0 resolves the base.
    assert.equal(rom.u16(0x25d7ce), 0x43fa, '$25D7CE lea (d16,PC),A1');
    assert.equal(0x25d7d0 + rom.u16(0x25d7d0), H.stepTable, '  ...$25D7D0 + $8C -> $25D85C');
    assert.equal(rom.u16(0x25d7d2), 0x4e71, '$25D7D2 nop');
    // The sentinel is the LAST word of the window, because $25D7DC reads it before $25D7E0 knows
    // what it is.
    assert.equal(rom.u16(H.stepTable + H.stepBytes - 2), H.stepSentinel, '$25D950 is $FFFF');
    for (let i = 0; i < H.stepEntries; i++) {
      const v = rom.u16(H.stepTable + i * 2);
      assert.notEqual(v, H.stepSentinel, `entry ${i} is not an early sentinel`);
      assert.ok([0x0000, 0x0020, 0x0040, 0x0080, 0x00c0, 0x0100].includes(v),
        `entry ${i} is $${v.toString(16)}, one of the six ramp values`);
    }
    assert.equal(rom.u16(H.stepTable + H.stepBytes - 4), 0x0100, 'the last real entry is $0100');
  });

test('W374 the $25D85C walk SATURATES on the sentinel and re-reads the last real entry forever',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    const s = spy();
    const step = () => {
      ram.setU16(a6 + H.frameAt, H.gateSlide);
      frameStart(ram);
      phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);
    };

    // Park the cursor one entry short of the sentinel: the LAST real read.
    const sentinelAt = H.stepBytes - 2;                      // $F4 = 244
    ram.setU16(a6 + H.stepCursorAt, sentinelAt - 2);
    step();
    assert.equal(ram.u16(a6 + H.stepCursorAt), sentinelAt, 'the cursor advanced onto the sentinel');
    assert.equal(ram.u16(a6 + H.stepIntoAt), 0x0100, 'and took the last real entry, $0100');

    // Every later frame reads $FFFF, puts the cursor BACK, and re-reads offset 242.
    for (let i = 2; i <= 6; i++) {
      step();
      assert.equal(ram.u16(a6 + H.stepCursorAt), sentinelAt,
        `frame ${i}: $25D7E6 subq.w #2 undid the addq -- the cursor is PARKED`);
      assert.equal(ram.u16(a6 + H.stepIntoAt), 0x0100 * i,
        `  ...and ($4E,A6) still climbs by $100, from offset ${sentinelAt - 2}`);
    }
  });

test('W374 ($50,A6) gets exactly HALF of what ($4E,A6) gets, by an ARITHMETIC shift',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    const s = spy();
    const step = () => {
      ram.setU16(a6 + H.frameAt, H.gateSlide);
      frameStart(ram);
      phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);
    };

    // Walk the first eight entries and check the two accumulators against the table each frame.
    let into = 0;
    let half = 0;
    for (let i = 0; i < 8; i++) {
      const v = rom.u16(H.stepTable + i * 2);
      step();
      into += v;
      half += v >> 1;
      assert.equal(ram.u16(a6 + H.stepIntoAt), into, `entry ${i}: ($4E,A6) took $${v.toString(16)}`);
      assert.equal(ram.u16(a6 + H.halfIntoAt), half, `  ...and ($50,A6) took half of it`);
    }
    assert.ok(into > 0, 'the walk actually moved something');

    // The ceilings are independent: $3800 stops ($4E,A6) and $1C00 stops ($50,A6), and $1C00 is
    // exactly half of $3800, which is why the pair tops out together.
    assert.equal(H.halfCeil * 2, H.stepCeil);
    ram.setU16(a6 + H.stepIntoAt, H.stepCeil);
    ram.setU16(a6 + H.halfIntoAt, H.halfCeil);
    const cursor = ram.u16(a6 + H.stepCursorAt);
    step();
    assert.equal(ram.u16(a6 + H.stepCursorAt), cursor, 'at the ceiling the cursor stops advancing');
    assert.equal(ram.u16(a6 + H.stepIntoAt), H.stepCeil);
    assert.equal(ram.u16(a6 + H.halfIntoAt), H.halfCeil);
  });

// ---------------------------------------------------------------------------------------------
// 10. THE THREE ONCE-ONLY LATCHES
// ---------------------------------------------------------------------------------------------

test('W374 the three once-only latches each fire ONCE: ($5E,A6), $812F82 and $812F80',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, notes, sounds, a5 } = await fx();
    const { announceBox260A20 } = await import('../src/rank.js');
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    const s = spy();
    const step = () => { frameStart(ram); phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws); };

    // ($5E,A6) at $25D592/$25D59A. D7 = 1 is side 0, inverted to side 1.
    step();
    assert.equal(ram.u16(a6 + H.announceLatch), 1, '($5E,A6) latched');
    assert.equal(ram.u16(announceBox260A20(1)), 1, 'and side 1 was announced');
    ram.setU16(announceBox260A20(1), 0);                     // clear the mailbox and go again
    ram.setU16(announceBox260A20(1) + 2, 0);
    for (let i = 0; i < 5; i++) step();
    assert.equal(ram.u16(announceBox260A20(1)), 0, '($5E,A6) kept the announce from re-posting');

    // $812F82 at $25D5B0/$25D5BA -- and it is per SCREEN, not per record.
    assert.equal(ram.u16(H.soundLatch), 1);
    assert.deepEqual(sounds, [H.sound], '$28CB9C posted exactly once across six frames');

    // $812F80 at $25D72C/$25D736. Drive the record to the one frame that reaches it.
    //
    // **W385 CHANGED THE WITNESS.** `$2603FE` was a counted note and this counted it; it is a
    // call now, so what is watched is the RAM it writes -- `$260414 move.l D0,($10,A2)`. The
    // record's ($56) anchor is 0 in this fixture, and `$26040E tst.l / bmi` stores a zero D0
    // happily, so a distinctive anchor is planted first and the store is what is observed.
    const POS0 = 0x8130fa + 0x10;                            // ($10,$8130FA), tally.js argA/argB
    notes.length = 0;
    ram.setU32(SCREEN17.recs + H.anchorAt, 0x33330000);      // a value nothing else can produce
    ram.setU32(POS0, 0);
    ram.setU16(a6 + H.frameAt, H.gateSlide);
    ram.setU16(a6 + H.travelAt, H.travelCap);
    ram.setU16(a6 + H.speedAt, 2);
    ram.setU16(a6 + H.doneAt, 0);
    step();
    assert.equal(ram.u16(H.pairLatch), 1, '$812F80 latched');
    assert.equal(ram.u32(POS0) >>> 0, 0x33330000, '$2603FE ran once and stored D0 through A2');
    assert.deepEqual(notesAt(notes, H.pairSite), [],
      '...and it is a CALL now, so nothing is noted at $2603FE');

    // ...and with the latch already up it does not run at all.
    notes.length = 0;
    ram.setU32(POS0, 0);                                     // wipe the witness
    ram.setU16(a6 + H.frameAt, H.gateSlide);
    ram.setU16(a6 + H.travelAt, H.travelCap);
    ram.setU16(a6 + H.speedAt, 2);
    ram.setU16(a6 + H.doneAt, 0);
    step();
    assert.equal(ram.u32(POS0) >>> 0, 0,
      '$2603FE did NOT run a second time -- the witness stayed wiped');
  });

// ---------------------------------------------------------------------------------------------
// THE SIGNED COMPARE AT $25D774, AND THE TWO-ARMED FUSE AT $25D686
// ---------------------------------------------------------------------------------------------

test('W374 $25D774 is a SIGNED blt: a wrapped ($62,A6) is NOT clamped', { skip: SKIP },
  async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    const s = spy();
    const step = () => {
      ram.setU16(a6 + H.frameAt, H.gateRamp);
      frameStart(ram);
      phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws);
    };

    // Overshooting the cap from below clamps.
    ram.setU16(a6 + H.tiltAt, H.tiltCap - 0x40);
    step();
    assert.equal(ram.u16(a6 + H.tiltAt), H.tiltCap, '$25D77E clamped $25C0 + $80 to $2600');
    step();
    assert.equal(ram.u16(a6 + H.tiltAt), H.tiltCap, '$25D764 beq then skips the block entirely');

    // A value whose sum lands in the NEGATIVE half. Unsigned, $8020 >= $2600 and this would clamp;
    // signed, -$7FE0 is below $2600 and it does not. Forced -- the cartridge cannot get here.
    ram.setU16(a6 + H.tiltAt, 0x7fa0);
    step();
    assert.equal(ram.u16(a6 + H.tiltAt), 0x8020,
      '$25D77C blt is SIGNED, so a wrapped value is left alone rather than clamped to $2600');
    assert.equal(ram.u16(a6 + H.tiltClearAt), 0, '$25D75E clears ($64,A6) every frame it runs');
  });

test('W374 $25D686 fuse: reaching zero and UNDERSHOOTING zero are one arm', { skip: SKIP },
  async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    const s = spy();
    const step = () => { frameStart(ram); phase7_25D560(ram, rom, ctx, a5, a6, 1, s.draws); };

    // Exactly $26 -> the subtraction lands on zero -> $25D696.
    ram.setU16(a6 + H.fuseAt, H.fuseStep);
    ram.setU16(a6 + H.flashAt, 0);
    step();
    assert.equal(ram.u16(a6 + H.fuseAt), 0, 'the fuse was cleared');
    assert.equal(ram.u16(a6 + H.flashAt), H.flashReload, '$25D696 reloaded the flash with 3');

    // Less than $26 -> a BORROW -> the same arm, not a wrapped $FFxx left standing.
    ram.setU16(a6 + H.fuseAt, 1);
    ram.setU16(a6 + H.flashAt, 0);
    step();
    assert.equal(ram.u16(a6 + H.fuseAt), 0, 'the borrow arm cleared it too');
    assert.equal(ram.u16(a6 + H.flashAt), H.flashReload);

    // More than $26 -> it just counts down and the flash is untouched.
    ram.setU16(a6 + H.fuseAt, 0x100);
    ram.setU16(a6 + H.flashAt, 0);
    step();
    assert.equal(ram.u16(a6 + H.fuseAt), 0x100 - H.fuseStep, 'no borrow: it just counts down');
    assert.equal(ram.u16(a6 + H.flashAt), 0, '  ...and the flash was not reloaded');
  });

// ---------------------------------------------------------------------------------------------
// 11. THE DRAW TAIL AGAINST THE REAL objslot9.js DRAWS
// ---------------------------------------------------------------------------------------------

test('W374 the $25D800 tail drives the REAL draws, and the bucket moves in whole 12-byte records',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, slot9, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, 6);                       // the rendezvous bail: tail only

    // The seven the tail calls really are exported by objslot9.js, and $25EDF8 -- which IS ported
    // and IS in that module -- is deliberately NOT among them.
    for (const e of (await import('../src/objslot17.js')).TAIL_25D560) {
      assert.equal(typeof slot9[e.fn], 'function', `objslot9.js exports ${e.fn}`);
    }
    assert.equal(typeof slot9.draw25EDF8, 'function', '$25EDF8 is ported...');
    assert.ok(!(await import('../src/objslot17.js')).TAIL_25D560.some((e) => e.fn === 'draw25EDF8'),
      '  ...and this tail does NOT call it, unlike confirmAndDraws two tails');

    ctx.selectDraws = slot9;                                 // the registry, supplied off ctx
    const before = bytesUsed(ram);
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1);                 // SIX arguments -- the family signature
    const delta = bytesUsed(ram) - before;
    assert.ok(delta > 0, 'the real draws emitted something');
    assert.equal(delta % REC, 0, `${delta} bytes is a whole multiple of ${REC}`);
  });

test('W374 the two bset gates: the FIRST record does the gated draws, the second does not',
  { skip: SKIP }, async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const rec0 = SCREEN17.recs;
    const rec1 = SCREEN17.recs + H.otherRec;
    ram.setU8(rec0 + H.rendezvousAt, 6);
    ram.setU8(rec1 + H.rendezvousAt, 6);
    ram.setU8(rec0 + H.liveAt, 1);
    ram.setU8(rec1 + H.liveAt, 1);

    const s = spy();
    frameStart(ram);                                         // ONE frame, BOTH records
    phase7_25D560(ram, rom, ctx, a5, rec0, 1, s.draws);
    const first = s.calls.length;
    phase7_25D560(ram, rom, ctx, a5, rec1, 0, s.draws);

    assert.deepEqual(s.names().slice(0, first), ORDER, 'record 0 did all seven');
    assert.deepEqual(s.names().slice(first),
      ['draw25E4D0', 'draw25E824', 'draw25EF30', 'draw25F074'],
      'record 1 skipped the three behind the two bsets and did the four ungated ones');
    assert.equal(ram.u8(a5 + SCREEN17.busy) & 0x03, 0x03, 'both gate bits are up');

    // ...and the dispatchers per-frame clr.b puts them back.
    frameStart(ram);
    const at = s.calls.length;
    phase7_25D560(ram, rom, ctx, a5, rec0, 1, s.draws);
    assert.deepEqual(s.names().slice(at), ORDER, 'a new frame opens both gates again');
  });

// ---------------------------------------------------------------------------------------------
// THE ROM'S OWN SHAPE
// ---------------------------------------------------------------------------------------------

test('W374 $25D560 is 732 bytes with ONE rts, and the tail is SEVEN jsrs in this order',
  { skip: SKIP }, async () => {
    const { HANDLER7: H, TAIL_25D560, rom } = await fx();
    assert.equal(H.rts + 2 - H.addr, H.bytes, '$25D560..$25D83B is 732 bytes');
    assert.equal(rom.u16(H.rts), 0x4e75, '$25D83A rts');
    // The ONLY rts in the extent.
    for (let a = H.addr; a < H.rts; a += 2) {
      assert.notEqual(rom.u16(a), 0x4e75, `$${a.toString(16).toUpperCase()} is not an early rts`);
    }
    // Every jsr from $25D800 to the rts, read straight out of the image.
    const jsrs = [];
    for (let a = H.drawTail; a < H.rts; a += 2) {
      if (rom.u16(a) === 0x4eb9) { jsrs.push({ at: a, addr: rom.u32(a + 2) }); a += 4; }
    }
    assert.equal(jsrs.length, 7, 'the tail is SEVEN calls, not eight');
    assert.deepEqual(jsrs.map((j) => j.addr), TAIL_25D560.map((e) => e.addr));
    assert.deepEqual(jsrs.map((j) => j.at), TAIL_25D560.map((e) => e.at));
    assert.ok(!jsrs.some((j) => j.addr === 0x25edf8), '$25EDF8 is NOT called from here');
  });

test('W374 the branch senses the port rests on, read out of the ROM', { skip: SKIP }, async () => {
  const { HANDLER7: H, rom } = await fx();
  // $25D588 cmpi.b #$7,($1,A0): opcode $0C28, IMMEDIATE word $0007, THEN displacement $0001.
  assert.equal(rom.u16(0x25d588), 0x0c28, '$25D588 cmpi.b #<imm>,(d16,A0)');
  assert.equal(rom.u16(0x25d58a), H.rendezvous, '  ...the immediate $0007 comes FIRST');
  assert.equal(rom.u16(0x25d58c), H.rendezvousAt, '  ...the displacement $0001 comes SECOND');
  assert.equal(rom.u16(0x25d58e), 0x6600, '$25D58E bne.w');
  assert.equal(0x25d590 + rom.u16(0x25d590), H.drawTail, '  ...straight to $25D800, the draw tail');

  // $25D748 / $25D74E write $8 into ($1,A6) and ($1,A0), and $25D754 is the NEXT instruction.
  assert.equal(rom.u32(0x25d748), 0x1d7c0008, '$25D748 move.b #$8,...');
  assert.equal(rom.u16(0x25d74c), 0x0001, '  ...($1,A6)');
  assert.equal(rom.u32(0x25d74e), 0x117c0008, '$25D74E move.b #$8,...');
  assert.equal(rom.u16(0x25d752), 0x0001, '  ...($1,A0) -- the OTHER record');
  assert.equal(rom.u16(0x25d754), 0x0c6e, '$25D754 cmpi.w -- NOT an rts: $25D748 FALLS THROUGH');

  // The gate senses. $25D6A0/$25D754/$25D784/$25D7BA are all bcs.w = unsigned <.
  for (const [at, imm] of [[0x25d6a0, H.gateSlide], [0x25d754, H.gateRamp],
    [0x25d784, H.gateZoom], [0x25d7ba, H.gateSlide]]) {
    assert.equal(rom.u16(at), 0x0c6e, `$${at.toString(16).toUpperCase()} cmpi.w #<imm>,(d16,A6)`);
    assert.equal(rom.u16(at + 2), imm, `  ...#$${imm.toString(16)}`);
    assert.equal(rom.u16(at + 4), H.frameAt, '  ...($32,A6)');
    assert.equal(rom.u16(at + 6), 0x6500, '  ...bcs.w -- an UNSIGNED less-than');
  }
  assert.equal(rom.u16(0x25d774), 0x0c6e, '$25D774 cmpi.w');
  assert.equal(rom.u16(0x25d776), H.tiltCap, '  ...#$2600');
  assert.equal(rom.u16(0x25d77a), 0x6d00, '  ...blt.w -- SIGNED, alone among these compares');

  // $25D79E subq.b, and $25D7A2 branches on the BORROW.
  assert.equal(rom.u16(0x25d79e), 0x532e, '$25D79E subq.b #1,(d16,A6)');
  assert.equal(rom.u16(0x25d7a0), H.tickAt, '  ...($6A,A6), a BYTE');
  assert.equal(rom.u16(0x25d7a2), 0x6400, '$25D7A2 bcc.w -- so the step needs the borrow');
  assert.equal(rom.u16(0x25d7a6), 0x1d6e, '$25D7A6 move.b (d16,A6),(d16,A6)');
  assert.equal(rom.u16(0x25d7a8), H.reloadAt, '  ...from ($6B,A6), the ADJACENT byte');
  assert.equal(rom.u16(0x25d7aa), H.tickAt, '  ...into ($6A,A6)');

  // $25D7FA asr.w #1,D0 -- an ARITHMETIC shift, and $25D7FC adds the SAME register.
  assert.equal(rom.u16(0x25d7fa), 0xe240, '$25D7FA asr.w #1,D0');
  assert.equal(rom.u16(0x25d7fc), 0xd16e, '$25D7FC add.w D0,(d16,A6)');
  assert.equal(rom.u16(0x25d7fe), H.halfIntoAt, '  ...($50,A6)');

  // The two bsets are on ($3,A5) and are SEPARATE, one bit each.
  assert.equal(rom.u32(0x25d800), 0x08ed0000, '$25D800 bset #$0,(d16,A5)');
  assert.equal(rom.u16(0x25d804), 0x0003, '  ...($3,A5)');
  assert.equal(rom.u32(0x25d81a), 0x08ed0001, '$25D81A bset #$1,(d16,A5)');
  assert.equal(rom.u16(0x25d81e), 0x0003, '  ...($3,A5) again');

  // The palette install: $2243F8, bank $1A, through $24150A which copies 64 bytes.
  assert.equal(rom.u16(0x25d63a), 0x41f9, '$25D63A lea <abs>,A0');
  assert.equal(rom.u32(0x25d63c), H.palSrc, '  ...$2243F8');
  assert.equal(rom.u16(0x25d640), 0x701a, '$25D640 moveq #$1A,D0');
  assert.equal(rom.u32(0x25d644), 0x0024150a, '$25D642 jsr $24150A');
});

// W375 EDITED THIS TEST. `H.handoff` ($26070C, 124 B) and `H.tailCall` ($25F456, 218 B) were in
// the list below and are now PORTED (`handoff26070C` / `playerRecords25F456` in objslot17.js), so
// they are no longer noted -- `w375state7callees.test.js` drives them instead, and asserts there
// that neither address is noted any more. What $26070C left behind, `$260580`, is checked there
// with its own extent. The two that remain unported here are $25F530 and $25FAA4.
test('W374 the four unported callees are noted with their exact extents', { skip: SKIP },
  async () => {
    const { phase7_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, notes, a5 } = await fx();
    const a6 = SCREEN17.recs;
    const a0 = a6 + H.otherRec;
    ram.setU8(a0 + H.liveAt, 1);
    ram.setU8(a0 + H.rendezvousAt, H.rendezvous);
    // Open the $25D630 bset block: ($48,A6) at or past $300 and ($46,A6) under $7000.
    ram.setU16(a6 + H.rampE.openAt, 0x0300);
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1, spy().draws);

    const texts = notes.map((n) => n.what);
    for (const [addr, size] of [[H.head, 80], [H.perFrame, 334]]) {
      const hit = notes.find((n) => n.addr === addr);
      assert.ok(hit, `$${addr.toString(16).toUpperCase()} was noted`);
      assert.match(hit.what, new RegExp(`${size} bytes`), `  ...with its ${size}-byte extent`);
    }
    assert.ok(texts.some((t) => t.includes('560-byte $25F592')), '$25F530s inner bsr is named');
    // $260A9A is NOT noted: rank.js announcePost owns that site.
    assert.deepEqual(notesAt(notes, H.announce), [], '$260A9A goes through rank.js, not a note');
  });

test('W374 the tail files a counted note per MISSING draw rather than silently skipping it',
  { skip: SKIP }, async () => {
    const { phase7_25D560, TAIL_25D560, HANDLER7: H, SCREEN17, ram, rom, ctx, notes,
      a5 } = await fx();
    const a6 = SCREEN17.recs;
    ram.setU8(a6 + H.otherRec + H.rendezvousAt, 6);
    frameStart(ram);
    phase7_25D560(ram, rom, ctx, a5, a6, 1);                 // no registry at all
    for (const e of TAIL_25D560) {
      assert.equal(notesAt(notes, e.addr).length, 1, `${e.fn} was noted, not silently dropped`);
    }
  });
