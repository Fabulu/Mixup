// W375 -- object dispatch [8], $25A770, driven. The attract-mode sequencer and the boot-to-play
// gate: a fifteen-entry unbounded jump table on $812E56, a coin check ahead of it, and $25ACAC,
// which is the only routine in the front end that reaches gameplay.
//
// Every ROM claim here is decoded from the raw image rather than restated from a brief; the jump
// table test in particular reads all fifteen `bra.w` displacements and recomputes the targets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

async function fx({ dip = 0x00, dipCredit = 0x00 } = {}) {
  const mod = await import('../src/objslot8.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram } = await import('../src/background.js');
  const alloc = await import('../src/objalloc.js');
  const IMG = readFileSync(ROM);
  const rom = {
    u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    // W375b: `loadAnimObjects246410` reads the current-offset word SIGNED (`rom.i16`), so the
    // fixture has to carry it too. `RomWindows#i16` is the same widening.
    i16: (a) => IMG.readInt16BE(a),
    bytes: (a, n) => IMG.subarray(a, a + n),
  };
  const ram = new Ram();
  const notes = [];
  const cues = [];
  const clears = [];
  const ctx = {
    tx: new TxVram(),
    unported: { note: (a, w) => notes.push([a, w]) },
    unportedLog: { note: () => {} },
    soundPost: (a) => { cues.push(a); return true; },
    clear24631C: () => clears.push(0x24631c),
    // no `palette` and no `slotTable`: both are gaps Game#ctx() really has, and the port has
    // to keep counting them rather than throwing.
  };
  const a5 = 0x812600;
  ram.setU8(mod.SCREEN8.dip, dip);
  ram.setU8(mod.SCREEN8.dipCredit, dipCredit);
  return { ...mod, alloc, ram, rom, ctx, notes, cues, clears, a5, IMG };
}

const noteAddrs = (notes) => notes.map(([a]) => a);

/** W376. `$259FF8` and `$23CFDE` used to be `note()` deferrals, and three tests below used the
 *  note as their probe for "the tail called it". Both are ported now (`src/fronttext.js`), so
 *  the probe is the thing they actually do: cells in the `$904000` tilemap. Counting cells is
 *  also a STRICTLY STRONGER assertion -- a note only proved the call was reached. */
const txCells = (tx) => {
  let n = 0;
  for (let i = 0; i < 64 * 32; i++) if (tx.long(0x904000 + i * 4) !== 0) n++;
  return n;
};

/** A live record in object-table slot 0, in the three fields `$24107C` actually clears:
 *  `(A0)` and `($4A,A0)` are WORDS and `($4C,A0)` is a LONG. It does NOT wipe the record, so
 *  asserting a longword at `$80E240` would fail against a correct port. */
function liveObject(ram) {
  ram.setU16(0x80e240 + 0x00, 0x8005);
  ram.setU16(0x80e240 + 0x4a, 0x001c);
  ram.setU32(0x80e240 + 0x4c, 0xdeadbeef);
}
function objectTableWiped(ram) {
  return ram.u16(0x80e240) === 0 && ram.u16(0x80e240 + 0x4a) === 0
    && ram.u32(0x80e240 + 0x4c) === 0;
}

// ---------------------------------------------------------------------------------------------

test('W375 slot [8] is $25A770 at priority $000A in the dispatch table', { skip: SKIP }, async () => {
  const { SCREEN8, rom } = await fx();
  assert.equal(rom.u32(SCREEN8.dispatch + 8 * 8), SCREEN8.entry);
  assert.equal(rom.u16(SCREEN8.dispatch + 8 * 8 + 4), 0x000a);
  // Its child is slot [9], and that one carries $000A too -- so "the priority came from the
  // table" is only provable against a type whose priority is not shared with the parent by
  // accident. $25A9CA restages type 8, so both are checked.
  assert.equal(rom.u32(SCREEN8.dispatch + 9 * 8), 0x25caca, 'type 9 is slot [9], $25CACA');
  assert.equal(rom.u16(SCREEN8.dispatch + 9 * 8 + 4), 0x000a);
});

test('W375 the jump table at $25A872 has fifteen bra.w entries and no bound', { skip: SKIP }, async () => {
  const { SCREEN8, ARM_TARGETS, IMG } = await fx();
  for (let st = 0; st < 15; st++) {
    const e = SCREEN8.table + st * 4;
    assert.equal(IMG.readUInt16BE(e), 0x6000, `entry ${st} is bra.w`);
    // EA = the EXTENSION WORD's address + disp, which is entry + 2, not entry + 4.
    const target = e + 2 + IMG.readUInt16BE(e + 2);
    assert.equal(target, ARM_TARGETS[st],
      `state ${st} -> $${target.toString(16).toUpperCase()}`);
  }
  // The table ENDS where arm 0's body begins, which is the only thing that states fifteen.
  assert.equal(SCREEN8.table + 15 * 4, ARM_TARGETS[0], 'the 16th entry would be $25A8AE itself');
  assert.equal(IMG.readUInt16BE(ARM_TARGETS[0]), 0x1b7c, '$25A8AE is move.b #imm,(d16,A5)');
  // States 7 and 8 really do share ONE rts, and 4/6/10/11 are each their own.
  assert.equal(ARM_TARGETS[7], ARM_TARGETS[8], '7 and 8 point at the same instruction');
  for (const st of [4, 6, 7, 8, 10, 11]) {
    assert.equal(IMG.readUInt16BE(ARM_TARGETS[st]), 0x4e75, `state ${st} is a bare rts`);
  }
  // And there is no cmpi/andi between the state load and the jmp: $25A862..$25A86F is
  // move.w abs.l,D0 / add.w D0,D0 / add.w D0,D0 / jmp ($4,PC,D0.w).
  assert.equal(IMG.readUInt16BE(0x25a868), 0xd040, '$25A868 add.w D0,D0');
  assert.equal(IMG.readUInt16BE(0x25a86a), 0xd040, '$25A86A add.w D0,D0 -- times four');
  assert.equal(IMG.readUInt16BE(0x25a86c), 0x4efb, '$25A86C jmp (d8,PC,Xn)');
  assert.equal(IMG.readUInt16BE(0x25a86e), 0x0004, '  ...D0.w with disp $4');
});

// ------------------------------------------------------------------ 1. the boot entry

test('W375 the first frame runs arm 0, which reads ($4,A5) as the initial state', { skip: SKIP }, async () => {
  const { objSlot8, SCREEN8, ram, rom, ctx, a5, notes } = await fx();
  // What reset stages: ($2,A5) zero and ($4,A5) = $D, the warning screen.
  ram.setU16(a5 + SCREEN8.param, 0x000d);
  ram.setU16(SCREEN8.state, 0x1234);          // whatever was there before is overwritten
  ram.setU8(a5 + SCREEN8.inited, 1);          // and $25A764's clr.b re-arms the next arm
  ram.setU8(SCREEN8.joinMask, 0xff);
  ram.setU16(SCREEN8.blink, 0x4444);

  objSlot8(ram, rom, a5, ctx);

  assert.equal(ram.u16(SCREEN8.state), 0x000d, '$812E56 := 13');
  assert.equal(ram.u8(a5 + SCREEN8.constructed), 1, '($2,A5) latched');
  assert.equal(ram.u8(a5 + SCREEN8.inited), 0, '$25A764 cleared ($3,A5)');
  assert.equal(ram.u8(SCREEN8.joinMask), 0, '$25A8BC clr.b $812E5A');
  assert.equal(ram.u16(SCREEN8.blink), 0, '$25A8C2 move.w #$0,$812E58');
  // $23C47A really ran -- six clr.w over $80392E..$803939.
  assert.equal(ram.u16(0x80392e), 0);
  // $23C668 is UNCONDITIONAL in the cartridge and ctx carries no slotTable, so it is counted.
  assert.ok(noteAddrs(notes).includes(0x23c668), '$23C668 noted, not silently skipped');
  // Arm 0 does NOT run the tail: nothing dispatched this frame.
  assert.equal(ram.u16(SCREEN8.blink), 0, 'and the blink counter did not tick');
});

test('W375 arm 0 is reached on ($2,A5) alone, whatever $812E56 says', { skip: SKIP }, async () => {
  const { objSlot8, SCREEN8, ram, rom, ctx, a5 } = await fx();
  // $812E56 = 14 would otherwise be arm 14 and would stage slot [9]. ($2,A5) wins.
  ram.setU16(SCREEN8.state, 0x000e);
  ram.setU16(a5 + SCREEN8.param, 0x0002);
  objSlot8(ram, rom, a5, ctx);
  assert.equal(ram.u16(SCREEN8.state), 0x0002, 'the creator\'s ($4,A5) replaced it');
  assert.equal(ram.u16(0x80dbac), 0, 'and nothing was staged');
});

// ------------------------------------------------------------------ 2. the credit gate, four ways

/** A record already past arm 0, parked in a state whose arm does nothing observable. */
async function gated(opts) {
  const f = await fx(opts);
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x0004);         // state 4 is a bare rts
  return f;
}

