// THE SHIP'S OWN SPRITE BLOCK -- `$24A482`, and the three records it appends.
//
// Object type 5 (`$28B5E0`) calls it FOUR times, and the four are two pairs:
//
//   $24A440  lea $8103E6,A6 / move.w (A6),D0 / bmi $24A482 / rts     P1
//   $24A44C  lea $810448,A6 / ...                                    P2
//   $24A458  lea $8103E6,A6 / move.w (A6),D0 / bmi $24A46A           P1, alt
//            $24A462 btst #8,D0 / bne $24A6B4
//   $24A46C  ...                                                     P2, alt
//
// The `bmi` is bit 15 of the state word -- "this player exists".  The alt pair
// is the *script-driven* draw at `$24A6B4` (bit 8 of the state word), which
// walks a display program out of ($14,A6) and feeds bucket 19 through
// `$23F294`.  MEASURED over all 2,233 drawn frames of `fly-around`: bit 8 is
// never set, so `$24A6B4` never runs and it is a LOUD NAMED THROW here.
//
// WHAT THE BLOCK PRODUCES, measured rather than assumed.  `pgm.py shipgate`
// dumps the board's own bucket-19 and bucket-5 staged bytes per logic frame:
//
//   frames with bucket-19 records   2,233 of 2,301   (12 B on 1,116; 36 B on 1,117)
//   frames with bucket-5  records   1,116           (36 B, i.e. three records)
//   and the two sets are EXACTLY complementary.
//
// The alternation is `$80390C`, which is not a mode flag: it is the WORD whose
// low byte `$23BE92 bchg #0,$80390D` toggles every main-loop iteration, so
// `tst.w $80390C` reads 1 on one logic frame and 0 on the next.  Three separate
// tests key off it -- `$24A496` (the invulnerability aura), `$24A544` (the glow)
// and `$249E86` (the ship's ground-plane shadow) -- and they are arranged so
// that the aura+glow draw on one phase and the shadow on the other.  Wave 9's
// attach report saw exactly this and called it "ODD" and "EVEN" phases without
// knowing what drove them; this is what drives them.
//
// So, per phase:
//   $80390C != 0   bucket 19 gets THREE records: the AURA ($24A532), the SHIP
//                  ($24A538) and the GLOW ($24A632).  Bucket 5 gets none.
//   $80390C == 0   bucket 19 gets ONE: the SHIP.  Bucket 5 gets the ship's
//                  ground-plane shadow ($249EE2) and the two pod shadows.
//
// AND THE AURA IS THE INVULNERABILITY BLINK, not an exhaust.  `$24A48E tst.b
// ($3e,A6)` is the invulnerability timer; the 5x40 colour-2 record wave 9's
// matcher labelled "exhaust plume" is only drawn while it is non-zero.  In
// `fly-around` that is true for the whole compared window -- partly naturally
// and, from lf1990, because the scenario PINS it at $FF.  Every number derived
// from this block therefore carries that intervention's label.

import { P, RAM, ROM, OPT } from './machine.js';
import { i16, u16 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueRequest, enqueueRegisters, NAMED_BUCKETS } from './spritequeue.js';

// THE RED-VALIDATION SEAM, and -- as with `player.js`'s `CLAMP_ORDER` -- it is
// deliberately IN THE SHIPPED FILE.  Every mutation this wave claims to have
// watched go red has to be producible from outside without editing a source
// file, or "I broke it and it went red" is a claim about a tree nobody can
// reproduce.  `null` is the ROM's behaviour and the only value shipped.
export const SHIP_MUTATE = { value: null };

/** The ROM tables the block reads, by the instruction that reads them. */
export const SHIP_TABLES = {
  auraSprite: 0x25567a,   // $24A4BA move.l (A0,D2.w),D2 with D2 = ($28,A6)
  auraFlip: 0x255672,     // $24A4D0 move.w (A0,D4.w),D4 with D4 = ($57,A6)*2
  knockSprite: 0x2556ba,  // $24A4F2 -- the ($1,A6) bit-7 twin. UNREACHED
  knockFlip: 0x255676,
  glowSprite: 0x2556e2,   // $24A55C lea $2556E2,A0  (ship*2, then tilt)
  glowGeom: 0x255a22,     // $24A562 lea $255A22,A1  (ship*2) -> {bias, dx, size}
  glowSpriteAlt: 0x255882, // $24A576 -- the ($18,A6) bit-1 pair. UNREACHED
  glowGeomAlt: 0x255a36,
  shadowSprite: 0x25545a, // $249EC2 lea $25545A,A0  (ship*2, then tilt)
};

