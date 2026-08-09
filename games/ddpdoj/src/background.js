// THE SCROLL PROGRAM -- object type 1, its seven-opcode VM, and the camera.
//
// `$240F62[1] = $26127A` (measured, `xref.py ptrtable 240F62 8 4`).  One object
// slot carries the whole background: a 3-frame warm-up state machine, an init
// that fills fifteen map columns and installs two scripts, a per-frame handler
// that runs the interpreter, accumulates two cameras and writes at most one map
// column, and a repeat/unfreeze partner that runs once per column.
//
// WHAT IS ALREADY MEASURED, and what this file is judged against.
// `docs/worklog/ddpdoj/20-recon-scroll-engine.md` decoded the subsystem and
// `17-impl-invuln-stage-run.md` measured the whole of stage 1: the recon's
// Python model matches the board at **0 divergent frames on $8130CE, $81318A,
// $81318C and $80B012 over 10,431 logic frames** -- the stage, its 57 records,
// its 13 background elements, both cues and the boss lock.  This file is a
// SECOND, INDEPENDENT translation of the same listing into the port's own RAM,
// and `tools/scrollportgate.mjs` runs IT against the same board TSV.  A model
// and a port that agree with the board separately is worth more than a port
// that imports the model, so nothing here imports `scrollmap.py`'s arithmetic.
//
// THE FIVE THINGS A READER WILL GET WRONG (all from the recon, all load-bearing,
// all with a red switch in the gate that proves the port has them right):
//
//   1. `$8130CE` IS AN ODOMETER, NOT A FRAME COUNTER.  `$26132C` bumps it once
//      per `$200` of accumulated scroll, and only when ($8,A5) says unfrozen.
//   2. THE RECORD'S SECOND WORD IS PADDING.  `$262082` is `addq.w #2,A1` --
//      unconditional.  Wave 10 called it `cond`; it is never read.
//   3. `$04`'s COUNTDOWN IS ARMED AT len+1 AND RELOADED AT len ($262130 does
//      `addq.w #1,D0` before ($14,A6)), so the loop word is the number of
//      len-column PASSES.  Read as len/len the unfreeze lands 4 frames early;
//      read as "extra passes" it lands 112 frames late.
//   4. THE CLOCK IS WRITTEN BACKWARDS on repeat completion (`$261FC4`
//      `move.w ($16,A0),$8130CE`) and the interpreter matches on EXACT
//      equality (`$26207C cmp.w D1,D7 / bne`), never `>=`.
//   5. THE CAMERA KEEPS A 1/64-px FRACTION.  `$240B94` adds the whole
//      accumulator to `$80B02A`, commits only `(acc & ~$3F)` to `$80B012` and
//      keeps `(acc & $3F)`.  Committing the fraction is invisible for 7,000
//      frames and then wrong by a pixel forever.
//
// AND THE ONE THIS WAVE MEASURED FOR ITSELF -- see §3 of the worklog:
// **`$240CC0` IS BUILD B's REGISTER UPLOAD AND IT DOES NOT RUN.**  The routine
// that executes on a VERSION-B run is build A's `$140FFE`, one of the four
// gated ISR6 routines `src/isr.js` has been counting since wave 2, and the two
// differ: `$240CC0` subtracts the screen-shake offsets `$80B054`/`$80B056` and
// `$140FFE` does not.  Proven from the wave-17 corpus, 10,738 frame pairs:
// the no-shake form matches `$B03000` on 10,738 of 10,738 and the shake form on
// 10,696 -- it fails on exactly the 42 frames the boss shakes the screen.
// `NOTES-build-split.md` says do not "fix" a build-A ISR address into a
// build-B one; this is that rule with a number attached.

import { unreached } from './unported.js';
import { install24150A, install2415E8 } from './palette.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';

// ---------------------------------------------------------------- addresses
/** The background OBJECT RECORD, A5-relative.  Every offset is cited at the
 *  instruction that reads or writes it. */
export const BGO = {
  init2: 0x02,      // bclr #0,($2,A5)                       $2611CA
  state: 0x03,      // the 4-bit warm-up state machine       $26127A
  entryClock: 0x06, // ($6,A5) -> $8130CE                    $26114C
  // ($8,A5) 1 = THE CLOCK is frozen -- NOT the scroll.  W19 censused every
  // site: written by $26214C (op $0C, set), $261FC0 (op $04's repeat
  // completing, clear), $26204A ($26200E's fast-forward, clear) and
  // $2612E8..$2612F8 (the external $81317E arm), and READ AT EXACTLY ONE
  // ADDRESS -- $261324, which guards the single instruction $26132C
  // `addq.w #1,$8130CE`.  The camera accumulate ($261308), the column writer
  // ($26133C..$261376) and the TX camera ($26138A) are all OUTSIDE it, so a
  // frozen background KEEPS SCROLLING at whatever speed the last $08 record
  // set.  `freeze-stops-the-scroll` is the red switch for the opposite
  // reading; see 19-impl-score-chain-rank-ledger.md §2.
  frozen: 0x08,     // ($8,A5)                               $26214C
  colPtr: 0x0a,     // long, the cursor into the column stream
  cursor: 0x0e,     // word, the mod-64 ring column          $261372
  scr1Ptr: 0x10,    // long, script 1's column pointer (never advanced -- $261F84
                    // has NO caller in build B, recon §1)
  speedBg: 0x1c,    // ($1c,A5) 1/64 px per frame            $26213A
  accTick: 0x1e,    // ($1e,A5) the $200 odometer accumulator
  accCol: 0x20,     // ($20,A5) the $800 column accumulator
  speedTx: 0x22,    // ($22,A5)
  crossPos: 0x28,   // ($28,A5) the cross-axis camera position
  crossAcc: 0x2a,   // ($2a,A5) its 1/64-px accumulator
  edgeBits: 0x30,   // byte; bits 6/7 = "a player is pinned at that X wall"
};

/** Main-RAM globals the subsystem owns.  Named, never inlined. */
export const BGRAM = {
  clock: 0x8130ce,        // THE DISTANCE CLOCK -- an odometer      $26132C
  bgFreeze: 0x8130d2,     // 1 = the whole handler is skipped       $2612A0
  elemGate: 0x8130da,     // read by every element updater (W18)    $2623C2
  stageX4: 0x813096,      // stage index * 4                        $240D80
  crossRaw: 0x81316a,     // $2613BA / $261464
  crossMode: 0x81316c,    // 0 = follow the single live player      $26146C
  crossDelta: 0x81316e,   // D1 into $240B94 and $240C22            $26130E
  scrollPrev: 0x813170,   // $2614FE
  scrollCur: 0x813172,    // $261508
  crossWhole: 0x813174,   // $261514
  scrollDelta: 0x813176,  // THE per-frame delta objects subtract   $26151E
  scrollAccum: 0x813178,  // $261524
  wallFlag: 0x81317a,     // $2613DE, cleared by $2613B4
  extFreeze: 0x81317e,    // external freeze; NEVER WRITTEN in 16,000 lf (W17)
  extSpeed: 0x813180,     // external speed push                    $2612AA
  extSpeedBg: 0x813182,
  extSpeedTx: 0x813184,
  shakeMode: 0x813186,
  shakeCursor: 0x813188,
  ringCursor: 0x81318a,   // a MIRROR of ($e,A5)                    $26137A
  colAccum: 0x81318c,     // a MIRROR of ($20,A5)                   $261382
  fastFwd: 0x813190,      // 1 while $26200E replays the interpreter
  scr0: 0x813192,         // script 0's $18-byte state block        $262068
  scr1: 0x8131aa,         // script 1's
  cueCount: 0x8131c2,     // the deferred callback's countdown      $2621B6
  cueCall: 0x8131c4,      // ...and its address                     $26209E
  elemSlots: 0x8131c8,    // 8 x $20                                $262316
  elemTable: 0x8132c8,    // the per-stage handler table pointer    $262332
  powerLadder: 0x81b414,  // op $18's four rungs                    $2621D6
};

/** The two-camera block `$80B010..$80B056`.  `$240B0E` resets it. */
export const CAM = {
  bgId: 0x80b010,   // $240CB0 move.w D0,$80B010
  bgLong: 0x80b012, // long, the ALONG-axis position (game vertical, TATE)
  bgCross: 0x80b016,// long
  bgNegL: 0x80b01a, // word, the negated whole-pixel deltas $240BEE/$240C0E
  bgNegC: 0x80b01c,
  bgFracA: 0x80b026,// word accumulators for the two negated deltas
  bgFracB: 0x80b028,
  bgAccL: 0x80b02a, // long, the 1/64-px accumulator for $80B012
  bgAccC: 0x80b02e, // ...and for $80B016
  txId: 0x80b032,   // $240CB8
  txLong: 0x80b034,
  txCross: 0x80b038,
  txNegL: 0x80b03c, // <- read by $24179E to scroll-compensate EVERY bg element
  txNegC: 0x80b03e,
  txFracA: 0x80b048,
  txFracB: 0x80b04a,
  txAccL: 0x80b04c,
  txAccC: 0x80b050,
  shakeX: 0x80b054, // the screen shake ($260EC8).  NOT subtracted by $140FFE.
  shakeY: 0x80b056,
  deferHead: 0x80b058,  // $240F08's deferred (address, value) write list
  deferCursor: 0x80c8d8,
};

/** The five per-stage tables, all indexed by `$813096`. */
export const BGTAB = {
  scriptPair: 0x26153e,  // $26152C lea ($26153E,PC),A0
  palette: 0x261252,     // $2611B2
  colStream: 0x261266,   // $2611D6
  tileBase: 0x240d62,    // $240D80 -- ADDED to every map longword
  elemTable: 0x262302,   // $262328
  opTable: 0x2620c2,     // $262086 -- the seven opcodes
};

/** The interpreter's `$18`-byte state block, A6-relative (`$261FF2`). */
const SB = {
  cur: 0x00,     // long, the record cursor            $262092 move.l A1,(A6)
  obj: 0x04,     // long, the object-stream cursor     $2620FC
  cue: 0x08,     // long, the cue-stream cursor        $2621A4
  rewind: 0x0c,  // long, the rewind target; 0 = no repeat armed
  loops: 0x10,   // word, PASSES remaining; $FFFF = forever
  len: 0x12,     // word
  count: 0x14,   // word, armed at len+1, reloaded at len
  resume: 0x16,  // word, the clock value the unfreeze restores
};

const OPS = {
  0x00: 'SPAWN', 0x04: 'REPEAT', 0x08: 'SPEED', 0x0c: 'FREEZE',
  0x10: 'BGELEM', 0x14: 'CUE', 0x18: 'FLAG',
};
/** `$2620C2 + op` -- the handler each opcode's byte offset selects. */
const OP_HANDLER = {
  0x00: 0x2620de, 0x04: 0x262102, 0x08: 0x26213a, 0x0c: 0x26214c,
  0x10: 0x262160, 0x14: 0x262180, 0x18: 0x2621d6,
};

const u16 = (v) => v & 0xffff;
const i16 = (v) => (v << 16) >> 16;
const u32 = (v) => v >>> 0;

