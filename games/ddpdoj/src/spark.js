// THE SHOT'S IMPACT SPARK -- POOL E, `$289F54` + `$28A098`.  WAVE 53 (E5a).
//
// The owner is playing the live build: "Shooting enemies with bullets works,
// but you can't see the bullets and no explosions."  W52 made the bullets and
// the shots visible.  THIS is the first half of the explosions, and it is not
// the death explosion: it is the little flash where a bullet CONNECTS.
//
// `50-recon-effects` measured it as the highest-frequency effect in the game --
// 1,766 `$289F54` spawns against 382 `$289004` death effects over the same
// 6,185 frames, 4.6x -- and recommended it be moved to the FRONT of E5 for that
// reason.  [M] W53 re-measured on the shipped seed: **1,393 spawns in 2,204
// tapped frames, 0 in the no-fire control**, i.e. 0.63 per frame against recon
// 50's 0.29.  The rate went UP because recon 50 ran `--no-pods`, and L3 gave the
// OPTION PODS live shots that hit things (W52 §0.1's own correction, one level
// on).  See `docs/worklog/ddpdoj/53-impl-E5a-spark.md` §0.
//
// ========================= FIVE POOLS, AND THIS IS ONE =====================
//
// `50-recon-effects` §1 enumerates five contiguous effect pools in
// `$8171BE..$81DB8D`.  **This file is pool E and NOTHING ELSE.**  It does not
// touch pool B (`$289004`/`$288E4E`), pool D (`$289098`/`$2890F2`) or the impact
// pool A (`$27F8F8`/`$27F95A`), all of which are still counted notes.  Pool E is
// the one that can ship alone, because it is the only one of the five whose
// ALLOCATOR AND DRIVER ARE BOTH IN THIS FILE.  W33's leak -- a producer with no
// consumer, silently discarding after N spawns -- is what happens when they are
// separated, and `50-recon` §4.2 shows it happening one level DOWN in pool D.
//
//   THE DRAIN PROOF, in the ROM, three ways (§THE DRIVER below has the code):
//     1. `$28A164 bcs $28A1A0` -- the animation cursor `($10,A6)` counts DOWN by
//        4 every frame from at most $8C and FREES the slot when it borrows.  A
//        spark therefore lives AT MOST 36 frames no matter what else happens.
//     2. `$28A17E bcc $28A1BC` -- the off-screen cull frees it sooner.
//     3. `$28A0FE beq $28A116` -- the 208-record per-frame budget frees it
//        sooner still (unreachable here: the pool is 60 slots).
//   All three do `clr.w` on the record's word 0 AND `subq.w #1,$81DB8C`.  There
//   is no path that consumes a slot without one of the three eventually
//   releasing it, and [M] the measurement in the worklog is the census.
//
// ============================== THE GEOMETRY ================================
//
// [M] read out of instructions this session; every arithmetic closes EXACTLY on
// the next landmark, which is what makes it a geometry and not a reading:
//
//   $81D394  P1's 30 slots x $22 = 1,020 -> $81D790, P2's base       EXACT
//   $81D790  P2's 30 slots x $22 = 1,020 -> $81DB8C, the count word  EXACT
//   $81DB8C  the LIVE COUNT.  $28A0B0 reads it, three sites decrement it
//   $81DB8E  the per-frame RECORD BUDGET, reloaded to $D0 every frame
//   $289F3A  clears $3FE words = 2,044 B from $81D394 = both halves PLUS both
//            count words.                                            EXACT
//
// **$28A098 WALKS P1 AND P2 AS ONE 60-SLOT ARRAY** off the single count word:
// `$28A0E6 lea $81D394,A6` and nothing ever reloads A6 from `$81D790`.
//
// ============================ THE RECORD, $22 BYTES ========================
//
// Every offset below is an instruction read this session.  Note that the DRIVER
// has already advanced A6 by 4 (two `(A6)+` reads) before it dispatches, so
// every displacement in `$28A132`/`$28A150`/`$28A15C` is relative to rec+4 --
// getting that wrong shifts the whole map by two fields and it is the single
// easiest mistake in this file.
//
//   +$00 w  STATUS.  `ori.w #$8000,D3` | the KIND ($14 for the shot spark).
//           ZERO = free; all three free paths `clr.w` it.
//   +$02 w  THE EMITTER SELECTOR -- a raw BYTE offset into the 4-entry table
//           $28A140.  $000C for every one of the 15 spark templates.
//   +$04 l  POSITION.  hi word = long axis, lo word = short axis.
//   +$08 l  THE SPRITE DESCRIPTOR, re-pointed every frame from the list.
//   +$0C w  display-list word 4 (width bits 14..9, height bits 8..0) = $0208.
//   +$0E w  display-list word 5: flip (bits 14,13) + colour.  $001E, plus
//           $2000 when `$242FFC` draws a zero.
//   +$10 w  NOT WRITTEN BY THE FILL ($28A214 `addq.w #2,A0` steps over it).
//   +$12 b  delay counter A;  +$13 b its reload.  Both $00 in every spark
//           template, so A borrows EVERY frame -- see $28A132.
//   +$14 w  THE ANIMATION CURSOR, a byte offset counting DOWN by 4.
//   +$16 l  the DESCRIPTOR LIST pointer ($28A5C2 for all 15 spark templates).
//   +$1A b  delay counter B;  +$1B b its reload.  $0E and $06.
//   +$1C l  VELOCITY, hi = long axis, lo = short.  Written by the fill TAIL.
//   +$20 w  NEVER WRITTEN BY ANYTHING.  Left over from the slot's last tenant.
//
// ========================== WHAT IS *NOT* IN THIS WAVE =====================
//
// [M] `xref.py callers 289F54` finds **EIGHT** absolute-long sites, not the two
// recon 50 counted, and all eight pass the same `moveq #$14,D0`:
//
//   $253C1A  dispatch [0] $253B1E   PORTED, and one of the two this wave runs
//   $253EF8  dispatch [2] $253E34   PORTED, the other
//   $253DB6  dispatch [9] $253D52   unported -- the handler throws by address
//   $25401A  dispatch [3] $253F56   unported
//   $254176  dispatch [4] $254078   unported (the LASER's shot, W52 §0.1)
//   $2542BA  dispatch [5] $2541BC   unported
//   $2543E4  dispatch [6] $254300   unported
//   $25450E  dispatch [7] $25442A   unported
//
// so **2 of 8 call sites are reachable and 6 are behind loud named throws** --
// which is the honest coverage sentence, not "both sites ported".
//
// AND THREE MORE PRODUCERS FILL THIS POOL, all of them the LASER's, all of them
// inside code W45 ALREADY PORTED:
//
//   $25485E jsr $289F96   inside $254680, the beam's segment driver  UNPORTED
//   $255066 jsr $289FC0   inside $255042, the beam's draw            W90
//   $2550F0 jsr $289FDA   inside $255042                             W90
//
// They read a DIFFERENT template ($28A506) and a DIFFERENT 36-entry descriptor
// list ($28A51C, streams $22C6BC..$22C860 step $C, DESCENDING).
//
// ===================== WAVE 90: TWO OF THE THREE NOW RUN ====================
//
// W86 §6.3 named `$289FC0`/`$289FDA` as the OTHER HALF of the owner's "the
// laser shoots through them": W86 made the fighter DIE, and this makes the beam
// SHOW that it connected.  [M] W86 counted the pair reached 1,789 times in
// 6,500 steps as a note.
//
// **THE HEADS ARE SEVEN INSTRUCTIONS AND THE WORK IS AT THE OTHER END**, which
// is why this wave is small and why reading only the label would have missed
// it.  Both heads `bra $28A060` into the shared tail with D0 = 0 -- KIND 0 --
// so their fill tail is `$28A232[0]` = `$28A252`, **the one W65 already
// transcribed for the LASER BOMB**.  What was missing is the arm INSIDE it that
// `$289FF4` can never take:
//
//   $28A288 tst.w D7 / $28A28A bmi $28A2A8     <- $289FF4 sets D7 := $FFFF and
//                                                 goes here.  W65's arm.
//   $28A28C beq $28A296                        <- $289FC0 sets D7 := 0
//   $28A28E move.w $81046A,D1                  <- $289FDA sets D7 := 1  (P2)
//   $28A296 move.w $810408,D1                  <- ...P1
//   $28A29C lea $28A2D6,A2 / adda.w D1,A2 / move.w (A2),D0 / bra $28A2C0
//
// **SO D7 IS THE PLAYER, TWICE OVER**: it picks the pool half at the head AND
// the power word here, and the two must agree.  And D1 -- the LASER POWER WORD,
// `+= 2, refuse at 8` (`src/items.js` POWER) -- is a RAW BYTE OFFSET into a
// word table, so the impact effect's speed is **32 / 64 / 96 / 128 / 176, one
// per power step**.
//
// [M] AND THE TABLE IS FIVE WORDS, NOT EIGHT.  This file said "the eight-word
// table $28A2D6" from W53 until W90 measured it, and that is the eighth comment
// on this project to have been wrong or ignored.  The far end is pinned by the
// cartridge's own dispatch: [M] `$28A232[1]` -- fill tail entry 1 -- IS
// `$28A2E0`, and `$28A2E0` is `addq.w #$6,A0 / rts`, the NULL fill tail (it
// walks A0 from rec+$1C to rec+$22 and returns).  The sixth "word" is an
// instruction the cartridge names as code.  From the other side the power word
// caps at 8.  `tools/export-tables.py beam_impact_speed_indices` asserts both.
//
// THE ARM ALSO SKIPS `$28A2A8..$28A2BC`, and that is a semantic difference a
// tidy port loses: the bomb's arm writes `move.b D3,(-$11,A0)` -- rec+$0F, the
// LOW BYTE of the attribute -- and the impact's arm never reaches it.  So an
// impact spark keeps the whole attribute word `$28A210` wrote, and a bomb spark
// does not.
//
// STILL UNPORTED, and named rather than left to look done: **`$289F96`**, the
// beam's SEGMENT driver's producer ($25485E).  It shares this template and this
// list, so its ART is in the bundle from this wave, but it differs in the one
// field that matters -- `moveq #$1,D1`, i.e. it allocates TWO records per call
// -- and it picks its pool half from `($1A,A6)` rather than from D7.  It is a
// counted note in `src/laser.js`.
//
// `$28A1DA`'s fill dispatch `$28A232` has EIGHT entries; only entry 5 (D0 = $14)
// is transcribed.  The other seven throw by address.
//
// $28C714 -- which `src/shots.js` called "the shot's impact BURST" one
// instruction after this one -- is a SOUND CUE, not a visual (`50-recon` §2.5,
// re-read here: `$28C722 move.w #$24,D0 / #$62,D1 / #$3,D2 / jsr ($28C0AE,PC)`,
// the same shape as `$28C3BA`, which this port already labels the fire sound).
// Its note is corrected in `src/shots.js`; it is not this wave's work.

