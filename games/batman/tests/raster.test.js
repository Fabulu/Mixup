// The $0857 STAT program: mode selection, and each arm's band list.
//
// The frame-exact proof lives in tools/oracle/rasterdiff.mjs, which compares
// 335 664 scanlines of (SCX, SCY, BGP, OBP0, OBP1) against the cartridge.
// What is pinned HERE is the handful of numbers that come straight off the
// machine, so that a later edit that quietly changes one is caught without a
// PyBoy run:
//
//   * the mode table at loc_00_0E74, including the eight levels that get NO
//     raster at all because $0F1F masks the STAT interrupt off;
//   * the fixed handoff lines (0 / $30 / $40, and $22 / $70), MEASURED;
//   * the water chain's 4-line step and its $8F stop;
//   * mode 7's $C763 ceiling of $0B and the handoff line's SCY-0 / $FFAC+1,
//     all four measured with tools/oracle/rastersquash.py.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { drawYBob } from '../src/render/metasprite.js';
import { createState } from '../src/state.js';
import { makeTunables } from '../src/tunables.js';

import {
  createRaster, tickRaster, rasterModeForLevel,
  parallaxBands, trackBands, waterBands, squashBands,
  RASTER_OFF, RASTER_TRACK, RASTER_PARALLAX, RASTER_WATER, RASTER_SQUASH,
} from '../src/raster.js';

// 0:$09A2, 32 signed bytes. The real one comes from assets/manifest.json
// (`tables.sine`); this copy exists only so the unit tests do not need the
// export, and waterBands is asserted to THROW when it is absent.
const SINE = [0, 0, 3, 5, 6, 8, 9, 10, 10, 10, 9, 8, 6, 5, 3, 0,
              0, 0, -3, -5, -6, -8, -9, -10, -10, -10, -9, -8, -6, -5, -3, 0];

const BASE = { from: 0, scx: 88, scy: 112, bgp: 0xE4, obp0: 0xE4, obp1: 0xC4 };

function mkState(over = {}) {
  return {
    raster: createRaster(),
    frame: 0x6D,
    flow: { paused: false, parallaxScx: 0 },
    water: { windowY: 0x90 },
    tables: { sine: SINE },
    ...over,
  };
}

// --------------------------------------------------------------------------
// loc_00_0E74 -- which level gets which arm
// --------------------------------------------------------------------------

test('rasterModeForLevel is loc_00_0E74, including the levels with no raster', () => {
  assert.equal(rasterModeForLevel(1), RASTER_WATER);      // $0EC3
  assert.equal(rasterModeForLevel(2), RASTER_WATER);
  assert.equal(rasterModeForLevel(6), RASTER_TRACK);      // $0EEA -> $0F11
  assert.equal(rasterModeForLevel(9), RASTER_PARALLAX);   // $0E8A
  assert.equal(rasterModeForLevel(10), RASTER_PARALLAX);
  assert.equal(rasterModeForLevel(11), RASTER_PARALLAX);
  // $0F1F writes rIE = $05 instead of $07, so the STAT vector never fires --
  // "mode 0" on these levels means nothing runs, not the level-6 parallax.
  for (const n of [3, 4, 5, 7, 8, 12, 13, 14]) {
    assert.equal(rasterModeForLevel(n), RASTER_OFF, `level ${n}`);
  }
});

// --------------------------------------------------------------------------
// $058B -- the two sky layers
// --------------------------------------------------------------------------

test('$058B: $C742 gains 1 every 4th frame, $C743 gains 3 every frame', () => {
  const s = mkState();
  s.raster.mode = RASTER_PARALLAX;
  s.frame = 0x6C;                       // 0x6C & 3 == 0
  tickRaster(s);
  assert.equal(s.raster.far, 1);
  assert.equal(s.raster.mid, 3);
  s.frame = 0x6D;
  tickRaster(s);
  assert.equal(s.raster.far, 1);        // not a multiple of 4
  assert.equal(s.raster.mid, 6);
});

test('$058E: a paused frame ($C716) advances neither layer', () => {
  const s = mkState();
  s.raster.mode = RASTER_PARALLAX;
  s.flow.paused = true;
  s.frame = 0x6C;
  tickRaster(s);
  assert.equal(s.raster.far, 0);
  assert.equal(s.raster.mid, 0);
});

