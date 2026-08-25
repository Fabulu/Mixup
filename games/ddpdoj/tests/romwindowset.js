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

// ---------------------------------------------------------------------------
// W509 ADDED FOURTEEN WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$2914F0 + $5A` is sequence list A's exact first script. Eleven sparse
// four-byte windows expose only its absent spawn-table longwords, while fourteen
// distinct selections reuse W504-W508. `$8005 $0001 $0003` reuses W372's
// `$290DAE + $AA` descriptor set and adds only its two exact 64-byte palette
// targets at `$225AB8` and `$225B38`. All fourteen declarations are disjoint.
// Measured: 718 -> 732 windows, 445,659 -> 445,921 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W510 ADDED TEN WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$29154A + $56` is sequence list A's exact second script. Nine sparse
// four-byte windows expose only its absent spawn-table longwords, while thirteen
// distinct selections reuse W504-W509 and resource operand 0 reuses W372's
// `$290E58 + $46` set. All ten declarations are disjoint. Measured:
// 732 -> 742 windows, 445,921 -> 446,043 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W511 ADDED SEVEN WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$2915A0 + $64` is sequence list A's exact third script. Six sparse four-byte
// windows expose only its absent spawn-table longwords, while eleven distinct
// selections reuse W504-W510 and resource operand 0 reuses W372's `$290E58 + $46`
// set. All seven declarations are disjoint. Measured:
// 742 -> 749 windows, 446,043 -> 446,167 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W512 ADDED SIX WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$291604 + $68` is sequence list A's exact fourth script. Five sparse four-byte
// windows expose only its absent spawn-table longwords, while twenty-four distinct
// selections reuse W504-W511. Both resource operands reuse W372's descriptor sets,
// and `$8005 $0002 $0004` reuses W509's two palette targets. All six declarations
// are disjoint. Measured: 749 -> 755 windows, 446,167 -> 446,291 bytes,
// 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W513 ADDED TWO WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$29166C + $26` is sequence list A's exact fifth script. One sparse four-byte
// window exposes its absent spawn-table longword for index `$C0`, while six
// distinct selections reuse W504-W512 and resource operand 0 reuses W372's
// `$290E58 + $46` set. The script window abuts W512's script, and the sparse
// longword abuts W505's `$2905C6 + $04` longword. Measured: 755 -> 757 windows,
// 446,291 -> 446,333 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W514 ADDED ELEVEN WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$291692 + $48` is sequence list A's exact sixth script and abuts W513's
// script. Ten sparse four-byte windows expose only its absent spawn-table
// longwords, while nine distinct selections reuse W504-W513 and resource
// operand 0 reuses W372's `$290E58 + $46` set. All eleven declarations are
// disjoint. Measured: 757 -> 768 windows, 446,333 -> 446,445 bytes,
// 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W515 ADDED SEVEN WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$2916DA + $26` is sequence list A's exact seventh script and abuts W514's
// script. Six sparse four-byte windows expose only its absent spawn-table
// longwords, while three distinct selections reuse W504-W514 and resource
// operand 0 reuses W372's `$290E58 + $46` set. All seven declarations are
// disjoint. Measured: 768 -> 775 windows, 446,445 -> 446,507 bytes,
// 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W516 ADDED TWO WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$291700 + $7C` is sequence list A's exact eighth script and abuts W515's
// script. One sparse four-byte window exposes its only absent spawn-table
// longword, index `$DE`; its other 29 distinct selections reuse W504-W515.
// `$8005 $0000/$0003` and `$8003 $0003` reuse W372's descriptor sets and W509's
// palette targets. Both declarations are disjoint. Measured: 775 -> 777 windows,
// 446,507 -> 446,635 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W517 ADDED THREE WINDOWS AND THE OVERLAP COUNT STILL DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$29177C + $42` is sequence list A's exact ninth and final script and abuts
// W516's script. Two sparse four-byte windows expose its only absent spawn-table
// longwords, indices `$9E` and `$A1`; its other 14 distinct selections reuse
// W504-W516. Operand 4 reuses W372's `$290E80` resource. The script is disjoint,
// while both sparse longwords only abut prior declarations. Measured: 777 -> 780
// windows, 446,635 -> 446,709 bytes, 76 -> 76 pairs.

