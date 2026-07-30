// Per-scanline raster effects.  ROM: the STAT program at loc_00_0857, driven
// from the VBlank half at $081E-$0852.
//
// $FFC7 selects one of eight arms.  Each one sets rSCX/rSCY (and sometimes the
// palettes) for the lines below it and programs rLYC for where the NEXT one
// fires, so the eight arms are really four little state machines:
//
//   0 <-> 1     level 6 only.  The $FFCC track parallax.
//   2 -> 3 -> 4 levels 9/10/11.  The three-band sky.
//   5           the stage-clear picture.  One-shot, parks the window.
//   6           levels 1/2.  The water band: a sine wobble every 4 lines.
//   7           the OPTIONS squash.  Re-arms itself every single line.
//
// Which arm a level gets is decided ONCE, at $0E74, and it is a plain level
// test -- see rasterModeForLevel().  Every other level leaves $FFC7 at the 0
// that $0D50 wrote and then disables the STAT interrupt entirely (`rIE = $05`
// at $0F27, versus $07 on the three raster paths), so mode 0 does NOT mean
// "the level-6 parallax" on those levels; it means nothing runs at all.
//
// ---------------------------------------------------------------------------
// TWO MEASURED TIMING FACTS, both of which a plausible-looking port gets wrong
//
// 1. The arms read $FFB1 AFTER the VBlank increment ($0805).  The main-loop
//    code that feeds them read it BEFORE.  So at render time -- after tick()
//    has bumped state.frame -- state.frame is already the value the STAT
//    program sees.  That is why the judder tests below use it raw.
//
// 2. The main loop body runs during the VISIBLE part of the frame it is
//    scrolling, and $058B (the parallax layer advance) sits near the very top
//    of it, well above scanline $30.  So display frame N shows iteration N's
//    CAMERA but iteration N+1's $C742/$C743.  Measured, not deduced: on level
//    9 the $0A4F sample of iteration 1 reads $C743 = 3 and the mode-3 arm of
//    the frame it produced reads 6.  parallaxBands() therefore applies one
//    more $058B step than the state carries.  Get this wrong and the mid layer
//    sits a constant 3 px out -- invisible in a screenshot, 8016 wrong
//    scanlines in a diff.

/** $FFC7 values, plus one for "the STAT interrupt is masked off". */
export const RASTER_OFF = -1;
export const RASTER_TRACK = 0;      // $0F11, level 6
export const RASTER_PARALLAX = 2;   // $0EB0, levels 9/10/11
export const RASTER_WINDOW_OFF = 5; // $35B0, the stage-clear picture
export const RASTER_WATER = 6;      // $0ED7, levels 1/2
export const RASTER_SQUASH = 7;     // $38AB, the options transition

/**
 * ROM: loc_00_0E74, the whole of it.  Reached from $0DDB/$0E34/$0E4F, i.e. the
 * tail of every level load.
 *
 *   $FFB0 == 1 or 2         -> loc_00_0EC3: $FFC7 = 6, rLYC = $80, rIE = $07
 *   $FFB0 == 9, $0A or $0B  -> loc_00_0E8A: $FFC7 = 2, rLYC = $00, rIE = $07
 *   $FFB0 == 6              -> loc_00_0EEA: $FFC7 = 0, rLYC = $22, rIE = $07
 *   anything else           -> loc_00_0F1F: rWY = $90, rIE = $05
 *
 * The last arm is the one that is easy to miss: it does not write $FFC7 at
 * all, it *masks the STAT interrupt off*.  $FFC7 is still the 0 that $0D50
 * left there, so reading the mode alone would run level 6's parallax on eight
 * levels that must be flat.
 */
export function rasterModeForLevel(n) {
  if (n === 0x01 || n === 0x02) return RASTER_WATER;
  if (n === 0x09 || n === 0x0A || n === 0x0B) return RASTER_PARALLAX;
  if (n === 0x06) return RASTER_TRACK;
  return RASTER_OFF;
}

/** ROM: $084B/$084F -- INC, CP $0C, and on carry-clear store $0B. */
const DELTA_MAX = 0x0B;
/** ROM: $094B -- where the window takes over. */
const WINDOW_HANDOFF = 0x44;
/** ROM: $094F -- the palette the squashed region is drawn with. */
const SQUASH_BGP = 0x1B;

