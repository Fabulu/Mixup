// THE SPRITE MASK ROM IS ITS OWN DIRECTORY.  WAVE 35.
//
// ===================== WHAT THIS REPLACES, AND WHY IT MATTERS ===============
//
// `tools/export-web.mjs` has always learned a sprite stream's EXTENT from the
// display-list record that drew it: `walkStream(offs, wide, high)` takes the
// record's `($e,A6)` word (width bits 14..9, height bits 8..0) and computes
// `2 + wide*high` mask words.  The only records it had were **the recording's**,
// so the published atlas's extents -- and therefore the set of streams that can
// be exported at all -- came out of `assets/capture.bin` rather than out of the
// cartridge.  W28 §6 named that provenance as the thing that actually gates
// deleting the capture.
//
// It does not have to.  **The mask ROM is a closed, walkable chain**, and this
// file is that walk.  `PLAN-no-recordings.md` §6 risk 2 says "sprites CANNOT be
// statically enumerated (harvest-only, wave 3)"; the construction below is the
// counter-example, and `docs/worklog/ddpdoj/35-recon-sprite-atlas.md` §3 has the
// measurements.
//
// ============================== THE LAYOUT ==================================
//
// Every stream in `cave_b04401w064.u1` is
//
//     word 0..1     the COLOUR POINTER.  `(w1<<16 | w0) >>> 2` is the stream's
//                   first word index into the colour ROM -- `SpriteDrawer`'s
//                   own header read (`src/render/sprites.js`).
//     word 2..      wide*high MASK words, consumed one per 16 pixels.
//     + 2 words     a trailer.  MEASURED: the gap between consecutive stream
//                   starts is `wide*height + 4` on every one of the 150 streams
//                   the capture contains and every one of the 329 the port's
//                   own emitter produces -- 479 observations, 0 exceptions.
//
// and the colour pointers are **MONOTONE over the whole ROM** (measured over all
// 8,073 streams).  The drawer consumes one 5-bit colour pixel per CLEAR mask bit
// and three pixels to a colour word, so the stream at `offs` is followed by the
// stream at `offs + L` for the `L` that satisfies
//
//     hdr(offs + L) - hdr(offs) == ceil(clearBits(mask[offs+2 .. offs+L-2]) / 3)
//
// That is one equation in one unknown and, measured, it has exactly ONE solution
// per stream within an 8,192-word search.  Walking it from `$000000` yields
// **8,073 streams filling `$000000..$33A6E4`**; the rest of the 4,194,304-word
// ROM is zero.
//
// ========================== WHAT THIS IS NOT ================================
//
// It gives the number of MASK WORDS, which is `wide * high`.  It does NOT give
// the SPLIT into wide and high -- that lives in the object record's `($e,A6)`
// and is the producer's business, not the ROM's.  The exporter does not need the
// split (it ships words, not a rectangle), but anything that wants to draw a
// stream standalone does.
//
// EXPORT-TIME ONLY.  The published page reads `assets/spr/*.u16`, a rebased
// address space with no chain in it; nothing under `src/web/` imports this file.

/** The mask ROM's chain never needs a longer search than this; measured max
 *  stream length over the whole ROM is 3,140 words. */
export const MAX_STREAM_WORDS = 8192;

export class SpriteDirError extends Error {
  constructor(msg) { super(msg); this.name = 'SpriteDirError'; }
}

const POP = new Uint8Array(256);
for (let i = 0; i < 256; i++) POP[i] = (i & 1) + POP[i >> 1];

/** clear (zero) bits in `mask[a..b)` -- one colour pixel each. */
function clearBits(mask, a, b) {
  let n = 0;
  for (let i = a; i < b; i++) {
    const m = mask[i];
    n += 16 - POP[m & 0xff] - POP[(m >> 8) & 0xff];
  }
  return n;
}

/** the stream header at `o`: its first colour-ROM word index. */
export function colourBase(mask, o) {
  return (((mask[o + 1] << 16) | mask[o]) >>> 2);
}

/**
 * Solve the chain at `offs`: how many words does this stream occupy, header and
 * trailer included?
 *
 * @param {Uint16Array} mask   the assembled sprite mask region
 * @param {number} offs        a WORD offset -- a display-list record's `offs`
 * @returns {number} the stride to the next stream, `wide*high + 4`
 * @throws {SpriteDirError} if no length in `[4, MAX_STREAM_WORDS]` closes the
 *         chain.  That is never "an odd sprite": it means `offs` is not a stream
 *         start, and a silent fallback here would ship a sheet that is subtly
 *         short, which is exactly the failure `walkStream` could not detect.
 */
export function streamStride(mask, offs) {
  const h0 = colourBase(mask, offs);
  for (let L = 4; L <= MAX_STREAM_WORDS; L += 4) {
    if (offs + L + 1 >= mask.length) break;
    const npix = clearBits(mask, offs + 2, offs + L - 2);
    const cw = npix === 0 ? 0 : Math.floor((npix - 1) / 3) + 1;
    if (colourBase(mask, offs + L) - h0 === cw) return L;
  }
  throw new SpriteDirError(
    `$${offs.toString(16)} does not close the sprite chain within `
    + `${MAX_STREAM_WORDS} words: no L satisfies hdr(offs+L)-hdr(offs) == the `
    + 'colour words its mask bits consume. It is not a stream start.');
}

/**
 * One stream's extents, derived from the ROM alone.
 *
 * Returns the same three fields `export-web.mjs walkStream` returned, so the
 * exporter's packing is unchanged -- only where the numbers come FROM.
 *
 * @returns {{maskWords: number, colStart: number, colWords: number,
 *            stride: number, pixels: number}}
 */
export function streamExtent(mask, colWordCount, offs) {
  const stride = streamStride(mask, offs);
  const npix = clearBits(mask, offs + 2, offs + stride - 2);
  return {
    // `walkStream` shipped 2 + wide*high; `stride` is that plus the 2-word
    // trailer, which the drawer never reads.  Ship exactly what it read.
    maskWords: stride - 2,
    colStart: colourBase(mask, offs) & (colWordCount - 1),
    colWords: npix === 0 ? 0 : Math.floor((npix - 1) / 3) + 1,
    stride,
    pixels: npix,
  };
}

/**
 * Walk the whole ROM from `$000000` and return every stream start.
 *
 * This is the INVENTORY in `docs/knowledge/09`'s sense: the complete list of
 * sprite streams the cartridge contains, counted from the cartridge.  It is NOT
 * a stage-1 list -- which streams stage 1 draws is decided by the 68000 side
 * (the `($a,A6)` descriptor: prototype tables, 16-entry direction tables,
 * immediates), and `tools/w35atlas.mjs rom` enumerates that.
 *
 * @returns {{starts: Int32Array, strides: Int32Array, end: number}}
 */
export function walkDirectory(mask, { limit = Infinity } = {}) {
  const starts = [], strides = [];
  let o = 0;
  while (o + 4 < mask.length && starts.length < limit) {
    let L;
    try { L = streamStride(mask, o); } catch { break; }
    starts.push(o); strides.push(L);
    o += L;
  }
  return { starts: Int32Array.from(starts), strides: Int32Array.from(strides), end: o };
}
