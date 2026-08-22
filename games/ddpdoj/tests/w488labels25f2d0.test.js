import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { TxVram } from '../src/background.js';
import {
  HANDLER6, LABELS_25F2D0, SCREEN17, phase6_25D4F0,
} from '../src/objslot17.js';

const tileAt = (tx, d0, d1) => tx.long(0x904000 + (((d0 << 6) + d1) << 2));

test('W488 $25F2D0 prints both two-line side labels in cartridge order', () => {
  const data = new Map();
  const put = (addr, values) => values.forEach((v, i) => data.set(addr + i, v));
  put(0x25f43a, [0x00, 0x28, 0x00, 0x05]);
  put(0x25f43e, [0x00, 0x0e, 0x00, 0x09]);
  put(0x25f1f0, [0x41, 0x00]);
  put(0x25f200, [0x42, 0x00]);
  const reads = [];
  const rom = {
    u8: (addr) => data.get(addr) ?? 0,
    u16: (addr) => {
      reads.push(addr);
      return ((data.get(addr) ?? 0) << 8) | (data.get(addr + 1) ?? 0);
    },
  };
  const ram = new Ram();
  const tx = new TxVram();
  const notes = [];
  const ctx = { tx, unported: { note: (addr) => notes.push(addr) } };
  ram.setU16(HANDLER6.gate, 1);

  phase6_25D4F0(ram, rom, ctx, SCREEN17.recs, 1);

  assert.deepEqual(LABELS_25F2D0.descriptors, [0x25f43a, 0x25f43e]);
  assert.deepEqual(reads, [0x25f43c, 0x25f43a, 0x25f440, 0x25f43e],
    'D0 is loaded from descriptor +2 before D1, with side 0 printed before side 1');
  assert.deepEqual([
    tileAt(tx, 5, 40), tileAt(tx, 5, 39),
    tileAt(tx, 9, 14), tileAt(tx, 9, 13),
  ], [0xc0410000, 0xc0420000, 0xc0410000, 0xc0420000],
  'the second $10-strided string is one D1 row before the first');
  assert.equal(notes.includes(LABELS_25F2D0.addr), false,
    'phase 6 no longer records $25F2D0 as unported');
});
