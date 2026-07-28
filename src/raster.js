// Per-scanline raster effects.  ROM: the STAT program at loc_00_0857, driven
// from VBlank at $0825-$0852.
//
// $FFC7 selects one of eight arms, each setting rSCX/rSCY (and sometimes rBGP)
// for the lines below it and programming rLYC for where the next one fires.
// Only mode 7 -- the OPTIONS squash -- is ported so far; modes 1-6 belong to
// the level screens and are still a single flat band.
//
// MODE 7, loc_00_0935, is what makes the title scrunch upward while the
// options panel rises from the bottom. Per SCANLINE:
//
//     $C765 += $C763          16-bit fraction, carrying into $C764
//     rSCY  += $C764          scroll THIS line by the accumulated integer
//     if rSCY >= $44:  rBGP = $1B, window Y = this line, stop
//
// So every line down the screen is scrolled a little more than the one above
// it -- an accelerating vertical squash -- and the line where the running
// total crosses $44 is where the window, i.e. the options panel, begins.
//
// Per FRAME ($0825-$0852) the accumulator resets and, every 8th frame, the
// per-line delta $C763 ramps 0 -> $0C going in and back to 0 coming out
// ($C766 picks the direction). One byte ramping over ~96 frames is the whole
// animation: as it grows the squash tightens AND the panel boundary climbs.

/** ROM: $084B -- the delta clamps at $0C. */
const DELTA_MAX = 0x0C;
/** ROM: $094B -- where the window takes over. */
const WINDOW_HANDOFF = 0x44;
/** ROM: $094F -- the palette the squashed region is drawn with. */
const SQUASH_BGP = 0x1B;

/**
 * MODE 2, the levels 9/10/11 PARALLAX ($08A9 -> $08BC -> $08DD, then rLYC = 0
 * to start again). Three bands per frame, at fixed scanlines:
 *
 *   lines  0-$2F   SCX = $C742     far layer
 *   lines $30-$3F  SCX = $C743     mid layer
 *   lines $40+     SCX = $FFA9     the camera itself
 *
 * The two layers drift on their own ($058B, skipped while paused): $C742 gains
 * 1 every 4th frame and $C743 gains 3 EVERY frame, which is what makes the sky
 * move without the camera moving.
 */
const PARALLAX_MID_LINE = 0x30;
const PARALLAX_NEAR_LINE = 0x40;

export function createRaster() {
  return {
    mode: 0,        // $FFC7
    far: 0,         // $C742
    mid: 0,         // $C743
    delta: 0,       // $C763, per-scanline SCY step
    accInt: 0,      // $C764
    accFrac: 0,     // $C765
    closing: 0,     // $C766: 0 ramps the delta up, non-zero ramps it down
  };
}

/**
 * ROM: $0825-$0852, the VBlank half. Runs once a frame BEFORE the scanlines.
 *
 * The accumulator is cleared every frame ($0833/$0834 write $C765 then $C764);
 * only the delta persists, and it moves just one step every 8th frame, which
 * is what makes the transition take about a second and a half rather than a
 * fifth of one.
 */
export function tickRaster(state) {
  const r = state.raster;

  // $058B: the parallax layers advance on their own, and stop while paused.
  if (r.mode === 2 && !state.flow.paused) {
    if ((state.frame & 0x03) === 0) r.far = (r.far + 1) & 0xFF;   // $0597
    r.mid = (r.mid + 3) & 0xFF;                                   // $059E
  }

  r.accInt = 0;
  r.accFrac = 0;
  if (r.mode !== 7) return;
  if ((state.frame & 0x07) !== 0) return;        // $0835: every 8th frame

  if (r.closing) {
    r.delta = Math.max(0, r.delta - 1);          // $0842/$0846
  } else {
    r.delta = Math.min(DELTA_MAX, r.delta + 1);  // $084A/$084B
  }
}

/** ROM: $08A9/$08BC/$08DD. Three bands, fixed lines, per-layer SCX. */
export function parallaxBands(state, base) {
  const r = state.raster;
  // $08CD: from line $30 down, SCY gains 3 -- but only every 8th frame, so it
  // is a periodic judder rather than a constant offset. Reproduced as measured.
  const midScy = (state.frame & 0x07) === 0 ? base.scy + 3 : base.scy;
  return [
    { ...base, from: 0, scx: r.far },
    { ...base, from: PARALLAX_MID_LINE, scx: r.mid, scy: midScy },
    { ...base, from: PARALLAX_NEAR_LINE, scx: base.scx, scy: midScy },
  ];
}

/**
 * Expand mode 7 into one band per scanline.
 *
 * renderer.js already resolves `bandFor(bands, y)` INSIDE its per-scanline
 * loop, so handing it 144 bands needs no renderer change at all -- which is
 * why this effect costs four bytes of state rather than a rendering rewrite.
 *
 * @param base    the flat band the screen would otherwise use
 * @param height  scanlines to cover
 * @returns bands, plus the scanline the window should start on (or null)
 */
export function squashBands(state, base, height) {
  const r = state.raster;
  const bands = [];
  let accInt = 0;
  let accFrac = 0;
  let scy = base.scy;
  let handoff = null;

  for (let y = 0; y < height; y++) {
    // $0941-$0948: the 16-bit add, fraction first.
    accFrac += r.delta;
    accInt += accFrac >> 8;
    accFrac &= 0xFF;

    // $0949-$094A: rSCY accumulates -- it is NOT recomputed from a base. And
    // it is a BYTE: `LD [BC],A` at $095A stores 8 bits, so the scroll wraps
    // round the 32-row tilemap rather than running off into nothing.
    scy = (scy + accInt) & 0xFF;

    // $094B: once the scroll passes $44 the window takes over and the STAT
    // chain stops, so every line below this one keeps the last values.
    if (handoff === null && scy >= WINDOW_HANDOFF) {
      handoff = y;
    }
    bands.push({
      from: y,
      scx: base.scx,
      scy,
      bgp: handoff === null ? base.bgp : SQUASH_BGP,   // $094F
      obp0: base.obp0,
      obp1: base.obp1,
    });
  }
  return { bands, handoff };
}
