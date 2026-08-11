// THE HIGH-SCORE TABLE -- `$287D96`'s insertion search.  W299.
//
// W290 deferred this subsystem when bonus line 2 needed its carry, and W297 and W298 both
// declined to start it for the same stated reason: **the direction of the comparison
// depends on which end of the array holds the highest score, and getting it backwards
// produces a table that is populated, ordered, and silently wrong.**
//
// ============================ THE ORDERING, MEASURED ========================
//
// Settled by reading the SHIPPED SEED, which is a snapshot of the board's own main RAM:
//
//   $803824  01182223      <- index 0, the HIGHEST
//   $803828  00846001
//   $80382C  00816579
//   $803830  00775305
//   $803834  00699653      <- index 4, the LOWEST
//
// Five BCD scores in DESCENDING order -- 1,182,223 down to 699,653. So `$803824` is the
// base, `$803838` is one past the end, and `lea $803838,A1 / move.l -(A1),D1` walks
// **from the LOWEST entry upward**. The parallel word array at `$8038B0..$8038B9` is the
// per-entry score OVERFLOW and is all zero in the seed, which is consistent with every
// score being under 100,000,000.
//
// ============================ AND `dbcc` GOES THE OTHER WAY ==================
//
// `DBcc` is "decrement and branch if the condition is FALSE". So `dbcc` -- carry clear --
// **exits the loop when the carry is CLEAR** and loops when it is SET. Reading it as
// "loop while carry clear" makes the whole search run backwards, and it is the single
// easiest thing to get wrong here:
//
//   287dac  cmp.w D5,D2          D2 = the entry's overflow, D5 = the new one
//   287dae  bhi $287DB8          entry > new  -> EXIT: the entry beats us, stop here
//   287db0  bcs $287DB4          entry < new  -> carry SET -> dbcc LOOPS: keep going up
//   287db2  cmp.l D7,D1          equal overflows: compare the score longs
//   287db4  dbcc D0,$287DA8      D1 < D7 -> carry set -> LOOP.  D1 >= D7 -> EXIT
//
// Which is exactly an insertion search on a descending array walked from the bottom:
// **keep climbing while the entry is beaten, and stop at the first entry that beats the
// new score.** Both readings look plausible from the instructions alone; only one agrees
// with the seed's ordering, and that is why the ordering had to come first.
//
// ============================ THE CARRY IS THE "NO ROOM" SIGNAL =============
//
//   287db8  addq.w #1,D0
//   287dba  move.w D0,D2
//   287dbc  add.w D0,D0 (x3)     D0 = index * 8
//   287dc2  moveq #$4,D1 / sub.w D2,D1
//   287dc6  rts
//
// There is no `ori #$1,SR` anywhere -- **the carry the caller tests is the borrow out of
// `sub.w D2,D1`.** If the walk stopped at the very first (lowest) entry, D0 is still 4,
// the `addq` makes it 5, and `4 - 5` borrows: `$287CF6 bcs $287D90` then bails, because a
// score that cannot beat the lowest of five does not make the table.
//
// And if the new score beats everything, the `dbcc` decrements D0 to -1 and falls out, so
// `addq` gives 0 -- index 0, the top. The two ends fall out of the same arithmetic.

import { i16, u16 } from './ram.js';
import { unreached } from './unported.js';

export const HISCORE = Object.freeze({
  // `lea $803838,A1` and `lea $8038BA,A3` are the ENDS; `-(A1)` is what makes them so.
  scoresEnd: 0x803838,
  overflowEnd: 0x8038ba,
  entries: 5,                      // $287DA6 moveq #$4,D0 with dbcc
  get scoresBase() { return this.scoresEnd - this.entries * 4; },      // $803824
  get overflowBase() { return this.overflowEnd - this.entries * 2; },  // $8038B0
  // $287D10 lea $803874,A1 -- the THIRD parallel array `$287CEE` also shifts.
  thirdEnd: 0x803874,
});