import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import { BUCKETS, ENQUEUE_MASK, NO_ZOOM_OR } from './spritequeue.js';
import {
  drawByte242E24, drawSigned242FFC, drawByte28ABE0,
  drawWord242EC2, drawByte28AB86, drawByte24311A,
} from './rng.js';

export const SPARK = {
  p1Base: 0x81d394,        // $289F7C / $28A0E6 lea
  p2Base: 0x81d790,        // $289F8C lea
  stride: 0x22,            // $28A070 lea ($22,A0),A0
  perPlayer: 30,           // $28A060 moveq #$1D,D2 (+1)
  perPlayerNarrow: 15,     // $28A06A moveq #$E,D2 (+1), when $81308C == 0
  slots: 60,               // $28A098 walks P1 and P2 as ONE array
  count: 0x81db8c,         // $28A0B0 move.w $81DB8C,D7
  budget: 0x81db8e,        // $28A09A move.w #$D0,$81DB8E
  budgetReload: 0xd0,      // ...that $D0
  clearWords: 0x3fe,       // $289F40 move.w #$3FD,D0 + the dbra's own pass
  gateAlloc: 0x813098,     // $289F54 tst.w -> FAIL RETURN (carry set)
  gateWidth: 0x81308c,     // $28A062 tst.w -> 30 slots vs 15
  bucket: 20,              // $28A0EC lea $808FA4,A4 / $28A1B4 move.w A4,$80AFDE
  emitTable: 0x28a140,     // 4 entries, 3 distinct: $28A132 $28A150 $28A15C $28A150
  ptrTable: 0x28a786,      // 256 longs, indexed by $803916 * 4.  See below.
  fillTable: 0x28a232,     // $28A222 lea -- 8 entries, indexed by D0 (the kind)
  kindSpark: 0x14,         // every one of the eight $289F54 sites: moveq #$14,D0
  cullY: 0x7000,           // $28A0CA move.w #$7000,D5 / swap -- D5's HIGH word
  posShift: 6,             // $28A0D6 moveq #$6,D4 -> $28A180 asr.l D4,D0
  p1PlayerRec: 0x8103e6,   // $289F82 cmpa.l #$8103E6,A4
  // ------------------------------------------------------------------ WAVE 90
  beamImpactTpl: 0x28a506,   // $289FC6/$289FE0 lea $28A506(PC),A2 -- ONE template
  beamImpactList: 0x28a51c,  // ...which is $28A506+$16, its own +$10 long
  speedByPower: 0x28a2d6,    // $28A29C lea, indexed by the POWER WORD as BYTES
  speedByPowerEntries: 5,    // [M] $28A2E0 is fill tail $28A232[1] -- CODE
  p1Power: 0x810408,         // $28A296 move.w $810408,D1   (D7 == 0)
  p2Power: 0x81046a,         // $28A28E move.w $81046A,D1   (D7 > 0)
};

/** `$289FC0` and `$289FDA`, the two heads, and the fields they differ in.
 *  Exported so `tests/` and `tools/export-tables.py` name them once. */
export const BEAM_IMPACT = Object.freeze([
  { at: 0x289fc0, caller: 0x255066, base: SPARK.p1Base, d7: 0, power: SPARK.p1Power },
  { at: 0x289fda, caller: 0x2550f0, base: SPARK.p2Base, d7: 1, power: SPARK.p2Power },
]);

/** Record offsets, from the slot base.  See the map in the header. */
export const E = {
  status: 0x00, selector: 0x02, pos: 0x04, descriptor: 0x08,
  size: 0x0c, attr: 0x0e, delayA: 0x12, delayAReload: 0x13,
  cursor: 0x14, list: 0x16, delayB: 0x1a, delayBReload: 0x1b, vel: 0x1c,
};