// ---------------------------------------------------------------------------
// WAVE 67 -- `$253604`, THE SHIP'S AFTERIMAGE TRAIL, AND BUCKET 12.
//
// `$24A53E jsr $253604` sits between the ship's own enqueue (`$24A538`) and the
// `$80390C` phase test (`$24A544`).  This file has NOTED it by address since
// wave 12 with the reason "it writes nothing in bucket 19 and nothing in the
// compared set", which was true and is why nothing ever found it: it writes
// **bucket 12**, and `pgm.py shipgate` compares buckets 19, 15 and 5.
//
// THE ROUTINE, read out of the cartridge this wave and transcribed below:
//
//   253604: movem.l D0-D7/A0-A6,-(A7)
//   253608: tst.b ($3f,A6) / beq $253622      <- THE GATE.  It is THE LASER.
//   25360e: tst.b ($57,A6) / bne $25361e      <- the player index picks the ring
//   253628: lea $812834,A0 / lea $8128B4,A1     P2: position ring, image ring
//   253636: lea $8127F4,A0 / lea $812874,A1     P1
//   253642: movea.l A0,A2 / movea.l A1,A3     <- the two ring BASES, kept
//   253646: move.w #$620,D3                   <- 3x32, the ship's own size
//   25364a: move.w #$1F,D4                    <- flip 0, COLOUR 31
//   25364e: move.l ($2,A6),D6 / andi.l #$FF80FF80,D6
//   253658: lea ($40,A1),A1 / lea ($40,A0),A0 <- PAST the end of a 16-long ring
//   253660: moveq #$5,D7 / bra $253674
//   253664: move.l -$8(A1),-(A1) / move.l -$8(A0),-(A0)   } three unrolled
//   25366c: move.l -$8(A1),-(A1) / move.l -$8(A0),-(A0)   } shift pairs, and
//   253674: move.l -$8(A1),-(A1) / move.l -$8(A0),-(A0)   } the bra enters HERE
//   25367c: tst.w D7 / bne $25368a
//   253680: move.l ($a,A6),(A3) / move.l ($2,A6),(A2) / rts   <- the NEW head
//   25368a: tst.w $80390C / beq $2536b0       <- the 50 % duty, same as the glow
//   253692: move.l (A0),D1 / move.l D1,D5 / andi.l #$FF80FF80,D5
//   25369c: cmp.l D6,D5 / beq $2536b0         <- SKIP a sample the ship has not
//                                                moved a coarse step away from
//   2536a2: addi.l #$FA00FC00,D1              <- the ship's own ($6,A6)/($8,A6)
//   2536a8: move.l (A1),D2 / jsr $23FDB2      <- BUCKET 12
//   2536b0: dbra D7,$253664
//   2536b4: rts
//
// **FIVE RECORDS, NOT SIX, AND THE RING IS SIXTEEN DEEP.**  `55-diag` §4.3 read
// `moveq #$5,D7` as "SIX entries" and a six-deep trail, which is the natural
// reading and is wrong by one on both counts:
//
//  * `dbra` runs the body SIX times, but the SIXTH reads `tst.w D7` as 0 and
//    takes `$253680` -- the store-the-new-head arm, which ends in `rts` and
//    never reaches the emit.  So at most **FIVE** records leave this routine.
//  * the ring is `$40` bytes = **SIXTEEN** longs, which is also what the
//    initialiser `$2536B6`/`$2536D0` fills (`moveq #$f,D0`, 16 iterations, and
//    `src/laser.js seedPositionHistory` has been running it since W45).
//  * the first pass through the unrolled block enters at the LAST of the three
//    shift pairs, so it moves ONE slot and the other five move three: 16 slots
//    in all, which is exactly the ring.  The emit therefore reads slots
//    **15, 12, 9, 6 and 3** -- the ship as it was 3, 6, 9, 12 and 15 calls ago.
//
// THE GATE IS THE LASER, and that is the question `55-diag` §4.3 left open
// ("an implementer must find that writer").  `$24C282 move.b #$1,($3f,A4)` sets
// it on the frame the beam's arm-up completes and `$24C2D6 move.b D0,($3f,A4)`
// clears it on release -- the same byte `src/player.js` reads at `$249B40` to
// switch the shot cadence machine off while a beam is up.  [M] W67: on the
// shipped seed with fire HELD it is set at logic frame **17**.  So the trail is
// armed on EVERY laser, in ordinary play -- and `55-diag` §6's "the board draws
// zero colour-31 records" is consistent rather than contradictory, because
// `fly-around` never holds the fire button.
//
// **NO NEW ART.**  D2 is `(A1)`, the image ring, which holds nothing but copies
// of the ship's own `($a,A6)` -- the same descriptor `$24A538` emits.  What
// changes is D4 = `$1F`: the emit ORs the request's last two bytes into word
// 2's high byte, so the afterimage is the ship's picture in **colour 31**.
//
// THE OUT-OF-RANGE READ ON THE LAST PASS IS THE ROM'S AND IS DEAD.  The sixth
// pass's third shift does `move.l -$8(A0),-(A0)` with A0 already at base+4, so
// it reads base-4 and writes base+0 -- and `$253684` then overwrites base+0
// with the ship's current position two instructions later.  Transcribed as
// written; it cannot be observed.

