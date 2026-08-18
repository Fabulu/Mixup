// THE ENEMY DEATH EXPLOSION -- POOL B, `$289004` + `$288E4E`.  WAVE 54 (E5b).
//
// The owner is playing the live build: "Shooting enemies with bullets works,
// but you can't see the bullets and no explosions."  W52 made the bullets and
// the shots visible.  W53 made the SHOT'S IMPACT SPARK visible -- the flash
// where a bullet connects.  **THIS is the other half: what happens when an
// enemy actually DIES.**
//
// ======================= THERE IS NO "SPAWN AN EXPLOSION" ==================
//
// `50-recon-effects` §2.1's headline, reproduced from the listing this wave:
// every enemy's death arm INLINES `moveq #kind,D0 / jsr $289004` and then
// writes six to nine fields into the record the allocator returned.  [M] 327
// such sites in the image.  There is no shared spawner, which is why
// `src/handlers.js` and `src/midboss.js` carry twenty-odd separate
// `noteEffect(u, 0x289004, ...)` gaps rather than one.
//
// So this file is the POOL and the SCRIPT INTERPRETER; the CALLERS stay where
// they are and each one now writes its own fields, from its own listing.
//
// ========================== FIVE POOLS, AND THIS IS ONE ====================
//
// `50-recon` §1 enumerates five contiguous effect pools in `$8171BE..$81DB8D`:
//
//   A IMPACT     $8171BE  $2C x 80   $27F8F8/$27F92A  driver $27F95A   E4/E7's
//   B EFFECT     $81B732  $38 x 80   $289004          driver $288E4E   ***THIS***
//   C sub-record $81CDEE  $30 x 30   $289B50          driver $289B80   W194
//   D SUB-EFFECT $81C8EC  $40 x 20   $289098          driver $2890F2   W191, ported
//   E SHOT SPARK $81D394  $22 x 60   $289F54          driver $28A098   W53, ported
//
// This file owns pools B, C and D, including their allocators and drivers. Pool B's
// allocator AND its driver are both here, in one commit, because a pool with a
// producer and no consumer is W33 §4's leak -- 100 of 100 slots consumed by
// logic frame 2906 and every later spawn silently discarded, through four
// consecutive green gates.
//
//   THE DRAIN PROOF, in the ROM, three ways:
//     1. `$288F98 bne $288FA2` -- the duration list's `$FFFF` terminator reaches
//        `$288F9C clr.w (A6)`.  Every script ends; [M] the longest is 36 cells.
//     2. `$288F74`/`$288F82 bcs $288F9C` -- THE OFF-SCREEN CULL, and it is the
//        pool's MAIN consumer (`50-recon` §1.3).  A fast effect dies here first.
//     3. the whole-pool clears `$288E0C` (stage/round boundaries and $2440E0).
//   All three do the same `clr.w (A6)`; the driver RE-COUNTS `$81C8EA` from
//   scratch every frame, so a freed slot cannot leave a stale count behind.
//
// ===== W191 POOL-D COMPLETION =====
//
// `$288EF0 jsr $289098` sub-allocates into pool D when a pool-B record's `$12`
// field is non-negative. Pool D's allocator, fill, five templates, animation,
// movement, culling, lifetime gates, emitter, and type-5 driver are all owned
// here. The one-shot parent field is disarmed only after the allocation attempt,
// exactly as the ROM does, and the driver drains or culls every live child.
//
// ================================ THE GEOMETRY =============================
//
// [M] read out of instructions this session; every arithmetic closes EXACTLY:
//
//   $81B732 + 80 * $38 == $81C8B2 == THE BIT BUCKET ($289078's lea)   EXACT
//   $81C8B2 +      $38 == $81C8EA == the live count                   EXACT
//   $288E0C clears ($8DC + 1) * 2 = 4,538 B from $81B732
//                                 = 80 slots + the bit bucket + the count EXACT
//   $289084 clears ($280 + 1) * 2 = 1,282 B from $81C8EC
//                                 = pool D's 20 x $40 + $81CDEC       EXACT
//   $221520 + 34 * 8 == $221630   (table A ends where table B begins)  EXACT
//   $221630 + 34 * 8 == $221740   ($221740 IS kind 0's descriptor list) EXACT
//
// THE BIT BUCKET IS A REAL SLOT, one past the end, and `$289078` returns it on
// BOTH failure arms: a range-check failure AND a full pool.  `$289004`'s closing
// `movem.l (A7)+,D0-D1/A1-A6` deliberately does NOT restore A0, so the caller
// writes its fields into `$81C8B2` and cannot tell.  There is no carry, no zero
// return, nothing -- unlike `$27F8F8` (which sets carry) and unlike `$289F54`
// (which returns `ori #1,SR`).  **This port COUNTS a bit-bucket allocation**,
// with the kind and the caller, because that is the check W33 §4 says would have
// caught the sub-record leak four waves earlier.
//
// ============================ THE RECORD, $38 BYTES ========================
//
//  +$00 w  STATUS.  bit15 = allocated; **bit 6 = "the script has been started"**
//          ($288E7A `bset #6,(A6)`); low byte = THE KIND, and **bit 7 of the low
//          byte selects script table $221630 instead of $221520**.
//          `clr.w (A6)` = FREE, and all three free paths use it.
//  +$02 l  POSITION.  hi word = long axis, lo word = short axis.
//  +$06 l  the two sprite OFFSET words, loaded by the $FFFF escape command.
//  +$0A l  THE SPRITE DESCRIPTOR, re-pointed at every animation step.
//  +$0E w  width/height, loaded by the same escape.
//  +$10 w  non-zero -> `jsr $24179E` every frame (the scroll compensation).
//  +$12 w  SUB-SPAWN PARAMETER; $289004 inits it to $FFFF = NONE, `bmi` skips.
//  +$14 w  second sub-spawn parameter (the low word of $289098's D0).
//  +$16 b  init $1E; copied to +$1D at the sub-spawn.
//  +$18 w  SPAWN DELAY -- counted down before anything else runs.
//  +$1A b  SPEED index; +$1B b ANGLE.  Non-zero speed -> `$241D34` -> velocity,
//          then the speed byte is CLEARED so it is a one-shot.
//          (`50-recon` §1.2 has these two the other way round.  [M] `$288F1A
//          move.b ($1a,A6),D0` and `$288F24 move.b ($1b,A6),D1`, and `$241D34`
//          takes D0 = speed index, D1 = angle byte -- `src/vectors.js`.)
//  +$1C b  pushed/popped across the sub-spawn; +$1D b init $1E.
//          **THE WORD AT +$1C IS DISPLAY-LIST WORD 5** -- `$23D790 move.w
//          ($1c,A6)` -- so the pair reads $001E, a palette index, exactly like
//          pool E's attribute word.
//  +$1E w  THE BUCKET SELECTOR -- a raw BYTE offset (0/4/8/$C/$10) into $288FF0.
//  +$20 b  friction countdown; +$21 b its reload.
//  +$22 l  friction delta (subtracted from the velocity when it reloads).
//  +$26 l  ONE-SHOT position delta, added to +$02 when the script starts.
//  +$2A l  cursor into the DESCRIPTOR list.
//  +$2E l  cursor into the DURATION list.
//  +$32 w  frames left on the current animation cell.
//  +$34 l  VELOCITY, hi = long axis, lo = short axis.
//
// =========================== WHAT IS *NOT* IN THIS WAVE ====================
//
// * **pool D** -- §THE REFUSAL above.  `$289098` and `$2890F2` stay counted.
// * **`$2440E0`** (E5c) -- 39 blocks over the 624-byte table `$244ACE`, which
//   `50-recon` §3 read end to end.  It calls `$288E0C` and then `$289004` 39
//   times, so it is now a ~30-line port -- but [M] its only non-boss caller is
//   `$275D10`, which recon 50 §10.1 could not attribute, and every other caller
//   is a boss.  Not this wave's.
// * **the impact pool A** -- W52 §0.2 refused it for this same reason.
// * **`$289AF4`** -- the "D0=$4 secondary" two death arms call after this one.
//   Still a counted note; it is a different allocator with a different pool.
// * **`$28C25A` / `$28C274` / `$28C2A8` / `$28C2DC` / `$28C310`** -- the
//   `$28Cxxx` family, which W53 §0 established is SOUND (`$28C714` was the case
//   that proved it).  Deferred with the rest of the sound wave.

import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import { enqueueThroughStub } from './spritequeue.js';
import {
  drawByte242B3C, drawByte242E24, drawByte24311A, drawByte2431F4, drawLong24397A,
  drawSigned242CAC, drawSigned242FDE, drawWord242EC2,
} from './rng.js';