test('W375 a COIN tears the screen down and restages slot [8] at state 3', { skip: SKIP }, async () => {
  const f = await gated();
  f.ram.setU8(f.SCREEN8.coinA, 1);               // $803958 -- $23C956's first counter
  liveObject(f.ram);                             // a live object, to prove $24107C ran
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);

  assert.ok(objectTableWiped(f.ram), '$24107C wiped the object table');
  assert.ok(f.clears.includes(0x24631c), '$24631C ran');
  const stage = 0x80d56c;
  assert.equal(f.ram.u16(stage) & 0x7fff, 0x0008, 'it restaged type 8 -- ITSELF');
  assert.equal(f.ram.u16(stage + 0x4a), 0x000a, 'with the TABLE\'s priority $000A');
  assert.equal(f.ram.u16(stage + 0x04), 0x0003, '$25A824 move.w #$3,($4,A0)');
  // The word literal over two byte fields: ($4,A0) = $00 and ($5,A0) = $03.
  assert.equal(f.ram.u8(stage + 0x04), 0x00);
  assert.equal(f.ram.u8(stage + 0x05), 0x03);
  // $25A82A rts -- the tail did not run, so the blink counter never ticked.
  assert.equal(f.ram.u16(f.SCREEN8.blink), 0, 'and no tail this frame');
});

test('W375 the SECOND coin counter and both CREDIT counters open the same gate', { skip: SKIP }, async () => {
  for (const [name, addr] of [['coin2 $80395E', 0x80395e], ['credit1 $80395A', 0x80395a],
    ['credit2 $803960', 0x803960]]) {
    const f = await gated();
    f.ram.setU8(addr, 1);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(0x80d56c) & 0x7fff, 0x0008, `${name} tore down`);
    assert.equal(f.ram.u16(0x80d56c + 0x04), 0x0003, `${name} restaged at state 3`);
  }
});

test('W375 nobody has a coin or a credit -> the tail, and NO teardown', { skip: SKIP }, async () => {
  const f = await gated();
  liveObject(f.ram);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.ok(!objectTableWiped(f.ram), '$24107C did NOT run');
  assert.equal(f.ram.u16(0x80dbac), 0, 'nothing staged');
  assert.equal(f.ram.u16(f.SCREEN8.blink), 1, 'the tail ticked the blink counter instead');
  // W376: `$23CFDE` is PORTED (fronttext.js) and no longer a note, so the probe for "the tail
  // drew the credit line" is the tilemap it writes. `$25A14C`/`$240CF0` write TxVram directly,
  // so the cells are there the moment `objSlot8` returns.
  assert.ok(txCells(f.ctx.tx) > 0, 'and drew the credit line');
});

test('W375 states $E, $3 and $D skip the credit check entirely', { skip: SKIP }, async () => {
  for (const st of [0x0e, 0x03, 0x0d]) {
    const f = await gated();
    f.ram.setU16(f.SCREEN8.state, st);
    f.ram.setU8(f.SCREEN8.coinA, 4);          // four coins in, and it must not matter
    f.ram.setU8(f.SCREEN8.creditA, 4);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    const staged = f.ram.u16(0x80d56c) & 0x7fff;
    assert.notEqual(staged, 0x0008, `state $${st.toString(16)} did not restage slot [8] at 3`);
    assert.equal(f.ram.u8(f.SCREEN8.coinA), 4, `state $${st.toString(16)} spent nothing`);
    assert.equal(f.ram.u8(f.SCREEN8.creditA), 4);
  }
});

// W377 CHANGED HOW THIS TEST WATCHES THE PAIRS, NOT WHAT IT CLAIMS. The claim is still "two
// INDEPENDENT pairs, not one pair with two conditions". What changed is that the `$28C0FC` half
// of each pair is now a COUNTED NOTE rather than a `soundPost`: `$28C0FC` has no `WRAPPERS` row
// and is not a streaming leaf, so against the real driver posting it threw
// `no wrapper at $28C0FC` -- the same defect as arm 3's `$28C170`, and `$25A7FA` is reachable by
// a player (state 12 + a coin). See `w377coin.test.js`. The `$28C5B0` half IS a real wrapper and
// still posts. So each pair now shows up as one cue AND one note, and the note carries its own
// call-site address, which is a STRICTLY STRONGER probe than two identical `0x28c0fc` entries:
// it distinguishes `$25A7E2` from `$25A7FA`, which the old cue list could not.
test('W375/W377 the coin teardown\'s two sound pairs are independent, not one',
  { skip: SKIP }, async () => {
  const both = await gated();
  both.ram.setU8(both.SCREEN8.coinA, 1);
  both.ram.setU16(both.SCREEN8.dualGate, 1);      // $803926 set...
  both.ram.setU16(both.SCREEN8.state, 0x000c);    // ...AND state 12
  both.objSlot8(both.ram, both.rom, both.a5, both.ctx);
  assert.deepEqual(both.cues, [0x28c5b0, 0x28c5b0], 'both $28C5B0 halves posted');
  const streams = both.notes.filter(([a]) => a === 0x28c0fc).map(([, w]) => w);
  assert.equal(streams.length, 2, 'and both $28C0FC halves were counted');
  assert.ok(streams[0].includes('$25A7E2'), 'the dual-gate pair first');
  assert.ok(streams[1].includes('$25A7FA'), 'then the state-12 pair');
  assert.equal(both.ram.u16(both.SCREEN8.dualGate), 0, '$25A7DC cleared $803926');

  const neither = await gated();
  neither.ram.setU8(neither.SCREEN8.coinA, 1);
  neither.objSlot8(neither.ram, neither.rom, neither.a5, neither.ctx);
  assert.deepEqual(neither.cues, [], 'and neither condition posts nothing');
  assert.deepEqual(neither.notes.filter(([a]) => a === 0x28c0fc), [],
    '  ...and counts nothing either -- the note is inside the branch, not beside it');
});

// ------------------------------------------------------------------ 3. $25ACAC

test('W375 $25ACAC: P1 START with a credit sets bit 0 and goes to state 14', { skip: SKIP }, async () => {
  const f = await fx();
  f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);           // bit 15 = START
  f.ram.setU8(f.SCREEN8.creditA, 3);
  f.ram.setU8(f.a5 + f.SCREEN8.inited, 1);
  f.ram.setU16(f.SCREEN8.state, 0x0003);
  f.joinPoll25ACAC(f.ram, f.a5, f.ctx);
  assert.equal(f.ram.u8(f.SCREEN8.joinMask), 0x01);
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x000e, '-> STATE 14');
  assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 0, '$25A764 cleared ($3,A5)');
  assert.equal(f.ram.u8(f.SCREEN8.creditA), 2, 'and it SPENT a credit through $23D060');
});

test('W375 $25ACAC: a REFUSED credit leaves the mask clear and the state alone', { skip: SKIP }, async () => {
  const f = await fx();
  f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);
  f.ram.setU8(f.SCREEN8.creditA, 0);               // no credit -> $23CAB0 ori #$1,SR
  f.ram.setU16(f.SCREEN8.state, 0x0003);
  f.joinPoll25ACAC(f.ram, f.a5, f.ctx);
  assert.equal(f.ram.u8(f.SCREEN8.joinMask), 0x00, 'the button was pressed and nothing happened');
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x0003, 'the state is untouched');
});

test('W375 $25ACAC: START not pressed never even asks for a credit', { skip: SKIP }, async () => {
  const f = await fx();
  f.ram.setU16(f.SCREEN8.p1Raw, 0x7fff);           // every bit BUT 15
  f.ram.setU8(f.SCREEN8.creditA, 3);
  f.joinPoll25ACAC(f.ram, f.a5, f.ctx);
  assert.equal(f.ram.u8(f.SCREEN8.joinMask), 0x00);
  assert.equal(f.ram.u8(f.SCREEN8.creditA), 3, 'the credit is still there');
});

