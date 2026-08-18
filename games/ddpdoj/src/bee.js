// THE BEE (yellow medal) -- POOL A's reserved ten.  WAVE 111.
//
// The owner is playing the live build and the yellow 500-pt medals the carrier
// type-$8A drops are nowhere: they never spawn, never fly, never get collected,
// never score.  W110's recon mapped the whole lifecycle against the image and
// verified every claim.  This file is the port: one allocator, one fill, one
// driver, one body, one clear, and two wires.
//
// ======================= THE BEE IS POOL A KIND 1 (AND 16) ===================
//
// The medal IS the bee.  It is kind index 1 (and 16) of POOL A, the "impact"
// pool at `$8171BE`, driven by type-5 call #4 `$27F95A`.  The pool is 80 slots
// of `$2C`: 70 general (`$8171BE`) plus a reserved ten (`$817DC6`, bolted onto
// the end) that ONLY the bee carrier's death arm ever allocates from.  The live
// count word `$817F7E` sits one past the last reserved slot
// (`$8171BE + 80*$2C == $817F7E`, arithmetic closes EXACT), and it covers ALL
// 80 slots -- the driver and the collision pass walk them as ONE array.
//
//   $8171BE + 70*$2C == $817DC6  (reserved ten base)              EXACT
//   $817DC6 + 10*$2C == $817F7E  (live count)                     EXACT
//   $27F87C clears #$6E7 words from $8171BE                       EXACT
//                                 = 80 slots + 7 trailing words
//
// ========================== A BEE APPEARS WHEN ITS CARRIER DIES ==============
//
// The carrier is enemy type `$8A`, FULLY ported (`handler8A`, W30).  Its death
// arm `$2767D0` scores the kill, plays the cue, then calls `$27F92A` (THIS
// allocator) with D0 = `($1A,A5) = $0004` (kind 1) and D2 = `($1F,A6)` (the
// display layer byte).  The allocator finds a free slot in the reserved ten,
// and the fill writes the position, the 22-byte template, the layer emitter,
// and bumps `$817F7E`.  From the next frame the driver walks the pool, the body
// blinks the sprite (`$1BCA34`/`$1BCA80` at 20 Hz), and collision block 3
// (`impactCollisionBlock`) flags the bee when the player overlaps it.
//
// Collection is a TWO-FRAME handshake: block 3 ORs the player bit (12 for P1,
// 11 for P2) on frame N; the body reads it (`btst #$C`/`btst #$B`) on frame
// N+1 and runs the award.  The award is `base x chain_hits` through `$286128`
// (scoreByMask): a pure pending-score add, NOT a chain tick.  The base comes
// from the ladder `$27FD22` indexed by the cursor `$817F82` (BCD $100 on a
// fresh stage-1 cursor).
//
// =========== THE GENERAL POOL: KINDS 18/19, PLUS LOUD REMAINING GAPS =========
//
// Pool A has 20 kind bodies (dispatch table `$27F99E`). Kind 1 (the bee) and
// kind 16 (the bee's flying variant) route through `$27F92A`'s reserved ten.
// W216 adds the live general-pool kinds 18 and 19 used by Stage-4 Type A3,
// including their fill hooks, ordinary bodies, collection transforms and
// zoomed collected animations. The remaining bodies stay loud until a live
// caller owns their allocator inputs and lifecycle.
//
// `allocBee27F92A` REFUSES any kind that is not 1 (`$04`) or 16 (`$40`): no
// record of any other kind can exist through this allocator.  The dispatch
// remaining dispatch entries are still present and range-checked; reaching one
// is a LOUD NAMED THROW rather than an invented generic implementation.
//
//   Also REFUSED (loud named note, like W61's hyper-stock refusal):
//   * the kind-16 FLYING arm `$27FCEA`.  Stage-1 use unknown; the thrown path
//     is unreachable on the shipped seed by recon 73's measurement.
//
// W166 closes the former rank-gauge refusal. W163 supplied the complete
// `$287682/$287722` grant, item, collection and activation pipeline, so the
// collect arms can now perform their authentic BCD-hit conversion and feed
// chain-earned hypers instead of merely scoring the bee.
//
// ================================ THE GEOMETRY ===============================
//
// [M] read out of instructions this session; every address closes EXACTLY:
//
//   $8171BE + 70*$2C == $817DC6  (reserved ten)                    EXACT
//   $817DC6 + 10*$2C == $817F7E  (live count)                      EXACT
//   $27F87C clears #$6E6+1 = $6E7 words from $8171BE               EXACT
//   $27F99E holds 20 stride-4 longs ($27F99E..$27F9EE)             EXACT
//   $27FD22 holds 10 BCD longs $100..$1000                         EXACT
//   $280EB0 template is 22 bytes for kind 1                        EXACT
//   $280BB6 layer table is 6 longs                                 EXACT
//
// Record (stride $2C = 44 bytes):
//  +$00 w  STATUS.  bit15 = allocated; bits 6..2 = kind INDEX ($7C mask, NOT
//          the kind number -- kind 1 = $04 in the low byte, kind 16 = $40);
//          bit 5 = x2 flag; bit 0 = already-collected; bit $C = P1 touch;
//          bit $B = P2 touch.
//  +$02 l  POSITION.  hi word = long/Y axis, lo word = short/X axis.
//  +$06 l  two sprite offset words (from template $FA00 $FD00).
//  +$0A l  sprite descriptor ($001BCA34 frame A, $001BCA80 frame B).
//  +$0E w  width/height ($0618).
//  +$10 w /+$12 w  hitbox long-axis extents ($0980 x2).
//  +$14 w /+$16 w  hitbox short-axis extents ($0780 x2).
//  +$18 w  blink timer (template $0000, reloaded to 2 on borrow).
//  +$1A b  speed; +$1B b  angle.  SKIPPED by the fill (carrier-provided).
//  +$1C w  from template ($001C).
//  +$1E w  hit count / animation cursor ($9601 from fill hook $280CEE).
//  +$28 l  layer emitter pointer (from layer table $280BB6, indexed by layer).

import { u16, i16 } from './ram.js';
import { RAM } from './machine.js';
import { unreached } from './unported.js';
import { enqueueThroughStub, enqueueZoomedThroughStub, enqueueRegisters } from './spritequeue.js';
import { scoreByMask } from './score.js';
import { bcd242AC6 } from './items.js';
import { grantHyper287682 } from './hyper.js';
import { drawByte242B3C, drawByte2431F4, drawByte242E24, drawSigned242FDE,
  drawWord242EC2 } from './rng.js';

// ============================== THE GEOMETRY ================================

export const POOL_A = Object.freeze({
  // the pool
  base: 0x8171be,            // $27F964 lea $8171BE,A6 -- ALL 80 slots as one array
  reservedBase: 0x817dc6,    // $27F936 lea $817DC6,A0 -- the reserved ten
  liveCount: 0x817f7e,       // $27F95A move.w $817F7E,D7 / $280B3E addq.w #1
  beeCount: 0x817f80,        // $27FBF4 addq.w #1,$817F80 -- per-stage bee count
  cursor: 0x817f82,          // $27FBEE move.w / $27FC0C addq.w #4 -- base-value idx
  stride: 0x2c,              // $27F972 lea ($2C,A6),A6
  generalSlots: 70,          // $27F906 move.w #$45,D7 (= 69 for dbra) in the general alloc
  reservedSlots: 10,         // $27F93C move.w #$9,D7 (= 9 for dbra)
  totalSlots: 80,            // generalSlots + reservedSlots; the ROM walks ALL
  clearWords: 0x6e7,         // $27F882 move.w #$6E6,D0 + dbra's own pass
  // routines
  alloc: 0x27f92a,           // the reserved-ten allocator (single caller: $2767E6)
  fill: 0x280b3e,            // the fill (reached by beq from the allocator)
  fillAbort: 0x280b2a,       // the off-screen-on-spawn undo
  fillHookTable: 0x280bce,   // 8 longs, kind-specific fill hooks
  fillHookBee: 0x280cee,     // kind 1's hook: move.w #$9601,($1E,A0) / bra rts
  driver: 0x27f95a,          // type-5 call #4
  dispatch: 0x27f99e,        // 20 stride-4 longs
  dispatchEntries: 20,       // indices 20..31 run off the end into code
  clear: 0x27f87c,           // the big clear ($6E7 words)
  // the body
  body: 0x27facc,            // kind 1 and kind 16 dispatch here
  idleStep: 0x27fc8c,        // blink + off-screen free + kind-1 emit
  offscreenFree: 0x27fc7c,   // moveq #0 / clr (A6) / clr ($2,A6) / subq count / rts
  scoreAward: 0x27fbee,      // flat + chain-multiply through $286128
  collectP1: 0x27fb6c,       // btst #$C -> P1 collect arm
  collectP2: 0x27fae6,       // btst #$B -> P2 collect arm
  gaugeP1: 0x27fba2,         // P1 bee chain-to-hyper feed
  gaugeP2: 0x27fb1c,         // P2 mirror
  kind16Arm: 0x27fcea,       // the flying bee (REFUSED)
  kind16Waypoint: 0x27fd72,  // the waypoint script
  // data
  baseLadder: 0x27fd22,      // 10 BCD longs $100..$1000
  popupLadder: 0x27fd4a,     // 10 BCD longs (popup descriptors)
  templateTable: 0x280e4a,   // 8 longs -> templates
  templateBee: 0x280eb0,     // kind 1's 22-byte template
  layerTable: 0x280bb6,      // 6 longs (emit stubs)
  layerEntries: 6,
  // globals the body reads
  scrollShort: 0x813176,     // $27F96A move.w $813176,D6 / $27F97A sub.w D6,($4,A6)
  scrollLong: 0x80b03c,      // $27FCD8 move.w $80B03C,D0 (hi word = Y scroll delta)
  freeze: 0x8130d2,          // $27FCD0 tst.w -- motion freeze gate
  noMissP1: 0x81293c,        // $27FB6C move.w -- the per-stage hit counter P1
  noMissP2: 0x81293e,        // $27FAE6 move.w -- P2
  chainMeterP1: 0x81b5c0,    // $27FB72 move.w -- D4 for the gauge/award gate
  chainMeterP2: 0x81b5ea,    // $27FAEC move.w
  chainHitsP1: 0x81b5da,     // $27FB78 move.w -- D5 for the digit-multiply
  chainHitsP2: 0x81b604,     // $27FAF2 move.w
  rankP1: 0x81b64a,          // $27FBDE add.w D0 -- hyper earn accumulator
  rankP2: 0x81b64c,          // $27FB58 add.w D0 -- P2
  hyperP1: 0x81b63e,         // $27FBA2 tst.w -- hyper-active gate (gauge skip)
  hyperP2: 0x81b640,         // $27FB1C tst.w
  soundCue: 0x28c62a,        // $27FC6C jsr -- the collect sound (noted)
  twoPlayer: 0x8130f8,       // $27FB7E btst #$1 -- 2P mode flag
  collisionPhase: 0x80390c,
  pause: 0x803912,
  collectP1Total: 0x817f86,
  collectP2Total: 0x817f8a,
  // W411: the OTHER pair. `$28DB70`'s result screen reads FOUR independent words,
  // not two lo/hi pairs: $817F86/$817F8A is the star's ($27F9EE lea $817F86) and
  // $817F84/$817F88 is kind index 2's ($27FE1E lea $817F84). P1 is the `btst #$C`
  // arm in both.
  medalP1Total: 0x817f84,    // $27FE1E lea $817F84,A0
  medalP2Total: 0x817f88,    // $27FE2A lea $817F88,A0
  kind2Body: 0x27fe0e,       // dispatch index 2 -- the gold disc
  kind2Collect: 0x27fe0e,    // its collect arm falls out of the same head
  kind2Step: 0x27fe6e,       // the ordinary step arm
  kind0Collect: 0x27f9ee,    // $27FA34 bne -- kind 0/4's collect arm, BACKWARD
  collectTransform: 0x280fdc, // the shared collected transform
  collectTable: 0x280f34,    // $280FE0 lea (-$AE,PC),A0
  collectSelectors: 3,       // $00050000, $00050004, $00010008 -- the whole image
  collectSpriteEntries: 10,  // ten longwords per sprite table
});

/** Deliberate-red seam used only by W166's causal regression. */
export const BEE_MUTATE = { value: null };

/** Record offsets from the slot base.  Every one cited on its use. */
export const B = Object.freeze({
  status: 0x00,              // w: bit15 alloc, bits 6..2 kind, bit5 x2, bit0 collected
  pos: 0x02,                 // l: position (hi = Y, lo = X)
  posX: 0x04,                // w: short axis (X), scroll-applied
  spriteOff: 0x06,           // l: two sprite offset words
  sprite: 0x0a,              // l: sprite descriptor
  size: 0x0e,                // w: width/height
  hitLongA: 0x10,            // w: hitbox extent (block 3 reads $+$10/$12/$14/$16)
  hitLongB: 0x12,            // w
  hitShortA: 0x14,           // w
  hitShortB: 0x16,           // w
  blinkTimer: 0x18,          // w: decremented, reload 2 on borrow
  speed: 0x1a,               // b: SKIPPED by fill
  angle: 0x1b,               // b: SKIPPED by fill
  tpl1C: 0x1c,              // w: from template
  hitCount: 0x1e,            // w: hit count / anim cursor
  tick: 0x1f,                // b: kind-16 timer
  waypoint: 0x20,            // l: kind-16 waypoint data
  layerEmitter: 0x28,        // l: the emit stub pointer
});

