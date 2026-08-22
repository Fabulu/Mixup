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
// W488 ADDED TWO MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$25F2D0` reads two fixed `$10`-byte label-string slots at `$25F1F0` and two
// four-byte descriptors at `$25F43A`. Both windows are disjoint from every prior declaration.
// Measured: 630 -> 632 windows, 437,749 -> 437,789 bytes, 75 -> 75 overlapping pairs.

// ---------------------------------------------------------------------------
// W487 ADDED ONE MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// Type $58's contiguous record and sub-record prototype block at `$270C3A + $2C` ends exactly at
// handler `$270C66`, is disjoint from every earlier declaration, and exports no executable bytes.
// Measured: 629 -> 630 windows, 437,705 -> 437,749 bytes, 75 -> 75 overlapping pairs.

// ---------------------------------------------------------------------------
// W486 ADDED ONE MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// Type $58's init stub at `$270BDC + $08` is disjoint from every earlier declaration. It is the only
// new cartridge read needed to drain state 4's restored deferred pair far enough to name the +8 body.
// Measured: 628 -> 629 windows, 75 -> 75 overlapping pairs.

// ---------------------------------------------------------------------------
// W485 ADDED THREE MORE, AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// Type $51's init stub at `$2704C8 + $08`, its contiguous prototype block at
// `$2704F4 + $22`, and its fourteen reachable art longs at `$2705FC + $38` are
// disjoint from every earlier declaration and from each other.
// Measured: 625 -> 628 windows, 75 -> 75 overlapping pairs.

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
// ---------------------------------------------------------------------------
// W497 ADDED ONE WINDOW AND ONE FORCED OVERLAP.
// ---------------------------------------------------------------------------
// `$253D88` indexes six longwords at `$253A58` by even power word 0..$A. Its
// exact 24-byte window is disjoint from every prior declaration, taking the set
// from 632 to 633 windows. Separately, the widened `$24D8A0` authentic-style
// template window now ends at `$24DDD6` and overlaps `$24DDD0 + $1B0` by six
// bytes. The last 38-byte template begins at `$24DDB0`, and its longword at
// +$1E spans `$24DDCE..$24DDD1`; an abutting seam at `$24DDD0` cannot serve that
// read because RomWindows.#at does not stitch. Measured: 75 -> 76 pairs.