// ---------------------------------------------------------------- the map RAM
/**
 * `$900000`, the BG tilemap ring.  64 columns x 16 rows of longwords = $1000
 * bytes, which is why MAME's 4,096-byte `bg_videoram` share never truncates a
 * write ($240D76 indexes `(row*64 + col)*4` with row 0..8 and col 0..63, so the
 * highest byte it can reach is `(8*64+63)*4 = $8FC`).
 *
 * Stored as BIG-ENDIAN u16s at word index `(row*64+col)*2` (tile) and `+1`
 * (attr) -- byte for byte the layout `render/tiles.js` `buildBgMap` reads and
 * the layout `capture.js` hands it, so the page can hand the renderer the
 * PORT's ring in place of the recording's with no translation layer.
 */
export class BgVram {
  constructor(words) {
    this.w = words ? Uint16Array.from(words) : new Uint16Array(64 * 16 * 2);
    if (this.w.length !== 64 * 16 * 2) {
      throw new Error(`bg videoram is ${this.w.length} words, expected 2048`);
    }
    /** every column index this port has written, in order -- diagnostics only */
    this.columnsWritten = 0;
    // WAVE 14 -- DIAGNOSTIC, and the page's asset scheduler reads it.  The
    // ROM address `$26134E` loaded into A0 for the column being painted right
    // now, i.e. the cursor into the stage's column stream.  The published page
    // turns it into a stage-1 map column index and uses it to decide which
    // background shard to fetch next; nothing in the port's own arithmetic
    // reads it, exactly like `columnsWritten`.
    this.streamPtr = 0;
  }
  /** `$240D9A move.l D4,(A0)` with A0 = $900000 + ((row<<6)+col)*4. */
  setLong(row, col, v) {
    const i = (((row << 6) + col) & 0x3ff) * 2;
    this.w[i] = (v >>> 16) & 0xffff;
    this.w[i + 1] = v & 0xffff;
  }
  long(row, col) {
    const i = (((row << 6) + col) & 0x3ff) * 2;
    return u32((this.w[i] << 16) | this.w[i + 1]);
  }
}

/**
 * `$904000`, the TX (text) tilemap.  64 columns x 32 rows of longwords =
 * `$2000` bytes, which is the shape `render/tiles.js` `buildTxMap` reads and
 * the shape `capture.js` hands it, so the page can hand the renderer the PORT's
 * own TX map in place of the recording's with no translation layer.
 *
 * Stored BIG-ENDIAN, word for word the same convention as `BgVram`: the HIGH
 * word of each tile longword is the tile number (`txram[ti*2]`) and the LOW
 * word is the attribute (`txram[ti*2+1]`), exactly as `buildTxMap` reads and
 * as the board's `move.l (a0)+,(a1)` writes them.
 *
 * WAVE 115 -- the score digits ship here.  `$185DC4` (the IRQ6-gated score
 * flush, ported in `src/hud.js` `flushScoreDigits185DC4`) writes one longword
 * per dirty record via `setLong(dest, tile)`, where `dest` is the record's
 * measured `+$2` address (a `$904xxx` offset).  The OTHER text (lives, bombs,
 * credits, chain high-water) still goes through the unported `$240DC2` /
 * `$141258` path, so those cells stay blank in this map until Wave C'.
 */
export class TxVram {
  constructor(words) {
    this.w = words ? Uint16Array.from(words) : new Uint16Array(64 * 32 * 2);
    if (this.w.length !== 64 * 32 * 2) {
      throw new Error(`tx videoram is ${this.w.length} words, expected ${64 * 32 * 2}`);
    }
  }
  /** `$185DDC move.l (a0)+,(a1)` with A1 = a `$904xxx` destination address.
   *  `dest` is the ABSOLUTE address (e.g. `$9047D8`); the longword index is
   *  `(dest - $904000) / 4`, matching W114's measured layout (P1 col 54 rows
   *  0..8, P2 col 54 rows 17..25, extras rows 9/26). */
  setLong(dest, v) {
    const i = ((dest - 0x904000) >>> 2) * 2;
    this.w[i] = (v >>> 16) & 0xffff;
    this.w[i + 1] = v & 0xffff;
  }
  long(dest) {
    const i = ((dest - 0x904000) >>> 2) * 2;
    return u32((this.w[i] << 16) | this.w[i + 1]);
  }
}

/**
 * The IGS023 scroll registers the game uploads: `$B02000` bg_yscroll,
 * `$B03000` bg_xscroll, `$B04000` bg_scale, `$B05000` tx_yscroll,
 * `$B06000` tx_xscroll, `$B0E000` ctrl.  Register NAMES are MAME's
 * (`tools/oracle/bgrecon.lua:16`); the board's "x" is the game's TATE-vertical.
 */
export class VideoRegs {
  constructor() {
    // $23C5DC `move.w #$10 | $200,(A0)` -- bg_scale.  MEASURED $0210 on all
    // 16,000 frames of the wave-17 run, one distinct value.
    this.bg_scale = 0x0210;
    // $23C608: bg_yscroll = 0, bg_xscroll = 0.
    this.bg_yscroll = 0; this.bg_xscroll = 0;
    // $23C5F2: tx_yscroll = 0, tx_xscroll = 1.  Not 0 -- the ONE off-by-one in
    // the block, and it is in the ROM.
    this.tx_yscroll = 0; this.tx_xscroll = 1;
    // $23C008 `move.w $80393C,(A0)`.  MEASURED $001F on all 16,000 frames; the
    // caller is not on the main loop's seven-call path and is NOT identified
    // here -- the port mirrors $80393C at videoInit and says so.
    this.ctrl = 0x001f;
  }
}

// ---------------------------------------------------------- the camera, $240Bxx

/** `$240B0E` -- reset both cameras.  Called once, from `$261174`. */
export function camReset(ram) {
  ram.setU16(CAM.bgId, 0);                       // $240B10 bsr $240CB0, D0 = 0
  ram.setU32(CAM.bgLong, 0);                     // $240B14
  ram.setU32(CAM.bgCross, 0);                    // $240B1E
  ram.setU32(CAM.bgAccL, 0);                     // $240B28
  ram.setU32(CAM.bgAccC, 0);                     // $240B32
  ram.setU32(CAM.bgFracA, 0);                    // $240B3C -- a LONG, so it
                                                 // clears $80B026 AND $80B028
  ram.setU16(CAM.txId, 1);                       // $240B46 bsr $240CB8, D0 = 1
  ram.setU32(CAM.txLong, 0);                     // $240B4C
  ram.setU32(CAM.txCross, 0);                    // $240B56
  ram.setU32(CAM.txAccL, 0);                     // $240B60
  ram.setU32(CAM.txAccC, 0);                     // $240B6A
  ram.setU32(CAM.txFracA, 0);                    // $240B74 -- again a LONG
  ram.setU16(CAM.shakeX, 0);                     // $240B7E
  ram.setU16(CAM.shakeY, 0);                     // $240B86
  deferReset(ram);                               // $240B8E bsr $240F08
}

/** `$240F08` -- arm the deferred (address, value) write list. */
export function deferReset(ram) {
  ram.setU32(0x80d518, 0);                       // $240F0A
  ram.setU32(CAM.deferHead, 0xffffffff);         // $240F10 the terminator
  ram.setU32(CAM.deferCursor, CAM.deferHead);    // $240F1A
}

/**
 * `$240B94` -- accumulate the BG camera.  D0 = the along-axis step, D1 = the
 * cross-axis step, both ZERO-EXTENDED WORDS added as LONGS (`$261308
 * moveq #$0,D0 / move.w D6,D0`), which matters the moment `$81316E` is
 * negative: the word $FFF0 enters as +65,520, not as -16.
 *
 * THE FRACTIONAL SPLIT, `$240BA4..$240BB0`, is the shape of the whole camera:
 * the accumulator takes the step, only `(acc & ~$3F)` -- whole 1/64-px units
 * rounded down to a whole PIXEL -- is committed to the position, and
 * `(acc & $3F)` is kept for next frame.
 */
export function camBgAccumulate(ram, d0, d1, mut) {
  ram.setU32(CAM.bgAccL, u32(ram.u32(CAM.bgAccL) + d0));          // $240B98
  const whole = mut === 'commit-the-fraction' ? 0xffffffff : 0xffffffc0;
  const d2l = ram.u32(CAM.bgAccL) & whole;                        // $240BA4
  ram.setU32(CAM.bgLong, u32(ram.u32(CAM.bgLong) + d2l));         // $240BAA
  ram.setU32(CAM.bgAccL, ram.u32(CAM.bgAccL) & 0x3f);             // $240BB0
  ram.setU32(CAM.bgAccC, u32(ram.u32(CAM.bgAccC) + d1));          // $240BBA
  const d2c = ram.u32(CAM.bgAccC) & whole;                        // $240BC6
  ram.setU32(CAM.bgCross, u32(ram.u32(CAM.bgCross) + d2c));       // $240BCC
  ram.setU32(CAM.bgAccC, ram.u32(CAM.bgAccC) & 0x3f);             // $240BD2
  // ...and the same shape again on two WORD accumulators, whose output is
  // NEGATED.  Nothing in the port reads $80B01A/$80B01C yet; they are written
  // because the routine writes them and an unwritten word is a place for a
  // later wave's bug to hide.
  ram.setU16(CAM.bgFracA, u16(ram.u16(CAM.bgFracA) + d0));        // $240BDC
  ram.setU16(CAM.bgNegL, u16(-(ram.u16(CAM.bgFracA) & 0xffc0)));  // $240BE2..EE
  ram.setU16(CAM.bgFracA, ram.u16(CAM.bgFracA) & 0x3f);           // $240BF4
  ram.setU16(CAM.bgFracB, u16(ram.u16(CAM.bgFracB) + d1));        // $240BFC
  ram.setU16(CAM.bgNegC, u16(-(ram.u16(CAM.bgFracB) & 0xffc0)));  // $240C02..0E
  ram.setU16(CAM.bgFracB, ram.u16(CAM.bgFracB) & 0x3f);           // $240C14
}

/**
 * `$240C22` -- the TX camera, the same routine over `$80B034..$80B050`.
 *
 * THE WRITE 90 BYTES IN IS THE POINT.  `$240C7C move.w D0,$80B03C` is what
 * every background element reads through `$24179E` to cancel the scroll, and
 * `20-recon-scroll-engine` §9 item 6 declared it had no writer because the
 * reader stopped at the first `rts`-shaped landmark.  Wave 17 measured it:
 * 14,071 writes from `$240C7C` and 14,071 from `$240C9C` over 16,000 logic
 * frames -- once each per frame.  THE FALL-THROUGH TRAP IN ITS OTHER COSTUME:
 * read past the apparent end of every routine.
 */