// ===========================================================================
// W300 -- `$287CEE`, THE INSERT: NINE PARALLEL ARRAYS, ALL SHIFTED BY ONE ENTRY
// ===========================================================================
// Every `lea` in this subsystem points at an END, because every walk uses pre-decrement.
// Laid out in address order, the whole record set is `$803824..$8038B9`:
//
//   $803824..$803837   the SCORE longs        5 x 4     -(A2) from $803838
//   $803838..$803873   a 12-BYTE-entry array  5 x 12    -(A1) from $803874, THREE move.l
//   $803874..$8038AF   SIX word arrays        6 x 5 x 2 -(A1,A2,A3,A0,A5,A6) from the six
//                                                       ends $80387E..$8038B0
//   $8038B0..$8038B9   the OVERFLOW words     5 x 2     -(A5) from $8038BA
//
// The 12-byte array is shifted by **three consecutive `move.l (-$10,A1),-(A1)`**, which is
// how a 12-byte entry moves down one place: each one reads 16 bytes back and writes 4 back,
// so the three together move `[X-24, X-12)` to `[X-12, X)`. Reading it as a stride-16 array
// because of the `-$10` is the mistake it invites.
//
// The six word arrays are shifted together, one `move.w (-$4,An),-(An)` each, in the ROM's
// register order A1, A2, A3, A0, A5, A6 -- **A0 is fourth, not first**, so a port that
// tidied them into address order would still be right, and one that assumed A0 came first
// would silently pair the wrong array with the wrong source word.
//
// The six new values come from `(A4)`, `($2,A4)` ... `($A,A4)` -- the per-side buffer
// `$81B420`/`$81B430` that `$287BD2`/`$287C08` fill, so this is where a side's captured
// loop, stage and counters enter the table.
//
// `$287D2C lea (-$C,A1),A1 / $287D30 move.l A1,($C,A4)` hands the caller a POINTER to the
// new 12-byte entry, which `$287C3E` then writes through at `$287C7A movea.l ($C,A4),A4`.
// So the 12-byte entry is the initials/name slot and the insert only makes room for it.
//
// **THE BAIL IS THE SEARCH'S BORROW.** `$287CF6 bcs $287D90` jumps to the `movem` and
// `rts`, so a score with no room changes NOTHING -- not even the pointer at `($C,A4)`.
const HS_LAYOUT = Object.freeze({
  scores: 0x803838,        // end; entries 4 bytes
  bigEnd: 0x803874,        // end of the 12-byte-entry array
  bigStride: 12,
  // $287D36..$287D54, in the ROM's own register order: A1, A2, A3, A0, A5, A6.
  wordEnds: Object.freeze([0x80387e, 0x803888, 0x803892, 0x80389c, 0x8038a6, 0x8038b0]),
  overflow: 0x8038ba,      // end; entries 2 bytes
  slotPtrField: 0x0c,      // ($C,A4)
});

/**
 * `$287CEE` -- insert `(overflow, score)` and shift everything below it down.
 *
 * @param a4 the per-side buffer, `$81B420` or `$81B430`. Its first six words become the
 *   new entry's six parallel words, and `($C,A4)` receives a pointer to the 12-byte slot.
 * @returns {{inserted:boolean, index:number, slot:number}} `slot` is 0 when nothing moved.
 */
export function hiscoreInsert287CEE(ram, a4, overflow, score) {
  const found = hiscoreSearch287D96(ram, overflow, score);
  if (found.noRoom) return { inserted: false, index: found.index, slot: 0 };  // $287CF6 bcs

  const count = found.count;                          // $287CFA move.l D1,D2

  // $287D00 -- the SCORE longs and the OVERFLOW words, one shift each per entry.
  let a2 = HS_LAYOUT.scores;
  let a5 = HS_LAYOUT.overflow;
  for (let n = 0; n < count; n++) {                   // $287CFE subq / $287D08 dbra
    ram.setU32(a2 - 4, ram.u32(a2 - 8));              // $287D00 move.l (-$8,A2),-(A2)
    a2 -= 4;
    ram.setU16(a5 - 2, ram.u16(a5 - 4));              // $287D04 move.w (-$4,A5),-(A5)
    a5 -= 2;
  }
  ram.setU32(a2 - 4, score >>> 0);                    // $287D0C move.l D7,-(A2)
  ram.setU16(a5 - 2, u16(overflow));                  // $287D0E move.w D5,-(A5)

  // $287D10 -- the 12-byte array. THREE move.l per entry, each reading 16 back.
  let a1 = HS_LAYOUT.bigEnd;
  for (let n = 0; n < count; n++) {                   // $287D18 subq / $287D28 dbra
    for (let k = 0; k < 3; k++) {                     // $287D1C..$287D24
      ram.setU32(a1 - 4, ram.u32(a1 - 16));
      a1 -= 4;
    }
  }
  const slot = a1 - HS_LAYOUT.bigStride;              // $287D2C lea (-$C,A1),A1
  ram.setU32(a4 + HS_LAYOUT.slotPtrField, slot);      // $287D30 move.l A1,($C,A4)

  // $287D36 -- the six word arrays, together, in the ROM's register order.
  const ends = HS_LAYOUT.wordEnds.slice();
  for (let n = 0; n < count; n++) {                   // $287D5A subq / $287D76 dbra
    for (let k = 0; k < ends.length; k++) {           // $287D5E..$287D72
      ram.setU16(ends[k] - 2, ram.u16(ends[k] - 4));
      ends[k] -= 2;
    }
  }
  for (let k = 0; k < ends.length; k++) {             // $287D7A..$287D8C
    ram.setU16(ends[k] - 2, ram.u16(a4 + k * 2));
    ends[k] -= 2;
  }

  return { inserted: true, index: found.index, slot };
}