// ---------------------------------------------------------------------------
// W518 ADDED THREE WINDOWS AND ONE FORCED OVERLAP.
// ---------------------------------------------------------------------------
// Slot [15]'s `$2921BA + $220` text pool ends exactly at its horizontal
// 96-longword glyph table `$2923DA + $180`, which ends exactly at its vertical
// 96-longword glyph table `$29255A + $180`. The three new declarations are
// mutually abutting. The vertical table ends at `$2926DA`, so its final ten
// bytes necessarily overlap W23's existing `$2926D0 + $20` slot-[14] init-stub
// window. Measured: 780 -> 783 windows, 446,709 -> 448,021 bytes,
// 76 -> 77 pairs.

// ---------------------------------------------------------------------------
// W522 ADDED TWO DISJOINT WINDOWS AND THE OVERLAP COUNT DID NOT MOVE.
// ---------------------------------------------------------------------------
// `$26725A + $08` is type `$3D`'s exact zero-length init stub and abuts W201's
// type `$19` closure. `$267366 + $46` contains only type `$3D`'s palette and
// prototype data. Measured: 783 -> 785 windows, 448,021 -> 448,099 bytes,
// 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W525 ADDED ONE DISJOINT WINDOW; W526 WIDENED ONE EXISTING WINDOW.
// ---------------------------------------------------------------------------
// `$24E512 + $DC` closes the Type-B normal-shot pointer table and descriptors.
// W526 then extends `$24DDD0` to abut `$24DFE0`, without changing its identity.
// Measured: 785 -> 786 windows, 448,099 -> 448,415 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W527-W529 ADDED FIVE DISJOINT WINDOWS; W530-W531 ADDED NONE.
// ---------------------------------------------------------------------------
// W527 adds Type-B's `$24E5EE + $136` hit-descriptor family. W528 adds the
// `$27FD72 + $9C` flying-bee waypoint rows. W529 adds Type `$A5`'s eight-byte
// init stub, 56-byte prototype block, and 384-byte direction tables.
// Measured: 786 -> 791 windows, 448,415 -> 449,329 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W534 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$000BF0 + $14` is the exact five-longword BIOS span reached when Type $9C's
// offscreen family-$11 satellites retain A0=$060006C0 and index $0540..$0530
// through the 68000's 24-bit external bus. Measured: 791 -> 792 windows,
// 449,329 -> 449,349 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W535 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$23F746 + $3C` is Type $9E's exact negative-velocity, record-convention
// bucket-22 sprite enqueue routine. It ends at its `rts`, before the unrelated
// saved-register body at $23F782. Measured: 792 -> 793 windows,
// 449,349 -> 449,409 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W540 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A051A + $412` is the complete Stage-4 boss A4-id-2 death script and its
// exact sound, effect, and animation tables. Measured: 793 -> 794 windows,
// 449,409 -> 450,451 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W542 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$273F06 + $8` is type $81's complete init stub. Spawn init dispatch reads
// its run-length immediate at `$273F08`. Measured: 794 -> 795 windows,
// 450,451 -> 450,459 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W543 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$269256 + $8` is type $1B's complete init stub. It abuts the prior art
// window ending at `$269256`. Measured: 795 -> 796 windows,
// 450,459 -> 450,467 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W544 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2659DC + $8` is type $59's complete init stub. It abuts W199's type-$3F
// closure ending at `$2659DC`. Measured: 796 -> 797 windows,
// 450,467 -> 450,475 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W545 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$26DDA4 + $8` is type $43's complete init stub. It is disjoint from W339's
// death-spawn list and W341's prototype window. Measured: 797 -> 798 windows,
// 450,475 -> 450,483 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W546 ADDED ELEVEN DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// The recursive progression closure now verifies every reachable eight-byte
// init stub. Its eleven remaining stubs add 88 exact bytes and no overlap.
// Measured: 798 -> 809 windows, 450,483 -> 450,571 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W551 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A46B2 + $50` is Hibachi's nineteen-entry A2 scheduler list plus its
// terminator. It ends at the first routine. Measured: 809 -> 810 windows,
// 450,571 -> 450,651 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W552 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A6788 + $3A` is Hibachi A4 script 0's four-record animation chain. It
// ends exactly at A4 script 6. Measured: 810 -> 811 windows,
// 450,651 -> 450,709 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W553 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A4E56 + $60` is Hibachi's twelve-pair A0 main-sequencer table. It ends
// exactly at the shared `$2A4EB6` part-position body. Measured: 811 -> 812
// windows, 450,709 -> 450,805 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W554 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A5492 + $40` is Hibachi's eight-pair A3 scheduler table. It ends exactly
// at `$2A54D2` code. Measured: 812 -> 813 windows,
// 450,805 -> 450,869 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W555 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A4774 + $18` is Hibachi A2 object 0's six-longword art table. It begins
// after the routine's alignment word and ends exactly at object 1 `$2A478C`.
// Measured: 813 -> 814 windows, 450,869 -> 450,893 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W558 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A49F6 + $100` is Hibachi A2 objects 3 through 8's shared 64-longword art
// table. It begins after object 8's alignment and ends exactly at object 9
// `$2A4AF6`. Measured: 814 -> 815 windows, 450,893 -> 451,149 bytes,
// 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W560 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A4B40 + $18` is the six-longword art table shared by Hibachi A2 objects 9
// and 15. It begins after their shared routine's alignment and ends exactly at
// object 11 `$2A4B58`. Measured: 815 -> 816 windows,
// 451,149 -> 451,173 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W562 ADDED FOUR DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// Loop-zero Hibachi A1 gun 0 reads its eleven-word template at `$2A9318 + $16`,
// six attached-position longwords at `$2A934E + $18`, six ten-byte burst rows at
// `$2A967A + $3C`, and its 64-longword attached-vector table at `$2A96B6 + $100`.
// All four declarations are disjoint. Measured: 816 -> 820 windows,
// 451,173 -> 451,535 bytes, 77 -> 77 overlapping pairs. The exact additive
// payload is four windows and $16A bytes.

