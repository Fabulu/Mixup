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
// ============ THE REFUSAL: 18 NON-BEE KINDS ARE NOT ALLOCATED ================
//
// Pool A has 20 kind bodies (dispatch table `$27F99E`).  Only kind 1 (the bee)
// and kind 16 (the bee's flying variant) route through `$27F92A`'s reserved
// ten.  The other 18 come from the general allocators `$27F8EE`/`$27F8F8`,
// which take D0 from registers this port has not traced.  Attributing them is
// the walker-extension job (W105 sec 5.3) and out of scope for a bee port.
//
// `allocBee27F92A` REFUSES any kind that is not 1 (`$04`) or 16 (`$40`): no
// record of any other kind can exist through this allocator.  The dispatch
// entries for the other 18 are still present and still range-checked; reaching
// one is a LOUD NAMED THROW, because it would mean a record exists the
// allocator says cannot.
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

import { u16 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueThroughStub } from './spritequeue.js';
import { scoreByMask } from './score.js';
import { bcd242AC6 } from './items.js';
import { grantHyper287682 } from './hyper.js';

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
  // --------------------------------------------------- §THE REFUSAL (header)
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

/** Dispatch the kind-specific fill hook.  Only kind 1 ($280CEE) is ported;
 *  kind 16 would need its own (but the flying bee is REFUSED at the body). */
function runFillHook(ram, kind, slot) {
  if (kind === KIND.bee) {
    // $280CEE: move.w #$9601,($1E,A0) / bra $27F926 (rts trampoline)
    ram.setU16(slot + B.hitCount, 0x9601);                // $280CEE
    return;
  }
  unreached(POOL_A.fillHookBee, `$280BAC jsr (A1) -- the fill hook for kind $${
    (kind >> 2).toString(16).toUpperCase()} is not the bee's ($280CEE). The `
    + `template-table/fill-hook-table pair at $280E4A/$280BCE is only ported `
    + `for kind 1; other kinds need their own hook transcribed`);
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
    // $27F982 tst.b D1 / bmi $2810CA: bit 7 of the low byte selects a second,
    // higher-priority arm.  For the bee (kind 1, low byte $04) this is CLEAR,
    // so it falls through.  $2810CA is NOT ported (no allocated record has bit
    // 7 set through this allocator); reaching it is a throw.
    if ((d1 & 0x80) !== 0) {
      unreached(0x2810ca, `$27F982 tst.b D1 / bmi $2810CA -- a live pool-A `
        + `record carries status $${d1.toString(16).toUpperCase()}, whose low `
        + `byte has bit 7 set. This routes to $2810CA, a higher-priority arm `
        + `this port does not have. The bee (kind 1) always has bit 7 clear; `
        + `bit 7 of the low byte is set by kind indices >= 32, which the `
        + `dispatch table does not hold. Record at $${
          a6.toString(16).toUpperCase()}`);
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
    const r = runBody(ram, rom, ctx, a6, d1, body);       // $27F992 jsr (A0)
    if (r?.emitted) t.emitted++;
    if (r?.freed) t.freed++;
    if (r?.collected) t.collected++;
  }
  return t;
}

// =========================== $27FACC, THE BEE BODY ==========================

/**
 * Run one pool-A body by its dispatch address.  Only `$27FACC` (kinds 1 and 16,
 * the bee) is ported; the other 18 are loud named throws.
 * @returns {{emitted?:boolean,freed?:boolean,collected?:boolean}|void}
 */
function runBody(ram, rom, ctx, a6, d1, body) {
  if (body === POOL_A.body) return beeBody27FACC(ram, rom, ctx, a6, d1);
  unreached(body, `$27F992 jsr (A0) -- the kind dispatch sent a live pool-A `
    + `record to $${body.toString(16).toUpperCase()}, which is not the bee body `
    + `($27FACC). The 18 non-bee pool-A kinds are NOT ported (W110 sec 3); their `
    + `D0 sources at the eleven general-allocator call sites are unattributed. `
    + `Record at $${a6.toString(16).toUpperCase()}, status $${
      d1.toString(16).toUpperCase()}`);
}

/**
 * `$27FACC` -- the bee body (kinds 1 and 16).  Dispatches on the collected,
 * P1-touch and P2-touch bits, then either collects or idles.
 */
function beeBody27FACC(ram, rom, ctx, a6, d1) {
  // $27FACC btst #0,D1: already collected?
  if ((d1 & 0x0001) !== 0) {                              // $27FAD0 bne $28112C
    // The collected-animation arm $28112C is not ported in this wave.  It
    // plays the pickup animation and frees the slot.  NOTE it: the bee has
    // already scored (the collect arm set bit 0 at $27FC72), so the only
    // consequence of not running it is the absence of the fading "500" popup.
    note(ctx, 0x28112c, `$27FAD0 bne $28112C -- the bee's collected-animation `
      + `arm. The award already ran (bit 0 was set at $27FC72); this arm plays `
      + `the fading popup and frees the slot. Not ported in W111; the slot `
      + `stays allocated with bit 0 set, which is a cosmetic delay, not a `
      + `score error`);
    return { collected: true };
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
      ram.setU16(a6 + B.status, ram.u16(a6 + B.status) | 0x0020); // bit 5
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

  // $27FC24..$27FC2A: popup descriptor from the popup ladder.  Noted, not
  // ported (the popup draw subsystem $240DC2 is unported).
  note(ctx, 0x27fc24, `$27FC24 lea ($27FD4A,PC),A0 / move.l (A0,D1),($10,A6) `
    + `-- the popup descriptor write. The draw routine $240DC2 is not ported, `
    + `so the "500" popup does not appear. The award itself runs.`);

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
