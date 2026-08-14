// W373 -- object dispatch [7], $290BE8, driven end to end. The per-player loop is the whole point
// of the slot, so these run it for one player and for two and check it kills with the right code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

async function fixture({ players = 1, post = [2, 2] } = {}) {
  const mod = await import('../src/objslot7pool.js');
  const { Ram } = await import('../src/ram.js');
  const IMG = readFileSync(ROM);
  const rom = {
    u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n),
  };
  const ram = new Ram();
  const sounds = [];
  const notes = [];
  // State 0 opens with $23C6C6, the full screen wipe, so the fixture carries REAL video objects
  // rather than stubs -- the wipe is most of what state 0 does and stubbing it out would leave the
  // biggest thing on the path untested.
  const { BgVram, TxVram, VideoRegs, SlotTable907000 } = await import('../src/background.js');
  const ctx = { soundPost: (a) => sounds.push(a), unported: { note: (a) => notes.push(a) },
    unportedLog: { note: () => {} },
    videoRegs: new VideoRegs(), tx: new TxVram(), bgVram: new BgVram(),
    slotTable: new SlotTable907000() };
  // The active-player words: bit 15 set means that side is in the game.
  if (players >= 1) ram.setU16(mod.SLOT7.p1, 0x8000);
  if (players >= 2) ram.setU16(mod.SLOT7.p2, 0x8000);
  ram.setU16(mod.SLOT7.postD1[0], post[0]);
  ram.setU16(mod.SLOT7.postD1[1], post[1]);
  return { ...mod, ram, rom, ctx, sounds, notes, a5: 0x812000 };
}

test('W373 slot [7] is $290BE8 in the dispatch table, with a 30-byte record', { skip: SKIP }, async () => {
  const { SLOT7, rom } = await fixture();
  assert.equal(rom.u32(SLOT7.table), SLOT7.entry, 'the table entry is the routine');
  assert.equal(rom.u16(SLOT7.table + 4), SLOT7.recSize, 'and $001E is the record size');
});

test('W373 state 0 counts the PLAYERS, not a fixed two', { skip: SKIP }, async () => {
  const one = await fixture({ players: 1 });
  one.objSlot7(one.ram, one.rom, one.a5, one.ctx);
  assert.equal(one.ram.u16(one.SLOT7.work + one.SLOT7.players), 1, 'one active side counted');
  assert.equal(one.ram.u8(one.a5 + one.SLOT7.stateAt), 1, 'and it advanced to state 1');

  const two = await fixture({ players: 2 });
  two.objSlot7(two.ram, two.rom, two.a5, two.ctx);
  assert.equal(two.ram.u16(two.SLOT7.work + two.SLOT7.players), 2, 'two active sides counted');
});

test('W373 state 0 clears SIXTY-FOUR bytes, reaching the flash bytes at the far end',
  { skip: SKIP }, async () => {
    const { objSlot7, SLOT7, ram, rom, ctx, a5 } = await fixture();
    // Dirty the whole block, including the last word the dbra can reach.
    for (let i = 0; i < 40; i++) ram.setU16(SLOT7.work + i * 2, 0xbeef);
    objSlot7(ram, rom, a5, ctx);
    // move.w #$1F,D0 + dbra is THIRTY-TWO passes. Word 31 is the last one cleared; word 32 is not.
    assert.equal(SLOT7.work + 31 * 2, 0x81e11a, 'the 32nd word IS the palette shift');
    assert.equal(ram.u16(0x81e11c), 0xbeef, 'and the word past the block was left alone');
  });

test('W373 the flash pair is armed by ONE word literal as TWO bytes', { skip: SKIP }, async () => {
  const { objSlot7, SLOT7, ram, rom, ctx, a5 } = await fixture();
  objSlot7(ram, rom, a5, ctx);
  assert.equal(ram.u8(SLOT7.flash), 1, 'count byte');
  assert.equal(ram.u8(SLOT7.flashReload), 1, 'reload byte, from the same move.w #$101');
  assert.notEqual(SLOT7.flash, SLOT7.flashReload, 'and they are two different addresses');
});