// ---------------------------------------------------------------------------
// W563 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A97B6 + $1E` is loop-zero Hibachi A1 gun 1's exact fifteen-word slot
// template. It ends before eight unused self-pointers at `$2A97D4`. Measured:
// 820 -> 821 windows, 451,535 -> 451,565 bytes, 77 -> 77 overlapping pairs.

// ---------------------------------------------------------------------------
// W564 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A9A68 + $18` is loop-zero Hibachi A1 gun 2's exact twelve-word slot
// template. Padding at `$2A9A80..$2A9A9F` remains outside every new window.
// Measured: 821 -> 822 windows, 451,565 -> 451,589 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W565 ADDED TWO DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// `$2A9E50 + $14` is loop-zero Hibachi A1 gun 3's ten-word slot template and
// `$2AA004 + $3C` is its five-row paired-shot pattern. The intervening
// `$2A9E64..$2A9E83` self-pointers remain unexported. Measured: 822 -> 824
// windows, 451,589 -> 451,669 bytes, 77 -> 77 overlapping pairs.

// ---------------------------------------------------------------------------
// W566 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2AA040 + $12` is loop-zero Hibachi A1 gun 4's exact nine-word slot
// template. Its `$2AA052..$2AA071` self-pointers and padding remain unexported.
// Measured: 824 -> 825 windows, 451,669 -> 451,687 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W568 ADDED FOURTEEN DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// `$29139E + $D2` is the complete slot-7 menu intro through its `$FFFF`
// terminator. Thirteen sparse four-byte windows expose only the spawn-table
// longwords the intro indexes. Measured: 825 -> 839 windows,
// 451,687 -> 451,949 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W569 WIDENED ONE EXISTING WINDOW BY ONE WORD.
// ---------------------------------------------------------------------------
// The chain-meter cap is an inclusive maximum index. Loop 2 therefore reads the
// zero word at $2881CE. Measured: 839 windows, 451,949 -> 451,951 bytes, 77 pairs.