/** Kind indices (the value in bits 6..2 of the status word, shifted left 2). */
export const KIND = Object.freeze({
  bee: 0x04,                 // kind index 1 ($01 << 2)
  beeFlying: 0x40,           // kind index 16 ($10 << 2)
  stage4Impact18: 0x48,      // kind index 18, normalized by its fill hook to $18
  stage4Impact19: 0x4c,      // kind index 19, normalized by its fill hook to $1C
});

const IMPACT_KIND = Object.freeze({
  [KIND.stage4Impact18]: Object.freeze({
    status: 0x18, spriteOff: 0xfa00fc00, sprite: 0x001bd04c,
    size: 0x0620, hitA: 0x08000800, hitB: 0x06800680,
    animWord: 0x0101, tpl1C: 0x001c, step: 0x0064,
    end: 0x001bd68c, collectScore: 0x00000500, collectAdd: 4,
    collectSelector: 0x00050004, collectSprite: 0x001e2f5c,
    collectOff: 0xfc00fb00, collectSize: 0x0428,
    collectSound: 0x28c5e4, cull: 0xfc00,
    hookOffsets: Object.freeze([0x0000, 0x00c8, 0x0190, 0x0258,
      0x0320, 0x03e8, 0x04b0, 0x0578]),
  }),
  [KIND.stage4Impact19]: Object.freeze({
    status: 0x1c, spriteOff: 0xf800fa00, sprite: 0x001bd68c,
    size: 0x0830, hitA: 0x09800980, hitB: 0x07800780,
    animWord: 0x0101, tpl1C: 0x001c, step: 0x00c4,
    end: 0x001be2cc, collectScore: 0x00001000, collectAdd: 8,
    collectSelector: 0x00010008, collectSprite: 0x001e3f9c,
    collectOff: 0xfc00fa00, collectSize: 0x0430,
    collectSound: 0x28c610, cull: 0xfa00,
    hookOffsets: Object.freeze([0x0000, 0x0188, 0x0310, 0x0498,
      0x0620, 0x07a8, 0x0930, 0x0ab8]),
  }),
});

/** `$27F99E`, the 20-entry kind dispatch, as ROM addresses.  [M] kind[1] and
 *  kind[16] are BOTH `$27FACC` (the bee).  Indices 17/18/19 alias 5/6/7. */
export const DISPATCH = Object.freeze([
  0x27fa30, 0x27facc, 0x27fe0e, 0x27fed2, 0x27fa30,   // 0-4
  0x27ff9a, 0x280082, 0x28016a, 0x280252, 0x28036a,   // 5-9
  0x280486, 0x2805a2, 0x2806be, 0x2807d6, 0x2808f2,   // 10-14
  0x280a0e, 0x27facc, 0x27ff9a, 0x280082, 0x28016a,   // 15-19
]);

/** `$27FD22`, the base-value ladder.  10 BCD longs, indexed by the cursor
 *  `$817F82` (byte offset: 0, 4, 8, ...).  [M] read from the image. */
export const BASE_LADDER = Object.freeze([
  0x00000100, 0x00000200, 0x00000300, 0x00000400, 0x00000500,
  0x00000600, 0x00000700, 0x00000800, 0x00000900, 0x00001000,
]);

/** `$280EB0`, the 22-byte template for kind 1.  [M] from the image:
 *    FA00 FD00 001BCA34 0618 0980 0980 0780 0780 0000 001C
 *  Copied to +$06..+$1C with the +$1A/+$1B skip (carrier provides speed/angle). */
export const BEE_TEMPLATE = Object.freeze([
  // +$06: sprite offsets (2 words)
  0xfa, 0x00, 0xfd, 0x00,
  // +$0A: sprite descriptor (long)
  0x00, 0x1b, 0xca, 0x34,
  // +$0E: width/height (word)
  0x06, 0x18,
  // +$10: hitbox long extents (2 words)
  0x09, 0x80, 0x09, 0x80,
  // +$14: hitbox short extents (2 words)
  0x07, 0x80, 0x07, 0x80,
  // +$18: blink timer init (word)
  0x00, 0x00,
  // (+$1A/+$1B SKIPPED by the fill)
  // +$1C: from template (word)
  0x00, 0x1c,
]);

/** `$280BB6`, the 6-entry layer emitter table.  [M] from the image.  The fill
 *  indexes it by D2 = (layer_byte & $FF) << 2, so entries 0-5 correspond to
 *  layer bytes 0-5.  All six are already-ported record-convention stubs. */
export const LAYER_EMITTERS = Object.freeze([
  0x23d762, 0x23d762, 0x23d79e, 0x23d7da, 0x23d816, 0x23d852,
]);

function note(ctx, addr, what) { ctx?.unportedLog?.note(addr, what); }

// =========================== $27F87C, THE CLEAR =============================

/** `$27F87C` -- clear ALL of pool A: 80 slots plus the 7 trailing words
 *  ($817F7E live count, $817F80 bee count, $817F82 cursor, $817F84..$817F8A).
 *  1767 words from $8171BE.  Called from `rebuildWorld25FD38` (stageend.js)
 *  next to `clearItemPool`, the same site the item clear ships at. */
export function clearPoolA(ram) {
  for (let i = 0; i < POOL_A.clearWords; i++) {           // $27F88A dbra D0
    ram.setU16(POOL_A.base + i * 2, 0);                   // $27F886 move.w #0,(A0)+
  }
}

// ===================== $27F92A + $280B3E, ALLOCATE + FILL ====================
//
//   27f92a: moveq #0,D1 / andi.w #$FF,D2 / lsl.w #2,D2
//   27f932: movem.l D7/A0,-(A7)
//   27f936: lea $817DC6,A0 / move.w #$9,D7
//   27f940: tst.w (A0) / beq $280B3E      <- a FREE slot falls into THE FILL
//   27f946: lea ($2C,A0),A0 / dbra D7,$27F940
//   27f94e: movem.l (A7)+,D7/A0 / ori #$1,SR / rts   <- FULL: carry set
//
// The fill ($280B3E) bumps the live count, writes the status, computes and
// bounds-checks the position, copies the 22-byte template (skipping +$1A/+$1B),
// writes the layer emitter, and calls the kind-specific fill hook.  If the
// spawn position is off-screen the fill ABORTS ($280B2A): undoes the count bump,
// frees the slot, returns.  So a carrier that dies off-screen drops nothing.

/**
 * `$27F92A` -- allocate one bee record from the reserved ten and fill it.
 *
 * @param ram   the RAM object
 * @param rom   the ROM object (for the template/hook indirection)
 * @param ctx   the game context (for the unported log)
 * @param kind  the kind INDEX shifted left 2 ($04 = bee, $40 = flying bee).
 *              Comes from the carrier's `($1A,A5)`.
 * @param layer the display layer byte from the carrier's `($1F,A6)`.
 * @param carrierA6 the carrier's SUB-RECORD (A6); the fill reads `($2,A6)` for
 *                  the spawn position.
 * @returns {number|null} the slot address, or `null` if the pool was full or
 *   the spawn position was off-screen (the ROM sets carry; callers ignore it).
 */
export function allocBee27F92A(ram, rom, ctx, kind, layer, carrierA6) {
  // --------------------------------------------------- Â§THE REFUSAL (header)
  if (kind !== KIND.bee && kind !== KIND.beeFlying) {
    unreached(POOL_A.alloc, `$27F92A -- the caller passed kind index $${
      (kind >> 2).toString(16).toUpperCase()} (D0=$${kind.toString(16)
        .toUpperCase()}), which is not the bee (kind 1 = $04) or its flying `
      + `variant (kind 16 = $40). The reserved-ten allocator at $817DC6 serves `
      + `BEE records ONLY; the 18 other pool-A kinds come from the general `
      + `allocator $27F8EE (seven callers) or $27F8F8 (four callers), and `
      + `their D0 sources are unattributed (W110 sec 3). Allocating one here `
      + `would silently consume a reserved slot for a non-bee kind the driver `
      + `body $27FACC does not handle. REFUSED.`);
  }
  // D2 = (layer & $FF) << 2, the layer-table index.  Range-checked to 6 entries.
  const d2 = u16((layer & 0xff) << 2);                    // $27F92C/$27F930
  if ((d2 >> 2) >= POOL_A.layerEntries) {
    unreached(POOL_A.alloc, `$27F92A -- the carrier's ($1F,A6) layer byte $${
      (layer & 0xff).toString(16).toUpperCase()} produced table index $${
        d2.toString(16).toUpperCase()}, past the ${POOL_A.layerEntries}-entry `
      + `layer table $280BB6. The ROM does not range-check this and would read `
      + `into the fill-hook table $280BCE; the port refuses rather than `
      + `fabricate an emitter`);
  }

  // Scan the reserved ten for a free slot (status word == 0).  $27F940..$27F94A
  for (let i = 0; i < POOL_A.reservedSlots; i++) {        // $27F93C move.w #$9,D7
    const slot = POOL_A.reservedBase + i * POOL_A.stride;  // $27F936 lea base
    if (ram.u16(slot) === 0) {                             // $27F940 tst.w (A0) / beq
      return fillBee280B3E(ram, rom, ctx, slot, kind, d2, carrierA6);
    }
    // $27F946 lea ($2C,A0),A0 / dbra
  }
  // Full pool: the ROM sets carry and returns A0 = one past the end.  No caller
  // tests either, so the drop is silent.  COUNTED, because that is the check
  // W33 sec 4 says would have caught the item-pool leak four waves earlier.
  note(ctx, POOL_A.alloc, `$27F92A -- the reserved ten is FULL (all 10 slots `
    + `at $817DC6 occupied). The carrier's bee is silently lost. The ROM sets `
    + `carry and returns A0 = $${(POOL_A.reservedBase + POOL_A.reservedSlots
      * POOL_A.stride).toString(16).toUpperCase()} (one past the end); no `
    + `caller tests either.`);
  return null;
}

/** `$27F8F0` -- allocate one of Stage 4 Type A3's proven general Pool-A
 * impacts. D1 is a zero-extended packed-position offset and D2 is the display
 * layer byte. Unlike the bee allocator this scans the first seventy slots. */
/**
 * `$280B44` / `$280B4A` -- THE TEMPLATE, READ OUT OF THE CARTRIDGE.
 *
 *     280b44: lea ($280E4A,PC),A3
 *     280b4a: movea.l (a3,d0.w),a3       <-- D0 is a BYTE OFFSET, not a kind number
 *
 * so the reachable D0 values are 0, 4, ... `$1C` and the table is eight longwords. Each
 * template is then copied field by field:
 *
 *     280b80: move.l (a3)+   the sprite OFFSET
 *     280b82: move.l (a3)+   the sprite
 *     280b84: move.w (a3)+   the size
 *     280b86: move.l (a3)+   hit box A
 *     280b88: move.l (a3)+   hit box B
 *     280b8a: move.w (a3)+   the animation word
 *     280b8c: addq.w #$2,a0  <-- a two-byte HOLE in the record, not in the template
 *     280b8e: move.w (a3)    ...and the last word, WITHOUT a post-increment
 *
 * W29..W263 carried two of these eight as measured literals and threw on the other six,
 * which is DOCKET D3: the screen clear's effect is D0 = 0 and had no template, so no
 * explosion appeared. The eight are the cartridge's own data, so reading them covers
 * every one -- and the two that were hard-coded are byte-for-byte templates 6 and 7,
 * which the test asserts so the refactor is provably not a re-measurement.
 */
const IMPACT_TEMPLATES = 0x280e4a;
const IMPACT_TEMPLATE_ENTRIES = 20;       // $280BCE's parallel dispatch has twenty

function impactTemplate280B4A(rom, d0) {
  if ((d0 & 3) !== 0 || d0 < 0 || d0 >= IMPACT_TEMPLATE_ENTRIES * 4) {
    unreached(0x280b4a, `$280B4A movea.l (a3,d0.w),a3 with D0 = $${
      (d0 >>> 0).toString(16).toUpperCase()} -- $280E4A holds ${
      IMPACT_TEMPLATE_ENTRIES} longwords and D0 is a BYTE OFFSET into them, so it must `
      + `be a multiple of 4 below $${(IMPACT_TEMPLATE_ENTRIES * 4).toString(16)
        .toUpperCase()}. A caller passing a kind NUMBER rather than an offset lands here`);
  }
  const t = rom.u32(IMPACT_TEMPLATES + d0);
  return {
    spriteOff: rom.u32(t), sprite: rom.u32(t + 4), size: rom.u16(t + 8),
    hitA: rom.u32(t + 10), hitB: rom.u32(t + 14),
    animWord: rom.u16(t + 18), tpl1C: rom.u16(t + 20),
  };
}

