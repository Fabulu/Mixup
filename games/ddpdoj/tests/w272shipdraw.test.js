// W272 (DOCKET D8): "the ship may be missing its large exhausts. Only tiny exhausts draw."
//
// It is not missing anything. This file is the measurement that says so, and it is a
// BOARD comparison rather than a self-consistency check: it boots the port from the
// cartridge's own main RAM at lf2200 of the `stage1-laser-hold` ladder, runs the ladder's
// own input for 100 logic frames, and compares the ship's records byte for byte against
// the board's own lf2300 checkpoint.
//
// WHAT THE SHIP DRAWS, on the board, measured here and not paraphrased:
//
//   bucket 19  size $0A28   5x40   the AURA, gated on the invulnerability byte $3E(A6)
//   bucket 19  size $0620   3x32   the SHIP itself
//   bucket 19  size $0220   1x32   the GLOW, wave 9's "exhaust glow", colour 26
//   bucket 12  size $0620   3x32   the TRAIL, five records, colour 31, laser-only
//
// and THERE IS NO FOURTH. `tools/w67trailgate.mjs` names nine enqueue sites reachable
// from the ship's draw block; four of them ($24A6C4, $24A700, $24A730, $24A756) are the
// script-driven display walker at $24A6B4, which `drawShipAlt` reaches only when bit 8 of
// the player state word is set. A whole-ROM scan for the instructions that could set that
// bit -- `bset #0` and `ori.b #1` against byte 0 of a record through A0 or A6 -- finds no
// hit anywhere in $240000..$2A6000, so the walker is unreachable and its four sites are
// correctly never run.
//
// So the answer to D8 is that the large record IS the aura, it draws exactly when the
// board draws it, and the big plume a player remembers is the TRAIL -- which needs the
// laser HELD and the ship MOVING. The shipped page used to tell the player that holding
// shot stopped the loop, so a player following it never met either condition. That text
// is fixed in this wave and the last test here keeps it fixed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { BIT, P } from '../src/machine.js';
import { BUCKETS } from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const LADDER = path.join(R, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold', 'ckpt');
const TABLES = path.join(R, 'rip', 'port', 'player.tables.json');

const RAM_BASE = 0x800000;
const PLAYER = 0x8103e6;

const HAVE_LADDER = existsSync(path.join(LADDER, 'c002200.ram.bin'))
  && existsSync(path.join(LADDER, 'c002300.ram.bin'))
  && existsSync(path.join(LADDER, 'c002000.ram.bin'))
  && existsSync(path.join(LADDER, 'c002100.ram.bin'));
const HAVE_TABLES = existsSync(TABLES);
const SKIP = HAVE_LADDER && HAVE_TABLES
  ? false
  : 'the W69 laser-hold ladder or the generated ROM tables are absent; skip, not pass';

const tables = HAVE_TABLES ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const rung = (lf) => new Uint8Array(readFileSync(path.join(LADDER, `c00${lf}.ram.bin`)));
const boot = (lf) => new Game(rung(lf), tables, { palCatchUp: false });

/** The board's own 12-byte staged record, straight out of its main RAM. */
function boardRecord(ram, addr) {
  const o = addr - RAM_BASE;
  const u16 = (k) => (ram[o + k] << 8) | ram[o + k + 1];
  return [u16(0), u16(2), u16(4), u16(6), u16(8), u16(10)];
}
function portRecord(ram, addr) {
  return [0, 2, 4, 6, 8, 10].map((k) => ram.u16(addr + k));
}
const hex = (r) => r.map((w) => w.toString(16).padStart(4, '0')).join(' ');

// ===================================================== 1. THE BOARD'S OWN CENSUS
//
// Before any comparison: how many records does the CARTRIDGE put in bucket 19 for the
// ship? If it were four, the port would be missing one and D8 would be real.

test('W272 the board puts exactly THREE ship records in bucket 19, in size order '
  + '$A28 / $620 / $220', { skip: SKIP }, () => {
  for (const lf of ['2000', '2100', '2200', '2300']) {
    const ram = rung(lf);
    const sizes = [0, 1, 2, 3].map((i) => boardRecord(ram, BUCKETS[19].buffer + i * 12)[4]);
    assert.deepEqual(sizes, [0x0a28, 0x0620, 0x0220, 0x0000],
      `lf${lf}: the aura (5x40), the ship (3x32), the glow (1x32), then nothing`);
  }
});

test('W272 the board draws NO fourth ship record, on any rung of the ladder',
  { skip: SKIP }, () => {
    // The staging buffer is not cleared between frames, so a fourth record on ANY frame
    // of the whole ladder would still be sitting there. $808EE4 + $C0 is the bucket's
    // 192-byte extent = 16 records; records 3..15 must be untouched zero on every rung.
    for (const lf of ['2000', '2100', '2200', '2300']) {
      const ram = rung(lf);
      for (let i = 3; i < 16; i++) {
        const rec = boardRecord(ram, BUCKETS[19].buffer + i * 12);
        assert.deepEqual(rec, [0, 0, 0, 0, 0, 0],
          `lf${lf} bucket 19 record ${i} is zero -- the board never staged a fourth`);
      }
    }
  });

// ============================================ 2. THE PORT AGAINST THE BOARD, BYTE FOR BYTE
//
// The ladder's script is `2200=DAL`: from lf2200 the input is Down + Left + Button 1, so
// the laser is up, the ship is moving, and both the aura and the trail are live. 100 logic
// frames of that is the board's lf2300.

const HOLD_DAL = portWordFromBits([BIT.down, BIT.left, BIT.b1]);

test('W272 the ship\'s THREE bucket-19 records match the board byte for byte after '
  + '100 frames of the ladder\'s own input', { skip: SKIP }, () => {
  const g = boot('2200');
  for (let f = 0; f < 100; f++) g.step(HOLD_DAL);
  const board = rung('2300');
  const names = ['the AURA $24A532', 'the SHIP $24A538', 'the GLOW $24A632'];
  for (let i = 0; i < 3; i++) {
    const at = BUCKETS[19].buffer + i * 12;
    const got = portRecord(g.ram, at);
    const want = boardRecord(board, at);
    assert.deepEqual(got, want,
      `${names[i]}: port ${hex(got)} vs board ${hex(want)}`);
  }
});

test('W272 the AFTERIMAGE TRAIL\'s five bucket-12 records match the board byte for byte',
  { skip: SKIP }, () => {
    // This is the record family that reads as the big exhaust plume: five 3x32 copies of
    // the ship's own art in colour 31, and $253604 raises them only while the laser is up
    // AND the ship is crossing coarse cells.
    const g = boot('2200');
    for (let f = 0; f < 100; f++) g.step(HOLD_DAL);
    const board = rung('2300');
    let five = 0;
    for (let i = 0; i < 5; i++) {
      const at = BUCKETS[12].buffer + i * 12;
      const got = portRecord(g.ram, at);
      const want = boardRecord(board, at);
      assert.deepEqual(got, want, `trail ${i}: port ${hex(got)} vs board ${hex(want)}`);
      if (want[4] === 0x0620) five++;
    }
    assert.equal(five, 5, 'and all five are the ship\'s own 3x32');
    assert.deepEqual(portRecord(g.ram, BUCKETS[12].buffer + 5 * 12),
      boardRecord(board, BUCKETS[12].buffer + 5 * 12),
      '$2536AA is SIX passes and the sixth stores the ring head -- no sixth record');
  });

test('W272 the laser really is up on both sides at that frame', { skip: SKIP }, () => {
  // Without this the byte match above could be two identical EMPTY buckets.
  const g = boot('2200');
  for (let f = 0; f < 100; f++) g.step(HOLD_DAL);
  const board = rung('2300');
  assert.equal(g.ram.u8(PLAYER + P.dead), 1, 'the port has the beam up');
  assert.equal(board[PLAYER + P.dead - RAM_BASE], 1, 'and so does the board');
  assert.notEqual(portRecord(g.ram, BUCKETS[12].buffer)[4], 0,
    'so the trail bucket is not empty');
});

// ================================================== 3. THE LASER'S SPEED RAMP
//
// The page told the player for 262 waves that holding shot stopped the loop at $24C8BE.
// It does not: it walks the speed index down, and it lands where the board lands.

test('W272 holding the laser walks the speed index 22 -> 12, the board\'s own value',
  { skip: SKIP }, () => {
    const g = boot('2000');
    const hold = portWordFromBits([BIT.b1]);
    assert.equal(g.ram.u8(PLAYER + P.speedIdx), 22, 'index 22 at lf2000');
    for (let f = 0; f < 100; f++) g.step(hold);
    assert.equal(g.ram.u8(PLAYER + P.speedIdx), 12, '$24C8BE ramped it down');
    assert.equal(g.ram.u8(PLAYER + P.speedIdx), rung('2100')[PLAYER + P.speedIdx - RAM_BASE],
      'and that is the value the BOARD holds at lf2100');
  });

// ============================================= 4. THE SHOT STREAMS ARE IN THE SHEET
//
// The other stale claim on the page. The bundle work of W265-W267 put them there; this
// checks the sheet rather than trusting the sentence.

const MANIFEST = path.join(R, 'assets', 'manifest.json');
const STREAMS = path.join(R, 'assets', 'spr', 'streams.u32.gz');
const HAVE_BUNDLE = existsSync(MANIFEST) && existsSync(STREAMS);
const SKIP_BUNDLE = SKIP || (HAVE_BUNDLE ? false : 'the shipped sprite bundle is absent');

test('W272 every shot stream the port stages IS in the shipped sheet',
  { skip: SKIP_BUNDLE }, () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const raw = gunzipSync(readFileSync(STREAMS));
    const flat = new Uint32Array(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const have = new Set();
    let acc = 0;
    for (let i = 0; i < manifest.spr.streamCount; i++) {
      acc = (acc + flat[i]) >>> 0;
      have.add(acc);
    }

    const g = boot('2000');
    const tap = portWordFromBits([BIT.b1]);
    const idle = portWordFromBits([]);
    const seen = new Set();
    let records = 0;
    for (let f = 1; f <= 400; f++) {
      g.step(f % 6 < 2 ? tap : idle);          // tap, not hold: the cadence machine
      const n = g.displayList.perBucketRecords[BUCKETS[14].i] ?? 0;
      records += n;
      for (let i = 0; i < n; i++) {
        const d = g.ram.u32(BUCKETS[14].buffer + i * 12 + 4) >>> 0;
        if (d) seen.add(d);
      }
    }
    assert.ok(records > 1000, `the cadence machine really fired, ${records} records`);
    assert.ok(seen.size >= 20, `and across ${seen.size} distinct streams`);
    const missing = [...seen].filter((d) => !have.has(d))
      .map((d) => '$' + d.toString(16).toUpperCase());
    assert.deepEqual(missing, [], 'none of them is missing from the sheet');
  });

// ================================================ 5. THE PAGE NO LONGER SAYS THE OLD THING
//
// A stale instruction is a player-visible defect in its own right: the three claims below
// each steered the player away from an input that works. Pinned mechanically so they
// cannot come back with a copy-paste.

test('W272 index.html no longer tells the player that fire stops the loop', () => {
  const page = readFileSync(path.join(R, 'index.html'), 'utf8');
  const buttons = page.slice(page.indexOf('<b>TAP shot</b>'), page.indexOf('<b>AUTO</b>'));
  assert.ok(buttons.length > 200, 'found the fire-button block');
  assert.ok(!/Neither is ported/.test(buttons),
    'the laser and its ramp are both ported');
  assert.ok(!/reaches a named throw at <code>\$249814<\/code>/.test(buttons),
    '$249814 does not throw: both arms of the button are ported');
  assert.ok(!/You will not see it/.test(buttons),
    'the shot streams are in the sheet as of W265-W267');
  // And it now points the player at the two conditions the plume actually needs.
  assert.match(buttons, /afterimage trail/i);
  assert.match(buttons, /motionless ship has no trail/i);
});