test('W375 $25ACAC CLEARS the mask first, so it never accumulates', { skip: SKIP }, async () => {
  // `$25ACAC move.b #$0,$812E5A` is the first instruction, and it is what makes the mask mean
  // "who joined THIS frame". Without it a P1 join followed by a P2 join on a later frame would
  // hand arm 14 a mask of 3 having taken one credit, and a refused press would leave last
  // frame's bit standing.
  const f = await fx();
  f.ram.setU8(f.SCREEN8.joinMask, 0x03);           // last frame's answer, still in RAM
  f.ram.setU16(f.SCREEN8.state, 0x0003);
  f.joinPoll25ACAC(f.ram, f.a5, f.ctx);            // nobody presses anything
  assert.equal(f.ram.u8(f.SCREEN8.joinMask), 0x00, 'the stale mask is gone');
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x0003, 'and $25ACF0 tst.b did NOT fire on it');

  // P2 alone, after a frame in which P1 joined, must give mask 2 -- not 3.
  const g = await fx();
  g.ram.setU8(g.SCREEN8.joinMask, 0x01);
  g.ram.setU16(g.SCREEN8.p2Raw, 0x8000);
  g.ram.setU8(g.SCREEN8.creditA, 1);
  g.joinPoll25ACAC(g.ram, g.a5, g.ctx);
  assert.equal(g.ram.u8(g.SCREEN8.joinMask), 0x02, 'P2 alone, not both');
});

test('W375 the entry\'s three compares use the STALE state, and the tail re-reads', { skip: SKIP }, async () => {
  // The two halves of the same-frame trap, asserted separately.
  //
  // STALE: under free play at state 4 the compares let the frame through, `$25ACAC` writes 14,
  // and the tail then dispatches ARM 14 -- proved by `$25A82C cmpi.w #$D` NOT being the only
  // thing that changed. A port that re-read `$812E56` for the tail but ALSO for the compares
  // would be indistinguishable here, so the discriminating case is the opposite one:
  //
  // RE-READ: park at state 13. The compares see 13 and skip the gate, so `$25ACAC` never runs
  // from the entry and nothing can change the state -- but a port that CACHED the entry's read
  // and handed it to the tail is still correct here. The case that separates them is state 4
  // with the poll firing: the tail must dispatch on 14 (the NEW value), not on 4.
  const f = await fx({ dip: 0x12 });
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x0004);           // state 4 -- a bare rts if the tail caches
  f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);
  liveObject(f.ram);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.ok(objectTableWiped(f.ram),
    'the tail dispatched on 14, the value $25ACAC wrote -- not on the 4 $25A778 read');
  assert.equal(f.ram.u16(0x80d56c) & 0x7fff, 0x0009, 'arm 14 really ran');

  // And the stale half: state 14 is one of the three the compares skip, so the free-play poll
  // does NOT run from the entry even though the dip says free play -- the mask stays whatever
  // it was rather than being cleared and rebuilt.
  const g = await fx({ dip: 0x12 });
  g.ram.setU8(g.a5 + g.SCREEN8.constructed, 1);
  g.ram.setU16(g.SCREEN8.state, 0x000e);
  g.ram.setU16(g.SCREEN8.p1Raw, 0x8000);
  g.ram.setU16(g.SCREEN8.p2Raw, 0x8000);
  g.ram.setU8(g.SCREEN8.joinMask, 0x01);           // set by the frame that joined
  g.objSlot8(g.ram, g.rom, g.a5, g.ctx);
  assert.equal(g.ram.u8(0x80d56c + 0x04), 0x01,
    'arm 14 got the mask the joining frame built, not one $25ACAC rebuilt under it');
});

test('W375 $25ACAC: P2 sets bit 1, and both together give mask 3', { skip: SKIP }, async () => {
  const p2 = await fx();
  p2.ram.setU16(p2.SCREEN8.p2Raw, 0x8000);
  p2.ram.setU8(p2.SCREEN8.creditA, 2);             // SHARED pool: $80380B is 0
  p2.joinPoll25ACAC(p2.ram, p2.a5, p2.ctx);
  assert.equal(p2.ram.u8(p2.SCREEN8.joinMask), 0x02);
  assert.equal(p2.ram.u16(p2.SCREEN8.state), 0x000e);

  const both = await fx();
  both.ram.setU16(both.SCREEN8.p1Raw, 0x8000);
  both.ram.setU16(both.SCREEN8.p2Raw, 0x8000);
  both.ram.setU8(both.SCREEN8.creditA, 2);
  both.joinPoll25ACAC(both.ram, both.a5, both.ctx);
  assert.equal(both.ram.u8(both.SCREEN8.joinMask), 0x03, 'mask 3');
  assert.equal(both.ram.u8(both.SCREEN8.creditA), 0, 'and BOTH came out of $80395A');
});

test('W375 $23C9F0 is not $23C98E mirrored: $80380B picks the pool', { skip: SKIP }, async () => {
  // SHARED ($80380B != 1) -- P2 spends P1's counter and ignores $803960 entirely.
  const shared = await fx({ dipCredit: 0x00 });
  shared.ram.setU16(shared.SCREEN8.p2Raw, 0x8000);
  shared.ram.setU8(shared.SCREEN8.creditA, 1);
  shared.ram.setU8(shared.SCREEN8.creditB, 0);
  shared.joinPoll25ACAC(shared.ram, shared.a5, shared.ctx);
  assert.equal(shared.ram.u8(shared.SCREEN8.joinMask), 0x02, 'P2 joined on P1\'s credit');
  assert.equal(shared.ram.u8(shared.SCREEN8.creditA), 0, '$23D060 spent $80395A');

  // ...and with P1's counter empty and P2's full, shared mode REFUSES.
  const starved = await fx({ dipCredit: 0x00 });
  starved.ram.setU16(starved.SCREEN8.p2Raw, 0x8000);
  starved.ram.setU8(starved.SCREEN8.creditB, 5);
  starved.joinPoll25ACAC(starved.ram, starved.a5, starved.ctx);
  assert.equal(starved.ram.u8(starved.SCREEN8.joinMask), 0x00, 'no shared credit -> refused');
  assert.equal(starved.ram.u8(starved.SCREEN8.creditB), 5);

  // SEPARATE ($80380B == 1) -- the same starved machine now joins out of $803960.
  const sep = await fx({ dipCredit: 0x01 });
  sep.ram.setU16(sep.SCREEN8.p2Raw, 0x8000);
  sep.ram.setU8(sep.SCREEN8.creditB, 5);
  sep.joinPoll25ACAC(sep.ram, sep.a5, sep.ctx);
  assert.equal(sep.ram.u8(sep.SCREEN8.joinMask), 0x02);
  assert.equal(sep.ram.u8(sep.SCREEN8.creditB), 4, '$23D070 spent $803960');
});

test('W375 $23C98E\'s $11 COIN arm is refused and COUNTED, never invented', { skip: SKIP }, async () => {
  const f = await fx({ dip: 0x11 });
  f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);
  f.ram.setU8(f.SCREEN8.creditA, 9);
  f.joinPoll25ACAC(f.ram, f.a5, f.ctx);
  assert.equal(f.ram.u8(f.SCREEN8.joinMask), 0x00);
  assert.ok(noteAddrs(f.notes).includes(0x23c9aa), 'and the coin arm is on the unported report');
});

// ------------------------------------------------------------------ 4. the same-frame free play path

test('W375 FREE PLAY: START runs arm 14 in the SAME call', { skip: SKIP }, async () => {
  const f = await fx({ dip: 0x12 });               // $803808 = $12
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x0004);           // state 4: NOT one of $E/$3/$D, so the gate runs
  f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);           // START held
  liveObject(f.ram);                               // a live object arm 14's $24107C destroys

  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);

  assert.equal(f.ram.u16(f.SCREEN8.state), 0x000e, '$25ACAC set state 14...');
  assert.ok(objectTableWiped(f.ram), '...and $25A862 re-read it, so arm 14 ran THIS frame');
  assert.equal(f.ram.u16(0x80d56c) & 0x7fff, 0x0009, 'slot [9] staged');
  assert.equal(f.ram.u8(0x80d56c + 0x04), 0x01, 'carrying the join mask');
  // The three compares at $25A77E..$25A796 used the OLD state ($4), so the gate was entered.
  assert.equal(f.ram.u16(f.SCREEN8.blink), 1, 'and the tail ran, so the blink ticked');
});

test('W375 free play does NOT poll when the state is $E, $3 or $D', { skip: SKIP }, async () => {
  // State 3 is arm 3, which polls $25ACAC itself -- so the free-play poll at $25A7A2 is the
  // one that must be skipped, and the join has to come from the arm instead.
  const f = await fx({ dip: 0x12 });
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x000d);           // 13: the warning screen, which does NOT poll
  f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);
  f.ram.setU8(f.a5 + f.SCREEN8.inited, 1);         // past arm 13's init
  f.ram.setU16(f.a5 + f.SCREEN8.param, 0x00ff);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x000d, 'still 13 -- no join from the warning screen');
  assert.equal(f.ram.u16(0x80dbac), 0, 'and nothing staged');
});