export const POOL_B = {
  base: 0x81b732,          // $289022 / $288E52 lea $81B732
  stride: 0x38,            // $289070 lea ($38,A0),A0 / $288FE6 lea ($38,A6),A6
  slots: 80,               // $28901E move.w #$4F,D1 / $288E4E move.w #$4F,D7
  bitBucket: 0x81c8b2,     // $289078 lea $81C8B2 -- ONE PAST THE END
  count: 0x81c8ea,         // $288E58 clr.w / $288E74 addq.w #1
  clearWords: 0x8dd,       // $288E12 move.w #$8DC,D0 + the dbra's own pass
  kindMax: 0x21,           // $289016 cmpi.w #$21,D1 / bgt -> 34 entries
  tableA: 0x221520,        // $288E88 lea $221520 (kind bit 7 CLEAR)
  tableB: 0x221630,        // $288E96 lea $221630 (kind bit 7 SET)
  tableEntries: 34,
  emitTable: 0x288ff0,     // $288FDA lea ($288FF0,PC) -- 5 entries
  laserRec: 0x811f72,      // $288FBC lea $811F72 -- THE LASER INTERLOCK
  frameParity: 0x80390a,   // $288FC8 move.w $80390A / andi.w #$1
  scroll: 0x813176,        // $288F00 move.w $813176 -- subtracted from +$04
  bgFreeze: 0x8130d2,      // $24179E tst.w $8130D2
  scrollB03C: 0x80b03c,    // $2417A8 move.l $80B03C / swap
};

export const POOL_D = {
  base: 0x81c8ec,          // $289084 / $2890AA lea $81C8EC
  stride: 0x40,            // $2890CC lea ($40,A0),A0
  slots: 20,               // $2890B0 move.w #$13,D1 (+1)
  slotsNarrow: 10,         // when $813098 != 0 or $81308C == 0
  count: 0x81cdec,         // $2890E0 addq.w #1 / $289238 subq.w #1
  clearWords: 0x281,       // $28908A move.w #$280,D0 + the dbra's own pass
  allocator: 0x289098,
  driver: 0x2890f2,        // type-5 call #6
};

export const POOL_C = {
  base: 0x81cdee,
  stride: 0x30,
  slots: 30,
  slotsNarrow: 15,
  count: 0x81d38e,
  allocator: 0x289b50,
  driver: 0x289b80,
  templateTable: 0x289dea,
};

/** Pool-C's `$30`-byte satellite/explosion record. */
export const C = {
  status: 0x00, pos: 0x02, offs: 0x06, descriptor: 0x0a, size: 0x0e,
  cursor: 0x10, wrap: 0x12, list: 0x14, template18: 0x18,
  attr: 0x1c, palette: 0x1d, bucket: 0x1e, marker: 0x1f,
  cull: 0x20,
};

/** Pool-D's `$40`-byte secondary-debris record. */
export const D = {
  status: 0x00, pos: 0x02, offs: 0x06, descriptor: 0x0a, size: 0x0e,
  cursor: 0x10, wrap: 0x12, list: 0x14, lifetime: 0x18,
  speed: 0x1a, angle: 0x1b, attr: 0x1c, mode: 0x1e,
  drift: 0x20, hold: 0x22, bucket: 0x24, auxAngle: 0x26,
};

/** Record offsets, from the slot base.  See the map in the header. */
export const B = {
  status: 0x00, pos: 0x02, offs: 0x06, descriptor: 0x0a, size: 0x0e,
  hook: 0x10, sub12: 0x12, sub14: 0x14, f16: 0x16, delay: 0x18,
  speed: 0x1a, angle: 0x1b, f1c: 0x1c, f1d: 0x1d, bucket: 0x1e,
  fricCtr: 0x20, fricReload: 0x21, fricDelta: 0x22, nudge: 0x26,
  descCursor: 0x2a, durCursor: 0x2e, cell: 0x32, vel: 0x34,
};

/** `$288FF0`'s five entries, as the raw BYTE offsets `($1e,A6)` carries.
 *  [M] $23D762 $23D79E $23D7DA $23D816 $23D852 -> buckets 0, 1, 2, 3, 7, and
 *  the longword at $289004 (entry [5]) is `48E7C07E` = $289004's own `movem.l`,
 *  i.e. CODE.  A selector outside these five `jsr`s into an instruction. */
export const EMIT_STUB = Object.freeze({
  0x0: 0x23d762, 0x4: 0x23d79e, 0x8: 0x23d7da, 0xc: 0x23d816, 0x10: 0x23d852,
});

/** The two enemy-bucket -> effect-bucket remap tables the death arms index.
 *  Both are ROM windows (`tools/export-tables.py`), both range-checked here.
 *
 *  [M] `$267FA0..$267FC3` is THREE 6-word rows and `$267FC4` is `4E75` (rts),
 *  so its far end is pinned by CODE:
 *      $267FA0  0000 0000 0004 0008 000C 0010   the DEATH row  ($268848 lea)
 *      $267FAC  0004 0004 0008 000C 0010 0010   the HIT row    ($2682BC lea)
 *      $267FB8  0000 0000 0004 0008 000C 0010   $289AF4's row  ($2688B2 lea)
 *  [M] `$278320..$278337` is the first two of those rows again, and `$278338`
 *  is `$0022C59C` -- a sprite STREAM address, i.e. a different table. */
export const REMAP = Object.freeze({
  death267FA0: 0x267fa0, hit267FAC: 0x267fac, secondary267FB8: 0x267fb8,
  shared278320: 0x278320,
  rowBytes: 12,          // 6 words
});

/**
 * Read one word out of a 6-word remap row, RANGE-CHECKED.
 *
 * The ROM indexes these with `(A1,D0.w)`, a raw BYTE offset, and nothing bounds
 * D0: `$268860 move.b ($1e,A6),D0` takes a whole byte and `$2767FE add.w D0,D0`
 * doubles a whole word.  A wrong index reads the NEXT row -- or, for
 * `$278320`, a sprite stream address -- and lands it in `($1e,A0)`, which is
 * then `jsr`ed through `$288FF0`.  So it is checked here and throws by address.
 */
export function remapBucket(rom, row, byteIndex, siteAddr) {
  if (byteIndex < 0 || byteIndex >= REMAP.rowBytes || (byteIndex & 1)) {
    unreached(siteAddr, `a death arm indexed the bucket remap row `
      + `$${row.toString(16).toUpperCase()} with byte offset `
      + `$${byteIndex.toString(16).toUpperCase()}. The row is `
      + `${REMAP.rowBytes} bytes (6 words) and the next 12 bytes are ANOTHER `
      + `row -- or, at $278320, a sprite stream address. The value lands in `
      + `($1e,A0) and is jsr'd through $288FF0, so a wrong read calls code`);
  }
  return rom.u16(row + byteIndex);
}

// ============================== THE TWO CLEARS ==============================

/** `$288E0C` -- clear the WHOLE effect pool: 80 slots, the bit bucket AND the
 *  count word, 4,538 bytes.  [M] five absolute-long callers: `$2440E0`
 *  (E5c, unported), `$25FD40`, `$27C73A`, `$28B5B4` (object type 5's "not
 *  started" branch, which `src/type5.js` throws for) and `$2A5A30`. */
export function clearEffectPool(ram) {
  for (let i = 0; i < POOL_B.clearWords; i++) {          // $288E1A dbra
    ram.setU16(POOL_B.base + i * 2, 0);                  // $288E16 move.w #0,(A0)+
  }
}

/** `$289084` -- clear pool D: 20 slots and its count word, 1,282 bytes.
 *  Ported even though NOTHING IN THIS PORT ALLOCATES FROM POOL D (§THE REFUSAL),
 *  because the clear is what stops a pool surviving a reset it should not, and
 *  because it is the cheap half of `50-recon` §4.3's item 6. */
export function clearSubEffectPool(ram) {
  for (let i = 0; i < POOL_D.clearWords; i++) {          // $289092 dbra
    ram.setU16(POOL_D.base + i * 2, 0);                  // $28908E move.w #0,(A0)+
  }
}