export function camTxAccumulate(ram, d0, d1, mut) {
  ram.setU32(CAM.txAccL, u32(ram.u32(CAM.txAccL) + d0));          // $240C26
  const whole = mut === 'commit-the-fraction' ? 0xffffffff : 0xffffffc0;
  const d2l = ram.u32(CAM.txAccL) & whole;                        // $240C32
  ram.setU32(CAM.txLong, u32(ram.u32(CAM.txLong) + d2l));         // $240C38
  ram.setU32(CAM.txAccL, ram.u32(CAM.txAccL) & 0x3f);             // $240C3E
  ram.setU32(CAM.txAccC, u32(ram.u32(CAM.txAccC) + d1));          // $240C48
  const d2c = ram.u32(CAM.txAccC) & whole;                        // $240C54
  ram.setU32(CAM.txCross, u32(ram.u32(CAM.txCross) + d2c));       // $240C5A
  ram.setU32(CAM.txAccC, ram.u32(CAM.txAccC) & 0x3f);             // $240C60
  ram.setU16(CAM.txFracA, u16(ram.u16(CAM.txFracA) + d0));        // $240C6A
  ram.setU16(CAM.txNegL, u16(-(ram.u16(CAM.txFracA) & 0xffc0)));  // $240C70..7C
  ram.setU16(CAM.txFracA, ram.u16(CAM.txFracA) & 0x3f);           // $240C82
  ram.setU16(CAM.txFracB, u16(ram.u16(CAM.txFracB) + d1));        // $240C8A
  ram.setU16(CAM.txNegC, u16(-(ram.u16(CAM.txFracB) & 0xffc0)));  // $240C90..9C
  ram.setU16(CAM.txFracB, ram.u16(CAM.txFracB) & 0x3f);           // $240CA2
}

/**
 * `$140FFE` -- THE REGISTER UPLOAD THAT ACTUALLY RUNS.  **BUILD A**, and that
 * is deliberate: `NOTES-build-split.md` and `src/isr.js` both record that on a
 * VERSION-B run the interrupt handlers are build A's, and this is the second of
 * the four routines behind `$13C7E6`'s gate.
 *
 *   140ffe: A0 = $80B010 ; A1 = $B02000 ; A2 = $B03000
 *   141010: D0 = ($2,A0) ; D1 = ($6,A0)      the two LONG positions
 *   141018: D0 >>= 6     ; D1 >>= 6          1/64 px -> px, LOGICAL shift
 *   14101c: (A2) = D0.w  ; (A1) = D1.w
 *
 * Build B's twin `$240CC0` is byte-identical except for two extra instructions,
 * `$240CDE sub.w $80B054,D0` and `$240CE4 sub.w $80B056,D1`, which fold in the
 * screen shake.  MEASURED over the wave-17 corpus (10,738 consecutive frame
 * pairs of stage 1): `$B03000[n] == ($80B012[n-1] >> 6) & $FFFF` on **10,738 of
 * 10,738**, and the shake-subtracting form on **10,696** -- it is wrong on
 * exactly the 42 frames `$80B054`/`$80B056` are non-zero (the boss's shake,
 * lf11922..11964).  So `$240CC0` does not run and the shake does not reach the
 * background registers on this hardware path.  `upload-subtracts-shake` in
 * `tools/scrollportgate.mjs` is the red switch that keeps this honest.
 *
 * @param mutateShake  the gate's red switch: run build B's `$240CC0` instead.
 */
export function uploadRegs(ram, video, { subtractShake = false } = {}) {
  let d0 = ram.u32(CAM.bgLong) >>> 6;                 // $141018 lsr.l #6
  let d1 = ram.u32(CAM.bgCross) >>> 6;                // $14101A
  if (subtractShake) {                                // $240CDE/$240CE4 -- the
    d0 = u16(d0 - ram.u16(CAM.shakeX));               // build-B arm that does
    d1 = u16(d1 - ram.u16(CAM.shakeY));               // NOT execute
  }
  video.bg_xscroll = u16(d0);                         // $14101C move.w D0,(A2)
  video.bg_yscroll = u16(d1);                         // $14101E move.w D1,(A1)
}

/**
 * `$240D76` -- ONE map longword.  D0 = row, D1 = ring column, D4 = the stream
 * longword, to which the PER-STAGE TILE BASE is added WHOLE (`$240D88 add.l
 * D2,D4`): the base carries the tile number in its high word and zero in its
 * low, so the attr word rides through untouched.
 */
export function writeMapLong(ram, rom, vram, row, col, d4) {
  const stage = ram.u16(BGRAM.stageX4);                    // $240D7A
  const base = rom.u32(BGTAB.tileBase + stage);            // $240D80/$240D86
  vram.setLong(row, col, u32(d4 + base));                  // $240D88/$240D9A
}

// ------------------------------------------------------- background ELEMENTS
//
// Op $10 BGELEM, the 8-slot driver $26233A / spawner $262366, and the closed
// stage-1/stage-2 constructor families
// handlers behind $26224A, the $24179E scroll compensation, the $8130DA kill
// gate and the $23DF2A bucket-2 sprite stage.  Every line is cited from the
// listing; the recon is §0 of `18-impl-background-elements.md`.
//
// A slot is `$20` bytes at `$8131C8 + s*$20`.  Field offsets (A6-relative in
// the ROM, here slot-relative):
export const ESLOT = {
  active: 0x00,  // byte; $80 = in use. $262378 set, $2623D8/$262426... clr (die)
  arg:    0x02,  // LONG -- op $10's D1. $26237C. HIGH word (+2) is the despawn
                 //   target and += txNegL via $24179E; LOW word (+4) is the
                 //   along-axis position and -= scrollDelta via the driver
  update: 0x08,  // LONG -- the per-frame updater fn pointer. $2623B2 etc.
  kind:   0x0c,  // WORD -- high byte 0 (never written), low byte = $2623BA's
                 //   `move.b #imm,$d(a6)`. Read as d4 into $23DF2A
  data:   0x10,  // LONG -- the $22/$23xxxx sprite-descriptor pointer. $2623A4
  yPos:   0x14,  // WORD -- the Y constant. $2623AC
};

/** The 13 stage-1 handlers (ids 0..12), one row each, cited from the listing.
 *  `v` is the despawn variant: `wbge`/`wbgt` = `move.w +2,d0; addi.w #thr;
 *  bge/bgt`; `lbgt` = the same with `ext.l` + `addi.l` + `bgt`. `gate` is the
 *  HANDLER-0-ONLY `$8130DA` kill check.
 *
 *  **EXPORTED SINCE W86, AND THE REASON IS THE OWNER'S BLACK TERRAIN.**  `data`
 *  is the sprite stream every one of these elements draws with -- `$2623A4
 *  move.l #$22CBCC,($10,A6)` and its twelve twins -- and it is written ONCE, at
 *  construction, and never again (`elemConstruct` is its only writer;
 *  `elemUpdate` only reads it).  So the art an element can ever ask for is
 *  exactly this column, one stream per row, and `tools/export-web.mjs` harvests
 *  it from HERE rather than off a run.  Before W86 the exporter carried eight of
 *  these thirteen addresses as "measured one-offs" from a 3,000-frame run, and
 *  the five it lacked -- rows 7..11 -- first draw at [M] steps 3,627..5,275,
 *  which is why the stage went black after the golden terrain.  A list taken off
 *  a run is a floor; this column is the enumeration. */
export const BGELEM_HANDLERS = [
  { stage: 0, ctor: 0x2623A4, upd: 0x2623C2, data: 0x22CBCC, yPos: 0x24D0, kind: 0x14, thr: 0x4800, v: 'wbge', gate: true },
  { stage: 0, ctor: 0x2623FC, upd: 0x26241A, data: 0x22DA70, yPos: 0x1470, kind: 0x13, thr: 0x2800, v: 'wbge', gate: false },
  { stage: 0, ctor: 0x26244A, upd: 0x262468, data: 0x22DED4, yPos: 0x1690, kind: 0x13, thr: 0x2C00, v: 'lbgt', gate: false },
  { stage: 0, ctor: 0x26249C, upd: 0x2624BA, data: 0x22E508, yPos: 0x26A8, kind: 0x16, thr: 0x4C00, v: 'lbgt', gate: false },
  { stage: 0, ctor: 0x2624EE, upd: 0x26250C, data: 0x22F184, yPos: 0x26B0, kind: 0x16, thr: 0x4C00, v: 'wbgt', gate: false },
  { stage: 0, ctor: 0x26253C, upd: 0x26255A, data: 0x22FE98, yPos: 0x2860, kind: 0x12, thr: 0x5000, v: 'wbgt', gate: false },
  { stage: 0, ctor: 0x26258A, upd: 0x2625A8, data: 0x23061C, yPos: 0x28C0, kind: 0x12, thr: 0x5000, v: 'wbgt', gate: false },
  { stage: 0, ctor: 0x2625D8, upd: 0x2625F6, data: 0x231520, yPos: 0x2660, kind: 0x12, thr: 0x4C00, v: 'wbgt', gate: false },
  { stage: 0, ctor: 0x262626, upd: 0x262644, data: 0x231C44, yPos: 0x2A70, kind: 0x13, thr: 0x5400, v: 'wbgt', gate: false },
  { stage: 0, ctor: 0x262674, upd: 0x262692, data: 0x232578, yPos: 0x2A70, kind: 0x13, thr: 0x5400, v: 'wbgt', gate: false },
  { stage: 0, ctor: 0x2626C2, upd: 0x2626E0, data: 0x232EAC, yPos: 0x1E80, kind: 0x14, thr: 0x3C00, v: 'wbgt', gate: false },
  { stage: 0, ctor: 0x262710, upd: 0x26272E, data: 0x233630, yPos: 0x2090, kind: 0x14, thr: 0x4000, v: 'wbgt', gate: false },
  { stage: 0, ctor: 0x26275E, upd: 0x26277C, data: 0x233F34, yPos: 0x0A50, kind: 0x15, thr: 0x1400, v: 'wbgt', gate: false },

  // W168. Stage 2's complete adjacent table at $26227E. Entries 4 and 5 are
  // colour variants which deliberately share entries 2 and 3's updater and
  // art. `emit` names the ROM's register-convention sprite stub; an omitted
  // value is stage 1's existing bucket-2 $23DF2A path.
  { stage: 1, ctor: 0x2627AC, upd: 0x2627CA, data: 0x27A078, yPos: 0x2EE0, kind: 0x13, thr: 0x5C00, v: 'lbge', gate: false, emit: 0x23DF2A },
  { stage: 1, ctor: 0x2627FE, upd: 0x26281C, data: 0x2340C8, yPos: 0x1F20, kind: 0x11, thr: 0x3C00, v: 'lbge', gate: false, emit: 0x23DEFC },
  { stage: 1, ctor: 0x262850, upd: 0x26286E, data: 0x2356B4, yPos: 0x2050, kind: 0x12, thr: 0x4000, v: 'lbge', gate: false, emit: 0x23DF2A },
  { stage: 1, ctor: 0x2628C0, upd: 0x2628DE, data: 0x235BB8, yPos: 0x2A50, kind: 0x12, thr: 0x5400, v: 'lbge', gate: false, emit: 0x23DF2A },
  { stage: 1, ctor: 0x2628A2, upd: 0x26286E, data: 0x2356B4, yPos: 0x2050, kind: 0x52, thr: 0x4000, v: 'lbge', gate: false, emit: 0x23DF2A, kindWord: true },
  { stage: 1, ctor: 0x262912, upd: 0x2628DE, data: 0x235BB8, yPos: 0x2A50, kind: 0x52, thr: 0x5400, v: 'lbge', gate: false, emit: 0x23DF2A, kindWord: true },
  { stage: 1, ctor: 0x262930, upd: 0x26294E, data: 0x27B49C, yPos: 0x1220, kind: 0x15, thr: 0x2400, v: 'lbge', gate: false, emit: 0x23DF2A },
  { stage: 1, ctor: 0x262982, upd: 0x2629AE, complex: 'stage2-pair', animTable: 0x262A4C, animPairs: 32 },
];
const BGELEM_BY_CTOR = new Map(BGELEM_HANDLERS.map((h) => [h.ctor, h]));
const BGELEM_BY_UPD = new Map(BGELEM_HANDLERS.map((h) => [h.upd, h]));

