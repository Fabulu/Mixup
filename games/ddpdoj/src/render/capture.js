// THE BOARD CAPTURE, and the one place the ship is spliced into it.
//
// Shared by the demo page and by `tools/pixpack.mjs`'s self-verification, so
// the splice the page performs is the same code the packer proves correct
// rather than a second implementation of it.
//
// WHY A SPLICE EXISTS AT ALL.  The port computes the player and nothing else
// that reaches the screen: main-loop call #4 ($23D2AE, the display-list build)
// is unported, and so are 18 of the 20 top-level object handlers.  So the page
// replays the board's own display list and MOVES the ship's records to the
// port's position.  Which records those are is a MEASUREMENT -- see
// `tools/pixpack.mjs`; it is not a constant anybody typed in.
//
// THE ONE-FRAME LAG IS PART OF THE CONTRACT.  `:igs023:spritebuffer` lags main
// RAM by one frame (PLAN §Assets, re-measured by the packer's lag sweep: lag 1
// gives three offsets holding on 161/161 captured frames, lag 0 and lag 2 give
// none).  So the position handed to `splice` must be the position of the
// PREVIOUS logic frame, not the current one.

// -------------------------- WAVE 9: THE MATCHER WAS ASKING THE WRONG QUESTION
//
// A play report found a "fireball" flying off on its own, and then, when that
// was chased down, a SHADOW doing the same thing.  Both were player-attached
// records the matcher had rejected.  The threshold was not the bug; the SHAPE
// of the question was.
//
// `pixpack.mjs` asks: **is this record at a constant offset from the ship in
// >= 90 % of frames?**  That conflates two independent things:
//
//   (a) is the record PRESENT this frame?   varies for reasons that say nothing
//       about attachment -- and on this hardware the big one is that ALTERNATE-
//       FRAME DRAWING IS HOW TRANSPARENCY WAS FAKED.  A sprite drawn every
//       other frame at 59.19 Hz reads as ~50 % translucent on a CRT.  Shadows
//       and exhaust plumes are exactly the things done that way, so an entire
//       CLASS of player-attached records can never score above ~50 % on (a).
//   (b) GIVEN it is present, is it where the ship says it should be?
//
// (b) is attachment.  (a) is a property of the artwork's transparency
// technique and of what the capture happens to fly over.  So this file scores
// CONDITIONAL ON PRESENCE: of the frames in which a record of this appearance
// class exists at all, in what fraction is it at its predicted position?  A
// real attachment scores ~100 % however rarely it appears; a coincidence still
// fails.  A minimum sample stops a record seen twice passing on 2/2.
//
// MEASURED, all 161 frames, every class, `tools/attachreport.mjs`:
//
//   class              present  phase  model   offset       score   what
//   3x32 c0  p0 f0     161/161  every  rigid   (-24,-16)    100.0%  THE SHIP
//   2x16 c0  p0 f0     161/161  every  rigid   (-16, 24)    100.0%  option pod
//   2x16 c0  p0 f2     161/161  every  rigid   (-16,-41)    100.0%  option pod
//   5x40 c2  p0 f0      80/161  ODD    rigid   (-52,-20)    100.0%  exhaust plume
//   1x32 c26 p0 f0      80/161  ODD    rigid   (-30,-16)    100.0%  exhaust glow
//   1x16 c24 p0 f0      81/161  EVEN   ground  (  0,  0)    100.0%  SHIP SHADOW
//   1x8  c24 p0 f0      81/161  EVEN   ground  (  0, 20)    100.0%  option shadow
//   1x8  c24 p0 f2      81/161  EVEN   ground  (  0,-12)    100.0%  option shadow
//   ---- and the best REJECT ----
//   1x1  c0  p0 f0      70/161  irreg  rigid   (-1428,-83)   58.6%  a 16x1 stub
//   4x40 c11 p0 f0      27/161  ODD    rigid   (-41, 97)      7.4%
//   2x16 c24 p0 f0      27/161  EVEN   rigid   (-113,133)     7.4%  an ENEMY's shadow
//
// EIGHT accepted, and the gap between the worst accepted (100 %) and the best
// rejected (58.6 %) is forty points.  The old presence test's gap was 80
// frames against 41 and it still could not see the shadows at all.
//
// THE PHASE IS A FINDING IN ITSELF.  The exhaust is on ODD frames, the shadow
// on EVEN frames, and **no frame carries both** -- they INTERLEAVE rather than
// sharing a phase.  Whether that is two independent 50 %-transparency effects
// that happen to be out of step, or one sprite-budget alternation, is not
// decided by this measurement.  What it does mean is that reproducing the
// flicker exactly -- which is what this code does, because it moves records and
// never invents them -- is faithful to the board but may read as strobing on a
// 60 Hz LCD rather than as translucency.  That is a fidelity decision with a
// precedent in this repo (Batman's water dither, deliberately not reproduced)
// and it is the OWNER's to make.  It is written up in
// `docs/worklog/ddpdoj/09-impl-tate-and-honest-page.md` §"the flicker
// question"; NOBODY SHOULD QUIETLY "FIX" IT by drawing these every frame at
// half alpha, which would look better and diverge from the board.
//
// THE SHADOWS ARE NOT AT A CONSTANT OFFSET -- and that is why no threshold on
// the old question could ever have found them.  They sit on a GROUND PLANE:
// halfway between the object and a fixed point.  That is not a guess, it is
// `$249E7E`'s own arithmetic, and `shadowProject` below is a transcription of
// it that reproduces the board's shadow record EXACTLY on 81 of 81 frames.
//
// THE PODS ARE NOT AND WERE NOT BROKEN.  07-review.md D1 is right that the page
// CLAIMED they were "computed live" and they are not -- the option object
// $24C096 is one of `type5.js`'s 22 counted-not-run calls -- but they are
// spliced, they sit at a fixed offset from the ship, and on screen they are
// correct.  D1 is a wording defect, not a code defect.
//
// ORDERING IS SAFE BY CONSTRUCTION.  A higher display-list index draws IN
// FRONT on this hardware, so a shadow moved in front of the ship would be
// obviously wrong.  `splice` rewrites position words 0 and 1 of records already
// in the list and never reorders them or touches the `pri` bit, so the drawing
// order cannot change.  Measured on the capture as a check: of 243 shadow
// records, 243 have a LOWER list index than the ship and 0 have a higher one.
//
// WHAT THE SPLICE STILL DOES NOT CARRY: the ANIMATION.  It rewrites position
// words 0 and 1 and nothing else, so the ship is drawn with whatever image the
// capture held.  In this capture that is ONE image for all 161 frames, because
// the recorded ship's X never moved -- `frameList[].px` is 5312 on every single
// frame, one distinct value -- so it never banked and its tilt was 0
// throughout.  The port DOES compute tilt and DOES compute the tilt-indexed
// animation longs ($25533A/$2553CA, `vectors.js` `anim()`), and those longs are
// display-list words 2-3, so the ship could be made to bank.  What stops it is
// that `export-web.mjs` RE-BASES every sprite stream into a packed 16-bit space
// and does not ship the map, so the port's ROM-space animation longs cannot be
// translated into the bundle's space.  Shipping the 17 rebased pairs in the
// manifest is a one-field change to the exporter and a later wave's job; it is
// written down here so it is not rediscovered.

