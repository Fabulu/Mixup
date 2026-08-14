// W373 -- object dispatch [17], $25CEB8, driven. The screen slot [7] forks into.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

async function fx({ p1 = false, p2 = false, palette = false } = {}) {
  const mod = await import('../src/objslot17.js');
  const { Ram } = await import('../src/ram.js');
  const { TxVram } = await import('../src/background.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n) };
  const ram = new Ram();
  const notes = [];
  const ctx = { unported: { note: (a) => notes.push(a) }, unportedLog: { note: () => {} },
    tx: new TxVram(), soundPost: () => {} };
  if (palette) {
    const { PaletteState } = await import('../src/palette.js');
    ctx.palette = new PaletteState();
  }
  if (p1) ram.setU16(mod.SCREEN17.p1, 0x8000);
  if (p2) ram.setU16(mod.SCREEN17.p2, 0x8000);
  return { ...mod, ram, rom, ctx, notes, a5: 0x812800 };
}

test('W373 slot [17] is $25CEB8 and slot [7] stages it', { skip: SKIP }, async () => {
  const { SCREEN17, rom } = await fx();
  assert.equal(rom.u32(SCREEN17.dispatch + 17 * 8), SCREEN17.entry);
  const { SLOT7 } = await import('../src/objslot7pool.js');
  assert.equal(SLOT7.nextChosen, 17, 'slot [7] forks to type $11, which is this slot');
});

test('W373 state 0 clears exactly two $70 records and no more', { skip: SKIP }, async () => {
  const { objSlot17, SCREEN17, ram, rom, ctx, a5 } = await fx();
  const end = SCREEN17.recs + SCREEN17.recCount * SCREEN17.recStride;
  for (let a = SCREEN17.recs; a < end + 8; a += 2) ram.setU16(a, 0xbeef);
  objSlot17(ram, rom, a5, ctx);
  // $6F + dbra is 112 words = $E0 = exactly two records. The word AT `end` is $812F80, which
  // $25CCC0 deliberately clears, so the probe has to sit past that one.
  // $812F80 and $812F82 are both cleared deliberately ($25CCC0 and $25CC52), so the probe sits
  // past BOTH of them.
  assert.equal(end, SCREEN17.flagC, "  ($812F80 is $25CCC0's flag)");
  assert.equal(end + 2, SCREEN17.flagA, "  ($812F82 is $25CC52's)");
  assert.equal(ram.u16(end + 4), 0xbeef, 'nothing past those two was touched');
  assert.equal(SCREEN17.recWords * 2, SCREEN17.recCount * SCREEN17.recStride,
    'and 112 words IS two $70 records');
});

test('W373 state 0 seeds the per-record fields, including the lone non-zero', { skip: SKIP }, async () => {
  const { objSlot17, SCREEN17, ram, rom, ctx, a5 } = await fx();
  objSlot17(ram, rom, a5, ctx);
  for (let r = 0; r < SCREEN17.recCount; r++) {
    const a0 = SCREEN17.recs + r * SCREEN17.recStride;
    assert.equal(ram.u32(a0 + 0x56), 0xffffffff, `record ${r} $56 is the sentinel`);
    assert.equal(ram.u16(a0 + 0x64), 1, `record ${r} $64 is ONE -- the only non-zero word`);
    assert.equal(ram.u16(a0 + 0x6a), 2, `record ${r} $6A`);
    assert.equal(ram.u16(a0 + 0x6c), 0x140, `record ${r} $6C`);
    assert.equal(ram.u16(a0 + 0x60), 0);
    assert.equal(ram.u16(a0 + 0x66), 0);
  }
});

test('W373 the six object bytes are per-side PAIRS, not two blocks', { skip: SKIP }, async () => {
  const p1 = await fx({ p1: true });
  p1.ram.setU16(p1.SCREEN17.p1SrcA, 0x11);
  p1.ram.setU16(p1.SCREEN17.p1SrcB, 0x22);
  p1.objSlot17(p1.ram, p1.rom, p1.a5, p1.ctx);
  // P1 takes the EVEN offsets and leaves every odd one at the $FF state 0 wrote.
  assert.equal(p1.ram.u8(p1.a5 + 0x08), 0x11, 'P1 -> $8');
  assert.equal(p1.ram.u8(p1.a5 + 0x04), 0x22, 'P1 -> $4');
  assert.equal(p1.ram.u8(p1.a5 + 0x06), 0x22, 'P1 -> $6, the SAME source as $4');
  for (const odd of [0x05, 0x07, 0x09]) {
    assert.equal(p1.ram.u8(p1.a5 + odd), 0xff, `$${odd.toString(16)} still $FF`);
  }

  const p2 = await fx({ p2: true });
  p2.ram.setU16(p2.SCREEN17.p2SrcA, 0x33);
  p2.ram.setU16(p2.SCREEN17.p2SrcB, 0x44);
  p2.objSlot17(p2.ram, p2.rom, p2.a5, p2.ctx);
  assert.equal(p2.ram.u8(p2.a5 + 0x09), 0x33, 'P2 -> $9');
  assert.equal(p2.ram.u8(p2.a5 + 0x05), 0x44, 'P2 -> $5');
  assert.equal(p2.ram.u8(p2.a5 + 0x07), 0x44, 'P2 -> $7');
  for (const even of [0x04, 0x06, 0x08]) {
    assert.equal(p2.ram.u8(p2.a5 + even), 0xff, `$${even.toString(16)} still $FF`);
  }
});

test('W373 P1 wins when both sides are live, and seeds record 0', { skip: SKIP }, async () => {
  const both = await fx({ p1: true, p2: true });
  both.objSlot17(both.ram, both.rom, both.a5, both.ctx);
  assert.equal(both.ram.u8(both.SCREEN17.recs), 1, 'record 0 was seeded');
  assert.equal(both.ram.u8(both.SCREEN17.recs + both.SCREEN17.recStride), 0,
    'and record 1 was NOT -- the arms are exclusive, P1 first');

  const none = await fx();
  none.objSlot17(none.ram, none.rom, none.a5, none.ctx);
  assert.equal(none.ram.u8(none.SCREEN17.recs), 0, 'neither side live seeds neither record');
});

test('W373 the fifteen palettes install, and the FIRST is a different routine',
  { skip: SKIP }, async () => {
    const { objSlot17, SCREEN17, ram, rom, ctx, a5 } = await fx({ p1: true, palette: true });
    assert.equal(SCREEN17.palettes.length, 15);
    assert.equal(SCREEN17.palettes[0].via, 0x2414be, 'the first goes through $2414BE');
    assert.equal(SCREEN17.palettes.filter((p) => p.via === 0x24150a).length, 14,
      'and the other fourteen through $24150A');
    // Banks must be distinct -- a repeat would mean the extraction double-counted a lea.
    const banks = SCREEN17.palettes.filter((p) => p.via === 0x24150a).map((p) => p.bank);
    assert.equal(new Set(banks).size, banks.length, 'no bank installed twice');
    objSlot17(ram, rom, a5, ctx);                            // must not throw
  });

test('W373 state 0 stages slot [10] with the table priority', { skip: SKIP }, async () => {
  const { objSlot17, SCREEN17, ram, rom, ctx, a5 } = await fx({ p1: true });
  const { ALLOC } = await import('../src/objalloc.js');
  objSlot17(ram, rom, a5, ctx);
  assert.equal(ram.u16(ALLOC.createStage + ALLOC.typeOff), (SCREEN17.childType | 0x8000) >>> 0,
    'type $A is slot [10]');
  assert.equal(ram.u16(ALLOC.createStage + ALLOC.priOff),
    rom.u16(SCREEN17.dispatch + SCREEN17.childType * 8 + 4), 'from the dispatch table');
  assert.equal(ram.u8(a5 + SCREEN17.state), 1, 'and it left state 0');
  // $25CEA2 writes ($4,A0) with A0 still on the staged slot, so it lands on the NEW record and
  // NOT on this object -- whose $4 holds P1's freshly seeded byte.
  assert.equal(ram.u16(ALLOC.createStage + SCREEN17.newRecArm), 0, 'the new record got the zero');
});

test('W373 state 1 runs a sub-handler only when its flag is exactly 1', { skip: SKIP }, async () => {
  const { objSlot17, SCREEN17, ram, rom, ctx, notes, a5 } = await fx({ p1: true });
  objSlot17(ram, rom, a5, ctx);                              // state 0
  notes.length = 0;
  ram.setU8(SCREEN17.recs, 1);                               // record 0 live
  for (const [i, off] of SCREEN17.subFlags.entries()) {
    ram.setU8(SCREEN17.recs + off, i === 1 ? 1 : 2);         // only the second flag is exactly 1
  }
  objSlot17(ram, rom, a5, ctx);
  assert.deepEqual(notes.filter((n) => SCREEN17.subHandlers.includes(n)),
    [SCREEN17.subHandlers[1]], 'a flag of 2 does not run its handler; only 1 does');
});

test('W373 only the FIRST sub-handler also writes ($1,A6)', { skip: SKIP }, async () => {
  const a = await fx({ p1: true });
  a.objSlot17(a.ram, a.rom, a.a5, a.ctx);
  a.ram.setU8(a.SCREEN17.recs, 1);
  a.ram.setU8(a.SCREEN17.recs + a.SCREEN17.subFlags[0], 1);
  a.ram.setU8(a.SCREEN17.recs + 0x01, 0);
  a.objSlot17(a.ram, a.rom, a.a5, a.ctx);
  assert.equal(a.ram.u8(a.SCREEN17.recs + 0x01), a.SCREEN17.firstSetsPhase,
    'the $3 handler set ($1,A6) to 5');

  const b = await fx({ p1: true });
  b.objSlot17(b.ram, b.rom, b.a5, b.ctx);
  b.ram.setU8(b.SCREEN17.recs, 1);
  b.ram.setU8(b.SCREEN17.recs + b.SCREEN17.subFlags[2], 1);
  b.ram.setU8(b.SCREEN17.recs + 0x01, 0);
  b.objSlot17(b.ram, b.rom, b.a5, b.ctx);
  assert.equal(b.ram.u8(b.SCREEN17.recs + 0x01), 0, 'the $6 handler does not');
});

test('W373 state 1 advances only when BOTH records are idle', { skip: SKIP }, async () => {
  const live = await fx({ p1: true });
  live.objSlot17(live.ram, live.rom, live.a5, live.ctx);     // state 0 seeds record 0
  live.objSlot17(live.ram, live.rom, live.a5, live.ctx);
  assert.equal(live.ram.u8(live.a5 + live.SCREEN17.state), 1,
    'record 0 is live, so it stays in state 1');

  const idle = await fx();                                   // neither side, so neither record
  idle.objSlot17(idle.ram, idle.rom, idle.a5, idle.ctx);
  idle.objSlot17(idle.ram, idle.rom, idle.a5, idle.ctx);
  assert.equal(idle.ram.u8(idle.a5 + idle.SCREEN17.state), 2,
    'both idle -> D0 stays 3 -> state 2');
});

test('W373 state 2 clears the flag state 0 raised, then kills', { skip: SKIP }, async () => {
  const { objSlot17, SCREEN17, ram, rom, ctx, a5 } = await fx({ p1: true });
  objSlot17(ram, rom, a5, ctx);
  assert.equal(ram.u16(SCREEN17.flagB), 1, 'state 0 raised $80392C');
  ram.setU8(a5 + SCREEN17.state, 2);
  ram.setU16(a5 + 0x00, 0x60);
  objSlot17(ram, rom, a5, ctx);
  assert.equal(ram.u16(SCREEN17.killFlag), 0, 'state 2 dropped it again');
});