// ============================== THE ALLOCATOR ===============================
//
//   289f54: tst.w $813098 / bne $289F4E      <- $289F4E is `ori #1,SR / rts`,
//                                              i.e. A REPORTED FAILURE.  Unlike
//                                              $289004, which returns a BIT
//                                              BUCKET its caller cannot detect
//                                              (50-recon §4.1), this allocator
//                                              sets the carry.  The port counts
//                                              both failure arms anyway.
//   289f5c: movem.l D0-D7/A0-A6,-(A7)
//   289f60: moveq #$0,D1                     <- D1 = "allocate D1+1 records"
//   289f62: addq.b #1,$803917                <- THE SHARED RNG COUNTER, bumped
//                                              before anything else.  This is
//                                              the site `src/rng.js`'s header
//                                              has named as the reason $803916
//                                              is a COMPARED column since W8 --
//                                              and until this wave the port did
//                                              not bump it, so every draw after
//                                              a shot hit was one step out.
//   289f68: move.w $803916,D5 / add.w D5,D5 / add.w D5,D5    D5 = state * 4
//   289f72: lea ($28A786,PC),A2 / movea.l (A2,D5.w),A2       <- NO MASK
//   289f7c: lea $81D394,A0 / cmpa.l #$8103E6,A4 / beq $28A060
//   289f8c: lea $81D790,A0 / bra $28A060
//
// **THE POINTER TABLE IS 256 ENTRIES AND ITS FAR END IS PINNED BY CODE.**  The
// index is `$803916 * 4` with NO mask -- the same unmasked read `$242FDE` makes
// (`src/rng.js` RNG_242FDE), in range only because `$23BE36 clr.w $803916`
// zeroes the high byte and `addq.b` never carries into it.  [M]
// `$28A786 + 256*4 == $28AB86`, which is `addq.b #1,$803917` -- code.  EXACT.
// [M] the 256 entries resolve to **15 DISTINCT templates**, each named 16 times
// except `$28A6D6`, which is named 32.

/** `$289F3A` -- clear the WHOLE pool, both halves and both count words.
 *  `$25FD58` and `$28B5CC` call it; `$28B5CC` is inside object type 5's
 *  "not started" branch, which `src/type5.js` throws for, so nothing in the
 *  port reaches this today.  It is here because a pool that survives a reset it
 *  should not is `50-recon` §4.3 item 6's named hazard. */
export function clearPool(ram) {
  for (let i = 0; i < SPARK.clearWords; i++) {           // $289F44 dbra
    ram.setU16(SPARK.p1Base + i * 2, 0);
  }
}

/**
 * `$28A1DA` -- fill ONE slot from the ROM template.  A0 = the slot, A2 = the
 * template, A6 = THE SPAWNER'S RECORD (the shot), D0 = the kind.
 *
 * Returns the byte offset A0 has reached, which the caller uses as the NEXT
 * slot's base: the fill leaves A0 at rec+$1C and the fill TAIL walks it on to
 * rec+$22 exactly ($28A3CA `addq.w #2,A0` after two `move.w (A0)+`).  That is
 * not an accident -- it is what lets `$28A08A dbra D2,$28A06C` keep scanning
 * from the right place when D1 asks for a second record.
 */
function fillSlot(ram, rom, ctx, slot, tpl, spawner, d0, d7 = 0) {
  //                                                 $28A1DC move.w D0,D3
  ram.setU16(slot + E.status, u16(d0 | 0x8000));   // $28A1DE ori.w #$8000
  ram.setU16(slot + E.selector, rom.u16(tpl));     // $28A1E4 move.w (A2)+,(A0)+
  // $28A1E6..$28A1F4: the spawner's position PLUS the template's two offsets.
  ram.setU16(slot + E.pos, u16(ram.u16(spawner + 2) + rom.u16(tpl + 2)));
  ram.setU16(slot + E.pos + 2, u16(ram.u16(spawner + 4) + rom.u16(tpl + 4)));
  // $28A1F6 addq.w #4,A0 -- +$08..$0B (the descriptor) is NOT initialised here.
  // The driver writes it on the record's very first frame, out of the list.
  ram.setU16(slot + E.size, rom.u16(tpl + 6));     // $28A1F8 move.w (A2)+,(A0)+
  // $28A1FA..$28A20C -- the attribute, and the ONE branch this wave transcribes
  // without exercising: every spark template's word is $001E, i.e. POSITIVE.
  let d3 = rom.u16(tpl + 8);                       // $28A1FA move.w (A2)+,D3
  if (d3 & 0x8000) {                               // $28A1FC bpl $28A204
    d3 = ram.u8(spawner + 0x1d);                   // $28A1FE moveq #0 / move.b
  }
  if (drawSigned242FFC(ram, rom) === 0) {          // $28A204 jsr / $28A20A bne
    d3 = u16(d3 | 0x2000);                         // $28A20C ori.w #$2000,D3
  }
  ram.setU16(slot + E.attr, d3);                   // $28A210 move.w D3,(A0)+
  // $28A212 addq.w #2,A2 -- template word 5 ($1E1D) is SKIPPED, never read.
  // $28A214 addq.w #2,A0 -- record +$10 is SKIPPED, never written.
  // $28A216: ONE longword covering +$12/+$13 (delay counter A and its reload)
  // AND +$14/+$15 (the animation cursor).  Reading it as two words is how the
  // cursor ends up stale.
  ram.setU32(slot + E.delayA, rom.u32(tpl + 0x0c));      // $28A216 move.l (A2)+,(A0)+
  ram.setU32(slot + E.list, rom.u32(tpl + 0x10));        // $28A218 move.l (A2)+,(A0)+
  ram.setU16(slot + E.delayB, rom.u16(tpl + 0x14));      // $28A21A move.w (A2)+,(A0)+
  ram.setU16(SPARK.count, u16(ram.u16(SPARK.count) + 1)); // $28A21C addq.w #1
  // $28A222 lea ($28A232,PC),A2 / adda.w D0,A2 / movea.l (A2),A2 / jmp (A2)
  // $28A222 lea ($28A232,PC),A2 / adda.w D0,A2 / movea.l (A2),A2 / jmp (A2).
  // W53 transcribed entry 5 ($14, the shot spark); **W65 adds entry 0**, which
  // is the one and only kind `$289FF4` passes ($28A012 moveq #$0,D0) and so the
  // one the LASER BOMB reaches.  The remaining six still throw by address.
  if (d0 === 0) return fillTail28A252(ram, rom, ctx, slot, d7);   // $28A232[0]
  if (d0 !== SPARK.kindSpark) {
    unreached(SPARK.fillTable + d0,
      `$28A22C jmp (A2) -- pool E's fill tail for kind $${d0.toString(16)
        .toUpperCase()} (entry ${d0 / 4} of the eight at $28A232). W53 `
      + `transcribed entry 5 ($14, every $289F54 site) and W65 entry 0 `
      + `($289FF4, the LASER BOMB's). The other six belong to $289F96 / `
      + `$289FC0 / $289FDA -- the BEAM's three producers -- which no wave has `
      + `ported`);
  }
  return fillTail28A39E(ram, rom, ctx, slot, spawner);
}