import { beWords, parseSpriteList } from './index.js';

/** Conditional score a record class must reach to count as attached. */
export const ATTACH_MIN_SCORE = 0.95;
/** ...over at least this many frames, so 2/2 cannot pass. */
export const ATTACH_MIN_FRAMES = 8;

const i16 = (v) => (v << 16) >> 16;

/**
 * THE GROUND PLANE -- `$249EA0..$249EBC` followed by `$23EFC0`'s pack, both
 * transcribed instruction for instruction:
 *
 *   249ea0: move.l ($2,A6),D1        D1 = posY:posX, 1/64 px
 *   249ea4: move.w #$1c00,D5
 *   249ea8: sub.w D5,D1  / asr.w #1,D1 / add.w D5,D1     X -> midpoint with $1C00
 *   249eae: swap D1
 *   249eb0: move.w #$1400,D5
 *   249eb4: sub.w D5,D1  / asr.w #1,D1 / add.w D5,D1     Y -> midpoint with $1400
 *   249eba: swap D1
 *   249ebc: addi.l #$fe00fe00,D1     -8 px on each axis, as ONE long add
 *   249ee2: jsr $23EFC0
 *   23efd6: asr.l #6,D0 / andi.l #$07ff03ff,D0           -> the record's x,y
 *
 * So a shadow is halfway between its object and a fixed point, on BOTH axes.
 * The X half is invisible in this capture -- the recorded ship's posX never
 * changed -- so it could not have been measured from the frames alone, and a
 * correlation would have had to guess.  The listing does not have to.
 * `$24C40E..$24D25A` carries the same idiom thirty times inside the option
 * object, which is where the two option shadows come from.
 *
 * VERIFIED: 81 of 81 frames exact against the board's own shadow record.
 */
