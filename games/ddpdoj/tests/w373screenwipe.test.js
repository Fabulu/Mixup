// W373 -- $23C6C6, the full screen wipe. Six identical clears and three pure compositions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const SKIP = existsSync('games/ddpdoj/rip/sound/maincpu.bin') ? false : 'no rip';

test('W373 the six clears are ONE routine six times, and dbra makes each N+1 longs',
  { skip: SKIP }, async () => {
    const { readFileSync } = await import('node:fs');
    const IMG = readFileSync('games/ddpdoj/rip/sound/maincpu.bin');
    // lea <base>,A0 / move.w #<n>,D0 / move.l #$0,(A0)+ / dbra D0,-8 / rts
    const want = [
      [0x23c638, 0x900000, 0x0fff], [0x23c652, 0x800000, 0x027f],
      [0x23c668, 0x907000, 0x00ff], [0x23c67e, 0xa01000, 0x007f],
      [0x23c694, 0xa00800, 0x01ff], [0x23c6aa, 0xa00000, 0x01ff],
    ];
    for (const [at, base, n] of want) {
      assert.equal(IMG.readUInt16BE(at), 0x41f9, `$${at.toString(16)} opens lea abs.l,A0`);
      assert.equal(IMG.readUInt32BE(at + 2), base, `  ...with base $${base.toString(16)}`);
      assert.equal(IMG.readUInt16BE(at + 6), 0x303c, '  ...then move.w #imm,D0');
      assert.equal(IMG.readUInt16BE(at + 8), n, `  ...of $${n.toString(16)}`);
      assert.equal(IMG.readUInt32BE(at + 10), 0x20fc0000, '  ...then move.l #$0,(A0)+');
      assert.equal(IMG.readUInt16BE(at + 16), 0x51c8, '  ...then dbra D0');
      assert.equal(IMG.readUInt16BE(at + 20), 0x4e75, '  ...then rts');
    }
  });

test('W373 the wipe clears low RAM and leaves the word past it alone', { skip: SKIP }, async () => {
  const { screenWipe23C6C6, WIPE23C6C6, BgVram, TxVram, VideoRegs, SlotTable907000 }
    = await import('../src/background.js');
  const { Ram } = await import('../src/ram.js');
  const ram = new Ram();
  const notes = [];
  const ctx = { videoRegs: new VideoRegs(), tx: new TxVram(), bgVram: new BgVram(),
    slotTable: new SlotTable907000(), unported: { note: (a) => notes.push(a) } };

  const end = WIPE23C6C6.lowRam + WIPE23C6C6.lowRamLongs * 4;
  for (let a = WIPE23C6C6.lowRam; a < end + 8; a += 4) ram.setU32(a, 0xdeadbeef);
  screenWipe23C6C6(ram, ctx);
  for (let a = WIPE23C6C6.lowRam; a < end; a += 4) {
    assert.equal(ram.u32(a), 0, `$${a.toString(16)} cleared`);
  }
  assert.equal(ram.u32(end), 0xdeadbeef, '$027F + dbra is 640 longs, and the 641st is untouched');
});

test('W373 the wipe resets the scrolls and empties the TX map', { skip: SKIP }, async () => {
  const { screenWipe23C6C6, BgVram, TxVram, VideoRegs, SlotTable907000 }
    = await import('../src/background.js');
  const { Ram } = await import('../src/ram.js');
  const ram = new Ram();
  const tx = new TxVram();
  tx.setLong(0x904000, 0x11223344);
  tx.setLong(0x904000 + 2047 * 4, 0x55667788);
  const regs = new VideoRegs();
  regs.tx_yscroll = 9; regs.bg_xscroll = 9;
  const ctx = { videoRegs: regs, tx, bgVram: new BgVram(), slotTable: new SlotTable907000(),
    unported: { note: () => {} } };
  screenWipe23C6C6(ram, ctx);
  assert.equal(regs.tx_yscroll, 0);
  assert.equal(regs.tx_xscroll, 1, 'tx_xscroll resets to ONE, not zero');
  assert.equal(regs.bg_xscroll, 0);
  assert.equal(tx.long(0x904000), 0, 'first TX long');
  assert.equal(tx.long(0x904000 + 2047 * 4), 0, 'and the LAST one -- 2048, not 2047');
});

test('W373 the three $A0xxxx clears are noted with their exact extents', { skip: SKIP }, async () => {
  const { screenWipe23C6C6, WIPE23C6C6, BgVram, TxVram, VideoRegs, SlotTable907000 }
    = await import('../src/background.js');
  const { Ram } = await import('../src/ram.js');
  const notes = [];
  const ctx = { videoRegs: new VideoRegs(), tx: new TxVram(), bgVram: new BgVram(),
    slotTable: new SlotTable907000(), unported: { note: (a, w) => notes.push([a, w]) } };
  screenWipe23C6C6(new Ram(), ctx);
  assert.deepEqual(notes.map((n) => n[0]), WIPE23C6C6.hw.map((h) => h.addr),
    'one note per routine, in the order the cartridge calls them');
  for (const [i, h] of WIPE23C6C6.hw.entries()) {
    assert.match(notes[i][1], new RegExp(h.base.toString(16).toUpperCase()),
      'the note names the base it would have cleared');
  }

  // And with a model supplied, they become real calls instead of notes.
  const seen = [];
  const ctx2 = { videoRegs: new VideoRegs(), tx: new TxVram(), bgVram: new BgVram(),
    slotTable: new SlotTable907000(), unported: { note: () => { throw new Error('noted'); } },
    hwVram: { clear: (b, n) => seen.push([b, n]) } };
  screenWipe23C6C6(new Ram(), ctx2);
  assert.deepEqual(seen, [[0xa01000, 512], [0xa00800, 2048], [0xa00000, 2048]],
    'each region cleared with its byte length');
});