// ===========================================================================
// W300 -- `$287BD2`/`$287C08`/`$287C3E`: TWO HEADS, ONE BODY, AND THE `+4`
// ===========================================================================
// The shape the family check predicts: `$287BD2` and `$287C08` each load eight registers
// from one side's state and then `bra`/fall into `$287C3E`. Nothing in the shared body
// mentions a side. **Every one of the eight was already a named field in `hud.js`,
// `player.js` or `handlers.js`** -- this wave did not have to identify a single new address
// except the override's gate.
//
// The six words the body writes to `(A4)`..`($A,A4)` are exactly the six the insert then
// distributes into its six parallel arrays, which is what a high-score line displays:
//
//   (A4)     $813098   the LOOP        HUDRAM.loop
//   ($2,A4)  $813092   the STAGE       HUDRAM.stage, zero-based
//   ($4,A4)  $813084   the SHIP        HUDRAM.shipSelectBodyP1  (+4 for P2 -- see below)
//   ($6,A4)  $813088   the STYLE       player.js's `srcB`, the other half of the select pair
//   ($8,A4)  $81B632   the CHAIN       HUDRAM.chainHiWaterP1, BCD high-water
//   ($A,A4)  $81B49A   the DIGITS      HUDRAM.digitStateP1
//
// ## THE `addq.w #4,D0` IS A TABLE REBASE, NOT A BIAS
//
// `$287C24 addq.w #4,D0` is the ONLY arithmetic in either head, and it is not arbitrary.
// `hud.js` already recorded that the lives icon comes from `$2881E2[$813084*2]` for P1 and
// `$2881EA[$813086*2]` for P2 -- and `$2881EA - $2881E2` is 8 bytes, which in a word-indexed
// table is **four entries**. So the `+4` converts P2's per-side selection into an index into
// the SAME table P1 uses, and the six words above are therefore side-independent: the entry
// records which ship was flown without recording which side flew it.
//
// ## `$81309A`: THE ALL-CLEAR OVERRIDE
//
// `$287C4C tst.w $81309A / beq` forces `(loop, stage)` to `(1, 5)`. Stage is zero-based and
// there are five stages, so **5 is one PAST the last stage index** -- it cannot arise from
// play, which makes it a deliberate "ALL" marker rather than a stage number.
//
// `$81309A` has exactly TWO references in the whole build (scanned the image for the long,
// not guessed): this read, and `$291F5C move.w #$1,$81309A`. The writer sits on the
// loop-nonzero arm of an untranslated `$291Fxx` state machine --
//
//     291f4a  tst.w $813098          the loop word
//     291f50  bne $291F5C
//     291f54  move.b #$2,($2,A5)     loop 0: advance the sequence
//     291f5a  rts
//     291f5c  move.w #$1,$81309A     loop reached: raise the flag
//
// -- so the flag means "this credit got into the loop", and any entry made afterwards is
// recorded as the single marker `(1, 5)` rather than as wherever the player actually died.
// That is why it OVERWRITES a loop word that is already non-zero: a loop-2 death would
// otherwise be filed under a low stage index and read as worse than a loop-1 clear.
//
// ## THE CARRY IS THE ANSWER, AND IT IS SET EXPLICITLY HERE
//
// Unlike `$287D96`, this routine really does end in `ori`/`andi` on the SR:
// `$287CDA andi #$FFFE,SR` clears the carry (made the table) and `$287CE8 ori #$1,SR` sets
// it (did not). Bonus line 2 reads it at `$260078`/`$26008E` with `bcs`, so **carry CLEAR
// is what sets bit 0/1 of `$8130CC`.** Getting that sense backwards flags the losing side.
const HS_POST = Object.freeze({
  loop: 0x813098,          // $287C3E
  stage: 0x813092,         // $287C44
  allClear: 0x81309a,      // $287C4C -- one writer in the build, $291F5C
});