/** `$262366` -- the spawner. D0 = id, D1 = the op-$10 arg. Finds the first
 *  free slot, marks it live, stores the arg, and calls the constructor the
 *  per-stage handler table names. */
function elemSpawn(ram, rom, ctx, id, arg, mut) {
  for (let s = 0; s < 8; s++) {
    const slot = BGRAM.elemSlots + s * 0x20;
    if (ram.u8(slot + ESLOT.active) !== 0) continue;        // $262372 tst.b/bne
    ram.setU8(slot + ESLOT.active, 0x80);                   // $262378 move.b #$80
    ram.setU32(slot + ESLOT.arg, arg >>> 0);                // $26237C move.l D1
    const tab = ram.u32(BGRAM.elemTable);                   // $262380 $8132C8
    // $262386/$262388 add.w D0,D0 twice -> id*4; $26238A adda; $26238C (A1)
    const ctorAddr = rom.u32(tab + (id & 0xffff) * 4);
    const h = BGELEM_BY_CTOR.get(ctorAddr);
    if (!h) {
      unreached(ctorAddr, `$${ctorAddr.toString(16).toUpperCase()} is not one `
        + `of the ${BGELEM_HANDLERS.length} ported stage-1/stage-2 BGELEM `
        + `constructors (id ${id})`);
      return;
    }
    elemConstruct(ram, slot, h, mut);                        // $26238E jsr (A1)
    return;
  }
  // $262396 -- no free slot: the ROM's dbra falls through to rts (a silent
  // drop). W17 §5 measured only slots 0..4 ever used in stage 1, so this is
  // never taken; flagged, never smoothed.
  ctx.unportedLog.note(0x262366, `$262366 BGELEM id=${id}: all 8 element slots `
    + `occupied -- dropped (W17 measured this never happens in stage 1)`);
}

/** The common constructor shape shared by stage 1 and seven stage-2 rows. */
function elemConstruct(ram, slot, h, mut) {
  if (h.complex === 'stage2-pair') {
    ram.setU32(slot + ESLOT.update, h.upd);                // $262982
    ram.setU16(slot + 0x06, 0x00F8);                       // $26298A
    ram.setU32(slot + 0x10, 0x2376F4);                    // $262990
    ram.setU32(slot + 0x14, 0x24CD34);                    // $262998
    ram.setU8(slot + 0x18, 2);                            // $2629A0
    ram.setU8(slot + 0x19, 2);                            // $2629A6
    return;
  }
  // RED: deleting a constructor field must diverge the staged bytes. Handler
  // 0's data pointer ($22CBCC) is the one the gate mutates; every other field
  // is cited straight from the listing.
  const deleteData = (mut === 'delete-handler0-data' && h.ctor === 0x2623A4)
    || (mut === 'delete-stage2-handler0-data' && h.ctor === 0x2627AC);
  const data = deleteData ? 0 : h.data;
  ram.setU32(slot + ESLOT.data, data);                      // $2623A4 move.l #data
  ram.setU16(slot + ESLOT.yPos, h.yPos);                    // $2623AC move.w #yPos
  ram.setU32(slot + ESLOT.update, h.upd);                   // $2623B2 move.l #upd
  if (h.kindWord) ram.setU16(slot + ESLOT.kind, h.kind);    // $2628B8/$262928
  else ram.setU8(slot + 0x0d, h.kind);                      // move.b #kind,$d(A6)
}

/** `$26233A` -- the 8-slot driver, run once per frame from `$2613A0` (after
 *  `$240C22`, before `$260EC8`), AND from the `$8130D2` frozen branch. */
function elemDriver(ram, rom, ctx) {
  const d0 = ram.u16(BGRAM.scrollDelta);                    // $262348 $813176
  for (let s = 0; s < 8; s++) {
    const slot = BGRAM.elemSlots + s * 0x20;
    if (ram.u8(slot + ESLOT.active) === 0) continue;        // $262342 tst.b/beq
    ram.setU16(slot + 0x04, u16(ram.u16(slot + 0x04) - d0));// $26234E sub.w D0
    const updAddr = ram.u32(slot + ESLOT.update);           // $262352 movea.l
    const h = BGELEM_BY_UPD.get(updAddr);
    if (!h) {
      unreached(updAddr, `element updater $${updAddr.toString(16)
        .toUpperCase()} is not one of the ported stage-1/stage-2 handlers`);
      continue;
    }
    elemUpdate(ram, rom, ctx, slot, h);                     // $262358 jsr (A1)
  }
}

/** `$24179E` -- the per-element scroll compensation. Reads the LONG at
 *  `$80B03C`, swaps, and adds the (now-high, originally-high) word to `+2`.
 *  Skipped entirely while `$8130D2` (bgFreeze) is set. */
function elemScrollComp(ram, slot) {
  if (ram.u16(BGRAM.bgFreeze) !== 0) return;                // $2417A4 bne
  const lo = ram.u32(CAM.txNegL) >>> 16;                    // $2417A8/$2417AE swap
  ram.setU16(slot + ESLOT.arg, u16(ram.u16(slot + ESLOT.arg) + lo)); // $2417B0
}

/** The bucket-2 sprite stage `$23DF2A`. Packs D1 and writes the 12 bytes the
 *  recorder (`w18elem.lua`) taps at `$805CC8 + $80AFC4`. */
const B2_BASE = 0x805cc8;       // $23DF2A lea
const B2_COUNT = 0x80afc4;      // $23DF2A adda / $23DF4E addi.w #$C

/** WAVE 85's mutation seam, the W79/W82 `*_MUTATE` pattern.  `tools/breakage.mjs`
 *  is the only writer; `null` is the shipped behaviour.
 *
 *  It exists because the bucket-2 trace this wave added has to be shown to go
 *  RED somewhere the BACKGROUND ELEMENTS run, not only where the boss does.
 *  W82's twelve mutations all live inside `src/boss.js` and can only bite on
 *  `stage1-sweep`'s last two rungs; the 9 GREEN segments of that ladder are all
 *  below lf8,250, where the elements are the bucket's only producer.  A trace
 *  proven red at lf19,000 and never exercised at lf2,250 would be a trace nobody
 *  had checked over 95% of the stage it claims to cover. */
export const B2_MUTATE = { value: null };

function elemStage(ram, d1, d2, d3, d4) {
  const off = ram.u16(B2_COUNT);
  const d0 = (((d1 >> 6) & 0x7ff03ff) | 0x80008000) >>> 0; // $23DF38..40
  ram.setU32(B2_BASE + off, d0);                           // $23DF46
  ram.setU32(B2_BASE + off + 4, d2 >>> 0);                 // $23DF48
  ram.setU16(B2_BASE + off + 8, d3);                       // $23DF4A
  // `elem-no-kind` is the transcription that stopped at `$23DF4A` and never read
  // `$23DF4C move.w D4,(A0)+` -- the element's flip/colour word, which the emit
  // ORs into hardware word 2's high byte.  Every element's record differs.
  ram.setU16(B2_BASE + off + 10,
    B2_MUTATE.value === 'elem-no-kind' ? 0 : d4);          // $23DF4C
  ram.setU16(B2_COUNT, u16(off + 12));                     // $23DF4E
}

/** Stage 2 uses the same register record with three ROM stubs: bucket 1's
 * `$23DEFC`, bucket 2's `$23DF2A`, and bucket 3's `$23DF58`/`$23E056`.
 * Keep stage 1 on its measured inline bucket-2 path so W18's mutation seam and
 * byte gate stay unchanged; resolve every other stub from the ROM. */
function elemEmit(ram, rom, h, d1, d2, d3, d4) {
  if (!h.emit || h.emit === 0x23DF2A) elemStage(ram, d1, d2, d3, d4);
  else enqueueRegistersThroughStub(ram, rom, h.emit, d1, d2, d3, d4);
}

/** `$2629AE..$262A4A`, stage-2 entry 7. This is the one handler which is not
 * the short common updater: it animates a closed 32-pair table at `$262A4C`,
 * draws its first half only before clock `$21A`, and its second half through
 * the `$22F` lifetime boundary. */
function elemUpdateStage2Pair(ram, rom, slot, h) {
  const clock = ram.u16(BGRAM.clock);
  if (clock >= 0x022F) {                                  // $2629AE cmpi/bcs
    ram.setU8(slot + ESLOT.active, 0);                    // $2629BA
    return;
  }
  elemScrollComp(ram, slot);                              // $2629BE
  if (clock >= 0x01F4 && i16(ram.u16(slot + 0x06)) >= 0) {// $2629C4..D4
    const before = ram.u8(slot + 0x18);
    ram.setU8(slot + 0x18, u16(before - 1) & 0xff);       // $2629D8 subq.b
    if (before === 0) {                                   // $2629DC bcc otherwise
      ram.setU8(slot + 0x18, ram.u8(slot + 0x19));        // $2629E0
      const at = h.animTable + i16(ram.u16(slot + 0x06)); // $2629E6..F0
      ram.setU32(slot + 0x10, rom.u32(at));               // $2629F2
      ram.setU32(slot + 0x14, rom.u32(at + 4));           // $2629F6
      ram.setU16(slot + 0x06, u16(ram.u16(slot + 0x06) - 8)); // $2629FA
    }
  }
  if (clock < 0x021A) {                                   // $2629FE bcc
    enqueueRegistersThroughStub(ram, rom, 0x23E056,
      u32(ram.u32(slot + ESLOT.arg) + 0xFE00DC00),        // $262A08
      ram.u32(slot + 0x10), 0x2720, 0x15);                // $262A12..1E
  }
  const d1 = u32((u16(ram.u16(slot + 0x02) + 0x4C00) << 16)
    | ram.u16(slot + 0x04));                              // $262A24..32
  enqueueRegistersThroughStub(ram, rom, 0x23DF58,
    u32(d1 + 0xFE00DC00), ram.u32(slot + 0x14), 0x2320, 0x15); // $262A32..44
}

/** The common updater shape. The `$8130DA` kill
 *  gate and the despawn check differ per handler; both port exactly. */
function elemUpdate(ram, rom, ctx, slot, h) {
  if (h.complex === 'stage2-pair') {
    elemUpdateStage2Pair(ram, rom, slot, h);
    return;
  }
  if (h.gate && ram.u16(BGRAM.elemGate) !== 0) {           // $2623C2 (handler 0)
    ram.setU8(slot + ESLOT.active, 0);                     // $2623D8 clr.b -- die
    return;
  }
  // THE DESPAWN CHECK and the overflow-flag trap. `move.w $2(a6),d0` zero-
  // extends the HIGH word of the arg into D0; `addi.w #thr,d0` then adds the
  // threshold; `bge`/`bgt` test N==V (&& Z==0), NOT i16(result). When the
  // signed sum overflows the word -- slot2=$7000, thr=$1400 -> true sum $8400
  // = +33792, wrapped result $8400 = i16 -31744 -- the V flag flips and N==V
  // still says "the true sum is positive", so the element LIVES. A port that
  // tests the wrapped i16 result kills it 2 frames early and never stages.
  // So: bge = true signed sum >= 0; bgt = > 0. The `.l` variants (`ext.l` +
  // `addi.l`) reduce to the SAME expression (the 32-bit add cannot overflow
  // here: i16(slot2)+thr is in [-32768, 54271]).
  const slot2 = ram.u16(slot + ESLOT.arg);                 // move.w $2(a6),d0
  const sum = i16(slot2) + h.thr;
  const alive = h.v.endsWith('bge') ? sum >= 0 : sum > 0;
  if (!alive) {
    ram.setU8(slot + ESLOT.active, 0);                     // clr.b (a6) -- die
    return;
  }
  elemScrollComp(ram, slot);                               // $24179E
  elemEmit(ram, rom, h,
    ram.u32(slot + ESLOT.arg),                             // d1 = move.l $2(a6)
    ram.u32(slot + ESLOT.data),                            // d2 = move.l $10(a6)
    ram.u16(slot + ESLOT.yPos),                            // d3 = move.w $14(a6)
    ram.u16(slot + ESLOT.kind));                           // d4 = move.w $c(a6)
}

