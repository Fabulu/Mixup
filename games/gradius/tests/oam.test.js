// The display list, against hardware OAM.
//
// The metasprite expander was written from `sub_8AAC`'s bytes, so the check has
// to come from somewhere else: hardware OAM as it stood on a captured frame,
// which is the emulator's copy of what the PPU was actually reading. If the
// record format, the base, the -15-slot walk or the ORA mask is wrong, the four
// bytes at the four slots do not line up.

import test from 'node:test';
import assert from 'node:assert';

import { drawMetasprite, nextSlot } from '../src/oam.js';
import { loadCapture, captureSkipMessage, headlessResources } from './helpers.js';

const res = headlessResources(0);

test('expanding metasprite $01 reproduces the cartridge OAM byte for byte', (t) => {
  const cap = loadCapture('f1200');
  if (!cap) return t.skip(captureSkipMessage('f1200'));

  const baseX = cap.ram[0x360], baseY = cap.ram[0x320];
  const mask = cap.ram[0x180];                       // $0180,X -- the ORA mask
  t.diagnostic(`$0360 = ${baseX}, $0320 = ${baseY}, $0180 = ${mask}`);

  const oam = new Uint8Array(256).fill(0xF4);
  // 188, because $2F reads 4 at this frame and 188 + $44 = 256 -> $8B3E's BNE
  // fails -> +4. The list in hardware OAM was built on the previous frame.
  const end = drawMetasprite(oam, res.metasprites, 1, baseX, baseY, mask, 188);

  let slot = 188;
  for (let i = 0; i < res.metasprites[1].length; i++) {
    const got = [...oam.subarray(slot, slot + 4)];
    const want = [...cap.oam.subarray(slot, slot + 4)];
    assert.deepStrictEqual(got, want, `slot ${slot / 4}: ${got} vs cartridge ${want}`);
    slot = nextSlot(slot);
  }
  assert.strictEqual(end, slot, 'the cursor did not end where the walk did');
  t.diagnostic(`4 records at slots 47, 32, 17, 2 -- all 16 bytes identical`);
});

test('a positive dX that carries is dropped; a negative one is not', () => {
  // $8AE9: BMI $8B03 skips the BCS, so the cull is asymmetric. A record at
  // dx = +8 on a ship at x = 250 vanishes; the same record at dx = -8 wraps
  // and is drawn. That asymmetry is in the ROM and it is not obviously
  // intentional -- it is transcribed, not tidied.
  const table = { 9: [[0, 0x11, 0, 0x08]], 10: [[0, 0x11, 0, 0xF8]] };
  const a = new Uint8Array(256).fill(0);
  const endA = drawMetasprite(a, table, 9, 250, 100, 0, 4);
  assert.strictEqual(endA, 4, 'the culled record advanced the cursor');
  assert.strictEqual(a[7], 0, 'the culled record wrote an X byte');

  const b = new Uint8Array(256).fill(0);
  const endB = drawMetasprite(b, table, 10, 4, 100, 0, 4);
  assert.strictEqual(endB, nextSlot(4), 'the negative record was culled');
  assert.strictEqual(b[7], 0xFC, 'the negative record did not wrap');
});

test('the ORA mask reaches the attribute byte', () => {
  const table = { 9: [[0, 0x11, 0x01, 0]] };
  const o = new Uint8Array(256);
  drawMetasprite(o, table, 9, 10, 20, 0x20, 0);
  assert.strictEqual(o[2], 0x21, '$8AE0 ORA $9E did not happen');
});