/**
 * `$287BD2` and `$287C08`, as a table: the two heads differ only in these constants, so
 * they are data over one body rather than two transcriptions.
 *
 * `tag` is `move.l #$FF,D6` / `#$FE,D6`, and it is BOTH the long stamped into the new
 * 12-byte entry and the value `$287C80 cmpi.l #$FF,D6` re-tests to pick the personal-best
 * pair. So the side is carried in the entry itself, not in a register the body remembers.
 */
export const HISCORE_SIDES = Object.freeze([
  Object.freeze({
    site: 0x287bd2, buf: 0x81b420, tag: 0xff, shipBias: 0,
    total: 0x81b440, ovf: 0x81b44c,            // HUDRAM.totalP1 / ovfP1
    ship: 0x813084, style: 0x813088,           // HUDRAM.shipSelectBodyP1 / player.js srcB
    chain: 0x81b632, digits: 0x81b49a,         // HUDRAM.chainHiWaterP1 / digitStateP1
    bestTotal: 0x81b4a0, bestOvf: 0x81b4a8,    // HUDRAM.total2P1 / ovf2P1
    flagBit: 0x01,                             // $26007C ori.b #$1,$8130CC
  }),
  Object.freeze({
    site: 0x287c08, buf: 0x81b430, tag: 0xfe, shipBias: 4,   // $287C24 addq.w #4,D0
    total: 0x81b444, ovf: 0x81b44e,
    ship: 0x813086, style: 0x81308a,
    chain: 0x81b634, digits: 0x81b49e,
    bestTotal: 0x81b4a4, bestOvf: 0x81b4aa,
    flagBit: 0x02,                             // $260092 ori.b #$2,$8130CC
  }),
]);

/**
 * `$287C3E` -- fill the side's buffer, try to insert, and update the side's running best.
 *
 * @param spec one of `HISCORE_SIDES`
 * @returns {{made:boolean, index:number, slot:number}} `made` is the CLEARED carry, i.e.
 *   the score got into the table. Bonus line 2 turns it into a bit of `$8130CC`.
 */
export function hiscoreBody287C3E(ram, spec) {
  const a4 = spec.buf;
  const d7 = ram.u32(spec.total);                     // $287BDC / $287C12
  const d5 = ram.u16(spec.ovf);                       // $287BE2 / $287C18
  const d0 = u16(ram.u16(spec.ship) + spec.shipBias); // $287BE8 / $287C1E + $287C24 addq
  const d1 = ram.u16(spec.style);                     // $287BEE / $287C26
  const d2 = ram.u16(spec.chain);                     // $287BF4 / $287C2C
  const d3 = ram.u16(spec.digits);                    // $287BFA / $287C32
  const d6 = spec.tag;                                // $287C00 / $287C38 move.l

  ram.setU16(a4 + 0x00, ram.u16(HS_POST.loop));       // $287C3E
  ram.setU16(a4 + 0x02, ram.u16(HS_POST.stage));      // $287C44
  if (ram.u16(HS_POST.allClear) !== 0) {              // $287C4C tst.w / $287C52 beq
    ram.setU16(a4 + 0x00, 1);                         // $287C56 move.w #$1,(A4)
    ram.setU16(a4 + 0x02, 5);                         // $287C5A move.w #$5,($2,A4)
  }
  ram.setU16(a4 + 0x04, d0);                          // $287C60
  ram.setU16(a4 + 0x06, d1);                          // $287C64
  ram.setU16(a4 + 0x08, d2);                          // $287C68
  ram.setU16(a4 + 0x0a, d3);                          // $287C6C

  const ins = hiscoreInsert287CEE(ram, a4, d5, d7);   // $287C70 jsr ($287CEE,PC)
  // $287C76 bcs $287CE4 -> movem / ori #$1,SR / rts. The six words above are still written,
  // which is harmless: the buffer is scratch and nothing reads it unless the insert ran.
  if (!ins.inserted) return { made: false, index: ins.index, slot: 0 };

  const slot = ram.u32(a4 + HS_LAYOUT.slotPtrField);  // $287C7A movea.l ($C,A4),A4
  ram.setU32(slot, d6);                               // $287C7E move.l D6,(A4)
  // Only the FIRST of the entry's three longs is written. The other eight bytes still hold
  // whatever the shift dragged down, so the tag is a "not named yet" sentinel and the name
  // arrives later through this same pointer.

  // $287C80 cmpi.l #$FF,D6 / bne $287CB2 -- the tag picks the pair, and both arms are the
  // same two-step max. `bcs` is a BORROW, so equal continues and rewrites the same value.
  //
  // **AND THE TWO STEPS ARE INDEPENDENT, WHICH IS A REAL QUIRK.** The overflow is stored
  // BEFORE the long is compared, so a score with a higher overflow but a lower long leaves
  // the best as `(new overflow, old long)` -- a pair that never occurred. Reachable in real
  // play, since the overflow counts 100,000,000s and DOJ scores get there. A port that
  // tidied this into one lexicographic max would diverge, so it is transcribed as written.
  const ovf = ram.u16(spec.ovf);                      // $287C88 / $287CB2
  if (ovf >= ram.u16(spec.bestOvf)) {                 // $287C8E cmp.w / $287C94 bcs
    ram.setU16(spec.bestOvf, ovf);                    // $287C96
    const total = ram.u32(spec.total);                // $287C9C
    if (total >= ram.u32(spec.bestTotal)) {           // $287CA2 cmp.l / $287CA8 bcs
      ram.setU32(spec.bestTotal, total);              // $287CAA
    }
  }
  return { made: true, index: ins.index, slot };      // $287CDA andi #$FFFE,SR -- carry CLEAR
}