// ------------------------------------------------------- the cross axis, $26146C
//
// The player-driven half of the camera.  It writes `$81316E` (the D1 both
// accumulators take) and `$813176`, the per-frame scroll delta EVERY other
// object subtracts -- `src/state.js` has carried `scroll` = $813176 as a
// compared column since wave 8 with the note "the port NEVER WRITES THIS: it is
// produced by $26151E inside the unported background object".  It does now.

/** `$2613FC` -- flag a player pinned at either X wall, per player. */
function edgeFlags(ram, rec, a5) {
  if ((ram.u16(rec) & 0x8000) === 0) return;               // $2613FC tst.w (A1) / bpl
  const x = ram.u16(rec + 4);                              // $261402 ($4,A1)
  let d3 = 7;                                              // $261406
  if (x > 0x300) {                                         // $261408 cmpi/bls
    d3 = 6;                                                // $261410
    if (x < 0x3500) return;                                // $261412 cmpi/bcs
  }
  ram.setU8(a5 + BGO.edgeBits, ram.u8(a5 + BGO.edgeBits) | (1 << d3)); // $26141A
}

/** `$261420` -- each player's last X velocity pushes the free camera. */
function freeCameraPush(ram, rec, a5) {
  if ((ram.u16(rec) & 0x8000) === 0) return;               // $261420 tst.w (A1)/bpl
  let d5 = i16(ram.u16(rec + 0x5c));                       // $261426 ($5c,A1)
  ram.setU16(rec + 0x5c, 0);                               // $26142A -- CLEARED
  d5 = d5 >> 2;                                            // $26142E asr.w #2
  if (d5 === 0) return;                                    // $261430 beq
  let d4 = 6;                                              // $261432
  let d0 = i16(d5 + (d5 >> 1));                            // $261434..38: v + v/2
  if (d0 >= 0) d4 = 7;                                     // $26143A bmi / $26143C
  if ((ram.u8(a5 + BGO.edgeBits) >> d4) & 1) return;       // $26143E btst / bne
  let d1 = ram.u16(BGRAM.crossRaw);                        // $261444
  const d0u = u16(d0);
  if (d1 !== 0) {
    if ((d1 & 0x8000) === 0) {                             // $26144C bmi
      if (d0u <= d1) return;                               // $26144E cmp/bls
      if (d0 < 0) d1 = ram.u16(BGRAM.crossRaw);            // $261452 tst/bmi -> $261462
      else d1 = 0;                                         // $261456 bra $261460
    } else {
      if (d0u >= d1) return;                               // $261458 cmp/bcc
      if (d0 >= 0) d1 = ram.u16(BGRAM.crossRaw);           // $26145C tst/bpl -> $261462
      else d1 = 0;                                         // $261460
    }
  }
  ram.setU16(BGRAM.crossRaw, u16(d1 + d0));                // $261462/$261464
}

/** `$2613B4` -- clamp the raw cross-axis request to +-$800 and return the
 *  WHOLE-pixel delta since last frame.  `$81317A` is the "pinned" flag the
 *  player's own `$261126` reads (already ported, `main.js` ctx.wallHit). */
function crossStep(ram, a5) {
  ram.setU16(BGRAM.wallFlag, 0);                           // $2613B4
  let d0 = i16(ram.u16(BGRAM.crossRaw));                   // $2613BA
  ram.setU16(BGRAM.crossRaw, 0);                           // $2613C0
  let d2 = 0x800;                                          // $2613C6
  d0 = i16(d0 + i16(ram.u16(a5 + BGO.crossAcc)));          // $2613CA
  let d1 = d0;                                             // $2613CE
  if (d0 < 0) { d1 = -d1; d2 = -d2; }                      // $2613D0..D4
  if (u16(d1) > 0x800) {                                   // $2613D6 cmpi/bls
    d0 = i16(d2);                                          // $2613DC
    ram.setU16(BGRAM.wallFlag, 1);                         // $2613DE
  }
  ram.setU16(a5 + BGO.crossAcc, u16(d0));                  // $2613E6
  const whole = u16(d0) & 0xffc0;                          // $2613EA
  const prev = ram.u16(a5 + BGO.crossPos);                 // $2613EE
  ram.setU16(a5 + BGO.crossPos, whole);                    // $2613F2
  return u16(whole - prev);                                // $2613F8 sub.w D1,D0
}

/** `$26146C` -- the whole cross-axis update, both arms. */
function crossAxis(ram, a5) {
  let single = false;
  if (ram.u16(BGRAM.crossMode) === 0) {                    // $26146C tst.w/bne
    const p1 = ram.u16(0x8103e6), p2 = ram.u16(0x810448);  // $261476/$26147C
    single = ((p1 ^ p2) & 0x8000) !== 0;                   // $261482 eor / bmi
  }
  if (!single) {
    // The FREE camera: both players' wall flags, then both players' pushes.
    ram.setU8(a5 + BGO.edgeBits, ram.u8(a5 + BGO.edgeBits) & 0x3f);  // $261488
    edgeFlags(ram, 0x8103e6, a5);                          // $26148E
    edgeFlags(ram, 0x810448, a5);                          // $261498
    freeCameraPush(ram, 0x8103e6, a5);                     // $2614A2
    freeCameraPush(ram, 0x810448, a5);                     // $2614AC
  } else {
    // FOLLOW the one live player.  `divs.w #$C8` is a SIGNED divide of a long
    // by 200; the numerator is (posX - $1C00) with posX zero-extended.
    const rec = (ram.u16(0x8103e6) & 0x8000) ? 0x8103e6 : 0x810448;  // $2614C0
    const num = (ram.u16(rec + 4) - 0x1c00) | 0;           // $2614D0/$2614D4
    const q = i16(Math.trunc(num / 0xc8));                 // $2614DA divs.w #$C8
    const d0 = u16(u16(q << 6) - ram.u16(a5 + BGO.crossPos)); // $2614DE/$2614E0
    ram.setU16(BGRAM.crossRaw, d0);                        // $2614E4
  }
  // $2614EA -- BOTH arms fall into the same tail.  (The free arm's `bra $2614EA`
  // at $2614B6 is what makes this one routine and not two.)
  const delta = crossStep(ram, a5);                        // $2614EA bsr $2613B4
  ram.setU16(BGRAM.crossDelta, delta);                     // $2614EE
  const d1 = u16(ram.u16(a5 + BGO.crossPos) >>> 6);        // $2614F4/$2614F8
  const d2 = d1;                                           // $2614FA
  ram.setU16(BGRAM.scrollPrev, ram.u16(BGRAM.scrollCur));  // $2614FE
  ram.setU16(BGRAM.scrollCur, u16(d1 << 6));               // $261508
  const prevWhole = ram.u16(BGRAM.crossWhole);             // $26150E
  ram.setU16(BGRAM.crossWhole, d2);                        // $261514
  const step = u16(u16(d2 - prevWhole) << 6);              // $26151A/$26151C
  ram.setU16(BGRAM.scrollDelta, step);                     // $26151E
  ram.setU16(BGRAM.scrollAccum, u16(ram.u16(BGRAM.scrollAccum) - step)); // $261524
}

// ------------------------------------------------------------- the VM, $262062

/** `$261F76` -- the repeat/unfreeze partner, run ONCE PER NEW COLUMN from
 *  `$261348`, BEFORE the column is read.  Script 0 only: `$261F84`, the
 *  script-1 entry, has NO caller of any kind in build B (recon §1, a listing
 *  absence over `$230000..$2A0000` for all three `bsr` widths). */
function repeatStep(ram, a5, mut) {
  const b = BGRAM.scr0;
  const target = ram.u32(b + SB.rewind);                   // $261F8E ($c,A0)
  if (target === 0) return;                                // $261F92 cmpa/beq
  ram.setU16(b + SB.count, u16(ram.u16(b + SB.count) - 1));// $261F9C subq.w #1
  if (i16(ram.u16(b + SB.count)) > 0) return;              // $261FA0 bgt
  const loops = ram.u16(b + SB.loops);                     // $261FA4
  if (loops !== 0xffff) {                                  // $261FA8 cmpi/beq
    ram.setU16(b + SB.loops, u16(loops - 1));              // $261FB0 subq.w #1
    if (i16(ram.u16(b + SB.loops)) <= 0) {                 // $261FB4 bgt
      ram.setU32(b + SB.rewind, 0);                        // $261FB8
      ram.setU16(a5 + BGO.frozen, 0);                      // $261FC0 clr ($8,A5)
      // THE CLOCK WRITTEN BACKWARDS.  The interpreter matches on exact
      // equality, so this is the only reason the records after the opening
      // freeze ever run.
      ram.setU16(BGRAM.clock, ram.u16(b + SB.resume));     // $261FC4
      return;
    }
  }
  // $261FD0 -- reload at len (NOT len+1; only the arm at $262130 adds one) and
  // rewind the stream pointer.
  ram.setU16(b + SB.count, mut === 'reload-lenplus1'
    ? u16(ram.u16(b + SB.len) + 1) : ram.u16(b + SB.len));
  ram.setU32(a5 + BGO.colPtr, target);                     // $261FD6 move.l A2,(A1)
}

/** One opcode.  `a1` is the record cursor just past the op word; returns the
 *  new cursor.  `blk` is `$813192` or `$8131AA`; `d6` is 1 for script 0. */