test('the layers only advance on the levels that run the arm', () => {
  const s = mkState();
  s.raster.mode = RASTER_WATER;
  s.frame = 0x6C;
  tickRaster(s);
  assert.equal(s.raster.mid, 0);
});

// --------------------------------------------------------------------------
// modes 2/3/4 -- the parallax sky
// --------------------------------------------------------------------------

test('parallaxBands fires at lines 0 / $30 / $40 (measured)', () => {
  const s = mkState();
  s.raster.mode = RASTER_PARALLAX;
  const b = parallaxBands(s, BASE);
  assert.deepEqual(b.map((x) => x.from), [0, 0x30, 0x40]);
});

test('parallaxBands applies one MORE $058B step than the state carries', () => {
  // Measured on level 9: the $0A4F sample of iteration 1 reads $C743 = 3 and
  // the mode-3 arm of the frame it produced reads 6, because the main loop
  // body runs above scanline $30.
  const s = mkState();
  s.raster.mode = RASTER_PARALLAX;
  s.raster.far = 27;
  s.raster.mid = 74;
  s.frame = 0x70;                       // & 3 == 0, so far steps too
  const b = parallaxBands(s, BASE);
  assert.equal(b[0].scx, 88 + (((28 - 88) & 0xFF) - 0x100));   // congruent to 28
  assert.equal(b[0].scx & 0xFF, 28);
  assert.equal(b[1].scx & 0xFF, 77);
  assert.equal(b[2].scx, BASE.scx);     // $08DD writes $FFA9 back
});

test('the mode-3 SCY step is a one-in-eight judder that carries to the bottom', () => {
  const s = mkState();
  s.raster.mode = RASTER_PARALLAX;
  s.frame = 0x70;                       // & 7 == 0
  let b = parallaxBands(s, BASE);
  assert.equal(b[0].scy, BASE.scy);
  assert.equal(b[1].scy, BASE.scy + 3);
  assert.equal(b[2].scy, BASE.scy + 3, '$08DD never writes rSCY');

  s.frame = 0x71;
  b = parallaxBands(s, BASE);
  assert.equal(b[1].scy, BASE.scy);
});

// --------------------------------------------------------------------------
// modes 0/1 -- the level-6 track
// --------------------------------------------------------------------------

test('trackBands fires at lines $22 and $70 (measured: exactly 2 a frame)', () => {
  const s = mkState();
  s.flow.parallaxScx = 193;
  const b = trackBands(s, BASE);
  assert.deepEqual(b.map((x) => x.from), [0, 0x22, 0x70]);
  assert.equal(b[0].scx, BASE.scx);
  assert.equal(b[1].scx & 0xFF, 193);
  assert.equal(b[2].scx, BASE.scx);
});

test('the level-6 SCY -2 is the same one-in-eight judder', () => {
  const s = mkState();
  s.frame = 0x70;
  assert.equal(trackBands(s, BASE)[1].scy, BASE.scy - 2);
  s.frame = 0x71;
  assert.equal(trackBands(s, BASE)[1].scy, BASE.scy);
  s.frame = 0x70;
  s.flow.paused = true;
  assert.equal(trackBands(s, BASE)[1].scy, BASE.scy, '$0882 gates on $C716');
});

// --------------------------------------------------------------------------
// mode 6 -- the water band
// --------------------------------------------------------------------------

test('a surface at or below $90 produces no bands at all ($08FE)', () => {
  const s = mkState();
  s.water.windowY = 0x90;
  assert.deepEqual(waterBands(s, BASE, 144), [BASE]);
});

test('the water chain steps 4 lines and stops before $8F ($091E-$0924)', () => {
  const s = mkState();
  s.water.windowY = 0x80;
  const b = waterBands(s, BASE, 144);
  // rLYC $80 -> $84 -> $88 -> $8C, and $8C + 4 = $90 >= $8F, so it re-arms.
  assert.deepEqual(b.slice(1).map((x) => x.from), [0x80, 0x84, 0x88, 0x8C]);
});