/** ROM: $08B2 / $08D3 -- the two fixed handoff lines of the sky chain. */
const PARALLAX_MID_LINE = 0x30;
const PARALLAX_NEAR_LINE = 0x40;
/** ROM: $0F19 / $088E -- the two fixed handoff lines of the level-6 chain. */
const TRACK_TOP_LINE = 0x22;
const TRACK_BOTTOM_LINE = 0x70;
/** ROM: $0920/$0922 -- the water chain steps 4 lines and stops below $8F. */
const WATER_STEP = 4;
const WATER_LAST_LINE = 0x8F;
/** ROM: $0916/$091A -- the palettes a submerged sprite is drawn through. */
const WATER_OBP1 = 0x80;
const WATER_OBP0 = 0x90;

export function createRaster() {
  return {
    mode: RASTER_OFF,   // $FFC7 (or RASTER_OFF when rIE has STAT masked)
    far: 0,             // $C742
    mid: 0,             // $C743
    delta: 0,           // $C763, per-scanline SCY step
    accInt: 0,          // $C764
    accFrac: 0,         // $C765
    closing: 0,         // $C766: 0 ramps the delta up, non-zero ramps it down
  };
}

/**
 * A hardware scroll register is 8 bits and wraps the 32x32 tilemap; our
 * renderer samples the level map in WORLD pixels instead, because the game
 * streams the level's own columns into that tilemap as the camera moves.  The
 * two agree on the picture as long as the world value chosen is the one
 * CONGRUENT to the register modulo 256 and nearest the camera -- which is
 * exactly the column the streamer had put there.
 *
 * For every arm that writes back $FFA9 this returns `base` unchanged, so it
 * costs nothing where it is not needed.
 */
function regToWorld(base, reg) {
  let d = (reg - base) & 0xFF;
  if (d > 0x7F) d -= 0x100;
  return base + d;
}

/**
 * ROM: $0805 + $081E-$0852, the VBlank half.  Runs once a frame BEFORE the
 * scanlines.  Only the mode-7 delta ramp and the $058B layer advance persist;
 * everything else is recomputed per line.
 *
 * $058B is main-loop code rather than ISR code ($057D dispatches to it for
 * levels 9/10/11 only) but it belongs to this system, so it lives here.
 */
export function tickRaster(state) {
  const r = state.raster;

  // $058B-$05A3: the two sky layers advance on their own, and stop while
  // paused ($058E reads $C716).  $C742 gains 1 every 4th frame, $C743 gains 3
  // every frame -- which is what makes the sky move with the camera still.
  if (r.mode === RASTER_PARALLAX && !state.flow.paused) {
    if ((state.frame & 0x03) === 0) r.far = (r.far + 1) & 0xFF;   // $0591/$0597
    r.mid = (r.mid + 3) & 0xFF;                                   // $059E
  }

  // $0830-$0834: the mode-7 accumulator is cleared every frame.
  r.accInt = 0;
  r.accFrac = 0;
  if (r.mode !== RASTER_SQUASH) return;          // $0829: CP $07 / JR NZ
  if ((state.frame & 0x07) !== 0) return;        // $0835: every 8th frame

  if (r.closing) {
    r.delta = Math.max(0, r.delta - 1);          // $0842/$0846
  } else {
    // $084A-$084F: INC, CP $0C, and the value STORED on the clamp is $0B, not
    // $0C -- the compare constant is one above the ceiling.
    r.delta = Math.min(DELTA_MAX, r.delta + 1);
  }
}

/**
 * MODE 2/3/4 -- the levels 9/10/11 parallax sky ($08A9 -> $08BC -> $08DD, then
 * rLYC = 0 to start over).  Three fires per frame at lines 0 / $30 / $40:
 * MEASURED on the cartridge, and fixed, so the whole effect is which scroll
 * each band carries.
 *
 *   lines  0-$2F   SCX = $C742          the far layer
 *   lines $30-$3F  SCX = $C743          the mid layer, and SCY += 3
 *   lines $40+     SCX = $FFA9          the camera itself
 *
 * The SCY step is NOT part of the parallax: $08C1 gates it on $FFB1 & 7 == 0
 * and on $C716, so it is a one-frame-in-eight judder of the lower two thirds
 * of the screen.  Mode 4 never writes rSCY, so the judder carries down from
 * line $30 to the bottom rather than ending at $40.
 */