/**
 * `$28A252` -- the fill tail for kind **0**, i.e. THE LASER BOMB'S SPARK.
 * `$28A232[0]`, reached by `$28A1DA`'s `jmp (A2)` and returning to `$28A1DA`'s
 * CALLER (`$28A2D2 movea.l (A7)+,A2` pops the A2 `$28A1DA` pushed at its own
 * first instruction -- the same continuation shape as `$28A39E`).
 *
 *   28a252: movem.l D0-D2,-(A7)
 *   28a256: moveq #$18,D3
 *   28a258: jsr $242EC2 / bpl $28A262 / moveq #$28,D3
 *   28a262: bsr $28AB86 / add.b D3,D1 / andi.b #$3F,D1      the ANGLE
 *   28a26c: jsr $242E24 / addq.b #4,D0                      the SPEED
 *   28a274: move.w D1,-(A7)                                 <- the angle, SAVED
 *   28a276: jsr $241812 -> D2,D3
 *   28a27c: move.w D2,(A0)+ / move.w D3,(A0)+   the velocity, rec+$1C/+$1E
 *   28a280: add.w D2,(-$1c,A0)                  rec+$04 nudged by the LONG axis
 *   28a284: move.w #$C0,D0                      <- A SECOND SPEED, and it is
 *                                                  the CONSTANT $C0 = 192
 *   28a288: tst.w D7 / bmi $28A2A8              <- D7 is the CALLER's
 *   28a2a8: moveq-style #$2,D3 / btst #$7,$811F73 / #$3,D3
 *   28a2bc: move.b D3,(-$11,A0)                 rec+$0F, the attribute's LOW byte
 *   28a2c0: move.w (A7)+,D1 / jsr $241812       the SAME angle, speed $C0
 *   28a2c8: add.w D3,(-$1a,A0)                  rec+$06 nudged by the SHORT axis
 *   28a2cc: addq.w #2,A0                        -> rec+$22, THE NEXT SLOT
 *
 * **THREE THINGS A TIDY PORT GETS WRONG HERE.**
 *
 *  1. `$28A25E bpl.b` tests D0 after `$242EC2`, and `$242EC2` has **no
 *     `ext.w`** (`$242FDE` does; this one ends `move.b (A0,D0.w),D0 / rts`).
 *     So D0's high byte is `$803916`'s, which is 0, and bit 15 is ALWAYS
 *     clear -- `moveq #$28,D3` is unreachable while that holds.  Both arms are
 *     transcribed; `src/rng.js` `drawWord242EC2` returns the whole word so the
 *     test is a real test and not a constant this file decided.
 *  2. **`$241812` IS CALLED TWICE WITH THE SAME ANGLE AND TWO DIFFERENT
 *     SPEEDS**, and only the FIRST call's result reaches the velocity.  The
 *     second call's D3 nudges rec+$06 and its D2 is discarded.  A port that
 *     called it once and reused D2/D3 would be one `$241812` short and would
 *     also leave `$803916` -- no; `$241812` does not draw.  But it would put
 *     the wrong short-axis nudge on every spark.
 *  3. `$28A2BC move.b D3,(-$11,A0)` lands on rec+$0F -- the **LOW byte of the
 *     attribute word** `E.attr` (+$0E) that `$28A210` has just written in full.
 *     It is a partial overwrite of a field, not a field of its own.
 *
 * @param d7 the caller's D7.  `$289FF4` sets `$FFFF` ($28A00E), which is the
 *        only value this port produces, so `$28A28C beq` and `$28A28E`'s
 *        `$81046A`/`$810408` arm are transcribed and THROW.
 * @returns {number} A0 after the tail, i.e. the next slot's base.
 */
function fillTail28A252(ram, rom, ctx, slot, d7) {
  let d3 = 0x18;                                   // $28A256 moveq #$18,D3
  const draw = drawWord242EC2(ram, rom);           // $28A258 jsr $242EC2
  if ((draw & 0x8000) !== 0) d3 = 0x28;            // $28A25E bpl / $28A260
  let d1 = drawByte28AB86(ram, rom);               // $28A262 bsr $28AB86
  d1 = ((d1 + d3) & 0xff) & 0x3f;                  // $28A266 add.b / $28A268 andi.b
  let d0 = (drawByte242E24(ram, rom) + 4) & 0xff;  // $28A26C jsr / $28A272 addq.b
  const v = ctx.tables.vector(d0, d1);             // $28A276 jsr $241812
  ram.setU16(slot + E.vel, u16(v.dy));             // $28A27C move.w D2,(A0)+
  ram.setU16(slot + E.vel + 2, u16(v.dx));         // $28A27E move.w D3,(A0)+
  // A0 is now slot+$20, so (-$1c,A0) is slot+$04 -- E.pos, the LONG axis.
  ram.setU16(slot + E.pos, u16(ram.u16(slot + E.pos) + v.dy));   // $28A280
  d0 = 0xc0;                                       // $28A284 move.w #$C0,D0
  if ((d7 & 0x8000) === 0) {
    // ------------------------------------------------------------- WAVE 90
    // $28A28C..$28A2A6 -- the arm $289FF4 can NEVER take, because $28A00E sets
    // its D7 to $FFFF.  $289FC0 (D7 = 0) and $289FDA (D7 = 1) are its only
    // producers, and D7 is the PLAYER: it picked the pool half at the head and
    // it picks the power word here.
    //
    // THE POWER WORD IS A RAW BYTE OFFSET WITH NO MASK AND NO RANGE CHECK.
    // $810408/$81046A are `+= 2, refuse at 8` ($252C96/$252C9C), so the domain
    // is {0,2,4,6,8} and $28A2D6's five words are exactly it.  A power outside
    // that would read $28A2E0 -- `addq.w #$6,A0`, fill dispatch entry 1, CODE
    // -- as a speed.  That is a LOUD NAMED THROW here and not a clamp: the
    // cartridge would take the wrong number and this port says so instead.
    const d1p = ram.u16(d7 === 0 ? SPARK.p1Power : SPARK.p2Power); // $28A28E/$28A296
    if ((d1p & 1) !== 0 || d1p > (SPARK.speedByPowerEntries - 1) * 2) {
      unreached(0x28a29c, `$28A2A2 adda.w D1,A2 -- the laser POWER word `
        + `$${(d7 === 0 ? SPARK.p1Power : SPARK.p2Power).toString(16)
          .toUpperCase()} reads $${d1p.toString(16).toUpperCase()}, and it is a `
        + `RAW BYTE OFFSET into the FIVE-word table $28A2D6. $252C96/$252C9C `
        + `make that word "+= 2, refuse at 8", so 0/2/4/6/8 is its whole `
        + `domain; $28A2E0 -- the next word -- is fill dispatch $28A232's `
        + `entry 1, \`addq.w #$6,A0 / rts\`, i.e. CODE, and the board would `
        + `take an instruction as a speed`);
    }
    d0 = rom.u16(SPARK.speedByPower + d1p);        // $28A2A4 move.w (A2),D0
    // $28A2A6 bra $28A2C0 -- and it JUMPS $28A2A8..$28A2BC, so the impact
    // spark never gets the bomb's `move.b D3,(-$11,A0)` partial overwrite of
    // rec+$0F.  Its attribute word stays exactly what $28A210 wrote.
    //
    // D1 IS THE ANGLE AGAIN HERE, NOT THE POWER.  The ROM clobbers D1 with the
    // power word at $28A28E/$28A296 and then RESTORES the angle at `$28A2C0
    // move.w (A7)+,D1` off the push `$28A274` made.  Keeping the power in its
    // own variable is that pop; reusing `d1` would hand $241812 the power as a
    // heading and every impact spark would fly the same way.
    const vBeam = ctx.tables.vector(d0, d1);       // $28A2C0/$28A2C2 jsr $241812
    ram.setU16(slot + E.pos + 2,
      u16(ram.u16(slot + E.pos + 2) + vBeam.dx));  // $28A2C8 add.w D3,(-$1a,A0)
    return slot + SPARK.stride;                    // $28A2CC addq.w #2,A0
  }
  d3 = ram.btst8(0x811f73, 7) ? 3 : 2;             // $28A2A8/$28A2AC/$28A2B8
  ram.setU8(slot + E.attr + 1, d3);                // $28A2BC move.b D3,(-$11,A0)
  const v2 = ctx.tables.vector(d0, d1);            // $28A2C0/$28A2C2 jsr $241812
  ram.setU16(slot + E.pos + 2, u16(ram.u16(slot + E.pos + 2) + v2.dx));  // $28A2C8
  return slot + SPARK.stride;                      // $28A2CC addq.w #2,A0
}