// ============================== THE ALLOCATOR ===============================
//
//   289004: movem.l D0-D1/A1-A6,-(A7)     <- A0 IS NOT SAVED.  That is what lets
//                                            the failure return hand back the
//                                            bit bucket.
//   289008: move.w D0,D1 / andi.w #$7f,D1
//   28900e: cmpi.w #$0,D1 / blt $289078   <- D1 is masked to 0..$7F, so this
//                                            branch CANNOT be taken.  It is
//                                            transcribed and named, never taken.
//   289016: cmpi.w #$21,D1 / bgt $289078  <- 34 script entries.  Kinds $22..$7F
//                                            (and $A2..$FF) go to the bit bucket.
//   28901e: move.w #$4f,D1                <- and D1 is REUSED as the loop
//                                            counter, so the CHECKED value is
//                                            never read again.  The kind stays
//                                            in D0, whose bit 7 picks table B.
//   289022: lea $81B732,A0 / tst.w (A0) / bne $289070 (next slot)
//   28902e: ori.w #$8000,D0 / move.w D0,(A0)     <- allocated | kind
//   ...then eleven field initialisations, and NOT the position: every caller
//   writes `move.l ($2,A6),($2,A0)` itself.

/**
 * `$289004` -- allocate one effect record.
 *
 * @returns {number} the slot address, **or `$81C8B2`, THE BIT BUCKET**, exactly
 *   as the ROM does.  The caller cannot tell the difference and neither can
 *   this port; what the port adds is that the event is COUNTED, by address,
 *   with the kind.  W33 §4: a producer whose failure nobody counts is a leak
 *   that survives four green gates.
 */
/**
 * `$270D92` -- WALK A DEATH-SPAWN LIST AND MAKE ONE EFFECT PER ENTRY.
 *
 *   270d92  move.w (A1)+,D1            entry word 1
 *   270d94  cmpi.w #-$1,D1 / beq       $FFFF TERMINATES the list
 *   270d9c  move.w (A1)+,D0 / jsr $289004      word 2 is the effect KIND
 *   270da4  move.w (A1)+,D0 / move.b D0,($1C,A0)   word 3, LOW BYTE only
 *   270daa  move.w D1,($18,A0)         word 1 lands at +$18
 *   270dae  move.l (A1)+,($26,A0)      words 4+5 as ONE LONG
 *   270db2  move.l D2,($2,A0)          the CALLER's position, out of D2
 *   270db6  move.w #$4,($1E,A0)
 *   270dbc  move.w #$0,($12,A0) / move.w #$0,($14,A0)
 *   270dc8  move.w (A1)+,($1A,A0)      word 6
 *   270dcc  bra $270D92                and round again
 *
 * So an entry is **TWELVE BYTES**: word, word, word, long, word. The stride is not uniform-width
 * fields and cannot be read as six words, because `$270DAE` takes a LONGWORD.
 *
 * **SIX CALLERS, AND THREE OF THEM ARE STAGE-5 TYPES.** `$270DCC` is its own back-edge; the real
 * call sites are `$271390`, `$271680` (type `$49`), `$271AC2` (inside type `$4A`), `$271D88` (inside
 * type `$4B`) and `$27248E`. W315 proved `$48`/`$49`/`$4A`/`$4B` are NOT one family by prototype --
 * they diverge in their bodies and share THIS. Porting it once is what makes those types cheap.
 *
 * **THE ROM DOES NOT CHECK `$289004`'s RETURN.** On a full pool `$289004` answers `$81C8B2`, the bit
 * bucket, so the board's writes land somewhere harmless and the loop carries on. `spawnEffect`
 * returns a falsy slot instead, so the writes are skipped and the walk CONTINUES -- skipping the
 * whole list on one full pool would lose the entries after it, which the board does not do.
 *
 * **`$26C74E` IS THIS ROUTINE'S TWIN AND IS SERVED BY THE SAME CODE (W339).** Both heads are
 * `32 19 0C 41 FF FF` and every field lands at the same offset; the ONLY divergence in either
 * routine is `($1E,A0)` -- `$270DB6` writes `#$4` and `$26C772` writes `#$10`. That is what the
 * `anim` parameter is for, and it is why callers must keep passing `siteAddr`: the two ROM
 * addresses have six callers each and `note`/`bulletSpawn` attribution has to stay truthful about
 * which one actually ran.
 *
 * @param a1 the list address (the ROM's A1).
 * @param d2 the position longword every entry copies to `($2,A0)`.
 * @param siteAddr the calling `jsr`'s address, for attribution.
 * @param anim the `($1E,A0)` constant: `4` for `$270D92`, `0x10` for `$26C74E`. NOT a default to
 *        lean on -- pass it explicitly from a table entry when adding a third caller.
 * @returns {number} how many entries were walked, spawned or not.
 */
export function walkDeathSpawns270D92(ram, rom, ctx, a1, d2, siteAddr = 0x270d92, anim = 4) {
  let at = a1;
  let n = 0;
  for (;;) {
    const d1 = rom.u16(at);                              // $270D92 move.w (A1)+,D1
    if (d1 === 0xffff) return n;                         // $270D94 cmpi.w #-$1 / beq $270DCE
    if (n >= WALK_CAP) {
      unreached(siteAddr, `$${siteAddr.toString(16).toUpperCase()} walked ${WALK_CAP} entries of the `
        + `list at $${a1.toString(16).toUpperCase()} without meeting the $FFFF terminator. Entries `
        + `are TWELVE bytes (word, word, word, LONG, word) and the loop's only exit is that word, so `
        + `either the list address is wrong or the stride is being read as something other than 12`);
    }
    const kind = rom.u16(at + 2);                        // $270D9C word 2 -- the KIND
    const w3 = rom.u16(at + 4);                          // $270DA4 word 3
    const long26 = rom.u32(at + 6);                      // $270DAE words 4+5 as a LONG
    const w1a = rom.u16(at + 10);                        // $270DC8 word 6
    const slot = spawnEffect(ram, ctx, kind);            // $270D9E jsr $289004
    if (slot) {
      ram.setU8(slot + 0x1c, w3 & 0xff);                 // $270DA6 move.b D0,($1C,A0)
      ram.setU16(slot + 0x18, d1);                       // $270DAA
      ram.setU32(slot + 0x26, long26);                   // $270DAE
      ram.setU32(slot + 0x02, d2);                       // $270DB2 move.l D2,($2,A0)
      ram.setU16(slot + 0x1e, anim);                     // $270DB6 #$4 / $26C772 #$10
      ram.setU16(slot + 0x12, 0);                        // $270DBC
      ram.setU16(slot + 0x14, 0);                        // $270DC2
      ram.setU16(slot + 0x1a, w1a);                      // $270DC8
    }
    at += 12;
    n++;
  }
}

/** The walk's only exit in the ROM is the `$FFFF` word, so a wrong list address or a misread stride
 *  is an infinite loop rather than a wrong picture. Bounded here at a value no real list approaches;
 *  if it fires, the ADDRESS or the stride is wrong, not the data. */
const WALK_CAP = 64;

export function spawnEffect(ram, ctx, d0, siteAddr = 0x289004) {
  const d1 = d0 & 0x7f;                                  // $289008/$28900A
  if (d1 < 0) {                                          // $28900E cmpi.w #$0 / blt
    unreached(0x289012, `$28900E cmpi.w #$0,D1 / blt $289078 -- D1 is `
      + `(D0 & $7F) and CANNOT be negative. Reaching this means the mask above `
      + `has changed, not that the game found a new kind`);
  }
  if (d1 > POOL_B.kindMax) {                             // $289016 cmpi.w #$21 / bgt
    ctx?.unportedLog?.note(0x289078, `$289016 -- effect kind `
      + `$${d0.toString(16).toUpperCase()} is outside the 34 script entries `
      + `(kind & $7F must be 0..$21), so $289004 returned THE BIT BUCKET `
      + `$81C8B2 and the caller's field writes are DISCARDED. Site `
      + `$${siteAddr.toString(16).toUpperCase()}`);
    return POOL_B.bitBucket;                             // $289078 lea $81C8B2
  }
  for (let n = 0; n < POOL_B.slots; n++) {               // $289074 dbra D1
    const a0 = POOL_B.base + n * POOL_B.stride;          // $289070 lea ($38,A0),A0
    if (ram.u16(a0 + B.status) !== 0) continue;          // $289028 tst.w (A0) / bne
    ram.setU16(a0 + B.status, u16(d0 | 0x8000));         // $28902E/$289032
    ram.setU16(a0 + B.hook, 0);                          // $289036 move.w D0,($10,A0)
    ram.setU16(a0 + B.sub12, 0xffff);                    // $28903A -- SUB-SPAWN OFF
    ram.setU8(a0 + B.f16, 0x1e);                         // $289040 move.b #$1E
    ram.setU16(a0 + B.delay, 0);                         // $289046 ($18,A0)
    ram.setU16(a0 + B.speed, 0);                         // $28904A ($1a,A0) -- w
    ram.setU8(a0 + B.f1c, 0);                            // $28904E move.b D0,($1c,A0)
    ram.setU8(a0 + B.f1d, 0x1e);                         // $289052 move.b #$1E
    ram.setU16(a0 + B.bucket, 0);                        // $289058 ($1e,A0)
    ram.setU32(a0 + B.fricDelta, 0);                     // $28905E ($22,A0)
    ram.setU32(a0 + B.nudge, 0);                         // $289062 ($26,A0)
    ram.setU32(a0 + B.vel, 0);                           // $289066 ($34,A0)
    ctx?.effectSpawn?.(d0, siteAddr, a0);
    return a0;                                           // $28906A/$28906E rts
  }
  // $289074's dbra falls through to $289078 -- THE POOL IS FULL.
  ctx?.unportedLog?.note(0x289078, `$289004 found NO FREE SLOT in pool B's `
    + `${POOL_B.slots} and returned THE BIT BUCKET $81C8B2 for kind `
    + `$${d0.toString(16).toUpperCase()}. The caller writes its fields into a `
    + `slot nothing drives and CANNOT TELL -- there is no carry and no zero `
    + `return. This is the event W33 4 says must be counted rather than `
    + `assumed impossible. Site $${siteAddr.toString(16).toUpperCase()}`);
  return POOL_B.bitBucket;
}