function runOpcode(ram, rom, ctx, a5, blk, d6, op, a1, recTime, mut) {
  const note = (addr, what) => ctx.unportedLog.note(addr,
    `${what} -- scroll record t=$${recTime.toString(16).toUpperCase()
      .padStart(4, '0')}, op $${op.toString(16).padStart(2, '0')} `
    + `${OPS[op]} via $${OP_HANDLER[op].toString(16).toUpperCase()}`);

  switch (op) {
    case 0x00: {   // $2620DE SPAWN -- N entries off the object stream
      let n = rom.u16(a1); a1 += 2;                        // $2620DE move.w (A1)+,D2
      let a2 = ram.u32(blk + SB.obj);                      // $2620E0 ($4,A6)
      while (true) {
        const ptr = rom.u32(a2); a2 += 4;                  // $2620E4 movea.l (A2)+,A0
        if (ptr === 0xffffffff) {                          // $2620E6 cmpa.l/beq
          // AND THE CURSOR IS NOT WRITTEN BACK on this arm -- $2620EC branches
          // straight to the rts at $262100, past $2620FC.  Translated as
          // written; a stream that ends mid-record keeps its old cursor.
          return a1;
        }
        const param = rom.u16(a2); a2 += 2;                // $2620F0 move.w (A2)+,D0
        // $24150A copies 64 bytes from `ptr` to `$80E886 + param*64`, treating
        // every ptr as DATA. The 22-entry stage-1 stream ($26157A) holds 20
        // $22xxxx data pointers and TWO code-segment addresses...
        //
        // ...NO: **ONE**, and this comment has been wrong since wave 18.
        // [M, W91] entry 6 is $246BB8 and it is the ONLY $24xxxx pointer in the
        // stage-1 stream; the OTHER constant bank, $246BF8, is named by seven
        // sites elsewhere (the boss's bank $12 among them) and never by this
        // stream.  And the old text's "64 zero bytes" is half a pair: [M]
        // $246BB8 is 32 x $0000 (BLACK) and $246BF8 is 32 x $7FFF (WHITE) --
        // the two endpoints `$24636C`/`$2463A6` fade the whole 79-bank palette
        // to.  Both are checked in `tools/export-tables.py
        // PALETTE_CONST_BANKS`, so this correction cannot rot the way the
        // sentence it replaces did (`docs/knowledge/02-traps.md`).
        //
        // WAVE 91 -- AND THIS IS NOW A CALL AND NOT A NOTE.  The prototype
        // copy itself is W21's object allocator; op $00 walks the stream, and
        // what it hands $24150A is a 64-byte SPRITE COLOUR BANK.
        const buildBit = (ptr >>> 20) & 0xf;
        const inCode = buildBit === 2 && (ptr >>> 16) !== 0x0022;
        ctx.palette
          ? install24150A(ram, ctx.palette, param, rom.bytes(ptr, 64), 0x2620f2,
            `$${ptr.toString(16).toUpperCase()} (object stream${
              inCode ? ', a CONSTANT bank in the code segment' : ''})`)
          : note(0x24150a, `$24150A object create (ptr $${ptr.toString(16)
            .toUpperCase()}, param $${param.toString(16).toUpperCase()
            .padStart(4, '0')}) -- no PaletteState on this ctx`);
        ctx.scrollEvent?.({ op, recTime, kind: 'spawn', ptr, param });
        if (--n === 0) break;                              // $2620F8 subq/bne
      }
      ram.setU32(blk + SB.obj, a2);                        // $2620FC
      return a1;
    }
    case 0x04: {   // $262102 REWIND + REPEAT
      // A2 = ($a,A5) for script 0 and ($10,A5) for script 1 -- `tst.w D6 / beq`
      // at $262106 picks the OTHER one first, so the sense is inverted from
      // what the register order suggests.
      const ptrField = d6 !== 0 ? BGO.colPtr : BGO.scr1Ptr;
      let a3 = ram.u32(a5 + ptrField);                     // $262110 movea.l (A2),A3
      const rew = rom.i16(a1); a1 += 2;                    // $262112 move.w (A1)+,D0
      a3 = u32(a3 + rew * 36);                             // $262118..20: D0*32+D0*4
      ram.setU32(blk + SB.rewind, a3);                     // $262122 ($c,A6)
      ram.setU32(a5 + ptrField, a3);                       // $262126 -- IMMEDIATELY
      const len = rom.u16(a1); a1 += 2;                    // $262128
      ram.setU16(blk + SB.len, len);                       // $26212A ($12,A6)
      // len+1, and this is the whole off-by-one the recon warns about.
      ram.setU16(blk + SB.count, mut === 'len-not-lenplus1'
        ? len : u16(len + 1));                             // $26212E/$262130
      let loops = rom.u16(a1); a1 += 2;                    // $262134 ($10,A6)
      if (mut === 'loop-word-as-iterations' && loops !== 0xffff) loops = u16(loops + 1);
      ram.setU16(blk + SB.loops, loops);
      return a1;
    }
    case 0x08: {   // $26213A SPEED, in 1/64 px per frame
      const v = rom.u16(a1); a1 += 2;                      // $262148 move.w (A1)+,(A2)
      ram.setU16(a5 + (d6 !== 0 ? BGO.speedBg : BGO.speedTx), v);
      return a1;
    }
    case 0x0c: {   // $26214C FREEZE -- the CLOCK, not the scroll (see BGO.frozen)
      ram.setU16(a5 + BGO.frozen, 1);                      // $26214C
      ram.setU16(blk + SB.resume, u16(ram.u16(BGRAM.clock) + 4)); // $262152..5A
      // A freeze whose partner op-$04 armed `loops = $FFFF` can NEVER be
      // released from inside the VM ($261FA8 always takes the rewind branch),
      // and that is the stage-1 boss lock -- record $261792, clock $0344, map
      // columns 210..223 looping forever.  The only doors out are OUTSIDE this
      // file and all three are unported, so say so LOUDLY rather than letting
      // the port sit in the lock silently.  W19 censused all three:
      //   $261142  ext-unfreeze ($81317E := 2) -- TWO callers in the whole of
      //            build B, $26C7F4 and $26D254, both ENEMY state machines,
      //            each paired with `clr.w $8130F4`.  $261138 (freeze ON) has
      //            no caller at all.
      //   $261100  the external speed push -- 9 callers, one of which is the
      //            stage-1 midboss at $26B73A (D0 = D1 = $0020).
      //   $8130D2  the global pause -- exactly TWO writers, $25FD82 / $25FD8C.
      if (ram.u16(blk + SB.loops) === 0xffff) {
        ctx.unportedLog.note(0x261142, '$261142 the external unfreeze -- op $0C '
          + `at t=$${recTime.toString(16).toUpperCase().padStart(4, '0')} `
          + 'latched a freeze whose op-$04 partner armed loops=$FFFF, so the '
          + 'VM can never release it. The board is released by an ENEMY '
          + '($26C7F4 / $26D254, both `jsr $261142` + `clr.w $8130F4`) and no '
          + 'enemy is ported, so the port HOLDS here -- correctly. W19 §2');
      }
      return a1;
    }
    case 0x10: {   // $262160 BGELEM
      const id = rom.u16(a1); a1 += 2;                     // $262160
      let arg = rom.u32(a1); a1 += 4;                      // $262162 move.l (A1)+,D1
      if (ram.u16(BGRAM.fastFwd) === 0) {                  // $262164 tst/bne
        // The LOW WORD only: `subi.w`/`sub.w` on D1 touch D1.w and leave the
        // high word alone.
        const lo = u16(u16(arg & 0xffff) - 0x800 - ram.u16(BGRAM.scrollPrev));
        arg = u32((arg & 0xffff0000) | lo);                // $26216E/$262172
        const tab = rom.u32(BGTAB.elemTable + ram.u16(BGRAM.stageX4));
        const handler = rom.u32(tab + id * 4);
        note(0x262366, `$262366 background-element spawn (id ${id}, handler `
          + `$${handler.toString(16).toUpperCase()}, arg $${arg.toString(16)
            .toUpperCase().padStart(8, '0')}) -- W18`);
        elemSpawn(ram, rom, ctx, id, arg, mut);            // $262178 jsr $262366
        ctx.scrollEvent?.({ op, recTime, kind: 'bgelem', id, handler, arg });
      }
      return a1;
    }
    case 0x14: {   // $262180 CUE -- the stage script's SOUND channel
      let n = rom.u16(a1); a1 += 2;                        // $262180
      let a2 = ram.u32(blk + SB.cue);                      // $262182 ($8,A6)
      while (true) {
        const sub = rom.u16(a2); a2 += 2;                  // $262186 move.w (A2)+,D0
        if (sub === 0xffff) return a1;                     // $262188 -- again NO
                                                           // write-back ($26218C
                                                           // skips $2621A4)
        if (sub === 0) {                                   // $2621B6 -- PURE STATE
          ram.setU16(BGRAM.cueCount, rom.u16(a2)); a2 += 2;
          ram.setU32(BGRAM.cueCall, rom.u32(a2)); a2 += 4;
        } else if (sub === 1) {                            // $2621C4
          note(0x28c170, '$28C170 -> $28BBAC D0=$15 (BGM command)');
          ctx.scrollEvent?.({ op, recTime, kind: 'cue', sub });
        } else if (sub === 2) {                            // $2621CC
          const d1 = rom.u16(a2); a2 += 2;
          note(0x28c186, `$28C186 -> $28BBAC D0=$16 D1=$${d1.toString(16)
            .toUpperCase().padStart(4, '0')} (BGM command)`);
          ctx.scrollEvent?.({ op, recTime, kind: 'cue', sub, d1 });
        } else {
          unreached(0x2621aa, `cue sub-op ${sub} at $${a2.toString(16)
            .toUpperCase()}: the table $2621AA has exactly THREE entries `
            + `($2621B6/$2621C4/$2621CC) and $262196 indexes it with no bound `
            + `check, so a fourth value would jsr into whatever follows`);
        }
        if (--n === 0) break;                              // $2621A0
      }
      ram.setU32(blk + SB.cue, a2);                        // $2621A4
      return a1;
    }
    case 0x18: {   // $2621D6 the POWER/FLAG ladder.  Stage index 4 only.
      const lvl = rom.u16(a1); a1 += 2;                    // $2621D6
      // $2621D8..: four `cmpi.w #n / bne` arms, each setting one MORE rung, so
      // level n sets rungs 1..n.  Written as the ladder it is; the arms above 4
      // are not in the listing and are not invented.
      if (lvl < 1 || lvl > 4) {
        unreached(0x2621d6, `op-$18 FLAG level ${lvl}: the listing at `
          + `$2621D8..$262220 has arms for 1..4 only`);
      }
      for (let i = 0; i < lvl; i++) {
        ram.setU16(BGRAM.powerLadder + i * 2, 1);          // $2621E0/$2621F0/...
      }
      ctx.scrollEvent?.({ op, recTime, kind: 'flag', lvl });
      return a1;
    }
    default:
      return unreached(BGTAB.opTable, `opcode $${op.toString(16)
        .padStart(2, '0')} is not one of the SEVEN longwords at $2620C2 `
        + `($00 $04 $08 $0C $10 $14 $18).  $262086 adds the op word to the `
        + `table base with no bound check, so this would jsr into data`);
  }
}

/**
 * `$262062` -- the interpreter.  TWO scripts, `$18`-byte state blocks, and the
 * record shape is `time:u16, UNUSED:u16, op:u16, payload`.
 *
 * @param clock  D7.  `$8130CE` on the normal path; `$26200E` calls the body at
 *               `$262068` with a replay counter instead, which is why the clock
 *               is a parameter and not a read.
 */