test('W375 COIN play does not poll from the entry at all', { skip: SKIP }, async () => {
  const f = await fx({ dip: 0x00 });
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x0004);
  f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);
  f.ram.setU8(f.SCREEN8.creditA, 1);               // a credit -- but this trips the COIN GATE
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x0004, 'the entry poll never ran');
  assert.equal(f.ram.u16(0x80d56c) & 0x7fff, 0x0008, 'the credit restaged the CREDIT screen');
  assert.equal(f.ram.u8(f.SCREEN8.creditA), 1, 'and the credit was NOT spent by the teardown');
});

// ------------------------------------------------------------------ 5. arm 14

test('W375 arm 14 stages type 9 with the join mask, at the TABLE\'s priority', { skip: SKIP }, async () => {
  for (const mask of [0x01, 0x02, 0x03]) {
    const f = await fx();
    f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
    f.ram.setU16(f.SCREEN8.state, 0x000e);
    f.ram.setU8(f.SCREEN8.joinMask, mask);
    f.ram.setU32(0x80e882, 0x1234);                // the ID counter $24107C resets
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);

    const stage = 0x80d56c;
    assert.equal(f.ram.u16(stage) & 0x7fff, 0x0009, 'dispatch type 9');
    assert.equal(f.ram.u16(stage) & 0x8000, 0x8000, '  ...with $241182\'s live bit');
    assert.equal(f.ram.u16(stage + 0x4a), 0x000a,
      'priority $000A, and it came from $240F62 + 9*8 + 4');
    assert.equal(f.ram.u8(stage + 0x04), mask, `($4,A0) = the join mask $${mask}`);
    assert.equal(f.ram.u8(stage + 0x05), 0x00, '  ...a BYTE write, so ($5,A0) is untouched');
    assert.equal(f.ram.u32(stage + 0x4c), 1, '$24107C reset the ID counter, so this is object 1');
  }
});

test('W375 arm 14\'s priority is a LOOKUP, not the constant $000A', { skip: SKIP }, async () => {
  // Slot [9]'s real priority is $000A, which is also slot [8]'s -- so a hardcoded constant
  // would pass every test above. Drive a rom whose table says something else and the staged
  // record has to follow the table.
  const f = await fx();
  const rom = { ...f.rom, u16: (a) => (a === f.SCREEN8.dispatch + 9 * 8 + 4 ? 0x0017 : f.rom.u16(a)) };
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x000e);
  f.ram.setU8(f.SCREEN8.joinMask, 0x03);
  f.objSlot8(f.ram, rom, f.a5, f.ctx);
  assert.equal(f.ram.u16(0x80d56c + 0x4a), 0x0017, 'the record carries what the table said');
});

test('W375 the join mask is the field objslot9.js reads', { skip: SKIP }, async () => {
  const { SCREEN8 } = await fx();
  const { SEED9 } = await import('../src/objslot9.js');
  assert.equal(SCREEN8.joinField, SEED9.mask,
    '$25ACA2 writes ($4,A0) and $25C942 reads ($4,A5) -- the same byte');
  // And slot [9] really does branch on 1/2/3.
  assert.deepEqual(SEED9.maskArms.map((a) => a.value), [3, 2, 1]);
});

// ------------------------------------------------------------------ 6. arm 13

test('W375 arm 13\'s init frame ENDS at $25AC34 and draws nothing', { skip: SKIP }, async () => {
  const f = await fx();
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x000d);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);

  assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 1);
  assert.equal(f.ram.u16(f.a5 + f.SCREEN8.cursor), 0x0000);
  assert.equal(f.ram.u16(f.a5 + f.SCREEN8.y), 0x00b8);
  assert.equal(f.ram.u16(f.a5 + f.SCREEN8.delay), 0x0001);
  assert.equal(f.ram.u16(f.a5 + f.SCREEN8.param), 0x012c, 'the 300-frame timeout is armed');
  assert.equal(f.ram.u16(0x80b026), 0, '$240B0E reset the cameras');
  assert.ok(!noteAddrs(f.notes).includes(0x259ff8), 'and $259FF8 was NOT called: $25AC34 rts');
  assert.equal(f.ram.u16(f.SCREEN8.blink), 0, 'state 13 also skips the blink and credit line');
  // A word literal into ($4,A5): $012C over two byte fields.
  assert.equal(f.ram.u8(f.a5 + f.SCREEN8.param), 0x01);
  assert.equal(f.ram.u8(f.a5 + f.SCREEN8.param + 1), 0x2c);
});

test('W375 arm 13 walks 14 lines: $1C0 total, $20 a line, Y down by $C', { skip: SKIP }, async () => {
  const f = await fx();
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x000d);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);         // the init frame

  // W376: the probe is the DEFER BUFFER, not a note. `$259FF8` queues through `$240E1A`, so
  // IRQ6's `$141258` flush has to run before anything reaches the tilemap -- draining it here
  // each frame is what makes "this frame emitted a line" observable, and it is the emitter's
  // real product rather than a marker that it was reached.
  const { flushTextDefer141258 } = await import('../src/hud.js');
  const emits = [];
  for (let frame = 0; frame < 20; frame++) {
    const before = txCells(f.ctx.tx);
    const y = f.ram.u16(f.a5 + f.SCREEN8.y);
    const cur = f.ram.u16(f.a5 + f.SCREEN8.cursor);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    flushTextDefer141258(f.ram, f.ctx.tx, {});
    const drawn = txCells(f.ctx.tx) - before;
    if (drawn > 0) emits.push({ y, cur, drawn });
  }
  assert.equal(emits.length, 14, 'fourteen lines and no fifteenth');
  assert.deepEqual(emits.map((e) => e.drawn), Array.from({ length: 14 }, () => 56),
    '28 characters a line, TWO cells a character');
  assert.deepEqual(emits.map((e) => e.cur),
    Array.from({ length: 14 }, (_, i) => i * 0x20), 'the cursor steps by $20');
  assert.deepEqual(emits.map((e) => e.y),
    Array.from({ length: 14 }, (_, i) => 0xb8 - i * 0x0c), 'and Y steps DOWN by $C');
  assert.equal(f.ram.u16(f.a5 + f.SCREEN8.cursor), 0x01c0, 'stopping exactly at $1C0');
  // $25AC50 lea ($25AA36,PC),A0 -- the base is the EXTENSION WORD's address plus $FDE4.
  assert.equal(f.SCREEN8.warnStrings, 0x25ac52 + ((0xfde4 << 16) >> 16));
  // The first line really is $25AA36's own: character 0 is the SPACE the block opens with, and
  // the font entry for $20 is tile $80. Its cell is at Y = $B8, D1 = 0.
  assert.equal(f.IMG[0x25aa36], 0x20);
  assert.equal(f.ctx.tx.long(0x904000 + 0xb8), (0xc0000000 | (0x0080 << 16)) >>> 0,
    'the first line comes from $25AA36 itself');
});

test('W375 arm 13\'s $12C timeout lands on state 2, counted from the frame AFTER init', { skip: SKIP }, async () => {
  const f = await fx();
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x000d);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);         // init, and the timeout is NOT decremented here
  assert.equal(f.ram.u16(f.a5 + f.SCREEN8.param), 0x012c);

  for (let i = 0; i < 0x12b; i++) f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.equal(f.ram.u16(f.a5 + f.SCREEN8.param), 1, '299 frames counted');
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x000d, 'still 13');

  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);         // the 300th
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x0002, '-> STATE 2, the high-score screen');
  assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 0, 'and $25A764 re-armed the next arm\'s init');
});

// ------------------------------------------------------------------ 7. the blink

// W377 CHANGED THE **OFF** PROBE, for the reason W376 changed $259FF8's and $23CFDE's: the note
// is gone because the call is real. `$25AFD8` is ported (`fronttext.js blinkOff25AFD8`), so an
// OFF frame is now detected by ITS PRODUCT -- the blank tile it blits at $904000 + ((0<<6)+$13)*4
// -- which is a strictly stronger probe than a note that only proved the call was reached. The ON
// half `$25AD02` is still a counted deferral and is still watched by note.
const BLINK_CELL0 = 0x904000 + ((0 * 64 + 0x13) << 2);   // $25AFD8's first line, first character
const BLANK_TILE = 0xc0200000;             // ' ' = $20 -> ($20 << 16) | attr 0, + $C0000000
const POISON = 0x11223344;