// ========================= $288E20, THE DESCRIPTOR WALKER ===================
//
//   288e20: movea.l ($2a,A6),A1
//   288e24: move.l (A1),D0 / bpl $288e48   <- POSITIVE = a stream address, STOP
//   288e2a: move.w (A1)+,D0
//   288e2c: cmpi.w #$FFFF,D0 / bne $288e3e
//   288e34: move.w (A1)+,($e,A6)           <- the SIZE escape: w/h then the two
//   288e38: move.l (A1)+,($6,A6)              sprite offset words.  8 bytes.
//   288e3c: bra $288e24
//   288e3e: addq.w #2,A1                   <- the NUDGE escape: skip a word,
//   288e40: move.l (A1)+,D1                   then add a LONG to the position.
//   288e42: add.l D1,($2,A6)                  8 bytes.
//   288e48: move.l A1,($2a,A6)             <- the cursor stops ON the stream
//
// Both commands are 8 bytes, so a descriptor list is 4-byte stream addresses
// interleaved with 8-byte negative-tagged commands, walked in LOCKSTEP with the
// duration list: one stream per duration word.
// [M] verified end to end on kind 0: `$221740` = `FFFF0618 FA00FD00` (w/h
// $0618, offsets $FA00FD00), then 12 longwords `$21F344..$21F688` step $4C;
// `$221778` = 12 words of $0000 then $FFFF.  Both lists end at 12.
//
// **BOTH ARMS ARE EXERCISED, and W54 nearly claimed otherwise.**  [M] the 23
// distinct scripts hold 31 SIZE escapes and 27 NUDGE escapes, and nine of the
// eleven kinds this port's death arms can pass carry at least one nudge (all
// but `$1` and `$2`).  The nudge LOOKED unexercised because no list OPENS with
// it -- it appears mid-list, which no "does entry 0 use it" check can see.

/** `$288E20` -- consume every escape command at the cursor, leaving it on the
 *  next STREAM ADDRESS.  Mutates `($e,A6)`, `($6,A6)` and `($2,A6)`. */
export function walkDescriptor288E20(ram, rom, a6) {
  let a1 = ram.u32(a6 + B.descCursor);                   // $288E20 movea.l
  for (let guard = 0; ; guard++) {
    const d0 = rom.u32(a1);                              // $288E24 move.l (A1),D0
    if ((d0 & 0x80000000) === 0) break;                  // $288E26 bpl $288E48
    if (guard > 64) {
      unreached(0x288e24, `$288E20's descriptor walk consumed 64 escape `
        + `commands without reaching a stream address, at `
        + `$${a1.toString(16).toUpperCase()}. Every list in $221740..$222618 `
        + `is [M] at most 36 cells, so the cursor is not in the script data`);
    }
    if (rom.u16(a1) === 0xffff) {                        // $288E2C cmpi.w #$FFFF
      ram.setU16(a6 + B.size, rom.u16(a1 + 2));          // $288E34 move.w (A1)+
      ram.setU32(a6 + B.offs, rom.u32(a1 + 4));          // $288E38 move.l (A1)+
    } else {                                             // $288E3E addq.w #2,A1
      const d1 = rom.u32(a1 + 4);                        // $288E40 move.l (A1)+,D1
      ram.setU32(a6 + B.pos, (ram.u32(a6 + B.pos) + d1) >>> 0); // $288E42 add.l
    }
    a1 += 8;
  }
  ram.setU32(a6 + B.descCursor, a1);                     // $288E48 move.l A1,($2a,A6)
}

// ================================ THE DRIVER ================================
//
// `$288E4E`, type-5 call #5.  418 B.  `move.w #$4F,D7` + `dbra` = **80 SLOTS
// EVERY FRAME, UNCONDITIONALLY** -- there is no live-count shortcut, and
// `$81C8EA` is RE-COUNTED from zero each frame (`$288E58 clr.w`, `$288E74
// addq.w #1` per live slot).  A free slot costs a `dbra` here, unlike pool E's
// driver, so the walk cannot run off the end.
//
// THREE SEMANTICS A TIDY PORT GETS WRONG:
//
//  1. **THE COUNT EXCLUDES SPAWN-DELAYED RECORDS.**  `$288E74 addq.w #1` is
//     BELOW `$288E64 tst.w ($18,A6) / beq $288E74`, so a record still counting
//     down its delay is live, occupies a slot, and is NOT in `$81C8EA`.  A
//     census that trusts the count word alone under-reports the pool -- which is
//     why this wave's census scans all 80 slots as well.
//  2. **THE OFF-SCREEN CULL IS THE MAIN CONSUMER, and it is two carry tests on
//     one longword.**  `$288F6C addi.w #$1000 / $288F70 addi.w #-$5800` on the
//     SHORT axis and `$288F7A addi.w #$1000 / $288F7E addi.w #$7000` on the LONG
//     axis after a `swap`; only the SECOND `addi` of each pair is branched on.
//     A port that frees only on the script's `$FFFF` terminator still leaks on
//     a fast-moving effect.
//  3. **THE LASER INTERLOCK.**  `$288FBC lea $811F72,A0 / tst.w (A0) / bpl` --
//     while the beam's record word is NEGATIVE, the effect is emitted only on
//     frames where `$80390A & 1`.  Effects FLICKER AT HALF RATE while the laser
//     is on, and the record still MOVES and ANIMATES on the skipped frames.
//     `$811F72` is `37-recon-laser`'s own record and `src/laser.js` drives it.

/**
 * `$288E4E` -- step and emit the whole 80-slot effect pool, once per frame.
 * @returns {{live:number, emitted:number, freed:number, culled:number,
 *            delayed:number, subSpawned:number}} telemetry; the ROM returns none.
 */