test('W373 the tally post maps THREE-WAY onto the three sequence lists', { skip: SKIP }, async () => {
  for (const [posted, want] of [[2, 0], [4, 1], [6, 2]]) {
    const f = await fixture({ players: 1, post: [posted, posted] });
    f.objSlot7(f.ram, f.rom, f.a5, f.ctx);
    assert.equal(f.ram.u16(f.SLOT7.work + f.SLOT7.seqSel), want,
      `posted $${posted.toString(16)} selects sequence ${want}`);
  }
});

test('W373 the three sequence lists are self-bounding and the drivers differ in six bytes',
  { skip: SKIP }, async () => {
    const { SLOT7, rom } = await fixture();
    const IMG = readFileSync(ROM);
    for (const base of SLOT7.seqLists) {
      let n = 0;
      while (rom.u32(base + n * 4) !== 0xffffffff) { n++; assert.ok(n < 64, 'terminated'); }
      assert.equal(base + (n + 1) * 4, rom.u32(base),
        `list $${base.toString(16)} ends exactly where its own entry [0] begins`);
    }
    const a = IMG.subarray(0x291470, 0x291470 + 88);
    for (const b of [0x2917be, 0x291b3a]) {
      const x = IMG.subarray(b, b + 88);
      const diff = [];
      for (let i = 0; i < 88; i++) if (a[i] !== x[i]) diff.push(i);
      assert.deepEqual(diff, [0x12, 0x13, 0x48, 0x49, 0x54, 0x55],
        `$${b.toString(16)} differs from $291470 only in three jsr displacement words`);
    }
  });

test('W373 ONE player runs one pass and dies with code $F', { skip: SKIP }, async () => {
  const { objSlot7, SLOT7, ram, rom, ctx, a5 } = await fixture({ players: 1 });
  objSlot7(ram, rom, a5, ctx);
  assert.equal(ram.u16(SLOT7.work + SLOT7.pass), 0, 'pass counter starts at 0');

  ram.setU8(a5 + SLOT7.stateAt, 2);                          // the sequence reports itself finished
  objSlot7(ram, rom, a5, ctx);
  assert.equal(ram.u16(SLOT7.work + SLOT7.pass), 1, 'one pass done');
  assert.equal(ram.u16(SLOT7.work + SLOT7.players), 1);
  // pass === players, so it staged the create and killed. It must NOT have restarted.
  assert.notEqual(ram.u8(a5 + SLOT7.stateAt), 1, 'a one-player game does not go round again');
});

test('W373 TWO players go round a second time before dying', { skip: SKIP }, async () => {
  const { objSlot7, SLOT7, ram, rom, ctx, a5 } = await fixture({ players: 2, post: [2, 6] });
  objSlot7(ram, rom, a5, ctx);
  assert.equal(ram.u16(SLOT7.work + SLOT7.seqSel), 0, 'pass 0 took P1\'s posted $2 -> sequence 0');

  ram.setU8(a5 + SLOT7.stateAt, 2);
  objSlot7(ram, rom, a5, ctx);
  assert.equal(ram.u16(SLOT7.work + SLOT7.pass), 1, 'pass 1');
  assert.equal(ram.u8(a5 + SLOT7.stateAt), 1, 'and it RESTARTED rather than dying');
  assert.equal(ram.u16(SLOT7.work + SLOT7.seqSel), 2, 'pass 1 took P2\'s posted $6 -> sequence 2');
  // The second player is dropped straight into the sequence, not back through inner state 0.
  assert.equal(ram.u16(SLOT7.work + SLOT7.innerAt), 3, 'inner state = sequence + 1');

  ram.setU8(a5 + SLOT7.stateAt, 2);
  objSlot7(ram, rom, a5, ctx);
  assert.equal(ram.u16(SLOT7.work + SLOT7.pass), 2, 'pass 2 = the player count');
  assert.notEqual(ram.u8(a5 + SLOT7.stateAt), 1, 'and now it stops going round');
});

