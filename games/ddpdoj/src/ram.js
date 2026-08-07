// The board's 128 KiB of main RAM, and 68000 word arithmetic.
//
// WHY THE PORT KEEPS THE ORIGINAL RAM LAYOUT instead of JS objects: the oracle
// compares RAM addresses.  A port that invents its own field layout can only be
// compared through a translation layer, and every translation layer is a place
// for a bug to hide on the side of the comparison that is supposed to be
// trusted.  Here, seeding is a memcpy and "player Y" is `$8103E8` on both
// sides, so a divergence report names a board address a person can look up.
//
// Main RAM IS the NVRAM on this board (pgm.cpp maps the same 128 KiB as
// m_mainram and as the `sram` NVRAM device), which is why a seed taken with
// -nvram_save is a snapshot of exactly this array.

import { MACHINE } from './machine.js';

/** 16-bit two's complement, the size nearly every player field is. */
export const i16 = (v) => (v << 16) >> 16;
export const u16 = (v) => v & 0xffff;
/** 32-bit, for the `move.l (A3)+,D2 / asr.l #4` in the movement vector. */
export const i32 = (v) => v | 0;
/** 32-bit UNSIGNED, the `>>> 0` half of longword arithmetic. Used by the W116
 *  TX defer printer (`$240DC2`) and anywhere a tile longword must stay positive. */
export const u32 = (v) => v >>> 0;
/** ASR is an ARITHMETIC shift: it rounds toward -infinity, not toward zero.
 *  $2417DE's `asr.l #4` on a negative vector component is the difference
 *  between -1 and 0 units of movement, every frame, forever. */
export const asr = (v, n) => v >> n;

export class Ram {
  constructor(bytes) {
    if (bytes && bytes.length !== MACHINE.ramSize) {
      throw new Error(`seed is ${bytes.length} bytes, expected ${MACHINE.ramSize}`);
    }
    this.b = bytes ? Uint8Array.from(bytes) : new Uint8Array(MACHINE.ramSize);
    this.dv = new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
  }
  #off(a) {
    const o = a - MACHINE.ramBase;
    // WAVE 44: `!(o >= 0 && o < size)`, NOT `o < 0 || o >= size`, and the
    // difference is NaN.  `NaN < 0` and `NaN >= size` are BOTH false, so the old
    // form let a NaN address through and `DataView.getUint16(NaN)` reads offset
    // ZERO -- i.e. `$800000`, the head of the display list.  A typo'd or shadowed
    // field constant then reads a plausible number instead of throwing, silently,
    // forever.  It cost me a red run in `tools/webgate.mjs` this wave (a local
    // `const P` shadowed the imported field table, so `RAM.player1 + P.posY` was
    // NaN and the ship's position came back as display-list word 0), and the
    // measurement looked wrong rather than broken.  Same two comparisons, same
    // cost, one more failure mode caught.
    if (!(o >= 0 && o < MACHINE.ramSize)) {
      throw new RangeError(`${Number.isFinite(a) ? `$${a.toString(16)}` : a} `
        + 'is outside main RAM');
    }
    return o;
  }
  u8(a) { return this.b[this.#off(a)]; }
  i8(a) { return this.dv.getInt8(this.#off(a)); }
  u16(a) { return this.dv.getUint16(this.#off(a), false); }
  i16(a) { return this.dv.getInt16(this.#off(a), false); }
  u32(a) { return this.dv.getUint32(this.#off(a), false); }
  setU8(a, v) { this.b[this.#off(a)] = v & 0xff; }
  setU16(a, v) { this.dv.setUint16(this.#off(a), v & 0xffff, false); }
  setU32(a, v) { this.dv.setUint32(this.#off(a), v >>> 0, false); }
  /** `bchg #n` -- the 68000 changes the bit and sets Z from its OLD value. */
  bchg8(a, n) {
    const o = this.#off(a), old = (this.b[o] >> n) & 1;
    this.b[o] ^= 1 << n;
    return old;
  }
  /** `bclr #n` on a byte; returns the OLD bit, which is what the `beq` tests. */
  bclr8(a, n) {
    const o = this.#off(a), old = (this.b[o] >> n) & 1;
    this.b[o] &= ~(1 << n) & 0xff;
    return old;
  }
  bset8(a, n) {
    const o = this.#off(a), old = (this.b[o] >> n) & 1;
    this.b[o] |= 1 << n;
    return old;
  }
  btst8(a, n) { return (this.b[this.#off(a)] >> n) & 1; }
  clone() { return new Ram(this.b); }
}