function interpret(ram, rom, ctx, a5, clock, mut) {
  for (let d6 = 1; d6 >= 0; d6--) {                        // $26206E moveq #1,D6
    const blk = d6 === 1 ? BGRAM.scr0 : BGRAM.scr1;        // $262068 / $262096
    for (;;) {
      let a1 = ram.u32(blk + SB.cur);                      // $262070 movea.l (A6),A1
      const t = rom.u16(a1); a1 += 2;                      // $262072 move.w (A1)+,D1
      if (t === 0xffff) break;                             // $262074 cmpi/beq
      if (t !== clock) break;                              // $26207C cmp.w D1,D7/bne
      // $262082 `addq.w #2,A1` -- THE SECOND WORD IS SKIPPED, NOT TESTED.  It
      // is $FFFF on all 57 stage-1 records and the interpreter never reads it.
      if (mut === 'cond-word-honoured' && rom.u16(a1) !== 0) break;
      a1 += 2;
      const op = rom.u16(a1); a1 += 2;                     // $262084 move.w (A1)+,D2
      // COVERAGE HOOK, not behaviour.  `docs/knowledge/10`: the unit that
      // means something for this VM is RECORDS DISPATCHED and OPCODES TAKEN,
      // not frames.  `a1 - 6` is the record's own address (time, pad, op), so
      // a consumer can count DISTINCT records rather than dispatches -- the
      // fast-forward $26200E replays the whole script and would otherwise
      // inflate the number. Optional, like `scrollEvent`; nothing here reads
      // it back and no arm depends on it.
      ctx.scrollRecord?.({ at: a1 - 6, op, t, script: d6 === 1 ? 0 : 1,
        replay: ram.u16(BGRAM.fastFwd) !== 0 });
      a1 = runOpcode(ram, rom, ctx, a5, blk, d6, op, a1, t, mut);
      // $262092 `move.l A1,(A6)` -- the record LEDGER wave 17 tapped: it runs
      // only after a record has been dispatched and its value names the next.
      ram.setU32(blk + SB.cur, a1);
    }
  }
  // $26209E -- the deferred callback armed by cue sub-op 0.  `subq.w #1` sets
  // the CARRY only when the word BORROWS, i.e. only when it was already 0, and
  // `$2620AE bcc` skips otherwise -- so a countdown of N fires on the (N+1)th
  // frame and the stage-1 cue (countdown 0) fires on the very next one.
  const call = ram.u32(BGRAM.cueCall);                     // $26209E
  if (call !== 0) {                                        // $2620A4 beq
    const before = ram.u16(BGRAM.cueCount);
    ram.setU16(BGRAM.cueCount, u16(before - 1));           // $2620A8 subq.w #1
    if (before === 0) {                                    // the BORROW case
      // `$2620B0 movea.l $8131C4,A0; $2620B4 jsr (A0)`. Sound is now a live
      // Game boundary, so execute the exact wrapper stored by the script.
      ctx.soundPost?.(call);
      ctx.scrollEvent?.({ op: 0x14, recTime: clock, kind: 'defer', call });
      ram.setU32(BGRAM.cueCall, 0);                        // $2620B6
    }
  }
}

/** `$261FDA` -- install both scripts' state blocks, then FALL THROUGH into
 *  `$26200E`.  There is no branch at `$26200C`: `dbra D1,$261FFA` is followed
 *  immediately by `tst.w $8130CE`.  READ PAST THE APPARENT END. */
function installScripts(ram, rom, ctx, a5, mut) {
  const pair = rom.u32(BGTAB.scriptPair + ram.u16(BGRAM.stageX4));  // $26152C
  for (let a = BGRAM.fastFwd; a < BGRAM.fastFwd + 56; a += 2) {     // $261FE0
    ram.setU16(a, 0);                                              // 28 words
  }
  for (let i = 0; i < 2; i++) {                                    // $261FF8
    const blk = i === 0 ? BGRAM.scr0 : BGRAM.scr1;
    const script = rom.u32(pair + i * 4);                          // $261FFA
    ram.setU32(blk + SB.obj, rom.u32(script));                     // $261FFC
    ram.setU32(blk + SB.cue, rom.u32(script + 4));                 // $262000
    ram.setU32(blk + SB.cur, script + 8);                          // $262004
  }
  fastForward(ram, rom, ctx, a5, mut);                             // FALL-THROUGH
}

/**
 * `$26200E` -- THE ENTRY CLOCK's fast-forward, and the reason the attract demo
 * shows the right 2,240 pixels.  The object is created with `($6,A5)` = 0 at a
 * stage start (`$25FD7A`) and `$0038` in attract, and the recon proved the
 * latter by alignment: the attract TSV does not align at ANY frame offset with
 * an entry clock of 0, and aligns at zero divergences with `$0038`.
 *
 * Three details a reader drops and all three are load-bearing:
 *   - `$813190` is set, so op $10 spawns NOTHING while replaying;
 *   - A3/A4 (the two column pointers) are SAVED and RESTORED, which undoes the
 *     rewind the replayed `04` performed;
 *   - `$81319E`/`$8131B6` -- the two blocks' ($c) rewind targets -- are cleared.
 */
function fastForward(ram, rom, ctx, a5, mut) {
  if (mut === 'no-fast-forward') { ram.setU16(BGRAM.fastFwd, 0); return; }
  if (ram.u16(BGRAM.clock) === 0) {                        // $26200E tst/beq
    ram.setU16(BGRAM.fastFwd, 0);                          // $26205A
    return;
  }
  ram.setU16(BGRAM.fastFwd, 1);                            // $262018
  const a3 = ram.u32(a5 + BGO.scr1Ptr);                    // $262020 / $262028 push
  const a4 = ram.u32(a5 + BGO.colPtr);                     // $262024 / $26202A push
  let d7 = 0;                                              // $26202C
  do {
    interpret(ram, rom, ctx, a5, d7, mut);                 // $26202E bsr $262068
    d7 = u16(d7 + 1);                                      // $262032
  } while (d7 !== ram.u16(BGRAM.clock));                   // $262034 cmp/bne
  ram.setU32(a5 + BGO.scr1Ptr, a3);                        // $26203C/$262040 pop
  ram.setU32(a5 + BGO.colPtr, a4);                         // $26203E/$262044
  ram.setU16(a5 + BGO.frozen, 0);                          // $26204A
  ram.setU32(BGRAM.scr0 + SB.rewind, 0);                   // $26204E $81319E
  ram.setU32(BGRAM.scr1 + SB.rewind, 0);                   // $262054 $8131B6
  ram.setU16(BGRAM.fastFwd, 0);                            // $26205A
}

// -------------------------------------------------------------- the object

/** `$26114C` -- the init.  Runs on the object's FIRST dispatch. */
export function backgroundInit(ram, rom, vram, ctx, a5, mut) {
  ram.setU16(BGRAM.clock, ram.u16(a5 + BGO.entryClock));   // $26114C -- BEFORE
  for (let a = 0x81316a; a < 0x81316a + 36; a += 2) {      // $261154, 18 words
    ram.setU16(a, 0);                                      // $81316A..$81318D
  }
  for (let i = 0; i < 15; i++) {                           // $261166, 15 LONGS
    ram.setU32(a5 + 4 + i * 4, 0);                         // ($4,A5)..($3F,A5)
  }
  camReset(ram);                                           // $261174
  ram.setU16(a5 + BGO.speedBg, 0x20);                      // $26117A -- 0.5 px/f
  ram.setU16(a5 + BGO.speedTx, 0x20);                      // $261180
  // ($20,A5) = (clock & 3) * 512.  `lsl.w #3` then `lsl.w #6` = <<9.
  const d0 = u16((ram.u16(BGRAM.clock) & 3) << 9);         // $261186..$261192
  ram.setU16(a5 + BGO.accCol, d0);                         // $261194
  // ...and D0 IS STILL THAT VALUE at the two jsrs.  Nothing zeroes it between
  // $261194 and $2611A6, so the initial column accumulator is also the first
  // step both cameras take.  It is 0 for entry clock 0 AND for the attract
  // demo's $0038 ($38 & 3 = 0), which is exactly why a reader would never
  // notice getting it wrong -- translate as written.
  camTxAccumulate(ram, d0, 0x800);                         // $261198 D1=$800
  camBgAccumulate(ram, d0, 0x800);                         // $2611A2 D1=$800
  ram.setU16(a5 + BGO.accTick, 0);                         // $2611AC
  const stage = ram.u16(BGRAM.stageX4);
  // W92: THE BACKGROUND PALETTE, and it was a counted note from W15 to W91.
  // `$2611B2 lea ($261252,PC),A0 / adda.w $813096,A0 / movea.l (A0),A0 /
  // moveq #$0,D0 / moveq #$1F,D1 / jsr $2415E8` -- thirty-two banks, the whole
  // middle third of palette RAM, out of one per-stage cartridge block.  This is
  // the LIVE site; `Game` also replays it at boot through `catchUpBgPalette`,
  // because on a mid-stage seed this init has already happened on the board.
  const bgBlock = rom.u32(BGTAB.palette + stage);
  if (ctx.palette) {
    install2415E8(ram, ctx.palette, 0, 0x1f, rom.bytes(bgBlock, 32 * 64),
      0x2611c4, `$${bgBlock.toString(16).toUpperCase()} ($261252[$${stage
        .toString(16).toUpperCase()}])`);                   // $2611C4
  } else {
    ctx.unportedLog.note(0x2415e8, `$2415E8 BG palette upload (block $`
      + `${bgBlock.toString(16).toUpperCase()}, D0=0 D1=$1F) -- no PaletteState `
      + `on this ctx, so the background third stays whatever it was`);
  }
  ram.bclr8(a5 + BGO.init2, 0);                            // $2611CA
  // colptr = stream + (clock >> 2) * 36   ($2611E0..$2611F2)
  let colptr = u32(rom.u32(BGTAB.colStream + stage)
    + ((ram.u16(BGRAM.clock) >>> 2) * 36));
  ram.setU16(a5 + BGO.cursor, 0);                          // $2611F4
  ram.setU32(a5 + BGO.colPtr, colptr);                     // $2611F8
  // $2611FC -- THE 15-COLUMN PRE-FILL.  Ring columns 0..14 regardless of the
  // clock; the ring cursor ends at $F.  `moveq #$e,D7` + `dbra` is FIFTEEN
  // iterations, not fourteen -- the classic dbra off-by-one, and the red switch
  // `prefill-14-columns` exists because it is invisible in the picture (the
  // fifteenth column is off-screen at the start) and moves $81318A forever.
  const nPre = mut === 'prefill-14-columns' ? 14 : 15;
  for (let col = 0; col < nPre; col++) {
    for (let row = 0; row < 9; row++) {
      writeMapLong(ram, rom, vram, row, col, rom.u32(colptr));
      colptr = u32(colptr + 4);
    }
    vram.columnsWritten++;
  }
  ram.setU32(a5 + BGO.colPtr, colptr);                     // $26121C
  ram.setU16(a5 + BGO.cursor, nPre);                       // $261220 -- $F
  installScripts(ram, rom, ctx, a5, mut);                  // $261226 (+$26200E)
  // $26122C `jsr $262316` -- clear the 8 element slots and install the per-stage
  // handler table pointer.  Both are pure state; the DRIVER is W18.
  for (let a = BGRAM.elemSlots; a < BGRAM.elemSlots + 260; a += 2) {
    ram.setU16(a, 0);                                      // $262320, 130 words
  }
  ram.setU32(BGRAM.elemTable, rom.u32(BGTAB.elemTable + stage));   // $262332
  ram.setU16(BGRAM.crossMode, 1);                          // $261232 -> $261116
  ram.setU16(BGRAM.crossRaw, 0);                           // $26111E
  ram.bset8(a5 + BGO.state, 2);                            // $261236
}