/**
 * `$280BCE` -- THE FINISH DISPATCH, twenty entries, and three of them are ONE ROUTINE
 * with two parameters. `$280C5E` (D0 = 0), `$280DEA` (D0 = `$48`) and `$280E1A`
 * (D0 = `$4C`) are the same instructions in the same order:
 *
 *     move.w #$420,$1A(a0)                  the speed floor
 *     $242EC2 & $E -> a HOOK TABLE word     added into $A(a0), the sprite
 *     $2431F4 >> 1                          added into the speed
 *     $242FDE + 1 then $2431F4 - that       the angle spread
 *     $241812 -> $20(a0)/$22(a0)            the cached velocity
 *
 * and they differ in exactly two things: which eight-word hook table they index, and the
 * status they normalise `(a0)` to afterwards. `$280C5E` inlines the shared tail rather
 * than `bsr`-ing it, and does NOT normalise -- which is why the port's `spec.status` has
 * no value for D0 = 0 and why that had to be modelled rather than defaulted.
 *
 * The other seventeen entries are real routines this wave did not read. They now throw
 * naming their OWN address out of the dispatch, which is a strictly better diagnosis
 * than the old "unported kind": it says which routine to port.
 */
// W287: **EIGHT MORE, AND THEY ARE ONE BODY OVER TWO PARAMETERS.**
//
// Hooks 8..15 of `$280BCE` all have the same three-instruction head and then share a
// tail. Read down the two columns and the structure is the whole story:
//
//   idx  site      lea               ($24,A0) <-   via
//    8   $280D76   $280C4E           $8103E6       $280D8C
//    9   $280D7C   $280C1E           $8103E6       $280D8C
//   10   $280D82   $280C2E           $8103E6       $280D8C
//   11   $280D88   $280C3E           $8103E6       $280D8C   (falls through)
//   12   $280D3E   $280C4E           $810448       $280D94
//   13   $280D4C   $280C1E           $810448       $280D94
//   14   $280D5A   $280C2E           $810448       $280D94
//   15   $280D68   $280C3E           $810448       $280D94
//
// So the HOOK BLOCK cycles $C4E, $C1E, $C2E, $C3E and the PLAYER RECORD is P1 for
// 8..11 and P2 for 12..15. `$8103E6` and `$810448` are `RAM.player1`/`player2` -- the
// field at `($24,A0)` is which player this impact belongs to.
//
// THE SHARED TAIL, `$280D94..$280DB8`, and it is why these eight cost almost nothing:
//
//   andi.w #$F,D7 / move.b D7,($1a,A0)      the low nibble of D7 is the anim index
//   clr.b ($1e,A0)
//   move.l D0,D7 / jsr $242EC2              the RNG ($242EC2, ported in src/rng.js)
//   andi.l #$E,D0 / move.w (A3,D0.w),D0     one of the block's EIGHT words
//   add.l D0,($a,A0)                        ADDED to the sprite pointer
//   move.l D7,D0 / rts                      D0 restored -- the caller's value survives
//
// `andi.l #$E` masks to an EVEN offset 0..$E, which is exactly the eight words the
// window covers, so the index space needs no bound of its own.
//
// `($24,A0)` is the only new field, and `add.l D0,($a,A0)` is the same
// "the hook offsets the sprite" mechanism the three W264 entries already use -- which
// is why `hookOffsets` below carries them for every kind rather than per entry.
const FINISH_FAMILY_BLOCKS = Object.freeze([0x280c4e, 0x280c1e, 0x280c2e, 0x280c3e]);
const FINISH_FAMILY = Object.freeze(Object.fromEntries(
  Array.from({ length: 8 }, (_, n) => {
    const idx = 8 + n;                       // dispatch indices 8..15
    const site = [0x280d76, 0x280d7c, 0x280d82, 0x280d88,
      0x280d3e, 0x280d4c, 0x280d5a, 0x280d68][n];
    return [idx * 4, Object.freeze({
      hooks: FINISH_FAMILY_BLOCKS[n % 4],
      status: null,                          // none of the eight writes one
      site,
      // $280D8C for 8..11, $280D94's own arm for 12..15
      owner: n < 4 ? RAM.player1 : RAM.player2,
    })];
  }),
));

// W298: HOOKS 4, 5, 6 AND 7, and 5/6/7 are literally the same routine.
//
//   $280BCE[4] = $280D28   bsr $280CD4 / clr.b ($1,A0) / addq.b #5,($1a,A0) / rts
//   $280BCE[5] = $280D34   bsr $280CD4 /                 addq.b #5,($1a,A0) / bra rts
//   $280BCE[6] = $280D34   THE SAME ENTRY
//   $280BCE[7] = $280D34   THE SAME ENTRY
//
// So four dispatch indices are two bodies, and the two differ by ONE instruction --
// hook 4's `clr.b ($1,A0)`. Three of the four cost nothing at all, the same way W286's
// kind 16 and W287's eight did: **read the table entry, not just the routine.**
//
// And `$280CD4` differs from the ported `$280C84` in ONE expression: the speed draw is
// `abs($242B3C) >> 1` where `$280C84` uses `$2431F4 >> 1`. It sets `($1A,A0) = $420`
// first, which the shared fill already does, and then `bra $280C8C` lands in the SAME
// tail. So this is a parameter, not a routine.
const FINISH_SPEED_242B3C = Object.freeze({ speedFrom242B3C: true, speedBump: 5 });
const FINISH_HOOKS_4_TO_7 = Object.freeze({
  0x10: Object.freeze({ hooks: 0x280c4e, status: null, site: 0x280d28,
    ...FINISH_SPEED_242B3C, clearByte1: true }),
  0x14: Object.freeze({ hooks: 0x280c4e, status: null, site: 0x280d34,
    ...FINISH_SPEED_242B3C }),
  0x18: Object.freeze({ hooks: 0x280c4e, status: null, site: 0x280d34,
    ...FINISH_SPEED_242B3C }),
  0x1c: Object.freeze({ hooks: 0x280c4e, status: null, site: 0x280d34,
    ...FINISH_SPEED_242B3C }),
});

// W312: HOOKS 2, 3 AND 17, and the first two are the same twenty-four bytes TWICE.
//
//   $280BCE[ 2] = $280CF8
//   $280BCE[ 3] = $280D10   byte-identical to $280CF8, not the same entry
//   $280BCE[17] = $280DBA
//
// `$280CF8` and `$280D10` are `2E004EB900242E240240001FD12800184268002020074E75` -- the same
// twenty-four bytes at two addresses. That is the FOURTH duplicate in this dispatch and the
// first of a new sort: W286's kind 16 and W298's 5/6/7 were the same table ENTRY, while these
// two are duplicated CODE. Same lesson, different mechanism.
//
//   move.l D0,D7 / jsr $242E24 / andi.w #$1F,D0 / add.b D0,($18,A0)
//   clr.w ($20,A0) / move.l D7,D0 / rts
//
// **And they do none of the shared speed and angle work.** No `$420`, no hook-offset add, no
// `bsr $280C84`, no vector -- just a random 0..31 added to the BYTE at `($18,A0)` and the
// waypoint long cleared. `$280B3E` itself only dispatches (`lea ($280BCE,PC),A1 / adda.w D0,A1 /
// movea.l (A1),A1 / jsr (A1)`), so all of that work belongs to the hooks and the port had
// hoisted it into the fill because all fifteen translated kinds happened to do it. These two are
// why it is now gated on `sharedSpeedBody`.
//
// `move.l D0,D7` / `move.l D7,D0` around the draw is the other detail: the hook must not clobber
// D0, because `$280B3E`'s caller still wants the kind.
const FINISH_JITTER = Object.freeze({
  hooks: 0x280c4e, status: null, sharedSpeedBody: false, jitterBlink: true,
});

const IMPACT_FINISH = Object.freeze({
  0x00: Object.freeze({ hooks: 0x280c4e, status: null, site: 0x280c5e }),
  0x08: Object.freeze({ ...FINISH_JITTER, site: 0x280cf8 }),
  0x0c: Object.freeze({ ...FINISH_JITTER, site: 0x280d10 }),
  // W312 hook 17: the shared body, W287's hook BLOCK 1, and a status rewrite to $14 -- so it is
  // one table row. `$280DBE move.w #$420,($1A,A0)` is what the shared fill already writes, and
  // `$280DD0 lea ($280C1E,PC),A3` with `$242EC2 & $E` is the pattern `$280DEA` established.
  0x44: Object.freeze({ hooks: 0x280c1e, status: 0x14, site: 0x280dba }),
  0x48: Object.freeze({ hooks: 0x280c2e, status: 0x18, site: 0x280dea }),
  0x4c: Object.freeze({ hooks: 0x280c3e, status: 0x1c, site: 0x280e1a }),
  ...FINISH_HOOKS_4_TO_7,
  ...FINISH_FAMILY,
});
const IMPACT_FINISH_DISPATCH = 0x280bce;

export function allocPoolA27F8F0(ram, rom, ctx, kind, offset, layer, carrierA6) {
  const finish = IMPACT_FINISH[kind];
  if (!finish) {
    // The message must NOT read the ROM: $280BCE is code and in no window, so building
    // the diagnosis out of it would throw a DIFFERENT error than the one being reported.
    unreached(0x280bce, `$280BCE's finish dispatch has no translated entry for `
      + `D0 = $${(kind >>> 0).toString(16).toUpperCase()}. EIGHTEEN of its twenty are `
      + `translated: $280C5E (D0 = 0), W312's hooks 2 and 3 ($280CF8 and the byte-identical `
      + `$280D10, which do no speed work at all), W298's hooks 4..7 (two bodies, and 5/6/7 `
      + `are the SAME entry $280D34), W287's family of eight at indices 8..15 (one body over `
      + `a hook block and a player record), W312's hook 17 ($280DBA), $280DEA ($48) and `
      + `$280E1A ($4C). The two that remain are indices 1 and 16, which are BOTH $280CEE `
      + `and belong to allocBee27F92A rather than here. `
      + `Read $280BCE + $${
        (kind >>> 0).toString(16).toUpperCase()} out of the image to see which routine `
      + `this D0 wants, and port THAT rather than widening a window here`);
  }
  // The template half comes from the cartridge for EVERY kind; `IMPACT_KIND` keeps only
  // the fields that are not in it (the step, the end sprite and the collect behaviour),
  // and those belong to the per-kind body rather than to this fill.
  const spec = {
    ...(IMPACT_KIND[kind] ?? {}),
    ...impactTemplate280B4A(rom, kind),
    status: finish.status,
    owner: finish.owner,                     // W287: hooks 8..15 only
    speedFrom242B3C: finish.speedFrom242B3C,  // W298: hooks 4..7
    speedBump: finish.speedBump,
    clearByte1: finish.clearByte1,
    // W312: hooks 2 and 3 do NOT do the shared speed/angle work, so it is a hook property now
    // rather than something every kind does. Defaulting to true keeps the fifteen kinds that
    // were translated before this wave exactly as they were.
    sharedSpeedBody: finish.sharedSpeedBody !== false,
    jitterBlink: finish.jitterBlink,
    hookOffsets: Array.from({ length: 8 }, (_, i) => rom.u16(finish.hooks + i * 2)),
  };
  const d2 = u16((layer & 0xff) << 2);
  if ((d2 >> 2) >= POOL_A.layerEntries) {
    unreached(0x27f8f0, `$27F8F0 layer ${layer & 0xff} indexes past the ${
      POOL_A.layerEntries} live emitter rows`);
  }
  for (let i = 0; i < POOL_A.generalSlots; i++) {
    const slot = POOL_A.base + i * POOL_A.stride;
    if (ram.u16(slot) === 0)
      return fillGeneralImpact280B3E(ram, rom, ctx, slot, kind,
        offset, d2, carrierA6, spec);
  }
  note(ctx, 0x27f8f0, '$27F8F0 general Pool-A allocation dropped: all 70 slots full');
  return null;
}