// ---------------------------------------------------------------------------
// W570 ADDED FOUR DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// Main-table Hibachi A1 gun 0 reads one template, six correction longwords, six
// curtain rows, and one 64-longword vector table. Measured: 839 -> 843 windows,
// 451,951 -> 452,313 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W571 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A7812 + $1E` is main-table Hibachi A1 gun 1's exact fifteen-word slot
// template. It abuts gun 0's vector table and ends before eight unused
// self-pointers. Measured: 843 -> 844 windows, 452,313 -> 452,343 bytes,
// 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W572 ADDED ONE DISJOINT WINDOW.
// ---------------------------------------------------------------------------
// `$2A7A7A + $18` is main-table Hibachi A1 gun 2's exact twelve-word slot
// template. It ends before eight unused self-pointers. Measured: 844 -> 845
// windows, 452,343 -> 452,367 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W573 ADDED TWO DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// `$2A7E30 + $14` is main-table Hibachi A1 gun 3's exact ten-word slot
// template and `$2A7FEC + $3C` is its five-row paired-shot pattern. The
// intervening `$2A7E44..$2A7E63` self-pointers remain unexported. Measured:
// 845 -> 847 windows, 452,367 -> 452,447 bytes, 77 -> 77 pairs.

// ---------------------------------------------------------------------------
// W576 ADDED TWO DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// `$2A4C36 + $0C` contains Hibachi A2 object 14's three art longwords and
// `$2A4C6C + $90` contains object 10's twenty-four six-byte art/palette rows.
// Each begins after an unreachable alignment nop and ends exactly at the next
// routine. Measured: 847 -> 849 windows, 452,447 -> 452,603 bytes,
// 77 -> 77 overlapping pairs.

// ---------------------------------------------------------------------------
// W584 ADDED TWO DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// `$23FE5C + $36` is Hibachi A2 object 16's bucket-24 register enqueue stub and
// `$2A4D3E + $20` is its eight-longword art table. The stub ends at its RTS and
// the art table ends exactly at object 17. Measured: 849 -> 851 windows,
// 452,603 -> 452,689 bytes, 77 -> 77 overlapping pairs.

// ---------------------------------------------------------------------------
// W588 ADDED THREE DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// `$291040 + $5C` is slot [7] variant 1's exact third script through its `$FFFF`
// terminator. Two sparse four-byte windows expose only spawn-table indices $88
// and $91. Measured: 851 -> 854 windows, 452,689 -> 452,789 bytes,
// 77 -> 77 overlapping pairs.

// ---------------------------------------------------------------------------
// W589 ADDED FIFTY-TWO DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// Seven exact windows cover slot [7]'s complete list-B script family
// `$291836..$291B3A`; forty-five sparse four-byte windows expose only the new
// spawn-table longwords those scripts read. Measured: 854 -> 906 windows,
// 452,789 -> 453,741 bytes, 77 -> 77 overlapping pairs.

// ---------------------------------------------------------------------------
// W595 WIDENED ONE EXISTING DISJOINT WINDOW BY FOUR LONGWORDS.
// ---------------------------------------------------------------------------
// Type $9C's family-$11 offscreen satellite retains A0=$060006C0 and advances
// its dead-animation cursor through $052C, whose 24-bit sum is $000BEC. The
// exact BIOS window is therefore widened from `$000BF0 + $14` to
// `$000BE0 + $24`, covering all nine contiguous reads through $000C00.
// Measured: 906 windows, 453,741 -> 453,757 bytes, 77 overlapping pairs.

// ---------------------------------------------------------------------------
// W596 ADDED TWO DISJOINT WINDOWS.
// ---------------------------------------------------------------------------
// `$29109C + $5A` is slot [7] variant 2's exact third script through its
// `$FFFF` terminator. `$2904AE + $04` exposes only its previously absent
// spawn-table longword for index $7B. The script abuts W588 below and W507
// above; the sparse longword lies between existing index-$7A and index-$7C
// windows. Measured: 906 -> 908 windows, 453,757 -> 453,851 bytes,
// 77 -> 77 overlapping pairs.