export function runEffectDriver(ram, rom, ctx) {
  ram.setU16(POOL_B.count, 0);                           // $288E58 clr.w $81C8EA
  let live = 0, emitted = 0, freed = 0, culled = 0, delayed = 0, subSpawned = 0;
  const laserOn = (ram.u16(POOL_B.laserRec) & 0x8000) !== 0;   // $288FC2 tst.w / bpl
  const parityGate = laserOn && (ram.u16(POOL_B.frameParity) & 1) === 0;

  for (let n = 0; n < POOL_B.slots; n++) {               // $288EEA dbra D7
    const a6 = POOL_B.base + n * POOL_B.stride;          // $288FE6 lea ($38,A6),A6
    if (ram.u16(a6 + B.status) === 0) continue;          // $288E5E tst.w (A6) / beq
    if (ram.u16(a6 + B.delay) !== 0) {                   // $288E64 tst.w ($18,A6)
      ram.setU16(a6 + B.delay, u16(ram.u16(a6 + B.delay) - 1));  // $288E6C subq.w
      delayed++;
      continue;                                          // $288E70 bra $288FE6
    }
    ram.setU16(POOL_B.count, u16(ram.u16(POOL_B.count) + 1));   // $288E74 addq.w #1
    live++;

    // --------------------------------------------- $288E7A: THE FIRST FRAME
    // `bset #6,(A6)` sets Z from the OLD bit, so `bne $288ED0` skips this block
    // on every frame AFTER the first.
    //
    // **IT IS A BYTE OPERATION.**  `08d6 0006` with a MEMORY destination is
    // always byte-sized on the 68000, so the bit it sets is bit 6 of the HIGH
    // byte of the status word -- $8000 becomes $C000, not $8040.  `50-recon`
    // §1.2 says "bit 6" without saying of what, and reading it as bit 6 of the
    // WORD puts the started flag inside THE KIND, where $289004's own
    // `andi.w #$7f` would then strip it and the script would reload every frame.
    if ((ram.u8(a6 + B.status) & 0x40) === 0) {          // $288E7A bset #$6 / bne
      ram.setU8(a6 + B.status, ram.u8(a6 + B.status) | 0x40);
      const kind = ram.u16(a6 + B.status) & 0xff;        // $288E82/$288E84
      // $288E8E bclr #$7,D1 / beq $288E9C -- Z comes from the OLD bit 7, so
      // bit 7 SET picks table B.  (`bclr` also strips it, which is what makes
      // the index 0..$21 rather than $80..$A1.)
      const tbl = (kind & 0x80) ? POOL_B.tableB : POOL_B.tableA;
      const d1 = (kind & 0x7f) << 3;                     // $288E9C lsl.w #3,D1
      if ((kind & 0x7f) > POOL_B.kindMax) {
        unreached(0x288e9e, `$288E9E movea.l ($4,A1,D1.w),A2 -- a LIVE effect `
          + `record carries kind $${kind.toString(16).toUpperCase()}, whose `
          + `index ${kind & 0x7f} is past the ${POOL_B.tableEntries}-entry `
          + `script table $${tbl.toString(16).toUpperCase()}. $289004 range-`
          + `checks this and returns the bit bucket, so a record holding it `
          + `means something wrote the status word behind the allocator`);
      }
      const durList = rom.u32(tbl + d1 + 4);             // $288E9E movea.l ($4,A1,D1.w)
      ram.setU16(a6 + B.cell, u16(rom.u16(durList) + 1)); // $288EA2/$288EA6 +1
      ram.setU32(a6 + B.durCursor, durList + 2);         // $288EAA move.l A2,($2e,A6)
      ram.setU32(a6 + B.descCursor, rom.u32(tbl + d1));  // $288EAE move.l (A1,D1.w)
      walkDescriptor288E20(ram, rom, a6);                // $288EB4 bsr $288E20
      const at = ram.u32(a6 + B.descCursor);             // $288EB8 movea.l ($2a,A6)
      ram.setU32(a6 + B.descriptor, rom.u32(at));        // $288EBC move.l (A2)+,($a,A6)
      ram.setU32(a6 + B.descCursor, at + 4);             // $288EC0 move.l A2,($2a,A6)
      // $288EC4..$288ECC: the ONE-SHOT position delta, a full 32-bit add.
      ram.setU32(a6 + B.pos,
        (ram.u32(a6 + B.pos) + ram.u32(a6 + B.nudge)) >>> 0);
    }

    // ------------------------------------- $288ED0: THE POOL-D SUB-SPAWN
    if (subSpawn288ED0(ram, ctx, a6)) subSpawned++;

    // $288F00: the SCROLL, subtracted from the SHORT axis (the low word).
    ram.setU16(a6 + B.pos + 2,
      u16(ram.u16(a6 + B.pos + 2) - ram.u16(POOL_B.scroll)));   // $288F06 sub.w

    // $288F0A tst.w ($10,A6) / beq -- `$24179E`, the per-element scroll
    // compensation, on A6 DIRECTLY.  (`src/movement.js scrollCompensate` and
    // `src/background.js elemScrollComp` are the same six instructions wrapped
    // for an enemy record and for a background element; the effect pool calls
    // the raw form, so it is written out here rather than bent to fit either.)
    if (ram.u16(a6 + B.hook) !== 0) {                    // $288F0A / $288F12 jsr
      if (ram.u16(POOL_B.bgFreeze) === 0) {              // $24179E tst.w $8130D2
        const hi = ram.u32(POOL_B.scrollB03C) >>> 16;    // $2417A8 move.l / swap
        ram.setU16(a6 + B.pos,
          u16(i16(ram.u16(a6 + B.pos)) + i16(hi)));      // $2417B0 add.w D0,($2,A6)
      }
    }

    // $288F18: SPEED -> VELOCITY, once.  D0 = ($1a,A6) the SPEED INDEX, D1 =
    // ($1b,A6) the ANGLE BYTE -- `50-recon` §1.2 names these the other way
    // round.  `$241D34` is `MoveTables.shotVector`, ported since wave 8, and it
    // throws by address for a speed index outside the exported level set.
    const spd = ram.u8(a6 + B.speed);                    // $288F1A move.b ($1a,A6)
    if (spd !== 0) {                                     // $288F1E beq $288F3A
      const ang = ram.u8(a6 + B.angle);                  // $288F24 move.b ($1b,A6)
      const v = ctx.tables.shotVector(spd, ang);         // $288F28 jsr $241D34
      ram.setU16(a6 + B.vel, u16(v.dy));                 // $288F2E move.w D2,($34,A6)
      ram.setU16(a6 + B.vel + 2, u16(v.dx));             // $288F32 move.w D3,($36,A6)
      ram.setU8(a6 + B.speed, 0);                        // $288F36 clr.b ($1a,A6)
    }

    // $288F3A: FRICTION.  A non-zero delta arms a countdown; on its borrow the
    // delta is SUBTRACTED from the velocity, high word from high word.
    const fric = ram.u32(a6 + B.fricDelta);              // $288F3A move.l ($22,A6)
    if (fric !== 0) {                                    // $288F3E beq $288F5A
      const c = ram.u8(a6 + B.fricCtr);                  // $288F42 subq.b #1,($20,A6)
      ram.setU8(a6 + B.fricCtr, (c - 1) & 0xff);
      if (c === 0) {                                     // $288F46 bcc $288F5A
        ram.setU8(a6 + B.fricCtr, ram.u8(a6 + B.fricReload));    // $288F4A
        ram.setU16(a6 + B.vel + 2,
          u16(ram.u16(a6 + B.vel + 2) - (fric & 0xffff)));       // $288F50 sub.w
        ram.setU16(a6 + B.vel,
          u16(ram.u16(a6 + B.vel) - (fric >>> 16)));             // $288F54/$288F56
      }
    }

    // $288F5A: position += velocity, as TWO word adds (not one long add), so a
    // carry out of the short axis never reaches the long axis.
    const vel = ram.u32(a6 + B.vel);                     // $288F5A move.l ($34,A6)
    ram.setU16(a6 + B.pos + 2, u16(ram.u16(a6 + B.pos + 2) + (vel & 0xffff)));
    ram.setU16(a6 + B.pos, u16(ram.u16(a6 + B.pos) + (vel >>> 16)));

    // $288F68: THE OFF-SCREEN CULL.  Only the SECOND `addi.w` of each pair is
    // branched on, so the window is `(v + $1000) & $FFFF < $5800` on the short
    // axis and `< $9000` on the long axis.
    const shortAxis = u16(ram.u16(a6 + B.pos + 2) + 0x1000);     // $288F6C
    const longAxis = u16(ram.u16(a6 + B.pos) + 0x1000);          // $288F7A
    if (shortAxis + 0xa800 > 0xffff || longAxis + 0x7000 > 0xffff) {
      ram.setU16(a6 + B.status, 0);                      // $288F9C clr.w (A6)
      freed++; culled++;
      continue;                                          // $288F9E bra $288FE6
    }

    // $288F86: THE ANIMATION.  `subq.w #1,($32,A6) / bpl` -- advance on the
    // BORROW, i.e. one frame AFTER the cell counter reaches zero.
    const cell = i16(ram.u16(a6 + B.cell));              // $288F86 subq.w #1
    ram.setU16(a6 + B.cell, u16(cell - 1));
    if (cell - 1 < 0) {                                  // $288F8A bpl $288FBC
      const cur = ram.u32(a6 + B.durCursor);             // $288F8E movea.l ($2e,A6)
      const d0 = rom.u16(cur);                           // $288F92 move.w (A0)+,D0
      if (d0 === 0xffff) {                               // $288F94 cmpi.w #$FFFF
        ram.setU16(a6 + B.status, 0);                    // $288F9C clr.w (A6)
        freed++;
        continue;                                        // THE SCRIPT'S OWN END
      }
      ram.setU16(a6 + B.cell, d0);                       // $288FA2 move.w D0,($32,A6)
      ram.setU32(a6 + B.durCursor, cur + 2);             // $288FA6 move.l A0,($2e,A6)
      walkDescriptor288E20(ram, rom, a6);                // $288FAA bsr $288E20
      const at = ram.u32(a6 + B.descCursor);             // $288FAE movea.l ($2a,A6)
      ram.setU32(a6 + B.descriptor, rom.u32(at));        // $288FB2/$288FB4
      ram.setU32(a6 + B.descCursor, at + 4);             // $288FB8 move.l A0,($2a,A6)
    }

    // $288FBC: THE LASER INTERLOCK, then $288FD6: THE EMIT.
    if (parityGate) continue;                            // $288FD2 beq $288FE6
    const sel = ram.u16(a6 + B.bucket);                  // $288FD6 move.w ($1e,A6)
    const stub = EMIT_STUB[sel];
    if (stub === undefined) {                            // $288FDA..$288FE4
      unreached(POOL_B.emitTable, `pool B's emitter selector ($1e,A6) = `
        + `$${sel.toString(16).toUpperCase()} is a raw BYTE offset into the `
        + `FIVE-entry table $288FF0 and only 0, 4, 8, $C and $10 are entries. `
        + `The longword at $289004 is \`48E7C07E\` -- $289004's own movem.l, `
        + `CODE -- so the board would jsr into an instruction. Record at `
        + `$${a6.toString(16).toUpperCase()}, kind `
        + `$${(ram.u16(a6 + B.status) & 0xff).toString(16).toUpperCase()}`);
    }
    enqueueThroughStub(ram, rom, stub, a6);              // $288FE4 jsr (A0)
    emitted++;
  }
  return { live, emitted, freed, culled, delayed, subSpawned };
}