/**
 * `$2612A0` -- the per-frame handler.  The order below is the listing's and
 * every line of it is semantics: the interpreter runs BEFORE the accumulate, so
 * a SPEED record takes effect on its own frame; `$240B94` runs BEFORE the clock
 * tick and before the column write; the two mirrors `$81318A`/`$81318C` are
 * written AFTER the column, which is why they are the columns the gate compares.
 */
/**
 * `$261100` -- THE EXTERNAL SPEED PUSH, the writer side.  Three writes:
 *
 *   261100: move.w #$1,$813180
 *   261108: move.w D0,$813182
 *   26110E: move.w D1,$813184
 *   261114: rts
 *
 * `backgroundFrame` above has consumed those three words since W13
 * (`$2612AA`); until W31 nothing in the port PRODUCED them, so the arm was
 * live but unreachable.  **Nine callers in build B**, and the one this project
 * needs is `$26B73A` -- the stage-1 MIDBOSS, pushing D0 = D1 = `$0020` on the
 * frame its death countdown `($17,A5)` passes `$30`.
 *
 * THIS IS THE OWNER'S "minibosses stop the scroll", from the other end.
 * `20-OWNER-minibosses-stop-the-scroll.md` + W19 §2 established that a VM
 * FREEZE does not stop the scroll; the stage stops ADVANCING because a paired
 * op-`$04` repeats a column band with `loops = $FFFF`, and nothing inside the
 * VM can end it.  What ends it is this: the midboss dies, pushes speed `$0020`,
 * and `$2612BC`/`$2612C4` overwrite the parked background object's speed.  The
 * scroll VM is NOT a pure function of the script, and this three-instruction
 * routine is the whole of its input from the enemy system.
 */
export function pushExternalSpeed(ram, d0, d1) {
  ram.setU16(BGRAM.extSpeed, 1);                           // $261100
  ram.setU16(BGRAM.extSpeedBg, u16(d0));                   // $261108
  ram.setU16(BGRAM.extSpeedTx, u16(d1));                   // $26110E
}

export function backgroundFrame(ram, rom, vram, ctx, a5, mut, o = {}) {
  if (ram.u16(BGRAM.bgFreeze) !== 0) {                     // $2612A0 tst/bne
    // $2613A0 -- the element driver and the shake still run on a frozen frame.
    elementDriverAndShake(ram, rom, ctx);
    return;
  }
  if (ram.u16(BGRAM.extSpeed) !== 0) {                     // $2612AA
    // The EXTERNAL SPEED PUSH.  W17 measured it firing exactly ONCE in stage 1
    // (lf4377, clock $00F8, from $2610FE) and being a NO-OP, because it pushed
    // the $0020 the script had already set.  Ported because the port must not
    // be right by coincidence.
    ram.setU16(BGRAM.extSpeed, 0);                         // $2612B4
    ram.setU16(a5 + BGO.speedBg, ram.u16(BGRAM.extSpeedBg)); // $2612BC
    ram.setU16(a5 + BGO.speedTx, ram.u16(BGRAM.extSpeedTx)); // $2612C4
  }
  // $2612CC jsr $26146C -- the player-driven cross axis.
  //
  // `crossFromBoard` is NOT a mutation and NOT an optimisation: it is
  // `tools/scrollportgate.mjs` supplying `$81316E` as an INPUT, exactly the way
  // `scrollgate.py` supplies `$8130D2`.  That gate replays the scroll program
  // off a board TSV that carries no player position, so the routine cannot be
  // driven there; it IS driven, and compared, by `pgm.py flyaround`, whose
  // `scroll` ($813176) and `d16e` ($81316E) columns are claimed.  Two gates,
  // and each says out loud what it does not cover.
  if (o.crossFromBoard) {
    ctx.unportedLog.note(0x26146c, '$26146C the player-driven cross axis -- '
      + 'SUPPLIED FROM THE BOARD by this gate (it carries no player record); '
      + 'driven and compared by pgm.py flyaround instead');
  } else {
    crossAxis(ram, a5);
  }
  interpret(ram, rom, ctx, a5, ram.u16(BGRAM.clock), mut); // $2612D2 (D7 = $8130CE)
  const ext = ram.u16(BGRAM.extFreeze);                    // $2612D8
  if (ext !== 0) {                                         // never seen non-zero
    ram.setU16(BGRAM.extFreeze, 0);                        // $2612E2
    ram.setU16(a5 + BGO.frozen, ext === 1 ? 1 : 0);        // $2612E8..$2612F8
  }
  // THE MISREADING THIS SWITCH EXISTS FOR: "FREEZE stops the scroll".  It does
  // not -- ($8,A5) is read at $261324 ONLY, and $261308/$26133C/$26138A are
  // outside it.  With the switch on, a frozen background stops dead; without
  // it, it keeps scrolling and the op-$04 repeat loops the terrain, which is
  // what the stage-1 boss lock looks like on the board.  MEASURED: the port
  // free-run holds the boss-lock freeze from frame 7,317 and still advances
  // $80B012 by $162B00 and writes 710 more map columns by frame 13,000.
  if (mut === 'freeze-stops-the-scroll' && ram.u16(a5 + BGO.frozen) !== 0) {
    elementDriverAndShake(ram, rom, ctx);
    return;
  }
  const d6 = ram.u16(a5 + BGO.speedBg);                    // $2612FE ($1c,A5)
  let d5 = u16(ram.u16(a5 + BGO.accTick) + d6);            // $261302/$261306
  camBgAccumulate(ram, d6, ram.u16(BGRAM.crossDelta), mut);// $261308..$261314
  if (mut === 'clock-per-frame') {
    if (ram.u16(a5 + BGO.frozen) === 0) {
      ram.setU16(BGRAM.clock, u16(ram.u16(BGRAM.clock) + 1));
    }
  } else if (i16(d5) >= 0x200) {                           // $26131A cmpi/blt
    d5 = u16(d5 - 0x200);                                  // $261320
    if (ram.u16(a5 + BGO.frozen) === 0) {                  // $261324 tst/bne
      ram.setU16(BGRAM.clock, u16(ram.u16(BGRAM.clock) + 1)); // $26132C -- THE
    }                                                      // ODOMETER, +1 per
  }                                                        // $200 of scroll
  ram.setU16(a5 + BGO.accTick, d5);                        // $261332
  let d5c = u16(ram.u16(a5 + BGO.accCol) + d6);            // $261336/$26133A
  if (i16(d5c) >= 0x800) {                                 // $26133C cmpi/blt
    d5c = u16(d5c - 0x800);                                // $261344
    repeatStep(ram, a5, mut);                              // $261348 -- BEFORE
    let a0 = ram.u32(a5 + BGO.colPtr);                     // $26134E   the read
    vram.streamPtr = a0;                                   // W14 diagnostic
    const col = ram.u16(a5 + BGO.cursor);                  // $261352
    for (let row = 0; row < 9; row++) {                    // $261358 moveq #8,D6
      writeMapLong(ram, rom, vram, row, col, rom.u32(a0)); // $26135A/$26135C
      a0 = u32(a0 + 4);
    }
    vram.columnsWritten++;
    ram.setU32(a5 + BGO.colPtr, a0);                       // $261368
    ram.setU16(a5 + BGO.cursor, u16(col + 1) & 0x3f);      // $26136C/$26136E
  }
  ram.setU16(a5 + BGO.accCol, d5c);                        // $261376
  ram.setU16(BGRAM.ringCursor, ram.u16(a5 + BGO.cursor));  // $26137A
  ram.setU16(BGRAM.colAccum, ram.u16(a5 + BGO.accCol));    // $261382
  camTxAccumulate(ram, ram.u16(a5 + BGO.speedTx),          // $26138A..$26139A
    ram.u16(BGRAM.crossDelta), mut);
  elementDriverAndShake(ram, rom, ctx);
}

/** `$2613A0 jsr $26233A` + `$2613A6 jsr $260EC8` -- the element driver then
 *  the screen shake, run last in `$2612A0` and first in its frozen branch. */
function elementDriverAndShake(ram, rom, ctx) {
  elemDriver(ram, rom, ctx);                               // $2613A0 -> $26233A
  screenShake260EC8(ram, rom, ctx);
}

/** `$260EC8`, the screen-shake driver. Mode 1 is the stage-2 boss death's
 * exact 42-pair sequence; other modes remain explicitly counted. */
export function screenShake260EC8(ram, rom, ctx) {
  const mode = ram.u16(BGRAM.shakeMode);
  if (mode === 0) return;
  if (mode !== 1) {
    ctx.unportedLog.note(0x260ec8, `$260EC8 screen-shake mode ${mode} is not `
      + 'yet translated; mode 1 is complete');
    return;
  }
  const at = 0x260f4c + ram.u16(BGRAM.shakeCursor);
  const x = rom.u16(at), y = rom.u16(at + 2);
  if (x === 0 && y === 0) {
    ram.setU16(BGRAM.shakeMode, 0);
    ram.setU16(CAM.shakeX, 0);
    ram.setU16(CAM.shakeY, 0);
    ram.setU16(0x803934, 0);
    ram.setU16(0x803936, 1);
    return;
  }
  ram.setU16(CAM.shakeX, x);
  ram.setU16(CAM.shakeY, y);
  ram.setU16(BGRAM.shakeCursor, ram.u16(BGRAM.shakeCursor) + 4);
}

/**
 * `$26127A` -- object type 1's dispatch entry, and the three-frame warm-up
 * nobody would guess:
 *   frame 1  `bset #0,($3,A5)` was clear -> run the INIT and return
 *   frame 2  `btst #1` clear   -> `bset #1,($3,A5)` and return
 *   frame 3                     -> `bset #3,($3,A5)` and return
 *   frame 4+ `btst #3` set     -> the handler
 * A port that runs the handler on frame 2 is 2 frames of scroll ahead forever.
 */
export function makeBackground(rom, vram, opts = {}) {
  const mut = opts.mutate ?? null;
  return function backgroundObject(ram, a5, _slot, ctx) {
    if (ram.btst8(a5 + BGO.state, 3)) {                    // $26127A btst #3/bne
      backgroundFrame(ram, rom, vram, ctx, a5, mut, opts); // $2612A0
      return;
    }
    if (ram.bset8(a5 + BGO.state, 0) === 0) {              // $261284 bset/beq
      backgroundInit(ram, rom, vram, ctx, a5, mut);        // $26128A -> $26114C
      return;
    }
    if (ram.btst8(a5 + BGO.state, 1) === 0) {              // $26128E btst/beq
      ram.bset8(a5 + BGO.state, 1);                        // $2613AC
      return;
    }
    ram.bset8(a5 + BGO.state, 3);                          // $261298
  };
}

/** The columns `tools/scrollportgate.mjs` compares, by their board names. */
export function scrollVector(ram, video) {
  return {
    d0ce: ram.u16(BGRAM.clock),
    d18a: ram.u16(BGRAM.ringCursor),
    d18c: ram.u16(BGRAM.colAccum),
    b012: ram.u32(CAM.bgLong),
    b016: ram.u32(CAM.bgCross),
    b034: ram.u32(CAM.txLong),
    b038: ram.u32(CAM.txCross),
    b03c: ram.u32(CAM.txNegL),
    cur0: ram.u32(BGRAM.scr0 + SB.cur),
    cur1: ram.u32(BGRAM.scr1 + SB.cur),
    bgx: video.bg_xscroll,
    bgy: video.bg_yscroll,
  };
}