/** `$253628`/`$253636` -- the two 16-long rings per player: POSITION (A0, from
 *  `($2,A6)`) and IMAGE (A1, from `($a,A6)`).  `src/laser.js` seeds the same
 *  four addresses from `$2536B6`/`$2536D0`; they are stated once here and
 *  `tests/w67trail.test.js` pins the two files against each other. */
export const TRAIL_RINGS = Object.freeze({
  p1: Object.freeze({ pos: 0x8127f4, img: 0x812874 }),   // $253636
  p2: Object.freeze({ pos: 0x812834, img: 0x8128b4 }),   // $253628
});

/** Everything `$253604` writes as an immediate. */
export const TRAIL = Object.freeze({
  entries: 16,             // $253658 lea ($40,A1),A1 -- $40 bytes of longs
  passes: 6,               // $253660 moveq #$5,D7 + dbra
  size: 0x0620,            // $253646 move.w #$620,D3   (3x32, the ship's own)
  flip: 0x001f,            // $25364A move.w #$1f,D4    (flip 0, COLOUR 31)
  bias: 0xfa00fc00,        // $2536A2 addi.l -- one LONG add, borrow carries
  coarse: 0xff80ff80,      // $253652 / $253696 andi.l
});

/** $24A4BE / $24A504 / $24A5DA -- the three size words, as the ROM writes them. */
export const SHIP_SIZES = { aura: 0x0a28, knock: 0x0830, shadow: 0x0210 };
/** $24A554 `move.w #$1a,D4` -- the glow's flip/colour word (colour 26). */
export const GLOW_FLIP = 0x001a;
/** $249EDE `move.w #$18,D4` -- the shadow's (colour 24). */
export const SHADOW_FLIP = 0x0018;

/**
 * `$249EA0..$249EE2` -- THE GROUND PLANE, and the reason a shadow is not at a
 * constant offset from the ship.  Transcribed instruction for instruction; the
 * same twelve instructions appear again at `$24C406`/`$24C43E` for the pods.
 *
 *   249ea4: move.w #$1c00,D5 / sub.w D5,D1 / asr.w #1,D1 / add.w D5,D1
 *   249eae: swap D1
 *   249eb0: move.w #$1400,D5 / sub.w D5,D1 / asr.w #1,D1 / add.w D5,D1
 *   249eba: swap D1
 *   249ebc: addi.l #$FE00FE00,D1        <-- ONE 32-bit add, so the low half's
 *                                           borrow reaches the high half
 *
 * D1 arrives as `move.l ($2,A6),D1` = posY:posX, so the FIRST midpoint is taken
 * on posX against $1C00 and the second on posY against $1400.  `render/capture.js`
 * `shadowProject` is the same arithmetic and was verified against the board's own
 * shadow record on 81 of 81 captured frames; this is the version that produces
 * the record instead of relocating one.
 */