function fillGeneralImpact280B3E(ram, rom, ctx, slot, kind, offset, d2,
  carrierA6, spec) {
  ram.setU16(POOL_A.liveCount, u16(ram.u16(POOL_A.liveCount) + 1));
  ram.setU16(slot + B.status, kind | 0x8000);

  // $280B56 `add.l ($2,A6),D1` -- a LONG add, so the carry crosses from the low
  // packed half into the high one AND the caller's high word is part of the sum.
  // The following $280B5A `add.w $813176,D1` scroll is a WORD add and does not.
  //
  // W374 REMOVES AN `& 0xffff` THAT USED TO SIT ON `offset`, and it was losing data
  // every frame a type $1B died. `$2696F8 move.l (A4)+,D1` walks the four longs at
  // $26970C -- $04000280 / $0400FD80 / $FC00FD80 / $FC000280 -- and EVERY high word
  // is non-zero. They are the four corners of a rectangle around the dying enemy,
  // +/-$0400 on the packed high half and +/-$0280 on the low one. Masking the offset
  // to a word threw the +/-$0400 away and collapsed the four corners onto TWO points
  // that differ only on the low axis, so the death burst was a segment and not a box.
  //
  // It is equally correct for the `moveq`/`u16(...)` callers: the cartridge zero-
  // extends D1 into a LONG before the `add.l`, so their high word is a real zero and
  // the low-to-high carry the mask suppressed is the cartridge's own behaviour.
  let pos = (ram.u32(carrierA6 + B.pos) + (offset >>> 0)) >>> 0;
  pos = ((pos & 0xffff0000)
    | u16((pos & 0xffff) + ram.u16(POOL_A.scrollShort))) >>> 0;
  ram.setU32(slot + B.pos, pos);
  let t = u16((pos & 0xffff) + 0x0e00);
  t = u16(t + ram.u16(0x813172));
  t = u16(t + 0xac00);
  if (t < 0xac00) return fillAbort280B2A(ram, slot);
  let tx = u16((pos >>> 16) + 0x0800);
  tx = u16(tx + 0x6000);
  if (tx < 0x6000) return fillAbort280B2A(ram, slot);

  ram.setU32(slot + B.spriteOff, spec.spriteOff);
  ram.setU32(slot + B.sprite, spec.sprite);
  ram.setU16(slot + B.size, spec.size);
  ram.setU32(slot + B.hitLongA, spec.hitA);
  ram.setU32(slot + B.hitShortA, spec.hitB);
  ram.setU16(slot + B.blinkTimer, spec.animWord);
  ram.setU16(slot + B.tpl1C, spec.tpl1C);
  ram.setU32(slot + B.layerEmitter, LAYER_EMITTERS[d2 >> 2]);

  // W312: HOOKS 2 AND 3 END HERE. `$280CF8`/`$280D10` add a random 0..31 to the BYTE at
  // `($18,A0)` and clear the waypoint long, and that is their whole body -- no `$420`, no
  // hook-offset add, no speed, no angle, no vector. `$280B3E` only dispatches, so everything
  // below belongs to the hooks and not to the fill.
  //
  // `move.l D0,D7` around `jsr $242E24` preserves the caller's D0; the port's D0 is a parameter,
  // so the save is structural rather than something to reproduce.
  if (spec.jitterBlink) {
    ram.setU8(slot + B.blinkTimer,                        // $280D04 add.b D0,($18,A0)
      (ram.u8(slot + B.blinkTimer) + (drawByte242E24(ram, rom) & 0x1f)) & 0xff);
    ram.setU16(slot + B.waypoint, 0);                     // $280D08 clr.w ($20,A0)
    return slot;                                          // $280D0E rts
  }

  // `$280DEA/$280E1A`: initial even animation phase, then the shared random
  // speed/angle hook and cached `$241812` velocity.
  ram.setU16(slot + B.speed, 0x0420);
  const phase = (drawWord242EC2(ram, rom) & 0x0e) >> 1;
  ram.setU32(slot + B.sprite,
    (ram.u32(slot + B.sprite) + spec.hookOffsets[phase]) >>> 0);
  // W298: WHICH RNG FEEDS THE SPEED IS THE ONLY THING HOOKS 4..7 CHANGE.
  //
  //   $280C84  jsr $2431F4 / lsr.w #1,D0            the path W264 ported
  //   $280CD4  jsr $242B3C / bpl / neg.b D0 /       hooks 4, 5, 6 and 7
  //            ext.w D0 / lsr.w #1,D0  -> $280C8C
  //
  // `$280CD4` also writes `move.w #$420,($1A,A0)` before the draw, which the line
  // above already does, and then `bra $280C8C` lands in the SAME tail -- so the two
  // differ in one expression and nothing else. `abs()` is `bpl / neg.b`, taken on the
  // BYTE and then `ext.w`-ed, so a draw of $80 becomes $80 and not $FF80.
  // ONE draw either way -- the RNG is stateful (`$242B3C addq.b #1,$803917`), so
  // drawing twice to test the sign would advance it and desynchronise every later
  // draw in the frame.
  let speedDraw;
  if (spec.speedFrom242B3C) {
    const b = drawByte242B3C(ram, rom);                  // $280CDE jsr $242B3C
    const signed = (b << 24) >> 24;                      // the BYTE's sign
    const abs = signed < 0 ? ((-b) & 0xff) : b;          // $280CE4 bpl / $280CE6 neg.b
    speedDraw = ((abs << 24) >> 24) >> 1;                // $280CE8 ext.w / $280CEA lsr.w
  } else {
    speedDraw = drawByte2431F4(ram, rom) >> 1;           // $280C84 / $280C8A
  }
  ram.setU8(slot + B.speed, ram.u8(slot + B.speed) + speedDraw);
  // $280D2E / $280D36 addq.b #5,($1a,A0) -- hooks 4..7 only.
  if (spec.speedBump) {
    ram.setU8(slot + B.speed, (ram.u8(slot + B.speed) + spec.speedBump) & 0xff);
  }
  // $280D2A clr.b ($1,A0) -- hook 4 ALONE, and it is the only thing separating 4 from
  // 5, 6 and 7, which all share `$280D34`.
  if (spec.clearByte1) ram.setU8(slot + 0x01, 0);
  const spread = drawSigned242FDE(ram, rom) + 1;
  ram.setU8(slot + B.angle,
    ram.u8(slot + B.angle) + drawByte2431F4(ram, rom) - spread);
  const v = ctx.tables.vector(ram.u8(slot + B.speed), ram.u8(slot + B.angle));
  ram.setU16(slot + B.waypoint, v.dy);
  ram.setU16(slot + B.waypoint + 2, v.dx);
  // $280E10/$280E40 -- the two `bsr $280C84` variants normalise the status afterwards.
  // $280C5E INLINES that tail instead and does NOT normalise, so a null status here is
  // the ROM's own behaviour rather than a missing measurement.
  if (spec.status !== null) {
    ram.setU16(slot + B.status,
      (ram.u16(slot + B.status) & 0xff83) | spec.status);
  }
  // W287: hooks 8..15 also write WHICH PLAYER the impact belongs to.
  // `$280D8C move.l #$8103E6,($24,A0)` for 8..11 and `$810448` for 12..15 -- the
  // only field the eight add on top of the shared fill, and the only reason they are
  // eight entries rather than four.
  if (spec.owner !== undefined) {
    ram.setU32(slot + 0x24, spec.owner);
  }
  return slot;
}

/**
 * `$280B3E` -- the fill.  Writes the status, the position (carrier + scroll,
 * with an off-screen abort), the 22-byte template (skipping +$1A/+$1B), the
 * layer emitter, and calls the kind-specific fill hook.  Returns the slot
 * address, or `null` if the spawn position was off-screen ($280B2A abort).
 */
export function fillBee280B3E(ram, rom, ctx, slot, kind, d2, carrierA6) {
  // $280B3E: bump the live count.
  ram.setU16(POOL_A.liveCount, u16(ram.u16(POOL_A.liveCount) + 1)); // $280B3E

  // $280B4E: status word = kind ($0004 or $0040).  $280B50: set allocated bit.
  ram.setU16(slot + B.status, u16(kind | 0x8000));        // $280B4E/$280B50

  // $280B54..$280B60: position = carrier_pos + scroll_short (into the LOW word).
  // D1 starts as 0 (moveq from the allocator), so D1 = carrier_pos after the
  // add.l.  Then add.w $813176 to D1's low word (short axis).
  const carrierPos = ram.u32(carrierA6 + B.pos);          // $280B56 add.l ($2,A6),D1
  let pos = carrierPos;                                   // D1 was 0
  const posLo = u16((pos & 0xffff) + ram.u16(POOL_A.scrollShort)); // $280B5A
  pos = ((pos & ~0xffff) | posLo) >>> 0;
  ram.setU32(slot + B.pos, pos);                          // $280B60 move.l D1,(A0)+

  // $280B62..$280B7C: off-screen spawn test.  Same shape as the carrier's own
  // bounds test (handlers.js $276710) and the idle step's: compute Y + scroll +
  // offsets and check for unsigned wrap ($FFFF carry -> off-screen).  If either
  // axis wraps, ABORT ($280B2A): undo the count bump, free the slot, return.
  let t = u16(posLo + 0x0e00);                            // $280B62 addi.w #$E00,D1
  t = u16(t + ram.u16(0x813172));                         // $280B66 add.w $813172
  t = u16(t + 0xac00);                                    // $280B6C addi.w #-$5400
  if (t < 0xac00) return fillAbort280B2A(ram, slot);      // $280B70 bcs (carry = wrap)
  // swap to X: the high word of the position longword.
  let tx = u16((pos >>> 16) + 0x0800);                    // $280B74 addi.w #$800
  tx = u16(tx + 0x6000);                                  // $280B78 addi.w #$6000
  if (tx < 0x6000) return fillAbort280B2A(ram, slot);     // $280B7C bcs

  // $280B80..$280B8E: copy the 22-byte template, skipping +$1A/+$1B.
  // The template pointer table at $280E4A is NOT in an exported ROM window
  // (the $280Bxx/$280Exx range is unexported), so the 22 bytes are transcribed
  // as the BEE_TEMPLATE constant ([M] read from the image at $280EB0).  This
  // is the same approach items.js takes for its own ANIM_LISTS, and every byte
  // is cited to the image in the constant's own comment.
  // Template layout (22 bytes, copied to +$06..+$1C with the skip):
  //  [0:4]   -> +$06  (sprite offsets long)
  //  [4:8]   -> +$0A  (sprite descriptor long)
  //  [8:10]  -> +$0E  (width/height word)
  //  [10:14] -> +$10  (hitbox long)
  //  [14:18] -> +$14  (hitbox long)
  //  [18:20] -> +$18  (blink timer word)
  //  SKIP +$1A/+$1B (addq #2,A0 = $280B8C)
  //  [20:22] -> +$1C  (template word)
  ram.setU32(slot + 0x06,  (BEE_TEMPLATE[0]  << 24 | BEE_TEMPLATE[1] << 16
    | BEE_TEMPLATE[2]  << 8 | BEE_TEMPLATE[3]) >>> 0);   // $280B80
  ram.setU32(slot + 0x0a,  (BEE_TEMPLATE[4]  << 24 | BEE_TEMPLATE[5] << 16
    | BEE_TEMPLATE[6]  << 8 | BEE_TEMPLATE[7]) >>> 0);   // $280B82
  ram.setU16(slot + 0x0e, (BEE_TEMPLATE[8]  << 8 | BEE_TEMPLATE[9]));  // $280B84
  ram.setU32(slot + 0x10,  (BEE_TEMPLATE[10] << 24 | BEE_TEMPLATE[11] << 16
    | BEE_TEMPLATE[12] << 8 | BEE_TEMPLATE[13]) >>> 0);   // $280B86
  ram.setU32(slot + 0x14,  (BEE_TEMPLATE[14] << 24 | BEE_TEMPLATE[15] << 16
    | BEE_TEMPLATE[16] << 8 | BEE_TEMPLATE[17]) >>> 0);   // $280B88
  ram.setU16(slot + 0x18, (BEE_TEMPLATE[18] << 8 | BEE_TEMPLATE[19]));  // $280B8A
  // +$1A/+$1B SKIPPED ($280B8C addq #2,A0): carrier provides speed/angle.
  ram.setU16(slot + 0x1c, (BEE_TEMPLATE[20] << 8 | BEE_TEMPLATE[21]));  // $280B8E

  // $280B94..$280B9E: layer emitter from the table $280BB6, indexed by D2.
  // LAYER_EMITTERS is [M] from the image; the table is in an unexported window.
  ram.setU32(slot + B.layerEmitter, LAYER_EMITTERS[d2 >> 2]); // $280B9E

  // $280BA2..$280BAC: kind-specific fill hook.  For kind 1 ($280CEE):
  // `move.w #$9601,($1E,A0) / bra rts`.  For kind 16, a different hook.
  runFillHook(ram, kind, slot);                           // $280BAC jsr (A1)

  return slot;
}

/** `$280B2A` -- the off-screen abort: undo the count bump, free the slot. */
function fillAbort280B2A(ram, slot) {
  ram.setU16(POOL_A.liveCount, u16(ram.u16(POOL_A.liveCount) - 1)); // $280B2C
  ram.setU16(slot + B.status, 0);                         // $280B32 clr.w (-$6,A0)
  return null;
}

/** Dispatch the kind-specific fill hook. **BOTH kind 1 and kind 16 are ported**, because
 *  `$280BCE[1]` and `$280BCE[16]` are the SAME entry `$280CEE` -- see the note in the body.
 *
 *  This docstring used to read "Only kind 1 ($280CEE) is ported; kind 16 would need its own (but
 *  the flying bee is REFUSED at the body)". Both halves stopped being true at W286, which wired
 *  kind 16 through the same two instructions, and neither the allocator (`$27F92A` accepts kinds 1
 *  and 16 alike) nor the driver (`$27F99E[1]` and `[16]` are both `$27FACC`) refuses it either.
 *
 *  It is corrected here because a docket item was built on it: D20 opened with "kind 16 still
 *  throws `Unreached $280CEE` ... START HERE" as the leading explanation for the owner's report
 *  that too few medals spawn, and spent a wave's worth of attention on a path that had been closed
 *  for fourteen waves. A comment that outlives its condition is not inert. */
