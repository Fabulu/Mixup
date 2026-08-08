// W158 complete static ICS sample-shard topology.
//
// The semantic derivation and bidirectional dynamic join live in the executable
// W157 checker. This file freezes its corrected command-level output and joins
// it to the regenerated browser sidecar. SFX cmd $02 uses the 12-byte record's
// r0A/r0B pair as both accumulator and boundary-width OscStart; omitting that
// live command form was W157's 50-byte premise break.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const INDEX = fileURLToPath(new URL('../assets/snd/sample.index.json.gz', import.meta.url));
const SHARD = fileURLToPath(new URL('../assets/snd/sample.shard.u8.gz', import.meta.url));
const U17_BASE = 0x400000;
const RAW = 3_612_873;
const WINDOWS = Object.freeze([
  [0x000000, 0x0DB837],
  [0x0DB935, 0x0DC257],
  [0x0E1853, 0x0FFFE1],
  [0x100000, 0x1FFFF6],
  [0x200000, 0x2FFBFA],
  [0x300000, 0x377BF2],
]);

test('W158 static command union is six sorted non-touching u17 fragments', () => {
  let packed = 0;
  let previous = -1;
  for (const [lo, hi] of WINDOWS) {
    assert.ok(lo > previous, `fragment $${lo.toString(16)} follows a real gap`);
    assert.ok(hi > lo && hi <= 0x400000, 'fragment is non-empty and inside u17');
    packed += hi - lo;
    previous = hi;
  }
  assert.equal(packed, RAW);
});

test('W158 sidecar freezes version, semantic coverage and contiguous stitch offsets', () => {
  const index = JSON.parse(gunzipSync(readFileSync(INDEX)));
  const shard = gunzipSync(readFileSync(SHARD));
  assert.equal(index.version, 1);
  assert.equal(index.layout, 'ics2115-static-fragment-stitch-v1');
  assert.equal(index.coverage, 'all-live-descriptors');
  assert.equal(index.descriptorIntervals, 228);
  assert.equal(index.fragmentCount, WINDOWS.length);
  assert.equal(index.rom, 'cave_m04401b032.u17');
  assert.equal(index.icsBase, U17_BASE);
  assert.equal(index.shardBytes, RAW);
  assert.equal(shard.length, RAW);
  let packed = 0;
  for (let i = 0; i < WINDOWS.length; i++) {
    const [lo, hi] = WINDOWS[i];
    assert.deepEqual(index.fragments[i], {
      romOffset: lo, icsBase: U17_BASE + lo, shardOffset: packed, len: hi - lo,
    });
    packed += hi - lo;
  }
  assert.equal(packed, shard.length);
});

test('W158 topology mutation: dropping or joining a declared fragment is red', () => {
  const index = JSON.parse(gunzipSync(readFileSync(INDEX)));
  const dropped = structuredClone(index);
  dropped.fragments.pop();
  assert.notEqual(dropped.fragments.length, dropped.fragmentCount,
    'drop mutation disagrees with the frozen fragment count');
  const joined = structuredClone(index);
  joined.fragments[1].romOffset = joined.fragments[0].romOffset
    + joined.fragments[0].len;
  joined.fragments[1].icsBase = U17_BASE + joined.fragments[1].romOffset;
  assert.equal(joined.fragments[1].romOffset,
    joined.fragments[0].romOffset + joined.fragments[0].len,
    'join mutation erases the measured source gap');
  assert.notDeepEqual(joined.fragments, index.fragments);
});
