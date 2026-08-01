// THE PORT'S RENDERER -- one import for the browser and for the gate.
//
// What this module renders is the IGS023's VIDEO STATE: two tilemaps, the
// rowscroll table, the zoom table, the display list and the palette.  It does
// not compute that state and does not pretend to.  On the port side, building
// the display list is main-loop call #4 ($23D2AE), which is UNPORTED -- see
// `src/main.js` and `05-impl-enemies-and-weapons.md` §"Why the done-when is
// BLOCKED".  So today the renderer's input is either
//   (a) a board capture (`pgm.py pixslice`), which is what the pixel gate
//       compares against MAME, or
//   (b) a capture with the player's records replaced by the port's own,
//       which is what `index.html` puts on the screen and labels as such.

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