// ===========================================================================
// W301 -- `$28841E`, THE FACTORY TABLE, AND WHAT ITS DEFAULTS PROVE
// ===========================================================================
// Nine `lea` pairs and nine `dbra` copies, straight out of one contiguous ROM run into the
// nine arrays. Two things make it worth more than its size.
//
// ## IT CONFIRMS THE COLUMN ASSIGNMENT WITH DATA, NOT WITH READING
//
// W300 derived which of the six word arrays gets which of `$287D7A`'s six source words from
// the ROM's register order -- A1, A2, A3, A0, A5, A6, with **A0 fourth**. The factory
// defaults are an independent check on that, because a wrong assignment puts recognisable
// data in the wrong column:
//
//   $803874  0 0 0 0 0            the LOOP      -- a factory table has cleared no loop
//   $80387E  3 2 2 1 1            the STAGE     -- DESCENDING with the scores, as it must
//   $803888  0 6 2 2 2            the SHIP      -- 6 is in P2's 4..7 range, see the `+4`
//   $803892  6 4 6 4 4            the STYLE
//   $80389C  $0719 x4, $0720      the CHAIN     -- BCD 719 and 720, unmistakable
//   $8038A6  4 4 2 0 6            the DIGITS    -- and a digit state is capped at 9
//
// Had the six been paired in address order (A0 first), the LOOP would land in the column
// holding BCD `$0719` and the chain in the all-zero one. It does not. The stage column
// descending in step with the scores is the second independent check on the same thing.
//
// ## THE 12-BYTE ENTRY IS THREE INITIALS, ONE LONG PER CHARACTER
//
// W300 could only say the slot was "the initials/name slot" from how `$287C3E` stamps a tag
// into it. The defaults settle it -- five entries of three longs, every value small and a
// multiple of four:
//
//   $00000038 $00000048 $0000000C      $00000028 $00000058 $00000048
//   $00000020 $00000048 $00000038      $00000020 $00000030 $00000028
//   $00000028 $00000030 $0000004C
//
// **Three characters per name, one longword each, each a character index times four.** So
// `$287C7E move.l D6,(A4)` writes `$FF`/`$FE` into the FIRST character, which makes the tag
// an out-of-range character code meaning "not entered yet" that also says which side owes
// the entry. That is why the insert leaves the other eight bytes alone.
//
// ## AND IT EXPLAINS WHERE W299'S MEASUREMENT CAME FROM
//
// The five default score longs are `$01182223 $00846001 $00816579 $00775305 $00699653` --
// **byte for byte the five W299 read out of `rip/web/seed.bin`.** So the shipped seed holds
// the FACTORY table, not a played one, and W299's ordering measurement was reading the
// cartridge's own defaults. The conclusion stands and is now sourced twice.
//
// It is also why the port needs no catch-up call here, unlike W92's object stream and W93's
// text banks. `$28841E` runs once in the cold-boot path -- `$23BF74 jsr $28841E`, in the
// reset routine `palette.js` maps as `$23BF20..$23C010`, four calls before the five palette
// installs and the `bra` into the main loop -- and the seed carries its result exactly.
// Replaying it would be redundant rather than restorative, and the test says so by
// asserting the seed already equals what this installs.
export const HISCORE_DEFAULTS = Object.freeze({
  site: 0x28841e,
  hiScore: 0x81b448,               // $288432 move.l $803824,$81B448 -- HUDRAM.hiScore
  // The nine copies in the ROM's own order. `size` is the element width and `longs` is how
  // many of them per entry, which is 3 only for the 12-byte array. `moveq #$4,D0` with
  // `dbra` is FIVE passes, not four.
  blocks: Object.freeze([
    Object.freeze({ src: 0x287df8, dst: 0x803824, size: 4, longs: 1 }),  // $28841E scores
    Object.freeze({ src: 0x287e0c, dst: 0x8038b0, size: 2, longs: 1 }),  // $28843C overflow
    Object.freeze({ src: 0x287e16, dst: 0x803838, size: 4, longs: 3 }),  // $288450 initials
    Object.freeze({ src: 0x287e52, dst: 0x80389c, size: 2, longs: 1 }),  // $288468 chain
    Object.freeze({ src: 0x287e5c, dst: 0x803888, size: 2, longs: 1 }),  // $28847C ship
    Object.freeze({ src: 0x287e66, dst: 0x803892, size: 2, longs: 1 }),  // $288490 style
    Object.freeze({ src: 0x287e70, dst: 0x8038a6, size: 2, longs: 1 }),  // $2884A4 digits
    Object.freeze({ src: 0x287e7a, dst: 0x803874, size: 2, longs: 1 }),  // $2884B8 loop
    Object.freeze({ src: 0x287e84, dst: 0x80387e, size: 2, longs: 1 }),  // $2884CC stage
  ]),
});

