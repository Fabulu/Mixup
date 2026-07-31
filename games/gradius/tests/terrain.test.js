// The terrain streamer, against the cartridge's own nametable.
//
// THE CHECK THAT MATTERS: run this port's streamer from a cold start until its
// build cursor ($54/$55/$58) reaches the value the cartridge had at a captured
// frame, then compare the whole 4 KB nametable image. If the address
// arithmetic, the page->screen->layout->block chain, the RLE decoder or the
// packet stride is wrong anywhere, tiles land in the wrong place and this
// number is large.
//
// It used to come out as: every playfield tile and every attribute byte
// identical, with differences ONLY in nametable-0 tile rows 28 and 29 -- the
// status bar. Those two rows were EXEMPTED, because the port had no HUD.
//
// WAVE 2 REMOVED THE EXEMPTION. src/hud.js ports $8898 and its four producers,
// and the whole of rows 28-29 turns out to be exactly what they write: 24 bytes
// at $2384 (row 28 columns 4-27, st_89E3's one open run) and 24 bytes across
// row 29 ($23A2 lives, $23A8 score, $23B4 top score). So the comparison below
// holds no rows back -- and if a producer stops running this test is what
// notices, on three captures with three different lives counts ($20 = 3/1/0).
//
// "THE WHOLE 4 KB" IS NOW TRUE AND WAS NOT WHEN IT WAS FIRST WRITTEN: diffByRow
// walked two 1 KB pages, i.e. bytes 0-0x7FF of a 4096-byte image, while the
// header and the commit message both claimed 4 KB. See the note on diffByRow.

import test from 'node:test';
import assert from 'node:assert';

import { bootState } from '../src/main.js';
import { streamBlock, probeCollision } from '../src/terrain.js';
import { drainQueue, queueTerminator } from '../src/vram.js';
import { hudTick } from '../src/hud.js';
import { loadCapture, captureSkipMessage, headlessResources,
         seedHudInputs } from './helpers.js';

const res = headlessResources(0);

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

/**
 * Draw the status bar the way the cartridge does: eight odd frames of $8898.
 *
 * $88A8's `AND #$03` is a four-phase rotation, so eight ticks run every
 * producer twice and the second pass is idempotent -- which is also the reason
 * a captured nametable can be compared against a port that was never booted
 * through the stage intro. The two things the FRAME does rather than the tick
 * ($8A7B zeroing $0E, $80BE stepping $02, $80B0's terminator) are supplied here
 * explicitly instead of by running whole NMIs, because a whole NMI would also
 * move the build cursor away from the value buildUpTo() just matched.
 *
 * $80B0's queueTerminator() is NOT optional here and the first draft left it
 * out: $8A76 clears only $0700[0], so a 14-byte frame after a 39-byte one
 * leaves 25 stale bytes in the page and the drain reads straight through them.
 * It did -- 37 wrong nametable bytes, including the playfield's own attribute
 * table. The stop byte is the only thing that ends the queue.
 */
function drawStatusBar(s, ram) {
  seedHudInputs(s, ram);
  s.zp48 = 0;
  for (let i = 0; i < 8; i++) {
    s.frame = 1;                    // $02 odd -- $88A2 BCC lets the tick through
    s.vram.cursor = 0;              // $8A7B STA $0E, at the top of every frame
    hudTick(s, res.hudPackets);     // $9AC7 JSR $8898
    queueTerminator(s);             // $80B0 JSR $8641
    drainQueue(s);                  // $8099 JSR $8A51, the next frame's
  }
}

/**
 * Every byte of the 4 KB image, in four 1 KB pages.
 *
 * IT USED TO BE TWO PAGES, and the header above said "the FULL 4 KB" while
 * comparing 0x000-0x7FF. Pages 2 and 3 are the vertical-mirroring aliases of 0
 * and 1 -- byte-identical in the capture, checked: `lo != hi` on 0 of 4096
 * bytes at f400, f1200 and f3500 -- but the port has to WRITE them (src/vram.js
 * drainQueue), and src/render/ppu.js reads them whenever nty = 1, which the
 * port's own $13 = $0C makes routine for screen scanlines 228-239. Deleting the
 * mirror store left all 80 tests green. `nt < 4` is the whole fix.
 */
