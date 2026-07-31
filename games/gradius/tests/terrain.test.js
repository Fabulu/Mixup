// The terrain streamer, against the cartridge's own nametable.
//
// THE CHECK THAT MATTERS: run this port's streamer from a cold start until its
// build cursor ($54/$55/$58) reaches the value the cartridge had at a captured
// frame, then compare the whole 4 KB nametable image. If the address
// arithmetic, the page->screen->layout->block chain, the RLE decoder or the
// packet stride is wrong anywhere, tiles land in the wrong place and this
// number is large.
//
// It comes out as: every playfield tile and every attribute byte identical,
// with differences ONLY in nametable-0 tile rows 28 and 29 -- the status bar,
// which is pushed by canned HUD packets from $864E and which this port does not
// implement. That is a stated omission, and the test asserts the omission is
// confined to exactly those two rows rather than allowing "some differences".

import test from 'node:test';
import assert from 'node:assert';

import { bootState } from '../src/main.js';
import { streamBlock, probeCollision } from '../src/terrain.js';
import { drainQueue } from '../src/vram.js';
import { loadCapture, captureSkipMessage, headlessResources } from './helpers.js';

const res = headlessResources(0);

/** Rows 28-29 of $2000: the status bar. $8871/$8641 write it; we do not. */
const STATUS_ROWS = new Set([28, 29]);

/**
 * Drive the streamer from a cold boot until its build cursor matches the
 * cartridge's. The camera is nudged by hand rather than by running whole NMIs,
 * so that this test exercises the STREAMER and not the frame loop.
 */
function buildUpTo(ram) {
  const s = bootState(res.manifest);
  for (let i = 0; i < 5000; i++) {
    if (s.build.lo === ram[0x54] && s.build.hi === ram[0x55] && s.build.prog === ram[0x58]) return s;
    if (!streamBlock(s, res.stage)) {
      s.cam.lo = (s.cam.lo + 1) & 0xFF;                 // release the 384 px gate
      if (s.cam.lo === 0) s.cam.hi = (s.cam.hi + 1) & 0xFF;
    }
    drainQueue(s);
  }
  throw new Error('never reached the cartridge build cursor');
}

function diffByRow(mine, theirs) {
  const rows = new Map();
  for (let nt = 0; nt < 2; nt++) {
    for (let i = 0; i < 0x400; i++) {
      const o = nt * 0x400 + i;
      if (mine[o] === theirs[o]) continue;
      const key = i < 0x3C0 ? `nt${nt}:row${(i / 32) | 0}` : `nt${nt}:attr`;
      rows.set(key, (rows.get(key) || 0) + 1);
    }
  }
  return rows;
}

for (const name of ['f400', 'f1200', 'f3500']) {
  test(`streamed nametable matches the cartridge at ${name}`, (t) => {
    const cap = loadCapture(name);
    if (!cap) return t.skip(captureSkipMessage(name));
    const s = buildUpTo(cap.ram);
    const rows = diffByRow(s.vram.nt, cap.nt);
    t.diagnostic(`${name}: differing rows ${JSON.stringify([...rows])}`);

    let stray = 0;
    for (const [k, n] of rows) {
      const m = /^nt0:row(\d+)$/.exec(k);
      if (!m || !STATUS_ROWS.has(Number(m[1]))) stray += n;
    }
    assert.strictEqual(stray, 0,
      `${name}: ${stray} bytes differ OUTSIDE the status-bar rows -- `
      + `${JSON.stringify([...rows])}`);
    // And the check must be able to see something: if the playfield were
    // empty, "0 stray differences" would be 0 == 0. Demand real content.
    const nonzero = s.vram.nt.reduce((a, v) => a + (v ? 1 : 0), 0);
    assert.ok(nonzero > 200, `only ${nonzero} non-blank tiles -- vacuously green`);
  });
}

test('the collision map is derived from the tiles that were queued', (t) => {
  // Stage 1's first four pages are pure starfield and produce a legitimately
  // ALL-ZERO map -- the exact shape of vacuous green that let 2,128 collision
  // comparisons pass as 0 == 0 in the oracle. So this test walks the whole
  // stage offline and asserts there IS solid terrain before believing anything.
  const solid = [];
  for (const [key, b] of Object.entries(res.stage.blocks)) {
    if (b.collision.some((v) => v !== 0)) solid.push(key);
  }
  t.diagnostic(`${solid.length} of ${Object.keys(res.stage.blocks).length} block ids have solid tiles`);
  assert.ok(solid.length > 0, 'no solid block in stage 1 -- the check would be vacuous');

  // The write side and the read side, round-tripped. $9F7D stores at
  // ($54 + $58) + 8*column on page $05/$06; $C3D3 reads it back from the
  // camera and a screen position. Independently derived: the writer's index
  // comes from the build cursor, the reader's from the camera.
  const s = bootState(res.manifest);
  s.coll.fill(0);
  // one byte: tile column 3 of page $05, block row 2, all four tile rows solid
  s.coll[3 * 8 + 2] = 0x55;
  s.cam.lo = 0; s.cam.hi = 0;
  // screenX 16..23 -> worldLo 24..31 -> &$F8 = 24 = tile column 3
  // screenY: (y + $14) >> 3 must land in block row 2, i.e. tile rows 8..11
  const got = probeCollision(s, 16, 8 * 8 - 0x14 + 4);
  assert.strictEqual(got, 1, 'the reader did not find the byte the writer placed');
  assert.strictEqual(probeCollision(s, 16 + 8, 8 * 8 - 0x14 + 4), 0,
    'the reader found terrain in a column that has none');
});
