// W373 -- object dispatch [13], $288A60, driven. Five states, three of them below the dispatch
// address, and two selection routines that look like one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = existsSync(ROM) ? false : 'no rip';

async function fx({ side = 0 } = {}) {
  const mod = await import('../src/objslot13.js');
  const { Ram } = await import('../src/ram.js');
  const IMG = readFileSync(ROM);
  const rom = { u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
    bytes: (a, n) => IMG.subarray(a, a + n) };
  const ram = new Ram();
  const notes = [];
  const ctx = { unported: { note: (a) => notes.push(a) }, unportedLog: { note: () => {} },
    soundPost: () => {}, clear24631C: () => {}, menuCarry28D53C: () => false };
  const a5 = 0x812600;
  ram.setU8(a5 + mod.SCREEN13.side, side);
  return { ...mod, ram, rom, ctx, notes, a5 };
}

test('W373 slot [13] is $288A60 in the dispatch table', { skip: SKIP }, async () => {
  const { SCREEN13, rom } = await fx();
  assert.equal(rom.u32(SCREEN13.dispatch + 13 * 8), SCREEN13.entry);
  assert.equal(rom.u16(SCREEN13.dispatch + 13 * 8 + 4), 0x0b, 'an 11-byte record');
});

test('W373 the two descriptors are the slot [11] family, per side', { skip: SKIP }, async () => {
  const { SCREEN13, rom } = await fx();
  // Three code pointers and a RAM block, and the P2 record is the P1 record's sibling throughout.
  assert.equal(rom.u32(SCREEN13.descA + SCREEN13.dEdge), 0x23d186, 'side 0 edge read');
  assert.equal(rom.u32(SCREEN13.descB + SCREEN13.dEdge), 0x23d18e, 'side 1 edge read');
  assert.equal(rom.u32(SCREEN13.descA + SCREEN13.dRaw), 0x23d16c, 'side 0 raw read');
  assert.equal(rom.u32(SCREEN13.descB + SCREEN13.dRaw), 0x23d17e, 'side 1 raw read');
  assert.equal(rom.u32(SCREEN13.descA + SCREEN13.dRam), 0x81b710);
  assert.equal(rom.u32(SCREEN13.descB + SCREEN13.dRam), 0x81b726);
  assert.equal(SCREEN13.descB - SCREEN13.descA, SCREEN13.descSize, 'and they are adjacent');
});

test('W373 state 0 picks the descriptor by SIDE and stamps the mark', { skip: SKIP }, async () => {
  const p1 = await fx({ side: 0 });
  p1.objSlot13(p1.ram, p1.rom, p1.a5, p1.ctx);
  assert.equal(p1.ram.u32(p1.a5 + p1.SCREEN13.desc), p1.SCREEN13.descA, 'side 0 -> $28898A');
  assert.equal(p1.ram.u8(p1.a5 + p1.SCREEN13.state), 1, 'and it advanced');
  // The mark is one word literal used as two byte fields, and only the HIGH byte reaches RAM.
  assert.equal(p1.ram.u16(p1.a5 + p1.SCREEN13.mark), p1.SCREEN13.markValue);
  assert.equal(p1.ram.u8(0x81b710), 0x09, 'side 0\'s block got $09, the high half');

  const p2 = await fx({ side: 1 });
  p2.objSlot13(p2.ram, p2.rom, p2.a5, p2.ctx);
  assert.equal(p2.ram.u32(p2.a5 + p2.SCREEN13.desc), p2.SCREEN13.descB, 'side 1 -> $28899E');
  assert.equal(p2.ram.u8(0x81b726), 0x09, 'and the mark followed the descriptor');
  assert.equal(p2.ram.u8(0x81b710), 0, '  ...leaving side 0 alone');
});

test('W373 the per-side opener is a PAIR, not one routine with an argument', { skip: SKIP }, async () => {
  const p1 = await fx({ side: 0 });
  p1.objSlot13(p1.ram, p1.rom, p1.a5, p1.ctx);
  assert.ok(p1.notes.includes(0x287b0e), 'side 0 notes $287B0E');
  const p2 = await fx({ side: 1 });
  p2.objSlot13(p2.ram, p2.rom, p2.a5, p2.ctx);
  assert.ok(p2.notes.includes(0x287b54), 'side 1 notes $287B54, a different address');
});

test('W373 $25FE00 needs BOTH conditions and the second is an equality', { skip: SKIP }, async () => {
  const { runGate25FE00, ram } = await fx();
  ram.setU16(0x813142, 0);
  ram.setU16(0x81308e, 0xffff);
  assert.equal(runGate25FE00(ram), true, 'both hold');
  ram.setU16(0x813142, 1);
  assert.equal(runGate25FE00(ram), false, 'the first closes it');
  ram.setU16(0x813142, 0);
  for (const v of [0x0000, 0x0001, 0xfffe, 0x7fff]) {
    ram.setU16(0x81308e, v);
    assert.equal(runGate25FE00(ram), false, `$${v.toString(16)} is not $FFFF -- zero included`);
  }
});

test('W373 $288598 writes only on CHANGE, so the flag word survives a repeat',
  { skip: SKIP }, async () => {
    const { selectSet288598, SCREEN13, ram } = await fx();
    selectSet288598(ram, 3, 0);
    assert.equal(ram.u16(SCREEN13.selA), 3);
    assert.equal(ram.u16(SCREEN13.selA + 4), 0, 'the side was stored');

    ram.setU16(SCREEN13.selA + 2, 0xbeef);                   // something set the flag meanwhile
    selectSet288598(ram, 3, 0);                              // the SAME selection again
    assert.equal(ram.u16(SCREEN13.selA + 2), 0xbeef,
      'a repeat wrote nothing at all -- clearing unconditionally would destroy the flag');
    selectSet288598(ram, 1, 0);
    assert.equal(ram.u16(SCREEN13.selA + 2), 0, 'and a real change does clear it');
  });

