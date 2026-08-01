// THE IGS023 DISPLAY LIST.
//
// `igs023_video.cpp:640-696` (tag mame0289).  Five u16 per entry in main RAM
// ($800000..$8009FF, 10 bytes/entry -- `NOTES-machine.md`); the sprite DMA
// expands them to EIGHT u16 per entry in `:igs023:spritebuffer`, applying the
// per-word masks below on the way.  `word4 & 0x7fff == 0` terminates.
//
// The 256-entry cap and the 251-record queue behind it were measured in wave 5
// (`05-impl-enemies-and-weapons.md` §3).  WAVE 11 CORRECTS THE ARITHMETIC, from
// the listing AND from a forced 251-record frame on the board (`pgm.py dlgate
// --cap`): the emitter's filler cadence is `moveq #$33` then `moveq #$32`, i.e.
// 51 records, a filler, then 50 records per filler -- so 251 records carry
// FOUR fillers, not five, and **251 + 4 + the terminator = 256**.  The
// terminator is written at EVERY length (src/displaylist.js §4).  This parser
// stops at 256 because the hardware does.
//
// AND THE ONE THAT WAS BACKWARDS IN THIS REPO'S OWN NOTES: the draw walks the
// list BACKWARDS and refuses to overwrite a pixel it has already written, so
// **a HIGHER LIST INDEX DRAWS IN FRONT**.  `00-recon-assets.md` §3 corrected
// `NOTES-machine.md`; wave 3 measured the wrong order at 86.7132 % of pixels,
// which is the sort of number that reads as "nearly right".

export const SPRITE_LIMIT = 256;
export const RAM_STRIDE = 5;         // main RAM, 10 bytes/entry
export const BUFFER_STRIDE = 8;      // :igs023:spritebuffer, post-DMA

// igs023_video.cpp:660-668 -- the DMA drops bit 10 of word 1 and bit 15 of
// word 2 on the way into the buffer.
const WORD_MASK = [0xffff, 0xfbff, 0x7fff, 0xffff, 0xffff];

function sext(v, bits) {
  return (v & (1 << (bits - 1))) ? v - (1 << bits) : v;
}

/**
 * @param {Uint16Array} words  the list as u16 (big-endian 68k words already
 *                             converted to host numbers)
 * @param {number} stride      RAM_STRIDE or BUFFER_STRIDE
 */
export function parseSpriteList(words, stride = BUFFER_STRIDE, limit = SPRITE_LIMIT) {
  const out = [];
  for (let i = 0; i < limit; i++) {
    const base = i * stride;
    if (base + 4 >= words.length) break;
    const s = [0, 1, 2, 3, 4].map((k) => words[base + k] & WORD_MASK[k]);
    if ((s[4] & 0x7fff) === 0) break;          // the terminator
    out.push({
      i,
      xgrow: (s[0] & 0x8000) !== 0, xzom: (s[0] & 0x7800) >> 11,
      x: sext(s[0] & 0x07ff, 11),
      ygrow: (s[1] & 0x8000) !== 0, yzom: (s[1] & 0x7800) >> 11,
      y: sext(s[1] & 0x03ff, 10),
      flip: (s[2] & 0x6000) >> 13,             // bit0 = flip x, bit1 = flip y
      color: (s[2] & 0x1f00) >> 8,
      pri: (s[2] >> 7) & 1,
      offs: ((s[2] & 0x007f) << 16) | s[3],    // WORD offset into sprmask
      width: (s[4] & 0x7e00) >> 9,             // in 16-pixel columns
      height: s[4] & 0x01ff,
      raw: s,
    });
  }
  return out;
}