export function groundPlane(posY, posX, bias = 0xfe00fe00) {
  const sx = i16(i16(i16(posX) - 0x1c00) >> 1) + 0x1c00;   // $249EA4..$249EAC
  const sy = i16(i16(i16(posY) - 0x1400) >> 1) + 0x1400;   // $249EB0..$249EB8
  if (SHIP_MUTATE.value === 'shadow-no-borrow') {
    // THE WRONG PORT: two independent 16-bit adds, which differ from the ROM's
    // one `addi.l` exactly when the low half borrows.
    return packD1(u16(sy + (bias >>> 16)), u16(sx + (bias & 0xffff)));
  }
  return ((((sy & 0xffff) << 16) | (sx & 0xffff)) + bias) | 0;   // $249EBC
}

/** Pack (long, short) into the D1 the register-convention stubs expect. */
export function packD1(long, short) {
  return (((long & 0xffff) << 16) | (short & 0xffff)) | 0;
}

/**
 * `$253604` -- THE AFTERIMAGE TRAIL.  Called from `$24A53E`, on BOTH arms of
 * `$24A48C` (the ordinary one and the bit-7 one), between the ship's own
 * enqueue and the `$80390C` phase test.  See the block comment above.
 *
 * @param ram
 * @param {number} rec  the player record (A6)
 * @returns {number} how many bucket-12 records it appended, 0..5.  The ROM
 *   returns nothing; this is telemetry, and `tools/w67trailgate.mjs` is the
 *   thing that would have caught a `drawn++` where an emit belongs.
 */
export function drawTrail(ram, rec) {
  // $253608 tst.b ($3f,A6) / beq $253622.  `P.dead` is wave 4's name for that
  // byte and `src/player.js:$249B40` already records that the name was a guess:
  // it is the LASER's "the beam is up" flag, written 1 at `$24C282` and 0 at
  // `$24C2D6`.  Read under the wrong name here rather than renamed across six
  // files in a wave whose subject is the trail.
  if (ram.u8(rec + P.dead) === 0) return 0;
  if (SHIP_MUTATE.value === 'no-trail') return 0;
  // $25360E tst.b ($57,A6) / bne $25361E.  NON-zero takes $253628 = P2's pair.
  const ring = ram.u8(rec + P.playerIdx) !== 0 ? TRAIL_RINGS.p2 : TRAIL_RINGS.p1;
  const a2 = ring.pos;                                    // $253642 movea.l A0,A2
  const a3 = ring.img;                                    // $253644 movea.l A1,A3
  const d3 = TRAIL.size;                                  // $253646 move.w #$620
  const d4 = TRAIL.flip;                                  // $25364A move.w #$1f
  const d6 = (ram.u32(rec + P.posY) & TRAIL.coarse) >>> 0;  // $25364E / $253652
  let a0 = ring.pos + 0x40;                               // $25365C lea ($40,A0)
  let a1 = ring.img + 0x40;                               // $253658 lea ($40,A1)
  let d7 = TRAIL.passes - 1;                              // $253660 moveq #$5
  let emitted = 0;
  // $253662 `bra.b $253674` -- the FIRST pass enters at the LAST of the three
  // unrolled shift pairs and so moves one slot; `dbra` re-enters at $253664 and
  // every later pass moves three.  1 + 5*3 = 16 = the whole ring.
  for (let pairs = 1; ; pairs = 3) {
    for (let k = 0; k < pairs; k++) {
      a1 -= 4; ram.setU32(a1, ram.u32(a1 - 4));           // move.l -$8(A1),-(A1)
      a0 -= 4; ram.setU32(a0, ram.u32(a0 - 4));           // move.l -$8(A0),-(A0)
    }
    if (d7 === 0) {                                       // $25367C tst.w / bne
      ram.setU32(a3, ram.u32(rec + P.animA));             // $253680 move.l (A3)
      ram.setU32(a2, ram.u32(rec + P.posY));              // $253684 move.l (A2)
      return emitted;                                     // $253688 rts
    }
    // $25368A tst.w $80390C / beq $2536B0 -- the SAME 50 % duty cycle as the
    // aura and the glow, so the trail draws on the phase the shadow does not.
    if (ram.u16(0x80390c) !== 0 || SHIP_MUTATE.value === 'trail-every-phase') {
      const raw = ram.u32(a0);                            // $253692 move.l (A0)
      const d5 = (raw & TRAIL.coarse) >>> 0;              // $253694 / $253696
      // $25369C cmp.l D6,D5 / beq $2536B0 -- a sample whose position rounds to
      // the ship's own COARSE position is skipped, which is why a stationary
      // ship has no trail at all.  $FF80 in 1/64 px is 2 px.
      if (d5 !== d6 || SHIP_MUTATE.value === 'trail-no-coarse-skip') {
        const d1 = (raw + TRAIL.bias) >>> 0;              // $2536A2 addi.l LONG
        const d2 = ram.u32(a1);                           // $2536A8 move.l (A1)
        enqueueRegisters(ram, NAMED_BUCKETS.trail, d1, d2, d3, d4);  // $2536AA
        emitted++;
      }
    }
    d7--;                                                 // $2536B0 dbra D7
  }
}

