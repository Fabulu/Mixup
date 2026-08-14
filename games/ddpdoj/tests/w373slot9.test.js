// W373 -- object dispatch [9], $25CACA. Slot [17]'s twin, over the same records with eight states.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

async function fx() {
  const mod = await import('../src/objslot9.js');
  const s17 = await import('../src/objslot17.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram } = await import('../src/background.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n) };
  const notes = [];
  const ctx = { unported: { note: (a) => notes.push(a) }, unportedLog: { note: () => {} },
    tx: new TxVram(), soundPost: () => {} };
  return { ...mod, SCREEN17: s17.SCREEN17, ram: new Ram(), rom, ctx, notes, a5: 0x812c00 };
}

test('W373 slot [9] is $25CACA and slot [8] stages it', { skip: SKIP }, async () => {
  const { SCREEN9, rom } = await fx();
  assert.equal(rom.u32(SCREEN9.dispatch + 9 * 8), SCREEN9.entry);
  // The W373 chain scan found $25AC9C staging type $9.
  assert.equal(rom.u16(0x25ac9c), 0x4eb9, '$25AC9C is a jsr');
  assert.equal(rom.u32(0x25ac9e), 0x241182, '  ...to $241182, the create');
});

test('W373 it walks the SAME records as slot [17]', { skip: SKIP }, async () => {
  const { SCREEN17 } = await fx();
  const { SCREEN17: same } = await import('../src/objslot17.js');
  assert.equal(SCREEN17.recs, same.recs, 'same base');
  assert.equal(SCREEN17.recStride, 0x70);
  assert.equal(SCREEN17.recCount, 2);
});

test('W373 slot [9] has EIGHT states and slot [17] has four', { skip: SKIP }, async () => {
  const { SCREEN9, SCREEN17 } = await fx();
  assert.equal(SCREEN9.states.length, 8);
  assert.equal(SCREEN17.subStates.length, 4);
  // Slot [17]'s four are a SUBSET of slot [9]'s eight, which is why the handlers are shared.
  for (const p of SCREEN17.subStates) {
    assert.ok(SCREEN9.states.includes(p), `state ${p} is in both`);
  }
  // And the four slot [17] lacks are exactly the ones it overwrites or never reaches.
  assert.deepEqual(SCREEN9.states.filter((p) => !SCREEN17.subStates.includes(p)), [4, 0, 1, 2]);
});

test('W373 slot [9] LETS state 4 stand where slot [17] overwrites it', { skip: SKIP }, async () => {
  const { objSlot9, SCREEN9, SCREEN17, ram, rom, ctx, a5 } = await fx();
  const a6 = SCREEN17.recs;
  ram.setU8(a5 + SCREEN9.state, 1);
  ram.setU8(a6, 1);                                          // record 0 live
  ram.setU8(a6 + SCREEN17.phaseAt, 3);
  ram.setU8(a6 + SCREEN9.tailCount, 5);
  objSlot9(ram, rom, a5, ctx);
  // $25D306 sets 4. Slot [9] has a state-4 arm, so it does NOT overwrite -- and 4 is not one of
  // the ported three, so the walk stops there this frame.
  assert.equal(ram.u8(a6 + SCREEN17.phaseAt), 4,
    'slot [9] left the 4 that $25D306 wrote');

  const s17 = await import('../src/objslot17.js');
  const b = await fx();
  const b5 = 0x812800;
  b.ram.setU8(b5 + s17.SCREEN17.state, 1);                   // state 1, or state 0 would CLEAR the
  b.ram.setU8(a6, 1);                                        //   records and wipe the setup
  b.ram.setU8(a6 + SCREEN17.phaseAt, 3);
  b.ram.setU16(0x813098, 1);                                 // shut 5/6 so 3 is observable alone
  s17.objSlot17(b.ram, b.rom, b5, b.ctx);
  assert.equal(b.ram.u8(a6 + SCREEN17.phaseAt), s17.SCREEN17.firstSetsPhase,
    'slot [17] overwrote the same 4 with 5');
});