test('W375/W377 the blink is 16 frames on and 16 off across $812E58', { skip: SKIP }, async () => {
  const f = await gated();                        // state 4, no coins, so only the tail runs
  const seen = [];
  for (let i = 0; i < 64; i++) {
    const before = f.notes.length;
    f.ctx.tx.setLong(BLINK_CELL0, POISON);        // re-poisoned every frame, so each is its own
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    const fresh = noteAddrs(f.notes.slice(before));
    const on = fresh.includes(0x25ad02);
    const off = f.ctx.tx.long(BLINK_CELL0) === BLANK_TILE;
    assert.equal(Number(on) + Number(off), 1, 'exactly one of the two messages per frame');
    if (on) {
      assert.equal(f.ctx.tx.long(BLINK_CELL0), POISON,
        'an ON frame must not blank -- $25AD02 is still noted, so it draws nothing');
    }
    seen.push(on ? 1 : 0);
  }
  assert.equal(f.ram.u16(f.SCREEN8.blink), 64, 'the counter is free-running');
  // $25A838 addq.w #1 happens BEFORE $25A844 andi.w #$10, so frame 1 sees counter 1.
  const expect = Array.from({ length: 64 }, (_, i) => (((i + 1) & 0x10) !== 0 ? 1 : 0));
  assert.deepEqual(seen, expect, '16 off, 16 on, 16 off, 16 on');
  assert.equal(seen.slice(0, 15).every((v) => v === 0), true, 'frames 1..15 are OFF');
  assert.equal(seen.slice(15, 31).every((v) => v === 1), true, 'frames 16..31 are ON');
});

test('W375 state 13 draws no blink and no credit line; every other state draws both', { skip: SKIP }, async () => {
  const warn = await fx();
  warn.ram.setU8(warn.a5 + warn.SCREEN8.constructed, 1);
  warn.ram.setU16(warn.SCREEN8.state, 0x000d);
  warn.ram.setU16(warn.SCREEN8.blink, 0x0020);
  warn.objSlot8(warn.ram, warn.rom, warn.a5, warn.ctx);
  assert.equal(warn.ram.u16(warn.SCREEN8.blink), 0x0020, 'the counter did not move');
  // W377: `$25AFD8` no longer has a note to be absent, so only `$25AD02` is watched that way.
  const a = noteAddrs(warn.notes);
  assert.ok(!a.includes(0x25ad02) && !a.includes(0x23cfde));
  // W376/W377: and BOTH ported halves' products are absent too. State 13's init clears TX and
  // returns, so the only way a cell could be here is the tail drawing what it must not -- and
  // `$25AFD8`'s blanks are $C0200000, non-zero, so this count sees them.
  assert.equal(txCells(warn.ctx.tx), 0,
    'state 13 wrote neither the credit line nor the blink blanks to the tilemap');

  const other = await gated();
  other.objSlot8(other.ram, other.rom, other.a5, other.ctx);
  assert.ok(txCells(other.ctx.tx) > 0, 'state 4 draws the credit line');
});

// ------------------------------------------------------------------ the remaining arms

test('W375 arm 2 advances to 12 when the ported $25B412 finishes, and holds while it runs',
  { skip: SKIP }, async () => {
    const f = await fx();
    const { SCREEN_STATE } = await import('../src/hiscorescreen.js');
    const { hiscoreDefaults28841E } = await import('../src/hiscore.js');
    f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
    f.ram.setU16(f.SCREEN8.state, 0x0002);
    // **W375b: THE HANDLE IS NO LONGER SEEDED HERE.** This test used to write `$812E60` by hand
    // and note `$25B3DC` as arm 2's missing init; `hiscoreInit25B3DC` now writes it for real, so
    // seeding it would be seeding over the very thing under test. The ONE thing still seeded is
    // the factory high-score table, and that is not scaffolding either -- `$23BF74 jsr $28841E`
    // runs it fifty-eight bytes before `$23BFCC` stages this record. Without it
    // `drawStyles25B5E2` reads a style value of 0 and throws by address.
    hiscoreDefaults28841E(f.ram, f.rom);           // $23BF74
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x0002, 'still 2');
    assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 1, 'and its init latched');
    assert.ok(!noteAddrs(f.notes).includes(0x25b3dc), '$25B3DC is PORTED -- no longer noted');
    assert.ok(noteAddrs(f.notes).includes(0x2414be), 'and the palette install is counted');
    assert.equal(f.ram.u32(SCREEN_STATE.handle), 0x810346, '$25B3DC installed the handle');
    assert.equal(f.ram.u16(SCREEN_STATE.timer), 0x00f0, 'and the $F0 countdown');
    assert.equal(f.ram.u16(SCREEN_STATE.state), 0, 'a LIVE chain holds $25B412 at its state 0');

    // Retire the chain, and the screen frees it and steps its OWN state to 1 -- it is running.
    for (const n of chainNodes(f.ram, 0x810346)) f.ram.setU16(n + 0x18, 0);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(SCREEN_STATE.state), 1, '$25B412 advanced its OWN state');
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x0002, 'while slot [8] holds at 2');

    // Drive $25B412's own state to 2 with a finished chain: it returns CARRY CLEAR.
    f.ram.setU16(SCREEN_STATE.state, 2);
    f.ram.setU32(SCREEN_STATE.handle, 0x810346);   // a freed slot with no chain -> check is 0
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x000c, '-> STATE 12');
    assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 0, 'and $25A764 re-armed arm 12\'s init');
  });

// **W377 CHANGED WHAT THIS TEST ASSERTS, AND THE OLD ASSERTION WAS ASSERTING A BUG.**
// It used to require `f.cues` to be `[0x28c170]`, i.e. that arm 3's init POSTS `$28C170`
// through `ctx.soundPost`. Against the real driver that post is not a cue, it is a THROW:
// `sound.js` has no `WRAPPERS` row for `$28C170` and its header says it must never get one
// (`$28C170` goes through the `$28BBAC` packer, not `$28BB04`). So the assertion was pinning
// the exact line that killed a cold-boot run one frame after a coin credited -- see
// `w377coin.test.js`. Arm 3 now COUNTS the cue, the way `background.js:1047` and
// `hiscorescreen.js:544` have always counted this same address, and this test asserts that:
// the note is present AND `soundPost` is never reached.
test('W377 arm 3 polls $25ACAC every frame and COUNTS $28C170 rather than posting it',
  { skip: SKIP }, async () => {
  const f = await fx();
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x0003);
  f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);
  f.ram.setU8(f.SCREEN8.creditA, 1);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.deepEqual(f.cues, [], 'arm 3 posts NO wrapper cue -- $28C170 has no wrapper to post');
  assert.ok(noteAddrs(f.notes).includes(0x28c170),
    '$25A962 jsr $28C170 -- verified in the ROM at $25A962, counted as an unported cue');
  assert.ok(f.clears.includes(0x24631c), '$25A956 jsr $24631C');
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x000e, 'and the poll joined, on COIN play');
  assert.equal(f.ram.u8(f.SCREEN8.creditA), 0);
});

test('W375 states 4, 6, 7, 8, 10, 11 do nothing at all', { skip: SKIP }, async () => {
  for (const st of [0x4, 0x6, 0x7, 0x8, 0xa, 0xb]) {
    const f = await gated();
    f.ram.setU16(f.SCREEN8.state, st);
    const before = f.notes.length;
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    // Only the tail's three notes (one blink message + the credit line) may appear.
    const fresh = noteAddrs(f.notes.slice(before))
      .filter((a) => a !== 0x25ad02 && a !== 0x25afd8 && a !== 0x23cfde);
    assert.deepEqual(fresh, [], `state $${st.toString(16)} is a bare rts`);
    assert.equal(f.ram.u16(0x80dbac), 0, '  ...and stages nothing');
    assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 0, '  ...and touches no init flag');
  }
});

// **W389 REMOVED ARM 12 FROM THIS LIST AND W390 REMOVES ARM 9, and that is the only change.**
// The list is "the arms whose screens are counted rather than ported". Arm 12's
// `$25C2AE`/`$25C2EA` (W389) and arm 9's `$25C3E8`/`$25C424` (W390, `objslot8.js
// screen9Init25C3E8` / `screen9Body25C424`) are ported now, so neither can note its init any
// more and this test's `notes its init` assertion could not survive for either. Neither HOLDS
// either: each drains its two chains and hands on -- 12 to 9, and 9 to 1 -- which
// `w390arm9.test.js` SECTION 3 measures on a real cold boot as `13 -> 2 -> 12 -> 9 -> 1`.
// **Arms 1 and 5 are untouched and still assert exactly what they did**, and they are now the
// whole of the counted tier, which is why arm 1 is where the attract loop rests.
test('W375 the unported arms HOLD rather than inventing an advance', { skip: SKIP }, async () => {
  const arms = [
    { st: 0x1, init: 0x25bbb4, body: 0x25bd7c },
    { st: 0x5, init: 0x25c592, body: 0x25c6d4 },
  ];
  for (const arm of arms) {
    const f = await gated();
    f.ram.setU16(f.SCREEN8.state, arm.st);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.ok(noteAddrs(f.notes).includes(arm.init), `state ${arm.st} notes its init`);
    assert.ok(noteAddrs(f.notes).includes(arm.body), `state ${arm.st} notes its body`);
    assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 1, '  ...but the init flag DID latch');
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(f.SCREEN8.state), arm.st, '  ...and the state holds');
  }
});