function runFillHook(ram, kind, slot) {
  // W286: **KIND 16 SHARES KIND 1's HOOK, AND THE TABLE SAYS SO.**
  //
  //   $280BCE[ 1] = $280CEE      kind 1, the medal
  //   $280BCE[16] = $280CEE      kind 16, the flying variant -- THE SAME ENTRY
  //
  // This used to throw for kind 16, on the reasonable-looking grounds that only kind
  // 1's hook had been transcribed. But there is nothing to transcribe: the two kinds
  // dispatch to the same two instructions, so refusing kind 16 was refusing a path the
  // port already had. `allocBee27F92A` accepts both kinds (`$27F92A`'s own refusal is
  // "not 1 and not 16"), so the throw was reachable from the allocator's own contract
  // -- and it threw AFTER the slot was claimed, leaking one of the reserved ten per
  // attempt.
  //
  // The family check, once more: before writing a hook, look at whether the table
  // already points at one the port has.
  if (kind === KIND.bee || kind === KIND.beeFlying) {
    // $280CEE: move.w #$9601,($1E,A0) / bra $27F926 (rts trampoline)
    ram.setU16(slot + B.hitCount, 0x9601);                // $280CEE
    return;
  }
  unreached(POOL_A.fillHookBee, `$280BAC jsr (A1) -- the fill hook for kind $${
    (kind >> 2).toString(16).toUpperCase()} is neither kind 1's nor kind 16's, and `
    + `those two are the only entries of $280BCE that point at $280CEE. The other `
    + `eighteen hooks need their own transcription; read $280BCE + kind to see which `
    + `one this D0 wants`);
}

// ========================= $27F95A, THE DRIVER ==============================
//
//   27f95a: move.w $817F7E,D7 / beq rts
//   27f962: subq.w #1,D7            <- dbra count (live_count - 1)
//   27f964: lea $8171BE,A6          <- ALL 80 slots as one array
//   27f96a: move.w $813176,D6       <- scroll word (short axis)
//   27f976: move.w (A6),D1 / beq advance   <- scan forward over empty slots
//   27f97a: sub.w D6,($4,A6)        <- scroll the record
//   27f97e: moveq #$7C,D0 / and D1,D0  <- 5-bit kind INDEX
//   27f982: tst.b D1 / bmi $2810CA  <- a higher-priority arm (bit 7 of low byte)
//   27f988: lea ($27F99E,PC),A0 / adda D0 / movea.l (A0),A0 / jsr (A0)
//   27f994: lea ($2C,A6),A6 / dbra D7
//
// THE WALK IS BOUNDED BY THE COUNT AND BY NOTHING ELSE.  The ROM's `dbra D7`
// scans forward over empty slots without a slot cap; if the count over-reports
// the scan walks off the end.  The port caps at `totalSlots` (80) and THROWS.

/**
 * `$27F95A` -- step, scroll, dispatch and emit the whole impact pool, once per
 *  frame.  Type-5 call #4 (`$28B5EC`, listed in `src/type5.js calls[3]`).
 *  @returns telemetry; the ROM returns none.
 */
export function runPoolADriver(ram, rom, ctx) {
  let d7 = ram.u16(POOL_A.liveCount);                     // $27F95A
  const t = { live: 0, emitted: 0, freed: 0, collected: 0, walked: 0, scrolled: 0 };
  if (d7 === 0) return t;                                 // $27F960 beq
  d7--;                                                   // $27F962 subq.w #1 (dbra)
  const d6 = ram.u16(POOL_A.scrollShort);                 // $27F96A move.w $813176
  let slot = 0;
  for (let n = 0; n <= d7; n++) {                         // $27F998 dbra D7
    // $27F976 move.w (A6),D1 / beq advance: scan forward over empty slots
    let a6 = -1;
    for (; slot < POOL_A.totalSlots; slot++) {            // $27F972 lea ($2C,A6),A6
      const r = POOL_A.base + slot * POOL_A.stride;
      if (ram.u16(r) !== 0) { a6 = r; break; }            // $27F976 move.w (A6),D1 / beq
    }
    if (a6 < 0) {
      unreached(0x27f976, `$27F95A's walk ran out of slots: $817F7E = $${
        ram.u16(POOL_A.liveCount).toString(16).toUpperCase()} but only $${
        t.live} live record(s) found in the ${POOL_A.totalSlots}-slot pool. `
        + `The count and the slots have disagreed`);
    }
    slot++;
    t.live++; t.walked++;
    const d1 = ram.u16(a6 + B.status);                    // $27F976
    // $27F97A sub.w D6,($4,A6): scroll the SHORT axis (X).
    ram.setU16(a6 + B.posX, u16(ram.u16(a6 + B.posX) - d6)); // $27F97A
    t.scrolled++;
    // $27F97E/$27F980: 5-bit kind index = status & $7C (a byte offset into
    // the stride-4 table at $27F99E, NOT a plain index).
    const d0 = d1 & 0x7c;                                 // $27F97E/$27F980
    // $27F982 tst.b D1 / bmi $2810CA: bit 7 selects the collected animation.
    // Type A3's kinds 18/19 set it through `$280FDC` on their collision frame.
    if ((d1 & 0x80) !== 0) {
      const r = collectedImpact2810CA(ram, rom, a6);
      if (r?.emitted) t.emitted++;
      if (r?.freed) t.freed++;
      if (r?.collected) t.collected++;
      continue;
    }
    // Range-check the dispatch table to 20 entries.  $27F99E has 20 longs;
    // indices 20..31 (status & $7C = $A0..$FC) run off the end into code.
    const idx = d0 >> 2;
    if (idx >= POOL_A.dispatchEntries) {
      unreached(POOL_A.dispatch, `$27F988 lea ($27F99E,PC),A0 / adda.w D0,A0 `
        + `-- a live pool-A record carries status $${
          d1.toString(16).toUpperCase()}, whose masked kind $${
          d0.toString(16).toUpperCase()} is index ${idx} of a `
        + `${POOL_A.dispatchEntries}-entry table. Indices 20..31 run off the `
        + `end into code at $27F9EE. Record at $${
          a6.toString(16).toUpperCase()}`);
    }
    // $27F988..$27F992: lea table / adda D0 / movea.l (A0),A0 / jsr (A0).
    const body = DISPATCH[idx];                           // $27F990 movea.l (A0),A0
    const r = runBody(ram, rom, ctx, a6, d1, body, d7 - n); // $27F992 jsr (A0)
    if (r?.emitted) t.emitted++;
    if (r?.freed) t.freed++;
    if (r?.collected) t.collected++;
  }
  return t;
}

// =========================== $27FACC, THE BEE BODY ==========================

/**
 * Run one pool-A body by its dispatch address.  Only `$27FACC` (kinds 1 and 16,
 * the bee plus Stage-4 kinds 18/19 are ported; remaining bodies are loud named
 * throws.
 * @returns {{emitted?:boolean,freed?:boolean,collected?:boolean}|void}
 */
/** `subq.b #1 / bcc` -- the OLD-ZERO BORROW: it reloads on the frame the counter was
 *  ALREADY zero, not the frame it reaches zero. */
function due8(ram, addr) {
  const old = ram.u8(addr);
  ram.setU8(addr, old - 1);
  return old === 0;
}

/**
 * `$27FA30` -- POOL-A KIND 0'S BODY, which is what the screen clear's own effect runs.
 * W264 wired the allocator and the driver then reached this, so D3 needs both halves.
 * It is short and it is all one shape: an animation cursor, a velocity recompute, one
 * position step, an off-screen free, and a parity-gated draw.
 *
 *     27fa30: andi.w #$1800,D1 / bne      bits 11 or 12 set and it does NOTHING at all
 *     27fa36: subq.b #$1,$18(a6) / bcc    the OLD-ZERO BORROW on the anim timer
 *     27fa42: addi.l #$24,$A(a6)          ...and the sprite steps $24
 *     27fa4c: cmpi.l #$1BCD0C / bne       WRAPPING at an exact value, not a count
 *     27fa54: move.l #$1BCACC,$A(a6)
 *     27fa5a: tst.w $803912 / bne         paused: keep the cached velocity
 *     27fa62: tst.w $8130D2 / bne         frozen: do not ramp the speed
 *     27fa6a: addq.b #$1,$1A(a6)          the speed ramps every unfrozen frame
 *     27fa7a: jsr $241812                 and the velocity is RECOMPUTED, then cached
 *     27fa88: $20(a6) added to $4/$2      one step, short axis then long
 *     27fa96: bmi                         a NEGATIVE long axis is the free
 *     27fa98: cmpi.w #$3C,$817F7E / bcs   under $3C live and it always draws
 *     27faa4: 1 & D7 vs $80390C / beq     at or over it, it draws every OTHER frame,
 *                                         alternating by the record's own walk index
 *
 * That last gate is the interesting one: the pool THINS ITSELF when it is busy, by
 * parity on the walk position rather than by dropping records. `remaining` is D7, the
 * dbra counter, which is why the driver threads it through.
 */
function poolAKind0Body27FA30(ram, rom, ctx, a6, d1, remaining) {
  // W411 CORRECTS W265. `$27FA34` is `66 b8` -- `bne` with an $B8 = -$48
  // displacement off $27FA36, i.e. **$27F9EE, BACKWARD**, the collect arm that sits
  // between the dispatch table and this body. W265 read it as "bits 11 or 12 set and
  // it does NOTHING at all" and its test pinned that, so a star the player touched
  // was never collected, never scored and never counted -- half of docket D44.
  if ((d1 & 0x1800) !== 0) {                              // $27FA30/$27FA34 bne $27F9EE
    return poolACollectArm(ram, rom, ctx, a6, d1, COLLECT_ARMS.star27F9EE);
  }
  if (due8(ram, a6 + 0x18)) {                             // $27FA36 subq.b/bcc
    ram.setU8(a6 + 0x18, ram.u8(a6 + 0x19));              // $27FA3C
    const next = (ram.u32(a6 + B.sprite) + 0x24) >>> 0;   // $27FA46 addi.l #$24
    ram.setU32(a6 + B.sprite, next === 0x001bcd0c ? 0x001bcacc : next);  // $27FA4C
  }
  if (ram.u16(POOL_A.pause) === 0) {                      // $27FA5A tst.w/bne
    if (ram.u16(POOL_A.freeze) === 0) {                   // $27FA62 tst.w/bne
      ram.setU8(a6 + B.speed, (ram.u8(a6 + B.speed) + 1) & 0xff);  // $27FA6A addq.b
    }
    const v = ctx.tables.vector(ram.u8(a6 + B.speed),     // $27FA7A jsr $241812
      ram.u8(a6 + B.angle) & 0x3f);                       // $27FA76 and.b #$3F
    ram.setU16(a6 + 0x20, v.dy);                          // $27FA80
    ram.setU16(a6 + 0x22, v.dx);                          // $27FA84
  }
  // $27FA88..$27FA92 -- D2 is the cached pair: its LOW half moves the short axis and
  // its HIGH half, after the swap, the long one.
  ram.setU16(a6 + B.posX, u16(ram.u16(a6 + B.posX) + ram.u16(a6 + 0x22)));
  ram.setU16(a6 + B.pos, u16(ram.u16(a6 + B.pos) + ram.u16(a6 + 0x20)));
  if ((ram.u16(a6 + B.pos) & 0x8000) !== 0) {             // $27FA96 bmi
    return freePoolA(ram, a6);                            // $27FABC..$27FAC4
  }
  // $27FA98 -- busy pool: draw on alternating walk positions instead of dropping.
  if (ram.u16(POOL_A.liveCount) >= 0x3c
    && (remaining & 1) === ram.u16(0x80390c)) {
    return undefined;                                     // $27FABA rts
  }
  enqueueThroughStub(ram, rom, 0x23eba0, a6);             // $27FAB2 jmp $23EBA0
  return undefined;
}

/**
 * `$27FE0E` -- POOL-A KIND INDEX 2'S BODY, the GOLD DISC (docket D44/D45's medal).
 * Art `$1BE2CC`, 4 x 24, template `$280EC6`, finish hook `$280CF8` (the jitter), and
 * the counters `$817F84`/`$817F88` that `$28DB70` values at TWENTY on the result
 * screen where the star's `$817F86`/`$817F8A` are worth ten.
 *
 * The head is three tests and nothing else:
 *
 *     27fe0e: tst.w $8130F8 / bmi $27FE5E    the boss flag -- bit 15 of the WORD is
 *                                            bit 7 of the byte $294DDC bset #$7 sets,
 *                                            and it FREES the record outright
 *     27fe16: andi.w #$1800,D1 / beq $27FE6E bits 11/12 -> the collect arm below,
 *                                            otherwise the ordinary step
 *
 * `$27FE5E` is `moveq #0 / move.w D0,(A6) / move.w D0,($2,A6) / subq.w #1,$817F7E /
 * rts` -- the same five instructions as `$27FC7C`, which is why this reuses it.
 */
function poolAKind2Body27FE0E(ram, rom, ctx, a6, d1) {
  // $27FE0E tst.w $8130F8 / $27FE14 bmi. A WORD test, so it is bit 15 of the word =
  // bit 7 of the byte at $8130F8 -- `boss.js`'s `bset #$7`. Not the $242EC2 hazard
  // (docket D48): nothing was drawn here, the flag is read straight out of RAM.
  if ((ram.u16(0x8130f8) & 0x8000) !== 0) {               // $27FE14 bmi $27FE5E
    return offscreenFree27FC7C(ram, a6);
  }
  if ((d1 & 0x1800) !== 0) {                              // $27FE1A beq $27FE6E
    return poolACollectArm(ram, rom, ctx, a6, d1, COLLECT_ARMS.medal27FE0E);
  }
  return medalStep27FE6E(ram, rom, a6);
}