test('W373 the menu\'s answer picks between the gate and a restart', { skip: SKIP }, async () => {
  // $81E116 non-zero means the menu answered. Selection 0 sets the global gate; anything else
  // restarts this player. The menu defaults the selection to 1, so doing nothing restarts.
  const a = await fixture({ players: 1 });
  a.objSlot7(a.ram, a.rom, a.a5, a.ctx);
  a.ram.setU16(0x81e116, 1);
  a.ram.setU16(0x81e112, 0);                                 // selection 0
  a.ram.setU8(a.a5 + a.SLOT7.stateAt, 2);
  a.objSlot7(a.ram, a.rom, a.a5, a.ctx);
  assert.equal(a.ram.u16(a.SLOT7.gate), 1, 'selection 0 set the $813098 gate');
  assert.equal(a.ram.u16(a.SLOT7.work + a.SLOT7.pass), 0, '  ...and did NOT bump the pass counter');

  const b = await fixture({ players: 1 });
  b.objSlot7(b.ram, b.rom, b.a5, b.ctx);
  b.ram.setU16(0x81e116, 1);
  b.ram.setU16(0x81e112, 1);                                 // selection 1, the menu's default
  b.ram.setU8(b.a5 + b.SLOT7.stateAt, 2);
  b.objSlot7(b.ram, b.rom, b.a5, b.ctx);
  assert.equal(b.ram.u16(b.SLOT7.gate), 0, 'selection 1 left the gate alone');
  assert.equal(b.ram.u8(b.a5 + b.SLOT7.stateAt), 1, '  ...and restarted this player');
  assert.equal(b.ram.u16(0x81e116), 0, 'and the answer word was consumed either way');
});

test('W373 the banner index 0 is unreachable, and the flash reloads on the BORROW',
  { skip: SKIP }, async () => {
    const { objSlot7, SLOT7, ram, rom, ctx, a5, rom: r } = await fixture({ players: 1 });
    assert.equal(r.u32(SLOT7.bannerTable), 0, 'entry [0] is zero in the cartridge');
    objSlot7(ram, rom, a5, ctx);
    assert.equal(ram.u16(SLOT7.bannerSel), 0, 'and the restart leaves the selector at 0');

    // Drive state 1 with a banner selected. Count is 1, so the first frame decrements 1 -> 0 with
    // NO borrow and no reload; the second frame borrows and reloads.
    ram.setU16(SLOT7.bannerSel, 1);
    ram.setU16(SLOT7.work + SLOT7.innerAt, 1);
    const shift0 = ram.u16(SLOT7.palShift);
    objSlot7(ram, rom, a5, ctx);
    assert.equal(ram.u8(SLOT7.flash), 0, '1 -> 0, no borrow');
    assert.equal(ram.u16(SLOT7.palShift), shift0, '  ...so the palette did not shift yet');
    objSlot7(ram, rom, a5, ctx);
    assert.equal(ram.u8(SLOT7.flash), 1, '0 -> borrow -> reloaded from the adjacent byte');
    assert.equal(ram.u16(SLOT7.palShift), shift0 ^ 1, '  ...and NOW the palette shifted');
  });

test('W373 $2901E0: the two vetoes short-circuit before any side effect', { skip: SKIP }, async () => {
  const { GATE2901E0 } = await fixture();
  for (const veto of [GATE2901E0.vetoA, GATE2901E0.vetoB]) {
    const f = await fixture();
    f.ram.setU16(veto, 1);
    f.ram.setU16(0x81b646, 0x1234);   // what $253A0A would clear
    assert.equal(f.menuGate2901E0(f.ram, f.rom, f.ctx), false,
      `$${veto.toString(16)} non-zero closes the gate`);
    assert.equal(f.ram.u16(0x81b646), 0x1234,
      '  ...and returned before $253A0A could clear anything');
  }
});