test('W373 the shared handlers really are shared', { skip: SKIP }, async () => {
  const { objSlot9, SCREEN9, SCREEN17, ram, rom, ctx, a5 } = await fx();
  const a6 = SCREEN17.recs;
  ram.setU8(a5 + SCREEN9.state, 1);
  ram.setU8(a6, 1);
  ram.setU8(a6 + SCREEN17.phaseAt, 6);                       // state 6 is ported
  ram.setU8(a6 + SCREEN9.tailCount, 5);
  objSlot9(ram, rom, a5, ctx);
  assert.equal(ram.u8(a6 + SCREEN17.phaseAt), 7,
    'slot [9] ran $25D4F0 through the same phase6_25D4F0 and advanced to 7');
});

test('W373 the $25CB5E tail is UNSIGNED >= 7, so state 7 skips it', { skip: SKIP }, async () => {
  const { objSlot9, SCREEN9, SCREEN17, ram, rom, ctx, a5 } = await fx();
  const a6 = SCREEN17.recs;
  ram.setU8(a5 + SCREEN9.state, 1);
  ram.setU8(a6, 1);
  ram.setU8(a6 + SCREEN17.phaseAt, 7);                       // exactly 7
  ram.setU8(a6 + SCREEN9.tailCount, 5);
  objSlot9(ram, rom, a5, ctx);
  assert.equal(ram.u8(a6 + SCREEN9.tailCount), 5, 'state 7 did NOT tick the tail counter');

  const b = await fx();
  b.ram.setU8(a5 + SCREEN9.state, 1);
  b.ram.setU8(a6, 1);
  b.ram.setU8(a6 + SCREEN17.phaseAt, 1);                     // below 7
  b.ram.setU8(a6 + SCREEN9.tailCount, 5);
  b.objSlot9(b.ram, b.rom, a5, b.ctx);
  assert.equal(b.ram.u8(a6 + SCREEN9.tailCount), 4, 'a state below 7 DOES tick it');
});

test('W373 the tail reloads to TWO and sets ($30,A6) when ($2E,A6) is clear',
  { skip: SKIP }, async () => {
    const { objSlot9, SCREEN9, SCREEN17, ram, rom, ctx, a5 } = await fx();
    const a6 = SCREEN17.recs;
    ram.setU8(a5 + SCREEN9.state, 1);
    ram.setU8(a6, 1);
    ram.setU8(a6 + SCREEN17.phaseAt, 1);
    ram.setU8(a6 + SCREEN9.tailCount, 1);                    // about to expire
    ram.setU8(a6 + SCREEN9.tailFlag, 0);
    objSlot9(ram, rom, a5, ctx);
    assert.equal(ram.u8(a6 + SCREEN9.tailCount), SCREEN9.tailReload, 'reloaded to 2');
    assert.equal(ram.u8(a6 + SCREEN9.tailSet), 1, 'and ($30,A6) was set');
  });

test('W373 an empty record is skipped entirely', { skip: SKIP }, async () => {
  const { objSlot9, SCREEN9, SCREEN17, ram, rom, ctx, notes, a5 } = await fx();
  const a6 = SCREEN17.recs;
  ram.setU8(a5 + SCREEN9.state, 1);
  ram.setU8(a6, 0);                                          // record 0 empty
  ram.setU8(a6 + SCREEN17.phaseAt, 3);
  ram.setU8(a6 + SCREEN9.tailCount, 5);
  objSlot9(ram, rom, a5, ctx);
  assert.equal(ram.u8(a6 + SCREEN17.phaseAt), 3, 'nothing ran');
  assert.equal(ram.u8(a6 + SCREEN9.tailCount), 5, 'and the tail did not tick either');
});

test('W373 state 2 is one instruction: a tail kill', { skip: SKIP }, async () => {
  const { objSlot9, SCREEN9, ram, rom, ctx, a5 } = await fx();
  ram.setU8(a5 + SCREEN9.state, 2);
  ram.setU16(a5 + 0x00, 0x80);
  objSlot9(ram, rom, a5, ctx);                               // must not throw
  assert.equal(rom.u32(0x25cac2), 0x4ef90024, '$25CAC2 opens JMP abs.l');
});