/**
 * `$27FE6E` -- kind 2's ordinary step.  It has NO velocity of its own: the driver
 * already moved the short axis by `$813176`, and this adds `$80B03C` to the long one
 * unless motion is frozen.  Then the bounds test, the animation, and the emit.
 *
 * The bounds test is the bee's `$27FCA8` shape with the two arms in the other order,
 * and both are `addi.w` CARRY tests rather than sign tests, which is not the same
 * thing: `$27FE96 addi.w #$800 / $27FE9A addi.w #$7800` frees a long axis in
 * `[$8000,$F7FF]` and lets `[$F800,$FFFF]` through, because the first `addi.w` wraps
 * it back down before the second one can carry.
 */
function medalStep27FE6E(ram, rom, a6) {
  if (ram.u16(POOL_A.freeze) === 0) {                     // $27FE6E tst.w / $27FE74 bne
    ram.setU16(a6 + B.pos,                                // $27FE7C add.w D0,($2,A6)
      u16(ram.u16(a6 + B.pos) + ram.u16(POOL_A.scrollLong))); // $27FE76 move.w $80B03C
  }
  const pos = ram.u32(a6 + B.pos);                        // $27FE80 move.l ($2,A6),D0
  let px = u16((pos & 0xffff) + 0x1c00);                  // $27FE84 addi.w #$1C00
  px = u16(px + ram.u16(0x813172));                       // $27FE88 add.w $813172
  px = u16(px + 0x9000);                                  // $27FE8E addi.w #$9000
  let free = px < 0x9000;                                 // $27FE92 bcs $27FE9E
  if (!free) {
    let py = u16((pos >>> 16) + 0x0800);                  // $27FE94 swap / $27FE96
    py = u16(py + 0x7800);                                // $27FE9A addi.w #$7800
    free = py < 0x7800;                                   // $27FE9E bcs $27FE5E
  }
  if (free) return offscreenFree27FC7C(ram, a6);

  // $27FEA0 subq.b #$1,($18,A6) / bcc -- the OLD-ZERO BORROW on the BYTE at +$18,
  // which is the HIGH byte of the word the fill's jitter hook ($280D04 add.b) seeded
  // with $01 + a random 0..31.  The reload comes from ($19,A6), the template's $01.
  if (due8(ram, a6 + B.blinkTimer)) {                     // $27FEA4 bcc $27FECA
    ram.setU8(a6 + B.blinkTimer, ram.u8(a6 + B.blinkTimer + 1)); // $27FEA6
    // $27FEB0 addi.l #$34,(A0) writes FIRST; the compare then replaces it, so the
    // record never holds $1BE60C.  On the wrap the timer is forced to 1, NOT to the
    // reload byte -- one instruction that makes the wrap frame a beat longer.
    ram.setU32(a6 + B.sprite, (ram.u32(a6 + B.sprite) + 0x34) >>> 0); // $27FEB0
    if (ram.u32(a6 + B.sprite) === 0x001be60c) {          // $27FEB6 cmpi.l / bne
      ram.setU32(a6 + B.sprite, 0x001be2cc);              // $27FEBE move.l #$1BE2CC
      ram.setU8(a6 + B.blinkTimer, 0x01);                 // $27FEC4 move.b #$1,($18,A6)
    }
  }
  // $27FECA movea.l ($28,A6),A0 / $27FECE jmp (A0) -- the record's OWN layer emitter,
  // not kind 0's fixed $23EBA0.
  enqueueThroughStub(ram, rom, ram.u32(a6 + B.layerEmitter), a6);
  return { emitted: true };
}

function runBody(ram, rom, ctx, a6, d1, body, remaining) {
  if (body === POOL_A.body) return beeBody27FACC(ram, rom, ctx, a6, d1);
  // Kinds 0 and 4 share $27FA30 -- DISPATCH[0] and DISPATCH[4] are the same address.
  if (body === 0x27fa30)
    return poolAKind0Body27FA30(ram, rom, ctx, a6, d1, remaining);
  if (body === POOL_A.kind2Body)
    return poolAKind2Body27FE0E(ram, rom, ctx, a6, d1);
  if (body === 0x280082)
    return stage4ImpactBody(ram, rom, ctx, a6, d1,
      IMPACT_KIND[KIND.stage4Impact18], remaining);
  if (body === 0x28016a)
    return stage4ImpactBody(ram, rom, ctx, a6, d1,
      IMPACT_KIND[KIND.stage4Impact19], remaining);
  unreached(body, `$27F992 jsr (A0) -- the kind dispatch sent a live pool-A `
    + `record to $${body.toString(16).toUpperCase()}, which is not the bee body `
    + `($27FACC), kind 0/4's ($27FA30), kind 2's ($27FE0E) or Stage-4 kind 18/19's. `
    + `This remaining pool-A kind is not ported; its `
    + `D0 sources at the eleven general-allocator call sites are unattributed. `
    + `Record at $${a6.toString(16).toUpperCase()}, status $${
      d1.toString(16).toUpperCase()}`);
}

function freePoolA(ram, a6) {
  ram.setU16(a6 + B.status, 0);
  ram.setU16(a6 + B.pos, 0);
  ram.setU16(POOL_A.liveCount, u16(ram.u16(POOL_A.liveCount) - 1));
  return { freed: true };
}

// ================= $280FDC, THE COLLECTED TRANSFORM, AND ITS TABLE ===========
//
// W411. **Four collect arms share one tail, and the tail is table-driven.**
// `$27F9EE` (kinds 0/4), `$27FE0E` (kind 2), `$2800A8` (kinds 6/18) and `$280190`
// (kinds 7/19) each write a SELECTOR long to `($10,A6)` and `bra $280FDC`, which
// reads everything else out of the cartridge:
//
//   $280FDC  move.l ($10,A6),D0
//   $280FE0  lea (-$AE,PC),A0          -> $280F34, three longword selectors
//   $280FE4  movea.l (A0,D0.w),A0      the selector's LOW word is a BYTE OFFSET
//   $280FE8  swap D0 / add.w D0,D0 / add.w D0,D0
//                                      its HIGH word becomes a longword index
//   $280FEE  movea.l (A0)+,A2          the descriptor's sprite-table base
//   $280FF0  lea (A6),A1
//   $280FF2  andi.w #$F8DF,(A1)+       status: clear bits 10, 9, 8 and 5 -- F=1111,
//                                     8=1000, D=1101, F=1111, so bit 13 (the x2
//                                     flag) SURVIVES and bit 5 is inside the kind
//   $280FF6  addi.l #$6000000,(A1)+    the LONG axis moves $0600, as a LONG add
//   $280FFC  move.l (A0)+,(A1)+        +$06 the sprite offset pair
//   $280FFE  move.l (0,A2,D0.w),(A1)+  +$0A the collected sprite
//   $281002  move.w (A0)+,(A1)+        +$0E the size
//   $281010  move.w (A0)+,($16,A6)     +$16 the collected animation STEP
//
// **The step is the table's, not the body's**, and W216 got both stage-4 kinds
// wrong by reusing `spec.step` (the ORDINARY sprite advance) for it: $0064 where
// the cartridge says $0054, and $00C4 where it says $0064. Reading $280F34
// removes the possibility of that class of error for every kind at once.
//
// Only THREE selectors exist in the 6 MB image, which is what bounds the pointer
// run: $00050000, $00050004, $00010008. See the window's own note.
function collectTransform280FDC(rom, selector) {
  const idx = selector & 0xffff;                          // $280FE4 (A0,D0.w)
  if ((idx & 3) !== 0 || idx >= POOL_A.collectSelectors * 4) {
    unreached(0x280fe4, `$280FE4 movea.l (A0,D0.w),A0 -- the selector at ($10,A6) `
      + `is $${(selector >>> 0).toString(16).toUpperCase()}, whose low word $${
        idx.toString(16).toUpperCase()} is not one of the THREE longword offsets `
      + `$280F34 holds (0, 4, 8). Every collect arm in the image writes $00050000, `
      + `$00050004 or $00010008; a fourth one means a collect arm this port has not read`);
  }
  const rec = rom.u32(POOL_A.collectTable + idx);         // the 12-byte descriptor
  const base = rom.u32(rec);                              // $280FEE movea.l (A0)+,A2
  const d0 = u16(((selector >>> 16) & 0xffff) * 4);       // $280FE8 swap / add / add
  if (d0 >= POOL_A.collectSpriteEntries * 4) {
    unreached(0x280ffe, `$280FFE move.l (0,A2,D0.w),(A1)+ -- the selector's high word `
      + `$${((selector >>> 16) & 0xffff).toString(16).toUpperCase()} indexes past the `
      + `${POOL_A.collectSpriteEntries} longwords of the sprite table at $${
        base.toString(16).toUpperCase()}`);
  }
  return {
    sprite: rom.u32(base + d0),                           // $280FFE
    off: rom.u32(rec + 4),                                // $280FFC move.l (A0)+
    size: rom.u16(rec + 8),                               // $281002 move.w (A0)+
    step: rom.u16(rec + 10),                              // $281010 move.w (A0)+
  };
}

/** `$280FDC` -- the shared collected transform, everything after the per-kind
 *  counter, score, cue and `move.b #$84,($1,A6)`. */
function collectedTransform280FDC(ram, rom, ctx, a6) {
  const t = collectTransform280FDC(rom, ram.u32(a6 + B.hitLongA));
  ram.setU16(a6 + B.status, ram.u16(a6 + B.status) & 0xf8df);   // $280FF2
  ram.setU32(a6 + B.pos, (ram.u32(a6 + B.pos) + 0x06000000) >>> 0); // $280FF6
  ram.setU32(a6 + B.spriteOff, t.off);                    // $280FFC
  ram.setU32(a6 + B.sprite, t.sprite);                    // $280FFE
  ram.setU16(a6 + B.size, t.size);                        // $281002
  ram.setU16(a6 + B.hitLongB, 0x0010);                    // $281004
  ram.setU16(a6 + B.hitShortA, 0x0202);                   // $28100A
  ram.setU16(a6 + B.hitShortB, t.step);                   // $281010
  ram.setU8(a6 + B.blinkTimer, 0x07);                     // $281014
  ram.setU8(a6 + B.blinkTimer + 1, 0x0f);                 // $28101A
  ram.setU16(a6 + B.tpl1C, 0x001d);                       // $281020

  const position = u16(ram.u16(POOL_A.scrollShort) + ram.u16(a6 + B.posX)); // $281026
  const direction = position >= 0x1c00 ? 0x30 : 0x10;     // $281030..$281038
  let speed = drawByte242B3C(ram, rom);                   // $28103A
  speed = (speed << 24) >> 24;
  if (speed < 0) speed = -speed;                          // $281040 bpl / $281042 neg.b
  speed = (speed & 6) + 6;                                // $281044/$281048
  const v = ctx.tables.vector(speed, direction);          // $28104A jsr $241812
  ram.setU16(a6 + B.speed, v.dx);                         // $281050 move.w D3,($1A,A6)
}

/**
 * W411 -- THE COLLECT ARM, and it is ONE routine with five constants.
 *
 *   kind      arm       counters               add  score  selector
 *   0 and 4   $27F9EE   $817F86 / $817F8A       1    $50   $00050000
 *   2         $27FE0E   $817F84 / $817F88       1    $50   $00050000
 *   6 and 18  $2800A8   $817F86 / $817F8A       4   $500   $00050004
 *   7 and 19  $280190   $817F86 / $817F8A       8  $1000   $00010008
 *
 * `$27F9EE` and `$27FE0E`'s twenty instructions are byte-identical apart from the
 * two `lea`s, which is what says the second is the first "on a different counter"
 * rather than a routine to read again.
 */
function poolACollectArm(ram, rom, ctx, a6, d1, spec) {
  // $27FE24 btst #$C,D1 / bne -- bit 12 is P1, and the P2 counter is the FALL-THROUGH.
  const total = (d1 & 0x1000) !== 0 ? spec.collectP1 : spec.collectP2;
  let v = u16(ram.u16(total) + spec.collectAdd);          // $27FE1C moveq / $27FE30 add.w
  if (v >= 0x03e8) v = 0x03e7;                            // $27FE32 cmpi / bcs / move.w
  ram.setU16(total, v);
  ram.setU32(a6 + B.hitLongA, spec.collectSelector);      // $27FE3C move.l #...,($10,A6)
  scoreByMask(ram, spec.collectScore, ram.u8(a6 + B.status)); // $27FE44/$27FE46/$27FE48
  ctx.soundPost?.(spec.collectSound);                     // $27FE4E jsr $28C5E4
  ram.setU8(a6 + 1, 0x84);                                // $27FE54 move.b #$84,($1,A6)
  collectedTransform280FDC(ram, rom, ctx, a6);            // $27FE5A bra $280FDC
  return { collected: true };
}

/** The three collect-arm constant sets that are not the bee's. */
const COLLECT_ARMS = Object.freeze({
  // $27F9EE, reached by $27FA34's BACKWARD `bne`.  Kinds 0 and 4 -- the star.
  star27F9EE: Object.freeze({
    collectP1: POOL_A.collectP1Total, collectP2: POOL_A.collectP2Total,
    collectAdd: 1, collectScore: 0x50, collectSelector: 0x00050000,
    collectSound: 0x28c5e4,
  }),
  // $27FE0E's own tail.  Kind 2 -- the gold disc, on the OTHER pair of counters.
  medal27FE0E: Object.freeze({
    collectP1: POOL_A.medalP1Total, collectP2: POOL_A.medalP2Total,
    collectAdd: 1, collectScore: 0x50, collectSelector: 0x00050000,
    collectSound: 0x28c5e4,
  }),
});

