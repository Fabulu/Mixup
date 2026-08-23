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

/**
 * W269 -- ADOPTING THE CURRENT WINDOW LIST INSIDE A FROZEN REPLAY FIXTURE.
 *
 * A `.replay` fixture embeds the whole of `player.tables.json` as `seed.tablesB64`,
 * frozen when the oracle recorded it. Almost all of that SHOULD be frozen: the speed
 * quadrants, the folds, the shot templates are derived data and a recording is only
 * reproducible against the same derivation.
 *
 * The `rom` window list is different in kind. It does not say what the cartridge
 * contains; it says **which cartridge bytes this port lets itself read**. So a subsystem
 * translated after a recording throws inside that recording for a reason that has nothing
 * to do with the recording -- W243's `announce260B30` sat unregistered for twenty-six
 * waves over exactly this, and the note in `main.js` called it "an artifact and not the
 * code".
 *
 * Substituting the current list is sound, and this PROVES it rather than asserting it:
 * every byte the frozen list could serve must resolve in the current list TO THE SAME
 * VALUE. If that holds, the current list is a strict superset and the substitution cannot
 * change any value the port computes -- it can only turn an `Unreached` into a read of the
 * bytes the cartridge always had. If it does not hold, the ROM behind the two exports
 * really differs and the fixture is genuinely stale, which is a different problem and gets
 * a loud throw naming the first disagreeing address.
 *
 * @param frozen the `rom` object out of the fixture
 * @param current the `rom` object out of the live `player.tables.json`
 * @returns the CURRENT `rom` object, once proven a superset
 */
export function adoptCurrentWindows(frozen, current) {
  const decode = (spec) => (spec?.windows ?? []).map((w) => ({
    base: parseInt(String(w.base).replace('$', ''), 16),
    len: w.len,
    hex: String(w.hex),
  }));
  const cur = decode(current);
  const byteAt = (a) => {
    for (const w of cur) {
      if (a >= w.base && a < w.base + w.len) {
        return parseInt(w.hex.substr((a - w.base) * 2, 2), 16);
      }
    }
    return null;                       // not covered by the current list at all
  };
  for (const w of decode(frozen)) {
    for (let i = 0; i < w.len; i++) {
      const a = w.base + i;
      const now = byteAt(a);
      const then = parseInt(w.hex.substr(i * 2, 2), 16);
      if (now === null) {
        unreached(a, `a replay fixture's frozen ROM window $${
          w.base.toString(16).toUpperCase()}+$${w.len.toString(16).toUpperCase()} covers `
          + `$${a.toString(16).toUpperCase()} and the CURRENT export does not, so the `
          + `current list is not a superset and substituting it could change a read. A `
          + `window was NARROWED or removed since this fixture was recorded; widen it `
          + `back or re-record`);
      }
      if (now !== then) {
        unreached(a, `a replay fixture's frozen ROM disagrees with the current export at `
          + `$${a.toString(16).toUpperCase()}: the fixture has $${
            then.toString(16).toUpperCase().padStart(2, '0')} and the export has $${
            now.toString(16).toUpperCase().padStart(2, '0')}. The CARTRIDGE behind the `
          + `two differs, which is not a window-list problem -- this fixture is `
          + `genuinely stale and must be re-recorded`);
      }
    }
  }
  return current;
}

export class FullRom {
  constructor(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('FullRom needs a Uint8Array');
    }
    this.data = bytes;
  }

  #at(a, n, what) {
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(n)
        || a < 0 || n < 0 || a + n > this.data.length) {
      throw new RangeError(`${what} at $${Number(a).toString(16).toUpperCase()} is outside `
        + `the ${this.data.length}-byte full ROM image`);
    }
    return a;
  }

  u8(a) { return this.data[this.#at(a, 1, 'byte')]; }

  u16(a) {
    const i = this.#at(a, 2, 'word');
    return (this.data[i] << 8) | this.data[i + 1];
  }

  i16(a) { const v = this.u16(a); return v >= 0x8000 ? v - 0x10000 : v; }

  u32(a) {
    const i = this.#at(a, 4, 'longword');
    return ((this.data[i] << 24) | (this.data[i + 1] << 16)
      | (this.data[i + 2] << 8) | this.data[i + 3]) >>> 0;
  }

  i32(a) { return this.u32(a) | 0; }

  bytes(a, n) {
    const i = this.#at(a, n, `${n} bytes`);
    return Array.from(this.data.subarray(i, i + n));
  }

  get byteCount() { return this.data.length; }
}

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
