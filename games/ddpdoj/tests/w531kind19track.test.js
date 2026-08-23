// W531: Stage 4 reaches kind 19's cartridge target-tracking arm.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { BUL, REC } from '../src/bullets.js';
import { CONTINUATIONS } from '../src/mover.js';
import { UnportedLog } from '../src/unported.js';

test('W531 $282B64 crosses the Stage-4 target-track edge', () => {
  const ram = new Ram();
  const base = BUL.pool + 48 * BUL.stride;
  const target = 0x81491c;

  // Exact continuation-entry state from pair {ship:0, style:4}, logic frame 41030.
  ram.setU16(base, 0x8213);
  ram.setU32(base + REC.posA, 0x5a3c026c);
  ram.setU32(base + 0x0a, 0x1c1b68);
  ram.setU32(base + REC.velA, 0);
  ram.setU32(base + REC.continuation, 0x282b64);
  ram.setU32(base + 0x28, 0x033c0c2c);
  ram.setU32(base + 0x2c, target);
  ram.setU32(base + 0x30, 0xff39000c);
  ram.setU8(base + 0x34, 0);
  ram.setU16(target, 0xa040);
  ram.setU32(target + REC.posA, 0x5748f6a8);

  CONTINUATIONS.get(0x282b64)(
    { ram, rom: null, notes: new UnportedLog() }, base);

  assert.deepEqual([
    ram.u16(base), ram.u32(base + REC.posA), ram.u32(base + 0x0a),
    ram.u32(base + REC.velA), ram.u8(base + 0x34),
  ], [0x8a13, 0x5a8502d4, 0x1c1b8c, 0, 0]);
});
