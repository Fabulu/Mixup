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

// ------------------------------------------- WAVE 9: THE SPLICE WAS INCOMPLETE
//
// A play report: a "fireball" flying off across the screen on its own while the
// ship stayed under the finger, and the owner spent five rounds working out
// what it even was.  It was the PLAYER'S OWN EXHAUST PLUME, left behind on the
// recorded ship's path.
//
// THE MEASUREMENT (`09-impl-tate-and-honest-page.md` §"the fireball").
// Re-running the packer's own correlation over the SHIPPED capture, but
// printing every offset instead of only the accepted ones, there are FIVE
// records that sit at a constant offset from the board's ship, not three:
//
//   dx,dy      frames   size    streams  what it draws        what it is
//   -24,-16    161/161  48x32     1      517 px, an aircraft   THE SHIP
//   -16, 24    161/161  32x16    32      165 px                option pod
//   -16,-41    161/161  32x16    33      175 px                option pod
//   -52,-20     81/161  80x40    17     1515 px, a fire cloud  EXHAUST PLUME
//   -30,-16     80/161  16x32     2      145 px, a round glow  exhaust glow
//                       ...and the next best is 41/161, a 16x1 stub.
//
// The two exhaust records appear on ODD capture frames ONLY -- they flash at
// half the frame rate -- so they hold on 50.3 % and 49.7 % of frames and
// `pixpack.mjs --min-hit 0.9` REJECTED THEM.  That is the whole bug: the
// matcher tested them and its threshold, chosen for a record that is present
// every frame, cannot accept one that flickers.  Nothing was overlooked and
// nothing was mis-identified; the acceptance rule was wrong for half the set.
//
// The plume is the LARGEST player-attached thing on screen -- 1515 px against
// the ship's 517 -- which is why it dominated the report.
//
// So this file RE-DERIVES the tracking set at load time, from the bundle it
// already has, and accepts anything holding on >= 45 % of frames.  It does not
// need a rebuilt `assets/`: `frameList[i].refPy/refPx` and the sprite buffers
// are already there.  The measured gap between accepted and rejected is 80
// frames against 41, so 45 % is not a tuned number sitting next to a cliff.
//
// THE PODS ARE NOT AND WERE NOT BROKEN.  07-review.md D1 is right that the page
// CLAIMED they were "computed live" and they are not -- the option object
// $24C096 is one of `type5.js`'s 22 counted-not-run calls -- but they are
// spliced, they sit at a fixed offset from the ship, and on screen they are
// correct.  D1 is a wording defect, not a code defect, and the wording is
// fixed in `index.html` rather than the pods being removed.
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

/**
 * A record holding this fraction of frames at one constant offset is taken to
 * be attached to the player.  MEASURED gap: the five real ones hold on 161,
 * 161, 161, 81 and 80 of 161 frames; the best non-player offset holds on 41.
 */
export const ATTACH_MIN_FRACTION = 0.45;

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
   * RE-DERIVE the player-attached records, over the whole capture, from the
   * bundle -- the same correlation `pixpack.mjs` runs, at a threshold that can
   * see a record which flickers.  Memoised; see this file's header for why it
   * exists and for the measured numbers.
   *
   * @returns {Array<Array<[number, number, number]>>} per frame, [idx, dx, dy]
   */
  attached() {
    if (this._attached) return this._attached;
    const usable = [];
    for (let i = 0; i < this.frames.length; i++) {
      const f = this.frames[i];
      if (f.refPy === undefined || f.refPy === null) continue;
      usable.push(i);
    }
    // Fall back to what the packer accepted when the capture predates refPy --
    // a page that silently spliced NOTHING would be the worse failure.
    if (!usable.length) {
      this._attached = this.frames.map((f) => f.player ?? []);
      this._attachedOffsets = null;
      return this._attached;
    }
    // THE SAME PARSER the renderer uses, not a second one: a private copy here
    // could disagree about the terminator or the sign extension and the two
    // would drift silently (`web/input.js`'s note on there being exactly one
    // route into the port word is the same rule).
    const lists = new Map(usable.map((i) => [i,
      parseSpriteList(this.part(i, 'spritebuffer')).map((s) => [s.i, s.x, s.y])]));
    const hits = new Map();
    for (const i of usable) {
      const cy = this.frames[i].refPy >> 6, cx = this.frames[i].refPx >> 6;
      for (const [, x, y] of lists.get(i)) {
        const k = `${x - cy},${y - cx}`;
        hits.set(k, (hits.get(k) ?? 0) + 1);
      }
    }
    const need = ATTACH_MIN_FRACTION * usable.length;
    const keep = new Set([...hits].filter(([, n]) => n >= need).map(([k]) => k));
    const out = this.frames.map(() => []);
    for (const i of usable) {
      const cy = this.frames[i].refPy >> 6, cx = this.frames[i].refPx >> 6;
      for (const [r, x, y] of lists.get(i)) {
        const dx = x - cy, dy = y - cx;
        if (keep.has(`${dx},${dy}`)) out[i].push([r, dx, dy]);
      }
    }
    this._attached = out;
    this._attachedOffsets = [...keep];
    return out;
  }

  /** The accepted offsets, for the page's provenance line. */
  attachedOffsets() { this.attached(); return this._attachedOffsets; }

  /**
   * Move the player-attached records to (py, px), the PREVIOUS logic frame's
   * player position in 1/64 px.
   *
   * Only the position fields are touched.  Word 0 keeps its grow bit and zoom
   * index in bits 15..11 and carries x in 10..0; word 1 keeps its own in
   * 15..11 and carries y in 9..0 (`spritelist.js`).  Rewriting anything else
   * would be inventing a record rather than moving one -- which is also why the
   * ship does not BANK here: words 2-3 are its animation and the splice does
   * not touch them.  See the header.
   *
   * The fixed-point conversion is `>> 6` -- TRUNCATION, not rounding.  Measured:
   * truncation gives three offsets holding on 161/161 frames, rounding gives
   * zero accepted offsets at any lag.
   *
   * `records: 'packer'` restores wave 7's behaviour -- exactly the three
   * offsets `capture.json` accepted -- and exists so a test can show that the
   * re-derivation is a SUPERSET rather than a different answer.
   */
  splice(st, i, py, px, { records = 'attached' } = {}) {
    if (!this.spliceable) return 0;
    const cy = py >> 6, cx = px >> 6;
    const recs = records === 'packer' ? (this.frames[i].player ?? [])
      : this.attached()[i];
    let n = 0;
    for (const [idx, dx, dy] of recs) {
      const b = idx * 8;                      // post-DMA stride
      st.spritebuffer[b] = (st.spritebuffer[b] & 0xf800) | ((cy + dx) & 0x07ff);
      st.spritebuffer[b + 1] = (st.spritebuffer[b + 1] & 0xfc00) | ((cx + dy) & 0x03ff);
      n++;
    }
    return n;
  }
}