test('W373 $2901E0 clears sixteen words in two interleaved side lists', { skip: SKIP }, async () => {
  const { menuGate2901E0, GATE_CLEARS, ram, rom, ctx } = await fixture();
  for (const a of [...GATE_CLEARS.p1, ...GATE_CLEARS.p2]) ram.setU16(a, 0xffff);
  menuGate2901E0(ram, rom, ctx);
  for (const a of [...GATE_CLEARS.p1, ...GATE_CLEARS.p2]) {
    assert.equal(ram.u16(a), 0, `$${a.toString(16)} cleared`);
  }
  // The two lists must not be the same list: every P1 address has a P2 neighbour, none shared.
  assert.equal(new Set([...GATE_CLEARS.p1, ...GATE_CLEARS.p2]).size, 16, 'sixteen distinct words');
});

test('W373 $2901E0\'s three final compares are an OR, not an AND', { skip: SKIP }, async () => {
  // Set up a state where all three would FAIL, then relax each one alone. If the compares were an
  // AND, relaxing one would not be enough.
  async function shut() {
    const f = await fixture();
    f.ram.setU16(f.GATE2901E0.beeCursor, 0x0b);              // < $C
    f.ram.setU16(f.GATE2901E0.dropP1, 5);                    // >= 2
    f.ram.setU16(f.GATE2901E0.bombP1, 9);                    // >= 3
    return f;
  }
  const base = await shut();
  assert.equal(base.menuGate2901E0(base.ram, base.rom, base.ctx), false, 'all three shut');

  const a = await shut(); a.ram.setU16(a.GATE2901E0.beeCursor, 0x0c);
  assert.equal(a.menuGate2901E0(a.ram, a.rom, a.ctx), true, 'the bee cursor alone opens it');
  const b = await shut(); b.ram.setU16(b.GATE2901E0.dropP1, 1);
  assert.equal(b.menuGate2901E0(b.ram, b.rom, b.ctx), true, 'the drop count alone opens it');
  const c = await shut(); c.ram.setU16(c.GATE2901E0.bombP1, 2);
  assert.equal(c.menuGate2901E0(c.ram, c.rom, c.ctx), true, 'the bomb count alone opens it');
});

test('W373 $2901E0 picks the side by $8130BE\'s SIGN, not by $8103E6', { skip: SKIP }, async () => {
  const p1 = await fixture();
  p1.ram.setU16(p1.GATE2901E0.livesSign, 0x0001);            // PLUS -> keep P1
  p1.ram.setU16(p1.GATE2901E0.digitP1, 1);                   // P1's digit state vetoes
  p1.ram.setU16(p1.GATE2901E0.digitP2, 0);
  assert.equal(p1.menuGate2901E0(p1.ram, p1.rom, p1.ctx), false, 'plus read P1\'s digit state');

  const p2 = await fixture();
  p2.ram.setU16(p2.GATE2901E0.livesSign, 0x8000);            // MINUS -> switch to P2
  p2.ram.setU16(p2.GATE2901E0.digitP1, 1);
  p2.ram.setU16(p2.GATE2901E0.digitP2, 0);
  p2.ram.setU16(p2.GATE2901E0.beeCursor, 0x0c);
  assert.equal(p2.menuGate2901E0(p2.ram, p2.rom, p2.ctx), true,
    'minus ignored P1\'s veto and read P2\'s zero');
});

test('W373 $2901E0 stores the mark THROUGH the pointer, on the selected side', { skip: SKIP }, async () => {
  const f = await fixture();
  f.ram.setU16(f.GATE2901E0.livesSign, 0x0001);
  f.ram.setU16(f.GATE2901E0.dropP1, 0);                      // D3 zero -> the store fires
  f.menuGate2901E0(f.ram, f.rom, f.ctx);
  assert.equal(f.ram.u16(f.GATE2901E0.markP1), 1, 'P1\'s mark written');
  assert.equal(f.ram.u16(f.GATE2901E0.markP2), 0, '  ...and P2\'s left alone');

  const g = await fixture();
  g.ram.setU16(g.GATE2901E0.livesSign, 0x8000);
  g.ram.setU16(g.GATE2901E0.dropP2, 0);
  g.menuGate2901E0(g.ram, g.rom, g.ctx);
  assert.equal(g.ram.u16(g.GATE2901E0.markP2), 1, 'the pointer followed the side select');
  assert.equal(g.ram.u16(g.GATE2901E0.markP1), 0);
});

