// W232: the stage-clear banner's zooming entry picture $23F82A (docket D11).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { BUCKETS } from '../src/spritequeue.js';
import { emit23F82A, emitScaled } from '../src/bossarrival.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const manifestPath = new URL('../assets/manifest.json', import.meta.url);
const streamsPath = new URL('../assets/spr/streams.u32.gz', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';
const HAVE_BUNDLE = HAVE && existsSync(manifestPath) && existsSync(streamsPath);
const SKIP_BUNDLE = HAVE_BUNDLE ? false : 'generated assets absent; skip, not pass';

test('W232 the zoom table is eight longwords and its extent is pinned by its cursor',
  { skip: SKIP }, () => {
    // $28ECA2/$28ED24 load $81E028 with 7 and $28ED08/$28ED7A count it down, so
    // entry 7 is live and entry 8 is not.
    const zooms = Array.from({ length: 8 }, (_, i) => ROM.u32(0x28ee46 + i * 4));
    assert.deepEqual(zooms, [0x80008000, 0x90009000, 0xa000a000, 0xb000b000,
      0xc000c000, 0xd000d000, 0xe000e000, 0xf000f000],
    'a clean $8000 -> $F000 ramp: the banner ZOOMS IN over eight frames');
    assert.throws(() => ROM.u32(0x28ee46 + 8 * 4), (e) => e.name === 'Unreached',
      'and the window stops after the eighth, so the extent is the cursor\'s');
  });

test('W232 $23F82A is the family\'s bucket-22 member, not a new emitter',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const other = new Ram();
    const args = [0x00010000, 0x00329c5c, 0x38e0, 0x17, 0xc000c000];
    emit23F82A(ram, ROM, ...args);
    emitScaled(other, ROM, 22, ...args);
    const b = BUCKETS[22];
    assert.equal(ram.u16(b.counter), 12, 'one twelve-byte record');
    assert.deepEqual([ram.u32(b.buffer), ram.u32(b.buffer + 4),
      ram.u16(b.buffer + 8), ram.u16(b.buffer + 10)],
    [other.u32(b.buffer), other.u32(b.buffer + 4),
      other.u16(b.buffer + 8), other.u16(b.buffer + 10)],
    '$23F82A and emitScaled(22) write the same twelve bytes');
    // ...and it is bucket 22 and nothing else
    for (const x of BUCKETS) {
      if (x.i !== 22) assert.equal(ram.u16(x.counter), 0, `bucket ${x.i} untouched`);
    }
  });

test('W232 all five banner pictures are in the bundle', { skip: SKIP_BUNDLE }, () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const raw = gunzipSync(readFileSync(streamsPath));
  const flat = new Uint32Array(raw.buffer.slice(raw.byteOffset,
    raw.byteOffset + raw.byteLength));
  const n = manifest.spr.streamCount;
  const shipped = new Set();
  let acc = 0;
  for (let i = 0; i < n; i++) { acc = (acc + flat[i]) >>> 0; shipped.add(acc); }
  const banners = Array.from({ length: 5 }, (_, i) => ROM.u32(0x28ee1e + i * 8));
  assert.equal(new Set(banners).size, 5, 'five distinct per-stage pictures');
  for (const b of banners) {
    assert.ok(shipped.has(b),
      `$${b.toString(16).toUpperCase()} must ship, or the banner draws nothing`);
  }
});

test('W232 the banner draw no longer defers its entry picture', { skip: SKIP }, () => {
  // The claim is about the SHIPPED SOURCE: $23F82A must not be a note any more,
  // and the emitter must be reached by address rather than by a new local copy.
  const src = readFileSync(new URL('../src/stageend.js', import.meta.url), 'utf8');
  const body = src.split('function bannerDraw28EDC0(')[1].split('\n}\n')[0];
  assert.ok(/emit23F82A\(ram, rom, d1, d2, d3, d4, d6\)/.test(body),
    'the entry arm calls the emitter');
  assert.ok(!/note\(ctx, 0x23f82a/.test(body), 'and no longer counts it');
  assert.ok(/0x28ee46/.test(body), 'reading its zoom longword by address');
});
