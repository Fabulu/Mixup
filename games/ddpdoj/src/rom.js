// ROM WINDOWS -- the port reading the cartridge the way the 68000 reads it.
//
// WHY THIS EXISTS AND WHY IT IS NOT ANOTHER JSON TABLE.  Wave 4's tables are
// arrays with a meaning attached ("the fold table", "the animation longs"),
// which works for a routine that indexes ONE table.  The shot spawn does not:
// $24A222 copies a 38-byte RECORD TEMPLATE field by field and three of those
// fields are POINTERS the handlers then follow ($24A236 `movea.l (A1)+,A2`,
// then `($1e,A6)` and the `($26,A6)`-indexed tables at $24DDD6 / $24DEB2 /
// $24FC8E / $25014C).  Naming each of those as its own JSON array would mean
// deciding, in the exporter, how long each one is -- a guess dressed as a
// schema.  A window plus a bounds check moves that decision to where it can
// FAIL LOUDLY: `tools/export-tables.py` declares which byte ranges it copied
// and the port throws, by address, on any read outside them.
//
// A read outside every window is NEVER `undefined` and never 0.  It is
// `Unreached`, carrying the ROM address, which is the project's rule for an
// unported path (docs/knowledge/08).

import { unreached } from './unported.js';

export class RomWindows {
  /** @param spec the `rom` object from tools/export-tables.py's JSON. */
  constructor(spec) {
    this.windows = (spec?.windows ?? []).map((w) => {
      const base = parseInt(String(w.base).replace('$', ''), 16);
      const bytes = new Uint8Array(w.len);
      for (let i = 0; i < w.len; i++) {
        bytes[i] = parseInt(w.hex.substr(i * 2, 2), 16);
      }
      return { base, len: w.len, why: w.why, bytes };
    });
  }

  /** The window containing [a, a+n), or a LOUD NAMED THROW. */
  #at(a, n, what) {
    for (const w of this.windows) {
      if (a >= w.base && a + n <= w.base + w.len) return w;
    }
    unreached(a, `${what} at $${a.toString(16).toUpperCase()} is outside every `
      + `ROM window exported by tools/export-tables.py `
      + `(${this.windows.map((w) => `$${w.base.toString(16).toUpperCase()}+`
        + `$${w.len.toString(16).toUpperCase()}`).join(' ')}). `
      + `Either the game reached a table this wave never measured, or the `
      + `window in SHOT_WINDOWS is too narrow -- widen it there, never here`);
  }

  u8(a) { const w = this.#at(a, 1, 'byte'); return w.bytes[a - w.base]; }

  u16(a) {
    const w = this.#at(a, 2, 'word');
    const i = a - w.base;
    return (w.bytes[i] << 8) | w.bytes[i + 1];
  }

  i16(a) { const v = this.u16(a); return v >= 0x8000 ? v - 0x10000 : v; }

  u32(a) {
    const w = this.#at(a, 4, 'longword');
    const i = a - w.base;
    return ((w.bytes[i] << 24) | (w.bytes[i + 1] << 16)
      | (w.bytes[i + 2] << 8) | w.bytes[i + 3]) >>> 0;
  }

  /** WAVE 21: the velocity field's entries are SIGNED longwords and `$2841AE
   *  asr.l #4` is an arithmetic shift, so the sign has to survive the read. */
  i32(a) { return this.u32(a) | 0; }

  /** n bytes as a plain array -- for the 38-byte spawn template. */
  bytes(a, n) {
    const w = this.#at(a, n, `${n} bytes`);
    return Array.from(w.bytes.subarray(a - w.base, a - w.base + n));
  }

  get byteCount() { return this.windows.reduce((s, w) => s + w.len, 0); }
}
