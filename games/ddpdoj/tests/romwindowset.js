// THE ROM WINDOW SET'S TWO GLOBAL TRIPWIRES, IN ONE PLACE. (W428)
//
// `tools/export-tables.py` declares which cartridge bytes the port lets itself
// read. Two numbers about that set have been asserted, wave after wave, as a
// tripwire: how many windows there are, and how many PAIRS of them overlap.
// The overlap number is the interesting one. Windows are allowed to overlap --
// the cartridge really does lay a table across a routine, and several waves
// have declared such a window on purpose -- so the guard is not "zero overlaps"
// but "the number did not move without someone saying why".
//
// **IT LIVED IN THIRTEEN FILES AS A HARD-CODED INTEGER, AND THAT IS WHY ONE
// WAVE'S FOUR WINDOWS BROKE FOURTEEN TESTS.** A global invariant copied into
// every test that touches it is not thirteen guards, it is one guard with
// thirteen places to forget. It is declared once here, and
// `tests/w428cuescript.test.js` asserts both values against the live
// `player.tables.json` so this file cannot drift from what the exporter emits.
//
// ---------------------------------------------------------------------------
// WHY THE OVERLAP COUNT MOVED FROM 71 TO 75, AND WHY THAT IS CORRECT
// ---------------------------------------------------------------------------
// W428 declared the four word-threshold CUE SCRIPTS -- types $1A, $80, $82 and
// $88 -- each of which begins INSIDE the type's own prototype window and runs
// on past its end, up to the handler instruction that follows it. Each is
// therefore one new overlapping pair, and four windows added exactly four:
//
//     $268E32 + $3A  overlaps  $268DD2 + $68   (type $1A, W353's window)
//     $273986 + $3A  overlaps  $273920 + $80   (type $80, W23's)
//     $2747A8 + $1E  overlaps  $274740 + $70   (type $82, W23's)
//     $275F04 + $2C  overlaps  $275EA0 + $80   (type $88, W23's)
//
// **THE OVERLAP IS NOT A CONVENIENCE, IT IS FORCED.** `RomWindows.#at` resolves
// a read inside ONE window (`a >= w.base && a + n <= w.base + w.len`); it does
// not stitch across a seam. Type $80's record 1 carries its script longword at
// $27399E..$2739A1, straddling the end of W23's `$273920 + $80`. W428 declared
// an ABUTTING window at `$2739A0 + $20`, regenerated the tables and re-ran:
// `$27399E` threw exactly as before, because no single window held all four
// bytes. So an abutting window cannot fix a straddling read, and declaring the
// structure from its own first byte -- overlapping what clipped it -- is the
// only shape that works.
//
// A WAVE THAT ADDS NON-OVERLAPPING WINDOWS STILL LEAVES THIS NUMBER ALONE. The
// per-wave assertions that read it are making the claim "MY windows overlap
// nothing", and they express that by comparing the count with and without their
// own windows. That claim is untouched by W428's four.

/** The count `tables.rom.windows.length` must equal. MEASURED from
 *  `player.tables.json`, not computed by hand. */
export const ROM_WINDOW_COUNT = 611;

/** The number of overlapping PAIRS over the whole window set. MEASURED. */
export const ROM_OVERLAP_PAIRS = 75;

/** The four pairs W428 added, `[cue script, the prototype window it straddles]`. */
export const W428_OVERLAP_PAIRS = Object.freeze([
  Object.freeze([0x268e32, 0x268dd2]),   // type $1A
  Object.freeze([0x273986, 0x273920]),   // type $80
  Object.freeze([0x2747a8, 0x274740]),   // type $82
  Object.freeze([0x275f04, 0x275ea0]),   // type $88
]);

/** The count every one of these tests used to inline, kept so the prose below
 *  can say what the number WAS as well as what it is. */
export const OVERLAP_PAIRS_BEFORE_W428 = 71;

/** Every unordered pair of windows whose byte ranges intersect. `list` is the
 *  `[base, len]` shape the tests build from `tables.rom.windows`. Abutting is
 *  NOT overlapping: `a + la === b` does not count. */
export function overlappingPairs(list) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    for (let k = i + 1; k < list.length; k++) {
      const [a, la] = list[i];
      const [b, lb] = list[k];
      if (a < b + lb && b < a + la) n++;
    }
  }
  return n;
}

/** One sentence for the assertion messages, so thirteen files stop each
 *  carrying their own account of why the number is what it is. */
export const OVERLAP_NOTE = `${ROM_OVERLAP_PAIRS} overlapping pairs over the `
  + `whole ${ROM_WINDOW_COUNT}-window set. It was ${OVERLAP_PAIRS_BEFORE_W428} `
  + "for twelve waves; W428 added FOUR, one per word-threshold cue script "
  + "($268E32 $273986 $2747A8 $275F04), each of which begins inside its type's "
  + "prototype window because a cue record's longwords straddle that window's "
  + "end and RomWindows.#at cannot stitch across a seam. See "
  + "tests/romwindowset.js.";