/**
 * `$24A440` (P1) / `$24A44C` (P2) -- the entry the type-5 driver calls, and the
 * whole of `$24A482` behind it.
 *
 * @param ram
 * @param rec  the player record (A6): $8103E6 or $810448
 * @param ctx  the Game context; `ctx.prot` is the $500000 latch
 */
export function drawShip(ram, rec, ctx) {
  if ((ram.u16(rec + P.state) & 0x8000) === 0) return;   // $24A446 bmi $24A482

  // $24A482 tst.w $812970 / bne $24A480 (rts) -- the global draw freeze.
  if (ram.u16(0x812970) !== 0) return;

  const stateHi = ram.u16(rec + P.state);
  // $24A48A `tst.b D0` -- a BYTE test on D0, i.e. on ($1,A6), NOT on the word.
  // ---- $24A48C bmi $24A4E2 -- **THE BIT-7 AURA, AND W65 MADE IT REACHABLE.**
  //
  // W12 measured this bit 0 "on every frame of fly-around and of stage1-open"
  // and that was true right up to W64: nothing in the port ever set it.
  // `$249A92 bset #$7,($1,A6)` -- the LASER BOMB's arm (`src/bomb.js`) -- is
  // the first instruction this port has ever run that does, and `$2564AA
  // bclr #$7,($1,A0)` inside `$256468` clears it 132 frames later.  So this
  // block is exactly "what the ship looks like while a beam bomb is running".
  //
  // FOUR DIFFERENCES FROM `$24A4A0`, and every one of them matters:
  //  1. **IT IS NOT GATED ON THE INVULNERABILITY OR ON `$80390C`.**  `bmi`
  //     jumps PAST `$24A48E tst.b ($3e,A6)` and `$24A496 tst.w $80390C`, so
  //     this aura draws on every frame, where `$24A4A0`'s draws on alternate
  //     ones and only while invulnerable.
  //  2. `addi.l #$F800FA00,D1` is ONE LONG add ($24A4E6), where `$24A4A4`/
  //     `$24A4AA` are two WORD adds around a `swap`.  A borrow out of the
  //     short axis carries into the long one here and cannot there.
  //  3. The sprite table is INDIRECT: `$2556BA[($58,A6)*2]` is a POINTER (read
  //     with `movea.l` at a *2 index, which is the ROM's own oddity) and
  //     `($28,A6)` then indexes THAT.
  //  4. **TWO counters, not one.**  `($26,A6)` is a BYTE with its own reload
  //     at `($27,A6)`, and only when it borrows does `($28,A6)` step -- and
  //     its reload is `$C`, not `$3C`.  `$249A86 move.w #$101,($26,A6)` and
  //     `$249A8C move.w #$C,($28,A6)` are the bomb arm's two seeds.
  if (ram.i8(rec + P.flags1) < 0) {                       // $24A48C bmi $24A4E2
    let d1 = ram.u32(rec + P.posY);                       // $24A4E2 move.l
    d1 = ((d1 + 0xf800fa00) >>> 0);                       // $24A4E6 addi.l
    const a0 = ctx.rom.u32(SHIP_TABLES.knockSprite        // $24A4F2/$24A4F8
      + ram.u16(rec + P.shipSel) * 2);                    // $24A4EC add.w D2,D2
    const d2 = ctx.rom.u32(a0 + ram.u16(rec + P.auraPhase));   // $24A4FC/$24A500
    const d4 = ctx.rom.u16(SHIP_TABLES.knockFlip          // $24A510/$24A516
      + ram.u8(rec + P.playerIdx) * 2);                   // $24A50A ($57,A6)*2
    const t = (ram.u8(rec + 0x26) - 1) & 0xff;            // $24A51A subq.b #$1
    ram.setU8(rec + 0x26, t);
    if (t === 0xff) {                                     // $24A51E bcc $24A532
      ram.setU8(rec + 0x26, ram.u8(rec + 0x27));          // $24A520 move.b
      const ph = ram.u16(rec + P.auraPhase);              // $24A526 subq.w #$4
      ram.setU16(rec + P.auraPhase, ph < 4 ? 0x0c : u16(ph - 4));   // $24A52C
    }
    enqueueRegisters(ram, NAMED_BUCKETS.player, d1, d2,   // $24A532 jsr $23F1FA
      SHIP_SIZES.knock, d4);                              // $24A504 #$830
    enqueueRequest(ram, NAMED_BUCKETS.player, rec);       // $24A538 jsr $23F104
    ctx.trailRecords = (ctx.trailRecords ?? 0)            // $24A53E jsr $253604
      + drawTrail(ram, rec);                              // ON THE BIT-7 ARM TOO
    if (!(ram.u16(0x80390c) !== 0)) return;               // $24A544 tst.w / beq
    return drawGlow(ram, rec, ctx, stateHi);              // $24A54E
  }

  // $24A48E tst.b ($3e,A6) / beq $24A538 -- the INVULNERABILITY AURA, and
  // $24A496 tst.w $80390C / beq $24A538 -- ...only on one of the two phases.
  const invuln = ram.u8(rec + P.invuln) !== 0;
  const phase = ram.u16(0x80390c) !== 0;
  if (SHIP_MUTATE.value === 'ship-order-swapped') {
    // THE WRONG PORT: the ship first, the aura second.  Both records exist and
    // both are correct; only their ORDER INSIDE BUCKET 19 changes, which is
    // invisible to any check that compares records as a set and visible to a
    // byte comparison of the staged bytes and of the emitted entries.
    enqueueRequest(ram, NAMED_BUCKETS.player, rec);
  }
  if (invuln && phase && SHIP_MUTATE.value !== 'no-aura') {
    // $24A4A0..$24A4D2 -- the aura's four registers.
    let d1 = ram.u32(rec + P.posY);                       // move.l ($2,A6),D1
    d1 = packD1(u16(i16(d1 >>> 16) - 0x0d00),             // $24A4AA addi.w #-$D00
      u16(i16(d1 & 0xffff) - 0x0500));                    // $24A4A4 addi.w #-$500
    const ph = ram.u16(rec + P.auraPhase);                // $24A4B6 ($28,A6)
    const d2 = ctx.rom.u32(SHIP_TABLES.auraSprite + ph);  // $24A4BA (A0,D2.w)
    const d3 = SHIP_SIZES.aura;                           // $24A4BE #$A28
    const d4 = ctx.rom.u16(SHIP_TABLES.auraFlip           // $24A4D0 (A0,D4.w)
      + ram.u8(rec + P.playerIdx) * 2);                   // $24A4C4 ($57,A6)*2
    // $24A4D4 subq.w #4,($28,A6) / bcc / $24A4DA move.w #$3C,($28,A6).
    // `bcc` after `subq.w` tests the BORROW, which is UNSIGNED: the reload
    // happens when the old value was 0..3, not when the result looks negative.
    if (SHIP_MUTATE.value !== 'aura-phase-flat') {
      ram.setU16(rec + P.auraPhase, ph < 4 ? 0x3c : u16(ph - 4));
    }
    enqueueRegisters(ram, NAMED_BUCKETS.player, d1, d2, d3, d4);  // $24A532
  }
  if (SHIP_MUTATE.value === 'ship-order-swapped') {
    if (!phase) return;
    return drawGlow(ram, rec, ctx, stateHi);
  }

  // $24A538 jsr $23F104 -- THE SHIP.  The plain per-record stub on bucket 19,
  // reading ($2,A6)+($6,A6), ($4,A6)+($8,A6), the animation long at ($A,A6),
  // the size at ($E,A6) and the flip/colour word at ($1C,A6).  ($A,A6) is what
  // $249E62 wrote from $25533A[shipType][tilt] -- THE BANK.
  enqueueRequest(ram, NAMED_BUCKETS.player, rec);

  // $24A53E jsr $253604 -- THE AFTERIMAGE TRAIL, ported in wave 67.  It was a
  // COUNTED NOTE from wave 12 to wave 66 with the reason "it writes nothing in
  // bucket 19 and nothing in the compared set", which was true and is exactly
  // why no gate could see it: it writes BUCKET 12, and `pgm.py shipgate`
  // compares 19, 15 and 5.
  ctx.trailRecords = (ctx.trailRecords ?? 0) + drawTrail(ram, rec);

  // $24A544 tst.w $80390C / beq -> rts.  Same phase word, opposite sense to the
  // shadow's gate at $249E86, which is why the two never appear on one frame.
  if (!phase) return;
  if (SHIP_MUTATE.value === 'no-glow') return;
  drawGlow(ram, rec, ctx, stateHi);
}