test('W373 $25D164 CLOSES THE LOOP -- it sets the record back to state 3', { skip: SKIP }, async () => {
  const { phase2_25D164, HANDLER2, SCREEN17, ram, rom, ctx } = await fx();
  const a5 = 0x812c00;
  const a6 = SCREEN17.recs;
  ram.setU8(a6 + SCREEN17.phaseAt, 2);
  phase2_25D164(ram, rom, ctx, a5, a6, 1, undefined);
  assert.equal(ram.u8(a6 + SCREEN17.phaseAt), HANDLER2.nextPhase,
    'state 2 goes back to 3, so a record CYCLES rather than running to an end');
});

test('W373 $25D164 writes the THIRD pair, completing the six bytes', { skip: SKIP }, async () => {
  const { phase2_25D164, HANDLER2, SCREEN17, ram, rom, ctx } = await fx();
  const a5 = 0x812c00;
  const a6 = SCREEN17.recs;
  for (let i = 4; i <= 9; i++) ram.setU8(a5 + i, 0xff);
  ram.setU8(a6 + 0x03, 1);                                   // index 1
  phase2_25D164(ram, rom, ctx, a5, a6, 1, undefined);        // D7 = 1 -> side 0
  assert.equal(ram.u8(a5 + 0x08), rom.u16(HANDLER2.table + 2) & 0xff, 'side 0 -> ($8,A5)');
  assert.equal(ram.u8(a5 + 0x09), 0xff, 'side 1 untouched');

  const b = await fx();
  for (let i = 4; i <= 9; i++) b.ram.setU8(a5 + i, 0xff);
  b.ram.setU8(a6 + 0x03, 1);
  b.phase2_25D164(b.ram, b.rom, b.ctx, a5, a6, 0, undefined);   // ctx is the THIRD arg
  assert.equal(b.ram.u8(a5 + 0x09), rom.u16(HANDLER2.table + 2) & 0xff, 'side 1 -> ($9,A5)');
  assert.equal(b.ram.u8(a5 + 0x08), 0xff, 'side 0 untouched');
});

test('W373 the six per-side bytes are covered by THREE handlers, one pair each',
  { skip: SKIP }, async () => {
    // $25D39C -> $4/$5, $25D306 -> $6/$7, $25D164 -> $8/$9. Every one selects by D7, and together
    // they account for all six bytes slot [17] state 0 fills with $FF.
    const { SCREEN17 } = await fx();
    assert.equal(SCREEN17.slotCount, 6);
    assert.equal(SCREEN17.slots, 0x04, 'the six run $4..$9');
  });

test('W373 $25D402 SKIPS the other side\'s choice rather than being blocked by it',
  { skip: SKIP }, async () => {
    const { phase4_25D402, HANDLER4, SCREEN17, ram, rom, ctx } = await fx();
    const a5 = 0x812c00;
    const a6 = SCREEN17.recs;
    const P1EDGE = 0x803972;
    ram.setU8(a5 + 0x07, 1);                                 // side 1 is sitting on option 1
    ram.setU16(a6 + 0x04, 0);                                // side 0 is on 0
    ram.setU16(P1EDGE, 1 << HANDLER4.bitNext);               // step FORWARD
    phase4_25D402(ram, rom, ctx, a5, a6, 1);
    // Plain +1 mod 3 would land on 1, which side 1 holds. The loop goes round again to 2.
    assert.equal(ram.u16(a6 + 0x04), 2, 'it stepped over option 1 to option 2');
  });