function poolDTemplateInit(ram, rom, a0, templateIndex) {
  let list = ram.u32(a0 + D.list);
  if (templateIndex === 0) {
    const pick = drawByte2431F4(ram, rom);
    list = rom.u32(0x2897d0 + pick * 4);
    ram.setU32(a0 + D.list, list);
  }
  const pick = drawByte2431F4(ram, rom);
  const delta = ((pick + 1) << 5) - 4;
  ram.setU16(a0 + D.cursor, u16(ram.u16(a0 + D.cursor) - delta));
  ram.setU32(a0 + D.descriptor, rom.u32(list + delta));
}

/** `$289658`, initialize one pool-D record from its selected ROM template. */
function fillSubEffect289658(ram, rom, ctx, a0, parent, packed, multi) {
  let select = (packed >>> 8) & 0xff;
  let mode = select >= 0x80 ? select - 0x100 : select;
  let status = 0x8000;
  if (mode < 0) {
    select = (~select) & 0xff;
    const oldBit = select & 1;
    select &= 0xfe;
    if (oldBit !== 0) status |= 0x0400;
    const m = (~select) & 0xff;
    mode = m >= 0x80 ? m - 0x100 : m;
  }
  const templateIndex = select & 0x1c;
  if (templateIndex > 0x10) {
    unreached(0x289680, `pool D template selector $${templateIndex.toString(16)} `
      + `is past the five-entry pointer table at $2897FC`);
  }
  const template = rom.u32(0x2897fc + templateIndex);
  ram.setU16(a0 + D.status, status);
  ram.setU32(a0 + D.pos, ram.u32(parent + B.pos));
  if (multi) {
    const jitter = drawLong24397A(ram, rom);
    ram.setU16(a0 + D.pos + 2,
      u16(ram.u16(a0 + D.pos + 2) + (jitter & 0xffff)));
  }
  ram.setU32(a0 + D.offs, rom.u32(template));
  let bucket = (packed >>> 16) & 0xff00;
  if (drawSigned242FDE(ram, rom) === 0) bucket |= 0x1000;
  bucket = ((bucket << 8) & 0xff);
  ram.setU16(a0 + D.bucket, bucket);
  ram.setU8(a0 + D.attr, 0);
  ram.setU8(a0 + D.attr + 1, 0x1e);
  ram.setU16(a0 + D.size, rom.u16(template + 4));
  ram.setU16(a0 + D.mode, mode);
  ram.setU32(a0 + D.list, rom.u32(template + 6));
  ram.setU16(a0 + D.drift, rom.u16(template + 10));
  ram.setU16(a0 + D.lifetime, rom.u16(template + 12));
  const wrap = rom.u16(template + 14);
  ram.setU16(a0 + D.cursor, wrap);
  ram.setU16(a0 + D.wrap, wrap);
  ram.setU8(a0 + D.speed, (drawWord242EC2(ram, rom) & 0x0f) + 0x1a);
  ram.setU16(a0 + D.hold, u16(drawSigned242CAC(ram, rom) * 4 + 0x30));
  poolDTemplateInit(ram, rom, a0, templateIndex);

  let angle;
  if (mode < 0) {
    ram.setU8(a0 + D.drift, ram.u8(a0 + D.drift + 1) + 0x10);
    let spread = drawWord242EC2(ram, rom) & 0x0f;
    if ((ram.u8(a0 + D.status) & 0x04) !== 0) {
      spread >>>= 1;
      ram.setU8(a0 + D.speed, ram.u8(a0 + D.speed) - 8);
    }
    ram.setU8(a0 + D.speed, ram.u8(a0 + D.speed) + spread);
    ram.setU8(a0 + D.auxAngle, ram.u8(a0 + D.speed) + 0x20);
    const random = drawByte242B3C(ram, rom);
    angle = (((random << 24) >> 24) >> 2) + (packed & 0xff);
  } else {
    angle = drawByte242E24(ram, rom);
    if (angle > 0x15 && angle < 0x2b) angle = (angle + 0x20) & 0x3f;
    const modeByte = ram.u8(a0 + D.mode + 1);
    ram.setU8(a0 + D.mode + 1, modeByte & ~0x20);
    if ((modeByte & 0x20) !== 0)
      angle = ((((angle + 0x16) & 0x3f) >> 1) + 0x15) & 0xff;
  }
  angle &= 0xff;
  if (angle >= 0x20) ram.setU8(a0 + D.attr, ram.u8(a0 + D.attr) | 0x20);
  ram.setU8(a0 + D.angle, angle * 4);
  ctx?.subEffectSpawn?.(a0, templateIndex, packed);
}

/** `$289098`, allocate and fill one or more pool-D debris records. */
export function spawnSubEffect289098(ram, rom, ctx, packed, parent,
  siteAddr = 0x289098) {
  const requested = ((packed >>> 16) & 0xff) + 1;
  const limit = ram.u16(0x813098) !== 0 || ram.u16(0x81308c) === 0
    ? POOL_D.slotsNarrow : POOL_D.slots;
  let allocated = 0;
  for (let n = 0; n < requested; n++) {
    let slot = -1;
    for (let i = 0; i < limit; i++) {
      const candidate = POOL_D.base + i * POOL_D.stride;
      if (ram.u16(candidate + D.status) === 0) { slot = candidate; break; }
    }
    if (slot < 0) {
      ctx?.subEffectDrop?.(requested - allocated, siteAddr);
      break;
    }
    fillSubEffect289658(ram, rom, ctx, slot, parent, packed, requested > 1);
    ram.setU16(POOL_D.count, u16(ram.u16(POOL_D.count) + 1));
    allocated++;
  }
  return allocated;
}

/**
 * `$288ED0..$288EFA` -- the one-shot pool-D sub-spawn.
 *
 *   288ed0: move.w ($12,A6),D0 / bmi $288f00     <- $FFFF = disarmed, skip all
 *   288ed8: move.w ($1e,A6),D1 / lsl.w #8,D1 / or.w D1,D0
 *   288ee0: move.w ($1c,A6),-(A7)               <- PUSHED across the call
 *   288ee4: swap D0 / move.w ($14,A6),D0        <- D0 = (bucket<<8|param12) : ($14)
 *   288eea: move.b ($16,A6),($1d,A6)
 *   288ef0: jsr $289098                          <- allocate pool-D debris
 *   288ef6: move.w (A7)+,($1c,A6)               <- POPPED
 *   288efa: move.w #$FFFF,($12,A6)              <- ONE-SHOT: never again
 *
 * [M] `($12,A6)` is a COUNT MINUS ONE, not a flag: `$289098` does
 * `andi.l #$FF,D3 / addi.l #-$10000,D3` and then `dbra D3`, so 0 asks for ONE
 * record and 1 asks for TWO.  Six of type `$80`'s death-arm sites write 1.
 *
 * @returns {boolean} whether this record requested its one-shot sub-spawn.
 */