test('W375 $25A9B2, arm 5\'s teardown, restages slot [8] at state 2', { skip: SKIP }, async () => {
  const f = await fx();
  liveObject(f.ram);
  const made = f.teardown25A9B2(f.ram, f.rom, f.ctx);
  assert.ok(objectTableWiped(f.ram), '$24107C ran');
  assert.ok(f.clears.includes(0x24631c), '$24631C ran');
  assert.equal(f.ram.u16(0x812e82), 0, '$25C57E cleared its fifteen words');
  assert.equal(f.ram.u16(made.addr) & 0x7fff, 0x0008, 'type 8 -- ITSELF');
  assert.equal(f.ram.u16(made.addr + 0x4a), 0x000a, 'at the table\'s priority');
  assert.equal(f.ram.u16(made.addr + 0x04), 0x0002, '$25A9D4 move.w #$2,($4,A0)');
  // W377: $28C0FC is COUNTED, not posted -- posting it throws `no wrapper at $28C0FC`.
  assert.deepEqual(f.cues, [], 'nothing postable is posted here');
  const n = f.notes.find(([a]) => a === 0x28c0fc);
  assert.ok(n && n[1].includes('$25A9DA'), '$25A9DA jsr $28C0FC -- counted at its own call site');
});

// ------------------------------------------------------------------ 8. the unbounded table

test('W375 an out-of-range state is NOTED, not clamped', { skip: SKIP }, async () => {
  const f = await gated();
  f.ram.setU16(f.SCREEN8.state, 0x000f);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  const n = f.notes.find(([a]) => a === 0x25a86c);
  assert.ok(n, '$25A86C is on the unported report');
  assert.ok(n[1].includes('25A8AE'), 'and it says the cartridge would land in arm 0\'s body');
  assert.equal(f.ram.u8(f.a5 + f.SCREEN8.constructed), 1, 'nothing was clamped or re-inited');
  assert.equal(f.ram.u16(f.SCREEN8.state), 0x000f, 'and the state was not rewritten');
});

// ------------------------------------------------------------------ the whole path, end to end

test('W375 reset -> warning -> high score, and a coin -> credit screen -> gameplay',
  { skip: SKIP }, async () => {
    const f = await fx();                          // coin play
    f.ram.setU16(f.a5 + f.SCREEN8.param, 0x000d);  // what reset stages
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);         // arm 0
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x000d);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);         // arm 13's init
    assert.equal(f.ram.u16(f.a5 + f.SCREEN8.param), 0x012c);

    // A coin drops mid-warning. State 13 SKIPS the check, so nothing happens...
    f.ram.setU8(f.SCREEN8.coinA, 1);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x000d, 'the warning screen ignores it');

    // ...until the timeout hands over to state 2, whose next frame DOES see the coin.
    f.ram.setU16(f.a5 + f.SCREEN8.param, 1);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x0002);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(0x80d56c) & 0x7fff, 0x0008, 'the coin tore the screen down');
    assert.equal(f.ram.u16(0x80d56c + 0x04), 0x0003, 'and restaged slot [8] at the CREDIT screen');

    // The new record boots into state 3 and joins on a credit.
    const b5 = 0x812700;
    f.ram.setU16(b5 + f.SCREEN8.param, 0x0003);
    f.objSlot8(f.ram, f.rom, b5, f.ctx);           // arm 0
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x0003);
    f.ram.setU16(f.SCREEN8.p1Raw, 0x8000);
    f.ram.setU8(f.SCREEN8.creditA, 1);
    f.objSlot8(f.ram, f.rom, b5, f.ctx);           // arm 3: init + $25ACAC -> state 14
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x000e);
    f.objSlot8(f.ram, f.rom, b5, f.ctx);           // arm 14
    const last = 0x80d56c + f.ram.u16(0x80dbac) - 0x50;
    assert.equal(f.ram.u16(last) & 0x7fff, 0x0009, 'slot [9] staged: the game starts');
    assert.equal(f.ram.u8(last + 0x04), 0x01, 'with P1 joined');
  });

// =============================================================================================
// W375b -- `$25B3DC`, ARM 2'S INIT, AND THE COLD BOOT IT UNBLOCKS.
//
// Every claim below is decoded from the raw image in the test itself. The brief for this wave
// described `$25B3DC` as "about 52 bytes; clear $812E5C plus five words, set $812E5E := $F0,
// load $25BA46 through $24641A into $812E60". Four of those clauses are wrong in detail and
// the tests that follow are what settled them.

/**
 * THE COLD BOOT, in the cartridge's own order. `$23BF60..$23BFDC` is one straight line and the
 * two calls that matter to slot [8] are fifty-eight bytes apart in it:
 *
 *     23BF74  jsr $28841E                 the FACTORY high-score table -> $803824..$8038B9
 *     ...     five jsr $2414BE palette installs
 *     23BFCC  move.w #$8,D0 / jsr $241182 / move.w #$D,($4,A0)      stage slot [8] at state 13
 *
 * So a faithful cold boot has the factory table in RAM BEFORE the record exists. That is not
 * scaffolding: leaving it out makes `drawStyles25B5E2` read a style value of 0 and throw by
 * address, because `subq.w #2` would index -2 into its own `rts`.
 *
 * **`Game#boot()` DOES NOT DO THIS.** `hiscoreDefaults28841E` is exported by `hiscore.js` and
 * called only from tests; nothing in `src/` calls it. That is a live gap in the boot path and
 * it belongs to `main.js`, not to this file -- recorded here so it is not lost.
 */
async function coldBootRam(f) {
  const { hiscoreDefaults28841E } = await import('../src/hiscore.js');
  hiscoreDefaults28841E(f.ram, f.rom);          // $23BF74
  f.ram.setU16(f.a5 + f.SCREEN8.param, 0x000d); // $23BFD6 move.w #$D,($4,A0)
  return f;
}

/** The chain-node addresses `loadAnimObjects246410` links off a root, in order, by walking
 *  `($2C)` exactly the way `$24681A` does. */
function chainNodes(ram, handle) {
  const out = [];
  let cur = ram.u32((handle >>> 0) + 0x2c);
  while (cur !== 0 && out.length < 64) { out.push(cur); cur = ram.u32(cur + 0x2c); }
  return out;
}

test('W375b $25B3DC is FIFTY-FOUR bytes and the routine before it ends in a jmp, not an rts',
  { skip: SKIP }, async () => {
    const { IMG, HISCORE_INIT } = await fx();
    // Scanning BACK: $25B3D4 is `jmp $25A14C.l` -- a tail jump -- and $25B3DA is a `nop` pad.
    // There is no preceding `rts` at all, so "scan back from the preceding rts" finds nothing.
    assert.equal(IMG.readUInt16BE(0x25b3d4), 0x4ef9, '$25B3D4 jmp xxx.l');
    assert.equal(IMG.readUInt32BE(0x25b3d6), 0x0025a14c, '  ...$25A14C, six bytes of jmp');
    assert.equal(IMG.readUInt16BE(0x25b3da), 0x4e71, '$25B3DA nop -- the pad before the entry');
    // Scanning FORWARD to its own rts.
    assert.equal(IMG.readUInt16BE(0x25b410), 0x4e75, '$25B410 rts, and 4E75 is TWO bytes');
    assert.equal(HISCORE_INIT.site, 0x25b3dc);
    assert.equal(HISCORE_INIT.end, 0x25b412, 'the extent ends where $25B412 begins');
    assert.equal(HISCORE_INIT.end - HISCORE_INIT.site, 54, 'FIFTY-FOUR bytes, not 52');
    // And $25B412 -- the per-frame body arm 2 already ran -- is the very next instruction.
    assert.equal(IMG.readUInt32BE(0x25b412), 0x48e7fffe, '$25B412 movem.l d0-d7/a0-a6,-(a7)');
    // The entry saves and restores EVERY register, so the five words, the $F0 and the handle
    // are the routine's entire effect.
    assert.equal(IMG.readUInt32BE(0x25b3dc), 0x48e7fffe, '$25B3DC movem.l d0-d7/a0-a6,-(a7)');
    assert.equal(IMG.readUInt32BE(0x25b40c), 0x4cdf7fff, '$25B40C movem.l (a7)+,d0-d7/a0-a6');
  });