test('W373 $25D402 wraps in BOTH directions across three options', { skip: SKIP }, async () => {
  const { phase4_25D402, HANDLER4, SCREEN17, rom } = await fx();
  const P1EDGE = 0x803972;
  const a5 = 0x812c00;
  const a6 = SCREEN17.recs;

  const run = async (from, bit) => {
    const f = await fx();
    f.ram.setU8(a5 + 0x07, 0xff);                            // other side nowhere, so no skipping
    f.ram.setU16(a6 + 0x04, from);
    f.ram.setU16(P1EDGE, 1 << bit);
    f.phase4_25D402(f.ram, f.rom, f.ctx, a5, a6, 1);
    return f.ram.u16(a6 + 0x04);
  };
  assert.equal(await run(0, HANDLER4.bitPrev), 2, '0 steps back to 2');
  assert.equal(await run(2, HANDLER4.bitNext), 0, '2 steps forward to 0');
  assert.equal(await run(1, HANDLER4.bitPrev), 0, '1 back to 0');
  assert.equal(await run(1, HANDLER4.bitNext), 2, '1 forward to 2');
});

test('W373 $25D402 confirms on a BUTTON or on ($30,A6), two separate conditions',
  { skip: SKIP }, async () => {
    const P1EDGE = 0x803972;
    const a5 = 0x812c00;

    const idle = await fx();
    const a6 = idle.SCREEN17.recs;
    idle.ram.setU8(a5 + 0x07, 0xff);
    idle.ram.setU8(a6 + idle.SCREEN17.phaseAt, 4);
    idle.phase4_25D402(idle.ram, idle.rom, idle.ctx, a5, a6, 1);
    assert.equal(idle.ram.u8(a6 + idle.SCREEN17.phaseAt), 4, 'no button, no timer: it stays');

    const btn = await fx();
    btn.ram.setU8(a5 + 0x07, 0xff);
    btn.ram.setU8(a6 + btn.SCREEN17.phaseAt, 4);
    btn.ram.setU16(P1EDGE, 0x10);                            // inside the $70 mask
    btn.phase4_25D402(btn.ram, btn.rom, btn.ctx, a5, a6, 1);
    assert.equal(btn.ram.u8(a6 + btn.SCREEN17.phaseAt), btn.HANDLER4.nextPhase, 'a button confirms');

    const timer = await fx();
    timer.ram.setU8(a5 + 0x07, 0xff);
    timer.ram.setU8(a6 + timer.SCREEN17.phaseAt, 4);
    timer.ram.setU8(a6 + timer.HANDLER4.autoConfirm, 1);     // ($30,A6), set by the dispatcher tail
    timer.phase4_25D402(timer.ram, timer.rom, timer.ctx, a5, a6, 1);
    assert.equal(timer.ram.u8(a6 + timer.SCREEN17.phaseAt), timer.HANDLER4.nextPhase,
      '($30,A6) confirms with NO button at all');
  });

test('W373 the shared draws run ONCE across both records', { skip: SKIP }, async () => {
  const { phase4_25D402, HANDLER4, SCREEN17, ram, rom, ctx, notes } = await fx();
  const a5 = 0x812c00;
  const P1EDGE = 0x803972;
  ram.setU8(a5 + 0x06, 0xff);
  ram.setU8(a5 + 0x07, 0xff);
  ram.setU16(P1EDGE, 0x10);                                  // confirm both

  phase4_25D402(ram, rom, ctx, a5, SCREEN17.recs, 1);        // record 0
  const first = notes.filter((n) => HANDLER4.drawsA.includes(n)).length;
  notes.length = 0;
  phase4_25D402(ram, rom, ctx, a5, SCREEN17.recs + SCREEN17.recStride, 0);   // record 1
  const second = notes.filter((n) => HANDLER4.drawsA.includes(n)).length;

  assert.equal(first, HANDLER4.drawsA.length, 'the first record did the gated draws');
  assert.equal(second, 0, 'the second saw the bit already set and skipped them');

  // And clearing ($3,A5) -- which the walk does every frame -- re-arms them.
  ram.setU8(a5 + HANDLER4.sharedGuard, 0);
  notes.length = 0;
  phase4_25D402(ram, rom, ctx, a5, SCREEN17.recs, 1);
  assert.equal(notes.filter((n) => HANDLER4.drawsA.includes(n)).length, HANDLER4.drawsA.length,
    'clearing the guard re-arms them for the next frame');
});