/**
 * `$24A458` (P1) / `$24A46C` (P2) -- the ALT entry, called by object type 5
 * BEFORE `$24A440` (the jsr order at `$28B5E6` is $24A458, $24A46C, $24A440,
 * $24A44C).  It is not a second draw of the ship: it is a gate on bit 8 of the
 * state word into the script-driven display walker at `$24A6B4`.
 *
 *   24a458: lea $8103E6,A6 / move.w (A6),D0
 *   24a45e: bmi $24A46A          not live -> rts
 *   24a462: btst #8,D0 / bne $24A6B4
 *   24a46a: rts
 */
export function drawShipAlt(ram, rec) {
  if ((ram.u16(rec + P.state) & 0x8000) === 0) return;    // $24A45E bmi -> rts
  if (ram.u16(rec + P.state) & 0x0100) {                  // $24A462 btst #8,D0
    unreached(ROM.shipBit8, `bit 8 of the player state word is set, which sends `
      + `$24A458 into the script-driven display walker at $24A6B4: it follows `
      + `($14,A6) -- WHICH IS THE HITBOX LONG, reused as a program pointer on `
      + `this path -- through a command list whose opcodes 0/1/2 feed bucket 19 `
      + `via $23F104 and $23F294. MEASURED 0 on every one of the 2,301 sampled `
      + `frames of fly-around and never seen in any earlier corpus, so nothing `
      + `here is measured and the port refuses to invent it`);
  }
}