test('the wobble is sine[($FFB1 + LY>>1) & $1F] added to $FFA9', () => {
  const s = mkState();
  s.frame = 0xFE;                       // the value the ARM reads (post-VBlank)
  s.water.windowY = 95;
  const b = waterBands(s, BASE, 144);
  // Measured on the cartridge at level 1 f145: $FFB1 = 254, first band on
  // line 95, and SCX comes out $FFA9 + 5.
  assert.equal(b[1].from, 95);
  assert.equal(b[1].scx - BASE.scx, SINE[(0xFE + (95 >> 1)) & 0x1F]);
  assert.equal(b[1].scx - BASE.scx, 5);
});

test('every water band forces OBP0 $90 / OBP1 $80 and leaves SCY alone', () => {
  const s = mkState();
  s.water.windowY = 0x50;
  const b = waterBands(s, BASE, 144);
  for (const x of b.slice(1)) {
    assert.equal(x.obp0, 0x90);         // $091A
    assert.equal(x.obp1, 0x80);         // $0916
    assert.equal(x.scy, BASE.scy);      // mode 6 never touches rSCY
    assert.equal(x.bgp, BASE.bgp);
  }
  assert.equal(b[0].obp0, BASE.obp0, 'lines above the surface keep the base');
});

test('a missing sine table THROWS rather than degrading to a flat band', () => {
  const s = mkState({ tables: {} });
  s.water.windowY = 0x50;
  assert.throws(() => waterBands(s, BASE, 144), /tables\.sine/);
});

// --------------------------------------------------------------------------
// mode 7 -- the OPTIONS squash
// --------------------------------------------------------------------------

test('$084B/$084F: the delta ceiling is $0B, not the $0C it compares against', () => {
  // MEASURED: tools/oracle/rastersquash.py over 200 frames of the real
  // transition sees $C763 take every value 0..11 and never 12.
  const s = mkState();
  s.raster.mode = RASTER_SQUASH;
  s.raster.delta = 0x0A;
  s.frame = 0x08;                       // & 7 == 0
  tickRaster(s);
  assert.equal(s.raster.delta, 0x0B);
  tickRaster(s);
  assert.equal(s.raster.delta, 0x0B);
});

test('the delta only moves on every 8th frame, and $C766 reverses it', () => {
  const s = mkState();
  s.raster.mode = RASTER_SQUASH;
  s.frame = 0x09;
  tickRaster(s);
  assert.equal(s.raster.delta, 0);
  s.frame = 0x08;
  tickRaster(s);
  assert.equal(s.raster.delta, 1);
  s.raster.closing = 1;
  tickRaster(s);
  assert.equal(s.raster.delta, 0);
  tickRaster(s);
  assert.equal(s.raster.delta, 0, '$0846 floors at zero');
});

test('squashBands reproduces the measured delta-11 frame exactly', () => {
  // rastersquash.py, frame 199 of the real transition: $C763 = 11, base
  // rSCY = 0.
  //
  // THE LINE AN ARM RUNS ON IS NOT THE LINE ITS WRITE IS SEEN ON. $095A's
  // `LD [BC],A` is the LAST instruction of the arm for line y, by which time
  // the fetcher has already latched line y's scroll -- so the value lands from
  // line y+1. Every other arm in $0857 re-arms rLYC several lines ahead and
  // the distinction never shows; mode 7 re-arms EVERY line, so here it is the
  // whole difference between right and wrong.
  //
  // MEASURED (tools/oracle/rastersquash.py, and now squashdiff.mjs over 240
  // frames / 33,984 scanlines): for y = 23..67 without exception, cartridge
  // scanline y carries the SCY the unshifted model computed for y-1. The value
  // SEQUENCE was already byte-identical, which is exactly why nine green
  // rasterdiff scenarios never saw it -- and why menuscreen.mjs `options` sat
  // at 22004/23040 with the first bad pixel at (13,23).
  const s = mkState({ frame: 0, water: null });
  s.raster.mode = RASTER_SQUASH;
  s.raster.delta = 11;
  const flat = { from: 0, scx: 0, scy: 0, bgp: 0xE4, obp0: 0xE4, obp1: 0xE4 };
  const { bands, handoff } = squashBands(s, flat, 144);

  assert.equal(bands[22].scy, 0);
  assert.equal(bands[23].scy, 0, 'line 23 still shows what line 22 computed');
  assert.equal(bands[24].scy, 1);
  assert.equal(bands[45].scy, 22);
  assert.equal(bands[46].scy, 23);
  assert.equal(bands[47].scy, 25, 'the 2-per-line phase, one line later');
  assert.equal(bands[67].scy, 65);
  // $094B crosses $44 on line 68's arm: rSCY is written 0 ($0957 XOR A),
  // rBGP becomes $1B, and the chain stops -- all of it visible from line 69.
  assert.equal(bands[68].scy, 67, 'line 68 still shows line 67 arm output');
  assert.equal(bands[68].bgp, 0xE4);
  assert.equal(bands[69].scy, 0);
  assert.equal(bands[69].bgp, 0x1B);
  assert.equal(bands[143].scy, 0);
  assert.equal(bands[143].bgp, 0x1B);
  // $FFAC is rLYC AFTER $0937's INC, so the window starts one line lower --
  // and it lands on exactly the first line the $1B palette is seen on.
  assert.equal(handoff, 69);
  assert.equal(bands[handoff].bgp, 0x1B,
    'the window starts on the first line the squash palette actually shows');
});

