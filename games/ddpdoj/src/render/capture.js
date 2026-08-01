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

import { beWords } from './index.js';

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
   * Move the identified ship/pod records to (py, px), the PREVIOUS logic
   * frame's player position in 1/64 px.
   *
   * Only the position fields are touched.  Word 0 keeps its grow bit and zoom
   * index in bits 15..11 and carries x in 10..0; word 1 keeps its own in
   * 15..11 and carries y in 9..0 (`spritelist.js`).  Rewriting anything else
   * would be inventing a record rather than moving one.
   *
   * The fixed-point conversion is `>> 6` -- TRUNCATION, not rounding.  Measured:
   * truncation gives three offsets holding on 161/161 frames, rounding gives
   * zero accepted offsets at any lag.
   */
  splice(st, i, py, px) {
    if (!this.spliceable) return 0;
    const cy = py >> 6, cx = px >> 6;
    let n = 0;
    for (const [idx, dx, dy] of this.frames[i].player) {
      const b = idx * 8;                      // post-DMA stride
      st.spritebuffer[b] = (st.spritebuffer[b] & 0xf800) | ((cy + dx) & 0x07ff);
      st.spritebuffer[b + 1] = (st.spritebuffer[b + 1] & 0xfc00) | ((cx + dy) & 0x03ff);
      n++;
    }
    return n;
  }
}
