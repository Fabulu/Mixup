// THE ROM REGIONS THE IGS023 READS -- assembly, in the port, in JS.
//
// Transcribed from MAME `src/mame/igs/pgm.cpp`'s `ROM_START(ddpdojblk)`
// (pgm.cpp:5361-5386, tag mame0289), the same lines `tools/pgmgfx.py` was
// transcribed from in wave 3.  This file is the JS side of a translation whose
// Python side is already proved bit-exact against MAME's own framebuffer
// (`NOTES-assets.md` §1: 1,605,632/1,605,632 pixels over 16 frame pairs).
//
// THE ONE THAT BITES, and it is in wave 3's mutation list for that reason:
// `cave_t04401w064.u19` loads at **0x180000, not 0x200000**.  It OVERWRITES the
// top 0x80000 of `pgm_t01s.rom` rather than following it.  Getting it wrong
// silently shifts every tile index above 0xC000 and still renders a plausible
// picture -- measured at 52.8566 % of pixels correct, i.e. more than half right.
// `pixgate.mjs --mutate u19-at-200000` is required to catch it.

/** @typedef {{igs023: Uint8Array, sprcol: Uint16Array, sprmask: Uint16Array}} RomRegions */

export const IGS023_LAYOUT = [
  ['pgm_t01s.rom', 0x000000, 0x200000],
  ['cave_t04401w064.u19', 0x180000, 0x800000],
];
export const IGS023_SIZE = 0xa00000;

// REGION16_LE both -- the byte pairs in the file are little-endian u16.
export const SPRCOL_LAYOUT = [
  ['cave_a04401w064.u7', 0x0000000, 0x800000],
  ['cave_a04402w064.u8', 0x0800000, 0x800000],
];
export const SPRCOL_SIZE = 0x2000000;

export const SPRMASK_LAYOUT = [
  ['cave_b04401w064.u1', 0x0000000, 0x800000],
];
export const SPRMASK_SIZE = 0x1000000;

/** Every ROM file this renderer needs, in load order. */
export const REQUIRED_FILES = [
  ...IGS023_LAYOUT, ...SPRCOL_LAYOUT, ...SPRMASK_LAYOUT,
].map(([n]) => n);

export class RomRegionError extends Error {
  constructor(msg) { super(msg); this.name = 'RomRegionError'; }
}

/**
 * MAME's REGION16_LE means the region's u16 at word index i is
 * `bytes[2i] | bytes[2i+1]<<8`.  A `Uint16Array` view over the same buffer
 * gives that ONLY on a little-endian host.  Every realistic target is LE, but
 * "realistic" is not "measured", and a silently byte-swapped sprite stream
 * would render as noise with no message at all.  So: assert, once, loudly.
 */
export function assertLittleEndianHost() {
  const probe = new Uint8Array([0x34, 0x12]);
  if (new Uint16Array(probe.buffer)[0] !== 0x1234) {
    throw new RomRegionError(
      'BIG-ENDIAN HOST: the IGS023 sprite ROMs are MAME REGION16_LE and this '
      + 'renderer views them through a Uint16Array. Byte-swap the regions '
      + 'before use -- do not "fix" this by flipping the sprite decoder.');
  }
}

/**
 * @param {(name: string) => Uint8Array} get  reads one ROM file by MAME's name
 * @param {[string, number, number][]} layout
 * @param {number} size
 */
export function assemble(get, layout, size) {
  const buf = new Uint8Array(size);
  for (const [name, off, len] of layout) {
    const d = get(name);
    if (!d) throw new RomRegionError(`${name}: not supplied`);
    if (d.length !== len) {
      throw new RomRegionError(
        `${name}: expected ${len} bytes, got ${d.length}. pgm.cpp:5361-5386 `
        + 'fixes every length; a short file means the wrong dump, not a '
        + 'renderer that should cope.');
    }
    buf.set(d, off);
  }
  return buf;
}

/**
 * The three regions, assembled.  `layout` is overridable ONLY so that
 * `tools/pixgate.mjs`'s red validation can load u19 at the wrong offset and
 * watch the gate fail; nothing else may pass it.
 * @returns {RomRegions}
 */
export function loadRegions(get, { igs023Layout = IGS023_LAYOUT } = {}) {
  assertLittleEndianHost();
  const igs023 = assemble(get, igs023Layout, IGS023_SIZE);
  const sprcolBytes = assemble(get, SPRCOL_LAYOUT, SPRCOL_SIZE);
  const sprmaskBytes = assemble(get, SPRMASK_LAYOUT, SPRMASK_SIZE);
  return {
    igs023,
    sprcol: new Uint16Array(sprcolBytes.buffer, 0, SPRCOL_SIZE / 2),
    sprmask: new Uint16Array(sprmaskBytes.buffer, 0, SPRMASK_SIZE / 2),
  };
}