test('W373 $25D1DA is a SECOND cursor: two options, no exclusion, conditional sound',
  { skip: SKIP }, async () => {
    const P1EDGE = 0x803972;
    const a5 = 0x812c00;

    // Two options, and they wrap. There is no (A3) compare at all, so the other side is irrelevant.
    const fwd = await fx();
    const a6 = fwd.SCREEN17.recs;
    fwd.ram.setU8(a5 + 0x07, 1);                             // other side on 1 -- must NOT matter
    fwd.ram.setU16(a6 + fwd.HANDLER1.at, 1);
    fwd.ram.setU16(P1EDGE, 1 << fwd.HANDLER4.bitNext);
    fwd.phase1_25D1DA(fwd.ram, fwd.rom, fwd.ctx, a5, a6, 1);
    assert.equal(fwd.ram.u16(a6 + fwd.HANDLER1.at), 0, '1 wraps forward to 0, not to 2');

    const back = await fx();
    back.ram.setU16(a6 + back.HANDLER1.at, 0);
    back.ram.setU16(P1EDGE, 1 << back.HANDLER4.bitPrev);
    back.phase1_25D1DA(back.ram, back.rom, back.ctx, a5, a6, 1);
    assert.equal(back.ram.u16(a6 + back.HANDLER1.at), 1, '0 wraps back to 1');
  });

test('W373 $25D1DA posts its move sound only on a real CHANGE', { skip: SKIP }, async () => {
  const P1EDGE = 0x803972;
  const a5 = 0x812c00;
  const f = await fx();
  const a6 = f.SCREEN17.recs;
  const sounds = [];
  f.ctx.soundPost = (x) => sounds.push(x);
  f.ram.setU16(a6 + f.HANDLER1.at, 0);
  f.ram.setU16(P1EDGE, 1 << f.HANDLER4.bitNext);
  f.phase1_25D1DA(f.ram, f.rom, f.ctx, a5, a6, 1);
  assert.ok(sounds.includes(f.HANDLER4.moveSound), '0 -> 1 changed, so it sounded');

  // Pressing BOTH directions on one frame returns to where it started, and state 4 would still
  // have sounded twice. This one saves the value and compares, so the second step is silent.
  const g = await fx();
  const s2 = [];
  g.ctx.soundPost = (x) => s2.push(x);
  g.ram.setU16(a6 + g.HANDLER1.at, 0);
  g.ram.setU16(P1EDGE, (1 << g.HANDLER4.bitPrev) | (1 << g.HANDLER4.bitNext));
  g.phase1_25D1DA(g.ram, g.rom, g.ctx, a5, a6, 1);
  assert.equal(s2.filter((x) => x === g.HANDLER4.moveSound).length, 2,
    'both steps changed the value, so both sounded');
});

test('W373 state 1 and state 4 share one confirm-and-draw tail', { skip: SKIP }, async () => {
  const P1EDGE = 0x803972;
  const a5 = 0x812c00;
  const one = await fx();
  const a6 = one.SCREEN17.recs;
  one.ram.setU8(a5 + 0x07, 0xff);
  one.ram.setU8(a6 + one.SCREEN17.phaseAt, 1);
  one.ram.setU16(P1EDGE, 0x10);
  one.phase1_25D1DA(one.ram, one.rom, one.ctx, a5, a6, 1);
  assert.equal(one.ram.u8(a6 + one.SCREEN17.phaseAt), one.HANDLER1.nextPhase,
    'state 1 confirms to 2');

  const four = await fx();
  four.ram.setU8(a5 + 0x07, 0xff);
  four.ram.setU8(a6 + four.SCREEN17.phaseAt, 4);
  four.ram.setU16(P1EDGE, 0x10);
  four.phase4_25D402(four.ram, four.rom, four.ctx, a5, a6, 1);
  assert.equal(four.ram.u8(a6 + four.SCREEN17.phaseAt), four.HANDLER4.nextPhase,
    'and state 4 confirms to 5 -- the same tail, a different next state');
  assert.notEqual(one.HANDLER1.nextPhase, four.HANDLER4.nextPhase);
});
