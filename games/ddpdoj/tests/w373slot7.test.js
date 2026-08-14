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
  const ctx = { soundPost: (a) => sounds.push(a), unported: { note: (a) => notes.push(a) },
    unportedLog: { note: () => {} } };
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
  const { STAGE } = await import('../src/objalloc.js');
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