function diffByRow(mine, theirs) {
  const rows = new Map();
  for (let nt = 0; nt < 4; nt++) {
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
    drawStatusBar(s, cap.ram);
    const rows = diffByRow(s.vram.nt, cap.nt);
    t.diagnostic(`${name}: $20 = ${cap.ram[0x20]}, `
               + `differing rows ${JSON.stringify([...rows])}`);

    const stray = [...rows.values()].reduce((a, n) => a + n, 0);
    assert.strictEqual(stray, 0,
      `${name}: ${stray} bytes differ from the cartridge's nametable -- `
      + `${JSON.stringify([...rows])}`);
    // The status bar must be REACHED, not merely not-differing: an all-zero
    // row 28 would compare equal to an all-zero row 28. Assert the port put
    // real tiles there.
    const bar = s.vram.nt.subarray(28 * 32, 30 * 32);
    assert.ok(bar.reduce((a, v) => a + (v ? 1 : 0), 0) > 30,
      `${name}: the status bar rows are blank -- $8898 produced nothing`);
    // And the check must be able to see something: if the playfield were
    // empty, "0 stray differences" would be 0 == 0. Demand real content.
    const nonzero = s.vram.nt.reduce((a, v) => a + (v ? 1 : 0), 0);
    assert.ok(nonzero > 200, `only ${nonzero} non-blank tiles -- vacuously green`);
  });
}

test('$9E94/$9EC2: one block on the wire, byte for byte against the cartridge', () => {
  // THE ONLY CHECK THAT CAN SEE THE TILE PACKETS' SHAPE. Four ROWS written with
  // PPU increment 1 and four COLUMNS written with increment 32 fill the same
  // 4x4 square, cost the same 37 bytes of $0E, and leave the same collision
  // map -- so the nametable comparison above, the whole oracle corpus and every
  // $0E assertion in the suite are all blind to the difference. The port had
  // the columns reading (with a comment claiming the collision derivation
  // forced it) until wave 2 read $9EC6 `A9 01` and $9ED8 `A9 20 / 18 / 65 AA`.
  //
  // MEASURED. tools/oracle/queue.lua now dumps $0700 at $80B5 as well as at the
  // streamer's gate, which is the only sample point where a terrain packet
  // exists at all:
  //
  //   python games/gradius/tools/oracle/queue.py --frames 700 \
  //       --script "200:,10:S,490:" --from 560 --to 600 --tag blocks
  //
  //   f571  $54=00 $55=02 $58=01 (post-advance)  38 bytes
  //     01 23 C0 4C FF | 01 20 00 00 00 00 00 FF | 01 20 20 00 3C 00 00 FF
  //     | 01 20 40 00 00 3F 00 FF | 01 20 60 3B 00 00 00 FF | 00
  //
  // The four tile packets' addresses are $2000 $2020 $2040 $2060 -- 32 APART,
  // one tile row each -- and every mode byte is $01, i.e. increment 1. The
  // attribute packet comes FIRST. The old model would have written mode $02 at
  // $2000 $2001 $2002 $2003.
  // RED WHEN: the loop goes back to columns, or the attribute packet moves.
  const s = bootState(res.manifest);
  s.build.lo = 0x00; s.build.hi = 0x02; s.build.prog = 0;   // $54/$55/$58 at f571
  s.cam.lo = 0; s.cam.hi = 2;                               // release the lead gate
  s.vram.cursor = 0;
  assert.strictEqual(streamBlock(s, res.stage), true, 'the streamer refused');
  assert.strictEqual(s.build.prog, 1, '$58 did not advance to the cartridge\'s value');
  queueTerminator(s);                                       // $80B0, the dump's last byte
  const got = [...s.vram.q.subarray(0, s.vram.cursor)]
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  assert.strictEqual(got,
    '01 23 C0 4C FF 01 20 00 00 00 00 00 FF 01 20 20 00 3C 00 00 FF '
    + '01 20 40 00 00 3F 00 FF 01 20 60 3B 00 00 00 FF 00',
    'the block\'s $0700 image is not the one the cartridge produced at f571');
  assert.strictEqual(s.vram.cursor, 38, '4*8 + 5 + 1 = 38');
});

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