export function subSpawn288ED0(ram, ctx, a6) {
  const d0 = ram.u16(a6 + B.sub12);                      // $288ED0 move.w ($12,A6)
  if ((d0 & 0x8000) !== 0) return false;                 // $288ED4 bmi $288F00
  const param = ram.u16(a6 + B.sub14);                   // $288EE6 move.w ($14,A6)
  ram.setU8(a6 + B.f1d, ram.u8(a6 + B.f16));             // $288EEA move.b ($16,A6)
  const packed = ((((ram.u16(a6 + B.bucket) << 8) | (d0 & 0xff)) << 16)
    | param) >>> 0;
  spawnSubEffect289098(ram, ctx.rom, ctx, packed, a6, 0x288ef0);
  ram.setU16(a6 + B.sub12, 0xffff);                      // $288EFA -- the one-shot
  return true;
}

function poolCDistance(y0, x0, y1, x1) {
  let dy = u16(y0 - y1);
  if (i16(dy) < 0) dy = u16(-dy);
  dy = u16(dy - (dy >>> 2));
  let dx = u16(x0 - x1);
  if (i16(dx) < 0) dx = u16(-dx);
  if (dy < dx) [dy, dx] = [dx, dy];
  return u16(dy + (dx >>> 1));
}

function poolCCollision289C54(ram, slot) {
  if (ram.u16(0x813092) === 4 && (ram.u8(0x8130f8) & 0x40) !== 0)
    return true;

  const y = ram.u16(slot + C.pos), x = ram.u16(slot + C.pos + 2);
  ram.setU16(slot + C.pos, u16(y + 0x4400));            // exclude candidate itself
  const narrow = ram.u16(0x813098) !== 0 || ram.u16(0x81308c) === 0;
  const limit = narrow ? POOL_C.slotsNarrow : POOL_C.slots;
  let sameX = 2, rankKind4 = 10;
  ram.setU16(0x81d390, sameX);
  ram.setU16(0x81d392, rankKind4);
  for (let n = 0; n < limit; n++) {
    const q = POOL_C.base + n * POOL_C.stride;
    if (ram.u16(q + C.status) === 0) continue;
    if (ram.u16(q + C.pos + 2) === x) {
      if (sameX === 0) { ram.setU16(slot + C.status, 0); return false; }
      sameX--; ram.setU16(0x81d390, sameX);
    }
    const kind4 = ram.u16(0x813098) !== 0
      && (ram.u16(q + C.status) & 0x3c) === 4;
    if (kind4) {
      rankKind4--; ram.setU16(0x81d392, rankKind4);
      if (rankKind4 < 0) { ram.setU16(slot + C.status, 0); return false; }
    }
    const distance = poolCDistance(ram.u16(q + C.pos),
      ram.u16(q + C.pos + 2), y, x);
    if (distance < (kind4 ? 0x0a00 : 0x0800)) {
      ram.setU16(slot + C.status, 0); return false;
    }
  }
  ram.setU16(slot + C.pos, y);
  ram.setU16(slot + C.pos + 2, x);
  return true;
}

/**
 * `$289B50`, pool-C's absolute-position allocator.
 *
 * W419 -- THE GUARD'S DOMAIN, TAKEN FROM THE CARTRIDGE AND NOT FROM ONE CALLER.
 * `$289DD2 andi.w #$3C,D3` / `$289DDC movea.l (0,A2,D3.w),A2` (and `$289C3E` /
 * `$289C48`, the byte-identical pair in `$289AF4`'s fill) index `$289DEA` by
 * `kind & $3C` as a BYTE offset into a table of longs, so the table's own reach
 * is what decides which kinds exist. It holds
 *
 *   +$00 $00289E0A   +$04 $00289E26   +$08 $00289E42   +$0C $00289E5E
 *   +$10 $00289E7A   +$14 $00289E7A   +$18 $00289E7A   +$1C $00289E7A
 *
 * and `$289E7A` IS NOT A TEMPLATE -- it is the kind-0 template's own list 0
 * (`$289E0A+$10`). Its first word is `$0022`, bit 15 CLEAR, so a record filled
 * from it is born dead and `$289B80` never steps it. Four entries are real, and
 * `$289E7A` x4 is padding to a power of two.
 *
 * The cartridge says the same thing from the caller side. `$267F48 jsr $259C42`
 * / `$267F4E cmpi.w #$3,D0` / `$267F52 bgt` / `$267F56 tst.w D0` / `$267F58 bmi`
 * / `$267F5C add.w D0,D0` / `$267F5E add.w D0,D0` clamps a random draw to 0..3
 * and quadruples it, so that one call site alone passes 0, 4, 8 and $C -- the
 * whole domain and nothing above it.
 *
 * A whole-image scan for the two encoded targets finds EIGHT call sites and no
 * more: `$264830` is the only `jsr $289B50` (moveq #$4); the other seven are
 * `jsr $289AF4` -- `$2673E6 $26821E $2688BA` (moveq #$4), `$27664E $2774BC
 * $2777D6` (moveq #$8) and `$267F62`, the clamped draw above. Kind $C also
 * arrives through the THIRD allocator `$289B22`, which is not ported.
 */
export function spawnPoolC289B50(ram, rom, ctx, kind, bucket, position,
  siteAddr = 0x289b50) {
  if ((kind & 0x3c) > 0x0c) {
    unreached(siteAddr, `pool C absolute allocator kind $${kind.toString(16)} `
      + `indexes $289DEA at +$${(kind & 0x3c).toString(16)}, past the four real `
      + `templates; +$10..+$1C all hold $289E7A, which is kind 0's list 0 and `
      + `whose first word $0022 has bit 15 clear -- a record born dead`);
  }
  const narrow = ram.u16(0x813098) !== 0 || ram.u16(0x81308c) === 0;
  const limit = narrow ? POOL_C.slotsNarrow : POOL_C.slots;
  let slot = -1;
  for (let n = 0; n < limit; n++) {
    const q = POOL_C.base + n * POOL_C.stride;
    if (ram.u16(q + C.status) === 0) { slot = q; break; }
  }
  if (slot < 0) { ctx?.poolCDrop?.(kind, siteAddr); return 0; }

  const template = rom.u32(POOL_C.templateTable + (kind & 0x3c));
  ram.setU8(slot + C.marker, 0x1f);
  ram.setU16(slot + C.status, rom.u16(template));
  ram.setU32(slot + C.pos, position);
  if (!poolCCollision289C54(ram, slot)) {
    ctx?.poolCDrop?.(kind, siteAddr); return 0;
  }

  ram.setU32(slot + C.offs, rom.u32(template + 2));
  ram.setU8(slot + C.attr, drawSigned242FDE(ram, rom) === 0 ? 0x20 : 0);
  ram.setU16(slot + C.size, rom.u16(template + 6));
  ram.setU16(slot + C.template18, rom.u16(template + 8));
  ram.setU8(slot + C.palette, 0x1e);
  const cursor = drawByte24311A(ram, rom) * 4;
  ram.setU16(slot + C.cursor, cursor);
  ram.setU16(slot + C.wrap, rom.u16(template + 10));
  ram.setU8(slot + C.bucket, bucket);
  ram.setU16(slot + C.cull, rom.u16(template + 12));
  const selector = i16(rom.u16(template + 14));
  const listPick = selector < 0 ? drawSigned242FDE(ram, rom)
    : selector === 0 ? drawByte24311A(ram, rom) : drawByte2431F4(ram, rom);
  const list = rom.u32(template + 16 + listPick * 4);
  ram.setU32(slot + C.list, list);
  ram.setU32(slot + C.descriptor, rom.u32(list + cursor));
  ram.setU8(slot + C.marker, 0);
  ram.setU16(POOL_C.count, u16(ram.u16(POOL_C.count) + 1));
  ctx?.poolCSpawn?.(slot, kind, bucket);
  return slot;
}

/**
 * `$289AF4` -- the SAME scan and the SAME fill as `$289B50`. There are THREE
 * allocators into pool C (`$289AF4`, `$289B22`, `$289B50`) and their scans are the
 * same fourteen instructions on the same $81CDEE table with the same
 * `$813098`/`$81308C` narrow test; they differ only in which fill they branch to.
 * This one is `$289C3A`, and the one thing it does differently is take the
 * position from the CALLER's record -- `$289C50 move.l $2(a6),$2(a0)` -- instead of
 * from a register the caller loaded.
 *
 * The bucket is the caller's own row of `$267FB8`, read as a WORD at
 * `(A0,D1.w)` with D1 = `($1f,A6) * 2` (`$2688AC..$2688B6` and `$268210..$26821A`,
 * which are the same six instructions twice). W234's docket-D3 note: this is the
 * SECONDARY explosion, and it was a counted call at both of its kind-4 sites.
 */
export function spawnPoolC289AF4(ram, rom, ctx, kind, caller, remapTable) {
  const bucket = rom.u16(remapTable + ram.u8(caller + 0x1f) * 2);
  return spawnPoolC289B50(ram, rom, ctx, kind, bucket,
    ram.u32(caller + 0x02), 0x289af4);
}