/**
 * `$24A54E..$24A632` -- the 1x32 colour-26 record wave 9 called the "exhaust
 * glow", and the ONE place in this wave that goes through the $500000 latch.
 */
function drawGlow(ram, rec, ctx, stateHi) {
  const d4 = GLOW_FLIP;                                   // $24A54E move.w #$1a,D4
  const ship = ram.u16(rec + P.shipSel) * 2;              // $24A552 ($58,A6)*2
  const tilt = ram.u16(rec + P.tilt);                     // $24A558 ($4e,A6)
  let spriteTbl = SHIP_TABLES.glowSprite;                 // $24A55C lea $2556E2
  let geomTbl = SHIP_TABLES.glowGeom;                     // $24A562 lea $255A22
  // $24A568 btst #1,($18,A6) / beq ; $24A570 tst.w ($58,A6) / beq
  if ((ram.u8(rec + P.dirByte) & 0x02) && ram.u16(rec + P.shipSel) !== 0) {
    unreached(0x24a576, `$24A576 swaps the glow's tables to $255882/$255A36 when `
      + `the stick is DOWN and the ship selector is non-zero. Selector 0 is the `
      + `only one this corpus has ever run (measured every frame), so the pair `
      + `is unexported and this is the throw wave 12 leaves for a TYPE-B run`);
    spriteTbl = SHIP_TABLES.glowSpriteAlt;
    geomTbl = SHIP_TABLES.glowGeomAlt;
  }
  // $24A582 movea.l (A0,D7.w),A0 / movea.l (A0,D6.w),A0 -- ship, then TILT as a
  // BYTE offset into a longword table: the same 17-entry, step-4, [-$20,+$20]
  // shape as $25533A, so a tilt outside it reads a pointer that is not one.
  const perShip = ctx.rom.u32(spriteTbl + ship);
  const perTilt = ctx.rom.u32(perShip + i16(tilt));
  const d2 = ctx.rom.u32(perTilt + ram.u16(rec + P.glowPhase));  // $24A58A/$24A58E
  const geom = ctx.rom.u32(geomTbl + ship);               // $24A592 (A1,D7.w)
  const bias = ctx.rom.u16(geom);                         // $24A596 move.w (A1)+
  const dx = ctx.rom.u16(geom + 2);                       // $24A61E move.w (A1)+
  const d3 = ctx.rom.u16(geom + 4);                       // $24A624 move.w (A1)+

  // $24A598 cmpi.w #$4,$813092 / bne $24A5B6 ; $24A5A4 tst.w $81309C / beq
  // -- stage 4 with $81309C set takes a SHORT-CUT that skips the latch entirely
  // and just adds ($2,A6).  MEASURED $813092 = 0 for all of fly-around.
  let long;
  if (SHIP_MUTATE.value === 'glow-without-prot') {
    // THE WRONG PORT: read the ship's Y straight instead of through the
    // $500000 latch's sum.  It is exactly what a reader who took "the
    // protection does no game logic" (NOTES-machine.md) as "the protection
    // changes no number" would write, and it is off by the $F880 bias.
    long = ram.u16(rec + P.posY);
  } else if (ram.u16(0x813092) === 4 && ram.u16(0x81309c) !== 0) {
    long = u16(bias + i16(ram.u16(rec + P.posY)));        // $24A5AE add.w ($2,A6),D1
  } else {
    // $24A5B6..$24A614 -- the protection latch.  See src/protsim.js.
    ctx.prot.setSlot(0, bias);                            // $246D04(0, D1&$FFFF)
    ctx.prot.setSlot(1, ram.u16(rec + P.posY));           // $246D04(1, ($2,A6))
    ctx.prot.sum(0, 1, 1);                                // $246EA4(0,1,1)
    long = u16(ctx.prot.readSlot(1));                     // $246CAC(1); move.w D0,D1
  }
  long = u16(long - i16(ram.u16(rec + P.shadowBias)));    // $24A61A sub.w ($5e,A6)
  const short = u16(dx + i16(ram.u16(rec + P.posX)));     // $24A620 add.w ($4,A6)

  // $24A626 subq.w #4,($48,A6) / bcc ; $24A62C move.w #$4,($48,A6) -- unsigned
  // borrow, exactly as the aura's counter above.
  const g = ram.u16(rec + P.glowPhase);
  ram.setU16(rec + P.glowPhase, g < 4 ? 4 : u16(g - 4));
  void stateHi;
  enqueueRegisters(ram, NAMED_BUCKETS.player, packD1(long, short), d2, d3, d4);
}