test('squashBands reproduces the measured delta-7 frame too', () => {
  const s = mkState({ frame: 0, water: null });
  s.raster.mode = RASTER_SQUASH;
  s.raster.delta = 7;
  const flat = { from: 0, scx: 0, scy: 0, bgp: 0xE4, obp0: 0xE4, obp1: 0xE4 };
  const { bands, handoff } = squashBands(s, flat, 144);
  assert.equal(bands[87].bgp, 0xE4);
  assert.equal(bands[88].bgp, 0xE4, 'the arm runs on 88; the write shows on 89');
  assert.equal(bands[89].bgp, 0x1B);
  assert.equal(handoff, 89);            // measured $FFAC on that frame
});

test('every squash band shows the PREVIOUS line arm output, on every delta', () => {
  // The shift is a property of the arm, not of one recorded frame: band y is
  // whatever band y-1's arm computed, for every delta $C763 can hold (0-$0B)
  // and every line above the handoff. Stated as an invariant so a "tidy-up"
  // that re-aligns one measured frame cannot pass by moving the other.
  for (let delta = 0; delta <= 0x0B; delta++) {
    const s = mkState({ frame: 0, water: null });
    s.raster.mode = RASTER_SQUASH;
    s.raster.delta = delta;
    const flat = { from: 0, scx: 0, scy: 0, bgp: 0xE4, obp0: 0xE4, obp1: 0xE4 };
    const { bands, handoff } = squashBands(s, flat, 144);
    // Line 0 can never have been written by anything: no arm has run yet.
    assert.equal(bands[0].scy, 0, `delta ${delta}: line 0 is the base scroll`);
    assert.equal(bands[0].bgp, 0xE4, `delta ${delta}`);
    if (handoff !== null) {
      assert.equal(bands[handoff - 1].bgp, 0xE4,
        `delta ${delta}: the handoff line itself still shows the old palette`);
      assert.equal(bands[handoff].bgp, 0x1B, `delta ${delta}`);
    }
  }
});

test('a zero delta never hands off -- 144 flat bands', () => {
  const s = mkState({ frame: 0, water: null });
  s.raster.mode = RASTER_SQUASH;
  const flat = { from: 0, scx: 0, scy: 0, bgp: 0xE4, obp0: 0xE4, obp1: 0xE4 };
  const { bands, handoff } = squashBands(s, flat, 144);
  assert.equal(handoff, null);
  assert.equal(bands.length, 144);
  assert.ok(bands.every((b) => b.scy === 0 && b.bgp === 0xE4));
});

// ---------------------------------------------------------------------------
// sub_00_0F56 -- the draw-Y bob.  ROM: $0F56-$0F7A, called from $1D24 (player)
// and 1:$606F (enemies).
// ---------------------------------------------------------------------------

