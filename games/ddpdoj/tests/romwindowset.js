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

// ---------------------------------------------------------------------------
// W484 ADDED TWO MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// Type $50's init stub at `$2703FA + $08` and its contiguous prototype block at
// `$270426 + $20` are disjoint from every earlier declaration and from each other.
// Measured: 623 -> 625 windows, 75 -> 75 overlapping pairs.

// ---------------------------------------------------------------------------
// W483 ADDED THREE MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// Type $4F's init stub at `$270298 + $08`, its contiguous prototype block at
// `$2702C4 + $22`, and its eleven reachable art longs at `$2703BA + $2C` are
// disjoint from every earlier declaration and from each other.
// Measured: 620 -> 623 windows, 75 -> 75 overlapping pairs.

// ---------------------------------------------------------------------------
// W482 ADDED TWO MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// Type $4E's init stub at `$2701D6 + $08` and its contiguous prototype block at
// `$270202 + $20` are disjoint from every earlier declaration and from each other.
// Measured: 618 -> 620 windows, 75 -> 75 overlapping pairs.

// ---------------------------------------------------------------------------
// W479 AND W481 ADDED FIVE MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// W479's `$25291C + $0C` bonus-follower frame table and W481's four type-$52
// windows at `$270634`, `$270666`, `$270972`, and `$2709DC` are disjoint from
// every earlier declaration and from one another. Measured: 613 -> 618 windows,
// 75 -> 75 overlapping pairs.

// ---------------------------------------------------------------------------
// W435 ADDED ONE MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$28D864 + $60` -- the eight nodes of the `$28D862` anim-chain script -- ABUTS
// W124's two-byte node-count window at `$28D862`, which ends at exactly $28D864.
// Measured: 612 -> 613 windows, 75 -> 75 overlapping pairs. Same shape as W429's:
// the loader's only read below the seam is `rom.u16($28D862)` and the content
// cursor starts at $28D864, so no read crosses it. The far end is pinned by code
// as well as by arithmetic -- 8 nodes x 6 words ends at $28D8C4, which is the
// script `$28DE44 lea $28D8C4(PC)` hands the stage-5 arm.

// ---------------------------------------------------------------------------
// W429 ADDED ONE WINDOW AND THE OVERLAP COUNT DID NOT MOVE. THAT IS THE POINT.
// ---------------------------------------------------------------------------
// `$28B08E + $6A` -- the cue dispatch's kind-$C/$10/$14 descriptors and art
// tables -- ABUTS W173's `$28AC72 + $41C`, which ends at exactly $28B08E.
// Measured: 611 -> 612 windows, 75 -> 75 overlapping pairs. This is the
// ORDINARY case the house rule describes, and it is worth stating next to
// W428's note so the two are not confused: W428 had to overlap because a cue
// RECORD's longword straddled a seam; here every read starts on a descriptor
// or an art entry at $28B08E or above, and W173's window's last read is the
// kind-8 art longword $28B08A..$28B08D. Nothing crosses. Abutting works when
// the structures line up with the seam, and only then.

/** The count `tables.rom.windows.length` must equal. MEASURED from
 *  `player.tables.json`, not computed by hand. */
export const ROM_WINDOW_COUNT = 625;

/** The one window W429 declared, and the window it abuts WITHOUT overlapping.
 *  `tests/w429cuekinds.test.js` asserts the abutment is exact. */
export const W429_ABUTTING_PAIR = Object.freeze([0x28b08e, 0x28ac72]);

/** The one window W435 declared, and the window it abuts WITHOUT overlapping.
 *  `tests/w435resultchain.test.js` asserts the abutment is exact. */
export const W435_ABUTTING_PAIR = Object.freeze([0x28d864, 0x28d862]);

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
  + "end and RomWindows.#at cannot stitch across a seam. W429 added a window "
  + "($28B08E) and W435 added another ($28D864), and NEITHER moved this "
  + "number, because both abut. See tests/romwindowset.js.";