test('W375b the clear is a dbra loop over FIVE words, not clr.w / clr.l / move.w #0',
  { skip: SKIP }, async () => {
    const { IMG, HISCORE_INIT } = await fx();
    // $25B3E0 lea $812E5C.l,A0
    assert.equal(IMG.readUInt16BE(0x25b3e0), 0x41f9, 'lea xxx.l,a0');
    assert.equal(IMG.readUInt32BE(0x25b3e2), 0x00812e5c, '  ...$812E5C');
    // $25B3E6 move.w #$4,D0 -- the COUNT, and with dbra that is FIVE iterations.
    assert.equal(IMG.readUInt16BE(0x25b3e6), 0x303c, 'move.w #imm,d0');
    assert.equal(IMG.readUInt16BE(0x25b3e8), 0x0004, '  ...#$4');
    assert.equal(IMG.readUInt16BE(0x25b3ea), 0x7200, '$25B3EA moveq #$0,d1 -- the ZERO');
    assert.equal(IMG.readUInt16BE(0x25b3ec), 0x30c1, '$25B3EC move.w d1,(a0)+ -- a WORD store');
    assert.equal(IMG.readUInt16BE(0x25b3ee), 0x51c8, '$25B3EE dbra d0,disp');
    // dbra's displacement: EA = the EXTENSION WORD's address + disp, $25B3F0 + $FFFC = $25B3EC.
    assert.equal(0x25b3f0 + ((IMG.readUInt16BE(0x25b3f0) << 16) >> 16), 0x25b3ec,
      'back to the store');
    assert.equal(HISCORE_INIT.clearWords, 5, 'FIVE words: $812E5C $5E $60 $62 $64');
    assert.equal(HISCORE_INIT.clearBase, 0x812e5c);
    // None of the three forms the brief named is anywhere in the routine.
    for (let a = 0x25b3dc; a < 0x25b412; a += 2) {
      const w = IMG.readUInt16BE(a);
      assert.notEqual(w, 0x4279, 'no clr.w abs.l at $' + a.toString(16).toUpperCase());
      assert.notEqual(w, 0x42b9, 'no clr.l abs.l at $' + a.toString(16).toUpperCase());
    }
    // `33FC` DOES appear -- but exactly once, and it is the $F0 store, not a clear.
    const at33fc = [];
    for (let a = 0x25b3dc; a < 0x25b412; a += 2) {
      if (IMG.readUInt16BE(a) === 0x33fc) at33fc.push(a);
    }
    assert.deepEqual(at33fc, [0x25b3f2], 'the only move.w #imm,abs.l is $25B3F2');
  });

test('W375b $812E5E := $F0 is a WORD IMMEDIATE, and a word literal is two byte fields',
  { skip: SKIP }, async () => {
    const { IMG, HISCORE_INIT, hiscoreInit25B3DC, ram, rom, ctx } = await fx();
    // $25B3F2 33FC 00F0 00812E5E -- move.w #$F0,$812E5E.l. Ten bytes, no table anywhere in it.
    assert.equal(IMG.readUInt16BE(0x25b3f2), 0x33fc, 'move.w #imm,abs.l');
    assert.equal(IMG.readUInt16BE(0x25b3f4), 0x00f0, '  ...the IMMEDIATE $F0, not a table read');
    assert.equal(IMG.readUInt32BE(0x25b3f6), 0x00812e5e, '  ...into $812E5E');
    assert.equal(HISCORE_INIT.timer0, 0x00f0);
    assert.equal(HISCORE_INIT.timer, 0x812e5e, 'and it is the $25B44C countdown');

    // The two byte fields, proved through the port rather than argued.
    ram.setU8(0x812e5e, 0xaa); ram.setU8(0x812e5f, 0xbb);
    hiscoreInit25B3DC(ram, rom, ctx);
    assert.equal(ram.u16(0x812e5e), 0x00f0, 'the word');
    assert.equal(ram.u8(0x812e5e), 0x00, 'the HIGH byte is $00');
    assert.equal(ram.u8(0x812e5f), 0xf0, 'and the LOW byte is $F0');
  });

test('W375b $24641A is $246410 with D6 = 0, takes A0 and returns D0', { skip: SKIP }, async () => {
  const { IMG } = await fx();
  // The two heads falling into ONE body at $246422.
  assert.equal(IMG.readUInt32BE(0x246410), 0x48e77ff8, '$246410 movem.l d1-d7/a0-a4,-(a7)');
  assert.equal(IMG.readUInt16BE(0x246414), 0x3c3c, '  move.w #imm,d6');
  assert.equal(IMG.readUInt16BE(0x246416), 0x0001, '  ...#$1');
  assert.equal(IMG.readUInt16BE(0x246418), 0x6008, '  bra.b -> $246422');
  assert.equal(IMG.readUInt32BE(0x24641a), 0x48e77ff8, '$24641A the SAME movem');
  assert.equal(IMG.readUInt16BE(0x24641e), 0x3c3c, '  move.w #imm,d6');
  assert.equal(IMG.readUInt16BE(0x246420), 0x0000, '  ...#$0 -- the whole difference');
  assert.equal(IMG.readUInt16BE(0x246422), 0x43f9, '$246422 lea xxx.l,a1 -- the shared body');
  assert.equal(IMG.readUInt32BE(0x246424), 0x00810346, '  ...the three-slot root pool');
  // A0 IS THE TABLE: $24643C move.w (a0)+,d0 is the entry count.
  assert.equal(IMG.readUInt16BE(0x24643c), 0x3018, '$24643C move.w (a0)+,d0 -- the count');
  // D0 IS THE RESULT, the one register the movem does not save ($7FF8 = d1-d7/a0-a4).
  assert.equal(IMG.readUInt16BE(0x246508), 0x2009, '$246508 move.l a1,d0 -- the ROOT ADDRESS');
  assert.equal(IMG.readUInt32BE(0x24650a), 0x4cdf1ffe, '  movem.l (a7)+,d1-d7/a0-a4: D0 survives');
  assert.equal(IMG.readUInt16BE(0x24650e), 0x4e75);
  assert.equal(IMG.readUInt16BE(0x246518), 0x70ff, '$246518 moveq #$FF,d0 -- the FAILURE value');
  // ...and the caller stores that D0 as a LONG into $812E60.
  assert.equal(IMG.readUInt16BE(0x25b400), 0x4eb9, '$25B400 jsr xxx.l');
  assert.equal(IMG.readUInt32BE(0x25b402), 0x0024641a, '  ...$24641A');
  assert.equal(IMG.readUInt16BE(0x25b406), 0x23c0, '$25B406 move.l d0,xxx.l');
  assert.equal(IMG.readUInt32BE(0x25b408), 0x00812e60, '  ...$812E60');
});

test('W375b $25BA46 is a lea (d16,PC) away, and its bound is the CODE count word',
  { skip: SKIP }, async () => {
    const { IMG, HISCORE_INIT, rom } = await fx();
    assert.equal(IMG.readUInt16BE(0x25b3fa), 0x41fa, '$25B3FA lea (d16,pc),a0');
    // EA = the EXTENSION WORD's address plus the displacement: $25B3FC + $64A, NOT $25B3FA.
    const disp = IMG.readUInt16BE(0x25b3fc);
    assert.equal(disp, 0x064a);
    assert.equal(0x25b3fc + disp, 0x25ba46, 'the extension word is at $25B3FC');
    assert.notEqual(0x25b3fa + disp, 0x25ba46, 'and the instruction address would be wrong');
    assert.equal(HISCORE_INIT.script, 0x25ba46);
    assert.equal(IMG.readUInt16BE(0x25b3fe), 0x4e71, '$25B3FE nop, between the lea and the jsr');

    // THE BOUND, stated by the code: `$24643C move.w (a0)+,d0` then fourteen bytes per entry.
    assert.equal(rom.u16(HISCORE_INIT.script), HISCORE_INIT.scriptEntries, 'SEVEN entries');
    assert.equal(HISCORE_INIT.entryStride, 14);
    assert.equal(HISCORE_INIT.scriptLen, 2 + 7 * 14);
    assert.equal(HISCORE_INIT.script + HISCORE_INIT.scriptLen, 0x25baaa,
      'it ends exactly where W303 already-declared $25BAAA window begins');
    // Every entry is `{fill.w, family.w, current-offset.w, target.l, words-1.w, timing.w}`, and
    // all seven name family 0 -- the ONE family the three-entry $24627A table has to resolve
    // for this script to load at all.
    // The LONG sits at offset 6, after three words -- not at 4.
    for (let i = 0; i < 7; i++) {
      const e = 0x25ba48 + i * 14;
      assert.equal(rom.u16(e + 2), 0x0000, 'entry ' + i + ' family 0');
      assert.equal(rom.u16(e + 10), 0x001f, 'entry ' + i + ' is 32 words');
      assert.equal(rom.u16(e + 12), 0x0002, 'entry ' + i + ' timing index 2');
      const target = rom.u32(e + 6);
      assert.ok(target >= 0x2254b8 && target <= 0x225938,
        'entry ' + i + ' target $' + target.toString(16).toUpperCase() + ' is a ROM colour block');
    }
  });