/**
 * `$249EA0..$249EE2` -- the ship's ground-plane shadow, into BUCKET 5.
 *
 * It lives in the PLAYER handler's tail, not in `$24A482`, and the port has been
 * counting it as unported ever since wave 4 (`player.js:278`'s `note()`).  It is
 * ported here so that the two halves of the phase alternation are in one file.
 */
export function drawShipShadow(ram, rec, ctx) {
  // $249E7E tst.w $812970 / bne ; $249E86 tst.w $80390C / bne ;
  // $249E8E tst.w $813098 / bne ; $249E96 cmpi.w #$2,$813092 / beq -- four
  // gates, all measured 0 (and $813092 = 0) over fly-around.
  if (ram.u16(0x812970) !== 0) return false;
  if (ram.u16(0x80390c) !== 0) return false;
  if (ram.u16(0x813098) !== 0) return false;
  if (ram.u16(0x813092) === 2) return false;
  if (SHIP_MUTATE.value === 'no-shadow') return false;

  const d1 = groundPlane(ram.u16(rec + P.posY), ram.u16(rec + P.posX));
  const ship = ram.u16(rec + P.shipSel) * 2;              // $249EC8 ($58,A6)*2
  const perShip = ctx.rom.u32(SHIP_TABLES.shadowSprite + ship);   // $249ECE
  const d2 = ctx.rom.u32(perShip + i16(ram.u16(rec + P.tilt)));   // $249ED6
  enqueueRegisters(ram, NAMED_BUCKETS.shadows, d1, d2,
    SHIP_SIZES.shadow, SHADOW_FLIP);                      // $249EE2 jsr $23EFC0
  return true;
}

export { RAM, OPT };