/**
 * `$28841E` -- install the factory high-score table and publish its top entry as the HI.
 *
 * The `move.l $803824,$81B448` between the first and second copy is not incidental: it is
 * what makes the HUD's HI score the table's index 0, so the two can never disagree at boot.
 */
export function hiscoreDefaults28841E(ram, rom) {
  for (const b of HISCORE_DEFAULTS.blocks) {
    for (let i = 0; i < HISCORE.entries; i++) {          // moveq #$4,D0 / dbra -- FIVE
      for (let k = 0; k < b.longs; k++) {                // three move.l for the 12-byte one
        const off = (i * b.longs + k) * b.size;
        if (b.size === 4) ram.setU32(b.dst + off, rom.u32(b.src + off));
        else ram.setU16(b.dst + off, rom.u16(b.src + off));
      }
    }
    // $288432 -- between the scores and the overflows, exactly where the ROM has it.
    if (b.dst === HISCORE.scoresBase) {
      ram.setU32(HISCORE_DEFAULTS.hiScore, ram.u32(HISCORE.scoresBase));
    }
  }
}

// ===========================================================================
// W304 -- THE TAG IS A SEARCH KEY, AND THAT IS WHY THE SLOT POINTER HAS NO READERS
// ===========================================================================
// W300 called `$FF`/`$FE` a "not entered yet" sentinel. W302 found it could never reach the
// display's character table. W303's worklog named finding its reader as the next job. It has
// two, and they settle what the tag is FOR:
//
//   $28F6E2 / $28F6EA -> $28F6F4    find the tagged row and gather every field of it
//   $28F7C8           -> $28F7D2    write three initials INTO the tagged row
//
// Both search the 12-byte array for an entry whose FIRST LONG equals the tag. So the tag is a
// **search key**: the insert stamps it so that later code can find the row again without
// carrying a pointer. Which is exactly why `$81B42C`/`$81B43C` -- the absolute forms of the
// `($C,A4)` slot pointer -- have ZERO references in the build. That pointer is internal to
// `$287C3E`, which reads it back at `$287C7A` only to stamp the tag through it. W302 spent a
// search on the assumption that a pointer written is a pointer read; it was not.
//
// ## AND THE TAG VALUES ARE NOT ARBITRARY
//
//     28f7c8  moveq #$0,D0
//     28f7ca  move.w ($2C,A4),D0      the SIDE, 0 or 1
//     28f7ce  not.b D0                -> $FF or $FE
//
// `$FF` is `~0` and `$FE` is `~1`. So `$287BD2`'s `move.l #$FF,D6` and `$287C08`'s `#$FE` are
// not two magic numbers, they are **side 0 and side 1 complemented**, and this is the routine
// that reconstructs them from a record field. Three waves treated the pair as opaque
// constants; the complement is checkable and it is checked below.
//
// The complement also explains W302's finding from the other end: the display indexes its
// character font with the stored value UNSCALED, so a valid character is a small multiple of
// four. `~0` and `~1` are the two largest bytes there are, so no side index can produce a
// value that looks like a character. The tag being out of band is a property of `not.b`, not
// a coincidence.
const TAG = Object.freeze({
  lookup: Object.freeze([0x28f6e2, 0x28f6ea]),   // move.l #$FF,D0 / #$FE,D0
  body: 0x28f6f4,
  writer: 0x28f7c8,
  writerBody: 0x28f7d2,
  sideField: 0x2c,                               // $28F7CA move.w ($2C,A4),D0
  chars: 3,                                      // $28F7DE moveq #$2,D7 -- THREE longs
});