test('W373 the gate actually opens slot [7]\'s menu through state 0', { skip: SKIP }, async () => {
  const f = await fixture({ players: 1 });
  // Both sides live vetoes it, so leave $813090 alone and open the bee arm.
  f.ram.setU16(f.GATE2901E0.beeCursor, 0x0c);
  f.objSlot7(f.ram, f.rom, f.a5, f.ctx);
  assert.equal(f.ram.u16(f.SLOT7.work + f.SLOT7.innerAt), 4,
    'state 0 put the slot into inner state 4, the $2911B0 menu');

  const g = await fixture({ players: 1 });
  g.ram.setU16(g.GATE2901E0.vetoA, 1);                       // $813098 shuts it
  g.objSlot7(g.ram, g.rom, g.a5, g.ctx);
  assert.notEqual(g.ram.u16(g.SLOT7.work + g.SLOT7.innerAt), 4,
    'and with the gate shut it runs a sequence instead');
});

test('W373 $2901E0 really runs the hyper end, per side, only when that side is active',
  { skip: SKIP }, async () => {
    // Both sides idle: endHyper285AF2 must not be reached, so nothing it clears changes.
    const idle = await fixture();
    idle.ram.setU16(0x81b642, 0x1234);                       // P1's gauge, cleared by the hyper end
    idle.menuGate2901E0(idle.ram, idle.rom, idle.ctx);
    assert.equal(idle.ram.u16(0x81b642), 0x1234, 'idle side: the hyper end was not called');

    // P1 active ($81B63E non-zero) -- the guarded call fires and clears P1's block.
    const p1 = await fixture();
    p1.ram.setU16(0x81b63e, 1);
    p1.ram.setU16(0x81b642, 0x1234);
    p1.menuGate2901E0(p1.ram, p1.rom, p1.ctx);
    assert.equal(p1.ram.u16(0x81b642), 0, 'P1 active: the hyper end ran and cleared its gauge');
    assert.equal(p1.ram.u16(0x81b6fa), 0x48, '  ...and armed the end flash at $81B6FA');
    assert.equal(p1.ram.u16(0x81b6fc), 0, '  ...and did NOT touch P2\'s flash word');

    // P2 active takes the mirror, writing $81B6FC instead.
    const p2 = await fixture();
    p2.ram.setU16(0x81b640, 1);
    p2.menuGate2901E0(p2.ram, p2.rom, p2.ctx);
    assert.equal(p2.ram.u16(0x81b6fc), 0x48, 'P2 active: the mirror armed $81B6FC');
    assert.equal(p2.ram.u16(0x81b6fa), 0, '  ...and left P1\'s alone');
  });

test('W373 the hyper end does not change what $2901E0 ANSWERS', { skip: SKIP }, async () => {
  // The whole reason the six calls could be deferred safely. Now that they are real, prove it:
  // the same inputs give the same answer whether or not a side is mid-hyper.
  for (const bee of [0x0b, 0x0c]) {
    const off = await fixture();
    off.ram.setU16(off.GATE2901E0.beeCursor, bee);
    off.ram.setU16(off.GATE2901E0.dropP1, 5);
    off.ram.setU16(off.GATE2901E0.bombP1, 9);
    const a = off.menuGate2901E0(off.ram, off.rom, off.ctx);

    const on = await fixture();
    on.ram.setU16(on.GATE2901E0.beeCursor, bee);
    on.ram.setU16(on.GATE2901E0.dropP1, 5);
    on.ram.setU16(on.GATE2901E0.bombP1, 9);
    on.ram.setU16(0x81b63e, 1);                              // mid-hyper
    on.ram.setU16(0x81b640, 1);
    const b = on.menuGate2901E0(on.ram, on.rom, on.ctx);

    assert.equal(a, b, `bee $${bee.toString(16)}: the hyper end is side effects only`);
  }
});