// ---------------------------------------------------------------------------
// W502 ADDED TWO WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$25E716 + $18` contains the two 12-byte coordinate-and-art records consumed by `$25E72E`.
// `$25F270 + $60` contains the three pairs of `$10`-byte TX message slots consumed by `$25F30C`.
// Both declarations are disjoint. Measured: 637 -> 639 windows, 444,613 -> 444,733 bytes,
// 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W501 ADDED THREE WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$25F7C8 + $A0` is the 40-long main animation table indexed by record word +$A over
// `{0,4,..,$9C}`. `$25F880 + $78` contains the three contiguous `$28`-byte sprite blocks whose
// pointers W375 already exports. `$25F8F8 + $40` is the 16-long satellite zoom-flag table indexed
// over byte offsets `{0,4,..,$3C}`. All three declarations are disjoint. The four palettes consumed
// by `$25F592` already sit inside `$222A78 + $2880`, so no redundant overlapping palette window was
// added. Measured: 634 -> 637 windows, 444,269 -> 444,613 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W500 ADDED ONE WINDOW AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$25FC68 + $20` contains the two adjacent, independently $FF-terminated TX
// control streams consumed by `$25FAA4`'s local leaves. It is disjoint from
// every prior declaration. Measured: 633 -> 634 windows, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W503 ADDED ONE WINDOW AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$28D8C4 + $E6` contains the type-$13 ending script's count word and nineteen
// six-word nodes. It begins exactly where W435's `$28D864 + $60` window ends,
// and ends exactly at `$28D9AA` code. Measured: 639 -> 640 windows,
// 444,733 -> 444,963 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W504 ADDED NINE WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$290F66 + $28` is type 7's exact first common script and abuts W372's
// sequence set. Eight sparse four-byte windows expose only the spawn-table
// longwords that script reads, at indices $05, $4A, $59, $5B, $65, $73, $CC,
// and $E0. All nine declarations are disjoint. Measured: 640 -> 649 windows,
// 444,963 -> 445,035 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W505 ADDED TWENTY WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$290F8E + $54` is type 7's exact second common script and abuts W504's
// first script. Nineteen sparse four-byte windows expose only its previously
// absent spawn-table longwords; indices $05, $59, and $CC reuse W504 windows.
// All twenty declarations are disjoint. Measured: 649 -> 669 windows,
// 445,035 -> 445,195 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W506 ADDED TWENTY-ONE WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$290FE2 + $5E` is variant 0's exact third script and abuts W505's second
// script. Twenty sparse four-byte windows expose only its previously absent
// spawn-table longwords; six selections reuse W504/W505 windows. All twenty-one
// declarations are disjoint. Measured: 669 -> 690 windows,
// 445,195 -> 445,369 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W507 ADDED TWENTY-FOUR WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$2910F6 + $7C` is variant 0's exact fourth script. Twenty-three sparse
// four-byte windows expose only its previously absent spawn-table longwords;
// thirteen distinct selections reuse W504-W506 windows, and resource operand 0
// reuses W372's `$290E58 + $46` window. All twenty-four new declarations are
// disjoint. Measured: 690 -> 714 windows, 445,369 -> 445,585 bytes,
// 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W508 ADDED FOUR WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$291172 + $3E` is variant 0's exact fifth and final listed script, ending at
// `$2911B0` menu code. Three sparse four-byte windows expose only its absent
// spawn-table indices $D2, $E5, and $E6; its other selections reuse W504-W507,
// and resource operand 4 reuses W372's `$290E58 + $46` set. All four new
// declarations are disjoint. Measured: 714 -> 718 windows,
// 445,585 -> 445,659 bytes, 76 -> 76 pairs.

export const ROM_WINDOW_COUNT = 718;

/** W497's forced `[authentic-style templates, prior pointed-struct window]`
 * overlap. `tests/w428cuescript.test.js` asserts its exact six-byte shape. */
export const W497_OVERLAP_PAIR = Object.freeze([0x24d8a0, 0x24ddd0]);

/** The one window W429 declared, and the window it abuts WITHOUT overlapping.
 *  `tests/w429cuekinds.test.js` asserts the abutment is exact. */
export const W429_ABUTTING_PAIR = Object.freeze([0x28b08e, 0x28ac72]);

/** The one window W435 declared, and the window it abuts WITHOUT overlapping.
 *  `tests/w435resultchain.test.js` asserts the abutment is exact. */
export const W435_ABUTTING_PAIR = Object.freeze([0x28d864, 0x28d862]);

/** The number of overlapping PAIRS over the whole window set. MEASURED. */
export const ROM_OVERLAP_PAIRS = 76;

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
  + "end and RomWindows.#at cannot stitch across a seam. W429 and W435 each "
  + "added an abutting window and moved no pair. W497 added one forced pair "
  + "where the $24DDB0 authentic-style template's +$1E longword crosses the "
  + "$24DDD0 seam. W500 added the disjoint $25FC68+$20 control-stream window, "
  + "W501 added disjoint $25F7C8+$A0, $25F880+$78, and $25F8F8+$40 animation "
  + "windows, W502 added disjoint $25E716+$18 records and $25F270+$60 messages, "
  + "W503 added the abutting $28D8C4+$E6 ending script, W504 added the "
  + "abutting $290F66+$28 first type-7 script plus its eight sparse spawn-table "
  + "longwords, W505 added the abutting $290F8E+$54 second script plus nineteen "
  + "new sparse longwords, W506 added $290FE2+$5E plus twenty sparse longwords, "
  + "W507 added $2910F6+$7C plus twenty-three sparse longwords, and W508 added "
  + "$291172+$3E plus three sparse longwords; none moved the overlap count. See "
  + "tests/romwindowset.js.";
