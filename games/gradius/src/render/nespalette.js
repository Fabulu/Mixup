// The NES colour index -> RGB table.
//
// NOT ROM DATA. There is no palette table in the cartridge -- palette RAM holds
// six-bit INDICES and the PPU turns those into a video signal. So this table is
// a property of the reference emulator (Mesen 2.1.1), and it is MEASURED, not
// cited: tools/oracle/palprobe.lua forces the game's PPUMASK shadow $11 to 0 so
// the PPU emits $3F00 over the whole screen, drives $3F00 through 0..63 through
// the real PPU ports, and reads the resulting frame back. 64 colours, worst-frame
// majority 0.825 (NOTES-render.md 5).
//
// It is measured RATHER THAN derived from the comparison it is used in, on
// purpose: deriving it from the framebuffer we are about to compare against
// would make the comparison prove nothing (docs/knowledge/03, "two sides of a
// comparison must be independently derived").
//
// Generated from tools/oracle/out/video/master_palette.bin.

/** 0xRRGGBB for each of the 64 NES colour indices. Index with `ci & 0x3F`. */
export const NES_RGB = new Uint32Array([
  /* $00 */ 0x666666, 0x002A88, 0x1412A7, 0x3B00A4, 0x5C007E, 0x6E0040, 0x6C0600, 0x561D00,
  /* $08 */ 0x333500, 0x0B4800, 0x005200, 0x004F08, 0x00404D, 0x000000, 0x000000, 0x000000,
  /* $10 */ 0xADADAD, 0x155FD9, 0x4240FF, 0x7527FE, 0xA01ACC, 0xB71E7B, 0xB53120, 0x994E00,
  /* $18 */ 0x6B6D00, 0x388700, 0x0C9300, 0x008F32, 0x007C8D, 0x000000, 0x000000, 0x000000,
  /* $20 */ 0xFFFEFF, 0x64B0FF, 0x9290FF, 0xC676FF, 0xF36AFF, 0xFE6ECC, 0xFE8170, 0xEA9E22,
  /* $28 */ 0xBCBE00, 0x88D800, 0x5CE430, 0x45E082, 0x48CDDE, 0x4F4F4F, 0x000000, 0x000000,
  /* $30 */ 0xFFFEFF, 0xC0DFFF, 0xD3D2FF, 0xE8C8FF, 0xFBC2FF, 0xFEC4EA, 0xFECCC5, 0xF7D8A5,
  /* $38 */ 0xE4E594, 0xCFEF96, 0xBDF4AB, 0xB3F3CC, 0xB5EBF2, 0xB8B8B8, 0x000000, 0x000000,
]);

/** Pack one NES colour index into a little-endian RGBA word for ImageData. */
export function rgbaOf(ci) {
  const c = NES_RGB[ci & 0x3F];
  return 0xFF000000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >>> 16) & 0xFF);
}

/** The same table pre-packed as RGBA, which is what the canvas path wants. */
export const NES_RGBA = (() => {
  const t = new Uint32Array(64);
  for (let i = 0; i < 64; i++) t[i] = rgbaOf(i);
  return t;
})();