export function parallaxBands(state, base) {
  const r = state.raster;

  // See TIMING FACT 2 at the top of this file: the arms read $C742/$C743 after
  // the NEXT iteration's $058B has already run.  state.frame is post-increment
  // here, so it is that iteration's $FFB1.
  let far = r.far;
  let mid = r.mid;
  if (!state.flow.paused) {
    if ((state.frame & 0x03) === 0) far = (far + 1) & 0xFF;
    mid = (mid + 3) & 0xFF;
  }

  const judder = (state.frame & 0x07) === 0 && !state.flow.paused;  // $08C1/$08C7
  const midScy = judder ? base.scy + 3 : base.scy;                  // $08CF
  return [
    { ...base, from: 0, scx: regToWorld(base.scx, far) },
    { ...base, from: PARALLAX_MID_LINE, scx: regToWorld(base.scx, mid),
      scy: midScy },
    // $08DD writes rSCX only, so the judder persists to the bottom.
    { ...base, from: PARALLAX_NEAR_LINE, scx: base.scx, scy: midScy },
  ];
}

/**
 * MODE 0/1 -- the level-6 track parallax ($0878 -> $0898 -> $0878).  Two arms
 * alternating on rLYC $70 and $22:
 *
 *   lines  0-$21   the plain camera        (whatever VBlank left)
 *   lines $22-$6F  SCX = $FFCC, SCY = $FFAA - 2
 *   lines $70+     back to $FFA9 / $FFAA
 *
 * $FFCC is loc_00_2EF4's derived scroll -- the same $FFCA/$FFCB track the
 * type-$0B conveyor deck rides, turned into a screen offset at $2F5C.  So the
 * middle third of level 6 scrolls with the moving deck instead of the camera.
 *
 * The SCY -2 is the same one-in-eight judder mode 3 has ($087A/$087E), not a
 * standing offset.
 */
export function trackBands(state, base) {
  const scx = regToWorld(base.scx, state.flow.parallaxScx & 0xFF);  // $088A
  const judder = (state.frame & 0x07) === 0 && !state.flow.paused;  // $087A/$0882
  return [
    { ...base, from: 0 },
    { ...base, from: TRACK_TOP_LINE, scx, scy: judder ? base.scy - 2 : base.scy },
    { ...base, from: TRACK_BOTTOM_LINE },
  ];
}

/**
 * MODE 6 -- the levels 1/2 water band (loc_00_08F0).
 *
 * The chain starts at the water-surface scanline $C755, fires every FOUR lines
 * and stops once the next line would reach $8F, at which point it re-arms at
 * $C755 for the following frame ($091E-$092F).  Each fire does two things:
 *
 *   rSCX  = $FFA9 + sine[($FFB1 + (LY >> 1)) & $1F]     0:$09A2, signed
 *   rOBP1 = $80, rOBP0 = $90
 *
 * The SCX wobble is the refraction: the background under the surface is
 * displaced by up to +-10 px, in a sine that scrolls a phase step per frame
 * AND a phase step per two scanlines, which is what makes it look like water
 * moving rather than a static ripple.  It is visible for the same reason the
 * water is translucent -- the window slab that would cover it is parked at
 * $90 on odd frames ($2D65), while $C755 keeps the surface line.
 *
 * The palette half is the part that is visible unconditionally: OBP0 $90 and
 * OBP1 $80 flatten every sprite below the waterline, which is how Batman goes
 * dark when he wades in.
 *
 * The table is a MANIFEST table, not an inlined constant -- nothing
 * ROM-derived is committed.  A missing one throws rather than degrading to a
 * flat band that would look almost right.
 */
export function waterBands(state, base, height) {
  const surf = state.water ? state.water.windowY & 0xFF : 0x90;    // $C755
  // $08F5/$08FE: rLY >= $90 or $C755 >= $90 both go to loc_00_0928, which
  // parks rLYC at $8F and writes nothing at all.
  if (surf >= 0x90) return [base];

  const sine = state.tables && state.tables.sine;
  if (!sine || sine.length !== 32) {
    throw new Error('raster: tables.sine (0:$09A2, 32 signed bytes) is missing '
                    + 'from assets/manifest.json -- re-run tools/export_assets.py');
  }

  const bands = [base];
  for (let ly = surf; ly < height; ly += WATER_STEP) {
    // $0900-$0910: B = LY >> 1, index = ($FFB1 + B) & $1F.  state.frame is
    // post-increment at render time, which is the value the ISR reads.
    const phase = (state.frame + (ly >> 1)) & 0x1F;
    bands.push({
      from: ly,
      scx: base.scx + sine[phase],       // $0911: ADD to $FFA9
      scy: base.scy,                     // mode 6 never touches rSCY
      bgp: base.bgp,
      obp0: WATER_OBP0,                  // $091A
      obp1: WATER_OBP1,                  // $0916
    });
    // $091E-$0924: the NEXT rLYC is LY + 4, and the chain ends when that
    // would reach $8F -- so the last band starts below $8F - 4, not at $8F.
    if (ly + WATER_STEP >= WATER_LAST_LINE) break;
  }
  return bands;
}