test('the draw-Y bob fires on levels 6/9/10/11 only, one frame in eight', () => {
  // MEASURED (oamorder.py vs oamport.mjs on level 9, frames 1-5): the cartridge
  // puts the 3x3 enemy block at OAM y = 48 on f3 and 45 on f4, and the port held
  // 48 on both before this landed. f4 is the frame $FFB1 reaches $70, and
  // $70 & 7 == 0 -- the phase comes from level.js seeding $6D (docs/03 §27).
  const s = createState(makeTunables());
  const at = (level, frame, grounded = true) => {
    s.level.number = level;
    s.frame = frame;
    s.flow.paused = false;
    return drawYBob(s, grounded);
  };

  // $0F6B: levels 9/$0A/$0B load D = $FD.
  for (const lvl of [0x09, 0x0A, 0x0B]) assert.equal(at(lvl, 0x70), -3, `level ${lvl}`);
  // $0F67: level 6 loads D = $FE instead.
  assert.equal(at(0x06, 0x70), -2, 'level 6 bobs 2 px, not 3');
  // $0F66: RET NZ -- every other level does not bob at all.
  for (const lvl of [1, 2, 3, 4, 5, 7, 8, 0x0C, 0x0D, 0x0E]) {
    assert.equal(at(lvl, 0x70), 0, `level ${lvl} must not bob`);
  }

  // $0F6F: AND $07 / RET NZ -- exactly one frame in eight.
  const hits = [];
  for (let f = 0x6D; f < 0x6D + 16; f++) if (at(0x09, f) !== 0) hits.push(f & 0xFF);
  assert.deepEqual(hits, [0x70, 0x78], 'only $FFB1 & 7 == 0');

  // $0F72: $C716 -- a paused frame does not bob.
  s.level.number = 0x09; s.frame = 0x70; s.flow.paused = true;
  assert.equal(drawYBob(s, true), 0, 'paused freezes the bob');

  // $1D22 / 1:$606D: both call sites skip it unless GROUNDED.
  assert.equal(at(0x09, 0x70, false), 0, 'airborne does not bob');
});

test('the enemy bob gate reads r[0], the AIR bits -- not r[1]', () => {
  // ROM: 1:$6069 is `LD DE,$FFFA / ADD HL,DE`, then $606A `LD A,(HL) / AND $03
  // / JR NZ` skips sub_00_0F56. MEASURED by hooking 1:$606A over 600 frames of
  // level 9: HL lands on record offset +0 on 289 of 289 calls. Offset +0 is the
  // flags byte whose bits 0-1 are the air state -- the same `r[0] & 0x03` that
  // batarang.js tests for an airborne boss 2.
  //
  // The port shipped `r[1] & 0x03`, which is almost always 0, so it bobbed
  // AIRBORNE enemies the cartridge exempts. Reported from play as the train
  // levels flickering "up and down like crazy" while the real game looked
  // calmer: on level 9 the diving flyer glides on the cartridge and popped 3 px
  // every 8th frame here. MEASURED: 19 frames of a 600-frame run had the flyer
  // at port Y = cart Y - 3, all on $FFB1 & 7 == 0 frames; at f76 the block was
  // 9 OAM entries wrong and is 0 now.
  //
  // This asserts the OPERAND, which drawYBob's own tests cannot see -- they
  // pass `grounded` in directly, so they stayed green through the whole bug.
  // PATH ONLY: queueDraw moved from src/enemies.js to src/enemies/anim.js in
  // the Phase-7 split. One constant, so the next move is one line -- same
  // shape as frameorder.test.js's TICK_SOURCE.
  const QUEUEDRAW_SOURCE = '../src/enemies/anim.js';
  const src = readFileSync(new URL(QUEUEDRAW_SOURCE, import.meta.url), 'utf8');
  const call = src.match(/drawYBob\(state,\s*\(r\[(\d)\]\s*&\s*0x03\)\s*===\s*0\)/);
  assert.ok(call, 'queueDraw still gates drawYBob on a record byte & 0x03');
  assert.equal(call[1], '0',
    '1:$606A reads record offset +0 (the air bits), not +1 -- reading r[1] '
    + 'bobs airborne enemies the cartridge leaves alone');
});