/** `$28A030` -- `$289FF4`'s THREE template pointers.  `[M]` entry 3 reads
 *  `$48E7FFFE`, which is `movem.l D0-D7/A0-A6,-(A7)` -- i.e. `$289FF4` itself.
 *  The index is `$24311A`'s canned byte doubled twice, and `[M]` every byte of
 *  `$243174` is 0, 1 or 2, so the table's three entries are exactly its
 *  domain.  `check_beam_bomb_extents` asserts both facts on every export. */
export const BEAM_SPARK_TEMPLATES = { table: 0x28a030, entries: 3 };

/**
 * `$289FF4` -- **THE LASER BOMB'S SPARK**, `$256162 jmp $289FF4`.
 *
 * It is `$289F54`'s sibling and it differs in four ways that all matter:
 *
 *  1. **NO `$813098` GATE.**  `$289F54` opens `tst.w $813098 / bne $289F4E`
 *     (a reported failure).  `$289FF4` has no such test, so a bomb spark is
 *     allocated on loop 2+ where a shot spark is not.
 *  2. **THE TEMPLATE COMES FROM `$24311A`, NOT FROM `$803916 * 4`.**  Three
 *     templates ($28A030) against `$289F54`'s 256 pointers ($28A786).
 *  3. **THE POOL HALF IS PICKED BY THE BOMB RECORD**, `$28A01A btst #$7,
 *     $811F73` -- the record's own P2 bit -- and not by comparing A4 against
 *     `$8103E6`.  So a P2 laser bomb's sparks land in P2's 30 slots even
 *     though nothing about the CALLER says which player it is.
 *  4. **D7 := `$FFFF`** (`$28A00E`), which is what routes `$28A252` to its
 *     `$28A2A8` arm.
 *
 * From `$28A060` on it is byte-for-byte `$289F54`'s tail, so this function and
 * `spawnSpark` share it below rather than duplicating it.
 *
 * @param spawner A6 at the `jmp`.  `[M]` `$255FE2` has walked A6 forward three
 *        times by then (`$256136 lea $7E0`, `$256146 lea $30`, `$256150 lea
 *        $30`), so it is **record 44**, `$811F72 + $840 = $8127B2`, and NOT the
 *        `$811F72` the driver started with.  The caller passes it rather than
 *        this file assuming it, because that walk is the caller's.
 * @returns {boolean} false on the "no free slot" failure return.
 */
export function spawnBeamBombSpark289FF4(ram, rom, ctx, spawner) {
  const kind = drawByte24311A(ram, rom);                  // $289FFA jsr $24311A
  const idx = u16(u16(kind + kind) + u16(kind + kind));   // $28A000/$28A002 add.w
  if (kind >= BEAM_SPARK_TEMPLATES.entries) {
    unreached(0x28a00c, `$28A00C movea.l (A2),A2 -- $24311A returned `
      + `${kind}, so $28A030 + ${idx} is read as a template pointer, and the `
      + `table has only ${BEAM_SPARK_TEMPLATES.entries} entries ($28A03C is `
      + `$48E7FFFE -- CODE). Every byte of $243174 is 0, 1 or 2 in the `
      + `cartridge; this one is not`);
  }
  const tpl = rom.u32(BEAM_SPARK_TEMPLATES.table + idx);  // $28A00C movea.l (A2)
  const p2 = ram.btst8(0x811f73, 7);                      // $28A01A btst #$7
  return poolETail(ram, rom, ctx, p2 ? SPARK.p2Base : SPARK.p1Base,
    tpl, spawner, 0, 0xffff, 0x289ff4);                   // $28A00E move.w #$FFFF
}

/**
 * `$289FC0` (P1) and `$289FDA` (P2) -- **THE LASER'S IMPACT EFFECT**, W90.
 *
 * Seven instructions each, and they differ in exactly two fields:
 *
 *   289fc0: movem.l D0-D7/A0-A6,-(A7)
 *   289fc4: moveq #$0,D1              ONE record ($289F96 says #$1 -- TWO)
 *   289fc6: lea ($28A506,PC),A2       the template, an IMMEDIATE, not a table
 *   289fcc: moveq #$0,D0              KIND 0 -> fill tail $28A252 (W65's)
 *   289fce: lea $81D394,A0            <- THE POOL HALF   } the two
 *   289fd4: moveq #$0,D7              <- THE PLAYER      } that differ
 *   289fd6: bra $28A060               the shared tail
 *
 * **THERE IS NO `$813098` GATE**, exactly as `$289FF4` has none and `$289F54`
 * does -- so an impact spark is allocated on loop 2+ where a shot spark is not.
 *
 * **AND THERE IS NO GATE IN HERE AT ALL.**  Everything that decides whether the
 * beam flashes is at the CALL SITE, `$25504E..$255064` in `src/laser.js`, and
 * the middle one of its three conditions is `$80390C` -- the per-frame
 * alternation word.  P1's block runs on the frames it is NON-zero and P2's on
 * the frames it is zero.  **That is the owner's "sometimes".**
 *
 * @param spawner the ROM's A6 at the `jsr`: `$811F32` (P1) or `$811F52` (P2),
 *        the BEAM BLOCK.  `$28A1E6` reads its +$2/+$4 as the spark's position
 *        and, because this template's attribute word is $FFFF (negative),
 *        `$28A1FE` reads its +$1D as the COLOUR.  The caller passes it rather
 *        than this file assuming it, exactly as `spawnBeamBombSpark289FF4` does.
 * @param at WHICH HEAD, by address: `$289FC0` or `$289FDA`.  It is deliberately
 *        NOT a player flag or a boolean.  `src/laser.js`'s `BEAM[].d7` is the
 *        SEGMENT RECORD's player word and is **1 for P1**, the exact inverse of
 *        this routine's D7, so a caller that passed a "d7" would have had two
 *        opposite conventions meeting at one argument. The caller names the ROM
 *        address it is standing at.
 * @returns {boolean} false on the "no free slot" failure return.
 */
