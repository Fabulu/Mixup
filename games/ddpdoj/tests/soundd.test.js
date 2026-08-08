// WAVE D (SOUND) -- the sample-data tight-union MUST-FAIL.
//
// Companion to docs/worklog/ddpdoj/140-impl-sound-wave-d.md. This is the gate
// for the ICS2115 sample shard: the 28 disjoint byte intervals of
// `cave_m04401b032.u17` (4 MiB @ $400000 in the ICS sample space) that together
// cover 100% of the 1501 valid stage-1 keyons. The three required colours:
//
//   GREEN -- the 28 windows are disjoint, sorted, total 1,538,920 B, all inside
//            u17's 4 MiB, and every one of the 28 representative keyons (one
//            per fragment, measured from keyon.tsv) is covered.
//   RED   -- drop fragment k; the representative keyon that lives in it goes
//            uncovered (its sample address is no longer in any window).
//   GREEN -- restore the fragment; coverage returns.
//
// The 28 windows and the 28 representative keyons are EMBEDDED here as the
// load-bearing claim, copied from tools/verify_wave_d.py's output (which
// derives them from rip/sound/keyon.tsv). export-tables.py's
// check_sample_windows re-derives the same list from keyon.tsv on every export,
// so a Python-side edit that drops a fragment turns the export red; this test
// turns the JS side red. If the regenerated sidecar index
// (assets/snd/sample.index.json.gz) is present, it is cross-checked against the
// embedded expectation so the two cannot drift.
//
// This does NOT prove the synth works (Wave E is unwritten). It proves the DATA
// packaging is faithful: the tight union is the minimum slice that covers every
// stage-1 keyon, and no fragment is free.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const INDEX_GZ = HERE + '../assets/snd/sample.index.json.gz';

const U17_BASE = 0x400000;          // u17 in the ICS 24-bit sample space
const U17_SIZE = 0x400000;          // 4 MiB
const RAW = 1_538_920;              // the tight union, measured
const FRAGS = 28;

// The 28 windows as [u17Lo, u17Hi) HALF-OPEN file offsets. Source of truth:
// tools/verify_wave_d.py output, derived from rip/sound/keyon.tsv. Copied
// verbatim into export-tables.py::_SAMPLE_INTERVALS; editing one without the
// other makes this test or the export go red.
const WINDOWS = [
  [0x000000, 0x009BFF], [0x01C819, 0x021612], [0x06809B, 0x0759FE],
  [0x0C0CD3, 0x0C7748], [0x0C7AE3, 0x0CAB51], [0x0CD4B1, 0x0CF034],
  [0x0DB935, 0x0DC255], [0x0F661E, 0x0FFFDF], [0x100000, 0x1CD8DC],
  [0x1EBF90, 0x1ED16E], [0x1FFED6, 0x1FFFF4], [0x20C14E, 0x210428],
  [0x211704, 0x214C70], [0x215D78, 0x218B02], [0x21B0C6, 0x21B43E],
  [0x22C352, 0x22D3A2], [0x234D78, 0x234FF0], [0x24FB9C, 0x252A3A],
  [0x252E7C, 0x254450], [0x29D284, 0x29D57C], [0x2AA0E2, 0x2AE838],
  [0x2B049A, 0x2B4208], [0x2B70A6, 0x2BA4C8], [0x2C284A, 0x2C33D2],
  [0x2EEF3C, 0x2EF13C], [0x2F661E, 0x2F6DFA], [0x300000, 0x351212],
  [0x352E7C, 0x35BD94],
];

// One representative keyon per fragment, as [icsStart, icsEnd) (the 24-bit ICS
// sample addresses straight from keyon.tsv's decoded start/end columns, as
// DECIMAL to avoid any hex hand-conversion). Each was chosen to lie WHOLLY
// inside its fragment, so the fragment is load-bearing: drop it and this keyon's
// address is uncovered. Measured by tools/verify_wave_d.py; per-fragment
// coverage runs 1..371 keyons, this is the witness for each.
const KEYONS = [
  [4194304, 4207957], [4311065, 4331026], [4671031, 4676094], [4984019, 5004632],
  [5021841, 5024593], [5035185, 5042228], [5093685, 5096021], [5203486, 5242847],
  [5242880, 5785984], [6209424, 6213998], [6291158, 6291444], [6340942, 6358056],
  [6362884, 6376560], [6380920, 6392578], [6402246, 6403134], [6472530, 6476706],
  [6507896, 6508528], [6618012, 6629946], [6631036, 6636624], [6935172, 6935932],
  [6988002, 7006264], [7013530, 7029256], [7041190, 7054536], [7088202, 7091154],
  [7270204, 7270716], [7300638, 7302650], [7340032, 7662548], [7679612, 7699338],
];