function collectStage4Impact(ram, rom, ctx, a6, d1, spec) {
  return poolACollectArm(ram, rom, ctx, a6, d1, {
    collectP1: POOL_A.collectP1Total, collectP2: POOL_A.collectP2Total,
    collectAdd: spec.collectAdd, collectScore: spec.collectScore,
    collectSelector: spec.collectSelector, collectSound: spec.collectSound,
  });
}

function stage4ImpactBody(ram, rom, ctx, a6, d1, spec, remaining) {
  if ((d1 & 0x1800) !== 0)
    return collectStage4Impact(ram, rom, ctx, a6, d1, spec);

  const oldAnim = ram.u8(a6 + B.blinkTimer);
  ram.setU8(a6 + B.blinkTimer, oldAnim - 1);
  if (oldAnim === 0) {
    ram.setU8(a6 + B.blinkTimer, ram.u8(a6 + B.blinkTimer + 1));
    let sprite = (ram.u32(a6 + B.sprite) + spec.step) >>> 0;
    if (sprite === spec.end) sprite = spec.sprite;
    ram.setU32(a6 + B.sprite, sprite);
  }

  if (ram.u16(POOL_A.pause) === 0) {
    if (ram.u16(POOL_A.freeze) === 0)
      ram.setU8(a6 + B.speed, ram.u8(a6 + B.speed) + 1);
    const v = ctx.tables.vector(ram.u8(a6 + B.speed), ram.u8(a6 + B.angle));
    ram.setU16(a6 + B.waypoint, v.dy);
    ram.setU16(a6 + B.waypoint + 2, v.dx);
  }
  ram.setU16(a6 + B.posX,
    ram.u16(a6 + B.posX) + ram.u16(a6 + B.waypoint + 2));
  ram.setU16(a6 + B.pos,
    ram.u16(a6 + B.pos) + ram.u16(a6 + B.waypoint));
  if (i16(ram.u16(a6 + B.pos)) < i16(spec.cull)) return freePoolA(ram, a6);

  if (ram.u16(POOL_A.liveCount) < 0x3c
      || ((remaining & 1) !== ram.u16(POOL_A.collisionPhase))) {
    enqueueThroughStub(ram, rom, 0x23eba0, a6);
    return { emitted: true };
  }
  return undefined;
}

function collectedImpact2810CA(ram, rom, a6) {
  ram.setU16(a6 + B.posX, ram.u16(a6 + B.posX) + ram.u16(a6 + B.speed));
  const timer = u16(ram.u8(a6 + B.hitShortA) - 1) & 0xff;
  ram.setU8(a6 + B.hitShortA, timer);
  if (timer === 0) {
    ram.setU8(a6 + B.hitShortA, ram.u8(a6 + B.hitShortA + 1));
    const step = ram.u16(a6 + B.hitShortB);
    const life = u16(ram.u8(a6 + B.blinkTimer + 1) - 1) & 0xff;
    ram.setU8(a6 + B.blinkTimer + 1, life);
    if (life === 0) return freePoolA(ram, a6);
    const phase = u16(ram.u8(a6 + B.blinkTimer) - 1) & 0xff;
    ram.setU8(a6 + B.blinkTimer, phase);
    if (phase === 0) ram.setU8(a6 + B.hitShortA, 0x28);
    ram.setU32(a6 + B.sprite, phase >= 0x80
      ? (ram.u32(a6 + B.sprite) - step) >>> 0
      : (ram.u32(a6 + B.sprite) + step) >>> 0);
  }
  enqueueZoomedThroughStub(ram, rom, 0x23dbca, a6, 0x40004000);
  return { emitted: true, collected: true };
}

// The two 68000 register idioms this popup uses, the same pair `stageend.js` keeps
// for the result screen: `swap D1` and an `addi.w` that must not carry into the
// high word.
const d1Swap = (d) => (((d & 0xffff) << 16) | ((d >>> 16) & 0xffff)) >>> 0;
const d1AddLo = (d, v) => (((d & 0xffff0000) | ((d + v) & 0xffff)) >>> 0);

/** `$2811BE` -- the popup's DIGITS. Biases D1 on both axes across the swap, then
 *  the fixed `$20168C` tile through `$23EC20`, which is `enqueueRegisters` on
 *  BUCKET 8: `lea $808014 / adda.w $80AFCA / addi.w #$C`, then `asr.l #6`,
 *  `andi.l #$7FF03FF`, `ori.l #$80008000` and D0/D2/D3/D4 -- the same twelve bytes
 *  `enqueueRegisters` writes, with `NO_ZOOM_OR` and `ENQUEUE_MASK` already those
 *  two constants. Returns D1 AS MODIFIED, because `$2811A8 bra $28129E` runs on
 *  this routine's D1 and its biases compound. */
function popupDigits2811BE(ram, d1) {
  let d = d1AddLo(d1, 0xfdc0);                             // $2811BE addi.w #$FDC0
  d = d1Swap(d);                                           // $2811C2
  d = d1AddLo(d, 0x0200);                                  // $2811C4 addi.w #$200
  d = d1Swap(d);                                           // $2811C8
  enqueueRegisters(ram, 8, d, 0x0020168c, 0x0210, 0x001d); // $2811CA..$2811D8
  return d;
}

/** `$28129E` -- the x2 indicator, drawn only when the x2 flag is set. Its tile
 *  comes from `$2812D4` indexed by `($12,A6)`, which runs `$10` down to 0 in
 *  fours and reloads `$10` on the borrow -- five entries, and that cursor is what
 *  bounds the table. */
function popupX2_28129E(ram, rom, a6, d1) {
  let d = d1AddLo(d1, 0x0400);                             // $28129E addi.w #$400
  d = d1Swap(d);                                           // $2812A2
  d = d1AddLo(d, 0x0040);                                  // $2812A4 addi.w #$40
  d = d1Swap(d);                                           // $2812A8
  const cursor = ram.u16(a6 + B.hitLongB);                 // $2812AA move.w ($12,A6)
  const tile = rom.u32(0x2812d4 + cursor);                 // $2812B6 move.l (A0),D2
  enqueueRegisters(ram, 8, d, tile, 0x0420, 0x001d);       // $2812B8..$2812C0
  // $2812C6 subq.w #$4 / bcc -- the borrow reloads, so the five tiles cycle.
  const next = u16(cursor - 4);
  ram.setU16(a6 + B.hitLongB, cursor < 4 ? 0x0010 : next); // $2812CA/$2812CC
}

/**
 * `$28112C` -- THE BEE'S COLLECTED ANIMATION, and the "500" popup docket D6 is
 * about. The award itself never needed it (the collect arm sets bit 0 at
 * `$27FC72`); this is the whole of what the player sees.
 *
 * Its body from `$281140` is the SAME INSTRUCTIONS as `$2810CA`'s, which W111
 * already ported as `collectedImpact2810CA`: the short-axis drift by `($1a,A6)`,
 * the `($14,A6)` timer reloading from `($15,A6)`, the `($19,A6)` LIFETIME that
 * frees the slot, the `($18,A6)` sign that makes `($a,A6)` rise and then fall, and
 * the `$23DBCA` zoomed draw with D6 = `$40004000`. So this routine is that one
 * plus three things: the flicker at its head, the digits, and the x2 arm.
 */
function beeCollected28112C(ram, rom, ctx, a6, d1) {
  // $28112C btst #$D,D1 / beq -- bit 13 of the status word is the x2 flag (see
  // the collect arm), and $281132 gates the toggle on the $80390C phase, so an x2
  // popup FLICKERS one frame on and one off. $1D is the low byte of the attribute
  // word the emitter reads at +$1C, so the flicker is a colour flicker.
  if ((d1 & 0x2000) !== 0 && ram.u16(0x80390c) !== 0) {     // $28112C/$281132
    ram.setU8(a6 + 0x1d, ram.u8(a6 + 0x1d) ^ 0x10);         // $28113A eori.b #$10
  }
  const r = collectedImpact2810CA(ram, rom, a6);            // $281140..$281186
  if (r.freed) return r;                                    // $2811AE, freePoolA
  // $281188 cmpi.b #$3,($14,A6) / bcs $2811AC -- no digits below the timer floor.
  if (ram.u8(a6 + B.hitShortA) < 3) return r;
  // $281190..$28119E -- D1 out of the record's own position pair and its two
  // sprite offsets: the long axis gains ($6,A6) and the short axis loses ($8,A6).
  let d = ram.u32(a6 + B.pos);                              // $281190 move.l ($2,A6)
  d = d1AddLo(d, u16(-ram.u16(a6 + B.spriteOff + 2)));      // $281194 sub.w ($8,A6)
  d = d1Swap(d);                                            // $281198
  d = d1AddLo(d, ram.u16(a6 + B.spriteOff));                // $28119A add.w ($6,A6)
  d = d1Swap(d);                                            // $28119E
  d = popupDigits2811BE(ram, d);                            // $2811A0 bsr
  // $2811A2 btst #$5,(A6) -- the BYTE at +0, so bit 13 of the status word again.
  if ((ram.u8(a6 + B.status) & 0x20) !== 0) {               // $2811A2/$2811A6
    popupX2_28129E(ram, rom, a6, d);                        // $2811A8 bra $28129E
  }
  return r;
}

/**
 * `$27FACC` -- the bee body (kinds 1 and 16).  Dispatches on the collected,
 * P1-touch and P2-touch bits, then either collects or idles.
 */
function beeBody27FACC(ram, rom, ctx, a6, d1) {
  // $27FACC btst #0,D1: already collected?
  if ((d1 & 0x0001) !== 0) {                              // $27FAD0 bne $28112C
    return beeCollected28112C(ram, rom, ctx, a6, d1);     // W234, docket D6
  }
  // $27FAD6 btst #$C,D1: P1 touching? -> P1 collect arm
  if ((d1 & 0x1000) !== 0) {                              // $27FADA bne $27FB6C
    return collectArm(ram, rom, ctx, a6, 1);
  }
  // $27FADE btst #$B,D1: P2 touching? -> P2 collect arm (fall through if not)
  if ((d1 & 0x0800) === 0) {                              // $27FAE2 beq $27FC8C
    return idleStep27FC8C(ram, rom, ctx, a6, d1);
  }
  return collectArm(ram, rom, ctx, a6, 2);
}

// ========================= $27FB6C/$27FAE6, THE COLLECT ARM =================
//
// Both arms load D3 (no-miss counter), D4 (chain meter), D5 (chain hit count),
// apply the shared 2P adjustment, feed chain-earned hyper progress, and then
// run the score award. The score award is the same code path for both players:
//
//   $27FBEE  D1 = cursor $817F82
//   $27FBF4  addq.w #1,$817F80          <- bump bee count
//   $27FBFA  cmpi.w #$A,$817F80         <- count == 10?
//   $27FC04  tst.w D3                   <- no-miss counter == 0?  ($81293C/$81293E)
//   $27FC08  bset #$5,(A6)              <- set x2 flag (if count==10 AND no-miss)
//   $27FC0C  addq.w #4,$817F82          <- ratchet cursor +4
//   $27FC12  D0 = base_ladder[cursor]   <- the base BCD long
//   $27FC22  add.l D0,D0                <- THE BUG: binary double on packed BCD
//   $27FC24  ($10,A6) = popup_ladder[cursor]
//   $27FC30  tst D4 / tst D5            <- chain active?
//     CHAIN: $27FC42 the BCD digit-multiply: jsr $286128 once per BCD digit of D5
//     FLAT:   $27FC66 jsr $286128 once
//   $27FC6C  jsr $28C62A                <- sound cue (noted)
//   $27FC72  ori.b #$1,($1,A6)          <- set "already collected" bit