export function spawnBeamImpact289FC0(ram, rom, ctx, spawner, at) {
  const head = BEAM_IMPACT.find((h) => h.at === at);
  if (!head) {
    unreached(at, `the laser impact effect was entered at $${(at >>> 0)
      .toString(16).toUpperCase()}, and the cartridge has exactly TWO heads: `
      + `$289FC0 (D7 = 0, P1's $81D394 and $810408) and $289FDA (D7 = 1, P2's `
      + `$81D790 and $81046A). $289F96 -- the beam's SEGMENT producer, which `
      + `shares this template -- is a THIRD head and is unported: it allocates `
      + `TWO records and picks its half from ($1A,A6)`);
  }
  return poolETail(ram, rom, ctx, head.base, SPARK.beamImpactTpl, spawner,
    0, head.d7, head.at);                         // $289FCC moveq #$0,D0
}

/**
 * `$28A39E` -- the fill tail for kind $14, i.e. THE SHOT SPARK.  It is what
 * gives every spark a different heading and a different speed, and it is why
 * the flash looks like a burst rather than like one sprite.
 *
 *   28a39e: movem.l D0-D2,-(A7)
 *   28a3a2: jsr $242E24                  D0 = a canned byte, $242E42[state&$7F]
 *   28a3a8: addq.b #8,D0
 *   28a3aa: cmpi.b #$24,D0 / bcs / moveq #$24,D0     -> D0 in [0,$24]
 *   28a3b2: bsr $28ABE0                  D1 = a canned byte, $28ABFA[state&$3F]
 *   28a3b6: add.b ($1b,A6),D1            + THE SHOT'S OWN ANGLE
 *   28a3ba: jsr $241D34                  -> D2 (long axis), D3 (short axis)
 *   28a3c0: move.w D2,(A0)+ / move.w D3,(A0)+        the velocity, rec+$1C
 *   28a3c4: asl.w #2,D2 / add.w D3,D3 / add.w D3,D3  x4 -- NOTE THE ASYMMETRY:
 *                                       D2 by `asl`, D3 by two `add.w`s.  Both
 *                                       are *4 and both discard the same bits,
 *                                       so they agree -- transcribed as written
 *                                       because a reader checking the listing
 *                                       will see two different instructions.
 *   28a3ca: addq.w #2,A0                 -> A0 = rec+$22, THE NEXT SLOT
 *   28a3cc: add.w D2,(-$1e,A0)           rec+$04 += 4*D2   } a one-shot nudge,
 *   28a3d0: add.w D3,(-$1c,A0)           rec+$06 += 4*D3   } four frames ahead
 *
 * `$242E24` is a member of the `$803917` RNG family and its 128-byte table is
 * ALREADY an export window (W23 exported it under the caller it had then).
 * `$241D34` is `MoveTables.shotVector`, ported since wave 8 -- and its speed
 * index reaches $24 = 36, which is inside the exported level set (0..36).
 */
function fillTail28A39E(ram, rom, ctx, slot, spawner) {
  let d0 = drawByte242E24(ram, rom);               // $28A3A2 jsr $242E24
  d0 = (d0 + 8) & 0xff;                            // $28A3A8 addq.b #8,D0
  if (d0 >= 0x24) d0 = 0x24;                       // $28A3AA/$28A3B0
  let d1 = drawByte28ABE0(ram, rom);               // $28A3B2 bsr $28ABE0
  d1 = (d1 + ram.u8(spawner + 0x1b)) & 0xff;       // $28A3B6 add.b ($1b,A6),D1
  const v = ctx.tables.shotVector(d0, d1);         // $28A3BA jsr $241D34
  ram.setU16(slot + E.vel, u16(v.dy));             // $28A3C0 move.w D2,(A0)+
  ram.setU16(slot + E.vel + 2, u16(v.dx));         // $28A3C2 move.w D3,(A0)+
  const d2x4 = u16(v.dy << 2);                     // $28A3C4 asl.w #2,D2
  const d3x4 = u16(u16(v.dx + v.dx) + u16(v.dx + v.dx));  // $28A3C6/$28A3C8
  ram.setU16(slot + E.pos, u16(ram.u16(slot + E.pos) + d2x4));       // $28A3CC
  ram.setU16(slot + E.pos + 2, u16(ram.u16(slot + E.pos + 2) + d3x4)); // $28A3D0
  return slot + SPARK.stride;                      // $28A3CA left A0 here
}

/**
 * `$289F54` -- THE SHOT'S IMPACT SPARK, allocated.
 *
 * @param spawner the SHOT record (the ROM's A6)
 * @param player  the PLAYER record (the ROM's A4) -- `$289F82` compares it
 *                against `$8103E6` and that is the ONLY thing that picks P1's
 *                30 slots over P2's.
 * @returns {boolean} false when the allocator took a FAILURE return, which is
 *                `ori #1,SR` (carry set).  No ROM caller tests it; the port
 *                counts it, because W33 §4's leak was four green waves of a
 *                failure nobody counted.
 */
export function spawnSpark(ram, rom, ctx, spawner, player, d0 = SPARK.kindSpark) {
  if (ram.u16(SPARK.gateAlloc) !== 0) {                  // $289F54 tst.w $813098
    ctx?.unportedLog?.note(0x289f4e, `$289F5A bne $289F4E -- pool E's allocator `
      + `took its $813098 FAILURE RETURN (ori #1,SR). No spark was spawned`);
    return false;
  }
  ram.setU8(0x803917, (ram.u8(0x803917) + 1) & 0xff);    // $289F62 addq.b #1
  // $289F68 move.w $803916,D5 / $289F6E add.w D5,D5 / $289F70 add.w D5,D5.
  // BOTH doublings are WORD ops, so D5 wraps at $10000, and `$289F78
  // movea.l (A2,D5.w),A2` then SIGN-EXTENDS it -- a state above $3FFF would
  // index BELOW the table.  It cannot today ($23BE36 `clr.w $803916` zeroes the
  // high byte and `addq.b` never carries into it, the same argument
  // `src/rng.js` RNG_242FDE makes for its own unmasked read), and the ROM
  // window turns it into a loud named throw rather than a wrong template if
  // that ever stops being true.
  const d5 = i16(u16(u16(ram.u16(0x803916)) * 2) * 2);   // $289F68..$289F70
  const tpl = rom.u32(SPARK.ptrTable + d5);              // $289F78 movea.l (A2,D5.w)
  const a0 = player === SPARK.p1PlayerRec                // $289F82 cmpa.l
    ? SPARK.p1Base : SPARK.p2Base;
  return poolETail(ram, rom, ctx, a0, tpl, spawner, d0, 0, 0x289f54);
}

/**
 * `$28A060..$28A08E` -- **THE SHARED TAIL**, and it is shared in the cartridge
 * too: `$289F54` reaches it by `$289F88 bra`, `$289FF4` by `$28A02C bra`, and
 * `$289F96`/`$289FC0`/`$289FDA` (the beam's three, unported) the same way.
 * One body, five heads, and a port that copied it per head would have five
 * places to get the `dbra`'s off-by-one wrong.
 *
 * recon 50 has the sense of the width branch BACKWARDS ("30 slots, or 15 when
 * `$81308C` is set").  `$28A068 bne $28A06C` SKIPS the `moveq #$E`, so it is
 * 30 slots when `$81308C` is NON-ZERO and 15 when it is 0.  `[M]` `$81308C`
 * reads 1 on this tree.
 *
 * @param d7 the head's D7 -- 0 from `$289F54`, `$FFFF` from `$289FF4`.
 * @returns {boolean} false on the `$28A078` "no free slot" failure return.
 */