/** `not.b` on the side index: side 0 -> `$FF`, side 1 -> `$FE`. */
export function tagForSide(side) {
  return (~side) & 0xff;                                   // $28F7CE not.b D0
}

/**
 * `$28F6F4` -- find the row carrying `tag` and hand back everything about it.
 *
 * The heads `$28F6E2`/`$28F6EA` supply the tag and `$28F6F0` supplies `D1 = 0` and
 * `D4 = 4`, so the scan is five entries from the base. On a miss the ROM returns
 * `D0.w = $FFFF` (`moveq #$0,D0 / subq.w #1,D0`) and nothing else is set.
 *
 * On a hit it returns SIX addresses and two packed longs, which between them cover eight of
 * the nine arrays -- everything except the 12-byte entry it just matched. The two `swap`
 * pairs are the interesting part: `D2` is `overflow << 16 | digits` and `D3` is
 * `style << 16 | ship`, each built by loading the HIGH half first and swapping.
 */
export function tagLookup28F6F4(ram, tag) {
  let a0 = HS_LAYOUT.bigEnd - HISCORE.entries * HS_LAYOUT.bigStride;   // $28F6F4 lea $803838
  let index = 0;                                           // $28F6F0 moveq #$0,D1
  let hit = false;
  for (let n = 0; n < HISCORE.entries; n++) {               // $28F6F2 moveq #$4,D4 / dbra
    if (ram.u32(a0) === (tag >>> 0)) { hit = true; break; } // $28F6FA cmp.l (A0),D0 / beq
    index++;                                               // $28F6FE addq.w #1,D1
    a0 += HS_LAYOUT.bigStride;                             // $28F700 adda.w #$C,A0
  }
  if (!hit) return { found: false };                       // $28F708 moveq #0 / subq.w #1

  const w = index * 2;                                     // $28F710 add.w D0,D0
  const l = index * 4;                                     // $28F74E add.w D0,D0 again
  const digits = 0x8038a6 + w;                             // $28F712 / $28F72A adda.w
  const overflow = 0x8038b0 + w;                           // $28F718 / $28F72C
  const ship = 0x803888 + w;                               // $28F71E / $28F72E
  const style = 0x803892 + w;                              // $28F724 / $28F730
  return {
    found: true,
    index,
    entry: a0,                                             // the 12-byte row that matched
    digits, overflow, ship, style,
    loop: 0x803874 + w,                                    // $28F73E / $28F74A -- A2 REUSED
    chain: 0x80389c + w,                                   // $28F744 / $28F74C -- A3 REUSED
    score: HISCORE.scoresBase + l,                         // $28F750 / $28F756 adda.w
    // $28F732..$28F736: high half first, then swap, so the OVERFLOW is the high word.
    d2: (((ram.u16(overflow) << 16) | ram.u16(digits)) >>> 0),
    // $28F738..$28F73C: the same shape, style over ship.
    d3: (((ram.u16(style) << 16) | ram.u16(ship)) >>> 0),
  };
}

/** `$28F6E2` and `$28F6EA` -- the two heads, which are the two tags. */
export function tagLookupForSide(ram, side) {
  return tagLookup28F6F4(ram, tagForSide(side));
}

