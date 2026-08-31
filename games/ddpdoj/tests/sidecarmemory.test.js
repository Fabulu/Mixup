// Shared strict sidecar memory snapshots for stable external owners.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { RAM } from '../src/machine.js';
import { StrictSidecarMemory } from '../src/sidecarmemory.js';
import { StrictSidecarMemory as FormationSidecarMemory } from '../src/formationactors.js';

const BASE = 0x11000000;

function createMemory(bytes) {
  return new StrictSidecarMemory(new Ram(), {
    virtualRanges: [
      { name: 'head', start: BASE, length: 4 },
      { name: 'tail', start: BASE + 0x100, length: 2 },
    ],
    sharedRanges: [
      { name: 'p1-input', start: RAM.p1raw, length: 2 },
    ],
    bytes,
  });
}

test('sidecar extraction keeps the formation export and strict mixed-memory behavior', () => {
  assert.strictEqual(FormationSidecarMemory, StrictSidecarMemory);
  const memory = createMemory();
  assert.equal(memory.byteLength, 6);
  memory.setU32(BASE, 0x89abcdef);
  memory.setU16(BASE + 0x100, 0x1234);
  assert.deepEqual([
    memory.u16(BASE), memory.u16(BASE + 2), memory.u16(BASE + 0x100),
  ], [0x89ab, 0xcdef, 0x1234]);
  assert.throws(() => memory.u8(BASE + 4), /undeclared virtual address/);
  assert.throws(() => memory.u32(BASE + 0x100), /crosses tail/);
});

test('sidecar snapshots are detached and restore through the original byte owner', () => {
  const storage = new Uint8Array(new ArrayBuffer(12), 3, 6);
  const memory = createMemory(storage);
  memory.setU32(BASE, 0x10203040);
  memory.setU16(BASE + 0x100, 0x5060);

  const snapshot = memory.snapshotBytes();
  assert.ok(snapshot instanceof Uint8Array);
  assert.notStrictEqual(snapshot, storage);
  assert.deepEqual([...snapshot], [0x10, 0x20, 0x30, 0x40, 0x50, 0x60]);
  snapshot[0] = 0xaa;
  assert.equal(memory.u8(BASE), 0x10);

  storage.fill(0xff);
  const owner = storage;
  memory.restoreBytes(snapshot);
  assert.strictEqual(storage, owner);
  assert.deepEqual([...storage], [0xaa, 0x20, 0x30, 0x40, 0x50, 0x60]);
  assert.equal(memory.u32(BASE), 0xaa203040);
});

test('sidecar byte owners and snapshots require exact Uint8Array geometry', () => {
  assert.throws(() => createMemory([]), /sidecar bytes must be a Uint8Array/);
  assert.throws(() => createMemory(new Uint8Array(5)), /exactly 6 bytes/);
  const memory = createMemory();
  assert.throws(() => memory.restoreBytes([]), /snapshot must be a Uint8Array/);
  assert.throws(() => memory.restoreBytes(new Uint8Array(7)), /exactly 6 bytes/);
});