function poolETail(ram, rom, ctx, base, tpl, spawner, d0, d7, site) {
  let a0 = base;
  let d2 = ram.u16(SPARK.gateWidth) !== 0                // $28A062/$28A068
    ? SPARK.perPlayer - 1 : SPARK.perPlayerNarrow - 1;   // $28A060/$28A06A moveq
  let d1 = 0;                                            // $289F60/$289FF8 moveq
  for (;;) {
    if (ram.u16(a0 + E.status) === 0) {                  // $28A06C tst.w (A0)
      a0 = fillSlot(ram, rom, ctx, a0, tpl, spawner, d0, d7);  // $28A082 bsr
      if (--d1 < 0) return true;                         // $28A086 subq/bcs
      if (d2-- === 0) return true;                       // $28A08A dbra -> $28A08E
      continue;
    }
    a0 += SPARK.stride;                                  // $28A070 lea ($22,A0),A0
    if (d2-- === 0) {                                    // $28A074 dbra D2
      ctx?.unportedLog?.note(0x28a078, `$28A078 -- pool E's allocator (entered `
        + `at $${site.toString(16).toUpperCase()}) found NO FREE SLOT in the `
        + `player's ${ram.u16(SPARK.gateWidth) !== 0 ? 30 : 15} and returned `
        + `FAILURE (ori #1,SR). The record was DISCARDED. This is the event `
        + `W33 4 says must be counted rather than assumed impossible`);
      return false;
    }
  }
}

// ================================ THE DRIVER ================================
//
// `$28A098`, type-5 call #12.  `40-recon` §3.3 filed this as "bucket 20's bulk
// writer, cheap in pixels (195 px), the first pre-emptive sacrifice" and
// `50-recon` §1.7 corrected it: it is the DRIVER OF THE SHOT SPARK, and W11's
// 195 px was measured on `stage1-open`, a scenario that never fires.
//
// [M] AND THE BOARD SIZED BUCKET 20's STAGING BUFFER AT EXACTLY THIS POOL'S
// CAPACITY: `BUCKETS[20].capBytes` is 720 = **60 records of 12**, and pool E is
// **60 slots**.  That is the same relationship W52 §0.2 measured for buckets
// 22/23 (2,520 B = 210 records against a 210-slot bullet pool), and it means the
// bulk writer cannot overrun its bucket.  The port checks it anyway, by address.
//
// THE THREE SEMANTICS THAT WILL BE GOT WRONG IF THEY ARE NOT TRANSCRIBED:
//
//  1. **D5 IS BOTH THE RECORD BUDGET AND THE CULL BOUND, AND IT MOVES.**
//     `$28A0CA move.w #$7000,D5 / swap D5 / move.w $81DB8E,D5` builds
//     $700000D0, and then `$28A102 subq.w #1,D5` decrements it once per live
//     slot while `$28A17C cmp.l D5,D0` uses THE WHOLE LONG as the cull bound.
//     So the short-axis half of the bound tightens by one per record already
//     emitted this frame.  A port that split them into two variables is right
//     about the intent and wrong about the arithmetic.
//  2. **A FREE SLOT COSTS NO ITERATION.**  `$28A0FC beq $28A0F6` loops back
//     WITHOUT touching the `dbra`, so the walk runs until it has processed
//     `$81DB8C` LIVE slots -- it is not bounded by the pool.  A wrong count word
//     walks off the end of the pool and into the bullet driver's RAM.  The ROM
//     has no guard; this file throws by address.
//  3. **THE EMITTER TABLE IS FOUR ENTRIES AND ($2,A6) IS A RAW BYTE OFFSET.**
//     [M] $28A140 = $28A132 $28A150 $28A15C $28A150, and the longword at
//     $28A150 is `532E 0016` -- `subq.b #1,($16,A6)`, i.e. CODE.  A selector
//     outside 0/4/8/$C `jmp`s into an instruction.  Range-check it and throw.

/** `$28A140`'s four entries, as the byte offsets the ROM indexes with. */
export const EMIT_ENTRY = Object.freeze({
  0x0: 0x28a132, 0x4: 0x28a150, 0x8: 0x28a15c, 0xc: 0x28a150,
});

/**
 * `$28A098` -- step and emit the whole live pool, once per frame.
 * @param rom the RomWindows -- the descriptor LISTS live in the cartridge.
 * @returns {{records:number, live:number, freed:number}} telemetry; the ROM
 *          returns nothing.  Nothing in the port's own path reads it.
 */