/**
 * `$28F7C8` -- write three initials into the row the side's tag marks.
 *
 * @param a4 the record whose `($2C)` holds the side; `not.b` turns it into the tag
 * @param a0 a THREE-LONG source, the entered name
 * @returns {boolean} whether a tagged row was found. The ROM has no return value here: it
 *   falls out of the `dbra` either way, so a miss is a silent no-op on the board too.
 *
 * **This is what finally writes the 12-byte entry**, and it does so without the slot pointer.
 * `move.w #$2,D7` with `dbra` is THREE longs -- the same n+1 the port has been bitten by
 * twice -- and `$28F7EA adda.w #$C,A1` is the miss step, so the walk is by ENTRY and not by
 * long.
 */
export function tagWrite28F7C8(ram, a4, a0) {
  const side = ram.u16(a4 + TAG.sideField);                // $28F7CA move.w ($2C,A4),D0
  const tag = tagForSide(side);                            // $28F7CE not.b D0
  if (side > 1) {
    unreached(0x28f7ce, `$28F7C8 read side ${side} from ($2C,A4). not.b makes the tag `
      + `$${tag.toString(16)}, and only $FF and $FE are stamped by $287C3E, so no row can `
      + `ever match`);
  }
  let a1 = HS_LAYOUT.bigEnd - HISCORE.entries * HS_LAYOUT.bigStride;   // $28F7D2 lea $803838
  for (let n = 0; n < HISCORE.entries; n++) {               // $28F7D0 moveq #$4,D5 / dbra
    if (ram.u32(a1) === tag) {                             // $28F7D8 cmp.l (A1),D0 / bne
      for (let k = 0; k < TAG.chars; k++) {                // $28F7DE moveq #$2,D7 -- THREE
        ram.setU32(a1 + k * 4, ram.u32(a0 + k * 4));       // $28F7E2 move.l (A2)+,(A1)+
      }
      return true;
    }
    a1 += HS_LAYOUT.bigStride;                             // $28F7EA adda.w #$C,A1
  }
  return false;
}

/** `$287BD2` -- the P1 head. */
export function hiscoreCheck287BD2(ram) { return hiscoreBody287C3E(ram, HISCORE_SIDES[0]); }

/** `$287C08` -- the P2 head. */
export function hiscoreCheck287C08(ram) { return hiscoreBody287C3E(ram, HISCORE_SIDES[1]); }

/**
 * `$287D96` -- where does `(overflow, score)` belong in the table?
 *
 * @param overflow D5, the new score's overflow word
 * @param score    D7, the new score's longword (BCD)
 * @returns {{index:number, offset:number, count:number, noRoom:boolean}}
 *   `index` is D2 (0 = the top, 5 = past the end), `offset` is D0 (`index * 8`), `count`
 *   is D1 (`4 - index`, the number of entries that must shift down), and `noRoom` is the
 *   BORROW out of `sub.w D2,D1` -- the carry `$287CF6 bcs` reads.
 */
export function hiscoreSearch287D96(ram, overflow, score) {
  const d5 = u16(overflow);
  const d7 = score >>> 0;
  let d0 = HISCORE.entries - 1;                       // $287DA6 moveq #$4,D0
  let a1 = HISCORE.scoresEnd;
  let a3 = HISCORE.overflowEnd;

  for (;;) {
    a1 -= 4;                                          // $287DA8 move.l -(A1),D1
    a3 -= 2;                                          // $287DAA move.w -(A3),D2
    const d1 = ram.u32(a1);
    const d2 = ram.u16(a3);

    if (d2 > d5) break;                               // $287DAE bhi -- the entry beats us
    // $287DB0 bcs: d2 < d5 leaves carry SET, so the dbcc loops.
    const carry = d2 < d5 ? true : (d1 < d7);         // $287DB2 cmp.l D7,D1
    // $287DB4 dbcc -- exits when the carry is CLEAR, loops when it is SET.
    if (!carry) break;
    d0 = i16(u16(d0 - 1));
    if (d0 === -1) break;                             // dbra ran out
  }

  const index = u16(d0 + 1);                          // $287DB8 addq.w #1,D0
  const count = i16(u16((HISCORE.entries - 1) - index));  // $287DC2 moveq #$4 / sub.w
  return {
    index,
    offset: u16(index * 8),                           // $287DBC three add.w D0,D0
    count,
    // the BORROW out of `sub.w D2,D1`, which is the only carry this routine produces
    noRoom: count < 0,
  };
}
