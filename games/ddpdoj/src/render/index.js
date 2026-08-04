// THE PORT'S RENDERER -- one import for the browser and for the gate.
//
// What this module renders is the IGS023's VIDEO STATE: two tilemaps, the
// rowscroll table, the zoom table, the display list and the palette.  It does
// not compute that state and does not pretend to.  On the port side, building
// the display list is main-loop call #4 ($23D2AE), and WAVE 11 PORTED IT WHOLE
// (`src/displaylist.js`, gated at 0 divergent frames over 1,901 build-B frames
// by `pgm.py dlgate`).
//
// WAVE 44 CORRECTS THE REST OF THIS PARAGRAPH, WHICH HAD BEEN WRONG SINCE WAVE
// 29.  It used to say "one of the thirty buckets has a ported feeder (14, the
// shots), so the list the port builds is nearly empty".  [M, 40-recon §2.3 and
// re-measured in wave 44] EIGHT of the thirty are filled by the port today --
// 0, 2, 3, 5, 7, 14, 15, 19 -- and bucket 0, THE ENEMIES, runs 14 to 62 records
// a frame.  The list is not nearly empty; it was merely never read.
//
// So the renderer's input is now one of three, and the page's DEFAULT is (c):
//   (a) a board capture (`pgm.py pixslice`), which is what the pixel gate
//       compares against MAME, or
//   (b) a capture with the player's records replaced by the port's own, which
//       is what `index.html` offers as a labelled diagnostic, or
//   (c) THE PORT'S OWN `$800000` LIST, copied out of its RAM one frame late and
//       parsed with `RAM_STRIDE` (`src/web/app.js portSpriteList`).  Records
//       whose sprite stream is not in the shipped sheet are skipped and their
//       cartridge address is named; nothing is ever drawn from a wrong stream.

export * from './regions.js';
export * from './tiles.js';
export * from './spritelist.js';
export * from './sprites.js';
export * from './igs023.js';

/**
 * The oracle dumps every IGS023 share as BIG-ENDIAN u16 (`frame.lua`'s
 * `share_bytes`), because that is how the 68000 sees it.  Nothing about this
 * is host-endianness dependent -- the bytes are read explicitly.
 * @param {Uint8Array} bytes
 */
export function beWords(bytes) {
  const n = bytes.length >> 1;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) out[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return out;
}

/** `frame.lua` writes `regs.txt` as sorted `key=hex` lines. */
export function parseRegs(text) {
  const regs = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const [k, v] = line.split('=');
    regs[k] = parseInt(v, 16);
  }
  for (const k of ['bg_xscroll', 'bg_yscroll', 'tx_xscroll', 'tx_yscroll',
    'ctrl', 'bg_scale']) {
    if (!(k in regs)) throw new Error(`regs.txt is missing ${k}`);
  }
  return regs;
}