export const ROM_WINDOW_COUNT = 908;

/** Total declared bytes over the current window set, with overlaps counted. */
export const ROM_WINDOW_BYTES = 453851;

/** W497's forced `[authentic-style templates, prior pointed-struct window]`
 * overlap. `tests/w428cuescript.test.js` asserts its exact six-byte shape. */
export const W497_OVERLAP_PAIR = Object.freeze([0x24d8a0, 0x24ddd0]);

/** W518's forced `[vertical glyph table, prior slot-[14] init-stub window]`
 * overlap. The exact 96-longword table ends ten bytes inside the prior window. */
export const W518_OVERLAP_PAIR = Object.freeze([0x29255a, 0x2926d0]);

/** The one window W429 declared, and the window it abuts WITHOUT overlapping.
 *  `tests/w429cuekinds.test.js` asserts the abutment is exact. */
export const W429_ABUTTING_PAIR = Object.freeze([0x28b08e, 0x28ac72]);

/** The one window W435 declared, and the window it abuts WITHOUT overlapping.
 *  `tests/w435resultchain.test.js` asserts the abutment is exact. */
export const W435_ABUTTING_PAIR = Object.freeze([0x28d864, 0x28d862]);

/** The number of overlapping PAIRS over the whole window set. MEASURED. */
export const ROM_OVERLAP_PAIRS = 77;

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

const W596_WINDOWS = Object.freeze([
  Object.freeze(['$29109C', 0x005a]), Object.freeze(['$2904AE', 0x0004]),
]);

