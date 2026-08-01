// THE IGS023 ZOOM TABLE -- ROM DATA, UPLOADED ONCE, AND ONE ENTRY THE RAMP
// DOES NOT PREDICT.
//
// The table is not computed and it is not written by gameplay.  Build B uploads
// it exactly once, from a PC-relative literal:
//
//   23c5c8: lea $B01000,A0
//   23c5ce: lea ($23C588,PC),A1
//   23c5d2: move.w #$F,D0
//   23c5d6: move.l (A1)+,(A0)+ / dbra D0,$23C5D6      16 longwords
//
// The identical 64-byte blob occurs THREE times in the cartridge image --
// $00DF2C (the PGM BIOS), $13C8F4 (build A) and $23C588 (build B) -- and
// `w10zoom.lua` read `:igs023:zoomram` at the sample point of 5,000 consecutive
// logic frames of `stage1-deep` and got ONE distinct table, byte-identical to
// this literal (10-recon-display-list §6a, re-measured in wave 11 -- see
// `11-impl-display-list-keystone.md`).  Presence, not coverage: $B01000's only
// writer FOUND is that one loop.  So the port bakes the constant and ASSERTS it
// against the running machine's `:igs023:zoomram` rather than trusting it.
//
// THE ENTRY-$F QUIRK, and why the port substitutes 1.
//
// The sixteen words are a monotone POPCOUNT RAMP -- 16, 15, 14 ... 3, 2 -- a
// Bresenham-even distribution of N set bits across 32.  Entry $F is the single
// place the ramp breaks: it reads 0 where the ramp predicts a word with exactly
// ONE bit set, `0x00000001`.  That is precisely the value MAME substitutes, and
// MAME states the question without answering it (`igs023_video.cpp`, fetched
// verbatim 2026-08-01):
//
//   // some games (e.g. ddp3) have zero in last zoom table entry but expect 1
//   // is the last entry hard-coded to 1, or does zero have the same effect as 1?
//   xzoom = (xzom < 0x10) ? (xzom == 0xf) ? 1 : (...zoomram...) : 0;
//
// The argument for reproducing it, stated so it can be attacked: the ramp's
// last term is missing; the value MAME inserts is exactly the term the ramp
// predicts; three independently built program images ship the same zero; and
// the game REALLY DOES index that entry (10-recon-display-list §6b: 34 x-records
// and 18 y-records reach effective index $F over 5,000 logic frames, through
// BOTH encodings -- `grow=0,zom=$F` and `grow=1,zom=1`).  A literal 0 there
// would make such a sprite lose every source pixel and VANISH, not shrink.
//
// WHAT THIS IS NOT: a hardware measurement.  Nobody here has probed the ASIC.
// This is inference from the ROM plus MAME's behaviour and must be labelled that
// way wherever it is quoted.  `zoomcov`'s named cases `eff-index-0F` and
// `eff-index-10` and the `zoom-f-literal` mutation are what keep the inference
// from being invisible.

/** `$23C588`, 16 longwords, verified byte-identical at $00DF2C and $13C8F4. */
export const ZOOM_TABLE = Object.freeze([
  0x55555555, 0x55155555, 0x55155515, 0x15155515,   // popcount 16 15 14 13
  0x15151515, 0x15111515, 0x15111511, 0x11111511,   //          12 11 10  9
  0x11111111, 0x11011111, 0x11011101, 0x01011101,   //           8  7  6  5
  0x01010101, 0x00010101, 0x00010001, 0x00000000,   //           4  3  2  0 <-- the ramp says 1
]);

/** Where the ROM literal lives, cited so the constant can be re-read. */
export const ZOOM_TABLE_ROM = 0x23c588;
/** The three sites the same 64 bytes occur at: BIOS, build A, build B. */
export const ZOOM_TABLE_SITES = Object.freeze([0x00df2c, 0x13c8f4, 0x23c588]);
/** `$23C5C8` uploads it here, once. */
export const ZOOM_TABLE_HW = 0xb01000;

/** The value MAME substitutes for entry $F, and the value the ramp predicts. */
export const ZOOM_ENTRY_F_SUBSTITUTE = 1;

/** The table as the 32 u16 the hardware share holds: hi, lo, hi, lo, ... */
export function zoomRamWords() {
  const w = new Uint16Array(32);
  for (let z = 0; z < 16; z++) {
    w[z * 2] = (ZOOM_TABLE[z] >>> 16) & 0xffff;
    w[z * 2 + 1] = ZOOM_TABLE[z] & 0xffff;
  }
  return w;
}

/**
 * THE BOOT ASSERTION.  Compare the baked constant against whatever the machine
 * (or a dump of `:igs023:zoomram`) actually holds, and throw naming the entry.
 * A constant nobody checks is a constant that silently rots when a later wave
 * finds a second writer for $B01000.
 *
 * @param {ArrayLike<number>} zoomram  32 u16, hi/lo per entry
 * @param {string} where               provenance, printed in the message
 */
export function assertZoomTable(zoomram, where = ':igs023:zoomram') {
  if (!zoomram || zoomram.length < 32) {
    throw new Error(`zoom table check: ${where} is ${zoomram ? zoomram.length : 0}`
      + ` words, expected 32`);
  }
  const bad = [];
  for (let z = 0; z < 16; z++) {
    const got = (((zoomram[z * 2] & 0xffff) << 16) | (zoomram[z * 2 + 1] & 0xffff)) >>> 0;
    if (got !== ZOOM_TABLE[z] >>> 0) {
      bad.push(`entry $${z.toString(16).toUpperCase()}: ${where} has `
        + `${got.toString(16).padStart(8, '0')}, $${ZOOM_TABLE_ROM.toString(16)
          .toUpperCase()} has ${(ZOOM_TABLE[z] >>> 0).toString(16).padStart(8, '0')}`);
    }
  }
  if (bad.length) {
    throw new Error(`ZOOM TABLE MISMATCH (${bad.length}/16): ${bad.join('; ')}. `
      + `The baked $${ZOOM_TABLE_ROM.toString(16).toUpperCase()} blob and the `
      + `machine disagree -- either $${ZOOM_TABLE_HW.toString(16).toUpperCase()} `
      + `has a second writer nobody has found, or the ROM directory changed.`);
  }
  return true;
}

/** The popcount ramp, as a fact about the constant rather than a claim in prose.
 *  Returns the 16 popcounts; entry $F's is 0 and every other one is 16-z. */
export function popcounts() {
  return ZOOM_TABLE.map((v) => {
    let n = 0, x = v >>> 0;
    while (x) { n += x & 1; x >>>= 1; }
    return n;
  });
}