export function shadowProject(py, px) {
  const sx = i16(i16(i16(px) - 0x1c00) >> 1) + 0x1c00;
  const sy = i16(i16(i16(py) - 0x1400) >> 1) + 0x1400;
  // ONE 32-bit add, so a borrow out of the low half reaches the high half --
  // which is what the 68000 does and what a per-word `-0x200` would not.
  const packed = ((((sy & 0xffff) << 16) | (sx & 0xffff)) >>> 0) + 0xfe00fe00;
  const p = (packed >>> 0) >> 6;
  return { x: (p >>> 16) & 0x07ff, y: p & 0x03ff };
}

/** Where a record of `model` is anchored, given the player's position. */
function anchor(model, py, px) {
  return model === 'ground' ? shadowProject(py, px) : { x: py >> 6, y: px >> 6 };
}

export class Capture {
  /**
   * @param {object} json  `capture.json` written by tools/pixpack.mjs
   * @param {Uint8Array} bin  `capture.bin`
   */
  constructor(json, bin) {
    this.json = json;
    this.bin = bin;
    this.frames = json.frameList;
    this.frameBytes = json.frameBytes;
    this.offsets = {};
    let o = 0;
    for (const [name, len] of json.layout) { this.offsets[name] = [o, len]; o += len; }
    const want = this.frames.length * this.frameBytes;
    if (bin.length !== want) {
      throw new Error(`capture.bin is ${bin.length} bytes, manifest says `
        + `${this.frames.length} x ${this.frameBytes} = ${want}`);
    }
    this.spliceable = json.shipCorrelation.accepted.length > 0;
    this.lag = json.shipCorrelation.lag;
  }

  get length() { return this.frames.length; }

  /** A big-endian u16 view of one part of one frame.  `beWords` copies, so the
   *  caller may splice into the result without damaging the capture. */
  part(i, name) {
    const [o, len] = this.offsets[name];
    const base = i * this.frameBytes + o;
    return beWords(this.bin.subarray(base, base + len));
  }

  /** The renderer's `st` for capture frame `i`. */
  state(i) {
    return {
      palette: this.part(i, 'palette'),
      spritebuffer: this.part(i, 'spritebuffer'),
      bg: this.part(i, 'bg'),
      tx: this.part(i, 'tx'),
      rowscroll: this.part(i, 'rowscroll'),
      zoomram: this.part(i, 'zoomram'),
      regs: this.frames[i].regs,
    };
  }

  /**
   * THE CONDITIONAL MATCHER.  Runs once, at load, over the bundle the page
   * already has -- `frameList[].refPy/refPx` and the sprite buffers are both
   * shipped, so NO REBUILT `assets/` IS NEEDED.
   *
   * A record's IDENTITY is its appearance class: `width x height, colour,
   * priority, flip`.  That is what lets "given it is present" mean anything at
   * all -- display-list slots are rebuilt from scratch every frame and index is
   * not identity (`00-recon-memmap.md`).  If an ENEMY ever shares a class with a
   * player record, the class's conditional score drops and the record is
   * REJECTED, which is the safe direction: a splice is lost and the reject
   * shows up in `attachmentReport()` with its score, rather than an enemy being
   * dragged around behind the ship.
   *
   * @returns {Array<Array<[number, string, number, number]>>}
   *          per frame, [recordIndex, model, dx, dy]
   */
  attached() {
    if (this._attached) return this._attached;
    this._build();
    return this._attached;
  }

  /**
   * EVERY class the matcher considered, accepted or not, with its score.
   *
   * This exists because the previous matcher reported "three offsets accepted
   * at 161/161" and said NOTHING about having considered and dropped the
   * exhaust and the shadows -- so two real defects looked like a clean run for
   * two waves.  A rejected candidate is a finding.  `tools/attachreport.mjs`
   * prints this; the page prints the counts.
   */
  attachmentReport() { this.attached(); return this._report; }