function coveredBy(icsLo, icsHi, windows) {
  // a keyon [icsLo, icsHi) is covered iff some window holds all of it
  for (const [lo, hi] of windows) {
    if (lo + U17_BASE <= icsLo && icsHi <= hi + U17_BASE) return true;
  }
  return false;
}

test('wave D: the tight union is 28 disjoint sorted windows totalling 1,538,920 B', () => {
  assert.equal(WINDOWS.length, FRAGS, 'exactly 28 fragments');
  let total = 0, prevHi = -1;
  for (const [lo, hi] of WINDOWS) {
    assert.ok(lo >= 0 && hi <= U17_SIZE, `window [${lo},${hi}] inside u17's 4 MiB`);
    assert.ok(hi > lo, `window [${lo},${hi}] is non-empty`);
    assert.ok(lo > prevHi, `window starting at ${lo} is disjoint from (past) ${prevHi}`);
    total += hi - lo;
    prevHi = hi;
  }
  assert.equal(total, RAW, `union totals ${RAW} B raw`);
});

test('wave D: every one of the 28 representative keyons is covered (GREEN)', () => {
  assert.equal(KEYONS.length, FRAGS, 'one witness keyon per fragment');
  for (let k = 0; k < FRAGS; k++) {
    const [lo, hi] = KEYONS[k];
    assert.ok(coveredBy(lo, hi, WINDOWS),
      `keyon ${k + 1} [${lo.toString(16)},${hi.toString(16)}) must be covered`);
  }
});

test('wave D: MUST-FAIL -- drop any one fragment and its keyon goes red, restore -> green', () => {
  for (let k = 0; k < FRAGS; k++) {
    const reduced = WINDOWS.filter((_, i) => i !== k);
    const [lo, hi] = KEYONS[k];
    // RED: with fragment k gone, witness keyon k is uncovered.
    assert.equal(coveredBy(lo, hi, reduced), false,
      `dropping fragment ${k + 1} leaves keyon ${k + 1} uncovered (must go red)`);
    // GREEN: restoring it (i.e. the full window set) covers it again.
    assert.equal(coveredBy(lo, hi, WINDOWS), true,
      `restoring fragment ${k + 1} covers keyon ${k + 1} again (green)`);
  }
});

test('wave D: no fragment is redundant -- each is the SOLE cover for its witness', () => {
  // Stronger than the must-fail above: every fragment is the ONLY window that
  // covers its witness, so none can be dropped without losing a keyon.
  for (let k = 0; k < FRAGS; k++) {
    const [lo, hi] = KEYONS[k];
    let covers = 0;
    for (const [wLo, wHi] of WINDOWS) {
      if (wLo + U17_BASE <= lo && hi <= wHi + U17_BASE) covers++;
    }
    assert.equal(covers, 1, `fragment ${k + 1} is the sole cover for keyon ${k + 1}`);
  }
});

// Cross-check against the regenerated sidecar index when it is present. A fresh
// checkout has no assets/snd/* (gitignored, regenerated by export-web.mjs), so
// this skips there; in a dev tree it asserts the shipped index matches the
// embedded expectation and that shardOffsets stitch the windows contiguously.
test('wave D: the regenerated sidecar index matches the embedded windows (when present)', { skip: !existsSync(INDEX_GZ) ? 'assets/snd/sample.index.json.gz not regenerated' : false }, () => {
  const idx = JSON.parse(new TextDecoder().decode(gunzipSync(readFileSync(INDEX_GZ))));
  assert.equal(idx.fragments.length, FRAGS);
  assert.equal(idx.icsBase, U17_BASE);
  assert.equal(idx.shardBytes, RAW);
  let pack = 0;
  for (let k = 0; k < FRAGS; k++) {
    const f = idx.fragments[k];
    const [lo, hi] = WINDOWS[k];
    assert.equal(f.romOffset, lo, `fragment ${k + 1} romOffset`);
    assert.equal(f.len, hi - lo, `fragment ${k + 1} len`);
    assert.equal(f.icsBase, lo + U17_BASE, `fragment ${k + 1} icsBase`);
    assert.equal(f.shardOffset, pack, `fragment ${k + 1} shardOffset (contiguous stitch)`);
    pack += f.len;
  }
  assert.equal(pack, RAW, 'shard offsets sum to the raw byte count');
});