// ------------------------------------------------------------------ the port, on its own

test('W375b hiscoreInit25B3DC clears five words, sets $F0 and installs a real handle',
  { skip: SKIP }, async () => {
    const { hiscoreInit25B3DC, HISCORE_INIT, ram, rom, ctx, notes } = await fx();
    // Garbage in all five words plus a sixth, to prove the extent from both sides.
    for (let i = 0; i < 6; i++) ram.setU16(0x812e5c + i * 2, 0xdead);

    hiscoreInit25B3DC(ram, rom, ctx);

    assert.equal(ram.u16(0x812e5c), 0x0000, '$812E5C cleared -- the screen state word');
    assert.equal(ram.u16(0x812e5e), 0x00f0, '$812E5E cleared then set to $F0');
    assert.equal(ram.u16(0x812e64), 0x0000, '$812E64 -- the FIFTH word, cleared');
    assert.equal(ram.u16(0x812e66), 0xdead, 'and $812E66 is NOT touched -- five, not six');

    // The handle: a RAM POINTER into the three-slot root pool at $810346, stride $30 -- not an
    // index, which is what makes `($2C,handle)` in $24681A a plain read.
    const handle = ram.u32(HISCORE_INIT.handle);
    assert.equal(handle, 0x810346, 'the FIRST free root slot');
    assert.equal(ram.u16(handle) & 0x8000, 0x8000, 'claimed');
    assert.equal(ram.u16(handle + 0x04), 0x0000, '($4,root) = D6 = 0 -- the $24641A head');
    // It really built the script's seven nodes, linked at ($2C).
    const nodes = chainNodes(ram, handle);
    assert.equal(nodes.length, 7, 'seven nodes, one per script entry');
    assert.equal(nodes[0], 0x80fa86, 'from the twenty-slot pool at $80FA86, stride $70');
    assert.equal(nodes[6], 0x80fa86 + 6 * 0x70);
    for (const n of nodes) assert.equal(ram.u32(n + 0x18), 0xffff0000, 'lifetime seeded');
    assert.equal(notes.length, 0, 'and nothing was deferred -- the whole routine is here');
  });

test('W375b $24681A walks the handle this init installs, instead of throwing at $2C',
  { skip: SKIP }, async () => {
    const { hiscoreInit25B3DC, HISCORE_INIT, ram, rom, ctx } = await fx();
    const { chainCheck24681A } = await import('../src/stageend.js');

    // THE COLD-BOOT FAILURE, shown directly: a zero handle is what $25B412 reads today.
    assert.throws(() => chainCheck24681A(ram, ram.u32(HISCORE_INIT.handle)), /2C/i,
      'a zero $812E60 reads address $2C');

    hiscoreInit25B3DC(ram, rom, ctx);
    // Seven nodes each carrying $FFFF in the lifetime WORD, summed as a word: 7 * $FFFF = $FFF9.
    assert.equal(chainCheck24681A(ram, ram.u32(HISCORE_INIT.handle)), 0xfff9,
      'the chain is alive, so the screen keeps running');
  });

// ------------------------------------------------------------------ THE PRIZE

test('W375b a COLD BOOT survives 13 -> 2: the attract loop reaches the high-score screen',
  { skip: SKIP }, async () => {
    // A freshly zeroed Ram taken through `$23BF60..$23BFDC` -- the factory table, then the
    // slot-[8] record with ($2,A5) zero and ($4,A5) = $D. Nothing else is set anywhere.
    const f = await coldBootRam(await fx());
    assert.equal(f.ram.u32(0x812e60), 0, '$812E60 starts at ZERO -- this is the whole problem');
    assert.equal(f.ram.u16(0x812e5c), 0, 'and so does $812E5C, so $25B416 falls THROUGH');

    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);             // frame 1: arm 0 -> state 13
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x000d);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);             // frame 2: arm 13's init, and it RETURNS
    assert.equal(f.ram.u16(f.a5 + f.SCREEN8.param), 0x012c, 'the $12C timeout is armed');

    // Step the whole 300-frame warning screen. It must not throw either.
    for (let i = 0; i < 0x12c; i++) f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x0002, '13 -> 2 on the 300th frame');
    assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 0, '$25A764 re-armed arm 2 init gate');

    // ===== THE FRAME THAT USED TO THROW `Unreached: $2C is outside main RAM`. =====
    assert.doesNotThrow(() => f.objSlot8(f.ram, f.rom, f.a5, f.ctx),
      'arm 2 inits through $25B3DC and then runs $25B412');

    // The init ran: a real handle, and $812E5E holds the $F0 the screen counts down.
    const handle = f.ram.u32(0x812e60);
    assert.equal(handle, 0x810346, 'a plausible handle -- the first root slot, from $24641A');
    assert.equal(f.ram.u16(0x812e5e), 0x00f0);
    assert.equal(chainNodes(f.ram, handle).length, 7);
    // And the screen body ran on the same frame: state 0 with a live chain neither frees nor
    // advances, which is exactly what $25B412 does when $24681A reports non-zero.
    assert.equal(f.ram.u16(0x812e5c), 0x0000, '$25B412 saw a LIVE chain and held at state 0');
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x0002, 'and slot [8] is still on arm 2');

    // Twenty more attract frames, still no throw -- the loop is a loop.
    assert.doesNotThrow(() => {
      for (let i = 0; i < 20; i++) f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    }, 'the attract loop survives');
    assert.equal(f.ram.u16(f.SCREEN8.state), 0x0002);

    // Retire the chain the way the animation driver would, and the screen ADVANCES: it frees
    // the chain through $246800 and steps $812E5C to 1. That proves $25B412 is really driving
    // the handle $25B3DC installed, not merely failing to throw.
    for (const n of chainNodes(f.ram, handle)) f.ram.setU16(n + 0x18, 0);
    f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(0x812e5c), 0x0001, '$25B438 move.w #$1,$812E5C');
    assert.equal(f.ram.u16(0x812e5e), 0x00ef, '$25B44C subq.w #1 -- the $F0 is counting down');
    assert.equal(f.ram.u16(handle), 0x0000, '$246800 released the root slot');
  });

test('W375b arm 2 init runs ONCE, and it is ($3,A5) that says so', { skip: SKIP }, async () => {
  const f = await coldBootRam(await fx());
  f.ram.setU8(f.a5 + f.SCREEN8.constructed, 1);
  f.ram.setU16(f.SCREEN8.state, 0x0002);
  f.ram.setU8(f.a5 + f.SCREEN8.inited, 0);

  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.equal(f.ram.u8(f.a5 + f.SCREEN8.inited), 1, '$25A918 latched the gate');
  assert.equal(f.ram.u32(0x812e60), 0x810346);
  assert.equal(f.ram.u16(0x810346 + 0x30), 0x0000, 'the SECOND root slot is untouched');

  // A sentinel a re-init would have to clear ($25B3E0 first word).
  f.ram.setU16(0x812e5c, 0x1234);
  for (let i = 0; i < 5; i++) f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.equal(f.ram.u16(0x812e5c), 0x1234, 'five more frames and the init did NOT re-run');
  assert.equal(f.ram.u32(0x812e60), 0x810346, 'the handle is the same one');
  assert.equal(f.ram.u16(0x810346 + 0x30), 0x0000, 'and no second chain was ever loaded');

  // Clear the gate the way $25A764 does on a transition, and the init runs again -- claiming
  // the NEXT root slot, because the first is still held.
  f.ram.setU8(f.a5 + f.SCREEN8.inited, 0);
  f.objSlot8(f.ram, f.rom, f.a5, f.ctx);
  assert.equal(f.ram.u16(0x812e5c), 0x0000, 'the sentinel is gone -- $25B3DC ran');
  assert.equal(f.ram.u32(0x812e60), 0x810346 + 0x30, 'and it took the second root slot');
});