/** `$289B80`, animate, cull and emit the live pool-C records. */
export function runPoolCDriver(ram, rom, ctx) {
  let remaining = ram.u16(POOL_C.count);
  const initial = remaining;
  let emitted = 0, freed = 0, found = 0;
  if (remaining === 0) return { live: 0, emitted, freed };
  const animate = (ram.u16(0x80390c) & 1) === 0;
  for (let n = 0; n < POOL_C.slots && remaining > 0; n++) {
    const slot = POOL_C.base + n * POOL_C.stride;
    if ((ram.u16(slot + C.status) & 0x8000) === 0) continue;
    found++; remaining--;
    if (animate) {
      let cursor = ram.u16(slot + C.cursor);
      ram.setU32(slot + C.descriptor,
        rom.u32(ram.u32(slot + C.list) + cursor));
      cursor = u16(cursor - 4);
      if ((cursor & 0x8000) !== 0) cursor = ram.u16(slot + C.wrap);
      ram.setU16(slot + C.cursor, cursor);
    }
    if (ram.u16(POOL_B.bgFreeze) === 0) {
      ram.setU16(slot + C.pos, u16(ram.u16(slot + C.pos)
        + i16(ram.u16(POOL_B.scrollB03C))));
    }
    ram.setU16(slot + C.pos + 2,
      u16(ram.u16(slot + C.pos + 2) - ram.u16(POOL_B.scroll)));
    if (ram.u16(0x803912) === 0
        && i16(ram.u16(slot + C.pos)) < i16(ram.u16(slot + C.cull))) {
      ram.setU16(slot + C.status, 0);
      ram.setU16(POOL_C.count, u16(ram.u16(POOL_C.count) - 1));
      freed++; continue;
    }
    const selector = ram.u8(slot + C.bucket);
    const stub = EMIT_STUB[selector];
    if (stub === undefined) {
      unreached(0x289c04, `pool C emitter selector $${selector.toString(16)} `
        + `is not one of 0, 4, 8, $C or $10`);
    }
    enqueueThroughStub(ram, rom, stub, slot);
    emitted++;
  }
  if (remaining !== 0) {
    unreached(0x289c0e, `pool C live count ${initial} exceeds the ${found} `
      + `allocated records found in its 30 slots`);
  }
  return { live: initial, emitted, freed };
}

function animateSubEffect289610(ram, rom, a6) {
  let cursor = ram.u16(a6 + D.cursor);
  ram.setU32(a6 + D.descriptor, rom.u32(ram.u32(a6 + D.list) + cursor));
  const speed = ram.u8(a6 + D.speed);
  const steps = speed >= 0x0e ? 4 : speed >= 0x0a ? 2 : 1;
  for (let n = 0; n < steps; n++) {
    cursor = u16(cursor - 4);
    if ((cursor & 0x8000) !== 0) cursor = ram.u16(a6 + D.wrap);
  }
  ram.setU16(a6 + D.cursor, cursor);
}

function freeSubEffect(ram, a6) {
  ram.setU16(a6 + D.status, 0);
  ram.setU16(POOL_D.count, u16(ram.u16(POOL_D.count) - 1));
}

function subEffectInBounds(ram, a6, lowerY = -0x600, upperY = 0x7600) {
  const x = i16(ram.u16(a6 + D.pos + 2));
  const y = i16(ram.u16(a6 + D.pos));
  return x >= -0x400 && x < 0x3c00 && y >= lowerY && y < upperY;
}

/** `$2890F2`, step and emit pool-D secondary debris. */
export function runSubEffectDriver(ram, rom, ctx) {
  let remaining = ram.u16(POOL_D.count);
  const initial = remaining;
  let emitted = 0, freed = 0, found = 0;
  if (remaining === 0) return { live: 0, emitted, freed };

  // This branch runs before ROM replaces inherited A6. A6 still points at
  // pool B's bit bucket, so it deliberately does not clear pool-D statuses.
  if (ram.u16(0x813098) !== 0) {
    for (let n = 0; n < initial; n++) {
      ram.setU16(POOL_B.bitBucket + n * POOL_D.stride, 0);
      ram.setU16(POOL_D.count, u16(ram.u16(POOL_D.count) - 1));
    }
    return { live: initial, emitted, freed: 0, inheritedCleared: initial };
  }

  const d6Negative = i16(u16(-ram.u16(0x803912))) < 0;
  const collisionPhase = ram.u16(0x80390c);
  const d5Negative = ram.u16(0x8130f8) !== 0;
  const frame = ram.u16(0x80390a);

  for (let n = 0; n < POOL_D.slots && remaining > 0; n++) {
    const a6 = POOL_D.base + n * POOL_D.stride;
    if (ram.u8(a6 + D.status) === 0) continue;
    found++;
    remaining--;

    const mode = i16(ram.u16(a6 + D.mode));
    let speed = ram.u8(a6 + D.speed);
    if (mode >= 0) {
      if (speed !== 0) {
        const mask = speed >= 6 && speed <= 8 ? 3 : 1;
        if ((frame & mask) === 0) {
          speed = (speed - 1) & 0xff;
          ram.setU8(a6 + D.speed, speed);
        }
      }
      if (speed !== 0) {
        const v = ctx.tables.shotVector(speed, ram.u8(a6 + D.angle));
        ram.setU16(a6 + D.pos, u16(ram.u16(a6 + D.pos) + v.dy));
        ram.setU16(a6 + D.pos + 2,
          u16(ram.u16(a6 + D.pos + 2) + v.dx - (v.dx >> 2)));
      }
      ram.setU16(a6 + D.pos,
        u16(ram.u16(a6 + D.pos) + speed * 2 - 0x58));
      ram.setU16(a6 + D.pos + 2,
        u16(ram.u16(a6 + D.pos + 2) - ram.u16(POOL_B.scroll)));
      if (!d6Negative && !subEffectInBounds(ram, a6)) {
        freeSubEffect(ram, a6); freed++; continue;
      }
    } else {
      if (!d5Negative && speed > 2) {
        const mask = speed >= 6 && speed <= 8 ? 3 : 2;
        if ((frame & mask) === 0) {
          speed = (speed - 1) & 0xff;
          ram.setU8(a6 + D.speed, speed);
        }
      }
      if (ram.u16(POOL_B.bgFreeze) === 0) {
        const v = ctx.tables.shotVector(speed, ram.u8(a6 + D.angle));
        ram.setU16(a6 + D.pos, u16(ram.u16(a6 + D.pos) + v.dy));
        ram.setU16(a6 + D.pos + 2,
          u16(ram.u16(a6 + D.pos + 2) + v.dx));
      }
      if (!d5Negative) {
        ram.setU16(a6 + D.pos, u16(ram.u16(a6 + D.pos) - 0x20));
        ram.setU16(a6 + D.pos + 2,
          u16(ram.u16(a6 + D.pos + 2) - ram.u16(POOL_B.scroll)));
        if (!d6Negative && !subEffectInBounds(ram, a6)) {
          freeSubEffect(ram, a6); freed++; continue;
        }
      } else {
        ram.setU16(a6 + D.pos,
          u16(ram.u16(a6 + D.pos) - ram.u8(a6 + D.drift)));
        if (!d6Negative && !subEffectInBounds(ram, a6, 0, 0x7000)) {
          freeSubEffect(ram, a6); freed++; continue;
        }
      }
    }

    animateSubEffect289610(ram, rom, a6);
    const hold = ram.u16(a6 + D.hold);
    let shouldEmit = true;
    if (hold !== 0) {
      ram.setU16(a6 + D.hold, u16(hold - 1));
    } else {
      const life = (ram.u8(a6 + D.lifetime + 1) - 1) & 0xff;
      ram.setU8(a6 + D.lifetime + 1, life);
      if (life === 0) {
        freeSubEffect(ram, a6); freed++; continue;
      }
      shouldEmit = collisionPhase !== 0;
    }
    if (!shouldEmit) continue;

    const selector = ram.u16(a6 + D.bucket);
    const stub = EMIT_STUB[selector];
    if (stub === undefined) {
      unreached(0x28921e, `pool D emitter selector $${selector.toString(16)} `
        + `is not one of 0, 4, 8, $C or $10`);
    }
    enqueueThroughStub(ram, rom, stub, a6);
    emitted++;
  }

  if (remaining !== 0) {
    unreached(0x289218, `pool D live count ${initial} exceeds the ${found} `
      + `allocated records found in its 20 slots`);
  }
  return { live: initial, emitted, freed };
}