export function runSparkDriver(ram, rom, ctx) {
  const bucket = BUCKETS[SPARK.bucket];
  const d0zero = 0;                                       // $28A098 moveq #$0,D0
  // $28A09A..$28A0AE.  With D0 = 0 the `sub.w` never borrows, so `$28A0AA
  // clr.w $81DB8E` is transcribed-and-unexercised: the budget is always $D0.
  let budget = u16(SPARK.budgetReload - d0zero);
  if (SPARK.budgetReload - d0zero < 0) budget = 0;        // $28A0A8 bcc / $28A0AA
  ram.setU16(SPARK.budget, budget);
  const live = ram.u16(SPARK.count);                      // $28A0B0 move.w $81DB8C,D7
  if (live === 0) return { records: 0, live: 0, freed: 0 };  // $28A0B6 beq $28A096
  let d7 = live - 1;                                      // $28A0B8 subq.w #1,D7
  // $28A0BA..$28A0C8.  D6's HIGH word is -($803912) and is READ BY NOTHING; only
  // `$28A178 tst.w D6` -- the LOW word, $80390C -- is used.  Transcribed whole
  // because "the high half is dead" is a claim about the ROM, and this file is
  // allowed to make it only by writing the instruction down.
  const d6low = ram.u16(0x80390c);                        // $28A0C4
  const cullSkip = (d6low & 0x8000) !== 0;                // $28A178 tst.w / bmi
  // $28A0CA..$28A0D0: D5 = $7000 in the HIGH word, the budget in the LOW word.
  // `$28A102 subq.w #1,D5` is a WORD op: it never borrows into the high word, so
  // the high half stays $7000 for the whole frame and only `budget` moves.
  const d5hi = (SPARK.cullY << 16) >>> 0;
  const d4 = SPARK.posShift;                              // $28A0D6 moveq #$6,D4
  const d3 = ENQUEUE_MASK;                                // $28A0D8 move.l #$07FF03FF
  const d2 = NO_ZOOM_OR;                                  // $28A0DE move.l #$80008000
  let a6 = SPARK.p1Base;                                  // $28A0E6 lea $81D394,A6
  const a4start = bucket.buffer;                          // $28A0EC lea $808FA4,A4
  let a4 = a4start;                                       // $28A0F2 move.l A4,-(A7)
  const poolEnd = SPARK.p1Base + SPARK.slots * SPARK.stride;
  let records = 0, freed = 0;

  for (;;) {
    // $28A0FA move.w (A6)+,D0 / beq $28A0F6 lea ($20,A6),A6 -- skip a FREE slot
    // WITHOUT consuming a dbra.
    while (ram.u16(a6 + E.status) === 0) {                // $28A0FC beq
      a6 += SPARK.stride;                                 // $28A0F6 lea ($20,A6)
      if (a6 >= poolEnd) {
        unreached(0x28a0fa, `$28A0FA walked past $${poolEnd.toString(16)
          .toUpperCase()}, the end of pool E's 60 slots, still looking for the `
          + `${d7 + 1} live record(s) $81DB8C claims. The count word and the `
          + `slots disagree -- the ROM has no guard here and would read the `
          + `bullet driver's RAM as a spark record`);
      }
    }
    if (budget === 0) {                                   // $28A0FE tst.w D5 / beq
      ram.setU16(a6 + E.status, 0);                       // $28A116 clr.w (-$2,A6)
      ram.setU16(SPARK.count, u16(ram.u16(SPARK.count) - 1));  // $28A11A subq.w #1
      freed++;
      a6 += SPARK.stride;                                 // $28A120 lea ($20,A6)
      if (d7-- === 0) break;                              // $28A124 dbra D7
      continue;
    }
    budget = u16(budget - 1);                             // $28A102 subq.w #1,D5
    const d5 = (d5hi | budget) >>> 0;
    const sel = ram.u16(a6 + E.selector);                 // $28A104 move.w (A6)+,D0
    if (!(sel in EMIT_ENTRY)) {                           // $28A106..$28A110
      unreached(0x28a140, `pool E's emitter selector ($2,A6) = $${sel.toString(16)
        .toUpperCase()} is a raw BYTE offset into the FOUR-entry table $28A140 `
        + `and only 0, 4, 8 and $C are entries. The longword at $28A150 is `
        + `\`532E 0016\` = subq.b #1,($16,A6) -- CODE -- so the board would jmp `
        + `into an instruction. Record at $${a6.toString(16).toUpperCase()}`);
    }
    // --------- $28A150 (selector 4 and $C) and $28A132 (selector 0) ---------
    // EITHER counter borrowing advances the animation; neither borrowing skips
    // it.  [M] every spark template has +$12/+$13 = 0, so counter A borrows on
    // EVERY frame and the animation advances every frame -- which is why a spark
    // is exactly as many frames long as its template's cursor allows.
    let advance;
    if (sel === 0x4 || sel === 0xc) {                     // -> $28A150
      const b = ram.u8(a6 + E.delayB);                    // $28A150 subq.b #1,($16,A6)
      ram.setU8(a6 + E.delayB, (b - 1) & 0xff);
      if (b !== 0) {                                      // $28A154 bcc $28A132
        advance = counterA(ram, a6);
      } else {
        ram.setU8(a6 + E.delayB, ram.u8(a6 + E.delayBReload));   // $28A156
        advance = true;                                   // falls into $28A15C
      }
    } else {                                              // -> $28A132
      advance = counterA(ram, a6);
    }
    if (advance) {
      // $28A15C..$28A16E -- THE ANIMATION, and the pool's main drain.
      const cur = ram.u16(a6 + E.cursor);                 // $28A15C move.w ($10,A6),D0
      ram.setU16(a6 + E.cursor, u16(cur - 4));            // $28A160 subq.w #4
      if (cur < 4) {                                      // $28A164 bcs $28A1A0
        ram.setU16(a6 + E.status, 0);                     // $28A1A0 clr.w (-$4,A6)
        ram.setU16(SPARK.count, u16(ram.u16(SPARK.count) - 1));  // $28A1A4
        freed++;
        a6 += SPARK.stride;                               // $28A1AA lea ($1e,A6)
        if (d7-- === 0) break;                            // $28A1AE dbra D7
        continue;
      }
      // $28A16A `move.l (A0,D0.w),($4,A6)` -- D0 is the cursor BEFORE the
      // decrement, so a template that starts at $8C uses list entries 35..1 and
      // NEVER entry 0.  Named in the worklog rather than quietly harvested away.
      const list = ram.u32(a6 + E.list);                  // $28A166 movea.l ($12,A6)
      ram.setU32(a6 + E.descriptor, rom.u32(list + i16(cur)));
    }
    // $28A170..$28A176 -- position += velocity, written back.
    const d0 = ((ram.u32(a6 + E.vel) + ram.u32(a6 + E.pos)) | 0) >>> 0;
    ram.setU32(a6 + E.pos, d0);                           // $28A176 move.l D0,(A6)+
    // $28A178 tst.w D6 / bmi $28A180 -- skip the cull when $80390C is negative.
    if (!cullSkip && d0 >= d5) {                          // $28A17C cmp.l D5,D0 / bcc
      ram.setU16(a6 + E.status, 0);                       // $28A1BC clr.w (-$8,A6)
      ram.setU16(SPARK.count, u16(ram.u16(SPARK.count) - 1));  // $28A1C0
      freed++;
      a6 += SPARK.stride;                                 // $28A1C6 lea ($1a,A6)
      if (d7-- === 0) break;                              // $28A1CA dbra D7
      continue;
    }
    // $28A180..$28A18C -- THE TWELVE BYTES.  The same `asr.l #6` / mask / or the
    // per-record stub `$23D762` uses, so a spark's word 0/1 encoding is the
    // display list's own (`src/spritequeue.js` traps 1 and 2).
    const packed = ((((d0 | 0) >> d4) & d3) | d2) >>> 0;  // $28A180/$28A182/$28A184
    if (a4 + 12 > bucket.buffer + bucket.capBytes) {
      unreached(0x28a186, `pool E's bulk writer reached $${(a4 + 12).toString(16)
        .toUpperCase()}, past bucket 20's staging buffer $${bucket.buffer
        .toString(16).toUpperCase()}+$${bucket.capBytes.toString(16)
        .toUpperCase()} (${bucket.capBytes / 12} records, the pool's own 60). `
        + `The board writes on regardless, into bucket 21's buffer`);
    }
    ram.setU16(a4 + 0, (packed >>> 16) & 0xffff);         // $28A186 move.l D0,(A4)+
    ram.setU16(a4 + 2, packed & 0xffff);
    ram.setU32(a4 + 4, ram.u32(a6 + E.descriptor));       // $28A188 move.l (A6)+,(A4)+
    ram.setU16(a4 + 8, ram.u16(a6 + E.size));             // $28A18A move.w (A6)+,(A4)+
    ram.setU16(a4 + 10, ram.u16(a6 + E.attr));            // $28A18C move.w (A6),(A4)+
    a4 += 12; records++;
    a6 += SPARK.stride;                                   // $28A18E lea ($14,A6),A6
    if (d7-- === 0) break;                                // $28A192 dbra D7
  }
  // $28A128/$28A196/$28A1B2/$28A1CE -- all four exits do the same two
  // instructions: `suba.l (A7)+,A4 / move.w A4,$80AFDE`.  THE COUNTER IS
  // OVERWRITTEN, not advanced (`src/spritequeue.js` §3), so bucket 20 cannot be
  // shared with a per-record producer inside one frame.
  ram.setU16(bucket.counter, u16(a4 - a4start));
  return { records, live, freed };
}

/** `$28A132` -- delay counter A.  Returns whether the animation advances.
 *  `subq.b #1` on a byte borrows exactly when the byte was 0, and the ROM's
 *  `bcc` is that borrow -- NOT a sign test. */
function counterA(ram, a6) {
  const a = ram.u8(a6 + E.delayA);                        // $28A132 subq.b #1,($e,A6)
  ram.setU8(a6 + E.delayA, (a - 1) & 0xff);
  if (a !== 0) return false;                              // $28A136 bcc $28A170
  ram.setU8(a6 + E.delayA, ram.u8(a6 + E.delayAReload));  // $28A138
  return true;                                            // $28A13E bra $28A15C
}