  _build() {
    const n = this.frames.length;
    const usable = [];
    for (let i = 0; i < n; i++) {
      const f = this.frames[i];
      if (f.refPy !== undefined && f.refPy !== null) usable.push(i);
    }
    // A capture predating refPy: fall back to what the packer accepted rather
    // than splicing nothing, and say so in the report.
    if (!usable.length) {
      this._attached = this.frames.map((f) =>
        (f.player ?? []).map(([r, dx, dy]) => [r, 'rigid', dx, dy]));
      this._report = [{ cls: '(no refPy in this capture)', present: 0,
        verdict: 'FALLBACK to capture.json shipCorrelation' }];
      return;
    }

    // THE SAME PARSER the renderer uses, not a second one: a private copy could
    // disagree about the terminator or the sign extension and the two would
    // drift silently.
    const lists = new Map(usable.map((i) =>
      [i, parseSpriteList(this.part(i, 'spritebuffer'))]));
    const cls = (s) => `${s.width}x${s.height} c${s.color} p${s.pri} f${s.flip}`;

    // class -> every observation, with the residual under each model
    const seen = new Map();
    for (const i of usable) {
      const f = this.frames[i];
      const a = { rigid: anchor('rigid', f.refPy, f.refPx),
        ground: anchor('ground', f.refPy, f.refPx) };
      for (const s of lists.get(i)) {
        const k = cls(s);
        let e = seen.get(k);
        if (!e) seen.set(k, (e = { present: new Set(), obs: [] }));
        e.present.add(i);
        e.obs.push({ i, idx: s.i, w: s.width * 16, h: s.height,
          rigid: [s.x - a.rigid.x, s.y - a.rigid.y],
          ground: [s.x - a.ground.x, s.y - a.ground.y] });
      }
    }

    const modal = (vals) => {
      const m = new Map();
      for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
      let best = null, bn = -1;
      for (const [v, c] of m) if (c > bn) { bn = c; best = v; }
      return best;
    };

    const report = [];
    const accepted = new Map();               // class -> {model, dx, dy}
    for (const [k, e] of seen) {
      const present = e.present.size;
      let best = null;
      for (const model of ['rigid', 'ground']) {
        const key = modal(e.obs.map((o) => o[model].join(',')));
        if (key === null) continue;
        // CONDITIONAL: of the frames the class appears in, how many have SOME
        // record of it at the modal offset. Never "how many frames of the
        // capture" -- that measures the artwork, not the attachment.
        const hit = new Set(e.obs.filter((o) => o[model].join(',') === key)
          .map((o) => o.i)).size;
        const score = hit / present;
        if (!best || score > best.score) {
          const [dx, dy] = key.split(',').map(Number);
          best = { model, dx, dy, score, hit };
        }
      }
      const frames = [...e.present];
      const phase = present === usable.length ? 'every frame'
        : frames.every((i) => i % 2 === 0) ? 'EVEN'
          : frames.every((i) => i % 2 === 1) ? 'ODD' : 'irregular';
      const verdict = present < ATTACH_MIN_FRAMES ? `sample<${ATTACH_MIN_FRAMES}`
        : best && best.score >= ATTACH_MIN_SCORE ? 'ACCEPT' : 'reject';
      const px = e.obs[0];
      report.push({ cls: k, present, of: usable.length, phase,
        size: `${px.w}x${px.h}`, model: best?.model ?? '-',
        dx: best?.dx, dy: best?.dy, score: best?.score ?? 0, verdict });
      if (verdict === 'ACCEPT') accepted.set(k, best);
    }
    report.sort((a, b) => b.score - a.score || b.present - a.present);

    const out = this.frames.map(() => []);
    for (const i of usable) {
      for (const s of lists.get(i)) {
        const a = accepted.get(cls(s));
        if (a) out[i].push([s.i, a.model, a.dx, a.dy]);
      }
    }
    this._attached = out;
    this._report = report;
  }

  /**
   * Move the player-attached records to (py, px), the PREVIOUS logic frame's
   * player position in 1/64 px.
   *
   * Only the position fields are touched.  Word 0 keeps its grow bit and zoom
   * index in bits 15..11 and carries x in 10..0; word 1 keeps its own in
   * 15..11 and carries y in 9..0 (`spritelist.js`).  Rewriting anything else
   * would be inventing a record rather than moving one -- which is also why the
   * ship does not BANK here: words 2-3 are its animation and the splice does
   * not touch them.  Nothing is reordered and no `pri` bit is touched, so the
   * drawing order the board chose survives; see the header on ordering.
   *
   * The fixed-point conversion is `>> 6` -- TRUNCATION, not rounding.  Measured:
   * truncation gives three offsets holding on 161/161 frames, rounding gives
   * zero accepted offsets at any lag.
   *
   * `records: 'packer'` restores wave 7's behaviour -- exactly the three
   * offsets `capture.json` accepted -- and exists so a test can show that the
   * matcher's answer is a SUPERSET rather than a different one.
   */
  splice(st, i, py, px, { records = 'attached' } = {}) {
    if (!this.spliceable) return 0;
    const recs = records === 'packer'
      ? (this.frames[i].player ?? []).map(([r, dx, dy]) => [r, 'rigid', dx, dy])
      : this.attached()[i];
    const at = { rigid: anchor('rigid', py, px), ground: anchor('ground', py, px) };
    let n = 0;
    for (const [idx, model, dx, dy] of recs) {
      const a = at[model] ?? at.rigid;
      const b = idx * 8;                      // post-DMA stride
      st.spritebuffer[b] = (st.spritebuffer[b] & 0xf800) | ((a.x + dx) & 0x07ff);
      st.spritebuffer[b + 1] = (st.spritebuffer[b + 1] & 0xfc00) | ((a.y + dy) & 0x03ff);
      n++;
    }
    return n;
  }
}
