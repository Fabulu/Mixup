// VRAM script interpreter.  ROM: sub_00_0A0E + sub_00_0A14, master-ref §7.6.
//
// Modes 0, 1 and 2 are also proved end-to-end against the cartridge -- see
// tools/oracle/vramscript.py and vramdiff.mjs, which compare the whole write
// stream (address, value AND order) for the title build and six level inits.
// Mode 3 and the count-of-zero wrap are NOT reachable in any recorded path, so
// they are transcribed from the instructions and pinned here instead.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runVramScript, vramScriptLength,
  VS_COPY_H, VS_RLE_H, VS_COPY_V, VS_RLE_V,
} from '../src/vramscript.js';

const ctrl = (mode, count) => ((mode & 3) << 6) | (count & 0x3F);

/** Run one record and collect the writes. */
function run(bytes) {
  const vram = new Uint8Array(0x2000);
  const writes = [];
  const end = runVramScript(vram, Uint8Array.from(bytes),
    { onWrite: (a, v) => writes.push([a, v]) });
  return { vram, writes, end };
}

test('a destHi of $00 terminates immediately', () => {
  // $0A0F: CP $00 / JR NZ -- the very first byte ends an empty script.
  const { writes, end } = run([0x00]);
  assert.equal(writes.length, 0);
  assert.equal(end, 1);
});

test('the destination is BIG-endian, unlike every other 16-bit value', () => {
  // $0A05 takes the FIRST byte as H. Reading it little-endian would put this
  // write at $1398 instead of $9813.
  const { writes } = run([0x98, 0x13, ctrl(VS_COPY_H, 1), 0xAC, 0x00]);
  assert.deepEqual(writes, [[0x9813, 0xAC]]);
});

test('mode 0 copies count bytes to consecutive addresses', () => {
  const { writes } = run([0x98, 0x00, ctrl(VS_COPY_H, 3), 0x11, 0x22, 0x33, 0x00]);
  assert.deepEqual(writes, [[0x9800, 0x11], [0x9801, 0x22], [0x9802, 0x33]]);
});

test('mode 1 repeats ONE byte along the row', () => {
  const { writes } = run([0x98, 0x00, ctrl(VS_RLE_H, 4), 0x2F, 0x00]);
  assert.deepEqual(writes,
    [[0x9800, 0x2F], [0x9801, 0x2F], [0x9802, 0x2F], [0x9803, 0x2F]]);
});

test('mode 2 copies down a column, $20 apart', () => {
  const { writes } = run([0x98, 0x05, ctrl(VS_COPY_V, 3), 0xA0, 0xA1, 0xA2, 0x00]);
  assert.deepEqual(writes,
    [[0x9805, 0xA0], [0x9825, 0xA1], [0x9845, 0xA2]]);
});

test('mode 3 repeats ONE byte down a column', () => {
  // $0A42 re-reads [DE] every pass without advancing it; the single INC DE
  // happens once at $0A4D. Consuming a byte per pass instead would desync the
  // rest of the script.
  const { writes, end } = run([0x98, 0x05, ctrl(VS_RLE_V, 3), 0x7E, 0x00]);
  assert.deepEqual(writes,
    [[0x9805, 0x7E], [0x9825, 0x7E], [0x9845, 0x7E]]);
  assert.equal(end, 5, 'exactly one payload byte consumed');
});

test('a count of 0 means 256, not nothing', () => {
  // Every mode loops DEC B / JR NZ, so B = 0 goes all the way round. ctrl $00
  // can never reach this (destHi $00 already terminated) but $40 can.
  const { writes } = run([0x98, 0x00, ctrl(VS_RLE_H, 0), 0x5A, 0x00]);
  assert.equal(writes.length, 256);
  assert.deepEqual(writes[0], [0x9800, 0x5A]);
  assert.deepEqual(writes[255], [0x98FF, 0x5A]);
});

test('records run back to back until the terminator', () => {
  const { writes, end } = run([
    0x98, 0x00, ctrl(VS_COPY_H, 2), 0x01, 0x02,
    0x99, 0x00, ctrl(VS_RLE_H, 2), 0xFF,
    0x00,
  ]);
  assert.deepEqual(writes,
    [[0x9800, 0x01], [0x9801, 0x02], [0x9900, 0xFF], [0x9901, 0xFF]]);
  assert.equal(end, 10);
});

test('vramScriptLength agrees with where the interpreter stops', () => {
  const bytes = [
    0x98, 0x00, ctrl(VS_COPY_V, 3), 0x01, 0x02, 0x03,
    0x9A, 0x40, ctrl(VS_RLE_V, 9), 0x7E,
    0x00,
  ];
  assert.equal(vramScriptLength(Uint8Array.from(bytes)), bytes.length);
  assert.equal(run(bytes).end, bytes.length);
});

test('a script with no terminator is a loud failure, not a silent walk-off', () => {
  assert.throws(() => vramScriptLength(Uint8Array.from([0x98, 0x00, ctrl(VS_COPY_H, 2), 1, 2])),
    /ran off the end/);
});

test('writes outside the VRAM window are reported but not stored', () => {
  // The vertical modes step $20 at a time and can walk past $9FFF. The
  // cartridge would write wherever it lands; the port must not index out of
  // its own buffer over it.
  const vram = new Uint8Array(0x2000);
  const writes = [];
  runVramScript(vram, Uint8Array.from([0x9F, 0xE0, ctrl(VS_COPY_V, 3), 1, 2, 3, 0x00]),
    { onWrite: (a, v) => writes.push([a, v]) });
  assert.equal(writes.length, 3);
  assert.equal(vram[0x1FE0], 1);
  assert.deepEqual(writes[1], [0xA000, 2]);   // past the window, still reported
});