/**
 * MODE 7 -- the OPTIONS squash (loc_00_0935).  Per SCANLINE:
 *
 *     $C765 += $C763          16-bit fraction, carrying into $C764
 *     rSCY  += $C764          scroll THIS line by the accumulated integer
 *     if rSCY >= $44:  rBGP = $1B, window Y = this line, stop
 *
 * So every line down the screen is scrolled a little more than the one above
 * it -- an accelerating vertical squash -- and the line where the running
 * total crosses $44 is where the window, i.e. the options panel, begins.
 *
 * renderer.js already resolves bandFor(bands, y) INSIDE its per-scanline loop,
 * so handing it 144 bands needs no renderer change at all.
 *
 * THE HANDOFF, measured with tools/oracle/rastersquash.py rather than read off
 * the listing, because two details are easy to get backwards and neither is
 * visible in a screenshot:
 *
 *   * on the handoff line rSCY is written **0**, not the accumulated value.
 *     $0957 is `XOR A` and $095A stores A -- the same store the ordinary path
 *     uses. The chain then stops (rLYC = 0 can no longer match), so every line
 *     below the handoff keeps SCY 0 and BGP $1B.
 *   * $FFAC is rLYC read at $0953, and $0937 has ALREADY incremented it -- so
 *     the window starts one line BELOW the handoff line. Measured: delta 11
 *     hands off on line 68 with $FFAC = 69; delta 7 on line 88 with $FFAC = 89.
 *   * and a third, added later and worth as much as the other two: the line an
 *     arm RUNS on is not the line its write is SEEN on. See the body -- every
 *     value above lands one scanline lower than the arm that wrote it.
 *
 * Covered by tools/oracle/squashdiff.mjs (33,984 scanlines, every $C763 value
 * 0-11) because rasterdiff.mjs structurally cannot reach a screen-owned arm.
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
  let scy = base.scy & 0xFF;
  let bgp = base.bgp;
  let handoff = null;
  let stopped = false;

  for (let y = 0; y < height; y++) {
    // WHICH LINE A WRITE LANDS ON, and it is one below where the arm runs.
    //
    // The arm for line y fires ON line y ($0937 has re-armed rLYC to y) and
    // its `LD [BC],A` at $095A is the LAST thing it does -- by which time the
    // fetcher has long since latched line y's scroll. So the value it stores
    // is displayed from line y+1. Every other arm in this file re-arms rLYC
    // several lines ahead and the distinction never shows; mode 7 re-arms
    // EVERY line, so here it is the whole difference between right and wrong.
    //
    // MEASURED, not deduced: for y = 23..67 without exception, cartridge
    // scanline y carries the SCY the unshifted model computes for y-1 (line 23
    // shows 0 where the model said 1, ... line 67 shows 65 where it said 67).
    // The value SEQUENCE was already byte-identical; only its line assignment
    // was off, which is why the register-stream comparison in rasterdiff was
    // never going to catch it and 1036 pixels of menuscreen.mjs were.
    //
    // So: emit the state the previous line's arm left, THEN run this line's.
    bands.push({ from: y, scx: base.scx, scy, bgp,
                 obp0: base.obp0, obp1: base.obp1 });
    if (stopped) continue;                  // rLYC = 0 can no longer match

    // $0941-$0948: the 16-bit add, fraction first.
    accFrac += r.delta;
    accInt += accFrac >> 8;
    accFrac &= 0xFF;

    // $0949-$094A: rSCY accumulates -- it is NOT recomputed from a base. And
    // it is a BYTE: `LD [BC],A` at $095A stores 8 bits, so the scroll wraps
    // round the 32-row tilemap rather than running off into nothing.
    const next = (scy + accInt) & 0xFF;

    if (next >= WINDOW_HANDOFF) {           // $094B: CP $44 / JR C
      handoff = y + 1;                      // $0953: rLYC, post-$0937 INC
      scy = 0;                              // $0957/$095A: XOR A, then store
      bgp = SQUASH_BGP;                     // $094F
      stopped = true;
      continue;
    }
    scy = next;
  }
  return { bands, handoff };
}