test('W373 $2885C6 ADVANCES and refuses an empty block', { skip: SKIP }, async () => {
  const { selectAdvance2885C6, SCREEN13, ram } = await fx();
  assert.equal(ram.u16(SCREEN13.selA), 0);
  selectAdvance2885C6(ram, 0);
  assert.equal(ram.u16(SCREEN13.selA), 0, 'an empty block is left alone -- it cannot START anything');

  ram.setU16(SCREEN13.selA, 1);
  selectAdvance2885C6(ram, 0);
  assert.equal(ram.u16(SCREEN13.selA), 2, '1 advances to 2');
  selectAdvance2885C6(ram, 0);
  assert.equal(ram.u16(SCREEN13.selA), 4, 'and anything else advances to 4');
  selectAdvance2885C6(ram, 0);
  assert.equal(ram.u16(SCREEN13.selA), 4, '4 stays 4');
});

test('W373 $2885C6 writes SIDE 0\'s block for side 1 when side 0 holds 3', { skip: SKIP }, async () => {
  const { selectAdvance2885C6, SCREEN13, ram } = await fx();
  ram.setU16(SCREEN13.selA, 3);                              // side 0 sitting at 3
  ram.setU16(SCREEN13.selB, 1);
  selectAdvance2885C6(ram, 1);                               // called for SIDE 1
  assert.equal(ram.u16(SCREEN13.selA), 4,
    'the branch jumped PAST the lea, so side 0\'s block was written');
  assert.equal(ram.u16(SCREEN13.selB), 1, 'and side 1\'s was not touched');
  assert.equal(ram.u16(SCREEN13.selA + 4), 1, 'with side 1 recorded in side 0\'s record');

  // With side 0 at anything else, side 1 gets its own block as expected.
  const b = await fx();
  b.ram.setU16(SCREEN13.selA, 2);
  b.ram.setU16(SCREEN13.selB, 1);
  b.selectAdvance2885C6(b.ram, 1);
  assert.equal(b.ram.u16(SCREEN13.selB), 2, 'side 1 advanced its own block');
  assert.equal(b.ram.u16(SCREEN13.selA), 2, 'and side 0 was left alone');
});

test('W373 state 3 sets state 2 and runs state 2 in the SAME frame', { skip: SKIP }, async () => {
  const { objSlot13, SCREEN13, ram, rom, ctx, a5 } = await fx();
  ram.setU32(a5 + SCREEN13.desc, SCREEN13.descA);
  ram.setU16(SCREEN13.selA, 1);
  ram.setU8(a5 + SCREEN13.state, 3);
  ram.setU16(a5 + 0x00, 0x50);
  objSlot13(ram, rom, a5, ctx);
  assert.equal(ram.u8(a5 + SCREEN13.state), 2, 'state 3 set state 2');
  assert.equal(ram.u8(0x81b710), 0x09, '  ...stamped the mark');
  assert.equal(ram.u16(SCREEN13.selA), 2, '  ...AND fell through into state 2\'s advance');
});

test('W373 state 4 hands over to slot [14] with the table priority', { skip: SKIP }, async () => {
  const { objSlot13, SCREEN13, ram, rom, ctx, a5 } = await fx();
  const { ALLOC } = await import('../src/objalloc.js');
  ram.setU8(a5 + SCREEN13.state, 4);
  objSlot13(ram, rom, a5, ctx);
  assert.equal(ram.u16(ALLOC.createStage + ALLOC.typeOff), (SCREEN13.childType | 0x8000) >>> 0,
    'staged dispatch type $E, which is slot [14]');
  assert.equal(ram.u16(ALLOC.createStage + ALLOC.priOff),
    rom.u16(SCREEN13.dispatch + SCREEN13.childType * 8 + 4),
    'with the DISPATCH TABLE priority, not a constant');
});

test('W373 the three state-1 gates disagree about what closed means', { skip: SKIP }, async () => {
  // Only $803809 being non-zero lets the screen run at all, and $813098/$813092 together send it
  // out. Each is a different kind of test, which is why they are transcribed separately.
  const shut = await fx();
  shut.ram.setU8(shut.a5 + shut.SCREEN13.state, 1);
  shut.ram.setU32(shut.a5 + shut.SCREEN13.desc, shut.SCREEN13.descA);
  shut.ram.setU8(shut.SCREEN13.dip, 0);                      // the DIP alone closes it
  shut.objSlot13(shut.ram, shut.rom, shut.a5, shut.ctx);
  assert.notEqual(shut.ram.u8(shut.a5 + shut.SCREEN13.state), 1,
    'a zero DIP takes the exit arm immediately');

  const open = await fx();
  open.ram.setU8(open.a5 + open.SCREEN13.state, 1);
  open.ram.setU32(open.a5 + open.SCREEN13.desc, open.SCREEN13.descA);
  open.ram.setU8(open.SCREEN13.dip, 1);
  open.ram.setU16(open.SCREEN13.gateA, 1);
  open.ram.setU16(open.SCREEN13.gateB, open.SCREEN13.gateBValue);
  open.objSlot13(open.ram, open.rom, open.a5, open.ctx);
  assert.notEqual(open.ram.u8(open.a5 + open.SCREEN13.state), 1,
    'and $813098 non-zero WITH $813092 == 4 also exits');
});
