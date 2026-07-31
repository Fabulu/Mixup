// VRAM script interpreter.  ROM: sub_00_0A0E (the loop) + sub_00_0A14 (one
// record).  Master reference §7.6.
//
// This one routine paints every screen the game draws that is not a level: the
// Sunsoft copyright, the title, the options menu, the Joker stage select, the
// per-stage intro cards and the ending text. It is also what fills the level-1/2
// window tilemap at $0E24 -- the textured water surface that the exported level
// VRAM does not contain, because the export snapshot is taken before it runs.
//
// Record layout: {destHi, destLo, ctrl} followed by a payload. The destination
// is BIG-endian in the script -- $0A05 takes the FIRST byte as H, which is the
// opposite of every other 16-bit value in the ROM. ctrl packs the mode in bits
// 7-6 and a count in bits 5-0. A destHi of $00 ends the script ($0A0F).

/** Mode names, for readable callers and tests. */
export const VS_COPY_H = 0;
export const VS_RLE_H = 1;
export const VS_COPY_V = 2;
export const VS_RLE_V = 3;

/** Tilemap rows are $20 tiles wide, so the vertical modes step by that. */
const ROW_STRIDE = 0x20;

/**
 * Run a script into a VRAM image.
 *
 * @param vram    Uint8Array covering `base` upward (8 KB for $8000-$9FFF)
 * @param script  bytes of the script itself
 * @param {object} [opts]
 * @param {number} [opts.offset]  where in `script` to start
 * @param {number} [opts.base]    CPU address `vram[0]` corresponds to
 * @param {Function} [opts.onWrite] optional (addr, value) hook, in execution order --
 *                     the oracle compares this stream against the cartridge's
 * @returns the offset just past the terminator
 */
export function runVramScript(vram, script, opts = {}) {
  const { offset = 0, base = 0x8000, onWrite = null } = opts;
  let p = offset;

  for (;;) {
    const destHi = script[p];
    if (destHi === 0x00 || destHi === undefined) return p + 1;   // $0A0F/$0A13

    // $0A04-$0A08: HL = destHi:destLo, big-endian.
    let addr = ((destHi << 8) | script[p + 1]) & 0xFFFF;
    const ctrl = script[p + 2];
    p += 3;

    // $0A15/$0A19: count in the low 6 bits, mode in the top 2.
    //
    // A count of 0 means 256, not nothing -- every mode's loop is DEC B /
    // JR NZ, so B = 0 wraps the whole way round. ctrl $00 can never reach
    // here (destHi $00 already terminated), but $40, $80 and $C0 can.
    const count = (ctrl & 0x3F) || 0x100;
    const mode = (ctrl >> 6) & 0x03;

    const write = (a, v) => {
      const i = a - base;
      if (i >= 0 && i < vram.length) vram[i] = v;
      if (onWrite) onWrite(a, v);
    };

    if (mode === VS_COPY_H) {                       // $0A27
      for (let n = 0; n < count; n++) {
        write(addr, script[p++]);
        addr = (addr + 1) & 0xFFFF;
      }
    } else if (mode === VS_RLE_H) {                 // $0A2E
      const v = script[p++];                        // consumed BEFORE the loop
      for (let n = 0; n < count; n++) {
        write(addr, v);
        addr = (addr + 1) & 0xFFFF;
      }
    } else if (mode === VS_COPY_V) {                // $0A35
      for (let n = 0; n < count; n++) {
        write(addr, script[p++]);
        addr = (addr + ROW_STRIDE) & 0xFFFF;
      }
    } else {                                        // $0A42, RLE vertical
      // $0A42 re-reads [DE] every iteration without advancing it, and the
      // single INC DE lands at $0A4D once the loop is done.
      const v = script[p];
      for (let n = 0; n < count; n++) {
        write(addr, v);
        addr = (addr + ROW_STRIDE) & 0xFFFF;
      }
      p += 1;
    }
  }
}

/**
 * Length of a script in bytes, terminator included. Walks it the same way the
 * interpreter does, so an unterminated or truncated script is caught here
 * rather than by running off the end of an asset.
 */
export function vramScriptLength(script, offset = 0) {
  let p = offset;
  for (;;) {
    const destHi = script[p];
    if (destHi === undefined) throw new Error('VRAM script ran off the end');
    if (destHi === 0x00) return p + 1 - offset;
    const ctrl = script[p + 2];
    const count = (ctrl & 0x3F) || 0x100;
    const mode = (ctrl >> 6) & 0x03;
    p += 3 + (mode === VS_RLE_H || mode === VS_RLE_V ? 1 : count);
  }
}