/** Reconstruct the exact W595 table by removing only W596's additive windows. */
export function tableBeforeW596(tables) {
  const copy = JSON.parse(JSON.stringify(tables));
  const found = copy.rom.windows.filter((w) =>
    W596_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W596_WINDOWS.length) {
    throw new Error('the W596 slot [7] windows are only partially present');
  }
  for (const [base, len] of W596_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W596:')) {
      throw new Error(`${base} is not the exact W596 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W596_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W534_BIOS_WHY = "W534 type-$9C offscreen satellite's five 24-bit-wrapped "
  + 'BIOS animation longwords';
const W595_BIOS_WHY = "W595 type-$9C offscreen family-$11 satellite's nine "
  + '24-bit-wrapped BIOS animation longwords';

/** Reconstruct the exact pre-W595 table by undoing only W595's BIOS widening. */
export function tableBeforeW595(tables) {
  const copy = tableBeforeW596(tables);
  const old = copy.rom.windows.filter((w) => w.base === '$000BF0');
  const current = copy.rom.windows.filter((w) => w.base === '$000BE0');
  if (old.length === 1 && current.length === 0) {
    if (old[0].len !== 0x0014 || old[0].hex.length !== 0x0014 * 2
        || old[0].why !== W534_BIOS_WHY) {
      throw new Error('$000BF0 is not the exact pre-W595 BIOS window');
    }
    return copy;
  }
  if (old.length !== 0 || current.length !== 1) {
    throw new Error('the W595 BIOS widening is absent, duplicated, or partially present');
  }
  const window = current[0];
  if (window.len !== 0x0024 || window.hex.length !== 0x0024 * 2
      || window.why !== W595_BIOS_WHY) {
    throw new Error('$000BE0 is not the exact W595 BIOS widening');
  }
  const index = copy.rom.windows.indexOf(window);
  copy.rom.windows[index] = {
    base: '$000BF0', len: 0x0014, why: W534_BIOS_WHY,
    hex: window.hex.slice(0x10 * 2),
  };
  return copy;
}

const W589_WINDOWS = Object.freeze([
  Object.freeze(['$291836', 0x0078]), Object.freeze(['$2918AE', 0x0064]),
  Object.freeze(['$291912', 0x0046]), Object.freeze(['$291958', 0x0082]),
  Object.freeze(['$2919DA', 0x00ae]), Object.freeze(['$291A88', 0x007c]),
  Object.freeze(['$291B04', 0x0036]),
  Object.freeze(['$290416', 0x0004]), Object.freeze(['$29044E', 0x0004]),
  Object.freeze(['$29045A', 0x0004]), Object.freeze(['$290476', 0x0004]),
  Object.freeze(['$29047E', 0x0004]), Object.freeze(['$290482', 0x0004]),
  Object.freeze(['$2904AA', 0x0004]), Object.freeze(['$2904DE', 0x0004]),
  Object.freeze(['$2904E6', 0x0004]), Object.freeze(['$290502', 0x0004]),
  Object.freeze(['$290526', 0x0004]), Object.freeze(['$29052A', 0x0004]),
  Object.freeze(['$29056A', 0x0004]), Object.freeze(['$29056E', 0x0004]),
  Object.freeze(['$290572', 0x0004]), Object.freeze(['$290582', 0x0004]),
  Object.freeze(['$29058A', 0x0004]), Object.freeze(['$290592', 0x0004]),
  Object.freeze(['$290596', 0x0004]), Object.freeze(['$29059E', 0x0004]),
  Object.freeze(['$2905AA', 0x0004]), Object.freeze(['$2905B2', 0x0004]),
  Object.freeze(['$2905B6', 0x0004]), Object.freeze(['$2905BA', 0x0004]),
  Object.freeze(['$2905BE', 0x0004]), Object.freeze(['$2905DA', 0x0004]),
  Object.freeze(['$290602', 0x0004]), Object.freeze(['$29061A', 0x0004]),
  Object.freeze(['$29062E', 0x0004]), Object.freeze(['$290632', 0x0004]),
  Object.freeze(['$29063E', 0x0004]), Object.freeze(['$29067E', 0x0004]),
  Object.freeze(['$29069E', 0x0004]), Object.freeze(['$2906AE', 0x0004]),
  Object.freeze(['$2906B2', 0x0004]), Object.freeze(['$2906C2', 0x0004]),
  Object.freeze(['$2906E2', 0x0004]), Object.freeze(['$2906F6', 0x0004]),
  Object.freeze(['$290566', 0x0004]), Object.freeze(['$2905EE', 0x0004]),
  Object.freeze(['$2905F6', 0x0004]), Object.freeze(['$290636', 0x0004]),
  Object.freeze(['$2906AA', 0x0004]), Object.freeze(['$2906B6', 0x0004]),
  Object.freeze(['$2906E6', 0x0004]),
]);

/** Reconstruct the exact W588 table by undoing W595, then removing W589's windows. */
export function tableBeforeW589(tables) {
  const copy = tableBeforeW595(tables);
  const found = copy.rom.windows.filter((w) =>
    W589_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W589_WINDOWS.length) {
    throw new Error('the W589 slot [7] list-B windows are only partially present');
  }
  for (const [base, len] of W589_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W589:')) {
      throw new Error(`${base} is not the exact W589 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W589_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W588_WINDOWS = Object.freeze([
  Object.freeze(['$291040', 0x005c]), Object.freeze(['$2904E2', 0x0004]),
  Object.freeze(['$290506', 0x0004]),
]);

/** Reconstruct the exact W587 table by removing W589 and W588's additive windows. */
export function tableBeforeW588(tables) {
  const copy = tableBeforeW589(tables);
  const found = copy.rom.windows.filter((w) =>
    W588_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W588_WINDOWS.length) {
    throw new Error('the W588 slot [7] windows are only partially present');
  }
  for (const [base, len] of W588_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W588:')) {
      throw new Error(`${base} is not the exact W588 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W588_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W584_WINDOWS = Object.freeze([
  Object.freeze(['$23FE5C', 0x0036]), Object.freeze(['$2A4D3E', 0x0020]),
]);

/** Reconstruct the exact W583 table by removing W588 and W584's additive windows. */
export function tableBeforeW584(tables) {
  const copy = tableBeforeW588(tables);
  const found = copy.rom.windows.filter((w) =>
    W584_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W584_WINDOWS.length) {
    throw new Error('the W584 HIBACHI A2 windows are only partially present');
  }
  for (const [base, len] of W584_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W584:')) {
      throw new Error(`${base} is not the exact W584 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W584_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W576_WINDOWS = Object.freeze([
  Object.freeze(['$2A4C36', 0x000c]), Object.freeze(['$2A4C6C', 0x0090]),
]);

/** Reconstruct the exact W575 table by removing W576's additive windows. */
export function tableBeforeW576(tables) {
  const copy = tableBeforeW584(tables);
  const found = copy.rom.windows.filter((w) =>
    W576_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W576_WINDOWS.length) {
    throw new Error('the W576 HIBACHI A2 windows are only partially present');
  }
  for (const [base, len] of W576_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W576:')) {
      throw new Error(`${base} is not the exact W576 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W576_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W573_WINDOWS = Object.freeze([
  Object.freeze(['$2A7E30', 0x0014]), Object.freeze(['$2A7FEC', 0x003c]),
]);

/** Reconstruct the exact W572 table by removing W576 and W573. */
export function tableBeforeW573(tables) {
  const copy = tableBeforeW576(tables);
  const found = copy.rom.windows.filter((w) =>
    W573_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W573_WINDOWS.length) {
    throw new Error('the W573 HIBACHI gun-3 windows are only partially present');
  }
  for (const [base, len] of W573_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W573:')) {
      throw new Error(`${base} is not the exact W573 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W573_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W572_WINDOWS = Object.freeze([
  Object.freeze(['$2A7A7A', 0x0018]),
]);

/** Reconstruct the exact W571 table by removing W573 and W572. */
export function tableBeforeW572(tables) {
  const copy = tableBeforeW573(tables);
  const found = copy.rom.windows.filter((w) =>
    W572_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W572_WINDOWS.length) {
    throw new Error('the W572 HIBACHI gun-2 window is only partially present');
  }
  for (const [base, len] of W572_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W572:')) {
      throw new Error(`${base} is not the exact W572 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W572_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W571_WINDOWS = Object.freeze([
  Object.freeze(['$2A7812', 0x001e]),
]);

/** Reconstruct the exact W570 table by removing W571's additive window. */
export function tableBeforeW571(tables) {
  const copy = tableBeforeW572(tables);
  const found = copy.rom.windows.filter((w) =>
    W571_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W571_WINDOWS.length) {
    throw new Error('the W571 HIBACHI gun-1 window is only partially present');
  }
  for (const [base, len] of W571_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W571:')) {
      throw new Error(`${base} is not the exact W571 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W571_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W570_WINDOWS = Object.freeze([
  Object.freeze(['$2A733C', 0x0016]), Object.freeze(['$2A7372', 0x0018]),
  Object.freeze(['$2A76D6', 0x003c]), Object.freeze(['$2A7712', 0x0100]),
]);

/** Reconstruct the exact W569 table by removing W570's four additive windows. */
export function tableBeforeW570(tables) {
  const copy = tableBeforeW571(tables);
  const found = copy.rom.windows.filter((w) =>
    W570_WINDOWS.some(([base]) => w.base === base));
  if (found.length === 0) return copy;
  if (found.length !== W570_WINDOWS.length) {
    throw new Error('the W570 HIBACHI gun-0 windows are only partially present');
  }
  for (const [base, len] of W570_WINDOWS) {
    const matches = found.filter((w) => w.base === base);
    if (matches.length !== 1 || matches[0].len !== len
        || matches[0].hex.length !== len * 2 || !matches[0].why.startsWith('W570:')) {
      throw new Error(`${base} is not the exact W570 additive shape`);
    }
  }
  copy.rom.windows = copy.rom.windows.filter((w) =>
    !W570_WINDOWS.some(([base]) => w.base === base));
  return copy;
}

const W568_CHAIN_WHY = 'W113: chain-bar stage pointers $28809E (2 longs to '
  + '$2880A6/$28811A) + per-stage meter data (loop 0: 56 words, loop 1: 90 words), '
  + 'far end $2881CE pinned by the panel tile table $2881F2';

/** Reconstruct the exact W568 table from W569's one-word chain-meter widening. */
export function tableBeforeW569(tables) {
  const copy = tableBeforeW570(tables);
  const index = copy.rom.windows.findIndex((w) => w.base === '$28809E');
  if (index === -1) throw new Error('the $28809E chain-meter window is absent');
  const window = copy.rom.windows[index];
  if (window.len === 0x0130) return copy;
  if (window.len !== 0x0132 || !window.hex.endsWith('0000')) {
    throw new Error('the $28809E chain-meter window is not the exact W569 additive shape');
  }
  copy.rom.windows[index] = {
    base: '$28809E', len: 0x0130, why: W568_CHAIN_WHY, hex: window.hex.slice(0, -4),
  };
  return copy;
}

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
  + "W507 added $2910F6+$7C plus twenty-three sparse longwords, W508 added "
  + "$291172+$3E plus three sparse longwords, W509 added $2914F0+$5A, eleven "
  + "sparse longwords, and two palette targets, W510 added $29154A+$56 plus "
  + "nine sparse longwords, W511 added $2915A0+$64 plus six sparse longwords, "
  + "W512 added $291604+$68 plus five sparse longwords, W513 added the "
  + "abutting $29166C+$26 script plus one sparse longword, and W514 added the "
  + "abutting $291692+$48 script plus ten sparse longwords, W515 added the "
  + "abutting $2916DA+$26 script plus six sparse longwords, W516 added the "
  + "abutting $291700+$7C script plus one sparse longword, W517 added the "
  + "abutting $29177C+$42 final script plus two sparse longwords. W518 added "
  + "three mutually abutting slot-[15] text and glyph-table windows; the vertical "
  + "table's final ten bytes overlap W23's existing $2926D0+$20 slot-[14] "
  + "init-stub window, adding the 77th pair. W562 added four disjoint Hibachi "
  + "gun-0 data windows totalling $16A and moved no pair. W563 added the "
  + "disjoint $2A97B6+$1E Hibachi gun-1 template and moved no pair. W564 added "
  + "the disjoint $2A9A68+$18 Hibachi gun-2 template and moved no pair. W565 "
  + "added disjoint $2A9E50+$14 template and $2AA004+$3C pattern windows and "
  + "moved no pair. W568 added the disjoint $29139E+$D2 menu intro and thirteen "
  + "sparse spawn-table longwords, totalling $106 bytes, and moved no pair. W570 "
  + "added four disjoint main HIBACHI gun-0 data windows totalling $16A and moved "
  + "no pair. W571 added the disjoint $2A7812+$1E main HIBACHI gun-1 template and "
  + "moved no pair. W572 added the disjoint $2A7A7A+$18 main HIBACHI gun-2 "
  + "template and moved no pair. W573 added the disjoint $2A7E30+$14 main HIBACHI "
  + "gun-3 template and $2A7FEC+$3C pattern windows and moved no pair. W576 added "
  + "the disjoint $2A4C36+$0C object-14 art table and $2A4C6C+$90 object-10 row "
  + "table and moved no pair. W584 added the disjoint $23FE5C+$36 register enqueue "
  + "stub and $2A4D3E+$20 object-16 art table and moved no pair. W588 added the "
  + "disjoint $291040+$5C variant-1 third script and sparse $2904E2/$290506 spawn "
  + "pointers and moved no pair. W589 added seven disjoint list-B scripts from "
  + "$291836 through $291B3A plus forty-five sparse spawn pointers and moved no "
  + "pair. W595 widened the disjoint $000BF0+$14 BIOS window to $000BE0+$24, "
  + "adding sixteen bytes while moving neither the window count nor overlap count. "
  + "W596 added the abutting $29109C+$5A variant-2 third script and the sparse "
  + "$2904AE spawn pointer, adding 94 bytes and no overlap pair. "
  + "See tests/romwindowset.js.";