function collectArm(ram, rom, ctx, a6, player) {
  const isP1 = player === 1;
  // D3 = no-miss counter, D4 = chain meter, D5 = chain hit count.
  const d3 = ram.u16(isP1 ? POOL_A.noMissP1 : POOL_A.noMissP2); // $27FB6C/$27FAE6
  let d4 = ram.u16(isP1 ? POOL_A.chainMeterP1 : POOL_A.chainMeterP2);
  let d5 = ram.u16(isP1 ? POOL_A.chainHitsP1 : POOL_A.chainHitsP2);

  // $27FB7E btst #$1,$8130F8: 2P mode adjustment.  In 1P this is clear and the
  // branch skips to the gauge. If 2P is active, the arm reads the binary item
  // count at $81B610 and converts it through $242AC6; the low word of D2
  // becomes packed-BCD D5, while $81B60C supplies D4. A negative count clears
  // D4 but preserves the original D5, exactly like `$27FB02..$27FB1A` and
  // `$27FB88..$27FBA0`.
  if ((ram.u8(POOL_A.twoPlayer) & 0x02) !== 0) {           // $27FB7E btst #$1
    const count = ram.u16(0x81b610);                      // $27FB02/$27FB88
    if ((count & 0x8000) !== 0) {
      d4 = 0;                                             // $27FB1A/$27FBA0
    } else {
      d5 = bcd242AC6(count) & 0xffff;                     // $242AC6; move.l D2,D5
      d4 = ram.u16(0x81b60c);                             // $27FB12/$27FB98
    }
  }

  // ===================== THE CHAIN-EARNED HYPER FEED =====================
  // $27FBA2 (P1) / $27FB1C (P2): tst.w hyper / tst D4 / tst D5 / bmi ->
  // skip. Otherwise clamp packed-BCD hits to $0200, convert through $242AF6,
  // and add `$48` for every complete 20 hits. The arithmetic after conversion
  // is binary: `$27FBD0 subi #$14,D2 / $27FBD8 addi #$48,D0`.
  const active = ram.u16(isP1 ? POOL_A.hyperP1 : POOL_A.hyperP2);
  if (active === 0 && d4 !== 0 && d5 !== 0 && (d5 & 0x8000) === 0) {
    const cappedBcd = d5 > 0x0200 ? 0x0200 : d5;          // $27FBBA..$27FBC2
    const binaryHits = packedBcdWordToBinary(cappedBcd);  // $27FBC6/$242AF6
    const gain = Math.floor(binaryHits / 0x14) * 0x48;    // $27FBD0..$27FBDC
    if (BEE_MUTATE.value !== 'drop-rank-feed') {
      const earn = isP1 ? POOL_A.rankP1 : POOL_A.rankP2;
      ram.setU16(earn, u16(ram.u16(earn) + gain));         // $27FBDE/$27FB58
      grantHyper287682(ram, rom, ctx, !isP1);             // $27FBE4/$27FB5E
    }
  }

  // ======================== THE SCORE AWARD ===========================
  return scoreAward27FBEE(ram, rom, ctx, a6, d3, d4, d5);
}

/** `$242AF6`'s valid packed-BCD-word result, used after the ROM's `$0200`
 * clamp. The routine itself is a 14-pass `sbcd` table conversion; spelling
 * out its mathematical result keeps the nibble boundaries visible and avoids
 * the historical bug of treating packed BCD `$0100` as binary 256. */
function packedBcdWordToBinary(v) {
  return ((v >>> 12) & 0x0f) * 1000 + ((v >>> 8) & 0x0f) * 100
    + ((v >>> 4) & 0x0f) * 10 + (v & 0x0f);
}

/**
 * `$27FBEE` -- the flat + chain-multiply score award through $286128.
 * Awards `base x chain_hits` (or `base x 1` when no chain active).  Sets the
 * x2 flag and ratchets the cursor when count hits 10 and the no-miss flag is
 * clear.  The x2 is the documented BCD overflow bug (`add.l D0,D0` on a packed
 * BCD long), transcribed faithfully, NOT "fixed".
 */
function scoreAward27FBEE(ram, rom, ctx, a6, d3, d4, d5) {
  const d1cursor = ram.u16(POOL_A.cursor);                // $27FBEE D1 = cursor
  // $27FBF4: bump per-stage bee count.
  ram.setU16(POOL_A.beeCount, u16(ram.u16(POOL_A.beeCount) + 1)); // $27FBF4

  // $27FBFA/$27FC04/$27FC08/$27FC0C: if count == 10 AND no-miss == 0, set x2
  // and ratchet the cursor.  $81293C IS the per-player "got hit" counter
  // (writer $249FC8 addq.w #2, clear $25314A clr.w), identified this wave.
  let x2 = false;
  if (ram.u16(POOL_A.beeCount) === 10) {                  // $27FBFA cmpi.w #$A
    if (d3 === 0) {                                       // $27FC04 tst.w D3
      x2 = true;                                          // $27FC08 bset #$5
      // W234: `bset #$5,(A6)` is BYTE-sized on the byte at +0, so it sets $2000
      // of the status WORD -- bit 13, which is what $28112C's `btst #$D,D1` and
      // $2811A2's `btst #$5,(A6)` both test. This line set $0020, and bit 5 of the
      // word is INSIDE the kind field (bits 6..2), so the flag could never be read
      // and the x2 popup and its flicker could never appear.
      ram.setU16(a6 + B.status, ram.u16(a6 + B.status) | 0x2000);
      ram.setU16(POOL_A.cursor, u16(ram.u16(POOL_A.cursor) + 4)); // $27FC0C
    }
  }

  // $27FC12..$27FC18: D0 = base_ladder[cursor].  The ladder is 10 BCD longs;
  // the cursor is a byte offset (0, 4, 8, ...).
  const ladderIdx = (d1cursor >> 2);
  let d0 = ladderIdx < BASE_LADDER.length
    ? BASE_LADDER[ladderIdx]                              // $27FC18 move.l (A0,D1),D0
    : BASE_LADDER[BASE_LADDER.length - 1];

  // $27FC1C/$27FC22: the x2.  `add.l D0,D0` is a BINARY double on a packed BCD
  // longword: BCD $0500 doubles to $0A00 (binary), which reads as "A00" -- the
  // INVALID BCD digit $A propagates into scoreByMask's abcd loop.  This is the
  // documented bug (rokulpg / trap15, recon 73 sec 1.3).  Transcribed, not fixed.
  if (x2) {                                               // $27FC1C btst #$5
    d0 = (d0 + d0) >>> 0;                                 // $27FC22 add.l D0,D0 (THE BUG)
  }

  // $27FC24..$27FC2A -- the popup descriptor, off the ten-longword ladder at
  // $27FD4A with the SAME cursor the base ladder used. W234 transcribes the write;
  // no routine in the collected arm reads ($10,A6) back and `enqueueZoomedRequest`
  // does not either (it reads +$2/$4/$6/$8, +$a/$c, +$e and +$1c), so nothing
  // here asserts a meaning for the field beyond the two instructions.
  ram.setU32(a6 + B.hitLongA, rom.u32(POOL_A.popupLadder + d1cursor));

  // $27FC30..$27FC38: chain gate.  D4 (meter) and D5 (hits) must both be
  // non-zero and D5 positive for the digit-multiply; otherwise the flat path.
  const chainActive = d4 !== 0 && d5 !== 0 && (d5 & 0x8000) === 0;

  // D1 for scoreByMask: the HIGH byte of the status word.  Bit 4 = P1 touch
  // (= status bit 12), bit 3 = P2 touch (= status bit 11).  scoreByMask tests
  // these to credit the right player's pending score.
  const d1mask = ram.u8(a6 + B.status);                   // $27FC3E/$27FC64

  if (chainActive) {
    // $27FC3A: store hit count.  $27FC3E: D1 = status byte.
    ram.setU16(a6 + B.hitCount, d5);                      // $27FC3A move.w D5,($1E,A6)
    // $27FC40..$27FC58: the BCD digit-multiply.  Outer loop = 4 BCD digits,
    // inner loop = (current digit) calls to $286128.  D0 shifts left one BCD
    // digit each outer pass (lsl.l #4).  D5 shifts right (lsr.w #4).
    let hits = d5;
    let base = d0;
    for (let outer = 3; outer >= 0; outer--) {            // $27FC40 moveq #$3,D4
      let digit = hits & 0x0f;                            // $27FC44 and.w D5,D3
      for (let k = digit - 1; k >= 0; k--) {              // $27FC46 subq #1 / $27FC48 bcs
        scoreByMask(ram, base, d1mask);                   // $27FC4A jsr $286128
      }
      hits = hits >>> 4;                                  // $27FC54 lsr.w #4,D5
      base = (base << 4) >>> 0;                           // $27FC56 lsl.l #4,D0
    }
  } else {
    // FLAT path: award base once.
    ram.setU16(a6 + B.hitCount, 1);                       // $27FC5E move.w #$1,($1E,A6)
    scoreByMask(ram, d0, d1mask);                         // $27FC66 jsr $286128
  }

  // $27FC6C: sound cue.  Noted (sound subsystem deferred).
  ctx.soundPost?.(0x28c62a);  // WAVE A: BGM id=$1F, bee-collect sound ($27FC6C)

  // $27FC72: set "already collected" bit (bit 0 of the low byte = bit 0 of the
  // status word).  Next drive, btst #0 sends the slot to the collected arm.
  ram.setU8(a6 + 0x01, ram.u8(a6 + 0x01) | 0x01);        // $27FC72 ori.b #$1,($1,A6)

  return { collected: true };
}

// ========================== $27FC8C, THE IDLE STEP ==========================

/**
 * `$27FC8C` -- the idle step for a bee that has not been collected.  Blinks
 * the sprite at 20 Hz (frame B one frame in three), tests for off-screen free,
 * applies the long-axis scroll, and emits through the layer stub.
 */
function idleStep27FC8C(ram, rom, ctx, a6, d1) {
  // $27FC8C: sprite = frame A ($1BCA34).
  ram.setU32(a6 + B.sprite, 0x001bca34);                  // $27FC8C move.l #$1BCA34,($A,A6)
  // $27FC94: decrement blink timer.  On borrow (timer was 0): reload to 2 and
  // switch to frame B ($1BCA80).  So: timer 0 -> BLINK, 2 -> A, 1 -> A, 0 -> BLINK.
  const prev = ram.u16(a6 + B.blinkTimer);                // $27FC94 subq.w #1
  const next = u16(prev - 1);
  ram.setU16(a6 + B.blinkTimer, next);
  if (next > prev) {                                      // $27FC98 bcc (no borrow)
    // Borrow: timer underflowed.  Reload and blink.
    ram.setU16(a6 + B.blinkTimer, 2);                     // $27FC9A move.w #$2
    ram.setU32(a6 + B.sprite, 0x001bca80);                // $27FCA0 move.l #$1BCA80
  }

  // $27FCA8..$27FCC6: off-screen test.  Same shape as the carrier's own and
  // the fill's.  Y + $1C00 + scroll_long - $7000 must not wrap; X + $800 +
  // $7800 must not wrap.  If either wraps, FREE ($27FC7C).
  let pos = ram.u32(a6 + B.pos);                          // $27FCA8 move.l ($2,A6),D0
  let py = u16((pos & 0xffff) + 0x1c00);                  // $27FCAC addi.w #$1C00
  py = u16(py + ram.u16(0x813172));                       // $27FCB0 add.w $813172
  py = u16(py + 0x9000);                                  // $27FCB6 addi.w #-$7000
  if (py < 0x9000) return offscreenFree27FC7C(ram, a6);   // $27FCBA bcs
  let px = u16((pos >>> 16) + 0x0800);                    // $27FCBE addi.w #$800
  px = u16(px + 0x7800);                                  // $27FCC2 addi.w #$7800
  if (px < 0x7800) return offscreenFree27FC7C(ram, a6);   // $27FCC6 bcs

  // $27FCC8..$27FCCE: kind fork.  `moveq #$4,D0 / and.w D0,D1 / eor.w D0,D1`:
  // kind 1 (bit 2 set in status) -> eor makes D1 = 0 -> beq falls through to
  // the kind-1 emit.  Kind 16 (bit 2 clear) -> eor makes D1 = $4 -> bne to
  // $27FCEA (the flying arm).
  if ((d1 & 0x04) === 0) {                                // $27FCCA/$27FCCC/$27FCCE
    // Kind 16: the flying arm $27FCEA.  REFUSED.
    unreached(POOL_A.kind16Arm, `$27FCEA -- the kind-16 FLYING bee arm. `
      + `Stage-1 use unknown: no pool-A allocation site passes D0 = $40 `
      + `(recon 73 sec 8 item 3). The fork at $27FCC8 (moveq #$4 / and / eor `
      + `/ bne) routed a kind-16 record here. If this is reachable in stage 1 `
      + `it means a non-bee allocator created a kind-16 record in the reserved `
      + `ten, which the REFUSAL at allocBee27F92A should have prevented. `
      + `Record at $${a6.toString(16).toUpperCase()}`);
  }

  // $27FCD0: freeze gate.  If frozen ($8130D2 != 0), skip the scroll and emit.
  if (ram.u16(POOL_A.freeze) === 0) {                     // $27FCD0 tst.w / $27FCD6 bne
    // $27FCD8..$27FCDE: apply the long-axis scroll.  `move.w $80B03C,D0` reads
    // the high word of the scroll-compensation longword (the Y delta), same
    // value $24179E's swap-and-add produces.  Added to +$02 (the Y position).
    ram.setU16(a6 + B.pos, u16(ram.u16(a6 + B.pos) + ram.u16(POOL_A.scrollLong))); // $27FCDE
  }

  // $27FCE2: emit through the layer stub.  `movea.l ($28,A6),A0 / jmp (A0)`.
  const stub = ram.u32(a6 + B.layerEmitter);              // $27FCE2 movea.l ($28,A6),A0
  enqueueThroughStub(ram, rom, stub, a6);                 // $27FCE6 jmp (A0)
  return { emitted: true };
}

/** `$27FC7C` -- free an off-screen slot: clear status and position, decrement
 *  the live count, return.  (The `rts` here exits the body AND the driver loop
 *  iteration.) */
function offscreenFree27FC7C(ram, a6) {
  ram.setU16(a6 + B.status, 0);                           // $27FC7E move.w D0,(A6)
  ram.setU16(a6 + B.pos, 0);                              // $27FC80 move.w D0,($2,A6)
  ram.setU16(POOL_A.liveCount, u16(ram.u16(POOL_A.liveCount) - 1)); // $27FC84
  return { freed: true };
}
